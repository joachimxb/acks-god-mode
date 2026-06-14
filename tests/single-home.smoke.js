// =============================================================================
// single-home.smoke.js — T6 (audit 2026-06-14, integration C1 / thermonuclear).
//
// The dual-homed collections (hexes / settlements / units live BOTH top-level AND
// nested under domains[].geography / hexes[].settlement / domains[].garrison /
// characters[].mercenaryCompany) must not persist DIVERGENT copies. INTEGRATION.md §3
// states the rule: the top-level collection is authoritative; the nested copies are
// engine-rebuilt mirrors. ACKS.projectNestedMirrors makes that true at SAVE time —
// after serialize, every nested copy is a strict, deep, exact projection of its
// canonical top-level entity, so a save→reload can't produce two divergent entities.
//
// This suite locks: the projection heals a divergent campaign; a save (stampCampaignForSave)
// produces no divergent copies; membership is derived from the canonical pointers
// (hex.domainId / settlement.hexId / unit.stationedAt); the projection is pure-wrt-non-mirror-
// fields + idempotent; and the integration reviewer's exact finding (nested ≠ top-level on a
// round-trip) no longer reproduces on the shipped templates.
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
// Count nested copies that DIVERGE from (or are missing) their top-level entity.
function hexDivergence(c){
  const top = new Map((c.hexes||[]).map(h => [h.id, h]));
  let div = 0, total = 0;
  for(const d of (c.domains||[])){
    for(const h of ((d.geography && d.geography.hexes) || [])){
      total++;
      const t = top.get(h.id);
      if(!t || JSON.stringify(t) !== JSON.stringify(h)) div++;
    }
  }
  return { div, total };
}
function settlementDivergence(c){
  const top = new Map((c.settlements||[]).map(s => [s.id, s]));
  let div = 0, total = 0;
  for(const h of (c.hexes||[])){
    if(h.settlement && h.settlement.id){
      total++;
      const t = top.get(h.settlement.id);
      if(!t || JSON.stringify(t) !== JSON.stringify(h.settlement)) div++;
    }
  }
  return { div, total };
}
function unitDivergence(c){
  const top = new Map((c.units||[]).map(u => [u.id, u]));
  let div = 0, total = 0;
  const scan = (arr) => { for(const u of (arr||[])){ total++; const t = top.get(u.id); if(!t || JSON.stringify(t) !== JSON.stringify(u)) div++; } };
  for(const d of (c.domains||[])) scan(d.garrison && d.garrison.units);
  for(const ch of (c.characters||[])) scan(ch.mercenaryCompany && ch.mercenaryCompany.units);
  return { div, total };
}
// Strip the mirror arrays so we can assert projectNestedMirrors changed NOTHING else.
function stripMirrors(c){
  const x = clone(c);
  for(const d of (x.domains||[])){ if(d.geography) d.geography.hexes = '<<m>>'; if(d.garrison) d.garrison.units = '<<m>>'; }
  for(const h of (x.hexes||[])){ if('settlement' in h) h.settlement = '<<m>>'; }
  for(const ch of (x.characters||[])){ if(ch.mercenaryCompany) ch.mercenaryCompany.units = '<<m>>'; }
  return x;
}

console.log('--- export surface ---');
ok('ACKS.projectNestedMirrors is a function', typeof ACKS.projectNestedMirrors === 'function');

// =============================================================================
console.log('--- (1) hand-built divergent campaign → projection heals all three mirrors ---');
// Top-level is the rich/authoritative copy; nested copies are deliberately thin + stale (the
// shipped-template failure mode: a hex authored 25 keys top-level / 18 keys nested).
function divergentCampaign(){
  const hexFull = { schemaVersion: 2, kind: 'hex', id: 'hex-1', domainId: 'dom-a', coord: { q: 0, r: 0 }, terrain: 'grassland', families: 120, valuePerFamily: 5, hasRoad: true, roadSides: [0], economyType: 'agricultural', elevationFt: 200 };
  const hexThin = { schemaVersion: 2, kind: 'hex', id: 'hex-1', coord: { q: 0, r: 0 }, terrain: 'grassland', families: 999 }; // stale + thin
  const setFull = { schemaVersion: 2, kind: 'settlement', id: 'set-1', hexId: 'hex-1', name: 'Town', families: 80, totalInvestment: 5000 };
  const setThin = { schemaVersion: 2, kind: 'settlement', id: 'set-1', hexId: 'hex-1', name: 'Town', families: 11 }; // stale
  const unitFull = { schemaVersion: 2, kind: 'unit', id: 'unit-1', displayName: 'Foot', count: 60, stationedAt: { kind: 'domain-garrison', id: 'dom-a' }, brPerSoldier: 0.05 };
  const unitThin = { schemaVersion: 2, kind: 'unit', id: 'unit-1', displayName: 'Foot', count: 1, stationedAt: { kind: 'domain-garrison', id: 'dom-a' } };
  const mercFull = { schemaVersion: 2, kind: 'unit', id: 'unit-2', displayName: 'Bows', count: 20, stationedAt: { kind: 'character', id: 'chr-1' } };
  const mercThin = { schemaVersion: 2, kind: 'unit', id: 'unit-2', displayName: 'Bows', count: 2, stationedAt: { kind: 'character', id: 'chr-1' } };
  const hexTopWithThinSettlement = clone(hexFull); hexTopWithThinSettlement.settlement = setThin; // hex.settlement stale vs top-level
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-div', name: 'Div', currentTurn: 1, houseRules: {},
    hexes: [hexTopWithThinSettlement],
    settlements: [setFull],
    units: [unitFull, mercFull],
    characters: [{ schemaVersion: 2, kind: 'character', id: 'chr-1', name: 'Cap', mercenaryCompany: { units: [mercThin] } }],
    domains: [{ schemaVersion: 2, kind: 'domain', id: 'dom-a', name: 'A',
      geography: { hexes: [hexThin] },
      garrison: { units: [unitThin] } }],
    eventLog: [], rumors: [],
  };
}
const dc = divergentCampaign();
ok('precondition: built campaign IS divergent (hex)', hexDivergence(dc).div === 1);
ok('precondition: built campaign IS divergent (settlement)', settlementDivergence(dc).div === 1);
ok('precondition: built campaign IS divergent (units)', unitDivergence(dc).div === 2);

const healed = ACKS.projectNestedMirrors(clone(dc));
ok('projection heals hex divergence', hexDivergence(healed).div === 0 && hexDivergence(healed).total === 1);
ok('projection heals settlement divergence (hex.settlement)', settlementDivergence(healed).div === 0 && settlementDivergence(healed).total === 1);
ok('projection heals garrison + mercenary unit divergence', unitDivergence(healed).div === 0 && unitDivergence(healed).total === 2);
// the nested copies now carry the canonical (rich) values, not the stale ones
ok('nested hex now has the canonical families (120, not stale 999)', healed.domains[0].geography.hexes[0].families === 120);
ok('nested hex now carries the rich keys (hasRoad)', healed.domains[0].geography.hexes[0].hasRoad === true);
ok('nested hex.settlement now canonical (80 families, not stale 11)', healed.hexes[0].settlement.families === 80);
ok('garrison unit now canonical (count 60, not stale 1)', healed.domains[0].garrison.units[0].count === 60);
ok('merc unit now canonical (count 20, not stale 2)', healed.characters[0].mercenaryCompany.units[0].count === 20);

// =============================================================================
console.log('--- (2) projection is a deep copy (mutating top-level later does not touch nested) ---');
const h2 = ACKS.projectNestedMirrors(clone(dc));
h2.hexes[0].families = 7;       // mutate the canonical copy
ok('nested hex is an independent deep copy (not a shared ref)', h2.domains[0].geography.hexes[0].families === 120);
ok('nested hex is not === the top-level object', h2.domains[0].geography.hexes[0] !== h2.hexes[0]);

// =============================================================================
console.log('--- (3) membership is derived from the canonical pointers ---');
// move a hex to a different domain via hex.domainId; projection re-homes the nested copy.
const mc = clone(dc);
mc.domains.push({ schemaVersion: 2, kind: 'domain', id: 'dom-b', name: 'B', geography: { hexes: [] }, garrison: { units: [] } });
mc.hexes[0].domainId = 'dom-b';
const moved = ACKS.projectNestedMirrors(mc);
ok('hex re-homed: dom-a nested hexes now empty', (moved.domains.find(d=>d.id==='dom-a').geography.hexes||[]).length === 0);
ok('hex re-homed: dom-b nested hexes now hold it', (moved.domains.find(d=>d.id==='dom-b').geography.hexes||[]).some(h=>h.id==='hex-1'));
// move a unit to a character via stationedAt
const uc = clone(dc);
uc.units[0].stationedAt = { kind: 'character', id: 'chr-1' };
const umoved = ACKS.projectNestedMirrors(uc);
ok('unit re-homed: dom-a garrison empty', (umoved.domains[0].garrison.units||[]).length === 0);
ok('unit re-homed: chr-1 company holds both units', (umoved.characters[0].mercenaryCompany.units||[]).length === 2);
// a top-level hex whose domainId points nowhere is simply absent from every nested mirror (wilderness)
const wc = clone(dc); wc.hexes[0].domainId = null;
const wmoved = ACKS.projectNestedMirrors(wc);
ok('wilderness hex (domainId null) lands in no domain mirror', (wmoved.domains[0].geography.hexes||[]).length === 0);

// =============================================================================
console.log('--- (4) projection touches ONLY the mirror arrays + is idempotent ---');
ok('projection leaves all non-mirror fields byte-identical', JSON.stringify(stripMirrors(dc)) === JSON.stringify(stripMirrors(healed)));
const twice = ACKS.projectNestedMirrors(clone(healed));
ok('projection is idempotent (project∘project === project)', JSON.stringify(twice) === JSON.stringify(healed));
// a campaign with NO mirrors / no domains is a clean no-op
const bare = { schemaVersion: 2, kind: 'campaign', id: 'cmp-bare', name: 'Bare', hexes: [], settlements: [], units: [], domains: [], characters: [] };
ok('projection is a no-op on a mirror-less campaign', JSON.stringify(ACKS.projectNestedMirrors(clone(bare))) === JSON.stringify(bare));

// =============================================================================
console.log('--- (5) stampCampaignForSave routes through the projection (no divergent copies on disk) ---');
const saved = ACKS.stampCampaignForSave(dc, { savedAt: '2026-06-14' });
ok('stampCampaignForSave output: 0 hex divergence', hexDivergence(saved).div === 0);
ok('stampCampaignForSave output: 0 settlement divergence', settlementDivergence(saved).div === 0);
ok('stampCampaignForSave output: 0 unit divergence', unitDivergence(saved).div === 0);
ok('stampCampaignForSave does NOT mutate its input (still divergent)', hexDivergence(dc).div === 1);
ok('stampCampaignForSave stamps engineVersion', saved.engineVersion === ACKS.ENGINE_VERSION);

// =============================================================================
console.log('--- (6) the integration finding no longer reproduces on the shipped templates ---');
// Reproduce the reviewer's deep-compare: load each template through the app pipeline, serialize,
// and assert the on-disk nested copies are a strict projection of top-level (no 25-vs-18 split).
function appLoad(raw){
  let camp = ACKS.migrateCampaign(clone(raw));
  if(!Array.isArray(camp.hexes)) camp.hexes = [];
  if(!Array.isArray(camp.settlements)) camp.settlements = [];
  if(!Array.isArray(camp.rumors)) camp.rumors = [];
  const ds = camp.domains || [];
  ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => ACKS.migrateHexToAccumulatedImprovement(h)));
  ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => ACKS.migrateHexToMultiSupervisor(h)));
  ds.forEach(d => ACKS.ensureMagistratesShape(d));
  const synth = { domains: ds, hexes: camp.hexes, settlements: camp.settlements, rumors: camp.rumors };
  ACKS.liftToTopLevelCollections(synth);
  camp.hexes = synth.hexes; camp.settlements = synth.settlements; camp.rumors = synth.rumors;
  ACKS.migrateAgriculturalToProjects(camp);
  return camp;
}
const tplDir = path.join(DIR, 'Templates');
fs.readdirSync(tplDir).filter(f => /^v2-.*\.acks\.json$/.test(f)).forEach(f => {
  const raw = JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8'));
  const camp = appLoad(raw);
  const out = ACKS.stampCampaignForSave(camp, { savedAt: '2026-06-14' });
  const hd = hexDivergence(out), sd = settlementDivergence(out), ud = unitDivergence(out);
  ok('saved template has 0 divergent copies: ' + f, hd.div === 0 && sd.div === 0 && ud.div === 0,
     'hex ' + hd.div + '/' + hd.total + ', set ' + sd.div + '/' + sd.total + ', unit ' + ud.div + '/' + ud.total);
});

// And a full save→reload round-trip on the demo: the structural guarantee is that NO save ever
// produces divergent copies — on the first save, and again after a reload. (Whole-campaign byte
// stability is a SEPARATE, pre-existing content matter: v2-established-march/the demo ship a
// peasantFamilies(480)↔per-hex-rural-families(300) inconsistency that the families-per-hex reconcile
// collapses on the first save→reload — independent of T6's mirror projection. See the SUMMARY +
// the §11.11 follow-up note. This suite locks the mirror invariant, not that content bug.)
require('../acks-demo-template.js');
const demoSaved = ACKS.stampCampaignForSave(appLoad(global.ACKS_DEMO_TEMPLATE), { savedAt: '2026-06-14' });
ok('demo save: 0 divergent copies on disk', hexDivergence(demoSaved).div === 0 && settlementDivergence(demoSaved).div === 0 && unitDivergence(demoSaved).div === 0);
const demoResaved = ACKS.stampCampaignForSave(appLoad(demoSaved), { savedAt: '2026-06-14' });
ok('demo save→reload→save: still 0 divergent copies (mirror invariant holds across the round-trip)',
   hexDivergence(demoResaved).div === 0 && settlementDivergence(demoResaved).div === 0 && unitDivergence(demoResaved).div === 0);

// ─── summary ───
console.log('\n=============================================');
console.log('single-home.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
