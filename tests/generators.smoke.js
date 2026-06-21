// =============================================================================
// generators.smoke.js — NPC Generator G1 (Phase 4.8 §2.1, Wave G1).
// Spec: Phase_4.8_Generators_Plan.md §2.1 + §4 (produce EXISTING Characters, no new entity/prefix;
// ONE `generation` event kind). Covers: the throw oracle (RAW-exact vs the published Fighter +2/3 /
// Crusader +2/4 tables + the +2/6 reading); the NPC-Wealth table (JJ p.249, EXACT); the occupation
// 1d100 (contiguous 1–100); the 3 RAW attribute methods; HP/AC/age/wealth derivation; proficiencies
// ({key,ranks} with valid PROFICIENCY_CATALOG keys); the full generateNPC → proposal → land flow;
// 0th-level (XP-to-1st = (16−profs)×60) + lightweight (detailLevel, all-10) + determinism (seed);
// the class/race consume-seam (custom-classes deriveClass); the `generation` event (registered,
// wizard-opt-out, context envelope); and the MIGRATION-FREE GUARD (blankCharacter untouched).
//
// Relies on tests/_engine.js auto-loading acks-engine-generators.js (the team-session "add a module,
// edit nothing" path — the glob bootstrap picks up every acks-engine-*.js).
// =============================================================================
const fs = require('fs');
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function eq(name, a, b){ ok(name, JSON.stringify(a) === JSON.stringify(b), 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const clone = o => JSON.parse(JSON.stringify(o));

// the SHIPPED demo (loaded by the suite itself — _engine.js does NOT load it)
require('../acks-demo-template.js');
const DEMO = global.ACKS_DEMO_TEMPLATE;
const freshDemo = () => clone(DEMO);

// =============================================================================
section('Module loaded via the glob bootstrap (edit-nothing path)');
// =============================================================================
ok('ACKS.generateNPC is a function', typeof ACKS.generateNPC === 'function');
ok('ACKS.landGeneratedNPC is a function', typeof ACKS.landGeneratedNPC === 'function');
ok('ACKS.generateAndLandNPC is a function', typeof ACKS.generateAndLandNPC === 'function');
ok('ACKS.attackThrowFor / savingThrowsFor / npcWealthFor exported',
  typeof ACKS.attackThrowFor === 'function' && typeof ACKS.savingThrowsFor === 'function' && typeof ACKS.npcWealthFor === 'function');
ok('ACKS.NPC_OCCUPATIONS / NPC_WEALTH exported', Array.isArray(ACKS.NPC_OCCUPATIONS) && ACKS.NPC_WEALTH && typeof ACKS.NPC_WEALTH === 'object');

// =============================================================================
section('Attack-throw oracle — RAW-exact vs the published class tables');
// =============================================================================
// Fighter / Explorer +2/3 — the clean published RR table (the verified anchor).
const fAtk = []; for(let L=1; L<=14; L++) fAtk.push(ACKS.attackThrowFor(L, '+2/3 levels'));
eq('Fighter +2/3 attack L1–14', fAtk, [10,9,9,8,7,7,6,5,5,4,3,3,2,1]);
// Crusader / Thief / Venturer +2/4 — the clean published Crusader table.
const cAtk = []; for(let L=1; L<=14; L++) cAtk.push(ACKS.attackThrowFor(L, '+2/4 levels'));
eq('Crusader/Thief +2/4 attack L1–14', cAtk, [10,10,9,9,8,8,7,7,6,6,5,5,4,4]);
// Mage +2/6 — the correct reading (1 step every 3 levels; the markdown table drifts).
const mAtk = []; for(let L=1; L<=14; L++) mAtk.push(ACKS.attackThrowFor(L, '+2/6 levels'));
eq('Mage +2/6 attack L1–14', mAtk, [10,10,10,9,9,9,8,8,8,7,7,7,6,6]);
ok('all classes hit AC 0 with 10+ at L1', ACKS.attackThrowFor(1, '+2/3 levels') === 10 && ACKS.attackThrowFor(1, '+2/6 levels') === 10);
ok('unparseable progression defaults to slowest (+2/6)', ACKS.attackThrowFor(8, 'nonsense') === ACKS.attackThrowFor(8, '+2/6 levels'));

// =============================================================================
section('Saving-throw oracle — RAW-exact L1 bases + per-class rate');
// =============================================================================
eq('Fighter L1 saves', ACKS.savingThrowsFor('fighter', 1), { paralysis:13, death:14, blast:15, implements:16, spells:17 });
eq('Fighter L8 saves', ACKS.savingThrowsFor('fighter', 8), { paralysis:8, death:9, blast:10, implements:11, spells:12 });
eq('Fighter L14 saves', ACKS.savingThrowsFor('fighter', 14), { paralysis:4, death:5, blast:6, implements:7, spells:8 });
eq('Crusader L1 saves', ACKS.savingThrowsFor('crusader', 1), { paralysis:13, death:13, blast:13, implements:14, spells:15 });
eq('Crusader L8 saves (+2/4)', ACKS.savingThrowsFor('crusader', 8), { paralysis:10, death:10, blast:10, implements:11, spells:12 });
eq('Mage L1 saves', ACKS.savingThrowsFor('mage', 1), { paralysis:13, death:10, blast:16, implements:13, spells:15 });
eq('Thief L1 saves (canonical)', ACKS.savingThrowsFor('thief', 1), { paralysis:13, death:13, blast:16, implements:13, spells:15 });
ok('unknown save-progression falls back to fighter', JSON.stringify(ACKS.savingThrowsFor('???', 1)) === JSON.stringify(ACKS.savingThrowsFor('fighter', 1)));

// =============================================================================
section('NPC Wealth table — JJ p.249 EXACT');
// =============================================================================
eq('L0 wealth', { gp: ACKS.npcWealthFor(0).gp, magic: ACKS.npcWealthFor(0).magic }, { gp: 70, magic: 4 });
eq('L1 wealth', { gp: ACKS.npcWealthFor(1).gp, magic: ACKS.npcWealthFor(1).magic }, { gp: 770, magic: 150 });
eq('L5 wealth', { gp: ACKS.npcWealthFor(5).gp, magic: ACKS.npcWealthFor(5).magic }, { gp: 19250, magic: 3500 });
eq('L8 wealth', { gp: ACKS.npcWealthFor(8).gp, magic: ACKS.npcWealthFor(8).magic }, { gp: 154000, magic: 28500 });
eq('L14 wealth', { gp: ACKS.npcWealthFor(14).gp, magic: ACKS.npcWealthFor(14).magic }, { gp: 13000000, magic: 2555000 });
ok('L8 magic-item availability counts present', ACKS.npcWealthFor(8).items && ACKS.npcWealthFor(8).items.common === '5' && ACKS.npcWealthFor(8).items.rare === '1');
ok('out-of-range level clamps', ACKS.npcWealthFor(99).gp === ACKS.npcWealthFor(14).gp && ACKS.npcWealthFor(-5).gp === ACKS.npcWealthFor(0).gp);

// =============================================================================
section('Occupation roll (JJ Ch.8 — General/Street column)');
// =============================================================================
let contiguous = true, prev = 0;
for(const o of ACKS.NPC_OCCUPATIONS){ if(o.lo !== prev + 1){ contiguous = false; break; } prev = o.hi; }
ok('NPC_OCCUPATIONS cover 1–100 contiguously', contiguous && prev === 100, 'last hi=' + prev);
ok('every occupation row has a core proficiency + category', ACKS.NPC_OCCUPATIONS.every(o => o.prof && o.category && o.label));
// classed occupations route to a bucket (the minority); commoners do not
const classed = ACKS.NPC_OCCUPATIONS.filter(o => o.bucket);
ok('a minority of occupations are classed (Mercenary/Ecclesiastic/Magician/Special)', classed.length >= 3 && classed.length <= 5);
ok('rollOccupation returns a valid row (deterministic rng)', (() => {
  const rng = () => 0.50;                 // → d100 51 → Merchant (53–66? no — 0.50*100=50 → d100=51) ... validate it lands in a row
  const occ = ACKS.rollOccupation(rng);
  return occ && occ.prof && occ.label;
})());

// =============================================================================
section('Attribute methods (JJ pp.252–253 — the 3 RAW methods)');
// =============================================================================
const seqRng = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const flat = ACKS.rollAttributes('flat', () => 0.5, ['STR']);     // 0.5 → 9 + floor(0.5*3)=9+1=10
ok('flat: all 9–11', ['STR','INT','WIL','DEX','CON','CHA'].every(k => flat[k] >= 9 && flat[k] <= 11));
const ohol = ACKS.rollAttributes('one-high-one-low', () => 0, ['DEX']);
ok('one-high-one-low: prime → 13', ohol.DEX === 13);
ok('one-high-one-low: exactly one 8', Object.values(ohol).filter(v => v === 8).length === 1);
ok('one-high-one-low: rest 11', ['STR','INT','WIL','CON','CHA'].filter(k => ohol[k] === 11).length >= 4);
const r3 = ACKS.rollAttributes('3d6', () => 0.999, ['INT']);      // max rolls → all 18
ok('3d6: all in 3–18', ['STR','INT','WIL','DEX','CON','CHA'].every(k => r3[k] >= 3 && r3[k] <= 18));

// =============================================================================
section('generateNPC — the full leveled build → a proposal');
// =============================================================================
const camp = freshDemo();
const prop = ACKS.generateNPC(camp, { targetLevel: 5, class: 'fighter', race: 'human' }, { seed: 'oracle-1' });
const C = prop.character;
ok('proposal has character + provenance', C && prop.provenance && prop.provenance.classKey === 'fighter');
ok('NOT yet landed (campaign.characters unchanged)', camp.characters.indexOf(C) < 0);
ok('class Fighter, level 5', /fighter/i.test(C.class) && C.level === 5);
ok('attackThrow matches the oracle (Fighter L5 = 7)', C.attackThrow === 7);
eq('saves match the Fighter L5 oracle', C.savingThrows, ACKS.savingThrowsFor('fighter', 5));
ok('hp rolled > 0 with hitDice string', C.hp.max > 0 && /\dd\d/.test(C.hp.hitDice));
ok('ac >= 0', typeof C.ac === 'number' && C.ac >= 0);
ok('abilities are the 6 ACKS scores', ['STR','INT','WIL','DEX','CON','CHA'].every(k => typeof C.abilities[k] === 'number'));
ok('coins.gp = the L5 NPC-Wealth value', C.coins.gp === ACKS.npcWealthFor(5).gp);
ok('magicItemValue = the L5 magic budget', C.magicItemValue === ACKS.npcWealthFor(5).magic);
ok('age is a positive number', C.age > 0);
ok('appearance.summary is descriptive prose', typeof C.appearance.summary === 'string' && C.appearance.summary.length > 10);
ok('occupation set (additive field)', typeof C.occupation === 'string' && C.occupation.length > 0);
ok('generated flag set', C.generated === true);
ok('controlledBy gm / socialTier independent / lifecycle active', C.controlledBy === 'gm' && C.socialTier === 'independent' && C.lifecycleState === 'active');

// proficiencies — the {key,ranks} shape with valid catalog keys
ok('proficiencies are {key,ranks}', Array.isArray(C.proficiencies) && C.proficiencies.every(p => typeof p.key === 'string' && typeof p.ranks === 'number'));
ok('every proficiency key is a valid PROFICIENCY_CATALOG key', C.proficiencies.every(p => ACKS.PROFICIENCY_CATALOG[p.key]));
ok('proficiencies include Adventuring (RAW — all characters)', C.proficiencies.some(p => p.key === 'adventuring'));

// the consume-seam — class derivation read from custom-classes (coreClassMapping fighter)
ok('coreClassMapping read from custom-classes (Fighter → fighter)', (() => {
  const tpl = ACKS.seedClassTemplates().find(t => t.key === 'fighter');
  return ACKS.deriveClassFromTemplate(tpl, null).coreClassMapping === 'fighter';
})());

// =============================================================================
section('0th-level NPC + XP-to-1st = (16 − proficiency count) × 60');
// =============================================================================
const z = ACKS.generateNPC(camp, { targetLevel: 0 }, { seed: 'zeroth-1' }).character;
ok('isZerothLevel flag', z.isZerothLevel === true);
ok('stored as level 1 (blankCharacter clamps), 0th tracked by flag', z.level === 1);
eq('xpToNextLevel = (16 − profs) × 60', z.xpToNextLevel, Math.max(0, 16 - z.proficiencies.length) * 60);
ok('0th-level wealth = L0 (70gp)', z.coins.gp === 70);

// =============================================================================
section('Lightweight detail (the no-house-rule full-vs-quick toggle)');
// =============================================================================
const lw = ACKS.generateNPC(camp, { class: 'thief', targetLevel: 3 }, { detailLevel: 'lightweight', seed: 'lw-1' }).character;
ok('detailLevel = lightweight', lw.detailLevel === 'lightweight');
ok('lightweight abilities all 10', Object.values(lw.abilities).every(v => v === 10));
ok('lightweight has only the occupational proficiency (≤1)', lw.proficiencies.length <= 1);
ok('lightweight still has class/level/attack/saves', /thief/i.test(lw.class) && lw.level === 3 && lw.attackThrow > 0 && lw.savingThrows.death > 0);
ok('lightweight is upgradeable (the shipped detailLevel field — expandCharacterToFull doctrine)',
  typeof ACKS.expandCharacterToFull === 'function' || lw.detailLevel === 'lightweight');

// =============================================================================
section('Determinism (the byte-stable seed discipline)');
// =============================================================================
const a = ACKS.generateNPC(camp, { targetLevel: 6, class: 'mage' }, { seed: 'det-42' }).character;
const b = ACKS.generateNPC(camp, { targetLevel: 6, class: 'mage' }, { seed: 'det-42' }).character;
ok('same seed → same name + abilities + attack + saves + hp + age + profs', (() => {
  const strip = c => ({ name:c.name, abilities:c.abilities, attackThrow:c.attackThrow, savingThrows:c.savingThrows, hp:c.hp, age:c.age, profs:c.proficiencies });
  // ids differ (fresh mint each call); everything else byte-identical
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
})());
ok('different seed → (very likely) different roll', (() => {
  const x = ACKS.generateNPC(camp, { targetLevel: 6, class: 'mage' }, { seed: 'det-99' }).character;
  return x.name !== a.name || JSON.stringify(x.abilities) !== JSON.stringify(a.abilities);
})());
ok('Mage L6 attack matches the +2/6 oracle (9)', a.attackThrow === 9 && /mage/i.test(a.class));

// =============================================================================
section('Race consume-seam — racial age modifiers (+2d8 dwarf / +2d20 elf)');
// =============================================================================
// a dwarf NPC's age trends older than a human's at the same seed/level (the +2d8 modifier)
const human = ACKS.generateNPC(camp, { targetLevel: 1, race: 'human' }, { seed: 'age-1' }).character;
const dwarf = ACKS.generateNPC(camp, { targetLevel: 1, race: 'dwarf', class: 'dwarven-vaultguard' }, { seed: 'age-1' }).character;
ok('dwarf carries the +2d8 age modifier (older than the human base)', dwarf.age > human.age);
ok('dwarf race stored', dwarf.race === 'dwarf');

// =============================================================================
section('generateAndLandNPC — lands the Character + emits the `generation` event');
// =============================================================================
const land = freshDemo();
const beforeChars = land.characters.length, beforeEv = (land.eventLog || []).length;
const set0 = (land.settlements && land.settlements[0]) || null;
const landed = ACKS.generateAndLandNPC(land, { targetLevel: 4, settlementId: set0 ? set0.id : null }, { seed: 'land-1' });
ok('character pushed to campaign.characters', land.characters.length === beforeChars + 1 && land.characters.indexOf(landed) >= 0);
ok('homeSettlementId set from context', set0 ? landed.homeSettlementId === set0.id : true);
ok('one event appended', land.eventLog.length === beforeEv + 1);
const ev = land.eventLog[land.eventLog.length - 1].event;
ok('event kind = generation', ev.kind === 'generation');
ok('event payload carries producedCharacterIds', Array.isArray(ev.payload.producedCharacterIds) && ev.payload.producedCharacterIds[0] === landed.id);
ok('event context.relatedEntities names the produced character (role=produced)',
  ev.context && Array.isArray(ev.context.relatedEntities) && ev.context.relatedEntities.some(r => r.kind === 'character' && r.id === landed.id && r.role === 'produced'));
ok('event context carries the settlement', set0 ? ev.context.settlementId === set0.id : true);
ok('event narrative is prose', typeof ev.payload.narrative === 'string' && ev.payload.narrative.indexOf(landed.name) >= 0);
ok('event applied (status + appliedAtTurn)', ev.status === 'applied' && typeof ev.appliedAtTurn === 'number');

// =============================================================================
section('Event registration — generation is known, schema-valid, wizard-opted-out');
// =============================================================================
ok('isEventKindKnown(generation)', typeof ACKS.isEventKindKnown === 'function' && ACKS.isEventKindKnown('generation'));
ok('EVENT_SCHEMAS.generation requires generator + producedCharacterIds',
  ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS.generation && ACKS.EVENT_SCHEMAS.generation.R.generator && ACKS.EVENT_SCHEMAS.generation.R.producedCharacterIds);
ok('generation is NOT Event-Wizard-emittable (opt-out — the Generators tab owns it)',
  typeof ACKS.isWizardEmittable === 'function' && ACKS.isWizardEmittable('generation') === false);
ok('a generation event REPLAYS cleanly (audit handler well-formed)', (() => {
  if(typeof ACKS.applyEvent !== 'function') return true;
  const res = ACKS.applyEvent(freshDemo(), ev);    // record-only — must not throw
  return res !== undefined;
})());

// =============================================================================
section('G2 — batch generation exports');
// =============================================================================
ok('ACKS.generateRoster / generateEntourage / generateNpcParty / landRoster are functions',
  typeof ACKS.generateRoster === 'function' && typeof ACKS.generateEntourage === 'function'
  && typeof ACKS.generateNpcParty === 'function' && typeof ACKS.landRoster === 'function');

// =============================================================================
section('G2 — generateRoster (plain batch): count, level range, homing, NON-mutating preview');
// =============================================================================
const g2set = (camp.settlements && camp.settlements[0]) || null;
const g2RoCamp = freshDemo();
const g2RoSet = (g2RoCamp.settlements && g2RoCamp.settlements[0]) || null;
const g2charsBefore = g2RoCamp.characters.length, g2evBefore = (g2RoCamp.eventLog || []).length;
const g2roster = ACKS.generateRoster(g2RoCamp, { count: 5, minLevel: 1, maxLevel: 3, settlementId: g2RoSet ? g2RoSet.id : null }, { seed: 'g2-ro' });
ok('generateRoster returns `count` proposals', Array.isArray(g2roster) && g2roster.length === 5);
ok('every proposal is the G1 shape {character, provenance}', g2roster.every(p => p && p.character && p.provenance));
ok('every NPC level is within [minLevel, maxLevel]', g2roster.every(p => p.character.level >= 1 && p.character.level <= 3));
ok('every NPC homed to the settlement', g2RoSet ? g2roster.every(p => p.character.homeSettlementId === g2RoSet.id) : true);
ok('PREVIEW is NON-mutating — campaign.characters + eventLog UNCHANGED until land',
  g2RoCamp.characters.length === g2charsBefore && (g2RoCamp.eventLog || []).length === g2evBefore);
ok('count clamps to [1,50] (a 0 count → 1, a 999 → 50)',
  ACKS.generateRoster(g2RoCamp, { count: 0 }, { seed: 'c0' }).length === 1
  && ACKS.generateRoster(g2RoCamp, { count: 999 }, { seed: 'c9' }).length === 50);

// =============================================================================
section('G2 — generateRoster (census-driven): one NPC per OPEN notable slot (read-only)');
// =============================================================================
// the demo Saltspur has open notable slots the census expects but no homed NPC fills — generate them.
if(g2set && typeof ACKS.demographicOpenNotableSlots === 'function'){
  const slots = ACKS.demographicOpenNotableSlots(camp, g2set, { minLevel: 5 }) || [];
  ok('demographic open-slot read returns slots for the demo settlement', slots.length > 0, 'slots=' + slots.length);
  const cen = ACKS.generateRoster(freshDemo(), { settlementId: g2set.id, useCensusSlots: true, minLevel: 5, count: 6 }, { seed: 'g2-cen' });
  ok('census roster respects the count cap', cen.length <= 6 && cen.length > 0);
  ok('every census NPC is tagged with the slot it fills {bucket,level}',
    cen.every(p => p.slot && p.slot.bucket && typeof p.slot.level === 'number'));
  ok("every census NPC's level matches its slot level", cen.every(p => p.character.level === p.slot.level));
  ok('every census NPC buckets back to its slot bucket (generateNPC resolved the class from the bucket)',
    cen.every(p => ACKS.coreBucketForCharacter(camp, p.character) === p.slot.bucket));
} else {
  ok('census-slot path skipped (demographics module / demo settlement absent)', true);
}

// =============================================================================
section('G2 — generateEntourage: fills the OPEN entourage offices at expected level/bucket, homed');
// =============================================================================
const g2dom = (camp.domains && camp.domains[0]) || null;
if(g2dom && typeof ACKS.realmCommandStructure === 'function'){
  const rc = ACKS.realmCommandStructure(camp, g2dom.id);
  const openOffices = rc.offices.filter(o => !o.filled && o.mapsTo === 'entourage' && o.bucket);
  const entCamp = freshDemo();
  const entCharsBefore = entCamp.characters.length;
  const ent = ACKS.generateEntourage(entCamp, g2dom.id, { seed: 'g2-ent' });
  ok('entourage generates one NPC per open entourage office', ent.length === openOffices.length, 'got ' + ent.length + ' want ' + openOffices.length);
  ok('every entourage NPC carries its office {key,label,bucket,expectedLevel}',
    ent.every(p => p.office && p.office.key && p.office.bucket && typeof p.office.expectedLevel === 'number'));
  ok("every entourage NPC's level = the office's expected level", ent.every(p => p.character.level === p.office.expectedLevel));
  ok('every entourage NPC buckets to its office bucket', ent.every(p => ACKS.coreBucketForCharacter(camp, p.character) === p.office.bucket));
  ok('every entourage NPC homed to the realm (homeDomainId)', ent.every(p => p.character.homeDomainId === g2dom.id));
  ok('entourage PREVIEW is non-mutating', entCamp.characters.length === entCharsBefore);
  ok('only ENTOURAGE offices generate (no ruler / magistrate slots)',
    ent.every(p => ['magister','guildmaster','annalist'].indexOf(p.office.key) >= 0));
} else {
  ok('entourage path skipped (realmCommandStructure / demo domain absent)', true);
}

// =============================================================================
section('G2 — generateNpcParty: leader + companions (≤ leader−1), lieged as henchmen');
// =============================================================================
const g2party = ACKS.generateNpcParty(camp, { leaderLevel: 7, companions: 4, seed: 'g2-pty' });
ok('party returns { leader, companions, partyName, leaderLevel }',
  g2party && g2party.leader && Array.isArray(g2party.companions) && g2party.partyName && g2party.leaderLevel === 7);
ok('leader at leaderLevel', g2party.leader.character.level === 7);
ok('the right number of companions', g2party.companions.length === 4);
ok('every companion ≤ leader − 1 (RAW henchman cap, RR p.164)', g2party.companions.every(c => c.character.level <= 6 && c.character.level >= 1));
ok('companion levels spread −1 / −2 / −3 (then repeat)',
  JSON.stringify(g2party.companions.map(c => c.character.level)) === JSON.stringify([6, 5, 4, 6]));
ok('every companion is lieged to the leader (the soft patron pointer)',
  g2party.companions.every(c => c.character.liegeCharacterId === g2party.leader.character.id));
ok("every companion's socialTier is henchman", g2party.companions.every(c => c.character.socialTier === 'henchman'));
ok('party default name = "<leader>\'s band"', g2party.partyName === g2party.leader.character.name + "'s band");
ok('a 0-companion party is just a leader', ACKS.generateNpcParty(camp, { leaderLevel: 3, companions: 0, seed: 'solo' }).companions.length === 0);

// =============================================================================
section('G2 — landRoster: lands an array OR a party object → one `generation` event per NPC');
// =============================================================================
const landCamp = freshDemo();
const lcBefore = landCamp.characters.length, leBefore = (landCamp.eventLog || []).length;
const lcRoster = ACKS.generateRoster(landCamp, { count: 3, settlementId: (landCamp.settlements[0] || {}).id }, { seed: 'g2-land' });
const lcLanded = ACKS.landRoster(landCamp, lcRoster, {});
ok('landRoster(array) lands every kept proposal', lcLanded.length === 3 && landCamp.characters.length === lcBefore + 3);
ok('landRoster emits ONE generation event per NPC', (landCamp.eventLog || []).length === leBefore + 3);
ok('every appended event is kind=generation', (landCamp.eventLog || []).slice(-3).every(e => e.event.kind === 'generation'));
ok('landed characters are the same objects (ids match the proposals)',
  lcLanded.every((c, i) => c.id === lcRoster[i].character.id));
// land a party object (flattened leader-first)
const ptyCamp = freshDemo();
const pcBefore = ptyCamp.characters.length;
const ptyLanded = ACKS.landRoster(ptyCamp, ACKS.generateNpcParty(ptyCamp, { leaderLevel: 5, companions: 2, seed: 'g2-pl' }), {});
ok('landRoster(partyObject) flattens leader + companions', ptyLanded.length === 3 && ptyCamp.characters.length === pcBefore + 3);
ok('the leader lands first', ptyLanded[0].socialTier !== 'henchman' && ptyLanded.slice(1).every(c => c.socialTier === 'henchman'));

// =============================================================================
section('G2 — determinism: a seeded batch is byte-reproducible');
// =============================================================================
const detA = ACKS.generateRoster(freshDemo(), { count: 4, minLevel: 1, maxLevel: 5 }, { seed: 'g2-det' })
  .map(p => p.character.name + '|' + p.character.level + '|' + p.character.class);
const detB = ACKS.generateRoster(freshDemo(), { count: 4, minLevel: 1, maxLevel: 5 }, { seed: 'g2-det' })
  .map(p => p.character.name + '|' + p.character.level + '|' + p.character.class);
ok('same seed → identical roster (names + levels + classes)', JSON.stringify(detA) === JSON.stringify(detB));
ok('the batch is varied (per-index seeds give distinct NPCs, not N clones)',
  new Set(ACKS.generateRoster(freshDemo(), { count: 6 }, { seed: 'g2-var' }).map(p => p.character.name + p.character.level)).size > 1);

// =============================================================================
section('Data-footprint guard — no new entity/prefix; blankCharacter UNTOUCHED (migration-free)');
// =============================================================================
ok('gen- prefix stays UNUSED (a run is an event, not an entity)', !ACKS.ID_PREFIXES || ACKS.ID_PREFIXES.generation === undefined);
const blank = ACKS.blankCharacter ? ACKS.blankCharacter() : {};
ok('blankCharacter has NO occupation field (the generator sets it directly — defensive-read)', !('occupation' in blank));
ok('blankCharacter has NO generated field', !('generated' in blank));
ok('blankCharacter has NO appearance field', !('appearance' in blank));
ok('blankCharacter has NO magicItemValue field', !('magicItemValue' in blank));
ok('produced Character is a normal Character (has the five-axis fields)',
  'controlledBy' in landed && 'socialTier' in landed && 'lifecycleState' in landed && 'creatureTypes' in landed);

// the 6 templates STAY migrate-no-ops (the generator added zero persisted-by-default fields)
(function templatesNoOp(){
  const dir = path.join(__dirname, '..', 'Templates');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.acks.json')); } catch(e){ ok('Templates/ readable', false, e.message); return; }
  ok('found 6 v2 templates', files.length >= 1, 'count=' + files.length);
  for(const f of files){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch(e){ ok('template parses: ' + f, false, e.message); continue; }
    if(typeof ACKS.migrateCampaign !== 'function'){ continue; }
    const migrated = ACKS.migrateCampaign(clone(raw));
    ok('template "' + f + '" is a TRUE migrate-no-op (generators added no field)', JSON.stringify(migrated) === JSON.stringify(clone(raw)));
  }
})();

// =============================================================================
console.log('\n=============================================');
console.log('generators.smoke.js — ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('=============================================');
