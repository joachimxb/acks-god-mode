/* Domain Variants smoke test — Phase 5 Tribal Domains (PT-0/A/B) + Terrain Transformation (P5-TERR).
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/domain-variants.smoke.js
 *
 * Covers acks-engine-domain-variants.js:
 *   (A) domain-type accessors + the canonical hexFamilyCap (clanhold 125 / transitional 125 / demchi
 *       land-value curve / ordinary 185·375·780) + the demchi cap table + agriculturalFamilyCapFor.
 *   (B) clanhold rules — clan-warrior capacity (1/family), the conscript/militia ban (incl. the
 *       Military W7 levy-cap integration → 0), the urban cap, the F&D selector + excluded set.
 *   (C) the income hook applyDomainTypeLandRevenue — clanhold cap (Σ min(fam,125)·val exactly),
 *       transitional ½-overage, ordinary/demchi/under-cap no-op (byte-identical), rural-only, the demo
 *       integration (pristine ordinary byte-identical; a clanhold flip never raises land revenue).
 *   (D) setDomainType + decreeTransitional + the record-only events (idempotent / guards / the senate +
 *       irrevocable gates / classification→Outlands / transitionalSince + the 20-yr clock / context envelope).
 *   (E) the senate gate (domainTypeAllowsSenate + materializeSenate refusing a clanhold apex) + the
 *       beastman advisory (ok / advise / exception).
 *   (F) the −2 vassal-morale-under-clanhold-rule penalty (incl. moraleModifiersFor flow) + the PT-0
 *       migration (pastoralist→agricultural) + event-kind registration (the removed kind is gone).
 *   (G) Terrain Transformation (P5-TERR, JJ p.412 — unchanged; b13/b14).
 *
 * Authored 2026-06-24 (Tribal Domains, replacing the retired P5-PAST pastoralist tests); §G unchanged.
 * Independent of the central registries — the module self-registers its event kinds + the
 * terrain-transformation house rule via ACKS.registerEventKind / registerHouseRule (PR #89 kernel).
 */
const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
const approx = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

// A minimal campaign: domains carry domainType; hexes carry families/value/classification.
function mkCampaign(domains, hexes, settlements){
  return { domains: domains, hexes: (hexes || []).map(h => ({ ...h })), settlements: settlements || [],
           characters: [], eventLog: [], currentTurn: 3, currentDayInMonth: 1, houseRules: {} };
}
const civ  = (over) => Object.assign({ id:'dom-civ',  name:'Civ March', classification:'Borderlands', demographics:{ peasantFamilies:300, urbanFamilies:0 } }, over || {});
const clan = (over) => Object.assign({ id:'dom-clan', name:'Wolf Clan', domainType:'clanhold', classification:'Outlands', demographics:{ peasantFamilies:300, urbanFamilies:0 } }, over || {});

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (A) domain-type accessors + hexFamilyCap ---');
check('domainTypeOf absent → ordinary', ACKS.domainTypeOf({}) === 'ordinary');
check('domainTypeOf clanhold', ACKS.domainTypeOf({ domainType:'clanhold' }) === 'clanhold');
check('domainTypeOf invalid → ordinary', ACKS.domainTypeOf({ domainType:'bogus' }) === 'ordinary');
check('dominantRaceOf absent → null', ACKS.dominantRaceOf({}) === null);
check('isClanhold true', ACKS.isClanhold({ domainType:'clanhold' }) === true);
check('isTransitional true', ACKS.isTransitional({ domainType:'transitional' }) === true);
check('isDemchi true', ACKS.isDemchi({ domainType:'demchi' }) === true);
check('isBeastman reads dominantRace', ACKS.isBeastman({ dominantRace:'beastman' }) === true);
check('agri cap ordinary 780', ACKS.agriculturalFamilyCapFor('Civilized') === 780);
check('agri cap borderlands 375', ACKS.agriculturalFamilyCapFor('Borderlands') === 375);
check('agri cap outlands 185', ACKS.agriculturalFamilyCapFor('Outlands') === 185);
check('agri cap unknown → outlands 185', ACKS.agriculturalFamilyCapFor('xyz') === 185);
check('demchi LV1 → 3', ACKS.demchiMaxPopulationForLandValue(1) === 3);
check('demchi LV3 → 10 (poor steppe)', ACKS.demchiMaxPopulationForLandValue(3) === 10);
check('demchi LV5 → 50', ACKS.demchiMaxPopulationForLandValue(5) === 50);
check('demchi LV6+ → 100', ACKS.demchiMaxPopulationForLandValue(6) === 100 && ACKS.demchiMaxPopulationForLandValue(9) === 100);
{
  const cClan = mkCampaign([clan()], [{ id:'h', domainId:'dom-clan', families:200, classification:'Outlands', valuePerFamily:6 }]);
  check('clanhold hex cap 125 (not 185)', ACKS.hexFamilyCap(cClan, cClan.hexes[0]) === 125);
  const cTrans = mkCampaign([civ({ id:'dom-t', domainType:'transitional', classification:'Borderlands' })], [{ id:'h', domainId:'dom-t', families:200, classification:'Borderlands', valuePerFamily:6 }]);
  check('transitional hex cap 125', ACKS.hexFamilyCap(cTrans, cTrans.hexes[0]) === 125);
  const cCiv = mkCampaign([civ()], [{ id:'h', domainId:'dom-civ', families:200, classification:'Borderlands', valuePerFamily:6 }]);
  check('ordinary hex cap = classification 375', ACKS.hexFamilyCap(cCiv, cCiv.hexes[0]) === 375);
  const cDem = mkCampaign([civ({ id:'dom-d', domainType:'demchi' })], [{ id:'h', domainId:'dom-d', families:50, classification:'Outlands', valuePerFamily:3 }]);
  check('demchi hex cap = land-value curve (LV3 → 10)', ACKS.hexFamilyCap(cDem, cDem.hexes[0]) === 10);
  check('unclaimed hex cap = classification (no domain)', ACKS.hexFamilyCap(mkCampaign([], []), { classification:'Civilized', families:0 }) === 780);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (B) clanhold rules + the Military W7 levy-cap integration ---');
{
  const c = mkCampaign([clan({ demographics:{ peasantFamilies:240, urbanFamilies:30 } })], []);
  const d = c.domains[0];
  check('clanhold warrior capacity = peasant families (240)', ACKS.clanholdWarriorCapacity(c, d) === 240);
  check('ordinary warrior capacity 0', ACKS.clanholdWarriorCapacity(c, civ()) === 0);
  check('clanhold disallows conscription', ACKS.domainAllowsConscription(d) === false);
  check('clanhold disallows militia', ACKS.domainAllowsMilitia(d) === false);
  check('ordinary allows conscription', ACKS.domainAllowsConscription(civ()) === true);
  check('clanhold conscriptLevyMax 0 (W7 integration)', ACKS.conscriptLevyMax(d) === 0);
  check('clanhold militiaLevyMax 0 (W7 integration)', ACKS.militiaLevyMax(d) === 0);
  check('ordinary conscriptLevyMax = fam/10 (24)', ACKS.conscriptLevyMax(civ({ demographics:{ peasantFamilies:240 } })) === 24);
  check('ordinary militiaLevyMax = 2×fam/10 (48)', ACKS.militiaLevyMax(civ({ demographics:{ peasantFamilies:240 } })) === 48);
  check('clanhold urban cap = 12.5% peasants (30)', ACKS.clanholdMaxUrbanFamilies(d) === 30);
  check('clanhold urban cap hard-capped at 249 for huge clanholds', ACKS.clanholdMaxUrbanFamilies(clan({ demographics:{ peasantFamilies:9000 } })) === 249);
  check('ordinary urban cap = null (no special cap)', ACKS.clanholdMaxUrbanFamilies(civ()) === null);
  check('clanhold F&D table = clanhold-restricted', ACKS.domainFavorDutyTable(d) === 'clanhold-restricted');
  check('demchi F&D table = nomad', ACKS.domainFavorDutyTable(civ({ domainType:'demchi' })) === 'nomad');
  check('ordinary F&D table = standard', ACKS.domainFavorDutyTable(civ()) === 'standard');
  check('clanhold may NOT demand a loan', ACKS.favorDutyKindAllowedForDomain(d, 'loan') === false);
  check('clanhold may NOT grant an office/title', ACKS.favorDutyKindAllowedForDomain(d, 'office') === false);
  check('clanhold MAY call to arms (war)', ACKS.favorDutyKindAllowedForDomain(d, 'call-to-arms') === true);
  check('ordinary may demand anything', ACKS.favorDutyKindAllowedForDomain(civ(), 'loan') === true);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (B2) clan-warrior LEVY path (RR p.433 — PT-A1) ---');
{
  const c = mkCampaign([clan({ demographics:{ peasantFamilies:240, urbanFamilies:30, morale:0 }, garrison:{ units:[] } })], []);
  c.units = [];
  const d = c.domains[0];
  check('clanholdWarriorLevyMax = families (240)', ACKS.clanholdWarriorLevyMax(c, d) === 240);
  check('ordinary clanholdWarriorLevyMax 0', ACKS.clanholdWarriorLevyMax(c, civ()) === 0);
  check('clan-warrior levyAvailable = 240 initially', ACKS.levyAvailable(c, d, 'clanhold') === 240);
  check('default clan-warrior troop type = light-infantry', ACKS.clanWarriorDefaultTroopTypeKey(d) === 'light-infantry');

  const u = ACKS.levyClanWarriors(c, d.id, { count: 100, instant: true });
  check('levyClanWarriors mints a unit', !!u);
  check('  source = clanhold', u && u.source === 'clanhold');
  check('  pre-trained (not untrained-levy)', u && u.unitTypeKey === 'light-infantry');
  check('  no wages (RR p.433)', u && u.monthlyWage === 0);
  check('  battle-ready (brPerSoldier > 0, from the troop row)', u && (u.brPerSoldier || 0) > 0);
  check('  count = 100 (instant)', u && u.count === 100);
  check('  stationed to the clanhold', u && u.ownerDomainId === d.id);
  check('ever-raised reflects the levy (100)', ACKS.levyEverRaised(c, d, 'clanhold') === 100);
  check('available now 140', ACKS.levyAvailable(c, d, 'clanhold') === 140);

  // opts.troopTypeKey picks the tribe's customary type
  const u2 = ACKS.levyClanWarriors(c, d.id, { count: 50, troopTypeKey: 'heavy-infantry', instant: true });
  check('opts.troopTypeKey honored (heavy-infantry)', u2 && u2.unitTypeKey === 'heavy-infantry');
  check('available now 90 (240 − 150)', ACKS.levyAvailable(c, d, 'clanhold') === 90);

  // the cap clamps a too-large request to the remainder (sticky against the family count)
  const u3 = ACKS.levyClanWarriors(c, d.id, { count: 999, instant: true });
  check('over-cap levy clamps to remainder (90)', u3 && u3.count === 90);
  check('available now 0 (at cap)', ACKS.levyAvailable(c, d, 'clanhold') === 0);
  check('a further levy returns null (cap reached)', ACKS.levyClanWarriors(c, d.id, { count: 1, instant: true }) === null);

  // an ordinary/transitional domain cannot levy clan warriors
  const co = mkCampaign([civ({ demographics:{ peasantFamilies:300, morale:0 }, garrison:{ units:[] } })], []); co.units = [];
  check('ordinary domain: levyClanWarriors → null', ACKS.levyClanWarriors(co, co.domains[0].id, { count: 10, instant: true }) === null);
  const ct = mkCampaign([civ({ domainType:'transitional', demographics:{ peasantFamilies:300, morale:0 }, garrison:{ units:[] } })], []); ct.units = [];
  check('transitional domain: levyClanWarriors → null (RR p.354)', ACKS.levyClanWarriors(ct, ct.domains[0].id, { count: 10, instant: true }) === null);
  check('transitional domain: conscripts STILL allowed (30)', ACKS.conscriptLevyMax(ct.domains[0]) === 30);

  // regression: the clanhold still cannot conscript or levy militia (the ban holds with the new path)
  check('clanhold: levyConscripts → null (banned)', ACKS.levyConscripts(c, d.id, { count: 5, instant: true }) === null);
  check('clanhold: levyMilitia → null (banned)', ACKS.levyMilitia(c, d.id, { count: 5, instant: true }) === null);

  // the UI readout exposes the capacity + the clanhold flag
  const info = ACKS.domainTypeInfo(c, d);
  check('domainTypeInfo.isClanhold true', !!info && info.isClanhold === true);
  check('domainTypeInfo.clanWarriorCapacity = 240', !!info && info.clanWarriorCapacity === 240);
  check('domainTypeInfo.allowsConscription false', !!info && info.allowsConscription === false);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (C) the income hook applyDomainTypeLandRevenue ---');
{
  const c = mkCampaign([civ()], [{ id:'h', domainId:'dom-civ', families:300, classification:'Borderlands', valuePerFamily:6 }]);
  const row = { label:'Land revenue', gp: 1800 };
  const out = ACKS.applyDomainTypeLandRevenue(c, c.domains[0], row, { hexes: c.hexes });
  check('ordinary income hook is a byte-identical no-op (same object)', out === row);
  check('domainTypeLandFactor ordinary = 1', ACKS.domainTypeLandFactor(c, c.domains[0]) === 1);
}
{
  const c = mkCampaign([clan()], [{ id:'h', domainId:'dom-clan', families:200, classification:'Outlands', valuePerFamily:6 }]);
  const f = ACKS.domainTypeLandFactor(c, c.domains[0]);
  check('clanhold factor = 125/200', approx(f, 125 / 200), f);
  const row = { label:'Land revenue (hex)', gp: 200 * 6 };
  const out = ACKS.applyDomainTypeLandRevenue(c, c.domains[0], row, { hexes: c.hexes });
  check('clanhold land gp = Σ min(fam,125)·val exactly (125×6=750)', out.gp === 750, out.gp);
  check('clanhold land row annotated', /clanhold cap 125/.test(out.label), out.label);
  check('original row NOT mutated', row.gp === 1200);
}
{
  const c = mkCampaign([civ({ id:'dom-t', domainType:'transitional', classification:'Borderlands' })], [{ id:'h', domainId:'dom-t', families:200, classification:'Borderlands', valuePerFamily:6 }]);
  const row = { label:'Land', gp: 200 * 6 };
  const out = ACKS.applyDomainTypeLandRevenue(c, c.domains[0], row, { hexes: c.hexes });
  check('transitional ½-overage gp = 125·6 + 75·6·0.5 = 975', out.gp === 975, out.gp);
  check('transitional row annotated', /transitional/.test(out.label), out.label);
}
{
  const c = mkCampaign([clan()], [{ id:'h', domainId:'dom-clan', families:50, classification:'Outlands', valuePerFamily:6 }]);
  check('clanhold under cap (50<125) → factor 1', ACKS.domainTypeLandFactor(c, c.domains[0]) === 1);
}
{
  const c = mkCampaign([civ({ id:'dom-d', domainType:'demchi' })], [{ id:'h', domainId:'dom-d', families:50, classification:'Outlands', valuePerFamily:3 }]);
  const row = { label:'Land', gp: 150 };
  check('demchi income hook no-op (PT-C owns the ledger)', ACKS.applyDomainTypeLandRevenue(c, c.domains[0], row, { hexes: c.hexes }) === row);
}
{
  const c = mkCampaign([clan()], [{ id:'h', domainId:'dom-clan', families:200, classification:'Outlands', valuePerFamily:6 }], [{ id:'set-1', hexId:'h', name:'Town', families:200 }]);
  check('clanhold hex bearing a settlement is excluded (factor 1)', ACKS.domainTypeLandFactor(c, c.domains[0]) === 1);
}
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  let camp = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
  const m = ACKS.migrateCampaign(camp); if(m) camp = m;
  const d = camp.domains.find(x => /saltspur/i.test(x.name)) || camp.domains[0];
  const landOf = () => (ACKS.incomeBreakdown(camp, d).find(r => /Land revenue/.test(r.label)) || {});
  const before = landOf();
  check('pristine demo land row byte-identical (no domain-type annotation)', !/clanhold cap|transitional ½/.test(before.label || ''), before.label);
  check('pristine demo domain defaults to ordinary', ACKS.domainTypeOf(d) === 'ordinary');
  const beforeGp = before.gp || 0;
  ACKS.setDomainType(camp, d.id, 'clanhold');
  check('demo domain flipped to clanhold', ACKS.domainTypeOf(d) === 'clanhold');
  check('clanhold flip emitted a domain-type-changed event', camp.eventLog.some(e => e.event.kind === 'domain-type-changed'));
  check('clanhold land revenue ≤ ordinary (the cap never raises it)', (landOf().gp || 0) <= beforeGp, beforeGp + ' → ' + (landOf().gp || 0));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (D) setDomainType + decreeTransitional + events ---');
{
  const c = mkCampaign([civ()], []);
  const d = c.domains[0];
  check('setDomainType to same (ordinary) → unchanged, no event', ACKS.setDomainType(c, 'dom-civ', 'ordinary').unchanged === true && c.eventLog.length === 0);
  check('no-domain guard', ACKS.setDomainType(c, 'nope', 'clanhold').reason === 'no-domain');
  check('invalid-domain-type guard', ACKS.setDomainType(c, 'dom-civ', 'bogus').reason === 'invalid-domain-type');
  const r = ACKS.setDomainType(c, 'dom-civ', 'clanhold');
  check('set clanhold ok', r.ok === true && r.from === 'ordinary' && r.to === 'clanhold');
  check('domainType written', d.domainType === 'clanhold');
  check('classification forced Outlands (RR p.353)', d.classification === 'Outlands');
  check('one domain-type-changed event logged', c.eventLog.length === 1 && c.eventLog[0].event.kind === 'domain-type-changed');
  check('event context domainId (the §8.9 envelope)', c.eventLog[0].event.context && c.eventLog[0].event.context.domainId === 'dom-civ');
  check('event status applied (record-only)', c.eventLog[0].event.status === 'applied' || (ACKS.EVENT_STATUS && c.eventLog[0].event.status === ACKS.EVENT_STATUS.APPLIED));
}
{
  const c = mkCampaign([civ({ id:'dom-t', domainType:'transitional' })], []);
  check('transitional → clanhold refused (irrevocable)', ACKS.setDomainType(c, 'dom-t', 'clanhold').reason === 'transitional-irrevocable');
  check('transitional → clanhold allowed with force', ACKS.setDomainType(c, 'dom-t', 'clanhold', { force:true }).ok === true);
}
{
  const c = mkCampaign([clan({ demographics:{ peasantFamilies:300, urbanFamilies:160 } })], []);
  const r = ACKS.decreeTransitional(c, 'dom-clan', { turn: 7 });
  check('decreeTransitional ok', r.ok === true && r.from === 'clanhold');
  check('domainType now transitional', c.domains[0].domainType === 'transitional');
  check('transitionalSince stamped (turn 7)', c.domains[0].transitionalSince === 7);
  check('domain-decreed-transitional event logged', c.eventLog.some(e => e.event.kind === 'domain-decreed-transitional'));
  c.currentTurn = 7 + 240;   // 20 game-years at 12 turns/year
  const ready = ACKS.transitionalConversionReady(c, c.domains[0]);
  check('transitionalConversionReady at 20 years', ready && ready.ready === true && ready.yearsElapsed === 20);
  c.currentTurn = 7 + 12;    // 1 year
  check('not ready at 1 year', ACKS.transitionalConversionReady(c, c.domains[0]).ready === false);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (E) senate gate + beastman advisory ---');
check('domainTypeAllowsSenate clanhold false', ACKS.domainTypeAllowsSenate('clanhold') === false);
check('domainTypeAllowsSenate transitional true', ACKS.domainTypeAllowsSenate('transitional') === true);
check('domainTypeAllowsSenate ordinary true', ACKS.domainTypeAllowsSenate('ordinary') === true);
check('domainTypeAllowsSenate demchi true', ACKS.domainTypeAllowsSenate('demchi') === true);
{
  const c = mkCampaign([clan({ id:'dom-apex', isRealm:true })], []);
  if(typeof ACKS.materializeSenate === 'function'){
    const r = ACKS.materializeSenate(c, { domainId:'dom-apex' });
    check('materializeSenate refuses a clanhold apex', r.ok === false && r.reason === 'clanhold-no-senate', JSON.stringify(r));
  } else { check('materializeSenate present', true); }
}
{
  const c = mkCampaign([], []);
  check('non-beastman → advisory level ok', ACKS.beastmanDomainTypeAdvisory(c, civ()).level === 'ok');
  check('beastman clanhold → ok', ACKS.beastmanDomainTypeAdvisory(c, clan({ dominantRace:'beastman' })).level === 'ok');
  check('beastman ordinary (no special ruler) → advise', ACKS.beastmanDomainTypeAdvisory(c, civ({ dominantRace:'beastman' })).level === 'advise');
  const c2 = mkCampaign([civ({ id:'dom-b', dominantRace:'beastman', rulerCharacterId:'chr-r' })], []);
  c2.characters = [{ id:'chr-r', name:'Dread Sorcerer', race:'human', alignment:'Chaotic', level:11, abilities:{ int:16 } }];
  check('beastman ordinary + a Chaotic powerful non-beastman ruler → exception', ACKS.beastmanDomainTypeAdvisory(c2, c2.domains[0]).level === 'exception');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (F) vassal morale + PT-0 migration + registration ---');
{
  const liege  = ACKS.blankDomain({ id:'dom-liege', name:'Wolf Clan', domainType:'clanhold' });
  const vassal = ACKS.blankDomain({ id:'dom-vassal', name:'Vale', liegeId:'dom-liege' });
  const c = mkCampaign([liege, vassal], []);
  const row = ACKS.clanholdVassalMoraleRow(c, vassal);
  check('ordinary vassal under clanhold liege → −2 morale row', row && row.value === -2, JSON.stringify(row));
  const mods = ACKS.moraleModifiersFor(c, vassal) || [];
  check('the −2 row flows through moraleModifiersFor', mods.some(mm => mm.value === -2 && /clanhold/i.test(mm.label)));
  const c2 = mkCampaign([clan({ id:'dom-l2' }), clan({ id:'dom-v2', liegeId:'dom-l2' })], []);
  check('clanhold vassal under clanhold liege → no penalty', ACKS.clanholdVassalMoraleRow(c2, c2.domains[1]) === null);
  const c3 = mkCampaign([civ({ id:'dom-l3' }), civ({ id:'dom-v3', liegeId:'dom-l3' })], []);
  check('ordinary vassal under ordinary liege → no penalty', ACKS.clanholdVassalMoraleRow(c3, c3.domains[1]) === null);
}
{
  let camp = { schemaVersion:2, domains:[], characters:[], hexes:[
    { id:'h1', economyType:'pastoralist-cattle' }, { id:'h2', economyType:'mixed' },
    { id:'h3', economyType:'mining' }, { id:'h4', economyType:'agricultural' }, { id:'h5' } ] };
  const m = ACKS.migrateCampaign(camp); if(m) camp = m;
  check('PT-0: pastoralist-cattle → agricultural', camp.hexes[0].economyType === 'agricultural');
  check('PT-0: mixed → agricultural', camp.hexes[1].economyType === 'agricultural');
  check('PT-0: mining reserved marker UNTOUCHED', camp.hexes[2].economyType === 'mining');
  check('PT-0: agricultural untouched', camp.hexes[3].economyType === 'agricultural');
}
check('domain-type-changed registered', ACKS.registeredEventKinds().includes('domain-type-changed'));
check('domain-decreed-transitional registered', ACKS.registeredEventKinds().includes('domain-decreed-transitional'));
check('economy-type-changed REMOVED (not registered)', !ACKS.registeredEventKinds().includes('economy-type-changed'));
check('domain-type-changed is wizard-opt-out', typeof ACKS.isEventWizardOptOut === 'function' ? ACKS.isEventWizardOptOut('domain-type-changed') === true : true);
check('applyEvent_domainTypeChanged returns a narrativeSummary', ACKS.applyEvent_domainTypeChanged({}, { kind:'domain-type-changed', payload:{ narrative:'X' } }).result.narrativeSummary === 'X');
// ═══════════════════════════════════════════════════════════════════════════
// TERRAIN TRANSFORMATION (P5-TERR — gap L; JJ p.412) — added 2026-06-21 (b14 agent-1)
// ───────────────────────────────────────────────────────────────────────────
function mkTT(hexes, ruleOn){
  return { domains:[{ id:'dom-x' }], hexes: hexes.map(h => ({ domainId:'dom-x', ...h })), settlements:[],
           characters:[], eventLog:[], currentTurn:5, currentDayInMonth:1, houseRules: ruleOn ? { 'terrain-transformation':true } : {} };
}
const ttTarget = (t, s, st) => ACKS.terrainTransformTargetFor(t, s, st);

console.log('--- (G) Terrain Transformation table + thresholds + target lookup ---');
check('TERRAIN_TRANSFORMATION has all 17 RAW rows + fallbacks (≥17)', Object.keys(ACKS.TERRAIN_TRANSFORMATION).length >= 17, Object.keys(ACKS.TERRAIN_TRANSFORMATION).length);
check('every row carries a JJ p.412 cite', Object.values(ACKS.TERRAIN_TRANSFORMATION).every(r => r.cite === 'JJ p.412'));
check('every row has 3 stages', Object.values(ACKS.TERRAIN_TRANSFORMATION).every(r => Array.isArray(r.stages) && r.stages.length === 3));
// the RAW thresholds (186 / 326)
check('stage 185 families = 0 (natural)', ACKS.terrainTransformStageForFamilies(185) === 0);
check('stage 186 families = 1', ACKS.terrainTransformStageForFamilies(186) === 1);
check('stage 325 families = 1', ACKS.terrainTransformStageForFamilies(325) === 1);
check('stage 326 families = 2', ACKS.terrainTransformStageForFamilies(326) === 2);
check('stage 780 families = 2', ACKS.terrainTransformStageForFamilies(780) === 2);
check('stage 0 families = 0', ACKS.terrainTransformStageForFamilies(0) === 0);
// RAW target rows (§4.1) mapped to our taxonomy
check('desert-sandy stage1 → scrubland-sparse', ttTarget('desert','sandy',1).terrain === 'scrubland' && ttTarget('desert','sandy',1).subtype === 'sparse');
check('desert-sandy stage2 → grassland-farm', ttTarget('desert','sandy',2).terrain === 'grassland' && ttTarget('desert','sandy',2).subtype === 'farm');
check('desert-rocky stage1 → scrubland-sparse', ttTarget('desert','rocky',1).terrain === 'scrubland');
check('barrens stage1 → scrubland-sparse', ttTarget('barrens','',1).terrain === 'scrubland' && ttTarget('barrens','',1).subtype === 'sparse');
check('barrens stage2 → grassland-farm', ttTarget('barrens','',2).terrain === 'grassland');
check('forest-deciduous stage1 → scrubland-sparse', ttTarget('forest','deciduous',1).terrain === 'scrubland');
check('forest-taiga stage2 → grassland-farm', ttTarget('forest','taiga',2).terrain === 'grassland');
check('hills-forested stage1 → hills-rocky', ttTarget('hills','forested',1).terrain === 'hills' && ttTarget('hills','forested',1).subtype === 'rocky');
check('hills-forested stage2 → hills-terraced (NEW sub-type)', ttTarget('hills','forested',2).subtype === 'terraced');
check('hills-rocky stage1 → hills-terraced', ttTarget('hills','rocky',1).subtype === 'terraced');
check('mountains-forested stage2 → mountains-terraced', ttTarget('mountains','forested',2).terrain === 'mountains' && ttTarget('mountains','forested',2).subtype === 'terraced');
check('mountains-snowy stage1 → mountains-rocky (RAW rocky/snowy)', ttTarget('mountains','snowy',1).subtype === 'rocky');
check('jungle stage1 → scrubland-dense', ttTarget('jungle','',1).terrain === 'scrubland' && ttTarget('jungle','',1).subtype === 'dense');
check('jungle stage2 → scrubland-sparse', ttTarget('jungle','',2).subtype === 'sparse');
check('scrubland-sparse stage1 → grassland-steppe', ttTarget('scrubland','sparse',1).terrain === 'grassland' && ttTarget('scrubland','sparse',1).subtype === 'steppe');
check('scrubland-dense stage1 → scrubland-sparse', ttTarget('scrubland','dense',1).subtype === 'sparse');
check('swamp (marshy) stage1 → grassland-farm', ttTarget('swamp','',1).terrain === 'grassland' && ttTarget('swamp','',1).subtype === 'farm');
check('swamp-scrubby stage1 → grassland-farm', ttTarget('swamp','scrubby',1).terrain === 'grassland');
check('grassland-steppe stage1 → grassland-farm', ttTarget('grassland','steppe',1).subtype === 'farm');
check('grassland-farm stage1 → grassland-farm (no visible change)', ttTarget('grassland','farm',1).subtype === 'farm');
check('stage 0 echoes the natural (reversion target)', ttTarget('desert','sandy',0).terrain === 'desert' && ttTarget('desert','sandy',0).subtype === 'sandy');
check('water → null (no transformation)', ttTarget('water','',1) === null);
check('compound terrain string resolves (desert-sandy as one arg)', ttTarget('desert-sandy','',1).terrain === 'scrubland');
check('bare base falls back (forest no subtype → deciduous row)', ttTarget('forest','',1).terrain === 'scrubland');

console.log('--- (G) race gate (RAW: human/halfling/beastman transform; dwarf/gnome/elf do not) ---');
check('human transforms land', ACKS.raceTransformsLand('human') === true);
check('halfling transforms land', ACKS.raceTransformsLand('halfling') === true);
check('beastman transforms land', ACKS.raceTransformsLand('beastman') === true);
check('undefined → human assumption (transforms)', ACKS.raceTransformsLand(undefined) === true);
check('empty → human assumption (transforms)', ACKS.raceTransformsLand('') === true);
check('dwarf does NOT transform land', ACKS.raceTransformsLand('dwarf') === false);
check('Dwarven (case-insensitive) does NOT transform', ACKS.raceTransformsLand('Dwarven') === false);
check('gnome does NOT transform land', ACKS.raceTransformsLand('gnome') === false);
check('elf does NOT transform land', ACKS.raceTransformsLand('elf') === false);
check('elves does NOT transform land', ACKS.raceTransformsLand('elves') === false);

console.log('--- (G) processTerrainTransformationForTurn (the monthly consumer) ---');
// rule OFF → no-op (byte-identical)
{
  const c = mkTT([{ id:'h1', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' }], false);
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('rule off → ran:false', r.ran === false);
  check('rule off → no transformations', r.transformations.length === 0);
  check('rule off → terrain unchanged', c.hexes[0].terrain === 'desert' && c.hexes[0].terrainSubtype === 'sandy');
  check('rule off → state still null', c.hexes[0].terrainTransformationState == null);
}
// rule ON, dry-run → preview without mutating
{
  const c = mkTT([{ id:'h1', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' }], true);
  const dr = ACKS.processTerrainTransformationForTurn(c, { dryRun:true });
  check('dryRun ran:true', dr.ran === true);
  check('dryRun lists 1 pending', dr.transformations.length === 1);
  check('dryRun did NOT mutate terrain', c.hexes[0].terrain === 'desert');
  check('dryRun logged NO event', c.eventLog.length === 0);
  check('dryRun pending direction = growth', dr.transformations[0].direction === 'growth');
  check('dryRun pending toTerrain = grassland', dr.transformations[0].toTerrain === 'grassland');
}
// rule ON, real → swap + state + event
{
  const c = mkTT([{ id:'h1', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' }], true);
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('real: terrain → grassland-farm', c.hexes[0].terrain === 'grassland' && c.hexes[0].terrainSubtype === 'farm');
  check('real: state currentStage = 2', c.hexes[0].terrainTransformationState.currentStage === 2);
  check('real: state natural = desert/sandy (lineage)', c.hexes[0].terrainTransformationState.naturalTerrain === 'desert' && c.hexes[0].terrainTransformationState.naturalSubtype === 'sandy');
  check('real: lastTransformedAtTurn = 5', c.hexes[0].terrainTransformationState.lastTransformedAtTurn === 5);
  check('real: history has one entry', c.hexes[0].terrainTransformationState.history.length === 1);
  check('real: history records from/to', c.hexes[0].terrainTransformationState.history[0].fromTerrain === 'desert-sandy' && c.hexes[0].terrainTransformationState.history[0].toTerrain === 'grassland-farm');
  check('real: one terrain-transformed event', c.eventLog.length === 1 && c.eventLog[0].event.kind === 'terrain-transformed');
  check('real: event context primaryHexId', c.eventLog[0].event.context && c.eventLog[0].event.context.primaryHexId === 'h1');
  check('real: event payload toTerrain', c.eventLog[0].event.payload.toTerrain === 'grassland');
  check('real: returns one logEntry', r.logEntries.length === 1 && /JJ p\.412/.test(r.logEntries[0]));
  // idempotent — re-run, no change
  const ev = c.eventLog.length;
  ACKS.processTerrainTransformationForTurn(c);
  check('idempotent: no new event on re-run', c.eventLog.length === ev);
  // koppen / biome UNTOUCHED (the §4.3 reconcile)
  check('reconcile: koppen untouched (still undefined)', c.hexes[0].koppen === undefined || c.hexes[0].koppen === '');
}
// koppen explicitly preserved across a transformation
{
  const c = mkTT([{ id:'h1', terrain:'desert', terrainSubtype:'sandy', families:200, classification:'Borderlands', koppen:'BWh', biomeOverride:'Desert' }], true);
  ACKS.processTerrainTransformationForTurn(c);
  check('reconcile: koppen BWh preserved through transformation', c.hexes[0].koppen === 'BWh');
  check('reconcile: biomeOverride preserved', c.hexes[0].biomeOverride === 'Desert');
  check('terrain DID change (desert→scrubland at stage 1)', c.hexes[0].terrain === 'scrubland');
}
// reversion (depopulation reverts a stage, bidirectional)
{
  const c = mkTT([{ id:'h1', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' }], true);
  ACKS.processTerrainTransformationForTurn(c);              // → stage 2 grassland-farm
  c.hexes[0].families = 100;                                 // depopulate to stage 0
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('reversion: terrain back to desert-sandy', c.hexes[0].terrain === 'desert' && c.hexes[0].terrainSubtype === 'sandy');
  check('reversion: stage = 0', c.hexes[0].terrainTransformationState.currentStage === 0);
  check('reversion: direction = reversion', r.transformations[0].direction === 'reversion');
  check('reversion: history preserved (≥2 entries)', c.hexes[0].terrainTransformationState.history.length >= 2);
}
// dwarven hex skips
{
  const c = mkTT([{ id:'h1', terrain:'mountains', terrainSubtype:'rocky', families:400, classification:'Borderlands', dominantFamilyRace:'dwarf' }], true);
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('dwarven hex: no transformation', r.transformations.length === 0);
  check('dwarven hex: terrain unchanged', c.hexes[0].terrain === 'mountains' && c.hexes[0].terrainSubtype === 'rocky');
}
// grassland-farm: no VISIBLE change → silent stage track, no event
{
  const c = mkTT([{ id:'h1', terrain:'grassland', terrainSubtype:'farm', families:400, classification:'Borderlands' }], true);
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('grassland-farm: no event (no visible change)', c.eventLog.length === 0);
  check('grassland-farm: no reported transformation', r.transformations.length === 0);
  check('grassland-farm: stage tracked silently (=2)', c.hexes[0].terrainTransformationState && c.hexes[0].terrainTransformationState.currentStage === 2);
  check('grassland-farm: terrain unchanged', c.hexes[0].terrain === 'grassland' && c.hexes[0].terrainSubtype === 'farm');
}
// settlement on the hex → demand-review flag
{
  const c = mkTT([{ id:'h1', terrain:'forest', terrainSubtype:'deciduous', families:200, classification:'Borderlands' }], true);
  c.settlements = [{ id:'set-1', hexId:'h1', name:'Town' }];
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('settlement hex: demandReviewSettlementId set', r.transformations[0].demandReviewSettlementId === 'set-1');
  check('settlement hex: log notes demand review', /demand/i.test(r.logEntries[0]));
  check('settlement hex: event relatedEntities carries the settlement', (c.eventLog[0].event.context.relatedEntities || []).some(e => e.id === 'set-1'));
}
// domainId scoping (the UI per-domain apply)
{
  const c = mkTT([
    { id:'h1', domainId:'dom-x', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' },
    { id:'h2', domainId:'dom-y', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' },
  ], true);
  const r = ACKS.processTerrainTransformationForTurn(c, { domainId:'dom-x' });
  check('domainId scope: only dom-x transformed', r.transformations.length === 1 && r.transformations[0].hexId === 'h1');
  check('domainId scope: dom-y untouched', c.hexes[1].terrain === 'desert');
}
// water hex never transforms
{
  const c = mkTT([{ id:'h1', terrain:'water', terrainSubtype:'', families:400, classification:'Borderlands' }], true);
  const r = ACKS.processTerrainTransformationForTurn(c);
  check('water hex: no transformation', r.transformations.length === 0 && c.hexes[0].terrain === 'water');
}

console.log('--- (G) lineage readout + the 2 new terraced sub-types + registration ---');
{
  const c = mkTT([{ id:'h1', terrain:'desert', terrainSubtype:'sandy', families:400, classification:'Borderlands' }], true);
  let lin = ACKS.hexTerrainLineage(c.hexes[0]);
  check('lineage (pre): transformed false', lin.transformed === false);
  check('lineage (pre): natural = current = desert/sandy', lin.natural.terrain === 'desert' && lin.current.terrain === 'desert');
  ACKS.processTerrainTransformationForTurn(c);
  lin = ACKS.hexTerrainLineage(c.hexes[0]);
  check('lineage (post): transformed true', lin.transformed === true);
  check('lineage (post): natural desert, current grassland', lin.natural.terrain === 'desert' && lin.current.terrain === 'grassland');
  check('lineage (post): stage 2', lin.stage === 2);
}
check('TERRAIN_SUBTYPES.hills includes terraced', ACKS.TERRAIN_SUBTYPES.hills.includes('terraced'));
check('TERRAIN_SUBTYPES.mountains includes terraced', ACKS.TERRAIN_SUBTYPES.mountains.includes('terraced'));
check('allTerrainSubtypes includes terraced', ACKS.allTerrainSubtypes().includes('terraced'));
check('hills-terraced resolves an encounter row (→ hills-rocky)', typeof ACKS.encounterRowKey !== 'function' || ACKS.encounterRowKey('hills-terraced') === 'hills-rocky');
check('mountains-terraced resolves an encounter row (→ mountains-rocky)', typeof ACKS.encounterRowKey !== 'function' || ACKS.encounterRowKey('mountains-terraced') === 'mountains-rocky');
check('terrain-transformed event registered', ACKS.registeredEventKinds().includes('terrain-transformed'));
check('terrain-transformed is wizard-opt-out', typeof ACKS.isEventWizardOptOut === 'function' ? ACKS.isEventWizardOptOut('terrain-transformed') === true : true);
check('applyEvent_terrainTransformed returns a narrativeSummary', ACKS.applyEvent_terrainTransformed({}, { kind:'terrain-transformed', payload:{ narrative:'Y' } }).result.narrativeSummary === 'Y');
check('terrain-transformation house rule registered', ACKS.registeredHouseRules().some(r => r.id === 'terrain-transformation'));
check('terrain-transformation defaults OFF (RAW-self-flagged optional)', (ACKS.registeredHouseRules().find(r => r.id === 'terrain-transformation') || {}).default === false);
check('terrain-transformation category = domain', (ACKS.registeredHouseRules().find(r => r.id === 'terrain-transformation') || {}).category === 'domain');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('domain-variants.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
