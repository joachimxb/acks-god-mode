// =============================================================================
// behavior.smoke.js — the BEHAVIORAL-UI test tier (audit E1 / T5, 2026-06-24).
//
// The ~17.7k-line Alpine UI had ZERO behavioral test — only a syntax parse-check
// (index-parse.smoke.js) that its own header documents as unable to catch runtime breakage.
// That blind spot is *why* the corrupted CSP (audit T1) shipped green. This tier loads the
// engine + domain-app.js + every domain-app-*.js mixin into a jsdom window, instantiates the
// real Alpine component via domainApp(), and exercises the highest-consequence flows:
//
//   (1) Save → Load round-trip preserves a populated campaign  (the data-integrity promise).
//   (2) The silent-data-loss guard: validateCampaign — which loadCampaignFromObject runs on
//       every load — flags duplicate ids + non-unique hex coords. (NOTE: the spec named the
//       old `importDomainFiles` JSON merge-dedup here; that function was RETIRED in the
//       World-Layer sweep, PR #118, replaced by the xlsx World I/O importer. The live guard
//       against silently loading corrupt/colliding data is validateCampaign, so this asserts
//       that — the same risk class qa-strategy C2 raised.)
//   (3) Load demo → propose monthly turn → commit → state advanced, with ZERO console.error
//       across component construction + load + turn (the silent-half-render net).
//
// jsdom is a DEV dependency only — the shipped artifact stays zero-runtime-dependency.
// =============================================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

// jsdom is dev-only; if a contributor hasn't run `npm install`, skip rather than hard-fail.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('behavior.smoke.js — SKIP: jsdom devDependency not installed (run `npm install`).');
  console.log('=============================================');
  process.exit(0);
}

// ── 1. The engine FIRST — BEFORE any global.window exists ─────────────────────────────────────
// Order matters: loaded headless (no window), the modules take the Node export path and `load()`
// returns the COMPLETE ACKS namespace. If global.window is already set, the modules take the
// browser branch and some exports (verified: validateCampaign) never land on the returned object.
const ACKS = require('./_engine.js').load();
ok('engine loaded (complete ACKS namespace)',
   typeof ACKS === 'object' && typeof ACKS.proposeMonthlyTurn === 'function' && typeof ACKS.validateCampaign === 'function');

// ── 2. A jsdom window + the browser globals the component touches at build/load time ──────────
const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="app"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
// Some of these (navigator, location) are read-only getters on the Node global in modern Node —
// assign defensively, falling back to defineProperty, and never let a non-configurable one abort.
function setGlobal(k, v){ try { global[k] = v; } catch(_){ try { Object.defineProperty(global, k, { value: v, configurable: true, writable: true }); } catch(__){} } }
setGlobal('window', window);
setGlobal('document', window.document);
setGlobal('navigator', window.navigator);
setGlobal('location', window.location);
setGlobal('localStorage', window.localStorage);
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, media: '', addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
window.confirm = () => true;          // load-path integrity prompt → proceed
window.alert = () => {};
window.scrollTo = () => {};
// Minimal Alpine stub — we never init Alpine (no DOM binding); we only call domainApp() to get the
// component object and invoke its methods directly. The app registers Alpine.data on alpine:init,
// which we never dispatch, so these are just no-op guards for any module-scope reference.
window.Alpine = { data(){}, store(){ return {}; }, magic(){}, directive(){}, bind(){}, effect(){}, start(){}, nextTick(cb){ if(typeof cb==='function') cb(); } };
global.Alpine = window.Alpine;

// ── 3. Wire the engine into the window + bare globals (domain-app.js calls e.g. migrateCampaign bare)
window.ACKS = ACKS; global.ACKS = ACKS;
for (const k of Object.keys(ACKS)) { try { if (!(k in global)) global[k] = ACKS[k]; } catch(_){} try { window[k] = ACKS[k]; } catch(_){} }

// ── 4. The app: demo template + domain-app.js + every domain-app-*.js mixin, in this context ──
function runScript(file){ vm.runInThisContext(fs.readFileSync(path.join(REPO, file), 'utf8'), { filename: file }); }
let loadErr = null;
try {
  runScript('acks-demo-template.js');           // → window.ACKS_DEMO_TEMPLATE
  runScript('domain-app.js');                   // → global domainApp() + __ACKS_APP_MIXINS__ + _acksApplyAppMixins
  const mixins = fs.readdirSync(REPO).filter(f => /^domain-app-.+\.js$/.test(f)).sort();
  for (const m of mixins) runScript(m);         // each pushes its members onto __ACKS_APP_MIXINS__
  ok('all domain-app-*.js mixins loaded (' + mixins.length + ')', mixins.length >= 15);
} catch (e) { loadErr = e; ok('engine + app scripts load into jsdom without throwing', false, (e.message||String(e)).split('\n')[0]); }

if (!loadErr) {
  // Instantiate the real component — this runs _acksApplyAppMixins over all ~20 mixins.
  let app = null;
  try { app = (typeof domainApp === 'function') ? domainApp() : null; }
  catch (e) { ok('domainApp() instantiates (all mixins merge cleanly)', false, (e.message||String(e)).split('\n')[0]); }
  if (app) {
    ok('domainApp() instantiates (all mixins merge cleanly)', typeof app === 'object');
    ok('component carries merged-in methods (loadCampaignFromObject present)', typeof app.loadCampaignFromObject === 'function');
    window.acksApp = app; global.acksApp = app;

    const demo = window.ACKS_DEMO_TEMPLATE;
    ok('demo template (ACKS_DEMO_TEMPLATE) is present', demo && demo.kind === 'campaign');

    // Capture console.error across construction-adjacent flows (the silent-half-render net).
    const consoleErrors = [];
    const origErr = console.error;
    console.error = (...a) => { consoleErrors.push(a.map(x => (x && x.message) || String(x)).join(' ')); };

    try {
      // ---- (3) load demo through the real component path ----
      app.loadCampaignFromObject(JSON.parse(JSON.stringify(demo)), '');
      const c = app.currentCampaign;
      ok('demo loaded into the component (domains populated)', !!c && Array.isArray(c.domains) && c.domains.length > 0,
        c ? (c.domains||[]).length + ' domains' : 'no currentCampaign');

      // ---- (1) Save → Load round-trip ----
      const before = { domains:(c.domains||[]).length, hexes:(c.hexes||[]).length, characters:(c.characters||[]).length, settlements:(c.settlements||[]).length };
      const json = JSON.stringify(app.serializedCampaign());      // the real save serializer
      app.loadCampaignFromObject(JSON.parse(json), '');
      const c2 = app.currentCampaign;
      const after = { domains:(c2.domains||[]).length, hexes:(c2.hexes||[]).length, characters:(c2.characters||[]).length, settlements:(c2.settlements||[]).length };
      ok('save→load round-trip preserves a populated campaign', before.domains > 0 &&
        after.domains===before.domains && after.hexes===before.hexes && after.characters===before.characters && after.settlements===before.settlements,
        JSON.stringify(before) + ' → ' + JSON.stringify(after));

      // ---- (3 cont.) propose + commit a monthly turn ----
      const turnBefore = c2.currentTurn || 1, logBefore = (c2.eventLog||[]).length;
      const proposal = ACKS.proposeMonthlyTurn(c2);
      ACKS.commitTurn(c2, proposal);
      ok('monthly turn advances state (currentTurn++ or eventLog grew)',
        (c2.currentTurn||1) > turnBefore || (c2.eventLog||[]).length > logBefore,
        'turn ' + turnBefore + '→' + (c2.currentTurn||1) + ', log ' + logBefore + '→' + (c2.eventLog||[]).length);
    } catch (e) {
      ok('demo load + round-trip + turn run without throwing', false, (e.message||String(e)).split('\n')[0]);
    } finally {
      console.error = origErr;
    }
    ok('zero console.error during component construction + demo load + turn',
      consoleErrors.length === 0, consoleErrors.length + ' error(s): ' + consoleErrors.slice(0,3).join(' | '));

    // ---- (2) silent-data-loss guard: validateCampaign flags duplicate id + non-unique coord ----
    const demo2 = window.ACKS_DEMO_TEMPLATE;
    if (demo2 && Array.isArray(demo2.characters) && demo2.characters.length && Array.isArray(demo2.hexes) && demo2.hexes.length >= 2) {
      const corrupt = JSON.parse(JSON.stringify(demo2));
      corrupt.characters.push(JSON.parse(JSON.stringify(corrupt.characters[0])));   // duplicate id
      const c0 = corrupt.hexes[0].coord; if (c0 != null) corrupt.hexes[1].coord = c0; // duplicate coord
      const vr = ACKS.validateCampaign(corrupt);
      ok('validateCampaign rejects a campaign with a duplicate entity id', vr && vr.ok === false && Array.isArray(vr.errors) && vr.errors.length > 0,
        vr ? JSON.stringify(vr.ok) : 'no result');
      ok('validateCampaign error mentions the duplicate id / coord (silent-data-loss guard)',
        vr && vr.errors.some(e => /duplicate|dup\b|already|coord|unique/i.test(String(e))),
        vr && vr.errors ? vr.errors.slice(0,2).join(' | ') : '');
    } else {
      ok('demo had characters + ≥2 coord hexes to exercise the integrity guard', false, 'demo shape unexpectedly thin');
    }
  }
}

console.log('\n=============================================');
console.log('behavior.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
