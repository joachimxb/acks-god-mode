/* =============================================================================
 * acks-engine-stash.js — ACKS God Mode Stash / Wealth / Inventory layer
 * =============================================================================
 *
 * Extracted from acks-engine.js (T5 monolith decomposition, 2026-06-23) — pure
 * code-motion, no behaviour change. Houses the located/borne wealth model:
 *
 *   - Stash (Phase 2.95 Stash A/B) — the first-class Stash entity (campaign.stashes[]):
 *     lookups, the canonical deposit/withdraw/transfer setters, carry<->stash + party-camp
 *     transfers, the controller setter, and the domain.treasury -> treasury-stash model.
 *   - Items I1 — the facet item model (facets[]/notableItemId), valuation, encumbrance,
 *     notable-item promotion, and the rations/provisioning accessors (RR p.278).
 *   - Character coins — the multi-denomination purse (coins.gp canonical; RR pp.83-84).
 *   - Notable items + custody (Wave B.5) — the itm- entity lookups.
 *
 * Self-registers its SIX load-migration passes (were inline in the engine seed array;
 * orders 70/90/100/110/120/190 preserved). Cross-file ordering still holds (order is
 * numeric + global): stash-item-shapes(100) BEFORE reconcile-stashes(110);
 * sync-party-camp-stashes(190) AFTER reconcile-party-membership(180, still engine-seeded).
 *
 * Late-bound on global.ACKS (the const A = global.ACKS pattern, per function): entity
 * factories (acks-engine-entities.js) + ID generation + core helpers. _applyDomainTreasuryDelta
 * (the canonical treasury setter) moved here and is exported for its 10 cross-module callers
 * in the core engine (economy / turn / favor-duty code -> ACKS._applyDomainTreasuryDelta).
 * Loads AFTER acks-engine.js (needs registerLoadMigration); before economy (all late-bound).
 *
 * RAW + IP (CLAUDE.md §13.6): mechanical values only, page-cited.
 * ============================================================================= */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};
// =============================================================================
// Phase 2.95 Stash A — Stash lookups (pure-find subset, commit 3 / 2026-05-29).
// Per Phase_2.95_Stash_Plan.md §6.2. Mutator-style helpers (findOrCreateStashAt,
// auto-create domain treasury) land with A.2 canonical setters.
// =============================================================================

function findStash(campaign, stashId){
  if(!campaign || !Array.isArray(campaign.stashes)) return null;
  return campaign.stashes.find(st => st.id === stashId) || null;
}

// Personal + cache stashes owned by this character. Does not include party
// stashes the character is a member of (use stashesAccessibleToCharacter for that).
function stashesOwnedByCharacter(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.stashes)) return [];
  return campaign.stashes.filter(st => st.ownerCharacterId === characterId);
}

// All stashes located at a given hex, regardless of owner kind.
function stashesAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.stashes)) return [];
  return campaign.stashes.filter(st => st.hexId === hexId);
}

// Defensive pure-find — returns null if no domain treasury stash exists for the
// given domain. A.2 will add domainTreasuryFor() that creates lazily.
function findDomainTreasury(campaign, domainId){
  if(!campaign || !Array.isArray(campaign.stashes)) return null;
  return campaign.stashes.find(st =>
    st.kind === 'domain-treasury' && st.ownerDomainId === domainId
  ) || null;
}

// Derived view — never stored. Personal stashes the character owns +
// party stashes for any party they're a member of +
// domain-treasuries of any domain whose rulerCharacterId matches them.
// Order: personal → party → treasury (most-personal-first).
function stashesAccessibleToCharacter(campaign, characterId){
  if(!campaign || !characterId) return [];
  const out = [];
  // Personal + cache stashes
  if(Array.isArray(campaign.stashes)){
    for(const st of campaign.stashes){
      if(st.ownerCharacterId === characterId) out.push(st);
    }
  }
  // Party stashes for the party this character belongs to. character.partyId is the canonical
  // membership truth (Architecture §3.3); read it directly so this works even before
  // reconcilePartyMembership has rebuilt the party.memberCharacterIds mirror.
  if(Array.isArray(campaign.stashes)){
    const ch = Array.isArray(campaign.characters) ? campaign.characters.find(c => c && c.id === characterId) : null;
    const myPartyId = ch && ch.partyId;
    if(myPartyId){
      for(const st of campaign.stashes){
        if(st.ownerPartyId === myPartyId) out.push(st);
      }
    }
  }
  // Domain treasuries for domains this character currently rules
  if(Array.isArray(campaign.domains) && Array.isArray(campaign.stashes)){
    const ruledDomainIds = campaign.domains
      .filter(d => d.rulerCharacterId === characterId)
      .map(d => d.id);
    if(ruledDomainIds.length){
      const ruledSet = new Set(ruledDomainIds);
      for(const st of campaign.stashes){
        if(st.kind === 'domain-treasury' && st.ownerDomainId && ruledSet.has(st.ownerDomainId)) out.push(st);
      }
    }
  }
  return out;
}

// =============================================================================
// Phase 2.95 Stash A.2 — canonical setters (#467 / 2026-05-29).
// depositToStash + withdrawFromStash + transferBetweenStashes.
// Per Phase_2.95_Stash_Plan.md §6.2. Coin items merge by denomination on
// deposit; bulk and item entries append. Withdraw supports partial qty.
// Each mutation stamps a history entry on the stash record.
// =============================================================================

// --- Internal helper: append a history entry to a stash ----------------------
function _stampStashHistory(stash, atTurn, type, payload){
  if(!stash) return;
  if(!Array.isArray(stash.history)) stash.history = [];
  stash.history.push(Object.assign({ turn: atTurn || 1, type }, payload || {}));
}

// --- Internal helper: brief summary of items for history payloads ------------
// Used for both deposit + withdraw history entries. Returns a compact array
// of {kind, label, qty} that's easier to audit than embedded full item objects.
function _summarizeItems(items){
  if(!Array.isArray(items)) return [];
  return items.map(it => {
    if(!it) return null;
    const pf = primaryFacet(it);
    if(pf === 'coin') return { kind:'coin', label: it.denomination || 'gp', qty: it.qty || 0 };
    if(pf === 'bulk') return { kind:'bulk', label: it.name || it.label || '(unnamed)', unit: it.unit || 'stones', qty: it.qty || 0 };
    return { kind: pf, label: it.name || '(unnamed)', qty: it.qty || 1, notableItemId: it.notableItemId || it.magicItemId || null };
  }).filter(Boolean);
}

// --- Deposit ------------------------------------------------------------------
// Add items[] to a stash. Coin entries merge by denomination; other kinds append.
// Items can be passed as bare objects ({kind:'coin', denomination:'gp', qty:50})
// — they're normalized through blankStashItem so they end up with proper IDs.
function depositToStash(campaign, stashId, items, opts){
  if(!campaign || !stashId) return null;
  const stash = findStash(campaign, stashId);
  if(!stash) return null;
  if(!Array.isArray(items) || items.length === 0) return stash;  // no-op
  if(!Array.isArray(stash.items)) stash.items = [];

  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  const atTurn = (opts && opts.atTurn) || campaign.currentTurn || 1;

  for(const incoming of items){
    if(!incoming) continue;
    const normalized = blankStashItem ? blankStashItem(incoming) : Object.assign({ id: 'si-?' }, incoming);

    // Coin merges by denomination.
    if(itemHasFacet(normalized, 'coin')){
      const existing = stash.items.find(x =>
        itemHasFacet(x, 'coin') && (x.denomination || 'gp') === (normalized.denomination || 'gp')
      );
      if(existing){
        existing.qty = (existing.qty || 0) + (normalized.qty || 0);
        continue;
      }
    }
    // Bulk + item append as new records. A.4 reconcile can consolidate later.
    stash.items.push(normalized);
  }

  _stampStashHistory(stash, atTurn, 'deposit', {
    reason: (opts && opts.reason) || 'deposit',
    source: (opts && opts.source) || null,
    items: _summarizeItems(items)
  });

  // A.4 — canonical-setter invariant: keep treasury scalar in sync
  _syncTreasuryScalarFor(campaign, stash);

  return stash;
}

// --- Withdraw -----------------------------------------------------------------
// Remove items from a stash. withdrawals: [{itemId, qty?}]. qty defaults to
// the entry's full qty. Partial withdrawal: source qty reduces, a new detached
// record (with a fresh id for coin/bulk; preserving id for full item-kind)
// is returned for each withdrawal entry. Returns null on any validation
// failure — withdraw is atomic: no partial effects if anything fails.
function withdrawFromStash(campaign, stashId, withdrawals, opts){
  if(!campaign || !stashId) return null;
  const stash = findStash(campaign, stashId);
  if(!stash) return null;
  if(!Array.isArray(withdrawals) || withdrawals.length === 0){
    return { stash, withdrawn: [] };  // no-op
  }
  if(!Array.isArray(stash.items)) return null;

  // Validate everything first — atomicity.
  const plan = [];
  for(const w of withdrawals){
    if(!w || !w.itemId) return null;
    const entry = stash.items.find(it => it.id === w.itemId);
    if(!entry) return null;
    const requested = (w.qty != null) ? w.qty : (entry.qty != null ? entry.qty : 1);
    if(typeof requested !== 'number' || requested <= 0) return null;
    const have = (entry.qty != null) ? entry.qty : 1;
    if(requested > have) return null;
    plan.push({ entry, requested, isFull: requested === have });
  }

  // All validated. Apply.
  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  const withdrawn = [];
  for(const step of plan){
    if(step.isFull){
      // Remove entry from stash; return the original record (now detached).
      const idx = stash.items.indexOf(step.entry);
      if(idx >= 0) stash.items.splice(idx, 1);
      withdrawn.push(step.entry);
    } else {
      // Partial: reduce source qty, build a detached copy with new id.
      step.entry.qty = (step.entry.qty || 0) - step.requested;
      const copySpec = Object.assign({}, step.entry, { id: undefined, qty: step.requested });
      const copy = blankStashItem ? blankStashItem(copySpec) : Object.assign({ id: 'si-?' }, copySpec);
      withdrawn.push(copy);
    }
  }

  const atTurn = (opts && opts.atTurn) || campaign.currentTurn || 1;
  _stampStashHistory(stash, atTurn, 'withdraw', {
    reason: (opts && opts.reason) || 'withdraw',
    destination: (opts && opts.destination) || null,
    items: _summarizeItems(withdrawn)
  });

  // A.4 — canonical-setter invariant: keep treasury scalar in sync
  _syncTreasuryScalarFor(campaign, stash);

  return { stash, withdrawn };
}

// --- Transfer -----------------------------------------------------------------
// Atomic move: withdraw from `fromStashId`, deposit into `toStashId`. Same
// validation semantics as withdrawFromStash. History entries on both stashes
// reference the counterparty.
function transferBetweenStashes(campaign, fromStashId, toStashId, withdrawals, opts){
  if(!campaign || !fromStashId || !toStashId) return null;
  if(fromStashId === toStashId) return null;
  const fromStash = findStash(campaign, fromStashId);
  const toStash   = findStash(campaign, toStashId);
  if(!fromStash || !toStash) return null;

  const atTurn = (opts && opts.atTurn) || campaign.currentTurn || 1;
  const reason = (opts && opts.reason) || 'transfer';

  // Withdraw step writes its own history; we re-stamp with a richer payload below
  // by passing reason + destination so the withdraw entry already references `to`.
  const out = withdrawFromStash(campaign, fromStashId, withdrawals, {
    atTurn,
    reason,
    destination: { kind:'stash', id: toStashId, label: toStash.name || null }
  });
  if(!out) return null;

  // Deposit the withdrawn items into `to`. The deposit history entry references
  // the source stash so both sides of the transfer carry counterparty context.
  depositToStash(campaign, toStashId, out.withdrawn, {
    atTurn,
    reason,
    source: { kind:'stash', id: fromStashId, label: fromStash.name || null }
  });

  return { fromStash, toStash, transferred: out.withdrawn };
}

// =============================================================================
// Phase 2.95 Stash B (engine foundation, 2026-06-03) — carry↔stash transfers,
// controller change, find-or-create, and the RAW carry-encumbrance bands the
// character-sheet surface reads. Per Phase_2.95_Stash_Plan.md §6.2–§6.4 + §12.
// =============================================================================

// --- One-per-owner-per-hex find-or-create ("the windfall lands here" helper) --
// ownerSpec: {characterId} | {partyId} | {domainId}. opts.kind overrides the
// default kind for a character owner (personal | cache). Returns an existing
// match (same owner + hex + kind) or a freshly created + pushed stash.
function findOrCreateStashAt(campaign, ownerSpec, hexId, opts){
  if(!campaign || !ownerSpec) return null;
  opts = opts || {};
  if(!Array.isArray(campaign.stashes)) campaign.stashes = [];
  let ownerField, ownerId, kind;
  if(ownerSpec.characterId){ ownerField='ownerCharacterId'; ownerId=ownerSpec.characterId; kind=opts.kind || 'personal'; }
  else if(ownerSpec.partyId){ ownerField='ownerPartyId'; ownerId=ownerSpec.partyId; kind='party'; }
  else if(ownerSpec.domainId){ ownerField='ownerDomainId'; ownerId=ownerSpec.domainId; kind='domain-treasury'; }
  else return null;
  const existing = campaign.stashes.find(s => s && s.hexId === hexId && s[ownerField] === ownerId && s.kind === kind);
  if(existing) return existing;
  const blankStash = (global.ACKS && global.ACKS.blankStash) || null;
  if(!blankStash) return null;
  const s = blankStash({ kind, hexId });
  s[ownerField] = ownerId;
  s.name = opts.name || (kind === 'domain-treasury' ? 'Treasury' : (kind === 'party' ? 'Party loot' : 'Cache'));
  s.createdAtTurn = campaign.currentTurn || 1;
  campaign.stashes.push(s);
  return s;
}

// --- Private: atomic withdraw from a bare item array (carry inventory) --------
// Mirrors withdrawFromStash's validate-then-apply atomicity. withdrawals:
// [{itemId, qty?}]. Returns {ok, removed} (removed = detached item lines).
function _withdrawFromItemArray(items, withdrawals){
  if(!Array.isArray(items) || !Array.isArray(withdrawals)) return { ok:false, removed:[] };
  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  const plan = [];
  for(const w of withdrawals){
    if(!w || !w.itemId) return { ok:false, removed:[] };
    const entry = items.find(it => it && it.id === w.itemId);
    if(!entry) return { ok:false, removed:[] };
    const have = (entry.qty != null) ? entry.qty : 1;
    const req = (w.qty != null) ? w.qty : have;
    if(typeof req !== 'number' || req <= 0 || req > have) return { ok:false, removed:[] };
    plan.push({ entry, req, isFull: req === have });
  }
  const removed = [];
  for(const step of plan){
    if(step.isFull){
      const idx = items.indexOf(step.entry);
      if(idx >= 0) items.splice(idx, 1);
      removed.push(step.entry);
    } else {
      step.entry.qty = (step.entry.qty || 0) - step.req;
      const copySpec = Object.assign({}, step.entry, { id: undefined, qty: step.req });
      removed.push(blankStashItem ? blankStashItem(copySpec) : copySpec);
    }
  }
  return { ok:true, removed };
}

// --- Carry → stash ("bank your coin at home") --------------------------------
function transferCarryToStash(campaign, characterId, stashId, withdrawals, opts){
  if(!campaign) return null;
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return null;
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  const out = _withdrawFromItemArray(ch.inventory, withdrawals);
  if(!out.ok) return null;
  depositToStash(campaign, stashId, out.removed, {
    reason: (opts && opts.reason) || 'bank-carry',
    source: { kind:'character', id: characterId, label: ch.name || null }
  });
  return { character: ch, stash, moved: out.removed };
}

// --- Stash → carry (warns over encumbrance, never blocks — RAW) --------------
function transferStashToCarry(campaign, stashId, characterId, withdrawals, opts){
  if(!campaign) return null;
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return null;
  const out = withdrawFromStash(campaign, stashId, withdrawals, {
    reason: (opts && opts.reason) || 'draw-from-stash',
    destination: { kind:'character', id: characterId, label: ch.name || null }
  });
  if(!out) return null;
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  for(const it of out.withdrawn) ch.inventory.push(it);
  const band = carryEncumbranceBandFor(carryTotalEncumbrance(ch));
  return { character: ch, stash, moved: out.withdrawn, overEncumbered: band.level === 'overloaded', band };
}

// --- Controller change (ruler succession on a domain-treasury; or owner swap) -
// For domain-treasury: ownerDomainId is UNCHANGED (the domain still owns it) — the
// controllerChanged history entry records who held office. For personal/cache:
// sets the new owner. newOwner: {characterId} | {partyId} | {domainId}.
function changeStashController(campaign, stashId, newOwner, opts){
  if(!campaign || !newOwner) return null;
  const stash = findStash(campaign, stashId);
  if(!stash) return null;
  const before = { ownerCharacterId: stash.ownerCharacterId, ownerPartyId: stash.ownerPartyId, ownerDomainId: stash.ownerDomainId };
  if(stash.kind !== 'domain-treasury'){
    if(newOwner.characterId !== undefined){ stash.ownerCharacterId = newOwner.characterId; stash.ownerPartyId = null; stash.ownerDomainId = null; }
    else if(newOwner.partyId !== undefined){ stash.ownerPartyId = newOwner.partyId; stash.ownerCharacterId = null; stash.ownerDomainId = null; }
  }
  _stampStashHistory(stash, (opts && opts.atTurn) || campaign.currentTurn || 1, 'controllerChanged', {
    reason: (opts && opts.reason) || 'controller-change',
    from: before,
    to: { ownerCharacterId: stash.ownerCharacterId, ownerPartyId: stash.ownerPartyId, ownerDomainId: stash.ownerDomainId },
    officeHolderCharacterId: (newOwner.characterId !== undefined ? newOwner.characterId : null)
  });
  return stash;
}

// =============================================================================
// Character ⇄ co-located stash transfer (Items I1 Step 3 — the GM-facing
// "cache from inventory / draw from a cache" verbs, per Phase_2.95_Stash_Plan §6.2).
// These operate on the SHIPPED carry shapes — the Phase 2.6 carry inventory
// (index-addressed {name,stone,notes}, NO ids) + the character.coins purse — and
// bridge them to/from facet stash items, so the §8.3 inventory→facet unification
// is NOT a prerequisite. (transferCarryToStash/transferStashToCarry above stay the
// id-based primitives for the future unified carry; the UI uses the two below.)
// Coins are routed to/from character.coins (the purse), NOT carry lines.
// =============================================================================

// Phase-2.6 carry line ({name,stone,notes,notableItemId?}) → a facet stash-item
// spec (depositToStash normalizes it). Stone → encumbranceSt so weight survives.
// A facet-shaped line (future unified carry) passes through unchanged.
function _carryLineToStashItem(line){
  if(!line) return null;
  if(Array.isArray(line.facets) && line.facets.length){
    return Object.assign({}, line, { id: undefined });   // already facet-shaped — clone, fresh id on deposit
  }
  return {
    facets: ['gear'],                                     // blankStashItem adds 'magical' if notableItemId set
    name: line.name || '',
    qty: (line.qty != null) ? line.qty : 1,
    encumbranceSt: (line.stone != null) ? (parseFloat(line.stone) || 0) : null,
    notableItemId: line.notableItemId || null,
    notes: line.notes || ''
  };
}

// Withdrawn facet stash item → a carry line. Keeps the full facet line (nothing
// lost — a withdrawn valuable retains unitValueGp, a notable retains its pointer)
// AND sets `stone` so the Phase 2.6 carry table renders its weight column.
function _stashItemToCarryLine(item){
  return Object.assign({}, item, {
    stone: itemEncumbranceSt(item),
    name: item.name || '',
    notes: item.notes || ''
  });
}

// --- Cache from carry → stash ("stash items/coins here") ----------------------
// spec: { itemIndices:[int], coins:{pp,gp,ep,sp,cp} }. Items addressed by carry
// index; coins drawn from the purse. Validate-all-then-apply (atomic). Returns
// { ok, stash, movedItems, movedCoinGp } | { ok:false, error }.
function cacheToStash(campaign, characterId, stashId, spec, opts){
  if(!campaign) return { ok:false, error:'no-campaign' };
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return { ok:false, error:'not-found' };
  spec = spec || {};
  const indices = Array.isArray(spec.itemIndices) ? spec.itemIndices.slice() : [];
  const coins = spec.coins || {};
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  reconcileCharacterCoins(ch);

  // Validate item indices.
  for(const ix of indices){
    if(typeof ix !== 'number' || ix < 0 || ix >= ch.inventory.length || !Number.isInteger(ix)) return { ok:false, error:'bad-index' };
  }
  // Validate coins ≤ purse.
  let anyCoin = false;
  for(const d of COIN_DENOMINATIONS){
    const amt = Number(coins[d]) || 0;
    if(amt < 0) return { ok:false, error:'bad-coin' };
    if(amt > (Number(ch.coins[d]) || 0)) return { ok:false, error:'insufficient-coin' };
    if(amt > 0) anyCoin = true;
  }
  if(indices.length === 0 && !anyCoin) return { ok:false, error:'nothing-selected' };

  // Apply: splice items high-index-first (so earlier indices stay valid), then coins.
  const depositItems = [];
  let movedItems = 0;
  for(const ix of indices.slice().sort((a,b) => b - a)){
    const line = ch.inventory[ix];
    depositItems.push(_carryLineToStashItem(line));
    ch.inventory.splice(ix, 1);
    movedItems++;
  }
  let movedCoinGp = 0;
  for(const d of COIN_DENOMINATIONS){
    const amt = Number(coins[d]) || 0;
    if(amt > 0){
      depositItems.push({ facets:['coin'], denomination:d, qty:amt });
      ch.coins[d] = (Number(ch.coins[d]) || 0) - amt;
      movedCoinGp += amt * (COIN_GP_VALUE[d] != null ? COIN_GP_VALUE[d] : 1);
    }
  }
  reconcileCharacterCoins(ch);   // keep personalGp mirror in lockstep (#10)

  depositToStash(campaign, stashId, depositItems, {
    reason: (opts && opts.reason) || 'cache-from-carry',
    source: { kind:'character', id: characterId, label: ch.name || null },
    atTurn: (opts && opts.atTurn) || campaign.currentTurn || 1
  });
  // GP Wave B (Architecture.md §4.3.6) — the cache/draw modal moved items but emitted no
  // eventLog event; emit the item-transfer (+ a wealth-transfer for the coin leg) so the
  // action surfaces in entity history. Suppressed when invoked as an item-transfer leg.
  if(!(opts && opts.suppressEvent) && global.ACKS){
    if(movedItems > 0 && global.ACKS.recordItemTransfer){
      global.ACKS.recordItemTransfer(campaign, {
        source: { kind:'character', id: characterId, label: ch.name || null },
        destination: { kind:'stash', id: stashId, label: stash.name || null },
        lines: depositItems.filter(d => (d.facets||[]).indexOf('coin') < 0).map(d => ({ name: d.name, qty: d.qty })),
        bucket: 'cache', reason: (opts && opts.reason) || 'cache'
      });
    }
    if(movedCoinGp > 0 && global.ACKS.recordWealthTransfer){
      global.ACKS.recordWealthTransfer(campaign, {
        source: { kind:'character-gp', id: characterId, label: ch.name || null },
        destination: { kind:'stash', id: stashId, label: stash.name || null },
        amount: movedCoinGp, bucket: 'cache', reason: (opts && opts.reason) || 'cache'
      });
    }
  }
  return { ok:true, stash, movedItems, movedCoinGp };
}

// --- Draw from a co-located stash → carry ("take items/coins") ----------------
// spec: { itemIds:[id], coins:{pp,gp,ep,sp,cp} }. Coin lines route to the purse;
// non-coin lines become carry lines (bridged). Warns over-encumbrance, never
// blocks (RAW). Returns { ok, stash, band, overEncumbered } | { ok:false, error }.
function drawFromStash(campaign, stashId, characterId, spec, opts){
  if(!campaign) return { ok:false, error:'no-campaign' };
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return { ok:false, error:'not-found' };
  spec = spec || {};
  const itemIds = Array.isArray(spec.itemIds) ? spec.itemIds.slice() : [];
  const coins = spec.coins || {};
  if(!Array.isArray(stash.items)) stash.items = [];
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  reconcileCharacterCoins(ch);

  const withdrawals = [];
  for(const id of itemIds){
    if(!stash.items.find(it => it && it.id === id)) return { ok:false, error:'item-not-found' };
    withdrawals.push({ itemId: id });   // full withdrawal
  }
  for(const d of COIN_DENOMINATIONS){
    const amt = Number(coins[d]) || 0;
    if(amt < 0) return { ok:false, error:'bad-coin' };
    if(amt === 0) continue;
    const coinLine = stash.items.find(it => itemHasFacet(it, 'coin') && (it.denomination || 'gp') === d);
    if(!coinLine || (coinLine.qty || 0) < amt) return { ok:false, error:'insufficient-coin' };
    withdrawals.push({ itemId: coinLine.id, qty: amt });
  }
  if(withdrawals.length === 0) return { ok:false, error:'nothing-selected' };

  const out = withdrawFromStash(campaign, stashId, withdrawals, {
    reason: (opts && opts.reason) || 'draw-to-carry',
    destination: { kind:'character', id: characterId, label: ch.name || null },
    atTurn: (opts && opts.atTurn) || campaign.currentTurn || 1
  });
  if(!out) return { ok:false, error:'withdraw-failed' };

  let movedCoinGp = 0; const movedItemLines = [];
  for(const line of out.withdrawn){
    if(itemHasFacet(line, 'coin')){
      const d = line.denomination || 'gp';
      ch.coins[d] = (Number(ch.coins[d]) || 0) + (line.qty || 0);
      movedCoinGp += itemValueGp(line);
    } else {
      ch.inventory.push(_stashItemToCarryLine(line));
      movedItemLines.push({ name: line.name || null, qty: (line.qty != null) ? line.qty : 1 });
    }
  }
  reconcileCharacterCoins(ch);
  // GP Wave B (Architecture.md §4.3.6) — emit the item-transfer (+ wealth-transfer coin leg).
  if(!(opts && opts.suppressEvent) && global.ACKS){
    if(movedItemLines.length && global.ACKS.recordItemTransfer){
      global.ACKS.recordItemTransfer(campaign, {
        source: { kind:'stash', id: stashId, label: stash.name || null },
        destination: { kind:'character', id: characterId, label: ch.name || null },
        lines: movedItemLines, bucket: 'draw', reason: (opts && opts.reason) || 'draw'
      });
    }
    if(movedCoinGp > 0 && global.ACKS.recordWealthTransfer){
      global.ACKS.recordWealthTransfer(campaign, {
        source: { kind:'stash', id: stashId, label: stash.name || null },
        destination: { kind:'character-gp', id: characterId, label: ch.name || null },
        amount: movedCoinGp, bucket: 'draw', reason: (opts && opts.reason) || 'draw'
      });
    }
  }
  const band = carryEncumbranceBandFor(carryTotalEncumbrance(ch));
  return { ok:true, stash, band, overEncumbered: band.level === 'overloaded' };
}

// =============================================================================
// Party camp stash (Items I1 / Stash B — "every party has a camp"). A party-owned
// stash named "<Party>'s Camp" that TRAVELS with the party: its hexId mirrors
// party.currentHexId (the party is the source of truth; the camp hex is a reconciled
// mirror — Architecture §3.3). The Stash subsystem is always-on core, so the camp is
// materialized for every non-disbanded party (the inventory-stash-system toggle was removed v0.17.0).
// =============================================================================
function partyCampStash(campaign, partyId){
  if(!campaign || !partyId || !Array.isArray(campaign.stashes)) return null;
  return campaign.stashes.find(s => s && s.kind === 'party' && s.ownerPartyId === partyId) || null;
}
// Idempotent find-or-create. Keeps the camp's hexId tracking the party, and its name
// tracking the party while it is still the auto-name (never clobbers a GM rename — a
// custom name that doesn't end in "'s Camp" is left alone). Returns the camp stash.
function ensurePartyCampStash(campaign, party){
  if(!campaign || !party || !party.id) return null;
  if(!Array.isArray(campaign.stashes)) campaign.stashes = [];
  let camp = partyCampStash(campaign, party.id);
  if(!camp){
    const _blankStash = (global.ACKS && global.ACKS.blankStash) || null;
    if(!_blankStash) return null;
    camp = _blankStash({ kind:'party', ownerPartyId: party.id, hexId: party.currentHexId || null, name: (party.name || 'Party') + "'s Camp" });
    camp.createdAtTurn = campaign.currentTurn || 1;
    campaign.stashes.push(camp);
  }
  camp.hexId = party.currentHexId || null;                                   // travels with the party
  if(!camp.name || /'s Camp$/.test(camp.name)) camp.name = (party.name || 'Party') + "'s Camp";
  return camp;
}
// Reconcile pass — ensure a camp for every non-disbanded party. Hooked into
// migrateCampaign (load). The Stash subsystem is always-on core, so this runs
// unconditionally; it is a no-op on party-less campaigns (e.g. the templates).
function syncAllPartyCampStashes(campaign){
  if(!campaign || !Array.isArray(campaign.parties)) return 0;
  let n = 0;
  for(const p of campaign.parties){ if(p && p.status !== 'disbanded' && ensurePartyCampStash(campaign, p)) n++; }
  return n;
}
// Light follow — used by the party-movement handlers (journey commit, gm-fiat). Does NOT
// create (creation is gated at ensure/sync); just keeps an existing camp at the party's hex.
function syncPartyCampHex(campaign, party){
  if(!campaign || !party) return;
  const camp = partyCampStash(campaign, party.id);
  if(camp) camp.hexId = party.currentHexId || null;
}
// Party dissolved → the leader takes the camp: re-home it as the leader's personal stash
// (all items + coins travel with ownership — "the leader takes all the equipment"). No
// leader → leave it as an ownerless cache at the hex so nothing is lost. (Splitting the
// camp among members on disband is a queued future feature — Stash plan §15 / Mech Ext.)
function handOffPartyCampToLeader(campaign, party){
  if(!campaign || !party) return null;
  const camp = partyCampStash(campaign, party.id);
  if(!camp) return null;
  const leaderId = party.leaderCharacterId || (Array.isArray(party.memberCharacterIds) && party.memberCharacterIds[0]) || null;
  if(leaderId){
    changeStashController(campaign, camp.id, { characterId: leaderId }, { reason:'party-disbanded' });
    camp.kind = 'personal';
    camp.name = (party.name || 'Party') + ' camp (dissolved)';
    return { camp, leaderId };
  }
  camp.kind = 'cache'; camp.ownerPartyId = null;
  camp.name = (party.name || 'Party') + ' camp (abandoned)';
  return { camp, leaderId: null };
}

// --- RAW carry-encumbrance bands (RR pp.83–84) -------------------------------
// Carry weight is in stone (coins: 1,000 = 1 st). Movement by load band:
// exploration ft/turn, combat ft/round (≈ 1/3 exploration), expedition miles/day.
// v1 surfaces the band on the sheet; propagating the penalty into other
// subsystems is Phase 3 travel (Journeys already uses the 24-mi unencumbered base).
const CARRY_ENCUMBRANCE_BANDS = [
  { level:'unencumbered', label:'Unencumbered',    maxSt: 5,       explorationFeet:120, combatFeet:40, milesPerDay:24 },
  { level:'light',        label:'Lightly loaded',  maxSt: 7,       explorationFeet: 90, combatFeet:30, milesPerDay:18 },
  { level:'heavy',        label:'Heavily loaded',  maxSt:10,       explorationFeet: 60, combatFeet:20, milesPerDay:12 },
  { level:'severe',       label:'Severely loaded', maxSt:20,       explorationFeet: 30, combatFeet:10, milesPerDay: 6 },
  { level:'overloaded',   label:'Overloaded',      maxSt:Infinity, explorationFeet:  0, combatFeet: 0, milesPerDay: 0 }
];
function carryEncumbranceBandFor(totalSt){
  const t = totalSt || 0;
  for(const b of CARRY_ENCUMBRANCE_BANDS){ if(t <= b.maxSt) return b; }
  return CARRY_ENCUMBRANCE_BANDS[CARRY_ENCUMBRANCE_BANDS.length - 1];
}
function carryEncumbranceLevel(character){ return carryEncumbranceBandFor(carryTotalEncumbrance(character)).level; }
function carryEncumbranceInfo(character){
  const totalSt = carryTotalEncumbrance(character);
  return { totalSt, band: carryEncumbranceBandFor(totalSt) };
}

// =============================================================================
// Phase 2.95 Stash A.3 — domain.treasury → treasury-stash migration (#468 / 2026-05-29).
// Per Phase_2.95_Stash_Plan.md §6.3 + §8.2. Idempotent. Always-on core
// (the inventory-stash-system toggle was removed v0.17.0).
// =============================================================================

// --- Capital-hex selection (pure) -------------------------------------------
// Prefer the hex with the largest urban settlement; fall back to the domain's first hex.
// Returns null if the domain has no hexes (orphan domain — migration defers).
// Single-home (T6): read the domain's hexes from canonical campaign.hexes (by domainId); for a
// nested-only file mid-migration (this can run before liftToTopLevelCollections), fall back to the
// domain's nested geography.hexes. Settlement resolved canonically (campaign.settlements) with the
// embedded mirror as back-compat.
function _selectDomainCapitalHex(campaign, domain){
  if(!domain) return null;
  let hexes = (campaign && Array.isArray(campaign.hexes)) ? campaign.hexes.filter(h => h && h.domainId === domain.id) : [];
  if(hexes.length === 0 && domain.geography && Array.isArray(domain.geography.hexes)) hexes = domain.geography.hexes;
  if(hexes.length === 0) return null;
  let best = null;
  let bestPop = -1;
  for(const h of hexes){
    const s = h && (h.settlement || (campaign && Array.isArray(campaign.settlements) ? campaign.settlements.find(x => x && x.hexId === h.id) : null));
    if(s){
      const pop = (s.urbanFamilies || 0);
      if(pop > bestPop){
        best = h;
        bestPop = pop;
      }
    }
  }
  return best || hexes[0];
}

// --- Per-domain migration (idempotent) --------------------------------------
// Returns the treasury stash (existing or freshly created). Three outcomes:
//   (1) domain.treasuryStashId resolves to a valid domain-treasury stash → return it
//   (2) Orphan: a domain-treasury stash for this domain exists but the pointer
//       is missing/stale → re-link domain.treasuryStashId, return the orphan
//   (3) Fresh: create stash at capital hex, seed with domain.treasury gp,
//       link via domain.treasuryStashId
//
// domain.treasury scalar is PRESERVED in all cases — A.4 reconcile owns
// the cross-field invariant.
function migrateDomainTreasuryToStash(campaign, domain){
  if(!campaign || !domain) return null;
  if(!Array.isArray(campaign.stashes)) campaign.stashes = [];

  // (1) Existing pointer resolves cleanly.
  if(domain.treasuryStashId){
    const existing = findStash(campaign, domain.treasuryStashId);
    if(existing && existing.kind === 'domain-treasury' && existing.ownerDomainId === domain.id){
      return existing;
    }
  }

  // (2) Orphan: a treasury stash exists for this domain but pointer is stale.
  const orphan = campaign.stashes.find(st =>
    st.kind === 'domain-treasury' && st.ownerDomainId === domain.id
  );
  if(orphan){
    domain.treasuryStashId = orphan.id;
    return orphan;
  }

  // (3) Fresh creation.
  const capitalHex = _selectDomainCapitalHex(campaign, domain);
  if(!capitalHex) return null;  // Defer — domain has no hexes

  const blankStash     = (global.ACKS && global.ACKS.blankStash)     || null;
  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  if(!blankStash || !blankStashItem) return null;

  // Canonical shape: domain.treasury = { gp: N }. Defensive against legacy
  // scalar shape (some pre-Stash-A user data may have stored a bare number).
  const treasuryRaw = domain.treasury;
  const seedQty = (typeof treasuryRaw === 'number')
    ? treasuryRaw
    : (treasuryRaw && typeof treasuryRaw.gp === 'number' ? treasuryRaw.gp : 0);
  const seedItems = seedQty > 0
    ? [ blankStashItem({ kind:'coin', denomination:'gp', qty: seedQty }) ]
    : [];

  const stash = blankStash({
    kind: 'domain-treasury',
    name: (domain.name || 'Domain') + ' Treasury',
    ownerDomainId: domain.id,
    hexId: capitalHex.id,
    items: seedItems,
    createdAtTurn: campaign.currentTurn || 1,
    history: [{
      turn: campaign.currentTurn || 1,
      type: 'created',
      reason: 'treasury-migration',
      seededFromScalarGp: seedQty
    }]
  });
  campaign.stashes.push(stash);
  domain.treasuryStashId = stash.id;
  return stash;
}

// --- Orchestrator hook for migrateCampaign ----------------------------------
// Always-on core (the inventory-stash-system toggle was removed v0.17.0): this
// materializes a treasury stash for every domain on load. Returns the number of
// domains that ended up with a treasuryStashId — useful diagnostic but not
// strictly the number of newly-created stashes (orphan repair counts too).
function migrateAllDomainTreasuries(campaign){
  if(!campaign) return 0;
  let linked = 0;
  for(const d of (campaign.domains || [])){
    const stash = migrateDomainTreasuryToStash(campaign, d);
    if(stash) linked++;
  }
  return linked;
}

// --- Canonical gp read (the public API replacing direct domain.treasury) ----
// Sum of gp-denominated coin entries in the domain's treasury stash. Returns
// 0 if no treasury stash exists (caller decides whether to fall back to the
// scalar). A.4 will add the canonical setter that keeps the scalar in sync.
function domainTreasuryGp(campaign, domainId){
  if(!campaign || !domainId) return 0;
  const stash = findDomainTreasury(campaign, domainId);
  if(!stash || !Array.isArray(stash.items)) return 0;
  let total = 0;
  for(const it of stash.items){
    // gp-equivalent of every coin line (handles multi-denomination treasuries; a
    // pure-gp treasury — the common case — is unchanged). Items I1, 2026-06-03.
    if(it && itemHasFacet(it, 'coin')){
      total += itemValueGp(it);
    }
  }
  return total;
}

// =============================================================================
// Phase 2.95 Stash A.4 — canonical-setter invariant + item-consolidation reconcile
// (#469 / 2026-05-29). Per Phase_2.95_Stash_Plan.md §6.4 +
// feedback-canonical-setters memory.
// =============================================================================

// --- Canonical-setter invariant: keep domain.treasury in sync with the stash --
// Called by depositToStash + withdrawFromStash after their mutations. No-op for
// non-treasury stashes. The "single mutation helper + load-time reconcile" half
// of the canonical-setters doctrine: mutations write through here, load-time
// reconcileTreasuryScalars catches any drift from external writers.
function _syncTreasuryScalarFor(campaign, stash){
  if(!campaign || !stash) return;
  if(stash.kind !== 'domain-treasury' || !stash.ownerDomainId) return;
  if(!Array.isArray(campaign.domains)) return;
  const domain = campaign.domains.find(d => d.id === stash.ownerDomainId);
  if(!domain) return;
  // Canonical shape: { gp: N }. If a legacy scalar slipped through, normalize.
  if(!domain.treasury || typeof domain.treasury !== 'object') domain.treasury = { gp: 0 };
  domain.treasury.gp = domainTreasuryGp(campaign, domain.id);
}

// --- Apply a signed gp delta to a domain treasury (engine-internal callers) --
// Routes through depositToStash whenever a treasuryStashId is linked (the Stash
// subsystem is always-on core), otherwise mutates the scalar directly. The C.1
// event-handler analog (_applyTreasuryDelta in acks-engine-events.js) does
// the same thing but takes a domainId — this version takes the domain object
// because commitTurn already has it in scope. Both routes preserve the A.4
// invariant: after the call, domain.treasury.gp matches the stash sum.
//
// Zero-amount calls are no-ops (defensive).
function _applyDomainTreasuryDelta(campaign, domain, amount, opts){
  if(!campaign || !domain || !amount) return;
  opts = opts || {};
  // Stash subsystem is always-on core — route through the treasury stash whenever
  // one is linked; the scalar fallback below covers the pre-migration window.
  if(domain.treasuryStashId){
    const stash = findStash(campaign, domain.treasuryStashId);
    if(stash){
      depositToStash(campaign, stash.id, [{ kind:'coin', denomination:'gp', qty: amount }], {
        reason: opts.reason || (amount >= 0 ? 'monthly-credit' : 'monthly-debit'),
        source: opts.label ? { kind:'label', label: opts.label } : null
      });
      // _syncTreasuryScalarFor inside depositToStash already updated domain.treasury.gp
      return;
    }
  }
  // Legacy fallback — rule off, or treasuryStashId unset (e.g. pre-migration).
  if(!domain.treasury) domain.treasury = { gp: 0 };
  domain.treasury.gp = (domain.treasury.gp || 0) + amount;
}

// --- Sweep all treasury scalars from their stashes' coin sums ----------------
// One-shot reconcile pass. Used at load time after migration; useful as a
// diagnostic to catch any pre-A.4 drift. Returns the number of domains whose
// scalar was updated.
function reconcileTreasuryScalars(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  let count = 0;
  for(const d of campaign.domains){
    if(!d || !d.treasuryStashId) continue;
    if(!d.treasury || typeof d.treasury !== 'object') d.treasury = { gp: 0 };
    const newTotal = domainTreasuryGp(campaign, d.id);
    if(d.treasury.gp !== newTotal){
      d.treasury.gp = newTotal;
      count++;
    }
  }
  return count;
}

// --- Item-consolidation reconcile -------------------------------------------
// Merge fungible facet-lines in stash.items (Items I1 facet model, 2026-06-03):
//   - coin    facet: same denomination → sum qty
//   - bulk    facet: same (name, unit) → sum qty + encumbranceSt
//   - gear    facet (and NOT magical/valuable/notable, named) → sum qty + encumbranceSt
// Coin is already merged on deposit by depositToStash, so this is a no-op for
// coin in normal operation; we still pass through it defensively in case
// historical data has multiple coin entries of the same denomination. Notable
// (promoted), valuable, and unnamed lines never merge — each is distinct.
//
// Notes are kept from the FIRST entry (consolidation preserves the oldest
// audit context). Returns true when any merge happened.
function reconcileStashItems(stash){
  if(!stash || !Array.isArray(stash.items) || stash.items.length < 2) return false;
  const items = stash.items;
  const coinBuckets = {};
  const bulkBuckets = {};
  const gearBuckets = {};
  const out = [];
  let merged = false;

  for(const it of items){
    if(!it){ continue; }
    if(itemHasFacet(it, 'coin')){
      const key = it.denomination || 'gp';
      if(!coinBuckets[key]){ coinBuckets[key] = it; out.push(it); }
      else { coinBuckets[key].qty = (coinBuckets[key].qty || 0) + (it.qty || 0); merged = true; }
    } else if(itemHasFacet(it, 'bulk')){
      const key = (it.name || it.label || '(unnamed)') + '|' + (it.unit || 'stones');
      if(!bulkBuckets[key]){ bulkBuckets[key] = it; out.push(it); }
      else {
        bulkBuckets[key].qty           = (bulkBuckets[key].qty           || 0) + (it.qty           || 0);
        bulkBuckets[key].encumbranceSt = (bulkBuckets[key].encumbranceSt || 0) + (it.encumbranceSt || 0);
        merged = true;
      }
    } else if(itemHasFacet(it, 'gear') && !it.notableItemId && !itemHasFacet(it, 'magical') && !itemHasFacet(it, 'valuable') && it.name){
      const key = it.name;
      if(!gearBuckets[key]){ gearBuckets[key] = it; out.push(it); }
      else {
        gearBuckets[key].qty           = (gearBuckets[key].qty           || 0) + (it.qty           || 0);
        gearBuckets[key].encumbranceSt = (gearBuckets[key].encumbranceSt || 0) + (it.encumbranceSt || 0);
        merged = true;
      }
    } else {
      // Notable/magical, valuable, unnamed — passthrough, never merge
      out.push(it);
    }
  }

  if(merged){
    stash.items = out;
    if(!Array.isArray(stash.history)) stash.history = [];
    stash.history.push({
      turn: 0,  // No campaign-turn context here; reconcile is load-time/diagnostic
      type: 'reconciled',
      reason: 'item-consolidation',
      itemCountBefore: items.length,
      itemCountAfter:  out.length
    });
  }
  return merged;
}

// --- Sweep all stashes ------------------------------------------------------
function reconcileAllStashes(campaign){
  if(!campaign || !Array.isArray(campaign.stashes)) return 0;
  let count = 0;
  for(const st of campaign.stashes){
    if(reconcileStashItems(st)) count++;
  }
  return count;
}

// =============================================================================
// Items I1 (OQ9 resolved 2026-06-03) — item facets + valuation + promotion.
// Composition over hierarchy (Architecture.md §2.2 + §3.7; DF_Study_2 §3.5): a
// stash/carry line carries facets[] not a coin|bulk|item subtype. These accessors
// are facet-canonical but fall back to the retired kind/magicItemId shape so an
// un-migrated line still reads correctly (DF "resilient accessor" — a missed
// migration stays harmless).
// =============================================================================

// ACKS II coin exchange, gp-equivalent. 1 pp = 5 gp; 1 gp = 10 sp = 100 cp;
// 1 ep = 5 sp = 0.5 gp. (RR Money; gp/sp/cp ratio per Phase_2.95_Stash_Plan.md §5.2.)
const COIN_GP_VALUE = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 5 };

function itemFacets(item){
  if(!item) return [];
  if(Array.isArray(item.facets) && item.facets.length) return item.facets;
  // Legacy fallback — derive from the retired `kind` discriminator.
  const k = item.kind;
  let f;
  if(k === 'coin') f = ['coin'];
  else if(k === 'bulk') f = ['bulk'];
  else if(k === 'valuable') f = ['valuable'];
  else f = ['gear'];
  if(item.magicItemId || item.notableItemId) f = f.concat('magical');
  return f;
}
function itemHasFacet(item, facet){ return itemFacets(item).indexOf(facet) >= 0; }

// Display precedence — the one facet that "names" the line.
const _FACET_PRECEDENCE = ['coin','valuable','readable','magical','container','bulk','gear'];
function primaryFacet(item){
  const f = itemFacets(item);
  for(const p of _FACET_PRECEDENCE){ if(f.indexOf(p) >= 0) return p; }
  return f[0] || 'gear';
}

// Per-line stone weight (derived). Coin: 1,000 coins = 1 stone, any denomination
// (RR p.83). Bulk in stones: weight = qty. Gear: explicit encumbranceSt, default
// 1 stone when unset (Stash plan §12). Valuables/other: explicit or negligible.
function itemEncumbranceSt(item){
  if(!item) return 0;
  if(itemHasFacet(item, 'coin')) return (item.qty || 0) / 1000;
  if(item.encumbranceSt != null) return item.encumbranceSt;
  if(item.stone != null) return parseFloat(item.stone) || 0;   // legacy Phase 2.6 carry-inventory weight
  if(itemHasFacet(item, 'bulk')) return (item.unit === 'stones') ? (item.qty || 0) : 0;
  if(itemHasFacet(item, 'gear')) return 1;
  return 0;
}

// ── Phase 2.5 Provisioning — food/water inventory accessors (RR p.278) ───────
// One daily ration = 1 stone = 2 lb food (1/6 st) + 1 gallon water (5/6 st). Food rides as discrete
// ration items in carry inventory / the camp stash (weight = 1/6 st × daysRemaining, so a half-eaten
// pack weighs less). Water is a metered fluid: the WATER CONTAINER items (waterskin 1/5 day, barrel
// 20 days) set the capacity; the single waterDaysCarried counter on the holder is the contents (no
// per-skin fill state — RAW meters by the daily gallon). See Provisioning §3.3–§3.5 + §5.
const RATION_FOOD_ST_PER_DAY  = 1/6;   // 2 lb food
const RATION_WATER_ST_PER_DAY = 5/6;   // 1 gallon water (only carried when no source — §4.3)

// Day-capacity of a water-container item: explicit field on the line, else the catalog entry's
// waterCapacityDays (by catalogId or matching name). Non-containers → 0.
function waterContainerDaysFor(item){
  if(!item) return 0;
  if(typeof item.waterCapacityDays === 'number') return item.waterCapacityDays;
  const cat = (global.ACKS && global.ACKS.EQUIPMENT_CATALOG) || [];
  const hit = (item.catalogId && cat.find(e => e.id === item.catalogId)) ||
              (item.name && cat.find(e => String(e.name).toLowerCase() === String(item.name).toLowerCase())) || null;
  return (hit && typeof hit.waterCapacityDays === 'number') ? hit.waterCapacityDays : 0;
}
// Total drinking-water capacity (days) of a holder = Σ its container items. Holder = a character
// (.inventory[]) or a stash (.items[]) — e.g. barrels in the party camp stash.
function waterCapacityDays(holder){
  if(!holder) return 0;
  const lines = Array.isArray(holder.inventory) ? holder.inventory
              : Array.isArray(holder.items) ? holder.items : [];
  return lines.reduce((s, it) => s + waterContainerDaysFor(it), 0);
}

// Ration-line helpers. A ration line: { name, catalogId, rationType:'iron'|'standard', daysRemaining,
// stone }. daysRemaining = person-day rations left in the pack (a fresh week-pack = 7); weight derives.
function isRationLine(item){
  return !!(item && (item.rationType === 'iron' || item.rationType === 'standard' ||
    (typeof item.daysRemaining === 'number' && /ration/i.test(item.name || ''))));
}
function rationLineDays(item){ return isRationLine(item) ? Math.max(0, Number(item.daysRemaining) || 0) : 0; }
function makeRationLine(opts){
  opts = opts || {};
  const type = (opts.rationType === 'standard') ? 'standard' : 'iron';
  const days = Math.max(0, Number(opts.daysRemaining != null ? opts.daysRemaining : 7) || 0);
  return {
    name: (type === 'iron') ? 'Rations, Iron (one week)' : 'Rations, Standard (one week)',
    catalogId: (type === 'iron') ? 'rations-iron-week' : 'rations-standard-week',
    rationType: type,
    daysRemaining: days,
    stone: days * RATION_FOOD_ST_PER_DAY,   // food weight only (1/6 st/day); water rides in containers
    notes: opts.notes || ''
  };
}
// Total person-day food rations a holder (character .inventory / stash .items) can draw on.
function rationDaysAvailable(holder){
  if(!holder) return 0;
  const lines = Array.isArray(holder.inventory) ? holder.inventory
              : Array.isArray(holder.items) ? holder.items : [];
  return lines.reduce((s, it) => s + rationLineDays(it), 0);
}

// Per-line gp value (derived). Coin: qty × denomination multiplier. Valuable:
// qty × unitValueGp. Gear/bulk carry no liquid gp value here (sale price is a
// mercantile concern, not stash wealth).
function itemValueGp(item){
  if(!item) return 0;
  if(itemHasFacet(item, 'coin')){
    const mult = COIN_GP_VALUE[item.denomination || 'gp'];
    return (item.qty || 0) * (mult != null ? mult : 1);
  }
  if(itemHasFacet(item, 'valuable')){
    return (item.qty || 0) * (item.unitValueGp || 0);
  }
  return 0;
}

// Stash / carry aggregates (derived; never stored — Stash plan §5.2 / §6.4).
function stashTotalGp(stash){
  if(!stash || !Array.isArray(stash.items)) return 0;
  return stash.items.reduce((s, it) => s + itemValueGp(it), 0);
}
function stashTotalEncumbrance(stash){
  if(!stash || !Array.isArray(stash.items)) return 0;
  return stash.items.reduce((s, it) => s + itemEncumbranceSt(it), 0);
}
function carryTotalEncumbrance(character){
  if(!character) return 0;
  let total = 0;
  if(Array.isArray(character.inventory)) total += character.inventory.reduce((s, it) => s + itemEncumbranceSt(it), 0);
  total += characterCoinWeightSt(character);   // RR p.83 — carried coins weigh
  return total;
}

// =============================================================================
// Character coins — multi-denomination purse (RAW; RR pp.83-84). coins.gp is the
// canonical gp store; character.personalGp is a synced mirror (canonical-setter
// rule #10), kept current by reconcileCharacterCoins (load-time migration + after
// any gm-fiat coins.* edit — see applyEvent_gmFiat). Coin weight derives: 1,000
// coins of ANY denomination = 1 stone. gp-equivalent uses COIN_GP_VALUE
// (cp .01 / sp .1 / ep .5 / gp 1 / pp 5).
// =============================================================================
const COIN_DENOMINATIONS = ['pp', 'gp', 'ep', 'sp', 'cp'];   // display order, high → low
function normalizeCoins(coins, personalGpFallback){
  const c = (coins && typeof coins === 'object') ? coins : null;
  return {
    pp: c ? (Number(c.pp) || 0) : 0,
    gp: c ? (Number(c.gp) || 0) : (Number(personalGpFallback) || 0),
    ep: c ? (Number(c.ep) || 0) : 0,
    sp: c ? (Number(c.sp) || 0) : 0,
    cp: c ? (Number(c.cp) || 0) : 0
  };
}
function characterCoinCount(character){
  if(!character || !character.coins) return 0;
  return COIN_DENOMINATIONS.reduce((s, d) => s + (Number(character.coins[d]) || 0), 0);
}
function characterCoinValueGp(character){
  if(!character || !character.coins) return 0;
  return COIN_DENOMINATIONS.reduce((s, d) => s + (Number(character.coins[d]) || 0) * COIN_GP_VALUE[d], 0);
}
function characterCoinWeightSt(character){
  return characterCoinCount(character) / 1000;   // RR p.83 — 1,000 coins = 1 stone
}
// Idempotent reconcile: ensure character.coins exists (folding a legacy personalGp
// scalar into coins.gp the first time it's seen), then refresh the personalGp mirror
// from the canonical coins.gp. Returns true iff it created the coins object.
function reconcileCharacterCoins(character){
  if(!character || typeof character !== 'object') return false;
  let created = false;
  if(!character.coins || typeof character.coins !== 'object'){
    character.coins = normalizeCoins(null, character.personalGp);
    created = true;
  }
  character.personalGp = Number(character.coins.gp) || 0;
  return created;
}
function migrateAllCharacterCoins(campaign){
  if(!campaign || !Array.isArray(campaign.characters)) return 0;
  let n = 0;
  for(const c of campaign.characters){ if(reconcileCharacterCoins(c)) n++; }
  return n;
}

// Promotion: a fungible/gear line → tracked NotableItem (§3.7; wanderer→lair).
// Creates a campaign.notableItems[] entry, points the line at it (notableItemId),
// and tags the line with the magical/readable facet. Idempotent: a line that
// already points at a notable returns that notable unchanged. Located-by-line —
// no separate itemCustody record is created (the line's container IS the custody;
// itemCustody is for UN-stashed notables: hoards, merchant stock — §3.7).
function promoteLineToNotableItem(campaign, line, opts){
  if(!campaign || !line) return null;
  if(line.notableItemId) return findNotableItem(campaign, line.notableItemId);
  const blankNotableItem = (global.ACKS && global.ACKS.blankNotableItem) || null;
  if(!blankNotableItem) return null;
  opts = opts || {};
  if(!Array.isArray(campaign.notableItems)) campaign.notableItems = [];
  const ni = blankNotableItem({
    kind: opts.kind || 'masterwork',
    name: opts.name || line.name || '',
    baseCatalogKey: opts.baseCatalogKey || null,
    intrinsic: opts.intrinsic || {},
    history: opts.history || []
  });
  campaign.notableItems.push(ni);
  line.notableItemId = ni.id;
  const facet = opts.facet || (ni.kind === 'book' ? 'readable' : 'magical');
  if(Array.isArray(line.facets) && line.facets.indexOf(facet) < 0) line.facets.push(facet);
  return ni;
}

// Derived facet view of a NotableItem — uniform vocabulary with stash lines, so a
// promoted item reads under the same facet model. NotableItem stored shape is NOT
// restructured here (its intrinsic/provenance/identification stay as §3.7); this is
// the bridge accessor.
function notableItemFacets(ni){
  if(!ni) return [];
  const k = ni.kind;
  if(k === 'book') return ['readable'];
  if(k === 'potion' || k === 'scroll') return ['consumable','magical'];
  if(k === 'regalia' || k === 'relic' || k === 'masterwork') return ['gear','valuable'];
  return ['gear','magical'];  // weapons / armor / wands / rods / staves / misc-magic
}

// Migration: legacy {kind, magicItemId, label} stash/carry line → facet shape.
// Idempotent — a line already carrying facets[] (and no legacy keys) is a no-op.
// Non-object entries (free-text inventory strings) are skipped untouched (the
// free-text→typed upgrade is Stash plan §8.3, a separate concern).
function migrateStashItemShape(item){
  if(!item || typeof item !== 'object') return false;
  const hasFacets = Array.isArray(item.facets) && item.facets.length;
  const hasLegacy = ('kind' in item) || ('magicItemId' in item) || ('label' in item);
  // Only migrate genuine stash-item lines (a legacy kind/magicItemId/label present).
  // Already-facet lines AND the Phase 2.6 carry-inventory {name,qty,stone,gp} shape
  // (neither facets nor a legacy stash discriminator) are left untouched — the full
  // carry-inventory→facet unification is Stash plan §8.3, deferred. itemEncumbranceSt
  // reads the legacy `stone` field so encumbrance is correct over both shapes.
  if(!hasLegacy) return false;
  if(!hasFacets){
    const k = item.kind;
    if(k === 'coin') item.facets = ['coin'];
    else if(k === 'bulk') item.facets = ['bulk'];
    else if(k === 'valuable') item.facets = ['valuable'];
    else item.facets = ['gear'];
  }
  if('magicItemId' in item){
    if(item.magicItemId && !item.notableItemId) item.notableItemId = item.magicItemId;
    delete item.magicItemId;
  }
  if(item.notableItemId && item.facets.indexOf('magical') < 0 && item.facets.indexOf('readable') < 0){
    item.facets.push('magical');
  }
  if('label' in item){
    if(item.label && !item.name) item.name = item.label;
    delete item.label;
  }
  // Ensure the superset fields exist (stable Inspector schema + accessors).
  if(!('name' in item)) item.name = '';
  if(!('denomination' in item)) item.denomination = item.facets.indexOf('coin') >= 0 ? 'gp' : null;
  if(!('valuableType' in item)) item.valuableType = null;
  if(!('valuableTier' in item)) item.valuableTier = null;
  if(!('unitValueGp' in item)) item.unitValueGp = null;
  if(!('encumbranceSt' in item)) item.encumbranceSt = null;
  if(!('unit' in item)) item.unit = (item.facets.indexOf('bulk') >= 0 ? 'stones' : null);
  if(!('notableItemId' in item)) item.notableItemId = null;
  if(!('containerStashId' in item)) item.containerStashId = null;
  if(!('notes' in item)) item.notes = '';
  delete item.kind;
  return true;
}

// Sweep every stash + every character carry inventory. Idempotent. Hooked into
// migrateCampaign before reconcileAllStashes so reconcile reads facet-shaped lines.
function migrateAllStashItemShapes(campaign){
  if(!campaign) return 0;
  let n = 0;
  for(const st of (campaign.stashes || [])){
    for(const it of (st && Array.isArray(st.items) ? st.items : [])){
      if(migrateStashItemShape(it)) n++;
    }
  }
  for(const ch of (campaign.characters || [])){
    for(const it of (ch && Array.isArray(ch.inventory) ? ch.inventory : [])){
      if(migrateStashItemShape(it)) n++;
    }
  }
  return n;
}

// =============================================================================
// Phase Wave B.5 — Notable items + custody lookups (pure-find subset, 2026-05-29).
// Per Architecture.md §3.7. Mutator-style helpers (promoteToNotable, transferCustody)
// land with the future B.5.2 setters commit.
// =============================================================================

function findNotableItem(campaign, itemId){
  if(!campaign || !Array.isArray(campaign.notableItems)) return null;
  return campaign.notableItems.find(it => it.id === itemId) || null;
}

function findItemCustody(campaign, custodyId){
  if(!campaign || !Array.isArray(campaign.itemCustody)) return null;
  return campaign.itemCustody.find(cu => cu.id === custodyId) || null;
}

// Returns the currently-active custody record for a given item. Per §3.7, a notable
// item has at most one active custody (status==='active') at a time; superseded
// transfers have their prior records flipped to status==='ended'.
function currentCustodyOfItem(campaign, itemId){
  if(!campaign || !Array.isArray(campaign.itemCustody)) return null;
  return campaign.itemCustody.find(cu => cu.itemId === itemId && cu.status === 'active') || null;
}

// All notable items currently in a given custodian's possession. The custodian
// is keyed by (kind, id) pair — same shape used on itemCustody records.
function notableItemsInCustodian(campaign, custodianKind, custodianId){
  if(!campaign || !Array.isArray(campaign.itemCustody)) return [];
  if(!Array.isArray(campaign.notableItems)) return [];
  const liveCustody = campaign.itemCustody.filter(cu =>
    cu.status === 'active' &&
    cu.custodianKind === custodianKind &&
    cu.custodianId === custodianId
  );
  const itemIds = new Set(liveCustody.map(cu => cu.itemId));
  return campaign.notableItems.filter(it => itemIds.has(it.id));
}

// Convenience wrapper: notable items currently held by a character.
function notableItemsHeldByCharacter(campaign, characterId){
  return notableItemsInCustodian(campaign, 'character', characterId);
}

// Notable items physically located at a hex. Includes direct hex custodians
// (lost caches, abandoned hoards) AND transitively-resolved items held by
// characters whose currentHexId matches. Excludes items in characters that
// are travelling (currentHexId === null).
function notableItemsAtHex(campaign, hexId){
  if(!campaign || !hexId) return [];
  const out = [];
  if(Array.isArray(campaign.itemCustody)){
    // Direct hex custodianship
    const hexCustody = campaign.itemCustody.filter(cu =>
      cu.status === 'active' && cu.custodianKind === 'hex' && cu.custodianId === hexId
    );
    const hexItemIds = new Set(hexCustody.map(cu => cu.itemId));
    if(Array.isArray(campaign.notableItems)){
      for(const it of campaign.notableItems){
        if(hexItemIds.has(it.id)) out.push(it);
      }
    }
    // Items held by characters located at this hex
    if(Array.isArray(campaign.characters)){
      const charactersAtHex = new Set(
        campaign.characters
          .filter(c => c.currentHexId === hexId)
          .map(c => c.id)
      );
      if(charactersAtHex.size){
        const charItemIds = new Set(
          campaign.itemCustody
            .filter(cu => cu.status === 'active' && cu.custodianKind === 'character' && charactersAtHex.has(cu.custodianId))
            .map(cu => cu.itemId)
        );
        if(Array.isArray(campaign.notableItems)){
          for(const it of campaign.notableItems){
            if(charItemIds.has(it.id) && !hexItemIds.has(it.id)) out.push(it);
          }
        }
      }
    }
  }
  return out;
}

// Self-register the stash / coins / wealth load-migration passes (#467/#468/#469 + Items I1).
// These were inline entries in the engine's load-migration seed array; moved here with their
// functions (T5, 2026-06-23). Orders preserved exactly; runLoadMigrations sorts by order so the
// cross-file dependencies still hold. Idempotent; each is a no-op on already-normalized data.
if (ACKS && typeof ACKS.registerLoadMigration === 'function') {
  ACKS.registerLoadMigration('character-coins', migrateAllCharacterCoins, { order: 70 });
  ACKS.registerLoadMigration('domain-treasuries', migrateAllDomainTreasuries, { order: 90 });
  ACKS.registerLoadMigration('stash-item-shapes', migrateAllStashItemShapes, { order: 100 });
  ACKS.registerLoadMigration('reconcile-stashes', reconcileAllStashes, { order: 110 });
  ACKS.registerLoadMigration('reconcile-treasury-scalars', reconcileTreasuryScalars, { order: 120 });
  ACKS.registerLoadMigration('sync-party-camp-stashes', syncAllPartyCampStashes, { order: 190 });
}

Object.assign(ACKS, {
  // Phase 2.95 Stash A — read-only stash lookups (2026-05-29)
  findStash, stashesOwnedByCharacter, stashesAtHex, findDomainTreasury, stashesAccessibleToCharacter,
  // Phase 2.95 Stash A.2 — canonical setters (#467 / 2026-05-29)
  depositToStash, withdrawFromStash, transferBetweenStashes,
  // Phase 2.95 Stash B engine foundation — carry↔stash + controller + bands (2026-06-03)
  findOrCreateStashAt, transferCarryToStash, transferStashToCarry, changeStashController,
  // Items I1 Step 3 — character⇄co-located-stash transfer (purse + Phase-2.6 carry; 2026-06-03)
  cacheToStash, drawFromStash,
  // Items I1 / Stash B — party camp stash (travels with the party; leader-takes-all on disband)
  partyCampStash, ensurePartyCampStash, syncAllPartyCampStashes, syncPartyCampHex, handOffPartyCampToLeader,
  carryEncumbranceLevel, carryEncumbranceInfo, carryEncumbranceBandFor, CARRY_ENCUMBRANCE_BANDS,
  // Phase 2.95 Stash A.3 — treasury migration + canonical gp read (#468 / 2026-05-29)
  migrateDomainTreasuryToStash, migrateAllDomainTreasuries, domainTreasuryGp,
  // Phase 2.95 Stash A.4 — canonical-setter invariant + item-consolidation reconcile (#469 / 2026-05-29)
  reconcileStashItems, reconcileAllStashes, reconcileTreasuryScalars,
  // Items I1 — facet item model + valuation + promotion + migration (OQ9, 2026-06-03)
  itemFacets, itemHasFacet, primaryFacet, itemEncumbranceSt, itemValueGp, COIN_GP_VALUE,
  stashTotalGp, stashTotalEncumbrance, carryTotalEncumbrance,
  // Phase 2.5 Provisioning — food/water inventory accessors (RR p.278)
  RATION_FOOD_ST_PER_DAY, RATION_WATER_ST_PER_DAY, waterContainerDaysFor, waterCapacityDays,
  isRationLine, rationLineDays, makeRationLine, rationDaysAvailable,
  promoteLineToNotableItem, notableItemFacets,
  migrateStashItemShape, migrateAllStashItemShapes,
  // Items I1 — character coin purse (multi-denomination; coins.gp canonical, personalGp mirror)
  COIN_DENOMINATIONS, normalizeCoins, characterCoinCount, characterCoinValueGp, characterCoinWeightSt,
  reconcileCharacterCoins, migrateAllCharacterCoins,
  // Wave B.5 — Notable items + custody read-only lookups (2026-05-29)
  findNotableItem, findItemCustody, currentCustodyOfItem,
  notableItemsInCustodian, notableItemsHeldByCharacter, notableItemsAtHex,
  // T5 (2026-06-23) — the canonical treasury setter, now exported for its 10 cross-module
  // callers in the core engine (was engine-private; rewired to ACKS._applyDomainTreasuryDelta).
  _applyDomainTreasuryDelta
});

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
