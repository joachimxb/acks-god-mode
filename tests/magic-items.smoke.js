'use strict';
/* tests/magic-items.smoke.js — Magic Items #143 W1 (acks-engine-magic-items.js).
 *
 * The magic-item ECONOMY over the shipped `magical` facet + Notable Items: the catalog + rarity tiers
 * + the TT p.28 price spread + the 5-method identification (gated, level-up-retry) + charge depletion
 * + appraisal. Covers the engine verbs end-to-end (the UI is browser-verified separately).
 *
 * Run: node tests/magic-items.smoke.js   (or via npm test — the glob runner auto-discovers it; the
 * module auto-loads via _engine.js's extra-module append, so no _engine.js / package.json edit).
 */
const { load } = require('./_engine.js');
const ACKS = load();

let passed = 0, failed = 0;
function ok(label, cond, extra){ if(cond){ passed++; } else { failed++; console.error('  FAIL: ' + label + (extra ? ' — ' + extra : '')); } }
function section(s){ console.log('\n# ' + s); }
function mkCampaign(extra){
  return Object.assign({ currentTurn: 3, currentDayInMonth: 2, characters: [], notableItems: [], eventLog: [] }, extra || {});
}
function mkChar(o){ return Object.assign({ id:'chr-x', name:'X', level:6, currentHexId:'hex-1', proficiencies:[] }, o || {}); }
const RNG_NAT20 = () => 0.99;   // → natural 20 (auto-success when proficient)
const RNG_NAT1  = () => 0.0;    // → natural 1  (auto-fail)

// ── 1. Catalog + rarity + the arms ladder + generic-by-base-cost ─────────────────────────────────
section('Catalog + rarity tiers + arms/armor ladder');
ok('magicItemCatalog returns the curated core', Array.isArray(ACKS.magicItemCatalog()) && ACKS.magicItemCatalog().length >= 12);
ok('every catalog entry is frozen + carries the mechanical fields + a pageRef', ACKS.magicItemCatalog().every(e =>
  Object.isFrozen(e) && typeof e.key === 'string' && typeof e.name === 'string' && typeof e.kind === 'string' &&
  typeof e.baseCost === 'number' && typeof e.rarity === 'string' && typeof e.pageRef === 'string' && e.pageRef.length > 0));
ok('findMagicItemCatalog resolves a key', ACKS.findMagicItemCatalog('weapon-plus-2').baseCost === 15000);
ok('findMagicItemCatalog(bad) → null', ACKS.findMagicItemCatalog('nope') === null);
// rarity tiers (TT p.20): common ≤1000, uncommon ≤5000, rare ≤25000, very-rare ≤100000, legendary >100000
ok('rarity 1000 = common',     ACKS.magicItemRarity(1000) === 'common');
ok('rarity 1001 = uncommon',   ACKS.magicItemRarity(1001) === 'uncommon');
ok('rarity 5000 = uncommon',   ACKS.magicItemRarity(5000) === 'uncommon');
ok('rarity 25000 = rare',      ACKS.magicItemRarity(25000) === 'rare');
ok('rarity 25001 = very-rare', ACKS.magicItemRarity(25001) === 'very-rare');
ok('rarity 100000 = very-rare',ACKS.magicItemRarity(100000) === 'very-rare');
ok('rarity 100001 = legendary',ACKS.magicItemRarity(100001) === 'legendary');
// arms & armor +N base cost ladder (TT p.51)
ok('arms +1 = 5000',    ACKS.armsArmorBaseCost('+1') === 5000);
ok('arms +1/+2 = 10000',ACKS.armsArmorBaseCost('+1/+2') === 10000);
ok('arms +2 = 15000',   ACKS.armsArmorBaseCost('+2') === 15000);
ok('arms +3 = 35000',   ACKS.armsArmorBaseCost('+3') === 35000);
ok('arms bare "2" → 15000 (tolerant)', ACKS.armsArmorBaseCost('2') === 15000);
ok('arms unknown spec → null', ACKS.armsArmorBaseCost('+9') === null);
// genericMagicItem — the generic-by-base-cost path
const gen = ACKS.genericMagicItem({ name:'Boots', baseCost:8000, kind:'misc-magic' });
ok('genericMagicItem derives rarity from base cost', gen.rarity === 'rare' && gen.baseCost === 8000 && gen.name === 'Boots');
ok('catalog spans every rarity tier', ['common','uncommon','rare','very-rare','legendary'].every(t => ACKS.magicItemCatalog().some(e => e.rarity === t)));
ok('catalog has a charged item + a cursed item', ACKS.magicItemCatalog().some(e => e.charges != null) && ACKS.magicItemCatalog().some(e => e.cursed));

// ── 2. The TT p.28 price spread (the load-bearing fact) ──────────────────────────────────────────
section('Price spread (TT p.28: commission ×3 / buy ×2.25 / sell-created ×2 / sell-found ×1)');
{
  const camp = mkCampaign();
  const ni = ACKS.createNotableFromCatalog(camp, 'weapon-plus-2'); // base 15000, rare
  const s = ACKS.magicItemPriceSpread(camp, ni);
  ok('spread base cost', s.baseCost === 15000);
  ok('spread rarity', s.rarity === 'rare');
  ok('commission ×3', s.commission === 45000);
  ok('buy ×2.25', s.buy === 33750);
  ok('sell-created ×2', s.sellCreated === 30000);
  ok('sell-found ×1', s.sellFound === 15000);
  ok('found item defaults to sell-found (×1)', s.created === false && s.sell === 15000);
  ok('magicItemPrice(buy)', ACKS.magicItemPrice(camp, ni, 'buy') === 33750);
  // provenance → created → sells at ×2
  ni.provenance.knownMakeAndAuthenticity = true;
  const s2 = ACKS.magicItemPriceSpread(camp, ni);
  ok('a created (provenanced) item sells at ×2', s2.created === true && s2.sell === 30000);
  ok('magicItemIsCreated reads provenance', ACKS.magicItemIsCreated(ni) === true);
  // spread off a bare catalog key + a bare number
  ok('spread off a catalog key', ACKS.magicItemPriceSpread(camp, 'weapon-plus-3').buy === 35000 * 2.25);
  ok('spread off a number', ACKS.magicItemPriceSpread(camp, 1000).commission === 3000);
  ok('spread with no base cost → unavailable', ACKS.magicItemPriceSpread(camp, {}).available === false);
}

// ── 3. Minting + promotion ───────────────────────────────────────────────────────────────────────
section('createNotableFromCatalog + promoteLineFromCatalog');
{
  const camp = mkCampaign();
  const ni = ACKS.createNotableFromCatalog(camp, 'wand-charged', { makerCharacterId:'chr-maker' });
  ok('minted notableItem pushed to campaign.notableItems', camp.notableItems.length === 1 && camp.notableItems[0] === ni);
  ok('minted kind from catalog', ni.kind === 'wand');
  ok('minted baseCatalogKey set', ni.baseCatalogKey === 'wand-charged');
  ok('minted intrinsic copied (baseCost/charges/rarity)', ni.intrinsic.baseCost === 5000 && ni.intrinsic.charges === 20 && ni.intrinsic.rarity === 'uncommon');
  ok('minted maxCharges recorded', ni.intrinsic.maxCharges === 20);
  ok('maker → provenance created', ni.provenance.makerCharacterId === 'chr-maker' && ni.provenance.knownMakeAndAuthenticity === true);
  ok('createNotableFromCatalog(bad key) → null', ACKS.createNotableFromCatalog(camp, 'nope') === null);
  // generic mint
  const g = ACKS.createNotableFromCatalog(camp, null, { generic:{ name:'Cloak', baseCost:12000, kind:'misc-magic' } });
  ok('generic mint works', g && g.intrinsic.baseCost === 12000 && g.name === 'Cloak');
  // promotion from a carry/stash line
  const line = ACKS.blankStashItem ? ACKS.blankStashItem({ name:'a sword', facets:['gear'] }) : { facets:['gear'], name:'a sword' };
  const promoted = ACKS.promoteLineFromCatalog(camp, line, 'weapon-plus-1');
  ok('promoteLineFromCatalog sets line.notableItemId', !!line.notableItemId && promoted && line.notableItemId === promoted.id);
  ok('promoted line gained the magical facet', line.facets.indexOf('magical') >= 0);
  ok('promoted notable carries the catalog intrinsic', promoted.baseCatalogKey === 'weapon-plus-1' && promoted.intrinsic.enchantmentBonus === 1);
}

// ── 4. Identification — the 5-method gate, level-up-retry, knownProperties, events ────────────────
section('Identification — method gating + throws + level-up-retry');
{
  const camp = mkCampaign();
  const loremaster = mkChar({ id:'chr-lore', name:'Mira', level:8, proficiencies:[{key:'loremastery', ranks:2}] });
  const engineer   = mkChar({ id:'chr-eng',  name:'Cob',  level:6, proficiencies:[{key:'magical-engineering', ranks:1}] });
  const alchemist  = mkChar({ id:'chr-alc',  name:'Vex',  level:4, proficiencies:[{key:'alchemy', ranks:1}] });
  const lowCaster  = mkChar({ id:'chr-low',  name:'Pip',  level:3, proficiencies:[] });
  const highCaster = mkChar({ id:'chr-cast', name:'Sol',  level:7, proficiencies:[] });
  camp.characters = [loremaster, engineer, alchemist, lowCaster, highCaster];

  const legend = ACKS.createNotableFromCatalog(camp, 'wondrous-legendary'); // legendary
  const rareW  = ACKS.createNotableFromCatalog(camp, 'weapon-plus-2');      // rare
  const potion = ACKS.createNotableFromCatalog(camp, 'potion-common');      // potion, common
  const cursed = ACKS.createNotableFromCatalog(camp, 'cursed-weapon-minus-1');

  // RAW rarity gating: loremastery IDs only very-rare/legendary
  ok('loremastery refuses a rare item (method-not-for-rarity)',
    ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:loremaster.id, method:'loremastery', rng:RNG_NAT20 }).error === 'method-not-for-rarity');
  const loreOk = ACKS.identifyMagicItem(camp, { itemId:legend.id, characterId:loremaster.id, method:'loremastery', rng:RNG_NAT20 });
  ok('loremastery IDs a legendary item (general-use)', loreOk.ok && loreOk.success && loreOk.knownProperties.indexOf('general-use') >= 0);
  ok('loremastery is a PARTIAL ID (no charges/command-words)', loreOk.knownProperties.indexOf('charges') < 0 && loreOk.knownProperties.indexOf('command-words') < 0);
  ok('a successful identify emits item-identified', loreOk.event && loreOk.event.kind === 'item-identified');

  // magical-engineering IDs common/uncommon/rare, NOT very-rare/legendary
  ok('magical-engineering refuses a legendary item',
    ACKS.identifyMagicItem(camp, { itemId:legend.id, characterId:engineer.id, method:'magical-engineering', rng:RNG_NAT20 }).error === 'method-not-for-rarity');
  ok('magical-engineering IDs a rare item',
    ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:engineer.id, method:'magical-engineering', rng:RNG_NAT20 }).success === true);

  // a character without the proficiency is refused
  ok('lacks-proficiency refusal', ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:lowCaster.id, method:'magical-engineering' }).error === 'lacks-proficiency');

  // alchemy IDs only potions, and learns the effect
  ok('alchemy refuses a weapon (method-not-for-kind)',
    ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:alchemist.id, method:'alchemy', rng:RNG_NAT20 }).error === 'method-not-for-kind');
  const alcOk = ACKS.identifyMagicItem(camp, { itemId:potion.id, characterId:alchemist.id, method:'alchemy', rng:RNG_NAT20 });
  ok('alchemy IDs a potion + learns the effect', alcOk.success && alcOk.knownProperties.indexOf('effect') >= 0);

  // magic-research = the FULL method; requires caster level ≥5 OR loremastery
  ok('magic-research refused below caster level 5 w/o loremastery',
    ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:lowCaster.id, method:'magic-research', rng:RNG_NAT20 }).error === 'requires-caster-level-5-or-loremastery');
  const fullOk = ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:highCaster.id, method:'magic-research', rng:RNG_NAT20 });
  ok('magic-research is a FULL ID (charges + command-words + properties)', fullOk.full &&
    ['general-use','bonus','charges','command-words','properties'].every(k => fullOk.knownProperties.indexOf(k) >= 0));
  ok('isItemFullyIdentifiedBy true after full ID', ACKS.isItemFullyIdentifiedBy(rareW, highCaster.id) === true);
  ok('isItemIdentifiedBy true / known-properties read', ACKS.isItemIdentifiedBy(rareW, highCaster.id) && ACKS.magicItemKnownProperties(rareW, highCaster.id).length >= 5);

  // a cursed item identified by the full method reveals the curse
  const cursedFull = ACKS.identifyMagicItem(camp, { itemId:cursed.id, characterId:highCaster.id, method:'magic-research', rng:RNG_NAT20 });
  ok('full ID of a cursed item reveals the curse', cursedFull.success && cursedFull.knownProperties.indexOf('curse') >= 0);

  // no-throw method (equip) always learns general-use; no proficiency needed
  const eq = ACKS.identifyMagicItem(camp, { itemId:rareW.id, characterId:lowCaster.id, method:'equip' });
  ok('equip needs no throw + learns general-use', eq.ok && eq.success && eq.knownProperties.indexOf('general-use') >= 0);
}

section('Identification — the level-up-retry gate (TT 1.4)');
{
  const camp = mkCampaign();
  const eng = mkChar({ id:'chr-eng', name:'Cob', level:3, proficiencies:[{key:'magical-engineering', ranks:1}] });
  camp.characters = [eng];
  const item = ACKS.createNotableFromCatalog(camp, 'weapon-plus-1'); // uncommon
  const fail1 = ACKS.identifyMagicItem(camp, { itemId:item.id, characterId:eng.id, method:'magical-engineering', rng:RNG_NAT1 });
  ok('a nat-1 throw fails', fail1.ok && fail1.success === false);
  ok('a failed identify still emits the event (success=false)', fail1.event && fail1.event.kind === 'item-identified' && fail1.event.payload.success === false);
  const blocked = ACKS.identifyMagicItem(camp, { itemId:item.id, characterId:eng.id, method:'magical-engineering', rng:RNG_NAT20 });
  ok('retry blocked until level gain (must-gain-level)', blocked.ok === false && blocked.error === 'must-gain-level');
  // gain a level → retry allowed
  eng.level = 4;
  const retry = ACKS.identifyMagicItem(camp, { itemId:item.id, characterId:eng.id, method:'magical-engineering', rng:RNG_NAT20 });
  ok('after a level gain the retry succeeds', retry.ok && retry.success === true);
  ok('the retry-block is cleared on success', !(item.identification.idAttempts && item.identification.idAttempts[eng.id]));
}

// ── 5. Charges — depletion → non-magical ─────────────────────────────────────────────────────────
section('Use / charges — deplete → non-magical');
{
  const camp = mkCampaign();
  const ch = mkChar({ id:'chr-u', name:'User' }); camp.characters = [ch];
  const wand = ACKS.createNotableFromCatalog(camp, 'wand-charged'); // 20 charges
  ok('magicItemCharges reads intrinsic', ACKS.magicItemCharges(camp, wand) === 20);
  ok('magicItemIsCharged true', ACKS.magicItemIsCharged(camp, wand) === true);
  const u1 = ACKS.useMagicItemCharge(camp, { itemId:wand.id, characterId:ch.id, count:5 });
  ok('spend 5 → 15 left', u1.ok && u1.chargesBefore === 20 && u1.chargesAfter === 15 && u1.depleted === false);
  ok('charge use emits item-charge-spent', u1.event && u1.event.kind === 'item-charge-spent');
  const u2 = ACKS.useMagicItemCharge(camp, { itemId:wand.id, count:100 }); // over-spend clamps + depletes
  ok('over-spend clamps + depletes', u2.ok && u2.chargesAfter === 0 && u2.depleted === true && u2.spent === 15);
  ok('depleted item flagged non-magical', ACKS.magicItemIsDepleted(wand) === true && wand.intrinsic.charges === 0);
  ok('using a depleted item refused', ACKS.useMagicItemCharge(camp, { itemId:wand.id }).error === 'already-depleted');
  // a permanent (non-charged) item refuses
  const ring = ACKS.createNotableFromCatalog(camp, 'ring-permanent');
  ok('non-charged item refuses (not-charged)', ACKS.useMagicItemCharge(camp, { itemId:ring.id }).error === 'not-charged');
}

// ── 6. Appraisal ─────────────────────────────────────────────────────────────────────────────────
section('Appraisal');
{
  const camp = mkCampaign();
  const ch = mkChar({ id:'chr-a', name:'Appraiser' }); camp.characters = [ch];
  const ni = ACKS.createNotableFromCatalog(camp, 'staff-charged'); // base 20000, rare
  const ap = ACKS.appraiseMagicItem(camp, { itemId:ni.id, characterId:ch.id });
  ok('appraise ok', ap.ok && ap.spread.available);
  ok('appraise reports rarity + the spread', ap.spread.rarity === 'rare' && ap.spread.buy === 45000 && ap.spread.sellFound === 20000);
  ok('appraise emits item-appraised', ap.event && ap.event.kind === 'item-appraised');
  ok('appraise payload carries the prices', ap.event.payload.priceBuy === 45000 && ap.event.payload.priceSellFound === 20000 && ap.event.payload.apparentValue === 20000);
  ok('appraise(bad item) → error', ACKS.appraiseMagicItem(camp, { itemId:'nope' }).error === 'unknown-item');
  // XP value = apparent value (TT 1.4)
  ok('magicItemXpValue = apparent value', ACKS.magicItemXpValue(camp, ni) === 20000);
}

// ── 7. Event registration + the replay handler + no-collision ────────────────────────────────────
section('Event registration + replay + no collision');
{
  ['item-identified','item-charge-spent','item-appraised'].forEach(k => {
    ok(k + ' is a known kind', ACKS.isEventKindKnown(k) === true);
    ok(k + ' has a schema', ACKS.EVENT_SCHEMAS && !!ACKS.EVENT_SCHEMAS[k]);
  });
  // the shipped kinds still exist (no collision / clobber)
  ['magic-item-created','item-transfer'].forEach(k => ok('shipped kind ' + k + ' intact', ACKS.isEventKindKnown(k) === true));
  // my kinds are NOT the shipped ones
  ok('item-identified ≠ magic-item-created', 'item-identified' !== 'magic-item-created');
  // the replay handler keeps an emitted event well-formed
  const camp = mkCampaign();
  const ch = mkChar({ id:'chr-r', name:'R', proficiencies:[{key:'loremastery', ranks:1}] }); camp.characters = [ch];
  const ni = ACKS.createNotableFromCatalog(camp, 'wondrous-legendary');
  const r = ACKS.identifyMagicItem(camp, { itemId:ni.id, characterId:ch.id, method:'loremastery', rng:RNG_NAT20 });
  const replay = ACKS.applyEvent(camp, r.event);
  ok('replay handler returns a narrativeSummary', replay && replay.result && typeof replay.result.narrativeSummary === 'string' && replay.result.narrativeSummary.length > 0);
  // my events are wizard-opt-out (verb-owned, not raw-emittable)
  ok('item-identified is wizard-opt-out', ACKS.wizardEmittableKinds && ACKS.wizardEmittableKinds().indexOf('item-identified') < 0);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// W2 — COMMISSIONING (the Command exemplar; routes into Magic Research) + MI-5 TRAITS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// A campaign with a paying commissioner + an eligible arcane caster. The full engine (incl. magic-research
// + economy/GP-Wave-B) is loaded by _engine.js, so the routing + wealth-transfer run for real.
function mkCommission(patronGp){
  const camp = mkCampaign({ researchProjects:[], itemCustody:[], houseRules:{} });
  const patron = { id:'chr-patron', name:'Lord Aelric', level:5, coins:{ pp:0, gp:(patronGp!=null?patronGp:50000), ep:0, sp:0, cp:0 }, personalGp:(patronGp!=null?patronGp:50000), currentHexId:'hex-1' };
  const mage   = { id:'chr-mage', name:'Quintus', level:9, isArcaneCaster:true, coins:{ pp:0, gp:0, ep:0, sp:0, cp:0 }, personalGp:0, abilities:{ INT:16 }, proficiencies:[], currentHexId:'hex-1' };
  camp.characters = [patron, mage];
  return { camp, patron, mage };
}

// ── 8. Commission costs + preview (TT p.28: 3× base = material 1× + component 1× up front + research 1×) ──
section('Commission — costs + preview (TT p.28)');
{
  // arms/armor +N is EXACT (the +N ladder matches RR's ITEM_BONUS_COST): +1 base 5000 → 3× = 15000.
  const c1 = ACKS.commissionCosts({ effectType:'permanent-bonus', enchantBonus:1 });
  ok('commissionCosts base = research item-creation cost', c1.baseCost === 5000);
  ok('up-front = material 1× + component 1× = 2× base', c1.upFrontGp === 10000);
  ok('research fee 1× = base', c1.researchFeeGp === 5000);
  ok('commission price = 3× base', c1.commissionPriceGp === 15000);
  const c2 = ACKS.commissionCosts({ effectType:'permanent-bonus', enchantBonus:3 });
  ok('a +3 weapon commission = 3× 35000 = 105000', c2.baseCost === 35000 && c2.commissionPriceGp === 105000);

  const { camp } = mkCommission();
  const pre = ACKS.commissionPreview(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  ok('preview ok (eligible + affords)', pre.ok === true);
  ok('preview costs', pre.costs.commissionPriceGp === 15000 && pre.costs.upFrontGp === 10000);
  ok('preview eligibility passes for an arcane L9 caster', pre.eligibility.ok === true);
  ok('preview reports affordability', pre.affordsUpFront === true && pre.available === 50000);
  ok('preview reports the throw target + chance', typeof pre.throwTarget === 'number' && typeof pre.successChance === 'number' && pre.successChance > 0);
  // preview refusals (pure — no mutation)
  const poor = mkCommission(100);
  ok('preview flags insufficient funds', poor.camp && ACKS.commissionPreview(poor.camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' }).reason === 'insufficient-funds');
  const lowCamp = mkCommission(); lowCamp.mage.level = 3;
  ok('preview flags an ineligible (too-low) caster', ACKS.commissionPreview(lowCamp.camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' }).reason === 'level-too-low');
}

// ── 9. Commission issue — the GP Wave B up-front + the routed research project ──────────────────────
section('Commission — issue (routes into Magic Research; commissioner pays up front)');
{
  const { camp, patron, mage } = mkCommission();
  const iss = ACKS.commissionMagicItem(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  ok('issue ok', iss.ok === true);
  ok('routes into a Magic Research item-creation project', iss.project && iss.project.kind === 'item-creation' && iss.project.researcherCharacterId === 'chr-mage');
  ok('the project carries a commission rider', iss.project.commission && iss.project.commission.status === 'commissioned');
  ok('lives in campaign.researchProjects (no new collection/prefix)', Array.isArray(camp.researchProjects) && camp.researchProjects.indexOf(iss.project) >= 0 && /^rsp-/.test(iss.project.id));
  // the GP accounting: commissioner pays the up-front 2× (material → caster funds the engine debit; component → external)
  ok('commissioner pays the up-front 2× (50000 → 40000)', patron.coins.gp === 40000);
  ok('the caster is a funded pass-through (net 0)', mage.coins.gp === 0);
  ok('emits magic-item-commissioned', camp.eventLog.some(e => e.event.kind === 'magic-item-commissioned'));
  ok('the commission event carries the price breakdown', (() => { const e = camp.eventLog.find(e => e.event.kind === 'magic-item-commissioned'); return e && e.event.payload.commissionPriceGp === 15000 && e.event.payload.upFrontGp === 10000 && e.event.payload.casterCharacterId === 'chr-mage'; })());
  // refusals are ATOMIC — no gp moves on a rejected issue
  const r2 = mkCommission(100);
  const broke = ACKS.commissionMagicItem(r2.camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  ok('insufficient funds → refused atomically (no gp moved, no events)', broke.ok === false && broke.error === 'insufficient-funds' && r2.patron.coins.gp === 100 && r2.camp.eventLog.length === 0);
  const r3 = mkCommission(); r3.mage.level = 3;
  ok('ineligible caster → refused (gp untouched)', ACKS.commissionMagicItem(r3.camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' }).error === 'caster-level-too-low' && r3.patron.coins.gp === 50000);
  ok('self-commission refused', ACKS.commissionMagicItem(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-patron', catalogKey:'weapon-plus-1' }).error === 'commissioner-cannot-be-the-caster');
  ok('unknown commissioner/caster refused', ACKS.commissionMagicItem(camp, { commissionerCharacterId:'nope', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' }).error === 'unknown-commissioner');
}

// ── 10. Commission resolve — success (item delivered, fee paid, custody re-homed) ───────────────────
section('Commission — resolve success (TT p.28 fee on success; maker provenance; custody to commissioner)');
{
  const { camp, patron, mage } = mkCommission();
  const iss = ACKS.commissionMagicItem(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  // research must be complete — expedite the GM-fiat way (else advance turns); RNG_NAT20 → success.
  const res = ACKS.resolveCommission(camp, iss.project.id, { expedite:true, rng:RNG_NAT20 });
  ok('resolve ok + success', res.ok === true && res.success === true);
  ok('the item is minted', camp.notableItems.length === 1 && res.notableItemId && res.item);
  ok('maker provenance = the caster (sells ×2 as a created item)', res.item.provenance && res.item.provenance.makerCharacterId === 'chr-mage');
  ok('custody re-homed to the commissioner', (camp.itemCustody.find(c => c.itemId === res.notableItemId) || {}).custodianId === 'chr-patron');
  ok('the research fee 1× paid on success (patron 40000 → 35000 = 3× total)', patron.coins.gp === 35000 && res.feePaid === true);
  ok('the caster keeps the fee (their professional pay)', mage.coins.gp === 5000);
  ok('commission marked completed', iss.project.commission.status === 'completed' && iss.project.commission.notableItemId === res.notableItemId);
  ok('emits magic-item-commission-resolved (success)', camp.eventLog.some(e => e.event.kind === 'magic-item-commission-resolved' && e.event.payload.success === true));
  ok('cannot resolve twice', ACKS.resolveCommission(camp, iss.project.id, { rng:RNG_NAT20 }).error === 'already-resolved');
  // a custom itemConfig commission (not a catalog key) — drives the base off the research engine's cost
  const c2 = mkCommission();
  const iss2 = ACKS.commissionMagicItem(c2.camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', itemConfig:{ effectType:'one-use', spellLevel:2, itemKind:'potion', targetName:'Potion of Flight' }, expedite:true });
  ok('a custom-config commission (one-use L2, base 1000)', iss2.ok && iss2.costs.baseCost === 1000 && iss2.costs.commissionPriceGp === 3000);
  const res2 = ACKS.resolveCommission(c2.camp, iss2.project.id, { rng:RNG_NAT20 });
  ok('custom-config commission delivers a potion', res2.success && c2.camp.notableItems.length === 1 && c2.camp.notableItems[0].kind === 'potion');
}

// ── 11. Commission resolve — failure (up-front lost, no item, no fee) ───────────────────────────────
section('Commission — resolve failure (RR p.388 total loss of the up-front)');
{
  const { camp, patron, mage } = mkCommission();
  const iss = ACKS.commissionMagicItem(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  const res = ACKS.resolveCommission(camp, iss.project.id, { expedite:true, rng:RNG_NAT1 });
  ok('resolve ok but the throw failed', res.ok === true && res.success === false);
  ok('no item delivered', camp.notableItems.length === 0 && !res.notableItemId);
  ok('the up-front 2× is lost (patron stays at 40000 — no fee, no refund)', patron.coins.gp === 40000 && res.lostGp === 10000);
  ok('the caster gets no fee on failure', mage.coins.gp === 0);
  ok('commission marked failed', iss.project.commission.status === 'failed');
  ok('emits magic-item-commission-resolved (failure)', camp.eventLog.some(e => e.event.kind === 'magic-item-commission-resolved' && e.event.payload.success === false && e.event.payload.lostGp === 10000));
  // resolving an incomplete (un-expedited, un-accrued) commission is refused
  const c2 = mkCommission();
  const i2 = ACKS.commissionMagicItem(c2.camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  ok('resolve refuses an incomplete commission', ACKS.resolveCommission(c2.camp, i2.project.id, { rng:RNG_NAT20 }).error === 'research-incomplete');
  ok('resolve(non-commission project) refused', ACKS.resolveCommission(c2.camp, 'nope').error === 'not-a-commission');
}

// ── 12. Commission lookups + status ─────────────────────────────────────────────────────────────────
section('Commission — lookups + derived status');
{
  const { camp } = mkCommission();
  const iss = ACKS.commissionMagicItem(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-2' });
  ok('isCommission', ACKS.isCommission(iss.project) === true);
  ok('commissionProjects + activeCommissions', ACKS.commissionProjects(camp).length === 1 && ACKS.activeCommissions(camp).length === 1);
  ok('commissionsFor finds both parties', ACKS.commissionsFor(camp, 'chr-patron').length === 1 && ACKS.commissionsFor(camp, 'chr-mage').length === 1);
  const st = ACKS.commissionStatus(camp, iss.project);
  ok('commissionStatus reports the price + the rollable gate', st && st.commissionPriceGp === 45000 && st.status === 'commissioned' && st.rollable === false);
  ACKS.resolveCommission(camp, iss.project.id, { expedite:true, rng:RNG_NAT20 });
  ok('after delivery, activeCommissions drops to 0', ACKS.activeCommissions(camp).length === 0);
}

// ── 13. MI-5 — Magic Item Traits (the optional content pack; default OFF) ──────────────────────────
section('Magic Item Traits — the magic-item-traits house rule (default OFF)');
{
  ok('traits catalog ships archetypes + a page-ref (IP-safe, no prose)', ACKS.magicItemTraitsCatalog().length >= 10 && ACKS.magicItemTraitsCatalog().every(t => Object.isFrozen(t) && t.key && t.name && t.category && t.pageRef && t.note));
  ok('traits span categories', ['sensory','behavioral','boon','bane','sentience'].every(cat => Object.keys(ACKS.magicItemTraitsByCategory()).indexOf(cat) >= 0));
  ok('findMagicItemTrait resolves a key', ACKS.findMagicItemTrait('glimmering').name === 'Glimmering' && ACKS.findMagicItemTrait('nope') === null);

  const camp = mkCampaign();
  const ni = ACKS.createNotableFromCatalog(camp, 'ring-permanent');
  // gate OFF (default) — assignment refused + hidden
  ok('traits disabled by default', ACKS.magicItemTraitsEnabled(camp) === false);
  ok('assign refused when the rule is OFF', ACKS.assignMagicItemTrait(camp, { itemId:ni.id, traitKey:'glimmering' }).error === 'house-rule-off');
  ok('no trait written when OFF', ACKS.magicItemTraits(ni).length === 0);
  // gate ON
  camp.houseRules = { 'magic-item-traits': { enabled:true } };
  ok('traits enabled by the house rule', ACKS.magicItemTraitsEnabled(camp) === true);
  const a = ACKS.assignMagicItemTrait(camp, { itemId:ni.id, traitKey:'glimmering', gmNote:'shimmers blue' });
  ok('assign ok + written to intrinsic.traits[]', a.ok && ACKS.magicItemTraits(ni).length === 1 && ACKS.itemHasTrait(ni, 'glimmering'));
  ok('the trait carries its archetype + the gmNote', ni.intrinsic.traits[0].name === 'Glimmering' && ni.intrinsic.traits[0].gmNote === 'shimmers blue' && ni.intrinsic.traits[0].pageRef === 'JJ p.172');
  ok('an item-history line is stamped', Array.isArray(ni.history) && ni.history.some(h => h.type === 'trait-assigned'));
  ok('duplicate trait refused', ACKS.assignMagicItemTrait(camp, { itemId:ni.id, traitKey:'glimmering' }).error === 'already-has-trait');
  const rolled = ACKS.rollMagicItemTrait(camp, { itemId:ni.id, rng:() => 0.5 });
  ok('rollMagicItemTrait assigns a random (different) trait', rolled.ok && ACKS.magicItemTraits(ni).length === 2);
  ok('removeMagicItemTrait removes one', ACKS.removeMagicItemTrait(camp, { itemId:ni.id, traitKey:'glimmering' }).ok && ACKS.magicItemTraits(ni).length === 1);
  // NO new event kind for traits (benign GM authoring — the only W2 kinds are the 2 commission kinds)
  ok('trait assignment emits NO event', camp.eventLog.length === 0);
}

// ── 14. W2 event registration + replay + no-collision ───────────────────────────────────────────────
section('W2 event registration + replay + wizard-opt-out');
{
  ['magic-item-commissioned','magic-item-commission-resolved'].forEach(k => {
    ok(k + ' is a known kind', ACKS.isEventKindKnown(k) === true);
    ok(k + ' has a schema', ACKS.EVENT_SCHEMAS && !!ACKS.EVENT_SCHEMAS[k]);
    ok(k + ' is wizard-opt-out (verb-owned)', ACKS.wizardEmittableKinds && ACKS.wizardEmittableKinds().indexOf(k) < 0);
  });
  // no collision with the shipped magic-item kinds
  ['magic-item-created','item-transfer','item-identified'].forEach(k => ok('shipped/W1 kind ' + k + ' intact', ACKS.isEventKindKnown(k) === true));
  // the record-only replay handler keeps a commission event well-formed
  const { camp } = mkCommission();
  const iss = ACKS.commissionMagicItem(camp, { commissionerCharacterId:'chr-patron', casterCharacterId:'chr-mage', catalogKey:'weapon-plus-1' });
  const ev = camp.eventLog.find(e => e.event.kind === 'magic-item-commissioned').event;
  const replay = ACKS.applyEvent(camp, ev);
  ok('replay handler returns a narrativeSummary', replay && replay.result && typeof replay.result.narrativeSummary === 'string' && replay.result.narrativeSummary.length > 0);
}

// ── summary ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('magic-items.smoke: ' + passed + ' passed, ' + failed + ' failed');
console.log('=============================================');
process.exit(failed ? 1 : 0);
