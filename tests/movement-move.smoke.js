/* Movement 2.0 Lane A smoke — the Move surfacing UI (domain-app-move.js mixin).
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/movement-move.smoke.js
 *
 * Lane A is PURE UI over the Foundation primitive (acks-engine-movement.js): a hex-budget chip,
 * Move buttons (hex card / map / action box), move-away-forces-leave-party, and join-grants-no-
 * extra-movement. This suite loads the mixin headless in a component-like `this` and exercises its
 * read helpers + the Move actions; the engine mechanics themselves are covered by movement.smoke.js.
 *
 * Authored 2026-07-01 (Movement 2.0 TS1 Lane A).
 */

const fs = require('fs'), path = require('path');
global.window = global;                         // the mixin references window.* directly
require('./_engine.js').load();
const ACKS = global.ACKS;
window.ACKS = ACKS;                             // the mixin reads window.ACKS

// load the mixin — its IIFE pushes a members object onto window.__ACKS_APP_MIXINS__.
window.__ACKS_APP_MIXINS__ = [];
require('../domain-app-move.js');
const MIX = window.__ACKS_APP_MIXINS__[0] || {};

let passed = 0, failed = 0;
function check(label, cond, detail){ if(cond){ passed++; } else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; } }
function section(t){ console.log('--- ' + t + ' ---'); }
const PASS_RNG = () => 0.99;                     // nav ok, encounter draw = nothing

// A component-like `this`: the mixin members + the shipped app/engine methods it calls. The
// removeCharacterFromParty stub MIRRORS domain-app.js's shipped method (set partyId null, re-seat
// the leader, reconcile) — Lane A proves it CALLS the shipped leave path; the stub reproduces its effect.
function makeApp(campaign){
  return Object.assign(Object.create(MIX), {
    currentCampaign: campaign,
    selectedCharacterId: null,
    mvMapMoverRef: null,
    _toasts: [], _dirty: 0, _persist: 0,
    showToast(m){ this._toasts.push(m); },
    markDirty(){ this._dirty++; },
    schedulePersist(){ this._persist++; },
    hexLabelFor(h){ return (h && (h.name || h.id)) || '—'; },
    characterPartyOf(ch){ return (ch && ch.partyId) ? ((campaign.parties || []).find(p => p && p.id === ch.partyId) || null) : null; },
    removeCharacterFromParty(ch){
      if(!ch) return;
      const pid = ch.partyId; ch.partyId = null;
      if(pid){
        const pt = (campaign.parties || []).find(p => p.id === pid);
        if(pt && pt.leaderCharacterId === ch.id){
          const others = (campaign.characters || []).filter(c => c.partyId === pid);
          pt.leaderCharacterId = others.length ? others[0].id : null;
        }
      }
      ACKS.reconcilePartyMembership(campaign);
    }
  });
}

// The Foundation test grid: a grassland row a-b-c-d-e, a forest branch (f, adj a), a water hex (w, adj a).
function grid(){
  const c = ACKS.blankCampaign({ name: 'mvA' });
  c.currentTurn = 1; c.currentDayInMonth = 5; c.calendar = { year: 1, month: 1, day: 5 };
  c.hexes = [
    ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-b', coord: { q: 1, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-c', coord: { q: 2, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-d', coord: { q: 3, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-e', coord: { q: 4, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-f', coord: { q: 0, r: 1 }, terrain: 'forest' }),
    ACKS.blankHex({ id: 'hex-w', coord: { q: -1, r: 0 }, terrain: 'water' })
  ];
  // partyId is the SOURCE of truth; reconcilePartyMembership rebuilds memberCharacterIds FROM it (engine 7447).
  const ch = ACKS.blankCharacter({ id: 'chr-1', name: 'Halvard', currentHexId: 'hex-a', partyId: 'par-1' });
  c.characters = [ch];
  const pt = ACKS.blankParty({ id: 'par-1', name: 'Scouts', memberCharacterIds: ['chr-1'], leaderCharacterId: 'chr-1', currentHexId: 'hex-a' });
  c.parties = [pt];
  ACKS.reconcilePartyMembership(c);
  return { c, ch, pt, app: makeApp(c) };
}

// ── mover resolution ─────────────────────────────────────────────────────────
section('mvMoverForCharacter — a lone character moves alone; a party member travels with its party');
{
  const { c, ch, pt, app } = grid();
  const solo = app.mvMoverForCharacter(ch);
  check('a party member resolves to its party', solo.kind === 'party' && solo.ref === 'par-1', JSON.stringify(solo));
  ch.partyId = null; ACKS.reconcilePartyMembership(c);
  const alone = app.mvMoverForCharacter(ch);
  check('a party-less character resolves to itself', alone.kind === 'character' && alone.ref === 'chr-1');
  check('null character → null mover', app.mvMoverForCharacter(null) === null);
}

// ── the hex-budget chip (miles → hexes, RR p.272) ─────────────────────────────
section('mvBudgetChip — 24 mi grassland = 4 hexes; greys through amber/red as it spends');
{
  const { c, pt, app } = grid();
  const chip = app.mvBudgetChip('par-1');
  check('on the map', chip.onMap === true);
  check('4 hexes left today (24 / 6)', chip.hexes === 4, chip.hexes);
  check('text reads "4 hexes left today"', chip.text === '4 hexes left today', chip.text);
  check('tone green when budget remains → accent-green class', app.mvChipClass(chip) === 'accent-green');
  // spend the whole day (4 hexes) → 0 remaining, not the first step → red
  for(const dst of ['hex-b', 'hex-c', 'hex-d', 'hex-e']) app.mvMoveGroup('par-1', dst, { rng: PASS_RNG });
  const spent = app.mvBudgetChip('par-1');
  check('after 4 hexes: 0 hexes left, tone red', spent.hexes === 0 && spent.tone === 'red', JSON.stringify(spent));
  check('spent chip → accent-red class', app.mvChipClass(spent) === 'accent-red');
}

section('mvBudgetChip — an unplaced character reads "not on the map" (muted), never a phantom budget');
{
  const { c, ch, app } = grid();
  ch.partyId = null; ch.currentHexId = null; ACKS.reconcilePartyMembership(c);
  const chip = app.mvBudgetChip('chr-1');
  check('onMap false', chip.onMap === false);
  check('text = "not on the map"', chip.text === 'not on the map', chip.text);
  check('muted class', app.mvChipClass(chip) === 'text-muted');
}

// ── adjacent Move targets ─────────────────────────────────────────────────────
section('mvAdjacentTargets — authored neighbours only, with per-hex cost + the water gate');
{
  const { app } = grid();
  const t = app.mvAdjacentTargets('par-1');
  const byId = Object.fromEntries(t.map(x => [x.hexId, x]));
  check('grassland neighbour hex-b offered, enabled, 6 mi', byId['hex-b'] && !byId['hex-b'].disabled && byId['hex-b'].cost === 6, JSON.stringify(byId['hex-b']));
  check('forest neighbour hex-f offered, enabled, 9 mi (×2/3)', byId['hex-f'] && !byId['hex-f'].disabled && byId['hex-f'].cost === 9, JSON.stringify(byId['hex-f']));
  check('water neighbour hex-w is DISABLED with a vessel reason (gate D6)', byId['hex-w'] && byId['hex-w'].disabled && /vessel/i.test(byId['hex-w'].reason), JSON.stringify(byId['hex-w']));
  check('a non-adjacent hex (hex-c) is NOT a target', !byId['hex-c']);
  check('the label routes through hexLabelFor', byId['hex-b'].label === 'hex-b');
}

section('mvAdjacentTargets — once the budget is spent, affordable neighbours flip to disabled');
{
  const { app } = grid();
  for(const dst of ['hex-b', 'hex-c', 'hex-d', 'hex-e']) app.mvMoveGroup('par-1', dst, { rng: PASS_RNG });
  // at hex-e now, 0 budget; neighbour hex-d (grassland, 6 mi) is unaffordable + not the first step → disabled
  const t = app.mvAdjacentTargets('par-1');
  const d = t.find(x => x.hexId === 'hex-d');
  check('a grassland neighbour is now disabled (no budget, not the first step)', d && d.disabled && /movement left/i.test(d.reason), JSON.stringify(d));
}

// ── the hex-card Move affordance ──────────────────────────────────────────────
section('mvHexCardMove — here / move / far / none for the active mover');
{
  const { c, app } = grid();
  const hx = id => (c.hexes.find(h => h.id === id));
  check('no active mover → state none', app.mvHexCardMove(hx('hex-b')).state === 'none');
  app.selectedCharacterId = 'chr-1';                         // the app's selection anchor → party mover
  check('mover current hex → state here', app.mvHexCardMove(hx('hex-a')).state === 'here');
  const mv = app.mvHexCardMove(hx('hex-b'));
  check('adjacent hex → state move, carries a target', mv.state === 'move' && mv.target && mv.target.hexId === 'hex-b');
  check('a far hex → state far', app.mvHexCardMove(hx('hex-c')).state === 'far');
  // the explicit map picker overrides the selection
  app.mvMapMoverRef = 'par-1';
  check('mvActiveMoverRef prefers the map pick', app.mvActiveMoverRef() === 'par-1');
}

// ── the Move actions ──────────────────────────────────────────────────────────
section('mvMoveGroup — moves the party, marks dirty/persist, toasts');
{
  const { c, ch, pt, app } = grid();
  const r = app.mvMoveGroup('par-1', 'hex-b', { rng: PASS_RNG });
  check('the move succeeded', r.ok === true, r.reason);
  check('the party (and its member) are at the destination', pt.currentHexId === 'hex-b' && ch.currentHexId === 'hex-b');
  check('the app marked dirty + scheduled a persist', app._dirty === 1 && app._persist === 1);
  check('a toast was shown', app._toasts.length === 1 && /moved one hex/.test(app._toasts[0]), app._toasts[0]);
  check('a record-only movement event landed in the log', (c.eventLog || []).some(e => e.event && e.event.kind === 'movement'));
}

section('mvMoveGroup — an illegal step toasts the reason and does not move');
{
  const { pt, app } = grid();
  const r = app.mvMoveGroup('par-1', 'hex-w', { rng: PASS_RNG });   // water, no vessel
  check('refused (water gate)', r.ok === false && r.reason === 'water');
  check('the party did not move', pt.currentHexId === 'hex-a');
  check('the reason was toasted', /vessel/i.test(app._toasts[app._toasts.length - 1]));
  check('no dirty/persist on a refused move', app._dirty === 0 && app._persist === 0);
}

section('mvMoveGroup — an encounter en route is surfaced in the toast');
{
  const { c, app } = grid();
  // put the party on a forest edge so a mid-roll draws a monster (mirrors movement.smoke.js)
  c.parties[0].currentHexId = 'hex-f'; c.characters[0].currentHexId = 'hex-f';
  c.hexes.push(ACKS.blankHex({ id: 'hex-f2', coord: { q: 0, r: 2 }, terrain: 'forest' }));  // adj to hex-f
  const r = app.mvMoveGroup('par-1', 'hex-f2', { rng: () => 0.5 });   // d20 = 11 → forest monster
  check('the move still succeeds', r.ok === true, r.reason);
  if(r.encounterId) check('the toast points to the Encounters queue', /Encounter/.test(app._toasts[app._toasts.length - 1]), app._toasts[app._toasts.length - 1]);
  else check('an encounter was drawn (rng 0.5 in unsettled forest)', !!r.encounterId, 'no encounter — draw model may differ');
}

// ── move-away-forces-leave-party (D1) ─────────────────────────────────────────
section('mvMoveAlone — a party member moving alone LEAVES the party (shipped leave path), then steps solo');
{
  const { c, pt, app } = grid();
  // a two-member party at hex-a
  const ch2 = ACKS.blankCharacter({ id: 'chr-2', name: 'Sable', currentHexId: 'hex-a', partyId: 'par-1' });
  c.characters.push(ch2); pt.memberCharacterIds.push('chr-2'); ACKS.reconcilePartyMembership(c);
  const ch2ref = c.characters.find(x => x.id === 'chr-2');
  const r = app.mvMoveAlone(ch2ref, 'hex-b');
  check('the solo move succeeded', r.ok === true, r.reason);
  check('the leaver detached from the party (partyId cleared)', ch2ref.partyId == null);
  check('the party no longer lists the leaver', !(pt.memberCharacterIds || []).includes('chr-2'));
  check('the leaver is at the destination hex, alone', ch2ref.currentHexId === 'hex-b');
  check('the remaining member stayed put with the party', c.characters.find(x => x.id === 'chr-1').currentHexId === 'hex-a' && pt.currentHexId === 'hex-a');
  check('the toast names the departure', /left .*and moved one hex/i.test(app._toasts[app._toasts.length - 1]), app._toasts[app._toasts.length - 1]);
}

// ── join grants no extra movement (D1: party = min-remaining member) ───────────
section('the party chip surfaces the MIN-remaining member (a joiner with a spent day binds the party)');
{
  const { c, pt, app } = grid();
  // a second character who already spent 2 hexes (12 mi) solo today, then joins the party
  const ch2 = ACKS.blankCharacter({ id: 'chr-2', name: 'Sable', currentHexId: 'hex-a', partyId: 'par-1' });
  ch2.dailyMovement = { worldOrd: 1 * 30 + 5, milesUsed: 12 };
  c.characters.push(ch2); pt.memberCharacterIds.push('chr-2'); ACKS.reconcilePartyMembership(c);
  const chip = app.mvBudgetChip('par-1');
  check('the party chip shows 2 hexes (24 − 12) — the spent joiner binds, no free movement', chip.hexes === 2, JSON.stringify(chip));
  check('remaining miles = 12', chip.remainingMiles === 12, chip.remainingMiles);
}

// ── H1: the Move glyph ships as a sprite symbol (enforce, don't just document) ─
section('the #i-move sprite symbol is defined + referenced (H1 chrome, not emoji)');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('the sprite defines <symbol id="i-move">', /<symbol\s+id="i-move"/.test(html));
  check('the Move UI references it via <use href="#i-move"> (>= 3 zones)', (html.match(/href="#i-move"/g) || []).length >= 3);
  const mixin = fs.readFileSync(path.join(__dirname, '..', 'domain-app-move.js'), 'utf8');
  check('the mixin carries no raw emoji-as-chrome / forbidden colour (uses tokens + the sprite)',
        !/emerald|orange|rose|gray-|slate|zinc|neutral|stone-/.test(mixin));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Movement 2.0 Lane A (Move surfacing) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
