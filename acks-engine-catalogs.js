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
function rollVagary(rng){
  rng = rng || Math.random;
  const total = VAGARIES_TABLE.reduce((s,v)=>s+(v.weight||0),0) + 10;
  let r = Math.floor(rng()*total);
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
  { id:'auto-pause-on-overbudget', category:'world', name:'Auto-pause on over-budget activity', source:'#346 Activity Budget', description:'Pause a multi-day advance when a character is over their RAW activity budget for the day (e.g. travelling while administering a domain). The day-tick review lists who, as a heads-up. Default on.' },
  { id:'monthly-commit-subsumes-in-flight', category:'world', name:'Monthly commit subsumes in-flight activity', source:'Phase 2.95 Calendar §13', description:'At month end, unresolved day-aware activities auto-complete at their current state. When off, the GM must resolve them day-by-day before the monthly commit. Default on.' },
  { id:'journey-batching-routine', category:'world', name:'Journey batching (routine)', source:'Phase 2.95 Calendar §13', description:'Silent-advance routine travel until a consumer surfaces a notable event. Effect lands with Journeys. Default off.' },
  { id:'journey-fast-travel', category:'world', name:'Journey fast-travel', source:'Phase 2.95 Calendar §13', description:'Collapse known-safe travel stretches to single-roll summary outcomes. Effect lands with Journeys. Default off.' },
  { id:'realistic-weather', category:'world', name:'Realistic weather', source:'Phase 2.95 Calendar §13', description:'Roll weather per day on regional tables instead of GM fiat. Effect lands with the weather consumer. Default off.' },
  // RAW-default posture (CLAUDE §6, the fatigue/rations flip-queue): on a Journey the engine
  // tracks RAW rations + the JJ p.84 strenuous-day fatigue cycle BY DEFAULT (no toggle). These
  // two opt-ins SIMPLIFY away from RAW — they are the simplification, never RAW-behind-a-toggle.
  { id:'simplified-fatigue', category:'world', name:'Simplified fatigue', source:'JJ p.84 (simplification)', description:'Opt out of the RAW JJ p.84 six-day strenuous-fatigue cycle in favour of a single soft counter that never forces a rest. RAW (the six-day cycle) is the default; this is the simplification. Default off.' },
  { id:'persistent-wandering-monsters', category:'encounters', name:'Persistent wandering monsters', source:'JJ p.69 + p.103 (the Vagaries linger mechanics, applied to wilderness encounters) / #476 E3a', default:true,
    description:'Wandering-encounter survivors become placed entities on the world map. Gates the 🏚 "Settles as lair?" outcome on the encounter resolution panel: a band met in the wild may roll its Lair % to linger and den at the hex (a second success = full lair strength). JJ p.103 prints that linger roll for DOMAIN encounters (Vagaries of Incursion); applying it to random wilderness encounters is the extension, hence the toggle. Default on.' },
  { id:'monster-pursuit', category:'encounters', name:'Monster pursuit', source:'RR p.285 + p.120 / #476 E3', default:true, description:'A tracking-capable monster the party evades may take up pursuit ("adventurers who evade might be tracked by some monsters" — RR p.285): the evaded encounter holds open while the GM adjudicates intent; a pursuer follows the trail at half expedition speed with daily Tracking throws (RR p.120) via the day clock, and a catch-up springs a fresh encounter. RAW frames this as GM judgment, so the automation is the toggle. Default on.' },
  { id:'domain-morale-banditry', category:'encounters', name:'Domain banditry takes the field', source:'RR pp.350–351 / #476 E10', default:true,
    description:'A domain at Turbulent morale or worse is plagued by bandits (RR p.350: one able-bodied man per 5 / 2 / 1 families at −2 / −3 / −4). With this on, those bandits MATERIALIZE as bands placed in the world each monthly turn — raiding within their domain on the Day Clock, meetable through the encounter layer, counting as an enemy army whose occupation penalty builds on the morale roll (RR p.349 + p.351). Killed bandits reduce the population (RR p.351); morale recovering to −1 disbands them back to their fields. Off = the bandit count stays a readout only. Default on.' },
  { id:'ignore-rations', category:'world', name:'Ignore rations', source:'RR p.275 (abstraction)', description:'Abstract away food + water logistics on Journeys — the engine stops tracking rations and never applies hunger or dehydration. RAW (strict ration tracking) is the default; this is the abstraction. Default off.' },
  // ----- Domain mechanics -----
  { id:'families-per-hex-tracking', category:'domain', name:'Families-per-hex tracking',
    source:'ACKS II RR (advanced granularity beyond RAW)',
    description:"ACKS RAW tracks land value per hex (each hex gets its own 3d3 roll at securing, RR p.339) but families at the DOMAIN level (RR p.340). By default, land revenue is therefore the domain family total × the average hex land value — which is RAW-exact for the single-hex and uniform-value domains RAW presents. This rule is a high-fidelity overlay BEYOND RAW: each hex tracks its own family count, and land revenue becomes the literal per-hex sum Σ(families-in-hex × hex value), which only matters for a mixed-value, multi-hex domain. Adds the per-hex families column; population growth distributes across hexes by capacity (Phase 2.5+ map mode)." },
  { id:'separating-land-and-lordship', category:'domain', name:'Separating land and lordship',
    source:'ACKS II RR p.355-ish (Phase 2/4 — not yet implemented)',
    description:"Splits domain ownership between a landowner (collects land + service revenue) and a governor (collects tax + tribute + urban revenue). When on, each domain can declare distinct landowner and governor character ids." },
  { id:'favor-duty-auto-roll', category:'domain', name:'Favors & Duties — auto-roll the monthly edict',
    source:'ACKS II RR pp.345–348 (RAW core; this toggle is a UX preference, not a RAW divergence)',
    default:true,
    description:"DEFAULT ON. Favors & Duties is RAW core: each month a vassal ruler rolls on the Favor/Duty table (RR p.348) for what his lord grants or demands. With this ON, the monthly turn auto-rolls one edict per active vassalage (recording a favorDutyObligation, applying the gp flows for Loan/Scutage/Gift, and firing the excess-duty Loyalty roll when the lord over-demands). When OFF, the engine never auto-generates edicts — the GM drives obligations by hand (Inspector Create) and resolves them in fiction. Either way the resulting obligation data is identical RAW; this only chooses who rolls the d20." },
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
  { id:'markets-load-metered-activity', category:'mercantile', name:'M&M — Load-metered market activity cost',
    source:'Of Markets & Merchandise p.15 (supplement)',
    description:"Refines the RAW market-transaction time cost. Core RR/JJ: buying/selling at a market is ONE ancillary activity (JJ Campaign-Activities list 'Buy equipment in the market', RR p.123; a 12+ party may instead devote a dedicated activity for double availability, RR p.124). With this rule ON, M&M p.15's load-metering applies — one ancillary covers up to a normal load (~5 st), and a bigger haul costs ⌈stone ÷ normal-load⌉ ancillary activities. Default OFF (supplement content, CLAUDE §6)." },
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
  // ----- Cost of Living (Phase 2.5 §16 — CoL-2 — 2026-06-08) -----
  { id:'living-expenses', category:'characters', name:'Living expenses (monthly cost of living)',
    source:'ACKS II RR p.173 (RAW marks it OPTIONAL; default-ON per community norm — honest gating, CLAUDE §6)',
    default:true,
    description:"DEFAULT ON. At the end of each game month, every self-supporting character pays living expenses equal to the henchman wage of their level (RR p.173 — 1→25 … 6→800 … 9→7,250 gp). You may dial a character's lifestyle target down on their sheet; actual spend = min(target, funds on hand), so short funds force a lower spend and there is no debt. Underspending lowers your APPARENT level to NPCs (RR p.170), which feeds the henchman hiring cap and loyalty. A liege also pays his henchmen's/specialists' monthly wages in the same pass (a vassal-ruling henchman whose domain income ≥ his wage owes nothing). Pay comes from the coin purse, or — for a ruler with 'pay keep from the domain treasury' set — from that treasury. When OFF, no monthly keep is charged and everyone is taken at their true level." },
  // ----- Hijinks (Phase 2.7) -----
  { id:'detailed-hijink-tracking', category:'hijinks', name:'Detailed hijink tracking',
    source:'ACKS II RR pp.360-370 (Phase 2.7 — not yet implemented)',
    description:"When off (default), syndicates abstract to the designer's-note shorthand. When on, every hijink is resolved per-attempt with proficiency bonuses, planning/laying-low timers, individual perpetrator state, and the full Crime and Punishment table." },
  // ----- Located inventory (Phase 2.95 Stash subsystem — 2026-05-29) -----
  // The Stash subsystem is always-on CORE as of v0.17.0 (2026-06-03): the master
  // `inventory-stash-system` toggle was removed (per Joachim — a located-inventory
  // discipline every table enforces anyway, and the engine depends on it). All wealth
  // (treasury, personal inventory, party loot, venture/adventure payouts) flows through
  // typed stash entities unconditionally; the Domain Treasury IS a stash subtype
  // (kind='domain-treasury') that transfers with the office on ruler succession.
  // The sub-toggles below only refine behavior — none gates the subsystem's existence.
  { id:'ignore-encumbrance', category:'characters', name:'Stash — Ignore carry encumbrance (GM simplification)',
    source:'ACKS II RR pp.83-84 (encumbrance is RAW; this opt-out is a deliberate GM simplification — §6 polarity)',
    description:"OFF by default = full RAW: each character's carry weight is computed and its load band shown — unencumbered ≤5 st (120'/turn, 24 mi/day) · lightly loaded ≤7 (90'/18) · heavily loaded ≤10 (60'/12) · severely loaded ≤20 (30'/6) · overloaded >20 (cannot move); coins weigh 1 stone per 1,000 (RR pp.83-84). Adds are never blocked — RAW lets you be overloaded, you just can't move. When ON, the GM opts to ignore encumbrance entirely (a table simplification): weight is not surfaced or tracked." },
  { id:'hidden-stashes', category:'characters', name:'Stash — Hidden caches + smuggling vaults',
    source:'ACKS II + Phase 2.7 Hijinks scope',
    description:"Allows stashes to be flagged isHidden=true (caches in the wilderness, smugglers' vaults, hidden temple coffers). Hidden stashes don't surface on hex detail by default; Phase 2.7 Spy hijinks can locate them via proficiency throw." },
  { id:'party-loot-split', category:'characters', name:'Stash — Party loot splits on withdraw',
    source:'ACKS II RR p.423 (XP threshold for divided treasure)',
    description:"When ON (RAW default), GP-threshold XP credit fires for a character when they withdraw their share from a party stash — the 'treasure is divided' moment. When OFF, party-stash deposits proportionally credit all members' GP threshold immediately on deposit (faster but more abstract)." },
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
  { id:'encounters',   label:'⚔ Encounters',       description:'Wilderness meetings — what survives them, settles as a lair, and takes up the hunt (Monster Persistence #476).' },
  { id:'rumors',       label:'🗣 Rumors',          description:"Manual rumor tracking, engine auto-emission, proliferation (Phase 2.8 / What's the Word)." },
  { id:'hijinks',      label:'🗡 Hijinks',         description:'Criminal syndicates, hijink resolution detail (Phase 2.7 — placeholders).' },
  { id:'cultural',     label:'🌍 Cultural',        description:'Slavery, dwarven/elven/beastman civilization supplements.' }
]);
function lookupHouseRule(id){ return HOUSERULES_REGISTRY.find(r => r.id === id) || null; }

// =============================================================================
// FAVORS & DUTIES (#230, F&D-1) — the monthly liege↔vassal obligation tables.
// Source: RR pp.345–348. The 1d20 Favor/Duty table (each entry's kind, favor/duty
// polarity, ongoing/one-time, and gp basis) + the muster-timing table by realm title.
// =============================================================================

// The 1d20 Favor/Duty table (RR p.348). Each entry covers a roll RANGE [min, max].
//   isFavor   — true = a favor the lord grants; false = a duty the lord demands.
//   isOngoing — true = recurs until revoked; false = one-time (offsets a duty only the month given).
//   gpBasis   — how the engine derives gpPerMonth: 'realm-families' (1gp × families in the vassal's
//               realm), 'monthly-tribute' (= the vassal's monthly tribute, for Construction),
//               or 'none' (no gp amount).
//   muster    — true for Call to Arms + Scutage: troops/funds arrive over three title-sized periods.
// The 9–12 'revocation' entry does NOT create an obligation — it revokes the vassal's most recent
// favor (on a 1d6 of 1) or duty (on 2–6); the roll orchestration handles it specially.
const FAVOR_DUTY_TABLE = Object.freeze([
  Object.freeze({ min:1,  max:1,  kind:'construction',        isFavor:false, isOngoing:true,  gpBasis:'monthly-tribute', muster:false,
    label:'Construction',
    summary:"Build bridges, roads, forts, towers, or vessels in the realm. Expend gp equal to the monthly tribute each month; auto-revokes once the vassal has spent 15,000gp per 6-mile hex in his realm." }),
  Object.freeze({ min:2,  max:2,  kind:'scutage',             isFavor:false, isOngoing:true,  gpBasis:'realm-families',  muster:true,
    label:'Scutage',
    summary:"A special tax of 1gp per family in the realm, paid monthly to the lord until revoked. Counts as garrison expense; the lord must spend it on troops or take −4 Loyalty. Not domain income for XP." }),
  Object.freeze({ min:3,  max:4,  kind:'call-to-council',     isFavor:false, isOngoing:true,  gpBasis:'none',            muster:false,
    label:'Call to Council',
    summary:"The vassal travels to the lord's domain to give judicial and managerial counsel until revoked. Rolled again, the lord also summons the vassal's henchmen." }),
  Object.freeze({ min:5,  max:6,  kind:'call-to-arms',        isFavor:false, isOngoing:true,  gpBasis:'realm-families',  muster:true,
    label:'Call to Arms',
    summary:"Muster an army with troop wages equal to 1gp per family in the realm, available to the lord until revoked. Can be imposed multiple times." }),
  Object.freeze({ min:7,  max:8,  kind:'loan',                isFavor:false, isOngoing:true,  gpBasis:'realm-families',  muster:false,
    label:'Loan',
    summary:"The lord demands a loan equal to 1gp per family in the realm. Repaid when revoked; otherwise the lord's CHA% chance of repayment each month. No interest. Can be imposed multiple times." }),
  Object.freeze({ min:9,  max:12, kind:'revocation',          isFavor:null,  isOngoing:false, gpBasis:'none',            muster:false,
    label:'Previous duty/favor revoked',
    summary:"The vassal loses his most recently granted favor (on a 1d6 of 1) or duty (on 2–6)." }),
  Object.freeze({ min:13, max:14, kind:'charter-of-monopoly', isFavor:true,  isOngoing:true,  gpBasis:'none',            muster:false,
    label:'Charter of Monopoly',
    summary:"A monopoly on a merchandise type in the realm: merchants trade 2× the normal volume and prices shift 1 step in the vassal's favor. Counts as ONE favor even across multiple merchandise types." }),
  Object.freeze({ min:15, max:16, kind:'gift',                isFavor:true,  isOngoing:false, gpBasis:'realm-families',  muster:false,
    label:'Gift',
    summary:"A gift worth at least 1gp per family in the realm (investments, festivals, treasure, warhorses, magic, etc.). Raises the vassal's domain income for XP and lowers the grantor's. A one-time favor." }),
  Object.freeze({ min:17, max:18, kind:'office',              isFavor:true,  isOngoing:true,  gpBasis:'none',            muster:false,
    label:'Office',
    summary:"A ceremonial office: +1 to Loyalty rolls by the officeholder's own vassals, and a senate seat in a senatorial realm (p.355). Bonus does not stack; each office is revoked separately." }),
  Object.freeze({ min:19, max:19, kind:'troops',              isFavor:true,  isOngoing:true,  gpBasis:'realm-families',  muster:false,
    label:'Troops',
    summary:"The lord stations a garrison (gp value at least 1gp per family) under the vassal's command; the vassal pays no wages. Usually counterbalanced by a demand for scutage." }),
  Object.freeze({ min:20, max:20, kind:'grant-of-land',       isFavor:true,  isOngoing:false, gpBasis:'none',            muster:false,
    label:'Grant of Land',
    summary:"A new domain (at least the size of the vassal's smallest sub-vassal domain, else 1 border hex), generated normally." })
]);

// Look up the Favor/Duty entry for a 1d20 roll (1..20).
function lookupFavorDuty(roll){
  const r = Number(roll) || 0;
  return FAVOR_DUTY_TABLE.find(e => r >= e.min && r <= e.max) || null;
}

// Muster-timing table (RR p.348) — the period unit is sized by the LORD's realm title.
const MUSTER_TIME_BY_TITLE = Object.freeze({
  emperor:'season', king:'season', prince:'month', duke:'month',
  count:'week', viscount:'week', baron:'week'
});

// Split a muster (troops or scutage funds) over the three title-sized periods (RR p.348):
// ½ (rounded up) in period 1, ¼ (rounded down, min 1) in period 2, the remainder in period 3.
// Returns { unit, total, periods:[{period, unit, amount}×3] }. Defensively clamps so the three
// amounts always sum to the total (the "min 1" can't apply when nothing is left).
function musterSchedule(title, totalAmount){
  const unit = MUSTER_TIME_BY_TITLE[String(title || '').toLowerCase()] || 'week';
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  const p1 = Math.ceil(total / 2);
  const quarter = total > 0 ? Math.max(1, Math.floor(total / 4)) : 0;
  const p2 = Math.min(Math.max(0, total - p1), quarter);
  const p3 = total - p1 - p2;
  return Object.freeze({
    unit, total,
    periods: Object.freeze([
      Object.freeze({ period:1, unit, amount:p1 }),
      Object.freeze({ period:2, unit, amount:p2 }),
      Object.freeze({ period:3, unit, amount:p3 })
    ])
  });
}

// Best-effort realm title for a domain (for muster timing). Reads the domain's free-text tags
// (and name as a fallback) for one of the seven titles; a March/Marquis maps to Count (a frontier
// county-equivalent). Defaults to 'baron' (the fastest muster) when nothing matches — titles are
// not a canonical field, so this is a sensible default the GM can override on the obligation.
const _TITLE_WORDS = Object.freeze([
  ['emperor','emperor'], ['empress','emperor'], ['imperial','emperor'],
  ['king','king'], ['queen','king'], ['kingdom','king'], ['royal','king'],
  ['prince','prince'], ['princess','prince'], ['principality','prince'],
  ['duke','duke'], ['duchess','duke'], ['duchy','duke'], ['archduke','duke'],
  ['marquis','count'], ['marquess','count'], ['marchioness','count'], ['margrave','count'], ['march','count'], ['marquisate','count'],
  ['count','count'], ['countess','count'], ['county','count'], ['earl','count'],
  ['viscount','viscount'], ['viscountess','viscount'],
  ['baron','baron'], ['baroness','baron'], ['barony','baron']
]);
function realmTitleForDomain(domain){
  if(!domain) return 'baron';
  const hay = []
    .concat(Array.isArray(domain.tags) ? domain.tags : [])
    .concat([domain.name || ''])
    .join(' ')
    .toLowerCase();
  for(const [word, title] of _TITLE_WORDS){ if(hay.includes(word)) return title; }
  return 'baron';
}

// Construction-duty structure types the liege may order (RR p.348: "bridges, roads, forts, towers,
// or other structures … If a littoral domain … vessels"). `littoralOnly` types are offered only when
// the vassal domain touches water (isLittoralDomain). The detailed per-type cost model is part of the
// future full Construction subsystem (Architecture §10); the F&D-7 liege side uses the RAW 15,000gp /
// 6-mile hex target (constructionDutyTargetGp), so `type` here is the *kind* of work, not a price.
const CONSTRUCTION_DUTY_TYPES = Object.freeze([
  // 'generic' = RR p.348 "or other structures somewhere within his realm" — no specific hex/type; its
  // target is the realm-wide cap (15,000gp × realm hexes). Handled specially (no hexId; one per duty).
  Object.freeze({ value:'generic',   label:'Any construction (anywhere in the realm)', generic:true }),
  Object.freeze({ value:'bridge',    label:'Bridge' }),
  Object.freeze({ value:'road',      label:'Road' }),
  Object.freeze({ value:'fort',      label:'Fort' }),
  Object.freeze({ value:'tower',     label:'Tower' }),
  Object.freeze({ value:'structure', label:'Other structure' }),
  Object.freeze({ value:'vessel',    label:'Vessel', littoralOnly:true })
]);
function constructionDutyTypeLabel(value){
  const e = CONSTRUCTION_DUTY_TYPES.find(t => t.value === value);
  return e ? e.label : (value || '');
}

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

// Monthly wage by class level (RR p.168) — the COMPLETE table, levels 0–14. The HIRELING_HENCHMEN
// catalog above carries only 0–4 (the hirable band on the market); this full table drives two CoL-2
// flows: (a) a liege's monthly henchman-wage outflow, and (b) the Living Expenses rule (RR p.173 —
// "an adventurer's expected living expenses each month are equal to the wages of a henchman of the
// same level"). gp/month.
const LEVEL_MONTHLY_WAGE = Object.freeze({
  0:12, 1:25, 2:50, 3:100, 4:200, 5:400, 6:800, 7:1600,
  8:3000, 9:7250, 10:12000, 11:32000, 12:50000, 13:135000, 14:350000
});
// Monthly wage for a class level (RR p.168). Clamps to [0,14] (RAW tops out at 14).
function levelMonthlyWage(level){
  const L = Math.max(0, Math.min(14, Math.floor(Number(level) || 0)));
  return LEVEL_MONTHLY_WAGE[L];
}
// The apparent social level a monthly living spend buys (RR p.173): the highest level whose wage the
// character actually pays for. spend ≥ wage(14) → 14; spend < wage(0)=12 → 0 (seen as a destitute commoner).
function effectiveSocialLevelForSpend(spend){
  const s = Math.max(0, Number(spend) || 0);
  let lvl = 0;
  for(let L = 0; L <= 14; L++){ if(LEVEL_MONTHLY_WAGE[L] <= s) lvl = L; else break; }
  return lvl;
}

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

// =============================================================================
// Phase 2.5 Journeys (#475) — overland travel catalogs (J1). RAW: RR ch.6
// Wilderness Expeditions (pp.272-279) + JJ ch.3 (pp.84-95). Sea/air reserved.
// =============================================================================

// Hex is 6 miles across; a typical unencumbered foot party makes 24 mi/day
// (RR p.272 expedition-speed table, 120'/turn row → 24 mi/day → 4 six-mile hexes).
const JOURNEY_MILES_PER_HEX = 6;
const JOURNEY_BASE_SPEED_MILES_PER_DAY = 24;

// Terrain speed multipliers (RR p.272). Applied to the base expedition speed. Base scrubland
// (sparse/savannah) and swamp (marshy) carry the easy navigation throw; the harder RAW
// sub-types 'scrubland-dense' and 'swamp-forested' share the same SPEED but a worse nav target
// (see JOURNEY_NAV_THROWS). 'road-driving' is the x2 road rate for a wheeled vehicle handled
// with the Driving proficiency (RR p.272); selected once vehicle modes land.
const JOURNEY_TERRAIN_SPEED = Object.freeze({
  grassland: 1, scrubland: 1, 'scrubland-dense': 1, plains: 1,
  barrens: 2/3, desert: 2/3, hills: 2/3, forest: 2/3,
  jungle: 1/2, mountains: 1/2, mountain: 1/2, swamp: 1/2, 'swamp-forested': 1/2,
  road: 3/2, 'road-driving': 2
});

// Navigation throw target by terrain (RR p.275). The party's best Navigation / Pathfinding
// proficiency adds a bonus; rolled secretly on the party's behalf. RAW splits two terrains by
// density: scrubland low/sparse 6+ vs high/dense 8+; swamp marshy 10+ vs forested 14+. The
// bare 'scrubland'/'swamp' keys are the easy sub-type; '-dense'/'-forested' are the hard one.
const JOURNEY_NAV_THROWS = Object.freeze({
  barrens: 6, desert: 6, grassland: 6, mountains: 6, mountain: 6, scrubland: 6, plains: 6,
  forest: 8, hills: 8, 'scrubland-dense': 8,
  swamp: 10,
  jungle: 14, 'swamp-forested': 14
});

// Weather speed multiplier (RR pp.277-278 / JJ p.38 "Weathering the Wild"). Per RAW the
// expedition-speed *halving* conditions are exactly Frigid/Foggy/Muddy/Snowy/Sweltering, so
// only foggy + snowy halve here (temperature frigid/sweltering + ground mud/snow are separate
// axes, below). Rain and STORMY do NOT reduce base travel speed — "stormy" is a JJ activity-
// penalty condition, and no RAW weather imposes ×1/4 (the prior ×1/4 was unsupported).
const JOURNEY_WEATHER_SPEED = Object.freeze({
  fair: 1, drizzly: 1, flurry: 1, sunbaked: 1, rainy: 1, stormy: 1,
  foggy: 1/2, snowy: 1/2
});

// Temperature speed multiplier (RR pp.277-278). Frigid (<=0F) and Sweltering (>=95F) each
// halve expedition speed; the temperate bands don't slow travel. Read from the day's
// weather.temperature, independent of the precipitation condition above.
const JOURNEY_TEMPERATURE_SPEED = Object.freeze({
  frigid: 1/2, cold: 1, moderate: 1, sweltering: 1/2
});

// Ground-condition speed multiplier (RR p.272 "Mud/Snow x1/2"). A separate x1/2 that COMPOUNDS
// on top of terrain - mud (from sustained rain) or snow underfoot. GM-set per hex via
// hex.groundCondition; defaults to 'clear'. (Auto-accumulation from multi-day weather is a
// later weather-secondary-effects slice; this exposes the RAW modifier now.)
const JOURNEY_GROUND_SPEED = Object.freeze({
  clear: 1, mud: 1/2, snow: 1/2
});

// Pace multipliers - RAW's three overland paces (RR p.272). normal = expedition speed as the
// dedicated activity (4 ancillaries free); forced-march = +50% but fatigued at once (RR p.279)
// and no ancillaries; half-speed = travel as four ancillary activities (RAW gives it no name).
// 'halted' (×0) is not a RAW pace — it is the engine's "the day's activities leave no room to
// travel" state (the activity budget caps the party at it; Joachim 2026-06-05). 0 miles that day.
const JOURNEY_PACE_SPEED = Object.freeze({
  'forced-march': 3/2, 'normal': 1, 'half-speed': 1/2, 'halted': 0
});

// Survival (RR p.275): one ration = 1 stone = 2 lb food + 1 gallon water per person per day.
const JOURNEY_RATION_PER_PERSON_DAY = 1;       // food rations
const JOURNEY_WATER_PER_PERSON_DAY  = 1;       // water rations
// Low-stock warning when fewer than this many person-days of stores remain.
const JOURNEY_SUPPLY_LOW_DAYS = 3;

// Fatigue (JJ p.84): six game days of strenuous activity without a rest day makes a
// party fatigued. A seventh strenuous day forces a rest (which resets the counter).
const JOURNEY_FATIGUE_CYCLE_DAYS = 6;

// =============================================================================
// Activity Budget (#346) — the per-character daily activity allocation.
// Source: JJ pp.99–100 + RR p.272 (the activity budget: dedicated / ancillary /
// incidental — 1 dedicated + 4 ancillary, OR up to 12 ancillary) + RR p.279 (the
// strenuous-day → rest fatigue cycle). Canonical RAW home: Adventuring_Cadence_RAW_Survey.md §4.
// Plan: Phase_2.95_Activity_Budget_Plan.md (AB-1). Doctrine: Architecture.md §3.13
// (derive-don't-store) + §7 (the actor-time stack).
// =============================================================================

// The daily budget. A character's day holds ONE dedicated (8-hour) task, and alongside
// it up to 4 ancillary (~1-hour) errands — OR, with no dedicated task at all, up to 12
// ancillary errands. Incidental acts cost ~no time and are uncounted.
const ACTIVITY_BUDGET = Object.freeze({
  dedicatedPerDay: 1,
  ancillaryPerDedicatedDay: 4,   // ancillary errands alongside a dedicated task
  ancillaryMaxPerDay: 12         // ancillary errands on a day with no dedicated task
});

// The activity-cost catalog: activity-kind → its budget cost. `cost` is the slot it
// consumes (dedicated / ancillary / incidental); `strenuous` feeds the RR p.279 six-day
// fatigue cycle; `lifecycle` notes whether it spans days (ongoing) or is a one-day act
// (singular). `loadMetered` flags an ancillary whose *count* CAN scale with the stone hauled
// — but only when the `markets-load-metered-activity` house rule is ON (M&M p.15, a supplement
// refinement, default OFF per CLAUDE §6). The RAW DEFAULT is a flat ONE ancillary per market
// transaction (JJ Campaign-Activities list "Buy equipment in the market", RR p.123); the actual
// per-transaction cost is computed dynamically in `_marketActivityCost` (acks-engine-events.js),
// not read off this flag. The mapping is reference data transcribed from the surveys (the canonical homes:
// Adventuring_Cadence_RAW_Survey.md §4 + Settlement_Activities_RAW_Survey.md §4); each
// character-engaging subsystem declares its kind here as part of its delivery
// (Architecture.md §3.11 contributor mandate, extended by the budget plan §8). Entries
// past the shipped readers (journeys, magistracies) are reserved homes for AB-4 contributors.
const ACTIVITY_COSTS = Object.freeze({
  // Travel + rest — shipped (Journeys). Travel dedicates the 8-hour block and is strenuous.
  'travel':                   { cost:'dedicated',  strenuous:true,  lifecycle:'ongoing',  label:'Travel' },
  'rest':                     { cost:'dedicated',  strenuous:false, lifecycle:'singular', label:'Rest (clears fatigue)' },
  // Domain rule.
  'domain-admin':             { cost:'dedicated',  strenuous:false, lifecycle:'ongoing',  label:'Administer domain' },
  'decree':                   { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Issue a decree' },
  // Mercantile.
  'venture':                  { cost:'dedicated',  strenuous:false, lifecycle:'ongoing',  label:'Mercantile venture' },
  'market-transaction':       { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Buy / sell at market', loadMetered:true },
  // Construction supervision (Plan §13 — dedicated-ongoing; reader wires at AB-4).
  'construction-supervision': { cost:'dedicated',  strenuous:false, lifecycle:'ongoing',  label:'Supervise construction' },
  // #476 Encounter layer E1 — an influence attempt's time on the RAW ladder (RR p.286: the 3rd
  // attempt = 1 hour, the 4th = a work-day, the 5th+ = 5 work-days; the event's payload slot
  // carries the per-attempt cost — this entry is the kind's label/fallback).
  'encounter-influence':      { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Parley — influence reaction' },
  // Hiring — soliciting for hirelings is an ANCILLARY, ONGOING activity (RR p.164: "These count as
  // ancillary activities"), one per day per hireling type while the patron is in the market.
  'recruit':                  { cost:'ancillary',  strenuous:false, lifecycle:'ongoing',  label:'Solicit hirelings' },
  // Wilderness errands (RR p.272).
  'forage':                   { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Forage' },
  'hunt':                     { cost:'dedicated',  strenuous:true,  lifecycle:'singular', label:'Hunt' },
  'search-hex':               { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Search a hex' },
  'track':                    { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Track a trail' },
  // Reserved homes for their subsystems (so contributors have a place; readers wire in at AB-4).
  'hijink-plan':              { cost:'ancillary',  strenuous:false, lifecycle:'ongoing',  label:'Plan a hijink' },
  'hijink-perpetrate':        { cost:'dedicated',  strenuous:true,  lifecycle:'ongoing',  label:'Perpetrate a hijink' },
  'delve':                    { cost:'ancillary',  strenuous:true,  lifecycle:'singular', label:'Delve (per six turns)' },
  'research':                 { cost:'dedicated',  strenuous:false, lifecycle:'ongoing',  label:'Magic research' },
  'pray':                     { cost:'ancillary',  strenuous:false, lifecycle:'singular', label:'Pray' },
  'sacrifice':                { cost:'dedicated',  strenuous:false, lifecycle:'singular', label:'Sacrifice' }
});

// Look up an activity's budget cost. Unknown kinds default to a single ancillary errand
// (the safe "an errand of unknown size" assumption) flagged `defaulted` so callers / tests
// can see it wasn't a catalogued kind.
function activityCostFor(kind){
  const e = ACTIVITY_COSTS[kind];
  if(e) return e;
  return { cost:'ancillary', strenuous:false, lifecycle:'singular', label: String(kind || 'activity'), defaulted:true };
}

// =============================================================================
// #476 M4 — Wilderness Search target by expedition movement (RR p.276 "Searching the Wild").
// The RAW table runs 18+ at ≤11 mi/day down one step per 12-mile band to 2+ at ≥192 — exactly
// 18 − ⌊mpd/12⌋ clamped to [2,18] (verified against every row + the RAW worked example:
// 32 mi/day → 16+). Speed = the party's expedition movement: slowest member's encumbrance
// mi/day × the searched hex's terrain multiplier (the same factors travel uses).
// =============================================================================
function wildernessSearchTargetForSpeed(milesPerDay){
  const mpd = Math.max(0, Number(milesPerDay) || 0);
  return Math.max(2, Math.min(18, 18 - Math.floor(mpd / 12)));
}

// =============================================================================
// Retail Item Trade (#346 flagship / Phase_2.9_Item_Trade_Plan.md IT-1) — the
// Equipment Availability by Market Class matrix + the availability helpers.
// Source: RR pp.123–124 (Equipment Availability + Purchasing) + RR p.43 (Mercantile
// Network, the Venturer class power: a venturer treats a market they've previously entered as
// one class larger). The equipment price *catalog* (RR pp.126–137) is a
// separate, larger table; v1 leans on a generic-by-price path so any item transacts off
// its list price without the full chapter (CLAUDE §13.6). The transaction verb
// (marketBuy / marketSell) lands at IT-2.
// =============================================================================

// Equipment Availability by Market Class (RR p.124). Keyed to the item's list-price band;
// a cell is the number of units of THAT specific item available per party, per market, per
// month. A cell given as a percent string ('25%') is the chance of ONE unit being present
// that month; null = none ('—' in RAW). Verified against both RR p.124 worked examples
// (a 700 gp heavy warhorse = 1 in Class III, 25% in Class IV; a Class III market stocks
// 425 / 35 / 2 / 1 / — / 3% down the six bands). 36 mechanical values — a code table, not a
// reproduced chapter. Market-class index: 0 = Class I … 5 = Class VI.
const EQUIPMENT_AVAILABILITY = Object.freeze({
  // Bands ordered ascending by upper bound (gp); a price falls in the first band whose maxGp ≥ it.
  bands: Object.freeze([
    Object.freeze({ maxGp: 1,        label:'≤ 1 gp',           cells: Object.freeze([2750, 700, 425, 100, 35, 15]) }),
    Object.freeze({ maxGp: 10,       label:'2–10 gp',          cells: Object.freeze([300, 70, 35, 10, 3, 1]) }),
    Object.freeze({ maxGp: 100,      label:'11–100 gp',        cells: Object.freeze([20, 5, 2, 1, '25%', '10%']) }),
    Object.freeze({ maxGp: 1000,     label:'101–1,000 gp',     cells: Object.freeze([7, 2, 1, '25%', '10%', '5%']) }),
    Object.freeze({ maxGp: 10000,    label:'1,001–10,000 gp',  cells: Object.freeze([2, 1, '25%', '10%', '5%', '1%']) }),
    Object.freeze({ maxGp: Infinity, label:'≥ 10,001 gp',      cells: Object.freeze(['25%', '10%', '3%', '1%', null, null]) })
  ])
});

// Pick the price band for a list price (gp).
function equipmentPriceBand(listPriceGp){
  const p = Number(listPriceGp) || 0;
  const bands = EQUIPMENT_AVAILABILITY.bands;
  return bands.find(b => p <= b.maxGp) || bands[bands.length - 1];
}

// Equipment availability for (list price gp, market-class index 0–5), with the RAW modifiers.
// Returns { kind:'count'|'chance'|'none', count, percent, band, marketClassIdx }.
//   opts.visitedBefore      → treat the market as one class higher (RR p.43 Mercantile Network — the
//                             Venturer class power; the wizard gates this to venturers, hasMercantileNetwork).
//   opts.partyOf12Dedicated → ×2 availability for a 12+ party spending the dedicated activity (RR p.124).
//   opts.multiParty         → the campaign-wide monthly ceiling is 10× the listed value (RR p.124).
// A 'count' cell is the deterministic number stocked; a 'chance' cell is a per-unit % chance of a
// single unit (roll it with rollEquipmentUnitsAvailable). Modifiers compose; for a chance cell only
// partyOf12Dedicated applies (doubles the percent, capped at 100) — the 10× ceiling is a count notion.
function equipmentAvailability(listPriceGp, marketClassIdx, opts){
  opts = opts || {};
  let idx = Number(marketClassIdx) || 0;
  if(opts.visitedBefore) idx = Math.max(0, idx - 1);      // one class higher = lower index
  if(idx < 0) idx = 0;
  if(idx > 5) idx = 5;
  const band = equipmentPriceBand(listPriceGp);
  const cell = band.cells[idx];
  if(cell == null) return { kind:'none', count:0, percent:0, band: band.label, marketClassIdx: idx };
  if(typeof cell === 'number'){
    let count = cell;
    if(opts.partyOf12Dedicated) count *= 2;
    if(opts.multiParty) count *= 10;
    return { kind:'count', count, percent:100, band: band.label, marketClassIdx: idx };
  }
  // chance string, e.g. '25%'
  let percent = parseInt(String(cell), 10) || 0;
  if(opts.partyOf12Dedicated) percent = Math.min(100, percent * 2);
  return { kind:'chance', count:1, percent, band: band.label, marketClassIdx: idx };
}

// Roll the units actually present this month for (list price, market class). A 'count' cell is
// deterministic; a 'chance' cell rolls per-unit (a single d% for its one unit). Mirrors the
// percent-single path in rollAvailabilitySpecDetailed.
function rollEquipmentUnitsAvailable(listPriceGp, marketClassIdx, opts, rng){
  rng = rng || Math.random;
  const a = equipmentAvailability(listPriceGp, marketClassIdx, opts);
  if(a.kind === 'none') return 0;
  if(a.kind === 'count') return a.count;
  const r = Math.floor(rng() * 100) + 1;      // chance: one unit gated by a d% roll
  return (r <= a.percent) ? 1 : 0;
}

// Equipment price catalog (RR pp.126–130) — transcribed from the clean markdown rulebook
// (`ACKS Sources/ACKS_Revised_Rulebook.md`, whose linear per-item structure reads reliably) and
// **cross-checked against the PDF**: the raw reading-order `pdftotext` extract reproduces the same
// item→cost order, and the rulebook's own prose (RR p.124) confirms a heavy warhorse is 315 gp.
// (An earlier bulk `-layout` PDF extract column-drifted — it mis-read a goat as 2,000 gp and a
// crowbar as 15 stone; that artifact is gone here.) Comprehensive across the adventuring categories
// (weapon · ammunition · armor · gear · mount/livestock); pure-flavor rows (the 14 herbs, foodstuffs,
// most clothing, prosthetics, treatises, barding — "Varies") are intentionally omitted, since the
// transaction verb also takes a generic-by-price line ({ name, listPriceGp, stone }) so ANY item
// transacts off its list price — the catalogue is a convenience lookup, never a gate (CLAUDE §13.6).
// Encumbrance per RR p.127: most small/medium weapons = 1/6 st, large = 1 st; mounts/livestock are
// led, not carried (stone:null). Sub-gp prices stored as gp decimals (1 sp = 0.1 gp, 1 cp = 0.01 gp).
//   { id, name, category, listPriceGp, stone, raw }.
// NB the RR p.124 *availability* worked example prices the heavy warhorse at 700 gp (a rulebook
// internal inconsistency vs the 315 gp equipment-list price); both land in the 101–1,000 gp band,
// so equipmentAvailability() is identical either way — the catalog uses the list price (315). The
// r4 RR major errata does NOT address this (checked 2026-06-04 — it fixes an adjacent p.130 price,
// olive oil, but leaves the warhorse discrepancy), so 315 stands as the canonical list price.
const EQUIPMENT_CATALOG = Object.freeze([
  // ── Weapons (RR pp.126–127) ──
  { id:'dagger',           name:'Dagger',              category:'weapon', listPriceGp:3,   stone:1/6, raw:'RR p.126' },
  { id:'silver-dagger',    name:'Silver Dagger',       category:'weapon', listPriceGp:30,  stone:1/6, raw:'RR p.126' },
  { id:'knife',            name:'Knife',               category:'weapon', listPriceGp:1,   stone:1/6, raw:'RR p.126' },
  { id:'short-sword',      name:'Short Sword',         category:'weapon', listPriceGp:7,   stone:1/6, raw:'RR p.126' },
  { id:'sword',            name:'Sword',               category:'weapon', listPriceGp:10,  stone:1/6, raw:'RR p.126' },
  { id:'two-handed-sword', name:'Two-Handed Sword',    category:'weapon', listPriceGp:15,  stone:1,   raw:'RR p.126' },
  { id:'battle-axe',       name:'Battle Axe',          category:'weapon', listPriceGp:7,   stone:1/6, raw:'RR p.126' },
  { id:'great-axe',        name:'Great Axe',           category:'weapon', listPriceGp:10,  stone:1,   raw:'RR p.126' },
  { id:'hand-axe',         name:'Hand Axe',            category:'weapon', listPriceGp:4,   stone:1/6, raw:'RR p.126' },
  { id:'mace',             name:'Mace',                category:'weapon', listPriceGp:5,   stone:1/6, raw:'RR p.126' },
  { id:'morning-star',     name:'Morning Star',        category:'weapon', listPriceGp:10,  stone:1,   raw:'RR p.126' },
  { id:'warhammer',        name:'Warhammer',           category:'weapon', listPriceGp:5,   stone:1/6, raw:'RR p.126' },
  { id:'flail',            name:'Flail',               category:'weapon', listPriceGp:5,   stone:1/6, raw:'RR p.126' },
  { id:'club',             name:'Club',                category:'weapon', listPriceGp:1,   stone:1/6, raw:'RR p.126' },
  { id:'staff',            name:'Staff',               category:'weapon', listPriceGp:1,   stone:1,   raw:'RR p.126' },
  { id:'spear',            name:'Spear',               category:'weapon', listPriceGp:3,   stone:1,   raw:'RR p.126' },
  { id:'polearm',          name:'Polearm',             category:'weapon', listPriceGp:7,   stone:1,   raw:'RR p.126' },
  { id:'lance',            name:'Lance',               category:'weapon', listPriceGp:5,   stone:1,   raw:'RR p.126' },
  { id:'javelin',          name:'Javelin',             category:'weapon', listPriceGp:1,   stone:1/6, raw:'RR p.126' },
  { id:'dart-5',           name:'Dart (5)',            category:'weapon', listPriceGp:2,   stone:1/6, raw:'RR p.126' },
  { id:'bola',             name:'Bola',                category:'weapon', listPriceGp:5,   stone:1/6, raw:'RR p.126' },
  { id:'sling',            name:'Sling',               category:'weapon', listPriceGp:2,   stone:1/6, raw:'RR p.126' },
  { id:'staff-sling',      name:'Staff Sling',         category:'weapon', listPriceGp:3,   stone:1,   raw:'RR p.126' },
  { id:'short-bow',        name:'Short Bow',           category:'weapon', listPriceGp:3,   stone:1/6, raw:'RR p.126' },
  { id:'long-bow',         name:'Long Bow',            category:'weapon', listPriceGp:7,   stone:1,   raw:'RR p.126' },
  { id:'composite-bow',    name:'Composite Bow',       category:'weapon', listPriceGp:40,  stone:1,   raw:'RR p.126' },
  { id:'crossbow',         name:'Crossbow',            category:'weapon', listPriceGp:30,  stone:1/6, raw:'RR p.126' },
  { id:'arbalest',         name:'Arbalest',            category:'weapon', listPriceGp:50,  stone:1,   raw:'RR p.126' },
  { id:'whip',             name:'Whip',                category:'weapon', listPriceGp:5,   stone:1/6, raw:'RR p.126' },
  { id:'net',              name:'Net',                 category:'weapon', listPriceGp:1,   stone:1,   raw:'RR p.126' },
  { id:'sap',              name:'Sap',                 category:'weapon', listPriceGp:1,   stone:1/6, raw:'RR p.126' },
  { id:'cestus',           name:'Cestus',              category:'weapon', listPriceGp:3,   stone:1/6, raw:'RR p.126' },
  // ── Ammunition (RR p.126) ──
  { id:'quiver-20-arrows', name:'Quiver, 20 Arrows',   category:'ammunition', listPriceGp:1, stone:1/6, raw:'RR p.126' },
  { id:'case-20-bolts',    name:'Case, 20 Bolts',      category:'ammunition', listPriceGp:2, stone:1/6, raw:'RR p.126' },
  { id:'silver-arrow',     name:'Silver Arrow',        category:'ammunition', listPriceGp:5, stone:1/6, raw:'RR p.126' },
  // ── Armor (RR p.128 — AC value equals encumbrance in stone) ──
  { id:'hide-fur-armor',   name:'Hide & Fur Armor',    category:'armor', listPriceGp:10,  stone:1,   raw:'RR p.128' },
  { id:'padded-armor',     name:'Padded Armor',        category:'armor', listPriceGp:10,  stone:1,   raw:'RR p.128' },
  { id:'leather-armor',    name:'Leather Armor',       category:'armor', listPriceGp:20,  stone:2,   raw:'RR p.128' },
  { id:'ring-mail',        name:'Ring Mail',           category:'armor', listPriceGp:30,  stone:3,   raw:'RR p.128' },
  { id:'scale-armor',      name:'Scale Armor',         category:'armor', listPriceGp:30,  stone:3,   raw:'RR p.128' },
  { id:'chain-mail',       name:'Chain Mail Armor',    category:'armor', listPriceGp:40,  stone:4,   raw:'RR p.128' },
  { id:'laminated-linen',  name:'Laminated Linen Armor',category:'armor', listPriceGp:40, stone:4,   raw:'RR p.128' },
  { id:'banded-plate',     name:'Banded Plate Armor',  category:'armor', listPriceGp:50,  stone:5,   raw:'RR p.128' },
  { id:'lamellar-armor',   name:'Lamellar Armor',      category:'armor', listPriceGp:50,  stone:5,   raw:'RR p.128' },
  { id:'plate-armor',      name:'Plate Armor',         category:'armor', listPriceGp:60,  stone:6,   raw:'RR p.128' },
  { id:'shield',           name:'Shield',              category:'armor', listPriceGp:10,  stone:1,   raw:'RR p.128' },
  { id:'shield-mirror',    name:'Shield, Mirror',      category:'armor', listPriceGp:250, stone:1,   raw:'RR p.128' },
  { id:'helmet-heavy',     name:'Helmet, Heavy',       category:'armor', listPriceGp:20,  stone:1/6, raw:'RR p.128' },
  // ── Adventuring gear (RR p.129) ──
  { id:'backpack',         name:'Backpack',            category:'gear', listPriceGp:2,    stone:1/6, raw:'RR p.129' },
  { id:'rope-50',          name:"Rope, 50'",           category:'gear', listPriceGp:1,    stone:1,   raw:'RR p.129' },
  { id:'torches-6',        name:'Torches (6)',         category:'gear', listPriceGp:0.1,  stone:1,   raw:'RR p.129' },
  { id:'lantern',          name:'Lantern',             category:'gear', listPriceGp:10,   stone:1,   raw:'RR p.129' },
  { id:'oil-common',       name:'Oil, Common (1 pint)',category:'gear', listPriceGp:0.3,  stone:1/6, raw:'RR p.129' },
  { id:'oil-military',     name:'Oil, Military (1 pint)',category:'gear', listPriceGp:2,  stone:1/6, raw:'RR p.129' },
  { id:'waterskin',        name:'Waterskin',           category:'gear', listPriceGp:0.6,  stone:1/6, raw:'RR p.129', waterCapacityDays:1/5 },  // 25 oz = 1/5 gallon = 1/5 day (RR p.148)
  { id:'iron-spikes-6',    name:'Iron Spikes (6)',     category:'gear', listPriceGp:1,    stone:1/6, raw:'RR p.129' },
  { id:'grappling-hook',   name:'Grappling Hook',      category:'gear', listPriceGp:25,   stone:1/6, raw:'RR p.129' },
  { id:'crowbar',          name:'Crowbar',             category:'gear', listPriceGp:1,    stone:1/6, raw:'RR p.129' },
  { id:'thieves-tools',    name:"Thieves' Tools",      category:'gear', listPriceGp:25,   stone:1/6, raw:'RR p.129' },
  { id:'thieves-tools-expanded', name:"Thieves' Tools, Expanded", category:'gear', listPriceGp:200,  stone:1/6, raw:'RR p.129' },
  { id:'thieves-tools-superior', name:"Thieves' Tools, Superior", category:'gear', listPriceGp:1600, stone:1/6, raw:'RR p.129' },
  { id:'holy-water',       name:'Holy Water (1 pint)', category:'gear', listPriceGp:25,   stone:1/6, raw:'RR p.129' },
  { id:'holy-symbol',      name:'Holy Symbol',         category:'gear', listPriceGp:25,   stone:1/6, raw:'RR p.129' },
  { id:'holy-book',        name:'Holy Book',           category:'gear', listPriceGp:20,   stone:1/2, raw:'RR p.129' },
  { id:'spell-book-blank', name:'Spell Book (blank)',  category:'gear', listPriceGp:20,   stone:1/2, raw:'RR p.129' },
  { id:'tent-small',       name:'Tent, Small',         category:'gear', listPriceGp:3,    stone:1,   raw:'RR p.129' },
  { id:'tent-large',       name:'Tent, Large',         category:'gear', listPriceGp:20,   stone:4,   raw:'RR p.129' },
  { id:'tinderbox',        name:'Tinderbox (flint & steel)', category:'gear', listPriceGp:0.8, stone:1/6, raw:'RR p.129' },
  { id:'mirror-steel',     name:'Mirror (hand-sized, steel)', category:'gear', listPriceGp:5, stone:1/6, raw:'RR p.129' },
  { id:'lock',             name:'Lock',                category:'gear', listPriceGp:20,   stone:1/6, raw:'RR p.129' },
  { id:'manacles',         name:'Manacles',            category:'gear', listPriceGp:2,    stone:1/6, raw:'RR p.129' },
  { id:'craftsmans-tools', name:"Craftsman's Tools",   category:'gear', listPriceGp:25,   stone:1,   raw:'RR p.129' },
  { id:'saddle-riding',    name:'Saddle and Tack, Riding',   category:'gear', listPriceGp:10, stone:1,   raw:'RR p.129' },
  { id:'saddle-military',  name:'Saddle and Tack, Military', category:'gear', listPriceGp:25, stone:1,   raw:'RR p.129' },
  { id:'saddle-draft',     name:'Saddle and Tack, Draft',    category:'gear', listPriceGp:5,  stone:1,   raw:'RR p.129' },
  { id:'saddlebag',        name:'Saddlebag',           category:'gear', listPriceGp:5,    stone:1/6, raw:'RR p.129' },
  // ── Provisions (RR pp.131–133, p.278 — Phase 2.5 Provisioning) ──
  // Range-priced (Provisioning §2.1 / decision §14.1): RAW gives ration prices as a BAND (grade/market
  // variation) with no mechanic to collapse it, so the catalog carries priceMinGp/priceMaxGp; the
  // buyer picks the grade (default the low/common end = listPriceGp), and the RR p.124 availability
  // lookup runs off the chosen price. listPriceGp = the common-end default so existing price/availability
  // code keeps working unchanged. The week-pack is the expedition staple (1 st ≈ 7 person-day rations =
  // food 1/6 st/day + water carried separately). Iron keeps; Standard is perishable (spoilage deferred).
  { id:'rations-iron-week',     name:'Rations, Iron (one week)',     category:'gear', listPriceGp:1,    priceMinGp:1,    priceMaxGp:6, stone:1,  raw:'RR p.131', rationType:'iron'     },
  { id:'rations-standard-week', name:'Rations, Standard (one week)', category:'gear', listPriceGp:0.35, priceMinGp:0.35, priceMaxGp:3, stone:1,  raw:'RR p.131', rationType:'standard' },
  { id:'barrel-20gal',          name:'Barrel (20 gallon)',           category:'gear', listPriceGp:0.3,  stone:15, raw:'RR p.133', waterCapacityDays:20 },  // bulk water container = 20 days
  // Animal Feed (RR p.130) — mount fodder; per lb (1 st ≈ 10 lb from the 2 sp/st travel rate). Consumed
  // only by the deferred Mounts wave (V6); listed now so the catalog is complete.
  { id:'animal-feed-superior',  name:'Animal Feed, Superior (1 lb)', category:'gear', listPriceGp:0.02, stone:0.1, raw:'RR p.130' },
  { id:'animal-feed-inferior',  name:'Animal Feed, Inferior (1 lb)', category:'gear', listPriceGp:0.01, stone:0.1, raw:'RR p.130' },
  // ── Mounts & livestock (RR p.130 — led, not carried; stone:null) ──
  { id:'horse-light-war',    name:'Horse, Light War',    category:'mount', listPriceGp:150,  stone:null, raw:'RR p.130' },
  { id:'horse-medium-war',   name:'Horse, Medium War',   category:'mount', listPriceGp:250,  stone:null, raw:'RR p.130' },
  { id:'horse-heavy-war',    name:'Horse, Heavy War',    category:'mount', listPriceGp:315,  stone:null, raw:'RR p.130' },
  { id:'horse-light-riding', name:'Horse, Light Riding', category:'mount', listPriceGp:75,   stone:null, raw:'RR p.130' },
  { id:'horse-medium-riding',name:'Horse, Medium Riding',category:'mount', listPriceGp:40,   stone:null, raw:'RR p.130' },
  { id:'horse-steppe-riding',name:'Horse, Steppe Riding',category:'mount', listPriceGp:60,   stone:null, raw:'RR p.130' },
  { id:'horse-steppe-war',   name:'Horse, Steppe War',   category:'mount', listPriceGp:120,  stone:null, raw:'RR p.130' },
  { id:'horse-medium-draft', name:'Horse, Medium Draft', category:'mount', listPriceGp:30,   stone:null, raw:'RR p.130' },
  { id:'horse-heavy-draft',  name:'Horse, Heavy Draft',  category:'mount', listPriceGp:40,   stone:null, raw:'RR p.130' },
  { id:'horse-steppe-draft', name:'Horse, Steppe Draft', category:'mount', listPriceGp:30,   stone:null, raw:'RR p.130' },
  { id:'mule-draft',         name:'Mule, Draft',         category:'mount', listPriceGp:20,   stone:null, raw:'RR p.130' },
  { id:'mule-riding',        name:'Mule, Riding',        category:'mount', listPriceGp:30,   stone:null, raw:'RR p.130' },
  { id:'mule-war',           name:'Mule, War',           category:'mount', listPriceGp:50,   stone:null, raw:'RR p.130' },
  { id:'donkey-draft',       name:'Donkey, Draft',       category:'mount', listPriceGp:10,   stone:null, raw:'RR p.130' },
  { id:'camel-riding',       name:'Camel, Riding',       category:'mount', listPriceGp:100,  stone:null, raw:'RR p.130' },
  { id:'ox-draft',           name:'Ox, Draft',           category:'mount', listPriceGp:40,   stone:null, raw:'RR p.130' },
  { id:'dog-war',            name:'Dog, War',            category:'mount', listPriceGp:75,   stone:null, raw:'RR p.130' },
  { id:'dog-hunting',        name:'Dog, Hunting',        category:'mount', listPriceGp:10,   stone:null, raw:'RR p.130' },
  { id:'hawk-hunting',       name:'Hawk, Hunting',       category:'mount', listPriceGp:20,   stone:null, raw:'RR p.130' },
  { id:'elephant-riding',    name:'Elephant, Riding',    category:'mount', listPriceGp:1500, stone:null, raw:'RR p.130' },
  { id:'elephant-war',       name:'Elephant, War',       category:'mount', listPriceGp:2000, stone:null, raw:'RR p.130' },
  { id:'cow',                name:'Cow',                 category:'mount', listPriceGp:10,   stone:null, raw:'RR p.130' },
  { id:'pig',                name:'Pig',                 category:'mount', listPriceGp:3,    stone:null, raw:'RR p.130' },
  { id:'sheep',              name:'Sheep',               category:'mount', listPriceGp:2,    stone:null, raw:'RR p.130' },
  { id:'goat',               name:'Goat',                category:'mount', listPriceGp:3,    stone:null, raw:'RR p.130' },
  { id:'chicken',            name:'Chicken',             category:'mount', listPriceGp:0.1,  stone:null, raw:'RR p.130' }
]);
function lookupEquipment(id){ return EQUIPMENT_CATALOG.find(e => e.id === id) || null; }
function equipmentByCategory(cat){ return EQUIPMENT_CATALOG.filter(e => e.category === cat); }

// ─── #476 Monster Persistence — Lairs per Hex (JJ p.69) ───────────────────────
// RAW wilderness lair DENSITY by terrain — the COUNT only, which is catalog-free; populating each
// lair (the 1d20 Rarity → 1d100 Encounter chain) is the catalog-gated part (M2/M3). Keyed like
// Lairs per Hex (JJ p.69) — keyed 'base' or 'base-subtype' to mirror BOTH the RAW terrain rows
// AND the TERRAIN_SUBTYPES axis, so a hex's stored sub-type resolves to its exact RAW row.
// RAW SPLITS desert / grassland / hills / mountains / scrubland by sub-type (each variant its own
// row below); barrens / forest / swamp are RAW "(any)" — one value for every sub-type, carried by
// the bare-base row and reached via the fallback in lairDiceForHex; jungle is a single unqualified
// row. A hex with NO sub-type set takes the bare-base TOOLING DEFAULT (🔧 — RAW gives no "(any)"
// row for the split bases, so we pick the commonest variant): desert→sandy · grassland→farm/prairie
// · hills→rocky · mountains→rocky/snowy · scrubland→low/sparse. Two axis sub-types have NO RAW row
// and are 🔧 best-matched to the nearest RAW variant: grassland-savanna → farm/prairie density,
// mountains-volcanic → rocky/snowy. 'water' = open ocean → no LAND lairs (0; aquatic lairs are a
// separate RAW track, out of v1). Dice {n,d,mod} → n×dM + mod, clamped ≥0 (steppe 1d3−1 can be 0).
// Range 1d3−1 … 2d8. Integrator contract: ACKS_Mechanic_Extensions.md "Lairs per hex (JJ p.69)".
const LAIRS_PER_HEX = Object.freeze({
  // Barrens — RAW "(any)": rocky/sandy/tundra all 1d4 (sub-types fall back to this row).
  barrens:              { n:1, d:4, mod:0 },    // RAW (any)
  // Desert — RAW splits rocky/sandy.
  desert:               { n:1, d:4, mod:0 },    // 🔧 bare default = sandy
  'desert-rocky':       { n:1, d:2, mod:0 },    // RAW
  'desert-sandy':       { n:1, d:4, mod:0 },    // RAW
  // Forest — RAW "(any)": deciduous/taiga both 2d4 (sub-types fall back to this row).
  forest:               { n:2, d:4, mod:0 },    // RAW (any)
  // Grassland — RAW splits farm/prairie + steppe.
  grassland:            { n:1, d:3, mod:0 },    // 🔧 bare default = farm/prairie
  'grassland-farm':     { n:1, d:3, mod:0 },    // RAW (farm/prairie)
  'grassland-savanna':  { n:1, d:3, mod:0 },    // 🔧 no RAW row — matched to farm/prairie density
  'grassland-steppe':   { n:1, d:3, mod:-1 },   // RAW
  // Hills — RAW splits forested + rocky.
  hills:                { n:1, d:4, mod:0 },    // 🔧 bare default = rocky
  'hills-forested':     { n:2, d:4, mod:0 },    // RAW
  'hills-rocky':        { n:1, d:4, mod:0 },    // RAW
  // Jungle — RAW single row.
  jungle:               { n:2, d:8, mod:0 },    // RAW
  // Mountains — RAW splits forested + rocky/snowy.
  mountains:            { n:1, d:4, mod:1 },    // 🔧 bare default = rocky/snowy
  'mountains-forested': { n:2, d:4, mod:0 },    // RAW
  'mountains-rocky':    { n:1, d:4, mod:1 },    // RAW (rocky/snowy)
  'mountains-snowy':    { n:1, d:4, mod:1 },    // RAW (rocky/snowy — snowy shares the row)
  'mountains-volcanic': { n:1, d:4, mod:1 },    // 🔧 no RAW row — matched to rocky/snowy
  // Scrubland — RAW splits low/sparse + high/dense.
  scrubland:            { n:1, d:2, mod:0 },    // 🔧 bare default = low/sparse
  'scrubland-sparse':   { n:1, d:2, mod:0 },    // RAW (low, sparse)
  'scrubland-dense':    { n:2, d:4, mod:0 },    // RAW (high, dense)
  // Swamp — RAW "(any)": scrubby/forested both 2d4+1 (sub-types fall back to this row).
  swamp:                { n:2, d:4, mod:1 },    // RAW (any)
  // Water — no RAW row; v1 has no land lairs in open ocean.
  water:                { n:0, d:0, mod:0 }
});
// Common GM/author terrain synonyms → a LAIRS_PER_HEX key (covers what the templates + demo use;
// a subset of subsystems' HEX_TERRAIN_ALIASES, kept HERE so lair seeding doesn't depend on the
// subsystems module being loaded — catalogs loads first).
const LAIR_TERRAIN_ALIAS = Object.freeze({
  plains:'grassland', plain:'grassland', prairie:'grassland-farm', farmland:'grassland-farm', meadow:'grassland', pasture:'grassland', fields:'grassland',
  steppe:'grassland-steppe', savanna:'grassland-savanna', savannah:'grassland-savanna',
  coast:'grassland', coastal:'grassland', shore:'grassland', shoreline:'grassland', seaside:'grassland', beach:'grassland',
  woods:'forest', woodland:'forest', woodlands:'forest', taiga:'forest', boreal:'forest',
  mountain:'mountains', peaks:'mountains', alpine:'mountains',
  hill:'hills', highlands:'hills',
  marsh:'swamp', marshland:'swamp', bog:'swamp', fen:'swamp', wetland:'swamp', wetlands:'swamp',
  scrub:'scrubland', heath:'scrubland', moor:'scrubland', moorland:'scrubland',
  sea:'water', seas:'water', ocean:'water', oceans:'water', waters:'water'
});
// Human label for a lair-count dice spec: {n,d,mod} → "2d4" / "1d3−1" / "1d4+1" / "—" (none).
function lairDiceLabel(spec){
  if(!spec || !spec.d || !spec.n) return '—';
  let s = spec.n + 'd' + spec.d;
  if(spec.mod > 0) s += '+' + spec.mod;
  else if(spec.mod < 0) s += '−' + Math.abs(spec.mod);  // U+2212, matches the survey table
  return s;
}
// E9 — MAXIMUM lairs per hex by territory class (JJ p.69): "For civilized territory, the
// maximum number of lairs is 33% the amount in unsettled territory; for borderlands, 50%;
// and for outlands, 66%." The unsettled amount reads as the terrain's lair-dice MAXIMUM
// ("the maximum number of lairs that theoretically could be present" — deterministic, not
// a roll), so a domainless hex's own ceiling is that max (100%). hexLairCapacity
// (acks-engine.js) composes this with the hex's dice + its living-lair count.
const LAIR_CAP_PCT_BY_TERRITORY = Object.freeze({ civilized: 0.33, borderlands: 0.50, outlands: 0.66, unsettled: 1.0 });

// ═══════════════════════════════════════════════════════════════════════════
// Terrain model (Phase_2.5_Terrain_Model_Plan.md) — the four-VALUE taxonomy.
// THREE stored hex axes (terrain · terrainSubtype · koppen; + a rarely-set
// biomeOverride) and a DERIVED biome. RAW keys terrain at five grains: movement
// (RR p.272) + getting-lost (RR p.275) read the BASE; visibility (RR p.275) +
// lair count (JJ p.69) + encounter content (JJ pp.45–67) read base+SUB-TYPE;
// weather reads the KÖPPEN code (Weather Modifiers by Climate and Season, JJ
// p.41 — the 30×4 table is T4, deferred). These helpers are the single
// resolution boundary: every consumer reads (terrain, terrainSubtype, koppen)
// through here. ADDITIVE — no migration; absent axes fall back to today's base.
// ═══════════════════════════════════════════════════════════════════════════

// The 10 canonical base terrains (the existing hex.terrain enum).
const TERRAIN_BASES = Object.freeze(['barrens','desert','forest','grassland','hills','jungle','mountains','scrubland','swamp','water']);

// Per-base sub-type tokens — the §3.4 union across the lair (JJ p.69) / encounter
// (JJ pp.45–67) / visibility (RR p.275) tables. '' = the base default ("(any)").
// jungle + water have none. (River is an encounter OVERLAY derived from river
// geometry, not a stored base — see encounterTerrainForHex.)
const TERRAIN_SUBTYPES = Object.freeze({
  barrens:   ['rocky','sandy','tundra'],            // enc: Rocky/Sandy · Tundra
  desert:    ['sandy','rocky'],                     // lair: rocky 1d2 / sandy 1d4
  forest:    ['deciduous','taiga'],                 // enc: Deciduous · Taiga
  grassland: ['farm','savanna','steppe'],           // farm = prairie/farmland
  hills:     ['forested','rocky'],                  // lair: forested 2d4 / rocky 1d4
  jungle:    [],
  mountains: ['forested','rocky','snowy','volcanic'],
  scrubland: ['sparse','dense'],                    // sparse = low · dense = high
  swamp:     ['scrubby','forested'],                // RR p.275 visibility: scrubby −33% / forested −50%
  water:     []
});

// The 10 biomes (the JJ p.40 "Biome" column) — DERIVED from Köppen, never a stored peer.
const BIOMES = Object.freeze(['Rainforest','Savanna','Desert','Semi-Arid Desert','Steppe','Scrub','Forest','Taiga','Prairie','Tundra']);

// Climate by Terrain (JJ p.40) — the 30 Köppen codes → { name, biome, suggestions:[{terrain,subtype}] }.
// The FIRST suggestion is the primary; "or" codes (Csb, Dfd) carry two. Drives biomeFromKoppen + the
// Köppen-led hex creator (T2). Köppen is ALSO the weather key (JJ p.41; that table is T4, deferred).
const KOPPEN_CLIMATE = Object.freeze({
  Af:  { name:'Tropical rainforest',                   biome:'Rainforest',       suggestions:[{terrain:'jungle',   subtype:''}] },
  Am:  { name:'Tropical monsoon',                      biome:'Rainforest',       suggestions:[{terrain:'jungle',   subtype:''}] },
  Aw:  { name:'Tropical savanna, dry winter',          biome:'Savanna',          suggestions:[{terrain:'grassland',subtype:'savanna'}] },
  As:  { name:'Tropical savanna, dry summer',          biome:'Savanna',          suggestions:[{terrain:'grassland',subtype:'savanna'}] },
  BWh: { name:'Hot arid desert',                       biome:'Desert',           suggestions:[{terrain:'desert',   subtype:'sandy'},{terrain:'desert',subtype:'rocky'}] },
  BWk: { name:'Cold arid desert',                      biome:'Desert',           suggestions:[{terrain:'desert',   subtype:'sandy'},{terrain:'desert',subtype:'rocky'}] },
  BSh: { name:'Hot semi-arid steppe',                  biome:'Semi-Arid Desert', suggestions:[{terrain:'barrens',  subtype:'rocky'}] },
  BSk: { name:'Cold semi-arid steppe',                 biome:'Steppe',           suggestions:[{terrain:'grassland',subtype:'steppe'}] },
  Csa: { name:'Temperate, dry hot summer',             biome:'Scrub',            suggestions:[{terrain:'scrubland',subtype:'sparse'},{terrain:'scrubland',subtype:'dense'}] },
  Csb: { name:'Temperate, dry warm summer',            biome:'Scrub',            suggestions:[{terrain:'scrubland',subtype:'dense'},{terrain:'forest',subtype:'deciduous'}] },
  Csc: { name:'Temperate, dry cold summer',            biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Cwa: { name:'Temperate, dry winter, hot summer',     biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Cwb: { name:'Temperate, dry winter, warm summer',    biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Cwc: { name:'Temperate, dry winter, cold summer',    biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Cfa: { name:'Temperate, damp, hot summer',           biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Cfb: { name:'Temperate, damp, warm summer',          biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Cfc: { name:'Temperate, damp, cold summer',          biome:'Taiga',            suggestions:[{terrain:'forest',   subtype:'taiga'}] },
  Dsa: { name:'Continental, hot dry summer',           biome:'Forest',           suggestions:[{terrain:'forest',   subtype:'deciduous'}] },
  Dsb: { name:'Continental, warm dry summer',          biome:'Taiga',            suggestions:[{terrain:'forest',   subtype:'taiga'}] },
  Dsc: { name:'Continental, cold dry summer',          biome:'Taiga',            suggestions:[{terrain:'forest',   subtype:'taiga'}] },
  Dwa: { name:'Continental, dry winter, hot summer',   biome:'Steppe',           suggestions:[{terrain:'grassland',subtype:'steppe'}] },
  Dwb: { name:'Continental, dry winter, warm summer',  biome:'Steppe',           suggestions:[{terrain:'grassland',subtype:'steppe'}] },
  Dwc: { name:'Continental, dry winter, cold summer',  biome:'Steppe',           suggestions:[{terrain:'grassland',subtype:'steppe'}] },
  Dwd: { name:'Continental, dry winter, very cold',    biome:'Tundra',           suggestions:[{terrain:'barrens',  subtype:'tundra'}] },
  Dfa: { name:'Continental, damp, hot summer',         biome:'Prairie',          suggestions:[{terrain:'grassland',subtype:'farm'}] },
  Dfb: { name:'Continental, damp, warm summer',        biome:'Taiga',            suggestions:[{terrain:'forest',   subtype:'taiga'}] },
  Dfc: { name:'Continental, damp, cold summer',        biome:'Taiga',            suggestions:[{terrain:'forest',   subtype:'taiga'}] },
  Dfd: { name:'Continental, damp, very cold winter',   biome:'Taiga',            suggestions:[{terrain:'forest',   subtype:'taiga'},{terrain:'barrens',subtype:'tundra'}] },
  ET:  { name:'Polar tundra',                          biome:'Tundra',           suggestions:[{terrain:'barrens',  subtype:'tundra'}] },
  EF:  { name:'Polar ice cap',                         biome:'Tundra',           suggestions:[{terrain:'barrens',  subtype:'tundra'}] }
});

// terrainBase(value) → one of the 10 bases (or '' if unknown). THE single base
// normalizer: handles the canonical base, a "base-subtype" compound (strips to
// base), and folds BOTH legacy synonym maps at call-time — HEX_TERRAIN_ALIASES
// (subsystems, map render) + LAIR_TERRAIN_ALIAS (this file, lair seeding) — read
// off global.ACKS so there is no third copied map. New code routes through here;
// the two legacy maps are slated to retire through it (plan §6).
function terrainBase(value){
  let k = String(value || '').toLowerCase().trim();
  if(!k) return '';
  if(TERRAIN_BASES.indexOf(k) >= 0) return k;
  const dash = k.indexOf('-');
  if(dash > 0 && TERRAIN_BASES.indexOf(k.slice(0, dash)) >= 0) return k.slice(0, dash);
  const A = global.ACKS || {};
  let aliased = (A.HEX_TERRAIN_ALIASES && A.HEX_TERRAIN_ALIASES[k]) || (A.LAIR_TERRAIN_ALIAS && A.LAIR_TERRAIN_ALIAS[k]);
  if(aliased){
    aliased = String(aliased).toLowerCase();
    if(TERRAIN_BASES.indexOf(aliased) >= 0) return aliased;
    const d2 = aliased.indexOf('-');
    if(d2 > 0 && TERRAIN_BASES.indexOf(aliased.slice(0, d2)) >= 0) return aliased.slice(0, d2);
  }
  return '';
}

// terrainKey(hex) → "base" or "base-subtype" — the compound key the lair (JJ p.69)
// and encounter (JJ pp.45–67) tables look up. '' for an unknown base.
function terrainKey(hex){
  const base = terrainBase(hex && hex.terrain);
  if(!base) return '';
  const sub = String((hex && hex.terrainSubtype) || '').toLowerCase().trim();
  return sub ? (base + '-' + sub) : base;
}

// allTerrainSubtypes() → the deduped, sorted union of every base's sub-types.
// Sub-types are per-base (plan §3.4), but the authoring controls (map brush / hex
// editor) offer the full set when no terrain base is chosen yet, so a GM can still
// pre-pick a sub-type default; picking a base then narrows it.
function allTerrainSubtypes(){
  const seen = new Set(), out = [];
  for(const k of TERRAIN_BASES){
    for(const s of (TERRAIN_SUBTYPES[k] || [])){ if(!seen.has(s)){ seen.add(s); out.push(s); } }
  }
  return out.sort();
}

// biomeFromKoppen(code) → the JJ p.40 biome label ('' if unknown). koppenSuggestions(code)
// → the [{terrain,subtype}] the code maps to (first = primary; [] if unknown).
function biomeFromKoppen(code){ const c = KOPPEN_CLIMATE[String(code || '').trim()]; return (c && c.biome) || ''; }
function koppenSuggestions(code){ const c = KOPPEN_CLIMATE[String(code || '').trim()]; return (c && c.suggestions) ? c.suggestions.slice() : []; }

// biomeForHex(hex) → the DERIVED biome: a GM override wins, else the Köppen-implied
// biome, else '' (biome is never a stored peer of terrain — plan §4.1).
function biomeForHex(hex){ return (hex && hex.biomeOverride) || biomeFromKoppen(hex && hex.koppen) || ''; }

// visibilityFactorForHex(hex) → 1 / 0.67 / 0.5 sighting multiplier (RR p.275): barren,
// desert, forest, forested hills, scrubby swamp = −33%; forested mountain, forested
// swamp, jungle = −50%; else full. Feeds the LOS / reveal-radius overlay (Map §2.5).
function visibilityFactorForHex(hex){
  const base = terrainBase(hex && hex.terrain);
  const sub  = String((hex && hex.terrainSubtype) || '').toLowerCase().trim();
  if(base === 'jungle') return 0.5;
  if(base === 'mountains' && sub === 'forested') return 0.5;
  if(base === 'swamp' && sub === 'forested') return 0.5;
  if(base === 'swamp' && sub === 'scrubby') return 0.67;
  if(base === 'hills' && sub === 'forested') return 0.67;
  if(base === 'barrens' || base === 'desert' || base === 'forest') return 0.67;
  return 1;
}

// encounterTerrainForHex(hex) → the Monster-Encounter sub-table KEY (JJ pp.45–67). A
// hex with a river runs the River OVERLAY instead of its base terrain (River (Desert
// and Jungle) vs River (Any but Desert/Jungle)). The encounter TABLES themselves are
// M2+/#141; this is the seam they read.
function encounterTerrainForHex(hex){
  const base = terrainBase(hex && hex.terrain);
  const hasRiver = !!(hex && Array.isArray(hex.riverSides) && hex.riverSides.length);
  if(hasRiver) return (base === 'desert' || base === 'jungle') ? 'river-desert-jungle' : 'river-temperate';
  const sub = String((hex && hex.terrainSubtype) || '').toLowerCase().trim();
  return sub ? (base + '-' + sub) : base;
}

// ═══════════════════════════════════════════════════════════════════════════
// #476 ENCOUNTER LAYER (E1) — the RAW pre-combat procedure, as reference data
// RR pp.280–287: distance → surprise → evasion → reactions → influence/bribes,
// + the JJ Adventures layer: the 1d20 category draw by territory classification,
// monster rarity, and encounter frequencies (JJ pp.41–44). Design: survey §19,
// plan §15, decisions D8–D12. This section is tables + PURE resolvers only; the
// Encounter entity + lookups live in acks-engine.js, the GM-facing step verbs in
// acks-engine-events.js, the triggers in acks-engine-subsystems.js. Combat itself
// (RR p.288+) stays Phase 3 (#141), as do the 1d100 identity tables (D12).
// ═══════════════════════════════════════════════════════════════════════════

// ── Encounter distance (RR pp.280–281) ──────────────────────────────────────
// Wilderness distance is a terrain-SUB-TYPE-keyed dice roll; dungeon is 2d6×10'.
const ENCOUNTER_DISTANCE_CLASSES = Object.freeze({
  'very-close': Object.freeze({ n: 5, d: 4,  multFt: 3,  avgFt: 38,   label: "5d4 × 3'"  }),
  'close':      Object.freeze({ n: 5, d: 8,  multFt: 3,  avgFt: 68,   label: "5d8 × 3'"  }),
  'medium':     Object.freeze({ n: 3, d: 6,  multFt: 15, avgFt: 157,  label: "3d6 × 15'" }),
  'open':       Object.freeze({ n: 4, d: 6,  multFt: 30, avgFt: 420,  label: "4d6 × 30'" }),
  'vast':       Object.freeze({ n: 6, d: 20, multFt: 30, avgFt: 1890, label: "6d20 × 30'" }),
  'dungeon':    Object.freeze({ n: 2, d: 6,  multFt: 10, avgFt: 70,   label: "2d6 × 10'" })
});

// The 17 RAW terrain rows (Wilderness Encounter Distance + Evasion Throw by Terrain
// tables — both key on the SAME rows). distance → ENCOUNTER_DISTANCE_CLASSES key;
// evasionBase → the Evasion throw target at party size ≤6 (+2 per size band above).
const ENCOUNTER_TERRAIN_ROWS = Object.freeze({
  'barrens':            Object.freeze({ distance: 'open',       evasionBase: 12 }),  // Barrens (any)
  'desert-rocky':       Object.freeze({ distance: 'vast',       evasionBase: 16 }),
  'desert-sandy':       Object.freeze({ distance: 'open',       evasionBase: 12 }),
  'forest-deciduous':   Object.freeze({ distance: 'close',      evasionBase: 2  }),
  'forest-taiga':       Object.freeze({ distance: 'medium',     evasionBase: 5  }),
  'grassland-other':    Object.freeze({ distance: 'open',       evasionBase: 9  }),
  'grassland-steppe':   Object.freeze({ distance: 'vast',       evasionBase: 16 }),
  'hills-forested':     Object.freeze({ distance: 'close',      evasionBase: 5  }),
  'hills-rocky':        Object.freeze({ distance: 'open',       evasionBase: 12 }),  // RAW "rocky/terraced"
  'jungle':             Object.freeze({ distance: 'very-close', evasionBase: 2  }),  // Jungle (any)
  'mountains-forested': Object.freeze({ distance: 'close',      evasionBase: 5  }),
  'mountains-rocky':    Object.freeze({ distance: 'open',       evasionBase: 12 }),  // RAW "rocky/snowy/terraced"
  'scrubland-sparse':   Object.freeze({ distance: 'open',       evasionBase: 12 }),  // RAW "low, sparse"
  'scrubland-dense':    Object.freeze({ distance: 'medium',     evasionBase: 9  }),  // RAW "high, dense"
  'swamp-marshy':       Object.freeze({ distance: 'medium',     evasionBase: 9  }),
  'swamp-scrubby':      Object.freeze({ distance: 'close',      evasionBase: 5  }),
  'swamp-forested':     Object.freeze({ distance: 'very-close', evasionBase: 2  })
});

// Sub-type variants RAW folds into a row, + 🔧 bare-base defaults for a hex with no
// sub-type set (the EASY/common variant — the same convention JOURNEY_NAV_THROWS uses).
const _ENCOUNTER_ROW_ALIASES = Object.freeze({
  'hills-terraced': 'hills-rocky',
  'mountains-snowy': 'mountains-rocky', 'mountains-terraced': 'mountains-rocky', 'mountains-volcanic': 'mountains-rocky',
  'grassland-farm': 'grassland-other', 'grassland-prairie': 'grassland-other', 'grassland-savanna': 'grassland-other',
  'scrubland-low': 'scrubland-sparse', 'scrubland-high': 'scrubland-dense',
  // bare-base defaults (🔧 — RAW keys on the sub-type; a sub-type-less hex reads the common variant)
  'desert': 'desert-sandy', 'forest': 'forest-deciduous', 'grassland': 'grassland-other',
  'hills': 'hills-rocky', 'mountains': 'mountains-rocky', 'scrubland': 'scrubland-sparse', 'swamp': 'swamp-marshy'
});

// encounterRowKey(terrainKeyOrBase) → one of the 17 canonical row keys, or null
// (water / unknown — the sea scale is reserved). Accepts a compound "base-subtype"
// key (terrainKey(hex)) or a bare base; legacy aliases fold through terrainBase.
function encounterRowKey(key){
  let k = String(key || '').toLowerCase().trim();
  if(!k) return null;
  if(ENCOUNTER_TERRAIN_ROWS[k]) return k;
  if(_ENCOUNTER_ROW_ALIASES[k]) return _ENCOUNTER_ROW_ALIASES[k];
  // barrens-*/jungle-* (RAW "(any)") → the base row; then normalize the base itself
  const dash = k.indexOf('-');
  const head = dash > 0 ? k.slice(0, dash) : k;
  if(head === 'barrens' || head === 'jungle') return head;
  const base = terrainBase(k);
  if(!base || base === 'water') return null;
  if(ENCOUNTER_TERRAIN_ROWS[base]) return base;
  if(_ENCOUNTER_ROW_ALIASES[base]) return _ENCOUNTER_ROW_ALIASES[base];
  return null;
}
function encounterRowKeyForHex(hex){ return encounterRowKey(terrainKey(hex)); }

// Roll a distance class's dice. classOrRowKey may be a distance-class key, a terrain
// row key, or a hex terrain key (resolved through encounterRowKey).
function rollEncounterDistanceFt(classOrRowKey, rng){
  const r = rng || Math.random;
  let cls = ENCOUNTER_DISTANCE_CLASSES[classOrRowKey];
  if(!cls){
    const row = encounterRowKey(classOrRowKey);
    cls = row ? ENCOUNTER_DISTANCE_CLASSES[ENCOUNTER_TERRAIN_ROWS[row].distance] : null;
  }
  if(!cls) return null;
  let total = 0;
  for(let i = 0; i < cls.n; i++) total += 1 + Math.floor(r() * cls.d);
  return total * cls.multFt;
}

// ── Maximum visibility (RR p.281, cf. p.273) ────────────────────────────────
const VISIBILITY_BASE_FT = Object.freeze({ 'daylight': 600, 'full-moon': 300, 'half-moon': 150, 'starlight': 75 });
// Formation size raises how far the SEEN side is visible. Size counting (shared with
// evasion party size): mounted man / large = 2 men, huge = 6, gigantic = 24, colossal = 120.
const ENCOUNTER_SIZE_MEN = Object.freeze({ man: 1, mounted: 2, large: 2, huge: 6, gigantic: 24, colossal: 120 });
function formationVisibilityMult(menCount){
  const n = Number(menCount) || 0;
  if(n >= 241) return 5;   // battalion +400%
  if(n >= 61)  return 3;   // company  +200%
  if(n >= 31)  return 2;   // platoon  +100%
  if(n >= 10)  return 1.5; // party    +50%
  return 1;
}
// How far a watcher can see a formation of `seenCount` man-equivalents in this light.
function maxVisibilityFt(light, seenCount){
  const base = VISIBILITY_BASE_FT[light] || VISIBILITY_BASE_FT['daylight'];
  return Math.round(base * formationVisibilityMult(seenCount));
}
// Full distance resolution (RR p.281): roll the terrain dice, cap at maximum visibility
// (computed per side — a small group spots a horde first), note who detected whom.
// Unknown side counts read as 1 (man-sized scouts) — recompute when sides firm up.
function computeEncounterDistance(opts){
  const o = opts || {};
  const rowKey = encounterRowKey(o.terrainRow || o.terrainKey || '');
  const rolledFt = (typeof o.rolledFt === 'number') ? o.rolledFt
    : rollEncounterDistanceFt(o.distanceClass || rowKey, o.rng);
  if(rolledFt == null) return null;
  const light = o.light || 'daylight';
  const aCount = (o.sideACount == null) ? 1 : Number(o.sideACount) || 1;   // the party
  const bCount = (o.sideBCount == null) ? 1 : Number(o.sideBCount) || 1;   // the monsters
  const visAofB = maxVisibilityFt(light, bCount);   // how far side A can see side B
  const visBofA = maxVisibilityFt(light, aCount);
  const capFt = Math.max(visAofB, visBofA);
  const distanceFt = Math.min(rolledFt, capFt);
  let detectedBy = null;                            // which side starts having detected the other
  if(visAofB >= distanceFt && visBofA >= distanceFt) detectedBy = 'both';
  else if(visAofB >= distanceFt) detectedBy = 'party';
  else if(visBofA >= distanceFt) detectedBy = 'monsters';
  return { rolledFt, capFt, distanceFt, light, detectedBy, terrainRow: rowKey || null };
}

// ── Surprise (RR pp.281–284) ────────────────────────────────────────────────
// The Surprise Matrix decomposes: each side's surprise state is a pure function of
// its OWN (foreknowledge, line-of-sight); evade eligibility is a function of both.
// Verified cell-by-cell against the RAW 4×4 matrix (tests assert all 16).
const SURPRISE_AWARENESS_STATES = Object.freeze({
  'fore+los': Object.freeze({ rolls: false, mod: 0  }),   // not surprised
  'fore':     Object.freeze({ rolls: true,  mod: 1  }),   // roll surprise (+1)
  'los':      Object.freeze({ rolls: true,  mod: 0  }),   // roll surprise
  'none':     Object.freeze({ rolls: true,  mod: -1 })    // roll surprise (−1)
});
function surpriseAwarenessKey(foreknowledge, lineOfSight){
  return foreknowledge ? (lineOfSight ? 'fore+los' : 'fore') : (lineOfSight ? 'los' : 'none');
}
function surpriseStateFor(foreknowledge, lineOfSight){
  return SURPRISE_AWARENESS_STATES[surpriseAwarenessKey(foreknowledge, lineOfSight)];
}
// Evade eligibility for the ADVENTURERS' side (RR: check monsters by swapping sides).
// None × None = no encounter at all — the RAW basis for "a placed monster doesn't auto-engage".
function encounterEvadeEligibility(advKey, monKey){
  if(advKey === 'none' && monKey === 'none') return 'no-encounter';
  if(advKey === 'none') return 'cannot';                   // unaware adventurers can't evade
  if(monKey === 'fore+los') return 'cannot';               // the monsters have them cold
  if(advKey === 'fore+los' && monKey === 'none') return 'always';
  return 'can';
}
// One surprise roll: 1d6 + own bonuses − opponents' stealth penalty; 2− = surprised
// (vulnerable, no actions in round 1). When several opponents impose different stealth
// penalties only the SMALLEST applies ("one clumsy oaf ruins the ambush") — callers
// pass that already-resolved penalty.
// A side asserted HIDDEN (RR pp.283–284) imposes this on the opponents' rolls — and no
// creature can claim line of sight on a creature hidden from it (the awareness clamp).
// The Hiding proficiency THROW is not rolled here (GM-asserted; per-creature class
// stealth like Natural Stealth stays a GM modifier).
const SURPRISE_HIDDEN_PENALTY = -2;
function rollSurpriseThrow(opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const natural = 1 + Math.floor(r() * 6);
  const total = natural + (Number(o.mod) || 0);
  return { natural, mod: Number(o.mod) || 0, total, surprised: total <= 2 };
}

// ── Evasion (RR pp.284–285) ─────────────────────────────────────────────────
// Wilderness-only. Eligible per the matrix + not surprised; AUTOMATIC if all monsters
// are surprised. Party size counts man-equivalents (ENCOUNTER_SIZE_MEN).
const EVASION_SIZE_BANDS = Object.freeze([
  Object.freeze({ max: 6,        add: 0, label: '6-'       }),
  Object.freeze({ max: 14,       add: 2, label: '7 to 14'  }),
  Object.freeze({ max: 30,       add: 4, label: '15 to 30' }),
  Object.freeze({ max: 60,       add: 6, label: '31 to 60' }),
  Object.freeze({ max: Infinity, add: 8, label: '61+'      })
]);
// Aerial penalty waived in: forest (any), forested hills, forested mountains, dense
// scrubland, jungle, or swamp (any) — RR p.284.
const EVASION_AERIAL_EXEMPT_ROWS = Object.freeze([
  'forest-deciduous', 'forest-taiga', 'hills-forested', 'mountains-forested',
  'scrubland-dense', 'jungle', 'swamp-marshy', 'swamp-scrubby', 'swamp-forested'
]);
function evasionSizeBand(menCount){
  const n = Number(menCount) || 1;
  for(const b of EVASION_SIZE_BANDS){ if(n <= b.max) return b; }
  return EVASION_SIZE_BANDS[EVASION_SIZE_BANDS.length - 1];
}
// Target value for the Evasion proficiency throw: terrain row base (≤6) + the size band.
function evasionTargetFor(terrainRowOrKey, menCount){
  const row = encounterRowKey(terrainRowOrKey);
  if(!row) return null;
  const band = evasionSizeBand(menCount);
  return { terrainRow: row, base: ENCOUNTER_TERRAIN_ROWS[row].evasionBase, sizeAdd: band.add,
           sizeBand: band.label, target: ENCOUNTER_TERRAIN_ROWS[row].evasionBase + band.add };
}
// Standard RAW modifiers, for callers' convenience (each ± to the d20 roll):
//  monsters fly & party doesn't −4 (waived in EVASION_AERIAL_EXEMPT_ROWS; party flies
//  & monsters don't = auto-evade) · explorer guiding in familiar territory +5 (and his
//  party can evade even when surprised, if he isn't) · forlorn hope +4 at reduced size
//  · speed differential ±4 (fastest monster vs slowest adventurer) · sauve qui peut:
//  split groups each roll on their own size, all failures share one encounter.
function attemptEvasionThrow(opts){
  const o = opts || {};
  if(o.autoSuccess) return { auto: true, success: true, natural: null, total: null, target: o.target || null };
  const r = o.rng || Math.random;
  const natural = 1 + Math.floor(r() * 20);
  const modSum = (Array.isArray(o.modifiers) ? o.modifiers : []).reduce((s, m) => s + (Number(m && m.value) || 0), 0);
  const total = natural + modSum;
  const target = Number(o.target) || 0;
  return { auto: false, natural, modSum, total, target, success: total >= target };
}
// Aftermath of a successful evasion (RR p.285): displaced by a fresh distance roll, in a
// random clock direction; then an immediate Navigation throw at −4 or the group is lost
// (and KNOWS it — unlike the §27 unknowing travel-stray). The nav throw itself belongs
// to the caller (the journey owns its Navigation machinery); hex face = ceil(clock/2).
function rollEvasionAftermath(opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const distanceFt = rollEncounterDistanceFt(o.distanceClass || o.terrainRow || o.terrainKey, r);
  const clockDirection = 1 + Math.floor(r() * 12);
  return { distanceFt: distanceFt, clockDirection: clockDirection,
           hexFace: Math.ceil(clockDirection / 2), navThrowModifier: -4 };
}

// ── Reactions (RR pp.285–286) ───────────────────────────────────────────────
const ENCOUNTER_ATTITUDES = Object.freeze(['hostile', 'unfriendly', 'neutral', 'indifferent', 'friendly']);
function reactionBandFor(total){
  if(total <= 2)  return 'hostile';      // attacks
  if(total <= 5)  return 'unfriendly';   // may attack
  if(total <= 8)  return 'neutral';      // uncertain
  if(total <= 11) return 'indifferent';  // uninterested
  return 'friendly';                     // helpful
}
// 2d6 + the party face's CHA modifier + circumstance modifiers (the JJ tone catalogs,
// E3). Clamps: an UNMODIFIED 2 is never better than Unfriendly; an unmodified 12 never
// worse than Indifferent. A Friendly monster of fewer HD can be recruited via the
// Reaction to Hiring table (RR p.162) — the shipped Recruit machinery.
function rollEncounterReaction(opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const d1 = 1 + Math.floor(r() * 6), d2 = 1 + Math.floor(r() * 6);
  const natural = d1 + d2;
  const chaMod = Number(o.chaMod) || 0;
  const modSum = (Array.isArray(o.modifiers) ? o.modifiers : []).reduce((s, m) => s + (Number(m && m.value) || 0), 0);
  const total = natural + chaMod + modSum;
  let band = reactionBandFor(total);
  let clamped = null;
  const order = ENCOUNTER_ATTITUDES;
  if(natural === 2 && order.indexOf(band) > order.indexOf('unfriendly')){ band = 'unfriendly'; clamped = 'natural-2'; }
  if(natural === 12 && order.indexOf(band) < order.indexOf('indifferent')){ band = 'indifferent'; clamped = 'natural-12'; }
  return { natural, chaMod, modSum, total, band, clamped };
}

// ── Influence + bribes (RR pp.286–287) ──────────────────────────────────────
// The time ladder binds directly to the #346 activity budget: round/turn = incidental,
// 1 hour = ancillary, 8 hours = dedicated, 5 work-days = a week of dedicated days.
const INFLUENCE_ATTEMPT_LADDER = Object.freeze([
  Object.freeze({ attempt: 1, time: '1 round (1 minute)',   activitySlot: 'incidental', days: 0 }),
  Object.freeze({ attempt: 2, time: '1 turn (10 minutes)',  activitySlot: 'incidental', days: 0 }),
  Object.freeze({ attempt: 3, time: '6 turns (1 hour)',     activitySlot: 'ancillary',  days: 0 }),
  Object.freeze({ attempt: 4, time: '8 hours (1 work-day)', activitySlot: 'dedicated',  days: 1 }),
  Object.freeze({ attempt: 5, time: '5 work-days (1 week)', activitySlot: 'dedicated',  days: 5 })
]);
function influenceAttemptInfo(attemptNumber){
  const n = Math.max(1, Number(attemptNumber) || 1);
  return INFLUENCE_ATTEMPT_LADDER[Math.min(n, 5) - 1];
}
// The influence shift by roll band: 2 → two steps toward Hostile; 3–5 → one toward
// Hostile; 6–8 → one toward Neutral; 9–11 → one toward Friendly; 12 → two toward
// Friendly. Once interacting the party can no longer evade; once combat starts, no
// influence until weapons are laid down or the creatures roll morale.
function applyInfluenceShift(currentAttitude, rollBand){
  const order = ENCOUNTER_ATTITUDES;
  let idx = order.indexOf(currentAttitude);
  if(idx < 0) idx = 2; // default neutral
  let shift = 0;
  if(rollBand === 'hostile') shift = -2;
  else if(rollBand === 'unfriendly') shift = -1;
  else if(rollBand === 'neutral') shift = (idx > 2 ? -1 : (idx < 2 ? 1 : 0));  // one step toward Neutral
  else if(rollBand === 'indifferent') shift = 1;
  else if(rollBand === 'friendly') shift = 2;
  const next = Math.max(0, Math.min(order.length - 1, idx + shift));
  return { from: order[idx], to: order[next], shift: next - idx };
}
// Bribes (RR p.287): a week's / month's / year's pay = +1/+2/+3; with Bribery proficiency
// the scale cheapens to day/week/month AND a failed bribe carries no backlash (charged
// only on an unmodified 2). Without it, a bribe that fails to move the target toward
// friendly shifts it one (additional) step toward Hostile — and an official charges
// bribery if he ends unfriendly/hostile or on an unmodified 2.
const BRIBE_TIERS = Object.freeze({
  standard:   Object.freeze([Object.freeze({ bonus: 1, pay: 'week' }), Object.freeze({ bonus: 2, pay: 'month' }), Object.freeze({ bonus: 3, pay: 'year' })]),
  proficient: Object.freeze([Object.freeze({ bonus: 1, pay: 'day' }),  Object.freeze({ bonus: 2, pay: 'week' }),  Object.freeze({ bonus: 3, pay: 'month' })])
});
function bribeBonusInfo(bonus, proficient){
  const tiers = proficient ? BRIBE_TIERS.proficient : BRIBE_TIERS.standard;
  const b = Math.max(1, Math.min(3, Number(bonus) || 1));
  return Object.assign({ proficient: !!proficient, backlashOnFail: !proficient }, tiers[b - 1]);
}

// ── Encounter tone (JJ pp.84–87; #476 E3b, D11) ──────────────────────────────────
// Every reaction/influence roll takes a TONE — diplomatic / intimidating / seductive
// (party surprised → the Judge picks diplomatic or intimidating, whichever is worse;
// else the spokesperson's approach sets it). Each tone carries its own situational
// modifier catalog, shipped as STRUCTURED DATA (Joachim's D11 call): rows the GM
// ticks, each one itemized into the roll's modifiers[] (the E2h plumbing). Two
// printed rows are deliberately ABSENT — the face's CHA ("Character has Charisma
// Modifier") rides the roll's own chaMod term, and the diplomatic bribe row rides
// the influence step's bribe mechanism — including either here would double-count.
// Row shape: { key, group, label, value, variable? ("+1 or more" / per-unit rows —
// the GM enters the amount, `value` seeds it), derive? (a derivation key
// encounterToneRows computes from shipped state — alignment / lair / morale /
// outnumber / hd-gap / level-gap / prof:<Name> / prof-intimidation-gated /
// prof-performance-art / relationship), note? }. "Owes favors" is GM-asserted, NOT
// derived from F&D obligations (the formal favor's effect is already complete in
// the favor/duty balance → loyalty; JJ's row is the generic untracked social ledger).
const ENCOUNTER_TONES = Object.freeze({
  diplomatic: Object.freeze({
    key: 'diplomatic', label: 'Diplomatic', cite: 'JJ p.85',
    blurb: 'A non-threatening appeal to the target’s self-interest.',
    rows: Object.freeze([
      Object.freeze({ key: 'align-ll', group: 'Alignment', label: 'Believed Lawful; target Lawful or Neutral', value: 1, derive: 'alignment' }),
      Object.freeze({ key: 'align-lc', group: 'Alignment', label: 'Believed Lawful; target Chaotic', value: -1, derive: 'alignment' }),
      Object.freeze({ key: 'align-cl', group: 'Alignment', label: 'Believed Chaotic; target Lawful or Neutral', value: -1, derive: 'alignment' }),
      Object.freeze({ key: 'lair-tres', group: 'Location', label: 'Trespassing in the target’s lair', value: -1, derive: 'lair-target' }),
      Object.freeze({ key: 'lair-own', group: 'Location', label: 'In own lair', value: 1 }),
      Object.freeze({ key: 'auth-over', group: 'Authority', label: 'Legal authority over the target (lord, guard…)', value: 1, variable: true }),
      Object.freeze({ key: 'owes-them', group: 'Authority', label: 'Owes the target favors (−1 per unrequited)', value: -1, variable: true, note: 'the untracked social ledger — GM’s call (a formal F&D favor already acts via the favor/duty balance)' }),
      Object.freeze({ key: 'auth-target', group: 'Authority', label: 'Target has authority over the character', value: -1, variable: true }),
      Object.freeze({ key: 'owed-by', group: 'Authority', label: 'Target owes the character favors (+1 per unrequited)', value: 1, variable: true }),
      Object.freeze({ key: 'prof-diplomacy', group: 'Proficiencies', label: 'Diplomacy proficiency', value: 1, derive: 'prof:Diplomacy' }),
      Object.freeze({ key: 'prof-mystic', group: 'Proficiencies', label: 'Mystic Aura proficiency', value: 1, derive: 'prof:Mystic Aura' }),
      Object.freeze({ key: 'will', group: 'Proficiencies', label: 'Target’s Will modifier (apply −Will)', value: -1, variable: true }),
      Object.freeze({ key: 'threat-brandish', group: 'Threat', label: 'Brandishing a weapon', value: -1 }),
      Object.freeze({ key: 'threat-believed', group: 'Threat', label: 'Target believes the character harmed friends', value: -1 }),
      Object.freeze({ key: 'threat-witnessed', group: 'Threat', label: 'Target witnessed / has evidence of harm to friends', value: -2 }),
      Object.freeze({ key: 'threat-personal', group: 'Threat', label: 'Target personally harmed by the character (−5 or more)', value: -5, variable: true }),
      Object.freeze({ key: 'rel-hostile', group: 'Relationship', label: 'Target already Hostile', value: -2, derive: 'relationship' }),
      Object.freeze({ key: 'rel-unfriendly', group: 'Relationship', label: 'Target already Unfriendly', value: -1, derive: 'relationship' }),
      Object.freeze({ key: 'rel-indifferent', group: 'Relationship', label: 'Target already Indifferent', value: 1, derive: 'relationship' }),
      Object.freeze({ key: 'rel-friendly', group: 'Relationship', label: 'Target already Friendly', value: 2, derive: 'relationship' })
    ])
  }),
  intimidating: Object.freeze({
    key: 'intimidating', label: 'Intimidating', cite: 'JJ p.86',
    blurb: 'A threat of harm unless the target complies. Gains are TEMPORARY — re-roll when conditions materially change; new allies of the intimidated re-use the ORIGINAL roll.',
    rows: Object.freeze([
      Object.freeze({ key: 'out-1', group: 'Character', label: 'Party outnumbers the target(s)', value: 1, derive: 'outnumber' }),
      Object.freeze({ key: 'out-32', group: 'Character', label: 'Outnumbers by 3:2 or more', value: 2, derive: 'outnumber' }),
      Object.freeze({ key: 'out-31', group: 'Character', label: 'Outnumbers by 3:1 or more', value: 5, derive: 'outnumber' }),
      Object.freeze({ key: 'lair-own', group: 'Character', label: 'In own lair', value: 1 }),
      Object.freeze({ key: 'brandish', group: 'Character', label: 'Brandishing a weapon', value: 1 }),
      Object.freeze({ key: 'brandish-magic', group: 'Character', label: 'Brandishing magic items', value: 1 }),
      Object.freeze({ key: 'disadvantage', group: 'Character', label: 'Target at disadvantage (blackmail, tied up…)', value: 1, variable: true }),
      Object.freeze({ key: 'auth-over', group: 'Character', label: 'Legal authority over the target', value: 1, variable: true }),
      Object.freeze({ key: 'hd-up', group: 'Character', label: 'Significantly higher level than the target (3+ HD)', value: 1, variable: true, derive: 'hd-gap' }),
      Object.freeze({ key: 'morale', group: 'Target', label: 'Target’s −Morale score', value: 0, variable: true, derive: 'morale' }),
      Object.freeze({ key: 'will', group: 'Target', label: 'Target’s Will modifier (apply −Will)', value: -1, variable: true }),
      Object.freeze({ key: 'witnessed-kill', group: 'Target', label: 'Target witnessed the character kill/torture its associates', value: 1 }),
      Object.freeze({ key: 'lair-target', group: 'Target', label: 'Target in own lair', value: -1, derive: 'lair-target' }),
      Object.freeze({ key: 'armed', group: 'Target', label: 'Target is armed', value: -1 }),
      Object.freeze({ key: 'spells-items', group: 'Target', label: 'Target has spells or magic items available', value: -1 }),
      Object.freeze({ key: 'outd-1', group: 'Target', label: 'Target + friends outnumber the party', value: -1, derive: 'outnumber', note: 'a target in its lair counts the lair-mates as friends' }),
      Object.freeze({ key: 'outd-32', group: 'Target', label: 'Outnumbered 3:2 or more', value: -2, derive: 'outnumber' }),
      Object.freeze({ key: 'outd-31', group: 'Target', label: 'Outnumbered 3:1 or more', value: -5, derive: 'outnumber' }),
      Object.freeze({ key: 'target-disadv', group: 'Target', label: 'Target has the character at disadvantage (trump card, helpless)', value: -1, variable: true }),
      Object.freeze({ key: 'auth-target', group: 'Target', label: 'Target has legal authority over the character', value: -1, variable: true }),
      Object.freeze({ key: 'hd-down', group: 'Target', label: 'Target significantly higher level (3+ HD)', value: -1, variable: true, derive: 'hd-gap' }),
      Object.freeze({ key: 'loss-face', group: 'Target', label: 'Target would lose face if it submits', value: -1, variable: true }),
      Object.freeze({ key: 'dark-lord', group: 'Target', label: 'Target believes submission means worse punishment (“the Dark Lord will do far worse”)', value: -5, variable: true }),
      Object.freeze({ key: 'prof-intimidation', group: 'Proficiencies', label: 'Intimidation proficiency (needs authority over, or outnumbering, the target)', value: 1, derive: 'prof-intimidation-gated' }),
      Object.freeze({ key: 'prof-mystic', group: 'Proficiencies', label: 'Mystic Aura proficiency', value: 1, derive: 'prof:Mystic Aura' }),
      Object.freeze({ key: 'rel-hostile', group: 'Relationship', label: 'Target already Hostile', value: -2, derive: 'relationship' }),
      Object.freeze({ key: 'rel-unfriendly', group: 'Relationship', label: 'Target already Unfriendly', value: -1, derive: 'relationship' }),
      Object.freeze({ key: 'rel-intimidated', group: 'Relationship', label: 'Target already Intimidated', value: 1, derive: 'relationship' })
    ])
  }),
  seductive: Object.freeze({
    key: 'seductive', label: 'Seductive', cite: 'JJ pp.86–87',
    blurb: 'An appeal to the target’s prurient interest — only where passionate relations are conceivable.',
    rows: Object.freeze([
      Object.freeze({ key: 'age-younger-youth', group: 'Age', label: 'Younger age category; target attracted to youthful mates (+1/category)', value: 1, variable: true }),
      Object.freeze({ key: 'age-younger-mature', group: 'Age', label: 'Younger age category; target attracted to mature mates (−1/category)', value: -1, variable: true }),
      Object.freeze({ key: 'age-older-mature', group: 'Age', label: 'Older age category; target attracted to mature mates (+1/category)', value: 1, variable: true }),
      Object.freeze({ key: 'age-older-youth', group: 'Age', label: 'Older age category; target attracted to youthful mates (−1/category)', value: -1, variable: true }),
      Object.freeze({ key: 'status', group: 'Status', label: 'Higher social status (+1 per noble rank or equivalent)', value: 1, variable: true }),
      Object.freeze({ key: 'level-up', group: 'Status', label: 'Significantly higher level (3+ levels)', value: 1, derive: 'level-gap' }),
      Object.freeze({ key: 'level-down', group: 'Status', label: 'Significantly lower level (3+ levels)', value: -1, derive: 'level-gap' }),
      Object.freeze({ key: 'appeal-plus', group: 'Appeal', label: 'Particularly appealing to the target', value: 1, variable: true }),
      Object.freeze({ key: 'appeal-minus', group: 'Appeal', label: 'Particularly unappealing to the target', value: -1, variable: true }),
      Object.freeze({ key: 'privacy-alone', group: 'Privacy', label: 'Alone with the target', value: 1 }),
      Object.freeze({ key: 'privacy-friends', group: 'Privacy', label: 'In front of the target’s friends', value: -1 }),
      Object.freeze({ key: 'prof-mystic', group: 'Proficiencies', label: 'Mystic Aura proficiency', value: 1, derive: 'prof:Mystic Aura' }),
      Object.freeze({ key: 'prof-seduction', group: 'Proficiencies', label: 'Seduction proficiency', value: 1, derive: 'prof:Seduction' }),
      Object.freeze({ key: 'prof-performance', group: 'Proficiencies', label: 'Seduction/Mystic Aura + demonstrates Performance or Art', value: 1, derive: 'prof-performance-art' }),
      Object.freeze({ key: 'will', group: 'Proficiencies', label: 'Target’s Will modifier (apply −Will)', value: -1, variable: true }),
      Object.freeze({ key: 'rel-hostile', group: 'Relationship', label: 'Target already Hostile', value: -2, derive: 'relationship' }),
      Object.freeze({ key: 'rel-unfriendly', group: 'Relationship', label: 'Target already Unfriendly', value: -1, derive: 'relationship' }),
      Object.freeze({ key: 'rel-indifferent', group: 'Relationship', label: 'Target already Indifferent', value: 1, derive: 'relationship' }),
      Object.freeze({ key: 'rel-friendly', group: 'Relationship', label: 'Target already Friendly', value: 2, derive: 'relationship' }),
      Object.freeze({ key: 'advantage-friends', group: 'Relationship', label: 'Took advantage of the target’s friends in the past', value: -1 }),
      Object.freeze({ key: 'advantage-target', group: 'Relationship', label: 'Took advantage of the target in the past', value: -2 }),
      Object.freeze({ key: 'personal-risk', group: 'Relationship', label: 'Liaison puts the target at personal risk (−2 or more)', value: -2, variable: true })
    ])
  })
});
// Intimidation cannot achieve genuine indifference/friendship — those bands become
// INTIMIDATED (escapes if possible; acts indifferent while trapped) and OVERAWED
// (acts friendly). The stored band stays canonical (the attitude ladder + the shift
// machinery are unchanged); only the LABEL differs by tone. If combat starts anyway,
// intimidated → faltering, overawed → frightened (combat conditions — #141's side).
function toneBandLabel(tone, band){
  if(tone === 'intimidating'){
    if(band === 'indifferent') return 'intimidated';
    if(band === 'friendly') return 'overawed';
  }
  return band;
}

// ── The category draw (JJ pp.41–42) + rarity (JJ p.44) — D12's "category now" half ──
// The wilderness encounter throw: 1d20 on the territory-classification column. The five
// printed columns are SHARED (e.g. "Civilized, or Borderlands + Road" is one column):
// travel on a road/navigable river folds one column left; night in Civilized/Borderlands/
// Outlands shifts one column right; a natural 1 = "column shift, roll again" (one right).
// Results: encounters are NOT all monsters — civilized / dangerous / valuable / unique
// terrain are categories of the same throw. The 1d100 identity tables are #141 (D12).
const ENCOUNTER_CATEGORY_COLUMNS = Object.freeze([
  Object.freeze({ key: 'civilized-road',  shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 11], 'civilized': [12, 20] }) }),
  Object.freeze({ key: 'civilized',       shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 10], 'civilized': [11, 17], 'monster': [18, 18], 'dangerous': [19, 19], 'valuable': [20, 20] }) }),
  Object.freeze({ key: 'borderlands',     shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 8],  'civilized': [9, 13],  'monster': [14, 15], 'dangerous': [16, 17], 'valuable': [18, 19], 'unique': [20, 20] }) }),
  Object.freeze({ key: 'outlands',        shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 8],  'civilized': [9, 11],  'monster': [12, 15], 'dangerous': [16, 17], 'valuable': [18, 19], 'unique': [20, 20] }) }),
  Object.freeze({ key: 'unsettled',       shiftOn1: false, rows: Object.freeze({ 'no-encounter': [1, 6],  'monster': [7, 12],   'dangerous': [13, 15], 'valuable': [16, 18], 'unique': [19, 20] }) })
]);
const ENCOUNTER_TERRITORY_CLASSES = Object.freeze(['civilized', 'borderlands', 'outlands', 'unsettled']);
// Column index for (territory class, road, night). Road folds one left; night (in
// civilized/borderlands/outlands) shifts one right; clamped to the table.
function encounterCategoryColumnIndex(territoryClass, opts){
  const o = opts || {};
  const t = String(territoryClass || 'unsettled').toLowerCase();
  let idx;
  if(t === 'civilized')        idx = o.road ? 0 : 1;
  else if(t === 'borderlands') idx = o.road ? 1 : 2;
  else if(t === 'outlands')    idx = o.road ? 2 : 3;
  else                          idx = o.road ? 3 : 4;   // unsettled
  if(o.night && (t === 'civilized' || t === 'borderlands' || t === 'outlands')) idx += 1;
  return Math.min(idx, ENCOUNTER_CATEGORY_COLUMNS.length - 1);
}
// One wilderness encounter throw → { category, columnKey, rolls[] }. Handles the
// natural-1 column-shift-and-roll-again chain. Step 7 (JJ p.42): a terrain-encounter
// category (dangerous/valuable/unique) demotes to no-encounter when the party is
// resting/stationary or re-traversing a route it has already traversed.
function rollEncounterCategory(opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  let idx = (typeof o.columnIndex === 'number') ? o.columnIndex
    : encounterCategoryColumnIndex(o.territoryClass, o);
  const rolls = [];
  let category = 'no-encounter';
  for(let guard = 0; guard < 6; guard++){
    const col = ENCOUNTER_CATEGORY_COLUMNS[Math.min(idx, ENCOUNTER_CATEGORY_COLUMNS.length - 1)];
    const die = 1 + Math.floor(r() * 20);
    rolls.push({ column: col.key, roll: die });
    if(die === 1 && col.shiftOn1){ idx += 1; continue; }   // column shift, roll again
    category = 'no-encounter';
    for(const cat of Object.keys(col.rows)){
      const range = col.rows[cat];
      if(die >= range[0] && die <= range[1]){ category = cat; break; }
    }
    break;
  }
  if((o.resting || o.knownRoute) && (category === 'dangerous' || category === 'valuable' || category === 'unique')){
    return { category: 'no-encounter', demoted: category, columnKey: ENCOUNTER_CATEGORY_COLUMNS[Math.min(idx, 4)].key, rolls };
  }
  return { category, columnKey: ENCOUNTER_CATEGORY_COLUMNS[Math.min(idx, 4)].key, rolls };
}
// Monster rarity by territory classification (JJ p.44): 1d20 → common/uncommon/rare/
// very-rare — the wilder the territory, the rarer the monsters.
const ENCOUNTER_RARITY_BY_TERRITORY = Object.freeze({
  'civilized':   Object.freeze([Object.freeze({ max: 14, rarity: 'common' }), Object.freeze({ max: 19, rarity: 'uncommon' }), Object.freeze({ max: 20, rarity: 'rare' })]),
  'borderlands': Object.freeze([Object.freeze({ max: 12, rarity: 'common' }), Object.freeze({ max: 18, rarity: 'uncommon' }), Object.freeze({ max: 20, rarity: 'rare' })]),
  'outlands':    Object.freeze([Object.freeze({ max: 10, rarity: 'common' }), Object.freeze({ max: 15, rarity: 'uncommon' }), Object.freeze({ max: 19, rarity: 'rare' }), Object.freeze({ max: 20, rarity: 'very-rare' })]),
  'unsettled':   Object.freeze([Object.freeze({ max: 8,  rarity: 'common' }), Object.freeze({ max: 14, rarity: 'uncommon' }), Object.freeze({ max: 18, rarity: 'rare' }), Object.freeze({ max: 20, rarity: 'very-rare' })])
});
function rollEncounterRarity(territoryClass, rng){
  const r = rng || Math.random;
  const bands = ENCOUNTER_RARITY_BY_TERRITORY[String(territoryClass || 'unsettled').toLowerCase()]
    || ENCOUNTER_RARITY_BY_TERRITORY['unsettled'];
  const die = 1 + Math.floor(r() * 20);
  for(const b of bands){ if(die <= b.max) return { roll: die, rarity: b.rarity }; }
  return { roll: die, rarity: bands[bands.length - 1].rarity };
}

// ── Frequencies (JJ p.41) ───────────────────────────────────────────────────
// How often the throw fires, by activity × territory class. Traveling (per hex) and
// Searching (per hour) are shipped triggers; Resting/Stationary is the rest-night
// day-tick consumer (E1); Hunting is flagged in the V4 forage verb.
const ENCOUNTER_FREQUENCY = Object.freeze({
  'hunting':        Object.freeze({ civilized: 'per-attempt', borderlands: 'per-attempt', outlands: 'per-attempt', unsettled: 'per-attempt' }),
  'managing-traps': Object.freeze({ civilized: null, borderlands: null, outlands: 'per-6-traps', unsettled: 'per-6-traps' }),
  'resting-day':    Object.freeze({ civilized: null, borderlands: null, outlands: null, unsettled: 'per-12-hours' }),
  'resting-night':  Object.freeze({ civilized: 'per-7-nights', borderlands: 'per-3-nights', outlands: 'per-12-hours', unsettled: 'per-12-hours' }),
  'searching':      Object.freeze({ civilized: 'per-hour', borderlands: 'per-hour', outlands: 'per-hour', unsettled: 'per-hour' }),
  'traveling':      Object.freeze({ civilized: 'per-hex', borderlands: 'per-hex', outlands: 'per-hex', unsettled: 'per-hex' })
});
// Which rest/stationary checks a camped group faces on this world day: unsettled = one
// per 12 hours day AND night; outlands = nights (per 12h); borderlands = once per 3
// nights; civilized = once per 7 nights. Cadence keys off the absolute world ordinal
// (turn×30+day) so "every 3rd night" is deterministic with no extra stored state.
function restEncounterChecksForDay(territoryClass, worldOrd){
  const t = String(territoryClass || 'unsettled').toLowerCase();
  const ord = Number(worldOrd) || 0;
  if(t === 'unsettled')   return [{ period: 'day' }, { period: 'night' }];
  if(t === 'outlands')    return [{ period: 'night' }];
  if(t === 'borderlands') return (ord % 3 === 0) ? [{ period: 'night' }] : [];
  return (ord % 7 === 0) ? [{ period: 'night' }] : [];   // civilized
}

// ── Territory classification for a hex ─────────────────────────────────────
// The hex's domain's effective classification (Civilized/Borderlands/Outlands — GM-
// stored wins, else suggested), lowercased; a domainless hex is 'unsettled' (JJ p.41).
// Reads through global.ACKS at call time (effectiveDomainClassification ships from
// acks-engine.js, which loads after this module).
function territoryClassForHex(campaign, hex){
  if(!hex || !hex.domainId) return 'unsettled';
  const A = global.ACKS || {};
  const d = (campaign && Array.isArray(campaign.domains)) ? campaign.domains.find(x => x && x.id === hex.domainId) : null;
  if(!d) return 'unsettled';
  const cls = (typeof A.effectiveDomainClassification === 'function') ? A.effectiveDomainClassification(d) : (d.classification || '');
  const t = String(cls || '').toLowerCase();
  return (t === 'civilized' || t === 'borderlands' || t === 'outlands') ? t : 'outlands';
}

// ─── Attach to ACKS namespace ────────────────────────────────────────────
const ACKS = global.ACKS = global.ACKS || {};
Object.assign(ACKS, {
  STRONGHOLD_CATALOG, MERCHANDISE_CATALOG, GENERIC_MERCHANDISE, VAGARIES_TABLE, EVENT_TABLE, HOUSERULES_REGISTRY, HOUSERULE_CATEGORIES, lookupMerchandise, merchandiseAvailableAtClass, merchandiseTariff, rollVagary, lookupVagary, sampleEvent, lookupHouseRule, lookupStrongholdStructure,
  // Favors & Duties (#230, F&D-1) — the 1d20 Favor/Duty table + muster timing (RR pp.345–348)
  FAVOR_DUTY_TABLE, lookupFavorDuty, MUSTER_TIME_BY_TITLE, musterSchedule, realmTitleForDomain,
  // Terrain model (Phase_2.5_Terrain_Model_Plan.md, T1) — taxonomy + resolution layer
  TERRAIN_BASES, TERRAIN_SUBTYPES, BIOMES, KOPPEN_CLIMATE, terrainBase, terrainKey, allTerrainSubtypes,
  biomeFromKoppen, koppenSuggestions, biomeForHex, visibilityFactorForHex, encounterTerrainForHex,
  CONSTRUCTION_DUTY_TYPES, constructionDutyTypeLabel,
  // Phase 2.5 Journeys (#475) — overland travel catalogs (J1).
  JOURNEY_MILES_PER_HEX, JOURNEY_BASE_SPEED_MILES_PER_DAY, JOURNEY_TERRAIN_SPEED,
  JOURNEY_NAV_THROWS, JOURNEY_WEATHER_SPEED, JOURNEY_TEMPERATURE_SPEED, JOURNEY_GROUND_SPEED, JOURNEY_PACE_SPEED,
  JOURNEY_RATION_PER_PERSON_DAY, JOURNEY_WATER_PER_PERSON_DAY, JOURNEY_SUPPLY_LOW_DAYS,
  JOURNEY_FATIGUE_CYCLE_DAYS,
  // #476 Monster Persistence M1 — Lairs per Hex density table (JJ p.69) + the E9 territory cap
  LAIRS_PER_HEX, LAIR_TERRAIN_ALIAS, lairDiceLabel, LAIR_CAP_PCT_BY_TERRITORY,
  // #476 Encounter layer E1 — the RAW pre-combat procedure catalogs (RR pp.280–287 + JJ pp.41–44)
  ENCOUNTER_DISTANCE_CLASSES, ENCOUNTER_TERRAIN_ROWS, encounterRowKey, encounterRowKeyForHex,
  rollEncounterDistanceFt, VISIBILITY_BASE_FT, ENCOUNTER_SIZE_MEN, formationVisibilityMult,
  maxVisibilityFt, computeEncounterDistance,
  SURPRISE_AWARENESS_STATES, surpriseAwarenessKey, surpriseStateFor, encounterEvadeEligibility, rollSurpriseThrow, SURPRISE_HIDDEN_PENALTY,
  EVASION_SIZE_BANDS, EVASION_AERIAL_EXEMPT_ROWS, evasionSizeBand, evasionTargetFor, attemptEvasionThrow, rollEvasionAftermath,
  ENCOUNTER_ATTITUDES, reactionBandFor, rollEncounterReaction,
  INFLUENCE_ATTEMPT_LADDER, influenceAttemptInfo, applyInfluenceShift, BRIBE_TIERS, bribeBonusInfo,
  ENCOUNTER_TONES, toneBandLabel,
  ENCOUNTER_CATEGORY_COLUMNS, ENCOUNTER_TERRITORY_CLASSES, encounterCategoryColumnIndex, rollEncounterCategory,
  ENCOUNTER_RARITY_BY_TERRITORY, rollEncounterRarity,
  ENCOUNTER_FREQUENCY, restEncounterChecksForDay, territoryClassForHex,
  // #476 M4 — Wilderness Search target (RR p.276)
  wildernessSearchTargetForSpeed,
  // Phase 4 Construction Wave A (RR p.174 — 2026-05-30)
  CONSTRUCTION_WORKERS, lookupConstructionWorker, totalDailyOutputCf, totalDailyWageGp,
  // Phase 2.95 §4.2 — Hireling recruitment catalogs.
  HIRELING_MARKET_CLASSES, HIRELING_MERCENARIES, HIRELING_HENCHMEN, HIRELING_SPECIALISTS,
  // Phase 2.5 §16 CoL-2 — wage-by-level (RR p.168) + Living Expenses helpers (RR p.173).
  LEVEL_MONTHLY_WAGE, levelMonthlyWage, effectiveSocialLevelForSpend,
  REACTION_TO_HIRING, HIRELING_SOLICIT_FEE_PER_WEEK, RECRUITMENT_MODIFIERS,
  // Phase 2.95 Activity Budget (#346 / AB-1) — the per-character daily activity allocation.
  ACTIVITY_BUDGET, ACTIVITY_COSTS, activityCostFor,
  // Phase 2.9 Retail Item Trade (#346 flagship / IT-1) — Equipment Availability by Market Class
  // + the price catalog seed (generic-by-price covers the rest until transcribed).
  EQUIPMENT_AVAILABILITY, equipmentPriceBand, equipmentAvailability, rollEquipmentUnitsAvailable,
  EQUIPMENT_CATALOG, lookupEquipment, equipmentByCategory
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
