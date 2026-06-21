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
 *
 * Authored 2026-06-21 (b13 team session, agent-2). Independent of the central registries — the module
 * self-registers its event kind via ACKS.registerEventKind (PR #89 kernel).
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

// ───────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('domain-variants.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
