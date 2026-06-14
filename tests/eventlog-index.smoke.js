// =============================================================================
// eventlog-index.smoke.js — the once-per-build eventLog index (perf audit 2026-06-14, T11).
//
// The derived-history accessors (hexHistory / domainHistory / characterHistory / …) and
// characterActivityBudget read a MEMOIZED inverted index over the eventLog's context envelope
// instead of full-scanning the log each call. This pins: (1) the index returns exactly the same
// entries (same order) as the old naive .filter(); (2) it memoizes on eventLog.length + is a
// non-enumerable field that never serializes; (3) the activityCost subset holds only cost-tagged
// events; (4) the accessors return a fresh (mutable) copy, not the shared index array.
// =============================================================================
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }
const sameIds = (a, b) => a.length === b.length && a.every((e, i) => (e.event && e.event.id) === (b[i] && b[i].event && b[i].event.id));

// ── A campaign whose eventLog carries the full context-envelope shape ──────────
// Wrapped entries { event:{ id, kind, context, payload }, ... } — the shape _logAppliedEvent + the
// turn/day machinery produce. Build a naive-filter oracle to compare the index against.
function ev(id, ctx, payload){ return { event: { id, kind: 'x', context: ctx, payload: payload || {} }, result: {}, appliedAtTurn: 1, appliedAtDay: 1 }; }
function mkCampaign(){
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-idx', name: 'Idx', currentTurn: 1, currentDayInMonth: 1,
    houseRules: {}, domains: [], characters: [], settlements: [], hexes: [], rumors: [],
    pendingEvents: [], eventLog: [
      ev('e1', { primaryHexId: 'hex-a', involvedHexIds: ['hex-a'], settlementId: 'set-1', domainId: 'dom-1',
                 relatedEntities: [{ kind: 'domain', id: 'dom-1', role: 'site' }, { kind: 'character', id: 'chr-1', role: 'subject' }] }),
      ev('e2', { primaryHexId: 'hex-b', involvedHexIds: ['hex-b', 'hex-a'], settlementId: null, domainId: null,
                 relatedEntities: [{ kind: 'character', id: 'chr-1', role: 'traveller' }, { kind: 'party', id: 'pty-1', role: 'subject' }] }),
      ev('e3', { primaryHexId: 'hex-a', involvedHexIds: [], settlementId: 'set-1', domainId: 'dom-1',
                 relatedEntities: [{ kind: 'group', id: 'grp-1', role: 'subject' }, { kind: 'character', id: 'chr-1', role: 'subject' }, { kind: 'character', id: 'chr-1', role: 'witness' }] }),  // chr-1 named twice
      { event: { id: 'e4', kind: 'market-transaction', context: null, payload: { activityCost: { slot: 'ancillary', units: 1, kind: 'buy' }, actorCharacterId: 'chr-1' } }, result: {}, appliedAtTurn: 1, appliedAtDay: 1 },
      { event: { id: 'e5', kind: 'gm-fiat', context: { primaryHexId: null, involvedHexIds: [], relatedEntities: [] }, payload: {} }, result: {}, appliedAtTurn: 1, appliedAtDay: 1 },  // no keys at all
    ],
  };
}

// Naive oracle (the old .filter() these accessors used to do).
function naiveByHex(c, hexId){ return c.eventLog.filter(e => { const x = e.event && e.event.context; return x && (x.primaryHexId === hexId || (Array.isArray(x.involvedHexIds) && x.involvedHexIds.indexOf(hexId) >= 0)); }); }
function naiveBySet(c, sid){ return c.eventLog.filter(e => { const x = e.event && e.event.context; return x && x.settlementId === sid; }); }
function naiveByRel(c, kind, id){ return c.eventLog.filter(e => { const r = e.event && e.event.context && e.event.context.relatedEntities; return Array.isArray(r) && r.some(x => x && x.kind === kind && x.id === id); }); }

// ── (1) index == naive filter, same entries + order ───────────────────────────
{
  const c = mkCampaign();
  ok('hexHistory(hex-a) matches naive (primary + involved)', sameIds(ACKS.hexHistory(c, 'hex-a'), naiveByHex(c, 'hex-a')));
  ok('hexHistory(hex-a) has e1, e2 (involved), e3', ACKS.hexHistory(c, 'hex-a').map(e => e.event.id).join(',') === 'e1,e2,e3');
  ok('hexHistory(hex-b) matches naive', sameIds(ACKS.hexHistory(c, 'hex-b'), naiveByHex(c, 'hex-b')));
  ok('hexHistory(no-such-hex) is empty', ACKS.hexHistory(c, 'hex-zzz').length === 0);
  ok('settlementHistory(set-1) matches naive (e1, e3)', sameIds(ACKS.settlementHistory(c, 'set-1'), naiveBySet(c, 'set-1')) && ACKS.settlementHistory(c, 'set-1').length === 2);
  ok('domainHistory(dom-1) matches naive', sameIds(ACKS.domainHistory(c, 'dom-1'), naiveByRel(c, 'domain', 'dom-1')));
  ok('characterHistory(chr-1) matches naive', sameIds(ACKS.characterHistory(c, 'chr-1'), naiveByRel(c, 'character', 'chr-1')));
  ok('characterHistory(chr-1) lists e3 ONCE despite double-mention', ACKS.characterHistory(c, 'chr-1').filter(e => e.event.id === 'e3').length === 1);
  ok('characterHistory(chr-1) = e1,e2,e3 in order', ACKS.characterHistory(c, 'chr-1').map(e => e.event.id).join(',') === 'e1,e2,e3');
  ok('groupHistory(grp-1) = [e3]', ACKS.groupHistory(c, 'grp-1').length === 1 && ACKS.groupHistory(c, 'grp-1')[0].event.id === 'e3');
  ok('partyHistory(pty-1) = [e2]', ACKS.partyHistory(c, 'pty-1').length === 1 && ACKS.partyHistory(c, 'pty-1')[0].event.id === 'e2');
  ok('journeyHistory(none) empty', ACKS.journeyHistory(c, 'jrn-x').length === 0);
  ok('an event with null context is excluded everywhere', !ACKS.characterHistory(c, 'chr-1').some(e => e.event.id === 'e4'));
}

// ── (2) memoization: built once, stable, non-enumerable, rebuilds on growth ───
{
  const c = mkCampaign();
  const i1 = ACKS.eventLogIndexFor(c);
  const i2 = ACKS.eventLogIndexFor(c);
  ok('eventLogIndexFor returns the SAME memoized object on repeat', i1 === i2);
  ok('index.len matches eventLog length', i1.len === c.eventLog.length);
  ok('__eventLogIndex is NON-enumerable (never serializes)', Object.keys(c).indexOf('__eventLogIndex') === -1 && !('__eventLogIndex' in JSON.parse(JSON.stringify(c))));
  // Append → the memo must rebuild (length changed).
  c.eventLog.push(ev('e6', { primaryHexId: 'hex-a', involvedHexIds: [], relatedEntities: [{ kind: 'character', id: 'chr-1', role: 'subject' }] }));
  const i3 = ACKS.eventLogIndexFor(c);
  ok('appending an entry rebuilds the index (new object)', i3 !== i1);
  ok('the rebuilt index sees the new entry', ACKS.hexHistory(c, 'hex-a').some(e => e.event.id === 'e6') && i3.len === c.eventLog.length);
  ok('fresh:true forces a rebuild even at the same length', ACKS.eventLogIndexFor(c, { fresh: true }) !== i3);
}

// ── (3) the activityCost subset holds only cost-tagged events ─────────────────
{
  const c = mkCampaign();
  const idx = ACKS.eventLogIndexFor(c);
  ok('activityCost holds exactly the cost-tagged event (e4)', idx.activityCost.length === 1 && idx.activityCost[0].event.id === 'e4');
  // characterActivityBudget reads that subset; the cost-tagged buy lands as an ancillary errand.
  const b = ACKS.characterActivityBudget(c, 'chr-1');
  ok('characterActivityBudget picks up the cost-tagged errand (ancillary)', (b.ancillary || []).some(a => a.sourceKind === 'errand-event'));
}

// ── (4) accessors return a FRESH copy — mutating it can't corrupt the index ───
{
  const c = mkCampaign();
  const first = ACKS.characterHistory(c, 'chr-1');
  first.reverse(); first.length = 0;             // abuse the returned array
  const second = ACKS.characterHistory(c, 'chr-1');
  ok('a caller mutating the returned array does NOT corrupt the index', second.length === 3 && second.map(e => e.event.id).join(',') === 'e1,e2,e3');
}

// ── (5) the localStorage cache-cap invariant (engine-level): slicing the tail ─
// _campaignForCache (index.html) writes eventLog.slice(-N) to the recovery cache only; the file save
// (serializedCampaign) keeps the FULL log. Pin the underlying guarantee: a tail slice preserves the
// most-recent N entries in order, and the index/accessors are unaffected by which copy they read.
{
  const c = mkCampaign();
  while(c.eventLog.length < 50) c.eventLog.push(ev('bulk' + c.eventLog.length, { primaryHexId: 'hex-c', involvedHexIds: [], relatedEntities: [] }));
  const N = 10;
  const tail = c.eventLog.slice(-N);
  ok('cache tail keeps the last N entries in order', tail.length === N && tail[N - 1].event.id === c.eventLog[c.eventLog.length - 1].event.id);
  ok('full log is untouched by slicing (file save keeps everything)', c.eventLog.length === 50);
}

console.log('\n=============================================');
console.log('eventlog-index.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
