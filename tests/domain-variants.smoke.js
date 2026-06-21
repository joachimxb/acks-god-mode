/* Domain Variants smoke test — Phase 5 §3 Pastoralist economics (P5-PAST).
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/domain-variants.smoke.js
 *
 * Covers acks-engine-domain-variants.js:
 *   (A) the PASTORALIST_ECONOMICS catalog + caloric efficiencies + the pastoralistFamilyCap
 *       worked examples (plan §3.3a: cattle 113 / swine 158 / sheep 37·75·156, agricultural no-op 375).
 *   (B) rearability gating (a HINT only) — terrain-base mapping for the RAW per-terrain constraint.
 *   (C) the land-revenue density factor + applyPastoralistLandRevenue — the per-hex carrying-capacity
 *       cap (gp/family unchanged), exact in the per-hex branch [Σ min(fam,cap)·val], no-op (byte-
 *       identical) for agricultural / under-cap / no-per-hex-families, rural-only (urban hex excluded).
 *   (D) setHexEconomyType + the record-only `economy-type-changed` event (idempotent / validated /
 *       context envelope).
 *   (E) the demo integration — flipping a populous hex to a low-efficiency economy drops the Land
 *       revenue row + logs one event; the pristine (all-agricultural) demo is byte-identical.
 *   (F) event-kind registration (kind + wizardOptOut + schema).
 *   (G) Terrain Transformation (P5-TERR, JJ p.412 — b14): the TERRAIN_TRANSFORMATION table (every RAW
 *       row + target lookups), the 186/326 thresholds, the human/halfling/beastman race gate, the
 *       processTerrainTransformationForTurn monthly consumer (rule-off no-op / dry-run / growth + state
 *       + event / idempotent / bidirectional reversion / dwarven skip / grassland-farm silent stage /
 *       settlement demand-flag / domainId scoping / water skip), the koppen+biome reconcile (untouched),
 *       the lineage readout, the 2 new terraced sub-types, + event/house-rule registration (default OFF).
 *
 * Authored 2026-06-21 (b13 team session, agent-2); §G added 2026-06-21 (b14 team session, agent-1).
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

// A minimal campaign for the per-hex density math — incomeBreakdown's land row only needs hexes
// (effectiveHexValue + settlementForHex + hexesForDomain). valuePerFamily drives effectiveHexValue.
function mkCampaign(hexes, settlements){
  return { domains: [{ id: 'dom-x', name: 'Test March' }], hexes: hexes.map(h => ({ domainId: 'dom-x', ...h })),
           settlements: settlements || [], characters: [], eventLog: [], currentTurn: 3, currentDayInMonth: 1, houseRules: {} };
}
const DOM = { id: 'dom-x', name: 'Test March' };

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (A) catalog + caloric efficiency + family caps ---');
check('5 pastoralist economy types', ACKS.pastoralistEconomyTypes().length === 5, ACKS.pastoralistEconomyTypes().join(','));
check('types are the §3.2 enum', ['pastoralist-cattle','pastoralist-goat','pastoralist-sheep','pastoralist-swine','mixed'].every(k => ACKS.pastoralistEconomyTypes().includes(k)));
check('isPastoralistEconomy(cattle) true', ACKS.isPastoralistEconomy('pastoralist-cattle') === true);
check('isPastoralistEconomy(agricultural) false', ACKS.isPastoralistEconomy('agricultural') === false);
check('isPastoralistEconomy(mining) false (reserved marker)', ACKS.isPastoralistEconomy('mining') === false);
check('caloric cattle 0.30', ACKS.caloricEfficiencyFor('pastoralist-cattle') === 0.30);
check('caloric goat 0.37', ACKS.caloricEfficiencyFor('pastoralist-goat') === 0.37);
check('caloric sheep 0.20', ACKS.caloricEfficiencyFor('pastoralist-sheep') === 0.20);
check('caloric swine 0.42', ACKS.caloricEfficiencyFor('pastoralist-swine') === 0.42);
check('caloric mixed 0.40', ACKS.caloricEfficiencyFor('mixed') === 0.40);
check('caloric agricultural 1.0 (baseline, no-op)', ACKS.caloricEfficiencyFor('agricultural') === 1);
check('caloric mining 1.0 (reserved → no-op)', ACKS.caloricEfficiencyFor('mining') === 1);
// agricultural caps (RR p.340)
check('agri cap civilized 780', ACKS.agriculturalFamilyCapFor('Civilized') === 780);
check('agri cap borderlands 375', ACKS.agriculturalFamilyCapFor('Borderlands') === 375);
check('agri cap outlands 185', ACKS.agriculturalFamilyCapFor('Outlands') === 185);
check('agri cap unsettled 185', ACKS.agriculturalFamilyCapFor('unsettled') === 185);
check('agri cap case-insensitive', ACKS.agriculturalFamilyCapFor('BORDERLANDS') === 375);
check('agri cap unknown → outlands default 185', ACKS.agriculturalFamilyCapFor('xyz') === 185);
// pastoralist caps (plan §3.3a worked examples)
check('cattle Borderlands cap 113 (375×0.30)', ACKS.pastoralistFamilyCap('Borderlands','pastoralist-cattle') === 113);
check('swine Borderlands cap 158 (375×0.42)', ACKS.pastoralistFamilyCap('Borderlands','pastoralist-swine') === 158);
check('sheep Outlands cap 37 (185×0.20)', ACKS.pastoralistFamilyCap('Outlands','pastoralist-sheep') === 37);
check('sheep Borderlands cap 75 (375×0.20)', ACKS.pastoralistFamilyCap('Borderlands','pastoralist-sheep') === 75);
check('sheep Civilized cap 156 (780×0.20)', ACKS.pastoralistFamilyCap('Civilized','pastoralist-sheep') === 156);
check('goat Civilized cap 289 (780×0.37)', ACKS.pastoralistFamilyCap('Civilized','pastoralist-goat') === 289);
check('agricultural "cap" = the full agri cap (no reduction)', ACKS.pastoralistFamilyCap('Borderlands','agricultural') === 375);
check('label cattle', ACKS.pastoralistEconomyLabel('pastoralist-cattle') === 'Cattle');
check('label agricultural', ACKS.pastoralistEconomyLabel('agricultural') === 'Agricultural');
check('catalog entries carry a JJ cite', ['pastoralist-cattle','pastoralist-goat','pastoralist-sheep','pastoralist-swine','mixed'].every(k => /^JJ p\.43[678]$/.test(ACKS.PASTORALIST_ECONOMICS[k].cite)));

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (B) rearability (a hint, never a block) ---');
check('cattle rearable on grassland', ACKS.isTerrainRearable('pastoralist-cattle','grassland') === true);
check('cattle NOT rearable on mountains', ACKS.isTerrainRearable('pastoralist-cattle','mountains') === false);
check('cattle NOT rearable on desert', ACKS.isTerrainRearable('pastoralist-cattle','desert') === false);
check('goat rearable on barrens', ACKS.isTerrainRearable('pastoralist-goat','barrens') === true);
check('sheep NOT rearable on barrens (RAW: not Barrens)', ACKS.isTerrainRearable('pastoralist-sheep','barrens') === false);
check('sheep rearable on mountains', ACKS.isTerrainRearable('pastoralist-sheep','mountains') === true);
check('swine rearable on swamp', ACKS.isTerrainRearable('pastoralist-swine','swamp') === true);
check('swine rearable on jungle', ACKS.isTerrainRearable('pastoralist-swine','jungle') === true);
check('terrain sub-type resolves to base (hills-forested → hills)', ACKS.isTerrainRearable('pastoralist-cattle','hills-forested') === true);
check('agricultural rearable anywhere (no constraint)', ACKS.isTerrainRearable('agricultural','desert') === true);
check('rearableTerrainFor agricultural is null', ACKS.rearableTerrainFor('agricultural') === null);
check('rearableTerrainFor cattle is a 4-base set', (ACKS.rearableTerrainFor('pastoralist-cattle')||[]).length === 4);

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (C) land-revenue density factor + applyPastoralistLandRevenue ---');
// One Borderlands hex, 224 families, value 6, flipped sheep (cap 75): factor = min(224,75)/224.
{
  const camp = mkCampaign([{ id: 'h1', families: 224, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'pastoralist-sheep' }]);
  const f = ACKS.domainPastoralistLandFactor(camp, DOM);
  check('single sheep hex factor = 75/224', approx(f, 75 / 224), f);
  const base = { label: 'Land revenue (hex)', gp: 224 * 6 };  // mirror the per-hex branch
  const out = ACKS.applyPastoralistLandRevenue(camp, DOM, base, { hexes: camp.hexes });
  check('applyPastoralist gp = Σ min(fam,cap)·val exactly (75×6=450)', out.gp === 450, out.gp);
  check('applyPastoralist annotates the label (75/224 ≈ 33%)', /pastoralist density ×33%/.test(out.label), out.label);
  check('original row object NOT mutated (returns a new row)', base.gp === 224 * 6);
}
// Agricultural-only → factor 1 → applyPastoralist is a byte-identical no-op (returns the SAME object).
{
  const camp = mkCampaign([{ id: 'h1', families: 224, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'agricultural' }]);
  check('agricultural-only factor = 1', ACKS.domainPastoralistLandFactor(camp, DOM) === 1);
  const base = { label: 'Land revenue', gp: 1344 };
  const out = ACKS.applyPastoralistLandRevenue(camp, DOM, base, { hexes: camp.hexes });
  check('applyPastoralist no-op returns the SAME row object (byte-identical)', out === base);
}
// A pastoralist hex UNDER its cap → no reduction (RAW: income/family unchanged below capacity).
{
  const camp = mkCampaign([{ id: 'h1', families: 50, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'pastoralist-cattle' }]); // cattle cap 113 > 50
  check('under-cap pastoralist factor = 1 (no reduction)', ACKS.domainPastoralistLandFactor(camp, DOM) === 1);
}
// Mixed agricultural + sheep: exact per-hex weighted factor.
{
  const camp = mkCampaign([
    { id: 'h1', families: 200, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 5, economyType: 'pastoralist-sheep' }, // cap 75
    { id: 'h2', families: 100, classification: 'Borderlands', terrain: 'plains', valuePerFamily: 7, economyType: 'agricultural' },
  ]);
  const num = 75 * 5 + 100 * 7, den = 200 * 5 + 100 * 7;   // min(200,75)=75 ; agri unchanged
  check('mixed-domain factor = weighted Σ min/Σ fam', approx(ACKS.domainPastoralistLandFactor(camp, DOM), num / den), ACKS.domainPastoralistLandFactor(camp, DOM));
  const base = { label: 'Land', gp: den };
  check('applyPastoralist exact = Σ min(fam,cap)·val', ACKS.applyPastoralistLandRevenue(camp, DOM, base, { hexes: camp.hexes }).gp === ACKS.bankersRound(num), ACKS.applyPastoralistLandRevenue(camp, DOM, base, { hexes: camp.hexes }).gp);
}
// Urban hex (bears a settlement) is excluded — rural-only land density.
{
  const camp = mkCampaign(
    [{ id: 'h1', families: 224, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'pastoralist-sheep' }],
    [{ id: 'set-1', hexId: 'h1', name: 'Town', families: 224 }]);
  check('a pastoralist hex bearing a settlement is excluded (factor 1)', ACKS.domainPastoralistLandFactor(camp, DOM) === 1);
}
// No per-hex families (pure-aggregate domain) → factor 1 (v1 boundary; the cap readout still shows).
{
  const camp = mkCampaign([{ id: 'h1', families: 0, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'pastoralist-sheep' }]);
  check('no per-hex families → factor 1 (v1 boundary)', ACKS.domainPastoralistLandFactor(camp, DOM) === 1);
  const info = ACKS.hexPastoralistInfo(camp, camp.hexes[0]);
  check('hexPastoralistInfo still shows the cap readout (75) even at 0 families', info.pastoralistCap === 75, info.pastoralistCap);
  check('hexPastoralistInfo overCap false at 0 families', info.overCap === false);
}
// hexPastoralistInfo shape on a populous over-cap hex.
{
  const camp = mkCampaign([{ id: 'h1', families: 224, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'pastoralist-sheep' }]);
  const info = ACKS.hexPastoralistInfo(camp, camp.hexes[0]);
  check('hexInfo isPastoralist', info.isPastoralist === true);
  check('hexInfo agriculturalCap 375', info.agriculturalCap === 375);
  check('hexInfo pastoralistCap 75', info.pastoralistCap === 75);
  check('hexInfo effectiveFamilies 75', info.effectiveFamilies === 75);
  check('hexInfo overCap true', info.overCap === true);
  check('hexInfo surplus 149', info.surplus === 149);
  check('hexInfo rearable true (sheep on grassland)', info.rearable === true);
}
// domainPastoralistInfo summary.
{
  const camp = mkCampaign([
    { id: 'h1', families: 224, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'pastoralist-sheep' },
    { id: 'h2', families: 100, classification: 'Borderlands', terrain: 'plains', valuePerFamily: 6, economyType: 'agricultural' },
  ]);
  const di = ACKS.domainPastoralistInfo(camp, DOM);
  check('domainInfo hasPastoralist', di.hasPastoralist === true);
  check('domainInfo ruralHexCount 2', di.ruralHexCount === 2);
  check('domainInfo pastoralistHexCount 1', di.pastoralistHexCount === 1);
  check('domainInfo densityPct < 100', di.densityPct < 100, di.densityPct);
  check('domainInfo hexes carry a hexLabel', di.hexes.every(h => typeof h.hexLabel === 'string' && h.hexLabel.length > 0));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (D) setHexEconomyType + the economy-type-changed event ---');
{
  const camp = mkCampaign([{ id: 'h1', families: 224, classification: 'Borderlands', terrain: 'grassland', valuePerFamily: 6, economyType: 'agricultural' }]);
  const r = ACKS.setHexEconomyType(camp, 'h1', 'pastoralist-cattle');
  check('set ok', r.ok === true && r.from === 'agricultural' && r.to === 'pastoralist-cattle');
  check('hex.economyType written', camp.hexes[0].economyType === 'pastoralist-cattle');
  check('one event logged', camp.eventLog.length === 1);
  const ev = camp.eventLog[0].event;
  check('event kind economy-type-changed', ev.kind === 'economy-type-changed');
  check('event payload from/to/hexId', ev.payload.from === 'agricultural' && ev.payload.to === 'pastoralist-cattle' && ev.payload.hexId === 'h1');
  check('event context primaryHexId (the §8.9 envelope)', ev.context && ev.context.primaryHexId === 'h1', JSON.stringify(ev.context));
  check('event context domainId', ev.context && ev.context.domainId === 'dom-x');
  check('event status applied (record-only)', (ev.status === 'applied' || (ACKS.EVENT_STATUS && ev.status === ACKS.EVENT_STATUS.APPLIED)));
  // idempotent — setting the same value logs nothing more
  const r2 = ACKS.setHexEconomyType(camp, 'h1', 'pastoralist-cattle');
  check('idempotent: unchanged flag + no new event', r2.ok === true && r2.unchanged === true && camp.eventLog.length === 1);
  // guards
  check('no-hex guard', ACKS.setHexEconomyType(camp, 'nope', 'pastoralist-cattle').reason === 'no-hex');
  check('invalid-economy-type guard', ACKS.setHexEconomyType(camp, 'h1', 'banana').reason === 'invalid-economy-type');
  check('reserved marker (mining) accepted as valid', ACKS.setHexEconomyType(camp, 'h1', 'mining').ok === true);
  check('back to agricultural accepted', ACKS.setHexEconomyType(camp, 'h1', 'agricultural').ok === true);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (E) demo integration (matches the browser-verify) ---');
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  let camp = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
  const m = ACKS.migrateCampaign(camp); if(m) camp = m;
  const d = camp.domains.find(x => /saltspur/i.test(x.name)) || camp.domains[0];
  const landOf = () => (ACKS.incomeBreakdown(camp, d).find(r => /Land revenue/.test(r.label)) || {});
  const before = landOf();
  check('pristine demo land row is byte-identical (no pastoralist annotation)', !/pastoralist density/.test(before.label || ''), before.label);
  const rural = (ACKS.hexesForDomain(camp, d.id) || []).filter(h => !ACKS.settlementForHex(camp, h.id) && (h.families || 0) > 0)
    .sort((a, b) => (b.families || 0) - (a.families || 0));
  check('demo domain has a populous rural hex', rural.length > 0 && rural[0].families > 75);
  const evBefore = camp.eventLog.length;
  const r = ACKS.setHexEconomyType(camp, rural[0].id, 'pastoralist-sheep');
  const after = landOf();
  check('flip → land revenue DROPS', (after.gp || 0) < (before.gp || 0), before.gp + ' → ' + after.gp);
  check('flip → land row annotated', /pastoralist density/.test(after.label || ''), after.label);
  check('flip → exactly one economy-type-changed event', camp.eventLog.length - evBefore === 1 && camp.eventLog[camp.eventLog.length - 1].event.kind === 'economy-type-changed');
  // revert → byte-identical again (the density goes away)
  ACKS.setHexEconomyType(camp, rural[0].id, 'agricultural');
  check('revert to agricultural → land row byte-identical again', landOf().gp === before.gp && !/pastoralist density/.test(landOf().label || ''), landOf().gp + ' vs ' + before.gp);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('--- (F) event-kind registration (self-registered, PR #89 kernel) ---');
check('economy-type-changed registered', ACKS.registeredEventKinds().includes('economy-type-changed'));
check('economy-type-changed is wizard-opt-out', typeof ACKS.isEventWizardOptOut === 'function' ? ACKS.isEventWizardOptOut('economy-type-changed') === true : true);
check('applyEvent_domainVariantAudit returns a narrativeSummary', (ACKS.applyEvent_domainVariantAudit({}, { kind: 'economy-type-changed', payload: { narrative: 'X' } }).result.narrativeSummary) === 'X');

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
