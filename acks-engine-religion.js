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
    spendDivinePower
  });

})(typeof window !== 'undefined' ? window : global);
