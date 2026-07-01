/* Movement 2.0 · Team Session 1 · Lane C smoke test — party split / merge / D9 ephemeral lifecycle.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/movement-party.smoke.js
 *
 * Covers acks-engine-movement-party.js (_handoffs/_BUILDER_mv2-3_party.md):
 *   • the CANONICAL party-membership setter (addToParty / removeFromParty / moveToParty; one char per
 *     party; reconcile-clean per Architecture §5.10)
 *   • splitParty / splitJourney — halves the roster + divides shared stores (camp items + camp ration-
 *     days) with the parent keeping the rest by default; the follow (tracking-split) mode
 *   • mergeParties / mergeJourney — recombines two CO-LOCATED parties (co-location guard)
 *   • dissolveTravelParty / keepTravelParty / travelPartyArrivalPrompts — the D9 ephemeral lifecycle
 *   • the two self-registered record-only event kinds (journey-split / journey-merge)
 *   • migrate-no-op: the new lazy fields default cleanly (party.autoFormed false; blank round-trips)
 *
 * Authored 2026-07-01 (Movement 2.0 TS1 Lane C).
 */

require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

// Build a campaign with one party of `n` members at hex-a, its camp holding `rationDays` ration-days,
// `waterDays` camp water, and one gear item — the baseline for split/merge.
function build(n, opts){
  opts = opts || {};
  const c = ACKS.blankCampaign({ name: 'party-c' });
  c.currentTurn = 1; c.currentDayInMonth = 5;
  c.calendar = { year: 1, month: 1, day: 5 };
  c.hexes = [
    ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-b', coord: { q: 1, r: 0 }, terrain: 'grassland' })
  ];
  c.characters = [];
  for(let i = 1; i <= n; i++) c.characters.push(ACKS.blankCharacter({ id: 'chr-' + i, name: 'C' + i, currentHexId: 'hex-a' }));
  const pt = ACKS.blankParty({ id: 'par-1', name: 'The Company', currentHexId: 'hex-a' });
  c.parties = [pt];
  c.stashes = [];
  for(let i = 1; i <= n; i++) ACKS.addToParty(c, pt, 'chr-' + i, { silent: true });
  ACKS.reconcilePartyMembership(c);
  // seed the camp: a ration line + camp water + a gear item
  const camp = ACKS.ensurePartyCampStash(c, pt);
  camp.items.push(ACKS.makeRationLine({ rationType: 'iron', daysRemaining: (opts.rationDays != null ? opts.rationDays : 30) }));
  camp.items.push(ACKS.blankStashItem({ id: 'itm-rope', name: 'Rope', facets: ['gear'] }));
  camp.waterDaysCarried = (opts.waterDays != null ? opts.waterDays : 12);
  return { c, pt, camp };
}
function campRationDays(c, partyId){
  const camp = ACKS.partyCampStash(c, partyId);
  return ((camp && camp.items) || []).filter(it => ACKS.isRationLine(it)).reduce((s, it) => s + (Number(it.daysRemaining) || 0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('the two event kinds self-register (record-only, wizard opt-out)');
check('journey-split registered', ACKS.EVENT_KINDS.includes('journey-split'));
check('journey-merge registered', ACKS.EVENT_KINDS.includes('journey-merge'));
check('both are wizard opt-out (record-only)', ACKS.EVENT_WIZARD_OPTOUT.has('journey-split') && ACKS.EVENT_WIZARD_OPTOUT.has('journey-merge'));
check('both carry a schema', !!ACKS.EVENT_SCHEMAS['journey-split'] && !!ACKS.EVENT_SCHEMAS['journey-merge']);

section('the canonical party-membership setter (character.partyId is canonical; memberCharacterIds derived)');
{
  const { c, pt } = build(3);
  check('addToParty built a 3-member party', pt.memberCharacterIds.length === 3);
  check('every member points at the party', c.characters.every(ch => ch.partyId === 'par-1'));
  // a second party; move one member across
  const pt2 = ACKS.blankParty({ id: 'par-2', name: 'Splinter', currentHexId: 'hex-a' });
  c.parties.push(pt2);
  ACKS.moveToParty(c, 'chr-3', 'par-2');
  ACKS.reconcilePartyMembership(c);
  check('moveToParty moved chr-3 out of par-1', pt.memberCharacterIds.indexOf('chr-3') < 0);
  check('one character per party — chr-3 is only in par-2', c.characters.find(x => x.id === 'chr-3').partyId === 'par-2' && pt2.memberCharacterIds.length === 1);
  ACKS.removeFromParty(c, 'chr-3');
  ACKS.reconcilePartyMembership(c);
  check('removeFromParty makes chr-3 party-less', !c.characters.find(x => x.id === 'chr-3').partyId && pt2.memberCharacterIds.length === 0);
  // leader re-validation on removal
  const leaderBefore = pt.leaderCharacterId;
  ACKS.removeFromParty(c, leaderBefore);
  ACKS.reconcilePartyMembership(c);
  check('removing the leader re-picks a surviving member as leader', pt.leaderCharacterId && pt.leaderCharacterId !== leaderBefore && pt.memberCharacterIds.indexOf(pt.leaderCharacterId) >= 0);
}

section('SPLIT — halves the roster + divides camp stores (parent keeps the rest by default)');
{
  const { c, pt } = build(4, { rationDays: 30, waterDays: 12 });
  const res = ACKS.splitParty(c, pt, ['chr-3', 'chr-4'], { newName: 'Scouts', mode: 'stay', campItemIds: ['itm-rope'], rationsToNew: 10, waterToNew: 4 });
  ACKS.reconcilePartyMembership(c);
  check('split ok', res.ok && !!res.newParty);
  check('source keeps 2 members', pt.memberCharacterIds.length === 2);
  check('new party has the 2 departing members', c.characters.filter(x => x.partyId === res.newParty.id).length === 2);
  check('chr-3/chr-4 moved to the new party', c.characters.find(x => x.id === 'chr-3').partyId === res.newParty.id && c.characters.find(x => x.id === 'chr-4').partyId === res.newParty.id);
  check('the ticked gear item moved to the new camp', (ACKS.partyCampStash(c, res.newParty.id).items || []).some(it => it.id === 'itm-rope') && !(ACKS.partyCampStash(c, 'par-1').items || []).some(it => it.id === 'itm-rope'));
  check('rations divided: 10 to new, 20 kept by parent', campRationDays(c, res.newParty.id) === 10 && campRationDays(c, 'par-1') === 20);
  check('camp water divided: 4 to new, 8 kept by parent', Number(ACKS.partyCampStash(c, res.newParty.id).waterDaysCarried) === 4 && Number(ACKS.partyCampStash(c, 'par-1').waterDaysCarried) === 8);
  check('a journey-split event was emitted', (c.eventLog || []).some(e => e.event && e.event.kind === 'journey-split'));
  check('default (no allocation) leaves stores with the parent', (function(){ const b = build(2); const r = ACKS.splitParty(b.c, b.pt, ['chr-2'], {}); return r.ok && campRationDays(b.c, r.newParty.id) === 0 && campRationDays(b.c, 'par-1') === 30; })());
  check('cannot split off the whole party', ACKS.splitParty(build(2).c, 'par-1', ['chr-1', 'chr-2'], {}).reason === 'whole-party');
  check('cannot split with nobody departing', ACKS.splitParty(build(2).c, 'par-1', [], {}).reason === 'no-departing');
}

section('MERGE — recombines two co-located parties (Joachim: no auto-merge; same-hex prompt)');
{
  const { c, pt } = build(4, { rationDays: 30, waterDays: 12 });
  // split off gear + rations + camp water, so the absorbed party carries an id-LESS ration line + water
  const sp = ACKS.splitParty(c, pt, ['chr-3', 'chr-4'], { newName: 'Scouts', campItemIds: ['itm-rope'], rationsToNew: 10, waterToNew: 4 });
  ACKS.reconcilePartyMembership(c);
  const B = sp.newParty;
  const mg = ACKS.mergeParties(c, pt, B);
  ACKS.reconcilePartyMembership(c);
  check('merge ok (co-located)', mg.ok && mg.movedIds.length === 2);
  check('source back to 4 members', pt.memberCharacterIds.length === 4);
  check('absorbed party disbanded', B.status === 'disbanded');
  check('the absorbed camp GEAR item merged back to the keeper', (ACKS.partyCampStash(c, 'par-1').items || []).some(it => it.id === 'itm-rope'));
  check('the absorbed ration-days merged back (id-less line does NOT abort the transfer)', campRationDays(c, 'par-1') === 30);
  check('the absorbed camp water merged back', Number(ACKS.partyCampStash(c, 'par-1').waterDaysCarried) === 12);
  check('a journey-merge event was emitted', (c.eventLog || []).some(e => e.event && e.event.kind === 'journey-merge'));
  // co-location guard
  const { c: c2, pt: keep } = build(2);
  const away = ACKS.blankParty({ id: 'par-away', name: 'Elsewhere', currentHexId: 'hex-b' });
  c2.parties.push(away);
  const chX = ACKS.blankCharacter({ id: 'chr-x', currentHexId: 'hex-b' }); c2.characters.push(chX);
  ACKS.addToParty(c2, away, 'chr-x'); ACKS.reconcilePartyMembership(c2);
  const bad = ACKS.mergeParties(c2, keep, away);
  check('merge blocked when the parties are not in the same hex', !bad.ok && bad.reason === 'not-co-located');
  check('mergeCandidatesFor returns co-located parties only', ACKS.mergeCandidatesFor(c2, keep).length === 0);
}

section('D9 — the ephemeral travel-party lifecycle (keep / disband on arrival)');
{
  const { c } = build(1);
  // an auto-formed party with 2 loose members, no live journey → an arrival prompt
  const auto = ACKS.blankParty({ id: 'par-auto', name: 'Travellers', currentHexId: 'hex-a', autoFormed: true });
  c.parties.push(auto);
  const y1 = ACKS.blankCharacter({ id: 'chr-y1', currentHexId: 'hex-a' }), y2 = ACKS.blankCharacter({ id: 'chr-y2', currentHexId: 'hex-a' });
  c.characters.push(y1, y2);
  ACKS.addToParty(c, auto, 'chr-y1'); ACKS.addToParty(c, auto, 'chr-y2'); ACKS.reconcilePartyMembership(c);
  check('an auto-formed arrived party shows in the arrival prompts', ACKS.travelPartyArrivalPrompts(c).some(p => p.id === 'par-auto'));
  check('a NON-auto party never shows in the prompts', !ACKS.travelPartyArrivalPrompts(c).some(p => p.id === 'par-1'));
  // keep — promote it
  ACKS.keepTravelParty(c, auto, { name: 'The Wardens' });
  check('keep clears autoFormed + renames (promote to standing)', auto.autoFormed === false && auto.name === 'The Wardens');
  check('a kept party no longer shows in the prompts', !ACKS.travelPartyArrivalPrompts(c).some(p => p.id === 'par-auto'));
  // dissolve — release members, camp to leader
  const auto2 = ACKS.blankParty({ id: 'par-auto2', name: 'Porters', currentHexId: 'hex-a', autoFormed: true });
  c.parties.push(auto2);
  const z1 = ACKS.blankCharacter({ id: 'chr-z1', currentHexId: 'hex-a' }), z2 = ACKS.blankCharacter({ id: 'chr-z2', currentHexId: 'hex-a' });
  c.characters.push(z1, z2);
  ACKS.addToParty(c, auto2, 'chr-z1'); ACKS.addToParty(c, auto2, 'chr-z2'); ACKS.reconcilePartyMembership(c);
  const leaderId = auto2.leaderCharacterId;
  const dis = ACKS.dissolveTravelParty(c, auto2);
  ACKS.reconcilePartyMembership(c);
  check('dissolve disbands the party', dis.ok && auto2.status === 'disbanded');
  check('dissolve releases every member', c.characters.filter(x => x.partyId === 'par-auto2').length === 0);
  check('dissolve hands the camp to the leader (kind personal, owner = leader)', (function(){ const camp = (c.stashes || []).find(s => s && s.ownerCharacterId === leaderId && s.kind === 'personal'); return !!camp; })());
}

section('SPLIT to FOLLOW (tracking-split) — half-speed, no monster-pursuit combat-catch');
{
  const { c, pt } = build(3, { rationDays: 30 });
  const j = ACKS.blankJourney({ id: 'jrn-1', name: 'Trek', participantCharacterIds: ['chr-1', 'chr-2', 'chr-3'], partyId: 'par-1', startHexId: 'hex-a', destinationHexId: 'hex-b', supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j];
  ACKS.startJourney(c, j);
  const res = ACKS.splitJourney(c, j, ['chr-3'], { mode: 'follow', rationsToNew: 8 });
  ACKS.reconcilePartyMembership(c);
  check('splitJourney ok', res.ok && !!res.newJourney);
  check('the follow journey trails the lead (followsJourneyId)', res.newJourney.followsJourneyId === 'jrn-1');
  check('the follow journey moves at half-speed (RR p.120 tracking pace)', res.newJourney.pace === 'half-speed');
  check('rations divided onto the follow party camp', campRationDays(c, res.newParty.id) === 8 && campRationDays(c, 'par-1') === 22);
  check('NO monster-pursuit encounter/combat-catch was created (friendly follow bypasses slot-82)', (c.encounters || []).length === 0);
  check('the reserved split audit fields are stamped', res.newJourney.parentJourneyId === 'jrn-1' && res.newJourney.splitFromAtDayIndex != null);
  const rt = ACKS.retargetFollowJourney(c, res.newJourney);
  check('retargetFollowJourney re-points the follower at the lead', rt.ok);
}

section('migrate-no-op — the new lazy fields default cleanly');
{
  check('blankParty defaults autoFormed to false', ACKS.blankParty({}).autoFormed === false);
  // a blank campaign migrated is a no-op (no injected split/merge/party fields)
  const tmpl = ACKS.blankCampaign({ name: 'noop' });
  const before = JSON.stringify(tmpl);
  const after = (typeof ACKS.migrateCampaign === 'function') ? ACKS.migrateCampaign(tmpl) : tmpl;
  check('migrateCampaign(blank) is a no-op (no split/merge field injection)', JSON.stringify(after) === before || after === tmpl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Movement 2.0 Lane C (party split/merge) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
