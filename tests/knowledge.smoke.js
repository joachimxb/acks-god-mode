// =============================================================================
// knowledge.smoke.js — the Knowledge Layer, Wave A (the Lore data layer).
// Spec: Knowledge_Layer_Plan.md §6 + Sages_Knowledge_RAW_Survey.md §6/§16.
// Covers: the lor-/knw- prefixes; blankLore/blankKnowledge factories; blankCampaign carries
// lore[]/knowledge[]; the entity-registry 'lore' kind + the displayName invariant; the 'lore'
// field-schema ⊆ blankLore; the certainty model (bands/rank/higherCertainty/certaintyFromThrow);
// recordLore; learnLore (create + upgrade-by-max + overwrite + the lore-learned event + the
// characterHistory/loreHistory context surfacing); attemptLearnLore (the SHIPPED Layer-1 throw →
// certainty, deterministic via rng); shareLore (teller-must-know + degrade + told-by); forgetLore;
// the lookups (loreOnSubject/loreKnowers/loreKnownBy/firstHandLore-DERIVED/loreKnownByCollective);
// the event kinds + wizard-opt-out; and the WAVE A GUARD — templates + demo STAY migrate-no-ops
// (lore/knowledge added to blankCampaign ONLY, NOT lazy-injected into migrateCampaign).
//
// WAVE B (team burst11, 2026-06-20 — Knowledge_Layer_Plan.md §6/§7): the knowledge-tracking MASTER
// house rule (default OFF) + the 📚 knowledge category + the isKnowledgeTrackingOn gate (incl. the
// rumors-manual ⊥ knowledge-tracking orthogonality); rumor→lore promotion (promoteRumorToLore →
// loreKind:'rumor' + the sourceRumorId/apparentLevel/reach rumor-Lore extension + truth-level mapping
// + idempotency + non-destructive/consume + the rumor-promoted event + guards); promotableRumors /
// loreFromRumor; and loreProvenanceChain (the told-by gossip trace + the cycle/no-record guards).
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
section('ID prefixes (lor- / knw-)');
// =============================================================================
ok('ID_PREFIXES.lore === "lor"', ACKS.ID_PREFIXES.lore === 'lor');
ok('ID_PREFIXES.knowledge === "knw"', ACKS.ID_PREFIXES.knowledge === 'knw');

// =============================================================================
section('Factories — blankLore / blankKnowledge');
// =============================================================================
ok('blankLore is a function', typeof ACKS.blankLore === 'function');
ok('blankKnowledge is a function', typeof ACKS.blankKnowledge === 'function');

const lore0 = ACKS.blankLore({ text: 'The Drowned Causeway holds a lizardfolk lair', topic: 'Drowned Causeway', truthValue: 'true', subjectIds: ['hex-x'] });
ok('blankLore id has lor- prefix', /^lor-/.test(lore0.id));
ok('blankLore schemaVersion 2', lore0.schemaVersion === 2);
ok('blankLore keeps opts', lore0.text.indexOf('lizardfolk') >= 0 && lore0.topic === 'Drowned Causeway' && lore0.truthValue === 'true');
ok('blankLore subjectIds kept', Array.isArray(lore0.subjectIds) && lore0.subjectIds[0] === 'hex-x');
ok('blankLore default loreKind fact', ACKS.blankLore().loreKind === 'fact');
ok('blankLore default truthValue unknown', ACKS.blankLore().truthValue === 'unknown');
ok('blankLore default subjectIds []', Array.isArray(ACKS.blankLore().subjectIds) && ACKS.blankLore().subjectIds.length === 0);
ok('blankLore default qualityDimensions []', Array.isArray(ACKS.blankLore().qualityDimensions));
ok('blankLore default createdAtTurn 1', ACKS.blankLore().createdAtTurn === 1);
ok('blankLore has history[]', Array.isArray(lore0.history));
ok('blankLore stores NO entity-kind field (registry carries it — blankLair precedent)', !('kind' in ACKS.blankLore()));

const kn0 = ACKS.blankKnowledge({ knowerId: 'chr-a', loreId: lore0.id, certainty: 'probable' });
ok('blankKnowledge id has knw- prefix', /^knw-/.test(kn0.id));
ok('blankKnowledge keeps opts', kn0.knowerId === 'chr-a' && kn0.loreId === lore0.id && kn0.certainty === 'probable');
ok('blankKnowledge default knowerKind character', ACKS.blankKnowledge().knowerKind === 'character');
ok('blankKnowledge default certainty rumored', ACKS.blankKnowledge().certainty === 'rumored');
ok('blankKnowledge default source {told-by,null}', ACKS.blankKnowledge().source.kind === 'told-by' && ACKS.blankKnowledge().source.byId === null);
ok('blankKnowledge default believedText ""', ACKS.blankKnowledge().believedText === '');
ok('blankKnowledge default status active', ACKS.blankKnowledge().status === 'active');
ok('blankKnowledge has history[]', Array.isArray(kn0.history));

// =============================================================================
section('blankCampaign carries lore[] + knowledge[]');
// =============================================================================
const camp0 = ACKS.blankCampaign({ name: 'Knowledge A' });
ok('blankCampaign.lore is []', Array.isArray(camp0.lore) && camp0.lore.length === 0);
ok('blankCampaign.knowledge is []', Array.isArray(camp0.knowledge) && camp0.knowledge.length === 0);

// =============================================================================
section('Entity Registry — lore kind');
// =============================================================================
ok('registry has lore kind', !!ACKS.entityKind('lore'));
ok('lore icon 📚', ACKS.entityIcon('lore') === '📚');
ok('lore label "Lore"', ACKS.entityLabel('lore') === 'Lore');
ok('lore pluralLabel "Lore"', ACKS.entityPluralLabel('lore') === 'Lore');
ok('registry has NO knowledge kind (relation is accessor-only)', !ACKS.entityKind('knowledge'));
(function(){
  const c = ACKS.blankCampaign({ name: 'Reg' });
  c.lore.push(lore0);
  ok('listEntities lore', ACKS.listEntities(c, 'lore').length === 1);
  ok('findEntity lore by id', ACKS.findEntity(c, 'lore', lore0.id) === lore0);
  ok('lore displayName uses text', ACKS.entityDisplayName(c, 'lore', lore0.id) === lore0.text);
  // displayName reads only factory fields (the smoke.js invariant, focused)
  const blank = ACKS.blankLore({});
  const factoryKeys = new Set(Object.keys(blank));
  const accessed = new Set();
  const proxy = new Proxy(blank, { get(t,k){ if(typeof k === 'string') accessed.add(k); return t[k]; } });
  try { ACKS.entityKind('lore').displayName({}, proxy); } catch(_){}
  const extras = [...accessed].filter(k => !factoryKeys.has(k));
  ok('lore displayName reads only factory fields', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
})();

// =============================================================================
section('Field schema — lore exists, validates, ⊆ blankLore');
// =============================================================================
(function(){
  const schema = ACKS.fieldSchemaFor('lore');
  ok('fieldSchemaFor("lore") exists', !!schema);
  if(!schema) return;
  const v = ACKS.validateFieldSchema('lore', schema);
  ok('schema "lore" validates clean', v.ok, (v.errors || []).join('; '));
  ok('schema "lore" names blankLore', schema.factory === 'blankLore');
  ok('schema "lore" is adminCreate schemaForm', schema.adminCreate === 'schemaForm');
  const keys = new Set(Object.keys(ACKS.blankLore({})));
  const extras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
  ok('schema "lore" fields ⊆ blankLore keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
  ok('no field-schema for the knowledge relation (accessor-only)', !ACKS.fieldSchemaFor('knowledge'));
})();

// =============================================================================
section('Constants + certainty model');
// =============================================================================
ok('CERTAINTY_BANDS low→high', JSON.stringify(ACKS.CERTAINTY_BANDS) === JSON.stringify(['rumored','suspected','probable','certain']));
ok('LORE_KINDS includes rumor (Wave B) + identity', ACKS.LORE_KINDS.includes('rumor') && ACKS.LORE_KINDS.includes('identity'));
ok('certaintyRank certain > rumored', ACKS.certaintyRank('certain') > ACKS.certaintyRank('rumored'));
ok('higherCertainty picks the higher', ACKS.higherCertainty('rumored', 'probable') === 'probable' && ACKS.higherCertainty('certain', 'suspected') === 'certain');
ok('certaintyFromThrow crit → certain', ACKS.certaintyFromThrow({ success: true, crit: true, margin: 0 }) === 'certain');
ok('certaintyFromThrow margin 12 → certain', ACKS.certaintyFromThrow({ success: true, margin: 12 }) === 'certain');
ok('certaintyFromThrow margin 6 → probable', ACKS.certaintyFromThrow({ success: true, margin: 6 }) === 'probable');
ok('certaintyFromThrow margin 1 → suspected', ACKS.certaintyFromThrow({ success: true, margin: 1 }) === 'suspected');
ok('certaintyFromThrow fail → rumored', ACKS.certaintyFromThrow({ success: false, margin: -3 }) === 'rumored');
ok('certaintyFromThrow null → rumored', ACKS.certaintyFromThrow(null) === 'rumored');

// =============================================================================
section('recordLore — author a fact');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Rec' }); c.currentTurn = 4;
  const l = ACKS.recordLore(c, { text: 'Baron Yorick is secretly a wereboar', loreKind: 'identity', truthValue: 'true', subjectIds: ['chr-yorick'], topic: 'Yorick' });
  ok('recordLore returns a lor- lore', l && /^lor-/.test(l.id));
  ok('recordLore pushes to campaign.lore', c.lore.length === 1 && c.lore[0] === l);
  ok('recordLore stamps createdAtTurn = currentTurn', l.createdAtTurn === 4);
  ok('recordLore stamps a recorded history entry', l.history.length === 1 && l.history[0].type === 'recorded');
  ok('recordLore emits NO event (authoring is silent; learning is the event)', (c.eventLog || []).length === 0);
})();

// =============================================================================
section('learnLore — create / upgrade-by-max / overwrite / believedText / event');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Learn' }); c.currentTurn = 5;
  c.characters.push(ACKS.blankCharacter({ id: 'chr-a', name: 'Aelric' }));
  const l = ACKS.recordLore(c, { text: 'a hidden vault under the keep', topic: 'Vault' });

  const r1 = ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'suspected', source: { kind: 'told-by', byId: 'chr-b' } });
  ok('learnLore ok + created', r1.ok === true && r1.created === true);
  ok('learnLore creates a knw- record', /^knw-/.test(r1.knowledge.id) && c.knowledge.length === 1);
  ok('learnLore record certainty suspected', r1.knowledge.certainty === 'suspected');
  ok('learnLore record source kept', r1.knowledge.source.kind === 'told-by' && r1.knowledge.source.byId === 'chr-b');
  ok('learnLore emits a lore-learned event (applied)', (c.eventLog || []).some(e => e.event && e.event.kind === 'lore-learned' && e.event.status === 'applied'));

  // upgrade by max — a better learn raises certainty; a worse one does NOT downgrade
  const r2 = ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'certain' });
  ok('learnLore upgrades to certain (max)', r2.knowledge.certainty === 'certain' && r2.created === false);
  ok('learnLore re-learn does NOT create a 2nd record', c.knowledge.length === 1);
  const r3 = ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'rumored' });
  ok('learnLore never downgrades (rumored < certain → stays certain)', r3.knowledge.certainty === 'certain');
  // overwrite forces the value (GM repair)
  const r4 = ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'suspected', overwrite: true });
  ok('learnLore overwrite forces the value down', r4.knowledge.certainty === 'suspected');
  // believedText — the secret-identity distortion
  ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, believedText: 'just an old cellar' });
  ok('learnLore stores believedText', ACKS.knowledgeRecord(c, 'character', 'chr-a', l.id).believedText === 'just an old cellar');
  // missing-args + no-lore guards
  ok('learnLore missing loreId → ok:false', ACKS.learnLore(c, { knowerId: 'chr-a' }).ok === false);
  ok('learnLore unknown lore → no-lore', ACKS.learnLore(c, { knowerId: 'chr-a', loreId: 'lor-nope' }).reason === 'no-lore');
  // silent suppresses the event
  const before = c.eventLog.length;
  ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'certain', silent: true });
  ok('learnLore silent emits no event', c.eventLog.length === before);

  // the lore-learned event surfaces in characterHistory(knower) + loreHistory(lore); first-hand EXCLUDES it
  ok('characterHistory(knower) includes the lore-learned event', ACKS.characterHistory(c, 'chr-a').some(e => e.event && e.event.kind === 'lore-learned'));
  ok('loreHistory(lore) includes the lore-learned event', ACKS.loreHistory(c, l.id).some(e => e.event && e.event.kind === 'lore-learned'));
  ok('firstHandLore EXCLUDES the lore-learned meta-event', !ACKS.firstHandLore(c, 'chr-a').some(r => r.kind === 'lore-learned'));
})();

// =============================================================================
section('attemptLearnLore — the SHIPPED Layer-1 throw → certainty (deterministic via rng)');
// =============================================================================
(function(){
  function mk(ranks){
    const c = ACKS.blankCampaign({ name: 'Throw' }); c.currentTurn = 3;
    const ch = ACKS.blankCharacter({ id: 'chr-s', name: 'Sage' });
    ch.proficiencies = ranks != null ? [{ key: 'knowledge', ranks }] : [];
    c.characters.push(ch);
    const l = ACKS.recordLore(c, { text: 'the founding of Aura', topic: 'history' });
    return { c, l };
  }
  // Scholar (ranks 3 → target 3+, proficient). nat-20 → crit → certain.
  let { c, l } = mk(3);
  let r = ACKS.attemptLearnLore(c, { knowerId: 'chr-s', loreId: l.id, rng: () => 0.99 });
  ok('attemptLearnLore nat-20 (proficient) → certain', r.ok && r.certainty === 'certain' && r.throw && r.throw.crit === true);
  ok('attemptLearnLore uses the shipped die (a throw result is returned)', typeof r.throw.natural === 'number' && r.throw.die === 'd20');
  ok('attemptLearnLore source defaults to deduced/self', r.knowledge.source.kind === 'deduced' && r.knowledge.source.byId === 'chr-s');
  // mid roll → margin → probable
  ({ c, l } = mk(3));
  r = ACKS.attemptLearnLore(c, { knowerId: 'chr-s', loreId: l.id, rng: () => 0.5 }); // natural 11, target 3 → margin 8
  ok('attemptLearnLore comfortable success → probable', r.certainty === 'probable');
  // bare success → suspected
  ({ c, l } = mk(3));
  r = ACKS.attemptLearnLore(c, { knowerId: 'chr-s', loreId: l.id, rng: () => 0.1 }); // natural 3, target 3 → margin 0
  ok('attemptLearnLore bare success → suspected', r.certainty === 'suspected');
  // natural 1 → botch → rumored
  ({ c, l } = mk(3));
  r = ACKS.attemptLearnLore(c, { knowerId: 'chr-s', loreId: l.id, rng: () => 0 });
  ok('attemptLearnLore natural 1 → rumored', r.certainty === 'rumored' && r.throw.botch === true);
  // no proficiency entry at all → knowledge:recall unavailable (tierTargets minTier 1) → rumored.
  // (NB a LISTED proficiency normalizes to rank ≥1, so mk(null) is the genuine no-proficiency case.)
  ({ c, l } = mk(null));
  r = ACKS.attemptLearnLore(c, { knowerId: 'chr-s', loreId: l.id, rng: () => 0.99 });
  ok('attemptLearnLore no Knowledge proficiency → rumored (unavailable)', r.certainty === 'rumored' && r.throw.unavailable === true);
  // investigateLore raises an existing record's confidence (= attemptLearnLore upgrading by max)
  ({ c, l } = mk(3));
  ACKS.learnLore(c, { knowerId: 'chr-s', loreId: l.id, certainty: 'rumored' });
  r = ACKS.investigateLore(c, { knowerId: 'chr-s', loreId: l.id, rng: () => 0.99 });
  ok('investigateLore raises rumored → certain on a great throw', ACKS.knowledgeRecord(c, 'character', 'chr-s', l.id).certainty === 'certain');
})();

// =============================================================================
section('shareLore — teller must know; degrade by one band; told-by; lore-shared event');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Share' }); c.currentTurn = 6;
  c.characters.push(ACKS.blankCharacter({ id: 'chr-a', name: 'Aelric' }), ACKS.blankCharacter({ id: 'chr-b', name: 'Bryn' }));
  const l = ACKS.recordLore(c, { text: 'the bandits camp at the old mill', topic: 'bandits' });
  // teller who does not know → refused
  ok('shareLore refused — teller does not know', ACKS.shareLore(c, { fromKnowerId: 'chr-a', toKnowerId: 'chr-b', loreId: l.id }).reason === 'teller-does-not-know');
  // teller learns it (certain), then shares → recipient gets probable (one band below), source told-by Aelric
  ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'certain', silent: true });
  const r = ACKS.shareLore(c, { fromKnowerId: 'chr-a', toKnowerId: 'chr-b', loreId: l.id });
  ok('shareLore ok', r.ok === true);
  ok('shareLore degrades one band (certain → probable)', r.sharedCertainty === 'probable');
  const brec = ACKS.knowledgeRecord(c, 'character', 'chr-b', l.id);
  ok('recipient record certainty probable', brec.certainty === 'probable');
  ok('recipient source told-by the teller', brec.source.kind === 'told-by' && brec.source.byId === 'chr-a');
  ok('shareLore emits a lore-shared event', (c.eventLog || []).some(e => e.event && e.event.kind === 'lore-shared'));
  ok('lore-shared surfaces in characterHistory of BOTH knowers', ACKS.characterHistory(c, 'chr-a').some(e => e.event && e.event.kind === 'lore-shared') && ACKS.characterHistory(c, 'chr-b').some(e => e.event && e.event.kind === 'lore-shared'));
  // degrade:false shares at the teller's certainty
  c.characters.push(ACKS.blankCharacter({ id: 'chr-c', name: 'Cass' }));
  const r2 = ACKS.shareLore(c, { fromKnowerId: 'chr-a', toKnowerId: 'chr-c', loreId: l.id, degrade: false });
  ok('shareLore degrade:false keeps the teller certainty', r2.sharedCertainty === 'certain');
})();

// =============================================================================
section('Lookups — loreOnSubject / loreKnowers / loreKnownBy / firstHandLore (DERIVED) / collective');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Lookups' }); c.currentTurn = 7;
  c.characters.push(ACKS.blankCharacter({ id: 'chr-a', name: 'Aelric' }), ACKS.blankCharacter({ id: 'chr-b', name: 'Bryn' }));
  const l1 = ACKS.recordLore(c, { text: 'fact about the keep', subjectIds: ['hex-keep', 'dom-march'] });
  const l2 = ACKS.recordLore(c, { text: 'an unrelated fact', subjectIds: ['hex-far'] });

  ok('loreOnSubject(hex-keep) → [l1]', ACKS.loreOnSubject(c, 'hex-keep').length === 1 && ACKS.loreOnSubject(c, 'hex-keep')[0] === l1);
  ok('loreOnSubject(dom-march) → [l1]', ACKS.loreOnSubject(c, 'dom-march')[0] === l1);
  ok('loreOnSubject(hex-far) → [l2]', ACKS.loreOnSubject(c, 'hex-far')[0] === l2);
  ok('loreOnSubject(none) → []', ACKS.loreOnSubject(c, 'hex-none').length === 0);

  ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l1.id, certainty: 'probable', silent: true });
  ACKS.learnLore(c, { knowerId: 'chr-b', loreId: l1.id, certainty: 'suspected', silent: true });
  ok('loreKnowers(l1) → 2 stored knowers', ACKS.loreKnowers(c, l1.id).length === 2);
  ok('loreKnowers(l2) → 0', ACKS.loreKnowers(c, l2.id).length === 0);

  // loreKnownBy: second-hand stored ∪ first-hand derived. chr-a has the stored l1 record + (after an
  // event names it as witness) a first-hand row. Seed a witnessed event by gm-fiat tagging chr-a.
  const ev = ACKS.newEvent('gm-fiat', { payload: { target: { kind: 'character', id: 'chr-a' }, mutation: { fieldPath: 'notes', newValue: 'saw the lair', reason: 'witnessed' } } });
  ACKS.setEventContext(ev, { relatedEntities: [{ kind: 'character', id: 'chr-a', role: 'witness' }] });
  ev.status = 'applied'; ev.appliedAtTurn = 7;
  c.eventLog.push({ event: ev, result: { narrativeSummary: 'Aelric saw the lair' }, appliedAtTurn: 7 });

  const known = ACKS.loreKnownBy(c, 'character', 'chr-a');
  ok('loreKnownBy includes the stored second-hand record', known.some(r => !r.firstHand && r.loreId === l1.id));
  ok('loreKnownBy includes the derived first-hand event', known.some(r => r.firstHand && r.eventId === ev.id));
  ok('firstHandLore(chr-a) derives the witnessed gm-fiat (certain)', ACKS.firstHandLore(c, 'chr-a').some(r => r.eventId === ev.id && r.certainty === 'certain'));
  ok('loreKnownBy secondHandOnly drops the first-hand rows', ACKS.loreKnownBy(c, 'character', 'chr-a', { secondHandOnly: true }).every(r => !r.firstHand));

  // collective Knower (a faction) = ∪ members + any org-filed record
  ACKS.learnLore(c, { knowerKind: 'faction', knowerId: 'fac-x', loreId: l2.id, certainty: 'probable', silent: true }); // org-filed intel
  const coll = ACKS.loreKnownByCollective(c, 'faction', 'fac-x', ['chr-a', 'chr-b']);
  ok('collective knows l1 (members) + l2 (org-filed)', coll.some(r => r.loreId === l1.id) && coll.some(r => r.loreId === l2.id));
})();

// =============================================================================
section('forgetLore — drop a stored record (forget, no archive)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Forget' });
  c.characters.push(ACKS.blankCharacter({ id: 'chr-a' }));
  const l = ACKS.recordLore(c, { text: 'a thing' });
  ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'certain', silent: true });
  ok('forgetLore returns true on a held record', ACKS.forgetLore(c, { knowerId: 'chr-a', loreId: l.id }) === true);
  ok('forgetLore removes the record', c.knowledge.length === 0);
  ok('forgetLore on a missing record → false', ACKS.forgetLore(c, { knowerId: 'chr-a', loreId: l.id }) === false);
})();

// =============================================================================
// WAVE B (team burst11, 2026-06-20) — Knowledge_Layer_Plan.md §6/§7.
// =============================================================================

// =============================================================================
section('Wave B — knowledge-tracking master house rule (default OFF) + 📚 category + gate');
// =============================================================================
(function(){
  const reg = ACKS.lookupHouseRule('knowledge-tracking');
  ok('lookupHouseRule(knowledge-tracking) exists', !!reg);
  ok('knowledge-tracking category is "knowledge"', reg && reg.category === 'knowledge');
  ok('knowledge-tracking has NO default:true (default OFF)', reg && reg.default !== true);
  ok('HOUSERULE_CATEGORIES has a knowledge category', ACKS.HOUSERULE_CATEGORIES.some(c => c.id === 'knowledge'));
  // the gate helper
  const c = ACKS.blankCampaign({ name: 'Gate' });
  ok('isKnowledgeTrackingOn — absent rule → OFF (opt-in)', ACKS.isKnowledgeTrackingOn(c) === false);
  c.houseRules = { 'knowledge-tracking': true };
  ok('isKnowledgeTrackingOn — enabled → ON', ACKS.isKnowledgeTrackingOn(c) === true);
  c.houseRules = { 'knowledge-tracking': { enabled: false } };
  ok('isKnowledgeTrackingOn — explicit { enabled:false } → OFF', ACKS.isKnowledgeTrackingOn(c) === false);
  // orthogonality (plan §3): rumors-manual ⊥ knowledge-tracking
  const c2 = ACKS.blankCampaign({ name: 'Orth' }); c2.houseRules = { 'rumors-manual': true };
  ok('rumors-manual ON does NOT enable knowledge-tracking (⊥)', ACKS.isKnowledgeTrackingOn(c2) === false);
})();

// =============================================================================
section('Wave B — rumor → lore promotion (loreKind:rumor) + idempotency + rumor-Lore extension');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Promote' }); c.currentTurn = 5;
  c.rumors = [ ACKS.blankRumor({ id: 'rum-1', text: 'The baron is secretly a wereboar', truthLevel: 'true', apparentLevel: 'rare', topic: 'scandal' }) ];
  ok('promotableRumors lists the unpromoted rumor', ACKS.promotableRumors(c).length === 1 && ACKS.promotableRumors(c)[0].id === 'rum-1');
  ok('loreFromRumor null before promotion', ACKS.loreFromRumor(c, 'rum-1') === null);

  const r = ACKS.promoteRumorToLore(c, { rumorId: 'rum-1' });
  ok('promote ok + created', r.ok === true && r.created === true);
  ok('promoted lore is loreKind "rumor"', r.lore.loreKind === 'rumor');
  ok('promoted truthValue mapped true→true', r.lore.truthValue === 'true');
  ok('promoted lore carries sourceRumorId (rumor-Lore extension)', r.lore.sourceRumorId === 'rum-1');
  ok('promoted lore carries apparentLevel (rare)', r.lore.apparentLevel === 'rare');
  ok('promoted lore carries reach[] extension', Array.isArray(r.lore.reach));
  ok('promoted lore pushed to campaign.lore', c.lore.length === 1 && c.lore[0] === r.lore);
  ok('promoted lore stamps a promoted-from-rumor history entry', r.lore.history.some(h => h.type === 'promoted-from-rumor' && h.rumorId === 'rum-1'));
  ok('promote emits a rumor-promoted event (applied)', (c.eventLog || []).some(e => e.event && e.event.kind === 'rumor-promoted' && e.event.status === 'applied'));
  ok('rumor-promoted surfaces in loreHistory(lore)', ACKS.loreHistory(c, r.lore.id).some(e => e.event && e.event.kind === 'rumor-promoted'));

  // idempotent — a rumor promotes once
  const r2 = ACKS.promoteRumorToLore(c, { rumorId: 'rum-1' });
  ok('promote idempotent (alreadyPromoted, same lore, not created)', r2.ok === true && r2.alreadyPromoted === true && r2.lore === r.lore && r2.created === false);
  ok('idempotent — no 2nd lore', c.lore.length === 1);
  ok('idempotent — no 2nd rumor-promoted event', (c.eventLog || []).filter(e => e.event && e.event.kind === 'rumor-promoted').length === 1);
  ok('loreFromRumor resolves after promotion', ACKS.loreFromRumor(c, 'rum-1') === r.lore);
  ok('promotableRumors empty after promotion; rumor KEPT (non-destructive)', ACKS.promotableRumors(c).length === 0 && c.rumors.length === 1);

  // truth-level mapping mixed → partial
  c.rumors.push(ACKS.blankRumor({ id: 'rum-2', text: 'a tangled tale', truthLevel: 'mixed' }));
  ok('promote maps truthLevel mixed → partial', ACKS.promoteRumorToLore(c, { rumorId: 'rum-2' }).lore.truthValue === 'partial');

  // reach-derived apparent level + settlement reach (the rumor-emit path, no top-level apparentLevel)
  c.rumors.push({ id: 'rum-r', text: 'reach rumor', truthLevel: 'false', topic: 'war', reach: [{ settlementId: 'set-x', apparentLevel: 'obscure' }] });
  const rr = ACKS.promoteRumorToLore(c, { rumorId: 'rum-r' });
  ok('promote derives apparentLevel from reach[] when no top-level', rr.lore.apparentLevel === 'obscure');
  ok('promote maps truthLevel false → false', rr.lore.truthValue === 'false');
  ok('promote carries reach[] from the rumor', rr.lore.reach.length === 1 && rr.lore.reach[0].settlementId === 'set-x');
  ok('rumor-promoted context tags the reached settlement', ACKS.loreHistory(c, rr.lore.id).some(e => (e.event.context.relatedEntities || []).some(x => x.kind === 'settlement' && x.id === 'set-x')));

  // consume:true removes the source rumor (the eventual rumors-live-as-lore migration)
  c.rumors.push(ACKS.blankRumor({ id: 'rum-3', text: 'consume me' }));
  const r4 = ACKS.promoteRumorToLore(c, { rumorId: 'rum-3', consume: true });
  ok('promote consume:true removes the source rumor', r4.consumed === true && !c.rumors.some(x => x.id === 'rum-3'));

  // guards
  ok('promote unknown rumor → no-rumor', ACKS.promoteRumorToLore(c, { rumorId: 'rum-nope' }).reason === 'no-rumor');
  ok('promote missing rumorId → missing-args', ACKS.promoteRumorToLore(c, {}).reason === 'missing-args');
  ok('promote no campaign → no-campaign', ACKS.promoteRumorToLore(null, { rumorId: 'rum-1' }).reason === 'no-campaign');
})();

// =============================================================================
section('Wave B — loreProvenanceChain (the DF told-by gossip trace)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Chain' }); c.currentTurn = 4;
  c.characters.push(ACKS.blankCharacter({ id: 'chr-a', name: 'Aelric' }), ACKS.blankCharacter({ id: 'chr-b', name: 'Bryn' }), ACKS.blankCharacter({ id: 'chr-c', name: 'Cass' }));
  const l = ACKS.recordLore(c, { text: 'the bandits camp at the old mill' });
  // Aelric deduces it, tells Bryn, Bryn tells Cass
  ACKS.learnLore(c, { knowerId: 'chr-a', loreId: l.id, certainty: 'certain', source: { kind: 'deduced', byId: 'chr-a' }, silent: true });
  ACKS.shareLore(c, { fromKnowerId: 'chr-a', toKnowerId: 'chr-b', loreId: l.id });
  ACKS.shareLore(c, { fromKnowerId: 'chr-b', toKnowerId: 'chr-c', loreId: l.id });

  const chain = ACKS.loreProvenanceChain(c, 'character', 'chr-c', l.id);
  ok('chain has 3 hops c → b → a', chain.length === 3 && chain[0].knowerId === 'chr-c' && chain[1].knowerId === 'chr-b' && chain[2].knowerId === 'chr-a');
  ok('chain hop sources: told-by, told-by, deduced', chain[0].sourceKind === 'told-by' && chain[1].sourceKind === 'told-by' && chain[2].sourceKind === 'deduced');
  ok('chain byId links each hop to the next teller', chain[0].sourceById === 'chr-b' && chain[1].sourceById === 'chr-a');
  ok('chain terminal at the deduced origin', chain[2].terminal === true && chain[2].hasRecord === true);

  const chainB = ACKS.loreProvenanceChain(c, 'character', 'chr-b', l.id);
  ok('chain from b → 2 hops b → a, terminal deduced', chainB.length === 2 && chainB[1].knowerId === 'chr-a' && chainB[1].terminal === true);

  // a knower who holds no stored record → single terminal hop, hasRecord false
  const chainZ = ACKS.loreProvenanceChain(c, 'character', 'chr-z', l.id);
  ok('chain for a non-knower → 1 terminal no-record hop', chainZ.length === 1 && chainZ[0].hasRecord === false && chainZ[0].terminal === true);
  ok('chain guards — no loreId → []', ACKS.loreProvenanceChain(c, 'character', 'chr-c', null).length === 0);

  // cycle guard — x told-by y, y told-by x → terminates, no infinite loop
  const c2 = ACKS.blankCampaign({ name: 'Cycle' });
  c2.characters.push(ACKS.blankCharacter({ id: 'chr-x' }), ACKS.blankCharacter({ id: 'chr-y' }));
  const l2 = ACKS.recordLore(c2, { text: 'loop' });
  ACKS.learnLore(c2, { knowerId: 'chr-x', loreId: l2.id, certainty: 'probable', source: { kind: 'told-by', byId: 'chr-y' }, silent: true });
  ACKS.learnLore(c2, { knowerId: 'chr-y', loreId: l2.id, certainty: 'probable', source: { kind: 'told-by', byId: 'chr-x' }, silent: true });
  ok('chain cycle-guarded (x ↔ y) — terminates at 2 hops', ACKS.loreProvenanceChain(c2, 'character', 'chr-x', l2.id).length === 2);
})();

// =============================================================================
section('Event kinds registered + wizard-opt-out');
// =============================================================================
ok('EVENT_KINDS includes lore-learned', ACKS.EVENT_KINDS.includes('lore-learned'));
ok('EVENT_KINDS includes lore-shared', ACKS.EVENT_KINDS.includes('lore-shared'));
ok('EVENT_KINDS includes rumor-promoted (Wave B)', ACKS.EVENT_KINDS.includes('rumor-promoted'));
ok('EVENT_SCHEMAS has lore-learned', !!ACKS.EVENT_SCHEMAS['lore-learned']);
ok('EVENT_SCHEMAS has lore-shared', !!ACKS.EVENT_SCHEMAS['lore-shared']);
ok('EVENT_SCHEMAS has rumor-promoted (Wave B)', !!ACKS.EVENT_SCHEMAS['rumor-promoted']);
ok('lore-learned is wizard-opt-out (owned by learnLore)', ACKS.EVENT_WIZARD_OPTOUT.has('lore-learned'));
ok('lore-shared is wizard-opt-out (owned by shareLore)', ACKS.EVENT_WIZARD_OPTOUT.has('lore-shared'));
ok('rumor-promoted is wizard-opt-out (owned by promoteRumorToLore)', ACKS.EVENT_WIZARD_OPTOUT.has('rumor-promoted'));

// =============================================================================
section('WAVE A GUARD — templates + demo STAY migrate-no-ops (no lore/knowledge lazy-inject)');
// =============================================================================
// Wave A added lore/knowledge to blankCampaign ONLY (read defensively); nothing to migrateCampaign.
// So every shipped template + the demo must still be a TRUE migrate-no-op (JSON-identical), and a
// template/demo must NOT gain lore/knowledge on load. (Mirrors religion.smoke.js / migrations.smoke §P3.6.)
require(path.join(REPO, 'acks-demo-template.js'));
const DEMO = global.ACKS_DEMO_TEMPLATE;
ok('demo template loaded', DEMO && DEMO.kind === 'campaign');
ok('migrate(demo) is a TRUE no-op (JSON-identical)', JSON.stringify(ACKS.migrateCampaign(clone(DEMO))) === JSON.stringify(clone(DEMO)));
const migDemo = ACKS.migrateCampaign(clone(DEMO));
ok('migrated demo did NOT gain a lore field (no lazy-inject)', !('lore' in migDemo));
ok('migrated demo did NOT gain a knowledge field (no lazy-inject)', !('knowledge' in migDemo));
(function(){
  const dir = path.join(REPO, 'Templates');
  let templateFiles = [];
  try { templateFiles = fs.readdirSync(dir).filter(f => f.endsWith('.acks.json')); } catch(_){}
  ok('found shipped templates to check', templateFiles.length === 6, 'found ' + templateFiles.length);
  for(const f of templateFiles){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch(e){ ok('template parses: ' + f, false, e.message); continue; }
    const migrated = ACKS.migrateCampaign(clone(raw));
    ok('template "' + f + '" is a TRUE migrate-no-op', JSON.stringify(migrated) === JSON.stringify(clone(raw)));
  }
})();

// =============================================================================
console.log('\n=============================================');
console.log('knowledge.smoke.js — ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('=============================================');
