/* tests/garrison-patrols.smoke.js — the `garrison-patrols` house rule (acks-engine-patrols.js).
 *
 *   node tests/garrison-patrols.smoke.js   (or via `npm test`)
 *
 * RAW: a "Man, Patroller" civilized encounter (JJ p.43; MM p.226) met inside a modelled
 * domain is drawn from that domain's ACTUAL garrison — the troop type best suited to the
 * hex terrain (mounted in the open / foot bowmen in forest+mountain, per the JJ table
 * label + MM p.226) — and patrollers slain subtract from the garrison headcount (RR p.341).
 * Covers: the house-rule registration + polarity, the additive monsterSide schema, the
 * terrain/label archetype + fit scoring, the grounding selection (+ the null fall-throughs),
 * the createEncounterFromDraw integration (rule off vs on, the count cap, resident-supersede),
 * and the casualty write-back.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n— ' + t); }

function mkCampaign(){ const c = ACKS.blankCampaign(); c.currentTurn = 1; c.houseRules = c.houseRules || {}; return c; }
function addDomainWithGarrison(c, unitsSpec){
  const dom = ACKS.blankDomain({ id:'dom-test', name:'Türos Test' });
  (c.domains = c.domains || []).push(dom);
  for(const u of unitsSpec){
    const unit = ACKS.blankUnit({ id:u.id, unitTypeKey:u.typeKey, race:'man', count:u.count });
    unit.stationedAt = { kind:'domain-garrison', id:dom.id };
    (c.units = c.units || []).push(unit);
  }
  return dom;
}
function addHex(c, id, terrain, domainId){
  const h = ACKS.blankHex({ id }); h.terrain = terrain; h.domainId = domainId || null;
  (c.hexes = c.hexes || []).push(h); return h;
}

// =============================================================================
section('house rule — garrison-patrols registered, default OFF, encounters category (§6 polarity)');
{
  const r = ACKS.registeredHouseRules().find(x => x.id === 'garrison-patrols');
  ok('registered', !!r);
  ok('default OFF (opt-in enhancement, not a RAW demotion)', r && r.default === false);
  ok('category encounters', r && r.category === 'encounters');
  ok('disabled by default on a fresh campaign', ACKS.isHouseRuleEnabled(mkCampaign(), 'garrison-patrols') === false);
}

// =============================================================================
section('schema — blankEncounter monsterSide carries the (null) garrison fields, additive');
{
  const ms = ACKS.blankEncounter().monsterSide;
  ok('garrisonDomainId default null', ms.garrisonDomainId === null);
  ok('garrisonUnitId default null', ms.garrisonUnitId === null);
  ok('garrisonTroopTypeKey default null', ms.garrisonTroopTypeKey === null);
}

// =============================================================================
section('archetype + fit — label-first, terrain fallback (JJ p.43 table label / MM p.226)');
{
  ok('label (bowman) → foot', ACKS.patrolArchetypeForHex({ terrain:'grassland' }, 'Man, Patroller (bowman)') === 'foot');
  ok('label (camel lancers) → mounted', ACKS.patrolArchetypeForHex({ terrain:'forest' }, 'Man, Patroller (camel lancers)') === 'mounted');
  ok('label (med. cavalry) → mounted', ACKS.patrolArchetypeForHex({ terrain:'forest' }, 'Man, Patroller (med. cavalry)') === 'mounted');
  ok('no label → grassland = mounted', ACKS.patrolArchetypeForHex({ terrain:'grassland' }, '') === 'mounted');
  ok('no label → desert = mounted', ACKS.patrolArchetypeForHex({ terrain:'desert' }, '') === 'mounted');
  ok('no label → forest = foot', ACKS.patrolArchetypeForHex({ terrain:'forest' }, '') === 'foot');
  ok('no label → mountains = foot (JJ groups hills/mtns as bowmen)', ACKS.patrolArchetypeForHex({ terrain:'mountains' }, '') === 'foot');

  const cavRow = ACKS.findTroopType('light-cavalry', { race:'man' });
  const bowRow = ACKS.findTroopType('bowman', { race:'man' });
  const infRow = ACKS.findTroopType('heavy-infantry', { race:'man' });
  ok('mounted prefers cavalry over foot bow', ACKS.patrolFitScore('mounted', cavRow) > ACKS.patrolFitScore('mounted', bowRow));
  ok('foot prefers bow over foot melee', ACKS.patrolFitScore('foot', bowRow) > ACKS.patrolFitScore('foot', infRow));
  ok('foot prefers foot melee over cavalry', ACKS.patrolFitScore('foot', infRow) > ACKS.patrolFitScore('foot', cavRow));
}

// =============================================================================
section('grounding — picks the terrain-appropriate garrison troop type');
{
  const c = mkCampaign();
  const dom = addDomainWithGarrison(c, [
    { id:'unit-cav', typeKey:'light-cavalry', count:30 },
    { id:'unit-bow', typeKey:'bowman', count:60 },
  ]);
  addHex(c, 'hex-open', 'grassland', dom.id);
  addHex(c, 'hex-forest', 'forest', dom.id);
  addHex(c, 'hex-wild', 'grassland', null);

  const gOpen = ACKS.groundPatrollerToGarrison(c, { hexId:'hex-open', label:'Man, Patroller (med. cavalry)' });
  ok('open terrain → cavalry unit', gOpen && gOpen.unitId === 'unit-cav', gOpen && gOpen.unitId);
  ok('grounding returns domain + available count', gOpen && gOpen.domainId === dom.id && gOpen.availableCount === 30);

  const gForest = ACKS.groundPatrollerToGarrison(c, { hexId:'hex-forest', label:'Man, Patroller (bowman)' });
  ok('forest terrain → bowman unit', gForest && gForest.unitId === 'unit-bow', gForest && gForest.unitId);

  const gOverride = ACKS.groundPatrollerToGarrison(c, { hexId:'hex-forest', label:'Man, Patroller (med. cavalry)' });
  ok('label overrides terrain (cavalry label in forest → cav unit)', gOverride && gOverride.unitId === 'unit-cav', gOverride && gOverride.unitId);

  ok('wilderness hex (no domain) → null', ACKS.groundPatrollerToGarrison(c, { hexId:'hex-wild', label:'Man, Patroller (bowman)' }) === null);
  ok('unknown hex → null', ACKS.groundPatrollerToGarrison(c, { hexId:'nope' }) === null);

  const c2 = mkCampaign();
  const dom2 = addDomainWithGarrison(c2, [{ id:'u0', typeKey:'bowman', count:0 }]);
  addHex(c2, 'hx', 'forest', dom2.id);
  ok('0-strength garrison → null (generic patroller stands)', ACKS.groundPatrollerToGarrison(c2, { hexId:'hx', label:'Man, Patroller (bowman)' }) === null);
}

// =============================================================================
section('integration — createEncounterFromDraw grounds under the rule; casualties hit the garrison');
{
  const c = mkCampaign();
  const dom = addDomainWithGarrison(c, [
    { id:'unit-cav', typeKey:'light-cavalry', count:30 },
    { id:'unit-bow', typeKey:'bowman', count:60 },
  ]);
  addHex(c, 'hex-forest', 'forest', dom.id);
  const mkDraw = (count) => ({ category:'civilized', hexId:'hex-forest',
    identityRoll:{ key:'patroller', label:'Man, Patroller (bowman)' },
    binding:{ mode:'wandering', count: count } });

  // rule OFF → generic patroller, no grounding
  const encOff = ACKS.createEncounterFromDraw(c, mkDraw(12), { trigger:'gm-authored', atTurn:1 });
  ok('rule off: no garrison grounding', encOff && encOff.monsterSide.garrisonUnitId === null);
  ok('rule off: generic table label kept', encOff && encOff.monsterSide.label === 'Man, Patroller (bowman)');
  ok('rule off: count untouched (12)', encOff && encOff.monsterSide.count === 12);

  // rule ON → grounded to the bowman garrison
  c.houseRules['garrison-patrols'] = true;
  const enc = ACKS.createEncounterFromDraw(c, mkDraw(12), { trigger:'gm-authored', atTurn:1 });
  ok('rule on: grounded to the bowman unit', enc && enc.monsterSide.garrisonUnitId === 'unit-bow', enc && enc.monsterSide.garrisonUnitId);
  ok('rule on: domain recorded', enc && enc.monsterSide.garrisonDomainId === dom.id);
  ok('rule on: troop type key recorded', enc && enc.monsterSide.garrisonTroopTypeKey === 'bowman');
  ok('rule on: side relabelled to the garrison troop', enc && /garrison\)$/.test(enc.monsterSide.label || ''), enc && enc.monsterSide.label);
  ok('rule on: census resident grounding cleared', enc && enc.monsterSide.residentCharacterId === null);

  // count cap: a draw bigger than the unit caps to the unit's strength
  const big = ACKS.createEncounterFromDraw(c, mkDraw(200), { trigger:'gm-authored', atTurn:1 });
  ok('patrol count capped at garrison strength (60)', big && big.monsterSide.count === 60, big && String(big.monsterSide.count));

  // casualties: kill 5 → the bowman unit drops 60 → 55 (permanent removal)
  const before = c.units.find(u => u.id === 'unit-bow').count;
  const res = ACKS.applyGarrisonPatrolCasualties(c, enc.id, 5);
  ok('casualty apply ok', res && res.ok === true, res && res.error);
  ok('garrison unit reduced by exactly 5', c.units.find(u => u.id === 'unit-bow').count === before - 5);
  ok('result reports remaining', res && res.remaining === before - 5);
  ok('patrol survivors shrink too (12 → 7)', enc.monsterSide.count === 7);
  ok('the unit logged the loss', c.units.find(u => u.id === 'unit-bow').history.some(h => h.type === 'patrol-casualties'));

  // over-kill is capped (never negative, never below the patrol's own strength)
  ACKS.applyGarrisonPatrolCasualties(c, enc.id, 99999);
  ok('over-kill leaves the unit non-negative', c.units.find(u => u.id === 'unit-bow').count >= 0);

  // a non-garrison encounter is rejected
  const plain = ACKS.blankEncounter({ id:'enc-plain' });
  (c.encounters = c.encounters || []).push(plain);
  const res3 = ACKS.applyGarrisonPatrolCasualties(c, 'enc-plain', 3);
  ok('non-garrison encounter rejected', res3 && res3.ok === false && res3.error === 'not-a-garrison-patrol');
  ok('zero/negative killed rejected', ACKS.applyGarrisonPatrolCasualties(c, enc.id, 0).ok === false);

  // the display summary
  const sum = ACKS.garrisonPatrolSummary(c, enc.id);
  ok('summary present + unit resolved', sum && sum.unitId === 'unit-bow' && sum.unitPresent === true);
  ok('summary names the domain', sum && sum.domainName === 'Türos Test');
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — garrison-patrols: ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
