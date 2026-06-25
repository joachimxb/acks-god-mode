/* tests/load-campaign.smoke.js — G2 (audit 2026-06-24): ACKS.loadCampaign(raw) headless entry.
 *
 *   node tests/load-campaign.smoke.js   (or via `npm test`)
 *
 * INTEGRATION.md §5's `migrateCampaign(raw)` recipe left legacy nested-mirror hexes trapped
 * (campaign.hexes === undefined) because the lift/strip steps lived ONLY in the UI's _finishLoad.
 * G2 lifts those finish steps into the engine: loadCampaign(raw) = migrateCampaign → finalizeCampaignLoad.
 * This proves a nested-mirror campaign round-trips to a populated campaign.hexes headlessly, and that
 * the finish is idempotent + leaves an already-flat campaign untouched.
 */
'use strict';
const ACKS = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n— ' + t); }

// A legacy nested-mirror campaign: hexes live in domain.geography.hexes[], campaign.hexes absent.
function nestedFixture(){
  const c = ACKS.blankCampaign({ name: 'nested' });
  const d = ACKS.blankDomain({ id: 'dom-1', name: 'Testmark' });
  d.geography = d.geography || {};
  d.geography.hexes = [
    { schemaVersion: 2, id: 'hex-nest1', coord: { q: 1, r: 1 }, terrain: 'grassland', domainId: d.id },
    { schemaVersion: 2, id: 'hex-nest2', coord: { q: 2, r: 2 }, terrain: 'forest', domainId: d.id }
  ];
  c.domains = [d];
  delete c.hexes;   // the trapped-hex precondition
  return JSON.parse(JSON.stringify(c));
}

// =============================================================================
section('exports');
ok('ACKS.loadCampaign is a function', typeof ACKS.loadCampaign === 'function');
ok('ACKS.finalizeCampaignLoad is a function', typeof ACKS.finalizeCampaignLoad === 'function');

// =============================================================================
section('loadCampaign lifts trapped nested-mirror hexes (the senior-engineer C1 repro)');
const raw = nestedFixture();
ok('precondition: campaign.hexes is absent, hexes are nested', raw.hexes === undefined && raw.domains[0].geography.hexes.length === 2);
const loaded = ACKS.loadCampaign(raw);
ok('after loadCampaign: campaign.hexes is populated', Array.isArray(loaded.hexes) && loaded.hexes.length === 2);
ok('the lifted hexes keep their ids', loaded.hexes.map(h => h.id).sort().join(',') === 'hex-nest1,hex-nest2');
ok('the nested mirror is stripped (single-home)', !(loaded.domains[0].geography && loaded.domains[0].geography.hexes));
ok('arrays are ensured (pendingEvents / eventLog / settlements / rumors)',
  Array.isArray(loaded.pendingEvents) && Array.isArray(loaded.eventLog) && Array.isArray(loaded.settlements) && Array.isArray(loaded.rumors));

// =============================================================================
section('loadCampaign === migrateCampaign + finalizeCampaignLoad (one path)');
const a = ACKS.loadCampaign(nestedFixture());
const b = ACKS.finalizeCampaignLoad(ACKS.migrateCampaign(nestedFixture()));
ok('the two paths produce the same lifted hex set', JSON.stringify(a.hexes.map(h => h.id).sort()) === JSON.stringify(b.hexes.map(h => h.id).sort()));

// =============================================================================
section('finalizeCampaignLoad is idempotent + harmless on an already-flat campaign');
const once = ACKS.loadCampaign(nestedFixture());
const twiceIds = ACKS.finalizeCampaignLoad(once).hexes.map(h => h.id).sort().join(',');
ok('running finalize again does not duplicate or drop hexes', twiceIds === 'hex-nest1,hex-nest2');

const flat = ACKS.blankCampaign({ name: 'flat' });
flat.hexes = [ ACKS.blankHex({ id: 'hex-flat', coord: { q: 0, r: 0 }, terrain: 'grassland' }) ];
const flatLoaded = ACKS.finalizeCampaignLoad(JSON.parse(JSON.stringify(flat)));
ok('an already-flat campaign keeps its top-level hex', (flatLoaded.hexes || []).some(h => h.id === 'hex-flat'));

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — load-campaign.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
