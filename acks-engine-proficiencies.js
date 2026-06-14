/* ACKS God Mode — acks-engine-proficiencies.js
 * Proficiency Throws — PT-1 (the unified 1d20 throw system). Wave PT-1 of
 * Phase_3.6_Proficiency_Throws_Plan.md, built as a self-contained module for the
 * 2026-06-13 world-front team session (agent-4 lane).
 *
 * Ships four layers as ONE additive module:
 *   Layer 0  the canonical {key,ranks} proficiency MODEL — parsed at READ time from the
 *            existing loose character.proficiencies[] (strings like "Theology (2)" /
 *            "Military Strategy 2" / bare / objects). ⚠ ADDITIVE: does NOT reshape the
 *            stored field, adds NO migrateCampaign hook, regenerates NO templates — the 6
 *            templates + demo stay migrate-no-ops. (PT-0's on-disk migration + the PT-6
 *            resolver sweep are DEFERRED to a later solo pass, per the lane brief.)
 *   Layer 1  rollProficiencyThrow — the pure, rng-injectable d20 resolver (RR pp.9–10:
 *            1d20 + mods ≥ target; nat-1 auto-fails; nat-20 auto-succeeds ONLY if proficient;
 *            botch/crit/auto bands).
 *   Layer 2  the catalog — PROFICIENCY_CATALOG (the ~110 roster) + PROFICIENCY_TASKS (the
 *            throw-granting subset, RAW targets transcribed + page-cited) +
 *            PROFICIENCY_THROW_MODIFIERS + IMPROVISED_THROW_DIFFICULTY (JJ p.94) + aliases.
 *   Layer 3  characterProficiencyThrow / characterAvailableThrows — per-character derivation
 *            (resolve a task's effective target + itemized modifiers for an actor).
 *
 * Transcription discipline (CLAUDE §6 cartography-before-mechanics): every throw target is
 * transcribed from its RR/JJ page, page cited; no invented targets. A class-power-derived
 * target (Lockpicking, Climbing, Swimming) carries a baseTargetSource marker, not a guessed
 * number (the class progression tables are a later transcription — plan §15 OQ2/OQ3).
 *
 * Loads after acks-engine-events.js (canonical set first, then this extra; index.html tag
 * after the domain-completion tag) so ACKS.newEvent + ACKS.abilityMod are present for the
 * optional record-only proficiency-throw log + the 4×STR derivation. Self-contained: pure
 * reads/derivations over a passed campaign/character.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // ─────────────────────────────────────────────────────────────────────────
  // helpers
  // ─────────────────────────────────────────────────────────────────────────
  function _slug(s){
    return String(s == null ? '' : s).toLowerCase().trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  // Ability modifier — reuse the engine's table (RR p.17) when present, else inline it.
  function _abilityMod(score){
    if(ACKS && typeof ACKS.abilityMod === 'function') return ACKS.abilityMod(Number(score) || 10);
    const s = Number(score) || 10;
    if(s >= 18) return 3; if(s >= 16) return 2; if(s >= 13) return 1;
    if(s >= 9) return 0;  if(s >= 6) return -1; if(s >= 4) return -2;
    return -3;
  }
  function _charLevel(c){ return (c && typeof c.level === 'number') ? c.level : 1; }

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2a — the RAW proficiency LISTS (general + per-class), verbatim RR pp.102–104.
  // Used to derive each catalog entry's `lists[]` + `general` flag (single source of truth,
  // so the roster can't drift from the lists).
  // ─────────────────────────────────────────────────────────────────────────
  const PROFICIENCY_LISTS = Object.freeze({
    general: ['Adventuring','Alchemy','Animal Husbandry','Animal Training','Art','Bargaining','Caving','Collegiate Wizardry','Craft','Diplomacy','Disguise','Driving','Endurance','Engineering','Folkways','Gambling','Healing','Intimidation','Knowledge','Labor','Language','Leadership','Lip Reading','Manual of Arms','Mapping','Military Strategy','Mimicry','Mountaineering','Naturalism','Navigation','Performance','Profession','Revelry','Riding','Seafaring','Seduction','Siege Engineering','Signaling','Streetwise','Survival','Swimming','Theology','Tracking','Trapping'],
    fighter: ['Acrobatics','Alertness','Berserkergang','Blind Fighting','Combat Ferocity','Combat Reflexes','Combat Trickery','Command','Dungeonbashing Expertise','Fighting Style Specialization','Leadership','Manual of Arms','Military Strategy','Mounted Combat','Precise Shooting','Riding','Running','Siege Engineering','Skirmishing','Swashbuckling','Unarmed Fighting','Weapon Finesse','Weapon Focus'],
    explorer: ['Beast Friendship','Climbing','Combat Ferocity','Combat Reflexes','Combat Trickery','Driving','Eavesdropping','Elven Bloodline','Fighting Style Specialization','Illusion Resistance','Land Surveying','Mapping','Mountaineering','Mounted Combat','Naturalism','Navigation','Passing Without Trace','Precise Shooting','Prospecting','Riding','Running','Seafaring','Skirmishing','Sniping','Swashbuckling','Weapon Finesse','Weapon Focus'],
    thief: ['Acrobatics','Alertness','Arcane Dabbling','Bribery','Cat Burglary','Combat Reflexes','Combat Trickery','Contortionism','Fighting Style Specialization','Gambling','Intimidation','Lip Reading','Lockpicking Expertise','Mapping','Poisoning','Precise Shooting','Riding','Running','Seafaring','Skirmishing','Skulking','Sniping','Swashbuckling','Trapfinding','Unarmed Fighting','Weapon Finesse','Weapon Focus'],
    mage: ['Alchemy','Battle Magic','Beast Friendship','Black Lore of Zahar','Bright Lore of Aura','Counterspelling','Diplomacy','Elementalism','Elven Bloodline','Engineering','Expanded Repertoire','Experimenting','Familiar','Healing','Illusion Resistance','Knowledge','Language','Loremastery','Magical Engineering','Mastery of Enchantments & Illusions','Mastery of Conjuration & Summoning','Mystic Aura','Quiet Magic','Prestidigitation','Sensing Power','Soothsaying','Transmogrification','Unflappable Casting'],
    crusader: ['Battle Magic','Beast Friendship','Combat Trickery','Command','Contemplation','Diplomacy','Divine Blessing','Divine Health','Fighting Style Specialization','Healing','Laying on Hands','Leadership','Loremastery','Magical Engineering','Martial Training','Mounted Combat','Prestidigitation','Prophecy','Quiet Magic','Righteous Rebuke','Sensing Evil','Sensing Power','Syncretism','Theology','Unflappable Casting','Weapon Focus'],
    venturer: ['Alertness','Ambushing','Arcane Dabbling','Bargaining','Climbing','Combat Reflexes','Combat Trickery','Command','Driving','Eavesdropping','Elven Bloodline','Intimidation','Land Surveying','Leadership','Lip Reading','Magical Engineering','Mapping','Mountaineering','Mounted Combat','Passing Without Trace','Precise Shooting','Prospecting','Riding','Running','Seafaring','Skirmishing','Swashbuckling','Weapon Finesse'],
    assassin: ['Acrobatics','Alchemy','Alertness','Arcane Dabbling','Armor Training','Bribery','Cat Burglary','Climbing','Combat Reflexes','Combat Trickery','Contortionism','Disguise','Eavesdropping','Fighting Style Specialization','Gambling','Intimidation','Kin-Slaying','Mimicry','Poisoning','Precise Shooting','Running','Skirmishing','Skulking','Sniping','Swashbuckling','Weapon Finesse','Weapon Focus'],
    barbarian: ['Alertness','Ambushing','Armor Training','Beast Friendship','Berserkergang','Blind Fighting','Climbing','Combat Ferocity','Combat Reflexes','Combat Trickery','Command','Fighting Style Specialization','Martial Training','Mountaineering','Mounted Combat','Passing Without Trace','Precise Shooting','Riding','Running','Seafaring','Skirmishing','Sniping','Swashbuckling','Weapon Finesse','Weapon Focus'],
    bard: ['Acrobatics','Art','Bargaining','Beast Friendship','Bribery','Combat Trickery','Command','Diplomacy','Elven Bloodline','Fighting Style Specialization','Healing','Knowledge','Language','Leadership','Lip Reading','Magical Engineering','Magical Music','Mimicry','Mystic Aura','Performance','Precise Shooting','Prestidigitation','Running','Seduction','Skirmishing','Swashbuckling','Weapon Finesse','Weapon Focus'],
    bladedancer: ['Acrobatics','Battle Magic','Beast Friendship','Combat Reflexes','Combat Trickery','Contemplation','Diplomacy','Divine Blessing','Divine Health','Elven Bloodline','Fighting Style Specialization','Laying on Hands','Magical Music','Martial Training','Mounted Combat','Mystic Aura','Prestidigitation','Prophecy','Quiet Magic','Running','Seduction','Skirmishing','Swashbuckling','Syncretism','Unarmed Fighting','Unflappable Casting','Weapon Focus'],
    priestess: ['Alchemy','Animal Husbandry','Arcane Dabbling','Armor Training','Beast Friendship','Bright Lore of Aura','Contemplation','Divine Blessing','Familiar','Healing','Illusion Resistance','Knowledge','Laying on Hands','Loremastery','Magical Engineering','Magical Music','Mastery of Enchantments & Illusions','Mystic Aura','Naturalism','Performance','Prestidigitation','Profession','Prophecy','Quiet Magic','Sensing Evil','Sensing Power','Syncretism','Unflappable Casting'],
    shaman: ['Animal Husbandry','Animal Training','Battle Magic','Beast Friendship','Berserkergang','Command','Diplomacy','Divine Blessing','Divine Health','Elementalism','Fighting Style Specialization','Healing','Laying on Hands','Leadership','Loremastery','Magical Engineering','Magical Music','Naturalism','Passing Without Trace','Prestidigitation','Quiet Magic','Sensing Evil','Sensing Power','Syncretism','Theology','Tracking','Unflappable Casting','Weapon Focus'],
    paladin: ['Alertness','Beast Friendship','Berserkergang','Blind Fighting','Combat Ferocity','Combat Reflexes','Combat Trickery','Command','Diplomacy','Divine Blessing','Dungeonbashing Expertise','Fighting Style Specialization','Goblin-Slaying','Healing','Illusion Resistance','Laying on Hands','Leadership','Manual of Arms','Martial Training','Military Strategy','Mounted Combat','Mystic Aura','Riding','Running','Weapon Focus'],
    warlock: ['Alchemy','Battle Magic','Beast Friendship','Black Lore of Zahar','Counterspelling','Divine Blessing','Elementalism','Elven Bloodline','Expanded Repertoire','Experimenting','Familiar','Illusion Resistance','Knowledge','Language','Loremastery','Magical Engineering','Mastery of Enchantments & Illusions','Mastery of Conjuration & Summoning','Mystic Aura','Naturalism','Poisoning','Prestidigitation','Quiet Magic','Sensing Good','Sensing Power','Soothsaying','Transmogrification','Unflappable Casting'],
    witch: ['Alchemy','Arcane Dabbling','Beast Friendship','Black Lore of Zahar','Contemplation','Divine Blessing','Divine Health','Elementalism','Elven Bloodline','Expanded Repertoire','Familiar','Illusion Resistance','Laying on Hands','Loremastery','Magical Engineering','Magical Music','Mastery of Enchantments & Illusions','Mystic Aura','Naturalism','Passing Without Trace','Poisoning','Prestidigitation','Prophecy','Quiet Magic','Sensing Power','Soothsaying','Transmogrification','Unflappable Casting'],
    'dwarven-craftpriest': ['Alchemy','Battle Magic','Caving','Collegiate Wizardry','Contemplation','Craft','Diplomacy','Divine Blessing','Divine Health','Dwarven Brewing','Engineering','Expanded Repertoire','Experimenting','Fighting Style Specialization','Goblin-Slaying','Healing','Illusion Resistance','Knowledge','Laying on Hands','Loremastery','Magical Engineering','Mapping','Prestidigitation','Profession','Prophecy','Quiet Magic','Reliquarianism','Righteous Rebuke','Sensing Evil','Siege Engineering','Theology','Unflappable Casting','Weapon Focus'],
    'dwarven-vaultguard': ['Alertness','Berserkergang','Blind Fighting','Caving','Combat Ferocity','Combat Reflexes','Combat Trickery','Command','Dungeonbashing Expertise','Dwarven Brewing','Fighting Style Specialization','Goblin-Slaying','Illusion Resistance','Intimidation','Land Surveying','Leadership','Military Strategy','Mountaineering','Precise Shooting','Prospecting','Running','Siege Engineering','Vermin-Slaying','Weapon Focus'],
    'elven-nightblade': ['Battle Magic','Beast Friendship','Black Lore of Zahar','Blind Fighting','Combat Reflexes','Contortionism','Counterspelling','Eavesdropping','Elementalism','Expanded Repertoire','Familiar','Fighting Style Specialization','Kin-Slaying','Magical Engineering','Mastery of Enchantments & Illusions','Mystic Aura','Passing Without Trace','Poisoning','Precise Shooting','Prestidigitation','Running','Sensing Power','Skirmishing','Skulking','Sniping','Swashbuckling','Unflappable Casting','Unarmed Fighting','Wakefulness','Weapon Focus','Weapon Finesse'],
    'elven-spellsword': ['Battle Magic','Beast Friendship','Black Lore of Zahar','Blind Fighting','Combat Reflexes','Combat Trickery','Command','Counterspelling','Elementalism','Expanded Repertoire','Experimenting','Familiar','Fighting Style Specialization','Loremastery','Magical Engineering','Magical Music','Mastery of Enchantments & Illusions','Mounted Combat','Mystic Aura','Quiet Magic','Precise Shooting','Prestidigitation','Running','Sensing Power','Skirmishing','Soothsaying','Swashbuckling','Unflappable Casting','Wakefulness','Weapon Focus','Weapon Finesse'],
    'nobiran-wonderworker': ['Alchemy','Battle Magic','Black Lore of Zahar','Beast Friendship','Bright Lore of Aura','Command','Contemplation','Counterspelling','Elementalism','Expanded Repertoire','Experimenting','Familiar','Healing','Illusion Resistance','Laying on Hands','Loremastery','Magical Engineering','Martial Training','Mastery of Enchantments & Illusions','Mastery of Conjuration & Summoning','Mystic Aura','Prestidigitation','Prophecy','Quiet Magic','Sensing Evil','Sensing Power','Soothsaying','Syncretism','Transmogrification','Unflappable Casting'],
    'zaharan-ruinguard': ['Alertness','Ambushing','Battle Magic','Berserkergang','Black Lore of Zahar','Blind Fighting','Combat Ferocity','Combat Trickery','Command','Counterspelling','Dungeonbashing Expertise','Elementalism','Familiar','Fighting Style Specialization','Kin-Slaying','Leadership','Martial Training','Mastery of Conjuration & Summoning','Military Strategy','Mounted Combat','Mystic Aura','Sensing Good','Sensing Power','Skirmishing','Transmogrification','Unflappable Casting','Wakefulness']
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2b — PROFICIENCY_META: per-proficiency metadata (type / maxRanks / governingAbility /
  // rawPage). The `lists[]` + `general` flag are derived from PROFICIENCY_LISTS below, so the
  // roster is guaranteed to cover every listed proficiency. type ∈ TYPES; maxRanks null = RAW
  // "may be selected multiple times" with no hard tier cap.
  // ─────────────────────────────────────────────────────────────────────────
  const TYPES = Object.freeze(['throw','throw-modifier','combat','economic','social','passive','magic','mixed']);

  // [label, type, maxRanks, governingAbility, rawPage]
  const _META = [
    // ── General list ──
    ['Adventuring','throw',1,null,'RR p.105'],
    ['Alchemy','mixed',3,null,'RR p.105'],
    ['Animal Husbandry','mixed',3,null,'RR p.106'],
    ['Animal Training','economic',4,null,'RR p.106'],
    ['Art','mixed',4,null,'RR p.107'],
    ['Bargaining','economic',null,null,'RR p.107'],
    ['Caving','throw',null,null,'RR p.108'],
    ['Collegiate Wizardry','throw',null,null,'RR p.108'],
    ['Craft','mixed',4,null,'RR p.107'],
    ['Diplomacy','social',1,null,'RR p.109'],
    ['Disguise','throw',null,null,'RR p.109'],
    ['Driving','passive',null,null,'RR p.109'],
    ['Endurance','passive',1,null,'RR p.110'],
    ['Engineering','mixed',4,null,'RR p.110'],
    ['Folkways','social',null,null,'RR p.111'],
    ['Gambling','economic',null,null,'RR p.111'],
    ['Healing','mixed',3,null,'RR p.112'],
    ['Intimidation','social',1,null,'RR p.112'],
    ['Knowledge','mixed',3,null,'RR p.112'],
    ['Labor','economic',null,null,'RR p.113'],
    ['Language','passive',null,null,'RR p.113'],
    ['Leadership','passive',1,null,'RR p.113'],
    ['Lip Reading','throw',1,null,'RR p.113'],
    ['Manual of Arms','mixed',null,null,'RR p.113'],
    ['Mapping','throw',null,null,'RR p.114'],
    ['Military Strategy','mixed',3,null,'RR p.115'],
    ['Mimicry','throw',null,null,'RR p.115'],
    ['Mountaineering','passive',1,null,'RR p.115'],
    ['Naturalism','throw',null,null,'RR p.115'],
    ['Navigation','throw-modifier',1,null,'RR p.116'],
    ['Performance','mixed',3,null,'RR p.116'],
    ['Profession','mixed',3,null,'RR p.117'],
    ['Revelry','passive',1,null,'RR p.117'],
    ['Riding','passive',1,null,'RR p.117'],
    ['Seafaring','mixed',3,null,'RR p.117'],
    ['Seduction','social',1,null,'RR p.117'],
    ['Siege Engineering','economic',2,null,'RR p.118'],
    ['Signaling','passive',null,null,'RR p.119'],
    ['Streetwise','throw',null,null,'RR p.119'],
    ['Survival','throw-modifier',1,null,'RR p.119'],
    ['Swimming','throw-modifier',1,null,'RR p.119'],
    ['Theology','throw',null,null,'RR p.119'],
    ['Tracking','throw',null,null,'RR p.120'],
    ['Trapping','throw',1,null,'RR p.121'],
    // ── Class-only ──
    ['Acrobatics','throw',1,'DEX','RR p.105'],
    ['Alertness','throw-modifier',1,null,'RR p.105'],
    ['Ambushing','combat',1,null,'RR p.105'],
    ['Arcane Dabbling','throw',1,null,'RR p.106'],
    ['Armor Training','passive',1,null,'RR p.107'],
    ['Battle Magic','magic',1,null,'RR p.107'],
    ['Beast Friendship','throw',1,null,'RR p.107'],
    ['Berserkergang','combat',1,null,'RR p.107'],
    ['Black Lore of Zahar','magic',1,null,'RR p.108'],
    ['Blind Fighting','combat',1,null,'RR p.108'],
    ['Bribery','social',1,null,'RR p.108'],
    ['Bright Lore of Aura','magic',1,null,'RR p.108'],
    ['Cat Burglary','throw-modifier',1,'DEX','RR p.108'],
    ['Climbing','throw',1,null,'RR p.108'],
    ['Combat Ferocity','combat',1,null,'RR p.108'],
    ['Combat Reflexes','combat',1,null,'RR p.108'],
    ['Combat Trickery','combat',null,null,'RR p.109'],
    ['Command','passive',1,null,'RR p.109'],
    ['Contemplation','magic',1,null,'RR p.109'],
    ['Contortionism','throw',1,'DEX','RR p.109'],
    ['Counterspelling','magic',1,null,'RR p.109'],
    ['Divine Blessing','passive',1,null,'RR p.109'],
    ['Divine Health','passive',1,null,'RR p.109'],
    ['Dungeonbashing Expertise','throw-modifier',1,null,'RR p.109'],
    ['Dwarven Brewing','throw',1,null,'RR p.110'],
    ['Eavesdropping','throw',1,null,'RR p.110'],
    ['Elementalism','magic',null,null,'RR p.110'],
    ['Elven Bloodline','passive',1,null,'RR p.110'],
    ['Expanded Repertoire','magic',1,null,'RR p.110'],
    ['Experimenting','magic',1,null,'RR p.110'],
    ['Familiar','magic',1,null,'RR p.111'],
    ['Fighting Style Specialization','combat',null,null,'RR p.111'],
    ['Goblin-Slaying','combat',1,null,'RR p.111'],
    ['Illusion Resistance','passive',1,null,'RR p.111'],
    ['Kin-Slaying','combat',1,null,'RR p.112'],
    ['Land Surveying','throw',null,null,'RR p.111'],
    ['Laying on Hands','magic',null,null,'RR p.113'],
    ['Lockpicking Expertise','throw-modifier',1,'DEX','RR p.113'],
    ['Loremastery','throw',1,null,'RR p.113'],
    ['Magical Engineering','throw',null,null,'RR p.113'],
    ['Magical Music','throw',null,null,'RR p.114'],
    ['Martial Training','combat',null,null,'RR p.114'],
    ['Mastery of Conjuration & Summoning','magic',1,null,'RR p.115'],
    ['Mastery of Enchantments & Illusions','magic',1,null,'RR p.115'],
    ['Mounted Combat','combat',1,null,'RR p.115'],
    ['Mystic Aura','social',1,null,'RR p.115'],
    ['Passing Without Trace','passive',1,null,'RR p.116'],
    ['Poisoning','throw',1,null,'RR p.116'],
    ['Precise Shooting','combat',null,null,'RR p.116'],
    ['Prestidigitation','magic',1,null,'RR p.116'],
    ['Prophecy','passive',1,null,'RR p.117'],
    ['Prospecting','throw',1,null,'RR p.117'],
    ['Quiet Magic','magic',1,null,'RR p.117'],
    ['Reliquarianism','magic',1,null,'RR p.117'],
    ['Righteous Rebuke','magic',1,null,'RR p.117'],
    ['Running','passive',1,null,'RR p.117'],
    ['Sensing Evil','magic',1,null,'RR p.117'],
    ['Sensing Good','magic',1,null,'RR p.118'],
    ['Sensing Power','magic',1,null,'RR p.118'],
    ['Skirmishing','combat',1,null,'RR p.119'],
    ['Skulking','throw-modifier',1,null,'RR p.119'],
    ['Sniping','combat',1,null,'RR p.119'],
    ['Soothsaying','magic',1,null,'RR p.119'],
    ['Swashbuckling','combat',1,null,'RR p.119'],
    ['Syncretism','magic',1,null,'RR p.119'],
    ['Transmogrification','magic',1,null,'RR p.120'],
    ['Trapfinding','throw-modifier',1,null,'RR p.121'],
    ['Unarmed Fighting','combat',1,null,'RR p.121'],
    ['Unflappable Casting','magic',1,null,'RR p.121'],
    ['Vermin-Slaying','throw',1,null,'RR p.121'],
    ['Wakefulness','passive',1,null,'RR p.121'],
    ['Weapon Finesse','combat',1,null,'RR p.121'],
    ['Weapon Focus','combat',null,null,'RR p.121'],
    // ── Combat-proficiencies chapter (RR pp.351 / 100) — referenced by class lists above ──
    ['Dwarven Brewing','throw',1,null,'RR p.110'],
    ['Lockpicking','throw',1,'DEX','RR p.31'] // the thief class skill, modeled for the pick-lock task
  ];

  // Build the label→lists index from PROFICIENCY_LISTS (normalized by canonical key).
  const _keyToLists = {};
  for(const [listKey, labels] of Object.entries(PROFICIENCY_LISTS)){
    for(const lbl of labels){
      const k = _slug(lbl.replace(/\s*\([^)]*\)\s*/g, '')); // strip a "(disarm, …)" / "(judge)" qualifier
      (_keyToLists[k] = _keyToLists[k] || new Set()).add(listKey === 'general' ? 'general' : listKey);
    }
  }

  // PROFICIENCY_CATALOG — the roster, keyed by canonical key.
  const PROFICIENCY_CATALOG = {};
  for(const [label, type, maxRanks, gov, rawPage] of _META){
    const key = _slug(label);
    if(PROFICIENCY_CATALOG[key]) continue; // first wins (dedupe the two Dwarven Brewing rows)
    const lists = Array.from(_keyToLists[key] || []);
    PROFICIENCY_CATALOG[key] = {
      key, label,
      lists,
      general: lists.includes('general'),
      type,
      governingAbility: gov,
      maxRanks: (maxRanks === null ? null : maxRanks),
      rawPage
    };
  }
  // Completeness backstop: any proficiency that appears on a RAW list but was missed in _META
  // still gets a roster entry (so the catalog covers every listed proficiency — no orphans). It
  // defaults to type 'passive' rank 1; the label is reconstructed from the first list occurrence.
  for(const [listKey, labels] of Object.entries(PROFICIENCY_LISTS)){
    for(const lbl of labels){
      const cleanLabel = lbl.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const key = _slug(cleanLabel);
      if(PROFICIENCY_CATALOG[key]) continue;
      const lists = Array.from(_keyToLists[key] || []);
      PROFICIENCY_CATALOG[key] = { key, label: cleanLabel, lists, general: lists.includes('general'), type: 'passive', governingAbility: null, maxRanks: 1, rawPage: 'RR ch.4 (Proficiencies)' };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2c — PROFICIENCY_TASKS: the throw-granting subset (RAW targets transcribed).
  // baseTarget: a fixed target. tierTargets: {rank:target} (Alchemy 11/7/3 etc.; minTier =
  //   the lowest rank that can attempt it). perRankTargetDelta: extra ranks lower the target by N.
  //   perLevelTargetDelta: target shifts by N per character level above 1. baseTargetSource:
  //   a class-progression-derived base (no number yet — plan §15 OQ2/OQ3).
  // abilityMultiplier: ×N of governingAbility's modifier (RR Dungeonbashing 4×STR).
  // autoFailBand: natural ≤ this auto-fails (default 1; 0 = no auto-fail, e.g. RR p.278 forage).
  // ─────────────────────────────────────────────────────────────────────────
  const PROFICIENCY_TASKS = {
    // Adventuring sub-throws (RR p.105) — every PC has Adventuring (universally proficient)
    'adventuring:dungeonbashing': { label:'Bash down a stuck door (Dungeonbashing)', proficiency:'adventuring', baseTarget:18, governingAbility:'STR', abilityMultiplier:4, timeCost:'1 action', activityCost:'incidental', autoFailBand:1, repeatable:true, retryGate:'free', modifiedBy:['dungeonbashing-expertise'], rawPage:'RR p.105' },
    'adventuring:climbing':      { label:'Climb an easy obstacle (Climbing)', proficiency:'adventuring', baseTarget:8, abilityMultiplier:0, timeCost:'1 movement', autoFailBand:1, repeatable:true, retryGate:'free', rawPage:'RR p.105' },
    'adventuring:searching':     { label:'Search methodically for hidden features', proficiency:'adventuring', baseTarget:18, abilityMultiplier:0, timeCost:'1 turn', activityCost:'ancillary', autoFailBand:1, repeatable:true, retryGate:'free', modifiedBy:['alertness','trapfinding'], rawPage:'RR p.105' },
    'adventuring:trapbreaking':  { label:'Disarm a trap methodically', proficiency:'adventuring', baseTarget:18, abilityMultiplier:0, timeCost:'1 turn', activityCost:'ancillary', autoFailBand:1, fumbleEffect:'trap-triggers', repeatable:true, retryGate:'free', modifiedBy:['trapfinding'], rawPage:'RR p.105' },
    'adventuring:listening':     { label:'Listen for noises', proficiency:'adventuring', baseTarget:18, abilityMultiplier:0, timeCost:'1 round', activityCost:'incidental', autoFailBand:1, repeatable:false, retryGate:'next-turn', modifiedBy:['alertness'], rawPage:'RR p.105' },

    // Acrobatics (RR p.105) — tumble 18+, −1/level
    'acrobatics:tumble': { label:'Tumble past an opponent', proficiency:'acrobatics', baseTarget:18, perLevelTargetDelta:-1, timeCost:'1 movement', autoFailBand:1, repeatable:true, retryGate:'free', rawPage:'RR p.105' },

    // Alchemy (RR p.105) — tiered
    'alchemy:identify-substance':   { label:'Identify an alchemical substance', proficiency:'alchemy', tierTargets:{1:11,2:7,3:3}, timeCost:'1 turn', autoFailBand:1, repeatable:true, retryGate:'free', rawPage:'RR p.105' },
    'alchemy:identify-component':   { label:'Identify a monster’s special components', proficiency:'alchemy', tierTargets:{1:14,2:11,3:7}, autoFailBand:1, rawPage:'RR p.105' },
    'alchemy:extract-toxin':        { label:'Extract toxin from a fresh plant', proficiency:'alchemy', tierTargets:{1:20,2:16,3:12}, timeCost:'1 day', activityCost:'dedicated', autoFailBand:1, fumbleEffect:'self-poison', rawPage:'RR p.105' },
    'alchemy:extract-toxin-dried':  { label:'Extract toxin from a dried plant', proficiency:'alchemy', tierTargets:{1:24,2:20,3:16}, timeCost:'1 day', activityCost:'dedicated', autoFailBand:1, fumbleEffect:'self-poison', rawPage:'RR p.105' },

    // Animal Husbandry (RR p.106)
    'animal-husbandry:diagnose':      { label:'Diagnose an animal’s illness/poison', proficiency:'animal-husbandry', tierTargets:{1:11,2:7,3:3}, timeCost:'1 turn', autoFailBand:1, retryGate:'next-symptom', rawPage:'RR p.106' },
    'animal-husbandry:cure':          { label:'Cure an animal (neutralize/cure)', proficiency:'animal-husbandry', tierTargets:{2:18,3:14}, minTier:2, timeCost:'1 turn', autoFailBand:1, retryGate:'next-day', rawPage:'RR p.106' },
    'animal-husbandry:extract-venom': { label:'Extract venom from a slain animal', proficiency:'animal-husbandry', baseTarget:18, timeCost:'1 hour', activityCost:'ancillary', autoFailBand:1, fumbleEffect:'self-poison', repeatable:true, rawPage:'RR p.106' },

    // Art / Craft (RR p.107) — identify masterwork / rare materials, tiered 11/7/3/2
    'art:identify':   { label:'Identify masterwork items / rare materials / artisans', proficiency:'art', tierTargets:{1:11,2:7,3:3,4:2}, autoFailBand:1, rawPage:'RR p.107' },
    'craft:identify': { label:'Identify masterwork items / rare materials / artisans', proficiency:'craft', tierTargets:{1:11,2:7,3:3,4:2}, autoFailBand:1, rawPage:'RR p.107' },

    // Arcane Dabbling (RR p.106)
    'arcane-dabbling:use-item': { label:'Use an arcane wand/staff/item', proficiency:'arcane-dabbling', baseTarget:4, autoFailBand:1, fumbleEffect:'backfires', rawPage:'RR p.106' },

    // Beast Friendship (RR p.107)
    'beast-friendship:identify': { label:'Identify plants & fauna', proficiency:'beast-friendship', baseTarget:11, autoFailBand:1, rawPage:'RR p.107' },

    // Caving (RR p.108)
    'caving:recall-route': { label:'Recall the route taken underground', proficiency:'caving', baseTarget:11, perRankTargetDelta:-4, autoFailBand:1, rawPage:'RR p.108' },

    // Climbing (RR p.108) — class-derived (climb as a thief of class level)
    'climbing:climb': { label:'Climb a wall (per 100 ft)', proficiency:'climbing', baseTargetSource:'class-climbing', autoFailBand:1, repeatable:true, rawPage:'RR p.108' },

    // Collegiate Wizardry (RR p.108)
    'collegiate-wizardry:recognize': { label:'Recognize another order’s arcane symbols/grimoires', proficiency:'collegiate-wizardry', baseTarget:11, perRankTargetDelta:-4, autoFailBand:1, rawPage:'RR p.108' },

    // Contortionism (RR p.109)
    'contortionism:escape': { label:'Escape shackles / slip between bars', proficiency:'contortionism', baseTarget:18, perLevelTargetDelta:-1, timeCost:'1 round', autoFailBand:1, repeatable:true, retryGate:'free', rawPage:'RR p.109' },

    // Disguise (RR p.109)
    'disguise:create': { label:'Create a disguise', proficiency:'disguise', baseTarget:11, perRankTargetDelta:-2, timeCost:'1 hour', activityCost:'ancillary', autoFailBand:1, repeatable:true, retryGate:'free', rawPage:'RR p.109' },

    // Dwarven Brewing (RR p.110)
    'dwarven-brewing:identify-potion': { label:'Identify a potion/oil by smell', proficiency:'dwarven-brewing', baseTarget:11, autoFailBand:1, rawPage:'RR p.110' },

    // Eavesdropping (RR p.110) — listen as a thief; the Judge rolls in secret
    'eavesdropping:listen': { label:'Listen for noises (as a thief)', proficiency:'eavesdropping', baseTargetSource:'class-listening', secretByDefault:true, autoFailBand:1, rawPage:'RR p.110' },

    // Engineering (RR p.110)
    'engineering:evaluate': { label:'Evaluate a construction’s condition/age', proficiency:'engineering', baseTarget:11, autoFailBand:1, rawPage:'RR p.110' },

    // Healing (RR p.112)
    'healing:diagnose': { label:'Diagnose an illness/poison', proficiency:'healing', tierTargets:{1:11,2:7,3:3}, timeCost:'1 turn', autoFailBand:1, retryGate:'next-symptom', rawPage:'RR p.112' },
    'healing:cure':     { label:'Cure (neutralize/cure injury)', proficiency:'healing', tierTargets:{2:18,3:14}, minTier:2, timeCost:'1 turn', autoFailBand:1, retryGate:'next-day', rawPage:'RR p.112' },

    // Knowledge (RR p.112)
    'knowledge:recall': { label:'Recall expert information in your field', proficiency:'knowledge', tierTargets:{1:11,2:7,3:3}, autoFailBand:1, rawPage:'RR p.112' },

    // Land Surveying (RR p.111)
    'land-surveying:detect-danger': { label:'Detect a terrain danger while travelling', proficiency:'land-surveying', baseTarget:14, secretByDefault:true, autoFailBand:1, rawPage:'RR p.111' },
    'land-surveying:survey':        { label:'Methodically survey 10,000 sq ft', proficiency:'land-surveying', baseTarget:10, timeCost:'1 turn', autoFailBand:1, rawPage:'RR p.111' },

    // Loremastery (RR p.113)
    'loremastery:decipher': { label:'Decipher runes / recall ancient lore / identify an artifact', proficiency:'loremastery', baseTarget:18, perLevelTargetDelta:-1, autoFailBand:1, rawPage:'RR p.113' },

    // Magical Engineering (RR p.113)
    'magical-engineering:recognize-item': { label:'Recognize a conventional magic item/component', proficiency:'magical-engineering', baseTarget:11, perRankTargetDelta:-4, timeCost:'1 turn', autoFailBand:1, rawPage:'RR p.113' },

    // Magical Music (RR p.114) — needs Performance; 11+, −1/level
    'magical-music:perform-effect': { label:'Invoke a magical-music effect', proficiency:'magical-music', baseTarget:11, perLevelTargetDelta:-1, autoFailBand:1, rawPage:'RR p.114' },

    // Manual of Arms (RR p.113)
    'manual-of-arms:identify': { label:'Identify another realm’s standards/captains/insignia', proficiency:'manual-of-arms', baseTarget:11, autoFailBand:1, rawPage:'RR p.113' },

    // Mapping (RR p.114)
    'mapping:interpret': { label:'Interpret/draft a complicated layout', proficiency:'mapping', baseTarget:11, timeCost:'1 turn', autoFailBand:1, rawPage:'RR p.114' },

    // Military Strategy (RR p.115)
    'military-strategy:recognize': { label:'Recognize historical battles/generals/weapons', proficiency:'military-strategy', baseTarget:11, perRankTargetDelta:-4, autoFailBand:1, rawPage:'RR p.115' },

    // Mimicry (RR p.115)
    'mimicry:imitate': { label:'Imitate an animal call / foreign accent', proficiency:'mimicry', baseTarget:11, autoFailBand:1, rawPage:'RR p.115' },

    // Naturalism (RR p.115)
    'naturalism:appraise':          { label:'Appraise/identify plants, venom, herbs, dangers', proficiency:'naturalism', baseTarget:11, perRankTargetDelta:-4, timeCost:'1 turn', autoFailBand:1, rawPage:'RR p.115' },
    'naturalism:identify-component':{ label:'Identify special components', proficiency:'naturalism', baseTarget:14, perRankTargetDelta:-4, autoFailBand:1, rawPage:'RR p.115' },

    // Performance (RR p.116)
    'performance:identify': { label:'Identify famous performers/masterpieces/instruments', proficiency:'performance', baseTarget:11, autoFailBand:1, rawPage:'RR p.116' },

    // Profession (RR p.117)
    'profession:expert-commentary': { label:'Make expert commentary in your profession', proficiency:'profession', tierTargets:{1:11,2:7,3:3}, autoFailBand:1, rawPage:'RR p.117' },

    // Prospecting (RR p.117) — +4 with Land Surveying
    'prospecting:assess-hex': { label:'Assess a 6-mile hex for ore', proficiency:'prospecting', baseTarget:18, timeCost:'1 day', activityCost:'dedicated', autoFailBand:1, modifiedBy:['land-surveying'], rawPage:'RR p.117' },

    // Streetwise (RR p.119)
    'streetwise:recognize': { label:'Recognize a criminal organization’s signs/territory', proficiency:'streetwise', baseTarget:11, autoFailBand:1, rawPage:'RR p.119' },

    // Theology (RR p.119)
    'theology:recognize': { label:'Recognize a faith’s symbols/holy days', proficiency:'theology', baseTarget:11, perRankTargetDelta:-4, autoFailBand:1, rawPage:'RR p.119' },

    // Tracking (RR p.120) — find tracks 11+, −4/extra rank; the count/ground/weather/light bands are situational
    'tracking:find-tracks': { label:'Find tracks', proficiency:'tracking', baseTarget:11, perRankTargetDelta:-4, timeCost:'1 turn', autoFailBand:1, repeatable:true, retryGate:'next-hour', rawPage:'RR p.120' },

    // Trapping (RR p.121) — the daily catch-game throw (the Judge rolls)
    'trapping:catch-game': { label:'Wilderness trap catches game (daily)', proficiency:'trapping', baseTarget:19, secretByDefault:true, autoFailBand:1, fumbleEffect:'crude-trap-breaks', rawPage:'RR p.121' },

    // Vermin-Slaying (RR p.121)
    'vermin-slaying:identify': { label:'Identify an ooze/vermin’s abilities & vulnerabilities', proficiency:'vermin-slaying', baseTarget:11, autoFailBand:1, rawPage:'RR p.121' },

    // Lockpicking (RR p.31) — class-derived base (the thief Lockpicking value); +2 from Expertise
    'lockpicking:pick-lock': { label:'Pick a lock', proficiency:'lockpicking', baseTargetSource:'class-lockpicking', governingAbility:'DEX', autoFailBand:1, fumbleEffect:'pick-breaks', repeatable:true, modifiedBy:['lockpicking-expertise'], rawPage:'RR p.31' }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2c-bis (PT-5) — PROFICIENCY_THROWS_DEFERRED. The catalog roster is COMPLETE (every
  // RR-listed proficiency is present, accurately typed + page-cited) and the throw-granting subset
  // has its PROFICIENCY_TASKS. Three proficiencies are typed throw/mixed but have no standalone task
  // here ON PURPOSE — their throw is OWNED by a consuming phase (§7.1 "read by the owning phase"),
  // so transcribing a target now, with no consumer to validate it, would risk a coarse value
  // (CLAUDE §6 cartography-before-mechanics). The throw-completeness invariant (proficiencies.smoke)
  // requires every type:'throw'/'mixed' prof to have a task, be a throw-modifier, OR be tracked here
  // — so a throw prof can never silently ship with no throw + no reason. Each entry names the owning
  // phase + the RAW page to transcribe from when that phase consumes it. (The per-prof NON-throw
  // `effects` blocks of §7.1 — combat/economic/passive/magic — are likewise deferred to their owning
  // phases for the same reason; PT-5 does not transcribe consumer-less effect tables.)
  // ─────────────────────────────────────────────────────────────────────────
  const PROFICIENCY_THROWS_DEFERRED = Object.freeze({
    'seafaring':   { reason:'sea-handling / sea-navigation throw (the mixed prof also has a sailor-income side)', owningPhase:'Voyages V2 (Phase_3_Voyages_Plan.md)', rawPage:'RR p.117' },
    'poisoning':   { reason:'grants the Naturalism / Animal-Husbandry / Alchemy extraction throws as 1-rank equivalents + the no-botch effect — a throw-MODIFIER shape, not a standalone throw', owningPhase:'Combat / assassination (#141)', rawPage:'RR p.116' },
    'lip-reading': { reason:'decipher-speech-at-a-distance perception throw', owningPhase:'a perception / Hijinks consumer (Phase 2.7)', rawPage:'RR p.113' }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2d — throw-MODIFIER proficiencies (improve another proficiency's throw).
  // setTarget overrides the base target with the (lower) value; bonus is a roll bonus.
  // ─────────────────────────────────────────────────────────────────────────
  const PROFICIENCY_THROW_MODIFIERS = {
    'alertness':              { modifies:[{task:'adventuring:searching', setTarget:14},{task:'adventuring:listening', setTarget:14}], rawPage:'RR p.105' },
    'trapfinding':            { modifies:[{task:'adventuring:searching', bonus:2},{task:'adventuring:trapbreaking', bonus:2}], rawPage:'RR p.121' },
    'dungeonbashing-expertise':{ modifies:[{task:'adventuring:dungeonbashing', bonus:4}], rawPage:'RR p.109' },
    'lockpicking-expertise':  { modifies:[{task:'lockpicking:pick-lock', bonus:2}], rawPage:'RR p.113' },
    'land-surveying':         { modifies:[{task:'prospecting:assess-hex', bonus:4}], rawPage:'RR p.117' }
    // Navigation (+4 avoid getting lost, RR p.116), Survival (+4 forage, RR p.119), Swimming
    // (+4 swim, RR p.119), and Tracking's party lair-search +4 (RR p.120) modify throws that
    // live in OTHER engine modules (journeys/provisioning/monster-persistence). The PT-6 sweep
    // wires those resolvers onto this layer; PT-1 leaves them to their existing readers.
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2e — IMPROVISED_THROW_DIFFICULTY (JJ p.94): a target value for any uncodified task.
  // targetByRank slash-notation = additional ranks of a relevant proficiency make it easier.
  // ─────────────────────────────────────────────────────────────────────────
  const IMPROVISED_THROW_DIFFICULTY = Object.freeze({
    'luck':               { label:'Largely a matter of luck', target:11, abilityMultiplier:0, autoFailBand:1 },
    'raw-ability':        { label:'A test of raw ability', target:18, abilityMultiplier:4, autoFailBand:1 },
    'routine-safe':       { label:'Routine and safe', targetByRank:{0:4,1:2,2:2}, abilityMultiplier:0, autoFailBand:1 },
    'routine-dangerous':  { label:'Routine and dangerous', targetByRank:{0:8,1:4,2:2}, abilityMultiplier:0, autoFailBand:1 },
    'recall-training':    { label:'Requires careful recall of training', targetByRank:{0:11,1:7,2:4}, abilityMultiplier:0, autoFailBand:1 },
    'difficult-safe':     { label:'Difficult, safe task', targetByRank:{0:14,1:11,2:7}, abilityMultiplier:0, autoFailBand:1 },
    'difficult-dangerous':{ label:'Difficult, dangerous task', targetByRank:{0:18,1:14,2:10}, abilityMultiplier:0, autoFailBand:3 }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 2f — PROFICIENCY_ALIASES: normalize spellings/synonyms seen in legacy saves +
  // templates/demo to a canonical key. Seeded from the distinct strings across the 6 templates
  // + the demo (plan §15 OQ1), plus common variants.
  // ─────────────────────────────────────────────────────────────────────────
  const PROFICIENCY_ALIASES = Object.freeze({
    'manual-of-arms':'manual-of-arms',
    'fighting-style':'fighting-style-specialization',
    'lockpicking-expertise':'lockpicking-expertise',
    'lock-picking':'lockpicking',
    'lockpicking':'lockpicking',
    'passing-without-trace':'passing-without-trace',
    'art-craft':'craft',
    'goblin-slaying':'goblin-slaying',
    'kin-slaying':'kin-slaying',
    'vermin-slaying':'vermin-slaying',
    // demo/template variants
    'command':'command',
    'heraldry':'manual-of-arms'  // 'Heraldry' (a demo flavour label) ≈ Manual of Arms' standards/insignia recognition
  });

  // Canonicalize a raw proficiency key/label to a catalog key (alias-folded, & → and).
  function canonicalProficiencyKey(raw){
    const k = _slug(String(raw == null ? '' : raw).replace(/\s*\([^)]*\)\s*$/, '')); // drop a trailing "(…)" qualifier
    return PROFICIENCY_ALIASES[k] || k;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 0 — the canonical {key,ranks} model, PARSED from the loose stored field.
  // ─────────────────────────────────────────────────────────────────────────

  // Parse a single stored proficiency entry (string or object) → {key, ranks, spec, label}.
  // Handles: "Theology (2)" (numeric parens = rank), "Craft (smithing)" (text parens = spec),
  // "Military Strategy 2" (trailing number = rank), bare "Diplomacy", {key|name|proficiency,...}.
  function parseProficiencyEntry(entry){
    if(entry == null) return null;
    let label, ranks = null, spec = '';
    if(typeof entry === 'object'){
      label = entry.label || entry.name || entry.key || entry.proficiency || '';
      if(typeof entry.ranks === 'number') ranks = entry.ranks;
      if(entry.spec) spec = String(entry.spec);
    } else {
      label = String(entry);
    }
    label = String(label).trim();
    if(!label) return null;
    // trailing "(…)" qualifier — numeric → rank; text → spec
    const paren = label.match(/\(([^)]*)\)\s*$/);
    if(paren){
      const inner = paren[1].trim();
      const numMatch = inner.match(/^\s*(\d+)\s*$/);
      if(numMatch){ if(ranks == null) ranks = parseInt(numMatch[1], 10); }
      else if(!spec){ spec = inner; }
      label = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    }
    // trailing bare number — "Military Strategy 2"
    const trail = label.match(/\s+(\d+)\s*$/);
    if(trail && ranks == null){ ranks = parseInt(trail[1], 10); label = label.replace(/\s+\d+\s*$/, '').trim(); }
    if(ranks == null) ranks = 1;
    const key = canonicalProficiencyKey(label);
    return { key, ranks: Math.max(1, ranks), spec, label: (PROFICIENCY_CATALOG[key] ? PROFICIENCY_CATALOG[key].label : label) };
  }

  // Normalize a character's loose proficiencies[] → [{key, ranks, spec, label}], one per
  // (key, spec) group. ranks per group = max(explicit ranks seen, count of entries) — so
  // ["Tracking","Tracking"] → ranks 2 and "Theology (2)" → ranks 2, while "Craft (smithing)"
  // and "Craft (carpentry)" stay separate rank-1 entries.
  function characterProficiencies(character){
    const raw = (character && Array.isArray(character.proficiencies)) ? character.proficiencies : [];
    const groups = new Map();
    for(const e of raw){
      const p = parseProficiencyEntry(e);
      if(!p) continue;
      const gk = p.key + '|' + (p.spec || '');
      const g = groups.get(gk);
      if(g){ g.ranks = Math.max(g.ranks, p.ranks); g.count += 1; }
      else groups.set(gk, { key:p.key, spec:p.spec, label:p.label, ranks:p.ranks, count:1 });
    }
    const out = [];
    for(const g of groups.values()) out.push({ key:g.key, spec:g.spec, label:g.label, ranks:Math.max(g.ranks, g.count) });
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PT-0 — the on-disk migration. Materialize the loose stored proficiencies[] into the
  // canonical { key, ranks (, spec, label) } shape ON DISK (idempotent). The read-layer above
  // already parses every legacy form on the fly; this writes that view back so the field is
  // canonical for the engine officer readers + integrators reading the .acks.json directly.
  // See Phase_3.6_Proficiency_Throws_Plan.md §5.2.
  // ─────────────────────────────────────────────────────────────────────────

  // One normalized group → the stored entry. `ranks` and (when set) `spec` always; `label` ONLY
  // for an off-catalog key, so a GM's custom proficiency keeps its human name (never reduced to a
  // slug) and round-trips (parseProficiencyEntry reads entry.label). A catalog key derives its
  // label from PROFICIENCY_CATALOG, so storing it would be redundant.
  function _materializeProficiencyEntry(g){
    const o = { key: g.key, ranks: Math.max(1, (g.ranks | 0) || 1) };
    if(g.spec) o.spec = String(g.spec);
    if(!PROFICIENCY_CATALOG[g.key] && g.label && g.label !== g.key) o.label = String(g.label);
    return o;
  }
  // Field-wise compare (NOT JSON — property order must not matter): two arrays are the same shape
  // iff every entry is a {key,ranks,spec?,label?} object matching the materialized target. A string
  // / legacy-shaped entry, a length mismatch, or any differing field → not yet canonical → migrate.
  function _sameProficiencyShape(stored, next){
    if(!Array.isArray(stored) || stored.length !== next.length) return false;
    for(let i = 0; i < stored.length; i++){
      const x = stored[i], y = next[i];
      if(!x || typeof x !== 'object' || Array.isArray(x)) return false;
      if(x.key !== y.key || (x.ranks | 0) !== y.ranks) return false;   // a bare {key} (ranks→0) ≠ materialized (≥1) → migrate
      if((x.spec || '') !== (y.spec || '')) return false;
      if((x.label || '') !== (y.label || '')) return false;
    }
    return true;
  }
  // Migrate one character's proficiencies[] in place. Returns true iff it rewrote the field.
  function migrateCharacterProficiencies(character){
    if(!character || !Array.isArray(character.proficiencies)) return false;
    const next = characterProficiencies(character).map(_materializeProficiencyEntry);
    if(_sameProficiencyShape(character.proficiencies, next)) return false;   // already canonical → no-op
    character.proficiencies = next;
    return true;
  }
  function migrateAllCharacterProficiencies(campaign){
    if(!campaign || !Array.isArray(campaign.characters)) return 0;
    let n = 0;
    for(const c of campaign.characters){ if(migrateCharacterProficiencies(c)) n++; }
    return n;
  }

  // Class-power → proficiency-rank equivalents (DQ3): a class power can stand in for proficiency
  // ranks (e.g. a Bard's Performance class power = 1 rank Performance). Minimal seed; extended by
  // later phases. Matched case-insensitively against character.classPowers[].
  const CLASS_POWER_EQUIVALENTS = Object.freeze({
    'performance':  [{ re:/performance/i, ranks:1 }],
    'loremastery':  [{ re:/loremastery/i, ranks:1 }],
    'tracking':     [{ re:/\btracking\b/i, ranks:1 }],
    'lockpicking':  [{ re:/lockpicking|pick\s*locks?/i, ranks:1 }]
  });
  function _classPowerRanks(character, key){
    const eqs = CLASS_POWER_EQUIVALENTS[key];
    if(!eqs) return 0;
    const powers = (character && Array.isArray(character.classPowers)) ? character.classPowers : [];
    const labels = powers.map(p => (typeof p === 'string' ? p : (p && (p.name || p.key || p.label || p.proficiency)) || ''));
    let best = 0;
    for(const eq of eqs){ if(labels.some(l => eq.re.test(l))) best = Math.max(best, eq.ranks); }
    return best;
  }

  // Ranks a character has in a proficiency (alias-folded; class-power equivalents folded in).
  // Defensive: works on the loose stored field directly (no migration required).
  function proficiencyRanks(character, profKey){
    if(!character) return 0;
    const key = canonicalProficiencyKey(profKey);
    let best = 0;
    for(const g of characterProficiencies(character)){ if(g.key === key) best = Math.max(best, g.ranks); }
    best = Math.max(best, _classPowerRanks(character, key));
    return best;
  }
  function hasProficiency(character, profKey){ return proficiencyRanks(character, profKey) >= 1; }
  // Adventuring is universal for PCs (RR p.105) — its 5 sub-throws are always available.
  function _isProficientInTask(character, task){
    if(!task) return false;
    if(task.proficiency === 'adventuring') return true;
    return proficiencyRanks(character, task.proficiency) >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 1 — the throw resolver. Pure, rng-injectable, RAW-complete (RR pp.9–10).
  // ─────────────────────────────────────────────────────────────────────────
  function rollProficiencyThrow(opts){
    opts = opts || {};
    const target = Number(opts.target);
    const modifiers = Array.isArray(opts.modifiers) ? opts.modifiers.filter(m => m && typeof m.value === 'number') : [];
    const proficient = !!opts.proficient;
    const autoFailBand = (typeof opts.autoFailBand === 'number') ? opts.autoFailBand : 1;
    const fumbleEffect = opts.fumbleEffect || null;
    const secret = !!opts.secret;
    const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
    const natural = 1 + Math.floor(rng() * 20);                 // 1d20 (the only proficiency-throw die — RR p.102)
    const modifierTotal = modifiers.reduce((s, m) => s + (Number(m.value) || 0), 0);
    const total = natural + modifierTotal;
    let success, auto = null;
    if(natural <= autoFailBand){ success = false; auto = 'fail'; }            // nat-1 (or wider band) always fails
    else if(natural === 20 && proficient){ success = true; auto = 'success'; } // nat-20 auto-succeeds ONLY if proficient
    else { success = (Number.isFinite(target) ? total >= target : false); }
    return {
      natural, target, modifiers, modifierTotal, total, success,
      margin: Number.isFinite(target) ? (total - target) : null,
      auto,
      botch: natural <= autoFailBand,
      crit: natural === 20 && proficient,
      fumbleEffect, secret, die: 'd20'
    };
  }

  // The chance (0..1) a throw with this target/mods/band/proficiency succeeds on 1d20.
  function throwSuccessChance(target, modifierTotal, autoFailBand, proficient){
    const t = Number(target), m = Number(modifierTotal) || 0, b = (typeof autoFailBand === 'number') ? autoFailBand : 1;
    if(!Number.isFinite(t)) return null;
    let wins = 0;
    for(let r = 1; r <= 20; r++){
      if(r <= b) continue;
      if(r === 20 && proficient){ wins++; continue; }
      if(r + m >= t) wins++;
    }
    return wins / 20;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Layer 3 — per-character throw derivation.
  // ─────────────────────────────────────────────────────────────────────────

  // Resolve a task's base target for a given rank count (tierTargets / per-rank / per-level /
  // class-derived). Returns { target, unavailableReason }.
  function _resolveBaseTarget(task, ranks, level){
    if(task.baseTargetSource){
      return { target: null, source: task.baseTargetSource };  // class-progression-derived — no number yet (plan §15)
    }
    if(task.tierTargets){
      const tiers = Object.keys(task.tierTargets).map(Number).sort((a,b)=>a-b);
      const minTier = task.minTier || tiers[0];
      if((ranks || 0) < minTier) return { target: null, unavailableReason: 'requires ' + minTier + ' rank' + (minTier>1?'s':'') };
      const maxTier = tiers[tiers.length - 1];
      const useTier = Math.min(Math.max(ranks || minTier, minTier), maxTier);
      return { target: task.tierTargets[useTier] };
    }
    let t = Number(task.baseTarget);
    if(task.perRankTargetDelta && (ranks || 0) > 1) t += task.perRankTargetDelta * ((ranks || 1) - 1);
    if(task.perLevelTargetDelta && (level || 1) > 1) t += task.perLevelTargetDelta * ((level || 1) - 1);
    return { target: t };
  }

  // characterProficiencyThrow(campaign, character, taskKey, opts) — resolve the effective target
  // + itemized modifiers + (if opts.roll !== false) the d20 result.
  // opts: { situational:[{source,value,label}], fatiguePenalty, secret, abilityKeyOverride,
  //         difficultyClass, relevantRanks (for an improvised throw), rng, roll }
  function characterProficiencyThrow(campaign, character, taskKey, opts){
    opts = opts || {};
    const level = _charLevel(character);
    let task, improvised = null;
    if(opts.difficultyClass){
      improvised = IMPROVISED_THROW_DIFFICULTY[opts.difficultyClass];
      if(!improvised) return { error: 'unknown difficulty class: ' + opts.difficultyClass };
    } else {
      task = PROFICIENCY_TASKS[taskKey];
      if(!task) return { error: 'unknown task: ' + taskKey };
    }

    const itemized = [];
    let resolvedTarget, proficient, governingAbility, abilityMultiplier, autoFailBand, fumbleEffect, baseTargetSource = null, unavailableReason = null;

    if(improvised){
      governingAbility = opts.abilityKeyOverride || 'STR';
      abilityMultiplier = improvised.abilityMultiplier || 0;
      autoFailBand = improvised.autoFailBand;
      fumbleEffect = null;
      const relRanks = Math.max(0, Number(opts.relevantRanks) || 0);
      if(improvised.targetByRank){
        const tiers = Object.keys(improvised.targetByRank).map(Number).sort((a,b)=>a-b);
        const useR = Math.min(relRanks, tiers[tiers.length-1]);
        resolvedTarget = improvised.targetByRank[useR];
      } else resolvedTarget = improvised.target;
      proficient = relRanks >= 1;
    } else {
      const ranks = proficiencyRanks(character, task.proficiency);
      governingAbility = opts.abilityKeyOverride || task.governingAbility || null;
      abilityMultiplier = task.abilityMultiplier || 0;
      autoFailBand = (typeof task.autoFailBand === 'number') ? task.autoFailBand : 1;
      fumbleEffect = task.fumbleEffect || null;
      const base = _resolveBaseTarget(task, ranks, level);
      resolvedTarget = base.target;
      baseTargetSource = base.source || null;
      unavailableReason = base.unavailableReason || null;
      proficient = _isProficientInTask(character, task);
      // throw-modifier proficiencies the actor has that modify this task
      for(const g of characterProficiencies(character)){
        const mod = PROFICIENCY_THROW_MODIFIERS[g.key];
        if(!mod) continue;
        for(const m of (mod.modifies || [])){
          if(m.task !== taskKey) continue;
          if(typeof m.setTarget === 'number' && Number.isFinite(resolvedTarget) && m.setTarget < resolvedTarget){
            itemized.push({ source: g.key, value: resolvedTarget - m.setTarget, label: (PROFICIENCY_CATALOG[g.key]?PROFICIENCY_CATALOG[g.key].label:g.key) + ' (sets to ' + m.setTarget + '+)' });
            resolvedTarget = m.setTarget;
          } else if(typeof m.bonus === 'number'){
            itemized.push({ source: g.key, value: m.bonus, label: (PROFICIENCY_CATALOG[g.key]?PROFICIENCY_CATALOG[g.key].label:g.key) });
          }
        }
      }
    }

    // ability modifier × multiplier
    if(governingAbility && abilityMultiplier){
      const score = (character && character.abilities && character.abilities[governingAbility]) || 10;
      const am = _abilityMod(score) * abilityMultiplier;
      if(am !== 0) itemized.push({ source: 'ability', value: am, label: governingAbility + (abilityMultiplier !== 1 ? (' ×' + abilityMultiplier) : '') });
    }
    // situational + fatigue (JJ p.95 overtime — the #346 hook)
    for(const s of (Array.isArray(opts.situational) ? opts.situational : [])){
      if(s && typeof s.value === 'number' && s.value !== 0) itemized.push({ source: s.source || 'situational', value: s.value, label: s.label || s.source || 'situational' });
    }
    if(typeof opts.fatiguePenalty === 'number' && opts.fatiguePenalty !== 0) itemized.push({ source: 'overtime', value: opts.fatiguePenalty, label: 'overtime/fatigue (JJ p.95)' });

    const modifierTotal = itemized.reduce((s, m) => s + (Number(m.value) || 0), 0);
    const secret = (opts.secret != null) ? !!opts.secret : !!(task && task.secretByDefault);

    const base = {
      taskKey: improvised ? ('improvised:' + opts.difficultyClass) : taskKey,
      label: improvised ? improvised.label : task.label,
      proficiency: improvised ? null : { key: task.proficiency, ranks: proficiencyRanks(character, task.proficiency) },
      resolvedTarget, baseTargetSource, unavailableReason,
      itemizedModifiers: itemized, modifierTotal, proficient, autoFailBand, fumbleEffect, secret,
      successChance: throwSuccessChance(resolvedTarget, modifierTotal, autoFailBand, proficient)
    };

    if(opts.roll === false || resolvedTarget == null) return base;  // forecast only (or class-derived, no number)
    const result = rollProficiencyThrow({
      target: resolvedTarget, modifiers: itemized, proficient, autoFailBand, fumbleEffect, secret, rng: opts.rng
    });
    return Object.assign({}, base, result);
  }

  // Enumerate the throws a character can attempt (drives the modal dropdown): the 5 universal
  // Adventuring sub-throws + every PROFICIENCY_TASK whose proficiency the character has (and can
  // attempt at its rank). Each row carries a roll:false forecast.
  function characterAvailableThrows(campaign, character){
    const out = [];
    for(const [taskKey, task] of Object.entries(PROFICIENCY_TASKS)){
      const universal = task.proficiency === 'adventuring';
      if(!universal && proficiencyRanks(character, task.proficiency) < 1) continue;
      const fc = characterProficiencyThrow(campaign, character, taskKey, { roll: false });
      if(fc && fc.unavailableReason) continue;  // can't attempt at this rank (e.g. cure needs 2 ranks)
      out.push({
        taskKey, label: task.label, proficiency: task.proficiency,
        ranks: universal ? null : proficiencyRanks(character, task.proficiency),
        universal,
        resolvedTarget: fc ? fc.resolvedTarget : null,
        baseTargetSource: fc ? fc.baseTargetSource : null,
        rawPage: task.rawPage,
        group: universal ? 'Adventuring' : (PROFICIENCY_CATALOG[task.proficiency] ? PROFICIENCY_CATALOG[task.proficiency].label : task.proficiency)
      });
    }
    return out;
  }

  function proficiencyLabel(key){ const c = PROFICIENCY_CATALOG[canonicalProficiencyKey(key)]; return c ? c.label : String(key||''); }

  // ─────────────────────────────────────────────────────────────────────────
  // Optional record-only event (DQ6): the throw itself is ephemeral; this logs a stand-alone GM
  // throw when the GM ticks "record". campaignLogHidden by default so the eventLog never floods.
  // Uses ACKS.newEvent when present (load order guarantees it after events.js).
  // ─────────────────────────────────────────────────────────────────────────
  function recordProficiencyThrow(campaign, data, opts){
    if(!campaign) return null;
    opts = opts || {};
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    const payload = {
      actorCharacterId: data.actorCharacterId || null,
      taskKey: data.taskKey || null, label: data.label || '',
      target: data.target != null ? data.target : (data.resolvedTarget != null ? data.resolvedTarget : null),
      natural: data.natural != null ? data.natural : null,
      modifierTotal: data.modifierTotal != null ? data.modifierTotal : 0,
      total: data.total != null ? data.total : null,
      success: !!data.success, secret: !!data.secret,
      modifiers: Array.isArray(data.itemizedModifiers) ? data.itemizedModifiers : (data.modifiers || []),
      narrative: data.narrative || ''
    };
    let ev;
    if(typeof ACKS.newEvent === 'function' && typeof ACKS.isEventKindKnown === 'function' && ACKS.isEventKindKnown('proficiency-throw')){
      ev = ACKS.newEvent('proficiency-throw', {
        submittedBy: opts.submittedBy || 'gm', status: 'applied',
        cadence: opts.cadence || 'monthly-turn',
        targetTurn: campaign.currentTurn || 1, payload
      });
    } else {
      ev = { id: 'evt-pt-' + ((campaign.eventLog.length || 0) + 1), kind: 'proficiency-throw', status: 'applied', payload, submittedBy: opts.submittedBy || 'gm' };
    }
    ev.appliedAtTurn = campaign.currentTurn || 1;
    ev.appliedAtDay = campaign.currentDayInMonth || 1;
    ev.campaignLogHidden = true;  // a die roll is table chatter — keep it out of the narrative log
    const narrativeSummary = payload.narrative || ((payload.label || 'Proficiency throw') + ': ' + (payload.success ? 'success' : 'failure') + (payload.total != null && payload.target != null ? (' (' + payload.total + ' vs ' + payload.target + '+)') : ''));
    campaign.eventLog.push({ event: ev, result: { narrativeSummary }, appliedAtTurn: campaign.currentTurn || 1, appliedAtDay: campaign.currentDayInMonth || 1, appliedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : '') });
    return ev;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export onto window.ACKS
  // ─────────────────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    // catalog (Layer 2)
    PROFICIENCY_CATALOG, PROFICIENCY_TASKS, PROFICIENCY_THROW_MODIFIERS, PROFICIENCY_THROWS_DEFERRED,
    IMPROVISED_THROW_DIFFICULTY, PROFICIENCY_ALIASES, PROFICIENCY_LISTS, PROFICIENCY_TYPES: TYPES,
    // model (Layer 0)
    parseProficiencyEntry, characterProficiencies, canonicalProficiencyKey,
    proficiencyRanks, hasProficiency, proficiencyLabel,
    // model migration (PT-0)
    migrateCharacterProficiencies, migrateAllCharacterProficiencies,
    // resolver (Layer 1)
    rollProficiencyThrow, throwSuccessChance,
    // derivation (Layer 3)
    characterProficiencyThrow, characterAvailableThrows,
    // optional record-only log
    recordProficiencyThrow
  });

})(typeof window !== 'undefined' ? window : global);
