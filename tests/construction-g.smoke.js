/* Phase 4 Construction Wave G — Sanctums / Dungeons / Mines / Vaults (the seam-reconciliation wave).
 *
 * Run from "ACKS God Mode/" (or via npm test):  node tests/construction-g.smoke.js
 *
 * Wave G wires the SHIPPED class-bound kinds to the Construction Wizard + closes the cross-class gaps.
 * The build machinery (startConstructionProject / the day-tick / completion) + the arcane hooks
 * (onSanctumConstructed / onDungeonConstructed) already shipped — this covers the Wave-G additions:
 *   0. EXPORTS — constructionBuilderClassAdvisory present.
 *   1. SANCTUM CLASS-GATE (the bug fix) — attractToSanctum draws for an arcane master, NOT a non-mage;
 *      onSanctumConstructed still ESTABLISHES a cross-class sanctum (it just draws nothing). Mirrors the
 *      dungeon's already-gated auto-attune (a non-mage's dungeon is minted but not attuned).
 *   2. BUILDER-CLASS ADVISORY — constructionBuilderClassAdvisory for sanctum/dungeon (arcane L9+) + vault
 *      (dwarf), resolving the owner directly or via the owner domain's ruler; soft — it never blocks.
 *   3. RAW-TIMED BUILD (the seam) — a sanctum / dungeon / mine / vault Project, on construction-completed
 *      AND on Day-Clock completion (commitConstructionRecord), materializes correctly: a sanctum
 *      Constructible established + apprentices drawn (arcane) / none (cross-class); a dun- Dungeon minted +
 *      auto-attuned; a generic mine / vault Constructible.
 *
 * Authored 2026-06-21 (Wave Construction-G; CLAUDE §8). No new entity/prefix/event/house-rule/migration.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){ if(cond){ passed++; } else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; } }

// ── character helpers ────────────────────────────────────────────────────────
function mage(id, name, level){ return ACKS.blankCharacter({ id, name: name||'Mage', class:'Mage', level: (level==null?9:level), currentHexId:'hex-1', abilities:{ STR:10, INT:16, WIL:10, DEX:10, CON:10, CHA:12 } }); }
function fighter(id, name, level){ return ACKS.blankCharacter({ id, name: name||'Fighter', class:'Fighter', level: (level==null?9:level), currentHexId:'hex-1', abilities:{ STR:14, INT:10, WIL:10, DEX:10, CON:12, CHA:10 } }); }
function dwarf(id, name){ return ACKS.blankCharacter({ id, name: name||'Dwarf', class:'Dwarven Vaultguard', race:'Dwarf', level:9, currentHexId:'hex-1' }); }
function completeViaEvent(camp, proj){ return ACKS.applyEvent(camp, ACKS.newEvent('construction-completed', { payload:{ projectId: proj.id }, submittedBy:'gm', status:'applied' })); }

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports
// ─────────────────────────────────────────────────────────────────────────────
check('constructionBuilderClassAdvisory exported', typeof ACKS.constructionBuilderClassAdvisory === 'function');
check('onSanctumConstructed exported',  typeof ACKS.onSanctumConstructed === 'function');
check('onDungeonConstructed exported',  typeof ACKS.onDungeonConstructed === 'function');
check('attractToSanctum exported',      typeof ACKS.attractToSanctum === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sanctum attraction class-gate (the bug fix — RR p.386 / JJ p.121)
// ─────────────────────────────────────────────────────────────────────────────
{
  // an ARCANE master draws apprentices + companions
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ mage('chr-m','Quintus',9) ];
  const cst = ACKS.blankConstructible({ id:'cst-s', constructibleKind:'sanctum', constructibleSubtype:'sanctum', name:'Sanctum', hexId:'hex-1', ownerCharacterId:'chr-m', buildValue:15000, completedAtTurn:5 });
  c.constructibles = [cst];
  const r = ACKS.onSanctumConstructed(c, cst, { rng: () => 0.5 });
  check('arcane sanctum: established', r.ok === true && !!(cst.kindSpecific && cst.kindSpecific.sanctumEstablished));
  check('arcane sanctum: drew apprentices', (c.apprenticeships || []).length >= 1, (c.apprenticeships||[]).length);
  check('arcane sanctum: drew companions', (c.characters||[]).filter(x => x && x.sanctumCompanionSanctumId === 'cst-s').length >= 1);

  // a NON-arcane master → the sanctum still establishes, but draws NOTHING
  const c2 = ACKS.blankCampaign(); c2.currentTurn = 5;
  c2.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c2.characters = [ fighter('chr-f','Sir Brun',9) ];
  const cst2 = ACKS.blankConstructible({ id:'cst-s2', constructibleKind:'sanctum', constructibleSubtype:'sanctum', name:'Folly', hexId:'hex-1', ownerCharacterId:'chr-f', buildValue:15000, completedAtTurn:5 });
  c2.constructibles = [cst2];
  const charsBefore = c2.characters.length;
  const r2 = ACKS.onSanctumConstructed(c2, cst2, { rng: () => 0.5 });
  check('non-mage sanctum: still established', r2.ok === true && !!(cst2.kindSpecific && cst2.kindSpecific.sanctumEstablished));
  check('non-mage sanctum: NO apprentices', (c2.apprenticeships || []).length === 0);
  check('non-mage sanctum: NO companions generated', c2.characters.length === charsBefore);

  // attractToSanctum directly → master-not-arcane for a non-mage
  const direct = ACKS.attractToSanctum(c2, { sanctumId:'cst-s2', masterId:'chr-f', isInitial:true });
  check('attractToSanctum: master-not-arcane', direct.ok === false && direct.reason === 'master-not-arcane', JSON.stringify(direct));
  // …and it still draws for the arcane master (the gate is class-specific, not a blanket off)
  const direct2 = ACKS.attractToSanctum(c, { sanctumId:'cst-s', masterId:'chr-m', isInitial:false, rng: () => 0.5 });
  check('attractToSanctum: arcane master still draws', direct2.ok === true);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Builder-class advisory (RR pp.386–388 + JJ p.121) — soft, never blocks
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = ACKS.blankCampaign();
  c.characters = [ mage('chr-m','Q',9), fighter('chr-f','F',9), mage('chr-m8','M8',8), dwarf('chr-d','Durin') ];
  c.domains = [ { id:'dom-m', name:'Mage March', rulerCharacterId:'chr-m' }, { id:'dom-f', name:'Fighter March', rulerCharacterId:'chr-f' } ];
  const adv = (kind, opts) => ACKS.constructionBuilderClassAdvisory(c, Object.assign({ kind }, opts||{}));

  // non-class-bound kinds → always matched, no advisory
  check('stronghold-component → matched (no advisory)', adv('stronghold-component', { ownerCharacterId:'chr-f' }).matched === true);
  check('settlement-building → matched (no advisory)', adv('settlement-building', { ownerCharacterId:'chr-f' }).matched === true);

  // sanctum (arcane L9+)
  check('sanctum + arcane L9 → matched', adv('sanctum', { ownerCharacterId:'chr-m' }).matched === true);
  const s1 = adv('sanctum', { ownerCharacterId:'chr-f' });
  check('sanctum + fighter → advisory (not arcane)', s1.matched === false && /not an arcane caster/.test(s1.advisory), s1.advisory);
  const s2 = adv('sanctum', { ownerCharacterId:'chr-m8' });
  check('sanctum + arcane L8 → advisory (below 9th)', s2.matched === false && /below 9th/.test(s2.advisory), s2.advisory);
  const s3 = adv('sanctum', {});
  check('sanctum + no owner → advisory (assign)', s3.matched === false && /Assign an arcane/.test(s3.advisory));
  // domain-owned → resolves the ruler
  check('sanctum + arcane-ruled domain → matched', adv('sanctum', { ownerDomainId:'dom-m' }).matched === true);
  check('sanctum + fighter-ruled domain → advisory', adv('sanctum', { ownerDomainId:'dom-f' }).matched === false);

  // dungeon (arcane L9+)
  check('dungeon + arcane L9 → matched', adv('dungeon', { ownerCharacterId:'chr-m' }).matched === true);
  const d1 = adv('dungeon', { ownerCharacterId:'chr-f' });
  check('dungeon + fighter → advisory (attune)', d1.matched === false && /attune/.test(d1.advisory), d1.advisory);

  // vault (dwarf)
  check('vault + dwarf → matched', adv('vault', { ownerCharacterId:'chr-d' }).matched === true);
  const v1 = adv('vault', { ownerCharacterId:'chr-f' });
  check('vault + non-dwarf → advisory (not a dwarf)', v1.matched === false && /not a dwarf/.test(v1.advisory), v1.advisory);
  const v2 = adv('vault', {});
  check('vault + no owner → advisory (dwarven stronghold)', v2.matched === false && /dwarven stronghold/.test(v2.advisory));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RAW-timed build via the Wizard engine → completion hooks fire
// ─────────────────────────────────────────────────────────────────────────────
{ // sanctum — arcane owner → minted + established + apprentices
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ mage('chr-m','Quintus',9) ];
  const p = ACKS.startConstructionProject(c, { constructibleKind:'sanctum', name:'The Spire', siteHexId:'hex-1', ownerCharacterId:'chr-m', totalCost:15000, workerCounts:{ laborer:100 } });
  check('sanctum project under-construction', p.lifecycleState === 'under-construction');
  completeViaEvent(c, p);
  const cst = (c.constructibles || []).find(x => x.constructibleKind === 'sanctum');
  check('sanctum: Constructible minted', !!cst && cst.ownerCharacterId === 'chr-m');
  check('sanctum: established on completion', !!(cst && cst.kindSpecific && cst.kindSpecific.sanctumEstablished));
  check('sanctum: apprentices drawn (arcane)', (c.apprenticeships || []).length >= 1, (c.apprenticeships||[]).length);
  check('sanctum: project complete', p.lifecycleState === 'complete');
}

{ // sanctum — cross-class owner → minted + established, but NO apprentices
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ fighter('chr-f','Sir Brun',9) ];
  const p = ACKS.startConstructionProject(c, { constructibleKind:'sanctum', name:'Folly', siteHexId:'hex-1', ownerCharacterId:'chr-f', totalCost:15000, workerCounts:{ laborer:100 } });
  completeViaEvent(c, p);
  const cst = (c.constructibles || []).find(x => x.constructibleKind === 'sanctum');
  check('cross-class sanctum: minted + established', !!(cst && cst.kindSpecific && cst.kindSpecific.sanctumEstablished));
  check('cross-class sanctum: NO apprentices', (c.apprenticeships || []).length === 0);
}

{ // dungeon — arcane L9 owner → dun- minted + auto-attuned, NO generic cst-
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ mage('chr-m','Quintus',9) ];
  const cstBefore = (c.constructibles || []).length;
  const p = ACKS.startConstructionProject(c, { constructibleKind:'dungeon', constructibleSubtype:'dungeon', name:'The Maze', siteHexId:'hex-1', ownerCharacterId:'chr-m', totalCost:30000, workerCounts:{ laborer:100 } });
  completeViaEvent(c, p);
  const dun = (c.dungeons || []).find(d => d.builtByProjectId === p.id);
  check('dungeon: dun- minted', !!dun);
  check('dungeon: NO generic constructible for a dungeon', (c.constructibles || []).length === cstBefore);
  check('dungeon: auto-attuned the L9 mage', ACKS.dungeonAttunedCharacterId(c, dun) === 'chr-m');
  check('dungeon: project complete', p.lifecycleState === 'complete');
}

{ // dungeon — non-mage owner → minted but NOT auto-attuned (mirrors the shipped onDungeonConstructed gate)
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ fighter('chr-f','Sir Brun',9) ];
  const p = ACKS.startConstructionProject(c, { constructibleKind:'dungeon', constructibleSubtype:'dungeon', name:'Pit', siteHexId:'hex-1', ownerCharacterId:'chr-f', totalCost:30000, workerCounts:{ laborer:100 } });
  completeViaEvent(c, p);
  const dun = (c.dungeons || []).find(d => d.builtByProjectId === p.id);
  check('non-mage dungeon: minted', !!dun);
  check('non-mage dungeon: NOT auto-attuned', ACKS.dungeonAttunedCharacterId(c, dun) == null);
}

{ // mine + vault — a generic Constructible (the building surface; yield lives in its own subsystem)
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ dwarf('chr-d','Durin') ];
  const pm = ACKS.startConstructionProject(c, { constructibleKind:'mine', name:'Deep Mine', siteHexId:'hex-1', ownerCharacterId:'chr-d', totalCost:5000, workerCounts:{ laborer:100 } });
  completeViaEvent(c, pm);
  check('mine: generic Constructible minted', (c.constructibles || []).some(x => x.constructibleKind === 'mine' && x.name === 'Deep Mine'));
  const pv = ACKS.startConstructionProject(c, { constructibleKind:'vault', name:'The Vault', siteHexId:'hex-1', ownerCharacterId:'chr-d', totalCost:15000, workerCounts:{ laborer:100 } });
  completeViaEvent(c, pv);
  check('vault: generic Constructible minted', (c.constructibles || []).some(x => x.constructibleKind === 'vault' && x.name === 'The Vault'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. RAW-timed via the Day Clock — commitConstructionRecord runs the completion handler (Wave E fix)
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = ACKS.blankCampaign(); c.currentTurn = 5;
  c.houseRules = { 'abstract-construction': { enabled:true } };   // no supervisor/throttle for a clean count
  c.hexes = [{ id:'hex-1', coord:{q:0,r:0} }];
  c.characters = [ mage('chr-m','Quintus',9) ];
  // 200gp → 6,000 cf; 100 laborers = 500 cf/day → ~12 days. 20 days completes it.
  const p = ACKS.startConstructionProject(c, { constructibleKind:'sanctum', name:'Day-Clock Spire', siteHexId:'hex-1', ownerCharacterId:'chr-m', totalCost:200, workerCounts:{ laborer:100 } });
  const out = ACKS.proposeConstructionDay(c, { days: 20 });
  const rec = (out.pendingRecords || []).find(r => r.projectId === p.id);
  check('day-tick proposes a sanctum record', !!rec);
  if(rec) ACKS.commitConstructionRecord(c, rec);
  check('day-clock: sanctum completed', p.lifecycleState === 'complete', p.lifecycleState);
  const cst = (c.constructibles || []).find(x => x.constructibleKind === 'sanctum');
  check('day-clock: sanctum Constructible established', !!(cst && cst.kindSpecific && cst.kindSpecific.sanctumEstablished));
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-g.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
