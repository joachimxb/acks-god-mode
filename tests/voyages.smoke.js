// =============================================================================
// voyages.smoke.js — Maritime / Voyages V1 (data layer) + V2 (wind/sailing speed)
// + V3a (sea navigation + weathering the seas) + V3b (nautical hazards + gale damage —
// the SHP-mutating record→commit→reroll slice) + V3c (ship stores + deprivation ladder +
// scurvy + fishing — the crew-provisioning ladder on the same replay machinery) + V5 (river
// voyages — the current ± mi/day after wind + the depth-vs-draft grounding). Phase 3 Voyages (#145).
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
section('V3b — nautical hazards (RR p.320): the catalog + the traversal throw');
// =============================================================================
const hzShip = ACKS.blankVessel({ catalogKey: 'sailing-ship-large', shp: 200 });   // no officers → target 11, no shallow-draft bonus
const hzGalley = ACKS.blankVessel({ catalogKey: 'galley-4-rower', shp: 65 });       // shallow → +4 vs sandbar/shoal
ok('NAUTICAL_HAZARDS has the 8 RR p.320 kinds', Object.keys(ACKS.NAUTICAL_HAZARDS).length === 8 && !!ACKS.NAUTICAL_HAZARDS.rock && !!ACKS.NAUTICAL_HAZARDS.whirlpool && !!ACKS.NAUTICAL_HAZARDS.kelp);
ok('NAUTICAL_HAZARDS is frozen', Object.isFrozen(ACKS.NAUTICAL_HAZARDS) && Object.isFrozen(ACKS.NAUTICAL_HAZARDS.rock));
ok('hazard effects: rock=hull, sandbar=ground, kelp=entangle, whirlpool=whirlpool', ACKS.NAUTICAL_HAZARDS.rock.effect === 'hull' && ACKS.NAUTICAL_HAZARDS.sandbar.effect === 'ground' && ACKS.NAUTICAL_HAZARDS.kelp.effect === 'entangle' && ACKS.NAUTICAL_HAZARDS.whirlpool.effect === 'whirlpool');
ok('nauticalHazardForHex reads a GM-flagged hex', !!ACKS.nauticalHazardForHex({ nauticalHazard: 'reef' }) && ACKS.nauticalHazardForHex({ nauticalHazard: 'reef' }).key === 'reef');
ok('nauticalHazardForHex: no flag / bogus / null → null', ACKS.nauticalHazardForHex({ terrain: 'water' }) === null && ACKS.nauticalHazardForHex({ nauticalHazard: 'bogus' }) === null && ACKS.nauticalHazardForHex(null) === null);
// success (nat 20) → no effect
const _hRockOk = ACKS.rollNauticalHazard({}, hzShip, 'rock', { rng: () => 0.99 });
ok('rock traverse SUCCESS (nat 20) → no SHP, no grounded, target 11', _hRockOk.success && _hRockOk.shpDamage === 0 && _hRockOk.grounded === null && _hRockOk.target === 11);
// failure (nat 1) on a rock → 8d10 hull damage (min 8), effect hull, no grounded
const _hRockFail = ACKS.rollNauticalHazard({}, hzShip, 'rock', { rng: () => 0 });
ok('rock FAIL (nat 1) → 8d10 hull damage (=8 min), no grounded, effect hull', !_hRockFail.success && _hRockFail.naturalOne && _hRockFail.shpDamage === 8 && _hRockFail.grounded === null && _hRockFail.effect === 'hull');
// sandbar fail → 4d10 + grounded sandbar
const _hSand = ACKS.rollNauticalHazard({}, hzShip, 'sandbar', { rng: () => 0 });
ok('sandbar FAIL → 4d10 (=4) + grounded "sandbar"', !_hSand.success && _hSand.shpDamage === 4 && _hSand.grounded === 'sandbar' && _hSand.effect === 'ground');
// kelp fail → no SHP + entangled
const _hKelp = ACKS.rollNauticalHazard({}, hzShip, 'kelp', { rng: () => 0 });
ok('kelp FAIL → no SHP + entangled (grounded "kelp")', !_hKelp.success && _hKelp.shpDamage === 0 && _hKelp.grounded === 'kelp' && _hKelp.effect === 'entangle');
// whirlpool fail → 6d10 + stuck
const _hWp = ACKS.rollNauticalHazard({}, hzShip, 'whirlpool', { rng: () => 0 });
ok('whirlpool FAIL → 6d10 (=6) + stuck', !_hWp.success && _hWp.shpDamage === 6 && _hWp.grounded === 'whirlpool');
// master mariner lowers the target to 7 (RR p.320)
ok('a master mariner aboard → target 7', ACKS.rollNauticalHazard(mc2, mmShip, 'rock', { rng: () => 0.5 }).target === 7);
ok('no master → target 11', ACKS.rollNauticalHazard({}, hzShip, 'rock', { rng: () => 0.5 }).target === 11);
// half-speed → +4 bonus + ½ damage (hull/ground)
const _hHalf = ACKS.rollNauticalHazard({}, hzShip, 'rock', { rng: () => 0, atHalfSpeed: true });
ok('at ≤½ speed → +4 bonus + ½ hull damage (ceil(8/2)=4)', _hHalf.bonus === 4 && _hHalf.shpDamage === 4);
// galley/longship +4 vs sandbar/shoal only
ok('a galley gets +4 vs a sandbar (shallow draft)', ACKS.rollNauticalHazard({}, hzGalley, 'sandbar', { rng: () => 0.5 }).bonus === 4);
ok('a galley gets NO +4 vs a reef (only sandbar/shoal)', ACKS.rollNauticalHazard({}, hzGalley, 'reef', { rng: () => 0.5 }).bonus === 0);
ok('a sailing ship gets no shallow-draft bonus vs a sandbar', ACKS.rollNauticalHazard({}, hzShip, 'sandbar', { rng: () => 0.5 }).bonus === 0);
ok('an unknown hazard → null', ACKS.rollNauticalHazard({}, hzShip, 'bogus', { rng: () => 0.5 }) === null);

// =============================================================================
section('V3b — gale damage (RR p.319)');
// =============================================================================
const _gOk = ACKS.rollVoyageGale({}, hzShip, { rng: () => 0.99 });
ok('ride out the gale SUCCESS (nat 20) → no damage', _gOk.success && _gOk.shpDamage === 0 && _gOk.hoursCaught === 0);
const _gFail = ACKS.rollVoyageGale({}, hzShip, { rng: () => 0 });
ok('caught in the gale FAIL (nat 1) → 2d8/hr × 1d4 h (1h × 2 min = 2)', !_gFail.success && _gFail.hoursCaught === 1 && _gFail.shpDamage === 2);
ok('a master mariner adds +4 to ride out the gale', ACKS.rollVoyageGale(mc2, mmShip, { rng: () => 0.5 }).bonus === 4 && ACKS.rollVoyageGale({}, hzShip, { rng: () => 0.5 }).bonus === 0);

// =============================================================================
section('V3b — applyVoyageDayState (commit-side apply, pure-absolute)');
// =============================================================================
const _ac = ACKS.blankCampaign({ name: 'apply' });
const _av = ACKS.createVessel(_ac, { catalogKey: 'sailing-ship-large', shp: 200 });
ACKS.applyVoyageDayState(_ac, null, { vesselId: _av.id, newShp: 150, newCondition: 'damaged', newGrounded: 'sandbar' });
ok('applyVoyageDayState writes shp/condition/grounded', _av.shp === 150 && _av.condition === 'damaged' && _av.grounded === 'sandbar');
ACKS.applyVoyageDayState(_ac, null, { vesselId: _av.id, newShp: 0, newCondition: 'sinking', newGrounded: null });
ok('applyVoyageDayState clears grounded + sets sinking at 0 SHP', _av.shp === 0 && _av.condition === 'sinking' && _av.grounded === null);

// =============================================================================
section('V3b — integration: a voyage strikes a reef (SHP damage) + commit applies + reroll reverts');
// =============================================================================
const hc = ACKS.blankCampaign({ name: 'reef-run' });
hc.characters = [ACKS.blankCharacter({ id: 'chr-h', name: 'Helm' })];
hc.hexes = [];
for(let r = 0; r <= 13; r++){
  const hx = ACKS.blankHex({ id: 'rf-' + r, coord: { q: 0, r: r }, terrain: 'water' });   // coast (default seaZone)
  if(r === 5) hx.nauticalHazard = 'rock';                                                   // a reef on the route
  hc.hexes.push(hx);
}
const hv = ACKS.createVessel(hc, { name: 'Hull Runner', catalogKey: 'sailing-ship-large' });   // 200 SHP, 72 sail
const hj = ACKS.blankJourney({ name: 'Reef Run', mode: 'voyage-sail', shipId: hv.id, participantCharacterIds: ['chr-h'], startHexId: 'rf-0', destinationHexId: 'rf-13', currentHexId: 'rf-0' });
hc.journeys = [hj]; ACKS.startJourney(hc, hj);
// rng 0.4 → nav (coast 7+) natural 9 = success (not lost); the rock hazard (11+, no bonus) natural 9 = fail → 8d10 @ .4 = 40 SHP
const hdr = ACKS.tickJourneyDay(hc, hj, { rng: () => 0.4, weather: { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
const hDay = hdr.record.dayRecord;
ok('the voyage sailed the reef hex (12 hexes, coast nav passed)', hDay.hexesTraveled === 12 && hDay.navigationThrow.result === 'success');
ok('record.voyageState carries the hull damage (rock, 40 SHP @ rng .4 → 160)', !!hdr.record.voyageState && hdr.record.voyageState.shpDamage === 40 && hdr.record.voyageState.newShp === 160 && hdr.record.voyageState.newCondition === 'damaged');
ok('the day record logs the hazard + SHP loss', hDay.voyage && hDay.voyage.shpDamage === 40 && Array.isArray(hDay.voyage.hazards) && hDay.voyage.hazards.some(h => h.hazard === 'rock' && !h.success));
ok('the tick is PURE — the vessel is unchanged until commit', hv.shp === 200 && hv.condition === 'seaworthy');
ACKS.commitJourneyRecord(hc, hdr.record);
ok('commit applies the hull damage to the vessel', hv.shp === 160 && hv.condition === 'damaged');
// reroll reverts the vessel, then re-runs with no-damage luck (nat 20 passes the hazard)
ACKS.rerollJourneyDay(hc, hj, { rng: () => 0.99 });
ok('reroll reverts the hull damage (vessel restored; no damage on the re-roll)', hv.shp === 200 && hv.condition === 'seaworthy');

// =============================================================================
section('V3b — integration: a gale holes the hull; a grounded vessel makes no way');
// =============================================================================
const gc = ACKS.blankCampaign({ name: 'gale-run' });
gc.characters = [ACKS.blankCharacter({ id: 'chr-g', name: 'Bosun' })];
gc.hexes = []; for(let r = 0; r <= 13; r++) gc.hexes.push(ACKS.blankHex({ id: 'gl-' + r, coord: { q: 0, r: r }, terrain: 'water' }));   // coast
const gv = ACKS.createVessel(gc, { name: 'Gale Rider', catalogKey: 'sailing-ship-large' });   // 200 SHP
const gj = ACKS.blankJourney({ name: 'Storm Crossing', mode: 'voyage-sail', shipId: gv.id, participantCharacterIds: ['chr-g'], startHexId: 'gl-0', destinationHexId: 'gl-13', currentHexId: 'gl-0' });
gc.journeys = [gj]; ACKS.startJourney(gc, gj);
// Stormy wind = the Gale band → voyageInfo.gale; coast nav (7+) passes at .4; the gale throw (11+) natural 9 = fail
// → 2d8 (@.4 = 8) × (1+floor(.4×4)=2) hours = 16 SHP
const gdr = ACKS.tickJourneyDay(gc, gj, { rng: () => 0.4, weather: { wind: 'Stormy', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
ok('a gale day threatens the hull (gale throw fails → 16 SHP)', !!gdr.record.voyageState && !!gdr.record.voyageState.galeEvent && gdr.record.voyageState.shpDamage === 16 && gdr.record.dayRecord.voyage.gale && gdr.record.dayRecord.voyage.gale.shpDamage === 16);
ACKS.commitJourneyRecord(gc, gdr.record);
ok('commit applies the gale damage (200 → 184)', gv.shp === 184);
// a grounded vessel makes no way until refloated
gv.grounded = 'sandbar';
const sdr = ACKS.tickJourneyDay(gc, gj, { rng: () => 0.5, weather: { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
ok('a grounded vessel travels 0 hexes (stuck)', sdr.record.dayRecord.hexesTraveled === 0 && sdr.record.dayRecord.voyage.stuck === true);
ok('the stuck day records a grounded pause + an "aground" summary', sdr.record.dayRecord.notableEvents.some(n => n.type === 'voyage-grounded') && /aground/.test(sdr.record.label));
ok('a stuck day mutates nothing (no voyageState — the GM must refloat)', sdr.record.voyageState === null);
// clearing the grounding resumes movement
gv.grounded = null;
const rdr = ACKS.tickJourneyDay(gc, gj, { rng: () => 0.5, weather: { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
ok('clearing the grounding resumes the voyage (hexes > 0)', rdr.record.dayRecord.hexesTraveled > 0 && rdr.record.dayRecord.voyage.stuck === false);

// =============================================================================
section('V3b — a clear-water voyage carries NO voyageState (opt-in by data)');
// =============================================================================
const cc = ACKS.blankCampaign({ name: 'clear-run' });
cc.characters = [ACKS.blankCharacter({ id: 'chr-c', name: 'Mate' })];
cc.hexes = []; for(let r = 0; r <= 13; r++) cc.hexes.push(ACKS.blankHex({ id: 'cw-' + r, coord: { q: 0, r: r }, terrain: 'water' }));
const cv = ACKS.createVessel(cc, { name: 'Calm Sailer', catalogKey: 'sailing-ship-large' });
const cj = ACKS.blankJourney({ name: 'Calm Run', mode: 'voyage-sail', shipId: cv.id, participantCharacterIds: ['chr-c'], startHexId: 'cw-0', destinationHexId: 'cw-13', currentHexId: 'cw-0' });
cc.journeys = [cj]; ACKS.startJourney(cc, cj);
const cdr = ACKS.tickJourneyDay(cc, cj, { rng: () => 0.5, weather: { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
ok('a hazard-free, gale-free voyage day carries no voyageState (vessel untouched)', cdr.record.voyageState === null && cdr.record.dayRecord.voyage.shpDamage === 0 && cdr.record.dayRecord.voyage.hazards === null && cdr.record.dayRecord.voyage.gale === null && cv.shp === 200);

// =============================================================================
section('V3c — ship-stores tracking + the deprivation ladder (RR p.321)');
// =============================================================================
ok('SHIP_SCURVY_ONSET_DAYS = 30 (one month)', ACKS.SHIP_SCURVY_ONSET_DAYS === 30);
ok('shipStoresTracked: a number (incl. 0) = opt-in; null/absent = off', ACKS.shipStoresTracked({ shipStores: 5 }) === true && ACKS.shipStoresTracked({ shipStores: 0 }) === true && ACKS.shipStoresTracked({}) === false && ACKS.shipStoresTracked(null) === false);
ok('ladder: fed (0) ×1', (() => { const L = ACKS.shipDeprivationLevel(0); return L.level === 'fed' && L.speedMult === 1 && L.calamity === false; })());
ok('ladder: hungry (1) ×1 — the grace day', (() => { const L = ACKS.shipDeprivationLevel(1); return L.level === 'hungry' && L.speedMult === 1; })());
ok('ladder: underfed (2–6) ×½', (() => { const a = ACKS.shipDeprivationLevel(2), b = ACKS.shipDeprivationLevel(6); return a.level === 'underfed' && a.speedMult === 0.5 && b.level === 'underfed'; })());
ok('ladder: starving (≥7) ×⅓ + a morale calamity', (() => { const L = ACKS.shipDeprivationLevel(7); return L.level === 'starving' && Math.abs(L.speedMult - 1/3) < 1e-9 && L.calamity === true; })());
ok('voyageHexIsFreshFood: a freshFood flag OR an embedded settlement → port', ACKS.voyageHexIsFreshFood({ freshFood: true }) === true && ACKS.voyageHexIsFreshFood({ settlement: { name: 'Harbor' } }) === true);
ok('voyageHexIsFreshFood: a plain sea hex / null → not a port', ACKS.voyageHexIsFreshFood({ terrain: 'water' }) === false && ACKS.voyageHexIsFreshFood(null) === false);

// =============================================================================
section('V3c — computeShipProvisionDay (PURE: consumption + deficit + scurvy)');
// =============================================================================
const _pc = ACKS.blankCampaign({ name: 'prov' });
const _mkV = (over) => Object.assign(ACKS.blankVessel({ catalogKey: 'sailing-ship-large' }), over);
ok('untracked vessel → tracked:false, no speed penalty', (() => { const r = ACKS.computeShipProvisionDay(_pc, ACKS.blankVessel({ catalogKey: 'longship' }), {}); return r.tracked === false && r.deprivation.speedMult === 1; })());
ok('a fed day (stores 2) → eats 1, deficit stays 0, scurvy counter +1', (() => { const r = ACKS.computeShipProvisionDay(_pc, _mkV({ shipStores: 2 }), {}); return r.tracked && r.ate === true && r.newStores === 1 && r.newDeficit === 0 && r.deprivation.level === 'fed' && r.newScurvyDays === 1; })());
ok('out of stores (0, deficit 1) → deficit→2, becomes underfed (entering hungry)', (() => { const r = ACKS.computeShipProvisionDay(_pc, _mkV({ shipStores: 0, provisionDeficitDays: 1 }), {}); return r.newStores === 0 && r.newDeficit === 2 && r.deprivation.level === 'hungry' && r.newLevel.level === 'underfed' && r.becameUnderfed === true; })());
ok('the starving transition (deficit 6 → 7) sets becameStarving', (() => { const r = ACKS.computeShipProvisionDay(_pc, _mkV({ shipStores: 0, provisionDeficitDays: 6 }), {}); return r.newDeficit === 7 && r.newLevel.level === 'starving' && r.becameStarving === true && r.deprivation.level === 'underfed'; })());
ok('scurvy onset at 30 days (counter 29 → 30)', (() => { const r = ACKS.computeShipProvisionDay(_pc, _mkV({ shipStores: 50, daysAtSeaWithoutFreshFood: 29, scurvy: false }), {}); return r.newScurvyDays === 30 && r.scurvyOnset === true && r.newScurvy === true; })());
ok('scurvy onset fires only once (already scurvy → no re-onset)', (() => { const r = ACKS.computeShipProvisionDay(_pc, _mkV({ shipStores: 50, daysAtSeaWithoutFreshFood: 40, scurvy: true }), {}); return r.scurvyOnset === false && r.newScurvy === true; })());
ok('fresh-food port: deficit→0, scurvy cured, NO ship-store consumed (eat ashore)', (() => { const r = ACKS.computeShipProvisionDay(_pc, _mkV({ shipStores: 7, provisionDeficitDays: 4, daysAtSeaWithoutFreshFood: 35, scurvy: true }), { hex: { settlement: {} } }); return r.freshFood === true && r.newDeficit === 0 && r.newScurvyDays === 0 && r.newScurvy === false && r.scurvyCured === true && r.newStores === 7; })());

// =============================================================================
section('V3c — fishing (RR p.321, the sea Forage variant; Fishing 14+, +4 Survival)');
// =============================================================================
const _fc = ACKS.blankCampaign({ name: 'fish' });
_fc.characters = [ACKS.blankCharacter({ id: 'angler', name: 'Angler', proficiencies: [{ key: 'survival', ranks: 1 }] }), ACKS.blankCharacter({ id: 'deckhand', name: 'Deckhand' })];
const _fv = ACKS.createVessel(_fc, { name: 'Netter', catalogKey: 'longship', officerCharacterIds: ['angler'], shipStores: 0 });
ok('fishing SUCCESS (nat 11 + Survival 4 = 15 ≥ 14) → +1 store', (() => { const r = ACKS.fishActivity(_fc, _fv, { rng: () => 0.5 }); return r.ok && r.success && r.bonus === 4 && r.storesGained === 1 && _fv.shipStores === 1; })());
ok('fishing logs to vessel.history', _fv.history.some(h => h.type === 'fished'));
const _fv2 = ACKS.createVessel(_fc, { name: 'Bare', catalogKey: 'longship', officerCharacterIds: ['deckhand'] });   // no Survival officer; shipStores absent
ok('no Survival aboard (nat 11, no bonus = 11 < 14) → fail, no store', (() => { const r = ACKS.fishActivity(_fc, _fv2, { rng: () => 0.5 }); return !r.success && r.bonus === 0 && r.storesGained === 0; })());
ok('fishing an untracked vessel materializes stores on success (null → 1)', (() => { const r = ACKS.fishActivity(_fc, _fv2, { rng: () => 0.99 }); return r.success && _fv2.shipStores === 1; })());
ok('fishing has NO nat-1 auto-fail (autoFailBand 0, like forage) — nat 1 just falls short', (() => { const r = ACKS.fishActivity(_fc, _fv, { rng: () => 0 }); return !r.success && r.rolled === 1; })());
ok('fishing with no vessel → {ok:false}', ACKS.fishActivity(_fc, null, {}).ok === false);

// =============================================================================
section('V3c — applyVoyageDayState writes the provisioning ladder (commit-side)');
// =============================================================================
const _av3 = ACKS.createVessel(ACKS.blankCampaign({ name: 'a3' }), { catalogKey: 'sailing-ship-large' });
const _ac3 = { vessels: [_av3] };
ACKS.applyVoyageDayState(_ac3, null, { vesselId: _av3.id, newShipStores: 4, newProvisionDeficitDays: 2, newScurvyDays: 12, newScurvy: true });
ok('applyVoyageDayState writes shipStores/deficit/scurvyDays/scurvy', _av3.shipStores === 4 && _av3.provisionDeficitDays === 2 && _av3.daysAtSeaWithoutFreshFood === 12 && _av3.scurvy === true);

// =============================================================================
section('V3c — integration: a voyage consumes stores; deprivation slows it; commit + reroll');
// =============================================================================
// a long open lane so the vessel is still in transit when deprivation bites
function mkVoyage(stores, deficit, opts){
  opts = opts || {};
  const c = ACKS.blankCampaign({ name: 'v3c-int' });
  c.characters = [ACKS.blankCharacter({ id: 'cap', name: 'Cap' })];
  c.hexes = []; for(let r = 0; r <= 60; r++){ const hx = ACKS.blankHex({ id: 'l' + r, coord: { q: 0, r: r }, terrain: 'water' }); if(opts.portAt === r) hx.settlement = { name: 'Harbor', families: 100 }; c.hexes.push(hx); }
  const v = ACKS.createVessel(c, { name: 'Runner', catalogKey: 'sailing-ship-large' });   // 72 mi/day = 12 hexes
  if(stores != null) v.shipStores = stores;
  if(deficit != null) v.provisionDeficitDays = deficit;
  if(opts.scurvyDays != null) v.daysAtSeaWithoutFreshFood = opts.scurvyDays;
  if(opts.scurvy != null) v.scurvy = opts.scurvy;
  const j = ACKS.blankJourney({ name: 'Long Haul', mode: 'voyage-sail', shipId: v.id, participantCharacterIds: ['cap'], startHexId: 'l0', destinationHexId: 'l60', currentHexId: 'l0' });
  c.journeys = [j]; ACKS.startJourney(c, j);
  return { c, v, j };
}
const _WMod = { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' };
const _fed = mkVoyage(3, 0);
const _fedDr = ACKS.tickJourneyDay(_fed.c, _fed.j, { rng: () => 0.5, weather: _WMod });
ok('a fed provisioned voyage sails full speed (72 mi) + records the consumption', _fedDr.record.dayRecord.milesTraveled === 72 && _fedDr.record.voyageState && _fedDr.record.voyageState.newShipStores === 2 && _fedDr.record.dayRecord.voyage.provision.level === 'fed');
ok('the tick is PURE — stores unchanged until commit', _fed.v.shipStores === 3);
ACKS.commitJourneyRecord(_fed.c, _fedDr.record);
ok('commit applies the consumption (stores 3→2, scurvy counter 0→1)', _fed.v.shipStores === 2 && _fed.v.daysAtSeaWithoutFreshFood === 1);
const _under = mkVoyage(0, 2);   // entering underfed
const _underDr = ACKS.tickJourneyDay(_under.c, _under.j, { rng: () => 0.5, weather: _WMod });
ok('an underfed crew → ½ voyage speed (72→36 = 6 hexes)', _underDr.record.dayRecord.milesTraveled === 36 && _underDr.record.dayRecord.hexesTraveled === 6 && _underDr.record.dayRecord.voyage.provision.level === 'underfed' && _underDr.record.dayRecord.voyage.provision.speedMult === 0.5);
const _starv = mkVoyage(0, 7);   // entering starving
const _starvDr = ACKS.tickJourneyDay(_starv.c, _starv.j, { rng: () => 0.5, weather: _WMod });
ok('a starving crew → ⅓ voyage speed (72→24 = 4 hexes)', _starvDr.record.dayRecord.milesTraveled === 24 && _starvDr.record.dayRecord.hexesTraveled === 4 && _starvDr.record.dayRecord.voyage.provision.level === 'starving');
// the underfed/starving transition notables
const _toUnder = mkVoyage(0, 1);   // entering hungry → new underfed
const _toUnderDr = ACKS.tickJourneyDay(_toUnder.c, _toUnder.j, { rng: () => 0.5, weather: _WMod });
ok('crossing into underfed fires a supplies-low heads-up', _toUnderDr.record.dayRecord.notableEvents.some(n => n.type === 'voyage-underfed') && _toUnderDr.record.dayRecord.voyage.provision.becameUnderfed === true);
const _toStarv = mkVoyage(0, 6);   // entering underfed → new starving
const _toStarvDr = ACKS.tickJourneyDay(_toStarv.c, _toStarv.j, { rng: () => 0.5, weather: _WMod });
ok('crossing into starving fires a morale-calamity heads-up', _toStarvDr.record.dayRecord.notableEvents.some(n => n.type === 'voyage-starvation') && _toStarvDr.record.dayRecord.voyage.provision.becameStarving === true);
// reroll reverts the provisioning ladder to the pre-day snapshot, then re-runs
const _rr = mkVoyage(3, 0);
ACKS.commitJourneyRecord(_rr.c, ACKS.tickJourneyDay(_rr.c, _rr.j, { rng: () => 0.5, weather: _WMod }).record);
_rr.v.shipStores = 99; _rr.v.daysAtSeaWithoutFreshFood = 88;   // corrupt the live state; the reroll must revert from _preDay (3 / 0), not these
ACKS.rerollJourneyDay(_rr.c, _rr.j, { rng: () => 0.5 });
ok('reroll reverts the provisioning ladder from _preDay (stores→3 then reconsumed to 2; counter→0 then 1)', _rr.v.shipStores === 2 && _rr.v.daysAtSeaWithoutFreshFood === 1);

// =============================================================================
section('V3c — scurvy onset in the tick + a fresh-food port cure');
// =============================================================================
const _sc = mkVoyage(50, 0, { scurvyDays: 29, scurvy: false });
const _scDr = ACKS.tickJourneyDay(_sc.c, _sc.j, { rng: () => 0.5, weather: _WMod });   // counter 29 → 30 → onset
ok('scurvy breaks out at one month at sea (counter → 30, scurvy flag set, a heads-up)', _scDr.record.voyageState.newScurvyDays === 30 && _scDr.record.voyageState.newScurvy === true && _scDr.record.dayRecord.notableEvents.some(n => n.type === 'voyage-scurvy'));
const _port = mkVoyage(0, 4, { scurvyDays: 35, scurvy: true, portAt: 1 });   // a port at the entered hex
const _portDr = ACKS.tickJourneyDay(_port.c, _port.j, { rng: () => 0.5, weather: _WMod });
ok('reaching a fresh-food port cures the scurvy + clears the deficit', _portDr.record.dayRecord.voyage.provision.freshFood === true && _portDr.record.voyageState.newProvisionDeficitDays === 0 && _portDr.record.voyageState.newScurvyDays === 0 && _portDr.record.voyageState.newScurvy === false && _portDr.record.dayRecord.notableEvents.some(n => n.type === 'voyage-scurvy-cured'));

// =============================================================================
section('V3c — opt-out: an unprovisioned vessel + ignore-rations carry no provisioning');
// =============================================================================
const _unp = mkVoyage(null, null);   // no shipStores set → untracked
const _unpDr = ACKS.tickJourneyDay(_unp.c, _unp.j, { rng: () => 0.5, weather: _WMod });
ok('an unprovisioned voyage carries no provisioning (no voyageState, full 72 mi)', _unpDr.record.voyageState === null && _unpDr.record.dayRecord.voyage.provision === null && _unpDr.record.dayRecord.milesTraveled === 72);
const _ig = mkVoyage(0, 0);   // provisioned (stores 0) but ignore-rations on
_ig.c.houseRules = { 'ignore-rations': { enabled: true } };
const _igDr = ACKS.tickJourneyDay(_ig.c, _ig.j, { rng: () => 0.5, weather: _WMod });
ok('ignore-rations opts a provisioned vessel out (no provisioning, full speed)', _igDr.record.voyageState === null && _igDr.record.dayRecord.voyage.provision === null && _igDr.record.dayRecord.milesTraveled === 72 && _ig.v.shipStores === 0);

// =============================================================================
section('V5 — river current (RR p.331): the speed table + the modifier');
// =============================================================================
ok('RIVER_CURRENT_SPEED is frozen with the 6 RR p.331 bands', Object.isFrozen(ACKS.RIVER_CURRENT_SPEED) && Object.keys(ACKS.RIVER_CURRENT_SPEED).length === 6);
ok('RIVER_CURRENT_SPEED values exact (6/12/18/24/36/48 mi/day = 1..8 hexes)', ACKS.RIVER_CURRENT_SPEED.placid === 6 && ACKS.RIVER_CURRENT_SPEED.gentle === 12 && ACKS.RIVER_CURRENT_SPEED.slow === 18 && ACKS.RIVER_CURRENT_SPEED.moderate === 24 && ACKS.RIVER_CURRENT_SPEED.swift === 36 && ACKS.RIVER_CURRENT_SPEED.rapid === 48);
ok('moderate downriver → +24 mi', (() => { const r = ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'moderate', heading: 'downriver' } }); return r.mi === 24 && r.heading === 'downriver' && r.speed === 'moderate'; })());
ok('moderate upriver → −24 mi', ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'moderate', heading: 'upriver' } }).mi === -24);
ok('rapid downriver → +48 mi (8 hexes)', ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'rapid', heading: 'downriver' } }).mi === 48);
ok('default heading (none given) → downriver (+)', ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'gentle' } }).mi === 12);
ok('unknown speed → mi 0', ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'torrential', heading: 'downriver' } }).mi === 0);
ok('no riverCurrent set → mi 0', ACKS.riverCurrentModifierMi({}).mi === 0 && ACKS.riverCurrentModifierMi(null).mi === 0);
ok('opts.riverCurrent overrides the journey', ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'placid' } }, { riverCurrent: { speed: 'swift', heading: 'upriver' } }).mi === -36);
ok('the label reads sign + speed + heading', ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'moderate', heading: 'downriver' } }).label === '+24 mi (moderate, downriver)' && ACKS.riverCurrentModifierMi({ riverCurrent: { speed: 'slow', heading: 'upriver' } }).label === '−18 mi (slow, upriver)');

// =============================================================================
section('V5 — river depth vs draft (RR p.331): the clearance check');
// =============================================================================
const _bigShip = ACKS.blankVessel({ catalogKey: 'sailing-ship-large' });   // draft 10
const _canoe = ACKS.blankVessel({ catalogKey: 'canoe' });                  // draft 0.5
ok('safe: depth ≥ draft+2 (20 over a 10 draft)', ACKS.riverDepthClearance(_bigShip, { riverDepth: 20 }).status === 'safe');
ok('safe at the exact boundary (depth = draft+2)', ACKS.riverDepthClearance(_bigShip, { riverDepth: 12 }).status === 'safe');
ok('shallow: within 2′ of draft (depth 11 over a 10 draft)', ACKS.riverDepthClearance(_bigShip, { riverDepth: 11 }).status === 'shallow');
ok('shallow at the lower boundary (depth = draft exactly)', ACKS.riverDepthClearance(_bigShip, { riverDepth: 10 }).status === 'shallow');
ok('impassable: depth < draft (9 under a 10 draft)', (() => { const c = ACKS.riverDepthClearance(_bigShip, { riverDepth: 9 }); return c.status === 'impassable' && c.depthFt === 9 && c.draftFt === 10; })());
ok('unknown: no riverDepth flag → treated as safe (opt-in by data)', ACKS.riverDepthClearance(_bigShip, { terrain: 'water' }).status === 'unknown' && ACKS.riverDepthClearance(_bigShip, null).status === 'unknown');
ok('a shallow-draft canoe (0.5) clears 1′ as shallow, 3′ as safe', ACKS.riverDepthClearance(_canoe, { riverDepth: 1 }).status === 'shallow' && ACKS.riverDepthClearance(_canoe, { riverDepth: 3 }).status === 'safe');

// =============================================================================
section('V5 — rollNauticalHazard: suppressShallowBonus (the river depth-vs-draft case)');
// =============================================================================
const _v5galley = ACKS.blankVessel({ catalogKey: 'galley-4-rower' });   // shallow draft → +4 at sea
ok('a galley sandbar with suppressShallowBonus → NO +4 (river depth case)', ACKS.rollNauticalHazard({}, _v5galley, 'sandbar', { suppressShallowBonus: true, rng: () => 0.5 }).bonus === 0);
ok('a galley sandbar WITHOUT the flag still gets +4 (the sea case is unchanged)', ACKS.rollNauticalHazard({}, _v5galley, 'sandbar', { rng: () => 0.5 }).bonus === 4);
ok('suppressShallowBonus on a reef is a no-op (a reef never gets the shallow bonus)', ACKS.rollNauticalHazard({}, _v5galley, 'reef', { suppressShallowBonus: true, rng: () => 0.5 }).bonus === 0);

// =============================================================================
section('V5 — integration: a river voyage with current + depth-vs-draft (tickJourneyDay)');
// =============================================================================
const _WRiv = { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' };
function mkRiverVoyage(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign({ name: 'v5-river' });
  c.characters = [ACKS.blankCharacter({ id: 'pilot', name: 'Pilot' })];
  c.hexes = [];
  for(let r = 0; r <= 60; r++){
    const hx = ACKS.blankHex({ id: 'rv' + r, coord: { q: 0, r: r }, terrain: 'water', seaZone: opts.seaZone || 'river' });
    if(opts.depthAt && opts.depthAt[r] != null) hx.riverDepth = opts.depthAt[r];
    c.hexes.push(hx);
  }
  const v = ACKS.createVessel(c, { name: 'Riverboat', catalogKey: opts.catalogKey || 'sailing-ship-large' });   // draft 10, 72 mi/day = 12 hexes
  const j = ACKS.blankJourney({ name: 'River Run', mode: 'voyage-sail', shipId: v.id, participantCharacterIds: ['pilot'], startHexId: 'rv0', destinationHexId: 'rv60', currentHexId: 'rv0' });
  if(opts.riverCurrent) j.riverCurrent = opts.riverCurrent;
  if(opts.overrideMiles != null) j.speedOverrideMilesPerDay = opts.overrideMiles;
  c.journeys = [j]; ACKS.startJourney(c, j);
  return { c, v, j };
}
// downriver moderate: 72 + 24 = 96 mi = 16 hexes
const _dn = mkRiverVoyage({ riverCurrent: { speed: 'moderate', heading: 'downriver' } });
const _dnDr = ACKS.tickJourneyDay(_dn.c, _dn.j, { rng: () => 0.5, weather: _WRiv });
ok('downriver moderate current adds +24 mi (72→96 = 16 hexes)', _dnDr.record.dayRecord.milesTraveled === 96 && _dnDr.record.dayRecord.hexesTraveled === 16);
ok('the day record carries the river current (mi +24, downriver)', _dnDr.record.dayRecord.voyage.riverCurrent && _dnDr.record.dayRecord.voyage.riverCurrent.mi === 24 && _dnDr.record.dayRecord.voyage.riverCurrent.heading === 'downriver' && _dnDr.record.dayRecord.voyage.seaZone === 'river');
// upriver moderate: 72 − 24 = 48 mi = 8 hexes
const _up = mkRiverVoyage({ riverCurrent: { speed: 'moderate', heading: 'upriver' } });
const _upDr = ACKS.tickJourneyDay(_up.c, _up.j, { rng: () => 0.5, weather: _WRiv });
ok('upriver moderate current subtracts 24 mi (72→48 = 8 hexes)', _upDr.record.dayRecord.milesTraveled === 48 && _upDr.record.dayRecord.hexesTraveled === 8 && _upDr.record.dayRecord.voyage.riverCurrent.mi === -24);
// rapid downriver: 72 + 48 = 120 = 20 hexes
const _rap = mkRiverVoyage({ riverCurrent: { speed: 'rapid', heading: 'downriver' } });
const _rapDr = ACKS.tickJourneyDay(_rap.c, _rap.j, { rng: () => 0.5, weather: _WRiv });
ok('rapid downriver (+48) → 120 mi = 20 hexes', _rapDr.record.dayRecord.milesTraveled === 120 && _rapDr.record.dayRecord.hexesTraveled === 20);
// clamp: a becalmed sailing ship (Still wind → 0 sail mi) fighting an upriver current → max(0, 0−24) = 0
const _clamp = mkRiverVoyage({ riverCurrent: { speed: 'moderate', heading: 'upriver' } });
const _clampDr = ACKS.tickJourneyDay(_clamp.c, _clamp.j, { rng: () => 0.5, weather: { wind: 'Still', windDirection: 0, condition: 'fair', temperature: 'moderate' } });
ok('an upriver current clamps the budget at 0 (becalmed → the engine 1-hex creep, not 12)', _clampDr.record.dayRecord.hexesTraveled === 1 && _clampDr.record.dayRecord.voyage.riverCurrent.mi === -24);
// no current on a river → byte-unchanged (72 mi, riverCurrent null)
const _noc = mkRiverVoyage({});
const _nocDr = ACKS.tickJourneyDay(_noc.c, _noc.j, { rng: () => 0.5, weather: _WRiv });
ok('a river voyage with no current set is byte-unchanged (72 mi, riverCurrent null)', _nocDr.record.dayRecord.milesTraveled === 72 && _nocDr.record.dayRecord.voyage.riverCurrent === null);
// §26 override is NOT current-boosted (the override is an exact GM rate)
const _ovr = mkRiverVoyage({ riverCurrent: { speed: 'moderate', heading: 'downriver' }, overrideMiles: 50 });
const _ovrDr = ACKS.tickJourneyDay(_ovr.c, _ovr.j, { rng: () => 0.5, weather: _WRiv });
ok('a §26 override ignores the river current (8 hexes from 50 mi, not 12 from 74)', _ovrDr.record.dayRecord.hexesTraveled === 8 && _ovrDr.record.dayRecord.voyage.riverCurrent === null);

// depth: an IMPASSABLE hex on the route grounds the vessel (no throw)
const _imp = mkRiverVoyage({ depthAt: { 5: 9 } });   // 9′ < the 10′ draft at rv5 (12-hex day covers it)
const _impDr = ACKS.tickJourneyDay(_imp.c, _imp.j, { rng: () => 0.5, weather: _WRiv });
ok('an impassable river hex grounds the vessel "too-shallow" (record.voyageState)', !!_impDr.record.voyageState && _impDr.record.voyageState.newGrounded === 'too-shallow' && _impDr.record.dayRecord.voyage.grounded === 'too-shallow');
ok('the impassable hex logs a river-too-shallow pause', _impDr.record.dayRecord.notableEvents.some(n => n.type === 'river-too-shallow'));
ok('the tick is PURE — the vessel is not grounded until commit', _imp.v.grounded == null);
ACKS.commitJourneyRecord(_imp.c, _impDr.record);
ok('commit grounds the vessel; the next day it makes no way (stuck)', _imp.v.grounded === 'too-shallow' && (() => { const s = ACKS.tickJourneyDay(_imp.c, _imp.j, { rng: () => 0.5, weather: _WRiv }); return s.record.dayRecord.hexesTraveled === 0 && /shallows/.test(s.record.label); })());
// depth: a SHALLOW hex (within 2′) → a sandbar throw; nat-1 fails → SHP + grounded
const _sh = mkRiverVoyage({ depthAt: { 5: 11 } });   // 11′ over a 10′ draft = within 2′ → shallow
const _shDr = ACKS.tickJourneyDay(_sh.c, _sh.j, { rng: () => 0, weather: _WRiv });   // rng 0 → nat 1 → the sandbar throw fails → 4d10@0 = 4 SHP
ok('a failed shallow throw holes the hull (4 SHP) + grounds "too-shallow"', !!_shDr.record.voyageState && _shDr.record.voyageState.shpDamage === 4 && _shDr.record.voyageState.newGrounded === 'too-shallow' && _shDr.record.dayRecord.notableEvents.some(n => n.type === 'river-shallows'));
// depth: a SHALLOW hex passed cleanly (nat 20) → no grounding, no SHP
const _shOk = mkRiverVoyage({ depthAt: { 5: 11 } });
const _shOkDr = ACKS.tickJourneyDay(_shOk.c, _shOk.j, { rng: () => 0.99, weather: _WRiv });   // nat 20 → sandbar throw passes
ok('a shallow hex picked through cleanly (nat 20) → no grounding, no voyageState', _shOkDr.record.voyageState === null && !_shOkDr.record.dayRecord.notableEvents.some(n => n.type === 'river-shallows'));
// depth: a SAFE hex → no depth event
const _safe = mkRiverVoyage({ depthAt: { 5: 20 } });
const _safeDr = ACKS.tickJourneyDay(_safe.c, _safe.j, { rng: () => 0.5, weather: _WRiv });
ok('a safe-depth river hex fires no depth event', !_safeDr.record.dayRecord.notableEvents.some(n => n.type === 'river-shallows' || n.type === 'river-too-shallow') && _safe.v.shp === 200);
// the depth check is gated on the river zone — a COAST hex with a stray riverDepth flag is ignored
const _coast = mkRiverVoyage({ seaZone: 'coast', depthAt: { 5: 9 } });
const _coastDr = ACKS.tickJourneyDay(_coast.c, _coast.j, { rng: () => 0.5, weather: _WRiv });
ok('the depth check is river-gated (a coast hex ignores riverDepth)', !_coastDr.record.dayRecord.notableEvents.some(n => n.type === 'river-too-shallow') && _coast.v.grounded == null);
// reroll reverts a depth grounding (the V3b replay path)
const _rr5 = mkRiverVoyage({ depthAt: { 5: 11 } });
ACKS.commitJourneyRecord(_rr5.c, ACKS.tickJourneyDay(_rr5.c, _rr5.j, { rng: () => 0, weather: _WRiv }).record);   // fail → grounded + SHP down
ok('commit applied the shallow grounding + hull loss', _rr5.v.grounded === 'too-shallow' && _rr5.v.shp === 196);
ACKS.rerollJourneyDay(_rr5.c, _rr5.j, { rng: () => 0.99 });   // reverts the grounding from _preDay (refloats), then re-ticks: nat 20 → the shallow passes → restored
ok('reroll reverts the depth grounding + hull damage (refloated + restored on a clean re-roll)', _rr5.v.shp === 200 && _rr5.v.grounded == null);

// =============================================================================
section('SEAMS — deferred cross-subsystem hooks (vessel-construction / marines / port-repair)');
// =============================================================================
(function(){   // IIFE — isolate the seam temp vars from the flat file scope

// ── SEAM 2 — marines-as-Group binding ──
ok('blankVessel has a marineGroupIds array (default [])', Array.isArray(ACKS.blankVessel({}).marineGroupIds) && ACKS.blankVessel({}).marineGroupIds.length === 0);
const _sc = ACKS.blankCampaign({ name: 'Seams' }); _sc.currentTurn = 3; _sc.currentDayInMonth = 5;
const _sv = ACKS.createVessel(_sc, { name: 'Liburna', catalogKey: 'galley-2-rower', currentHexId: 'hex-port' });
const _mg = ACKS.embarkMarines(_sc, _sv, { count: 30, commanderCharacterId: 'chr-cap' });
ok('embarkMarines creates a foot-troop Group', _mg && _mg.count === 30 && _mg.socialTier === 'mercenary' && _mg.groupTemplate.creatureTypes[0] === 'humanoid');
ok('embarkMarines places the Group at the vessel hex', _mg.currentHexId === 'hex-port');
ok('embarkMarines pushes it to campaign.groups', _sc.groups.indexOf(_mg) >= 0);
ok('embarkMarines binds it via marineGroupIds', _sv.marineGroupIds.indexOf(_mg.id) >= 0);
ok('embarkMarines bumps crewComplement.marines', _sv.crewComplement.marines === 30);
ok('vesselMarineGroups resolves the bound Group', ACKS.vesselMarineGroups(_sc, _sv).length === 1 && ACKS.vesselMarineGroups(_sc, _sv)[0] === _mg);
ok('vesselMarineCount = active strength (30)', ACKS.vesselMarineCount(_sc, _sv) === 30);
_mg.casualties = 12;
ok('vesselMarineCount nets casualties (30−12=18)', ACKS.vesselMarineCount(_sc, _sv) === 18);
ok('bindMarineGroup is idempotent', ACKS.bindMarineGroup(_sc, _sv, _mg.id) === false && _sv.marineGroupIds.length === 1);
ok('unbindMarineGroup disembarks (Group survives in campaign.groups)', ACKS.unbindMarineGroup(_sc, _sv, _mg.id) === true && _sv.marineGroupIds.length === 0 && _sc.groups.indexOf(_mg) >= 0);

// ── SEAM 1 — Vessel-as-Construction-Project (onVesselConstructed) ──
const _cc = ACKS.blankCampaign({ name: 'VesselBuild' }); _cc.currentTurn = 4; _cc.currentDayInMonth = 2;
_cc.characters = [{ id: 'chr-cap', name: 'Captain Mara' }];
const _p = ACKS.blankProject({ constructibleKind: 'vessel', constructibleSubtype: 'galley-2-rower', name: 'Sea Serpent', ownerCharacterId: 'chr-cap', siteHexId: 'hex-yard' });
_cc.projects.push(_p); _p.lifecycleState = 'complete';
const _ov = ACKS.onVesselConstructed(_cc, _p);
ok('onVesselConstructed mints a Vessel from a completed kind:vessel Project', _ov && _ov.name === 'Sea Serpent' && _ov.catalogKey === 'galley-2-rower');
ok('the minted Vessel takes the class base SHP (galley-2-rower=25)', _ov.shp === 25);
ok('the minted Vessel takes the owner + hex from the Project', _ov.ownerId === 'chr-cap' && _ov.currentHexId === 'hex-yard');
ok('proj.vesselId links the Project to the Vessel', _p.vesselId === _ov.id);
ok('onVesselConstructed is idempotent (returns the same Vessel)', ACKS.onVesselConstructed(_cc, _p) === _ov && _cc.vessels.length === 1);
ok('onVesselConstructed refuses a non-vessel Project (→ null)', ACKS.onVesselConstructed(_cc, ACKS.blankProject({ constructibleKind: 'stronghold-component', lifecycleState: 'complete' })) === null);
const _pNoCat = ACKS.blankProject({ constructibleKind: 'vessel', constructibleSubtype: 'not-a-class', name: 'Mystery Hull', siteHexId: 'hex-yard' });
_cc.projects.push(_pNoCat); _pNoCat.lifecycleState = 'complete';
const _ovNoCat = ACKS.onVesselConstructed(_cc, _pNoCat);
ok('an unknown subtype mints a vessel with catalogKey "" (GM picks the class later)', _ovNoCat && _ovNoCat.catalogKey === '' && _ovNoCat.name === 'Mystery Hull');

// ── SEAM 3 — port-repair sites ──
const _pc = ACKS.blankCampaign({ name: 'PortRepair' });
_pc.settlements = [{ id: 'set-1', name: 'Harborton', hexId: 'hex-harbor' }];
const _dv = ACKS.createVessel(_pc, { name: 'Battered', catalogKey: 'sailing-ship-large', currentHexId: 'hex-harbor', shp: 150 }); // base 200, 20 sailors
ok('vesselPortRepairSite finds a port at a settlement hex', (function(){ const s = ACKS.vesselPortRepairSite(_pc, _dv); return s && s.settlementName === 'Harborton' && s.friendly === true; })());
ok('vesselPortRepairPerDay = floor((sailors+rowers)/5) (20/5=4)', ACKS.vesselPortRepairPerDay(_pc, _dv) === 4);
const _av = ACKS.createVessel(_pc, { name: 'Adrift', catalogKey: 'boat-sail', currentHexId: 'hex-openwater', shp: 1 });
ok('vesselPortRepairSite → null when not at a settlement hex', ACKS.vesselPortRepairSite(_pc, _av) === null);
// untracked crew (complement all-zero) uses the catalog full crew; a shipwright officer doubles
const _uv = ACKS.createVessel(_pc, { name: 'Untracked', catalogKey: 'sailing-ship-large', currentHexId: 'hex-harbor', shp: 100 });
ok('untracked crew uses the catalog full crew (20 sailors → 4/day)', ACKS.vesselPortRepairPerDay(_pc, _uv) === 4);
_pc.characters = [{ id: 'chr-wright', name: 'Master Shipwright', proficiencies: [{ key: 'shipwright', ranks: 2 }] }];
_uv.officerCharacterIds = ['chr-wright'];
ok('a shipwright officer aboard doubles the repair rate (4→8)', ACKS.vesselPortRepairPerDay(_pc, _uv) === 8);

// ── The 'voyages' day-tick consumer — auto-fires launch + repair ──
ok("a 'voyages' day-tick consumer is registered (order 53)", (function(){ const c = ACKS.dayConsumersInOrder().find(x => x.name === 'voyages'); return c && c.order === 53 && typeof c.commit === 'function'; })());
ok('vessel-launched + vessel-repaired event kinds self-registered', ACKS.registeredEventKinds().includes('vessel-launched') && ACKS.registeredEventKinds().includes('vessel-repaired'));
ok('both voyage event kinds are wizard-opt-out (record-only audits)', ACKS.EVENT_WIZARD_OPTOUT.has('vessel-launched') && ACKS.EVENT_WIZARD_OPTOUT.has('vessel-repaired'));

const _dc = ACKS.blankCampaign({ name: 'AutoFire' }); _dc.currentTurn = 1; _dc.currentDayInMonth = 1;
_dc.characters = [{ id: 'chr-1', name: 'Owner' }];
_dc.settlements = [{ id: 'set-1', name: 'Harborton', hexId: 'hex-harbor' }];
const _dp = ACKS.blankProject({ constructibleKind: 'vessel', constructibleSubtype: 'longship', name: 'Wave Reaver', siteHexId: 'hex-port', ownerCharacterId: 'chr-1' });
_dc.projects.push(_dp); _dp.lifecycleState = 'complete';
const _ddmg = ACKS.createVessel(_dc, { name: 'Battered', catalogKey: 'sailing-ship-large', currentHexId: 'hex-harbor', shp: 150 }); // repair 4/day
const _ev0 = (_dc.eventLog || []).length;
const _prop = ACKS.proposeDayTick(_dc, 1, { force: true });
ok('propose emits a voyages vessel-launch record', _prop.pendingRecords.some(r => r.kind === 'vessel-launch' && r.consumer === 'voyages' && r.vesselProjectId === _dp.id));
ok('propose emits a voyages vessel-repair record', _prop.pendingRecords.some(r => r.kind === 'vessel-repair' && r.consumer === 'voyages' && r.vesselId === _ddmg.id));
ok('propose did NOT mutate the real campaign (no vessel minted yet)', !_dc.vessels.some(v => v.name === 'Wave Reaver') && _ddmg.shp === 150);
ACKS.commitDayTick(_dc, _prop, null);
ok('commit mints the launched Vessel', _dc.vessels.some(v => v.name === 'Wave Reaver') && !!_dp.vesselId);
ok('commit repairs the docked Vessel (150→154)', _ddmg.shp === 154);
const _newEvs = (_dc.eventLog || []).slice(_ev0).map(e => e.event.kind);
ok('commit emits a vessel-launched audit event', _newEvs.includes('vessel-launched'));
ok('commit emits a vessel-repaired audit event', _newEvs.includes('vessel-repaired'));
const _launchEv = _dc.eventLog.find(e => e.event.kind === 'vessel-launched');
ok('the launch event carries the §3.5 context (vessel + the real owner)', _launchEv && _launchEv.event.context && _launchEv.event.context.relatedEntities.length === 2 && _launchEv.event.context.relatedEntities.some(r => r.kind === 'character' && r.id === 'chr-1'));
const _repEv = _dc.eventLog.find(e => e.event.kind === 'vessel-repaired');
ok('an in-progress repair stays out of the Campaign Log (campaignLogHidden)', !!_repEv.campaignLogHidden);
// idempotency + multi-day mend
const _vCount = _dc.vessels.length;
ACKS.commitDayTick(_dc, ACKS.proposeDayTick(_dc, 1, { force: true }), null);
ok('a 2nd tick does NOT re-launch (idempotent)', _dc.vessels.length === _vCount);
ok('a 2nd tick keeps repairing (154→158)', _ddmg.shp === 158);
ACKS.runDayTickToMonthEnd(_dc);
ok('multi-day repair caps at the class base SHP (sailing-ship-large=200)', _ddmg.shp === 200);
ok('a fully-mended vessel flips condition → seaworthy', _ddmg.condition === 'seaworthy');
ok('the full-mend repair event surfaces (not campaignLogHidden)', _dc.eventLog.some(e => e.event.kind === 'vessel-repaired' && !e.campaignLogHidden));

// defensive: a project-less / vessel-less campaign yields no voyages records (no crash)
const _empty = ACKS.blankCampaign({ name: 'Empty' });
const _ep = ACKS.proposeDayTick(_empty, 1, { force: true });
ok('an empty campaign yields no voyages records (defensive)', !_ep.pendingRecords.some(r => r.consumer === 'voyages'));
// a grounded vessel at a port does NOT dock-repair (must refloat first)
const _gc = ACKS.blankCampaign({ name: 'Grounded' });
_gc.settlements = [{ id: 'set-1', name: 'Port', hexId: 'hex-h' }];
const _gv = ACKS.createVessel(_gc, { name: 'Stuck', catalogKey: 'sailing-ship-large', currentHexId: 'hex-h', shp: 100 });
_gv.grounded = 'sandbar';
ok('a grounded vessel at a port is NOT dock-repaired', !ACKS.proposeDayTick(_gc, 1, { force: true }).pendingRecords.some(r => r.kind === 'vessel-repair'));

})();   // end SEAMS IIFE

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Voyages V1 + V2 + V3a + V3b + V3c + V5 + SEAMS smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
