/* acks-engine-generators.js — NPC Generator G1 (Phase 4.8 §2.1, Wave G1).
 *
 * The pure-RAW single-NPC generator: given a context (a settlement / domain / role / "just roll
 * one"), it rolls a complete Character — occupation → attributes (the 3 RAW methods) → class/level
 * → HD/AC/saves → proficiencies ({key,ranks}) → age → wealth + magic-item value → appearance — and
 * lands it as a real `Character` entity via the existing create path.
 *
 * RAW: JJ Ch.9 "Non-Player Characters" pp.245–268 (the leveled-NPC build, ages, the NPC-Wealth
 * table p.249) leaning on the Ch.8 occupation substrate (pp.214–229) + the throw progressions
 * (RR class tables, pp.675–1145 — combat-progression prose is authoritative; the per-class markdown
 * tables drift, see the header note in _advance).
 *
 * Data footprint (Phase 4.8 §4): produces EXISTING `Character` entities — NO new entity/prefix
 * (the reserved `gen-` stays UNUSED; a generation run is an EVENT, not an entity). ONE new event
 * kind `generation` (registered in acks-engine-events.js, this lane) — record-only, full
 * Event.context envelope (produced entity ids as relatedEntities). At most a few additive Character
 * fields (occupation / appearance / generated), set on the produced object post-construction
 * (defensive-read, migration-free — blankCharacter is untouched).
 *
 * READS (does NOT edit) the shipped acks-engine-custom-classes.js (the class derivation engine —
 * seedClassTemplates / deriveClass / customClassByKey, the §11 consume-seam) + acks-engine-
 * demographics.js (the class buckets + level split, JJ Step 3) + acks-engine-proficiencies.js
 * (the {key,ranks} catalog) + acks-engine.js (abilityMod / newEvent / setEventContext) + lifecycle
 * (ageCategoryFor). Late-binds them all (loads after demographics + custom-classes; the test glob-
 * runner + the index.html load-order block place it after the core it depends on).
 *
 * The `npc-generator-detailed` full-vs-quick toggle the plan §8 reserves is NOT registered as a
 * house rule in this team session (manifest houseRules: []) — it is a plain `opts.detailLevel`
 * parameter ('full' | 'lightweight') over the SHIPPED detailLevel field + ACKS.expandCharacterToFull
 * doctrine (a lightweight NPC is never a dead end). The paper-reservation stays paper.
 */
;(function (global) {
  'use strict';
  const A = global.ACKS = global.ACKS || {};
  const _A = () => global.ACKS;                 // late-bind: resolve at call time, never at load time

  // ── deterministic RNG (the byte-stable-preview discipline — a `seed` makes a run reproducible) ──
  function _mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _hash32(str) {                        // FNV-1a — turns a string seed into a 32-bit int
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function _resolveRng(opts) {
    opts = opts || {};
    if (typeof opts.rng === 'function') return opts.rng;
    if (opts.seed != null) return _mulberry32(typeof opts.seed === 'number' ? opts.seed : _hash32(String(opts.seed)));
    return Math.random;
  }
  function _int(rng, n) { return Math.floor(rng() * n); }                 // 0..n-1
  function _d(rng, sides) { return 1 + _int(rng, sides); }                // 1..sides
  function _roll(rng, count, sides) { let s = 0; for (let i = 0; i < count; i++) s += _d(rng, sides); return s; }
  function _pick(rng, arr) { return arr[_int(rng, arr.length)]; }
  function _d100(rng) { return _d(rng, 100); }

  const ATTRS = Object.freeze(['STR', 'INT', 'WIL', 'DEX', 'CON', 'CHA']);

  // ════════════════════════════════════════════════════════════════════════════
  // Throw progressions (RR — the combat-progression prose is authoritative; the per-class markdown
  // tables column-drift, so EVERY throw is GENERATED from `base − advance(L, amount, every)`).
  // ════════════════════════════════════════════════════════════════════════════
  // The ACKS "k points every N levels" sub-step pattern. VERIFIED exact against the two clean
  // published tables: Fighter +2/3 (10,9,9,8,7,7,6,5,5,4,3,3,2,1) and Crusader +2/4 (10,10,9,9,
  // 8,8,7,7,6,6,5,5,4,4). Rule: when `every` divides into uniform steps (every % amount === 0) the
  // band advances by floor; the odd-band +2/3 case (every=3) advances by round (the .5 cases never
  // occur for amount=2/every=3). Exact for +2/3, +2/4, +2/6 — i.e. every RAW seed class.
  function _advance(level, amount, every) {
    const L = Math.max(1, level | 0);
    return (every % amount === 0)
      ? Math.floor((L - 1) * amount / every)
      : Math.round((L - 1) * amount / every);
  }
  // Parse an attack-progression string like "+2/3 levels" → {amount, every}. Defaults to +2/6
  // (the slowest, a 0-Fighting noncombatant) when unparseable.
  function _parseProgression(s) {
    const m = String(s || '').match(/\+?\s*(\d+)\s*\/\s*(\d+)/);
    return m ? { amount: +m[1], every: +m[2] } : { amount: 2, every: 6 };
  }
  // All classes hit AC 0 with 10+ at 1st level (RR). The attack throw improves at the Fighting rate.
  function attackThrowFor(level, attackProgression) {
    const p = _parseProgression(attackProgression);
    return Math.max(1, 10 - _advance(level, p.amount, p.every));
  }

  // L1 save bases + rate, per save-progression class. The L1 first-rows are reliable (least drift):
  // Fighter / Crusader / Mage read clean from RR; Thief is the canonical ACKS II row (its RR markdown
  // table is a fighter-clone mis-extraction — flagged in the SUMMARY). Rates from the combat-progression
  // prose (Fighters +2/3; Thieves/Crusaders +2/4; Mages +2/6).
  const _SAVE_BASE = Object.freeze({
    fighter:  Object.freeze({ paralysis: 13, death: 14, blast: 15, implements: 16, spells: 17 }),
    thief:    Object.freeze({ paralysis: 13, death: 13, blast: 16, implements: 13, spells: 15 }),
    crusader: Object.freeze({ paralysis: 13, death: 13, blast: 13, implements: 14, spells: 15 }),
    mage:     Object.freeze({ paralysis: 13, death: 10, blast: 16, implements: 13, spells: 15 })
  });
  const _SAVE_EVERY = Object.freeze({ fighter: 3, thief: 4, crusader: 4, mage: 6 });

  function savingThrowsFor(saveProgression, level) {
    const sp = _SAVE_BASE[saveProgression] ? saveProgression : 'fighter';
    const base = _SAVE_BASE[sp], every = _SAVE_EVERY[sp];
    const out = {};
    for (const k of ['paralysis', 'death', 'blast', 'implements', 'spells']) {
      out[k] = Math.max(2, base[k] - _advance(level, 2, every));
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HP / AC
  // ════════════════════════════════════════════════════════════════════════════
  function _hitDieSides(hitDie) { const m = String(hitDie || 'd8').match(/d(\d+)/); return m ? +m[1] : 8; }
  // RAW: roll one HD/level to 9th (+CON mod/die), flat hpAfter9th/level beyond (no CON, RR p.297).
  // hp floors at 1.
  function rollHp(rng, hitDie, level, conMod, hpAfter9th) {
    const sides = _hitDieSides(hitDie);
    const dice = Math.min(level, 9);
    let hp = 0;
    for (let i = 0; i < dice; i++) hp += _d(rng, sides) + (conMod || 0);
    if (level > 9) hp += (hpAfter9th || 2) * (level - 9);
    return Math.max(1, hp);
  }
  // 🔧 NPC armour allowance by the class's armorProf (ACKS armour AC: leather 2, chain-ish 4, plate 6).
  // A reasonable starting outfit the GM edits — base AC 0 + DEX mod + the allowance (RR §2.1 "base AC 0").
  const _ARMOR_AC = Object.freeze({ None: 0, Light: 2, Medium: 4, Heavy: 6 });
  function acFor(dexMod, armorProf) { return Math.max(0, (dexMod || 0) + (_ARMOR_AC[armorProf] || 0)); }

  // ════════════════════════════════════════════════════════════════════════════
  // Attributes — the three RAW 0th-level methods (JJ pp.252–253)
  // ════════════════════════════════════════════════════════════════════════════
  //   'flat'             — middling 9–11 across the board (a placid 0th-level commoner)
  //   'one-high-one-low' — 11 across, a prime → 13, one non-prime → 8 (the standard NPC method)
  //   '3d6'              — 3d6 in order, then swap the two highest into prime slots (a rolled NPC)
  function rollAttributes(method, rng, primeAttrs) {
    const primes = Array.isArray(primeAttrs) ? primeAttrs.slice() : [];
    const a = {};
    if (method === 'flat') {
      for (const k of ATTRS) a[k] = 9 + _int(rng, 3);            // 9..11
      return a;
    }
    if (method === '3d6') {
      for (const k of ATTRS) a[k] = _roll(rng, 3, 6);            // 3d6 in order
      // swap the single highest roll into the (first) prime requisite, if it isn't already higher
      if (primes.length) {
        const prime = primes[0];
        let bestK = ATTRS[0];
        for (const k of ATTRS) if (a[k] > a[bestK]) bestK = k;
        if (a[bestK] > a[prime]) { const t = a[prime]; a[prime] = a[bestK]; a[bestK] = t; }
      }
      return a;
    }
    // default: 'one-high-one-low'
    for (const k of ATTRS) a[k] = 11;
    const prime = primes.length ? primes[0] : 'STR';
    a[prime] = 13;
    const nonPrime = ATTRS.filter(k => primes.indexOf(k) < 0);
    a[(nonPrime.length ? _pick(rng, nonPrime) : 'CHA')] = 8;
    return a;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Occupation (JJ Ch.8 — the General/Street column of the Random Building Occupant table, pp.214–229)
  // ════════════════════════════════════════════════════════════════════════════
  // 1d100. Each row: a category + a representative occupation + a core occupational proficiency (a
  // valid PROFICIENCY_CATALOG key) + the class bucket a CLASSED occupation routes to (null = a 0th-
  // level commoner). The classed rows (Mercenary→fighter, Minor-Ecclesiastic→crusader, Minor-Magician→
  // mage, the master Specialist/Merchant→explorer/venturer) are the minority, matching the RAW bulk-is-
  // commoners shape. 🔧 The precise 1d100 cutpoints are a documented General/Street reading; the full
  // per-building sub-tables (Artisan/Merchant/Specialist) are G2 (cartography-first — the category
  // structure is RAW-faithful, the exact boundaries are refined with the sub-tables).
  const NPC_OCCUPATIONS = Object.freeze([
    { lo: 1,  hi: 30, label: 'Laborer',          category: 'laborer',     prof: 'labor',            bucket: null },
    { lo: 31, hi: 52, label: 'Artisan',          category: 'artisan',     prof: 'craft',            bucket: null },
    { lo: 53, hi: 66, label: 'Merchant',         category: 'merchant',    prof: 'bargaining',       bucket: null },
    { lo: 67, hi: 73, label: 'Hosteller',        category: 'hosteller',   prof: 'profession',       bucket: null },
    { lo: 74, hi: 80, label: 'Entertainer',      category: 'entertainer', prof: 'performance',      bucket: null },
    { lo: 81, hi: 86, label: 'Specialist',       category: 'specialist',  prof: 'naturalism',       bucket: null },
    { lo: 87, hi: 92, label: 'Mercenary',        category: 'mercenary',   prof: 'manual-of-arms',   bucket: 'fighter' },
    { lo: 93, hi: 95, label: 'Minor Ecclesiastic', category: 'ecclesiastic', prof: 'theology',      bucket: 'crusader' },
    { lo: 96, hi: 97, label: 'Minor Magician',   category: 'magician',    prof: 'collegiate-wizardry', bucket: 'mage' },
    { lo: 98, hi: 100, label: 'Special',         category: 'special',     prof: 'streetwise',       bucket: 'thief' }
  ]);
  function rollOccupation(rng) {
    const r = _d100(rng);
    return NPC_OCCUPATIONS.find(o => r >= o.lo && r <= o.hi) || NPC_OCCUPATIONS[0];
  }
  // A representative proficiency POOL per occupation category — the "what would this person likely
  // know" set the proficiency generator draws extras from (all valid PROFICIENCY_CATALOG general keys).
  const _OCCUPATION_PROF_POOL = Object.freeze({
    laborer:      ['labor', 'endurance', 'animal-husbandry', 'driving', 'caving', 'survival'],
    artisan:      ['craft', 'art', 'engineering', 'alchemy', 'profession', 'naturalism'],
    merchant:     ['bargaining', 'profession', 'language', 'driving', 'seafaring', 'streetwise'],
    hosteller:    ['profession', 'revelry', 'healing', 'folkways', 'performance', 'bargaining'],
    entertainer:  ['performance', 'art', 'mimicry', 'disguise', 'revelry', 'gambling'],
    specialist:   ['naturalism', 'healing', 'mapping', 'navigation', 'knowledge', 'tracking', 'trapping'],
    mercenary:    ['manual-of-arms', 'riding', 'military-strategy', 'leadership', 'siege-engineering', 'survival'],
    ecclesiastic: ['theology', 'healing', 'diplomacy', 'knowledge', 'folkways', 'performance'],
    magician:     ['collegiate-wizardry', 'alchemy', 'knowledge', 'language', 'naturalism', 'art'],
    special:      ['streetwise', 'gambling', 'disguise', 'intimidation', 'seduction', 'lip-reading']
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Proficiencies — the {key,ranks} output (the SHIPPED shape; PT-0)
  // ════════════════════════════════════════════════════════════════════════════
  // Count: the class's RAW proficiency progression (1 class + 1 general at L1, +1 general at 5/9/13,
  // +1 class at 3/6/9/12) + the INT-bonus extras (RR p.275). A leveled NPC gets `_profCount(level)`
  // + intMod (min 1). The core occupational proficiency leads; the rest are drawn (no dup) from the
  // occupation pool then the class's general affinities. All ranks:1 (G1 — the apprentice/journeyman/
  // master rank ladder + per-occupation specialisation is G2). Keys validated via canonicalProficiencyKey.
  function _profCount(level) {
    let n = 2;                                  // L1: 1 class + 1 general
    for (let L = 2; L <= level; L++) {
      if (L === 3 || L === 6 || L === 9 || L === 12) n++;   // class proficiency
      if (L === 5 || L === 9 || L === 13) n++;              // general proficiency
    }
    return n;
  }
  function rollProficiencies(rng, occupation, bucket, level, intMod) {
    const AC = _A();
    const canon = (k) => (typeof AC.canonicalProficiencyKey === 'function' ? AC.canonicalProficiencyKey(k) : k);
    const valid = (k) => { const c = canon(k); return (AC.PROFICIENCY_CATALOG && AC.PROFICIENCY_CATALOG[c]) ? c : null; };
    const out = [];
    const seen = new Set();
    const add = (k) => { const c = valid(k); if (c && !seen.has(c)) { seen.add(c); out.push({ key: c, ranks: 1 }); } };
    add('adventuring');                         // RAW: all characters begin with Adventuring (RR p.275)
    if (occupation && occupation.prof) add(occupation.prof);   // the core occupational proficiency leads
    const target = _profCount(Math.max(1, level)) + Math.max(0, intMod || 0);
    const pool = (_OCCUPATION_PROF_POOL[occupation && occupation.category] || []).slice();
    // shuffle the pool deterministically against rng, then drain it
    for (let i = pool.length - 1; i > 0; i--) { const j = _int(rng, i + 1); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    for (const k of pool) { if (out.length >= target) break; add(k); }
    // top up from a generic general-affinity set if still short
    const generic = ['folkways', 'survival', 'riding', 'healing', 'profession', 'language', 'naturalism', 'craft', 'labor', 'endurance'];
    for (const k of generic) { if (out.length >= target) break; add(k); }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Age (JJ pp.252–258 — the 0th-Level-Starting-Ages skew-young note + racial modifiers)
  // ════════════════════════════════════════════════════════════════════════════
  // Human 0th-level start skews young (~15 + 1d6); +1 year per non-1st level band (a leveled NPC has
  // adventured); racial modifiers: +2d8 dwarves, +2d20 elves (RAW). 🔧 The full 0th-Level-Starting-Ages
  // + NPC-Age-by-Class M/O tables (the placid-NPC +1d6/1d10/2d10 + the middle/old attribute-loss flag)
  // are a documented reading; the M/O markers ride the shipped CL-1 ageCategoryFor at land time.
  const _RACE_AGE_MOD = Object.freeze({ dwarf: [2, 8], elf: [2, 20], nobiran: [2, 20], halfling: [1, 6], zaharan: [1, 6] });
  function rollAge(rng, race, level) {
    let age = 15 + _d(rng, 6);                  // human young-adult base, skews young
    age += Math.max(0, (level | 0) - 1) * (1 + _int(rng, 3));   // ~1–3 yrs/level of experience
    const mod = _RACE_AGE_MOD[String(race || '').toLowerCase()];
    if (mod) age += _roll(rng, mod[0], mod[1]);
    return age;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Wealth + magic-item value (JJ p.249 — the NPC Wealth table, EXACT)
  // ════════════════════════════════════════════════════════════════════════════
  // gp + magic-item-value per NPC by level 0–14, plus the per-category magic-item counts (a string
  // where RAW prints a % chance or a die — surfaced for the GM, materialised by the Treasure Generator
  // #142 later). Exact transcription of the RAW table.
  const NPC_WEALTH = Object.freeze({
    0:  { gp: 70,         magic: 4,       items: { common: '1%' } },
    1:  { gp: 770,        magic: 150,     items: { common: '30%' } },
    2:  { gp: 2300,       magic: 450,     items: { common: '90%' } },
    3:  { gp: 4600,       magic: 875,     items: { common: '1', uncommon: '15%' } },
    4:  { gp: 9250,       magic: 1750,    items: { common: '1d4-1', uncommon: '40%' } },
    5:  { gp: 19250,      magic: 3500,    items: { common: '2', uncommon: '1' } },
    6:  { gp: 38500,      magic: 7000,    items: { common: '4', uncommon: '2' } },
    7:  { gp: 76750,      magic: 15250,   items: { common: '4', uncommon: '2', rare: '66%' } },
    8:  { gp: 154000,     magic: 28500,   items: { common: '5', uncommon: '3', rare: '1', veryRare: '10%' } },
    9:  { gp: 346000,     magic: 65000,   items: { common: '5', uncommon: '3', rare: '2', veryRare: '50%' } },
    10: { gp: 506000,     magic: 97500,   items: { common: '5', uncommon: '5', rare: '3', veryRare: '75%' } },
    11: { gp: 1140000,    magic: 228500,  items: { common: '7', uncommon: '7', rare: '7', veryRare: '2' } },
    12: { gp: 1775000,    magic: 349000,  items: { common: '8', uncommon: '7', rare: '7', veryRare: '4' } },
    13: { gp: 4550000,    magic: 892500,  items: { common: '10', uncommon: '10', rare: '9', veryRare: '5', legendary: '1d4-1' } },
    14: { gp: 13000000,   magic: 2555000, items: { common: '10', uncommon: '10', rare: '10', veryRare: '10', legendary: '6' } }
  });
  function npcWealthFor(level) {
    const L = Math.max(0, Math.min(14, level | 0));
    return NPC_WEALTH[L] || NPC_WEALTH[0];
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Appearance (JJ pp.260–268 — cosmetic; RAW: no mechanical impact, all count as 15 stone)
  // ════════════════════════════════════════════════════════════════════════════
  // 🔧 A thin first pass: build (STR-influenced) + colouring (race/culture-flavoured) + one
  // distinguishing feature, stored as descriptive strings. The full four-part Chaotic/Any/Lawful
  // table split is G2.
  const _BUILDS = Object.freeze(['gaunt', 'lean', 'wiry', 'average', 'sturdy', 'broad', 'burly', 'hulking']);
  const _HAIR = Object.freeze(['black', 'dark brown', 'brown', 'auburn', 'chestnut', 'sandy', 'blond', 'red', 'grey', 'white']);
  const _EYES = Object.freeze(['brown', 'hazel', 'green', 'grey', 'blue', 'amber', 'dark']);
  const _SKIN = Object.freeze(['pale', 'fair', 'olive', 'tan', 'bronze', 'brown', 'dark', 'weathered']);
  const _FEATURES = Object.freeze(['a jagged scar', 'a missing finger', 'a crooked nose', 'piercing eyes', 'a booming laugh',
    'a quiet limp', 'an old tattoo', 'a gold tooth', 'cropped hair', 'a heavy brow', 'calloused hands', 'a soft voice',
    'a nervous tic', 'a ready grin', 'a stern bearing', 'a weathered face']);
  function rollAppearance(rng, race, strMod) {
    const bi = Math.max(0, Math.min(_BUILDS.length - 1, 3 + (strMod || 0) + _int(rng, 3) - 1));
    return {
      build: _BUILDS[bi],
      hair: _pick(rng, _HAIR),
      eyes: _pick(rng, _EYES),
      skin: _pick(rng, _SKIN),
      feature: _pick(rng, _FEATURES),
      summary: ''   // filled below
    };
  }
  function _appearanceSummary(app, race) {
    return `A ${app.build} ${race || 'human'} with ${app.hair} hair and ${app.eyes} eyes — ${app.feature}.`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Class selection — the demographic class buckets → a seed class template
  // ════════════════════════════════════════════════════════════════════════════
  const _BUCKET_TO_CLASS_KEY = Object.freeze({
    fighter: 'fighter', crusader: 'crusader', thief: 'thief', mage: 'mage', explorer: 'explorer', venturer: 'venturer'
  });
  // Roll a class bucket weighted by the level's demographic split (JJ Step 3 — LEVEL_CLASS_SPLIT).
  function rollClassBucket(rng, level) {
    const AC = _A();
    const buckets = (AC.DEMOGRAPHIC_BUCKETS && AC.DEMOGRAPHIC_BUCKETS.length)
      ? AC.DEMOGRAPHIC_BUCKETS : ['fighter', 'crusader', 'thief', 'mage', 'explorer', 'venturer'];
    const splitRow = (AC.LEVEL_CLASS_SPLIT && AC.LEVEL_CLASS_SPLIT[Math.max(0, Math.min(13, (level | 0) - 1))]) || null;
    if (!splitRow) return _pick(rng, buckets);
    const total = splitRow.reduce((s, v) => s + v, 0) || 1;
    let r = rng() * total;
    for (let i = 0; i < buckets.length; i++) { r -= (splitRow[i] || 0); if (r <= 0) return buckets[i]; }
    return buckets[buckets.length - 1];
  }
  // Resolve a class TEMPLATE for a class key — a campaign custom class wins, else the RAW seed.
  function _classTemplateFor(campaign, classKey) {
    const AC = _A();
    if (campaign && typeof AC.customClassByKey === 'function') {
      const c = AC.customClassByKey(campaign, classKey);
      if (c) return c;
    }
    const seeds = (typeof AC.seedClassTemplates === 'function') ? AC.seedClassTemplates() : [];
    return seeds.find(t => t && t.key === classKey) || seeds.find(t => t && t.key === 'fighter') || null;
  }
  function _raceTemplateFor(campaign, raceKey) {
    const AC = _A();
    if (!raceKey || raceKey === 'human') return null;     // human is the implicit default (no template)
    if (campaign && typeof AC.customRaceByKey === 'function') {
      const r = AC.customRaceByKey(campaign, raceKey);
      if (r) return r;
    }
    const seeds = (typeof AC.seedRaceTemplates === 'function') ? AC.seedRaceTemplates() : [];
    return seeds.find(t => t && t.key === raceKey) || null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // THE GENERATOR — generateNPC(campaign, ctx, opts) → a proposal (the character + its provenance)
  // ════════════════════════════════════════════════════════════════════════════
  // ctx (all optional):  targetLevel (number, 0 = a 0th-level NPC) · class (a class key — overrides
  //   the bucket roll) · bucket (a demographic bucket) · race · alignment · settlementId · domainId ·
  //   hexId · name · socialTier · controlledBy · placementRole
  // opts: rng | seed (deterministic) · detailLevel ('full' | 'lightweight') · attributeMethod
  //   ('3d6' | 'one-high-one-low' | 'flat')
  function generateNPC(campaign, ctx, opts) {
    ctx = ctx || {}; opts = opts || {};
    const AC = _A();
    const rng = _resolveRng(opts);
    const detail = (opts.detailLevel === 'lightweight') ? 'lightweight' : 'full';

    // 1. Occupation (always rolled — it seeds the class bucket + the core proficiency)
    const occupation = rollOccupation(rng);

    // 2. Level + class
    const level = (typeof ctx.targetLevel === 'number') ? Math.max(0, Math.min(14, ctx.targetLevel | 0))
      : (occupation.bucket ? 1 : 0);            // a classed occupation is at least 1st level; else 0th
    let bucket = ctx.bucket || occupation.bucket || rollClassBucket(rng, Math.max(1, level));
    let classKey = ctx.class || _BUCKET_TO_CLASS_KEY[bucket] || bucket || 'fighter';
    const classTemplate = _classTemplateFor(campaign, classKey);
    const raceKey = (ctx.race || (classTemplate && classTemplate.raceTemplateKey) || 'human');
    const raceTemplate = _raceTemplateFor(campaign, raceKey);
    const derived = (classTemplate && typeof AC.deriveClassFromTemplate === 'function')
      ? AC.deriveClassFromTemplate(classTemplate, raceTemplate) : null;
    // clamp the level to the class's max
    const maxL = (derived && derived.maxLevel) || 14;
    const lvl = Math.min(level, maxL);

    // 3. Attributes (the 3 RAW methods)
    const primes = (derived && derived.primeRequisites) || ['STR'];
    const attributeMethod = (detail === 'lightweight') ? 'flat'
      : (opts.attributeMethod || (lvl >= 1 ? '3d6' : 'one-high-one-low'));
    const abilities = (detail === 'lightweight')
      ? { STR: 10, INT: 10, WIL: 10, DEX: 10, CON: 10, CHA: 10 }
      : rollAttributes(attributeMethod, rng, primes);
    const mod = (score) => (typeof AC.abilityMod === 'function' ? AC.abilityMod(score) : 0);

    // 4. Derived stats
    const hitDie = (derived && derived.hitDie) || 'd8';
    const hpAfter9th = (derived && derived.hpAfter9th) || 2;
    const hp = (detail === 'lightweight')
      ? { current: 0, max: 0, hitDice: '' }
      : (() => { const max = rollHp(rng, hitDie, Math.max(1, lvl), mod(abilities.CON), hpAfter9th); return { current: max, max, hitDice: `${Math.min(Math.max(1, lvl), 9)}${hitDie}` }; })();
    const attackThrow = attackThrowFor(Math.max(1, lvl), (derived && derived.attackProgression) || '+2/6 levels');
    const savingThrows = savingThrowsFor((derived && derived.saveProgression) || 'fighter', Math.max(1, lvl));
    const ac = (detail === 'lightweight') ? 0 : acFor(mod(abilities.DEX), (derived && derived.armorProf) || 'None');

    // 5. Proficiencies ({key,ranks})
    const proficiencies = (detail === 'lightweight')
      ? (occupation.prof ? [{ key: ((typeof AC.canonicalProficiencyKey === 'function' ? AC.canonicalProficiencyKey(occupation.prof) : occupation.prof)), ranks: 1 }] : [])
      : rollProficiencies(rng, occupation, bucket, lvl, mod(abilities.INT));

    // 6. Age + wealth + appearance
    const age = rollAge(rng, raceKey, lvl);
    const wealth = npcWealthFor(lvl);
    const appearance = (detail === 'lightweight')
      ? { build: 'average', hair: _pick(rng, _HAIR), eyes: _pick(rng, _EYES), skin: 'fair', feature: _pick(rng, _FEATURES), summary: '' }
      : rollAppearance(rng, raceKey, mod(abilities.STR));
    appearance.summary = _appearanceSummary(appearance, raceKey);

    // 7. Name (a light culture-flavoured pick — the deep phoneme generator is out of scope, §2.3)
    const name = ctx.name || _rollName(rng, raceKey, abilities.CHA);

    // 8. Class label (display) — title-case the class key
    const classLabel = (classTemplate && classTemplate.displayName) ||
      classKey.replace(/(^|[-\s])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/-/g, ' ');

    // 9. Build the Character (via the shipped factory). lvl 0 stores as level 1 with a 0th flag on the
    //    occupation (blankCharacter clamps level||1 → 0 becomes 1; we record true 0th-level via xpToNext).
    const blank = (typeof AC.blankCharacter === 'function') ? AC.blankCharacter : null;
    if (!blank) throw new Error('generators: ACKS.blankCharacter unavailable');
    const character = blank({
      name,
      kind: 'NPC',
      controlledBy: ctx.controlledBy || 'gm',
      socialTier: ctx.socialTier || 'independent',
      lifecycleState: 'active',
      detailLevel: detail,
      class: classLabel,
      level: Math.max(1, lvl),
      race: raceKey,
      alignment: ctx.alignment || _rollAlignment(rng),
      xp: (lvl >= 1 && derived && derived.xpTable) ? (derived.xpTable[Math.max(1, lvl) - 1] || 0) : 0,
      abilities,
      hp,
      ac,
      attackThrow,
      savingThrows,
      proficiencies,
      coins: { pp: 0, gp: wealth.gp, ep: 0, sp: 0, cp: 0 },
      age,
      currentHexId: ctx.hexId || null,
      currentDomainId: ctx.domainId || null,
      homeSettlementId: ctx.settlementId || null,
      placementRole: ctx.placementRole || null
    });
    // additive, defensive-read fields the generator sets directly (blankCharacter untouched → migration-free)
    character.occupation = occupation.label;
    character.occupationCategory = occupation.category;
    character.appearance = appearance;
    character.generated = true;
    character.magicItemValue = wealth.magic;        // the JJ p.249 magic-item budget (materialised by #142 later)
    character.magicItemAvailability = wealth.items; // the per-category counts (GM/Treasure-Generator surface)
    character.isZerothLevel = (lvl === 0);
    if (lvl === 0) {
      // 0th-level XP-to-1st = (16 − proficiency count) × 60 (Phase 4.8 §2.1)
      character.xpToNextLevel = Math.max(0, (16 - proficiencies.length)) * 60;
    }
    // reconcile the age category via the shipped CL-1 derivation, if present
    if (typeof AC.ageCategoryFor === 'function') {
      try { character.ageCategory = AC.ageCategoryFor(character); } catch (e) { /* ageless / unsupported race → leave null */ }
    }

    return {
      character,
      provenance: {
        occupation: occupation.label, occupationCategory: occupation.category,
        classKey, bucket, level: lvl, race: raceKey, attributeMethod, detailLevel: detail,
        wealthGp: wealth.gp, magicItemValue: wealth.magic,
        seed: (opts.seed != null ? opts.seed : null)
      }
    };
  }

  // A light culture-flavoured name (§2.3 — the deep phoneme generator is out of scope; a simple
  // word-list pick by race, GM-overridable).
  const _NAMES = Object.freeze({
    human:    ['Aldric', 'Mira', 'Bran', 'Sela', 'Corwin', 'Yara', 'Edran', 'Tessa', 'Halvard', 'Nessa', 'Garrin', 'Lyssa', 'Othic', 'Wren', 'Dax', 'Iona'],
    dwarf:    ['Durin', 'Brunna', 'Thrain', 'Kazra', 'Borin', 'Vella', 'Murgan', 'Hilda'],
    elf:      ['Aelar', 'Sylwen', 'Faelar', 'Niraë', 'Thalion', 'Eïla', 'Caelum', 'Yrra'],
    halfling: ['Pippin', 'Rosa', 'Dob', 'Marla', 'Tobin', 'Lily'],
    nobiran:  ['Quintus', 'Livia', 'Marcus', 'Octavia'],
    zaharan:  ['Zafira', 'Khaled', 'Nahir', 'Sabeen']
  });
  function _rollName(rng, race, cha) {
    const pool = _NAMES[String(race || '').toLowerCase()] || _NAMES.human;
    return _pick(rng, pool);
  }
  function _rollAlignment(rng) { return _pick(rng, ['L', 'L', 'N', 'N', 'N', 'C']); }   // weighted toward Neutral

  // ── land the proposal: push the Character + emit the `generation` event with the context envelope ──
  function landGeneratedNPC(campaign, proposal, opts) {
    opts = opts || {};
    if (!campaign || !proposal || !proposal.character) return null;
    if (!Array.isArray(campaign.characters)) campaign.characters = [];
    const c = proposal.character;
    campaign.characters.push(c);
    _recordGenerationEvent(campaign, proposal, opts);
    return c;
  }
  // convenience: generate + land in one call
  function generateAndLandNPC(campaign, ctx, opts) {
    const proposal = generateNPC(campaign, ctx, opts);
    landGeneratedNPC(campaign, proposal, opts);
    return proposal.character;
  }

  function _recordGenerationEvent(campaign, proposal, opts) {
    opts = opts || {};
    const AC = _A();
    if (typeof AC.newEvent !== 'function') return null;
    const c = proposal.character, pv = proposal.provenance || {};
    const turn = (campaign && (campaign.currentTurn || campaign.turn)) || 0;
    const ev = AC.newEvent('generation', {
      submittedBy: opts.submittedBy || 'gm',
      targetTurn: turn,
      cadence: 'gm-action',
      payload: {
        generator: 'npc',
        producedCharacterIds: [c.id],
        occupation: pv.occupation, classKey: pv.classKey, bucket: pv.bucket, level: pv.level,
        race: pv.race, attributeMethod: pv.attributeMethod, detailLevel: pv.detailLevel,
        wealthGp: pv.wealthGp, magicItemValue: pv.magicItemValue,
        seed: (pv.seed != null ? String(pv.seed) : null),
        narrative: `Generated ${c.name} — a ${pv.race} ${c.class}${pv.level > 0 ? ' (L' + pv.level + ')' : ' (0th-level ' + pv.occupation + ')'}.`
      }
    });
    // the §8.9 context envelope — produced entities as relatedEntities + the target hex/settlement/domain
    if (typeof AC.setEventContext === 'function') {
      AC.setEventContext(ev, {
        primaryHexId: c.currentHexId || null,
        settlementId: c.homeSettlementId || null,
        domainId: c.currentDomainId || null,
        relatedEntities: [{ kind: 'character', id: c.id, role: 'produced' }]
      });
    }
    ev.status = (AC.EVENT_STATUS && AC.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = turn;
    ev.appliedAtDay = (campaign && campaign.currentDayInMonth) || 1;
    if (!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({
      event: ev,
      result: { narrativeSummary: ev.payload.narrative },
      appliedAtTurn: turn, appliedAt: new Date().toISOString()
    });
    return ev;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // G2 — BATCH GENERATION (settlement rosters / ruler entourages / NPC parties)
  // ════════════════════════════════════════════════════════════════════════════
  // Each generator returns an ARRAY of G1 proposals ({character, provenance, …}) — NOT landed. The UI
  // reviews them (re-roll / drop a row) and lands the kept ones via landRoster → the shipped
  // landGeneratedNPC (one `generation` event per NPC, each with its own §8.9 context envelope). NO new
  // entity / prefix / event / migration — pure batch orchestration over generateNPC + READ-ONLY
  // demographics reads (demographicOpenNotableSlots / realmCommandStructure; the census lane owns that
  // module — these are call-time reads on the shared global.ACKS, never edits). The census's own SD-2b
  // auto-fill is the GATED reconcile-the-roster path on the Demographics view; THIS is the UNGATED GM
  // authoring tool on the 🧙 Generators tab — like the G1 single-NPC card, it proposes and the GM
  // commits (CLAUDE §5 #1). Late-binds the demographics reads (they may be absent in a headless test).

  // Per-index batch opts: a base seed → distinct reproducible streams "<seed>:<i>" (the G1 _resolveRng
  // FNV-hashes a string seed, so the indices give independent NPCs); a null base seed → a shared
  // advancing rng (or Math.random) so a one-shot GM batch still varies. NOTE: when a per-index seed is
  // present we DON'T pass rng (else _resolveRng's rng-first rule would make every NPC identical).
  function _batchOpts(opts, i) {
    opts = opts || {};
    const common = { detailLevel: opts.detailLevel, attributeMethod: opts.attributeMethod, submittedBy: opts.submittedBy };
    if (opts.seed != null) return Object.assign(common, { seed: String(opts.seed) + ':' + i });
    return Object.assign(common, { rng: opts.rng });
  }
  function _findSettlement(campaign, id) {
    const AC = _A();
    if (id && typeof AC.findSettlement === 'function') { const s = AC.findSettlement(campaign, id); if (s) return s; }
    return (campaign && Array.isArray(campaign.settlements)) ? (campaign.settlements.find(s => s && s.id === id) || null) : null;
  }
  // Build ONE batch proposal: generateNPC(ctx) + apply post-generation fields (homeDomainId /
  // liegeCharacterId — generateNPC homes only via settlementId, so the realm-court / party-liege
  // pointers are set here, the SD-2b pattern) + attach the row tags (slot / office / role) + a
  // TRANSIENT `_regen` descriptor (ctx + post) so the UI's per-row ⟳ regenerates with the SAME
  // context. `_regen` is in-memory only — landRoster ignores it, it is never serialized. → null on fail.
  function _propose(campaign, ctx, opts, post, tags) {
    const p = generateNPC(campaign, ctx, opts);
    if (!p || !p.character) return null;
    if (post) Object.assign(p.character, post);
    if (tags) { for (const k in tags) if (tags[k] != null) p[k] = tags[k]; }
    p._regen = { ctx: Object.assign({}, ctx), post: post || null };
    return p;
  }

  // generateRoster(campaign, ctx, opts) → N proposals for a context.
  //   ctx (all optional): settlementId (homes each + lets useCensusSlots read the census) · domainId ·
  //     hexId · count (default 6, capped 50) · minLevel / maxLevel (a per-NPC level range) · class /
  //     bucket (fix the class; else generateNPC rolls by demographics → a varied roster) · race ·
  //     useCensusSlots (read demographicOpenNotableSlots — one NPC per OPEN notable slot, read-only)
  //   → [{character, provenance, slot?}] (slot = the census {bucket,level} it filled, when censused).
  function generateRoster(campaign, ctx, opts) {
    ctx = ctx || {}; opts = opts || {};
    const AC = _A();
    const out = [];
    const settlement = ctx.settlementId ? _findSettlement(campaign, ctx.settlementId) : null;
    const baseCtx = {
      settlementId: ctx.settlementId || null,
      domainId: ctx.domainId || (settlement && settlement.domainId) || null,
      hexId: ctx.hexId || (settlement && settlement.hexId) || null,
      race: ctx.race || undefined,
      controlledBy: ctx.controlledBy || 'gm',
      socialTier: ctx.socialTier || 'independent'
    };
    // census-driven: one NPC per OPEN notable slot (a read-only consume of the census's open-slot read).
    if (ctx.useCensusSlots && settlement && typeof AC.demographicOpenNotableSlots === 'function') {
      const minLevel = (ctx.minLevel != null) ? Number(ctx.minLevel) : 1;
      const cap = Math.max(1, Math.min(50, (ctx.count != null) ? Number(ctx.count) : 12));
      const slots = AC.demographicOpenNotableSlots(campaign, settlement, { minLevel }) || [];
      for (const s of slots) {
        for (let k = 0; k < s.open && out.length < cap; k++) {
          const p = _propose(campaign, Object.assign({}, baseCtx, { bucket: s.bucket, targetLevel: s.level }), _batchOpts(opts, out.length), null, { slot: { bucket: s.bucket, level: s.level } });
          if (p) out.push(p);
        }
        if (out.length >= cap) break;
      }
      return out;
    }
    // plain batch: `count` NPCs at the form's class/race, each level fixed (targetLevel) or rolled in a
    // [minLevel, maxLevel] range; else generateNPC's own occupation roll decides (0th-or-1st).
    const count = Math.max(1, Math.min(50, (ctx.count != null) ? Number(ctx.count) : 6));
    for (let i = 0; i < count; i++) {
      const c = Object.assign({}, baseCtx);
      if (ctx.class) c.class = ctx.class;
      if (ctx.bucket) c.bucket = ctx.bucket;
      if (ctx.targetLevel != null) c.targetLevel = Number(ctx.targetLevel);
      else if (ctx.minLevel != null || ctx.maxLevel != null) {
        const lo = (ctx.minLevel != null) ? Number(ctx.minLevel) : 1;
        const hi = (ctx.maxLevel != null) ? Math.max(lo, Number(ctx.maxLevel)) : lo;
        c.targetLevel = lo + _int(_resolveRng(_batchOpts(opts, 'lvl-' + i)), (hi - lo + 1));
      }
      const p = _propose(campaign, c, _batchOpts(opts, i), null, null);
      if (p) out.push(p);
    }
    return out;
  }

  // generateEntourage(campaign, domainId, opts) → a ruler's COURT: one NPC per OPEN entourage office of
  //   the realm command structure (READ realmCommandStructure — magister / guildmaster / annalist; the
  //   ruler + the four magistrates are appointed via their own UIs, so only the entourage offices
  //   generate), at the office's expected level + bucket, homed to the realm (homeDomainId — set
  //   post-generation, the SD-2b pattern, since generateNPC homes only via settlementId). Falls back to
  //   a generic court (opts.count leveled retainers) when realmCommandStructure is unavailable.
  //   → [{character, provenance, office?:{key,label,bucket,expectedLevel}}].
  function generateEntourage(campaign, domainId, opts) {
    opts = opts || {};
    const AC = _A();
    const out = [];
    const rc = (typeof AC.realmCommandStructure === 'function') ? AC.realmCommandStructure(campaign, domainId) : null;
    const offices = (rc && Array.isArray(rc.offices)) ? rc.offices.filter(o => !o.filled && o.mapsTo === 'entourage' && o.bucket) : [];
    if (offices.length) {
      offices.forEach((o, i) => {
        const p = _propose(campaign, { bucket: o.bucket, targetLevel: o.expectedLevel, domainId, controlledBy: 'gm', socialTier: 'independent' },
          _batchOpts(opts, i), { homeDomainId: domainId }, { office: { key: o.key, label: o.label, bucket: o.bucket, expectedLevel: o.expectedLevel } });
        if (p) out.push(p);
      });
      return out;
    }
    const count = Math.max(1, Math.min(12, (opts.count != null) ? Number(opts.count) : 3));
    for (let i = 0; i < count; i++) {
      const p = _propose(campaign, { domainId, controlledBy: 'gm', socialTier: 'independent' }, _batchOpts(opts, i), { homeDomainId: domainId }, null);
      if (p) out.push(p);
    }
    return out;
  }

  // generateNpcParty(campaign, opts) → a wandering NPC party: a LEADER + `companions` henchmen at the
  //   leader's level − 1…−3 (RAW RR p.164: a henchman is ≤ the patron's level − 1; the index spreads
  //   −1/−2/−3). Pure generation (no census). The companions are lieged to the leader via the soft
  //   pointer the roster reads (character.liegeCharacterId + socialTier 'henchman') — a full Wave-A
  //   henchmanship relation (the cap + loyalty) is a refinement the GM formalizes. opts: leaderLevel
  //   (default 5) · companions (default 3) · leaderClass / leaderBucket · race · hexId / domainId
  //   (where the party stands) · partyName · detailLevel · seed.
  //   → { leader:{character,provenance}, companions:[{character,provenance,role:'henchman'}], partyName, leaderLevel }.
  function generateNpcParty(campaign, opts) {
    opts = opts || {};
    const leaderLevel = Math.max(1, Math.min(14, (opts.leaderLevel != null) ? Number(opts.leaderLevel) : 5));
    const nCompanions = Math.max(0, Math.min(12, (opts.companions != null) ? Number(opts.companions) : 3));
    const where = { hexId: opts.hexId || null, domainId: opts.domainId || null, race: opts.race || undefined, controlledBy: 'gm' };
    const lp = _propose(campaign, Object.assign({}, where, {
      targetLevel: leaderLevel, class: opts.leaderClass || undefined, bucket: opts.leaderBucket || undefined, socialTier: 'independent'
    }), _batchOpts(opts, 'leader'), null, { role: 'leader' });
    const leaderId = (lp && lp.character) ? lp.character.id : null;
    const companions = [];
    for (let i = 0; i < nCompanions; i++) {
      const lvl = Math.max(1, leaderLevel - 1 - (i % 3));   // −1 / −2 / −3, repeating
      const cp = _propose(campaign, Object.assign({}, where, { targetLevel: lvl, socialTier: 'henchman' }),
        _batchOpts(opts, 'comp-' + i), (leaderId ? { liegeCharacterId: leaderId } : null), { role: 'henchman' });
      if (cp) companions.push(cp);
    }
    return { leader: lp, companions, partyName: opts.partyName || (lp && lp.character ? (lp.character.name + "'s band") : 'NPC party'), leaderLevel };
  }

  // landRoster(campaign, proposals, opts) — land each proposal via the shipped landGeneratedNPC (one
  //   `generation` event per NPC, the shared event kind). Accepts the {character,provenance} array
  //   generateRoster/generateEntourage return, OR the {leader,companions} party object (flattened
  //   leader-first). → [Character…] (the landed objects).
  function landRoster(campaign, proposals, opts) {
    opts = opts || {};
    let list = [];
    if (Array.isArray(proposals)) list = proposals;
    else if (proposals && proposals.leader) list = [proposals.leader].concat(proposals.companions || []);
    const landed = [];
    for (const p of list) {
      if (!p || !p.character) continue;
      const c = landGeneratedNPC(campaign, p, opts);
      if (c) landed.push(c);
    }
    return landed;
  }

  // regenProposal(campaign, proposal, opts) — the UI's per-row ⟳: re-roll ONE proposal with a fresh
  //   seed but the SAME context (the `_regen` descriptor _propose attached), preserving the row tags
  //   (slot / office / role) + the post fields (homeDomainId / liegeCharacterId). Returns a NEW
  //   proposal (a fresh Character id) the caller swaps into the batch. A proposal with no `_regen`
  //   (e.g. an externally-built one) is returned unchanged.
  function regenProposal(campaign, proposal, opts) {
    opts = opts || {};
    if (!proposal || !proposal._regen) return proposal;
    const r = proposal._regen;
    const seed = (opts.seed != null) ? opts.seed : null;
    const np = _propose(campaign, Object.assign({}, r.ctx),
      { detailLevel: opts.detailLevel, attributeMethod: opts.attributeMethod, seed: seed, rng: (seed == null ? opts.rng : undefined) },
      r.post,
      { slot: proposal.slot, office: proposal.office, role: proposal.role });
    return np || proposal;
  }

  // ── exports ──
  Object.assign(A, {
    // the generator + the land/convenience verbs
    generateNPC, landGeneratedNPC, generateAndLandNPC,
    // G2 — batch generation (rosters / entourages / NPC parties) + the batch land + per-row re-roll
    generateRoster, generateEntourage, generateNpcParty, landRoster, regenProposal,
    // pure derivations (the consume-seam + the smoke-tested RAW oracle)
    attackThrowFor, savingThrowsFor, rollAttributes, rollHp, acFor, rollOccupation,
    rollProficiencies, rollAge, npcWealthFor, rollAppearance, rollClassBucket,
    // catalog data (read by the UI + tests)
    NPC_OCCUPATIONS, NPC_WEALTH
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
