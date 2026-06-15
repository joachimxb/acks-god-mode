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
ok('3 staple kinds available (spell-research/identify/item-creation)', JSON.stringify(ACKS.availableResearchKinds().sort()) === JSON.stringify(['identify','item-creation','spell-research']));
ok('high-tier kinds present but gated (construct-design unavailable)', ACKS.magicResearchKind('construct-design') && ACKS.magicResearchKind('construct-design').available === false);
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
  ok('a gated kind (construct-design) → not yet available', ACKS.isEligibleResearcher(c, m, 'construct-design', {}).reason === 'kind-not-yet-available');
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
  const res = ACKS.commitTurn(demo, p, { rng });
  ok('commitTurn returns researchResult.ran', res.researchResult && res.researchResult.ran === true);
  ok('the project advanced to awaiting-throw on the real month', r.project.status === 'awaiting-throw');
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
  const evKinds = ['magic-research-started','magic-research-progress','magic-research-completed','magic-research-failed','magic-item-created'];
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
