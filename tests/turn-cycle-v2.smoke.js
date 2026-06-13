/* Turn Cycle v2 smoke test (Foundation #12.10)
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/turn-cycle-v2.smoke.js
 *
 * Exercises:
 *   - Event factory + validator
 *   - applyEvent dispatch for treasury-grant, treasury-debit, gm-fiat,
 *     character-update, adventure-result, daw-result, claude-event
 *   - Apply-order sort: timed events first by gameTimeAt, then untimed by submittedAt
 *   - migratePendingPlayerInputToEvents (lazy migration of legacy field)
 *   - Top-level collections lift (Foundation #193) on a self-contained fixture
 *   - Rumor emit + reach helpers
 *
 * Authored 2026-05-27. Repaired 2026-05-31 (post-audit): the original required only
 * acks-engine.js, which since the 2026-05-28 module split no longer carries the event
 * system (EVENT_KINDS et al. moved to acks-engine-events.js) — so it threw on load.
 * Now loads all seven modules, and the Foundation-#193 lift check builds its own
 * nested-only fixture instead of depending on a shipped template's on-disk shape.
 */

const path = require('path');
const fs = require('fs');
// Load all engine modules in order; each accumulates onto global.ACKS.
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0;
let failed = 0;

function check(label, cond, detail){
  if(cond){
    passed++;
  } else {
    console.log('  FAIL ' + label + (detail ? '  -- ' + detail : ''));
    failed++;
  }
}

console.log('--- Engine surface ---');
check('SCHEMA_VERSION is 2', ACKS.SCHEMA_VERSION === 2);
check('EVENT_KINDS is a non-trivial array', Array.isArray(ACKS.EVENT_KINDS) && ACKS.EVENT_KINDS.length >= 13, 'got ' + (ACKS.EVENT_KINDS && ACKS.EVENT_KINDS.length));
check('EVENT_KINDS includes the launch set', ['player-plan','gm-fiat','treasury-grant','treasury-debit','character-update','adventure-result','daw-result','claude-event'].every(k => ACKS.EVENT_KINDS.includes(k)));
check('EVENT_STATUS has PENDING', ACKS.EVENT_STATUS.PENDING === 'pending');
check('applyEvent is a function', typeof ACKS.applyEvent === 'function');
check('newEvent is a function', typeof ACKS.newEvent === 'function');
check('sortEventsForApply is a function', typeof ACKS.sortEventsForApply === 'function');

console.log('--- Factory + validation ---');
const e1 = ACKS.newEvent('treasury-grant', {
  payload: { domainId: 'dom-test', amount: 100, label: 'test grant' }
});
check('newEvent assigns id', /^evt-/.test(e1.id));
check('newEvent assigns submittedAt', !!e1.submittedAt);
check('newEvent defaults submittedBy to gm', e1.submittedBy === 'gm');
check('newEvent defaults status to pending', e1.status === 'pending');
ACKS.validateEvent(e1);
check('validateEvent passes well-formed event', true);

let threw = false;
try {
  ACKS.validateEvent({ id: 'evt-x', kind: 'unknown-kind', submittedBy: 'gm', submittedAt: 'now', targetTurn: 1, status: 'pending', payload: {} });
} catch(e) { threw = true; }
check('validateEvent rejects unknown kind', threw);

threw = false;
try {
  const bad = ACKS.newEvent('treasury-grant', { payload: { domainId: 'dom-x' } }); // missing amount + label
  ACKS.validateEvent(bad);
} catch(e) { threw = true; }
check('validateEvent rejects missing required field', threw);

console.log('--- Apply-order sort (Decision 2, locked) ---');
// Explicit submittedAt values so the untimed insertion-order tiebreak is deterministic
// (newEvent auto-stamps "now", which can collide on the same millisecond and fall through
// to a random id tiebreak — that made this check intermittently flaky).
const a = ACKS.newEvent('gm-fiat', { submittedAt:'2026-01-01T00:00:01.000Z', payload: { target:{kind:'campaign',id:'x'}, mutation:{fieldPath:'name',newValue:'A'} } });
const b = ACKS.newEvent('gm-fiat', { submittedAt:'2026-01-01T00:00:02.000Z', payload: { target:{kind:'campaign',id:'x'}, mutation:{fieldPath:'name',newValue:'B'} } });
const tEarly = ACKS.newEvent('gm-fiat', { submittedAt:'2026-01-01T00:00:03.000Z', payload: { target:{kind:'campaign',id:'x'}, mutation:{fieldPath:'name',newValue:'TE'} }, gameTimeAt:{year:1,month:1,day:5} });
const tLate = ACKS.newEvent('gm-fiat', { submittedAt:'2026-01-01T00:00:04.000Z', payload: { target:{kind:'campaign',id:'x'}, mutation:{fieldPath:'name',newValue:'TL'} }, gameTimeAt:{year:1,month:1,day:12} });
const sorted = ACKS.sortEventsForApply([a, tLate, b, tEarly]);
check('timed events sort first', !!sorted[0].gameTimeAt && !!sorted[1].gameTimeAt);
check('within timed, earlier day first', sorted[0] === tEarly, 'expected tEarly first, got ' + sorted[0].id);
check('within timed, later day second', sorted[1] === tLate);
check('untimed events after timed, in insertion order', sorted[2] === a && sorted[3] === b);

console.log('--- Lazy migration of pendingPlayerInput ---');
const camp1 = ACKS.blankCampaign({ name: 'Migration test' });
const d1 = ACKS.blankDomain({ name: 'D1' }); d1.pendingPlayerInput = 'Build a palisade';
const d2 = ACKS.blankDomain({ name: 'D2' }); d2.pendingPlayerInput = { notes: 'Patrol', intendedActions: [{kind:'patrol'}] };
const d3 = ACKS.blankDomain({ name: 'D3' });
camp1.domains.push(d1, d2, d3);
ACKS.migratePendingPlayerInputToEvents(camp1);
check('two events generated', camp1.pendingEvents.length === 2);
check('first event is player-plan', camp1.pendingEvents[0].kind === 'player-plan');
check('first event submittedBy is legacy-migration', camp1.pendingEvents[0].submittedBy === 'player:legacy-migration');
check('first event preserves freeformNotes', camp1.pendingEvents[0].payload.freeformNotes.indexOf('palisade') >= 0);
check('second event preserves intendedActions', camp1.pendingEvents[1].payload.intendedActions.length === 1);
check('D1 pendingPlayerInput cleared', d1.pendingPlayerInput === null);
check('D3 untouched', d3.pendingPlayerInput == null);

console.log('--- Handler smoke (migrated frontier-barony template) ---');
const camp = ACKS.migrateCampaign(JSON.parse(fs.readFileSync(path.join(__dirname,'..','Templates','v2-frontier-barony.acks.json'),'utf8')));
const tBefore = camp.domains[0].treasury.gp;
const grantEv = ACKS.newEvent('treasury-grant', {
  payload: { domainId: 'dom-barony-of-thornreach', amount: 500, label: 'adventurer windfall' }
});
const grantR = ACKS.applyEvent(camp, grantEv);
check('treasury increased by 500', camp.domains[0].treasury.gp === tBefore + 500);
check('grant result reports treasuryDelta', grantR.result.treasuryDelta === 500);
check('grant result mentions domain', grantR.result.domainsChanged[0] === 'dom-barony-of-thornreach');

const tBeforeDebit = camp.domains[0].treasury.gp;
const debitEv = ACKS.newEvent('treasury-debit', {
  payload: { domainId: 'dom-barony-of-thornreach', amount: 200, label: 'repairs', reason: 'storm damage' }
});
ACKS.applyEvent(camp, debitEv);
check('treasury decreased by 200', camp.domains[0].treasury.gp === tBeforeDebit - 200);

const fiatEv = ACKS.newEvent('gm-fiat', {
  payload: { target:{kind:'domain', id:'dom-barony-of-thornreach'}, mutation:{fieldPath:'demographics.moraleNotes', newValue:'Fiat-set value', reason:'cleanup'} }
});
const fiatR = ACKS.applyEvent(camp, fiatEv);
check('fiat applied new value', camp.domains[0].demographics.moraleNotes === 'Fiat-set value');
check('fiat captures previousValue', 'previousValue' in fiatR.result);

const ch = camp.characters[0];
const xpBefore = ch.xp;
const hpBefore = ch.hp.current;
const updateEv = ACKS.newEvent('character-update', {
  submittedBy: 'tool:test',
  payload: { characterId: ch.id, fieldUpdates: { 'xp': xpBefore + 1000, 'hp.current': hpBefore - 5 } }
});
ACKS.applyEvent(camp, updateEv);
check('character XP updated', ch.xp === xpBefore + 1000);
check('character hp.current updated via dotted path', ch.hp.current === hpBefore - 5);

// #476 M0 — lairs are first-class (campaign.lairs[]); the frontier template's legacy nested
// hex.lairs goblin warren is lifted on migrate. Check via lairsAtHex, not nested hex.lairs.
const lairsBefore = ACKS.lairsAtHex(camp, 'hex-thorn-wood');
check('thorn-wood goblin lair lifted to campaign.lairs before adventure', lairsBefore.length === 1 && lairsBefore[0].id === 'lai-thorn-wood-goblins');
check('the lifted goblin lair is active before adventure', lairsBefore[0].status === 'active');
check('nested hex.lairs cleared by the lift', (camp.domains[0].geography.hexes.find(h => h.id === 'hex-thorn-wood').lairs||[]).length === 0);
const advEv = ACKS.newEvent('adventure-result', {
  submittedBy: 'tool:rpgmaker-test',
  payload: {
    outcome: 'cleared',
    hexId: 'hex-thorn-wood',
    lairId: 'lai-thorn-wood-goblins',
    treasureAwarded: [{ kind:'gp', amount: 1200, label:'goblin hoard' }],
    xpAwarded: [{ characterId: 'chr-halvard-bold', xp: 1800 }],
    casualties: [{ characterId: 'chr-edrik-steady', outcome: 'wounded', hp: 12 }],
    narrativeSummary: 'Three hours of close fighting cleared the warren.'
  }
});
const advR = ACKS.applyEvent(camp, advEv);
const hexAfter = camp.domains[0].geography.hexes.find(h => h.id === 'hex-thorn-wood');
check('thorn-wood hex now explored', hexAfter.explored === true);
const lairAfter = ACKS.findLair(camp, 'lai-thorn-wood-goblins');
check('thorn-wood goblin lair flipped to cleared (structure remains, #476 M0)', lairAfter && lairAfter.status === 'cleared');
check('cleared lair stamped clearedByEventId', lairAfter.clearedByEventId === advEv.id);
check('halvard XP increased by 1800', camp.characters.find(c => c.id === 'chr-halvard-bold').xp >= xpBefore + 1800);
check('edrik HP set to 12', camp.characters.find(c => c.id === 'chr-edrik-steady').hp.current === 12);
check('adventure narrative composed', advR.result.narrativeSummary.indexOf('cleared') > 0);

const dawEv = ACKS.newEvent('daw-result', {
  payload: { outcome: 'defender-holds', defenderDomainId: 'dom-barony-of-thornreach', defenderLosses: [{unitId:'gar-thornreach-foot', count: 5}] }
});
const footBefore = camp.domains[0].garrison.units.find(u => u.id === 'gar-thornreach-foot').count;
ACKS.applyEvent(camp, dawEv);
const footAfter = camp.domains[0].garrison.units.find(u => u.id === 'gar-thornreach-foot').count;
check('daw losses applied to garrison count', footAfter === footBefore - 5);

const claudeEv = ACKS.newEvent('claude-event', {
  submittedBy: 'agent:claude-oracle',
  payload: {
    scope: 'domain',
    targetId: 'dom-barony-of-thornreach',
    title: 'Wandering preacher',
    narrativeText: 'A wandering preacher arrives in Thornreach, drawing pilgrim coin.',
    mechanicalEffect: { kind: 'treasury-grant', payload: { domainId: 'dom-barony-of-thornreach', amount: 80, label: 'pilgrim offerings' } }
  }
});
const treasuryBeforeClaude = camp.domains[0].treasury.gp;
const claudeR = ACKS.applyEvent(camp, claudeEv);
check('claude-event chained treasury-grant', camp.domains[0].treasury.gp === treasuryBeforeClaude + 80);
check('claude-event narrative mentions title', claudeR.result.narrativeSummary.indexOf('Wandering preacher') >= 0);

console.log('--- Top-level collections lift (Foundation #193) — self-contained fixture ---');
// Build a nested-only campaign so this test is independent of any shipped template's
// on-disk migration state. liftToTopLevelCollections must mirror nested hexes +
// settlements up to top-level, reference-unified, and be idempotent.
const liftC = ACKS.blankCampaign({ name: 'Lift fixture' });
const liftD = ACKS.blankDomain({ name: 'Lift March' });
liftD.geography = liftD.geography || {};
liftD.geography.hexes = [
  { id: 'hex-lift-1', coord: { q: 0, r: 0 }, families: 50, settlement: { id: 'set-lift-1', name: 'Lifttown', kind: 'town' } },
  { id: 'hex-lift-2', coord: { q: 1, r: 0 }, families: 40 },
];
liftD.geography.controlledHexes = 2;
liftC.domains.push(liftD);
check('top-level hexes empty before lift', !liftC.hexes || liftC.hexes.length === 0);
ACKS.liftToTopLevelCollections(liftC);
check('lift populated campaign.hexes', liftC.hexes.length === 2);
check('lift populated campaign.settlements', liftC.settlements.length === 1);
check('lifted hex carries domainId', liftC.hexes[0].domainId === liftD.id);
check('lifted hex is reference-unified with nested', liftC.hexes.find(h=>h.id==='hex-lift-1') === liftD.geography.hexes.find(h=>h.id==='hex-lift-1'));
ACKS.liftToTopLevelCollections(liftC);
check('lift is idempotent (still 2 hexes)', liftC.hexes.length === 2);
check('hexesForDomain returns 2', ACKS.hexesForDomain(liftC, liftD.id).length === 2);
check('findHex by id works', ACKS.findHex(liftC, 'hex-lift-1')?.id === 'hex-lift-1');
check('settlementForHex works', ACKS.settlementForHex(liftC, 'hex-lift-1')?.id === 'set-lift-1');

console.log('--- Rumor emit + reach helpers ---');
const camp3 = ACKS.migrateCampaign(JSON.parse(fs.readFileSync(path.join(__dirname,'..','Templates','v2-frontier-barony.acks.json'),'utf8')));
ACKS.liftToTopLevelCollections(camp3);
const settlementId = camp3.settlements[0].id;
const rumorEvt = ACKS.newEvent('rumor-emit', {
  payload: { scope: 'settlement', settlementId: settlementId, rumorText: 'Test rumor about something', apparentLevel: 'common', truthLevel: 'true', topic: 'wealth' }
});
ACKS.applyEvent(camp3, rumorEvt);
check('rumor-emit added one top-level rumor', camp3.rumors.length === 1);
check('rumor has reach entry for settlement', camp3.rumors[0].reach[0].settlementId === settlementId);
check('rumorsAtSettlement finds the rumor', ACKS.rumorsAtSettlement(camp3, settlementId).length === 1);

const testRumor = camp3.rumors[0];
ACKS.addRumorReach(testRumor, 'set-other', 'uncommon', 5, null);
check('addRumorReach added second reach entry', testRumor.reach.length === 2);
ACKS.addRumorReach(testRumor, 'set-other', 'rare', null, null);
check('addRumorReach (idempotent on same id) refreshes apparentLevel', testRumor.reach.find(r=>r.settlementId==='set-other').apparentLevel === 'rare');
check('addRumorReach still only has 2 entries (no duplicate)', testRumor.reach.length === 2);
ACKS.removeRumorReach(testRumor, 'set-other');
check('removeRumorReach drops the entry', testRumor.reach.length === 1);

console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Turn Cycle v2 + Foundation #193 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
