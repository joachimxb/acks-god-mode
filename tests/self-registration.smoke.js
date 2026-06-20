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
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — self-registration.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
