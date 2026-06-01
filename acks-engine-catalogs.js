/* =============================================================================
 * acks-engine-catalogs.js — ACKS God Mode Reference Data Catalogs (Module 1)
 *
 * Extracted from acks-engine.js §6.5 on 2026-05-28 as part of the engine-split
 * polish work. Attaches all catalog constants + lookups to window.ACKS.
 *
 * Load order: this module MUST load BEFORE acks-engine.js so the main engine
 * can reference these via global.ACKS during its own initialization.
 * =============================================================================
 */
(function(global){
'use strict';

// =============================================================================
// 6.5 REFERENCE DATA CATALOGS
// =============================================================================
// Static catalogs of game content. Frozen at module load. Companion tools can
// read these directly off window.ACKS to know e.g. all valid merchandise IDs.
// =============================================================================

// Stronghold structure catalog. Costs from ACKS II RR + By This Axe surface structure table.
// Catalog entries use `key` (not `id`) because they're reference rows, not entities.
const STRONGHOLD_CATALOG = Object.freeze([
  { key: 'tower-small-round',   name: "Tower, small round (30' high × 20' dia)", cost: 15000, category: 'Towers' },
  { key: 'tower-medium-round',  name: "Tower, medium round (40' high × 20' dia)", cost: 22500, category: 'Towers' },
  { key: 'tower-large-round',   name: "Tower, large round (40' high × 30' dia)", cost: 30000, category: 'Towers' },
  { key: 'tower-huge-round',    name: "Tower, huge round (60' high × 30' dia)", cost: 54000, category: 'Towers' },
  { key: 'wall-20',             name: "Wall, stone castle (20' × 100')", cost:  5000, category: 'Walls' },
  { key: 'wall-30',             name: "Wall, stone castle (30' × 100')", cost:  7500, category: 'Walls' },
  { key: 'wall-40',             name: "Wall, stone castle (40' × 100')", cost: 12500, category: 'Walls' },
  { key: 'wall-50',             name: "Wall, stone castle (50' × 100')", cost: 17500, category: 'Walls' },
  { key: 'wall-60',             name: "Wall, stone castle (60' × 100')", cost: 22500, category: 'Walls' },
  { key: 'gatehouse',           name: "Gatehouse (20' × 30' × 20', portcullis)", cost:  6500, category: 'Gates & barriers' },
  { key: 'barbican',            name: 'Barbican (gatehouse + 2 small towers + drawbridge)', cost: 38000, category: 'Gates & barriers' },
  { key: 'drawbridge',          name: "Drawbridge, wood (10' × 20')", cost:   250, category: 'Gates & barriers' },
  { key: 'palisade',            name: "Palisade, wood (10' high × 100' long)", cost:   125, category: 'Gates & barriers' },
  { key: 'rampart',             name: "Rampart, earthen (10' high × 100' long × 15' thick)", cost:  2500, category: 'Gates & barriers' },
  { key: 'battlement',          name: "Battlement (100' crenellated parapet)", cost:   500, category: 'Gates & barriers' },
  { key: 'moat-unfilled',       name: "Moat, unfilled (100' × 20' × 10' deep)", cost:   400, category: 'Gates & barriers' },
  { key: 'moat-filled',         name: "Moat, filled (100' × 20' × 10' deep)", cost:   800, category: 'Gates & barriers' },
  { key: 'building-wood',       name: "Building, wood (20' high × 30' square)", cost:  1500, category: 'Buildings' },
  { key: 'building-stone',      name: "Building, stone (20' high × 30' square)", cost:  3000, category: 'Buildings' },
  { key: 'keep-square',         name: "Keep, square (80' high × 60' square)", cost: 75000, category: 'Buildings' }
]);
function lookupStrongholdStructure(key){ return STRONGHOLD_CATALOG.find(s => s.key === key) || null; }

// ACKS II RR p.374 — Common (19) and Precious (10) merchandise tables. Used for mercantile ventures.
// daily.X = base stones per day at market impact 1; real availability = daily × market_impact.
const MERCHANDISE_CATALOG = Object.freeze([
  // ---------- COMMON MERCHANDISE (19) ----------
  { id:'grain-vegetables',  name:'Grain & vegetables', category:'common',   container:'Bags',       basePrice:0.12, priceStep:0.01, tariffPct:0.00, daily:{ I:2000, II:500, III:250, IV:60, V:25, VI:10 }, notes:'Seasonal: +1 step in spring (sowing), −1 step in autumn (harvest). Tariff-exempt per RR p.372.' },
  { id:'salt',              name:'Salt',               category:'common',   container:'Bricks',     basePrice:0.15, priceStep:0.02, tariffPct:0.05, daily:{ I:1000, II:250, III:125, IV:30, V:12, VI:5 } },
  { id:'beer-ale',          name:'Beer & ale',         category:'common',   container:'Amphorae',   basePrice:0.15, priceStep:0.02, tariffPct:0.05, daily:{ I:1000, II:250, III:125, IV:30, V:12, VI:5 } },
  { id:'pottery',           name:'Pottery',            category:'common',   container:'Crates',     basePrice:0.15, priceStep:0.02, tariffPct:0.05, daily:{ I:1000, II:250, III:125, IV:30, V:12, VI:5 } },
  { id:'common-wood',       name:'Common wood',        category:'common',   container:'Bundles',    basePrice:0.17, priceStep:0.02, tariffPct:0.05, daily:{ I:1000, II:250, III:125, IV:30, V:12, VI:5 } },
  { id:'wine-spirits',      name:'Wine & spirits',     category:'common',   container:'Amphorae',   basePrice:0.19, priceStep:0.02, tariffPct:0.05, daily:{ I:1000, II:250, III:125, IV:30, V:12, VI:5 } },
  { id:'oil-sauce',         name:'Oil & sauce',        category:'common',   container:'Amphorae',   basePrice:0.30, priceStep:0.03, tariffPct:0.05, daily:{ I:500,  II:125, III:60,  IV:15, V:6,  VI:3 } },
  { id:'preserved-fish',    name:'Preserved fish',     category:'common',   container:'Amphorae',   basePrice:0.45, priceStep:0.04, tariffPct:0.05, daily:{ I:500,  II:125, III:60,  IV:15, V:6,  VI:3 } },
  { id:'preserved-meat',    name:'Preserved meat',     category:'common',   container:'Amphorae',   basePrice:1,    priceStep:0.1,  tariffPct:0.05, daily:{ I:500,  II:125, III:60,  IV:15, V:6,  VI:3 } },
  { id:'glassware',         name:'Glassware',          category:'common',   container:'Crates',     basePrice:1.5,  priceStep:0.15, tariffPct:0.05, daily:{ I:250,  II:60,  III:30,  IV:8,  V:3,  VI:1 } },
  { id:'rare-wood',         name:'Rare wood',          category:'common',   container:'Bundles',    basePrice:2,    priceStep:0.2,  tariffPct:0.05, daily:{ I:150,  II:40,  III:20,  IV:5,  V:2,  VI:1 } },
  { id:'common-metal',      name:'Common metal',       category:'common',   container:'Chests',     basePrice:2,    priceStep:0.2,  tariffPct:0.05, daily:{ I:150,  II:40,  III:20,  IV:5,  V:2,  VI:1 } },
  { id:'common-furs',       name:'Common furs',        category:'common',   container:'Bundles',    basePrice:4.5,  priceStep:0.45, tariffPct:0.05, daily:{ I:100,  II:25,  III:12,  IV:3,  V:1,  VI:1 } },
  { id:'textiles',          name:'Textiles',           category:'common',   container:'Rolls',      basePrice:7.5,  priceStep:0.75, tariffPct:0.05, daily:{ I:100,  II:25,  III:12,  IV:3,  V:1,  VI:1 } },
  { id:'dye-pigment',       name:'Dye & pigment',      category:'common',   container:'Jars',       basePrice:10,   priceStep:1,    tariffPct:0.05, daily:{ I:75,   II:20,  III:10,  IV:2,  V:1,  VI:0.4 } },
  { id:'botanicals',        name:'Botanicals',         category:'common',   container:'Bags',       basePrice:15,   priceStep:1.5,  tariffPct:0.05, daily:{ I:75,   II:20,  III:10,  IV:2,  V:1,  VI:0.4 } },
  { id:'clothing',          name:'Clothing',           category:'common',   container:'Bags',       basePrice:15,   priceStep:1.5,  tariffPct:0.05, daily:{ I:75,   II:20,  III:10,  IV:2,  V:1,  VI:0.4 } },
  { id:'tools',             name:'Tools',              category:'common',   container:'Crates',     basePrice:15,   priceStep:1.5,  tariffPct:0.05, daily:{ I:75,   II:20,  III:10,  IV:2,  V:1,  VI:0.4 } },
  { id:'armor-weapons',     name:'Armor & weapons',    category:'common',   container:'Crates',     basePrice:22,   priceStep:2.2,  tariffPct:0.05, daily:{ I:75,   II:20,  III:10,  IV:2,  V:1,  VI:0.4 } },
  // ---------- PRECIOUS MERCHANDISE (10) ----------
  { id:'monster-parts',     name:'Monster parts',      category:'precious', container:'Metamphorae',basePrice:60,   priceStep:6,    tariffPct:0.20, daily:{ I:33,   II:8,   III:4,   IV:1,   V:0.4, VI:0.2 } },
  { id:'ivory-tusk',        name:'Ivory tusk',         category:'precious', container:'Wrapping',   basePrice:100,  priceStep:10,   tariffPct:0.20, daily:{ I:20,   II:5,   III:3,   IV:1,   V:0.25,VI:0.1 } },
  { id:'rare-furs',         name:'Rare furs',          category:'precious', container:'Bundles',    basePrice:100,  priceStep:10,   tariffPct:0.20, daily:{ I:20,   II:5,   III:3,   IV:1,   V:0.25,VI:0.1 } },
  { id:'spices',            name:'Spices',             category:'precious', container:'Amphorae',   basePrice:100,  priceStep:10,   tariffPct:0.20, daily:{ I:20,   II:5,   III:3,   IV:1,   V:0.25,VI:0.1 } },
  { id:'fine-porcelain',    name:'Fine porcelain',     category:'precious', container:'Crates',     basePrice:100,  priceStep:10,   tariffPct:0.20, daily:{ I:20,   II:5,   III:3,   IV:1,   V:0.25,VI:0.1 } },
  { id:'precious-metals',   name:'Precious metals',    category:'precious', container:'Chests',     basePrice:100,  priceStep:10,   tariffPct:0.20, daily:{ I:20,   II:5,   III:3,   IV:1,   V:0.25,VI:0.1 } },
  { id:'silk',              name:'Silk',               category:'precious', container:'Rolls',      basePrice:333,  priceStep:33,   tariffPct:0.20, daily:{ I:6,    II:2,   III:1,   IV:0.2, V:0.1, VI:0.03 } },
  { id:'rare-books-art',    name:'Rare books & art',   category:'precious', container:'Boxes',      basePrice:333,  priceStep:33,   tariffPct:0.20, daily:{ I:6,    II:2,   III:1,   IV:0.2, V:0.1, VI:0.03 } },
  { id:'semiprecious-stones', name:'Semiprecious stones', category:'precious', container:'Boxes',   basePrice:1000, priceStep:100,  tariffPct:0.20, daily:{ I:2,    II:1,   III:0.25,IV:0.06,V:0.03,VI:0.01 } },
  { id:'gems',              name:'Gems',               category:'precious', container:'Boxes',      basePrice:7500, priceStep:750,  tariffPct:0.20, daily:{ I:0.25, II:0.07,III:0.03,IV:0.01,V:0.01,VI:0.01 }, notes:'In Class V/VI markets, 0.01 stone available only if DM ≥ +2 (selling) or DM ≤ −2 (buying); otherwise not available.' }
]);
const GENERIC_MERCHANDISE = Object.freeze({
  common:   { avgValuePerStone: 1.1, dailyTradedPerUrbanFamily: 0.025 },
  precious: { avgValuePerStone: 135, dailyTradedPerUrbanFamily: 0.00074 },
  any:      { avgValuePerStone: 3.1, dailyTradedPerUrbanFamily: 0.0168 }
});
function lookupMerchandise(id){ return MERCHANDISE_CATALOG.find(m => m.id === id) || null; }
function merchandiseAvailableAtClass(merch, classRoman){ return merch?.daily?.[classRoman] ?? 0; }
function merchandiseTariff(merch, totalGp){ return Math.round((merch?.tariffPct || 0) * (totalGp || 0)); }

// Vagaries of Investment — distilled from RR p.383-388 commercial-expedition column,
// adapted for active arbitrage ventures. Weights sum to 90; remaining 10 = additional calm-voyage buffer.
const VAGARIES_TABLE = Object.freeze([
  { id:'calm-voyage',    name:'Calm voyage',          weight:40, severity:'neutral',      effect:'none',            text:'The expedition proceeds without incident.' },
  { id:'favorable-winds',name:'Favorable winds',      weight:8,  severity:'good',         effect:'speed-up-1',      text:'Favorable winds (or smooth roads) shorten the journey by 1 turn.' },
  { id:'banking-fee',    name:'Banking fee secured',  weight:4,  severity:'good',         effect:'value-bonus-pct', effectValue:10, text:"The venturer secures an additional fee from a buyer — projected sale increased by ~10% (a one-time +50% return on this month's receipts)." },
  { id:'patron',         name:'Patron acquired',      weight:3,  severity:'good',         effect:'value-bonus-pct', effectValue:15, text:'A wealthy patron has decided to do business with the venturer, boosting expected sale value by 15%. (RR: "A Disrepute cancels this.")' },
  { id:'discovery',      name:'Discovery',            weight:2,  severity:'great',        effect:'value-bonus-pct', effectValue:20, text:'The expedition unearths something of great worth (treasure map, buried treasure, hidden settlement, new trade route…). Sale value bumped by 2d10% — call it 20% for simplicity here, with the option for the GM to upgrade it to an actual adventure hook.' },
  { id:'delay-weather',  name:'Delay — bad weather',  weight:8,  severity:'minor-bad',    effect:'delay-turns',     effectValue:1, text:'Inclement weather (storms at sea or impassable roads) delays the expedition by 1 turn.' },
  { id:'delay-customs',  name:'Delay — customs',      weight:4,  severity:'minor-bad',    effect:'delay-turns',     effectValue:1, text:"Cargo held up at customs / impounded by local authorities. 1-turn delay; bribery may resolve at GM's discretion." },
  { id:'brigandage',     name:'Brigandage / piracy',  weight:5,  severity:'minor-bad',    effect:'value-loss-pct',  effectValue:10, text:'Brigands or pirates intercept the expedition. Cargo value reduced by ~10% (RAW: rate of return -33% for 1d6 months; we apply a one-shot equivalent).' },
  { id:'fee-tariff',     name:'Unexpected fee',       weight:5,  severity:'minor-bad',    effect:'value-loss-pct',  effectValue:10, text:'Tariff hike, fine, legal expense, or extortion costs the expedition 10% of its value. (If the destination is in a domain you rule, this can be waived.)' },
  { id:'decimation',     name:'Decimation',           weight:5,  severity:'bad',          effect:'value-loss-pct',  effectValue:30, text:'The expedition is decimated — substantial cargo and crew losses. Value reduced by 2d10% (call it 30% here).' },
  { id:'calamity',       name:'Calamity',             weight:3,  severity:'bad',          effect:'value-loss-pct',  effectValue:25, text:'Calamity strikes (arson, accidental fire, flood, riot). Cargo value reduced by 2d6×5% (~25%). RR p.384.' },
  { id:'mutiny',         name:'Mutiny / desertion',   weight:2,  severity:'bad',          effect:'value-loss-pct',  effectValue:20, text:'The crew mutinies or deserts; some cargo is stolen or abandoned. 20% loss.' },
  { id:'annihilation',   name:'Annihilation',         weight:1,  severity:'catastrophic', effect:'total-loss',                       text:'The expedition has been utterly destroyed. Total loss — investment cannot be recovered. RR p.383.' }
]);
function rollVagary(){
  const total = VAGARIES_TABLE.reduce((s,v)=>s+(v.weight||0),0) + 10;
  let r = Math.floor(Math.random()*total);
  for(const v of VAGARIES_TABLE){
    if(r < v.weight) return v;
    r -= v.weight;
  }
  return VAGARIES_TABLE[0];
}
function lookupVagary(id){ return VAGARIES_TABLE.find(v => v.id === id) || null; }

// Placeholder monthly domain event table. ACKS II does NOT have a single canonical monthly event
// table — instead it has specialized context tables (Vagaries of Recruitment, Vagaries of Investment,
// Favors and Duties). This list is flavorful filler with morale-aware filtering.
const EVENT_TABLE = Object.freeze([
  // CRISIS
  { text: 'Open rebellion flares in a peripheral village; the local magistrate is hanged', moraleMin: -4, moraleMax: -2 },
  { text: 'Brigands form a band of 2d6 × 10 disgruntled peasants and prey on caravans', moraleMin: -4, moraleMax: -2 },
  { text: "A demagogue gathers a mob and demands the ruler's abdication", moraleMin: -4, moraleMax: -2 },
  { text: 'A plague of rats spreads disease through the worst districts', moraleMin: -4, moraleMax: -1 },
  { text: 'Tax collectors are murdered in three separate incidents', moraleMin: -4, moraleMax: -2 },
  { text: 'A prominent merchant family flees the domain, taking their wealth elsewhere', moraleMin: -3, moraleMax: -1 },
  // STRESSED
  { text: 'Whispered grievances against taxation grow louder in the markets', moraleMin: -2, moraleMax: 0 },
  { text: "A house fire in the slums; rumours blame the ruler's neglect", moraleMin: -2, moraleMax: -1 },
  { text: 'Smuggling activity increases; tariffs underperform expectations', moraleMin: -3, moraleMax: -1 },
  { text: 'A demoralized garrison soldier deserts; others quietly consider following', moraleMin: -3, moraleMax: -1 },
  { text: 'A wandering monster (1d6 HD) is sighted at the edge of settled lands', moraleMin: -4, moraleMax: 1 },
  // ROUTINE
  { text: 'A merchant caravan from a neighbouring realm passes through (+50gp tariff)', moraleMin: -4, moraleMax: 4 },
  { text: 'Bad weather damages a stretch of road; minor repair costs', moraleMin: -4, moraleMax: 4 },
  { text: "A local dispute reaches the ruler's court for judgement", moraleMin: -4, moraleMax: 4 },
  { text: 'A mysterious stranger seeks audience with the ruler', moraleMin: -4, moraleMax: 4 },
  { text: 'A traveling specialist (henchman) seeks employment', moraleMin: -4, moraleMax: 4 },
  { text: 'A scholar or priest petitions for sanctuary while studying local lore', moraleMin: -4, moraleMax: 4 },
  { text: 'Reports of strange lights in an unclaimed hex', moraleMin: -4, moraleMax: 4 },
  { text: 'A child is born to a family of significance', moraleMin: -1, moraleMax: 4 },
  { text: 'An old retainer dies of natural causes; ceremonial obligations follow', moraleMin: -4, moraleMax: 4 },
  { text: 'The weather is unremarkable; the month passes quietly', moraleMin: -2, moraleMax: 4 },
  // OPPORTUNITIES
  { text: 'A pilgrim brings news of a far realm and a potential alliance', moraleMin: -2, moraleMax: 4 },
  { text: 'A vein of useful stone is found near a quarry; minor land improvement opportunity', moraleMin: -1, moraleMax: 4 },
  { text: 'A foreign emissary requests audience to discuss trade terms', moraleMin: -1, moraleMax: 4 },
  { text: 'A rumour of bandits lairing two hexes away; PCs may investigate', moraleMin: -3, moraleMax: 3 },
  { text: 'A henchman in another domain seeks transfer to this one', moraleMin: 0, moraleMax: 4 },
  // POSITIVE
  { text: 'A bountiful harvest fills the granaries (+10% land revenue this month)', moraleMin: 0, moraleMax: 4 },
  { text: 'A guild of craftsmen requests permission to establish a new workshop', moraleMin: 0, moraleMax: 4 },
  { text: 'A festival day delights the peasantry; minor goodwill', moraleMin: 0, moraleMax: 4 },
  { text: "A wealthy donor funds a public work in the ruler's honour", moraleMin: 1, moraleMax: 4 },
  { text: "Word of the ruler's justice spreads; a small wave of immigrants arrive", moraleMin: 1, moraleMax: 4 },
  { text: 'A talented young noble offers to swear fealty as a henchman', moraleMin: 1, moraleMax: 4 },
  // TRIUMPHANT
  { text: 'A legendary hero of the realm pays the ruler an unannounced visit', moraleMin: 2, moraleMax: 4 },
  { text: 'A miracle is reported at the local shrine; pilgrims flock from afar', moraleMin: 2, moraleMax: 4 },
  { text: 'Bards compose flattering songs about the ruler that reach distant courts', moraleMin: 3, moraleMax: 4 },
  { text: 'A neighbouring lord offers a dynastic marriage', moraleMin: 2, moraleMax: 4 },
  { text: 'A rich foreign merchant proposes establishing a permanent trading post', moraleMin: 2, moraleMax: 4 },
  // QUIET
  { text: 'No notable event this month', moraleMin: -2, moraleMax: 4 }
]);
function sampleEvent(currentMorale){
  const m = (typeof currentMorale === 'number') ? Math.max(-4, Math.min(4, currentMorale)) : 0;
  const eligible = EVENT_TABLE.filter(e => e.moraleMin <= m && m <= e.moraleMax);
  return (eligible[Math.floor(Math.random() * eligible.length)] || EVENT_TABLE[0]).text;
}

// House Rules registry. Each entry: { id, category, name, source, description }.
// Categories indexed via HOUSERULE_CATEGORIES below.
const HOUSERULES_REGISTRY = Object.freeze([
  // ----- Calendar day-tick layer (Phase 2.95 §13) -----
  { id:'auto-pause-on-encounter', category:'world', name:'Auto-pause on encounter', source:'Phase 2.95 Calendar §13', description:'The day-tick pipeline pauses for GM review when a consumer surfaces an encounter. Default on.' },
  { id:'auto-pause-on-navigation-fail', category:'world', name:'Auto-pause on navigation failure', source:'Phase 2.95 Calendar §13', description:'Pause the day-tick when a journey navigation throw fails. Default on.' },
  { id:'auto-pause-on-supplies-low', category:'world', name:'Auto-pause on low supplies', source:'Phase 2.95 Calendar §13', description:'Pause the day-tick when supplies drop below three days of stores. Default on.' },
  { id:'monthly-commit-subsumes-in-flight', category:'world', name:'Monthly commit subsumes in-flight activity', source:'Phase 2.95 Calendar §13', description:'At month end, unresolved day-aware activities auto-complete at their current state. When off, the GM must resolve them day-by-day before the monthly commit. Default on.' },
  { id:'journey-batching-routine', category:'world', name:'Journey batching (routine)', source:'Phase 2.95 Calendar §13', description:'Silent-advance routine travel until a consumer surfaces a notable event. Effect lands with Journeys. Default off.' },
  { id:'journey-fast-travel', category:'world', name:'Journey fast-travel', source:'Phase 2.95 Calendar §13', description:'Collapse known-safe travel stretches to single-roll summary outcomes. Effect lands with Journeys. Default off.' },
  { id:'realistic-weather', category:'world', name:'Realistic weather', source:'Phase 2.95 Calendar §13', description:'Roll weather per day on regional tables instead of GM fiat. Effect lands with the weather consumer. Default off.' },
  { id:'realistic-fatigue', category:'world', name:'Realistic fatigue', source:'JJ p.84', description:'Use the strict four-phase fatigue cycle instead of a simplified single counter. Effect lands with Journeys. Default off.' },
  { id:'persistent-wandering-monsters', category:'world', name:'Persistent wandering monsters', source:'Phase 2.95 Calendar §13 / #476', description:'Wandering-encounter survivors become placed Group entities in the hex pool. Effect lands with Monster Persistence. Default off.' },
  { id:'mandatory-rations', category:'world', name:'Mandatory rations', source:'Phase 2.95 Calendar §13', description:'The engine strictly tracks rations and applies hunger and dehydration. Effect lands with Journeys. Default off.' },
  // ----- Domain mechanics -----
  { id:'families-per-hex-tracking', category:'domain', name:'Families-per-hex tracking',
    source:'ACKS II RR (advanced granularity beyond RAW)',
    description:"ACKS RAW tracks land value per hex (each hex gets its own 3d3 roll at securing, RR p.339) but families at the DOMAIN level (RR p.340). By default, land revenue is therefore the domain family total × the average hex land value — which is RAW-exact for the single-hex and uniform-value domains RAW presents. This rule is a high-fidelity overlay BEYOND RAW: each hex tracks its own family count, and land revenue becomes the literal per-hex sum Σ(families-in-hex × hex value), which only matters for a mixed-value, multi-hex domain. Adds the per-hex families column; population growth distributes across hexes by capacity (Phase 2.5+ map mode)." },
  { id:'separating-land-and-lordship', category:'domain', name:'Separating land and lordship',
    source:'ACKS II RR p.355-ish (Phase 2/4 — not yet implemented)',
    description:"Splits domain ownership between a landowner (collects land + service revenue) and a governor (collects tax + tribute + urban revenue). When on, each domain can declare distinct landowner and governor character ids." },
  // ----- Construction & improvement -----
  { id:'stronghold-by-buildings', category:'construction', name:'Stronghold composed of buildings',
    source:'ACKS II RR p.339 (variant)',
    description:'Track strongholds as a list of individual structures (Tower, Wall, Gatehouse, Building Stone) rather than a single aggregate value. Useful for detailed sieges and modular stronghold construction.' },
  // immediate-construction + realistic-construction BOTH REMOVED 2026-05-31 (Joachim): RAW (RR p.174)
  // builds land/structures over time as labor-paid, supervised construction projects — that is now the
  // tool's DEFAULT, not a toggle. Neither instant completion nor the supervised/timed model is a house
  // rule. A GM who wants to skip the timeline uses the admin tools (Inspector: set a Project's
  // lifecycleState to 'complete', or a hex's landImprovementBonus directly). The engine keeps an
  // internal `abstract-construction` flag (NOT user-facing) for the instant/gp-only path used by the
  // zero-drift oracle. See _handoffs/Agricultural_Time_Based_Spec.md + RAW_Posture_HouseRule_Audit.md.
  { id:'alternative-farming-methods', category:'construction', name:'Alternative farming methods (8× population density)',
    source:'ACKS II RR p.340 (variant — not yet implemented)',
    description:"Intensive cultivation of high-yield crops twice per year could yield 8× the standard population density per hex. When enabled, individual hexes can be flagged as using alternative farming, raising their max-families ceiling." },
  // ----- Mercantile -----
  { id:'random-merchandise-rolling', category:'mercantile', name:'Random merchandise rolling',
    source:'ACKS II RR Random Merchandise table (Phase 2b)',
    description:"When off (default), GM picks merchandise availability and sets demand modifiers by hand. When on, the tool rolls the Random Merchandise table to populate market inventories and rolls demand modifiers within RAW ranges." },
  // ----- Calendar (Phase 2.95) -----
  { id:'auran-calendar', category:'world', name:'Auran calendar',
    source:'ACKS II setting (Phase 2.95)',
    description:"Switches the calendar from the default real-life-style 12-month/30-day calendar to the Auran Empire calendar with named months and festival days. Default off — keeps the tool setting-neutral for non-Auran homebrew." },
  { id:'seasonal-trade-modifiers', category:'mercantile', name:'Seasonal trade modifiers',
    source:'ACKS II RR p.375 (Phase 2.9 polish hook)',
    description:"When on, venture math (Phase 2b) applies seasonal price adjustments based on the campaign's current calendar month. Default off." },
  // ----- Markets & Merchandise (Phase 2.9) -----
  { id:'markets-notability', category:'mercantile', name:'M&M — Notability per category',
    source:'Markets & Merchandise supplement (Phase 2.9)',
    description:"Settlements can be famous-for (or scarce-of) 8 categories: weapons, armor, magic, luxury, exotic, livestock, art, food. Notability shifts prices, availability, specialist recruitment in related occupations." },
  { id:'markets-transaction-threshold', category:'mercantile', name:'M&M — Transaction thresholds',
    source:'Markets & Merchandise supplement (Phase 2.9)',
    description:"Per-settlement threshold above which transactions are 'notable' — emit rumors, attract investigators, may require tax payment or face confiscation. Default formula: floor(families × 0.5) gp." },
  { id:'markets-entryways', category:'mercantile', name:'M&M — Market entryways',
    source:'Markets & Merchandise supplement (Phase 2.9)',
    description:"Track per-settlement entryways (road, river, sea, smuggler-cove). Each has security level + inspection chance. Phase 2b venture resolution rolls inspection against these." },
  { id:'markets-regulated-assets', category:'mercantile', name:'M&M — Regulated assets',
    source:'Markets & Merchandise supplement (Phase 2.9)',
    description:"Per-settlement list of regulated goods (licensed, forbidden, interdicted). Affects venture profit, magic item sales, rumor auto-emission." },
  { id:'markets-black-market', category:'mercantile', name:'M&M — Black market arbitrage',
    source:'Markets & Merchandise supplement (Phase 2.9)',
    description:"Allows arbitrage between settlements with different regulations. Profit potential is high but rumor emission is heavy. Requires markets-regulated-assets." },
  { id:'markets-magic-wizard', category:'mercantile', name:'M&M — Magic item sale wizard',
    source:'Markets & Merchandise supplement (Phase 2.9)',
    description:"Enables a guided modal for selling magic items: notability check → transaction-threshold check → possible black-magic interdiction." },
  // ----- Rumors (Phase 2.8) -----
  { id:'rumors-manual', category:'rumors', name:'Rumors — manual panel',
    source:"ACKS II + What's the Word (Phase 2.8)",
    description:"Enables the per-settlement rumor panel: create, edit, delete rumors. Rumors track text, truth level (GM eye), apparent level (player eye), topic, and origin. Required for the auto-emission and proliferation sub-rules below." },
  { id:'rumors-auto-emit', category:'rumors', name:'Rumors — engine auto-emission',
    source:"ACKS II + What's the Word (Phase 2.8)",
    description:"When on, the engine emits rumor-emit events into pendingEvents on significant monthly outcomes (low morale, ruler death, vassal revolt, treasury collapse, settlement founded/lost). Requires rumors-manual.", requires:["rumors-manual"] },
  { id:'rumors-proliferation', category:'rumors', name:'Rumors — proliferation drift',
    source:"What's the Word — proliferation tables (Phase 2.8)",
    description:"When on, each rumor has a monthly chance to spread to neighboring settlements and its apparent-level drifts up over time. Requires rumors-manual.", requires:["rumors-manual"] },
  { id:'recruitment-notability', category:'mercantile', name:'Recruitment — Notability impact',
    source:'ACKS II + M&M (Phase 2.95 §4.2)',
    description:"When on, recruitment expenditures (monthly wages × hires, signing bonuses) above the settlement's transaction threshold trigger a civic rumor about the patron's hiring activity. Requires rumors-manual + rumors-auto-emit to actually surface the rumor.", requires:["rumors-manual","rumors-auto-emit"] },
  { id:'persistent-hireling-candidates', category:'characters', name:'Recruitment — Persist candidate records',
    source:'ACKS II + Phase 2.95 §4.3 design pass',
    description:"When on, NPCs individuated during recruitment are saved as Character records (kind='candidate') and kept on the roster after the session ends — both hired (promoted to henchman/specialist) and rejected (left as 'candidate'). When OFF (default), only hired candidates are kept; rejected and unresolved candidates are discarded when the recruitment session ends. Required by persistent-hireling-resurfacing." },
  { id:'persistent-hireling-resurfacing', category:'characters', name:'Recruitment — Resurface persisted candidates',
    source:'Phase 2.95 §4.3 design pass',
    description:"When on, saved candidates (kind='candidate') from prior recruitment attempts at the same market + matching type resurface in subsequent solicits. They count against the rolled availability — total candidate budget unchanged. Requires persistent-hireling-candidates (cannot resurface what isn't saved). This is the 'the world remembers' behavior.", requires:["persistent-hireling-candidates"] },
  // ----- Hijinks (Phase 2.7) -----
  { id:'detailed-hijink-tracking', category:'hijinks', name:'Detailed hijink tracking',
    source:'ACKS II RR pp.360-370 (Phase 2.7 — not yet implemented)',
    description:"When off (default), syndicates abstract to the designer's-note shorthand. When on, every hijink is resolved per-attempt with proficiency bonuses, planning/laying-low timers, individual perpetrator state, and the full Crime and Punishment table." },
  // ----- Located inventory (Phase 2.95 Stash A — 2026-05-29) -----
  // Master toggle for the Stash subsystem. When ON, all wealth flows through
  // typed stash entities (Phase_2.95_Stash_Plan.md §7). When OFF, the engine
  // treats stash data on disk as non-existent and stripped on save per the
  // house-rule-gating memory. Sub-toggles below.
  { id:'inventory-stash-system', category:'characters', name:'Located inventory (Stash subsystem)',
    source:'Phase 2.95 Stash plan (Domain Treasury becomes Stash subtype; carry-inventory encumbrance lives)',
    description:"Master switch for the Stash subsystem. When ON, all wealth (treasury, personal inventory, party loot, mining revenue, venture payouts, adventure rewards) flows through typed stash entities with location, owner, and audit history. The Domain Treasury becomes a stash subtype (kind='domain-treasury') and transfers with the office on ruler succession. Encumbrance becomes meaningful. XP threshold (RR p.423) credits on deposit-to-personal-stash, not on bare receipt. When OFF, legacy bare-number domain.treasury + free-text character.inventory remains; stash data is hidden AND non-functional per the house-rule-gating memory. Sub-toggles: enforce-carry-encumbrance, hidden-stashes, party-loot-split." },
  { id:'enforce-carry-encumbrance', category:'characters', name:'Stash — Hard-block carry encumbrance',
    source:'ACKS II RR pp.83-84 (encumbrance bands; default RAW is warnings, not hard block)',
    description:"When ON, the character sheet hard-blocks adds to carry inventory that would exceed max encumbrance (20 st baseline). When OFF (RAW default), encumbrance is surfaced as visual warnings with band colors but adds are never blocked; movement penalties still apply mechanically. Requires inventory-stash-system.", requires:["inventory-stash-system"] },
  { id:'hidden-stashes', category:'characters', name:'Stash — Hidden caches + smuggling vaults',
    source:'ACKS II + Phase 2.7 Hijinks scope',
    description:"Allows stashes to be flagged isHidden=true (caches in the wilderness, smugglers' vaults, hidden temple coffers). Hidden stashes don't surface on hex detail by default; Phase 2.7 Spy hijinks can locate them via proficiency throw. Requires inventory-stash-system.", requires:["inventory-stash-system"] },
  { id:'party-loot-split', category:'characters', name:'Stash — Party loot splits on withdraw',
    source:'ACKS II RR p.423 (XP threshold for divided treasure)',
    description:"When ON (RAW default), GP-threshold XP credit fires for a character when they withdraw their share from a party stash — the 'treasure is divided' moment. When OFF, party-stash deposits proportionally credit all members' GP threshold immediately on deposit (faster but more abstract). Requires inventory-stash-system.", requires:["inventory-stash-system"] },
  // ----- Notable items + custody (Wave B.5 — Architecture.md §3.7 — 2026-05-29) -----
  // Master toggle for the Notable Items subsystem. When ON, magic items, AXIOMS books,
  // regalia, masterworks are tracked as first-class entities (campaign.notableItems[])
  // with provenance, intrinsic properties, and per-character identification state, plus
  // explicit custody relations (campaign.itemCustody[]) covering character / group / outpost
  // / stronghold-vault / hex / monster-hoard / merchant-stock / unknown custodians.
  // Per JJ p.130 + AXIOMS Issue 14.
  // When OFF, those two collections are hidden AND non-functional per the
  // house-rule-gating memory — stripped on save, ignored on load.
  // Default OFF until the B.5.3 UI ships (Item Browser + custody chain + book learning).
  { id:'notable-items-tracking', category:'characters', name:'Notable items + custody (Wave B.5)',
    source:'Architecture.md §3.7 (JJ p.130 + AXIOMS Issue 14 "Codex & Scroll, Part I")',
    description:"Master switch for tracking magic items, AXIOMS books, regalia, and masterworks as first-class entities with intrinsic state, provenance (knownMakeAndAuthenticity affects sale price 2× per JJ p.130), and per-character identification. Custody is an explicit relation supporting unscavenged hoards, merchant stock, lost caches, inheritance lines. Mundane items continue to live in character.inventory[] free-text. When OFF, the tracking collections are stripped on save and ignored on load; promotion buttons hidden." },
  // ----- Cultural variants -----
  { id:'slavery', category:'cultural', name:'Slavery — slave families and slave-soldiers',
    source:'ACKS II RR (multiple sections — Phase 2 / cultural variant)',
    description:"Adds slave families as a third demographic category. 25%+ slaves = -1 base morale; 100% slaves = -4. Also enables slave-soldier garrison units. Required for historical / classical settings and Dark Sun-style settings." },
  { id:'dwarven-civilization', category:'cultural', name:'Dwarven civilization (By This Axe)',
    source:'By This Axe: The Cyclopedia of Dwarven Civilization (Phase 4.6 — not yet implemented)',
    description:"Unlocks dwarven-specific domain features: piltgarin family categories, terrain-specific land value rolls, the dwarven vault builder, mushroom farming, and the Eldermoot council variant. Mining is a separate house rule (dwarven-mining) since the AXIOMS Issue 17 / By This Axe Ch.8 mining subsystem also applies to non-dwarven domains." },
  { id:'experimental-mushroom-farming', category:'cultural', name:'Experimental mushroom farming',
    source:'By This Axe (variant; requires Dwarven civilization)',
    description:"Optional dangerous variant of mushroom farming for medicinal, military, or recreational effects. Includes the historical mishap table." },
  // ----- Mining (By This Axe Ch.8 + AXIOMS Issue 17 'Ore Never Changes'). Phase 4 — specified
  // in Phase_4_Mines_Plan.md, NOT YET IMPLEMENTED. When the master rule is off (default),
  // the engine ignores all mining-tagged data and the UI hides mining surfaces entirely. -----
  { id:'dwarven-mining', category:'cultural', name:'Mining & ore deposits (BTA Ch.8 / AXIOMS 17)',
    source:'By This Axe Ch.8 + AXIOMS Issue 17 "Ore Never Changes" (Phase 4 — specified, not yet implemented)',
    description:"Master toggle for the mining subsystem: ore deposits placed per 24-mile hex, sustainable capacity + deposit reserves, prospecting, mine establishment (10,000gp + 20 days), mining-family workforce (or work gangs for non-dwarven realms), labor revenue per ore type, industrial improvements, depletion. Without this rule the tool has no mine functionality — no mine views, no labor revenue, no ore deposits on hexes. Despoliation, vagaries, non-dwarven workforce, and salt mines are sub-toggles below." },
  { id:'dwarven-mining-discovery', category:'cultural', name:'Mining — prospecting required',
    source:'By This Axe Ch.8 (Phase 4 — not yet implemented)',
    description:"Requires a Prospecting throw (RR p.119) to discover ore deposits in a hex before they can be exploited. When off, deposits are visible immediately. Requires dwarven-mining." },
  { id:'dwarven-mining-vagaries', category:'cultural', name:'Mining — Vagaries of the Deep',
    source:'By This Axe Ch.8 (Phase 4 — not yet implemented)',
    description:"Enables the deep-delving table (16+ vagaries: vein widening/narrowing, monstrosity, unearthly ore, flood, miasma, etc.) for mines worked past their deposit reserves. Heavy GM overhead — opt-in for campaigns that want the slow-burn deep-delving pressure. Requires dwarven-mining." },
  { id:'dwarven-mining-despoliation', category:'cultural', name:'Mining — land despoliation',
    source:'By This Axe Ch.8 (Phase 4 — not yet implemented)',
    description:"Enables −1 land value per 2,400 labor months of mining on a hex; terrain shifts toward shrubland/barrens/desert as land value drops. Despoliation overflows to adjacent hexes when the host hits 0. Requires dwarven-mining." },
  { id:'dwarven-mining-non-dwarven', category:'cultural', name:'Mining — non-dwarven realms',
    source:'AXIOMS Issue 17 + By This Axe Ch.8 (Phase 4 — not yet implemented)',
    description:"Enables work-gang workforce (5 humans = 1 mining family), inferior mineralogy (capacity halved, no deep delve), miserable morale penalties (−1 at 25%+ work-gangs, −4 at 100%), and the optional paid-work-gang sub-rule. Requires dwarven-mining." },
  { id:'dwarven-mining-salt', category:'cultural', name:'Mining — salt deposits',
    source:'By This Axe Ch.8 (Phase 4 — not yet implemented)',
    description:"Adds salt as a sibling ore type with unique mechanics: unlimited deposit reserves, sustainable capacity 1d3!×100 families, over-exploitation curve (extra families above capacity reduce per-family labor revenue by 2gp each). Requires dwarven-mining." },
  { id:'elven-civilization', category:'cultural', name:'Elven civilization (Cyclopedia of Elven Civ — future supplement)',
    source:'Future Autarch supplement (Phase 4.7 placeholder)',
    description:"Architectural placeholder for elven-specific domain features: fastnesses, elven family/follower mechanics, mythic groves, and elven realm politics." },
  { id:'beastman-domains', category:'cultural', name:'Beastman domains (clanholds and transitional)',
    source:'ACKS II RR (clanholds) + future supplement (Phase 4.8 placeholder)',
    description:"Architectural placeholder for the full clanhold variant: tribal warband family categories, transitional governance, and the beastman path from clan to civilized realm." }
]);
const HOUSERULE_CATEGORIES = Object.freeze([
  { id:'domain',       label:'🏰 Domain',         description:'Hex tracking, vassal structure, geography, land/lordship.' },
  { id:'construction', label:'🏗 Construction',    description:'Strongholds, agricultural investments, land improvements, alternative farming.' },
  { id:'mercantile',   label:'⚖ Mercantile',      description:'Trade ventures, demand modifiers, random merchandise (Phase 2b).' },
  { id:'characters',   label:'👥 Characters',       description:'Henchman loyalty, salary tracking, hireling recruitment (Phase 2.95).' },
  { id:'world',        label:'🌍 World',            description:'Calendar, seasons, time-of-year mechanics (Phase 2.95+).' },
  { id:'rumors',       label:'🗣 Rumors',          description:"Manual rumor tracking, engine auto-emission, proliferation (Phase 2.8 / What's the Word)." },
  { id:'hijinks',      label:'🗡 Hijinks',         description:'Criminal syndicates, hijink resolution detail (Phase 2.7 — placeholders).' },
  { id:'cultural',     label:'🌍 Cultural',        description:'Slavery, dwarven/elven/beastman civilization supplements.' }
]);
function lookupHouseRule(id){ return HOUSERULES_REGISTRY.find(r => r.id === id) || null; }

// =============================================================================
// HIRELING AVAILABILITY + RECRUITMENT (Phase 2.95 §4.2 / §310.3)
// Source: RR pp.164–167. Three availability tables (mercenary, henchman,
// specialist) × 6 market classes (I–VI). Cells are RAW strings parsed by
// the engine's parseAvailabilitySpec / rollAvailabilitySpec helpers.
//
// Market class index: 0=Class I (metropolis), 1=Class II (city), 2=Class III
// (large town), 3=Class IV (small town), 4=Class V (village), 5=Class VI (hamlet).
// =============================================================================

const HIRELING_MARKET_CLASSES = Object.freeze([
  { idx:0, label:'Class I',   roman:'I',   description:'Metropolis (≥100k)' },
  { idx:1, label:'Class II',  roman:'II',  description:'City (≥20k)' },
  { idx:2, label:'Class III', roman:'III', description:'Large town (≥5k)' },
  { idx:3, label:'Class IV',  roman:'IV',  description:'Small town (≥1k)' },
  { idx:4, label:'Class V',   roman:'V',   description:'Village (≥250)' },
  { idx:5, label:'Class VI',  roman:'VI',  description:'Hamlet (≥75)' }
]);

// Mercenary availability — RR p.166. 16 unit types × 6 market classes.
// Wages described as "by race"; the engine consults a separate (future) table.
const HIRELING_MERCENARIES = Object.freeze([
  { id:'light-infantry',           label:'Light Infantry',           cells:['4d100','5d20','5d10','3d4','1d6','1d2'],        wage:'by-race' },
  { id:'heavy-infantry',           label:'Heavy Infantry',           cells:['2d100','5d10','3d8','1d8','1d3','1 (85%)'],    wage:'by-race' },
  { id:'slinger',                  label:'Slinger',                  cells:['8d20','4d10','2d10','1d6','1d2','1 (70%)'],    wage:'by-race' },
  { id:'bowman',                   label:'Bowman',                   cells:['8d20','4d10','2d10','1d6','1d2','1 (70%)'],    wage:'by-race' },
  { id:'crossbowman',              label:'Crossbowman',              cells:['8d20','4d10','2d10','1d6','1d2','1 (70%)'],    wage:'by-race' },
  { id:'composite-bow',            label:'Composite Bowman / Longbowman', cells:['4d20','2d10','1d10','1d3','1','1 (33%)'], wage:'by-race', notes:'Settlement will have one of these or longbow, not both.' },
  { id:'light-cavalry',            label:'Light Cavalry',            cells:['4d20','2d10','1d10','1d3','1','1 (33%)'],      wage:'by-race' },
  { id:'mounted-crossbowman',      label:'Mounted Crossbowman',      cells:['3d20','4d4','2d4','1d2','1 (75%)','1 (25%)'],  wage:'by-race' },
  { id:'horse-archers',            label:'Horse Archers',            cells:['3d20','4d4','2d4','1d3','1 (70%)','1 (23%)'],  wage:'by-race' },
  { id:'medium-cavalry',           label:'Medium Cavalry',           cells:['3d20','4d4','2d4','1d2','1 (70%)','1 (23%)'],  wage:'by-race' },
  { id:'heavy-cavalry',            label:'Heavy Cavalry',            cells:['4d10','1d10','1d6','1d2 (50%)','1 (50%)','1 (15%)'], wage:'by-race' },
  { id:'cataphract-cavalry',       label:'Cataphract Cavalry',       cells:['3d10','1d8','1d4','1d2 (33%)','1 (40%)','1 (10%)'], wage:'by-race' },
  { id:'camel-archers',            label:'Camel Archers',            cells:['4d20','2d10','1d10','1d3','1','1 (33%)'],      wage:'by-race', notes:'Settlement realm must include Barrens or Desert hexes.' },
  { id:'camel-lancers',            label:'Camel Lancers',            cells:['3d20','4d4','2d4','1d2','1 (70%)','1 (23%)'],  wage:'by-race', notes:'Settlement realm must include Barrens or Desert hexes.' },
  { id:'war-elephants',            label:'War Elephants',            cells:['1d10','1 (70%)','1 (40%)','1 (7%)','1 (5%)','-'],   wage:'by-race' },
  { id:'beast-riders',             label:'Beast Riders',             cells:['3d10','1d8','1d4','1d2 (33%)','1 (40%)','1 (10%)'], wage:'by-race' }
]);

// Henchman availability — RR p.166. 5 level bands × 6 market classes.
const HIRELING_HENCHMEN = Object.freeze([
  { id:'henchman-0', label:'0th level Henchman', level:0, cells:['4d100','5d20','4d8','3d4','1d6','1d2'],         wage:12,  wagePeriod:'month', wageUnit:'gp' },
  { id:'henchman-1', label:'1st level Henchman', level:1, cells:['5d10','2d6','1d4','1d2','1 (65%)','1 (20%)'],   wage:25,  wagePeriod:'month', wageUnit:'gp' },
  { id:'henchman-2', label:'2nd level Henchman', level:2, cells:['3d10','2d4','1d3','1','1 (40%)','1 (15%)'],     wage:50,  wagePeriod:'month', wageUnit:'gp' },
  { id:'henchman-3', label:'3rd level Henchman', level:3, cells:['1d10','1d3','1 (85%)','1 (33%)','1 (15%)','1 (5%)'], wage:100, wagePeriod:'month', wageUnit:'gp' },
  { id:'henchman-4', label:'4th level Henchman', level:4, cells:['1d6','1d2','1 (45%)','1 (15%)','1 (5%)','-'],   wage:200, wagePeriod:'month', wageUnit:'gp' }
]);

// Specialist availability — RR p.167. ~46 specialist types × 6 market classes.
const HIRELING_SPECIALISTS = Object.freeze([
  { id:'alchemist',                       label:'Alchemist',                          cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],     wage:250, wagePeriod:'month', wageUnit:'gp' },
  { id:'animal-trainer-common',           label:'Animal Trainer (Common)',            cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:25,  wagePeriod:'month', wageUnit:'gp' },
  { id:'animal-trainer-wild',             label:'Animal Trainer (Wild)',              cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:75,  wagePeriod:'month', wageUnit:'gp' },
  { id:'animal-trainer-giant',            label:'Animal Trainer (Giant/Prehistoric)', cells:['2d10','1d6','1d3','1 (65%)','1 (25%)','1 (10%)'], wage:150, wagePeriod:'month', wageUnit:'gp' },
  { id:'animal-trainer-fantastic',        label:'Animal Trainer (Fantastic)',         cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:250, wagePeriod:'month', wageUnit:'gp' },
  { id:'armorer',                         label:'Armorer',                            cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:75,  wagePeriod:'month', wageUnit:'gp' },
  { id:'artisan-common',                  label:'Artisan (common)',                   cells:['6d10','4d4','2d4','2','1 (80%)','1 (30%)'],       wage:75,  wagePeriod:'month', wageUnit:'gp' },
  { id:'artisan-uncommon',                label:'Artisan (uncommon)',                 cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:75,  wagePeriod:'month', wageUnit:'gp' },
  { id:'artisan-rare',                    label:'Artisan (rare)',                     cells:['2d8','1d4','1d2','1 (50%)','1 (20%)','1 (5%)'],   wage:75,  wagePeriod:'month', wageUnit:'gp' },
  { id:'artillerist',                     label:'Artillerist',                        cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:25,  wagePeriod:'month', wageUnit:'gp' },
  { id:'copyist',                         label:'Copyist',                            cells:['2d4×50','5d20','5d10','3d4','1d6','1d2'],         wage:2,   wagePeriod:'page',  wageUnit:'sp' },
  { id:'creature-handler-domestic',       label:'Creature Handler (Domestic)',        cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:25,  wagePeriod:'month', wageUnit:'gp' },
  { id:'creature-handler-wild',           label:'Creature Handler (Wild)',            cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:75,  wagePeriod:'month', wageUnit:'gp' },
  { id:'creature-handler-giant',          label:'Creature Handler (Giant/Prehistoric)', cells:['2d10','1d6','1d3','1 (65%)','1 (25%)','1 (10%)'], wage:150, wagePeriod:'month', wageUnit:'gp' },
  { id:'creature-handler-fantastic',      label:'Creature Handler (Fantastic)',       cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:250, wagePeriod:'month', wageUnit:'gp' },
  { id:'engineer',                        label:'Engineer',                           cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:250, wagePeriod:'month', wageUnit:'gp' },
  { id:'healer',                          label:'Healer',                             cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:1,   wagePeriod:'day-patient', wageUnit:'gp' },
  { id:'healer-physicker',                label:'Healer (Physicker)',                 cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:2,   wagePeriod:'day-patient', wageUnit:'gp' },
  { id:'healer-chirurgeon',               label:'Healer (Chirurgeon)',                cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:4,   wagePeriod:'day-patient', wageUnit:'gp' },
  { id:'laborer-skilled',                 label:'Laborer (Skilled)',                  cells:['2d4×100','1d3×100','1d4×50','8d6','4d6','2d4'],   wage:6,   wagePeriod:'month', wageUnit:'gp' },
  { id:'laborer-unskilled',               label:'Laborer (Unskilled)',                cells:['4d6×100','3d3×100','3d4×50','8d6×3','4d6×3','2d4×3'], wage:3,   wagePeriod:'month', wageUnit:'gp' },
  { id:'lawyer',                          label:'Lawyer',                             cells:['2d8','1d4','1d2','1 (50%)','1 (20%)','1 (5%)'],   wage:100, wagePeriod:'month', wageUnit:'gp' },
  { id:'mariner-captain',                 label:'Mariner — Captain',                  cells:['4d6','1d6','1d3','1 (80%)','1 (33%)','1 (10%)'],  wage:100, wagePeriod:'month', wageUnit:'gp' },
  { id:'mariner-master',                  label:'Mariner — Master',                   cells:['1d6','1d2','-','-','-','-'],                       wage:250, wagePeriod:'month', wageUnit:'gp' },
  { id:'mariner-navigator',               label:'Mariner — Navigator',                cells:['5d10','1d12','1d6','1d2','1 (60%)','1 (45%)'],    wage:25,  wagePeriod:'month', wageUnit:'gp' },
  { id:'mariner-sailor',                  label:'Mariner — Sailor',                   cells:['4d100','5d20','5d10','3d4','1d6','1d2'],          wage:6,   wagePeriod:'month', wageUnit:'gp' },
  { id:'mariner-rower',                   label:'Mariner — Rower',                    cells:['2d4×100','1d3×100','1d4×50','8d6','4d6','2d4'],   wage:6,   wagePeriod:'month', wageUnit:'gp' },
  { id:'marshal-light-infantry',          label:'Marshal — Light Infantry',           cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:30,  wagePeriod:'month', wageUnit:'gp' },
  { id:'marshal-bow-hi-lc',               label:'Marshal — Bow, Heavy Infantry, or Light Cavalry', cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'], wage:60, wagePeriod:'month', wageUnit:'gp' },
  { id:'marshal-hc-ha',                   label:'Marshal — Heavy Cavalry or Horse Archer', cells:['2d10','1d6','1d3','1 (65%)','1 (25%)','1 (10%)'], wage:120, wagePeriod:'month', wageUnit:'gp' },
  { id:'marshal-cataphract',              label:'Marshal — Cataphract Cavalry',       cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:240, wagePeriod:'month', wageUnit:'gp' },
  { id:'merc-officer-lieutenant',         label:'Mercenary Officer — Lieutenant',     cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:200, wagePeriod:'month', wageUnit:'gp' },
  { id:'merc-officer-captain',            label:'Mercenary Officer — Captain',        cells:['1d6','1d2','1 (65%)','1 (15%)','1 (5%)','-'],     wage:800, wagePeriod:'month', wageUnit:'gp' },
  { id:'merc-officer-colonel',            label:'Mercenary Officer — Colonel',        cells:['1d2','1 (25%)','1 (15%)','1 (5%)','-','-'],       wage:3000, wagePeriod:'month', wageUnit:'gp' },
  { id:'merc-officer-general',            label:'Mercenary Officer — General',        cells:['1 (15%)','-','-','-','-','-'],                     wage:12000, wagePeriod:'month', wageUnit:'gp' },
  { id:'quartermaster',                   label:'Quartermaster',                      cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:40,  wagePeriod:'month', wageUnit:'gp' },
  { id:'ruffian-carouser',                label:'Ruffian — Carouser',                 cells:['2d4×50','5d20','5d10','3d4','1d6','1d2'],         wage:7,   wagePeriod:'month', wageUnit:'gp' },
  { id:'ruffian-footpad',                 label:'Ruffian — Footpad',                  cells:['2d4×50','5d20','5d10','3d4','1d6','1d2'],         wage:30,  wagePeriod:'month', wageUnit:'gp' },
  { id:'ruffian-reciter',                 label:'Ruffian — Reciter',                  cells:['2d4×25','5d10','3d8','1d6','1d3','1'],            wage:30,  wagePeriod:'month', wageUnit:'gp' },
  { id:'ruffian-slayer',                  label:'Ruffian — Slayer',                   cells:['5d10','2d6','1d6','1','1 (75%)','1 (5%)'],        wage:625, wagePeriod:'month', wageUnit:'gp' },
  { id:'ruffian-spy',                     label:'Ruffian — Spy',                      cells:['5d20','4d6','2d6','1d3','1d2','1 (10%)'],         wage:625, wagePeriod:'month', wageUnit:'gp' },
  { id:'ruffian-thug',                    label:'Ruffian — Thug',                     cells:['5d20','4d6','2d6','1d3','1d2','1 (10%)'],         wage:30,  wagePeriod:'month', wageUnit:'gp' },
  { id:'sage',                            label:'Sage',                               cells:['1d6','1d2','1 (65%)','1 (15%)','1 (5%)','-'],     wage:500, wagePeriod:'month', wageUnit:'gp' },
  { id:'scout-pathfinder',                label:'Scout — Pathfinder or Land Surveyor', cells:['5d10','1d12','1d6','1d2','1 (60%)','1 (45%)'],   wage:25,  wagePeriod:'month', wageUnit:'gp' },
  { id:'siege-engineer',                  label:'Siege Engineer',                     cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:50,  wagePeriod:'month', wageUnit:'gp' },
  { id:'translator',                      label:'Translator',                         cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:1,   wagePeriod:'page',  wageUnit:'gp' },
  { id:'writer-rank-1',                   label:'Writer — Rank 1',                    cells:['5d10','2d6','1d6','1d2','1 (65%)','1 (20%)'],     wage:1,   wagePeriod:'page',  wageUnit:'gp' },
  { id:'writer-rank-2',                   label:'Writer — Rank 2',                    cells:['3d10','2d4','1d4','1','1 (40%)','1 (15%)'],       wage:2,   wagePeriod:'page',  wageUnit:'gp' },
  { id:'writer-rank-3',                   label:'Writer — Rank 3',                    cells:['2d10','1d6','1d3','1 (65%)','1 (25%)','1 (10%)'], wage:4,   wagePeriod:'page',  wageUnit:'gp' },
  { id:'writer-rank-4',                   label:'Writer — Rank 4',                    cells:['1d10','1d3','1','1 (33%)','1 (15%)','1 (5%)'],    wage:10,  wagePeriod:'page',  wageUnit:'gp' }
]);

// Reaction to Hiring Offer table — RR p.165. Adjusted 2d6 → outcome band.
// "Accept with élan" grants +1 starting loyalty bonus. "Refuse and slander"
// applies a -1 to all future reaction rolls towards the rejector in the same
// town/region.
const REACTION_TO_HIRING = Object.freeze([
  { min: -99, max: 2,  key:'refuse-and-slander', label:'Refuse and slander', accent:'red',
    note:'NPC declines and spreads ill word; -1 penalty to all further reaction rolls in this town/region for the rejecting party.' },
  { min: 3,   max: 5,  key:'refuse',             label:'Refuse',            accent:'red',
    note:'NPC declines the offer.' },
  { min: 6,   max: 8,  key:'try-again',          label:'Try again',         accent:'amber',
    note:'Reluctant. Adventurer must "sweeten the deal" (more pay, magic item, etc.) for an additional roll. If no better offer, treat as Refuse.' },
  { min: 9,   max: 11, key:'accept',             label:'Accept',            accent:'green',
    note:'NPC agrees to the stated terms.' },
  { min: 12,  max: 99, key:'accept-elan',        label:'Accept with élan',  accent:'green',
    note:'Accepted with very good spirit; +1 starting loyalty bonus.' }
]);

// Per-week solicit fee — RR p.164. Fee is per hireling type per week
// (e.g. soliciting heavy infantry AND a sage costs both fees).
// Stored as RAW notation strings; resolveSolicitFee rolls and returns gp.
const HIRELING_SOLICIT_FEE_PER_WEEK = Object.freeze([
  { marketClassIdx: 0, notation:'1d6+15', label:'1d6+15 gp' },
  { marketClassIdx: 1, notation:'1d10+10', label:'1d10+10 gp' },
  { marketClassIdx: 2, notation:'1d8+5',  label:'1d8+5 gp' },
  { marketClassIdx: 3, notation:'1d6+3',  label:'1d6+3 gp' },
  { marketClassIdx: 4, notation:'1d6',    label:'1d6 gp' },
  { marketClassIdx: 5, notation:'1d3',    label:'1d3 gp' }
]);

// Reaction roll modifiers — RR p.164–165. Signing bonus tiers and
// multiple-attempt penalty are codified; CHA + proficiency mods are computed
// dynamically by the engine helpers.
const RECRUITMENT_MODIFIERS = Object.freeze({
  signingBonus: Object.freeze([
    { tier:'none',  modifier: 0, label:'No signing bonus' },
    { tier:'week',  modifier:+1, label:"One week's pay (+1)" },
    { tier:'month', modifier:+2, label:"One month's pay (+2)" },
    { tier:'year',  modifier:+3, label:"One year's pay (+3)" }
  ]),
  // Each subsequent attempt by anyone in the same party against the same
  // candidate applies a cumulative -1 penalty (RR p.165).
  multipleAttemptsCumulativePenalty: -1,
  // "Refuse and slander" blocks all further attempts by anyone in the same
  // party against THAT candidate, and applies -1 to all OTHER reaction rolls
  // in the same town/region for that party.
  slanderRegionalPenalty: -1
});

// ─── Phase 4 Construction Wave A — Worker catalog (RR p.174 — 2026-05-30) ───
// Wage and Construction Rates table. Each entry: wagePerDay (gp), outputCfPerDay (
// cubic feet of construction per worker per day), qualification proficiency required
// for the worker to count toward this row. Workers without qualifications still help
// as Laborers (default fallback). Per RAW: workers can be hired up to per-site cap
// (see §10.4.2); supervisor cap separately gates total managed workers.
//
// Wave A seeds the foundation set. Wave I and per-kind waves may add specialty
// rows (e.g. shipwright details, specific stone-types).
const CONSTRUCTION_WORKERS = Object.freeze({
  laborer:           { key:'laborer',          label:'Laborer',          wagePerDay: 0.1,  outputCfPerDay: 5,    qualification: null,           role:'general'    },
  mason:             { key:'mason',            label:'Mason',            wagePerDay: 1,    outputCfPerDay: 25,   qualification: 'craft-mason', role:'stone'      },
  carpenter:         { key:'carpenter',        label:'Carpenter',        wagePerDay: 1,    outputCfPerDay: 25,   qualification: 'craft-carpenter', role:'wood'    },
  smith:             { key:'smith',            label:'Smith',            wagePerDay: 1,    outputCfPerDay: 25,   qualification: 'craft-smith',    role:'metal'    },
  engineer:          { key:'engineer',         label:'Engineer',         wagePerDay: 2,    outputCfPerDay: 0,    qualification: 'engineering',   role:'supervisor', supervisorCap: 100 },
  siegeEngineer:     { key:'siegeEngineer',    label:'Siege Engineer',   wagePerDay: 3,    outputCfPerDay: 0,    qualification: 'siege-engineering', role:'supervisor', supervisorCap: 100 },
  shipwright:        { key:'shipwright',       label:'Shipwright',       wagePerDay: 2,    outputCfPerDay: 0,    qualification: 'craft-shipwright', role:'supervisor', supervisorCap: 100, vesselOnly: true },
  miner:             { key:'miner',            label:'Miner',            wagePerDay: 1,    outputCfPerDay: 10,   qualification: 'mining',         role:'underground' },
  trapper:           { key:'trapper',          label:'Trapper',          wagePerDay: 2,    outputCfPerDay: 0,    qualification: 'trapping',       role:'specialty',  trapsOnly: true },
  mage:              { key:'mage',             label:'Mage assistant',   wagePerDay: 0,    outputCfPerDay: 0,    qualification: 'arcane-caster', role:'magic-assist', notes: 'See §10.4.4 — magic-assist multipliers via spells, not raw labor.' }
});

// Lookup helper. Falls back to laborer for unknown keys.
function lookupConstructionWorker(key){
  return CONSTRUCTION_WORKERS[key] || CONSTRUCTION_WORKERS.laborer;
}

// Compute aggregate daily output (in cf) for a workerCounts map. Skips magic-assist
// (handled separately) and supervisors (don't do raw output). Used by day-tick consumer.
function totalDailyOutputCf(workerCounts){
  if(!workerCounts || typeof workerCounts !== 'object') return 0;
  let total = 0;
  for(const [key, count] of Object.entries(workerCounts)){
    if(!count || count < 0) continue;
    const w = CONSTRUCTION_WORKERS[key];
    if(!w || w.role === 'supervisor' || w.role === 'magic-assist') continue;
    total += (w.outputCfPerDay || 0) * count;
  }
  return total;
}

// Compute aggregate daily wage for a workerCounts map. Includes supervisors (they get paid)
// but excludes the mage role (RAW assumes magic-assist is voluntary spell support, not wage labor).
function totalDailyWageGp(workerCounts){
  if(!workerCounts || typeof workerCounts !== 'object') return 0;
  let total = 0;
  for(const [key, count] of Object.entries(workerCounts)){
    if(!count || count < 0) continue;
    const w = CONSTRUCTION_WORKERS[key];
    if(!w || w.role === 'magic-assist') continue;
    total += (w.wagePerDay || 0) * count;
  }
  return total;
}

// ─── Attach to ACKS namespace ────────────────────────────────────────────
const ACKS = global.ACKS = global.ACKS || {};
Object.assign(ACKS, {
  STRONGHOLD_CATALOG, MERCHANDISE_CATALOG, GENERIC_MERCHANDISE, VAGARIES_TABLE, EVENT_TABLE, HOUSERULES_REGISTRY, HOUSERULE_CATEGORIES, lookupMerchandise, merchandiseAvailableAtClass, merchandiseTariff, rollVagary, lookupVagary, sampleEvent, lookupHouseRule, lookupStrongholdStructure,
  // Phase 4 Construction Wave A (RR p.174 — 2026-05-30)
  CONSTRUCTION_WORKERS, lookupConstructionWorker, totalDailyOutputCf, totalDailyWageGp,
  // Phase 2.95 §4.2 — Hireling recruitment catalogs.
  HIRELING_MARKET_CLASSES, HIRELING_MERCENARIES, HIRELING_HENCHMEN, HIRELING_SPECIALISTS,
  REACTION_TO_HIRING, HIRELING_SOLICIT_FEE_PER_WEEK, RECRUITMENT_MODIFIERS
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
