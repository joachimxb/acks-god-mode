/* tests/perf-snapshot.smoke.js — F1 + F2 (audit 2026-06-24): the rollback snapshot.
 *
 *   node tests/perf-snapshot.smoke.js   (or via `npm test`)
 *
 * F1 — the unbounded append-only eventLog is EXCLUDED from the per-applyEvent rollback clone (it was
 *      53 ms at 20k entries → seconds/commit). We assert it structurally: across a rollback the
 *      eventLog ARRAY + its entry objects keep their identity (never deep-cloned), any tail a handler
 *      appended is truncated back, and the ENTITY state is fully restored. Plus: top-level array
 *      identity (campaign.domains) survives a rollback, so a held reference can't be stranded.
 * F2 — commitTurn snapshots the accepted batch ONCE. A malformed event is PRE-VALIDATED out (rejected
 *      without an apply attempt, so it never touches the rollback path → a held domain ref stays live);
 *      a valid event whose handler throws drives the batch rollback + resilient per-event replay, and
 *      the turn still commits with the offender rejected.
 */
'use strict';
const ACKS = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n— ' + t); }
function makeRng(seed){ let s = seed >>> 0; return () => { s = (1103515245 * s + 12345) >>> 0; return s / 4294967296; }; }

// A campaign whose adventure-result handler mutates hex.explored, then throws on a bad domain.
function txnFixture(){
  const c = ACKS.blankCampaign({ name: 'perf' });
  c.currentTurn = 1;
  c.domains = [{ id: 'dom-1', name: 'Mark', treasury: { gp: 0 }, geography: {} }];
  c.hexes = [{ id: 'hex-1', domainId: 'dom-1', explored: false }];
  c.pendingEvents = []; c.eventLog = [];
  return c;
}
const throwingEv = () => ACKS.newEvent('adventure-result', { submittedBy: 'gm', payload: {
  outcome: 'cleared', hexId: 'hex-1',
  treasureAwarded: [{ kind: 'gp', amount: 1000, destinationDomainId: 'dom-DOES-NOT-EXIST', label: 'loot' }]
} });

// =============================================================================
section('F1 — applyEvent rollback restores entity state (handler throw)');
{
  const c = txnFixture();
  let threw = false;
  try { ACKS.applyEvent(c, throwingEv()); } catch(e){ threw = true; }
  ok('the handler threw', threw);
  ok('the target hex.explored rolled back to false', c.hexes[0].explored === false);
  ok('the treasury is unchanged', (c.domains[0].treasury.gp || 0) === 0);
}

// =============================================================================
section('F1 — the eventLog is EXCLUDED from the clone (array + entry identity preserved)');
{
  const c = txnFixture();
  const marker = { event: { id: 'pre-existing', kind: 'gm-narrative' }, result: {}, _marker: true };
  c.eventLog.push(marker);
  const logRef = c.eventLog;
  const lenBefore = c.eventLog.length;
  try { ACKS.applyEvent(c, throwingEv()); } catch(e){}
  ok('the eventLog ARRAY is the same object (not cloned + swapped)', c.eventLog === logRef);
  ok('the pre-existing entry is the SAME object (entries not deep-cloned)', c.eventLog[0] === marker);
  ok('the eventLog length is unchanged', c.eventLog.length === lenBefore);
}

// =============================================================================
section('F1 — a handler that appends to the eventLog has its tail truncated on rollback');
{
  ACKS.registerEventKind('__perf-append-throw', { schema: { R: {} }, wizardOptOut: true });
  ACKS.registerEventHandler('__perf-append-throw', function(campaign){
    campaign.eventLog.push({ event: { id: 'appended-by-handler' }, result: {} });  // a tail append
    campaign.domains[0].treasury.gp += 999;                                        // an entity mutation
    throw new Error('boom — after appending + mutating');
  });
  const c = txnFixture();
  const logRef = c.eventLog, lenBefore = c.eventLog.length, gpBefore = c.domains[0].treasury.gp;
  try { ACKS.applyEvent(c, ACKS.newEvent('__perf-append-throw', { submittedBy: 'gm', payload: {} })); } catch(e){}
  ok('the handler eventLog append is truncated back', c.eventLog.length === lenBefore && c.eventLog === logRef);
  ok('the handler entity mutation is rolled back', c.domains[0].treasury.gp === gpBefore);
}

// =============================================================================
section('F1/F2 — top-level array identity survives a rollback (the held-ref invariant)');
{
  const c = txnFixture();
  const domainsRef = c.domains, hexesRef = c.hexes;
  try { ACKS.applyEvent(c, throwingEv()); } catch(e){}
  ok('campaign.domains is the same array object after rollback', c.domains === domainsRef);
  ok('campaign.hexes is the same array object after rollback', c.hexes === hexesRef);
}

// =============================================================================
section('F2 — a malformed batch event is pre-validated out (never touches the rollback path)');
{
  const c = ACKS.blankCampaign({ name: 'f2' });
  c.currentTurn = 5;
  const d = ACKS.blankDomain({ id: 'dom-1', name: 'Mark' });
  c.domains = [d];
  // a treasury-grant missing its required `label` → fails validateEvent → pre-validated-rejected.
  const bad = ACKS.newEvent('treasury-grant', { submittedBy: 'tool:x', targetTurn: 5, payload: { domainId: d.id, amount: 10 } });
  c.pendingEvents = [bad];
  const heldDomain = c.domains[0];
  const domainsRef = c.domains;
  const prop = ACKS.proposeMonthlyTurn(c, { rng: makeRng(7) });
  const res = ACKS.commitTurn(c, prop, { rng: makeRng(7) });
  ok('commitTurn ran without error', !res.error, res.error);
  ok('the turn committed the domain math', res.committed > 0);
  ok('the malformed event is gone from pendingEvents (rejected)', !c.pendingEvents.some(e => e.id === bad.id));
  ok('the malformed event was logged as an engine error', c.eventLog.some(e => (e.event || e).id === bad.id && (e.event || e).status === ACKS.EVENT_STATUS.REJECTED));
  ok('a held campaign.domains[0] reference is STILL the live domain (off the rollback path)', c.domains[0] === heldDomain && c.domains === domainsRef);
}

// =============================================================================
section('F2 — a valid event whose HANDLER throws drives the batch rollback + resilient replay');
{
  const c = ACKS.blankCampaign({ name: 'f2b' });
  c.currentTurn = 5;
  const d = ACKS.blankDomain({ id: 'dom-1', name: 'Mark' });
  c.domains = [d];
  c.hexes = [ ACKS.blankHex({ id: 'hex-1', coord: { q: 0, r: 0 }, terrain: 'grassland' }) ];
  c.hexes[0].domainId = d.id;
  // a GOOD treasury-grant + a VALID-but-throwing adventure-result (unknown destination domain).
  const good = ACKS.newEvent('treasury-grant', { submittedBy: 'tool:x', targetTurn: 5, payload: { domainId: d.id, amount: 500, label: 'gift' } });
  const validThrows = ACKS.newEvent('adventure-result', { submittedBy: 'gm', targetTurn: 5, payload: {
    outcome: 'cleared', hexId: 'hex-1',
    treasureAwarded: [{ kind: 'gp', amount: 1000, destinationDomainId: 'dom-NOPE', label: 'loot' }]
  } });
  c.pendingEvents = [good, validThrows];
  const domainsRef = c.domains;
  const prop = ACKS.proposeMonthlyTurn(c, { rng: makeRng(3) });
  const res = ACKS.commitTurn(c, prop, { rng: makeRng(3) });
  ok('commitTurn ran without error', !res.error, res.error);
  ok('the turn still committed', res.committed > 0);
  ok('the GOOD event applied', c.eventLog.some(e => (e.event || e).id === good.id && (e.event || e).status === ACKS.EVENT_STATUS.APPLIED));
  ok('the valid-but-throwing event was rejected (resilient replay)', c.eventLog.some(e => (e.event || e).id === validThrows.id && (e.event || e).status === ACKS.EVENT_STATUS.REJECTED));
  ok('campaign.domains array identity survived the slow-path rollback', c.domains === domainsRef);
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — perf-snapshot.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
