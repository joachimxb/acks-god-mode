/* ACKS God Mode — acks-engine-followers.js
 * Follower Attraction (RR p.334) — Phase 4 Construction, Wave C (the follower slice).
 *
 * When a domain's ruler reaches name level (9th) holding a stronghold worth at least his class's
 * threshold (5,000gp hideout/guildhouse → 15,000gp most), followers rally to his banner (RR pp.334–337):
 *   • COMPANIONS (1st–3rd level of the ruler's class) → first-class follower Characters
 *     (socialTier:'follower', lieged to the ruler). RAW p.335: they "function as henchmen for all
 *     purposes but do NOT take up henchman slots" — so we create NO henchmanship relation (the cap
 *     counts henchmanships), which is exactly the RAW no-slot behaviour.
 *   • TROOPS (0th/1st level rank-and-file) → one count-Group commanded by the ruler.
 *   • Cloister NOVICES (priestess) → one count-Group (the per-class progression is a Religion layer).
 *
 * The arcane SANCTUM classes (mage / warlock / witch / nobiran-wonderworker) attract their followers
 * via the SANCTUM (acks-engine-sanctums.js onSanctumConstructed, AD-B) — NOT this stronghold path; the
 * eligibility returns reason 'sanctum-class' for them so we never double-mint (a mage's followers come
 * with his sanctum, not his castle — RAW).
 *
 * Surfacing is eligibility-DERIVED (the Stronghold-tab Followers card) so it covers the build-a-castle
 * path, the reach-9th-with-a-stronghold path, AND legacy saves uniformly — no pending-event plumbing.
 * Materialization is GM-reviewed (roll → review the modal → accept). Fires ONCE per ruler
 * (ruler.followersAttracted, RR p.334 — "begin arriving when the stronghold is built or, if he already
 * has one, when he reaches 9th level").
 *
 * v1 DEFERRED (later layers — Phase_4_Construction_Plan.md §3 Wave C / RR pp.335–337): the per-class
 * Followers Type & Equipment tables (the troop Group is generic men for now), follower loyalty/morale
 * wiring (+2 / +4 divine — STORED on the character, not yet rolled), the Families-Arriving-with-Followers
 * domain population bump (RR p.337), the hideout→syndicate (Hijinks) + sanctum/dungeon specializations,
 * and promoting the troop Group to real Units with equipment.
 *
 * Loads after the core (late-binds strongholdValue / rulerCharacter / blankCharacter / blankGroup /
 * _strongholdSeatHexId / newEvent / setEventContext via _A()). Extends global.ACKS via Object.assign.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};
  function _A(){ return global.ACKS || ACKS; }

  // ── plumbing ──
  function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
  function _d6(rng){ return 1 + Math.floor((rng() || 0) * 6); }
  function _3d6(rng){ return _d6(rng) + _d6(rng) + _d6(rng); }
  function _rollAbilities(rng){ return { STR:_3d6(rng), INT:_3d6(rng), WIL:_3d6(rng), DEX:_3d6(rng), CON:_3d6(rng), CHA:_3d6(rng) }; }
  function _currentTurn(campaign){ return (campaign && typeof campaign.currentTurn === 'number') ? campaign.currentTurn : 1; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _findChar(campaign, id){ if(id && typeof id === 'object') return id; return _chars(campaign).find(c => c && c.id === id) || null; }

  // Parse + roll an RAW count spec: "NdM", "NdM+K", "NdM*X", "NdM+K*X" (e.g. "5d6*10", "1d4+1*10", "2d6", "1d2*10").
  function rollFollowerDice(spec, rng){
    const m = /^(\d+)d(\d+)(?:\+(\d+))?(?:\*(\d+))?$/.exec(String(spec || '').replace(/\s+/g, ''));
    if(!m) return 0;
    const n = +m[1], die = +m[2], plus = +(m[3] || 0), mult = +(m[4] || 1);
    let sum = 0; for(let i = 0; i < n; i++) sum += 1 + Math.floor((rng() || 0) * die);
    return (sum + plus) * mult;
  }

  // A small, setting-neutral name pool (the GM renames freely). Generic — followers are a mix of cultures.
  const _FOLLOWER_NAMES = Object.freeze([
    'Aldous','Bram','Cedric','Doran','Edric','Fenn','Garrick','Halvard','Ivo','Jarl','Kerrin','Loren',
    'Marek','Nils','Osric','Pell','Quill','Roderic','Sten','Toran','Ulf','Varro','Wend','Yorin',
    'Aud','Brena','Cora','Dera','Esme','Frida','Gwen','Halla','Inga','Jora','Kesta','Lys','Mira',
    'Nessa','Oda','Perrin','Rhea','Sela','Thora','Una','Vesna','Wyn','Yara'
  ]);
  function _pickName(rng){ const i = Math.floor((rng() || 0) * _FOLLOWER_NAMES.length); return _FOLLOWER_NAMES[Math.min(_FOLLOWER_NAMES.length - 1, Math.max(0, i))]; }

  // ════════════════════════════════════════════════════════════════════════════
  // The Followers by Class catalog (RR p.334).
  //   companions  — count dice for the leader companions (1st–3rd level of the ruler's class). null = none.
  //   companionLevels — '1d6' (roll per companion → 1-3:1, 4-5:2, 6:3) | a number (all that level).
  //   troops      — count dice for the rank-and-file (0th/1st level men). null = none.
  //   troopLevel  — 0 or 1.
  //   apprentices — count dice for 0th-level trainees (priestess cloister novices; the arcane sanctum
  //                 classes have apprentices too, but their attraction is owned by AD-B — sanctumModule).
  //   loyalty/morale — RAW starting loyalty / morale (most +2 / +1; divine +4 / +4).
  //   divine      — fanatical followers (+4 loyalty+morale, no loyalty roll on calamities); −50% build cost (info).
  //   noDomain    — hideout/guildhouse: cannot secure a domain; followers bring NO peasants (RR p.337).
  //   infiltrator — ≥1 rogue follower is a rival's infiltrator (RR p.334); can start a syndicate (Hijinks).
  //   sanctumModule — mage/warlock/witch/nobiran: followers come via the SANCTUM (AD-B), not this path.
  //   race / site — informational (the dwarven/elven follower race + the RAW site constraint).
  // ════════════════════════════════════════════════════════════════════════════
  const FOLLOWERS_BY_CLASS = Object.freeze({
    // — Martial: castle/fortress-type stronghold, 5d6×10 0th troops + 1d6 1st–3rd companions —
    'fighter':            { stronghold:'Castle',           minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1 },
    'paladin':            { stronghold:'Fortress',         minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1 },
    'barbarian':          { stronghold:"Chieftain's Hall", minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, note:'See Clanholds' },
    'bard':               { stronghold:'Great Hall',       minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1 },
    'explorer':           { stronghold:'Border Fort',      minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, site:'outlands or unsettled' },
    'zaharan-ruinguard':  { stronghold:'Dark Fortress',    minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, note:'troops may be beastmen; See Clanholds and Transitional Domains' },
    // — Divine martial: −50% build cost (info); followers fanatical (+4 loyalty/morale, no calamity loyalty roll) —
    'bladedancer':        { stronghold:'Temple',           minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:4, morale:4, divine:true, note:'See Congregants and Divine Power' },
    'crusader':           { stronghold:'Fortified Church', minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:4, morale:4, divine:true, note:'See Congregants and Divine Power' },
    'shaman':             { stronghold:'Medicine Lodge',   minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:4, morale:4, divine:true, note:'See Congregants and Divine Power' },
    // — Dwarven: vault, 1st-level dwarven mercenaries, underground —
    'dwarven-craftpriest':{ stronghold:'Vault',            minGp:15000, troops:'1d4+1*10', troopLevel:1, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, race:'dwarf', site:'underground (not human/elven civilized or borderland)', divine:true, note:'See Congregants and Divine Power' },
    'dwarven-vaultguard': { stronghold:'Vault',            minGp:15000, troops:'3d6*10',   troopLevel:1, companions:null, loyalty:2, morale:1, race:'dwarf', site:'underground (not human/elven civilized or borderland)' },
    // — Elven —
    'elven-spellsword':   { stronghold:'Fastness',         minGp:15000, troops:'3d6*10',   troopLevel:1, companions:null, loyalty:2, morale:1, race:'elf', site:'place of beauty outside human/dwarven civilized or borderland', note:'animals within 3 miles become friendly' },
    // — Rogue: hideout/guildhouse (5,000gp), 2d6 1st-level companions, NO troops, NO peasants, cannot secure a domain —
    'thief':              { stronghold:'Hideout',          minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, note:'≥1 follower is a rival infiltrator; can start a syndicate (Hijinks)' },
    'assassin':           { stronghold:'Hideout',          minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, note:'≥1 infiltrator; can start a syndicate (Hijinks)' },
    'elven-nightblade':   { stronghold:'Hideout',          minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, race:'elf', note:'≥1 infiltrator; can start a syndicate (Hijinks)' },
    'venturer':           { stronghold:'Guildhouse',       minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, note:'≥1 infiltrator; raises passive-investment cap; monopoly at 12th' },
    // — Priestess: cloister — 1d2×10 1st-level priestesses (companions) + 1d6×30 0th-level novices (apprentices) —
    'priestess':          { stronghold:'Cloister',         minGp:15000, troops:null, companions:'1d2*10', companionLevels:1, apprentices:'1d6*30', loyalty:2, morale:1, divine:true, note:'−50% build cost; novices become priestesses over ~2 years (Religion); part of older cloister until 12th' },
    // — Arcane sanctum classes: followers come via the SANCTUM (AD-B onSanctumConstructed), NOT this stronghold path —
    'mage':               { stronghold:'Sanctum', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', note:'Followers attracted via the sanctum (AD-B), not a stronghold-component' },
    'warlock':            { stronghold:'Sanctum', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', note:'Followers attracted via the sanctum (AD-B)' },
    'nobiran-wonderworker':{ stronghold:'Sanctum', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', divine:true, note:'Followers attracted via the sanctum (AD-B)' },
    'witch':              { stronghold:'Cottage', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', note:'Followers attracted via the cottage/sanctum (AD-B)' }
  });

  // Common variant spellings → the canonical catalog key. (Custom classes — #154 — define their own
  // followers and won't appear here; followerClassKey returns null for them.)
  const _CLASS_ALIASES = Object.freeze({
    'wonderworker':'nobiran-wonderworker', 'nobiran wonderworker':'nobiran-wonderworker',
    'ruinguard':'zaharan-ruinguard', 'zaharan ruinguard':'zaharan-ruinguard',
    'vaultguard':'dwarven-vaultguard', 'dwarven vaultguard':'dwarven-vaultguard',
    'craftpriest':'dwarven-craftpriest', 'dwarven craftpriest':'dwarven-craftpriest',
    'nightblade':'elven-nightblade', 'elven nightblade':'elven-nightblade',
    'spellsword':'elven-spellsword', 'elven spellsword':'elven-spellsword'
  });

  // Normalize a character's class string → a FOLLOWERS_BY_CLASS key (lowercase, hyphenated).
  function followerClassKey(character){
    const raw = String((character && character.class) || '').trim().toLowerCase();
    if(!raw) return null;
    if(_CLASS_ALIASES[raw]) return _CLASS_ALIASES[raw];
    const key = raw.replace(/\s+/g, '-');
    if(FOLLOWERS_BY_CLASS[key]) return key;
    if(_CLASS_ALIASES[key]) return _CLASS_ALIASES[key];
    return null;
  }
  function followersForClass(classKey){ return (classKey && FOLLOWERS_BY_CLASS[classKey]) || null; }

  // ── eligibility (derived — drives the Stronghold-tab card; no stored flag for surfacing) ──
  // Returns { ok, reason, ruler, classKey, row, strongholdValue, threshold, level }.
  function domainFollowerEligibility(campaign, domain){
    const A = _A();
    if(!campaign || !domain) return { ok:false, reason:'no-domain' };
    const ruler = (typeof A.rulerCharacter === 'function') ? A.rulerCharacter(campaign, domain) : _findChar(campaign, domain.rulerCharacterId);
    if(!ruler) return { ok:false, reason:'no-ruler' };
    const classKey = followerClassKey(ruler);
    const row = classKey && FOLLOWERS_BY_CLASS[classKey];
    if(!row) return { ok:false, reason:'class-has-no-followers', ruler, classKey:classKey || null };
    if(row.sanctumModule) return { ok:false, reason:'sanctum-class', ruler, classKey, row };   // AD-B owns these
    const level = Number(ruler.level) || 0;
    if(level < 9) return { ok:false, reason:'ruler-below-9th', ruler, classKey, row, level };
    if(ruler.followersAttracted) return { ok:false, reason:'already-attracted', ruler, classKey, row, level };
    const sv = (typeof A.strongholdValue === 'function') ? (A.strongholdValue(campaign, domain) || 0) : 0;
    if(sv < row.minGp) return { ok:false, reason:'stronghold-too-small', ruler, classKey, row, strongholdValue:sv, threshold:row.minGp, level };
    return { ok:true, ruler, classKey, row, strongholdValue:sv, threshold:row.minGp, level };
  }

  // ── propose (PURE roll over an eligible domain — the modal holds this; ⟳ re-rolls; Accept materializes) ──
  function proposeFollowerArrival(campaign, domain, opts){
    const elig = domainFollowerEligibility(campaign, domain);
    if(!elig.ok) return { ok:false, reason:elig.reason, eligibility:elig };
    const rng = _rng(opts);
    const row = elig.row;
    const companions = [];
    const nComp = row.companions ? rollFollowerDice(row.companions, rng) : 0;
    for(let i = 0; i < nComp; i++){
      let lvl = 1;
      if(row.companionLevels === '1d6'){ const r = _d6(rng); lvl = r <= 3 ? 1 : (r <= 5 ? 2 : 3); }
      else if(typeof row.companionLevels === 'number') lvl = row.companionLevels;
      companions.push({ level: lvl });
    }
    const troopCount = row.troops ? rollFollowerDice(row.troops, rng) : 0;
    const apprenticeCount = row.apprentices ? rollFollowerDice(row.apprentices, rng) : 0;
    return {
      ok:true, rulerId:elig.ruler.id, domainId:domain.id, classKey:elig.classKey, row,
      strongholdValue:elig.strongholdValue, threshold:elig.threshold,
      companions, companionCount:companions.length, troopCount, troopLevel:row.troopLevel || 0, apprenticeCount,
      race: row.race || (elig.ruler.race || 'human'), divine: !!row.divine, loyalty: row.loyalty || 2, morale: row.morale || 1
    };
  }

  // ── materialize a reviewed proposal ──
  function _generateFollowerCharacter(campaign, opts){
    const A = _A(); opts = opts || {};
    if(typeof A.blankCharacter !== 'function') return null;
    const rng = _rng(opts);
    const ruler = opts.ruler || {};
    const ch = A.blankCharacter({
      name: _pickName(rng),
      class: ruler.class || '',
      level: Math.max(1, Math.min(3, Number(opts.level) || 1)),
      alignment: ruler.alignment || 'N',
      race: opts.race || ruler.race || 'human',
      abilities: _rollAbilities(rng),
      controlledBy: 'gm',
      socialTier: 'follower',                 // henchman-like, but NO henchmanship → no slot (RR p.335)
      liegeCharacterId: ruler.id || null,
      currentDomainId: opts.domainId || null,
      currentHexId: opts.hexId || ruler.currentHexId || null
    });
    if(!ch) return null;
    ch.attractedAsFollower = true;            // forward-compat marker (queries / loyalty wiring later)
    ch.followerLoyalty = (opts.loyalty != null) ? opts.loyalty : 2;   // RAW starting loyalty (+2 / +4 divine) — informational v1
    ch.followerMorale = (opts.morale != null) ? opts.morale : 1;
    if(!Array.isArray(campaign.characters)) campaign.characters = [];
    campaign.characters.push(ch);
    return ch;
  }
  function _mintFollowerGroup(campaign, opts){
    const A = _A(); opts = opts || {};
    if(typeof A.blankGroup !== 'function') return null;
    const ruler = opts.ruler || {};
    const count = Math.max(0, Math.round(Number(opts.count) || 0));
    if(count <= 0) return null;
    const novices = opts.novices === true;
    const lvl = Number(opts.level) || 0;
    const raceWord = (opts.race && opts.race !== 'human') ? (opts.race.charAt(0).toUpperCase() + opts.race.slice(1) + ' ') : '';
    const name = count + ' ' + raceWord + (novices ? 'novices of ' : 'follower troops of ') + (ruler.name || 'the ruler');
    const g = A.blankGroup({
      name,
      groupTemplate: { monsterCatalogKey: null, creatureTypes: ['humanoid'], hitDice: lvl >= 1 ? '1' : '1-1' },
      count, casualties: 0,
      socialTier: 'follower',
      commanderCharacterId: ruler.id || null,
      currentDomainId: opts.domainId || null,
      currentHexId: opts.hexId || ruler.currentHexId || null,
      notes: novices
        ? ('Cloister novices attracted to ' + (ruler.name || 'the ruler') + ' (RR p.334 — become 1st-level over ~2 years; a Religion layer)')
        : ('Military followers of ' + (ruler.name || 'the ruler') + ' (RR pp.334–337 — function as mercenaries, but follow on adventures)')
    });
    if(!g) return null;
    if(!Array.isArray(g.history)) g.history = [];
    g.history.push({ turn:_currentTurn(campaign), type:'created', reason:(novices ? 'cloister novices' : 'military followers') + ' attracted to ' + (ruler.name || ruler.id) });
    if(!Array.isArray(campaign.groups)) campaign.groups = [];
    campaign.groups.push(g);
    return g;
  }

  // Record the follower-arrival audit event directly (the _recordArcaneEvent idiom — state is already
  // applied by this verb, so the event is an audit/chronicle entry, not an applyEvent round-trip).
  function _recordFollowerEvent(campaign, payload, opts){
    const A = _A(); opts = opts || {};
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent('follower-arrival', {
        submittedBy:'engine', cadence:'monthly-turn', targetTurn:_currentTurn(campaign),
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, domainId: opts.domainId || null, relatedEntities: opts.relatedEntities || [] });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(campaign);
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || 'followers arrive' },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // Materialize a reviewed proposal: companions → follower Characters, troops/novices → count-Groups,
  // mark the ruler attracted-once, emit follower-arrival. Returns { ok, reason?, companionIds, troopGroupId,
  // noviceGroupId, companionCount, troopCount, apprenticeCount }.
  function attractFollowers(campaign, domain, proposal, opts){
    const A = _A();
    if(!campaign || !domain || !proposal || proposal.ok === false) return { ok:false, reason:'no-proposal' };
    const ruler = _findChar(campaign, proposal.rulerId) || ((typeof A.rulerCharacter === 'function') ? A.rulerCharacter(campaign, domain) : null);
    if(!ruler) return { ok:false, reason:'no-ruler' };
    if(ruler.followersAttracted) return { ok:false, reason:'already-attracted' };
    const row = proposal.row || FOLLOWERS_BY_CLASS[proposal.classKey] || {};
    const seatHex = (typeof A._strongholdSeatHexId === 'function') ? A._strongholdSeatHexId(campaign, domain) : (ruler.currentHexId || null);
    const companionIds = [];
    for(const c of (proposal.companions || [])){
      const ch = _generateFollowerCharacter(campaign, { ruler, level:c.level, race:proposal.race, loyalty:proposal.loyalty, morale:proposal.morale, domainId:domain.id, hexId:seatHex, rng:opts && opts.rng });
      if(ch) companionIds.push(ch.id);
    }
    let troopGroupId = null;
    if((proposal.troopCount || 0) > 0){
      const g = _mintFollowerGroup(campaign, { ruler, count:proposal.troopCount, level:proposal.troopLevel, race:proposal.race, domainId:domain.id, hexId:seatHex });
      troopGroupId = g ? g.id : null;
    }
    let noviceGroupId = null;
    if((proposal.apprenticeCount || 0) > 0){
      const g = _mintFollowerGroup(campaign, { ruler, count:proposal.apprenticeCount, level:0, race:proposal.race, domainId:domain.id, hexId:seatHex, novices:true });
      noviceGroupId = g ? g.id : null;
    }
    ruler.followersAttracted = true;
    ruler.followersAttractedAtTurn = _currentTurn(campaign);
    if(typeof A.addCharacterHistory === 'function'){
      try { A.addCharacterHistory(campaign, ruler.id, { turn:_currentTurn(campaign), type:'followers-attracted', reason:'attracts followers to ' + (row.stronghold || 'his stronghold') + ' (RR p.334)' }); } catch(_e){}
    }
    const bits = [];
    if(companionIds.length) bits.push(companionIds.length + ' companion' + (companionIds.length === 1 ? '' : 's'));
    if(proposal.troopCount) bits.push(proposal.troopCount.toLocaleString() + ' troops');
    if(proposal.apprenticeCount) bits.push(proposal.apprenticeCount.toLocaleString() + ' novices');
    const narrative = (ruler.name || ruler.id) + ' attracts followers to ' + (row.stronghold || 'a stronghold') + ': ' + (bits.join(' + ') || 'none') + ' (RR p.334).';
    _recordFollowerEvent(campaign, {
      domainId: domain.id, rulerCharacterId: ruler.id, classKey: proposal.classKey,
      companionCharacterIds: companionIds, troopGroupId, noviceGroupId,
      companionCount: companionIds.length, troopCount: proposal.troopCount || 0, apprenticeCount: proposal.apprenticeCount || 0
    }, { domainId: domain.id, primaryHexId: seatHex, narrative,
      relatedEntities: [{ kind:'character', id:ruler.id, role:'subject' }, { kind:'domain', id:domain.id, role:'site' }].concat(companionIds.map(id => ({ kind:'character', id, role:'beneficiary' }))) });
    return { ok:true, rulerId:ruler.id, companionIds, troopGroupId, noviceGroupId,
      companionCount: companionIds.length, troopCount: proposal.troopCount || 0, apprenticeCount: proposal.apprenticeCount || 0, narrative };
  }

  Object.assign(global.ACKS, {
    FOLLOWERS_BY_CLASS, rollFollowerDice, followerClassKey, followersForClass,
    domainFollowerEligibility, proposeFollowerArrival, attractFollowers
  });

})(typeof window !== 'undefined' ? window : global);
