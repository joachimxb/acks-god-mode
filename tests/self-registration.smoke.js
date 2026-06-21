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
  tributaryAgreement:'trb', unit:'unit', vassalage:'vas', venture:'vnt', vessel:'vsl',
  confinement:'cnf', dynasty:'dyn', kinship:'kin'
};

// =============================================================================
section('the seeded prefix map is byte-identical to the pre-refactor frozen literal');
const live = ACKS.ID_PREFIXES;
const expKeys = Object.keys(EXPECTED).sort();
const liveKeys = Object.keys(live).sort();
ok('exactly 68 prefixes seeded', liveKeys.length === 68, 'live ' + liveKeys.length);
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
  'apprenticeships','bankAccounts','lettersOfCredit','lore','knowledge','sageCommissions',
  'dynasties','kinships','confinements'
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
  'apprenticeships','loans','bankAccounts','lettersOfCredit','lore','knowledge','sageCommissions',
  'dynasties','kinships','confinements'
];

section('the collection registry reproduces the pre-refactor three-site truth table');
ok('exactly 61 collections registered', ACKS.registeredCollections().length === 61, 'got ' + ACKS.registeredCollections().length);
ok('seededCollections() === the seed set (46)', sortedEq(ACKS.seededCollections(), EXP_SEEDED), 'got ' + ACKS.seededCollections().length);
ok('lazyDefaultCollections() === the migrate-injected set (19)', sortedEq(ACKS.lazyDefaultCollections(), EXP_LAZY), 'got ' + ACKS.lazyDefaultCollections().length);
ok('importableCollections() === the pre-refactor SIMPLE_ID_COLLECTIONS membership + burst12 (58)', sortedEq(ACKS.importableCollections(), EXP_IMPORTABLE), 'got ' + ACKS.importableCollections().length);
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
  "vagaries-of-recruitment", "vagaries-of-war", "dynasty-tracking",
  "construction-vagaries", "crude-construction-weather"   // Phase 4 Construction Wave I (2026-06-21)
];
const EXP_HR_CATS = ['domain','construction','mercantile','characters','world','encounters','military','rumors','knowledge','hijinks','cultural'];
// The 7 default:true rules — the behaviour-critical set (isHouseRuleEnabled returns true for these
// when a campaign hasn't toggled them). A wrong/missing default here silently flips every campaign.
const EXP_HR_DEFAULTS = ['domain-morale-banditry','favor-duty-auto-roll','living-expenses','monster-pursuit','persistent-wandering-monsters','senate-auto-vote','syndicate-auto-tribute'];

section('the seeded house-rule + category registry is byte-identical to the pre-refactor frozen literals');
const hrIds = ACKS.HOUSERULES_REGISTRY.map(r => r.id);
ok('exactly 71 house rules seeded', hrIds.length === 71, 'got ' + hrIds.length);
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
// SLICE 4 — the load-migration registry (registerLoadMigration).
// =============================================================================
// migrateCampaign()'s per-load pass list — the idempotent normalize / backfill / lift / reconcile
// passes that run on EVERY load (distinct from the versioned MIGRATIONS schema-bump array) — is now
// an accumulating, ORDER-CARRYING store a module extends from its own file via
// ACKS.registerLoadMigration(name, fn, {order}). Unlike the prefix / collection / house-rule
// families (SETS), the passes are an ORDERED PIPELINE, so each carries an explicit `order` and the
// runner sorts by (order, registration-seq). The 19-pass contract below is node-captured from the
// pre-refactor inline block (orders 10..190). A dropped / added / reordered pass fails here.
const EXP_LOAD_MIGRATIONS = [
  [10,'drop-legacy-log'],[20,'reconcile-rural-population'],[30,'strip-unused-mining'],
  [40,'remove-tribute-pct'],[50,'character-classification'],[60,'character-proficiencies'],
  [70,'character-coins'],[80,'wave-a-relations'],[90,'domain-treasuries'],[100,'stash-item-shapes'],
  [110,'reconcile-stashes'],[120,'reconcile-treasury-scalars'],[130,'lazy-default-v1-reservations'],
  [140,'legacy-hex-lairs'],[150,'garrison-units-to-units'],[155,'strip-unit-mirror'],[160,'agricultural-to-projects'],
  [170,'stronghold-to-constructibles'],[180,'reconcile-party-membership'],[190,'sync-party-camp-stashes']
];

section('the seeded load-migration pipeline (T6: + strip-unit-mirror @155)');
const lm = ACKS.registeredLoadMigrations();
ok('exactly 20 passes seeded', lm.length === 20, 'got ' + lm.length);
ok('passes in the exact order with the exact order numbers',
  JSON.stringify(lm.map(p => [p.order, p.name])) === JSON.stringify(EXP_LOAD_MIGRATIONS),
  'got ' + JSON.stringify(lm.map(p => [p.order, p.name])));
ok('every pass has a function', lm.every(p => typeof p.fn === 'function'));
ok('registeredLoadMigrations() returns a fresh array (mutating it cannot corrupt the store)',
  (function(){ const a = ACKS.registeredLoadMigrations(); a.push({}); return ACKS.registeredLoadMigrations().length === 20; })());

section('registerLoadMigration — the kernel (explicit-order pipeline)');
ok('registerLoadMigration exported', typeof ACKS.registerLoadMigration === 'function');
ok('runLoadMigrations exported', typeof ACKS.runLoadMigrations === 'function');

// a module self-registering a pass from its own file at load, with an order that slots between two
// seeded passes — proving order placement AND that the pass actually RUNS via runLoadMigrations.
ACKS.registerLoadMigration('__smoke-pass-a', function(c){ c.__a = true; }, { order: 55 });
ACKS.registerLoadMigration('__smoke-pass-z', function(c){ c.__lastPass = 'z'; }, { order: 1e6 });
const lm2 = ACKS.registeredLoadMigrations();
ok('a fresh pass lands at its order slot (55 sits between classification@50 and proficiencies@60)',
  lm2.findIndex(p => p.name === '__smoke-pass-a') === lm2.findIndex(p => p.name === 'character-classification') + 1);
ok('an order-1e6 pass sorts to the very end', lm2[lm2.length - 1].name === '__smoke-pass-z');
// the runner executes them in order, in place
const lmProbe = { schemaVersion: 2, kind: 'campaign', id: 'cmp-lm', name: 'lm' };
ACKS.runLoadMigrations(lmProbe);
ok('runLoadMigrations fires a self-registered pass', lmProbe.__a === true && lmProbe.__lastPass === 'z');
ok('migrateCampaign runs the registered passes (the freshly-registered one fired)',
  ACKS.migrateCampaign({ schemaVersion:2, kind:'campaign', id:'cmp-lm2', name:'lm2' }).__lastPass === 'z');

// a pass with no explicit order defaults toward the end (order 1000)
ACKS.registerLoadMigration('__smoke-pass-default', function(){});
ok('a pass with no order defaults to order 1000',
  (ACKS.registeredLoadMigrations().find(p => p.name === '__smoke-pass-default') || {}).order === 1000);

// idempotent: same name + same fn = silent no-op
const lmFnX = function(){};
ACKS.registerLoadMigration('__smoke-pass-idem', lmFnX, { order: 42 });
const cntLM = ACKS.registeredLoadMigrations().length;
ACKS.registerLoadMigration('__smoke-pass-idem', lmFnX, { order: 42 });
ok('re-registering the same name + fn is idempotent (count unchanged)', ACKS.registeredLoadMigrations().length === cntLM);
// conflict: same name + a DIFFERENT fn keeps the original (warns) and never reorders
ACKS.registerLoadMigration('__smoke-pass-idem', function(c){ c.__clobbered = true; }, { order: 99 });
const lmIdem = ACKS.registeredLoadMigrations().find(p => p.name === '__smoke-pass-idem');
ok('a conflicting re-register keeps the original fn', lmIdem.fn === lmFnX);
ok('a conflicting re-register keeps the original order (no silent reorder)', lmIdem.order === 42);
// guards: missing args are safe no-ops, never throw
ok('registerLoadMigration() with no args is a safe no-op', (function(){ try { const n = ACKS.registeredLoadMigrations().length; ACKS.registerLoadMigration(); return ACKS.registeredLoadMigrations().length === n; } catch(e){ return false; } })());
ok('registerLoadMigration(name) with no fn does not register', (function(){ const n = ACKS.registeredLoadMigrations().length; ACKS.registerLoadMigration('__noFn'); return ACKS.registeredLoadMigrations().length === n; })());

// =============================================================================
// SLICE 5 — the typed-event-kind registry (registerEventKind). THE LAST FAMILY.
// =============================================================================
// EVENT_KINDS / EVENT_SCHEMAS / EVENT_WIZARD_OPTOUT were three frozen literals in acks-engine-events.js
// that every event-shipping subsystem had to edit (with the already-decentralized EVENT_HANDLERS, the
// "4 parallel registries" — the BIGGEST team-session merge-conflict surface, "the Lead unions the
// events.js registries by hand", §15.4). They are now accumulating stores a module extends from its
// own file via ACKS.registerEventKind('foo', { schema, wizardOptOut, handler }) (the unified one-call
// entry; the handler forwards to the existing registerEventHandler). The kernel lives in events.js
// (where the data is). Unlike the prior families this is NOT pinned as the full set: event kinds are a
// large, fast-growing APPEND-set (~10 per burst, 171 today), so a full ordered literal here would churn
// + merge-conflict on every event-adding branch — re-creating the surface this slice removes. The
// exact ORDER+content byte-identity of the conversion is proven by the one-shot node diff vs the
// pre-slice-5 baseline (SUMMARY); the ongoing exact-membership guards are drift-lint's count + the
// schema generator + schema.smoke. Here we pin the COUNTS + the structural invariants (1:1 kinds↔schemas,
// optout ⊆ kinds, no dups) + representatives, and exercise the kernel API end-to-end.
const EV_KINDS_COUNT = 185, EV_SCHEMAS_COUNT = 185, EV_OPTOUT_COUNT = 159;
const EV_REPRESENTATIVES = ['player-plan','gm-fiat','treasury-grant','recruit-hireling','loyalty-check',
  'construction-completed','follower-arrival','journey-day-tick','survival-day','favor-duty',
  'domain-banditry','proficiency-throw','domain-advanced','bout-round',
  'dynasty-founded','captive-ransomed','urban-incident-escalated','vessel-launched','vessel-repaired'];

section('the seeded event-kind registries reproduce the pre-refactor frozen-literal counts + invariants');
const evKinds = ACKS.EVENT_KINDS, evSchemas = ACKS.EVENT_SCHEMAS, evOptout = ACKS.EVENT_WIZARD_OPTOUT;
const evKindSet = new Set(evKinds);
ok('exactly ' + EV_KINDS_COUNT + ' event kinds seeded', evKinds.length === EV_KINDS_COUNT, 'got ' + evKinds.length);
ok('no duplicate event kinds', evKindSet.size === evKinds.length);
ok('exactly ' + EV_SCHEMAS_COUNT + ' schemas seeded (1:1 with kinds)', Object.keys(evSchemas).length === EV_SCHEMAS_COUNT, 'got ' + Object.keys(evSchemas).length);
ok('every schema key is a registered kind', Object.keys(evSchemas).every(k => evKindSet.has(k)),
  Object.keys(evSchemas).filter(k => !evKindSet.has(k)).join(', '));
ok('every kind has a schema (the 1:1 invariant)', evKinds.every(k => k in evSchemas),
  evKinds.filter(k => !(k in evSchemas)).join(', '));
ok('exactly ' + EV_OPTOUT_COUNT + ' wizard opt-outs seeded', evOptout.size === EV_OPTOUT_COUNT, 'got ' + evOptout.size);
ok('every opt-out is a registered kind', [...evOptout].every(k => evKindSet.has(k)),
  [...evOptout].filter(k => !evKindSet.has(k)).join(', '));
ok('representative kinds all present (catches a catastrophic seed failure)', EV_REPRESENTATIVES.every(k => evKindSet.has(k)),
  EV_REPRESENTATIVES.filter(k => !evKindSet.has(k)).join(', '));
ok('player-plan is first, vessel-repaired is last (append order preserved)', evKinds[0] === 'player-plan' && evKinds[evKinds.length - 1] === 'vessel-repaired');

section('registerEventKind — the kernel (the last self-registration family)');
ok('registerEventKind exported', typeof ACKS.registerEventKind === 'function');
ok('registeredEventKinds exported', typeof ACKS.registeredEventKinds === 'function');
ok('the kind store is mutable (no longer Object.freeze-d)', !Object.isFrozen(ACKS.EVENT_KINDS));
ok('the schema store is mutable', !Object.isFrozen(ACKS.EVENT_SCHEMAS));

// a module self-registering a fresh kind from its own file at load — the unified one-call entry
// (kind string + schema + wizard opt-out + handler), the §15.5 ergonomic.
let evDispatched = false;
ACKS.registerEventKind('__smoke-evt', {
  schema: { R: { x: 'string' }, O: {} },
  wizardOptOut: true,
  handler: function(c, e){ evDispatched = true; return { result: { narrativeSummary: 'ok' } }; }
});
ok('a fresh kind lands in EVENT_KINDS', ACKS.EVENT_KINDS.includes('__smoke-evt'));
ok('its schema lands in EVENT_SCHEMAS', !!ACKS.EVENT_SCHEMAS['__smoke-evt']);
ok('its wizard opt-out lands in EVENT_WIZARD_OPTOUT', ACKS.EVENT_WIZARD_OPTOUT.has('__smoke-evt'));
ok('isEventKindKnown sees it', ACKS.isEventKindKnown('__smoke-evt'));
ok('wizardEmittableKinds hides it (opted out)', !ACKS.wizardEmittableKinds().includes('__smoke-evt'));
ok('and is visible via the shared namespace (the read path other modules + index.html use)',
  global.ACKS.EVENT_KINDS.includes('__smoke-evt'));
// the new capability: the handler forwards to registerEventHandler + applyEvent dispatches it
ACKS.applyEvent(ACKS.blankCampaign({ name: 't' }), ACKS.newEvent('__smoke-evt', { submittedBy: 'gm', payload: { x: 'y' } }));
ok('the handler forwarded via registerEventKind fires through applyEvent', evDispatched);
// validateEvent enforces the self-registered schema (proves registerEventSchema is live end-to-end)
ok('validateEvent enforces the self-registered schema', (function(){
  try { ACKS.applyEvent(ACKS.blankCampaign({ name: 't' }), ACKS.newEvent('__smoke-evt', { submittedBy: 'gm', payload: {} })); return false; }
  catch(e){ return /missing required payload field "x"/.test(e.message); }
})());
// registeredEventKinds returns a fresh array (mutating it cannot corrupt the store)
ok('registeredEventKinds() returns a fresh array', (function(){ const a = ACKS.registeredEventKinds(); const n = a.length; a.push('zz'); return ACKS.registeredEventKinds().length === n; })());

// idempotent: re-registering the same kind does not re-push
const evCnt = ACKS.EVENT_KINDS.length;
ACKS.registerEventKind('__smoke-evt');
ok('re-registering the same kind is idempotent (no re-push)', ACKS.EVENT_KINDS.length === evCnt);
// schema conflict: a different schema for a registered kind keeps the original (and warns)
ACKS.registerEventKind('__smoke-evt', { schema: { R: { DIFFERENT: 'string' }, O: {} } });
ok('a conflicting schema keeps the original', JSON.stringify(ACKS.EVENT_SCHEMAS['__smoke-evt'].R) === JSON.stringify({ x: 'string' }));
// a bare kind (no opts) registers only the string — no schema
ACKS.registerEventKind('__smoke-bare');
ok('a bare registerEventKind(kind) registers only the string', ACKS.EVENT_KINDS.includes('__smoke-bare') && !('__smoke-bare' in ACKS.EVENT_SCHEMAS));
// guards: missing/falsy args are safe no-ops, never throw
ok('registerEventKind() with no args is a safe no-op', (function(){ try { const n = ACKS.EVENT_KINDS.length; ACKS.registerEventKind(); ACKS.registerEventKind(''); return ACKS.EVENT_KINDS.length === n; } catch(e){ return false; } })());

// =============================================================================
// SLICE 6 — the entity registry + field-schemas (registerEntityKind + registerFieldSchema).
// =============================================================================
// ENTITY_KINDS_LIST (+ the ENTITY_KINDS index) in acks-engine-entity-registry.js and FIELD_SCHEMAS
// in acks-engine-field-schemas.js were the two remaining central append-targets named in Architecture
// §9.4's intro — hardcoded literals every entity-adding subsystem edited (with the five converted
// families, the full §9.4 core-lists merge surface). They are now accumulating stores a module extends
// from its own file via ACKS.registerEntityKind(entry) / ACKS.registerFieldSchema(kind, schema). Each
// kernel lives where its data is (entity-registry.js / field-schemas.js), seeded byte-identical at the
// literal site. The exact order+content byte-identity of the conversion is proven by the one-shot node
// diff vs the pre-slice-6 baseline (SUMMARY); the ongoing exact-membership guards are drift-lint's
// entity-kind count + the global schema⊆factory invariant in tests/smoke.js. Here we pin the COUNTS +
// the structural invariants (no dups, 1:1 list↔index, schema-keys ⊆ entity-kinds) + representatives,
// and exercise both registrars end-to-end.
const ENTITY_KINDS_COUNT = 58, FIELD_SCHEMAS_COUNT = 42;
const ENTITY_REPRESENTATIVES = ['character','party','group','hex','domain','unit','army','lair','encounter',
  'dungeon','senate','custom-class','garrison-unit','stronghold-component','lore','dynasty','confinement'];
const SCHEMA_REPRESENTATIVES = ['outpost','stash','magistracy','unit','army','journey','group','dungeon',
  'senate','loan','lore','dynasty','confinement'];

section('the seeded entity registry reproduces the pre-refactor frozen-literal counts + invariants');
const ekList = ACKS.ENTITY_KINDS_LIST, ekIndex = ACKS.ENTITY_KINDS;
const ekKinds = ekList.map(e => e.kind), ekSet = new Set(ekKinds);
ok('exactly ' + ENTITY_KINDS_COUNT + ' entity kinds seeded', ekList.length === ENTITY_KINDS_COUNT, 'got ' + ekList.length);
ok('no duplicate entity kinds', ekSet.size === ekKinds.length);
ok('the ENTITY_KINDS index has the same key set as the list (the 1:1 invariant)',
  sortedEq(Object.keys(ekIndex), ekKinds), 'index ' + Object.keys(ekIndex).length + ' vs list ' + ekKinds.length);
ok('every list entry is indexed to itself', ekList.every(e => ekIndex[e.kind] === e));
ok('representative kinds all present (catches a catastrophic seed failure)', ENTITY_REPRESENTATIVES.every(k => ekSet.has(k)),
  ENTITY_REPRESENTATIVES.filter(k => !ekSet.has(k)).join(', '));
ok('character is first, confinement is last (append order preserved)', ekKinds[0] === 'character' && ekKinds[ekKinds.length - 1] === 'confinement');

section('the seeded field-schemas reproduce the pre-refactor frozen-literal count + the schema⊆entity-kind invariant');
const fsKeys = Object.keys(ACKS.FIELD_SCHEMAS);
ok('exactly ' + FIELD_SCHEMAS_COUNT + ' field schemas seeded', fsKeys.length === FIELD_SCHEMAS_COUNT, 'got ' + fsKeys.length);
// schemas ⊆ entity kinds, with ONE pre-existing documented exception: itemCustody (the cus- custody
// relation) was field-schema-authored (Inspector Wave C) but never given a registry list/find entry,
// so it's editable-by-schema but not registry-browsed. The byte-identity baseline shows this predates
// this slice. The assertion still catches any NEW schema key that is neither a kind nor this exception.
const SCHEMA_KEY_EXCEPTIONS = new Set(['itemCustody']);
ok('every field-schema key is a registered entity kind (1 documented exception: itemCustody)',
  fsKeys.every(k => ekSet.has(k) || SCHEMA_KEY_EXCEPTIONS.has(k)),
  fsKeys.filter(k => !ekSet.has(k) && !SCHEMA_KEY_EXCEPTIONS.has(k)).join(', '));
ok('representative schemas all present', SCHEMA_REPRESENTATIVES.every(k => k in ACKS.FIELD_SCHEMAS),
  SCHEMA_REPRESENTATIVES.filter(k => !(k in ACKS.FIELD_SCHEMAS)).join(', '));
ok('outpost is first, confinement is last (insertion order preserved)', fsKeys[0] === 'outpost' && fsKeys[fsKeys.length - 1] === 'confinement');
ok('every seeded schema is well-formed (validateAllSchemas clean)', ACKS.validateAllSchemas().length === 0,
  ACKS.validateAllSchemas().slice(0, 3).join(' | '));

section('registerEntityKind — the kernel (entity-registry.js)');
ok('registerEntityKind exported', typeof ACKS.registerEntityKind === 'function');
ok('registeredEntityKinds exported', typeof ACKS.registeredEntityKinds === 'function');
ok('registeredEntityKinds() returns a fresh array', (function(){ const a = ACKS.registeredEntityKinds(); const n = a.length; a.push({}); return ACKS.registeredEntityKinds().length === n; })());
// a module self-registering a fresh kind from its own file at load
ACKS.registerEntityKind({ kind: '__smoke-ek', label: 'Smk', pluralLabel: 'Smks', icon: '🔬', addressable: true, chronicleable: true,
  list: (c) => (c && c.__smks) || [], find: (c, id) => ((c && c.__smks) || []).find(x => x && x.id === id), displayName: (c, o) => (o && o.id) });
ok('a fresh kind lands in ENTITY_KINDS_LIST', ACKS.ENTITY_KINDS_LIST.some(e => e.kind === '__smoke-ek'));
ok('a fresh kind lands in the ENTITY_KINDS index', !!ACKS.ENTITY_KINDS['__smoke-ek']);
ok('entityKind() sees it', (ACKS.entityKind('__smoke-ek') || {}).label === 'Smk');
ok('entityIcon() / entityLabel() see it', ACKS.entityIcon('__smoke-ek') === '🔬' && ACKS.entityLabel('__smoke-ek') === 'Smk');
ok('and is visible via the shared namespace (the read path index.html uses)', global.ACKS.ENTITY_KINDS_LIST.some(e => e.kind === '__smoke-ek'));
// idempotent: re-registering the same kind does not re-push
const ekCnt = ACKS.ENTITY_KINDS_LIST.length;
ACKS.registerEntityKind({ kind: '__smoke-ek', label: 'Smk', pluralLabel: 'Smks', icon: '🔬', addressable: true, chronicleable: true });
ok('re-registering the same kind is idempotent (no re-push)', ACKS.ENTITY_KINDS_LIST.length === ekCnt);
// conflict: different metadata for a registered kind keeps the original (and warns)
ACKS.registerEntityKind({ kind: '__smoke-ek', label: 'CHANGED', pluralLabel: 'X', icon: '✖', addressable: false, chronicleable: false });
ok('a conflicting re-register keeps the original metadata', (ACKS.entityKind('__smoke-ek') || {}).label === 'Smk');
ok('a conflicting re-register does not duplicate', ACKS.ENTITY_KINDS_LIST.filter(e => e.kind === '__smoke-ek').length === 1);
// guards: missing/falsy args are safe no-ops, never throw
ok('registerEntityKind() with no args is a safe no-op', (function(){ try { const n = ACKS.ENTITY_KINDS_LIST.length; ACKS.registerEntityKind(); ACKS.registerEntityKind({}); return ACKS.ENTITY_KINDS_LIST.length === n; } catch(e){ return false; } })());

section('registerFieldSchema — the kernel (field-schemas.js)');
ok('registerFieldSchema exported', typeof ACKS.registerFieldSchema === 'function');
ok('registeredFieldSchemas exported', typeof ACKS.registeredFieldSchemas === 'function');
ok('registeredFieldSchemas() returns a fresh array', (function(){ const a = ACKS.registeredFieldSchemas(); const n = a.length; a.push('zz'); return ACKS.registeredFieldSchemas().length === n; })());
// a module self-registering a fresh schema from its own file at load
ACKS.registerFieldSchema('__smoke-ek', { factory: 'blankSmk', groups: ['Identity'], fields: [{ name: 'id', type: 'string', readonly: true, group: 'Identity' }] });
ok('a fresh schema lands in FIELD_SCHEMAS', !!ACKS.FIELD_SCHEMAS['__smoke-ek']);
ok('fieldSchemaFor() sees it', (ACKS.fieldSchemaFor('__smoke-ek') || {}).factory === 'blankSmk');
ok('kindsWithSchema() sees it', ACKS.kindsWithSchema().includes('__smoke-ek'));
ok('entityFieldGroups() reads the registered schema', ACKS.entityFieldGroups('__smoke-ek').join(',') === 'Identity');
ok('and is visible via the shared namespace', '__smoke-ek' in global.ACKS.FIELD_SCHEMAS);
// idempotent: same kind + identical schema is a no-op
const fsCnt = Object.keys(ACKS.FIELD_SCHEMAS).length;
ACKS.registerFieldSchema('__smoke-ek', { factory: 'blankSmk', groups: ['Identity'], fields: [{ name: 'id', type: 'string', readonly: true, group: 'Identity' }] });
ok('re-registering an identical schema is idempotent (count unchanged)', Object.keys(ACKS.FIELD_SCHEMAS).length === fsCnt);
// conflict: a different schema for a registered kind keeps the original (and warns)
ACKS.registerFieldSchema('__smoke-ek', { factory: 'OTHER', fields: [{ name: 'z', type: 'string' }] });
ok('a conflicting schema keeps the original', ACKS.FIELD_SCHEMAS['__smoke-ek'].factory === 'blankSmk');
// guards: missing/falsy args are safe no-ops, never throw
ok('registerFieldSchema() guards are safe no-ops', (function(){ try { const n = Object.keys(ACKS.FIELD_SCHEMAS).length; ACKS.registerFieldSchema(); ACKS.registerFieldSchema('x'); ACKS.registerFieldSchema('y', 'notObj'); return Object.keys(ACKS.FIELD_SCHEMAS).length === n; } catch(e){ return false; } })());

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — self-registration.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
