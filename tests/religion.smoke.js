// =============================================================================
// religion.smoke.js — Religion R0 (data layer). Wave E (Phase_4_Religion_Plan.md §4/§5.1/§5.2).
// Covers: the dei-/con-/dfv- prefixes; the blankDeity/blankCongregation/blankDivineFavor
// factories (RAW-faithful — `standing`, NO favorLevel); the character.divinePower expiring
// ledger + divinePowerAvailable / spendDivinePower; isDivineCaster + the lookups; the
// entity-registry kinds + the schema⊆factory + displayName invariants for the three kinds;
// the importer collection wiring; and the load-bearing R0 guard — every shipped template +
// the demo STAY migrate-no-ops (R0 added divinePower to blankCharacter only, NOT to migrate).
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
const sortKeys = o => JSON.stringify(o, Object.keys(o).sort());

// =============================================================================
section('ID prefixes (dei- / con- / dfv-)');
// =============================================================================
ok('ID_PREFIXES.deity === "dei"', ACKS.ID_PREFIXES.deity === 'dei');
ok('ID_PREFIXES.congregation === "con"', ACKS.ID_PREFIXES.congregation === 'con');
ok('ID_PREFIXES.divineFavor === "dfv"', ACKS.ID_PREFIXES.divineFavor === 'dfv');

// =============================================================================
section('Factories — blankDeity / blankCongregation / blankDivineFavor');
// =============================================================================
ok('blankDeity is a function', typeof ACKS.blankDeity === 'function');
ok('blankCongregation is a function', typeof ACKS.blankCongregation === 'function');
ok('blankDivineFavor is a function', typeof ACKS.blankDivineFavor === 'function');

const dei = ACKS.blankDeity({ name: 'the Lawgiver', alignment: 'Lawful' });
ok('blankDeity id has dei- prefix', /^dei-/.test(dei.id));
ok('blankDeity schemaVersion 2', dei.schemaVersion === 2);
ok('blankDeity keeps opts', dei.name === 'the Lawgiver' && dei.alignment === 'Lawful');
ok('blankDeity default alignment Neutral', ACKS.blankDeity().alignment === 'Neutral');
ok('blankDeity acceptsBloodSacrifice default none', ACKS.blankDeity().acceptsBloodSacrifice === 'none');
ok('blankDeity sacrificeAsDevotion default false', ACKS.blankDeity().sacrificeAsDevotion === false);
ok('blankDeity status default active', ACKS.blankDeity().status === 'active');
ok('blankDeity has history[]', Array.isArray(dei.history));
ok('blankDeity stores NO entity-kind field (registry carries it — blankLair precedent)', !('kind' in ACKS.blankDeity()));

const con = ACKS.blankCongregation({ name: 'Dawn Faithful', deityId: dei.id, highPriestCharacterId: 'chr-p' });
ok('blankCongregation id has con- prefix', /^con-/.test(con.id));
ok('blankCongregation keeps opts', con.name === 'Dawn Faithful' && con.deityId === dei.id && con.highPriestCharacterId === 'chr-p');
ok('blankCongregation personalCongregants default 0', ACKS.blankCongregation().personalCongregants === 0);
ok('blankCongregation maintainedWeeksThisMonth default 0', ACKS.blankCongregation().maintainedWeeksThisMonth === 0);
ok('blankCongregation templeRef default null', ACKS.blankCongregation().templeRef === null);
ok('blankCongregation domainWorshipDomainId default null', ACKS.blankCongregation().domainWorshipDomainId === null);
ok('blankCongregation status default active', ACKS.blankCongregation().status === 'active');

const dfv = ACKS.blankDivineFavor({ characterId: 'chr-p', deityId: dei.id });
ok('blankDivineFavor id has dfv- prefix', /^dfv-/.test(dfv.id));
ok('blankDivineFavor keeps opts', dfv.characterId === 'chr-p' && dfv.deityId === dei.id);
ok('blankDivineFavor standing default good-standing', dfv.standing === 'good-standing');
ok('blankDivineFavor RAW-faithful — NO numeric favorLevel (D1)', !('favorLevel' in dfv));
ok('blankDivineFavor has standing (categorical, not numeric)', typeof dfv.standing === 'string');
ok('blankDivineFavor codeOfBehaviorAck default false', dfv.codeOfBehaviorAck === false);
ok('blankDivineFavor transgressionsLog default []', Array.isArray(dfv.transgressionsLog) && dfv.transgressionsLog.length === 0);
ok('blankDivineFavor lastSacrificeAtTurn default null', dfv.lastSacrificeAtTurn === null);
ok('blankDivineFavor status default active', dfv.status === 'active');

// =============================================================================
section('blankCampaign carries the three Wave-E collections (already reserved)');
// =============================================================================
const camp0 = ACKS.blankCampaign({ name: 'Religion R0' });
ok('blankCampaign.deities is []', Array.isArray(camp0.deities) && camp0.deities.length === 0);
ok('blankCampaign.congregations is []', Array.isArray(camp0.congregations));
ok('blankCampaign.divineFavors is []', Array.isArray(camp0.divineFavors));

// =============================================================================
section('Entity Registry — deity / congregation / divineFavor kinds');
// =============================================================================
ok('registry has deity kind', !!ACKS.entityKind('deity'));
ok('registry has congregation kind', !!ACKS.entityKind('congregation'));
ok('registry has divineFavor kind', !!ACKS.entityKind('divineFavor'));
ok('deity icon 🛐', ACKS.entityIcon('deity') === '🛐');
ok('congregation icon ⛪', ACKS.entityIcon('congregation') === '⛪');
ok('divineFavor icon 📿', ACKS.entityIcon('divineFavor') === '📿');
ok('deity label "Deity"', ACKS.entityLabel('deity') === 'Deity');
ok('deity pluralLabel "Deities"', ACKS.entityPluralLabel('deity') === 'Deities');

// list / find against a campaign holding one of each
const camp = ACKS.blankCampaign({ name: 'Reg' });
camp.deities.push(dei); camp.congregations.push(con); camp.divineFavors.push(dfv);
ok('listEntities deity', ACKS.listEntities(camp, 'deity').length === 1);
ok('listEntities congregation', ACKS.listEntities(camp, 'congregation').length === 1);
ok('listEntities divineFavor', ACKS.listEntities(camp, 'divineFavor').length === 1);
ok('findEntity deity by id', ACKS.findEntity(camp, 'deity', dei.id) === dei);
ok('findEntity congregation by id', ACKS.findEntity(camp, 'congregation', con.id) === con);
ok('findEntity divineFavor by id', ACKS.findEntity(camp, 'divineFavor', dfv.id) === dfv);
ok('deity displayName uses name', ACKS.entityDisplayName(camp, 'deity', dei.id) === 'the Lawgiver');
ok('congregation displayName uses name', ACKS.entityDisplayName(camp, 'congregation', con.id) === 'Dawn Faithful');
ok('divineFavor displayName composes characterId ⛪ deityId (no name field)',
  ACKS.entityDisplayName(camp, 'divineFavor', dfv.id) === ('chr-p ⛪ ' + dei.id));

// =============================================================================
section('Registry displayName reads ONLY factory fields (the smoke.js invariant, focused)');
// =============================================================================
(function(){
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  for(const kind of ['deity','congregation','divineFavor']){
    const e = ACKS.entityKind(kind);
    const blank = ACKS['blank' + cap(kind)]({});
    const factoryKeys = new Set(Object.keys(blank));
    const accessed = new Set();
    const proxy = new Proxy(blank, { get(t,k){ if(typeof k === 'string') accessed.add(k); return t[k]; } });
    try { e.displayName({}, proxy); } catch(_){}
    const extras = [...accessed].filter(k => !factoryKeys.has(k));
    ok('registry ' + kind + ' displayName reads only factory fields', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
  }
})();

// =============================================================================
section('Field schemas — exist, validate, and are ⊆ their factories');
// =============================================================================
(function(){
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  for(const kind of ['deity','congregation','divineFavor']){
    const schema = ACKS.fieldSchemaFor(kind);
    ok('fieldSchemaFor("' + kind + '") exists', !!schema);
    if(!schema) continue;
    const v = ACKS.validateFieldSchema(kind, schema);
    ok('schema "' + kind + '" validates clean', v.ok, (v.errors || []).join('; '));
    ok('schema "' + kind + '" names its factory', schema.factory === 'blank' + cap(kind));
    ok('schema "' + kind + '" is adminCreate schemaForm', schema.adminCreate === 'schemaForm');
    const keys = new Set(Object.keys(ACKS['blank' + cap(kind)]({})));
    const extras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
    ok('schema "' + kind + '" fields ⊆ blank' + cap(kind) + ' keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
  }
  // No divineFavor schema field smuggles in a numeric favorLevel (D1).
  ok('divineFavor schema has no favorLevel field', !ACKS.fieldSchemaFor('divineFavor').fields.some(f => f.name === 'favorLevel'));
})();

// =============================================================================
section('isDivineCaster — class / class-power / explicit flag');
// =============================================================================
ok('Crusader is a divine caster', ACKS.isDivineCaster({ class: 'Crusader' }) === true);
ok('Bladedancer is a divine caster', ACKS.isDivineCaster({ class: 'Bladedancer' }) === true);
ok('Craftpriest is a divine caster', ACKS.isDivineCaster({ class: 'Craftpriest' }) === true);
ok('Fighter is NOT a divine caster', ACKS.isDivineCaster({ class: 'Fighter' }) === false);
ok('classPower "Collect/Use Divine Power" (string) → divine caster', ACKS.isDivineCaster({ class: 'Custom', classPowers: ['Collect/Use Divine Power'] }) === true);
ok('classPower {name:"Divine Power"} → divine caster', ACKS.isDivineCaster({ class: 'Custom', classPowers: [{ name: 'Divine Power' }] }) === true);
ok('explicit isDivineCaster flag wins over class', ACKS.isDivineCaster({ class: 'Fighter', isDivineCaster: true }) === true);
ok('null character → false', ACKS.isDivineCaster(null) === false);
ok('plain NPC (no class) → false', ACKS.isDivineCaster({ class: '' }) === false);

// =============================================================================
section('Lookups — congregationsOf / divineFavorOf / deityOf / findDeity');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Lookups' });
  const god = ACKS.blankDeity({ id: 'dei-x', name: 'the Devourer', alignment: 'Chaotic' });
  const priest = ACKS.blankCharacter({ id: 'chr-priest', name: 'Mentu', class: 'Crusader' });
  const layman = ACKS.blankCharacter({ id: 'chr-lay', name: 'Balbus' });
  const cong = ACKS.blankCongregation({ id: 'con-x', highPriestCharacterId: 'chr-priest', deityId: 'dei-x' });
  const favor = ACKS.blankDivineFavor({ id: 'dfv-x', characterId: 'chr-priest', deityId: 'dei-x' });
  c.deities.push(god); c.characters.push(priest, layman); c.congregations.push(cong); c.divineFavors.push(favor);

  ok('findDeity by id', ACKS.findDeity(c, 'dei-x') === god);
  ok('findDeity missing → null', ACKS.findDeity(c, 'dei-none') === null);
  ok('congregationsOf priest → [con-x]', ACKS.congregationsOf(c, 'chr-priest').length === 1 && ACKS.congregationsOf(c, 'chr-priest')[0] === cong);
  ok('congregationsOf layman → []', ACKS.congregationsOf(c, 'chr-lay').length === 0);
  ok('divineFavorOf priest → dfv-x', ACKS.divineFavorOf(c, 'chr-priest') === favor);
  ok('divineFavorOf layman → null', ACKS.divineFavorOf(c, 'chr-lay') === null);
  ok('deityOf priest → the Devourer', ACKS.deityOf(c, 'chr-priest') === god);
  ok('deityOf layman → null', ACKS.deityOf(c, 'chr-lay') === null);
  // a revoked/inactive favor is not the "active" patron
  favor.status = 'ended';
  ok('divineFavorOf ignores non-active favor', ACKS.divineFavorOf(c, 'chr-priest') === null);
})();

// =============================================================================
section('character.divinePower ledger + divinePowerAvailable');
// =============================================================================
ok('blankCharacter().divinePower shape', sortKeys(ACKS.blankCharacter().divinePower) === sortKeys({ entries: [], reliquaryStoreGp: 0 }));
ok('blankCharacter() divinePower entries is []', ACKS.blankCharacter().divinePower.entries.length === 0);
ok('blankCharacter() reliquaryStoreGp is 0', ACKS.blankCharacter().divinePower.reliquaryStoreGp === 0);

(function(){
  const c = ACKS.blankCampaign({ name: 'DP' });
  c.currentTurn = 5;
  const caster = ACKS.blankCharacter({ id: 'chr-c', name: 'High Priest', class: 'Craftpriest' });
  caster.divinePower = {
    entries: [
      { amountGp: 100, accruedAtTurn: 5, expiresAtTurn: 6, source: 'congregation' }, // live (6 > 5)
      { amountGp: 50,  accruedAtTurn: 3, expiresAtTurn: 4, source: 'congregation' }, // expired (4 <= 5)
      { amountGp: 40,  accruedAtTurn: 5 }                                            // expiry derived → 6 (live)
    ],
    reliquaryStoreGp: 30
  };
  c.characters.push(caster);

  ok('available = live entries (100+40) + reliquary 30 = 170, expired 50 excluded', ACKS.divinePowerAvailable(c, 'chr-c') === 170);

  // expiry rolls forward with the turn
  c.currentTurn = 6;
  ok('at turn 6, the turn-5 accruals have faded → only reliquary 30 remains', ACKS.divinePowerAvailable(c, 'chr-c') === 30);
  c.currentTurn = 5;

  // defensive: a character with no divinePower field, and a missing character
  const bare = ACKS.blankCharacter({ id: 'chr-bare' }); delete bare.divinePower; c.characters.push(bare);
  ok('available on a character with no divinePower field → 0 (no throw)', ACKS.divinePowerAvailable(c, 'chr-bare') === 0);
  ok('available on a missing character → 0', ACKS.divinePowerAvailable(c, 'chr-nope') === 0);
})();

// =============================================================================
section('spendDivinePower — atomic, soonest-to-fade first, reliquary last');
// =============================================================================
(function(){
  function mk(){
    const c = ACKS.blankCampaign({ name: 'Spend' }); c.currentTurn = 5;
    const ch = ACKS.blankCharacter({ id: 'chr-s' });
    ch.divinePower = { entries: [
      { amountGp: 40, accruedAtTurn: 5, expiresAtTurn: 6 },  // fades sooner
      { amountGp: 40, accruedAtTurn: 5, expiresAtTurn: 7 }   // fades later
    ], reliquaryStoreGp: 60 };
    c.characters.push(ch); return { c, ch };
  }
  // insufficient → atomic no-op
  let { c, ch } = mk();
  let r = ACKS.spendDivinePower(c, 'chr-s', 1000);
  ok('insufficient → ok:false, spent 0', r.ok === false && r.spent === 0);
  ok('insufficient → nothing debited (available still 140)', ACKS.divinePowerAvailable(c, 'chr-s') === 140);

  // spend within ledger, soonest-to-fade entry drained first, reliquary untouched
  ({ c, ch } = mk());
  r = ACKS.spendDivinePower(c, 'chr-s', 50);
  ok('spend 50 → ok:true, spent 50', r.ok === true && r.spent === 50);
  ok('sooner entry drained to 0 first', ch.divinePower.entries[0].amountGp === 0);
  ok('later entry takes the remaining 10 (40→30)', ch.divinePower.entries[1].amountGp === 30);
  ok('reliquary untouched at 60', ch.divinePower.reliquaryStoreGp === 60);
  ok('remaining reported = 90', r.remaining === 90 && ACKS.divinePowerAvailable(c, 'chr-s') === 90);

  // spending past the ledger dips into the reliquary last
  ({ c, ch } = mk());
  r = ACKS.spendDivinePower(c, 'chr-s', 100);  // 80 from entries + 20 from reliquary
  ok('spend 100 → entries to 0', ch.divinePower.entries.every(e => e.amountGp === 0));
  ok('spend 100 → reliquary 60→40', ch.divinePower.reliquaryStoreGp === 40);
  ok('spend 100 → remaining 40', r.remaining === 40);

  // expired entries are not spendable (and not debited)
  ({ c, ch } = mk());
  ch.divinePower.entries.push({ amountGp: 999, accruedAtTurn: 1, expiresAtTurn: 2 }); // long expired
  r = ACKS.spendDivinePower(c, 'chr-s', 140);  // exactly the live 80 + reliquary 60
  ok('expired entry ignored — exactly the live 140 spends', r.ok === true && r.spent === 140);
  ok('expired entry left untouched (still 999)', ch.divinePower.entries[2].amountGp === 999);

  // init-on-write + guards
  const c2 = ACKS.blankCampaign(); const bare = ACKS.blankCharacter({ id: 'chr-z' }); delete bare.divinePower; c2.characters.push(bare);
  ok('spend on a no-DP character → ok:false (insufficient), no throw', ACKS.spendDivinePower(c2, 'chr-z', 10).ok === false);
  ok('spend 0 → ok:false (nothing to do)', ACKS.spendDivinePower(c2, 'chr-z', 0).ok === false);
  ok('spend on missing character → ok:false', ACKS.spendDivinePower(c2, 'chr-none', 10).ok === false);
})();

// =============================================================================
section('R0 GUARD — templates + demo STAY migrate-no-ops (no divinePower lazy-inject)');
// =============================================================================
// R0 added divinePower to blankCharacter ONLY and the deity collection was already in
// blankCampaign + the templates; nothing was added to migrateCampaign. So every shipped
// template + the demo must still be a TRUE migrate-no-op (JSON-identical), and a template/
// demo character must NOT gain a divinePower field on load. (Mirrors migrations.smoke §P3.6.)
require(path.join(REPO, 'acks-demo-template.js'));
const DEMO = global.ACKS_DEMO_TEMPLATE;
ok('demo template loaded', DEMO && DEMO.kind === 'campaign');
ok('migrate(demo) is a TRUE no-op (JSON-identical)', JSON.stringify(ACKS.migrateCampaign(clone(DEMO))) === JSON.stringify(clone(DEMO)));
ok('migrated demo characters did NOT gain divinePower (no lazy-inject)',
  (ACKS.migrateCampaign(clone(DEMO)).characters || []).every(ch => !('divinePower' in ch)));

(function(){
  const dir = path.join(REPO, 'Templates');
  let templateFiles = [];
  try { templateFiles = fs.readdirSync(dir).filter(f => f.endsWith('.acks.json')); } catch(_){}
  ok('found shipped templates to check', templateFiles.length === 6, 'found ' + templateFiles.length);
  for(const f of templateFiles){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch(e){ ok('template parses: ' + f, false, e.message); continue; }
    const migrated = ACKS.migrateCampaign(clone(raw));
    ok('template is a TRUE migrate-no-op: ' + f, JSON.stringify(migrated) === JSON.stringify(raw));
    ok('template carries deities[] already: ' + f, Array.isArray(raw.deities));
    ok('template characters did NOT gain divinePower: ' + f, (migrated.characters || []).every(ch => !('divinePower' in ch)));
  }
})();

// =============================================================================
// R1 — divine-power accrual + consumers (Phase_4_Religion_Plan.md §5.2–§5.6).
// =============================================================================

// =============================================================================
section('R1 — DOMAIN_WORSHIP_RATE + the morale-keyed rate (§3.2)');
// =============================================================================
ok('DOMAIN_WORSHIP_RATE table present', !!ACKS.DOMAIN_WORSHIP_RATE && ACKS.DOMAIN_WORSHIP_RATE['0'] === 4);
ok('rate(0) = 4', ACKS.domainWorshipRateForMorale(0) === 4);
ok('rate(-4) = 0', ACKS.domainWorshipRateForMorale(-4) === 0);
ok('rate(+4) = 8', ACKS.domainWorshipRateForMorale(4) === 8);
ok('rate clamps morale > 4 → 8', ACKS.domainWorshipRateForMorale(9) === 8);
ok('rate clamps morale < -4 → 0', ACKS.domainWorshipRateForMorale(-9) === 0);

// =============================================================================
section('R1 — congregation accrual math (RR p.421 worked examples)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Accrual' }); c.currentTurn = 5;
  const dei = ACKS.blankDeity({ id: 'dei-1', name: 'the Lawgiver', alignment: 'Lawful' }); c.deities.push(dei);
  const priest = ACKS.blankCharacter({ id: 'chr-b', name: 'Balbus', class: 'Crusader', level: 9 }); c.characters.push(priest);
  const dom = ACKS.blankDomain({ id: 'dom-1', name: 'Realm' });
  dom.demographics.peasantFamilies = 2500; dom.demographics.urbanFamilies = 0; dom.demographics.morale = 0;
  c.domains.push(dom);

  // Balbus 9th — pure domain worship at morale 0: (2500/10) × 4 = 1000 gp/wk (RR p.421).
  const cong = ACKS.foundCongregation(c, { name: 'Faithful', deityId: 'dei-1', highPriestCharacterId: 'chr-b', domainWorshipDomainId: 'dom-1' });
  ok('domain-worship weekly = 1000 (Balbus 9th example)', ACKS.congregationWeeklyDivinePowerGp(c, cong) === 1000);
  ok('foundCongregation auto-creates the priest favor', !!ACKS.divineFavorOf(c, 'chr-b'));
  ok('personal-only weekly = 10 per 50 congregants (full rate)', ACKS.congregationWeeklyDivinePowerGp(c, ACKS.blankCongregation({ personalCongregants: 150 })) === 30);

  // Stacking: 50 personal at the full rate + the morale rate on the remaining families (RR p.421).
  cong.personalCongregants = 50;
  ok('stacking weekly = 10 + floor(2450/10)×4 = 990', ACKS.congregationWeeklyDivinePowerGp(c, cong) === 990);
  cong.personalCongregants = 0;

  // Maintenance + monthly.
  ok('maintained weeks default 4 (autoMaintain)', ACKS.congregationMaintainedWeeks(cong) === 4);
  ok('monthly = weekly × 4 = 4000', ACKS.congregationMonthlyDivinePowerGp(c, cong) === 4000);
  ACKS.setCongregationMaintenance(c, cong.id, false, 2);
  ok('autoMaintain off → maintained weeks = the GM-set 2', ACKS.congregationMaintainedWeeks(cong) === 2);
  ok('monthly at 2 tended weeks = 2000', ACKS.congregationMonthlyDivinePowerGp(c, cong) === 2000);

  // Domain worship tracks live morale (−2 → rate 2): (2500/10)×2 = 500/wk.
  dom.demographics.morale = -2;
  ok('domain worship follows morale (−2 → 500/wk)', ACKS.congregationDomainWorshipWeeklyGp(c, cong) === 500);
})();

// =============================================================================
section('R1 — divine-power accrual + expiry ledger (§4.4)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Ledger' }); c.currentTurn = 5;
  const ch = ACKS.blankCharacter({ id: 'chr-x', name: 'Priest', class: 'Craftpriest' }); c.characters.push(ch);
  const e = ACKS.accrueDivinePower(c, 'chr-x', 300, 'congregation', 'dei-1');
  ok('accrueDivinePower returns the entry', !!e && e.amountGp === 300);
  ok('default accruedAtTurn = currentTurn (5)', e.accruedAtTurn === 5);
  ok('default expiresAtTurn = accruedAtTurn + 1 (6)', e.expiresAtTurn === 6);
  ok('available reflects the accrual', ACKS.divinePowerAvailable(c, 'chr-x') === 300);
  ok('accrue emits divine-power-accrued', (c.eventLog || []).some(x => x.event && x.event.kind === 'divine-power-accrued'));
  ok('accrue ≤ 0 is a no-op', ACKS.accrueDivinePower(c, 'chr-x', 0) === null);
  ACKS.grantDivinePower(c, 'chr-x', 100);
  ok('grant adds (300 + 100 = 400)', ACKS.divinePowerAvailable(c, 'chr-x') === 400);
  c.currentTurn = 6;
  const wasted = ACKS.expireDivinePowerFor(c, ch);
  ok('expireDivinePowerFor drops the faded 400 at turn 6', wasted === 400 && ACKS.divinePowerAvailable(c, 'chr-x') === 0);
  ok('expired entries physically removed', (ch.divinePower.entries || []).length === 0);
})();

// =============================================================================
section('R1 — processReligionForTurn (the monthly consumer, §5.6)');
// =============================================================================
(function(){
  const rng = () => 0.45;  // 1d10 → 5, never explodes
  const c = ACKS.blankCampaign({ name: 'Monthly' }); c.currentTurn = 5;
  const dei = ACKS.blankDeity({ id: 'dei-1', name: 'the Lawgiver', alignment: 'Lawful' }); c.deities.push(dei);
  const priest = ACKS.blankCharacter({ id: 'chr-b', name: 'Balbus', class: 'Crusader', level: 9 }); c.characters.push(priest);
  const dom = ACKS.blankDomain({ id: 'dom-1', name: 'Realm' });
  dom.demographics.peasantFamilies = 2500; dom.demographics.morale = 0; c.domains.push(dom);
  const cong = ACKS.foundCongregation(c, { name: 'Faithful', deityId: 'dei-1', highPriestCharacterId: 'chr-b', domainWorshipDomainId: 'dom-1' });

  const r = ACKS.processReligionForTurn(c, { rng });
  ok('consumer ran', r.ran === true);
  ok('consumer reports 1 congregation', r.congregations === 1);
  ok('consumer accrued 4000 (1000/wk × 4)', r.accruedGp === 4000);
  const e = priest.divinePower.entries;
  ok('one ledger entry created', e.length === 1);
  ok('accrual stamped FOR the upcoming month (accruedAtTurn = turn+1 = 6)', e[0].accruedAtTurn === 6);
  ok('accrual fades the month after (expiresAtTurn = turn+2 = 7)', e[0].expiresAtTurn === 7);
  ok('source = domain-worship', e[0].source === 'domain-worship');
  ok('DP live this turn (7 > 5)', ACKS.divinePowerAvailable(c, 'chr-b') === 4000);

  // Proselytizing → congregants (Balbus 4th: 840 chapel + 210 spells = 1,050 gp → 1d10 + CHA).
  priest.level = 4;
  ACKS.addProselytizingValue(c, cong.id, 1050);
  const chaB = ACKS.abilityMod((priest.abilities && priest.abilities.CHA) || 10);
  ACKS.processReligionForTurn(c, { rng });
  ok('proselytizing 1,050gp → floor(1050/1000)×(1d10+CHA) = (5 + CHA) congregants', cong.personalCongregants === (5 + chaB));
  ok('proselytizing accumulator reset', cong.proselytizingValueThisMonthGp === 0);
})();

// =============================================================================
section('R1 — congregation decline (1d10! per 1,000, RR p.421)');
// =============================================================================
(function(){
  const rng = () => 0.45;  // 1d10 → 5
  const c = ACKS.blankCampaign({ name: 'Decline' }); c.currentTurn = 5;
  const priest = ACKS.blankCharacter({ id: 'chr-p', name: 'P', class: 'Crusader' }); c.characters.push(priest);
  const cong = ACKS.foundCongregation(c, { highPriestCharacterId: 'chr-p', personalCongregants: 5000 });
  ACKS.setCongregationMaintenance(c, cong.id, false, 0); // 0 weeks tended → 4 missed weeks
  ACKS.processReligionForTurn(c, { rng });
  // 4 missed weeks × (1d10! 5 × floor(5000/1000) 5) = 4 × 25 = 100 lost
  ok('untended congregation loses 100 congregants (4 wk × 25)', cong.personalCongregants === 4900);
  ok('untended congregation flagged declining', cong.status === 'declining');
  ok('untended congregation accrues no divine power', !(priest.divinePower && (priest.divinePower.entries || []).length));
})();

// =============================================================================
section('R1 — consecrate fields (RR p.422: 2gp DP/family + magic-research throw, §5.3)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Consecrate' }); c.currentTurn = 5;
  const ch = ACKS.blankCharacter({ id: 'chr-c', name: 'Caster', class: 'Crusader', level: 9 }); c.characters.push(ch);
  const dom = ACKS.blankDomain({ id: 'dom-1', name: 'Realm' }); dom.demographics.peasantFamilies = 2500; c.domains.push(dom);
  // cost = 2 × 2500 = 5000; caster has 4000 → atomic no-op
  ACKS.grantDivinePower(c, 'chr-c', 4000);
  const ins = ACKS.consecrateFields(c, { casterId: 'chr-c', domainId: 'dom-1', rng: () => 0.99 });
  ok('insufficient DP → ok:false', ins.ok === false && ins.reason === 'insufficient-divine-power');
  ok('insufficient → DP untouched (still 4000)', ACKS.divinePowerAvailable(c, 'chr-c') === 4000);
  ok('insufficient → no Land-Value bonus written', !dom.consecrationLandValueBonus);
  // top up + a guaranteed success (rng 0.99 → roll 20 → auto-success)
  ACKS.grantDivinePower(c, 'chr-c', 2000); // 6000 available
  const con = ACKS.consecrateFields(c, { casterId: 'chr-c', domainId: 'dom-1', rng: () => 0.99 });
  ok('consecrate ok, cost 5000', con.ok === true && con.cost === 5000);
  ok('success → +1 Land-Value bonus recorded on the domain', con.landValueDelta === 1 && dom.consecrationLandValueBonus === 1);
  ok('DP debited (6000 − 5000 = 1000)', ACKS.divinePowerAvailable(c, 'chr-c') === 1000);
  ok('consecration event logged', (c.eventLog || []).some(x => x.event && x.event.kind === 'consecration'));
  // natural 1 → −1 (rng 0.0 → roll 1, awry)
  ACKS.grantDivinePower(c, 'chr-c', 5000);
  const awry = ACKS.consecrateFields(c, { casterId: 'chr-c', domainId: 'dom-1', rng: () => 0 });
  ok('natural 1 → −1 Land Value (bonus 1 → 0)', awry.ok === true && awry.landValueDelta === -1 && dom.consecrationLandValueBonus === 0);
})();

// =============================================================================
section('R1 — pray & sacrifice → campaign XP (RR p.422/425, monthly threshold, §5.6)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Pray' }); c.currentTurn = 5;
  const dei = ACKS.blankDeity({ id: 'dei-1', name: 'the Lawgiver', alignment: 'Lawful' }); c.deities.push(dei);
  const ch = ACKS.blankCharacter({ id: 'chr-c', name: 'Caster', class: 'Crusader', level: 9 }); c.characters.push(ch);
  ACKS.ensureDivineFavor(c, 'chr-c', 'dei-1');
  const thr = ACKS.computeGpThreshold(9);
  ACKS.grantDivinePower(c, 'chr-c', thr + 2000);
  const pray = ACKS.prayAndSacrifice(c, 'chr-c', thr + 1000);
  ok('pray ok', pray.ok === true);
  ok('pray debits DP (remaining 1000)', ACKS.divinePowerAvailable(c, 'chr-c') === 1000);
  ok('prayedThisTurnGp accumulates the returned amount', ch.divinePower.prayedThisTurnGp === thr + 1000);
  ok('pray-and-sacrifice emits divine-favor-changed', (c.eventLog || []).some(x => x.event && x.event.kind === 'divine-favor-changed' && x.event.payload.action === 'pray-and-sacrifice'));
  const xpBefore = ch.xp || 0;
  ACKS.processReligionForTurn(c, { rng: () => 0.5 });
  ok('monthly consumer awards XP = returned − threshold = 1000', (ch.xp || 0) - xpBefore === 1000);
  ok('prayer accumulator reset after the award', (ch.divinePower.prayedThisTurnGp || 0) === 0);
  // returning ≤ threshold awards no XP
  ACKS.grantDivinePower(c, 'chr-c', 50);
  ACKS.prayAndSacrifice(c, 'chr-c', 50);
  const xp2 = ch.xp;
  ACKS.processReligionForTurn(c, { rng: () => 0.5 });
  ok('returning below threshold awards no XP', ch.xp === xp2);
})();

// =============================================================================
section('R1 — DivineFavor standing (D1: categorical, suspends accrual)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Favor' }); c.currentTurn = 5;
  const dei = ACKS.blankDeity({ id: 'dei-1', alignment: 'Lawful' }); c.deities.push(dei);
  const priest = ACKS.blankCharacter({ id: 'chr-p', class: 'Crusader' }); c.characters.push(priest);
  ACKS.foundCongregation(c, { highPriestCharacterId: 'chr-p', deityId: 'dei-1', personalCongregants: 500 });
  const fav = ACKS.divineFavorOf(c, 'chr-p');
  ok('favor starts good-standing', fav.standing === 'good-standing');
  ok('foundCongregation favor is RAW-faithful (no favorLevel)', !('favorLevel' in fav));
  ACKS.setDivineFavorStanding(c, fav.id, 'lapsed', 'transgression');
  ok('setDivineFavorStanding flips to lapsed', fav.standing === 'lapsed');
  ok('standing change emits divine-favor-changed', (c.eventLog || []).some(x => x.event && x.event.kind === 'divine-favor-changed' && x.event.payload.action === 'standing-change'));
  const before = ACKS.divinePowerAvailable(c, 'chr-p');
  ACKS.processReligionForTurn(c, { rng: () => 0.5 });
  ok('lapsed standing suspends divine-power accrual', ACKS.divinePowerAvailable(c, 'chr-p') === before);
})();

// =============================================================================
section('R1 — the 3 event kinds are registered + Wizard-opted-out + handler-dispatched');
// =============================================================================
(function(){
  const REQ = {
    'divine-power-accrued': { characterId: 'chr-x', amountGp: 1, source: 'gm-grant' },
    'consecration':         { casterCharacterId: 'chr-x', kind: 'fields', divinePowerSpentGp: 1 },
    'divine-favor-changed': { characterId: 'chr-x', action: 'established' }
  };
  ['divine-power-accrued', 'consecration', 'divine-favor-changed'].forEach(k => {
    ok('EVENT_KINDS includes ' + k, ACKS.EVENT_KINDS.includes(k));
    ok('EVENT_SCHEMAS has ' + k, !!ACKS.EVENT_SCHEMAS[k]);
    ok('isEventKindKnown ' + k, ACKS.isEventKindKnown(k) === true);
    ok(k + ' is Wizard-opted-out (engine-emitted)', ACKS.isWizardEmittable(k) === false && ACKS.EVENT_WIZARD_OPTOUT.has(k));
    ok(k + ' dispatches through its registered handler (not the stub)', (function(){
      try {
        const ev = ACKS.newEvent(k, { submittedBy: 'engine', targetTurn: 1, payload: REQ[k] });
        const out = ACKS.applyEvent(ACKS.blankCampaign({ name: 'd' }), ev);
        return !!out && !!out.result && typeof out.result.narrativeSummary === 'string' && !/handler not yet implemented/.test(out.result.narrativeSummary);
      } catch(e){ return false; }
    })());
  });
})();

// =============================================================================
section('R1 GUARD — no congregations ⇒ the consumer is inert (no event spam)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Inert' }); c.currentTurn = 5;
  const logBefore = (c.eventLog || []).length;
  const r = ACKS.processReligionForTurn(c, { rng: () => 0.5 });
  ok('consumer runs on an empty campaign', r.ran === true && r.congregations === 0 && r.accruedGp === 0);
  ok('no congregations ⇒ no events emitted', (c.eventLog || []).length === logBefore);
})();

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Religion R0 + R1 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
