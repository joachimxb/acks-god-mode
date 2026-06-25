/* tests/event-context.smoke.js — D1 (audit 2026-06-24): the _deriveEventContext helper.
 *
 *   node tests/event-context.smoke.js   (or via `npm test`)
 *
 * The context envelope powers the derived-history accessors (domainHistory / hexHistory /
 * characterHistory read the inverted index built from event.context). Engine handlers set it
 * inline, but the GENERIC public write-path (newEvent + applyEvent — the documented integrator
 * path) left it all-null, so an externally-authored event fell out of every history view. D1
 * back-fills the envelope from the payload's well-known id fields. This suite proves: the
 * derivation (per-kind), the no-clobber rule, and the end-to-end "a public-path treasury-grant
 * shows up in domainHistory" repro the audit raised.
 */
'use strict';
const ACKS = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n— ' + t); }

// =============================================================================
section('deriveEventContext — back-fills the envelope from payload id fields');
const c1 = ACKS.deriveEventContext('treasury-grant', { domainId: 'dom-x', amount: 100, label: 'grant' });
ok('domain scalar set', c1.domainId === 'dom-x');
ok('domain lands in relatedEntities (so domainHistory finds it)', c1.relatedEntities.some(r => r.kind === 'domain' && r.id === 'dom-x'));

const c2 = ACKS.deriveEventContext('x', { characterId: 'chr-7', hexId: 'hex-3', settlementId: 'set-2' });
ok('character → relatedEntities', c2.relatedEntities.some(r => r.kind === 'character' && r.id === 'chr-7'));
ok('hexId → primaryHexId scalar', c2.primaryHexId === 'hex-3');
ok('settlementId → settlementId scalar', c2.settlementId === 'set-2');

const c3 = ACKS.deriveEventContext('x', { partyId: 'prt-1', journeyId: 'jrn-1', lairId: 'lai-1' });
ok('party / journey / lair all land as relatedEntities', ['party', 'journey', 'lair'].every(k => c3.relatedEntities.some(r => r.kind === k)));

const c4 = ACKS.deriveEventContext('x', { nothingRecognized: 'foo' });
ok('an unrecognized payload yields the empty envelope (no guesswork, no throw)',
  c4.domainId === null && c4.primaryHexId === null && c4.relatedEntities.length === 0);
ok('a null / non-object payload is safe', (function(){ try { const z = ACKS.deriveEventContext('x', null); return z.relatedEntities.length === 0; } catch(e){ return false; } })());

const c5 = ACKS.deriveEventContext('battle', { attackerDomainId: 'dom-a', defenderDomainId: 'dom-d' });
ok('multiple domain-role fields both land (attacker + defender)',
  c5.relatedEntities.some(r => r.id === 'dom-a') && c5.relatedEntities.some(r => r.id === 'dom-d'));

// =============================================================================
section('newEvent — derives context on the public path, never clobbers an explicit one');
const evPublic = ACKS.newEvent('treasury-grant', { submittedBy: 'tool:test', payload: { domainId: 'dom-y', amount: 50, label: 'pay' } });
ok('newEvent without opts.context derives it', evPublic.context.domainId === 'dom-y' && evPublic.context.relatedEntities.some(r => r.kind === 'domain' && r.id === 'dom-y'));

const explicit = { primaryHexId: null, involvedHexIds: [], settlementId: null, domainId: 'dom-EXPLICIT', relatedEntities: [{ kind: 'domain', id: 'dom-EXPLICIT', role: 'site' }] };
const evHandler = ACKS.newEvent('treasury-grant', { submittedBy: 'engine', context: explicit, payload: { domainId: 'dom-IGNORED', amount: 1, label: 'x' } });
ok('an explicit context is NOT clobbered by derivation', evHandler.context.domainId === 'dom-EXPLICIT' && evHandler.context === explicit);

// =============================================================================
section('end-to-end — a public-path treasury-grant appears in domainHistory (the audit repro)');
const camp = ACKS.blankCampaign({ name: 'ctx' });
camp.currentTurn = 1;
const dom = ACKS.blankDomain({ id: 'dom-mark', name: 'Mark' });
camp.domains = [dom];
camp.eventLog = camp.eventLog || [];
// Author via the public path exactly as an integrator would (newEvent → applyEvent → log).
const ev = ACKS.newEvent('treasury-grant', { submittedBy: 'tool:test', payload: { domainId: dom.id, amount: 250, label: 'a gift' } });
const res = ACKS.applyEvent(camp, ev);
ev.status = ACKS.EVENT_STATUS.APPLIED;
camp.eventLog.push({ event: ev, result: res.result, appliedAtTurn: 1, appliedAt: new Date().toISOString() });
const hist = ACKS.domainHistory(camp, dom.id);
ok('domainHistory is non-empty for the public-path event (was empty pre-D1)', hist.length > 0);
ok('domainHistory contains exactly that event', hist.some(e => (e.event || e).id === ev.id));
ok('hex/character history stay empty (no spurious context)', ACKS.characterHistory(camp, 'chr-none').length === 0);

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — event-context.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
