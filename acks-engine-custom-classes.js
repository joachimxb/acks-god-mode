/* =============================================================================
 * acks-engine-custom-classes.js — ACKS God Mode Custom Classes & Races (#154, W1)
 *
 * The class-building DATA LAYER: the point-buy derivation engine + two first-class
 * catalog/template entities —
 *   • ClassTemplate  (campaign.customClasses[], prefix ccl-) — a class DEFINITION:
 *        its build-point allocation + a handful of choices. Everything else DERIVES.
 *   • RaceTemplate   (campaign.customRaces[],   prefix crc-) — a race that constrains
 *        + modifies a class build (the +4-racial-build-point extension).
 * A Character references a template (later); the template is the definition behind
 * the existing character.class / character.race strings (Architecture §2).
 *
 * THE HEADLINE (survey §1): a class is fully specified by (a) its build-point
 * allocation across the categories + (b) a few choices; the rulebook DERIVES the rest
 * by table lookup — Hit Die, attack progression, save progression, prime requisite,
 * magic-item access, the proficiency-list size, hp-after-9th, the stronghold, and the
 * entire XP-per-level table. So we STORE the inputs and DERIVE the output (the §3.13
 * intrinsic-derivation pattern; the economy-lift precedent). The catalog+instance shape
 * is the fourth/fifth application after Vessel / Monster / Troop.
 *
 * SCOPE (W1 — DATA LAYER + DERIVATION + SEED CORES + INSPECTOR-ONLY). Build view:
 * Phase_6_Custom_Classes_Plan.md §5 (W1 row). RAW: Custom_Classes_RAW_Survey.md.
 *   IN  : the two entities + factories; the point-buy derivation engine
 *         (deriveClassFromTemplate → save/HD/attack/XP/coreClassMapping/…); the five
 *         core category XP tables; the 19 RAW seed class builds + 5 race seeds (the
 *         validation oracle AND the out-of-the-box content, available as constants +
 *         an opt-in seedCustomContent() installer); lookups; the compendium gate.
 *   OUT : the trade-off→power machinery (W2), the full racial-value tables +
 *         deriveRaceCost + build-points→level-cap derivation (W3), the Class/Race
 *         Builder UI (W4), character-creation + reader wiring (W5), the HFH/BTA
 *         category packs + the full power compendium (W6). Character-creation +
 *         NPC-Generator CONSUMPTION are later — this lane SATISFIES the seam (§ below).
 *   ⚠ NOT touched: migrateCampaign / blankCampaign (init-on-write; defensive reads),
 *     so the 6 templates + demo stay migrate-no-ops (the team-session enabler). The
 *     lazy migrateCharacterClassTemplate (legacy core-class string → seed key, plan §7)
 *     is therefore DEFERRED to when CC W1 is scheduled standalone / with Generators G1.
 *
 * THE GENERATORS CONSUME-SEAM (Phase_4.8_Generators_Plan.md §11 / survey §10) — the
 * NPC Generator reads, per class: primeRequisites / hitDie / attackThrowProgression /
 * saveProgression / classProficiencyListSize / coreClassMapping / rarity; per race:
 * hitDiceByCombatantStatus / ageModifierDice / abilityRequirements. deriveClassFromTemplate
 * + the RaceTemplate fields below provide each field-for-field.
 *
 * SOURCE + IP (CLAUDE.md §13.6, survey §8 — softer than the monster catalog: the
 * build-point SYSTEM + category/XP/trade-off tables are HFH-OGL Open Game Content):
 *   • JJ pp.289–331 "Custom Classes" (the build system + the 5 category XP tables +
 *     the Ready-For-Play Class Builds table p.330 — the seed builds + the oracle).
 *   • JJ pp.333–337 "Custom Races" (the race build + the worked-example costings).
 *   • HFH Ch.8 pp.199–205 (the open-category extension — Eldritch/Ceremonial, W6).
 *   Mechanical values only, page-cited; NO rule prose. The seed CLASS NAMES are display
 *   strings the GM may rename (the campaign/Auran-flavoured names trend toward Product
 *   Identity — survey §8 tier 2). The ~250-power custom-power compendium (the IP-heaviest
 *   slice — survey §8 tier 3) is a default-OFF pack of names + page-refs + terse mechanical
 *   one-liners, NO transcribed descriptions; W1 ships a representative seed of it.
 *   ⚠ Autarch courtesy heads-up (§13.9 ckpt 3) before the seed names + the compendium
 *     reach the public site — flagged in the SUMMARY for Joachim's go/trim call.
 *
 * Load order: AFTER acks-engine.js (newId / ID_PREFIXES / SCHEMA_VERSION) and after
 * acks-engine-catalogs.js (isHouseRuleEnabled, for the compendium gate). A fresh
 * acks-engine-*.js loads after the core (tests/_engine.js auto-discovers it; index.html
 * adds the <script> at the burst5 b5-custom-classes marker, before player-view).
 * Self-contained: pure reads/derivations + init-on-write setters over a passed campaign,
 * late-bound on global.ACKS. Mirrors the acks-engine-voyages.js idiom.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // Late-bound core helpers (this module loads after acks-engine.js; reference at call
  // time so we never depend on load order beyond "core is present").
  function _newId(kind, fallbackPrefix){
    const A = global.ACKS || ACKS;
    const prefix = (A.ID_PREFIXES && A.ID_PREFIXES[kind]) || fallbackPrefix;
    return (typeof A.newId === 'function') ? A.newId(prefix) : (prefix + '-' + Math.random().toString(36).slice(2, 9));
  }
  function _schemaVersion(){
    const A = global.ACKS || ACKS;
    return (typeof A.SCHEMA_VERSION === 'number') ? A.SCHEMA_VERSION : 2;
  }
  function _isHouseRuleEnabled(campaign, id){
    const A = global.ACKS || ACKS;
    if(typeof A.isHouseRuleEnabled === 'function') return A.isHouseRuleEnabled(campaign, id);
    // Fallback (registry default-OFF for custom-power-compendium) — only reached if catalogs absent.
    const hr = (campaign && campaign.houseRules && campaign.houseRules[id]);
    return !!(hr && (hr === true || hr.enabled));
  }

  // ── The build-point system as code-facing data (survey §4.1) ────────────────
  // OGC mechanical values, page-cited (JJ pp.290–296). The XP cost of each category
  // value; their sum (+ trade-off penalties) IS the 2nd-level XP — the oracle (survey §5).

  // Hit Dice value 0–4 → {hitDie, mortalWoundsMod, xpCost}. JJ p.290.
  const HD_VALUE_TABLE = Object.freeze([
    Object.freeze({ value: 0, hitDie: 'd4',  mortalWoundsMod: 0, xpCost: 0 }),
    Object.freeze({ value: 1, hitDie: 'd6',  mortalWoundsMod: 2, xpCost: 500 }),
    Object.freeze({ value: 2, hitDie: 'd8',  mortalWoundsMod: 4, xpCost: 1000 }),
    Object.freeze({ value: 3, hitDie: 'd10', mortalWoundsMod: 6, xpCost: 1500 }),
    Object.freeze({ value: 4, hitDie: 'd12', mortalWoundsMod: 8, xpCost: 2000 })
  ]);

  // Fighting value 0 / 1a / 1b / 2 / 3 / 4 → {attackProgression, weaponSelection,
  // armorProf, fightingStyleCount, xpCost}. JJ pp.290–292. The 1a/1b split at value 1
  // (1a Crusader-style: narrow weapons + heavy armor; 1b Thief-style: broad + light).
  // XP: 0 / 500 / 500 / 1000 / 1500 / 2000. Attack: +2 per 6/4/4/3/2 levels then +3/2.
  const FIGHTING_VALUE_TABLE = Object.freeze({
    '0':  Object.freeze({ value: 0,  attackProgression: '+2/6 levels', weaponSelection: 'Restricted', armorProf: 'None',      fightingStyleCount: 0, xpCost: 0 }),
    '1a': Object.freeze({ value: '1a', attackProgression: '+2/4 levels', weaponSelection: 'Narrow',     armorProf: 'Heavy',     fightingStyleCount: 1, xpCost: 500 }),
    '1b': Object.freeze({ value: '1b', attackProgression: '+2/4 levels', weaponSelection: 'Broad',      armorProf: 'Light',     fightingStyleCount: 1, xpCost: 500 }),
    '2':  Object.freeze({ value: 2,  attackProgression: '+2/3 levels', weaponSelection: 'Broad',      armorProf: 'Medium',    fightingStyleCount: 2, xpCost: 1000 }),
    '3':  Object.freeze({ value: 3,  attackProgression: '+2/2 levels', weaponSelection: 'Unrestricted', armorProf: 'Heavy',   fightingStyleCount: 2, xpCost: 1500 }),
    '4':  Object.freeze({ value: 4,  attackProgression: '+3/2 levels', weaponSelection: 'Unrestricted', armorProf: 'Heavy',   fightingStyleCount: 3, xpCost: 2000 })
  });

  // Thievery value 0–4 → {thiefSkillCount, xpCost}. JJ p.292. (Backstab counts as 2.)
  const THIEVERY_VALUE_TABLE = Object.freeze([
    Object.freeze({ value: 0, thiefSkillCount: 0,  xpCost: 0 }),
    Object.freeze({ value: 1, thiefSkillCount: 4,  xpCost: 250 }),
    Object.freeze({ value: 2, thiefSkillCount: 8,  xpCost: 500 }),
    Object.freeze({ value: 3, thiefSkillCount: 12, xpCost: 750 }),
    Object.freeze({ value: 4, thiefSkillCount: 16, xpCost: 1000 })
  ]);

  // Divine value 0–4 → {spellPowerPct, xpCost}. JJ pp.292–294. (The 4 caster-level
  // progression tables themselves are the Magic-layer seam — not transcribed in W1.)
  const DIVINE_VALUE_TABLE = Object.freeze([
    Object.freeze({ value: 0, spellPowerPct: 0,   xpCost: 0 }),
    Object.freeze({ value: 1, spellPowerPct: 50,  xpCost: 250 }),
    Object.freeze({ value: 2, spellPowerPct: 100, xpCost: 500 }),
    Object.freeze({ value: 3, spellPowerPct: 133, xpCost: 1000 }),
    Object.freeze({ value: 4, spellPowerPct: 150, xpCost: 2000 })
  ]);

  // Arcane value 0–4 → {spellPowerPct, xpCost}. JJ pp.294–296.
  const ARCANE_VALUE_TABLE = Object.freeze([
    Object.freeze({ value: 0, spellPowerPct: 0,   xpCost: 0 }),
    Object.freeze({ value: 1, spellPowerPct: 33,  xpCost: 625 }),
    Object.freeze({ value: 2, spellPowerPct: 50,  xpCost: 1250 }),
    Object.freeze({ value: 3, spellPowerPct: 66,  xpCost: 1875 }),
    Object.freeze({ value: 4, spellPowerPct: 100, xpCost: 2500 })
  ]);

  // The five CORE categories as an OPEN registry (survey §4.6 / O3) — each def carries
  // its XP table + how it maps to a save-progression core class + its prime attribute.
  // HFH Eldritch/Ceremonial + BTA Gnostic are content-pack categories appended in W6;
  // the registry is the composition principle at the category level (not a fixed struct).
  const CLASS_CATEGORIES = Object.freeze({
    hd:       Object.freeze({ key: 'hd',       label: 'Hit Dice', isCore: true, savePrimeClass: null,       primeAttr: null,  xpCostFor: (v) => (HD_VALUE_TABLE[v] || {}).xpCost || 0 }),
    fighting: Object.freeze({ key: 'fighting', label: 'Fighting', isCore: true, savePrimeClass: 'fighter',  primeAttr: 'STR', tiePriority: 3 }),
    thievery: Object.freeze({ key: 'thievery', label: 'Thievery', isCore: true, savePrimeClass: 'thief',    primeAttr: 'DEX', tiePriority: 4, xpCostFor: (v) => (THIEVERY_VALUE_TABLE[v] || {}).xpCost || 0 }),
    divine:   Object.freeze({ key: 'divine',   label: 'Divine',   isCore: true, savePrimeClass: 'crusader', primeAttr: 'WIL', tiePriority: 2, xpCostFor: (v) => (DIVINE_VALUE_TABLE[v] || {}).xpCost || 0 }),
    arcane:   Object.freeze({ key: 'arcane',   label: 'Arcane',   isCore: true, savePrimeClass: 'mage',     primeAttr: 'INT', tiePriority: 1, xpCostFor: (v) => (ARCANE_VALUE_TABLE[v] || {}).xpCost || 0 })
  });
  // Save-tie order (survey §4.2 step 1): Arcane → Divine → Fighting → Thievery (low tiePriority wins).
  const SAVE_PRIME_TO_SAVE_PROGRESSION = Object.freeze({ fighter: 'fighter', thief: 'thief', crusader: 'crusader', mage: 'mage' });

  // The post-8th-level flat XP increment by save progression (JJ p.299).
  const POST_EIGHTH_INCREMENT = Object.freeze({ fighter: 120000, crusader: 100000, thief: 100000, mage: 150000 });
  // hp/level after 9th by save progression (JJ p.297): crusader/mage 1, fighter/thief 2.
  const HP_AFTER_NINTH = Object.freeze({ fighter: 2, thief: 2, crusader: 1, mage: 1 });

  // The Fighting weapon-trade-off XP penalty: +250 XP per power gained, ONLY at Fighting ≥2
  // (survey §4.1 / §4.2 step 10). The seed builds store their trade-off power count.
  const WEAPON_TRADEOFF_XP_PER_POWER = 250;

  // ── XP cost helpers (the oracle math) ───────────────────────────────────────
  function _hdXp(v){ const r = HD_VALUE_TABLE[v]; return r ? r.xpCost : 0; }
  function _fightingXp(subtypeOrValue){ const r = FIGHTING_VALUE_TABLE[String(subtypeOrValue)]; return r ? r.xpCost : 0; }
  function _thieveryXp(v){ const r = THIEVERY_VALUE_TABLE[v]; return r ? r.xpCost : 0; }
  function _divineXp(v){ const r = DIVINE_VALUE_TABLE[v]; return r ? r.xpCost : 0; }
  function _arcaneXp(v){ const r = ARCANE_VALUE_TABLE[v]; return r ? r.xpCost : 0; }

  // Normalize the fighting allocation: buildPoints.fighting is the numeric VALUE (0–4);
  // fightingSubtype ('1a'|'1b') disambiguates value 1. The XP key is the subtype at value 1.
  function _fightingKey(buildPoints, fightingSubtype){
    const v = Number((buildPoints || {}).fighting) || 0;
    if(v === 1) return (fightingSubtype === '1b') ? '1b' : '1a';   // default 1a (crusader-style) when unset
    return String(v);
  }

  // ── The five core RAW races as seed RaceTemplates (survey §6 / §9.3) ─────────
  // racialValueTable is SPARSE — only the rungs with an authoritative published XP cost
  // (the seed classes' rungs + the §6 acceptance rungs Elf4/Dwarf4/Halfling0). The
  // intermediate rungs + deriveRaceCost (the power-list costing) are W3 — NOT fabricated.
  // Per cartography-before-mechanics: ship the validated values, document the gap.
  const CUSTOM_RACE_SEEDS = Object.freeze([
    {
      key: 'dwarf', displayName: 'Dwarf', page: 'JJ pp.299–305',
      abilityRequirements: { CON: 9 },
      categoryModifiers: { arcaneForbidden: true, fightingWeaponConstraint: '≥4 axes / flails / hammers / maces', racialValueStacksWith: null },
      racialValueTable: [
        { value: 0, powers: ['Sensitivity to Rock and Stone', 'Dwarf Tongues', 'Hardy'], xpCost: 200 },
        { value: 3, powers: [], xpCost: 900 },
        { value: 4, powers: [], xpCost: 1250 }
        // rungs 1, 2 — W3 (the full racial-value table + deriveRaceCost)
      ],
      hitDiceByCombatantStatus: { noncombatant: 0.25, commoner: 0.5, militia: '1-1', fighter: 1 },
      ageModifierDice: '+2d8',
      afterEighthIncrement: { fighter: 10000, crusader: 30000, thief: 30000 },
      isMonstrous: false
    },
    {
      key: 'elf', displayName: 'Elf', page: 'JJ pp.299–305',
      abilityRequirements: { INT: 9 },
      categoryModifiers: { arcaneForbidden: false, racialValueStacksWith: 'arcane' },
      racialValueTable: [
        { value: 2, powers: [], xpCost: 1375 },
        { value: 3, powers: [], xpCost: 1875 },
        { value: 4, powers: [], xpCost: 2500 }
        // rungs 0, 1 — W3
      ],
      hitDiceByCombatantStatus: { noncombatant: 0.25, commoner: 0.5, militia: '1-1', fighter: 1 },
      ageModifierDice: '+2d20',
      afterEighthIncrement: null,    // W3
      isMonstrous: false
    },
    {
      key: 'halfling', displayName: 'Halfling', page: 'JJ pp.299–305',
      abilityRequirements: { DEX: 9 },
      categoryModifiers: { arcaneForbidden: true, fightingMax: 2, racialValueStacksWith: null },
      racialValueTable: [
        { value: 0, powers: ['Weak', 'Short-Statured', 'halfling skills'], xpCost: -450 }   // negative XP (survey §4.5/§6)
        // rungs 1–4 — W3
      ],
      hitDiceByCombatantStatus: { noncombatant: 0.25, commoner: 0.5, militia: '1-1', fighter: 1 },
      ageModifierDice: null,         // W3
      afterEighthIncrement: null,    // W3
      isMonstrous: false
    },
    {
      key: 'nobiran', displayName: 'Nobiran', page: 'JJ pp.299–305',
      abilityRequirements: { STR: 11, INT: 11, WIL: 11, DEX: 11, CON: 11, CHA: 11 },
      categoryModifiers: { divineForbidden: true, racialValueStacksWith: null, note: 'Nobirus IS Divine; ageless' },
      racialValueTable: [
        { value: 2, powers: [], xpCost: 625 }
        // rungs 0, 1, 3, 4 — W3
      ],
      hitDiceByCombatantStatus: { noncombatant: 0.25, commoner: 0.5, militia: '1-1', fighter: 1 },
      ageModifierDice: 'ageless',    // survey §4.5
      afterEighthIncrement: null,    // W3
      isMonstrous: false
    },
    {
      key: 'zaharan', displayName: 'Zaharan', page: 'JJ pp.299–305',
      abilityRequirements: { INT: 9, WIL: 9, CHA: 9 },
      categoryModifiers: { racialValueStacksWith: 'arcane', note: 'After-the-Flesh undeath' },
      racialValueTable: [
        { value: 1, powers: [], xpCost: 825 }
        // rungs 0, 2, 3, 4 — W3
      ],
      hitDiceByCombatantStatus: { noncombatant: 0.25, commoner: 0.5, militia: '1-1', fighter: 1 },
      ageModifierDice: null,         // W3
      afterEighthIncrement: null,    // W3
      isMonstrous: false
    }
  ].map(r => Object.freeze(r)));
  const CUSTOM_RACE_SEEDS_BY_KEY = {};
  for(const r of CUSTOM_RACE_SEEDS){ CUSTOM_RACE_SEEDS_BY_KEY[r.key] = r; }

  // ── The 19 RAW seed class builds (the Ready-For-Play Class Builds table, JJ p.330) ──
  // The validation oracle AND the out-of-the-box content AND the legacy-string resolver
  // (the resolver is the deferred migrateCampaign piece — survey §7). Each carries its
  // build-point allocation + choices; deriveClassFromTemplate reproduces the RAW 2nd-level
  // XP exactly (see expectedSecondLevelXp — the smoke locks every one). The full 21 adds
  // 2 trade-off-heavy classes (Mystic/Shaman) when W2's trade-off machinery lands.
  //   bp           — buildPoints map {hd,fighting,thievery,divine,arcane,[raceKey]}
  //   fightingSub  — '1a'|'1b' when fighting === 1
  //   coreClass    — coreClassMapping OVERRIDE (only the two genuine hybrids set it; else
  //                  it derives from the save progression — Assassin/Bard derive to fighter)
  //   wpnTradeoff  — weapon-trade-off power count (× 250 XP penalty at Fighting ≥2)
  //   maxLevel     — RAW level cap (humans 14; racials per the build-points→cap table — W3
  //                  derives it; W1 stores the RAW value, the cartography-first choice)
  //   xp           — the RAW 2nd-level XP (the oracle; baked for the smoke + a self-check)
  const CUSTOM_CLASS_SEEDS = Object.freeze([
    { key:'fighter',   displayName:'Fighter',   raceKey:null, bp:{hd:2,fighting:2,thievery:0,divine:0,arcane:0}, fightingSub:null, coreClass:null,        wpnTradeoff:0, maxLevel:14, rarity:'common',   xp:2000, powers:[] },
    { key:'mage',      displayName:'Mage',      raceKey:null, bp:{hd:0,fighting:0,thievery:0,divine:0,arcane:4}, fightingSub:null, coreClass:null,        wpnTradeoff:0, maxLevel:14, rarity:'common',   xp:2500, powers:[] },
    { key:'thief',     displayName:'Thief',     raceKey:null, bp:{hd:0,fighting:1,thievery:3,divine:0,arcane:0}, fightingSub:'1b', coreClass:null,        wpnTradeoff:0, maxLevel:14, rarity:'common',   xp:1250, powers:[] },
    { key:'assassin',  displayName:'Assassin',  raceKey:null, bp:{hd:1,fighting:2,thievery:1,divine:0,arcane:0}, fightingSub:null, coreClass:'fighter',   wpnTradeoff:0, maxLevel:14, rarity:'uncommon', xp:1750, powers:[] },
    { key:'bard',      displayName:'Bard',      raceKey:null, bp:{hd:0,fighting:2,thievery:2,divine:0,arcane:0}, fightingSub:null, coreClass:'fighter',   wpnTradeoff:1, maxLevel:14, rarity:'uncommon', xp:1750, powers:[] },
    { key:'bladedancer', displayName:'Bladedancer', raceKey:null, bp:{hd:1,fighting:1,thievery:0,divine:2,arcane:0}, fightingSub:'1a', coreClass:null,    wpnTradeoff:0, maxLevel:14, rarity:'uncommon', xp:1500, powers:[] },
    { key:'crusader',  displayName:'Crusader',  raceKey:null, bp:{hd:1,fighting:1,thievery:0,divine:2,arcane:0}, fightingSub:'1a', coreClass:null,        wpnTradeoff:0, maxLevel:14, rarity:'uncommon', xp:1500, powers:[] },
    { key:'explorer',  displayName:'Explorer',  raceKey:null, bp:{hd:1,fighting:2,thievery:1,divine:0,arcane:0}, fightingSub:null, coreClass:'explorer',  wpnTradeoff:1, maxLevel:14, rarity:'common',   xp:2000, powers:[] },
    { key:'paladin',   displayName:'Paladin',   raceKey:null, bp:{hd:2,fighting:2,thievery:0,divine:0,arcane:0}, fightingSub:null, coreClass:'fighter',   wpnTradeoff:3, maxLevel:14, rarity:'rare',     xp:2750, powers:[] },
    { key:'priestess', displayName:'Priestess', raceKey:null, bp:{hd:0,fighting:0,thievery:0,divine:4,arcane:0}, fightingSub:null, coreClass:'crusader',  wpnTradeoff:0, maxLevel:14, rarity:'uncommon', xp:2000, powers:[] },
    { key:'venturer',  displayName:'Venturer',  raceKey:null, bp:{hd:1,fighting:1,thievery:2,divine:0,arcane:0}, fightingSub:'1a', coreClass:'venturer',  wpnTradeoff:0, maxLevel:14, rarity:'uncommon', xp:1500, powers:['Mercantile Network'] },
    { key:'witch',     displayName:'Witch',     raceKey:null, bp:{hd:0,fighting:0,thievery:0,divine:4,arcane:0}, fightingSub:null, coreClass:'crusader',  wpnTradeoff:0, maxLevel:14, rarity:'rare',     xp:2000, powers:[] },
    { key:'warlock',   displayName:'Warlock',   raceKey:null, bp:{hd:0,fighting:0,thievery:0,divine:0,arcane:4}, fightingSub:null, coreClass:null,        wpnTradeoff:0, maxLevel:14, rarity:'rare',     xp:2500, powers:[] },
    { key:'dwarven-vaultguard', displayName:'Dwarven Vaultguard', raceKey:'dwarf', bp:{hd:2,fighting:2,thievery:0,divine:0,arcane:0,dwarf:0}, fightingSub:null, coreClass:'fighter',  wpnTradeoff:0, maxLevel:13, rarity:'uncommon', xp:2200, powers:[] },
    { key:'dwarven-craftpriest', displayName:'Dwarven Craftpriest', raceKey:'dwarf', bp:{hd:1,fighting:1,thievery:0,divine:2,arcane:0,dwarf:3}, fightingSub:'1a', coreClass:'crusader', wpnTradeoff:0, maxLevel:10, rarity:'uncommon', xp:2400, powers:[] },
    { key:'elven-spellsword',  displayName:'Elven Spellsword',  raceKey:'elf', bp:{hd:1,fighting:2,thievery:0,divine:0,arcane:1,elf:3}, fightingSub:null, coreClass:'fighter', wpnTradeoff:0, maxLevel:10, rarity:'rare', xp:4000, powers:[] },
    { key:'elven-nightblade',  displayName:'Elven Nightblade',  raceKey:'elf', bp:{hd:1,fighting:1,thievery:2,divine:0,arcane:0,elf:2}, fightingSub:'1b', coreClass:'thief',   wpnTradeoff:0, maxLevel:11, rarity:'rare', xp:2875, powers:[] },
    { key:'nobiran-wonderworker', displayName:'Nobiran Wonderworker', raceKey:'nobiran', bp:{hd:0,fighting:0,thievery:0,divine:0,arcane:4,nobiran:2}, fightingSub:null, coreClass:null, wpnTradeoff:0, maxLevel:12, rarity:'legendary', xp:3125, powers:[] },
    { key:'zaharan-ruinguard',   displayName:'Zaharan Ruinguard',   raceKey:'zaharan', bp:{hd:1,fighting:2,thievery:0,divine:0,arcane:1,zaharan:1}, fightingSub:null, coreClass:'fighter', wpnTradeoff:3, maxLevel:12, rarity:'rare', xp:3700, powers:[] }
  ].map(s => Object.freeze(s)));
  const CUSTOM_CLASS_SEEDS_BY_KEY = {};
  for(const s of CUSTOM_CLASS_SEEDS){ CUSTOM_CLASS_SEEDS_BY_KEY[s.key] = s; }

  // ── The Custom Power Compendium (W1 representative seed; the full ~250 is W6) ────────
  // ⚠ IP (survey §8 tier 3 — the prose-heaviest slice): names + an index page-ref + a
  // TERSE self-authored mechanical one-liner ONLY — never the transcribed description.
  // Gated behind the default-OFF `custom-power-compendium` rule (customPowerCompendium()).
  // W1 ships the powers the seed builds reference + a few iconic core powers, to make the
  // gate functional + demonstrate the shape; W6 expands to the full index + per-power refs
  // + the Autarch heads-up. Sourced from the survey's named powers (§3 / §9.2); a one-liner
  // is included only where the effect is a bare, citable fact, else omitted (cartography-first).
  const CUSTOM_POWER_COMPENDIUM = Object.freeze([
    Object.freeze({ name: 'Manual of Arms',     page: 'JJ pp.306–328', summary: 'Trains and commands troops as a fighter of the class level.' }),
    Object.freeze({ name: 'Mercantile Network', page: 'RR p.43',        summary: 'Treats a previously-entered market as one class larger when trading.' }),
    Object.freeze({ name: 'Berserkergang',      page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Acrobatics',         page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Accuracy',           page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Alertness',          page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Acute Sense',        page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Battle Magic',       page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Beast Friendship',   page: 'JJ pp.306–328' }),
    Object.freeze({ name: 'Naturalism',         page: 'JJ pp.306–328' })
  ]);

  // ── Factories ───────────────────────────────────────────────────────────────
  // ClassTemplate (catalog tier) — stores the BUILD (inputs); the stat block DERIVES
  // (deriveClassFromTemplate). _derived is a non-canonical cache (§3.3), null until the
  // engine computes it (it needs the race for racial classes — so blank stays pure).
  function blankClassTemplate(opts){
    opts = opts || {};
    const bp = opts.buildPoints || {};
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newId('customClass', 'ccl'),
      key: opts.key || '',                         // stable; resolves character.class on migration (W5/deferred)
      displayName: opts.displayName || '',
      raceTemplateKey: opts.raceTemplateKey || null,   // → a RaceTemplate.key, or null for human

      // THE BUILD (stored inputs — everything else derives). An OPEN map (survey §4.6):
      // the five core categories always present; a racial key + W6 supplement categories added as used.
      buildPoints: Object.assign(
        { hd: Number(bp.hd) || 0, fighting: Number(bp.fighting) || 0, thievery: Number(bp.thievery) || 0, divine: Number(bp.divine) || 0, arcane: Number(bp.arcane) || 0 },
        // preserve any extra (racial / supplement) category keys passed in
        _extraBuildPointKeys(bp)
      ),
      fightingSubtype: opts.fightingSubtype || null,   // '1a' | '1b' when fighting === 1
      choices: {
        weaponSelection: Array.isArray(opts.choices && opts.choices.weaponSelection) ? opts.choices.weaponSelection.slice() : [],
        armorTradeOff: (opts.choices && opts.choices.armorTradeOff) || 'none',
        thiefSkills: Array.isArray(opts.choices && opts.choices.thiefSkills) ? opts.choices.thiefSkills.slice() : [],
        primeRequisite: (opts.choices && opts.choices.primeRequisite) || null,
        saveProgressionTieBreak: (opts.choices && opts.choices.saveProgressionTieBreak) || null,
        strongholdType: (opts.choices && opts.choices.strongholdType) || null,
        spellListKey: (opts.choices && opts.choices.spellListKey) || null,    // → the Magic-layer Spells lane (#151)
        coreClassMapping: (opts.choices && opts.choices.coreClassMapping) || null,  // OVERRIDE (only the explorer/venturer hybrids set it)
        weaponTradeOffPowerCount: Number(opts.choices && opts.choices.weaponTradeOffPowerCount) || 0
      },
      customPowers: Array.isArray(opts.customPowers) ? opts.customPowers.map(p =>
        (typeof p === 'string') ? { name: p, powerWeight: 1, levelUnlocked: 1, pageRef: '' }
                                : { name: p.name || '', powerWeight: (p.powerWeight != null ? p.powerWeight : 1), levelUnlocked: (p.levelUnlocked != null ? p.levelUnlocked : 1), pageRef: p.pageRef || '' }
      ) : [],
      customDrawbacks: Array.isArray(opts.customDrawbacks) ? opts.customDrawbacks.slice() : [],   // W2
      maxLevel: (opts.maxLevel != null) ? opts.maxLevel : 14,    // RAW cap (humans 14; racials per W3's table)
      rarity: opts.rarity || 'common',                            // → henchman-availability + generator frequency (§ seam)
      isSeed: !!opts.isSeed,                                       // shipped RAW core class vs GM-authored
      _derived: null,                                             // non-canonical cache (§3.3); recomputed via deriveClassFromTemplate
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }
  // Preserve non-core buildPoints keys (racial values, W6 supplement categories) passed to the factory.
  function _extraBuildPointKeys(bp){
    const core = { hd:1, fighting:1, thievery:1, divine:1, arcane:1 };
    const out = {};
    for(const k of Object.keys(bp || {})){ if(!core[k]) out[k] = Number(bp[k]) || 0; }
    return out;
  }

  // RaceTemplate (catalog tier) — constrains + modifies a class build (survey §6).
  function blankRaceTemplate(opts){
    opts = opts || {};
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newId('customRace', 'crc'),
      key: opts.key || '',
      displayName: opts.displayName || '',
      abilityRequirements: opts.abilityRequirements ? Object.assign({}, opts.abilityRequirements) : {},
      categoryModifiers: opts.categoryModifiers ? Object.assign({}, opts.categoryModifiers) : {},
      racialValueTable: Array.isArray(opts.racialValueTable) ? opts.racialValueTable.map(r => Object.assign({}, r)) : [],
      hitDiceByCombatantStatus: opts.hitDiceByCombatantStatus ? Object.assign({}, opts.hitDiceByCombatantStatus) : { noncombatant: 0.25, commoner: 0.5, militia: '1-1', fighter: 1 },   // ← Generators seam
      ageModifierDice: (opts.ageModifierDice !== undefined) ? opts.ageModifierDice : null,   // ← Generators seam
      afterEighthIncrement: opts.afterEighthIncrement || null,
      isMonstrous: !!opts.isMonstrous,
      isSeed: !!opts.isSeed,
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }
  // Build a ClassTemplate from a CUSTOM_CLASS_SEEDS row (the seed shorthand → the full entity).
  function _classTemplateFromSeed(seed){
    return blankClassTemplate({
      key: seed.key, displayName: seed.displayName, raceTemplateKey: seed.raceKey,
      buildPoints: seed.bp, fightingSubtype: seed.fightingSub,
      choices: { coreClassMapping: seed.coreClass, weaponTradeOffPowerCount: seed.wpnTradeoff },
      customPowers: seed.powers, maxLevel: seed.maxLevel, rarity: seed.rarity, isSeed: true
    });
  }
  function _raceTemplateFromSeed(seed){
    return blankRaceTemplate({
      key: seed.key, displayName: seed.displayName,
      abilityRequirements: seed.abilityRequirements, categoryModifiers: seed.categoryModifiers,
      racialValueTable: seed.racialValueTable, hitDiceByCombatantStatus: seed.hitDiceByCombatantStatus,
      ageModifierDice: seed.ageModifierDice, afterEighthIncrement: seed.afterEighthIncrement,
      isMonstrous: seed.isMonstrous, isSeed: true
    });
  }
  // Materialized seed ENTITIES (the validation oracle for the headless smoke + the install source).
  function seedClassTemplates(){ return CUSTOM_CLASS_SEEDS.map(_classTemplateFromSeed); }
  function seedRaceTemplates(){ return CUSTOM_RACE_SEEDS.map(_raceTemplateFromSeed); }

  // ── Canonical create setters — init-on-write (no migrateCampaign injector, so templates
  //    stay migrate-no-ops; campaign.customClasses/customRaces read defensively `|| []`). ──
  function createCustomClass(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const t = blankClassTemplate(opts || {});
    if(!Array.isArray(campaign.customClasses)) campaign.customClasses = [];
    campaign.customClasses.push(t);
    return t;
  }
  function createCustomRace(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const t = blankRaceTemplate(opts || {});
    if(!Array.isArray(campaign.customRaces)) campaign.customRaces = [];
    campaign.customRaces.push(t);
    return t;
  }
  // Opt-in seed installer (the GM / NPC Generator calls it — NOT auto-run on load, so a
  // fresh campaign starts empty + the templates stay migrate-no-ops). Idempotent: skips a
  // key already present. Returns {classes, races} counts installed.
  function seedCustomContent(campaign){
    if(!campaign || typeof campaign !== 'object') return { classes: 0, races: 0 };
    if(!Array.isArray(campaign.customClasses)) campaign.customClasses = [];
    if(!Array.isArray(campaign.customRaces)) campaign.customRaces = [];
    const haveClass = new Set(campaign.customClasses.map(c => c && c.key).filter(Boolean));
    const haveRace = new Set(campaign.customRaces.map(r => r && r.key).filter(Boolean));
    let classes = 0, races = 0;
    for(const seed of CUSTOM_RACE_SEEDS){ if(!haveRace.has(seed.key)){ campaign.customRaces.push(_raceTemplateFromSeed(seed)); races++; } }
    for(const seed of CUSTOM_CLASS_SEEDS){ if(!haveClass.has(seed.key)){ campaign.customClasses.push(_classTemplateFromSeed(seed)); classes++; } }
    return { classes, races };
  }

  // ── Instance lookups (defensive — absent collection reads as []) ────────────
  function _classes(campaign){ return (campaign && Array.isArray(campaign.customClasses)) ? campaign.customClasses : []; }
  function _races(campaign){ return (campaign && Array.isArray(campaign.customRaces)) ? campaign.customRaces : []; }
  function findCustomClass(campaign, id){ if(!id) return null; return _classes(campaign).find(c => c && c.id === id) || null; }
  function findCustomRace(campaign, id){ if(!id) return null; return _races(campaign).find(r => r && r.id === id) || null; }
  function customClassByKey(campaign, key){ if(!key) return null; return _classes(campaign).find(c => c && c.key === key) || null; }
  function customRaceByKey(campaign, key){ if(!key) return null; return _races(campaign).find(r => r && r.key === key) || null; }
  function customClassesUsingRace(campaign, raceKey){ if(!raceKey) return []; return _classes(campaign).filter(c => c && c.raceTemplateKey === raceKey); }
  // Resolve the RaceTemplate a ClassTemplate references — prefers the campaign's own race
  // (a GM-edited one), falls back to the seed constant (so deriving a seed needs no campaign).
  function raceForClassTemplate(campaign, classTemplate){
    if(!classTemplate || !classTemplate.raceTemplateKey) return null;
    const fromCampaign = customRaceByKey(campaign, classTemplate.raceTemplateKey);
    if(fromCampaign) return fromCampaign;
    const seed = CUSTOM_RACE_SEEDS_BY_KEY[classTemplate.raceTemplateKey];
    return seed ? _raceTemplateFromSeed(seed) : null;
  }

  // ── The derivation engine (survey §4.2 — the §3.13 derive-don't-store core) ──
  // Save progression = the core class of the highest base category (fighting/thievery/
  // divine/arcane); ties broken Arcane → Divine → Fighting → Thievery (survey §4.2 step 1).
  function customClassSaveProgression(classTemplate){
    const bp = (classTemplate && classTemplate.buildPoints) || {};
    const cats = { fighting: Number(bp.fighting) || 0, thievery: Number(bp.thievery) || 0, divine: Number(bp.divine) || 0, arcane: Number(bp.arcane) || 0 };
    const max = Math.max(cats.fighting, cats.thievery, cats.divine, cats.arcane);
    if(max <= 0) return 'fighter';   // degenerate (pure-HD) — defaults to fighter
    // tie-break: arcane → divine → fighting → thievery (low tiePriority first)
    for(const cat of ['arcane', 'divine', 'fighting', 'thievery']){
      if(cats[cat] === max) return CLASS_CATEGORIES[cat].savePrimeClass;
    }
    return 'fighter';
  }
  // coreClassMapping (survey §10): the save-progression core class by default, with the two
  // genuine hybrids (explorer/venturer) carrying an explicit override on their seed. (Assassin
  // and Explorer share build points — so the mapping CANNOT be derived purely; the override
  // is the stored-wins answer. Everything else maps to its save core.)
  function suggestCoreClassMapping(classTemplate){
    return customClassSaveProgression(classTemplate);   // the build-derived suggestion (for the Builder UI / generated classes)
  }
  function customClassCoreClassMapping(classTemplate){
    const override = classTemplate && classTemplate.choices && classTemplate.choices.coreClassMapping;
    return override || suggestCoreClassMapping(classTemplate);
  }
  // Prime requisites (survey §4.2 step 6): the save-progression prime attr + one per non-HD
  // category at value ≥2 (deduped). The Generators seam reads this.
  function customClassPrimeRequisites(classTemplate){
    const save = customClassSaveProgression(classTemplate);
    const savePrime = ({ fighter: 'STR', thief: 'DEX', crusader: 'WIL', mage: 'INT' })[save] || 'STR';
    const out = [savePrime];
    const bp = (classTemplate && classTemplate.buildPoints) || {};
    for(const cat of ['fighting', 'thievery', 'divine', 'arcane']){
      if((Number(bp[cat]) || 0) >= 2){ const a = CLASS_CATEGORIES[cat].primeAttr; if(a && out.indexOf(a) < 0) out.push(a); }
    }
    return out;
  }
  // 2nd-level XP = Σ(category XP) + racial-value XP + the weapon-trade-off penalty (Fighting ≥2).
  // The oracle (survey §5) — must reproduce every RAW seed cost exactly.
  function customClassSecondLevelXp(classTemplate, raceTemplate){
    const bp = (classTemplate && classTemplate.buildPoints) || {};
    let xp = _hdXp(Number(bp.hd) || 0)
           + _fightingXp(_fightingKey(bp, classTemplate && classTemplate.fightingSubtype))
           + _thieveryXp(Number(bp.thievery) || 0)
           + _divineXp(Number(bp.divine) || 0)
           + _arcaneXp(Number(bp.arcane) || 0);
    // racial value XP (from the RaceTemplate's racialValueTable)
    if(raceTemplate && raceTemplate.key){
      const rv = Number(bp[raceTemplate.key]);
      if(!Number.isNaN(rv)){
        const row = (raceTemplate.racialValueTable || []).find(r => r.value === rv);
        if(row && typeof row.xpCost === 'number') xp += row.xpCost;
        // a missing rung is a W3 gap (sparse table) — the seed classes never hit one.
      }
    }
    // weapon-trade-off penalty: +250 XP/power at Fighting ≥2 (survey §4.1)
    const fightingVal = Number(bp.fighting) || 0;
    const tradeoffCount = Number(classTemplate && classTemplate.choices && classTemplate.choices.weaponTradeOffPowerCount) || 0;
    if(fightingVal >= 2 && tradeoffCount > 0) xp += tradeoffCount * WEAPON_TRADEOFF_XP_PER_POWER;
    return xp;
  }
  // The full per-level XP table (JJ pp.298–299): L1 0; L2 = the 2nd-level cost; double each
  // level to 8th (L7 rounded to nearest 5,000); flat increment after 8th by save progression.
  // NB W1 LOCKS only L1 + L2 (the oracle); the full per-level shape is provided for Generators
  // + the Builder but the per-level RAW validation is W2 — the doubling/rounding nuance (JJ p.299)
  // is implemented to the documented reading, not asserted level-by-level. (cartography-first.)
  function customClassXpTable(classTemplate, raceTemplate, throughLevel){
    const maxL = throughLevel || (classTemplate && classTemplate.maxLevel) || 14;
    const save = customClassSaveProgression(classTemplate);
    const flat = POST_EIGHTH_INCREMENT[save] || 120000;
    const base = customClassSecondLevelXp(classTemplate, raceTemplate);
    const table = [0];                       // L1 = 0
    if(maxL >= 2) table[1] = base;           // L2 = the 2nd-level cost
    for(let lvl = 3; lvl <= Math.min(maxL, 8); lvl++){ table[lvl - 1] = table[lvl - 2] * 2; }   // double to 8th
    if(table.length >= 7 && table[6] != null) table[6] = Math.round(table[6] / 5000) * 5000;    // round 7th to nearest 5,000 (JJ p.299)
    for(let lvl = 9; lvl <= maxL; lvl++){ table[lvl - 1] = table[lvl - 2] + flat; }              // flat after 8th
    return table;
  }
  // Magic-item access (survey §4.2 step 5): all-class + the save-prog class's items + any
  // category at value ≥2 (+ Fighting-enchanted gear). A light derivation for the data layer.
  function customClassMagicItemAccess(classTemplate){
    const bp = (classTemplate && classTemplate.buildPoints) || {};
    const access = ['all-class', customClassSaveProgression(classTemplate)];
    if((Number(bp.fighting) || 0) >= 1) access.push('fighting-enchanted-weapons-armor');
    for(const cat of ['fighting', 'thievery', 'divine', 'arcane']){ if((Number(bp[cat]) || 0) >= 2 && access.indexOf(cat) < 0) access.push(cat); }
    return access;
  }
  // The full derived stat block — the §3.13 pure function of (allocation + choices + race).
  // The Generators consume-seam (survey §10) reads these fields field-for-field.
  function deriveClassFromTemplate(classTemplate, raceTemplate){
    if(!classTemplate) return null;
    const bp = classTemplate.buildPoints || {};
    const hdRow = HD_VALUE_TABLE[Number(bp.hd) || 0] || HD_VALUE_TABLE[0];
    const fRow = FIGHTING_VALUE_TABLE[_fightingKey(bp, classTemplate.fightingSubtype)] || FIGHTING_VALUE_TABLE['0'];
    const save = customClassSaveProgression(classTemplate);
    const maxLevel = (classTemplate.maxLevel != null) ? classTemplate.maxLevel : 14;
    return {
      saveProgression: save,
      coreClassMapping: customClassCoreClassMapping(classTemplate),     // ← Generators consume-seam
      hitDie: hdRow.hitDie,
      mortalWoundsMod: hdRow.mortalWoundsMod,
      attackProgression: fRow.attackProgression,
      weaponSelection: fRow.weaponSelection,
      armorProf: fRow.armorProf,
      fightingStyleCount: fRow.fightingStyleCount,
      primeRequisites: customClassPrimeRequisites(classTemplate),
      magicItemAccess: customClassMagicItemAccess(classTemplate),
      thiefSkillCount: (THIEVERY_VALUE_TABLE[Number(bp.thievery) || 0] || {}).thiefSkillCount || 0,
      divineSpellPowerPct: (DIVINE_VALUE_TABLE[Number(bp.divine) || 0] || {}).spellPowerPct || 0,
      arcaneSpellPowerPct: (ARCANE_VALUE_TABLE[Number(bp.arcane) || 0] || {}).spellPowerPct || 0,
      maxLevel: maxLevel,
      proficiencyListSize: 42 - maxLevel,                               // JJ p.297 (28 for a 14-cap human)
      hpAfter9th: HP_AFTER_NINTH[save] || 2,
      secondLevelXp: customClassSecondLevelXp(classTemplate, raceTemplate),   // ← the oracle
      xpTable: customClassXpTable(classTemplate, raceTemplate, maxLevel),
      strongholdType: (classTemplate.choices && classTemplate.choices.strongholdType) || null,
      rarity: classTemplate.rarity || 'common'                          // ← Generators consume-seam
    };
  }
  // Convenience: resolve the race + derive (campaign-aware; the UI / Generators path).
  function deriveClass(campaign, classTemplate){
    return deriveClassFromTemplate(classTemplate, raceForClassTemplate(campaign, classTemplate));
  }

  // ── The custom-power compendium gate (default-OFF `custom-power-compendium`) ─
  function customPowerCompendium(campaign){
    return _isHouseRuleEnabled(campaign, 'custom-power-compendium') ? CUSTOM_POWER_COMPENDIUM.slice() : [];
  }
  function findCustomPower(name){
    if(!name) return null;
    const lc = String(name).toLowerCase();
    return CUSTOM_POWER_COMPENDIUM.find(p => p.name.toLowerCase() === lc) || null;
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // build-point data
    HD_VALUE_TABLE, FIGHTING_VALUE_TABLE, THIEVERY_VALUE_TABLE, DIVINE_VALUE_TABLE, ARCANE_VALUE_TABLE,
    CLASS_CATEGORIES, POST_EIGHTH_INCREMENT, HP_AFTER_NINTH, WEAPON_TRADEOFF_XP_PER_POWER,
    // seeds + compendium
    CUSTOM_CLASS_SEEDS, CUSTOM_RACE_SEEDS, CUSTOM_POWER_COMPENDIUM,
    seedClassTemplates, seedRaceTemplates, seedCustomContent,
    // factories + setters
    blankClassTemplate, blankRaceTemplate, createCustomClass, createCustomRace,
    // lookups
    findCustomClass, findCustomRace, customClassByKey, customRaceByKey, customClassesUsingRace, raceForClassTemplate,
    // the derivation engine
    deriveClassFromTemplate, deriveClass,
    customClassSaveProgression, customClassCoreClassMapping, suggestCoreClassMapping,
    customClassPrimeRequisites, customClassSecondLevelXp, customClassXpTable, customClassMagicItemAccess,
    // compendium gate
    customPowerCompendium, findCustomPower
  });

})(typeof window !== 'undefined' ? window : global);
