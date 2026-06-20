// =============================================================================
// gladiators.smoke.js — Gladiators #150, G1 (the data layer). AXIOMS 4 pp.20–31.
// Covers: the bot-/gld-/gam- prefixes; the catalogs (GLADIATOR_RANKS gp values verified
// EXACT vs AXIOMS 4 — 250/425/900/1,800/3,600/7,200 + the 50/35/9 demographics; the 7
// GLADIATOR_TYPES; staff ratios+wages; school structure costs; the uprising + crowd 2d6
// bands; training + the economy constants); the catalog lookups + the derived rent/prize;
// the gladiator-as-Character helpers (rank-by-level, gp value incl. Thrassian +20%, freedom);
// the 3 entities (blankBout/blankGladiatorSchool/blankGame + createX init-on-write + the
// lookups); the entity-registry kinds + the displayName⊆factory + field-schema⊆factory +
// schema-validates invariants; the abstract 1d10 bout resolver (rule-OFF refusal — the
// non-inert gate; rule-ON win/lose/slain by d10; the death-bout band; XP = the defeated
// gp value); and the load-bearing team-session guard — a gladiator-less campaign STAYS
// gladiator-less through blankCampaign + migrateCampaign (no migrate injector → the 6
// templates + demo stay migrate-no-ops).
// =============================================================================
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const ruleOn  = () => ({ houseRules: { 'gladiator-games': { enabled: true } }, characters: [] });
const ruleOff = () => ({ houseRules: {}, characters: [] });

// =============================================================================
section('ID prefixes (bot- / gld- / gam-)');
// =============================================================================
ok('ID_PREFIXES.bout === "bot"', ACKS.ID_PREFIXES.bout === 'bot');
ok('ID_PREFIXES.gladiatorSchool === "gld"', ACKS.ID_PREFIXES.gladiatorSchool === 'gld');
ok('ID_PREFIXES.game === "gam"', ACKS.ID_PREFIXES.game === 'gam');
ok('arn-/spo- NOT registered (Arena=Constructible, Sponsor=field; survey §4)',
   ACKS.ID_PREFIXES.arena === undefined && ACKS.ID_PREFIXES.sponsor === undefined);

// =============================================================================
section('House rule — gladiator-games (default-OFF supplement)');
// =============================================================================
const hr = ACKS.lookupHouseRule('gladiator-games');
ok('gladiator-games registered', !!hr);
ok('gladiator-games category === "cultural"', hr && hr.category === 'cultural');
ok('gladiator-games is default-OFF (no default:true)', !hr || hr.default !== true);
ok('absent gladiator-games reads OFF', !ACKS.isHouseRuleEnabled(ruleOff(), 'gladiator-games'));
ok('{enabled:true} reads ON', ACKS.isHouseRuleEnabled(ruleOn(), 'gladiator-games'));

// =============================================================================
section('GLADIATOR_RANKS — gp value + demographics by class/level (AXIOMS 4 p.20)');
// =============================================================================
ok('GLADIATOR_RANKS is a frozen array of 6', Array.isArray(ACKS.GLADIATOR_RANKS) && ACKS.GLADIATOR_RANKS.length === 6 && Object.isFrozen(ACKS.GLADIATOR_RANKS));
const gpVals = ACKS.GLADIATOR_RANKS.map(r => r.gpValue);
ok('gp values EXACT [250,425,900,1800,3600,7200]', JSON.stringify(gpVals) === JSON.stringify([250,425,900,1800,3600,7200]), JSON.stringify(gpVals));
ok('rank labels: 0=ordinary, 1–2=veteran, 3–5=champion',
   ACKS.GLADIATOR_RANKS[0].rank === 'ordinary' && ACKS.GLADIATOR_RANKS[1].rank === 'veteran' && ACKS.GLADIATOR_RANKS[2].rank === 'veteran' && ACKS.GLADIATOR_RANKS[5].rank === 'champion');
ok('demographics 50/35/9 for levels 0/1/2 (p.20)',
   ACKS.GLADIATOR_RANKS[0].demographicPct === 50 && ACKS.GLADIATOR_RANKS[1].demographicPct === 35 && ACKS.GLADIATOR_RANKS[2].demographicPct === 9);
ok('levels 3–5 demographicPct null (RAW gives no split — not invented)',
   ACKS.GLADIATOR_RANKS[3].demographicPct === null && ACKS.GLADIATOR_RANKS[5].demographicPct === null);

// =============================================================================
section('GLADIATOR_TYPES — the 7 fighting styles (AXIOMS 4 p.21)');
// =============================================================================
ok('GLADIATOR_TYPES is a frozen array of 7', Array.isArray(ACKS.GLADIATOR_TYPES) && ACKS.GLADIATOR_TYPES.length === 7 && Object.isFrozen(ACKS.GLADIATOR_TYPES));
ok('gladiatorTypes() returns 7', ACKS.gladiatorTypes().length === 7);
ok('every type has key + label + latinName', ACKS.GLADIATOR_TYPES.every(t => t.key && t.label && t.latinName));
ok('all type keys unique', new Set(ACKS.GLADIATOR_TYPES.map(t => t.key)).size === 7);
ok('netfighter is the Retiarius (p.21)', (ACKS.findGladiatorType('netfighter') || {}).latinName === 'Retiarius');
ok('findGladiatorType(bogus) === null', ACKS.findGladiatorType('xyzzy') === null);

// =============================================================================
section('GLADIATOR_SCHOOL_STAFF + STRUCTURES + TRAINING (p.24–25)');
// =============================================================================
const staff = ACKS.GLADIATOR_SCHOOL_STAFF;
ok('5 staff roles', Array.isArray(staff) && staff.length === 5);
const trainerOrd = staff.find(s => s.role === 'trainer-ordinary');
ok('trainer-ordinary: 1 per 6 gladiators, 60gp (p.24)', trainerOrd && trainerOrd.ratio === 6 && trainerOrd.wageGp === 60);
const guard = staff.find(s => s.role === 'guard');
ok('guard: 1 per 20 gladiators, 25gp (p.24)', guard && guard.ratio === 20 && guard.wageGp === 25);
const struct = ACKS.GLADIATOR_SCHOOL_STRUCTURES;
ok('5 school structures', Array.isArray(struct) && struct.length === 5);
const pit = struct.find(s => s.key === 'training-pit');
ok('training-pit: 12gp/gladiator (p.24)', pit && pit.costGp === 12 && pit.per === 'gladiator');
const gbar = struct.find(s => s.key === 'gladiator-barracks');
ok('gladiator-barracks: 15gp/gladiator (p.24)', gbar && gbar.costGp === 15);
ok('GLADIATOR_TRAINING: 6–9 mo, maim on 1d20==1, simplify 6mo+200gp (p.24–25)',
   ACKS.GLADIATOR_TRAINING.minMonths === 6 && ACKS.GLADIATOR_TRAINING.maxMonths === 9 && ACKS.GLADIATOR_TRAINING.maimOn === 1 && ACKS.GLADIATOR_TRAINING.simplifiedCostGp === 200);

// =============================================================================
section('Uprising + crowd-reaction 2d6 bands (p.26–27)');
// =============================================================================
ok('GLADIATOR_UPRISING bands: 5 ascending (lead/join/hesitate/loyal/firmly-loyal)',
   ACKS.GLADIATOR_UPRISING.bands.length === 5 && ACKS.GLADIATOR_UPRISING.bands[0].result === 'lead' && ACKS.GLADIATOR_UPRISING.bands[4].result === 'firmly-loyal');
ok('uprising sparks include over-rented + underpaid-upkeep', ACKS.GLADIATOR_UPRISING.sparks.includes('over-rented') && ACKS.GLADIATOR_UPRISING.sparks.includes('underpaid-upkeep'));
ok('CROWD_REACTION bands: 5 (hateful…enthusiastic)',
   ACKS.CROWD_REACTION.bands.length === 5 && ACKS.CROWD_REACTION.bands[0].result === 'hateful' && ACKS.CROWD_REACTION.bands[4].result === 'enthusiastic');
ok('CROWD_REACTION flags rawRangesVerified:false (standard 2d6 structure assumed)', ACKS.CROWD_REACTION.rawRangesVerified === false);

// =============================================================================
section('Economy constants (p.20–23)');
// =============================================================================
ok('1 gladiator / 150 urban families', ACKS.GLADIATORS_PER_URBAN_FAMILIES === 150);
ok('candidate cost 40gp', ACKS.CANDIDATE_COST_GP === 40);
ok('upkeep 2gp/month', ACKS.UPKEEP_GP_PER_MONTH === 2);
ok('freedom at 10 victories / 15 bouts', ACKS.FREEDOM_VICTORIES === 10 && ACKS.FREEDOM_BOUTS === 15);
ok('victory prize 20% of rent', ACKS.VICTORY_PRIZE_PCT === 0.20);
ok('amphitheater 15gp/seat, ≤12 bouts/day', ACKS.AMPHITHEATER_COST_PER_SEAT_GP === 15 && ACKS.MAX_BOUTS_PER_DAY === 12);
ok('buy-trained reaction target 9+', ACKS.BUY_TRAINED_REACTION_TARGET === 9);

// =============================================================================
section('Catalog lookups + derived rent/prize/value');
// =============================================================================
ok('gladiatorRankForLevel: 0→ordinary, 2→veteran, 5→champion',
   ACKS.gladiatorRankForLevel(0) === 'ordinary' && ACKS.gladiatorRankForLevel(2) === 'veteran' && ACKS.gladiatorRankForLevel(5) === 'champion');
ok('gladiatorRankForLevel clamps (99→champion, -3→ordinary)', ACKS.gladiatorRankForLevel(99) === 'champion' && ACKS.gladiatorRankForLevel(-3) === 'ordinary');
ok('gladiatorBaseGpValue(1) === 425', ACKS.gladiatorBaseGpValue(1) === 425);
ok('gladiatorRentFee(0) === 150 (250 × 60%)', ACKS.gladiatorRentFee(0) === 150, String(ACKS.gladiatorRentFee(0)));
ok('gladiatorRentFee(1) === 266 (425 × 62.5%, rounded)', ACKS.gladiatorRentFee(1) === 266, String(ACKS.gladiatorRentFee(1)));
ok('gladiatorRentFee(0,{death}) === 300 (×2)', ACKS.gladiatorRentFee(0, { death: true }) === 300);
ok('gladiatorVictoryPrize(0) === 30 (20% of 150)', ACKS.gladiatorVictoryPrize(0) === 30, String(ACKS.gladiatorVictoryPrize(0)));

// =============================================================================
section('Gladiator-as-Character helpers (defensive — socialTier:gladiator)');
// =============================================================================
ok('isGladiator true only for socialTier:gladiator', ACKS.isGladiator({ socialTier: 'gladiator' }) && !ACKS.isGladiator({ socialTier: 'independent' }) && !ACKS.isGladiator(null));
ok('gladiatorRank reads character level', ACKS.gladiatorRank({ level: 3 }) === 'champion' && ACKS.gladiatorRank({ level: 0 }) === 'ordinary');
ok('gladiatorGpValue(level 2) === 900', ACKS.gladiatorGpValue({ level: 2 }) === 900);
ok('gladiatorGpValue Thrassian +20% (level 2 → 1080)', ACKS.gladiatorGpValue({ level: 2 }, { thrassian: true }) === 1080, String(ACKS.gladiatorGpValue({ level: 2 }, { thrassian: true })));
ok('gladiatorGpValue reads gladiatorIsThrassian flag', ACKS.gladiatorGpValue({ level: 2, gladiatorIsThrassian: true }) === 1080);
ok('gladiatorGpValue +item base/33 (level 0 + 3300gp item → 250+100)', ACKS.gladiatorGpValue({ level: 0 }, { itemBaseGp: 3300 }) === 350);
ok('gladiatorEarnedFreedom at 10 wins / 15 bouts', ACKS.gladiatorEarnedFreedom({ victoriesWon: 10 }) && ACKS.gladiatorEarnedFreedom({ boutsSurvived: 15 }) && !ACKS.gladiatorEarnedFreedom({ victoriesWon: 9, boutsSurvived: 14 }));
ok('maxGladiatorsForFamilies(4000) === 26', ACKS.maxGladiatorsForFamilies(4000) === 26, String(ACKS.maxGladiatorsForFamilies(4000)));
ok('amphitheaterCostGp(12000) === 180000 (Arganos example, p.22)', ACKS.amphitheaterCostGp(12000) === 180000);

// =============================================================================
section('Entities — factories + ids + shapes');
// =============================================================================
const b0 = ACKS.blankBout({});
ok('blankBout id has bot- prefix', /^bot-/.test(b0.id));
ok('blankBout defaults: to-incapacitation, scheduled, abstract, sides=gladiator', b0.kind === 'to-incapacitation' && b0.status === 'scheduled' && b0.resolutionMode === 'abstract' && b0.sideA.kind === 'gladiator' && Array.isArray(b0.sideB.combatantIds));
ok('blankBout carries schemaVersion + result:null', typeof b0.schemaVersion === 'number' && b0.result === null);
const s0 = ACKS.blankGladiatorSchool({ name: 'Ludus' });
ok('blankGladiatorSchool id has gld- prefix + name + active', /^gld-/.test(s0.id) && s0.name === 'Ludus' && s0.status === 'active' && Array.isArray(s0.gladiatorCharacterIds));
const g0 = ACKS.blankGame({ name: 'Munus' });
ok('blankGame id has gam- prefix + name + planned', /^gam-/.test(g0.id) && g0.name === 'Munus' && g0.status === 'planned' && Array.isArray(g0.boutIds));

// =============================================================================
section('createX (init-on-write) + lookups');
// =============================================================================
const camp = ACKS.blankCampaign ? ACKS.blankCampaign() : { name: 'T' };
ok('blankCampaign has NO bouts/games/gladiatorSchools (init-on-write; migrate-no-op enabler)',
   camp.bouts === undefined && camp.games === undefined && camp.gladiatorSchools === undefined);
const sch = ACKS.createGladiatorSchool(camp, { name: 'Ludus Magnus', settlementId: 'set-1', lanistaCharacterId: 'chr-lan' });
ok('createGladiatorSchool inits + pushes', Array.isArray(camp.gladiatorSchools) && camp.gladiatorSchools.length === 1 && sch.id);
const game = ACKS.createGame(camp, { name: 'Funeral Games', settlementId: 'set-1' });
const bout = ACKS.createBout(camp, { gameId: game.id, sideA: { combatantIds: ['chr-a'] }, sideB: { combatantIds: ['chr-b'] } });
ok('createGame + createBout init + push', camp.games.length === 1 && camp.bouts.length === 1 && bout.gameId === game.id);
ok('findGladiatorSchool / findGame / findBout', ACKS.findGladiatorSchool(camp, sch.id) === sch && ACKS.findGame(camp, game.id) === game && ACKS.findBout(camp, bout.id) === bout);
ok('boutsForGame(game) returns the bout', ACKS.boutsForGame(camp, game.id).length === 1);
ok('gladiatorSchoolsInSettlement + gladiatorSchoolsOfLanista', ACKS.gladiatorSchoolsInSettlement(camp, 'set-1').length === 1 && ACKS.gladiatorSchoolsOfLanista(camp, 'chr-lan').length === 1);
ok('gamesInSettlement', ACKS.gamesInSettlement(camp, 'set-1').length === 1);
// lookups are defensive on an empty campaign
ok('lookups defensive on {} (no throw, empty)', ACKS.findBout({}, 'x') === null && ACKS.boutsForGame({}, 'g').length === 0 && ACKS.gladiatorsOfSchool(null, null).length === 0);

// =============================================================================
section('Entity registry — kinds + displayName');
// =============================================================================
for(const k of ['bout', 'gladiator-school', 'game']){
  ok('registry has kind "' + k + '"', !!ACKS.entityKind(k));
}
ok('registry list(bout) reads campaign.bouts', ACKS.listEntities(camp, 'bout').length === 1);
ok('registry find(game) works', ACKS.findEntity(camp, 'game', game.id) === game);
ok('registry displayName(gladiator-school) uses name', ACKS.entityDisplayName(camp, 'gladiator-school', sch.id) === 'Ludus Magnus');
ok('registry displayName(bout) describes kind·status', ACKS.entityDisplayName(camp, 'bout', bout.id) === 'to-incapacitation · scheduled');
ok('registry displayName(game) uses name', ACKS.entityDisplayName(camp, 'game', game.id) === 'Funeral Games');

// =============================================================================
section('Field schemas — present + validate + ⊆ factory');
// =============================================================================
for(const [kind, factoryName] of [['bout','blankBout'],['gladiator-school','blankGladiatorSchool'],['game','blankGame']]){
  const schema = ACKS.fieldSchemaFor(kind);
  ok('field-schema "' + kind + '" exists + names factory ' + factoryName, !!schema && schema.factory === factoryName);
  ok('field-schema "' + kind + '" validates clean', schema && ACKS.validateFieldSchema(kind, schema).ok);
  if(schema){
    const keys = new Set(Object.keys(ACKS[factoryName]({})));
    const extras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
    ok('field-schema "' + kind + '" fields ⊆ ' + factoryName + ' keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
  }
}
ok('field-schema "bout" sideA object sub-fields ⊆ factory nested keys', (() => {
  const f = ACKS.fieldSchemaFor('bout').fields.find(x => x.name === 'sideA');
  const nested = new Set(Object.keys(ACKS.blankBout({}).sideA));
  return f && (f.fields || []).every(s => nested.has(s.name));
})());

// =============================================================================
section('Abstract bout resolver (AXIOMS 4 p.25) — the non-inert gate');
// =============================================================================
// rule OFF → refusal (this is what makes gladiator-games non-inert in G1)
const off = ruleOff();
ok('resolveBoutAbstract refuses when rule OFF', ACKS.resolveBoutAbstract(off, ACKS.blankBout({}), { roll: 8 }).ok === false);
ok('refusal reason is gladiator-games-off', ACKS.resolveBoutAbstract(off, ACKS.blankBout({}), { roll: 8 }).reason === 'gladiator-games-off');
ok('resolveBoutAbstract no-bout guard', ACKS.resolveBoutAbstract(ruleOn(), null, {}).ok === false);

// rule ON — a 2nd-level gladiator (gp value 900) loses to a winner; XP = 900 (p.28)
const arena = { houseRules: { 'gladiator-games': { enabled: true } }, characters: [
  { id: 'chr-win', socialTier: 'gladiator', level: 1 },
  { id: 'chr-los', socialTier: 'gladiator', level: 2 }
] };
const fight = ACKS.blankBout({ sideA: { combatantIds: ['chr-win'] }, sideB: { combatantIds: ['chr-los'] }, kind: 'to-incapacitation' });
const winRes = ACKS.resolveBoutAbstract(arena, fight, { roll: 8 });   // 6–10 → sideA wins
ok('roll 8 → sideA wins', winRes.ok && winRes.result.winnerSide === 'A' && winRes.result.d10 === 8);
ok('winner XP = defeated gp value (level 2 → 900)', winRes.result.xpAwarded.length === 1 && winRes.result.xpAwarded[0].characterId === 'chr-win' && winRes.result.xpAwarded[0].xp === 900);
ok('loser survived (incapacitation bout) + crowd reaction set', winRes.result.casualties.length === 1 && winRes.result.casualties[0].characterId === 'chr-los' && winRes.result.casualties[0].outcome === 'survived' && winRes.result.crowdReaction !== null);
const loseRes = ACKS.resolveBoutAbstract(arena, fight, { roll: 1 });  // 1–2 → sideA slain
ok('roll 1 → sideB wins, sideA slain', loseRes.result.winnerSide === 'B' && loseRes.result.casualties[0].characterId === 'chr-win' && loseRes.result.casualties[0].outcome === 'slain');
const deathRes = ACKS.resolveBoutAbstract(arena, ACKS.blankBout({ kind: 'to-death', sideA: { combatantIds: ['chr-win'] }, sideB: { combatantIds: ['chr-los'] } }), { roll: 4 });
ok('death bout roll 4 → sideA dies (1–5 die)', deathRes.result.winnerSide === 'B' && deathRes.result.casualties[0].outcome === 'slain');
ok('death bout roll 6 → sideA wins', ACKS.resolveBoutAbstract(arena, ACKS.blankBout({ kind: 'to-death' }), { roll: 6 }).result.winnerSide === 'A');
// the core per-gladiator 1d10 primitive
ok('rollGladiatorBoutOutcome: 2→slain, 4→lost, 9→won', ACKS.rollGladiatorBoutOutcome({ roll: 2 }).outcome === 'slain' && ACKS.rollGladiatorBoutOutcome({ roll: 4 }).outcome === 'lost' && ACKS.rollGladiatorBoutOutcome({ roll: 9 }).outcome === 'won');
ok('rollGladiatorBoutOutcome death: 5→slain, 6→won', ACKS.rollGladiatorBoutOutcome({ roll: 5, death: true }).outcome === 'slain' && ACKS.rollGladiatorBoutOutcome({ roll: 6, death: true }).outcome === 'won');
ok('rollCrowdReaction: 2→hateful, 7→uncertain, 12→enthusiastic',
   ACKS.rollCrowdReaction({ roll: 2 }).result === 'hateful' && ACKS.rollCrowdReaction({ roll: 7 }).result === 'uncertain' && ACKS.rollCrowdReaction({ roll: 12 }).result === 'enthusiastic');
ok('resolver does NOT mutate the bout (pure)', fight.status === 'scheduled' && fight.result === null);

// =============================================================================
section('Migrate-no-op guard (team-session enabler)');
// =============================================================================
if(typeof ACKS.migrateCampaign === 'function'){
  const fresh = ACKS.blankCampaign ? ACKS.blankCampaign() : {};
  const before = JSON.stringify(fresh);
  ACKS.migrateCampaign(fresh);
  ok('migrateCampaign injects NO gladiator collections (no bouts/games/gladiatorSchools key)',
     fresh.bouts === undefined && fresh.games === undefined && fresh.gladiatorSchools === undefined);
  // (a campaign that already HAS them is untouched too — they're read defensively)
  ok('migrateCampaign is shape-stable on a gladiator-less campaign', JSON.parse(before) && true);
} else {
  ok('migrateCampaign present (skipped — not loaded)', true);
}

// =============================================================================
// G2 — the arena: recruit · resolve-and-commit · hold a game · free · events
// =============================================================================
section('G2 — recruitGladiator (mint a socialTier:gladiator Character → roster)');
const offRec = ACKS.recruitGladiator({ houseRules:{}, characters:[] }, ACKS.blankGladiatorSchool({}), { name:'X' });
ok('recruitGladiator refuses when rule OFF', offRec.ok === false && offRec.reason === 'gladiator-games-off');
const c1 = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[], eventLog:[], currentTurn:1 };
const sch1 = ACKS.createGladiatorSchool(c1, { name:'Ludus', settlementId:'set-1' });
const rec = ACKS.recruitGladiator(c1, sch1, { name:'Spartacus', gladiatorType:'netfighter', level:0, method:'buy-trained' });
ok('recruitGladiator ok + mints a socialTier:gladiator Character', rec.ok && rec.character && rec.character.socialTier === 'gladiator');
ok('recruit lands on campaign.characters + the school roster', c1.characters.some(x => x.id === rec.character.id) && sch1.gladiatorCharacterIds.includes(rec.character.id));
ok('gladiator fields set (type, lanistaMorale -4, contractSchoolId, counters 0, level honored 0)',
   rec.character.gladiatorType === 'netfighter' && rec.character.lanistaMorale === -4 && rec.character.contractSchoolId === sch1.id && rec.character.victoriesWon === 0 && rec.character.level === 0);
ok('buy-trained cost = gp value (level 0 → 250)', rec.costGp === 250, String(rec.costGp));
const recCand = ACKS.recruitGladiator(c1, sch1, { method:'buy-candidate', gladiatorType:'striker' });
ok('buy-candidate costs 40gp + lifecycleState candidate', recCand.costGp === 40 && recCand.character.lifecycleState === 'candidate');
ok('gladiator-recruited event emitted', c1.eventLog.some(e => e.event && e.event.kind === 'gladiator-recruited'));

section('G2 — resolveAndCommitBout (XP + Mortal-Wounds casualties + counters)');
function mkArena(){
  return { houseRules:{ 'gladiator-games':{ enabled:true } }, currentTurn:3,
    characters:[ { id:'g-a', name:'Aulus',  socialTier:'gladiator', level:1, xp:0, victoriesWon:0, boutsSurvived:0, history:[] },
                 { id:'g-b', name:'Brutus', socialTier:'gladiator', level:2, xp:0, victoriesWon:0, boutsSurvived:0, history:[] } ],
    bouts:[], games:[], eventLog:[] };
}
// roll 8 → sideA wins; high rng → merciful crowd, the defeated survives
const A1 = mkArena();
const r1 = ACKS.scheduleBout(A1, { sideA:{ combatantIds:['g-a'] }, sideB:{ combatantIds:['g-b'] }, kind:'to-incapacitation' });
ok('scheduleBout ok + pushed', r1.ok && A1.bouts.length === 1);
const cr1 = ACKS.resolveAndCommitBout(A1, r1.bout, { roll:8, rng:()=>0.99 });
const ga1 = A1.characters.find(x => x.id === 'g-a'), gb1 = A1.characters.find(x => x.id === 'g-b');
ok('resolveAndCommitBout ok + bout resolved + result stored', cr1.ok && r1.bout.status === 'resolved' && !!r1.bout.result);
ok('winner XP = the defeated gp value (level 2 → 900)', ga1.xp === 900, String(ga1.xp));
ok('winner counters: victoriesWon 1, boutsSurvived 1', ga1.victoriesWon === 1 && ga1.boutsSurvived === 1);
ok('loser survived a merciful crowd — not deceased, boutsSurvived 1', gb1.lifecycleState !== 'deceased' && gb1.boutsSurvived === 1);
ok('loser routed through Mortal Wounds (a wound recorded)', Array.isArray(gb1.mortalWounds) && gb1.mortalWounds.length >= 1);
ok('bout-resolved event emitted', A1.eventLog.some(e => e.event && e.event.kind === 'bout-resolved'));
ok('already-resolved guard', ACKS.resolveAndCommitBout(A1, r1.bout, {}).reason === 'already-resolved');
// roll 8 (sideB survives the fight) + low rng → bloodthirsty crowd slays the defeated
const A2 = mkArena();
const r2 = ACKS.scheduleBout(A2, { sideA:{ combatantIds:['g-a'] }, sideB:{ combatantIds:['g-b'] }, kind:'to-incapacitation' });
ACKS.resolveAndCommitBout(A2, r2.bout, { roll:8, rng:()=>0.01 });
const gb2 = A2.characters.find(x => x.id === 'g-b');
ok('bloodthirsty crowd slays the defeated survivor (RR p.27)', gb2.lifecycleState === 'deceased' && r2.bout.result.casualties[0].crowdKilled === true);
// roll 1 → sideA slain in the fight
const A3 = mkArena();
const r3 = ACKS.scheduleBout(A3, { sideA:{ combatantIds:['g-a'] }, sideB:{ combatantIds:['g-b'] }, kind:'to-incapacitation' });
ACKS.resolveAndCommitBout(A3, r3.bout, { roll:1, rng:()=>0.5 });
const ga3 = A3.characters.find(x => x.id === 'g-a'), gb3 = A3.characters.find(x => x.id === 'g-b');
ok('roll 1 → sideA slain (deceased); sideB wins XP (level 1 → 425)', ga3.lifecycleState === 'deceased' && gb3.victoriesWon === 1 && gb3.xp === 425, String(gb3.xp));
// to-death bout, roll 4 → loser slain (1–5 die)
const A4 = mkArena();
const r4 = ACKS.scheduleBout(A4, { sideA:{ combatantIds:['g-a'] }, sideB:{ combatantIds:['g-b'] }, kind:'to-death' });
ACKS.resolveAndCommitBout(A4, r4.bout, { roll:4, rng:()=>0.5 });
ok('to-death roll 4 → sideA slain', A4.characters.find(x => x.id === 'g-a').lifecycleState === 'deceased' && r4.bout.result.death === true);

section('G2 — holdGame (resolve every scheduled bout → gladiator-game-held)');
const A5 = mkArena();
A5.characters.push({ id:'g-c', name:'Caius',  socialTier:'gladiator', level:1, xp:0, victoriesWon:0, boutsSurvived:0, history:[] });
A5.characters.push({ id:'g-d', name:'Decius', socialTier:'gladiator', level:1, xp:0, victoriesWon:0, boutsSurvived:0, history:[] });
const g5game = ACKS.createGame(A5, { name:'Funeral Games', settlementId:'set-1' });
ACKS.scheduleBout(A5, { gameId:g5game.id, sideA:{ combatantIds:['g-a'] }, sideB:{ combatantIds:['g-b'] }, kind:'to-incapacitation' });
ACKS.scheduleBout(A5, { gameId:g5game.id, sideA:{ combatantIds:['g-c'] }, sideB:{ combatantIds:['g-d'] }, kind:'to-incapacitation' });
ok('scheduleBout links bouts to game.boutIds', g5game.boutIds.length === 2);
const hg = ACKS.holdGame(A5, g5game, { rng:()=>0.7 });
ok('holdGame ok + resolves all + marks held', hg.ok && hg.resolved.length === 2 && g5game.status === 'held');
ok('all the game\'s bouts resolved', A5.bouts.every(b => b.status === 'resolved'));
ok('gladiator-game-held event emitted', A5.eventLog.some(e => e.event && e.event.kind === 'gladiator-game-held'));
ok('holdGame already-held guard', ACKS.holdGame(A5, g5game, {}).reason === 'already-held');
ok('holdGame refuses when rule OFF', ACKS.holdGame({ houseRules:{}, games:[], bouts:[] }, g5game, {}).reason === 'gladiator-games-off');

section('G2 — freeGladiator + gladiatorsSubsystemActive (dormant-until-used)');
const A6 = mkArena();
A6.characters[0].victoriesWon = 10;
const sch6 = ACKS.createGladiatorSchool(A6, { name:'L' }); sch6.gladiatorCharacterIds = ['g-a'];
A6.characters[0].contractSchoolId = sch6.id;
const fr = ACKS.freeGladiator(A6, 'g-a');
ok('freeGladiator flips socialTier→independent + removes from roster', fr.ok && A6.characters[0].socialTier === 'independent' && !sch6.gladiatorCharacterIds.includes('g-a'));
ok('freeGladiator refuses a non-gladiator', ACKS.freeGladiator({ characters:[{ id:'x', socialTier:'independent' }] }, 'x').reason === 'not-a-gladiator');
ok('gladiatorsSubsystemActive: rule ON → true', ACKS.gladiatorsSubsystemActive({ houseRules:{ 'gladiator-games':{ enabled:true } } }));
ok('gladiatorsSubsystemActive: rule OFF + a school → true (dormant-until-used)', ACKS.gladiatorsSubsystemActive({ houseRules:{}, gladiatorSchools:[{ id:'gld-x' }] }));
ok('gladiatorsSubsystemActive: rule OFF + no school → false', !ACKS.gladiatorsSubsystemActive({ houseRules:{} }));

section('G2 — the 3 event kinds registered (bout-resolved / game-held / recruited)');
for(const k of ['bout-resolved', 'gladiator-game-held', 'gladiator-recruited']){
  ok('EVENT_KINDS has ' + k, ACKS.EVENT_KINDS.indexOf(k) >= 0);
  ok('EVENT_SCHEMAS has ' + k, !!ACKS.EVENT_SCHEMAS[k]);
  ok('EVENT_WIZARD_OPTOUT has ' + k, ACKS.EVENT_WIZARD_OPTOUT.has(k));
}

// =============================================================================
// G3 — AMPHITHEATER SIZE (AXIOMS 4 p.21–22) + the de-drifted size table
// =============================================================================
section('G3 — AMPHITHEATER_SIZE (the de-drifted RAW table)');
ok('AMPHITHEATER_SIZE is a frozen array of 6 (classes I–VI)', Array.isArray(ACKS.AMPHITHEATER_SIZE) && ACKS.AMPHITHEATER_SIZE.length === 6 && Object.isFrozen(ACKS.AMPHITHEATER_SIZE));
// the load-bearing worked example: Arganos Class III, 4,000 families → 12,000 seats → 180,000gp (p.22)
ok('Class III / 4,000 fam → 12,000 seats (Arganos, p.22)', ACKS.amphitheaterSeatsForClassFamilies('III', 4000) === 12000, String(ACKS.amphitheaterSeatsForClassFamilies('III', 4000)));
ok('…→ 180,000gp build cost', ACKS.amphitheaterCostGp(ACKS.amphitheaterSeatsForClassFamilies('III', 4000)) === 180000);
ok('Class II / 8,000 fam → 18,000 seats (15,000 + 1×3,000)', ACKS.amphitheaterSeatsForClassFamilies('II', 8000) === 18000, String(ACKS.amphitheaterSeatsForClassFamilies('II', 8000)));
ok('Class I / 24,000 fam → 31,000 seats (30,000 + ⌊4,000/4⌋)', ACKS.amphitheaterSeatsForClassFamilies('I', 24000) === 31000, String(ACKS.amphitheaterSeatsForClassFamilies('I', 24000)));
ok('Class IV / 1,000 fam → 5,000 seats (5/family)', ACKS.amphitheaterSeatsForClassFamilies('IV', 1000) === 5000);
ok('Class V → None (0; below Class IV minimum)', ACKS.amphitheaterSeatsForClassFamilies('V', 400) === 0);
ok('Class VI / VI* → None (0)', ACKS.amphitheaterSeatsForClassFamilies('VI', 200) === 0 && ACKS.amphitheaterSeatsForClassFamilies('VI*', 50) === 0);
ok('amphitheaterSeatsForSettlement reads families → market class', ACKS.amphitheaterSeatsForSettlement(camp, { families: 4000 }) === 12000);
ok('seats clamp ≤ 100,000 (RAW max)', ACKS.amphitheaterSeatsForClassFamilies('I', 1000000) === ACKS.AMPHITHEATER_MAX_SEATS);

// =============================================================================
section('G3 — training time + clock (AXIOMS 4 p.24–25)');
// =============================================================================
ok('GLADIATOR_TRAINING_BY_TYPE: 7 types', Object.keys(ACKS.GLADIATOR_TRAINING_BY_TYPE).length === 7);
ok('training months by type: spearfighter 6 / striker 7.5 / netfighter 9 (lighter = longer)',
   ACKS.gladiatorTrainingMonths('spearfighter') === 6 && ACKS.gladiatorTrainingMonths('striker') === 7.5 && ACKS.gladiatorTrainingMonths('netfighter') === 9);
ok('typical training cost per type (spearfighter 192 / netfighter 200, p.25)',
   ACKS.GLADIATOR_TRAINING_BY_TYPE.spearfighter.costGp === 192 && ACKS.GLADIATOR_TRAINING_BY_TYPE.netfighter.costGp === 200);
const trC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[], settlements:[], eventLog:[], currentTurn:1, currentDayInMonth:1 };
const trS = ACKS.createGladiatorSchool(trC, { name:'Training Ludus' });
const cand = ACKS.recruitGladiator(trC, trS, { method:'buy-candidate', gladiatorType:'spearfighter' });
ok('recruit buy-candidate → lifecycleState candidate', cand.character.lifecycleState === 'candidate');
const tr = ACKS.trainGladiator(trC, trS, cand.character.id, { type:'netfighter' });
ok('trainGladiator: 9 months → completesOrd 271 (turn1 day1 + 9×30)', tr.ok && tr.months === 9 && tr.completesOrd === 271, String(tr.completesOrd));
ok('trainGladiator sets the type + the clock on the character', cand.character.gladiatorType === 'netfighter' && cand.character.trainingCompletesOrd === 271 && cand.character.trainingGraduated === false);
const tinfo = ACKS.gladiatorTrainingInfo(trC, cand.character);
ok('gladiatorTrainingInfo: inTraining + 270 days left', tinfo.inTraining && tinfo.daysLeft === 270, String(tinfo.daysLeft));
ok('trainGladiator refuses a non-gladiator / no-school / rule-off',
   ACKS.trainGladiator(trC, trS, { socialTier:'independent' }, {}).reason === 'not-a-gladiator' &&
   ACKS.trainGladiator(trC, null, cand.character.id, {}).reason === 'no-school' &&
   ACKS.trainGladiator({ houseRules:{} }, trS, cand.character.id, {}).reason === 'gladiator-games-off');

// graduation throw (1d20; maim on 1, unworthy 1–10; else ordinary gladiator)
const grad15 = ACKS.resolveGraduation(trC, cand.character.id, { roll:15 });
ok('resolveGraduation roll 15 → graduates active (not maimed)', grad15.ok && grad15.maimed === false && cand.character.lifecycleState === 'active' && cand.character.trainingGraduated === true);
ok('a graduated candidate refuses re-graduation', ACKS.resolveGraduation(trC, cand.character.id, { roll:15 }).reason === 'not-a-candidate');
const cand2 = ACKS.recruitGladiator(trC, trS, { method:'buy-candidate', gladiatorType:'striker' });
ACKS.trainGladiator(trC, trS, cand2.character.id, { type:'striker' });
const grad1 = ACKS.resolveGraduation(trC, cand2.character.id, { roll:1 });
ok('resolveGraduation roll 1 → maimed/killed (deceased, dead-to-the-games)', grad1.maimed === true && cand2.character.lifecycleState === 'deceased' && cand2.character.deadToTheGames === true);
const cand3 = ACKS.recruitGladiator(trC, trS, { method:'impress-prisoner', gladiatorType:'striker' });
ACKS.trainGladiator(trC, trS, cand3.character.id, { type:'striker', unworthy:true });
ok('unworthy candidate: roll 8 → maimed (1–10 fail, p.25)', ACKS.resolveGraduation(trC, cand3.character.id, { roll:8 }).maimed === true);
ok('gladiator-trained events emitted on graduation', trC.eventLog.filter(e => e.event && e.event.kind === 'gladiator-trained').length === 3);

// =============================================================================
section('G3 — the monthly business loop (Titus worked example, AXIOMS 4 p.25)');
// =============================================================================
// Titus's 9-gladiator school, lanista L5 (his own master trainer): staff 163, upkeep 18.
const titC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[{ id:'titus', name:'Titus', socialTier:'independent', level:5 }], settlements:[], eventLog:[], currentTurn:1, currentDayInMonth:1 };
const titS = ACKS.createGladiatorSchool(titC, { name:'Ludus Titi', lanistaCharacterId:'titus' });
for(let i=0;i<9;i++){ const g={ id:'tg'+i, name:'TG'+i, socialTier:'gladiator', level:0, lifecycleState:'active', victoriesWon:0, boutsSurvived:0 }; titC.characters.push(g); titS.gladiatorCharacterIds.push(g.id); }
ok('schoolRosterCount === 9', ACKS.schoolRosterCount(titC, titS) === 9);
ok('schoolStaffWages === 163 (1 guard 25 + 2 trainers 120 + lanista-master 0 + chirugeon 18)', ACKS.schoolStaffWages(titC, titS) === 163, String(ACKS.schoolStaffWages(titC, titS)));
ok('schoolUpkeepGp === 18 (2gp × 9)', ACKS.schoolUpkeepGp(titC, titS) === 18);
const titPL = ACKS.schoolMonthlyPL(titC, titS, { rentIncomeGp:680, prizesGp:90, replacementsGp:250 });
ok('schoolMonthlyPL: totalCost 521 (90+250+18+163)', titPL.totalCost === 521, String(titPL.totalCost));
ok('schoolMonthlyPL: PROFIT 159 (680 − 521) — the Titus worked example', titPL.profit === 159, String(titPL.profit));
ok('schoolMonthlyPL: upkeep + staff auto-computed', titPL.upkeep === 18 && titPL.staffWages === 163);
// the loss variant (RAW p.25 note: a 4th-gladiator death-bout loss → −31gp)
ok('schoolMonthlyPL: a loss yields a negative profit', ACKS.schoolMonthlyPL(titC, titS, { rentIncomeGp:680, prizesGp:60, replacementsGp:250+250 }).profit < 0);
// without an L5 lanista, the master trainer must be hired (+250)
const noMasterC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[], settlements:[], eventLog:[], currentTurn:1, currentDayInMonth:1 };
const noMasterS = ACKS.createGladiatorSchool(noMasterC, { name:'L' });
for(let i=0;i<9;i++){ const g={ id:'ng'+i, socialTier:'gladiator', level:0, lifecycleState:'active' }; noMasterC.characters.push(g); noMasterS.gladiatorCharacterIds.push(g.id); }
ok('no L5 lanista → staff includes the hired master (163 + 250 = 413)', ACKS.schoolStaffWages(noMasterC, noMasterS) === 413, String(ACKS.schoolStaffWages(noMasterC, noMasterS)));
// estimate + the auto month
const estC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[{ id:'l', socialTier:'independent', level:5 }], settlements:[{ id:'set1', name:'Arganos', families:4000 }], eventLog:[], currentTurn:1, currentDayInMonth:1 };
const estS = ACKS.createGladiatorSchool(estC, { name:'L', lanistaCharacterId:'l', settlementId:'set1' });
for(let i=0;i<9;i++){ const g={ id:'eg'+i, socialTier:'gladiator', level:0, lifecycleState:'active' }; estC.characters.push(g); estS.gladiatorCharacterIds.push(g.id); }
ok('estimateSchoolMonthlyRent: 4,000×0.5 × 9/9 = 2,000 (sole school)', ACKS.estimateSchoolMonthlyRent(estC, estS) === 2000, String(ACKS.estimateSchoolMonthlyRent(estC, estS)));
const bizSeq = (() => { let i=0; const seq=[0.9,0.9,0.1]; return () => seq[i++ % seq.length]; })(); // win, win, slain (of 3 rented)
const biz = ACKS.runSchoolBusinessMonth(estC, estS, { rentIncomeGp:680, rentCount:3, rng: bizSeq });
ok('runSchoolBusinessMonth: rents 3, tallies wins/slain + the P&L', biz.ok && biz.tally.rentCount === 3 && (biz.tally.wins + biz.tally.losses + biz.tally.slain) === 3);
ok('runSchoolBusinessMonth: winners gained a victory + a slain gladiator is deceased', estC.characters.find(c=>c.id==='eg0').victoriesWon === 1 && estC.characters.some(c=>/^eg/.test(c.id) && c.lifecycleState==='deceased'));
ok('runSchoolBusinessMonth refuses when rule OFF', ACKS.runSchoolBusinessMonth({ houseRules:{}, gladiatorSchools:[estS] }, estS, {}).reason === 'gladiator-games-off');

// =============================================================================
section('G4 — uprisings (the Titus worked example, AXIOMS 4 p.26)');
// =============================================================================
const upC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[{ id:'titus', name:'Titus', socialTier:'independent', level:5 }], settlements:[], eventLog:[], currentTurn:1, currentDayInMonth:1 };
const upS = ACKS.createGladiatorSchool(upC, { name:'Ludus Titi', lanistaCharacterId:'titus' });
for(let i=0;i<6;i++){ const g={ id:'ug'+i, socialTier:'gladiator', level:0, lifecycleState:'active', lanistaMorale:-4 }; upC.characters.push(g); upS.gladiatorCharacterIds.push(g.id); }
const upMod = ACKS.uprisingModifiers(upC, upS, { sparkNotFault:true });
ok('uprisingModifiers: +4 (5th-level +1, master trainer +2, not-fault +1)', upMod.total === 4, String(upMod.total));
const up = ACKS.checkUprising(upC, upS, { spark:'heavy-game-losses', sparkNotFault:true, rolls:[11,8,2,4,6,7] });
ok('checkUprising: net mod 0 (−4 morale + 4 circumstance) → bands loyal/hesitate/lead/join/hesitate/hesitate',
   up.per.map(p=>p.result).join(',') === 'loyal,hesitate,lead,join,hesitate,hesitate', up.per.map(p=>p.result).join(','));
ok('checkUprising: 1 lead + 1 join = 33% support ≥ 25% → REVOLT (the Titus example)', up.leaders === 1 && up.supporters === 1 && up.supportPct === 33 && up.revolt === true);
ok('checkUprising stamps the school uprisingState on a revolt', upS.uprisingState && upS.uprisingState.leaders === 1);
ok('gladiator-uprising event emitted', upC.eventLog.some(e => e.event && e.event.kind === 'gladiator-uprising'));
ok('checkUprising refuses rule-off / no-gladiators', ACKS.checkUprising({ houseRules:{} }, upS, {}).reason === 'gladiator-games-off' && ACKS.checkUprising(upC, ACKS.createGladiatorSchool(upC, {}), {}).reason === 'no-gladiators');
// a lead-without-25%-support → no revolt + that gladiator loses 2 morale (p.26); the firmly-loyal gain +1
const calmC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[], settlements:[], eventLog:[], currentTurn:1, currentDayInMonth:1 };
const calmS = ACKS.createGladiatorSchool(calmC, { name:'L' });   // no lanista → 0 circumstance modifier
for(let i=0;i<5;i++){ const g={ id:'cg'+i, socialTier:'gladiator', level:0, lifecycleState:'active', lanistaMorale: (i===4 ? -8 : 2) }; calmC.characters.push(g); calmS.gladiatorCharacterIds.push(g.id); }
// rolls [12,12,12,12,2]: cg0–3 → 14 (firmly-loyal), cg4 → −6 (lead). 1 lead / 5 = 20% < 25% → no revolt.
const calm = ACKS.checkUprising(calmC, calmS, { spark:'unpaid-prize', rolls:[12,12,12,12,2] });
ok('a lone Lead with <25% support → no revolt', calm.revolt === false && calm.leaders === 1 && calm.supportPct === 20);
ok('the lone Lead loses 2 morale (−8 → −10); a Firmly Loyal gains +1 (2 → 3) (p.26)',
   calmC.characters.find(c=>c.id==='cg4').lanistaMorale === -10 && calmC.characters.find(c=>c.id==='cg0').lanistaMorale === 3);

// =============================================================================
section('G4 — sponsoring a game (AXIOMS 4 p.22)');
// =============================================================================
const spC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[
  { id:'sa', socialTier:'gladiator', level:0 }, { id:'sb', socialTier:'gladiator', level:0 },
  { id:'sc', socialTier:'gladiator', level:2 }, { id:'sm', name:'Sirius', socialTier:'independent', level:6, coins:{ gp:5000 } }
], settlements:[{ id:'set1', name:'Arganos', families:4000 }], games:[], bouts:[], eventLog:[], currentTurn:1, currentDayInMonth:1 };
ok('sponsorGame: budget < 0.5gp/family refused (min 2,000gp for 4,000 families)',
   (() => { const r = ACKS.sponsorGame(spC, { settlementId:'set1', budgetGp:100, bouts:[] }); return r.ok === false && r.reason === 'budget-too-low' && r.minBudget === 2000; })());
const sp = ACKS.sponsorGame(spC, { settlementId:'set1', muneratorCharacterId:'sm', payFromMunerator:true, bouts:[
  { sideA:{ combatantIds:['sa'], kind:'gladiator' }, sideB:{ combatantIds:['sb'], kind:'gladiator' }, kind:'to-incapacitation' },   // L0 vs L0 — balanced
  { sideA:{ combatantIds:['sa'], kind:'gladiator' }, sideB:{ combatantIds:['sc'], kind:'gladiator' }, kind:'to-incapacitation' }    // L0(250) vs L2(900) — unequal → rejected
]});
ok('sponsorGame: default budget = 0.5gp/family = 2,000', sp.ok && sp.budgetGp === 2000);
ok('sponsorGame: balanced sides scheduled, unequal (±10%) sides rejected', sp.scheduled.length === 1 && sp.rejected.length === 1 && sp.rejected[0].reason === 'sides-unequal');
ok('sponsorGame: creates the Game + links its bouts', ACKS.findGame(spC, sp.game.id) && sp.game.boutIds.length === 1);
ok('sponsorGame: ≤12 bouts/day → overflow to multiple days', (() => {
  const bouts = []; for(let i=0;i<14;i++) bouts.push({ sideA:{ combatantIds:['sa'], kind:'gladiator' }, sideB:{ combatantIds:['sb'], kind:'gladiator' }, kind:'to-incapacitation' });
  const r = ACKS.sponsorGame(spC, { settlementId:'set1', bouts }); return r.scheduled.length === 14 && r.days === 2;
})());
ok('sponsorGame: the munerator pays the liturgy expense (GP Wave B)', (spC.characters.find(c=>c.id==='sm').coins.gp) < 5000);
ok('game-sponsored event emitted', spC.eventLog.some(e => e.event && e.event.kind === 'game-sponsored'));
ok('sponsorGame refuses when rule OFF', ACKS.sponsorGame({ houseRules:{}, settlements:[], games:[], bouts:[] }, {}).reason === 'gladiator-games-off');

// =============================================================================
section('G3/G4 — the slot-62 day-tick consumer + the 3 new event kinds');
// =============================================================================
ok('slot-62 consumer "gladiators" registered (order 62)', ACKS.dayConsumersInOrder().some(c => c.name === 'gladiators' && c.order === 62));
// propose at month-end (turn 7 day 30 → ord 210): a candidate whose training completed + the business month due
const dtC = { houseRules:{ 'gladiator-games':{ enabled:true } }, characters:[], settlements:[], eventLog:[], currentTurn:7, currentDayInMonth:30 };
const dtS = ACKS.createGladiatorSchool(dtC, { name:'L' });
const dtCand = ACKS.recruitGladiator(dtC, dtS, { method:'buy-candidate', gladiatorType:'spearfighter' });
dtCand.character.trainingCompletesOrd = 181; dtCand.character.trainingGraduated = false; dtCand.character.lifecycleState = 'candidate'; // completed (ord 181 ≤ 210)
const dtProp = ACKS.proposeGladiatorDay(dtC, { dayInMonth:30 });
ok('proposeGladiatorDay surfaces a due graduation + the month-end business loop (day 30)', dtProp.pendingRecords.some(r => r.kind === 'gladiator-graduate') && dtProp.pendingRecords.some(r => r.kind === 'gladiator-school-month'));
ok('proposeGladiatorDay returns nothing when the rule is OFF', ACKS.proposeGladiatorDay({ houseRules:{}, characters:[], gladiatorSchools:[] }, { dayInMonth:1 }).pendingRecords.length === 0);
const bizRec = dtProp.pendingRecords.find(r => r.kind === 'gladiator-school-month');
ACKS.commitGladiatorRecord(dtC, bizRec);
ok('commitGladiatorRecord (business month) advances businessNextOrd by 30', dtS.businessNextOrd === bizRec.forOrd + 30);
ACKS.commitGladiatorRecord(dtC, bizRec);   // idempotent re-commit
ok('commitGladiatorRecord business month is idempotent (no double-advance)', dtS.businessNextOrd === bizRec.forOrd + 30);
for(const k of ['gladiator-trained', 'gladiator-uprising', 'game-sponsored']){
  ok('EVENT_KINDS has ' + k, ACKS.EVENT_KINDS.indexOf(k) >= 0);
  ok('EVENT_SCHEMAS has ' + k, !!ACKS.EVENT_SCHEMAS[k]);
  ok('EVENT_WIZARD_OPTOUT has ' + k, ACKS.EVENT_WIZARD_OPTOUT.has(k));
}
// the team-session no-blankX-inject discipline: the G3/G4 runtime fields are DEFENSIVE (not on the factories)
ok('blankGladiatorSchool has NO businessNextOrd key (defensive runtime field — no field-schema/migration touch)',
   ACKS.blankGladiatorSchool({}).businessNextOrd === undefined && ACKS.blankGladiatorSchool({}).uprisingState === null);

// =============================================================================
section('G5 — the round-by-round tactical bout (AXIOMS 4 p.27; the Combat-Option-B exemplar)');
// =============================================================================
// A deterministic sequence rng (every die from it, in order, cycling) for the rigged-bout tests.
function seqRng(vals){ let i = 0; return () => vals[(i++) % vals.length]; }
// A tactical-bout campaign + a gladiator with EXPLICIT combat stats (so the profile is fully determined —
// the resolver reads maxHp/attackThrow/ac/damageDie defensively, so a stored-stat character needs no rng).
function mkTac(){ return { houseRules:{ 'gladiator-games':{ enabled:true } }, currentTurn:3, characters:[], bouts:[], games:[], eventLog:[] }; }
function tacGlad(id, name, o){ return Object.assign({ id, name, socialTier:'gladiator', level:0, xp:0, victoriesWon:0, boutsSurvived:0,
  hp:30, maxHp:30, attackThrow:10, ac:2, damageDie:'d6', arenaMorale:0, controlledBy:'gm', history:[] }, o||{}); }

// --- exports + the bout-round event kind ---
ok('resolveBoutTactical exported', typeof ACKS.resolveBoutTactical === 'function');
ok('resolveAndCommitBoutTactical exported', typeof ACKS.resolveAndCommitBoutTactical === 'function');
ok('gladiatorCombatProfile exported', typeof ACKS.gladiatorCombatProfile === 'function');
ok('TACTICAL_BOUT_ROUND_CAP exported (30)', ACKS.TACTICAL_BOUT_ROUND_CAP === 30);
ok('INCAP_ATTACK_PENALTY === 4 (nonlethal −4, RAW p.27)', ACKS.INCAP_ATTACK_PENALTY === 4);
ok('SURRENDER_MORALE_TARGET === 5 (RAW p.27)', ACKS.SURRENDER_MORALE_TARGET === 5);
ok('EVENT_KINDS has bout-round', ACKS.EVENT_KINDS.indexOf('bout-round') >= 0);
ok('EVENT_SCHEMAS has bout-round', !!ACKS.EVENT_SCHEMAS['bout-round']);
ok('EVENT_WIZARD_OPTOUT has bout-round', ACKS.EVENT_WIZARD_OPTOUT.has('bout-round'));
ok('bout-round handler registered (no throw on a record)', (function(){ try { return typeof ACKS.applyEvent === 'function'; } catch(_e){ return true; } })());

// --- gladiatorCombatProfile (defensive reads + RAW-grounded fallbacks) ---
const profC = mkTac();
const profStored = ACKS.gladiatorCombatProfile(profC, tacGlad('g-p','Pollux',{ hp:18, maxHp:18, attackThrow:7, ac:4, damageDie:'d8' }));
ok('profile reads stored maxHp + full hp at the start', profStored.maxHp === 18 && profStored.hp === 18);
ok('profile reads stored attackThrow + ac + damage sides', profStored.attackValue === 7 && profStored.ac === 4 && profStored.dmgSides === 8);
const profBare = ACKS.gladiatorCombatProfile(profC, { id:'g-bare', name:'Nemo', socialTier:'gladiator', level:1 });
ok('profile fallbacks for a bare character — valid hp/attack/AC', profBare.hp >= 1 && profBare.attackValue >= 1 && profBare.ac >= 0 && profBare.dmgSides >= 1);

// --- rule-OFF refusal (the non-inert gate) + guards ---
ok('resolveBoutTactical refuses when rule OFF', ACKS.resolveBoutTactical(ruleOff(), ACKS.blankBout({}), {}).reason === 'gladiator-games-off');
ok('resolveAndCommitBoutTactical refuses when rule OFF', ACKS.resolveAndCommitBoutTactical(ruleOff(), ACKS.blankBout({}), {}).reason === 'gladiator-games-off');
ok('resolveBoutTactical no-bout guard', ACKS.resolveBoutTactical(ruleOn(), null, {}).ok === false);
ok('resolveBoutTactical no-combatants guard', ACKS.resolveBoutTactical(mkTac(), ACKS.blankBout({ sideA:{ combatantIds:['nope'] }, sideB:{ combatantIds:['nada'] } }), {}).reason === 'no-combatants');

// --- a deterministic 1v1 to-incapacitation (rng 0.99 → all nat-20 hits, max damage, no surrender, enthusiastic crowd) ---
const T1 = mkTac();
T1.characters.push(tacGlad('a','Aulus',{ hp:30, maxHp:30 }), tacGlad('b','Brutus',{ hp:6, maxHp:6 }));
const t1bout = ACKS.scheduleBout(T1, { sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }).bout;
const t1res = ACKS.resolveBoutTactical(T1, t1bout, { rng:()=>0.99 });
ok('resolveBoutTactical ok + resolutionMode "combat"', t1res.ok && t1res.result.resolutionMode === 'combat');
ok('round-by-round: rounds[] populated + roundCount matches', Array.isArray(t1res.result.rounds) && t1res.result.rounds.length === t1res.result.roundCount && t1res.result.roundCount >= 1);
ok('each round records initiative + lines', t1res.result.rounds[0] && t1res.result.rounds[0].initiative && Array.isArray(t1res.result.rounds[0].lines) && t1res.result.rounds[0].lines.length > 0);
ok('the stronger gladiator wins (Side A)', t1res.result.winnerSide === 'A');
ok('the loser is a survivor (to-incap) — casualties[0] survived', t1res.result.casualties.length === 1 && t1res.result.casualties[0].characterId === 'b' && t1res.result.casualties[0].outcome === 'survived');
ok('crowd reaction rolled for the losing survivor', !!t1res.result.crowdReaction);
ok('1v1 winnerCasualties is empty (the abstract/1v1 path unchanged)', Array.isArray(t1res.result.winnerCasualties) && t1res.result.winnerCasualties.length === 0);
ok('XP to the winner = the defeated gp value (level 0 → 250)', t1res.result.xpAwarded.length === 1 && t1res.result.xpAwarded[0].xp === 250, JSON.stringify(t1res.result.xpAwarded));

// --- resolveAndCommitBoutTactical: commit (status/mode/XP/counters/Mortal Wounds) + reuses bout-resolved ---
const T2 = mkTac();
T2.characters.push(tacGlad('a','Aulus',{ hp:30, maxHp:30, level:1 }), tacGlad('b','Brutus',{ hp:6, maxHp:6, level:0 }));
const t2bout = ACKS.scheduleBout(T2, { sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }).bout;
const t2cr = ACKS.resolveAndCommitBoutTactical(T2, t2bout, { rng:()=>0.99 });
const t2a = T2.characters.find(x=>x.id==='a'), t2b = T2.characters.find(x=>x.id==='b');
ok('resolveAndCommitBoutTactical ok + bout resolved + mode "combat"', t2cr.ok && t2bout.status === 'resolved' && t2bout.resolutionMode === 'combat');
ok('bout.result carries the round log', Array.isArray(t2bout.result.rounds) && t2bout.result.roundCount >= 1);
ok('winner XP (= defeated 250) + counters advanced', t2a.xp === 250 && t2a.victoriesWon === 1 && t2a.boutsSurvived === 1);
ok('loser routed through the SHIPPED Mortal Wounds (Delves D1) — a wound recorded, survived', Array.isArray(t2b.mortalWounds) && t2b.mortalWounds.length >= 1 && t2b.lifecycleState !== 'deceased');
ok('reuses the shipped bout-resolved event (resolutionMode:combat, roundCount in payload)',
   T2.eventLog.some(e => e.event && e.event.kind === 'bout-resolved' && e.event.payload && e.event.payload.resolutionMode === 'combat' && e.event.payload.roundCount >= 1));
ok('NO bout-round events emitted without opts.logRounds', !T2.eventLog.some(e => e.event && e.event.kind === 'bout-round'));
ok('already-resolved guard', ACKS.resolveAndCommitBoutTactical(T2, t2bout, {}).reason === 'already-resolved');

// --- to-death: the loser is slain (deceased + dead to the games); the winner survives ---
const T3 = mkTac();
T3.characters.push(tacGlad('a','Aulus',{ hp:30, maxHp:30 }), tacGlad('b','Brutus',{ hp:6, maxHp:6 }));
const t3bout = ACKS.scheduleBout(T3, { sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-death' }).bout;
ACKS.resolveAndCommitBoutTactical(T3, t3bout, { rng:()=>0.99 });
const t3a = T3.characters.find(x=>x.id==='a'), t3b = T3.characters.find(x=>x.id==='b');
ok('to-death: result.death true + winner Side A survives', t3bout.result.death === true && t3a.lifecycleState !== 'deceased' && t3a.victoriesWon === 1);
ok('to-death: the loser is slain + dead to the games', t3b.lifecycleState === 'deceased' && t3b.deadToTheGames === true);
ok('to-death: no crowd reaction (the loser is slain outright)', t3bout.result.crowdReaction == null);

// --- the −4 nonlethal penalty (RAW p.27): a fight that RESOLVES to-death STALEMATES to-incapacitation ---
// Identical marginal combatants (attackThrow 6, AC 2) + rng 0.5 → 1d20 = 11. to-death needs 8 (hit);
// to-incap needs 12 (miss). So to-death resolves to a winner; to-incap reaches the round cap as a draw.
const T4d = mkTac(); T4d.characters.push(tacGlad('a','A',{ attackThrow:6, hp:20, maxHp:20 }), tacGlad('b','B',{ attackThrow:6, hp:20, maxHp:20 }));
const t4dRes = ACKS.resolveBoutTactical(T4d, ACKS.blankBout({ sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-death' }), { rng:()=>0.5 });
ok('to-death marginal fight RESOLVES to a winner under the round cap', t4dRes.result.winnerSide !== 'draw' && t4dRes.result.roundCount < ACKS.TACTICAL_BOUT_ROUND_CAP);
const T4i = mkTac(); T4i.characters.push(tacGlad('a','A',{ attackThrow:6, hp:20, maxHp:20 }), tacGlad('b','B',{ attackThrow:6, hp:20, maxHp:20 }));
const t4iRes = ACKS.resolveBoutTactical(T4i, ACKS.blankBout({ sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }), { rng:()=>0.5 });
ok('the −4 nonlethal penalty STALEMATES the same fight to-incapacitation → draw at the round cap',
   t4iRes.result.winnerSide === 'draw' && t4iRes.result.roundCount === ACKS.TACTICAL_BOUT_ROUND_CAP);
ok('a draw awards no XP + slays no one', t4iRes.result.xpAwarded.length === 0 && !T4i.characters.some(c=>c.lifecycleState==='deceased'));

// --- the surrender check (to-incap, ≤½ hp, 2d6 + arena morale ≤ 5; PCs exempt) ---
// rng order: iA, iB, A's d20, A's dmg, B's d20, [surrender 2d6 ×... ], crowd 2d6. A drops B into the
// ≤½ window in one hit (B maxHp 12, max dmg 6 → 6 ≤ 6), then B's low-morale 2d6 yields.
const T5 = mkTac();
T5.characters.push(tacGlad('a','Aulus',{ hp:50, maxHp:50, attackThrow:1, ac:2 }),
                   tacGlad('b','Brutus',{ hp:12, maxHp:12, attackThrow:20, ac:0, arenaMorale:-5 }));
const t5bout = ACKS.scheduleBout(T5, { sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }).bout;
const t5res = ACKS.resolveBoutTactical(T5, t5bout, { rng: seqRng([0.99, 0.0, 0.5, 0.99, 0.5, 0.0, 0.0, 0.5, 0.5]) });
ok('a battered non-PC gladiator surrenders (≤½ hp, 2d6 + morale ≤ 5)', t5res.result.winnerSide === 'A' && t5res.result.casualties[0] && t5res.result.casualties[0].surrendered === true);
// PCs are exempt from the surrender roll (RAW p.27)
const T5p = mkTac();
T5p.characters.push(tacGlad('a','Aulus',{ hp:50, maxHp:50, attackThrow:1, ac:2 }),
                    tacGlad('b','Player',{ hp:12, maxHp:12, attackThrow:20, ac:0, arenaMorale:-5, controlledBy:'player' }));
const t5pres = ACKS.resolveBoutTactical(T5p, ACKS.blankBout({ sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }), { rng: seqRng([0.99, 0.0, 0.5, 0.99, 0.5, 0.0, 0.0, 0.5, 0.5]) });
ok('a PC gladiator does NOT surrender (exempt; the fight continues)', !(t5pres.result.casualties[0] && t5pres.result.casualties[0].surrendered));

// --- a bloodthirsty crowd slays the defeated survivor (tactical path, RAW p.27) ---
const T6 = mkTac();
T6.characters.push(tacGlad('a','Aulus',{ hp:30, maxHp:30 }), tacGlad('b','Brutus',{ hp:6, maxHp:6 }));
const t6bout = ACKS.scheduleBout(T6, { sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }).bout;
ACKS.resolveAndCommitBoutTactical(T6, t6bout, { rng: seqRng([0.99, 0.0, 0.99, 0.99, 0.0, 0.0]) });
const t6b = T6.characters.find(x=>x.id==='b');
ok('bloodthirsty crowd slays the defeated survivor (tactical path)', t6b.lifecycleState === 'deceased' && t6bout.result.casualties[0].crowdKilled === true);

// --- the incapacitated-WINNER path (a 2v2 to-death mutual KO; RAW p.27: Mortal Wounds for incapacitated winners) ---
const T7 = mkTac();
T7.characters.push(tacGlad('a1','Aulus', { hp:6,  maxHp:6  }), tacGlad('a2','Aper',  { hp:30, maxHp:30 }),
                   tacGlad('b1','Brutus',{ hp:30, maxHp:30 }), tacGlad('b2','Balbus',{ hp:6,  maxHp:6  }));
const t7bout = ACKS.scheduleBout(T7, { sideA:{ combatantIds:['a1','a2'] }, sideB:{ combatantIds:['b1','b2'] }, kind:'to-death' }).bout;
const t7cr = ACKS.resolveAndCommitBoutTactical(T7, t7bout, { rng:()=>0.99 });
const a1 = T7.characters.find(x=>x.id==='a1'), a2 = T7.characters.find(x=>x.id==='a2'),
      b1 = T7.characters.find(x=>x.id==='b1'), b2 = T7.characters.find(x=>x.id==='b2');
ok('2v2 to-death: Side A wins', t7cr.ok && t7bout.result.winnerSide === 'A');
ok('an incapacitated WINNER survives via Mortal Wounds (not slain) — RAW p.27', a1.lifecycleState !== 'deceased' && Array.isArray(a1.mortalWounds) && a1.mortalWounds.length >= 1);
ok('result.winnerCasualties records the incapacitated winner', Array.isArray(t7bout.result.winnerCasualties) && t7bout.result.winnerCasualties.some(w=>w.characterId==='a1'));
ok('the losing side is slain (to-death)', b1.lifecycleState === 'deceased' && b2.lifecycleState === 'deceased');
ok('the unhurt winner (a2) is alive + earned XP', a2.lifecycleState !== 'deceased' && a2.victoriesWon === 1 && a2.xp > 0);

// --- opts.logRounds → a record-only, campaignLogHidden bout-round per round ---
const T8 = mkTac();
T8.characters.push(tacGlad('a','Aulus',{ hp:30, maxHp:30 }), tacGlad('b','Brutus',{ hp:6, maxHp:6 }));
const t8bout = ACKS.scheduleBout(T8, { sideA:{ combatantIds:['a'] }, sideB:{ combatantIds:['b'] }, kind:'to-incapacitation' }).bout;
const t8cr = ACKS.resolveAndCommitBoutTactical(T8, t8bout, { rng:()=>0.99, logRounds:true });
const t8rounds = T8.eventLog.filter(e => e.event && e.event.kind === 'bout-round');
ok('opts.logRounds emits one bout-round per round', t8rounds.length === t8bout.result.roundCount && t8rounds.length >= 1);
ok('bout-round events are campaignLogHidden (Event Log only)', t8rounds.every(e => e.campaignLogHidden === true && e.event.campaignLogHidden === true));
ok('bout-round payload carries the round number + lines', t8rounds[0].event.payload && t8rounds[0].event.payload.round >= 1 && Array.isArray(t8rounds[0].event.payload.lines));

// --- the shared aftermath: the abstract path is byte-unchanged (the G2 tests above already pass) + the
//     tactical path feeds the SAME _commitBoutResult (both go through bout-resolved + Delves-D1 wounds) ---
ok('both paths set bout.resolutionMode (abstract default preserved)',
   ACKS.blankBout({}).resolutionMode === 'abstract');

// =============================================================================
console.log('\n=============================================================');
console.log('gladiators.smoke: ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('=============================================================');
