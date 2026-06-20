/* ACKS God Mode — acks-engine-religion.js
 * Religion + Divine Power — R0 (data-layer accessors). Wave E (Architecture.md §3.5).
 *
 * Spec: Phase_4_Religion_Plan.md (§5.1 predicates + lookups; §4.4 the divine-power ledger).
 * R0 ships the catalog-free RAW core: the read accessors over the Deity / Congregation /
 * DivineFavor entities (factories in acks-engine-entities.js) + the per-character expiring
 * divine-power ledger (a field on the character, §4.4). The ACCRUAL math
 * (congregationWeeklyDivinePowerGp), the monthly/day-tick consumers, consecration/sacrifice
 * actions, rollDivineThrow, and the event kinds are DEFERRED to R1+ — not built here.
 *
 * RAW corrections honored (Phase_4_Religion_Plan.md §0):
 *   - CORR-1: divine power does NOT fuel ordinary spellcasting (consecration / research /
 *     prayer→XP / apotheosis only). spendDivinePower is a generic debit; what it pays for is R3+.
 *   - D1: DivineFavor has `standing`, NO numeric favorLevel.
 *
 * Loads LAST (the harness/glob + index.html load acks-engine-*.js after the canonical set), so
 * every other module is present at call time. Self-contained: these are pure reads/debits over
 * a passed campaign — no dependency on another module at load time. Q6 names (the shared "power"
 * accessor contract, parallel to the arcane side's arcanePowerAvailable / spendArcanePower):
 * divinePowerAvailable / spendDivinePower.
 *
 * Contributor mandate (CLAUDE §8.9): when accrual/spending behaviors land (R1+), document the
 * inline rollDivineThrow + Place-of-Power stubs as 🔧 tooling entries in ACKS_Mechanic_Extensions.md.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // ── internal helpers ──
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _findChar(campaign, charId){
    if(!charId) return null;
    return _chars(campaign).find(c => c && c.id === charId) || null;
  }
  function _currentTurn(campaign){
    return (campaign && typeof campaign.currentTurn === 'number') ? campaign.currentTurn : 1;
  }
  // An entry's expiry turn: explicit expiresAtTurn, else accruedAtTurn + 1 (one month — RR p.422),
  // else null (treat as non-expiring — e.g. a hand-authored entry with no timing).
  function _entryExpiry(e){
    if(!e) return null;
    if(e.expiresAtTurn != null) return e.expiresAtTurn;
    if(e.accruedAtTurn != null) return e.accruedAtTurn + 1;
    return null;
  }
  // Live = not yet faded as of currentTurn (RR p.422: fades the month AFTER accrual).
  function _entryLive(e, currentTurn){
    const exp = _entryExpiry(e);
    return exp == null || exp > currentTurn;
  }
  // Normalize a character's divinePower field in place (init-on-write); returns the object.
  function _ensureLedger(ch){
    if(!ch) return null;
    if(!ch.divinePower || typeof ch.divinePower !== 'object') ch.divinePower = { entries: [], reliquaryStoreGp: 0 };
    if(!Array.isArray(ch.divinePower.entries)) ch.divinePower.entries = [];
    if(typeof ch.divinePower.reliquaryStoreGp !== 'number') ch.divinePower.reliquaryStoreGp = 0;
    return ch.divinePower;
  }

  // ── Predicate: is this character a divine spellcaster? (§5.1) ──
  // Drives whether the divine-power UI + actions appear. Derived from class powers (the JJ ch.18
  // "Collect/Use Divine Power" ability) + the known RAW divine classes, with an explicit GM flag.
  const DIVINE_CLASSES = ['crusader','bladedancer','craftpriest','priestess','shaman','witch','nobiran wonderworker','wonderworker'];
  function isDivineCaster(character){
    if(!character) return false;
    if(character.isDivineCaster === true) return true;                 // explicit GM flag (fallback)
    const powers = Array.isArray(character.classPowers) ? character.classPowers : [];
    if(powers.some(p => /divine\s*power/i.test(typeof p === 'string' ? p : (p && (p.name || p.key || p.label || ''))))) return true;
    const cls = (character.class || '').toLowerCase();
    return DIVINE_CLASSES.some(d => cls.includes(d));
  }

  // ── Lookups (defensive — absent collections read as []) ──
  function findDeity(campaign, deityId){
    if(!deityId) return null;
    return ((campaign && campaign.deities) || []).find(d => d && d.id === deityId) || null;
  }
  function findCongregation(campaign, congregationId){
    if(!congregationId) return null;
    return ((campaign && campaign.congregations) || []).find(c => c && c.id === congregationId) || null;
  }
  function findDivineFavor(campaign, favorId){
    if(!favorId) return null;
    return ((campaign && campaign.divineFavors) || []).find(f => f && f.id === favorId) || null;
  }
  // All congregations a character is high priest of.
  function congregationsOf(campaign, charId){
    if(!charId) return [];
    return ((campaign && campaign.congregations) || []).filter(c => c && c.highPriestCharacterId === charId);
  }
  // The character's active DivineFavor (single-patron assumption, §5.1) — or null.
  function divineFavorOf(campaign, charId){
    if(!charId) return null;
    return ((campaign && campaign.divineFavors) || [])
      .find(f => f && f.characterId === charId && (f.status == null || f.status === 'active')) || null;
  }
  // The deity the character worships (resolved via its active DivineFavor) — or null.
  function deityOf(campaign, charId){
    const fav = divineFavorOf(campaign, charId);
    return fav ? findDeity(campaign, fav.deityId) : null;
  }

  // ── Divine-power ledger accessors (§4.4) ──

  // Spendable divine power NOW = Σ unexpired ledger entries + the (non-expiring) reliquary store.
  // Divine power "cannot be stored" (RR p.422): each accrual fades one month after it's received,
  // so an entry counts only while it is live as of the campaign's current turn. The craftpriest
  // reliquary (reliquaryStoreGp) is the one non-expiring exception.
  function divinePowerAvailable(campaign, charId){
    const ch = _findChar(campaign, charId);
    if(!ch) return 0;
    const dp = ch.divinePower || {};
    const entries = Array.isArray(dp.entries) ? dp.entries : [];
    const currentTurn = _currentTurn(campaign);
    let sum = 0;
    for(const e of entries){
      if(!e) continue;
      if(_entryLive(e, currentTurn)) sum += (Number(e.amountGp) || 0);
    }
    sum += (Number(dp.reliquaryStoreGp) || 0);
    return sum;
  }

  // Spend up to `gp` of divine power. Atomic: if less than `gp` is available, spends NOTHING and
  // returns { ok:false }. Otherwise debits unexpired entries soonest-to-fade-first (use it before
  // it's lost), then the reliquary store. Returns { ok, spent, remaining }. (What the spend pays
  // for — consecration / research / prayer — is R3+; this is the shared debit primitive, Q6.)
  function spendDivinePower(campaign, charId, gp){
    const ch = _findChar(campaign, charId);
    const want = Number(gp) || 0;
    if(!ch || want <= 0) return { ok: false, spent: 0, remaining: divinePowerAvailable(campaign, charId) };
    const available = divinePowerAvailable(campaign, charId);
    if(available < want) return { ok: false, spent: 0, remaining: available };   // not enough → spend nothing
    const dp = _ensureLedger(ch);                                                // init-on-write
    const currentTurn = _currentTurn(campaign);
    let need = want;
    const live = dp.entries
      .filter(e => e && (Number(e.amountGp) || 0) > 0 && _entryLive(e, currentTurn))
      .sort((a, b) => {
        const ea = _entryExpiry(a), eb = _entryExpiry(b);
        if(ea == null && eb == null) return 0;
        if(ea == null) return 1;     // non-expiring entries spent last
        if(eb == null) return -1;
        return ea - eb;              // soonest-to-fade first
      });
    for(const e of live){
      if(need <= 0) break;
      const amt = Number(e.amountGp) || 0;
      const take = Math.min(amt, need);
      e.amountGp = amt - take;
      need -= take;
    }
    if(need > 0){
      const fromReliquary = Math.min(dp.reliquaryStoreGp, need);
      dp.reliquaryStoreGp -= fromReliquary;
      need -= fromReliquary;
    }
    return { ok: true, spent: want - need, remaining: divinePowerAvailable(campaign, charId) };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Religion R1 — divine-power accrual + consumers (Phase_4_Religion_Plan.md §5.2–§5.6)
  // ════════════════════════════════════════════════════════════════════════════
  // Builds on the R0 ledger primitives above. Pure (campaign,…) reads + setters; cross-module
  // helpers (totalFamilies, abilityMod, computeGpThreshold, newEvent, setEventContext, …) are
  // resolved at CALL time off global.ACKS — every other module is loaded by then (religion loads
  // LAST). RAW-faithful per §0: no master toggle (D2 — divine power just works for divine classes),
  // DivineFavor keeps `standing` (D1 — no numeric favorLevel). Only the three allocated event
  // kinds are emitted: divine-power-accrued · consecration · divine-favor-changed.
  //
  // R1 scope (per the world-front team handoff): the Lawful congregation/domain-worship accrual
  // path + the monthly-turn consumer + a consecration spend + pray-and-sacrifice→XP. Out of R1
  // (later waves, cross-lane): blood sacrifice (R2), consecrate-altar/ruler effects that fold into
  // economy morale / F&D loyalty / Places of Power (R3), the day-tick weekly grain (R1.5), the
  // transgression table (R5). consecrate-fields RECORDS its +1 Land-Value bonus on the domain
  // (domain.consecrationLandValueBonus); the Revenue-Collection READ of it is the R3 economy wiring.

  // Late-bound ACKS namespace (freshest export set; safe — these run well after every module loads).
  function _A(){ return global.ACKS || ACKS; }
  function _findDomain(campaign, domainId){
    if(!domainId) return null;
    return ((campaign && campaign.domains) || []).find(d => d && d.id === domainId) || null;
  }
  function _chaBonus(ch){
    const A = _A();
    const fn = (typeof A.abilityMod === 'function') ? A.abilityMod : (s => Math.floor(((Number(s)||10) - 10) / 3));
    return fn((ch && ch.abilities && ch.abilities.CHA) || 10);
  }
  function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
  function _d10(rng){ return 1 + Math.floor((rng() || 0) * 10); }
  // 1d10! — an exploding d10: a 10 rolls again and adds (RR's congregation-decline die).
  function _explodingD10(rng){ let total = 0, r, guard = 50; do { r = _d10(rng); total += r; } while(r === 10 && guard-- > 0); return total; }
  function _congLabel(cong){ return (cong && (cong.name || cong.id)) || 'a congregation'; }

  // The §3.2 Domain-Worship table — DP per 10 families per week, by the domain's morale score.
  const DOMAIN_WORSHIP_RATE = Object.freeze({ '-4':0, '-3':1, '-2':2, '-1':3, '0':4, '1':5, '2':6, '3':7, '4':8 });
  function domainWorshipRateForMorale(morale){
    const m = Math.max(-4, Math.min(4, Math.round(Number(morale) || 0)));
    return DOMAIN_WORSHIP_RATE[String(m)] || 0;
  }

  // ── Accrual reads (§5.2) ──────────────────────────────────────────────────

  // Families ministered by the domain-worship path: the realm's families, less the personal
  // congregants already counted at the full rate (RAW stacking — the morale rate applies to the
  // *remaining* families). Plan §5.2 treats a congregant ≈ a family for this subtraction.
  function congregationDomainFamilies(campaign, cong){
    if(!cong || !cong.domainWorshipDomainId) return 0;
    const d = _findDomain(campaign, cong.domainWorshipDomainId);
    if(!d) return 0;
    const A = _A();
    const fam = (typeof A.totalFamilies === 'function') ? (A.totalFamilies(d) || 0)
                                                        : ((d.demographics && d.demographics.peasantFamilies) || 0);
    return Math.max(0, fam - (cong.personalCongregants || 0));
  }
  // Personal congregants → the full faithful rate: 10gp per 50 congregants per week (RR p.421).
  function congregationPersonalWeeklyGp(cong){
    return Math.floor((cong && cong.personalCongregants || 0) / 50) * 10;
  }
  // Domain-worship → families/10 × the morale rate, per week.
  function congregationDomainWorshipWeeklyGp(campaign, cong){
    if(!cong || !cong.domainWorshipDomainId) return 0;
    const d = _findDomain(campaign, cong.domainWorshipDomainId);
    if(!d) return 0;
    const morale = (d.demographics && d.demographics.morale != null) ? d.demographics.morale : 0;
    return Math.floor(congregationDomainFamilies(campaign, cong) / 10) * domainWorshipRateForMorale(morale);
  }
  // Co-extraction (Wave E, RR p.388 — Balbus the chaplain): a divine caster ministering to a usurped
  // settlement draws divine power at the domain-worship rate over its families. Gated on the settlement
  // being CURRENTLY usurped (yields 0 once cleared). 🔧 v1: morale 0 flat (the worked example's basis —
  // 200 families → 80 gp/wk); tying it to the embedding domain's morale is a noted refinement.
  // (_findSettlement is hoisted from the Wave-E section below.)
  function congregationUsurpedSettlementWeeklyGp(campaign, cong){
    if(!cong || !cong.usurpedSettlementId) return 0;
    const s = _findSettlement(campaign, cong.usurpedSettlementId);
    if(!s || !s.arcaneUsurpedByCharacterId) return 0;
    return Math.floor((Number(s.families) || 0) / 10) * domainWorshipRateForMorale(0);
  }
  // Total weekly divine power a congregation generates for its high priest (personal + domain-worship +
  // co-extraction over a usurped settlement — all stacking, RR p.421 / p.388).
  function congregationWeeklyDivinePowerGp(campaign, cong){
    return congregationPersonalWeeklyGp(cong) + congregationDomainWorshipWeeklyGp(campaign, cong)
      + congregationUsurpedSettlementWeeklyGp(campaign, cong);
  }
  // Weeks of faithful maintenance credited this month (0..4). A congregation is tended as a matter
  // of course (autoMaintain, the default) unless the GM unticks it — then the GM-/day-tick-tracked
  // maintainedWeeksThisMonth governs and any missed weeks drive decline (§5.6). autoMaintain is read
  // DEFENSIVELY (absent → true), so it needs no factory/migrate change (R0 stays a no-op).
  function congregationMaintainedWeeks(cong){
    if(!cong) return 0;
    if(cong.autoMaintain === false) return Math.max(0, Math.min(4, Number(cong.maintainedWeeksThisMonth) || 0));
    return 4;
  }
  // Monthly divine power = weekly × maintained weeks (the project's 4-weeks-per-month convention, §5.2).
  function congregationMonthlyDivinePowerGp(campaign, cong){
    return congregationWeeklyDivinePowerGp(campaign, cong) * congregationMaintainedWeeks(cong);
  }
  // Soft RAW cap on personal congregants — the realm's people (≈ 5 per family) where a domain is
  // associated; otherwise uncapped (RR p.421 "cannot exceed the realm's population"). v1 approximation.
  function _realmPopulationCap(campaign, cong){
    const domId = (cong && cong.domainWorshipDomainId) || (cong && cong.templeRef && cong.templeRef.kind === 'domain' ? cong.templeRef.id : null);
    const d = domId ? _findDomain(campaign, domId) : null;
    if(!d) return null;
    const A = _A();
    const fam = (typeof A.totalFamilies === 'function') ? (A.totalFamilies(d) || 0) : ((d.demographics && d.demographics.peasantFamilies) || 0);
    return fam * 5;
  }

  // ── Event emit (record-only; populates Event.context per the §8.9 mandate) ──
  function _recordReligionEvent(campaign, kind, payload, opts){
    const A = _A();
    opts = opts || {};
    if(typeof A.newEvent !== 'function') return null;
    const ev = A.newEvent(kind, {
      submittedBy: opts.submittedBy || 'engine',
      targetTurn: campaign.currentTurn || 1,
      cadence: opts.cadence || 'monthly-turn',
      payload: payload || {}
    });
    if(opts.context && typeof A.setEventContext === 'function') A.setEventContext(ev, opts.context);
    if(opts.campaignLogHidden) ev.campaignLogHidden = true;
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = campaign.currentTurn || 1;
    ev.appliedAtDay = campaign.currentDayInMonth || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || (kind + ' applied') },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
      // The Campaign Log filter (campaignLogEntries) reads campaignLogHidden off the WRAPPER (the
      // day-tick / commitStatEdit convention), so set it here too — a routine weekly accrual (R1.5)
      // stays in the Event Log + histories but out of the narrative Campaign Log.
      ...(opts.campaignLogHidden ? { campaignLogHidden: true } : {}) });
    return ev;
  }

  // ── Ledger writes (§4.4) ──────────────────────────────────────────────────

  // Add a divine-power accrual to a character's expiring ledger + emit `divine-power-accrued`.
  // accruedAtTurn/expiresAtTurn default to the active turn + one month; the monthly consumer
  // overrides them (accrual at month-close is "for the upcoming month" — see processReligionForTurn).
  function accrueDivinePower(campaign, charId, amountGp, source, deityId, opts){
    const ch = _findChar(campaign, charId);
    const amt = Math.round(Number(amountGp) || 0);
    if(!ch || amt <= 0) return null;
    opts = opts || {};
    const accruedAtTurn = (opts.accruedAtTurn != null) ? opts.accruedAtTurn : (campaign.currentTurn || 1);
    const expiresAtTurn = (opts.expiresAtTurn != null) ? opts.expiresAtTurn : (accruedAtTurn + 1);
    const dp = _ensureLedger(ch);
    const entry = { accruedAtTurn, accruedAtDay: campaign.currentDayInMonth || 1, amountGp: amt,
                    source: source || 'congregation', deityId: deityId || null, expiresAtTurn };
    dp.entries.push(entry);
    _recordReligionEvent(campaign, 'divine-power-accrued',
      { characterId: charId, amountGp: amt, source: entry.source, deityId: entry.deityId },
      { narrative: (ch.name || charId) + ' receives ' + amt.toLocaleString() + 'gp of divine power (' + entry.source + ')',
        campaignLogHidden: !!opts.campaignLogHidden,
        context: { relatedEntities: [{ kind: 'character', id: charId, role: 'subject' }]
          .concat(entry.deityId ? [{ kind: 'deity', id: entry.deityId, role: 'patron' }] : []) } });
    return entry;
  }
  // GM/UI grant — accrues divine power directly (source 'gm-grant'), spendable from now (default expiry).
  function grantDivinePower(campaign, charId, amountGp, opts){
    return accrueDivinePower(campaign, charId, amountGp, 'gm-grant', (opts && opts.deityId) || null, opts);
  }
  // Drop a character's faded ledger entries (expiry <= currentTurn). Returns the gp wasted.
  function expireDivinePowerFor(campaign, ch){
    if(!ch || !ch.divinePower || !Array.isArray(ch.divinePower.entries)) return 0;
    const currentTurn = _currentTurn(campaign);
    let wasted = 0;
    const keep = [];
    for(const e of ch.divinePower.entries){
      if(e && _entryLive(e, currentTurn)) keep.push(e);
      else wasted += Math.max(0, Number(e && e.amountGp) || 0);
    }
    ch.divinePower.entries = keep;
    return wasted;
  }

  // ── DivineFavor (the character↔deity relation, §4.3) ──────────────────────

  // Get-or-create a character's active patron favor; emits `divine-favor-changed` on creation.
  function ensureDivineFavor(campaign, charId, deityId, opts){
    if(!charId) return null;
    let fav = divineFavorOf(campaign, charId);
    if(fav){
      if(deityId && !fav.deityId) fav.deityId = deityId;
      return fav;
    }
    const A = _A();
    if(typeof A.blankDivineFavor !== 'function') return null;
    fav = A.blankDivineFavor({ characterId: charId, deityId: deityId || null, sinceTurn: campaign.currentTurn || 1 });
    if(!Array.isArray(campaign.divineFavors)) campaign.divineFavors = [];
    campaign.divineFavors.push(fav);
    _recordReligionEvent(campaign, 'divine-favor-changed',
      { characterId: charId, deityId: deityId || null, standing: fav.standing, action: 'established' },
      { narrative: (_findChar(campaign, charId)?.name || charId) + ' takes up the faith',
        context: { relatedEntities: [{ kind: 'character', id: charId, role: 'subject' }]
          .concat(deityId ? [{ kind: 'deity', id: deityId, role: 'patron' }] : []) } });
    return fav;
  }
  // Change a favor's standing (good-standing | lapsed | excommunicate) + emit `divine-favor-changed`.
  // A lapsed/excommunicate caster's accrual is suspended (§4.3) — checked by the consumer.
  function setDivineFavorStanding(campaign, favorId, standing, reason){
    const fav = findDivineFavor(campaign, favorId);
    if(!fav || !standing || fav.standing === standing) return fav || null;
    const prev = fav.standing;
    fav.standing = standing;
    _recordReligionEvent(campaign, 'divine-favor-changed',
      { characterId: fav.characterId, deityId: fav.deityId, standing, previousStanding: prev, reason: reason || '', action: 'standing-change' },
      { narrative: (_findChar(campaign, fav.characterId)?.name || fav.characterId) + ' standing: ' + prev + ' → ' + standing,
        context: { relatedEntities: [{ kind: 'character', id: fav.characterId, role: 'subject' }]
          .concat(fav.deityId ? [{ kind: 'deity', id: fav.deityId, role: 'patron' }] : []) } });
    return fav;
  }

  // ── Congregation actions ──────────────────────────────────────────────────

  // Found a congregation (UI/Inspector convenience): create the entity, ensure the priest's favor,
  // and return it. The favor creation emits `divine-favor-changed`.
  function foundCongregation(campaign, opts){
    const A = _A();
    if(typeof A.blankCongregation !== 'function') return null;
    opts = opts || {};
    const cong = A.blankCongregation({
      name: opts.name || '', deityId: opts.deityId || null,
      highPriestCharacterId: opts.highPriestCharacterId || null,
      templeRef: opts.templeRef || null,
      personalCongregants: Number(opts.personalCongregants) || 0,
      domainWorshipDomainId: opts.domainWorshipDomainId || null,
      foundedAtTurn: campaign.currentTurn || 1
    });
    // Co-extraction over a usurped settlement (Wave E, RR p.388) — a defensive field, not on the factory.
    if(opts.usurpedSettlementId) cong.usurpedSettlementId = opts.usurpedSettlementId;
    if(!Array.isArray(campaign.congregations)) campaign.congregations = [];
    campaign.congregations.push(cong);
    if(opts.highPriestCharacterId && opts.deityId) ensureDivineFavor(campaign, opts.highPriestCharacterId, opts.deityId);
    return cong;
  }
  // Record this month's proselytizing value (charitable spells / missionaries / religious building —
  // §3.2). Accumulates toward the month-end congregant gain. Returns the new accumulator total.
  function addProselytizingValue(campaign, congregationId, gp){
    const cong = findCongregation(campaign, congregationId);
    if(!cong) return 0;
    cong.proselytizingValueThisMonthGp = (Number(cong.proselytizingValueThisMonthGp) || 0) + Math.max(0, Number(gp) || 0);
    return cong.proselytizingValueThisMonthGp;
  }
  // Toggle whether the congregation is tended as a matter of course (autoMaintain) — when off, the GM
  // sets maintainedWeeksThisMonth (0..4) and missed weeks drive decline.
  function setCongregationMaintenance(campaign, congregationId, autoMaintain, weeks){
    const cong = findCongregation(campaign, congregationId);
    if(!cong) return null;
    cong.autoMaintain = (autoMaintain !== false);
    if(weeks != null) cong.maintainedWeeksThisMonth = Math.max(0, Math.min(4, Number(weeks) || 0));
    return cong;
  }

  // ── The magic-research throw (inline stub, §5.5) ──────────────────────────
  // Consecrate-fields/-ruler + the blood-sacrifice bonus each gate on a magic-research throw (RR
  // p.388 — not built). Inline 1d20 + caster modifiers (level/INT-scaled) vs target (default 11+);
  // natural 1 = awry (auto-fail), natural 20 = auto-success. Graduates to the unified Layer-1 throw
  // resolver (Phase 3.6) — a 🔧 tooling stub.
  function rollDivineThrow(campaign, casterId, opts){
    opts = opts || {};
    const ch = _findChar(campaign, casterId);
    const A = _A();
    const intMod = ch ? ((typeof A.abilityMod === 'function') ? A.abilityMod((ch.abilities && ch.abilities.INT) || 10) : 0) : 0;
    const levelMod = ch ? Math.floor((ch.level || 1) / 3) : 0;
    const target = (opts.target != null) ? opts.target : 11;
    const mod = (Number(opts.mod) || 0) + intMod + levelMod;
    const rng = _rng(opts);
    const roll = 1 + Math.floor((rng() || 0) * 20);
    const total = roll + mod;
    const natural1 = roll === 1, natural20 = roll === 20;
    const success = natural20 || (!natural1 && total >= target);
    return { roll, mod, total, target, success, natural1, natural20 };
  }

  // ── Consumers — spending divine power (§3.4 / §5.3) ───────────────────────

  // Consecrate the fields of a domain (RR p.422): spend 2gp DP / family, roll the magic-research
  // throw; success → +1 to domain.consecrationLandValueBonus, natural 1 → −1 (the bonus is recorded
  // on the domain; the Revenue-Collection READ of it is the R3 economy wiring). DP is spent for the
  // performance regardless of the throw's outcome. Emits `consecration`.
  function consecrateFields(campaign, opts){
    opts = opts || {};
    const casterId = opts.casterId, domainId = opts.domainId;
    const ch = _findChar(campaign, casterId), d = _findDomain(campaign, domainId);
    if(!ch) return { ok: false, reason: 'no-caster' };
    if(!d) return { ok: false, reason: 'no-domain' };
    const A = _A();
    const families = (typeof A.totalFamilies === 'function') ? (A.totalFamilies(d) || 0) : ((d.demographics && d.demographics.peasantFamilies) || 0);
    const cost = Math.max(0, families * 2);
    const spend = spendDivinePower(campaign, casterId, cost);
    if(!spend.ok) return { ok: false, reason: 'insufficient-divine-power', cost, available: spend.remaining };
    const throwResult = rollDivineThrow(campaign, casterId, { rng: opts.rng, target: opts.target });
    const delta = throwResult.success ? 1 : (throwResult.natural1 ? -1 : 0);
    d.consecrationLandValueBonus = (Number(d.consecrationLandValueBonus) || 0) + delta;
    _recordReligionEvent(campaign, 'consecration',
      { casterCharacterId: casterId, kind: 'fields', domainId, familiesConsecrated: families,
        divinePowerSpentGp: cost, throwResult, landValueDelta: delta },
      { narrative: (ch.name || casterId) + ' consecrates the fields of ' + (d.name || domainId) + ' — '
        + cost.toLocaleString() + 'gp DP, ' + (delta > 0 ? '+1 Land Value (pending)' : delta < 0 ? '−1 Land Value (awry)' : 'no effect (throw failed)'),
        context: { domainId, relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }, { kind: 'domain', id: domainId, role: 'site' }] } });
    return { ok: true, cost, throwResult, landValueDelta: delta, remaining: spend.remaining };
  }
  // Generic divine-power spend (UI "spend" / DP-for-research no-op seam, §3.4): debit + record a
  // `consecration` event carrying the purpose. The downstream effect (research progress, etc.) is its
  // owning subsystem's job (a no-op seam here).
  function spendDivinePowerForPurpose(campaign, casterId, gp, purpose){
    const ch = _findChar(campaign, casterId);
    const spend = spendDivinePower(campaign, casterId, gp);
    if(!spend.ok) return { ok: false, reason: 'insufficient-divine-power', remaining: spend.remaining };
    _recordReligionEvent(campaign, 'consecration',
      { casterCharacterId: casterId, kind: purpose || 'spend', divinePowerSpentGp: Math.round(Number(gp) || 0), purpose: purpose || 'spend' },
      { narrative: (ch && ch.name || casterId) + ' spends ' + Math.round(Number(gp) || 0).toLocaleString() + 'gp of divine power (' + (purpose || 'spend') + ')',
        context: { relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }] } });
    return { ok: true, spent: spend.spent, remaining: spend.remaining };
  }
  // Pray and sacrifice (RR p.422): return `gp` of divine power to the deity. The DP is debited now;
  // the campaign-XP award (the month's total returned, less the monthly XP threshold) is settled at
  // month end by processReligionForTurn (the threshold is monthly). Updates the favor's lastWorship +
  // emits `divine-favor-changed`. Returns { ok, returned }.
  function prayAndSacrifice(campaign, casterId, gp, opts){
    opts = opts || {};
    const ch = _findChar(campaign, casterId);
    const want = Math.round(Number(gp) || 0);
    if(!ch || want <= 0) return { ok: false, reason: 'nothing-to-return' };
    const spend = spendDivinePower(campaign, casterId, want);
    if(!spend.ok) return { ok: false, reason: 'insufficient-divine-power', remaining: spend.remaining };
    const dp = _ensureLedger(ch);
    dp.prayedThisTurnGp = (Number(dp.prayedThisTurnGp) || 0) + want;
    const fav = divineFavorOf(campaign, casterId);
    if(fav) fav.lastWorshipAtTurn = campaign.currentTurn || 1;
    _recordReligionEvent(campaign, 'divine-favor-changed',
      { characterId: casterId, deityId: fav ? fav.deityId : null, standing: fav ? fav.standing : null,
        action: 'pray-and-sacrifice', divinePowerReturnedGp: want },
      { narrative: (ch.name || casterId) + ' prays and sacrifices ' + want.toLocaleString() + 'gp of divine power to the deity',
        context: { relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }]
          .concat(fav && fav.deityId ? [{ kind: 'deity', id: fav.deityId, role: 'beneficiary' }] : []) } });
    return { ok: true, returned: want, remaining: spend.remaining };
  }

  // ── The monthly-turn consumer (§5.6) — hooked into commitTurn ─────────────
  // Runs per monthly commit (try-guarded by commitTurn). NB: at this point campaign.currentTurn is
  // still the turn being closed (it increments afterward, acks-engine.js), so congregation accrual is
  // stamped FOR the upcoming month (accruedAtTurn = turn+1, expiresAtTurn = turn+2) — spendable next
  // month, fading the month after (RR p.422 "within one month"). No house rule gates this (D2).
  function processReligionForTurn(campaign, options){
    const A = _A();
    const o = options || {};
    const rng = o.rng || Math.random;
    const out = { ran: false, logEntries: [], accruedGp: 0, congregations: 0, expiredGp: 0, xpAwarded: 0 };
    if(!campaign) return out;
    out.ran = true;
    const turn = campaign.currentTurn || 1;
    const congs = Array.isArray(campaign.congregations) ? campaign.congregations : [];

    // 1) Per congregation: proselytize → congregants, maintenance/decline, accrue divine power.
    for(const cong of congs){
      if(!cong) continue;
      if(cong.status && cong.status !== 'active' && cong.status !== 'declining') continue;
      out.congregations++;
      const priestId = cong.highPriestCharacterId;
      const priest = _findChar(campaign, priestId);

      // Proselytizing → congregants: 1d10 + CHA per full 1,000gp of proselytizing value (RR p.421).
      const pv = Number(cong.proselytizingValueThisMonthGp) || 0;
      if(pv >= 1000){
        const thousands = Math.floor(pv / 1000);
        const gain = thousands * Math.max(0, _d10(rng) + _chaBonus(priest));
        const before = cong.personalCongregants || 0;
        let next = before + gain;
        const cap = _realmPopulationCap(campaign, cong);
        if(cap != null) next = Math.min(next, cap);
        cong.personalCongregants = next;
        if(next - before > 0) out.logEntries.push('⛪ ' + _congLabel(cong) + ': +' + (next - before).toLocaleString() + ' congregants from ' + pv.toLocaleString() + 'gp proselytizing');
      }
      cong.proselytizingValueThisMonthGp = 0;

      // Maintenance / decline: each un-maintained week loses 1d10! per 1,000 congregants (RR p.421).
      const weeks = congregationMaintainedWeeks(cong);
      if(weeks < 4){
        const missed = 4 - weeks;
        let lost = 0;
        for(let w = 0; w < missed; w++){
          const units = Math.max(1, Math.floor((cong.personalCongregants || 0) / 1000));
          lost += _explodingD10(rng) * units;
        }
        lost = Math.min(lost, cong.personalCongregants || 0);
        if(lost > 0){ cong.personalCongregants = Math.max(0, (cong.personalCongregants || 0) - lost); }
        cong.status = 'declining';
        out.logEntries.push('⛪ ' + _congLabel(cong) + ': ' + missed + ' week(s) untended — lost ' + lost.toLocaleString() + ' congregants');
      } else if(cong.status === 'declining'){
        cong.status = 'active'; // a fully-tended month recovers the congregation's standing
      }

      // Divine-power accrual for the high priest (the favor must not be lapsed/excommunicate, §4.3).
      // R1.5 reconciliation: a day-tick weekly grain (proposeReligionDay / commitReligionWeek) may
      // already have accrued some maintained weeks this month — cong._weeklyDpAccruedWeeks (read
      // DEFENSIVELY: absent ⇒ 0 ⇒ the full monthly batch, so the Day-Clock-NOT-engaged path is
      // byte-identical to R1). The monthly consumer tops up only the REMAINING maintained weeks, so
      // the two cadences total the same DP over the month (§5.7 "equals the monthly batch over 4 weeks").
      const fav = priestId ? divineFavorOf(campaign, priestId) : null;
      const suspended = fav && fav.standing && fav.standing !== 'good-standing';
      const maintainedWeeks = congregationMaintainedWeeks(cong);
      const alreadyAccruedWeeks = Math.max(0, Math.min(maintainedWeeks, Number(cong._weeklyDpAccruedWeeks) || 0));
      const weeksToAccrue = Math.max(0, maintainedWeeks - alreadyAccruedWeeks);
      const monthly = suspended ? 0 : (congregationWeeklyDivinePowerGp(campaign, cong) * weeksToAccrue);
      if(monthly > 0 && priestId){
        const personal = congregationPersonalWeeklyGp(cong) > 0;
        const domain = congregationDomainWorshipWeeklyGp(campaign, cong) > 0;
        const coExtract = congregationUsurpedSettlementWeeklyGp(campaign, cong) > 0;
        const source = (coExtract && !personal && !domain) ? 'co-extraction'   // Wave E (RR p.388, Balbus)
          : (domain && !personal) ? 'domain-worship' : 'congregation';
        accrueDivinePower(campaign, priestId, monthly, source, cong.deityId,
          { accruedAtTurn: turn + 1, expiresAtTurn: turn + 2 });
        out.accruedGp += monthly;
        out.logEntries.push('⛪ ' + (priest && priest.name || priestId) + ' accrues ' + monthly.toLocaleString() + 'gp divine power from ' + _congLabel(cong)
          + (alreadyAccruedWeeks > 0 ? ' (monthly top-up — ' + alreadyAccruedWeeks + ' week(s) already accrued via the Day Clock)' : ''));
      } else if(suspended && priestId){
        out.logEntries.push('⛪ ' + _congLabel(cong) + ': accrual suspended (' + (fav.standing) + ')');
      }

      // Reset the per-month trackers for the next month: the GM maintenance count AND the day-tick
      // weekly-accrual counter (so next month's monthly batch is full again unless the Day Clock runs).
      if(cong.autoMaintain === false) cong.maintainedWeeksThisMonth = 0;
      cong._weeklyDpAccruedWeeks = 0;
    }

    // 2) Per character: expire faded divine power, then award pray-and-sacrifice XP (monthly threshold).
    let prayerAwarded = false;
    for(const ch of (Array.isArray(campaign.characters) ? campaign.characters : [])){
      if(!ch || !ch.divinePower) continue;
      const wasted = expireDivinePowerFor(campaign, ch);
      if(wasted > 0){ out.expiredGp += wasted; out.logEntries.push('⛪ ' + (ch.name || ch.id) + ': ' + wasted.toLocaleString() + 'gp divine power faded unspent'); }

      const prayed = Number(ch.divinePower.prayedThisTurnGp) || 0;
      if(prayed > 0){
        const threshold = (typeof A.computeGpThreshold === 'function') ? (A.computeGpThreshold(ch.level || 1) || 0) : 0;
        const xpGain = Math.max(0, prayed - threshold);
        if(xpGain > 0){
          ch.xp = (ch.xp || 0) + xpGain;
          out.xpAwarded += xpGain;
          prayerAwarded = true;
          if(typeof A.addCharacterHistory === 'function'){
            A.addCharacterHistory(campaign, ch, 'xp',
              '+' + xpGain.toLocaleString() + ' XP from prayer & sacrifice (' + prayed.toLocaleString() + 'gp DP returned − threshold ' + threshold.toLocaleString() + 'gp)',
              { xp: xpGain, source: 'divine' });
          }
          out.logEntries.push('⛪ ' + (ch.name || ch.id) + ': +' + xpGain.toLocaleString() + ' XP from prayer & sacrifice');
        }
        ch.divinePower.prayedThisTurnGp = 0;
      }
    }
    // Prayer XP can push a caster over a level — re-run the (idempotent) level-up sweep so it takes
    // effect this turn (the main commitTurn sweep ran earlier, before this hook).
    if(prayerAwarded && typeof A.checkAllCharacterLevelUps === 'function'){
      try { A.checkAllCharacterLevelUps(campaign); } catch(_){}
    }

    // 3) Divine wrath — the consequence of arcane usurpation (RR p.388, Wave E). Escalates the gods' wrath
    // on each usurped settlement (one GM-resolved divine-wrath manifestation per month) + fades it where the
    // usurpation has ended. Runs after the morale/revenue passes (commitTurn settles them before this hook).
    try {
      const wrath = processDivineWrathForTurn(campaign, { rng });
      (wrath.logEntries || []).forEach(l => out.logEntries.push(l));
      out.wrathManifestations = wrath.manifestations;
      out.wrathFaded = wrath.faded;
    } catch(_){ /* never let the wrath pass fail the religion consumer */ }

    // 4) === @b10-religion (team) — Religion R3: expire the 12-month consecrate-ruler buff (RR p.422). The
    // economy/loyalty READS gate on liveness (expiresAtTurn > currentTurn); this is GC — drop the stale
    // object + log once it is no longer live (expiresAtTurn <= the turn being closed). NO new commitTurn
    // line: it rides the shipped monthly consumer (consecrationBuff is a defensive field — no migration). ===
    for(const d of (Array.isArray(campaign.domains) ? campaign.domains : [])){
      if(d && d.consecrationBuff && (Number(d.consecrationBuff.expiresAtTurn) || 0) <= turn){
        out.logEntries.push('📿 The divine consecration of ' + (d.name || d.id) + ' fades');
        d.consecrationBuff = null;
      }
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Religion R2 — Blood Sacrifice, the Chaotic path (Phase_4_Religion_Plan.md §3.3 / §5.4)
  // ════════════════════════════════════════════════════════════════════════════
  // Default-ON core RAW (RR pp.421–422) — NO house rule gates it (D3), presented mechanically.
  // A divine caster spills a victim's life to earn divine power: the BASE (= the victim's component
  // value, usually its XP value) is always earned; the victim-characteristic MULTIPLIERS are added
  // only on a successful magic-research throw (the same rollDivineThrow R1 uses). Alignment gates the
  // act (RR p.422): Lawful/Neutral casters can NEVER sacrifice sapient creatures (only exceptional
  // animals, helpless); Chaotic casters take a willing victim. A few cases YIELD NOTHING though the
  // act happens (an unwilling Chaotic-aligned victim; a deity for whom animal sacrifice is pure
  // devotion — the Auran Empyrean rule). The yield routes to the DIVINE ledger for divine casters,
  // or to ARCANE storage ×2 (indefinitely) for warlock/demonologist Power-of-Sacrifice classes (§5.4)
  // — the act is class-agnostic; only the DESTINATION of the power is class-dependent.

  // The victim-characteristic multipliers (RR p.422). Each adds (component value × N) to the BONUS,
  // earned only on a successful magic-research throw; they STACK. Keys are the GM/UI's checkbox set.
  const SACRIFICE_MULTIPLIERS = Object.freeze({
    'virgin': 1,            // + component value
    'opposite-faith': 2,    // a divine caster of opposite alignment/faith: + ×2
    'noble': 3,             // ruler/heir, barony→duchy: + ×3
    'royal': 5,             // ruler/heir, principality/kingdom/empire: + ×5
    'beloved': 10           // parent, mature descendant, or beloved of the sacrificer: + ×10
  });

  // Does this character store ARCANE power from sacrifice (warlock/demonologist Power of Sacrifice,
  // §5.4)? Detected from class powers or the known arcane-sacrifice classes. These store ×2 indefinitely.
  function hasPowerOfSacrifice(ch){
    if(!ch) return false;
    const powers = Array.isArray(ch.classPowers) ? ch.classPowers : [];
    if(powers.some(p => /power\s*of\s*sacrifice/i.test(typeof p === 'string' ? p : (p && (p.name || p.key || p.label || ''))))) return true;
    const cls = (ch.class || '').toLowerCase();
    return cls.includes('warlock') || cls.includes('demonologist');
  }
  // The caster's effective alignment for sacrifice (prefer the patron deity's, else the character's).
  function _sacrificeAlignment(campaign, ch){
    const deity = ch ? deityOf(campaign, ch.id) : null;
    return (deity && deity.alignment) || (ch && ch.alignment) || 'Neutral';
  }
  // Resolve the victim's component value (= its XP value, §3.3): an explicit override wins, else a
  // MONSTER_CATALOG key's XP, else a victim character's XP total (the Mentu/Balbus 1,600 example).
  function sacrificeComponentValue(campaign, opts){
    opts = opts || {};
    if(opts.componentValueGp != null) return Math.max(0, Math.round(Number(opts.componentValueGp) || 0));
    if(opts.monsterCatalogKey){
      const A = _A();
      const mon = (typeof A.findMonster === 'function') ? A.findMonster(opts.monsterCatalogKey) : null;
      return mon ? Math.max(0, Math.round(Number(mon.xp) || 0)) : 0;
    }
    if(opts.victimCharacterId){
      const v = _findChar(campaign, opts.victimCharacterId);
      return v ? Math.max(0, Math.round(Number(v.xp) || 0)) : 0;
    }
    return 0;
  }
  // Sum the selected multipliers (unknown keys ignored).
  function sacrificeMultiplierSum(multipliers){
    if(!Array.isArray(multipliers)) return 0;
    return multipliers.reduce((s, k) => s + (SACRIFICE_MULTIPLIERS[k] || 0), 0);
  }

  // Perform a blood sacrifice (RR pp.421–422). Returns a rich result:
  //   { ok, reason?, componentValue, multipliers, sumMultiplier, throwResult, base, bonus, gained,
  //     divinePowerGained, arcaneStoredGp, arcane, yieldsNothing, yieldReason }
  // opts: { casterId, componentValueGp | monsterCatalogKey | victimCharacterId, multipliers[],
  //         victimSapient, victimWilling, victimHelpless, victimAlignment, venueRef, rng, target }
  function bloodSacrifice(campaign, opts){
    opts = opts || {};
    const ch = _findChar(campaign, opts.casterId);
    if(!ch) return { ok: false, reason: 'no-caster' };
    const align = _sacrificeAlignment(campaign, ch);
    const isChaoticCaster = align === 'Chaotic';
    const victimSapient = !!opts.victimSapient;
    const victimWilling = !!opts.victimWilling;
    const victimAlignment = opts.victimAlignment || null;
    const deity = deityOf(campaign, opts.casterId);

    // ── Gates that BLOCK the act (return ok:false) ──
    // A deity that accepts no blood sacrifice refuses (RR p.422).
    if(deity && deity.acceptsBloodSacrifice === 'none') return { ok: false, reason: 'deity-refuses-sacrifice' };
    // Lawful/Neutral casters can NEVER sacrifice sapient creatures — only exceptional animals (RR p.422).
    if(!isChaoticCaster && victimSapient) return { ok: false, reason: 'lawful-cannot-sacrifice-sapient' };
    // A deity that accepts only animals blocks a sapient victim regardless of caster alignment.
    if(deity && deity.acceptsBloodSacrifice === 'animals-only' && victimSapient) return { ok: false, reason: 'deity-accepts-animals-only' };
    // Lawful/Neutral sacrifice requires a HELPLESS victim (RR p.422) — an explicit not-helpless blocks.
    if(!isChaoticCaster && opts.victimHelpless === false) return { ok: false, reason: 'victim-not-helpless' };

    const componentValue = sacrificeComponentValue(campaign, opts);

    // ── Cases where the act HAPPENS but YIELDS NOTHING (0 power) ──
    let yieldsNothing = false, yieldReason = null;
    // Sacrificing an unwilling Chaotic-aligned victim yields nothing (RR p.422).
    if(isChaoticCaster && victimAlignment === 'Chaotic' && !victimWilling){ yieldsNothing = true; yieldReason = 'unwilling-chaotic-yields-nothing'; }
    // Auran Empyrean rule: animal sacrifice yields the CASTER nothing — it all goes to the god as devotion.
    if(deity && deity.sacrificeAsDevotion && !victimSapient){ yieldsNothing = true; yieldReason = 'animal-sacrifice-is-devotion'; }

    // ── The yield: base always earned; the multiplier bonus only on a successful magic-research throw ──
    const multKeys = Array.isArray(opts.multipliers) ? opts.multipliers.filter(k => SACRIFICE_MULTIPLIERS[k]) : [];
    const sumMult = sacrificeMultiplierSum(multKeys);
    const throwResult = (sumMult > 0 && !yieldsNothing)
      ? rollDivineThrow(campaign, opts.casterId, { rng: opts.rng, target: opts.target })
      : null;
    const base = yieldsNothing ? 0 : componentValue;
    const bonus = (yieldsNothing || !throwResult || !throwResult.success) ? 0 : (componentValue * sumMult);
    const gained = base + bonus;

    // ── Route the power: arcane Power-of-Sacrifice → arcane store ×2 (non-expiring seam); else the
    // expiring divine ledger (source 'blood-sacrifice', spendable now, fades next month — RR p.422). ──
    const arcane = hasPowerOfSacrifice(ch);
    let divinePowerGained = 0, arcaneStoredGp = 0;
    if(gained > 0){
      if(arcane){
        // Reserved seam — Magic Research (Phase 4.6) consumes character.arcanePowerStoreGp.
        // (init-on-write, read defensively elsewhere; NOT the divine ledger, so it never reads as DP.)
        arcaneStoredGp = gained * 2;
        ch.arcanePowerStoreGp = (Number(ch.arcanePowerStoreGp) || 0) + arcaneStoredGp;
      } else {
        const turn = campaign.currentTurn || 1;
        accrueDivinePower(campaign, opts.casterId, gained, 'blood-sacrifice', deity ? deity.id : null,
          { accruedAtTurn: turn, expiresAtTurn: turn + 1 });
        divinePowerGained = gained;
      }
    }
    // Stamp the favor's last-sacrifice turn (if a favor exists).
    const fav = divineFavorOf(campaign, opts.casterId);
    if(fav) fav.lastSacrificeAtTurn = campaign.currentTurn || 1;

    // ── Record the blood-sacrifice event (the §8.9 context envelope: caster + the site) ──
    const victimRef = opts.victimRef || (opts.victimCharacterId ? { kind: 'character', id: opts.victimCharacterId }
      : opts.monsterCatalogKey ? { kind: 'monster', key: opts.monsterCatalogKey } : null);
    const narrative = (ch.name || opts.casterId) + ' offers up '
      + (victimRef && (victimRef.id || victimRef.key || victimRef.label) ? (victimRef.label || victimRef.id || victimRef.key) : 'a victim')
      + ' — ' + (yieldsNothing ? 'no power earned (' + yieldReason + ')'
        : (arcane ? arcaneStoredGp.toLocaleString() + 'gp arcane power stored' : divinePowerGained.toLocaleString() + 'gp divine power'))
      + (throwResult ? (throwResult.success ? ' [multipliers earned]' : ' [multipliers lost — throw failed]') : '');
    const ctxRel = [{ kind: 'character', id: opts.casterId, role: 'subject' }];
    if(victimRef && victimRef.id) ctxRel.push({ kind: victimRef.kind || 'character', id: victimRef.id, role: 'victim' });
    if(deity) ctxRel.push({ kind: 'deity', id: deity.id, role: 'beneficiary' });
    const siteRef = opts.venueRef || null;
    _recordReligionEvent(campaign, 'blood-sacrifice',
      { casterCharacterId: opts.casterId, victimRef, componentValueGp: componentValue, multipliers: multKeys,
        throwResult, divinePowerGained, arcaneStoredGp, yieldsNothing, deityId: deity ? deity.id : null },
      { narrative, cadence: 'action',
        context: { primaryHexId: (siteRef && siteRef.kind === 'hex') ? siteRef.id : null,
          settlementId: (siteRef && siteRef.kind === 'settlement') ? siteRef.id : null,
          relatedEntities: ctxRel } });

    return { ok: true, componentValue, multipliers: multKeys, sumMultiplier: sumMult, throwResult,
      base, bonus, gained, divinePowerGained, arcaneStoredGp, arcane, yieldsNothing, yieldReason };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Religion Wave E — the divine consequence of arcane usurpation (RR p.388)
  // ════════════════════════════════════════════════════════════════════════════
  // The Arcane Domain's AD-F seam (acks-engine-sanctums.js) lets a mage designate a settlement his
  // "dungeon," terrify the peasants, and extract arcane power — stamping settlement.arcaneUsurpedByCharacterId
  // + emitting `arcane-usurpation`. This is the Religion-side CONSUMER. RR p.388: "deities … do not
  // appreciate having their worship usurped … casters who … extract arcane power from human and demi-human
  // realms will certainly be confronted by the servants and soldiers of the gods." The producer ships NO
  // divine mechanics (clearArcaneUsurpation emits no event — "the divine lifecycle is Religion's").
  //
  // (A) Divine WRATH — RAW gives the PRINCIPLE, no mechanic (no dice/save/force) → a faithful 🔧 model:
  // wrath escalates monthly while the usurpation persists (settlement.divineWrath — defensive, the
  // arcaneUsurpedByCharacterId precedent: init-on-write, read defensively, NO factory/schema/migration),
  // manifesting one GM-resolved `divine-wrath` event per month sized by the settlement's families-XP (the
  // magnitude of the offended faithful). The engine proposes + sizes; the GM stages the confrontation (the
  // incursion / E10-banditry idiom — principle #1). Wrath FADES once the usurpation is cleared (the gods'
  // anger cools a step per month). Apotheosis upkeep (the seam's third item) stays R6 (the Phase 4.6 ritual).
  //
  // (B) Divine CO-EXTRACTION — congregationUsurpedSettlementWeeklyGp (folded into the accrual above) owns
  // the chaplain-profits half; this section owns the wrath.

  const FAMILY_XP_RELIGION = 5; // a peasant family ≈ a 0-level Man, Common (MM); mirrors sanctums' FAMILY_XP

  function _settlements(campaign){ return (campaign && Array.isArray(campaign.settlements)) ? campaign.settlements : []; }
  function _findSettlement(campaign, id){
    if(id && typeof id === 'object') return id;
    const A = _A();
    if(typeof A.findSettlement === 'function'){ const s = A.findSettlement(campaign, id); if(s) return s; }
    return _settlements(campaign).find(s => s && s.id === id) || null;
  }
  // The XP value of a settlement's peasant families (the offense magnitude). Prefer the producer's
  // settlementFamiliesXp (DRY — the same FAMILY_XP basis even if it later refines), else families × 5.
  function _settlementFamiliesXp(campaign, settlement){
    const A = _A();
    if(typeof A.settlementFamiliesXp === 'function') return A.settlementFamiliesXp(campaign, settlement) || 0;
    const s = (typeof settlement === 'string') ? _findSettlement(campaign, settlement) : settlement;
    return s ? Math.max(0, Math.round((Number(s.families) || 0) * FAMILY_XP_RELIGION)) : 0;
  }
  // The settlement's embedding hex (for the event's Event.context) — settlements store no hexId of their own.
  function _settlementHexId(campaign, settlement){
    if(settlement && settlement.hexId) return settlement.hexId;
    const sid = settlement && settlement.id;
    if(!sid || !campaign || !Array.isArray(campaign.hexes)) return null;
    const h = campaign.hexes.find(x => x && ((x.settlement && x.settlement.id === sid) || x.settlementId === sid));
    return h ? h.id : null;
  }

  // The wrath severity at a given level (RR p.388 — "the servants AND soldiers of the gods"). 🔧 escalation
  // model: 1 = portent (a warning + a month's grace), 2 = servants, 3+ = soldiers. RAW gives the principle.
  function wrathSeverityForLevel(level){
    const n = Math.max(0, Math.round(Number(level) || 0));
    if(n <= 0) return 'none';
    if(n === 1) return 'portent';
    if(n === 2) return 'servants';
    return 'soldiers';
  }
  // The XP value of the divine retribution force the GM stages — scaled by the offense magnitude (familiesXp)
  // and how long the usurpation has persisted (level). Level 1 = 0 (the portent + a month's grace); level 2
  // = familiesXp (the servants come); level 3+ = familiesXp × (level − 1) (escalating soldiers). 🔧.
  function divineWrathForceXp(familiesXp, level){
    const fx = Math.max(0, Math.round(Number(familiesXp) || 0));
    const n = Math.max(0, Math.round(Number(level) || 0));
    return fx * Math.max(0, n - 1);
  }
  // Read a settlement's current divine-wrath state (defensive — absent ⇒ null).
  function settlementDivineWrath(campaign, settlement){
    const s = (typeof settlement === 'string') ? _findSettlement(campaign, settlement) : settlement;
    return (s && s.divineWrath) || null;
  }

  // The monthly divine-wrath pass (called from processReligionForTurn). For each settlement: if currently
  // usurped, escalate the wrath one step + manifest one GM-resolved `divine-wrath` event (sized by
  // familiesXp); else, if it carries lingering wrath, fade it a step (cleared at 0). Returns
  // { ran, logEntries, manifestations, faded }.
  function processDivineWrathForTurn(campaign, options){
    options = options || {};
    const out = { ran: false, logEntries: [], manifestations: 0, faded: 0 };
    if(!campaign) return out;
    out.ran = true;
    const turn = campaign.currentTurn || 1;
    for(const s of _settlements(campaign)){
      if(!s) continue;
      const usurperId = s.arcaneUsurpedByCharacterId || null;
      if(usurperId){
        // Escalate (RR p.388 — the longer the usurpation persists, the harder the gods come).
        let w = s.divineWrath;
        if(!w || typeof w !== 'object'){ w = s.divineWrath = { level: 0, sinceTurn: turn, usurperCharacterId: usurperId, lastManifestTurn: null }; }
        w.usurperCharacterId = usurperId;
        w.level = Math.max(0, Number(w.level) || 0) + 1;
        w.lastManifestTurn = turn;
        const familiesXp = _settlementFamiliesXp(campaign, s);
        const severity = wrathSeverityForLevel(w.level);
        const forceXp = divineWrathForceXp(familiesXp, w.level);
        const usurper = _findChar(campaign, usurperId);
        const who = (usurper && usurper.name) || usurperId;
        const sLabel = s.name || s.id;
        const narrative = (severity === 'portent')
          ? 'The gods stir against ' + who + '’s usurpation of ' + sLabel + ' — dire portents (RR p.388)'
          : 'The ' + severity + ' of the gods confront ' + who + ' at ' + sLabel + ' — a divine retribution worth ' + forceXp.toLocaleString() + ' XP (RR p.388; the GM stages the confrontation)';
        _recordReligionEvent(campaign, 'divine-wrath',
          { settlementId: s.id, usurperCharacterId: usurperId, level: w.level, severity, familiesXp, forceXp },
          { narrative,
            context: { primaryHexId: _settlementHexId(campaign, s), settlementId: s.id,
              relatedEntities: [{ kind: 'character', id: usurperId, role: 'subject' }, { kind: 'settlement', id: s.id, role: 'site' }] } });
        out.manifestations++;
        out.logEntries.push('⚖ Divine wrath at ' + sLabel + ': ' + severity
          + (forceXp > 0 ? ' — a ' + forceXp.toLocaleString() + ' XP retribution confronts ' + who : ' — the gods give warning'));
      } else if(s.divineWrath && (Number(s.divineWrath.level) || 0) > 0){
        // The usurpation has ended — the gods' anger cools a step (cleared at 0; a quiet record).
        s.divineWrath.level = Math.max(0, (Number(s.divineWrath.level) || 0) - 1);
        out.faded++;
        if(s.divineWrath.level <= 0){
          s.divineWrath = null;
          out.logEntries.push('⚖ The gods are appeased at ' + (s.name || s.id) + ' — the usurpation has ended');
        } else {
          out.logEntries.push('⚖ The gods’ wrath cools at ' + (s.name || s.id) + ' (level ' + s.divineWrath.level + ')');
        }
      }
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Religion R1.5 — the day-tick weekly grain (Phase_4_Religion_Plan.md §5.7)
  // ════════════════════════════════════════════════════════════════════════════
  // The shipped day-tick pipeline (Calendar #478) lets congregation accrual run at its true WEEKLY
  // grain when the GM advances days, instead of one lump at month-close. Self-registers the 'religion'
  // day-consumer at SLOT 52 (after Construction 50, before the encounter stack 80 — the ⚠ slot fix in
  // §5.7; weather is 1). Each completed week of the 30-day month (days 7/14/21/28 → weeks 1–4) credits
  // one week of DP to each maintained congregation's high priest. The monthly consumer
  // (processReligionForTurn) then tops up only the REMAINING weeks, so the two cadences total the same
  // DP (the reconciliation lives there, via the transient cong._weeklyDpAccruedWeeks counter). When the
  // Day Clock is NOT engaged the counter stays 0 and the monthly batch is byte-identical to R1.
  //
  // Records are informational (no pause trigger — religious upkeep never interrupts travel, §5.7). The
  // actual ledger write + the divine-power-accrued event happen in commitReligionWeek via the shared
  // accrueDivinePower (campaignLogHidden — routine weekly accrual stays out of the narrative Campaign
  // Log, in the Event Log + histories per the Travel-pivot day-tick convention).

  // Which week (1..4) a day completes, or 0 if the day is not a week boundary (or past week 4).
  function _religionWeekBoundary(dayInMonth){
    const d = Number(dayInMonth) || 0;
    if(d % 7 !== 0 || d > 28) return 0;
    return d / 7;
  }
  // PROPOSE (pure): on a week-boundary day, propose one accrual record per maintained, not-yet-accrued
  // congregation. Reads cong._weeklyDpAccruedWeeks defensively (absent ⇒ 0). Untended weeks accrue
  // nothing (their decline is settled monthly); a suspended (lapsed/excommunicate) priest accrues nothing.
  function proposeReligionDay(campaign, ctx){
    const out = { pendingRecords: [], notableEvents: [], encounters: [] };
    if(!campaign) return out;
    ctx = ctx || {};
    const weekNumber = _religionWeekBoundary(ctx.dayInMonth || campaign.currentDayInMonth || 1);
    if(weekNumber <= 0) return out;
    const congs = Array.isArray(campaign.congregations) ? campaign.congregations : [];
    for(const cong of congs){
      if(!cong) continue;
      if(cong.status && cong.status !== 'active' && cong.status !== 'declining') continue;
      if(weekNumber > congregationMaintainedWeeks(cong)) continue;          // untended week — decline is monthly
      if(weekNumber <= Math.max(0, Number(cong._weeklyDpAccruedWeeks) || 0)) continue;   // already accrued (idempotency)
      const priestId = cong.highPriestCharacterId;
      if(!priestId) continue;
      const fav = divineFavorOf(campaign, priestId);
      if(fav && fav.standing && fav.standing !== 'good-standing') continue; // accrual suspended (§4.3)
      const weeklyGp = congregationWeeklyDivinePowerGp(campaign, cong);
      if(weeklyGp <= 0) continue;
      out.pendingRecords.push({
        kind: 'religion-week', consumer: 'religion', congregationId: cong.id, weekNumber: weekNumber,
        weeklyDivinePowerGp: weeklyGp, highPriestCharacterId: priestId, deityId: cong.deityId || null,
        label: '⛪ ' + _congLabel(cong) + ' — week ' + weekNumber + ': +' + weeklyGp.toLocaleString()
          + 'gp divine power for ' + ((_findChar(campaign, priestId) || {}).name || priestId)
      });
    }
    return out;
  }
  // COMMIT: apply a ratified weekly record — credit the week (advance the high-water counter) + accrue
  // the week's DP to the high priest (spendable now, fades next month). Idempotent: a week already
  // credited (commit applied twice / the propose-then-commit pass) is a no-op.
  function commitReligionWeek(campaign, record){
    if(!campaign || !record || record.kind !== 'religion-week') return;
    const cong = findCongregation(campaign, record.congregationId);
    if(!cong) return;
    const weekNumber = Number(record.weekNumber) || 0;
    if(weekNumber <= Math.max(0, Number(cong._weeklyDpAccruedWeeks) || 0)) return;   // already accrued
    cong._weeklyDpAccruedWeeks = weekNumber;                                          // weeks 1..weekNumber credited
    const gp = Math.round(Number(record.weeklyDivinePowerGp) || 0);
    if(gp > 0 && record.highPriestCharacterId){
      const turn = campaign.currentTurn || 1;
      accrueDivinePower(campaign, record.highPriestCharacterId, gp, 'congregation', record.deityId,
        { accruedAtTurn: turn, expiresAtTurn: turn + 1, campaignLogHidden: true });
    }
  }

  // Self-register the slot-52 religion day-consumer (the weather/construction module pattern;
  // registerDayConsumer ships from acks-engine.js, loaded before this module).
  if(typeof ACKS.registerDayConsumer === 'function'){
    ACKS.registerDayConsumer('religion', {
      handler: proposeReligionDay,
      order: 52,
      pauseTriggers: [],
      commit: commitReligionWeek
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Religion R3 — Using divine power: consecration + the buff effects (Phase_4_Religion_Plan.md §3.4/§5.3)
  // ════════════════════════════════════════════════════════════════════════════
  // consecrate-FIELDS shipped in R1 above (records domain.consecrationLandValueBonus — now READ by the
  // economy at Revenue Collection, §9.1). R3 adds consecrate-ALTAR (→ a Place-of-Power stub on the
  // settlement) + consecrate-RULER (→ a 12-month domain.consecrationBuff: +1 morale / +1 vassal loyalty /
  // vagary advantage), the buff accessors the economy + the F&D loyalty roll read, and the buff GC in the
  // monthly consumer above. RAW core — no house rule (D2). Every new field (consecrationBuff,
  // lastRulerConsecrationTurn, settlement.placesOfPower[] entries, character.overcastTargetBonus) is
  // DEFENSIVE — init-on-write, NOT on any factory, NOT in migrateCampaign — so templates/demo stay
  // migrate-no-ops (religion.smoke §R0 guard).

  // Consecrate an altar (RR p.422): a dedicated act (1 day / 500gp of altar value); spend DP = the altar
  // value (or a humbler explicit divinePowerGp). Creates a Place of Power — a pinnacle of good (Lawful) or
  // a sinkhole of evil (Chaotic), 100 sq ft per 100gp — recorded as a STUB on settlement.placesOfPower[]
  // (Sanctums owns the on-site effects + the formal entity/prefix when it lands, §5.3). No throw. Emits
  // `consecrate-altar`. (The sinkhole also satisfies the blood-sacrifice venue requirement, R2.)
  function consecrateAltar(campaign, opts){
    opts = opts || {};
    const casterId = opts.casterId, settlementId = opts.settlementId;
    const ch = _findChar(campaign, casterId);
    if(!ch) return { ok: false, reason: 'no-caster' };
    const s = _findSettlement(campaign, settlementId);
    if(!s) return { ok: false, reason: 'no-settlement' };
    const altarValueGp = Math.max(0, Math.round(Number(opts.altarValueGp) || 0));
    if(altarValueGp <= 0) return { ok: false, reason: 'no-altar-value' };
    const cost = Math.max(0, Math.round(Number(opts.divinePowerGp != null ? opts.divinePowerGp : altarValueGp) || 0));
    const spend = spendDivinePower(campaign, casterId, cost);
    if(!spend.ok) return { ok: false, reason: 'insufficient-divine-power', cost, available: spend.remaining };
    const deity = deityOf(campaign, casterId);
    const align = (deity && deity.alignment) || ch.alignment || 'Neutral';
    const kind = (align === 'Chaotic') ? 'sinkhole' : 'pinnacle';   // sinkhole of evil / pinnacle of good (RR p.422)
    const pop = {
      id: 'pop-' + Math.random().toString(36).slice(2, 9),          // a Place-of-Power STUB (Sanctums formalizes the entity + prefix)
      kind, rank: 'minor', sizeSqFt: altarValueGp,                  // 100 sq ft / 100gp → 1 sq ft / gp
      deityId: deity ? deity.id : null, sourceAltarValueGp: altarValueGp,
      consecratedByCharacterId: casterId, consecratedAtTurn: campaign.currentTurn || 1, dispelled: false
    };
    if(!Array.isArray(s.placesOfPower)) s.placesOfPower = [];
    s.placesOfPower.push(pop);
    _recordReligionEvent(campaign, 'consecrate-altar',
      { casterCharacterId: casterId, settlementId, altarValueGp, divinePowerSpentGp: cost, placeOfPowerKind: kind, placeOfPowerId: pop.id },
      { narrative: (ch.name || casterId) + ' consecrates ' + (kind === 'sinkhole' ? 'a sinkhole of evil' : 'a pinnacle of good') + ' at ' + (s.name || settlementId) + ' — ' + cost.toLocaleString() + 'gp DP',
        context: { settlementId, primaryHexId: _settlementHexId(campaign, s),
          relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }, { kind: 'settlement', id: settlementId, role: 'site' }] } });
    return { ok: true, cost, placeOfPower: pop, remaining: spend.remaining };
  }

  // Consecrate a ruler (RR p.422): a 9th+ divine caster (the domain's chaplain) blesses its ruler — a
  // dedicated act, ONCE PER YEAR (12 months). Spend DP = the ruler's monthly domain revenue; a magic-
  // research throw. Success → a 12-month buff (domain base morale +1, +1 vassal loyalty, vagaries rolled
  // twice take-better). Natural 1 → the awry buff (−1 morale, −1 loyalty, vagary disadvantage). DP is
  // spent regardless of the throw; a plain failure (not a nat-1) grants no buff. Emits `consecrate-ruler`.
  function consecrateRuler(campaign, opts){
    opts = opts || {};
    const casterId = opts.casterId, domainId = opts.domainId;
    const ch = _findChar(campaign, casterId), d = _findDomain(campaign, domainId);
    if(!ch) return { ok: false, reason: 'no-caster' };
    if(!d) return { ok: false, reason: 'no-domain' };
    if((ch.level || 1) < 9) return { ok: false, reason: 'caster-below-9th' };
    if(!isDivineCaster(ch)) return { ok: false, reason: 'not-divine-caster' };
    const turn = campaign.currentTurn || 1;
    const last = Number(d.lastRulerConsecrationTurn);
    if(!isNaN(last) && (turn - last) < 12) return { ok: false, reason: 'already-consecrated-this-year', nextTurn: last + 12 };
    const A = _A();
    const revenue = Math.max(0, Math.round(
      (typeof A.monthlyGrossIncome === 'function') ? (A.monthlyGrossIncome(campaign, d) || 0)
      : (typeof A.domainIncome === 'function') ? (A.domainIncome(campaign, d) || 0) : 0));
    const spend = spendDivinePower(campaign, casterId, revenue);
    if(!spend.ok) return { ok: false, reason: 'insufficient-divine-power', cost: revenue, available: spend.remaining };
    const throwResult = rollDivineThrow(campaign, casterId, { rng: opts.rng, target: opts.target });
    d.lastRulerConsecrationTurn = turn;                              // the rite was performed (1×/year gate) regardless of the throw
    const rulerId = d.rulerCharacterId
      || ((typeof A.rulerCharacter === 'function') ? ((A.rulerCharacter(campaign, d) || {}).id) : null) || null;
    let buff = null;
    if(throwResult.success){
      buff = { grantedAtTurn: turn, expiresAtTurn: turn + 12, moraleBonus: 1, loyaltyBonus: 1, vagaryAdvantage: true, awry: false };
    } else if(throwResult.natural1){
      buff = { grantedAtTurn: turn, expiresAtTurn: turn + 12, moraleBonus: -1, loyaltyBonus: -1, vagaryAdvantage: false, vagaryDisadvantage: true, awry: true };
    }
    if(buff) d.consecrationBuff = buff;                              // a plain throw failure grants no buff (DP still spent)
    _recordReligionEvent(campaign, 'consecrate-ruler',
      { casterCharacterId: casterId, rulerCharacterId: rulerId, domainId, divinePowerSpentGp: revenue, throwResult, buff },
      { narrative: (ch.name || casterId) + ' consecrates the ruler of ' + (d.name || domainId) + ' — ' + revenue.toLocaleString() + 'gp DP, '
          + (throwResult.success ? 'blessed (12 months: +1 morale, +1 vassal loyalty, vagary advantage)'
             : throwResult.natural1 ? 'AWRY (12 months: −1 morale, −1 loyalty, vagary disadvantage)' : 'no effect (throw failed)'),
        context: { domainId, relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }]
          .concat(rulerId ? [{ kind: 'character', id: rulerId, role: 'beneficiary' }] : [])
          .concat([{ kind: 'domain', id: domainId, role: 'site' }]) } });
    return { ok: true, cost: revenue, throwResult, buff, remaining: spend.remaining };
  }

  // ── Consecration-buff accessors (read by the economy + the F&D loyalty roll, §9.2) ──
  // The live 12-month consecrate-ruler buff on a domain, or null. Liveness: expiresAtTurn > currentTurn
  // (the buff applies for the 12 turns after the grant; the monthly consumer GCs the stale object).
  function _liveConsecrationBuff(d, currentTurn){
    const b = d && d.consecrationBuff;
    if(!b || typeof b !== 'object') return null;
    return ((Number(b.expiresAtTurn) || 0) > currentTurn) ? b : null;
  }
  function domainConsecrationBuff(campaign, d){
    return _liveConsecrationBuff(d, _currentTurn(campaign));
  }
  // The morale-modifier row (or null) for moraleModifiersFor (economy.js, late-bound). +1 normally; −1 awry.
  function domainConsecrationMoraleRow(campaign, d){
    const b = _liveConsecrationBuff(d, _currentTurn(campaign));
    if(!b || !b.moraleBonus) return null;
    return { label: (b.moraleBonus > 0 ? 'Ruler consecrated by the gods (RR p.422)' : 'The ruler’s consecration went awry (RR p.422)'), value: b.moraleBonus };
  }
  // +1 (or −1, awry) to a vassal ruler's loyalty rolls when their LIEGE rules a domain with a live
  // consecration buff (RR p.422). Mirrors officeLoyaltyBonusFor; the caller (_favorDutyLoyaltyRoll) keeps
  // the POSITIVE bonus non-stacking with the Office favor (OQ5), while an awry −1 still applies.
  function domainConsecrationVassalLoyaltyBonus(campaign, characterId){
    if(!campaign || !characterId) return 0;
    const v = (campaign.vassalages || []).find(x => x && x.status === 'active' && x.vassalRulerCharacterId === characterId);
    const liegeId = v ? v.suzerainCharacterId : null;
    if(!liegeId) return 0;
    const turn = _currentTurn(campaign);
    for(const d of (campaign.domains || [])){
      if(!d || d.rulerCharacterId !== liegeId) continue;
      const b = _liveConsecrationBuff(d, turn);
      if(b && b.loyaltyBonus) return b.loyaltyBonus;
    }
    return 0;
  }
  // The recorded vagary seam (RR p.422 "roll twice, take the better"): 'advantage' | 'disadvantage' | null.
  // The Military vagary roller reads this when wired (a recorded seam this burst — Plan §9.3 / §10 scope).
  function domainConsecrationVagaryAdvantage(campaign, domainId){
    const d = _findDomain(campaign, domainId);
    const b = d ? _liveConsecrationBuff(d, _currentTurn(campaign)) : null;
    if(!b) return null;
    return b.vagaryAdvantage ? 'advantage' : (b.vagaryDisadvantage ? 'disadvantage' : null);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Religion R5 — Codes of Behavior + the Divine Transgression table (Phase_4_Religion_Plan.md §3.6)
  // ════════════════════════════════════════════════════════════════════════════
  // The d% table a divine caster rolls on a divine-overcasting fumble OR when he offends his deity (JJ p.400
  // "Calamity and Disfavor" — the Judge may invoke it for any sufficiently offensive act). Mechanical facts
  // (the d% ranges + the named outcome + its effect) reorganized to data per §13.6 — terse ORIGINAL glosses,
  // not the rulebook prose. The standing consequence rides the SHIPPED setDivineFavorStanding: a 'lapsed'
  // favor already suspends divine-power accrual (§4.3), and `atone` restores it. The lethal high end routes
  // through the shipped death recorder (recordCharacterDeath, CL-4a) when present. No house rule (core RAW).

  // standingEffect ∈ 'none' | 'lapsed' (disfavored until atonement) | 'dead'. meta carries the specific loss.
  const DIVINE_TRANSGRESSION_TABLE = Object.freeze([
    { min: 1,  max: 60,  key: 'failure',           label: 'Failure',                standingEffect: 'none',   gloss: 'The overcasting fails; nothing worse befalls the caster.' },
    { min: 61, max: 65,  key: 'prostration',       label: 'Prostration Required',   standingEffect: 'none',   gloss: 'The god demands public obeisance — prostrate to make the casting succeed, or stay standing and it fails.' },
    { min: 66, max: 68,  key: 'trickster',         label: 'Trickster',              standingEffect: 'none',   gloss: 'Another god answers in his place — a random divine spell of the same level goes off instead.' },
    { min: 69, max: 71,  key: 'castigation',        label: 'Castigation',           standingEffect: 'none',   gloss: 'The casting succeeds but wracks the caster (1d4 luminous — necrotic if Chaotic — per spell level).' },
    { min: 72, max: 74,  key: 'target-self',        label: 'Target Self',           standingEffect: 'none',   gloss: 'The spell turns on the caster (a beneficial spell is treated as Castigation).' },
    { min: 75, max: 77,  key: 'target-ally',        label: 'Target Ally',           standingEffect: 'none',   gloss: 'The spell strikes a random ally in range (none in range → treat as Target Self).' },
    { min: 78, max: 80,  key: 'link-severed',       label: 'Divine Link Severed',   standingEffect: 'none',   gloss: 'The casting fails; the caster cannot cast divine spells for 1d4+1 rounds.' },
    { min: 81, max: 83,  key: 'unconscious',        label: 'Unconscious',           standingEffect: 'none',   gloss: 'The casting fails; the caster falls unconscious for 1d4+1 rounds.' },
    { min: 84, max: 86,  key: 'repertoire-loss',    label: 'Repertoire Loss',       standingEffect: 'lapsed', meta: { lostRepertoire: true }, gloss: 'The casting fails; the caster may not cast that spell again until he receives an atonement.' },
    { min: 87, max: 89,  key: 'disfavor',           label: 'Severe Divine Disfavor',standingEffect: 'lapsed', gloss: 'The casting fails; the caster is disfavored — divine power is suspended until he is the beneficiary of an atonement.' },
    { min: 90, max: 91,  key: 'loss-of-powers',     label: 'Loss of Powers',        standingEffect: 'lapsed', meta: { lostClassPowers: true }, gloss: 'The casting fails; the caster loses his class powers (other than spellcasting) until atonement.' },
    { min: 92, max: 93,  key: 'divine-dislike',     label: 'Divine Dislike',        standingEffect: 'none',   meta: { overcastTargetBonus: 1 }, gloss: 'The casting fails; the caster permanently raises his overcasting target value by 1.' },
    { min: 94, max: 95,  key: 'divine-signature',   label: 'Divine Signature',      standingEffect: 'none',   meta: { signature: true }, gloss: 'The casting fails; the caster gains a permanent side effect (the GM rolls the Spell Signature sub-table).' },
    { min: 96, max: 97,  key: 'mission',            label: 'Mission from God',      standingEffect: 'none',   meta: { quest: true }, gloss: 'The casting succeeds, but the caster is charged with a quest in his deity’s service.' },
    { min: 98, max: 99,  key: 'bolt-from-heaven',   label: 'Bolt from Heaven',      standingEffect: 'dead',   meta: { restorable: 'reluctant' }, gloss: 'The deity smites the caster dead. He can be restored, but no one of his faith will do so willingly — and a same-faith caster who tries is smitten too.' },
    { min: 100,max: 100, key: 'death',              label: 'Death',                 standingEffect: 'dead',   meta: { restorable: 'miracle-or-wish' }, gloss: 'Servants of death drag the caster body and soul into the underworld — restorable only by miracle or wish.' }
  ]);
  function lookupDivineTransgression(roll){
    const r = Math.max(1, Math.min(100, Math.round(Number(roll) || 0)));
    return DIVINE_TRANSGRESSION_TABLE.find(row => r >= row.min && r <= row.max) || null;
  }

  // Roll on the Divine Transgression table (1d% + an optional GM modifier — e.g. an impious ruler widens
  // the awry range). Returns { natural, mod, total, row }.
  function rollDivineTransgression(campaign, casterId, opts){
    opts = opts || {};
    const rng = _rng(opts);
    const natural = 1 + Math.floor((rng() || 0) * 100);
    const total = Math.max(1, Math.min(100, natural + (Number(opts.mod) || 0)));
    return { natural, mod: Number(opts.mod) || 0, total, row: lookupDivineTransgression(total) };
  }

  // Apply a Divine Transgression to a caster (the manual GM trigger + the overcast-fumble hook). Rolls,
  // looks up the row, applies the mechanical consequence it can (standing → lapsed → DP suspended until
  // atonement; the permanent overcast-target bump; the lethal high end via the shipped death recorder),
  // logs it on the favor's transgressionsLog, and emits `divine-transgression`. The transient/combat-scale
  // outcomes (castigation damage, target-self/ally, link-severed, unconscious, signature/mission/quest) are
  // surfaced in the result + the event for the GM to narrate — not auto-applied (no combat state here).
  function applyDivineTransgression(campaign, casterId, opts){
    opts = opts || {};
    const ch = _findChar(campaign, casterId);
    if(!ch) return { ok: false, reason: 'no-caster' };
    const rolled = rollDivineTransgression(campaign, casterId, opts);
    const row = rolled.row;
    if(!row) return { ok: false, reason: 'no-row', roll: rolled };
    const A = _A();
    const turn = campaign.currentTurn || 1;
    const meta = row.meta || {};
    let died = false, standingChanged = null;

    // Standing consequence — lapsed → divine-power accrual suspended until atonement (the shipped gate, §4.3).
    const fav = divineFavorOf(campaign, casterId);
    if(row.standingEffect === 'lapsed' && fav && fav.standing === 'good-standing'){
      setDivineFavorStanding(campaign, fav.id, 'lapsed', 'divine-transgression: ' + row.key);
      standingChanged = 'lapsed';
    }
    // Permanent overcast-target bump (Divine Dislike) — a defensive field (no factory/migration change).
    if(meta.overcastTargetBonus){ ch.overcastTargetBonus = (Number(ch.overcastTargetBonus) || 0) + meta.overcastTargetBonus; }
    // The lethal high end (Bolt from Heaven / Death) — route through the shipped death recorder (CL-4a).
    if(row.standingEffect === 'dead'){
      died = true;
      const deathOpts = { cause: 'divine-transgression', narrative: (ch.name || casterId) + ' is slain by divine wrath (' + row.label + ')' };
      if(typeof A.recordCharacterDeath === 'function'){
        try { A.recordCharacterDeath(campaign, ch, deathOpts); }
        catch(_){ ch.lifecycleState = 'deceased'; ch.alive = false; }
      } else { ch.lifecycleState = 'deceased'; ch.alive = false; }
    }
    // Log on the favor (created on demand if the caster has none — a transgression presumes a relationship).
    const logFav = fav || ensureDivineFavor(campaign, casterId, (deityOf(campaign, casterId) || {}).id || null);
    if(logFav){
      if(!Array.isArray(logFav.transgressionsLog)) logFav.transgressionsLog = [];
      logFav.transgressionsLog.push({ turn, kind: row.key, severity: row.label, tableRoll: rolled.total,
        consequence: row.gloss, standingEffect: row.standingEffect, meta, atonedAtTurn: null });
    }
    const deity = deityOf(campaign, casterId);
    _recordReligionEvent(campaign, 'divine-transgression',
      { characterId: casterId, deityId: deity ? deity.id : null, tableRoll: rolled.total, transgression: row.key,
        severity: row.label, standingEffect: row.standingEffect, died, narrativeNote: row.gloss },
      { narrative: (ch.name || casterId) + ' transgresses — ' + row.label + ' (d% ' + rolled.total + '): ' + row.gloss,
        context: { relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }]
          .concat(deity ? [{ kind: 'deity', id: deity.id, role: 'patron' }] : []) } });
    return { ok: true, roll: rolled, row, standingChanged, died, overcastTargetBonus: ch.overcastTargetBonus || 0 };
  }

  // Atonement (the restore path, RR p.422 — the until-atonement consequences end): return a lapsed/
  // excommunicate caster to good standing, stamp the open transgression-log entries atonedAtTurn, emit
  // `divine-favor-changed` (action 'atonement'). Re-enables divine-power accrual (the shipped gate).
  // The permanent Divine-Dislike overcast bump is NOT cleared (it is permanent, RR/JJ).
  function atone(campaign, casterId, opts){
    opts = opts || {};
    const ch = _findChar(campaign, casterId);
    if(!ch) return { ok: false, reason: 'no-caster' };
    const fav = divineFavorOf(campaign, casterId);
    if(!fav) return { ok: false, reason: 'no-favor' };
    const turn = campaign.currentTurn || 1;
    const wasStanding = fav.standing;
    if(fav.standing !== 'good-standing') setDivineFavorStanding(campaign, fav.id, 'good-standing', 'atonement');
    let cleared = 0;
    for(const t of (Array.isArray(fav.transgressionsLog) ? fav.transgressionsLog : [])){
      if(t && t.atonedAtTurn == null && (t.standingEffect === 'lapsed' || (t.meta && (t.meta.lostClassPowers || t.meta.lostRepertoire)))){
        t.atonedAtTurn = turn; cleared++;
      }
    }
    _recordReligionEvent(campaign, 'divine-favor-changed',
      { characterId: casterId, deityId: fav.deityId, standing: fav.standing, previousStanding: wasStanding, action: 'atonement', clearedTransgressions: cleared },
      { narrative: (ch.name || casterId) + ' receives an atonement — restored to good standing',
        context: { relatedEntities: [{ kind: 'character', id: casterId, role: 'subject' }]
          .concat(fav.deityId ? [{ kind: 'deity', id: fav.deityId, role: 'patron' }] : []) } });
    return { ok: true, standing: fav.standing, previousStanding: wasStanding, clearedTransgressions: cleared };
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    DIVINE_CLASSES,
    isDivineCaster,
    findDeity,
    findCongregation,
    findDivineFavor,
    congregationsOf,
    divineFavorOf,
    deityOf,
    divinePowerAvailable,
    spendDivinePower,
    // ── Religion R1 (team 2026-06-13) — accrual math + consumers + the monthly consumer ──
    DOMAIN_WORSHIP_RATE, domainWorshipRateForMorale,
    congregationDomainFamilies, congregationPersonalWeeklyGp, congregationDomainWorshipWeeklyGp,
    congregationWeeklyDivinePowerGp, congregationMaintainedWeeks, congregationMonthlyDivinePowerGp,
    accrueDivinePower, grantDivinePower, expireDivinePowerFor,
    ensureDivineFavor, setDivineFavorStanding,
    foundCongregation, addProselytizingValue, setCongregationMaintenance,
    rollDivineThrow, consecrateFields, spendDivinePowerForPurpose, prayAndSacrifice,
    processReligionForTurn,
    // ── Religion R2 (team 2026-06-14) — blood sacrifice (the Chaotic path, RR pp.421–422) ──
    SACRIFICE_MULTIPLIERS, hasPowerOfSacrifice, sacrificeComponentValue, sacrificeMultiplierSum, bloodSacrifice,
    // ── Religion R1.5 (team 2026-06-14) — the day-tick weekly grain (slot 52) ──
    proposeReligionDay, commitReligionWeek,
    // ── Religion Wave E (2026-06-19) — the divine consequence of arcane usurpation (RR p.388) ──
    settlementDivineWrath, wrathSeverityForLevel, divineWrathForceXp, processDivineWrathForTurn,
    congregationUsurpedSettlementWeeklyGp,
    // ── Religion R3 (team burst10 2026-06-20) — consecration (altar/ruler) + the buff accessors (RR p.422) ──
    consecrateAltar, consecrateRuler,
    domainConsecrationBuff, domainConsecrationMoraleRow, domainConsecrationVassalLoyaltyBonus, domainConsecrationVagaryAdvantage,
    // ── Religion R5 (team burst10 2026-06-20) — the Divine Transgression table (JJ p.400) ──
    DIVINE_TRANSGRESSION_TABLE, lookupDivineTransgression, rollDivineTransgression, applyDivineTransgression, atone
  });

})(typeof window !== 'undefined' ? window : global);
