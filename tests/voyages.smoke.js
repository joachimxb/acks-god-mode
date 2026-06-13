// =============================================================================
// voyages.smoke.js — Maritime / Voyages V1 (data layer). Phase 3 Voyages (#145).
// Covers: the vsl- prefix; the VESSEL_CATALOG (20 RR p.316 classes — values cross-checked
// EXACT vs the printed Sea Vessels table + the "—"→null handling + draft/deck-type from
// RR pp.153–156/331); the catalog lookups; blankVessel / createVessel (init-on-write) + the
// entity round-trip; the vessel entity-registry kind + the schema⊆factory + displayName
// invariants; the importer collection wiring; Journey.shipId (already reserved on blankJourney,
// surfaced in the journey schema) + vesselForJourney/journeysForVessel; the crew-Group /
// officer-Character / hold-Stash binding resolvers; the derived reads; and the load-bearing
// V1 guard — a vessel-less campaign STAYS vessel-less through migrateCampaign (no migrate
// injector → the 6 templates + demo stay migrate-no-ops).
// =============================================================================
const fs = require('fs');
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;
const REPO = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const clone = o => JSON.parse(JSON.stringify(o));

// =============================================================================
section('ID prefix (vsl-)');
// =============================================================================
ok('ID_PREFIXES.vessel === "vsl"', ACKS.ID_PREFIXES.vessel === 'vsl');

// =============================================================================
section('VESSEL_CATALOG — shape + the 20 RR p.316 classes');
// =============================================================================
const CAT = ACKS.VESSEL_CATALOG;
ok('VESSEL_CATALOG is an array of 20', Array.isArray(CAT) && CAT.length === 20, 'len=' + (CAT && CAT.length));
ok('vesselClassKeys() returns 20', ACKS.vesselClassKeys().length === 20);
ok('all catalog keys are unique', new Set(CAT.map(c => c.key)).size === 20);
ok('every row has a key + label + page cite', CAT.every(c => c.key && c.label && c.page === 316));
ok('VESSEL_CATALOG is frozen (immutable reference data)', Object.isFrozen(CAT) && Object.isFrozen(CAT[0]));
// the exact key roster (the schema enumValues must match these)
const EXPECT_KEYS = ['barge-small','barge-large','barge-huge','boat-row','boat-sail','canoe','galley-1-rower','galley-1.5-rower','galley-2-rower','galley-2.5-rower','galley-3-rower','galley-4-rower','galley-5-rower','galley-6-rower','galley-8-rower','longship','raft','sailing-ship-small','sailing-ship-large','sailing-ship-huge'];
ok('catalog keys match the expected roster', JSON.stringify(ACKS.vesselClassKeys()) === JSON.stringify(EXPECT_KEYS));

// Helper: assert a full row against the printed RR p.316 table (+ RR pp.153–156 draft/deck).
function rowCheck(key, exp){
  const c = ACKS.findVesselClass(key);
  ok('row present: ' + key, !!c);
  if(!c) return;
  for(const f of Object.keys(exp)){
    ok(key + '.' + f + ' === ' + JSON.stringify(exp[f]), c[f] === exp[f], 'got ' + JSON.stringify(c[f]));
  }
}
// galley, oar+sail, aphract
rowCheck('galley-1-rower',  { sailors:3,  rowers:30,  marines:0,   oarSprintFt:240, oarCruiseFt:150, oarSlowFt:90,  sailFt:240, voyageOarMi:30, voyageSailMi:96, cargoSt:500,   ac:2, shp:15,  draftFt:2.33, deckType:'aphract',    costGp:1500 });
// galley, cataphract, 75 marines
rowCheck('galley-4-rower',  { sailors:15, rowers:180, marines:75,  oarSprintFt:300, oarCruiseFt:240, oarSlowFt:120, sailFt:180, voyageOarMi:48, voyageSailMi:72, cargoSt:2000,  ac:2, shp:65,  draftFt:4,    deckType:'cataphract', costGp:10000 });
// the biggest galley — war-machine capacity
rowCheck('galley-8-rower',  { sailors:50, rowers:440, marines:150, oarSprintFt:240, oarCruiseFt:210, oarSlowFt:120, sailFt:150, voyageOarMi:42, voyageSailMi:60, cargoSt:8000,  ac:2, shp:200, draftFt:8,    deckType:'cataphract', warMachineCount:7, warMachineMaxSt:800, costGp:30000 });
// longship — oar+sail, crew-as-marines (table "(75)"), no war machines, draft 2'–3' → 3
rowCheck('longship',        { sailors:15, rowers:60,  marines:75,  oarSprintFt:210, oarCruiseFt:150, oarSlowFt:90,  sailFt:240, voyageOarMi:30, voyageSailMi:90, cargoSt:2000,  ac:2, shp:30,  draftFt:3,    deckType:null, tonnage:null, warMachineCount:0, costGp:4000 });
// sailing ship — sail-only (no oars), huge
rowCheck('sailing-ship-huge', { sailors:40, rowers:0, marines:0, oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:180, voyageOarMi:null, voyageSailMi:60, cargoSt:50000, ac:2, shp:400, draftFt:12.5, tonnage:400, deckType:null, costGp:60000 });
// barge — sail-only cargo carrier, small
rowCheck('barge-small',     { sailors:5, rowers:0, marines:0, oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:180, voyageOarMi:null, voyageSailMi:72, cargoSt:2000, ac:2, shp:15, draftFt:2, tonnage:15, warMachineCount:1, warMachineMaxSt:120, costGp:2000 });
// canoe — oar-only small craft, draft 6" = 0.5
rowCheck('canoe',           { sailors:0, rowers:1, marines:0, oarSprintFt:210, oarCruiseFt:150, oarSlowFt:90, sailFt:null, voyageOarMi:30, voyageSailMi:null, cargoSt:60, ac:0, shp:1, draftFt:0.5, costGp:40 });
// rowboat — oar-only
rowCheck('boat-row',        { sailors:0, rowers:1, marines:0, oarSprintFt:210, oarCruiseFt:150, oarSlowFt:90, sailFt:null, voyageOarMi:30, voyageSailMi:null, cargoSt:100, ac:1, shp:2, draftFt:1, costGp:200 });

section('VESSEL_CATALOG — "—"→null modelling + deck-type designation');
// "—" in a SPEED column ⇒ null (mode unavailable), not 0.
ok('barge cannot row → oar speeds null', ['oarSprintFt','oarCruiseFt','oarSlowFt','voyageOarMi'].every(f => ACKS.findVesselClass('barge-large')[f] === null));
ok('rowboat has no sail → sail speeds null', ACKS.findVesselClass('boat-row').sailFt === null && ACKS.findVesselClass('boat-row').voyageSailMi === null);
// "—" in a CREW column ⇒ 0 (no requirement/capacity).
ok('sailing ships require 0 rowers (—→0)', ACKS.findVesselClass('sailing-ship-large').rowers === 0);
ok('galley-1 carries 0 marines (—→0)', ACKS.findVesselClass('galley-1-rower').marines === 0);
// deck type: galleys 1..3 aphract, 4..8 cataphract; everything else null
ok('galleys ≤3-rower are aphract', ['galley-1-rower','galley-1.5-rower','galley-2-rower','galley-2.5-rower','galley-3-rower'].every(k => ACKS.findVesselClass(k).deckType === 'aphract'));
ok('galleys ≥4-rower are cataphract', ['galley-4-rower','galley-5-rower','galley-6-rower','galley-8-rower'].every(k => ACKS.findVesselClass(k).deckType === 'cataphract'));
ok('non-galleys have no deck designation (null)', ['barge-small','boat-sail','canoe','longship','raft','sailing-ship-small'].every(k => ACKS.findVesselClass(k).deckType === null));
// the 2.5-rower table-vs-prose cargo (we follow the p.316 table: 1,250)
ok('galley-2.5-rower cargo follows the p.316 table (1,250)', ACKS.findVesselClass('galley-2.5-rower').cargoSt === 1250);

// =============================================================================
section('Catalog lookups');
// =============================================================================
ok('findVesselClass returns the row', ACKS.findVesselClass('longship').label === 'Longship');
ok('findVesselClass(unknown) → null', ACKS.findVesselClass('nope') === null);
ok('findVesselClass(null) → null', ACKS.findVesselClass(null) === null);
ok('isVesselClass true for a real key', ACKS.isVesselClass('galley-5-rower') === true);
ok('isVesselClass false for a bogus key', ACKS.isVesselClass('xyz') === false);
ok('vesselClassLabel resolves', ACKS.vesselClassLabel('sailing-ship-small') === 'Sailing Ship, Small');
ok('vesselClassLabel(unknown) echoes the key', ACKS.vesselClassLabel('zzz') === 'zzz');
ok('vesselCatalogList is a defensive copy', ACKS.vesselCatalogList() !== ACKS.VESSEL_CATALOG && ACKS.vesselCatalogList().length === 20);

// =============================================================================
section('blankVessel — shape + defaults');
// =============================================================================
const v0 = ACKS.blankVessel({});
const EXPECT_FIELDS = ['schemaVersion','id','name','catalogKey','shp','ownerId','currentHexId','crewComplement','crewGroupIds','officerCharacterIds','holdStashId','warMachines','condition','constructionState','createdAtTurn','history'];
ok('blankVessel emits the full field set', EXPECT_FIELDS.every(f => f in v0), 'missing: ' + EXPECT_FIELDS.filter(f => !(f in v0)));
ok('blankVessel id has vsl- prefix', /^vsl-/.test(v0.id));
ok('blankVessel schemaVersion is 2', v0.schemaVersion === 2);
ok('blankVessel default condition seaworthy', v0.condition === 'seaworthy');
ok('blankVessel default constructionState complete', v0.constructionState === 'complete');
ok('blankVessel crewComplement zeros', v0.crewComplement.sailors === 0 && v0.crewComplement.rowers === 0 && v0.crewComplement.marines === 0);
ok('blankVessel arrays empty', v0.crewGroupIds.length === 0 && v0.officerCharacterIds.length === 0 && v0.warMachines.length === 0 && v0.history.length === 0);
ok('blankVessel shp defaults to 0 with no class', v0.shp === 0);
// shp defaults to the class base SHP when catalogKey is given
const vG = ACKS.blankVessel({ catalogKey: 'galley-5-rower' });
ok('blankVessel shp defaults to class base SHP', vG.shp === 120);
// opts are honoured + arrays copied (not aliased)
const srcCrew = ['grp-x']; const vO = ACKS.blankVessel({ name: 'Sea Wolf', catalogKey: 'longship', shp: 25, ownerId: 'chr-1', crewGroupIds: srcCrew });
ok('blankVessel keeps opts', vO.name === 'Sea Wolf' && vO.catalogKey === 'longship' && vO.shp === 25 && vO.ownerId === 'chr-1');
ok('blankVessel copies array opts (no aliasing)', vO.crewGroupIds[0] === 'grp-x' && vO.crewGroupIds !== srcCrew);

// =============================================================================
section('createVessel — init-on-write + entity round-trip');
// =============================================================================
const camp = ACKS.blankCampaign({ name: 'Voyage Test' });
ok('blankCampaign has NO vessels collection (defensive-read model)', !('vessels' in camp) || !Array.isArray(camp.vessels));
const v1 = ACKS.createVessel(camp, { name: 'Wave Dancer', catalogKey: 'galley-2-rower' });
ok('createVessel returns the vessel', v1 && v1.name === 'Wave Dancer');
ok('createVessel init-on-writes campaign.vessels', Array.isArray(camp.vessels) && camp.vessels.length === 1);
ok('findVessel resolves it', ACKS.findVessel(camp, v1.id) === v1);
ok('findVessel(unknown) → null', ACKS.findVessel(camp, 'vsl-nope') === null);
// JSON round-trip survives unchanged (the data-layer contract)
const rt = clone(camp);
ok('vessel survives a JSON round-trip', JSON.stringify(rt.vessels[0]) === JSON.stringify(v1));
ok('findVessel works on the round-tripped campaign', ACKS.findVessel(rt, v1.id).name === 'Wave Dancer');
// vesselsOwnedBy / vesselsAtHex
const v2 = ACKS.createVessel(camp, { name: 'Gull', catalogKey: 'boat-sail', ownerId: 'chr-7', currentHexId: 'hex-port' });
ok('vesselsOwnedBy filters by owner', ACKS.vesselsOwnedBy(camp, 'chr-7').length === 1 && ACKS.vesselsOwnedBy(camp, 'chr-7')[0] === v2);
ok('vesselsAtHex filters by hex', ACKS.vesselsAtHex(camp, 'hex-port').length === 1);

// =============================================================================
section('Entity registry — vessel kind');
// =============================================================================
ok('entityKind(vessel) registered', !!ACKS.entityKind('vessel'));
ok('entityIcon(vessel) is 🚢', ACKS.entityIcon('vessel') === '🚢');
ok('entityPluralLabel(vessel) is Vessels', ACKS.entityPluralLabel('vessel') === 'Vessels');
ok('listEntities(vessel) reads campaign.vessels', ACKS.listEntities(camp, 'vessel').length === 2);
ok('findEntity(vessel) resolves', ACKS.findEntity(camp, 'vessel', v1.id) === v1);
ok('entityDisplayName(vessel) uses name', ACKS.entityDisplayName(camp, 'vessel', v1.id) === 'Wave Dancer');
// displayName falls back to catalogKey then id (registry⊆factory: reads only blankVessel keys)
const vNoName = ACKS.createVessel(camp, { catalogKey: 'raft' });
ok('displayName falls back to catalogKey when unnamed', ACKS.entityDisplayName(camp, 'vessel', vNoName.id) === 'raft');
ok('listEntities on a vessel-less campaign → [] (defensive)', ACKS.listEntities(ACKS.blankCampaign({}), 'vessel').length === 0);

// =============================================================================
section('Field schema — vessel (schema ⊆ blankVessel; catalogKey picker)');
// =============================================================================
const sch = ACKS.FIELD_SCHEMAS['vessel'];
ok('vessel field schema present', !!sch && sch.factory === 'blankVessel');
ok('vessel schema is adminCreate schemaForm', sch.adminCreate === 'schemaForm');
const factoryKeys = new Set(Object.keys(ACKS.blankVessel({})));
const schemaMissing = sch.fields.map(f => f.name).filter(n => !factoryKeys.has(n));
ok('every vessel schema field is a blankVessel key (schema ⊆ factory)', schemaMissing.length === 0, 'missing: ' + schemaMissing.join(','));
ok('vessel schema validates clean', ACKS.validateFieldSchema('vessel', sch).ok === true, JSON.stringify(ACKS.validateFieldSchema('vessel', sch).errors));
// the catalogKey enum is the picker — its values must be the catalog keys
const catField = sch.fields.find(f => f.name === 'catalogKey');
ok('catalogKey is an enum field', catField && catField.type === 'enum');
ok('catalogKey enumValues == the catalog keys (the picker)', JSON.stringify(catField.enumValues) === JSON.stringify(ACKS.vesselClassKeys()));
// every field group is declared
const declared = new Set(sch.groups);
ok('every vessel field group is declared in schema.groups', sch.fields.every(f => !f.group || declared.has(f.group)));

// =============================================================================
section('Journey.shipId — wired to the Vessel');
// =============================================================================
ok('blankJourney emits shipId (reserved factory field)', 'shipId' in ACKS.blankJourney({}));
ok('blankJourney shipId defaults null', ACKS.blankJourney({}).shipId === null);
const jsch = ACKS.FIELD_SCHEMAS['journey'];
const shipField = jsch.fields.find(f => f.name === 'shipId');
ok('journey schema surfaces shipId', !!shipField && shipField.type === 'id' && shipField.idKind === 'vessel');
ok('journey schema shipId is a blankJourney key (⊆ holds)', 'shipId' in ACKS.blankJourney({}));
// vesselForJourney / journeysForVessel resolvers
camp.journeys = camp.journeys || [];
const voyage = ACKS.blankJourney({ name: 'To the Isles', mode: 'voyage-sail', shipId: v1.id });
camp.journeys.push(voyage);
ok('vesselForJourney resolves journey.shipId → the Vessel', ACKS.vesselForJourney(camp, voyage) === v1);
ok('vesselForJourney accepts a journey id', ACKS.vesselForJourney(camp, voyage.id) === v1);
ok('vesselForJourney on a land journey (no shipId) → null', ACKS.vesselForJourney(camp, ACKS.blankJourney({})) === null);
ok('journeysForVessel reverse-index (computed)', ACKS.journeysForVessel(camp, v1.id).length === 1 && ACKS.journeysForVessel(camp, v1.id)[0] === voyage);

// =============================================================================
section('Binding resolvers — crew Groups / officer Characters / hold Stash / owner');
// =============================================================================
const bc = ACKS.blankCampaign({ name: 'Bindings' });
bc.characters = [{ id: 'chr-cap', name: 'Captain Mara' }, { id: 'chr-nav', name: 'Navigator Oro' }];
bc.domains = [{ id: 'dom-1', name: 'The Free Port' }];
bc.groups = [{ id: 'grp-rowers', groupTemplate: { monsterCatalogKey: 'man' }, count: 90 }];
const bv = ACKS.createVessel(bc, { name: 'Liburnian', catalogKey: 'galley-2-rower', ownerId: 'chr-cap',
  crewGroupIds: ['grp-rowers'], officerCharacterIds: ['chr-cap','chr-nav'] });
ok('vesselClass resolves the class', ACKS.vesselClass(bv).key === 'galley-2-rower');
ok('vesselCrewGroups resolves crew Groups', ACKS.vesselCrewGroups(bc, bv).length === 1 && ACKS.vesselCrewGroups(bc, bv)[0].id === 'grp-rowers');
ok('vesselOfficers resolves officer Characters', ACKS.vesselOfficers(bc, bv).map(c => c.id).join(',') === 'chr-cap,chr-nav');
ok('vesselOwner resolves a character owner', (() => { const o = ACKS.vesselOwner(bc, bv); return o && o.kind === 'character' && o.entity.id === 'chr-cap'; })());
// a domain-owned vessel resolves to the domain (ownerId is polymorphic)
const dv = ACKS.createVessel(bc, { name: 'Realm Galley', catalogKey: 'galley-3-rower', ownerId: 'dom-1' });
ok('vesselOwner resolves a domain owner', (() => { const o = ACKS.vesselOwner(bc, dv); return o && o.kind === 'domain' && o.entity.id === 'dom-1'; })());
ok('vesselOwner on an unknown ownerId → null', ACKS.vesselOwner(bc, ACKS.blankVessel({ ownerId: 'zzz' })) === null);
// hold — vesselHold null until created; ensureVesselHold makes a stashKind:'vessel-hold' Stash
ok('vesselHold null before one exists', ACKS.vesselHold(bc, bv) === null);
const hold = ACKS.ensureVesselHold(bc, bv);
ok('ensureVesselHold creates a Stash (Stash factory present)', !!hold && hold.kind === 'vessel-hold');
ok('ensureVesselHold links holdStashId on the vessel', bv.holdStashId === hold.id);
ok('vesselHold now resolves the hold', ACKS.vesselHold(bc, bv) === hold);
ok('ensureVesselHold is idempotent', ACKS.ensureVesselHold(bc, bv) === hold && bc.stashes.filter(s => s.id === hold.id).length === 1);

// =============================================================================
section('Derived reference reads (catalog-backed)');
// =============================================================================
ok('vesselCargoCapacitySt reads the class cargo', ACKS.vesselCargoCapacitySt(bv) === 1000);
ok('vesselFullCrew reads the class complement', (() => { const fc = ACKS.vesselFullCrew(bv); return fc.sailors === 5 && fc.rowers === 90 && fc.marines === 10; })());
ok('vesselDraftFt reads the class draft', ACKS.vesselDraftFt({ catalogKey: 'galley-8-rower' }) === 8);
ok('vesselBaseVoyageSpeedMi oar/sail split', ACKS.vesselBaseVoyageSpeedMi({ catalogKey: 'galley-1-rower' }, 'oar') === 30 && ACKS.vesselBaseVoyageSpeedMi({ catalogKey: 'galley-1-rower' }, 'sail') === 96);
ok('vesselBaseVoyageSpeedMi sail-only vessel oar → null', ACKS.vesselBaseVoyageSpeedMi({ catalogKey: 'sailing-ship-large' }, 'oar') === null);
ok('vesselIsDamaged true when shp < class base', ACKS.vesselIsDamaged(ACKS.blankVessel({ catalogKey: 'longship', shp: 10 })) === true);
ok('vesselIsDamaged false at full SHP', ACKS.vesselIsDamaged(ACKS.blankVessel({ catalogKey: 'longship' })) === false);

// =============================================================================
section('V1 guard — migrate-no-op (no vessels injector)');
// =============================================================================
// The load-bearing team-safety property: V1 adds NO lazy injector, so a campaign that has no
// vessels collection STAYS without one through migrateCampaign — the 6 templates + demo stay
// migrate-no-ops (the full byte-equality is locked in migrations.smoke.js P3.6).
const mc = ACKS.blankCampaign({ name: 'No Ships' });
ok('blankCampaign does not create vessels', !('vessels' in mc) || !Array.isArray(mc.vessels));
ACKS.migrateCampaign(mc);
ok('migrateCampaign does NOT inject a vessels collection', !Array.isArray(mc.vessels), 'vessels was injected — would break migrate-no-op');
// every shipped template + the demo: migrate adds no vessels (a focused echo of P3.6)
const tplDir = path.join(REPO, 'Templates');
let tplChecked = 0, tplClean = 0;
if(fs.existsSync(tplDir)){
  for(const f of fs.readdirSync(tplDir).filter(x => x.endsWith('.acks.json'))){
    const raw = JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8'));
    const hadVessels = Array.isArray(raw.vessels);
    const m = ACKS.migrateCampaign(clone(raw));
    tplChecked++;
    if(Array.isArray(m.vessels) === hadVessels) tplClean++;
  }
  ok('migrate adds no vessels to any shipped template (' + tplChecked + ' checked)', tplChecked > 0 && tplClean === tplChecked, tplClean + '/' + tplChecked);
} else {
  ok('Templates dir present', false, 'no Templates/ dir found');
}

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Voyages V1 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
