/* ACKS God Mode — acks-engine-sages.js
 * Sages #147 — SG-1: the sage consultation as an EVENT (a thin service over shipped machinery).
 *
 * Spec: Phase_4_Sages_Plan.md (SG-1 — the core service) + Sages_Knowledge_RAW_Survey.md (the RAW
 * substrate). A sage consultation is the lore/knowledge analog of Spellcasting Services: find a
 * scholar → pose a query → resolve a proficiency throw → deliver an answer. The whole mechanic is
 * two RAW target numbers (RR p.171): IN the sage's specialty 3+, OUT of it 18+ — resolved on the
 * SHIPPED Proficiency-Throws Layer-1 die (ACKS.rollProficiencyThrow). A player-character acting as
 * a sage (RR p.112) instead resolves against his own Knowledge (G) / Loremastery throw — already in
 * the shipped catalog, so that path is nearly free. The fee routes through GP Wave B
 * (ACKS.applyWealthTransfer + recordWealthTransfer); the consultation tags payload.activityCost so
 * the #346 day budget counts it; the record is a `sage-consultation` event with the §528 envelope.
 *
 * Cardinal decisions (survey §4.4 / §17):
 *   - The everyday consultation is an EVENT (`sage-consultation`), NOT an entity. No new collection.
 *   - A retained sage is a specialist Character + one additive field `sageSpecialty` (read
 *     defensively — NO blankCharacter edit, NO migrateCampaign inject; templates stay no-ops).
 *   - The multi-week SageCommission (`sag-`) is RESERVED, not built here.
 *   - Magic-item *identification* (the research throw + price spread) is #143's; the sage owns lore
 *     consultations + quick recognition only (survey §15). SG-1 ships the lore consultation.
 *   - There is NO "Lore proficiency" in RR — the coupling is Knowledge + Loremastery (survey §16.3).
 *
 * Loads after events.js (it calls ACKS.newEvent / rollProficiencyThrow / characterProficiencyThrow
 * / applyWealthTransfer / recordWealthTransfer at CALL time, never at load), before player-view.
 * Self-contained: pure reads + one verb over a passed campaign.
 *
 * Contributor mandate (CLAUDE §8.9): the per-query fee + the 1-day consultation duration are 🔧
 * tooling defaults (RAW pins neither; plan §6) — catalog them in ACKS_Mechanic_Extensions.md.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  function _sACKS(){ return (typeof global !== 'undefined' && global.ACKS) || (typeof window !== 'undefined' && window.ACKS) || {}; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _findChar(campaign, id){ if(!id) return null; return _chars(campaign).find(c => c && c.id === id) || null; }
  function _norm(s){ return String(s == null ? '' : s).trim().toLowerCase(); }

  // ── RAW target resolution ──────────────────────────────────────────────────

  // Forgiving subject↔specialty match (the GM frames the subject; substring either way counts).
  // The GM can always override via opts.inSpecialty.
  function subjectInSpecialty(subject, specialty){
    const a = _norm(subject), b = _norm(specialty);
    if(!a || !b) return false;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  // Which shipped proficiency-throw task a PC-sage resolves against (RR p.112/p.110). Knowledge
  // (recall expert info, 11+/7+/3+ by rank) is the in-field path; Loremastery (decipher runes /
  // ancient lore / artifacts, 18+ −1/level) is the esoterica path. Prefer Knowledge when present;
  // GM can override via opts.taskKey. Returns null when the character has neither proficiency.
  function _pcSageTask(A, sage, prefer){
    const ranks = key => (A.proficiencyRanks ? A.proficiencyRanks(sage, key) : 0);
    if(prefer === 'loremastery' && ranks('loremastery') >= 1) return 'loremastery:decipher';
    if(prefer === 'knowledge'   && ranks('knowledge')   >= 1) return 'knowledge:recall';
    if(ranks('knowledge')   >= 1) return 'knowledge:recall';
    if(ranks('loremastery') >= 1) return 'loremastery:decipher';
    return null;
  }

  // Is this character consultable as a sage at all?
  function isSage(character){
    if(!character) return false;
    const A = _sACKS();
    if(_norm(character.sageSpecialty)) return true;
    const r = key => (A.proficiencyRanks ? A.proficiencyRanks(character, key) : 0);
    return r('knowledge') >= 1 || r('loremastery') >= 1;
  }

  // Resolve the THROW PARAMETERS for a consultation (no roll). The two RAW paths:
  //   npc-specialist — a hired Sage with a stated specialty: 3+ in-specialty / 18+ out (RR p.171).
  //   pc-scholar     — a character with no stated specialty but Knowledge/Loremastery: their own
  //                    proficiency throw (RR p.112/p.110), via the shipped Layer-3 derivation.
  // Precedence: a stated specialty (the character's sageSpecialty, or an opts.specialty override)
  // means the specialist path (a hired sage uses 3+/18+ even if he also has proficiencies), unless
  // opts.preferProficiency forces the scholar path. opts: { subject, specialty, inSpecialty,
  // taskKey, preferProficiency, preferTask }.
  function sageConsultResolve(campaign, sage, opts){
    opts = opts || {};
    const A = _sACKS();
    if(!sage) return { available:false, reason:'no-sage', mode:'none' };
    const subject = opts.subject;
    const specialty = _norm(opts.specialty) ? String(opts.specialty).trim() : (String(sage.sageSpecialty || '').trim());

    function specialist(){
      const inSpec = (opts.inSpecialty != null) ? !!opts.inSpecialty : subjectInSpecialty(subject, specialty);
      return { available:true, mode:'npc-specialist', specialty, inSpecialty:inSpec,
               target: inSpec ? 3 : 18, proficient:true, autoFailBand:1, taskKey:null, itemizedModifiers:[] };
    }
    if(specialty && !opts.preferProficiency) return specialist();

    const taskKey = opts.taskKey || _pcSageTask(A, sage, opts.preferTask);
    if(taskKey && A.characterProficiencyThrow){
      const fc = A.characterProficiencyThrow(campaign, sage, taskKey, { roll:false });
      if(fc && !fc.error && fc.resolvedTarget != null){
        return { available:true, mode:'pc-scholar', taskKey, label: fc.label, proficiency: fc.proficiency,
                 target: fc.resolvedTarget, proficient: !!fc.proficient, autoFailBand: fc.autoFailBand,
                 itemizedModifiers: fc.itemizedModifiers || [], inSpecialty:null, specialty:null };
      }
    }
    if(specialty) return specialist();   // a specialty was given but no proficiency — still a specialist
    return { available:false, reason:'not-a-sage', mode:'none' };
  }

  // The forecast for the modal: the resolved params + the success chance (no roll).
  function sageConsultForecast(campaign, sage, opts){
    const r = sageConsultResolve(campaign, sage, opts);
    if(!r.available) return r;
    const A = _sACKS();
    const modTotal = (r.itemizedModifiers || []).reduce((s, m) => s + (Number(m.value) || 0), 0);
    r.modifierTotal = modTotal;
    r.successChance = A.throwSuccessChance ? A.throwSuccessChance(r.target, modTotal, r.autoFailBand, r.proficient) : null;
    return r;
  }

  // ── The consultation verb ───────────────────────────────────────────────────

  function _sageNarrative(sage, client, p){
    const sName = (sage && sage.name) || 'The sage';
    const cName = (client && client.name) || 'the inquirer';
    const subj = p.subject ? ('“' + p.subject + '”') : 'the matter at hand';
    const self = sage && client && sage.id === client.id;
    const who = self ? (sName + ' researches ' + subj) : (sName + ' is consulted by ' + cName + ' about ' + subj);
    if(p.throw && p.throw.success){
      return who + ' — and answers' + (p.answerText ? (': ' + p.answerText) : '.');
    }
    return who + ' — but cannot answer'
      + (p.throw && p.throw.total != null && !p.throw.secret ? (' (' + p.throw.total + ' vs ' + p.throw.target + '+)') : '') + '.';
  }

  // Build + log the record-only sage-consultation event (the §528 envelope; the marketBuy /
  // recordProficiencyThrow precedent — pushed directly, no replay handler). campaignLogHidden is
  // NOT set: the answer narrates in the Campaign Log; the die breakdown rides the payload.
  function _emitSageConsultation(campaign, payload, ctx){
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    const A = _sACKS();
    const turn = campaign.currentTurn || 1;
    const day  = campaign.currentDayInMonth || 1;
    const context = {
      primaryHexId: ctx.clientHex || null,
      involvedHexIds: ctx.clientHex ? [ctx.clientHex] : [],
      settlementId: payload.settlementId || null,
      domainId: null,
      relatedEntities: [
        { kind:'character', id: payload.sageCharacterId,   role:'source' },
        { kind:'character', id: payload.clientCharacterId, role:'beneficiary' }
      ]
    };
    let ev;
    if(typeof A.newEvent === 'function' && typeof A.isEventKindKnown === 'function' && A.isEventKindKnown('sage-consultation')){
      ev = A.newEvent('sage-consultation', { submittedBy: ctx.submittedBy || 'gm', status:'applied',
        cadence:'monthly-turn', targetTurn: turn, context, payload });
    } else {
      ev = { id:'evt-sage-' + ((campaign.eventLog.length || 0) + 1), kind:'sage-consultation',
        status:'applied', submittedBy: ctx.submittedBy || 'gm', context, payload };
    }
    ev.appliedAtTurn = turn; ev.appliedAtDay = day;   // day-stamped → the #346 budget windows it (RR Activities)
    const narrativeSummary = _sageNarrative(ctx.sage, ctx.client, payload);
    campaign.eventLog.push({ event: ev, result: { narrativeSummary },
      appliedAtTurn: turn, appliedAtDay: day, appliedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : '') });
    return ev;
  }

  // consultSage(campaign, opts) — the SG-1 verb. opts:
  //   { sageId, clientId?, query?, subject?, settlementId?, feeGp?, answerText?, specialty?,
  //     inSpecialty?, taskKey?, preferProficiency?, preferTask?, secret?, rng?, submittedBy? }
  // Resolves the throw, debits the fee (insufficient funds aborts — nothing logged), emits the
  // record. Returns { ok:true, mode, success, throw, target, inSpecialty, feeGp, answerText, event }
  // or { ok:false, error }.
  function consultSage(campaign, opts){
    opts = opts || {};
    const A = _sACKS();
    if(!campaign) return { ok:false, error:'no-campaign' };
    const sage = _findChar(campaign, opts.sageId);
    if(!sage) return { ok:false, error:'unknown-sage' };
    const client = _findChar(campaign, opts.clientId) || sage;   // a PC-sage consults via his own learning
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const subject = opts.subject;
    const query = String(opts.query || '').trim();
    const feeGp = Math.max(0, Math.round(Number(opts.feeGp) || 0));
    const secret = !!opts.secret;

    const r = sageConsultResolve(campaign, sage, {
      subject, specialty: opts.specialty, inSpecialty: opts.inSpecialty, taskKey: opts.taskKey,
      preferProficiency: opts.preferProficiency, preferTask: opts.preferTask
    });
    if(!r.available) return { ok:false, error: r.reason || 'not-a-sage' };

    // Resolve the throw on the shipped Layer-1 die (RR pp.9–10).
    let result;
    if(r.mode === 'pc-scholar'){
      result = A.characterProficiencyThrow(campaign, sage, r.taskKey, { secret, rng });
    } else {
      result = A.rollProficiencyThrow({ target: r.target, modifiers: [], proficient: r.proficient,
        autoFailBand: r.autoFailBand, secret, rng });
    }
    const success = !!result.success;

    // The fee (GP Wave B). Validate-then-emit: an unaffordable fee aborts before anything is logged.
    let feeSpec = null;
    if(feeGp > 0 && A.applyWealthTransfer){
      feeSpec = { amount: feeGp, source: { kind:'character', id: client.id, label: client.name || client.id },
                  destination: { kind:'external', label:'the sage' }, bucket:'service', reason:'sage-consultation' };
      try { A.applyWealthTransfer(campaign, feeSpec); }
      catch(e){ return { ok:false, error:'insufficient-funds', detail: String((e && e.message) || e) }; }
    }

    const answerText = String(opts.answerText || '').trim();
    const clientHex = client.currentHexId || sage.currentHexId || null;
    const payload = {
      sageCharacterId: sage.id, clientCharacterId: client.id,
      settlementId: opts.settlementId || null, query, subject: opts.subject || '',
      mode: r.mode, inSpecialty: (r.inSpecialty != null) ? r.inSpecialty : null,
      target: (result.target != null) ? result.target : r.target,
      throw: {
        natural: (result.natural != null) ? result.natural : null,
        total: (result.total != null) ? result.total : null,
        target: (result.target != null) ? result.target : r.target,
        success, margin: (result.margin != null) ? result.margin : null, secret
      },
      feeGp, answerText,
      loreId: null,   // SG-4 (Knowledge Layer emit) reserved — set iff knowledge-tracking is on
      // #346: a consultation is an ancillary errand for the asker (the sage is busy too — both
      // participants are in relatedEntities, so the budget charges each 1 ancillary; a per-role
      // dedicated/ancillary split is a SG-2 refinement, 🔧).
      activityCost: { slot:'ancillary', units:1, kind:'sage-consult', label:'Consult a sage' }
    };
    const ev = _emitSageConsultation(campaign, payload, { sage, client, clientHex, submittedBy: opts.submittedBy });

    // The fee decomposition child rides UNDER the parent (campaignLogHidden, the Trade-Wizard pattern).
    if(feeSpec && A.recordWealthTransfer) A.recordWealthTransfer(campaign, feeSpec, { parentEvent: ev });

    return { ok:true, mode: r.mode, sageId: sage.id, clientId: client.id, subject: opts.subject || '',
      query, inSpecialty: r.inSpecialty, target: payload.target, success, throw: result, feeGp, answerText, event: ev };
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    isSage, subjectInSpecialty, sageConsultResolve, sageConsultForecast, consultSage
  });

})(typeof window !== 'undefined' ? window : global);
