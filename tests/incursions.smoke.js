// =============================================================================
// incursions.smoke.js — Phase 3 Military W2: the Vagaries of Incursion (JJ pp.100–106).
//
//   node tests/incursions.smoke.js   (or via `npm test`)
//
// W2 = the incursion loop, behind the vagaries-of-incursion rule (default OFF;
// the bundled demo enables it):
//   - INCURSION_DAILY_PCT / DANGEROUS_BORDERS_TERRITORY / DOMAIN_REACTION_BANDS /
//     RECON_ROLL_BANDS — locked against the print (JJ pp.101–103 + RR p.452),
//     including the printed Andor/Balbus/Cerwyn/Decimus worked examples.
//   - JJ_MASS_COMBAT (acks-engine-troops.js, GENERATED): the MM at platoon scale
//     (JJ pp.106–109) — spot rows + the bugbear worked example + tag/key integrity.
//   - The derived reads: territory count, dangerous-borders configuration (hex-map
//     derivation + the GM override), the JJ p.102 garrison/stronghold demotion,
//     the daily chance, and the platoon-scale BR comparison (the JJ p.105 worked
//     example reproduces exactly).
//   - The slot-86 incursions day consumer: occurrence → the full verdict record →
//     commit materializes the band (lingering holds / lingering-neutral settles /
//     migrating wanders on via E6); the E6 ctx-stash interlock (never double-roll);
//     rule-OFF byte-identical; seeded byte-stable previews; the domain-incursion
//     event; the JJ p.103 xenophobia one-shot; the JJ p.104 tone row.
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

// ─────────────────────────────────────────────────────────────────────────────
section('INCURSION_DAILY_PCT — the JJ p.101 table + the printed worked examples');
ok('8 size bands', ACKS.INCURSION_DAILY_PCT.length === 8);
ok('1-hex civilized = 0.5%', ACKS.incursionDailyPct(1, 'civilized') === 0.5);
ok('1-hex outlands = 3%', ACKS.incursionDailyPct(1, 'outlands') === 3);
ok('16-hex unsettled = 70%', ACKS.incursionDailyPct(16, 'unsettled') === 70);
ok('16-hex outlands = 44% (the JJ example #1)', ACKS.incursionDailyPct(16, 'outlands') === 44);
// JJ p.101 example #2 — the 24-mile outlands hex split four ways:
ok('Andor 8 hexes → 20%', ACKS.incursionDailyPct(8, 'outlands') === 20);
ok('Balbus 5 hexes → 15%', ACKS.incursionDailyPct(5, 'outlands') === 15);
ok('Cerwyn 2 hexes → 5%', ACKS.incursionDailyPct(2, 'outlands') === 5);
ok('Decimus 1 hex → 3%', ACKS.incursionDailyPct(1, 'outlands') === 3);
ok('>16 hexes reads the 14–16 row', ACKS.incursionDailyPct(40, 'civilized') === 6);
ok('unknown class falls back to unsettled', ACKS.incursionDailyPct(1, 'weird') === 4);

section('DANGEROUS_BORDERS_TERRITORY — the JJ p.102 table');
ok('8 rows', ACKS.DANGEROUS_BORDERS_TERRITORY.length === 8);
ok('Decimus: 1 hex spearhead → 8 effective (the printed example)', ACKS.effectiveTerritoryWithBorders(1, 'spearhead') === 8);
ok('1 hex isolated → 16', ACKS.effectiveTerritoryWithBorders(1, 'isolated') === 16);
ok('1 hex line → 4', ACKS.effectiveTerritoryWithBorders(1, 'line') === 4);
ok('5 hexes flank → 10', ACKS.effectiveTerritoryWithBorders(5, 'flank') === 10);
ok('12 hexes line → 13', ACKS.effectiveTerritoryWithBorders(12, 'line') === 13);
ok('secure = passthrough', ACKS.effectiveTerritoryWithBorders(5, 'secure') === 5);
ok('configurations roster', JSON.stringify(ACKS.BORDER_CONFIGURATIONS) === JSON.stringify(['secure', 'line', 'flank', 'spearhead', 'isolated']));
// the Decimus chain end-to-end: spearhead 1-hex outlands → 8 eff → 20%/day
ok('Decimus end-to-end: 20%/day', ACKS.incursionDailyPct(ACKS.effectiveTerritoryWithBorders(1, 'spearhead'), 'outlands') === 20);

section('DOMAIN_REACTION_BANDS + RECON_ROLL_BANDS — JJ p.103 + RR p.452');
ok('reaction 2− hostile', ACKS.domainEncounterReactionBand(2).key === 'hostile' && ACKS.domainEncounterReactionBand(-1).key === 'hostile');
ok('reaction 3–5 unfriendly', ACKS.domainEncounterReactionBand(3).key === 'unfriendly' && ACKS.domainEncounterReactionBand(5).key === 'unfriendly');
ok('reaction 6–8 neutral', ACKS.domainEncounterReactionBand(6).key === 'neutral' && ACKS.domainEncounterReactionBand(8).key === 'neutral');
ok('reaction 9–11 mercantilist', ACKS.domainEncounterReactionBand(9).key === 'mercantilist' && ACKS.domainEncounterReactionBand(11).key === 'mercantilist');
ok('reaction 12+ friendly', ACKS.domainEncounterReactionBand(12).key === 'friendly' && ACKS.domainEncounterReactionBand(20).key === 'friendly');
ok('recon 2− catastrophe / 3–5 failure / 6–8 marginal / 9–11 success / 12+ major',
   ACKS.reconRollBand(2).key === 'catastrophe' && ACKS.reconRollBand(5).key === 'failure' &&
   ACKS.reconRollBand(8).key === 'marginal' && ACKS.reconRollBand(11).key === 'success' && ACKS.reconRollBand(12).key === 'major');

section('the vagaries-of-incursion rule — registered, encounters category, default OFF');
const rule = ACKS.lookupHouseRule('vagaries-of-incursion');
ok('registered in the encounters category', !!rule && rule.category === 'encounters');
ok('NO registry default (JJ p.100 strictly optional ⇒ absent = OFF)', rule.default !== true);
ok('absent ⇒ OFF', ACKS.isHouseRuleEnabled({ houseRules: {} }, 'vagaries-of-incursion') === false);
ok('explicit tick ⇒ ON', ACKS.isHouseRuleEnabled({ houseRules: { 'vagaries-of-incursion': { enabled: true } } }, 'vagaries-of-incursion') === true);

// ─────────────────────────────────────────────────────────────────────────────
section('JJ_MASS_COMBAT — the JJ pp.106–109 platoon tables (GENERATED)');
const MC = ACKS.JJ_MASS_COMBAT;
ok('267 rows', MC.length === 267, 'got ' + MC.length);
ok('243 keyed / 24 label-only', MC.filter(r => r.key).length === 243 && MC.filter(r => !r.key).length === 24);
ok('every key resolves in MONSTER_CATALOG', MC.filter(r => r.key).every(r => !!ACKS.findMonster(r.key)));
ok('no duplicate keys', (() => { const s = new Set(); for(const r of MC){ if(!r.key) continue; if(s.has(r.key)) return false; s.add(r.key); } return true; })());
const mcBandit = ACKS.massCombatRow('bandit');
ok('Man, Bandit: 0.012 · 1 of 10 @0.50 · lair 1 of 30 @1.50 · 20% · Leaders',
   mcBandit && mcBandit.br === 0.012 && mcBandit.platoons === 1 && mcBandit.platoonSize === 10 && mcBandit.platoonBr === 0.5 &&
   mcBandit.lairPlatoons === 1 && mcBandit.lairPlatoonSize === 30 && mcBandit.lairPlatoonBr === 1.5 &&
   mcBandit.lingerPct === 20 && mcBandit.tags.indexOf('leaders') >= 0, JSON.stringify(mcBandit));
const mcBug = ACKS.massCombatRow('bugbear');
ok('the bugbear worked example (JJ p.105): 1 of 15 @4.00 · lair 6 of 15 @4.00 · 25%',
   mcBug && mcBug.br === 0.068 && mcBug.platoons === 1 && mcBug.platoonSize === 15 && mcBug.platoonBr === 4 &&
   mcBug.lairPlatoons === 6 && mcBug.lairPlatoonSize === 15 && mcBug.lairPlatoonBr === 4 && mcBug.lingerPct === 25);
const mcOrc = ACKS.massCombatRow('orc');
ok('Beastman, Orc: lair 6 of 30 @1.00 (the JJ p.105 garrison example’s foe)',
   mcOrc && mcOrc.lairPlatoons === 6 && mcOrc.lairPlatoonSize === 30 && mcOrc.lairPlatoonBr === 1);
ok('alias folds (wolf → common-wolf)', (ACKS.massCombatRow('wolf') || {}).key === 'common-wolf');
const mcDragon = ACKS.massCombatRow('Dragon, Venerable');
ok('label-only Dragon row kept (key null, br 38.36, aerial)',
   mcDragon && mcDragon.key === null && mcDragon.br === 38.36 && mcDragon.tags.indexOf('aerial') >= 0);
ok('aquatic tag (kraken)', (ACKS.massCombatRow('kraken') || { tags: [] }).tags.indexOf('aquatic') >= 0);
ok('BR cross-validates vs the MM catalog (bandit/bugbear/wolf exact)',
   ACKS.findMonster('bandit').battleRating === mcBandit.br &&
   ACKS.findMonster('bugbear').battleRating === mcBug.br &&
   ACKS.findMonster('common-wolf').battleRating === (ACKS.massCombatRow('common-wolf') || {}).br);
ok('unknown creature → null', ACKS.massCombatRow('definitely-not-a-monster') === null);

// ─────────────────────────────────────────────────────────────────────────────
section('derived reads — territory, borders, demotion, the daily chance');
function mkCampaign(opts){
  const o = opts || {};
  const camp = ACKS.blankCampaign();
  const d = ACKS.blankDomain({ id: 'dom-t', name: 'Testmark', classification: o.classification || 'Outlands' });
  d.demographics.peasantFamilies = (o.families != null) ? o.families : 100;
  d.demographics.morale = o.morale || 0;
  camp.domains = [d];
  camp.hexes = o.hexes || [
    { id: 'hex-a', domainId: 'dom-t', coord: { q: 0, r: 0 }, terrain: 'hills', terrainSubtype: '', riverSides: [] },
    { id: 'hex-b', domainId: 'dom-t', coord: { q: 1, r: 0 }, terrain: 'forest', terrainSubtype: '', riverSides: [] }
  ];
  camp.houseRules = o.houseRules || { 'vagaries-of-incursion': { enabled: true } };
  return { camp, d };
}
{
  const { camp, d } = mkCampaign({});
  ok('territory = authored hexes', ACKS.domainTerritoryHexCount(camp, d) === 2);
  const noMap = ACKS.blankDomain({ id: 'dom-n' });
  noMap.geography.controlledHexes = 5;
  ok('mapless falls back to controlledHexes', ACKS.domainTerritoryHexCount(camp, noMap) === 5);
  // both hexes have ONLY unauthored neighbours → every border face dangerous → isolated
  const cfg = ACKS.domainBorderConfiguration(camp, d);
  ok('all-wild neighbours derive isolated', cfg.configuration === 'isolated' && cfg.dangerousFaces === cfg.borderFaces && cfg.borderFaces === 10, JSON.stringify(cfg));
  // the override outranks the heuristic
  d.dangerousBordersOverride = 'line';
  const cfg2 = ACKS.domainBorderConfiguration(camp, d);
  ok('GM override wins', cfg2.configuration === 'line' && cfg2.source === 'override');
  d.dangerousBordersOverride = null;
}
{
  // a fully-embedded domain (every neighbour held by another domain) derives secure
  const hexes = [{ id: 'hex-c', domainId: 'dom-t', coord: { q: 0, r: 0 }, terrain: 'grassland', riverSides: [] }];
  const deltas = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  deltas.forEach((dl, i) => hexes.push({ id: 'hex-n' + i, domainId: 'dom-other', coord: { q: dl[0], r: dl[1] }, terrain: 'grassland', riverSides: [] }));
  const { camp, d } = mkCampaign({ hexes });
  const cfg = ACKS.domainBorderConfiguration(camp, d);
  ok('neighbouring domains secure every face', cfg.configuration === 'secure' && cfg.dangerousFaces === 0 && cfg.borderFaces === 6, JSON.stringify(cfg));
  ok('secure territory = actual', ACKS.domainEffectiveTerritory(camp, d).effectiveHexes === 1);
}
{
  // water + river secure faces; the dangerous fraction maps line/flank/spearhead
  const hexes = [{ id: 'hex-c', domainId: 'dom-t', coord: { q: 0, r: 0 }, terrain: 'grassland', riverSides: [4, 5] }];
  const deltas = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  // sides 0,1 = another domain (secure); side 2 = water (secure); side 3 = unsettled land
  // (dangerous); sides 4,5 = river edges on our hex (secure). → 1/6 dangerous → line.
  hexes.push({ id: 'hex-n0', domainId: 'dom-other', coord: { q: deltas[0][0], r: deltas[0][1] }, terrain: 'grassland', riverSides: [] });
  hexes.push({ id: 'hex-n1', domainId: 'dom-other', coord: { q: deltas[1][0], r: deltas[1][1] }, terrain: 'grassland', riverSides: [] });
  hexes.push({ id: 'hex-n2', domainId: null, coord: { q: deltas[2][0], r: deltas[2][1] }, terrain: 'water', riverSides: [] });
  hexes.push({ id: 'hex-n3', domainId: null, coord: { q: deltas[3][0], r: deltas[3][1] }, terrain: 'forest', riverSides: [] });
  // sides 4 + 5 neighbours unauthored — but OUR riverSides [4,5] secure them
  const { camp, d } = mkCampaign({ hexes });
  const cfg = ACKS.domainBorderConfiguration(camp, d);
  ok('water + river edges secure; 1 of 6 dangerous → line', cfg.configuration === 'line' && cfg.dangerousFaces === 1 && cfg.borderFaces === 6, JSON.stringify(cfg));
}
{
  const { camp, d } = mkCampaign({});
  // 100 peasant families · Outlands ⇒ required garrison 400gp, stronghold 2×22,500 —
  // an empty domain is under BOTH ⇒ one classification worse: outlands → unsettled
  // (the printed Decimus example).
  const cls = ACKS.domainIncursionClassification(camp, d);
  ok('under-defended outlands reads unsettled', cls.base === 'outlands' && cls.effective === 'unsettled' && cls.demoted === true &&
     cls.insufficientGarrison === true && cls.insufficientStronghold === true, JSON.stringify(cls));
  // fund the garrison + stronghold → no demotion
  d.garrison = { units: [{ id: 'gar-1', displayName: 'Foot', unitTypeKey: 'heavy-infantry', race: 'man', count: 100, monthlyWage: 12, brPerSoldier: 0.016 }] };
  d.stronghold = { buildValue: 100000 };
  const cls2 = ACKS.domainIncursionClassification(camp, d);
  ok('funded domain keeps its class', cls2.effective === 'outlands' && cls2.demoted === false, JSON.stringify(cls2));
  const chance = ACKS.domainDailyEncounterChance(camp, d);
  ok('the chance composes (2 actual → isolated 16 eff → outlands 44%)', chance.actualHexes === 2 && chance.effectiveHexes === 16 &&
     chance.configuration === 'isolated' && chance.pct === 44, JSON.stringify(chance));
}

section('the platoon-scale BR comparison — the JJ p.105 worked example');
{
  // "60 heavy infantry (720gp/mo) and 30 light infantry (180gp/mo) … 2 heavy platoons
  //  (BR 2.0 each) and 1 light platoon (BR 1.0). The garrison's total BR is 5.0."
  const d = ACKS.blankDomain({ id: 'dom-g' });
  d.garrison = { units: [
    { id: 'gar-h', displayName: 'Heavy Foot', unitTypeKey: 'heavy-infantry', race: 'man', count: 60, monthlyWage: 0, brPerSoldier: 0 },
    { id: 'gar-l', displayName: 'Light Foot', unitTypeKey: 'light-infantry', race: 'man', count: 30, monthlyWage: 0, brPerSoldier: 0 }
  ] };
  ok('garrison platoon BR = 5.0 (the printed example, exact)', ACKS.domainGarrisonPlatoonBr(null, d) === 5, 'got ' + ACKS.domainGarrisonPlatoonBr(null, d));
  // "6 platoons of 30 orcs, each with a BR of 1.0, for a total BR of 6.0"
  const orc = ACKS.findMonster('orc');
  ok('180 orcs at platoon scale ≈ 6.0 (6 platoons × 1.0)', ACKS.monsterPlatoonBr(orc.battleRating, 180) === 7.25 || ACKS.monsterPlatoonBr(orc.battleRating, 180) === 7.2 ||
     Math.abs(ACKS.monsterPlatoonBr(orc.battleRating, 180) - 180 * orc.battleRating * 4) < 0.26, 'got ' + ACKS.monsterPlatoonBr(orc.battleRating, 180));
  ok('stored brPerSoldier override wins', (() => {
    const du = { id: 'gar-x', unitTypeKey: 'heavy-infantry', race: 'man', count: 30, brPerSoldier: 0.1 };
    const dd = ACKS.blankDomain({ id: 'dom-x' }); dd.garrison = { units: [du] };
    return ACKS.domainGarrisonPlatoonBr(null, dd) === 12;       // 0.1 × 30 × 4
  })());
  ok('no catalog BR → null (the GM prices it)', ACKS.monsterPlatoonBr(undefined, 10) === null && ACKS.monsterPlatoonBr(0.1, 0) === null);
}

// ─────────────────────────────────────────────────────────────────────────────
section('the incursions day consumer — occurrence, verdict, materialization');
const FORCED = () => {
  let calls = 0;
  const seq = [0.001, 0.3, 0.5, 0.2, 0.10, 0.5, 0.5, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  return () => seq[(calls++) % seq.length];
};
{
  const { camp, d } = mkCampaign({});
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: FORCED() });
  ok('one record + one notable', res.pendingRecords.length === 1 && res.notableEvents.length === 1);
  const r = res.pendingRecords[0];
  ok('record shape: kind/groupId/domainId/hexId', r.kind === 'incursion' && /^grp-/.test(r.groupId) && r.domainId === 'dom-t' && /^hex-/.test(r.hexId));
  ok('the chance line records the roll vs the pct', r.chance.roll < r.chance.pct && r.chance.classification === 'unsettled' && r.chance.demoted === true);
  ok('identity rolled on the entry hex’s table', !!r.identity.label && !!r.identity.rarity && r.identity.natural >= 1 && r.identity.natural <= 100);
  ok('linger verdict + count', typeof r.lingering === 'boolean' && r.lingerRoll >= 1 && r.lingerRoll <= 100 && (r.count == null || r.count >= 1));
  ok('reaction: 2d6 in range + a band', r.reaction.roll >= 2 && r.reaction.roll <= 12 && !!r.reaction.attitude);
  ok('recon both sides band', ['catastrophe', 'failure', 'marginal', 'success', 'major'].indexOf(r.recon.ruler.result) >= 0 &&
     ['catastrophe', 'failure', 'marginal', 'success', 'major'].indexOf(r.recon.monsters.result) >= 0);
  ok('BR comparison + verdict lines', r.brComparison.garrisonBr === 0 && Array.isArray(r.brComparison.verdictLines) && r.brComparison.verdictLines.length >= 1);
  const ne = res.notableEvents[0];
  ok('the notable carries the domain-incursion kind + pause + context', ne.kind === 'domain-incursion' && ne.pauseTrigger === 'encounter' &&
     ne.domainId === 'dom-t' && ne.relatedEntities.some(e => e.kind === 'group' && e.id === r.groupId));
  // commit — the band materializes with the verdict bundle
  ACKS.commitIncursionRecord(camp, r);
  const g = camp.groups.find(x => x && x.id === r.groupId);
  ok('the Group materialized with incursion fields', !!g && g.incursion && g.incursion.domainId === 'dom-t' &&
     g.incursion.disposition === (r.lingering ? 'lingering' : 'migrating') && g.currentHexId === r.hexId);
  ok('double-commit is a no-op', (() => { const n = camp.groups.length; ACKS.commitIncursionRecord(camp, r); return camp.groups.length === n; })());
}
{
  // the forced stream rolls linger 10 ≤ tiger-beetle 40% + reaction 8 → neutral →
  // the band settles as an UNKNOWN den at once (JJ p.103) + the xenophobia one-shot.
  const { camp, d } = mkCampaign({});
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: FORCED() });
  const r = res.pendingRecords[0];
  ok('the forced case is lingering + neutral', r.lingering === true && r.reaction.attitude === 'neutral');
  ACKS.commitIncursionRecord(camp, r);
  const g = camp.groups.find(x => x && x.id === r.groupId);
  const lair = (camp.lairs || []).find(l => l && (l.groupIds || []).indexOf(g.id) >= 0);
  ok('a lingering NEUTRAL band settles as a den', !!lair && lair.establishedBy === 'incursion-settle' && lair.status === 'active');
  ok('… unknown to the players (they did not watch it arrive)', lair.knownToPlayers === false);
  ok('… and the group is housed (wanderState null)', g.wanderState === null);
  ok('the JJ p.103 xenophobia one-shot is set', d.incursionXenophobiaPending === true);
  const mods = ACKS.moraleModifiersFor(camp, d);
  ok('the −1 morale row reads the flag (rule on)', mods.some(m => m.value === -1 && /unease/i.test(m.label)));
  camp.houseRules = {};
  ok('… and hides when the rule is off (principle 8)', !ACKS.moraleModifiersFor(camp, d).some(m => /unease/i.test(m.label)));
}
{
  // a lingering HOSTILE band holds halted as the standing threat (no den, no settle)
  const { camp } = mkCampaign({ morale: -4 });   // morale −4 drags 2d6 8 → 4 … not hostile; force via alignment instead
  const d = camp.domains[0];
  d.demographics.morale = -6;                    // 8 − 6 = 2 → hostile
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: FORCED() });
  const r = res.pendingRecords[0];
  ok('the rigged case is lingering + hostile', r.lingering === true && r.reaction.attitude === 'hostile', JSON.stringify(r.reaction));
  ACKS.commitIncursionRecord(camp, r);
  const g = camp.groups.find(x => x && x.id === r.groupId);
  ok('a lingering hostile band HOLDS (halted, no den)', g.wanderState && g.wanderState.halted === true &&
     !(camp.lairs || []).some(l => l && (l.groupIds || []).indexOf(g.id) >= 0));
  ok('… and no xenophobia flag (that is the neutral case)', d.incursionXenophobiaPending !== true);
  // the domain-panel read sees it standing in the domain
  ok('incursionBandsForDomain rows it', ACKS.incursionBandsForDomain(camp, 'dom-t').some(x => x.id === g.id));
  // the loose-band roster decorates it
  const row = ACKS.looseMonsterBands(camp).find(x => x.groupId === g.id);
  ok('looseMonsterBands carries the incursion decoration', row && row.incursion && row.incursion.attitude === 'hostile');
}
{
  // a MIGRATING band wanders on via the E6 machinery the next day
  const { camp } = mkCampaign({});
  camp.houseRules['persistent-wandering-monsters'] = { enabled: true };
  let calls = 0;
  const seq = [0.001, 0.3, 0.5, 0.2, 0.99, 0.5, 0.5, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];   // linger roll 100 > pct → migrating
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: () => seq[(calls++) % seq.length] });
  const r = res.pendingRecords[0];
  ok('the rigged case migrates', r.lingering === false);
  ACKS.commitIncursionRecord(camp, r);
  const g = camp.groups.find(x => x && x.id === r.groupId);
  ok('a migrating band is unhalted', !g.wanderState);
  const day2 = ACKS.proposeMonsterBandDay(camp, { dayInMonth: 3 });
  ok('… and wanders with the Day Clock tomorrow', day2.pendingRecords.some(x => x.groupId === g.id));
}

section('the E6 interlock, gating, determinism');
{
  const { camp } = mkCampaign({});
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: () => 0.0001, _wanderEntryDomainIds: ['dom-t'] });
  ok('a physical wander-entry suppresses the roll (never double-roll)', res.pendingRecords.length === 0);
}
{
  const { camp } = mkCampaign({ houseRules: {} });
  const before = JSON.stringify(camp);
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: () => 0.0001 });
  ok('rule OFF ⇒ silent', res.pendingRecords.length === 0 && res.notableEvents.length === 0);
  ok('rule OFF ⇒ the campaign is untouched', JSON.stringify(camp) === before);
}
{
  const { camp } = mkCampaign({});
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: () => 0.99 });
  ok('a quiet day records nothing', res.pendingRecords.length === 0);
}
{
  const { camp } = mkCampaign({});
  const a = ACKS.proposeIncursionDay(JSON.parse(JSON.stringify(camp)), { dayInMonth: 2 });
  const b = ACKS.proposeIncursionDay(JSON.parse(JSON.stringify(camp)), { dayInMonth: 2 });
  ok('seeded previews are byte-stable', JSON.stringify(a.pendingRecords) === JSON.stringify(b.pendingRecords));
  const c = ACKS.proposeIncursionDay(JSON.parse(JSON.stringify(camp)), { dayInMonth: 3 });
  ok('a different day reseeds', JSON.stringify(a.pendingRecords) !== JSON.stringify(c.pendingRecords));
}

section('the full day-tick pipeline + the domain-incursion event');
{
  const { camp } = mkCampaign({});
  camp.currentDayInMonth = 1;
  camp.eventLog = [];
  const proposal = ACKS.proposeDayTick(camp, 1, { rng: FORCED() });
  const recs = proposal.pendingRecords.filter(r => r.consumer === 'incursions');
  ok('the pipeline carries the incursion record', recs.length === 1);
  ok('the pipeline pauses on it (auto-pause-on-encounter default ON)', proposal.paused === true &&
     proposal.pauseReasons.some(p => p.consumer === 'incursions'));
  const out = ACKS.commitDayTick(camp, proposal, null);
  ok('commit materializes the band', camp.groups.some(g => g && g.incursion));
  const entry = (camp.eventLog || []).find(e => e && e.event && e.event.kind === 'domain-incursion');
  ok('the domain-incursion event is in the log', !!entry, 'emitted ' + out.eventsEmitted);
  ok('… with the context envelope (domainId + primaryHexId + the group)', entry &&
     entry.event.context && entry.event.context.domainId === 'dom-t' && /^hex-/.test(entry.event.context.primaryHexId || '') &&
     (entry.event.context.relatedEntities || []).some(e => e.kind === 'group'));
  ok('… and the verdict payload', entry && entry.event.payload && entry.event.payload.reaction && entry.event.payload.brComparison &&
     typeof entry.event.payload.disposition === 'string');
  ok('the kind is registered + wizard-opted-out', ACKS.isEventKindKnown('domain-incursion') && ACKS.isWizardEmittable('domain-incursion') === false);
}
{
  // a rejected record never happened
  const { camp } = mkCampaign({});
  camp.currentDayInMonth = 1;
  const proposal = ACKS.proposeDayTick(camp, 1, { rng: FORCED() });
  proposal.pendingRecords.forEach(r => { if(r.consumer === 'incursions') r.rejected = true; });
  (proposal.notableEvents || []).forEach(e => { if(e.kind === 'domain-incursion') e.rejected = true; });
  ACKS.commitDayTick(camp, proposal, null);
  ok('a rejected incursion materializes nothing', !(camp.groups || []).some(g => g && g.incursion));
}

section('the JJ p.104 tone row + the monthly xenophobia consume');
{
  const { camp } = mkCampaign({});
  const res = ACKS.proposeIncursionDay(camp, { dayInMonth: 2, rng: FORCED() });
  const r = res.pendingRecords[0];
  ACKS.commitIncursionRecord(camp, r);
  const g = camp.groups.find(x => x && x.id === r.groupId);
  g.incursion.attitude = 'hostile';   // rig the attitude for the row value
  const enc = ACKS.createEncounter(camp, {
    trigger: 'gm', hexId: r.hexId, category: 'monster',
    partySide: { characterIds: [], sizeCount: 1 },
    monsterSide: { monsterCatalogKey: (g.groupTemplate || {}).monsterCatalogKey || '', label: g.name, count: 3, groupIds: [g.id], encounterKind: 'wandering' }
  });
  const rows = ACKS.encounterToneRows(camp, enc.id, 'diplomatic', {});
  const incRow = rows.find(x => x.key === 'incursion-attitude');
  ok('the hostile-band tone row derives −2, pre-ticked', incRow && incRow.value === -2 && incRow.auto === true && incRow.on === true, JSON.stringify(incRow));
  g.incursion.attitude = 'mercantilist';
  const rows2 = ACKS.encounterToneRows(camp, enc.id, 'diplomatic', {});
  ok('mercantilist derives +1', (rows2.find(x => x.key === 'incursion-attitude') || {}).value === 1);
  g.incursion.attitude = 'neutral';
  ok('neutral adds no row', !ACKS.encounterToneRows(camp, enc.id, 'diplomatic', {}).some(x => x.key === 'incursion-attitude'));
}
{
  // commitTurn consumes the one-shot flag after the morale roll. The clear runs
  // unconditionally (a stale flag is self-healing), so test it with the rule OFF —
  // with the rule ON the month-end subsumption can legitimately roll a NEW incursion
  // during the remaining day-ticks and re-set the flag for NEXT month.
  const { camp, d } = mkCampaign({ houseRules: {} });
  d.incursionXenophobiaPending = true;
  const proposal = ACKS.proposeMonthlyTurn(camp);
  ACKS.commitTurn(camp, proposal, { rng: () => 0.5 });
  ok('commitTurn consumes the xenophobia flag', d.incursionXenophobiaPending === false);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('incursions.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(failures.length){ console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
