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
  // Total weekly divine power a congregation generates for its high priest (personal + domain stacking).
  function congregationWeeklyDivinePowerGp(campaign, cong){
    return congregationPersonalWeeklyGp(cong) + congregationDomainWorshipWeeklyGp(campaign, cong);
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
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
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
      const fav = priestId ? divineFavorOf(campaign, priestId) : null;
      const suspended = fav && fav.standing && fav.standing !== 'good-standing';
      const monthly = suspended ? 0 : congregationMonthlyDivinePowerGp(campaign, cong);
      if(monthly > 0 && priestId){
        const personal = congregationPersonalWeeklyGp(cong) > 0;
        const domain = congregationDomainWorshipWeeklyGp(campaign, cong) > 0;
        const source = (domain && !personal) ? 'domain-worship' : 'congregation';
        accrueDivinePower(campaign, priestId, monthly, source, cong.deityId,
          { accruedAtTurn: turn + 1, expiresAtTurn: turn + 2 });
        out.accruedGp += monthly;
        out.logEntries.push('⛪ ' + (priest && priest.name || priestId) + ' accrues ' + monthly.toLocaleString() + 'gp divine power from ' + _congLabel(cong));
      } else if(suspended && priestId){
        out.logEntries.push('⛪ ' + _congLabel(cong) + ': accrual suspended (' + (fav.standing) + ')');
      }

      // Reset the per-month maintenance tracker for the next month.
      if(cong.autoMaintain === false) cong.maintainedWeeksThisMonth = 0;
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
    return out;
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
    processReligionForTurn
  });

})(typeof window !== 'undefined' ? window : global);
