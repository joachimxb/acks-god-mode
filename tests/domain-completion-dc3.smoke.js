/* Domain Completion DC-3 — the morale-effects loop smoke test.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/domain-completion-dc3.smoke.js
 *
 * Covers the DC-3 accessor added to acks-engine-domain-completion.js — ACKS.domainMoraleEffects,
 * the SINGLE source for the RR pp.350–351 per-band cross-subsystem effects (the Vagaries-of-
 * Recruitment modifier, the vassal-Loyalty-check modifier, conscript/militia leviability + muster
 * morale, and the spy/thief throw modifier). The canonical prose home for every number is
 * MORALE_STATE_TEXT in acks-engine.js (RR pp.349–351); this suite locks the machine-readable
 * values band-by-band against it, proves the shipped income factor + bandit count are DELEGATED
 * (no double-count), and exercises each consumer's read of the single source
 * (Domain_Completion_Plan.md §2.4 + §11; DC-3 handoff).
 *
 * Authored 2026-06-13 — burst3 team session (CLAUDE §15), agent-4 (Domain Completion DC-3).
 */

const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

// A minimal domain at a given morale + family count (the only inputs the accessor reads).
function mkDomain(morale, fam){
  const d = ACKS.blankDomain({ id: 'dom-dc3', name: 'Frontier' });
  d.demographics.morale = morale;
  d.demographics.peasantFamilies = (fam != null ? fam : 0);
  return d;
}
function mkCampaign(domains){
  return { schemaVersion: 2, kind: 'campaign', currentTurn: 5, domains: domains || [], hexes: [], settlements: [], eventLog: [] };
}
const C = mkCampaign();
const E = (morale, fam) => ACKS.domainMoraleEffects(C, mkDomain(morale, fam));

// The full RR pp.350–351 per-band expectation table (every number traced to MORALE_STATE_TEXT).
//                         morale: [income, popSwing, recruitVagary, vassalLoyalty, leviable, conscriptMorale, spyThief]
const BANDS = {
  '-4': [0,    -4, -20, -2, false, 0, 0],
  '-3': [0.5,  -3, -10, -1, false, 0, 0],
  '-2': [0.8,  -2,  -5,  0, false, 0, 0],
  '-1': [1,    -1,   0,  0, true, -1, 0],
  '0':  [1,     0,   0,  0, true, -1, 0],
  '1':  [1,     1,   0,  0, true,  0, -1],
  '2':  [1,     2,   5,  0, true,  0, -2],
  '3':  [1,     3,  10,  1, true,  1, -3],
  '4':  [1,     4,  20,  2, true,  1, -4],
};

// ─────────────────────────────────────────────────────────────────────────
section('Export on global.ACKS');
check('ACKS.domainMoraleEffects exported', typeof ACKS.domainMoraleEffects === 'function');

// ─────────────────────────────────────────────────────────────────────────
section('Per-band effects — all 9 morale bands, locked to RR pp.350–351 (MORALE_STATE_TEXT)');
for(let m = -4; m <= 4; m++){
  const exp = BANDS[String(m)];
  const e = E(m, 0);
  check('m=' + m + ' morale field', e.morale === m, e.morale);
  check('m=' + m + ' label matches MORALE_LEVEL_NAMES', e.label === ACKS.MORALE_LEVEL_NAMES[String(m)], e.label);
  check('m=' + m + ' emoji matches MORALE_EMOJI', e.emoji === ACKS.MORALE_EMOJI[String(m)], e.emoji);
  check('m=' + m + ' incomeFactor = ' + exp[0], e.incomeFactor === exp[0], e.incomeFactor);
  check('m=' + m + ' populationSwingDicePerThousand = ' + exp[1], e.populationSwingDicePerThousand === exp[1], e.populationSwingDicePerThousand);
  check('m=' + m + ' recruitmentVagary = ' + exp[2], e.recruitmentVagary === exp[2], e.recruitmentVagary);
  check('m=' + m + ' vassalLoyalty = ' + exp[3], e.vassalLoyalty === exp[3], e.vassalLoyalty);
  check('m=' + m + ' conscriptsLeviable = ' + exp[4], e.conscriptsLeviable === exp[4], e.conscriptsLeviable);
  check('m=' + m + ' conscriptMorale = ' + exp[5], e.conscriptMorale === exp[5], e.conscriptMorale);
  check('m=' + m + ' spyThiefThrow = ' + exp[6], e.spyThiefThrow === exp[6], e.spyThiefThrow);
}

// ─────────────────────────────────────────────────────────────────────────
section('No double-count — income factor + bandit count are DELEGATED to the shipped economy helpers');
for(let m = -4; m <= 4; m++){
  const d = mkDomain(m, 1000);
  const e = ACKS.domainMoraleEffects(C, d);
  check('m=' + m + ' incomeFactor === ACKS.incomeFactor(m) (delegated, not redefined)', e.incomeFactor === ACKS.incomeFactor(m), e.incomeFactor + ' vs ' + ACKS.incomeFactor(m));
  check('m=' + m + ' banditCount === ACKS.banditCount(d) (delegated, not redefined)', e.banditCount === ACKS.banditCount(d), e.banditCount + ' vs ' + ACKS.banditCount(d));
}
// Spot-check the delegated bandit counts at fam=1000 (RR p.350: 1/family ≤−4, 1/2 at −3, 1/5 at −2, 0 else).
check('banditCount at −4, 1000 fam = 1000', E(-4, 1000).banditCount === 1000, E(-4, 1000).banditCount);
check('banditCount at −3, 1000 fam = 500',  E(-3, 1000).banditCount === 500,  E(-3, 1000).banditCount);
check('banditCount at −2, 1000 fam = 200',  E(-2, 1000).banditCount === 200,  E(-2, 1000).banditCount);
check('banditCount at −1, 1000 fam = 0',    E(-1, 1000).banditCount === 0,    E(-1, 1000).banditCount);
check('banditCount at +4, 1000 fam = 0',    E(4, 1000).banditCount === 0,     E(4, 1000).banditCount);

// ─────────────────────────────────────────────────────────────────────────
section('Defensive — clamping, missing fields, null domain never throw');
check('morale below −4 clamps to −4 band', E(-9, 0).morale === -4 && E(-9, 0).recruitmentVagary === -20);
check('morale above +4 clamps to +4 band', E(9, 0).morale === 4 && E(9, 0).vassalLoyalty === 2);
(function(){
  // A domain with no demographics block reads morale 0 (the Apathetic band), no throw.
  let threw = false, e;
  try { e = ACKS.domainMoraleEffects(C, { id: 'd', kind: 'domain' }); } catch(err){ threw = true; }
  check('domain with no demographics does not throw', !threw);
  check('… and reads the morale-0 band', e && e.morale === 0 && e.conscriptsLeviable === true && e.conscriptMorale === -1);
})();
(function(){
  let threw = false, e;
  try { e = ACKS.domainMoraleEffects(C, null); } catch(err){ threw = true; }
  check('null domain does not throw', !threw);
  check('… and reads the morale-0 band', e && e.morale === 0);
})();
(function(){
  // No campaign passed (the accessor only needs the domain) — still resolves.
  let threw = false, e;
  try { e = ACKS.domainMoraleEffects(null, mkDomain(3, 0)); } catch(err){ threw = true; }
  check('null campaign does not throw', !threw);
  check('… and still reports the band from the domain', e && e.morale === 3 && e.spyThiefThrow === -3);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Consumer reads — each cross-subsystem consumer reads the single source');
(function(){
  // Vagaries-of-Recruitment roll consumer: adds .recruitmentVagary to its roll.
  const base = 8;
  check('recruitment consumer at +4 → roll +20', base + E(4, 0).recruitmentVagary === 28);
  check('recruitment consumer at −4 → roll −20', base + E(-4, 0).recruitmentVagary === -12);
  check('recruitment consumer at −1 → unchanged', base + E(-1, 0).recruitmentVagary === 8);
})();
(function(){
  // Vassal Loyalty-roll consumer: adds .vassalLoyalty to a vassal's loyalty modifier.
  const baseMod = 0;
  check('loyalty consumer at +4 → +2', baseMod + E(4, 0).vassalLoyalty === 2);
  check('loyalty consumer at +3 → +1', baseMod + E(3, 0).vassalLoyalty === 1);
  check('loyalty consumer at −4 → −2', baseMod + E(-4, 0).vassalLoyalty === -2);
  check('loyalty consumer at 0 → unchanged', baseMod + E(0, 0).vassalLoyalty === 0);
})();
(function(){
  // Conscript/militia levy consumer: gates on .conscriptsLeviable, applies .conscriptMorale.
  check('levy gated OFF at −2 (cannot raise conscripts/militia)', E(-2, 0).conscriptsLeviable === false);
  check('levy gated OFF at −4', E(-4, 0).conscriptsLeviable === false);
  check('levy allowed at −1', E(-1, 0).conscriptsLeviable === true);
  const unitBase = 7;   // RR p.430-style unit morale
  check('conscript muster morale at −1 → unit −1', unitBase + E(-1, 0).conscriptMorale === 6);
  check('conscript muster morale at +4 → unit +1', unitBase + E(4, 0).conscriptMorale === 8);
  check('conscript muster morale at +1 → unchanged', unitBase + E(1, 0).conscriptMorale === 7);
})();
(function(){
  // Spy/thief consumer: a spy/thief working against the domain adds .spyThiefThrow to its throw.
  const spyBase = 14;
  check('spy/thief throw at +1 → −1', spyBase + E(1, 0).spyThiefThrow === 13);
  check('spy/thief throw at +4 → −4', spyBase + E(4, 0).spyThiefThrow === 10);
  check('spy/thief throw at ≤0 → unchanged', spyBase + E(-2, 0).spyThiefThrow === 14 && spyBase + E(0, 0).spyThiefThrow === 14);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Demo template — the accessor reads a real migrated domain without throwing');
(function(){
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
  ACKS.migrateCampaign(demo);
  const d = demo.domains[0];
  let threw = false, e;
  try { e = ACKS.domainMoraleEffects(demo, d); } catch(err){ threw = true; }
  check('domainMoraleEffects on a real demo domain does not throw', !threw);
  check('… reports the demo domain\'s actual morale band', e && e.morale === Math.max(-4, Math.min(4, d.demographics.morale | 0)));
  check('… income factor agrees with the shipped helper for that morale', e && e.incomeFactor === ACKS.incomeFactor(e.morale));
})();

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('domain-completion-dc3.smoke.js (DC-3) — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
