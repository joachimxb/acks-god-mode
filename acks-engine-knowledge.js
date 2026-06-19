/* ACKS God Mode — acks-engine-knowledge.js
 * The Knowledge Layer — Wave A (the Lore data layer). Team burst7 (2026-06-19).
 *
 * Spec: Knowledge_Layer_Plan.md (the canonical home; §6 resolutions) + Sages_Knowledge_RAW_Survey.md
 * (the #543 gate, §6 + §16). The #543 gate is CLEARED — this is the implementation of the resolved shape.
 *
 * What it is: a generalized, in-fiction model of WHO KNOWS WHAT. Every creature is a Knower; a Knower's
 * knowledge is a set of Lore items, each possibly partial / stale / false. Two collections:
 *   • campaign.lore[]      (lor-) — first-class FACTS (rumors subsume in Wave B).
 *   • campaign.knowledge[] (knw-) — the per-knower RELATION (character ↔ lore): confidence + provenance,
 *                                   the believed-vs-true link. SECOND-hand only (heard/read/deduced/gossip).
 *
 * Resolved shape (survey §16):
 *   - §16.1 storage = confidence (a `certainty` band, not a bool) + provenance (a `source`); FIRST-hand Lore
 *     is DERIVED from the eventLog (the §528 witness envelope + the shipped characterHistory), not stored.
 *   - §16.2 a collective Knower (faction/domain/settlement) is DERIVED (∪ members), per Architecture §3.3 —
 *     not a third collection (the relation supports a faction-owned record for org-only intel).
 *   - §16.3 the Lore throw is Knowledge (G) + Loremastery (RR p.112/p.110) via the SHIPPED Layer-1 die
 *     (characterProficiencyThrow) — NO new throw machinery; throw quality sets the initial certainty.
 *   - §16.4 rumor migration (loreKind:'rumor') is Wave B; §16.5 propagation: derived first-hand (free)
 *     + an opt-in diffusion tick (DEFERRED — a later wave; this ships the manual single-share).
 *
 * Loads after the core + acks-engine-proficiencies.js (the throw die) + acks-engine.js (characterHistory /
 * setEventContext / newEvent), before player-view. Self-contained: pure reads + setters over a passed
 * campaign; cross-module helpers resolve at CALL time off global.ACKS (the religion-module pattern).
 *
 * Footprint (additive, no migration): blankLore / blankKnowledge live in acks-engine-entities.js; the
 * collections are added to blankCampaign ONLY (read defensively; NOT lazy-injected into migrateCampaign,
 * so templates stay migrate-no-ops). 2 record-only event kinds (lore-learned / lore-shared). No house rule
 * this wave — the data layer is benign always-on core (the Group/Lair precedent); the plan's opt-in
 * `knowledge-tracking` master gate needs a catalogs.js HOUSERULES_REGISTRY entry (out of this lane's
 * bounds) and is a documented follow-up.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // Late-bound namespace (freshest export set; this module loads after the core + proficiencies).
  function _A(){ return global.ACKS || ACKS; }

  // ── constants ──
  const LORE_KINDS        = Object.freeze(['fact','rumor','secret','identity']);
  const LORE_TRUTH_VALUES = Object.freeze(['true','false','partial','unknown']);
  // Confidence bands, low → high (the DF suspicion dimension, NOT a bare true/false). §16.1.
  const CERTAINTY_BANDS   = Object.freeze(['rumored','suspected','probable','certain']);
  const CERTAINTY_RANK    = Object.freeze({ rumored:0, suspected:1, probable:2, certain:3 });
  // Provenance kinds (the DF witness model). 'witnessed' is normally derived (firstHandLore), not stored.
  const LORE_SOURCE_KINDS = Object.freeze(['witnessed','told-by','sage','treatise','deduced','gossip','rumor','gm']);
  // A Knower is a ROLE on any entity (read via predicates), not a kind. v1 supports these knowerKinds.
  const KNOWER_KINDS      = Object.freeze(['character','group','faction','domain','settlement']);

  // ── internal helpers ──
  function _ensureLore(campaign){ if(!campaign) return []; if(!Array.isArray(campaign.lore)) campaign.lore = []; return campaign.lore; }
  function _ensureKnowledge(campaign){ if(!campaign) return []; if(!Array.isArray(campaign.knowledge)) campaign.knowledge = []; return campaign.knowledge; }
  function _currentTurn(campaign){ return (campaign && typeof campaign.currentTurn === 'number') ? campaign.currentTurn : 1; }
  function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }

  function certaintyRank(c){ return (CERTAINTY_RANK[c] != null) ? CERTAINTY_RANK[c] : 0; }
  function higherCertainty(a, b){ return certaintyRank(a) >= certaintyRank(b) ? (a || 'rumored') : b; }
  function _certaintyBelow(c){ return CERTAINTY_BANDS[Math.max(0, certaintyRank(c) - 1)]; }

  // Map a proficiency-throw result → an initial certainty band (acquisition fidelity, RAW §5.1/§16.3):
  // a wide success / nat-20 → certain; comfortable → probable; bare success → suspected; fail/no-throw → rumored.
  function certaintyFromThrow(result){
    if(!result) return 'rumored';
    if(result.success === false) return 'rumored';
    if(result.crit) return 'certain';
    const m = (typeof result.margin === 'number') ? result.margin : 0;
    if(m >= 10) return 'certain';
    if(m >= 5)  return 'probable';
    if(result.success === true || m >= 0) return 'suspected';
    return 'rumored';
  }

  // ── lookups ──
  function findLore(campaign, id){ if(!campaign || !id) return null; return _ensureLore(campaign).find(l => l && l.id === id) || null; }
  function findKnowledge(campaign, id){ if(!campaign || !id) return null; return _ensureKnowledge(campaign).find(k => k && k.id === id) || null; }
  // Facts ABOUT a given entity (the "what is known about X" query).
  function loreOnSubject(campaign, subjectId){
    if(!campaign || !subjectId) return [];
    return _ensureLore(campaign).filter(l => l && Array.isArray(l.subjectIds) && l.subjectIds.includes(subjectId));
  }
  // The STORED (second-hand) Knowledge records a Knower holds.
  function knowledgeRecordsForKnower(campaign, knowerKind, knowerId){
    if(!campaign || !knowerId) return [];
    return _ensureKnowledge(campaign).filter(k => k && k.knowerId === knowerId
      && (!knowerKind || k.knowerKind === knowerKind) && k.status !== 'forgotten');
  }
  function knowledgeRecord(campaign, knowerKind, knowerId, loreId){
    if(!campaign || !knowerId || !loreId) return null;
    return _ensureKnowledge(campaign).find(k => k && k.knowerId === knowerId
      && k.knowerKind === (knowerKind || 'character') && k.loreId === loreId && k.status !== 'forgotten') || null;
  }
  // Reverse index — which Knowers hold a STORED record of this lore (first-hand is per-event-derived,
  // not cheaply reversible; v1 reverse-indexes the stored second-hand records).
  function loreKnowers(campaign, loreId){
    if(!campaign || !loreId) return [];
    return _ensureKnowledge(campaign).filter(k => k && k.loreId === loreId && k.status !== 'forgotten')
      .map(k => ({ knowerKind: k.knowerKind, knowerId: k.knowerId, certainty: k.certainty, source: k.source, knowledgeId: k.id }));
  }
  // A Knower is a role on any entity (always true for an entity with an id). §16/Architecture §2.6.
  function isKnower(entity){ return !!(entity && typeof entity === 'object' && entity.id); }

  // First-hand Lore — DERIVED from the eventLog (§16.1). A Knower's first-hand knowledge = the events
  // it witnessed/participated in (the shipped characterHistory accessor over the §528 relatedEntities
  // envelope), MINUS the layer's own lore-learned/lore-shared meta-events. Like hex/entity histories.
  function firstHandLore(campaign, knowerId){
    const A = _A();
    if(!campaign || !knowerId || typeof A.characterHistory !== 'function') return [];
    const META = new Set(['lore-learned', 'lore-shared']);
    const out = [];
    for(const entry of A.characterHistory(campaign, knowerId)){
      const ev = (entry && entry.event) || entry;
      if(!ev || META.has(ev.kind)) continue;
      const ctx = ev.context || {};
      out.push({
        firstHand: true,
        eventId: ev.id,
        kind: ev.kind,
        certainty: 'certain',  // you were there
        text: (entry.result && entry.result.narrativeSummary) || ev.kind,
        learnedAtTurn: (ev.appliedAtTurn != null) ? ev.appliedAtTurn : ev.targetTurn,
        learnedAtHexId: ctx.primaryHexId || null
      });
    }
    return out;
  }

  // The full set a Knower knows = STORED second-hand records ∪ DERIVED first-hand events. Each row
  // carries { firstHand, lore?, knowledge?, certainty, source?, ... }. A non-character knower
  // (faction/domain/settlement) has no characterHistory → second-hand only.
  function loreKnownBy(campaign, knowerKind, knowerId, opts){
    opts = opts || {};
    const out = [];
    for(const k of knowledgeRecordsForKnower(campaign, knowerKind, knowerId)){
      out.push({ firstHand: false, knowledge: k, lore: findLore(campaign, k.loreId), loreId: k.loreId,
        certainty: k.certainty, source: k.source, believedText: k.believedText });
    }
    if((knowerKind === 'character' || !knowerKind) && !opts.secondHandOnly){
      for(const fh of firstHandLore(campaign, knowerId)) out.push(fh);
    }
    return out;
  }

  // A collective Knower (faction/domain/settlement) knows what its MEMBERS know — DERIVED (the
  // reverse-index rule, Architecture §3.3) — plus any record FILED to the collective itself (a spy's
  // org-only intel: a Knowledge record whose knowerKind is the collective). v1 takes an explicit member
  // list; the caller resolves membership.
  function loreKnownByCollective(campaign, collectiveKind, collectiveId, memberIds){
    const seen = new Set(); const out = [];
    const push = row => {
      const key = row.firstHand ? ('fh:' + row.eventId) : ('kn:' + (row.knowledge && row.knowledge.id));
      if(!seen.has(key)){ seen.add(key); out.push(row); }
    };
    for(const row of loreKnownBy(campaign, collectiveKind, collectiveId, { secondHandOnly: true })) push(row);
    for(const mid of (Array.isArray(memberIds) ? memberIds : [])){
      for(const row of loreKnownBy(campaign, 'character', mid)) push(row);
    }
    return out;
  }

  // The history of a Lore item — every eventLog entry tagging it (the derived-history pattern; §8.9).
  function loreHistory(campaign, loreId){
    if(!campaign || !loreId || !Array.isArray(campaign.eventLog)) return [];
    return campaign.eventLog.filter(entry => {
      const ev = (entry && entry.event) || entry;
      const rels = ev && ev.context && ev.context.relatedEntities;
      return Array.isArray(rels) && rels.some(r => r && r.kind === 'lore' && r.id === loreId);
    });
  }

  // ── event emit (record-only; populates Event.context per the §8.9 mandate) — mirrors _recordReligionEvent ──
  function _recordLoreEvent(campaign, kind, payload, opts){
    const A = _A(); opts = opts || {};
    if(typeof A.newEvent !== 'function') return null;
    const ev = A.newEvent(kind, {
      submittedBy: opts.submittedBy || 'engine',
      targetTurn: _currentTurn(campaign),
      cadence: opts.cadence || 'monthly-turn',
      payload: payload || {}
    });
    if(opts.context && typeof A.setEventContext === 'function') A.setEventContext(ev, opts.context);
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(campaign);
    ev.appliedAtDay = campaign.currentDayInMonth || 1;
    if(opts.campaignLogHidden) ev.campaignLogHidden = true;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || (kind + ' applied') },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
      ...(opts.campaignLogHidden ? { campaignLogHidden: true } : {}) });
    return ev;
  }

  // ── setters / verbs ──

  // recordLore — author a FACT in the world (GM authoring). No event (the LEARNING is the event).
  function recordLore(campaign, opts){
    opts = opts || {}; if(!campaign) return null;
    const A = _A();
    if(typeof A.blankLore !== 'function') return null;
    const lore = A.blankLore({
      id: opts.id, text: opts.text, loreKind: opts.loreKind, truthValue: opts.truthValue,
      topic: opts.topic, subjectIds: opts.subjectIds, qualityDimensions: opts.qualityDimensions,
      createdByCharacterId: opts.createdByCharacterId,
      createdAtTurn: opts.atTurn || _currentTurn(campaign), notes: opts.notes
    });
    (lore.history || (lore.history = [])).push({ turn: lore.createdAtTurn, type: 'recorded' });
    _ensureLore(campaign).push(lore);
    return lore;
  }

  // learnLore — the CORE: create/upgrade the (knower → lore) Knowledge record at a GIVEN certainty.
  // For "told"/"read"/GM-recorded knowledge (no throw). Upgrades by MAX certainty (never downgrades a
  // known fact — investigate again to raise; the DF model); opts.overwrite forces the value. Emits
  // lore-learned (unless opts.silent). Returns { ok, knowledge, lore, created }.
  function learnLore(campaign, opts){
    opts = opts || {};
    if(!campaign || !opts.loreId || !opts.knowerId) return { ok: false, reason: 'missing-args' };
    const A = _A();
    const lore = findLore(campaign, opts.loreId);
    if(!lore) return { ok: false, reason: 'no-lore' };
    const knowerKind = opts.knowerKind || 'character';
    const turn = opts.atTurn || _currentTurn(campaign);
    const newCertainty = opts.certainty || 'rumored';
    let rec = knowledgeRecord(campaign, knowerKind, opts.knowerId, opts.loreId);
    let created = false;
    if(rec){
      const prev = rec.certainty;
      rec.certainty = opts.overwrite ? newCertainty : higherCertainty(prev, newCertainty);
      if(opts.source) rec.source = opts.source;
      if(opts.believedText != null) rec.believedText = opts.believedText;
      if(opts.learnedAtHexId != null) rec.learnedAtHexId = opts.learnedAtHexId;
      (rec.history || (rec.history = [])).push({ turn, type: 're-learned', from: prev, to: rec.certainty });
    } else {
      if(typeof A.blankKnowledge !== 'function') return { ok: false, reason: 'no-factory' };
      rec = A.blankKnowledge({
        knowerKind, knowerId: opts.knowerId, loreId: opts.loreId, certainty: newCertainty,
        source: opts.source, believedText: opts.believedText, learnedAtTurn: turn, learnedAtHexId: opts.learnedAtHexId
      });
      rec.history.push({ turn, type: 'learned', certainty: newCertainty, source: (rec.source && rec.source.kind) || null });
      _ensureKnowledge(campaign).push(rec);
      created = true;
    }
    if(!opts.silent){
      _recordLoreEvent(campaign, 'lore-learned', {
        loreId: opts.loreId, knowerId: opts.knowerId, knowerKind, certainty: rec.certainty,
        sourceKind: (rec.source && rec.source.kind) || null, sourceById: (rec.source && rec.source.byId) || null,
        believedText: rec.believedText || '', learnedAtHexId: rec.learnedAtHexId || null
      }, {
        narrative: opts.narrative || _learnNarrative(campaign, rec, lore, created),
        campaignLogHidden: !!opts.campaignLogHidden,
        context: _knowerContext(rec, lore)
      });
    }
    return { ok: true, knowledge: rec, lore, created };
  }

  // attemptLearnLore — the THROW path (RAW §5.1/§16.3): resolve a Knowledge/Loremastery throw on the
  // SHIPPED Layer-1 die (characterProficiencyThrow), derive certainty from the margin, then learnLore.
  // The knower must be a CHARACTER. No new throw machinery — we consume the resolver.
  function attemptLearnLore(campaign, opts){
    opts = opts || {};
    if(!campaign || !opts.loreId || !opts.knowerId) return { ok: false, reason: 'missing-args' };
    const A = _A();
    const knower = _chars(campaign).find(c => c && c.id === opts.knowerId) || null;
    const task = opts.proficiencyTask || 'knowledge:recall';
    let result = null;
    if(knower && typeof A.characterProficiencyThrow === 'function'){
      result = A.characterProficiencyThrow(campaign, knower, task, { rng: _rng(opts), secret: opts.secret });
      // unavailable (no proficiency / class-derived target) → no real assessment
      if(result && result.resolvedTarget == null) result = Object.assign({}, result, { success: false, unavailable: true });
    }
    const certainty = certaintyFromThrow(result);
    const source = opts.source || { kind: 'deduced', byId: opts.knowerId };
    const r = learnLore(campaign, {
      loreId: opts.loreId, knowerId: opts.knowerId, knowerKind: 'character', certainty, source,
      believedText: opts.believedText, learnedAtHexId: opts.learnedAtHexId, atTurn: opts.atTurn,
      narrative: opts.narrative, silent: opts.silent
    });
    return Object.assign({}, r, { throw: result, certainty });
  }

  // investigateLore — the DF active verb: a deliberate throw to RAISE an existing record's confidence
  // (= attemptLearnLore; learnLore upgrades by max certainty, so a better throw raises it).
  function investigateLore(campaign, opts){ return attemptLearnLore(campaign, opts); }

  // _knowerCertainty — a Knower's confidence in a lore: the stored record's certainty, else null
  // (doesn't hold a tracked record → can't share it; to share a witnessed fact, record + learn it first).
  function _knowerCertainty(campaign, knowerKind, knowerId, loreId){
    const rec = knowledgeRecord(campaign, knowerKind, knowerId, loreId);
    return rec ? rec.certainty : null;
  }

  // shareLore — the manual single-share (the §16.5 propagation, manual half; the diffusion TICK is a
  // deferred wave). The teller must KNOW the lore (a stored record); the recipient gains a record with
  // source told-by, certainty one band BELOW the teller's (gossip degrades) unless opts.degrade===false.
  // Emits lore-shared. Returns { ok, knowledge, lore, created, sharedCertainty }.
  function shareLore(campaign, opts){
    opts = opts || {};
    if(!campaign || !opts.loreId || !opts.toKnowerId || !opts.fromKnowerId) return { ok: false, reason: 'missing-args' };
    const lore = findLore(campaign, opts.loreId);
    if(!lore) return { ok: false, reason: 'no-lore' };
    const fromKind = opts.fromKnowerKind || 'character';
    const tellerCertainty = _knowerCertainty(campaign, fromKind, opts.fromKnowerId, opts.loreId);
    if(!tellerCertainty) return { ok: false, reason: 'teller-does-not-know' };
    const toKind = opts.toKnowerKind || 'character';
    const sharedCertainty = (opts.degrade === false) ? tellerCertainty : _certaintyBelow(tellerCertainty);
    const r = learnLore(campaign, {
      loreId: opts.loreId, knowerId: opts.toKnowerId, knowerKind: toKind,
      certainty: sharedCertainty, source: { kind: 'told-by', byId: opts.fromKnowerId },
      believedText: opts.believedText, learnedAtHexId: opts.learnedAtHexId, atTurn: opts.atTurn,
      silent: true   // shareLore emits its own lore-shared event below
    });
    if(!r.ok) return r;
    _recordLoreEvent(campaign, 'lore-shared', {
      loreId: opts.loreId, toKnowerId: opts.toKnowerId, toKnowerKind: toKind,
      fromKnowerId: opts.fromKnowerId, fromKnowerKind: fromKind, certainty: sharedCertainty
    }, {
      narrative: opts.narrative || _shareNarrative(campaign, opts, lore, sharedCertainty),
      campaignLogHidden: !!opts.campaignLogHidden,
      context: _shareContext(opts, lore)
    });
    return Object.assign({}, r, { sharedCertainty });
  }

  // forgetLore — drop a stored Knowledge record (the FIFO-forget / GM-clear; §16.4 "forget, no archive").
  function forgetLore(campaign, opts){
    opts = opts || {};
    if(!campaign || !opts.loreId || !opts.knowerId) return false;
    const arr = _ensureKnowledge(campaign);
    const idx = arr.findIndex(k => k && k.knowerId === opts.knowerId
      && k.knowerKind === (opts.knowerKind || 'character') && k.loreId === opts.loreId && k.status !== 'forgotten');
    if(idx < 0) return false;
    arr.splice(idx, 1);
    return true;
  }

  // ── narrative + context helpers ──
  function _charName(campaign, id){ const c = _chars(campaign).find(x => x && x.id === id); return (c && c.name) || id; }
  function _knowerLabel(campaign, kind, id){ return (kind === 'character' || !kind) ? _charName(campaign, id) : (kind + ' ' + id); }
  function _loreLabel(lore){ const t = (lore && (lore.topic || lore.text)) || (lore && lore.id) || 'lore'; return t.length > 60 ? (t.slice(0, 57) + '…') : t; }
  function _learnNarrative(campaign, rec, lore, created){
    const who = _knowerLabel(campaign, rec.knowerKind, rec.knowerId);
    return (created ? (who + ' learns: ') : (who + ' grows ' + rec.certainty + ' of: ')) + '“' + _loreLabel(lore) + '”';
  }
  function _shareNarrative(campaign, opts, lore, certainty){
    return _knowerLabel(campaign, opts.fromKnowerKind, opts.fromKnowerId) + ' tells '
      + _knowerLabel(campaign, opts.toKnowerKind, opts.toKnowerId) + ' (' + certainty + '): “' + _loreLabel(lore) + '”';
  }
  // Tag the knower (witness) + the lore (subject) so the event surfaces in characterHistory(knower)
  // + loreHistory(lore). The lore's own subjectIds are queryable via loreOnSubject (mixed-kind ids are
  // NOT tagged here — tagging with the wrong kind would pollute the typed history indices).
  function _knowerContext(rec, lore){
    const rel = [{ kind: 'lore', id: lore.id, role: 'subject' }];
    if(rec.knowerKind === 'character') rel.push({ kind: 'character', id: rec.knowerId, role: 'witness' });
    return { primaryHexId: rec.learnedAtHexId || null, relatedEntities: rel };
  }
  function _shareContext(opts, lore){
    const rel = [{ kind: 'lore', id: lore.id, role: 'subject' }];
    if((opts.fromKnowerKind || 'character') === 'character') rel.push({ kind: 'character', id: opts.fromKnowerId, role: 'subject' });
    if((opts.toKnowerKind || 'character') === 'character') rel.push({ kind: 'character', id: opts.toKnowerId, role: 'recipient' });
    return { primaryHexId: opts.learnedAtHexId || null, relatedEntities: rel };
  }

  // ── export onto window.ACKS ──
  Object.assign(ACKS, {
    // constants
    LORE_KINDS, LORE_TRUTH_VALUES, CERTAINTY_BANDS, CERTAINTY_RANK, LORE_SOURCE_KINDS, KNOWER_KINDS,
    certaintyRank, higherCertainty, certaintyFromThrow,
    // lookups
    findLore, findKnowledge, loreOnSubject, knowledgeRecordsForKnower, knowledgeRecord, loreKnowers,
    isKnower, firstHandLore, loreKnownBy, loreKnownByCollective, loreHistory,
    // setters / verbs
    recordLore, learnLore, attemptLearnLore, investigateLore, shareLore, forgetLore
  });

  if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
