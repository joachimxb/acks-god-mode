/* Phase 4 Construction — Wave D (vessels / war machines) ENGINE smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-wave-d.smoke.js
 *
 * Covers (acks-engine-construction.js + the engine/voyages/sieges seams it rides):
 *   0. EXPORTS — the Wave-D surface is present.
 *   1. WAR_MACHINE_CATALOG — the RR pp.136–137 build costs (oracle) + lookups.
 *   2. SIEGE KEY MATCH — every siege-scored war machine's key exists in the shipped SIEGE_BONUS_UNITS
 *      / SIEGE_BOMBARDMENT tables (so a built machine feeds a siege); the 3 specialist machines don't.
 *   3. EVENT — war-machine-built is self-registered (record-only, wizard-opt-out).
 *   4. VESSEL via the Day Clock — a kind:'vessel' Project completes → the voyages seam mints a Vessel,
 *      NO stray kind:'vessel' Constructible, and the redundant construction-completed log is suppressed.
 *   5. WAR MACHINE via the Day Clock — a kind:'war-machine' Project completes → materializeWaveD-
 *      Constructible mints a kind:'war-machine' Constructible + emits war-machine-built; construction-
 *      completed suppressed; idempotent.
 *   6. materializeWaveDConstructible — direct: mints, idempotent on proj.constructibleId, no-ops for
 *      non-war-machine kinds.
 *   7. SIEGE FEED — warMachinesForOwner / warMachineSiegeContribution / Bonus / Bombardment over the
 *      shipped siege resolver; destroyed machines drop out; a specialist machine adds 0 siege bonus.
 *   8. VESSEL cost helper + site eligibility (vessel → waterway; war-machine → anywhere).
 *
 * Authored 2026-06-21 (b13 team session, lane agent-1; CLAUDE §8 / §15).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}

// A minimal campaign — abstract-construction ON so the day-tick accrues a clean labor count
// (no supervisor throttle); a waterway hex + an inland hex; an owner domain.
function makeCampaign(){
  return {
    schemaVersion:2, currentTurn:5, currentDayInMonth:1, houseRules:{ 'abstract-construction':{ enabled:true } },
    calendar:{ year:1, month:1, day:1 },
    characters:[], constructibles:[], vessels:[], projects:[], groups:[], eventLog:[], pendingEvents:[],
    hexes:[ { id:'hex-port', domainId:'dom-x', terrain:'coastal' }, { id:'hex-seat', domainId:'dom-x' } ],
    domains:[ { id:'dom-x', name:'March X', rulerCharacterId:null, stronghold:{ components:[] } } ]
  };
}
function dayTick(camp, n){ for(let i=0;i<n;i++){ const p = ACKS.proposeDayTick(camp, 1, { force:true }); ACKS.commitDayTick(camp, p, null); } }

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports
// ─────────────────────────────────────────────────────────────────────────────
check('WAR_MACHINE_CATALOG exported',           Array.isArray(ACKS.WAR_MACHINE_CATALOG));
check('findWarMachineClass exported',           typeof ACKS.findWarMachineClass === 'function');
check('warMachineCatalogList exported',         typeof ACKS.warMachineCatalogList === 'function');
check('materializeWaveDConstructible exported', typeof ACKS.materializeWaveDConstructible === 'function');
check('warMachinesForOwner exported',           typeof ACKS.warMachinesForOwner === 'function');
check('warMachineSiegeContribution exported',   typeof ACKS.warMachineSiegeContribution === 'function');
check('warMachineSiegeBonusUnits exported',     typeof ACKS.warMachineSiegeBonusUnits === 'function');
check('warMachineBombardmentPerDay exported',   typeof ACKS.warMachineBombardmentPerDay === 'function');
check('vesselConstructionCatalog exported',     typeof ACKS.vesselConstructionCatalog === 'function');
check('vesselConstructionCost exported',        typeof ACKS.vesselConstructionCost === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. WAR_MACHINE_CATALOG — RAW costs (RR pp.136–137) + lookups
// ─────────────────────────────────────────────────────────────────────────────
const cost = (k) => ACKS.warMachineCostGp(k);
check('17 war machines catalogued',          ACKS.WAR_MACHINE_CATALOG.length === 17, ACKS.WAR_MACHINE_CATALOG.length);
check('light-ballista 40gp',                 cost('light-ballista') === 40);
check('medium-ballista 80gp',                cost('medium-ballista') === 80);
check('heavy-ballista 180gp',                cost('heavy-ballista') === 180);
check('light-catapult 100gp',                cost('light-catapult') === 100);
check('medium-catapult 200gp',               cost('medium-catapult') === 200);
check('heavy-catapult 400gp',                cost('heavy-catapult') === 400);
check('light-trebuchet 600gp',               cost('light-trebuchet') === 600);
check('medium-trebuchet 1,200gp',            cost('medium-trebuchet') === 1200);
check('heavy-trebuchet 2,500gp',             cost('heavy-trebuchet') === 2500);
check('ram 200gp',                           cost('ram') === 200);
check('hoist 300gp',                         cost('hoist') === 300);
check('siege-tower-standard 2,500gp',        cost('siege-tower-standard') === 2500);
check('siege-tower-large 10,000gp',          cost('siege-tower-large') === 10000);
check('siege-tower-huge 40,000gp',           cost('siege-tower-huge') === 40000);
check('fire-bearing-siphon 2,500gp',         cost('fire-bearing-siphon') === 2500);
check('light-repeating-ballista 200gp',      cost('light-repeating-ballista') === 200);
check('heavy-harpoon-ballista 250gp',        cost('heavy-harpoon-ballista') === 250);
check('findWarMachineClass label',           (ACKS.findWarMachineClass('heavy-catapult')||{}).label === 'Catapult, Heavy');
check('isWarMachineClass true/false',        ACKS.isWarMachineClass('ram') === true && ACKS.isWarMachineClass('nope') === false);
check('warMachineLabel fallback',            ACKS.warMachineLabel('nope') === 'nope');
check('heavy-catapult category artillery',   (ACKS.findWarMachineClass('heavy-catapult')||{}).category === 'artillery');
check('ram category engine',                 (ACKS.findWarMachineClass('ram')||{}).category === 'engine');
check('heavy-trebuchet shp 12',              (ACKS.findWarMachineClass('heavy-trebuchet')||{}).shp === 12);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Catalog keys feed the shipped siege tables (acks-engine-sieges.js)
// ─────────────────────────────────────────────────────────────────────────────
const SBU = ACKS.SIEGE_BONUS_UNITS || {};
const scored = ACKS.WAR_MACHINE_CATALOG.filter(m => m.siegeScored);
const unscored = ACKS.WAR_MACHINE_CATALOG.filter(m => !m.siegeScored);
check('14 siege-scored machines',            scored.length === 14, scored.length);
check('every scored key is in SIEGE_BONUS_UNITS', scored.every(m => !!SBU[m.key]), scored.filter(m=>!SBU[m.key]).map(m=>m.key).join(','));
check('3 specialist machines NOT scored',    unscored.length === 3 && unscored.every(m => !SBU[m.key]),
  unscored.map(m=>m.key).join(','));

// ─────────────────────────────────────────────────────────────────────────────
// 3. war-machine-built event self-registered (record-only, wizard-opt-out)
// ─────────────────────────────────────────────────────────────────────────────
const kinds = (typeof ACKS.registeredEventKinds === 'function') ? ACKS.registeredEventKinds() : (ACKS.EVENT_KINDS || []);
check('war-machine-built registered',        kinds.indexOf('war-machine-built') >= 0);
check('siege-construction-built registered (siege-support shipped, burst14)', kinds.indexOf('siege-construction-built') >= 0);
{
  const optouts = ACKS.EVENT_WIZARD_OPTOUT;
  const isOptOut = optouts ? (typeof optouts.has === 'function' ? optouts.has('war-machine-built') : (optouts.indexOf ? optouts.indexOf('war-machine-built') >= 0 : false)) : false;
  check('war-machine-built is wizard-opt-out', isOptOut);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VESSEL via the Day Clock — voyages mints the Vessel, no stray cst-, no double log
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = makeCampaign();
  const p = ACKS.startConstructionProject(c, { constructibleKind:'vessel', constructibleSubtype:'canoe',
    name:'Little Dipper', siteHexId:'hex-port', ownerDomainId:'dom-x', totalCost:40, workerCounts:{ laborer:5000 } });
  dayTick(c, 5);   // complete (day 1) + the voyages launch (+1 lag)
  check('vessel project complete',           p.lifecycleState === 'complete');
  check('a Vessel was launched (voyages seam)', c.vessels.length === 1 && c.vessels[0].catalogKey === 'canoe', JSON.stringify(c.vessels.map(v=>v.catalogKey)));
  check('  proj.vesselId links the Vessel',  p.vesselId === c.vessels[0].id);
  check('NO stray kind:vessel Constructible', c.constructibles.filter(x => x.constructibleKind === 'vessel').length === 0);
  const kindsInLog = c.eventLog.map(e => e.event && e.event.kind);
  check('vessel-launched logged',            kindsInLog.indexOf('vessel-launched') >= 0);
  check('construction-completed SUPPRESSED for the vessel', kindsInLog.indexOf('construction-completed') < 0, kindsInLog.join(','));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WAR MACHINE via the Day Clock — materializes a Constructible + war-machine-built
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = makeCampaign();
  const p = ACKS.startConstructionProject(c, { constructibleKind:'war-machine', constructibleSubtype:'heavy-catapult',
    name:'Big Bertha', siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:400, workerCounts:{ laborer:5000 } });
  dayTick(c, 2);
  check('war-machine project complete',      p.lifecycleState === 'complete');
  const wm = c.constructibles.filter(x => x.constructibleKind === 'war-machine');
  check('a war-machine Constructible minted', wm.length === 1, wm.length);
  check('  subtype heavy-catapult',          wm[0] && wm[0].constructibleSubtype === 'heavy-catapult');
  check('  buildValue 400',                  wm[0] && wm[0].buildValue === 400);
  check('  ownerDomainId carried',           wm[0] && wm[0].ownerDomainId === 'dom-x');
  check('  hexId carried',                   wm[0] && wm[0].hexId === 'hex-seat');
  check('  proj.constructibleId links it',   p.constructibleId === wm[0].id);
  check('  functionData.siegeKey set',       wm[0] && wm[0].functionData && wm[0].functionData.siegeKey === 'heavy-catapult');
  const logKinds = c.eventLog.map(e => e.event && e.event.kind);
  check('war-machine-built logged',          logKinds.indexOf('war-machine-built') >= 0);
  check('construction-completed SUPPRESSED for the war machine', logKinds.indexOf('construction-completed') < 0, logKinds.join(','));
  // idempotent: another tick / re-materialize does not double-mint
  ACKS.materializeWaveDConstructible(c, p);
  check('re-materialize does NOT double-mint', c.constructibles.filter(x => x.constructibleKind === 'war-machine').length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. materializeWaveDConstructible — direct + guards
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = makeCampaign();
  const proj = { id:'prj-1', constructibleKind:'war-machine', constructibleSubtype:'ram', name:'The Goat',
    siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:200 };
  const cst = ACKS.materializeWaveDConstructible(c, proj);
  check('direct materialize returns a Constructible', cst && cst.constructibleKind === 'war-machine' && cst.constructibleSubtype === 'ram');
  check('  pushed to campaign.constructibles', c.constructibles.length === 1 && c.constructibles[0] === cst);
  check('  proj.constructibleId set',        proj.constructibleId === cst.id);
  check('  idempotent (same Constructible)', ACKS.materializeWaveDConstructible(c, proj) === cst && c.constructibles.length === 1);
  // non-war-machine kinds → no-op
  check('no-op for stronghold-component',    ACKS.materializeWaveDConstructible(c, { constructibleKind:'stronghold-component', constructibleSubtype:'keep-stone' }) === null);
  check('no-op for vessel (voyages owns it)',ACKS.materializeWaveDConstructible(c, { constructibleKind:'vessel', constructibleSubtype:'canoe' }) === null);
  check('  no spurious Constructibles from the no-ops', c.constructibles.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. The siege feed (over the shipped acks-engine-sieges.js resolver)
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = makeCampaign();
  ACKS.materializeWaveDConstructible(c, { id:'prj-a', constructibleKind:'war-machine', constructibleSubtype:'heavy-catapult', name:'A', ownerDomainId:'dom-x', siteHexId:'hex-seat', totalCost:400 });
  ACKS.materializeWaveDConstructible(c, { id:'prj-b', constructibleKind:'war-machine', constructibleSubtype:'heavy-catapult', name:'B', ownerDomainId:'dom-x', siteHexId:'hex-seat', totalCost:400 });
  ACKS.materializeWaveDConstructible(c, { id:'prj-c', constructibleKind:'war-machine', constructibleSubtype:'ram',           name:'C', ownerDomainId:'dom-x', siteHexId:'hex-seat', totalCost:200 });
  ACKS.materializeWaveDConstructible(c, { id:'prj-d', constructibleKind:'war-machine', constructibleSubtype:'fire-bearing-siphon', name:'D', ownerDomainId:'dom-x', siteHexId:'hex-seat', totalCost:2500 });
  check('warMachinesForOwner returns 4',     ACKS.warMachinesForOwner(c, 'dom-x').length === 4);
  const map = ACKS.warMachineSiegeContribution(c, 'dom-x');
  check('contribution map { heavy-catapult:2, ram:1, fire-bearing-siphon:1 }',
    map['heavy-catapult'] === 2 && map['ram'] === 1 && map['fire-bearing-siphon'] === 1, JSON.stringify(map));
  // SIEGE_BONUS_UNITS: heavy-catapult bonus 6 (×2 = 12), ram bonus 1/unitSize 6 (1 ram → 0 units), siphon unscored (0).
  check('siege bonus units = 12 (2 heavy catapults; ram<unitSize & siphon unscored add 0)',
    ACKS.warMachineSiegeBonusUnits(c, 'dom-x') === 12, ACKS.warMachineSiegeBonusUnits(c, 'dom-x'));
  // SIEGE_BOMBARDMENT heavy-catapult stone 275 ×2 = 550 (ram/siphon: no bombardment entry → 0).
  check('bombardment/day vs stone = 550',    ACKS.warMachineBombardmentPerDay(c, 'dom-x', 'stone') === 550, ACKS.warMachineBombardmentPerDay(c, 'dom-x', 'stone'));
  check('bombardment/day vs wood = 5000 (2×2500)', ACKS.warMachineBombardmentPerDay(c, 'dom-x', 'wood') === 5000, ACKS.warMachineBombardmentPerDay(c, 'dom-x', 'wood'));
  // a destroyed machine drops out of the feed
  ACKS.warMachinesForOwner(c, 'dom-x')[0].damageState = 'destroyed';
  check('destroyed machine drops from the feed', ACKS.warMachinesForOwner(c, 'dom-x').length === 3);
  // owner-scoped: another owner sees none
  check('another owner sees no machines',    ACKS.warMachinesForOwner(c, 'chr-other').length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Vessel cost helper + site eligibility
// ─────────────────────────────────────────────────────────────────────────────
{
  check('vesselConstructionCost(galley-2-rower) = 3,350', ACKS.vesselConstructionCost('galley-2-rower') === 3350, ACKS.vesselConstructionCost('galley-2-rower'));
  check('vesselConstructionCost(canoe) = 40',  ACKS.vesselConstructionCost('canoe') === 40);
  check('vesselConstructionCatalog non-empty', ACKS.vesselConstructionCatalog().length >= 18);
  const c = makeCampaign();
  const portHex = c.hexes.find(h => h.id === 'hex-port'), inlandHex = c.hexes.find(h => h.id === 'hex-seat');
  check('vessel site: waterway eligible',     ACKS.isSiteEligibleForKind(c, portHex, 'vessel').eligible === true);
  check('vessel site: inland NOT eligible',   ACKS.isSiteEligibleForKind(c, inlandHex, 'vessel').eligible === false);
  check('war-machine site: anywhere eligible',ACKS.isSiteEligibleForKind(c, inlandHex, 'war-machine').eligible === true);
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-wave-d.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
