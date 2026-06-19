/* ACKS God Mode — acks-engine-magic-items.js
 * Magic Items #143 — W1: the magic-item ECONOMY (a thin layer over a shipped home).
 *
 * Spec: Phase_3_Magic_Items_Plan.md (the routing) + Treasure_Tome_RAW_Survey.md Part 1.4–1.7 (the
 * RAW substrate; the TT is the canonical home — TT intro p.5: Ch.1–3 supersede the JJ/RR treasure
 * chapters). A magic item, in scope, is an ECONOMIC + world-state object — identified, used (charges
 * deplete), appraised, bought, sold, carried, inherited, earning XP. The *casting of its effect in a
 * fight* is the table's (Magic_RAW_Survey.md §2 scope line); everything around it is ours, and almost
 * all of it already exists — this module CONNECTS the shipped pieces and adds the catalog.
 *
 * Shipped-spine reuse (the "thin orphan" proof, plan §5):
 *   - the item itself  → the `magical` item-facet (Architecture §2.2) + `campaign.notableItems[]`
 *     (§3.7), with the reserved `intrinsic` / `identification` / `provenance` shapes ALREADY on
 *     blankNotableItem. This module writes those fields DEFENSIVELY (init-on-write) — it never edits
 *     the factory (acks-engine-entities.js is out of this lane).
 *   - promotion → the shipped promoteLineToNotableItem (extended here to fill from the catalog).
 *   - the ID throws → the shipped Layer-1 ACKS.rollProficiencyThrow (RR pp.9–10) + proficiencyRanks.
 *   - buy/sell TRANSACTIONS → the shipped magic-item-sale (M&M) / item-transfer / market-transaction
 *     verbs. This module supplies the PRICE FUNCTION those flows read — it does NOT rebuild the sale.
 *   - item CREATION (cost/throw/facility) → Magic Research (acks-engine-magic-research.js, AD-M1).
 *     This module cross-references it; commissioning (a Command wrapper) is MI-4, deferred.
 *
 * Cardinal decisions (plan §2/§4/§6 + manifest note):
 *   - NO new entity, NO new prefix, NO new collection — the catalog is FROZEN reference data on this
 *     module (the TROOP_CATALOG / MONSTER_CATALOG posture); a magic item is a `notableItem`.
 *   - The 3 event kinds (item-identified / item-charge-spent / item-appraised) MUST NOT collide with
 *     the shipped magic-item-created / magic-item-sale / item-transfer (they don't — verified).
 *   - IP (CLAUDE §13.6): the catalog ships MECHANICAL FIELDS + a book PAGE-REF only — never the
 *     per-item Description / Mechanics / Lore prose. W1 ships a curated mechanical core + a
 *     generic-by-base-cost path (plan §8 OQ1); the full named catalog is a content-pack deepening,
 *     IP-flagged for the §13.9 ckpt-3 Autarch courtesy heads-up before any public release.
 *   - RAW-default, default-on, dormant-until-used (§6 polarity) — no master toggle. A campaign with
 *     no magic items has an empty Notable-Items tier. (The optional `magic-item-traits` pack is MI-5.)
 *
 * Loads after events.js + proficiencies (it calls ACKS.newEvent / rollProficiencyThrow /
 * proficiencyRanks / blankNotableItem / findNotableItem at CALL time, never at load). Self-contained:
 * pure reads + four verbs over a passed campaign, mirroring acks-engine-sages.js.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  function _miACKS(){ return (typeof global !== 'undefined' && global.ACKS) || (typeof window !== 'undefined' && window.ACKS) || {}; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _findChar(campaign, id){ if(!id) return null; return _chars(campaign).find(c => c && c.id === id) || null; }
  function _notables(campaign){ return (campaign && Array.isArray(campaign.notableItems)) ? campaign.notableItems : []; }
  function _findNotable(campaign, id){
    if(!id) return null;
    const A = _miACKS();
    if(typeof A.findNotableItem === 'function'){ const r = A.findNotableItem(campaign, id); if(r) return r; }
    return _notables(campaign).find(n => n && n.id === id) || null;
  }
  function _charLevel(c){ return Math.max(1, Number(c && c.level) || 1); }
  function _profRanks(character, key){
    const A = _miACKS();
    if(typeof A.proficiencyRanks === 'function') return A.proficiencyRanks(character, key) || 0;
    // Standalone fallback: tolerant scan of the {key,ranks}/string proficiencies[] shape.
    if(!character || !Array.isArray(character.proficiencies)) return 0;
    const want = String(key).toLowerCase().replace(/-/g, ' ');
    let n = 0;
    for(const p of character.proficiencies){
      const k = (p && typeof p === 'object') ? String(p.key || p.name || p.label || '') : String(p || '');
      if(k.toLowerCase().replace(/-/g, ' ').indexOf(want) >= 0) n += (p && typeof p.ranks === 'number') ? p.ranks : 1;
    }
    return n;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // The catalog — reference data (mechanical fields + page-ref; NO prose). ⚠ IP §13.6.
  // ═══════════════════════════════════════════════════════════════════════════

  // Item Rarity by max base cost (Treasure_Tome_RAW_Survey.md §1.2 / TT p.20).
  const RARITY_TIERS = Object.freeze([
    { key:'common',    label:'Common',    maxBaseCost:1000 },
    { key:'uncommon',  label:'Uncommon',  maxBaseCost:5000 },
    { key:'rare',      label:'Rare',      maxBaseCost:25000 },
    { key:'very-rare', label:'Very Rare', maxBaseCost:100000 },
    { key:'legendary', label:'Legendary', maxBaseCost:Infinity }
  ]);
  function magicItemRarity(baseCost){
    const c = Number(baseCost) || 0;
    for(const t of RARITY_TIERS){ if(c <= t.maxBaseCost) return t.key; }
    return 'legendary';
  }
  function rarityLabel(key){ const t = RARITY_TIERS.find(t => t.key === key); return t ? t.label : (key || ''); }

  // Arms & Armor permanent-bonus base costs (TT p.51 / survey §1.6). The +N ladder is a pure
  // mechanical fact: any +N weapon/armor/shield prices off this, no per-item catalog entry needed.
  const ARMS_ARMOR_BASE_COST = Object.freeze({
    '+1':    5000,
    '+1/+2': 10000,   // first bonus all targets, second vs a limited creature group
    '+2':    15000,
    '+1/+3': 20000,
    '+2/+3': 25000,
    '+3':    35000
  });
  function armsArmorBaseCost(spec){
    if(spec == null) return null;
    const s = String(spec).trim();
    if(ARMS_ARMOR_BASE_COST[s] != null) return ARMS_ARMOR_BASE_COST[s];
    const n = s.replace(/[^0-9]/g, '');           // bare "1"/"2"/"3" → "+N"
    return ARMS_ARMOR_BASE_COST['+' + n] != null ? ARMS_ARMOR_BASE_COST['+' + n] : null;
  }

  // The curated mechanical core (plan §8 OQ1 — "curated core + generic-by-base-cost"). Each entry is
  // an archetype carrying the TT 1.7 item data-model fields; NOT the named-item catalog (that's the
  // IP-flagged content-pack deepening). Spans every kind + rarity tier + charges + cursed + the arms
  // ladder so the economy (rarity / price spread / identification gating / charges) is exercisable.
  // `kind` ∈ the blankNotableItem vocab. activationFrequency ∈ permanent | at-will | charged | single-use.
  function _cat(o){
    const baseCost = (o.baseCost != null) ? o.baseCost : 0;
    return Object.freeze({
      key: o.key,
      name: o.name,
      kind: o.kind,                                   // magic-weapon|magic-armor|potion|scroll|wand|rod|staff|misc-magic
      baseCost,
      apparentValue: (o.apparentValue != null) ? o.apparentValue : baseCost,
      rarity: o.rarity || magicItemRarity(baseCost),
      charges: (o.charges != null) ? o.charges : null,
      activationFrequency: o.activationFrequency || (o.charges != null ? 'charged' : 'permanent'),
      enchantmentBonus: (o.enchantmentBonus != null) ? o.enchantmentBonus : null,
      cursed: !!o.cursed,
      pageRef: o.pageRef || 'TT (catalog)'
    });
  }
  const MAGIC_ITEM_CATALOG = Object.freeze({
    // — Arms & armor (the +N ladder, TT p.51) —
    'weapon-plus-1':  _cat({ key:'weapon-plus-1',  name:'Weapon +1',  kind:'magic-weapon', baseCost:5000,  enchantmentBonus:1, pageRef:'TT p.51' }),
    'weapon-plus-2':  _cat({ key:'weapon-plus-2',  name:'Weapon +2',  kind:'magic-weapon', baseCost:15000, enchantmentBonus:2, pageRef:'TT p.51' }),
    'weapon-plus-3':  _cat({ key:'weapon-plus-3',  name:'Weapon +3',  kind:'magic-weapon', baseCost:35000, enchantmentBonus:3, pageRef:'TT p.51' }),
    'armor-plus-1':   _cat({ key:'armor-plus-1',   name:'Armor +1',   kind:'magic-armor',  baseCost:5000,  enchantmentBonus:1, pageRef:'TT p.51' }),
    'armor-plus-2':   _cat({ key:'armor-plus-2',   name:'Armor +2',   kind:'magic-armor',  baseCost:15000, enchantmentBonus:2, pageRef:'TT p.51' }),
    'shield-plus-1':  _cat({ key:'shield-plus-1',  name:'Shield +1',  kind:'magic-armor',  baseCost:5000,  enchantmentBonus:1, pageRef:'TT p.51' }),
    // — Single-use (potions / scrolls) —
    'potion-common':  _cat({ key:'potion-common',  name:'Potion (common)', kind:'potion', baseCost:400,  charges:1, activationFrequency:'single-use', pageRef:'TT p.55' }),
    'spell-scroll':   _cat({ key:'spell-scroll',   name:'Spell Scroll',    kind:'scroll', baseCost:500,  charges:1, activationFrequency:'single-use', pageRef:'TT p.55' }),
    // — Charged implements —
    'wand-charged':   _cat({ key:'wand-charged',   name:'Wand (charged)',          kind:'wand',  baseCost:5000,  charges:20, pageRef:'TT p.55' }),
    'rod-charged':    _cat({ key:'rod-charged',    name:'Rod (charged)',           kind:'rod',   baseCost:15000, charges:10, pageRef:'TT p.55' }),
    'staff-charged':  _cat({ key:'staff-charged',  name:'Staff (greater, charged)', kind:'staff', baseCost:20000, charges:25, pageRef:'TT p.55' }),
    // — Permanent misc —
    'ring-permanent': _cat({ key:'ring-permanent', name:'Ring (permanent)', kind:'misc-magic', baseCost:10000, pageRef:'TT p.55' }),
    'wondrous-very-rare': _cat({ key:'wondrous-very-rare', name:'Wondrous Item (very rare)', kind:'misc-magic', baseCost:60000,  pageRef:'TT p.55' }),
    'wondrous-legendary': _cat({ key:'wondrous-legendary', name:'Wondrous Item (legendary)', kind:'misc-magic', baseCost:150000, pageRef:'TT p.55' }),
    // — A cursed example (apparent value is deceptive — looks like an ordinary magic weapon) —
    'cursed-weapon-minus-1': _cat({ key:'cursed-weapon-minus-1', name:'Cursed Weapon −1', kind:'magic-weapon', baseCost:1000, apparentValue:0, enchantmentBonus:-1, cursed:true, pageRef:'TT p.55' })
  });
  function magicItemCatalog(){ return Object.values(MAGIC_ITEM_CATALOG); }
  function findMagicItemCatalog(key){ return (key && MAGIC_ITEM_CATALOG[key]) || null; }
  function magicItemCatalogKeys(){ return Object.keys(MAGIC_ITEM_CATALOG); }

  // A catalog-shaped descriptor for ANY item priced off a base cost (the generic-by-base-cost path —
  // the Item-Trade pattern: any item transacts off its list price). Used for items not in the curated
  // core; rarity + price all derive from the base cost.
  function genericMagicItem(opts){
    opts = opts || {};
    const baseCost = Number(opts.baseCost) || 0;
    return _cat({
      key: opts.key || null,
      name: opts.name || 'Magic Item',
      kind: opts.kind || 'misc-magic',
      baseCost,
      apparentValue: opts.apparentValue,
      charges: opts.charges,
      activationFrequency: opts.activationFrequency,
      enchantmentBonus: opts.enchantmentBonus,
      cursed: opts.cursed,
      pageRef: opts.pageRef || 'TT (generic)'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Minting / promotion — write the catalog facts onto a NotableItem's reserved shape.
  // ═══════════════════════════════════════════════════════════════════════════

  // The `intrinsic` payload the catalog populates (TT 1.7 data model). Lives on notableItem.intrinsic
  // (a free-form {} on the factory — written defensively here, no factory edit).
  function _intrinsicFromCatalog(entry){
    return {
      baseCost: entry.baseCost,
      apparentValue: entry.apparentValue,
      rarity: entry.rarity,
      category: entry.kind,
      charges: entry.charges,
      maxCharges: entry.charges,
      activationFrequency: entry.activationFrequency,
      enchantmentBonus: entry.enchantmentBonus,
      cursed: entry.cursed,
      depleted: false,
      pageRef: entry.pageRef
    };
  }

  // Mint a NotableItem from a catalog key (GM authoring / treasure / inspector). Returns the NotableItem
  // or null. The Admin-verb counterpart to promotion; uses the shipped blankNotableItem factory.
  function createNotableFromCatalog(campaign, key, opts){
    opts = opts || {};
    const A = _miACKS();
    const entry = findMagicItemCatalog(key) || (opts.generic ? genericMagicItem(opts.generic) : null);
    if(!entry || typeof A.blankNotableItem !== 'function') return null;
    if(!Array.isArray(campaign.notableItems)) campaign.notableItems = [];
    const ni = A.blankNotableItem({
      kind: entry.kind,
      name: opts.name || entry.name,
      baseCatalogKey: entry.key || null,
      intrinsic: _intrinsicFromCatalog(entry),
      history: opts.history || []
    });
    if(opts.makerCharacterId){
      ni.provenance = ni.provenance || {};
      ni.provenance.makerCharacterId = opts.makerCharacterId;
      ni.provenance.createdAtTurn = (campaign.currentTurn || 1);
      ni.provenance.knownMakeAndAuthenticity = true;   // a created item sells at ×2 (TT p.28)
    }
    campaign.notableItems.push(ni);
    return ni;
  }

  // Promote a carry/stash line to a NotableItem, filling kind + baseCatalogKey + intrinsic from the
  // catalog, then delegating to the shipped promoteLineToNotableItem (which sets line.notableItemId +
  // pushes the magical facet). A catalog-aware wrapper over the shipped promotion.
  function promoteLineFromCatalog(campaign, line, key, opts){
    opts = opts || {};
    const A = _miACKS();
    const entry = findMagicItemCatalog(key) || (opts.generic ? genericMagicItem(opts.generic) : null);
    if(typeof A.promoteLineToNotableItem !== 'function') return null;
    const o = entry
      ? { kind: entry.kind, name: opts.name || entry.name, baseCatalogKey: entry.key || null, intrinsic: _intrinsicFromCatalog(entry), history: opts.history || [] }
      : { kind: opts.kind || 'misc-magic', name: opts.name, history: opts.history || [] };
    return A.promoteLineToNotableItem(campaign, line, o);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pricing / appraisal — the TT p.28 market-price spread (the load-bearing fact).
  // ═══════════════════════════════════════════════════════════════════════════

  // × base cost (TT p.28): commission ×3 · buy ×2.25 · sell-an-item-you-CREATED ×2 · sell-a-FOUND-item ×1.
  const PRICE_MULTIPLIER = Object.freeze({ commission:3, buy:2.25, 'sell-created':2, 'sell-found':1 });

  // Resolve a base cost from a ref: a NotableItem | a catalog key | a number.
  function _resolveBaseCost(campaign, ref){
    if(ref == null) return null;
    if(typeof ref === 'number') return ref;
    if(typeof ref === 'string'){ const e = findMagicItemCatalog(ref); return e ? e.baseCost : null; }
    // a NotableItem
    const ni = ref;
    const intr = ni.intrinsic || {};
    if(typeof intr.baseCost === 'number') return intr.baseCost;
    if(ni.baseCatalogKey){ const e = findMagicItemCatalog(ni.baseCatalogKey); if(e) return e.baseCost; }
    if(typeof intr.enchantmentBonus === 'number'){
      const c = armsArmorBaseCost('+' + Math.abs(intr.enchantmentBonus)); if(c != null) return c;
    }
    return null;
  }
  function magicItemBaseCost(campaign, ref){ return _resolveBaseCost(campaign, ref); }

  // Apparent value (TT 1.7) — XP value + the found-item sale anchor; ≠ base cost. Falls back to base cost.
  function magicItemApparentValue(campaign, ref){
    if(ref && typeof ref === 'object' && ref.intrinsic && typeof ref.intrinsic.apparentValue === 'number') return ref.intrinsic.apparentValue;
    if(typeof ref === 'string'){ const e = findMagicItemCatalog(ref); if(e) return e.apparentValue; }
    return _resolveBaseCost(campaign, ref);
  }
  // XP is earned only for items recovered AND kept, equal to the apparent value (TT 1.4).
  function magicItemXpValue(campaign, ref){ return magicItemApparentValue(campaign, ref); }

  // Is this NotableItem a CREATED item (sells at ×2) vs a FOUND item (×1)? Provenance-driven (TT p.28
  // / RR p.130): a known maker or asserted authenticity → created.
  function magicItemIsCreated(ni){
    if(!ni || !ni.provenance) return false;
    return !!(ni.provenance.makerCharacterId || ni.provenance.knownMakeAndAuthenticity);
  }

  // The full price spread for an item ref. Returns base cost, rarity, apparent value, and every
  // market price; `sell` picks created-vs-found from provenance when ref is a NotableItem.
  function magicItemPriceSpread(campaign, ref, opts){
    opts = opts || {};
    const baseCost = _resolveBaseCost(campaign, ref);
    if(baseCost == null) return { available:false, reason:'no-base-cost' };
    const rarity = (ref && typeof ref === 'object' && ref.intrinsic && ref.intrinsic.rarity) || magicItemRarity(baseCost);
    const created = (opts.created != null) ? !!opts.created : (ref && typeof ref === 'object' ? magicItemIsCreated(ref) : false);
    const round = n => Math.round(n);
    return {
      available: true,
      baseCost,
      rarity,
      rarityLabel: rarityLabel(rarity),
      apparentValue: magicItemApparentValue(campaign, ref),
      commission:  round(baseCost * PRICE_MULTIPLIER.commission),
      buy:         round(baseCost * PRICE_MULTIPLIER.buy),
      sellCreated: round(baseCost * PRICE_MULTIPLIER['sell-created']),
      sellFound:   round(baseCost * PRICE_MULTIPLIER['sell-found']),
      created,
      sell: round(baseCost * PRICE_MULTIPLIER[created ? 'sell-created' : 'sell-found'])
    };
  }
  // The price for one mode ('commission'|'buy'|'sell'); 'sell' resolves created-vs-found.
  function magicItemPrice(campaign, ref, mode, opts){
    const s = magicItemPriceSpread(campaign, ref, opts);
    if(!s.available) return null;
    if(mode === 'commission') return s.commission;
    if(mode === 'buy') return s.buy;
    if(mode === 'sell') return s.sell;
    if(mode === 'sell-created') return s.sellCreated;
    if(mode === 'sell-found') return s.sellFound;
    return null;
  }

  // appraiseMagicItem(campaign, opts) — the verb. opts: { itemId, characterId?, secret?, submittedBy? }.
  // Surfaces the price spread + rarity + apparent value (the mechanical price facts) and records an
  // item-appraised event. Informational (no throw — accurate-appraisal-by-throw is a refinement).
  // Returns { ok, spread, event } or { ok:false, error }.
  function appraiseMagicItem(campaign, opts){
    opts = opts || {};
    if(!campaign) return { ok:false, error:'no-campaign' };
    const ni = _findNotable(campaign, opts.itemId);
    if(!ni) return { ok:false, error:'unknown-item' };
    const spread = magicItemPriceSpread(campaign, ni);
    if(!spread.available) return { ok:false, error: spread.reason || 'no-base-cost' };
    const appraiser = _findChar(campaign, opts.characterId);
    const payload = {
      itemId: ni.id,
      characterId: appraiser ? appraiser.id : null,
      baseCost: spread.baseCost,
      rarity: spread.rarity,
      apparentValue: spread.apparentValue,
      priceBuy: spread.buy,
      priceCommission: spread.commission,
      priceSellFound: spread.sellFound,
      priceSellCreated: spread.sellCreated,
      created: spread.created,
      narrative: _appraiseNarrative(ni, appraiser, spread)
    };
    const ev = _emitMagicItemEvent(campaign, 'item-appraised', payload, { character: appraiser, item: ni, submittedBy: opts.submittedBy });
    return { ok:true, spread, event: ev };
  }
  function _appraiseNarrative(ni, appraiser, s){
    const who = appraiser ? (appraiser.name || 'A character') : 'The party';
    const name = ni.name || (ni.kind || 'a magic item');
    return who + ' appraises ' + name + ' — ' + s.rarityLabel + ', base ' + s.baseCost +
      'gp (buy ~' + s.buy + ', sell ~' + s.sell + ').';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Identification — the 5 RAW methods (TT 1.4), gated by rarity + proficiency, written to the
  // shipped notableItem.identification, with the level-up-retry state.
  // ═══════════════════════════════════════════════════════════════════════════

  // Each method: which property keys it can reveal, whether it needs a 1d20 proficiency throw, which
  // proficiency, what rarities/kinds it applies to. (RR/TT identification, survey §1.4.) `knownKeys`
  // is the union written to identification.knownProperties on success — the partial-vs-full split.
  //   general-use · bonus · charges · command-words · curse · effect · spells · properties (full)
  const FULL_ID_KEYS = ['general-use','bonus','charges','command-words','curse','effect','properties'];
  const ID_METHODS = Object.freeze({
    'equip': {            // equip / experience — anyone; permanent on-use/wear props + triggers curses
      label:'Equip & experience', throw:false, proficiency:null,
      knownKeys:['general-use'], rarities:null, kinds:null, pageRef:'TT p.26' },
    'proficient-use': {   // use weapon/armor proficiently — learns the BONUS only (1 round / 1 day)
      label:'Use proficiently', throw:false, proficiency:null,
      knownKeys:['bonus'], rarities:null, kinds:['magic-weapon','magic-armor'], pageRef:'TT p.26' },
    'read-scroll': {      // read a scroll — literate; # + which spells (spell scrolls)
      label:'Read the scroll', throw:false, proficiency:null,
      knownKeys:['spells','general-use'], rarities:null, kinds:['scroll'], pageRef:'TT p.26' },
    'alchemy': {          // Alchemy proficiency → ID a potion (1 turn + throw)
      label:'Alchemy', throw:true, proficiency:'alchemy',
      knownKeys:['general-use','effect'], rarities:null, kinds:['potion'], pageRef:'TT p.27' },
    'loremastery': {      // Loremastery → recognizes VERY-RARE / LEGENDARY + general use (1 turn + throw)
      label:'Loremastery', throw:true, proficiency:'loremastery',
      knownKeys:['general-use'], rarities:['very-rare','legendary'], kinds:null, pageRef:'TT p.27' },
    'magical-engineering': { // Magical Engineering → recognizes COMMON / UNCOMMON / RARE + general use
      label:'Magical Engineering', throw:true, proficiency:'magical-engineering',
      knownKeys:['general-use'], rarities:['common','uncommon','rare'], kinds:null, pageRef:'TT p.27' },
    'magic-research': {   // Magic Research (caster level ≥5 OR Loremastery) → FULL ID (the only complete method)
      label:'Magic Research', throw:true, proficiency:null, full:true,
      knownKeys:FULL_ID_KEYS, rarities:null, kinds:null, pageRef:'TT p.27' }
  });
  function magicItemIdMethods(){ return Object.keys(ID_METHODS); }

  function _itemRarityOf(campaign, ni){
    const intr = ni.intrinsic || {};
    if(intr.rarity) return intr.rarity;
    const bc = _resolveBaseCost(campaign, ni);
    return (bc != null) ? magicItemRarity(bc) : null;
  }
  // Per (item, character) ID-attempt state (the level-up-retry gate). Written defensively into the
  // shipped identification object (no factory edit). { failedAtLevel } per characterId.
  function _idAttempts(ni){
    ni.identification = ni.identification || {};
    if(!ni.identification.idAttempts || typeof ni.identification.idAttempts !== 'object') ni.identification.idAttempts = {};
    return ni.identification.idAttempts;
  }
  function _knownMap(ni){
    ni.identification = ni.identification || {};
    if(!ni.identification.knownProperties || typeof ni.identification.knownProperties !== 'object') ni.identification.knownProperties = {};
    return ni.identification.knownProperties;
  }

  // Resolve an identification attempt WITHOUT rolling — applicability, the gate, the throw params,
  // the success chance. opts: { method, target? }. Returns a forecast/refusal descriptor.
  function magicItemIdentifyResolve(campaign, ni, character, method, opts){
    opts = opts || {};
    const A = _miACKS();
    if(!ni) return { available:false, reason:'no-item' };
    const m = ID_METHODS[method];
    if(!m) return { available:false, reason:'unknown-method' };
    const rarity = _itemRarityOf(campaign, ni);
    const kind = ni.kind;
    // Applicability gates (RAW: each method recognizes only certain rarities/kinds).
    if(m.kinds && kind && m.kinds.indexOf(kind) < 0) return { available:false, reason:'method-not-for-kind', method, rarity, kind };
    if(m.rarities && rarity && m.rarities.indexOf(rarity) < 0) return { available:false, reason:'method-not-for-rarity', method, rarity, kind };
    // Caster-power gate for the full method (caster level ≥5 OR Loremastery — survey §1.4; level is a
    // 🔧 proxy for spellcaster level until Magic Research owns the real check).
    if(method === 'magic-research' && character){
      const ok = _charLevel(character) >= 5 || _profRanks(character, 'loremastery') >= 1;
      if(!ok) return { available:false, reason:'requires-caster-level-5-or-loremastery', method, rarity, kind };
    }
    let proficient = true, ranks = 0, modifiers = [], target = null, chance = null;
    if(m.throw){
      if(m.proficiency){
        ranks = character ? _profRanks(character, m.proficiency) : 0;
        if(ranks < 1) return { available:false, reason:'lacks-proficiency', method, proficiency:m.proficiency, rarity, kind };
        proficient = true;
        if(ranks > 1) modifiers.push({ value: (ranks - 1), label: m.label + ' rank +' + (ranks - 1) });
      }
      // The level-up-retry gate: a failed throw can't retry until the character gains a level (TT 1.4).
      if(character){
        const att = _idAttempts(ni)[character.id];
        if(att && att.failedAtLevel != null && _charLevel(character) <= att.failedAtLevel){
          return { available:false, reason:'must-gain-level', method, failedAtLevel: att.failedAtLevel, currentLevel:_charLevel(character), rarity, kind };
        }
      }
      // Target: RAW says "proficiency throw" without pinning a per-method number — a rarity-scaled
      // ladder (GM-overridable via opts.target). 🔧 tooling default.
      const RARITY_TARGET = { common:7, uncommon:9, rare:11, 'very-rare':14, legendary:16 };
      target = (opts.target != null) ? Number(opts.target) : (RARITY_TARGET[rarity] != null ? RARITY_TARGET[rarity] : 11);
      const modTotal = modifiers.reduce((s,x)=>s+(Number(x.value)||0),0);
      chance = (typeof A.throwSuccessChance === 'function') ? A.throwSuccessChance(target, modTotal, 1, proficient) : null;
    }
    return { available:true, method, label:m.label, throw:!!m.throw, full:!!m.full,
             proficiency:m.proficiency || null, ranks, proficient, modifiers, target,
             successChance: chance, knownKeys: m.knownKeys.slice(), rarity, kind };
  }

  // Which methods are applicable to this item right now (for the UI picker).
  function magicItemIdMethodsFor(campaign, ni, character){
    return magicItemIdMethods().map(method => {
      const r = magicItemIdentifyResolve(campaign, ni, character, method, {});
      return { method, label: ID_METHODS[method].label, available: !!r.available, reason: r.reason || null,
               throw: !!ID_METHODS[method].throw, target: r.target != null ? r.target : null, successChance: r.successChance != null ? r.successChance : null };
    });
  }

  function isItemIdentifiedBy(ni, charId){
    if(!ni || !ni.identification || !ni.identification.knownProperties) return false;
    const k = ni.identification.knownProperties[charId];
    return Array.isArray(k) && k.length > 0;
  }
  function magicItemKnownProperties(ni, charId){
    if(!ni || !ni.identification || !ni.identification.knownProperties) return [];
    const k = ni.identification.knownProperties[charId];
    return Array.isArray(k) ? k.slice() : [];
  }
  function isItemFullyIdentifiedBy(ni, charId){
    const k = magicItemKnownProperties(ni, charId);
    return FULL_ID_KEYS.every(key => k.indexOf(key) >= 0);
  }

  // identifyMagicItem(campaign, opts) — the verb. opts: { itemId, characterId, method, target?, secret?, rng?, submittedBy? }.
  // Dispatches the 5-method gate, rolls (throw methods) on the shipped Layer-1 die, writes the learned
  // property keys to identification.knownProperties[charId] on success, sets the level-up-retry state
  // on failure, emits an item-identified event. Returns { ok, success, method, throw, knownProperties, learned, ... }.
  function identifyMagicItem(campaign, opts){
    opts = opts || {};
    const A = _miACKS();
    if(!campaign) return { ok:false, error:'no-campaign' };
    const ni = _findNotable(campaign, opts.itemId);
    if(!ni) return { ok:false, error:'unknown-item' };
    const character = _findChar(campaign, opts.characterId);
    if(!character) return { ok:false, error:'unknown-character' };
    const method = opts.method || 'equip';
    const r = magicItemIdentifyResolve(campaign, ni, character, method, { target: opts.target });
    if(!r.available) return { ok:false, error: r.reason || 'unavailable', resolve:r };

    const secret = !!opts.secret;
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    let throwResult = null, success = true;
    if(r.throw){
      throwResult = A.rollProficiencyThrow
        ? A.rollProficiencyThrow({ target: r.target, modifiers: r.modifiers, proficient: r.proficient, autoFailBand:1, secret, rng })
        : { success:true, natural:null, total:null, target:r.target };
      success = !!throwResult.success;
    }

    const knownMap = _knownMap(ni);
    let learned = [];
    if(success){
      const prior = Array.isArray(knownMap[character.id]) ? knownMap[character.id] : [];
      const union = prior.slice();
      r.knownKeys.forEach(k => { if(union.indexOf(k) < 0){ union.push(k); learned.push(k); } });
      // A cursed item identified by the full method (or equip, which triggers curses) reveals the curse.
      if(ni.intrinsic && ni.intrinsic.cursed && (r.full || method === 'equip') && union.indexOf('curse') < 0){ union.push('curse'); learned.push('curse'); }
      knownMap[character.id] = union;
      // Clear any prior failed-attempt block on success.
      const att = _idAttempts(ni); if(att[character.id]) delete att[character.id];
    } else {
      // Failure → the level-up-retry block (throw methods only).
      _idAttempts(ni)[character.id] = { failedAtLevel: _charLevel(character), method };
    }

    const payload = {
      itemId: ni.id, characterId: character.id, method,
      rarity: r.rarity, full: !!r.full, success,
      knownProperties: success ? knownMap[character.id].slice() : magicItemKnownProperties(ni, character.id),
      learned,
      throw: throwResult ? { natural: throwResult.natural, total: throwResult.total, target: throwResult.target, success, secret } : null,
      narrative: _identifyNarrative(ni, character, method, success, throwResult, secret)
    };
    const ev = _emitMagicItemEvent(campaign, 'item-identified', payload, { character, item: ni, submittedBy: opts.submittedBy });
    return { ok:true, success, method, throw: throwResult, knownProperties: payload.knownProperties, learned, full: !!r.full, event: ev };
  }
  function _identifyNarrative(ni, character, method, success, t, secret){
    const who = (character && character.name) || 'A character';
    const name = ni.name || (ni.kind || 'the item');
    const m = ID_METHODS[method];
    const via = m ? (' via ' + m.label) : '';
    if(success) return who + ' identifies ' + name + via + '.';
    return who + ' fails to identify ' + name + via +
      (t && t.total != null && !secret ? (' (' + t.total + ' vs ' + t.target + '+)') : '') + ' — no retry until they gain a level.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Use / charges — deplete an item's charges; depleted → non-magical (TT 1.4 "Using").
  // ═══════════════════════════════════════════════════════════════════════════

  // Current charges: intrinsic.charges if set, else the catalog default (an item created elsewhere may
  // not carry charges yet). Returns null for a non-charged (permanent) item.
  function magicItemCharges(campaign, ni){
    if(!ni) return null;
    const intr = ni.intrinsic || {};
    if(typeof intr.charges === 'number') return intr.charges;
    if(ni.baseCatalogKey){ const e = findMagicItemCatalog(ni.baseCatalogKey); if(e && e.charges != null) return e.charges; }
    return null;
  }
  function magicItemIsCharged(campaign, ni){ return magicItemCharges(campaign, ni) != null; }
  function magicItemIsDepleted(ni){ return !!(ni && ni.intrinsic && ni.intrinsic.depleted); }

  // useMagicItemCharge(campaign, opts) — the verb. opts: { itemId, characterId?, count?, submittedBy? }.
  // Deplete intrinsic.charges by count (default 1); at 0, the item becomes non-magical
  // (intrinsic.depleted=true; most charged items can't be recharged — RAW). Emits item-charge-spent.
  // Returns { ok, chargesBefore, chargesAfter, depleted, event } or { ok:false, error }.
  function useMagicItemCharge(campaign, opts){
    opts = opts || {};
    if(!campaign) return { ok:false, error:'no-campaign' };
    const ni = _findNotable(campaign, opts.itemId);
    if(!ni) return { ok:false, error:'unknown-item' };
    if(magicItemIsDepleted(ni)) return { ok:false, error:'already-depleted' };
    const before = magicItemCharges(campaign, ni);
    if(before == null) return { ok:false, error:'not-charged' };
    const count = Math.max(1, Math.round(Number(opts.count) || 1));
    if(before <= 0) return { ok:false, error:'no-charges-left' };
    const spent = Math.min(count, before);
    const after = before - spent;
    ni.intrinsic = ni.intrinsic || {};
    ni.intrinsic.charges = after;
    const depleted = after <= 0;
    if(depleted) ni.intrinsic.depleted = true;
    const character = _findChar(campaign, opts.characterId);
    const payload = {
      itemId: ni.id, characterId: character ? character.id : null,
      count: spent, chargesBefore: before, chargesAfter: after, depleted,
      narrative: _chargeNarrative(ni, character, spent, after, depleted)
    };
    const ev = _emitMagicItemEvent(campaign, 'item-charge-spent', payload, { character, item: ni, submittedBy: opts.submittedBy });
    return { ok:true, chargesBefore: before, chargesAfter: after, spent, depleted, event: ev };
  }
  function _chargeNarrative(ni, character, spent, after, depleted){
    const who = (character && character.name) || 'The party';
    const name = ni.name || (ni.kind || 'the item');
    const s = who + ' expends ' + spent + ' charge' + (spent === 1 ? '' : 's') + ' of ' + name + ' (' + after + ' left)';
    return depleted ? (s + ' — depleted; it is now non-magical.') : (s + '.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Record-only event emit (the §528 context envelope; the marketBuy / sage-consultation precedent —
  // pushed directly, the audit handler keeps it well-formed on replay).
  // ═══════════════════════════════════════════════════════════════════════════
  function _emitMagicItemEvent(campaign, kind, payload, ctx){
    ctx = ctx || {};
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    const A = _miACKS();
    const turn = campaign.currentTurn || 1;
    const day  = campaign.currentDayInMonth || 1;
    const ch = ctx.character || null;
    const hex = (ch && ch.currentHexId) || null;
    const related = [];
    if(ch) related.push({ kind:'character', id: ch.id, role: (kind === 'item-charge-spent' ? 'subject' : 'subject') });
    if(ctx.item) related.push({ kind:'notableItem', id: ctx.item.id, role:'target' });
    const context = {
      primaryHexId: hex,
      involvedHexIds: hex ? [hex] : [],
      settlementId: payload.settlementId || null,
      domainId: null,
      relatedEntities: related
    };
    let ev;
    if(typeof A.newEvent === 'function' && typeof A.isEventKindKnown === 'function' && A.isEventKindKnown(kind)){
      ev = A.newEvent(kind, { submittedBy: ctx.submittedBy || 'gm', status:'applied',
        cadence:'monthly-turn', targetTurn: turn, context, payload });
    } else {
      ev = { id:'evt-mi-' + ((campaign.eventLog.length || 0) + 1), kind, status:'applied',
        submittedBy: ctx.submittedBy || 'gm', context, payload };
    }
    ev.appliedAtTurn = turn; ev.appliedAtDay = day;   // day-stamped (consistent with the sage / market precedent)
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: payload.narrative || kind },
      appliedAtTurn: turn, appliedAtDay: day, appliedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : '') });
    return ev;
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    // catalog + reference
    MAGIC_ITEM_CATALOG, RARITY_TIERS, ARMS_ARMOR_BASE_COST, PRICE_MULTIPLIER, ID_METHODS,
    magicItemCatalog, findMagicItemCatalog, magicItemCatalogKeys, genericMagicItem,
    magicItemRarity, magicItemRarityLabel: rarityLabel, armsArmorBaseCost,
    // minting / promotion
    createNotableFromCatalog, promoteLineFromCatalog,
    // pricing / appraisal
    magicItemBaseCost, magicItemApparentValue, magicItemXpValue, magicItemIsCreated,
    magicItemPriceSpread, magicItemPrice, appraiseMagicItem,
    // identification
    magicItemIdMethods, magicItemIdMethodsFor, magicItemIdentifyResolve, identifyMagicItem,
    isItemIdentifiedBy, isItemFullyIdentifiedBy, magicItemKnownProperties,
    // use / charges
    magicItemCharges, magicItemIsCharged, magicItemIsDepleted, useMagicItemCharge
  });

})(typeof window !== 'undefined' ? window : global);
