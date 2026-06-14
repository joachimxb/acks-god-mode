/* ACKS God Mode — acks-engine-politics.js
 * Politics & Power — P-1 (the senate / faction / senatorship data layer). Wave D (Architecture §3.5).
 *
 * Spec: Phase_4_Politics_Plan.md §4 (data model) + §14 P-1; Politics_RAW_Survey.md §4 + §7.
 * Sources: RR pp.355–360 (the senate core); JJ pp.402–407 (oligarchies + land/lordship — read-only here).
 *
 * P-1 ships the data layer + derived reads ONLY:
 *   - blankSenate (sen-) / blankFaction (fac-) / blankSenatorship (snr-) factories,
 *   - lookups + the Domain.governance sub-tree (feudal/senatorial; defensive-read + a setter),
 *   - the derived accessors (§4.4): faction totalInfluence + standing, senate ruling/leading faction,
 *     senateBenefitsActive, the oligarchy reads.
 * It does NOT build (later P-waves): the benefits/restrictions WIRING + the dispute gates (P-2),
 * senate-consult / the 2d6 voting math (P-3), influence actions (P-4), the Senate tab + Wizard (P-5),
 * the F&D Office→senate-seat hook (P-6). NO house rule is registered — the senate is RAW core, no
 * master toggle (CLAUDE §6; the plan's §8 / survey §11 polarity, resolved Joachim 2026-06-13).
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

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    POLICY_OBJECTIVES,
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
    factionStanding, senateBenefitsActive, oligarchyDerivedStats
  });

})(typeof window !== 'undefined' ? window : global);
