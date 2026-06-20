/* =============================================================================
 * acks-engine-gladiators.js — ACKS God Mode Gladiators (#150, G1 — the data layer)
 *
 * AXIOMS Issue 4 "Morituri Te Salutant" (pp.20–31): the gladiatorial-school + games
 * MANAGEMENT subsystem. G1 ships the foundation — the three first-class entities
 * (Bout bot- / Gladiator School gld- / Game gam-), their factories + lookups + create
 * setters (IN THIS MODULE, not entities.js), the reference catalogs, the gladiator-as-
 * Character helpers (defensive — socialTier:'gladiator', NO blankCharacter edit), and the
 * abstract 1d10 bout resolver (RAW p.25). Build view: Phase_4_Gladiators_Plan.md §3+§5
 * (G1 row). RAW substrate: Gladiators_RAW_Survey.md.
 *
 * SCOPE (G1 — DATA LAYER, INSPECTOR-ONLY). No bespoke Gladiators tab/modal — the entities
 * are Browsable/Inspectable/creatable through the generic Inspector (registry + field-schemas
 * + the inspectorCreateBlank* dispatch). The school business loop, training clock, uprisings,
 * sponsoring, the amphitheater Constructible, and the tactical (Combat-Option-B) bout are
 * G2–G6 — NOT here. The abstract resolver is pure (returns the result; a future wave commits it
 * to a bout + emits the reserved `bout-resolved` event — see the SUMMARY's doc-delta).
 *
 * POLARITY (CLAUDE §6): AXIOMS 4 is a SUPPLEMENT → the whole loop rides the default-OFF
 * `gladiator-games` house rule (registered in acks-engine-catalogs.js, category 'cultural').
 * The gladiator-socialTier DATA is ungated core (survey §6.2 — a GM may flag an NPC a gladiator
 * for flavor with the rule off). In G1 the rule gates the LIVE mechanic — resolveBoutAbstract
 * refuses when off — so the toggle is non-inert (smoke-tested both ways). The entity factories
 * are ungated (the createVessel/createArmy precedent — the Inspector is the admin escape hatch;
 * the caller gates).
 *
 * SOURCE + IP (CLAUDE.md §13.6; ⚠ AXIOMS-4 data — the standing Autarch-content precedent the
 * shipped Elite Troops set): mechanical values only, page-cited, NO rule prose. Where the survey
 * gives a formula (rent 60%/62.5%, prize 20%, ×2 death-bout) rather than per-row table cells, the
 * values are DERIVED from the cited formula, not invented. Tables the survey names but does not
 * transcribe (per-type combat stats; the type-vs-type match-up grid; the amphitheater size-by-class
 * grid; the exact crowd-reaction 2d6 ranges) are FLAGGED for a G2+ PDF-transcription pass rather
 * than guessed (cartography-before-mechanics) — see the per-catalog notes below.
 *
 * Load order: AFTER acks-engine.js (newId / ID_PREFIXES / SCHEMA_VERSION / isHouseRuleEnabled).
 * A fresh acks-engine-*.js loads after the core (tests/_engine.js auto-discovers it; index.html
 * adds the <script> at the burst5 b5-gladiators marker, before player-view). Self-contained: pure
 * reads/setters over a passed campaign, late-bound on global.ACKS (the entities.js/voyages idiom).
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // Late-bound core helpers (this module loads after acks-engine.js; reference at call time so we
  // never depend on load order beyond "core is present"). Mirrors the voyages.js / entities.js idiom.
  function _A(){ return global.ACKS || ACKS; }
  function _newId(prefixKey, fallback){
    const A = _A();
    const prefix = (A.ID_PREFIXES && A.ID_PREFIXES[prefixKey]) || fallback;
    return (typeof A.newId === 'function') ? A.newId(prefix) : (prefix + '-' + Math.random().toString(36).slice(2, 9));
  }
  function _schemaVersion(){
    const A = _A();
    return (typeof A.SCHEMA_VERSION === 'number') ? A.SCHEMA_VERSION : 2;
  }
  function _ruleOn(campaign, id){
    const A = _A();
    return (typeof A.isHouseRuleEnabled === 'function') ? !!A.isHouseRuleEnabled(campaign, id) : false;
  }

  // ── Module constants (the AXIOMS-4 economy spine; page-cited) ───────────────
  const GLADIATORS_PER_URBAN_FAMILIES   = 150;   // demographics: 1 gladiator / 150 urban families, Class IV+ (p.20)
  const MAX_GLADIATORS_PER_FAMILIES     = 150;   // a school holds ≤ 1 gladiator / 150 settlement families (p.23)
  const CANDIDATES_PER_FAMILIES_MONTH   = 450;   // ~1 candidate / 450 families / month (p.23)
  const CANDIDATE_COST_GP               = 40;    // buy a candidate / impress a prisoner: 40gp (p.23)
  const UPKEEP_GP_PER_MONTH             = 2;     // gladiator upkeep, gp/month (p.23, p.25)
  const FREEDOM_VICTORIES               = 10;    // freed at 10 victories … (p.20)
  const FREEDOM_BOUTS                   = 15;    // … OR 15 bouts (p.20)
  const RENT_PCT_ORDINARY               = 0.60;  // lanista rents at 60% of value (ordinary, p.20)
  const RENT_PCT_VETERAN                = 0.625; // 62.5% for veterans + champions (p.20)
  const DEATH_BOUT_RENT_MULT            = 2;     // a bout-to-the-death rents at 2× (p.20)
  const VICTORY_PRIZE_PCT               = 0.20;  // the gladiator's prize = 20% of the rental fee (p.20)
  const RENTS_PER_YEAR                  = 3;     // a gladiator rents ~3×/year; more risks an uprising (p.20, p.25)
  const THRASSIAN_VALUE_MULT            = 1.20;  // Thrassian gladiators are worth +20% (p.29)
  const AMPHITHEATER_COST_PER_SEAT_GP   = 15;    // amphitheater build cost = seats × 15gp (p.22)
  const AMPHITHEATER_MIN_MARKET_CLASS   = 4;     // no amphitheater below Class IV (p.21) — class is the Roman-numeral order (IV = 4)
  const SPONSOR_MIN_GP_PER_FAMILY       = 0.5;   // a munerator spends ≥ 0.5gp / urban family (p.22)
  const MAX_BOUTS_PER_DAY               = 12;    // a game stages ≤ 12 bouts per day (p.22)
  const SIDE_VALUE_TOLERANCE            = 0.10;  // a match's two sides must be ≈equal gp value (±10%) (p.22)
  const BUY_TRAINED_REACTION_TARGET     = 9;     // buying a trained gladiator needs reaction 9+ (p.23)

  // ── GLADIATOR_RANKS — gp value + demographics by class/level (p.20) ─────────
  // Rank is derived from level: 0 = Ordinary, 1–2 = Veteran, 3–5 = Champion. The gp VALUES are
  // the printed table (verified: 250 / 425 / 900 / 1,800 / 3,600 / 7,200). demographicPct is the
  // printed split for 0/1/2 (50 / 35 / 9); levels 3–5 share the ~6% remainder (RAW gives no precise
  // per-level split — left null, not invented). rentPct is the formula value (0.60 ordinary, 0.625
  // veteran+champion); the rental fee is DERIVED (gladiatorRentFee), not a transcribed cell.
  const GLADIATOR_RANKS = [
    { level:0, rank:'ordinary',  gpValue:250,  demographicPct:50,   rentPct:RENT_PCT_ORDINARY, page:20 },
    { level:1, rank:'veteran',   gpValue:425,  demographicPct:35,   rentPct:RENT_PCT_VETERAN,  page:20 },
    { level:2, rank:'veteran',   gpValue:900,  demographicPct:9,    rentPct:RENT_PCT_VETERAN,  page:20 },
    { level:3, rank:'champion',  gpValue:1800, demographicPct:null, rentPct:RENT_PCT_VETERAN,  page:20 }, // levels 3–5 share the ~6% remainder
    { level:4, rank:'champion',  gpValue:3600, demographicPct:null, rentPct:RENT_PCT_VETERAN,  page:20 },
    { level:5, rank:'champion',  gpValue:7200, demographicPct:null, rentPct:RENT_PCT_VETERAN,  page:20 }
  ].map(Object.freeze);
  Object.freeze(GLADIATOR_RANKS);
  const GLADIATOR_RANK_BY_LEVEL = {};
  for(const r of GLADIATOR_RANKS){ GLADIATOR_RANK_BY_LEVEL[r.level] = r; }

  // ── GLADIATOR_TYPES — the seven fighting styles (p.21) ──────────────────────
  // The Roman style names (the survey lists all seven). ⚠ The per-type combat stats (ENC/MV/AC/
  // HD/#AT/DMG/ML), the granted proficiency, and the equipment kit are NOT transcribed in the survey
  // — flagged for a G2 PDF-transcription pass (G2 training + G4 match-ups read them). The equipment
  // itself lives in the shipped RR EQUIPMENT_CATALOG (cestus/net/helmets/arena-armor); read it there.
  // The 7-row COUNT is the G1-verifiable RAW fact (acceptance: "7 types").
  const GLADIATOR_TYPES = [
    { key:'spearfighter', label:'Spearfighter', latinName:'Hoplomachus', page:21 },
    { key:'challenger',   label:'Challenger',   latinName:'Provocator',  page:21 },
    { key:'striker',      label:'Striker',      latinName:'Thraex',      page:21 },
    { key:'shieldbearer', label:'Shieldbearer', latinName:'Murmillo',    page:21 },
    { key:'pursuer',      label:'Pursuer',      latinName:'Secutor',     page:21 },
    { key:'netfighter',   label:'Netfighter',   latinName:'Retiarius',   page:21 },
    { key:'dualwielder',  label:'Dualwielder',  latinName:'Dimachaerus', page:21 }
  ].map(Object.freeze);
  Object.freeze(GLADIATOR_TYPES);
  const GLADIATOR_TYPE_BY_KEY = {};
  for(const t of GLADIATOR_TYPES){ GLADIATOR_TYPE_BY_KEY[t.key] = t; }

  // ── GLADIATOR_SCHOOL_STAFF — staffing requirements + wages (p.24) ───────────
  // ratio = one staffer per N of the counted thing (gladiators or creatures). wageGp is the monthly
  // wage (the healer/chirugeon runs part-time in a small school at 2gp/gladiator/month — that variant
  // is a G2 staffing-loop detail). A school may only train a type whose trainer it employs (p.24).
  const GLADIATOR_SCHOOL_STAFF = [
    { role:'creature-handler',   counts:'creatures',  ratio:6,   wageGp:25,  wageMaxGp:250, page:24 }, // 1 per 6 creatures, 25–250gp
    { role:'trainer-ordinary',   counts:'gladiators', ratio:6,   wageGp:60,  page:24 },                // 1 per 6 gladiators, 60gp
    { role:'trainer-master',     counts:'gladiators', ratio:120, wageGp:250, page:24 },                // 1 per 120 gladiators, 250gp
    { role:'guard',              counts:'gladiators', ratio:20,  wageGp:25,  page:24 },                // 1 per 20 gladiators, 25gp (more reduce uprising risk)
    { role:'healer',             counts:'gladiators', ratio:60,  wageGp:100, page:24 }                 // 1 per 60 gladiators, 100gp (part-time 2gp/glad/mo in small schools)
  ].map(Object.freeze);
  Object.freeze(GLADIATOR_SCHOOL_STAFF);

  // ── GLADIATOR_SCHOOL_STRUCTURES — the school buildings (p.24) ───────────────
  // costGp is the per-unit / flat cost; `per` names the unit. Wood by default; stone = 2× (a G2
  // build detail). The menagerie cost is 10% of the housed creatures' value (a derived per-school
  // figure, not a flat cost). These land as Constructibles (constructibleKind:'gladiator-school') in G2.
  const GLADIATOR_SCHOOL_STRUCTURES = [
    { key:'specialist-barracks', label:'Specialist barracks', costGp:30, per:'flat',                 page:24 },
    { key:'guard-barracks',      label:'Guard barracks',      costGp:25, per:'guard',                page:24 },
    { key:'gladiator-barracks',  label:'Gladiator barracks',  costGp:15, per:'gladiator',            page:24 },
    { key:'training-pit',        label:'Training pit',        costGp:12, per:'gladiator',            page:24 },
    { key:'menagerie',           label:'Menagerie',           costPctOfCreatureValue:0.10, per:'creature-value', page:24 }
  ].map(Object.freeze);
  Object.freeze(GLADIATOR_SCHOOL_STRUCTURES);

  // ── GLADIATOR_TRAINING — the candidate-training process (p.24–25) ───────────
  // 6–9 months by type (lighter armor = longer); graduate on a 1d20 (maimed/killed on a 1; unworthy
  // candidates fail 1–10). The simplified option is 6 months + 200gp. ⚠ The per-TYPE month figure
  // is not transcribed — flagged for G2 (it reads GLADIATOR_TYPES). The cost = upkeep + staff +
  // equipment, computed in the G2 training loop.
  const GLADIATOR_TRAINING = Object.freeze({
    minMonths: 6, maxMonths: 9,
    graduationDie: 20, maimOn: 1, unworthyFailMax: 10,
    simplifiedMonths: 6, simplifiedCostGp: 200,
    page: 25
  });

  // ── The abstract bout outcome — 1d10 per gladiator (p.25) ───────────────────
  // The entire business loop runs on this roll. Normal bout: 1–2 slain / 3–5 lose-but-survive /
  // 6–10 win. Death bout: 1–5 die / 6–10 win.
  const ABSTRACT_BOUT_OUTCOME = Object.freeze({
    normal: Object.freeze({ slainMax: 2, loseMax: 5 }),  // ≤2 slain, 3–5 lose, 6+ win
    death:  Object.freeze({ slainMax: 5, loseMax: 5 }),  // ≤5 die, 6+ win (no "lose-but-survive")
    page: 25
  });

  // ── GLADIATOR_UPRISING — the 2d6 loyalty cascade (p.26) ─────────────────────
  // Roll 2d6 + lanista morale + modifiers per gladiator on a spark. Bands (ascending): 2− Lead /
  // 3–5 Join / 6–8 Hesitate / 9–11 Stay Loyal / 12+ Stay Firmly Loyal. The full modifier set (CHA,
  // Intimidation, level, trainer/master-trainer, upkeep, guards, fault) + the lead/support cascade
  // are the G4 uprising loop. SPARKS is the trigger list.
  const GLADIATOR_UPRISING = Object.freeze({
    bands: Object.freeze([
      { max: 2,        result:'lead'         },  // 2 or less
      { max: 5,        result:'join'         },  // 3–5
      { max: 8,        result:'hesitate'     },  // 6–8
      { max: 11,       result:'loyal'        },  // 9–11
      { max: Infinity, result:'firmly-loyal' }   // 12+
    ]),
    sparks: Object.freeze(['kill-or-injure-for-no-reason','unpaid-prize','underpaid-upkeep','too-few-guards','over-rented','heavy-game-losses']),
    leadSupportThresholdPct: 25,  // a Lead result revolts when ≥25% of the school joins (p.26)
    page: 26
  });

  // ── CROWD_REACTION — the post-bout 2d6 verdict for a losing survivor (p.27) ──
  // The five printed outcomes (ascending). ⚠ The survey names the outcomes + the "+1 for regular
  // gladiators" modifier but does NOT transcribe the exact 2d6 ranges — these follow the standard
  // ACKS 2d6 reaction structure (2 / 3–5 / 6–8 / 9–11 / 12), FLAGGED for verification vs the PDF in
  // a G4 catalog-completion pass. Hateful → tortured death + refund; Bloodthirsty → slain; Uncertain
  // → munerator decides / reroll; Merciful & Enthusiastic → lives + may gain a sobriquet.
  const CROWD_REACTION = Object.freeze({
    bands: Object.freeze([
      { max: 2,        result:'hateful'      },  // 2
      { max: 5,        result:'bloodthirsty' },  // 3–5
      { max: 8,        result:'uncertain'    },  // 6–8
      { max: 11,       result:'merciful'     },  // 9–11
      { max: Infinity, result:'enthusiastic' }   // 12+
    ]),
    regularGladiatorBonus: 1,  // +1 to the roll for a regular (non-champion) gladiator (p.27)
    page: 27,
    rawRangesVerified: false   // ⚠ standard 2d6 structure assumed — verify vs PDF in G4
  });

  // ── Catalog lookups ─────────────────────────────────────────────────────────
  function gladiatorTypes(){ return GLADIATOR_TYPES.slice(); }
  function findGladiatorType(key){ return (key && GLADIATOR_TYPE_BY_KEY[key]) || null; }
  function isGladiatorType(key){ return !!findGladiatorType(key); }
  function gladiatorRanks(){ return GLADIATOR_RANKS.slice(); }
  function gladiatorRankRow(level){ return GLADIATOR_RANK_BY_LEVEL[Math.max(0, Math.min(5, level | 0))] || null; }
  // The named rank (ordinary | veteran | champion) for a class/level (0 / 1–2 / 3–5; p.20).
  function gladiatorRankForLevel(level){
    const r = gladiatorRankRow(level);
    return r ? r.rank : (level >= 3 ? 'champion' : (level >= 1 ? 'veteran' : 'ordinary'));
  }
  // The base gp value for a level (the printed GLADIATOR_RANKS cell). Clamped to 0–5.
  function gladiatorBaseGpValue(level){ const r = gladiatorRankRow(level); return r ? r.gpValue : 250; }
  // The rental fee for a level (DERIVED — value × rentPct, ×2 for a death-bout; p.20).
  function gladiatorRentFee(level, opts){
    opts = opts || {};
    const r = gladiatorRankRow(level); if(!r) return 0;
    const fee = r.gpValue * r.rentPct;
    return Math.round(fee * (opts.death ? DEATH_BOUT_RENT_MULT : 1));
  }
  // The gladiator's victory prize = 20% of the rental fee (p.20).
  function gladiatorVictoryPrize(level, opts){ return Math.round(gladiatorRentFee(level, opts) * VICTORY_PRIZE_PCT); }

  // ── Gladiator-as-Character helpers (DEFENSIVE — survey §3; NO blankCharacter edit) ──
  // A gladiator is a Character with socialTier:'gladiator' + gladiator fields (gladiatorType,
  // arenaMorale, lanistaMorale, victoriesWon, boutsSurvived, sobriquet, contractSchoolId, …) set
  // when the character becomes a gladiator (a G2+ setter, or the GM via the Inspector). Read those
  // fields defensively — present only on gladiators, absent otherwise (the five-axis discipline +
  // the team-session no-blankCampaign/no-inject rule, so templates stay migrate-no-ops).
  function isGladiator(ch){ return !!(ch && ch.socialTier === 'gladiator'); }
  function _charLevel(ch){ const n = ch && Number(ch.level); return Number.isFinite(n) ? Math.max(0, n) : 0; }
  // The character's gladiator rank (derived from level).
  function gladiatorRank(ch){ return gladiatorRankForLevel(_charLevel(ch)); }
  // The character's gp value as a gladiator (rank value + Thrassian +20% + magic-item base/33).
  // opts.thrassian → ×1.2 (p.29); opts.itemBaseGp → + itemBaseGp/33 (p.31). Falls back to a level
  // read on the character, so it works on any Character (the bout-XP path uses it on the loser).
  function gladiatorGpValue(ch, opts){
    opts = opts || {};
    let v = gladiatorBaseGpValue(_charLevel(ch));
    if(opts.thrassian || (ch && ch.gladiatorIsThrassian)) v = Math.round(v * THRASSIAN_VALUE_MULT);
    if(opts.itemBaseGp) v += Math.round(opts.itemBaseGp / 33);
    return v;
  }
  // Has this gladiator earned freedom? (10 victories OR 15 bouts; p.20). Defensive reads.
  function gladiatorEarnedFreedom(ch){
    if(!ch) return false;
    return (Number(ch.victoriesWon) || 0) >= FREEDOM_VICTORIES || (Number(ch.boutsSurvived) || 0) >= FREEDOM_BOUTS;
  }
  // The max gladiators a settlement of N families can support (1 / 150 families; p.23).
  function maxGladiatorsForFamilies(families){ return Math.floor((Number(families) || 0) / MAX_GLADIATORS_PER_FAMILIES); }
  // The amphitheater build cost for a seat count (seats × 15gp; p.22).
  function amphitheaterCostGp(seats){ return (Number(seats) || 0) * AMPHITHEATER_COST_PER_SEAT_GP; }

  // ════════════════════════════════════════════════════════════════════════════
  // ENTITIES — Bout (bot-) · Gladiator School (gld-) · Game (gam-)
  // Factories + create setters + lookups all live HERE (constraint 5 — not entities.js).
  // Every blankX key that the field-schema lists is emitted (the global schema⊆factory invariant).
  // createX is init-on-write (no migrateCampaign injector → templates stay migrate-no-ops) and
  // UNGATED (the createVessel/createArmy precedent — the Inspector admin path + the future business
  // loop both use it; the rule gates the resolver, not the factory).
  // ════════════════════════════════════════════════════════════════════════════

  // ── Bout (campaign.bouts[], prefix bot-; plan §3.2; §3.1 test 4/5) ──────────
  function blankBout(opts){
    opts = opts || {};
    const sideKind = s => (s && typeof s === 'object') ? {
      combatantIds: Array.isArray(s.combatantIds) ? s.combatantIds.slice() : [],
      kind: s.kind || 'gladiator'        // 'gladiator' | 'creature' | 'prisoner'
    } : { combatantIds: [], kind: 'gladiator' };
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newId('bout', 'bot'),
      gameId: opts.gameId || null,            // → the Game/Munus (or null for a one-off)
      kind: opts.kind || 'to-incapacitation', // 'to-incapacitation' | 'to-death'
      sideA: sideKind(opts.sideA),
      sideB: sideKind(opts.sideB),
      rentPaidGp: Number(opts.rentPaidGp) || 0,
      status: opts.status || 'scheduled',     // 'scheduled' | 'resolved'
      result: opts.result || null,            // set by resolveBoutAbstract (deep record; not GM-edited)
      resolutionMode: opts.resolutionMode || 'abstract', // 'abstract' | 'combat'
      createdAtTurn: (opts.createdAtTurn != null) ? opts.createdAtTurn : null,
      notes: opts.notes || '',
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }
  function createBout(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const b = blankBout(opts || {});
    if(!Array.isArray(campaign.bouts)) campaign.bouts = [];
    campaign.bouts.push(b);
    return b;
  }

  // ── Gladiator School / Stable (campaign.gladiatorSchools[], gld-; plan §3.6; test 3/5) ──
  function blankGladiatorSchool(opts){
    opts = opts || {};
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newId('gladiatorSchool', 'gld'),
      name: opts.name || '',
      lanistaCharacterId: opts.lanistaCharacterId || null,   // the owner (a Character; the "lanista" role)
      settlementId: opts.settlementId || null,                // where it operates
      gladiatorCharacterIds: Array.isArray(opts.gladiatorCharacterIds) ? opts.gladiatorCharacterIds.slice() : [], // the roster
      staffCharacterIds: Array.isArray(opts.staffCharacterIds) ? opts.staffCharacterIds.slice() : [],             // trainers/guards/healers/handlers (hirelings)
      structureConstructibleIds: Array.isArray(opts.structureConstructibleIds) ? opts.structureConstructibleIds.slice() : [], // school buildings (Constructibles)
      treasuryStashId: opts.treasuryStashId || null,          // the school's coffers (a Stash)
      uprisingState: opts.uprisingState || null,              // transient uprising bookkeeping (G4; deep record)
      status: opts.status || 'active',                        // 'active' | 'disbanded'
      foundedAtTurn: (opts.foundedAtTurn != null) ? opts.foundedAtTurn : null,
      notes: opts.notes || '',
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }
  function createGladiatorSchool(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const s = blankGladiatorSchool(opts || {});
    if(!Array.isArray(campaign.gladiatorSchools)) campaign.gladiatorSchools = [];
    campaign.gladiatorSchools.push(s);
    return s;
  }

  // ── Game / Munus (campaign.games[], gam-; plan §3.3; test 3/5) ──────────────
  function blankGame(opts){
    opts = opts || {};
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newId('game', 'gam'),
      name: opts.name || '',                  // the munus name, for display (the survey's games are named events)
      settlementId: opts.settlementId || null, // where it's held (the amphitheater's settlement)
      amphitheaterConstructibleId: opts.amphitheaterConstructibleId || null, // the venue (a Constructible)
      muneratorCharacterId: opts.muneratorCharacterId || null, // the sponsor (a role, not an entity)
      budgetGp: Number(opts.budgetGp) || 0,    // ≥ 0.5gp/urban-family (the festival/liturgy expense)
      scheduledTurn: (opts.scheduledTurn != null) ? opts.scheduledTurn : null, // light G1 scheduling hook (full calendar date is G4)
      boutIds: Array.isArray(opts.boutIds) ? opts.boutIds.slice() : [], // ≤12 bouts/day
      status: opts.status || 'planned',        // 'planned' | 'held'
      createdAtTurn: (opts.createdAtTurn != null) ? opts.createdAtTurn : null,
      notes: opts.notes || '',
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }
  function createGame(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const g = blankGame(opts || {});
    if(!Array.isArray(campaign.games)) campaign.games = [];
    campaign.games.push(g);
    return g;
  }

  // ── Instance lookups (defensive — absent collection reads as []) ────────────
  function _bouts(c){ return (c && Array.isArray(c.bouts)) ? c.bouts : []; }
  function _schools(c){ return (c && Array.isArray(c.gladiatorSchools)) ? c.gladiatorSchools : []; }
  function _games(c){ return (c && Array.isArray(c.games)) ? c.games : []; }
  function findBout(c, id){ return id ? (_bouts(c).find(b => b && b.id === id) || null) : null; }
  function boutsForGame(c, gameId){ return gameId ? _bouts(c).filter(b => b && b.gameId === gameId) : []; }
  function findGladiatorSchool(c, id){ return id ? (_schools(c).find(s => s && s.id === id) || null) : null; }
  function gladiatorSchoolsInSettlement(c, settlementId){ return settlementId ? _schools(c).filter(s => s && s.settlementId === settlementId) : []; }
  function gladiatorSchoolsOfLanista(c, characterId){ return characterId ? _schools(c).filter(s => s && s.lanistaCharacterId === characterId) : []; }
  function findGame(c, id){ return id ? (_games(c).find(g => g && g.id === id) || null) : null; }
  function gamesInSettlement(c, settlementId){ return settlementId ? _games(c).filter(g => g && g.settlementId === settlementId) : []; }
  // The roster gladiator Characters of a school (ids → campaign.characters[]).
  function gladiatorsOfSchool(campaign, school){
    if(!campaign || !school) return [];
    const chars = campaign.characters || [];
    return (school.gladiatorCharacterIds || []).map(id => chars.find(c => c && c.id === id)).filter(Boolean);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // THE ABSTRACT BOUT RESOLVER (RAW p.25 — the business-loop 1d10)
  // Pure: reads the campaign (for the house-rule gate + resolving combatant Characters for XP),
  // returns the result object; does NOT mutate the bout/campaign (a future wave commits the
  // result + emits the reserved `bout-resolved` event). GATES on `gladiator-games` — refuses when
  // off — which is what makes the rule non-inert in G1 (smoke-tested both ways).
  // ════════════════════════════════════════════════════════════════════════════

  // The core per-gladiator 1d10 → 'won' | 'lost' | 'slain' (p.25). Pure primitive.
  function rollGladiatorBoutOutcome(opts){
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const roll = opts.roll || (1 + Math.floor(rng() * 10)); // 1d10
    const t = opts.death ? ABSTRACT_BOUT_OUTCOME.death : ABSTRACT_BOUT_OUTCOME.normal;
    let outcome;
    if(roll <= t.slainMax) outcome = 'slain';
    else if(roll <= t.loseMax) outcome = 'lost';     // (death bouts have no "lost" band — slainMax == loseMax)
    else outcome = 'won';
    return { roll, outcome };
  }
  function _bandLookup(bands, total){ for(const b of bands){ if(total <= b.max) return b.result; } return bands[bands.length - 1].result; }
  // The post-bout crowd reaction for a losing survivor (2d6 → CROWD_REACTION band; p.27).
  function rollCrowdReaction(opts){
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const d6 = () => 1 + Math.floor(rng() * 6);
    const base = (opts.roll != null) ? opts.roll : (d6() + d6());
    const total = base + (opts.regularGladiator ? CROWD_REACTION.regularGladiatorBonus : 0);
    return { roll: total, result: _bandLookup(CROWD_REACTION.bands, total) };
  }

  // Resolve a bout abstractly. Returns { ok, reason?, result? }.
  // result = { winnerSide:'A'|'B', d10, death, casualties[], crowdReaction, xpAwarded[],
  //            sobriquetsAwarded[], prizesPaidGp[], wagersSettled[] } (the plan §3.2 shape; the last
  //            three are G3/G4 — empty in G1). The 1d10 is read from sideA's perspective (the survey's
  //            per-gladiator roll applied to the bout): 1–2 slain / 3–5 lose / 6–10 win (death: 1–5 die /
  //            6–10 win). XP to the winners = the defeated side's gladiator gp value (p.28).
  function resolveBoutAbstract(campaign, bout, opts){
    if(!bout || typeof bout !== 'object') return { ok:false, reason:'no-bout' };
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const death = bout.kind === 'to-death';
    const o = rollGladiatorBoutOutcome({ rng, death, roll: opts.roll });
    const aWon = o.outcome === 'won';
    const winnerSide = aWon ? 'A' : 'B';
    const loserSide  = aWon ? 'B' : 'A';
    const aOutcome = o.outcome;                            // sideA's fate
    const loserOutcome = death ? 'slain' : (aWon ? 'lost' : aOutcome === 'slain' ? 'slain' : 'lost');

    const chars = (campaign && campaign.characters) || [];
    const idsOf = side => (side && Array.isArray(side.combatantIds)) ? side.combatantIds : [];
    const winnerIds = aWon ? idsOf(bout.sideA) : idsOf(bout.sideB);
    const loserIds  = aWon ? idsOf(bout.sideB) : idsOf(bout.sideA);

    // Casualties: every loser combatant takes the loser outcome (slain in a death bout, else slain
    // when sideA was slain in a normal bout, else incapacitated/survived). v1 maps the abstract band:
    // 'slain' → slain; 'lost' → survived (the Mortal-Wounds roll for incapacitated survivors is the
    // shared aftermath the G3 wave wires to Delves D1 — out of G1 scope).
    const casualties = loserIds.map(id => ({
      characterId: id,
      side: loserSide,
      outcome: loserOutcome === 'slain' ? 'slain' : 'survived'
    }));

    // XP to the winners = the gp value of the defeated opponent(s) (p.28).
    const defeatedValue = loserIds.reduce((sum, id) => {
      const c = chars.find(x => x && x.id === id);
      return sum + (c ? gladiatorGpValue(c) : 0);
    }, 0);
    const xpAwarded = winnerIds.map(id => ({ characterId: id, xp: defeatedValue }));

    // Crowd reaction for the losing survivors (only when they survived).
    let crowdReaction = null;
    if(loserOutcome !== 'slain' && loserIds.length){
      crowdReaction = rollCrowdReaction({ rng, regularGladiator: true }).result;
    }

    return {
      ok: true,
      result: {
        winnerSide,
        d10: o.roll,
        death,
        casualties,
        crowdReaction,                 // band for the losing survivors (null if slain / none)
        xpAwarded,
        sobriquetsAwarded: [],         // G3 — the sobriquet award (±1 morale)
        prizesPaidGp: [],              // G3 — 20% of rent to the winners
        wagersSettled: []              // G4 — gambling settlement
      }
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // G2 — THE ARENA: recruit a gladiator · resolve-and-commit a bout · hold a game
  // G1's resolveBoutAbstract is PURE (returns the result, mutates nothing). G2 adds
  // the COMMIT path that the Gladiators tab drives: mutate the bout, apply the winners'
  // XP + the contract counters, route the losers' casualties through the SHIPPED Mortal-
  // Wounds resolver (Delves D1 — applyMortalWound; the battle-aftermath idiom), check
  // level-ups, and emit the (now-registered) record-only `bout-resolved` event. Plus the
  // recruit verb (mint a socialTier:'gladiator' Character → a school roster + `gladiator-
  // recruited`) and holdGame (resolve every scheduled bout of a Game → `gladiator-game-
  // held`). All GATED on `gladiator-games`. Late-binds the shipped resolvers on global.ACKS
  // (load order: events + mortal-wounds load before this module — index.html + the test glob),
  // with a bare fallback if Delves D1 isn't present (the applyBattleAftermath precedent).
  // ════════════════════════════════════════════════════════════════════════════

  function _findChar(campaign, id){
    return (campaign && Array.isArray(campaign.characters)) ? (campaign.characters.find(c => c && c.id === id) || null) : null;
  }
  function _resolveSchool(campaign, school){ return (school && typeof school === 'object') ? school : findGladiatorSchool(campaign, school); }
  function _resolveBout(campaign, bout){ return (bout && typeof bout === 'object') ? bout : findBout(campaign, bout); }
  function _resolveGame(campaign, game){ return (game && typeof game === 'object') ? game : findGame(campaign, game); }

  // Record-only event emit — the mortal-wounds / hijinks audit template (newEvent +
  // setEventContext + push an APPLIED entry onto eventLog). The handler is registered in
  // acks-engine-events.js (the labeled Gladiators block). Returns the event (or null).
  function _emitGladiatorEvent(campaign, kind, payload, narrative, ctx){
    const A = _A();
    if(!campaign || !A || typeof A.newEvent !== 'function') return null;
    const cal = (campaign && campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy: 'engine', cadence: 'monthly-turn', targetTurn: (campaign && campaign.currentTurn) || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign && campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      try { A.setEventContext(ev, ctx || {}); } catch(_e){}
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
    ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: (typeof ctx === 'object' && ctx && ctx.stamp) || null });
    return ev;
  }

  // recruitGladiator(campaign, school, opts) — mint a gladiator Character into a school's
  // roster (RAW p.23: buy-trained / buy-candidate / impress-prisoner). Mints via the shipped
  // blankCharacter (socialTier:'gladiator'); the gladiator FIELDS are set defensively on the
  // returned object (the G1 "no blankCharacter edit" discipline). GATED. The gp economy
  // (rent/upkeep/P&L) is G3 — recruit records the cost in the event, debits nothing here.
  //   opts = { name, method, gladiatorType, level, thrassian, controlledBy, alignment, rng }
  // Returns { ok, character, costGp } or { ok:false, reason }.
  function recruitGladiator(campaign, school, opts){
    if(!campaign || typeof campaign !== 'object') return { ok:false, reason:'no-campaign' };
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    const sch = _resolveSchool(campaign, school);
    if(!sch) return { ok:false, reason:'no-school' };
    opts = opts || {};
    const method = opts.method || 'buy-trained';   // 'buy-trained' | 'buy-candidate' | 'impress-prisoner'
    const lvl = Math.max(0, Math.min(5, (opts.level != null ? opts.level : 0) | 0));
    const A = _A();
    const typeRow = findGladiatorType(opts.gladiatorType);
    const name = opts.name || ((typeRow ? typeRow.label : 'Gladiator') + ' recruit');
    let ch;
    if(typeof A.blankCharacter === 'function'){
      ch = A.blankCharacter({ name, socialTier:'gladiator', controlledBy: opts.controlledBy || 'gm',
        class: 'Gladiator', alignment: opts.alignment || 'N', level: lvl || 1 });
    } else {
      ch = { id: _newId('character', 'chr'), name, socialTier:'gladiator', controlledBy:'gm', class:'Gladiator', level: lvl || 1, xp:0, history:[] };
    }
    ch.level = lvl;                                  // honor level 0 (blankCharacter coerces 0→1)
    // Gladiator fields (defensive — present only on gladiators; survey §3 / plan §3.1).
    ch.gladiatorType       = typeRow ? typeRow.key : (opts.gladiatorType || null);
    ch.gladiatorIsThrassian= !!opts.thrassian;
    ch.arenaMorale         = (opts.arenaMorale != null) ? opts.arenaMorale : 1;   // 0..+2 bout-local bravery
    ch.lanistaMorale       = (opts.lanistaMorale != null) ? opts.lanistaMorale : -4; // loyalty-to-owner (uprising axis)
    ch.victoriesWon        = 0;
    ch.boutsSurvived       = 0;
    ch.sobriquet           = null;
    ch.contractSchoolId    = sch.id;
    ch.deadToTheGames      = false;
    ch.lifecycleState      = (method === 'buy-candidate') ? 'candidate' : 'active';
    if(!Array.isArray(campaign.characters)) campaign.characters = [];
    campaign.characters.push(ch);
    if(!Array.isArray(sch.gladiatorCharacterIds)) sch.gladiatorCharacterIds = [];
    sch.gladiatorCharacterIds.push(ch.id);
    const costGp = (method === 'buy-candidate' || method === 'impress-prisoner') ? CANDIDATE_COST_GP : gladiatorGpValue(ch, { thrassian: ch.gladiatorIsThrassian });
    if(typeof A.addCharacterHistory === 'function'){
      try { A.addCharacterHistory(campaign, ch, 'note', 'Joined ' + (sch.name || 'the school') + ' as a gladiator (' + method + ')'); } catch(_e){}
    }
    const narrative = name + ' joins ' + (sch.name || 'the school') + ' (' + method + ', ' + gladiatorRankForLevel(lvl) + ')';
    _emitGladiatorEvent(campaign, 'gladiator-recruited', {
      characterId: ch.id, schoolId: sch.id, method, gladiatorType: ch.gladiatorType, level: lvl, costGp
    }, narrative, { settlementId: sch.settlementId || null,
      relatedEntities: [{ kind:'gladiator-school', id: sch.id, role:'site' }, { kind:'character', id: ch.id, role:'subject' }] });
    return { ok:true, character: ch, costGp };
  }

  // freeGladiator — a gladiator who earned freedom (10 victories / 15 bouts; RAW p.20) is
  // manumitted: socialTier → 'independent', the gladiator contract goes dormant. GM-driven.
  function freeGladiator(campaign, characterId){
    const ch = (characterId && typeof characterId === 'object') ? characterId : _findChar(campaign, characterId);
    if(!ch) return { ok:false, reason:'no-character' };
    if(ch.socialTier !== 'gladiator') return { ok:false, reason:'not-a-gladiator' };
    ch.socialTier = 'independent';
    const schId = ch.contractSchoolId;
    ch.contractSchoolId = null;
    const sch = schId ? findGladiatorSchool(campaign, schId) : null;
    if(sch && Array.isArray(sch.gladiatorCharacterIds)) sch.gladiatorCharacterIds = sch.gladiatorCharacterIds.filter(id => id !== ch.id);
    const A = _A();
    if(typeof A.addCharacterHistory === 'function'){ try { A.addCharacterHistory(campaign, ch, 'note', ch.name + ' wins their freedom from the arena'); } catch(_e){} }
    return { ok:true, character: ch };
  }

  // scheduleBout — the gated create-a-bout verb (keeps a Game's boutIds in sync). Thin over
  // createBout; the UI passes sideA/sideB combatant ids + kind + rentPaidGp + gameId.
  function scheduleBout(campaign, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    opts = opts || {};
    const b = createBout(campaign, opts);
    if(!b) return { ok:false, reason:'no-campaign' };
    b.createdAtTurn = (campaign && campaign.currentTurn) || b.createdAtTurn || 1;
    if(opts.gameId){
      const g = findGame(campaign, opts.gameId);
      if(g){ if(!Array.isArray(g.boutIds)) g.boutIds = []; if(!g.boutIds.includes(b.id)) g.boutIds.push(b.id); }
    }
    return { ok:true, bout: b };
  }

  // Apply one combatant's Mortal Wound via the shipped Delves-D1 resolver. `killed` (the bout's
  // own death determination) drives healedToOneHp (the battle-aftermath idiom, acks-engine-battles.js).
  // For a survived loser whose natural roll lands an instantly-killed band, clamp to the worst
  // SURVIVABLE band so the 1d10's "survived" verdict holds. Returns a compact wound descriptor.
  function _applyBoutWound(campaign, ch, killed, rng){
    const A = _A();
    if(typeof A.rollMortalWound !== 'function' || typeof A.applyMortalWound !== 'function'){
      if(killed){ ch.lifecycleState = 'deceased'; ch.alive = false; }    // D1 not loaded — bare death
      return { conditionId: killed ? 'instantly-killed' : null, conditionLabel: killed ? 'Slain' : 'Survived', killed: !!killed, permanentWound: null };
    }
    let wound;
    if(killed){
      wound = A.rollMortalWound(ch, { conditionId:'mortally-wounded', damageType:'slashing', abstract:true, rng });
      A.applyMortalWound(campaign, ch, wound, { healedToOneHp:false });   // 1–15 band + not healed → dies
    } else {
      wound = A.rollMortalWound(ch, { damageType:'slashing', abstract:true, rng });
      if(wound.killed){   // a natural instantly-killed band, but the bout said SURVIVE → clamp to the worst survivable band
        wound = A.rollMortalWound(ch, { conditionId:'mortally-wounded', damageType:'slashing', abstract:true, rng, forcedD6: wound.d6 });
      }
      A.applyMortalWound(campaign, ch, wound, { healedToOneHp:true });    // healed to 1hp → incapacitated + bed rest (+ any lasting wound)
    }
    return { conditionId: wound.conditionId, conditionLabel: wound.conditionLabel,
             permanentWound: (wound.permanentWound && wound.permanentWound.effect) || null,
             permanentWoundLasting: !!(wound.permanentWound && wound.permanentWound.lasting), killed: !!killed };
  }

  // resolveAndCommitBout(campaign, bout, opts) — run the abstract resolver, then COMMIT:
  // mutate the bout (status/result), award the winners' XP + contract counters, route the
  // losers through Mortal Wounds (the crowd decides a defeated-but-alive gladiator's fate —
  // RAW p.27: Hateful/Bloodthirsty → slain; else lives), check level-ups, emit `bout-resolved`.
  // Returns { ok, result, bout } or the resolver's refusal ({ ok:false, reason }).
  function resolveAndCommitBout(campaign, bout, opts){
    const b = _resolveBout(campaign, bout);
    if(!b) return { ok:false, reason:'no-bout' };
    if(b.status === 'resolved') return { ok:false, reason:'already-resolved' };
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const res = resolveBoutAbstract(campaign, b, { rng, roll: opts.roll });   // gates on gladiator-games
    if(!res.ok) return res;
    const result = res.result;
    const A = _A();

    // Winners: XP (= the defeated gp value, p.28) + the contract counters (a win is also a bout).
    const freedomEarned = [];
    for(const aw of (result.xpAwarded || [])){
      const ch = _findChar(campaign, aw.characterId);
      if(!ch) continue;
      ch.xp = (Number(ch.xp) || 0) + (Number(aw.xp) || 0);
      ch.victoriesWon = (Number(ch.victoriesWon) || 0) + 1;
      ch.boutsSurvived = (Number(ch.boutsSurvived) || 0) + 1;
      if(typeof A.addCharacterHistory === 'function'){ try { A.addCharacterHistory(campaign, ch, 'xp', '+' + (aw.xp||0) + ' XP — won an arena bout'); } catch(_e){} }
      if(gladiatorEarnedFreedom(ch)) freedomEarned.push(ch.id);
    }

    // Losers: the crowd decides a defeated-but-alive gladiator's fate (RAW p.27).
    for(const cas of (result.casualties || [])){
      const ch = _findChar(campaign, cas.characterId);
      if(!ch) continue;
      let killed = (cas.outcome === 'slain');
      if(!killed && (result.crowdReaction === 'hateful' || result.crowdReaction === 'bloodthirsty')){
        killed = true; cas.outcome = 'slain'; cas.crowdKilled = true;   // the mob calls for death
      }
      cas.mortalWound = _applyBoutWound(campaign, ch, killed, rng);
      if(!killed){
        ch.boutsSurvived = (Number(ch.boutsSurvived) || 0) + 1;
        if(gladiatorEarnedFreedom(ch) && freedomEarned.indexOf(ch.id) < 0) freedomEarned.push(ch.id);
      } else if(ch.socialTier === 'gladiator'){
        ch.deadToTheGames = true;
      }
    }
    result.freedomEarned = freedomEarned;
    try { if(typeof A.checkAllCharacterLevelUps === 'function') A.checkAllCharacterLevelUps(campaign); } catch(_e){}

    // Commit the bout.
    b.status = 'resolved';
    b.resolvedAtTurn = (campaign && campaign.currentTurn) || 1;
    b.result = result;
    const game = b.gameId ? findGame(campaign, b.gameId) : null;
    const winNames = (result.winnerSide === 'A' ? b.sideA : b.sideB).combatantIds
      .map(id => { const c = _findChar(campaign, id); return c ? c.name : id; });
    const narrative = 'Arena bout — ' + (winNames.join(', ') || 'Side ' + result.winnerSide) + ' prevail'
      + (result.casualties.some(c => c.outcome === 'slain') ? ' (a gladiator falls)' : '')
      + (freedomEarned.length ? ' — ' + freedomEarned.length + ' earn(s) freedom' : '');
    if(!Array.isArray(b.history)) b.history = [];
    b.history.push({ turn: b.resolvedAtTurn, type: 'resolved', summary: narrative });
    const combatants = [].concat(b.sideA.combatantIds, b.sideB.combatantIds)
      .map(id => ({ kind:'character', id, role:'combatant' }));
    _emitGladiatorEvent(campaign, 'bout-resolved', {
      boutId: b.id, gameId: b.gameId || null, kind: b.kind, winnerSide: result.winnerSide,
      d10: result.d10, death: result.death, crowdReaction: result.crowdReaction,
      casualties: result.casualties, xpAwarded: result.xpAwarded, freedomEarned
    }, narrative, { settlementId: (game && game.settlementId) || null, relatedEntities:
      [{ kind:'bout', id: b.id, role:'subject' }].concat(game ? [{ kind:'game', id: game.id, role:'site' }] : []).concat(combatants) });
    return { ok:true, result, bout: b };
  }

  // holdGame(campaign, game, opts) — stage a Game/Munus: resolve every scheduled bout, mark
  // it held, emit `gladiator-game-held`. GATED. Returns { ok, resolved:[…], game }.
  function holdGame(campaign, game, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    const g = _resolveGame(campaign, game);
    if(!g) return { ok:false, reason:'no-game' };
    if(g.status === 'held') return { ok:false, reason:'already-held' };
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const scheduled = boutsForGame(campaign, g.id).filter(b => b && b.status === 'scheduled');
    const resolved = [];
    for(const b of scheduled){
      const r = resolveAndCommitBout(campaign, b, { rng });
      if(r.ok) resolved.push({ boutId: b.id, winnerSide: r.result.winnerSide });
    }
    g.status = 'held';
    g.heldAtTurn = (campaign && campaign.currentTurn) || 1;
    if(!Array.isArray(g.history)) g.history = [];
    const narrative = (g.name || 'The games') + ' are held — ' + resolved.length + ' bout(s) fought';
    g.history.push({ turn: g.heldAtTurn, type: 'held', summary: narrative });
    _emitGladiatorEvent(campaign, 'gladiator-game-held', {
      gameId: g.id, settlementId: g.settlementId || null, boutCount: resolved.length, budgetGp: g.budgetGp || 0
    }, narrative, { settlementId: g.settlementId || null, relatedEntities: [{ kind:'game', id: g.id, role:'subject' }] });
    return { ok:true, resolved, game: g };
  }

  // ── G2 UI read helpers (defensive) ──
  function gladiatorSchoolsList(campaign){ return _schools(campaign).slice(); }
  function gamesList(campaign){ return _games(campaign).slice(); }
  function boutsList(campaign){ return _bouts(campaign).slice(); }
  // Bouts a school's gladiators are committed to (either side), optionally only scheduled.
  function boutsForSchool(campaign, school, opts){
    const sch = _resolveSchool(campaign, school); if(!sch) return [];
    const ids = new Set(sch.gladiatorCharacterIds || []);
    opts = opts || {};
    return _bouts(campaign).filter(b => b && (!opts.scheduledOnly || b.status === 'scheduled') &&
      [].concat(b.sideA.combatantIds, b.sideB.combatantIds).some(id => ids.has(id)));
  }
  // Is the Gladiators tab live? (the rule is on, OR a school already exists — dormant-until-used).
  function gladiatorsSubsystemActive(campaign){
    return _ruleOn(campaign, 'gladiator-games') || _schools(campaign).length > 0;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // G3 — TRAINING CLOCK + THE MONTHLY BUSINESS LOOP (AXIOMS 4 pp.24–25)
  // EXTENDS the shipped G1/G2 (no new entity/prefix/house-rule). New DEFENSIVE runtime
  // fields (NOT on blankCharacter/blankGladiatorSchool → no field-schema/migration touch,
  // the team-session discipline): on a candidate Character — trainingStartedOrd /
  // trainingCompletesOrd / trainingMonths / trainingGraduated / gladiatorUnworthy; on a
  // school — businessNextOrd. The school P&L reproduces Titus's worked example EXACTLY
  // (rent 680 → profit 159, p.25); the staff/upkeep are computed (Titus's 163 / 18).
  // ════════════════════════════════════════════════════════════════════════════

  // The 1-based absolute day ordinal (turn 1 day 1 = ord 1; the sage-commission / recruitment-drive
  // convention) — drives the training clock + the month-end business loop on the slot-62 consumer.
  function _gladDayOrd(campaign, dayInMonth){
    const turn = (campaign && campaign.currentTurn) || 1;
    const day  = (dayInMonth != null) ? dayInMonth : ((campaign && campaign.currentDayInMonth) || 1);
    return (turn - 1) * 30 + day;
  }

  // ── AMPHITHEATER_SIZE — appropriate seat count by market class (p.21) ────────
  // The de-drifted RAW table (the PDF column-shifted; reconstructed from the cell order + the
  // Arganos worked example "Class III, 4,000 families → 7,500 + (4,000−2,500)×3 = 12,000 seats").
  // Class is the ACKS-core Roman order (lookupMarketClass); Class IV is the minimum (V/VI = None,
  // matching AMPHITHEATER_MIN_MARKET_CLASS = 4). Each formula = base + ⌊(families − anchor) × perFamily⌋,
  // the anchor being the class's lower family bound.
  const AMPHITHEATER_SIZE = [
    { class:'I',   base:30000, anchor:20000, perFamily:0.25, note:'30,000 + 1 per 4 families over 20,000', page:21 },
    { class:'II',  base:15000, anchor:5000,  perFamily:1,    note:'15,000 + 1 per family over 5,000',       page:21 },
    { class:'III', base:7500,  anchor:2500,  perFamily:3,    note:'7,500 + 3 per family over 2,500',         page:21 },
    { class:'IV',  base:0,     anchor:0,     perFamily:5,    note:'5 seats per family',                      page:21 },
    { class:'V',   base:0,     anchor:0,     perFamily:0,    note:'None',                                    page:21 },
    { class:'VI',  base:0,     anchor:0,     perFamily:0,    note:'None',                                    page:21 }
  ].map(Object.freeze);
  Object.freeze(AMPHITHEATER_SIZE);
  const _AMPHI_BY_CLASS = {}; for(const r of AMPHITHEATER_SIZE){ _AMPHI_BY_CLASS[r.class] = r; }
  const AMPHITHEATER_MAX_SEATS = 100000;  // RAW: no more than 100,000 seats (p.22)
  // The appropriate amphitheater size for a market class (Roman 'I'…'VI', or 'VI*') + family count (p.21).
  function amphitheaterSeatsForClassFamilies(marketClass, families){
    const fam = Math.max(0, Number(families) || 0);
    const cls = String(marketClass || '').replace('*', '');   // 'VI*' → 'VI'
    const row = _AMPHI_BY_CLASS[cls];
    if(!row) return 0;                                          // unknown / below Class VI
    const seats = row.base + Math.floor(Math.max(0, fam - row.anchor) * row.perFamily);
    return Math.max(0, Math.min(AMPHITHEATER_MAX_SEATS, seats));
  }
  // The appropriate amphitheater size + build cost for a settlement (reads families → market class).
  function amphitheaterSeatsForSettlement(campaign, settlement){
    const A = _A();
    const fam = (settlement && Number(settlement.families)) || 0;
    const cls = (typeof A.lookupMarketClass === 'function') ? A.lookupMarketClass(fam).class : 'VI';
    return amphitheaterSeatsForClassFamilies(cls, fam);
  }

  // ── GLADIATOR_TRAINING_BY_TYPE — per-type training time + typical cost (p.25) ──
  // The RAW Training & Equipment table (verified vs AXIOMS 4 p.25): lighter-armored types train
  // LONGER (the 6 / 7.5 / 9-month tiers); costGp = the typical training+equipment cost (sets market
  // value). The graduation roll (1d20, maim on 1; unworthy 1–10) + the simplified 6mo/200gp option
  // live on the shipped GLADIATOR_TRAINING object.
  const GLADIATOR_TRAINING_BY_TYPE = Object.freeze({
    spearfighter: Object.freeze({ months:6,   costGp:192 }),
    challenger:   Object.freeze({ months:6,   costGp:192 }),
    striker:      Object.freeze({ months:7.5, costGp:197.5 }),
    shieldbearer: Object.freeze({ months:7.5, costGp:197.5 }),
    pursuer:      Object.freeze({ months:7.5, costGp:197.5 }),
    netfighter:   Object.freeze({ months:9,   costGp:200 }),
    dualwielder:  Object.freeze({ months:9,   costGp:200 })
  });
  // The training time (months) for a gladiator type — defaults to the RAW minimum (6) for an unknown type.
  function gladiatorTrainingMonths(typeKey){
    const row = GLADIATOR_TRAINING_BY_TYPE[typeKey];
    return row ? row.months : GLADIATOR_TRAINING.minMonths;
  }

  // trainGladiator(campaign, school, characterId, opts) — begin training a candidate (RAW p.24–25).
  // Sets the type + the 6–9-month clock (a completion ordinal the slot-62 consumer advances); the
  // graduation 1d20 fires on the day the clock completes. opts = { type, unworthy }. GATED.
  // Returns { ok, character, months, completesOrd } or { ok:false, reason }.
  function trainGladiator(campaign, school, characterId, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    const sch = _resolveSchool(campaign, school);
    if(!sch) return { ok:false, reason:'no-school' };
    const ch = (characterId && typeof characterId === 'object') ? characterId : _findChar(campaign, characterId);
    if(!ch) return { ok:false, reason:'no-character' };
    if(ch.socialTier !== 'gladiator') return { ok:false, reason:'not-a-gladiator' };
    opts = opts || {};
    const typeKey = opts.type || ch.gladiatorType || (GLADIATOR_TYPES[0] && GLADIATOR_TYPES[0].key);
    if(!findGladiatorType(typeKey)) return { ok:false, reason:'unknown-type' };
    const months = gladiatorTrainingMonths(typeKey);
    const startOrd = _gladDayOrd(campaign);
    ch.gladiatorType       = typeKey;
    ch.lifecycleState      = 'candidate';
    ch.trainingStartedOrd  = startOrd;
    ch.trainingCompletesOrd = startOrd + Math.ceil(months * 30);
    ch.trainingMonths      = months;
    ch.trainingGraduated   = false;
    if(opts.unworthy) ch.gladiatorUnworthy = true;
    const A = _A();
    if(typeof A.addCharacterHistory === 'function'){
      try { A.addCharacterHistory(campaign, ch, 'note', 'Begins ' + months + '-month training as a ' + (findGladiatorType(typeKey).label) + ' at ' + (sch.name || 'the school')); } catch(_e){}
    }
    if(!Array.isArray(sch.gladiatorCharacterIds)) sch.gladiatorCharacterIds = [];
    if(!sch.gladiatorCharacterIds.includes(ch.id)) sch.gladiatorCharacterIds.push(ch.id);
    return { ok:true, character: ch, months, completesOrd: ch.trainingCompletesOrd };
  }
  // Derived training read (UI + the day log): { inTraining, daysLeft, completesOrd, months }.
  function gladiatorTrainingInfo(campaign, ch){
    if(!ch || ch.socialTier !== 'gladiator' || ch.lifecycleState !== 'candidate' || ch.trainingGraduated
       || typeof ch.trainingCompletesOrd !== 'number') return { inTraining:false };
    const left = ch.trainingCompletesOrd - _gladDayOrd(campaign);
    return { inTraining:true, daysLeft: Math.max(0, left), completesOrd: ch.trainingCompletesOrd, months: ch.trainingMonths || null };
  }
  // The graduation throw (1d20; maim/kill on a 1, or 1–10 for an unworthy candidate; else an ordinary
  // gladiator, p.25). Mutates the character (graduate → active, or maimed → deceased "dead to the games").
  function _graduateGladiator(campaign, ch, opts){
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const roll = opts.roll || (1 + Math.floor(rng() * GLADIATOR_TRAINING.graduationDie)); // 1d20
    const failMax = ch.gladiatorUnworthy ? GLADIATOR_TRAINING.unworthyFailMax : GLADIATOR_TRAINING.maimOn; // 10 : 1
    const maimed = roll <= failMax;
    ch.trainingGraduated = true;
    ch.trainingCompletesOrd = null;
    if(maimed){
      ch.lifecycleState = 'deceased'; ch.alive = false; ch.deadToTheGames = true;
    } else {
      ch.lifecycleState = 'active';            // an ordinary gladiator (level 0 = ordinary)
    }
    return { roll, maimed, failMax };
  }
  // resolveGraduation(campaign, characterId, opts) — the public graduation verb (the slot-62 commit + a UI
  // "graduate now" both route through it): roll the 1d20, mutate the candidate, emit `gladiator-trained`.
  // opts.{roll, rng}. GATED. Returns { ok, maimed, roll, character } or { ok:false, reason }.
  function resolveGraduation(campaign, characterId, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    const ch = (characterId && typeof characterId === 'object') ? characterId : _findChar(campaign, characterId);
    if(!ch) return { ok:false, reason:'no-character' };
    if(ch.socialTier !== 'gladiator' || ch.lifecycleState !== 'candidate' || ch.trainingGraduated) return { ok:false, reason:'not-a-candidate' };
    const g = _graduateGladiator(campaign, ch, opts || {});
    const A = _A();
    if(typeof A.addCharacterHistory === 'function'){
      try { A.addCharacterHistory(campaign, ch, 'note', g.maimed ? ('Maimed in training (graduation 1d20 ' + g.roll + ' ≤ ' + g.failMax + ')') : ('Graduates as an ordinary gladiator (graduation 1d20 ' + g.roll + ')')); } catch(_e){}
    }
    const narrative = g.maimed ? ((ch.name || 'A candidate') + ' is maimed in training and dead to the games (1d20 ' + g.roll + ')')
                               : ((ch.name || 'A candidate') + ' graduates as an ordinary ' + ((findGladiatorType(ch.gladiatorType) || {}).label || 'gladiator') + ' (1d20 ' + g.roll + ')');
    _emitGladiatorEvent(campaign, 'gladiator-trained', {
      characterId: ch.id, schoolId: ch.contractSchoolId || null, gladiatorType: ch.gladiatorType || null,
      graduationRoll: g.roll, maimed: g.maimed
    }, narrative, { primaryHexId: ch.currentHexId || null, relatedEntities:
      [{ kind:'character', id: ch.id, role:'subject' }].concat(ch.contractSchoolId ? [{ kind:'gladiator-school', id: ch.contractSchoolId, role:'site' }] : []) });
    return { ok:true, maimed: g.maimed, roll: g.roll, character: ch };
  }

  // ── The school P&L (RAW p.25 — "Running the School") ────────────────────────
  // The roster count for staff/upkeep — gladiators AND candidates count (RAW p.24), excluding the dead.
  function schoolRosterCount(campaign, school){
    return gladiatorsOfSchool(campaign, _resolveSchool(campaign, school) || school).filter(g => g && g.lifecycleState !== 'deceased').length;
  }
  // A 5th-level-or-higher lanista qualifies as his own master trainer (RAW p.24 — no hired master needed).
  function _lanistaIsMasterTrainer(campaign, school){
    const lan = school && school.lanistaCharacterId ? _findChar(campaign, school.lanistaCharacterId) : null;
    return !!(lan && (Number(lan.level) || 0) >= 5);
  }
  // Monthly staff wages (RAW p.24 — Gladiator School Staff). Reproduces Titus's 9-gladiator school EXACTLY:
  // 1 guard (25) + 2 ordinary trainers (120) + lanista-as-master-trainer (0) + part-time chirugeon (9×2=18)
  // = 163gp. Round the staff counts UP (RAW). A small school (<60) hires the healer part-time at 2gp/glad.
  function schoolStaffWages(campaign, school){
    const sch = _resolveSchool(campaign, school); if(!sch) return 0;
    const n = schoolRosterCount(campaign, sch);
    if(n <= 0) return 0;
    const guards       = Math.ceil(n / 20) * 25;     // 1 / 20 gladiators, 25gp
    const ordTrainers  = Math.ceil(n / 6) * 60;      // 1 / 6 gladiators, 60gp
    const mastersNeed  = Math.ceil(n / 120);         // 1 / 120 gladiators, 250gp
    const masters      = Math.max(0, mastersNeed - (_lanistaIsMasterTrainer(campaign, sch) ? 1 : 0)) * 250;
    const healer       = (n < 60) ? n * 2 : Math.ceil(n / 60) * 100;  // small school: part-time 2gp/glad
    return guards + ordTrainers + masters + healer;
  }
  // Monthly upkeep (RAW p.23 — 2gp / gladiator / month; candidates count).
  function schoolUpkeepGp(campaign, school){
    return schoolRosterCount(campaign, school) * UPKEEP_GP_PER_MONTH;
  }
  // The monthly P&L (RAW p.25). rentIncome − (prizes + replacements + upkeep + staff) = profit.
  // upkeep + staff auto-compute from the roster when not overridden. Reproduces Titus EXACTLY:
  // schoolMonthlyPL(camp, titus9, { rentIncomeGp:680, prizesGp:90, replacementsGp:250 }) → profit 159
  // (upkeep 18, staff 163, totalCost 521). Pure.
  function schoolMonthlyPL(campaign, school, inputs){
    const sch = _resolveSchool(campaign, school);
    inputs = inputs || {};
    const rentIncome   = Math.max(0, Math.round(Number(inputs.rentIncomeGp)   || 0));
    const prizes       = Math.max(0, Math.round(Number(inputs.prizesGp)       || 0));
    const replacements = Math.max(0, Math.round(Number(inputs.replacementsGp) || 0));
    const upkeep       = (inputs.upkeepGp     != null) ? Math.max(0, Math.round(inputs.upkeepGp))     : schoolUpkeepGp(campaign, sch);
    const staffWages   = (inputs.staffWagesGp != null) ? Math.max(0, Math.round(inputs.staffWagesGp)) : schoolStaffWages(campaign, sch);
    const totalCost    = prizes + replacements + upkeep + staffWages;
    return { rentIncome, prizes, replacements, upkeep, staffWages, totalCost, profit: rentIncome - totalCost };
  }
  // The estimated monthly rent a school is owed (RAW p.25): (µgp/family × families) × (own / total-in-settlement).
  // µ defaults to the 0.5gp/family minimum. Falls back to opts.{families,totalGladiators} for a settlement-less school.
  function estimateSchoolMonthlyRent(campaign, school, opts){
    const sch = _resolveSchool(campaign, school); if(!sch) return 0;
    opts = opts || {};
    const mu = (opts.muGpPerFamily != null) ? opts.muGpPerFamily : SPONSOR_MIN_GP_PER_FAMILY;
    const set = sch.settlementId ? (campaign.settlements || []).find(s => s && s.id === sch.settlementId) : null;
    const families = set ? (Number(set.families) || 0) : (Number(opts.families) || 0);
    if(!families) return 0;
    const own = gladiatorsOfSchool(campaign, sch).filter(g => g && g.lifecycleState === 'active').length;
    let total = 0;
    for(const s of _schools(campaign)){
      if(set && s.settlementId !== sch.settlementId) continue;
      total += gladiatorsOfSchool(campaign, s).filter(g => g && g.lifecycleState === 'active').length;
    }
    if(typeof opts.totalGladiators === 'number') total = opts.totalGladiators;
    if(total <= 0) return 0;
    return Math.round(families * mu * own / total);
  }
  // Bank the month's net to/from the school treasury Stash (GP Wave B). Best-effort + guarded: a school
  // with no treasury (or an under-funded one on a loss) simply records the P&L (the sage-retainer precedent).
  function _bankSchoolNet(campaign, school, net, opts){
    const A = _A();
    if(!school || !school.treasuryStashId || typeof A.applyWealthTransfer !== 'function') return { banked:false, net };
    const stash = (typeof A.findStash === 'function') ? A.findStash(campaign, school.treasuryStashId) : null;
    if(!stash) return { banked:false, net };
    try {
      if(net > 0){
        A.applyWealthTransfer(campaign, { amount: net, source:{ kind:'external', label:'gladiatorial rents' },
          destination:{ kind:'stash', id: school.treasuryStashId }, bucket:'service', reason:'gladiator-school-profit' });
      } else if(net < 0){
        A.applyWealthTransfer(campaign, { amount: -net, source:{ kind:'stash', id: school.treasuryStashId },
          destination:{ kind:'external', label:'gladiatorial costs' }, bucket:'service', reason:'gladiator-school-loss' });
      }
      return { banked:true, net };
    } catch(_e){ return { banked:false, net, deficit:true }; }   // insufficient treasury → a deficit (flagged)
  }
  // runSchoolBusinessMonth(campaign, school, opts) — the month-end loop the slot-62 consumer fires.
  // Rents out ~3×/year (≈¼ the roster/month) of the ready gladiators, rolls the abstract 1d10 each
  // (win → prize 20% of rent; slain → replaced at 250gp; the win/bout counters advance), computes the
  // P&L, and banks the net to the treasury. opts.{rentIncomeGp, rentCount, rng} override the auto values.
  // GATED. Returns { ok, pl, tally, rented, banked }.
  function runSchoolBusinessMonth(campaign, school, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    const sch = _resolveSchool(campaign, school); if(!sch) return { ok:false, reason:'no-school' };
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const ready = gladiatorsOfSchool(campaign, sch).filter(g => g && g.lifecycleState === 'active');
    const rentIncome = (opts.rentIncomeGp != null) ? Math.max(0, Math.round(opts.rentIncomeGp)) : estimateSchoolMonthlyRent(campaign, sch, opts);
    let rentCount = (opts.rentCount != null) ? (opts.rentCount | 0) : Math.ceil(ready.length * RENTS_PER_YEAR / 12);
    rentCount = Math.max(0, Math.min(ready.length, rentCount));
    let prizes = 0, replacements = 0, wins = 0, losses = 0, slain = 0;
    const rented = ready.slice(0, rentCount);
    for(const g of rented){
      const o = rollGladiatorBoutOutcome({ rng });
      if(o.outcome === 'won'){
        wins++; g.victoriesWon = (Number(g.victoriesWon) || 0) + 1; g.boutsSurvived = (Number(g.boutsSurvived) || 0) + 1;
        prizes += gladiatorVictoryPrize(Number(g.level) || 0);
      } else if(o.outcome === 'lost'){
        losses++; g.boutsSurvived = (Number(g.boutsSurvived) || 0) + 1;
      } else {
        slain++; g.lifecycleState = 'deceased'; g.alive = false; g.deadToTheGames = true;
        replacements += gladiatorBaseGpValue(0);   // replace with a 250gp ordinary candidate
      }
    }
    const pl = schoolMonthlyPL(campaign, sch, { rentIncomeGp: rentIncome, prizesGp: prizes, replacementsGp: replacements });
    const banked = _bankSchoolNet(campaign, sch, pl.profit, opts);
    if(!Array.isArray(sch.history)) sch.history = [];
    sch.history.push({ turn: (campaign && campaign.currentTurn) || 1, type:'business-month',
      summary: 'Monthly P&L — rent ' + pl.rentIncome + 'gp, profit ' + pl.profit + 'gp (' + wins + 'W/' + losses + 'L/' + slain + ' slain of ' + rentCount + ' rented)' });
    return { ok:true, pl, tally:{ rentCount, wins, losses, slain }, rented: rented.map(g => g.id), banked };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // G4 — UPRISINGS + SPONSORING A GAME (AXIOMS 4 pp.22, 26)
  // ════════════════════════════════════════════════════════════════════════════

  // ── Uprising modifiers (p.26) ───────────────────────────────────────────────
  // The circumstance modifiers added to each gladiator's 2d6 + lanista-morale roll. The values CONFIRMED
  // by the Titus worked example (p.26 — a 5th-level master-trainer on a not-his-fault spark = +1 level +2
  // master +1 not-fault, net 0 against morale −4) are exact; the guard/upkeep granularity is a best-reading
  // of a column-drifted PDF table (FLAGGED — verify vs the PDF in a later pass; not exercised by the
  // worked example, which has adequate guards). A POSITIVE modifier → a higher roll → more loyal.
  const UPRISING_MODIFIERS = Object.freeze({
    masterTrainer: 2,        // lanista is himself a master trainer (worked example)
    ordinaryTrainer: 1,      // lanista is himself an (ordinary) gladiator trainer  ⚠ best-reading
    level5plus: 1,           // lanista is 5th level or higher (worked example)
    intimidation: 1,         // lanista has the Intimidation proficiency
    sparkNotFault: 1,        // the spark was not the lanista's fault (worked example)
    extraGuardPer20: 1,      // each extra guard per 20 gladiators  ⚠ best-reading
    insufficientGuards: Object.freeze({ '15': -1, '10': -2, '5': -3, 'none': -4 }),  // ⚠ best-reading
    page: 26,
    rawGuardUpkeepVerified: false
  });
  function _gladHasIntimidation(ch){
    const A = _A();
    if(ch && typeof A.hasProficiency === 'function'){ try { return !!A.hasProficiency(ch, 'intimidation'); } catch(_e){} }
    return false;
  }
  function _gladChaMod(ch){
    const A = _A();
    return (ch && ch.abilities && typeof A.abilityMod === 'function') ? (A.abilityMod(ch.abilities.CHA) || 0) : 0;
  }
  // The school-wide circumstance modifier for an uprising roll (the per-gladiator lanista-morale is the
  // base, added separately in checkUprising). opts = { sparkNotFault, lanistaIsTrainer }. Returns { total, mods }.
  function uprisingModifiers(campaign, school, opts){
    opts = opts || {};
    const sch = _resolveSchool(campaign, school);
    const lan = sch && sch.lanistaCharacterId ? _findChar(campaign, sch.lanistaCharacterId) : null;
    const mods = [];
    const cha = _gladChaMod(lan); if(cha) mods.push({ label:'Lanista CHA modifier', value: cha });
    if(_gladHasIntimidation(lan)) mods.push({ label:'Intimidation proficiency', value: UPRISING_MODIFIERS.intimidation });
    const lvl = lan ? (Number(lan.level) || 0) : 0;
    if(lvl >= 5) mods.push({ label:'Lanista 5th level or higher', value: UPRISING_MODIFIERS.level5plus });
    if(_lanistaIsMasterTrainer(campaign, sch)) mods.push({ label:'Lanista is a master trainer', value: UPRISING_MODIFIERS.masterTrainer });
    else if(opts.lanistaIsTrainer || (lan && lvl >= 1)) mods.push({ label:'Lanista is a gladiator trainer', value: UPRISING_MODIFIERS.ordinaryTrainer });
    if(opts.sparkNotFault) mods.push({ label:'Spark was not the lanista’s fault', value: UPRISING_MODIFIERS.sparkNotFault });
    const total = mods.reduce((s, m) => s + m.value, 0);
    return { total, mods };
  }
  // checkUprising(campaign, school, opts) — on a spark, roll the Gladiator Uprising table (2d6 + each
  // gladiator's lanista morale + the school's circumstance modifier) for every active gladiator, then
  // resolve the cascade: a Lead result revolts when ≥25% of the roster is uprising/conspiring (lead +
  // join). Reproduces the Titus worked example (p.26 — 6 gladiators, morale −4, net mod 0; rolls
  // 11/8/2/4/6/7 → 1 lead + 1 join = 33% ≥ 25% → revolt). opts = { spark, sparkNotFault, rolls?[], rng }.
  // GATED. Emits `gladiator-uprising`. Returns { ok, spark, modifier, per[], leaders, supporters, supportPct, revolt }.
  function checkUprising(campaign, school, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    const sch = _resolveSchool(campaign, school); if(!sch) return { ok:false, reason:'no-school' };
    opts = opts || {};
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const roster = gladiatorsOfSchool(campaign, sch).filter(g => g && g.lifecycleState === 'active');
    if(!roster.length) return { ok:false, reason:'no-gladiators' };
    const modInfo = uprisingModifiers(campaign, sch, opts);
    const rolls = Array.isArray(opts.rolls) ? opts.rolls : null;
    const total = roster.length;
    const per = [];
    let leaders = 0, supporters = 0;
    roster.forEach((g, i) => {
      const base = (rolls && rolls[i] != null) ? rolls[i] : ((1 + Math.floor(rng() * 6)) + (1 + Math.floor(rng() * 6)));
      const morale = Number(g.lanistaMorale) || 0;
      const adjusted = base + morale + modInfo.total;
      const band = _bandLookup(GLADIATOR_UPRISING.bands, adjusted);
      per.push({ characterId: g.id, roll: base, morale, adjusted, result: band });
      if(band === 'lead') leaders++;
      else if(band === 'join') supporters++;     // "join"/Support — actively conspiring (counts toward 25%)
    });
    const supportPct = Math.round(((leaders + supporters) / total) * 100);
    const revolt = leaders > 0 && supportPct >= GLADIATOR_UPRISING.leadSupportThresholdPct;  // ≥25%
    // RAW consequences (p.26): a Lead with insufficient support → −2 morale; a Firmly Loyal → +1 morale.
    for(const p of per){
      const g = roster.find(x => x.id === p.characterId); if(!g) continue;
      if(p.result === 'lead' && !revolt){ g.lanistaMorale = Math.max(-12, (Number(g.lanistaMorale) || 0) - 2); }
      else if(p.result === 'firmly-loyal'){ g.lanistaMorale = Math.min(12, (Number(g.lanistaMorale) || 0) + 1); }
    }
    if(revolt){ sch.uprisingState = { startedAtTurn:(campaign && campaign.currentTurn) || 1, leaders, supporters, spark: opts.spark || null }; }
    const narrative = (sch.name || 'The school') + (revolt
      ? ' — a gladiator UPRISING breaks out (' + leaders + ' lead, ' + (leaders + supporters) + '/' + total + ' = ' + supportPct + '% rise)'
      : ' — a spark passes (no uprising; ' + supportPct + '% would rise)');
    _emitGladiatorEvent(campaign, 'gladiator-uprising', {
      schoolId: sch.id, spark: opts.spark || null, modifier: modInfo.total, gladiatorCount: total,
      leaders, supporters, supportPct, revolt
    }, narrative, { settlementId: sch.settlementId || null, relatedEntities:
      [{ kind:'gladiator-school', id: sch.id, role:'subject' }] });
    return { ok:true, spark: opts.spark || null, modifier: modInfo.total, mods: modInfo.mods, per, leaders, supporters, supportPct, revolt };
  }

  // ── Sponsoring a game (p.22) ────────────────────────────────────────────────
  // The two sides of a bout must be ≈equal in total gp value (within ±10%), unless either side fields
  // creatures or prisoners (RAW p.22). Returns { ok, valueA, valueB } / { ok:false, reason }.
  function _boutSidesBalanced(campaign, spec){
    if(!spec || !spec.sideA || !spec.sideB) return { ok:false, reason:'no-sides' };
    const lenient = (spec.sideA.kind && spec.sideA.kind !== 'gladiator') || (spec.sideB.kind && spec.sideB.kind !== 'gladiator');
    const sumVal = side => (side.combatantIds || []).reduce((s, id) => { const c = _findChar(campaign, id); return s + (c ? gladiatorGpValue(c) : 0); }, 0);
    const a = sumVal(spec.sideA), b = sumVal(spec.sideB);
    if(lenient) return { ok:true, valueA:a, valueB:b, lenient:true };
    const hi = Math.max(a, b) || 1;
    return { ok: Math.abs(a - b) / hi <= SIDE_VALUE_TOLERANCE, reason:'sides-unequal', valueA:a, valueB:b };
  }
  // sponsorGame(campaign, opts) — a munerator sponsors a Munus (RAW p.22): pays ≥0.5gp/urban-family as a
  // festival/liturgy expense, schedules the bouts (≤12/day, ≈equal sides ±10%), and creates the Game.
  // The liturgy spend rides GP Wave B from the munerator (the existing Munerator-overseen liturgy expense;
  // no NEW expense category). opts = { settlementId, families?, muneratorCharacterId, budgetGp?, name,
  //   amphitheaterConstructibleId?, bouts:[{ sideA, sideB, kind, rentPaidGp }], payFromMunerator? }.
  // GATED. Returns { ok, game, scheduled[], rejected[], days, minBudget, budgetGp } or { ok:false, reason }.
  function sponsorGame(campaign, opts){
    if(!_ruleOn(campaign, 'gladiator-games')) return { ok:false, reason:'gladiator-games-off' };
    opts = opts || {};
    const set = opts.settlementId ? (campaign.settlements || []).find(s => s && s.id === opts.settlementId) : null;
    const families = set ? (Number(set.families) || 0) : (Number(opts.families) || 0);
    const minBudget = Math.ceil(families * SPONSOR_MIN_GP_PER_FAMILY);   // ≥ 0.5gp / urban family (p.22)
    const budgetGp = (opts.budgetGp != null) ? Math.max(0, Math.round(opts.budgetGp)) : minBudget;
    if(families > 0 && budgetGp < minBudget) return { ok:false, reason:'budget-too-low', minBudget };
    const game = createGame(campaign, { name: opts.name || 'The Games', settlementId: opts.settlementId || null,
      amphitheaterConstructibleId: opts.amphitheaterConstructibleId || null, muneratorCharacterId: opts.muneratorCharacterId || null,
      budgetGp, scheduledTurn: (campaign && campaign.currentTurn) || 1, createdAtTurn: (campaign && campaign.currentTurn) || 1 });
    const bouts = Array.isArray(opts.bouts) ? opts.bouts : [];
    const scheduled = [], rejected = [];
    let perDay = 0, day = 0;
    for(const bspec of bouts){
      const bal = _boutSidesBalanced(campaign, bspec);
      if(!bal.ok){ rejected.push({ spec: bspec, reason: bal.reason, valueA: bal.valueA, valueB: bal.valueB }); continue; }
      if(perDay >= MAX_BOUTS_PER_DAY){ day++; perDay = 0; }     // ≤12 bouts/day → overflow to the next day (p.22)
      const b = createBout(campaign, { gameId: game.id, sideA: bspec.sideA, sideB: bspec.sideB,
        kind: bspec.kind || 'to-incapacitation', rentPaidGp: bspec.rentPaidGp || 0, createdAtTurn: (campaign && campaign.currentTurn) || 1 });
      b.scheduledDay = day;
      if(!Array.isArray(game.boutIds)) game.boutIds = [];
      game.boutIds.push(b.id);
      scheduled.push(b.id); perDay++;
    }
    // The festival/liturgy expense — the munerator pays (GP Wave B; the existing Munerator-overseen liturgy
    // expense). Best-effort: debit the munerator's purse when asked + able (v1; the domain-expense-row
    // integration is a Religion/economy follow-on — this module does not edit economy.js).
    const A = _A();
    if(opts.payFromMunerator && opts.muneratorCharacterId && budgetGp > 0 && typeof A.applyWealthTransfer === 'function'){
      try { A.applyWealthTransfer(campaign, { amount: budgetGp, source:{ kind:'character', id: opts.muneratorCharacterId },
        destination:{ kind:'external', label:'gladiatorial games (liturgy)' }, bucket:'liturgy', reason:'gladiatorial-game' }); } catch(_e){}
    }
    const days = day + 1;
    const narrative = (game.name || 'The Games') + ' are sponsored — ' + budgetGp + 'gp, ' + scheduled.length + ' bout(s)' + (days > 1 ? ' over ' + days + ' days' : '');
    _emitGladiatorEvent(campaign, 'game-sponsored', {
      gameId: game.id, settlementId: opts.settlementId || null, muneratorCharacterId: opts.muneratorCharacterId || null,
      budgetGp, minBudget, boutCount: scheduled.length, rejectedCount: rejected.length, days
    }, narrative, { settlementId: opts.settlementId || null, relatedEntities:
      [{ kind:'game', id: game.id, role:'subject' }].concat(opts.muneratorCharacterId ? [{ kind:'character', id: opts.muneratorCharacterId, role:'patron' }] : []) });
    return { ok:true, game, scheduled, rejected, days, minBudget, budgetGp };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // THE DAY-TICK CONSUMER (Calendar §14, slot 62) — self-registered from THIS module.
  // PURE propose (graduations + the month-end business loop) → propose-review-commit. commitTurn drives
  // it to month end via runDayTickToMonthEnd, so training graduates + the school's P&L run across
  // Advance-Months — WITHOUT touching acks-engine.js's commitTurn (the team-session discipline).
  // ════════════════════════════════════════════════════════════════════════════

  // The month-end business ordinal for a school first seen this turn: day 30 of the current month.
  function _gladSchoolFirstBusinessOrd(campaign){ return ((campaign && campaign.currentTurn) || 1) * 30; }

  function proposeGladiatorDay(campaign, ctx){
    const out = { pendingRecords: [], notableEvents: [], encounters: [] };
    if(!_ruleOn(campaign, 'gladiator-games')) return out;
    const dayInMonth = (ctx && ctx.dayInMonth) || ((campaign && campaign.currentDayInMonth) || 1);
    const nowOrd = _gladDayOrd(campaign, dayInMonth);
    // (a) training graduations — a candidate whose 6–9-month clock completes today
    for(const ch of (campaign.characters || [])){
      if(!ch || ch.socialTier !== 'gladiator' || ch.lifecycleState !== 'candidate' || ch.trainingGraduated) continue;
      if(typeof ch.trainingCompletesOrd !== 'number' || nowOrd < ch.trainingCompletesOrd) continue;
      out.pendingRecords.push({ kind:'gladiator-graduate', characterId: ch.id, forOrd: ch.trainingCompletesOrd, dayInMonth });
      out.notableEvents.push({ kind:'gm-narrative', type:'gladiator-training', transient:true,
        primaryHexId: ch.currentHexId || null,
        label: (ch.name || 'A candidate') + ' completes their gladiatorial training — the graduation throw is due.',
        payload: { characterId: ch.id } });
    }
    // (b) the month-end school business loop — once per month at the month boundary
    for(const sch of _schools(campaign)){
      if(!sch || sch.status !== 'active') continue;
      const nextOrd = (typeof sch.businessNextOrd === 'number') ? sch.businessNextOrd : _gladSchoolFirstBusinessOrd(campaign);
      if(nowOrd < nextOrd) continue;
      out.pendingRecords.push({ kind:'gladiator-school-month', schoolId: sch.id, forOrd: nextOrd, dayInMonth });
      out.notableEvents.push({ kind:'gm-narrative', type:'gladiator-school', transient:true,
        label: (sch.name || 'A gladiator school') + '’s monthly accounts are due — rent in, prizes + upkeep + wages out.',
        payload: { schoolId: sch.id } });
    }
    return out;
  }
  function commitGladiatorRecord(campaign, record){
    if(!record) return;
    if(record.kind === 'gladiator-graduate'){
      const ch = _findChar(campaign, record.characterId);
      if(!ch || ch.socialTier !== 'gladiator' || ch.lifecycleState !== 'candidate' || ch.trainingGraduated) return;
      if(typeof record.forOrd === 'number' && ch.trainingCompletesOrd !== record.forOrd) return;   // idempotent
      resolveGraduation(campaign, ch, { rng: record.rng });   // rolls the 1d20, mutates, emits gladiator-trained
    } else if(record.kind === 'gladiator-school-month'){
      const sch = findGladiatorSchool(campaign, record.schoolId);
      if(!sch || sch.status !== 'active') return;
      if(typeof record.forOrd === 'number' && (typeof sch.businessNextOrd === 'number') && sch.businessNextOrd > record.forOrd) return;  // already ran this month
      runSchoolBusinessMonth(campaign, sch, {});
      sch.businessNextOrd = (typeof sch.businessNextOrd === 'number' ? sch.businessNextOrd : record.forOrd) + 30;
    }
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // constants
    GLADIATORS_PER_URBAN_FAMILIES, MAX_GLADIATORS_PER_FAMILIES, CANDIDATES_PER_FAMILIES_MONTH,
    CANDIDATE_COST_GP, UPKEEP_GP_PER_MONTH, FREEDOM_VICTORIES, FREEDOM_BOUTS,
    RENT_PCT_ORDINARY, RENT_PCT_VETERAN, DEATH_BOUT_RENT_MULT, VICTORY_PRIZE_PCT, RENTS_PER_YEAR,
    THRASSIAN_VALUE_MULT, AMPHITHEATER_COST_PER_SEAT_GP, AMPHITHEATER_MIN_MARKET_CLASS,
    SPONSOR_MIN_GP_PER_FAMILY, MAX_BOUTS_PER_DAY, SIDE_VALUE_TOLERANCE, BUY_TRAINED_REACTION_TARGET,
    // catalogs
    GLADIATOR_RANKS, GLADIATOR_TYPES, GLADIATOR_SCHOOL_STAFF, GLADIATOR_SCHOOL_STRUCTURES,
    GLADIATOR_TRAINING, ABSTRACT_BOUT_OUTCOME, GLADIATOR_UPRISING, CROWD_REACTION,
    // catalog lookups
    gladiatorTypes, findGladiatorType, isGladiatorType, gladiatorRanks, gladiatorRankRow,
    gladiatorRankForLevel, gladiatorBaseGpValue, gladiatorRentFee, gladiatorVictoryPrize,
    // gladiator-as-Character helpers (defensive)
    isGladiator, gladiatorRank, gladiatorGpValue, gladiatorEarnedFreedom,
    maxGladiatorsForFamilies, amphitheaterCostGp,
    // entities
    blankBout, createBout, blankGladiatorSchool, createGladiatorSchool, blankGame, createGame,
    // lookups
    findBout, boutsForGame, findGladiatorSchool, gladiatorSchoolsInSettlement,
    gladiatorSchoolsOfLanista, findGame, gamesInSettlement, gladiatorsOfSchool,
    // the abstract bout resolver
    rollGladiatorBoutOutcome, rollCrowdReaction, resolveBoutAbstract,
    // G2 — the arena: recruit · schedule · resolve-and-commit · hold a game · free
    recruitGladiator, freeGladiator, scheduleBout, resolveAndCommitBout, holdGame,
    // G2 UI reads
    gladiatorSchoolsList, gamesList, boutsList, boutsForSchool, gladiatorsSubsystemActive,
    // G3 — catalogs + amphitheater + training
    AMPHITHEATER_SIZE, AMPHITHEATER_MAX_SEATS, GLADIATOR_TRAINING_BY_TYPE, UPRISING_MODIFIERS,
    amphitheaterSeatsForClassFamilies, amphitheaterSeatsForSettlement, gladiatorTrainingMonths,
    // G3 — training clock + the monthly business loop
    trainGladiator, gladiatorTrainingInfo, resolveGraduation, schoolRosterCount, schoolStaffWages,
    schoolUpkeepGp, schoolMonthlyPL, estimateSchoolMonthlyRent, runSchoolBusinessMonth,
    // G4 — uprisings + sponsoring
    uprisingModifiers, checkUprising, sponsorGame,
    // the slot-62 day-tick consumer (training graduations + the month-end business loop)
    proposeGladiatorDay, commitGladiatorRecord
  });

  // Self-register the slot-62 day-tick consumer (Calendar §14; registerDayConsumer ships from
  // acks-engine.js, loaded first — call-time guard). No pause triggers (the sage-commission precedent):
  // training graduations + the month-end school P&L are propose-review-commit records, not GM-blocking.
  // commitTurn drives it to month end via runDayTickToMonthEnd, so it never touches commitTurn directly.
  if(typeof ACKS.registerDayConsumer === 'function'){
    ACKS.registerDayConsumer('gladiators', {
      handler: proposeGladiatorDay,
      order: 62,
      pauseTriggers: [],
      commit: commitGladiatorRecord
    });
  }

})(typeof window !== 'undefined' ? window : global);
