/* Player-view serializer — T8 (audit 2026-06-14) smoke test.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/player-view.smoke.js
 *
 * Covers acks-engine-player-view.js — the pure redacting projection that lets a GM
 * hand a player a safe slice of the campaign (player.md 🔴 #1, gm-brosr.md 🔴 #2):
 *   - toPlayerView(campaign, characterId)         — one PC's full sheet + public world
 *   - projectCampaignForPlayer(campaign, playerId)— whole-campaign redacted clone
 *
 * The asserts (per the T8 acceptance list):
 *   (a) the player's own PC survives the projection INTACT (secrets/goals/notes/etc.)
 *   (b) EVERY GM-only character field is stripped from a non-owned NPC's public face
 *   (c) another player's / a faction's secrets don't leak (cross-ownership)
 *   (d) PURITY — the input campaign is byte-identical after projecting
 *   (e) it runs HEADLESS (this file loading + passing IS that assertion)
 *   + lairs (undiscovered dropped), rumors (false dropped, truth verdict stripped),
 *     groups (GM verdict bundles stripped), domains (owned full / others public),
 *     and the GM workspace collections (eventLog/pendingEvents/relations) dropped.
 *
 * Authored 2026-06-14 — audit remediation T8 (feature/audit-toplayerview).
 */

require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

// ─────────────────────────────────────────────────────────────────────────
// fixture — a small campaign with: a player's PC, a GM NPC with secrets, a
// SECOND player's PC (a different ownerPlayerId) with its own secrets, a domain
// the PC rules + a domain it doesn't, a discovered + an undiscovered lair, a
// true + a false rumor, a monster band with a GM incursion verdict, and a GM
// workspace (eventLog/pendingEvents/a relation collection).
// ─────────────────────────────────────────────────────────────────────────
function mkCampaign(){
  const camp = ACKS.blankCampaign({ id: 'cmp-test', name: 'T8 Test' });

  const myPc = ACKS.blankCharacter({
    id: 'chr-mine', name: 'My Hero', controlledBy: 'player',
    secrets: 'I am the lost heir',
    goals: ['reclaim the throne'],
    relationships: [{ characterId: 'chr-npc', note: 'distrusts' }],
    background: 'raised in exile', personality: 'guarded', voice: 'low',
    notes: 'GM: actually the heir', loyalty: 0, monthlyWage: 0,
    hp: { current: 8, max: 10, hitDice: '1d8' }, ac: 4, level: 3
  });
  myPc.currentDomainId = 'dom-mine';
  // ownerPlayerId is the forward-compat ownership field the serializer reads (gm-brosr.md
  // 🔴 #2 calls for a real roster). blankCharacter doesn't carry it yet, so set it directly
  // — mirroring how a future roster would stamp it onto the record.
  myPc.ownerPlayerId = 'pl-alice';

  const otherPc = ACKS.blankCharacter({
    id: 'chr-other', name: 'Bob the Rogue', controlledBy: 'player',
    secrets: "Bob's hidden stash is under the inn",
    goals: ['get rich quietly'],
    notes: 'GM: Bob is a double agent'
  });
  otherPc.ownerPlayerId = 'pl-bob';

  const npc = ACKS.blankCharacter({
    id: 'chr-npc', name: 'Baron Grim', controlledBy: 'gm',
    secrets: 'plotting to seize the march',
    goals: ['marry his daughter into Saltspur'],
    relationships: [{ characterId: 'chr-mine', note: 'rival' }],
    background: 'a scheming vassal', personality: 'ruthless', voice: 'oily',
    notes: 'GM-only dossier', loyalty: -2, monthlyWage: 100,
    liegeCharacterId: 'chr-mine'
  });
  npc.currentDomainId = 'dom-grim';

  camp.characters = [myPc, otherPc, npc];

  const myDomain = ACKS.blankDomain({ id: 'dom-mine', name: 'My March', rulerCharacterId: 'chr-mine' });
  myDomain.treasury = { gp: 5000 };
  myDomain.notes = 'GM: secret reserve fund';
  const grimDomain = ACKS.blankDomain({ id: 'dom-grim', name: "Grim's Barony", rulerCharacterId: 'chr-npc' });
  grimDomain.treasury = { gp: 9999 };
  grimDomain.notes = 'GM: Grim is broke and desperate';
  camp.domains = [myDomain, grimDomain];

  camp.hexes = [
    Object.assign(ACKS.blankHex({ id: 'hex-1', coord: { q: 0, r: 0 } }), { domainId: 'dom-mine', notes: 'GM: hidden cache here', monsterNotes: 'GM: gnolls nearby' }),
    Object.assign(ACKS.blankHex({ id: 'hex-2', coord: { q: 1, r: 0 } }), { domainId: 'dom-grim' })
  ];
  camp.settlements = [ ACKS.blankSettlement({ id: 'set-1', name: 'Saltspur', notes: 'GM: the mayor is corrupt' }) ];

  camp.lairs = [
    ACKS.blankLair({ id: 'lai-known', name: 'Gnoll Den', hexId: 'hex-1', knownToPlayers: true, hiddenDC: 14, notes: 'GM: 12 gnolls + treasure' }),
    ACKS.blankLair({ id: 'lai-hidden', name: 'Secret Cult', hexId: 'hex-2', knownToPlayers: false, notes: 'GM: the BBEG lives here' })
  ];

  camp.rumors = [
    ACKS.blankRumor({ id: 'rum-true', text: 'The baron is hiring mercenaries', truthLevel: 'true', notes: 'GM note' }),
    ACKS.blankRumor({ id: 'rum-false', text: 'There is gold in the swamp', truthLevel: 'false', notes: 'GM: planted to mislead' })
  ];

  camp.groups = [
    Object.assign(ACKS.blankGroup({ id: 'grp-band', name: 'Bandit Band', currentHexId: 'hex-2', count: 12 }), {
      incursion: { domainId: 'dom-grim', attitude: 'hostile', disposition: 'lingering' },
      wanderState: { coord: { q: 1, r: 0 }, mode: null },
      notes: 'GM: secretly working for Grim'
    })
  ];

  // GM workspace — must NOT survive a player projection.
  camp.eventLog = [ { event: { id: 'evt-1', kind: 'gm-fiat', context: { relatedEntities: [{ kind: 'character', id: 'chr-mine', role: 'subject' }] } } } ];
  camp.pendingEvents = [ { id: 'pe-1', kind: 'player-plan' } ];
  camp.henchmanships = [ { id: 'hm-1', subjectCharacterId: 'chr-npc', liegeCharacterId: 'chr-mine' } ];
  camp.syndicates = [ { id: 'syn-1', name: 'The Black Hand', bossCharacterId: 'chr-npc' } ];

  return camp;
}

// A deep snapshot for the purity check.
function snap(o){ return JSON.stringify(o); }

// ─────────────────────────────────────────────────────────────────────────
section('Exports on global.ACKS');
check('toPlayerView is a function', typeof ACKS.toPlayerView === 'function');
check('projectCampaignForPlayer is a function', typeof ACKS.projectCampaignForPlayer === 'function');
check('the GM-only char field set is exported + non-empty', Array.isArray(ACKS.PLAYER_VIEW_CHAR_GM_ONLY_FIELDS) && ACKS.PLAYER_VIEW_CHAR_GM_ONLY_FIELDS.length > 0);

// ─────────────────────────────────────────────────────────────────────────
section('(d) purity — input campaign unchanged after both projections');
{
  const camp = mkCampaign();
  const before = snap(camp);
  ACKS.toPlayerView(camp, 'chr-mine');
  ACKS.projectCampaignForPlayer(camp, 'pl-alice');
  ACKS.projectCampaignForPlayer(camp, null);
  check('campaign is byte-identical after projecting', snap(camp) === before);
  // and the NPC still has its secrets on the ORIGINAL
  const npc = camp.characters.find(c => c.id === 'chr-npc');
  check('original NPC still carries secrets (no mutation)', npc.secrets === 'plotting to seize the march');
}

// ─────────────────────────────────────────────────────────────────────────
section('(a) toPlayerView — the player\'s own PC survives intact');
{
  const camp = mkCampaign();
  const v = ACKS.toPlayerView(camp, 'chr-mine');
  check('returns a view object', v && typeof v === 'object');
  check('view.character is the PC', v.character && v.character.id === 'chr-mine');
  check('own secrets ride through', v.character.secrets === 'I am the lost heir');
  check('own goals ride through', Array.isArray(v.character.goals) && v.character.goals[0] === 'reclaim the throne');
  check('own notes ride through', v.character.notes === 'GM: actually the heir');
  check('own relationships ride through', Array.isArray(v.character.relationships) && v.character.relationships.length === 1);
  check('own mechanics present (hp/ac/level)', v.character.hp.max === 10 && v.character.ac === 4 && v.character.level === 3);
  check('public world attached (hexes)', Array.isArray(v.hexes) && v.hexes.length === 2);
  check('characterHistory attached (array)', Array.isArray(v.characterHistory));
}

section('toPlayerView guards');
{
  const camp = mkCampaign();
  check('null for a GM-controlled character', ACKS.toPlayerView(camp, 'chr-npc') === null);
  check('null for an unknown id', ACKS.toPlayerView(camp, 'chr-nope') === null);
  check('null for a missing campaign', ACKS.toPlayerView(null, 'chr-mine') === null);
}

// ─────────────────────────────────────────────────────────────────────────
section('(b) projectCampaignForPlayer — EVERY GM-only field stripped from a non-owned NPC');
{
  const camp = mkCampaign();
  const proj = ACKS.projectCampaignForPlayer(camp, 'pl-alice');
  const npc = proj.characters.find(c => c.id === 'chr-npc');
  check('NPC still appears (public identity)', npc && npc.name === 'Baron Grim');
  check('NPC public face keeps name/class/level/alignment', npc.alignment != null && npc.level != null);
  // walk the full GM-only denylist — none may survive on the public face
  let leaked = [];
  ACKS.PLAYER_VIEW_CHAR_GM_ONLY_FIELDS.forEach(f => { if(Object.prototype.hasOwnProperty.call(npc, f)) leaked.push(f); });
  check('no GM-only character field survives on the NPC', leaked.length === 0, 'leaked: ' + leaked.join(','));
  // explicit spot-checks on the headline fields
  check('NPC secrets stripped', npc.secrets === undefined);
  check('NPC goals stripped', npc.goals === undefined);
  check('NPC relationships stripped', npc.relationships === undefined);
  check('NPC loyalty stripped', npc.loyalty === undefined);
  check('NPC monthlyWage stripped', npc.monthlyWage === undefined);
  check('NPC liegeCharacterId stripped', npc.liegeCharacterId === undefined);
  check('NPC history stripped', npc.history === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
section('(c) cross-ownership — another player\'s secrets don\'t leak');
{
  const camp = mkCampaign();
  // Alice's projection: her PC full, Bob's PC reduced to a public face.
  const aliceView = ACKS.projectCampaignForPlayer(camp, 'pl-alice');
  const mineInAlice = aliceView.characters.find(c => c.id === 'chr-mine');
  const bobInAlice = aliceView.characters.find(c => c.id === 'chr-other');
  check("Alice's own PC keeps secrets", mineInAlice.secrets === 'I am the lost heir');
  check("Bob's PC appears to Alice as a public face", bobInAlice && bobInAlice.name === 'Bob the Rogue');
  check("Bob's secrets do NOT leak to Alice", bobInAlice.secrets === undefined);
  check("Bob's notes do NOT leak to Alice", bobInAlice.notes === undefined);
  check("Bob's goals do NOT leak to Alice", bobInAlice.goals === undefined);

  // Bob's projection: his PC full, Alice's reduced.
  const bobView = ACKS.projectCampaignForPlayer(camp, 'pl-bob');
  const bobInBob = bobView.characters.find(c => c.id === 'chr-other');
  const mineInBob = bobView.characters.find(c => c.id === 'chr-mine');
  check("Bob's own PC keeps secrets", bobInBob.secrets === "Bob's hidden stash is under the inn");
  check("Alice's secrets do NOT leak to Bob", mineInBob.secrets === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
section('null playerId — every player-controlled character counts as "ours"');
{
  const camp = mkCampaign();
  const proj = ACKS.projectCampaignForPlayer(camp, null);
  const mine = proj.characters.find(c => c.id === 'chr-mine');
  const other = proj.characters.find(c => c.id === 'chr-other');
  const npc = proj.characters.find(c => c.id === 'chr-npc');
  check('both PCs full when playerId is null', mine.secrets === 'I am the lost heir' && other.secrets === "Bob's hidden stash is under the inn");
  check('the GM NPC is STILL redacted when playerId is null', npc.secrets === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
section('domains — owned full, others public-face only');
{
  const camp = mkCampaign();
  const proj = ACKS.projectCampaignForPlayer(camp, 'pl-alice');
  const mine = proj.domains.find(d => d.id === 'dom-mine');
  const grim = proj.domains.find(d => d.id === 'dom-grim');
  check('owned domain keeps treasury', mine.treasury && mine.treasury.gp === 5000);
  check('owned domain keeps notes', mine.notes === 'GM: secret reserve fund');
  check("other domain still appears", grim && grim.name === "Grim's Barony");
  check("other domain treasury stripped", grim.treasury === undefined);
  check("other domain notes stripped", grim.notes === undefined);
  check('other domain keeps public identity (ruler/classification)', grim.rulerCharacterId === 'chr-npc' && grim.classification != null);
}

// ─────────────────────────────────────────────────────────────────────────
section('public world — lairs / rumors / hexes / settlements / groups redaction');
{
  const camp = mkCampaign();
  const proj = ACKS.projectCampaignForPlayer(camp, 'pl-alice');

  // Lairs: only the discovered one, with GM hooks stripped.
  check('only discovered lairs survive', proj.lairs.length === 1 && proj.lairs[0].id === 'lai-known');
  check('discovered lair keeps name', proj.lairs[0].name === 'Gnoll Den');
  check('discovered lair hiddenDC stripped', proj.lairs[0].hiddenDC === undefined);
  check('discovered lair notes stripped', proj.lairs[0].notes === undefined);

  // Rumors: false dropped, truth verdict + notes stripped on survivors.
  check('false rumor dropped', proj.rumors.length === 1 && proj.rumors[0].id === 'rum-true');
  check('rumor text survives', proj.rumors[0].text === 'The baron is hiring mercenaries');
  check('rumor truthLevel verdict stripped', proj.rumors[0].truthLevel === undefined);
  check('rumor notes stripped', proj.rumors[0].notes === undefined);

  // Hexes: GM notes/monsterNotes stripped; geography survives.
  const h1 = proj.hexes.find(h => h.id === 'hex-1');
  check('hex notes stripped', h1.notes === undefined);
  check('hex monsterNotes stripped', h1.monsterNotes === undefined);
  check('hex geography survives (coord)', h1.coord && h1.coord.q === 0);

  // Settlements: GM notes stripped.
  check('settlement notes stripped', proj.settlements[0].notes === undefined);
  check('settlement name survives', proj.settlements[0].name === 'Saltspur');

  // Groups: GM verdict bundles + notes stripped; the visible band survives.
  const band = proj.groups.find(g => g.id === 'grp-band');
  check('group survives (count visible)', band && band.count === 12);
  check('group incursion verdict stripped', band.incursion === undefined);
  check('group wanderState stripped', band.wanderState === undefined);
  check('group notes stripped', band.notes === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
section('GM workspace collections dropped wholesale');
{
  const camp = mkCampaign();
  const proj = ACKS.projectCampaignForPlayer(camp, 'pl-alice');
  check('eventLog dropped', proj.eventLog === undefined);
  check('pendingEvents dropped', proj.pendingEvents === undefined);
  check('henchmanships relation dropped', proj.henchmanships === undefined);
  check('syndicates dropped', proj.syndicates === undefined);
  check('projection marked as a player-view', proj.kind === 'campaign-player-view');
  check('projection records the playerId', proj.playerId === 'pl-alice');
}

// ─────────────────────────────────────────────────────────────────────────
section('belt-and-suspenders — no GM-only string value survives anywhere in a projection');
{
  // Serialize the whole projection and assert none of the planted GM-only secret
  // strings appear anywhere (catches a field surviving via a nested/aliased path).
  const camp = mkCampaign();
  const proj = ACKS.projectCampaignForPlayer(camp, 'pl-alice');
  const blob = JSON.stringify(proj);
  const mustNotAppear = [
    'plotting to seize the march',      // NPC secret
    "Bob's hidden stash is under the inn", // other player's secret
    'GM-only dossier',                  // NPC notes
    'GM: Grim is broke and desperate',  // other domain notes
    'the BBEG lives here',              // hidden lair notes
    'planted to mislead',               // false-rumor notes
    'secretly working for Grim',        // group notes
    'The Black Hand'                    // syndicate (dropped collection)
  ];
  let appeared = mustNotAppear.filter(s => blob.indexOf(s) >= 0);
  check('no planted GM secret appears in the serialized projection', appeared.length === 0, 'appeared: ' + appeared.join(' | '));
  // sanity: the player's OWN secret IS in their projection (proves we didn't over-strip)
  check("the player's own secret IS present (not over-stripped)", blob.indexOf('I am the lost heir') >= 0);
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('player-view.smoke.js — passed ' + passed + ' / failed ' + failed);
console.log('=============================================');
if(failed > 0) process.exit(1);
