// =============================================================================
// magic-research.smoke.js — Phase 4 Magic Research (the Arcane-Domain consumer), AD-M1.
// RR pp.388–393. Covers the core machine + the L5–L9 staples (spell research / identify / item creation):
//   - RESEARCH_RATE_BY_LEVEL (L9 600/8, L4 25, L12 staple 1750 vs ritual 2750) + MAGIC_RESEARCH_KINDS
//     (3 available + 6 gated) + researchEffectiveMinLevel (item one-use 5 / other 9).
//   - researchProjectCosts + magicItemCreationCost (the RR pp.391–393 table) + componentSubstitutionPenalty
//     (the RR p.388 worked example −2) + totalResearchRate (researcher + assistants + Magical Engineering).
//   - researchThrowInfo (target = level + bump, INT/proficiency/facility/sample mods, autoFailBand 3).
//   - the full lifecycle: startResearchProject (material at start) → processResearchForTurn (monthly accrual
//     → awaiting-throw / auto-complete no-throw) → payAndRollResearchThrow (success applies the result;
//     failure → total loss; components consumed) — for spell-research, identify, item-creation.
//   - the §5 Sanctums seam (arcane power + special components pay the component cost).
//   - the commitTurn hook (the demo — a real month advances research) + entity/event/schema registration.
// =============================================================================
global.window = global;
const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }

// A fixture: an arcane L9 mage (INT 16) with a coin purse; an empty campaign with the researchProjects[].
function mage(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign();
  c.currentTurn = 5;
  const m = ACKS.blankCharacter({ id: opts.id || 'chr-m', name: opts.name || 'Elaria', class: opts.cls || 'Mage',
    level: (opts.level != null ? opts.level : 9), abilities: { STR:9, INT: (opts.int != null ? opts.int : 16), WIL:12, DEX:10, CON:10, CHA:11 } });
  m.coins = { pp:0, gp: (opts.gp != null ? opts.gp : 100000), ep:0, sp:0, cp:0 };
  c.characters = [m];
  return { c, m };
}

// =============================================================================
section('Catalogs — RESEARCH_RATE_BY_LEVEL + MAGIC_RESEARCH_KINDS + min level (RR p.388)');
// =============================================================================
ok('L0 rate 2.5 / throw 18+', ACKS.researchRateForLevel(0).rate === 2.5 && ACKS.researchRateForLevel(0).throwTarget === 18);
ok('L4 rate 25 / throw 13+', ACKS.researchRateForLevel(4).rate === 25 && ACKS.researchRateForLevel(4).throwTarget === 13);
ok('L9 rate 600 / throw 8+ (the worked example)', ACKS.researchRateForLevel(9).rate === 600 && ACKS.researchRateForLevel(9).throwTarget === 8);
ok('L11 rate 1750 / throw 6+', ACKS.researchRateForLevel(11).rate === 1750 && ACKS.researchRateForLevel(11).throwTarget === 6);
ok('L12 STAPLE rate caps at 1750 (footnote)', ACKS.researchRateForLevel(12, 'item-creation').rate === 1750);
ok('L12 HIGH-TIER rate 2750 (ritual)', ACKS.researchRateForLevel(12, 'ritual-cast').rate === 2750);
ok('L14 high-tier 14500 / throw 3+', ACKS.researchRateForLevel(14, 'crossbreed').rate === 14500 && ACKS.researchRateForLevel(14, 'crossbreed').throwTarget === 3);
ok('level clamps above 14', ACKS.researchRateForLevel(20, 'ritual-cast').rate === 14500);
ok('AD-M3 — all 9 kinds available (staples + 4 high-tier + 2 rituals)', JSON.stringify(ACKS.availableResearchKinds().sort()) === JSON.stringify(['construct-design','construct-manufacture','crossbreed','identify','item-creation','necromancy','ritual-cast','ritual-learn','spell-research']));
ok('ritual kinds now available (AD-M3)', ACKS.magicResearchKind('ritual-learn').available === true && ACKS.magicResearchKind('ritual-cast').available === true);
ok('item-creation one-use min L5', ACKS.researchEffectiveMinLevel('item-creation', { effectType:'one-use' }) === 5);
ok('item-creation non-one-use min L9', ACKS.researchEffectiveMinLevel('item-creation', { effectType:'permanent' }) === 9);
ok('spell-research min L5', ACKS.researchEffectiveMinLevel('spell-research', {}) === 5);

// =============================================================================
section('Costs — researchProjectCosts + magicItemCreationCost (RR pp.388–393)');
// =============================================================================
{
  const sr = ACKS.researchProjectCosts('spell-research', { spellLevel: 3 });
  ok('spell-research L3: material+research 3000 each, component 0', sr.materialCostGp === 3000 && sr.researchCostGp === 3000 && sr.componentCostGp === 0 && sr.baseCost === 3000);
  const id = ACKS.researchProjectCosts('identify', {});
  ok('identify: material+research 1000 each, component 0', id.materialCostGp === 1000 && id.researchCostGp === 1000 && id.componentCostGp === 0);
  const pot = ACKS.researchProjectCosts('item-creation', { effectType:'one-use', spellLevel: 1 });
  ok('one-use L1 potion: 500 all three (component cost = monster parts)', pot.componentCostGp === 500 && pot.materialCostGp === 500 && pot.researchCostGp === 500);
  ok('item bonus +1 = 5000', ACKS.magicItemCreationCost({ effectType:'permanent-bonus', enchantBonus:1 }) === 5000);
  ok('item bonus +2 = 15000 (5000+10000)', ACKS.magicItemCreationCost({ effectType:'permanent-bonus', enchantBonus:2 }) === 15000);
  ok('item bonus +3 = 35000 (cumulative)', ACKS.magicItemCreationCost({ effectType:'permanent-bonus', enchantBonus:3 }) === 35000);
  ok('charged: 500 × level × charges', ACKS.magicItemCreationCost({ effectType:'charged', spellLevel:3, charges:10 }) === 15000);
  ok('activated 1/day: 500 × level × 8', ACKS.magicItemCreationCost({ effectType:'activated', spellLevel:2, activationRate:'1/day' }) === 8000);
  ok('at-will: 500 × level × 50', ACKS.magicItemCreationCost({ effectType:'at-will', spellLevel:1 }) === 25000);
  ok('permanent 1-day: 500 × level × 15', ACKS.magicItemCreationCost({ effectType:'permanent', spellLevel:1, permanentDuration:'1-day' }) === 7500);
}

// =============================================================================
section('Component substitution penalty (RR p.388 — the −1/level × % worked example)');
// =============================================================================
ok('no component cost → 0', ACKS.componentSubstitutionPenalty({ _componentCostGp: 0 }, 3) === 0);
ok('all appropriate (no penalized gp) → 0', ACKS.componentSubstitutionPenalty({ _componentCostGp: 1500, inappropriateGp: 0, miscGp: 0 }, 3) === 0);
ok('L3 spell, 1000 of 1500 inappropriate → −2 (−3 × ⅔, ceil)', ACKS.componentSubstitutionPenalty({ _componentCostGp: 1500, inappropriateGp: 1000 }, 3) === -2);
ok('all inappropriate → −level (L3 → −3)', ACKS.componentSubstitutionPenalty({ _componentCostGp: 1500, inappropriateGp: 1500 }, 3) === -3);
ok('tiny fraction → min −1', ACKS.componentSubstitutionPenalty({ _componentCostGp: 10000, miscGp: 100 }, 1) === -1);
ok('misc + inappropriate sum to the penalized portion', ACKS.componentSubstitutionPenalty({ _componentCostGp: 1500, miscGp: 500, inappropriateGp: 500 }, 3) === -2);

// =============================================================================
section('Eligibility (RR p.386/p.391 — arcane caster ≥ the kind min level)');
// =============================================================================
{
  const { c, m } = mage({ level: 9 });
  ok('arcane L9 → eligible for spell-research', ACKS.isEligibleResearcher(c, m, 'spell-research', {}).ok === true);
  ok('arcane L9 → eligible for item permanent (L9)', ACKS.isEligibleResearcher(c, m, 'item-creation', { effectType:'permanent' }).ok === true);
  const { c: c5, m: m5 } = mage({ level: 5 });
  ok('arcane L5 → eligible for a potion (one-use, L5)', ACKS.isEligibleResearcher(c5, m5, 'item-creation', { effectType:'one-use' }).ok === true);
  ok('arcane L5 → NOT eligible for a permanent item (needs L9)', ACKS.isEligibleResearcher(c5, m5, 'item-creation', { effectType:'permanent' }).ok === false);
  const { c: cf, m: mf } = mage({ level: 9, cls: 'Fighter' });
  ok('a Fighter (non-arcane) → not eligible', ACKS.isEligibleResearcher(cf, mf, 'spell-research', {}).reason === 'not-an-arcane-caster');
  ok('arcane L9 → too low to learn a ritual (needs L11)', ACKS.isEligibleResearcher(c, m, 'ritual-learn', { ritualLevel: 7 }).reason === 'level-too-low');
}

// =============================================================================
section('Total research rate + assistants (RR p.390)');
// =============================================================================
{
  const { c, m } = mage({ level: 9 });
  const helper = ACKS.blankCharacter({ id: 'chr-h', name: 'Irial', class: 'Mage', level: 4 });
  c.characters.push(helper);
  const p = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, researchCostGp: 2500 });
  ok('researcher alone: 600/day', ACKS.totalResearchRate(c, p) === 600);
  p.assistantCharacterIds = ['chr-h'];
  ok('+ L4 assistant (25) = 625/day (the worked example)', ACKS.totalResearchRate(c, p) === 625);
  ok('days remaining = ceil(2500/625) = 4', ACKS.researchDaysRemaining(c, p) === 4);
  // Magical Engineering +5%/rank on the researcher
  m.proficiencies = [{ key: 'magical-engineering', ranks: 2 }];
  ok('Magical Engineering 2 ranks → +10% rate (625 → 687.5)', Math.abs(ACKS.totalResearchRate(c, p) - 687.5) < 0.001);
}

// =============================================================================
section('Throw info (RR p.388 — target = level + bump; INT / proficiency / sample mods; band 3)');
// =============================================================================
{
  const { c, m } = mage({ level: 9, int: 16 });   // INT 16 → +2
  const p = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 3 } });
  const info = ACKS.researchThrowInfo(c, p);
  ok('target = L9 throw 8 + spell level 3 = 11', info.target === 11);
  ok('INT +2 modifier present', info.modifiers.some(x => x.label === 'INT' && x.value === 2));
  ok('autoFailBand 3 (RR p.388 — 1–3 always fail)', info.autoFailBand === 3);
  ok('a chance is computed', typeof info.chance === 'number' && info.chance > 0 && info.chance < 1);
  // Loremastery aids identify
  const { c: c2, m: m2 } = mage({ level: 9 });
  m2.proficiencies = [{ key: 'loremastery', ranks: 1 }];
  const pid = ACKS.blankResearchProject({ kind: 'identify', researcherCharacterId: m2.id, config: { spellLevelsImbued: 0 } });
  ok('Loremastery +2 on an identify throw', ACKS.researchThrowInfo(c2, pid).modifiers.some(x => /loremastery/i.test(x.label) && x.value === 2));
  // a sample adds +4
  const ps = ACKS.blankResearchProject({ kind: 'item-creation', researcherCharacterId: m.id, config: { effectType:'one-use', spellLevel:1 }, fromSample: true });
  ok('working from a sample → +4', ACKS.researchThrowInfo(c, ps).modifiers.some(x => x.label === 'sample' && x.value === 4));
}

// =============================================================================
section('Lifecycle — spell research: start → accrue → throw (success applies the formula)');
// =============================================================================
{
  const { c, m } = mage({ level: 9, gp: 50000 });
  const r = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 3, targetName: 'Wall of Fire' } });
  ok('start ok', r.ok === true);
  ok('material 3000 debited at start', m.coins.gp === 47000 && r.project.materialPaid === true);
  ok('status in-progress', r.project.status === 'in-progress');
  ok('researchProjects collection holds it', c.researchProjects.length === 1);
  ok('a magic-research-started event landed', c.eventLog.some(e => e.event.kind === 'magic-research-started'));
  // one month accrues 600×30=18000 ≥ 3000 → awaiting-throw
  const proc = ACKS.processResearchForTurn(c, {});
  ok('processResearchForTurn ran + advanced 1', proc.ran && proc.advanced === 1 && proc.awaitingThrow === 1);
  ok('status awaiting-throw, research fully invested', r.project.status === 'awaiting-throw' && r.project.researchInvestedGp >= 3000);
  // roll a guaranteed success (nat 20)
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.999 });
  ok('throw succeeds', res.ok && res.succeeded === true);
  ok('status completed', r.project.status === 'completed');
  ok('the spell formula is recorded on the mage', Array.isArray(m.magicFormulas) && m.magicFormulas.some(f => f.kind === 'spell' && f.name === 'Wall of Fire'));
  ok('a magic-research-completed event landed', c.eventLog.some(e => e.event.kind === 'magic-research-completed'));
}

// =============================================================================
section('Lifecycle — a common spell needs no throw (auto-completes on accrual)');
// =============================================================================
{
  const { c, m } = mage({ level: 9 });
  const r = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 1, targetName: 'Light' }, commonSpell: true });
  ok('common spell → needsThrow false', r.project.needsThrow === false);
  const proc = ACKS.processResearchForTurn(c, {});
  ok('auto-completed on accrual (no throw, no components)', r.project.status === 'completed' && proc.completed === 1);
  ok('formula gained without a roll', m.magicFormulas && m.magicFormulas.some(f => f.name === 'Light'));
}

// =============================================================================
section('Lifecycle — item creation: failure forfeits ALL investment (RR p.388 stakes)');
// =============================================================================
{
  const { c, m } = mage({ level: 9, gp: 50000 });
  const r = ACKS.startResearchProject(c, { kind: 'item-creation', researcherCharacterId: m.id, config: { itemKind:'potion', effectType:'one-use', spellLevel: 1, targetName: 'Potion of Healing' } });
  ok('item start: 500 component/material/research', r.project.componentCostGp === 500 && r.project.materialCostGp === 500);
  ok('material 500 debited (50000 → 49500)', m.coins.gp === 49500);
  ACKS.processResearchForTurn(c, {});
  ok('awaiting-throw after a month', r.project.status === 'awaiting-throw');
  // pay 500 misc components (penalty applies) + roll a guaranteed FAIL (nat 1)
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { componentPlan: { miscGp: 500 }, rng: () => 0.0 });
  ok('throw fails', res.ok && res.succeeded === false);
  ok('status failed', r.project.status === 'failed');
  ok('lostGp = material 500 + research 500 + components 500 = 1500', res.lostGp === 1500);
  ok('substitution penalty applied (−1, all-misc on a L1 effect)', res.penalty === -1);
  ok('components were consumed (paid from purse: 49500 → 49000)', m.coins.gp === 49000);
  ok('NO item minted on failure', (c.notableItems || []).length === 0);
  ok('a magic-research-failed event landed', c.eventLog.some(e => e.event.kind === 'magic-research-failed'));
}

// =============================================================================
section('Lifecycle — item creation SUCCESS mints a Notable Item + custody + formula');
// =============================================================================
{
  const { c, m } = mage({ level: 9, gp: 50000 });
  const r = ACKS.startResearchProject(c, { kind: 'item-creation', researcherCharacterId: m.id, config: { itemKind:'magic-weapon', effectType:'permanent-bonus', enchantBonus: 1, spellLevel: 1, targetName: '+1 Sword' } });
  ok('+1 sword base cost 5000', r.project.baseCost === 5000);
  ACKS.processResearchForTurn(c, {});   // L9 600×30=18000 ≥ 5000
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { componentPlan: { miscGp: 5000 }, rng: () => 0.999 });
  ok('success', res.succeeded === true);
  ok('a Notable Item is minted', (c.notableItems || []).length === 1 && c.notableItems[0].name === '+1 Sword');
  ok('the item carries the +1 enchantment + maker provenance', c.notableItems[0].intrinsic.enchantmentBonus === 1 && c.notableItems[0].provenance.makerCharacterId === m.id);
  ok('an item-custody record places it with the maker', (c.itemCustody || []).some(cu => cu.itemId === c.notableItems[0].id && cu.custodianId === m.id));
  ok('the maker gains the item formula', m.magicFormulas && m.magicFormulas.some(f => f.kind === 'item' && f.notableItemId === c.notableItems[0].id));
  ok('a magic-item-created event landed', c.eventLog.some(e => e.event.kind === 'magic-item-created'));
  ok('kindResult.notableItemId set', r.project.kindResult.notableItemId === c.notableItems[0].id);
}

// =============================================================================
section('Lifecycle — identify writes the per-character knownProperties (RR p.393)');
// =============================================================================
{
  const { c, m } = mage({ level: 9 });
  const item = ACKS.blankNotableItem({ id: 'itm-x', name: 'Mystery Rod', intrinsic: { properties: ['flame-tongue','light'] } });
  c.notableItems = [item];
  const r = ACKS.startResearchProject(c, { kind: 'identify', researcherCharacterId: m.id, config: { itemId: 'itm-x', spellLevelsImbued: 0, targetName: 'Mystery Rod' } });
  ACKS.processResearchForTurn(c, {});
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.999 });   // no components; throw only
  ok('identify succeeds', res.succeeded === true);
  ok('the item properties are now known to the mage', item.identification.knownProperties[m.id] && item.identification.knownProperties[m.id].indexOf('flame-tongue') >= 0);
  ok('kindResult.identified true', r.project.kindResult.identified === true);
}

// =============================================================================
section('§5 Sanctums seam — pay the component cost with arcane power + special components');
// =============================================================================
{
  // Build an arcane dungeon (sovereign + attuned) that yields arcane power, and a mage with a special
  // component item, then pay an item's component cost partly from each (penalty-free).
  const { c, m } = mage({ level: 9, gp: 50000 });
  m.currentHexId = 'hex-1';
  const dun = ACKS.blankDungeon({ id: 'dun-1', name: 'The Maze', hexId: 'hex-1', origin: 'constructed', status: 'known', areaSqFtPerLevel: [120000], areaCount: 24 });
  c.dungeons = [dun];
  const orcs = ACKS.blankGroup({ id: 'grp-orcs', groupTemplate: { monsterCatalogKey: 'orc', hitDice: '1' }, count: 429, casualties: 0, currentHexId: 'hex-1' });
  c.groups = [orcs];
  c.lairs = [ ACKS.blankLair({ id: 'lai', hexId: 'hex-1', status: 'active', dungeonId: 'dun-1', groupIds: ['grp-orcs'] }) ];
  ACKS.attuneToDungeon(c, { dungeonId: 'dun-1', mageCharacterId: m.id, method: 'built' });
  ACKS.establishSovereignty(c, { dungeonId: 'dun-1', casterId: m.id, method: 'gm-fiat' });
  ok('arcane power available (2550/month from 4290 XP)', ACKS.arcanePowerAvailable(c, m.id) === 2550);
  // give the mage a 3000gp special component
  m.inventory = [ { name: 'orc parts', stone: 5, specialComponent: { monsterKey: 'orc', magicTypes: [], valueGp: 3000 } } ];
  // an item with a 5000 component cost, paid 2000 arcane + 3000 special (penalty-free)
  const r = ACKS.startResearchProject(c, { kind: 'item-creation', researcherCharacterId: m.id, config: { itemKind:'magic-weapon', effectType:'permanent-bonus', enchantBonus: 1, spellLevel: 1, targetName: '+1 Blade' } });
  ACKS.processResearchForTurn(c, {});
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { componentPlan: { arcanePowerGp: 2000, specialItemRefs: [{ source: 'carry', index: 0 }] }, rng: () => 0.999 });
  ok('throw resolved (assembled 2000 arcane + 3000 special = 5000)', res.ok === true);
  ok('success (penalty-free — no penalty modifier)', res.succeeded === true && res.penalty === 0);
  ok('arcane power drawn down (2550 → 550)', ACKS.arcanePowerAvailable(c, m.id) === 550);
  ok('the special-component item was consumed', (m.inventory || []).length === 0);
  // insufficient assembly is refused atomically
  const r2 = ACKS.startResearchProject(c, { kind: 'item-creation', researcherCharacterId: m.id, config: { itemKind:'potion', effectType:'permanent', spellLevel: 2, permanentDuration:'1-day' } });
  ACKS.processResearchForTurn(c, {});
  const fail = ACKS.payAndRollResearchThrow(c, r2.project.id, { componentPlan: { miscGp: 10 }, rng: () => 0.999 });
  ok('insufficient components refused (no throw spent)', fail.ok === false && fail.reason === 'insufficient-components');
  ok('the project stays awaiting-throw on refusal', r2.project.status === 'awaiting-throw');
}

// =============================================================================
section('AD-M2 — the high-tier kinds (RR pp.394–398): cost formula + throw bump');
// =============================================================================
{
  ok('4 high-tier kinds available', ['construct-design','construct-manufacture','crossbreed','necromancy'].every(k => ACKS.magicResearchKind(k).available === true));
  ok('rituals now available + high-tier (AD-M3)', ACKS.magicResearchKind('ritual-learn').available === true && ACKS.magicResearchKind('ritual-cast').available === true && ACKS.HIGH_TIER_RESEARCH_KINDS.has('ritual-cast'));
  // cost = 2,000/HD + 625/minor + 5,000/major (RR pp.394–398)
  const cc = ACKS.researchProjectCosts('construct-manufacture', { hd: 6, minorAbilities: 2, majorAbilities: 1 });
  ok('construct 6×2000 + 2×625 + 1×5000 = 18250 (material+research; component 0)', cc.materialCostGp === 18250 && cc.researchCostGp === 18250 && cc.componentCostGp === 0 && cc.baseCost === 18250);
  const nc = ACKS.researchProjectCosts('necromancy', { hd: 8 });
  ok('necromancy component = base cost (monster parts XP = cost)', nc.componentCostGp === 16000 && nc.materialCostGp === 16000 && nc.baseCost === 16000);
  const xc = ACKS.researchProjectCosts('crossbreed', { hd: 4, minorAbilities: 1 });
  ok('crossbreed 4×2000 + 1×625 = 8625, component 0', xc.baseCost === 8625 && xc.componentCostGp === 0);
  // throw bump: +1 per 5,000gp; necromancy ×2 if unwilling
  const { c, m } = mage({ level: 11 });   // L11 throw target 6 (INT etc. are itemized modifiers, not the target)
  const pd = ACKS.blankResearchProject({ kind: 'construct-design', researcherCharacterId: m.id, config: { hd: 6, minorAbilities: 2, majorAbilities: 1 } });
  ok('construct throw target = L11 (6) + floor(18250/5000)=3 = 9', ACKS.researchThrowInfo(c, pd).target === 9);
  const pw = ACKS.blankResearchProject({ kind: 'necromancy', researcherCharacterId: m.id, config: { hd: 10, willing: true } });    // cost 20000 → +4
  const pu = ACKS.blankResearchProject({ kind: 'necromancy', researcherCharacterId: m.id, config: { hd: 10, willing: false } });   // → +8
  ok('necromancy willing target = 6 + 4 = 10', ACKS.researchThrowInfo(c, pw).target === 10);
  ok('necromancy unwilling target = 6 + 8 = 14', ACKS.researchThrowInfo(c, pu).target === 14);
}

// =============================================================================
section('AD-M2 — eligibility (L11; craftpriest L9; necromancy Chaotic; proficiency +2 levels)');
// =============================================================================
{
  const { c, m } = mage({ level: 11 });
  ok('arcane L11 → eligible for construct design', ACKS.isEligibleResearcher(c, m, 'construct-design', {}).ok === true);
  ok('arcane L11 → eligible for crossbreed', ACKS.isEligibleResearcher(c, m, 'crossbreed', {}).ok === true);
  const { c: c9, m: m9 } = mage({ level: 9 });
  ok('arcane L9 → NOT eligible for constructs (needs 11)', ACKS.isEligibleResearcher(c9, m9, 'construct-manufacture', {}).reason === 'level-too-low');
  // dwarven craftpriest L9 → constructs at L9 (RR p.394)
  const { c: cp, m: cpm } = mage({ level: 9, cls: 'Craftpriest' });
  ok('craftpriest L9 → eligible for constructs', ACKS.isEligibleResearcher(cp, cpm, 'construct-manufacture', {}).ok === true);
  ok('craftpriest construct min level = 9', ACKS.researchEffectiveMinLevel('construct-design', {}, cpm) === 9);
  ok('non-craftpriest construct min level = 11', ACKS.researchEffectiveMinLevel('construct-design', {}, m) === 11);
  // necromancy needs a Chaotic caster (RR p.396)
  const { c: cn, m: mn } = mage({ level: 11 });   // default alignment Neutral
  ok('necromancy by a Neutral mage → not-chaotic', ACKS.isEligibleResearcher(cn, mn, 'necromancy', {}).reason === 'not-chaotic');
  mn.alignment = 'Chaotic';
  ok('necromancy by a Chaotic L11 mage → eligible', ACKS.isEligibleResearcher(cn, mn, 'necromancy', {}).ok === true);
  // Black Lore of Zahar → eligibility +2 levels for necromancy (RR p.389)
  const { c: cb, m: mb } = mage({ level: 9 });
  mb.alignment = 'Chaotic'; mb.proficiencies = [{ key: 'black-lore-of-zahar', ranks: 1 }];
  ok('Black Lore L9 Chaotic → eligible for necromancy (+2 levels)', ACKS.isEligibleResearcher(cb, mb, 'necromancy', {}).ok === true);
  // Transmogrification → crossbreed +2 levels
  const { c: cx, m: mx } = mage({ level: 9 });
  mx.proficiencies = [{ key: 'transmogrification', ranks: 1 }];
  ok('Transmogrification L9 → eligible for crossbreed (+2 levels)', ACKS.isEligibleResearcher(cx, mx, 'crossbreed', {}).ok === true);
}

// =============================================================================
section('AD-M2 — proficiency throw + rate mods (Black Lore on necromancy)');
// =============================================================================
{
  const { c, m } = mage({ level: 11 });
  m.alignment = 'Chaotic'; m.proficiencies = [{ key: 'black-lore-of-zahar', ranks: 1 }];
  const p = ACKS.blankResearchProject({ kind: 'necromancy', researcherCharacterId: m.id, config: { hd: 10, willing: true } });
  ok('Black Lore +2 on a necromancy throw', ACKS.researchThrowInfo(c, p).modifiers.some(x => /black lore/i.test(x.label) && x.value === 2));
  ok('Black Lore +10% research rate on necromancy (1750 → 1925)', Math.abs(ACKS.totalResearchRate(c, p) - 1925) < 0.001);
  // a non-necromancy kind does NOT get the Black Lore mods
  const pc = ACKS.blankResearchProject({ kind: 'construct-design', researcherCharacterId: m.id, config: { hd: 4 } });
  ok('Black Lore does not apply to constructs', !ACKS.researchThrowInfo(c, pc).modifiers.some(x => /black lore/i.test(x.label)));
}

// =============================================================================
section('AD-M2 — manufacture mints a construct (mindless = auto-controlled)');
// =============================================================================
{
  const { c, m } = mage({ level: 11, gp: 100000 });
  const r = ACKS.startResearchProject(c, { kind: 'construct-manufacture', researcherCharacterId: m.id, config: { hd: 6, targetName: 'Iron Golem', quantity: 1 } });
  ok('construct-manufacture starts (material 12000 debited)', r.ok && m.coins.gp === 88000);
  ACKS.processResearchForTurn(c, {});   // L11 1750×30 = 52500 ≥ 12000
  ok('awaiting-throw after a month', r.project.status === 'awaiting-throw');
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.999 });   // no component cost; nat 20
  ok('manufacture succeeds', res.ok && res.succeeded === true);
  ok('a construct Group is minted', (c.groups || []).length === 1 && c.groups[0].name === 'Iron Golem' && c.groups[0].groupTemplate.creatureTypes.includes('construct'));
  ok('a mindless construct is auto-controlled (commander = maker, socialTier minion)', c.groups[0].commanderCharacterId === m.id && c.groups[0].socialTier === 'minion');
  ok('kindResult.groupId + controlled', r.project.kindResult.groupId === c.groups[0].id && r.project.kindResult.controlled === true);
  ok('a construct-manufactured event landed', c.eventLog.some(e => e.event.kind === 'construct-manufactured'));
}

// =============================================================================
section('AD-M2 — necromancy: components + willing auto-loyal; a sentient creation can slip control');
// =============================================================================
{
  const { c, m } = mage({ level: 11, gp: 100000 });
  m.alignment = 'Chaotic';
  const r = ACKS.startResearchProject(c, { kind: 'necromancy', researcherCharacterId: m.id, config: { hd: 8, willing: true, targetName: 'Skeletal Champion' } });
  ok('necromancy component cost = 16000', r.project.componentCostGp === 16000);
  ACKS.processResearchForTurn(c, {});
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { componentPlan: { miscGp: 16000 }, rng: () => 0.999 });
  ok('necromancy succeeds', res.succeeded === true);
  ok('an undead Group is minted (creatureTypes undead)', (c.groups || []).some(g => g.name === 'Skeletal Champion' && g.groupTemplate.creatureTypes.includes('undead')));
  ok('a willing subject → auto-loyal (controlled, no reaction needed)', r.project.kindResult.controlled === true && r.project.kindResult.willing === true);
  ok('a necromancy-performed event landed', c.eventLog.some(e => e.event.kind === 'necromancy-performed'));
  // a SENTIENT construct: throw succeeds but a bad disposition reaction slips control (the rng stream:
  // call 1 = the 1d20 throw [high → success], calls 2-3 = the 2d6 reaction [low → hostile → free-willed]).
  const { c: c2, m: m2 } = mage({ level: 11, gp: 100000 });
  const r2 = ACKS.startResearchProject(c2, { kind: 'construct-manufacture', researcherCharacterId: m2.id, config: { hd: 6, sentient: true, targetName: 'Awakened Statue' } });
  ACKS.processResearchForTurn(c2, {});
  let n = 0; const seqRng = () => { n++; return (n === 1) ? 0.95 : 0.0; };
  const res2 = ACKS.payAndRollResearchThrow(c2, r2.project.id, { rng: seqRng });
  ok('the throw succeeded but the sentient construct slipped control', res2.succeeded === true && r2.project.kindResult.controlled === false);
  const g2 = (c2.groups || []).find(x => x.name === 'Awakened Statue');
  ok('a free-willed creation has no commander + is independent', g2 && g2.commanderCharacterId === null && g2.socialTier === 'independent');
}

// =============================================================================
section('AD-M2 — construct DESIGN produces a formula (no creature); crossbreed kills the progenitors');
// =============================================================================
{
  const { c, m } = mage({ level: 11, gp: 100000 });
  const r = ACKS.startResearchProject(c, { kind: 'construct-design', researcherCharacterId: m.id, config: { hd: 6, targetName: 'Stone Guardian' } });
  ACKS.processResearchForTurn(c, {});
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.999 });
  ok('design succeeds → a formula (no Group minted)', res.succeeded === true && (c.groups || []).length === 0 && /^construct:/.test(r.project.kindResult.formula));
  ok('the construct formula is recorded on the maker', (m.magicFormulas || []).some(f => f.kind === 'construct' && f.name === 'Stone Guardian'));
  // crossbreed consumes designated progenitor Groups (RR p.396)
  const { c: c2, m: m2 } = mage({ level: 11, gp: 100000 });
  const prog = ACKS.blankGroup({ id: 'grp-prog', groupTemplate: { monsterCatalogKey: 'wolf' }, count: 6, casualties: 0 });
  c2.groups = [prog];
  const r2 = ACKS.startResearchProject(c2, { kind: 'crossbreed', researcherCharacterId: m2.id, config: { hd: 4, targetName: 'Wolf-thing', preserveMemory: true, progenitorGroupIds: ['grp-prog'] } });
  ACKS.processResearchForTurn(c2, {});
  const res2 = ACKS.payAndRollResearchThrow(c2, r2.project.id, { rng: () => 0.999 });
  ok('crossbreed succeeds, mints a creature', res2.succeeded === true && (c2.groups || []).some(g => g.name === 'Wolf-thing'));
  ok('preserved memory → auto-controlled', r2.project.kindResult.controlled === true);
  ok('the progenitor group is consumed (casualties = count)', prog.casualties === 6 && r2.project.kindResult.progenitorsKilled === 1);
  ok('a crossbreed-created event landed', c2.eventLog.some(e => e.event.kind === 'crossbreed-created'));
}

// =============================================================================
section('AD-M3 — ritual catalog, cost, repertoire cap, throw bump, eligibility (RR p.398)');
// =============================================================================
{
  ok('RITUAL_CATALOG seeds 15 sample rituals', Array.isArray(ACKS.RITUAL_CATALOG) && ACKS.RITUAL_CATALOG.length === 15);
  ok('Apotheosis = arcane 9 / divine 9, power-only', (() => { const e = ACKS.ritualCatalogEntry('apotheosis'); return e && e.arcane === 9 && e.divine === 9 && e.powerOnly === true; })());
  ok('Cataclysm = divine-only 9, divine-power-only', (() => { const e = ACKS.ritualCatalogEntry('cataclysm'); return e && e.arcane === null && e.divine === 9 && e.divinePowerOnly === true; })());
  ok('RITUAL_COST_BY_LEVEL = 50k/100k/200k', ACKS.RITUAL_COST_BY_LEVEL[7] === 50000 && ACKS.RITUAL_COST_BY_LEVEL[8] === 100000 && ACKS.RITUAL_COST_BY_LEVEL[9] === 200000);

  // Cost (RR p.398): learn has no component; cast pays the cost again as the component.
  const cl = ACKS.researchProjectCosts('ritual-learn', { ritualLevel: 7 });
  ok('ritual-learn L7: material+research 50000 each, component 0', cl.materialCostGp === 50000 && cl.researchCostGp === 50000 && cl.componentCostGp === 0);
  const cc = ACKS.researchProjectCosts('ritual-cast', { ritualLevel: 9 });
  ok('ritual-cast L9: material+research+component 200000 each', cc.materialCostGp === 200000 && cc.researchCostGp === 200000 && cc.componentCostGp === 200000);

  // Repertoire cap (RR p.398 worked examples — Quintus + Balbus).
  const { c, m } = mage({ level: 11, int: 16 });
  ok('Quintus L11 INT16 → 3 rituals per level (the RAW example)', ACKS.ritualRepertoireCap(c, m) === 3);
  ok('ritual key attribute = INT for an arcane caster', ACKS.ritualKeyAttributeFor(c, m) === 'INT');
  const { c: c10, m: m10 } = mage({ level: 10 });
  ok('L10 → no ritual repertoire (min L11)', ACKS.ritualRepertoireCap(c10, m10) === 0);
  const { c: cd, m: md } = mage({ level: 14, name: 'Balbus', cls: 'Crusader' });
  md.isArcaneCaster = false; md.isDivineCaster = true; md.abilities.WIL = 14;
  ok('a divine caster keys ritual repertoire off WIL', ACKS.ritualKeyAttributeFor(cd, md) === 'WIL');
  ok('Balbus L14 WIL14 → 5 rituals per level (the RAW example)', ACKS.ritualRepertoireCap(cd, md) === 5);
  ok('a divine caster is eligible to learn a ritual', ACKS.isEligibleResearcher(cd, md, 'ritual-learn', { ritualLevel: 7 }).ok === true);

  // Throw bump (+ ritual level).
  const p = ACKS.blankResearchProject({ kind: 'ritual-learn', researcherCharacterId: m.id, config: { ritualLevel: 7 } });
  ok('ritual-learn throw target = L11 throw (6) + ritual level 7 = 13', ACKS.researchThrowInfo(c, p).target === 13);

  // Eligibility.
  ok('arcane L11 → eligible to learn a ritual', ACKS.isEligibleResearcher(c, m, 'ritual-learn', { ritualLevel: 7 }).ok === true);
  const { c: c9, m: m9 } = mage({ level: 9 });
  ok('arcane L9 → not eligible (level-too-low)', ACKS.isEligibleResearcher(c9, m9, 'ritual-learn', { ritualLevel: 7 }).ok === false);
  ok('cast a ritual NOT in repertoire → ineligible', ACKS.isEligibleResearcher(c, m, 'ritual-cast', { ritualKey: 'permanency', ritualLevel: 8 }).reason === 'ritual-not-in-repertoire');
}

// =============================================================================
section('AD-M3 — learn a ritual → repertoire (the cap gates a 4th); then cast it (RR p.398)');
// =============================================================================
{
  const { c, m } = mage({ level: 11, int: 16, gp: 1000000 });   // repertoire cap 3 per level
  const r = ACKS.startResearchProject(c, { kind: 'ritual-learn', researcherCharacterId: m.id, config: { ritualKey: 'ranine-rain', ritualLevel: 7, targetName: 'Ranine Rain' } });
  ok('ritual-learn starts (material 50000 debited)', r.ok && m.coins.gp === 950000);
  ACKS.processResearchForTurn(c, {});   // L11 1750×30 = 52500 ≥ 50000
  ok('awaiting-throw after a month', r.project.status === 'awaiting-throw');
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.999 });   // no component; nat 20
  ok('learn succeeds → the ritual is in repertoire', res.succeeded === true && ACKS.ritualInRepertoire(c, m, 'ranine-rain'));
  ok('ritualsKnown at L7 = 1', ACKS.ritualsKnown(c, m, 7).length === 1);
  ok('the formula is a kind:ritual magicFormula (L7)', (m.magicFormulas || []).some(f => f.kind === 'ritual' && f.ritualLevel === 7));
  ok('a ritual-learned event landed', c.eventLog.some(e => e.event.kind === 'ritual-learned'));

  // fill the L7 repertoire to the cap (3) → a 4th is gated; a different level stays open.
  m.magicFormulas.push({ kind: 'ritual', name: 'A', ritualLevel: 7 }, { kind: 'ritual', name: 'B', ritualLevel: 7 });
  ok('L7 full (3 known) → learning a 4th is gated', ACKS.isEligibleResearcher(c, m, 'ritual-learn', { ritualLevel: 7 }).reason === 'ritual-repertoire-full');
  ok('a different level (L8) is still open', ACKS.isEligibleResearcher(c, m, 'ritual-learn', { ritualLevel: 8 }).ok === true);

  // cast the learned ritual (immediate) — pays the component with special components.
  const rc = ACKS.startResearchProject(c, { kind: 'ritual-cast', researcherCharacterId: m.id, config: { ritualKey: 'ranine-rain', ritualLevel: 7, targetName: 'Ranine Rain', mode: 'immediate' } });
  ok('ritual-cast starts (in repertoire)', rc.ok);
  ACKS.processResearchForTurn(c, {});
  const resc = ACKS.payAndRollResearchThrow(c, rc.project.id, { componentPlan: { specialItemValueGp: 50000 }, rng: () => 0.999 });
  ok('cast (immediate) succeeds; kindResult.mode immediate', resc.succeeded === true && rc.project.kindResult.mode === 'immediate');
  ok('a ritual-cast event landed', c.eventLog.some(e => e.event.kind === 'ritual-cast'));
}

// =============================================================================
section('AD-M3 — cast stored → a Notable Item; miscellaneous components disallowed (RR p.398)');
// =============================================================================
{
  const { c, m } = mage({ level: 12, int: 16, gp: 2000000 });
  m.magicFormulas = [{ kind: 'ritual', name: 'Permanency', ritualKey: 'permanency', ritualLevel: 8 }];   // already known
  const rc = ACKS.startResearchProject(c, { kind: 'ritual-cast', researcherCharacterId: m.id, config: { ritualKey: 'permanency', ritualLevel: 8, targetName: 'Permanency', mode: 'stored', storedForm: 'ring' } });
  ok('ritual-cast (stored) starts; component cost 100000', rc.ok && rc.project.componentCostGp === 100000);
  while(rc.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }   // L8 = 100000; L12 invests 82500/mo
  // pass miscGp — the engine ZEROS it for rituals (never miscellaneous); the special components cover the cost.
  const resc = ACKS.payAndRollResearchThrow(c, rc.project.id, { componentPlan: { specialItemValueGp: 100000, miscGp: 99999 }, rng: () => 0.999 });
  ok('stored cast succeeds; no substitution penalty (misc disallowed → 0)', resc.succeeded === true && (resc.penalty || 0) === 0);
  ok('a Notable Item (the stored ring) is minted', (c.notableItems || []).some(it => /Ring of Permanency/.test(it.name)));
  ok('kindResult: stored + notableItemId + storedForm ring', rc.project.kindResult.mode === 'stored' && !!rc.project.kindResult.notableItemId && rc.project.kindResult.storedForm === 'ring');
}

// =============================================================================
section('AD-M4 — experimentation catalogs + eligibility (RR pp.408–411)');
// =============================================================================
{
  ok('EXPERIMENT_METHODS: conventional 1 adv / minor / L5', (() => { const e = ACKS.EXPERIMENT_METHODS.conventional; return e.advantages === 1 && e.mishapTier === 'minor' && e.minLevel === 5 && e.maxBreakthrough === 'minor'; })());
  ok('EXPERIMENT_METHODS: pioneering 2 adv / major / L9', (() => { const e = ACKS.EXPERIMENT_METHODS.pioneering; return e.advantages === 2 && e.mishapTier === 'major' && e.minLevel === 9 && e.maxBreakthrough === 'major'; })());
  ok('EXPERIMENT_METHODS: radical 3 adv / catastrophic / L11', (() => { const e = ACKS.EXPERIMENT_METHODS.radical; return e.advantages === 3 && e.mishapTier === 'catastrophic' && e.minLevel === 11 && e.maxBreakthrough === 'revolutionary'; })());
  ok('EXPERIMENT_ADVANTAGES: haste / efficiency / insight / lore', ['haste','efficiency','insight','lore'].every(k => !!ACKS.EXPERIMENT_ADVANTAGES[k]));
  ok('BREAKTHROUGH_LEVELS: minor 5+/L5, major 10+/L9, revolutionary 20+/L11', (() => { const b = ACKS.BREAKTHROUGH_LEVELS; return b[0].threshold===5 && b[0].minLevel===5 && b[1].threshold===10 && b[1].minLevel===9 && b[2].threshold===20 && b[2].minLevel===11; })());

  const { c, m } = mage({ level: 11, int: 16 });
  ok('L11 → conventional eligible, maxAdvantages 1', (() => { const e = ACKS.experimentEligibility(c, m, 'conventional'); return e.ok && e.maxAdvantages === 1; })());
  ok('L11 → radical eligible, maxAdvantages 3', (() => { const e = ACKS.experimentEligibility(c, m, 'radical'); return e.ok && e.maxAdvantages === 3; })());
  const { c: c5, m: m5 } = mage({ level: 5 });
  ok('L5 → conventional eligible', ACKS.experimentEligibility(c5, m5, 'conventional').ok === true);
  ok('L5 → pioneering ineligible (needs L9)', (() => { const e = ACKS.experimentEligibility(c5, m5, 'pioneering'); return e.ok === false && e.reason === 'experiment-level-too-low' && e.minLevel === 9; })());
  ok('L5 → radical ineligible (needs L11)', ACKS.experimentEligibility(c5, m5, 'radical').minLevel === 11);
}

// =============================================================================
section('AD-M4 — advantages wire into rate (haste) / throw (insight) / components (efficiency)');
// =============================================================================
{
  const { c, m } = mage({ level: 9 });   // base research rate 600/day
  const base = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2 } });
  ok('no experiment → rate 600', Math.round(ACKS.totalResearchRate(c, base)) === 600);
  const haste1 = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2 }, experiment: { method: 'conventional', advantages: ['haste'] } });
  ok('haste ×1 → rate doubles to 1200', Math.round(ACKS.totalResearchRate(c, haste1)) === 1200);
  const haste2 = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2 }, experiment: { method: 'radical', advantages: ['haste','haste'] } });
  ok('haste ×2 → rate triples to 1800', Math.round(ACKS.totalResearchRate(c, haste2)) === 1800);
  const insight1 = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2 }, experiment: { method: 'conventional', advantages: ['insight'] } });
  ok('insight ×1 → +2 throw modifier', ACKS.researchThrowInfo(c, insight1).modifiers.some(mo => mo.label === 'insight' && mo.value === 2));
  const insight2 = ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2 }, experiment: { method: 'pioneering', advantages: ['insight','insight'] } });
  ok('insight ×2 → +4 throw modifier', ACKS.researchThrowInfo(c, insight2).modifiers.some(mo => mo.label === 'insight' && mo.value === 4));
}

// =============================================================================
section('AD-M4 — efficiency lets fewer special components cover the cost (RR p.409)');
// =============================================================================
{
  // item-creation permanent +1 = 5000gp component cost; 2500gp of components, doubled by efficiency, covers it.
  const { c, m } = mage({ level: 9, gp: 100000 });
  const r = ACKS.startResearchProject(c, { kind: 'item-creation', researcherCharacterId: m.id, config: { effectType: 'permanent-bonus', enchantBonus: 1, targetName: 'Sword +1' }, experiment: { method: 'conventional', advantages: ['efficiency'] } });
  ok('efficiency project starts (component cost 5000)', r.ok && r.project.componentCostGp === 5000);
  while(r.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { componentPlan: { specialItemValueGp: 2500 }, rng: () => 0.999 });
  ok('2500gp special components ×2 efficiency → covers 5000; the throw succeeds', res.ok && res.succeeded === true);
  // Without efficiency, 2500 < 5000 → insufficient.
  const { c: c2, m: m2 } = mage({ level: 9, gp: 100000 });
  const r2 = ACKS.startResearchProject(c2, { kind: 'item-creation', researcherCharacterId: m2.id, config: { effectType: 'permanent-bonus', enchantBonus: 1 } });
  while(r2.project.status === 'in-progress'){ ACKS.processResearchForTurn(c2, {}); }
  const res2 = ACKS.payAndRollResearchThrow(c2, r2.project.id, { componentPlan: { specialItemValueGp: 2500 }, rng: () => 0.999 });
  ok('no efficiency → 2500 < 5000 → insufficient-components', res2.reason === 'insufficient-components');
}

// =============================================================================
section('AD-M4 — breakthrough determination: margin, method ceiling, XP bonus (RR p.410, p.473)');
// =============================================================================
{
  const { c, m } = mage({ level: 11, int: 16 });
  const mk = (method) => ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id, researchCostGp: 1000, experiment: { method, advantages: [] } });
  const tr = (margin) => ({ total: 10 + margin, target: 10, succeeded: true });
  ok('radical, margin 22 → revolutionary', ACKS.determineBreakthrough(c, mk('radical'), tr(22)).level === 'revolutionary');
  ok('radical, margin 12 → major', ACKS.determineBreakthrough(c, mk('radical'), tr(12)).level === 'major');
  ok('radical, margin 7 → minor', ACKS.determineBreakthrough(c, mk('radical'), tr(7)).level === 'minor');
  ok('radical, margin 4 → no breakthrough', ACKS.determineBreakthrough(c, mk('radical'), tr(4)) === null);
  ok('conventional caps at minor (margin 22 → minor)', ACKS.determineBreakthrough(c, mk('conventional'), tr(22)).level === 'minor');
  ok('pioneering caps at major (margin 22 → major)', ACKS.determineBreakthrough(c, mk('pioneering'), tr(22)).level === 'major');
  ok('a non-experiment success → no breakthrough', ACKS.determineBreakthrough(c, ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m.id }), tr(22)) === null);
  ok('a failed throw → no breakthrough', ACKS.determineBreakthrough(c, mk('radical'), { total: 30, target: 10, succeeded: false }) === null);
  ok('minor xpBonus = ½ research cost (500)', ACKS.determineBreakthrough(c, mk('conventional'), tr(7)).xpBonus === 500);
  ok('revolutionary xpBonus = 2× research cost (2000)', ACKS.determineBreakthrough(c, mk('radical'), tr(22)).xpBonus === 2000);
  const { c: c9, m: m9 } = mage({ level: 9 });   // L9 → major reachable with pioneering
  ok('L9 pioneering, margin 12 → major (level gate met)', ACKS.determineBreakthrough(c9, ACKS.blankResearchProject({ kind: 'spell-research', researcherCharacterId: m9.id, researchCostGp: 1000, experiment: { method: 'pioneering' } }), tr(12)).level === 'major');
}

// =============================================================================
section('AD-M4 — a successful experiment applies the per-kind breakthrough + bonus XP + the event');
// =============================================================================
{
  // construct-design at L14 (low target) + radical insight → margin 21 → revolutionary; +12 HD on the formula.
  const { c, m } = mage({ level: 14, int: 16, gp: 200000 });
  const beforeXp = m.xp || 0;
  const r = ACKS.startResearchProject(c, { kind: 'construct-design', researcherCharacterId: m.id, config: { hd: 1, targetName: 'Iron Golem' }, experiment: { method: 'radical', advantages: ['insight'] } });
  ok('construct-design experiment starts (radical)', r.ok && r.project.experiment && r.project.experiment.method === 'radical');
  while(r.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.999 });   // nat 20; target 3 +INT2 +insight2 = 24 → margin 21
  ok('construct-design succeeds with a revolutionary breakthrough', res.succeeded === true && res.breakthrough && res.breakthrough.level === 'revolutionary');
  ok('breakthrough +12 HD applied (1 → 13)', r.project.kindResult.hd === 13 && r.project.kindResult.breakthrough.hdBonus === 12);
  ok('the construct formula HD reflects the breakthrough', (m.magicFormulas || []).some(f => f.kind === 'construct' && f.hd === 13));
  ok('revolutionary awards 2× research cost XP (research 2000 → +4000)', (m.xp || 0) === beforeXp + 4000);
  ok('a magic-experiment-breakthrough event landed', c.eventLog.some(e => e.event.kind === 'magic-experiment-breakthrough'));
}

// =============================================================================
section('AD-M4 — per-kind breakthrough results (item bonus effect / spell power / unexpected abilities)');
// =============================================================================
{
  const { c, m } = mage({ level: 14, int: 16, gp: 1000000 });
  // item-creation revolutionary → a GM-resolved bonus effect worth ≤200% of cost.
  const ri = ACKS.startResearchProject(c, { kind: 'item-creation', researcherCharacterId: m.id, config: { effectType: 'one-use', spellLevel: 1, targetName: 'Potion' }, experiment: { method: 'radical', advantages: ['insight'] } });
  while(ri.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }
  const resi = ACKS.payAndRollResearchThrow(c, ri.project.id, { componentPlan: { specialItemValueGp: 500 }, rng: () => 0.999 });
  ok('item-creation breakthrough → GM-resolved bonus effect (200% worth)', resi.succeeded && ri.project.kindResult.breakthrough && ri.project.kindResult.breakthrough.bonusEffectWorthPct === 200 && ri.project.kindResult.breakthrough.gmResolve === true);
  // spell-research revolutionary → +2 power level (not actual level).
  const rs = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 1, targetName: 'Sleep+' }, experiment: { method: 'radical', advantages: ['insight'] } });
  while(rs.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }
  const ress = ACKS.payAndRollResearchThrow(c, rs.project.id, { rng: () => 0.999 });
  ok('spell-research breakthrough → +2 power level', ress.succeeded && rs.project.kindResult.breakthrough.powerLevelBonus === 2);
  // crossbreed revolutionary → 3 unexpected abilities (roll 1d20), GM-resolved.
  const rx = ACKS.startResearchProject(c, { kind: 'crossbreed', researcherCharacterId: m.id, config: { hd: 1, quantity: 1, preserveMemory: true }, experiment: { method: 'radical', advantages: ['insight'] } });
  while(rx.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }
  const resx = ACKS.payAndRollResearchThrow(c, rx.project.id, { rng: () => 0.999 });
  ok('crossbreed breakthrough → 3 unexpected abilities (1d20), GM-resolved', resx.succeeded && rx.project.kindResult.breakthrough.abilityCount === 3 && rx.project.kindResult.breakthrough.abilityDie === '1d20' && rx.project.kindResult.breakthrough.gmResolve === true);
}

// =============================================================================
section('AD-M4 — a failed experiment triggers a mishap on top of the total loss (RR p.409)');
// =============================================================================
{
  const { c, m } = mage({ level: 11, int: 16, gp: 100000 });
  const r = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2 }, experiment: { method: 'radical', advantages: ['haste'] } });
  while(r.project.status === 'in-progress'){ ACKS.processResearchForTurn(c, {}); }
  const res = ACKS.payAndRollResearchThrow(c, r.project.id, { rng: () => 0.0 });   // nat 1 → auto-fail
  ok('the experiment fails', res.succeeded === false);
  ok('catastrophic mishap (radical), 1d10 row, assistants → major', res.mishap && res.mishap.tier === 'catastrophic' && res.mishap.roll >= 1 && res.mishap.roll <= 10 && res.mishap.assistantsTier === 'major');
  ok('the failure still forfeits all investment', res.lostGp > 0);
  ok('a magic-experiment-mishap event landed', c.eventLog.some(e => e.event.kind === 'magic-experiment-mishap'));
  ok('the project records the mishap', r.project.mishap && r.project.mishap.tier === 'catastrophic');
  // A non-experiment failure → no mishap.
  const { c: c2, m: m2 } = mage({ level: 11, gp: 100000 });
  const r2 = ACKS.startResearchProject(c2, { kind: 'spell-research', researcherCharacterId: m2.id, config: { spellLevel: 2 } });
  while(r2.project.status === 'in-progress'){ ACKS.processResearchForTurn(c2, {}); }
  const res2 = ACKS.payAndRollResearchThrow(c2, r2.project.id, { rng: () => 0.0 });
  ok('a non-experiment failure → no mishap', res2.succeeded === false && !res2.mishap);
}

// =============================================================================
section('AD-M4 — validation: advantage count capped by method; experiment needs a throw');
// =============================================================================
{
  const { c, m } = mage({ level: 11, gp: 100000 });
  const tooMany = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 1 }, experiment: { method: 'conventional', advantages: ['haste','insight'] } });
  ok('conventional + 2 advantages → too-many-advantages', tooMany.ok === false && tooMany.reason === 'too-many-advantages');
  const low = mage({ level: 5 });
  const radLow = ACKS.startResearchProject(low.c, { kind: 'spell-research', researcherCharacterId: low.m.id, config: { spellLevel: 1 }, experiment: { method: 'radical', advantages: ['haste'] } });
  ok('L5 + radical → experiment-level-too-low', radLow.ok === false && radLow.reason === 'experiment-level-too-low');
  const noThrow = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 1 }, commonSpell: true, experiment: { method: 'conventional', advantages: ['haste'] } });
  ok('a no-throw project + experiment → experiment-needs-throw', noThrow.ok === false && noThrow.reason === 'experiment-needs-throw');
}

// =============================================================================
section('commitTurn hook (the demo — a real month accrues research)');
// =============================================================================
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  function lcg(seed){ let s = seed >>> 0; return () => { s = (1103515245 * s + 12345) >>> 0; return s / 4294967296; }; }
  const rng = lcg(7);
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  const m = ACKS.blankCharacter({ id: 'chr-demo-mage', name: 'Test Magus', class: 'Mage', level: 9, abilities: { STR:9, INT:16, WIL:12, DEX:10, CON:10, CHA:11 } });
  m.coins = { pp:0, gp: 50000, ep:0, sp:0, cp:0 };
  demo.characters.push(m);
  const r = ACKS.startResearchProject(demo, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2, targetName: 'Knock' } });
  ok('project in-progress before the turn', r.project.status === 'in-progress');
  const p = ACKS.proposeMonthlyTurn(demo, { rng });
  ACKS.commitTurn(demo, p, { rng });
  ok('the project advanced to awaiting-throw on the real month (driven by the slot-56 day consumer)', r.project.status === 'awaiting-throw');
}

// =============================================================================
section('SR-1 — per-day accrual on the Day Clock (RR p.388 — ⌈C/R⌉ days)');
// =============================================================================
{
  // A solo L9 mage; an L2 spell-research is 2,000gp ÷ 600/day = ⌈4⌉ days.
  const c = ACKS.blankCampaign();
  const m = ACKS.blankCharacter({ id: 'chr-day-mage', name: 'Day Magus', class: 'Mage', level: 9, abilities: { STR:9, INT:16, WIL:12, DEX:10, CON:10, CHA:11 } });
  m.coins = { pp:0, gp: 200000, ep:0, sp:0, cp:0 };
  c.characters.push(m);
  const r = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2, targetName: 'Knock' } });
  const cost = r.project.researchCostGp;
  const rate = ACKS.totalResearchRate(c, r.project);
  const need = Math.ceil(cost / rate);
  ok('a research project starts in-progress, cost > 0, L9 rate = 600', r.project.status === 'in-progress' && cost > 0 && rate === 600);
  ok('the magic-research day consumer is registered at slot 56', ACKS.dayConsumersInOrder().some(x => x.name === 'magic-research' && x.order === 56));
  // Advance the Day Clock one day at a time; it must NOT fill until the ⌈C/R⌉th day.
  for(let i = 0; i < need - 1; i++) ACKS.tickDay(c, 1);
  ok('still in-progress after ⌈C/R⌉−1 advanced days', r.project.status === 'in-progress' && r.project.researchInvestedGp < cost);
  ACKS.tickDay(c, 1);
  ok('fills on the ⌈C/R⌉th day → awaiting-throw', r.project.status === 'awaiting-throw' && r.project.researchInvestedGp >= cost);
  // Idempotent: an awaiting-throw project proposes nothing — later ticks must not over-accrue.
  const investedAfter = r.project.researchInvestedGp;
  ACKS.tickDay(c, 1); ACKS.tickDay(c, 1);
  ok('idempotent — a filled project does not over-accrue on later days', r.project.researchInvestedGp === investedAfter && r.project.status === 'awaiting-throw');
}

// =============================================================================
section('SR-1 — processResearchForTurn({days}) direct math (default 30 preserved)');
// =============================================================================
{
  const c = ACKS.blankCampaign();
  const m = ACKS.blankCharacter({ id: 'chr-dir-mage', name: 'Direct Magus', class: 'Mage', level: 9, abilities: { STR:9, INT:16, WIL:12, DEX:10, CON:10, CHA:11 } });
  m.coins = { pp:0, gp: 200000, ep:0, sp:0, cp:0 };
  c.characters.push(m);
  const r = ACKS.startResearchProject(c, { kind: 'spell-research', researcherCharacterId: m.id, config: { spellLevel: 2, targetName: 'Knock' } });
  ACKS.processResearchForTurn(c, { days: 1 });
  ok('processResearchForTurn({days:1}) accrues exactly one day’s rate (600)', r.project.researchInvestedGp === Math.min(r.project.researchCostGp, 600));
  ACKS.processResearchForTurn(c, {});   // default 30 → fills the rest
  ok('processResearchForTurn({}) (default month) fills it → awaiting-throw', r.project.status === 'awaiting-throw');
}

// =============================================================================
section('Registration — prefix / entity-registry / field-schema / events / importer / no-migration');
// =============================================================================
{
  ok('rsp- prefix registered', ACKS.ID_PREFIXES.researchProject === 'rsp');
  ok('blankResearchProject id has the rsp- prefix', /^rsp-/.test(ACKS.blankResearchProject({}).id));
  ok('entity-registry has research-project', !!ACKS.entityKind('research-project'));
  ok('field-schema research-project ⊆ blankResearchProject (factory named)', (() => {
    const sc = ACKS.fieldSchemaFor('research-project'); if(!sc || sc.factory !== 'blankResearchProject') return false;
    const keys = new Set(Object.keys(ACKS.blankResearchProject({})));
    return sc.fields.filter(f => f.type !== 'computed').every(f => keys.has(f.name));
  })());
  const evKinds = ['magic-research-started','magic-research-progress','magic-research-completed','magic-research-failed','magic-item-created','construct-manufactured','crossbreed-created','necromancy-performed','ritual-learned','ritual-cast'];
  evKinds.forEach(k => {
    ok('EVENT_KINDS has ' + k, ACKS.EVENT_KINDS.indexOf(k) >= 0);
    ok('EVENT_SCHEMAS has ' + k, !!ACKS.EVENT_SCHEMAS[k]);
    ok(k + ' is wizard-opt-out (engine-emitted)', ACKS.EVENT_WIZARD_OPTOUT.has(k));
  });
  // No new house rule (RAW core, dormant — D10/§8).
  const reg = ACKS.HOUSERULES_REGISTRY || [];
  ok('no magic-research house rule registered', !reg.some(r => /^(magic-research|research-project|magic-experimentation)/i.test((r && (r.id || r.key)) || '')));
  // Fresh campaign has the researchProjects[] (lazy-defaulted) + migrate injects nothing.
  const c = ACKS.blankCampaign();
  ok('blankCampaign.researchProjects is []', Array.isArray(c.researchProjects) && c.researchProjects.length === 0);
  const before = JSON.stringify(c.researchProjects);
  if(typeof ACKS.migrateCampaign === 'function') ACKS.migrateCampaign(c);
  ok('migrateCampaign injects no research content', JSON.stringify(c.researchProjects) === before);
}

// =============================================================================
console.log('\n=============================================');
console.log('magic-research.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
