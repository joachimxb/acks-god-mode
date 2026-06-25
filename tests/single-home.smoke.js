// =============================================================================
// single-home.smoke.js — T6 single-home (2026-06-21).
//
// The hexes / settlements / units used to live in TWO homes: top-level
// (campaign.hexes / .settlements / .units) AND nested (domains[].geography.hexes /
// hexes[].settlement / domains[].garrison.units / characters[].mercenaryCompany.units).
// The reader sweep made every reader read the top-level collection, so the nested
// mirror is now deleted: it is ABSENT in memory after load and ABSENT on disk after
// save. The single home is the only home. Membership is the canonical pointer
// (hex.domainId / settlement.hexId / unit.stationedAt) on the top-level entity.
//
// This suite locks: an old/nested-only campaign loads via lift-then-strip (the nested
// data is promoted to top-level, then the mirror is stripped); migrateCampaign strips the
// UNIT mirror (order 155); stripHexSettlementMirrors strips the hex/settlement mirror;
// a save (stampCampaignForSave) carries NO nested mirror; the strip is idempotent + pure
// wrt the canonical entities; and the shipped templates ship single-homed on disk.
// =============================================================================
const path = require('path');
const fs = require('fs');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;
const DIR = path.join(__dirname, '..');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }
const clone = (o) => JSON.parse(JSON.stringify(o));

// --- helpers --------------------------------------------------------------
// Count surviving NESTED mirror entries of each kind (the single-home target is 0).
function nestedHexes(c){ let n = 0; for(const d of (c.domains||[])){ if(d.geography && Array.isArray(d.geography.hexes)) n += d.geography.hexes.length; } return n; }
function nestedSettlements(c){ let n = 0; for(const h of (c.hexes||[])){ if(h && 'settlement' in h) n++; } return n; }
function nestedUnits(c){
  let n = 0;
  for(const d of (c.domains||[])){ if(d.garrison && Array.isArray(d.garrison.units)) n += d.garrison.units.length; }
  for(const ch of (c.characters||[])){ if(ch.mercenaryCompany && Array.isArray(ch.mercenaryCompany.units)) n += ch.mercenaryCompany.units.length; }
  return n;
}
// Any surviving nested-mirror KEY at all (even an empty array / wrapper)?
function anyNestedMirrorKey(c){
  for(const d of (c.domains||[])){ if(d.geography && 'hexes' in d.geography) return true; if('garrison' in d) return true; }
  for(const h of (c.hexes||[])){ if(h && 'settlement' in h) return true; }
  for(const ch of (c.characters||[])){ if('mercenaryCompany' in ch) return true; }
  return false;
}
// The full load path (index.html _finishLoad): migrate (strips the unit mirror) → lift → strip
// hex/settlement mirror. Leaves the single-home in-memory shape.
function appLoad(raw){
  let camp = ACKS.migrateCampaign(clone(raw));
  ['domains','hexes','settlements','rumors'].forEach(k => { if(!Array.isArray(camp[k])) camp[k] = []; });
  const ds = camp.domains;
  ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => ACKS.migrateHexToAccumulatedImprovement(h)));
  ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => ACKS.migrateHexToMultiSupervisor(h)));
  ds.forEach(d => ACKS.ensureMagistratesShape(d));
  const synth = { domains: ds, hexes: camp.hexes, settlements: camp.settlements, rumors: camp.rumors };
  ACKS.liftToTopLevelCollections(synth);
  camp.hexes = synth.hexes; camp.settlements = synth.settlements; camp.rumors = synth.rumors;
  ACKS.migrateAgriculturalToProjects(camp);
  ACKS.stripHexSettlementMirrors(camp);
  return camp;
}

console.log('--- export surface ---');
ok('ACKS.stripNestedMirrors is a function', typeof ACKS.stripNestedMirrors === 'function');
ok('ACKS.stripUnitMirrors is a function', typeof ACKS.stripUnitMirrors === 'function');
ok('ACKS.stripHexSettlementMirrors is a function', typeof ACKS.stripHexSettlementMirrors === 'function');
ok('the old projectNestedMirrors is GONE', typeof ACKS.projectNestedMirrors === 'undefined');

// =============================================================================
console.log('--- (1) an OLD nested-only campaign loads via lift-then-strip (single home) ---');
// The shape a pre-T6 file / a v1 import carries: hexes/settlements/units ONLY nested, top-level empty.
function nestedOnlyCampaign(){
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-old', name: 'Old', currentTurn: 1, houseRules: {},
    hexes: [], settlements: [], units: [], rumors: [], eventLog: [],
    characters: [{ schemaVersion: 2, kind: 'character', id: 'chr-1', name: 'Cap',
      mercenaryCompany: { units: [{ schemaVersion: 2, id: 'unit-2', displayName: 'Bows', count: 20 }] } }],
    domains: [{ schemaVersion: 2, kind: 'domain', id: 'dom-a', name: 'A',
      demographics: { peasantFamilies: 120, urbanFamilies: 80, morale: 0 },
      geography: { hexes: [
        { schemaVersion: 2, id: 'hex-1', coord: { q: 0, r: 0 }, terrain: 'grassland', families: 120,
          settlement: { schemaVersion: 2, id: 'set-1', name: 'Town', families: 80 } }
      ] },
      garrison: { units: [{ schemaVersion: 2, id: 'unit-1', displayName: 'Foot', count: 60 }] } }]
  };
}
const loaded = appLoad(nestedOnlyCampaign());
ok('lift promoted the hex to campaign.hexes', (loaded.hexes||[]).some(h => h.id === 'hex-1'));
ok('lift promoted the settlement to campaign.settlements (with hexId)',
  (loaded.settlements||[]).some(s => s.id === 'set-1' && s.hexId === 'hex-1'));
ok('lift promoted the garrison unit to campaign.units (stationedAt the domain)',
  (loaded.units||[]).some(u => u.id === 'unit-1' && u.stationedAt && u.stationedAt.kind === 'domain-garrison' && u.stationedAt.id === 'dom-a'));
ok('lift promoted the mercenary unit to campaign.units (stationedAt the character)',
  (loaded.units||[]).some(u => u.id === 'unit-2' && u.stationedAt && u.stationedAt.kind === 'character' && u.stationedAt.id === 'chr-1'));
ok('lift backfilled hex.domainId from nested membership', ACKS.findHex(loaded, 'hex-1').domainId === 'dom-a');
ok('NO nested hexes remain after load', nestedHexes(loaded) === 0);
ok('NO nested settlements remain after load', nestedSettlements(loaded) === 0);
ok('NO nested units remain after load', nestedUnits(loaded) === 0);
ok('NO nested-mirror KEY remains after load (geography.hexes / garrison / hex.settlement / mercenaryCompany)',
  anyNestedMirrorKey(loaded) === false);
// the canonical accessors find the lifted entities
ok('hexesForDomain finds the lifted hex', ACKS.hexesForDomain(loaded, 'dom-a').length === 1);
ok('unitsStationedAt finds the lifted garrison unit', ACKS.unitsStationedAt(loaded, { kind: 'domain-garrison', id: 'dom-a' }).length === 1);
ok('unitsStationedAt finds the lifted merc unit', ACKS.unitsStationedAt(loaded, { kind: 'character', id: 'chr-1' }).length === 1);

// =============================================================================
console.log('--- (2) migrateCampaign strips the UNIT mirror (order 155); the hex/settlement strip is _finishLoad ---');
const m = ACKS.migrateCampaign(clone(nestedOnlyCampaign()));
ok('migrateCampaign promoted units to campaign.units', (m.units||[]).length === 2);
ok('migrateCampaign stripped the garrison mirror (no d.garrison)', !('garrison' in m.domains[0]));
ok('migrateCampaign stripped the mercenaryCompany mirror', !('mercenaryCompany' in m.characters[0]));
// migrateCampaign does NOT lift/strip hexes (that's _finishLoad) — the nested hex survives a migrate-only pass
ok('migrateCampaign leaves the nested hex (hex lift/strip is _finishLoad, not migrate)', nestedHexes(m) === 1);
ok('stripHexSettlementMirrors then removes the nested hex + settlement', (function(){ const x = ACKS.stripHexSettlementMirrors(clone(m)); return nestedHexes(x) === 0 && !('hexes' in (x.domains[0].geography||{})); })());

// =============================================================================
console.log('--- (3) the strips are idempotent + leave the canonical entities untouched ---');
const onceStripped = appLoad(nestedOnlyCampaign());
const twiceStripped = ACKS.stripNestedMirrors(clone(onceStripped));
ok('strip is idempotent (strip∘load === load)', JSON.stringify(twiceStripped) === JSON.stringify(onceStripped));
// the canonical top-level entities are byte-identical before/after a redundant strip
ok('canonical hexes untouched by a redundant strip', JSON.stringify(twiceStripped.hexes) === JSON.stringify(onceStripped.hexes));
ok('canonical units untouched by a redundant strip', JSON.stringify(twiceStripped.units) === JSON.stringify(onceStripped.units));
// a mirror-less campaign is a clean no-op
const bare = { schemaVersion: 2, kind: 'campaign', id: 'cmp-bare', name: 'Bare', hexes: [], settlements: [], units: [], domains: [], characters: [] };
ok('strip is a no-op on a mirror-less campaign', JSON.stringify(ACKS.stripNestedMirrors(clone(bare))) === JSON.stringify(bare));

// =============================================================================
console.log('--- (4) stampCampaignForSave carries NO nested mirror to disk ---');
const saved = ACKS.stampCampaignForSave(appLoad(nestedOnlyCampaign()), { savedAt: '2026-06-21' });
ok('saved file: 0 nested hexes', nestedHexes(saved) === 0);
ok('saved file: 0 nested settlements', nestedSettlements(saved) === 0);
ok('saved file: 0 nested units', nestedUnits(saved) === 0);
ok('saved file: no nested-mirror key at all', anyNestedMirrorKey(saved) === false);
ok('saved file keeps the canonical collections', (saved.hexes||[]).length === 1 && (saved.settlements||[]).length === 1 && (saved.units||[]).length === 2);
ok('stampCampaignForSave stamps engineVersion', saved.engineVersion === ACKS.ENGINE_VERSION);
// stamp clones — it must not mutate the loaded campaign (which already had no mirror, but assert clone-ness)
const loadedRef = appLoad(nestedOnlyCampaign());
ACKS.stampCampaignForSave(loadedRef, { savedAt: '2026-06-21' });
ok('stampCampaignForSave does not mutate its input', anyNestedMirrorKey(loadedRef) === false && (loadedRef.units||[]).length === 2);

// =============================================================================
console.log('--- (5) the shipped templates ship single-homed on disk (regenerated) ---');
const tplDir = path.join(DIR, 'Templates');
fs.readdirSync(tplDir).filter(f => /^v2-.*\.acks\.json$/.test(f)).forEach(f => {
  const raw = JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8'));
  ok('template ships with NO nested mirror on disk: ' + f, anyNestedMirrorKey(raw) === false,
     'nestedHexes ' + nestedHexes(raw) + ', nestedUnits ' + nestedUnits(raw) + ', nestedSettlements ' + nestedSettlements(raw));
  // and it round-trips: load → save → still single-homed
  const out = ACKS.stampCampaignForSave(appLoad(raw), { savedAt: '2026-06-21' });
  ok('template round-trips single-homed: ' + f, anyNestedMirrorKey(out) === false);
});

// the demo too
require('../acks-demo-template.js');
ok('the demo ships with NO nested mirror on disk', anyNestedMirrorKey(global.ACKS_DEMO_TEMPLATE) === false);
const demoSaved = ACKS.stampCampaignForSave(appLoad(global.ACKS_DEMO_TEMPLATE), { savedAt: '2026-06-21' });
ok('demo save: no nested mirror on disk', anyNestedMirrorKey(demoSaved) === false);
const demoResaved = ACKS.stampCampaignForSave(appLoad(demoSaved), { savedAt: '2026-06-21' });
ok('demo save→reload→save: still single-homed', anyNestedMirrorKey(demoResaved) === false);

// =============================================================================
console.log('--- (6) commitTurn drives the economy off the canonical collections on a STRIPPED campaign (the browser path) ---');
// The suite's OTHER commitTurn tests run on a non-stripped campaign (a headless migrate has no
// _finishLoad, so the nested hex/settlement mirror survives there). This is the one test that runs
// proposeMonthlyTurn/commitTurn AFTER the hex/settlement strip — proving the agricultural + urban
// loops read campaign.hexes / campaign.settlements (NOT the now-absent nested mirror). That is the
// silent-breaker class T6 must not regress: a missed reader would read [] and quietly do nothing.
{
  // A fully-shaped campaign whose hex + settlement live ONLY in the top-level collections (the
  // single-home shape — no domain.geography.hexes / hex.settlement). If a propose/commit reader
  // still reached for the nested mirror it would read undefined/[] and silently do nothing.
  const camp = ACKS.blankCampaign({ name: 'StrippedTurn' });
  camp.houseRules = { 'abstract-construction': { enabled: true } }; // instant ag path
  const d = ACKS.blankDomain({ name: 'March' }); d.treasury = { gp: 1000000 };
  d.demographics.peasantFamilies = 1000; d.demographics.urbanFamilies = 0; d.demographics.morale = 0;
  camp.domains = [d];
  const hex = ACKS.blankHex({ id: 'hex-sh', coord: { q: 0, r: 0 } });
  hex.valuePerFamily = 5; hex.families = 100; hex.domainId = d.id;
  camp.hexes = [hex];
  const settle = ACKS.blankSettlement({ id: 'set-sh', name: 'Shtown' });
  settle.hexId = 'hex-sh'; settle.families = 200; settle.marketClass = 5;
  camp.settlements = [settle];
  // blankHex seeds a benign settlement:null mirror field (stripped on every save/load) — strip it so
  // the fixture is the true post-load single-home shape.
  ACKS.stripHexSettlementMirrors(camp);
  ok('(6) precondition: the hex lives only in campaign.hexes (no nested mirror)',
     !(d.geography && d.geography.hexes) && anyNestedMirrorKey(camp) === false);
  const prop = ACKS.proposeMonthlyTurn(camp);
  const tp = prop.turnProposal.find(t => t.domainId === d.id);
  ok('(6) proposeMonthlyTurn built an agricultural order from campaign.hexes', !!tp && (tp.agriculturalOrders||[]).some(o => o.hexId === 'hex-sh'));
  ok('(6) proposeMonthlyTurn built an urban-investment line from campaign.settlements', !!tp && (tp.urbanInvestments||[]).some(o => o.hexId === 'hex-sh'));
  tp.agriculturalOrders.find(o => o.hexId === 'hex-sh').gpAmount = 25000;
  ACKS.commitTurn(camp, prop);
  ok('(6) commitTurn applied the agricultural bonus to the canonical hex (read campaign.hexes, not a nested mirror)',
     ACKS.findHex(camp, 'hex-sh').landImprovementBonus >= 1, 'bonus ' + ACKS.findHex(camp, 'hex-sh').landImprovementBonus);
  ok('(6) commitTurn debited the treasury (improvement spent)', d.treasury.gp < 1000000);
  ok('(6) still no nested mirror after a full turn', anyNestedMirrorKey(camp) === false);
}

// ─── summary ───
console.log('\n=============================================');
console.log('single-home.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
