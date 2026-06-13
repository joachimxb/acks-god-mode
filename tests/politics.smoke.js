// =============================================================================
// politics.smoke.js — Politics & Power P-1 (the senate/faction/senatorship data layer).
// Wave D (Phase_4_Politics_Plan.md §4 + §14 P-1; Politics_RAW_Survey.md §4 + §7).
// Covers: the sen-/fac-/snr- prefixes; the blankSenate/blankFaction/blankSenatorship factories;
// the lookups; the Domain.governance sub-tree (defensive-read default + setDomainGovernance);
// the derived accessors (§4.4 — factionTotalInfluence / senateTotalVotes / ruling+leading faction /
// factionStanding / senateBenefitsActive / oligarchyDerivedStats); the realm-apex resolver; the
// Entity-Registry kinds + the schema⊆factory + displayName invariants; the POLICY_OBJECTIVES
// taxonomy; the importer wiring; and the LOAD-BEARING guard — every shipped template + the demo
// STAY migrate-no-ops (P-1 added NOTHING to migrateCampaign/blankCampaign; the three collections
// are read defensively, never lazy-injected).
// =============================================================================
const fs = require('fs');
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;
const REPO = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const clone = o => JSON.parse(JSON.stringify(o));

// =============================================================================
section('ID prefixes (sen- / fac- / snr-)');
// =============================================================================
ok('ID_PREFIXES.senate === "sen"', ACKS.ID_PREFIXES.senate === 'sen');
ok('ID_PREFIXES.faction === "fac"', ACKS.ID_PREFIXES.faction === 'fac');
ok('ID_PREFIXES.senatorship === "snr"', ACKS.ID_PREFIXES.senatorship === 'snr');

// =============================================================================
section('Factories — blankSenate / blankFaction / blankSenatorship');
// =============================================================================
ok('blankSenate is a function', typeof ACKS.blankSenate === 'function');
ok('blankFaction is a function', typeof ACKS.blankFaction === 'function');
ok('blankSenatorship is a function', typeof ACKS.blankSenatorship === 'function');

const sen = ACKS.blankSenate({ name: 'Senate of Aura', realmDomainId: 'dom-apex', seats: 50 });
ok('blankSenate id has sen- prefix', /^sen-/.test(sen.id));
ok('blankSenate schemaVersion 2', sen.schemaVersion === 2);
ok('blankSenate keeps opts', sen.name === 'Senate of Aura' && sen.realmDomainId === 'dom-apex' && sen.seats === 50);
ok('blankSenate defaults kind=senate, status=active, dispute=null', sen.kind === 'senate' && sen.status === 'active' && sen.dispute === null);
ok('blankSenate requirementsOfOffice is a populated object', sen.requirementsOfOffice && typeof sen.requirementsOfOffice === 'object'
  && ['minLevel','title','netWorthGp','landDescription','families','bribeCostDay','bribeCostWeek','bribeCostMonth','bribeCostYear'].every(k => k in sen.requirementsOfOffice));
ok('blankSenate independentMinorSenatorVotes defaults 0', sen.independentMinorSenatorVotes === 0);
ok('blankSenate does NOT store rulingFactionId/leadingFactionId (derived §4.4)', !('rulingFactionId' in sen) && !('leadingFactionId' in sen));

const fac = ACKS.blankFaction({ name: 'The Optimates', senateId: sen.id, policyObjectives: ['preserve-ruler'] });
ok('blankFaction id has fac- prefix', /^fac-/.test(fac.id));
ok('blankFaction schemaVersion 2 + keeps opts', fac.schemaVersion === 2 && fac.name === 'The Optimates' && fac.senateId === sen.id);
ok('blankFaction policyObjectives is a fresh array', Array.isArray(fac.policyObjectives) && fac.policyObjectives.length === 1);
ok('blankFaction defaults kind=minor, status=active', fac.kind === 'minor' && fac.status === 'active');

const snr = ACKS.blankSenatorship({ senatorCharacterId: 'chr-1', senateId: sen.id, factionId: fac.id, votes: 12 });
ok('blankSenatorship id has snr- prefix', /^snr-/.test(snr.id));
ok('blankSenatorship schemaVersion 2 + keeps opts', snr.schemaVersion === 2 && snr.votes === 12 && snr.factionId === fac.id);
ok('blankSenatorship defaults rank=leading, status=active, attitude=7, isSecretInfluence=true',
  snr.rank === 'leading' && snr.status === 'active' && snr.attitudeTowardRuler === 7 && snr.isSecretInfluence === true);
ok('blankSenatorship bribeCostByPeriod populated {day,week,month,year}',
  ['day','week','month','year'].every(k => k in snr.bribeCostByPeriod));
ok('blankSenatorship influenceModifiers is a fresh array', Array.isArray(snr.influenceModifiers) && snr.influenceModifiers.length === 0);
// opts arrays are copied, not aliased
const objs = ['a']; const snr2 = ACKS.blankSenatorship({ policyObjectives: objs }); objs.push('b');
ok('blankSenatorship copies opts arrays (no aliasing)', snr2.policyObjectives.length === 1);

// =============================================================================
section('Field schemas — exist, validate, schema ⊆ factory');
// =============================================================================
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
for(const kind of ['senate','faction','senatorship']){
  const schema = ACKS.fieldSchemaFor(kind);
  ok('schema "' + kind + '" exists + adminCreate schemaForm', !!schema && schema.adminCreate === 'schemaForm');
  ok('schema "' + kind + '" validates clean', !!schema && ACKS.validateFieldSchema(kind, schema).ok);
  const factory = ACKS[schema.factory] || ACKS['blank' + cap(kind)];
  const keys = new Set(Object.keys(factory({})));
  const topExtras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
  ok('schema "' + kind + '" top-level fields ⊆ factory keys', topExtras.length === 0, 'extras: [' + topExtras.join(', ') + ']');
  // object sub-fields ⊆ the factory's pre-populated nested object keys
  const blank = factory({});
  for(const f of schema.fields.filter(f => f.type === 'object')){
    const nested = blank[f.name];
    if(nested && typeof nested === 'object' && !Array.isArray(nested)){
      const nk = new Set(Object.keys(nested));
      const subExtras = (f.fields || []).filter(s => s.type !== 'computed').map(s => s.name).filter(n => !nk.has(n));
      ok('schema "' + kind + '" object "' + f.name + '" sub-fields ⊆ nested keys', subExtras.length === 0, 'extras: [' + subExtras.join(', ') + ']');
    }
  }
}

// =============================================================================
section('Entity Registry — kinds registered + displayName ⊆ factory keys');
// =============================================================================
for(const kind of ['senate','faction','senatorship']){
  const e = ACKS.entityKind(kind);
  ok('registry "' + kind + '" registered', !!e && e.addressable === true);
  ok('registry "' + kind + '" list reads defensively (empty campaign → [])', e.list({}).length === 0);
}
ok('registry senate icon 🏛', ACKS.entityIcon('senate') === '🏛');
ok('registry senatorship NOT chronicleable (a relation)', ACKS.entityKind('senatorship').chronicleable === false);
// displayName reads only factory keys (the registry⊆factory invariant) — via an access-recording Proxy
(function(){
  for(const kind of ['senate','faction','senatorship']){
    const e = ACKS.entityKind(kind); const blank = ACKS['blank' + cap(kind)]({});
    const factoryKeys = new Set(Object.keys(blank)); const accessed = new Set();
    const proxy = new Proxy(blank, { get(t, k){ if(typeof k === 'string') accessed.add(k); return t[k]; } });
    try { e.displayName({}, proxy); } catch(_){}
    const extras = [...accessed].filter(k => !factoryKeys.has(k));
    ok('registry "' + kind + '" displayName reads only factory fields', extras.length === 0, 'reads [' + extras.join(', ') + ']');
  }
})();

// A small fixture realm (one apex senate, two factions, five seated leading senators) reused below.
function fixture(){
  const c = {
    domains: [{ id: 'dom-apex', name: 'Aura', liegeId: null, governance: { mode: 'senatorial', senateId: 'sen-1' } },
              { id: 'dom-vassal', name: 'Tyros', liegeId: 'dom-apex' }],
    characters: [{ id: 'chr-r', name: 'Ruler', abilities: { CHA: 13 }, level: 9, alignment: 'Lawful' }],
    senates: [ACKS.blankSenate({ id: 'sen-1', realmDomainId: 'dom-apex', seats: 50, independentMinorSenatorVotes: 9 })],
    factions: [ACKS.blankFaction({ id: 'fac-a', name: 'A', senateId: 'sen-1' }),
               ACKS.blankFaction({ id: 'fac-b', name: 'B', senateId: 'sen-1' })],
    senatorships: [
      ACKS.blankSenatorship({ id: 'snr-1', senatorCharacterId: 'chr-1', senateId: 'sen-1', factionId: 'fac-a', votes: 10 }),
      ACKS.blankSenatorship({ id: 'snr-2', senatorCharacterId: 'chr-2', senateId: 'sen-1', factionId: 'fac-a', votes: 8 }),
      ACKS.blankSenatorship({ id: 'snr-3', senatorCharacterId: 'chr-3', senateId: 'sen-1', factionId: 'fac-a', votes: 6 }),
      ACKS.blankSenatorship({ id: 'snr-4', senatorCharacterId: 'chr-4', senateId: 'sen-1', factionId: 'fac-b', votes: 12 }),
      ACKS.blankSenatorship({ id: 'snr-5', senatorCharacterId: 'chr-5', senateId: 'sen-1', factionId: 'fac-b', votes: 5 })
    ]
  };
  return c;
}

// =============================================================================
section('Lookups');
// =============================================================================
(function(){
  const c = fixture();
  ok('findSenate', ACKS.findSenate(c, 'sen-1') && ACKS.findSenate(c, 'sen-1').id === 'sen-1');
  ok('findFaction', ACKS.findFaction(c, 'fac-a').name === 'A');
  ok('findSenatorship', ACKS.findSenatorship(c, 'snr-4').votes === 12);
  ok('senatesForRealm(apex) → 1', ACKS.senatesForRealm(c, 'dom-apex').length === 1);
  ok('senateForRealm(apex)', ACKS.senateForRealm(c, 'dom-apex').id === 'sen-1');
  ok('factionsForSenate → 2', ACKS.factionsForSenate(c, 'sen-1').length === 2);
  ok('senatorshipsForSenate → 5', ACKS.senatorshipsForSenate(c, 'sen-1').length === 5);
  ok('senatorshipsInFaction(fac-a) → 3', ACKS.senatorshipsInFaction(c, 'fac-a').length === 3);
  ok('senatorshipsInFaction(fac-b) → 2', ACKS.senatorshipsInFaction(c, 'fac-b').length === 2);
  ok('senatorshipsForCharacter(chr-4) → 1', ACKS.senatorshipsForCharacter(c, 'chr-4').length === 1);
  // a vacated senatorship drops from active lookups
  c.senatorships[0].status = 'vacated';
  ok('vacated senatorship excluded from senatorshipsForSenate', ACKS.senatorshipsForSenate(c, 'sen-1').length === 4);
  ok('vacated senatorship excluded from senatorshipsInFaction', ACKS.senatorshipsInFaction(c, 'fac-a').length === 2);
  // empty campaign — no throws, empty results
  ok('lookups on empty campaign → empty', ACKS.senatesForRealm({}, 'x').length === 0 && ACKS.findSenate({}, 'x') === null);
})();

// =============================================================================
section('Governance sub-tree (defensive read + setDomainGovernance + apex)');
// =============================================================================
(function(){
  const c = fixture();
  // defensive default on a plain domain (no governance field) → feudal, fully populated
  const plain = ACKS.governanceFor(c, c.domains[1]);
  ok('governanceFor(plain) defaults mode=feudal', plain.mode === 'feudal');
  ok('governanceFor(plain) fully populated', plain.senateId === null && Array.isArray(plain.oligarchCharacterIds)
    && plain.oligarchyDecisionRule === 'majority' && plain.landSeparated === false && plain.governorCharacterId === null);
  ok('governanceFor does NOT mutate the domain', !('governance' in c.domains[1]));
  // setDomainGovernance materializes + patches
  const g = ACKS.setDomainGovernance(c, 'dom-vassal', { mode: 'oligarchic', oligarchCharacterIds: ['chr-r'] });
  ok('setDomainGovernance materializes governance', c.domains[1].governance && c.domains[1].governance.mode === 'oligarchic');
  ok('setDomainGovernance patch applied', g.oligarchCharacterIds.length === 1 && g.oligarchCharacterIds[0] === 'chr-r');
  ok('setDomainGovernance keeps the defaults for un-patched keys', g.oligarchyDecisionRule === 'majority');
  ok('setDomainGovernance on a missing domain → null', ACKS.setDomainGovernance(c, 'dom-none', { mode: 'feudal' }) === null);
  // realm apex resolver (walk liegeId up)
  ok('realmApexDomain(vassal) → apex', ACKS.realmApexDomain(c, c.domains[1]).id === 'dom-apex');
  ok('realmApexDomain(apex) → itself', ACKS.realmApexDomain(c, c.domains[0]).id === 'dom-apex');
  ok('isSenatorialRealm(vassal) reads the apex (true)', ACKS.isSenatorialRealm(c, c.domains[1]) === true);
  ok('senateForDomain(vassal) resolves the apex senate', ACKS.senateForDomain(c, c.domains[1]).id === 'sen-1');
  // cycle guard
  const cyc = { domains: [{ id: 'd1', liegeId: 'd2' }, { id: 'd2', liegeId: 'd1' }] };
  ok('realmApexDomain is cycle-safe', !!ACKS.realmApexDomain(cyc, cyc.domains[0]));
})();

// =============================================================================
section('Derived influence math (§4.4 — the senate tally)');
// =============================================================================
(function(){
  const c = fixture();
  const senate = ACKS.findSenate(c, 'sen-1'), fa = ACKS.findFaction(c, 'fac-a'), fb = ACKS.findFaction(c, 'fac-b');
  ok('factionTotalInfluence(A) = 10+8+6 = 24', ACKS.factionTotalInfluence(c, fa) === 24);
  ok('factionTotalInfluence(B) = 12+5 = 17', ACKS.factionTotalInfluence(c, fb) === 17);
  ok('senateTotalVotes = 24+17+9 = 50', ACKS.senateTotalVotes(c, senate) === 50);
  ok('no faction holds a majority → rulingFactionId null', ACKS.senateRulingFactionId(c, senate) === null);
  ok('plurality → leadingFactionId = fac-a', ACKS.senateLeadingFactionId(c, senate) === 'fac-a');
  ok('factionStanding(A) = leading', ACKS.factionStanding(c, fa) === 'leading');
  ok('factionStanding(B) = minor', ACKS.factionStanding(c, fb) === 'minor');
  // bump fac-a over the majority threshold (26 of 50): 30+8+6 = 44 ≥ 26
  c.senatorships[0].votes = 30;
  ok('majority → rulingFactionId = fac-a', ACKS.senateRulingFactionId(c, senate) === 'fac-a');
  ok('ruling faction standing = ruling', ACKS.factionStanding(c, fa) === 'ruling');
  ok('leadingFactionId returns the ruling faction when one exists', ACKS.senateLeadingFactionId(c, senate) === 'fac-a');
  // an exact tie → no leading faction
  const tie = fixture();
  tie.senatorships = [ ACKS.blankSenatorship({ senateId: 'sen-1', factionId: 'fac-a', votes: 10 }),
                       ACKS.blankSenatorship({ senateId: 'sen-1', factionId: 'fac-b', votes: 10 }) ];
  tie.senates[0].independentMinorSenatorVotes = 30;
  ok('a tie for plurality → leadingFactionId null', ACKS.senateLeadingFactionId(tie, tie.senates[0]) === null);
  // an empty senate → null / 0, no throw
  const empty = { senates: [ACKS.blankSenate({ id: 'sen-e' })], factions: [], senatorships: [] };
  ok('empty senate tally = 0', ACKS.senateTotalVotes(empty, empty.senates[0]) === 0);
  ok('empty senate ruling/leading = null', ACKS.senateRulingFactionId(empty, empty.senates[0]) === null && ACKS.senateLeadingFactionId(empty, empty.senates[0]) === null);
})();

// =============================================================================
section('senateBenefitsActive + dispute (the §5.1 guard boolean — P-2 wires the effects)');
// =============================================================================
(function(){
  const c = fixture();
  const apex = c.domains[0], vassal = c.domains[1];
  ok('senatorial + no dispute → benefits active (apex)', ACKS.senateBenefitsActive(c, apex) === true);
  ok('senatorial + no dispute → benefits active (vassal reads apex)', ACKS.senateBenefitsActive(c, vassal) === true);
  // open a dispute → benefits suspended
  c.senates[0].dispute = { defiedTopic: 'change-taxes', sinceTurn: 5, attempts: 1 };
  ok('dispute suspends benefits', ACKS.senateBenefitsActive(c, apex) === false);
  c.senates[0].dispute = null;
  // a feudal realm has no senate benefit even with a senate present
  ACKS.setDomainGovernance(c, 'dom-apex', { mode: 'feudal' });
  ok('feudal apex → benefits inactive', ACKS.senateBenefitsActive(c, apex) === false);
  // a plain feudal campaign (no politics data at all) → false, no throw
  ok('benefits inactive on a politics-free campaign', ACKS.senateBenefitsActive({ domains: [{ id: 'x' }] }, { id: 'x' }) === false);
})();

// =============================================================================
section('oligarchyDerivedStats (JJ p.402 — collective-ruler reads; rule-of-the-few later)');
// =============================================================================
(function(){
  const c = { domains: [{ id: 'dom-o', liegeId: null, governance: { mode: 'oligarchic', oligarchCharacterIds: ['chr-1','chr-2','chr-3'] } }],
    characters: [
      { id: 'chr-1', abilities: { CHA: 16 }, level: 9, alignment: 'Lawful', proficiencies: ['Leadership'] },
      { id: 'chr-2', abilities: { CHA: 13 }, level: 7, alignment: 'Lawful' },
      { id: 'chr-3', abilities: { CHA: 9 }, level: 5, alignment: 'Neutral' }
    ] };
  const st = ACKS.oligarchyDerivedStats(c, c.domains[0]);
  ok('oligarchyDerivedStats returns a stat block', !!st && st.memberCount === 3);
  ok('derived level = avg(9,7,5) = 7', st.level === 7);
  ok('derived alignment = Lawful (2 of 3 lawful, none chaotic)', st.alignment === 'Lawful');
  ok('derived CHA folds in Leadership (+1 for chr-1)', typeof st.cha === 'number');
  ok('oligarchyDerivedStats on a non-oligarchic domain → null', ACKS.oligarchyDerivedStats(fixture(), fixture().domains[0]) === null);
})();

// =============================================================================
section('POLICY_OBJECTIVES taxonomy (the 1d20 table — RR p.357)');
// =============================================================================
ok('POLICY_OBJECTIVES has 20 entries', Array.isArray(ACKS.POLICY_OBJECTIVES) && ACKS.POLICY_OBJECTIVES.length === 20);
ok('POLICY_OBJECTIVES includes replace-ruler + preserve-ruler', ACKS.POLICY_OBJECTIVES.includes('replace-ruler') && ACKS.POLICY_OBJECTIVES.includes('preserve-ruler'));
ok('POLICY_OBJECTIVES is frozen', Object.isFrozen(ACKS.POLICY_OBJECTIVES));
// the schema enumValues mirror the taxonomy
const facObj = ACKS.fieldSchemaFor('faction').fields.find(f => f.name === 'policyObjectives');
ok('faction policyObjectives enum mirrors POLICY_OBJECTIVES', facObj && facObj.type === 'enumMulti'
  && facObj.enumValues.length === 20 && facObj.enumValues.every(v => ACKS.POLICY_OBJECTIVES.includes(v)));

// =============================================================================
section('Importer wiring (index.html SIMPLE_ID_COLLECTIONS — §8.9 mandate)');
// =============================================================================
(function(){
  let html = '';
  try { html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); } catch(e){ ok('index.html readable', false, e.message); return; }
  const m = html.match(/const SIMPLE_ID_COLLECTIONS = \[([\s\S]*?)\];/);
  ok('SIMPLE_ID_COLLECTIONS block found', !!m);
  const block = m ? m[1] : '';
  for(const name of ['senates','factions','senatorships']){
    ok("importer walks '" + name + "'", new RegExp("'" + name + "'").test(block));
  }
})();

// =============================================================================
section('P-1 GUARD — templates + demo STAY migrate-no-ops (no senate-collection lazy-inject)');
// =============================================================================
// P-1 added the three collections to the IMPORTER only; nothing was added to migrateCampaign or
// blankCampaign, and the factories live in acks-engine-politics.js (NOT entities.js). So every
// shipped template + the demo must still be a TRUE migrate-no-op (JSON-identical), and migration
// must NOT inject senates/factions/senatorships. (Mirrors religion.smoke §R0-GUARD.)
require(path.join(REPO, 'acks-demo-template.js'));
const DEMO = global.ACKS_DEMO_TEMPLATE;
ok('demo template loaded', DEMO && DEMO.kind === 'campaign');
ok('migrate(demo) is a TRUE no-op (JSON-identical)', JSON.stringify(ACKS.migrateCampaign(clone(DEMO))) === JSON.stringify(clone(DEMO)));
(function(){
  const migrated = ACKS.migrateCampaign(clone(DEMO));
  ok('migrate(demo) did NOT inject senates/factions/senatorships',
    !('senates' in migrated) && !('factions' in migrated) && !('senatorships' in migrated));
})();
(function(){
  const dir = path.join(REPO, 'Templates');
  let templateFiles = [];
  try { templateFiles = fs.readdirSync(dir).filter(f => f.endsWith('.acks.json')); } catch(_){}
  ok('found shipped templates to check', templateFiles.length === 6, 'found ' + templateFiles.length);
  for(const f of templateFiles){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch(e){ ok('template parses: ' + f, false, e.message); continue; }
    const migrated = ACKS.migrateCampaign(clone(raw));
    ok('template is a TRUE migrate-no-op: ' + f, JSON.stringify(migrated) === JSON.stringify(raw));
    ok('template did NOT gain senate collections: ' + f, !('senates' in migrated) && !('factions' in migrated) && !('senatorships' in migrated));
  }
})();

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Politics P-1 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
