// =============================================================================
// politics.smoke.js — Politics & Power, P-1 (the data layer) + P-2 (the senate engine).
// Wave D (Phase_4_Politics_Plan.md §4–§5 + §10 + §14; Politics_RAW_Survey.md §4 + §7).
// P-1 covers: the sen-/fac-/snr- prefixes; the blankSenate/blankFaction/blankSenatorship factories;
// the lookups; the Domain.governance sub-tree (defensive-read default + setDomainGovernance);
// the derived accessors (§4.4 — factionTotalInfluence / senateTotalVotes / ruling+leading faction /
// factionStanding / senateBenefitsActive / oligarchyDerivedStats); the realm-apex resolver; the
// Entity-Registry kinds + the schema⊆factory + displayName invariants; the POLICY_OBJECTIVES
// taxonomy; the importer wiring; and the LOAD-BEARING guard — every shipped template + the demo
// STAY migrate-no-ops (P-1 added NOTHING to migrateCampaign/blankCampaign; the three collections
// are read defensively, never lazy-injected).
// P-2 (burst5 2026-06-14) covers: the senate-auto-vote rule + the 2 events; senateVotingBand
// (the RR p.358 2d6 table); the restricted matters; the itemized senatorVoteModifiers stack;
// senateVote (per-senator + by-faction + bewitched auto-vote + controlled independents + the
// rule-OFF GM-narrate path + the stop-at-majority logic + the record emit); senateBenefits (the
// structured RR p.355 read); the dispute lifecycle (set/clear); enactPolicy (the restriction →
// dispute gate, RR p.359); and the F&D Office → senate-seat hook end-to-end (§10 — senatorial
// auto-seats, feudal is a no-op, revoke vacates, idempotent).
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
// P-2 — the senate engine (burst5 2026-06-14): voting + benefits/restrictions +
// disputes + the F&D Office→seat hook. RR p.358 voting / p.355 benefits / p.359 disputes.
// =============================================================================
const rngConst = v => () => v;          // a deterministic rng: 0.99 → 2d6=12 (for), 0.01 → 2d6=2 (against), 0.5 → 8 (trend)

section('P-2 — house rule + events registered');
(function(){
  const r = ACKS.lookupHouseRule('senate-auto-vote');
  ok('senate-auto-vote rule registered, category domain, default true', !!r && r.category === 'domain' && r.default === true);
  ok('senate-auto-vote reads ON on a politics-free campaign (registry default → no template churn)',
    ACKS.isHouseRuleEnabled({ houseRules: {} }, 'senate-auto-vote') === true);
  ok('senate-vote + policy-enacted in EVENT_KINDS', ACKS.EVENT_KINDS.includes('senate-vote') && ACKS.EVENT_KINDS.includes('policy-enacted'));
  ok('senate-vote + policy-enacted have schemas', !!ACKS.EVENT_SCHEMAS['senate-vote'] && !!ACKS.EVENT_SCHEMAS['policy-enacted']);
  ok('senate events are Wizard-opt-out (engine-owned)', !ACKS.isWizardEmittable('senate-vote') && !ACKS.isWizardEmittable('policy-enacted'));
})();

section('P-2 — senateVotingBand (the 2d6 table, RR p.358)');
(function(){
  ok('≤2 → against + condemn', ACKS.senateVotingBand(2).vote === 'against' && ACKS.senateVotingBand(2).cascade === 'condemn');
  ok('1 (negative-adjusted) → against + condemn', ACKS.senateVotingBand(-3).vote === 'against' && ACKS.senateVotingBand(-3).cascade === 'condemn');
  ok('3 → against, no cascade', ACKS.senateVotingBand(3).vote === 'against' && ACKS.senateVotingBand(3).cascade === null);
  ok('5 → against', ACKS.senateVotingBand(5).vote === 'against');
  ok('6 → trend', ACKS.senateVotingBand(6).vote === 'trend');
  ok('8 → trend', ACKS.senateVotingBand(8).vote === 'trend');
  ok('9 → for', ACKS.senateVotingBand(9).vote === 'for' && ACKS.senateVotingBand(9).cascade === null);
  ok('11 → for', ACKS.senateVotingBand(11).vote === 'for');
  ok('12 → for + endorse', ACKS.senateVotingBand(12).vote === 'for' && ACKS.senateVotingBand(12).cascade === 'endorse');
  ok('15 → for + endorse', ACKS.senateVotingBand(15).vote === 'for' && ACKS.senateVotingBand(15).cascade === 'endorse');
})();

section('P-2 — restricted matters (RR p.359)');
(function(){
  ok('SENATE_RESTRICTED_MATTERS has the 6 RAW matters', ACKS.SENATE_RESTRICTED_MATTERS.length === 6
    && ACKS.SENATE_RESTRICTED_MATTERS.includes('change-taxes') && ACKS.SENATE_RESTRICTED_MATTERS.includes('invade-realm'));
  ok('isSenateConsultationRequired(change-taxes) true', ACKS.isSenateConsultationRequired('change-taxes') === true);
  ok('isSenateConsultationRequired(throw-a-feast) false', ACKS.isSenateConsultationRequired('throw-a-feast') === false);
})();

section('P-2 — senatorVoteModifiers (the itemized stack, RR p.358)');
(function(){
  const c = fixture();
  c.characters.push({ id: 'chr-x', socialTier: 'aristocrat' });               // a non-henchman senator
  const ctx = { rulerId: 'chr-r', domainMorale: 3, hasDiplomacy: false, hasMysticAura: true, lawfulClean: true,
    rulerFactionId: 'fac-a', policyHelps: ['preserve-ruler'], policyHinders: [], militaryLoyalty: 'all', controlledIndependentVotes: 0 };
  const sA = { senatorCharacterId: 'chr-x', factionId: 'fac-a', policyObjectives: ['preserve-ruler'], influenceModifiers: [{ kind: 'bribe', value: 2 }] };
  const m = ACKS.senatorVoteModifiers(c, c.senates[0], sA, ctx, {}, false);
  // 3 (morale) −2 (no diplomacy) +1 (mystic) +1 (lawful) +2 (military all) +1 (same faction) +1 (helps) +2 (bribe) = 9
  ok('full per-senator modifier total = 9', m.total === 9, 'got ' + m.total + ' :: ' + JSON.stringify(m.modifiers));
  ok('itemized rows include the bribe (+2)', m.modifiers.some(x => x.label === 'bribe' && x.value === 2));
  ok('itemized rows include policy-helps (+1)', m.modifiers.some(x => /helps/.test(x.label) && x.value === 1));
  // opposed faction → −2
  const sB = { senatorCharacterId: 'chr-x', factionId: 'fac-b', policyObjectives: [], influenceModifiers: [] };
  const mB = ACKS.senatorVoteModifiers(c, c.senates[0], sB, ctx, {}, false);
  ok('opposed-faction row = −2', mB.modifiers.some(x => x.label === 'opposed faction' && x.value === -2));
  // henchman of the ruler → +5
  c.characters.push({ id: 'chr-h', socialTier: 'henchman', liegeCharacterId: 'chr-r' });
  const sH = { senatorCharacterId: 'chr-h', factionId: 'fac-a', policyObjectives: [], influenceModifiers: [] };
  const mH = ACKS.senatorVoteModifiers(c, c.senates[0], sH, ctx, {}, false);
  ok('ruler’s-henchman row = +5', mH.modifiers.some(x => /henchman/.test(x.label) && x.value === 5));
  // policy hinders → −2 per objective
  const sHin = { senatorCharacterId: 'chr-x', factionId: 'fac-a', policyObjectives: ['increase-army'], influenceModifiers: [] };
  const ctxHin = Object.assign({}, ctx, { policyHelps: [], policyHinders: ['increase-army'] });
  const mHin = ACKS.senatorVoteModifiers(c, c.senates[0], sHin, ctxHin, {}, false);
  ok('policy-hinders row = −2', mHin.modifiers.some(x => /hinders/.test(x.label) && x.value === -2));
  // endorse/condemn cascade (same faction)
  const mCas = ACKS.senatorVoteModifiers(c, c.senates[0], sA, ctx, { 'fac-a': { endorsements: 2, condemnations: 1 } }, false);
  ok('cascade rows: +2 endorsements, −1 condemnation', mCas.modifiers.some(x => x.value === 2 && /endorsement/.test(x.label))
    && mCas.modifiers.some(x => x.value === -1 && /condemnation/.test(x.label)));
  // by-faction (factionWide) drops the per-senator rows (henchman/policy/bribe/cascade)
  const mFW = ACKS.senatorVoteModifiers(c, c.senates[0], sA, ctx, { 'fac-a': { endorsements: 2, condemnations: 0 } }, true);
  ok('factionWide drops the per-senator bribe/helps/cascade rows', !mFW.modifiers.some(x => x.label === 'bribe' || /helps/.test(x.label) || /endorsement/.test(x.label)));
  ok('factionWide keeps the ruler-wide rows (morale/mystic/military/faction)', mFW.modifiers.some(x => x.label === 'domain morale') && mFW.modifiers.some(x => x.label === 'same faction as ruler'));
})();

section('P-2 — senateVote (the consultation, RR p.358)');
(function(){
  // ALL-FOR (high rng): seats sorted by influence 12,10,8,6,5; total 50, threshold 26.
  // 12 + 10 + 8 = 30 ≥ 26 → stops after 3 senators, approved.
  const c = fixture();
  const rFor = ACKS.senateVote(c, { senateId: 'sen-1', matter: 'change-taxes', rng: rngConst(0.99) });
  ok('all-for → approved', rFor.approved === true && rFor.outcome === 'approved');
  ok('stops at majority (3 of 5 senators rolled)', rFor.rolls.length === 3, 'rolled ' + rFor.rolls.length);
  ok('forVotes ≥ threshold', rFor.forVotes >= rFor.majorityThreshold && rFor.majorityThreshold === 26);
  ok('rolls in descending influence order (12 first)', rFor.rolls[0].votes === 12);
  // the fixture ruler lacks Diplomacy (−2) and is Lawful & clean (+1) → a −1 baseline; natural 12 → adjusted 11 → for.
  ok('each roll is itemized (d1=6,d2=6,natural=12,adjusted,band,vote=for)',
    rFor.rolls[0].roll && rFor.rolls[0].roll.d1 === 6 && rFor.rolls[0].roll.d2 === 6 && rFor.rolls[0].roll.natural === 12
    && typeof rFor.rolls[0].adjusted === 'number' && rFor.rolls[0].vote === 'for' && Array.isArray(rFor.rolls[0].modifiers));
  ok('a senate-vote event was emitted (record-only)', (c.eventLog || []).some(e => e.event && e.event.kind === 'senate-vote'));
  ok('emitted event carries the context envelope (apex domain in relatedEntities)',
    (c.eventLog.find(e => e.event.kind === 'senate-vote').event.context.relatedEntities || []).some(r => r.kind === 'domain'));

  // ALL-AGAINST (low rng): 12+10+8 = 30 against ≥ 26 → rejected after 3.
  const c2 = fixture();
  const rAg = ACKS.senateVote(c2, { senateId: 'sen-1', matter: 'invade-realm', rng: rngConst(0.01) });
  ok('all-against → rejected', rAg.approved === false && rAg.outcome === 'rejected' && rAg.againstVotes >= 26);

  // ALL-TREND (rng 0.5 → adjusted 8), no controlled independents → everyone abstains (nobody ahead yet).
  const c3 = fixture();
  const rTr = ACKS.senateVote(c3, { senateId: 'sen-1', matter: 'change-religion', rng: rngConst(0.5) });
  ok('all-trend, no lead → all abstain → no majority', rTr.outcome === 'no-majority' && rTr.forVotes === 0 && rTr.abstainVotes > 0);

  // controlled independents start FOR and count toward the majority (RR p.359 §4.7).
  const c4 = fixture();
  const rInd = ACKS.senateVote(c4, { senateId: 'sen-1', matter: 'change-taxes', controlledIndependentVotes: 9, rng: rngConst(0.99) });
  ok('controlled independents seed the FOR side', rInd.controlledIndependentVotes === 9 && rInd.forVotes >= 9);
  ok('controlled independents reach majority faster (2 senators)', rInd.rolls.length === 2, 'rolled ' + rInd.rolls.length);

  // bewitched senator auto-votes (no roll), regardless of a low rng.
  const c5 = fixture();
  c5.senatorships.find(s => s.id === 'snr-4').influenceModifiers = [{ kind: 'bewitched', value: 1 }];  // snr-4 has the most votes → first
  const rBew = ACKS.senateVote(c5, { senateId: 'sen-1', matter: 'change-taxes', rng: rngConst(0.01) });
  ok('bewitched senator auto-votes for, no roll', rBew.rolls[0].bewitched === true && rBew.rolls[0].vote === 'for' && rBew.rolls[0].roll === null);

  // by-faction shortcut: one roll per faction (2 factions), high rng → both for.
  const c6 = fixture();
  const rBF = ACKS.senateVote(c6, { senateId: 'sen-1', matter: 'change-taxes', mode: 'by-faction', rng: rngConst(0.99) });
  ok('by-faction → ≤ 2 rolls (one per faction), each a faction', rBF.rolls.length <= 2 && rBF.rolls[0].factionId && rBF.rolls[0].votes > 0);
  ok('by-faction → approved (both factions for)', rBF.approved === true);

  // senate-auto-vote OFF → GM narrates (no dice), gmOutcome recorded.
  const c7 = fixture();
  const rGm = ACKS.senateVote(c7, { senateId: 'sen-1', matter: 'change-taxes', autoRoll: false, gmOutcome: 'approved' });
  ok('rule OFF → no dice, GM outcome recorded', rGm.autoRolled === false && rGm.rolls.length === 0 && rGm.approved === true);
  const rGm2 = ACKS.senateVote(fixture(), { senateId: 'sen-1', autoRoll: false, gmOutcome: 'rejected' });
  ok('rule OFF, gmOutcome rejected → rejected', rGm2.approved === false && rGm2.outcome === 'rejected');

  ok('senateVote on a missing senate → null', ACKS.senateVote(fixture(), { senateId: 'sen-none' }) === null);
  // emit:false suppresses the record (a pure preview)
  const c8 = fixture();
  ACKS.senateVote(c8, { senateId: 'sen-1', rng: rngConst(0.99), emit: false });
  ok('emit:false → no event logged', !(c8.eventLog || []).some(e => e.event && e.event.kind === 'senate-vote'));
})();

section('P-2 — senateBenefits (the structured read, RR p.355)');
(function(){
  const c = fixture();
  const b = ACKS.senateBenefits(c, c.domains[0]);
  ok('benefits active on a senatorial realm', b.active === true && b.isSenatorial === true && b.inDispute === false);
  ok('benefit values: +1 morale, vassal loyalty 0, free first duty, free militia',
    b.benefits.moraleBonus === 1 && b.benefits.vassalBaseLoyalty === 0 && b.benefits.freeFirstExtraDuty === true && b.benefits.freeMilitiaLevy === true);
  // dispute suspends the benefits
  c.senates[0].dispute = { defiedTopic: 'change-taxes', sinceTurn: 1, attempts: 1 };
  const bd = ACKS.senateBenefits(c, c.domains[0]);
  ok('dispute → inactive, +0 morale, vassal loyalty −2', bd.active === false && bd.inDispute === true && bd.benefits.moraleBonus === 0 && bd.benefits.vassalBaseLoyalty === -2);
})();

section('P-2 — disputes (set/clear, RR p.359)');
(function(){
  const c = fixture();
  const s = ACKS.setSenateDispute(c, 'sen-1', { topic: 'change-taxes', turn: 5 });
  ok('setSenateDispute sets dispute + status in-dispute', s.dispute && s.dispute.defiedTopic === 'change-taxes' && s.status === 'in-dispute');
  ok('setSenateDispute records sinceTurn + attempts=1 + history', s.dispute.sinceTurn === 5 && s.dispute.attempts === 1 && s.history.some(h => h.type === 'dispute'));
  ok('dispute suspends benefits (the §5.1 guard)', ACKS.senateBenefitsActive(c, c.domains[0]) === false);
  // a fresh defiance bumps attempts, keeps sinceTurn
  const s2 = ACKS.setSenateDispute(c, 'sen-1', { topic: 'invade-realm', turn: 7 });
  ok('re-defiance bumps attempts (2), keeps sinceTurn (5)', s2.dispute.attempts === 2 && s2.dispute.sinceTurn === 5);
  const cl = ACKS.clearSenateDispute(c, 'sen-1', { turn: 9, resolution: 'approved' });
  ok('clearSenateDispute clears dispute + status active', cl.dispute === null && cl.status === 'active');
  ok('benefits restored after clear', ACKS.senateBenefitsActive(c, c.domains[0]) === true);
  ok('clear on a non-disputed senate → no-op (no throw)', ACKS.clearSenateDispute(c, 'sen-1', {}) === cl);
})();

section('P-2 — enactPolicy (the restriction → dispute gate, RR p.359)');
(function(){
  // a restricted matter enacted WITHOUT approval → dispute
  const c = fixture();
  const r1 = ACKS.enactPolicy(c, { senateId: 'sen-1', matter: 'change-taxes', consulted: false });
  ok('restricted + not consulted → defied + disputed', r1.outcome === 'defied' && r1.disputed === true);
  ok('the realm is in dispute after defiance', ACKS.findSenate(c, 'sen-1').dispute != null);
  ok('a policy-enacted event was emitted', (c.eventLog || []).some(e => e.event && e.event.kind === 'policy-enacted'));
  // a restricted matter consulted + approved → enacted cleanly (no new dispute)
  const c2 = fixture();
  const r2 = ACKS.enactPolicy(c2, { senateId: 'sen-1', matter: 'change-taxes', consulted: true, approved: true });
  ok('restricted + approved → enacted, no dispute', r2.outcome === 'enacted' && r2.disputed === false && ACKS.findSenate(c2, 'sen-1').dispute == null);
  // an unrestricted matter → always clean
  const c3 = fixture();
  const r3 = ACKS.enactPolicy(c3, { senateId: 'sen-1', matter: 'throw-a-feast', consulted: false });
  ok('unrestricted matter → enacted, never disputed', r3.outcome === 'enacted' && r3.disputed === false);
  // a retroactive-approval enactment clears an existing dispute
  const c4 = fixture();
  ACKS.setSenateDispute(c4, 'sen-1', { topic: 'change-taxes', turn: 1 });
  const r4 = ACKS.enactPolicy(c4, { senateId: 'sen-1', matter: 'change-taxes', consulted: true, approved: true });
  ok('retroactive approval clears the dispute', r4.cleared === true && r4.outcome === 'dispute-cleared' && ACKS.findSenate(c4, 'sen-1').dispute == null);
})();

section('P-2 — F&D Office → senate-seat hook (Phase_4_Politics_Plan.md §10)');
(function(){
  // a complete senatorial realm with one vassalage
  function realmFixture(governanceMode){
    return {
      currentTurn: 5, eventLog: [],
      domains: [
        { id: 'dom-apex', name: 'Aura', liegeId: null, rulerCharacterId: 'chr-lord',
          demographics: { peasantFamilies: 100, urbanFamilies: 0 }, governance: { mode: governanceMode, senateId: 'sen-1' } },
        { id: 'dom-vassal', name: 'Tyros', liegeId: 'dom-apex', rulerCharacterId: 'chr-holder',
          demographics: { peasantFamilies: 80, urbanFamilies: 0 } }
      ],
      characters: [{ id: 'chr-lord', name: 'Consul' }, { id: 'chr-holder', name: 'Marshal' }],
      vassalages: [{ id: 'vas-1', status: 'active', vassalDomainId: 'dom-vassal', suzerainDomainId: 'dom-apex',
        suzerainCharacterId: 'chr-lord', vassalRulerCharacterId: 'chr-holder' }],
      senates: [ACKS.blankSenate({ id: 'sen-1', realmDomainId: 'dom-apex', seats: 15 })],
      factions: [], senatorships: [], favorDutyObligations: []
    };
  }
  // SENATORIAL: granting an Office favor auto-seats the holder as a leading senator
  const c = realmFixture('senatorial');
  const snap = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId: 'dom-vassal', kind: 'office', officeTitle: 'Knight Marshal' });
  ok('Office favor granted (the obligation exists)', !!snap && snap.obligation && snap.obligation.kind === 'office');
  const seat = c.senatorships.find(s => s.senatorCharacterId === 'chr-holder' && s.senateId === 'sen-1');
  ok('Office on a senatorial realm → a leading senatorship for the holder', !!seat && seat.rank === 'leading' && seat.status === 'active');
  ok('the seat is tagged with the source obligation (so revoke finds it)', seat && seat.sourceObligationId === snap.obligation.id);
  // direct unit-test of the hook: idempotent grant (no double-seat)
  ACKS.syncOfficeSenateSeat(c, snap.obligation, 'grant');
  ok('grant is idempotent (still one seat for the holder)', c.senatorships.filter(s => s.senatorCharacterId === 'chr-holder' && ACKS.senatorshipsForSenate(c, 'sen-1').includes(s)).length === 1);
  // revoking the Office vacates the seat
  ACKS.revokeFavorDutyEdict(c, snap.obligation.id);
  const vacated = c.senatorships.find(s => s.senatorCharacterId === 'chr-holder');
  ok('revoking the Office vacates the seat', vacated && vacated.status === 'vacated' && vacated.vacatedAtTurn != null);
  ok('the vacated seat drops from active senatorshipsForSenate', ACKS.senatorshipsForSenate(c, 'sen-1').length === 0);

  // FEUDAL: the Office favor behaves as shipped — no seat
  const cf = realmFixture('feudal');
  const snapF = ACKS.applyFavorDutyEdictByKind(cf, { vassalDomainId: 'dom-vassal', kind: 'office', officeTitle: 'Chamberlain' });
  ok('Office granted on a feudal realm', !!snapF && snapF.obligation.kind === 'office');
  ok('feudal realm → NO senate seat created (no-op)', cf.senatorships.length === 0);

  // a NON-office edict never touches the senate
  const cn = realmFixture('senatorial');
  ACKS.applyFavorDutyEdictByKind(cn, { vassalDomainId: 'dom-vassal', kind: 'gift', gpPerMonth: 0 });
  ok('a non-office edict creates no senatorship', cn.senatorships.length === 0);
})();

// =============================================================================
// P-3 — the influence-actions + dispute-lifecycle layer (burst8 2026-06-19).
// RR pp.358–359; survey §4.5–§4.7. Bribery (gp by income period) / intimidation +
// seduction (the shipped Layer-1 proficiency throw) / the −5 escaped-or-ill-treated
// turn / reveal-on-a-natural-2 / gifts converting the independent bloc; and the
// dispute extensions (resolve-by-consult → clear|escalate, abandon, re-establish).
// =============================================================================

section('P-3 — events + exports registered');
(function(){
  ok('senate-influenced + senate-dispute-opened in EVENT_KINDS', ACKS.EVENT_KINDS.includes('senate-influenced') && ACKS.EVENT_KINDS.includes('senate-dispute-opened'));
  ok('both have schemas', !!ACKS.EVENT_SCHEMAS['senate-influenced'] && !!ACKS.EVENT_SCHEMAS['senate-dispute-opened']);
  ok('both are Wizard-opt-out (engine-owned)', !ACKS.isWizardEmittable('senate-influenced') && !ACKS.isWizardEmittable('senate-dispute-opened'));
  for(const fn of ['bribeSenator','intimidateSenator','seduceSenator','flipSocialInfluence','applyInfluenceReveals',
    'giftIndependentSenators','controlledIndependentVotesFor','resolveDisputeByConsult','abandonSenatorialGovernment',
    'canReestablishSenate','reestablishSenate']){
    ok('export ' + fn, typeof ACKS[fn] === 'function');
  }
  // the new senate state is init-on-write — NOT on the factory (the burst3 discipline)
  const blank = ACKS.blankSenate({});
  ok('blankSenate does NOT gain independentGifts / reestablishCooldownUntilTurn (init-on-write)',
    !('independentGifts' in blank) && !('reestablishCooldownUntilTurn' in blank) && !('dissolvedAtTurn' in blank));
})();

// a fixture senatorship carrying a real bribe-cost row (RR p.357, level-3) + a briber with coins
function inflFixture(){
  const c = fixture();
  c.currentTurn = 5;
  c.eventLog = [];
  // the top senator (snr-4, 12 votes) gets a populated bribe-cost row
  c.senatorships.find(s => s.id === 'snr-4').bribeCostByPeriod = { day: 4, week: 25, month: 100, year: 1200 };
  // a proficient briber (Bribery) + a CHA-13 social actor with Intimidation + Seduction, both with coins
  c.characters.push({ id: 'chr-briber', name: 'Briber', abilities: { CHA: 13 }, coins: { gp: 5000 },
    proficiencies: ['Bribery'] });
  c.characters.push({ id: 'chr-social', name: 'Social', abilities: { CHA: 13 }, coins: { gp: 100 },
    proficiencies: ['Intimidation', 'Seduction'] });
  c.characters.push({ id: 'chr-plain', name: 'Plain', abilities: { CHA: 13 } });   // no social proficiencies
  return c;
}

section('P-3 — bribery (gp by income period; Bribery prof shifts the rate, RR p.358)');
(function(){
  // proficient: +1=day(4) / +2=week(25) / +3=month(100)
  const c = inflFixture();
  const r1 = ACKS.bribeSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-briber', value: 1 });
  ok('proficient +1 → period day, gp 4', r1.ok && r1.value === 1 && r1.period === 'day' && r1.gp === 4 && r1.proficient === true);
  ok('the standing bribe modifier landed on the senatorship (+1)', ACKS.findSenatorship(c, 'snr-4').influenceModifiers.some(m => m.kind === 'bribe' && m.value === 1));
  ok('coins debited (5000 → 4996)', c.characters.find(x => x.id === 'chr-briber').coins.gp === 4996 && r1.paid === true);
  ok('a senate-influenced event was emitted', (c.eventLog || []).some(e => e.event && e.event.kind === 'senate-influenced'));
  // re-bribe REPLACES (no stacking): +3 → period month, gp 100
  const r3 = ACKS.bribeSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-briber', value: 3 });
  ok('proficient +3 → period month, gp 100', r3.period === 'month' && r3.gp === 100);
  const bribes = ACKS.findSenatorship(c, 'snr-4').influenceModifiers.filter(m => m.kind === 'bribe');
  ok('re-bribe replaces (one bribe modifier, now +3)', bribes.length === 1 && bribes[0].value === 3);
  // the bribe is READ by the P-2 voting modifier stack
  const ctx = { rulerId: 'chr-r', domainMorale: 0, hasDiplomacy: true, policyHelps: [], policyHinders: [], militaryLoyalty: 'none', controlledIndependentVotes: 0 };
  const mods = ACKS.senatorVoteModifiers(c, c.senates[0], ACKS.findSenatorship(c, 'snr-4'), ctx, {}, false);
  ok('senatorVoteModifiers reads the bribe (+3 row)', mods.modifiers.some(x => x.label === 'bribe' && x.value === 3));
  // non-proficient: +1=week(25) / +2=month(100) / +3=year(1200)
  const c2 = inflFixture();
  const rn = ACKS.bribeSenator(c2, { senatorshipId: 'snr-4', byCharacterId: 'chr-plain', value: 1 });
  ok('non-proficient +1 → period week, gp 25', rn.proficient === false && rn.period === 'week' && rn.gp === 25);
  ok('non-proficient +3 → year (1200)', ACKS.bribeSenator(inflFixture(), { senatorshipId: 'snr-4', byCharacterId: 'chr-plain', value: 3 }).gp === 1200);
  // rival bribe → negative mirror ('rival-bribe', −value)
  const c3 = inflFixture();
  const rr = ACKS.bribeSenator(c3, { senatorshipId: 'snr-4', byCharacterId: 'chr-briber', value: 2, byRival: true });
  ok('rival bribe → kind rival-bribe, value −2', rr.value === -2 && ACKS.findSenatorship(c3, 'snr-4').influenceModifiers.some(m => m.kind === 'rival-bribe' && m.value === -2));
  // insufficient coins → modifier still lands, paid:false
  const c4 = inflFixture();
  c4.characters.find(x => x.id === 'chr-briber').coins.gp = 0;
  const rp = ACKS.bribeSenator(c4, { senatorshipId: 'snr-4', byCharacterId: 'chr-briber', value: 1 });
  ok('insufficient coins → paid:false but the modifier lands', rp.paid === false && ACKS.findSenatorship(c4, 'snr-4').influenceModifiers.some(m => m.kind === 'bribe'));
  ok('bribe on a missing senatorship → ok:false', ACKS.bribeSenator(inflFixture(), { senatorshipId: 'snr-none' }).ok === false);
})();

section('P-3 — intimidation + seduction (the shipped Layer-1 proficiency throw, RR p.358/p.359)');
(function(){
  // gates: no proficiency → refused
  const c = inflFixture();
  ok('intimidate without the prof → lacks-intimidation', ACKS.intimidateSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-plain', outranks: true }).reason === 'lacks-intimidation');
  ok('seduce without the prof → lacks-seduction', ACKS.seduceSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-plain', attracted: true }).reason === 'lacks-seduction');
  // intimidate requires grossly out-ranking/out-numbering
  ok('intimidate without outrank → requires-outrank', ACKS.intimidateSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-social' }).reason === 'requires-outrank');
  // seduce requires an attracted senator
  ok('seduce without attraction → requires-attraction', ACKS.seduceSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-social' }).reason === 'requires-attraction');
  // success via the throw (nat-20, proficient auto-success) → +1 'intimidated' modifier
  const cS = inflFixture();
  const ri = ACKS.intimidateSenator(cS, { senatorshipId: 'snr-4', byCharacterId: 'chr-social', outranks: true, credibleThreat: true, rng: rngConst(0.99) });
  ok('intimidate success → +1 intimidated modifier', ri.ok && ri.success === true && ACKS.findSenatorship(cS, 'snr-4').influenceModifiers.some(m => m.kind === 'intimidated' && m.value === 1));
  ok('the throw used the Layer-1 die (natural 20)', ri.throw && ri.throw.natural === 20 && ri.throw.die === 'd20');
  // failure (nat-1 botch) → no modifier
  const cF = inflFixture();
  const rf = ACKS.intimidateSenator(cF, { senatorshipId: 'snr-4', byCharacterId: 'chr-social', outranks: true, rng: rngConst(0.01) });
  ok('intimidate fail (nat-1) → no modifier', rf.success === false && !ACKS.findSenatorship(cF, 'snr-4').influenceModifiers.some(m => m.kind === 'intimidated'));
  // the throw is target 11 + CHA mod (chr-social CHA 13 → +1): natural 11 (rng .5) +1 = 12 ≥ 11 → success
  const cM = inflFixture();
  const rm = ACKS.intimidateSenator(cM, { senatorshipId: 'snr-4', byCharacterId: 'chr-social', outranks: true, rng: rngConst(0.5) });
  ok('throw is target 11 + CHA mod → nat 11 + 1 = 12 success', rm.success === true && rm.throw.target === 11 && rm.throw.modifiers.some(x => x.label === 'CHA' && x.value === 1));
  // autoSucceed skips the die (the pure-RAW conditional reading)
  const cA = inflFixture();
  const ra = ACKS.seduceSenator(cA, { senatorshipId: 'snr-4', byCharacterId: 'chr-social', attracted: true, autoSucceed: true });
  ok('seduce autoSucceed → success, no throw', ra.success === true && ra.throw === null && ACKS.findSenatorship(cA, 'snr-4').influenceModifiers.some(m => m.kind === 'seduced' && m.value === 1));
})();

section('P-3 — the −5 escaped/ill-treated turn (RR p.358)');
(function(){
  const c = inflFixture();
  ACKS.intimidateSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-social', outranks: true, autoSucceed: true });
  const f = ACKS.flipSocialInfluence(c, { senatorshipId: 'snr-4', kind: 'intimidated', byCharacterId: 'chr-social' });
  ok('flip intimidated → intimidated-escaped, value −5', f.ok && f.modifier.kind === 'intimidated-escaped' && f.modifier.value === -5);
  const im = ACKS.findSenatorship(c, 'snr-4').influenceModifiers;
  ok('the +1 is replaced by the −5 (no lingering intimidated)', !im.some(m => m.kind === 'intimidated') && im.some(m => m.kind === 'intimidated-escaped' && m.value === -5));
  // the vote stack reads the −5
  const ctx = { rulerId: 'chr-r', domainMorale: 0, hasDiplomacy: true, policyHelps: [], policyHinders: [], militaryLoyalty: 'none' };
  ok('senatorVoteModifiers reads the −5', ACKS.senatorVoteModifiers(c, c.senates[0], ACKS.findSenatorship(c, 'snr-4'), ctx, {}, false).modifiers.some(x => x.value === -5));
  // a flip with no prior modifier still creates the −5 (the GM asserts prior dominance)
  const c2 = inflFixture();
  const f2 = ACKS.flipSocialInfluence(c2, { senatorshipId: 'snr-2', kind: 'seduced' });
  ok('flip with no prior → creates seduced-ill-treated −5', f2.modifier.kind === 'seduced-ill-treated' && f2.modifier.value === -5);
})();

section('P-3 — reveal on an unmodified 2 (RR p.358–359)');
(function(){
  const c = inflFixture();
  // bribe the top senator (snr-4, 12 votes — rolls first) then run an all-natural-2 vote
  ACKS.bribeSenator(c, { senatorshipId: 'snr-4', byCharacterId: 'chr-briber', value: 1 });
  ok('the bribed senator starts secret', ACKS.findSenatorship(c, 'snr-4').isSecretInfluence === true);
  const vote = ACKS.senateVote(c, { senateId: 'sen-1', matter: 'change-taxes', rng: rngConst(0.01), emit: false });
  const rev = ACKS.applyInfluenceReveals(c, vote, { rulerCharacterId: 'chr-r' });
  ok('the bribed senator who rolled a natural 2 is revealed', rev.revealed.includes('snr-4') && ACKS.findSenatorship(c, 'snr-4').isSecretInfluence === false);
  ok('the ruler is now implicated in bribery', c.characters.find(x => x.id === 'chr-r').implicatedInBribery === true);
  // a senator with NO secret influence rolling a 2 is not "revealed"
  ok('a clean senator rolling a 2 is not flagged', !rev.revealed.includes('snr-1'));
})();

section('P-3 — gifts → directing independent minor senators (RR p.359 §4.7)');
(function(){
  // fixture senate has independentMinorSenatorVotes 9
  const c = inflFixture();
  const g = ACKS.giftIndependentSenators(c, { senateId: 'sen-1', byCharacterId: 'chr-briber', votes: 6, reactionBonus: 3, gp: 500 });
  ok('+3 reaction gift qualifies, directs 6 votes', g.ok && g.qualifies === true && g.controlled === 6);
  ok('the gift ledger is init-on-write on the senate', Array.isArray(c.senates[0].independentGifts) && c.senates[0].independentGifts.length === 1);
  ok('controlledIndependentVotesFor reads it', ACKS.controlledIndependentVotesFor(c, c.senates[0], 'chr-briber', 5) === 6);
  ok('gift gp debited', c.characters.find(x => x.id === 'chr-briber').coins.gp === 4500 && g.paid === true);
  // requested over the pool → capped at 9
  const c2 = inflFixture();
  ok('gift capped at the independent pool (9)', ACKS.giftIndependentSenators(c2, { senateId: 'sen-1', byCharacterId: 'chr-briber', votes: 20, reactionBonus: 3 }).controlled === 9);
  // +1 reaction needs Friendly
  const c3 = inflFixture();
  ok('+1 reaction, not friendly → does not qualify (0 controlled)', ACKS.giftIndependentSenators(c3, { senateId: 'sen-1', byCharacterId: 'chr-briber', votes: 5, reactionBonus: 1, friendly: false }).controlled === 0);
  ok('+1 reaction AND friendly → qualifies', ACKS.giftIndependentSenators(inflFixture(), { senateId: 'sen-1', byCharacterId: 'chr-briber', votes: 5, reactionBonus: 1, friendly: true }).qualifies === true);
  // competing givers: the larger gift wins control of the contested bloc
  const c4 = inflFixture();
  ACKS.giftIndependentSenators(c4, { senateId: 'sen-1', byCharacterId: 'chr-briber', votes: 9, reactionBonus: 3, gp: 200 });
  ACKS.giftIndependentSenators(c4, { senateId: 'sen-1', byCharacterId: 'chr-r', votes: 9, reactionBonus: 3, gp: 800 });
  ok('competing givers → the larger gift (chr-r, 800gp) wins', ACKS.controlledIndependentVotesFor(c4, c4.senates[0], 'chr-r', 5) === 9 && ACKS.controlledIndependentVotesFor(c4, c4.senates[0], 'chr-briber', 5) === 0);
})();

section('P-3 — dispute: resolve-by-consult (clear vs escalate, RR p.359)');
(function(){
  // CLEAR: an existing dispute + an all-FOR retroactive consult → cleared
  const c = inflFixture();
  ACKS.setSenateDispute(c, 'sen-1', { topic: 'change-taxes', turn: 5 });
  const rc = ACKS.resolveDisputeByConsult(c, { senateId: 'sen-1', rulerCharacterId: 'chr-r', rng: rngConst(0.99) });
  ok('all-FOR retroactive consult → cleared', rc.outcome === 'cleared' && ACKS.findSenate(c, 'sen-1').dispute == null);
  ok('benefits restored after a cleared dispute', ACKS.senateBenefitsActive(c, c.domains[0]) === true);
  ok('a senate-vote + a senate-dispute-opened(cleared) event were emitted', (c.eventLog || []).some(e => e.event.kind === 'senate-vote') && (c.eventLog || []).some(e => e.event.kind === 'senate-dispute-opened' && e.event.payload.action === 'cleared'));
  // ESCALATE: an all-AGAINST retroactive consult → dispute deepens + against-voters gain 'replace-ruler'
  const c2 = inflFixture();
  ACKS.setSenateDispute(c2, 'sen-1', { topic: 'change-taxes', turn: 5 });
  const re = ACKS.resolveDisputeByConsult(c2, { senateId: 'sen-1', rulerCharacterId: 'chr-r', rng: rngConst(0.01) });
  ok('all-AGAINST retroactive consult → escalated', re.outcome === 'escalated' && ACKS.findSenate(c2, 'sen-1').dispute != null);
  ok('attempts bumped to 2', ACKS.findSenate(c2, 'sen-1').dispute.attempts === 2);
  ok('against-voters gained the replace-ruler objective', re.replaceRulerSenatorships.length > 0
    && re.replaceRulerSenatorships.every(id => ACKS.findSenatorship(c2, id).policyObjectives.includes('replace-ruler')));
  // no dispute → no-op
  ok('resolve on a non-disputed senate → no-dispute', ACKS.resolveDisputeByConsult(inflFixture(), { senateId: 'sen-1' }).outcome === 'no-dispute');
})();

section('P-3 — dispute: abandon government + re-establish (RR p.359)');
(function(){
  const c = inflFixture();
  // make snr-4 an influential replace-ruler senator (so abandon turns him Hostile)
  ACKS.findSenatorship(c, 'snr-4').policyObjectives = ['replace-ruler'];
  // a henchman senator of the ruler (so the penalty list catches him)
  c.characters.push({ id: 'chr-hench', socialTier: 'henchman', liegeCharacterId: 'chr-r' });
  c.senatorships.push(ACKS.blankSenatorship({ id: 'snr-h', senatorCharacterId: 'chr-hench', senateId: 'sen-1', factionId: 'fac-a', votes: 3 }));
  const ab = ACKS.abandonSenatorialGovernment(c, { senateId: 'sen-1', rulerCharacterId: 'chr-r', turn: 5, rng: rngConst(0.5) });
  ok('abandon → senate dissolved', ab.outcome === 'abandoned' && ACKS.findSenate(c, 'sen-1').status === 'dissolved');
  ok('penalties surfaced: morale −2, henchman/vassal loyalty −2', ab.penalties.personalDomainMoraleNextAt === -2 && ab.penalties.henchmanSenatorLoyaltyAt === -2 && ab.penalties.vassalLoyaltyAt === -2);
  ok('the replace-ruler senator turns Hostile (attitude 2)', ab.penalties.hostileSenators.some(h => h.senatorshipId === 'snr-4') && ACKS.findSenatorship(c, 'snr-4').attitudeTowardRuler === 2);
  ok('the henchman senator is listed in the loyalty penalty', ab.penalties.henchmanSenators.includes('chr-hench'));
  ok('2d6-month re-establish cooldown set (turn 5 + 8 = 13)', ACKS.findSenate(c, 'sen-1').reestablishCooldownUntilTurn === 13);
  ok('a senate-dispute-opened(abandoned) event was emitted', (c.eventLog || []).some(e => e.event.kind === 'senate-dispute-opened' && e.event.payload.action === 'abandoned'));
  // a dissolved senate drops from the dormant-until-used presence + cannot re-establish during cooldown
  ok('canReestablishSenate false during cooldown (turn 10)', ACKS.canReestablishSenate(c, ACKS.findSenate(c, 'sen-1'), 10) === false);
  ok('reestablish refused during cooldown', ACKS.reestablishSenate(c, { senateId: 'sen-1', turn: 10 }).reason === 'cooldown');
  ok('canReestablishSenate true after cooldown (turn 13)', ACKS.canReestablishSenate(c, ACKS.findSenate(c, 'sen-1'), 13) === true);
  const rr = ACKS.reestablishSenate(c, { senateId: 'sen-1', turn: 13, rng: rngConst(0.5) });
  ok('reestablish after the cooldown → active + a fresh honeymoon', rr.ok === true && ACKS.findSenate(c, 'sen-1').status === 'active' && ACKS.findSenate(c, 'sen-1').honeymoonUntilTurn === 17);
})();

// =============================================================================
section('P-5 — motion layer: events + exports registered (burst9)');
// =============================================================================
ok('EVENT_KINDS has senate-motion-opened', ACKS.EVENT_KINDS.indexOf('senate-motion-opened') >= 0);
ok('EVENT_KINDS has senate-motion-resolved', ACKS.EVENT_KINDS.indexOf('senate-motion-resolved') >= 0);
ok('EVENT_SCHEMAS has both motion kinds', !!(ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS['senate-motion-opened'] && ACKS.EVENT_SCHEMAS['senate-motion-resolved']));
for(const fn of ['blankSenateMotion','openSenateMotion','previewSenateMotionVote','resolveSenateMotion','withdrawSenateMotion','senateMotionsForSenate','findSenateMotion','senateInHoneymoon']){
  ok('export ' + fn, typeof ACKS[fn] === 'function');
}
ok('SENATE_MOTION_KINDS = [policy, edict, dispute]', JSON.stringify(ACKS.SENATE_MOTION_KINDS) === JSON.stringify(['policy','edict','dispute']));

// =============================================================================
section('P-5 — blankSenateMotion + the no-factory-drift guard');
// =============================================================================
(function(){
  const m = ACKS.blankSenateMotion({ id:'x-m1', senateId:'sen-1', kind:'edict', matter:'change-taxes', title:'T' });
  ok('keeps opts + defaults', m.id==='x-m1' && m.kind==='edict' && m.matter==='change-taxes' && m.status==='open' && m.outcome===null && m.voteResult===null);
  ok('arrays fresh', Array.isArray(m.policyHelps) && Array.isArray(m.revealedSenatorshipIds) && Array.isArray(m.history));
  ok('unknown kind → edict', ACKS.blankSenateMotion({ kind:'bogus' }).kind === 'edict');
  // the load-bearing guard: a motion is a SUB-RECORD, NOT on blankSenate (so the schema⊆factory +
  // migrate-no-op invariants are untouched — motions are never lazy-injected into migrateCampaign).
  const sen = ACKS.blankSenate({});
  ok('blankSenate does NOT carry motions / _motionSeq', !('motions' in sen) && !('_motionSeq' in sen));
})();

// =============================================================================
section('P-5 — openSenateMotion (table it; init-on-write; event)');
// =============================================================================
(function(){
  const c = fixture();
  const m = ACKS.openSenateMotion(c, { senateId:'sen-1', kind:'edict', matter:'change-taxes', title:'Raise the salt tax' });
  ok('mints a senate-scoped, prefix-free id', m.id === 'sen-1-m1');
  ok('status open + restricted stamped + openedAtTurn', m.status==='open' && m.restricted===true && m.openedAtTurn===(c.currentTurn||1));
  ok('motions[] init-on-write on the senate', Array.isArray(c.senates[0].motions) && c.senates[0].motions.length===1 && c.senates[0]._motionSeq===1);
  ok('senate-motion-opened emitted', (c.eventLog||[]).some(e=>e.event && e.event.kind==='senate-motion-opened'));
  // a second motion increments the seq; a policy motion is unrestricted
  const m2 = ACKS.openSenateMotion(c, { senateId:'sen-1', kind:'policy', policyObjective:'make-peace' });
  ok('second motion → -m2, restricted=false (policy)', m2.id==='sen-1-m2' && m2.restricted===false);
  ok('lookups (find + all + openOnly)', ACKS.findSenateMotion(c,'sen-1','sen-1-m2').id==='sen-1-m2'
    && ACKS.senateMotionsForSenate(c,'sen-1').length===2 && ACKS.senateMotionsForSenate(c,'sen-1',{openOnly:true}).length===2);
  ok('openSenateMotion on a missing senate → null', ACKS.openSenateMotion(c, { senateId:'sen-none' }) === null);
})();

// =============================================================================
section('P-5 — previewSenateMotionVote (pure; reuses senateVote)');
// =============================================================================
(function(){
  const c = fixture();
  const m = ACKS.openSenateMotion(c, { senateId:'sen-1', kind:'edict', matter:'change-taxes' });
  const before = (c.eventLog||[]).length;
  const v = ACKS.previewSenateMotionVote(c, { senateId:'sen-1', motionId:m.id, rng: rngConst(0.99) });
  ok('preview returns a tally (approved on high rng)', v && v.outcome==='approved' && v.forVotes >= v.majorityThreshold);
  ok('preview is PURE (no event, motion untouched)', (c.eventLog||[]).length===before && m.voteResult===null && m.status==='open');
  // an inline transient spec works too (the wizard's roll-before-open path)
  const v2 = ACKS.previewSenateMotionVote(c, { senateId:'sen-1', motion:{ kind:'edict', matter:'invade-realm', mode:'per-senator' }, rng: rngConst(0.01) });
  ok('preview on a transient spec → against', v2 && v2.outcome==='rejected');
  ok('preview on a missing senate → null', ACKS.previewSenateMotionVote(c, { senateId:'sen-none', motionId:m.id }) === null);
})();

// =============================================================================
section('P-5 — resolveSenateMotion (the terminal verb — enact / reject / defy)');
// =============================================================================
(function(){
  // edict approved → enacted (enactPolicy ran, no new dispute), event emitted, the SHOWN tally recorded
  const c = fixture();
  const m = ACKS.openSenateMotion(c, { senateId:'sen-1', kind:'edict', matter:'change-taxes' });
  const v = ACKS.previewSenateMotionVote(c, { senateId:'sen-1', motionId:m.id, rng: rngConst(0.99) });
  const r = ACKS.resolveSenateMotion(c, { senateId:'sen-1', motionId:m.id, voteResult:v, rulerCharacterId:'chr-r' });
  ok('edict approved → enacted', r.ok && r.motion.status==='enacted' && r.motion.outcome==='approved' && r.enact && r.enact.outcome==='enacted');
  ok('the SHOWN tally is recorded (no re-roll at commit)', r.motion.voteResult === v);
  ok('no dispute on a sanctioned enact', ACKS.findSenate(c,'sen-1').dispute == null);
  ok('senate-motion-resolved emitted with the context envelope', (c.eventLog||[]).some(e=>e.event && e.event.kind==='senate-motion-resolved'
    && (e.event.context.relatedEntities||[]).some(x=>x.kind==='domain')));
  ok('re-resolving a closed motion is guarded', ACKS.resolveSenateMotion(c, { senateId:'sen-1', motionId:m.id }).reason === 'not-open');

  // edict rejected + defy → defied + the realm in dispute
  const c2 = fixture();
  const m2 = ACKS.openSenateMotion(c2, { senateId:'sen-1', kind:'edict', matter:'invade-realm' });
  const v2 = ACKS.previewSenateMotionVote(c2, { senateId:'sen-1', motionId:m2.id, rng: rngConst(0.01) });
  const r2 = ACKS.resolveSenateMotion(c2, { senateId:'sen-1', motionId:m2.id, voteResult:v2, enactDespiteRejection:true, rulerCharacterId:'chr-r' });
  ok('rejected + defy → defied + dispute', r2.motion.status==='defied' && r2.motion.outcome==='rejected' && ACKS.findSenate(c2,'sen-1').dispute != null);

  // edict rejected, NOT defied → rejected, no dispute
  const c3 = fixture();
  const m3 = ACKS.openSenateMotion(c3, { senateId:'sen-1', kind:'edict', matter:'invade-realm' });
  const v3 = ACKS.previewSenateMotionVote(c3, { senateId:'sen-1', motionId:m3.id, rng: rngConst(0.01) });
  const r3 = ACKS.resolveSenateMotion(c3, { senateId:'sen-1', motionId:m3.id, voteResult:v3 });
  ok('rejected, no defy → rejected + no dispute', r3.motion.status==='rejected' && ACKS.findSenate(c3,'sen-1').dispute == null);

  // policy approved → enacted, objective recorded, never disputed (unrestricted)
  const c4 = fixture();
  const m4 = ACKS.openSenateMotion(c4, { senateId:'sen-1', kind:'policy', policyObjective:'make-peace' });
  const v4 = ACKS.previewSenateMotionVote(c4, { senateId:'sen-1', motionId:m4.id, rng: rngConst(0.99) });
  const r4 = ACKS.resolveSenateMotion(c4, { senateId:'sen-1', motionId:m4.id, voteResult:v4 });
  ok('policy approved → enacted + objective recorded + no dispute', r4.motion.status==='enacted' && r4.motion.policyObjective==='make-peace' && ACKS.findSenate(c4,'sen-1').dispute == null);

  // resolve rolls its OWN vote when none is passed (the headless / convenience path)
  const c5 = fixture();
  const m5 = ACKS.openSenateMotion(c5, { senateId:'sen-1', kind:'edict', matter:'change-taxes' });
  const r5 = ACKS.resolveSenateMotion(c5, { senateId:'sen-1', motionId:m5.id, rng: rngConst(0.99), rulerCharacterId:'chr-r' });
  ok('resolve without a passed voteResult rolls its own', r5.ok && r5.vote && r5.motion.voteResult && r5.motion.status==='enacted');

  // guards
  ok('resolve on a missing senate → no-senate', ACKS.resolveSenateMotion(fixture(), { senateId:'sen-none' }).reason==='no-senate');
  ok('resolve on a missing motion → no-motion', ACKS.resolveSenateMotion(fixture(), { senateId:'sen-1', motionId:'nope' }).reason==='no-motion');
})();

// =============================================================================
section('P-5 — dispute motions (clear vs escalate) + reveal-on-2');
// =============================================================================
(function(){
  // dispute approved → cleared + benefits restored
  const c = fixture();
  ACKS.setSenateDispute(c, 'sen-1', { topic:'change-taxes', turn:5 });
  const m = ACKS.openSenateMotion(c, { senateId:'sen-1', kind:'dispute' });
  const v = ACKS.previewSenateMotionVote(c, { senateId:'sen-1', motionId:m.id, rng: rngConst(0.99) });
  const r = ACKS.resolveSenateMotion(c, { senateId:'sen-1', motionId:m.id, voteResult:v, rulerCharacterId:'chr-r' });
  ok('dispute approved → cleared + benefits restored', r.motion.status==='dispute-cleared'
    && ACKS.findSenate(c,'sen-1').dispute == null && ACKS.senateBenefitsActive(c, c.domains[0])===true);

  // dispute rejected → escalates (attempts bumped + replace-ruler stamped on against-voters)
  const c2 = fixture();
  ACKS.setSenateDispute(c2, 'sen-1', { topic:'change-taxes', turn:5 });
  const before = ACKS.findSenate(c2,'sen-1').dispute.attempts;
  const m2 = ACKS.openSenateMotion(c2, { senateId:'sen-1', kind:'dispute' });
  const v2 = ACKS.previewSenateMotionVote(c2, { senateId:'sen-1', motionId:m2.id, rng: rngConst(0.01) });
  const r2 = ACKS.resolveSenateMotion(c2, { senateId:'sen-1', motionId:m2.id, voteResult:v2, rulerCharacterId:'chr-r' });
  ok('dispute rejected → escalated (attempts bumped)', r2.motion.status==='dispute-escalated' && ACKS.findSenate(c2,'sen-1').dispute.attempts === before+1);
  ok('escalate stamps replace-ruler on against-voters', r2.dispute.replaceRulerSenatorships.length > 0
    && ACKS.findSenatorship(c2, r2.dispute.replaceRulerSenatorships[0]).policyObjectives.indexOf('replace-ruler') >= 0);

  // reveal-on-an-unmodified-2: a secretly-bribed senator who rolls a natural 2 reveals it + implicates the ruler
  const c3 = fixture();
  c3.senatorships.find(s=>s.id==='snr-4').influenceModifiers = [{ kind:'bribe', value:3, byCharacterId:'chr-r' }];
  const m3 = ACKS.openSenateMotion(c3, { senateId:'sen-1', kind:'edict', matter:'change-taxes' });
  const v3 = ACKS.previewSenateMotionVote(c3, { senateId:'sen-1', motionId:m3.id, rng: rngConst(0.01) });   // natural 2
  const r3 = ACKS.resolveSenateMotion(c3, { senateId:'sen-1', motionId:m3.id, voteResult:v3, rulerCharacterId:'chr-r' });
  ok('reveal-on-2: bribed senator revealed + recorded on the motion + ruler implicated',
    r3.motion.revealedSenatorshipIds.indexOf('snr-4') >= 0
    && ACKS.findSenatorship(c3,'snr-4').isSecretInfluence === false
    && c3.characters.find(ch=>ch.id==='chr-r').implicatedInBribery === true);
})();

// =============================================================================
section('P-5 — withdraw + honeymoon');
// =============================================================================
(function(){
  const c = fixture();
  const m = ACKS.openSenateMotion(c, { senateId:'sen-1', kind:'edict', matter:'change-taxes' });
  const w = ACKS.withdrawSenateMotion(c, { senateId:'sen-1', motionId:m.id });
  ok('withdraw an open motion → withdrawn', w && w.status==='withdrawn');
  ok('resolve a withdrawn motion is guarded', ACKS.resolveSenateMotion(c, { senateId:'sen-1', motionId:m.id }).reason==='not-open');
  ok('withdraw a non-open motion → null', ACKS.withdrawSenateMotion(c, { senateId:'sen-1', motionId:m.id }) === null);
  ok('openOnly excludes the withdrawn', ACKS.senateMotionsForSenate(c,'sen-1',{openOnly:true}).length===0);
  // honeymoon (RR p.357 — all vote for the ruler)
  const c2 = fixture(); c2.senates[0].honeymoonUntilTurn = 8;
  ok('senateInHoneymoon true within the window (turn 5 ≤ 8)', ACKS.senateInHoneymoon(c2, c2.senates[0], 5) === true);
  ok('senateInHoneymoon false past the window (turn 9)', ACKS.senateInHoneymoon(c2, c2.senates[0], 9) === false);
  ok('no honeymoon field → false', ACKS.senateInHoneymoon(c, c.senates[0]) === false);
})();

// =============================================================================
section('Importer wiring (§8.9 mandate — senate collections are importable)');
// =============================================================================
// The importer's SIMPLE_ID_COLLECTIONS is now DERIVED from the §15.5 collection registry
// (index.html: window.ACKS.importableCollections()), so the §8.9 importer mandate is satisfied
// by registering each collection as importable — no edit to an index.html importer literal.
for(const name of ['senates','factions','senatorships']){
  ok("importer walks '" + name + "' (registered importable in the §15.5 collection registry)", ACKS.importableCollections().includes(name));
}

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
section('P-7 — Eldermoot vocabulary (scaffolding; the Dwarven seam)');
// =============================================================================
(function(){
  ok('SENATE_KINDS = [senate, eldermoot, council]', Array.isArray(ACKS.SENATE_KINDS)
    && ['senate','eldermoot','council'].every(k => ACKS.SENATE_KINDS.includes(k)));
  ok('blankSenate accepts kind:eldermoot', ACKS.blankSenate({ kind:'eldermoot' }).kind === 'eldermoot');
  ok('isEldermoot true for an eldermoot / false for a senate', ACKS.isEldermoot({ kind:'eldermoot' }) === true && ACKS.isEldermoot({ kind:'senate' }) === false);
  ok('senateKindLabel: Senate / Eldermoot / Council', ACKS.senateKindLabel({kind:'senate'}) === 'Senate'
    && ACKS.senateKindLabel({kind:'eldermoot'}) === 'Eldermoot' && ACKS.senateKindLabel({kind:'council'}) === 'Council');
  ok('senateKindLabel defaults to Senate', ACKS.senateKindLabel(null) === 'Senate' && ACKS.senateKindLabel({}) === 'Senate');
  // an eldermoot IS a senate — shares the entities + the 2d6 voting (OQ4). Quick end-to-end via senateVote.
  const c = { currentTurn:1, domains:[{ id:'dom-apex', liegeId:null, governance:{ mode:'senatorial', senateId:'sen-e' } }],
    senates:[ACKS.blankSenate({ id:'sen-e', kind:'eldermoot', realmDomainId:'dom-apex', name:'The Eldermoot', independentMinorSenatorVotes:1 })],
    factions:[], senatorships:[ACKS.blankSenatorship({ id:'snr-1', senateId:'sen-e', senatorCharacterId:'chr-1', votes:3 })],
    characters:[{ id:'chr-1', abilities:{CHA:13} }], eventLog:[] };
  const v = ACKS.senateVote(c, { senateId:'sen-e', matter:'a clan matter', autoRoll:false, gmOutcome:'approved', emit:false });
  ok('senateVote runs on an eldermoot (shared voting machinery)', !!v && v.approved === true);
})();

// =============================================================================
section('P-7 — rule-of-the-few gate + the oligarchy verbs (JJ pp.402–404; survey §5)');
// =============================================================================
ok('rule-of-the-few registered, category domain', (function(){ const r = ACKS.lookupHouseRule('rule-of-the-few'); return !!r && r.category === 'domain'; })());
ok('rule-of-the-few default OFF (no default field; absent ⇒ off)', (ACKS.lookupHouseRule('rule-of-the-few')||{}).default !== true
  && ACKS.isHouseRuleEnabled({ houseRules:{} }, 'rule-of-the-few') === false);
ok('RULE_OF_THE_FEW const = "rule-of-the-few"', ACKS.RULE_OF_THE_FEW === 'rule-of-the-few');
ok('OLIGARCHY_DECISION_RULES = [majority, unanimous, weighted]', Array.isArray(ACKS.OLIGARCHY_DECISION_RULES)
  && ['majority','unanimous','weighted'].every(k => ACKS.OLIGARCHY_DECISION_RULES.includes(k)));
ok('computePersonalAuthority(5,600) = 0 (the shipped RR p.350 bracket)', ACKS.computePersonalAuthority(5, 600) === 0);

function oligFix(opts){
  opts = opts || {};
  return { currentTurn: 5, houseRules: opts.ruleOff ? {} : { 'rule-of-the-few': { enabled:true } },
    domains: [{ id:'dom-apex', name:'Aristia', liegeId:null, rulerCharacterId:'chr-1' }],
    characters: [
      { id:'chr-1', name:'Aldermane', abilities:{CHA:16}, level:9, alignment:'Lawful', proficiencies:[{key:'leadership'}] },
      { id:'chr-2', name:'Bryce',     abilities:{CHA:13}, level:7, alignment:'Lawful' },
      { id:'chr-3', name:'Caine',     abilities:{CHA:9},  level:5, alignment:'Neutral' },
      { id:'h1', name:'Henrik', socialTier:'henchman', liegeCharacterId:'chr-2' }
    ], hexes:[{ id:'hex-1', domainId:'dom-apex' }], eventLog:[] };
}

// — the gate: every verb refuses + writes nothing when the rule is OFF (principle 8) —
(function(){
  const c = oligFix({ ruleOff:true });
  ok('establishOligarchy refused when rule OFF', ACKS.establishOligarchy(c, { domainId:'dom-apex', oligarchCharacterIds:['chr-1'] }).reason === 'rule-off');
  ok('resolveOligarchyDecision refused when rule OFF', ACKS.resolveOligarchyDecision(c, { domainId:'dom-apex' }).reason === 'rule-off');
  ok('secedeFromOligarchy refused when rule OFF', ACKS.secedeFromOligarchy(c, { domainId:'dom-apex', oligarchCharacterId:'chr-1' }).reason === 'rule-off');
  ok('dissolveOligarchy refused when rule OFF', ACKS.dissolveOligarchy(c, { domainId:'dom-apex' }).reason === 'rule-off');
  ok('rule OFF wrote NOTHING (mode stays feudal, no event)', ACKS.governanceFor(c, c.domains[0]).mode === 'feudal' && c.eventLog.length === 0);
})();

// — establish + the derived collective ruler incl. Personal Authority (survey §5.1) —
(function(){
  const c = oligFix();
  const e = ACKS.establishOligarchy(c, { domainId:'dom-apex', oligarchCharacterIds:['chr-1','chr-2','chr-3'], decisionRule:'majority' });
  ok('establishOligarchy ok (3 members)', e.ok === true && e.memberCount === 3);
  ok('establish sets the apex mode oligarchic', ACKS.governanceFor(c, c.domains[0]).mode === 'oligarchic');
  ok('establish records governanceHistory (init-on-write)', Array.isArray(c.domains[0].governanceHistory) && c.domains[0].governanceHistory.some(h => h.type === 'oligarchy-established'));
  ok('establish emitted oligarchy-established', c.eventLog.some(x => x.event && x.event.kind === 'oligarchy-established'));
  ok('establish refuses with no members', ACKS.establishOligarchy(oligFix(), { domainId:'dom-apex', oligarchCharacterIds:[] }).reason === 'no-members');

  const st = ACKS.oligarchyDerivedStats(c, c.domains[0]);
  ok('derived memberCount 3', st.memberCount === 3);
  ok('derived CHA = round((+2 +1 Leadership)+(+1)+(0))/3 = 1 (survey §5.1)', st.cha === 1);
  ok('derived level = avg(9,7,5) = 7', st.level === 7);
  ok('derived alignment = Lawful (≥⅔ lawful, survey §5.1)', st.alignment === 'Lawful');
  ok('derived avgIncome is a number ≥ 0', typeof st.avgIncome === 'number' && st.avgIncome >= 0);
  ok('derived personalAuthority wired to the shipped RR p.350 accessor', st.personalAuthority === ACKS.computePersonalAuthority(7, st.avgIncome));
  ok('personalAuthority clamped to [-4,+4]', st.personalAuthority >= -4 && st.personalAuthority <= 4);
  // the existing P-1 fields are unchanged (no regression from the P-7 extension)
  ok('oligarchyDerivedStats → null for a non-oligarchic realm (unchanged)', ACKS.oligarchyDerivedStats(oligFix(), oligFix().domains[0]) === null);
})();

// — majority / unanimous / weighted decisions + deadlock → last policy persists (JJ p.402) —
(function(){
  const c = oligFix();
  ACKS.establishOligarchy(c, { domainId:'dom-apex', oligarchCharacterIds:['chr-1','chr-2','chr-3'], decisionRule:'majority' });
  const d1 = ACKS.resolveOligarchyDecision(c, { domainId:'dom-apex', policy:'raise the army',
    votes:[{characterId:'chr-1',vote:'for'},{characterId:'chr-2',vote:'for'},{characterId:'chr-3',vote:'against'}] });
  ok('majority 2/1 → passed', d1.outcome === 'passed' && d1.forVotes === 2 && d1.againstVotes === 1);
  ok('a passed decision records last period’s policy', c.domains[0].governance.lastOligarchyPolicy === 'raise the army');
  ok('decision emitted oligarchy-decision', c.eventLog.some(x => x.event && x.event.kind === 'oligarchy-decision'));
  const d2 = ACKS.resolveOligarchyDecision(c, { domainId:'dom-apex', policy:'new tax',
    votes:[{characterId:'chr-1',vote:'for'},{characterId:'chr-2',vote:'against'}] });   // 1/1/1abstain
  ok('a tied majority → deadlock', d2.outcome === 'deadlock');
  ok('deadlock → last period’s policy persists (JJ p.402)', d2.persistedPolicy === 'raise the army');
  ok('deadlock did NOT overwrite the last policy', c.domains[0].governance.lastOligarchyPolicy === 'raise the army');
  // unanimous: any abstain/against blocks
  ACKS.setDomainGovernance(c, 'dom-apex', { oligarchyDecisionRule:'unanimous' });
  ok('unanimous with an abstain → deadlock (not passed)', ACKS.resolveOligarchyDecision(c, { domainId:'dom-apex', policy:'x',
    votes:[{characterId:'chr-1',vote:'for'},{characterId:'chr-2',vote:'for'},{characterId:'chr-3',vote:'abstain'}] }).outcome === 'deadlock');
  ok('unanimous all-for → passed', ACKS.resolveOligarchyDecision(c, { domainId:'dom-apex', policy:'y',
    votes:[{characterId:'chr-1',vote:'for'},{characterId:'chr-2',vote:'for'},{characterId:'chr-3',vote:'for'}] }).outcome === 'passed');
  // weighted: > half the total weight
  ACKS.setDomainGovernance(c, 'dom-apex', { oligarchyDecisionRule:'weighted' });
  const d4 = ACKS.resolveOligarchyDecision(c, { domainId:'dom-apex', policy:'z',
    votes:[{characterId:'chr-1',vote:'for',weight:5},{characterId:'chr-2',vote:'against',weight:2},{characterId:'chr-3',vote:'against',weight:2}] });
  ok('weighted 5 vs 4 → passed (> half of 9)', d4.outcome === 'passed' && d4.forVotes === 5 && d4.againstVotes === 4);
  ok('resolveOligarchyDecision refuses a non-oligarchic realm', ACKS.resolveOligarchyDecision(oligFix(), { domainId:'dom-apex' }).reason === 'not-oligarchic');
})();

// — secession: continues (history only) + surfaces the seceder’s henchman-vassals (survey §5.2) —
(function(){
  const c = oligFix();
  ACKS.establishOligarchy(c, { domainId:'dom-apex', oligarchCharacterIds:['chr-1','chr-2','chr-3'] });
  const evBefore = c.eventLog.length;
  const s = ACKS.secedeFromOligarchy(c, { domainId:'dom-apex', oligarchCharacterId:'chr-2' });
  ok('secede continues with ≥2 remaining', s.ok && s.collapsed === false && s.remaining.length === 2);
  ok('secede dropped the member from the oligarchy', ACKS.governanceFor(c, c.domains[0]).oligarchCharacterIds.indexOf('chr-2') < 0);
  ok('secede surfaces the seceder’s henchman-vassals (RR loyalty — GM applies)', s.henchmanVassals.length === 1 && s.henchmanVassals[0] === 'h1');
  ok('a continuing secession emits NO new event (history only)', c.eventLog.length === evBefore);
  ok('still oligarchic after a continuing secession', ACKS.governanceFor(c, c.domains[0]).mode === 'oligarchic');
})();

// — secession that collapses the body: → feudal, or → senatorial when a senate exists (the bridge §5.4) —
(function(){
  const c = oligFix();
  ACKS.establishOligarchy(c, { domainId:'dom-apex', oligarchCharacterIds:['chr-1','chr-2'] });
  const s = ACKS.secedeFromOligarchy(c, { domainId:'dom-apex', oligarchCharacterId:'chr-2' });
  ok('collapse to feudal (no senate, 1 remains)', s.collapsed === true && s.into === 'feudal' && ACKS.governanceFor(c, c.domains[0]).mode === 'feudal');
  ok('collapse names the remaining oligarch the ruler', c.domains[0].rulerCharacterId === 'chr-1');
  ok('collapse emitted oligarchy-dissolved', c.eventLog.some(x => x.event && x.event.kind === 'oligarchy-dissolved'));

  const c2 = oligFix();
  c2.senates = [ACKS.blankSenate({ id:'sen-x', realmDomainId:'dom-apex', name:'S' })];
  ACKS.setDomainGovernance(c2, 'dom-apex', { senateId:'sen-x' });
  ACKS.establishOligarchy(c2, { domainId:'dom-apex', oligarchCharacterIds:['chr-1','chr-2'] });
  const s2 = ACKS.secedeFromOligarchy(c2, { domainId:'dom-apex', oligarchCharacterId:'chr-2' });
  ok('collapse → senatorial when a senate exists (the RAW bridge, survey §5.4)', s2.into === 'senatorial' && ACKS.governanceFor(c2, c2.domains[0]).mode === 'senatorial');
})();

// — dissolve —
(function(){
  const c = oligFix();
  ACKS.establishOligarchy(c, { domainId:'dom-apex', oligarchCharacterIds:['chr-1','chr-2','chr-3'] });
  const r = ACKS.dissolveOligarchy(c, { domainId:'dom-apex', into:'feudal' });
  ok('dissolve reverts to feudal + clears members', r.ok && r.into === 'feudal'
    && ACKS.governanceFor(c, c.domains[0]).mode === 'feudal' && ACKS.governanceFor(c, c.domains[0]).oligarchCharacterIds.length === 0);
  ok('dissolve emitted oligarchy-dissolved', c.eventLog.some(x => x.event && x.event.kind === 'oligarchy-dissolved'));
  ok('dissolve refuses a non-oligarchic realm', ACKS.dissolveOligarchy(c, { domainId:'dom-apex' }).reason === 'not-oligarchic');
})();

// — P-7 added no new collection / no lazy-inject: a plain campaign migrate stays a no-op —
ok('P-7 adds nothing to migrateCampaign (governanceHistory is init-on-write only)', (function(){
  const c = ACKS.migrateCampaign({ schemaVersion:2, domains:[{ id:'d', liegeId:null }], characters:[], houseRules:{ 'rule-of-the-few': { enabled:true } } });
  return !('governanceHistory' in (c.domains[0] || {})) && !('lastOligarchyPolicy' in ((c.domains[0]||{}).governance || {}));
})());

// =============================================================================
// P-7 wizard (burst11) — the generative Senate-Materialization Wizard.
// Politics_RAW_Survey.md §4.4 (the 7-step construction); Phase_4_Politics_Plan.md §5.2.
// Covers the RAW tables (size / characteristics / requirements incl. the RR p.357 Auran 600-seat
// example), the candidate pool (reads the SHIPPED demographics census — realmCommandStructure office-
// holders + GM extras; excludes the ruler + deceased; dedups), proposeSenateMaterialization (seeded
// determinism + purity + seats clamp + poolShort + influence accounting + faction clustering +
// independent votes), and materializeSenate (mints sen-/fac-/snr- + sets governance senatorial +
// emits the record-only senate-materialized + the shipped derived tally reproduces the plan + no new
// prefix/collection).
// =============================================================================
section('P-7 wizard — the RAW construction tables (RR p.357)');

ok('senateSizeBandForFamilies — < 4,600 → 4..15', (function(){ const b = ACKS.senateSizeBandForFamilies(4000); return b.minSeats === 4 && b.maxSeats === 15; })());
ok('senateSizeBandForFamilies — 4,600 → 4..50', (function(){ const b = ACKS.senateSizeBandForFamilies(4600); return b.minSeats === 4 && b.maxSeats === 50; })());
ok('senateSizeBandForFamilies — 52,000 → 4..50 (lower band edge)', (function(){ const b = ACKS.senateSizeBandForFamilies(52000); return b.minSeats === 4 && b.maxSeats === 50; })());
ok('senateSizeBandForFamilies — 53,000 → 16..225 (contiguous over the book gap)', (function(){ const b = ACKS.senateSizeBandForFamilies(53000); return b.minSeats === 16 && b.maxSeats === 225; })());
ok('senateSizeBandForFamilies — 364,000 → 51..1,500', (function(){ const b = ACKS.senateSizeBandForFamilies(364000); return b.minSeats === 51 && b.maxSeats === 1500; })());
ok('senateSizeBandForFamilies — 2,000,000 → 225..6,000', (function(){ const b = ACKS.senateSizeBandForFamilies(2000000); return b.minSeats === 225 && b.maxSeats === 6000; })());

ok('senateCharacteristicsForSeats — 8 seats → ruler−1, 1d4 / 2d3', (function(){ const c = ACKS.senateCharacteristicsForSeats(8); return c.minLevelDelta === -1 && c.leading.n === 1 && c.leading.d === 4 && c.influence.n === 2 && c.influence.d === 3; })());
ok('senateCharacteristicsForSeats — 30 seats → ruler−3, 2d6 / 2d6', (function(){ const c = ACKS.senateCharacteristicsForSeats(30); return c.minLevelDelta === -3 && c.leading.n === 2 && c.leading.d === 6 && c.influence.n === 2 && c.influence.d === 6; })());
ok('senateCharacteristicsForSeats — 600 seats → ruler−7, 3d6+2 / 2d10×5 (the Auran example)', (function(){ const c = ACKS.senateCharacteristicsForSeats(600); return c.minLevelDelta === -7 && c.leading.n === 3 && c.leading.d === 6 && c.leading.plus === 2 && c.influence.n === 2 && c.influence.d === 10 && c.influence.mult === 5; })());

ok('requirementsOfOfficeForLevel — 7 → Count, 75,000gp, 550 fam, bribe 50/400/1600/19200', (function(){ const r = ACKS.requirementsOfOfficeForLevel(7); return r.title === 'Count' && r.netWorthGp === 75000 && r.families === 550 && r.bribe.day === 50 && r.bribe.week === 400 && r.bribe.month === 1600 && r.bribe.year === 19200; })());
ok('requirementsOfOfficeForLevel — clamps below 3 → the level-3 row', (function(){ const r = ACKS.requirementsOfOfficeForLevel(1); return r.title === 'Baron' && r.netWorthGp === 5000; })());
ok('requirementsOfOfficeForLevel — clamps above 11 → the level-11 row (Prince)', (function(){ const r = ACKS.requirementsOfOfficeForLevel(14); return r.title === 'Prince' && r.netWorthGp === 1125000; })());

// — a fixture: a realm apex with a ruler + a magistrate office-holder + GM-addable notables.
//   `families` drives realmFamiliesForDomain → the senate-size band (default 0 → the 4..15 band). —
function genFix(rulerLevel, families){
  return {
    schemaVersion: 2, currentTurn: 5,
    domains: [
      { id:'dom-apex', name:'Aura', liegeId:null, rulerCharacterId:'chr-ruler',
        magistrates:{ captainOfGuard:{ characterId:'chr-mag1' } }, demographics:{ peasantFamilies: families || 0 } }
    ],
    characters: [
      { id:'chr-ruler', name:'The Imperator', level: rulerLevel || 14, class:'Fighter' },
      { id:'chr-mag1',  name:'Sir Garric',   level: 8, class:'Fighter' },
      { id:'chr-dead',  name:'Old Cassius',  level: 9, class:'Mage', lifecycleState:'deceased' },
      { id:'chr-a',     name:'Lady Vorena',  level: 7, class:'Crusader' },
      { id:'chr-b',     name:'Marcus Pyle',  level: 6, class:'Venturer' },
      { id:'chr-c',     name:'Tullia Brand', level: 5, class:'Thief' },
      { id:'chr-d',     name:'Drusus Vale',  level: 5, class:'Explorer' }
    ],
    senates: [], factions: [], senatorships: [], vassalages: [], eventLog: [], houseRules: {}
  };
}

section('P-7 wizard — senateMaterializeCandidates (reads the demographics census, READ-ONLY)');
(function(){
  const c = genFix(14);
  const pool = ACKS.senateMaterializeCandidates(c, 'dom-apex', { minLevel: 5, extraCharacterIds: ['chr-a','chr-b','chr-c','chr-a'] });
  const ids = pool.map(p => p.characterId);
  ok('draws the magistrate office-holder (realmCommandStructure)', ids.indexOf('chr-mag1') >= 0);
  ok('includes GM extras', ids.indexOf('chr-a') >= 0 && ids.indexOf('chr-b') >= 0 && ids.indexOf('chr-c') >= 0);
  ok('EXCLUDES the apex ruler (a senate constrains him — not a senator)', ids.indexOf('chr-ruler') < 0);
  ok('EXCLUDES the deceased', ids.indexOf('chr-dead') < 0);
  ok('dedupes a doubly-added candidate', ids.filter(x => x === 'chr-a').length === 1);
  ok('sorted by level desc (mag1 L8 first)', pool[0] && pool[0].characterId === 'chr-mag1');
  ok('minLevel filters (chr-c L5 out at minLevel 6)',
    ACKS.senateMaterializeCandidates(c, 'dom-apex', { minLevel: 6, extraCharacterIds: ['chr-c'] }).map(p=>p.characterId).indexOf('chr-c') < 0);
  ok('candidate gather mutates nothing', c.senates.length === 0 && c.factions.length === 0 && c.characters.length === 7);
})();

section('P-7 wizard — proposeSenateMaterialization (pure, seeded; RR p.357 steps)');
(function(){
  // the RR p.357 Auran example: 14th ruler, a realm in the 226..1,500-seat band → 600 seats allowed →
  // min level 7, 3d6+2 leading, 2d10×5 influence
  const c = genFix(14, 500000);
  const p = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 600, seed: 1, extraCharacterIds: ['chr-a','chr-b','chr-c','chr-d'] });
  ok('plan ok', p.ok === true);
  ok('seats = 600 (within the band)', p.seats === 600 && p.minSeats === 51 && p.maxSeats === 1500);
  ok('min senator level = ruler 14 − 7 = 7 (the Auran example)', p.minSenatorLevel === 7);
  ok('leading/influence dice labels (3d6+2 / 2d10×5)', p.leadingDiceLabel === '3d6+2' && p.influenceDiceLabel === '2d10×5');
  ok('requirements row = Count', p.requirements.title === 'Count' && p.requirements.bribe.month === 1600);
  // at min level 7 only chr-mag1 (L8) + chr-a (L7) qualify → poolShort vs a 3d6+2 rolled count
  ok('pool filtered to level ≥ 7 (mag1 + Vorena)', p.poolSize === 2);
  ok('poolShort flagged (rolled leading count > pool of 2)', p.poolShort === true && p.seatedCount <= 2);
  ok('senators are REAL realm notables (not invented)', p.senators.every(s => ['chr-mag1','chr-a'].indexOf(s.characterId) >= 0));
  ok('independent minor votes = seats − Σ seated influence', p.independentMinorVotes === Math.max(0, 600 - p.senators.reduce((s,x)=>s+x.votes,0)));
  ok('propose mutates nothing', c.senates.length === 0 && c.factions.length === 0 && c.senatorships.length === 0 && c.eventLog.length === 0);
  const p2 = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 600, seed: 1, extraCharacterIds: ['chr-a','chr-b','chr-c','chr-d'] });
  ok('seeded determinism — same seed → identical plan', JSON.stringify(p) === JSON.stringify(p2));
  const p3 = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 600, seed: 2, extraCharacterIds: ['chr-a','chr-b','chr-c','chr-d'] });
  ok('a new seed re-rolls (plan differs)', JSON.stringify(p) !== JSON.stringify(p3));
})();

(function(){
  // a low-level ruler + a richer pool → multiple seated senators + real factions
  const c = genFix(6);
  const p = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 12, seed: 7, extraCharacterIds: ['chr-a','chr-b','chr-c','chr-d'] });
  ok('seats clamps to the 4..15 band (12 ok)', p.seats === 12 && p.minSeats === 4 && p.maxSeats === 15);
  ok('min level = ruler 6 − 1 = 5', p.minSenatorLevel === 5);
  ok('each senator carries 1d3 (1..3) policy objectives', p.senators.every(s => s.objectives.length >= 1 && s.objectives.length <= 3));
  ok('objectives are valid POLICY_OBJECTIVES keys', p.senators.every(s => s.objectives.every(o => ACKS.POLICY_OBJECTIVES.indexOf(o) >= 0)));
  ok('no senator holds a contradictory objective pair', p.senators.every(s => !(s.objectives.indexOf('increase-army') >= 0 && s.objectives.indexOf('decrease-army') >= 0)));
  ok('every senator is assigned to a faction', p.senators.every(s => s.factionIndex != null && p.factions[s.factionIndex]));
  ok('faction totalVotes = Σ its members votes', p.factions.every(f => f.totalVotes === f.memberCharacterIds.reduce((sum,cid)=>{ const s=p.senators.find(x=>x.characterId===cid); return sum+(s?s.votes:0); },0)));
  ok('a faction is named from its objectives', p.factions.every(f => typeof f.name === 'string' && f.name.length > 0));
  const pOver = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 999, seed: 7, extraCharacterIds: ['chr-a'] });
  ok('seats clamps to the band max (999 → 15)', pOver.seats === 15);
})();

section('P-7 wizard — materializeSenate (mint + governance + event; the shipped tally reproduces)');
(function(){
  const c = genFix(6);
  const plan = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 12, seed: 7, extraCharacterIds: ['chr-a','chr-b','chr-c','chr-d'] });
  const r = ACKS.materializeSenate(c, { domainId:'dom-apex', plan });
  ok('materialize ok', r.ok === true);
  ok('minted ONE senate (sen- prefix, no new prefix)', c.senates.length === 1 && /^sen-/.test(c.senates[0].id));
  ok('minted factions (fac- prefix) = plan factions', c.factions.length === plan.factions.length && c.factions.every(f => /^fac-/.test(f.id)));
  ok('minted senatorships (snr- prefix) = plan senators', c.senatorships.length === plan.senators.length && c.senatorships.every(s => /^snr-/.test(s.id)));
  ok('every senatorship seats a REAL realm notable', c.senatorships.every(s => c.characters.some(ch => ch.id === s.senatorCharacterId)));
  ok('senate carries the rolled seats + min level + independent votes', c.senates[0].seats === plan.seats && c.senates[0].minSenatorLevel === plan.minSenatorLevel && c.senates[0].independentMinorSenatorVotes === plan.independentMinorVotes);
  ok('requirements-of-office bribe row copied onto the senate', c.senates[0].requirementsOfOffice.bribeCostMonth === plan.requirements.bribe.month);
  ok('senatorship bribeCostByPeriod copied from requirements', c.senatorships.every(s => s.bribeCostByPeriod.month === plan.requirements.bribe.month));
  ok('senatorships carry their policy objectives + leading rank', c.senatorships.every(s => s.rank === 'leading' && Array.isArray(s.policyObjectives)));
  const g = ACKS.governanceFor(c, c.domains[0]);
  ok('apex governance set senatorial + senateId', g.mode === 'senatorial' && g.senateId === c.senates[0].id);
  ok('isSenatorialRealm true after materialize', ACKS.isSenatorialRealm(c, c.domains[0]) === true);
  ok('senateForRealm resolves the new senate', (ACKS.senateForRealm(c, 'dom-apex') || {}).id === c.senates[0].id);
  ok('emitted ONE senate-materialized event', c.eventLog.filter(x => x.event && x.event.kind === 'senate-materialized').length === 1);
  const ev = c.eventLog.find(x => x.event && x.event.kind === 'senate-materialized').event;
  ok('event payload carries senateId + seats + leadingSenators', ev.payload.senateId === c.senates[0].id && ev.payload.seats === plan.seats && ev.payload.leadingSenators === c.senatorships.length);
  ok('event context envelope set (apex domain + ruler)', !!ev.context && ev.context.domainId === 'dom-apex' && (ev.context.relatedEntities||[]).some(e => e.id === 'chr-ruler'));
  ok('senateTotalVotes = Σ senatorship votes + independents', ACKS.senateTotalVotes(c, c.senates[0]) === (c.senatorships.reduce((s,x)=>s+x.votes,0) + c.senates[0].independentMinorSenatorVotes));
  const planRulingFacId = plan.rulingFactionIndex >= 0 ? r.factions[plan.rulingFactionIndex].id : null;
  ok('shipped senateRulingFactionId reproduces the plan ruling faction', ACKS.senateRulingFactionId(c, c.senates[0]) === planRulingFacId);
})();

(function(){
  const c = genFix(6);
  ACKS.materializeSenate(c, { domainId:'dom-apex', seats: 12, seed: 7, extraCharacterIds: ['chr-a','chr-b'] });
  const r2 = ACKS.materializeSenate(c, { domainId:'dom-apex', seats: 12, seed: 7, extraCharacterIds: ['chr-a','chr-b'] });
  ok('refuses a second live senate on the apex', r2.ok === false && r2.reason === 'senate-exists');
  ok('still only one senate', c.senates.length === 1);
  const r3 = ACKS.materializeSenate(c, { domainId:'dom-apex', seats: 12, seed: 9, extraCharacterIds: ['chr-a','chr-b'], replace: true });
  ok('replace:true materializes another senate', r3.ok === true && c.senates.length === 2);
  ok('refuses an unknown domain', ACKS.materializeSenate(c, { domainId:'nope' }).reason === 'no-domain');
  const c2 = genFix(6);
  const before = c2.eventLog.length;
  ACKS.materializeSenate(c2, { domainId:'dom-apex', seats: 12, seed: 7, extraCharacterIds: ['chr-a'], emit: false });
  ok('emit:false suppresses the event', c2.eventLog.length === before);
})();

section('P-7 wizard — event registration + opt-out + no new collection');
ok('EVENT_KINDS includes senate-materialized', ACKS.EVENT_KINDS.indexOf('senate-materialized') >= 0);
ok('senate-materialized has a schema (R.senateId)', !!(ACKS.EVENT_SCHEMAS['senate-materialized'] && ACKS.EVENT_SCHEMAS['senate-materialized'].R.senateId));
ok('senate-materialized is wizard-opt-out (engine-owned)', ACKS.isWizardEmittable('senate-materialized') === false);
ok('P-7 wizard adds nothing to migrateCampaign', (function(){
  const c = ACKS.migrateCampaign({ schemaVersion:2, domains:[{ id:'d', liegeId:null }], characters:[], houseRules:{} });
  return !Array.isArray(c.senates) || c.senates.length === 0;
})());

// =============================================================================
// P-5 — the NPC-minting fill (burst14 2026-06-21). fillWithGenerated: when the realm has too few real
// notables to seat the rolled leading-senator count, the wizard MINTS the shortfall as fresh senator
// Characters via the SHIPPED NPC generator (RR p.357 "the Judge creates the leading senators"). The
// propose step stays pure (placeholders are data; characterId null); materializeSenate mints them
// (late-bound generateAndLandNPC), homed to the realm, seeded-deterministic, reusing senate-materialized.
// Backward-compat: WITHOUT the flag the plan is byte-identical to burst11 (the assertions above prove it).
// =============================================================================
section('P-5 — NPC-minting fill on an empty realm (propose stays pure)');
(function(){
  // an empty/thin realm: a 14th-level ruler but NO qualifying notable (the L8 magistrate is below the
  // min senator level 13; no GM extras) → the candidate pool is empty.
  const c = genFix(14, 0);
  const noFill = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 15, seed: 3 });
  ok('no-fill on an empty realm seats ZERO leading senators (burst11 behaviour preserved)', noFill.seatedCount === 0 && noFill.generatedCount === 0 && noFill.realCount === 0);
  ok('no-fill plan exposes the new fields (fillWithGenerated=false)', noFill.fillWithGenerated === false && noFill.generatedCount === 0 && noFill.realCount === 0);

  const p = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 15, seed: 3, fillWithGenerated: true });
  ok('fill plan ok + flagged', p.ok === true && p.fillWithGenerated === true);
  ok('fill seats ≥ 1 leading senator on an empty realm', p.seatedCount >= 1);
  ok('all seated are GENERATED placeholders (no real notables to draw)', p.realCount === 0 && p.generatedCount === p.seatedCount);
  ok('placeholders carry NO characterId yet (minted at commit) + the generated flag', p.senators.every(s => s.generated === true && s.characterId === null));
  ok('placeholders still carry rolled influence + 1d3 objectives + a faction', p.senators.every(s => s.votes >= 1 && s.objectives.length >= 1 && s.objectives.length <= 3 && s.factionIndex != null));
  ok('propose mutates nothing (no minting in the pure step)', c.characters.length === 7 && c.senates.length === 0 && c.eventLog.length === 0);

  const p2 = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 15, seed: 3, fillWithGenerated: true });
  ok('fill preview is seeded-deterministic (same seed → identical plan)', JSON.stringify(p) === JSON.stringify(p2));
  const p9 = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 15, seed: 9, fillWithGenerated: true });
  ok('a new seed re-rolls the fill plan', JSON.stringify(p) !== JSON.stringify(p9));
})();

section('P-5 — NPC-minting fill: commit mints real, homed senator Characters');
(function(){
  const c = genFix(14, 0);
  const charsBefore = c.characters.length;
  const plan = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 15, seed: 3, fillWithGenerated: true });
  const r = ACKS.materializeSenate(c, { domainId:'dom-apex', plan });
  ok('materialize ok + reports mintedCount', r.ok === true && r.mintedCount === plan.generatedCount && r.mintedCount >= 1);
  ok('minted exactly mintedCount NEW Characters', c.characters.length === charsBefore + r.mintedCount);
  ok('every minted senator is a REAL Character, generated + homed to the apex realm', c.senatorships.every(s => { const ch = c.characters.find(x => x.id === s.senatorCharacterId); return ch && ch.generated === true && ch.currentDomainId === 'dom-apex'; }));
  ok('senatorships seat every planned senator (none dropped — the generator is present)', c.senatorships.length === plan.senators.length);
  ok('senatorships record the generated provenance in history', c.senatorships.every(s => s.history[0] && s.history[0].generated === true));
  ok('minted senators are NOT the ruler', c.senatorships.every(s => s.senatorCharacterId !== 'chr-ruler'));
  ok('factions formed over the minted senators', c.factions.length === plan.factions.length && c.factions.length >= 1);
  ok('emitted ONE senate-materialized event', c.eventLog.filter(x => x.event && x.event.kind === 'senate-materialized').length === 1);
  const ev = c.eventLog.find(x => x.event && x.event.kind === 'senate-materialized').event;
  ok('event narrative notes the newly-generated senators', /newly generated/.test(ev.payload.narrative));
  ok('senate history records the generated count', (c.senates[0].history[0] || {}).generated === r.mintedCount);
  ok('each minted NPC also recorded its own generation event', c.eventLog.filter(x => x.event && x.event.kind === 'generation').length === r.mintedCount);
  ok('apex governance set senatorial', ACKS.isSenatorialRealm(c, c.domains[0]) === true);

  // commit-determinism of the minted senators' STATS (id-independent): same seed → same names
  const c2 = genFix(14, 0);
  const r2 = ACKS.materializeSenate(c2, { domainId:'dom-apex', seats: 15, seed: 3, fillWithGenerated: true });
  const names1 = c.senatorships.map(s => (c.characters.find(x=>x.id===s.senatorCharacterId)||{}).name).sort();
  const names2 = c2.senatorships.map(s => (c2.characters.find(x=>x.id===s.senatorCharacterId)||{}).name).sort();
  ok('minting is seeded-deterministic (same seed → same senator names)', names1.length >= 1 && JSON.stringify(names1) === JSON.stringify(names2));
})();

section('P-5 — NPC-minting fill: a SHORTFALL seats real notables FIRST, mints the remainder');
(function(){
  // a mid-band realm (4..50 seats, 2d6 leading / 2d6 influence — no influence multiplier, so a roomy
  // seats count avoids the Σ-influence>seats trim): pool = the L8 magistrate + chr-a only (2 reals).
  const c = genFix(8, 30000);
  const noFill = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 50, seed: 4, extraCharacterIds: ['chr-a'] });
  const p = ACKS.proposeSenateMaterialization(c, { domainId:'dom-apex', seats: 50, seed: 4, extraCharacterIds: ['chr-a'], fillWithGenerated: true });
  ok('shortfall: a rolled leading count exceeds the 2-real pool', noFill.poolSize === 2 && noFill.rolledLeadingCount > 2);
  ok('shortfall: no-fill caps seated at the real pool, mints nothing', noFill.generatedCount === 0 && noFill.realCount <= 2);
  ok('shortfall: fill is genuinely MIXED — real notables + minted', p.realCount >= 1 && p.generatedCount >= 1 && p.seatedCount === p.realCount + p.generatedCount);
  ok('shortfall: every real seat is a real notable; every generated seat is an id-less placeholder',
    p.senators.filter(s=>!s.generated).every(s => ['chr-mag1','chr-a'].indexOf(s.characterId) >= 0) &&
    p.senators.filter(s=>s.generated).every(s => s.characterId === null));
  const charsBefore = c.characters.length;
  const r = ACKS.materializeSenate(c, { domainId:'dom-apex', plan: p });
  ok('shortfall commit: mints ONLY the shortfall (the reals are not re-minted)', r.mintedCount === p.generatedCount && c.characters.length === charsBefore + p.generatedCount);
  ok('shortfall commit: the real notables keep their original Character ids', c.senatorships.filter(s => ['chr-mag1','chr-a'].indexOf(s.senatorCharacterId) >= 0).length === p.realCount);
})();

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Politics smoke checks passed (P-1 · P-2 · P-3 · P-5 · P-7).');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
