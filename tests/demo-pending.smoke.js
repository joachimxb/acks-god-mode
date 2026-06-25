/* Demo first-load health guard (audit 2026-06-24, lanes D2 + D5b).
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/demo-pending.smoke.js
 *
 * Two first-load UX regressions a fresh user hits if the shipped demo / templates drift:
 *
 * (1) D2 — pending-events schema. The demo + the v2 templates pre-author campaign.pendingEvents[]
 *     (a rumor the GM can emit, a player's plan awaiting review). If one of those authored events
 *     fails ACKS.validateEvent, EVERY new user who loads that file and runs the first monthly turn
 *     sees "Engine error: validateEvent: …" in the log (the exact 2026-06-24 finding: the demo's
 *     rumor-emit was missing the required `scope`, the player-plan the required `domainId`). This
 *     runs validateEvent over every pending event in the demo AND every Templates/*.acks.json.
 *     Scope: pendingEvents[] only (the queue a fresh load presents for commit). Applied eventLog
 *     entries are historical and not re-validated.
 *
 * (2) D5b — idle-run starvation. The off-journey survival day-consumer (CoL-1) starves any active
 *     character in the 'field' regime that lacks rations; a demo full of unsheltered characters
 *     spams the log with ~hundreds of starvation lines as the GM idly advances the Day Clock (the
 *     solo-sim finding). Every active demo character must resolve to the 'settled' regime (on
 *     lifestyle in their realm → fed/sheltered, never starved). This pins that invariant so a
 *     future demo refresh can't reintroduce a starving idle character.
 */
const fs = require('fs');
const path = require('path');
require('./_engine.js').load();
require(path.join(__dirname, '..', 'acks-demo-template.js'));
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}

// Validate every pendingEvents[] entry of one named campaign object. Returns the count validated.
function validatePending(sourceLabel, campaign){
  const pending = (campaign && Array.isArray(campaign.pendingEvents)) ? campaign.pendingEvents : [];
  for(const ev of pending){
    let ok = false, err = '';
    try { ACKS.validateEvent(ev); ok = true; }
    catch(e){ err = e && e.message ? e.message : String(e); }
    check(sourceLabel + ' · ' + (ev && ev.kind || '?') + ' (' + (ev && ev.id || '?') + ') validates', ok, err);
  }
  return pending.length;
}

// 1) The shipped demo (global.ACKS_DEMO_TEMPLATE) — the artifact most users load first.
const demo = global.ACKS_DEMO_TEMPLATE;
check('demo (ACKS_DEMO_TEMPLATE) loaded', !!demo);
const demoCount = validatePending('demo:' + (demo && demo.id || 'ACKS_DEMO_TEMPLATE'), demo);
// The demo SHOWCASES a pending rumor + a pending player-plan; if a refresh drops them the guard
// would silently pass by validating nothing, so pin that the demo actually carries pending events.
check('demo carries pending events to validate', demoCount >= 1, 'found ' + demoCount);

// 2) Every shipped template (Templates/*.acks.json) — raw, as-authored (the loader migrates these,
//    but validateEvent gates the authored shape, so validate as-authored — the truest "won't error
//    on first load" check).
const TEMPLATES_DIR = path.join(__dirname, '..', 'Templates');
const templateFiles = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.acks.json')).sort();
check('found shipped templates', templateFiles.length > 0, 'count ' + templateFiles.length);
for(const f of templateFiles){
  let camp = null, parseErr = '';
  try { camp = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8')); }
  catch(e){ parseErr = e && e.message ? e.message : String(e); }
  check('template ' + f + ' parses', !!camp, parseErr);
  if(camp) validatePending('template:' + f, camp);
}

// 3) D5b — no idle-run starvation: every active demo character is on a 'settled' lifestyle, so the
//    off-journey survival consumer never starves them as the GM advances the Day Clock.
let demoCamp = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
const mig = ACKS.migrateCampaign(demoCamp); if(mig) demoCamp = mig;
const regimeOf = ACKS.characterEffectiveRegime || ACKS.characterProvisioningRegime;
const isActive = ACKS.isActive;
check('regime accessor (characterEffectiveRegime/characterProvisioningRegime) exported', typeof regimeOf === 'function');
if(typeof regimeOf === 'function'){
  const fieldChars = (demoCamp.characters || []).filter(c =>
    c && c.id && (typeof isActive !== 'function' || isActive(c)) && regimeOf(demoCamp, c) !== 'settled');
  check('no active demo character is in the unprovisioned "field" regime (no idle-run starvation)',
    fieldChars.length === 0, fieldChars.map(c => (c.name || c.id) + '@' + (c.currentHexId || '?')).join(', '));
}

console.log('\n=============================================');
console.log('demo-pending.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
if(failed > 0) process.exit(1);
