// =============================================================================
// arcane-domain.smoke.js — The Arcane Domain (Sanctums & Dungeons), AD-A + AD-D + AD-E.
// Phase 4 (RR pp.386–388). Covers the arcane economy core over hand-placed dungeons/lairs:
//   AD-A — totalAreaSqFt / dungeonMonsterXp / dungeonSubjugatedXp / dungeonArcanePowerPerDay,
//          PerMonth (the RAW 4,290 XP → 85/day → 2,550/month worked example) / dungeonAreaCount /
//          dungeonLairCapacity / dungeonIsFull + anchorLairToDungeon + the lair.dungeonId field.
//   AD-D — blankAttunement + attuneToDungeon (built-auto / conquered-throw / one-active invariant /
//          supersede / eligibility) + endAttunement + establishSovereignty (4 methods) + loseSovereignty.
//   AD-E — arcanePowerAvailable / spendArcanePower (vicinity-gated, atomic, monthly reset) + the 5
//          contract accessors + harvestDungeon + dungeonGarrisonMoralePenalty (RR p.387 worked example).
//   + the 6 event kinds registered (KINDS / SCHEMAS / wizard-opt-out) and the no-migration invariant.
// =============================================================================
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const clone = o => JSON.parse(JSON.stringify(o));

// A fixture: an arcane L9 mage at hex-1; a conquered dungeon at hex-1 with one level (120,000 sq ft),
// 24 areas; a lair of 429 orcs (catalog xp 10) anchored to it → 4,290 monster XP (the RAW example).
function fixture(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign();
  c.currentTurn = 5;
  c.characters = [ ACKS.blankCharacter({ id:'chr-q', name:'Quintus', class:'Mage', level: (opts.casterLevel != null ? opts.casterLevel : 9),
    currentHexId:'hex-1', abilities:{ STR:9, INT:16, WIL:12, DEX:10, CON:10, CHA: (opts.cha != null ? opts.cha : 13) } }) ];
  const dun = ACKS.blankDungeon({ id:'dun-1', name:'The Maze', hexId:'hex-1', origin: (opts.origin || 'conquered'),
    status:'known', areaSqFtPerLevel:[120000], areaCount: (opts.areaCount != null ? opts.areaCount : 24) });
  c.dungeons = [dun];
  const orcs = ACKS.blankGroup({ id:'grp-orcs', groupTemplate:{ monsterCatalogKey:'orc', creatureTypes:['beastman','humanoid'], hitDice:'1' },
    count: (opts.orcCount != null ? opts.orcCount : 429), casualties:0, currentHexId:'hex-1' });
  c.groups = [orcs];
  const lair = ACKS.blankLair({ id:'lai-orcs', name:'Orc Warren', hexId:'hex-1', status:'active', monsterCatalogKey:'orc', groupIds:['grp-orcs'] });
  c.lairs = [lair];
  if(opts.anchor !== false) ACKS.anchorLairToDungeon(c, 'lai-orcs', 'dun-1');
  return { c, dun, orcs, lair, caster: c.characters[0] };
}

// =============================================================================
section('AD-A — lair.dungeonId field (additive, default null) + anchoring');
// =============================================================================
const bareLair = ACKS.blankLair();
ok('blankLair.dungeonId defaults null (additive — every shipped lair)', bareLair.dungeonId === null);
ok('blankLair.areaIndex defaults null', bareLair.areaIndex === null);
ok('blankLair.depthRank defaults null', bareLair.depthRank === null);
{
  const { c, lair } = fixture({ anchor: false });
  ok('lair pre-anchor: dungeonId null', lair.dungeonId === null);
  const r = ACKS.anchorLairToDungeon(c, 'lai-orcs', 'dun-1');
  ok('anchorLairToDungeon ok', r.ok === true);
  ok('lair.dungeonId set', lair.dungeonId === 'dun-1');
  ok('areaIndex 0-based (first lair → 0)', lair.areaIndex === 0);
  ok('anchor a missing lair refused', ACKS.anchorLairToDungeon(c, 'nope', 'dun-1').ok === false);
  // a second lair anchors at ordinal 1
  c.lairs.push(ACKS.blankLair({ id:'lai-2', hexId:'hex-1', status:'active' }));
  ACKS.anchorLairToDungeon(c, 'lai-2', 'dun-1');
  ok('second lair areaIndex 1', c.lairs.find(l => l.id === 'lai-2').areaIndex === 1);
}

// =============================================================================
section('AD-A — arcane lookups + the RAW worked example (RR p.388: 4,290 XP → 85/day → 2,550/month)');
// =============================================================================
{
  const { c, dun } = fixture();
  ok('totalAreaSqFt 120000', ACKS.totalAreaSqFt(dun) === 120000);
  ok('dungeonMonsterXp 4290 (429 orcs × 10 xp)', ACKS.dungeonMonsterXp(c, dun) === 4290);
  ok('dungeonAreaCount 24 (explicit)', ACKS.dungeonAreaCount(dun) === 24);
  ok('dungeonLairCapacity ceil(24/3) = 8', ACKS.dungeonLairCapacity(c, dun) === 8);
  ok('dungeonIsFull false (1 lair < 8)', ACKS.dungeonIsFull(c, dun) === false);
  // No sovereignty yet → subjugated XP / arcane power are 0 (the base lags the population).
  ok('dungeonSubjugatedXp 0 before sovereignty', ACKS.dungeonSubjugatedXp(c, dun) === 0);
  ok('arcane perDay 0 before sovereignty', ACKS.dungeonArcanePowerPerDay(c, dun) === 0);
}
{
  // areaCount derive from area when unset: round(120000/5000) = 24 → cap ceil(24/3)=8.
  const dun = ACKS.blankDungeon({ areaSqFtPerLevel:[120000] });  // areaCount null
  ok('dungeonAreaCount derives round(area/5000) when unset', ACKS.dungeonAreaCount(dun) === 24);
}

// =============================================================================
section('AD-D — blankAttunement + attuneToDungeon (built / conquered / invariant / eligibility)');
// =============================================================================
ok('ID_PREFIXES.attunement === "att"', ACKS.ID_PREFIXES.attunement === 'att');
{
  const a0 = ACKS.blankAttunement();
  ok('blankAttunement id att- prefix', /^att-/.test(a0.id));
  ok('blankAttunement schemaVersion 2', a0.schemaVersion === 2);
  ok('blankAttunement default status active', a0.status === 'active');
  ok('blankAttunement default method built', a0.method === 'built');
}
{
  // eligibility: a non-arcane caster is refused; an arcane L8 is refused (needs L9+); gmOverride bypasses.
  const { c } = fixture({ casterLevel: 8 });
  ok('isArcaneCaster(Mage) true', ACKS.isArcaneCaster(c.characters[0]) === true);
  ok('canOperateDungeon false at L8', ACKS.canOperateDungeon(c.characters[0]) === false);
  const r8 = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ok('attune refused for arcane L8', r8.ok === false && r8.reason === 'caster-not-eligible');
  const rOver = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built', gmOverride: true });
  ok('attune ok with gmOverride', rOver.ok === true);
}
{
  // a fighter (non-arcane) is refused even at L9
  const { c } = fixture();
  c.characters[0].class = 'Fighter';
  ok('isArcaneCaster(Fighter) false', ACKS.isArcaneCaster(c.characters[0]) === false);
  ok('attune refused for non-arcane', ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' }).reason === 'caster-not-eligible');
}
{
  // built-auto: no throw, attunement created; derived attunedCharacterId resolves.
  const { c, dun } = fixture({ origin:'constructed' });
  const r = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ok('built attune ok, no throw', r.ok === true && r.throwResult == null);
  ok('campaign.attunements has 1', c.attunements.length === 1);
  ok('dungeonAttunedCharacterId === chr-q (derived)', ACKS.dungeonAttunedCharacterId(c, dun) === 'chr-q');
  ok('dungeonIsAttuned true', ACKS.dungeonIsAttuned(c, dun) === true);
  ok('dungeonLifecycleLabel "Attuned"', ACKS.dungeonLifecycleLabel(c, dun) === 'Attuned');
  // re-attune same mage → idempotent
  const r2 = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ok('re-attune same mage idempotent', r2.ok === true && r2.alreadyAttuned === true);
  ok('still only 1 attunement', c.attunements.filter(a => a.status === 'active').length === 1);
}
{
  // one-active-per-dungeon: a DIFFERENT mage is refused.
  const { c } = fixture({ origin:'constructed' });
  c.characters.push(ACKS.blankCharacter({ id:'chr-r', name:'Rival', class:'Mage', level:10, currentHexId:'hex-1' }));
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  const rr = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-r', method:'built' });
  ok('second mage refused (one active per dungeon)', rr.ok === false && rr.reason === 'already-attuned' && rr.byCharacterId === 'chr-q');
}
{
  // conquered-throw: the penalty is −1 per 5,000 sq ft (120,000 → −24). A guaranteed-low roll fails;
  // a guaranteed-high roll (natural 20) auto-succeeds. The penalty is recorded.
  const { c } = fixture();  // conquered origin, area 120000
  const fail = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'conquered', rng: () => 0.10 }); // roll ~3
  ok('conquered attune fails on a low roll', fail.ok === false && fail.reason === 'throw-failed');
  ok('penaltyPerArea −24 recorded (120000/5000)', fail.throwResult.penaltyPerArea === -24);
  ok('no attunement created on failure', (c.attunements || []).length === 0);
  const win = ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'conquered', rng: () => 0.999 }); // natural 20
  ok('conquered attune succeeds on natural 20', win.ok === true && win.throwResult.natural20 === true);
}
{
  // supersede: re-attuning a mage to a DIFFERENT dungeon ends the first (RR p.387 lifecycle b).
  const { c } = fixture({ origin:'constructed' });
  c.dungeons.push(ACKS.blankDungeon({ id:'dun-2', name:'Second', hexId:'hex-1', origin:'constructed' }));
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ACKS.attuneToDungeon(c, { dungeonId:'dun-2', mageCharacterId:'chr-q', method:'built' });
  ok('first attunement superseded', c.attunements.find(a => a.dungeonId === 'dun-1').status === 'superseded');
  ok('second attunement active', c.attunements.find(a => a.dungeonId === 'dun-2' && a.status === 'active') != null);
  // endAttunement
  const active = c.attunements.find(a => a.dungeonId === 'dun-2' && a.status === 'active');
  ACKS.endAttunement(c, active.id, 'relinquished', 'left');
  ok('endAttunement sets status + endedAtTurn', active.status === 'relinquished' && active.endedAtTurn === 5);
}

// =============================================================================
section('AD-D — establishSovereignty (4 methods) + one-sovereign invariant + loseSovereignty');
// =============================================================================
{
  // gm-fiat over all living dungeon groups.
  const { c, dun } = fixture();
  const r = ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'gm-fiat' });
  ok('gm-fiat sovereignty ok', r.ok === true);
  ok('sovereignCharacterId set', dun.sovereignCharacterId === 'chr-q');
  ok('subjugatedGroupIds includes the orcs', dun.subjugatedGroupIds.includes('grp-orcs'));
  ok('subjugatedXp 4290', ACKS.dungeonSubjugatedXp(c, dun) === 4290);
  // another caster refused (one sovereign per dungeon) unless displace
  c.characters.push(ACKS.blankCharacter({ id:'chr-r', class:'Mage', level:10 }));
  ok('second sovereign refused', ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-r', method:'gm-fiat' }).reason === 'another-sovereign');
  ok('displace allows takeover', ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-r', method:'gm-fiat', displace:true }).ok === true);
}
{
  // reaction 12+: a low roll fails, a high roll subjugates.
  const { c, dun } = fixture();
  const lo = ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'reaction', rng: () => 0.0, toneMod: 0 }); // 1+1+chaMod
  ok('reaction fails on snake-eyes', lo.ok === false && lo.reason === 'reaction-failed');
  ok('no sovereign set on failure', dun.sovereignCharacterId == null);
  const hi = ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'reaction', rng: () => 0.99, toneMod: 0 }); // 6+6+cha
  ok('reaction succeeds on boxcars (≥12)', hi.ok === true && hi.throwResult.total >= 12);
  ok('reaction subjugates the dungeon groups', dun.subjugatedGroupIds.includes('grp-orcs'));
}
{
  // recruit the chieftain → sovereignty over him + his tribe (groups he commands).
  const { c, dun } = fixture();
  c.characters.push(ACKS.blankCharacter({ id:'chr-chief', name:'Grosh', class:'Fighter', level:4 }));
  c.groups[0].commanderCharacterId = 'chr-chief';   // the orcs follow Grosh
  const r = ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'recruit', chieftainCharacterId:'chr-chief' });
  ok('recruit sovereignty ok', r.ok === true);
  ok('chieftain in subjugatedLeaderCharacterIds', dun.subjugatedLeaderCharacterIds.includes('chr-chief'));
  ok('his tribe (commanded group) subjugated', dun.subjugatedGroupIds.includes('grp-orcs'));
  ok('recruit with no chieftain refused', ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'recruit' }).reason === 'no-chieftain');
}
{
  // slay-strongest: subjugate the OTHER groups of HD below min(casterLevel, slainHd).
  const { c, dun } = fixture({ casterLevel: 9 });
  // add a 6-HD group (ogres) + the slain 8-HD group; orcs are HD 1.
  c.groups.push(ACKS.blankGroup({ id:'grp-ogres', groupTemplate:{ monsterCatalogKey:'ogre', hitDice:'4+1' }, count:3, casualties:0 }));
  c.lairs[0].groupIds.push('grp-ogres');
  const r = ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'slay', slainHd: 8, slainGroupId: 'grp-strongest' });
  ok('slay sovereignty ok', r.ok === true);
  ok('low-HD orcs (1) subjugated (< min(9,8)=8)', dun.subjugatedGroupIds.includes('grp-orcs'));
  // loseSovereignty clears the set
  const lr = ACKS.loseSovereignty(c, 'dun-1', { reason:'departed' });
  ok('loseSovereignty ok', lr.ok === true && dun.sovereignCharacterId == null && dun.subjugatedGroupIds.length === 0);
}

// =============================================================================
section('AD-E — arcane power (vicinity-gated, atomic spend, monthly reset)');
// =============================================================================
{
  const { c, dun, caster } = fixture({ origin:'constructed' });
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'gm-fiat' });
  ok('arcane perDay 85 (floor(0.02×4290))', ACKS.dungeonArcanePowerPerDay(c, dun) === 85);
  ok('arcane perMonth 2550 (85×30)', ACKS.dungeonArcanePowerPerMonth(c, dun) === 2550);
  ok('arcanePowerAvailable 2550 (in vicinity)', ACKS.arcanePowerAvailable(c, 'chr-q') === 2550);
  // spend is atomic
  const s = ACKS.spendArcanePower(c, 'chr-q', 600);
  ok('spend 600 ok', s.ok === true && s.spent === 600 && s.remaining === 1950);
  ok('arcanePowerSpentThisMonth 600', dun.arcanePowerSpentThisMonth === 600);
  ok('available after spend 1950', ACKS.arcanePowerAvailable(c, 'chr-q') === 1950);
  // over-spend → nothing moves
  const over = ACKS.spendArcanePower(c, 'chr-q', 99999);
  ok('over-spend refused, nothing moved', over.ok === false && over.spent === 0 && dun.arcanePowerSpentThisMonth === 600);
  // vicinity gate
  caster.currentHexId = 'hex-elsewhere';
  ok('available 0 out of vicinity', ACKS.arcanePowerAvailable(c, 'chr-q') === 0);
  ok('spend refused out of vicinity', ACKS.spendArcanePower(c, 'chr-q', 100).ok === false);
  caster.currentHexId = 'hex-1';
  // monthly reset
  const proc = ACKS.processArcaneForTurn(c, {});
  ok('processArcaneForTurn ran, 1 dungeon, 2550 gp', proc.ran && proc.dungeons === 1 && proc.totalGp === 2550);
  ok('spent reset to 0 by monthly turn', dun.arcanePowerSpentThisMonth === 0);
  ok('arcanePowerThisMonth cache = 2550', dun.arcanePowerThisMonth === 2550);
  ok('available back to 2550', ACKS.arcanePowerAvailable(c, 'chr-q') === 2550);
}
{
  // a dungeon with attunement but NO sovereignty yields nothing; and an unattuned-but-sovereign one too.
  const { c, dun } = fixture({ origin:'constructed' });
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ok('attuned-not-sovereign → available 0', ACKS.arcanePowerAvailable(c, 'chr-q') === 0);
  // sovereign but not attuned (clear the attunement)
  ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'gm-fiat' });
  ACKS.endAttunement(c, c.attunements[0].id, 'relinquished');
  ok('sovereign-not-attuned → available 0', ACKS.arcanePowerAvailable(c, 'chr-q') === 0);
}

// =============================================================================
section('AD-E — harvesting (RR p.387) + the renewable tension');
// =============================================================================
{
  const { c, dun, orcs, caster } = fixture({ origin:'constructed' });
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'gm-fiat' });
  ok('perMonth 2550 before harvest', ACKS.dungeonArcanePowerPerMonth(c, dun) === 2550);
  // cull requires sovereignty
  const h = ACKS.harvestDungeon(c, { dungeonId:'dun-1', casterId:'chr-q', groupId:'grp-orcs', quantity: 100, method:'cull' });
  ok('cull harvest ok', h.ok === true);
  ok('component value = 100 × 10 xp = 1000gp', h.componentValueGp === 1000);
  ok('100 orcs culled (casualties)', orcs.casualties === 100);
  ok('subjugatedXp drops to 3290 (329 × 10)', ACKS.dungeonSubjugatedXp(c, dun) === 3290);
  ok('perMonth drops to 1950 (renewable tension)', ACKS.dungeonArcanePowerPerMonth(c, dun) === 1950);
  ok('component item in caster inventory w/ specialComponent tag', (caster.inventory || []).some(i => i.specialComponent && i.specialComponent.valueGp === 1000));
  // cull without sovereignty refused
  const { c: c2 } = fixture({ origin:'constructed' });
  ok('cull without sovereignty refused', ACKS.harvestDungeon(c2, { dungeonId:'dun-1', casterId:'chr-q', groupId:'grp-orcs', quantity:10, method:'cull' }).reason === 'not-sovereign');
  // bounty debits the purse (no sovereignty needed)
  c2.characters[0].coins = { pp:0, gp:500, ep:0, sp:0, cp:0 };
  const b = ACKS.harvestDungeon(c2, { dungeonId:'dun-1', casterId:'chr-q', groupId:'grp-orcs', quantity:10, method:'bounty', bountyGp: 140 });
  ok('bounty harvest ok', b.ok === true && b.bountyGp === 140);
  ok('bounty debited the purse (500−140=360)', c2.characters[0].coins.gp === 360);
}

// =============================================================================
section('AD-E — the §5 contract accessors (2 real + 3 graceful stubs)');
// =============================================================================
{
  const { c } = fixture({ origin:'constructed' });
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  ACKS.establishSovereignty(c, { dungeonId:'dun-1', casterId:'chr-q', method:'gm-fiat' });
  ACKS.harvestDungeon(c, { dungeonId:'dun-1', casterId:'chr-q', groupId:'grp-orcs', quantity: 50, method:'cull', magicTypes:['evocation'] });
  const comps = ACKS.specialComponentsHeldBy(c, 'chr-q');
  ok('specialComponentsHeldBy reads the carry component', comps.length === 1 && comps[0].source === 'carry' && comps[0].valueGp === 500);
  ok('specialComponentsHeldBy filters by magicType', ACKS.specialComponentsHeldBy(c, 'chr-q', { magicType:'necromancy' }).length === 0);
  // graceful stubs: no facilities / assistants yet → empty/null (degrade, don't throw)
  ok('researchFacilityFor null when no sanctum (graceful)', ACKS.researchFacilityFor(c, 'chr-q', 'library') === null);
  ok('researchAssistantsFor [] when no henchmen/apprentices', ACKS.researchAssistantsFor(c, 'chr-q').length === 0);
  // a companion (henchman) shows as an assistant
  c.characters.push(ACKS.blankCharacter({ id:'chr-comp', name:'Companion', class:'Mage', level:2, socialTier:'henchman', liegeCharacterId:'chr-q' }));
  const assts = ACKS.researchAssistantsFor(c, 'chr-q');
  ok('a henchman companion is an assistant', assts.length === 1 && assts[0].role === 'companion' && assts[0].level === 2);
  // a sanctum facility shows up
  c.constructibles = [{ id:'cst-s', constructibleKind:'sanctum', ownerCharacterId:'chr-q',
    kindSpecific:{ builderCharacterId:'chr-q', researchFacilities:[{ kind:'library', valueGp:24000, sharedByCharacterIds:[] }] } }];
  const fac = ACKS.researchFacilityFor(c, 'chr-q', 'library');
  ok('researchFacilityFor finds the sanctum library', fac && fac.valueGp === 24000);
}

// =============================================================================
section('AD-E — peasants and dungeons (RR p.387 worked example: 4,290 XP / 1,100 families = 4 gp/family)');
// =============================================================================
{
  const c = ACKS.blankCampaign();
  c.currentTurn = 3;
  const dom = ACKS.blankDomain({ id:'dom-1', name:'Caster Hold' });
  dom.demographics = Object.assign(dom.demographics || {}, { peasantFamilies: 1100 });
  c.domains = [dom];
  const dun = ACKS.blankDungeon({ id:'dun-1', name:'Maze', hexId:'hex-1', domainId:'dom-1', status:'known', areaCount:24 });
  c.dungeons = [dun];
  c.groups = [ ACKS.blankGroup({ id:'grp-orcs', groupTemplate:{ monsterCatalogKey:'orc', hitDice:'1' }, count:429, casualties:0 }) ];
  c.lairs = [ ACKS.blankLair({ id:'lai', hexId:'hex-1', status:'active', dungeonId:'dun-1', groupIds:['grp-orcs'] }) ];
  ok('dungeonRequiredGarrisonGpf 4 (ceil(4290/1100))', ACKS.dungeonRequiredGarrisonGpf(c, dom) === 4);
  // pays 0 → −4; pays 3 → −1 (the RAW example); pays 4 → no row
  ok('penalty −4 when nothing paid', ACKS.dungeonGarrisonMoralePenalty(c, dom).value === -4);
  dom.dungeonGarrisonPaidGpf = 3;
  ok('penalty −1 when paying 3 of 4 (RR p.387 example)', ACKS.dungeonGarrisonMoralePenalty(c, dom).value === -1);
  dom.dungeonGarrisonPaidGpf = 4;
  ok('no penalty when fully paid', ACKS.dungeonGarrisonMoralePenalty(c, dom) === null);
  // self-garrisoned (monsters hired) → excluded from required (no shortfall) but −2 flat
  dom.dungeonGarrisonPaidGpf = 0;
  dun.monsterGarrisonHired = true;
  const pen = ACKS.dungeonGarrisonMoralePenalty(c, dom);
  ok('self-garrisoned → −2 (no shortfall, monsters excluded)', pen.value === -2);
  // it flows through moraleModifiersFor
  const mods = ACKS.moraleModifiersFor(c, dom);
  ok('garrison penalty row appears in moraleModifiersFor', mods.some(m => /dungeon/i.test(m.label) && m.value === -2));
}

// =============================================================================
section('Events — the 6 arcane kinds registered (KINDS / SCHEMAS / wizard-opt-out)');
// =============================================================================
{
  const kinds = ['dungeon-attuned','attunement-ended','sovereignty-established','sovereignty-lost','arcane-power-extracted','dungeon-harvested'];
  kinds.forEach(k => {
    ok('EVENT_KINDS has ' + k, ACKS.EVENT_KINDS.indexOf(k) >= 0);
    ok('EVENT_SCHEMAS has ' + k, !!ACKS.EVENT_SCHEMAS[k]);
    ok(k + ' is wizard-opt-out (engine-emitted)', ACKS.EVENT_WIZARD_OPTOUT.has(k));
  });
  // an arcane verb emits a well-formed eventLog entry
  const { c } = fixture({ origin:'constructed' });
  ACKS.attuneToDungeon(c, { dungeonId:'dun-1', mageCharacterId:'chr-q', method:'built' });
  const ev = c.eventLog[c.eventLog.length - 1];
  ok('attune emitted a dungeon-attuned event', ev && ev.event && ev.event.kind === 'dungeon-attuned');
  ok('event carries the context envelope (hex + caster + dungeon)', ev.event.context && ev.event.context.primaryHexId === 'hex-1'
     && ev.event.context.relatedEntities.some(r => r.kind === 'dungeon'));
}

// =============================================================================
section('No-migration invariant (the team-session enabler — RAW-default, dormant)');
// =============================================================================
{
  // No new house rule was registered (D10 — RAW core, default-on, dormant-until-used).
  const reg = ACKS.HOUSERULES_REGISTRY || [];
  ok('no arcane/sanctum/dungeon house rule registered', !reg.some(r => /sanctum|arcane|attun|dungeon/i.test((r && (r.id || r.key)) || '')));
  // a fresh campaign has the attunements collection (lazy-defaulted) + no dungeons.
  const c = ACKS.blankCampaign();
  ok('blankCampaign.attunements is []', Array.isArray(c.attunements) && c.attunements.length === 0);
  // every shipped template stays a migrate-no-op (dungeon arcane fields reserved-null; lair.dungeonId
  // additive; the arcane module adds nothing to migrateCampaign). Verified structurally: migrateCampaign
  // on a blank campaign does not inject dungeons/attunements content.
  const before = JSON.stringify({ d: c.dungeons || [], a: c.attunements });
  if(typeof ACKS.migrateCampaign === 'function') ACKS.migrateCampaign(c);
  ok('migrateCampaign injects no arcane content', JSON.stringify({ d: c.dungeons || [], a: c.attunements }) === before);
}

// =============================================================================
section('AD-B — apprenticeship relation + apr- prefix + registration');
// =============================================================================
{
  ok('apr- prefix registered', ACKS.ID_PREFIXES.apprenticeship === 'apr');
  const a = ACKS.blankApprenticeship({ apprenticeCharacterId:'chr-a', masterCharacterId:'chr-m', sanctumConstructibleId:'cst-s', enrolledAtTurn:1 });
  ok('blankApprenticeship id apr-', /^apr-/.test(a.id));
  ok('blankApprenticeship defaults: studying / yearsStudied 0', a.status === 'studying' && a.yearsStudied === 0);
  ok('blankCampaign.apprenticeships []', Array.isArray(ACKS.blankCampaign().apprenticeships));
  ok('entity registry has apprenticeship', (ACKS.ENTITY_KINDS_LIST || []).some(k => k.kind === 'apprenticeship'));
  ok('field schema has apprenticeship (⊆ factory)', !!ACKS.fieldSchemaFor('apprenticeship'));
}

// A sanctum fixture: an arcane L9 master at hex-1 + a completed sanctum Constructible (not yet established).
function sanctumFixture(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign(); c.currentTurn = (opts.turn != null ? opts.turn : 1);
  c.characters = [ ACKS.blankCharacter({ id:'chr-m', name:'Master', class:'Mage', level:9, currentHexId:'hex-1',
    abilities:{ STR:9, INT:16, WIL:12, DEX:10, CON:10, CHA:13 } }) ];
  const cst = ACKS.blankConstructible({ id:'cst-s', constructibleKind:'sanctum', constructibleSubtype:'sanctum',
    name:"Master's Sanctum", hexId:'hex-1', ownerCharacterId:'chr-m', buildValue:15000 });
  c.constructibles = [cst];
  return { c, cst, master: c.characters[0] };
}

// =============================================================================
section('AD-B — onSanctumConstructed: facilities scaffold + the RR p.386 attraction');
// =============================================================================
{
  const { c, cst } = sanctumFixture();
  // a constant rng → every d6 = 6: 1d6 companions = 6, 2d6 apprentices = 12 (the caps).
  const r = ACKS.onSanctumConstructed(c, cst, { rng: () => 0.99 });
  ok('onSanctumConstructed ok', r.ok === true && r.masterId === 'chr-m');
  ok('facilities scaffolded (empty array)', Array.isArray(cst.kindSpecific.researchFacilities) && cst.kindSpecific.researchFacilities.length === 0);
  ok('sanctumEstablished guard set + builderCharacterId', cst.kindSpecific.sanctumEstablished === true && cst.kindSpecific.builderCharacterId === 'chr-m');
  ok('drew 6 companions (1d6 @ max → cap)', r.attraction.companions.length === 6);
  ok('drew 12 apprentices (2d6 @ max → cap)', r.attraction.apprentices.length === 12);
  ok('companions are henchmen of the master', c.characters.filter(x => x.liegeCharacterId === 'chr-m' && x.socialTier === 'henchman').length === 6);
  ok('companions create henchmanships', (c.henchmanships || []).filter(h => h.patronCharacterId === 'chr-m' && h.status === 'active').length === 6);
  ok('apprenticeships created (12 studying)', c.apprenticeships.filter(a => a.masterCharacterId === 'chr-m' && a.status === 'studying').length === 12);
  ok('apprentices are L0, INT ≥ 9 (RR p.386)', c.apprenticeships.every(a => { const ch = c.characters.find(x => x.id === a.apprenticeCharacterId); return ch && ch.level === 0 && ch.abilities.INT >= 9; }));
  ok('sanctum-established event emitted', c.eventLog.some(e => e.event && e.event.kind === 'sanctum-established'));
  ok('apprentice-attracted event emitted', c.eventLog.some(e => e.event && e.event.kind === 'apprentice-attracted'));
  const before = c.characters.length;
  const r2 = ACKS.onSanctumConstructed(c, cst, { rng: () => 0.99 });
  ok('onSanctumConstructed idempotent (alreadyEstablished, no new chars)', r2.alreadyEstablished === true && c.characters.length === before);
}

// =============================================================================
section('AD-B — attraction min rolls + caps (6 companions / 12 apprentices)');
// =============================================================================
{
  const { c, cst } = sanctumFixture();
  const r = ACKS.onSanctumConstructed(c, cst, { rng: () => 0 });   // every d6 = 1 → 1 companion + 2 apprentices
  ok('min attraction: 1 companion + 2 apprentices', r.attraction.companions.length === 1 && r.attraction.apprentices.length === 2);
  ok('min companion is L1', c.characters.find(x => x.id === r.attraction.companions[0]).level === 1);
}
{
  const { c, cst } = sanctumFixture();
  ACKS.onSanctumConstructed(c, cst, { rng: () => 0.99 });          // fill to the caps
  ok('apprentice cap respected at 12', c.apprenticeships.filter(a => a.status === 'studying').length === 12);
  ok('companion cap respected at 6', c.characters.filter(x => x.sanctumCompanionSanctumId === 'cst-s').length === 6);
  const r = ACKS.attractToSanctum(c, { sanctumId:'cst-s', masterId:'chr-m', isInitial:false, rng: () => 0.99 });
  ok('a yearly attraction adds 0 when at the 12-cap', r.apprentices.length === 0 && c.apprenticeships.filter(a => a.status === 'studying').length === 12);
}

// =============================================================================
section('AD-B — processSanctumsForTurn: the yearly apprentice research throw (RR p.386)');
// =============================================================================
function progressionFixture(){
  const { c, cst } = sanctumFixture({ turn: 13 });
  cst.kindSpecific = { builderCharacterId:'chr-m', researchFacilities:[], apprenticeYears:0, lastApprenticeAttractionTurn:13, sanctumEstablished:true };  // no fresh attraction this turn
  c.characters.push(ACKS.blankCharacter({ id:'chr-app', name:'Pupil', level:0, socialTier:'independent', liegeCharacterId:'chr-m', currentHexId:'hex-1', abilities:{ STR:10, INT:13, WIL:10, DEX:10, CON:10, CHA:10 } }));
  c.apprenticeships = [ ACKS.blankApprenticeship({ id:'apr-1', apprenticeCharacterId:'chr-app', masterCharacterId:'chr-m', sanctumConstructibleId:'cst-s', enrolledAtTurn:1 }) ];
  return c;
}
{
  const c = progressionFixture();                                 // throw 20 (rng .99) + INT 13 (+1) = 21 ≥ 18 → advanced
  const out = ACKS.processSanctumsForTurn(c, { rng: () => 0.99 });
  ok('processSanctumsForTurn ran + advanced 1', out.ran === true && out.advanced === 1);
  const app = c.apprenticeships.find(a => a.id === 'apr-1');
  ok('apprenticeship status advanced', app.status === 'advanced' && app.yearsStudied === 1);
  const ch = c.characters.find(x => x.id === 'chr-app');
  ok('apprentice promoted to L1 henchman', ch.level === 1 && ch.socialTier === 'henchman' && ch.isArcaneCaster === true);
  ok('a henchmanship created on advance', (c.henchmanships || []).some(h => h.subjectCharacterId === 'chr-app' && h.patronCharacterId === 'chr-m'));
  ok('apprentice-advanced event emitted', c.eventLog.some(e => e.event && e.event.kind === 'apprentice-advanced'));
}
{
  const c = progressionFixture();                                 // throw natural 1 (rng 0) → unmodified 1–3 → discouraged
  const out = ACKS.processSanctumsForTurn(c, { rng: () => 0 });
  ok('apprentice discouraged (natural 1)', out.discouraged === 1);
  ok('apprenticeship status left', c.apprenticeships.find(a => a.id === 'apr-1').status === 'left');
  ok('apprentice departed', c.characters.find(x => x.id === 'chr-app').lifecycleState === 'departed');
  ok('apprentice-discouraged event emitted', c.eventLog.some(e => e.event && e.event.kind === 'apprentice-discouraged'));
}
{
  const c = progressionFixture();                                 // throw 10 (rng .47) + INT 13 (+1) = 11 < 18, not ≤3 → continues
  const out = ACKS.processSanctumsForTurn(c, { rng: () => 0.47 });
  ok('apprentice continues (11 < 18)', out.advanced === 0 && out.discouraged === 0);
  const app = c.apprenticeships.find(a => a.id === 'apr-1');
  ok('still studying, yearsStudied 1, throw recorded', app.status === 'studying' && app.yearsStudied === 1 && app.lastResearchThrow.result === 'continues');
}
{
  const { c, cst } = sanctumFixture({ turn: 6 });                 // only 5 months elapsed → no throw
  cst.kindSpecific = { builderCharacterId:'chr-m', researchFacilities:[], apprenticeYears:0, lastApprenticeAttractionTurn:6, sanctumEstablished:true };
  c.characters.push(ACKS.blankCharacter({ id:'chr-app', level:0, liegeCharacterId:'chr-m', abilities:{ INT:13 } }));
  c.apprenticeships = [ ACKS.blankApprenticeship({ id:'apr-1', apprenticeCharacterId:'chr-app', masterCharacterId:'chr-m', sanctumConstructibleId:'cst-s', enrolledAtTurn:1 }) ];
  const out = ACKS.processSanctumsForTurn(c, { rng: () => 0 });
  ok('no throw before a full year elapses', out.advanced === 0 && out.discouraged === 0 && c.apprenticeships[0].yearsStudied === 0);
}

// =============================================================================
section('AD-B — the §5 contract closed: researchAssistantsFor + researchFacilityFor + setSanctumFacility');
// =============================================================================
{
  const { c, cst } = sanctumFixture();
  ACKS.onSanctumConstructed(c, cst, { rng: () => 0 });            // 1 companion + 2 apprentices
  const assts = ACKS.researchAssistantsFor(c, 'chr-m');
  ok('researchAssistantsFor pool = 1 companion + 2 apprentices', assts.length === 3 && assts.filter(a => a.role === 'companion').length === 1 && assts.filter(a => a.role === 'apprentice').length === 2);
  ok('researchFacilityFor null before any facility is set', ACKS.researchFacilityFor(c, 'chr-m', 'library') === null);
  ok('setSanctumFacility ok (library 24000)', ACKS.setSanctumFacility(c, { constructibleId:'cst-s', kind:'library', valueGp:24000 }).ok === true);
  ok('researchFacilityFor now reads the library (24000)', (ACKS.researchFacilityFor(c, 'chr-m', 'library') || {}).valueGp === 24000);
  ok('setSanctumFacility refuses a bad kind', ACKS.setSanctumFacility(c, { constructibleId:'cst-s', kind:'bogus', valueGp:1 }).ok === false);
  ACKS.setSanctumFacility(c, { constructibleId:'cst-s', kind:'library', valueGp:30000 });   // raise, not duplicate
  ok('setSanctumFacility raises (no dup) → 30000', cst.kindSpecific.researchFacilities.filter(f => f.kind === 'library').length === 1 && ACKS.researchFacilityFor(c,'chr-m','library').valueGp === 30000);
}

// =============================================================================
section('AD-B — the construction-completed hook fires onSanctumConstructed (integration)');
// =============================================================================
{
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.characters = [ ACKS.blankCharacter({ id:'chr-m', name:'Master', class:'Mage', level:9, currentHexId:'hex-1', abilities:{ INT:16 } }) ];
  c.projects = [ { id:'prj-1', constructibleKind:'sanctum', constructibleSubtype:'sanctum', name:'Tower', siteHexId:'hex-1', ownerCharacterId:'chr-m', totalCost:15000, lifecycleState:'under-construction', laborRequired:100, laborInvested:100 } ];
  ACKS.applyEvent(c, ACKS.newEvent('construction-completed', { submittedBy:'engine', targetTurn:5, payload:{ projectId:'prj-1' } }));
  const cst = (c.constructibles || []).find(x => x.constructibleKind === 'sanctum');
  ok('construction-completed spawned a sanctum', !!cst);
  ok('the hook established it (facilities + flag)', !!(cst && cst.kindSpecific && cst.kindSpecific.sanctumEstablished === true));
  ok('the hook drew apprentices', c.apprenticeships.some(a => a.masterCharacterId === 'chr-m'));
}

// =============================================================================
section('AD-B — the 4 sanctum event kinds registered + lookups');
// =============================================================================
{
  ['sanctum-established','apprentice-attracted','apprentice-advanced','apprentice-discouraged'].forEach(k => {
    ok('EVENT_KINDS has ' + k, ACKS.EVENT_KINDS.indexOf(k) >= 0);
    ok('EVENT_SCHEMAS has ' + k, !!ACKS.EVENT_SCHEMAS[k]);
    ok(k + ' is wizard-opt-out', ACKS.EVENT_WIZARD_OPTOUT.has(k));
  });
  const { c, cst } = sanctumFixture();
  ACKS.onSanctumConstructed(c, cst, { rng: () => 0 });
  ok('sanctumsOwnedBy finds the sanctum', ACKS.sanctumsOwnedBy(c, 'chr-m').length === 1);
  const roster = ACKS.sanctumRoster(c, 'cst-s');
  ok('sanctumRoster: master + 1 companion + 2 apprentices', roster.masterId === 'chr-m' && roster.companions.length === 1 && roster.apprentices.length === 2);
}

// =============================================================================
console.log('\n=============================================');
console.log('arcane-domain.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
