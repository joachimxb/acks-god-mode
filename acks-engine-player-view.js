/* =============================================================================
 * acks-engine-player-view.js — ACKS God Mode player-view serializer (Module: player-view)
 *
 * T8 (audit 2026-06-14) — the redacting projection that lets a GM hand a player
 * a safe slice of the campaign. It is ALSO the eventual Player Portal's data
 * contract (player.md §5, gm-brosr.md §5: "land the projection before any portal
 * so the partition is enforced at the source, not bolted on").
 *
 * The problem it solves (player.md 🔴 #1, gm-brosr.md 🔴 #2): a character record
 * co-locates GM-only fields (`secrets`/`goals`/`relationships`/`notes`/hidden
 * `loyalty`/the GM audit `history[]`) on the SAME flat object as HP/AC/inventory,
 * with no per-field visibility model — so today a GM cannot share even a read-only
 * sheet without leaking every NPC secret and hidden number. The schema has no
 * `gmOnly`/`visibleToPlayer` marker (grep confirms), so the redaction set is
 * defined HERE as explicit field allow/deny lists (the smallest correct first
 * deliverable; a per-field-schema visibility flag is the later generalization).
 *
 * Two PURE exports (no mutation — they build fresh / deep-clone; the input
 * campaign is never touched):
 *   • toPlayerView(campaign, characterId)
 *       One player-controlled character's full sheet + the public world. The
 *       smallest "hand me my sheet" artifact.
 *   • projectCampaignForPlayer(campaign, playerId)
 *       A whole-campaign redacted projection for one player — the entities the
 *       player controls in FULL, everything else reduced to its public face.
 *
 * Ownership model. There is no `playerId`/`domain.controllingPlayerId` roster in
 * the schema yet (gm-brosr.md 🔴 #2 calls for one). Until it lands, "a player's
 * entities" = the characters with `controlledBy === 'player'` (Architecture §2 /
 * ACKS.isPlayerControlled), plus the domains they rule + the parties they lead/
 * belong to. We ALSO read a defensive, forward-compatible `ownerPlayerId` on
 * characters and `controllingPlayerId` on domains: when those land, passing a
 * real playerId narrows ownership to that player; absent (the common case today),
 * `projectCampaignForPlayer(campaign, null)` treats ALL player-controlled
 * characters as "ours" so the function is useful immediately. Anything not owned
 * is projected through its public face only.
 *
 * What gets stripped (the GM-only set, per player.md / gm-brosr.md):
 *   - character: secrets, goals, relationships, voice, background, personality,
 *     notes, loyalty (+ the loyalty ledger), monthlyWage, the GM audit history[],
 *     the recruitment/keep bookkeeping — UNLESS the character is one of the
 *     player's own (then the full sheet rides through).
 *   - domain / hex / settlement: notes + GM-only economic detail UNLESS owned.
 *   - lairs with knownToPlayers:false are DROPPED entirely (undiscovered).
 *   - rumors with truthLevel 'false' are DROPPED; a rumor's GM truthLevel is
 *     stripped (a player hears the text, not the GM's truth verdict).
 *   - groups carrying GM-only incursion/wander/banditry verdicts → those fields
 *     stripped; secret (gmNotes-style) notes stripped.
 *   - the GM workspace collections (pendingEvents, eventLog, syndicates, the
 *     monster-incursion log, GM-only relation collections) are dropped wholesale.
 *
 * Load order: LAST (after every entity/predicate module). All OUT references
 * (ACKS.isPlayerControlled, ACKS.rulerCharacter) resolve at call-time on the
 * shared global.ACKS object — every function runs long after every module loads;
 * each is also guarded so the module degrades gracefully if a predicate is absent.
 *
 * Authored 2026-06-14 — audit remediation T8 (feature/audit-toplayerview).
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// --- the GM-only field denylist for a character a player does NOT own (an NPC
//     that nonetheless appears in the public world — a settlement's named ruler,
//     a party-mate's name). Stripped from the public face of any character. ---
const CHAR_GM_ONLY_FIELDS = Object.freeze([
  'secrets', 'goals', 'relationships', 'voice', 'background', 'personality',
  'notes', 'loyalty', 'monthlyWage', 'permanentWoundPenalty', 'mortalityPenalty',
  'liegeCharacterId', 'recruitmentDrives', 'recruitmentProvenance',
  'lifestyleTargetLevel', 'effectiveSocialLevel', 'lastLivingExpensePaidGp',
  'payKeepFromTreasury', 'reserveXp', 'agingDeathSave',
  'honor', 'shame', 'mercantileNetwork', 'earningsLedger', 'upkeepMonthly',
  'history', 'mortalWounds', 'divinePower'
]);

// The public face of an NPC the player can see but does not control: the
// mechanically/socially visible identity, stripped of the GM dossier. This is a
// conservative ALLOWLIST (only these keys survive) — safer than a denylist for
// the "everyone else" case, because a future field added to blankCharacter won't
// silently leak. Owned characters bypass this and keep the whole sheet.
const CHAR_PUBLIC_FIELDS = Object.freeze([
  'id', 'name', 'controlledBy', 'socialTier', 'lifecycleState',
  'creatureTypes', 'alignment', 'race', 'class', 'level',
  'currentHexId', 'currentDomainId', 'partyId', 'alive'
]);

// Domain GM-only detail. A player who does NOT own a domain still sees it exists
// (its name/ruler), but not its books or GM notes. Owned domains ride through full.
const DOMAIN_GM_ONLY_FIELDS = Object.freeze([
  'treasury', 'income', 'expenses', 'taxPolicy', 'history', 'notes',
  'pendingPlayerInput', 'council', 'warfare', 'magistrates',
  'monthlyLaborCapGp', 'dangerousBordersOverride', 'roadToTownOverride'
]);
const DOMAIN_PUBLIC_FIELDS = Object.freeze([
  'id', 'name', 'kind', 'type', 'classification', 'rulerCharacterId',
  'liegeId', 'vassalIds', 'isRealm'
]);

// Hex / settlement: drop GM notes; keep the geography/cartography a player would
// see on a shared map. (Hidden lairs are dropped at the collection level below.)
const HEX_GM_ONLY_FIELDS = Object.freeze(['notes', 'monsterNotes']);
const SETTLEMENT_GM_ONLY_FIELDS = Object.freeze(['notes', 'demandModifiers']);

// Group GM-only verdict bundles + secret notes (a band's hidden disposition).
const GROUP_GM_ONLY_FIELDS = Object.freeze(['incursion', 'wanderState', 'banditryDomainId', 'notes']);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function _clone(v){
  // structuredClone where available (Node 17+/modern browsers); JSON fallback.
  // The campaign is plain JSON data (no functions/cycles), so JSON is lossless here.
  if(typeof structuredClone === 'function'){
    try { return structuredClone(v); } catch(e){ /* fall through */ }
  }
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function _isPlayerControlled(c){
  if(typeof ACKS.isPlayerControlled === 'function') return ACKS.isPlayerControlled(c);
  return !!c && c.controlledBy === 'player';
}

// Does this player own this character? With a playerId, ownership is the explicit
// (forward-compatible) char.ownerPlayerId === playerId. With playerId null/absent
// (today), every player-controlled character counts as "ours".
function _ownsCharacter(c, playerId){
  if(!_isPlayerControlled(c)) return false;
  if(playerId == null) return true;
  return c.ownerPlayerId === playerId;
}

// The set of character ids this player owns (the seed for "what's mine").
function _ownedCharacterIds(campaign, playerId){
  const ids = new Set();
  (campaign.characters || []).forEach(c => { if(_ownsCharacter(c, playerId)) ids.add(c.id); });
  return ids;
}

// A domain is the player's if its ruler is an owned character OR (forward-compat)
// its controllingPlayerId matches the player.
function _ownsDomain(d, ownedCharIds, playerId){
  if(!d) return false;
  if(playerId != null && d.controllingPlayerId === playerId) return true;
  return !!d.rulerCharacterId && ownedCharIds.has(d.rulerCharacterId);
}

// A party is the player's if its leader OR any member is an owned character.
function _ownsParty(p, ownedCharIds){
  if(!p) return false;
  if(p.leaderCharacterId && ownedCharIds.has(p.leaderCharacterId)) return true;
  return (p.memberCharacterIds || []).some(id => ownedCharIds.has(id));
}

// Strip a denylist of keys from a cloned object (in place on the clone).
function _stripKeys(obj, keys){
  if(!obj || typeof obj !== 'object') return obj;
  keys.forEach(k => { delete obj[k]; });
  return obj;
}

// Reduce a cloned object to an allowlist of keys (everything else dropped).
function _pick(obj, keys){
  const out = {};
  if(!obj || typeof obj !== 'object') return out;
  keys.forEach(k => { if(Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; });
  return out;
}

// ---------------------------------------------------------------------------
// per-entity projection
// ---------------------------------------------------------------------------

// A character a player owns: full sheet (deep clone), unredacted.
function _projectOwnedCharacter(c){ return _clone(c); }

// A character a player does NOT own: the conservative public allowlist.
function _projectPublicCharacter(c){ return _pick(_clone(c), CHAR_PUBLIC_FIELDS); }

function _projectOwnedDomain(d){ return _clone(d); }
function _projectPublicDomain(d){ return _stripKeys(_clone(d), DOMAIN_GM_ONLY_FIELDS); }

function _projectHex(h){ return _stripKeys(_clone(h), HEX_GM_ONLY_FIELDS); }
function _projectSettlement(s){ return _stripKeys(_clone(s), SETTLEMENT_GM_ONLY_FIELDS); }

function _projectGroup(g){ return _stripKeys(_clone(g), GROUP_GM_ONLY_FIELDS); }

// A lair the players have discovered: shown, but with its GM-only hooks stripped
// (the hidden-search DC, the reserved cross-hex faction key, the GM notes).
function _projectKnownLair(l){
  return _stripKeys(_clone(l), ['hiddenDC', 'factionKey', 'notes']);
}

// A rumor the players have heard: the text + its apparent (in-fiction) commonness,
// but NOT the GM's truthLevel verdict and NOT the GM notes.
function _projectRumor(r){ return _stripKeys(_clone(r), ['truthLevel', 'notes']); }

// ---------------------------------------------------------------------------
// public world (shared regardless of which player) — discovered map + heard rumors
// ---------------------------------------------------------------------------
function _publicWorld(campaign){
  const world = {
    id: campaign.id,
    name: campaign.name,
    schemaVersion: campaign.schemaVersion,
    currentTurn: campaign.currentTurn,
    calendar: _clone(campaign.calendar),
    currentDayInMonth: campaign.currentDayInMonth
  };
  // B3 fog-of-war (audit 2026-06-24): ship only the DISCOVERED map. A hex is visible when read as
  // `explored !== false` (default true; explicit false = a fog / West-Marches hex the party hasn't
  // reached — set true by travel, see tickJourneyDay/_commitJourneyDayAndEmit). A settlement or lair
  // FLOATING on a fogged hex is hidden too; one with no/dangling hexId is not (no basis to hide). The
  // previous code shipped EVERY hex (leaking the unexplored map despite the "discovered map" contract).
  // Back-compat: with nothing marked explored:false, this hides nothing — prior behaviour holds.
  const _foggedHexIds = new Set((campaign.hexes || []).filter(h => h && h.explored === false).map(h => h.id));
  const _onFoggedHex = id => id != null && _foggedHexIds.has(id);
  world.hexes = (campaign.hexes || []).filter(h => h && h.explored !== false).map(_projectHex);
  world.settlements = (campaign.settlements || []).filter(s => s && !_onFoggedHex(s.hexId)).map(_projectSettlement);
  // Lairs: only the discovered ones (knownToPlayers), GM hooks stripped, AND not on a fogged hex
  // (a discovered lair can't float on an unexplored hex — reconcile the two axes).
  world.lairs = (campaign.lairs || []).filter(l => l && l.knownToPlayers === true && !_onFoggedHex(l.hexId)).map(_projectKnownLair);
  // Rumors: drop the GM-fabricated false ones; strip the truth verdict from the rest.
  world.rumors = (campaign.rumors || []).filter(r => r && r.truthLevel !== 'false').map(_projectRumor);
  return world;
}

// ---------------------------------------------------------------------------
// toPlayerView(campaign, characterId) — one PC's full sheet + the public world
// ---------------------------------------------------------------------------
function toPlayerView(campaign, characterId){
  if(!campaign || typeof campaign !== 'object') return null;
  const chars = campaign.characters || [];
  const me = chars.find(c => c && c.id === characterId) || null;
  if(!me) return null;
  // Guard: only a player-controlled character has a "player view". A GM trying to
  // project a GM-controlled NPC gets null (use projectCampaignForPlayer for NPCs
  // intentionally, or flip controlledBy first).
  if(!_isPlayerControlled(me)) return null;

  const view = _publicWorld(campaign);
  view.character = _projectOwnedCharacter(me);

  // The player's party, if any — projected through the same ownership rule (its
  // members shown as their public faces unless they're also the viewer).
  let party = null;
  if(me.partyId){
    const p = (campaign.parties || []).find(x => x && x.id === me.partyId) || null;
    if(p){
      party = _clone(p);
      // strip the GM party notes; keep membership/leadership/location/status.
      _stripKeys(party, ['notes']);
    }
  }
  view.party = party;

  // The character's own derived history (travel days etc.) — already player-safe
  // (it's the events that name THIS character). Reuse the engine accessor if present.
  if(typeof ACKS.characterHistory === 'function'){
    try { view.characterHistory = _clone(ACKS.characterHistory(campaign, me.id)); }
    catch(e){ view.characterHistory = []; }
  }

  return view;
}

// ---------------------------------------------------------------------------
// projectCampaignForPlayer(campaign, playerId) — whole-campaign redacted clone
// ---------------------------------------------------------------------------
function projectCampaignForPlayer(campaign, playerId){
  if(!campaign || typeof campaign !== 'object') return null;
  if(playerId === undefined) playerId = null;

  const ownedCharIds = _ownedCharacterIds(campaign, playerId);

  const out = _publicWorld(campaign);
  out.playerId = playerId;
  out.kind = 'campaign-player-view';

  // Characters: owned → full sheet; everyone else → public face.
  out.characters = (campaign.characters || []).map(c =>
    ownedCharIds.has(c.id) ? _projectOwnedCharacter(c) : _projectPublicCharacter(c)
  );

  // Domains: owned → full; others → public face (exists, but no books/notes).
  out.domains = (campaign.domains || []).map(d =>
    _ownsDomain(d, ownedCharIds, playerId) ? _projectOwnedDomain(d) : _projectPublicDomain(d)
  );

  // Parties: owned → full (minus GM notes); others → a thin public summary.
  out.parties = (campaign.parties || []).map(p => {
    if(_ownsParty(p, ownedCharIds)) return _stripKeys(_clone(p), ['notes']);
    return _pick(_clone(p), ['id', 'name', 'leaderCharacterId', 'currentHexId', 'currentDomainId', 'status']);
  });

  // Groups (monster bands etc.): public faces only, GM verdict bundles stripped.
  out.groups = (campaign.groups || []).map(_projectGroup);

  // The GM workspace + GM-only relation/log collections are dropped wholesale —
  // never part of a player's projection. (No pendingEvents, eventLog, syndicates,
  // incursion log, henchmanships/magistracies/vassalages/tributary/favor-duty,
  // notableItems/itemCustody, congregations/divineFavors/attunements, etc.)
  // They are simply absent from `out` (we only copied the player-safe keys above).

  return out;
}

Object.assign(ACKS, {
  toPlayerView,
  projectCampaignForPlayer,
  // exported for tests / integrators that want the redaction sets
  PLAYER_VIEW_CHAR_GM_ONLY_FIELDS: CHAR_GM_ONLY_FIELDS,
  PLAYER_VIEW_CHAR_PUBLIC_FIELDS: CHAR_PUBLIC_FIELDS,
  PLAYER_VIEW_DOMAIN_GM_ONLY_FIELDS: DOMAIN_GM_ONLY_FIELDS
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
