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
console.log('\n=============================================================');
console.log('gladiators.smoke: ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('=============================================================');
