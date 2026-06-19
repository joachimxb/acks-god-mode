/* ACKS God Mode — acks-engine-politics.js
 * Politics & Power — P-1 (the senate / faction / senatorship data layer). Wave D (Architecture §3.5).
 *
 * Spec: Phase_4_Politics_Plan.md §4 (data model) + §14 P-1; Politics_RAW_Survey.md §4 + §7.
 * Sources: RR pp.355–360 (the senate core); JJ pp.402–407 (oligarchies + land/lordship — read-only here).
 *
 * P-1 (burst4) shipped the data layer + derived reads:
 *   - blankSenate (sen-) / blankFaction (fac-) / blankSenatorship (snr-) factories,
 *   - lookups + the Domain.governance sub-tree (feudal/senatorial; defensive-read + a setter),
 *   - the derived accessors (§4.4): faction totalInfluence + standing, senate ruling/leading faction,
 *     senateBenefitsActive, the oligarchy reads.
 * P-2 (burst5 2026-06-14) adds the senate ENGINE: senateVote (the 2d6-per-leading-senator voting,
 *   RR p.358, + the by-faction shortcut + bewitched auto-vote — the §4.4 tally stays DERIVED, never
 *   cached), senateBenefits (the structured benefit read; the economy WIRING is a deferred later
 *   touch — out of this lane), the dispute lifecycle (setSenateDispute/clearSenateDispute/enactPolicy),
 *   and the F&D Office→senate-seat hook (syncOfficeSenateSeat — the deferred F&D-8 dependency, §10).
 *   Two record-only events (senate-vote / policy-enacted; the verb applies state + emits, the events.js
 *   handler is a record-only audit) + the senate-auto-vote UX rule (default ON, roll-vs-narrate).
 * STILL queued (later P-waves): influence actions (bribe/intimidate/seduce — P-4), the Senate Wizard
 *   (generation — P-5), Eldermoot reconcile (P-7), and the rule-of-the-few oligarchy slices. The senate
 *   is RAW core, no master toggle (CLAUDE §6; the plan's §8 / survey §11 polarity, Joachim 2026-06-13);
 *   senate-auto-vote is a UX preference (default ON, the favor-duty-auto-roll precedent), not a divergence.
 *
 * Loads LAST (the harness/glob + index.html load acks-engine-*.js after the canonical set), so every
 * other module is present at call time. Self-contained: pure reads/setters over a passed campaign;
 * cross-module helpers (newId, ID_PREFIXES, totalFamilies, abilityMod) are resolved at CALL time off
 * global.ACKS. The three collections are READ DEFENSIVELY ((campaign.senates)||[]) and are NOT lazy-
 * injected into migrateCampaign — so the 6 templates + demo stay true migrate-no-ops (the burst3
 * sieges/syndicates discipline; the importer's SIMPLE_ID_COLLECTIONS ensures the arrays on import).
 *
 * Contributor mandate (CLAUDE §8.9): a Mechanic Extensions entry + the Data_Dictionary fields land in
 * the Lead's doc-pass (see _handoffs/Politics_P1.SUMMARY.md ## Doc-delta). Derived ruling/leading is
 * authoritative; any stored rulingFactionId is a cache only.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};
  const SCHEMA_VERSION = 2;

  // Late-bound namespace (freshest export set; these run well after every module loads).
  function _A(){ return global.ACKS || ACKS; }
  function _newId(name, fallback){
    const A = _A();
    const pfx = (A.ID_PREFIXES && A.ID_PREFIXES[name]) || fallback;
    return (typeof A.newId === 'function') ? A.newId(pfx) : (pfx + '-' + Math.random().toString(36).slice(2, 9));
  }
  function _domains(campaign){ return (campaign && Array.isArray(campaign.domains)) ? campaign.domains : []; }
  function _senates(campaign){ return (campaign && Array.isArray(campaign.senates)) ? campaign.senates : []; }
  function _factions(campaign){ return (campaign && Array.isArray(campaign.factions)) ? campaign.factions : []; }
  function _senatorships(campaign){ return (campaign && Array.isArray(campaign.senatorships)) ? campaign.senatorships : []; }
  function _findChar(campaign, id){
    if(!id || !campaign || !Array.isArray(campaign.characters)) return null;
    return campaign.characters.find(c => c && c.id === id) || null;
  }
  function _findDomain(campaign, id){
    if(!id) return null;
    return _domains(campaign).find(d => d && d.id === id) || null;
  }
  // A senatorship counts toward the tally while active (not vacated).
  function _isActiveSenatorship(s){ return !!s && (s.status == null || s.status === 'active'); }

  // ── Reference data — the 1d20 Policy Objectives taxonomy (RR p.357; survey §4.4) ──
  // The seed goal taxonomy: a leading senator rolls 1d3 of these; factions cluster by compatible
  // objectives; "policy helps/hinders an objective" is the P-3 vote modifier. Stored on
  // senatorship.policyObjectives[] + faction.policyObjectives[].
  const POLICY_OBJECTIVES = Object.freeze([
    'overland-trade-routes', 'maritime-trade-routes', 'increase-army', 'decrease-army',
    'increase-navy', 'decrease-navy', 'replace-ruler', 'preserve-ruler', 'conquer-neighbor',
    'make-peace', 'build-border-strongholds', 'decrease-peasant-taxes', 'increase-peasant-taxes',
    'eliminate-or-institute-slavery', 'redistribute-land-to-peasants', 'support-existing-faith',
    'introduce-new-faith', 'grow-urban-settlements', 'grow-personal-realm', 'gain-merchandise-monopolies'
  ]);

  // ════════════════════════════════════════════════════════════════════════════
  // Factories (Phase_4_Politics_Plan.md §4.1–§4.2; survey §7.2–§7.3)
  // ════════════════════════════════════════════════════════════════════════════

  // The senate — a deliberative body on a realm-apex domain (RR pp.355–360). Eldermoot/council
  // reuse the same shape (kind). rulingFactionId/leadingFactionId are DERIVED (§4.4) — not stored
  // here. requirementsOfOffice carries the in-world bar + the bribe-cost row (the senatorship's
  // bribeCostByPeriod is copied from it, RR p.357).
  function blankSenate(opts = {}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || _newId('senate', 'sen'),
      realmDomainId: opts.realmDomainId || null,                 // the apex domain (no liege)
      name: opts.name || '',                                     // e.g. "Senate of Aura"
      kind: opts.kind || 'senate',                               // senate | eldermoot | council
      seats: (opts.seats != null) ? opts.seats : 0,              // total vote pool (RR p.357 size table)
      minSenatorLevel: (opts.minSenatorLevel != null) ? opts.minSenatorLevel : null,
      // The requirements-of-office row (RR p.357) — descriptive bar + the bribe-cost-by-period.
      requirementsOfOffice: opts.requirementsOfOffice || {
        minLevel: null, title: '', netWorthGp: 0, landDescription: '', families: 0,
        bribeCostDay: 0, bribeCostWeek: 0, bribeCostMonth: 0, bribeCostYear: 0
      },
      independentMinorSenatorVotes: (opts.independentMinorSenatorVotes != null) ? opts.independentMinorSenatorVotes : 0,
      establishedAtTurn: (opts.establishedAtTurn != null) ? opts.establishedAtTurn : null,
      honeymoonUntilTurn: (opts.honeymoonUntilTurn != null) ? opts.honeymoonUntilTurn : null, // RR p.357 1d6-mo all-vote-for window
      dispute: opts.dispute || null,                             // null | { defiedTopic, sinceTurn, attempts }
      status: opts.status || 'active',                           // active | in-dispute | dissolved
      history: Array.isArray(opts.history) ? opts.history : []
    };
  }

  // A political faction (RR p.357). Senate-scoped (senateId) but generic-capable. Its influence
  // total + ruling/leading standing are DERIVED (§4.4); the stored `kind` is a GM-settable stance
  // (the LIVE ruling/leading is factionStanding()).
  function blankFaction(opts = {}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || _newId('faction', 'fac'),
      name: opts.name || '',
      platform: opts.platform || '',                            // free-text platform summary
      senateId: opts.senateId || null,                          // nullable — non-senate factions allowed
      realmDomainId: opts.realmDomainId || null,
      policyObjectives: Array.isArray(opts.policyObjectives) ? opts.policyObjectives.slice() : [],
      kind: opts.kind || 'minor',                               // ruling | leading | opposition | minor (ruling/leading derived live)
      status: opts.status || 'active',                          // active | dissolved
      history: Array.isArray(opts.history) ? opts.history : []
    };
  }

  // A senatorship — the character ↔ senate seat (Wave-D relation; survey §7.3). The workhorse: it
  // carries the senator's votes (influence), faction, objectives, attitude, and the standing
  // pre-vote influenceModifiers[] (bribed/intimidated/seduced/owes-favor). RAW: influence + objectives
  // are SECRET until revealed (isSecretInfluence).
  function blankSenatorship(opts = {}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || _newId('senatorship', 'snr'),
      senatorCharacterId: opts.senatorCharacterId || null,
      senateId: opts.senateId || null,
      rank: opts.rank || 'leading',                             // leading (named NPC) | minor
      votes: (opts.votes != null) ? opts.votes : 0,             // influence (the votes this seat controls)
      factionId: opts.factionId || null,                        // nullable (independent leading senator)
      policyObjectives: Array.isArray(opts.policyObjectives) ? opts.policyObjectives.slice() : [], // 1d3 objective keys
      attitudeTowardRuler: (opts.attitudeTowardRuler != null) ? opts.attitudeTowardRuler : 7,      // 2–12 running disposition
      isSecretInfluence: (opts.isSecretInfluence != null) ? !!opts.isSecretInfluence : true,       // RAW: secret until revealed
      bribeCostByPeriod: opts.bribeCostByPeriod || { day: 0, week: 0, month: 0, year: 0 },         // from requirements-of-office
      influenceModifiers: Array.isArray(opts.influenceModifiers) ? opts.influenceModifiers.slice() : [], // [{source,kind,value,sinceTurn,byCharacterId}]
      seatedAtTurn: (opts.seatedAtTurn != null) ? opts.seatedAtTurn : null,
      vacatedAtTurn: (opts.vacatedAtTurn != null) ? opts.vacatedAtTurn : null,
      status: opts.status || 'active',                          // active | vacated
      history: Array.isArray(opts.history) ? opts.history : []
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lookups (defensive — absent collections read as [])
  // ════════════════════════════════════════════════════════════════════════════

  function findSenate(campaign, id){ if(!id) return null; return _senates(campaign).find(s => s && s.id === id) || null; }
  function findFaction(campaign, id){ if(!id) return null; return _factions(campaign).find(f => f && f.id === id) || null; }
  function findSenatorship(campaign, id){ if(!id) return null; return _senatorships(campaign).find(s => s && s.id === id) || null; }

  // The senate(s) seated on a realm-apex domain (v1: one per apex; OQ1 multi-realm deferred).
  function senatesForRealm(campaign, apexDomainId){
    if(!apexDomainId) return [];
    return _senates(campaign).filter(s => s && s.realmDomainId === apexDomainId);
  }
  // The single active senate on an apex domain — or null.
  function senateForRealm(campaign, apexDomainId){
    return senatesForRealm(campaign, apexDomainId).find(s => s.status !== 'dissolved') || null;
  }
  // All factions / senatorships of a senate.
  function factionsForSenate(campaign, senateId){
    if(!senateId) return [];
    return _factions(campaign).filter(f => f && f.senateId === senateId && f.status !== 'dissolved');
  }
  function senatorshipsForSenate(campaign, senateId){
    if(!senateId) return [];
    return _senatorships(campaign).filter(s => s && s.senateId === senateId && _isActiveSenatorship(s));
  }
  function senatorshipsInFaction(campaign, factionId){
    if(!factionId) return [];
    return _senatorships(campaign).filter(s => s && s.factionId === factionId && _isActiveSenatorship(s));
  }
  // Every seat a character holds (across senates / over time, active).
  function senatorshipsForCharacter(campaign, characterId){
    if(!characterId) return [];
    return _senatorships(campaign).filter(s => s && s.senatorCharacterId === characterId && _isActiveSenatorship(s));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Governance mode (the realm-apex sub-tree; §4.3) — defensive-read default + a setter
  // ════════════════════════════════════════════════════════════════════════════
  // The governance sub-tree replaces the reserved-but-vague Domain.council. It is NOT lazy-injected
  // onto every domain (defensive read keeps the templates migrate-no-ops); governanceFor() returns a
  // fresh merged view, setDomainGovernance() materializes it on write.
  const DEFAULT_GOVERNANCE = Object.freeze({
    mode: 'feudal',                  // feudal (today's default) | senatorial | oligarchic
    senateId: null,
    oligarchCharacterIds: [],        // when oligarchic (the collective ruler's members)
    oligarchyDecisionRule: 'majority', // majority | unanimous | weighted
    landSeparated: false,            // Separating Land and Lordship (rule-of-the-few; later)
    governorCharacterId: null        // when landSeparated (else = the ruler)
  });

  // A fresh, fully-defaulted governance view for a domain (does NOT mutate the domain).
  function governanceFor(campaign, domain){
    const g = (domain && domain.governance && typeof domain.governance === 'object') ? domain.governance : {};
    return {
      mode: g.mode || DEFAULT_GOVERNANCE.mode,
      senateId: (g.senateId != null) ? g.senateId : null,
      oligarchCharacterIds: Array.isArray(g.oligarchCharacterIds) ? g.oligarchCharacterIds.slice() : [],
      oligarchyDecisionRule: g.oligarchyDecisionRule || DEFAULT_GOVERNANCE.oligarchyDecisionRule,
      landSeparated: !!g.landSeparated,
      governorCharacterId: (g.governorCharacterId != null) ? g.governorCharacterId : null
    };
  }
  // Materialize + patch a domain's governance sub-tree (the only writer). Returns the patched object.
  function setDomainGovernance(campaign, domainId, patch){
    const d = _findDomain(campaign, domainId);
    if(!d) return null;
    const cur = (d.governance && typeof d.governance === 'object') ? d.governance : {};
    const next = Object.assign(governanceFor(campaign, d), cur, patch || {});
    // Normalize the array field after the merge (patch may pass a fresh array).
    if(!Array.isArray(next.oligarchCharacterIds)) next.oligarchCharacterIds = [];
    d.governance = next;
    return d.governance;
  }

  // The realm apex = the domain that is no one's vassal (walk liegeId up; cycle-guarded).
  function realmApexDomain(campaign, domain){
    let cur = domain;
    const seen = new Set();
    while(cur && cur.liegeId && !seen.has(cur.id)){
      seen.add(cur.id);
      const next = _findDomain(campaign, cur.liegeId);
      if(!next) return cur;
      cur = next;
    }
    return cur || domain;
  }
  // The senate governing a domain's realm (resolved at the apex) — or null.
  function senateForDomain(campaign, domain){
    const apex = realmApexDomain(campaign, domain);
    if(!apex) return null;
    const g = governanceFor(campaign, apex);
    if(g.senateId){ const s = findSenate(campaign, g.senateId); if(s) return s; }
    return senateForRealm(campaign, apex.id);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Derived accessors (§4.4 — recomputed, never stored canonically; §3.3)
  // ════════════════════════════════════════════════════════════════════════════

  // A faction's influence = Σ its active member senatorships' votes.
  function factionTotalInfluence(campaign, faction){
    if(!faction) return 0;
    return senatorshipsInFaction(campaign, faction.id).reduce((sum, s) => sum + (Number(s.votes) || 0), 0);
  }
  // The senate's total vote pool (the denominator for a majority): Σ all active senatorships' votes
  // + the anonymous independent minor votes (RR p.357 — leading influence + independents = the seats).
  function senateTotalVotes(campaign, senate){
    if(!senate) return 0;
    const seated = senatorshipsForSenate(campaign, senate.id).reduce((sum, s) => sum + (Number(s.votes) || 0), 0);
    return seated + (Number(senate.independentMinorSenatorVotes) || 0);
  }
  // The ruling faction = the one holding a strict MAJORITY of the senate's votes — or null (RR p.357).
  function senateRulingFactionId(campaign, senate){
    if(!senate) return null;
    const total = senateTotalVotes(campaign, senate);
    if(total <= 0) return null;
    const threshold = Math.floor(total / 2) + 1;
    for(const f of factionsForSenate(campaign, senate.id)){
      if(factionTotalInfluence(campaign, f) >= threshold) return f.id;
    }
    return null;
  }
  // The leading faction = ruling if a majority exists, else the plurality (most votes; a tie ⇒ null).
  function senateLeadingFactionId(campaign, senate){
    const ruling = senateRulingFactionId(campaign, senate);
    if(ruling) return ruling;
    let bestId = null, best = 0, tied = false;
    for(const f of factionsForSenate(campaign, senate.id)){
      const inf = factionTotalInfluence(campaign, f);
      if(inf > best){ best = inf; bestId = f.id; tied = false; }
      else if(inf === best && inf > 0){ tied = true; }
    }
    return (best > 0 && !tied) ? bestId : null;
  }
  // A faction's LIVE competitive standing (authoritative over the stored `kind`): ruling | leading | minor.
  function factionStanding(campaign, faction){
    if(!faction) return 'minor';
    const senate = findSenate(campaign, faction.senateId);
    if(!senate) return faction.kind || 'minor';
    if(senateRulingFactionId(campaign, senate) === faction.id) return 'ruling';
    if(senateLeadingFactionId(campaign, senate) === faction.id) return 'leading';
    return 'minor';
  }

  // The §5.1 benefits guard (the boolean only — P-2 wires the four effects). A realm enjoys the senate
  // benefits when its apex governance is senatorial AND the senate is not in dispute (RR pp.355/359).
  function senateBenefitsActive(campaign, domain){
    const apex = realmApexDomain(campaign, domain);
    if(!apex) return false;
    if(governanceFor(campaign, apex).mode !== 'senatorial') return false;
    const senate = senateForDomain(campaign, apex);
    if(!senate || senate.status === 'dissolved') return false;
    return senate.dispute == null;
  }
  // Convenience predicate (the apex resolves senatorial).
  function isSenatorialRealm(campaign, domain){
    const apex = realmApexDomain(campaign, domain);
    return !!apex && governanceFor(campaign, apex).mode === 'senatorial';
  }

  // The oligarchy's DERIVED collective stats (JJ p.402; rule-of-the-few later, but the read is a
  // harmless pure derivation): CHA = avg ability modifier (+1 per Leadership), level = avg class
  // level, alignment by the ⅔/½ rules. Returns null when not oligarchic / no members.
  function _abilityMod(ch){
    const A = _A();
    const fn = (typeof A.abilityMod === 'function') ? A.abilityMod : (s => Math.floor(((Number(s) || 10) - 10) / 3));
    return fn((ch && ch.abilities && ch.abilities.CHA) || 10);
  }
  function _hasLeadership(ch){
    const profs = (ch && Array.isArray(ch.proficiencies)) ? ch.proficiencies : [];
    return profs.some(p => /leadership/i.test(typeof p === 'string' ? p : (p && (p.key || p.name || ''))));
  }
  function oligarchyDerivedStats(campaign, domain){
    const apex = realmApexDomain(campaign, domain);
    const g = governanceFor(campaign, apex);
    if(g.mode !== 'oligarchic') return null;
    const members = g.oligarchCharacterIds.map(id => _findChar(campaign, id)).filter(Boolean);
    if(members.length === 0) return null;
    let chaSum = 0, levelSum = 0, lawful = 0, chaotic = 0;
    for(const m of members){
      chaSum += _abilityMod(m) + (_hasLeadership(m) ? 1 : 0);
      levelSum += (Number(m.level) || 1);
      const al = (m.alignment || '').toLowerCase();
      if(al.startsWith('law')) lawful++;
      else if(al.startsWith('cha')) chaotic++;
    }
    const n = members.length;
    let alignment = 'Neutral';
    if(lawful >= Math.ceil(n * 2 / 3)) alignment = 'Lawful';
    else if(lawful >= Math.ceil(n / 2) && chaotic === 0) alignment = 'Lawful';
    else if(chaotic >= Math.ceil(n / 2)) alignment = 'Chaotic';
    return {
      memberCount: n,
      cha: Math.round(chaSum / n),                 // average CHA modifier (+Leadership)
      level: Math.round(levelSum / n),             // average class level
      alignment
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // P-2 — the senate engine: voting + benefits/restrictions + disputes + the F&D
  //       Office→seat hook (burst5 2026-06-14). Spec: Phase_4_Politics_Plan.md §5 +
  //       §10; Politics_RAW_Survey.md §4.5 (RR p.358 voting) / §4.1–§4.2 (RR p.355) /
  //       §4.6 (RR p.359 disputes). The §4.4 tally stays DERIVED — voting reads it,
  //       never caches it. Two record-only events (senate-vote / policy-enacted): the
  //       verb here applies state + emits the already-applied event; the events.js
  //       handler is a record-only audit (the favor-duty / hijink precedent).
  // ════════════════════════════════════════════════════════════════════════════

  // The six matters a senatorial ruler must consult the senate before doing (RR p.359;
  // survey §4.2). "Particular republics vary" — this is the typical RAW set.
  const SENATE_RESTRICTED_MATTERS = Object.freeze([
    'invade-realm', 'demand-duty', 'appoint-vassal-manager',
    'change-taxes', 'change-religion', 'levy-troops'
  ]);
  function isSenateConsultationRequired(matter){ return SENATE_RESTRICTED_MATTERS.indexOf(matter) >= 0; }

  // The Senate Voting band table (2d6, adjusted — RR p.358). Maps an adjusted result to a
  // vote + an optional faction cascade (endorse/condemn influences later same-faction rolls).
  //   ≤2  → against AND condemn   ·  3–5 → against  ·  6–8 → with the current trend
  //   9–11 → for                  ·  ≥12 → for AND endorse
  function senateVotingBand(adjusted){
    const a = Number(adjusted) || 0;
    if(a <= 2)  return { band:'against-condemn', vote:'against', cascade:'condemn' };
    if(a <= 5)  return { band:'against',          vote:'against', cascade:null };
    if(a <= 8)  return { band:'trend',            vote:'trend',   cascade:null };
    if(a <= 11) return { band:'for',              vote:'for',     cascade:null };
    return        { band:'for-endorse',       vote:'for',     cascade:'endorse' };
  }

  // Does a character hold a proficiency matching re (canonical {key} shape — PT-0; defensive
  // for the legacy string / {name} shapes). Used for the ruler's Diplomacy / Mystic Aura flags.
  function _hasProf(ch, re){
    const profs = (ch && Array.isArray(ch.proficiencies)) ? ch.proficiencies : [];
    return profs.some(p => re.test(typeof p === 'string' ? p : (p && (p.key || p.name || ''))));
  }
  // A senatorship is "bewitched" when it carries an influenceModifier of kind 'bewitched'
  // (RR p.358 — a bewitched senator always votes as the bewitcher directs; the Wave-C bonds
  // layer isn't built, so v1 reads the shipped influenceModifiers[] shape). value ≥ 0 ⇒ votes
  // FOR the bewitcher's policy, < 0 ⇒ against. Returns null when not bewitched.
  function _bewitchedVote(senatorship){
    const mods = (senatorship && Array.isArray(senatorship.influenceModifiers)) ? senatorship.influenceModifiers : [];
    const b = mods.find(m => m && m.kind === 'bewitched');
    if(!b) return null;
    return (Number(b.value) || 0) < 0 ? 'against' : 'for';
  }
  // Is the senator the ruler's henchman (or his henchman's henchman — RR p.358 +5)? Reads the
  // character's liege chain; uses the shipped isHenchman predicate when present (defensive fallback).
  function _senatorIsRulerHenchman(campaign, senatorship, rulerId){
    if(!rulerId || !senatorship) return false;
    const ch = _findChar(campaign, senatorship.senatorCharacterId);
    if(!ch) return false;
    const A = _A();
    const isHen = (typeof A.isHenchman === 'function') ? A.isHenchman(ch) : (ch.kind === 'henchman');
    if(!isHen) return false;
    // direct henchman, or up to one further link (henchman of the ruler's henchman)
    let liege = ch.liegeCharacterId, seen = new Set();
    for(let i = 0; i < 2 && liege && !seen.has(liege); i++){
      if(liege === rulerId) return true;
      seen.add(liege);
      const lc = _findChar(campaign, liege);
      liege = lc ? lc.liegeCharacterId : null;
    }
    return false;
  }

  // Resolve the consultation context off the senate + opts: the ruler, his realm-wide flags,
  // and the policy/military/faction inputs the UI supplies. Pure; defensive defaults.
  function _consultContext(campaign, senate, opts){
    opts = opts || {};
    const apex = senate && senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const rulerId = opts.rulerCharacterId || (apex && apex.rulerCharacterId) || null;
    const ruler = _findChar(campaign, rulerId);
    return {
      rulerId,
      ruler,
      domainMorale: Number(opts.domainMorale) || 0,                       // ruler's current Domain Morale score (RR p.358)
      hasDiplomacy: !!(ruler && _hasProf(ruler, /diplomacy/i)),
      hasMysticAura: !!(ruler && _hasProf(ruler, /mystic[\s-]?aura/i)),
      lawfulClean: !!(ruler && /^law/i.test(ruler.alignment || '') && opts.rulerCleanRecord !== false),
      rulerFactionId: opts.rulerFactionId || null,                         // the faction the ruler aligns with (RR p.358)
      policyHelps: Array.isArray(opts.policyHelps) ? opts.policyHelps : [],
      policyHinders: Array.isArray(opts.policyHinders) ? opts.policyHinders : [],
      militaryLoyalty: opts.militaryLoyalty || 'none',                     // 'none' | 'third' | 'all' (RR p.359)
      controlledIndependentVotes: Math.max(0, Number(opts.controlledIndependentVotes) || 0) // §4.7 ruler-directed bloc
    };
  }

  // The itemized voting-roll modifier stack for one senator (RR p.358; survey §4.5). Returns
  // { modifiers:[{label,value}], total }. `cascades` = the running per-faction {endorsements,
  // condemnations} tally from earlier senators (for the endorse/condemn cascade). When
  // factionWide is true (the by-faction shortcut) only ruler-and-faction-wide rows apply.
  function senatorVoteModifiers(campaign, senate, senatorship, ctx, cascades, factionWide){
    const mods = [];
    const add = (label, value) => { if(value) mods.push({ label, value }); };
    // ── ruler-wide rows (apply in both modes) ──
    add('domain morale', ctx.domainMorale);
    if(!ctx.hasDiplomacy) add('ruler lacks Diplomacy', -2);
    if(ctx.hasMysticAura) add('ruler has Mystic Aura', +1);
    if(ctx.lawfulClean) add('ruler Lawful & untainted', +1);
    if(ctx.militaryLoyalty === 'all') add('all military loyal to ruler', +2);
    else if(ctx.militaryLoyalty === 'third') add('≥⅓ military loyal to ruler', +1);
    // ── faction alignment (ruler-and-faction-wide) ──
    if(ctx.rulerFactionId && senatorship.factionId){
      if(senatorship.factionId === ctx.rulerFactionId) add('same faction as ruler', +1);
      else add('opposed faction', -2);
    }
    if(!factionWide){
      // ── per-senator rows ──
      if(_senatorIsRulerHenchman(campaign, senatorship, ctx.rulerId)) add('senator is ruler’s henchman', +5);
      // endorse/condemn cascade from earlier same-faction senators
      const fc = (senatorship.factionId && cascades && cascades[senatorship.factionId]) || null;
      if(fc){
        if(fc.endorsements) add(fc.endorsements + ' same-faction endorsement(s)', +1 * fc.endorsements);
        if(fc.condemnations) add(fc.condemnations + ' same-faction condemnation(s)', -1 * fc.condemnations);
      }
      // policy helps/hinders the senator's objectives (RR p.358: +1 helps / −2 hinders, per objective)
      const objs = Array.isArray(senatorship.policyObjectives) ? senatorship.policyObjectives : [];
      const helps = objs.filter(o => ctx.policyHelps.indexOf(o) >= 0).length;
      const hinders = objs.filter(o => ctx.policyHinders.indexOf(o) >= 0).length;
      if(helps) add('policy helps ' + helps + ' objective(s)', +1 * helps);
      if(hinders) add('policy hinders ' + hinders + ' objective(s)', -2 * hinders);
      // standing influence (bribe / intimidate / seduce / owes-favor / rival-bribe), pre-summed in
      // the senatorship's influenceModifiers[] as signed values (P-1's shape; survey §4.5).
      const im = Array.isArray(senatorship.influenceModifiers) ? senatorship.influenceModifiers : [];
      for(const m of im){
        if(!m || m.kind === 'bewitched') continue;        // bewitched is resolved before the roll
        const v = Number(m.value) || 0;
        if(v) add((m.kind || 'influence'), v);
      }
    }
    return { modifiers: mods, total: mods.reduce((s, m) => s + (Number(m.value) || 0), 0) };
  }

  // Resolve a 'trend' vote against the running tally (RR p.358 — with the side that has more
  // votes so far; abstains if tied / none yet).
  function _resolveTrend(forVotes, againstVotes){
    if(forVotes > againstVotes) return 'for';
    if(againstVotes > forVotes) return 'against';
    return 'abstain';
  }

  // Consult the senate on a matter (RR p.358; survey §4.5). Rolls 2d6 per leading senator in
  // descending influence order (or once per faction with the by-faction shortcut), applying the
  // itemized modifier stack + the running endorse/condemn cascade, stopping at a vote majority.
  // Bewitched senators auto-vote. Independents the ruler controls (§4.7) start on the FOR side.
  // PURE compute + an already-applied 'senate-vote' record (the verb pattern). Returns the tally.
  //   opts: { senateId | senate, matter, mode:'per-senator'|'by-faction', rulerCharacterId,
  //           domainMorale, rulerFactionId, policyHelps[], policyHinders[], militaryLoyalty,
  //           controlledIndependentVotes, rng, autoRoll, gmOutcome, emit:false }
  // When autoRoll is false (the senate-auto-vote rule OFF, or an explicit override), no dice are
  // rolled — the GM-narrated gmOutcome ('approved'|'rejected') is recorded as-is.
  function senateVote(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    const rng = opts.rng || Math.random;
    const mode = opts.mode === 'by-faction' ? 'by-faction' : 'per-senator';
    const ctx = _consultContext(campaign, senate, opts);
    const totalVotes = senateTotalVotes(campaign, senate);
    const majorityThreshold = totalVotes > 0 ? Math.floor(totalVotes / 2) + 1 : 1;

    // Honor the senate-auto-vote UX rule (default ON) unless overridden. OFF ⇒ the GM narrates.
    const ruleOn = (typeof opts.autoRoll === 'boolean')
      ? opts.autoRoll
      : !(_A().isHouseRuleEnabled && _A().isHouseRuleEnabled(campaign, 'senate-auto-vote') === false);

    let forVotes = ctx.controlledIndependentVotes, againstVotes = 0, abstainVotes = 0;
    const rolls = [];
    const cascades = {};                                   // factionId → {endorsements, condemnations}
    let outcome, approved;

    if(!ruleOn){
      // GM-narrated outcome (no dice). The breakdown still carries the threshold + controlled bloc.
      approved = (opts.gmOutcome || 'approved') === 'approved';
      outcome = approved ? 'approved' : 'rejected';
      if(approved) forVotes = Math.max(forVotes, majorityThreshold);
      else againstVotes = Math.max(againstVotes, majorityThreshold);
    } else if(mode === 'by-faction'){
      // One roll per faction, ruler-and-faction-wide modifiers only; the faction's whole influence votes.
      const facs = factionsForSenate(campaign, senate.id)
        .map(f => ({ f, votes: factionTotalInfluence(campaign, f) }))
        .filter(x => x.votes > 0)
        .sort((a, b) => b.votes - a.votes);
      for(const { f, votes } of facs){
        const stub = { factionId: f.id, policyObjectives: f.policyObjectives || [], influenceModifiers: [] };
        const mod = senatorVoteModifiers(campaign, senate, stub, ctx, cascades, true);
        const d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6);
        const adjusted = d1 + d2 + mod.total;
        const band = senateVotingBand(adjusted);
        let vote = band.vote === 'trend' ? _resolveTrend(forVotes, againstVotes) : band.vote;
        if(vote === 'for') forVotes += votes; else if(vote === 'against') againstVotes += votes; else abstainVotes += votes;
        rolls.push({ factionId: f.id, factionName: f.name || f.id, votes, roll:{ d1, d2, natural:d1+d2 },
          modifiers: mod.modifiers, adjusted, band: band.band, vote });
        if(forVotes >= majorityThreshold || againstVotes >= majorityThreshold) break;
      }
    } else {
      // Per-senator: roll 2d6 for each leading senatorship in descending influence order.
      const seats = senatorshipsForSenate(campaign, senate.id)
        .filter(s => s.rank !== 'minor')
        .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));
      for(const s of seats){
        const votes = Number(s.votes) || 0;
        const bew = _bewitchedVote(s);
        let roll = null, adjusted = null, band = null, mod = { modifiers: [], total: 0 }, vote;
        if(bew){
          vote = bew;                                      // bewitched: auto-vote, no roll (RR p.358)
          band = { band:'bewitched', cascade:null };
        } else {
          mod = senatorVoteModifiers(campaign, senate, s, ctx, cascades, false);
          const d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6);
          adjusted = d1 + d2 + mod.total;
          roll = { d1, d2, natural: d1 + d2 };
          band = senateVotingBand(adjusted);
          vote = band.vote === 'trend' ? _resolveTrend(forVotes, againstVotes) : band.vote;
          // record the endorse/condemn cascade for later same-faction senators
          if(band.cascade && s.factionId){
            const fc = cascades[s.factionId] || (cascades[s.factionId] = { endorsements: 0, condemnations: 0 });
            if(band.cascade === 'endorse') fc.endorsements++; else fc.condemnations++;
          }
        }
        if(vote === 'for') forVotes += votes; else if(vote === 'against') againstVotes += votes; else abstainVotes += votes;
        rolls.push({ senatorshipId: s.id, senatorCharacterId: s.senatorCharacterId, factionId: s.factionId || null,
          votes, bewitched: !!bew, roll, modifiers: mod.modifiers, adjusted, band: band.band, vote });
        if(forVotes >= majorityThreshold || againstVotes >= majorityThreshold) break;
      }
      approved = forVotes >= majorityThreshold;
      outcome = approved ? 'approved' : (againstVotes >= majorityThreshold ? 'rejected' : 'no-majority');
    }
    if(outcome === undefined){                             // by-faction path sets outcome here
      approved = forVotes >= majorityThreshold;
      outcome = approved ? 'approved' : (againstVotes >= majorityThreshold ? 'rejected' : 'no-majority');
    }

    const result = {
      senateId: senate.id, matter: opts.matter || '', mode, autoRolled: ruleOn,
      rolls, forVotes, againstVotes, abstainVotes,
      controlledIndependentVotes: ctx.controlledIndependentVotes,
      totalVotes, majorityThreshold, outcome, approved
    };
    // Emit the already-applied record (unless the caller suppresses it for a pure preview).
    if(opts.emit !== false){
      const matterLabel = result.matter || 'a policy';
      _emitPoliticsEvent(campaign, 'senate-vote', {
        senateId: senate.id, matter: result.matter, mode, outcome, approved,
        forVotes, againstVotes, abstainVotes, totalVotes, majorityThreshold,
        rollCount: rolls.length,
        narrative: 'The ' + (senate.name || 'senate') + ' votes ' +
          (outcome === 'approved' ? 'FOR' : outcome === 'rejected' ? 'AGAINST' : 'with no majority on') +
          ' ' + matterLabel + ' (' + forVotes + ' for / ' + againstVotes + ' against of ' + totalVotes + ').'
      }, senate, ctx.rulerId, result.rolls);
    }
    return result;
  }

  // ── Benefits / restrictions (the derived reads; survey §4.1) ──
  // The structured senate-benefit view for a realm (RR p.355). active = senateBenefitsActive
  // (mode senatorial + senate not in dispute). The four benefit values are RAW; wiring them
  // into the monthly economy (the +1 morale row, the loyalty-0 base, the free first duty, the
  // free militia levy) is a later economy touch (deferred — out of this lane; the Senate tab
  // displays this, and it is the contract a future commitTurn wire reads).
  function senateBenefits(campaign, domain){
    const active = senateBenefitsActive(campaign, domain);
    const senate = senateForDomain(campaign, domain);
    return {
      active,
      inDispute: !!(senate && senate.dispute != null),
      isSenatorial: isSenatorialRealm(campaign, domain),
      benefits: {
        moraleBonus: active ? 1 : 0,                 // +1 base morale realm-wide (RR p.355)
        vassalBaseLoyalty: active ? 0 : -2,          // non-henchman vassal base loyalty 0 not −2 (RR p.355)
        freeFirstExtraDuty: active,                  // first extra duty/mo skips the Loyalty check if approved (F&D seam)
        freeMilitiaLevy: active                      // militia levy costs no realm morale if approved
      }
    };
  }

  // ── Disputes (RR p.359; survey §4.6) ──
  // Set the realm into dispute (a defied/unconsulted restricted matter): suspends ALL benefits
  // via the §5.1 guard until cleared. Idempotent-ish: a fresh defiance bumps `attempts`.
  function setSenateDispute(campaign, senateId, opts){
    opts = opts || {};
    const senate = findSenate(campaign, senateId);
    if(!senate) return null;
    const turn = (opts.turn != null) ? opts.turn : (campaign.currentTurn || 1);
    const prior = senate.dispute;
    senate.dispute = {
      defiedTopic: opts.topic || (prior && prior.defiedTopic) || 'unknown',
      sinceTurn: (prior && prior.sinceTurn != null) ? prior.sinceTurn : turn,
      attempts: ((prior && prior.attempts) || 0) + 1
    };
    senate.status = 'in-dispute';
    if(!Array.isArray(senate.history)) senate.history = [];
    senate.history.push({ turn, type: 'dispute', topic: senate.dispute.defiedTopic, attempts: senate.dispute.attempts });
    return senate;
  }
  // Clear the dispute (a successful retroactive-approval consult, or GM resolution). Restores
  // benefits (status → active). resolution ∈ 'approved' | 'gm-resolved' | 'abandoned'.
  function clearSenateDispute(campaign, senateId, opts){
    opts = opts || {};
    const senate = findSenate(campaign, senateId);
    if(!senate || senate.dispute == null) return senate || null;
    const turn = (opts.turn != null) ? opts.turn : (campaign.currentTurn || 1);
    senate.dispute = null;
    senate.status = 'active';
    if(!Array.isArray(senate.history)) senate.history = [];
    senate.history.push({ turn, type: 'dispute-cleared', resolution: opts.resolution || 'approved' });
    return senate;
  }

  // Enact a policy on a senatorial realm (the ruler's decision after consulting; survey §4.2/§4.6).
  // A restricted matter (isSenateConsultationRequired) enacted WITHOUT senate approval — not
  // consulted, or consulted-and-rejected then enacted anyway — puts the realm in DISPUTE. An
  // approved or unrestricted matter enacts cleanly; if the realm was in dispute and this enactment
  // carries a retroactive approval, the dispute clears. PURE state change + an already-applied
  // 'policy-enacted' record (the verb pattern). Returns { outcome, disputed, cleared, senate }.
  //   opts: { senateId | senate, matter, consulted:bool, approved:bool|null, retroactiveApproval:bool,
  //           rulerCharacterId, turn, emit:false }
  function enactPolicy(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    const matter = opts.matter || '';
    const restricted = isSenateConsultationRequired(matter);
    const approved = opts.approved === true;
    const consulted = opts.consulted === true;
    const turn = (opts.turn != null) ? opts.turn : (campaign.currentTurn || 1);
    let outcome = 'enacted', disputed = false, cleared = false;

    if(restricted && !(consulted && approved)){
      // Defied / skipped consultation on a restricted matter → dispute (RR p.359).
      setSenateDispute(campaign, senate.id, { topic: matter, turn });
      outcome = 'defied'; disputed = true;
    } else {
      // Clean enactment. A retroactive-approval enactment while in dispute clears it.
      if(senate.dispute != null && (opts.retroactiveApproval || (restricted && approved))){
        clearSenateDispute(campaign, senate.id, { turn, resolution: 'approved' });
        outcome = 'dispute-cleared'; cleared = true;
      }
    }
    if(opts.emit !== false){
      const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
      const rulerId = opts.rulerCharacterId || (apex && apex.rulerCharacterId) || null;
      const narrative = disputed
        ? 'The ruler defies the ' + (senate.name || 'senate') + ' on ' + (matter || 'a restricted matter') + ' — the realm is in dispute.'
        : cleared
          ? 'The ruler wins the ' + (senate.name || 'senate') + '’s retroactive approval — the dispute ends.'
          : 'The ruler enacts ' + (matter || 'a policy') + ' with the ' + (senate.name || 'senate') + '’s sanction.';
      _emitPoliticsEvent(campaign, 'policy-enacted', {
        senateId: senate.id, matter, restricted, consulted, approved,
        outcome, disputed, cleared, narrative
      }, senate, rulerId, []);
    }
    return { outcome, disputed, cleared, senate };
  }

  // ── The Favors & Duties Office → senate-seat hook (Phase_4_Politics_Plan.md §10; the deferred
  //    F&D-8 dependency, RR p.348 + p.355) ──
  // Granting an Office favor on a realm whose apex governance is SENATORIAL auto-seats the
  // officeholder (obligation.vassalRulerCharacterId) as a LEADING senator of the apex's senate.
  // Revoking the Office vacates that seat. Until the realm is senatorial, the Office favor behaves
  // as shipped (title + the RR p.348 +1 vassal-loyalty; the seat is a no-op). Idempotent both ways.
  // Called from acks-engine.js _applyFavorDutyEdict (grant) + revokeFavorDutyEdict (revoke), guarded.
  //   action ∈ 'grant' | 'revoke'. Returns the senatorship (grant) / the vacated record (revoke) / null.
  function syncOfficeSenateSeat(campaign, obligation, action){
    if(!campaign || !obligation || obligation.kind !== 'office') return null;
    const holderId = obligation.vassalRulerCharacterId;
    if(!holderId) return null;
    const turn = campaign.currentTurn || 1;
    if(!Array.isArray(campaign.senatorships)) campaign.senatorships = [];

    if(action === 'revoke'){
      // Vacate the office-seat this obligation created (tagged by sourceObligationId), regardless of
      // the realm's current governance mode — the office is being revoked, so clean up its seat.
      const seat = campaign.senatorships.find(s => s && _isActiveSenatorship(s)
        && s.senatorCharacterId === holderId && s.sourceObligationId === obligation.id);
      if(!seat) return null;
      seat.status = 'vacated';
      seat.vacatedAtTurn = turn;
      if(!Array.isArray(seat.history)) seat.history = [];
      seat.history.push({ turn, type: 'office-vacated', obligationId: obligation.id });
      return seat;
    }
    // grant — ONLY on a realm whose apex is SENATORIAL (mode senatorial; the presence of a senate
    // pointer alone isn't enough — a feudal realm may carry a dormant senate). RR p.348 + p.355.
    const vassalDomain = _findDomain(campaign, obligation.vassalDomainId);
    if(!vassalDomain || !isSenatorialRealm(campaign, vassalDomain)) return null;   // no-op (shipped behavior)
    const senate = senateForDomain(campaign, vassalDomain);
    if(!senate) return null;
    // idempotent: don't double-seat the same office.
    const existing = campaign.senatorships.find(s => s && _isActiveSenatorship(s)
      && s.senateId === senate.id && s.senatorCharacterId === holderId
      && s.sourceObligationId === obligation.id);
    if(existing) return existing;
    const holder = _findChar(campaign, holderId);
    const seat = blankSenatorship({
      senatorCharacterId: holderId, senateId: senate.id, rank: 'leading',
      votes: 0,                                            // the GM sets the office's influence (RR leaves it the Judge's)
      seatedAtTurn: turn,
      history: [{ turn, type: 'office-seated', obligationId: obligation.id, officeTitle: obligation.officeTitle || '' }]
    });
    seat.sourceObligationId = obligation.id;               // the F&D tag (so revoke finds exactly this seat)
    campaign.senatorships.push(seat);
    return seat;
  }

  // Emit an already-applied politics record (the favor-duty emit pattern, lifted into this module).
  // Carries the Event.context envelope (apex hex + ruler + the voting senators). Guarded so a
  // missing events module never breaks the pure computation above.
  function _emitPoliticsEvent(campaign, kind, payload, senate, rulerId, rolls){
    const A = _A();
    if(typeof A.newEvent !== 'function' || typeof A.setEventContext !== 'function') return null;
    let ev;
    try { ev = A.newEvent(kind, { submittedBy: 'engine', targetTurn: campaign.currentTurn || 1,
      cadence: 'monthly-turn', payload: payload }); }
    catch(e){ return null; }                               // kind not registered (events module absent)
    const apex = senate && senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const hexId = apex ? (((campaign.hexes || []).find(h => h && h.domainId === apex.id)) || {}).id || null : null;
    const related = [];
    if(rulerId) related.push({ kind:'character', id: rulerId, role:'subject' });
    if(apex) related.push({ kind:'domain', id: apex.id, role:'site' });
    (rolls || []).forEach(r => { if(r && r.senatorCharacterId) related.push({ kind:'character', id: r.senatorCharacterId, role:'witness' }); });
    A.setEventContext(ev, { primaryHexId: hexId, domainId: apex ? apex.id : null, relatedEntities: related });
    if(A.EVENT_STATUS) ev.status = A.EVENT_STATUS.APPLIED;
    ev.appliedAtTurn = campaign.currentTurn || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: payload.narrative || kind },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // P-3 — the influence-actions + dispute-lifecycle layer (burst8 2026-06-19).
  //       Spec: Phase_4_Politics_Plan.md §5.4–§5.5 + §3 (RR pp.358–359);
  //       Politics_RAW_Survey.md §4.5–§4.7. This POPULATES the standing
  //       senatorship.influenceModifiers[] stack that the P-2 voting machinery
  //       already READS (senatorVoteModifiers loops it) + converts part of the
  //       anonymous independent bloc + extends the dispute lifecycle (retroactive-
  //       approval escalation → 'replace-ruler', abandon-government penalties,
  //       re-establish after 2d6 months). NO new entity/prefix/factory field: the
  //       two new bits of senate state (the gift ledger + the re-establish cooldown)
  //       are init-on-write + read defensively, so blankSenate + the field-schema /
  //       registry / migrate-no-op invariants are untouched (the burst3 discipline).
  //   ⚠ Wave-label note: the plan's §14 labels influence-actions "P-4" + homes the
  //     gaining-influence-over-minors bullet under "P-3"; this burst8 lane is named
  //     "P-3" and ships BOTH (the plan's P-3 tail + P-4) plus the dispute-lifecycle
  //     extensions the P-2 ship deferred. The wave numbers drifted; the work is the
  //     same. RESOLVERS REUSED (per the lane brief): the shipped Layer-1 proficiency
  //     throw (rollProficiencyThrow) for the intimidate/seduce attempt, and the
  //     shipped 2d6 voting machinery (senateVote) for the retroactive-approval consult.
  //   Two record-only events (senate-influenced / senate-dispute-opened), the verb-
  //     applies-state + emits-the-applied-event pattern; the events.js handler is a
  //     record-only audit (the favor-duty / P-2 precedent).
  // ════════════════════════════════════════════════════════════════════════════

  // n d6 (the dispute cooldown / honeymoon duration rolls — not a proficiency throw
  // nor a vote, so no shipped resolver applies; a plain die, the reaction-roll idiom).
  function _rollNd6(n, rng){
    const r = (typeof rng === 'function') ? rng : Math.random;
    let sum = 0; for(let i = 0; i < (n || 0); i++) sum += 1 + Math.floor(r() * 6);
    return sum;
  }
  function _turnOf(campaign, opts){ return (opts && opts.turn != null) ? opts.turn : ((campaign && campaign.currentTurn) || 1); }
  // The senate a senatorship sits in.
  function _senateOfSenatorship(campaign, senatorship){
    return senatorship ? findSenate(campaign, senatorship.senateId) : null;
  }
  // Upsert a standing influence modifier: replace a prior entry of the same kind from
  // the same actor (so re-bribing the same senator UPDATES rather than stacking), else
  // push. Keeps the signed { kind, value } shape senatorVoteModifiers already reads.
  function _upsertInfluenceModifier(senatorship, mod){
    if(!Array.isArray(senatorship.influenceModifiers)) senatorship.influenceModifiers = [];
    const i = senatorship.influenceModifiers.findIndex(m => m && m.kind === mod.kind
      && (m.byCharacterId || null) === (mod.byCharacterId || null));
    if(i >= 0) senatorship.influenceModifiers[i] = mod; else senatorship.influenceModifiers.push(mod);
    return mod;
  }
  // Best-effort spend of an influence gp cost from the actor's coin purse (RR pp.83–84
  // multi-denom shape; coins.gp canonical, personalGp the synced mirror). Returns
  // { paid, gp }. When the purse is absent / insufficient the cost is recorded but no
  // coins move (paid:false) — the bribe's VOTING effect lands regardless; the GM settles
  // the gp. Emits the GP-Wave-B wealth-transfer audit child when the helper is present.
  function _spendInfluenceGp(campaign, byCharacterId, gp, opts){
    gp = Math.max(0, Number(gp) || 0);
    const A = _A();
    const actor = _findChar(campaign, byCharacterId);
    let paid = false;
    if(gp > 0 && actor){
      const have = (actor.coins && Number(actor.coins.gp)) || Number(actor.personalGp) || 0;
      if(have >= gp){
        if(actor.coins && typeof actor.coins === 'object') actor.coins.gp = have - gp;
        else actor.personalGp = have - gp;
        if(typeof A.reconcileCharacterCoins === 'function'){ try { A.reconcileCharacterCoins(actor); } catch(e){} }
        paid = true;
      }
    }
    if(gp > 0 && paid && typeof A.recordWealthTransfer === 'function'){
      try { A.recordWealthTransfer(campaign, {
        source: { kind:'character', id: byCharacterId || null },
        destination: { kind:'external', label: (opts && opts.label) || 'senate influence' },
        amount: gp, bucket: 'other', reason: (opts && opts.reason) || 'senate influence'
      }, { campaignLogHidden: true }); } catch(e){}
    }
    return { paid, gp };
  }

  // ── Bribery (RR p.358; survey §4.5) — gp → a standing voting modifier. Any character
  //    can bribe; the Bribery proficiency shifts the RATE (which income period buys which
  //    bonus). NO throw (RAW is a payment). A rival bribe is the negative mirror.
  //      proficient:    +1 = a day's bribe cost   · +2 = week  · +3 = month
  //      non-proficient:+1 = a week's bribe cost   · +2 = month · +3 = year
  //    opts: { senatorshipId, byCharacterId, value:1|2|3, byRival, turn, rng }
  const _BRIBE_PERIOD = Object.freeze({
    proficient:    { 1:'day',  2:'week',  3:'month' },
    nonproficient: { 1:'week', 2:'month', 3:'year'  }
  });
  function bribeSenator(campaign, opts){
    opts = opts || {};
    const senatorship = findSenatorship(campaign, opts.senatorshipId);
    if(!senatorship) return { ok:false, reason:'no-senatorship' };
    const value = Math.min(3, Math.max(1, Math.round(Number(opts.value) || 1)));
    const actor = _findChar(campaign, opts.byCharacterId);
    const A = _A();
    const proficient = !!(actor && typeof A.hasProficiency === 'function' && A.hasProficiency(actor, 'bribery'));
    const period = _BRIBE_PERIOD[proficient ? 'proficient' : 'nonproficient'][value];
    const costs = senatorship.bribeCostByPeriod || {};
    const gp = Math.max(0, Number(costs[period]) || 0);
    const byRival = !!opts.byRival;
    const signed = byRival ? -value : value;
    const kind = byRival ? 'rival-bribe' : 'bribe';
    const turn = _turnOf(campaign, opts);
    const spend = _spendInfluenceGp(campaign, opts.byCharacterId, gp, { reason: 'bribe', label: 'bribe of a senator' });
    const mod = _upsertInfluenceModifier(senatorship, {
      source: 'bribe', kind, value: signed, period, gp, byRival,
      sinceTurn: turn, byCharacterId: opts.byCharacterId || null, proficient
    });
    const senate = _senateOfSenatorship(campaign, senatorship);
    _emitPoliticsEvent(campaign, 'senate-influenced', {
      senateId: senate ? senate.id : null, action: byRival ? 'rival-bribe' : 'bribe',
      senatorshipId: senatorship.id, byCharacterId: opts.byCharacterId || null,
      value: signed, period, gp, paid: spend.paid,
      narrative: (byRival ? 'A rival bribes' : 'The ruler bribes') + ' a senator (' +
        (signed >= 0 ? '+' : '') + signed + ' to his vote, ' + gp + 'gp / ' + period + ').'
    }, senate, opts.byCharacterId, []);
    return { ok:true, value: signed, period, gp, paid: spend.paid, proficient, modifier: mod };
  }

  // ── Intimidation (RR p.358) + Seduction (RR p.359) — gated social maneuvers resolved
  //    via the SHIPPED Layer-1 proficiency throw (the lane brief). RAW gives the +1 vote
  //    modifier as the effect of a SUCCESSFUL maneuver; the general proficiency mechanic
  //    (RR p.102, target 11+, + the governing CHA modifier — Intimidation/Seduction are
  //    CHA proficiencies, RR p.112/p.117) supplies the success throw. The GM may pass
  //    autoSucceed:true for the pure-RAW "conditions met → +1" reading (the throw is
  //    available, not imposed). Gates (RAW): intimidate needs the prof + a credible threat
  //    + grossly out-ranking/out-numbering; seduce needs the prof + an attracted senator.
  //    opts: { senatorshipId, byCharacterId, outranks, credibleThreat, attracted,
  //            autoSucceed, extraModifiers:[{label,value}], turn, rng }
  function _socialInfluence(campaign, opts, method){
    opts = opts || {};
    const senatorship = findSenatorship(campaign, opts.senatorshipId);
    if(!senatorship) return { ok:false, reason:'no-senatorship' };
    const actor = _findChar(campaign, opts.byCharacterId);
    const A = _A();
    const profKey = method === 'intimidate' ? 'intimidation' : 'seduction';
    const proficient = !!(actor && typeof A.hasProficiency === 'function' && A.hasProficiency(actor, profKey));
    if(!proficient) return { ok:false, reason:'lacks-' + profKey };
    if(method === 'intimidate'){
      if(!opts.outranks) return { ok:false, reason:'requires-outrank' };       // grossly out-ranks/out-numbers
      if(opts.credibleThreat === false) return { ok:false, reason:'requires-threat' };
    } else if(!opts.attracted){
      return { ok:false, reason:'requires-attraction' };
    }
    const turn = _turnOf(campaign, opts);
    let throwResult = null, success;
    if(opts.autoSucceed){
      success = true;                                                          // pure-RAW conditional reading
    } else {
      const chaMod = _abilityMod(actor);
      const modifiers = [{ label:'CHA', value: chaMod }]
        .concat(Array.isArray(opts.extraModifiers) ? opts.extraModifiers.filter(m => m && typeof m.value === 'number') : []);
      throwResult = (typeof A.rollProficiencyThrow === 'function')
        ? A.rollProficiencyThrow({ target: 11, modifiers, proficient: true, rng: opts.rng })  // RR p.102 default bar
        : { success: true, total: null, target: 11, modifiers, natural: null };               // defensive (proficiencies module absent)
      success = !!throwResult.success;
    }
    const kind = method === 'intimidate' ? 'intimidated' : 'seduced';
    let mod = null;
    if(success){
      mod = _upsertInfluenceModifier(senatorship, {
        source: method, kind, value: 1, sinceTurn: turn, byCharacterId: opts.byCharacterId || null
      });
    }
    const senate = _senateOfSenatorship(campaign, senatorship);
    _emitPoliticsEvent(campaign, 'senate-influenced', {
      senateId: senate ? senate.id : null, action: method,
      senatorshipId: senatorship.id, byCharacterId: opts.byCharacterId || null,
      success, value: success ? 1 : 0,
      natural: throwResult ? throwResult.natural : null, total: throwResult ? throwResult.total : null,
      narrative: (method === 'intimidate' ? 'The ruler intimidates' : 'The ruler seduces') + ' a senator — ' +
        (success ? 'it lands (+1 to his vote).' : 'the attempt fails.')
    }, senate, opts.byCharacterId, []);
    return { ok:true, success, throw: throwResult, modifier: mod };
  }
  function intimidateSenator(campaign, opts){ return _socialInfluence(campaign, opts, 'intimidate'); }
  function seduceSenator(campaign, opts){ return _socialInfluence(campaign, opts, 'seduce'); }

  // ── The −5 turn (RR p.358–359) — a once-intimidated senator who escapes the ruler's
  //    dominance, or a once-seduced senator later ill-treated, now penalizes the ruler's
  //    vote by −5 ("previously, no-longer … by the ruler"). Flips the standing +1 modifier
  //    in place (intimidated → intimidated-escaped −5 / seduced → seduced-ill-treated −5);
  //    if none was tracked, the −5 is created (the GM asserts the prior dominance).
  //    opts: { senatorshipId, kind:'intimidated'|'seduced', byCharacterId, turn }
  function flipSocialInfluence(campaign, opts){
    opts = opts || {};
    const senatorship = findSenatorship(campaign, opts.senatorshipId);
    if(!senatorship) return { ok:false, reason:'no-senatorship' };
    const baseKind = opts.kind === 'seduced' ? 'seduced' : 'intimidated';
    const flippedKind = baseKind === 'intimidated' ? 'intimidated-escaped' : 'seduced-ill-treated';
    const turn = _turnOf(campaign, opts);
    if(!Array.isArray(senatorship.influenceModifiers)) senatorship.influenceModifiers = [];
    const i = senatorship.influenceModifiers.findIndex(m => m && m.kind === baseKind
      && (opts.byCharacterId ? (m.byCharacterId || null) === opts.byCharacterId : true));
    const mod = { source: flippedKind, kind: flippedKind, value: -5, sinceTurn: turn, byCharacterId: opts.byCharacterId || null };
    if(i >= 0) senatorship.influenceModifiers[i] = mod; else senatorship.influenceModifiers.push(mod);
    const senate = _senateOfSenatorship(campaign, senatorship);
    _emitPoliticsEvent(campaign, 'senate-influenced', {
      senateId: senate ? senate.id : null, action: baseKind === 'intimidated' ? 'escaped' : 'ill-treated',
      senatorshipId: senatorship.id, byCharacterId: opts.byCharacterId || null, value: -5,
      narrative: 'A senator once ' + baseKind + ' by the ruler now turns against him (−5 to his vote, RR p.358).'
    }, senate, opts.byCharacterId, []);
    return { ok:true, modifier: mod };
  }

  // ── Reveal-on-an-unmodified-2 (RR p.358–359) — a senator whose vote rolls a NATURAL 2
  //    while carrying secret bribe/intimidate/seduce/bewitch influence reveals it: his
  //    influence becomes public (isSecretInfluence → false) AND the ruler is implicated
  //    (character.implicatedInBribery → true), which drops the "Lawful & untainted" +1 on
  //    the ruler's FUTURE votes (the UI passes rulerCleanRecord:!implicated). Run AFTER a
  //    vote; leaves the shipped senateVote untouched. Returns the revealed senatorship ids.
  //    opts: { rulerCharacterId, turn }
  function applyInfluenceReveals(campaign, voteResult, opts){
    opts = opts || {};
    if(!voteResult || !Array.isArray(voteResult.rolls)) return { revealed: [] };
    const senate = findSenate(campaign, voteResult.senateId);
    const revealed = [];
    for(const row of voteResult.rolls){
      if(!row || !row.senatorshipId) continue;
      if(!(row.roll && row.roll.natural === 2)) continue;                       // unmodified 2 only
      const s = findSenatorship(campaign, row.senatorshipId);
      if(!s) continue;
      const im = Array.isArray(s.influenceModifiers) ? s.influenceModifiers : [];
      const hasSecret = im.some(m => m && ['bribe','rival-bribe','intimidated','seduced','bewitched'].indexOf(m.kind) >= 0);
      if(!hasSecret) continue;
      s.isSecretInfluence = false;
      revealed.push(s.id);
    }
    if(revealed.length){
      const rulerId = opts.rulerCharacterId || (senate && senate.realmDomainId
        && (((campaign.domains || []).find(d => d && d.id === senate.realmDomainId)) || {}).rulerCharacterId) || null;
      const ruler = _findChar(campaign, rulerId);
      if(ruler) ruler.implicatedInBribery = true;
      _emitPoliticsEvent(campaign, 'senate-influenced', {
        senateId: voteResult.senateId, action: 'revealed', byCharacterId: rulerId,
        revealedCount: revealed.length,
        narrative: revealed.length + ' bribed/intimidated/seduced senator(s) reveal the ruler’s hand on a natural 2 — he is now implicated.'
      }, senate, rulerId, []);
    }
    return { revealed };
  }

  // ── Gifts → directing independent minor senators (RR p.359 §4.7) — converts part of the
  //    anonymous independent-vote bloc to the ruler's control. A gift QUALIFIES to direct a
  //    senator's votes when its reaction bonus is +3 (a high-value gift) OR +1 AND the
  //    senator is Friendly. Competing gift-givers: the larger gift wins (tie → better
  //    reactions → tie → no effect). The ledger is init-on-write senate.independentGifts[]
  //    (defensive-read; NOT on blankSenate). controlledIndependentVotesFor() reads it and
  //    feeds senateVote's controlledIndependentVotes (the FOR-side seed).
  //    opts: { senateId, byCharacterId, votes, reactionBonus, friendly, gp, turn, rng }
  function giftIndependentSenators(campaign, opts){
    opts = opts || {};
    const senate = findSenate(campaign, opts.senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const pool = Math.max(0, Number(senate.independentMinorSenatorVotes) || 0);
    const requested = Math.max(0, Math.min(pool, Math.round(Number(opts.votes) || 0)));
    const reactionBonus = Number(opts.reactionBonus) || 0;
    const friendly = !!opts.friendly;
    const qualifies = reactionBonus >= 3 || (reactionBonus >= 1 && friendly);
    const gp = Math.max(0, Number(opts.gp) || 0);
    const turn = _turnOf(campaign, opts);
    if(!Array.isArray(senate.independentGifts)) senate.independentGifts = [];    // init-on-write
    // one gift per giver per month — replace a prior same-actor gift this turn
    const i = senate.independentGifts.findIndex(g => g && g.byCharacterId === (opts.byCharacterId || null) && g.sinceTurn === turn);
    const entry = { byCharacterId: opts.byCharacterId || null, votes: requested, reactionBonus, friendly, gp, qualifies, sinceTurn: turn };
    if(i >= 0) senate.independentGifts[i] = entry; else senate.independentGifts.push(entry);
    const spend = _spendInfluenceGp(campaign, opts.byCharacterId, gp, { reason: 'gift', label: 'gifts to independent senators' });
    const controlled = controlledIndependentVotesFor(campaign, senate, opts.byCharacterId, turn);
    _emitPoliticsEvent(campaign, 'senate-influenced', {
      senateId: senate.id, action: 'gift', byCharacterId: opts.byCharacterId || null,
      votes: requested, reactionBonus, gp, paid: spend.paid, qualifies, controlled,
      narrative: 'The ruler gifts independent senators (' + gp + 'gp, +' + reactionBonus + ' reaction) — ' +
        (qualifies ? 'directing ' + controlled + ' independent vote(s).' : 'not enough to direct their votes.')
    }, senate, opts.byCharacterId, []);
    return { ok:true, qualifies, controlled, gp, paid: spend.paid };
  }
  // How many independent votes the given ruler directs this month (RR p.359 §4.7). The
  // qualifying gifts this turn; competing givers resolved by gp (tie → reactionBonus →
  // tie → no winner). Capped at the independent pool.
  function controlledIndependentVotesFor(campaign, senate, rulerId, turn){
    if(!senate || !rulerId) return 0;
    const pool = Math.max(0, Number(senate.independentMinorSenatorVotes) || 0);
    if(pool <= 0) return 0;
    const t = (turn != null) ? turn : ((campaign && campaign.currentTurn) || 1);
    const gifts = (Array.isArray(senate.independentGifts) ? senate.independentGifts : [])
      .filter(g => g && g.qualifies && g.sinceTurn === t);
    if(gifts.length === 0) return 0;
    // sum per giver
    const byGiver = {};
    for(const g of gifts){
      const k = g.byCharacterId || '?';
      const acc = byGiver[k] || (byGiver[k] = { id: g.byCharacterId, votes: 0, gp: 0, reactionBonus: 0 });
      acc.votes += Number(g.votes) || 0; acc.gp += Number(g.gp) || 0; acc.reactionBonus = Math.max(acc.reactionBonus, Number(g.reactionBonus) || 0);
    }
    const givers = Object.values(byGiver);
    // pick the winning giver (largest gp; tie → reactionBonus; tie → no winner)
    let winner = null, tied = false;
    for(const g of givers){
      if(!winner){ winner = g; continue; }
      if(g.gp > winner.gp){ winner = g; tied = false; }
      else if(g.gp === winner.gp){
        if(g.reactionBonus > winner.reactionBonus){ winner = g; tied = false; }
        else if(g.reactionBonus === winner.reactionBonus){ tied = true; }
      }
    }
    if(!winner || (tied && givers.length > 1)) return 0;
    if(winner.id !== rulerId) return 0;
    return Math.max(0, Math.min(pool, winner.votes));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Dispute lifecycle — the extensions P-2 deferred (RR p.359; survey §4.6). P-2
  // shipped setSenateDispute/clearSenateDispute/enactPolicy (open + optimistic clear);
  // P-3 adds the retroactive-approval CONSULT (which clears OR escalates), the abandon-
  // government penalties, and the 2d6-month re-establish. The retroactive consult REUSES
  // the shipped senateVote (the 2d6 voting machinery) — never reinvented.
  // ════════════════════════════════════════════════════════════════════════════

  // Resolve an open dispute by a retroactive-approval consult (RR p.359). Runs a per-senator
  // senateVote on the defied topic; a majority FOR clears the dispute; a majority against (or
  // no majority) ESCALATES — bumps attempts AND stamps 'replace-ruler' onto every against-
  // voter's objectives (so each attempt is harder: a 'preserve-ruler' policy then hinders
  // their objective −2). Returns { outcome:'cleared'|'escalated'|'no-dispute', vote, ... }.
  //   opts: passes through the senateVote inputs (rulerCharacterId, domainMorale,
  //         rulerFactionId, policyHelps[], policyHinders[], militaryLoyalty,
  //         controlledIndependentVotes, rng) + turn.
  function resolveDisputeByConsult(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    if(senate.dispute == null) return { outcome:'no-dispute', senate };
    const turn = _turnOf(campaign, opts);
    const topic = senate.dispute.defiedTopic || 'a restricted matter';
    const vote = senateVote(campaign, Object.assign({}, opts, {
      senate, senateId: senate.id, matter: 'retroactive approval of ' + topic,
      mode: 'per-senator', emit: true
    }));
    if(vote && vote.approved){
      clearSenateDispute(campaign, senate.id, { turn, resolution: 'approved' });
      _emitPoliticsEvent(campaign, 'senate-dispute-opened', {
        senateId: senate.id, action: 'cleared', topic,
        forVotes: vote.forVotes, againstVotes: vote.againstVotes,
        narrative: 'The senate grants retroactive approval on ' + topic + ' — the dispute ends.'
      }, senate, opts.rulerCharacterId, vote.rolls);
      return { outcome: 'cleared', vote, senate };
    }
    // escalate: bump attempts + stamp 'replace-ruler' on the against-voters
    senate.dispute.attempts = (senate.dispute.attempts || 1) + 1;
    if(!Array.isArray(senate.history)) senate.history = [];
    senate.history.push({ turn, type: 'dispute-escalated', topic, attempts: senate.dispute.attempts });
    const newlyHostile = [];
    for(const row of (vote && vote.rolls) || []){
      if(!row || row.vote !== 'against' || !row.senatorshipId) continue;
      const s = findSenatorship(campaign, row.senatorshipId);
      if(!s) continue;
      if(!Array.isArray(s.policyObjectives)) s.policyObjectives = [];
      if(s.policyObjectives.indexOf('replace-ruler') < 0){ s.policyObjectives.push('replace-ruler'); newlyHostile.push(s.id); }
    }
    _emitPoliticsEvent(campaign, 'senate-dispute-opened', {
      senateId: senate.id, action: 'escalated', topic, attempts: senate.dispute.attempts,
      replaceRulerCount: newlyHostile.length,
      forVotes: vote ? vote.forVotes : 0, againstVotes: vote ? vote.againstVotes : 0,
      narrative: 'The retroactive-approval consult fails on ' + topic + ' — the dispute deepens, and ' +
        newlyHostile.length + ' senator(s) now seek to replace the ruler.'
    }, senate, opts.rulerCharacterId, (vote && vote.rolls) || []);
    return { outcome: 'escalated', vote, replaceRulerSenatorships: newlyHostile, senate };
  }

  // Abandon senatorial government (RR p.359) — dissolve / permanently ignore the senate. The
  // RAW penalties are SURFACED as a structured result (NOT auto-applied — no commitTurn hook;
  // the GM applies the morale/loyalty rolls via the shipped machinery, the F&D-penalty pattern):
  // permanent benefit loss; the personal domain's next morale roll at −2; henchman-senators +
  // non-henchman vassals roll Loyalty at −2; any influential senator carrying 'replace-ruler'
  // turns Hostile (attitude → 2). Sets a 2d6-month re-establish cooldown. Returns the penalties.
  //   opts: { senateId | senate, rulerCharacterId, turn, rng }
  function abandonSenatorialGovernment(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    const turn = _turnOf(campaign, opts);
    const cooldownMonths = _rollNd6(2, opts.rng);                               // re-establish after 2d6 months (RR p.359)
    senate.status = 'dissolved';
    senate.dispute = null;
    senate.dissolvedAtTurn = turn;                                             // init-on-write (defensive-read)
    senate.reestablishCooldownUntilTurn = turn + cooldownMonths;
    if(!Array.isArray(senate.history)) senate.history = [];
    senate.history.push({ turn, type: 'abandoned', cooldownMonths });
    // any influential senator with 'replace-ruler' turns Hostile (attitude → 2)
    const hostile = [];
    for(const s of senatorshipsForSenate(campaign, senate.id)){
      const influential = s.rank !== 'minor' && (Number(s.votes) || 0) > 0;
      if(influential && Array.isArray(s.policyObjectives) && s.policyObjectives.indexOf('replace-ruler') >= 0){
        s.attitudeTowardRuler = 2;                                             // Hostile (2–12 scale)
        hostile.push({ senatorshipId: s.id, senatorCharacterId: s.senatorCharacterId });
      }
    }
    const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const rulerId = opts.rulerCharacterId || (apex && apex.rulerCharacterId) || null;
    const henchmanSenators = senatorshipsForSenate(campaign, senate.id)
      .filter(s => _senatorIsRulerHenchman(campaign, s, rulerId))
      .map(s => s.senatorCharacterId);
    const penalties = {
      personalDomainMoraleNextAt: -2,
      henchmanSenatorLoyaltyAt: -2, henchmanSenators,
      vassalLoyaltyAt: -2,                                                     // atop the base −2 (net often −4)
      hostileSenators: hostile,
      reestablishCooldownUntilTurn: senate.reestablishCooldownUntilTurn, cooldownMonths
    };
    _emitPoliticsEvent(campaign, 'senate-dispute-opened', {
      senateId: senate.id, action: 'abandoned', apexDomainId: apex ? apex.id : null,
      hostileCount: hostile.length, cooldownMonths, reestablishAtTurn: senate.reestablishCooldownUntilTurn,
      narrative: 'The ruler abandons senatorial government — benefits are lost, ' + hostile.length +
        ' influential senator(s) turn Hostile, and a senate cannot be re-established for ' + cooldownMonths + ' months.'
    }, senate, rulerId, hostile.map(h => ({ senatorCharacterId: h.senatorCharacterId })));
    return { outcome: 'abandoned', senate, penalties };
  }

  // Can a survivor re-establish a senate yet? (RR p.359 — after the 2d6-month cooldown.)
  function canReestablishSenate(campaign, senate, turn){
    if(!senate || senate.status !== 'dissolved') return false;
    const t = (turn != null) ? turn : ((campaign && campaign.currentTurn) || 1);
    return senate.reestablishCooldownUntilTurn == null || t >= senate.reestablishCooldownUntilTurn;
  }
  // Re-establish a dissolved senate after the cooldown (RR p.359). A survivor restores it to
  // active, clears the dispute, and starts a fresh 1d6-month honeymoon (RR p.357 — all senators
  // vote for the ruler's policies). Gated on canReestablishSenate. Returns the senate or
  // { ok:false, reason:'cooldown', readyAtTurn }. (The deeper re-generation — promote new leaders,
  // re-roll objectives — is the Senate Wizard's, P-5; this re-opens the existing body.)
  function reestablishSenate(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const turn = _turnOf(campaign, opts);
    if(senate.status !== 'dissolved') return { ok:false, reason:'not-dissolved', senate };
    if(!canReestablishSenate(campaign, senate, turn)) return { ok:false, reason:'cooldown', readyAtTurn: senate.reestablishCooldownUntilTurn };
    senate.status = 'active';
    senate.dispute = null;
    senate.establishedAtTurn = turn;
    senate.honeymoonUntilTurn = turn + _rollNd6(1, opts.rng);                  // RR p.357 honeymoon
    senate.reestablishCooldownUntilTurn = null;
    if(!Array.isArray(senate.history)) senate.history = [];
    senate.history.push({ turn, type: 'reestablished' });
    const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    _emitPoliticsEvent(campaign, 'senate-dispute-opened', {
      senateId: senate.id, action: 'reestablished', honeymoonUntilTurn: senate.honeymoonUntilTurn,
      narrative: 'A survivor re-establishes the senate — a fresh honeymoon runs until turn ' + senate.honeymoonUntilTurn + '.'
    }, senate, apex ? apex.rulerCharacterId : null, []);
    return { ok:true, senate };
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    POLICY_OBJECTIVES, SENATE_RESTRICTED_MATTERS,
    // factories
    blankSenate, blankFaction, blankSenatorship,
    // lookups
    findSenate, findFaction, findSenatorship,
    senatesForRealm, senateForRealm, senateForDomain,
    factionsForSenate, senatorshipsForSenate, senatorshipsInFaction, senatorshipsForCharacter,
    // governance
    DEFAULT_GOVERNANCE, governanceFor, setDomainGovernance, realmApexDomain, isSenatorialRealm,
    // derived (§4.4)
    factionTotalInfluence, senateTotalVotes, senateRulingFactionId, senateLeadingFactionId,
    factionStanding, senateBenefitsActive, oligarchyDerivedStats,
    // P-2 — voting + benefits/restrictions + disputes + the F&D Office→seat hook (burst5)
    senateVotingBand, senatorVoteModifiers, senateVote,
    isSenateConsultationRequired, senateBenefits,
    setSenateDispute, clearSenateDispute, enactPolicy,
    syncOfficeSenateSeat,
    // P-3 — influence actions + the dispute-lifecycle extensions (burst8)
    bribeSenator, intimidateSenator, seduceSenator, flipSocialInfluence, applyInfluenceReveals,
    giftIndependentSenators, controlledIndependentVotesFor,
    resolveDisputeByConsult, abandonSenatorialGovernment, canReestablishSenate, reestablishSenate
  });

})(typeof window !== 'undefined' ? window : global);
