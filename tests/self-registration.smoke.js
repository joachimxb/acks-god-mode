/* tests/self-registration.smoke.js — the self-registration kernel (CLAUDE §15.5 north star).
 *
 *   node tests/self-registration.smoke.js   (or via `npm test`)
 *
 * The central append-target lists are being converted, one family at a time, from hardcoded
 * literals into accumulating stores a module extends from its own file at load (the proven
 * registerDayConsumer pattern). Slice 1 = ID prefixes: ID_PREFIXES is now a mutable store seeded
 * with the legacy set, extended via ACKS.registerPrefix(kind, prefix). This suite (a) pins the
 * seeded contract — a typo'd or dropped seed value fails here — and (b) proves the registerPrefix
 * API end-to-end against the live engine (dedup, conflict-reject, guards, newId composition).
 */
'use strict';
const ACKS = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n— ' + t); }

// The canonical 65-prefix contract (node-captured from main @ 8023191 — the pre-refactor frozen
// literal). The conversion must be byte-identical: every kind keeps its exact prefix. Update this
// map deliberately, alongside Data_Dictionary §1, when a NEW entity adds a prefix.
const EXPECTED = {
  apprenticeship:'apr', army:'army', attunement:'att', bankAccount:'bnk', battle:'btl', bout:'bot',
  campaign:'cmp', character:'chr', congregation:'con', constructible:'cst', customClass:'ccl',
  customRace:'crc', deity:'dei', delve:'dlv', divineFavor:'dfv', domain:'dom', dungeon:'dun',
  encounter:'enc', event:'evt', faction:'fac', favorDutyObligation:'fdo', game:'gam',
  garrisonUnit:'gar', gladiatorSchool:'gld', group:'grp', henchmanship:'hen', hex:'hex',
  hijink:'hij', hirelingContract:'hir', itemCustody:'cus', journey:'jrn', knowledge:'knw',
  lair:'lai', landImprovementProject:'lip', letterOfCredit:'loc', loan:'lon', lore:'lor',
  magistracy:'mag', notableItem:'itm', oath:'oth', outpost:'out', party:'prt',
  passiveInvestment:'inv', pointOfInterest:'poi', project:'prj', recruitmentDrive:'rcd',
  researchProject:'rsp', rumor:'rum', sageCommission:'sag', senate:'sen', senatorship:'snr',
  settlement:'set', settlementVisit:'svt', siege:'sie', specialist:'spe', specialistContract:'spc',
  stash:'stash', stashItem:'si', strongholdStructure:'str', syndicate:'syn',
  tributaryAgreement:'trb', unit:'unit', vassalage:'vas', venture:'vnt', vessel:'vsl'
};

// =============================================================================
section('the seeded prefix map is byte-identical to the pre-refactor frozen literal');
const live = ACKS.ID_PREFIXES;
const expKeys = Object.keys(EXPECTED).sort();
const liveKeys = Object.keys(live).sort();
ok('exactly 65 prefixes seeded', liveKeys.length === 65, 'live ' + liveKeys.length);
ok('same kind set as before', JSON.stringify(liveKeys) === JSON.stringify(expKeys),
  'missing [' + expKeys.filter(k => !(k in live)).join(',') + '] / extra [' + liveKeys.filter(k => !(k in EXPECTED)).join(',') + ']');
const valueMismatch = expKeys.filter(k => live[k] !== EXPECTED[k]);
ok('every kind keeps its exact prefix', valueMismatch.length === 0,
  valueMismatch.map(k => k + ': "' + live[k] + '" != "' + EXPECTED[k] + '"').join(', '));

// =============================================================================
section('registerPrefix — the kernel (the registerDayConsumer pattern, generalized)');
ok('exported as a function', typeof ACKS.registerPrefix === 'function');
ok('the store is mutable (no longer Object.freeze-d)', !Object.isFrozen(ACKS.ID_PREFIXES));

// a module registering a fresh entity's prefix from its own file at load
ACKS.registerPrefix('__smokeKind', 'smk');
ok('a fresh registration lands in the store', ACKS.ID_PREFIXES.__smokeKind === 'smk');
ok('and is visible via the shared namespace (the Proxy-read path other modules use)',
  global.ACKS.ID_PREFIXES.__smokeKind === 'smk');

// idempotent: same kind + same prefix is a no-op
ACKS.registerPrefix('__smokeKind', 'smk');
ok('re-registering the same prefix is idempotent', ACKS.ID_PREFIXES.__smokeKind === 'smk');

// conflict: same kind + a different prefix keeps the original (and warns)
ACKS.registerPrefix('__smokeKind', 'zzz');
ok('a conflicting prefix for a registered kind is rejected (keeps the original)', ACKS.ID_PREFIXES.__smokeKind === 'smk');

// guards: missing/falsy args are safe no-ops, never throw
ok('registerPrefix() with no args is a safe no-op', (function(){ try { ACKS.registerPrefix(); return true; } catch(e){ return false; } })());
ok('registerPrefix(kind, "") does not register', (function(){ ACKS.registerPrefix('__noPrefix', ''); return !('__noPrefix' in ACKS.ID_PREFIXES); })());

// newId composes with a self-registered prefix (the end-to-end id-minting path)
const id = ACKS.newId(ACKS.ID_PREFIXES.__smokeKind);
ok('newId mints ids from a self-registered prefix', id.indexOf('smk-') === 0 && id.length > 4, id);

// tidy the store (suites run in isolated processes, but keep it clean)
delete ACKS.ID_PREFIXES.__smokeKind;

// =============================================================================
// SLICE 2 — the campaign-collection registry (registerCollection).
// =============================================================================
// The three sites that listed the top-level campaign collections — blankCampaign() (seed),
// migrateCampaign/lazyDefaultV1ScopeReservations (load-time backfill), and the importer's
// SIMPLE_ID_COLLECTIONS — now DERIVE from a single accumulating store. The three EXPECTED sets
// below ARE the truth table (a collection's {seedInBlank, lazyDefault, importable} flags = its
// membership in each set), node-captured from main @ 8023191 before the refactor. Update these
// deliberately, alongside Data_Dictionary §1, when a new collection registers. A typo'd or dropped
// seed flag fails here.
const sortedEq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

// seedInBlank:true (43) — blankCampaign() seeds these as empty arrays.
const EXP_SEEDED = [
  'domains','characters','parties','ventures','passiveInvestments','deities','banks','loans','hexes',
  'settlements','rumors','stashes','henchmanships','specialistContracts','hirelingContracts','magistracies',
  'vassalages','tributaryAgreements','favorDutyObligations','notableItems','itemCustody','groups','journeys',
  'outposts','dungeons','congregations','divineFavors','attunements','settlementVisits','oaths',
  'vagaryOfIncursionEvents','projects','constructibles','lairs','hijinks','syndicates','researchProjects',
  'apprenticeships','bankAccounts','lettersOfCredit','lore','knowledge','sageCommissions'
];
// lazyDefault:true (19) — migrateCampaign backfills these on load (the eager set).
const EXP_LAZY = [
  'favorDutyObligations','journeys','outposts','dungeons','congregations','divineFavors','attunements',
  'settlementVisits','oaths','vagaryOfIncursionEvents','projects','constructibles','lairs','researchProjects',
  'apprenticeships','encounters','units','armies','battles'
];
// importable:true (55) — the Import-Domain walker copies these (all but the special-cased domains/hexes
// and the legacy-reserved banks). Byte-identical to the pre-refactor SIMPLE_ID_COLLECTIONS membership.
const EXP_IMPORTABLE = [
  'characters','parties','settlements','rumors','stashes','ventures','passiveInvestments','henchmanships',
  'specialistContracts','hirelingContracts','magistracies','vassalages','tributaryAgreements','notableItems',
  'itemCustody','groups','journeys','outposts','dungeons','deities','congregations','divineFavors','attunements',
  'settlementVisits','oaths','vagaryOfIncursionEvents','projects','constructibles','favorDutyObligations','lairs',
  'encounters','hijinks','syndicates','units','armies','battles','sieges','vessels','delves','senates','factions',
  'senatorships','bouts','gladiatorSchools','games','customClasses','customRaces','researchProjects',
  'apprenticeships','loans','bankAccounts','lettersOfCredit','lore','knowledge','sageCommissions'
];

section('the collection registry reproduces the pre-refactor three-site truth table');
ok('exactly 58 collections registered', ACKS.registeredCollections().length === 58, 'got ' + ACKS.registeredCollections().length);
ok('seededCollections() === the seed set (43)', sortedEq(ACKS.seededCollections(), EXP_SEEDED), 'got ' + ACKS.seededCollections().length);
ok('lazyDefaultCollections() === the migrate-injected set (19)', sortedEq(ACKS.lazyDefaultCollections(), EXP_LAZY), 'got ' + ACKS.lazyDefaultCollections().length);
ok('importableCollections() === the pre-refactor SIMPLE_ID_COLLECTIONS membership (55)', sortedEq(ACKS.importableCollections(), EXP_IMPORTABLE), 'got ' + ACKS.importableCollections().length);
ok('lazyDefault ⟹ importable (a load-injected collection always travels on import)',
  ACKS.lazyDefaultCollections().every(n => ACKS.importableCollections().includes(n)));
ok('domains/hexes/banks are NOT importable (special-cased / legacy-reserved)',
  !ACKS.importableCollections().includes('domains') && !ACKS.importableCollections().includes('hexes') && !ACKS.importableCollections().includes('banks'));
ok('encounters/units/armies/battles are migrate-injected but NOT seeded (the F/T/T anomaly preserved)',
  ['encounters','units','armies','battles'].every(n => ACKS.lazyDefaultCollections().includes(n) && !ACKS.seededCollections().includes(n)));

section('the three sites DERIVE from the registry (the actual behaviour, not just the flags)');
// blankCampaign() seeds exactly seededCollections() (and nothing else id-collection-wise).
const fresh = ACKS.blankCampaign({ name: 'reg-test' });
const freshArrayKeys = Object.keys(fresh).filter(k => Array.isArray(fresh[k]) && k !== 'pendingEvents' && k !== 'eventLog');
ok('blankCampaign() collection set === seededCollections()', sortedEq(freshArrayKeys, ACKS.seededCollections()));
ok('blankCampaign() still carries the event arrays explicitly', Array.isArray(fresh.pendingEvents) && Array.isArray(fresh.eventLog));
ok('opts.<name> still overrides the seed default', ACKS.blankCampaign({ characters: [{ id: 'chr-x' }] }).characters.length === 1);
// migrateCampaign on a bare campaign object injects exactly the lazyDefault collections and no
// other array (a fresh bare object has no other collections to lift) — so its array keys ARE the
// lazy set. This proves the lazyDefaultV1ScopeReservations loop is registry-driven end-to-end.
const bare = ACKS.migrateCampaign({ schemaVersion: 2, kind: 'campaign', id: 'cmp-reg', name: 'bare' });
const injected = Object.keys(bare).filter(k => Array.isArray(bare[k]));
ok('migrateCampaign(bare) injects exactly the lazyDefault set', sortedEq(injected, ACKS.lazyDefaultCollections()),
  'injected [' + injected.slice().sort().join(',') + ']');

section('registerCollection — the kernel (defensive-read default, the Joachim 2026-06-20 call)');
ok('exported as a function', typeof ACKS.registerCollection === 'function');
// a NEW collection with no flags → defensive-read: seeded + importable, NOT migrate-injected.
ACKS.registerCollection('__smokeColl');
ok('a fresh registration lands in registeredCollections()', ACKS.registeredCollections().some(c => c.name === '__smokeColl'));
ok('default seedInBlank:true', ACKS.seededCollections().includes('__smokeColl'));
ok('default importable:true', ACKS.importableCollections().includes('__smokeColl'));
ok('default lazyDefault:false (DEFENSIVE-READ — not migrate-injected)', !ACKS.lazyDefaultCollections().includes('__smokeColl'));
ok('blankCampaign() picks up the freshly-registered collection (the DRY win)', Array.isArray(ACKS.blankCampaign({}).__smokeColl));
// {lazyDefault:true} opt-in
ACKS.registerCollection('__smokeLazy', { lazyDefault: true });
ok('{lazyDefault:true} opts into migrate-injection', ACKS.lazyDefaultCollections().includes('__smokeLazy'));
ok('a {lazyDefault:true} collection is backfilled by migrateCampaign',
  Array.isArray(ACKS.migrateCampaign({ schemaVersion: 2, kind: 'campaign', id: 'cmp-l', name: 'l' }).__smokeLazy));
// {seedInBlank:false} / {importable:false} opt-outs
ACKS.registerCollection('__smokeImpOnly', { seedInBlank: false });
ok('{seedInBlank:false} stays out of blankCampaign()', !ACKS.seededCollections().includes('__smokeImpOnly') && !Array.isArray(ACKS.blankCampaign({}).__smokeImpOnly));
ACKS.registerCollection('__smokePrivate', { importable: false });
ok('{importable:false} stays out of the importer set', !ACKS.importableCollections().includes('__smokePrivate'));
// idempotent: same flags = no-op
const cnt = ACKS.registeredCollections().length;
ACKS.registerCollection('__smokeColl');
ok('re-registering with identical flags is idempotent (count unchanged)', ACKS.registeredCollections().length === cnt);
// conflict: differing flags keep the original (and warn)
ACKS.registerCollection('__smokeColl', { lazyDefault: true });
ok('a conflicting re-register keeps the original flags', !ACKS.lazyDefaultCollections().includes('__smokeColl'));
// guards: missing/blank name is a safe no-op
ok('registerCollection() with no name is a safe no-op', (function(){ try { const n = ACKS.registeredCollections().length; ACKS.registerCollection(); return ACKS.registeredCollections().length === n; } catch(e){ return false; } })());

// =============================================================================
// SLICE 3 — the house-rule registry (registerHouseRule + registerHouseRuleCategory).
// =============================================================================
// HOUSERULES_REGISTRY + HOUSERULE_CATEGORIES were frozen literals every rule-shipping subsystem
// had to edit (the dominant burst-session conflict surface). They are now accumulating stores a
// module extends from its own file via ACKS.registerHouseRule / ACKS.registerHouseRuleCategory.
// The kernel lives in catalogs.js (the data's home, which loads first), not acks-engine.js. House
// rules are PURE reference data — a campaign stores only toggled overrides, so this is the safe
// (prefix-like) posture with NO data-layer fork. The id + category + default sets below ARE the
// truth table (node-captured from the pre-refactor frozen literal). A dropped/typo'd/flipped seed
// fails here; the default set is behaviour-critical (isHouseRuleEnabled falls back to it).
const EXP_HR_IDS = [
  "alternative-farming-methods", "auran-calendar", "auto-pause-on-encounter", "auto-pause-on-navigation-fail", "auto-pause-on-overbudget", "auto-pause-on-supplies-low",
  "auto-resolve-trivial-throws", "beastman-domains", "crew-hijinks", "custom-power-compendium", "demographics-auto-generate", "detailed-hijink-tracking",
  "domain-morale-banditry", "dwarven-civilization", "dwarven-mining", "dwarven-mining-despoliation", "dwarven-mining-discovery", "dwarven-mining-non-dwarven",
  "dwarven-mining-salt", "dwarven-mining-vagaries", "elite-troops", "elven-civilization", "experimental-mushroom-farming", "families-per-hex-tracking",
  "favor-duty-auto-roll", "gladiator-games", "gm-fiat-proficiency-throws", "gm-set-weather", "hidden-stashes", "ignore-encumbrance",
  "ignore-rations", "journey-batching-routine", "journey-fast-travel", "knowledge-tracking", "living-census", "living-expenses",
  "magic-item-traits", "markets-black-market", "markets-entryways", "markets-load-metered-activity", "markets-magic-wizard", "markets-notability",
  "markets-regulated-assets", "markets-transaction-threshold", "monster-pursuit", "monthly-commit-subsumes-in-flight", "notable-items-tracking", "party-loot-split",
  "persistent-hireling-candidates", "persistent-hireling-resurfacing", "persistent-wandering-monsters", "random-merchandise-rolling", "recruitment-notability", "rule-of-the-few",
  "rumors-auto-emit", "rumors-manual", "rumors-proliferation", "seasonal-trade-modifiers", "senate-auto-vote", "separating-land-and-lordship",
  "simplified-fatigue", "slavery", "stronghold-by-buildings", "syndicate-auto-tribute", "vagaries-of-battle", "vagaries-of-incursion",
  "vagaries-of-recruitment", "vagaries-of-war"
];
const EXP_HR_CATS = ['domain','construction','mercantile','characters','world','encounters','military','rumors','knowledge','hijinks','cultural'];
// The 7 default:true rules — the behaviour-critical set (isHouseRuleEnabled returns true for these
// when a campaign hasn't toggled them). A wrong/missing default here silently flips every campaign.
const EXP_HR_DEFAULTS = ['domain-morale-banditry','favor-duty-auto-roll','living-expenses','monster-pursuit','persistent-wandering-monsters','senate-auto-vote','syndicate-auto-tribute'];

section('the seeded house-rule + category registry is byte-identical to the pre-refactor frozen literals');
const hrIds = ACKS.HOUSERULES_REGISTRY.map(r => r.id);
ok('exactly 68 house rules seeded', hrIds.length === 68, 'got ' + hrIds.length);
ok('no duplicate rule ids', new Set(hrIds).size === hrIds.length);
ok('same rule-id set as before', sortedEq(hrIds, EXP_HR_IDS),
  'missing [' + EXP_HR_IDS.filter(k => !hrIds.includes(k)).join(',') + '] / extra [' + hrIds.filter(k => !EXP_HR_IDS.includes(k)).join(',') + ']');
ok('exactly 11 categories seeded', ACKS.HOUSERULE_CATEGORIES.length === 11, 'got ' + ACKS.HOUSERULE_CATEGORIES.length);
ok('same category-id set as before', sortedEq(ACKS.HOUSERULE_CATEGORIES.map(c => c.id), EXP_HR_CATS));
const liveDefaults = ACKS.HOUSERULES_REGISTRY.filter(r => r.default === true).map(r => r.id);
ok('the 7 default:true rules are exactly preserved', sortedEq(liveDefaults, EXP_HR_DEFAULTS),
  'got [' + liveDefaults.slice().sort().join(',') + ']');
ok('every rule names a registered category', hrIds.every(() => true) &&
  ACKS.HOUSERULES_REGISTRY.every(r => EXP_HR_CATS.includes(r.category)),
  ACKS.HOUSERULES_REGISTRY.filter(r => !EXP_HR_CATS.includes(r.category)).map(r => r.id + ':' + r.category).join(', '));

section('registerHouseRule / registerHouseRuleCategory — the kernel');
ok('registerHouseRule exported', typeof ACKS.registerHouseRule === 'function');
ok('registerHouseRuleCategory exported', typeof ACKS.registerHouseRuleCategory === 'function');
ok('registeredHouseRules / houseRuleCategories accessors exported', typeof ACKS.registeredHouseRules === 'function' && typeof ACKS.houseRuleCategories === 'function');
ok('the rule store is mutable (no longer Object.freeze-d)', !Object.isFrozen(ACKS.HOUSERULES_REGISTRY));
ok('the category store is mutable', !Object.isFrozen(ACKS.HOUSERULE_CATEGORIES));

// a module self-registering a fresh rule from its own file at load (default:true to also exercise the fallback)
ACKS.registerHouseRule({ id:'__smoke-rule', category:'world', name:'Smoke rule', source:'test', default:true, description:'x' });
ok('a fresh rule lands in the registry', ACKS.HOUSERULES_REGISTRY.some(r => r.id === '__smoke-rule'));
ok('lookupHouseRule finds the self-registered rule', (ACKS.lookupHouseRule('__smoke-rule') || {}).category === 'world');
ok('isHouseRuleEnabled honours a self-registered default:true (the fallback path)',
  ACKS.isHouseRuleEnabled({ houseRules: {} }, '__smoke-rule') === true);
ok('an explicit {enabled:false} still beats the default', ACKS.isHouseRuleEnabled({ houseRules: { '__smoke-rule': { enabled:false } } }, '__smoke-rule') === false);
// idempotent: same id + identical content is a silent no-op (no duplicate)
const hrCnt = ACKS.HOUSERULES_REGISTRY.length;
ACKS.registerHouseRule({ id:'__smoke-rule', category:'world', name:'Smoke rule', source:'test', default:true, description:'x' });
ok('re-registering identical content is idempotent (count unchanged)', ACKS.HOUSERULES_REGISTRY.length === hrCnt);
// conflict: same id + different content keeps the original
ACKS.registerHouseRule({ id:'__smoke-rule', category:'cultural', name:'CHANGED', source:'test', description:'y' });
ok('a conflicting re-register keeps the original (id stays the original content)', (ACKS.lookupHouseRule('__smoke-rule') || {}).name === 'Smoke rule');
ok('a conflicting re-register does not duplicate', ACKS.HOUSERULES_REGISTRY.filter(r => r.id === '__smoke-rule').length === 1);
// guards
ok('registerHouseRule() with no arg is a safe no-op', (function(){ try { const n = ACKS.HOUSERULES_REGISTRY.length; ACKS.registerHouseRule(); return ACKS.HOUSERULES_REGISTRY.length === n; } catch(e){ return false; } })());
ok('registerHouseRule({}) (no id) does not register', (function(){ const n = ACKS.HOUSERULES_REGISTRY.length; ACKS.registerHouseRule({ category:'world' }); return ACKS.HOUSERULES_REGISTRY.length === n; })());

// a module self-registering a fresh category
ACKS.registerHouseRuleCategory({ id:'__smoke-cat', label:'🔬 Smoke', description:'test category' });
ok('a fresh category lands + is visible to houseRuleCategories()', ACKS.houseRuleCategories().some(c => c.id === '__smoke-cat'));
ACKS.registerHouseRuleCategory({ id:'__smoke-cat', label:'CHANGED', description:'z' });
ok('a conflicting category re-register keeps the original', (ACKS.HOUSERULE_CATEGORIES.find(c => c.id === '__smoke-cat') || {}).label === '🔬 Smoke');
ok('registerHouseRuleCategory() with no arg is a safe no-op', (function(){ try { const n = ACKS.HOUSERULE_CATEGORIES.length; ACKS.registerHouseRuleCategory(); return ACKS.HOUSERULE_CATEGORIES.length === n; } catch(e){ return false; } })());

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — self-registration.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
