// =============================================================================
// tribute.smoke.js — RAW precise tribute by realm families (RR p.346) + the tributePct removal.
// Auto-tribute now computes the fixed RAW obligation (18gp × realm-families^0.6, rounded to 5gp),
// NOT a % of gross income (audit acks-authority I3; Joachim's call: pure RAW, % mode dropped).
// =============================================================================
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'acks-engine-catalogs.js'));
require(path.join(__dirname, '..', 'acks-engine-monsters.js'));
require(path.join(__dirname, '..', 'acks-engine.js'));
require(path.join(__dirname, '..', 'acks-engine-entities.js'));
require(path.join(__dirname, '..', 'acks-engine-economy.js'));
const ACKS = global.ACKS;
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

// ── Formula vs the RR p.346 "Tribute by Realm Families" table anchors ──
// 18 × F^0.6, rounded to 5gp. Cross-checked against ACKS Sources/ACKSII_Revised_Rulebook_r10.md.
[[100, 285], [200, 430], [500, 750], [1000, 1135], [10000, 4520], [100000, 18000], [1000000, 71660]]
  .forEach(([fam, want]) => ok('rawTributeForRealmFamilies(' + fam + ') = ' + want + ' (RR table)',
    ACKS.rawTributeForRealmFamilies(fam) === want, 'got ' + ACKS.rawTributeForRealmFamilies(fam)));
ok('rawTributeForRealmFamilies(0) = 0', ACKS.rawTributeForRealmFamilies(0) === 0);
ok('rawTributeForRealmFamilies(negative) clamps to 0', ACKS.rawTributeForRealmFamilies(-50) === 0);
ok('rawTributeForRealmFamilies(non-number) = 0', ACKS.rawTributeForRealmFamilies('x') === 0);

// ── Factory: tributePct gone, tributeAuto defaults true (the only switch) ──
const bd = ACKS.blankDomain({ name: 'D' });
ok('blankDomain has NO tributePct field', !('tributePct' in bd.expenses));
ok('blankDomain tributeAuto defaults true', bd.expenses.tributeAuto === true);
ok('blankDomain keeps manual tributeToLiege (0)', bd.expenses.tributeToLiege === 0);

// ── Manual path is the existing 5gp rounding (auto off = "set as desired", itself RAW) ──
ok('manual tribute rounds to nearest 5gp', ACKS.roundToNearest5(1234) === 1235 && ACKS.roundToNearest5(1232) === 1230);

// ── tributePct removal migration + idempotency ──
function legacyCampaignWithPct(){
  const d = ACKS.blankDomain({ name: 'V', id: 'dom-v' });
  d.expenses.tributePct = 25;   // a legacy save's custom % — migration must delete it
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-trib', name: 'Trib',
    createdAt: '2026-01-01', lastModifiedAt: '2026-01-01', currentTurn: 1, houseRules: {},
    domains: [d], characters: [], settlements: [], hexes: [], rumors: [],
    pendingEvents: [], eventLog: [], ventures: [], parties: [],
  };
}
const mig = ACKS.migrateCampaign(legacyCampaignWithPct());
ok('migration deletes a legacy tributePct on load', !('tributePct' in mig.domains[0].expenses));
ok('migration preserves tributeAuto + manual tributeToLiege', mig.domains[0].expenses.tributeAuto === true && typeof mig.domains[0].expenses.tributeToLiege === 'number');
const mig2 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(mig)));
ok('migration is idempotent (tributePct stays gone, byte-equal)', !('tributePct' in mig2.domains[0].expenses) && JSON.stringify(mig2) === JSON.stringify(mig));

// NB: tributeOwed() (the auto vs manual branch + the own-domain + sub-vassal realm-families sum) is
// a UI helper in index.html; its engine core is rawTributeForRealmFamilies above, and the full
// auto/manual UI behaviour is browser-verified (the vassals' tribute lines show the RAW amounts).

console.log('\n=============================================');
console.log('tribute.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
