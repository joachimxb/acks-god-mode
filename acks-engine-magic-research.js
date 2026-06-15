/* ACKS God Mode — acks-engine-magic-research.js
 * The Arcane Domain — Magic Research (the consumer of the arcane economy). Phase 4, Wave AD-M1.
 *
 * Spec: Phase_4_Magic_Research_Plan.md (the core machine §2 + the component seam §3 + the Research
 * Project entity §5 + the AD-M1 staples §4.1/§4.2/§4.3 — spell research, identify, item creation).
 * Built ON the SHIPPED arcane economy core (acks-engine-sanctums.js — the §5 five-accessor contract:
 * arcanePowerAvailable / spendArcanePower / specialComponentsHeldBy / researchFacilityFor /
 * researchAssistantsFor) + the Notable-Item model (acks-engine-entities.js blankNotableItem) + the
 * Layer-1 throw resolver (acks-engine-proficiencies.js rollProficiencyThrow — the plan §2.3 graduation:
 * the magic research throw is a 1d20-vs-target throw with autoFailBand 3, RR p.388). Sibling of the
 * religion / arcane power-consumer idioms (the monthly processX-ForTurn hooked into commitTurn + the
 * record-only _recordEvent).
 *
 * THIS SLICE (AD-M1 — the core machine + the L5–L9 staples):
 *   - RESEARCH_RATE_BY_LEVEL (RR p.388) + MAGIC_RESEARCH_KINDS (the 3 staples available; the 6 high-tier
 *     kinds present-but-gated for AD-M2/M3) + MAGIC_ITEM_COST (the creation-cost table, RR pp.391–393)
 *     + RESEARCH_PROFICIENCY_MODS (Magical Engineering / Loremastery / Alchemy — the staple-touching set).
 *   - blankResearchProject (rsp-, engine-registered) + the cost / rate / throw / component-substitution model.
 *   - startResearchProject (validate + debit material at start + status in-progress) → processResearchForTurn
 *     (the MONTHLY accrual: researchInvestedGp += totalRate×30 → awaiting-throw / auto-complete no-throw)
 *     → payAndRollResearchThrow (assemble component payment via the §5 seam → the 1d20 throw → completed /
 *     failed-with-total-loss) → abandonResearchProject. Result application: spell formula (character.
 *     magicFormulas[]) / item identification (notableItem.identification) / a minted Notable Item.
 *
 * AD-M2 (the high-tier kinds — RR pp.394–398): the four HD/ability-costed kinds flipped available —
 *   construct DESIGN (→ a formula) + MANUFACTURE, CROSSBREED, NECROMANCY (L11; craftpriest L9 for
 *   constructs; necromancy requires a Chaotic caster). Cost = 2,000/HD + 625/minor + 5,000/major; throw
 *   +1 per 5,000gp (necromancy +2/5,000 if unwilling); the Black-Lore-of-Zahar / Transmogrification
 *   dark-research proficiencies (+2 levels eligibility, +2 throw, +10% rate). The manufacturing kinds MINT
 *   a creature (a count-N Group via blankGroup) whose disposition is a 2d6 reaction (the shipped
 *   rollEncounterReaction) — auto-controlled for a mindless construct / willing undead / preserved-memory
 *   crossbreed, else friendly/indifferent/neutral → controlled vs unfriendly/hostile → free-willed; +3
 *   record-only events (construct-manufactured / crossbreed-created / necromancy-performed).
 *
 * AD-M3 (rituals — RR p.398): the two ritual kinds flipped available — LEARN (→ the caster's ritual
 *   repertoire, a magicFormula kind:'ritual'; gated by the Ritual Spell Repertoire cap = base(level) + key-
 *   attribute mod PER ritual level) + CAST (→ takes effect immediately, GM-resolved/deferred, OR is stored as
 *   a single charge: a scroll / a ring·rod·staff·wand Notable Item). Cost = 50k/100k/200k by ritual level 7/8/9
 *   (cast pays it again as the component, monster parts — never miscellaneous); throw +ritual level; learnable
 *   /castable by arcane OR divine casters (the divine rituals + divine-power components are the Religion seam,
 *   flagged in RITUAL_CATALOG, not blocked). +2 record-only events (ritual-learned / ritual-cast). RITUAL_CATALOG
 *   seeds 15 sample rituals (RAW names + per-school levels + a terse gloss + the deferred-effect owner; §13.6 IP).
 *
 * DEFERRED (later AD-M waves, stacked on this branch):
 * AD-M4 (experimentation — advantages/methods/breakthroughs/mishaps), and the PER-DAY day-tick grain for
 * research accrual (the monthly model ships — the visible-planning-info path, consistent with the arcane
 * core's deferral; §2.2). Divine research (eligibility + divine-power-as-component) is the Religion plan's
 * seam (plan §14 Q3). Facilities GATE softly until AD-B ships the Sanctum facility model. Per §6 polarity
 * NO house rule — necromancy is core RAW (the blood-sacrifice precedent); a default-OFF disable-necromancy
 * opt-out is the §6-correct way to add an off-switch if a table wants one.
 *
 * RAW-default polarity (§8): NO house rule — magic research is core RAW for arcane casters, dormant-until-
 * used (an empty campaign.researchProjects[] is a no-op, like the arcane domain with no dungeon). The
 * necromancy/experimentation content gates land with AD-M2/AD-M4. No new entity beyond the rsp- Research
 * Project (registered); no new prefix beyond rsp-; no save migration (researchProjects[] is lazy-defaulted
 * + read defensively; character.magicFormulas[] is additive init-on-write, so templates stay no-ops).
 *
 * Loads after acks-engine-sanctums.js (the §5 accessors) + acks-engine-proficiencies.js (rollProficiency
 * Throw) + the canonical set (newId / ID_PREFIXES / abilityMod / newEvent / setEventContext / blankNotableItem).
 * Self-contained: pure reads + setters over a passed campaign; cross-module helpers resolve at CALL time
 * off global.ACKS (the sanctums/religion late-bind idiom — every module is present by the time a verb runs).
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  const SCHEMA_VERSION = 2;
  const newId = function(prefix){ return global.ACKS.newId(prefix); };
  const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES || {})[key]; } });
  function _A(){ return global.ACKS || ACKS; }

  const DAYS_PER_MONTH = 30;   // the project's month convention (Calendar §15; mirrors sanctums)

  // ── Defensive collection reads ──
  function _projects(campaign){ return (campaign && Array.isArray(campaign.researchProjects)) ? campaign.researchProjects : []; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _findChar(campaign, id){ if(id && typeof id === 'object') return id; return _chars(campaign).find(c => c && c.id === id) || null; }
  function _notableItems(campaign){ return (campaign && Array.isArray(campaign.notableItems)) ? campaign.notableItems : []; }
  function _findNotableItem(campaign, id){ return _notableItems(campaign).find(it => it && it.id === id) || null; }
  function _currentTurn(campaign){ return (campaign && typeof campaign.currentTurn === 'number') ? campaign.currentTurn : 1; }
  function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
  function _intMod(ch){ const A = _A(); const fn = (typeof A.abilityMod === 'function') ? A.abilityMod : (s => Math.floor(((Number(s)||10) - 10) / 3)); return fn((ch && ch.abilities && ch.abilities.INT) || 10); }
  function _profRanks(ch, key){ const A = _A(); return (typeof A.proficiencyRanks === 'function') ? A.proficiencyRanks(ch, key) : 0; }
  function _round(n){ return Math.round(Number(n) || 0); }
  function _chaMod(ch){ const A = _A(); const fn = (typeof A.abilityMod === 'function') ? A.abilityMod : (s => Math.floor(((Number(s)||10) - 10) / 3)); return fn((ch && ch.abilities && ch.abilities.CHA) || 10); }
  function _findGroup(campaign, id){ const A = _A(); if(typeof A.findGroup === 'function') return A.findGroup(campaign, id); return (campaign && Array.isArray(campaign.groups) ? campaign.groups : []).find(g => g && g.id === id) || null; }
  // AD-M2 eligibility helpers (RR pp.394–398).
  function _isCraftpriest(ch){ return !!(ch && /craftpriest/i.test(ch.class || '')); }   // dwarven craftpriest builds constructs at L9
  function _isChaotic(ch){ return !!(ch && /chaotic/i.test(ch.alignment || '')); }       // necromancy requires a Chaotic caster
  // AD-M2 cost (RR pp.394–398): 2,000gp/HD + 625gp/minor ability + 5,000gp/major ability.
  function _hdAbilityCost(cfg){
    cfg = cfg || {};
    const hd = Math.max(0, Math.floor(Number(cfg.hd) || 0));
    const minor = Math.max(0, Math.floor(Number(cfg.minorAbilities) || 0));
    const major = Math.max(0, Math.floor(Number(cfg.majorAbilities) || 0));
    return 2000 * hd + 625 * minor + 5000 * major;
  }
  // The "eligibility as +N caster levels" bonus a held proficiency confers for a kind (RR p.389) —
  // applied once per proficiency held (Black Lore → necromancy; Transmogrification → crossbreed).
  function _eligibilityLevelBonus(ch, kind){
    let bonus = 0;
    for(const key of Object.keys(RESEARCH_PROFICIENCY_MODS)){
      const m = RESEARCH_PROFICIENCY_MODS[key];
      if(!m.levelBonus) continue;
      if(m.domains !== 'all' && (!Array.isArray(m.domains) || m.domains.indexOf(kind) < 0)) continue;
      if(_profRanks(ch, key) > 0) bonus += m.levelBonus;
    }
    return bonus;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Catalogs (RR p.388, pp.391–393, p.389)
  // ════════════════════════════════════════════════════════════════════════════

  // Research rate (gp/day) + the magic research throw target by caster level (RR p.388).
  // The L12–14 high rate applies ONLY to crossbreeding / constructs / necromancy / ritual magic;
  // all other projects use 1,750 at L12+ (the table's footnote).
  const RESEARCH_RATE_BY_LEVEL = Object.freeze([
    { level: 0,  rate: 2.5,    throwTarget: 18 },
    { level: 1,  rate: 5,      throwTarget: 16 },
    { level: 2,  rate: 7,      throwTarget: 15 },
    { level: 3,  rate: 15,     throwTarget: 14 },
    { level: 4,  rate: 25,     throwTarget: 13 },
    { level: 5,  rate: 50,     throwTarget: 12 },
    { level: 6,  rate: 100,    throwTarget: 11 },
    { level: 7,  rate: 200,    throwTarget: 10 },
    { level: 8,  rate: 400,    throwTarget: 9  },
    { level: 9,  rate: 600,    throwTarget: 8  },
    { level: 10, rate: 900,    throwTarget: 7  },
    { level: 11, rate: 1750,   throwTarget: 6  },
    { level: 12, rate: 2750,   throwTarget: 5  },   // high-tier only; else 1750 (see _rateForLevel)
    { level: 13, rate: 5250,   throwTarget: 4  },   // "
    { level: 14, rate: 14500,  throwTarget: 3  }    // "
  ]);
  const HIGH_TIER_KINDS = Object.freeze(new Set(['construct-design','construct-manufacture','crossbreed','necromancy','ritual-learn','ritual-cast']));

  // The ten project kinds (plan §4). AD-M1 shipped the 3 staples; AD-M2 adds the four HD/ability-costed
  // high-tier kinds (construct design + manufacture, crossbreed, necromancy — L11, craftpriest L9 for
  // constructs); the 2 ritual kinds stay present-but-gated until AD-M3. minLevel for item-creation is 5
  // for one-use (scroll/potion) / 9 otherwise — resolved live in researchEffectiveMinLevel; the construct
  // craftpriest L9 exception + the necromancy/crossbreed proficiency level bonus live in isEligibleResearcher.
  // hdAbility:true marks the kinds whose cost = 2,000/HD + 625/minor + 5,000/major (RR pp.394–398).
  const MAGIC_RESEARCH_KINDS = Object.freeze({
    'spell-research':        { label: 'Spell research',        icon: '📜', minLevel: 5,  facilityKind: 'library',  available: true,  domainTagged: true },
    'identify':              { label: 'Identify magic item',   icon: '🔎', minLevel: 5,  facilityKind: 'library',  available: true,  needsSample: true },
    'item-creation':         { label: 'Create magic item',     icon: '🛠', minLevel: 5,  facilityKind: 'workshop', available: true,  domainTagged: true },
    // High-tier (AD-M2; RR pp.394–398) — HD/ability-costed; throw +1 per 5,000gp; mint a creature/formula.
    'construct-design':      { label: 'Design construct',      icon: '⚙', minLevel: 11, facilityKind: 'library',  available: true,  hdAbility: true, mintsFormula: true },
    'construct-manufacture': { label: 'Manufacture construct', icon: '⚙', minLevel: 11, facilityKind: 'workshop', available: true,  hdAbility: true, mintsCreature: true },
    'crossbreed':            { label: 'Crossbreed',            icon: '🧬', minLevel: 11, facilityKind: 'crossbreeding-lab', available: true, hdAbility: true, mintsCreature: true },
    'necromancy':            { label: 'Perform necromancy',    icon: '💀', minLevel: 11, facilityKind: 'mortuary', available: true,  hdAbility: true, mintsCreature: true },
    // Rituals (AD-M3; RR p.398) — L11+ arcane OR divine; cost 50k/100k/200k by ritual level; repertoire-capped.
    'ritual-learn':          { label: 'Learn ritual',          icon: '✴', minLevel: 11, facilityKind: 'library',  available: true,  ritual: true },
    'ritual-cast':           { label: 'Cast ritual',           icon: '✴', minLevel: 11, facilityKind: 'workshop', available: true,  ritual: true }
  });

  // Magic Item Creation cost (RR pp.391–393) — the base cost = component = material = research. Per RAW
  // the cost is 500 × spell-effect level × an effect-type multiplier; permanent bonuses are flat.
  // cfg: { effectType, spellLevel, charges, activationRate, permanentDuration, enchantBonus }.
  const ITEM_ACTIVATION_MULT = Object.freeze({ '1/week': 6, '1/day': 8, '2/day': 10, '3/day': 12, '1/hour': 16, '1/3-turns': 25, '1/turn': 33, 'at-will': 50 });
  const ITEM_PERMANENT_MULT  = Object.freeze({ '1-day': 15, '1-hour': 24, '3-turns': 38, '1-turn': 50, 'by-caster-level': 38 });
  const ITEM_BONUS_COST      = Object.freeze({ 1: 5000, 2: 15000, 3: 35000 });   // +1 / +1→+2 (=+10k) / +2→+3 (=+20k), cumulative

  // ── Proficiency / power modifiers (RR p.389). Each entry: { throwPerRank, ratePctPerRank,
  // domains:[kinds it applies to] | 'all', levelBonus? }. Read off the researcher's proficiencies[]
  // (the canonical {key,ranks} reader) + the project kind. levelBonus = "eligibility as +N caster levels"
  // (RR p.389) — applied once when the proficiency is held (≥1 rank), lowering the kind's min level in
  // isEligibleResearcher. AD-M2 adds the necromancy/crossbreed dark-research paths; the summoning/
  // protection/enchantment masteries (domain-tagged for spell/item research) follow when magicDomain
  // research is exercised. ──
  const RESEARCH_PROFICIENCY_MODS = Object.freeze({
    'magical-engineering': { throwPerRank: 1, ratePctPerRank: 5,  domains: 'all',                 label: 'Magical Engineering' },
    'loremastery':         { throwPerRank: 2, ratePctPerRank: 0,  domains: ['identify'],          label: 'Loremastery (identify)' },
    'alchemy':             { throwPerRank: 1, ratePctPerRank: 5,  domains: ['item-creation'],     label: 'Alchemy (potions)' },
    // AD-M2 high-tier paths (RR p.389): eligibility as +2 caster levels; +2 throw; +10% rate.
    'black-lore-of-zahar': { throwPerRank: 2, ratePctPerRank: 10, domains: ['necromancy'], levelBonus: 2, label: 'Black Lore of Zahar' },
    'transmogrification':  { throwPerRank: 2, ratePctPerRank: 10, domains: ['crossbreed'], levelBonus: 2, label: 'Transmogrification' }
  });

  // ── Rituals (AD-M3; RR p.398) ──
  // Material & Research each = 50k/100k/200k for ritual level 7/8/9; ritual-cast pays that AGAIN as the
  // component (in monster parts whose total XP value = the cost — never miscellaneous components, RR p.398).
  const RITUAL_COST_BY_LEVEL = Object.freeze({ 7: 50000, 8: 100000, 9: 200000 });
  // Ritual Spell Repertoire (RR p.398): base by caster level + the key-attribute modifier (INT arcane /
  // WIL divine), counted PER ritual level (each of 7/8/9 independently).
  const RITUAL_REPERTOIRE_BASE = Object.freeze({ 11: 1, 12: 2, 13: 3, 14: 4 });

  // A seed of sample ritual spells (RR p.398 "Sample Ritual Spells"). RAW names + per-school levels + schools
  // + a TERSE gloss in our own words + the deferred-effect owner — the effect content is NOT transcribed and
  // lands per-ritual as its consuming subsystem matures (many touch domains/weather/cosmology; several are
  // Religion-owned divine rituals — RR §13.6 IP). arcane/divine = the ritual level for that school (null = not
  // available to it). powerOnly = the component must be paid with arcane/divine power, not monster parts;
  // divinePowerOnly = specifically DIVINE power (a Religion-owned ritual the arcane wave only flags).
  const RITUAL_CATALOG = Object.freeze([
    { key: 'ranine-rain',         name: 'Ranine Rain',         arcane: 7,    divine: 7,    tags: ['summoning'],        gloss: 'Call down an unnatural rain of creatures over a vast area.',        deferredTo: 'weather' },
    { key: 'seven-league-stride', name: 'Seven-League Stride', arcane: 7,    divine: 7,    tags: ['movement'],         gloss: 'Stride leagues across the world in a single step.',                 deferredTo: 'journeys' },
    { key: 'spawn-of-the-deep',   name: 'Spawn of the Deep',   arcane: 7,    divine: 7,    tags: ['summoning'],        gloss: 'Summon monstrous spawn from the deep waters.' },
    { key: 'magic-mushrooms',     name: 'Magic Mushrooms',     arcane: null, divine: 7,    tags: ['transmogrification'], gloss: 'Make magical mushrooms flourish across a region.',                 deferredTo: 'dwarven' },
    { key: 'consonant-transit',   name: 'Consonant Transit',   arcane: 8,    divine: 8,    tags: ['movement'],         gloss: 'Travel instantly between linked locations across great distance.',  deferredTo: 'journeys' },
    { key: 'consume-power',       name: 'Consume Power',       arcane: 8,    divine: 8,    tags: ['protection','transmogrification'], gloss: 'Devour a target’s magical power.',                  deferredTo: 'magic' },
    { key: 'emissary',            name: 'Emissary',            arcane: 8,    divine: null, tags: [],                   gloss: 'Send forth a magical emissary in your stead.' },
    { key: 'palace-of-sulaimon',  name: 'Palace of Sulaimon',  arcane: 8,    divine: null, tags: ['summoning'],        gloss: 'Conjure an extradimensional palace.' },
    { key: 'permanency',          name: 'Permanency',          arcane: 8,    divine: 8,    tags: [],                   gloss: 'Make a temporary spell effect permanent.',                         deferredTo: 'magic' },
    { key: 'apotheosis',          name: 'Apotheosis',          arcane: 9,    divine: 9,    tags: ['transmogrification'], powerOnly: true, gloss: 'Transfigure a living or undead creature into a deathless immortal.', deferredTo: 'religion' },
    { key: 'cataclysm',           name: 'Cataclysm',           arcane: null, divine: 9,    tags: ['blast'], powerOnly: true, divinePowerOnly: true, gloss: 'Doom a target domain to ruin amid mounting portents.', deferredTo: 'religion' },
    { key: 'flying-fortress',     name: 'Flying Fortress',     arcane: 9,    divine: null, tags: [],                   gloss: 'Raise a fortress that floats free and takes to the air.',          deferredTo: 'construction' },
    { key: 'miracle',             name: 'Miracle',             arcane: null, divine: 9,    tags: [], powerOnly: true, divinePowerOnly: true, gloss: 'Petition a god to reshape reality.',                deferredTo: 'religion' },
    { key: 'plague',              name: 'Plague',              arcane: 9,    divine: null, tags: ['death'],            gloss: 'Unleash a spreading plague over an unlimited range.',               deferredTo: 'disease' },
    { key: 'shadeveil',           name: 'Shadeveil',           arcane: 9,    divine: null, tags: ['illusion','enchantment','transmogrification'], gloss: 'Veil a wide region in shadow and waking illusion.' }
  ]);
  const RITUAL_BY_KEY = Object.freeze(RITUAL_CATALOG.reduce((m, r) => { m[r.key] = r; return m; }, {}));

  // ════════════════════════════════════════════════════════════════════════════
  // Core machine — rate, eligibility, cost (RR p.388, p.390)
  // ════════════════════════════════════════════════════════════════════════════

  function _clampLevel(level){ return Math.max(0, Math.min(14, Math.floor(Number(level) || 0))); }
  function magicResearchKind(key){ return MAGIC_RESEARCH_KINDS[key] || null; }
  function availableResearchKinds(){ return Object.keys(MAGIC_RESEARCH_KINDS).filter(k => MAGIC_RESEARCH_KINDS[k].available); }

  // The research rate (gp/day) + throw target for a level (RR p.388). The L12+ rate uses 1,750 unless the
  // kind is high-tier (construct/crossbreed/necromancy/ritual).
  function researchRateForLevel(level, kind){
    const row = RESEARCH_RATE_BY_LEVEL[_clampLevel(level)];
    let rate = row.rate;
    if(_clampLevel(level) >= 12 && !HIGH_TIER_KINDS.has(kind)) rate = 1750;
    return { rate, throwTarget: row.throwTarget };
  }

  // The effective min caster level for a kind+config: item-creation = 5 for one-use (scroll/potion),
  // 9 for any other item form (RR p.391); constructs = 9 for a dwarven craftpriest (RR p.394) else 11;
  // everything else = the catalog minLevel. The optional `character` enables the craftpriest exception.
  function researchEffectiveMinLevel(kind, cfg, character){
    cfg = cfg || {};
    const meta = MAGIC_RESEARCH_KINDS[kind];
    if(!meta) return 99;
    if(kind === 'item-creation') return (cfg.effectType === 'one-use') ? 5 : 9;
    if((kind === 'construct-design' || kind === 'construct-manufacture') && _isCraftpriest(character)) return 9;
    return meta.minLevel;
  }

  // Is this character eligible to lead this research project? (arcane caster ≥ the effective min level).
  // AD-M2: constructs may also be built by a dwarven craftpriest (RR p.394); necromancy requires a Chaotic
  // caster (RR p.396); the Black-Lore / Transmogrification dark-research proficiencies confer eligibility
  // as +2 caster levels (RR p.389). Divine-caster spell-research eligibility (+ "cannot research spells")
  // is the Religion plan's seam (plan §14 Q3). Returns { ok, reason }.
  function isEligibleResearcher(campaign, character, kind, cfg){
    const A = _A();
    const ch = _findChar(campaign, character);
    if(!ch) return { ok: false, reason: 'no-character' };
    const meta = MAGIC_RESEARCH_KINDS[kind];
    if(!meta) return { ok: false, reason: 'unknown-kind' };
    if(!meta.available) return { ok: false, reason: 'kind-not-yet-available' };
    const isArcane = (typeof A.isArcaneCaster === 'function') ? A.isArcaneCaster(ch) : false;
    const isDivine = (typeof A.isDivineCaster === 'function') ? A.isDivineCaster(ch) : false;
    const isConstruct = (kind === 'construct-design' || kind === 'construct-manufacture');
    const isRitual = (kind === 'ritual-learn' || kind === 'ritual-cast');
    if(isConstruct){
      if(!isArcane && !_isCraftpriest(ch)) return { ok: false, reason: 'not-an-arcane-caster-or-craftpriest' };
    } else if(isRitual){
      // Rituals are learnable/castable by arcane OR divine casters (RR p.398; the divine rituals + divine-power
      // components are the Religion seam, plan §14 Q3 — flagged in the catalog, not blocked here).
      if(!isArcane && !isDivine) return { ok: false, reason: 'not-a-spellcaster' };
    } else if(!isArcane){
      return { ok: false, reason: 'not-an-arcane-caster' };
    }
    if(kind === 'necromancy' && !_isChaotic(ch)) return { ok: false, reason: 'not-chaotic' };
    const min = researchEffectiveMinLevel(kind, cfg, ch);
    const effLevel = (Number(ch.level) || 0) + _eligibilityLevelBonus(ch, kind);   // RR p.389 proficiency level bonus
    if(effLevel < min) return { ok: false, reason: 'level-too-low', minLevel: min };
    // Ritual-specific gates (RR p.398): cast needs the ritual in repertoire; learn needs repertoire space.
    if(kind === 'ritual-cast'){
      const key = cfg && cfg.ritualKey;
      if(key && !ritualInRepertoire(campaign, ch, key)) return { ok: false, reason: 'ritual-not-in-repertoire' };
    } else if(kind === 'ritual-learn'){
      const rl = _clampRitualLevel(cfg && cfg.ritualLevel);
      const cap = ritualRepertoireCap(campaign, ch);
      if(ritualsKnown(campaign, ch, rl).length >= cap) return { ok: false, reason: 'ritual-repertoire-full', cap, ritualLevel: rl };
    }
    return { ok: true };
  }

  // ── Rituals — repertoire + catalog (RR p.398) ──
  function ritualCatalogEntry(key){ return RITUAL_BY_KEY[key] || null; }
  // The key spellcasting attribute for ritual repertoire: WIL for a pure divine caster, else INT (arcane).
  function ritualKeyAttributeFor(campaign, character){
    const A = _A();
    const ch = _findChar(campaign, character);
    if(!ch) return 'INT';
    const arcane = (typeof A.isArcaneCaster === 'function') && A.isArcaneCaster(ch);
    const divine = (typeof A.isDivineCaster === 'function') && A.isDivineCaster(ch);
    return (divine && !arcane) ? 'WIL' : 'INT';
  }
  function _abilityModOf(ch, attr){
    const A = _A();
    const fn = (typeof A.abilityMod === 'function') ? A.abilityMod : (s => Math.floor(((Number(s)||10)-10)/3));
    return fn((ch && ch.abilities && ch.abilities[attr]) || 10);
  }
  // Ritual Spell Repertoire cap PER ritual level (RR p.398): base(caster level) + key-attribute modifier.
  function ritualRepertoireCap(campaign, character){
    const ch = _findChar(campaign, character);
    if(!ch) return 0;
    const lvl = Number(ch.level) || 0;
    if(lvl < 11) return 0;
    const base = (RITUAL_REPERTOIRE_BASE[lvl] != null) ? RITUAL_REPERTOIRE_BASE[lvl] : (lvl >= 14 ? 4 : 1);
    return Math.max(0, base + _abilityModOf(ch, ritualKeyAttributeFor(campaign, ch)));
  }
  // The rituals a caster has learned (magicFormulas kind:'ritual'); filterable by ritual level.
  function ritualsKnown(campaign, character, ritualLevel){
    const ch = _findChar(campaign, character);
    if(!ch || !Array.isArray(ch.magicFormulas)) return [];
    return ch.magicFormulas.filter(f => f && f.kind === 'ritual' && (ritualLevel == null || Number(f.ritualLevel) === Number(ritualLevel)));
  }
  function ritualInRepertoire(campaign, character, ritualKey){
    if(!ritualKey) return false;
    const want = String(ritualKey).toLowerCase();
    return ritualsKnown(campaign, character).some(f => f && (f.ritualKey === ritualKey || (f.name && f.name.toLowerCase() === want)));
  }
  // The ritual level a given caster casts a catalog ritual at (its school's level): WIL→divine else arcane;
  // falls back to whichever school the ritual offers. null if the ritual key is unknown.
  function ritualLevelFor(campaign, character, ritualKey){
    const r = RITUAL_BY_KEY[ritualKey]; if(!r) return null;
    const attr = ritualKeyAttributeFor(campaign, character);
    const lvl = (attr === 'WIL') ? (r.divine != null ? r.divine : r.arcane) : (r.arcane != null ? r.arcane : r.divine);
    return (lvl != null) ? lvl : null;
  }

  // Magic Item Creation cost (RR pp.391–393). Returns the base cost (gp). Permanent bonuses are cumulative.
  function magicItemCreationCost(cfg){
    cfg = cfg || {};
    const lvl = Math.max(1, Math.floor(Number(cfg.spellLevel) || 1));
    const et = cfg.effectType || 'one-use';
    if(et === 'permanent-bonus'){
      const b = Math.max(1, Math.min(3, Math.floor(Number(cfg.enchantBonus) || 1)));
      return ITEM_BONUS_COST[b] || ITEM_BONUS_COST[1];
    }
    if(et === 'one-use')   return 500 * lvl;
    if(et === 'charged')   return 500 * lvl * Math.max(1, Math.floor(Number(cfg.charges) || 1));
    if(et === 'activated') return 500 * lvl * (ITEM_ACTIVATION_MULT[cfg.activationRate] || 6);
    if(et === 'at-will')   return 500 * lvl * ITEM_ACTIVATION_MULT['at-will'];
    if(et === 'permanent') return 500 * lvl * (ITEM_PERMANENT_MULT[cfg.permanentDuration] || 15);
    return 500 * lvl;
  }

  // The three cost pools for a project (RR p.388). In most cases all three equal the base cost; the
  // staples deviate (spell research / identify have no component cost). cfg carries the per-kind inputs.
  function researchProjectCosts(kind, cfg){
    cfg = cfg || {};
    if(kind === 'spell-research'){
      const lvl = Math.max(1, Math.floor(Number(cfg.spellLevel) || 1));
      const c = 1000 * lvl;
      return { componentCostGp: 0, materialCostGp: c, researchCostGp: c, baseCost: c };
    }
    if(kind === 'identify'){
      return { componentCostGp: 0, materialCostGp: 1000, researchCostGp: 1000, baseCost: 1000 };
    }
    if(kind === 'item-creation'){
      const c = magicItemCreationCost(cfg);
      return { componentCostGp: c, materialCostGp: c, researchCostGp: c, baseCost: c };
    }
    // High-tier kinds (AD-M2; RR pp.394–398) — HD/ability-costed. Material & Research each = the base;
    // component = none for construct/crossbreed (paid in dead bodies / killed progenitors — a requirement,
    // not gp) EXCEPT necromancy, whose component = monster parts of XP-value equal to the base cost.
    if(kind === 'construct-design' || kind === 'construct-manufacture' || kind === 'crossbreed'){
      const c = _hdAbilityCost(cfg);
      return { componentCostGp: 0, materialCostGp: c, researchCostGp: c, baseCost: c };
    }
    if(kind === 'necromancy'){
      const c = _hdAbilityCost(cfg);
      return { componentCostGp: c, materialCostGp: c, researchCostGp: c, baseCost: c };
    }
    // Rituals (AD-M3; RR p.398): Material & Research each = 50k/100k/200k for ritual level 7/8/9; ritual-cast
    // ALSO pays that as the component (monster parts — never miscellaneous); ritual-learn has no component.
    if(kind === 'ritual-learn' || kind === 'ritual-cast'){
      const rl = _clampRitualLevel(cfg.ritualLevel);
      const c = RITUAL_COST_BY_LEVEL[rl] || RITUAL_COST_BY_LEVEL[7];
      return { componentCostGp: (kind === 'ritual-cast') ? c : 0, materialCostGp: c, researchCostGp: c, baseCost: c };
    }
    return { componentCostGp: 0, materialCostGp: 0, researchCostGp: 0, baseCost: 0 };
  }
  function _clampRitualLevel(lvl){ return Math.max(7, Math.min(9, Math.floor(Number(lvl) || 7))); }

  // The per-kind throw-target BUMP (RR p.388 + per-kind): spell research adds the spell level; identify
  // adds the spell-levels imbued; item creation adds the total spell-effect level (+1/+3/+6 for a +1/+2/+3
  // permanent bonus). Higher target = harder.
  function _throwTargetBump(kind, cfg){
    cfg = cfg || {};
    if(kind === 'spell-research') return Math.max(0, Math.floor(Number(cfg.spellLevel) || 0));
    if(kind === 'identify')       return Math.max(0, Math.floor(Number(cfg.spellLevelsImbued) || 0));
    if(kind === 'item-creation'){
      if(cfg.effectType === 'permanent-bonus'){ const b = Math.max(1, Math.min(3, Math.floor(Number(cfg.enchantBonus) || 1))); return ({1:1,2:3,3:6})[b] || 1; }
      return Math.max(0, Math.floor(Number(cfg.spellLevel) || 0));
    }
    // High-tier (AD-M2): +1 per 5,000gp of cost (RR pp.394–396); necromancy +2/5,000 if unwilling (RR p.396).
    if(kind === 'construct-design' || kind === 'construct-manufacture' || kind === 'crossbreed'){
      return Math.floor(_hdAbilityCost(cfg) / 5000);
    }
    if(kind === 'necromancy'){
      return Math.floor(_hdAbilityCost(cfg) / 5000) * (cfg.willing ? 1 : 2);
    }
    // Rituals (AD-M3; RR p.398): the throw target is increased by the level of the ritual spell (7/8/9).
    if(kind === 'ritual-learn' || kind === 'ritual-cast'){
      return _clampRitualLevel(cfg.ritualLevel);
    }
    return 0;
  }

  // ── Research assistants + total rate (RR p.390) ──
  // A directly-aiding assistant adds his own research rate to the total. The researcher + each aiding
  // assistant. Magical Engineering adds +5%/rank to the total rate (RR p.389).
  function totalResearchRate(campaign, project){
    if(!project) return 0;
    const researcher = _findChar(campaign, project.researcherCharacterId);
    let total = researchRateForLevel(researcher ? researcher.level : 0, project.kind).rate;
    for(const aid of (project.assistantCharacterIds || [])){
      const a = _findChar(campaign, aid);
      if(a) total += researchRateForLevel(a.level, project.kind).rate;
    }
    // Proficiency rate bonuses (researcher's ranks): Magical Engineering (all) +5%/rank; Alchemy
    // (item-creation), Black Lore (necromancy), Transmogrification (crossbreed) at their ratePctPerRank.
    if(researcher){
      let pct = 0;
      for(const key of Object.keys(RESEARCH_PROFICIENCY_MODS)){
        const m = RESEARCH_PROFICIENCY_MODS[key];
        if(!m.ratePctPerRank) continue;
        if(m.domains !== 'all' && (!Array.isArray(m.domains) || m.domains.indexOf(project.kind) < 0)) continue;
        const ranks = _profRanks(researcher, key);
        if(ranks > 0) pct += m.ratePctPerRank * ranks;
      }
      if(pct > 0) total = total * (1 + pct / 100);
    }
    return total;
  }
  function researchDaysRemaining(campaign, project){
    if(!project) return 0;
    const rate = totalResearchRate(campaign, project);
    if(rate <= 0) return Infinity;
    const remaining = Math.max(0, (project.researchCostGp || 0) - (project.researchInvestedGp || 0));
    return Math.ceil(remaining / rate);
  }

  // ── The component-substitution penalty (RR p.388) ──
  // −1 per spell/effect level × (% of the component cost paid by inappropriate / miscellaneous
  // components), rounded up, min −1 when any such payment is used; 0 when none. Arcane power, special
  // (appropriate) components, and identified-item payment are penalty-free (and preserve the formula).
  function componentSubstitutionPenalty(componentPlan, effectLevel){
    const plan = componentPlan || {};
    const compCost = Math.max(0, Number(plan._componentCostGp) || 0);
    if(compCost <= 0) return 0;
    const penalized = Math.max(0, Number(plan.miscGp) || 0) + Math.max(0, Number(plan.inappropriateGp) || 0);
    if(penalized <= 0) return 0;
    const pct = Math.min(1, penalized / compCost);
    const lvl = Math.max(1, Math.floor(Number(effectLevel) || 1));
    return -Math.max(1, Math.ceil(lvl * pct));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // The throw (RR p.388) — graduates onto the Layer-1 resolver (autoFailBand 3)
  // ════════════════════════════════════════════════════════════════════════════

  // Itemized throw target + modifiers for a project (read-only; for the UI preview + the roll). target =
  // level throw target + per-kind bump; modifiers = +INT, +Magical-Engineering, +proficiency mods,
  // +facility bonus (max +3), +4 sample, + substitution penalty (negative). Effect level for the penalty
  // = the project's spell/effect level (≥1).
  function researchThrowInfo(campaign, project){
    const A = _A();
    const researcher = _findChar(campaign, project && project.researcherCharacterId);
    const kind = project && project.kind;
    const cfg = (project && project.config) || {};
    const levelInfo = researchRateForLevel(researcher ? researcher.level : 0, kind);
    const target = levelInfo.throwTarget + _throwTargetBump(kind, cfg);
    const modifiers = [];
    // INT bonus (RR p.388).
    if(researcher){ const intMod = _intMod(researcher); if(intMod) modifiers.push({ label: 'INT', value: intMod }); }
    // Proficiency / power mods (RR p.389).
    if(researcher){
      for(const key of Object.keys(RESEARCH_PROFICIENCY_MODS)){
        const m = RESEARCH_PROFICIENCY_MODS[key];
        if(m.domains !== 'all' && (!Array.isArray(m.domains) || m.domains.indexOf(kind) < 0)) continue;
        const ranks = _profRanks(researcher, key);
        if(ranks > 0 && m.throwPerRank) modifiers.push({ label: m.label, value: m.throwPerRank * ranks });
      }
    }
    // Facility quality bonus (max +3) — graceful stub until AD-B (researchFacilityFor returns null).
    const fac = _facilityBonus(campaign, researcher && researcher.id, project);
    if(fac > 0) modifiers.push({ label: 'facility', value: fac });
    // Working from a sample (+4) — item creation reverse-engineer / identify with the item in hand.
    if(project && project.fromSample) modifiers.push({ label: 'sample', value: 4 });
    // Component substitution penalty (negative), if a component plan is attached.
    const pen = Number(project && project.substitutionPenalty) || 0;
    if(pen) modifiers.push({ label: 'inappropriate components', value: pen });
    const modifierTotal = modifiers.reduce((s, m) => s + (Number(m.value) || 0), 0);
    const chance = (typeof A.throwSuccessChance === 'function') ? A.throwSuccessChance(target, modifierTotal, 3, false) : null;
    return { target, modifiers, modifierTotal, autoFailBand: 3, chance };
  }

  // Facility quality bonus: +1 per 10,000gp over the per-level minimum, max +3 (RR pp.391–398). Reads the
  // Sanctums §5 accessor (null until AD-B ships facilities → 0). 🔧 v1: the per-level MIN gate is soft
  // (no facility ⇒ a warning, not a block) since the facility model isn't shipped; AD-B hardens it.
  function _facilityBonus(campaign, charId, project){
    const A = _A();
    const meta = MAGIC_RESEARCH_KINDS[project && project.kind];
    if(!meta || !charId || typeof A.researchFacilityFor !== 'function') return 0;
    const fac = A.researchFacilityFor(campaign, charId, meta.facilityKind);
    if(!fac) return 0;
    const minValue = 4000;   // RR p.391 L1 minimum; per-level scaling refines at AD-B
    const over = Math.max(0, (Number(fac.valueGp) || 0) - minValue);
    return Math.min(3, Math.floor(over / 10000));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // The Research Project entity (rsp-, campaign.researchProjects[])
  // ════════════════════════════════════════════════════════════════════════════

  function blankResearchProject(opts={}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.researchProject),   // 'rsp-' (engine-registered)
      kind: opts.kind || 'spell-research',
      name: opts.name || '',
      magicDomain: opts.magicDomain || null,               // for proficiency mods (evocation/summoning/…)
      config: opts.config || {},                           // per-kind inputs (spellLevel, effectType, itemKind, charges, …)

      researcherCharacterId: opts.researcherCharacterId || null,
      assistantCharacterIds: Array.isArray(opts.assistantCharacterIds) ? opts.assistantCharacterIds.slice() : [],

      // Costs (RR p.388)
      baseCost: (opts.baseCost != null) ? opts.baseCost : 0,
      componentCostGp: (opts.componentCostGp != null) ? opts.componentCostGp : 0,
      materialCostGp: (opts.materialCostGp != null) ? opts.materialCostGp : 0,
      researchCostGp: (opts.researchCostGp != null) ? opts.researchCostGp : 0,
      materialPaid: opts.materialPaid || false,            // material paid at the start
      researchInvestedGp: opts.researchInvestedGp || 0,    // accrues at the total research rate
      componentPlan: opts.componentPlan || null,           // assembled at the throw step (§3)
      componentPaid: opts.componentPaid || false,
      substitutionPenalty: opts.substitutionPenalty || 0,  // derived from componentPlan (§3.2)

      // Throw (RR p.388)
      needsThrow: (opts.needsThrow != null) ? opts.needsThrow : true,   // false = common spell / from formula
      fromFormula: opts.fromFormula || false,
      fromSample: opts.fromSample || false,
      throwResult: opts.throwResult || null,               // {roll, total, target, succeeded, atTurn}

      // Facility (the Sanctums seam; resolved live)
      facilityKind: opts.facilityKind || (MAGIC_RESEARCH_KINDS[opts.kind || 'spell-research'] || {}).facilityKind || 'library',

      // Lifecycle
      status: opts.status || 'planning',                   // planning | in-progress | awaiting-throw | completed | failed | abandoned
      kindResult: opts.kindResult || {},                   // per-kind output (formula / notableItemId / identified)
      startedOnTurn: (opts.startedOnTurn != null) ? opts.startedOnTurn : null,
      completedOnTurn: (opts.completedOnTurn === undefined ? null : opts.completedOnTurn),
      history: opts.history || []
    };
  }

  function findResearchProject(campaign, id){ return _projects(campaign).find(p => p && p.id === id) || null; }
  // The projects a character leads OR aids.
  function researchProjectsFor(campaign, charId){
    return _projects(campaign).filter(p => p && (p.researcherCharacterId === charId || (p.assistantCharacterIds || []).indexOf(charId) >= 0));
  }
  function activeResearchProjects(campaign){ return _projects(campaign).filter(p => p && (p.status === 'in-progress' || p.status === 'awaiting-throw')); }

  // ── Start a project (validate + debit material at start + status in-progress) ──
  // opts: { kind, name, researcherCharacterId, assistantCharacterIds[], config{}, magicDomain,
  //         fromFormula, fromSample, commonSpell, needsThrow?, gmOverride }
  function startResearchProject(campaign, opts){
    opts = opts || {};
    const kind = opts.kind;
    const meta = MAGIC_RESEARCH_KINDS[kind];
    if(!meta) return { ok: false, reason: 'unknown-kind' };
    const researcher = _findChar(campaign, opts.researcherCharacterId);
    if(!researcher) return { ok: false, reason: 'no-researcher' };
    const cfg = opts.config || {};
    if(!opts.gmOverride){
      const elig = isEligibleResearcher(campaign, researcher, kind, cfg);
      if(!elig.ok) return { ok: false, reason: elig.reason, minLevel: elig.minLevel };
    }
    const costs = researchProjectCosts(kind, cfg);
    // needsThrow: a common spell (spell-research) or working from a formula needs no throw (RR p.390/p.391).
    let needsThrow = (opts.needsThrow != null) ? !!opts.needsThrow : true;
    if(opts.commonSpell || opts.fromFormula) needsThrow = false;
    if(kind === 'identify') needsThrow = true;     // identify always throws (RR p.393)
    if(kind === 'ritual-cast') needsThrow = true;  // casting a ritual always throws (RR p.398)
    const project = blankResearchProject({
      kind, name: opts.name || (meta.label + (cfg.targetName ? (': ' + cfg.targetName) : '')),
      magicDomain: opts.magicDomain || null,
      researcherCharacterId: researcher.id,
      assistantCharacterIds: opts.assistantCharacterIds || [],
      config: cfg,
      baseCost: costs.baseCost, componentCostGp: costs.componentCostGp,
      materialCostGp: costs.materialCostGp, researchCostGp: costs.researchCostGp,
      needsThrow, fromFormula: !!opts.fromFormula, fromSample: !!opts.fromSample,
      facilityKind: meta.facilityKind,
      status: 'in-progress', startedOnTurn: _currentTurn(campaign)
    });
    // Material cost paid at the start (RR p.388) — from the researcher's coin purse (the shipped model;
    // the harvest/keep precedent allows a negative balance + flags it).
    if(costs.materialCostGp > 0){
      if(!researcher.coins || typeof researcher.coins !== 'object') researcher.coins = { pp:0, gp:0, ep:0, sp:0, cp:0 };
      researcher.coins.gp = (Number(researcher.coins.gp) || 0) - costs.materialCostGp;
      if(typeof researcher.personalGp === 'number') researcher.personalGp = researcher.coins.gp;   // keep the synced mirror
      project.materialPaid = true;
    }
    if(!Array.isArray(campaign.researchProjects)) campaign.researchProjects = [];   // init-on-write
    campaign.researchProjects.push(project);
    project.history.push({ turn: _currentTurn(campaign), type: 'started', reason: meta.label + ' — material ' + costs.materialCostGp + 'gp paid; research ' + costs.researchCostGp + 'gp to invest' });
    _recordResearchEvent(campaign, 'magic-research-started',
      { projectId: project.id, kind, researcherCharacterId: researcher.id, baseCost: costs.baseCost, materialCostGp: costs.materialCostGp },
      { narrative: (researcher.name || researcher.id) + ' begins ' + meta.label.toLowerCase() + (project.name ? (' — ' + project.name) : ''),
        relatedEntities: [{ kind: 'character', id: researcher.id, role: 'subject' }] });
    return { ok: true, project, costs, materialShort: (researcher.coins && researcher.coins.gp < 0) };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // The MONTHLY accrual consumer (plan §5; the arcane/religion processX-ForTurn precedent)
  // ════════════════════════════════════════════════════════════════════════════

  // Hooked into commitTurn (after the arcane block). Each in-progress project accrues a month's research
  // (totalRate × 30, capped at the remaining cost). When fully invested it moves to 'awaiting-throw'
  // (the throw is a GM/player action — total loss on failure, never auto-rolled) OR auto-completes if
  // !needsThrow (applying the result). No house rule (RAW core, dormant — no projects ⇒ a no-op).
  // 🔧 v1: monthly grain (the per-day day-tick grain is deferred, consistent with the arcane core).
  function processResearchForTurn(campaign, options){
    const out = { ran: false, logEntries: [], advanced: 0, awaitingThrow: 0, completed: 0 };
    if(!campaign) return out;
    out.ran = true;
    for(const p of _projects(campaign)){
      if(!p || p.status !== 'in-progress') continue;
      const rate = totalResearchRate(campaign, p);
      const before = Number(p.researchInvestedGp) || 0;
      const remaining = Math.max(0, (Number(p.researchCostGp) || 0) - before);
      const add = Math.min(remaining, rate * DAYS_PER_MONTH);
      p.researchInvestedGp = before + add;
      out.advanced++;
      const researcher = _findChar(campaign, p.researcherCharacterId);
      const who = (researcher && researcher.name) || p.researcherCharacterId || 'a researcher';
      if(p.researchInvestedGp >= (Number(p.researchCostGp) || 0)){
        // Research labor complete.
        if(!p.needsThrow && (Number(p.componentCostGp) || 0) <= 0){
          // No throw + no components → auto-complete (duplicate a common spell / from a formula).
          _applyResearchResult(campaign, p);
          p.status = 'completed'; p.completedOnTurn = _currentTurn(campaign);
          p.history.push({ turn: _currentTurn(campaign), type: 'completed', reason: 'auto (no throw required)' });
          out.completed++;
          out.logEntries.push('🔬 ' + who + ' completes ' + (p.name || p.kind) + ' (no throw required)');
          _recordResearchEvent(campaign, 'magic-research-completed',
            { projectId: p.id, kind: p.kind, researcherCharacterId: p.researcherCharacterId, kindResult: p.kindResult },
            { narrative: who + ' completes ' + (p.name || p.kind), relatedEntities: [{ kind: 'character', id: p.researcherCharacterId, role: 'subject' }] });
        } else {
          p.status = 'awaiting-throw';
          p.history.push({ turn: _currentTurn(campaign), type: 'awaiting-throw', reason: 'research invested; pay components + roll the magic research throw' });
          out.awaitingThrow++;
          out.logEntries.push('🔬 ' + who + '’s ' + (p.name || p.kind) + ' is ready — pay components + roll the research throw' + (p.needsThrow ? '' : ' (no throw; pay components)'));
        }
      } else if(add > 0){
        out.logEntries.push('🔬 ' + who + ' invests ' + _round(add).toLocaleString() + 'gp toward ' + (p.name || p.kind) + ' (' + _round(p.researchInvestedGp).toLocaleString() + '/' + _round(p.researchCostGp).toLocaleString() + 'gp)');
        _recordResearchEvent(campaign, 'magic-research-progress',
          { projectId: p.id, kind: p.kind, researcherCharacterId: p.researcherCharacterId, investedGp: _round(p.researchInvestedGp), researchCostGp: p.researchCostGp },
          { campaignLogHidden: true, narrative: who + ' invests in ' + (p.name || p.kind), relatedEntities: [{ kind: 'character', id: p.researcherCharacterId, role: 'subject' }] });
      }
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Pay components + roll the throw (RR p.388) — the §3 component seam + the stakes
  // ════════════════════════════════════════════════════════════════════════════

  // Assemble the component payment (the §5 seam), compute the substitution penalty, then roll the magic
  // research throw. Components are ALWAYS consumed (RR p.388) — even on failure. On success → completed +
  // result applied. On failure → failed, and ALL investment (material + research labor + components) is
  // lost (the stakes — the UI must warn before the roll). Material was paid at the start; research labor
  // is forfeit; components just spent are forfeit.
  // opts: { componentPlan: { arcanePowerGp, specialItemValueGp, miscGp, inappropriateGp, identifiedItemId },
  //         rng, gmOverride }
  function payAndRollResearchThrow(campaign, projectId, opts){
    opts = opts || {};
    const A = _A();
    const project = findResearchProject(campaign, projectId);
    if(!project) return { ok: false, reason: 'no-project' };
    if(project.status !== 'awaiting-throw'){
      // Allow rolling if research is fully invested but the status hasn't ticked over (e.g. mid-month).
      if((Number(project.researchInvestedGp) || 0) < (Number(project.researchCostGp) || 0)) return { ok: false, reason: 'research-incomplete' };
    }
    const researcher = _findChar(campaign, project.researcherCharacterId);
    if(!researcher) return { ok: false, reason: 'no-researcher' };
    const plan = Object.assign({ arcanePowerGp: 0, specialItemValueGp: 0, miscGp: 0, inappropriateGp: 0, identifiedItemId: null, specialItemRefs: [] }, opts.componentPlan || {});
    // Rituals never use miscellaneous components (RR p.398) — only special components / arcane power.
    if(project.kind === 'ritual-learn' || project.kind === 'ritual-cast'){ plan.miscGp = 0; plan.inappropriateGp = 0; }
    const compCost = Math.max(0, Number(project.componentCostGp) || 0);

    // ── Pay the component cost (at the end, RR p.388) ──
    let assembled = 0;
    const consumed = { arcanePowerGp: 0, specialItems: [], miscGp: 0, inappropriateGp: 0 };
    if(compCost > 0){
      // 1. Arcane power (penalty-free; vicinity-gated via spendArcanePower).
      const wantArcane = Math.max(0, Math.round(Number(plan.arcanePowerGp) || 0));
      if(wantArcane > 0 && typeof A.spendArcanePower === 'function'){
        const sp = A.spendArcanePower(campaign, researcher.id, wantArcane);
        if(sp && sp.ok){ assembled += sp.spent; consumed.arcanePowerGp = sp.spent; }
        else return { ok: false, reason: 'arcane-power-unavailable', wanted: wantArcane, available: (typeof A.arcanePowerAvailable === 'function') ? A.arcanePowerAvailable(campaign, researcher.id) : 0 };
      }
      // 2. Special components (appropriate monster parts; penalty-free). Consume the chosen item lines.
      if(Array.isArray(plan.specialItemRefs) && plan.specialItemRefs.length){
        const got = _consumeSpecialComponents(campaign, researcher, plan.specialItemRefs);
        assembled += got.valueGp; consumed.specialItems = got.consumed;
      } else if((Number(plan.specialItemValueGp) || 0) > 0){
        assembled += Math.max(0, Number(plan.specialItemValueGp) || 0);   // GM-asserted value (no specific items)
      }
      // 3. Miscellaneous / inappropriate components (penalty applies) — gp paid from the purse.
      const miscGp = Math.max(0, Math.round(Number(plan.miscGp) || 0));
      const inappGp = Math.max(0, Math.round(Number(plan.inappropriateGp) || 0));
      const gpPaid = miscGp + inappGp;
      if(gpPaid > 0){
        if(!researcher.coins || typeof researcher.coins !== 'object') researcher.coins = { pp:0, gp:0, ep:0, sp:0, cp:0 };
        researcher.coins.gp = (Number(researcher.coins.gp) || 0) - gpPaid;
        if(typeof researcher.personalGp === 'number') researcher.personalGp = researcher.coins.gp;
        assembled += gpPaid; consumed.miscGp = miscGp; consumed.inappropriateGp = inappGp;
      }
      if(!opts.gmOverride && assembled < compCost){
        return { ok: false, reason: 'insufficient-components', assembled, componentCostGp: compCost };
      }
    }

    // ── Substitution penalty (RR p.388) ──
    const effectLevel = _throwTargetBump(project.kind, project.config) || Math.max(1, Math.floor(Number((project.config || {}).spellLevel) || 1));
    plan._componentCostGp = compCost;
    const penalty = componentSubstitutionPenalty(plan, effectLevel);
    project.componentPlan = plan;
    project.substitutionPenalty = penalty;
    project.componentPaid = (compCost > 0);
    // Inappropriate / miscellaneous components forfeit the formula benefit (RR p.388) — power + identified
    // item keep it. (v1 records it; the formula-benefit interplay deepens with the catalog.)
    const usedPenalized = (consumed.miscGp + consumed.inappropriateGp) > 0;

    // ── The throw (RR p.388; autoFailBand 3; graduates onto the Layer-1 resolver) ──
    let throwResult = null, succeeded = true;
    if(project.needsThrow){
      const info = researchThrowInfo(campaign, project);   // includes the penalty now (substitutionPenalty is set)
      const roll = (typeof A.rollProficiencyThrow === 'function')
        ? A.rollProficiencyThrow({ target: info.target, modifiers: info.modifiers, autoFailBand: 3, proficient: false, rng: _rng(opts) })
        : _fallbackThrow(info.target, info.modifierTotal, _rng(opts));
      throwResult = { roll: roll.natural, total: roll.total, target: roll.target, succeeded: roll.success, modifiers: info.modifiers, atTurn: _currentTurn(campaign) };
      succeeded = roll.success;
      project.throwResult = throwResult;
    }

    if(succeeded){
      _applyResearchResult(campaign, project, opts);
      project.status = 'completed'; project.completedOnTurn = _currentTurn(campaign);
      project.history.push({ turn: _currentTurn(campaign), type: 'completed', reason: throwResult ? ('throw ' + throwResult.total + ' vs ' + throwResult.target + ' ✓' + (penalty ? (' (penalty ' + penalty + ')') : '')) : 'no throw' });
      _recordResearchEvent(campaign, 'magic-research-completed',
        { projectId: project.id, kind: project.kind, researcherCharacterId: researcher.id, kindResult: project.kindResult, throwResult },
        { narrative: (researcher.name || researcher.id) + ' completes ' + (project.name || project.kind), relatedEntities: [{ kind: 'character', id: researcher.id, role: 'subject' }] });
      return { ok: true, succeeded: true, throwResult, result: project.kindResult, penalty, usedPenalized };
    }
    // Failure — ALL time, money, materials, and components are lost (RR p.388).
    const lostGp = (Number(project.materialCostGp) || 0) + (Number(project.researchInvestedGp) || 0) + assembled;
    project.status = 'failed'; project.completedOnTurn = _currentTurn(campaign);
    project.history.push({ turn: _currentTurn(campaign), type: 'failed', reason: 'throw ' + throwResult.total + ' vs ' + throwResult.target + ' ✗ — all investment lost (' + _round(lostGp).toLocaleString() + 'gp)' });
    _recordResearchEvent(campaign, 'magic-research-failed',
      { projectId: project.id, kind: project.kind, researcherCharacterId: researcher.id, lostGp: _round(lostGp), throwResult },
      { narrative: (researcher.name || researcher.id) + '’s ' + (project.name || project.kind) + ' fails — ' + _round(lostGp).toLocaleString() + 'gp lost', relatedEntities: [{ kind: 'character', id: researcher.id, role: 'subject' }] });
    return { ok: true, succeeded: false, throwResult, lostGp: _round(lostGp), penalty };
  }

  function _fallbackThrow(target, modTotal, rng){
    const natural = 1 + Math.floor((rng() || 0) * 20);
    const total = natural + (Number(modTotal) || 0);
    const success = (natural > 3) && total >= target;
    return { natural, total, target, success };
  }

  // Consume the chosen special-component item lines (the §5 specialComponentsHeldBy refs) from the
  // researcher's carry inventory / co-located stashes. ref: { source:'carry'|'stash', index?, stashId?, itemName? }.
  function _consumeSpecialComponents(campaign, researcher, refs){
    let valueGp = 0; const consumed = [];
    for(const ref of (refs || [])){
      if(!ref) continue;
      if(ref.source === 'carry'){
        const inv = researcher.inventory || [];
        const it = (ref.index != null && inv[ref.index]) ? inv[ref.index] : inv.find(x => x && x.name === ref.itemName && x.specialComponent);
        if(it && it.specialComponent){ valueGp += Number(it.specialComponent.valueGp) || 0; consumed.push({ source: 'carry', name: it.name }); const i = inv.indexOf(it); if(i >= 0) inv.splice(i, 1); }
      } else if(ref.source === 'stash' && ref.stashId){
        const st = (campaign.stashes || []).find(s => s && s.id === ref.stashId);
        if(st){ const items = st.items || []; const it = items.find(x => x && x.specialComponent && (ref.itemName == null || x.name === ref.itemName)); if(it){ valueGp += Number(it.specialComponent.valueGp) || 0; consumed.push({ source: 'stash', stashId: st.id, name: it.name }); const i = items.indexOf(it); if(i >= 0) items.splice(i, 1); } }
      }
    }
    return { valueGp, consumed };
  }

  function abandonResearchProject(campaign, projectId, reason){
    const p = findResearchProject(campaign, projectId);
    if(!p || (p.status !== 'in-progress' && p.status !== 'awaiting-throw' && p.status !== 'planning')) return p || null;
    p.status = 'abandoned'; p.completedOnTurn = _currentTurn(campaign);
    p.history.push({ turn: _currentTurn(campaign), type: 'abandoned', reason: reason || 'gm-action' });
    return p;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-M2 — minting manufactured creatures (constructs / undead / crossbreeds)
  // ════════════════════════════════════════════════════════════════════════════

  // Mint a manufactured creature as a count-N Group (the five-axis creature abstraction — a count-1 Group
  // is a valid single creature). Disposition (RR p.395/p.396/p.398): a mindless construct / willing-subject
  // undead / preserved-memory crossbreed is auto-controlled; otherwise a 2d6 reaction (the shipped
  // rollEncounterReaction primitive + the maker's CHA) decides — friendly/indifferent/neutral → controlled
  // (commanderCharacterId = the maker, socialTier 'minion'); unfriendly/hostile → FREE-WILLED (independent,
  // no commander — the creation slips the maker's grasp). spec: { creatureTypes[], baseName, autoControlled,
  // kindLabel }. opts.rng threads the throw's rng so previews/tests are deterministic.
  function _mintCreature(campaign, project, spec, opts){
    const A = _A();
    const researcher = _findChar(campaign, project.researcherCharacterId);
    const cfg = project.config || {};
    const count = Math.max(1, Math.floor(Number(cfg.quantity) || 1));
    let band = 'controlled', controlled = true, reactionRoll = null;
    if(!spec.autoControlled){
      const rng = (opts && typeof opts.rng === 'function') ? opts.rng : Math.random;
      const chaMod = researcher ? _chaMod(researcher) : 0;
      reactionRoll = (typeof A.rollEncounterReaction === 'function')
        ? A.rollEncounterReaction({ chaMod, rng })
        : { total: 7, band: 'neutral' };
      band = reactionRoll.band;
      controlled = (band === 'friendly' || band === 'indifferent' || band === 'neutral');
    }
    const creatureTypes = (Array.isArray(cfg.creatureTypes) && cfg.creatureTypes.length) ? cfg.creatureTypes.slice() : spec.creatureTypes.slice();
    const group = (typeof A.blankGroup === 'function') ? A.blankGroup({
      name: cfg.targetName || project.name || spec.baseName,
      groupTemplate: { monsterCatalogKey: null, creatureTypes, hitDice: (cfg.hd != null && cfg.hd !== '') ? String(cfg.hd) : null },
      count, casualties: 0,
      socialTier: controlled ? 'minion' : 'independent',
      commanderCharacterId: controlled ? (researcher ? researcher.id : null) : null,
      currentHexId: researcher ? researcher.currentHexId : null,
      notes: spec.kindLabel + ' created via magic research' + (reactionRoll ? (' — disposition: ' + band + (controlled ? ' (under the maker’s command)' : ' (FREE-WILLED — slipped control)')) : ' (controlled)')
    }) : null;
    if(group){
      if(!Array.isArray(campaign.groups)) campaign.groups = [];
      campaign.groups.push(group);
      if(!Array.isArray(group.history)) group.history = [];
      group.history.push({ turn: _currentTurn(campaign), type: 'created',
        reason: spec.kindLabel + ' by ' + ((researcher && researcher.name) || project.researcherCharacterId) + (reactionRoll ? (' — 2d6 ' + reactionRoll.total + ' → ' + band + (controlled ? ' (controlled)' : ' (free-willed)')) : ' (auto-controlled)') });
    }
    return { group, controlled, band, reactionRoll, count };
  }

  // Consume the progenitor creatures a crossbreed is bred from (RR p.396). Optional: if the GM designated
  // progenitor Groups (cfg.progenitorGroupIds), they're wiped (casualties = count); otherwise the
  // requirement is GM-narrated. Returns the number of progenitor groups killed.
  function _killProgenitors(campaign, ids){
    let killed = 0;
    for(const gid of (ids || [])){
      const g = _findGroup(campaign, gid);
      if(g){ g.casualties = Number(g.count) || 0; killed++; }
    }
    return killed;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Per-kind result application (plan §4)
  // ════════════════════════════════════════════════════════════════════════════
  function _applyResearchResult(campaign, project, opts){
    const researcher = _findChar(campaign, project.researcherCharacterId);
    const cfg = project.config || {};
    if(project.kind === 'spell-research'){
      const name = cfg.targetName || project.name || ('spell L' + (cfg.spellLevel || 1));
      _addMagicFormula(researcher, { kind: 'spell', name, spellLevel: Number(cfg.spellLevel) || 1, sourceProjectId: project.id, learnedAtTurn: _currentTurn(campaign) });
      project.kindResult = { formula: 'spell:' + name, spellLevel: Number(cfg.spellLevel) || 1, note: 'Add to repertoire after 1 week of practice (RR p.390).' };
    } else if(project.kind === 'identify'){
      const item = _findNotableItem(campaign, cfg.itemId);
      if(item && researcher){
        if(!item.identification || typeof item.identification !== 'object') item.identification = { knownProperties: {}, learningProgressDaysByCharacter: {}, timesRereadByCharacter: {} };
        if(!item.identification.knownProperties || typeof item.identification.knownProperties !== 'object') item.identification.knownProperties = {};
        const props = (item.intrinsic && Array.isArray(item.intrinsic.properties)) ? item.intrinsic.properties.slice() : [];
        item.identification.knownProperties[researcher.id] = ['identified'].concat(props);
        (item.history = item.history || []).push({ turn: _currentTurn(campaign), type: 'identified', reason: (researcher.name || researcher.id) + ' identified the item' });
      }
      project.kindResult = { itemId: cfg.itemId || null, identified: true };
    } else if(project.kind === 'item-creation'){
      const A = _A();
      const item = (typeof A.blankNotableItem === 'function') ? A.blankNotableItem({
        kind: cfg.itemKind || 'misc-magic',
        name: cfg.targetName || project.name || 'Crafted item',
        baseCatalogKey: cfg.baseCatalogKey || null,
        intrinsic: cfg.intrinsic || (cfg.enchantBonus ? { enchantmentBonus: Number(cfg.enchantBonus) || 1, properties: [] } : {}),
        provenance: { makerCharacterId: researcher ? researcher.id : null, createdAtTurn: _currentTurn(campaign), originLore: 'Crafted via magic research', knownMakeAndAuthenticity: true }
      }) : null;
      if(item){
        if(!Array.isArray(campaign.notableItems)) campaign.notableItems = [];
        campaign.notableItems.push(item);
        // Custody → the maker (the shipped item-custody model), if available.
        if(typeof A.blankItemCustody === 'function'){
          if(!Array.isArray(campaign.itemCustody)) campaign.itemCustody = [];
          campaign.itemCustody.push(A.blankItemCustody({ itemId: item.id, custodianKind: 'character', custodianId: researcher ? researcher.id : null, sinceTurn: _currentTurn(campaign) }));
        }
        // The maker gains the formula (auto for what you've made — RR p.391).
        _addMagicFormula(researcher, { kind: 'item', name: item.name, sourceProjectId: project.id, notableItemId: item.id, learnedAtTurn: _currentTurn(campaign) });
        project.kindResult = { notableItemId: item.id };
        _recordResearchEvent(campaign, 'magic-item-created',
          { projectId: project.id, notableItemId: item.id, makerCharacterId: researcher ? researcher.id : null, itemKind: item.kind },
          { narrative: (researcher && researcher.name || 'A mage') + ' crafts ' + (item.name || 'a magic item'), relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }, { kind: 'notableItem', id: item.id, role: 'produced' }] });
      }
    } else if(project.kind === 'construct-design'){
      // RR p.395 — design produces a construct FORMULA (manufacture it later from the formula).
      const name = cfg.targetName || project.name || 'construct';
      _addMagicFormula(researcher, { kind: 'construct', name, hd: Number(cfg.hd) || 0, sourceProjectId: project.id, learnedAtTurn: _currentTurn(campaign) });
      project.kindResult = { formula: 'construct:' + name, hd: Number(cfg.hd) || 0, note: 'Manufacture the construct from this formula (RR p.395).' };
    } else if(project.kind === 'construct-manufacture'){
      // RR p.395 — manufacture a construct (a Group). Mindless → auto-controlled; sentient → a reaction roll.
      const undead = !!cfg.undead;
      const r = _mintCreature(campaign, project, {
        creatureTypes: undead ? ['undead', 'construct'] : ['construct'], baseName: undead ? 'Undead construct' : 'Construct',
        autoControlled: !cfg.sentient, kindLabel: (undead ? 'Undead construct' : 'Construct')
      }, opts);
      project.kindResult = { groupId: r.group ? r.group.id : null, controlled: r.controlled, disposition: r.band, count: r.count, undead };
      _recordResearchEvent(campaign, 'construct-manufactured',
        { projectId: project.id, groupId: r.group ? r.group.id : null, makerCharacterId: researcher ? researcher.id : null, controlled: r.controlled, disposition: r.band, count: r.count, undead },
        { narrative: (researcher && researcher.name || 'A mage') + ' manufactures ' + (r.count > 1 ? (r.count + '× ') : '') + (project.name || (undead ? 'an undead construct' : 'a construct')) + (r.controlled ? '' : ' — but it slips control!'),
          relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }].concat(r.group ? [{ kind: 'group', id: r.group.id, role: 'produced' }] : []) });
    } else if(project.kind === 'crossbreed'){
      // RR p.396 — crossbreed a new creature (a Group); the progenitors are consumed. Preserved memory →
      // auto-controlled; otherwise a reaction roll.
      const preserve = !!cfg.preserveMemory;
      const r = _mintCreature(campaign, project, {
        creatureTypes: ['monster'], baseName: 'Crossbreed', autoControlled: preserve, kindLabel: 'Crossbreed'
      }, opts);
      const killed = _killProgenitors(campaign, cfg.progenitorGroupIds);
      project.kindResult = { groupId: r.group ? r.group.id : null, controlled: r.controlled, disposition: r.band, count: r.count, progenitorsKilled: killed };
      _recordResearchEvent(campaign, 'crossbreed-created',
        { projectId: project.id, groupId: r.group ? r.group.id : null, makerCharacterId: researcher ? researcher.id : null, controlled: r.controlled, disposition: r.band, count: r.count, progenitorsKilled: killed },
        { narrative: (researcher && researcher.name || 'A mage') + ' crossbreeds ' + (project.name || 'a new creature') + (r.controlled ? '' : ' — but it is feral!'),
          relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }].concat(r.group ? [{ kind: 'group', id: r.group.id, role: 'produced' }] : []) });
    } else if(project.kind === 'necromancy'){
      // RR p.398 — raise an intelligent undead (a Group). Willing subject → auto-loyal; else a reaction roll.
      const willing = !!cfg.willing;
      const r = _mintCreature(campaign, project, {
        creatureTypes: ['undead'], baseName: 'Undead servant', autoControlled: willing, kindLabel: 'Undead'
      }, opts);
      project.kindResult = { groupId: r.group ? r.group.id : null, controlled: r.controlled, disposition: r.band, count: r.count, willing };
      _recordResearchEvent(campaign, 'necromancy-performed',
        { projectId: project.id, groupId: r.group ? r.group.id : null, makerCharacterId: researcher ? researcher.id : null, controlled: r.controlled, disposition: r.band, count: r.count, willing },
        { narrative: (researcher && researcher.name || 'A necromancer') + ' raises ' + (r.count > 1 ? (r.count + '× ') : '') + (project.name || 'the dead') + (r.controlled ? '' : ' — but it rises hostile!'),
          relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }].concat(r.group ? [{ kind: 'group', id: r.group.id, role: 'produced' }] : []) });
    } else if(project.kind === 'ritual-learn'){
      // RR p.398 — learning a ritual adds it to the caster's ritual repertoire (a magicFormula kind:'ritual').
      const rl = _clampRitualLevel(cfg.ritualLevel);
      const name = cfg.targetName || project.name || ('ritual L' + rl);
      _addMagicFormula(researcher, { kind: 'ritual', name, ritualKey: cfg.ritualKey || null, ritualLevel: rl, sourceProjectId: project.id, learnedAtTurn: _currentTurn(campaign) });
      project.kindResult = { formula: 'ritual:' + name, ritualKey: cfg.ritualKey || null, ritualLevel: rl, note: 'Added to your ritual repertoire (RR p.398).' };
      _recordResearchEvent(campaign, 'ritual-learned',
        { projectId: project.id, researcherCharacterId: researcher ? researcher.id : null, ritualKey: cfg.ritualKey || null, ritualLevel: rl, name },
        { narrative: (researcher && researcher.name || 'A mage') + ' learns the ritual of ' + name,
          relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }] });
    } else if(project.kind === 'ritual-cast'){
      // RR p.398 — a cast ritual takes effect immediately OR is stored as a single charge (scroll / ring / rod
      // / staff / wand). The effect itself is GM-resolved / deferred to its consuming subsystem (catalog content).
      const rl = _clampRitualLevel(cfg.ritualLevel);
      const name = cfg.targetName || project.name || ('ritual L' + rl);
      if(cfg.mode === 'stored'){
        const it = _mintStoredRitualItem(campaign, project, { name, ritualLevel: rl, form: cfg.storedForm || 'scroll' });
        project.kindResult = { ritualKey: cfg.ritualKey || null, ritualLevel: rl, mode: 'stored', notableItemId: it ? it.id : null, storedForm: cfg.storedForm || 'scroll', note: 'Bound into ' + (it ? it.name : 'a single charge') + ' (RR p.398).' };
        _recordResearchEvent(campaign, 'ritual-cast',
          { projectId: project.id, researcherCharacterId: researcher ? researcher.id : null, ritualKey: cfg.ritualKey || null, ritualLevel: rl, mode: 'stored', notableItemId: it ? it.id : null, storedForm: cfg.storedForm || 'scroll', name },
          { narrative: (researcher && researcher.name || 'A mage') + ' casts ' + name + ' and binds it into ' + ((!cfg.storedForm || cfg.storedForm === 'scroll') ? 'a scroll' : ('a ' + cfg.storedForm)),
            relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }].concat(it ? [{ kind: 'notableItem', id: it.id, role: 'produced' }] : []) });
      } else {
        const entry = ritualCatalogEntry(cfg.ritualKey);
        project.kindResult = { ritualKey: cfg.ritualKey || null, ritualLevel: rl, mode: 'immediate', note: (entry && entry.gloss) ? ('Takes effect now (GM resolves): ' + entry.gloss) : 'The ritual takes effect now (GM resolves).' };
        _recordResearchEvent(campaign, 'ritual-cast',
          { projectId: project.id, researcherCharacterId: researcher ? researcher.id : null, ritualKey: cfg.ritualKey || null, ritualLevel: rl, mode: 'immediate', name },
          { narrative: (researcher && researcher.name || 'A mage') + ' performs the ritual of ' + name,
            relatedEntities: [{ kind: 'character', id: researcher ? researcher.id : null, role: 'subject' }] });
      }
    }
  }

  // The magic-formula library (additive, init-on-write — no migration; templates stay no-ops). The future
  // Spells #151 repertoire reads this; "1 week practice to add to repertoire" is deferred (no repertoire model).
  function _addMagicFormula(character, formula){
    if(!character) return;
    if(!Array.isArray(character.magicFormulas)) character.magicFormulas = [];
    character.magicFormulas.push(Object.assign({ schemaVersion: SCHEMA_VERSION, id: newId('frm') }, formula));
  }

  // Store a cast ritual as a single charge on a magic item (RR p.398 — a scroll, or one charge in a ring /
  // rod / staff / wand; never activated/at-will/permanent). Mints a Notable Item + custody to the caster.
  function _mintStoredRitualItem(campaign, project, spec){
    const A = _A();
    const researcher = _findChar(campaign, project.researcherCharacterId);
    const form = ['scroll','ring','rod','staff','wand'].indexOf(spec.form) >= 0 ? spec.form : 'scroll';
    const itemKind = (form === 'scroll') ? 'scroll' : 'misc-magic';
    const label = (form === 'scroll') ? ('Scroll of ' + (spec.name || 'a ritual'))
      : ((form.charAt(0).toUpperCase() + form.slice(1)) + ' of ' + (spec.name || 'a ritual'));
    const item = (typeof A.blankNotableItem === 'function') ? A.blankNotableItem({
      kind: itemKind, name: label,
      intrinsic: { charges: 1, storedRitual: { ritualKey: (project.config && project.config.ritualKey) || null, ritualLevel: spec.ritualLevel, form }, properties: ['Holds a single casting of the ' + (spec.name || 'ritual') + ' ritual'] },
      provenance: { makerCharacterId: researcher ? researcher.id : null, createdAtTurn: _currentTurn(campaign), originLore: 'A ritual spell bound into a single charge (RR p.398)', knownMakeAndAuthenticity: true }
    }) : null;
    if(item){
      if(!Array.isArray(campaign.notableItems)) campaign.notableItems = [];
      campaign.notableItems.push(item);
      if(typeof A.blankItemCustody === 'function'){
        if(!Array.isArray(campaign.itemCustody)) campaign.itemCustody = [];
        campaign.itemCustody.push(A.blankItemCustody({ itemId: item.id, custodianKind: 'character', custodianId: researcher ? researcher.id : null, sinceTurn: _currentTurn(campaign) }));
      }
    }
    return item;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Event emit — record-only (mirror sanctums/religion): newEvent + setEventContext + APPLIED + push.
  // ════════════════════════════════════════════════════════════════════════════
  function _recordResearchEvent(campaign, kind, payload, opts){
    const A = _A();
    opts = opts || {};
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy: 'engine', cadence: opts.cadence || 'monthly-turn', targetTurn: _currentTurn(campaign),
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, relatedEntities: opts.relatedEntities || [] });
    }
    if(opts.campaignLogHidden) ev.campaignLogHidden = true;
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(campaign);
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || (kind + ' applied') },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
      ...(opts.campaignLogHidden ? { campaignLogHidden: true } : {}) });
    return ev;
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // catalogs
    RESEARCH_RATE_BY_LEVEL, MAGIC_RESEARCH_KINDS, ITEM_ACTIVATION_MULT, ITEM_PERMANENT_MULT, ITEM_BONUS_COST,
    RESEARCH_PROFICIENCY_MODS, HIGH_TIER_RESEARCH_KINDS: HIGH_TIER_KINDS,
    RITUAL_CATALOG, RITUAL_COST_BY_LEVEL, RITUAL_REPERTOIRE_BASE,
    // rituals (AD-M3)
    ritualCatalogEntry, ritualKeyAttributeFor, ritualRepertoireCap, ritualsKnown, ritualInRepertoire, ritualLevelFor,
    // core machine
    magicResearchKind, availableResearchKinds, researchRateForLevel, researchEffectiveMinLevel,
    isEligibleResearcher, magicItemCreationCost, researchProjectCosts, componentSubstitutionPenalty,
    totalResearchRate, researchDaysRemaining, researchThrowInfo,
    // entity + lookups
    blankResearchProject, findResearchProject, researchProjectsFor, activeResearchProjects,
    // setters + lifecycle
    startResearchProject, processResearchForTurn, payAndRollResearchThrow, abandonResearchProject
  });

})(typeof window !== 'undefined' ? window : global);
