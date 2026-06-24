/* World I/O (Excel import/export) smoke test — the XLS-1..XLS-5 pipeline.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/world-import.smoke.js
 *
 * Covers, WITHOUT a browser or SheetJS (a mock XLSX returns array-of-arrays directly):
 *   XLS-1 — schemaToImportColumns(hex/domain/settlement/lair) + the four field attributes +
 *           validateFieldEntry(enumValues XOR enumSource) + resolveEnumSource/enumValuesForField.
 *   XLS-2 — Domains + Hexes parse → validate → resolve → plan(diff) → commit: hex.domainId claim,
 *           the Liege forward-ref two-pass, coord round-trip, geography reconcile, create + upsert.
 *   XLS-3 — Settlements + Lairs: dependent hex-coord cross-ref + dependency-ordered commit; a blank
 *           lair coord ⇒ dynamic; an unresolved hex ⇒ a hard error (skip + report).
 *   XLS-4 — fuzzy enum "did you mean"; unknown column = a warning; partial import (bad rows skip).
 *   XLS-5 — export → re-import round-trip; coord uniqueness; upsert preserves dependents;
 *           domainless ⇒ unsettled; the Köppen lever; the create-only/upsert mode toggle.
 *
 * Authored 2026-06-24 (World-I/O lane, team session — Phase_2.5_Excel_Import_Plan.md).
 */
'use strict';
const path = require('path');
// The app mixin needs window/document; engine modules read (typeof window !== 'undefined' ? window : global).
global.window = global;
global.document = { createElement(){ return {}; }, head: { appendChild(){} }, body: { appendChild(){}, } };
require('./_engine.js').load();
const ACKS = global.ACKS;
require(path.join(__dirname, '..', 'domain-app-worldio.js'));   // pushes its members onto window.__ACKS_APP_MIXINS__
const MEMBERS = (global.__ACKS_APP_MIXINS__ || []).slice(-1)[0];

let passed = 0, failed = 0;
function check(label, cond, detail){ if(cond){ passed++; } else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; } }
function section(t){ console.log('--- ' + t + ' ---'); }

// ── Test scaffolding: a mock app `this` + a mock XLSX (AOA in/out) ──
function makeApp(campaign){
  const app = Object.create(MEMBERS);
  app.currentCampaign = campaign;
  app.selectedDomainId = null;
  app.worldIO = { mode:'create', preview:null, loading:false, error:'', fileName:'', showErrors:false };
  app._xlsxLoading = null;
  app.showToast = function(){};
  app.markDirty = function(){};
  app.schedulePersist = function(){};
  app.upsertDomain = function(d){ const i = campaign.domains.findIndex(x => x && x.id === d.id); if(i >= 0) campaign.domains[i] = d; else campaign.domains.push(d); };
  Object.defineProperty(app, 'domains', { get(){ return campaign.domains; } });
  return app;
}
const MOCK_XLSX = {
  utils: {
    book_new(){ return { SheetNames: [], Sheets: {} }; },
    aoa_to_sheet(aoa){ return aoa.map(r => r.slice()); },
    book_append_sheet(wb, ws, name){ wb.SheetNames.push(name); wb.Sheets[name] = ws; },
    sheet_to_json(ws){ return ws; }     // a "sheet" IS its AOA in this mock
  }
};
function headers(kind){ return ACKS.schemaToImportColumns(kind).map(c => c.header); }
function row(kind, obj){ return headers(kind).map(h => (h in obj) ? obj[h] : ''); }
function wb(sheets){ const w = { SheetNames: [], Sheets: {} }; Object.keys(sheets).forEach(n => { w.SheetNames.push(n); w.Sheets[n] = sheets[n]; }); return w; }
function blankCamp(){ const c = ACKS.blankCampaign({ name:'Test' }); ['domains','hexes','settlements','lairs'].forEach(k => { if(!Array.isArray(c[k])) c[k] = []; }); return c; }

// ═══════════════════════════════════════════════════════════════════════════════
section('XLS-1 — projection + enumSource + validator');
check('hex projection has Id · Col · Row · Domain · Terrain', (() => { const h = headers('hex'); return ['Id','Col','Row','Domain','Terrain','Subtype','Koppen'].every(x => h.includes(x)); })(), headers('hex').join(','));
check('hex projection EXCLUDES Classification (D5) + Families (D4)', (() => { const h = headers('hex'); return !h.includes('Classification') && !h.includes('Families'); })());
check('domain projection has Liege + PeasantFamilies + TreasuryGp + PrimaryHexCol/Row + TaxRate', (() => { const h = headers('domain'); return ['Liege','PeasantFamilies','TreasuryGp','PrimaryHexCol','PrimaryHexRow','TaxRate'].every(x => h.includes(x)); })(), headers('domain').join(','));
check('settlement projection = Id·HexCol·HexRow·Name·Families·TotalInvestment·FoundedTurn(+Notes)', headers('settlement').join(',') === 'Id,HexCol,HexRow,Name,Families,TotalInvestment,FoundedTurn,Notes');
check('lair projection has HexCol/HexRow + Status + LairType', (() => { const h = headers('lair'); return h.includes('HexCol') && h.includes('Status') && h.includes('LairType'); })());
check('resolveEnumSource TERRAIN_BASES live', ACKS.resolveEnumSource('TERRAIN_BASES').includes('forest'));
check('resolveEnumSource dependent subtypesForTerrain(forest)=deciduous,taiga', ACKS.resolveEnumSource('subtypesForTerrain','forest').join(',') === 'deciduous,taiga');
check('resolveEnumSource KOPPEN_CODES = 30 codes', ACKS.resolveEnumSource('KOPPEN_CODES').length === 30);
check('enumValuesForField uses static enumValues', ACKS.enumValuesForField({ type:'enum', enumValues:['a','b'] }).join(',') === 'a,b');
check('validateFieldEntry ACCEPTS enumSource-only enum', ACKS.validateFieldEntry({ name:'t', type:'enum', enumSource:'TERRAIN_BASES' }).ok === true);
check('validateFieldEntry REJECTS enum with neither', ACKS.validateFieldEntry({ name:'t', type:'enum' }).ok === false);
check('validateFieldEntry REJECTS enum with BOTH', ACKS.validateFieldEntry({ name:'t', type:'enum', enumValues:['a'], enumSource:'X' }).ok === false);
check('validateFieldEntry REJECTS enumSource on a non-enum', ACKS.validateFieldEntry({ name:'t', type:'string', enumSource:'X' }).ok === false);
check('validateAllSchemas() clean with hex/domain/settlement added', ACKS.validateAllSchemas().length === 0, ACKS.validateAllSchemas().slice(0,3).join(' | '));

// ═══════════════════════════════════════════════════════════════════════════════
section('XLS-2 — Domains + Hexes: parse → plan → commit');
{
  const camp = blankCamp(); const app = makeApp(camp);
  const domains = [ headers('domain'),
    row('domain', { Name:'Saltmark',  Type:'rural', Liege:'Crownland', IsRealm:'false', PeasantFamilies:200, UrbanFamilies:0,  Morale:1, TreasuryGp:5000,  TaxRate:'standard' }),   // forward-ref to Crownland (below)
    row('domain', { Name:'Crownland', Type:'rural', Liege:'',          IsRealm:'true',  PeasantFamilies:500, UrbanFamilies:50, Morale:2, TreasuryGp:10000, TaxRate:'standard', PrimaryHexCol:5, PrimaryHexRow:9 })
  ];
  const hexes = [ headers('hex'),
    row('hex', { Col:5, Row:9,  Explored:'true', Terrain:'forest', Subtype:'taiga', ElevationFt:800, GroundCondition:'clear', Domain:'Saltmark' }),
    row('hex', { Col:6, Row:9,  Explored:'true', Terrain:'grassland', Domain:'Crownland' }),
    row('hex', { Col:7, Row:10, Explored:'true', Terrain:'mountains' })   // domainless ⇒ unsettled
  ];
  const plan = app._worldPlanImport(MOCK_XLSX, wb({ Domains: domains, Hexes: hexes }));
  app.worldIO.preview = plan;
  check('plan: no blocking errors', !plan.hasBlockingErrors, JSON.stringify(plan.sheets.map(s => s.rows.map(r => r.errors)).flat(2)));
  check('plan: 2 domains classified create', app.worldSheetTally(plan.sheets.find(s => s.kind === 'domain')).create === 2);
  check('plan: 3 hexes classified create', app.worldSheetTally(plan.sheets.find(s => s.kind === 'hex')).create === 3);
  check('plan: Liege forward-ref to Crownland resolves (no error on Saltmark)', plan.sheets.find(s=>s.kind==='domain').rows[0].errors.length === 0);

  app.worldCommitImport();
  const salt = camp.domains.find(d => d.name === 'Saltmark');
  const crown = camp.domains.find(d => d.name === 'Crownland');
  check('commit: both domains landed', !!salt && !!crown);
  check('commit: Saltmark.liegeId wired to Crownland (forward-ref two-pass)', salt && salt.liegeId === crown.id);
  check('commit: Crownland.vassalIds includes Saltmark', crown && crown.vassalIds.includes(salt.id));
  check('commit: Saltmark demographics promoted (peasantFamilies=200, morale=1)', salt && salt.demographics.peasantFamilies === 200 && salt.demographics.morale === 1);
  check('commit: Saltmark treasury.gp=5000, taxPolicy.rate=standard', salt && salt.treasury.gp === 5000 && salt.taxPolicy.rate === 'standard');
  check('commit: Crownland.geography.primaryHex coord round-trips {q,r} from Col5/Row9', crown && crown.geography.primaryHex && JSON.stringify(crown.geography.primaryHex) === JSON.stringify(ACKS.hexColRowToAxial(5,9)));
  check('commit: 3 hexes landed', camp.hexes.length === 3);
  const h59 = camp.hexes.find(h => { const cr = ACKS.hexAxialToColRow(h.coord.q, h.coord.r); return cr.col === 5 && cr.row === 9; });
  check('commit: hex(5,9) coord round-trips + terrain forest/taiga', h59 && h59.terrain === 'forest' && h59.terrainSubtype === 'taiga');
  check('commit: hex(5,9) domainId claimed by Saltmark (hex.domainId)', h59 && h59.domainId === salt.id);
  const h710 = camp.hexes.find(h => { const cr = ACKS.hexAxialToColRow(h.coord.q, h.coord.r); return cr.col === 7 && cr.row === 10; });
  check('commit: domainless hex(7,10) ⇒ no domainId (unsettled)', h710 && !h710.domainId);
  check('commit: geography reconcile — Saltmark.controlledHexList has hex(5,9)', salt && salt.geography.controlledHexList.includes(h59.id) && salt.geography.controlledHexes === 1);

  // store for the XLS-5 upsert + round-trip tests
  global.__campAfterXLS2 = camp;
}

// ═══════════════════════════════════════════════════════════════════════════════
section('XLS-3 — Settlements + Lairs (dependent hex cross-ref)');
{
  const camp = global.__campAfterXLS2; const app = makeApp(camp);
  const setts = [ headers('settlement'),
    row('settlement', { HexCol:5, HexRow:9, Name:'Saltspur', Families:120, TotalInvestment:30000, FoundedTurn:1 }),   // hex(5,9) exists
    row('settlement', { HexCol:99, HexRow:99, Name:'Nowhere', Families:10 })                                          // hex(99,99) missing ⇒ error
  ];
  const lairs = [ headers('lair'),
    row('lair', { HexCol:7, HexRow:10, Name:'Bloodfang Cave', Status:'active', LairType:'natural-cave', MonsterCatalogKey:'ogre' }),
    row('lair', { Name:'Wandering pool entry', LairType:'lair' })   // blank coord ⇒ dynamic
  ];
  const plan = app._worldPlanImport(MOCK_XLSX, wb({ Settlements: setts, Lairs: lairs }));
  app.worldIO.preview = plan;
  const sSheet = plan.sheets.find(s => s.kind === 'settlement');
  check('settlement(5,9) resolves (no error)', sSheet.rows[0].errors.length === 0, JSON.stringify(sSheet.rows[0].errors));
  check('settlement(99,99) → hard error (unresolved hex)', sSheet.rows[1].errors.length > 0);
  check('settlement tally: 1 create · 1 error (partial import)', app.worldSheetTally(sSheet).create === 1 && app.worldSheetTally(sSheet).error === 1);
  const lSheet = plan.sheets.find(s => s.kind === 'lair');
  check('lair with coord + lair without coord both plan create (2)', app.worldSheetTally(lSheet).create === 2);

  app.worldCommitImport();
  const sp = camp.settlements.find(s => s.name === 'Saltspur');
  check('commit: Saltspur landed on hex(5,9) (hexId set)', sp && sp.hexId === camp.hexes.find(h => { const cr = ACKS.hexAxialToColRow(h.coord.q, h.coord.r); return cr.col === 5 && cr.row === 9; }).id);
  check('commit: Saltspur families=120, investment=30000', sp && sp.families === 120 && sp.totalInvestment === 30000);
  check('commit: "Nowhere" was NOT created (skipped on error)', !camp.settlements.some(s => s.name === 'Nowhere'));
  const cave = camp.lairs.find(l => l.name === 'Bloodfang Cave');
  check('commit: placed lair on hex(7,10), status active', cave && cave.hexId === camp.hexes.find(h => { const cr = ACKS.hexAxialToColRow(h.coord.q, h.coord.r); return cr.col === 7 && cr.row === 10; }).id && cave.status === 'active');
  const dyn = camp.lairs.find(l => l.name === 'Wandering pool entry');
  check('commit: coordless lair ⇒ dynamic (hexId null, status dynamic)', dyn && !dyn.hexId && dyn.status === 'dynamic');
}

// ═══════════════════════════════════════════════════════════════════════════════
section('XLS-5 — upsert preserves dependents · round-trip · coord uniqueness · Köppen lever · mode toggle');
{
  // (a) UPSERT preserves dependents: re-import Saltmark by Id with a new Morale; hexes/settlement intact.
  const camp = global.__campAfterXLS2; const app = makeApp(camp); app.worldIO.mode = 'upsert';
  const salt = camp.domains.find(d => d.name === 'Saltmark');
  const hexCountBefore = camp.hexes.length, settCountBefore = camp.settlements.length;
  const plan = app._worldPlanImport(MOCK_XLSX, wb({ Domains: [ headers('domain'), row('domain', { Id: salt.id, Name:'Saltmark', Morale: 5 }) ] }));
  app.worldIO.preview = plan;
  check('upsert: existing Saltmark row classified UPDATE', app.worldRowAction(plan.sheets.find(s => s.kind === 'domain').rows[0]) === 'update');
  app.worldCommitImport();
  const salt2 = camp.domains.find(d => d.id === salt.id);
  check('upsert: Morale updated to 5', salt2.demographics.morale === 5);
  check('upsert: peasantFamilies UNTOUCHED (still 200 — only present columns change)', salt2.demographics.peasantFamilies === 200);
  check('upsert: hexes preserved (count unchanged)', camp.hexes.length === hexCountBefore);
  check('upsert: settlements preserved', camp.settlements.length === settCountBefore);
  check('upsert: liege link preserved', salt2.liegeId === camp.domains.find(d => d.name === 'Crownland').id);

  // (b) CREATE-ONLY mode skips an existing target; coord-uniqueness: a hex at an occupied coord is the target.
  const app2 = makeApp(camp); app2.worldIO.mode = 'create';
  const plan2 = app2._worldPlanImport(MOCK_XLSX, wb({ Hexes: [ headers('hex'), row('hex', { Col:5, Row:9, Terrain:'desert' }) ] }));
  const hexRow2 = plan2.sheets.find(s => s.kind === 'hex').rows[0];
  check('create-only: a hex at an existing coord ⇒ skip-exists (not a duplicate)', app2.worldRowAction(hexRow2) === 'skip-exists');
  app2.worldIO.mode = 'upsert';
  check('upsert mode: same row flips to UPDATE (mode toggle, no re-parse)', app2.worldRowAction(hexRow2) === 'update');

  // (c) Köppen lever: Koppen set, Terrain blank ⇒ terrain filled from the suggestion + a warning.
  const app3 = makeApp(camp); app3.worldIO.mode = 'upsert';
  const planK = app3._worldPlanImport(MOCK_XLSX, wb({ Hexes: [ headers('hex'), row('hex', { Col:20, Row:20, Koppen:'Af' }) ] }));   // Af → jungle
  const kr = planK.sheets.find(s => s.kind === 'hex').rows[0];
  check('Köppen lever: Terrain auto-filled (jungle) + a warning', kr.values.terrain === 'jungle' && kr.warnings.some(w => /Köppen/i.test(w)), JSON.stringify({ t: kr.values.terrain, w: kr.warnings }));

  // (d) fuzzy enum + unknown column (XLS-4)
  const app4 = makeApp(blankCamp());
  const planF = app4._worldPlanImport(MOCK_XLSX, wb({ Hexes: [ headers('hex').concat(['Bogus']), row('hex', { Col:1, Row:1, Terrain:'Forrest' }).concat(['x']) ] }));
  const fr = planF.sheets.find(s => s.kind === 'hex').rows[0];
  check('fuzzy: "Forrest" → corrected to forest + a warning', fr.values.terrain === 'forest' && fr.warnings.some(w => /Forrest/i.test(w)));
  check('unknown column "Bogus" → a warning (ignored, not an error)', planF.sheets.find(s => s.kind === 'hex').unknownColumns.includes('Bogus'));

  // (e) ROUND-TRIP: export the live campaign → re-import → same domain/hex/settlement counts + coords.
  const wbExport = makeApp(camp)._worldBuildWorkbook(MOCK_XLSX, { template: false });
  check('export: workbook has Domains/Hexes/Settlements/Lairs/Reference/_meta sheets', ['Domains','Hexes','Settlements','Lairs','Reference','_meta'].every(n => wbExport.SheetNames.includes(n)));
  const fresh = blankCamp(); const app5 = makeApp(fresh); app5.worldIO.mode = 'create';
  const planRT = app5._worldPlanImport(MOCK_XLSX, wbExport);
  app5.worldIO.preview = planRT; app5.worldCommitImport();
  check('round-trip: domain count preserved', fresh.domains.length === camp.domains.length, fresh.domains.length + ' vs ' + camp.domains.length);
  check('round-trip: hex count preserved', fresh.hexes.length === camp.hexes.length, fresh.hexes.length + ' vs ' + camp.hexes.length);
  check('round-trip: a hex coord survives (5,9 forest still present)', fresh.hexes.some(h => { const cr = ACKS.hexAxialToColRow(h.coord.q, h.coord.r); return cr.col === 5 && cr.row === 9 && h.terrain === 'forest'; }));
  const rtSalt = fresh.domains.find(d => d.name === 'Saltmark');
  const rtCrown = fresh.domains.find(d => d.name === 'Crownland');
  check('round-trip: Saltmark→Crownland liege link survives (export-as-Name, re-resolve)', rtSalt && rtCrown && rtSalt.liegeId === rtCrown.id);
  check('round-trip: hex domain claim survives (Saltmark owns hex(5,9))', (() => { const h = fresh.hexes.find(x => { const cr = ACKS.hexAxialToColRow(x.coord.q, x.coord.r); return cr.col === 5 && cr.row === 9; }); return h && rtSalt && h.domainId === rtSalt.id; })());
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\nworld-import.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
if(failed > 0) process.exit(1);
