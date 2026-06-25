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
    let feeGp = Math.max(0, Math.round(Number(opts.feeGp) || 0));
    const secret = !!opts.secret;

    const r = sageConsultResolve(campaign, sage, {
      subject, specialty: opts.specialty, inSpecialty: opts.inSpecialty, taskKey: opts.taskKey,
      preferProficiency: opts.preferProficiency, preferTask: opts.preferTask
    });
    if(!r.available) return { ok:false, error: r.reason || 'not-a-sage' };

    // SG-3: an active RETAINER waives (or discounts) the per-query fee — the client already pays
    // the sage a monthly fee (retainSage), so ordinary queries are covered (consultDiscount default
    // 1 = free; 🔧 RR p.171 gives only the 500gp/mo wage). No-op when no retainer exists (the
    // shipped SG-1 path is unchanged). opts.ignoreRetainer forces the per-query fee anyway.
    const baseFeeGp = feeGp;
    let coveredByRetainer = false, retainerId = null;
    if(!opts.ignoreRetainer){
      const _ret = sageRetainerFor(campaign, client.id, sage.id);
      if(_ret){
        retainerId = _ret.id;
        const disc = Math.max(0, Math.min(1, Number(_ret.consultDiscount != null ? _ret.consultDiscount : 1)));
        feeGp = Math.max(0, Math.round(baseFeeGp * (1 - disc)));
        coveredByRetainer = true;
      }
    }

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

    // SG-4 (Knowledge-Layer emit; Phase_4_Sages_Plan.md §10) — on a SUCCESSFUL consult, when the
    // Knowledge layer is active, deposit the answer as a Lore FACT + record the client's KNOWLEDGE
    // of it (source 'sage', certainty from the throw margin). READ-ONLY consume of the shipped
    // acks-engine-knowledge.js API (recordLore → learnLore → the shipped `lore-learned` event; the
    // plan's aspirational `knowledge-gained` name is superseded by the shipped one). Gated by
    // _knowledgeActive (the `knowledge-tracking` house rule — UNREGISTERED → isHouseRuleEnabled OFF
    // by default), so the sage works FULLY (just the answer) when Knowledge is off. opts.emitLore
    // explicitly forces on(true)/off(false) (the modal's "📚 Record to Knowledge" tick). Computed
    // BEFORE the payload so payload.loreId carries the deposited fact's id (the §241 reservation).
    let loreId = null;
    const wantLore = (opts.emitLore != null) ? !!opts.emitLore : _knowledgeActive(campaign);
    if(success && wantLore && typeof A.recordLore === 'function' && typeof A.learnLore === 'function'){
      const factText = answerText || String(opts.subject || '').trim() || query;
      if(factText){
        const lore = A.recordLore(campaign, {
          text: factText, loreKind:'fact', truthValue:'true',
          topic: String(opts.subject || query || '').slice(0, 120),
          subjectIds: Array.isArray(opts.subjectIds) ? opts.subjectIds : [],
          createdByCharacterId: sage.id, notes:'Learned from a sage consultation (RR p.171).'
        });
        if(lore && lore.id){
          loreId = lore.id;
          const certainty = (typeof A.certaintyFromThrow === 'function') ? A.certaintyFromThrow(result) : 'probable';
          A.learnLore(campaign, {
            loreId: lore.id, knowerId: client.id, knowerKind:'character', certainty,
            source: { kind:'sage', byId: sage.id }, learnedAtHexId: clientHex,
            atTurn: campaign.currentTurn || 1, campaignLogHidden:true   // the consult narrates the Q&A; the learn meta-event stays off the Campaign Log
          });
        }
      }
    }

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
      feeGp, baseFeeGp, coveredByRetainer, retainerId,   // SG-3: a retainer waives/discounts the fee
      answerText,
      loreId: loreId,   // SG-4 (Knowledge Layer emit) — the deposited Lore fact's id, or null (knowledge-tracking off / failed / no content)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SG-2 (burst8 b8-sages, #147) — the multi-week SageCommission research-commission.
  // Phase_4_Sages_Plan.md §3.3: a sage set to research a deep question over N days while
  // the party adventures elsewhere — a work-in-progress entity (campaign.sageCommissions[],
  // sag-) advanced on the SHIPPED day-tick (slot 64, the Construction-Project propose-
  // review-commit pattern) and resolved on the SAME Proficiency-Throws Layer-1 die the
  // everyday consultation uses (REUSES sageConsultResolve above — 3+/18+ or the PC throw).
  //
  // Determinism (the load-bearing call): the throw is PRE-ROLLED at commissioning (stored on
  // commission.resolved) — the sage either can or cannot crack the question; the days are the
  // labor. This is required, not just simplest: the day-tick orchestrator builds the resolved
  // event from a notable computed at PROPOSE time (before the commit rolls), so the outcome
  // must already exist. The recruitment-drive precedent (pre-roll the schedule at start).
  //
  // Footprint: 1 collection (sageCommissions[]) + 1 prefix (sag-) + 1 entity kind + 2 record-
  // only event kinds (sage-commission-started/-resolved — the SG-1 direct-push pattern) + 1
  // day-tick slot (64). NO house rule (the sage service is core RAW, default-on; RAW pins
  // neither the duration nor the fee → both 🔧 tooling defaults). NO save migration: blank-
  // Campaign seeds sageCommissions[], it is NOT lazy-injected by migrateCampaign + every read
  // is defensive + init-on-write, so the 6 templates + demo stay migrate-no-ops (the banking
  // team-session precedent). daysElapsed is DERIVED (sageCommissionProgress) off startedAtOrd
  // (the truth) — no stored mirror that could drift (Architecture §3.3).
  // ═══════════════════════════════════════════════════════════════════════════

  // ID minting — proxy ID_PREFIXES through the namespace (the banking precedent) so
  // newId(ID_PREFIXES.sageCommission) reads the 'sag' prefix the engine registers at call time.
  function _newSagId(){
    const A = _sACKS();
    const pfx = (A.ID_PREFIXES && A.ID_PREFIXES.sageCommission) || 'sag';
    return (typeof A.newId === 'function') ? A.newId(pfx) : (pfx + '-' + Math.random().toString(36).slice(2, 9));
  }

  // The 1-based day ordinal (turn 1 day 1 = ord 1; the recruitment-drive convention).
  function _sageDayOrd(campaign, dayInMonth){
    const turn = (campaign && campaign.currentTurn) || 1;
    const day  = (dayInMonth != null) ? dayInMonth : ((campaign && campaign.currentDayInMonth) || 1);
    return (turn - 1) * 30 + day;
  }

  // blankSageCommission — the work-in-progress research entity (Architecture §3.1: homeless
  // in-progress state + identity-through-change → an entity, like a Construction Project /
  // recruitmentDrive). startedAtOrd is the TRUTH; daysElapsed derives from it (no drift, §3.3).
  // resolved (the pre-rolled throw) + result (the delivered envelope, set on completion) are
  // engine-managed → omitted from the Inspector schema, raw-JSON-edited (the delve precedent).
  function blankSageCommission(opts={}){
    opts = opts || {};
    const A = _sACKS();
    return {
      schemaVersion: (A && A.SCHEMA_VERSION) || 2,
      kind: 'sageCommission',
      id: opts.id || _newSagId(),
      sageCharacterId: opts.sageCharacterId || null,
      clientCharacterId: opts.clientCharacterId || null,
      settlementId: opts.settlementId || null,
      query: String(opts.query || ''),
      subject: String(opts.subject || ''),
      mode: opts.mode || '',                                                                       // npc-specialist | pc-scholar (display)
      target: (typeof opts.target === 'number') ? opts.target : null,
      inSpecialty: (opts.inSpecialty != null) ? !!opts.inSpecialty : null,
      daysRequired: (typeof opts.daysRequired === 'number' && opts.daysRequired > 0) ? Math.round(opts.daysRequired) : 30,
      startedAtOrd: (typeof opts.startedAtOrd === 'number') ? opts.startedAtOrd : null,            // the day ordinal it began (truth)
      feeGp: Math.max(0, Math.round(Number(opts.feeGp) || 0)),
      feePaidGp: Math.max(0, Math.round(Number(opts.feePaidGp) || 0)),
      answerText: String(opts.answerText || ''),                                                   // delivered on success (GM supplies the content)
      status: opts.status || 'in-progress',                                                        // in-progress | complete | abandoned
      resolved: opts.resolved || null,                                                             // the PRE-ROLLED throw (set at commissioning)
      result: opts.result || null,                                                                 // { throw, success, answerText, deliveredAt* } — set on completion
      history: Array.isArray(opts.history) ? opts.history : []
    };
  }

  // ── Lookups + derived progress ───────────────────────────────────────────────
  function sageCommissions(campaign){ return (campaign && Array.isArray(campaign.sageCommissions)) ? campaign.sageCommissions : []; }
  function findSageCommission(campaign, id){ if(!id) return null; return sageCommissions(campaign).find(c => c && c.id === id) || null; }
  function sageCommissionsForCharacter(campaign, characterId){
    if(!characterId) return [];
    return sageCommissions(campaign).filter(c => c && (c.sageCharacterId === characterId || c.clientCharacterId === characterId));
  }

  // Derived progress (no stored daysElapsed → no drift, Architecture §3.3). startedAtOrd is truth.
  function sageCommissionProgress(campaign, commission){
    const com = (typeof commission === 'string') ? findSageCommission(campaign, commission) : commission;
    if(!com) return null;
    const req = (typeof com.daysRequired === 'number' && com.daysRequired > 0) ? com.daysRequired : 30;
    const start = (typeof com.startedAtOrd === 'number') ? com.startedAtOrd : _sageDayOrd(campaign);
    const nowOrd = _sageDayOrd(campaign);
    const completesOnOrd = start + req;
    const elapsed = Math.max(0, Math.min(req, nowOrd - start));
    return {
      daysRequired: req, daysElapsed: elapsed, daysRemaining: Math.max(0, completesOnOrd - nowOrd),
      startedAtOrd: start, completesOnOrd,
      pct: req > 0 ? Math.max(0, Math.min(1, elapsed / req)) : 1,
      completesNow: (com.status === 'in-progress') && (nowOrd >= completesOnOrd),
      done: com.status !== 'in-progress'
    };
  }

  // ── Events (record-only; the SG-1 _emitSageConsultation direct-push pattern) ──
  // Both sage-commission-* kinds are record-only (no replay handler): the verb / the day-tick
  // commit already applied the state. Carries the §528 envelope (sage = source, client =
  // beneficiary, the commission = subject) + the day stamp (#346 windowing).
  function _emitSageCommissionEvent(campaign, kind, payload, ctx){
    ctx = ctx || {};
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    const A = _sACKS();
    const turn = campaign.currentTurn || 1;
    const day  = (ctx.dayInMonth != null) ? ctx.dayInMonth : (campaign.currentDayInMonth || 1);
    const context = {
      primaryHexId: ctx.hexId || null,
      involvedHexIds: ctx.hexId ? [ctx.hexId] : [],
      settlementId: payload.settlementId || null,
      domainId: null,
      relatedEntities: [
        { kind:'character', id: payload.sageCharacterId,   role:'source' },
        { kind:'character', id: payload.clientCharacterId, role:'beneficiary' },
        { kind:'sageCommission', id: payload.sageCommissionId, role:'subject' }
      ]
    };
    let ev;
    if(typeof A.newEvent === 'function' && typeof A.isEventKindKnown === 'function' && A.isEventKindKnown(kind)){
      ev = A.newEvent(kind, { submittedBy: ctx.submittedBy || 'engine', status:'applied',
        cadence: ctx.cadence || 'monthly-turn', targetTurn: turn, context, payload });
    } else {
      ev = { id: 'evt-sagecom-' + ((campaign.eventLog.length || 0) + 1), kind, status:'applied',
        submittedBy: ctx.submittedBy || 'engine', context, payload };
    }
    ev.appliedAtTurn = turn; ev.appliedAtDay = day;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: ctx.narrative || '' },
      appliedAtTurn: turn, appliedAtDay: day, appliedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : '') });
    return ev;
  }

  // ── The commission verb ──────────────────────────────────────────────────────
  // commissionSage(campaign, opts) — set a sage to research a deep question over N days.
  // Pre-rolls the throw (deterministic outcome), debits the FULL fee upfront (GP Wave B;
  // insufficient funds aborts — nothing created), creates the in-progress commission, emits
  // sage-commission-started. opts: { sageId, clientId?, query?, subject?, settlementId?,
  // daysRequired?, feeGp?, answerText?, specialty?, inSpecialty?, taskKey?, preferProficiency?,
  // preferTask?, secret?, rng?, submittedBy?, id? }.
  function commissionSage(campaign, opts){
    opts = opts || {};
    const A = _sACKS();
    if(!campaign) return { ok:false, error:'no-campaign' };
    const sage = _findChar(campaign, opts.sageId);
    if(!sage) return { ok:false, error:'unknown-sage' };
    const client = _findChar(campaign, opts.clientId) || sage;
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const secret = !!opts.secret;
    const feeGp = Math.max(0, Math.round(Number(opts.feeGp) || 0));
    const daysRequired = (typeof opts.daysRequired === 'number' && opts.daysRequired > 0) ? Math.round(opts.daysRequired) : 30;

    // Resolve the throw params (REUSE the SG-1 classifier) + pre-roll on the shipped Layer-1 die.
    const r = sageConsultResolve(campaign, sage, {
      subject: opts.subject, specialty: opts.specialty, inSpecialty: opts.inSpecialty,
      taskKey: opts.taskKey, preferProficiency: opts.preferProficiency, preferTask: opts.preferTask
    });
    if(!r.available) return { ok:false, error: r.reason || 'not-a-sage' };
    let throwRes;
    if(r.mode === 'pc-scholar'){
      throwRes = A.characterProficiencyThrow(campaign, sage, r.taskKey, { secret, rng });
    } else {
      throwRes = A.rollProficiencyThrow({ target: r.target, modifiers: [], proficient: r.proficient,
        autoFailBand: r.autoFailBand, secret, rng });
    }

    // The full fee, upfront (🔧 default — RAW pins no per-commission fee; the periodic model is a
    // future refinement). Validate-then-create: an unaffordable fee aborts before anything is created.
    let feeSpec = null;
    if(feeGp > 0 && A.applyWealthTransfer){
      feeSpec = { amount: feeGp, source: { kind:'character', id: client.id, label: client.name || client.id },
                  destination: { kind:'external', label:'the sage' }, bucket:'service', reason:'sage-commission' };
      try { A.applyWealthTransfer(campaign, feeSpec); }
      catch(e){ return { ok:false, error:'insufficient-funds', detail: String((e && e.message) || e) }; }
    }

    const turn = campaign.currentTurn || 1, day = campaign.currentDayInMonth || 1;
    const startedAtOrd = _sageDayOrd(campaign, day);
    const resolved = {
      natural: (throwRes.natural != null) ? throwRes.natural : null,
      total: (throwRes.total != null) ? throwRes.total : null,
      target: (throwRes.target != null) ? throwRes.target : r.target,
      success: !!throwRes.success, margin: (throwRes.margin != null) ? throwRes.margin : null, secret
    };
    const com = blankSageCommission({
      id: opts.id, sageCharacterId: sage.id, clientCharacterId: client.id,
      settlementId: opts.settlementId || null, query: opts.query, subject: opts.subject,
      mode: r.mode, target: resolved.target, inSpecialty: (r.inSpecialty != null) ? r.inSpecialty : null,
      daysRequired, startedAtOrd, feeGp, feePaidGp: feeGp, answerText: opts.answerText,
      status: 'in-progress', resolved, result: null
    });
    com.history.push({ turn, dayInMonth: day, type:'commissioned',
      text: (sage.name || 'A sage') + ' begins researching ' + (com.subject ? ('“' + com.subject + '”') : 'the question') + ' (' + daysRequired + ' days)' });

    if(!Array.isArray(campaign.sageCommissions)) campaign.sageCommissions = [];   // init-on-write
    campaign.sageCommissions.push(com);

    const hexId = client.currentHexId || sage.currentHexId || null;
    const payload = {
      sageCommissionId: com.id, sageCharacterId: sage.id, clientCharacterId: client.id,
      settlementId: com.settlementId, query: com.query, subject: com.subject, mode: com.mode,
      inSpecialty: com.inSpecialty, target: com.target, daysRequired, feeGp, secret
    };
    const selfCommission = (client.id === sage.id);
    const ev = _emitSageCommissionEvent(campaign, 'sage-commission-started', payload, {
      hexId, submittedBy: opts.submittedBy, cadence:'monthly-turn',
      narrative: (sage.name || 'A sage') + (selfCommission ? ' undertakes' : (' is commissioned by ' + (client.name || 'an inquirer') + ' to research')) +
        (selfCommission ? ' to research' : '') + ' ' + (com.subject ? ('“' + com.subject + '”') : 'a question') + ' over ' + daysRequired + ' days.'
    });

    // The fee decomposition child rides UNDER the parent (campaignLogHidden, the Trade-Wizard pattern).
    if(feeSpec && A.recordWealthTransfer) A.recordWealthTransfer(campaign, feeSpec, { parentEvent: ev });

    return { ok:true, commission: com, mode: r.mode, target: com.target, feeGp, startedAtOrd, daysRequired, event: ev };
  }

  // Abandon an in-progress commission (the GM calls it off / the sage quits). Marks it
  // 'abandoned' (kept for history). No refund — the sage did the labor up to now (a partial
  // refund is a future refinement). Record-only via the commission's own history.
  function abandonSageCommission(campaign, id){
    const com = findSageCommission(campaign, id);
    if(!com) return { ok:false, error:'unknown-commission' };
    if(com.status !== 'in-progress') return { ok:false, error:'not-in-progress' };
    const turn = (campaign && campaign.currentTurn) || 1, day = (campaign && campaign.currentDayInMonth) || 1;
    com.status = 'abandoned';
    com.history.push({ turn, dayInMonth: day, type:'abandoned', text:'The commission was called off (no refund).' });
    return { ok:true, commission: com };
  }

  // ── The slot-64 day-tick consumer (Phase_4_Sages_Plan.md §3.3 — the Construction-Project
  // propose-review-commit pattern). proposeSageCommissionDay surfaces a completion record + a
  // TRANSIENT review notable for each commission whose day has come; commitSageCommissionRecord
  // flips it to complete, stamps the delivered result, and emits sage-commission-resolved (the
  // SG-1 direct-push pattern — the transient notable is review-only, never a second log entry).
  // No pause trigger: a completed research surfaces in the review without holding the world
  // clock (the recruitment precedent). ──
  function proposeSageCommissionDay(campaign, ctx){
    const out = { pendingRecords: [], notableEvents: [], encounters: [] };
    const dayInMonth = (ctx && ctx.dayInMonth) || ((campaign && campaign.currentDayInMonth) || 1);
    const nowOrd = _sageDayOrd(campaign, dayInMonth);
    for(const com of sageCommissions(campaign)){
      if(!com || com.status !== 'in-progress') continue;
      if(typeof com.startedAtOrd !== 'number') continue;
      if(nowOrd < com.startedAtOrd + (com.daysRequired || 30)) continue;   // not done yet
      const sage = _findChar(campaign, com.sageCharacterId);
      const client = _findChar(campaign, com.clientCharacterId);
      const success = !!(com.resolved && com.resolved.success);
      const hexId = (client && client.currentHexId) || (sage && sage.currentHexId) || null;
      out.pendingRecords.push({ kind:'sage-commission-complete', commissionId: com.id });
      out.notableEvents.push({ kind:'gm-narrative', type:'sage-commission', transient:true, primaryHexId: hexId,
        label: ((sage && sage.name) || 'A sage') + ' completes the research on ' + (com.subject ? ('“' + com.subject + '”') : 'the question') + (success ? ' — and has an answer.' : ' — but found nothing.'),
        payload: { sageCommissionId: com.id, success } });
    }
    _proposeRetainerBills(campaign, dayInMonth, out);   // SG-3: monthly retainer billing rides the same slot-64 consumer
    return out;
  }

  function commitSageCommissionRecord(campaign, record){
    if(record && record.kind === 'sage-retainer-bill') return _commitRetainerBill(campaign, record);   // SG-3
    if(!record || record.kind !== 'sage-commission-complete') return;
    const com = findSageCommission(campaign, record.commissionId);
    if(!com || com.status !== 'in-progress') return;   // idempotent guard
    const sage = _findChar(campaign, com.sageCharacterId);
    const client = _findChar(campaign, com.clientCharacterId);
    const turn = campaign.currentTurn || 1;
    // The completion day: the orchestrator commits records BEFORE advancing the day clock, so
    // campaign.currentDayInMonth is still the pre-tick day at commit time — read the day the
    // consumer fired off the record (tickDayOnce tags it), falling back to the campaign day.
    const day = (typeof record.dayInMonth === 'number') ? record.dayInMonth : (campaign.currentDayInMonth || 1);
    const throwRes = com.resolved || null;
    const success = !!(throwRes && throwRes.success);
    com.status = 'complete';
    com.result = { throw: throwRes, success, answerText: success ? (com.answerText || '') : '',
                   deliveredAtTurn: turn, deliveredAtDay: day };
    com.history.push({ turn, dayInMonth: day, type:'completed',
      text: success ? ('Research complete — an answer is delivered' + (com.answerText ? (': ' + com.answerText) : '.'))
                     : 'Research complete — but the question could not be answered.' });
    const hexId = (client && client.currentHexId) || (sage && sage.currentHexId) || null;
    const sName = (sage && sage.name) || 'A sage';
    const onSubj = com.subject ? (' on “' + com.subject + '”') : '';
    const payload = {
      sageCommissionId: com.id, sageCharacterId: com.sageCharacterId, clientCharacterId: com.clientCharacterId,
      settlementId: com.settlementId, subject: com.subject, success,
      throw: throwRes ? { natural: throwRes.natural, total: throwRes.total, target: throwRes.target, success, secret: !!throwRes.secret } : null,
      answerText: com.result.answerText, daysRequired: com.daysRequired
    };
    _emitSageCommissionEvent(campaign, 'sage-commission-resolved', payload, {
      hexId, submittedBy:'engine', cadence:'daily', dayInMonth: day,
      narrative: success
        ? (sName + ' completes the commissioned research' + onSubj + (com.answerText ? (': ' + com.answerText) : '.'))
        : (sName + ' completes the commissioned research' + onSubj + ' — but cannot answer.')
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SG-3 (burst9 b9-sages, #147) — the PERIODIC-FEE RETAINER (Phase_4_Sages_Plan.md §7 row SG-3;
  // RR Adventures — a standing arrangement, distinct from SG-2's one-off multi-week commission).
  // A patron RETAINS a sage on an ongoing monthly fee (default the RR p.171 specialist wage,
  // 500 gp/mo) for ongoing lore/identify service at PRIORITY (the sage is on call — no availability
  // roll) + DISCOUNT (ordinary consultations are covered — consultDiscount default 1 = free).
  //
  // Footprint — deliberately MINIMAL (manifest: NO new prefix/entity; reuse sag-):
  //   - A retainer is a record on the CLIENT character (client.sageRetainers[]) — a field on an
  //     existing entity (rides campaign.characters[] → NO new collection, NO importer change, NO
  //     entity-registry kind, NO field schema, NO blankCampaign seed, NO migrateCampaign inject,
  //     NO save migration; defensive read + init-on-write — the sageSpecialty / SG-2 precedent).
  //     A retainer is a client↔sage RELATION; the relation-entity home (Architecture §3.1) is a
  //     future registered sageRetainers[] collection — a field is the in-lane v1 (no new prefix).
  //   - It reuses the sag- id mint (_newSagId) — a stable id, no new prefix registered.
  //   - 3 record-only event kinds (sage-retainer-started/-ended/-fee-paid — the SG-1 direct-push
  //     pattern). NO new day-tick slot: billing rides the SHIPPED slot-64 consumer (above) — the
  //     ordinal nextBillOrd schedule (startedAtOrd + 30, the SG-2 completion pattern) bills every
  //     30 days (= an ACKS month), driven both by manual Day-Clock ticks AND by commitTurn's
  //     runDayTickToMonthEnd (so Advance-Month collects the rent). NO house rule (core RAW, the
  //     specialist wage; the 🔧 defaults are the monthly fee number + free-consults reading).
  // ═══════════════════════════════════════════════════════════════════════════

  const RETAINER_FEE_DEFAULT = 500;   // RR p.171 specialist monthly wage (the retainer fee; 🔧 GM-overridable)

  function _retainerArr(c){ return (c && Array.isArray(c.sageRetainers)) ? c.sageRetainers : []; }

  // Find the retainer record (+ its owning client character) anywhere in the campaign.
  function _findRetainerOwner(campaign, retainerId){
    if(!retainerId) return null;
    for(const c of _chars(campaign)){
      const ret = _retainerArr(c).find(r => r && r.id === retainerId);
      if(ret) return { owner: c, retainer: ret };
    }
    return null;
  }

  // ── Lookups ──────────────────────────────────────────────────────────────────
  // The active retainer for a (client, sage) pair, or null.
  function sageRetainerFor(campaign, clientId, sageId){
    if(!clientId || !sageId) return null;
    const client = _findChar(campaign, clientId);
    if(!client) return null;
    return _retainerArr(client).find(r => r && r.status === 'active' && r.sageCharacterId === sageId) || null;
  }
  // Every active retainer the character is party to (as client OR as the retained sage).
  function sageRetainersForCharacter(campaign, characterId){
    if(!characterId) return [];
    const out = [];
    for(const c of _chars(campaign)){
      for(const r of _retainerArr(c)){
        if(!r || r.status !== 'active') continue;
        if(r.clientCharacterId === characterId || r.sageCharacterId === characterId) out.push(r);
      }
    }
    return out;
  }
  // Is this sage retained by anyone (the priority flag — a retained sage is on call)?
  function isSageRetained(campaign, sageId){
    if(!sageId) return false;
    for(const c of _chars(campaign)){
      if(_retainerArr(c).some(r => r && r.status === 'active' && r.sageCharacterId === sageId)) return true;
    }
    return false;
  }
  // The effective per-consultation fee after the retainer discount (the modal preview helper).
  function retainerConsultFee(campaign, clientId, sageId, baseFeeGp){
    const base = Math.max(0, Math.round(Number(baseFeeGp) || 0));
    const ret = sageRetainerFor(campaign, clientId, sageId);
    if(!ret) return { covered:false, feeGp: base, baseFeeGp: base, discount: 0, retainerId: null };
    const disc = Math.max(0, Math.min(1, Number(ret.consultDiscount != null ? ret.consultDiscount : 1)));
    return { covered:true, feeGp: Math.max(0, Math.round(base * (1 - disc))), baseFeeGp: base, discount: disc, retainerId: ret.id };
  }

  // ── Retainer events (record-only; the §528 envelope — sage source, client beneficiary) ──
  function _emitSageRetainerEvent(campaign, kind, payload, ctx){
    ctx = ctx || {};
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    const A = _sACKS();
    const turn = campaign.currentTurn || 1;
    const day  = (ctx.dayInMonth != null) ? ctx.dayInMonth : (campaign.currentDayInMonth || 1);
    const context = {
      primaryHexId: ctx.hexId || null,
      involvedHexIds: ctx.hexId ? [ctx.hexId] : [],
      settlementId: payload.settlementId || null,
      domainId: null,
      relatedEntities: [
        { kind:'character', id: payload.sageCharacterId,   role:'source' },
        { kind:'character', id: payload.clientCharacterId, role:'beneficiary' }
      ]
    };
    let ev;
    if(typeof A.newEvent === 'function' && typeof A.isEventKindKnown === 'function' && A.isEventKindKnown(kind)){
      ev = A.newEvent(kind, { submittedBy: ctx.submittedBy || 'engine', status:'applied',
        cadence: ctx.cadence || 'monthly-turn', targetTurn: turn, context, payload });
    } else {
      ev = { id:'evt-sageret-' + ((campaign.eventLog.length || 0) + 1), kind, status:'applied',
        submittedBy: ctx.submittedBy || 'engine', context, payload };
    }
    ev.appliedAtTurn = turn; ev.appliedAtDay = day;
    if(ctx.campaignLogHidden) ev.campaignLogHidden = true;   // routine monthly bill — Event Log only
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: ctx.narrative || '' },
      appliedAtTurn: turn, appliedAtDay: day, appliedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : '') });
    return ev;
  }

  // ── retainSage — start a standing retainer ───────────────────────────────────
  // opts: { sageId, clientId?, feeGpPerMonth?, consultDiscount?, settlementId?, specialty?,
  //         submittedBy?, id? }. Debits the FIRST month upfront (GP Wave B; insufficient aborts —
  //         nothing created), records it on the client, emits sage-retainer-started. The day-tick
  //         then bills each subsequent month (nextBillOrd = startedAtOrd + 30).
  function retainSage(campaign, opts){
    opts = opts || {};
    const A = _sACKS();
    if(!campaign) return { ok:false, error:'no-campaign' };
    const sage = _findChar(campaign, opts.sageId);
    if(!sage) return { ok:false, error:'unknown-sage' };
    if(!isSage(sage)) return { ok:false, error:'not-a-sage' };
    const client = _findChar(campaign, opts.clientId) || sage;
    if(client.id === sage.id) return { ok:false, error:'self-retain' };          // a retainer is a client↔sage arrangement
    if(sageRetainerFor(campaign, client.id, sage.id)) return { ok:false, error:'already-retained' };
    const feeGpPerMonth = (opts.feeGpPerMonth != null) ? Math.max(0, Math.round(Number(opts.feeGpPerMonth) || 0)) : RETAINER_FEE_DEFAULT;
    const consultDiscount = (opts.consultDiscount != null) ? Math.max(0, Math.min(1, Number(opts.consultDiscount))) : 1;
    const turn = campaign.currentTurn || 1, day = campaign.currentDayInMonth || 1;
    const startedAtOrd = _sageDayOrd(campaign, day);

    // The first month, upfront (GP Wave B). Validate-then-create: an unaffordable first month aborts.
    let feeSpec = null;
    if(feeGpPerMonth > 0 && A.applyWealthTransfer){
      feeSpec = { amount: feeGpPerMonth, source:{ kind:'character', id: client.id, label: client.name || client.id },
                  destination:{ kind:'external', label:'the sage' }, bucket:'service', reason:'sage-retainer' };
      try { A.applyWealthTransfer(campaign, feeSpec); }
      catch(e){ return { ok:false, error:'insufficient-funds', detail: String((e && e.message) || e) }; }
    }

    const retainer = {
      id: opts.id || _newSagId(),
      sageCharacterId: sage.id, clientCharacterId: client.id,
      settlementId: opts.settlementId || null,
      specialty: String(opts.specialty || sage.sageSpecialty || ''),
      feeGpPerMonth, consultDiscount,
      startedAtTurn: turn, startedAtOrd,
      nextBillOrd: startedAtOrd + 30,                 // month 1 paid now; the day-tick bills month 2 at +30 days
      lastBilledTurn: turn, monthsPaid: 1,
      status: 'active', endedAtTurn: null, endedReason: '',
      history: [{ turn, dayInMonth: day, type:'retained',
        text: (client.name || 'A patron') + ' retains ' + (sage.name || 'a sage') + ' at ' + feeGpPerMonth + ' gp/month.' }]
    };
    if(!Array.isArray(client.sageRetainers)) client.sageRetainers = [];   // init-on-write (defensive; migrate never injects it)
    client.sageRetainers.push(retainer);

    const hexId = client.currentHexId || sage.currentHexId || null;
    const ev = _emitSageRetainerEvent(campaign, 'sage-retainer-started', {
      sageRetainerId: retainer.id, sageCharacterId: sage.id, clientCharacterId: client.id,
      settlementId: retainer.settlementId, feeGpPerMonth, consultDiscount, specialty: retainer.specialty
    }, { hexId, cadence:'monthly-turn', submittedBy: opts.submittedBy,
         narrative: (client.name || 'A patron') + ' retains ' + (sage.name || 'a sage') +
           (retainer.specialty ? (', a scholar of ' + retainer.specialty + ',') : '') + ' at ' + feeGpPerMonth + ' gp/month.' });
    if(feeSpec && A.recordWealthTransfer) A.recordWealthTransfer(campaign, feeSpec, { parentEvent: ev });
    return { ok:true, retainer, feeGp: feeGpPerMonth, startedAtOrd, event: ev };
  }

  // ── endSageRetainer — end a standing retainer (GM-voluntary, or 'unpaid' lapse) ──
  // sel: a retainer id (string) OR { clientId, sageId }. opts: { reason?: 'unpaid', submittedBy? }.
  function endSageRetainer(campaign, sel, opts){
    opts = opts || {};
    let found = null;
    if(typeof sel === 'string'){ found = _findRetainerOwner(campaign, sel); }
    else if(sel && typeof sel === 'object'){
      const ret = sageRetainerFor(campaign, sel.clientId, sel.sageId);
      if(ret) found = _findRetainerOwner(campaign, ret.id);
    }
    if(!found) return { ok:false, error:'unknown-retainer' };
    const ret = found.retainer;
    if(ret.status !== 'active') return { ok:false, error:'not-active' };
    const reason = (opts.reason === 'unpaid') ? 'unpaid' : 'ended';
    const turn = campaign.currentTurn || 1, day = campaign.currentDayInMonth || 1;
    ret.status = (reason === 'unpaid') ? 'lapsed' : 'ended';
    ret.endedAtTurn = turn; ret.endedReason = reason;
    ret.history.push({ turn, dayInMonth: day, type:(reason === 'unpaid' ? 'lapsed' : 'ended'),
      text: (reason === 'unpaid' ? 'The retainer lapsed (unpaid).' : 'The retainer was ended.') });
    const sage = _findChar(campaign, ret.sageCharacterId);
    const client = _findChar(campaign, ret.clientCharacterId) || found.owner;
    const hexId = (client && client.currentHexId) || (sage && sage.currentHexId) || null;
    const ev = _emitSageRetainerEvent(campaign, 'sage-retainer-ended', {
      sageRetainerId: ret.id, sageCharacterId: ret.sageCharacterId, clientCharacterId: ret.clientCharacterId,
      settlementId: ret.settlementId, feeGpPerMonth: ret.feeGpPerMonth, monthsPaid: ret.monthsPaid, reason
    }, { hexId, cadence:'monthly-turn', submittedBy: opts.submittedBy,
         narrative: ((client && client.name) || 'A patron') + ' ends the retainer with ' + ((sage && sage.name) || 'the sage') + '.' });
    return { ok:true, retainer: ret, event: ev };
  }

  // ── Monthly billing — rides the slot-64 consumer (no new slot). _proposeRetainerBills surfaces
  // a TRANSIENT review notable + a pending record for each retainer whose 30-day mark has come;
  // _commitRetainerBill debits the month (GP Wave B) + advances the schedule, or LAPSES the
  // retainer if the client can no longer pay (the F&D/scutage consequence). forOrd makes the
  // commit idempotent (a re-commit finds nextBillOrd already advanced past it → no-op). ──
  function _proposeRetainerBills(campaign, dayInMonth, out){
    const nowOrd = _sageDayOrd(campaign, dayInMonth);
    for(const c of _chars(campaign)){
      for(const ret of _retainerArr(c)){
        if(!ret || ret.status !== 'active') continue;
        if(typeof ret.nextBillOrd !== 'number') continue;
        if(nowOrd < ret.nextBillOrd) continue;   // not due yet
        const sage = _findChar(campaign, ret.sageCharacterId);
        const hexId = c.currentHexId || (sage && sage.currentHexId) || null;
        out.pendingRecords.push({ kind:'sage-retainer-bill', retainerId: ret.id, clientId: ret.clientCharacterId, forOrd: ret.nextBillOrd });
        out.notableEvents.push({ kind:'gm-narrative', type:'sage-retainer', transient:true, primaryHexId: hexId,
          label: (c.name || 'A patron') + '’s retainer with ' + ((sage && sage.name) || 'a sage') + ' is due — ' + (ret.feeGpPerMonth || 0) + ' gp.',
          payload: { sageRetainerId: ret.id, feeGp: ret.feeGpPerMonth || 0 } });
      }
    }
  }

  function _commitRetainerBill(campaign, record){
    const found = _findRetainerOwner(campaign, record.retainerId);
    if(!found) return;
    const ret = found.retainer;
    if(ret.status !== 'active') return;                                            // idempotent: only an active retainer bills
    if(typeof record.forOrd === 'number' && ret.nextBillOrd !== record.forOrd) return;   // already billed this period
    const A = _sACKS();
    const sage = _findChar(campaign, ret.sageCharacterId);
    const client = _findChar(campaign, ret.clientCharacterId) || found.owner;
    const turn = campaign.currentTurn || 1;
    const day = (typeof record.dayInMonth === 'number') ? record.dayInMonth : (campaign.currentDayInMonth || 1);
    const fee = Math.max(0, Math.round(Number(ret.feeGpPerMonth) || 0));
    const hexId = (client && client.currentHexId) || (sage && sage.currentHexId) || null;
    const sName = (sage && sage.name) || 'the sage';

    // Bill the month (GP Wave B). A client who can no longer pay → the retainer LAPSES (RR-style).
    let feeSpec = null;
    if(fee > 0 && A.applyWealthTransfer){
      feeSpec = { amount: fee, source:{ kind:'character', id: client.id, label: client.name || client.id },
                  destination:{ kind:'external', label:'the sage' }, bucket:'service', reason:'sage-retainer' };
      try { A.applyWealthTransfer(campaign, feeSpec); }
      catch(e){
        ret.status = 'lapsed'; ret.endedAtTurn = turn; ret.endedReason = 'unpaid';
        ret.history.push({ turn, dayInMonth: day, type:'lapsed', text:'The retainer lapsed — the monthly fee could not be paid.' });
        _emitSageRetainerEvent(campaign, 'sage-retainer-ended', {
          sageRetainerId: ret.id, sageCharacterId: ret.sageCharacterId, clientCharacterId: ret.clientCharacterId,
          settlementId: ret.settlementId, feeGpPerMonth: fee, monthsPaid: ret.monthsPaid, reason:'unpaid'
        }, { hexId, cadence:'daily', dayInMonth: day, submittedBy:'engine',
             narrative: ((client && client.name) || 'The patron') + ' can no longer pay ' + sName + ' — the retainer lapses.' });
        return;
      }
    }
    ret.nextBillOrd = (typeof ret.nextBillOrd === 'number' ? ret.nextBillOrd : _sageDayOrd(campaign, day)) + 30;
    ret.monthsPaid = (ret.monthsPaid || 0) + 1;
    ret.lastBilledTurn = turn;
    ret.history.push({ turn, dayInMonth: day, type:'fee-paid', text:'Monthly retainer paid — ' + fee + ' gp (month ' + ret.monthsPaid + ').' });
    const ev = _emitSageRetainerEvent(campaign, 'sage-retainer-fee-paid', {
      sageRetainerId: ret.id, sageCharacterId: ret.sageCharacterId, clientCharacterId: ret.clientCharacterId,
      settlementId: ret.settlementId, feeGp: fee, monthsPaid: ret.monthsPaid
    }, { hexId, cadence:'daily', dayInMonth: day, submittedBy:'engine', campaignLogHidden: true,
         narrative: ((client && client.name) || 'The patron') + ' pays ' + sName + '’s monthly retainer (' + fee + ' gp).' });
    if(feeSpec && A.recordWealthTransfer) A.recordWealthTransfer(campaign, feeSpec, { parentEvent: ev });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SG-4 support — _knowledgeActive (the gate for the consultSage Lore-emit above). The Knowledge
  // layer is "active" iff (a) the shipped acks-engine-knowledge.js API is present AND (b) the
  // `knowledge-tracking` house rule is on. That rule is UNREGISTERED (its catalogs.js registration
  // is the Knowledge lane's follow-up), so isHouseRuleEnabled returns false by default → SG-4 is
  // OFF until a GM opts in (the modal's per-consult "📚 Record to Knowledge" tick is the other
  // lever). A function DECLARATION → hoisted, so consultSage (defined earlier) can call it.
  // ═══════════════════════════════════════════════════════════════════════════
  function _knowledgeActive(campaign){
    const A = _sACKS();
    if(typeof A.recordLore !== 'function' || typeof A.learnLore !== 'function') return false;
    if(typeof A.isHouseRuleEnabled === 'function') return !!A.isHouseRuleEnabled(campaign, 'knowledge-tracking');
    const hr = (campaign && campaign.houseRules) ? campaign.houseRules['knowledge-tracking'] : null;   // defensive fallback
    return hr === true || !!(hr && hr.enabled === true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SG-5 (burst10 b10-sages, #147) — the TREATISE primitive (Phase_4_Sages_Plan.md §3.4/§7).
  // RAW: RR p.146 (the RR + JJ campaign-activity lists both cite "Read a treatise (6 days; p. 146)" /
  // "Reference a treatise (p. 146)"; the plan/task's "p.143" is an earlier-printing page → corrected
  // to p.146 here, cartography-before-mechanics).
  //
  // A treatise is a BOOK (a Notable Item, kind:'book') on ONE proficiency, in four tiers = ranks 1–4
  // (Apprentice/Journeyman/Master/Grandmaster — RR p.146 equipment table, 400/800/1200/1600 gp, 5 st
  // each). RAW, verbatim: an adventurer can only comprehend/benefit from a treatise ≤ ONE rank above
  // his own; READING it = 6 days of DEDICATED activity; thereafter he can REFERENCE it to RE-ROLL a
  // proficiency throw for a query, at the rank of the adventurer OR the treatise, WHICHEVER IS WORSE
  // (= min); referencing is an ANCILLARY activity, 6 turns (one hour).
  //
  // Footprint — MINIMAL (manifest: NO new prefix/entity/collection):
  //   • Treatise fields live on the Notable Item's intrinsic{} (the factory's designated book-metadata
  //     home) — set by markTreatise, read defensively by isTreatise/treatiseInfo. NO blankNotableItem
  //     edit, NO migrateCampaign inject → templates stay migrate-no-ops (the sageSpecialty / SG-3
  //     sageRetainers precedent).
  //   • Read-state lives on the item (intrinsic.readByCharacterIds[]) — the book knows its students;
  //     no reader-character edit.
  //   • 1 record-only event kind (treatise-read; the SG-1 direct-push pattern), two phases:
  //     phase:'read' (the 6-day study — narrates) + phase:'reference' (the re-roll — campaignLogHidden,
  //     a die re-roll is table chatter, the recordProficiencyThrow precedent). NO day-tick slot (the
  //     read is an instant verb; its 6-day cost rides the event's activityCost).
  // ═══════════════════════════════════════════════════════════════════════════

  // The four RAW tiers (RR p.146 equipment table). ranks 1–4; gp from the table; all 5 st.
  const TREATISE_TIERS = Object.freeze([
    { ranks:1, label:'Apprentice',  gp:400  },
    { ranks:2, label:'Journeyman',  gp:800  },
    { ranks:3, label:'Master',      gp:1200 },
    { ranks:4, label:'Grandmaster', gp:1600 }
  ]);
  function treatiseTier(ranks){ const r = Math.max(1, Math.min(4, Math.round(Number(ranks) || 1))); return TREATISE_TIERS[r - 1]; }
  function treatiseTierLabel(ranks){ return treatiseTier(ranks).label; }

  function _notableItems(campaign){ return (campaign && Array.isArray(campaign.notableItems)) ? campaign.notableItems : []; }
  function _findNotable(campaign, id){
    if(!id) return null;
    const A = _sACKS();
    if(typeof A.findNotableItem === 'function'){ const r = A.findNotableItem(campaign, id); if(r) return r; }
    return _notableItems(campaign).find(n => n && n.id === id) || null;
  }
  function _intrinsicOf(item){ if(!item.intrinsic || typeof item.intrinsic !== 'object') item.intrinsic = {}; return item.intrinsic; }

  // The first PROFICIENCY_TASK whose proficiency is profKey (the reference re-roll's default throw).
  function _defaultTaskForProficiency(profKey){
    const A = _sACKS();
    const tasks = A.PROFICIENCY_TASKS || {};
    for(const tk of Object.keys(tasks)){ if(tasks[tk] && tasks[tk].proficiency === profKey) return tk; }
    return null;
  }

  // The target for a catalog task at a GIVEN rank (mirror of proficiencies' _resolveBaseTarget —
  // tierTargets clamp / baseTarget + perRank + perLevel). Returns null when the task can't be
  // attempted at that rank (rank < its minTier) or has a class-derived base (no number yet).
  function _taskTargetAtRank(task, ranks, level){
    if(!task || task.baseTargetSource) return null;
    if(task.tierTargets){
      const tiers = Object.keys(task.tierTargets).map(Number).sort((a, b) => a - b);
      const minTier = task.minTier || tiers[0];
      if((ranks || 0) < minTier) return null;
      const maxTier = tiers[tiers.length - 1];
      const useTier = Math.min(Math.max(ranks || minTier, minTier), maxTier);
      return task.tierTargets[useTier];
    }
    let t = Number(task.baseTarget);
    if(task.perRankTargetDelta && (ranks || 0) > 1) t += task.perRankTargetDelta * ((ranks || 1) - 1);
    if(task.perLevelTargetDelta && (level || 1) > 1) t += task.perLevelTargetDelta * ((level || 1) - 1);
    return Number.isFinite(t) ? t : null;
  }

  // ── Predicates + reads ────────────────────────────────────────────────────────
  // A treatise carries a treatiseProficiency on its intrinsic{} (read defensively).
  function isTreatise(item){ return !!(item && item.intrinsic && item.intrinsic.treatiseProficiency); }

  // treatiseInfo — the treatise's resolved descriptor (or null): the proficiency (canonical key +
  // label), rank/tier, spec, the default reference task, and the tier gp. Pure read.
  function treatiseInfo(item){
    if(!isTreatise(item)) return null;
    const A = _sACKS();
    const intr = item.intrinsic;
    const prof = String(intr.treatiseProficiency || '');
    const key = (typeof A.canonicalProficiencyKey === 'function') ? A.canonicalProficiencyKey(prof) : prof;
    const ranks = Math.max(1, Math.min(4, Math.round(Number(intr.treatiseRanks) || 1)));
    const cat = (A.PROFICIENCY_CATALOG && A.PROFICIENCY_CATALOG[key]) || null;
    return {
      proficiency: key, ranks, tier: treatiseTier(ranks).label, gp: treatiseTier(ranks).gp,
      spec: String(intr.treatiseSpec || ''),
      profLabel: cat ? cat.label : (typeof A.proficiencyLabel === 'function' ? A.proficiencyLabel(key) : prof),
      defaultTaskKey: _defaultTaskForProficiency(key)
    };
  }

  // The treatises in a campaign (the modal picker source).
  function treatisesInCampaign(campaign){ return _notableItems(campaign).filter(isTreatise); }

  // Comprehension gate (RR p.146): a reader can read/benefit from a treatise ≤ ONE rank above his own
  // rank in the proficiency. { ok, readerRanks, treatiseRanks, ceiling, proficiency } / error 'too-advanced'.
  function treatiseComprehension(campaign, reader, item){
    const A = _sACKS();
    const info = treatiseInfo(item);
    if(!info) return { ok:false, error:'not-a-treatise' };
    const readerRanks = (typeof A.proficiencyRanks === 'function') ? A.proficiencyRanks(reader, info.proficiency) : 0;
    const ceiling = readerRanks + 1;
    const ok = info.ranks <= ceiling;
    return { ok, error: ok ? null : 'too-advanced', readerRanks, treatiseRanks: info.ranks, ceiling, proficiency: info.proficiency };
  }

  function hasReadTreatise(item, readerId){
    return !!(item && item.intrinsic && Array.isArray(item.intrinsic.readByCharacterIds) && item.intrinsic.readByCharacterIds.indexOf(readerId) >= 0);
  }

  // ── The treatise-read event (record-only; §528 envelope — reader subject, treatise source) ──
  function _emitTreatiseRead(campaign, payload, ctx){
    ctx = ctx || {};
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    const A = _sACKS();
    const turn = campaign.currentTurn || 1, day = campaign.currentDayInMonth || 1;
    const context = {
      primaryHexId: ctx.hexId || null,
      involvedHexIds: ctx.hexId ? [ctx.hexId] : [],
      settlementId: payload.settlementId || null, domainId: null,
      relatedEntities: [
        { kind:'character',     id: payload.readerCharacterId, role:'subject' },
        { kind:'notable-item',  id: payload.itemId,            role:'source'  }   // 'notable-item' = the notableItemHistory filter kind
      ]
    };
    let ev;
    if(typeof A.newEvent === 'function' && typeof A.isEventKindKnown === 'function' && A.isEventKindKnown('treatise-read')){
      ev = A.newEvent('treatise-read', { submittedBy: ctx.submittedBy || 'gm', status:'applied',
        cadence: ctx.cadence || 'monthly-turn', targetTurn: turn, context, payload });
    } else {
      ev = { id:'evt-treatise-' + ((campaign.eventLog.length || 0) + 1), kind:'treatise-read', status:'applied',
        submittedBy: ctx.submittedBy || 'gm', context, payload };
    }
    ev.appliedAtTurn = turn; ev.appliedAtDay = day;
    if(ctx.campaignLogHidden) ev.campaignLogHidden = true;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: ctx.narrative || '' },
      appliedAtTurn: turn, appliedAtDay: day, appliedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : '') });
    return ev;
  }

  // ── Verbs ──────────────────────────────────────────────────────────────────────
  // markTreatise(campaign, itemOrId, opts) — stamp the treatise fields onto a Notable Item (and
  // make it kind:'book' if generic). opts: { proficiency, ranks (1–4), spec?, name? }. Additive
  // intrinsic{} fields — no factory/migration. Returns { ok, item, info } / { ok:false, error }.
  function markTreatise(campaign, itemOrId, opts){
    opts = opts || {};
    const item = (typeof itemOrId === 'string') ? _findNotable(campaign, itemOrId) : itemOrId;
    if(!item) return { ok:false, error:'unknown-item' };
    const A = _sACKS();
    const prof = String(opts.proficiency || '').trim();
    if(!prof) return { ok:false, error:'no-proficiency' };
    const key = (typeof A.canonicalProficiencyKey === 'function') ? A.canonicalProficiencyKey(prof) : prof;
    const ranks = Math.max(1, Math.min(4, Math.round(Number(opts.ranks) || 1)));
    if(item.kind == null || item.kind === 'misc-magic') item.kind = 'book';   // a treatise IS a book (RR p.146)
    const intr = _intrinsicOf(item);
    intr.treatiseProficiency = key;
    intr.treatiseRanks = ranks;
    if(opts.spec != null) intr.treatiseSpec = String(opts.spec);
    if(!Array.isArray(intr.readByCharacterIds)) intr.readByCharacterIds = [];
    if(opts.name && !item.name) item.name = String(opts.name);
    return { ok:true, item, info: treatiseInfo(item) };
  }

  // readTreatise(campaign, opts) — the 6-day DEDICATED read (RR p.146). Validates comprehension,
  // records the reader on the book, emits treatise-read phase:'read' (narrates). opts: { readerId,
  // itemId, settlementId?, submittedBy? }. Returns { ok, item, comprehension, alreadyRead, event }.
  function readTreatise(campaign, opts){
    opts = opts || {};
    if(!campaign) return { ok:false, error:'no-campaign' };
    const reader = _findChar(campaign, opts.readerId);
    if(!reader) return { ok:false, error:'unknown-reader' };
    const item = _findNotable(campaign, opts.itemId);
    if(!item) return { ok:false, error:'unknown-item' };
    const info = treatiseInfo(item);
    if(!info) return { ok:false, error:'not-a-treatise' };
    const comp = treatiseComprehension(campaign, reader, item);
    if(!comp.ok) return { ok:false, error: comp.error, comprehension: comp };   // 'too-advanced'
    const intr = _intrinsicOf(item);
    if(!Array.isArray(intr.readByCharacterIds)) intr.readByCharacterIds = [];
    const already = intr.readByCharacterIds.indexOf(reader.id) >= 0;
    if(!already) intr.readByCharacterIds.push(reader.id);
    const hexId = reader.currentHexId || null;
    const ev = _emitTreatiseRead(campaign, {
      readerCharacterId: reader.id, itemId: item.id, phase:'read',
      proficiency: info.proficiency, treatiseRanks: info.ranks, effectiveRanks: Math.min(comp.readerRanks, info.ranks),
      settlementId: opts.settlementId || null,
      activityCost: { slot:'dedicated', units:1, days:6, kind:'read-treatise', label:'Read a treatise (6 days)' }
    }, { hexId, submittedBy: opts.submittedBy, cadence:'monthly-turn',
         narrative: (reader.name || 'A reader') + (already ? ' re-reads ' : ' reads ') +
           (item.name || ('the ' + info.tier + ' treatise on ' + info.profLabel)) + (already ? ' — already studied.' : ' — 6 days of study.') });
    return { ok:true, item, reader: reader.id, comprehension: comp, alreadyRead: already, event: ev };
  }

  // treatiseReferenceResolve(campaign, reader, item, opts) — the reference re-roll PARAMETERS (no
  // roll). Effective rank = min(reader, treatise) (RR p.146 "whichever is worse"). The throw is the
  // supplied opts.taskKey, else the proficiency's default task. opts: { taskKey?, assumeRead? }.
  function treatiseReferenceResolve(campaign, reader, item, opts){
    opts = opts || {};
    const A = _sACKS();
    const info = treatiseInfo(item);
    if(!info) return { available:false, reason:'not-a-treatise' };
    if(!opts.assumeRead && !hasReadTreatise(item, reader && reader.id)) return { available:false, reason:'not-read', treatiseRanks: info.ranks, profLabel: info.profLabel };
    const readerRanks = (typeof A.proficiencyRanks === 'function') ? A.proficiencyRanks(reader, info.proficiency) : 0;
    const effRanks = Math.min(readerRanks, info.ranks);
    const taskKey = opts.taskKey || info.defaultTaskKey;
    const task = taskKey ? ((A.PROFICIENCY_TASKS || {})[taskKey]) : null;
    if(!task) return { available:false, reason:'no-throw-task', effectiveRanks: effRanks, readerRanks, treatiseRanks: info.ranks, profLabel: info.profLabel };
    const level = (reader && typeof reader.level === 'number') ? reader.level : 1;
    const target = _taskTargetAtRank(task, effRanks, level);
    if(target == null) return { available:false, reason: (effRanks < 1 ? 'rank-too-low' : 'no-target'), effectiveRanks: effRanks, readerRanks, treatiseRanks: info.ranks, taskKey, profLabel: info.profLabel };
    return {
      available:true, effectiveRanks: effRanks, readerRanks, treatiseRanks: info.ranks,
      taskKey, taskLabel: task.label, target,
      proficient: effRanks >= 1, autoFailBand: (typeof task.autoFailBand === 'number') ? task.autoFailBand : 1,
      proficiency: info.proficiency, profLabel: info.profLabel, tier: info.tier, spec: info.spec
    };
  }

  // The modal forecast (the resolved params + the success chance; no roll).
  function treatiseReferenceForecast(campaign, reader, item, opts){
    const r = treatiseReferenceResolve(campaign, reader, item, opts);
    if(!r.available) return r;
    const A = _sACKS();
    r.successChance = (typeof A.throwSuccessChance === 'function') ? A.throwSuccessChance(r.target, 0, r.autoFailBand, r.proficient) : null;
    return r;
  }

  // referenceTreatise(campaign, opts) — the 1-hour ANCILLARY re-roll (RR p.146). Resolves the
  // proficiency throw at min(reader, treatise) rank on the SHIPPED Layer-1 die, emits treatise-read
  // phase:'reference' (campaignLogHidden — a die re-roll is table chatter). opts: { readerId, itemId,
  // taskKey?, query?, secret?, rng?, assumeRead?, settlementId?, submittedBy? }.
  function referenceTreatise(campaign, opts){
    opts = opts || {};
    if(!campaign) return { ok:false, error:'no-campaign' };
    const A = _sACKS();
    const reader = _findChar(campaign, opts.readerId);
    if(!reader) return { ok:false, error:'unknown-reader' };
    const item = _findNotable(campaign, opts.itemId);
    if(!item) return { ok:false, error:'unknown-item' };
    const r = treatiseReferenceResolve(campaign, reader, item, { taskKey: opts.taskKey, assumeRead: opts.assumeRead });
    if(!r.available) return { ok:false, error: r.reason, resolve: r };
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const secret = !!opts.secret;
    const result = A.rollProficiencyThrow({ target: r.target, modifiers: [], proficient: r.proficient, autoFailBand: r.autoFailBand, secret, rng });
    const info = treatiseInfo(item);
    const hexId = reader.currentHexId || null;
    const ev = _emitTreatiseRead(campaign, {
      readerCharacterId: reader.id, itemId: item.id, phase:'reference',
      proficiency: info.proficiency, treatiseRanks: r.treatiseRanks, effectiveRanks: r.effectiveRanks,
      taskKey: r.taskKey, query: String(opts.query || ''), settlementId: opts.settlementId || null,
      target: result.target,
      throw: { natural: result.natural, total: result.total, target: result.target, success: !!result.success, margin: result.margin, secret },
      activityCost: { slot:'ancillary', units:1, kind:'reference-treatise', label:'Reference a treatise (1 hour)' }
    }, { hexId, submittedBy: opts.submittedBy, cadence:'monthly-turn', campaignLogHidden:true,
         narrative: (reader.name || 'A reader') + ' references ' + (item.name || ('the treatise on ' + info.profLabel)) +
           (opts.query ? (' on “' + opts.query + '”') : '') + ' — re-rolls at rank ' + r.effectiveRanks +
           (secret ? '' : (' (' + result.total + ' vs ' + result.target + '+ → ' + (result.success ? 'success' : 'failure') + ')')) + '.' });
    return { ok:true, available:true, reader: reader.id, itemId: item.id, taskKey: r.taskKey,
             effectiveRanks: r.effectiveRanks, target: result.target, success: !!result.success, throw: result, event: ev };
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    isSage, subjectInSpecialty, sageConsultResolve, sageConsultForecast, consultSage,
    // SG-2 — the multi-week SageCommission
    blankSageCommission, sageCommissions, findSageCommission, sageCommissionsForCharacter,
    sageCommissionProgress, commissionSage, abandonSageCommission,
    proposeSageCommissionDay, commitSageCommissionRecord,
    // SG-3 — the periodic-fee retainer
    retainSage, endSageRetainer, sageRetainerFor, sageRetainersForCharacter, isSageRetained, retainerConsultFee,
    // SG-5 — the treatise primitive (a re-roll book, RR p.146) + SG-4 support
    TREATISE_TIERS, treatiseTier, treatiseTierLabel, isTreatise, treatiseInfo, treatisesInCampaign,
    treatiseComprehension, hasReadTreatise, markTreatise, readTreatise,
    treatiseReferenceResolve, treatiseReferenceForecast, referenceTreatise
  });

  // Self-register the slot-64 day-tick consumer (Calendar §14; registerDayConsumer ships from
  // acks-engine.js, loaded first — call-time guard). No pause triggers (the recruitment precedent).
  if(typeof ACKS.registerDayConsumer === 'function'){
    ACKS.registerDayConsumer('sage-commission', {
      handler: proposeSageCommissionDay,
      order: 64,
      pauseTriggers: [],
      commit: commitSageCommissionRecord
    });
  }

})(typeof window !== 'undefined' ? window : global);
