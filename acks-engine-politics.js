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
      // Phase 5 (2026-06-24) — the NAMED independent minor senators (Character refs, one vote each).
      // independentMinorSenatorVotes (above) stays the canonical vote count; this is its named backing
      // list, kept in sync by _reconcileSenateIndependents (rule #10) once the senate is "populated".
      // Absent / shorter than the count ⇒ the unnamed remainder is anonymous (legacy / not yet populated).
      independentSenatorCharacterIds: Array.isArray(opts.independentSenatorCharacterIds) ? opts.independentSenatorCharacterIds.slice() : [],
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
      // Phase 5 (2026-06-24) — the NAMED clients (Character refs) who vote with this leading senator
      // (RR's patron/client model). Once populated, votes = 1 (the patron) + clientCharacterIds.length,
      // kept in sync by _reconcileLeadingVotes (rule #10). Absent / shorter than votes-1 ⇒ the bloc has
      // an unnamed remainder (legacy / hand-authored / not yet populated). Only 'leading' seats bear clients.
      clientCharacterIds: Array.isArray(opts.clientCharacterIds) ? opts.clientCharacterIds.slice() : [],
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
    // Personal Authority (P-7; RR p.350 + JJ p.402): the oligarchy's average class level cross-
    // referenced with its average domain income (the apex realm's income ÷ oligarch count). READ the
    // shipped economy accessors — never write economy.js (the Separating-Land/income split is a
    // DEFERRED later slice, survey §6). Defensive: a bare fixture with no economy reads 0 income.
    const A = _A();
    let avgIncome = 0;
    if(typeof A.domainIncome === 'function' && apex){
      try { avgIncome = Math.round((Number(A.domainIncome(campaign, apex)) || 0) / n); } catch(e){ avgIncome = 0; }
    }
    const personalAuthority = (typeof A.computePersonalAuthority === 'function')
      ? A.computePersonalAuthority(levelSum / n, avgIncome) : null;
    return {
      memberCount: n,
      cha: Math.round(chaSum / n),                 // average CHA modifier (+Leadership)
      level: Math.round(levelSum / n),             // average class level
      alignment,
      avgIncome,                                   // the realm's domain income ÷ oligarch count (JJ p.402)
      personalAuthority                            // avg level × avg income (RR p.350; null if the economy module is absent)
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

  // ════════════════════════════════════════════════════════════════════════════
  // P-5 — the Senate MOTION layer (the guided Senate Wizard's engine; burst9 2026-06-20).
  //       Spec: Phase_4_Politics_Plan.md §5.2–§5.4 + §7 + §14 P-5; the lane brief.
  //       A MOTION is the discrete deliberative item a GM authors + resolves end-to-end:
  //       open (a policy stance / an edict / a dispute) → gather votes (REUSE senateVote) →
  //       tally → enact / reject → record + apply. It is a thin ORCHESTRATOR over the
  //       SHIPPED P-2/P-3 verbs (senateVote · applyInfluenceReveals · enactPolicy ·
  //       clearSenateDispute) — NOTHING here re-rolls or re-implements the 2d6 stack.
  //       A motion is a SUB-RECORD on senate.motions[] (init-on-write, read defensively,
  //       NOT on blankSenate — the P-3 senate.independentGifts[] discipline), so the
  //       field-schema / registry / migrate-no-op invariants stay untouched and there is
  //       NO new entity / prefix / collection / house rule. Two record-only events
  //       (senate-motion-opened / senate-motion-resolved): the verb applies state + emits
  //       the already-applied event; the events.js handler is a record-only audit (the
  //       favor-duty / P-2 / P-3 precedent).
  //   ⚠ Wave-label note: this is the plan's "P-5 (UI + the Senate Wizard)". The plan's
  //     §5.2 frames the Senate Wizard as the GENERATIVE wizard (materialize a senate's 7
  //     RAW steps); the lane brief re-scopes P-5 to the MOTION (Action) wizard — the guided
  //     author-and-resolve-a-vote flow the Senate tab still lacked. Generation stays the
  //     free-form Inspector ▸ Create path + a later wave. The standalone senateVote /
  //     enactPolicy panels (P-2) + the dispute / influence actions (P-3) are UNTOUCHED — the
  //     motion is the higher-level flow that composes them.
  // ════════════════════════════════════════════════════════════════════════════

  const SENATE_MOTION_KINDS = Object.freeze(['policy', 'edict', 'dispute']);

  function _senateMotions(senate){ return (senate && Array.isArray(senate.motions)) ? senate.motions : []; }

  // A motion sub-record (NOT a campaign entity — no prefix / field-schema / registry; the
  // senate.history-entry shape). The id is senate-scoped + prefix-free (openSenateMotion mints
  // `senate.id + '-m' + seq`); a caller may pass opts.id for a deterministic test.
  function blankSenateMotion(opts = {}){
    return {
      id: opts.id || null,
      senateId: opts.senateId || null,
      kind: SENATE_MOTION_KINDS.indexOf(opts.kind) >= 0 ? opts.kind : 'edict',
      matter: opts.matter || '',                          // restricted-matter key | free text | '' (a pure policy stance)
      policyObjective: opts.policyObjective || '',        // a POLICY_OBJECTIVES key (kind 'policy'); '' otherwise
      title: opts.title || '',
      description: opts.description || '',
      restricted: !!opts.restricted,                      // derived (isSenateConsultationRequired); stamped at open
      mode: opts.mode === 'by-faction' ? 'by-faction' : 'per-senator',
      policyHelps: Array.isArray(opts.policyHelps) ? opts.policyHelps.slice() : [],
      policyHinders: Array.isArray(opts.policyHinders) ? opts.policyHinders.slice() : [],
      rulerFactionId: opts.rulerFactionId || null,
      militaryLoyalty: opts.militaryLoyalty || 'none',
      domainMorale: Number(opts.domainMorale) || 0,
      controlledIndependentVotes: Math.max(0, Number(opts.controlledIndependentVotes) || 0),
      openedAtTurn: (opts.openedAtTurn != null) ? opts.openedAtTurn : null,
      status: opts.status || 'open',                      // open | enacted | rejected | defied | dispute-cleared | dispute-escalated | withdrawn
      outcome: opts.outcome || null,                      // approved | rejected | no-majority | null
      voteResult: opts.voteResult || null,                // the recorded senateVote tally (rolls + counts)
      enactDespiteRejection: !!opts.enactDespiteRejection,
      revealedSenatorshipIds: Array.isArray(opts.revealedSenatorshipIds) ? opts.revealedSenatorshipIds.slice() : [],
      resolvedAtTurn: (opts.resolvedAtTurn != null) ? opts.resolvedAtTurn : null,
      history: Array.isArray(opts.history) ? opts.history : []
    };
  }

  // ── Lookups ──
  function senateMotionsForSenate(campaign, senateId, opts){
    opts = opts || {};
    let rows = _senateMotions(findSenate(campaign, senateId)).slice();
    if(opts.openOnly) rows = rows.filter(m => m && m.status === 'open');
    return rows;
  }
  function findSenateMotion(campaign, senateId, motionId){
    if(!motionId) return null;
    return _senateMotions(findSenate(campaign, senateId)).find(m => m && m.id === motionId) || null;
  }

  // A human label for a motion's subject (the narrative + the UI).
  function _motionMatterLabel(motion){
    if(!motion) return 'a matter';
    if(motion.kind === 'dispute') return 'a retroactive approval';
    if(motion.policyObjective) return 'the policy “' + motion.policyObjective + '”';
    return motion.matter || motion.title || 'a matter';
  }

  // Open a motion (table it). Mints the sub-record on senate.motions[] (init-on-write), stamps
  // the derived `restricted`, emits 'senate-motion-opened'. Returns the motion (or null).
  //   opts: { senateId|senate, kind, matter, policyObjective, title, description, mode,
  //           policyHelps[], policyHinders[], rulerFactionId, militaryLoyalty, domainMorale,
  //           controlledIndependentVotes, rulerCharacterId, turn, emit:false }
  function openSenateMotion(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    if(!Array.isArray(senate.motions)) senate.motions = [];            // init-on-write (NOT on blankSenate)
    const seq = (senate._motionSeq = (Number(senate._motionSeq) || 0) + 1);
    const turn = _turnOf(campaign, opts);
    const matter = opts.matter || '';
    const motion = blankSenateMotion(Object.assign({}, opts, {
      id: senate.id + '-m' + seq, senateId: senate.id,
      restricted: isSenateConsultationRequired(matter),
      openedAtTurn: turn, status: 'open'
    }));
    motion.history.push({ turn, type: 'opened' });
    senate.motions.push(motion);
    if(opts.emit !== false){
      _emitPoliticsEvent(campaign, 'senate-motion-opened', {
        senateId: senate.id, motionId: motion.id, kind: motion.kind,
        matter: motion.matter, policyObjective: motion.policyObjective, restricted: motion.restricted,
        title: motion.title,
        narrative: 'A motion is brought before the ' + (senate.name || 'senate') + ': ' +
          (motion.title || _motionMatterLabel(motion)) + '.'
      }, senate, opts.rulerCharacterId, []);
    }
    return motion;
  }

  // The vote inputs a motion feeds to senateVote (shared by preview + resolve; opts override the
  // motion's stored inputs). A 'dispute' motion votes on the senate's defied topic (retroactive approval).
  function _motionVoteOpts(campaign, senate, motion, opts){
    opts = opts || {};
    return {
      senate, senateId: senate.id,
      matter: motion.kind === 'dispute'
        ? ('retroactive approval of ' + ((senate.dispute && senate.dispute.defiedTopic) || motion.matter || 'a restricted matter'))
        : (motion.matter || motion.policyObjective || ''),
      mode: opts.mode || motion.mode || 'per-senator',
      rulerCharacterId: opts.rulerCharacterId,
      domainMorale: (opts.domainMorale != null) ? opts.domainMorale : motion.domainMorale,
      rulerFactionId: (opts.rulerFactionId !== undefined) ? opts.rulerFactionId : motion.rulerFactionId,
      militaryLoyalty: opts.militaryLoyalty || motion.militaryLoyalty,
      controlledIndependentVotes: (opts.controlledIndependentVotes != null) ? opts.controlledIndependentVotes : motion.controlledIndependentVotes,
      policyHelps: (opts.policyHelps || motion.policyHelps || []).slice(),
      policyHinders: (opts.policyHinders || motion.policyHinders || []).slice()
    };
  }

  // A PURE preview vote on a motion (or a passed transient motion spec) — the wizard's roll / ⟳
  // step. REUSES senateVote(emit:false): never mutates, emits nothing. Returns the tally (or null).
  //   opts: { senateId|senate, motion | motionId, rng, autoRoll, gmOutcome, + any vote override }
  function previewSenateMotionVote(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    const motion = opts.motion || findSenateMotion(campaign, senate.id, opts.motionId);
    if(!motion) return null;
    return senateVote(campaign, Object.assign(_motionVoteOpts(campaign, senate, motion, opts), {
      rng: opts.rng, autoRoll: opts.autoRoll, gmOutcome: opts.gmOutcome, emit: false
    }));
  }

  // A PURE, dice-free preview of a motion's voting bloc — each leading senator (or faction, by mode)
  // with the modifiers that WOULD apply to its 2d6, but no roll. For the read-only motion-detail view.
  //   opts: { senateId|senate, motion|motionId, + any vote override }  → { senateId, mode, matter,
  //           totalVotes, majorityThreshold, independentMinorVotes, controlledIndependentVotes, rows[] }
  function previewSenateMotionModifiers(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return null;
    const motion = opts.motion || findSenateMotion(campaign, senate.id, opts.motionId);
    if(!motion) return null;
    const voteOpts = _motionVoteOpts(campaign, senate, motion, opts);
    const ctx = _consultContext(campaign, senate, voteOpts);
    const mode = voteOpts.mode === 'by-faction' ? 'by-faction' : 'per-senator';
    const cascades = {};                                   // no endorse/condemn cascade pre-roll
    const totalVotes = senateTotalVotes(campaign, senate);
    const rows = [];
    if(mode === 'by-faction'){
      factionsForSenate(campaign, senate.id)
        .map(f => ({ f, votes: factionTotalInfluence(campaign, f) })).filter(x => x.votes > 0)
        .sort((a, b) => b.votes - a.votes)
        .forEach(({ f, votes }) => {
          const stub = { factionId: f.id, policyObjectives: f.policyObjectives || [], influenceModifiers: [] };
          const mod = senatorVoteModifiers(campaign, senate, stub, ctx, cascades, true);
          rows.push({ factionId: f.id, factionName: f.name || f.id, votes, modifiers: mod.modifiers, total: mod.total });
        });
    } else {
      senatorshipsForSenate(campaign, senate.id).filter(s => s.rank !== 'minor')
        .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))
        .forEach(s => {
          const bew = _bewitchedVote(s);
          const mod = bew ? { modifiers: [], total: 0 } : senatorVoteModifiers(campaign, senate, s, ctx, cascades, false);
          rows.push({ senatorshipId: s.id, senatorCharacterId: s.senatorCharacterId, factionId: s.factionId || null,
            votes: Number(s.votes) || 0, bewitched: !!bew, bewitchedVote: bew || null, modifiers: mod.modifiers, total: mod.total });
        });
    }
    return { senateId: senate.id, mode, matter: voteOpts.matter,
      totalVotes, majorityThreshold: totalVotes > 0 ? Math.floor(totalVotes / 2) + 1 : 1,
      independentMinorVotes: senate.independentMinorSenatorVotes || 0,
      controlledIndependentVotes: ctx.controlledIndependentVotes, rows };
  }

  // Resolve an open motion end-to-end (the terminal verb): take the wizard's already-rolled
  // voteResult (or roll one — emit:false, the motion event is the audit), apply influence reveals,
  // then enact / reject (policy + edict, via enactPolicy) OR clear / escalate (dispute, via
  // clearSenateDispute + the RR p.359 escalate) — all over the SHIPPED P-2/P-3 verbs — record the
  // outcome on the motion, and emit 'senate-motion-resolved'.
  //   opts: { senateId|senate, motionId|motion, voteResult, rng, autoRoll, gmOutcome,
  //           enactDespiteRejection, rulerCharacterId, turn, emit:false, + vote overrides }
  //   Returns { ok, motion, vote, reveals, enact?, dispute? } (or { ok:false, reason }).
  function resolveSenateMotion(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const motion = opts.motion || findSenateMotion(campaign, senate.id, opts.motionId);
    if(!motion) return { ok:false, reason:'no-motion' };
    if(motion.status !== 'open') return { ok:false, reason:'not-open', motion };
    const turn = _turnOf(campaign, opts);
    const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const rulerId = opts.rulerCharacterId || (apex && apex.rulerCharacterId) || null;

    // 1) the vote — the wizard's shown tally, else roll one (emit:false; the motion event is the audit).
    const vote = opts.voteResult || senateVote(campaign, Object.assign(_motionVoteOpts(campaign, senate, motion, opts), {
      rng: opts.rng, autoRoll: opts.autoRoll, gmOutcome: opts.gmOutcome, emit: false, rulerCharacterId: rulerId
    }));
    motion.voteResult = vote;
    motion.outcome = vote ? vote.outcome : 'no-majority';
    const approved = !!(vote && vote.approved);

    // 2) reveal-on-an-unmodified-2 (a bribed/intimidated/seduced senator implicates the ruler — P-3).
    let reveals = { revealed: [] };
    try { reveals = applyInfluenceReveals(campaign, vote, { rulerCharacterId: rulerId, turn }) || reveals; } catch(e){}
    motion.revealedSenatorshipIds = (reveals.revealed || []).slice();

    // 3) apply the kind-appropriate effect over the shipped verbs.
    let enact = null, dispute = null;
    motion.enactDespiteRejection = !!opts.enactDespiteRejection;
    if(motion.kind === 'dispute'){
      if(senate.dispute == null){ motion.status = 'rejected'; }                 // nothing to clear
      else if(approved){
        clearSenateDispute(campaign, senate.id, { turn, resolution: 'approved' });
        motion.status = 'dispute-cleared'; dispute = { outcome: 'cleared' };
      } else {
        // escalate: bump attempts + stamp 'replace-ruler' on the against-voters (RR p.359; the P-3 shape —
        // duplicated rather than re-rolled via resolveDisputeByConsult so the wizard keeps its rolled tally).
        senate.dispute.attempts = (senate.dispute.attempts || 1) + 1;
        const hostile = [];
        for(const row of (vote && vote.rolls) || []){
          if(!row || row.vote !== 'against' || !row.senatorshipId) continue;
          const s = findSenatorship(campaign, row.senatorshipId);
          if(!s) continue;
          if(!Array.isArray(s.policyObjectives)) s.policyObjectives = [];
          if(s.policyObjectives.indexOf('replace-ruler') < 0){ s.policyObjectives.push('replace-ruler'); hostile.push(s.id); }
        }
        if(!Array.isArray(senate.history)) senate.history = [];
        senate.history.push({ turn, type: 'dispute-escalated', topic: (senate.dispute && senate.dispute.defiedTopic) || motion.matter, attempts: senate.dispute.attempts });
        motion.status = 'dispute-escalated';
        dispute = { outcome: 'escalated', attempts: senate.dispute.attempts, replaceRulerSenatorships: hostile };
      }
    } else {
      // policy / edict — enact on approval; on a rejection the ruler may defy (→ dispute) or stand down.
      if(approved){
        enact = enactPolicy(campaign, { senate, senateId: senate.id, matter: motion.matter, consulted: true, approved: true, rulerCharacterId: rulerId, turn, emit: false });
        motion.status = (enact && enact.cleared) ? 'dispute-cleared' : 'enacted';
      } else if(opts.enactDespiteRejection){
        enact = enactPolicy(campaign, { senate, senateId: senate.id, matter: motion.matter, consulted: true, approved: false, rulerCharacterId: rulerId, turn, emit: false });
        motion.status = (enact && enact.disputed) ? 'defied' : 'enacted';
      } else {
        motion.status = 'rejected';
      }
    }

    motion.resolvedAtTurn = turn;
    if(!Array.isArray(motion.history)) motion.history = [];
    motion.history.push({ turn, type: 'resolved', outcome: motion.outcome, status: motion.status });

    if(opts.emit !== false){
      _emitPoliticsEvent(campaign, 'senate-motion-resolved', {
        senateId: senate.id, motionId: motion.id, kind: motion.kind,
        matter: motion.matter, policyObjective: motion.policyObjective,
        outcome: motion.outcome, approved, status: motion.status,
        forVotes: vote ? vote.forVotes : 0, againstVotes: vote ? vote.againstVotes : 0,
        abstainVotes: vote ? vote.abstainVotes : 0, totalVotes: vote ? vote.totalVotes : 0,
        majorityThreshold: vote ? vote.majorityThreshold : 0,
        revealedCount: motion.revealedSenatorshipIds.length,
        narrative: 'The ' + (senate.name || 'senate') + ' resolves ' + _motionMatterLabel(motion) + ' — ' +
          (motion.status === 'enacted' ? 'enacted with the senate’s sanction.' :
           motion.status === 'defied' ? 'the ruler defies the senate (→ dispute).' :
           motion.status === 'dispute-cleared' ? 'the dispute ends.' :
           motion.status === 'dispute-escalated' ? 'the dispute deepens.' :
           'rejected.')
      }, senate, rulerId, (vote && vote.rolls) || []);
    }
    return { ok:true, motion, vote, reveals, enact, dispute };
  }

  // Withdraw an open motion (a GM correction — table it without a vote). No event (the 'opened'
  // record stands); stamps the motion history. Returns the motion (or null when not open).
  function withdrawSenateMotion(campaign, opts){
    opts = opts || {};
    const senate = opts.senate || findSenate(campaign, opts.senateId);
    const motion = opts.motion || findSenateMotion(campaign, (senate && senate.id) || opts.senateId, opts.motionId);
    if(!motion || motion.status !== 'open') return null;
    const turn = _turnOf(campaign, opts);
    motion.status = 'withdrawn';
    motion.resolvedAtTurn = turn;
    if(!Array.isArray(motion.history)) motion.history = [];
    motion.history.push({ turn, type: 'withdrawn' });
    return motion;
  }

  // Is the senate in its post-establishment honeymoon (RR p.357 — all vote for the ruler)? The
  // wizard reads this to default a motion to auto-approve. (senateVote itself is honeymoon-agnostic
  // — the UI passes autoRoll:false + gmOutcome:'approved' during the window.)
  function senateInHoneymoon(campaign, senate, turn){
    if(!senate || senate.honeymoonUntilTurn == null) return false;
    const t = (turn != null) ? turn : ((campaign && campaign.currentTurn) || 1);
    return t <= senate.honeymoonUntilTurn;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // P-7 — Eldermoot vocabulary + the rule-of-the-few OLIGARCHY governance mode
  //       (burst10 2026-06-20). Spec: Phase_4_Politics_Plan.md §12 + §14 P-7 + §2–§3;
  //       Politics_RAW_Survey.md §5 (oligarchies, JJ pp.402–404). The senate (P-1…P-5) is
  //       RAW core, ungated; the OLIGARCHY governance mode + its decisions/verbs sit behind
  //       the ONE opt-in `rule-of-the-few` house rule (plan §8 — default OFF, JJ "optional").
  //       The oligarchs ARE the ruler: oligarchyDerivedStats (P-1, extended above with
  //       Personal Authority) is the collective ruler; decisions are by MAJORITY (NOT the 2d6
  //       senate voting — survey §1's headline correction), a deadlock keeping last period's
  //       policy. Eldermoot is the senate's dwarven instance — blankSenate already accepts
  //       kind:'eldermoot'; this adds only the kind-label vocabulary (the entities + voting
  //       are SHARED with the senate, OQ4 → "same as the senate"; the Dwarven plan owns the
  //       dwarven flavor + scale).
  //   DEFERRED (NOT here — out of this lane): Separating Land and Lordship + the oligarchy
  //     income/XP split (survey §6; touches the economy core — a later slice). We READ the
  //     shipped income accessor for Personal Authority; we WRITE nothing to economy.js.
  //   Three record-only events (oligarchy-established / -dissolved / -decision): the verb
  //     applies state + emits the already-applied event; the events.js handler is a record-
  //     only audit (the favor-duty / P-2 / P-3 / P-5 precedent). NO new entity / prefix /
  //     collection / migration — the oligarchy lives on the SHIPPED governance sub-tree
  //     (P-1); the two new bits of state (governance.lastOligarchyPolicy + a per-apex
  //     governanceHistory[]) are init-on-write + read defensively (the P-3 independentGifts /
  //     P-5 motions discipline), so blankSenate / the field-schema / registry / migrate-no-op
  //     invariants are untouched.
  // ════════════════════════════════════════════════════════════════════════════

  const RULE_OF_THE_FEW = 'rule-of-the-few';
  function _ruleOfTheFewOn(campaign){
    const A = _A();
    return !!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, RULE_OF_THE_FEW));
  }

  // ── Eldermoot scaffolding (the senate-kind vocabulary; survey §7.2 / plan §11 — the Dwarven seam) ──
  // blankSenate already takes kind ∈ senate|eldermoot|council; an eldermoot IS a senate (same
  // entities, factions, senatorships, and 2d6 voting — OQ4). These are only the display vocabulary.
  const SENATE_KINDS = Object.freeze(['senate', 'eldermoot', 'council']);
  const _SENATE_KIND_LABELS = Object.freeze({ senate: 'Senate', eldermoot: 'Eldermoot', council: 'Council' });
  function isEldermoot(senate){ return !!senate && senate.kind === 'eldermoot'; }
  function senateKindLabel(senate){
    const k = (senate && senate.kind) || 'senate';
    return _SENATE_KIND_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
  }

  // ── The oligarchy governance mode (JJ pp.402–404; survey §5) ──
  const OLIGARCHY_DECISION_RULES = Object.freeze(['majority', 'unanimous', 'weighted']);

  // Emit an already-applied oligarchy record. Mirrors _emitPoliticsEvent, but the Event.context is
  // the apex DOMAIN directly (an oligarchy has no senate). Guarded so a missing events module never
  // breaks the pure computation.
  function _emitOligarchyEvent(campaign, kind, payload, apex, rulerId){
    const A = _A();
    if(typeof A.newEvent !== 'function' || typeof A.setEventContext !== 'function') return null;
    let ev;
    try { ev = A.newEvent(kind, { submittedBy: 'engine', targetTurn: campaign.currentTurn || 1,
      cadence: 'monthly-turn', payload: payload }); }
    catch(e){ return null; }                               // kind not registered (events module absent)
    const hexId = apex ? (((campaign.hexes || []).find(h => h && h.domainId === apex.id)) || {}).id || null : null;
    const related = [];
    if(rulerId) related.push({ kind:'character', id: rulerId, role:'subject' });
    if(apex) related.push({ kind:'domain', id: apex.id, role:'site' });
    const g = apex ? governanceFor(campaign, apex) : null;
    if(g) (g.oligarchCharacterIds || []).forEach(id => { if(id) related.push({ kind:'character', id, role:'witness' }); });
    A.setEventContext(ev, { primaryHexId: hexId, domainId: apex ? apex.id : null, relatedEntities: related });
    if(A.EVENT_STATUS) ev.status = A.EVENT_STATUS.APPLIED;
    ev.appliedAtTurn = campaign.currentTurn || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: payload.narrative || kind },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  function _ensureGovernanceHistory(apex){
    if(!Array.isArray(apex.governanceHistory)) apex.governanceHistory = [];   // init-on-write (defensive-read)
    return apex.governanceHistory;
  }

  // Establish an oligarchy on a realm's apex domain (JJ pp.402–404; survey §5.2): the apex
  // governance mode becomes 'oligarchic' with the member list + a decision rule. Gated on
  // rule-of-the-few. (Base morale re-derives off the collective ruler — oligarchyDerivedStats;
  // wiring that derived CHA into the economy's base-morale row is a DEFERRED later slice. This
  // sets the mode + members so the derived stats + decisions are live.) Returns { ok, governance }.
  //   opts: { domainId, oligarchCharacterIds[], decisionRule, rulerCharacterId, turn, emit }
  function establishOligarchy(campaign, opts){
    opts = opts || {};
    if(!_ruleOfTheFewOn(campaign)) return { ok:false, reason:'rule-off' };
    const apex = realmApexDomain(campaign, _findDomain(campaign, opts.domainId));
    if(!apex) return { ok:false, reason:'no-domain' };
    const members = (Array.isArray(opts.oligarchCharacterIds) ? opts.oligarchCharacterIds : [])
      .filter(id => !!_findChar(campaign, id));
    if(members.length === 0) return { ok:false, reason:'no-members' };
    const rule = OLIGARCHY_DECISION_RULES.indexOf(opts.decisionRule) >= 0 ? opts.decisionRule : 'majority';
    const turn = _turnOf(campaign, opts);
    const fromMode = governanceFor(campaign, apex).mode;
    const g = setDomainGovernance(campaign, apex.id, {
      mode: 'oligarchic', oligarchCharacterIds: members.slice(), oligarchyDecisionRule: rule
    });
    _ensureGovernanceHistory(apex).push({ turn, type: 'oligarchy-established', from: fromMode, members: members.length, rule });
    if(opts.emit !== false){
      _emitOligarchyEvent(campaign, 'oligarchy-established', {
        apexDomainId: apex.id, fromMode, memberCount: members.length, decisionRule: rule,
        narrative: 'An oligarchy of ' + members.length + ' takes power in ' + (apex.name || 'the realm') +
          ' (decisions by ' + rule + ').'
      }, apex, opts.rulerCharacterId || null);
    }
    return { ok:true, governance: g, apexDomainId: apex.id, memberCount: members.length };
  }

  // Dissolve an oligarchy (JJ pp.402–404; survey §5.2): the apex reverts to feudal — or to
  // senatorial when a senate exists and a ruler is named (the RAW bridge, survey §5.4) — and the
  // member list clears. Gated on rule-of-the-few. Returns { ok, governance, into }.
  //   opts: { domainId, into:'feudal'|'senatorial', rulerCharacterId, action, turn, emit }
  function dissolveOligarchy(campaign, opts){
    opts = opts || {};
    if(!_ruleOfTheFewOn(campaign)) return { ok:false, reason:'rule-off' };
    const apex = realmApexDomain(campaign, _findDomain(campaign, opts.domainId));
    if(!apex) return { ok:false, reason:'no-domain' };
    if(governanceFor(campaign, apex).mode !== 'oligarchic') return { ok:false, reason:'not-oligarchic' };
    const turn = _turnOf(campaign, opts);
    const senate = senateForDomain(campaign, apex);
    const into = (opts.into === 'senatorial' && senate) ? 'senatorial' : 'feudal';
    if(opts.rulerCharacterId && _findChar(campaign, opts.rulerCharacterId)) apex.rulerCharacterId = opts.rulerCharacterId;
    const g = setDomainGovernance(campaign, apex.id, { mode: into, oligarchCharacterIds: [] });
    _ensureGovernanceHistory(apex).push({ turn, type: 'oligarchy-dissolved', into, action: opts.action || 'dissolved', rulerCharacterId: opts.rulerCharacterId || null });
    if(opts.emit !== false){
      _emitOligarchyEvent(campaign, 'oligarchy-dissolved', {
        apexDomainId: apex.id, into, action: opts.action || 'dissolved',
        narrative: 'The oligarchy of ' + (apex.name || 'the realm') + ' is dissolved — the realm becomes ' + into + '.'
      }, apex, opts.rulerCharacterId || apex.rulerCharacterId || null);
    }
    return { ok:true, governance: g, into };
  }

  // An oligarch secedes (JJ pp.402–404; survey §5.2): he leaves the oligarchy, and his henchman-
  // vassals roll Loyalty to follow him — SURFACED, not auto-applied (the GM rolls via the shipped
  // loyalty machinery, the F&D-penalty pattern). When membership drops below 2 the body collapses —
  // to senatorial when ONE administering oligarch remains and a senate exists (the bridge, survey
  // §5.4), else feudal. Gated on rule-of-the-few. A non-collapsing secession is a membership edit
  // (governanceHistory only — no event; the 3 allotted kinds are establish/dissolve/decide).
  //   opts: { domainId, oligarchCharacterId, rulerCharacterId, turn, emit }
  //   Returns { ok, seceder, remaining[], collapsed, into?, henchmanVassals[], loyaltyModifier }.
  function secedeFromOligarchy(campaign, opts){
    opts = opts || {};
    if(!_ruleOfTheFewOn(campaign)) return { ok:false, reason:'rule-off' };
    const apex = realmApexDomain(campaign, _findDomain(campaign, opts.domainId));
    if(!apex) return { ok:false, reason:'no-domain' };
    const g0 = governanceFor(campaign, apex);
    if(g0.mode !== 'oligarchic') return { ok:false, reason:'not-oligarchic' };
    const seceder = opts.oligarchCharacterId;
    if(!seceder || g0.oligarchCharacterIds.indexOf(seceder) < 0) return { ok:false, reason:'not-a-member' };
    const turn = _turnOf(campaign, opts);
    const remaining = g0.oligarchCharacterIds.filter(id => id !== seceder);
    const A = _A();
    // the seceding oligarch's henchman-vassals roll Loyalty to follow (surfaced — RR loyalty, GM applies)
    const henchmanVassals = (Array.isArray(campaign.characters) ? campaign.characters : [])
      .filter(c => c && c.liegeCharacterId === seceder
        && (typeof A.isHenchman === 'function' ? A.isHenchman(c) : c.kind === 'henchman'))
      .map(c => c.id);

    if(remaining.length < 2){
      // collapse: the bridge — one administering oligarch + a senate ⇒ senatorial, else feudal.
      const senate = senateForDomain(campaign, apex);
      const into = (remaining.length === 1 && senate) ? 'senatorial' : 'feudal';
      if(remaining.length === 1 && _findChar(campaign, remaining[0])) apex.rulerCharacterId = remaining[0];
      setDomainGovernance(campaign, apex.id, { mode: into, oligarchCharacterIds: [] });
      _ensureGovernanceHistory(apex).push({ turn, type: 'oligarchy-dissolved', into, action: 'secession-collapse', seceder });
      if(opts.emit !== false){
        _emitOligarchyEvent(campaign, 'oligarchy-dissolved', {
          apexDomainId: apex.id, into, action: 'secession',
          narrative: 'An oligarch secedes from ' + (apex.name || 'the realm') + ' — the oligarchy collapses to ' + into + '.'
        }, apex, opts.rulerCharacterId || apex.rulerCharacterId || null);
      }
      return { ok:true, seceder, remaining, collapsed:true, into, henchmanVassals, loyaltyModifier: 0 };
    }
    // the body continues: drop the member (history only — a membership edit). The GM applies follower Loyalty.
    setDomainGovernance(campaign, apex.id, { oligarchCharacterIds: remaining });
    _ensureGovernanceHistory(apex).push({ turn, type: 'oligarch-seceded', seceder, remaining: remaining.length });
    return { ok:true, seceder, remaining, collapsed:false, henchmanVassals, loyaltyModifier: 0 };
  }

  // Resolve an oligarchy decision (JJ p.402; survey §5.1) — MAJORITY rules (NOT the 2d6 senate
  // voting). Each oligarch casts for / against / abstain (the UI gathers them; an unlisted member
  // abstains). The decision rule sets the bar: 'majority' = > half the members vote for; 'unanimous'
  // = every member for, none against; 'weighted' = > half the total weight (each member carries
  // opts.votes[i].weight, default 1). On a DEADLOCK (no resolution) LAST PERIOD'S POLICY PERSISTS
  // (JJ p.402) — tracked on governance.lastOligarchyPolicy (init-on-write). PURE compute + an
  // already-applied 'oligarchy-decision' record. Gated on rule-of-the-few. Returns the tally.
  //   opts: { domainId, policy, votes:[{characterId,vote:'for'|'against'|'abstain',weight}],
  //           decisionRule (override), rulerCharacterId, turn, emit }
  function resolveOligarchyDecision(campaign, opts){
    opts = opts || {};
    if(!_ruleOfTheFewOn(campaign)) return { ok:false, reason:'rule-off' };
    const apex = realmApexDomain(campaign, _findDomain(campaign, opts.domainId));
    if(!apex) return { ok:false, reason:'no-domain' };
    const g = governanceFor(campaign, apex);
    if(g.mode !== 'oligarchic') return { ok:false, reason:'not-oligarchic' };
    const members = g.oligarchCharacterIds.slice();
    if(members.length === 0) return { ok:false, reason:'no-members' };
    const rule = OLIGARCHY_DECISION_RULES.indexOf(opts.decisionRule) >= 0 ? opts.decisionRule : (g.oligarchyDecisionRule || 'majority');
    const turn = _turnOf(campaign, opts);
    // normalize votes to the member set (an unlisted member abstains)
    const byId = {};
    (Array.isArray(opts.votes) ? opts.votes : []).forEach(v => { if(v && v.characterId) byId[v.characterId] = v; });
    let forW = 0, againstW = 0, abstainW = 0, forN = 0, againstN = 0, abstainN = 0;
    for(const id of members){
      const v = byId[id] || { vote: 'abstain' };
      const w = (v.weight != null && Number(v.weight) >= 0) ? Number(v.weight) : 1;
      const vote = (v.vote === 'for' || v.vote === 'against') ? v.vote : 'abstain';
      if(vote === 'for'){ forW += w; forN++; }
      else if(vote === 'against'){ againstW += w; againstN++; }
      else { abstainW += w; abstainN++; }
    }
    const totalW = forW + againstW + abstainW;
    let outcome;
    if(rule === 'unanimous'){
      outcome = (forN > 0 && againstN === 0 && abstainN === 0) ? 'passed' : (againstN > 0 ? 'rejected' : 'deadlock');
    } else if(rule === 'weighted'){
      const half = totalW / 2;
      outcome = forW > half ? 'passed' : (againstW > half ? 'rejected' : 'deadlock');
    } else { // majority (head count)
      const half = members.length / 2;
      outcome = forN > half ? 'passed' : (againstN > half ? 'rejected' : 'deadlock');
    }
    // deadlock → last period's policy persists (JJ p.402); a pass becomes the new "last period's"
    let persistedPolicy = null;
    if(outcome === 'deadlock'){
      persistedPolicy = (apex.governance && apex.governance.lastOligarchyPolicy) || null;
    } else if(outcome === 'passed'){
      setDomainGovernance(campaign, apex.id, {});                 // ensure the sub-tree is materialized
      apex.governance.lastOligarchyPolicy = opts.policy || '';
    }
    const result = {
      ok: true, apexDomainId: apex.id, policy: opts.policy || '', decisionRule: rule, outcome,
      forVotes: rule === 'weighted' ? forW : forN,
      againstVotes: rule === 'weighted' ? againstW : againstN,
      abstainVotes: rule === 'weighted' ? abstainW : abstainN,
      forHeads: forN, againstHeads: againstN, abstainHeads: abstainN,
      memberCount: members.length, persistedPolicy
    };
    _ensureGovernanceHistory(apex).push({ turn, type: 'oligarchy-decision', policy: result.policy, rule, outcome });
    if(opts.emit !== false){
      _emitOligarchyEvent(campaign, 'oligarchy-decision', {
        apexDomainId: apex.id, policy: result.policy, decisionRule: rule, outcome,
        forVotes: result.forVotes, againstVotes: result.againstVotes, abstainVotes: result.abstainVotes,
        narrative: 'The oligarchy of ' + (apex.name || 'the realm') + ' decides “' + (result.policy || 'a policy') + '”: ' +
          (outcome === 'passed' ? 'PASSED' : outcome === 'rejected' ? 'REJECTED' :
            'DEADLOCK — last period’s policy persists' + (persistedPolicy ? ' (' + persistedPolicy + ')' : '')) +
          ' (' + result.forVotes + ' for / ' + result.againstVotes + ' against).'
      }, apex, opts.rulerCharacterId || apex.rulerCharacterId || null);
    }
    return result;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // P-7 wizard (burst11 2026-06-20) — the generative SENATE-MATERIALIZATION WIZARD.
  //   Spec: Phase_4_Politics_Plan.md §5.2 + §14 P-5/P-7; Politics_RAW_Survey.md §4.4 (the
  //   7-step construction: size → requirements of office → leading senators → 1d3 objectives
  //   → influence → factions → faction totals, RR pp.356–357). A GM/Action wizard: roll/derive
  //   a senate for a realm's APEX domain and DRAW its leading senators from the realm's actual
  //   NOTABLES (the SHIPPED demographics census — realmCommandStructure / findResidents, READ-
  //   ONLY, never written), then MINT the shipped senate/faction/senatorship entities + set the
  //   apex governance senatorial. STATIC materialization only — a senator carries his 1d3 policy
  //   objectives as DATA; the autonomous NPC-goals layer (§13) is OUT (FENCED — no knowledge.js).
  //   proposeSenateMaterialization is PURE + seeded (re-open reproduces; a new seed re-rolls);
  //   materializeSenate applies a passed/recomputed plan + emits ONE record-only event
  //   (senate-materialized; the verb-applies-state + emits pattern, the P-2/P-3/P-5/P-7 precedent).
  //   NO new entity / prefix / collection / house rule / migration — only the shipped sen-/fac-/
  //   snr- factories + the governance sub-tree + ONE new event kind.
  // ════════════════════════════════════════════════════════════════════════════

  // RR p.357 — Size of the Senate (by realm families). Contiguous upper-bound bands (the book's
  // 52,000→53,000 / 363,000→364,000 / 1,499,000→1,500,001 gaps are rounding — made contiguous).
  const SENATE_SIZE_BANDS = Object.freeze([
    Object.freeze({ maxFamilies: 4599,     minSeats: 4,   maxSeats: 15 }),
    Object.freeze({ maxFamilies: 52000,    minSeats: 4,   maxSeats: 50 }),
    Object.freeze({ maxFamilies: 363000,   minSeats: 16,  maxSeats: 225 }),
    Object.freeze({ maxFamilies: 1499000,  minSeats: 51,  maxSeats: 1500 }),
    Object.freeze({ maxFamilies: Infinity, minSeats: 225, maxSeats: 6000 })
  ]);
  function senateSizeBandForFamilies(families){
    const f = Math.max(0, Number(families) || 0);
    return SENATE_SIZE_BANDS.find(b => f <= b.maxFamilies) || SENATE_SIZE_BANDS[SENATE_SIZE_BANDS.length - 1];
  }

  // RR p.357 — Senate Characteristics (by seat count). minLevelDelta = ruler level − N (the senator
  // bar is INVERSE to size). leading/influence are dice descriptors {n,d,plus?,mult?} for _rollDice.
  const SENATE_CHARACTERISTICS = Object.freeze([
    Object.freeze({ maxSeats: 15,       minLevelDelta: -1, leading:{n:1,d:4},        influence:{n:2,d:3} }),
    Object.freeze({ maxSeats: 50,       minLevelDelta: -3, leading:{n:2,d:6},        influence:{n:2,d:6} }),
    Object.freeze({ maxSeats: 225,      minLevelDelta: -5, leading:{n:2,d:6,plus:3}, influence:{n:2,d:6,mult:3} }),
    Object.freeze({ maxSeats: 1500,     minLevelDelta: -7, leading:{n:3,d:6,plus:2}, influence:{n:2,d:10,mult:5} }),
    Object.freeze({ maxSeats: Infinity, minLevelDelta: -9, leading:{n:4,d:6,plus:1}, influence:{n:2,d:10,mult:20} })
  ]);
  function senateCharacteristicsForSeats(seats){
    const s = Math.max(0, Number(seats) || 0);
    return SENATE_CHARACTERISTICS.find(b => s <= b.maxSeats) || SENATE_CHARACTERISTICS[SENATE_CHARACTERISTICS.length - 1];
  }

  // RR p.357 — Requirements of Office (by min senator level, clamped [3,11]). The Judge's in-world bar
  // + the per-period BRIBE cost (copied onto each senatorship's bribeCostByPeriod, RR p.357 — the P-4
  // influence machinery reads it).
  const REQUIREMENTS_OF_OFFICE = Object.freeze({
    3:  Object.freeze({ title:'Baron',    netWorthGp:5000,    landDescription:'5 × 1.5-mi hexes',  families:40,   bribe:{ day:4,    week:25,   month:100,   year:1200 } }),
    4:  Object.freeze({ title:'Baron',    netWorthGp:10000,   landDescription:'7 × 1.5-mi hexes',  families:80,   bribe:{ day:7,    week:50,   month:200,   year:2400 } }),
    5:  Object.freeze({ title:'Baron',    netWorthGp:20000,   landDescription:'12 × 1.5-mi hexes', families:160,  bribe:{ day:15,   week:100,  month:400,   year:4800 } }),
    6:  Object.freeze({ title:'Viscount', netWorthGp:38000,   landDescription:'1 × 6-mi hex',      families:285,  bribe:{ day:25,   week:200,  month:800,   year:9600 } }),
    7:  Object.freeze({ title:'Count',    netWorthGp:75000,   landDescription:'2 × 6-mi hexes',    families:550,  bribe:{ day:50,   week:400,  month:1600,  year:19200 } }),
    8:  Object.freeze({ title:'Count',    netWorthGp:150000,  landDescription:'3 × 6-mi hexes',    families:1200, bribe:{ day:100,  week:750,  month:3000,  year:36000 } }),
    9:  Object.freeze({ title:'Duke',     netWorthGp:350000,  landDescription:'4 × 6-mi hexes',    families:2650, bribe:{ day:250,  week:1800, month:7250,  year:87000 } }),
    10: Object.freeze({ title:'Duke',     netWorthGp:500000,  landDescription:'5 × 6-mi hexes',    families:3750, bribe:{ day:400,  week:3000, month:12000, year:144000 } }),
    11: Object.freeze({ title:'Prince',   netWorthGp:1125000, landDescription:'10 × 6-mi hexes',   families:8500, bribe:{ day:1000, week:8000, month:32000, year:384000 } })
  });
  function requirementsOfOfficeForLevel(level){
    const lv = Math.max(3, Math.min(11, Math.round(Number(level) || 3)));
    return REQUIREMENTS_OF_OFFICE[lv];
  }

  // A tiny self-contained seeded PRNG (FNV-1a → mulberry32) so the wizard preview is byte-stable
  // across re-opens (same inputs → same plan), the project's day-tick/encounter idiom. Kept self-
  // contained (not subsystems' un-exported _jHash32) per the module's late-bind discipline.
  function _polHash32(str){ let h = 0x811c9dc5; const s = String(str); for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function _polMulberry32(seed){ let a = seed >>> 0; return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Roll a dice descriptor {n,d,plus?,mult?}: (n d-sided dice + plus) × mult.
  function _rollDice(desc, rng){
    const r = (typeof rng === 'function') ? rng : Math.random;
    let sum = 0; const n = (desc && desc.n) || 0, d = (desc && desc.d) || 1;
    for(let i = 0; i < n; i++) sum += 1 + Math.floor(r() * d);
    sum += (desc && desc.plus) || 0;
    if(desc && desc.mult) sum *= desc.mult;
    return sum;
  }
  function _diceLabel(desc){
    if(!desc) return '';
    let s = ((desc.n) || 0) + 'd' + ((desc.d) || 0);
    if(desc.plus) s += '+' + desc.plus;
    if(desc.mult) s += '×' + desc.mult;
    return s;
  }
  function _humanizeObjective(key){ return String(key || '').split('-').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' '); }

  // RAW "re-roll conflicts" (RR p.357 step 4): a senator never holds a contradictory pair.
  const _OBJECTIVE_CONFLICTS = Object.freeze({
    'increase-army':'decrease-army', 'decrease-army':'increase-army',
    'increase-navy':'decrease-navy', 'decrease-navy':'increase-navy',
    'replace-ruler':'preserve-ruler', 'preserve-ruler':'replace-ruler',
    'conquer-neighbor':'make-peace', 'make-peace':'conquer-neighbor',
    'decrease-peasant-taxes':'increase-peasant-taxes', 'increase-peasant-taxes':'decrease-peasant-taxes',
    'support-existing-faith':'introduce-new-faith', 'introduce-new-faith':'support-existing-faith'
  });
  // 1d3 distinct, non-conflicting policy objectives (RR p.357 step 4 — each leading senator rolls 1d3
  // of the 1d20 table; the shipped POLICY_OBJECTIVES IS that table in order).
  function _rollObjectives(rng){
    const r = (typeof rng === 'function') ? rng : Math.random;
    const count = 1 + Math.floor(r() * 3);
    const out = []; let guard = 0;
    while(out.length < count && guard++ < 60){
      const o = POLICY_OBJECTIVES[Math.floor(r() * POLICY_OBJECTIVES.length)];
      if(out.indexOf(o) >= 0) continue;
      if(out.indexOf(_OBJECTIVE_CONFLICTS[o]) >= 0) continue;
      out.push(o);
    }
    return out;
  }

  // Cluster leading senators into factions by COMPATIBLE policy objectives (RR p.357 step 6): any two
  // senators sharing ≥1 objective join the same faction (union-find over shared objectives); a senator
  // sharing none forms his own faction. Each faction's platform = its objectives by frequency. Returns
  // [{ memberIdx:[i…], policyObjectives:[keys], dominant }] in descending member-count order.
  function _clusterFactions(senators){
    const n = senators.length;
    const parent = []; for(let i = 0; i < n; i++) parent[i] = i;
    const find = x => { while(parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };
    const byObj = {};
    senators.forEach((s, i) => (s.objectives || []).forEach(o => { (byObj[o] = byObj[o] || []).push(i); }));
    Object.keys(byObj).forEach(o => { const arr = byObj[o]; for(let k = 1; k < arr.length; k++) union(arr[0], arr[k]); });
    const comp = {};
    senators.forEach((s, i) => { const root = find(i); (comp[root] = comp[root] || []).push(i); });
    return Object.keys(comp).map(root => {
      const memberIdx = comp[root];
      const counts = {};
      memberIdx.forEach(i => (senators[i].objectives || []).forEach(o => { counts[o] = (counts[o] || 0) + 1; }));
      const objKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || POLICY_OBJECTIVES.indexOf(a) - POLICY_OBJECTIVES.indexOf(b));
      return { memberIdx, policyObjectives: objKeys, dominant: objKeys[0] || '' };
    }).sort((a, b) => b.memberIdx.length - a.memberIdx.length);
  }

  // The realm's NOTABLE NPCs — the pool the wizard seats as leading senators (RR: the Judge names the
  // leading senators; here they are DRAWN from the realm's actual notables). READ-ONLY over the SHIPPED
  // demographics census (realmCommandStructure — office-holders/entourage/vassal-lords; findResidents —
  // the realm's high-level homed residents), plus GM-supplied extras. Excludes the apex RULER (the
  // senate constrains him — he is not a senator) + the deceased. Deduped by character id; sorted by
  // level desc. Defensive: a thin realm with no homed residents still yields its vassal lords +
  // magistrates via realmCommandStructure (which needs no homeSettlementId). opts.minLevel filters.
  //   opts: { minLevel, extraCharacterIds[] }
  function senateMaterializeCandidates(campaign, apexDomainOrId, opts){
    opts = opts || {};
    const A = _A();
    const apex = realmApexDomain(campaign, (typeof apexDomainOrId === 'string') ? _findDomain(campaign, apexDomainOrId) : apexDomainOrId);
    if(!apex) return [];
    const rulerId = apex.rulerCharacterId || null;
    const minLevel = (opts.minLevel != null) ? Number(opts.minLevel) : null;
    const byId = new Map();
    const add = (charId, source) => {
      if(!charId || charId === rulerId || byId.has(charId)) return;
      const ch = _findChar(campaign, charId);
      if(!ch || ch.lifecycleState === 'deceased') return;
      const level = Number(ch.level) || 1;
      if(minLevel != null && level < minLevel) return;
      byId.set(charId, { characterId: charId, name: ch.name || '(unnamed)', level, class: ch.class || '', source: source || '' });
    };
    // 1. realmCommandStructure — office-holders (skip the ruler office), entourage, vassal lords.
    if(typeof A.realmCommandStructure === 'function'){
      let cs = null; try { cs = A.realmCommandStructure(campaign, apex.id); } catch(e){ cs = null; }
      if(cs){
        (cs.offices || []).forEach(off => { if(off && off.mapsTo !== 'ruler' && off.holder && off.holder.id) add(off.holder.id, off.label || 'office'); });
        (cs.entourageOther || []).forEach(e => { if(e && e.id) add(e.id, 'court'); });
        (cs.vassalLords || []).forEach(vl => { if(vl && vl.rulerId) add(vl.rulerId, 'vassal lord of ' + (vl.domainName || 'a domain')); });
      }
    }
    // 2. findResidents — the realm's high-level homed residents (the broader notable pool).
    if(typeof A.findResidents === 'function'){
      let residents = [];
      try { residents = A.findResidents(campaign, { domainId: apex.id, includeVassals: true, minLevel: (minLevel != null ? minLevel : undefined) }) || []; }
      catch(e){ residents = []; }
      residents.forEach(r => { if(r && r.id) add(r.id, 'notable resident' + (r.settlementName ? ' of ' + r.settlementName : '')); });
    }
    // 3. GM-supplied extras (the UI lets the GM seat anyone).
    (Array.isArray(opts.extraCharacterIds) ? opts.extraCharacterIds : []).forEach(id => add(id, 'GM'));
    return Array.from(byId.values()).sort((a, b) => b.level - a.level || (a.name || '').localeCompare(b.name || ''));
  }

  // PROPOSE (pure, seeded) — the full 7-step plan for a realm's senate, WITHOUT mutating the campaign.
  // The GM reviews/overrides + passes it back to materializeSenate (the propose-review-commit idiom).
  //   opts: { domainId | apexDomain, seats (GM override, clamped to the band), seed, rng,
  //           extraCharacterIds[], turn }
  function proposeSenateMaterialization(campaign, opts){
    opts = opts || {};
    const apex = realmApexDomain(campaign, opts.apexDomain || _findDomain(campaign, opts.domainId));
    if(!apex) return { ok:false, reason:'no-domain' };
    const A = _A();
    const realmFamilies = (typeof A.realmFamiliesForDomain === 'function') ? (Number(A.realmFamiliesForDomain(campaign, apex)) || 0) : 0;
    const band = senateSizeBandForFamilies(realmFamilies);
    let seats = (opts.seats != null) ? Math.round(Number(opts.seats)) : band.minSeats;
    seats = Math.max(band.minSeats, Math.min(band.maxSeats, seats));
    const chars = senateCharacteristicsForSeats(seats);
    const ruler = _findChar(campaign, apex.rulerCharacterId);
    const rulerLevel = ruler ? (Number(ruler.level) || 1) : 1;
    const minSenatorLevel = Math.max(1, rulerLevel + chars.minLevelDelta);
    const requirements = requirementsOfOfficeForLevel(minSenatorLevel);

    const seed = (opts.seed != null) ? opts.seed : 1;
    const rng = (typeof opts.rng === 'function') ? opts.rng
      : _polMulberry32(_polHash32(apex.id + '|' + seats + '|' + realmFamilies + '|' + seed));

    // step 3 — leading-senator count (rolled). Seat the realm's real notables first (highest-level
    // first); when opts.fillWithGenerated, MINT the shortfall as fresh senator Characters at commit
    // (RR p.357 — "the Judge creates the leading senators"; a thin/new realm with too few notables
    // would otherwise convene a leaderless senate). Placeholders are pure DATA here (characterId null,
    // generated:true); the NPC is minted in materializeSenate, so this propose step stays mutation-free
    // + seeded (the preview reproduces; minting — which mutates — is deferred to the commit step).
    const fillWithGenerated = !!opts.fillWithGenerated;
    // GM override (Phase 5): decide the leading-senator count instead of rolling chars.leading.
    const leadingCountManual = (opts.leadingCount != null && Number(opts.leadingCount) >= 1);
    const rolledLeadingCount = leadingCountManual ? Math.round(Number(opts.leadingCount)) : Math.max(1, _rollDice(chars.leading, rng));
    const pool = senateMaterializeCandidates(campaign, apex, { minLevel: minSenatorLevel, extraCharacterIds: opts.extraCharacterIds });
    const poolSize = pool.length;
    const realSeatCount = Math.min(rolledLeadingCount, poolSize);
    const generatedSeatCount = fillWithGenerated ? Math.max(0, rolledLeadingCount - realSeatCount) : 0;
    const seatCount0 = realSeatCount + generatedSeatCount;
    // step 5 — an influence value per leading senator; sort desc so the most notable carries the most.
    const influences = [];
    for(let i = 0; i < seatCount0; i++) influences.push(Math.max(1, _rollDice(chars.influence, rng)));
    influences.sort((a, b) => b - a);
    let seated = pool.slice(0, realSeatCount).map((cand, i) => ({
      characterId: cand.characterId, name: cand.name, level: cand.level, class: cand.class, source: cand.source,
      votes: influences[i] || 1
    }));
    // the shortfall — to-be-generated leading senators (minted at commit, at the RR p.357 min level).
    for(let g = 0; g < generatedSeatCount; g++) seated.push({
      characterId: null, name: '(to be generated)', level: minSenatorLevel, class: '', source: 'generated',
      generated: true, votes: influences[realSeatCount + g] || 1
    });
    // RAW influence accounting (RR p.357): if Σ influence > seats, drop the least-influential leading
    // senators until it fits.
    seated.sort((a, b) => b.votes - a.votes);
    // RAW influence accounting (RR p.357): drop least-influential until Σ influence ≤ seats — UNLESS the GM
    // decided the count (then deliver it; the GM can edit votes, and independent minor votes floor at 0).
    if(!leadingCountManual){
      let runTotal = seated.reduce((s, x) => s + x.votes, 0);
      while(seated.length > 1 && runTotal > seats){ runTotal -= seated.pop().votes; }
    }
    // step 4 — 1d3 policy objectives each; step 6 — cluster into factions
    seated.forEach(s => { s.objectives = _rollObjectives(rng); });
    const clusters = _clusterFactions(seated);
    clusters.forEach((cl, fi) => cl.memberIdx.forEach(i => { seated[i].factionIndex = fi; }));
    const factions = clusters.map((cl, fi) => {
      const members = cl.memberIdx.map(i => seated[i]);
      return { index: fi,
        name: cl.dominant ? (_humanizeObjective(cl.dominant) + ' faction') : ('Faction ' + (fi + 1)),
        platform: cl.policyObjectives.map(_humanizeObjective).join(', '),
        policyObjectives: cl.policyObjectives.slice(),
        memberCharacterIds: members.map(m => m.characterId),
        totalVotes: members.reduce((s, x) => s + x.votes, 0) };
    });
    // step 7 — independent minor votes + the derived ruling/leading faction (display; the shipped
    // senateRulingFactionId reproduces this after minting — they share the same totals + threshold).
    const seatedInfluence = seated.reduce((s, x) => s + x.votes, 0);
    const independentMinorVotes = Math.max(0, seats - seatedInfluence);
    const totalSeatPool = seatedInfluence + independentMinorVotes;
    const majority = Math.floor(totalSeatPool / 2) + 1;
    let rulingFactionIndex = -1, leadingFactionIndex = -1, best = 0, tie = false;
    factions.forEach(f => {
      if(f.totalVotes >= majority && rulingFactionIndex < 0) rulingFactionIndex = f.index;
      if(f.totalVotes > best){ best = f.totalVotes; leadingFactionIndex = f.index; tie = false; }
      else if(f.totalVotes === best && f.totalVotes > 0){ tie = true; }
    });
    if(rulingFactionIndex >= 0) leadingFactionIndex = rulingFactionIndex;
    else if(tie || best === 0) leadingFactionIndex = -1;
    factions.forEach(f => { f.standing = (f.index === rulingFactionIndex) ? 'ruling' : (f.index === leadingFactionIndex ? 'leading' : 'minor'); });

    return {
      ok: true, apexDomainId: apex.id, apexName: apex.name || apex.id, realmFamilies,
      minSeats: band.minSeats, maxSeats: band.maxSeats, seats,
      rulerCharacterId: apex.rulerCharacterId || null, rulerName: ruler ? (ruler.name || '(unnamed)') : null, rulerLevel,
      minSenatorLevel, leadingDiceLabel: _diceLabel(chars.leading), influenceDiceLabel: _diceLabel(chars.influence),
      requirements: { minLevel: minSenatorLevel, title: requirements.title, netWorthGp: requirements.netWorthGp,
        landDescription: requirements.landDescription, families: requirements.families, bribe: Object.assign({}, requirements.bribe) },
      senators: seated, factions, independentMinorVotes,
      rolledLeadingCount, leadingCountManual, seatedCount: seated.length, poolSize, poolShort: poolSize < rolledLeadingCount,
      generatedCount: seated.filter(s => s.generated).length, realCount: seated.filter(s => !s.generated).length, fillWithGenerated,
      rulingFactionIndex, leadingFactionIndex, seed
    };
  }

  // COMMIT — apply a senate plan: mint the shipped senate/faction/senatorship entities, set the apex
  // governance senatorial, and emit ONE record-only `senate-materialized` event. Guard: refuses if the
  // apex already has a live senate (unless opts.replace). Pass opts.plan (the reviewed propose* result)
  // for byte-exact commit; else recomputes from opts (seed/seats). NO new collection/migration — the
  // three collections are init-on-write (the importer ensures them on load).
  //   opts: { domainId | apexDomain, plan, seats, seed, extraCharacterIds[], turn, emit, replace,
  //           kind, name }  → { ok, senate, factions[], senatorships[], plan } | { ok:false, reason }
  function materializeSenate(campaign, opts){
    opts = opts || {};
    const apex = realmApexDomain(campaign, opts.apexDomain || _findDomain(campaign, opts.domainId));
    if(!apex) return { ok:false, reason:'no-domain' };
    // Tribal Domains gate (RR p.354): a senate cannot sit on a primitive clanhold apex (no call-to-
    // council except war, no grants of title). Late-bound onto domain-variants; opts.force overrides
    // (GM sovereignty). Transitional / civilized / demchi apexes pass.
    if(!opts.force && typeof ACKS.domainTypeAllowsSenate === 'function' && typeof ACKS.domainTypeOf === 'function'
       && !ACKS.domainTypeAllowsSenate(ACKS.domainTypeOf(apex))) return { ok:false, reason:'clanhold-no-senate' };
    const existing = senateForRealm(campaign, apex.id);
    if(existing && existing.status !== 'dissolved' && !opts.replace) return { ok:false, reason:'senate-exists', senateId: existing.id };
    const plan = (opts.plan && opts.plan.ok) ? opts.plan
      : proposeSenateMaterialization(campaign, Object.assign({}, opts, { apexDomain: apex }));
    if(!plan || !plan.ok) return { ok:false, reason: (plan && plan.reason) || 'no-plan' };
    const turn = _turnOf(campaign, opts);

    if(!Array.isArray(campaign.senates)) campaign.senates = [];
    if(!Array.isArray(campaign.factions)) campaign.factions = [];
    if(!Array.isArray(campaign.senatorships)) campaign.senatorships = [];

    // Mint any to-be-generated leading senators (§5.2 — reuse the SHIPPED NPC generator). LATE-BOUND:
    // in index.html generators.js loads AFTER politics.js, so resolve generateAndLandNPC at CALL time,
    // never at module load (the realmCommandStructure / findResidents late-bind discipline). Seeded per
    // a wizard-seed-derived per-seat seed; each minted senator is a real Character homed to the realm
    // (landGeneratedNPC also records its own `generation` event). Defensive: if the generator is absent
    // (a headless context without generators.js), the placeholder is skipped — never seated as a null.
    const Agen = _A();
    const canGenerate = typeof Agen.generateAndLandNPC === 'function';
    const mintedByIndex = {};
    let mintedCount = 0;
    plan.senators.forEach((s, i) => {
      if(!s || !s.generated || s.characterId || !canGenerate) return;
      const genSeed = _polHash32(apex.id + '|gen-senator|' + i + '|' + (plan.seed != null ? plan.seed : 1));
      let ch = null;
      try {
        ch = Agen.generateAndLandNPC(campaign,
          { targetLevel: s.level || plan.minSenatorLevel, domainId: apex.id,
            socialTier: 'independent', controlledBy: 'gm', placementRole: 'domain-npc' },
          { seed: genSeed });
      } catch(e){ ch = null; }
      if(ch && ch.id){
        // honor a GM-edited generated-senator name (the wizard's "edit the leading senators"); else keep the generated name
        if(s.name && s.name !== '(to be generated)') ch.name = s.name;
        mintedByIndex[i] = ch; mintedCount++;
      }
    });

    const req = plan.requirements;
    const senate = blankSenate({
      realmDomainId: apex.id,
      name: opts.name || (plan.apexName + ' Senate'),
      kind: opts.kind || 'senate',
      seats: plan.seats,
      minSenatorLevel: plan.minSenatorLevel,
      requirementsOfOffice: {
        minLevel: req.minLevel, title: req.title, netWorthGp: req.netWorthGp,
        landDescription: req.landDescription, families: req.families,
        bribeCostDay: req.bribe.day, bribeCostWeek: req.bribe.week, bribeCostMonth: req.bribe.month, bribeCostYear: req.bribe.year
      },
      independentMinorSenatorVotes: plan.independentMinorVotes,
      establishedAtTurn: turn,
      history: [{ turn, type: 'materialized', seats: plan.seats, leadingSenators: plan.seatedCount, generated: mintedCount, families: plan.realmFamilies }]
    });
    campaign.senates.push(senate);

    const factionIdByIndex = {};
    plan.factions.forEach(f => {
      const fac = blankFaction({
        name: f.name, platform: f.platform, senateId: senate.id, realmDomainId: apex.id,
        policyObjectives: (f.policyObjectives || []).slice(), kind: f.standing || 'minor'
      });
      campaign.factions.push(fac);
      factionIdByIndex[f.index] = fac.id;
    });

    const senatorships = [];
    plan.senators.forEach((s, i) => {
      const minted = mintedByIndex[i];
      const charId = s.characterId || (minted && minted.id) || null;
      if(!charId) return;                                  // an unmintable placeholder (defensive) — never seat a null senator
      const seat = blankSenatorship({
        senatorCharacterId: charId, senateId: senate.id, rank: 'leading', votes: s.votes,
        factionId: (s.factionIndex != null) ? (factionIdByIndex[s.factionIndex] || null) : null,
        policyObjectives: (s.objectives || []).slice(),
        bribeCostByPeriod: { day: req.bribe.day, week: req.bribe.week, month: req.bribe.month, year: req.bribe.year },
        isSecretInfluence: true, seatedAtTurn: turn,
        history: [{ turn, type: 'materialized', source: s.source || '', generated: !!minted }]
      });
      campaign.senatorships.push(seat);
      senatorships.push(seat);
    });

    setDomainGovernance(campaign, apex.id, { mode: 'senatorial', senateId: senate.id });
    _ensureGovernanceHistory(apex).push({ turn, type: 'senate-materialized', senateId: senate.id, seats: plan.seats, leadingSenators: senatorships.length });

    if(opts.emit !== false){
      _emitPoliticsEvent(campaign, 'senate-materialized', {
        senateId: senate.id, apexDomainId: apex.id, seats: plan.seats, leadingSenators: senatorships.length,
        factions: plan.factions.length, independentMinorVotes: plan.independentMinorVotes,
        realmFamilies: plan.realmFamilies, minSenatorLevel: plan.minSenatorLevel,
        narrative: 'A ' + plan.seats + '-seat senate is convened over ' + (apex.name || 'the realm') + ' — ' +
          senatorships.length + ' leading senators' + (mintedCount ? ' (' + mintedCount + ' newly generated)' : '') +
          ' in ' + plan.factions.length + ' faction' + (plan.factions.length === 1 ? '' : 's') + ' (RR pp.355–360).'
      }, senate, apex.rulerCharacterId || null, senatorships.map(s => ({ senatorCharacterId: s.senatorCharacterId })));
    }
    return { ok: true, senate, mintedCount,
      factions: plan.factions.map(f => findFaction(campaign, factionIdByIndex[f.index])).filter(Boolean),
      senatorships, plan };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Phase 5 (2026-06-24) — the NAMED senate composition: one named senator per vote.
  //   A leading senator's bloc = the patron (1 vote) + their clients (the patron/client
  //   model, RR p.357 "influence"). Each vote is a real Character; the non-leading voters
  //   are either a leading senator's clients or independent minor senators. The shipped
  //   voting engine is untouched — `votes` stays the bloc size and `independentMinorSenator-
  //   Votes` stays the anonymous count; these verbs name the bodies behind those numbers and
  //   keep the two mirrors in sync (rule #10). Stub senators are minted lightweight + expandable
  //   (ACKS.expandCharacterToFull) — a senate can be many bodies, and a minor senator is a name.
  //   NO new entity/prefix/collection/event/house-rule/migration (the two named lists are
  //   additive defensive-read fields on the existing senate/senatorship factories).
  // ════════════════════════════════════════════════════════════════════════════

  // Canonical setters (rule #10) — call ONLY once the named list is authoritative (post-populate):
  // a leading seat's votes = 1 (patron) + its named clients; the senate's independent vote count = its
  // named independents. Move/add/remove/retire reconcile through these; populate fills the lists to the
  // existing counts (so it does NOT call these — it leaves the rolled vote counts as authoritative).
  function _reconcileLeadingVotes(seat){
    if(!seat) return seat;
    if(!Array.isArray(seat.clientCharacterIds)) seat.clientCharacterIds = [];
    seat.votes = 1 + seat.clientCharacterIds.length;
    return seat;
  }
  function _reconcileSenateIndependents(senate){
    if(!senate) return senate;
    if(!Array.isArray(senate.independentSenatorCharacterIds)) senate.independentSenatorCharacterIds = [];
    senate.independentMinorSenatorVotes = senate.independentSenatorCharacterIds.length;
    return senate;
  }

  // A senate is "fully named" when every leading seat's clients fill its bloc (votes-1) AND the named
  // independents fill the independent vote count — i.e. one named senator per vote. The UI gates client-
  // level editing (drag-drop / add / retire) on this; a legacy/under-populated senate shows Populate first.
  function senateIsFullyNamed(campaign, senate){
    if(!senate) return false;
    const seats = senatorshipsForSenate(campaign, senate.id).filter(s => s.rank !== 'minor');
    for(const s of seats){
      const clients = Array.isArray(s.clientCharacterIds) ? s.clientCharacterIds.length : 0;
      if(clients < Math.max(0, (Number(s.votes) || 1) - 1)) return false;
    }
    const named = Array.isArray(senate.independentSenatorCharacterIds) ? senate.independentSenatorCharacterIds.length : 0;
    return named >= (Number(senate.independentMinorSenatorVotes) || 0);
  }

  // A small fallback name pool (only used in a headless context with no generator loaded; the live app
  // always has acks-engine-generators.js by call time → real generated names).
  const _STUB_SENATOR_NAMES = Object.freeze(['Aelius','Brenna','Cassia','Doran','Elara','Faustus','Gaius','Hella',
    'Ildric','Junia','Karis','Lucan','Mara','Nerio','Ovidia','Petra','Quentin','Rufus','Sabina','Tullia','Varro','Wynne']);
  function _stubName(seed){
    const h = (typeof _polHash32 === 'function') ? _polHash32(String(seed || 'senator')) : 0;
    return _STUB_SENATOR_NAMES[Math.abs(h) % _STUB_SENATOR_NAMES.length] + ' the Younger';
  }

  // Mint ONE minor senator (a client or an independent) as a lightweight, expandable Character homed to
  // the realm. Prefers the SHIPPED NPC generator (real name/class/level) but PROPOSES + pushes WITHOUT
  // landing — so it emits NO per-stub `generation` event (a senate of N would otherwise flood the log).
  // Late-bound off global.ACKS (generators.js loads after politics.js). Falls back to a bare blankCharacter
  // (entities.js) in a headless context. Returns the Character or null.
  function _mintSenatorStub(campaign, apex, opts){
    opts = opts || {};
    const A = _A();
    if(!Array.isArray(campaign.characters)) campaign.characters = [];
    let ch = null;
    if(typeof A.generateNPC === 'function'){
      try {
        const prop = A.generateNPC(campaign,
          { targetLevel: Math.max(1, Number(opts.level) || 1), domainId: apex ? apex.id : null,
            socialTier: 'independent', controlledBy: 'gm', placementRole: 'domain-npc' },
          { detailLevel: 'lightweight', seed: opts.seed });
        if(prop && prop.character) ch = prop.character;
      } catch(e){ ch = null; }
    }
    if(!ch && typeof A.blankCharacter === 'function'){
      ch = A.blankCharacter({ name: _stubName(opts.seed), level: Math.max(1, Number(opts.level) || 1),
        detailLevel: 'lightweight', socialTier: 'independent', controlledBy: 'gm' });
    }
    if(!ch || !ch.id) return null;
    if(opts.name) ch.name = opts.name;
    if(apex && !ch.currentDomainId) ch.currentDomainId = apex.id;
    ch.placementRole = ch.placementRole || 'domain-npc';
    if(!campaign.characters.some(x => x && x.id === ch.id)) campaign.characters.push(ch);
    return ch;
  }

  // POPULATE — name every vote (idempotent; fills only the gap). For each leading senator mint (votes-1
  // − existing clients) client stubs; mint (independentMinorSenatorVotes − existing named) independent
  // stubs. Leaves the rolled vote COUNTS authoritative (does not reconcile down on a mint shortfall — a
  // shortfall just leaves an unnamed remainder the UI shows). Returns { ok, clientsMinted, independentsMinted }.
  function populateNamedSenators(campaign, senateId, opts){
    opts = opts || {};
    const senate = (opts.senate && opts.senate.id) ? opts.senate : findSenate(campaign, senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const base = (typeof _polHash32 === 'function') ? _polHash32((apex ? apex.id : 'x') + '|pop|' + senate.id) : 1;
    let clientsMinted = 0, independentsMinted = 0;
    senatorshipsForSenate(campaign, senate.id).filter(s => s.rank !== 'minor').forEach((seat, si) => {
      if(!Array.isArray(seat.clientCharacterIds)) seat.clientCharacterIds = [];
      const want = Math.max(0, (Number(seat.votes) || 1) - 1);
      for(let k = seat.clientCharacterIds.length; k < want; k++){
        const ch = _mintSenatorStub(campaign, apex, { level: senate.minSenatorLevel, seed: base + '|c|' + si + '|' + k });
        if(ch){ seat.clientCharacterIds.push(ch.id); clientsMinted++; }
      }
    });
    if(!Array.isArray(senate.independentSenatorCharacterIds)) senate.independentSenatorCharacterIds = [];
    const wantInd = Math.max(0, Number(senate.independentMinorSenatorVotes) || 0);
    for(let k = senate.independentSenatorCharacterIds.length; k < wantInd; k++){
      const ch = _mintSenatorStub(campaign, apex, { level: senate.minSenatorLevel || 1, seed: base + '|i|' + k });
      if(ch){ senate.independentSenatorCharacterIds.push(ch.id); independentsMinted++; }
    }
    if(clientsMinted || independentsMinted){
      if(!Array.isArray(senate.history)) senate.history = [];
      senate.history.push({ turn: campaign.currentTurn || 1, type: 'senators-named', clientsMinted, independentsMinted });
    }
    return { ok:true, clientsMinted, independentsMinted };
  }

  // Where does a character currently sit in a senate? → { where:'client', seat } | { where:'independent' }
  // | { where:'leading', seat } | null. The drag-drop / remove primitives resolve the source via this.
  function _locateSenator(campaign, senate, characterId){
    if(!senate || !characterId) return null;
    for(const s of senatorshipsForSenate(campaign, senate.id)){
      if(s.senatorCharacterId === characterId && s.rank !== 'minor') return { where:'leading', seat: s };
      if(Array.isArray(s.clientCharacterIds) && s.clientCharacterIds.indexOf(characterId) >= 0) return { where:'client', seat: s };
    }
    if(Array.isArray(senate.independentSenatorCharacterIds) && senate.independentSenatorCharacterIds.indexOf(characterId) >= 0)
      return { where:'independent' };
    return null;
  }

  // MOVE a client/independent senator (the drag-drop primitive): detach from wherever they are and attach
  // to the destination — `to` = a leading senatorship id (becomes its client) | 'independent'. Reconciles
  // the affected vote mirrors. Refuses to move a LEADING senator (use retireLeadingSenator). Idempotent
  // (a no-op move returns ok). Returns { ok, from, to } | { ok:false, reason }.
  function moveSenatorClient(campaign, opts){
    opts = opts || {};
    const senate = (opts.senate && opts.senate.id) ? opts.senate : findSenate(campaign, opts.senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const charId = opts.characterId;
    const loc = _locateSenator(campaign, senate, charId);
    if(!loc) return { ok:false, reason:'not-in-senate' };
    if(loc.where === 'leading') return { ok:false, reason:'is-leading' };   // retire, don't drag
    const toIndependent = (opts.to === 'independent' || opts.toIndependent === true);
    const destSeat = toIndependent ? null : (findSenatorship(campaign, opts.to || opts.toPatronSeatId));
    if(!toIndependent && (!destSeat || destSeat.senateId !== senate.id || destSeat.rank === 'minor'))
      return { ok:false, reason:'bad-destination' };
    // detach from source
    if(loc.where === 'client'){
      loc.seat.clientCharacterIds = (loc.seat.clientCharacterIds || []).filter(id => id !== charId);
      _reconcileLeadingVotes(loc.seat);
    } else { // independent
      senate.independentSenatorCharacterIds = (senate.independentSenatorCharacterIds || []).filter(id => id !== charId);
    }
    // attach to destination
    if(toIndependent){
      if(!Array.isArray(senate.independentSenatorCharacterIds)) senate.independentSenatorCharacterIds = [];
      if(senate.independentSenatorCharacterIds.indexOf(charId) < 0) senate.independentSenatorCharacterIds.push(charId);
    } else {
      if(!Array.isArray(destSeat.clientCharacterIds)) destSeat.clientCharacterIds = [];
      if(destSeat.clientCharacterIds.indexOf(charId) < 0) destSeat.clientCharacterIds.push(charId);
      _reconcileLeadingVotes(destSeat);
    }
    _reconcileSenateIndependents(senate);
    return { ok:true, from: loc.where, to: toIndependent ? 'independent' : destSeat.id };
  }

  // ADD a fresh leading senator (Edit Senate ▸ + Leading senator): mint a lightweight, expandable senator
  // Character + seat them (votes 1, no clients yet) in the optional faction. Returns the senatorship | null.
  function addLeadingSenator(campaign, senateId, opts){
    opts = opts || {};
    const senate = findSenate(campaign, senateId);
    if(!senate) return null;
    const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const turn = campaign.currentTurn || 1;
    let charId = opts.characterId || null;
    if(!charId){
      const ch = _mintSenatorStub(campaign, apex, { level: senate.minSenatorLevel || 1, name: opts.name || null,
        seed: ((typeof _polHash32==='function')?_polHash32(senate.id+'|add-leading|'+((senate.history||[]).length)):1) });
      if(!ch) return null;
      charId = ch.id;
    }
    const seat = blankSenatorship({ senatorCharacterId: charId, senateId: senate.id, rank: 'leading', votes: 1,
      factionId: opts.factionId || null, policyObjectives: Array.isArray(opts.policyObjectives) ? opts.policyObjectives.slice() : [],
      seatedAtTurn: turn, history: [{ turn, type: 'added-leading' }] });
    if(!Array.isArray(campaign.senatorships)) campaign.senatorships = [];
    campaign.senatorships.push(seat);
    return seat;
  }

  // RETIRE a leading senator (Edit Senate ▸ retire): vacate the seat; its clients become independent minor
  // senators (they keep voting; the patron's own vote leaves the senate). Returns the vacated seat | null.
  function retireLeadingSenator(campaign, seatId, opts){
    opts = opts || {};
    const seat = findSenatorship(campaign, seatId);
    if(!seat || seat.rank === 'minor') return null;
    const senate = findSenate(campaign, seat.senateId);
    const turn = campaign.currentTurn || 1;
    const clients = Array.isArray(seat.clientCharacterIds) ? seat.clientCharacterIds.slice() : [];
    if(senate && clients.length){
      if(!Array.isArray(senate.independentSenatorCharacterIds)) senate.independentSenatorCharacterIds = [];
      clients.forEach(id => { if(senate.independentSenatorCharacterIds.indexOf(id) < 0) senate.independentSenatorCharacterIds.push(id); });
      _reconcileSenateIndependents(senate);
    }
    seat.clientCharacterIds = [];
    seat.status = 'vacated';
    seat.vacatedAtTurn = turn;
    if(!Array.isArray(seat.history)) seat.history = [];
    seat.history.push({ turn, type: 'retired', clientsReleased: clients.length });
    return seat;
  }

  // ADD independent minor senators (Edit Senate ▸ + Independent): mint `count` lightweight senators into
  // the named-independent list + reconcile the count. Returns { ok, minted }.
  function addIndependentSenators(campaign, senateId, opts){
    opts = opts || {};
    const senate = findSenate(campaign, senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const apex = senate.realmDomainId ? _findDomain(campaign, senate.realmDomainId) : null;
    const count = Math.max(1, Math.round(Number(opts.count) || 1));
    if(!Array.isArray(senate.independentSenatorCharacterIds)) senate.independentSenatorCharacterIds = [];
    let minted = 0;
    const base = (typeof _polHash32==='function') ? _polHash32(senate.id+'|add-ind|'+senate.independentSenatorCharacterIds.length) : 1;
    for(let k = 0; k < count; k++){
      const ch = _mintSenatorStub(campaign, apex, { level: senate.minSenatorLevel || 1, seed: base + '|' + k });
      if(ch){ senate.independentSenatorCharacterIds.push(ch.id); minted++; }
    }
    _reconcileSenateIndependents(senate);
    return { ok:true, minted };
  }

  // REMOVE a client/independent senator from the senate entirely (Edit Senate ▸ ×). Un-seats the vote;
  // the Character persists (a realm NPC — delete via Inspector if unwanted). Refuses a leading senator.
  function removeSenatorFromSenate(campaign, opts){
    opts = opts || {};
    const senate = (opts.senate && opts.senate.id) ? opts.senate : findSenate(campaign, opts.senateId);
    if(!senate) return { ok:false, reason:'no-senate' };
    const loc = _locateSenator(campaign, senate, opts.characterId);
    if(!loc || loc.where === 'leading') return { ok:false, reason: loc ? 'is-leading' : 'not-in-senate' };
    if(loc.where === 'client'){
      loc.seat.clientCharacterIds = (loc.seat.clientCharacterIds || []).filter(id => id !== opts.characterId);
      _reconcileLeadingVotes(loc.seat);
    } else {
      senate.independentSenatorCharacterIds = (senate.independentSenatorCharacterIds || []).filter(id => id !== opts.characterId);
      _reconcileSenateIndependents(senate);
    }
    return { ok:true, from: loc.where };
  }

  // ── Faction edits (Edit Senate) — add / remove (members go independent-of-faction) / rename ──
  function addSenateFaction(campaign, senateId, opts){
    opts = opts || {};
    const senate = findSenate(campaign, senateId);
    if(!senate) return null;
    const fac = blankFaction({ name: opts.name || 'New faction', platform: opts.platform || '',
      senateId: senate.id, realmDomainId: senate.realmDomainId || null,
      policyObjectives: Array.isArray(opts.policyObjectives) ? opts.policyObjectives.slice() : [] });
    if(!Array.isArray(campaign.factions)) campaign.factions = [];
    campaign.factions.push(fac);
    return fac;
  }
  function removeSenateFaction(campaign, factionId){
    const fac = findFaction(campaign, factionId);
    if(!fac) return null;
    senatorshipsInFaction(campaign, factionId).forEach(s => { s.factionId = null; });
    fac.status = 'dissolved';
    return fac;
  }
  function renameSenateFaction(campaign, factionId, name){
    const fac = findFaction(campaign, factionId);
    if(!fac) return null;
    fac.name = (name == null) ? fac.name : String(name);
    return fac;
  }
  // Thin senatorship setters (Edit Senate) — faction reassignment + the policy-objective edit.
  function setSenatorshipFaction(campaign, seatId, factionId){
    const seat = findSenatorship(campaign, seatId);
    if(!seat) return null;
    seat.factionId = factionId || null;
    return seat;
  }
  function setSenatorshipObjectives(campaign, seatId, objectives){
    const seat = findSenatorship(campaign, seatId);
    if(!seat) return null;
    seat.policyObjectives = Array.isArray(objectives) ? objectives.slice() : [];
    return seat;
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
    resolveDisputeByConsult, abandonSenatorialGovernment, canReestablishSenate, reestablishSenate,
    // P-5 — the motion layer (the guided Senate Wizard's engine; burst9)
    SENATE_MOTION_KINDS, blankSenateMotion,
    senateMotionsForSenate, findSenateMotion,
    openSenateMotion, previewSenateMotionVote, previewSenateMotionModifiers, resolveSenateMotion, withdrawSenateMotion,
    senateInHoneymoon,
    // P-7 — Eldermoot vocabulary + the rule-of-the-few oligarchy mode (burst10)
    RULE_OF_THE_FEW, SENATE_KINDS, OLIGARCHY_DECISION_RULES,
    isEldermoot, senateKindLabel,
    establishOligarchy, dissolveOligarchy, secedeFromOligarchy, resolveOligarchyDecision,
    // === Politics P-7 wizard (burst11) === — the generative Senate-Materialization Wizard
    SENATE_SIZE_BANDS, SENATE_CHARACTERISTICS, REQUIREMENTS_OF_OFFICE,
    senateSizeBandForFamilies, senateCharacteristicsForSeats, requirementsOfOfficeForLevel,
    senateMaterializeCandidates, proposeSenateMaterialization, materializeSenate,
    // Phase 5 (2026-06-24) — the named-senator composition (one named senator per vote) + Edit Senate verbs
    senateIsFullyNamed, populateNamedSenators,
    moveSenatorClient, addLeadingSenator, retireLeadingSenator, addIndependentSenators, removeSenatorFromSenate,
    addSenateFaction, removeSenateFaction, renameSenateFaction, setSenatorshipFaction, setSenatorshipObjectives
  });

})(typeof window !== 'undefined' ? window : global);
