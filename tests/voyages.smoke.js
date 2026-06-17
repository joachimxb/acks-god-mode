// =============================================================================
// voyages.smoke.js — Maritime / Voyages V1 (data layer) + V2 (wind/sailing speed)
// + V3a (sea navigation + weathering the seas). Phase 3 Voyages (#145).
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
section('V2 — wind STRENGTH table (RR p.319; keyed by the Weather wind axis)');
// =============================================================================
const WSV = ACKS.WIND_STRENGTH_VOYAGE;
ok('WIND_STRENGTH_VOYAGE frozen + has the 6 Weather wind bands', Object.isFrozen(WSV)
  && ['Still','Gentle','Moderate','Strong','Windy','Stormy'].every(k => WSV[k]));
ok('Still: sail ×0, oar ×1 (becalmed → rows)', WSV.Still.sail === 0 && WSV.Still.oar === 1);
ok('Gentle: sail ×½', WSV.Gentle.sail === 1/2 && WSV.Gentle.oar === 1);
ok('Moderate: sail ×1', WSV.Moderate.sail === 1 && WSV.Moderate.oar === 1);
ok('Strong: sail ×3/2, tack needs a master', WSV.Strong.sail === 3/2 && WSV.Strong.tackNeedsMaster === true);
ok('Windy = RR Very Strong (sail+oar ×2/3)', WSV.Windy.sail === 2/3 && WSV.Windy.oar === 2/3 && WSV.Windy.rawBand === 'Very Strong');
ok('Stormy = RR Gale (×2/3, gale flag)', WSV.Stormy.sail === 2/3 && WSV.Stormy.gale === true && WSV.Stormy.rawBand === 'Gale');
ok('windStrengthVoyage(unknown) → Moderate default', ACKS.windStrengthVoyage('zzz') === WSV.Moderate);

// =============================================================================
section('V2 — point of sail (RR p.318) + master-mariner shift');
// =============================================================================
// heading vs where the wind blows FROM; θ = 0 dead ahead (into the wind), 180 dead behind (running).
ok('wind dead ahead → into the wind (×0)', ACKS.pointOfSail(0, 0).band === 'into-wind' && ACKS.pointOfSail(0, 0).sailMult === 0);
ok('45° off → close-hauled (×1/3, 66% progress)', (() => { const p = ACKS.pointOfSail(45, 0); return p.band === 'close-hauled' && p.sailMult === 1/3 && p.progressFraction === 0.66; })());
ok('90° off → beam reach (×1/2)', ACKS.pointOfSail(90, 0).band === 'beam-reach' && ACKS.pointOfSail(90, 0).sailMult === 1/2);
ok('135° off → broad reach (×2/3)', ACKS.pointOfSail(135, 0).band === 'broad-reach' && ACKS.pointOfSail(135, 0).sailMult === 2/3);
ok('wind dead behind → running (×1)', ACKS.pointOfSail(180, 0).band === 'running' && ACKS.pointOfSail(180, 0).sailMult === 1);
// the angle is symmetric + wraps (heading 0 / wind 180 = running)
ok('symmetric: heading 0, wind FROM 180 → running', ACKS.pointOfSail(0, 180).band === 'running');
ok('wrap-around: heading 350, wind FROM 10 → into the wind (θ=20)', ACKS.pointOfSail(350, 10).band === 'into-wind');
// master mariner shifts ONE step more favorable
ok('master mariner: beam reach → broad reach', ACKS.pointOfSail(90, 0, { masterMariner: true }).band === 'broad-reach');
ok('master mariner: into the wind → close-hauled', ACKS.pointOfSail(0, 0, { masterMariner: true }).band === 'close-hauled');
ok('master mariner caps at running', ACKS.pointOfSail(180, 0, { masterMariner: true }).band === 'running');
ok('no heading/direction data → beam-reach neutral', ACKS.pointOfSail(NaN, NaN).band === 'beam-reach');

// =============================================================================
section('V2 — vesselBearingDeg (hex axial → compass bearing; flat-top frame)');
// =============================================================================
// HEX_EDGE_DELTAS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]] = faces [SE,S,SW,NW,N,NE]
//                 = bearings                                    [120,180,240,300,0,60].
const O = { q: 0, r: 0 };
ok('N face [0,-1] → 0°',   ACKS.vesselBearingDeg(O, { q: 0,  r: -1 }) === 0);
ok('S face [0,1] → 180°',  ACKS.vesselBearingDeg(O, { q: 0,  r: 1 })  === 180);
ok('SE face [1,0] → 120°', Math.round(ACKS.vesselBearingDeg(O, { q: 1, r: 0 }))  === 120);
ok('NW face [-1,0] → 300°',Math.round(ACKS.vesselBearingDeg(O, { q: -1, r: 0 })) === 300);
ok('NE face [1,-1] → 60°', Math.round(ACKS.vesselBearingDeg(O, { q: 1, r: -1 })) === 60);
ok('SW face [-1,1] → 240°',Math.round(ACKS.vesselBearingDeg(O, { q: -1, r: 1 })) === 240);
ok('a multi-hex S leg still reads 180°', Math.round(ACKS.vesselBearingDeg(O, { q: 0, r: 5 })) === 180);
ok('zero delta → null', ACKS.vesselBearingDeg(O, O) === null);

// =============================================================================
section('V2 — crew/damage speed factor (RR p.322, worse-of-two; unset crew = full)');
// =============================================================================
const fc = ACKS.blankCampaign({ name: 'speedfactor' });
ok('undamaged + unset crew → ×1 (assume full)', ACKS.vesselVoyageSpeedFactor(fc, ACKS.blankVessel({ catalogKey: 'galley-2-rower' }), 'oar') === 1);
// galley-2-rower base SHP 25 → at 12 SHP, damageFactor 12/25 = 0.48
ok('damaged → speed ∝ SHP remaining', Math.abs(ACKS.vesselVoyageSpeedFactor(fc, ACKS.blankVessel({ catalogKey: 'galley-2-rower', shp: 12 }), 'oar') - 12/25) < 1e-9);
// galley-2-rower full rowers 90 → at 45 rowers, crewFactor 0.5 (oar); worse-of-two with full SHP → 0.5
ok('partial rowers → oar crewFactor (worse-of-two)', ACKS.vesselVoyageSpeedFactor(fc, ACKS.blankVessel({ catalogKey: 'galley-2-rower', crewComplement: { sailors: 5, rowers: 45, marines: 0 } }), 'oar') === 0.5);
// the partial rower crew does NOT slow the SAIL mode (sailors full) — propulsion-specific
ok('partial rowers do not slow sail (full sailors)', ACKS.vesselVoyageSpeedFactor(fc, ACKS.blankVessel({ catalogKey: 'galley-2-rower', crewComplement: { sailors: 5, rowers: 45, marines: 0 } }), 'sail') === 1);
// worse of damage vs crew: 12/25 SHP (0.48) vs 45/90 rowers (0.5) → 0.48
ok('damage + crew not cumulative → the worse one', Math.abs(ACKS.vesselVoyageSpeedFactor(fc, ACKS.blankVessel({ catalogKey: 'galley-2-rower', shp: 12, crewComplement: { sailors: 5, rowers: 45, marines: 0 } }), 'oar') - 12/25) < 1e-9);

// =============================================================================
section('V2 — master mariner / navigator aboard + 24h-sail eligibility');
// =============================================================================
const mc2 = ACKS.blankCampaign({ name: 'crewprofs' });
mc2.characters = [
  { id: 'chr-mm',  name: 'Old Salt',  proficiencies: [{ key: 'seafaring', ranks: 3 }] },
  { id: 'chr-nav', name: 'Wayfinder', proficiencies: [{ key: 'navigation', ranks: 1 }] },
  { id: 'chr-hand', name: 'Deckhand', proficiencies: [] }
];
const mmShip = ACKS.createVessel(mc2, { name: 'Triton', catalogKey: 'sailing-ship-large', officerCharacterIds: ['chr-mm'] });
const navShip = ACKS.createVessel(mc2, { name: 'Compass', catalogKey: 'sailing-ship-large', officerCharacterIds: ['chr-nav'] });
const plainShip = ACKS.createVessel(mc2, { name: 'Drift', catalogKey: 'sailing-ship-large', officerCharacterIds: ['chr-hand'] });
ok('master mariner detected (Seafaring 3)', ACKS.vesselHasMasterMariner(mc2, mmShip) === true);
ok('a Seafaring-1 hand is not a master mariner', ACKS.vesselHasMasterMariner(mc2, navShip) === false);
ok('master mariner counts as a navigator', ACKS.vesselHasNavigator(mc2, mmShip) === true);
ok('Navigation-1 is a navigator', ACKS.vesselHasNavigator(mc2, navShip) === true);
ok('no nav/seafaring officer → no navigator', ACKS.vesselHasNavigator(mc2, plainShip) === false);
// 24h sail eligibility: sail-capable + navigator + full-or-unset crew
ok('24h eligible: sail + navigator + unset crew', ACKS.voyageContinuousSailEligible(mc2, ACKS.blankJourney({}), navShip) === true);
ok('24h NOT eligible without a navigator', ACKS.voyageContinuousSailEligible(mc2, ACKS.blankJourney({}), plainShip) === false);
ok('24h NOT eligible for an oar-only craft', ACKS.voyageContinuousSailEligible(mc2, ACKS.blankJourney({}), ACKS.blankVessel({ catalogKey: 'boat-row' })) === false);

// =============================================================================
section('V2 — voyageDayMiles (the day distance: RR pp.318–322)');
// =============================================================================
const vc = ACKS.blankCampaign({ name: 'voydm' });
const shipL = ACKS.blankVessel({ catalogKey: 'sailing-ship-large' });   // voyageSailMi 72, no oars
const galley = ACKS.blankVessel({ catalogKey: 'galley-1-rower' });      // voyageSailMi 96, voyageOarMi 30
const W_RUN  = { wind: 'Moderate', windDirection: 0 };                  // heading 180 (S) = running
function vdm(camp, j, v, weather, headingDeg, extra){ return ACKS.voyageDayMiles(camp, j || {}, v, Object.assign({ weather, headingDeg }, extra || {})); }
// sailing ship, Moderate wind, running → full voyage speed 72
ok('sailing ship · Moderate · running → 72', vdm(vc, {}, shipL, W_RUN, 180).miles === 72);
ok('  → propulsion sail, point of sail running', (() => { const r = vdm(vc, {}, shipL, W_RUN, 180); return r.propulsion === 'sail' && r.pointOfSail === 'running'; })());
// Gentle wind halves the sail → 36
ok('sailing ship · Gentle · running → 36', vdm(vc, {}, shipL, { wind: 'Gentle', windDirection: 0 }, 180).miles === 36);
// Still wind: sail ×0, no oars → becalmed (0 miles)
ok('sailing ship · Still → becalmed 0', vdm(vc, {}, shipL, { wind: 'Still', windDirection: 0 }, 180).miles === 0);
// galley becalmed → rows (oar 30) — the strategic point of oars
ok('galley · Still → rows at 30 (oar)', (() => { const r = vdm(vc, {}, galley, { wind: 'Still', windDirection: 0 }, 180); return r.miles === 30 && r.propulsion === 'oar'; })());
// galley Moderate running → sail 96 beats oar 30 (auto)
ok('galley · Moderate · running → sails at 96', (() => { const r = vdm(vc, {}, galley, W_RUN, 180); return r.miles === 96 && r.propulsion === 'sail'; })());
// headwind: sailing ship into the wind, Moderate → tacks as close-hauled (72 × 1/3 × 0.66)
ok('sailing ship · headwind (Moderate) → tacks ≈15.84', Math.abs(vdm(vc, {}, shipL, { wind: 'Moderate', windDirection: 180 }, 180).miles - (72 * (1/3) * 0.66)) < 1e-9);
// headwind in STRONG wind without a master → can't tack → sail 0
ok('sailing ship · headwind (Strong, no master) → 0 (can\'t beat to windward)', vdm(vc, {}, shipL, { wind: 'Strong', windDirection: 180 }, 180).miles === 0);
// a galley in that same Strong headwind just rows (30)
ok('galley · Strong headwind → rows at 30', (() => { const r = vdm(vc, {}, galley, { wind: 'Strong', windDirection: 180 }, 180); return r.miles === 30 && r.propulsion === 'oar'; })());
// pace: half-speed halves; halted = 0
ok('half-speed pace halves the day', vdm(vc, {}, shipL, W_RUN, 180, { pace: 'half-speed' }).miles === 36);
ok('halted pace → 0 miles', vdm(vc, {}, shipL, W_RUN, 180, { pace: 'halted' }).miles === 0);
// damage: a half-SHP sailing ship makes half distance
ok('damaged sailing ship (½ SHP) → ½ distance', vdm(vc, {}, ACKS.blankVessel({ catalogKey: 'sailing-ship-large', shp: 100 }), W_RUN, 180).miles === 36);
// §26 override replaces the wind model (× pace), bypassing sail mechanics
ok('§26 override → base rate × pace', (() => { const r = vdm(vc, {}, shipL, { wind: 'Still', windDirection: 0 }, 0, { overrideMiles: 50 }); return r.miles === 50 && r.propulsion === 'override'; })());
ok('§26 override honours pace', vdm(vc, {}, shipL, W_RUN, 180, { overrideMiles: 50, pace: 'half-speed' }).miles === 25);
// 24h doubling: continuousSailing + navigator + full crew → ×2
const j24 = ACKS.blankJourney({ continuousSailing: true });
ok('24h sail (eligible) doubles distance', ACKS.voyageDayMiles(mc2, j24, navShip, { weather: W_RUN, headingDeg: 180 }).miles === 144);
ok('24h toggle without a navigator does NOT double', ACKS.voyageDayMiles(mc2, j24, plainShip, { weather: W_RUN, headingDeg: 180 }).miles === 72);
// gm-fiat weather (no wind data) → Moderate + favorable default → makes base speed
ok('no wind data → Moderate default (sails)', vdm(vc, {}, shipL, { condition: 'fair' }, 180).miles === 72);

// =============================================================================
section('V2 — integration: tickJourneyDay sails a Vessel (sea model governs, land machinery off)');
// =============================================================================
const ic = ACKS.blankCampaign({ name: 'voyage-int' });
ic.characters = [ACKS.blankCharacter({ id: 'chr-cap', name: 'Captain' })];
ic.hexes = [];
for(let r = 0; r <= 13; r++) ic.hexes.push(ACKS.blankHex({ id: 'sea-' + r, coord: { q: 0, r: r }, terrain: 'water' }));  // a S-bearing open-sea lane
const iv = ACKS.createVessel(ic, { name: 'Strait Runner', catalogKey: 'sailing-ship-large' });    // voyageSailMi 72
const ij = ACKS.blankJourney({ name: 'Across the Strait', mode: 'voyage-sail', shipId: iv.id,
  participantCharacterIds: ['chr-cap'], startHexId: 'sea-0', destinationHexId: 'sea-13', currentHexId: 'sea-0' });
ic.journeys = [ij];
ACKS.startJourney(ic, ij);
// Moderate wind from the N (0°); the lane heads S (180°) → running → 72 mi/day → 12 six-mile hexes.
const idr = ACKS.tickJourneyDay(ic, ij, { rng: () => 0.5, weather: { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
const iDay = idr.record.dayRecord;
ok('voyage day record carries the voyage breakdown', !!iDay.voyage && iDay.voyage.propulsion === 'sail' && iDay.voyage.pointOfSail === 'running');
ok('the SEA speed model governs (72 mi, not the land 24)', iDay.milesTraveled === 72 && iDay.hexesTraveled === 12);
ok('still in transit (12 of 13 hexes)', idr.record.newStatus === 'in-transit');
ok('V3a — a voyage now MAKES a sea-navigation throw (coast 7+, succeeds at rng .5)', !!iDay.navigationThrow && iDay.navigationThrow.result === 'success' && iDay.navigationThrow.target === 7);
ok('NO ration survival on a voyage (ship stores are V3)', idr.record.survival === null && iDay.rationsConsumed.food === 0);
ok('NO per-hex wandering encounter on a voyage (sea encounters are V4)', (idr.record.encounterProposals || []).length === 0);
ok('NO party fatigue on a voyage (crewing is unstrenuous)', iDay.fatigueAccumulated === 0);
// and a LAND journey is unchanged — voyage record is null
const lc = ACKS.blankCampaign({ name: 'land-ctrl' });
lc.characters = [ACKS.blankCharacter({ id: 'chr-1', name: 'Walker' })];
lc.hexes = [ACKS.blankHex({ id: 'l0', coord: { q: 0, r: 0 }, terrain: 'grassland', hasRoad: true }), ACKS.blankHex({ id: 'l1', coord: { q: 6, r: 0 }, terrain: 'grassland', hasRoad: true })];
const lj = ACKS.blankJourney({ name: 'Overland', participantCharacterIds: ['chr-1'], startHexId: 'l0', destinationHexId: 'l1', currentHexId: 'l0' });
lc.journeys = [lj]; ACKS.startJourney(lc, lj);
const ldr = ACKS.tickJourneyDay(lc, lj, { rng: () => 0.5, weather: { condition: 'fair', temperature: 'moderate' } });
ok('a land journey is unaffected (voyage record null)', ldr.record.dayRecord.voyage === null);

// =============================================================================
section('V3a — sea-navigation targets + zones (RR p.320)');
// =============================================================================
ok('SEA_NAV_THROWS: lake/river 4, coast 7, open-sea 11', ACKS.SEA_NAV_THROWS.lake === 4 && ACKS.SEA_NAV_THROWS.river === 4 && ACKS.SEA_NAV_THROWS.coast === 7 && ACKS.SEA_NAV_THROWS['open-sea'] === 11);
ok('SEA_NAV_THROWS is frozen', Object.isFrozen(ACKS.SEA_NAV_THROWS));
ok('seaZoneForHex reads a valid hex.seaZone', ACKS.seaZoneForHex({ seaZone: 'open-sea' }) === 'open-sea' && ACKS.seaZoneForHex({ seaZone: 'lake' }) === 'lake');
ok('seaZoneForHex defaults to coast (water hex, no zone, null)', ACKS.seaZoneForHex({ terrain: 'water' }) === 'coast' && ACKS.seaZoneForHex(null) === 'coast');
ok('seaZoneForHex rejects a bogus zone → coast', ACKS.seaZoneForHex({ seaZone: 'nonsense' }) === 'coast');
ok('seaNavTarget(open-sea)=11, bogus→coast 7', ACKS.seaNavTarget('open-sea') === 11 && ACKS.seaNavTarget('bogus') === 7);

// =============================================================================
section('V3a — weathering the seas (RR pp.321–322): the precipitation axis');
// =============================================================================
ok('fog on a COASTAL vessel → ½ speed + nav −4', (() => { const fx = ACKS.voyageWeatherEffects('foggy', 'coast'); return fx.speedMult === 0.5 && fx.navTargetPenalty === 4 && fx.label === 'fog'; })());
ok('fog in the OPEN SEA → no speed effect (still nav −4)', (() => { const fx = ACKS.voyageWeatherEffects('foggy', 'open-sea'); return fx.speedMult === 1 && fx.navTargetPenalty === 4; })());
ok('rain → nav −2, no speed effect', (() => { const fx = ACKS.voyageWeatherEffects('rainy', 'coast'); return fx.speedMult === 1 && fx.navTargetPenalty === 2 && fx.label === 'rain'; })());
ok('snow → ½ speed (anywhere), no nav penalty', (() => { const fx = ACKS.voyageWeatherEffects('snowy', 'open-sea'); return fx.speedMult === 0.5 && fx.navTargetPenalty === 0 && fx.label === 'snow'; })());
ok('fair → no effect', (() => { const fx = ACKS.voyageWeatherEffects('fair', 'coast'); return fx.speedMult === 1 && fx.navTargetPenalty === 0 && fx.label === null; })());
// the speed effect folds into voyageDayMiles (sailing ship, Moderate, running = base 72)
ok('voyageDayMiles: fog coast → 72×½ = 36', vdm(vc, {}, shipL, { wind: 'Moderate', windDirection: 0, condition: 'foggy' }, 180, { seaZone: 'coast' }).miles === 36);
ok('voyageDayMiles: fog open-sea → unslowed 72', vdm(vc, {}, shipL, { wind: 'Moderate', windDirection: 0, condition: 'foggy' }, 180, { seaZone: 'open-sea' }).miles === 72);
ok('voyageDayMiles: snow → 72×½ = 36', vdm(vc, {}, shipL, { wind: 'Moderate', windDirection: 0, condition: 'snowy' }, 180, { seaZone: 'coast' }).miles === 36);
ok('voyageDayMiles: rain → unslowed 72', vdm(vc, {}, shipL, { wind: 'Moderate', windDirection: 0, condition: 'rainy' }, 180, { seaZone: 'coast' }).miles === 72);
ok('voyageDayMiles carries the weathering label + mult', (() => { const r = vdm(vc, {}, shipL, { wind: 'Moderate', windDirection: 0, condition: 'foggy' }, 180, { seaZone: 'coast' }); return r.weathering === 'fog' && r.weatheringSpeedMult === 0.5; })());
ok('§26 override is NOT weathering-slowed (GM set the rate)', vdm(vc, {}, shipL, { wind: 'Still', windDirection: 0, condition: 'foggy' }, 180, { seaZone: 'coast', overrideMiles: 50 }).miles === 50);

// =============================================================================
section('V3a — sea-navigation bonus (RR p.320, Seafaring-gated +4/+8)');
// =============================================================================
ok('a master mariner aboard → +8', ACKS.seaNavBonus(mc2, ACKS.blankJourney({}), mmShip) === 8);
ok('a navigator aboard → +4', ACKS.seaNavBonus(mc2, ACKS.blankJourney({}), navShip) === 4);
ok('no navigator/master → +0', ACKS.seaNavBonus(mc2, ACKS.blankJourney({}), plainShip) === 0);
ok('a participant with Navigation also counts (+4) even on a plain ship', ACKS.seaNavBonus(mc2, ACKS.blankJourney({ participantCharacterIds: ['chr-nav'] }), plainShip) === 4);

// =============================================================================
section('V3a — integration: a voyage gets lost at sea + weathering slows it');
// =============================================================================
// (1) a failed sea-nav throw (natural 1) → the vessel drifts off course, unaware (the §27 stray machinery)
const xc = ACKS.blankCampaign({ name: 'lost-at-sea' });
xc.characters = [ACKS.blankCharacter({ id: 'chr-x', name: 'Pilot' })];
xc.hexes = []; for(let r = 0; r <= 8; r++) xc.hexes.push(ACKS.blankHex({ id: 'os-' + r, coord: { q: 0, r: r }, terrain: 'water', seaZone: 'open-sea' }));
const xv = ACKS.createVessel(xc, { name: 'Wanderer', catalogKey: 'sailing-ship-large' });
const xj = ACKS.blankJourney({ name: 'Open Crossing', mode: 'voyage-sail', shipId: xv.id, participantCharacterIds: ['chr-x'], startHexId: 'os-0', destinationHexId: 'os-8', currentHexId: 'os-0' });
xc.journeys = [xj]; ACKS.startJourney(xc, xj);
const xdr = ACKS.tickJourneyDay(xc, xj, { rng: () => 0, weather: { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' } });   // rng 0 → natural 1 → auto-fail (open-sea 11+)
const xDay = xdr.record.dayRecord;
ok('open-sea voyage fails its nav throw (natural 1) → lost', xDay.navigationThrow && xDay.navigationThrow.result === 'fail-unknown-lost' && xDay.navigationThrow.naturalOne === true && xDay.navigationThrow.target === 11);
ok('the vessel drifts off course, unaware (newIsLost)', xdr.record.newIsLost === true && typeof xDay.strayHeading === 'number');

// (2) fog halves a coastal voyage's distance + records the weathering (nav target = coast 7 + fog 4 = 11)
const fogc = ACKS.blankCampaign({ name: 'foggy-coast' });
fogc.characters = [ACKS.blankCharacter({ id: 'chr-f', name: 'Skipper' })];
fogc.hexes = []; for(let r = 0; r <= 8; r++) fogc.hexes.push(ACKS.blankHex({ id: 'co-' + r, coord: { q: 0, r: r }, terrain: 'water' }));   // no seaZone → default coast
const fogv = ACKS.createVessel(fogc, { name: 'Mistral', catalogKey: 'sailing-ship-large' });
const fogj = ACKS.blankJourney({ name: 'Foggy Run', mode: 'voyage-sail', shipId: fogv.id, participantCharacterIds: ['chr-f'], startHexId: 'co-0', destinationHexId: 'co-8', currentHexId: 'co-0' });
fogc.journeys = [fogj]; ACKS.startJourney(fogc, fogj);
const fogdr = ACKS.tickJourneyDay(fogc, fogj, { rng: () => 0.95, weather: { wind: 'Moderate', windDirection: 0, condition: 'foggy', temperature: 'moderate' } });   // rng .95 → natural 20 → passes nav 11+
const fogDay = fogdr.record.dayRecord;
ok('fog halves the coastal voyage (72→36 = 6 hexes)', fogDay.milesTraveled === 36 && fogDay.hexesTraveled === 6);
ok('the day record carries the fog weathering', fogDay.voyage && fogDay.voyage.weathering === 'fog' && fogDay.voyage.weatheringSpeedMult === 0.5 && fogDay.voyage.seaZone === 'coast');
ok('the sea-nav target absorbed the fog penalty (coast 7 + 4 = 11)', fogDay.navigationThrow && fogDay.navigationThrow.target === 11 && fogDay.navigationThrow.result === 'success');

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Voyages V1 + V2 + V3a smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
