/* tests/hijinks-hj2.smoke.js — Phase 2.7 Hideouts & Hijinks (HJ-2).
 *
 *   node tests/hijinks-hj2.smoke.js   (or via `npm test`)
 *
 * The criminal-enterprise layer atop HJ-1: SYNDICATES (campaign.syndicates[]), the
 * monthly TRIBUTE take, and the caught-hijink → TRIAL path (RR pp.358–369). Covers the
 * data layer + registries, the RAW Hideout/market-class caps (RR p.359 — Viktir's
 * examples), the Monthly Member Tribute table (RR p.362 — Viktir's 1,650gp), the
 * formation verb + boss eligibility, member caps, tribute routed through the GP Wave B
 * grammar, and the Crime & Punishment trial (RR pp.367–368 — Reingo's theft fine, plead-
 * guilty escalation, the 2d6 verdict bands, fines/damages/indenture, acquittal).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

// A seeded "dice" generator: returns the given fractions in order (looping). _d(rng,N) =
// floor(rng()*N)+1, so 0.0 → 1, 0.999 → N. Lets the trial/throw rolls be deterministic.
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const LO = () => 0.0;     // every die its minimum (a d20 of 1 → caught)
const HI = () => 0.999;   // every die its maximum

function mkCampaign(opts) {
  opts = opts || {};
  return { schemaVersion: 2, currentTurn: opts.turn || 1, currentDayInMonth: opts.day || 1,
    calendar: { year: 1, month: 1, day: opts.day || 1 }, houseRules: {},
    characters: [], settlements: [], domains: [], hexes: [], parties: [], eventLog: [], hijinks: [], syndicates: [] };
}
function mkBoss(c, opts) {
  opts = opts || {};
  const b = { schemaVersion: 2, id: opts.id || 'chr-boss', name: opts.name || 'Viktir',
    class: opts.cls || 'Thief', level: opts.level || 9, alive: true, proficiencies: opts.profs || ['Streetwise'],
    classPowers: [], coins: { pp: 0, gp: opts.gp != null ? opts.gp : 1000, ep: 0, sp: 0, cp: 0 },
    abilities: opts.abilities || { STR: 10, INT: 10, WIL: 10, DEX: 10, CON: 10, CHA: 10 } };
  c.characters.push(b); return b;
}

// =============================================================================
section('data layer + registries');
ok('blankSyndicate constructs with schemaVersion 2 + kind syndicate', (() => { const s = ACKS.blankSyndicate({}); return s.schemaVersion === 2 && s.kind === 'syndicate'; })());
ok('blankSyndicate mints a syn- id', /^syn-/.test(ACKS.blankSyndicate({}).id));
ok('ID_PREFIXES.syndicate = syn', ACKS.ID_PREFIXES.syndicate === 'syn');
ok('blankCampaign seeds syndicates: []', Array.isArray(ACKS.blankCampaign({}).syndicates));
ok('migrateCampaign does NOT lazy-inject syndicates (templates stay no-ops)', (() => { const c = ACKS.blankCampaign({}); delete c.syndicates; ACKS.migrateCampaign(c); return c.syndicates === undefined; })());
ok("entity-registry knows kind 'syndicate'", !!ACKS.entityKind('syndicate') && ACKS.entityKind('syndicate').icon === '🏛');
ok('registry syndicate displayName reads name/id (factory keys)', ACKS.entityKind('syndicate').displayName({}, ACKS.blankSyndicate({ name: 'X' })) === 'X');
ok('registry syndicate list reads campaign.syndicates', (() => { const c = ACKS.blankCampaign({}); c.syndicates.push(ACKS.blankSyndicate({ id: 'syn-1' })); return ACKS.entityKind('syndicate').list(c).length === 1; })());
ok('field-schema "syndicate" exists + validates clean', (() => { const s = ACKS.fieldSchemaFor('syndicate'); return s && ACKS.validateFieldSchema('syndicate', s).ok; })());
ok('field-schema fields ⊆ blankSyndicate keys', (() => { const keys = new Set(Object.keys(ACKS.blankSyndicate({}))); const extras = ACKS.fieldSchemaFor('syndicate').fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n)); return extras.length === 0; })());
['hijink-syndicate-formed', 'hijink-tribute', 'hijink-trial'].forEach(k => {
  ok("event kind '" + k + "' registered", ACKS.isEventKindKnown(k));
  ok("event kind '" + k + "' is Event-Wizard opt-out", !ACKS.isWizardEmittable(k));
});
ok("importer wiring is the §8.9 mandate (collection name is 'syndicates')", ACKS.entityKind('syndicate').list({ syndicates: [{ id: 'a' }] }).length === 1);

// =============================================================================
section('market-class caps (RR p.359 — Hideout Size, Cost, and Level)');
ok('MARKET_SYNDICATE_CAPS has all 6 classes', Object.keys(ACKS.MARKET_SYNDICATE_CAPS).length === 6);
ok('Class VI: 25 members / 5,000gp / 3rd', (() => { const c = ACKS.MARKET_SYNDICATE_CAPS.VI; return c.maxMembers === 25 && c.minHideoutGp === 5000 && c.maxEffectiveLevel === 3; })());
ok('Class I: 3,000 members / 600,000gp / 14th', (() => { const c = ACKS.MARKET_SYNDICATE_CAPS.I; return c.maxMembers === 3000 && c.minHideoutGp === 600000 && c.maxEffectiveLevel === 14; })());
ok('maxEffectiveLevel VI=3, IV=7, I=14', ACKS.syndicateMaxEffectiveLevel('VI') === 3 && ACKS.syndicateMaxEffectiveLevel('IV') === 7 && ACKS.syndicateMaxEffectiveLevel('I') === 14);
// Viktir's example (RR p.359): Class IV market — hideout value drives the tier, capped by class.
ok('Class IV @10,000gp → max 50 members (Viktir step 1)', ACKS.syndicateMaxMembers(ACKS.blankSyndicate({ marketClass: 'IV', hideoutValueGp: 10000 })) === 50);
ok('Class IV @20,000gp → max 100 members (Viktir step 2)', ACKS.syndicateMaxMembers(ACKS.blankSyndicate({ marketClass: 'IV', hideoutValueGp: 20000 })) === 100);
ok('Class IV @75,000gp → still capped at 100 (Viktir step 3)', ACKS.syndicateMaxMembers(ACKS.blankSyndicate({ marketClass: 'IV', hideoutValueGp: 75000 })) === 100);
ok('Class VI @4,000gp → 0 (under the 5,000gp minimum)', ACKS.syndicateMaxMembers(ACKS.blankSyndicate({ marketClass: 'VI', hideoutValueGp: 4000 })) === 0);
ok('Class VI @5,000gp → 25', ACKS.syndicateMaxMembers(ACKS.blankSyndicate({ marketClass: 'VI', hideoutValueGp: 5000 })) === 25);
ok('guildhouse counts at ½ value (RR p.43): 20,000 → eff 10,000', ACKS.syndicateEffectiveHideoutGp(ACKS.blankSyndicate({ hideoutType: 'guildhouse', hideoutValueGp: 20000 })) === 10000);
ok('a venturer guildhouse @40,000 in Class IV → 100 (eff 20,000)', ACKS.syndicateMaxMembers(ACKS.blankSyndicate({ marketClass: 'IV', hideoutType: 'guildhouse', hideoutValueGp: 40000 })) === 100);

// =============================================================================
section('formation (RR p.358) + boss eligibility');
{
  const c = mkCampaign({ turn: 5 });
  const boss = mkBoss(c, { cls: 'Thief' });
  c.settlements.push({ schemaVersion: 2, id: 'set-cyf', name: 'Cyfaraun', marketClass: 'III' });
  const f = ACKS.formSyndicate(c, { bossCharacterId: boss.id, baseSettlementId: 'set-cyf', hideoutValueGp: 75000, name: 'The Argollëan Family' });
  ok('formSyndicate ok', f.ok, JSON.stringify(f));
  ok('campaign.syndicates lazily appended', c.syndicates.length === 1);
  ok('market class derived from base settlement (III)', f.syndicate.marketClass === 'III');
  ok('foundedTurn stamped from currentTurn', f.syndicate.foundedTurn === 5);
  ok("emits a 'hijink-syndicate-formed' event", c.eventLog.some(e => e.event && e.event.kind === 'hijink-syndicate-formed'));
  ok('founded history entry recorded', f.syndicate.history.some(h => h.type === 'founded'));
  // boss eligibility
  ok('a Thief boss is eligible', ACKS.syndicateBossEligible(boss));
  ok('a Venturer boss is eligible (guildhouse)', ACKS.syndicateBossEligible({ class: 'Venturer' }));
  ok('a Mage boss is NOT eligible', !ACKS.syndicateBossEligible({ class: 'Mage' }));
  const mage = mkBoss(c, { id: 'chr-mage', cls: 'Mage' });
  const f2 = ACKS.formSyndicate(c, { bossCharacterId: mage.id });
  ok('formSyndicate rejects an ineligible boss', !f2.ok && f2.error === 'boss-ineligible');
  // a venturer founds a guildhouse by default
  const v = mkBoss(c, { id: 'chr-v', cls: 'Venturer' });
  const f3 = ACKS.formSyndicate(c, { bossCharacterId: v.id, marketClass: 'V', hideoutValueGp: 20000 });
  ok('a venturer founds a guildhouse by default', f3.ok && f3.syndicate.hideoutType === 'guildhouse');
  // explicit marketClass when no settlement
  const f4 = ACKS.formSyndicate(c, { bossCharacterId: boss.id, marketClass: 'VI' });
  ok('explicit marketClass honored when no base settlement', f4.ok && f4.syndicate.marketClass === 'VI');
  ok('bad market class rejected', !ACKS.formSyndicate(c, { bossCharacterId: boss.id, marketClass: 'XII' }).ok);
}

// =============================================================================
section('member roster + cap enforcement');
{
  const c = mkCampaign();
  const boss = mkBoss(c);
  const syn = ACKS.formSyndicate(c, { bossCharacterId: boss.id, marketClass: 'VI', hideoutValueGp: 5000 }).syndicate; // max 25
  ok('addSyndicateMembers adds a level bucket', ACKS.addSyndicateMembers(c, syn.id, 0, 10).ok && ACKS.syndicateMemberCount(syn) === 10);
  ok('adding same level merges the bucket', (() => { ACKS.addSyndicateMembers(c, syn.id, 0, 5); return ACKS.syndicateMemberCount(syn) === 15 && syn.members.length === 1; })());
  ok('adding a different level makes a new bucket (sorted)', (() => { ACKS.addSyndicateMembers(c, syn.id, 2, 5); return syn.members.length === 2 && syn.members[0].level === 0 && syn.members[1].level === 2; })());
  ok('over-cap addition is rejected (20 + 10 > 25)', !ACKS.addSyndicateMembers(c, syn.id, 1, 10).ok);
  ok('removeSyndicateMembers reduces + prunes empties', (() => { ACKS.removeSyndicateMembers(c, syn.id, 2, 5); return syn.members.length === 1 && ACKS.syndicateMemberCount(syn) === 15; })());
  ok('addSyndicateMembers unknown syndicate → error', !ACKS.addSyndicateMembers(c, 'syn-nope', 0, 1).ok);
}

// =============================================================================
section('monthly tribute (RR p.362 — the designer\'s-note take)');
ok('MONTHLY_MEMBER_TRIBUTE: L0=1, L3=200, L8=2000', ACKS.MONTHLY_MEMBER_TRIBUTE[0] === 1 && ACKS.MONTHLY_MEMBER_TRIBUTE[3] === 200 && ACKS.MONTHLY_MEMBER_TRIBUTE[8] === 2000);
ok('memberMonthlyTribute clamps to the max effective level', ACKS.memberMonthlyTribute(9, 3) === ACKS.MONTHLY_MEMBER_TRIBUTE[3]);
ok('memberMonthlyTribute clamps above-8 to the table ceiling', ACKS.memberMonthlyTribute(12, 14) === 2000);
{
  // Viktir's worked example (RR p.362): 50×1 + 30×5 + 15×30 + 5×200 = 1,650 (Class IV, maxEff 7 → no clamp)
  const c = mkCampaign({ turn: 5 });
  const boss = mkBoss(c, { gp: 1000 });
  const syn = ACKS.formSyndicate(c, { bossCharacterId: boss.id, marketClass: 'IV', hideoutValueGp: 20000 }).syndicate;
  syn.members = [{ level: 0, count: 50 }, { level: 1, count: 30 }, { level: 2, count: 15 }, { level: 3, count: 5 }];
  const trib = ACKS.syndicateMonthlyTribute(c, syn);
  ok('Viktir tribute total = 1,650gp', trib.totalGp === 1650, 'got ' + trib.totalGp);
  ok('tribute breakdown has 4 lines', trib.lines.length === 4);
  // collect routes through the GP Wave B grammar into the boss's purse
  const before = boss.coins.gp;
  const ct = ACKS.collectSyndicateTribute(c, syn.id);
  ok('collectSyndicateTribute returns the total', ct.ok && ct.totalGp === 1650);
  ok('boss purse credited via wealth-transfer (+1,650)', boss.coins.gp === before + 1650, before + ' → ' + boss.coins.gp);
  ok("emits a 'hijink-tribute' event", c.eventLog.some(e => e.event && e.event.kind === 'hijink-tribute'));
  ok('lastTributeTurn stamped to currentTurn', syn.lastTributeTurn === 5);
  ok('double-collect the same turn is blocked', !ACKS.collectSyndicateTribute(c, syn.id).ok);
  ok('force re-collect overrides the same-turn guard', ACKS.collectSyndicateTribute(c, syn.id, { force: true }).ok);
  // a bossless syndicate cannot collect
  const c2 = mkCampaign();
  const syn2 = ACKS.formSyndicate(c2, { marketClass: 'VI' }).syndicate;
  ok('a bossless syndicate cannot collect tribute', !ACKS.collectSyndicateTribute(c2, syn2.id).ok);
  // effective-level clamp in a small market: Class VI (maxEff 3) — a 9th-level member pays L3 tribute
  const c3 = mkCampaign();
  const boss3 = mkBoss(c3);
  const syn3 = ACKS.formSyndicate(c3, { bossCharacterId: boss3.id, marketClass: 'VI', hideoutValueGp: 5000 }).syndicate;
  syn3.members = [{ level: 9, count: 2 }];
  ok('Class VI clamps a L9 member to L3 tribute (2 × 200 = 400)', ACKS.syndicateMonthlyTribute(c3, syn3).totalGp === 400);
}

// =============================================================================
section('auto-monthly tribute (HJ-2 follow-on — processSyndicateTributeForTurn)');
ok('syndicate-auto-tribute rule registered + default ON + category hijinks', (() => { const r = ACKS.lookupHouseRule('syndicate-auto-tribute'); return !!r && r.default === true && r.category === 'hijinks'; })());
ok('processSyndicateTributeForTurn exported', typeof ACKS.processSyndicateTributeForTurn === 'function');
ok('absent rule ⇒ ON via the registry default', ACKS.isHouseRuleEnabled(mkCampaign(), 'syndicate-auto-tribute') === true);
{
  // Viktir's Class IV roster (1,650gp/mo) — boss starts at 1,000gp.
  function mkSyn(opts) {
    const c = mkCampaign({ turn: (opts && opts.turn) || 5 });
    if (opts && opts.houseRules) c.houseRules = opts.houseRules;
    const boss = mkBoss(c, { gp: 1000 });
    const syn = ACKS.formSyndicate(c, { bossCharacterId: boss.id, marketClass: 'IV', hideoutValueGp: 20000 }).syndicate;
    syn.members = [{ level: 0, count: 50 }, { level: 1, count: 30 }, { level: 2, count: 15 }, { level: 3, count: 5 }];
    return { c, boss, syn };
  }
  // 1) rule ON (absent ⇒ default ON) → auto-collects into the boss's purse
  let { c, boss, syn } = mkSyn({});
  const r1 = ACKS.processSyndicateTributeForTurn(c, {});
  ok('ON: ran + ruleOn + totalGp 1,650', r1.ran && r1.ruleOn && r1.totalGp === 1650, JSON.stringify({ ran: r1.ran, total: r1.totalGp }));
  ok('ON: boss purse credited (1,000 → 2,650)', boss.coins.gp === 2650);
  ok('ON: lastTributeTurn stamped + one collection + one logEntry', syn.lastTributeTurn === 5 && r1.collections.length === 1 && r1.logEntries.length === 1);
  ok("ON: emits a 'hijink-tribute' event", c.eventLog.some(e => e.event && e.event.kind === 'hijink-tribute'));
  // 2) idempotent within the turn — a second pass takes nothing
  const r2 = ACKS.processSyndicateTributeForTurn(c, {});
  ok('idempotent within the turn (re-run = 0, purse unchanged)', r2.totalGp === 0 && boss.coins.gp === 2650);
  // 3) a manual collection earlier in the month blocks the auto take (no double-dip)
  let m = mkSyn({});
  ACKS.collectSyndicateTribute(m.c, m.syn.id);
  const mg = m.boss.coins.gp;
  const r3 = ACKS.processSyndicateTributeForTurn(m.c, {});
  ok('manual-first blocks the auto take (no double-dip)', r3.totalGp === 0 && m.boss.coins.gp === mg);
  // 4) rule explicitly OFF → no-op (the GM drives the take by hand)
  let o = mkSyn({ houseRules: { 'syndicate-auto-tribute': { enabled: false } } });
  const r4 = ACKS.processSyndicateTributeForTurn(o.c, {});
  ok('OFF: ruleOn false, no collection, purse unchanged', !r4.ruleOn && r4.totalGp === 0 && o.boss.coins.gp === 1000);
  // 5) dry-run → previews (with a named collection), mutates nothing
  let d = mkSyn({});
  const r5 = ACKS.processSyndicateTributeForTurn(d.c, { dryRun: true });
  ok('dryRun: previews 1,650 + a named collection, purse + lastTributeTurn untouched',
    r5.totalGp === 1650 && r5.collections.length === 1 && r5.collections[0].bossName === 'Viktir' && d.boss.coins.gp === 1000 && d.syn.lastTributeTurn === null,
    JSON.stringify({ total: r5.totalGp, boss: r5.collections[0] && r5.collections[0].bossName }));
  // 6) a bossless / member-less syndicate is skipped
  let b = mkCampaign({ turn: 3 });
  ACKS.formSyndicate(b, { marketClass: 'VI' });   // no boss, no members
  const rb = ACKS.processSyndicateTributeForTurn(b, {});
  ok('a bossless / member-less syndicate is skipped', rb.totalGp === 0 && rb.collections.length === 0);
}

// =============================================================================
section('crime profiles + aliases (RR pp.366–368)');
ok('crimeProfile(theft): severity −2, fines 150/300/450', (() => { const p = ACKS.crimeProfile('theft'); return p.severity === -2 && p.fine.lesser === 150 && p.fine.standard === 300 && p.fine.punitive === 450; })());
ok('crimeProfile(robbery): severity −4, fines 750/900/1200', (() => { const p = ACKS.crimeProfile('robbery'); return p.severity === -4 && p.fine.lesser === 750 && p.fine.punitive === 1200; })());
ok("alias 'grand larceny' → robbery", ACKS.crimeProfile('grand larceny').crime === 'robbery');
ok("alias 'espionage' → eavesdropping", ACKS.crimeProfile('espionage').crime === 'eavesdropping');
ok('extortion is a real −2 crime', ACKS.crimeProfile('extortion').severity === -2);
ok('an unknown charge resolves to a sane default', (() => { const p = ACKS.crimeProfile('jaywalking'); return p && typeof p.fine.lesser === 'number'; })());
ok('awaitTrialDays(theft) is in 1d6 range', (() => { const d = ACKS.awaitTrialDays('theft', HI); return d >= 1 && d <= 6; })());
ok('awaitTrialDays(smuggling) = 1d4 weeks (7..28)', (() => { const d = ACKS.awaitTrialDays('smuggling', HI); return d === 28; })());
ok('awaitTrialDays(kidnapping) = 1d4 months (30..120)', (() => { const d = ACKS.awaitTrialDays('kidnapping', HI); return d === 120; })());
// 2d6 verdict bands (RR p.368)
ok('crimePunishmentBand: 2- → punitive', ACKS.crimePunishmentBand(2).punishmentLevel === 'punitive');
ok('crimePunishmentBand: 4 → standard (Conviction)', ACKS.crimePunishmentBand(4).punishmentLevel === 'standard');
ok('crimePunishmentBand: 7 → lesser', ACKS.crimePunishmentBand(7).punishmentLevel === 'lesser');
ok('crimePunishmentBand: 10 → acquitted', ACKS.crimePunishmentBand(10).punishmentLevel === 'acquitted');
ok('crimePunishmentBand: 12 → acquitted-damages', ACKS.crimePunishmentBand(12).punishmentLevel === 'acquitted-damages');

// =============================================================================
section('trials & sentencing (RR pp.367–368)');
{
  // Reingo, a 1st-level thief caught stealing in Cyfaraun (RR p.367 example).
  // Launch a stealing hijink (LO rng → d20=1 → the locked-but-hidden outcome is 'caught') and
  // run the hijinks day-consumer day-by-day to REVEAL it (status → 'caught') — the trial gate.
  function revealHijink(c, h) {
    let guard = 0;
    while (['complete', 'failed', 'caught'].indexOf(h.status) < 0 && guard++ < 60) {
      const prop = ACKS.proposeHijinkDay(c, {});
      const rec = (prop.pendingRecords || []).find(r => r.hijinkId === h.id);
      if (!rec) break;
      ACKS.commitHijinkRecord(c, rec);
    }
    return h;
  }
  function caughtStealing(c, perp, boss) {
    return revealHijink(c, ACKS.startHijink(c, { perpetratorCharacterId: perp.id, type: 'stealing', bossCharacterId: boss ? boss.id : null, rng: LO }).hijink);
  }
  const c = mkCampaign({ turn: 3 });
  const boss = mkBoss(c, { gp: 1000 });
  // Reingo is "quite uncharismatic (-2)" (RR p.368 example) → CHA 5 (ACKS table: 4–5 → −2).
  const perp = (() => { const p = { schemaVersion: 2, id: 'chr-reingo', name: 'Reingo', class: 'Thief', level: 1, alive: true, proficiencies: ['Streetwise'], classPowers: [], coins: { pp: 0, gp: 500, ep: 0, sp: 0, cp: 0 }, abilities: { STR: 10, INT: 10, WIL: 10, DEX: 10, CON: 10, CHA: 5 } }; c.characters.push(p); return p; })();

  const h = caughtStealing(c, perp, boss);
  ok('a revealed caught hijink has status=caught + a rolled charge', h.status === 'caught' && h.outcome === 'caught' && !!h.charge);
  ok('cannot try a hijink that has not resolved as caught', (() => { const h2 = ACKS.startHijink(c, { perpetratorCharacterId: perp.id, type: 'carousing', rng: HI }).hijink; return !ACKS.resolveHijinkTrial(c, h2.id, { plea: 'guilty' }).ok; })());

  // First offence, plead guilty → lesser; the boss pays the theft lesser fine (150gp, RR p.367).
  const bossGp = boss.coins.gp;
  const tr = ACKS.resolveHijinkTrial(c, h.id, { plea: 'guilty', priorOffenses: 0, rng: seq([0.5]) });
  ok('1st-offence plead-guilty → lesser', tr.ok && tr.punishmentLevel === 'lesser');
  ok('theft lesser fine = 150gp (Reingo)', tr.fineGp === 150);
  ok('the boss pays the fine via wealth-transfer (−150)', boss.coins.gp === bossGp - 150, bossGp + ' → ' + boss.coins.gp);
  ok("emits a 'hijink-trial' event", c.eventLog.some(e => e.event && e.event.kind === 'hijink-trial'));
  ok('h.trial recorded + resolved', h.trial && h.trial.resolved && h.trial.crime === 'theft');
  ok('an await-trial languishing duration is recorded', typeof h.trial.languishingDays === 'number' && h.trial.languishingDays >= 1);
  ok('re-trying an already-tried hijink is blocked', !ACKS.resolveHijinkTrial(c, h.id, { plea: 'guilty' }).ok);

  // Second offence, plead guilty → standard (300gp).
  const h2 = caughtStealing(c, perp, boss);
  const tr2 = ACKS.resolveHijinkTrial(c, h2.id, { plea: 'guilty', priorOffenses: 1, rng: seq([0.5]) });
  ok('2nd-offence plead-guilty → standard (300gp)', tr2.ok && tr2.punishmentLevel === 'standard' && tr2.fineGp === 300);

  // Third offence cannot plead guilty — must stand trial.
  const h3 = caughtStealing(c, perp, boss);
  ok('3rd-offence plead-guilty is blocked (must stand trial)', !ACKS.resolveHijinkTrial(c, h3.id, { plea: 'guilty', priorOffenses: 2 }).ok);

  // Stand trial — a strong defence (gm +6, e.g. bribes + attorney + good evidence) drives a
  // high adjusted roll → acquittal-with-damages (no fine; the court awards damages instead).
  // 2d6=12 (rng 0.999) + GM 6 − CHA 2 − theft severity 2 = 14 ≥ 12.
  const perpGp = perp.coins.gp;
  const tr3 = ACKS.resolveHijinkTrial(c, h3.id, { plea: 'trial', rng: seq([0.999]), gmModifier: 6 });
  ok('a strong defence on the trial roll → acquittal-with-damages', tr3.ok && tr3.punishmentLevel === 'acquitted-damages' && tr3.acquitted, JSON.stringify({ band: tr3.band, adj: tr3.adjustedRoll }));
  ok('acquittal-with-damages awards the perpetrator the would-be fine', perp.coins.gp > perpGp);
  ok('an acquittal levies no fine', tr3.fineGp === 0);

  // Severity feeds the 2d6 modifiers; CHA + proficiencies do too. Reingo: CHA −2, theft −2.
  const h4 = caughtStealing(c, perp, boss);
  const mods = ACKS.hijinkTrialModifiers(c, h4, {});
  ok('trial modifiers = CHA (−2) + theft severity (−2) = −4', mods.total === -4 && mods.parts.some(p => p.label === 'CHA') && mods.parts.some(p => /severity/.test(p.label)), 'got ' + mods.total);

  // Indenture: a perpetrator who can't pay the fine works it off (RR p.368) — clamp + remainder.
  const c2 = mkCampaign();
  const poor = (() => { const p = { schemaVersion: 2, id: 'chr-poor', name: 'Pauper', class: 'Thief', level: 1, alive: true, proficiencies: ['Streetwise'], classPowers: [], coins: { pp: 0, gp: 50, ep: 0, sp: 0, cp: 0 }, abilities: { CHA: 10 } }; c2.characters.push(p); return p; })();
  const hp = revealHijink(c2, ACKS.startHijink(c2, { perpetratorCharacterId: poor.id, type: 'stealing', rng: LO }).hijink); // caught, no boss → perpetrator pays
  const trp = ACKS.resolveHijinkTrial(c2, hp.id, { plea: 'guilty', priorOffenses: 0, rng: seq([0.5]) }); // theft lesser 150
  ok('an independent perpetrator pays his own fine', trp.ok);
  ok('the fine clamps to available funds (paid 50 of 150)', trp.paidGp === 50 && poor.coins.gp === 0);
  ok('the unpaid remainder becomes indenture (100gp)', trp.indentureGp === 100);
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — hijinks-hj2.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
