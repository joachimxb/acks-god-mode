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

// ── summary ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('magic-items.smoke: ' + passed + ' passed, ' + failed + ' failed');
console.log('=============================================');
process.exit(failed ? 1 : 0);
