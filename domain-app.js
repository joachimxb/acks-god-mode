/* =============================================================================
 * domain-app.js — ACKS God Mode Alpine application (the domainApp() component)
 * =============================================================================
 *
 * Extracted verbatim from index.html's main inline <script> (T5 chip 4, 2026-06-23)
 * — pure code-motion, no behaviour change. Defines the global domainApp() Alpine
 * component (referenced by <body x-data="domainApp()">) plus its helper consts/
 * functions; reads the engine via window.ACKS.*. index.html loads this via
 * <script src> at the exact point the inline block sat — after all engine modules,
 * before Alpine's deferred init — so domainApp is defined before Alpine initializes.
 * Classic (non-module) script: top-level `function domainApp(){...}` is the global
 * Alpine reads; the top-level consts are script-scoped exactly as they were inline.
 * ============================================================================= */
const SCHEMA_VERSION = window.ACKS.SCHEMA_VERSION; // v2 — clean break, refuses pre-v2 saves
const DEFAULT_TAX_RATES = window.ACKS.DEFAULT_TAX_RATES;
const REQUIRED_GARRISON_PER_FAMILY = window.ACKS.REQUIRED_GARRISON_PER_FAMILY;
const MORALE_LEVEL_NAMES = window.ACKS.MORALE_LEVEL_NAMES;
const MORALE_EMOJI = window.ACKS.MORALE_EMOJI;
// Full ACKS II RAW morale-level descriptions (RR pp.349-351). Canonical source: engine module.
const MORALE_STATE_TEXT = window.ACKS.MORALE_STATE_TEXT;
// Stronghold minimum value per controlled hex (ACKS II RAW p.339)
const STRONGHOLD_VALUE_PER_HEX = window.ACKS.STRONGHOLD_VALUE_PER_HEX;

// Market class + urban + settlement benchmark tables — canonical source: engine module.
const MARKET_CLASS_TABLE = window.ACKS.MARKET_CLASS_TABLE;
const lookupMarketClass = window.ACKS.lookupMarketClass;
const URBAN_INVESTMENT_TIERS = window.ACKS.URBAN_INVESTMENT_TIERS;
const urbanMaxFamilies = window.ACKS.urbanMaxFamilies;
const SETTLEMENT_BENCHMARKS = window.ACKS.SETTLEMENT_BENCHMARKS;
const lookupSettlementBenchmark = window.ACKS.lookupSettlementBenchmark;

// Stronghold structure catalog — canonical source: engine module.
const STRONGHOLD_CATALOG = window.ACKS.STRONGHOLD_CATALOG;

// House rules — canonical source: engine module.
const HOUSERULES_REGISTRY = window.ACKS.HOUSERULES_REGISTRY;
const HOUSERULE_CATEGORIES = window.ACKS.HOUSERULE_CATEGORIES;
// ACKS II RR p.374 — Common and Precious Merchandise tables (Phase 2b)
// Each entry is one of the 19 common + 10 precious merchandise types available at any market.
// Daily availability scales by market class (Class I largest, Class VI smallest); the listed "daily.X"
// figure is base stones per day at market impact 1. Real availability = daily × market_impact.
// Base price is per stone; price step is the increment by which prices shift up/down on the demand modifier
// scale (each ±1 demand modifier shifts the price by one step in the indicated direction).
// Tariff per RR p.372: 5% on common merchandise (except grain & vegetables: 0%), 20% on precious.
// Mercantile catalogs — canonical source: engine module.
const MERCHANDISE_CATALOG = window.ACKS.MERCHANDISE_CATALOG;
const GENERIC_MERCHANDISE = window.ACKS.GENERIC_MERCHANDISE;
const lookupMerchandise = window.ACKS.lookupMerchandise;
const merchandiseAvailableAtClass = window.ACKS.merchandiseAvailableAtClass;
const merchandiseTariff = window.ACKS.merchandiseTariff;

// Vagaries of Investment — distilled from the commercial-expedition column of the RR p.383-388 table,
// adapted for active arbitrage ventures (the table in RR is technically for passive investments but
// the same drama applies to in-transit cargo). Each turn an in-transit venture exists, roll once.
// Weights are illustrative (sum to 100) — about 40% no event, 25% minor positive, 25% minor negative,
// ~8% major negative, ~2% catastrophic. Tune in QA pass (#90).
// Vagaries — canonical source: engine module.
const VAGARIES_TABLE = window.ACKS.VAGARIES_TABLE;
const rollVagary = window.ACKS.rollVagary;
const lookupVagary = window.ACKS.lookupVagary;

// ─────────────────────────────────────────────────────────────────────────────
// All remaining engine constants + helpers — canonical source: acks-engine.js.
// (See Data_Dictionary.md and Schema_v2_Design.md for the full reference.)
// ─────────────────────────────────────────────────────────────────────────────
const TITLES_OF_NOBILITY = window.ACKS.TITLES_OF_NOBILITY;
const lookupTitleOfNobility = window.ACKS.lookupTitleOfNobility;
const SAVE_TABLES = window.ACKS.SAVE_TABLES;
const CLASS_TO_SAVE_ARCHETYPE = window.ACKS.CLASS_TO_SAVE_ARCHETYPE;
const classSaveArchetype = window.ACKS.classSaveArchetype;
const computeSavingThrows = window.ACKS.computeSavingThrows;
const PERSONAL_AUTHORITY_BRACKETS = window.ACKS.PERSONAL_AUTHORITY_BRACKETS;
const personalAuthorityBracketForIncome = window.ACKS.personalAuthorityBracketForIncome;
const computePersonalAuthority = window.ACKS.computePersonalAuthority;
const XP_PROGRESSION = window.ACKS.XP_PROGRESSION;
const CLASS_HD = window.ACKS.CLASS_HD;
const classKey = window.ACKS.classKey;
const xpForLevel = window.ACKS.xpForLevel;
const xpToNextLevel = window.ACKS.xpToNextLevel;
const rollHpForLevel = window.ACKS.rollHpForLevel;
const computeGpThreshold = window.ACKS.computeGpThreshold;
const INCOME_FACTOR_BY_MORALE = window.ACKS.INCOME_FACTOR_BY_MORALE;
const rollD6 = window.ACKS.rollD6;
const rollD10x = window.ACKS.rollD10x;
const clamp = window.ACKS.clamp;
// Event table, dice & morale helpers — canonical source: engine module.
const EVENT_TABLE = window.ACKS.EVENT_TABLE;
const sampleEvent = window.ACKS.sampleEvent;
const slugify = window.ACKS.slugify;
const rollNaturalIncrease = window.ACKS.rollNaturalIncrease;
const rollNaturalDecrease = window.ACKS.rollNaturalDecrease;
const rollMoraleExtra = window.ACKS.rollMoraleExtra;
const moraleChangeFromRoll = window.ACKS.moraleChangeFromRoll;
const baseMoraleFromClassification = window.ACKS.baseMoraleFromClassification;

const EMBEDDED_TEMPLATES=[
  {name:'Frontier Barony',classification:'Borderlands',type:'rural',families:150,treasury:2400,
   ruler:{name:'Sir Halvard the Bold',class:'Fighter',level:7,personalAuthority:0,isPC:false},
   landRev:6,
   garrison:[{name:'Light Infantry',count:30,monthlyWage:6,brPerSoldier:0.034},{name:'Bowmen',count:12,monthlyWage:9,brPerSoldier:0.063},{name:'Light Cavalry',count:6,monthlyWage:15,brPerSoldier:0.083}],
   stronghold:{type:'Tower',buildValue:15000,garrisonCapacity:60},
   henchmen:[{name:'Edrik the Steady',class:'Fighter',level:4,loyalty:1,role:'Captain of the Guard'}],
   notes:'Small frontier holding on the edge of civilized lands.'},
  {name:'Established March',classification:'Civilized',type:'rural',families:800,treasury:12000,
   ruler:{name:'Marchioness Theodora',class:'Fighter',level:9,personalAuthority:1,isPC:false},
   landRev:7,tariffs:200,
   garrison:[{name:'Heavy Infantry',count:80,monthlyWage:12,brPerSoldier:0.067},{name:'Bowmen',count:60,monthlyWage:9,brPerSoldier:0.063},{name:'Heavy Cavalry',count:24,monthlyWage:60,brPerSoldier:0.333}],
   stronghold:{type:'Castle',buildValue:90000,garrisonCapacity:250},
   isRealm:true,
   notes:'A well-run domain at the edge of an old kingdom.'},
  {name:'Petty Kingdom',classification:'Civilized',type:'rural',families:5000,treasury:60000,
   ruler:{name:'King Aelfric IV',class:'Fighter',level:12,personalAuthority:2,isPC:false},
   landRev:7,tariffs:800,personalExpenses:500,
   garrison:[{name:'Heavy Infantry (Royal Guard)',count:200,monthlyWage:18,brPerSoldier:0.067},{name:'Bowmen',count:400,monthlyWage:9,brPerSoldier:0.063},{name:'Light Infantry',count:400,monthlyWage:6,brPerSoldier:0.034},{name:'Heavy Cavalry (Knights)',count:100,monthlyWage:60,brPerSoldier:0.333}],
   stronghold:{type:'Citadel',buildValue:500000,garrisonCapacity:1500},
   isRealm:true,
   notes:'A small but real kingdom. Expects 4-8 vassal domains.'},
  {name:'Wilderness Outpost',classification:'Outlands',type:'wilderness',families:40,treasury:800,morale:-1,
   ruler:{name:'Captain Joro',class:'Fighter',level:5,personalAuthority:0,isPC:true,administersThisMonth:true},
   landRev:5,
   garrison:[{name:'Light Infantry (mercenary)',count:12,monthlyWage:6,brPerSoldier:0.034},{name:'Bowmen',count:6,monthlyWage:9,brPerSoldier:0.063}],
   stronghold:{type:'Tower',buildValue:5000,garrisonCapacity:20},
   notes:'PC-held adventuring base in dangerous territory.'}
];

// Entity factories — canonical source: engine module (returns v2-shaped entities).
const blankCampaign = window.ACKS.blankCampaign;
const blankDomain   = window.ACKS.blankDomain;

// Character / party factories — canonical source: engine module.
const blankCharacter = window.ACKS.blankCharacter;
const blankParty     = window.ACKS.blankParty;
// migrateCampaign — engine's no-op pass-through for v2; throws for older versions.
const migrateCampaign = window.ACKS.migrateCampaign;
// Legacy v1 placeholders below — v2 doesn't migrate from older schemas, so these are kept
// as dead stubs only to satisfy any code paths that still reference them. They are NOT called
// in v2 load flow; remove in a follow-up cleanup once #169 settles.
function blankCharacter_v1_DEAD(opts={}){
  const name = opts.name || 'New Character';
  const id   = opts.id || 'char-' + slugify(name) + '-' + Math.random().toString(36).slice(2,5);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: opts.kind || 'NPC',           // 'PC' | 'NPC' | 'henchman' | 'follower' | 'hireling'
    id, name,
    alignment: opts.alignment || 'N',   // L | N | C
    race: opts.race || 'human',
    // ACKS sheet
    class: opts.class || '',
    level: opts.level || 1,
    xp: opts.xp || 0,
    hp: opts.hp || { current: 0, max: 0, hitDice: '' },
    ac: opts.ac || 0,
    attackThrow: opts.attackThrow || 10,
    abilities: opts.abilities || { STR:10, INT:10, WIS:10, DEX:10, CON:10, CHA:10 },
    // ACKS II RR uses 5 saves: paralysis, death, blast, implements, spells. Auto-computed from class
    // archetype + level via computeSavingThrows() when class is recognized; otherwise manual entry.
    savingThrows: opts.savingThrows || { paralysis:15, death:15, blast:15, implements:15, spells:15 },
    proficiencies: opts.proficiencies || [],
    classPowers: opts.classPowers || [],
    personalAuthority: opts.personalAuthority || 0,
    henchmanCap: opts.henchmanCap || 4,
    gpThreshold: opts.gpThreshold || 0,
    // Inventory
    inventory: opts.inventory || [],
    personalGp: opts.personalGp || 0,
    // Location / travel — schema reserved; Phase 2.5 wires the map mechanics
    currentHexCoord: opts.currentHexCoord || null,
    currentDomainId: opts.currentDomainId || null,
    partyId: opts.partyId || null,
    travelDestination: opts.travelDestination || null,
    travelPace: opts.travelPace || 'walking',
    // RP dossier
    background: opts.background || '',
    personality: opts.personality || '',
    goals: opts.goals || [],
    relationships: opts.relationships || [],
    secrets: opts.secrets || '',
    voice: opts.voice || '',
    // Henchman / hireling specifics
    liegeCharacterId: opts.liegeCharacterId || null,
    loyalty: opts.loyalty || 0,
    monthlyWage: opts.monthlyWage || 0,
    // Mercantile state (RR p.43 Mercantile Network; RR p.370+ ventures).
    // mercantileNetwork: list of domain IDs visited as a trader. The RAW VENTURER class power
    // ("treat market as one class larger") applies only when class === 'Venturer' but the field
    // tracks visited markets regardless of class.
    // earningsLedger: chronological mercantile + passive-investment history.
    mercantileNetwork: opts.mercantileNetwork || [],
    earningsLedger: opts.earningsLedger || [],
    // Per-character history log: chronological entries of XP awards, level-ups, ventures, deaths, etc.
    // {turn, type:'xp'|'level-up'|'venture'|'domain'|'death'|'restore'|'note', summary, ...extra}
    history: opts.history || [],
    // Auto-advance flag (Phase 2.6 followup 8). When true, the monthly level-up sweep applies this
    // character once their XP crosses the next-level threshold. When false, XP still accrues but no
    // auto level-up — GM applies level-ups manually via the History tab. Default true; turn OFF for
    // background NPCs whose progression doesn't matter to the campaign (RR p.348 designer's note:
    // most NPC rulers settle at PA=0 by definition).
    autoAdvance: opts.autoAdvance !== false,
    // Status
    alive: opts.alive !== false,
    deceasedTurn: opts.deceasedTurn || null,
    notes: opts.notes || ''
  };
}

// (v1 blankParty removed — engine alias above is canonical.)

// (v1 dead code — never called in v2 load flow; kept temporarily for diff review)
function migrateCampaignCharacters_v1_DEAD(out){
  if(!Array.isArray(out.characters)) out.characters = [];

  // Helper: find-or-create a character by name match. Preserves any existing entry.
  function ensureCharacter(name, opts={}){
    if(!name) return null;
    const trimmed = name.trim();
    if(!trimmed) return null;
    let ch = out.characters.find(c => c.name === trimmed);
    if(ch) return ch;
    ch = blankCharacter({name: trimmed, ...opts});
    out.characters.push(ch);
    return ch;
  }

  // (a) Domain rulers: each domain.ruler.name becomes a character; back-fill characterId on domain.
  (out.domains||[]).forEach(d => {
    if(!d.rulerCharacterId && d.ruler && d.ruler.name){
      const ch = ensureCharacter(d.ruler.name, {
        kind: d.ruler.isPC ? 'PC' : 'NPC',
        class: d.ruler.class || '',
        level: d.ruler.level || 1,
        personalAuthority: d.ruler.personalAuthority || 0,
        gpThreshold: d.ruler.gpThreshold || 0,
        personality: d.ruler.personality || '',
        background: d.ruler.history || '',
        goals: d.ruler.goals || [],
        relationships: d.ruler.relationships || [],
        secrets: d.ruler.secrets || '',
        voice: d.ruler.voice || '',
        currentDomainId: d.id
      });
      if(ch) d.rulerCharacterId = ch.id;
    }
  });

  // (b) Venturers: each venturer becomes a character (or merges into existing). Phase 2.6 fold-in:
  // copy mercantileNetwork + earningsLedger onto the character, then drop the venturer record.
  (out.venturers||[]).forEach(v => {
    if(!v.name) return;
    const ch = ensureCharacter(v.name, {
      kind: 'NPC',                          // GM can flip to PC after
      class: 'Venturer',
      level: v.level || 1
    });
    if(!ch) return;
    // Merge mercantile state into the character (preserving any history that's already there)
    if(Array.isArray(v.mercantileNetwork) && v.mercantileNetwork.length){
      ch.mercantileNetwork = Array.from(new Set([...(ch.mercantileNetwork||[]), ...v.mercantileNetwork]));
    }
    if(Array.isArray(v.earningsLedger) && v.earningsLedger.length){
      ch.earningsLedger = [...(ch.earningsLedger||[]), ...v.earningsLedger];
    }
    // Track the venturer's id so we can rewrite refs on ventures + investments below
    v._migratedToCharacterId = ch.id;
  });
  // Rewrite venture.venturerId → venture.venturerCharacterId
  (out.ventures||[]).forEach(venture => {
    if(venture.venturerCharacterId) return; // already migrated
    if(venture.venturerId){
      const v = (out.venturers||[]).find(x => x.id === venture.venturerId);
      if(v && v._migratedToCharacterId){
        venture.venturerCharacterId = v._migratedToCharacterId;
      }
    } else if(venture.venturerName){
      // Fallback: link by name
      const ch = out.characters.find(c => c.name === venture.venturerName);
      if(ch) venture.venturerCharacterId = ch.id;
    }
    // Keep venturerName for display, but the id is venturerCharacterId now
    delete venture.venturerId;
  });
  // Rewrite passiveInvestment.ownerVenturerId → ownerCharacterId (if not already set above)
  (out.passiveInvestments||[]).forEach(inv => {
    if(inv.ownerVenturerId && !inv.ownerCharacterId){
      const v = (out.venturers||[]).find(x => x.id === inv.ownerVenturerId);
      if(v && v._migratedToCharacterId) inv.ownerCharacterId = v._migratedToCharacterId;
    }
    // ownerVenturerId is redundant now that we have ownerCharacterId
    delete inv.ownerVenturerId;
  });
  // Drop the venturers collection entirely
  delete out.venturers;

  // (c) Passive investments: ownerName → character, set ownerCharacterId. Don't strip ownerName
  // yet (UI still reads it); a future schema bump will after we verify migration is stable.
  (out.passiveInvestments||[]).forEach(inv => {
    if(!inv.ownerCharacterId && inv.ownerName){
      // If this investment was created from a venturer migration, link to that venturer's character
      let ch = null;
      if(inv.ownerVenturerId){
        const v = (out.venturers||[]).find(x => x.id === inv.ownerVenturerId);
        if(v && v.characterId) ch = out.characters.find(c => c.id === v.characterId);
      }
      if(!ch) ch = ensureCharacter(inv.ownerName, { kind: inv.ownerKind === 'venturer' ? 'NPC' : 'NPC' });
      if(ch) inv.ownerCharacterId = ch.id;
    }
  });

  // (d) Phase 2.6 followup 7 — ensure every character has a `history` array (idempotent).
  // (e) Phase 2.6 followup 8 — default autoAdvance=true for any pre-flag character (idempotent).
  (out.characters||[]).forEach(c => {
    if(!Array.isArray(c.history)) c.history = [];
    if(c.autoAdvance === undefined) c.autoAdvance = true;
  });
}

function migrateCampaign_v1_DEAD(c){
  const t=blankCampaign({name:c.name,id:c.id});
  const out=JSON.parse(JSON.stringify(t));
  Object.keys(c).forEach(k=>{if(c[k]!==undefined)out[k]=c[k];});
  out.schemaVersion=SCHEMA_VERSION;
  if(!Array.isArray(out.domains))out.domains=[];
  if(!Array.isArray(out.log))out.log=[];
  if(!out.houseRules||typeof out.houseRules!=='object')out.houseRules={};
  // Default currentTurn for campaigns from before this field existed
  if(typeof out.currentTurn!=='number')out.currentTurn=1;
  // Phase 2b — default new mercantile collections for pre-2b campaigns
  if(!Array.isArray(out.ventures))out.ventures=[];
  // (Phase 2.6 fold-in: out.venturers used to be defaulted here. It's now folded into out.characters
  // by migrateCampaignCharacters below, so we only default it temporarily if absent so the migration
  // walker has something to iterate.)
  if(!Array.isArray(out.venturers))out.venturers=[];
  // Phase 2b.6 — passive investments collection (RR p.383)
  if(!Array.isArray(out.passiveInvestments))out.passiveInvestments=[];
  // Phase 2.6 — characters & parties collections (RR ch.1)
  if(!Array.isArray(out.characters))out.characters=[];
  if(!Array.isArray(out.parties))out.parties=[];
  // ORDER MATTERS:
  // (1) FIRST migrate per-venturer shorthand* fields → top-level passiveInvestments[].
  //     This runs BEFORE the characters migration so out.venturers is still populated.
  (out.venturers||[]).forEach(v => {
    if(typeof v.shorthandCapital === 'number' && (v.shorthandCapital > 0 || v.shorthandEnabled)){
      out.passiveInvestments.push({
        id: 'inv-' + Math.random().toString(36).slice(2,9),
        name: v.name + ' — passive trade',
        ownerKind: 'venturer',
        ownerName: v.name,
        ownerVenturerId: v.id,                    // will be rewritten to ownerCharacterId in step 2
        type: 'commercial-expedition',
        riskTier: v.shorthandRiskTier || 'balanced',
        capital: v.shorthandCapital || 0,
        destinationDomainId: v.shorthandDestinationDomainId || null,
        enabled: !!v.shorthandEnabled,
        createdTurn: out.currentTurn || 1,
        vagaries: [],
        notes: 'Migrated from pre-2b.6 shorthand fields.'
      });
    }
    delete v.shorthandEnabled;
    delete v.shorthandCapital;
    delete v.shorthandMonthlyGp;
    delete v.shorthandRiskTier;
    delete v.shorthandDestinationDomainId;
  });
  // (2) THEN walk every free-text character ref (ruler names, venturer names, passive investment
  //     owner names) and create character entities + rewrite cross-system links. This step also
  //     DELETES out.venturers since it's been folded into out.characters. Safe to re-run.
  migrateCampaignCharacters(out);
  // Phase 2.6 followup: migrate old saving-throw keys (petrification/poison/staffs) to ACKS II
  // RAW keys (paralysis/death/implements). Idempotent — only fires if old keys still present.
  (out.characters||[]).forEach(c => {
    if(!c.savingThrows) c.savingThrows = {paralysis:15,death:15,blast:15,implements:15,spells:15};
    const s = c.savingThrows;
    if('petrification' in s && !('paralysis' in s)){ s.paralysis = s.petrification; }
    delete s.petrification;
    if('poison' in s && !('death' in s)){ s.death = s.poison; }
    delete s.poison;
    if('staffs' in s && !('implements' in s)){ s.implements = s.staffs; }
    delete s.staffs;
    // Ensure all 5 keys exist with sane defaults
    ['paralysis','death','blast','implements','spells'].forEach(k => {
      if(typeof s[k] !== 'number') s[k] = 15;
    });
  });
  // Drop legacy field if present from older folder-based saves
  delete out.domainIds;
  return out;
}

function buildDomainFromTemplate(tpl){
  // v2: blankDomain returns the v2 shape (no ruler struct; henchmenCharacterIds[] instead of henchmen[]).
  // Ruler + henchmen from the v1 starter templates are returned as a *companion characters* list that
  // the caller wires into campaign.characters and the domain's rulerCharacterId / henchmenCharacterIds.
  const d=blankDomain({name:tpl.name});
  d.classification=tpl.classification||'Borderlands';
  d.type=tpl.type||'rural';
  d.demographics.peasantFamilies=tpl.families||75;
  d.demographics.morale=(typeof tpl.morale==='number')?tpl.morale:0;
  d.treasury.gp=tpl.treasury||0;
  d.income.landRevenuePerFamily=tpl.landRev||6;
  d.income.tariffs=tpl.tariffs||0;
  d.expenses.personalExpenses=tpl.personalExpenses||0;
  // Convert v1 garrison units to v2 shape (add ids, displayName/unitTypeKey). Single-home (T6):
  // blankDomain no longer creates d.garrison, so build the legacy nested shape here — the load-time
  // garrison-units-to-units lift promotes it to campaign.units, then strip-unit-mirror drops it.
  // (Legacy/dead path: addFromTemplate is unwired + the v1 .domain.json templates were removed in v0.9.)
  d.garrison = { units:(tpl.garrison||[]).map(u => ({
    schemaVersion:2, id:window.ACKS.newId(window.ACKS.ID_PREFIXES.garrisonUnit),
    displayName:u.name||'Unit', unitTypeKey:window.ACKS.slugify(u.name||'unit'),
    count:u.count||0, monthlyWage:u.monthlyWage||0, brPerSoldier:u.brPerSoldier||0
  })) };
  if(tpl.stronghold)d.stronghold=Object.assign(d.stronghold,tpl.stronghold);
  if(tpl.specialists)d.specialists=tpl.specialists.map(s => ({
    schemaVersion:2, id:window.ACKS.newId(window.ACKS.ID_PREFIXES.specialist),
    type:s.type||'', count:s.count||1, monthlyNet:s.monthlyNet||0, characterId:null, notes:s.notes||''
  }));
  if(tpl.isRealm)d.isRealm=true;
  d.notes=tpl.notes||'';
  // Companion characters — caller creates and links these. Return alongside the domain.
  const characters=[];
  if(tpl.ruler && tpl.ruler.name){
    const rulerCh = window.ACKS.blankCharacter({
      // Delta audit I3 (2026-06-01): set the canonical five-axis fields directly
      // rather than passing the deprecated c.kind vocabulary. blankCharacter derives
      // the same values from kind, but emitting kind here re-introduced a field the
      // five-axis migration strips — so a template-built domain was not a migrate-no-op.
      name:tpl.ruler.name, controlledBy:tpl.ruler.isPC?'player':'gm', socialTier:'independent',
      class:tpl.ruler.class||'', level:tpl.ruler.level||1,
      currentDomainId:d.id
    });
    d.rulerCharacterId = rulerCh.id;
    characters.push(rulerCh);
  }
  (tpl.henchmen||[]).forEach(h => {
    const henchCh = window.ACKS.blankCharacter({
      name:h.name, controlledBy:'gm', socialTier:'henchman', class:h.class||'', level:h.level||1,
      loyalty:h.loyalty||0, liegeCharacterId:d.rulerCharacterId,
      currentDomainId:d.id, notes:h.role||''
    });
    d.henchmenCharacterIds.push(henchCh.id);
    characters.push(henchCh);
  });
  return { domain:d, characters };  // v2 shape — caller deconstructs
}

// T5 chip 5 (2026-06-23): feature method-groups are extracted to domain-app-<feature>.js mixin
// files that push a members object onto this registry; domainApp() merges them into the returned
// component with descriptor-preservation (so getters survive). See CLAUDE.md §2.
window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || [];
function _acksApplyAppMixins(component){
  for(var i=0;i<window.__ACKS_APP_MIXINS__.length;i++){
    Object.defineProperties(component, Object.getOwnPropertyDescriptors(window.__ACKS_APP_MIXINS__[i]));
  }
  return component;
}

function domainApp(){
const _component = {
  // === @b13-domvariants   (team) — Domain Variants: Pastoralist economics (economyType density): state + methods ===
  // Pastoralist economics readouts + the economyType setter. Logic lives in acks-engine-domain-variants.js;
  // these are thin pass-throughs (Phase 5 §3, JJ pp.436–438). domainPastoralistInfo recomputes on read,
  // so flipping a hex's economy re-renders the panel AND the income breakdown's Land revenue row live.
  domainPastoralistInfo(d){
    return (d && window.ACKS && window.ACKS.domainPastoralistInfo)
      ? window.ACKS.domainPastoralistInfo(this.currentCampaign, d)
      : { hasPastoralist:false, hexes:[], factor:1, densityPct:100, ruralHexCount:0, pastoralistHexCount:0 };
  },
  pastoralistEconomyOptions(){
    const A = window.ACKS;
    const opts = [{ value:'agricultural', label:'Agricultural (default)' }];
    if(A && A.pastoralistEconomyTypes) (A.pastoralistEconomyTypes()||[]).forEach(k => opts.push({ value:k, label:A.pastoralistEconomyLabel(k) }));
    return opts;
  },
  setHexEconomy(hexId, value){
    if(!hexId || !this.currentCampaign || !window.ACKS || !window.ACKS.setHexEconomyType) return;
    const r = window.ACKS.setHexEconomyType(this.currentCampaign, hexId, value);
    if(r && r.ok && !r.unchanged){
      if(this.markDirty) this.markDirty();
      if(this.schedulePersist) this.schedulePersist();
      if(this.showToast) this.showToast('🐄 Economy: ' + window.ACKS.pastoralistEconomyLabel(r.from) + ' → ' + window.ACKS.pastoralistEconomyLabel(r.to));
    }
  },
  // === @b13-lifecycle     (team) — Lifecycle CL-4b deepening (education / delegation / fertility): state + methods ===
  // The three deferred AXIOMS-19 mechanics over acks-engine-lifecycle.js (educateCharacter /
  // applyReserveXpToHeir / delegateAuthority / characterFamilyInfo + the fertility auto-roll that rides
  // the monthly turn via processFamilyForTurn). Surfaced in the b12 Dynasty card + modal (per the modal's
  // dynModalChar()); gated on the dynasty-tracking house rule (the b12 dynastyTrackingOn()). Reuses the
  // b12 _dynTouch (markDirty + schedulePersist + showToast).
  famUi: { eduTutor:'basic', eduFocus:'', eduPayerId:'', reserveAmount:'', delMode:'hands-on', delDelegateId:'' },
  famInfo(ch){ const A=window.ACKS; if(!ch || !A || !A.characterFamilyInfo) return { fertile:false, delegation:{ mode:'hands-on' } }; try { return A.characterFamilyInfo(this.currentCampaign, ch); } catch(e){ return { fertile:false, delegation:{ mode:'hands-on' } }; } },
  famTutors(){ return (window.ACKS && window.ACKS.educationTutorsList) ? window.ACKS.educationTutorsList() : []; },
  famDelegationModes(){ return (window.ACKS && window.ACKS.delegationModesList) ? window.ACKS.delegationModesList() : []; },
  famCharOptions(){ return (this.currentCampaign?.characters||[]).filter(x => x && x.alive !== false && x.lifecycleState !== 'deceased').map(x=>({ id:x.id, name:x.name })); },
  famFertilityText(ch){ const i=this.famInfo(ch); if(i.pregnant) return '🤰 Pregnant — due in ' + i.dueInMonths + ' month' + (i.dueInMonths===1?'':'s') + '.'; if(i.fertile) return 'Fertile — ~' + Math.round((i.annualFertility||0)*100) + '%/active-year conception, ' + i.pregnancies + '/' + i.pregnancyCap + ' lifetime pregnancies. A married couple conceives automatically each monthly turn.'; const why = i.fertilitySuspended ? 'fertility suspended' : !i.sexCanBear ? 'not a bearing sex' : !i.fertileAge ? 'not of bearing age' : ((i.pregnancies||0) >= (i.pregnancyCap||0) ? 'lifetime cap reached' : 'unmarried, or no eligible partner'); return 'Not currently bearing (' + why + ').'; },
  famEducationText(ch){ const e=this.famInfo(ch).education; if(!e) return 'Not in education.'; return 'In education — ' + e.tutorLabel + ', +' + e.xpPerMonth + ' XP/mo' + (e.focus ? (', focus: ' + e.focus + (e.focusGranted?' ✓':'')) : '') + ' · level ' + e.level + '.'; },
  famDelegationText(ch){ const d=this.famInfo(ch).delegation; if(!d || d.mode==='hands-on') return 'Hands-On — the ruler runs the realm personally.'; return d.label + ' — ' + (d.delegate ? ('delegate: ' + d.delegate.name + (d.delegate.deceased?' (deceased!)':'')) : (d.delegateMissing?'delegate missing':'no delegate')) + (d.freesRuler ? ' · free to adventure' : '') + '.'; },
  famEducate(){ const ch=this.dynModalChar(); if(!ch || !window.ACKS) return; const res=window.ACKS.educateCharacter(this.currentCampaign, ch.id, { tutor:this.famUi.eduTutor, focus:this.famUi.eduFocus||undefined, payerCharacterId:this.famUi.eduPayerId||undefined }); if(res && res.error){ this._dynTouch('Cannot educate: ' + res.error); return; } this._dynTouch(ch.name + ' begins education under a ' + (this.famUi.eduTutor) + ' tutor.'); },
  famEndEducation(){ const ch=this.dynModalChar(); if(!ch || !window.ACKS) return; window.ACKS.endEducation(this.currentCampaign, ch.id); this._dynTouch(ch.name + "'s education ends."); },
  famApplyReserve(){ const ch=this.dynModalChar(); if(!ch || !window.ACKS) return; const amt=this.famUi.reserveAmount!=='' ? (parseInt(this.famUi.reserveAmount,10)||0) : null; const res=window.ACKS.applyReserveXpToHeir(this.currentCampaign, ch.id, amt!=null?{amount:amt}:{}); if(res && res.error){ this._dynTouch('Cannot apply: ' + res.error); return; } this.famUi.reserveAmount=''; this._dynTouch(res.moved ? (ch.name + ' gains ' + res.moved + ' reserve XP (level ' + res.heirLevel + ').') : 'No reserve XP available.'); },
  famDelegate(){ const ch=this.dynModalChar(); if(!ch || !window.ACKS) return; const res=window.ACKS.delegateAuthority(this.currentCampaign, ch.id, { mode:this.famUi.delMode, delegateCharacterId:this.famUi.delDelegateId||undefined }); if(res && res.error){ this._dynTouch('Cannot delegate: ' + res.error); return; } this._dynTouch(res.freesRuler ? (ch.name + ' delegates the realm — free to adventure.') : (ch.name + ' sets ' + res.mode + ' governance.')); },
  famToggleSuspend(){ const ch=this.dynModalChar(); if(!ch) return; ch.fertilitySuspended = !(ch.fertilitySuspended===true); this._dynTouch(ch.fertilitySuspended ? (ch.name + ' suspends fertility.') : (ch.name + ' resumes fertility.')); },
  // === @b13-customclasses (team) — Custom Classes W2 (power compendium + trade-offs / drawbacks): state + methods ===
  // The 🛠 Class Builder (W4-flavoured Generation-mode wizard over the W1/W2 derivation engine).
  // Launched from Inspector ▸ ✨ Create ▸ Class Template. Human builds (racial classes are W3); a
  // template stores build points + structured trade-off CHOICES + drawbacks + powers, and the engine
  // (window.ACKS.deriveClassFromTemplate / customClassBuildBalance / customClassSecondLevelXp) derives
  // the stat block + XP + power budget LIVE. Create → createCustomClass (init-on-write, isSeed:false).
  ccBuilder: {
    open: false, displayName: '',
    bp: { hd: 0, fighting: '0', thievery: 0, divine: 0, arcane: 0 },   // fighting is the '0'|'1a'|'1b'|'2'|'3'|'4' dropdown
    armorReducedTo: '', weaponReducedTo: '', fightingStylesDropped: 0, damageTradeOff: 'none', rebukeTradeOff: false, thiefSkillsTraded: 0,
    drawbacks: [], powers: [],
    newPower: '', newPowerWeight: 1, newPowerLevel: 1, newDrawback: ''
  },
  ccFightingChoices: ['0', '1a', '1b', '2', '3', '4'],
  openClassBuilder(){
    this.ccBuilder = { open: true, displayName: '', bp: { hd: 0, fighting: '0', thievery: 0, divine: 0, arcane: 0 },
      armorReducedTo: '', weaponReducedTo: '', fightingStylesDropped: 0, damageTradeOff: 'none', rebukeTradeOff: false, thiefSkillsTraded: 0,
      drawbacks: [], powers: [], newPower: '', newPowerWeight: 1, newPowerLevel: 1, newDrawback: '' };
  },
  closeClassBuilder(){ this.ccBuilder.open = false; },
  // Build a transient ClassTemplate from the current Builder state (the engine derives everything off it).
  ccBuilderTemplate(){
    const A = window.ACKS, b = this.ccBuilder;
    const f = b.bp.fighting;
    const fightingVal = (f === '1a' || f === '1b') ? 1 : (Number(f) || 0);
    const fightingSubtype = (f === '1a' || f === '1b') ? f : null;
    return A.blankClassTemplate({
      key: '', displayName: b.displayName || 'New Class', raceTemplateKey: null,
      buildPoints: { hd: Number(b.bp.hd) || 0, fighting: fightingVal, thievery: Number(b.bp.thievery) || 0, divine: Number(b.bp.divine) || 0, arcane: Number(b.bp.arcane) || 0 },
      fightingSubtype: fightingSubtype,
      choices: {
        armorReducedTo: b.armorReducedTo || null, weaponReducedTo: b.weaponReducedTo || null,
        fightingStylesDropped: Number(b.fightingStylesDropped) || 0,
        damageTradeOff: b.damageTradeOff || 'none', rebukeTradeOff: !!b.rebukeTradeOff,
        thiefSkillsTraded: Number(b.thiefSkillsTraded) || 0
      },
      customDrawbacks: b.drawbacks.slice(), customPowers: b.powers.slice(),
      isSeed: false
    });
  },
  ccBuilderDerived(){ const A = window.ACKS; return A.deriveClassFromTemplate(this.ccBuilderTemplate(), null) || {}; },
  ccBuilderXp(){ const A = window.ACKS; return A.customClassSecondLevelXp(this.ccBuilderTemplate(), null); },
  ccBuilderBalance(){ const A = window.ACKS; return A.customClassBuildBalance(this.ccBuilderTemplate()); },
  ccBuilderTotalBp(){ const A = window.ACKS; return A.customClassTotalBuildPoints(this.ccBuilderTemplate()); },
  ccBuilderBreakdown(){ const A = window.ACKS; return A.fightingTradeOffBreakdown(this.ccBuilderTemplate()); },
  ccFightingRow(){ const A = window.ACKS; return A.fightingDefaults(this.ccBuilder.bp.fighting); },
  ccFightingHasValue(){ const f = this.ccBuilder.bp.fighting; return f && f !== '0'; },
  // Armour/weapon reduction options = the tiers strictly BELOW the Fighting Value default (you can only reduce).
  ccArmorOptions(){
    const A = window.ACKS, def = this.ccFightingRow().armorProf;
    const di = A.ARMOR_TIERS.indexOf(def);
    return A.ARMOR_TIERS.filter((_, i) => i < di);
  },
  ccWeaponOptions(){
    const A = window.ACKS, def = this.ccFightingRow().weaponSelection;
    const di = A.WEAPON_TIERS.indexOf(def);
    return A.WEAPON_TIERS.filter((_, i) => i < di);
  },
  ccDrawbackOptions(){ const A = window.ACKS; return A.CUSTOM_DRAWBACKS; },
  ccCompendiumPowers(){ const A = window.ACKS; return A.customPowerCompendium(this.currentCampaign); },   // gated by custom-power-compendium
  ccAddDrawback(){
    const A = window.ACKS, name = this.ccBuilder.newDrawback;
    if(!name) return;
    const known = A.findCustomDrawback(name);
    this.ccBuilder.drawbacks.push({ name: name, powerWeight: known ? known.powerWeight : -1 });
    this.ccBuilder.newDrawback = '';
  },
  ccRemoveDrawback(i){ this.ccBuilder.drawbacks.splice(i, 1); },
  ccAddPower(){
    const name = (this.ccBuilder.newPower || '').trim();
    if(!name) return;
    this.ccBuilder.powers.push({ name: name, powerWeight: Number(this.ccBuilder.newPowerWeight) || 1, levelUnlocked: Number(this.ccBuilder.newPowerLevel) || 1, pageRef: '' });
    this.ccBuilder.newPower = ''; this.ccBuilder.newPowerWeight = 1; this.ccBuilder.newPowerLevel = 1;
  },
  ccAddCompendiumPower(name){ if(name){ this.ccBuilder.newPower = name; this.ccAddPower(); } },
  ccRemovePower(i){ this.ccBuilder.powers.splice(i, 1); },
  submitClassBuilder(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    const A = window.ACKS, b = this.ccBuilder;
    if(!(b.displayName || '').trim()){ if(this.showToast) this.showToast('Give the class a name first.'); return; }
    const t = this.ccBuilderTemplate();
    t.key = (b.displayName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('class-' + Date.now());
    // createCustomClass(campaign, opts) re-wraps opts through blankClassTemplate (a fresh id) — t is
    // opts-shaped (it IS a template), so key/displayName/buildPoints/choices/powers/drawbacks all carry.
    const created = A.createCustomClass(this.currentCampaign, t);   // init-on-write; isSeed:false on t
    this.markDirty && this.markDirty(); this.schedulePersist && this.schedulePersist();
    this.closeClassBuilder();
    if(created){ this.inspectorOpenInspect && this.inspectorOpenInspect('custom-class', created.id); }
    if(this.showToast) this.showToast('🛠 Class “' + (b.displayName) + '” built — ' + this.ccBuilderXp() + ' XP to 2nd level. Tweak it in the Inspector.');
  },
  // === @b13-religion      (team) — Religion R6 (apotheosis upkeep + dungeon co-extraction): state + methods ===
  // Thin Alpine layer over the acks-engine-religion.js R6 verbs (ascendToIncarnation /
  // convertDivinePowerToVitality / setCongregationUsurpedDungeon) + the read accessors. Surfaced as the
  // 👑 Ascended Incarnations panel in the ⛪ Religion view. Each action mutates currentCampaign through the
  // engine (which emits the `apotheosis` events) then markDirty + schedulePersist + a toast.
  religionAscendPick: '',            // the character selected in the ascend picker
  religionVitalityGp: {},            // per-incarnation DP→vitality amount (keyed by charId)
  religionCongDungeon: {},           // per-congregation dungeon link (keyed by congId)
  religionIncarnations(){
    const c = this.currentCampaign; if(!c) return [];
    return (c.characters || []).filter(ch => ch && window.ACKS.isIncarnation(ch) && ch.alive !== false).map(ch => {
      const st = window.ACKS.incarnationUpkeepState(ch);
      const dp = window.ACKS.divinePowerAvailable(c, ch.id);
      return { id: ch.id, name: ch.name || ch.id, st, dp,
        sustainedDays: st.upkeepGp > 0 ? Math.floor(dp / st.upkeepGp) : null };
    });
  },
  religionAscendCandidates(){
    const c = this.currentCampaign; if(!c) return [];
    return (c.characters || []).filter(ch => ch && ch.alive !== false && !window.ACKS.isIncarnation(ch))
      .map(ch => ({ id: ch.id, name: (ch.name || ch.id) + ' · L' + (ch.level || 1) }));
  },
  religionAscend(){
    const id = this.religionAscendPick; if(!id) return;
    const r = window.ACKS.ascendToIncarnation(this.currentCampaign, { characterId: id });
    if(!r || !r.ok){ this.showToast('Cannot ascend: ' + ((r && r.reason) || 'failed')); return; }
    this.religionAscendPick = '';
    this.markDirty(); this.schedulePersist();
    const ds = r.deathSave || {};
    this.showToast(r.outcome === 'ascended'
      ? '👑 Ascended to an incarnation (Death save ' + ds.total + ' vs ' + ds.target + '+) — daily upkeep ' + (r.upkeepGp || 0).toLocaleString() + ' gp DP'
      : '💀 Apotheosis failed — obliterated forever (Death save ' + ds.total + ' vs ' + ds.target + '+)');
  },
  religionConvertVitality(charId){
    const gp = Number(this.religionVitalityGp[charId]) || 0; if(gp <= 0) return;
    const r = window.ACKS.convertDivinePowerToVitality(this.currentCampaign, charId, gp);
    if(!r || !r.ok){ this.showToast('Cannot convert: ' + (r && r.reason === 'insufficient-divine-power' ? 'not enough divine power' : (r && r.reason) || 'failed')); return; }
    this.religionVitalityGp[charId] = '';
    this.markDirty(); this.schedulePersist();
    this.showToast('✦ Channeled ' + r.spentGp.toLocaleString() + ' gp DP into vitality (+' + r.xpGained.toLocaleString() + ' XP)');
  },
  religionSovereignDungeons(){
    const c = this.currentCampaign; if(!c) return [];
    return (c.dungeons || []).filter(d => d && d.sovereignCharacterId).map(d => ({
      id: d.id, name: (d.name || d.id) + ' · ' + (window.ACKS.dungeonCoExtractionDivinePowerPerDay(c, d) * 7).toLocaleString() + ' gp/wk' }));
  },
  religionCoExtractRows(){
    const c = this.currentCampaign; if(!c) return [];
    return (c.congregations || []).filter(g => g && (!g.status || g.status === 'active' || g.status === 'declining')).map(g => ({
      id: g.id, name: g.name || g.id,
      dungeonId: g.usurpedDungeonId || '', weeklyGp: window.ACKS.congregationUsurpedDungeonWeeklyGp(c, g) }));
  },
  religionLinkDungeon(congId){
    const dn = this.religionCongDungeon[congId] || null;
    const r = window.ACKS.setCongregationUsurpedDungeon(this.currentCampaign, congId, dn);
    if(!r || !r.ok){ this.showToast('Cannot link dungeon: ' + ((r && r.reason) || 'failed')); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast(dn ? '🔗 The chaplain co-extracts divine power from the dungeon' : 'Co-extraction unlinked');
  },
  // ════ TEAM SESSION (burst14 2026-06-21) — per-lane Alpine state + methods. Each builder inserts its
  //      data props + methods AFTER its own @b14-<lane> marker (disjoint lines → clean merge at integration).
  //      UI markup goes in each lane's OWN subsystem region (disjoint — no marker needed there). ════
  // === @b14-domvariants  (team) — Domain Variants P5-TERR (Terrain Transformation): state + methods ===
  // Thin Alpine pass-throughs over acks-engine-domain-variants.js (Phase 5 §4; JJ p.412). The terrain-
  // transformation logic lives in the engine; these read it for the Economy-tab 🏔 panel. The processor
  // recomputes on read (no stored UI state). Loads after the engine via window.ACKS.
  terrainTransformRuleOn(){
    return !!(this.currentCampaign && window.ACKS && window.ACKS.isHouseRuleEnabled
      && window.ACKS.isHouseRuleEnabled(this.currentCampaign, 'terrain-transformation'));
  },
  _terrainPairLabel(t){
    if(!t || !t.terrain) return '—';
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    return cap(t.terrain) + (t.subtype ? ' (' + t.subtype + ')' : '');
  },
  // The per-domain terrain-transformation readout: each populated land hex's lineage (natural → current,
  // with the population stage) + any pending stage-crossing (a dry-run, scoped to this domain).
  domainTerrainTransformInfo(d){
    const c = this.currentCampaign, A = window.ACKS;
    if(!c || !d || !A || !A.hexTerrainLineage) return { ruleOn:false, hexes:[], pending:[] };
    const ruleOn = !!(A.isHouseRuleEnabled && A.isHouseRuleEnabled(c, 'terrain-transformation'));
    const hexes = (A.hexesForDomain ? (A.hexesForDomain(c, d.id) || []) : [])
      .filter(h => h && (Number(h.families) || 0) > 0 && A.terrainBase(h.terrain) !== 'water');
    const pendingAll = (A.processTerrainTransformationForTurn
      ? (A.processTerrainTransformationForTurn(c, { dryRun:true, domainId:d.id }).transformations || []) : []);
    const pendByHex = {}; pendingAll.forEach(t => { pendByHex[t.hexId] = t; });
    const rows = hexes.map(h => {
      const lin = A.hexTerrainLineage(h);
      const pend = pendByHex[h.id] || null;
      return {
        hexId: h.id,
        hexLabel: (A.hexName && A.hexName(h)) || h.name || ((A.terrainBase(h.terrain) || 'hex') + (h.id ? ' · ' + h.id : '')),
        families: lin.families, stage: lin.stage, transformed: lin.transformed,
        naturalLabel: this._terrainPairLabel(lin.natural), currentLabel: this._terrainPairLabel(lin.current),
        pending: pend ? { toLabel: this._terrainPairLabel({ terrain:pend.toTerrain, subtype:pend.toSubtype }), direction: pend.direction, toStage: pend.toStage } : null,
      };
    });
    return { ruleOn, hexes: rows, pending: pendingAll };
  },
  // GM "Apply now": commit this domain's pending terrain transformations immediately (otherwise they
  // apply on the next monthly turn — idempotent either way). Scoped to the domain via opts.domainId.
  applyTerrainTransformations(d){
    const c = this.currentCampaign, A = window.ACKS;
    if(!c || !d || !A || !A.processTerrainTransformationForTurn) return;
    const r = A.processTerrainTransformationForTurn(c, { domainId:d.id });
    const n = (r.transformations || []).length;
    this.showToast(n > 0 ? ('🏔 ' + n + ' hex' + (n === 1 ? '' : 'es') + ' transformed (JJ p.412)') : 'No hexes crossed a transformation threshold');
    if(typeof this.persistCampaignSoon === 'function') this.persistCampaignSoon();
    else if(typeof this.saveToLocal === 'function') this.saveToLocal();
  },
  // Open the Construction Wizard pre-filled to raise a siege-support work against this siege.
  openSiegeWorkWizard(siege, supportType){
    if(!siege) return;
    this.openConstructionWizard({
      kind: 'siege-construction', siegeId: siege.id, siegeSupportType: supportType,
      siteHexId: siege.hexId || '',
      name: supportType === 'circumvallation' ? ('Circumvallation of ' + (siege.name || 'the siege'))
                                               : ('Field-assembly at ' + (siege.name || 'the siege')) });
    if(this.closeSiegePanel) this.closeSiegePanel();
  },
  weatherHexCardLine(hex){
    if(!this.currentCampaign || !hex) return '';
    const r = window.ACKS.weatherForHex(this.currentCampaign, hex);
    return r ? window.ACKS.weatherSummaryText(r) : '';
  },
  weatherMapLegendRows(){ return window.ACKS.weatherMapLegend(); },
  weatherCurrentDayLabel(){
    const cal = (this.currentCampaign && this.currentCampaign.calendar) || {};
    const day = (this.currentCampaign && this.currentCampaign.currentDayInMonth) || cal.day || 1;
    return 'today (day ' + day + (cal.season ? ' · ' + cal.season : '') + ')';
  },
  // DC-0 read-only spatial conditions for the State-of-the-Domain panel. Wraps the pure engine
  // read (ACKS.domainSpatialConditions) and resolves each witness hexId → a human label
  // (settlement name + col·row). Returns null when there is no campaign/domain. Engine stays DOM-free.
  domainAdvancementSpatial(d){
    const c=this.currentCampaign; if(!c||!d) return null;
    const sc=window.ACKS.domainSpatialConditions(c,d);
    const label=id=>{ if(!id) return ''; const h=window.ACKS.findHex(c,id); if(!h||!h.coord) return '';
      const s=window.ACKS.settlementForHex(c,h.id); const nm=(s&&s.name)?s.name:'';
      const cr=window.ACKS.hexDisplayLabel(h.coord.q,h.coord.r); return nm?(nm+' ('+cr+')'):cr; };
    sc.roadToTown.witnessLabel=label(sc.roadToTown.witnessHexId);
    sc.friendlyCity.witnessLabel=label(sc.friendlyCity.witnessHexId);
    return sc;
  },
  SCHEMA_VERSION,REQUIRED_GARRISON_PER_FAMILY,TEMPLATES:EMBEDDED_TEMPLATES,HOUSERULES:HOUSERULES_REGISTRY,HOUSERULE_CATEGORIES,STRONGHOLD_CATALOG,
  MERCHANDISE_CATALOG, GENERIC_MERCHANDISE, VAGARIES_TABLE,
  lookupMerchandise, merchandiseAvailableAtClass, merchandiseTariff,
  rollVagary, lookupVagary,
  blankCharacter, blankParty,
  fsaOpenSupported:'showOpenFilePicker' in window,
  fsaSaveSupported:'showSaveFilePicker' in window,
  fileHandle:null,fileName:'',
  // Data-durability (ux-product audit Critical, 2026-05-31). dirty = there are content
  // changes not yet written to the bound .acks.json file. Drives the header indicator +
  // the beforeunload guard. _persistTimer backs the debounced localStorage session cache.
  dirty:false, _persistTimer:null, _ignoreMutations:false,
  // NOTE (perf T11, revised): a frame-scoped render memo used to live here to coalesce the
  // 3×/render duplicate reads of activityDashboardRows/campaignLogEntries. It was REMOVED — it
  // stored the memo on a reactive data prop (`this._frameMemo`) and reset it on a microtask, so
  // inside a render getter it wrote reactive state during render → retrigger → microtask reset →
  // re-render → write → a perpetual reactive loop that hung the app on load (invisible to the
  // headless tests). The real win is the engine's WeakMap eventLog index (acks-engine.js), which
  // makes each call O(characters + cost-events); the few duplicate calls per render are now cheap,
  // so the getters compute directly with no reactive write.
  currentCampaign:null,selectedDomainId:null,
  // Single home for domains (refactor 2026-06-05, audit T3): domains live on
  // currentCampaign.domains — there is no separate copy. `domains` is a getter/setter view over
  // it, so the ~130 template reads AND the few `this.domains = …` assign sites keep working while
  // there is exactly one source of truth (no split / empty-on-load / re-stitch-on-save dance).
  get domains(){ return (this.currentCampaign && this.currentCampaign.domains) || []; },
  set domains(v){ if(this.currentCampaign) this.currentCampaign.domains = v; },
  // Top-level view tabs. Extensible — add Phase 2.7 syndicates, Phase 4 senates, etc. by adding entries here.
  // #225 (2026-06-02): default is now World; the Domains manager (which hosts the first-run welcome
  // banner) is the default World sub-view, so the landing experience is unchanged.
  currentView:'domains',   // UI overhaul 2026-06-22 — default lands on Domains (the heart of the tool + first-run welcome banner)
  activeTab:'overview',
  // Tabs: Hexes is standard (land value per hex is RAW ACKS). House-rule-gated tabs in later phases
  // (Phase 4 senate, Phase 4.6 mines/mushroom-farms, etc.) will insert into this list conditionally.
  get tabs(){
    return ['overview','demographics','investment','economy','officers','military','vassalage','stronghold','history'];   // 'investment' added 2026-06-23 (Agricultural + Urban + Domain advancement); 'raw' tab removed (UI overhaul 2026-06-22)
  },
  turnProposal:null,turnProposalError:'',   // (showTurnModal retired 2026-06-13 — the turn now stages in Review ▸ Domain Review)
  turnLivingExpenseProposal:null, // CoL-2 — end-of-month living-expenses + henchman-wage preview (dryRun)
  turnSyndicateTributeProposal:null, // HJ-2 — end-of-month syndicate tribute auto-take preview (dryRun)
  turnVentureProposals:null, // Phase 2b.5 — per-turn vagaries for in-transit ventures, set in proposeMonthlyTurn
  turnEventProposals:null, // Turn Cycle v2 — per-turn pending event proposals (accept/edit/reject), set in proposeMonthlyTurn
  dayTickProposal:null, // Phase 2.95 — active proposed day-tick (null when none pending)
  dayTickError:null,    // Phase 2.95 — last day-tick error string for inline display
  rawJsonError:'',toast:'',toastType:'',_toastTimer:null,
  magicItemAddKey: '', magicItemAddMakerId: '', magicItemDetailId: null,
  magicItemIdCharId: '', magicItemIdMethod: 'equip', magicItemResult: null, magicItemCatalogOpen: false,
  magicItemList(){ return (this.currentCampaign && this.currentCampaign.notableItems) || []; },
  magicItemCatalogList(){ return (window.ACKS.magicItemCatalog && window.ACKS.magicItemCatalog()) || []; },
  magicItemCharacters(){ return (this.currentCampaign && this.currentCampaign.characters) || []; },
  magicItemRarityOf(ni){ const A=window.ACKS; const bc=A.magicItemBaseCost(this.currentCampaign, ni); return (ni && ni.intrinsic && ni.intrinsic.rarity) || (bc!=null ? A.magicItemRarity(bc) : '—'); },
  magicItemBaseCostOf(ni){ const bc=window.ACKS.magicItemBaseCost(this.currentCampaign, ni); return bc!=null ? bc : null; },
  magicItemChargesOf(ni){ return window.ACKS.magicItemCharges(this.currentCampaign, ni); },
  magicItemIsDepletedUi(ni){ return window.ACKS.magicItemIsDepleted(ni); },
  magicItemIdStatus(ni){ const A=window.ACKS; const m=(ni && ni.identification && ni.identification.knownProperties)||{}; const ids=Object.keys(m); if(!ids.length) return 'unidentified'; return ids.some(cid=>A.isItemFullyIdentifiedBy(ni, cid)) ? 'fully identified' : 'partly identified'; },
  addMagicItemFromCatalog(){ const A=window.ACKS, key=this.magicItemAddKey; if(!key){ this.showToast('Pick a catalog item first.', 2500); return; } const ni=A.createNotableFromCatalog(this.currentCampaign, key, this.magicItemAddMakerId ? { makerCharacterId:this.magicItemAddMakerId } : {}); if(!ni){ this.showToast('Could not create that item.', 3000); return; } this.magicItemAddKey=''; this.magicItemAddMakerId=''; this.markDirty(); this.schedulePersist(); this.showToast('Added '+(ni.name||ni.kind)+'.', 3000); this.openMagicItemDetail(ni.id); },
  openMagicItemDetail(id){ this.magicItemDetailId=id; this.magicItemResult=null; this.magicItemIdCharId=''; this.magicItemIdMethod='equip'; },
  closeMagicItemDetail(){ this.magicItemDetailId=null; this.magicItemResult=null; },
  magicItemDetail(){ const id=this.magicItemDetailId; if(!id) return null; return this.magicItemList().find(n=>n && n.id===id) || null; },
  magicItemSpread(){ const ni=this.magicItemDetail(); return ni ? window.ACKS.magicItemPriceSpread(this.currentCampaign, ni) : null; },
  magicItemDetailMethods(){ const ni=this.magicItemDetail(); if(!ni) return []; const ch=this.magicItemIdCharId ? this.magicItemCharacters().find(c=>c.id===this.magicItemIdCharId) : null; return window.ACKS.magicItemIdMethodsFor(this.currentCampaign, ni, ch); },
  magicItemKnownList(ni){ if(!ni || !ni.identification || !ni.identification.knownProperties) return []; const m=ni.identification.knownProperties, out=[]; Object.keys(m).forEach(cid=>{ const c=this.magicItemCharacters().find(x=>x.id===cid); out.push({ who:(c&&c.name)||cid, keys:(m[cid]||[]).join(', ') }); }); return out; },
  runMagicItemAppraise(){ const ni=this.magicItemDetail(); if(!ni) return; const r=window.ACKS.appraiseMagicItem(this.currentCampaign, { itemId:ni.id, characterId:this.magicItemIdCharId||null }); this.markDirty(); this.schedulePersist(); this.magicItemResult = r.ok ? { ok:true, msg:'Appraised: '+r.spread.rarityLabel+', base '+r.spread.baseCost+'gp · buy ~'+r.spread.buy+' · sell ~'+r.spread.sell+' · commission ~'+r.spread.commission } : { ok:false, msg:'Appraise failed: '+r.error }; this.showToast('Appraised '+(ni.name||ni.kind)+'.', 2500); },
  runMagicItemIdentify(){ const ni=this.magicItemDetail(); if(!ni) return; if(!this.magicItemIdCharId){ this.showToast('Pick a character to identify.', 2500); return; } const r=window.ACKS.identifyMagicItem(this.currentCampaign, { itemId:ni.id, characterId:this.magicItemIdCharId, method:this.magicItemIdMethod }); if(!r.ok){ this.magicItemResult={ ok:false, msg:'Cannot identify: '+(r.error||'unavailable') }; return; } this.markDirty(); this.schedulePersist(); this.magicItemResult = { ok:r.success, msg: r.success ? ('Identified — learned: '+((r.learned&&r.learned.join(', '))||'(already known)')) : 'Identification FAILED — no retry until this character gains a level.' }; this.showToast(r.success?'Identified.':'Identification failed.', 2500); },
  runMagicItemUseCharge(){ const ni=this.magicItemDetail(); if(!ni) return; const r=window.ACKS.useMagicItemCharge(this.currentCampaign, { itemId:ni.id, characterId:this.magicItemIdCharId||null, count:1 }); if(!r.ok){ this.magicItemResult={ ok:false, msg:'Cannot use a charge: '+r.error }; return; } this.markDirty(); this.schedulePersist(); this.magicItemResult = { ok:true, msg:'Spent 1 charge ('+r.chargesAfter+' left)'+(r.depleted?' — depleted; now non-magical.':'.') }; this.showToast('Charge spent.', 2000); },
  // ─── 📚 Knowledge Layer Wave A (team burst7) — the Lore tab (who-knows-what over the eventLog) ───
  knowledgeSelectedLoreId: null,
  knowledgeNewFact: { text:'', topic:'', loreKind:'fact', truthValue:'unknown', subjectIds:'' },
  knowledgeLearnKnowerId: '',
  knowledgeLearnCertainty: 'suspected',
  knowledgeLearnSourceKind: 'told-by',
  knowledgeLearnTask: 'knowledge:recall',
  knowledgeViewCharId: '',
  knowledgeShareToId: '',
  knowledgeLoreList(){ return (this.currentCampaign && this.currentCampaign.lore) || []; },
  knowledgeSelectedLore(){ return this.knowledgeSelectedLoreId ? window.ACKS.findLore(this.currentCampaign, this.knowledgeSelectedLoreId) : null; },
  knowledgeCharName(id){ if(!id) return '—'; const cs=(this.currentCampaign && this.currentCampaign.characters)||[]; const c=cs.find(x=>x&&x.id===id); return (c&&c.name)||id; },
  knowledgeActiveCharacters(){ return ((this.currentCampaign && this.currentCampaign.characters)||[]).filter(c=>c && c.alive !== false); },
  knowledgeKnowersOf(loreId){ return loreId ? window.ACKS.loreKnowers(this.currentCampaign, loreId) : []; },
  knowledgeCertaintyClass(c){ return ({ certain:'text-green-800 border-green-700 bg-green-50', probable:'text-sky-800 border-sky-700 bg-sky-50', suspected:'text-amber-800 border-amber-700 bg-amber-50', rumored:'opacity-70 border-ink/40' })[c] || 'opacity-70 border-ink/40'; },
  knowledgeKnownByView(){ return this.knowledgeViewCharId ? window.ACKS.loreKnownBy(this.currentCampaign, 'character', this.knowledgeViewCharId) : []; },
  knowledgeRowLoreText(row){ const l = row && (row.lore || (row.loreId ? window.ACKS.findLore(this.currentCampaign, row.loreId) : null)); if(l) return l.topic || l.text || l.id; return (row && row.text) || (row && row.kind) || '(event)'; },
  knowledgeRecordFact(){
    const f = this.knowledgeNewFact;
    if(!f.text || !f.text.trim()){ this.showToast('Fact text is required.', 3000); return; }
    const subjects = (f.subjectIds||'').split(',').map(s=>s.trim()).filter(Boolean);
    const lore = window.ACKS.recordLore(this.currentCampaign, { text:f.text.trim(), topic:(f.topic||'').trim(), loreKind:f.loreKind, truthValue:f.truthValue, subjectIds:subjects });
    this.knowledgeNewFact = { text:'', topic:'', loreKind:'fact', truthValue:'unknown', subjectIds:'' };
    if(lore) this.knowledgeSelectedLoreId = lore.id;
    this.markDirty(); this.schedulePersist(); this.showToast('Fact recorded.', 2500);
  },
  knowledgeLearn(){
    if(!this.knowledgeSelectedLoreId || !this.knowledgeLearnKnowerId){ this.showToast('Pick a fact and a knower.', 3000); return; }
    const r = window.ACKS.learnLore(this.currentCampaign, { knowerId:this.knowledgeLearnKnowerId, loreId:this.knowledgeSelectedLoreId, certainty:this.knowledgeLearnCertainty, source:{ kind:this.knowledgeLearnSourceKind, byId:null } });
    if(!r.ok){ this.showToast('Could not record: '+(r.reason||'?'), 3500); return; }
    this.markDirty(); this.schedulePersist(); this.showToast(this.knowledgeCharName(this.knowledgeLearnKnowerId)+' now knows it ('+r.knowledge.certainty+').', 3000);
  },
  knowledgeAttempt(){
    if(!this.knowledgeSelectedLoreId || !this.knowledgeLearnKnowerId){ this.showToast('Pick a fact and a knower.', 3000); return; }
    const r = window.ACKS.attemptLearnLore(this.currentCampaign, { knowerId:this.knowledgeLearnKnowerId, loreId:this.knowledgeSelectedLoreId, proficiencyTask:this.knowledgeLearnTask });
    if(!r.ok){ this.showToast('Could not attempt: '+(r.reason||'?'), 3500); return; }
    const t=r.throw; const rollTxt = (t && typeof t.natural==='number') ? (' (🎲 '+t.natural+(t.resolvedTarget!=null?(' vs '+t.resolvedTarget+'+'):'')+')') : (t && t.unavailable ? ' (no relevant proficiency)' : '');
    this.markDirty(); this.schedulePersist(); this.showToast(this.knowledgeCharName(this.knowledgeLearnKnowerId)+' → '+r.certainty+rollTxt, 4500);
  },
  knowledgeForget(knowerKind, knowerId, loreId){
    if(window.ACKS.forgetLore(this.currentCampaign, { knowerKind, knowerId, loreId })){ this.markDirty(); this.schedulePersist(); this.showToast('Forgotten.', 2000); }
  },
  knowledgeShareFrom(loreId){
    if(!this.knowledgeViewCharId || !this.knowledgeShareToId){ this.showToast('Pick someone to tell.', 3000); return; }
    // Wave B — the verbatim toggle: off (default) gossip degrades one band; on shares at full certainty.
    const r = window.ACKS.shareLore(this.currentCampaign, { fromKnowerId:this.knowledgeViewCharId, toKnowerId:this.knowledgeShareToId, loreId, degrade: !this.knowledgeShareVerbatim });
    if(!r.ok){ this.showToast('Could not share: '+(r.reason==='teller-does-not-know'?'they don’t hold this as a tracked fact':(r.reason||'?')), 3500); return; }
    this.markDirty(); this.schedulePersist(); this.showToast('Told '+this.knowledgeCharName(this.knowledgeShareToId)+' ('+r.sharedCertainty+').', 3000);
  },
  // Character Lifecycle CL-3 — persistent conditions (RR pp.507–516). The character-sheet Conditions
  // readout + the Apply-condition modal. The engine (applyCondition / clearCondition + the slot-59
  // conditions day-consumer) lives in acks-engine-lifecycle.js; these are thin wrappers + modal state.
  // Mutations go through the engine verbs (which find the live character on currentCampaign), so the
  // readout re-renders like the Wounds (D1) + Diseases (CL-2) readouts beside it.
  characterConditionRows(ch){
    const A = window.ACKS;
    if(!ch || !A || typeof A.characterConditionInfo !== 'function') return [];
    return A.characterConditionInfo(ch).conditions || [];
  },
  conditionTypeOptions(){ return (window.ACKS && window.ACKS.PERSISTENT_CONDITIONS) || []; },
  applyConditionModal: { open:false, characterId:null, charName:'', conditionId:'hypothermic' },
  applyConditionDef(){
    const A = window.ACKS;
    return (A && typeof A.persistentConditionById === 'function') ? A.persistentConditionById(this.applyConditionModal.conditionId) : null;
  },
  openApplyConditionModal(ch){
    if(!ch) return;
    this.applyConditionModal = { open:true, characterId:ch.id, charName:ch.name, conditionId:'hypothermic' };
  },
  closeApplyConditionModal(){ this.applyConditionModal.open = false; },
  applyConditionRun(){
    const m = this.applyConditionModal; const camp = this.currentCampaign;
    if(!camp){ this.showToast('No campaign loaded.'); return; }
    try {
      const r = window.ACKS.applyCondition(camp, m.characterId, m.conditionId);
      if(r){ this.showToast('🥶 ' + m.charName + ' is ' + (r.conditionLabel || m.conditionId).toLowerCase() + '.', 4000); this.markDirty(); this.schedulePersist(); }
      else { this.showToast('Could not apply that condition.'); }
      this.closeApplyConditionModal();
    } catch(e){ this.showToast('Apply failed: ' + e.message); }
  },
  clearConditionRow(ch, cond){
    const camp = this.currentCampaign; if(!camp || !ch || !cond) return;
    // Hypothermia: warming ends it (effective CON returns). Enervation: ending it stops the daily saves;
    // the drained max hp is permanent (RR — restored only by Restore Life & Limb, a future wire).
    const opts = cond.condition === 'hypothermic' ? { method:'warmed' } : { method:'cured' };
    try { const r = window.ACKS.clearCondition(camp, ch.id, cond.id, opts);
      if(r){ this.showToast((cond.condition === 'hypothermic' ? '🔥 ' : '✚ ') + ch.name + ' is no longer ' + (cond.label || cond.condition).toLowerCase() + '.', 4000); this.markDirty(); this.schedulePersist(); } }
    catch(e){ this.showToast('Clear failed: ' + e.message); }
  },
  // Delves D4 — the Abstract Wilderness foray (JJ ch.13). The most-abstract travel rung: an
  // expedition meets a lair / wandering monster → resolve the combat on one 1d8+1d12 roll.
  // Propose-compute-commit over ACKS.resolveWildernessForay / commitWildernessForay (Mortal
  // Wounds + adventure-result + clearLair). Thin wrappers; the engine owns the math.
  wildForay: { open:false, participantIds:[], foeMode:'lair', lairId:'', monsterKey:'', monsterCount:6,
    armyBr:0, armyCount:0, armyLevel:1, situational:0, healedToOneHp:true, treasureDest:'', proposal:null, lastCommit:null },
  openWildForay(lairId){
    this.wildForay = { open:true, participantIds:[], foeMode:'lair', lairId: lairId || '',
      monsterKey:'', monsterCount:6, armyBr:0, armyCount:0, armyLevel:1, situational:0,
      healedToOneHp:true, treasureDest:'', proposal:null, lastCommit:null };
    if(!this.wildForay.lairId){ const ls = this.wildForayLairs(); if(ls.length) this.wildForay.lairId = ls[0].id; else this.wildForay.foeMode = 'manual'; }
  },
  closeWildForay(){ this.wildForay = { open:false, participantIds:[], foeMode:'lair', lairId:'', monsterKey:'', monsterCount:6, armyBr:0, armyCount:0, armyLevel:1, situational:0, healedToOneHp:true, treasureDest:'', proposal:null, lastCommit:null }; },
  wildForayCandidates(){ return (this.currentCampaign?.characters || []).filter(c => c && (window.ACKS.isActive ? window.ACKS.isActive(c) : (c.alive !== false))); },
  wildForayLairs(){ return (this.currentCampaign?.lairs || []).filter(l => l && l.status === 'active'); },
  wildForayToggleParticipant(id){ const i = this.wildForay.participantIds.indexOf(id); if(i >= 0) this.wildForay.participantIds.splice(i, 1); else this.wildForay.participantIds.push(id); this.wildForay.proposal = null; },
  wildForayCharName(id){ const c = (this.currentCampaign?.characters || []).find(x => x.id === id); return c ? c.name : id; },
  wildForayLairName(l){ const n = (window.ACKS.lairInhabitantCount) ? window.ACKS.lairInhabitantCount(this.currentCampaign, l) : (l.totalInhabitantCount || 0); return (l.name || (l.monsterCatalogKey || 'lair')) + ' · ' + n + ' inhabitant(s)'; },
  wildForayFoeDescriptor(){
    if(this.wildForay.foeMode === 'lair'){
      const l = (this.currentCampaign?.lairs || []).find(x => x.id === this.wildForay.lairId); if(!l) return null;
      let count = (window.ACKS.lairInhabitantCount) ? window.ACKS.lairInhabitantCount(this.currentCampaign, l) : 0;
      if(!count) count = l.totalInhabitantCount || 1;
      return { monsterCatalogKey: l.monsterCatalogKey, count, isLair: true };
    }
    if(!this.wildForay.monsterKey) return null;
    return { monsterCatalogKey: this.wildForay.monsterKey, count: Math.max(1, Number(this.wildForay.monsterCount) || 1) };
  },
  wildForayArmyUnits(){ return (this.wildForay.armyCount > 0 && this.wildForay.armyBr > 0) ? [{ br: Number(this.wildForay.armyBr), count: Number(this.wildForay.armyCount), armyLevel: Number(this.wildForay.armyLevel) || 1 }] : []; },
  wildForayExpLevel(){ return window.ACKS.expeditionLevel(this.currentCampaign, this.wildForay.participantIds.slice()); },
  wildForayChallenge(){ const f = this.wildForayFoeDescriptor(); return f ? window.ACKS.challengeAdjustment(f) : null; },
  wildForayArmyPreview(){
    const ca = this.wildForayChallenge(); if(!ca) return null;
    const leveled3 = this.wildForay.participantIds.map(id => (this.currentCampaign.characters || []).find(c => c.id === id)).filter(c => c && (c.level || 1) >= 3).length;
    return window.ACKS.armyAdjustment({ platoonUnits: this.wildForayArmyUnits(), maxUnits: leveled3, monsterLevel: ca.monsterLevel, armyLevel: this.wildForay.armyLevel });
  },
  wildForayDifficultyPreview(){
    const ca = this.wildForayChallenge(); if(!ca) return null; const aa = this.wildForayArmyPreview();
    return window.ACKS.wildernessForayDifficulty({ expeditionLevel: this.wildForayExpLevel(), monsterLevel: ca.monsterLevel, challengeAdj: ca.challengeAdj, modifiedArmyAdj: aa ? aa.modifiedAA : 0, situationalSteps: Number(this.wildForay.situational) || 0 });
  },
  wildForayCanResolve(){ return this.wildForay.participantIds.length > 0 && !!this.wildForayFoeDescriptor(); },
  wildForayResolveOpts(){
    const o = { participantCharacterIds: this.wildForay.participantIds.slice(), platoonUnits: this.wildForayArmyUnits(), situationalSteps: Number(this.wildForay.situational) || 0 };
    if(this.wildForay.foeMode === 'lair') o.lairId = this.wildForay.lairId; else o.foe = this.wildForayFoeDescriptor();
    return o;
  },
  wildForayResolve(){ if(!this.wildForayCanResolve()) return; this.wildForay.proposal = window.ACKS.resolveWildernessForay(this.currentCampaign, this.wildForayResolveOpts()); this.wildForay.lastCommit = null; },
  wildForayReroll(){ this.wildForay.proposal = null; this.wildForayResolve(); },
  wildForayCommit(){
    if(!this.wildForay.proposal) return;
    const out = window.ACKS.commitWildernessForay(this.currentCampaign, this.wildForay.proposal, { participantCharacterIds: this.wildForay.participantIds.slice(), treasureDestinationCharacterId: this.wildForay.treasureDest || null, healedToOneHp: this.wildForay.healedToOneHp });
    this.wildForay.lastCommit = out; this.wildForay.proposal = null;
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast(out ? ('Wilderness foray — ' + (out.proposal ? out.proposal.result : 'resolved') + (out.lairCleared ? ' · lair cleared' : '')) : 'Foray resolved');
  },
  // Settlement Demographics SD-4 — the rural / countryside census (T2, "A Typical Hex"). Domain-scoped:
  // the leveled NPCs across the domain's rural hexes, expected (the scaled "A Typical Hex" template) vs
  // realized (homeHexId residents). Gated on the living-census house rule (the deep tier, like SD-3);
  // the engine accessor (ACKS.domainRuralDemographics) is a pure derived read. Mirrors SD-1/SD-3.
  ruralCensusOn(){ return this.isHouseRuleEnabled('living-census'); },
  ruralCensus(){ const d=this.selectedDomain; return (d&&d.id) ? window.ACKS.domainRuralDemographics(this.currentCampaign, d) : null; },
  ruralRosterRows(){ const c=this.ruralCensus(); if(!c) return []; return c.byLevel.filter(r => window.ACKS.DEMOGRAPHIC_BUCKETS.some(b => r[b].expected>=0.5 || r[b].realized>0)); },
  ruralResidentsList(){ const c=this.ruralCensus(); return c ? c.residents : []; },
  ruralHexOptions(){ const d=this.selectedDomain; if(!d||!d.id) return []; return (this.currentCampaign?.hexes||[]).filter(h => h && h.domainId===d.id && !window.ACKS.settlementForHex(this.currentCampaign, h.id)); },
  ruralAssignPick: '', ruralAssignHex: '',
  ruralUnhomedCandidates(){ return (this.currentCampaign?.characters||[]).filter(c => !c.homeHexId && c.lifecycleState!=='deceased').sort((a,b)=>(a.name||'').localeCompare(b.name||'')); },
  ruralAssignResident(){ const id=this.ruralAssignPick, hx=this.ruralAssignHex; if(!id||!hx) return; const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); if(!c) return; this.commitStatEdit({entityType:'character', entityId:c.id, entity:c, fieldPath:'homeHexId', label:'Home hex', oldValue:(c.homeHexId||null), newValue:hx}); this.ruralAssignPick=''; },
  ruralRemoveResident(id){ const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); if(!c) return; this.commitStatEdit({entityType:'character', entityId:c.id, entity:c, fieldPath:'homeHexId', label:'Home hex', oldValue:(c.homeHexId||null), newValue:null}); },

  init(){
    // Expose the root Alpine proxy on `window.acksApp` so reusable sub-components
    // (e.g. editableStat) can reach the root campaign + selectedDomain reactively
    // without needing to walk Alpine's scope chain. There's only ever one instance.
    window.acksApp = this;
    try{
      const raw=localStorage.getItem('acks-domain-session-v3');
      if(raw){
        const sess=JSON.parse(raw);
        if(sess.currentCampaign){
          const rawCamp = sess.currentCampaign;
          // Backward-compat: pre-refactor session caches stored domains in a separate sess.domains
          // (the old split shape). Re-stitch them onto the campaign BEFORE migrate so the pipeline
          // runs once with domains present, exactly like a file load.
          if((!Array.isArray(rawCamp.domains) || !rawCamp.domains.length) && Array.isArray(sess.domains) && sess.domains.length){
            rawCamp.domains = sess.domains;
          }
          this.currentCampaign = migrateCampaign(rawCamp);
          this._finishLoad(this.currentCampaign);   // same UI-only post-migrate steps as a file load
        }
        this.selectedDomainId=sess.selectedDomainId||(this.domains[0]?this.domains[0].id:null);
        this.fileName=sess.fileName||'';
        if(sess.currentView)this.currentView=sess.currentView;
        // Restore persisted sub-views — the original two plus the new ones from the 2026-06-22 UI overhaul.
        if(sess.worldSubView)this.worldSubView=sess.worldSubView;
        if(sess.reviewSubView)this.reviewSubView=sess.reviewSubView;
        if(sess.monthlyTurnSubView)this.monthlyTurnSubView=sess.monthlyTurnSubView;
        if(sess.rosterSubView)this.rosterSubView=sess.rosterSubView;
        if(sess.activitiesSubView)this.activitiesSubView=sess.activitiesSubView;
        if(sess.domainsSubView)this.domainsSubView=sess.domainsSubView;
        // (2026-06-22) Emit Event + Chronicle were promoted from the nested eventsSubView toggle
        // (under Event Log) to their own top-level Events sub-tabs; the redundant Campaign Log was
        // retired. Migrate a persisted eventsSubView into the reviewSubView it became.
        if(this.reviewSubView==='event-log' && sess.eventsSubView){
          if(sess.eventsSubView==='emit-wizard') this.reviewSubView='emit-wizard';
          else if(sess.eventsSubView==='chronicle') this.reviewSubView='chronicle';
          // 'campaign-log' + 'event-log' both land on the Event Log (campaign-log retired).
        }
        // ── Legacy session migration ──────────────────────────────────────────────
        // (pre-#225) 'map' was a top-level view → now a World sub-view.
        if(this.currentView==='map'){ this.worldSubView='map'; this.currentView='world'; }
        // (pre-2026-06-13) Encounters + Battles were briefly World sub-views → now Events (id 'review').
        if(this.worldSubView==='encounters' || this.worldSubView==='battles'){
          if(this.currentView==='world'){ this.currentView='review'; this.reviewSubView=this.worldSubView; }
          this.worldSubView='map';
        }
        // ── UI overhaul 2026-06-22 — re-home the former top-level + World sub-views into their new homes.
        // World ▸ Stashes/Lairs/Dungeons folded into World ▸ Points of Interest.
        if(this.currentView==='world' && ['stashes','lairs','dungeons'].includes(this.worldSubView)) this.worldSubView='poi';
        // World ▸ Domains promoted to its own top-level tab.
        if(this.currentView==='world' && this.worldSubView==='domains'){ this.currentView='domains'; this.domainsSubView='domains'; }
        // Former top-level tabs → sub-views.
        if(this.currentView==='religion'){ this.currentView='world'; this.worldSubView='religion'; }
        if(this.currentView==='senate'){ this.currentView='domains'; this.domainsSubView='governance'; }
        if(this.currentView==='banking'){ this.currentView='activities'; this.activitiesSubView='banking'; }
        if(this.currentView==='magic-items'){ this.currentView='activities'; this.activitiesSubView='magic-items'; }
        if(this.currentView==='gladiators'){ this.currentView='activities'; this.activitiesSubView='gladiators'; }
        if(this.currentView==='characters'){ this.currentView='roster'; this.rosterSubView=(sess.charactersSubView==='parties')?'groups':'characters'; }
        if(this.currentView==='generators'){ this.currentView='roster'; this.rosterSubView='npc-generators'; }
        if(this.currentView==='knowledge'){ this.currentView='roster'; this.rosterSubView='knowledge'; }
        // Old standalone Events (chronicle/log) view folds under the Events ▸ Event Log sub-tab.
        if(this.currentView==='events'){ this.currentView='review'; this.reviewSubView='event-log'; }
        // Domain Review promoted out of Review into its own Monthly Turn tab.
        if(this.currentView==='review' && this.reviewSubView==='domain-review'){ this.currentView='domain-turn'; }
        // Construction moved from Events ▸ Construction to Monthly Turn ▸ Construction (2026-06-22).
        if(this.currentView==='review' && this.reviewSubView==='construction'){ this.currentView='domain-turn'; this.monthlyTurnSubView='construction'; this.reviewSubView='pending-events'; }
        // 🛒 Market re-homed from Activities to the Settlement sheet (2026-06-22) — fall back to the dashboard.
        if(this.currentView==='activities' && this.activitiesSubView==='market') this.activitiesSubView='activities';
        // Final safety net — land on the default if currentView is still unknown.
        if(!this.topViews.some(v=>v.id===this.currentView))this.currentView='domains';
        // #225 Map Mode — restore ephemeral viewport prefs (fill layer + viewBox). mapMode stays
        // 'inspect' (select is transient). A null/absent viewBox lazily re-fits on first map open.
        if(sess.mapPrefs){
          if(sess.mapPrefs.fillLayer) this.mapFillLayer = sess.mapPrefs.fillLayer;
          if(sess.mapPrefs.viewBox)   this.mapViewBox   = sess.mapPrefs.viewBox;
          if(sess.mapPrefs.symbolToggles) this.mapSymbolToggles = Object.assign(this.mapSymbolToggles, sess.mapPrefs.symbolToggles);
          if(sess.mapPrefs.edgeToggles)   this.mapEdgeToggles   = Object.assign(this.mapEdgeToggles, sess.mapPrefs.edgeToggles);
          if(typeof sess.mapPrefs.showJourneys === 'boolean')   this.mapShowJourneys   = sess.mapPrefs.showJourneys;
          if(typeof sess.mapPrefs.editAddMode === 'boolean') this.mapEditAddMode = sess.mapPrefs.editAddMode;
        }
        // (Post-migrate load steps — lift, per-entity shapes, agricultural projects — ran via
        // this._finishLoad(currentCampaign) above, the same path a file load uses. Domains now live
        // on the campaign, so migrateCampaign already did the domain-reading migrations (mining
        // strip, treasuries, classification, parties) — no session-restore re-runs needed.)
      }
    }catch(e){
      // v2 is a clean break — any pre-v2 session save is unmigratable. Clear it so reload doesn't re-trigger.
      console.warn('Session restore failed; clearing stale session.',e);
      try{ localStorage.removeItem('acks-domain-session-v3'); }catch(_){}
      this.currentCampaign=null; this.selectedDomainId=null; this.fileName='';  // domains getter returns [] when no campaign
      // Defer toast until Alpine watchers are wired so the message is visible.
      setTimeout(()=>{ try{ this.showToast('Previous session was on an older schema and could not be restored. Pick the demo or a starter template from the welcome screen to continue.', 7000); }catch(_){} }, 200);
    }
    this.$watch('currentCampaign',()=>{
      this.markDirty();
      this.schedulePersist();
      // If a house rule toggle removed the currently-active tab, snap back to Overview
      if(this.activeTab && !this.tabs.includes(this.activeTab))this.activeTab='overview';
    },{deep:true});
    // (No separate $watch('domains') — domains live inside currentCampaign now, so the deep
    // currentCampaign watch above already catches domain edits for the dirty flag + persist.)
    this.$watch('journeyDetailId',()=>{ this.journeyOverrideArmed = false; }); // §26 — armed state is per-open-journey; clear on any switch
    this.$watch('selectedDomainId',()=>this.schedulePersist()); // selecting a domain isn't a content change
    // #225 Map Mode — persist the active fill layer; lazily fit the viewport when the Map sub-view opens.
    this.$watch('mapFillLayer',()=>this.schedulePersist());
    // #225 Map is now a World sub-view: fit the viewport when World opens on Map, or when the
    // sub-view switches to Map; persist the active sub-view so a reload restores it.
    this.$watch('currentView',v=>{ if(v==='world' && this.worldSubView==='map') this.mapEnsureView(); if(v!=='world'){ this._hexAddReturn = null; this._journeyDestPickAbandon(); this._journeyWaypointPickAbandon(); this._journeyMapView = null; } }); // left World entirely → abandon the add-hex / destination / waypoints / journey-view flows
    this.$watch('worldSubView',v=>{ this.schedulePersist(); if(v==='map') this.mapEnsureView(); else { this._hexAddReturn = null; this._journeyDestPickAbandon(); this._journeyWaypointPickAbandon(); this._journeyMapView = null; } }); // left Map for another World sub-view → abandon the add-hex / destination / waypoints / journey-view flows
    // UI overhaul 2026-06-22 — persist the new sub-views so a reload restores the exact sub-tab (parity with worldSubView).
    this.$watch('rosterSubView',()=>this.schedulePersist());
    this.$watch('domainsSubView',()=>this.schedulePersist());
    this.$watch('activitiesSubView',()=>this.schedulePersist());
    // Data-durability guard (ux audit Critical): warn before unload when there are
    // content changes not yet written to the .acks.json file, and flush the debounced
    // session cache so a tab-reopen recovers the latest state.
    window.addEventListener('beforeunload',(e)=>{
      this.flushPersist();
      if(this.dirty){ e.preventDefault(); e.returnValue=''; return ''; }
    });
  },

  // Mark the campaign as having unsaved content changes. Suppressed during load (the
  // deep watchers fire as the campaign hydrates, which isn't a user edit).
  markDirty(){ if(this._ignoreMutations) return; this.dirty = true; },

  // Debounced session-cache write. The deep $watch fires on every keystroke; without a
  // debounce that meant a full-campaign JSON.stringify per character typed (perf audit C1).
  // Trailing 800ms — the latest state lands shortly after the user pauses, and beforeunload
  // flushes any pending write so nothing is lost on close.
  schedulePersist(){
    if(this._persistTimer){ clearTimeout(this._persistTimer); }
    this._persistTimer = setTimeout(()=>{ this._persistTimer = null; this.persistSession(); }, 800);
  },
  flushPersist(){
    if(this._persistTimer){ clearTimeout(this._persistTimer); this._persistTimer = null; this.persistSession(); }
  },

  // The localStorage recovery cache caps the eventLog tail (perf T11) so a multi-year campaign can't
  // blow the ~5 MB per-origin quota and silently stop crash-recovering. The CACHE is the only thing
  // capped — the bound .acks.json (💾 Save → serializedCampaign) always writes the FULL log, so no
  // committed history is ever lost. A shallow spread swaps only eventLog for its last N entries; every
  // other collection (and the live in-memory campaign) is untouched.
  CACHE_EVENTLOG_MAX: 2000,
  _campaignForCache(){
    const c = this.currentCampaign;
    if(!c) return c;
    const log = Array.isArray(c.eventLog) ? c.eventLog : null;
    if(!log || log.length <= this.CACHE_EVENTLOG_MAX) return c;
    return { ...c, eventLog: log.slice(-this.CACHE_EVENTLOG_MAX) };   // shallow — only the log tail differs from the live campaign
  },
  persistSession(){
    let json;
    try{
      json = JSON.stringify({
        currentCampaign:this._campaignForCache(),   // domains live inside it now (single home); eventLog tail-capped for the cache only
        selectedDomainId:this.selectedDomainId,fileName:this.fileName,
        currentView:this.currentView, worldSubView:this.worldSubView, reviewSubView:this.reviewSubView,
        monthlyTurnSubView:this.monthlyTurnSubView,
        rosterSubView:this.rosterSubView, activitiesSubView:this.activitiesSubView, domainsSubView:this.domainsSubView,
        // #225 Map Mode — ephemeral viewport + layer prefs only. Never part of the .acks.json
        // (plan §8); mode always restores to 'inspect' (select is transient).
        mapPrefs:{ fillLayer:this.mapFillLayer, viewBox:this.mapViewBox,
          symbolToggles:this.mapSymbolToggles, edgeToggles:this.mapEdgeToggles,
          showJourneys:this.mapShowJourneys, editAddMode:this.mapEditAddMode }});
    }catch(e){ console.warn('Persist serialize failed',e); return; }
    try{
      localStorage.setItem('acks-domain-session-v3', json);
    }catch(e){
      // Surface quota exhaustion instead of swallowing it (perf/qa audit C2). At ~5MB the
      // browser refuses the write; a GM with a long campaign would otherwise silently lose
      // their crash-recovery cache. The bound .acks.json file (💾 Save) is unaffected.
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message||''));
      console.warn('Persist failed', e);
      if(quota && typeof this.showToast === 'function'){
        this.showToast('Browser storage is full — auto-recovery cache could not update. Use 💾 Save campaign to write your work to disk.', 8000);
      }
    }
  },

  // Top-level views. Extensible — add entries here when new campaign-level views land.
  get topViews(){
    const enabledRules = (this.HOUSERULES||[]).filter(r => this.isHouseRuleEnabled(r.id)).length;
    const aliveChars = (this.currentCampaign?.characters||[]).filter(c=>c.alive!==false).length;
    const hexCount = (this.currentCampaign?.hexes||[]).filter(h=>h && h.domainId).length;
    // 📜 Events badge (2026-06-22) — the count of clock-holders that BLOCK the daily advance:
    // active encounters + battles in motion (engine dailyAdvanceBlockers — exactly what greys the
    // +1 day / Next month buttons and what the "⏸ The clock is held" banner on this tab lists).
    // 0 → no badge, so it lights up only when something actually needs resolving before you advance.
    let blockerCount = 0;
    try { blockerCount = (window.ACKS.dailyAdvanceBlockers(this.currentCampaign) || []).length; } catch(e){ blockerCount = 0; }
    // UI overhaul 2026-06-22 — the 8 stable top-level tabs. The world-content tabs lead at the
    // LEFT in document order; the three turn-running tabs (Events / Domain Turn / House Rules)
    // float to the RIGHT end of the bar (alignRight → ml-auto on the first of the group, Events),
    // so they sit directly under the advance-day clock at the top-right of the header. Map/Domains
    // are pulled out of World; the former conditional top-level tabs (religion, senate, banking,
    // magic-items, knowledge, generators, gladiators) are now SUB-views of World/Domains/Roster/
    // Activities (see the *SubTabs getters). 'review' keeps its internal id but is relabelled
    // "📜 Events" (the old standalone 'events' chronicle/log view folds in as its Event-Log
    // sub-tab). Domain Turn is the promoted old review/domain-review.
    return [
      { id:'world',        label:'🌍 World',        count: hexCount || null },
      { id:'domains',      label:'🏰 Domains',      count: (this.domains||[]).length || null },
      { id:'roster',       label:'👥 Roster',       count: aliveChars || null },
      { id:'activities',   label:'🎭 Activities',   count: (this.currentCampaign?.ventures||[]).length },
      { id:'inspector',    label:'🔍 Inspector' },
      { id:'review',       label:'📜 Events',       count: blockerCount || null, alignRight: true },
      { id:'domain-turn',  label:'🏰 Monthly Turn', count: this.turnProposal ? 1 : null },
      { id:'house-rules',  label:'⚙ House Rules',   count: enabledRules || null }
    ];
  },
  // === @b8-lifecycle  (team) — Lifecycle CL-4a: state + methods ===
  // Death & inheritance (RR pp.311–313) — the char-sheet Health/Lifecycle-cluster surface: plan ahead
  // while alive (Reserve XP / heir / will), mark a death (cause + heroism), then resolve succession
  // (promote a henchman · name an heir · start a back-up — with the Reserve XP + Heroic Funeral XP + the
  // will/heir inheritance transfer). One modal, mode 'death' | 'succession'. All over the CL-4a engine.
  cl4aModal: { open:false, mode:null, charId:null, charName:'',
    cause:'fiat', heroic:false,
    successorMode:'promote-henchman', successorCharacterId:'', newCharacterName:'',
    funeralGpSpent:0, heroicDeath:false, transferTreasure:true, heirId:'', bankFeePct:10,
    candidates:[], heirOptions:[], reserveXp:0, deceasedXp:0 },
  cl4aAccrueGp: 0,
  cl4aDeathInfo(ch){ const A=window.ACKS; return (ch && A && A.characterDeathInfo) ? A.characterDeathInfo(ch) : { deceased:false }; },
  cl4aReserveXp(ch){ const A=window.ACKS; return (ch && A && A.characterReserveXp) ? A.characterReserveXp(ch) : 0; },
  cl4aCauseOptions(){ return (window.ACKS && window.ACKS.DEATH_CAUSES) || ['wounds','disease','old-age','battle','fiat','unknown']; },
  cl4aCharName(id){ const c = (this.currentCampaign?.characters||[]).find(x => x && x.id === id); return c ? c.name : '—'; },
  cl4aHeirOptions(ch){ return (this.currentCampaign?.characters||[]).filter(x => x && x.id !== ch.id && x.lifecycleState !== 'deceased' && x.alive !== false).map(x => ({ id:x.id, name:x.name })); },
  cl4aOwnedStashes(ch){ const A=window.ACKS; return (ch && A && A.stashesOwnedByCharacter) ? (A.stashesOwnedByCharacter(this.currentCampaign, ch.id) || []) : []; },
  cl4aStashBequeathed(ch, stashId){ return !!(ch && ch.will && Array.isArray(ch.will.bequests) && ch.will.bequests.some(b => b && b.kind === 'stash' && b.ref === stashId)); },
  _cl4aTouch(msg){ if(this.markDirty) this.markDirty(); if(this.schedulePersist) this.schedulePersist(); if(msg && this.showToast) this.showToast(msg, 3000); },
  cl4aSetHeir(ch, heirId){ const A=window.ACKS; if(!A||!A.setCharacterHeir) return; A.setCharacterHeir(this.currentCampaign, ch.id, heirId || null); this._cl4aTouch('Heir ' + (heirId ? ('set to ' + this.cl4aCharName(heirId)) : 'cleared') + '.'); },
  cl4aAccrueReserveXp(ch){ const gp = Number(this.cl4aAccrueGp) || 0; if(gp <= 0) return; const A=window.ACKS; const total = A.addReserveXp(this.currentCampaign, ch.id, { gpSpent: gp, reason:'spent to no lasting benefit' }); this.cl4aAccrueGp = 0; this._cl4aTouch('Banked ' + Math.floor(gp * 0.9) + ' Reserve XP (now ' + total + ').'); },
  cl4aToggleBequest(ch, stashId){ const A=window.ACKS; const will = ch.will || { bequests:[] }; if(!Array.isArray(will.bequests)) will.bequests = []; const i = will.bequests.findIndex(b => b && b.kind === 'stash' && b.ref === stashId); if(i >= 0) will.bequests.splice(i, 1); else will.bequests.push({ kind:'stash', ref:stashId }); A.setCharacterWill(this.currentCampaign, ch.id, will); this._cl4aTouch('Will updated.'); },
  cl4aOpenDeath(ch){ this.cl4aModal = Object.assign({}, this.cl4aModal, { open:true, mode:'death', charId:ch.id, charName:ch.name, cause:'fiat', heroic:false }); },
  cl4aConfirmDeath(){ const m=this.cl4aModal; const A=window.ACKS; A.recordCharacterDeath(this.currentCampaign, m.charId, { cause:m.cause, heroic:m.heroic }); this.cl4aModal.open=false; this._cl4aTouch(m.charName + ' has died (' + m.cause + ').'); },
  cl4aOpenSuccession(ch){
    const A=window.ACKS;
    if(A.reconcileCharacterDeaths) A.reconcileCharacterDeaths(this.currentCampaign);   // back-fill any externally-set death
    const cands = (A.successionCandidates && A.successionCandidates(this.currentCampaign, ch.id)) || [];
    const info = A.characterDeathInfo ? A.characterDeathInfo(ch) : {};
    this.cl4aModal = Object.assign({}, this.cl4aModal, {
      open:true, mode:'succession', charId:ch.id, charName:ch.name,
      successorMode: cands.length ? 'promote-henchman' : 'new-character',
      successorCharacterId: cands.length ? cands[0].id : '',
      newCharacterName: ch.name + "'s successor",
      funeralGpSpent: 0, heroicDeath: info.heroic === true, transferTreasure: true,
      heirId: info.heirCharacterId || ((cands.find(x => x.relationship === 'heir') || {}).id) || '',
      bankFeePct: 10, candidates: cands, heirOptions: this.cl4aHeirOptions(ch),
      reserveXp: (info.reserveXp || 0), deceasedXp: (Number(ch.xp) || 0)
    });
    this._cl4aTouch('');
  },
  cl4aSuccessionPreview(){ const m=this.cl4aModal; const reserveXpApplied = Math.min(Number(m.reserveXp)||0, Number(m.deceasedXp)||0); const funeralXp = (m.heroicDeath && Number(m.funeralGpSpent) > 0) ? Math.floor(0.9 * Number(m.funeralGpSpent)) : 0; return { reserveXpApplied, funeralXp, startXp: reserveXpApplied + funeralXp }; },
  cl4aResolveSuccession(){
    const m=this.cl4aModal; const A=window.ACKS;
    const res = A.resolveSuccession(this.currentCampaign, m.charId, {
      mode: m.successorMode, successorCharacterId: m.successorCharacterId || null,
      newCharacterName: m.newCharacterName, funeralGpSpent: Number(m.funeralGpSpent) || 0,
      heroic: m.heroicDeath, transferTreasure: m.transferTreasure,
      heirId: m.heirId || null, bankFeePct: Number(m.bankFeePct) || 10
    });
    this.cl4aModal.open = false;
    const who = (res && res.successor) ? res.successor.name : 'no successor';
    this._cl4aTouch(m.charName + ' — succession resolved (' + who + ').');
  },
  // === @b8-politics   (team) — Politics P-3: state + methods ===
  // P-3 — senate influence actions (bribe/intimidate/seduce/gift), reveal-on-2, and the
  // dispute-lifecycle extensions (resolve-by-consult / abandon / re-establish). Thin Alpine
  // layer over acks-engine-politics.js; reuses the P-2 senate methods (senateSelected,
  // senateReadout, senateConsult, …). The per-senator modal is at the @b8-politics modal marker.
  senateInfluence: { open: false, senatorshipId: '', method: 'bribe', byCharacterId: '',
    value: 1, byRival: false, outranks: true, credibleThreat: true, attracted: true, autoSucceed: false, result: null },
  senateGift: { byCharacterId: '', votes: 0, reactionBonus: 3, friendly: false, gp: 0 },
  // the apex ruler (the default influencer / gift-giver)
  senateRulerId(){ const apex = this._senateApex(this.senateSelected()); return apex ? (apex.rulerCharacterId || '') : ''; },
  // character options for the influencer/gift-giver picker (active characters; the ruler floats to the top)
  senateActorOptions(){
    const c = this.currentCampaign; if(!c || !Array.isArray(c.characters)) return [];
    const rid = this.senateRulerId();
    return c.characters.filter(ch => ch && (ch.alive !== false)).map(ch => ({ id: ch.id, name: (ch.name || ch.id) + (ch.id === rid ? ' (ruler)' : '') }))
      .sort((a, b) => (a.name.includes('(ruler)') ? -1 : 0) - (b.name.includes('(ruler)') ? -1 : 0));
  },
  // the standing-influence chips shown beside each senator in the roster (bribe/intimidate/seduce/escaped/…)
  senateSenatorChips(senatorshipId){
    const s = window.ACKS.findSenatorship(this.currentCampaign, senatorshipId);
    if(!s || !Array.isArray(s.influenceModifiers)) return [];
    const colour = { bribe: 'bg-yellow-200', 'rival-bribe': 'bg-red-200', intimidated: 'bg-orange-200',
      seduced: 'bg-pink-200', 'intimidated-escaped': 'bg-red-300', 'seduced-ill-treated': 'bg-red-300', bewitched: 'bg-purple-200' };
    return s.influenceModifiers.filter(m => m && m.kind).map(m => ({
      key: m.kind, label: m.kind + ' ' + (m.value >= 0 ? '+' : '') + m.value, cls: colour[m.kind] || 'bg-gray-200' }));
  },
  senateSenatorSecret(senatorshipId){
    const s = window.ACKS.findSenatorship(this.currentCampaign, senatorshipId);
    return !!(s && s.isSecretInfluence);
  },
  // open the per-senator influence modal
  senateOpenInfluence(senatorshipId){
    this.senateInfluence = { open: true, senatorshipId, method: 'bribe', byCharacterId: this.senateRulerId(),
      value: 1, byRival: false, outranks: true, credibleThreat: true, attracted: true, autoSucceed: false, result: null };
  },
  closeSenateInfluence(){ this.senateInfluence.open = false; this.senateInfluence.result = null; },
  senateInfluenceSenator(){
    const s = window.ACKS.findSenatorship(this.currentCampaign, this.senateInfluence.senatorshipId);
    if(!s) return '(none)';
    const ch = (this.currentCampaign.characters || []).find(x => x && x.id === s.senatorCharacterId);
    return ch ? (ch.name || ch.id) : (s.senatorCharacterId || '(vacant)');
  },
  // a live preview of the chosen influence action (the bribe gp/period, or the throw chance)
  senateInfluencePreview(){
    const A = window.ACKS, f = this.senateInfluence;
    const s = A.findSenatorship(this.currentCampaign, f.senatorshipId);
    if(!s) return '';
    if(f.method === 'bribe'){
      const actor = (this.currentCampaign.characters || []).find(x => x && x.id === f.byCharacterId);
      const prof = !!(actor && A.hasProficiency && A.hasProficiency(actor, 'bribery'));
      const period = (prof ? { 1:'day', 2:'week', 3:'month' } : { 1:'week', 2:'month', 3:'year' })[Math.min(3, Math.max(1, f.value))];
      const gp = (s.bribeCostByPeriod && Number(s.bribeCostByPeriod[period])) || 0;
      return (f.byRival ? 'Rival bribe ' : 'Bribe ') + (f.byRival ? '−' : '+') + f.value + ' to his vote · ' + gp + 'gp (' + period + (prof ? ', Bribery prof' : '') + ')';
    }
    if(f.autoSucceed) return 'Auto-succeed (the GM rules the conditions met) → +1 to his vote.';
    const actor = (this.currentCampaign.characters || []).find(x => x && x.id === f.byCharacterId);
    const chaMod = actor ? Math.floor((((actor.abilities && actor.abilities.CHA) || 10) - 10) / 3) : 0;
    return 'A proficiency throw: 1d20 + ' + (chaMod >= 0 ? '+' : '') + chaMod + ' (CHA) vs 11+ → success gives +1 to his vote.';
  },
  senateInfluenceCanSubmit(){
    const f = this.senateInfluence;
    if(!f.senatorshipId || !f.byCharacterId) return false;
    return true;
  },
  senateInfluenceSubmit(){
    const A = window.ACKS, c = this.currentCampaign, f = this.senateInfluence;
    if(!A || !c) return;
    let r;
    if(f.method === 'bribe') r = A.bribeSenator(c, { senatorshipId: f.senatorshipId, byCharacterId: f.byCharacterId, value: Number(f.value) || 1, byRival: f.byRival });
    else if(f.method === 'intimidate') r = A.intimidateSenator(c, { senatorshipId: f.senatorshipId, byCharacterId: f.byCharacterId, outranks: f.outranks, credibleThreat: f.credibleThreat, autoSucceed: f.autoSucceed });
    else r = A.seduceSenator(c, { senatorshipId: f.senatorshipId, byCharacterId: f.byCharacterId, attracted: f.attracted, autoSucceed: f.autoSucceed });
    f.result = r;
    this.markDirty(); this.schedulePersist();
    if(r && r.ok === false){ this.showToast('✗ ' + (f.method) + ' refused: ' + r.reason, 4000); }
    else if(f.method === 'bribe'){ this.showToast('💰 Senator bribed (' + (r.value >= 0 ? '+' : '') + r.value + ', ' + r.gp + 'gp' + (r.paid ? '' : ' — purse short, track gp manually') + ')', 5000); }
    else { this.showToast((r.success ? '✓ ' : '✗ ') + f.method + (r.success ? ' lands (+1 to his vote)' : ' fails'), 5000); }
  },
  // the −5 turn: a once-intimidated/seduced senator escapes the ruler's dominance / is ill-treated
  senateFlipInfluence(senatorshipId, kind){
    const A = window.ACKS;
    A.flipSocialInfluence(this.currentCampaign, { senatorshipId, kind, byCharacterId: this.senateRulerId() });
    this.markDirty(); this.schedulePersist();
    this.showToast('A senator once ' + kind + ' turns against the ruler (−5 to his vote).', 5000);
  },
  // gifts → converting part of the independent bloc (RR p.359 §4.7)
  senateControlledIndependents(){
    const A = window.ACKS, senate = this.senateSelected(), rid = this.senateRulerId();
    if(!A || !senate || !rid) return 0;
    return A.controlledIndependentVotesFor(this.currentCampaign, senate, rid, this.currentCampaign.currentTurn || 1) || 0;
  },
  senateGiftSubmit(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected(), g = this.senateGift;
    if(!A || !c || !senate) return;
    const r = A.giftIndependentSenators(c, { senateId: senate.id, byCharacterId: g.byCharacterId || this.senateRulerId(),
      votes: Number(g.votes) || 0, reactionBonus: Number(g.reactionBonus) || 0, friendly: g.friendly, gp: Number(g.gp) || 0 });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok) this.showToast(r.qualifies ? ('🎁 Gift directs ' + r.controlled + ' independent vote(s).') : '🎁 Gift recorded — not enough to direct votes.', 5000);
  },
  // apply the gift-controlled bloc to the consult's FOR seed
  senateUseControlledIndependents(){ this.senateConsult.controlledIndependentVotes = this.senateControlledIndependents(); },
  // reveal-on-2: after a consult, flag the natural-2 secret-influence senators
  senateApplyReveals(){
    const A = window.ACKS;
    if(!this.senateConsultResult) return;
    const r = A.applyInfluenceReveals(this.currentCampaign, this.senateConsultResult, { rulerCharacterId: this.senateRulerId() });
    this.markDirty(); this.schedulePersist();
    this.showToast(r.revealed.length ? ('👁 ' + r.revealed.length + ' senator(s) reveal the ruler’s hand — he is implicated.') : 'No secret influence revealed (no natural 2 on a bribed/etc. senator).', 5000);
  },
  // does the last consult have any natural-2 roll (so the reveal button is worth showing)?
  senateConsultHasNaturalTwo(){ return !!(this.senateConsultResult && (this.senateConsultResult.rolls || []).some(r => r.roll && r.roll.natural === 2)); },
  // --- dispute lifecycle (P-3 extensions) ---
  // the real RAW retroactive-approval consult: clears on a majority FOR, escalates (replace-ruler) on against
  senateDisputeResolveByConsult(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate || senate.dispute == null) return;
    const r = A.resolveDisputeByConsult(c, {
      senateId: senate.id, rulerCharacterId: this.senateRulerId(),
      domainMorale: Number(this.senateConsult.domainMorale) || 0,
      rulerFactionId: this.senateConsult.rulerFactionId || null,
      militaryLoyalty: this.senateConsult.militaryLoyalty,
      controlledIndependentVotes: Number(this.senateConsult.controlledIndependentVotes) || 0
    });
    this.markDirty(); this.schedulePersist();
    if(r && r.outcome === 'cleared') this.showToast('✓ The senate grants retroactive approval — the dispute ends.', 5000);
    else if(r && r.outcome === 'escalated') this.showToast('⚠ The consult fails — the dispute deepens, and ' + (r.replaceRulerSenatorships || []).length + ' senator(s) now seek to replace the ruler.', 6000);
  },
  senateDisputeAbandon(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate) return;
    if(!confirm('Abandon senatorial government? The senate is dissolved, all benefits are permanently lost, influential “replace-ruler” senators turn Hostile, and a senate cannot be re-established for 2d6 months.')) return;
    const r = A.abandonSenatorialGovernment(c, { senateId: senate.id, rulerCharacterId: this.senateRulerId() });
    this.markDirty(); this.schedulePersist();
    if(r) this.showToast('🏳 Senatorial government abandoned — ' + r.penalties.hostileSenators.length + ' senator(s) turn Hostile; re-establish on/after turn ' + r.penalties.reestablishCooldownUntilTurn + '.', 7000);
  },
  // dissolved senates pending re-establishment (RR p.359 — after the 2d6-month cooldown)
  senateDissolvedRows(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c || !Array.isArray(c.senates)) return [];
    const turn = c.currentTurn || 1;
    return c.senates.filter(s => s && s.status === 'dissolved').map(s => ({
      id: s.id, name: s.name || s.id, readyAtTurn: s.reestablishCooldownUntilTurn,
      canReestablish: A.canReestablishSenate(c, s, turn) }));
  },
  senateReestablish(senateId){
    const A = window.ACKS, c = this.currentCampaign;
    const r = A.reestablishSenate(c, { senateId });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok) this.showToast('🏛 The senate is re-established — a fresh honeymoon runs until turn ' + r.senate.honeymoonUntilTurn + '.', 6000);
    else if(r && r.reason === 'cooldown') this.showToast('Still in the re-establish cooldown (ready on turn ' + r.readyAtTurn + ').', 5000);
  },
  // === @b8-magicitems (team) — Magic Items W2: state + methods ===
  // Commissioning (the Command exemplar; routes into Magic Research) + MI-5 Traits.
  magicItemCommissionOpen: false,
  commissionForm: { commissionerId: '', casterId: '', catalogKey: '' },
  commissionFormResult: null,
  magicItemTraitPick: '',
  // — Commissioning —
  commissionPatronOptions(){ return (this.currentCampaign && this.currentCampaign.characters) || []; },
  commissionCasterOptions(){ const A = window.ACKS; return ((this.currentCampaign && this.currentCampaign.characters) || []).filter(c => c && (A.isArcaneCaster ? A.isArcaneCaster(c) : c.isArcaneCaster)); },
  openCommissionModal(){ this.commissionForm = { commissionerId:'', casterId:'', catalogKey:'' }; this.commissionFormResult = null; this.magicItemCommissionOpen = true; },
  closeCommissionModal(){ this.magicItemCommissionOpen = false; },
  commissionPreviewNow(){ const f = this.commissionForm; if(!f.commissionerId || !f.casterId || !f.catalogKey) return null; return window.ACKS.commissionPreview(this.currentCampaign, { commissionerCharacterId:f.commissionerId, casterCharacterId:f.casterId, catalogKey:f.catalogKey }); },
  commissionErrorText(e){ const m = { 'insufficient-funds':'the patron cannot afford the up-front payment', 'level-too-low':'the caster is not powerful enough', 'caster-level-too-low':'the caster is not powerful enough', 'caster-not-an-arcane-caster':'the caster is not an arcane caster', 'no-caster':'pick a caster', 'no-commissioner':'pick a patron', 'commissioner-cannot-be-the-caster':'the patron and the caster must differ', 'no-item-config':'pick an item', 'research-engine-unavailable':'the magic-research engine is unavailable' }; return m[e] || e; },
  submitCommission(){ const f = this.commissionForm; const r = window.ACKS.commissionMagicItem(this.currentCampaign, { commissionerCharacterId:f.commissionerId, casterCharacterId:f.casterId, catalogKey:f.catalogKey }); if(r.ok){ this.markDirty(); this.schedulePersist(); this.commissionFormResult = { ok:true, msg:'Commissioned ' + (r.project.name || 'a magic item') + ' — ' + r.costs.upFrontGp.toLocaleString() + 'gp paid up front; ' + r.costs.researchFeeGp.toLocaleString() + 'gp on delivery.' }; this.showToast('Commission issued.', 3000); this.commissionForm = { commissionerId:'', casterId:'', catalogKey:'' }; } else { this.commissionFormResult = { ok:false, msg:'Cannot commission: ' + this.commissionErrorText(r.error || '?') }; } },
  // — the commissions list (on the tab) —
  magicItemCommissions(){ return window.ACKS.commissionProjects(this.currentCampaign); },
  commissionStatusOf(p){ return window.ACKS.commissionStatus(this.currentCampaign, p); },
  commissionPartyName(id){ const c = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === id); return c ? (c.name || c.id) : (id || '—'); },
  resolveCommissionUi(projectId, expedite){ const r = window.ACKS.resolveCommission(this.currentCampaign, projectId, { expedite: !!expedite }); if(r.ok){ this.markDirty(); this.schedulePersist(); this.showToast(r.success ? ('🛠 Commission delivered!' + (r.feePaid ? '' : ' (fee still owed)')) : '🛠 Commission FAILED — up-front lost.', 3500); } else { this.showToast('Cannot resolve: ' + (r.error === 'research-incomplete' ? 'the research is not finished — Expedite, or advance turns' : r.error), 3500); } },
  // — Traits (the optional content pack; in the detail modal) —
  magicItemTraitsOn(){ return window.ACKS.magicItemTraitsEnabled(this.currentCampaign); },
  magicItemTraitsOf(ni){ return ni ? window.ACKS.magicItemTraits(ni) : []; },
  magicItemTraitCatalog(){ return window.ACKS.magicItemTraitsCatalog(); },
  assignMagicItemTraitUi(){ const ni = this.magicItemDetail(); if(!ni || !this.magicItemTraitPick) return; const r = window.ACKS.assignMagicItemTrait(this.currentCampaign, { itemId:ni.id, traitKey:this.magicItemTraitPick }); if(r.ok){ this.markDirty(); this.schedulePersist(); this.magicItemTraitPick = ''; this.showToast('Trait added: ' + r.trait.name, 2500); } else { this.showToast('Cannot add trait: ' + r.error, 2500); } },
  rollMagicItemTraitUi(){ const ni = this.magicItemDetail(); if(!ni) return; const r = window.ACKS.rollMagicItemTrait(this.currentCampaign, { itemId:ni.id }); if(r.ok){ this.markDirty(); this.schedulePersist(); this.showToast('🎲 Rolled trait: ' + r.trait.name, 2500); } else { this.showToast('Cannot roll a trait: ' + r.error, 2500); } },
  removeMagicItemTraitUi(traitKey){ const ni = this.magicItemDetail(); if(!ni) return; window.ACKS.removeMagicItemTrait(this.currentCampaign, { itemId:ni.id, traitKey }); this.markDirty(); this.schedulePersist(); },
  // === @b8-sages      (team) — Sages SG-2: state + methods ===
  // The 📜 Commission modal — set a sage to research a deep question over N days; the slot-64
  // day-tick (acks-engine-sages.js) advances it + delivers the answer on completion. A thin Alpine
  // layer over commissionSage / abandonSageCommission / sageCommissionProgress; the forecast reuses
  // sageConsultForecast (the throw classification is identical) + the actor list reuses sageConsultActors().
  sageCommission: { open:false, sageId:null, clientId:null, subject:'', query:'', specialty:'', daysRequired:30, feeGp:0, answerText:'', inSpecialtyOverride:null, secret:false, result:null },
  openSageCommissionModal(ch){
    const actors = this.sageConsultActors();
    const def = (ch && actors.some(a => a.id === ch.id)) ? ch.id : (actors[0] ? actors[0].id : null);
    if(!def){ if(this.showToast) this.showToast('No active character to commission.'); return; }
    const sageCh = (this.currentCampaign.characters||[]).find(c => c && c.id === def);
    this.sageCommission = { open:true, sageId:def, clientId:def, subject:'', query:'', specialty:(sageCh && sageCh.sageSpecialty) || '', daysRequired:30, feeGp:0, answerText:'', inSpecialtyOverride:null, secret:false, result:null };
  },
  closeSageCommissionModal(){ this.sageCommission.open = false; this.sageCommission.result = null; },
  sageCommissionSetSage(id){
    const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id);
    this.sageCommission.sageId = id;
    if(!this.sageCommission.clientId) this.sageCommission.clientId = id;
    this.sageCommission.specialty = (ch && ch.sageSpecialty) || '';
    this.sageCommission.inSpecialtyOverride = null;
    this.sageCommission.result = null;
  },
  sageCommissionSageObj(){
    const id = this.sageCommission.sageId;
    return id ? ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id) : null;
  },
  sageCommissionForecastUI(){
    const sage = this.sageCommissionSageObj();
    if(!sage || !window.ACKS.sageConsultForecast) return null;
    return window.ACKS.sageConsultForecast(this.currentCampaign, sage, {
      subject: this.sageCommission.subject, specialty: this.sageCommission.specialty,
      inSpecialty: this.sageCommission.inSpecialtyOverride
    });
  },
  sageCommissionSubmit(){
    const sage = this.sageCommissionSageObj();
    if(!sage) return;
    const r = window.ACKS.commissionSage(this.currentCampaign, {
      sageId: this.sageCommission.sageId, clientId: this.sageCommission.clientId || this.sageCommission.sageId,
      subject: this.sageCommission.subject, query: this.sageCommission.query, specialty: this.sageCommission.specialty,
      inSpecialty: this.sageCommission.inSpecialtyOverride, daysRequired: Number(this.sageCommission.daysRequired) || 30,
      feeGp: Number(this.sageCommission.feeGp) || 0, answerText: this.sageCommission.answerText, secret: this.sageCommission.secret
    });
    this.sageCommission.result = r;
    if(r && r.ok){ this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast('The sage begins the research.'); }
    else if(r && this.showToast){ this.showToast(r.error === 'insufficient-funds' ? 'The inquirer cannot afford the fee.' : ('Cannot commission: ' + r.error)); }
  },
  sageCommissionList(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !A.sageCommissionsForCharacter || !this.sageCommission.sageId) return [];
    return A.sageCommissionsForCharacter(c, this.sageCommission.sageId)
      .map(com => Object.assign({}, com, { progress: A.sageCommissionProgress(c, com) }))
      .sort((a, b) => (a.status === 'in-progress' ? 0 : 1) - (b.status === 'in-progress' ? 0 : 1));
  },
  abandonSageCommissionUi(id){
    const r = window.ACKS.abandonSageCommission(this.currentCampaign, id);
    if(r && r.ok){ this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast('Commission called off.'); }
  },

            emitWizardKind: '', emitWizardPayloadJson: '{}',
            emitWizardCtxHexId: '', emitWizardCtxSettlementId: '', emitWizardCtxDomainId: '',
            emitWizardCtxRelatedJson: '[]', emitWizardNotes: '', emitWizardCadence: 'monthly-turn',
  // ─── burst9 (team session) — per-agent state + methods. Each builder appends its
  //     object properties (`prop(){…},` / `stateVar: …,`) right AFTER its OWN marker line
  //     below — disjoint anchors → clean 6-way merge. Wrap your block in a
  //     `// === <Topic> (team) ===` header. Do NOT edit another lane's marker. ───
  // === @b9-politics   (team) — Politics P-5 Senate Wizard: state + methods ===
  // The 📜 Senate Motion Wizard — the guided Action verb that authors + resolves a senate motion
  // end-to-end (open → gather votes [REUSE ACKS.senateVote] → tally → enact/reject → record). A thin
  // UI over the P-5 engine (openSenateMotion / previewSenateMotionVote / resolveSenateMotion /
  // withdrawSenateMotion). The flat Consult + Enact panels (P-2) and the influence/dispute actions
  // (P-3) are unchanged — this composes them into one guided flow. Launched from the 🏛 Senate tab.
  motionWizard: { open: false, senateId: '', motionId: null, kind: 'edict', matter: 'change-taxes',
    customMatter: '', policyObjective: '', title: '', mode: 'per-senator', domainMorale: 0,
    rulerFactionId: '', militaryLoyalty: 'none', controlledIndependentVotes: 0, policyHelps: [],
    policyHinders: [], gmOutcome: 'approved', vote: null, rolledSpec: null, enactDespiteRejection: false },
  // the senate the wizard is operating on (its own id, else the tab-selected senate)
  motionWizardSenate(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c) return null;
    return A.findSenate(c, this.motionWizard.senateId) || this.senateSelected();
  },
  motionWizardAutoVoteOn(){ return this.senateAutoVoteOn(); },
  motionWizardDisputeOpen(){ const s = this.motionWizardSenate(); return !!(s && s.dispute != null); },
  motionWizardDisputeTopic(){ const s = this.motionWizardSenate(); return (s && s.dispute && s.dispute.defiedTopic) || '—'; },
  motionWizardInHoneymoon(){ const A = window.ACKS, c = this.currentCampaign, s = this.motionWizardSenate(); return !!(A && c && s && A.senateInHoneymoon(c, s)); },
  // the resolved matter string: an edict's picked/custom matter; '' for policy/dispute (the objective /
  // the open dispute's topic carry the subject for those kinds).
  _motionWizardMatter(){ const w = this.motionWizard; return w.kind === 'edict' ? (w.matter === '__custom__' ? (w.customMatter || '') : w.matter) : ''; },
  motionWizardRestricted(){ const A = window.ACKS, w = this.motionWizard; if(w.kind !== 'edict') return false; return !!(A && A.isSenateConsultationRequired && A.isSenateConsultationRequired(this._motionWizardMatter())); },
  // the spec the engine verbs consume (openSenateMotion / previewSenateMotionVote)
  _motionWizardSpec(){
    const w = this.motionWizard, senate = this.motionWizardSenate();
    return { senateId: senate ? senate.id : '', kind: w.kind, matter: this._motionWizardMatter(),
      policyObjective: w.kind === 'policy' ? w.policyObjective : '', title: w.title, mode: w.mode,
      domainMorale: Number(w.domainMorale) || 0, rulerFactionId: w.rulerFactionId || null,
      militaryLoyalty: w.militaryLoyalty, controlledIndependentVotes: Number(w.controlledIndependentVotes) || 0,
      policyHelps: (w.policyHelps || []).slice(), policyHinders: (w.policyHinders || []).slice() };
  },
  motionWizardCanRoll(){
    const w = this.motionWizard;
    if(w.kind === 'dispute') return this.motionWizardDisputeOpen();
    if(w.kind === 'policy') return !!w.policyObjective;
    return !!this._motionWizardMatter();   // edict
  },
  motionWizardRollHint(){
    const w = this.motionWizard;
    if(w.kind === 'dispute') return 'No dispute is open to resolve.';
    if(w.kind === 'policy') return 'Pick a policy objective first.';
    return 'Pick or type the matter first.';
  },
  // open the wizard (fresh, or resuming an existing tabled motion → loads its inputs)
  openMotionWizard(senateId, motionId){
    const A = window.ACKS, c = this.currentCampaign;
    const sid = senateId || (this.senateSelected() && this.senateSelected().id);
    if(!A || !c || !sid) return;
    const senate = A.findSenate(c, sid);
    if(!senate) return;
    const inDispute = senate.dispute != null;
    this.motionWizard = { open: true, senateId: sid, motionId: motionId || null,
      kind: inDispute ? 'dispute' : 'edict', matter: 'change-taxes', customMatter: '', policyObjective: '',
      title: '', mode: 'per-senator', domainMorale: 0, rulerFactionId: '', militaryLoyalty: 'none',
      controlledIndependentVotes: 0, policyHelps: [], policyHinders: [], gmOutcome: 'approved',
      vote: null, rolledSpec: null, enactDespiteRejection: false };
    if(motionId){
      const m = A.findSenateMotion(c, sid, motionId);
      if(m){
        const restricted = ((A.SENATE_RESTRICTED_MATTERS || []).indexOf(m.matter) >= 0);
        const isCustom = m.kind === 'edict' && m.matter && !restricted;
        Object.assign(this.motionWizard, {
          kind: m.kind, matter: isCustom ? '__custom__' : (m.matter || 'change-taxes'),
          customMatter: isCustom ? m.matter : '', policyObjective: m.policyObjective || '',
          title: m.title || '', mode: m.mode || 'per-senator', domainMorale: m.domainMorale || 0,
          rulerFactionId: m.rulerFactionId || '', militaryLoyalty: m.militaryLoyalty || 'none',
          controlledIndependentVotes: m.controlledIndependentVotes || 0,
          policyHelps: (m.policyHelps || []).slice(), policyHinders: (m.policyHinders || []).slice() });
      }
    }
  },
  closeMotionWizard(){ this.motionWizard.open = false; this.motionWizard.vote = null; this.motionWizard.rolledSpec = null; },
  // Step 3 — roll the votes (REUSE the engine's senateVote via previewSenateMotionVote; pure, no event).
  motionWizardRoll(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.motionWizardSenate();
    if(!A || !c || !senate || !this.motionWizardCanRoll()) return;
    const w = this.motionWizard, spec = this._motionWizardSpec();
    const honeymoon = this.motionWizardInHoneymoon();
    const auto = this.motionWizardAutoVoteOn() && !honeymoon;
    const res = A.previewSenateMotionVote(c, { senateId: senate.id, motion: spec,
      rng: Math.random, autoRoll: auto, gmOutcome: honeymoon ? 'approved' : w.gmOutcome });
    this.motionWizard.vote = res;
    this.motionWizard.rolledSpec = spec;
  },
  motionWizardCanCommit(){ return !!this.motionWizard.vote; },
  motionWizardCommitDisabledReason(){ return this.motionWizard.vote ? '' : 'Roll the vote first (Step 3).'; },
  motionWizardCommitLabel(){
    const w = this.motionWizard, v = w.vote;
    if(!v) return '✓ Resolve';
    if(w.kind === 'dispute') return v.approved ? '✓ Clear the dispute' : '⚠ Resolve (escalates)';
    if(v.approved) return '✓ Enact with the senate’s sanction';
    if(this.motionWizardRestricted() && w.enactDespiteRejection) return '⚠ Defy the senate (→ dispute)';
    return '✗ Motion fails (stand down)';
  },
  motionWizardResolveHint(){
    const w = this.motionWizard, v = w.vote;
    if(!v) return 'Gather the votes (Step 3) before resolving.';
    if(w.kind === 'dispute') return v.approved
      ? 'A majority FOR grants retroactive approval — the dispute ends and benefits return (RR p.359).'
      : 'Without a majority the dispute deepens: the against-voters seek to replace the ruler (RR p.359).';
    if(v.approved) return 'The motion carries — it is enacted with the senate’s sanction.';
    if(this.motionWizardRestricted()) return w.enactDespiteRejection
      ? 'The ruler enacts a restricted matter against the senate — the realm goes into dispute (RR p.359).'
      : 'The motion fails; the ruler stands down (no dispute).';
    return 'The motion fails; nothing is enacted.';
  },
  // commit — open the motion (if fresh) + resolve it with the shown tally (the two P-5 events fire here).
  motionWizardCommit(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.motionWizardSenate();
    if(!A || !c || !senate || !this.motionWizard.vote) return;
    let motionId = this.motionWizard.motionId;
    if(!motionId){
      const m = A.openSenateMotion(c, this.motionWizard.rolledSpec || this._motionWizardSpec());
      if(!m) return;
      motionId = m.id; this.motionWizard.motionId = motionId;
    }
    const r = A.resolveSenateMotion(c, { senateId: senate.id, motionId, voteResult: this.motionWizard.vote,
      enactDespiteRejection: this.motionWizard.enactDespiteRejection });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok){
      const m = r.motion;
      this.showToast('📜 Motion resolved — ' + m.status + (m.outcome ? ' (' + m.outcome + ')' : ''), 5000);
    }
    this.closeMotionWizard();
  },
  // table the motion (open it, resolve later) — only when fresh (no motionId yet)
  motionWizardTable(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c || this.motionWizard.motionId || !this.motionWizardCanRoll()) return;
    const m = A.openSenateMotion(c, this._motionWizardSpec());
    this.markDirty(); this.schedulePersist();
    if(m) this.showToast('📋 Motion tabled — resolve it from the Motions list.', 4000);
    this.closeMotionWizard();
  },
  // the motions log for the selected senate (newest first)
  senateMotionRows(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate) return [];
    return (A.senateMotionsForSenate(c, senate.id) || []).slice().reverse().map(m => ({
      id: m.id, kind: m.kind,
      subject: m.title || (m.kind === 'dispute' ? 'retroactive approval' : (m.policyObjective || m.matter || '(matter)')),
      status: m.status, outcome: m.outcome,
      votes: m.voteResult ? (m.voteResult.forVotes + '/' + m.voteResult.againstVotes) : '—',
      turn: (m.resolvedAtTurn != null) ? m.resolvedAtTurn : m.openedAtTurn,
      isOpen: m.status === 'open' }));
  },
  motionStatusClass(s){
    if(s === 'enacted' || s === 'dispute-cleared') return 'bg-green-200 text-green-900';
    if(s === 'defied' || s === 'dispute-escalated' || s === 'rejected') return 'bg-red-200 text-red-900';
    if(s === 'open') return 'bg-yellow-200 text-yellow-900';
    return 'bg-gray-200';
  },
  senateResumeMotion(id){ const s = this.senateSelected(); if(s) this.openMotionWizard(s.id, id); },
  senateWithdrawMotion(id){
    const A = window.ACKS, c = this.currentCampaign, s = this.senateSelected();
    if(!A || !c || !s) return;
    const m = A.withdrawSenateMotion(c, { senateId: s.id, motionId: id });
    if(m){ this.markDirty(); this.schedulePersist(); this.showToast('Motion withdrawn.', 3000); }
  },
  // === @b9-sages      (team) — Sages SG-3 periodic-fee retainer: state + methods ===
  // A patron RETAINS a sage on a monthly fee (RR p.171 specialist wage, default 500 gp/mo) for
  // priority (the sage is on call) + covered consultations. Surfaced ON the Consult-a-Sage modal
  // (the 🤝 Retainer section near the fee). Thin Alpine layer over acks-engine-sages.js (retainSage
  // / endSageRetainer / sageRetainerFor / sageRetainersForCharacter). The monthly bill rides the
  // shipped slot-64 day-tick (the Day Clock / Advance Month) — no UI billing button needed.
  retainerFeeGp: 500,
  retainerResult: null,
  // The active retainer between the modal's inquirer (client) and the selected sage, or null.
  sageRetainerForUI(){
    const A = window.ACKS;
    if(!A || !A.sageRetainerFor) return null;
    return A.sageRetainerFor(this.currentCampaign, this.sageConsult.clientId, this.sageConsult.sageId) || null;
  },
  sageConsultClientName(){
    const id = this.sageConsult.clientId;
    const c = id ? ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === id) : null;
    return (c && c.name) || 'the inquirer';
  },
  // Every active retainer the inquirer holds (as the client), for the modal's list.
  clientRetainerRows(){
    const A = window.ACKS, c = this.currentCampaign, id = this.sageConsult.clientId;
    if(!A || !A.sageRetainersForCharacter || !id) return [];
    const chars = (c && c.characters) || [];
    return A.sageRetainersForCharacter(c, id)
      .filter(r => r.clientCharacterId === id)
      .map(r => { const s = chars.find(x => x && x.id === r.sageCharacterId); return Object.assign({}, r, { sageName: (s && s.name) || r.sageCharacterId }); });
  },
  retainSelectedSage(){
    const A = window.ACKS;
    const r = A.retainSage(this.currentCampaign, {
      sageId: this.sageConsult.sageId, clientId: this.sageConsult.clientId,
      feeGpPerMonth: Number(this.retainerFeeGp) || 0, specialty: this.sageConsult.specialty
    });
    this.retainerResult = r;
    if(r && r.ok){ this.sageConsult.result = null; this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast('Sage retained — the first month is paid.'); }
    else if(r && this.showToast){ this.showToast(r.error === 'insufficient-funds' ? 'The inquirer cannot afford the first month.' : ('Cannot retain: ' + (r.error || ''))); }
  },
  endSageRetainerUi(id){
    const r = window.ACKS.endSageRetainer(this.currentCampaign, id);
    this.retainerResult = r;
    if(r && r.ok){ this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast('Retainer ended.'); }
  },
  // === @b9-lifecycle  (team) — Lifecycle CL-5 transformation: state + methods ===
  // Character transformation (JJ pp.94–95) over acks-engine-lifecycle.js: transform a character into a
  // monster (a Spells save keeps/loses class abilities; an alignment-drift Death save schedule rides the
  // monthly turn — success keeps your old self), roll a drift save by hand, or revert. The reserved
  // character.transformationState is the ledger; the CAUSE (lycanthropy/crossbreed/ritual) is a Magic stub —
  // this is the GM verb. The transform modal is at the @b9-lifecycle modal marker; the char-sheet
  // Transformations section is in the Health/Lifecycle cluster (section:char-transformation).
  cl5Modal: { open:false, charId:null, charName:'', form:'', trigger:'lycanthropy',
    reversible:true, rejectedGift:false, afterTheFlesh:false, driftSaveIntervalMonths:12 },
  cl5IsTransformed(ch){ const A=window.ACKS; return !!(ch && A && A.isTransformed && A.isTransformed(ch)); },
  cl5TxInfo(ch){ const A=window.ACKS; return (ch && A && A.characterTransformationInfo) ? A.characterTransformationInfo(ch) : { transformed:false }; },
  cl5Triggers(){ return (window.ACKS && window.ACKS.TRANSFORMATION_TRIGGERS) || []; },
  cl5SelectedTrigger(){ const A=window.ACKS; return (A && A.transformationTriggerById) ? A.transformationTriggerById(this.cl5Modal.trigger) : null; },
  _cl5Touch(msg){ if(this.markDirty) this.markDirty(); if(this.schedulePersist) this.schedulePersist(); if(msg && this.showToast) this.showToast(msg, 3000); },
  cl5OpenTransform(ch){ this.cl5Modal = { open:true, charId:ch.id, charName:ch.name, form:'', trigger:'lycanthropy', reversible:true, rejectedGift:false, afterTheFlesh:false, driftSaveIntervalMonths:12 }; },
  cl5ConfirmTransform(){
    const m=this.cl5Modal; const A=window.ACKS;
    const st = A.transformCharacter(this.currentCampaign, m.charId, {
      form: (m.form||'').trim(), trigger: m.trigger, reversible: m.reversible,
      rejectedGift: m.rejectedGift, afterTheFlesh: m.afterTheFlesh,
      driftSaveIntervalMonths: Number(m.driftSaveIntervalMonths) || 12
    });
    if(!st){ if(this.showToast) this.showToast('Give the new form a name first.', 3000); return; }
    this.cl5Modal.open=false;
    this._cl5Touch(m.charName + ' is transformed into a ' + st.form + (st.keptClassAbilities ? '' : ' — lost their class abilities') + (st.retainedSelf ? '' : ' — and their mind') + '.');
  },
  cl5Revert(ch){ const A=window.ACKS; const r = A.revertCharacter(this.currentCampaign, ch.id, { reason:'reverted' }); if(r) this._cl5Touch(ch.name + ' reverts from ' + r.form + ' to their original form.'); },
  cl5DriftSaveNow(ch){
    const A=window.ACKS; const form = (ch.transformationState && ch.transformationState.form) || 'the beast';
    const res = A.transformationDriftSave(this.currentCampaign, ch.id);
    if(!res) return;
    this._cl5Touch(res.drifted ? (ch.name + ' drifts away — now thinks as a ' + form + ' (drift save ' + res.roll + ' vs ' + res.target + '+ — failed).')
                               : (ch.name + ' holds on to their own mind (drift save ' + res.roll + ' vs ' + res.target + '+).'));
  },
  // === @b9-hexscales  (team) — Hex Scales HW-5 local authoring: state + methods ===
  //     The HW-5 local-tier methods (mapLocalParentHexId / mapEnterLocalScale / mapLocalDrill /
  //     mapLocalView / mapLocalMarkup / mapLocalAddHex / mapLocalBackToRegional) live WITH the HW-4
  //     map-scale methods (the "agent-6 (Hex Scales HW-5)" section just after mapContinentalMarkup),
  //     and the ⬡ Local scale button extends the HW-4 switcher (map-control:scale-local). Nothing here.
  // ─── burst10 (team session 2026-06-20) — per-agent state + methods. Each builder appends its Alpine
  //     state + methods ONLY after its own @b10-<lane> marker below; the Lead reconciles at integration. ───
  // ─── burst11 (team session 2026-06-20) — per-agent Alpine state + methods. Each builder appends its
  //     state + methods ONLY after its own @b11-<lane> marker below; the Lead reconciles at integration. ───
  // === @b11-politics   (team) — P-7 senate-materialization wizard: state + methods ===
  // The generative Senate Wizard — thin UI over acks-engine-politics.js (proposeSenateMaterialization /
  // materializeSenate + senateMaterializeCandidates). Reads the SHIPPED demographics census to draw
  // senators; mints sen-/fac-/snr-; sets the apex governance senatorial; emits one senate-materialized.
  senGen: { open:false, apexId:null, seats:null, seed:1, extraPick:'', extras:[], replace:false, fillWithGenerated:true, plan:null },
  // the realm apexes (no liege) — where a senate can be convened (self-contained; not @b10's helper)
  senGenApexRows(){
    const c = this.currentCampaign; if(!c || !Array.isArray(c.domains)) return [];
    return c.domains.filter(d => d && !d.liegeId).map(d => ({ id: d.id, name: d.name || d.id }));
  },
  // the fixed launcher pill — shown on the 🏛 Senate tab + the World ▸ Domains sub-view (so a
  // cold-start realm with no senate can still reach the generator). Hidden when there's no realm.
  senGenLauncherVisible(){
    return !!(this.currentCampaign && this.senGenApexRows().length > 0
      && this.currentView === 'domains');
  },
  senGenCharName(id){ const ch = ((this.currentCampaign||{}).characters||[]).find(c => c && c.id === id); return (ch && (ch.name||ch.id)) || id; },
  openSenateGen(apexId){
    const rows = this.senGenApexRows();
    this.senGen.apexId = apexId || (rows[0] && rows[0].id) || null;
    this.senGen.seats = null; this.senGen.seed = 1; this.senGen.extras = []; this.senGen.extraPick = ''; this.senGen.replace = false;
    this.senGen.plan = null;
    this.senGenRepreview();
    this.senGen.open = true;
  },
  closeSenateGen(){ this.senGen.open = false; },
  // (re)compute the plan from the current realm/seats/seed/extras (pure; the engine clamps seats).
  senGenRepreview(){
    const c = this.currentCampaign; if(!c || !this.senGen.apexId){ this.senGen.plan = null; return; }
    const p = window.ACKS.proposeSenateMaterialization(c, {
      domainId: this.senGen.apexId,
      seats: (this.senGen.seats != null && this.senGen.seats !== '') ? Number(this.senGen.seats) : undefined,
      seed: this.senGen.seed, extraCharacterIds: this.senGen.extras.slice(),
      fillWithGenerated: !!this.senGen.fillWithGenerated      // @b14-politics — mint senators to fill the shortfall
    });
    this.senGen.plan = (p && p.ok) ? p : null;
    // snap the seats input to the clamped senate size so the field always shows the real value
    if(this.senGen.plan) this.senGen.seats = this.senGen.plan.seats;
  },
  senGenReroll(){ this.senGen.seed = (this.senGen.seed || 1) + 1; this.senGenRepreview(); },
  senGenApexChanged(){ this.senGen.seats = null; this.senGen.extras = []; this.senGen.extraPick = ''; this.senGenRepreview(); },
  senGenSeatsChanged(){ this.senGenRepreview(); },
  senGenFactionName(idx){ const p = this.senGen.plan; const f = (p && idx != null) ? p.factions[idx] : null; return f ? f.name : '—'; },
  // the GM-add picker: every character except the apex ruler + already-added extras + the deceased
  senGenAddCandidates(){
    const c = this.currentCampaign; if(!c) return [];
    const apex = (c.domains||[]).find(d => d && d.id === this.senGen.apexId);
    const rulerId = apex && apex.rulerCharacterId;
    const have = new Set(this.senGen.extras);
    return (c.characters||[]).filter(ch => ch && ch.id !== rulerId && !have.has(ch.id) && ch.lifecycleState !== 'deceased');
  },
  senGenAddExtra(){ const id = this.senGen.extraPick; if(id && this.senGen.extras.indexOf(id) < 0){ this.senGen.extras.push(id); this.senGenRepreview(); } this.senGen.extraPick = ''; },
  senGenRemoveExtra(id){ const i = this.senGen.extras.indexOf(id); if(i >= 0){ this.senGen.extras.splice(i,1); this.senGenRepreview(); } },
  senGenAlreadyHasSenate(){
    const c = this.currentCampaign; if(!c || !this.senGen.apexId) return false;
    const s = window.ACKS.senateForRealm(c, this.senGen.apexId);
    return !!(s && s.status !== 'dissolved');
  },
  senGenMaterialize(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!c || !this.senGen.plan){ this.showToast('No senate plan to materialize.', 4000, 'warn'); return; }
    const r = A.materializeSenate(c, { domainId: this.senGen.apexId, plan: this.senGen.plan, replace: this.senGen.replace });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok){
      this.senGen.open = false;
      this.currentView = 'domains'; this.domainsSubView = 'governance';
      this.senateSelectedId = r.senate.id;
      this.showToast('🏛 A ' + r.senate.seats + '-seat senate is convened — ' + r.senatorships.length + ' leading senators in ' + r.factions.length + ' faction' + (r.factions.length===1?'':'s') + '.', 6000);
    } else {
      const why = (r && r.reason) === 'senate-exists' ? 'a senate already governs this realm (tick Replace to convene a new one)' : ((r && r.reason) || 'error');
      this.showToast('Could not materialize the senate: ' + why, 5000, 'warn');
    }
  },
  // === @b11-delves     (team) — D5 settlement off-screen (SettlementVisit + urban incidents): state + methods ===
  // Thin UI over the D5 engine (acks-engine-delves.js): start/depart a SettlementVisit, roll urban
  // incidents (JJ ch.3), and resolve a combat-risk fight via the shipped Mortal Wounds resolver.
  // No house rule (RAW core); the launcher floats on the World ▸ 🕳️ Dungeons sub-view.
  svtUI: { open:false, selectedId:null, startSettlementId:'', startMode:'holed-up', startParticipantIds:[], afterDark:false },
  openSettlementVisits(){ this.svtUI.open = true; if(!this.svtUI.selectedId){ const list = this.svtVisits(); if(list.length) this.svtUI.selectedId = list[0].id; } },
  svtVisits(){ const c = this.currentCampaign; if(!c || !Array.isArray(c.settlementVisits)) return []; return c.settlementVisits.slice().sort((a,b)=> (a.status==='active'?0:1)-(b.status==='active'?0:1)); },
  svtSelected(){ const c = this.currentCampaign; if(!c || !this.svtUI.selectedId) return null; return (c.settlementVisits||[]).find(v=>v && v.id===this.svtUI.selectedId) || null; },
  svtSettlementOptions(){ const c = this.currentCampaign; if(!c) return []; const out = []; (c.settlements||[]).forEach(s=>{ if(s && s.id) out.push({ id:s.id, name:s.name||s.id }); }); return out; },   /* T6 single-home — settlements live in campaign.settlements[] */
  svtSettlementName(id){ const o = this.svtSettlementOptions().find(x=>x.id===id); return o ? o.name : 'the settlement'; },
  svtCharacterOptions(){ const c = this.currentCampaign; return (c && Array.isArray(c.characters)) ? c.characters.filter(x=>x && x.alive!==false) : []; },
  svtCharName(id){ const c = this.currentCampaign; const ch = ((c && c.characters)||[]).find(x=>x && x.id===id); return ch ? (ch.name||'(unnamed)') : id; },
  svtToggleParticipant(id){ const i = this.svtUI.startParticipantIds.indexOf(id); if(i>=0) this.svtUI.startParticipantIds.splice(i,1); else this.svtUI.startParticipantIds.push(id); },
  svtStart(){ const c = this.currentCampaign; if(!c || !this.svtUI.startSettlementId) return; const v = window.ACKS.startSettlementVisit(c, { settlementId:this.svtUI.startSettlementId, participantCharacterIds:this.svtUI.startParticipantIds.slice(), mode:this.svtUI.startMode }); if(v){ this.svtUI.selectedId = v.id; this.svtUI.startParticipantIds = []; this.markDirty(); this.schedulePersist(); this.showToast('🏙 Stay started in ' + this.svtSettlementName(v.settlementId)); } },
  svtDepart(id){ const c = this.currentCampaign; window.ACKS.departSettlementVisit(c, id); this.markDirty(); this.schedulePersist(); this.showToast('🚪 Departed the settlement.'); },
  svtRoll(){ const c = this.currentCampaign; const v = this.svtSelected(); if(!v || v.status!=='active') return; const rec = window.ACKS.rollAndApplySettlementIncident(c, v.id, { afterDark:this.svtUI.afterDark }); this.markDirty(); this.schedulePersist(); if(rec) this.showToast('🏙 ' + (rec.label || 'Incident')); },
  svtIncidents(){ const v = this.svtSelected(); return (v && Array.isArray(v.incidents)) ? v.incidents.slice().reverse() : []; },
  svtResolveCasualty(charId){ const c = this.currentCampaign; const v = this.svtSelected(); if(!v || !charId) return; const res = window.ACKS.resolveSettlementCasualty(c, v.id, charId); this.markDirty(); this.schedulePersist(); if(res) this.showToast('⚔ ' + this.svtCharName(charId) + ' — ' + (res.conditionLabel || 'wounded') + (res.outcome ? ' (' + res.outcome + ')' : '')); },
  // === @b11-knowledge  (team) — Knowledge Wave B (share / promote-rumor→lore / provenance): state + methods ===
  knowledgeShareVerbatim: false,   // the share "verbatim" toggle (off = gossip degrades the certainty one band)
  knowledgePromotableRumors(){ return (window.ACKS && window.ACKS.promotableRumors) ? window.ACKS.promotableRumors(this.currentCampaign) : []; },
  knowledgePromote(rumorId){
    const r = window.ACKS.promoteRumorToLore(this.currentCampaign, { rumorId });
    if(!r || !r.ok){ this.showToast('Could not promote: '+((r&&r.reason)||'?'), 3500); return; }
    this.knowledgeSelectedLoreId = r.lore.id;
    if(r.alreadyPromoted){ this.showToast('Already promoted — showing the Lore.', 3000); return; }
    this.markDirty(); this.schedulePersist(); this.showToast('Rumor promoted to Lore.', 2800);
  },
  // The provenance trail (Wave B §5.5) — "Cass ← Bryn ← Aelric (deduced)". Walks the told-by chain to
  // the origin via the engine loreProvenanceChain. Shown on told-by/gossip knower rows.
  knowledgeChainText(knowerKind, knowerId, loreId){
    const A = window.ACKS;
    if(!A || !A.loreProvenanceChain) return '';
    const chain = A.loreProvenanceChain(this.currentCampaign, knowerKind, knowerId, loreId);
    if(chain.length <= 1) return '';
    const names = chain.map(h => h.knowerKind === 'character' ? this.knowledgeCharName(h.knowerId) : (h.knowerKind + ' ' + h.knowerId));
    let s = names.join(' ← ');
    const origin = chain[chain.length - 1];
    if(origin && origin.hasRecord && origin.sourceKind && origin.sourceKind !== 'told-by' && origin.sourceKind !== 'gossip') s += ' (' + origin.sourceKind + ')';
    return s;
  },
  // === @b11-magicitems (team) — MI-3 magic-item market (buy / sell / appraise): state + methods ===
  // A thin Alpine layer over the engine verbs (acks-engine-magic-items.js): appraiseMagicItemAtMarket /
  // sellMagicItem / buyMagicItem + the magicItemMarketAvailability gate + the TT magicItemPriceSpread.
  // The coin move rides GP Wave B inside the verb; the item is a notableItem. All reads guard
  // currentCampaign (the modal is x-show, not unmounted — it evaluates on the welcome screen too).
  magicMarket: { open:false, settlementId:'', actorId:'', mode:'appraise', sellItemId:'', buySource:'stock', buyItemId:'', buyCatalogKey:'', gmOverride:false, result:null },
  magicMarketSettlements(){ return (this.currentCampaign && Array.isArray(this.currentCampaign.settlements)) ? this.currentCampaign.settlements : []; },
  magicMarketActors(){ return (this.currentCampaign && Array.isArray(this.currentCampaign.characters)) ? this.currentCampaign.characters : []; },
  magicMarketSettlementObj(){ const id = this.magicMarket.settlementId; return id ? this.magicMarketSettlements().find(s => s && s.id === id) : null; },
  magicMarketActorObj(){ const id = this.magicMarket.actorId; return id ? this.magicMarketActors().find(c => c && c.id === id) : null; },
  magicMarketActorGp(){ const c = this.magicMarketActorObj(); return (c && c.coins && c.coins.gp) || 0; },
  _magicMarketFindNotable(id){ return ((this.currentCampaign && this.currentCampaign.notableItems) || []).find(n => n && n.id === id) || null; },
  openMagicMarket(){ const s = this.magicMarketSettlements(), c = this.magicMarketActors(); this.magicMarket = { open:true, settlementId: s[0] ? s[0].id : '', actorId: c[0] ? c[0].id : '', mode:'appraise', sellItemId:'', buySource:'stock', buyItemId:'', buyCatalogKey:'', gmOverride:false, result:null }; },
  closeMagicMarket(){ this.magicMarket.open = false; this.magicMarket.result = null; },
  magicMarketClassLabel(s){ if(!s || !this.currentCampaign || !window.ACKS.magicMarketClassIdx) return '?'; return ['I','II','III','IV','V','VI'][window.ACKS.magicMarketClassIdx(this.currentCampaign, s)] || '?'; },
  magicMarketRarityOf(ni){ const A = window.ACKS; if(!ni || !this.currentCampaign) return ''; const bc = A.magicItemBaseCost(this.currentCampaign, ni); const r = (ni.intrinsic && ni.intrinsic.rarity) || (bc != null ? A.magicItemRarity(bc) : 'common'); return A.magicItemRarityLabel(r); },
  magicMarketSellItems(){ return (this.magicMarket.actorId && this.currentCampaign) ? window.ACKS.sellableMagicItemsFor(this.currentCampaign, this.magicMarket.actorId) : []; },
  magicMarketStockItems(){ return (this.magicMarket.settlementId && this.currentCampaign) ? window.ACKS.magicItemMarketListings(this.currentCampaign, this.magicMarket.settlementId) : []; },
  magicMarketCatalog(){ return window.ACKS.magicItemCatalog ? window.ACKS.magicItemCatalog() : []; },
  magicMarketForecast(){
    const A = window.ACKS, camp = this.currentCampaign, m = this.magicMarket;
    if(!camp || !A.magicItemPriceSpread) return null;
    const set = this.magicMarketSettlementObj(); if(!set) return null;
    let ref = null;
    if(m.mode === 'buy'){ ref = (m.buySource === 'catalog') ? (m.buyCatalogKey || null) : (m.buyItemId ? this._magicMarketFindNotable(m.buyItemId) : null); }
    else { ref = m.sellItemId ? this._magicMarketFindNotable(m.sellItemId) : null; }
    if(!ref) return null;
    const spread = A.magicItemPriceSpread(camp, ref);
    if(!spread || !spread.available) return { available:false, reason: (spread && spread.reason) || 'no-base-cost' };
    return { available:true, spread,
      buyAv:  A.magicItemMarketAvailability(camp, ref, set, { direction:'buy'  }),
      sellAv: A.magicItemMarketAvailability(camp, ref, set, { direction:'sell' }) };
  },
  magicMarketTransactNote(av){ if(!av) return ''; if(!av.transactable) return '· ✗ too rare for this market'; if(!av.available) return '· ✗ market full this month'; return '· ✓ ' + av.monthlyRemaining + ' left this month'; },
  magicMarketCanSubmit(){
    const f = this.magicMarketForecast(), m = this.magicMarket;
    if(!f || !f.available || !m.actorId) return false;
    if(m.mode === 'sell'){ if(!m.sellItemId) return false; return !!m.gmOverride || (f.sellAv.transactable && f.sellAv.available); }
    if(m.mode === 'buy'){ const has = m.buySource === 'catalog' ? !!m.buyCatalogKey : !!m.buyItemId; if(!has) return false; const afford = this.magicMarketActorGp() >= f.spread.buy; return afford && (!!m.gmOverride || (f.buyAv.transactable && f.buyAv.available)); }
    return !!m.sellItemId;
  },
  magicMarketErr(e){ const map = { 'market-too-small-for-rarity':'this market is too small to deal in an item this rare', 'monthly-ceiling':'the market has filled its quota for this rarity this month', 'not-transactable':'this market cannot deal in an item this rare', 'insufficient-funds':'the buyer cannot afford it', 'unknown-settlement':'pick a settlement', 'unknown-item':'pick an item', 'no-item':'pick an item', 'unknown-buyer':'pick a buyer', 'no-seller':'pick a seller', 'no-base-cost':'this item has no base cost to price', 'payment-failed':'the coin transfer failed' }; return map[e] || e; },
  magicMarketSubmitAppraise(){ const m = this.magicMarket; const r = window.ACKS.appraiseMagicItemAtMarket(this.currentCampaign, { itemId: m.sellItemId, settlementId: m.settlementId, characterId: m.actorId || null }); if(r.ok){ this.markDirty && this.markDirty(); this.schedulePersist && this.schedulePersist(); m.result = { ok:true, msg: r.event.payload.narrative }; } else { m.result = { ok:false, msg: 'Cannot appraise: ' + this.magicMarketErr(r.error || '?') }; } },
  magicMarketSubmitSell(){ const m = this.magicMarket; const r = window.ACKS.sellMagicItem(this.currentCampaign, { itemId: m.sellItemId, sellerCharacterId: m.actorId, settlementId: m.settlementId, gmOverride: !!m.gmOverride }); if(r.ok){ this.markDirty && this.markDirty(); this.schedulePersist && this.schedulePersist(); m.sellItemId = ''; m.result = { ok:true, msg: r.event.payload.narrative }; this.showToast && this.showToast('💰 Sold for ' + r.proceedsGp.toLocaleString() + ' gp.', 3000); } else { m.result = { ok:false, msg: 'Cannot sell: ' + this.magicMarketErr(r.error || '?') }; } },
  magicMarketSubmitBuy(){ const m = this.magicMarket; const opts = { buyerCharacterId: m.actorId, settlementId: m.settlementId, gmOverride: !!m.gmOverride }; if(m.buySource === 'catalog') opts.catalogKey = m.buyCatalogKey; else opts.itemId = m.buyItemId; const r = window.ACKS.buyMagicItem(this.currentCampaign, opts); if(r.ok){ this.markDirty && this.markDirty(); this.schedulePersist && this.schedulePersist(); m.buyItemId = ''; m.buyCatalogKey = ''; m.result = { ok:true, msg: r.event.payload.narrative }; this.showToast && this.showToast('🛒 Bought for ' + r.costGp.toLocaleString() + ' gp.', 3000); } else { m.result = { ok:false, msg: 'Cannot buy: ' + this.magicMarketErr(r.error || '?') }; } },
  // === @b11-followers  (team) — Followers Wave B (loyalty/morale + families-arriving): state + methods ===
  // Pure reads over the Wave-B engine — they extend the shipped eligibility-driven Stronghold card.
  // The eligibility "await" card shows what WILL arrive (loyalty/morale + families preview); a NEW
  // post-attraction readout shows what DID (companion loyalty, the troop band's composition + morale,
  // the families that settled). RR pp.334–337.
  followerFamiliesPreviewLabel(domain){
    const c = this.currentCampaign; const e = this.followerEligibility(domain);
    if(!c || !e.ok || !(window.ACKS && window.ACKS.familiesArrivingPreview)) return '';
    const pv = window.ACKS.familiesArrivingPreview(c, domain, e.row);
    return (pv && pv.applicable) ? pv.label : '';
  },
  followerLoyaltyPreviewLabel(domain){
    const e = this.followerEligibility(domain);
    if(!e.ok) return '';
    const divine = !!(e.row && e.row.divine);
    return 'Loyalty ' + (divine ? '+4 (fanatical)' : '+2') + " + the ruler's Charisma modifier; morale " + (divine ? '+4' : '+1') + ' (RR pp.335–337).';
  },
  // The post-attraction readout (null until the ruler has attracted followers).
  domainFollowersSummary(domain){
    const c = this.currentCampaign; if(!c || !domain || !window.ACKS) return null;
    const ruler = window.ACKS.rulerCharacter ? window.ACKS.rulerCharacter(c, domain) : null;
    if(!ruler || !ruler.followersAttracted) return null;
    const companions = (c.characters || []).filter(ch => ch && ch.attractedAsFollower && ch.liegeCharacterId === ruler.id);
    const bands = (c.groups || []).filter(g => g && g.socialTier === 'follower' && g.commanderCharacterId === ruler.id);
    const troopBand = bands.find(g => Array.isArray(g.followerComposition) && g.followerComposition.length) || bands.find(g => !/novice/i.test(g.name || ''));
    const noviceBand = bands.find(g => /novice/i.test(g.name || ''));
    const active = g => (window.ACKS.groupActiveCount ? window.ACKS.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0)));
    const info = companions.length && window.ACKS.followerLoyaltyInfo ? window.ACKS.followerLoyaltyInfo(c, companions[0].id) : null;
    return {
      rulerName: ruler.name || 'The ruler',
      companions: companions.length,
      fanatical: info ? !!info.fanatical : false,
      companionLoyalty: info ? info.effectiveLoyalty : (companions[0] ? (companions[0].loyalty || 0) : null),
      companionMorale: info ? info.morale : null,
      troopBand: troopBand ? { count: active(troopBand), morale: troopBand.followerMorale, loyalty: troopBand.followerLoyalty, summary: troopBand.followerCompositionSummary || [] } : null,
      novices: noviceBand ? active(noviceBand) : 0,
      families: Number(domain.followerFamiliesArrived) || 0
    };
  },
  _signed(n){ return (n != null && n >= 0 ? '+' : '') + n; },
  // ════ TEAM SESSION (burst12 2026-06-21) — per-agent domainApp state + methods. Append your Alpine state
  //      + methods ONLY after your own @b12-<lane> marker below. Self-register engine prefixes / collections /
  //      events from your OWN module (the kernel shipped PR #89 — no central-registry edits). The Lead
  //      reconciles this block at integration (CLAUDE §15.4). ════
  // === @b12-census     (team) — SD-6/SD-7 census + MI-3 per-Class availability: state + methods ===
  // SD-6 magic-item census (over acks-engine-demographics.js + acks-engine-magic-item-availability.js,
  // TT p.27, ⚠ IP §13.6/§13.9 catalog posture). Two read surfaces: the Demographics roster census +
  // the 🪄 magic-market availability readout. Always-on RAW tooling (the TT availability math; OQ-8).
  _availCellText(perMarket, chancePct){ if(perMarket && perMarket > 0) return String(perMarket); if(chancePct && chancePct > 0) return chancePct + '%'; return '—'; },
  magicCensus(){ const s = this.demoSettlement && this.demoSettlement(); return s ? window.ACKS.settlementMagicItemCensus(this.currentCampaign, s) : null; },
  magicCensusTypeRows(){ const c = this.magicCensus(); if(!c) return []; const L = window.ACKS.MAGIC_ITEM_TYPE_LABEL || {};
    return (window.ACKS.MAGIC_ITEM_TYPE_ORDER || []).map(t => Object.assign({ type:t, label:(L[t] || t) }, c.byType[t] || {})); },
  magicCensusRarityRows(){ const c = this.magicCensus(); if(!c) return []; const L = window.ACKS.MAGIC_RARITY_TIER_LABEL || {};
    return (window.ACKS.MAGIC_RARITY_TIER_ORDER || []).map(r => Object.assign({ rarity:r, label:(L[r] || r) }, c.byRarity[r] || {})); },
  // the 🪄 magic-market modal's availability table (the chosen settlement's market class)
  magicMarketAvailShow: false,
  magicMarketAvail(){ const id = this.magicMarket && this.magicMarket.settlementId; if(!id) return null;
    const s = (this.currentCampaign && this.currentCampaign.settlements || []).find(x => x && x.id === id);
    return s ? window.ACKS.expectedSettlementMagicItems(this.currentCampaign, s) : null; },
  magicMarketAvailRows(){ const a = this.magicMarketAvail(); if(!a) return []; const L = window.ACKS.MAGIC_ITEM_TYPE_LABEL || {};
    return (window.ACKS.MAGIC_ITEM_TYPE_ORDER || []).map(t => Object.assign({ type:t, label:(L[t] || t) }, a.byType[t] || {})); },
  // the by-NPC-level magic-item value (the per-individual facet) — a component wrapper so the Demographics
  // census markup resolves it in Alpine scope (the engine fn lives on window.ACKS, not the component).
  expectedNpcMagicItemValue(level){ return (typeof window.ACKS.expectedNpcMagicItemValue === 'function') ? window.ACKS.expectedNpcMagicItemValue(level) : 0; },
  // SD-7a wealth census (over acks-engine-demographics.js; the fitted per-level wealth curve, Econometrics §7).
  // Expected leveled-NPC wealth vs what homed residents actually carry (purse + owned caches). Always-on RAW tooling.
  wealthCensus(){ const s = this.demoSettlement && this.demoSettlement(); return s ? window.ACKS.settlementWealthCensus(this.currentCampaign, s) : null; },
  wealthCensusRows(){ const c = this.wealthCensus(); return c ? c.byLevel : []; },
  expectedNpcWealth(level){ return (typeof window.ACKS.expectedNpcWealth === 'function') ? window.ACKS.expectedNpcWealth(level) : 0; },
  // === @b12-delves     (team) — Delves D5 incident→Encounter escalation + seeded daily check: state + methods ===
  // ── Escalate a combat-risk urban incident into a full Encounter (the shipped #476 E-layer), then
  //    deep-link to the resolution panel. svtIncidents() is a simple reverse of v.incidents, so the
  //    display index i maps to the real index (len-1)-i (no Alpine-proxy indexOf needed). ──
  svtEscalate(i){
    const c = this.currentCampaign; const v = this.svtSelected(); if(!v || !Array.isArray(v.incidents)) return;
    const realIndex = (v.incidents.length - 1) - i;   // svtIncidents() reverses v.incidents
    const res = window.ACKS.escalateSettlementIncident(c, v.id, { incidentIndex: realIndex });
    this.markDirty(); this.schedulePersist();
    if(res && res.encounter){ this.showToast('⚔ Escalated to an encounter — ' + (res.encounter.name || 'a fight') + ' · resolve it in Review ▸ ⚔ Encounters', 6000); }
    else { this.showToast('Could not escalate this incident.', 3000); }
  },
  svtGoToEncounter(encId){
    if(!encId) return;
    this.svtUI.open = false;                                          // close the Settlement-Visit modal
    this.currentView = 'review'; this.reviewSubView = 'encounters';   // land on the ⚔ Encounters work queue
    if(typeof this.openEncounterModal === 'function') this.openEncounterModal(encId);   // open the resolution panel
  },
  // === @b12-lifecycle  (team) — Lifecycle CL-4b dynasty: state + methods ===
  // The optional AXIOMS-19 dynasty layer over acks-engine-lifecycle.js (foundDynasty / recordKinship /
  // birthChild / setSuccessionLaw / resolveDynastySuccession + the reads). One modal (dynModal); the card
  // lives in the char-sheet lifecycle cluster; both gated on the dynasty-tracking house rule.
  dynModal: { open:false, charId:'',
    foundName:'', foundCoatOfArms:'', foundRealmType:'human-standard', foundLaw:'gavelkind', foundTitle:'',
    changeLaw:'', changeImmediate:false, marriageSpouseId:'', marriageMatrilineal:false,
    birthMotherId:'', birthFatherId:'', birthName:'', successionDeceasedId:'', successionNominee:'', lastResult:'' },
  dynastyTrackingOn(){ const A=window.ACKS; return !!(A && A.isHouseRuleEnabled && A.isHouseRuleEnabled(this.currentCampaign, 'dynasty-tracking')); },
  dynInfo(ch){ const A=window.ACKS; return (ch && A && A.characterDynastyInfo) ? A.characterDynastyInfo(this.currentCampaign, ch) : { inDynasty:false }; },
  dynModalChar(){ return (this.currentCampaign?.characters||[]).find(x => x && x.id === this.dynModal.charId) || null; },
  dynModalDynasty(){ const ch=this.dynModalChar(); const A=window.ACKS; return (ch && ch.dynastyId && A && A.dynastyById) ? A.dynastyById(this.currentCampaign, ch.dynastyId) : null; },
  dynSuccessionLaws(){ return (window.ACKS && window.ACKS.successionLawsList) ? window.ACKS.successionLawsList() : []; },
  successionLawLabelFor(id){ const l=(window.ACKS && window.ACKS.successionLawById) ? window.ACKS.successionLawById(id) : null; return l ? l.label : (id || '—'); },
  dynLawIsElective(){ const d=this.dynModalDynasty(); if(!d) return false; const l=window.ACKS.successionLawById(d.successionLaw); return !!(l && l.type==='elective'); },
  dynVassalBonus(){ const d=this.dynModalDynasty(); const A=window.ACKS; return (d && A && A.dynastyVassalLoyaltyBonus) ? A.dynastyVassalLoyaltyBonus(this.currentCampaign, d.id) : 0; },
  dynRealmTypes(){ return Object.keys((window.ACKS && window.ACKS.DYNASTY_STARTING_LAW_BY_REALM) || {}); },
  dynFamilyTree(){ const d=this.dynModalDynasty(); const A=window.ACKS; return (d && A && A.dynastyFamilyTree) ? A.dynastyFamilyTree(this.currentCampaign, d.id) : []; },
  dynMemberOptions(){ const d=this.dynModalDynasty(); const A=window.ACKS; if(!d) return []; return (A.dynastyMembers(this.currentCampaign, d.id)||[]).map(c=>({ id:c.id, name:c.name, deceased:(c.lifecycleState==='deceased'||c.alive===false) })); },
  dynCharOptions(){ return (this.currentCampaign?.characters||[]).filter(x => x && x.alive !== false && x.lifecycleState !== 'deceased').map(x=>({ id:x.id, name:x.name })); },
  dynCharName(id){ const c=(this.currentCampaign?.characters||[]).find(x=>x&&x.id===id); return c?c.name:'—'; },
  _dynTouch(msg){ if(this.markDirty) this.markDirty(); if(this.schedulePersist) this.schedulePersist(); if(msg && this.showToast) this.showToast(msg, 3000); },
  dynOpen(ch){
    this.dynModal = Object.assign({}, this.dynModal, { open:true, charId:ch.id,
      foundName:(ch.name ? ch.name.split(/\s+/).slice(-1)[0] : ''), foundCoatOfArms:'', foundRealmType:'human-standard', foundLaw:'gavelkind', foundTitle:(ch.title||''),
      changeLaw:'', changeImmediate:false, marriageSpouseId:'', marriageMatrilineal:false,
      birthMotherId:'', birthFatherId:'', birthName:'', successionDeceasedId:'', successionNominee:'', lastResult:'' });
  },
  dynFound(){ const m=this.dynModal; const A=window.ACKS; if(!A||!A.foundDynasty) return;
    const res = A.foundDynasty(this.currentCampaign, m.charId, { name:m.foundName, coatOfArms:m.foundCoatOfArms, realmType:m.foundRealmType, successionLaw:m.foundLaw||undefined, title:m.foundTitle||undefined });
    if(res && res.error){ this._dynTouch('Cannot found: ' + res.error); return; }
    this._dynTouch('Founded the dynasty of ' + (res.name || '(unnamed)') + '.'); },
  dynChangeLaw(){ const m=this.dynModal; const d=this.dynModalDynasty(); if(!d||!m.changeLaw) return; const A=window.ACKS;
    const res = A.setSuccessionLaw(this.currentCampaign, d.id, m.changeLaw, { immediate:m.changeImmediate });
    if(res && res.error){ this._dynTouch('Cannot change: ' + res.error); return; }
    this._dynTouch(res.applied ? ('Succession law changed to ' + m.changeLaw + '.') : ('Law change to ' + m.changeLaw + ' begins — ' + res.months + ' month' + (res.months===1?'':'s') + '.')); m.changeLaw=''; },
  dynRecordMarriage(){ const m=this.dynModal; if(!m.marriageSpouseId) return; const A=window.ACKS;
    A.recordKinship(this.currentCampaign, { kinType:'marriage', aCharacterId:m.charId, bCharacterId:m.marriageSpouseId, matrilineal:m.marriageMatrilineal });
    this._dynTouch('Marriage recorded.'); m.marriageSpouseId=''; },
  dynBirth(){ const m=this.dynModal; if(!m.birthMotherId||!m.birthFatherId) return; const A=window.ACKS;
    const res = A.birthChild(this.currentCampaign, { motherCharacterId:m.birthMotherId, fatherCharacterId:m.birthFatherId, name:m.birthName||undefined });
    if(res && res.error){ this._dynTouch('No birth: ' + res.error + (res.cap!=null ? (' (cap ' + res.cap + ')') : '')); return; }
    this._dynTouch((res.name || 'A child') + ' is born' + (res.bastard ? ' (a bastard)' : '') + '.'); m.birthName=''; },
  dynResolveSuccession(){ const m=this.dynModal; const d=this.dynModalDynasty(); if(!d) return; const A=window.ACKS;
    const res = A.resolveDynastySuccession(this.currentCampaign, d.id, { deceasedId:m.successionDeceasedId||undefined, nominee:m.successionNominee||undefined });
    if(res && res.error){ this._dynTouch('Cannot resolve: ' + res.error); return; }
    m.lastResult = res.dynastyExtinct ? 'The dynasty ends — no living heir (the game ends).'
      : ('Heir: ' + this.dynCharName(res.heirId) + (res.vassalLoyaltyBonus ? (' · vassals +' + res.vassalLoyaltyBonus + ' loyalty') : '') + (res.divides ? ' · the demesne divides' : '') + (res.awardedTrait ? (' · earned a ' + res.awardedTrait + ' bloodline trait') : ''));
    this._dynTouch(res.dynastyExtinct ? 'The dynasty is extinct.' : ('Succession resolved → ' + this.dynCharName(res.heirId) + '.')); },
  // === @b12-treasure   (team) — Treasure Wave-C confinements: state + methods ===
  // The 🔒 Prisoners panel — thin UI over the confinement engine (ransom/release/escape verbs +
  // the auto-monthly escape check). Captives auto-lift into confinements on materializeHoard.
  confinePanel: { open:false },
  confinementRows(){ return (this.currentCampaign && Array.isArray(this.currentCampaign.confinements)) ? this.currentCampaign.confinements : []; },
  heldConfinements(){ return this.confinementRows().filter(c => c && c.status === 'held'); },
  resolvedConfinements(){ return this.confinementRows().filter(c => c && c.status !== 'held')
      .slice().sort((a,b) => (b.resolvedAtTurn||0) - (a.resolvedAtTurn||0)); },
  openConfinements(){ this.confinePanel.open = true; },
  confineCaptiveName(conf){
    const c = this.currentCampaign && (this.currentCampaign.characters||[]).find(x => x && x.id === conf.captiveCharacterId);
    return (c && c.name) || conf.captiveCharacterId || 'the captive';
  },
  confineCaptorLabel(conf){
    const cap = conf && conf.captor;
    if(!cap) return 'unknown';
    if(cap.kind === 'character'){ const c = (this.currentCampaign.characters||[]).find(x => x && x.id === cap.id); return (c && c.name) || cap.label || 'a captor'; }
    if(cap.kind === 'domain'){ const d = (this.domains||[]).find(x => x && x.id === cap.id); return (d && d.name) || cap.label || 'a domain'; }
    if(cap.kind === 'lair') return cap.label || 'a lair';
    return cap.label || cap.kind || 'unknown';
  },
  ransomCaptive(conf){
    const r = window.ACKS.ransomConfinement(this.currentCampaign, conf.id, {});
    if(!r || !r.ok){ this.showToast('Could not ransom: ' + ((r && r.reason) || 'error')); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('💰 ' + this.confineCaptiveName(conf) + ' ransomed for ' + (r.amountGp||0).toLocaleString() + ' gp.');
  },
  releaseCaptive(conf){
    const r = window.ACKS.releaseConfinement(this.currentCampaign, conf.id, {});
    if(!r || !r.ok){ this.showToast('Could not release: ' + ((r && r.reason) || 'error')); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('🕊 ' + this.confineCaptiveName(conf) + ' released.');
  },
  escapeCaptive(conf){
    const r = window.ACKS.captiveEscapes(this.currentCampaign, conf.id, {});
    if(!r || !r.ok){ this.showToast('Could not mark escaped: ' + ((r && r.reason) || 'error')); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('🏃 ' + this.confineCaptiveName(conf) + ' escaped.');
  },
  // === @b10-politics   (team) — Politics P-7 Eldermoot + rule-of-the-few oligarchy mode: state + methods ===
  // The ⚖ Governance card on the 🏛 Senate tab + the oligarchy modal. Thin UI over the P-7 engine
  // (establishOligarchy / dissolveOligarchy / secedeFromOligarchy / resolveOligarchyDecision +
  // oligarchyDerivedStats). ALL gated on rule-of-the-few — hidden + non-functional when OFF (principle 8).
  oligModal: { open:false, apexId:null, draftMembers:[], draftRule:'majority', addPick:'', policy:'', votes:{}, lastDecision:null, lastSecede:null },
  ruleOfFewOn(){ return !!(this.currentCampaign && window.ACKS.isHouseRuleEnabled(this.currentCampaign, 'rule-of-the-few')); },
  // Eldermoot scaffolding: the senate-kind display label ('Senate' | 'Eldermoot' | 'Council'). An
  // eldermoot IS a senate (shared entities + voting); the Dwarven plan supplies dwarven flavor.
  senateKindLabel(s){ return (window.ACKS.senateKindLabel ? window.ACKS.senateKindLabel(s) : (((s && s.kind) || 'senate'))); },
  // the realm apexes (no liege) — the realms governance lives on
  governanceApexRows(){
    const c = this.currentCampaign; if(!c || !Array.isArray(c.domains)) return [];
    return c.domains.filter(d => d && !d.liegeId).map(d => ({
      id: d.id, name: d.name || d.id, mode: (window.ACKS.governanceFor(c, d) || {}).mode || 'feudal' }));
  },
  governanceTabAvailable(){ return this.ruleOfFewOn() && this.governanceApexRows().length > 0; },
  // a derived oligarchy stat block for an apex id (null when it isn't oligarchic)
  oligSummaryFor(apexId){
    const c = this.currentCampaign; const d = (c.domains || []).find(x => x && x.id === apexId); if(!d) return null;
    if((window.ACKS.governanceFor(c, d) || {}).mode !== 'oligarchic') return null;
    return window.ACKS.oligarchyDerivedStats(c, d);
  },
  charName(id){ const ch = ((this.currentCampaign || {}).characters || []).find(c => c && c.id === id); return (ch && ch.name) || id; },
  // — the modal —
  openOligModal(apexId){
    const rows = this.governanceApexRows();
    this.oligModal.apexId = apexId || (rows[0] && rows[0].id) || null;
    this._syncOligDraft();
    this.oligModal.addPick = ''; this.oligModal.policy = ''; this.oligModal.votes = {};
    this.oligModal.lastDecision = null; this.oligModal.lastSecede = null;
    this.oligModal.open = true;
  },
  closeOligModal(){ this.oligModal.open = false; },
  _oligApex(){ return ((this.currentCampaign || {}).domains || []).find(d => d && d.id === this.oligModal.apexId) || null; },
  _oligGov(){ const d = this._oligApex(); return d ? (window.ACKS.governanceFor(this.currentCampaign, d) || {}) : {}; },
  oligApexName(){ const d = this._oligApex(); return (d && (d.name || d.id)) || '(realm)'; },
  oligMode(){ return this._oligGov().mode || 'feudal'; },
  oligIsOligarchic(){ return this.oligMode() === 'oligarchic'; },
  oligMembers(){ return (this._oligGov().oligarchCharacterIds || []).map(id => ({ id, name: this.charName(id) })); },
  oligStats(){ const d = this._oligApex(); return d ? window.ACKS.oligarchyDerivedStats(this.currentCampaign, d) : null; },
  oligDecisionRule(){ return this._oligGov().oligarchyDecisionRule || 'majority'; },
  _syncOligDraft(){ const g = this._oligGov(); this.oligModal.draftMembers = (g.oligarchCharacterIds || []).slice(); this.oligModal.draftRule = g.oligarchyDecisionRule || 'majority'; },
  oligCandidateChars(){ const have = new Set(this.oligModal.draftMembers); return ((this.currentCampaign || {}).characters || []).filter(c => c && !have.has(c.id)); },
  oligAddDraftMember(){ const id = this.oligModal.addPick; if(id && this.oligModal.draftMembers.indexOf(id) < 0) this.oligModal.draftMembers.push(id); this.oligModal.addPick = ''; },
  oligRemoveDraftMember(id){ const i = this.oligModal.draftMembers.indexOf(id); if(i >= 0) this.oligModal.draftMembers.splice(i, 1); },
  oligEstablish(){
    const A = window.ACKS, c = this.currentCampaign;
    const r = A.establishOligarchy(c, { domainId: this.oligModal.apexId, oligarchCharacterIds: this.oligModal.draftMembers.slice(), decisionRule: this.oligModal.draftRule, rulerCharacterId: (this._oligApex() || {}).rulerCharacterId });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok){ this._syncOligDraft(); this.showToast('⚖ Oligarchy established — ' + r.memberCount + ' oligarchs rule ' + this.oligApexName() + '.', 5000); }
    else this.showToast('Could not establish the oligarchy: ' + ((r && r.reason) || 'error'), 5000);
  },
  oligDissolve(){
    const A = window.ACKS, c = this.currentCampaign;
    const r = A.dissolveOligarchy(c, { domainId: this.oligModal.apexId, into: 'feudal', rulerCharacterId: (this.oligMembers()[0] || {}).id });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok){ this._syncOligDraft(); this.oligModal.lastDecision = null; this.oligModal.lastSecede = null; this.showToast('⚖ The oligarchy is dissolved — ' + this.oligApexName() + ' becomes ' + r.into + '.', 5000); }
    else this.showToast('Could not dissolve: ' + ((r && r.reason) || 'error'), 5000);
  },
  oligSecede(id){
    const A = window.ACKS, c = this.currentCampaign;
    const r = A.secedeFromOligarchy(c, { domainId: this.oligModal.apexId, oligarchCharacterId: id });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok){ this._syncOligDraft();
      this.oligModal.lastSecede = { name: this.charName(id), collapsed: r.collapsed, into: r.into || null, henchmen: (r.henchmanVassals || []).map(h => this.charName(h)) };
      this.showToast('⚖ ' + this.charName(id) + ' secedes' + (r.collapsed ? ' — the oligarchy collapses to ' + r.into + '.' : '.'), 5000); }
    else this.showToast('Could not secede: ' + ((r && r.reason) || 'error'), 5000);
  },
  oligSetVote(id, v){ this.oligModal.votes[id] = v; },
  oligDecide(){
    const A = window.ACKS, c = this.currentCampaign;
    const votes = this.oligMembers().map(m => ({ characterId: m.id, vote: this.oligModal.votes[m.id] || 'abstain' }));
    const r = A.resolveOligarchyDecision(c, { domainId: this.oligModal.apexId, policy: this.oligModal.policy, votes, decisionRule: this.oligDecisionRule() });
    this.markDirty(); this.schedulePersist();
    if(r && r.ok){ this.oligModal.lastDecision = r; this.showToast('⚖ Decision: ' + r.outcome + ' (' + r.forVotes + ' for / ' + r.againstVotes + ' against).', 5000); }
    else this.showToast('Could not resolve the decision: ' + ((r && r.reason) || 'error'), 5000);
  },
  // === @b10-sages      (team) — Sages SG-5 treatise + SG-4 Lore-emit: state + methods ===
  // SG-5: the 📖 Treatise re-roll book (RR p.146) — folds into the Consult-a-Sage modal. The reader
  // is the consult's sage (sageConsult.sageId). SG-4: knowledgeEmitAvailable() gates the "📚 Record
  // to Knowledge" tick. Thin Alpine layer over acks-engine-sages.js (markTreatise / readTreatise /
  // referenceTreatise / treatiseReferenceForecast) — engine call → markDirty / schedulePersist / toast.
  sageTreatise: { itemId: '', refResult: null },
  sageTreatiseNew: { itemId: '', proficiency: 'knowledge', ranks: 1 },
  knowledgeEmitAvailable(){ return typeof (window.ACKS && window.ACKS.recordLore) === 'function' && typeof window.ACKS.learnLore === 'function'; },
  // Notable Items not yet marked as treatises (the authoring picker source).
  sageTreatiseCandidates(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c || !Array.isArray(c.notableItems)) return [];
    return c.notableItems.filter(it => it && !A.isTreatise(it)).map(it => ({ id: it.id, label: it.name || ('(' + (it.kind || 'item') + ' ' + it.id + ')') }));
  },
  // Mark a Notable Item as a treatise (the GM authoring step — RR p.146 tiers 1–4).
  sageTreatiseMarkUi(){
    const A = window.ACKS, n = this.sageTreatiseNew;
    if(!n.itemId || !String(n.proficiency || '').trim()){ if(this.showToast) this.showToast('Pick a Notable Item and a proficiency.'); return; }
    const res = A.markTreatise(this.currentCampaign, n.itemId, { proficiency: n.proficiency, ranks: Number(n.ranks) || 1 });
    if(res && res.ok){ this.sageTreatise.itemId = res.item.id; this.sageTreatise.refResult = null; this.sageTreatiseNew = { itemId: '', proficiency: 'knowledge', ranks: 1 }; this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast('Marked as a ' + (res.info ? res.info.tier : '') + ' treatise on ' + (res.info ? res.info.profLabel : '') + '.'); }
    else if(res && this.showToast){ this.showToast('Cannot mark: ' + (res && res.error)); }
  },
  sageTreatiseRows(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c || typeof A.treatisesInCampaign !== 'function') return [];
    return A.treatisesInCampaign(c).map(it => { const i = A.treatiseInfo(it); return { id: it.id, label: (it.name || 'Treatise') + (i ? (' · ' + i.tier + ' ' + i.profLabel) : '') }; });
  },
  sageTreatiseReaderChar(){ const id = this.sageConsult && this.sageConsult.sageId; return id ? ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id) : null; },
  sageTreatiseReaderName(){ const c = this.sageTreatiseReaderChar(); return (c && c.name) || 'The scholar'; },
  sageTreatiseSelected(){
    const A = window.ACKS, id = this.sageTreatise.itemId;
    if(!A || !id) return null;
    return (typeof A.findNotableItem === 'function' ? A.findNotableItem(this.currentCampaign, id) : null)
      || (((this.currentCampaign && this.currentCampaign.notableItems) || []).find(n => n && n.id === id)) || null;
  },
  sageTreatiseInfoUI(){ const it = this.sageTreatiseSelected(); return it ? window.ACKS.treatiseInfo(it) : null; },
  sageTreatiseComprehensionUI(){ const it = this.sageTreatiseSelected(), r = this.sageTreatiseReaderChar(); if(!it || !r) return { ok: false }; return window.ACKS.treatiseComprehension(this.currentCampaign, r, it); },
  sageTreatiseHasReadUI(){ const it = this.sageTreatiseSelected(), r = this.sageTreatiseReaderChar(); return !!(it && r && window.ACKS.hasReadTreatise(it, r.id)); },
  sageTreatiseForecastUI(){ const it = this.sageTreatiseSelected(), r = this.sageTreatiseReaderChar(); if(!it || !r) return null; return window.ACKS.treatiseReferenceForecast(this.currentCampaign, r, it); },
  sageTreatiseReadUi(){
    const it = this.sageTreatiseSelected(), r = this.sageTreatiseReaderChar(); if(!it || !r) return;
    const res = window.ACKS.readTreatise(this.currentCampaign, { readerId: r.id, itemId: it.id });
    if(res && res.ok){ this.sageTreatise.refResult = null; this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast(res.alreadyRead ? (r.name + ' has already read this treatise.') : (r.name + ' reads the treatise (6 days).')); }
    else if(res && this.showToast){ this.showToast(res.error === 'too-advanced' ? 'Too advanced — a treatise must be ≤ one rank above the reader.' : ('Cannot read: ' + (res && res.error))); }
  },
  sageTreatiseReferenceUi(){
    const it = this.sageTreatiseSelected(), r = this.sageTreatiseReaderChar(); if(!it || !r) return;
    const res = window.ACKS.referenceTreatise(this.currentCampaign, { readerId: r.id, itemId: it.id, query: this.sageConsult.query || this.sageConsult.subject || '', secret: this.sageConsult.secret });
    this.sageTreatise.refResult = res;
    if(res && res.ok){ this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast(res.success ? 'The treatise yields an answer.' : 'The treatise does not help.'); }
    else if(res && this.showToast){ this.showToast('Cannot reference: ' + (res && res.error)); }
  },
  // === @b10-hijinks    (team) — Hijinks HJ-3 syndicate depth (lieutenants/crews/takeover): state + methods ===
  hj3CrewIds: [],                                            // selected crew charIds in the launch form (gated crew-hijinks)
  takeoverModal: { open: false, synId: null, newBossCharacterId: '', reason: '' },
  // crews (gated crew-hijinks) — when OFF, the picker is hidden + the engine ignores any crew.
  crewHijinksOn() { const A = window.ACKS; return !!(A && A.crewHijinksEnabled && A.crewHijinksEnabled(this.currentCampaign)); },
  hijinkCrewCandidates() {
    const A = window.ACKS, c = this.currentCampaign; if (!A || !c) return [];
    const perpId = this.hijinkLaunch && this.hijinkLaunch.perpetratorCharacterId;
    const type = this.hijinkLaunch && this.hijinkLaunch.type;
    return (c.characters || []).filter(ch => ch && ch.id !== perpId
      && (A.isActive ? A.isActive(ch) : (ch.alive !== false))
      && A.hijinkPerpetratorEligible && A.hijinkPerpetratorEligible(ch, type));
  },
  hj3ToggleCrew(id) { const i = this.hj3CrewIds.indexOf(id); if (i >= 0) this.hj3CrewIds.splice(i, 1); else this.hj3CrewIds.push(id); },
  // change-in-management takeover
  openTakeover(synId) { this.takeoverModal = { open: true, synId, newBossCharacterId: '', reason: '' }; },
  takeoverSynName() { const c = this.currentCampaign; const syn = (c && c.syndicates || []).find(s => s && s.id === this.takeoverModal.synId); return (syn && syn.name) || 'the syndicate'; },
  takeoverCandidateRows() {
    const A = window.ACKS, c = this.currentCampaign;
    const syn = (c && c.syndicates || []).find(s => s && s.id === this.takeoverModal.synId);
    if (!A || !syn) return [];
    const ltSet = new Set(syn.lieutenantCharacterIds || []);
    return (A.syndicateTakeoverCandidates ? A.syndicateTakeoverCandidates(c, syn) : []).map(x => ({ id: x.id, name: x.name, class: x.class, level: x.level, isLieutenant: ltSet.has(x.id) }));
  },
  submitTakeover() {
    const A = window.ACKS, m = this.takeoverModal;
    const res = A.takeoverSyndicate(this.currentCampaign, m.synId, { newBossCharacterId: m.newBossCharacterId, reason: (m.reason || '').trim() || undefined });
    if (!res || !res.ok) { this.showToast('Takeover failed: ' + ((res && (res.detail || res.error)) || 'unknown'), 4000); return; }
    this.takeoverModal.open = false;
    this.showToast('⚔ Control of the syndicate has changed hands.', 4000);
    this.markDirty(); this.schedulePersist();
  },
  // === @b10-treasure   (team) — Treasure T3/T4/T5 special-treasures + magic-fill + modes: state + methods ===
  // treasureSetMode — write the campaign's treasure MODE (a campaign setting, NOT a house
  // rule; TT p.19). Classic = RAW; Heroic/Gritty push coin value into heavier denominations
  // + roll magic by rarity (engine: generateHoard reads the mode). Clears the stale rolled
  // hoard so the next roll uses the new mode. The wizard's treasureRoll already passes
  // ACKS.treasureModeFor(campaign) into generateHoard/planHoard.
  treasureSetMode(m){
    if(!this.currentCampaign) return;
    const A = window.ACKS;
    const modes = (A && A.TREASURE_MODES) || ['classic','heroic','gritty'];
    this.currentCampaign.treasureMode = (modes.indexOf(m) >= 0) ? m : 'classic';
    this.treasureWizard.hoard = null;       // mode changes the roll → drop the stale result
    this.markDirty && this.markDirty();
    this.schedulePersist && this.schedulePersist();
  },
  // === @b10-religion   (team) — Religion R3 consecration + R5 transgression: state + methods ===
  // Thin Alpine layer over the acks-engine-religion.js R3/R5 verbs (consecrateAltar / consecrateRuler /
  // applyDivineTransgression / atone). Surfaced as a second action row + a result line per divine caster
  // in the ⛪ Religion view's 📿 Divine-power panel. Each action mutates currentCampaign through the engine
  // (which emits the typed events) then markDirty + schedulePersist + a toast. (consecrate-fields shipped R1.)
  religionAltarSettlement: {},     // per-caster consecrate-altar target settlement (keyed by charId)
  religionAltarValue: {},          // per-caster altar value gp
  religionRulerDomain: {},         // per-caster consecrate-ruler target domain
  religionTransgressionResult: {}, // per-caster last divine-transgression result (drives the result line)
  religionSettlementOptions(){ return ((this.currentCampaign && this.currentCampaign.settlements) || []).map(s => ({ id: s.id, name: s.name || s.id })); },
  religionConsecrateAltar(charId){
    const sid = this.religionAltarSettlement[charId]; const val = Number(this.religionAltarValue[charId]) || 0;
    if(!sid || val <= 0) return;
    const r = window.ACKS.consecrateAltar(this.currentCampaign, { casterId: charId, settlementId: sid, altarValueGp: val });
    if(!r || !r.ok){ this.showToast('Cannot consecrate altar: ' + (r && r.reason === 'insufficient-divine-power' ? ('needs ' + (r.cost || 0).toLocaleString() + ' gp DP') : (r && r.reason) || 'failed')); return; }
    this.religionAltarValue[charId] = '';
    this.markDirty(); this.schedulePersist();
    this.showToast('Consecrated ' + (r.placeOfPower && r.placeOfPower.kind === 'sinkhole' ? 'a sinkhole of evil' : 'a pinnacle of good') + ' — ' + (r.cost || 0).toLocaleString() + ' gp DP');
  },
  religionConsecrateRuler(charId){
    const domId = this.religionRulerDomain[charId]; if(!domId) return;
    const r = window.ACKS.consecrateRuler(this.currentCampaign, { casterId: charId, domainId: domId });
    if(!r || !r.ok){
      const why = r && r.reason === 'insufficient-divine-power' ? ('needs ' + (r.cost || 0).toLocaleString() + ' gp DP')
        : r && r.reason === 'caster-below-9th' ? 'caster must be 9th level or higher'
        : r && r.reason === 'not-divine-caster' ? 'not a divine caster'
        : r && r.reason === 'already-consecrated-this-year' ? ('already consecrated this year (next turn ' + (r.nextTurn || '?') + ')')
        : (r && r.reason) || 'failed';
      this.showToast('Cannot consecrate ruler: ' + why); return;
    }
    this.markDirty(); this.schedulePersist();
    const t = r.throwResult || {};
    this.showToast('Consecrated the ruler — ' + (r.cost || 0).toLocaleString() + ' gp DP, ' + (t.success ? 'blessed (12 mo: +1 morale, +1 vassal loyalty)' : t.natural1 ? 'AWRY (12 mo: −1 morale, −1 loyalty)' : 'throw failed (no buff)'));
  },
  religionRollTransgression(charId){
    const r = window.ACKS.applyDivineTransgression(this.currentCampaign, charId, {});
    if(!r || !r.ok){ this.showToast('Cannot roll transgression: ' + ((r && r.reason) || 'failed')); return; }
    const row = r.row || {};
    this.religionTransgressionResult[charId] = { text: row.label + ' (d% ' + (r.roll && r.roll.total) + '): ' + (row.gloss || ''), died: !!r.died, standingChanged: r.standingChanged };
    this.markDirty(); this.schedulePersist();
    this.showToast('⚖ ' + row.label + ' (d% ' + (r.roll && r.roll.total) + ')' + (r.died ? ' — slain!' : r.standingChanged ? ' — disfavored (lapsed)' : ''));
  },
  religionAtone(charId){
    const r = window.ACKS.atone(this.currentCampaign, charId, {});
    if(!r || !r.ok){ this.showToast('Cannot atone: ' + ((r && r.reason) || 'failed')); return; }
    this.religionTransgressionResult[charId] = null;
    this.markDirty(); this.schedulePersist();
    this.showToast('🕊 Atoned — restored to good standing');
  },

  // ── #476 M1 — Lair Wizard (Inspector Create > Lair; §12.5) ──────────────────
  // The manual, catalog-free authoring front-end. Two modes: 'author' (one detailed lair → place on
  // a hex, or hold in the dynamic pool) and 'seed' (roll the RAW Lairs-per-Hex count, JJ p.69, for an
  // unsettled hex → empty status:'unknown' shells). The bare Inspector schemaForm edit sits under it
  // (Browse → Inspect → Edit) as the no-frills admin path. Population/treasure generation is M2/M3.
  openLairWizard(mode){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    this.lairWizardMode = (mode === 'seed') ? 'seed' : 'author';
    this.lairWizardForm = { name:'', monsterCatalogKey:'', lairType:'lair', terrain:'', inhabitants:0, hasFortifications:false, knownToPlayers:false, treasureType:'', precisePlacement:'', notes:'', destination:'hex', hexId:'', generate:true };
    this.lairWizardSeed = { hexId:'', count:0 };
    this.lairWizardOpen = true;
  },

  // ── #476 M7 — Lairs view + lair detail panel (Plan §12) ──────────────────
  // The world-facing surfaces over campaign.lairs[]: the World ▸ Lairs master list, the per-hex
  // Lairs card, and the detail modal whose actions route through the M1 lifecycle setters
  // (createLair/clearLair/discoverLair/…) — the lair's own history[] is the audit trail, same as
  // the Lair Wizard. The Inspector stays the no-frills field editor underneath (Open in Inspector).
  allLairs(){ return (this.currentCampaign && this.currentCampaign.lairs) || []; },
  // E9 — the JJ p.69 maximum-lairs cap for a hex (null = no cap defined for its terrain).
  hexLairCap(hexId){
    return (typeof window.ACKS.hexLairCapacity === 'function') ? window.ACKS.hexLairCapacity(this.currentCampaign, hexId) : null;
  },
  hexLairCapText(hexId){
    const c = this.hexLairCap(hexId);
    if(!c) return '';
    if(c.max <= 0 && c.diceMax === 0) return '🌊 Open water — no land lairs (v1).';
    return '🏚 Maximum lairs here: ' + c.max + ' (' + c.territoryClass
      + (c.pct < 1 ? (' · ' + Math.round(c.pct * 100) + '% of the unsettled ' + c.diceStr + ' max ' + c.diceMax) : (' · ' + c.diceStr + ' max'))
      + ' — JJ p.69) · ' + c.count + ' living'
      + (c.full ? ' — FULL: settling monsters move on.' : '.');
  },
  filteredLairs(){
    const q = (this.lairsSearch || '').toLowerCase().trim();
    const sf = this.lairsStatusFilter || 'all';
    return this.allLairs().filter(l => {
      if(!l) return false;
      if(sf !== 'all' && l.status !== sf) return false;
      if(!q) return true;
      const hay = ((l.name||'') + ' ' + this.lairMonsterLabel(l) + ' ' + this.lairHexLabel(l) + ' ' + (l.status||'')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  },
  openLairDetail(id){ this.lairDetailId = id; this.lairDetailPopulateKey = ''; this.lairDetailRevealHexId = ''; },
  closeLairDetail(){ this.lairDetailId = null; },

  // ── Phase 4 — The Arcane Domain · dungeon arcane panel (AD-D/AD-E) ──────────────
  openArcaneModal(id){
    this.arcaneDungeonId = id;
    this.arcaneAttuneCasterId = ''; this.arcaneAttuneMethod = 'built';
    this.arcaneSovCasterId = ''; this.arcaneSovMethod = 'gm-fiat'; this.arcaneSovChieftainId = ''; this.arcaneSovSlainHd = 0;
    this.arcaneHarvestGroupId = ''; this.arcaneHarvestQty = 1; this.arcaneHarvestMethod = 'cull'; this.arcaneHarvestBounty = 0;
    this.arcaneUsurpCasterId = ''; this.arcaneUsurpSettlementId = ''; this.arcaneLastUsurp = '';
    this.arcaneLastAttune = ''; this.arcaneLastSov = ''; this.arcaneLastHarvest = '';
  },
  closeArcaneModal(){ this.arcaneDungeonId = null; },
  arcaneDungeon(){ return this.arcaneDungeonId ? (window.ACKS.findDungeon(this.currentCampaign, this.arcaneDungeonId) || null) : null; },
  arcaneDomainLabel(){ const d = this.arcaneDungeon(); if(!d || !d.domainId) return ''; const dom = (this.domains || []).find(x => x && x.id === d.domainId); return dom ? (dom.name || dom.id) : d.domainId; },
  // Pickers
  arcaneCasterOptions(){
    return ((this.currentCampaign && this.currentCampaign.characters) || []).filter(c => c && window.ACKS.isArcaneCaster(c))
      .map(c => ({ id: c.id, label: (c.name || c.id) + ' · ' + (c.class || 'arcane') + ' L' + (c.level || 1) + (window.ACKS.canOperateDungeon(c) ? '' : ' (⚠ L<9)') }));
  },
  arcaneAllCharacterOptions(){
    return ((this.currentCampaign && this.currentCampaign.characters) || []).map(c => ({ id: c.id, label: (c.name || c.id) + (c.class ? (' · ' + c.class) : '') }));
  },
  arcaneDungeonGroups(){
    const d = this.arcaneDungeon(); if(!d) return [];
    const groups = (this.currentCampaign && this.currentCampaign.groups) || [];
    const lairs = window.ACKS.lairsInDungeon(this.currentCampaign, d);
    const ids = []; lairs.forEach(l => (l.groupIds || []).forEach(gid => { if(!ids.includes(gid)) ids.push(gid); }));
    return ids.map(gid => groups.find(g => g && g.id === gid)).filter(Boolean)
      .map(g => ({ id: g.id, label: ((g.groupTemplate && g.groupTemplate.monsterCatalogKey) || g.name || 'group') + ' ×' + window.ACKS.groupActiveCount(g) }));
  },
  arcaneDungeonLairCount(){ const d = this.arcaneDungeon(); return d ? window.ACKS.lairsInDungeon(this.currentCampaign, d).filter(l => l && (l.status === 'active' || l.status === 'unknown')).length : 0; },
  // Live-derived read wrappers (the engine takes (campaign, dungeon))
  dungeonMonsterXpV(d){ return d ? window.ACKS.dungeonMonsterXp(this.currentCampaign, d) : 0; },
  dungeonSubjugatedXpV(d){ return d ? window.ACKS.dungeonSubjugatedXp(this.currentCampaign, d) : 0; },
  dungeonArcanePerDayV(d){ return d ? window.ACKS.dungeonArcanePowerPerDay(this.currentCampaign, d) : 0; },
  dungeonArcanePerMonthV(d){ return d ? window.ACKS.dungeonArcanePowerPerMonth(this.currentCampaign, d) : 0; },
  dungeonLairCapacityV(d){ return d ? window.ACKS.dungeonLairCapacity(this.currentCampaign, d) : 0; },
  dungeonIsFullV(d){ return d ? window.ACKS.dungeonIsFull(this.currentCampaign, d) : false; },
  arcaneAttunedName(){ const d = this.arcaneDungeon(); if(!d) return ''; const id = window.ACKS.dungeonAttunedCharacterId(this.currentCampaign, d); if(!id) return ''; const c = (this.currentCampaign.characters || []).find(x => x && x.id === id); return c ? (c.name || c.id) : id; },
  arcaneSovereignName(){ const d = this.arcaneDungeon(); if(!d || !d.sovereignCharacterId) return ''; const c = (this.currentCampaign.characters || []).find(x => x && x.id === d.sovereignCharacterId); return c ? (c.name || c.id) : d.sovereignCharacterId; },
  arcaneSovInVicinity(){ const d = this.arcaneDungeon(); if(!d || !d.sovereignCharacterId) return false; const c = (this.currentCampaign.characters || []).find(x => x && x.id === d.sovereignCharacterId); if(!c) return false; return (c.currentHexId == null || d.hexId == null || c.currentHexId === d.hexId); },
  // Actions
  arcaneAttune(){
    const d = this.arcaneDungeon(); if(!d || !this.arcaneAttuneCasterId) return;
    const r = window.ACKS.attuneToDungeon(this.currentCampaign, { dungeonId: d.id, mageCharacterId: this.arcaneAttuneCasterId, method: this.arcaneAttuneMethod });
    this.arcaneLastAttuneOk = !!(r && r.ok);
    if(r && r.ok){ this.arcaneLastAttune = r.alreadyAttuned ? 'Already attuned.' : ('Attuned (' + (r.method || this.arcaneAttuneMethod) + ').'); this.markDirty(); this.schedulePersist(); this.showToast('🔗 Attuned to ' + (d.name || 'the dungeon') + '.'); }
    else { this.arcaneLastAttune = 'Could not attune: ' + ((r && r.reason) || 'unknown') + (r && r.throwResult ? (' (throw ' + r.throwResult.total + ' vs ' + r.throwResult.target + ')') : '') + (r && r.byCharacterId ? (' — held by ' + r.byCharacterId) : ''); }
  },
  arcaneEndAttunement(){
    const d = this.arcaneDungeon(); if(!d) return;
    const att = window.ACKS.dungeonActiveAttunement(this.currentCampaign, d); if(!att) return;
    window.ACKS.endAttunement(this.currentCampaign, att.id, 'relinquished', 'gm-action');
    this.markDirty(); this.schedulePersist(); this.showToast('Attunement ended.');
  },
  arcaneEstablishSovereignty(){
    const d = this.arcaneDungeon(); if(!d || !this.arcaneSovCasterId) return;
    const r = window.ACKS.establishSovereignty(this.currentCampaign, { dungeonId: d.id, casterId: this.arcaneSovCasterId,
      method: this.arcaneSovMethod, chieftainCharacterId: this.arcaneSovChieftainId || null, slainHd: this.arcaneSovSlainHd || 0, displace: true });
    this.arcaneLastSovOk = !!(r && r.ok);
    if(r && r.ok){ this.arcaneLastSov = 'Sovereignty established (' + (r.method || this.arcaneSovMethod) + ', ' + (r.subjugatedGroupIds || []).length + ' group(s); subjugated XP ' + (r.subjugatedXp || 0) + ').'; this.markDirty(); this.schedulePersist(); this.showToast('👑 Sovereignty over ' + (d.name || 'the dungeon') + '.'); }
    else { this.arcaneLastSov = 'Could not establish: ' + ((r && r.reason) || 'unknown') + (r && r.throwResult && r.throwResult.total != null ? (' (roll ' + r.throwResult.total + ' vs ' + (r.throwResult.target || 12) + ')') : ''); }
  },
  arcaneReleaseSovereignty(){
    const d = this.arcaneDungeon(); if(!d) return;
    window.ACKS.loseSovereignty(this.currentCampaign, d.id, { reason: 'gm-action' });
    this.markDirty(); this.schedulePersist(); this.showToast('Sovereignty released.');
  },
  arcaneHarvest(){
    const d = this.arcaneDungeon(); if(!d || !this.arcaneHarvestGroupId) return;
    const casterId = d.sovereignCharacterId || (window.ACKS.dungeonAttunedCharacterId(this.currentCampaign, d)) || this.arcaneSovCasterId || this.arcaneAttuneCasterId;
    if(!casterId){ this.arcaneLastHarvest = 'Pick/establish a caster first (sovereign for a cull, anyone for a bounty).'; this.arcaneLastHarvestOk = false; return; }
    const r = window.ACKS.harvestDungeon(this.currentCampaign, { dungeonId: d.id, casterId, groupId: this.arcaneHarvestGroupId,
      quantity: this.arcaneHarvestQty || 1, method: this.arcaneHarvestMethod, bountyGp: this.arcaneHarvestBounty || 0 });
    this.arcaneLastHarvestOk = !!(r && r.ok);
    if(r && r.ok){ this.arcaneLastHarvest = 'Harvested ' + r.quantity + '× ' + (r.item && r.item.specialComponent && r.item.specialComponent.monsterKey) + ' → ' + r.componentValueGp + 'gp of components' + (r.bountyGp ? (', ' + r.bountyGp + 'gp bounty') : '') + '.'; this.markDirty(); this.schedulePersist(); this.showToast('🦴 Harvested ' + r.componentValueGp + 'gp of components.'); }
    else { this.arcaneLastHarvest = 'Could not harvest: ' + ((r && r.reason) || 'unknown'); }
  },
  // Peasants & dungeons (garrison) — a GM planning lever (direct field, like monsterGarrisonHired)
  arcaneGarrisonInfo(){
    const d = this.arcaneDungeon(); if(!d || !d.domainId) return null;
    const dom = (this.domains || []).find(x => x && x.id === d.domainId); if(!dom) return null;
    const required = window.ACKS.dungeonRequiredGarrisonGpf(this.currentCampaign, dom);
    const pen = window.ACKS.dungeonGarrisonMoralePenalty(this.currentCampaign, dom);
    if(!required && !pen) return null;
    return { required: required, penalty: pen ? pen.value : 0 };
  },
  arcaneDomainPaidGpf(){ const d = this.arcaneDungeon(); if(!d || !d.domainId) return 0; const dom = (this.domains || []).find(x => x && x.id === d.domainId); return dom ? (Number(dom.dungeonGarrisonPaidGpf) || 0) : 0; },
  arcaneSetGarrisonPaid(val){ const d = this.arcaneDungeon(); if(!d || !d.domainId) return; const dom = (this.domains || []).find(x => x && x.id === d.domainId); if(!dom) return; dom.dungeonGarrisonPaidGpf = Math.max(0, Number(val) || 0); this.markDirty(); this.schedulePersist(); },
  arcaneToggleMonsterGarrison(){ const d = this.arcaneDungeon(); if(!d) return; d.monsterGarrisonHired = !d.monsterGarrisonHired; this.markDirty(); this.schedulePersist(); },
  // AD-C — treasure-seeding (RR p.386): a dungeon seeded with treasure ≥ a monster's Treasure-Type
  // average doubles its Lair %, so a seeded dungeon lures wandering monsters more readily.
  arcaneSetTreasureSeeded(val){ const d = this.arcaneDungeon(); if(!d) return; d.treasureSeededGp = Math.max(0, Number(val) || 0); this.markDirty(); this.schedulePersist(); this.showToast('💰 Treasure seeded: ' + (d.treasureSeededGp).toLocaleString() + ' gp.'); },
  // AD-C — Build a dungeon (the construction Admin verb; RR p.386). Mirrors establishSanctum: creates a
  // kind:'dungeon' Construction Project (completed now — the RAW-timed Construction Wizard lands later) and
  // calls onDungeonConstructed, which mints the dun- entity + auto-attunes an arcane L9+ owner.
  openBuildDungeon(){ this.dungeonBuild = { open: true, name: '', ownerCharacterId: '', hexId: '', buildValueGp: 30000, areaSqFt: 60000, areaCount: 24, treasureSeededGp: 0 }; },
  buildDungeonHexOptions(){
    return ((this.currentCampaign && this.currentCampaign.hexes) || []).map(h => ({
      id: h.id, label: (window.ACKS.hexName ? hexLabelFor(h) : h.id) + (h.domainId ? '' : ' · unclaimed') }));
  },
  buildDungeonSubmit(){
    const b = this.dungeonBuild; if(!b || !b.hexId) return;
    const camp = this.currentCampaign;
    const hex = (camp.hexes || []).find(h => h && h.id === b.hexId) || null;
    if(!Array.isArray(camp.projects)) camp.projects = [];
    const proj = window.ACKS.blankProject({
      constructibleKind: 'dungeon', constructibleSubtype: 'dungeon',
      name: b.name || 'Dungeon', siteHexId: b.hexId,
      ownerCharacterId: b.ownerCharacterId || null, ownerDomainId: (hex && hex.domainId) || null,
      totalCost: Math.max(0, Number(b.buildValueGp) || 0), lifecycleState: 'complete',
      completedAtTurn: camp.currentTurn || 1
    });
    proj.areaSqFtPerLevel = [Math.max(0, Number(b.areaSqFt) || 0)];
    proj.areaCount = Math.max(1, Number(b.areaCount) || 1);
    proj.treasureSeededGp = Math.max(0, Number(b.treasureSeededGp) || 0);
    camp.projects.push(proj);
    const r = window.ACKS.onDungeonConstructed(camp, proj, {});
    this.markDirty(); this.schedulePersist();
    b.open = false;
    if(r && r.ok && r.dungeon){
      this.showToast('🏗 Built ' + (r.dungeon.name || 'a dungeon') + (r.attunement ? ' — auto-attuned the owner.' : '.'));
      this.openArcaneModal(r.dungeon.id);
    } else { this.showToast('Could not build the dungeon: ' + ((r && r.reason) || 'unknown') + '.'); }
  },
  // AD-F — Arcane usurpation (the arcane↔divine seam stub; RR p.388, D2). Settlement-scoped, surfaced in
  // the arcane hub. flagArcaneUsurpation stamps the settlement + emits the rumor-grade arcane-usurpation
  // event Religion (Wave E) consumes; clearArcaneUsurpation releases it. No divine consequence here.
  arcaneUsurpSettlementOptions(){
    return ((this.currentCampaign && this.currentCampaign.settlements) || []).map(s => ({
      id: s.id, label: (s.name || s.id) + ' · ' + (Number(s.families) || 0) + ' families' + (s.arcaneUsurpedByCharacterId ? ' (usurped)' : '') }));
  },
  arcaneUsurpedSettlements(){
    const list = window.ACKS.usurpedSettlements(this.currentCampaign) || [];
    return list.map(s => {
      const uid = s.arcaneUsurpedByCharacterId;
      const c = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === uid);
      const familiesXp = window.ACKS.settlementFamiliesXp(this.currentCampaign, s);
      // Wave E — the divine wrath the usurpation has provoked (built monthly by processReligionForTurn).
      const w = window.ACKS.settlementDivineWrath ? window.ACKS.settlementDivineWrath(this.currentCampaign, s) : null;
      let wrathLabel = 'divine wrath gathers — the gods answer at the next monthly turn', wrathLevel = 0;
      if(w && w.level > 0){
        wrathLevel = w.level;
        const sev = window.ACKS.wrathSeverityForLevel(w.level);
        const force = window.ACKS.divineWrathForceXp(familiesXp, w.level);
        wrathLabel = (sev === 'portent')
          ? 'divine wrath: dire portents (lvl 1) — a month’s grace'
          : 'divine wrath: the ' + sev + ' of the gods (lvl ' + w.level + ') — a ' + force.toLocaleString() + ' XP retribution, GM-staged';
      }
      return { id: s.id, name: s.name || s.id, usurperName: c ? (c.name || c.id) : uid, familiesXp, wrathLevel, wrathLabel };
    });
  },
  arcaneUsurp(){
    if(!this.arcaneUsurpCasterId || !this.arcaneUsurpSettlementId) return;
    const r = window.ACKS.flagArcaneUsurpation(this.currentCampaign, { characterId: this.arcaneUsurpCasterId, settlementId: this.arcaneUsurpSettlementId });
    this.arcaneLastUsurpOk = !!(r && r.ok);
    if(r && r.ok){ this.arcaneLastUsurp = r.alreadyFlagged ? 'Already usurped by this caster.' : ('Usurped — flagged for the divine response (' + (r.familiesXp || 0).toLocaleString() + ' families-XP). The gods take notice.'); this.markDirty(); this.schedulePersist(); if(!r.alreadyFlagged) this.showToast('⚖️ Settlement usurped (the divine seam — Religion will respond).'); }
    else { this.arcaneLastUsurp = 'Could not usurp: ' + ((r && r.reason) || 'unknown') + (r && r.reason === 'caster-not-arcane' ? ' (the usurper must be an arcane caster)' : ''); }
  },
  arcaneClearUsurp(settlementId){ window.ACKS.clearArcaneUsurpation(this.currentCampaign, settlementId); this.markDirty(); this.schedulePersist(); this.showToast('Usurpation released.'); },
  // AD-F — Dungeon Builder deep-link reservation (Phase 4.8 Generators). The entry point exists; the
  // room-by-room stocking wizard (JJ ch.10) lands in Phase 4.8. Reserved no-op for now.
  openDungeonBuilder(dungeonId){ this.showToast('🗺 The Dungeon Builder (room-by-room stocking) arrives in Phase 4.8 Generators.'); },

  // ── Phase 4 — Magic Research (AD-M1) · the character-sheet ⚗ Research panel ──
  // Is this character an arcane caster (the Research tab shows for them)? Per-kind level eligibility is
  // checked in the New-research modal (isEligibleResearcher).
  characterIsArcaneCaster(ch){ return !!(ch && window.ACKS.isArcaneCaster && window.ACKS.isArcaneCaster(ch)); },
  characterResearchProjects(ch){ return ch ? (window.ACKS.researchProjectsFor(this.currentCampaign, ch.id) || []) : []; },
  // ── Phase 4 — Sanctums AD-B · the 🔮 Sanctum character-sheet tab ──
  characterSanctums(ch){ return ch ? (window.ACKS.sanctumsOwnedBy(this.currentCampaign, ch.id) || []) : []; },
  canBuildSanctumUI(ch){ return !!(ch && window.ACKS.canOperateDungeon && window.ACKS.canOperateDungeon(ch)); },
  sanctumCompanionCap(){ return window.ACKS.SANCTUM_COMPANION_CAP || 6; },
  sanctumApprenticeCap(){ return window.ACKS.SANCTUM_APPRENTICE_CAP || 12; },
  sanctumRosterFor(id){ return window.ACKS.sanctumRoster(this.currentCampaign, id) || { companions: [], apprentices: [], facilities: [] }; },
  sanctumHexLabel(s){ const h = (this.currentCampaign && (this.currentCampaign.hexes||[]).find(x => x && x.id === s.hexId)); return h ? (window.ACKS.hexName ? hexLabelFor(h) : h.id) : s.hexId; },
  openCharacterById(id){ const c = (this.currentCampaign && (this.currentCampaign.characters||[]).find(x => x && x.id === id)); if(c) this.openCharacterEditor(c); },
  // The 4 research-facility rows for a sanctum, with the magic-research throw bonus each grants (RR p.391 —
  // +1 per 10,000 gp over the 4,000 gp minimum, max +3; mirrors acks-engine-magic-research.js _facilityBonus).
  sanctumFacilityRows(s){
    const labels = { 'library':'📚 Library', 'workshop':'🛠 Workshop', 'mortuary':'💀 Mortuary', 'crossbreeding-lab':'🧬 Crossbreeding lab' };
    const facs = (s && s.kindSpecific && Array.isArray(s.kindSpecific.researchFacilities)) ? s.kindSpecific.researchFacilities : [];
    return (window.ACKS.FACILITY_KINDS || ['library','workshop','mortuary','crossbreeding-lab']).map(kind => {
      const f = facs.find(x => x && x.kind === kind);
      const valueGp = f ? (Number(f.valueGp) || 0) : 0;
      return { kind, label: labels[kind] || kind, valueGp, bonus: Math.min(3, Math.floor(Math.max(0, valueGp - 4000) / 10000)) };
    });
  },
  setSanctumFacilityValue(sanctumId, kind, value){
    const r = window.ACKS.setSanctumFacility(this.currentCampaign, { constructibleId: sanctumId, kind, valueGp: Number(value) || 0 });
    if(r && r.ok){ this.markDirty(); this.schedulePersist(); this.showToast('🔮 ' + kind + ' facility set to ' + (Number(value)||0).toLocaleString() + ' gp.'); }
  },
  // Establish a completed sanctum at the character's hex (the Admin verb; RAW-timed construction lands with
  // the Construction Wizard). Fires onSanctumConstructed → facilities scaffold + the first attraction.
  establishSanctum(ch){
    if(!ch || !ch.currentHexId) return;
    const camp = this.currentCampaign;
    if(!Array.isArray(camp.constructibles)) camp.constructibles = [];
    const cst = window.ACKS.blankConstructible({
      constructibleKind: 'sanctum', constructibleSubtype: 'sanctum',
      name: (ch.name || 'A mage') + "'s Sanctum",
      hexId: ch.currentHexId, ownerCharacterId: ch.id,
      ownerDomainId: ch.currentDomainId || null, buildValue: 15000,
      completedAtTurn: camp.currentTurn || 1
    });
    camp.constructibles.push(cst);
    const r = window.ACKS.onSanctumConstructed(camp, cst, {});
    this.markDirty(); this.schedulePersist();
    const att = r && r.attraction;
    const drew = att ? ((att.companions||[]).length + ' companion' + ((att.companions||[]).length===1?'':'s') + ' + ' + (att.apprentices||[]).length + ' apprentice' + ((att.apprentices||[]).length===1?'':'s')) : '';
    this.showToast('🔮 Sanctum established' + (drew ? ' — drew ' + drew : '') + '.');
  },
  // The New-research modal
  openResearchModal(ch){
    if(!ch) return;
    this.researchNew = { kind: 'spell-research', spellLevel: 1, effectType: 'one-use', itemKind: 'potion',
      charges: 10, activationRate: '1/day', permanentDuration: '1-day', enchantBonus: 1, spellLevelsImbued: 1,
      targetName: '', commonSpell: false, fromFormula: false, fromSample: false, assistantIds: [], magicDomain: '',
      hd: 1, minorAbilities: 0, majorAbilities: 0, quantity: 1, undead: false, sentient: false, preserveMemory: false, willing: false,
      ritualKey: '', ritualLevel: 7, mode: 'immediate', storedForm: 'scroll',
      experimentOn: false, experimentMethod: 'conventional', experimentAdv: { haste: 0, efficiency: 0, insight: 0, lore: 0 }, experimentArtCraft: false };
    this.researchNewMsg = '';
    this.researchModalOpen = true;
  },
  closeResearchModal(){ this.researchModalOpen = false; },
  characterRitualsKnown(ch){ return (ch && window.ACKS.ritualsKnown) ? (window.ACKS.ritualsKnown(this.currentCampaign, ch) || []) : []; },
  openLairWizardAtHex(hexId){
    this.openLairWizard('author');
    this.lairWizardForm.hexId = hexId || '';
  },
  openHexDetailById(hexId){
    const h = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(x => x && x.id === hexId);
    if(h) this.openHexDetail({ hex: h, domainId: h.domainId || null, hexIndex: -1, domainName: null });
  },

  // ── Encounter resolution modal (#476 E2) — the step-walking surface over the E1 verbs.
  // Each button calls one engine verb (acks-engine-events.js); the modal never mutates the
  // entity itself — every step (incl. the distance roll, E2h) goes through the engine
  // verbs, and every roll is re-rollable at its frontier. Inspector = the override path.
  openEncounterModal(id){
    const enc = window.ACKS.findEncounter(this.currentCampaign, id);
    if(!enc){ this.showToast('No encounter entity yet — commit the day first.', 3500); return; }
    const det = (enc.distance && enc.distance.detectedBy) || 'both';
    const firstChar = (enc.partySide && (enc.partySide.faceCharacterId || (enc.partySide.characterIds || [])[0])) || '';
    const sur = enc.surprise || null;                // re-opening seeds the asserts from stored state
    this.encModal = {
      pFore: sur ? !!sur.party.foreknowledge : false,
      mFore: sur ? !!sur.monsters.foreknowledge : false,
      pLos: sur ? !!sur.party.lineOfSight : (det === 'both' || det === 'party'),   // line-of-sight defaults follow who detected whom
      mLos: sur ? !!sur.monsters.lineOfSight : (det === 'both' || det === 'monsters'),
      pHidden: sur ? !!sur.party.hidden : false,     // E2i — GM-asserted hidden (RR pp.283–284)
      mHidden: sur ? !!sur.monsters.hidden : false,
      reassert: false, pSurpMod: 0, mSurpMod: 0,
      evSize: (enc.partySide && (enc.partySide.sizeCount || (enc.partySide.characterIds || []).length)) || 1,
      evExplorer: false, evForlorn: false, evFly: false, evSpeed: 0, evGmMod: 0, evAllowSurprised: false,
      faceId: firstChar, reactMod: 0,
      inflActorId: firstChar, inflMod: 0, inflBribe: 0,
      settle: null, settleDungeon: false,   // E3a — the transient linger-or-migrate proposal (nothing written until confirm)
      tone: (enc.reaction && enc.reaction.tone) || 'diplomatic',   // E3b — the spokesperson's approach (JJ pp.84–87)
      toneOpen: false, toneRows: [],
      pursuitMod: 0,  // E3c — the take-up throw's GM modifier
      identityPick: false, identityPickRarity: 'common', identityPickValue: ''   // E4 — the choose-from-table panel
    };
    this.encounterModalId = id;
    this.encModalToneReset();
    this.encounterModalOpen = true;
  },
  // Close hides via the flag and leaves the id set: the still-mounted subtree keeps a valid
  // entity to read, so Alpine's teardown never dereferences null (the lair/stash modals'
  // null-on-close pattern spams expression warnings on every close).
  closeEncounterModal(){ this.encounterModalOpen = false; },
  // Quick-dismiss an active encounter — from the ⏸ clock-held banner (📜 Events ▸ Daily Events) or
  // the ⚔ Encounters work-queue's Actions column — resolving it as 'dismissed' (nothing came of it)
  // so it leaves the queue and the world clock frees, without walking the full RR pre-combat panel.
  // Same engine path as the modal's encModalResolve above (recordEncounterResolved → the
  // encounter-resolved event + entity flip). Encounters only (the banner hides it for battles).
  // One-click by design — NO confirm (Joachim 2026-06-22): it's recoverable (the encounter lands in
  // Past Encounters) and the toast names what was dismissed. Don't re-add a confirm() here.
  dismissEncounter(id, label){
    if(!this.currentCampaign) return;
    const r = window.ACKS.recordEncounterResolved(this.currentCampaign, id, 'dismissed', {});
    if(!r || !r.ok){ this.showToast('Could not dismiss: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Dismissed “' + (label || 'encounter') + '” — clock free if nothing else holds it.', 4000);
  },
  // ── Review ▸ ⚔ Encounters (E2g; moved from World ▸ 2026-06-13) — the active work queue + the separate Past table
  // beneath it (per Joachim 2026-06-10). One search filters both; newest first.
  allEncounters(){ return (this.currentCampaign && this.currentCampaign.encounters) || []; },
  activeEncountersFiltered(){
    return this.allEncounters().filter(e => e && e.status === 'active' && this._encounterMatchesSearch(e)).reverse();
  },
  pastEncountersFiltered(){
    return this.allEncounters().filter(e => e && e.status !== 'active' && this._encounterMatchesSearch(e)).reverse();
  },
  openConstructionWizard(prefill){
    prefill = prefill || {};
    // Wave F — repair mode: prefill from the damaged target Constructible (kind/subtype/site/owner fixed
    // to the target; cost = the RR p.339 repair cost; the GM adjusts the crew + supervisor).
    if(prefill.repairTargetConstructibleId){
      const A = window.ACKS, t = A.findConstructible ? A.findConstructible(this.currentCampaign, prefill.repairTargetConstructibleId) : null;
      if(t) prefill = Object.assign({
        kind: t.constructibleKind, componentType: '',
        name: 'Repair: ' + (t.name || t.constructibleSubtype || t.constructibleKind),
        totalCost: A.constructionRepairCost ? A.constructionRepairCost(t) : 0,
        siteHexId: t.hexId || '', ownerDomainId: t.ownerDomainId || '', ownerCharacterId: t.ownerCharacterId || ''
      }, prefill);
    }
    const firstDom = (this.domains || [])[0];
    this.constructionWizard = {
      open: true,
      kind: prefill.kind || 'stronghold-component',
      structureKey: '',
      componentType: prefill.componentType || '',
      name: prefill.name || '',
      totalCost: Number(prefill.totalCost) || 0,
      ownerKind: prefill.ownerCharacterId ? 'character' : 'domain',
      ownerDomainId: prefill.ownerDomainId || (firstDom ? firstDom.id : ''),
      ownerCharacterId: prefill.ownerCharacterId || '',
      siteHexId: prefill.siteHexId || '',
      laborers: 0, masons: 0, carpenters: 0, smiths: 0,
      supervisorIds: [],
      repairTargetId: prefill.repairTargetConstructibleId || '',
      // @b14-construction — siege-support fields (the siege-construction kind only)
      siegeId: prefill.siegeId || '', circumvallationFeet: 2500, assemblyMachineId: ''
    };
    // @b14-construction — pre-pick the siege work (circumvallation / war-machine-assembly) + derive its cost.
    if(prefill.siegeSupportType){ this.constructionWizard.structureKey = prefill.siegeSupportType; this.siegeWizardSyncCost(); }
  },
  closeConstructionWizard(){ this.constructionWizard.open = false; },
  // ── Follower Attraction (Construction Wave C — RR p.334) ──
  // The Stronghold-tab card is eligibility-DERIVED (shown whenever the ruler is name-level with a
  // qualifying stronghold and hasn't yet attracted followers); the modal rolls → reviews → materializes.
  followerEligibility(domain){
    try { return (window.ACKS && window.ACKS.domainFollowerEligibility && domain) ? window.ACKS.domainFollowerEligibility(this.currentCampaign, domain) : { ok:false }; }
    catch(_e){ return { ok:false }; }
  },
  _followerDice(spec){ return spec ? String(spec).replace(/\*/g, '×') : ''; },
  followerCardWho(domain){
    const e = this.followerEligibility(domain);
    if(!e.ok) return '';
    const row = e.row, parts = [];
    if(row.troops) parts.push(this._followerDice(row.troops) + ' ' + (row.troopLevel >= 1 ? '1st' : '0th') + '-level troops');
    if(row.companions) parts.push(this._followerDice(row.companions) + ' companions' + (row.companionLevels === '1d6' ? ' of 1st–3rd level' : ' of 1st level'));
    if(row.apprentices) parts.push(this._followerDice(row.apprentices) + ' 0th-level novices');
    return parts.join(' + ') || 'Followers';
  },
  openFollowerArrival(domain){
    if(!domain) return;
    const prop = (window.ACKS && window.ACKS.proposeFollowerArrival) ? window.ACKS.proposeFollowerArrival(this.currentCampaign, domain) : null;
    this.followerArrival = { open: true, domainId: domain.id, proposal: prop };
  },
  rerollFollowerArrival(){
    const dom = (this.domains || []).find(d => d && d.id === this.followerArrival.domainId);
    if(!dom) return;
    this.followerArrival.proposal = (window.ACKS && window.ACKS.proposeFollowerArrival) ? window.ACKS.proposeFollowerArrival(this.currentCampaign, dom) : null;
  },
  closeFollowerArrival(){ this.followerArrival.open = false; },
  followerArrivalIntro(){
    const p = this.followerArrival.proposal;
    if(!p || !p.ok) return '';
    const dom = (this.domains || []).find(d => d && d.id === p.domainId);
    return (dom ? (dom.name || 'The domain') : 'The domain') + "'s ruler has reached name level with a worthy stronghold (" + (p.strongholdValue || 0).toLocaleString() + 'gp). Followers rally to serve (RR p.334):';
  },
  followerArrivalCompanionClass(){
    const p = this.followerArrival.proposal;
    if(!p || !p.ok) return '';
    const ruler = (this.currentCampaign && (this.currentCampaign.characters || []).find(c => c && c.id === p.rulerId)) || null;
    return (ruler && ruler.class) || '';
  },
  followerArrivalCompanionLevels(){
    const p = this.followerArrival.proposal;
    if(!p || !p.ok || !p.companions || !p.companions.length) return '';
    const tally = {}; p.companions.forEach(c => { tally[c.level] = (tally[c.level] || 0) + 1; });
    return 'levels: ' + Object.keys(tally).sort().map(lv => tally[lv] + '× L' + lv).join(', ');
  },
  submitFollowerArrival(){
    const camp = this.currentCampaign, p = this.followerArrival.proposal;
    if(!camp || !p || !p.ok){ this.closeFollowerArrival(); return; }
    const dom = (this.domains || []).find(d => d && d.id === this.followerArrival.domainId);
    if(!dom){ this.closeFollowerArrival(); return; }
    const r = (window.ACKS && window.ACKS.attractFollowers) ? window.ACKS.attractFollowers(camp, dom, p) : { ok:false };
    if(r && r.ok){
      this.markDirty(); this.schedulePersist();
      const bits = [];
      if(r.companionCount) bits.push(r.companionCount + ' companion' + (r.companionCount === 1 ? '' : 's'));
      if(r.troopCount) bits.push(r.troopCount.toLocaleString() + ' troops');
      if(r.apprenticeCount) bits.push(r.apprenticeCount.toLocaleString() + ' novices');
      this.showToast && this.showToast('🎺 Followers arrive — ' + (bits.join(' + ') || 'none') + ' (RR p.334). See the Characters roster.');
    } else {
      this.showToast && this.showToast('Could not attract followers' + (r && r.reason ? ' (' + r.reason + ')' : '') + '.');
    }
    this.closeFollowerArrival();
  },
  submitConstructionWizard(){
    const cw = this.constructionWizard, camp = this.currentCampaign;
    if(!camp){ this.showToast && this.showToast('No campaign loaded.'); return; }
    if(this.constructionWizardSubmitReason()) return;
    const opts = {
      constructibleKind: cw.kind,
      constructibleSubtype: cw.structureKey || null,
      name: cw.name.trim(),
      siteHexId: cw.siteHexId || null,
      ownerDomainId: cw.ownerKind === 'domain' ? (cw.ownerDomainId || null) : null,
      ownerCharacterId: cw.ownerKind === 'character' ? (cw.ownerCharacterId || null) : null,
      totalCost: Number(cw.totalCost) || 0,
      workerCounts: this.constructionWizardWorkerCounts(),
      supervisorCharacterIds: (cw.supervisorIds || []).slice()
    };
    // Wave F — repair mode: flag the Project so completion restores the target (rather than spawning a
    // new Constructible). A stronghold-component repair must NOT add a fresh component (no completionSpec).
    if(cw.repairTargetId){ opts.isRepair = true; opts.repairTargetConstructibleId = cw.repairTargetId; }
    if(cw.kind === 'stronghold-component' && !cw.repairTargetId){
      opts.completionSpec = { componentType: cw.componentType || '', structures: cw.structureKey ? [{ structureKey: cw.structureKey, quantity: 1 }] : [] };
    }
    // @b14-construction — a siege work carries its target siege + parameters; on completion the slot-51
    // consumer feeds the siege (circumvallation → blockade unit relief; assembly → besieger artillery).
    if(cw.kind === 'siege-construction' && !cw.repairTargetId){
      const support = { siegeId: cw.siegeId, supportType: cw.structureKey };
      if(cw.structureKey === 'circumvallation'){ support.feet = Number(cw.circumvallationFeet) || 0; }
      else if(cw.structureKey === 'war-machine-assembly'){
        const m = this.siegeWizardMachineOptions().find(x => x.id === cw.assemblyMachineId);
        support.machineSubtype = m ? m.subtype : null; support.machineConstructibleId = cw.assemblyMachineId || null;
      }
      opts.completionSpec = { siegeSupport: support };
    }
    // Wave E — a settlement-building is embedded in its hex's settlement: carry the settlement link so the
    // completed Constructible knows its settlement (the data layer + the function-chip readout).
    if(cw.kind === 'settlement-building' && !cw.repairTargetId && cw.siteHexId && window.ACKS.settlementForHex){
      const st = window.ACKS.settlementForHex(camp, cw.siteHexId);
      if(st) opts.siteSettlementId = st.id;
    }
    const p = window.ACKS.startConstructionProject(camp, opts);
    if(!p){ this.showToast && this.showToast('Could not start the project.'); return; }
    // Audit: emit the start event (the handler stamps the 'started' history + a narrative). Repair mode
    // emits construction-repair-started (it marks the target in-repair); build mode construction-project-started.
    if(!Array.isArray(camp.eventLog)) camp.eventLog = [];
    const ev = cw.repairTargetId
      ? window.ACKS.newEvent('construction-repair-started', {
          payload: { projectId: p.id, repairTargetConstructibleId: cw.repairTargetId, totalCost: opts.totalCost, laborRequired: p.laborRequired },
          submittedBy: 'gm', targetTurn: camp.currentTurn || 1, status: 'applied' })
      : window.ACKS.newEvent('construction-project-started', {
      payload: { projectId: p.id, ownerDomainId: opts.ownerDomainId || undefined, ownerCharacterId: opts.ownerCharacterId || undefined,
                 siteHexId: opts.siteHexId || undefined, constructibleKind: opts.constructibleKind,
                 constructibleSubtype: opts.constructibleSubtype || undefined, totalCost: opts.totalCost, laborRequired: p.laborRequired },
      submittedBy: 'gm', targetTurn: camp.currentTurn || 1, status: 'applied'
    });
    const out = window.ACKS.applyEvent(camp, ev);
    ev.appliedAtTurn = camp.currentTurn || 1; ev.result = out.result;
    camp.eventLog.push({ event: ev, result: out.result, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast(out.result && out.result.narrativeSummary ? out.result.narrativeSummary : ('Construction begun on ' + opts.name + '.'));
    this.closeConstructionWizard();
  },
  // Wave E — settlement buildings at a hex (built Constructibles) for the hex-card function-chip readout.
  settlementBuildingRows(hex){
    if(!hex || !this.currentCampaign || !window.ACKS.settlementBuildingsAtHex) return [];
    return window.ACKS.settlementBuildingsAtHex(this.currentCampaign, hex.id).map(c => {
      const b = window.ACKS.findSettlementBuilding ? window.ACKS.findSettlementBuilding(c.constructibleSubtype) : null;
      return { id: c.id, name: c.name || (b ? b.label : 'Building'), fnLabel: b ? b.fnLabel : (c.constructibleSubtype || 'building'),
               enables: b ? b.enables : null, damageState: c.damageState };
    });
  },
  // Under-construction settlement-building projects at a hex (so the GM sees in-progress ones on the card).
  settlementBuildingProjectsAtHex(hex){
    if(!hex || !this.currentCampaign) return [];
    return (this.currentCampaign.projects || []).filter(p => p && p.constructibleKind === 'settlement-building' && p.siteHexId === hex.id && p.lifecycleState === 'under-construction');
  },
  // In-flight construction projects for the Stronghold tab — under-construction structure projects for a
  // domain, each with its live forecast. (Agricultural improvements have their own Demographics surface.)
  domainConstructionProjects(domain){
    if(!this.currentCampaign || !domain) return [];
    const A = window.ACKS;
    const list = A.projectsForDomain ? A.projectsForDomain(this.currentCampaign, domain.id)
                                     : (this.currentCampaign.projects || []).filter(p => p && p.ownerDomainId === domain.id);
    return list.filter(p => p && p.lifecycleState === 'under-construction' && p.constructibleKind !== 'agricultural-improvement');
  },
  domainProjectForecast(project){
    if(!this.currentCampaign || !project) return null;
    return window.ACKS.projectConstructionForecast(this.currentCampaign, project);
  },
  cancelConstructionProject(project){
    if(!project || !this.currentCampaign) return;
    if(!confirm('Abandon "' + (project.name || 'this project') + '"? It will be removed and no structure is built.')) return;
    const arr = this.currentCampaign.projects || [];
    const i = arr.findIndex(p => p && p.id === project.id);
    if(i >= 0) arr.splice(i, 1);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Project abandoned.');
  },

  // Turn Cycle v2 — filter state for the Event Log view.
  eventLogFilter:{ kind:'', submitter:'', status:'all', domainId:'', search:'' },
  eventLogShowPending: true,

  // Returns the combined list of pending + applied/rejected events, filtered + reverse-chronological.
  filteredEventLog(){
    const c = this.currentCampaign;
    if(!c) return [];
    const pending = (c.pendingEvents||[]).map(e => ({ event:e, result:null, appliedAtTurn:null, appliedAt:null, _isPending:true }));
    const logged = (c.eventLog||[]).map(entry => Object.assign({}, entry, { _isPending:false }));
    let combined;
    if(this.eventLogFilter.status === 'pending') combined = pending;
    else if(this.eventLogFilter.status === 'logged') combined = logged;
    else combined = pending.concat(logged);
    const f = this.eventLogFilter;
    return combined.filter(entry => {
      const ev = entry.event;
      if(f.kind && ev.kind !== f.kind) return false;
      if(f.submitter && !ev.submittedBy.includes(f.submitter)) return false;
      if(f.domainId){
        const p = ev.payload || {};
        const matches = p.domainId === f.domainId ||
                        (p.target && p.target.id === f.domainId) ||
                        p.attackerDomainId === f.domainId || p.defenderDomainId === f.domainId;
        if(!matches) return false;
      }
      if(f.search){
        const q = f.search.toLowerCase();
        const blob = (ev.kind+' '+ev.submittedBy+' '+(ev.gmNotes||'')+' '+JSON.stringify(ev.payload||{})+' '+(entry.result?.narrativeSummary||'')).toLowerCase();
        if(!blob.includes(q)) return false;
      }
      return true;
    }).sort((a,b) => {
      // Pending first (by submittedAt desc), then logged (by appliedAt desc)
      if(a._isPending && !b._isPending) return -1;
      if(!a._isPending && b._isPending) return 1;
      if(a._isPending){
        return (b.event.submittedAt||'').localeCompare(a.event.submittedAt||'');
      }
      return (b.appliedAt||'').localeCompare(a.appliedAt||'');
    });
  },
  // Grand total over the whole garrison as displayed — mercenaries (standing) + conscripts + militia,
  // each summed by living count (count - casualties) so the foot row equals the sum of the rows above.
  garrisonAllTotals(domain){ if(!domain) return { count:0, cost:0, br:0 }; const all = [ ...this.garrisonStandingUnits(domain), ...this.domainLevyRows(domain,'conscript'), ...this.domainLevyRows(domain,'militia') ]; const liv = u => this.levyUnitLiving(u); return { count: all.reduce((s,u)=>s+liv(u),0), cost: all.reduce((s,u)=>s+this.levyUnitCurrentCost(u),0), br: all.reduce((s,u)=>s+liv(u)*(u.brPerSoldier||0),0) }; },
  openUnitSheet(u){ if(u && u.id) this.unitSheetUnitId = u.id; },
  closeUnitSheet(){ this.unitSheetUnitId = null; },
  // Levy modal — count + home hex (RR pp.430–433). Materializes the levy, then sets its home.
  openLevyModal(domain, source){ if(domain) this.levyModal = { open: true, domainId: domain.id, source, count: 1 }; },
  closeLevyModal(){ this.levyModal.open = false; },
  levyModalDomain(){ const id = this.levyModal && this.levyModal.domainId; return id ? (this.domains || []).find(d => d && d.id === id) : null; },
  levyModalAvailable(){ const d = this.levyModalDomain(); return d ? this.domainLevyAvailable(d, this.levyModal.source) : 0; },
  levyModalCanSubmit(){ const d = this.levyModalDomain(); if(!d) return false; const n = Math.floor(Number(this.levyModal.count) || 0); return this.domainCanLevy(d) && n >= 1 && n <= this.levyModalAvailable(); },
  submitLevy(){
    const d = this.levyModalDomain(); if(!d || !this.levyModalCanSubmit()) return;
    const n = Math.floor(Number(this.levyModal.count) || 0); const src = this.levyModal.source; const A = window.ACKS;
    const u = src === 'militia' ? A.levyMilitia(this.currentCampaign, d.id, { count: n }) : A.levyConscripts(this.currentCampaign, d.id, { count: n });
    if(!u){ this.showToast && this.showToast('No room to levy more ' + src + ' (available ' + this.domainLevyAvailable(d, src) + ').', 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast(u.musterState
      ? 'Began levying ' + u.musterState.total + ' ' + src + ' from ' + (d.name || d.id) + ' — they arrive over 3 weeks (RR p.430). Advance the Day Clock.'
      : 'Levied ' + u.count + ' ' + src + ' from ' + (d.name || d.id) + '.');
    this.closeLevyModal();
  },

  // ─── 🪖 Realm-scale mercenary recruitment (RR p.428; W7-continuation) — hire whole mercenary units
  //      at the realm's tier; per-period availability caps the count; the troops arrive ½/¼/remainder
  //      over the tier's time period (the slot-46 muster consumer tops them up). Distinct from the
  //      settlement-scale "+ Recruit unit" Recruiting Wizard (RR pp.164–167). ───
  openRecruitModal(domain){
    if(!domain) return;
    const rows = this.recruitTypeRowsFor(domain);
    const first = ((rows.find(r => r.available > 0) || rows[0]) || {}).key || '';
    this.recruitModal = { open: true, domainId: domain.id, typeKey: first, count: 1 };
  },
  closeRecruitModal(){ this.recruitModal.open = false; },
  submitRecruit(){
    const d = this.recruitModalDomain(); if(!d || !this.recruitModalCanSubmit()) return;
    const n = Math.floor(Number(this.recruitModal.count) || 0); const key = this.recruitModal.typeKey; const A = window.ACKS;
    const r = A.recruitRealmTroops(this.currentCampaign, d.id, { typeKey: key, count: n });
    if(!r){ this.showToast && this.showToast('No ' + key.replace(/-/g, ' ') + ' available to recruit at the ' + this.recruitModalTier() + ' this period.', 4000); return; }
    const word = this.recruitModalPeriodWord();
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Recruited ' + r.recruited + ' ' + key.replace(/-/g, ' ') + ' mercenaries (' + r.tier + ', fee ' + r.feeGp.toLocaleString() + 'gp) — they arrive over 3 ' + word + ' (RR p.428). Advance the Day Clock.');
    this.closeRecruitModal();
  },
  // 🎖 Realm-scale officer/specialist recruitment (RR p.428) — the individual half. Mirrors the merc modal.
  openRecruitSpecialistModal(domain){
    if(!domain) return;
    const rows = this.recruitSpecialistTypeRowsFor(domain);
    const first = ((rows.find(r => r.available > 0) || rows[0]) || {}).key || '';
    this.recruitSpecialistModal = { open: true, domainId: domain.id, typeKey: first, detailLevel: 'lightweight' };
  },
  closeRecruitSpecialistModal(){ this.recruitSpecialistModal.open = false; },
  submitRecruitSpecialist(){
    const d = this.recruitSpecialistDomain(); if(!d || !this.recruitSpecialistCanSubmit()) return;
    const key = this.recruitSpecialistModal.typeKey; const detail = this.recruitSpecialistModal.detailLevel; const A = window.ACKS;
    const r = A.recruitRealmSpecialist(this.currentCampaign, d.id, { typeKey: key, detailLevel: detail });
    if(!r){ this.showToast && this.showToast('None available to recruit at the ' + this.recruitSpecialistTier() + ' this period.', 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Recruited ' + (r.character.name || 'a specialist') + ' (' + r.tier + ', ' + (detail === 'full' ? 'full chargen' : 'lightweight stub') + ').');
    this.closeRecruitSpecialistModal();
  },
  // Lightweight↔full NPC doctrine (2026-06-18) — promote a lightweight stub to a full character in place.
  expandCharacterUi(c){
    if(!c || c.detailLevel !== 'lightweight') return;
    window.ACKS.expandCharacterToFull(this.currentCampaign, c);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Expanded ' + (c.name || 'the NPC') + ' to a full character — abilities rolled.');
  },

  // ─── #549 Add garrison unit with audit event (2026-05-30; W1: catalog defaults +
  //      first-class membership via stationUnit — campaign.units[] + the garrison mirror) ───
  addGarrisonUnit(domain){
    if(!domain) return;
    const A = window.ACKS;
    if(!A || !A.blankUnit){ alert('Engine not loaded'); return; }
    const u = A.blankUnit({ unitTypeKey: 'light-infantry', count: 0 });
    A.stationUnit(this.currentCampaign, u, { kind: 'domain-garrison', id: domain.id });
    // Audit event — manually build + push as APPLIED so it lands in the log without going
    // through the pending queue (this is administrative GM action, applied immediately).
    try {
      const ev = A.newEvent('gm-fiat', {
        submittedBy: 'gm',
        targetTurn: (this.currentCampaign && this.currentCampaign.currentTurn) || 1,
        payload: {
          target: { kind: 'garrison-unit', id: u.id },
          mutation: { fieldPath: 'ownerDomainId', newValue: domain.id },
          reason: 'GM administrative add — new garrison unit in ' + (domain.name || 'domain')
        },
        gmNotes: 'GM-added new garrison unit (' + u.displayName + ', id=' + u.id + ')'
      });
      ev.status = A.EVENT_STATUS && A.EVENT_STATUS.APPLIED || 'applied';
      ev.appliedAtTurn = (this.currentCampaign && this.currentCampaign.currentTurn) || 1;
      if(A.setEventContext){
        A.setEventContext(ev, {
          domainId: domain.id,
          relatedEntities: [{ kind: 'garrison-unit', id: u.id, role: 'subject' }]
        });
      }
      if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
      // Push wrapper shape so the Event Log view sees it (filteredEventLog expects entry.event.X).
      this.currentCampaign.eventLog.push({
        event: ev,
        result: ev.result || { narrativeSummary: 'GM added garrison unit ' + u.displayName },
        appliedAtTurn: (this.currentCampaign && this.currentCampaign.currentTurn) || 1,
        appliedAt: new Date().toISOString()
      });
    } catch(err){ console.warn('addGarrisonUnit: failed to emit audit event', err); }
    this.showToast && this.showToast('Added unit: ' + u.displayName, 3000);
  },

  // ─── #547 Garrison unit interim split + merge (2026-05-30) ───
  canMergeGarrisonUnit(domain, unit){
    if(!domain || !unit) return false;
    if(this.unitIsDeployed(unit)) return false;   // a deployed unit is managed through its army
    const sibs = window.ACKS.domainGarrisonUnits(this.currentCampaign, domain).filter(u => u !== unit && u.unitTypeKey === unit.unitTypeKey && !this.unitIsDeployed(u));
    return sibs.length > 0;
  },
  splitGarrisonUnit(domain, unit){
    if(!domain || !unit) return;
    if(this.unitIsDeployed(unit)){ this.showToast && this.showToast('This unit is with a field army — manage it through the army (Characters ▸ Parties).', 3500); return; }
    const cur = Number(unit.count || 0);
    if(cur <= 1){ alert('Cannot split a unit with fewer than 2 soldiers.'); return; }
    const ans = prompt('How many soldiers to split off into a new unit?\n(Currently ' + cur + ' soldiers; new unit gets N, original keeps ' + cur + '−N)', '1');
    if(ans == null) return;
    const n = Math.floor(Number(ans));
    if(!Number.isFinite(n) || n < 1 || n >= cur){ alert('Invalid split count.'); return; }
    if(!window.ACKS || !window.ACKS.blankUnit){ alert('Engine not loaded'); return; }
    const newUnit = window.ACKS.blankUnit({
      displayName: unit.displayName,
      unitTypeKey: unit.unitTypeKey,
      race: unit.race, loadout: unit.loadout, veteran: unit.veteran, source: unit.source,
      count: n,
      monthlyWage: unit.monthlyWage,
      brPerSoldier: unit.brPerSoldier,
      ownerDomainId: unit.ownerDomainId
    });
    unit.count = cur - n;
    window.ACKS.stationUnit(this.currentCampaign, newUnit, { kind: 'domain-garrison', id: domain.id });
    this.showToast && this.showToast('Split: ' + n + ' soldiers into new unit (' + (unit.displayName || unit.unitTypeKey) + ')', 3500);
  },
  mergeGarrisonUnit(domain, unit){
    if(!domain || !unit) return;
    if(this.unitIsDeployed(unit)){ this.showToast && this.showToast('This unit is with a field army — manage it through the army (Characters ▸ Parties).', 3500); return; }
    const sibs = window.ACKS.domainGarrisonUnits(this.currentCampaign, domain).filter(u => u !== unit && u.unitTypeKey === unit.unitTypeKey && !this.unitIsDeployed(u));
    if(sibs.length === 0){ alert('No same-type sibling unit to merge into.'); return; }
    let target;
    if(sibs.length === 1){ target = sibs[0]; }
    else {
      const choices = sibs.map((u, i) => {
        const name = (u.displayName || '').trim();
        const typeLabel = ((window.ACKS && window.ACKS.HIRELING_MERCENARIES) || []).find(r => r.id === u.unitTypeKey)?.label || u.unitTypeKey || '';
        // Format: "1) Halvard's Archers · Light Infantry — 50 soldiers" — drop the name
        // segment when it's empty or duplicates the type label.
        const head = (name && name !== typeLabel) ? (name + ' · ' + typeLabel) : typeLabel;
        return (i+1) + ') ' + head + ' — ' + (u.count || 0) + ' soldiers';
      }).join('\n');
      const ans = prompt('Merge into which sibling?\n' + choices + '\n(Enter number)', '1');
      if(ans == null) return;
      const idx = Math.floor(Number(ans)) - 1;
      if(!Number.isFinite(idx) || idx < 0 || idx >= sibs.length){ alert('Invalid choice.'); return; }
      target = sibs[idx];
    }
    target.count = Number(target.count || 0) + Number(unit.count || 0);
    // Remove the merged-away unit via the canonical setter (single-home, T6 — campaign.units[]).
    window.ACKS.disbandUnit(this.currentCampaign, unit);
    this.showToast && this.showToast('Merged into ' + (target.displayName || target.unitTypeKey) + ' (now ' + target.count + ' soldiers)', 3500);
  },

  // ─── Domain conscripts/militia (RR pp.430–433) — the Military-tab Conscript + Militia tables ───
  // Levy / train / divide / release / send-home / call-up the realm's standing manpower. "Available"
  // = cap − ever-raised (sticky casualties, RR p.430); casualties recover 5%/yr in commitTurn. This
  // replaces the old army Troop-depth levy panel (levy is a DOMAIN act; armies call them up via muster).
  domainLevyRows(domain, source){ return (domain && window.ACKS.domainLevyUnits) ? window.ACKS.domainLevyUnits(this.currentCampaign, domain, source) : []; },
  domainLevyCap(domain, source){ return source === 'militia' ? window.ACKS.militiaLevyMax(domain) : window.ACKS.conscriptLevyMax(domain); },
  domainLevyEverRaised(domain, source){ return window.ACKS.levyEverRaised(this.currentCampaign, domain, source); },
  domainLevyAvailable(domain, source){ return window.ACKS.levyAvailable(this.currentCampaign, domain, source); },
  domainCanLevy(domain){ return !!domain && window.ACKS.canLevyFromDomain(domain); },
  domainLevyFrom(domain, source, count){
    const n = Math.max(1, Math.floor(Number(count) || 0));
    const u = source === 'militia'
      ? window.ACKS.levyMilitia(this.currentCampaign, domain.id, { count: n })
      : window.ACKS.levyConscripts(this.currentCampaign, domain.id, { count: n });
    if(!u){ this.showToast && this.showToast('No room to levy more ' + source + ' (available ' + this.domainLevyAvailable(domain, source) + ', or the realm is too unhappy).', 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast(u.musterState
      ? 'Began levying ' + u.musterState.total + ' ' + source + ' from ' + (domain.name || domain.id) + ' — they arrive over 3 weeks (RR p.430).'
      : 'Levied ' + u.count + ' ' + source + ' from ' + (domain.name || domain.id) + '.');
  },
  // 🎓 Train modal (Domain ▸ Military) — turn an untrained conscript/militia levy into a professional
  // troop type. RR p.431: the Qualifying Number caps how many of the levy qualify for each type; the
  // unqualified remainder splits off as an untrained levy (the engine enforces it). Replaces the old
  // inline train select; opened from the conscript/militia table rows + the unit sheet.
  openTrainModal(unit){ if(unit && unit.id){ this.trainModal = { open: true, unitId: unit.id, type: '', count: null }; } },
  closeTrainModal(){ this.trainModal.open = false; },
  trainModalUnit(){ return this.trainModal.unitId ? window.ACKS.findUnit(this.currentCampaign, this.trainModal.unitId) : null; },
  trainModalActive(){ const u = this.trainModalUnit(); return u ? window.ACKS.unitActiveCount(u) : 0; },
  // The realm-wide budgets the training action spends against (RR pp.430–432), shown "in general" at the
  // modal head above the per-type rows: the levied MANPOWER pool for this source (trained + raw recruits —
  // the talent pool the per-type Qualifying Numbers divide; training draws from the raw recruits), the realm
  // TREASURY (the gp the per-troop cost is paid from), and the LEVY capacity still un-raised (cap − ever-raised).
  trainModalBudget(){
    const u = this.trainModalUnit(); if(!u || !u.ownerDomainId) return null;
    const A = window.ACKS; const src = u.source;
    const d = (this.domains || []).find(x => x && x.id === u.ownerDomainId) || null;
    const pool = A.domainLevyPoolCount(this.currentCampaign, u.ownerDomainId, src);
    let untrained = 0;
    for(const x of (A.domainLevyUnits(this.currentCampaign, u.ownerDomainId, src) || [])){ if(x && x.unitTypeKey === 'untrained-levy') untrained += A.unitActiveCount(x); }
    return { source: src, sourceLabel: src === 'militia' ? 'militia' : 'conscripts',
      domainName: (d && d.name) || 'the realm',
      pool, untrained, trained: Math.max(0, pool - untrained),
      treasury: d ? Math.round((d.treasury && d.treasury.gp) || 0) : 0,
      cap: src === 'militia' ? A.militiaLevyMax(d) : A.conscriptLevyMax(d),
      everRaised: A.levyEverRaised(this.currentCampaign, d, src),
      available: A.levyAvailable(this.currentCampaign, d, src) };
  },
  // Per-type rows for the chosen levy: label, qualifying %, the max this levy can field, time, cost, stats.
  trainModalTypeRows(){
    const u = this.trainModalUnit(); if(!u) return [];
    const A = window.ACKS; const race = u.race || 'man'; const active = A.unitActiveCount(u);
    const pool = A.domainLevyPoolCount(this.currentCampaign, u.ownerDomainId, u.source);   // RR p.431 — the cap is pool-wide
    return (A.trainableTroopTypes(race) || []).map(key => {
      const q = A.conscriptQualifyingNumber(key, race);
      const cost = A.trainingCostFor(key, race) || { months: 0, perTroopGp: 0 };
      const row = A.findTroopType(key, { race });
      const allowance = A.conscriptQualifyingMax(pool, key, race);                         // of the WHOLE pool, not this unit
      const already = A.domainLevyTrainedOfType(this.currentCampaign, u.ownerDomainId, u.source, key);
      const remaining = Math.max(0, allowance - already);                                  // pool-wide allowance still left
      return { key, label: (row && row.label) || key, qualNum: q, pctText: Math.round(q / 120 * 100) + '%',
        max: Math.min(active, remaining), poolTotal: pool, poolAllowance: allowance, already, remaining, source: u.source,
        months: cost.months, perTroopGp: cost.perTroopGp,
        wage: A.trainedTroopWage(key, race), br: row ? row.brPerCreature : 0, morale: row ? row.morale : 0 };
    });
  },
  trainModalChosen(){ if(!this.trainModal.type) return null; return this.trainModalTypeRows().find(r => r.key === this.trainModal.type) || null; },
  trainModalOnTypeChange(){ const c = this.trainModalChosen(); this.trainModal.count = c ? c.max : null; },
  trainModalCount(){ const c = this.trainModalChosen(); if(!c) return 0; let n = Math.floor(Number(this.trainModal.count) || 0); if(n < 1) n = c.max; return Math.max(1, Math.min(n, c.max)); },
  trainModalCost(){ const c = this.trainModalChosen(); return c ? this.trainModalCount() * c.perTroopGp : 0; },
  trainModalTreasury(){ const u = this.trainModalUnit(); if(!u || !u.ownerDomainId) return 0; const d = (this.domains || []).find(x => x && x.id === u.ownerDomainId); return d ? Math.round((d.treasury && d.treasury.gp) || 0) : 0; },
  trainModalCanSubmit(){ const c = this.trainModalChosen(); return !!c && c.max >= 1 && this.trainModalCount() >= 1; },
  submitTrain(){
    const u = this.trainModalUnit(); const c = this.trainModalChosen();
    if(!u || !c || !this.trainModalCanSubmit()) return;
    const n = this.trainModalCount(); const before = this.trainModalActive();
    const r = window.ACKS.trainLevyUnit(this.currentCampaign, u.id, { targetTroopType: c.key, count: n });
    if(!r || !r.ok){ this.showToast && this.showToast('Cannot train: ' + ((r && r.reason) || 'unknown'), 4000); return; }
    this.markDirty(); this.schedulePersist();
    const rem = Math.max(0, before - r.trained);
    const head = r.inTraining ? ('Began training ' + r.trained + ' as ' + c.label + ' — ' + r.cost.toLocaleString() + 'gp paid; ready in ' + r.months + 'mo (drilling on the Day Clock)')
                              : ('Trained ' + r.trained + ' as ' + c.label + ' — ' + r.cost.toLocaleString() + 'gp, ' + r.months + 'mo');
    this.showToast && this.showToast(head + (rem > 0 ? ' · ' + rem + ' stayed an untrained levy' : '') + '.', 5000);
    this.closeTrainModal();
  },
  domainSendMilitiaUnitHome(unit){
    const r = window.ACKS.sendMilitiaUnitHome(this.currentCampaign, unit);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Militia stood down — at home, drawing no wages; call up again without re-levying (RR p.432).');
  },
  domainSendAllMilitiaHome(domain){
    const r = window.ACKS.sendMilitiaHome(this.currentCampaign, domain.id);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Stood ' + r.sentHome + ' militia down — now at home, drawing no wages.');
  },
  domainCallUpMilitia(unit){
    window.ACKS.callUpMilitia(this.currentCampaign, unit);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Militia called up — the revenue/morale penalty resumes (RR p.432).');
  },
  domainReleaseLevy(unit){
    if(!confirm('Release ' + (unit.displayName || 'this unit') + ' from service? (RR p.430 — untrained return to their farms; trained conscripts become mercenaries/brigands.)')) return;
    if(window.ACKS.releaseLevyUnit(this.currentCampaign, unit)){ this.markDirty(); this.schedulePersist(); this.showToast && this.showToast('Released from service.'); }
  },
  domainMilitiaCalledUp(domain){ return window.ACKS.militiaCalledUpCount(this.currentCampaign, domain) || 0; },
  domainMilitiaRevenuePenalty(domain){ return window.ACKS.militiaRevenuePenaltyFamilies(this.currentCampaign, domain) || 0; },
  domainMilitiaMoralePenalty(domain){ return window.ACKS.militiaDomainMoralePenalty(this.currentCampaign, domain) || 0; },
  domainTrainedMilitiaCreditText(domain){ const c = window.ACKS.domainTrainedMilitiaCredit(this.currentCampaign, domain) || 0; return c > 0 ? ('garrison credit ' + c.toLocaleString() + 'gp (trained militia at home, RR p.341)') : ''; },
  levyUnitLiving(u){ return Math.max(0, (u.count || 0) - (u.casualties || 0)); },
  // The unit's CURRENT monthly wage cost: a militia standing down at home draws no wages (RR p.432),
  // so it costs 0 while home (its trained+equipped gp value still credits the garrison separately —
  // RR p.341, see domainTrainedMilitiaCredit). Everything else costs living × wage.
  levyUnitCurrentCost(u){ if(!u) return 0; if(u.calledUp === false) return 0; return this.levyUnitLiving(u) * (u.monthlyWage || 0); },
  // Divide a levy into units (organize for training) — proportional casualty split; keeps source/home/calledUp.
  domainSplitLevy(domain, unit){
    if(!domain || !unit) return;
    const cur = Number(unit.count || 0);
    if(cur <= 1){ alert('Cannot split a unit with fewer than 2 soldiers.'); return; }
    const ans = prompt('How many soldiers to split off into a new unit?\n(Currently ' + cur + '; new unit gets N, original keeps ' + cur + '−N)', Math.floor(cur / 2).toString());
    if(ans == null) return;
    const n = Math.floor(Number(ans));
    if(!Number.isFinite(n) || n < 1 || n >= cur){ alert('Invalid split count.'); return; }
    const A = window.ACKS;
    const nu = A.blankUnit({ displayName: unit.displayName, unitTypeKey: unit.unitTypeKey, race: unit.race, loadout: unit.loadout, veteran: unit.veteran, source: unit.source, count: n, monthlyWage: unit.monthlyWage, brPerSoldier: unit.brPerSoldier });
    nu.ownerDomainId = unit.ownerDomainId; nu.calledUp = unit.calledUp; nu.moraleAdjustment = unit.moraleAdjustment; nu.loyalty = unit.loyalty;
    const cas = Number(unit.casualties || 0); const splitCas = Math.round(cas * n / cur);
    nu.casualties = splitCas; unit.casualties = cas - splitCas; unit.count = cur - n;
    if(unit.calledUp === false) A.stationUnit(this.currentCampaign, nu, null);
    else A.stationUnit(this.currentCampaign, nu, { kind: 'domain-garrison', id: domain.id });
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Split ' + n + ' into a new unit.', 3000);
  },
  levyMergeSiblings(domain, unit){
    // exclude in-training units (their cohort is fixed until it completes — RR p.431; W7 timer)
    return this.domainLevyRows(domain, unit.source).filter(u => u !== unit && u.unitTypeKey === unit.unitTypeKey && !u.trainingState && !((u.musterPending || 0) > 0) && ((u.calledUp === false) === (unit.calledUp === false)));
  },
  canMergeLevy(domain, unit){ return !unit.trainingState && !((unit.musterPending || 0) > 0) && this.levyMergeSiblings(domain, unit).length > 0; },
  domainMergeLevy(domain, unit){
    const sibs = this.levyMergeSiblings(domain, unit);
    if(!sibs.length){ alert('No same-type sibling unit to merge into.'); return; }
    let target = sibs[0];
    if(sibs.length > 1){
      const choices = sibs.map((u, i) => (i + 1) + ') ' + (u.displayName || u.unitTypeKey) + ' — ' + this.levyUnitLiving(u) + ' living').join('\n');
      const ans = prompt('Merge into which sibling?\n' + choices + '\n(Enter number)', '1');
      if(ans == null) return;
      const idx = Math.floor(Number(ans)) - 1;
      if(!(idx >= 0 && idx < sibs.length)){ alert('Invalid selection.'); return; }
      target = sibs[idx];
    }
    target.count = (target.count || 0) + (unit.count || 0);
    target.casualties = (target.casualties || 0) + (unit.casualties || 0);
    window.ACKS.disbandUnit(this.currentCampaign, unit);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('Merged into ' + (target.displayName || target.unitTypeKey) + '.', 3000);
  },
  // Garrison table — ALL of the domain's standing (non-levy) military units, in a field army or not
  // (2026-06-16): the master campaign.units[] resolving to this domain (so a unit mustered or marching
  // to an army still shows) ∪ the nested garrison mirror (belt-and-suspenders), deduped by id. Levies
  // live in the Conscript/Militia tables below. The engine garrison-adequacy helpers stay mirror-only.
  garrisonStandingUnits(domain){
    const camp = this.currentCampaign; if(!domain) return [];
    const A = window.ACKS; const byId = new Map();
    if(camp && Array.isArray(camp.units) && A && A.unitOwnerDomainId){
      for(const u of camp.units){ if(u && u.source !== 'conscript' && u.source !== 'militia' && A.unitOwnerDomainId(camp, u) === domain.id) byId.set(u.id, u); }
    }
    for(const u of (A && A.domainGarrisonUnits ? A.domainGarrisonUnits(camp, domain) : [])){ if(u && u.source !== 'conscript' && u.source !== 'militia' && !byId.has(u.id)) byId.set(u.id, u); }
    return [...byId.values()];
  },
  removeGarrisonUnit(domain, u){
    if(this.unitIsDeployed(u)){ this.showToast && this.showToast('This unit is with a field army — remove it through the army (Characters ▸ Parties).', 3500); return; }
    // Remove via the canonical setter (single-home, T6 — campaign.units[]).
    window.ACKS.disbandUnit(this.currentCampaign, u);
    this.markDirty(); this.schedulePersist();
  },

  // ─── #541 Event Wizard methods (2026-05-30) ───
  emitWizardKindOptions(){
    const A = window.ACKS;
    return (A && A.wizardEmittableKinds) ? A.wizardEmittableKinds() : [];
  },
  emitWizardOnKindChange(){
    const A = window.ACKS;
    if(!this.emitWizardKind || !A || !A.defaultPayloadFor){ this.emitWizardPayloadJson = '{}'; return; }
    try { this.emitWizardPayloadJson = JSON.stringify(A.defaultPayloadFor(this.emitWizardKind), null, 2); }
    catch(err){ this.emitWizardPayloadJson = '{}'; }
  },
  emitWizardSchemaSummary(){
    const A = window.ACKS;
    if(!A || !A.EVENT_SCHEMAS) return '';
    const schema = A.EVENT_SCHEMAS[this.emitWizardKind];
    if(!schema) return '(no schema)';
    const r = Object.keys(schema.R || {});
    const o = Object.keys(schema.O || {});
    return 'Required: [' + r.join(', ') + '] · Optional: [' + o.join(', ') + ']';
  },
  emitWizardPayloadValid(){ try { JSON.parse(this.emitWizardPayloadJson); return true; } catch(e){ return false; } },
  emitWizardPayloadHint(){
    if(!this.emitWizardKind) return '';
    try { const p = JSON.parse(this.emitWizardPayloadJson); return '✓ Valid JSON · ' + Object.keys(p).length + ' fields'; }
    catch(e){ return '✗ Invalid JSON: ' + e.message; }
  },
  emitWizardRelatedValid(){ try { const r = JSON.parse(this.emitWizardCtxRelatedJson || '[]'); return Array.isArray(r); } catch(e){ return false; } },
  emitWizardCanSubmit(){
    if(!this.emitWizardKind) return false;
    if(!this.emitWizardPayloadValid()) return false;
    if(!this.emitWizardRelatedValid()) return false;
    return true;
  },
  emitWizardSubmitDisabledReason(){
    if(!this.emitWizardKind) return 'Pick an event kind first';
    if(!this.emitWizardPayloadValid()) return 'Fix the payload JSON';
    if(!this.emitWizardRelatedValid()) return 'Fix the related-entities JSON (must be an array)';
    return '';
  },
  emitWizardSubmitSummary(){
    if(!this.emitWizardKind) return 'No event kind picked';
    return 'Will emit a "' + this.emitWizardKind + '" event with cadence ' + this.emitWizardCadence;
  },
  emitWizardSubmit(){
    if(!this.emitWizardCanSubmit()) return;
    const A = window.ACKS;
    if(!A || !A.newEvent){ alert('Engine not loaded'); return; }
    try {
      const payload = JSON.parse(this.emitWizardPayloadJson);
      const related = JSON.parse(this.emitWizardCtxRelatedJson || '[]');
      const ev = A.newEvent(this.emitWizardKind, {
        payload: payload,
        gmNotes: this.emitWizardNotes,
        cadence: this.emitWizardCadence,
        targetTurn: (this.currentCampaign && this.currentCampaign.currentTurn) || 1
      });
      if(A.setEventContext){
        A.setEventContext(ev, {
          primaryHexId: this.emitWizardCtxHexId || null,
          settlementId: this.emitWizardCtxSettlementId || null,
          domainId: this.emitWizardCtxDomainId || null,
          relatedEntities: related
        });
      }
      this.currentCampaign.pendingEvents = this.currentCampaign.pendingEvents || [];
      this.currentCampaign.pendingEvents.push(ev);
      this.showToast && this.showToast('Event emitted: ' + this.emitWizardKind + ' (id=' + ev.id + '). Resolve from Event Log.', 4000);
      this.emitWizardReset();
    } catch(err){ alert('Failed to emit: ' + (err && err.message || err)); }
  },
  emitWizardReset(){
    this.emitWizardKind = '';
    this.emitWizardPayloadJson = '{}';
    this.emitWizardCtxHexId = '';
    this.emitWizardCtxSettlementId = '';
    this.emitWizardCtxDomainId = '';
    this.emitWizardCtxRelatedJson = '[]';
    this.emitWizardNotes = '';
    this.emitWizardCadence = 'monthly-turn';
  },


  // Phase 2.7 World — UI state for the World view
  worldSubView:'map', // 'map' | 'hexes' | 'poi' | 'rumors' | 'religion' (UI overhaul 2026-06-22 — Domains/Stashes/Lairs/Dungeons moved out)
  // ── 📋 Review tab (2026-06-13) — the GM work queue: sub-view + the Pending Events cursors ──
  reviewSubView: 'pending-events',   // 'pending-events' | 'domain-review' | 'encounters' | 'battles'
  // ── 🏰 Monthly Turn tab (2026-06-22) — the monthly Turn Resolution, split into sub-tabs.
  // The whole month stages the turn (no explicit "stage" gate); the proposal auto-stages on
  // entering the tab. 'domains' = economics + events | 'construction' = building projects +
  // the urban/agricultural investments | 'investments' = ventures + their vagaries | 'lifestyle'.
  monthlyTurnSubView: 'domains',
  reviewDayOffset: 0,                // Daily Events calendar cursor — days relative to today
  reviewMonthOffset: 0,              // Monthly Events calendar cursor — months relative to this month
  reviewShowRoutine: false,          // include campaignLogHidden chatter in Daily Events
  _nextMonthIntent: false,           // "Next month ▶" clicked: chain the day-commit into staging the turn
  worldHexSearch:'',
  worldHexFilter:'all', // 'all' | 'settled' | 'lairs' | 'dungeons' | 'unexplored'
  worldHexEditing:null, // {domainId, hexIndex} for the hex detail modal
  showHexDetailModal:false,
  // Phase 2.8 Rumors — sub-tab filter state. Cross-settlement view of every rumor in the world.
  rumorFilter:{ topic:'', apparent:'', truth:'', settlementId:'', search:'' },
  rumorAddTarget:'',   // bound to the "Add rumor at" picker; cleared after add

  // The list of World sub-tabs. Order (#225, 2026-06-02): Map, Domains, Hexes, then Rumors.
  // Map + Domains were promoted from top-level tabs into World sub-views. Rumors only appears
  // when rumors-manual is on. (Hexes uses ⬡ since Map now owns the 🗺 glyph.)
  // ═══ Phase 3 Military — 🎖 Muster Army (the in-fiction ACTION verb) ═══════════
  // A character raises a field force from the troops he controls. Launched from the
  // character sheet (Retainers), a domain's Military tab (commander = ruler, garrison
  // pre-checked), and the Armies view header. Engine: ACKS.createArmy stations the
  // roster + a Main Body division (RR p.435); validateArmyOrganization's findings show
  // as advisory hints. The Inspector Create ▸ Army is the free-form ADMIN-verb sibling.
  // ─── Garrison reaction (2026-06-14) — deploy a force to meet a domain incursion (JJ pp.104–106) ───
  // The ⚔ Deploy modal: pick the force + a commander (the ruler may lead) + a rally point (the
  // domain seat by default), see a live force-vs-band BR preview + the predicted RAW outcome, and
  // muster + march via ACKS.deployGarrisonReaction. Launched from the domain incursion box + the
  // Military-tab Active-Threats table.
  openGarrisonDeploy(opts={}){
    if(!this.currentCampaign){ alert('Open a campaign first.'); return; }
    const camp = this.currentCampaign;
    const band = (camp.groups || []).find(g => g && g.id === opts.groupId);
    if(!band || !band.incursion){ if(this.showToast) this.showToast('No live band to deploy against.'); return; }
    const domainId = band.incursion.domainId;
    const dom = (camp.domains || []).find(d => d && d.id === domainId) || null;
    const rallyHexId = (window.ACKS.domainSeatHexId ? window.ACKS.domainSeatHexId(camp, dom) : '') || '';
    const commanderId = (dom && dom.rulerCharacterId) || '';
    // pre-check the domain's garrison units that have living troops (the default sally)
    const preIds = (camp.units || []).filter(u => u && u.stationedAt && u.stationedAt.kind === 'domain-garrison'
      && u.stationedAt.id === domainId && Math.max(0, (u.count || 0) - (u.casualties || 0)) > 0).map(u => u.id);
    this.garrisonDeployForm = { groupId: opts.groupId, domainId, commanderId, rallyHexId, stance: 'offensive', unitIds: preIds };
    this.garrisonDeployOpen = true;
  },
  garrisonDeployBand(){ return (this.currentCampaign && (this.currentCampaign.groups || []).find(g => g && g.id === this.garrisonDeployForm.groupId)) || null; },
  garrisonDeployHexOptions(){
    const camp = this.currentCampaign, did = this.garrisonDeployForm.domainId;
    return ((camp && camp.hexes) || []).filter(h => h && h.domainId === did)
      .map(h => ({ id: h.id, label: (window.ACKS.hexName ? hexLabelFor(h) : (h.name || h.id)) }));
  },
  // Free units the GM may field, each marked at-the-rally (falls in now) or marching-in (called up).
  garrisonDeployUnits(){
    const camp = this.currentCampaign; if(!camp) return [];
    const rally = this.garrisonDeployForm.rallyHexId || null;
    return ((camp.units) || []).filter(u => u && Math.max(0, (u.count || 0) - (u.casualties || 0)) > 0
        && !(u.stationedAt && u.stationedAt.kind === 'army') && !(u.musterState && u.musterState.destination))
      .map(u => {
        const origin = window.ACKS.unitCurrentHexId ? window.ACKS.unitCurrentHexId(camp, u) : null;
        const atRally = !origin || !rally || origin === rally;
        let days = null;
        if(!atRally && window.ACKS.computeJourneyDistance){
          try {
            const d = window.ACKS.computeJourneyDistance(camp, { startHexId: origin, destinationHexId: rally, participantCharacterIds: [], covered: 0, currentDayIndex: 0 });
            const spd = window.ACKS.unitMarchMilesPerDay ? window.ACKS.unitMarchMilesPerDay(u) : 24;
            days = spd > 0 ? Math.ceil((d.total || 0) * (window.ACKS.JOURNEY_MILES_PER_HEX || 6) / spd) : null;
          } catch(e){ days = null; }
        }
        return { unit: u, home: this._unitHomeLabel(u), atRally, days };
      });
  },
  garrisonDeployPresentIds(){ const ids = this.garrisonDeployForm.unitIds || []; return this.garrisonDeployUnits().filter(r => ids.includes(r.unit.id) && r.atRally).map(r => r.unit.id); },
  garrisonDeployCallUpIds(){ const ids = this.garrisonDeployForm.unitIds || []; return this.garrisonDeployUnits().filter(r => ids.includes(r.unit.id) && !r.atRally).map(r => r.unit.id); },
  garrisonDeployPreview(){
    if(!this.currentCampaign || !this.garrisonDeployForm.groupId || !window.ACKS.garrisonReactionPreview) return null;
    return window.ACKS.garrisonReactionPreview(this.currentCampaign, this.garrisonDeployForm.groupId, this.garrisonDeployForm.unitIds || []);
  },
  // The army-organization advisory for the force being assembled (RR pp.435–437) — the up-front
  // twin of the army card's armyOrgFindings, so a sub-strength sally is flagged before deploying.
  garrisonDeployOrgFindings(){
    if(!this.currentCampaign || !this.garrisonDeployForm.groupId || !window.ACKS.reactionForceOrgFindings) return [];
    return window.ACKS.reactionForceOrgFindings(this.currentCampaign, {
      unitIds: this.garrisonDeployForm.unitIds || [],
      commanderCharacterId: this.garrisonDeployForm.commanderId || null
    }).map(f => f.text);
  },
  // RAW (JJ p.103, RR p.452): a deliberate sally requires the ruler to have DETECTED the band.
  // An undetected incursion (rulerAware===false; undefined defaults to aware) offers no Deploy /
  // 🎌-battle affordance — the garrison can't march on a threat it hasn't located.
  rulerUnawareOfBand(g){ return !!(g && g.incursion && g.incursion.rulerAware === false); },
  garrisonDeployCanSubmit(){ return !this.rulerUnawareOfBand(this.garrisonDeployBand()) && !!(this.garrisonDeployForm.rallyHexId && (this.garrisonDeployForm.unitIds || []).length); },
  garrisonDeploySubmit(){
    if(!this.garrisonDeployCanSubmit()) return;
    const f = this.garrisonDeployForm;
    const band = this.garrisonDeployBand();
    const dom = (this.currentCampaign.domains || []).find(d => d && d.id === f.domainId) || null;
    const r = window.ACKS.deployGarrisonReaction(this.currentCampaign, {
      groupId: f.groupId, unitIds: this.garrisonDeployPresentIds(), callUpUnitIds: this.garrisonDeployCallUpIds(),
      commanderCharacterId: f.commanderId || null, rallyHexId: f.rallyHexId || null, stance: f.stance || 'offensive',
      name: ((dom && dom.name) || 'Domain') + ' reaction force'
    });
    if(!r || !r.ok){ if(this.showToast) this.showToast('Could not deploy — ' + ((r && r.reason) || 'check the force')); return; }
    this.markDirty(); this.schedulePersist();
    this.garrisonDeployOpen = false;
    this.currentView = 'roster'; this.rosterSubView = 'groups'; this.selectGroup('army', r.army.id);
    if(this.showToast) this.showToast('⚔ Deployed against ' + (band ? band.name : 'the band') + (r.journey ? ' — marching to meet them.' : ' — engaging.'));
  },
  // The Military-tab threats-table preview: the band vs the domain's whole garrison (the default
  // force), → the likely outcome at a glance (JJ p.104).
  domainGarrisonUnitIds(d){
    const camp = this.currentCampaign; if(!camp || !d) return [];
    return ((camp.units) || []).filter(u => u && u.stationedAt && u.stationedAt.kind === 'domain-garrison'
      && u.stationedAt.id === d.id && Math.max(0, (u.count || 0) - (u.casualties || 0)) > 0).map(u => u.id);
  },
  threatReactionPreview(g){
    if(!this.currentCampaign || !g || !g.incursion || !window.ACKS.garrisonReactionPreview) return null;
    const d = (this.currentCampaign.domains || []).find(x => x && x.id === g.incursion.domainId) || null;
    if(!d) return null;
    return window.ACKS.garrisonReactionPreview(this.currentCampaign, g.id, this.domainGarrisonUnitIds(d));
  },
  openMusterArmy(opts={}){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    const camp = this.currentCampaign;
    const commanderId = opts.commanderId || '';
    const cmdr = commanderId ? (camp.characters||[]).find(c => c && c.id === commanderId) : null;
    // default hex: the commander's current hex, else (domain launch) that domain's first hex
    let hexId = (cmdr && cmdr.currentHexId) || '';
    const domainId = opts.domainId || '';
    if(!hexId && domainId){
      const dh = (camp.hexes||[]).find(h => h && h.domainId === domainId);
      if(dh) hexId = dh.id;
    }
    const defName = cmdr ? (cmdr.name + "'s Army") : '';
    // pre-check: a domain launch stages that domain's garrison; else the commander's own company
    let preIds = [];
    if(domainId){
      preIds = (camp.units||[]).filter(u => u && u.stationedAt && u.stationedAt.kind === 'domain-garrison' && u.stationedAt.id === domainId && Math.max(0,(u.count||0)-(u.casualties||0)) > 0).map(u => u.id);
    } else if(commanderId){
      preIds = (camp.units||[]).filter(u => u && u.stationedAt && u.stationedAt.kind === 'character' && u.stationedAt.id === commanderId && Math.max(0,(u.count||0)-(u.casualties||0)) > 0).map(u => u.id);
    }
    this.musterArmyForm = { commanderId, name: defName, _autoName: defName, hexId, stance: 'defensive', unitIds: preIds, _domainId: domainId };
    this.musterArmyOpen = true;
  },
  // Candidate commanders — every living character (RAW: any character can command, subject
  // to scale quals which the findings surface), EXCEPT those already leading another army (a
  // character commands one army at a time). The current selection (currentId) is always kept,
  // so a pre-seated commander never drops out of its own list. Sorted by name.
  musterCommanderOptions(currentId){
    const camp = this.currentCampaign;
    const leading = new Set(((camp && camp.armies) || [])
      .filter(a => a && a.status !== 'disbanded' && a.leaderCharacterId && a.leaderCharacterId !== currentId)
      .map(a => a.leaderCharacterId));
    return ((camp && camp.characters) || [])
      .filter(c => c && c.alive !== false && !leading.has(c.id))
      .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },
  // Keep the muster army name in step with the commander — but ONLY while the GM hasn't typed
  // their own. We stash the last auto-generated name in _autoName; if the field still equals it
  // the GM hasn't diverged, so re-derive "<leader>'s Army". Once they edit it, name ≠ _autoName
  // and a leader change leaves their name untouched.
  musterSyncName(){
    const f = this.musterArmyForm; if(!f) return;
    if(f.name === (f._autoName || '')){
      const cmdr = this.musterCommander();
      const def = cmdr ? (cmdr.name + "'s Army") : '';
      f.name = def; f._autoName = def;
    }
  },
  musterCommander(){
    const id = this.musterArmyForm.commanderId; if(!id) return null;
    return ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id) || null;
  },
  musterLeadership(){
    const c = this.musterCommander(); if(!c || !window.ACKS.leadershipAbility) return 0;
    return window.ACKS.leadershipAbility(c);
  },
  musterHexOptions(){
    return ((this.currentCampaign && this.currentCampaign.hexes) || [])
      .filter(h => h && h.id)
      .map(h => ({ id: h.id, label: (window.ACKS.hexName ? hexLabelFor(h) : (h.name || h.id)) + (h.domainId ? '' : ' · unclaimed') }));
  },
  // Free units the GM may pull under this commander: any first-class unit with living
  // troops not already in an army (and not already rallying elsewhere), labelled with its
  // current home + whether it is AT the muster point (joins now) or must MARCH IN (with a
  // distance preview — the hard-constraint, no-teleport model). RAW leaves "whose troops
  // you may muster" to the GM, so the list is permissive.
  musterAvailableUnits(){
    const camp = this.currentCampaign; if(!camp) return [];
    return ((camp.units) || [])
      .filter(u => u && Math.max(0,(u.count||0)-(u.casualties||0)) > 0 && !(u.stationedAt && u.stationedAt.kind === 'army') && !(u.musterState && u.musterState.destination))
      .map(u => { const eta = this._musterUnitEta(u); return { unit: u, home: this._unitHomeLabel(u), atMuster: eta.atMuster, eta }; });
  },
  // Distance preview from a unit's hex to the muster point (no journey yet): at the muster
  // point (joins now), or N hexes / M miles / ~D days away (it would march in).
  _musterUnitEta(u){
    const camp = this.currentCampaign; const A = window.ACKS;
    const origin = (A.unitCurrentHexId) ? A.unitCurrentHexId(camp, u) : null;
    const dest = this.musterArmyForm.hexId || null;
    if(!origin || !dest || origin === dest) return { atMuster: true, hexes: 0, miles: 0, days: 0 };
    let hexes = null, miles = null, days = null;
    if(A.computeJourneyDistance){
      try {
        const d = A.computeJourneyDistance(camp, { startHexId: origin, destinationHexId: dest, participantCharacterIds: [], covered: 0, currentDayIndex: 0 });
        hexes = d.total || 0; miles = hexes * (A.JOURNEY_MILES_PER_HEX || 6);
        const spd = (A.unitMarchMilesPerDay) ? A.unitMarchMilesPerDay(u) : 24;
        days = (spd > 0) ? Math.ceil(miles / spd) : null;
      } catch(e){ hexes = null; }
    }
    return { atMuster: false, hexes, miles, days };
  },
  _musterSelectedRows(){ const ids = this.musterArmyForm.unitIds || []; return this.musterAvailableUnits().filter(r => ids.includes(r.unit.id)); },
  _musterPresentUnits(){ return this._musterSelectedRows().filter(r => r.atMuster).map(r => r.unit); },
  _musterCallUpRows(){ return this._musterSelectedRows().filter(r => !r.atMuster); },
  // Troops/BR/scale count only the units PRESENT at the muster point — the strength that
  // forms up at once; called-up units march in and join on arrival.
  musterTroops(){ return this._musterPresentUnits().reduce((s, u) => s + Math.max(0,(u.count||0)-(u.casualties||0)), 0); },
  musterBr(){
    const camp = this.currentCampaign;
    return this._musterPresentUnits().reduce((s, u) => s + (window.ACKS.unitBattleRating ? window.ACKS.unitBattleRating(camp, u) : 0), 0);
  },
  musterScaleLabel(){
    const n = this.musterTroops();
    return (window.ACKS.armyScaleForSize ? window.ACKS.armyScaleForSize(n) : 'company');
  },
  musterIncomingCount(){ return this._musterCallUpRows().length; },
  musterIncomingEta(){ const ds = this._musterCallUpRows().map(r => r.eta && r.eta.days).filter(d => typeof d === 'number'); return ds.length ? Math.max.apply(null, ds) : null; },
  // Advisory RAW findings (RR p.435) computed for the in-progress selection — the muster
  // is never blocked on them (GM-overridable waiver), they just guide.
  musterFindings(){
    const out = [];
    const n = (this.musterArmyForm.unitIds || []).length;
    if(!this.musterArmyForm.commanderId) out.push('No commander set — an army needs a leader (RR p.435).');
    else if(this.musterLeadership() < 1) out.push((this.musterCommander()?.name || 'The commander') + ' has Leadership 0 — cannot field a division (RR p.435). Override at the GM\'s discretion.');
    if(n > 0 && n < 3) out.push('An army should have at least 3 units (RR p.435) — ' + n + ' selected.');
    return out;
  },
  musterCanSubmit(){ return !!(this.musterArmyForm.name && this.musterArmyForm.name.trim()); },
  // Source/type tag for the muster picker so conscript/militia units read clearly.
  musterUnitSourceTag(u){
    if(!u) return '';
    if(u.source === 'conscript') return ' · ⚒ conscript' + (u.unitTypeKey === 'untrained-levy' ? ' (untrained)' : '');
    if(u.source === 'militia') return ' · 🛡 militia' + (u.unitTypeKey === 'untrained-levy' ? ' (untrained)' : '') + (u.calledUp === false ? ' · stood down' : '');
    return '';
  },
  musterArmySubmit(){
    if(!this.musterCanSubmit()) return;
    const f = this.musterArmyForm;
    // Hard constraint, no teleport: units AT the muster point fall in now; distant units are
    // CALLED UP and march in (createArmy plots their rally journeys).
    const present = this._musterPresentUnits().map(u => u.id);
    const callUp = this._musterCallUpRows().map(r => r.unit.id);
    const army = window.ACKS.createArmy(this.currentCampaign, {
      name: f.name.trim(),
      leaderCharacterId: f.commanderId || null,
      currentHexId: f.hexId || null,
      strategicStance: f.stance || 'defensive',
      unitIds: present,
      callUpUnitIds: callUp
    });
    // A militia mustered into an army is "called up" — the domain revenue/morale penalty follows it
    // out of the fields (RR p.432). Flip the flag on every militia in the muster (present + called-up).
    [...present, ...callUp].forEach(id => { const u = window.ACKS.findUnit(this.currentCampaign, id); if(u && u.source === 'militia') u.calledUp = true; });
    this.markDirty(); this.schedulePersist();
    this.musterArmyOpen = false;
    // jump to the merged Parties view focused on the new army (§12 Group model)
    this.currentView = 'roster'; this.rosterSubView = 'groups'; this.selectGroup('army', army.id);
    const troops = (window.ACKS.armyTroopCount ? window.ACKS.armyTroopCount(this.currentCampaign, army) : 0);
    if(this.showToast) this.showToast('🎖 ' + (army.name || 'Army') + ' mustered — ' + troops.toLocaleString() + ' troops' + (callUp.length ? (', ' + callUp.length + ' marching in') : '') + '. Steer it here.');
  },

  // ═══ Phase 3 Military W4 — World ▸ 🎖 Armies (the campaign layer) ═══════════
  // The view is a read surface over the maneuvers engine (acks-engine-maneuvers.js);
  // every write goes through an engine verb or commitStatEdit (gm-fiat). The Day
  // Clock's slot-88 military consumer does the campaign cycle itself.
  armiesRows(){
    const camp = this.currentCampaign; if(!camp) return [];
    const A = window.ACKS;
    return (camp.armies || []).filter(Boolean).map(a => {
      const troops = A.armyTroopCount(camp, a);
      const prof = A.armyMarchProfile(camp, a);
      const j = a.journeyId ? A.findJourney(camp, a.journeyId) : null;
      const marching = j && j.status === 'in-transit';
      const hex = (camp.hexes || []).find(h => h && h.id === a.currentHexId) || null;
      const leader = (camp.characters || []).find(c => c && c.id === a.leaderCharacterId) || null;
      return {
        army: a, troops,
        br: A.armyBattleRating(camp, a),
        leaderName: leader ? leader.name : '—',
        location: hex ? (A.hexName ? hexLabelFor(hex) : hex.id) : '—',
        speed: prof.milesPerDay,
        icon: a.pillage ? '🔥' : (marching ? '🧭' : (troops > 0 ? '🎖' : '🏚')),
        state: a.pillage ? 'pillaging' : (marching ? ('marching → ' + this.hexLabelById(j.destinationHexId)) : (troops > 0 ? 'in the field' : 'no troops')),
        fatigued: A.armyFatigued(camp, a).fatigued
      };
    });
  },
  // Active field armies of THIS domain (Domains ▸ Military) — armies in the field that draw on it:
  // a unit owned by this domain (unitOwnerDomainId), the ruler commanding in person, or a reaction
  // force defending one of the domain's incursion bands. Reuses armiesRows() so the columns match
  // the Characters ▸ Parties Armies table; filtered to genuinely-fielded forces (husks hidden).
  domainFieldArmyRows(domain){
    if(!domain || !this.currentCampaign) return [];
    const camp = this.currentCampaign, A = window.ACKS;
    const rulerId = (this.rulerCharacter(domain) || {}).id || null;
    const bandIds = new Set((this.incursionBands(domain) || []).map(g => g.id));
    const belongs = (a) => {
      if(!a) return false;
      if(rulerId && a.leaderCharacterId === rulerId) return true;
      if(a.reactionTargetGroupId && bandIds.has(a.reactionTargetGroupId)) return true;
      const units = (A.armyUnits ? A.armyUnits(camp, a) : []);
      return units.some(u => u && A.unitOwnerDomainId && A.unitOwnerDomainId(camp, u) === domain.id);
    };
    return this.armiesRows().filter(r => belongs(r.army) && (r.troops > 0 || r.army.journeyId || r.army.reactionTargetGroupId));
  },
  // RR p.434 — the realm's standing-army capacity readout (the Military tab summary). Derived; no stored field.
  realmStandingArmy(domain){
    if(!domain || !this.currentCampaign) return null;
    try { return window.ACKS.realmStandingArmyCapacity(this.currentCampaign, domain); } catch(e){ return null; }
  },
  hexLabelById(hexId){
    const h = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(x => x && x.id === hexId);
    return h ? (window.ACKS.hexName ? hexLabelFor(h) : h.id) : (hexId || '—');
  },
  // ── Add / remove a garrison unit from a field army (the Garrison-table membership verbs, 2026-06-17) ──
  // Field armies standing at this unit's current hex — the "Add to army" candidates (RAW: a unit
  // joins an army it's co-located with; troops don't teleport — the army-card call-up marches
  // distant ones in). Empty when the unit is already in an army or no army is here, so the row
  // only shows "Add to army" when it's actually doable.
  armiesAtUnitHex(u){
    const camp = this.currentCampaign, A = window.ACKS;
    if(!camp || !u || !A || !A.armiesAtHex || !A.unitCurrentHexId || this.unitIsDeployed(u)) return [];
    const hex = A.unitCurrentHexId(camp, u);
    return hex ? A.armiesAtHex(camp, hex) : [];
  },
  // "🎖 Add to army": one co-located army → join now; several → the chooser modal; none → not offered.
  addUnitToArmyUi(u){
    const armies = this.armiesAtUnitHex(u);
    if(!armies.length){ this.showToast && this.showToast('No field army stands here to join.', 3000); return; }
    if(armies.length === 1){ this._doAddUnitToArmy(u, armies[0].id); return; }
    this.addToArmyModal = { open: true, unitId: u.id, hexId: window.ACKS.unitCurrentHexId(this.currentCampaign, u) };
  },
  addToArmyChoices(){
    const camp = this.currentCampaign, m = this.addToArmyModal, A = window.ACKS;
    return (camp && m && m.open && A && A.armiesAtHex) ? A.armiesAtHex(camp, m.hexId) : [];
  },
  addToArmyUnit(){
    const camp = this.currentCampaign, m = this.addToArmyModal;
    if(!camp || !m || !m.unitId) return null;
    return (window.ACKS && window.ACKS.findUnit) ? window.ACKS.findUnit(camp, m.unitId) : ((camp.units || []).find(u => u && u.id === m.unitId) || null);
  },
  confirmAddToArmy(armyId){
    const u = this.addToArmyUnit();
    this.addToArmyModal = { open: false, unitId: null, hexId: null };
    if(u) this._doAddUnitToArmy(u, armyId);
  },
  _doAddUnitToArmy(u, armyId){
    const A = window.ACKS; if(!A || !A.addUnitToArmy) return;
    const r = A.addUnitToArmy(this.currentCampaign, u, armyId);
    if(r && r.ok){ this.markDirty(); this.schedulePersist(); this.showToast && this.showToast('🎖 ' + (u.displayName || 'Unit') + ' joined ' + ((r.army && r.army.name) || 'the army') + '.', 3000); }
    else { this.showToast && this.showToast('Could not add to army' + (r && r.reason ? ' (' + r.reason + ')' : '') + '.', 3000); }
  },
  // "🏸 Leave army": detach the unit where the army stands (or cancel its call-up if still marching in).
  removeUnitFromArmyUi(u){
    const A = window.ACKS; if(!A || !A.removeUnitFromArmy) return;
    const r = A.removeUnitFromArmy(this.currentCampaign, u);
    if(r && r.ok){
      this.markDirty(); this.schedulePersist();
      const msg = r.cancelledRally
        ? ('Call-up cancelled — ' + (u.displayName || 'unit') + ' returned home.')
        : ('🏸 ' + (u.displayName || 'Unit') + ' left ' + ((r.army && r.army.name) || 'the army') + (r.leftAtHexId ? ' (now at ' + this.hexLabelById(r.leftAtHexId) + ')' : '') + '.');
      this.showToast && this.showToast(msg, 3500);
    } else { this.showToast && this.showToast('Could not remove from army' + (r && r.reason ? ' (' + r.reason + ')' : '') + '.', 3000); }
  },
  // "🚶 Muster to…": open the modal to pick a destination hex. The muster is abstract (~1 week) — no
  // origin / pace / distance; the unit takes up its post when the muster completes.
  openMarchModal(u){
    if(!u) return;
    this.marchModal = { open: true, unitId: u.id, destHexId: '' };
  },
  marchModalUnit(){
    const camp = this.currentCampaign, m = this.marchModal;
    if(!camp || !m || !m.unitId) return null;
    return (window.ACKS && window.ACKS.findUnit) ? window.ACKS.findUnit(camp, m.unitId) : ((camp.units || []).find(u => u && u.id === m.unitId) || null);
  },
  // 🗺 choose-from-map: hide the modal, pick a hex on the map, reopen with the destination set.
  marchPickDest(){
    if(!this.marchModal || !this.marchModal.unitId) return;
    this.marchModal.open = false;
    this.mapBeginSelect(hexId => { this.marchModal.destHexId = hexId || ''; this.marchModal.open = true; }, 'Click the destination hex for the muster, then ✓ confirm.');
  },
  submitUnitMarch(){
    const A = window.ACKS, m = this.marchModal;
    if(!A || !A.musterUnitToDestination || !m || !m.unitId || !m.destHexId) return;
    const u = this.marchModalUnit();
    A.musterUnitToDestination(this.currentCampaign, u, { kind: 'hex', id: m.destHexId });
    this.marchModal = { open: false, unitId: null, destHexId: '' };
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('🚶 ' + ((u && u.displayName) || 'Unit') + ' musters to its post — it arrives in ~1 week (advance the Day Clock).', 4000);
  },
  // "✖ Cancel muster": recall a unit mid-muster back to its garrison (returnUnitHome).
  cancelUnitMusterUi(u){
    const A = window.ACKS; if(!A || !A.returnUnitHome || !u) return;
    A.returnUnitHome(this.currentCampaign, u);
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast('✖ Muster cancelled — ' + ((u.displayName) || 'the unit') + ' returns to its garrison.', 3500);
  },

  // ═══ Phase 3 Military W3 — Review ▸ 🎌 Battles (moved from World ▸ 2026-06-13) + the battle panel ═══════════
  // The panel is the step-walking surface over acks-engine-battles.js (the encounter-panel
  // pattern at army scale): setup (zones, commanders, missile/loose ticks — DIRECT working-
  // state edits; the battle isn't live until ⚔ Begin, which emits battle-started) →
  // fighting (forays + ▶ battle turns + withdrawal) → aftermath review → apply.
  allBattles(){ return (this.currentCampaign && this.currentCampaign.battles) || []; },
  activeBattlesFiltered(){
    const q = (this.battlesSearch || '').trim().toLowerCase();
    return this.allBattles().filter(b => b && b.status !== 'resolved')
      .filter(b => !q || (b.name || '').toLowerCase().includes(q) || (b.hexId || '').toLowerCase().includes(q))
      .slice().reverse();
  },
  pastBattlesFiltered(){
    const q = (this.battlesSearch || '').trim().toLowerCase();
    return this.allBattles().filter(b => b && b.status === 'resolved')
      .filter(b => !q || (b.name || '').toLowerCase().includes(q) || (b.hexId || '').toLowerCase().includes(q))
      .slice().reverse();
  },
  openBattlePanel(id){ this.battlePanelId = id; this.battlePanelOpen = true; this.battleForayDraft = null; this.battleHeroDraft = null; },
  closeBattlePanel(){ this.battlePanelOpen = false; },
  openBattleWizard(prefill){
    const p = prefill || {};
    this.battleWizard = {
      hexId: p.hexId || '', name: '',
      sourceA: p.sourceA || '', stanceA: p.stanceA || 'defensive',
      sourceB: p.sourceB || '', stanceB: p.stanceB || 'offensive',
      awareness: p.awareness || 'mutual',
      scale: p.scale || 'company',
      asymmetry: p.asymmetry != null ? p.asymmetry : false,
      advantageousTerrain: '',
      scoped: !!p.scoped   // scoped = launched from a force at a hex: Side A + hex are fixed, Side B is hex-scoped
    };
    this.goToReview('battles');   // 2026-06-13 — Battles live under 📋 Review
  },

  get worldSubTabs(){
    // UI overhaul 2026-06-22 — Map · Hexes · Points of Interest · Religion. Domains is promoted to a
    // top-level tab; the located-POI collections (Stashes / Lairs / Dungeons) are absorbed by the
    // combined Points-of-Interest view; Religion is re-homed here from a top-level tab.
    const tabs = [
      { id:'map',   label:'🗺 Map',   count: null },
      { id:'hexes', label:'⬡ Hexes',  count: null },
      { id:'poi',   label:'📍 Points of Interest',
        count: ((this.currentCampaign?.lairs?.length||0) + (this.currentCampaign?.dungeons?.length||0) + (this.currentCampaign?.stashes?.length||0)) || null },
    ];
    if(this.isHouseRuleEnabled('rumors-manual')){
      tabs.push({ id:'rumors', label:'🗣 Rumors', count: this.allRumors.length || null });
    }
    tabs.push({ id:'religion', label:'⛪ Religion', count: (this.currentCampaign?.congregations||[]).length || null });
    return tabs;
  },

  // ── 📜 Events sub-tabs (UI overhaul 2026-06-22 — was the 📋 Review tab). Daily Events | Monthly
  // Events | Event Log | Emit Event | Chronicle | Construction | Encounters | Battles | Sieges. The
  // internal view id stays 'review'. Domain Review is promoted to its own top-level 'domain-turn'
  // tab; Emit Event + Chronicle were promoted from the old nested eventsSubView toggle (under Event
  // Log) to their own top-level sub-tabs, and the redundant Campaign Log was retired (the Event Log
  // shows everything). Daily Events holds day-scale effects; Monthly Events the domain-turn events.
  get reviewSubTabs(){
    const c = this.currentCampaign;
    let dueM = 0, blk = 0, enc = 0, btl = 0, sie = 0;
    const loggedEv = (c?.eventLog?.length) || 0;
    try { dueM = c ? (window.ACKS.eventsTargetingTurn(c, c.currentTurn || 1) || []).length : 0; } catch(e){}
    try { blk = c ? (window.ACKS.dailyAdvanceBlockers(c) || []).length : 0; } catch(e){}
    try { enc = (window.ACKS.activeEncounters(c) || []).length; } catch(e){}
    try { btl = (window.ACKS.activeBattles(c) || []).length; } catch(e){}
    try { sie = (window.ACKS.activeSieges(c) || []).length; } catch(e){}   // Military W6 (burst3)
    // Construction moved to the 🏰 Monthly Turn tab (2026-06-22) — no longer an Events sub-tab.
    return [
      { id:'pending-events', label:'📥 Daily Events',   count: (blk + (this.dayTickProposal ? 1 : 0)) || null },
      { id:'monthly-events', label:'📅 Monthly Events', count: (dueM + (this.turnProposal ? 1 : 0)) || null },
      { id:'event-log',      label:'📜 Event Log',      count: loggedEv || null },
      { id:'emit-wizard',    label:'📨 Emit Event',     count: null },
      { id:'chronicle',      label:'📝 Chronicle',      count: null },
      { id:'encounters',     label:'⚔ Encounters',      count: enc || null },
      { id:'battles',        label:'🎌 Battles',        count: btl || null },
      { id:'sieges',         label:'🏯 Sieges',         count: sie || null }
    ];
  },

  // ── 🏰 Monthly Turn sub-tabs (2026-06-22). Domains (economics + events) | Construction (the
  // building projects + the urban/agricultural investments lifted out of the per-domain cards) |
  // Investments (in-transit ventures + their vagaries) | Lifestyle (living expenses + wages).
  get monthlyTurnSubTabs(){
    let cons = 0, lifx = 0, ventx = 0, syndx = 0;
    try { cons = this.allConstructionProjects().length; } catch(e){}
    try { lifx = (this.turnLivingExpenseProposal && this.turnLivingExpenseProposal.ruleOn) ? (this.turnLivingExpenseProposal.charges||[]).length : 0; } catch(e){}
    try { ventx = (this.turnVentureProposals||[]).length; } catch(e){}
    try { syndx = (this.turnSyndicateTributeProposal && this.turnSyndicateTributeProposal.ruleOn) ? (this.turnSyndicateTributeProposal.collections||[]).length : 0; } catch(e){}
    return [
      { id:'domains',      label:'🏰 Domains',      count: (this.turnProposal||[]).length || null },
      { id:'construction', label:'🏗 Construction', count: cons || null },
      { id:'investments',  label:'🌊 Investments',  count: ventx || null },
      { id:'syndicates',   label:'🗡 Syndicates',   count: syndx || null },
      { id:'lifestyle',    label:'🏠 Lifestyle',    count: lifx || null }
    ];
  },

  // (Foundation #193) Aggregated cross-settlement rumor list — flattens each rumor's reach[]
  // into one row per (rumor, settlement) pair so the table can show "this rumor heard at
  // this settlement at this apparent level". A rumor with reach[] of three settlements
  // produces three table rows.
  get allRumors(){
    const out = [];
    const camp = this.currentCampaign;
    if(!camp || !Array.isArray(camp.rumors)) return out;
    camp.rumors.forEach(r => {
      const reach = Array.isArray(r.reach) ? r.reach : [];
      if(reach.length === 0){
        // Campaign-scoped rumor (no settlements) — render one synthetic row.
        out.push({ rumor: r, reachEntry: null, settlement: null, hex: null, domain: null });
        return;
      }
      reach.forEach(rch => {
        const settlement = (camp.settlements||[]).find(s => s.id === rch.settlementId);
        const hex = settlement ? (camp.hexes||[]).find(h => h.id === settlement.hexId) : null;
        const domain = hex && hex.domainId ? this.domains.find(d => d.id === hex.domainId) : null;
        out.push({ rumor: r, reachEntry: rch, settlement: settlement, hex: hex, domain: domain });
      });
    });
    return out;
  },

  // Filter the aggregated list against the current rumorFilter state.
  filteredRumors(){
    const f = this.rumorFilter;
    return this.allRumors.filter(entry => {
      const r = entry.rumor;
      const apparent = entry.reachEntry ? entry.reachEntry.apparentLevel : null;
      if(f.topic && r.topic !== f.topic) return false;
      if(f.apparent && apparent !== f.apparent) return false;
      if(f.truth && r.truthLevel !== f.truth) return false;
      if(f.settlementId && (!entry.settlement || entry.settlement.id !== f.settlementId)) return false;
      if(f.search){
        const q = f.search.toLowerCase();
        const settlementName = entry.settlement?.name || '';
        const domainName = entry.domain?.name || '';
        const blob = (r.text + ' ' + r.topic + ' ' + (apparent||'') + ' ' + r.truthLevel + ' ' + settlementName + ' ' + domainName + ' ' + (r.notes||'')).toLowerCase();
        if(!blob.includes(q)) return false;
      }
      return true;
    });
  },

  // (Foundation #193) Spread a rumor to every OTHER settlement in the same domain by
  // adding new reach[] entries on the existing top-level rumor — no duplication.
  // New reach entries arrive at one apparent-tier more obscure than the source entry.
  // Idempotent: settlements already in reach[] are skipped.
  // The function resolves the settlement → hex → domain chain inline so it doesn't depend on
  // the entry's pre-computed `.domain` field (which can be null in edge cases) — every failure
  // path surfaces a toast so the GM knows why nothing happened.
  spreadRumorToNeighbors(entry){
    if(!entry || !entry.rumor){ this.showToast('Spread: no rumor selected.', 3000); return; }
    if(!entry.settlement){ this.showToast('Spread: campaign-scoped rumors have no home settlement to spread from.', 3500); return; }
    if(!entry.reachEntry){ this.showToast('Spread: this rumor has no reach entry at any settlement.', 3500); return; }
    const ACKS = window.ACKS;
    const camp = this.currentCampaign;
    const r = entry.rumor;
    const sourceSettlement = entry.settlement;
    // Resolve hex → domain freshly (don't rely on entry.domain being pre-resolved)
    const hex = (camp?.hexes||[]).find(h => h.id === sourceSettlement.hexId);
    if(!hex){ this.showToast('Spread: source settlement "'+sourceSettlement.name+'" has no hex link (hexId='+sourceSettlement.hexId+').', 4000); return; }
    if(!hex.domainId){ this.showToast('Spread: source hex has no domain (wilderness). Nothing to spread to.', 3500); return; }
    // Find every other settlement in the same domain
    const domainSettlements = ACKS.settlementsForDomain(camp, hex.domainId);
    const others = domainSettlements.filter(s => s.id !== sourceSettlement.id);
    if(others.length === 0){
      this.showToast('Spread: no other settlements in this domain. Nothing to spread to.', 3500);
      return;
    }
    const downgrade = { 'common':'uncommon', 'uncommon':'rare', 'rare':'obscure', 'obscure':'obscure' };
    const newLevel = downgrade[entry.reachEntry.apparentLevel] || 'obscure';
    const reachedIds = new Set((r.reach||[]).map(x => x.settlementId));
    const currentTurn = camp?.currentTurn || 1;
    let spread = 0;
    others.forEach(s => {
      if(reachedIds.has(s.id)) return;
      ACKS.addRumorReach(r, s.id, newLevel, currentTurn, null);
      spread++;
    });
    if(spread > 0){
      if(!Array.isArray(r.history)) r.history = [];
      r.history.push({ turn: currentTurn, event: 'spread', note: 'Spread from '+sourceSettlement.name+' to '+spread+' neighbor'+(spread===1?'':'s')+' at apparent '+newLevel });
      this.showToast('Rumor spread to '+spread+' neighbor'+(spread===1?'':'s')+' (apparent: '+newLevel+').', 3500);
    } else {
      this.showToast('Spread: all other settlements in this domain already carry this rumor.', 3500);
    }
  },

  // (Foundation #193) Manual add — creates a new top-level rumor with a single reach entry
  // pointing at the chosen settlement. Default apparent level is uncommon; GM can edit inline.
  addRumorAtSettlement(settlementId){
    if(!settlementId || !this.currentCampaign) return;
    const camp = this.currentCampaign;
    if(!Array.isArray(camp.rumors)) camp.rumors = [];
    const settlement = (camp.settlements||[]).find(s => s.id === settlementId);
    if(!settlement) return;
    const ACKS = window.ACKS;
    const turn = camp.currentTurn || 1;
    const r = ACKS.blankRumor({
      text: '',
      apparentLevel: 'uncommon',
      truthLevel: 'unknown',
      topic: 'other',
      origin: {
        submittedAt: new Date().toISOString(),
        submittedBy: 'gm',
        sourceEventId: null,
        sourceCharacterId: null
      }
    });
    // blankRumor predates the reach[] shape — strip its apparentLevel field and use reach instead.
    delete r.apparentLevel;
    r.reach = [{ settlementId: settlement.id, apparentLevel: 'uncommon', gainedAtTurn: turn, distortedText: null }];
    if(!Array.isArray(r.history)) r.history = [];
    r.history.push({ turn: turn, event: 'created', note: 'Manually added at '+settlement.name });
    camp.rumors.push(r);
  },

  // (Foundation #193) Delete a rumor — fully removes the top-level entry. To remove a rumor
  // from one settlement only (leaving it heard elsewhere), use unhearRumorAtSettlement.
  deleteRumor(entry){
    if(!entry || !entry.rumor || !this.currentCampaign) return;
    const where = entry.settlement ? entry.settlement.name : '(campaign-scope)';
    if(!confirm('Delete this rumor entirely? It will disappear from every settlement in its reach. (Heard at '+where+'.)')) return;
    this.currentCampaign.rumors = (this.currentCampaign.rumors||[]).filter(r => r.id !== entry.rumor.id);
  },

  // Remove this rumor's reach from a single settlement without deleting the rumor.
  unhearRumorAtSettlement(entry){
    if(!entry || !entry.rumor || !entry.settlement) return;
    window.ACKS.removeRumorReach(entry.rumor, entry.settlement.id);
    if((entry.rumor.reach||[]).length === 0){
      if(!confirm('That was the last settlement carrying this rumor. Delete the rumor entirely?')) return;
      this.currentCampaign.rumors = (this.currentCampaign.rumors||[]).filter(r => r.id !== entry.rumor.id);
    }
  },

  // (Foundation #193) Flat list of {id,label} for rumor pickers. Now reads from top-level
  // campaign.settlements via the engine's settlement→hex→domain chain.
  get rumorSettlementOptions(){
    const out = [];
    const camp = this.currentCampaign;
    if(!camp || !Array.isArray(camp.settlements)) return out;
    camp.settlements.forEach(s => {
      const hex = (camp.hexes||[]).find(h => h.id === s.hexId);
      const domain = hex && hex.domainId ? this.domains.find(d => d.id === hex.domainId) : null;
      const domainLabel = domain ? domain.name : (hex ? '(wilderness)' : '(unbound)');
      out.push({ id: s.id, label: s.name + ' · ' + domainLabel });
    });
    return out;
  },
  // Phase 2b — UI state for the Ventures view
  venturesSubView:'active', // 'active' | 'history' | 'venturers' | 'passive' | 'reference'
  // UI overhaul 2026-06-22 — Roster sub-view (was charactersSubView; values roster→characters,
  // parties→groups) + Domains sub-view. The Characters view is now Roster ▸ Characters.
  rosterSubView:'characters', // 'characters' | 'monsters' | 'groups' | 'settlements' | 'ships' | 'npc-generators' | 'knowledge'
  domainsSubView:'domains',   // 'domains' | 'governance'
  // World ▸ Points of Interest (B1) — which POI tables to show + the claimed/unclaimed scope filter.
  poiShow: { lairs:true, dungeons:true, stashes:true },
  poiScopeFilter: 'all',      // 'all' | 'domains' (claimed) | 'unclaimed' (wilderness)
  // Roster ▸ Monsters bestiary (B3) filter state.
  bestiarySearch: '', bestiaryTypeFilter: 'all',
  // Roster ▸ Settlements sheet (B2) + Activities ▸ Market sheet (B5) modal selection.
  settlementSheetId: null,
  settlementSheetTab: 'overview',   // Overview | Demographics | Demand (UI overhaul 2026-06-22)
  marketSheetSearch: '', marketSheetCategory: 'all',
  // §12 Group model — the merged "Parties" view selection (one detail open at a time).
  groupSelKind: null,        // null | 'party' | 'army' | 'unit'
  partySelectedId: null,
  // Party creation (redesigned 2026-06-02): a party is started by a founding character
  // and named after them; others join from the same hex. character.partyId stays the
  // single source of membership truth.
  newPartyPickerOpen:false,
  newPartyFounderId:'',
  // Activities top panel (Phase 2.5 prep, #477) — the Activities dashboard (#346 AB-3) leads,
  // then Travel (Journeys) + Ventures + placeholders for Hijinks / Spell Research. Landing
  // sub-view matches the first tab.
  activitiesSubView: 'activities',
  get activitiesSubTabs(){
    // UI overhaul 2026-06-22 — Market / Banking / Magic Items added; Gladiators re-homed here (conditional).
    const tabs = [
      { id:'activities',     label:'📋 Activities',    ready: true,  count: (this.currentCampaign?.characters||[]).filter(c => c && (window.ACKS?.isActive ? window.ACKS.isActive(c) : (c.lifecycleState||'active')==='active' && c.alive!==false)).length, placeholderNote: '' },
      { id:'journeys',       label:'⛺ Travel',        ready: true,  count: (this.currentCampaign?.journeys||[]).filter(j=>j && ['planning','in-transit','resting','lost'].includes(j.status)).length, placeholderNote: '' },
      { id:'banking',        label:'🏦 Banking',       ready: true,  count: (((this.currentCampaign?.loans||[]).filter(l => l && l.status === 'active').length) + ((this.currentCampaign?.bankAccounts||[]).length)) || null, placeholderNote: '' },
      { id:'magic-items',    label:'🪄 Magic Items',   ready: true,  count: (this.currentCampaign?.notableItems||[]).length || null, placeholderNote: '' },
      { id:'ventures',       label:'⚖ Ventures',       ready: true,  count: (this.currentCampaign?.ventures||[]).length, placeholderNote: '' },
      { id:'recruit',        label:'⚔ Recruit',        ready: true,  count: (this.currentCampaign?.characters||[]).reduce((n,c)=> n + ((c && c.recruitmentDrives||[]).filter(d=>d&&d.status==='active').length), 0) || null, placeholderNote: '' },
      { id:'hijinks',        label:'🗡 Hijinks',       ready: true,  count: ((this.currentCampaign?.hijinks)||[]).filter(h=>h && !['complete','failed','caught'].includes(h.status)).length || null, placeholderNote: '' },
      { id:'spell-research', label:'📜 Spell Research', ready: false, count: null, placeholderNote: 'Phase 4.6' }
    ];
    if(this.gladiatorsTabVisible())
      tabs.push({ id:'gladiators', label:'🏟 Gladiators', ready: true, count: (this.currentCampaign?.gladiatorSchools||[]).length || null, placeholderNote: '' });
    return tabs;
  },
  // UI overhaul 2026-06-22 — Roster sub-tabs: Characters · Monsters · Groups · Settlements · Ships ·
  // NPC Generators (+ Knowledge when the knowledge-tracking rule is on).
  get rosterSubTabs(){
    const tabs = [
      { id:'characters',     label:'👤 Characters',     count: (this.currentCampaign?.characters||[]).filter(c=>c && c.alive!==false).length || null },
      { id:'monsters',       label:'🐉 Monsters',       count: (window.ACKS?.MONSTER_CATALOG?.length) || null },
      { id:'groups',         label:'🧭 Groups',         count: (this.currentCampaign?.parties?.length) || null },
      { id:'settlements',    label:'🏘 Settlements',    count: (this.currentCampaign?.settlements?.length) || null },
      { id:'ships',          label:'⛵ Ships',          count: (this.currentCampaign?.vessels?.length) || null },
      { id:'npc-generators', label:'🧙 NPC Generators', count: ((this.currentCampaign?.characters||[]).filter(c=>c&&c.generated).length) || null },
    ];
    if(this.isHouseRuleEnabled('knowledge-tracking'))
      tabs.push({ id:'knowledge', label:'📚 Knowledge', count: (this.currentCampaign?.lore?.length) || null });
    return tabs;
  },
  // UI overhaul 2026-06-22 — Domains sub-tabs: Domains (+ Governance/Senate, dormant-until-used).
  get domainsSubTabs(){
    const tabs = [ { id:'domains', label:'🏰 Domains', count: (this.domains||[]).length || null } ];
    if(this.campaignHasSenate() || this.governanceTabAvailable())
      tabs.push({ id:'governance', label: this.campaignHasSenate() ? '🏛 Senate' : '⚖ Governance', count: (this.currentCampaign?.senates||[]).length || null });
    return tabs;
  },
  // ════════ UI overhaul 2026-06-22 — helpers for the new Roster/World/Activities/Events surfaces ════════
  // B1 — World ▸ Points of Interest scope filter (claimed vs unclaimed hexes).
  _poiHexClaimed(hexId){ if(!hexId) return false; const h=(this.currentCampaign?.hexes||[]).find(x=>x&&x.id===hexId); return !!(h && h.domainId); },
  _poiScopeOk(hexId){ if(this.poiScopeFilter==='all') return true; if(!hexId) return false; const claimed=this._poiHexClaimed(hexId); return this.poiScopeFilter==='domains' ? claimed : !claimed; },
  poiStashes(){ return this.filteredStashes().filter(r => this._poiScopeOk(r && r.stash && r.stash.hexId)); },
  poiDungeons(){ return this.filteredDungeons().filter(d => this._poiScopeOk(d && d.hexId)); },
  poiLairs(){ return this.filteredLairs().filter(l => this._poiScopeOk(l && l.hexId)); },
  // B3 — Roster ▸ Monsters bestiary (the MONSTER_CATALOG reference table).
  bestiaryRows(){ let l=(window.ACKS&&window.ACKS.MONSTER_CATALOG)||[]; if(this.bestiaryTypeFilter!=='all') l=l.filter(m=>(m.creatureTypes||[]).includes(this.bestiaryTypeFilter)); const q=(this.bestiarySearch||'').trim().toLowerCase(); if(q) l=l.filter(m=>(((m.name||'')+' '+(m.key||'')).toLowerCase().includes(q))); return l; },
  bestiaryTypeOptions(){ const s=new Set(); ((window.ACKS&&window.ACKS.MONSTER_CATALOG)||[]).forEach(m=>(m.creatureTypes||[]).forEach(t=>s.add(t))); return ['all',...[...s].sort()]; },
  // B2 — Roster ▸ Settlements sheet. Reuses the demographic-roster body by driving demoSettlementId.
  openSettlementSheet(id){ this.settlementSheetId=id; this.demoSettlementId=id; this.settlementSheetTab='overview'; },
  closeSettlementSheet(){ this.settlementSheetId=null; this.demoSettlementId=null; },
  settlementSheet(){ const id=this.settlementSheetId; if(!id) return null; return (this.currentCampaign?.settlements||[]).find(s=>s&&s.id===id)||null; },
  settlementSheetHex(){ const st=this.settlementSheet(); if(!st||!st.hexId) return null; return (this.currentCampaign?.hexes||[]).find(h=>h && h.id===st.hexId)||null; },
  // B4 — Roster ▸ Ships location label (hexLabelFor is a global helper).
  vesselHexLabel(v){ if(!v||!v.hexId) return '—'; const h=(this.currentCampaign?.hexes||[]).find(x=>x&&x.id===v.hexId); return h ? hexLabelFor(h) : '—'; },
  // B5 — Settlement sheet ▸ Market tab: per-settlement item availability (reuses the trade engine).
  _marketClassIdx(mc){ if(typeof mc!=='string') return 5; const k=mc.replace('*',''); return ({I:0,II:1,III:2,IV:3,V:4,VI:5})[k] ?? 5; },
  marketAvailLabelFor(mc, priceGp){ try { const a=window.ACKS.equipmentAvailability(priceGp, this._marketClassIdx(mc), {visitedBefore:false,partyOf12Dedicated:false}); return this.tradeAvailLabel(a); } catch(e){ return '—'; } },
  marketSheetItems(){ let l=(window.ACKS&&window.ACKS.EQUIPMENT_CATALOG)||[]; if(this.marketSheetCategory!=='all') l=l.filter(e=>e&&e.category===this.marketSheetCategory); const q=(this.marketSheetSearch||'').trim().toLowerCase(); if(q) l=l.filter(e=>(e.name||'').toLowerCase().includes(q)); return l; },
  marketCategoryOptions(){ const s=new Set(); ((window.ACKS&&window.ACKS.EQUIPMENT_CATALOG)||[]).forEach(e=>{ if(e&&e.category) s.add(e.category); }); return ['all',...[...s].sort()]; },
  // B6 — Events ▸ Construction: every domain's in-progress projects joined to its domain.
  allConstructionProjects(){
    const camp=this.currentCampaign; if(!camp) return [];
    const list=Array.isArray(camp.projects)?camp.projects:[];
    return list
      .filter(p=>p && p.lifecycleState==='under-construction' && p.constructibleKind!=='agricultural-improvement')
      .map(p=>{ const dom=p.ownerDomainId?(this.domains||[]).find(d=>d.id===p.ownerDomainId):null;
        let forecast=null; try{ forecast=this.domainProjectForecast(p); }catch(e){}
        return { project:p, domainName: dom?(dom.name||dom.id):'—', forecast }; });
  },
  // Legacy: anything that sets currentView='ventures' now redirects through Activities > Ventures sub-tab.
  redirectLegacyVenturesNav(){
    if(this.currentView === 'ventures'){
      this.currentView = 'activities';
      this.activitiesSubView = 'ventures';
    }
  },
  // #447 — Faceted Roster filter. Four parallel axes intersect with AND.
  // Default lifecycleState:'active' hides deceased/retired by default
  // (replacing the old charactersShowDeceased checkbox, which was opt-in).
  charactersFilter: {
    controlledBy:   'all',  // 'all' | 'player' | 'gm'
    socialTier:     'all',  // 'all' | 'independent' | 'henchman' | 'specialist' | 'follower' | 'hireling' | 'mercenary'
    lifecycleState: 'active', // 'all' | 'active' | 'candidate' | 'departed' | 'imprisoned' | 'dominated' | 'deceased'
    creatureType:   'all'   // 'all' | one of the MM categories (single-tag intersect; multi-select v2)
  },
  charactersSearch:'',
  // Roster ▸ Characters — the row the GM has clicked to populate the selected-character action box
  // above the table (transient UI selection; not persisted). null ⇒ the box shows its pick-one hint.
  selectedCharacterId: null,
  showCharacterEditorModal:false,
  characterEditorTab:'identity', // 'identity' | 'stats' | 'skills' | 'inventory' | 'background' | 'location' | 'history'
  characterEditing:null,         // the character being edited (direct reference, edits apply live)
  characterEditingHistoryNote:'',// scratch buffer for the History tab's note entry
  characterEditingIsNew:false,   // true when creating; false when editing existing

  // Roll Loyalty modal (RR p.168). Shared by manual button + Event Log resolve.
  showLoyaltyRollModal: false,
  loyaltyRollState: null,        // { characterId, character (ref), reason, reasonNote, modifier, rollResult, pendingEventId }

  // Record Calamity modal (RR p.166 + p.165). Emits a 'hireling-calamity'
  // event (immediately applied to ledger + history; auto-emits a follow-on
  // pending 'loyalty-check' event the GM resolves via the Roll Loyalty modal).
  showCalamityModal: false,
  calamityModalState: null,      // { characterId, character (ref), kind, reasonNote, severity, newEmployerCharacterId }

  // Recruit sub-tab workflow (Phase 2.95 §4.2 / §310.3f).
  // null = inactive; object = workflow in progress. See recruitStart()
  // for shape. The workflow runs ON the campaign (individuated candidates
  // get pushed to currentCampaign.characters as kind='candidate'), so the
  // GM can save mid-flow and a half-recruited session is durable.
  charactersSubViewRecruitDefault: 'roster',
                                  // Alpine tracks it cleanly across x-if rerenders)

  // Filtered roster respecting kind / deceased / search.
  // §310.3f-fix6 — 'all' now excludes kind=candidate by default. Pick the
  // 'Candidate' option explicitly to view in-progress recruitment NPCs.
  filteredCharacters(){
    // §310.3f-fix13 reverts fix11: transient candidates no longer live in
    // camp.characters at all, so no special-case filtering is needed. If a
    // kind='candidate' record IS in the campaign, it's a real persisted
    // candidate and should appear in 'all'.
    const list = (this.currentCampaign?.characters||[]);
    const search = (this.charactersSearch||'').toLowerCase().trim();
    const f = this.charactersFilter;
    return list.filter(c => {
      // Control axis
      if(f.controlledBy !== 'all'){
        const isPlayer = ACKS.isPlayerControlled(c);
        if(f.controlledBy === 'player' && !isPlayer) return false;
        if(f.controlledBy === 'gm' && isPlayer) return false;
      }
      // Social tier axis — use predicates (canonical accessors w/ legacy fallback)
      if(f.socialTier !== 'all'){
        let tierMatch = false;
        if(f.socialTier === 'henchman')        tierMatch = ACKS.isHenchman(c);
        else if(f.socialTier === 'specialist') tierMatch = ACKS.isSpecialist(c);
        else if(f.socialTier === 'follower')   tierMatch = ACKS.isFollower(c);
        else if(f.socialTier === 'hireling')   tierMatch = ACKS.isHireling(c);
        else if(f.socialTier === 'mercenary')  tierMatch = ACKS.isMercenaryOfficer(c);
        else if(f.socialTier === 'independent') tierMatch = !ACKS.isRetainer(c);
        if(!tierMatch) return false;
      }
      // Lifecycle axis — predicates
      if(f.lifecycleState !== 'all'){
        let lifeMatch = false;
        if(f.lifecycleState === 'active')          lifeMatch = ACKS.isActive(c);
        else if(f.lifecycleState === 'candidate')  lifeMatch = ACKS.isCandidate(c);
        else if(f.lifecycleState === 'departed')   lifeMatch = ACKS.isDeparted(c);
        else if(f.lifecycleState === 'imprisoned') lifeMatch = ACKS.isImprisoned(c);
        else if(f.lifecycleState === 'dominated')  lifeMatch = ACKS.isDominated(c);
        else if(f.lifecycleState === 'deceased')   lifeMatch = ACKS.isDeceased(c);
        if(!lifeMatch) return false;
      }
      // Creature type axis — multi-valued field; intersect (character passes if its types include the selected tag)
      if(f.creatureType !== 'all'){
        const types = Array.isArray(c.creatureTypes) ? c.creatureTypes : ['humanoid'];
        if(!types.includes(f.creatureType)) return false;
      }
      // Search
      if(search && !((c.name||'').toLowerCase().includes(search) || (c.class||'').toLowerCase().includes(search))) return false;
      return true;
    });
  },
  // #447 — reset all four facets to defaults + clear search.
  resetCharactersFilter(){
    this.charactersFilter = {
      controlledBy:   'all',
      socialTier:     'all',
      lifecycleState: 'active',
      creatureType:   'all'
    };
    this.charactersSearch = '';
  },
  // Lifetime gp (earnings ledger sum)
  characterLifetimeGp(c){return (c?.earningsLedger||[]).reduce((s,e)=>s+(e.gp||0),0);},
  // Domain ruled by this character (if any)
  characterRulesDomains(c){if(!c)return [];return (this.domains||[]).filter(d => d.rulerCharacterId === c.id);},

  // Patron / liege name for a character (henchman / specialist / follower / hireling).
  // Returns the patron's name, or null if no liege is set. Used by the Roster's
  // Roles column secondary tags to surface the relationship ("henchman of Aelric").
  characterPatronName(c){
    if(!c || !c.liegeCharacterId) return null;
    const patron = (this.currentCampaign?.characters||[]).find(p => p.id === c.liegeCharacterId);
    return patron?.name || null;
  },
  // Henchman command status for the selected-character box: how many active henchmen
  // this character commands, against the RR p.170 henchman cap. Mirrors the inline
  // count used by the Retainers tab + the domain Military card.
  characterHenchmenInfo(c){
    if(!c) return { count:0, cap:0, overCap:false };
    const A = window.ACKS;
    const count = (this.currentCampaign?.characters||[]).filter(x =>
      x && x.liegeCharacterId === c.id && A.isHenchman(x) && A.isActive(x)).length;
    const cap = c.henchmanCap || 4;
    return { count, cap, overCap: count > cap };
  },

  // Dismiss a magistrate from a domain post. Routes through:
  //  - Wave A endMagistracy (closes the relation with an 'ended' history entry)
  //  - commitStatEdit on the legacy domain.magistrates scalar (audit-logged)
  //  - clears administersThisMonth if it was set
  // The character itself is untouched — only the post-binding is severed.
  // (Magistrates stay with the domain on ruler succession; this is for explicit
  //  dismissal by the GM.)
  dismissMagistrate(domain, roleKey){
    if(!domain || !roleKey) return;
    const slot = domain.magistrates?.[roleKey];
    if(!slot || !slot.characterId) return;
    const charId = slot.characterId;
    const ch = (this.currentCampaign?.characters||[]).find(c => c.id === charId);
    const charName = ch?.name || charId;
    const roleLabel = (window.ACKS?.MAGISTRATE_ROLES||{})[roleKey]?.label || roleKey;
    if(!confirm('Dismiss ' + charName + ' from ' + roleLabel + ' of ' + (domain.name||'this domain') + '?')) return;

    // Wave A — end the magistracy relation (idempotent). Role keys in the
    // legacy scalar are camelCase; Wave A relations use kebab-case.
    const ROLE_MAP = {captainOfGuard:'captain-of-the-guard', chaplain:'chaplain', munerator:'munerator', steward:'steward'};
    const kebabRole = ROLE_MAP[roleKey] || roleKey;
    if(window.ACKS?.activeMagistracyOf && window.ACKS?.endMagistracy){
      const active = window.ACKS.activeMagistracyOf(this.currentCampaign, charId, domain.id, kebabRole);
      if(active) window.ACKS.endMagistracy(this.currentCampaign, active.id, this.currentCampaign.currentTurn || 1, 'dismissed-by-ruler');
    }

    // Clear legacy scalar via canonical commitStatEdit (audit-logged).
    this.commitStatEdit({
      entityType: 'domain', entityId: domain.id, entity: domain,
      fieldPath: 'magistrates.'+roleKey+'.characterId',
      label: roleLabel + ' dismissed (' + charName + ')',
      oldValue: charId, newValue: null
    });
    // Also clear administersThisMonth if it was set
    if(slot.administersThisMonth){
      this.commitStatEdit({
        entityType: 'domain', entityId: domain.id, entity: domain,
        fieldPath: 'magistrates.'+roleKey+'.administersThisMonth',
        label: roleLabel + ' admin flag cleared (post vacated)',
        oldValue: true, newValue: false
      });
    }
  },

  // ─── Activity projection (Architecture.md §3.11) ─────────────────────────
  // A multi-source derived view of "what is this character doing right now?".
  // Reads ventures, magistracy admin flags, ruler admin flags, and party membership;
  // returns a sorted array of {kind, icon, label, priority, deepLinkTo?}.
  //
  // Priority bands:
  //   1 — time-bounded engagements (ventures, future hijinks/expeditions/combat)
  //   2 — role posts actively performed this month (admin ticks)
  //   3 — ambient memberships (party, future Outpost residency, future faction seat)
  //
  // Rules:
  //   - Activity is derived, never stored (§3.3 reverse indices computed).
  //   - Activity is multi-valued (a character can be in many at once).
  //   - Activity is distinct from Roles (structural) and Location (geographic).
  //   - Empty array is fine; the rendering surface decides whether to show "idle".
  //
  // Subsystem contribution mandate (§3.11): any future subsystem that engages a
  // character must add a contributor block here as part of its delivery.
  characterActivities(c){
    if(!c) return [];
    const acts = [];

    // ── Contributor 1: Ventures (Priority 1) ────────────────────────────────
    // Destination label uses the same "(q,r) · Settlement · Domain" format as
    // Location, resolved from the destination domain's "primary hex" — preferred:
    // ruler's currentHexId; fallback: first hex with a settlement; fallback: first hex.
    const av = this.characterActiveVenture ? this.characterActiveVenture(c) : null;
    if(av && av.destinationDomainId){
      const destDomain = (this.domains||[]).find(x => x.id === av.destinationDomainId);
      const destName = destDomain?.name || '(unknown)';
      let destCoord = '';
      if(destDomain){
        const destHexes = domainHexesFor(destDomain);   // T6 single-home
        if(destDomain.rulerCharacterId){
          const ruler = (this.currentCampaign?.characters||[]).find(x => x.id === destDomain.rulerCharacterId);
          if(ruler?.currentHexId){
            const h = destHexes.find(hex => hex.id === ruler.currentHexId);
            if(h){
              const _s = settlementAtHexG(h); const setName = _s && _s.name;
              destCoord = window.ACKS.hexDisplayLabel(h.coord?.q||0, h.coord?.r||0) + (setName ? ' · ' + setName : '');
            }
          }
        }
        if(!destCoord){
          const settled = destHexes.find(h => settlementAtHexG(h));
          if(settled){
            const _s = settlementAtHexG(settled); const setName = _s && _s.name;
            destCoord = window.ACKS.hexDisplayLabel(settled.coord?.q||0, settled.coord?.r||0) + (setName ? ' · ' + setName : '');
          }
        }
        if(!destCoord && destHexes.length > 0){
          const h = destHexes[0];
          destCoord = window.ACKS.hexDisplayLabel(h.coord?.q||0, h.coord?.r||0);
        }
      }
      const dest = destCoord ? destCoord + ' · ' + destName : destName;
      if(av.status === 'in-transit'){
        acts.push({kind:'venture-transit', icon:'⛵', label:'on venture to ' + dest,
                   priority:1, deepLinkTo:{entity:'venture', id:av.id}});
      } else if(av.status === 'selling'){
        acts.push({kind:'venture-selling', icon:'⛵', label:'selling at ' + dest,
                   priority:1, deepLinkTo:{entity:'venture', id:av.id}});
      }
    }

    // ── Contributor 2: Role posts actively performed (Priority 2) ──────────
    // Ruler administering + magistrate administering, slot by slot.
    const mr = (typeof window !== 'undefined' && window.ACKS?.MAGISTRATE_ROLES) || {};
    (this.domains||[]).forEach(d => {
      if(d.administersThisMonth && d.rulerCharacterId === c.id){
        acts.push({kind:'ruling-admin', icon:'🏰', label:'ruling ' + d.name,
                   priority:2, deepLinkTo:{entity:'domain', id:d.id}});
      }
      ['captainOfGuard','chaplain','munerator','steward'].forEach(rk => {
        const slot = d.magistrates?.[rk];
        if(slot && slot.administersThisMonth && slot.characterId === c.id){
          const roleLabel = mr[rk]?.label || rk;
          acts.push({kind:'magistrate-admin:' + rk, icon:'⚖',
                     label:roleLabel + ' of ' + d.name,
                     priority:2, deepLinkTo:{entity:'domain', id:d.id}});
        }
      });
    });

    // ── Contributor 3: Party membership (Priority 3) ────────────────────────
    if(c.partyId){
      const party = (this.currentCampaign?.parties||[]).find(p => p.id === c.partyId);
      if(party){
        acts.push({kind:'party-member', icon:'🧭', label:'in party ' + (party.name || '(unnamed)'),
                   priority:3, deepLinkTo:{entity:'party', id:party.id}});
      }
    }

    // ── Contributor: Gladiator (🏟 training / ⚔ a scheduled bout) — Gladiators G3/G4 (team b10) ──
    if(c.socialTier === 'gladiator' && c.lifecycleState !== 'deceased'){
      const A = window.ACKS;
      const tInfo = (A && A.gladiatorTrainingInfo) ? A.gladiatorTrainingInfo(this.currentCampaign, c) : { inTraining:false };
      const inBout = (this.currentCampaign?.bouts||[]).some(b => b && b.status === 'scheduled' &&
        [].concat(b.sideA?.combatantIds||[], b.sideB?.combatantIds||[]).includes(c.id));
      if(tInfo.inTraining){
        acts.push({kind:'gladiator-training', icon:'🏟', label:'in gladiatorial training (' + tInfo.daysLeft + 'd left)', priority:2});
      } else if(inBout){
        acts.push({kind:'gladiator-bout', icon:'⚔', label:'fighting in the arena', priority:1, deepLinkTo:{view:'gladiators'}});
      } else if(c.lifecycleState === 'active'){
        const sch = c.contractSchoolId ? (this.currentCampaign?.gladiatorSchools||[]).find(s => s && s.id === c.contractSchoolId) : null;
        acts.push({kind:'gladiator', icon:'🏟', label:'a gladiator' + (sch ? ' of ' + (sch.name || 'the school') : ''), priority:2, deepLinkTo:{view:'gladiators'}});
      }
    }

    // ── Contributor 4: Journeys (Priority 1) — Phase 2.5 #475 ───────────────
    // An in-flight (or resting) Journey the character is participating in, OR one that TRAVELLED on the
    // current world day even if it has since ARRIVED / been stopped (Joachim 2026-06-08 — keep the
    // projection consistent with the Activities dashboard, which counts a journey's travel + forage on
    // its arrival day). lastTravelWorldOrd (turn*30 + day, commitJourneyRecord) is the day it last
    // travelled; === today ⇒ the party travelled (and foraged) today. A Day-Clock advance moves the clock
    // past the leg, so an arrived journey then drops out. Mode-discriminated icon per the Journeys plan §15.
    const _jTodayOrd = ((this.currentCampaign?.currentTurn || 1) * 30) + (this.currentCampaign?.currentDayInMonth || 1);
    const journeys = (this.currentCampaign?.journeys || [])
      .filter(j => {
        if(!j || !(j.participantCharacterIds || []).includes(c.id)) return false;
        if(j.status === 'in-transit' || j.status === 'resting') return true;
        return j.lastTravelWorldOrd != null && j.lastTravelWorldOrd === _jTodayOrd;   // travelled today, now ended
      });
    for(const j of journeys){
      const destLabel = this._journeyHexLabel(j.destinationHexId);
      const curLabel = this._journeyHexLabel(j.currentHexId);
      const dayN = (j.currentDayIndex || 0) + 1;
      const link = {entity:'journey', id:j.id};
      const endedToday = (j.status !== 'in-transit' && j.status !== 'resting');   // travelled today but arrived/stopped
      if(endedToday){
        // "What happened today" — the leg the party walked before the journey ended.
        if(j.status === 'arrived'){
          acts.push({kind:'journey-arrivedtoday:' + j.id, icon:'🥾', label:'travelled to ' + destLabel + ' today', priority:1, deepLinkTo:link});
        } else {
          acts.push({kind:'journey-stoppedtoday:' + j.id, icon:'🥾', label:'travelled to ' + curLabel + ' today', priority:1, deepLinkTo:link});
        }
      } else if(j.isLost){
        acts.push({kind:'journey-lost:' + j.id, icon:'🧭', label:'lost en route to ' + destLabel, priority:1, deepLinkTo:link});
      } else if(j.status === 'resting'){
        acts.push({kind:'journey-resting:' + j.id, icon:'⛺', label:'resting at ' + curLabel, priority:1, deepLinkTo:link});
      } else if((j.mode || '').startsWith('voyage-')){
        acts.push({kind:'journey-voyage:' + j.id, icon:'⛵', label:'voyaging to ' + destLabel + ' (day ' + dayN + ')', priority:1, deepLinkTo:link});
      } else if((j.mode || '').startsWith('aerial-')){
        acts.push({kind:'journey-aerial:' + j.id, icon:'🦅', label:'flying to ' + destLabel + ' (day ' + dayN + ')', priority:1, deepLinkTo:link});
      } else {
        acts.push({kind:'journey-overland:' + j.id, icon:'🥾', label:'on journey to ' + destLabel + ' (day ' + dayN + ')', priority:1, deepLinkTo:link});
      }
      // Foraging for water on the march — an ancillary activity riding in the travel day (RR p.272).
      // Shown when the party forages AND the current hex has no free water source (matches the
      // activity-budget contributor). Counts while underway OR travelled-today (then past-tense).
      if((j.status === 'in-transit' || endedToday) && j.forageWaterEnabled && !this.journeyHexSourcesWater(j)){
        acts.push({kind:'journey-forage:' + j.id, icon:'🌿', label: endedToday ? 'foraged for water today' : 'foraging for water', priority:3, deepLinkTo:link});
      }
    }

    // ── Contributor 5: Shopping TODAY (Item Trade IT-4) — the §8.9 mandate ──
    // A market-transaction is a singular act, not an ongoing state, so it surfaces as
    // "shopped" for the current game DAY (the budget counts it the same way — RAW refreshes
    // the activity allowance each day, so characterActivityBudget windows cost-tagged
    // market-transaction events by (appliedAtTurn, appliedAtDay)). One bounded pass over
    // eventLog, windowed + attributed exactly like the IT-3 budget reader (it refreshes on
    // the Day Clock). NB this is NOT the monthly 10× availability ceiling — that stays monthly.
    const _log = this.currentCampaign?.eventLog;
    if(Array.isArray(_log) && _log.length){
      const turn = this.currentCampaign.currentTurn || 1;
      const day  = this.currentCampaign.currentDayInMonth || 1;
      let units = 0;
      for(const entry of _log){
        const ev = entry && entry.event;
        if(!ev || ev.kind !== 'market-transaction') continue;
        const at = (entry.appliedAtTurn != null) ? entry.appliedAtTurn : ev.appliedAtTurn;
        if(at != null && at !== turn) continue;                          // this turn…
        const atDay = (entry.appliedAtDay != null) ? entry.appliedAtDay : ev.appliedAtDay;
        if(atDay !== day) continue;                                      // …and THIS game day (strict): a pre-update (un-day-stamped) errand isn't today's, so it's excluded — every new market-transaction is stamped in _logAppliedEvent

        const p = ev.payload || {};
        const mine = p.actorCharacterId === c.id || ((ev.context?.relatedEntities)||[]).some(r => r && r.kind === 'character' && r.id === c.id);
        if(!mine) continue;
        units += (p.activityCost && p.activityCost.units) || 1;
      }
      if(units > 0) acts.push({kind:'shopping', icon:'🛒', label:'shopped (' + units + ' ancillary errand' + (units === 1 ? '' : 's') + ')', priority:3});
    }

    // ── Contributor 6: Foraging / Hunting TODAY (Provisioning V4) — the §8.9 mandate ──
    // provisioning-activity events (forage = ancillary, hunt = dedicated), windowed to this game day
    // exactly like shopping. 🌿 foraged / 🏹 hunted (🌿 distinct from the journey 🥾). Auto water-fills
    // at a source carry no activityCost (free) → not counted.
    if(Array.isArray(_log) && _log.length){
      const turn = this.currentCampaign.currentTurn || 1;
      const day  = this.currentCampaign.currentDayInMonth || 1;
      let forageUnits = 0, hunted = false;
      for(const entry of _log){
        const ev = entry && entry.event;
        if(!ev || ev.kind !== 'provisioning-activity') continue;
        const at = (entry.appliedAtTurn != null) ? entry.appliedAtTurn : ev.appliedAtTurn;
        if(at != null && at !== turn) continue;
        const atDay = (entry.appliedAtDay != null) ? entry.appliedAtDay : ev.appliedAtDay;
        if(atDay !== day) continue;
        const p = ev.payload || {};
        const mine = p.actorCharacterId === c.id || ((ev.context?.relatedEntities)||[]).some(r => r && r.kind === 'character' && r.id === c.id);
        if(!mine || !p.activityCost) continue;                 // auto/free water has no cost → skip
        if(p.activity === 'hunt') hunted = true;
        else forageUnits += (p.activityCost.units || 1);
      }
      if(forageUnits > 0) acts.push({kind:'foraging', icon:'🌿', label:'foraged (' + forageUnits + ' ancillary errand' + (forageUnits === 1 ? '' : 's') + ')', priority:3});
      if(hunted) acts.push({kind:'hunting', icon:'🏹', label:'hunted (dedicated)', priority:2});
    }

    // ── Contributor 7: Recruitment drives (Priority 3) — R3, the §8.9 mandate ──
    // An active solicitation drive engages the patron for 1 ancillary/day per hireling type
    // (the activity budget counts it). Ongoing state on the patron (character.recruitmentDrives[]),
    // so it surfaces like a journey / role post — one chip per active drive. RR p.164. A drive also
    // solicited on the DAY IT COMPLETED — the week-3 reveal (startedDayOrd + 21) is the last of the 3
    // solicitation weeks, not a separate hiring day (Joachim 2026-06-08; matches characterActivityBudget),
    // so show it that one day then roll off. Recruit ordinal = (turn-1)*30 + day (startedDayOrd's convention).
    if(Array.isArray(c.recruitmentDrives)){
      const _recruitTodayOrd = ((this.currentCampaign?.currentTurn || 1) - 1) * 30 + (this.currentCampaign?.currentDayInMonth || 1);
      for(const d of c.recruitmentDrives){
        if(!d) continue;
        const completedToday = (d.status === 'complete' && d.startedDayOrd != null && (d.startedDayOrd + 21) === _recruitTodayOrd);
        if(d.status !== 'active' && !completedToday) continue;
        const wk = completedToday ? 3 : (d.weeksRevealed || 1);
        acts.push({kind:'recruiting:' + d.id, icon:'🤝',
                   label:'soliciting ' + (d.hireTypeLabel || d.hireTypeId || 'hirelings') + ' (week ' + wk + ' of 3)',
                   priority:3});
      }
    }

    // ── Contributor 8: Pursued (#476 E3c — the §8.9 mandate) ──
    // A pursuing encounter ('monster-pursuit') stalks this character's side: GM-facing
    // heads-up on the dashboard + sheet ("🐺 stalked — N mi behind"). The pursuer's own
    // descriptor waits for lair-leader Characters (v1 generates none).
    for(const e of (this.currentCampaign?.encounters || [])){
      if(!e || e.status !== 'active' || !e.pursuit || e.pursuit.status !== 'pursuing') continue;
      if(!((e.partySide && e.partySide.characterIds) || []).includes(c.id)) continue;
      acts.push({kind:'pursued:' + e.id, icon:'🐺',
                 label:'stalked by ' + (e.pursuit.pursuerLabel || 'a pursuer') + ' — ' + e.pursuit.gapMiles + ' mi behind',
                 priority:2});
    }

    // ── Contributor 9: Tracking (#476 E5 — the §8.9 mandate) ──
    // A live follow this character is part of (the tracker, or a traveller on the
    // steering journey): "🐾 tracking ‹band›". The journey's travel cost already meters
    // the day (#346 — pace capped at half, RR p.120).
    for(const e of (this.currentCampaign?.encounters || [])){
      const p = e && e.pursuit;
      if(!p || p.direction !== 'party' || p.status !== 'tracking') continue;
      const j = p.journeyId ? ((this.currentCampaign?.journeys || []).find(x => x && x.id === p.journeyId) || null) : null;
      const onIt = (p.trackerCharacterId === c.id) || (j && (j.participantCharacterIds || []).includes(c.id));
      if(!onIt) continue;
      acts.push({kind:'tracking:' + e.id, icon:'🐾',
                 label:'tracking ' + (p.quarryLabel || 'a quarry') + ((p.quarry && p.quarry.halted) ? ' (it has gone to ground)' : ''),
                 priority:2});
    }

    // ── Contributor 10: Military command (Phase 3 Military W1 — the §8.9 mandate) ──
    // Army leadership / division command / adjutancy / unit lieutenancy surface as
    // standing engagements (like role posts). On-campaign marching descriptors arrive
    // with W4 (armies move as journeys, so Contributor 4 will cover the march itself).
    for(const a of (this.currentCampaign?.armies || [])){
      if(!a) continue;
      const link = {entity:'army', id:a.id};
      if(a.leaderCharacterId === c.id){
        acts.push({kind:'army-leader:' + a.id, icon:'⚔', label:'commands ' + (a.name || 'an army'),
                   priority:2, deepLinkTo:link});
      }
      for(const dv of (a.divisions || [])){
        if(!dv) continue;
        if(dv.commanderCharacterId === c.id && a.leaderCharacterId !== c.id){
          acts.push({kind:'division-commander:' + a.id + ':' + (dv.name || ''), icon:'⚔',
                     label:'commands ' + (dv.name || 'a division') + ' of ' + (a.name || 'an army'),
                     priority:2, deepLinkTo:link});
        }
        if(dv.adjutantCharacterId === c.id){
          acts.push({kind:'division-adjutant:' + a.id + ':' + (dv.name || ''), icon:'⚔',
                     label:'adjutant of ' + (dv.name || 'a division') + ' (' + (a.name || 'army') + ')',
                     priority:2, deepLinkTo:link});
        }
      }
    }
    for(const u of (this.currentCampaign?.units || [])){
      if(!u || u.lieutenantCharacterId !== c.id) continue;
      acts.push({kind:'unit-lieutenant:' + u.id, icon:'🪖',
                 label:'lieutenant of ' + (u.displayName || u.unitTypeKey || 'a unit'),
                 priority:2, deepLinkTo:{entity:'unit', id:u.id}});
    }

    // ── Contributor 11: The Arcane Domain — sanctums + apprentices (Phase 4 Sanctums AD-B; §3.11/§8.9) ──
    // 🏛 keeping a sanctum + 🎓 tutoring apprentices (the master) / 📖 studying as an apprentice. Standing
    // engagements like role posts (RR p.386). The arcane-power / research descriptors are the Magic-Research
    // panel's; this is the sanctum-keeping + schooling side.
    const _Asanctum = window.ACKS || {};
    if(typeof _Asanctum.sanctumsOwnedBy === 'function'){
      for(const s of (_Asanctum.sanctumsOwnedBy(this.currentCampaign, c.id) || [])){
        acts.push({kind:'sanctum:' + s.id, icon:'🏛', label:'keeping ' + (s.name || 'a sanctum'),
                   priority:2, deepLinkTo:{entity:'constructible', id:s.id}});
        const roster = (typeof _Asanctum.sanctumRoster === 'function') ? _Asanctum.sanctumRoster(this.currentCampaign, s.id) : { apprentices: [] };
        const nA = (roster.apprentices || []).length;
        if(nA > 0) acts.push({kind:'tutoring:' + s.id, icon:'🎓',
                   label:'tutoring ' + nA + ' apprentice' + (nA === 1 ? '' : 's'),
                   priority:2, deepLinkTo:{entity:'constructible', id:s.id}});
      }
    }
    for(const a of ((this.currentCampaign?.apprenticeships) || [])){
      if(a && a.apprenticeCharacterId === c.id && (a.status == null || a.status === 'studying')){
        acts.push({kind:'apprentice:' + a.id, icon:'📖', label:'studying as an apprentice', priority:2});
      }
    }

    // ── Future contributors land here. Each adds zero or more descriptors. ──

    return acts.sort((a,b) => a.priority - b.priority || a.kind.localeCompare(b.kind));
  },

  // ─── Activities dashboard (#346 AB-3) — the visible read surface for the day budget ─────
  // The first Activities sub-tab: one row per active character with this game DAY's activity
  // budget (RAW 1 dedicated + 4 ancillary, OR up to 12 ancillary — JJ pp.99–100 / RR p.272)
  // and the typical campaign-activity actions (Market / Recruit / Travel) per character.
  // Reads characterActivityBudget (the derived middle layer of the actor-time stack,
  // Architecture §7 / §3.13 — derive-don't-store). Reactive on currentDayInMonth/currentTurn/
  // eventLog/journeys/magistracies, so it refreshes when the Day Clock advances. Ventures are
  // intentionally NOT a quick-action here (complex multi-step understructure — its own sub-tab).
  activityDashboardRows(){ return this._computeActivityDashboardRows(); },
  _computeActivityDashboardRows(){
    const camp = this.currentCampaign;
    if(!camp || !Array.isArray(camp.characters)) return [];
    const A = window.ACKS || {};
    const isActive = A.isActive || (c => (c && (c.lifecycleState || 'active') === 'active' && c.alive !== false));
    // The budget reads campaign.domains directly (single home) to gate domain-admin on the
    // administers-this-month lever (domain.magistrates[*].administersThisMonth).
    const rows = camp.characters.filter(c => c && isActive(c)).map(c => this._characterActivityRow(c));
    // Players first, then alphabetical — the GM's own actors lead the list.
    const isPC = A.isPlayerControlled || (c => c && c.controlledBy === 'player');
    rows.sort((a, b) => (isPC(a.c) ? 0 : 1) - (isPC(b.c) ? 0 : 1) || (a.c.name || '').localeCompare(b.c.name || ''));
    return rows;
  },
  // The per-character day-budget projection — the shared shape used by BOTH the Activities ▸ Activities
  // dashboard (one per active character) and the Roster ▸ Characters action box (one for the selection).
  _characterActivityRow(c){
    const A = window.ACKS || {};
    const budget = A.characterActivityBudget ? A.characterActivityBudget(this.currentCampaign, c.id) : { dedicated:[], ancillary:[], incidental:[], dedicatedUsed:0, ancillaryUsed:0, overBudget:false, overReason:null, strenuousDays:0, fatigued:false };
    const dedCap = 1;
    const ancCap = budget.dedicatedUsed >= 1 ? 4 : 12;   // RAW: a dedicated task caps ancillary at 4; an all-errand day allows 12
    const dedLeft = Math.max(0, dedCap - budget.dedicatedUsed);
    const ancLeft = Math.max(0, ancCap - budget.ancillaryUsed);
    const done = [].concat(budget.dedicated || [], budget.ancillary || [], budget.incidental || []);
    return { c, budget, dedCap, ancCap, dedLeft, ancLeft, done };
  },

  // ─── Roster ▸ Characters: the selected-character action box (duplicates — and will ultimately
  //     replace — the Activities ▸ Activities per-character dashboard). Click a table row to select. ───
  selectedCharacter(){ const id = this.selectedCharacterId; if(!id || !this.currentCampaign) return null; return (this.currentCampaign.characters || []).find(c => c && c.id === id) || null; },
  selectCharacter(c){ this.selectedCharacterId = (c && c.id) || null; },
  // [] or a single-element [row] so the box markup can x-for and bind `row` in scope (mirrors the dashboard).
  selectedCharacterActivityRows(){ const c = this.selectedCharacter(); return c ? [ this._characterActivityRow(c) ] : []; },
  // The full character-verb set, each gated COARSELY by current location (hex / settlement / rule).
  // enabled=false greys the button out with `title` saying why; runCharacterAction dispatches the enabled ones.
  characterActionMenu(c){
    if(!c) return [];
    const camp = this.currentCampaign || {};
    const A = window.ACKS || {};
    const set = this.characterAtSettlement(c);
    const atHex = !!c.currentHexId, atSet = !!set;
    const setName = set ? (set.name || 'the local market') : '';
    const hexReason = 'Place this character on a hex first (its Location tab).';
    const setReason = 'Move this character to a settlement to do this.';
    // In-flight engagements → the action renders "active" (dark) and NAVIGATES to the thing in progress
    // instead of starting a new one. (A character already on a journey can't begin another, etc.)
    const onJourney = !!this.characterJourneyOf(c);
    const onVenture = !!this.characterActiveVenture(c);
    const recruiting = (c.recruitmentDrives || []).some(d => d && d.status === 'active');
    const hijinking = (camp.hijinks || []).some(h => h && h.perpetratorCharacterId === c.id && !['complete','failed','caught'].includes(h.status));
    let gladiating = false;
    if(c.socialTier === 'gladiator'){
      const tInfo = A.gladiatorTrainingInfo ? A.gladiatorTrainingInfo(camp, c) : { inTraining:false };
      const inBout = (camp.bouts || []).some(b => b && b.status === 'scheduled' && [].concat(b.sideA?.combatantIds||[], b.sideB?.combatantIds||[]).includes(c.id));
      gladiating = !!(tInfo.inTraining || inBout);
    }
    const T = (ok, okText, reason) => ok ? okText : reason;
    return [
      { key:'market',         icon:'🛒', label:'Market',        active:false,     enabled:atSet, title:T(atSet, 'Buy or sell at ' + setName, setReason) },
      { key:'recruit',        icon:'⚔', label:'Recruit',        active:recruiting, enabled:atSet, title: recruiting ? 'Recruiting now — go to the hiring drive →' : T(atSet, 'Recruit hirelings, henchmen or specialists here', setReason) },
      { key:'travel',         icon:'🧭', label:'Travel',         active:onJourney,  enabled:atHex && !onVenture, title: onJourney ? 'On a journey — go to it →' : (onVenture ? "Away on a venture — can't travel until it resolves." : T(atHex, (this.characterPartyOf(c) ? "Start a journey for this character's party" : 'Start a journey'), hexReason)) },
      { key:'forage',         icon:'🌿', label:'Forage / Hunt',  active:false,     enabled:atHex, title:T(atHex, 'Forage or hunt — live off the land (RR p.278)', hexReason) },
      { key:'search',         icon:'🔍', label:'Search hex',     active:false,     enabled:atHex, title:T(atHex, 'Search this hex for lairs & points of interest (RR pp.276–277)', hexReason) },
      { key:'hijinks',        icon:'🗡', label:'Hijinks',        active:hijinking,  enabled:atSet, title: hijinking ? 'A hijink is under way — go to it →' : T(atSet, 'Attempt an urban hijink here (RR pp.358–370)', setReason) },
      { key:'ventures',       icon:'⚖', label:'Ventures',       active:onVenture,  enabled:atSet, title: onVenture ? 'On a venture — go to it →' : T(atSet, 'Launch or manage a mercantile venture', setReason) },
      { key:'banking',        icon:'🏦', label:'Banking',        active:false,     enabled:atSet, title:T(atSet, 'Banking & loans (RR p.42)', setReason) },
      { key:'magic-items',    icon:'🪄', label:'Magic Items',    active:false,     enabled:atSet, title:T(atSet, 'Identify, buy, sell or commission magic items', setReason) },
      { key:'gladiators',     icon:'🏟', label:'Gladiators',     active:gladiating, enabled:this.gladiatorsTabVisible(), title: gladiating ? 'In the arena — go to the Gladiators view →' : T(this.gladiatorsTabVisible(), 'Arena games & gladiator schools', 'Enable the Gladiators house rule first.') },
      { key:'spell-research', icon:'📜', label:'Spell Research', active:false,     enabled:false, title:'Coming soon (Phase 4.6).' }
    ];
  },
  runCharacterAction(act, c){
    if(!act || !c) return;
    const key = act.key;
    // Active (in-progress) → navigate to the thing already under way rather than start a new one.
    if(act.active){
      switch(key){
        case 'travel':     this.openJourneyForCharacter(c); return;
        case 'recruit':    this.recruitDeepLink({ patronId: c.id }); return;   // recruitStart adopts the in-flight drive
        case 'ventures':   this.openVenturesForCharacter(c); return;
        case 'hijinks':    this.currentView = 'activities'; this.activitiesSubView = 'hijinks'; return;
        case 'gladiators': this.currentView = 'activities'; this.activitiesSubView = 'gladiators'; return;
        default: break;
      }
    }
    switch(key){
      case 'market':      this.openTrade({ actorCharacterId: c.id }); break;
      case 'recruit':     this.recruitDeepLink({ patronId: c.id }); break;
      case 'travel':      this.startJourneyForCharacter(c); break;
      case 'forage':      this.openForage({ actorCharacterId: c.id }); break;
      case 'search':      this.openSearchHex({ actorCharacterId: c.id, hexId: c.currentHexId }); break;
      case 'hijinks':     this.openHijinkForCharacter(c); break;
      case 'ventures':    this.currentView = 'activities'; this.activitiesSubView = 'ventures'; break;
      case 'banking':     this.currentView = 'activities'; this.activitiesSubView = 'banking'; break;
      case 'magic-items': this.currentView = 'activities'; this.activitiesSubView = 'magic-items'; break;
      case 'gladiators':  this.currentView = 'activities'; this.activitiesSubView = 'gladiators'; break;
      default: break;
    }
  },
  // Prefill the Hijinks launcher with this character as perpetrator (+ their settlement) and jump to it.
  openHijinkForCharacter(c){
    if(!c) return;
    this.hijinkLaunch.perpetratorCharacterId = c.id;
    const s = this.characterAtSettlement(c);
    if(s) this.hijinkLaunch.settlementId = s.id;
    this.currentView = 'activities';
    this.activitiesSubView = 'hijinks';
  },
  // Count of active characters who have consumed any budget this game day (the tab badge).
  activityDashboardBusyCount(){ return this.activityDashboardRows().filter(r => r.done.length > 0).length; },

  // ─── Current Activities (Joachim 2026-06-05) — the activity-centric companion to the dashboard ─
  // One row per (character × activity) for TODAY, with a context-labelled reject that ROLLS BACK
  // the activity. A re-projection of the same derived budget (activityDashboardRows → done[]); no
  // new data. The reject is polymorphic-by-source (engine activityRejectAffordance): a domain-admin
  // is UNTICKED, a market trade is REFUNDED (reverseMarketTransaction), a journey can't be rewound
  // so it NAVIGATES to the journey detail (Stop Moving lives there). NB this "reject" rolls back an
  // already-applied act — distinct from the day-tick review's "reject", which skips a not-yet-applied
  // record. Activities with no reject path render no button (mode 'none').
  currentActivityRows(){
    const A = window.ACKS || {};
    const aff = A.activityRejectAffordance || (() => ({ mode:'none', label:'', verb:'' }));
    const out = [];
    for(const r of this.activityDashboardRows()){
      for(const a of r.done){
        out.push({ c: r.c, activity: a, affordance: aff(a), overBudget: !!(r.budget && r.budget.overBudget), detail: this._activityRowDetail(a) });
      }
    }
    return out;
  },
  // A short parenthetical disambiguator for an activity row's "Doing" cell — so two shopping rows
  // are tellable apart. Currently only market trades carry one: a representative slice of the goods.
  // One line → that line ("Longsword", "Longsword ×3"); several → the most valuable set + ", etc."
  // ("Plate Armor ×2, etc."). Resolves the event by the activity's sourceId (payload.lines carries
  // {name, qty, totalGp}); '' for any activity with no goods detail. Display only — the engine
  // budget's label stays the generic cost label.
  _activityRowDetail(a){
    if(!a || a.kind !== 'market-transaction' || a.sourceKind !== 'errand-event') return '';
    const log = this.currentCampaign?.eventLog;
    if(!Array.isArray(log)) return '';
    const entry = log.find(e => e && e.event && e.event.id === a.sourceId);
    const lines = (entry && entry.event && entry.event.payload && Array.isArray(entry.event.payload.lines)) ? entry.event.payload.lines : [];
    if(!lines.length) return '';
    const fmt = l => (l.name || 'item') + ((Number(l.qty) > 1) ? (' ×' + l.qty) : '');
    if(lines.length === 1) return fmt(lines[0]);                                  // one set → name it
    const top = lines.reduce((best, l) => ((Number(l.totalGp) || 0) > (Number(best.totalGp) || 0) ? l : best), lines[0]);
    return fmt(top) + ', etc.';                                                   // several → the priciest set, then "etc."
  },
  // Dispatch a reject on its source (the affordance.mode decides). Returns nothing; surfaces the
  // outcome via toast (refuse-with-reason) or navigation. Confirms before any irreversible-feeling act.
  rejectActivity(row){
    if(!row || !row.activity) return;
    const a = row.activity, c = row.c;
    const mode = row.affordance ? row.affordance.mode : 'none';
    if(mode === 'navigate'){
      if(a.sourceKind === 'recruitment-drive'){                // a search — can't refund a week of soliciting; open the Recruit panel for this patron (Stop soliciting lives there)
        this.currentView = 'activities'; this.activitiesSubView = 'recruit';
        this.recruitStart(c.id);                               // adopts the patron's in-flight drive
        return;
      }
      this.journeyOpenDetail(a.sourceId);                      // a journey — can't rewind a travelled day; open it (Stop Moving lives there)
      return;
    }
    if(mode !== 'reverse'){ this.showToast('That activity can’t be rejected.'); return; }
    if(a.sourceKind === 'domain'){
      const d = (this.domains || []).find(x => x && x.id === a.sourceId);
      if(!d){ this.showToast('That domain is no longer here.'); return; }
      if(!confirm('Untick administration of ' + (d.name || 'this domain') + ' by ' + (c.name || 'this character') + ' for this month?\n\nThis withdraws the +1-morale lever — nothing else is undone.')) return;
      if(this._untickDomainAdmin(d, c)){
        this.markDirty(); this.schedulePersist();
        this.showToast('Administration of ' + (d.name || 'the domain') + ' withdrawn for this month.');
      } else { this.showToast('Couldn’t find that administration to untick.', 5000); }
      return;
    }
    if(a.sourceKind === 'errand-event' && a.kind === 'market-transaction'){
      if(!confirm('Refund this market transaction?\n\nCoins and goods are returned exactly as traded — the purchase is fully rolled back.')) return;
      const res = window.ACKS.reverseMarketTransaction(this.currentCampaign, a.sourceId);
      if(res && res.ok){
        this.markDirty(); this.schedulePersist();
        this.showToast(res.narrativeSummary || 'Transaction reversed.', 5000);
      } else {
        this.showToast((res && res.reason) || 'That transaction couldn’t be reversed.', 6000);
      }
      return;
    }
    this.showToast('That activity can’t be rejected.');
  },
  // Untick the administers-this-month lever for `c` on domain `d` (ruler OR a magistrate slot they
  // hold). Audited via commitStatEdit (gm-fiat) like the +1-morale tick itself. Returns true if it
  // found + cleared one. The morale recompute is automatic (moraleModifiersFor reads the flag live).
  _untickDomainAdmin(d, c){
    if(d.administersThisMonth && d.rulerCharacterId === c.id){
      return this.commitStatEdit({ entityType:'domain', entityId:d.id, entity:d, fieldPath:'administersThisMonth',
        label:'Ruler administers', oldValue:true, newValue:false,
        toastMessage:'Administration of ' + (d.name || 'the domain') + ' withdrawn.' });
    }
    const mg = d.magistrates || {};
    const roleLabels = (window.ACKS && window.ACKS.MAGISTRATE_ROLES) || {};
    for(const rk of Object.keys(mg)){
      const slot = mg[rk];
      if(slot && slot.administersThisMonth && slot.characterId === c.id){
        return this.commitStatEdit({ entityType:'domain', entityId:d.id, entity:d, fieldPath:'magistrates.' + rk + '.administersThisMonth',
          label:(roleLabels[rk]?.label || rk) + ' administers', oldValue:true, newValue:false,
          toastMessage:'Administration withdrawn.' });
      }
    }
    return false;
  },
  // The day-tick over-budget heads-up links here (Joachim 2026-06-05) — jump to where the GM can
  // actually reject an activity. The pending proposal is about to go stale (they're changing state),
  // so cancel it; the GM re-ticks the Day Clock fresh after resolving.
  goToCurrentActivities(){
    this.cancelDayTick();
    this.currentView = 'activities';
    this.activitiesSubView = 'activities';
  },

  // ─── Phase 2.5 Journeys (#475 — J2) UI methods ─────────────────────────────
  // Lists. 'planning' journeys (Inspector Admin-verb create) show in Active with a
  // Start affordance so an authored-but-not-started journey isn't invisible.
  activeJourneys(){ return (this.currentCampaign?.journeys||[]).filter(j => j && ['planning','in-transit','resting','lost'].includes(j.status)); },
  completedJourneys(){ return (this.currentCampaign?.journeys||[]).filter(j => j && (j.status==='arrived'||j.status==='aborted')); },
  // ── Journey membership + headcount (mercenaries travel with their character — RR p.166,
  //    same rollup as the Parties panel) ──
  _charsByIds(ids){ const all=this.currentCampaign?.characters||[]; return (ids||[]).map(id => all.find(c => c && c.id===id)).filter(Boolean); },
  characterMercCount(ch){ return this.partyMemberMercSummary(ch).reduce((s,m)=>s+m.count,0); },
  characterMercCountById(id){ const ch=(this.currentCampaign?.characters||[]).find(x=>x.id===id); return ch ? this.characterMercCount(ch) : 0; },
  _mercTotalForChars(chars){ return (chars||[]).reduce((s,ch)=>s+this.characterMercCount(ch),0); },
  _headcountLabel(chars){ const n=chars.length; const m=this._mercTotalForChars(chars); let s=n+' character'+(n===1?'':'s'); if(m) s+=' + '+m.toLocaleString()+' mercenaries ('+(n+m).toLocaleString()+' total)'; return s; },
  // §8 party day-tick toggles — transient party-intent flags (no event; just persist).
  // Flipping a supply toggle re-resolves the latest committed day immediately (Joachim 2026-06-05), so the
  // day log + Food/Water columns update on the spot ("they forage today") rather than only from the next
  // tick. On day 0 (nothing committed) reapply is a no-op — the toggle just sets the order for the first tick.
  toggleJourneyForageWater(j){ if(!j) return; j.forageWaterEnabled = !j.forageWaterEnabled; this._journeyWithDomains(() => window.ACKS.reapplyLatestDaySurvival(this.currentCampaign, j)); this.markDirty(); this.schedulePersist(); this._refreshPendingDayTick(); },
  toggleJourneyShareRations(j){ if(!j) return; j.shareRations = !j.shareRations; this._journeyWithDomains(() => window.ACKS.reapplyLatestDaySurvival(this.currentCampaign, j)); this.markDirty(); this.schedulePersist(); this._refreshPendingDayTick(); },
  // Per-traveller survival status for the Members table (RR p.275 cascade). The day-tick mirrors
  // the party's hunger / dehydration / fatigue onto each participant, so these read off the
  // character. A GM-facing tracker — no auto-penalty wired yet (escalating effects are a follow-up).
  // While a day-tick proposal is OPEN, preview the proposed day's survival on a traveller's
  // conditions — so the members table agrees with the day review + the day-log PENDING row (Joachim
  // 2026-06-05: "they should be Dehydrated here, as they actually are on the day review"). The day
  // record carries a compact per-member post-day snapshot (memberSurvival); overlay it on the
  // committed character so the food/water deficit days + CON loss read the PROPOSED values. The real
  // character fields are unchanged until commit, so cancelling the proposal reverts the preview.
  _characterConditionSource(ch){
    if(!ch) return ch;
    const p = this.dayTickProposal;
    if(p){
      for(const r of (p.pendingRecords||[])){
        if(r && r.kind === 'journey-day' && r.dayRecord && r.dayRecord.memberSurvival && r.dayRecord.memberSurvival[ch.id]){
          return Object.assign({}, ch, r.dayRecord.memberSurvival[ch.id]);
        }
      }
    }
    return ch;
  },
  characterJourneyConditions(ch){
    const out=[];
    const src=this._characterConditionSource(ch);   // committed char, or the proposed day's survival while a proposal is open
    // RAW hunger cascade (RR p.278): hungry after 1 day < full rations; underfed after 2 days with no
    // food; starving after ~5 further underfed days (≈ day 7). Provisioning V3 applies the CON loss
    // (1/day while starving); surface it in the badge detail when present.
    const h=(src&&(src.foodDeficitDays!=null?src.foodDeficitDays:src.hungerDays))||0;
    if(h>0){
      const stage = (h>=7) ? 'Starving' : (h>=2 ? 'Underfed' : 'Hungry');
      const cl=(src&&src.conLossHunger)||0;
      out.push({ key:'hunger', label:stage, detail:'day '+h+(cl>0?(' · −'+cl+' CON'):''), cls:'bg-orange-200 text-orange-900' });
    }
    // RAW dehydration (RR p.278): a SINGLE 'dehydrated' stage — no benign "thirsty" precursor; loses
    // 1d6 CON/day (Provisioning V2).
    const d=(src&&(src.waterDeficitDays!=null?src.waterDeficitDays:src.dehydrationDays))||0;
    if(d>0){
      const cl=(src&&src.conLossThirst)||0;
      out.push({ key:'dehydration', label:'Dehydrated', detail:'day '+d+(cl>0?(' · −'+cl+' CON'):''), cls:'bg-sky-200 text-sky-900' });
    }
    const f=(ch&&ch.personalFatigue)||0;
    if(f>=6) out.push({ key:'fatigue', label:'Fatigued', detail:'', cls:'bg-amber-200 text-amber-900' });
    return out;
  },
  // Provisioning V5 — Food/Water column data + the ignore-rations gate (mirrors encumbranceShown).
  rationsShown(){ return !this.isHouseRuleEnabled('ignore-rations'); },
  characterFoodDays(ch){ return ch ? (window.ACKS.rationDaysAvailable(ch)||0) : 0; },          // personal ration days
  characterWaterDays(ch){ return ch ? (Math.round((Number(ch.waterDaysCarried)||0)*10)/10) : 0; },
  characterWaterCap(ch){ return ch ? (Math.round((window.ACKS.waterCapacityDays(ch)||0)*10)/10) : 0; },
  // CoL-1 (Joachim 2026-06-06): is this character on LIFESTYLE (no food/water spent — sheltered or in a
  // realm ruled by them or a co-located companion) or in the FIELD (consuming daily, RR p.278)? Returns a
  // human label naming WHY. Companion-aware via the engine's effective regime.
  characterSurvivalRegime(ch){
    const A = window.ACKS;
    if(!ch || !this.currentCampaign || !ch.currentHexId) return { onLifestyle:true, kind:'unlocated', label:'No location set — assumed provisioned' };
    const info = (A.characterEffectiveProvisioningInfo ? A.characterEffectiveProvisioningInfo(this.currentCampaign, ch.id) : null) || { regime:'field' };
    const onLifestyle = info.regime === 'settled';
    let label;
    if(!onLifestyle){
      label = 'In the field — consuming food & water daily (RR p.278)';
    } else if(info.kind === 'settlement'){
      const s = (this.currentCampaign.settlements||[]).find(x => x && x.id === info.settlementId);
      label = 'On lifestyle — sheltered at ' + ((s && s.name) || 'a settlement here') + ' · no rations spent';
    } else if(info.kind === 'stronghold'){
      label = 'On lifestyle — quartered at a stronghold here · no rations spent';
    } else if(info.kind === 'domain'){
      const d = (this.currentCampaign.domains||[]).find(x => x && x.id === info.domainId);
      const host = (this.currentCampaign.characters||[]).find(x => x && x.id === info.hostCharacterId);
      const whose = (host && host.id === ch.id) ? 'own realm' : ((host && host.name) ? (host.name + '’s realm') : 'a companion’s realm');
      label = 'On lifestyle — in ' + ((d && d.name) || 'a home domain') + ' (' + whose + (info.viaVassal ? ', a vassal realm' : '') + ') · no rations spent';
    } else {
      label = 'On lifestyle — no rations spent';
    }
    return { onLifestyle, kind: info.kind, label, info };
  },
  // Cost of Living (CoL-2, RR p.173 + p.170) — the Survival-tab panel data: the apparent level last
  // month's spend bought, the lifestyle target + its wage, whether the character rules a domain (→ the
  // pay-from-treasury option), and a plain explanation.
  characterLivingExpense(ch){
    const A = window.ACKS;
    const trueLevel = (ch && ch.level) || 0;
    const apparentLevel = (A && A.apparentLevel) ? A.apparentLevel(this.currentCampaign, ch) : trueLevel;
    const targetLevel = (ch && ch.lifestyleTargetLevel != null) ? ch.lifestyleTargetLevel : trueLevel;
    const targetWage = (A && A.levelMonthlyWage) ? A.levelMonthlyWage(targetLevel) : 0;
    const rulesADomain = (this.domains || []).some(d => d && d.rulerCharacterId === (ch && ch.id));
    let note;
    if(apparentLevel < trueLevel){
      note = 'Underspending — NPCs (and prospective henchmen) take ' + ((ch && ch.name) || 'this character') +
             ' for level ' + apparentLevel + ' (RR p.173). Raise the lifestyle target, or keep more coin on hand for month-end.';
    } else {
      note = 'Living expenses cover the character’s level. Paid at month end from ' +
             ((ch && ch.payKeepFromTreasury !== false && rulesADomain) ? 'the domain treasury' : 'the coin purse') +
             '; short funds force a lower spend (no debt). Spending above your level doesn’t raise your apparent level (RR p.173 is downward-only).';
    }
    return { trueLevel, apparentLevel, targetLevel, targetWage, rulesADomain, note };
  },
  // Per-character monthly expense breakdown (CoL-2) — the Expenses tab: lifestyle keep + the wages
  // this character pays as a liege to its henchmen/specialists + the total. Pure engine read.
  characterExpenses(ch){
    const A = window.ACKS;
    if(A && A.characterExpenseBreakdown) return A.characterExpenseBreakdown(this.currentCampaign, ch);
    return { ruleOn:false, selfSupporting:false, lifestyle:null, henchmen:[], henchmenTotal:0, lifestyleGp:0, total:0 };
  },
  // Fresh water available at the character's current hex? (Survival-tab indicator — river/lake/settlement.)
  characterHexSourcesWater(ch){
    if(!ch || !this.currentCampaign || !ch.currentHexId) return false;
    const hx = (this.currentCampaign.hexes||[]).find(h => h && h.id === ch.currentHexId);
    return hx ? !!window.ACKS.hasFreshSource(this.currentCampaign, hx) : false;
  },
  // CoL-1: a journey/party group's lifestyle status at its current hex (no rations spent) + a short label.
  groupProvisioningLabel(members, hexId){
    const A = window.ACKS;
    if(!this.currentCampaign) return { onLifestyle:false, label:'' };
    const hx = (this.currentCampaign.hexes||[]).find(h => h && h.id === hexId) || null;
    const info = (A.groupProvisioningInfo ? A.groupProvisioningInfo(this.currentCampaign, members||[], hx) : null) || { regime:'field' };
    const onLifestyle = info.regime === 'settled';
    let label = '';
    if(onLifestyle){
      if(info.kind === 'settlement'){ const s=(this.currentCampaign.settlements||[]).find(x=>x&&x.id===info.settlementId); label = 'At ' + ((s&&s.name)||'a settlement'); }
      else if(info.kind === 'stronghold'){ label = 'At a stronghold'; }
      else if(info.kind === 'domain'){ const d=(this.currentCampaign.domains||[]).find(x=>x&&x.id===info.domainId); label = 'In ' + ((d&&d.name)||'a home domain') + (info.viaVassal?' (vassal realm)':''); }
    }
    return { onLifestyle, kind: info.kind, label };
  },
  partyProvisioningInfo(pt){
    if(!pt) return { onLifestyle:false, label:'' };
    const members = (this.currentCampaign?.characters||[]).filter(c => c && c.partyId === pt.id);
    return this.groupProvisioningLabel(members, pt.currentHexId);
  },
  startJourneySubmitDisabledReason(){
    const w = this.journeyWizard;
    if(!w.participantIds || w.participantIds.length===0) return 'Pick at least one participant (a character or a party).';
    if(!w.startHexId) return 'Pick a start hex.';
    if(!w.destinationHexId) return 'Pick a destination hex.';
    if(w.startHexId === w.destinationHexId) return 'Start and destination are the same hex.';
    return '';
  },
  startJourneyCanSubmit(){ return this.startJourneySubmitDisabledReason() === ''; },
  // Deep-link contract (mirrors recruitDeepLink): opts {characterId?, partyId?, startHexId?}.
  startJourneyDeepLink(opts){
    opts = opts || {};
    this._journeyResetWizard();
    const origin = { view:this.currentView, rosterSubView:this.rosterSubView, activitiesSubView:this.activitiesSubView };
    if(opts.characterId){
      this.journeyWizard.participantIds = [opts.characterId];
      const c = (this.currentCampaign?.characters||[]).find(x=>x.id===opts.characterId);
      if(c && c.currentHexId) this.journeyWizard.startHexId = c.currentHexId;
    }
    if(opts.partyId){ this.journeyWizard.partyId = opts.partyId; this.journeyOnPartyChange(); }
    if(opts.startHexId) this.journeyWizard.startHexId = opts.startHexId;
    this.journeyWizard.origin = origin;
    this.journeyWizard.open = true;
    this.journeyDetailId = null;
    this.currentView = 'activities';
    this.activitiesSubView = 'journeys';
  },
  startJourneyCancel(){
    const origin = this.journeyWizard.origin;
    this._journeyResetWizard();
    if(origin){
      this.currentView = origin.view || 'activities';
      this.activitiesSubView = origin.activitiesSubView || 'journeys';
      if(origin.rosterSubView) this.rosterSubView = origin.rosterSubView;
    }
  },
  startJourneySubmit(){
    const reason = this.startJourneySubmitDisabledReason();
    if(reason){ this.showToast(reason, 3000); return; }
    const w = this.journeyWizard;
    if(!Array.isArray(this.currentCampaign.journeys)) this.currentCampaign.journeys = [];
    const j = window.ACKS.blankJourney({
      name: (w.name||'').trim() || window.ACKS.journeyDefaultName(this.currentCampaign, { partyId: w.partyId || null, participantCharacterIds: w.participantIds }) || (this._journeyHexLabel(w.startHexId) + ' → ' + this._journeyHexLabel(w.destinationHexId)),
      participantCharacterIds: w.participantIds.slice(),
      partyId: w.partyId || null,
      startHexId: w.startHexId,
      destinationHexId: w.destinationHexId,
      waypoints: (w.waypointIds||[]).map(id => ({ hexId:id, label:'', plannedPurpose:'' })),
      mode: w.mode || 'foot',
      pace: w.pace || 'normal',
      supplies: { rations:Number(w.rations)||0, waterRations:Number(w.waterRations)||0, animalFeed:0, animalWater:0, shipStores:0 }
    });
    // V6 — a chosen vessel makes this a voyage (the day-tick branches on journey.shipId). mode is the
    // cosmetic ⛵ label; propulsion/continuousSailing are defensive-read voyage settings (not blankJourney
    // factory fields → set directly, the V5 journey.riverCurrent precedent).
    if(w.shipId){ j.shipId = w.shipId; j.mode = 'voyage-sail'; j.propulsion = w.propulsion || 'auto'; j.continuousSailing = !!w.continuousSailing; }
    this.currentCampaign.journeys.push(j);
    // Set out — the party stands AT THE START HEX, day 0, nothing travelled yet (Joachim 2026-06-05:
    // "before pressing the button the group is in the hex where they started — this determines initial
    // water status"). The first day's leg is travelled by the first Complete Movement (or the Day Clock);
    // no auto day-1, so every day is resolved the same way, by the same door.
    this._journeyWithDomains(() => { window.ACKS.startJourney(this.currentCampaign, j); });
    this.markDirty(); this.schedulePersist();
    const id = j.id;
    this._journeyResetWizard();
    this.journeyDetailId = id;
    this.showToast('Set out: ' + (j.name||'(unnamed)') + ' — press Complete Movement to travel the first day.');
  },
  // Change a journey's marching pace mid-trip — logged via gm-fiat; the engine reads journey.pace
  // fresh on each day-tick, so the next day ticked uses the new pace (per-day pace stays in the log).
  setJourneyPace(j, pace){
    if(!j || !pace || j.pace === pace) return;
    // suppressFromCampaignLog: an operational knob-turn, not a campaign moment — audited in the Event Log only.
    this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'pace', label:'Pace', oldValue:j.pace, newValue:pace, suppressFromCampaignLog:true });
    this.markDirty(); this.schedulePersist();
  },
  // ── Pace cap (Joachim 2026-06-05): the travellers' OTHER activities cap the achievable pace. ──
  // journeyPaceAllowed → can the party sustain this pace? journeyEffectivePaceUI → the GM's pace,
  // capped (what the dropdown shows selected + what a tick uses). journeyPaceCapText → why it's
  // restricted (names the constraining traveller), '' when uncapped. All read the live this.domains.
  _PACE_RANK_UI: { 'halted':0, 'half-speed':1, 'normal':2, 'forced-march':3 },
  setJourneyMode(j, mode){
    if(!j || !mode || j.mode === mode) return;
    this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'mode', label:'Mode', oldValue:j.mode, newValue:mode, suppressFromCampaignLog:true });
    this.markDirty(); this.schedulePersist();
  },
  // Set (miles>0) or clear (null/0) the override — logged via gm-fiat, like setJourneyPace.
  setJourneySpeedOverride(j, miles){
    if(!j) return;
    const v = (typeof miles === 'number' && isFinite(miles) && miles > 0) ? Math.round(miles) : null;
    const cur = this.journeyHasSpeedOverride(j) ? j.speedOverrideMilesPerDay : null;
    if(cur === v) return;
    this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'speedOverrideMilesPerDay', label:'Speed override (mi/day)', oldValue:cur, newValue:v, suppressFromCampaignLog:true });
    this.markDirty(); this.schedulePersist();
  },
  // The "Override" tick only ARMS the override (the transient journeyOverrideArmed flag) — it commits
  // NO value and emits NO event, so ticking leaves the journey in the null/pace state until the GM
  // actually picks a number via the editor. Unticking disarms AND clears any committed value (one event
  // iff a value was set), returning to the null state.
  toggleJourneySpeedOverride(j, checked){
    if(!j) return;
    if(checked){
      this.journeyOverrideArmed = true;
    } else {
      this.journeyOverrideArmed = false;
      if(this.journeyHasSpeedOverride(j)) this.setJourneySpeedOverride(j, null);
    }
  },
  abortJourneyUI(j){
    if(!j) return;
    const reason = window.prompt('Stop moving on "' + (j.name||'journey') + '"? The travellers halt where they are (the trip won\'t resume on its own). Optional reason (Cancel keeps them traveling):', '');
    if(reason === null) return;
    window.ACKS.abortJourney(this.currentCampaign, j, (reason||'').trim() || null);
    this.markDirty(); this.schedulePersist();
    this.showToast('Travellers stopped moving.');
  },

  // ─── Unified role + income + XP helpers (Roster + Officers) ──────────────
  // Every position this character holds across the campaign. Returns
  // { kind:'ruler'|'magistrate', label, domainId, domain, roleKey?, income }.
  // Ruler labels prefix "Vassal " when the domain has a liege (matches the
  // Henchmen box convention). Magistrate label = role + " of " + domain.
  characterAllRoles(c){
    if(!c) return [];
    const out = [];
    const mr = (typeof window !== 'undefined' && window.ACKS?.MAGISTRATE_ROLES) || {};
    (this.domains||[]).forEach(d => {
      if(d.rulerCharacterId === c.id){
        const prefix = d.liegeId ? 'Vassal Ruler' : 'Ruler';
        out.push({
          kind: 'ruler',
          label: prefix + ' of ' + d.name,
          domainId: d.id,
          domain: d,
          income: this.domainIncome(d) || 0,
        });
      }
      ['captainOfGuard','chaplain','munerator','steward'].forEach(rk => {
        if(d.magistrates?.[rk]?.characterId === c.id){
          out.push({
            kind: 'magistrate',
            label: (mr[rk]?.label || rk) + ' of ' + d.name,
            domainId: d.id,
            domain: d,
            roleKey: rk,
            income: this.magistrateSalaryForRole(d, rk),
          });
        }
      });
    });
    // Gladiator of a school — a standing membership role (Gladiators G1). Unlike
    // training or a scheduled bout (transient activities), being contracted to a
    // school is a constant role; it deep-links to the ⚔ Gladiators view, not a domain.
    if(c.socialTier === 'gladiator' && c.alive !== false && c.lifecycleState !== 'deceased'){
      const sch = c.contractSchoolId ? (this.currentCampaign?.gladiatorSchools||[]).find(s => s && s.id === c.contractSchoolId) : null;
      out.push({
        kind: 'gladiator',
        label: 'Gladiator' + (sch ? ' of ' + (sch.name || 'the school') : ''),
        view: 'gladiators',
        income: 0,
      });
    }
    return out;
  },
  // Sum of all role incomes — RR p.425 "domain income" for the character.
  characterDomainIncomeTotal(c){
    return this.characterAllRoles(c).reduce((s, r) => s + (r.income || 0), 0);
  },
  // XP earned this month from all roles. Per-role threshold check matches
  // the existing per-domain pattern in domainXpFromNet. Errata §1.1 wage
  // subtraction is folded into domainXpFromNet for henchman rulers.
  characterXpThisMonth(c){
    if(!c) return 0;
    const threshold = (typeof computeGpThreshold === 'function')
      ? computeGpThreshold(c.level||1)
      : (window.ACKS?.computeGpThreshold ? window.ACKS.computeGpThreshold(c.level||1) : 0);
    let xp = 0;
    (this.domains||[]).forEach(d => {
      if(d.rulerCharacterId === c.id){
        const dxp = this.domainXpFromNet(d, this.monthlyNet(d));
        if(dxp != null && dxp > 0) xp += dxp;
      }
    });
    ['captainOfGuard','chaplain','munerator','steward'].forEach(rk => {
      (this.domains||[]).forEach(d => {
        if(d.magistrates?.[rk]?.characterId === c.id){
          const salary = this.magistrateSalaryForRole(d, rk);
          xp += Math.max(0, salary - threshold);
        }
      });
    });
    return xp;
  },
  // Resolve a domain's ruler back to a Character entity. Falls back to null if no link.
  rulerCharacter(d){return window.ACKS.rulerCharacter(this.currentCampaign, d);},
  // Resolve the canonical ruler stats for game mechanics. Pulls from the linked character when
  // available; falls back to the legacy d.ruler struct for pre-2.6 data. The `administersThisMonth`
  // flag is per-turn state and stays on the domain regardless. Personal Authority is COMPUTED
  // automatically from the character's level cross-referenced with the domain's gross monthly
  // income (RR p.350 Personal Authority Table).
  effectiveRuler(d){return window.ACKS.effectiveRuler(this.currentCampaign, d);},
  // Phase 2.6 — Personal Authority is computed per RR p.350. Exposed for UI calls.
  computePersonalAuthority,
  personalAuthorityBracketForIncome,
  // Phase 2.6 followup 3 — GP threshold auto-computed per RR p.423 Monthly XP Threshold table
  computeGpThreshold,
  // Phase 2.6 followup 6 — XP progression + level-up helpers
  xpForLevel, xpToNextLevel, rollHpForLevel, XP_PROGRESSION, CLASS_HD,
  // Append a chronological entry to a character's personal history.
  // type: 'xp'|'level-up'|'venture'|'domain'|'note'|'death'|'restore'|'other'.
  // turn defaults to currentTurn; summary is a short string.
  addCharacterHistory(c, type, summary, extra){return window.ACKS.addCharacterHistory(this.currentCampaign, c, type, summary, extra);},

  // Synthesize an in-game date string for an historical turn by walking the calendar backward
  // from the current state. Calendar advances exactly one month per turn (1 turn = 1 month),
  // so the math is just months-back. Used for entries written before gameDate-capture landed.
  gameDateFromTurn(turn){
    const camp = this.currentCampaign;
    if(!camp || !camp.calendar) return null;
    const currentTurn = camp.currentTurn || 1;
    const delta = currentTurn - (turn || 1);
    if(delta < 0) return null; // future turn — shouldn't happen
    const cal = camp.calendar;
    const kind = cal.kind || 'default';
    const calendarDef = window.ACKS?.CALENDARS?.[kind];
    if(!calendarDef || !Array.isArray(calendarDef.months) || calendarDef.months.length === 0) return null;
    const monthsCount = calendarDef.months.length;
    let year = cal.year || 1;
    let month = cal.month || 1;
    for(let i = 0; i < delta; i++){
      month -= 1;
      if(month < 1){ month = monthsCount; year -= 1; }
    }
    const monthName = (typeof calendarDef.months[month-1] === 'string' ? calendarDef.months[month-1] : (calendarDef.months[month-1]?.name || 'Month '+month));
    // Month-granularity in the GM view; day omitted since monthly advance always lands on day 1.
    // Specific events that explicitly track day-level detail will include it in their own summary.
    return 'Year ' + year + ', ' + monthName;
  },

  // ── Entity Chronicle (T3, audit 2026-06-14) ──────────────────────────────────────────
  // The world-memory surface. The engine computes a per-entity event history for every kind
  // (hexHistory / domainHistory / groupHistory / partyHistory / characterHistory / …) off the
  // eventLog's context envelope, but until now the UI called only characterHistory (the Travel
  // box). This is the ONE generic renderer the hex / domain / group / party / character detail
  // views all use to show "everything that ever happened to this thing", newest-first. Pure read
  // — no new engine logic; it just formats what the accessors return. (df-lens C1; the highest-
  // leverage build change — "a world you can click into and read the life of".)
  // Maps a chronicle "kind" → the engine's history accessor. Keys cover BOTH the entity-registry
  // ids the Inspector passes (e.g. 'notableItem', camelCase) AND the context-envelope relatedEntity
  // kinds the detail panels pass (e.g. 'notable-item', kebab) — so the same renderer serves both.
  _CHRONICLE_ACCESSOR: {
    hex: 'hexHistory', domain: 'domainHistory', group: 'groupHistory', party: 'partyHistory',
    character: 'characterHistory', settlement: 'settlementHistory', constructible: 'constructibleHistory',
    'notable-item': 'notableItemHistory', notableItem: 'notableItemHistory',
    journey: 'journeyHistory', outpost: 'outpostHistory', congregation: 'congregationHistory',
  },
  // Build the chronicle rows for an entity. kind ∈ _CHRONICLE_ACCESSOR keys; id = the entity id.
  // Returns newest-first { icon, summary, date, kind, hidden } rows. `hidden` flags the rows the
  // narrative Campaign Log suppresses (routine/audit-only) — shown here (this IS the audit view)
  // but visually de-emphasized. limit caps the rows rendered (default 60; the entity-detail panels
  // want a recent dossier, not the whole log — the full stream lives in the Campaign Log).
  entityChronicle(kind, id, limit){
    if(!kind || !id || !this.currentCampaign) return [];
    const accessor = this._CHRONICLE_ACCESSOR[kind];
    const fn = accessor && window.ACKS && window.ACKS[accessor];
    if(typeof fn !== 'function') return [];
    let evs;
    try { evs = fn(this.currentCampaign, id) || []; }
    catch(e){ return []; }
    const out = [];
    for(const e of evs){
      const ev = (e && e.event) || e;
      if(!ev) continue;
      const summary = (e.result && e.result.narrativeSummary)
        || (ev.payload && ev.payload.narrativeSummary)
        || (ev.payload && ev.payload.narrative)
        || (ev.kind + (ev.status && ev.status !== 'applied' ? (' [' + ev.status + ']') : ''));
      const turn = (e.appliedAtTurn != null) ? e.appliedAtTurn : (ev.appliedAtTurn || ev.targetTurn || null);
      out.push({
        icon: this._chronicleIcon(ev.kind),
        summary,
        date: (ev.gameTimeAt ? this._travelEventDate(ev) : (turn != null ? ('Turn ' + turn + (this.gameDateFromTurn(turn) ? (' · ' + this.gameDateFromTurn(turn)) : '')) : '(date unknown)')),
        kind: ev.kind,
        hidden: !!e.campaignLogHidden,
      });
    }
    out.reverse();   // newest-first, like the Personal-history + Travel boxes
    const n = (typeof limit === 'number' && limit > 0) ? limit : 60;
    return out.length > n ? out.slice(0, n) : out;
  },
  entityChronicleCount(kind, id){
    if(!kind || !id || !this.currentCampaign) return 0;
    const accessor = this._CHRONICLE_ACCESSOR[kind];
    const fn = accessor && window.ACKS && window.ACKS[accessor];
    if(typeof fn !== 'function') return 0;
    try { return (fn(this.currentCampaign, id) || []).length; } catch(e){ return 0; }
  },

  // ── Per-person Travel log (2026-06-04) ───────────────────────────────────────────────
  // Derived view over the eventLog via ACKS.characterHistory: every journey-* event that names
  // THIS character in its context envelope — set out, each travel day (where they went, lost /
  // forded / low on supplies), arrival, stopping, re-routing. Newest-first, mirroring the
  // Personal-history box. Routine days (campaignLogHidden — kept out of the narrative Campaign
  // Log) still surface here; this is the GM's "where has this person been" view. The accessor
  // ONLY returns character-tagged events, but we still filter to journey-* so the box stays
  // travel-only as future subsystems begin tagging characters in their own events.
  characterTravelHistory(c){
    if(!c || !c.id || !this.currentCampaign) return [];
    const TRAVEL = { 'journey-start':1, 'journey-day-tick':1, 'journey-arrived':1, 'journey-aborted':1, 'journey-rerouted':1 };
    let evs;
    try { evs = window.ACKS.characterHistory(this.currentCampaign, c.id) || []; }
    catch(e){ return []; }
    const out = [];
    for(const e of evs){
      if(!e || !e.event || !TRAVEL[e.event.kind]) continue;
      const ev = e.event, p = ev.payload || {}, day = p.day || null;
      out.push({
        kind:    ev.kind,
        icon:    this._travelEventIcon(ev, day),
        summary: (e.result && e.result.narrativeSummary) || p.narrative || ev.kind,
        date:    this._travelEventDate(ev),
        lost:    !!(day && day.lost),
        arrived: ev.kind === 'journey-arrived'
      });
    }
    return out.reverse();   // newest first, like the Personal-history box
  },
  _travelEventDate(ev){
    const t = ev && ev.gameTimeAt;
    if(!t) return '(date unknown)';
    let s = 'Year ' + (t.year || 1);
    try { s += ', ' + window.ACKS.monthName(this.currentCampaign, t.month || 1); }
    catch(e){ s += ', Month ' + (t.month || 1); }
    if(t.day && t.day > 1) s += ', Day ' + t.day;
    return s;
  },
  _travelEventIcon(ev, day){
    switch(ev.kind){
      case 'journey-start':    return '🧭';
      case 'journey-arrived':  return '🏁';
      case 'journey-aborted':  return '🛑';
      case 'journey-rerouted': return '↪';
      default:                 return (day && day.lost) ? '❓' : '⛺';
    }
  },

  // List mutation helper — add/remove an item from an array-valued field on an entity.
  // Uses gm-fiat under the hood (same audit trail as commitStatEdit) but writes the whole
  // new array as newValue and includes a clearer narrative in the campaign log.
  // opts: { entityType, entityId, entity, fieldPath, label, action: 'add' | 'remove',
  //         value: the string/object being added or removed, index? (for remove by index) }
  // Prototype-pollution guard for the UI write paths (appsec audit C1, 2026-05-31).
  // The engine's _setByPath + validateEvent already reject __proto__/constructor/prototype,
  // so a bad path would fail safely inside applyEvent anyway — this rejects it earlier,
  // before an event is even constructed. Delegates to the engine's segment blacklist.
  isSafeFieldPath(fp){
    const segs = window.ACKS && window.ACKS.DANGEROUS_PATH_SEGMENTS;
    if(!segs) return true; // engine not loaded — don't block (defensive)
    return String(fp == null ? '' : fp).split('.').every(s => segs.indexOf(s) === -1);
  },
  commitListMutation(opts){
    if(!opts || !opts.entityType || !opts.entityId || !opts.fieldPath || !opts.action) return false;
    if(!this.isSafeFieldPath(opts.fieldPath)){ console.error('commitListMutation: refusing unsafe fieldPath', opts.fieldPath); this.showToast('Refused unsafe field path: '+opts.fieldPath, 5000); return false; }
    const entity = opts.entity;
    if(!entity) return false;
    // Read current array via path.
    const parts = (opts.fieldPath || '').split('.');
    let cur = entity;
    for(let i = 0; i < parts.length; i++){
      if(cur == null) break;
      cur = cur[parts[i]];
    }
    const oldArr = Array.isArray(cur) ? cur.slice() : [];
    let newArr;
    let valueDisplay = '';
    if(opts.action === 'add'){
      const v = opts.value;
      if(v == null || v === '') return false;
      newArr = oldArr.concat([v]);
      valueDisplay = opts.valueDisplay || ((typeof v === 'string') ? v : JSON.stringify(v));   // PT-0: callers may pass a human label for object entries
    } else if(opts.action === 'remove'){
      const idx = (typeof opts.index === 'number') ? opts.index : oldArr.indexOf(opts.value);
      if(idx < 0) return false;
      valueDisplay = opts.valueDisplay || ((typeof oldArr[idx] === 'string') ? oldArr[idx] : JSON.stringify(oldArr[idx]));
      newArr = oldArr.slice(0, idx).concat(oldArr.slice(idx + 1));
    } else {
      return false;
    }
    const label = opts.label || opts.fieldPath;
    try {
      const ev = window.ACKS.newEvent('gm-fiat', {
        submittedBy: 'gm',
        targetTurn: this.currentCampaign?.currentTurn || 1,
        payload: {
          target: { kind: opts.entityType, id: opts.entityId },
          mutation: { fieldPath: opts.fieldPath, newValue: newArr },
          reason: (opts.action === 'add' ? 'GM added' : 'GM removed') + ' ' + label + ': ' + valueDisplay
        }
      });
      let applyResult;
      try {
        applyResult = window.ACKS.applyEvent(this.currentCampaign, ev);
      } catch(applyErr) {
        // §310.3f-fix7 — surface failed edits via toast instead of swallowing.
        // The garrison-unit-without-handler bug was undetectable because of this.
        console.error('commitStatEdit applyEvent failed:', applyErr);
        if(typeof this.showToast === 'function') this.showToast('Edit failed: ' + (applyErr.message || applyErr));
        return false;
      }
      if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
      ev.status = window.ACKS.EVENT_STATUS.APPLIED;
      ev.appliedAtTurn = this.currentCampaign.currentTurn || 1;
      this.currentCampaign.eventLog.push({
        event: ev,
        result: applyResult?.result || { narrativeSummary: label + ': ' + (opts.action === 'add' ? '+' : '−') + ' ' + valueDisplay },
        appliedAtTurn: ev.appliedAtTurn,
        appliedAt: new Date().toISOString()
      });
      // Per-entity history.
      const verb = opts.action === 'add' ? 'added' : 'removed';
      const histSummary = label + ' ' + verb + ': ' + valueDisplay;
      if(opts.entityType === 'character'){
        this.addCharacterHistory(entity, 'gm-edit', histSummary, { fieldPath: opts.fieldPath, action: opts.action, value: opts.value });
      } else if(opts.entityType === 'domain'){
        if(!Array.isArray(entity.history)) entity.history = [];
        entity.history.push({ date: 'Turn ' + (this.currentCampaign.currentTurn || 1), type: 'gm-edit', summary: histSummary, fieldPath: opts.fieldPath, action: opts.action, value: opts.value });
      }
      this.showToast(histSummary);
      return true;
    } catch(e){
      console.error('commitListMutation failed', e);
      this.showToast('Failed: ' + e.message, 5000);
      return false;
    }
  },

  // Reusable GM stat-edit commit. Display-by-default editing standard (memory:
  // feedback-gm-stat-editing): every GM stat unlocks to edit, save commits via a
  // gm-fiat event so changes are audited in the event log plus the most-specific
  // history surface. Returns true if a write happened, false if nothing changed.
  //
  // opts:
  //   entityType: 'domain' | 'character' | 'campaign' | 'settlement' | 'hex' | 'syndicate' | ...
  //   entityId:   entity id (used by the gm-fiat handler to find it)
  //   entity:     direct reference (used for history-side logging; in addition to entityId)
  //   fieldPath:  dot path, e.g. 'demographics.morale'
  //   label:      human label for the campaign log + history entry (e.g. 'Morale')
  //   oldValue, newValue: scalar values; if equal, no-op
  //   reason:     optional GM note string
  commitStatEdit(opts){
    // v0.9.1 — defensive: if entity exists in memory but lacks id (cached-build scenario
    // where the lazy migration hasn't run), assign one now so commitStatEdit doesn't bail.
    if(opts && opts.entity && !opts.entity.id && opts.entityType === 'garrison-unit' && window.ACKS && window.ACKS.newId){
      opts.entity.id = window.ACKS.newId('gar');
      opts.entityId = opts.entity.id;
    }
    if(!opts || !opts.entityType || !opts.entityId || !opts.fieldPath) return false;
    if(!this.isSafeFieldPath(opts.fieldPath)){ console.error('commitStatEdit: refusing unsafe fieldPath', opts.fieldPath); this.showToast('Refused unsafe field path: '+opts.fieldPath, 5000); return false; }
    const oldV = opts.oldValue;
    const newV = opts.newValue;
    // Equality check — no event for no-ops.
    if(oldV === newV) return false;
    if(typeof oldV === 'number' && typeof newV === 'number' && Number.isNaN(oldV) && Number.isNaN(newV)) return false;
    const label = opts.label || opts.fieldPath;
    const reason = opts.reason || 'GM edit';
    try {
      // Build a gm-fiat event so the change is first-class in the audit trail.
      const ev = window.ACKS.newEvent('gm-fiat', {
        submittedBy: 'gm',
        targetTurn: this.currentCampaign?.currentTurn || 1,
        payload: {
          // NB: engine schema field is `kind` (not `type`) per acks-engine.js §EVENT_SCHEMAS
          target: { kind: opts.entityType, id: opts.entityId },
          mutation: { fieldPath: opts.fieldPath, newValue: newV },
          reason
        }
      });
      // Apply immediately (the gm-fiat handler writes the value and captures previousValue).
      // Domains live on the campaign (single home), so handlers traverse campaign.domains directly.
      const applyResult = window.ACKS.applyEvent(this.currentCampaign, ev);
      // #453 — c.kind retired; the editor surface no longer exists and the engine
      // doesn't expose reDeriveClassificationFromKind anymore. Future kind-coupled
      // sync hooks (if needed) belong here in this slot.
      // (The families-per-hex ↔ peasantFamilies sync used to live here as a UI hook; it is
      // now owned by the engine gm-fiat handler — applyEvent_gmFiat (above) routes a
      // hex.families edit through the exported syncRuralPopulationFromHexes setter (commit
      // d3bbef1), which already ran inside the applyEvent call above with domains attached.
      // The UI duplicate was removed 2026-06-02 to avoid a double-sync.)
      // Log the applied event in the event log (matching commitTurn's pattern).
      if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
      ev.status = window.ACKS.EVENT_STATUS.APPLIED;
      ev.appliedAtTurn = this.currentCampaign.currentTurn || 1;
      this.currentCampaign.eventLog.push({
        event: ev,
        result: applyResult?.result || { narrativeSummary: label + ': ' + oldV + ' → ' + newV },
        appliedAtTurn: ev.appliedAtTurn,
        appliedAt: new Date().toISOString(),
        // Operational edits (e.g. journey pace/mode/speed-override) stay in the Event Log audit
        // but are flagged campaignLogHidden — they're knob-turns, not campaign moments. The flag
        // hides them from the Daily Events "show routine" toggle + the per-entity history boxes.
        ...(opts.suppressFromCampaignLog ? { campaignLogHidden: true } : {})
      });
      // Push to entity-specific history for at-a-glance browsing.
      if(opts.entityType === 'character' && opts.entity){
        this.addCharacterHistory(opts.entity, 'gm-edit', label + ': ' + oldV + ' → ' + newV, { fieldPath: opts.fieldPath, oldValue: oldV, newValue: newV, reason });
      } else if(opts.entityType === 'domain' && opts.entity){
        if(!Array.isArray(opts.entity.history)) opts.entity.history = [];
        opts.entity.history.push({
          date: 'Turn ' + (this.currentCampaign.currentTurn || 1),
          type: 'gm-edit',
          summary: label + ': ' + oldV + ' → ' + newV,
          fieldPath: opts.fieldPath, oldValue: oldV, newValue: newV, reason
        });
      }
      // Campaign log for the at-a-glance feed.
      const entityName = opts.entity?.name || opts.entityId;
      this.showToast(opts.toastMessage || (label + ' updated: ' + oldV + ' → ' + newV));
      return true;
    } catch(e){
      console.error('commitStatEdit failed', e);
      this.showToast('Failed to save edit: ' + e.message, 5000);
      return false;
    }
  },

  // Returns level-up info for a single character if they leveled on the previous turn,
  // else null. Used inline on the Roster row. commitTurn writes level-up history BEFORE
  // advancing currentTurn, so last turn's level-ups have turn = currentTurn - 1.
  // Auto-clears one turn later as the window rolls forward.
  characterRecentLevelUp(c){
    if(!c || !this.currentCampaign) return null;
    const prevTurn = (this.currentCampaign.currentTurn || 1) - 1;
    if(prevTurn < 1) return null;
    const entries = (c.history || []).filter(h => h.type === 'level-up' && h.turn === prevTurn);
    if(entries.length === 0) return null;
    const sorted = entries.slice().sort((a, b) => (a.oldLevel || 0) - (b.oldLevel || 0));
    return {
      oldLevel: sorted[0].oldLevel,
      newLevel: sorted[sorted.length - 1].newLevel,
      hpGain: sorted.reduce((s, e) => s + (e.hpGain || 0), 0),
      steps: sorted.length,
      prevTurn
    };
  },
  // Apply a single level-up to a character. Rolls HP, updates title, recomputes saves (already auto), logs history.
  // Returns the level-up record (or null if cap reached / no class table).
  levelUpCharacter(c){return window.ACKS.levelUpCharacter(this.currentCampaign, c);},
  // GM-forced level-up: same as levelUpCharacter but adds an explicit "forced" annotation to the
  // history + log, distinguishing it from XP-driven level-ups during commitTurn.
  forceLevelUp(c){
    if(!c) return;
    const oldLevel = c.level || 1;
    if(oldLevel >= 14){ this.showToast('Already at level 14 cap.', 3000); return; }
    const entry = this.levelUpCharacter(c);
    if(!entry) return;
    // Mark the just-pushed history entry as forced.
    const last = c.history?.[c.history.length-1];
    if(last && last.type === 'level-up') last.forced = true;
    // The levelUpCharacter call above already emitted a character-level-up event with
    // source='auto'; emit a second one with source='gm-fiat' to mark this as a forced override.
    this.recordAppliedEvent('character-level-up', {
      characterId: c.id, oldLevel: entry.oldLevel, newLevel: entry.newLevel, hpGained: entry.hpGain,
      source: 'gm-fiat', reason: 'manual override',
      narrativeSummary: '[GM forced] '+(c.name||'?')+' — '+(c.class||'?')+' L'+entry.oldLevel+' → L'+entry.newLevel+' (manual override).'
    }, { submittedBy: 'gm', result: { domainsChanged: [], hexesChanged: [], charactersChanged: [c.id], treasuryDelta: 0, narrativeSummary: '[GM forced] '+(c.name||'?')+' — '+(c.class||'?')+' L'+entry.oldLevel+' → L'+entry.newLevel+' (manual override).' } });
    this.showToast('Forced level-up: '+(c.name||'?')+' → L'+entry.newLevel);
  },
  // Walk all alive characters; level-up anyone whose XP meets/exceeds their next threshold.
  // Loops in case a character has banked enough XP to gain multiple levels at once.
  // Returns array of {character, levelUps:[entry,...]} for callers that want a summary.
  checkAllCharacterLevelUps(){return window.ACKS.checkAllCharacterLevelUps(this.currentCampaign);},
  // Phase 2.6 followup — saving throws auto-computed from class + level (RR ch.1 per-class tables)
  classSaveArchetype, computeSavingThrows,
  // Phase 2.6 followup 2 — Titles of Nobility per RR p.345
  TITLES_OF_NOBILITY, lookupTitleOfNobility,
  // Total families in a domain's realm = its own + recursive vassal totals
  realmTotalFamilies(d){
    if(!d) return 0;
    const own = (d.demographics?.peasantFamilies||0) + this.effectiveUrbanFamilies(d);
    const vassals = (this.domains||[]).filter(x => x.liegeId === d.id);
    return own + vassals.reduce((s,v) => s + this.realmTotalFamilies(v), 0);
  },
  // Total count of vassal domains beneath this one (recursive)
  vassalDomainCount(d){
    if(!d) return 0;
    const direct = (this.domains||[]).filter(x => x.liegeId === d.id);
    return direct.length + direct.reduce((s,v) => s + this.vassalDomainCount(v), 0);
  },
  // Personal-domain families count (just this domain's families, no vassals)
  personalDomainFamilies(d){
    if(!d) return 0;
    return (d.demographics?.peasantFamilies||0) + this.effectiveUrbanFamilies(d);
  },
  // Resolve the title of nobility for the ruler of this domain (per RR p.345)
  domainRulerTitle(d){
    if(!d) return null;
    return lookupTitleOfNobility(
      this.personalDomainFamilies(d),
      this.vassalDomainCount(d),
      this.realmTotalFamilies(d)
    );
  },
  // Best title across all domains a character rules (returns highest tier)
  characterHighestTitle(c){
    if(!c) return null;
    const ruled = this.characterRulesDomains(c);
    if(ruled.length === 0) return null;
    let best = null;
    ruled.forEach(d => {
      const t = this.domainRulerTitle(d);
      if(t && (!best || t.tier > best.tier)) best = t;
    });
    return best;
  },
  applyComputedSaves(character){
    if(!character) return;
    const saves = computeSavingThrows(character);
    if(!saves) {
      alert('Class "'+(character.class||'?')+'" is not in the archetype map. Add it or enter saves manually.');
      return;
    }
    character.savingThrows = {
      paralysis: saves.paralysis,
      death: saves.death,
      blast: saves.blast,
      implements: saves.implements,
      spells: saves.spells
    };
  },
  // Per-character PA listing across all ruled domains (for character sheet display)
  characterPersonalAuthorities(c){
    if(!c)return [];
    return this.characterRulesDomains(c).map(d => ({
      domainName: d.name,
      income: this.monthlyGrossIncome ? this.monthlyGrossIncome(d) : 0,
      pa: computePersonalAuthority(c.level||1, this.monthlyGrossIncome ? this.monthlyGrossIncome(d) : 0)
    }));
  },
  // Bind a different character as this domain's ruler. Pass null to clear.
  setDomainRuler(d, characterId){
    if(!d) return;
    d.rulerCharacterId = characterId || null;
    // Move the character's currentDomainId to this domain (they're now ruling it)
    if(characterId){
      const ch = (this.currentCampaign?.characters||[]).find(c => c.id === characterId);
      if(ch && !ch.currentDomainId) ch.currentDomainId = d.id;
    }
  },
  // Suggested ruler level for a domain based on size + realm status (ACKS RR p.347+ follow the
  // followers-at-9th-level pattern: bigger domains expect higher-tier characters). Heuristic — GM
  // can override on the character sheet. Roughly maps:
  //   < 100 fam → L4 (chieftain), 100-499 → L5 (knight/baron), 500-1499 → L6 (lord),
  //   1500-4999 → L7-8 (count/viscount), 5000-14999 → L9-10 (duke/marquis), 15000+ → L11+ (prince/king)
  // +1 if isRealm, +1 per direct vassal (cap +3). Clamped 1-14.
  suggestedRulerLevel(d){
    if(!d) return 5;
    const fam = (d.demographics?.peasantFamilies||0) + (this.effectiveUrbanFamilies?.(d) || d.demographics?.urbanFamilies || 0);
    let lvl = 5;
    if(fam < 100) lvl = 4;
    else if(fam < 500) lvl = 5;
    else if(fam < 1500) lvl = 6;
    else if(fam < 5000) lvl = 7;
    else if(fam < 15000) lvl = 9;
    else lvl = 11;
    if(d.isRealm) lvl += 1;
    const vassalCount = (this.domains||[]).filter(x => x.liegeId === d.id).length;
    if(vassalCount > 0) lvl += Math.min(3, vassalCount);
    return Math.max(1, Math.min(14, lvl));
  },
  // Active venture for this character (if any)
  characterActiveVenture(c){if(!c)return null;return (this.currentCampaign?.ventures||[]).find(v=>v.venturerCharacterId===c.id && (v.status==='in-transit'||v.status==='selling')) || null;},
  // A character is "away" / committed while on an active venture (in-transit or selling) OR on an
  // active journey — they can't be picked for a NEW venture or journey until they're back.
  characterIsTravelCommitted(c){ return !!(c && (c.currentJourneyId || this.characterActiveVenture(c))); },
  // Party membership
  characterParty(c){if(!c||!c.partyId)return null;return (this.currentCampaign?.parties||[]).find(p=>p.id===c.partyId)||null;},
  // Location string for display
  characterLocationLabel(c){
    if(!c)return '—';
    const party = this.characterParty(c);
    if(party){return 'with '+party.name;}
    if(c.currentDomainId){
      const d = this.domains.find(x=>x.id===c.currentDomainId);
      return d ? ('in '+d.name) : c.currentDomainId;
    }
    if(c.currentHexId){
      const hex = window.ACKS.findHex(this.currentCampaign, c.currentHexId);
      if(hex){
        const d = hex.domainId ? (this.domains||[]).find(x => x.id === hex.domainId) : null;
        return d ? (hexLabelFor(hex) + ' in ' + d.name) : hexLabelFor(hex);
      }
      return 'hex '+c.currentHexId;
    }
    return '—';
  },
  // Ability modifier per ACKS RAW (RR p.20)
  abilityMod(score){
    if(score>=18)return 3; if(score>=16)return 2; if(score>=13)return 1;
    if(score>=9)return 0;  if(score>=6)return -1; if(score>=4)return -2;
    return -3;
  },
  // Henchman cap = CHA mod + 4 (RR p.347 — typical; varies by class)
  computeHenchmanCap(c){return Math.max(0, this.abilityMod(c?.abilities?.CHA||10) + 4);},

  openCharacterEditor(c){
    this.characterEditing = c;
    this.characterEditingIsNew = false;
    this.characterEditorTab = 'identity';
    this.showCharacterEditorModal = true;
  },

  // ─── Roll Loyalty modal helpers (RR p.168) ───────────────────────────────
  // Open the modal for a character. opts = { reason: 'level-up'|'calamity'|'other',
  // reasonNote: string, modifier: number (-2..+2), pendingEventId: string }.
  // pendingEventId is set when the modal is opened via the Event Log's "Resolve"
  // on a pending loyalty-check event — apply updates that event in-place.
  openLoyaltyRollModal(ch, opts){
    if(!ch){ this.showToast('No character to roll for.'); return; }
    opts = opts || {};
    // RR p.170 — a henchman who outranks his employer's APPARENT level (appearance + living expenses)
    // rolls loyalty at −1 per apparent level of difference. Pre-fill the modifier with that penalty when
    // it applies and the caller didn't pass an explicit modifier (CoL-2, 2026-06-08).
    let mod = Number(opts.modifier ?? 0);
    let apparentNote = '';
    if(opts.modifier == null && window.ACKS && window.ACKS.apparentLevelLoyaltyPenalty && ch.liegeCharacterId){
      const liege = (this.currentCampaign?.characters || []).find(c => c.id === ch.liegeCharacterId);
      if(liege){
        const pen = window.ACKS.apparentLevelLoyaltyPenalty(this.currentCampaign, ch, liege);
        if(pen < 0){
          mod = pen;
          apparentNote = (ch.name || 'This henchman') + ' (L' + (ch.level || 0) + ') outranks ' +
            (liege.name || 'the employer') + "'s apparent level " +
            window.ACKS.apparentLevel(this.currentCampaign, liege) + ' → ' + pen + ' (RR p.170).';
        }
      }
    }
    // RR p.348 Office favor (F&D-8) — +1 to this character's loyalty rolls when his LIEGE holds an
    // active ceremonial office (the office raises the holder's prestige → his vassals are more loyal).
    // === @b10-religion (team) — Religion R3 consecrate-ruler (RR p.422) gives the same +1 (or −1 if the
    // rite went awry). The two POSITIVE prestige bonuses are non-stacking (OQ5 — take the max); an awry
    // −1 still applies. Mirrors _favorDutyLoyaltyRoll's religiousBonus. ===
    let officeNote = '';
    const _ob = (window.ACKS && window.ACKS.officeLoyaltyBonusFor) ? (window.ACKS.officeLoyaltyBonusFor(this.currentCampaign, ch.id) || 0) : 0;
    const _cb = (window.ACKS && window.ACKS.domainConsecrationVassalLoyaltyBonus) ? (window.ACKS.domainConsecrationVassalLoyaltyBonus(this.currentCampaign, ch.id) || 0) : 0;
    const _religiousBonus = _cb < 0 ? (_ob + _cb) : Math.max(_ob, _cb);
    if(_religiousBonus){ mod += _religiousBonus; }
    if(_ob > 0) officeNote = '+1 — ' + (ch.name || 'this vassal') + "'s liege holds a ceremonial office (RR p.348).";
    if(_cb > 0) officeNote += (officeNote ? ' ' : '') + (_ob > 0 ? '(also consecrated — non-stacking)' : ('+1 — ' + (ch.name || 'this vassal') + "'s ruler is consecrated by the gods (RR p.422)."));
    else if(_cb < 0) officeNote += (officeNote ? ' ' : '') + "−1 — the ruler's consecration went awry (RR p.422).";
    this.loyaltyRollState = {
      characterId: ch.id,
      character: ch,
      reason: opts.reason || 'other',
      reasonNote: opts.reasonNote || '',
      modifier: mod,
      apparentNote,
      officeNote,
      rollResult: null,
      pendingEventId: opts.pendingEventId || null,
    };
    this.showLoyaltyRollModal = true;
  },
  closeLoyaltyRollModal(){
    this.showLoyaltyRollModal = false;
    this.loyaltyRollState = null;
  },
  // Re-roll: just refresh rollResult; GM can do this freely until they Apply.
  rollLoyaltyDice(){
    const s = this.loyaltyRollState;
    if(!s || !s.character) return;
    // §310.6 — use effective loyalty (base + wound + mortality) per RR p.166.
    const loy = this.effectiveLoyaltyFor(s.character);
    const mod = Number(s.modifier || 0);
    s.rollResult = window.ACKS.rollLoyalty(loy, mod);
  },
  // §310.6 helper used across UI surfaces.
  effectiveLoyaltyFor(ch){
    if(!ch) return 0;
    if(window.ACKS && window.ACKS.computeEffectiveLoyalty) return window.ACKS.computeEffectiveLoyalty(ch);
    const base = Number(ch.loyalty || 0);
    const wound = Number(ch.permanentWoundPenalty || 0);
    const mort = Number(ch.mortalityPenalty || 0);
    return Math.max(-4, Math.min(4, base + wound + mort));
  },
  // Build + apply a hireling-restored event from the Loyalty Ledger panel
  // ("Cure wound", "Restore mortality", "Reset wage memory" etc.). Convenience
  // single-call path — bypasses the Event Log Resolve flow.
  applyRestorationFor(characterId, restoredKind, opts){
    opts = opts || {};
    const camp = this.currentCampaign; if(!camp){ this.showToast('No campaign loaded.'); return; }
    if(!Array.isArray(camp.eventLog)) camp.eventLog = [];
    const payload = { characterId, restoredKind };
    if(typeof opts.delta === 'number') payload.delta = opts.delta;
    if(opts.narrativeNotes) payload.narrativeNotes = opts.narrativeNotes;
    try {
      const ev = window.ACKS.newEvent('hireling-restored', {
        payload, submittedBy:'gm', targetTurn: camp.currentTurn || 1, status:'applied'
      });
      // §310.3f-fix29 — full campaign + canonical entry shape (same fix
      // pattern as recruit-hireling).
      const out = window.ACKS.applyEvent(camp, ev);
      ev.appliedAtTurn = camp.currentTurn || 1;
      ev.result = out.result;
      camp.eventLog.push({
        event: ev,
        result: out.result,
        appliedAtTurn: ev.appliedAtTurn,
        appliedAt: new Date().toISOString()
      });
      this.showToast(out.result && out.result.narrativeSummary ? out.result.narrativeSummary : 'Restoration recorded.');
    } catch(e){ this.showToast('Restoration failed: '+e.message); }
  },
  // Apply: commit a 'loyalty-check' event. Two paths:
  // (1) Manual (no pendingEventId): create a new event with status=applied,
  //     run it through applyEvent, push to eventLog.
  // (2) Resolve (pendingEventId set): find the pending event, fill payload,
  //     run applyEvent, change status to 'applied', move pendingEvents→eventLog.
  applyLoyaltyRoll(){
    const s = this.loyaltyRollState;
    if(!s || !s.rollResult){ this.showToast('Roll first, then apply.'); return; }
    if(!this.currentCampaign){ this.showToast('No campaign loaded.'); return; }
    const ch = s.character;
    if(!ch){ this.showToast('Character not found.'); return; }
    const payload = {
      characterId: ch.id,
      reason: s.reason,
      reasonNote: s.reasonNote || '',
      modifier: Number(s.modifier || 0),
      rollResult: s.rollResult,
    };
    const camp = this.currentCampaign;
    if(!Array.isArray(camp.eventLog))    camp.eventLog = [];
    if(!Array.isArray(camp.pendingEvents)) camp.pendingEvents = [];

    let ev;
    if(s.pendingEventId){
      // Resolve flow — find existing pending event, fill payload, apply.
      const pIdx = camp.pendingEvents.findIndex(e => e.id === s.pendingEventId);
      if(pIdx < 0){ this.showToast('Pending event not found — falling back to manual emit.'); }
      else {
        ev = camp.pendingEvents[pIdx];
        ev.payload = Object.assign({}, ev.payload || {}, payload);
        // Apply via engine
        // §310.3f-fix29b — full campaign + canonical event-log entry shape.
        const out = window.ACKS.applyEvent(camp, ev);
        ev.status = 'applied';
        ev.appliedAtTurn = camp.currentTurn || 1;
        ev.result = out.result;
        // Move pending → eventLog (canonical entry shape)
        camp.pendingEvents.splice(pIdx, 1);
        camp.eventLog.push({ event: ev, result: out.result, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
        this.showToast('Loyalty roll applied: ' + (s.rollResult.bandLabel || 'rolled') + '.');
        this.closeLoyaltyRollModal();
        return;
      }
    }
    // Manual flow — create a new event already in 'applied' state.
    ev = window.ACKS.newEvent('loyalty-check', {
      payload,
      submittedBy: 'gm',
      targetTurn: camp.currentTurn || 1,
      status: 'applied',
    });
    // §310.3f-fix29b — full campaign + canonical event-log entry shape.
    const out = window.ACKS.applyEvent(camp, ev);
    ev.appliedAtTurn = camp.currentTurn || 1;
    ev.result = out.result;
    camp.eventLog.push({ event: ev, result: out.result, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    this.showToast('Loyalty roll applied: ' + (s.rollResult.bandLabel || 'rolled') + '.');
    this.closeLoyaltyRollModal();
  },

  // ─── Record Calamity modal helpers (RR p.166 + p.165) ────────────────────
  // Opens a small modal to log a hireling-calamity event. On Apply, builds the
  // event, runs it through applyEvent (which records to character.calamities[],
  // pushes to history, applies the -1 standing penalty, and auto-emits a
  // follow-on pending loyalty-check), pushes the calamity itself to eventLog.
  openCalamityModal(ch){
    if(!ch){ this.showToast('No character to record a calamity for.'); return; }
    this.calamityModalState = {
      characterId: ch.id,
      character: ch,
      kind: 'wages',                    // most common default — easy to change
      reasonNote: '',
      severity: 'normal',               // 'minor' | 'normal' | 'severe' — informs ledger annotation
      newEmployerCharacterId: '',       // populated only when kind === 'transfer-of-employment'
    };
    this.showCalamityModal = true;
  },
  closeCalamityModal(){
    this.showCalamityModal = false;
    this.calamityModalState = null;
  },
  // Candidates for the "new employer" picker. Limit to live PCs/NPCs/henchmen
  // who are NOT the calamity target themselves.
  calamityModalCandidatePatrons(){
    const s = this.calamityModalState;
    if(!s) return [];
    return (this.currentCampaign?.characters||[]).filter(c => {
      if(c.id === s.characterId) return false;
      if(c.alive === false) return false;
      return true;
    });
  },
  applyCalamityEmit(){
    const s = this.calamityModalState;
    if(!s){ return; }
    if(!this.currentCampaign){ this.showToast('No campaign loaded.'); return; }
    if(s.kind === 'transfer-of-employment' && !s.newEmployerCharacterId){
      this.showToast('Transfer-of-employment requires a new employer.'); return;
    }
    const camp = this.currentCampaign;
    if(!Array.isArray(camp.eventLog))      camp.eventLog = [];
    if(!Array.isArray(camp.pendingEvents)) camp.pendingEvents = [];
    const payload = {
      characterId: s.characterId,
      kind: s.kind,
      reasonNote: s.reasonNote || '',
      severity: s.severity || 'normal',
    };
    if(s.kind === 'transfer-of-employment'){
      payload.newEmployerCharacterId = s.newEmployerCharacterId;
    }
    const ev = window.ACKS.newEvent('hireling-calamity', {
      payload,
      submittedBy: 'gm',
      targetTurn: camp.currentTurn || 1,
      status: 'applied',
    });
    // §310.3f-fix29b — full campaign + canonical event-log entry shape.
    let out;
    try {
      out = window.ACKS.applyEvent(camp, ev);
    } catch(e){
      console.error('Calamity apply failed:', e);
      this.showToast('Calamity apply failed: ' + e.message);
      return;
    }
    ev.appliedAtTurn = camp.currentTurn || 1;
    ev.result = out.result;
    camp.eventLog.push({ event: ev, result: out.result, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    this.showToast((out.result?.narrativeSummary || 'Calamity recorded.'));
    this.closeCalamityModal();
  },

  // Phase 2.6.5 — Parties sub-view + party CRUD.
  // Admin/programmatic blank party (Inspector Create, etc.). The GM-facing "+ New party"
  // button uses the founder flow below.
  addBlankParty(){
    if(!this.currentCampaign){alert('Open a campaign first.');return;}
    if(!Array.isArray(this.currentCampaign.parties))this.currentCampaign.parties=[];
    const pt = window.ACKS.blankParty({ name: 'New Party' });
    this.currentCampaign.parties.push(pt);
    if(window.ACKS.ensurePartyCampStash) window.ACKS.ensurePartyCampStash(this.currentCampaign, pt);   // every party gets a travelling camp (Items I1; stash subsystem is always-on core)
    return pt;
  },
  // Start a party with one founding character: named after them, placed at their hex,
  // founder added as the first member + leader. Others join from the same hex (below).
  createPartyWithFounder(founderId){
    if(!this.currentCampaign){ alert('Open a campaign first.'); return null; }
    const fid = founderId || this.newPartyFounderId;
    const ch = (this.currentCampaign.characters||[]).find(c => c.id === fid);
    if(!ch){ this.showToast('Pick a character to start the party with.', 3000); return null; }
    if(ch.partyId){ this.showToast('That character is already in a party.', 3000); return null; }
    if(!Array.isArray(this.currentCampaign.parties)) this.currentCampaign.parties = [];
    const pt = window.ACKS.blankParty({
      name: (ch.name ? (ch.name + "'s party") : 'New Party'),
      currentHexId: ch.currentHexId || null,
      leaderCharacterId: ch.id,
      formedAtTurn: this.currentCampaign.currentTurn || null
    });
    this.currentCampaign.parties.push(pt);
    this.addCharacterToParty(pt, ch.id);   // sets ch.partyId
    if(window.ACKS.ensurePartyCampStash) window.ACKS.ensurePartyCampStash(this.currentCampaign, pt);   // every party gets a travelling camp (Items I1; stash subsystem is always-on core)
    this.newPartyPickerOpen = false;
    this.newPartyFounderId = '';
    this.markDirty(); this.schedulePersist();
    this.showToast('Party started: ' + pt.name);
    return pt;
  },
  // ── Character-sheet affiliations (party / journey): start when free, link when engaged ──
  characterPartyOf(ch){ return (ch && ch.partyId) ? ((this.currentCampaign?.parties||[]).find(p => p && p.id === ch.partyId) || null) : null; },
  characterJourneyOf(ch){ return (ch && ch.currentJourneyId) ? (this.journeyById(ch.currentJourneyId) || null) : null; },
  startPartyForCharacter(ch){
    if(!ch) return;
    const pt = this.createPartyWithFounder(ch.id);
    if(!pt) return;
    this.closeCharacterEditor();
    this.openPartyView(pt.id);
  },
  openPartyForCharacter(ch){
    if(!ch || !ch.partyId) return;
    this.closeCharacterEditor();
    this.openPartyView(ch.partyId);
  },
  // Jump to Characters › Parties, select the party, and scroll its detail into view.
  openPartyView(partyId){
    this.currentView = 'roster';
    this.rosterSubView = 'groups';
    if(partyId) this.selectGroup('party', partyId);
    setTimeout(() => {
      const el = partyId && document.getElementById('party-card-' + partyId);
      if(el){ el.scrollIntoView({ behavior:'smooth', block:'center' }); el.style.boxShadow = '0 0 0 3px #facc15'; setTimeout(() => { el.style.boxShadow = ''; }, 1800); }
    }, 80);
  },

  // ── §12 Group model — the merged "Parties" view (Parties / Armies / Units) ──
  // One detail open at a time; selecting clears the other kinds' selections.
  selectGroup(kind, id){
    this.groupSelKind = kind;
    if(kind === 'party'){ this.partySelectedId = id; }
    else if(kind === 'army'){ this.armiesSelectedId = id; this.armyMarchDest = ''; }
    else if(kind === 'unit'){ this.unitSelectedId = id; }
    this.$nextTick(() => { const el = document.getElementById('group-detail'); if(el) el.scrollIntoView({ behavior:'smooth', block:'nearest' }); });
  },
  selectedParty(){ return (this.groupSelKind === 'party' && this.partySelectedId) ? ((this.currentCampaign?.parties||[]).find(p => p && p.id === this.partySelectedId) || null) : null; },
  selectedPartyList(){ const p = this.selectedParty(); return p ? [p] : []; },
  selectedUnit(){ return (this.groupSelKind === 'unit' && this.unitSelectedId && this.currentCampaign) ? (window.ACKS.findUnit(this.currentCampaign, this.unitSelectedId) || null) : null; },
  selectedUnitList(){ const u = this.selectedUnit(); return u ? [u] : []; },
  // The shared row descriptor (engine groupRow) + a hex label + the raw entity, for the tables.
  _groupRow(e){ const c = this.currentCampaign; const r = window.ACKS.groupRow(c, e); r.entity = e; r.hexLabel = r.hexId ? this.journeyHexLabel(r.hexId) : '—'; return r; },
  partyRows(){ const c = this.currentCampaign; if(!c) return []; return (c.parties||[]).filter(p => p && p.status !== 'disbanded').map(p => this._groupRow(p)); },
  // An army's individuated members (officers) — reuses the engine accessor so an army
  // shows its people exactly like a party shows its members.
  groupMembersOf(g){ return g ? (window.ACKS.groupMembers(this.currentCampaign, g) || []) : []; },
  // §12.6 — turn a party into an army (the in-fiction transformation). Members become the
  // army's officers, their mercenary units its first units; the party is consumed.
  musterPartyToArmy(pt){
    if(!pt) return;
    if(!(pt.memberCharacterIds||[]).length){ this.showToast('That party has no members to muster.', 3000); return; }
    if(!confirm('Muster the party “' + (pt.name||'party') + '” into an army?\n\nIts members become the army\'s officers, their mercenary units its first units, and the party is dissolved (its camp goes to the leader).')) return;
    const army = window.ACKS.musterArmyFromParty(this.currentCampaign, pt.id);
    if(!army){ this.showToast('Could not muster the party.', 3000); return; }
    this.markDirty(); this.schedulePersist();
    this.selectGroup('army', army.id);
    const troops = window.ACKS.groupHeadcount(this.currentCampaign, army);
    this.showToast('🎖 ' + (army.name || 'Army') + ' mustered from the party' + (troops ? (' — ' + troops.toLocaleString() + ' troops') : '') + '.');
  },
  openJourneyForCharacter(ch){
    if(!ch || !ch.currentJourneyId) return;
    this.closeCharacterEditor();
    this.journeyOpenDetail(ch.currentJourneyId);
  },
  // Jump to Activities › Ventures (where this character's active venture is listed).
  openVenturesForCharacter(ch){
    this.closeCharacterEditor();
    this.currentView = 'activities';
    this.activitiesSubView = 'ventures';
  },
  // Start a journey FROM a character: if they're in a party, set up the journey for the whole
  // party (prefills its members + start hex); otherwise just this character.
  startJourneyForCharacter(ch){
    if(!ch) return;
    // A character already committed to travel can't begin another journey — open what they're on instead.
    const j = this.characterJourneyOf(ch);
    if(j){ this.openJourneyForCharacter(ch); this.showToast('Already on a journey — opening it.'); return; }
    if(this.characterActiveVenture(ch)){ this.openVenturesForCharacter(ch); this.showToast("Away on a venture — can't start a journey until it resolves."); return; }
    const pt = this.characterPartyOf(ch);
    this.closeCharacterEditor();
    if(pt) this.startJourneyDeepLink({ partyId: pt.id });
    else this.startJourneyDeepLink({ characterId: ch.id });
  },
  removeParty(partyId){
    if(!this.currentCampaign)return;
    const pt = (this.currentCampaign.parties||[]).find(p => p.id === partyId);
    if(!pt)return;
    if(!confirm('Delete party "'+pt.name+'"? Members will be unassigned.'))return;
    // Unassign members
    (this.currentCampaign.characters||[]).forEach(ch => { if(ch.partyId === partyId) ch.partyId = null; });
    this.currentCampaign.parties = (this.currentCampaign.parties||[]).filter(p => p.id !== partyId);
  },
  partyMembers(pt){
    if(!pt || !this.currentCampaign)return [];
    return (this.currentCampaign.characters||[]).filter(ch => ch.partyId === pt.id);
  },
  partyMemberCount(pt){ return this.partyMembers(pt).length; },
  // Canonical label for a mercenary unit (matches the character-sheet Mercenary Company table).
  mercUnitLabel(u){
    if(!u) return 'Unit';
    const rows = (window.ACKS && window.ACKS.HIRELING_MERCENARIES) || [];
    const found = rows.find(r => r.id === u.unitTypeKey);
    return (found && found.label) || u.displayName || u.unitTypeKey || 'Unit';
  },
  // A character's mercenaries (character.mercenaryCompany.units — the Retainers tab) travel with
  // them into a party. Summed per unit type for the party muster display. Returns [{label, count}].
  partyMemberMercSummary(ch){
    const units = window.ACKS.characterMercenaryUnits(this.currentCampaign, ch).filter(u => (u.count || 0) > 0);
    const byType = {};
    for(const u of units){
      const label = this.mercUnitLabel(u);
      byType[label] = (byType[label] || 0) + (u.count || 0);
    }
    return Object.keys(byType).map(label => ({ label, count: byType[label] })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  },
  // Total mercenary soldiers across all members of the party.
  partyMercTotal(pt){
    return this.partyMembers(pt).reduce((sum, ch) => sum + this.partyMemberMercSummary(ch).reduce((s, m) => s + m.count, 0), 0);
  },
  // Total party headcount = character members + the mercenaries traveling with them.
  partyTotalHeadcount(pt){
    return this.partyMembers(pt).length + this.partyMercTotal(pt);
  },
  charactersNotInAnyParty(){
    if(!this.currentCampaign)return [];
    return (this.currentCampaign.characters||[]).filter(ch => ch.alive !== false && !ch.partyId);
  },
  // Party-less characters in the same hex as the party — the candidates who can join it.
  charactersInPartyHex(pt){
    if(!pt || !this.currentCampaign)return [];
    const hex = pt.currentHexId || null;
    return (this.currentCampaign.characters||[]).filter(ch => ch.alive !== false && !ch.partyId && (ch.currentHexId||null) === hex);
  },
  // Party Current-hex lock-edit (Generate style), same ✏/✓/× draft mechanic as editableStat.
  // The pick lives in a draft; the logged gm-fiat event fires ONLY on save (partyHexEditSave),
  // never on the dropdown @change.
  partyHexEditStart(pt){ if(!pt) return; pt._hexDraft = pt.currentHexId || null; pt._hexEditing = true; },
  partyHexEditCancel(pt){ if(!pt) return; pt._hexEditing = false; pt._hexDraft = null; },
  partyHexEditSave(pt){
    if(!pt) return;
    const oldV = pt.currentHexId || null;
    const newV = pt._hexDraft || null;
    if(oldV !== newV){
      // commitStatEdit emits + applies a gm-fiat event ("Moved/Placed/Cleared <party> …").
      this.commitStatEdit({ entityType:'party', entityId:pt.id, entity:pt, fieldPath:'currentHexId', label:'Party location', oldValue:oldV, newValue:newV });
      this.markDirty(); this.schedulePersist();
    }
    pt._hexEditing = false; pt._hexDraft = null;
  },
  addCharacterToParty(pt, characterId){
    if(!pt || !characterId)return;
    const ch = (this.currentCampaign?.characters||[]).find(x => x.id === characterId);
    if(!ch)return;
    ch.partyId = pt.id;
    if(!pt.leaderCharacterId) pt.leaderCharacterId = ch.id;   // first member founds/leads
    window.ACKS.reconcilePartyMembership(this.currentCampaign);   // keep the memberCharacterIds mirror live (#521)
  },
  removeCharacterFromParty(ch){
    if(!ch)return;
    const pid = ch.partyId;
    ch.partyId = null;
    // keep leaderCharacterId pointing at an actual current member (or null)
    if(pid){
      const pt = (this.currentCampaign?.parties||[]).find(p => p.id === pid);
      if(pt && pt.leaderCharacterId === ch.id){
        const others = (this.currentCampaign?.characters||[]).filter(c => c.partyId === pid);
        pt.leaderCharacterId = others.length ? others[0].id : null;
      }
    }
    window.ACKS.reconcilePartyMembership(this.currentCampaign);   // rebuild mirror + re-validate leader (#521)
  },
  // Hand party leadership to a member — logged via gm-fiat ("Made <ch> leader of <party> …").
  makePartyLeader(pt, ch){
    if(!pt || !ch || pt.leaderCharacterId === ch.id) return;
    this.commitStatEdit({ entityType:'party', entityId:pt.id, entity:pt, fieldPath:'leaderCharacterId', label:'Party leader', oldValue:(pt.leaderCharacterId||null), newValue:ch.id });
    this.markDirty(); this.schedulePersist();
  },
  // Dissolve a party: the leader takes the camp (all its equipment + coin), members are released,
  // the party is marked disbanded. The camp re-homes to the leader as a personal stash (or, if there's
  // no leader, is left as an ownerless cache at the hex). Splitting the camp among members is a queued
  // future feature (Stash plan §15). Routes the camp handoff through the engine (canonical setter).
  disbandParty(pt){
    if(!pt) return;
    const leader = (this.currentCampaign?.characters||[]).find(c => c.id === pt.leaderCharacterId);
    const members = this.partyMembers(pt);
    const camp = window.ACKS.partyCampStash ? window.ACKS.partyCampStash(this.currentCampaign, pt.id) : null;
    const campHasStuff = camp && (camp.items||[]).length;
    let msg = 'Disband ' + (pt.name || 'this party') + '? ';
    if(campHasStuff){ msg += leader ? ('Its camp (' + Math.round(window.ACKS.stashTotalGp(camp)).toLocaleString() + ' gp + gear) goes to ' + (leader.name || 'the leader') + '. ') : 'Its camp will be left as a cache at the hex. '; }
    msg += members.length ? (members.length + ' member' + (members.length===1?'':'s') + ' will be released.') : '';
    if(!confirm(msg)) return;
    if(window.ACKS.handOffPartyCampToLeader) window.ACKS.handOffPartyCampToLeader(this.currentCampaign, pt);   // leader takes the equipment (engine)
    for(const ch of members){ if(ch) ch.partyId = null; }                                                     // release members
    pt.status = 'disbanded';
    pt.disbandedAtTurn = this.currentCampaign?.currentTurn || null;
    (pt.history = pt.history || []).push({ turn: this.currentCampaign?.currentTurn || null, type:'disbanded', narrative: (pt.name||'Party') + ' disbanded' + (leader ? (' — camp to ' + (leader.name||'leader')) : '') });
    pt.leaderCharacterId = null;
    window.ACKS.reconcilePartyMembership(this.currentCampaign);
    this.markDirty(); this.schedulePersist();
    this.showToast((pt.name||'Party') + ' disbanded.' + (leader && campHasStuff ? (' Camp handed to ' + (leader.name||'the leader') + '.') : ''));
  },
  // (Foundation #193) Deprecated — kept as a thin shim. The canonical add path is
  // addRumorAtSettlement(settlementId) which writes to top-level campaign.rumors with a reach
  // entry. This shim translates the old (settlement) call signature to the new one for any
  // remaining call sites; emit a console warning if hit so we can find and migrate them.
  addRumorToSettlement(settlement){
    if(!settlement || !settlement.id) return;
    console.warn('addRumorToSettlement is deprecated; use addRumorAtSettlement(settlementId). Auto-translating.');
    this.addRumorAtSettlement(settlement.id);
  },

  // Aggregated hex list with friendly labels for the party hex picker. Cached per evaluation; cheap to recompute.
  // (Removed the `get allHexes()` accessor that lived here — it was shadowed by the
  // allHexes() method defined later in this object, so it never ran. The only consumer
  // (the Parties hex picker) now uses journeyHexOptions(), which merges top-level +
  // per-domain hexes. See the Parties panel lock-edit hex control.)
  openNewCharacterEditor(opts={}){
    if(!this.currentCampaign){alert('Open a campaign first.');return;}
    const ch = blankCharacter(opts);
    if(!Array.isArray(this.currentCampaign.characters))this.currentCampaign.characters=[];
    this.currentCampaign.characters.push(ch);
    this.characterEditing = ch;
    this.characterEditingIsNew = true;
    this.characterEditorTab = 'identity';
    this.showCharacterEditorModal = true;
  },
  closeCharacterEditor(){
    // If they just created a brand-new character and didn't name them, remove the orphan
    if(this.characterEditingIsNew && this.characterEditing && (!this.characterEditing.name || this.characterEditing.name === 'New Character')){
      const idx = this.currentCampaign.characters.indexOf(this.characterEditing);
      if(idx >= 0) this.currentCampaign.characters.splice(idx, 1);
    }
    this.showCharacterEditorModal = false;
    this.characterEditing = null;
    this.characterEditingIsNew = false;
  },
  softDeleteCharacter(c){
    if(!c)return;
    if(!confirm('Mark "'+c.name+'" as deceased? Historical ledger entries, ventures, and references to them are preserved. They can be restored from the Show deceased filter.'))return;
    c.alive = false;
    c.deceasedTurn = this.currentCampaign?.currentTurn || 1;
    this.addCharacterHistory(c, 'death', 'Died or retired from active play.', {});
    this.recordAppliedEvent('character-death', {
      characterId: c.id, kind: 'death',
      narrativeSummary: 'Character died/retired: '+c.name+'.'
    }, { submittedBy: 'gm', result: { domainsChanged: [], hexesChanged: [], charactersChanged: [c.id], treasuryDelta: 0, narrativeSummary: 'Character died/retired: '+c.name+'.' } });
  },
  restoreCharacter(c){
    if(!c)return;
    c.alive = true;
    c.deceasedTurn = null;
    this.addCharacterHistory(c, 'restore', 'Restored to active roster.', {});
  },
  // House Rules sub-view (defaults to Domain, the most-used category)
  houseRulesSubView:'domain',
  venturesMerchandiseFilter:'all', // 'all' | 'common' | 'precious'
  venturesShowReference:true,
  // Per-venturer derived stats (computed on-demand from campaign.ventures)
  // Phase 2.6 fold-in: venturer state lives on characters now. These helpers operate on character objects.
  venturerStats(character){
    if(!character)return {completed:0, failed:0, inProgress:0, activeVentures:[], lifetimeGp:0};
    const ventures=(this.currentCampaign?.ventures||[]).filter(v=>v.venturerCharacterId===character.id);
    const active=ventures.filter(v=>v.status==='in-transit'||v.status==='selling');
    return {
      completed: ventures.filter(v=>v.status==='complete').length,
      failed: ventures.filter(v=>v.status==='failed').length,
      inProgress: active.length,
      activeVentures: active,
      lifetimeGp: (character.earningsLedger||[]).reduce((s,e)=>s+(e.gp||0),0)
    };
  },
  // Filter the character roster to "venturer-ish" characters — explicit Venturer class OR has
  // any mercantile history. Used to populate the Venturers sub-tab and the venture-create dropdown.
  venturerCharacters(){
    return (this.currentCampaign?.characters||[]).filter(c =>
      c.alive !== false && (
        c.class === 'Venturer' ||
        (c.mercantileNetwork||[]).length > 0 ||
        (c.earningsLedger||[]).length > 0
      )
    );
  },
  // Find any active venture for a given character name (mutex check on RAW one-venture-at-a-time)
  activeVenturesByCharacterName(name){
    if(!name)return [];
    const trimmed=name.trim();
    const ch=(this.currentCampaign?.characters||[]).find(c=>c.name===trimmed);
    if(!ch)return [];
    return (this.currentCampaign?.ventures||[]).filter(v=>v.venturerCharacterId===ch.id&&(v.status==='in-transit'||v.status==='selling'));
  },

  // ========== Phase 2b.6: Passive Investments (RR p.383) ==========
  // RAW risk-tier monthly return rates from RR p.383. All five tiers present even though commercial
  // expeditions only use balanced/risky — business establishments and money lending use all tiers.
  passiveInvestmentRate(tier){return window.ACKS.passiveInvestmentRate(tier);},
  passiveInvestmentRateLabel(tier){
    return ({
      safe:     'Safe (0.25%/mo)',
      cautious: 'Cautious (0.5%/mo)',
      balanced: 'Balanced (1%/mo)',
      risky:    'Risky (3%/mo)',
      perilous: 'Perilous (9%/mo)'
    })[tier] || tier;
  },
  // Investment type metadata. UI uses this to populate dropdowns and filter risk tiers per type.
  passiveInvestmentTypes(){
    return [
      { id:'commercial-expedition', label:'Commercial expedition', allowedTiers:['balanced','risky'],
        description:'Funding mercantile ventures someone else runs. Balanced = short-distance routes; Risky = long-distance.' },
      { id:'business-establishment', label:'Business establishment', allowedTiers:['safe','cautious','balanced','risky','perilous'],
        description:'Inn, store, smithy, guild, brewery, mill, etc. — someone else operates it; the investor collects monthly returns.' },
      { id:'money-lending', label:'Money lending', allowedTiers:['safe','cautious','balanced','risky','perilous'],
        description:'Loans to NPCs, businesses, or realms. Risk tier = creditworthiness of the debtor.' }
    ];
  },
  lookupPassiveInvestmentType(id){return this.passiveInvestmentTypes().find(t=>t.id===id);},
  allowedTiersForType(typeId){return this.lookupPassiveInvestmentType(typeId)?.allowedTiers || ['balanced','risky'];},
  // Computed monthly gp for an investment (RAW: capital × rate, RR p.383).
  passiveInvestmentMonthlyGp(inv){return window.ACKS.passiveInvestmentMonthlyGp(inv);},
  // Heuristic capital suggestion for a character-owned commercial expedition.
  // Tool convenience: level × 10K + markets × 5K. Other owner types start at 0.
  suggestInvestmentCapital(inv){
    if(!inv)return 0;
    if(inv.type !== 'commercial-expedition' || !inv.ownerCharacterId) return 0;
    const ch = (this.currentCampaign?.characters||[]).find(c => c.id === inv.ownerCharacterId);
    if(!ch) return 0;
    const level = ch.level || 1;
    const network = (ch.mercantileNetwork||[]).length;
    return Math.round(level * 10000 + network * 5000);
  },
  applySuggestedCapital(inv){
    if(!inv)return;
    const sug = this.suggestInvestmentCapital(inv);
    if(sug > 0) inv.capital = sug;
  },
  // Mutex check: a venturer's commercial-expedition investment conflicts with active ventures
  // (same physical capital). Other investment types don't conflict.
  canEnableInvestment(inv){
    if(!inv) return false;
    if(inv.type !== 'commercial-expedition') return true;
    if(!inv.ownerCharacterId) return true; // no character link, no conflict
    const ch = (this.currentCampaign?.characters||[]).find(c => c.id === inv.ownerCharacterId);
    if(!ch) return true;
    return this.venturerStats(ch).activeVentures.length === 0;
  },
  togglePassiveInvestment(inv){
    if(!inv) return;
    if(!inv.enabled){
      // Trying to ENABLE
      if(!this.canEnableInvestment(inv)){
        alert(inv.ownerName + ' has an active venture in progress. Commercial-expedition investments commit the same capital and can\'t run while the active venture is in transit. Complete or abort the venture first.');
        return;
      }
      inv.enabled = true;
    } else {
      // Disabling (instant for now; graceful liquidation per RAW arrives with task #97)
      inv.enabled = false;
    }
  },
  // Process all passive investments for the current turn (commitTurn caller).
  // Returns { totalGp, payouts: [{name, gp, destination}] }.
  processPassiveInvestmentsForTurn(){return window.ACKS.processPassiveInvestmentsForTurn(this.currentCampaign);},

  // Creation modal state (Phase 2.6 fold-in — picks from characters[] instead of venturers[])
  showPassiveInvestmentCreateModal: false,
  passiveInvestmentDraft: {
    name: '',
    ownerKind: 'character',           // 'character' picks from roster; 'manual' types free-text
    ownerName: '',
    ownerCharacterId: null,
    type: 'commercial-expedition',
    riskTier: 'balanced',
    capital: 0,
    destinationDomainId: null
  },
  openPassiveInvestmentCreateModal(){
    this.passiveInvestmentDraft = {
      name: '',
      ownerKind: 'character',
      ownerName: '',
      ownerCharacterId: null,
      type: 'commercial-expedition',
      riskTier: 'balanced',
      capital: 0,
      destinationDomainId: null
    };
    this.showPassiveInvestmentCreateModal = true;
  },
  cancelPassiveInvestmentCreate(){this.showPassiveInvestmentCreateModal=false;},
  // When the GM picks a character as owner, snap ownerName from the character's name
  onInvestmentOwnerChange(){
    const d = this.passiveInvestmentDraft;
    if(d.ownerKind === 'character' && d.ownerCharacterId){
      const ch = (this.currentCampaign?.characters||[]).find(x => x.id === d.ownerCharacterId);
      if(ch) d.ownerName = ch.name;
    }
  },
  // When type changes, snap riskTier to the first allowed tier for that type
  onInvestmentTypeChange(){
    const d = this.passiveInvestmentDraft;
    const allowed = this.allowedTiersForType(d.type);
    if(!allowed.includes(d.riskTier)) d.riskTier = allowed[0];
  },
  createPassiveInvestment(){
    const d = this.passiveInvestmentDraft;
    if(!d.ownerName.trim()){alert('Owner name is required.');return;}
    if(!this.allowedTiersForType(d.type).includes(d.riskTier)){alert('That risk tier is not allowed for this investment type.');return;}
    const cap = parseInt(d.capital)||0;
    if(cap <= 0){alert('Capital must be > 0.');return;}
    const inv = {
      id: 'inv-' + Math.random().toString(36).slice(2,9),
      name: d.name.trim() || (d.ownerName.trim() + ' — ' + this.lookupPassiveInvestmentType(d.type)?.label),
      ownerKind: d.ownerKind,
      ownerName: d.ownerName.trim(),
      ownerCharacterId: d.ownerKind === 'character' ? (d.ownerCharacterId || null) : null,
      type: d.type,
      riskTier: d.riskTier,
      capital: cap,
      destinationDomainId: d.destinationDomainId || null,
      enabled: true,
      createdTurn: this.currentCampaign?.currentTurn || 1,
      vagaries: [],
      notes: ''
    };
    if(!Array.isArray(this.currentCampaign.passiveInvestments)) this.currentCampaign.passiveInvestments = [];
    // Validate mutex before committing
    if(!this.canEnableInvestment(inv)){
      if(!confirm(d.ownerName + ' has an active venture running. Creating this commercial-expedition investment will start it DISABLED. Continue?')){return;}
      inv.enabled = false;
    }
    this.currentCampaign.passiveInvestments.push(inv);
    const createSummary = 'Passive investment created — ' + inv.name + ' (' + inv.capital.toLocaleString() + 'gp at ' + this.passiveInvestmentRateLabel(inv.riskTier) + ').';
    this.recordAppliedEvent('passive-investment-create', {
      investmentId: inv.id, ownerCharacterId: inv.ownerCharacterId, capital: inv.capital,
      type: inv.type, name: inv.name, riskTier: inv.riskTier, destinationDomainId: inv.destinationDomainId,
      narrativeSummary: createSummary
    }, { submittedBy: 'gm', result: { domainsChanged: [], hexesChanged: [], charactersChanged: inv.ownerCharacterId ? [inv.ownerCharacterId] : [], treasuryDelta: 0, narrativeSummary: createSummary } });
    this.showPassiveInvestmentCreateModal = false;
    this.showToast('Investment created.');
  },
  deletePassiveInvestment(inv){
    if(!inv) return;
    if(!confirm('Delete passive investment "' + inv.name + '"? Capital is removed from tracking; existing earnings ledger entries remain.')) return;
    const idx = this.currentCampaign.passiveInvestments.indexOf(inv);
    if(idx >= 0) this.currentCampaign.passiveInvestments.splice(idx, 1);
    const delSummary = 'Passive investment deleted — ' + inv.name + '.';
    this.recordAppliedEvent('passive-investment-delete', {
      investmentId: inv.id, narrativeSummary: delSummary
    }, { submittedBy: 'gm', result: { domainsChanged: [], hexesChanged: [], charactersChanged: [], treasuryDelta: 0, narrativeSummary: delSummary } });
  },
  // Phase 2b.3 — Demand modifier helpers (the editor UI lives in the Settlement sheet ▸ Demand tab).
  setDM(settlement, merchandiseId, value){
    if(!settlement)return;
    if(!settlement.demandModifiers)settlement.demandModifiers={};
    const v = Math.max(-10, Math.min(10, Math.round(value||0)));
    if(v === 0){
      delete settlement.demandModifiers[merchandiseId];
    } else {
      settlement.demandModifiers[merchandiseId] = v;
    }
  },
  adjustDM(settlement, merchandiseId, delta){
    if(!settlement)return;
    const cur = (settlement.demandModifiers && settlement.demandModifiers[merchandiseId]) || 0;
    this.setDM(settlement, merchandiseId, cur + delta);
  },
  clearAllDMs(settlement){
    if(!settlement)return;
    if(!confirm('Clear all demand modifiers for "'+(settlement.name||'this settlement')+'" back to 0?'))return;
    settlement.demandModifiers = {};
  },
  // Roll 1d3-1d3 per merchandise type per JJ Step A (p.201). Range -2 to +2.
  // Full Generating Demand Modifiers machinery (environmental, biome, age, land revenue, racial,
  // trade routes — JJ Steps B-E) is queued as task #95.
  rollRandomDMs(settlement){
    if(!settlement)return;
    if(!confirm('Roll a fresh set of demand modifiers (1d3−1d3 per merchandise, JJ Step A only) for "'+(settlement.name||'this settlement')+'"? This overwrites all current DMs.'))return;
    settlement.demandModifiers = {};
    MERCHANDISE_CATALOG.forEach(m => {
      const d1 = 1 + Math.floor(Math.random()*3); // 1d3
      const d2 = 1 + Math.floor(Math.random()*3); // 1d3
      const dm = d1 - d2;
      if(dm !== 0) settlement.demandModifiers[m.id] = dm;
    });
    this.showToast('Rolled DMs (JJ Step A only). Add environmental/biome/etc. by hand or wait for task #95.');
  },
  // Effective price per stone given a demand modifier. Floored at one priceStep to keep positive.
  dmEffectivePrice(merchandise, dm){
    if(!merchandise)return 0;
    const base = merchandise.basePrice || 0;
    const step = merchandise.priceStep || 0;
    const raw = base + step * (dm||0);
    return Math.max(step, raw);
  },
  // Count of non-zero demand modifiers on a settlement (for the "N DMs" display on settlement rows).
  settlementNonZeroDMCount(settlement){
    if(!settlement||!settlement.demandModifiers)return 0;
    return Object.values(settlement.demandModifiers).filter(v => v !== 0).length;
  },

  // ========== Phase 2b.4: Venture lifecycle ==========
  showVentureCreateModal:false,
  showVentureCompleteModal:false,
  ventureCompletingId:null,
  ventureSalePriceInput:0,
  ventureDraft:{
    venturerCharacterId:'',
    venturerName:'',
    venturerLevel:1,
    originDomainId:'',
    destinationDomainId:'',
    cargo:[],
    notes:'',
    turnsUntilArrival:2
  },
  // Helper: resolve the selected venturer character (or null) from the draft
  ventureDraftCharacter(){
    const id = this.ventureDraft?.venturerCharacterId;
    if(!id) return null;
    return (this.currentCampaign?.characters||[]).find(c=>c.id===id) || null;
  },
  // When the venturer picker changes, populate name/level and default origin from their location
  onVentureVenturerChange(){
    const ch = this.ventureDraftCharacter();
    if(!ch) return;
    this.ventureDraft.venturerName = ch.name || '';
    this.ventureDraft.venturerLevel = ch.level || 1;
    // Default origin market to the character's current domain — but only if that domain has at least one settlement
    if(!this.ventureDraft.originDomainId && ch.currentDomainId){
      const hasSettlement = this.allSettlements().some(s=>s.domainId===ch.currentDomainId);
      if(hasSettlement) this.ventureDraft.originDomainId = ch.currentDomainId;
    }
  },
  // Returns flat list of {domainId, domainName, hexIndex, settlement} for all settlements across all domains
  // (used to populate origin/destination dropdowns in venture creation).
  // Phase 2.7 World — flat list of all hexes across all domains with back-references.
  // Returns array of {domainId, domainName, hexIndex, hex}. Used by the World > Hexes view.
  allHexes(){
    // T6 single-home — campaign.hexes IS the complete hex set (owned + unclaimed wilderness); the
    // per-domain geography.hexes mirror is gone. Each entry bundles its canonical settlement so the
    // view reads entry.settlement (not the deleted hex.settlement). hexIndex = the campaign.hexes index
    // (a stable UI key only).
    const out = [];
    const c = this.currentCampaign;
    (c?.hexes||[]).forEach((h, hi) => {
      if(!h || !h.id) return;
      const d = h.domainId ? (this.domains||[]).find(x => x.id === h.domainId) : null;
      out.push({ domainId: d ? d.id : null, domainName: d ? d.name : 'Unclaimed', domainless: !d, hexIndex: hi, hex: h,
                 settlement: (window.ACKS && window.ACKS.settlementForHex) ? window.ACKS.settlementForHex(c, h.id) : null });
    });
    return out;
  },
  // Apply filter + search to allHexes for the World view
  filteredHexes(){
    const q = (this.worldHexSearch||'').trim().toLowerCase();
    const filter = this.worldHexFilter || 'all';
    return this.allHexes().filter(entry => {
      const h = entry.hex;
      if(filter === 'settled' && !entry.settlement) return false;   // T6 single-home — allHexes bundles the canonical settlement
      if(filter === 'lairs' && (!h.lairs || h.lairs.length === 0)) return false;
      if(filter === 'dungeons' && (!h.dungeons || h.dungeons.length === 0)) return false;
      if(filter === 'unexplored' && h.explored !== false) return false;
      const d = this.domains.find(x => x.id === entry.domainId);
      const eff = this.effectiveHexClassification(d, h);
      if(filter === 'civilized' && eff !== 'Civilized') return false;
      if(filter === 'borderlands' && eff !== 'Borderlands') return false;
      if(filter === 'outlands' && eff !== 'Outlands') return false;
      if(q){
        const haystack = [
          h.terrain||'', h.primaryStructure||'', h.notes||'', h.monsterNotes||'',
          entry.domainName||'',
          window.ACKS.hexDisplayLabel(h.coord?.q||0, h.coord?.r||0),
          ...(h.lairs||[]).map(l=>(l.name||'')+' '+(l.description||'')),
          ...(h.dungeons||[]).map(l=>(l.name||'')+' '+(l.description||'')),
          ...(h.pointsOfInterest||[]).map(l=>(l.name||'')+' '+(l.description||'')),
          entry.settlement?.name || ''
        ].join(' ').toLowerCase();
        if(!haystack.includes(q)) return false;
      }
      return true;
    });
  },

  // ───── Stash B (Items I1 / Phase 2.95) — located-wealth UI helpers ─────
  stashSearch:'', stashOwnerFilter:'all',
  stashDetailId:null, stashDetailTab:'items',
  notableModalId:null,
  _stashDepositDraft:{ denomination:'gp', qty:0 },
  _stashItemDraft:{ name:'', qty:1, encumbranceSt:1 },
  // Character ⇄ co-located stash transfer (Items I1 Step 3). Operates on characterEditing.
  stashTransferOpen:false, stashTransferStashId:null, stashTransferDir:'deposit',
  stashTransferCoins:{ pp:0, gp:0, ep:0, sp:0, cp:0 },
  stashTransferItemSel:{},   // deposit: inventory-index → bool · withdraw: stash-item-id → bool
  // Forage / Hunt action (Provisioning V4) — a thin UI over ACKS.forageActivity / huntActivity.
  forage:{ open:false, actorId:null, kind:'food', results:[] },   // kind: 'water'|'food'|'firewood'|'hunt'; results = this session's stacked attempts (each rerollable)
  allStashes(){
    const camp = this.currentCampaign;
    if(!camp || !Array.isArray(camp.stashes)) return [];
    return camp.stashes.map(s => ({
      stash: s,
      totalGp: window.ACKS.stashTotalGp(s),
      totalSt: window.ACKS.stashTotalEncumbrance(s),
      itemCount: (s.items||[]).length,
      ownerLabel: this.stashOwnerLabel(s),
      hexLabel: this.stashHexLabel(s)
    }));
  },
  filteredStashes(){
    const q = (this.stashSearch||'').trim().toLowerCase();
    const f = this.stashOwnerFilter || 'all';
    return this.allStashes().filter(row => {
      const s = row.stash;
      if(f === 'treasury' && s.kind !== 'domain-treasury') return false;
      if(f === 'personal' && s.kind !== 'personal') return false;
      if(f === 'party' && s.kind !== 'party') return false;
      if(f === 'cache' && s.kind !== 'cache') return false;
      if(f === 'hidden' && !s.isHidden) return false;
      if(q){
        const hay = [s.name||'', s.kind||'', row.ownerLabel, row.hexLabel].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  },
  stashOwnerLabel(s){
    if(!s) return '—';
    if(s.ownerCharacterId){ const c=(this.currentCampaign?.characters||[]).find(x=>x.id===s.ownerCharacterId); return c ? (c.name||'(unnamed)') : '(missing character)'; }
    if(s.ownerDomainId){ const d=(this.domains||[]).find(x=>x.id===s.ownerDomainId); return d ? (d.name||'(unnamed)')+' (domain)' : '(missing domain)'; }
    if(s.ownerPartyId){ const p=(this.currentCampaign?.parties||[]).find(x=>x.id===s.ownerPartyId); return p ? (p.name||'(party)')+' (party)' : '(missing party)'; }
    return 'unowned';
  },
  stashHexLabel(s){
    if(!s || !s.hexId) return '—';
    const h=(this.currentCampaign?.hexes||[]).find(x=>x.id===s.hexId);
    return h ? hexLabelFor(h) : s.hexId;
  },
  stashKindLabel(s){ return ({ 'domain-treasury':'Treasury','personal':'Personal','party':'Party loot','cache':'Cache' })[s&&s.kind] || (s&&s.kind) || '—'; },
  // The stash owner label is a clickable link to its entity's view, when there's a clean opener
  // (character sheet / party view). Domain-treasury owners stay text (no per-domain opener yet).
  stashOwnerLinkable(s){ return !!(s && (s.ownerCharacterId || s.ownerPartyId)); },
  openStashOwner(s){
    if(!s) return;
    if(s.ownerCharacterId){
      const c=(this.currentCampaign?.characters||[]).find(x=>x.id===s.ownerCharacterId);
      if(c){ this.closeStashDetail(); this.openCharacterEditor(c); }
      return;
    }
    if(s.ownerPartyId){
      this.closeStashDetail();
      if(this.showCharacterEditorModal) this.closeCharacterEditor();
      this.openPartyView(s.ownerPartyId);
    }
  },
  stashItemLabel(it){
    if(!it) return '—';
    const pf = window.ACKS.primaryFacet(it);
    if(pf==='coin') return (it.qty||0).toLocaleString()+' '+(it.denomination||'gp');
    if(pf==='valuable') return (it.name || (it.valuableTier ? it.valuableTier+' '+(it.valuableType||'valuable') : 'valuable')) + (it.qty>1?(' ×'+it.qty):'');
    return (it.name||'(unnamed)') + (it.qty>1?(' ×'+it.qty):'') + (it.notableItemId?' ★':'');
  },
  stashItemFacetsLabel(it){ return (window.ACKS.itemFacets(it)||[]).join(' · '); },
  openStashDetail(id){ this.stashDetailId=id; this.stashDetailTab='items'; },
  // A promoted stash line points at a campaign.notableItems[] entity — open it in its own modal
  // (layered over the stash modal, so closing returns to the stash; no tab diversion).
  openNotableFromLine(it){
    if(!it || !it.notableItemId) return;
    this.openNotableModal(it.notableItemId);
  },
  openNotableModal(id){ this.notableModalId = id; },
  closeNotableModal(){ this.notableModalId = null; },
  notableModalItem(){ return this.notableModalId ? window.ACKS.findNotableItem(this.currentCampaign, this.notableModalId) : null; },
  notableKindLabel(k){ return ({'magic-weapon':'Magic weapon','magic-armor':'Magic armor','potion':'Potion','scroll':'Scroll','wand':'Wand','rod':'Rod','staff':'Staff','misc-magic':'Misc. magic','book':'Book','relic':'Relic','regalia':'Regalia','masterwork':'Masterwork'})[k] || k || '—'; },
  notableMakerName(it){ if(!it||!it.provenance||!it.provenance.makerCharacterId) return null; const c=(this.currentCampaign?.characters||[]).find(x=>x.id===it.provenance.makerCharacterId); return c ? c.name : it.provenance.makerCharacterId; },
  // Promote a carry-inventory line into a tracked Notable Item — parity with the stash's ★ promote.
  // promoteLineToNotableItem tolerates the Phase 2.6 {name,stone,notes} shape (it only tags facets when a
  // facets[] already exists), so here it just creates the NotableItem + sets the line's notableItemId.
  promoteCarryItem(ii){
    const ch = this.characterEditing; if(!ch || !Array.isArray(ch.inventory)) return;
    const it = ch.inventory[ii]; if(!it || it.notableItemId) return;
    window.ACKS.promoteLineToNotableItem(this.currentCampaign, it, { name: it.name||'' });
    this.markDirty(); this.schedulePersist();
  },
  closeStashDetail(){ this.stashDetailId=null; },
  stashDetailStash(){ return this.stashDetailId ? window.ACKS.findStash(this.currentCampaign, this.stashDetailId) : null; },
  _afterStashMutation(){ this.markDirty(); this.schedulePersist(); },
  stashDepositCoins(){
    const s=this.stashDetailStash(); if(!s) return;
    const qty=parseInt(this._stashDepositDraft.qty,10)||0; if(qty<=0) return;
    window.ACKS.depositToStash(this.currentCampaign, s.id, [{ facets:['coin'], denomination:this._stashDepositDraft.denomination||'gp', qty }], { reason:'gm-deposit', atTurn:(this.currentCampaign.currentTurn||1) });
    this._stashDepositDraft.qty=0; this._afterStashMutation();
  },
  stashAddItem(){
    const s=this.stashDetailStash(); if(!s) return;
    const d=this._stashItemDraft; if(!(d.name||'').trim()) return;
    window.ACKS.depositToStash(this.currentCampaign, s.id, [{ facets:['gear'], name:d.name.trim(), qty:(parseInt(d.qty,10)||1), encumbranceSt:(parseFloat(d.encumbranceSt)||0) }], { reason:'gm-add-item', atTurn:(this.currentCampaign.currentTurn||1) });
    this._stashItemDraft={ name:'', qty:1, encumbranceSt:1 }; this._afterStashMutation();
  },
  stashRemoveItem(itemId){ const s=this.stashDetailStash(); if(!s) return; window.ACKS.withdrawFromStash(this.currentCampaign, s.id, [{ itemId }], { reason:'gm-remove' }); this._afterStashMutation(); },
  stashPromoteItem(itemId){ const s=this.stashDetailStash(); if(!s) return; const it=(s.items||[]).find(x=>x.id===itemId); if(!it) return; window.ACKS.promoteLineToNotableItem(this.currentCampaign, it, { name: it.name||'' }); this._afterStashMutation(); },
  // "Take" — the open character sheet's character (characterEditing), when standing on the stash's
  // hex, can pull an item straight into their inventory (coins take the whole line). Routes through
  // drawFromStash so coins land in the purse + over-encumbrance is flagged. Null ⇒ no take button.
  stashTakeCharacter(){
    const ch=this.characterEditing; const s=this.stashDetailStash();
    if(!ch || !s || !s.hexId) return null;
    return (ch.currentHexId && ch.currentHexId === s.hexId) ? ch : null;
  },
  stashTakeItem(it){
    const ch=this.stashTakeCharacter(); const s=this.stashDetailStash();
    if(!ch || !s || !it) return;
    const spec = window.ACKS.itemHasFacet(it,'coin')
      ? { coins: { [it.denomination||'gp']: (it.qty||0) } }   // coins: take the whole line
      : { itemIds:[it.id] };
    const res = window.ACKS.drawFromStash(this.currentCampaign, s.id, ch.id, spec);
    if(!res || !res.ok){ this.showToast(this._stashTransferErr(res && res.error), 3500); return; }
    this._afterStashMutation();
    let msg = 'Taken into '+(ch.name||'inventory')+'.';
    if(res.overEncumbered) msg += ' ⚠ Now overloaded (>20 st) — cannot move.';
    this.showToast(msg, 4000);
  },
  stashSettingsChanged(){ this._afterStashMutation(); },
  // Vault card (B.2): the stashes a character owns/shares + the treasury of any realm they rule
  characterStashes(ch){
    const camp=this.currentCampaign;
    if(!ch || !camp) return { personal:[], party:[], treasuries:[] };
    const personal=(camp.stashes||[]).filter(s=>s.ownerCharacterId===ch.id);
    const memberPartyIds=(camp.parties||[]).filter(p=>(p.memberCharacterIds||[]).includes(ch.id) || ch.partyId===p.id).map(p=>p.id);
    const party=(camp.stashes||[]).filter(s=>s.ownerPartyId && memberPartyIds.includes(s.ownerPartyId));
    const ruledDomainIds=(this.domains||[]).filter(d=>d.rulerCharacterId===ch.id).map(d=>d.id);
    const treasuries=(camp.stashes||[]).filter(s=>s.kind==='domain-treasury' && ruledDomainIds.includes(s.ownerDomainId));
    return { personal, party, treasuries };
  },
  stashesAtHexId(hexId){ if(!hexId || !this.currentCampaign) return []; return (this.currentCampaign.stashes||[]).filter(s=>s.hexId===hexId); },
  createCacheAtHex(hexId){
    if(!hexId || !this.currentCampaign) return;
    if(!Array.isArray(this.currentCampaign.stashes)) this.currentCampaign.stashes=[];
    const s = window.ACKS.blankStash({ kind:'cache', hexId, name:'Cache' });
    s.createdAtTurn = this.currentCampaign.currentTurn || 1;
    this.currentCampaign.stashes.push(s);
    this._afterStashMutation();
    this.openStashDetail(s.id);
  },
  // --- Character ⇄ co-located stash transfer (Items I1 Step 3) ---------------
  // The actor-centric verb: cache carry items/coins into a stash at the character's
  // current hex, or draw items/coins from a co-located stash back into carry.
  // Engine: ACKS.cacheToStash / drawFromStash (purse + Phase-2.6 carry shapes).
  characterTransferHexId(){ return (this.characterEditing && this.characterEditing.currentHexId) || null; },
  characterTransferHexLabel(){
    const id = this.characterTransferHexId(); if(!id) return null;
    const h = (this.currentCampaign?.hexes||[]).find(x=>x.id===id);
    return h ? hexLabelFor(h) : id;
  },
  characterTransferStashes(){
    const hexId = this.characterTransferHexId(); if(!hexId) return [];
    return this.stashesAtHexId(hexId);
  },
  openStashTransfer(stashId){
    const ch = this.characterEditing; if(!ch) return;
    this.stashTransferDir = 'deposit';
    this.stashTransferCoins = { pp:0, gp:0, ep:0, sp:0, cp:0 };
    this.stashTransferItemSel = {};
    const here = this.characterTransferStashes();
    this.stashTransferStashId = stashId || (here[0] && here[0].id) || null;
    this.stashTransferOpen = true;
  },
  closeStashTransfer(){ this.stashTransferOpen = false; },
  setStashTransferDir(dir){ this.stashTransferDir = dir; this.stashTransferItemSel = {}; this.stashTransferCoins = { pp:0, gp:0, ep:0, sp:0, cp:0 }; },
  stashTransferStash(){ return this.stashTransferStashId ? window.ACKS.findStash(this.currentCampaign, this.stashTransferStashId) : null; },
  createCacheForTransfer(){
    const hexId = this.characterTransferHexId();
    if(!hexId){ this.showToast('Set this character’s location first (Location tab) to cache here.', 4000); return; }
    const s = window.ACKS.findOrCreateStashAt(this.currentCampaign, { characterId:this.characterEditing.id }, hexId, { kind:'cache', name:'Cache' });
    this._afterStashMutation();
    this.stashTransferStashId = s.id;
  },
  // Coins available on the SOURCE side for the active direction.
  stashTransferCoinAvail(d){
    const ch = this.characterEditing;
    if(this.stashTransferDir === 'deposit') return (ch && ch.coins && Number(ch.coins[d])) || 0;
    const s = this.stashTransferStash(); if(!s) return 0;
    const line = (s.items||[]).find(i => window.ACKS.itemHasFacet(i,'coin') && (i.denomination||'gp')===d);
    return line ? (line.qty||0) : 0;
  },
  // Item rows on the SOURCE side: {key, label, sub, notable}. key = inventory index (deposit) or stash item id (withdraw).
  stashTransferItemRows(){
    if(this.stashTransferDir === 'deposit'){
      const inv = (this.characterEditing && this.characterEditing.inventory) || [];
      return inv.map((it,ix)=>({ key:ix, label:(it.name||'(unnamed)'), sub:(it.stone!=null?(it.stone+' st'):''), notable:!!it.notableItemId }));
    }
    const s = this.stashTransferStash(); if(!s) return [];
    return (s.items||[]).filter(i=>!window.ACKS.itemHasFacet(i,'coin')).map(it=>({
      key:it.id, label:this.stashItemLabel(it),
      sub:(Math.round(window.ACKS.itemEncumbranceSt(it)*100)/100)+' st', notable:!!it.notableItemId
    }));
  },
  stashTransferAnythingSelected(){
    const anyItem = Object.keys(this.stashTransferItemSel).some(k=>this.stashTransferItemSel[k]);
    const anyCoin = ['pp','gp','ep','sp','cp'].some(d=>(Number(this.stashTransferCoins[d])||0) > 0);
    return anyItem || anyCoin;
  },
  commitStashTransfer(){
    const ch = this.characterEditing; const s = this.stashTransferStash();
    if(!ch || !s){ this.showToast('Pick (or create) a stash at this hex first.', 3500); return; }
    const coins = {}; ['pp','gp','ep','sp','cp'].forEach(d => coins[d] = Math.max(0, Number(this.stashTransferCoins[d])||0));
    let res;
    if(this.stashTransferDir === 'deposit'){
      const itemIndices = Object.keys(this.stashTransferItemSel).filter(k=>this.stashTransferItemSel[k]).map(k=>parseInt(k,10));
      res = window.ACKS.cacheToStash(this.currentCampaign, ch.id, s.id, { itemIndices, coins });
    } else {
      const itemIds = Object.keys(this.stashTransferItemSel).filter(k=>this.stashTransferItemSel[k]);
      res = window.ACKS.drawFromStash(this.currentCampaign, s.id, ch.id, { itemIds, coins });
    }
    if(!res || !res.ok){ this.showToast(this._stashTransferErr(res && res.error), 3800); return; }
    this._afterStashMutation();
    let msg = (this.stashTransferDir==='deposit' ? 'Cached into ' : 'Drew from ') + (s.name || 'the stash') + '.';
    if(res.overEncumbered) msg += ' ⚠ Now overloaded (>20 st) — cannot move.';
    this.showToast(msg, 4500);
    this.stashTransferCoins = { pp:0, gp:0, ep:0, sp:0, cp:0 };
    this.stashTransferItemSel = {};
  },
  _stashTransferErr(code){
    return ({
      'insufficient-coin':'Not enough coin available.',
      'nothing-selected':'Select an item or enter a coin amount first.',
      'item-not-found':'That item is no longer in the stash.',
      'bad-index':'That item is no longer in the inventory.',
      'not-found':'Character or stash not found.'
    })[code] || ('Transfer failed' + (code ? (' ('+code+')') : '') + '.');
  },

  // ─── Trade Wizard (Item Trade IT-4 — Phase_2.9_Item_Trade_Plan.md §4.4) ───────────────────
  // The fourth Action Wizard. A thin UI over the shipped engine verbs ACKS.marketBuy / marketSell
  // (which already gate on RR p.124 availability + funds, move real inventory + the coin purse, and
  // stamp the M&M p.15 load-metered activity cost). This layer only forecasts + collects the order.
  openTrade(opts){
    opts = opts || {};
    const t = this.trade;
    t.open = true; t.dir = 'buy'; t.search = ''; t.category = 'all';
    t.buyCart = []; t.sellRows = {};
    t.gName = ''; t.gPrice = null; t.gStone = null;
    t.visitedBefore = false; t.partyOf12Dedicated = false;
    t.armyId = null;
    // Camp-seated trade (RR p.452 — a 1,200+ army functions as its own market via its baggage train). No settlement.
    if(opts.armyId){
      const army = (this.currentCampaign?.armies||[]).find(a => a && a.id === opts.armyId);
      t.armyId = opts.armyId; t.settlementId = null;
      t.actorId = opts.actorCharacterId || (army && army.leaderCharacterId) || null;
      if(t.actorId) this.tradeInitSellRows();
      return;
    }
    let settlementId = opts.settlementId || null;
    let actorId = opts.actorCharacterId || null;
    // Derive the local settlement from the actor's hex when not supplied (the "Shop here" case).
    if(!settlementId && actorId){
      const ch = (this.currentCampaign?.characters||[]).find(c => c && c.id === actorId);
      if(ch && ch.currentHexId){ const s = (this.currentCampaign?.settlements||[]).find(x => x && x.hexId === ch.currentHexId); if(s) settlementId = s.id; }
    }
    // Derive an actor from the settlement's hex when not supplied (the "Trade here" case).
    if(!actorId && settlementId){ const at = this.tradeCharactersAtSettlement(settlementId); if(at[0]) actorId = at[0].id; }
    t.settlementId = settlementId; t.actorId = actorId;
    t.visitedBefore = this._tradeDeriveVisited(actorId, settlementId);   // RAW (RR p.43): venturer + previously-entered → auto-tick; GM can override
    if(actorId) this.tradeInitSellRows();
  },
  closeTrade(){ this.trade.open = false; },

  // ── Forage / Hunt action (Provisioning V4) — thin UI over ACKS.forageActivity / huntActivity ──
  openForage(opts){
    opts = opts || {};
    const f = this.forage;
    f.open = true; f.kind = opts.kind || 'food'; f.results = [];
    let actorId = opts.actorCharacterId || null;
    // hex-card entry: pick a character standing on the hex if none supplied
    if(!actorId && opts.hexId){ const at = (this.currentCampaign?.characters||[]).filter(c => c && c.currentHexId === opts.hexId); if(at[0]) actorId = at[0].id; }
    f.actorId = actorId;
  },
  closeForage(){ this.forage.open = false; },
  forageActor(){ return this.forage.actorId ? (this.currentCampaign?.characters||[]).find(c => c && c.id === this.forage.actorId) : null; },
  forageCharacters(){ return (this.currentCampaign?.characters||[]).filter(c => c && c.id); },
  forageHex(){ const c = this.forageActor(); return (c && c.currentHexId) ? (this.currentCampaign?.hexes||[]).find(h => h && h.id === c.currentHexId) : null; },
  _forageHasProf(re){ const c = this.forageActor(); return !!(c && (c.proficiencies||[]).some(p => re.test(typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || ''))); },   // PT-0: canonical {key} slug
  _forageTerritory(hex){
    if(hex && hex.domainId){ const d = (this.currentCampaign?.domains||[]).find(x => x && x.id === hex.domainId);
      if(d){ const cls = window.ACKS.effectiveDomainClassification ? window.ACKS.effectiveDomainClassification(d) : (d.classification||null); if(cls) return cls; } }
    return 'Unsettled';
  },
  // Forecast for the selected kind: { target, bonus, terrMod, total, costLabel, note, auto?, territory? }.
  forageForecast(){
    const c = this.forageActor(); if(!c) return null;
    const hex = this.forageHex(); const A = window.ACKS;
    const dry = !!(hex && (hex.terrain === 'barrens' || hex.terrain === 'desert'));
    const forest = !!(hex && hex.terrain === 'forest');
    const surv = this._forageHasProf(/survival/i);
    const k = this.forage.kind;
    const mk = (o) => Object.assign({ bonus:0, terrMod:0 }, o, { total: (o.target!=null ? (o.target) : null) });
    if(k === 'water'){
      if(A.hasFreshSource && A.hasFreshSource(this.currentCampaign, hex)) return { auto:true, costLabel:'free', note:'Fresh water here — fill up free (no roll, no activity).' };
      return mk({ target: dry?18:14, bonus: surv?4:0, terrMod:0, costLabel:'ancillary', note:'Water for 3 days (capped at your containers).' });
    }
    if(k === 'firewood') return mk({ target: forest?3:14, bonus: surv?4:0, terrMod:0, costLabel:'ancillary', note:'8 st firewood (~4 hrs of fire).' });
    if(k === 'hunt'){
      const terr = this._forageTerritory(hex); let tm = 0; if(terr==='Civilized') tm-=4; else if(terr==='Outlands') tm+=2; else if(terr==='Unsettled') tm+=4;
      return mk({ target:14, bonus: this._forageHasProf(/hunting|survival/i)?4:0, terrMod:tm, costLabel:'dedicated', territory:terr, note:'1 st game, feeds 6 (6 days’ food). The Judge rolls the hex’s encounter table (RR p.278).' });
    }
    // food
    const terr = this._forageTerritory(hex); let tm = 0; if(dry) tm-=4; if(terr==='Civilized') tm-=4; else if(terr==='Borderlands') tm-=2;
    return mk({ target:18, bonus: surv?4:0, terrMod:tm, costLabel:'ancillary', territory:terr, note:'½ st food, feeds 3 (3 days’ food).' });
  },
  runForage(){
    const c = this.forageActor(); if(!c){ this.showToast('Pick a character first.', 3500); return; }
    const A = window.ACKS; const kind = this.forage.kind; let r;
    if(kind === 'hunt') r = A.huntActivity(this.currentCampaign, { actorCharacterId:c.id });
    else r = A.forageActivity(this.currentCampaign, { actorCharacterId:c.id, forageKind:kind });
    if(!r || !r.ok){ this.showToast('Could not ' + kind + ': ' + ((r && r.error) || 'unknown error'), 4000); return; }
    this.forage.results.push(this._forageResultRow(kind, r));   // STACK — newest at the bottom, not replacing
    this.markDirty(); this.schedulePersist();
  },
  // Compact display row from a forage/hunt (or reroll) result.
  _forageResultRow(kind, r){
    return { id: (r.event && r.event.id) || null, kind: kind, auto: !!r.auto, success: !!r.success,
             rolled: r.rolled, target: r.target, bonus: r.bonus || 0, terrMod: r.terrMod || 0,
             wanderingMonsterRisk: !!r.wanderingMonsterRisk, encounter: r.encounter || null };
  },
  // E7 — the hunt's RR p.278 wandering-monster draw, worded for the result row. A meeting names
  // the creature (the materialized entity's side); a terrain category is the Judge's find.
  forageEncounterText(res){
    const e = res && res.encounter; if(!e) return '';
    if(e.encounterId) return (e.label || 'a wandering encounter') + (e.encounterKind === 'at-lair' ? ' — at their lair' : '') + ' — GM, resolve';
    if(e.category === 'monster' || e.category === 'civilized') return 'a wandering encounter — GM, resolve';
    return 'a ' + e.category + ' terrain encounter — GM details';
  },
  // Re-roll a specific stacked attempt (the GM's "unlucky throw" redo). The engine flips the yield if the
  // success state changed (adds/removes the rations/firewood, or restores water); the row updates in place.
  rerollForageResult(ri){
    const row = this.forage.results[ri]; if(!row || !row.id || row.auto) return;
    const r = window.ACKS.rerollProvisioningActivity(this.currentCampaign, row.id);
    if(!r || !r.ok){ this.showToast('Could not reroll: ' + ((r && r.error) || 'unknown error'), 3500); return; }
    this.forage.results.splice(ri, 1, this._forageResultRow(row.kind, r));
    this.markDirty(); this.schedulePersist();
  },
  forageKindLabel(kind){ return ({ water:'🥤 Water', food:'🌿 Food', firewood:'🪵 Firewood', hunt:'🏹 Hunt' })[kind] || kind; },
  forageYieldText(res){
    if(res.kind === 'water') return 'water topped up';
    if(res.kind === 'firewood') return '8 st firewood';
    if(res.kind === 'hunt') return '+6 days food';
    return '+3 days food';
  },
  // Does `kind` fit the actor's RAW day-activity budget (#346)? Forage = 1 ancillary, hunt = the whole
  // dedicated day; water AT a fresh source is free (no throw, no slot) → always fits. Returns {fits, reason}.
  forageKindFits(kind){
    const c = this.forageActor(); if(!c) return { fits:false, reason:'Pick a character first.' };
    if(kind === 'water' && window.ACKS.hasFreshSource && window.ACKS.hasFreshSource(this.currentCampaign, this.forageHex())) return { fits:true, reason:'' };
    const A = window.ACKS;
    const BUDGET = A.ACTIVITY_BUDGET || { dedicatedPerDay:1, ancillaryPerDedicatedDay:4, ancillaryMaxPerDay:12 };
    const b = A.characterActivityBudget(this.currentCampaign, c.id);
    const dedUsed = b.dedicatedUsed || 0, ancUsed = b.ancillaryUsed || 0;
    const who = c.name || 'They';
    if(kind === 'hunt'){
      // Hunt is a DEDICATED, whole-day task.
      if(dedUsed + 1 > BUDGET.dedicatedPerDay) return { fits:false, reason: who + ' has no dedicated time left today — hunting takes the whole day, and ' + dedUsed + ' dedicated task' + (dedUsed === 1 ? ' is' : 's are') + ' already under way.' };
      if(ancUsed > BUDGET.ancillaryPerDedicatedDay) return { fits:false, reason: who + ' can’t hunt today — a full-day hunt leaves room for only ' + BUDGET.ancillaryPerDedicatedDay + ' short tasks, and ' + ancUsed + ' are already done.' };
      return { fits:true, reason:'' };
    }
    // Forage is ONE ancillary (short) task — judged on ancillary room, not the dedicated overage.
    const ancCap = (dedUsed >= 1) ? BUDGET.ancillaryPerDedicatedDay : BUDGET.ancillaryMaxPerDay;
    if(ancUsed + 1 > ancCap) return { fits:false, reason: who + ' has no time left today — ' + ancUsed + ' of ' + ancCap + ' short tasks used' + (dedUsed >= 1 ? ' alongside a full-day task' : '') + '.' };
    return { fits:true, reason:'' };
  },
  forageBudgetLine(){
    const c = this.forageActor(); if(!c) return '';
    const b = window.ACKS.characterActivityBudget(this.currentCampaign, c.id);
    return 'Today used: ' + (b.dedicatedUsed || 0) + ' dedicated · ' + (b.ancillaryUsed || 0) + ' ancillary' + (b.overBudget ? ' (over budget)' : '');
  },

  // ── #476 M4 — Search-the-hex + track-home (thin UI over ACKS.hexSearchActivity / trackHomeAttempt) ──
  // E8: opts.landmarkJourneyId switches the modal to the RR p.285 LANDMARK search — the recovery
  // for a knowingly-lost journey (always a specific POI, −4; success resumes the journey).
  openSearchHex(opts){
    opts = opts || {};
    const s = this.searchHex;
    s.open = true; s.hexId = opts.hexId || null; s.specific = false; s.results = [];
    s.landmarkJourneyId = opts.landmarkJourneyId || null;
    s.actorId = opts.actorCharacterId || null;
    if(!s.actorId && s.landmarkJourneyId){
      // default to a journey participant standing at the search hex
      const j = (this.currentCampaign?.journeys||[]).find(x => x && x.id === s.landmarkJourneyId);
      const ids = (j && j.participantCharacterIds) || [];
      const at = (this.currentCampaign?.characters||[]).find(c => c && ids.indexOf(c.id) >= 0 && (!s.hexId || c.currentHexId === s.hexId));
      if(at) s.actorId = at.id;
    }
    if(!s.actorId && s.hexId){ const at = this.searchHexCharacters(); if(at[0]) s.actorId = at[0].id; }
  },
  closeSearchHex(){ this.searchHex.open = false; },
  searchActor(){ return this.searchHex.actorId ? (this.currentCampaign?.characters||[]).find(c => c && c.id === this.searchHex.actorId) : null; },
  searchHexObj(){
    const id = this.searchHex.hexId || (this.searchActor() && this.searchActor().currentHexId) || null;
    return id ? (this.currentCampaign?.hexes||[]).find(h => h && h.id === id) : null;
  },
  searchHexCharacters(){
    const hid = this.searchHex.hexId;
    return (this.currentCampaign?.characters||[]).filter(c => c && c.id && (!hid || c.currentHexId === hid));
  },
  // Forecast: the engine's own speed/target math, run dry (no roll) for the panel.
  searchForecast(){
    const c = this.searchActor(); if(!c) return null;
    const A = window.ACKS;
    const cohort = (typeof A.characterCohort === 'function') ? A.characterCohort(this.currentCampaign, c) : [c];
    let slowest = Infinity;
    for(const m of cohort){ const mpd = A.carryEncumbranceInfo(m).band.milesPerDay; if(typeof mpd === 'number' && mpd < slowest) slowest = mpd; }
    if(slowest === Infinity) slowest = 24;
    const hex = this.searchHexObj();
    const tMult = (hex && A.JOURNEY_TERRAIN_SPEED && A.JOURNEY_TERRAIN_SPEED[hex.terrain] != null) ? A.JOURNEY_TERRAIN_SPEED[hex.terrain] : 1;
    const speed = slowest * tMult;
    const bonus = cohort.some(m => (m.proficiencies||[]).some(p => /tracking/i.test(typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || ''))) ? 4 : 0;   // PT-0: canonical {key} slug
    return { speed: Math.round(speed * 10) / 10, target: A.wildernessSearchTargetForSpeed(speed), bonus: bonus };
  },
  searchFits(){
    const c = this.searchActor(); if(!c) return { fits:false, reason:'Pick a character first.' };
    const A = window.ACKS;
    const BUDGET = A.ACTIVITY_BUDGET || { dedicatedPerDay:1, ancillaryPerDedicatedDay:4, ancillaryMaxPerDay:12 };
    const b = A.characterActivityBudget(this.currentCampaign, c.id);
    const dedUsed = b.dedicatedUsed || 0, ancUsed = b.ancillaryUsed || 0;
    const ancCap = (dedUsed >= 1) ? BUDGET.ancillaryPerDedicatedDay : BUDGET.ancillaryMaxPerDay;
    if(ancUsed + 1 > ancCap) return { fits:false, reason: (c.name || 'They') + ' has no time left today — ' + ancUsed + ' of ' + ancCap + ' short tasks used' + (dedUsed >= 1 ? ' alongside a full-day task' : '') + '.' };
    return { fits:true, reason:'' };
  },
  searchBudgetLine(){
    const c = this.searchActor(); if(!c) return '';
    const b = window.ACKS.characterActivityBudget(this.currentCampaign, c.id);
    return 'Today used: ' + (b.dedicatedUsed || 0) + ' dedicated · ' + (b.ancillaryUsed || 0) + ' ancillary' + (b.overBudget ? ' (over budget)' : '');
  },
  runSearchHour(){
    const c = this.searchActor(); if(!c){ this.showToast('Pick a character first.', 3500); return; }
    const r = window.ACKS.hexSearchActivity(this.currentCampaign, {
      actorCharacterId: c.id, hexId: this.searchHex.hexId || c.currentHexId || null, specific: !!this.searchHex.specific,
      landmarkJourneyId: this.searchHex.landmarkJourneyId || null
    });
    if(!r || !r.ok){ this.showToast('Could not search: ' + ((r && r.error) || 'unknown error'), 4000); return; }
    if(r.landmarkFound) this.showToast('🧭 The landmark is found — bearings recovered; the journey resumes.', 4500);
    let encounterText = '';
    if(r.encounter){
      const A = window.ACKS;
      if(r.encounter.source === 'existing-lair'){
        const mName = (A.monsterDisplayName && A.monsterDisplayName((A.findLair(this.currentCampaign, r.encounter.lairId)||{}).monsterCatalogKey)) || 'creatures';
        encounterText = (r.encounter.encounterKind === 'wandering-fragment')
          ? ((r.encounter.fragmentCount || 'a band of') + ' ' + mName.toLowerCase() + (r.encounter.fragmentCount === 1 ? '' : 's') + ' out from their lair — GM, resolve')
          : ('the searchers stumble onto the ' + mName + ' lair itself — GM, resolve');
      } else if(r.encounter.source === 'seeded-shell'){
        encounterText = 'this hex holds ' + (r.encounter.seededShellLairIds||[]).length + ' unauthored lair(s) — populate one or resolve generically';
      } else {
        encounterText = 'a wandering encounter — GM, resolve (' + ((this.searchHexObj()||{}).terrain || 'wilderness') + ')';
      }
    }
    let surveyText = '';
    if(r.survey){
      surveyText = r.survey.assessed
        ? ('assesses ' + r.survey.count + ' point' + (r.survey.count === 1 ? '' : 's') + ' of interest in this hex' + (r.survey.falseReading ? ' (the Judge knows: a FALSE reading — nat 1)' : ''))
        : 'not enough information yet (throw ' + r.survey.rolled + (r.survey.bonus ? '+' + r.survey.bonus : '') + ' vs 18+)';
    }
    this.searchHex.results.push({
      id: (r.event && r.event.id) || null,
      rolled: r.rolled, target: r.target, bonus: r.bonus, mod: r.mod, success: r.success,
      found: !!r.found, foundName: r.found ? (r.found.name || 'a lair') : '', foundLairId: r.found ? r.found.id : null,
      landmark: !!this.searchHex.landmarkJourneyId, landmarkFound: !!r.landmarkFound,
      encounter: r.encounter || null, encounterText: encounterText, survey: r.survey || null, surveyText: surveyText
    });
    this.markDirty(); this.schedulePersist();
  },
  // Re-roll the latest search hour (the forage-reroll sibling): re-throws just the search die via
  // rerollHexSearch — discovery flips with the result, the encounter/survey display is held, and
  // no new hour is charged (so it works even when the actor's day is full).
  rerollSearchResult(ri){
    const row = this.searchHex.results[ri]; if(!row || !row.id) return;
    const r = window.ACKS.rerollHexSearch(this.currentCampaign, row.id);
    if(!r || !r.ok){ this.showToast('Could not reroll: ' + ((r && r.error) || 'unknown error'), 3500); return; }
    this.searchHex.results.splice(ri, 1, Object.assign({}, row, {
      rolled: r.rolled, success: r.success,
      found: !!r.found, foundName: r.found ? (r.found.name || 'a lair') : '', foundLairId: r.found ? r.found.id : null,
      landmarkFound: row.landmark ? !!r.landmarkFound : row.landmarkFound
    }));
    this.markDirty(); this.schedulePersist();
  },
  openTrackHome(opts){
    opts = opts || {};
    const t = this.trackHome;
    t.open = true; t.lairId = opts.lairId || null; t.encounterId = opts.encounterId || null;
    t.hexId = opts.hexId || null;
    t.countTracked = opts.countTracked || 0; t.mod = 0; t.result = null;
    // E5 — the RR p.120 find modifiers (ground auto-suggested from the hex; the rest GM)
    t.rainHours = 0; t.dimLight = false;
    const hex = t.hexId ? ((this.currentCampaign?.hexes || []).find(h => h && h.id === t.hexId) || null) : null;
    const gc = (hex && hex.groundCondition) || 'clear';
    const terr = (hex && hex.terrain) || '';
    t.groundMod = (gc === 'mud' || gc === 'snow') ? 4 : (/mountain|barrens/i.test(terr) && (hex && hex.terrainSubtype) !== 'forested') ? -8 : 0;
    t.actorId = null;
    const trackers = this.trackHomeTrackers(); if(trackers[0]) t.actorId = trackers[0].id;
  },
  closeTrackHome(){ this.trackHome.open = false; },
  trackHomeTrackers(){
    const hid = this.trackHome.hexId;
    return (this.currentCampaign?.characters||[]).filter(c => c && c.id
      && (!hid || c.currentHexId === hid)
      && (c.proficiencies||[]).some(p => /tracking/i.test(typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || '')));   // PT-0: canonical {key} slug
  },
  // E5 — the trail's age in days (−2 each on the find), derived from the meeting's resolution stamp.
  trackHomeAgeDays(){
    const t = this.trackHome; const c = this.currentCampaign;
    const enc = (t.encounterId && c) ? window.ACKS.findEncounter(c, t.encounterId) : null;
    if(!enc || enc.status !== 'resolved') return 0;
    const nowOrd = ((c.currentTurn || 1) * 30) + (c.currentDayInMonth || 1);
    const resOrd = ((enc.resolvedAtTurn || c.currentTurn || 1) * 30) + (enc.resolvedOnDayInMonth || c.currentDayInMonth || 1);
    return Math.max(0, nowOrd - resOrd);
  },
  runTrackHome(){
    const t = this.trackHome;
    const r = window.ACKS.beginTracking(this.currentCampaign, {
      actorCharacterId: t.actorId, encounterId: t.encounterId || undefined, lairId: t.encounterId ? undefined : (t.lairId || undefined),
      countTracked: t.countTracked || 0, groundMod: t.groundMod || 0, rainHoursSince: t.rainHours || 0,
      dimLight: !!t.dimLight, gmMod: t.mod || 0
    });
    if(!r || !r.ok){
      const msg = ({ 'no-tracking':'That character has no Tracking proficiency.', 'already-known':'That band\'s den is already discovered — use its → lair link.', 'unknown-actor':'Pick a tracker first.',
                     'unknown-encounter':'No meeting to track from.', 'no-encounter':'No concluded meeting with that band to track from.', 'no-target':'Nothing to track.',
                     'encounter-still-active':'The meeting is still under way — resolve it first; they have not parted.', 'no-meeting':'No meeting happened — there is no trail to follow.',
                     'no-hex':'The meeting has no hex — nowhere to pick up the trail.', 'not-at-trail-hex':'The tracker must stand at the meeting hex — the trail starts there.',
                     'already-tracking':'A follow is already under way from this meeting — see the 🐾 panel.',
                     'band-mid-hunt':'The band is mid-hunt — its motion belongs to the chase (meet it there).' })[r && r.error] || 'Could not track.';
      this.showToast(msg, 4500); return;
    }
    t.result = { find: r.find, success: r.success,
                 caughtNow: r.caughtNow || null, journeyAction: r.journeyAction || 'none',
                 journeyId: (r.journey && r.journey.id) || null,
                 caughtLairId: (r.caughtNow && r.caughtNow.lair && r.caughtNow.lair.id) || null,
                 caughtEncounterId: (r.caughtNow && r.caughtNow.encounter && r.caughtNow.encounter.id) || null };
    this.markDirty(); this.schedulePersist();
    if(r.success && r.caughtNow) this.showToast(r.caughtNow.denCatch
      ? ('🐾 The spoor leads straight to ' + ((r.caughtNow.lair && r.caughtNow.lair.name) || 'their den') + ' — discovered, and the meeting is upon you.')
      : '🐾 The trail is fresh — the band is right here. A new meeting springs.', 5000);
    else if(r.success) this.showToast('🐾 The trail is found — the follow begins at half expedition speed' +
      (r.journeyAction === 'started' ? ' (a journey sets out after them).' : r.journeyAction === 'rerouted' ? ' (the journey is re-routed after them).' : '.'), 5000);
  },
  characterAtSettlement(ch){ if(!ch || !ch.currentHexId) return null; return (this.currentCampaign?.settlements||[]).find(s => s && s.hexId === ch.currentHexId) || null; },
  hexSettlementFor(hex){ if(!hex) return null; return (this.currentCampaign?.settlements||[]).find(s => s && s.hexId === hex.id) || null; },
  // Encumbrance (B.5) — RAW by default; the ignore-encumbrance opt-out hides it
  encumbranceShown(){ return !this.isHouseRuleEnabled('ignore-encumbrance'); },
  carryInfo(ch){ return window.ACKS.carryEncumbranceInfo(ch); },
  // Items I1 — coin purse readouts (derived; coins.gp canonical). Used by the Inventory-tab Coins section.
  characterCoinValueGp(ch){ return window.ACKS.characterCoinValueGp(ch); },
  characterCoinWeightSt(ch){ return window.ACKS.characterCoinWeightSt(ch); },
  carryBandColor(level){ return ({ unencumbered:'#2f6b2f', light:'#7a6a17', heavy:'#9a5a13', severe:'#7a3b13', overloaded:'#7a1313' })[level] || '#444'; },

  // Resolve the hex currently being edited in the World > Hexes detail modal.
  // Single-home (T6): resolve by hex id from the canonical campaign.hexes; the legacy
  // positional (domainId+hexIndex) open is honored via hexesForDomain for back-compat.
  worldHexEditingHex(){
    if(!this.worldHexEditing) return null;
    const id = this.worldHexEditing.hexId;
    if(id){ const h = window.ACKS.findHex(this.currentCampaign, id); if(h) return h; }
    const d = this.domains.find(x => x.id === this.worldHexEditing.domainId);
    return d ? (window.ACKS.hexesForDomain(this.currentCampaign, d.id)[this.worldHexEditing.hexIndex] || null) : null;
  },
  // The settlement at the hex being edited — read from canonical campaign.settlements (single-home, T6;
  // the embedded hex.settlement mirror is gone).
  worldHexEditingSettlement(){ return settlementAtHexG(this.worldHexEditingHex()); },
  // Terrain dropdown options for the hex panel — the shared map catalog (mapTerrainTypes), plus the
  // editing hex's CURRENT terrain prepended when it isn't in the catalog (e.g. legacy/demo "plains" /
  // "coast"), so switching this field from a free text box to a dropdown never hides an existing value.
  // Mirrors mapTerrainOptions (which does the same for the map editor's mapCreateTerrain).
  hexPanelTerrainOptions(){
    const base = window.ACKS.mapTerrainTypes();
    const hex = this.worldHexEditingHex();
    const cur = ((hex && hex.terrain) || '').trim();
    if(cur && !base.some(t => t.value === cur)) return [{ value: cur, label: cur + ' (current)' }].concat(base);
    return base;
  },
  // Terrain refinement options for the hex editor (Phase_2.5_Terrain_Model_Plan.md, T2).
  hexSubtypeOptions(){
    const hex = this.worldHexEditingHex();
    const base = window.ACKS.terrainBase(hex && hex.terrain);
    // base chosen → that base's variants; terrain unset → the full union (so a sub-type
    // can still be pre-picked); a base with no variants (water/jungle) → [] (control hides).
    const subs = base ? ((window.ACKS.TERRAIN_SUBTYPES && window.ACKS.TERRAIN_SUBTYPES[base]) || [])
                      : window.ACKS.allTerrainSubtypes();
    return subs.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
  },
  hexKoppenOptions(){
    const K = window.ACKS.KOPPEN_CLIMATE || {};
    return Object.keys(K).map(code => ({ value: code, label: code + ' — ' + K[code].name }));
  },
  hexBiomeOptions(){ return (window.ACKS.BIOMES || []).slice(); },
  hexBiomeLabel(){ return window.ACKS.biomeForHex(this.worldHexEditingHex()) || ''; },
  // The primary (terrain, sub-type) the editing hex's Köppen code suggests — drives the ✨ apply button.
  // '' when there is no koppen, no suggestion, or the hex already matches it (so the button hides).
  hexKoppenSuggestionLabel(){
    const hex = this.worldHexEditingHex();
    if(!hex || !hex.koppen) return '';
    const sug = (window.ACKS.koppenSuggestions(hex.koppen) || [])[0];
    if(!sug) return '';
    if(window.ACKS.terrainBase(hex.terrain) === sug.terrain && (hex.terrainSubtype||'') === (sug.subtype||'')) return '';
    return sug.terrain + (sug.subtype ? ' (' + sug.subtype + ')' : '');
  },
  hexApplyKoppenSuggestion(){
    const hex = this.worldHexEditingHex();
    if(!hex || !hex.koppen) return;
    const sug = (window.ACKS.koppenSuggestions(hex.koppen) || [])[0];
    if(!sug) return;
    this.commitStatEdit({entityType:'hex', entityId:hex.id, entity:hex, fieldPath:'terrain', label:'Terrain', oldValue:hex.terrain||'', newValue:sug.terrain});
    this.commitStatEdit({entityType:'hex', entityId:hex.id, entity:hex, fieldPath:'terrainSubtype', label:'Terrain sub-type', oldValue:hex.terrainSubtype||'', newValue:sug.subtype||''});
  },
  // Set the editing hex's coord from a GM-facing COLUMN·ROW pair (the map-label convention), storing
  // canonical axial {q,r}. Pass null for the axis you're NOT changing — it's read back from the current
  // coord so editing one field holds the other's *displayed* value (which, for column edits, recomputes
  // axial r). Direct mutation + persist (coord is foundational identity, not routed through gm-fiat — by
  // the same "edit cautiously" choice the plain inputs always had).
  worldHexSetColRow(col, row){
    const hex = this.worldHexEditingHex(); if(!hex) return;
    const cur = window.ACKS.hexAxialToColRow(hex.coord?.q || 0, hex.coord?.r || 0);
    const c  = (col == null) ? cur.col : col;
    const rw = (row == null) ? cur.row : row;
    hex.coord = window.ACKS.hexColRowToAxial(c, rw);
    if(this.schedulePersist) this.schedulePersist();
  },
  // The hex panel header's "· <domain>" suffix. Reads the hex's OWN domainId (the single source of
  // truth, CLAUDE #10) — same field the Domain dropdown binds to — so the two can never disagree.
  // (It used to read worldHexEditing.domainId, the navigation breadcrumb of which list you opened
  // from, which stayed set even when the hex's scalar said otherwise — that was the "header says
  // March of Saltspur, dropdown says Unclaimed" bug.) openHexDetail heals an empty scalar first.
  worldHexEditingDomain(){
    const hex = this.worldHexEditingHex();
    const id = hex && hex.domainId;
    return id ? (this.domains.find(x => x.id === id) || null) : null;
  },
  // A hex's domain claim lives canonically on hex.domainId (single-home, T6). The load-time lift
  // (liftToTopLevelCollections) backfills domainId from any legacy nested membership before the strip,
  // so a loaded hex always carries the truth; this is now a thin passthrough kept for its callers.
  // Returns the resolved domain id (null = genuine wilderness).
  _healHexDomainId(hex){
    return hex ? (hex.domainId || null) : null;
  },
  // Reassign the editing hex to another domain (or unclaimed wilderness) from the hex-detail modal.
  // Reuses mapRehomeHex (the canonical move: drop from old geography, set hex.domainId, add to new +
  // campaign.hexes), then re-anchors the modal to the moved hex by id (its index in the old domain is
  // now stale). Direct mutation + persist — same posture as the foundational Coord field and the map
  // editor (neither routes a hex's domain move through gm-fiat).
  worldHexSetDomain(newDomainId){
    const hex = this.worldHexEditingHex(); if(!hex) return;
    const from = hex.domainId || null, to = newDomainId || null;
    if(from === to) return;
    const dTo = to ? this.domains.find(x => x.id === to) : null;
    const label = window.ACKS.hexDisplayLabel(hex.coord.q, hex.coord.r);
    // Log the move as a gm-fiat event. The engine handler (applyEvent_gmFiat) re-homes the
    // geography.hexes mirror to match the new domainId (reconcileHexDomainMembership) inside this
    // call — so commitStatEdit does the structural move AND the audit trail.
    const ok = this.commitStatEdit({
      entityType: 'hex', entityId: hex.id, entity: hex, fieldPath: 'domainId',
      oldValue: from, newValue: to, label: 'Domain', reason: 'Hex reassigned',
      toastMessage: 'Moved hex ' + label + ' to ' + (dTo ? dTo.name : 'unclaimed wilderness') + '.'
    });
    if(ok){
      this.worldHexEditing = { hexId: hex.id, domainId: hex.domainId || null }; // re-anchor to the moved hex
      this.markDirty(); this.schedulePersist();
    }
  },
  openHexDetail(entry){
    this.worldHexEditing = {domainId:entry.domainId, hexIndex:entry.hexIndex, hexId:(entry.hex && entry.hex.id) || null};
    this._healHexDomainId(this.worldHexEditingHex()); // self-heal an empty domainId from geography membership
    this.showHexDetailModal = true;
  },
  closeHexDetail(){
    this.showHexDetailModal = false;
    this.worldHexEditing = null;
  },
  levyModal: { open: false, domainId: null, source: 'conscript', count: 1 },  // ⚒/🛡 Levy modal
  trainModal: { open: false, unitId: null, type: '', count: null },  // 🎓 Train modal (Domain ▸ Military)
  followerArrival: { open: false, domainId: '', proposal: null },  // 🎺 Follower Arrival modal (Domain ▸ Stronghold — RR p.334)
  addToArmyModal: { open: false, unitId: null, hexId: null },  // 🎖 Add-to-army chooser (Garrison Units)
  marchModal: { open: false, unitId: null, destHexId: '' },  // 🚶 Muster a garrison unit to a hex
  // Phase 4 — The Arcane Domain · dungeon arcane panel (AD-D/AD-E). Transient form state.
  arcaneDungeonId: null,         // open dungeon in the arcane modal (null = closed)
  dungeonBuild: { open: false, name: '', ownerCharacterId: '', hexId: '', buildValueGp: 30000, areaSqFt: 60000, areaCount: 24, treasureSeededGp: 0 },  // AD-C — the 🏗 Build a dungeon modal
  arcaneAttuneCasterId: '', arcaneAttuneMethod: 'built',
  arcaneSovCasterId: '', arcaneSovMethod: 'gm-fiat', arcaneSovChieftainId: '', arcaneSovSlainHd: 0,
  arcaneHarvestGroupId: '', arcaneHarvestQty: 1, arcaneHarvestMethod: 'cull', arcaneHarvestBounty: 0,
  arcaneLastAttune: '', arcaneLastAttuneOk: false,
  arcaneLastSov: '', arcaneLastSovOk: false,
  arcaneLastHarvest: '', arcaneLastHarvestOk: false,
  arcaneUsurpCasterId: '', arcaneUsurpSettlementId: '', arcaneLastUsurp: '', arcaneLastUsurpOk: false,  // AD-F — the divine-seam stub
  // #476 M4 — Search-the-hex (RR pp.276–277) + track-home (RR p.120) modals.
  searchHex: { open:false, actorId:null, hexId:null, specific:false, landmarkJourneyId:null, results:[] },
  trackHome: { open:false, actorId:null, lairId:null, encounterId:null, hexId:null, countTracked:0, mod:0, groundMod:0, rainHours:0, dimLight:false, result:null },
  // Phase 3 Military W4 — World ▸ 🎖 Armies (RR pp.447–460): the campaign card's state.
  armiesSelectedId: null,
  // Phase 3 Military — the Muster Army modal (Action verb; ACKS.createArmy). _domainId
  // remembers a domain-launch so its garrison is pre-checked.
  musterArmyOpen: false,
  musterArmyForm: { commanderId: '', name: '', hexId: '', stance: 'defensive', unitIds: [], _domainId: '' },
  // Garrison reaction (2026-06-14) — the ⚔ Deploy garrison modal (JJ pp.104–106). Targets an
  // incursion band; musters a sally force at a rally point + marches it (ACKS.deployGarrisonReaction).
  garrisonDeployOpen: false,
  garrisonDeployForm: { groupId: '', domainId: '', commanderId: '', rallyHexId: '', stance: 'offensive', unitIds: [] },
  // Set while the per-domain "+ add hex" flow is sending the GM to the Map to place a hex: holds
  // { domainId } to pre-select on the create picker and to return to when they create/cancel.
  _hexAddReturn: null,
  // First unused {q,r} scanning q=0,1,2,… along row 0 — so "+ add hex" doesn't pile every new hex on
  // (0,0) (which collides on the campaign-global coord-uniqueness rule). The GM sets the real
  // column·row afterward in the hex panel.
  _firstFreeHexCoord(){
    const used = new Set();
    (this.currentCampaign?.hexes || []).forEach(h => { if(h && h.coord) used.add(h.coord.q + ',' + h.coord.r); });
    let q = 0;
    while(used.has(q + ',0')) q++;
    return { q, r: 0 };
  },
  // "+ add hex" on World > Hexes. `target` is a domain id, or '__wild__' for an UNCLAIMED wilderness
  // hex (domainId null — supported at the data layer; the GM-facing way to grow the map outward).
  // Uses blankHex (the canonical shape incl. roadSides/etc.) + a free coord, sets domainId, and lands
  // the hex in the top-level campaign.hexes (+ the domain's geography mirror when claimed).
  addHex(target){
    if(!this.currentCampaign) return;
    const wild = (target === '__wild__' || !target);
    const d = wild ? null : this.domains.find(x => x.id === target);
    if(!wild && !d) return;
    // Unclaimed wilderness starts UNexplored (uncharted territory you grow the map into); a hex added
    // to a domain is known territory, so it stays explored (blankHex's default).
    const hex = window.ACKS.blankHex({ coord: this._firstFreeHexCoord(), explored: !wild });
    hex.domainId = d ? d.id : null;   // single-home (T6) — domain claim is the scalar
    if(!Array.isArray(this.currentCampaign.hexes)) this.currentCampaign.hexes = [];
    this.currentCampaign.hexes.push(hex);
    this.markDirty(); this.schedulePersist();
    this.showToast('Added hex ' + window.ACKS.hexDisplayLabel(hex.coord.q, hex.coord.r) + ' to ' + (d ? d.name : 'unclaimed wilderness') + ' — set its coord in the hex panel.');
  },
  // Back-compat delegate (the World > Hexes "+ add hex" control is the only caller).
  addHexToDomain(domainId){ this.addHex(domainId); },
  // The per-domain "+ add hex" (Domain ▸ Demographics): instead of dropping a blank hex at a
  // placeholder coord, jump to the Map in Add/Edit mode so the GM places it visually. mapClickEmpty
  // pre-selects this domain on the create picker (it reads _hexAddReturn), and creating or cancelling
  // returns to the domain view (mapCreateHex / mapCancelCreate call _returnFromHexAdd).
  // `target` is a domain id, or '__wild__' for unclaimed wilderness. `returnSubView` is the World
  // sub-view to come back to ('domains' for the per-domain table — default; 'hexes' for World ▸ Hexes).
  addHexViaMap(target, returnSubView){
    if(!target || !this.currentCampaign) return;
    // The map flow needs at least one existing hex to anchor the faint addable cells (they're the
    // neighbours of placed hexes). On a truly empty map there's nothing to click, so create inline.
    if(!(this.currentCampaign.hexes || []).length){ this.addHex(target); return; }
    const wild = (target === '__wild__');
    const domainId = wild ? null : target;
    this._hexAddReturn = { domainId, returnSubView: returnSubView || 'domains' };
    this.mapEditAddMode = true;
    // Enter add mode with the brush pre-set to this domain (no cell selected yet) — the persistent
    // panel shows it immediately, and mapClickEmpty keeps it when the GM clicks a cell to place.
    this.mapCreateAt = null; this.mapEditHexId = null;
    this.mapCreateDomainId = domainId || ''; this.mapCreateTerrain = ''; this.mapCreateSubtype = ''; this.mapCreateKoppen = '';
    this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = [];
    this.worldSubView = 'map'; this.currentView = 'world'; // subView first so the currentView watch sees map
    this.mapEnsureView();
    this.schedulePersist();
    const d = domainId ? this.domains.find(x => x.id === domainId) : null;
    this.showToast('Click an empty hex on the map to add it' + (d ? (' to ' + d.name) : ' (unclaimed wilderness)') + ' (or cancel to go back).', 5000);
  },
  // Return to where the add-via-map flow started (create or cancel). Idempotent — gated on
  // _hexAddReturn, which only addHexViaMap sets, so normal map create/cancel is unaffected.
  _returnFromHexAdd(){
    if(!this._hexAddReturn) return;
    const { domainId, returnSubView } = this._hexAddReturn;
    this._hexAddReturn = null;
    this.mapEditAddMode = false;
    this.mapCreateAt = null; this.mapEditHexId = null;
    if(returnSubView === 'domains' && domainId) this.selectedDomainId = domainId;
    this.worldSubView = (returnSubView === 'hexes') ? 'hexes' : 'domains'; this.currentView = 'world';
    this.schedulePersist();
  },
  // Delete a hex entirely — the destructive counterpart to "+ add hex" (World ▸ Hexes Actions column).
  // Removes it from campaign.hexes AND every domain's geography.hexes mirror, and drops its settlement
  // from campaign.settlements (the settlement lives on the hex). Confirms first, naming any content that
  // would be lost. Unlogged splice — matches the other collection deletes (deleteParty/deleteRumor) and
  // sidesteps the gm-fiat path (no hex-deleted event kind; gm-fiat is for field edits, not removals).
  deleteHex(entry){
    const hex = entry && entry.hex; if(!hex || !this.currentCampaign) return;
    const A = window.ACKS, label = hexLabelFor(hex);
    const lost = [];
    const set = hex.settlement || (this.currentCampaign.settlements || []).find(s => s && s.hexId === hex.id);
    if(set) lost.push('the settlement "' + (set.name || 'unnamed') + '"');
    if((hex.lairs || []).length)            lost.push(hex.lairs.length + ' lair' + (hex.lairs.length === 1 ? '' : 's'));
    if((hex.dungeons || []).length)         lost.push(hex.dungeons.length + ' dungeon' + (hex.dungeons.length === 1 ? '' : 's'));
    if((hex.pointsOfInterest || []).length) lost.push(hex.pointsOfInterest.length + ' point' + (hex.pointsOfInterest.length === 1 ? '' : 's') + ' of interest');
    const warn = lost.length ? ('\n\nThis hex contains ' + lost.join(', ') + ' — they will be deleted too.') : '';
    if(!confirm('Delete hex ' + label + '?' + warn + '\n\nThis removes it from the map and its domain, and cannot be undone.')) return;
    this.currentCampaign.hexes = (this.currentCampaign.hexes || []).filter(h => h.id !== hex.id);   // single-home (T6)
    if(Array.isArray(this.currentCampaign.settlements)) this.currentCampaign.settlements = this.currentCampaign.settlements.filter(s => !(s && s.hexId === hex.id));
    if(this.worldHexEditing && this.worldHexEditing.hexId === hex.id) this.closeHexDetail(); // close the panel if it was open on this hex
    this.markDirty(); this.schedulePersist();
    this.showToast('Deleted hex ' + label + '.');
  },
  addHexLair(h){
    if(!h) return;
    if(!Array.isArray(h.lairs)) h.lairs = [];
    h.lairs.push({id:'lair-'+Math.random().toString(36).slice(2,7), name:'', creatureType:'', hd:'', numberAppearing:'', description:''});
  },
  addHexDungeon(h){
    if(!h) return;
    if(!Array.isArray(h.dungeons)) h.dungeons = [];
    h.dungeons.push({id:'dun-'+Math.random().toString(36).slice(2,7), name:'', levels:1, description:''});
  },
  addHexPOI(h){
    if(!h) return;
    if(!Array.isArray(h.pointsOfInterest)) h.pointsOfInterest = [];
    h.pointsOfInterest.push({id:'poi-'+Math.random().toString(36).slice(2,7), name:'', kind:'ruin', description:''});
  },
  allSettlements(){
    // T6 single-home — settlements live in the canonical campaign.settlements[]; the hex + its domain
    // are resolved by settlement.hexId. Entries key by settlement.id (hexIndex is gone).
    const c = this.currentCampaign;
    const out=[];
    (c?.settlements||[]).forEach(s=>{
      if(!s) return;
      const h = (window.ACKS && window.ACKS.findHex) ? window.ACKS.findHex(c, s.hexId) : null;
      const d = (h && h.domainId) ? (this.domains||[]).find(x=>x.id===h.domainId) : null;
      out.push({domainId: d?d.id:null, domainName: d?d.name:'Unclaimed', hexId: s.hexId, settlement:s, marketClass:this.settlementMarketClass(s)});
    });
    return out;
  },
  // Cargo manipulation on the draft
  addCargoLine(){
    if(!Array.isArray(this.ventureDraft.cargo)) this.ventureDraft.cargo=[];
    this.ventureDraft.cargo.push({merchandiseId:'', quantityStone:0, purchasePricePerStone:0});
  },
  removeCargoLine(idx){
    if(Array.isArray(this.ventureDraft.cargo)) this.ventureDraft.cargo.splice(idx,1);
  },
  // When the GM picks merchandise + origin, auto-suggest the purchase price from base + DM
  suggestCargoPrice(line){
    const merch = lookupMerchandise(line.merchandiseId);
    if(!merch) return;
    const origin = this.allSettlements().find(s => s.domainId === this.ventureDraft.originDomainId);
    const dm = origin?.settlement?.demandModifiers?.[merch.id] || 0;
    line.purchasePricePerStone = this.dmEffectivePrice(merch, dm);
  },
  ventureCargoSubtotal(cargo){
    return (cargo||[]).reduce((s,c)=>s+(c.quantityStone||0)*(c.purchasePricePerStone||0),0);
  },
  // Open the venture-create modal with a fresh draft
  openVentureCreateModal(){
    this.ventureDraft={
      venturerCharacterId:'',
      venturerName:'',
      venturerLevel:1,
      originDomainId:'',
      destinationDomainId:'',
      cargo:[{merchandiseId:'', quantityStone:0, purchasePricePerStone:0}],
      notes:'',
      turnsUntilArrival:2
    };
    this.showVentureCreateModal=true;
  },
  cancelVentureCreate(){this.showVentureCreateModal=false;this.ventureDraft.cargo=[];},
  // Create a venture from the draft. The venturer is picked from the existing Characters list (Phase 2.6 fold-in).
  createVenture(){
    const d=this.ventureDraft;
    if(!d.venturerCharacterId){alert('Pick a venturer from the character list. Create a new character first if needed.');return;}
    if(!d.originDomainId||!d.destinationDomainId){alert('Pick an origin and destination market.');return;}
    if(d.originDomainId===d.destinationDomainId){alert('Origin and destination must differ.');return;}
    const validCargo=(d.cargo||[]).filter(c=>c.merchandiseId&&(c.quantityStone||0)>0);
    if(validCargo.length===0){alert('Add at least one cargo line with merchandise and quantity.');return;}
    if(!Array.isArray(this.currentCampaign.characters))this.currentCampaign.characters=[];
    const character = this.currentCampaign.characters.find(c => c.id === d.venturerCharacterId);
    if(!character){alert('Picked character not found. Refresh and try again.');return;}
    // RAW (RR pp.370-380): one active arbitrage venture per character at a time (capital is committed).
    const existingActive=this.activeVenturesByCharacterName(character.name);
    if(existingActive.length>0){
      const ev=existingActive[0];
      const routeStr=this.domainNameById(ev.originDomainId)+' → '+this.domainNameById(ev.destinationDomainId);
      if(!confirm(character.name+' already has an active venture in progress ('+routeStr+', status: '+this.ventureStatusLabel(ev)+').\n\nPer ACKS RAW, a venturer can only run one arbitrage venture at a time (exceptions: guildhouse followers at 9th level, or different-named henchmen).\n\nProceed anyway?'))return;
    }
    // Phase 2b.6 — commercial-expedition passive investments use the same capital pool as active
    // ventures. If this character has an enabled CE investment, prompt to pause it.
    const conflictingInv = (this.currentCampaign?.passiveInvestments||[]).find(inv =>
      inv.ownerCharacterId === character.id &&
      inv.type === 'commercial-expedition' &&
      inv.enabled
    );
    if(conflictingInv){
      if(!confirm(character.name+' has an active commercial-expedition passive investment ('+conflictingInv.capital.toLocaleString()+'gp at '+this.passiveInvestmentRateLabel(conflictingInv.riskTier)+').\n\nLaunching an active venture commits the same capital to this specific arbitrage run, so the passive investment will be paused until the venture completes.\n\nPause passive investment and launch venture?')){return;}
      conflictingInv.enabled = false;
    }
    const totalInvestment=this.ventureCargoSubtotal(validCargo);
    const currentTurn=this.currentCampaign.currentTurn||1;
    const arrivalTurn=currentTurn+Math.max(1,parseInt(d.turnsUntilArrival)||2);
    const venture={
      id: 'venture-'+Math.random().toString(36).slice(2,9),
      venturerCharacterId: character.id,
      venturerName: character.name,                  // denormalized for display / history
      originDomainId: d.originDomainId,
      destinationDomainId: d.destinationDomainId,
      cargo: validCargo.map(c=>({merchandiseId:c.merchandiseId, quantityStone:c.quantityStone, purchasePricePerStone:c.purchasePricePerStone, purchaseCostGp:Math.round(c.quantityStone*c.purchasePricePerStone)})),
      totalInvestment,
      status: 'in-transit',
      departureTurn: currentTurn,
      expectedArrivalTurn: arrivalTurn,
      vagaries: [],
      notes: d.notes||'',
      // Cross-system hooks reserved for later phases (Phase 3 escorts, 2.7 syndicate disruption, 4 tariffs)
      garrisonEscortUnits: [],
      syndicateDisruptionId: null,
      politicalTariffs: []
    };
    if(!Array.isArray(this.currentCampaign.ventures))this.currentCampaign.ventures=[];
    this.currentCampaign.ventures.push(venture);
    // Mercantile network: leaving a market with cargo establishes a relationship there.
    if(!Array.isArray(character.mercantileNetwork))character.mercantileNetwork=[];
    if(!character.mercantileNetwork.includes(d.originDomainId)) character.mercantileNetwork.push(d.originDomainId);
    const originStr = this.domains.find(x=>x.id===d.originDomainId)?.name||'?';
    const destStr = this.domains.find(x=>x.id===d.destinationDomainId)?.name||'?';
    const launchSummary = 'Venture launched: '+character.name+' carrying '+this.pluralize(validCargo.length, 'merchandise line')+' ('+totalInvestment.toLocaleString()+'gp investment) from '+originStr+' to '+destStr+', expected arrival Turn '+arrivalTurn+'.';
    this.recordAppliedEvent('venture-launch', {
      ventureId: venture.id, venturerCharacterId: character.id,
      totalInvestment, originDomainId: d.originDomainId, destinationDomainId: d.destinationDomainId,
      expectedArrivalTurn: arrivalTurn, cargo: validCargo,
      narrativeSummary: launchSummary
    }, { submittedBy: 'gm', result: { domainsChanged: [d.originDomainId, d.destinationDomainId].filter(Boolean), hexesChanged: [], charactersChanged: [character.id], treasuryDelta: -totalInvestment, narrativeSummary: launchSummary } });
    this.addCharacterHistory(character, 'venture',
      'Launched venture '+originStr+' → '+destStr+' ('+totalInvestment.toLocaleString()+'gp investment, '+this.pluralize(validCargo.length, 'cargo line')+').',
      {ventureId:venture.id, source:'venture-launch'}
    );
    this.showVentureCreateModal=false;
    this.showToast('Venture launched. It ticks down each monthly turn.');
  },
  // Advance status by one step in the in-transit → selling → complete pipeline.
  // 'failed' is a separate abort path (see abortVenture).
  advanceVentureStatus(venture){
    if(!venture)return;
    if(venture.status==='in-transit'){
      venture.status='selling';
      venture.arrivalTurn=this.currentCampaign.currentTurn||1;
      // Add destination to mercantile network (venturer has now reached it).
      const character=(this.currentCampaign?.characters||[]).find(c=>c.id===venture.venturerCharacterId);
      if(character){
        if(!Array.isArray(character.mercantileNetwork))character.mercantileNetwork=[];
        if(!character.mercantileNetwork.includes(venture.destinationDomainId)){
          character.mercantileNetwork.push(venture.destinationDomainId);
        }
      }
      this.showToast('Venture arrived at destination. Open the complete dialog to settle.');
    } else if(venture.status==='selling'){
      // Open the complete-modal to ask for sale price
      this.openVentureCompleteModal(venture);
    }
  },
  openVentureCompleteModal(venture){
    if(!venture)return;
    this.ventureCompletingId=venture.id;
    // Default suggested sale price: sum of (quantity × effective-price-at-destination) for each cargo line
    const destSettlement=this.allSettlements().find(s=>s.domainId===venture.destinationDomainId);
    let suggested=0;
    (venture.cargo||[]).forEach(c=>{
      const merch=lookupMerchandise(c.merchandiseId);
      const dm=destSettlement?.settlement?.demandModifiers?.[c.merchandiseId]||0;
      suggested += (c.quantityStone||0) * this.dmEffectivePrice(merch, dm);
    });
    this.ventureSalePriceInput=Math.round(suggested);
    this.showVentureCompleteModal=true;
  },
  // Finalize a venture: book profit/loss, append to venturer's earnings ledger, log event.
  completeVenture(){
    const v=(this.currentCampaign.ventures||[]).find(x=>x.id===this.ventureCompletingId);
    if(!v){this.showVentureCompleteModal=false;return;}
    const salePrice=Math.max(0,parseInt(this.ventureSalePriceInput)||0);
    const profit=salePrice-(v.totalInvestment||0);
    v.status='complete';
    v.salePriceGp=salePrice;
    v.profitGp=profit;
    v.completedTurn=this.currentCampaign.currentTurn||1;
    // Update venturer ledger
    const character=(this.currentCampaign?.characters||[]).find(c=>c.id===v.venturerCharacterId);
    let ventureXpAwarded = 0;
    if(character){
      if(!Array.isArray(character.earningsLedger))character.earningsLedger=[];
      character.earningsLedger.push({ventureId:v.id, turn:v.completedTurn, gp:profit, kind:'venture-profit', fromDomainId:v.originDomainId, toDomainId:v.destinationDomainId});
      // Phase 2.6 followup 5 — Venture XP per RR p.423. Simplified model: the venturer is both owner
      // and operator of the venture, so the full profit applies against their GP threshold.
      // (Multi-operator partitioning lands with the systematic venturer-class-powers task #96.)
      if(profit > 0){
        const threshold = computeGpThreshold(character.level||1);
        const xp = Math.max(0, profit - threshold);
        if(xp > 0){
          const henchPenalty = character.liegeCharacterId ? 0.5 : 1.0;
          ventureXpAwarded = Math.round(xp * henchPenalty);
          character.xp = (character.xp || 0) + ventureXpAwarded;
          v.xpAwarded = ventureXpAwarded;
        }
      }
      // Per-character history entry covering the venture outcome
      const destName = this.domains.find(x=>x.id===v.destinationDomainId)?.name || '?';
      const originName = this.domains.find(x=>x.id===v.originDomainId)?.name || '?';
      this.addCharacterHistory(character, 'venture',
        'Venture '+originName+' → '+destName+': sold for '+salePrice.toLocaleString()+'gp ('+(profit>=0?'+':'')+profit.toLocaleString()+'gp '+(profit>=0?'profit':'loss')+')'+(ventureXpAwarded>0?', +'+ventureXpAwarded.toLocaleString()+' XP':''),
        {ventureId:v.id, profit, xp:ventureXpAwarded, source:'venture'}
      );
      // Check for any level-ups now (a single venture can sometimes earn enough XP to gain a level).
      // Respect the autoAdvance flag — venture XP still accrues, but no auto level-up if opted out.
      if(ventureXpAwarded > 0 && character.autoAdvance !== false){
        let guard = 20;
        while(guard-- > 0){
          const next = xpToNextLevel(character);
          if(next === null || next === Infinity) break;
          if((character.xp || 0) < next) break;
          if(!this.levelUpCharacter(character)) break;
        }
      }
    }
    const xpBlurb = ventureXpAwarded > 0 ? ', +'+ventureXpAwarded.toLocaleString()+'XP' : '';
    const completeSummary = 'Venture complete: '+v.venturerName+' sold cargo for '+salePrice.toLocaleString()+'gp ('+(profit>=0?'profit':'loss')+' '+Math.abs(profit).toLocaleString()+'gp)'+xpBlurb+' at '+(this.domains.find(x=>x.id===v.destinationDomainId)?.name||'?')+'.';
    this.recordAppliedEvent('venture-result', {
      ventureId: v.id, outcome: 'arrived', finalSalePrice: salePrice
    }, { submittedBy: 'gm', result: { domainsChanged: [v.destinationDomainId].filter(Boolean), hexesChanged: [], charactersChanged: character ? [character.id] : [], treasuryDelta: profit, narrativeSummary: completeSummary } });
    this.showVentureCompleteModal=false;
    this.ventureCompletingId=null;
    this.showToast((profit>=0?'+':'')+profit.toLocaleString()+'gp profit booked to '+(character?.name||'venturer')+xpBlurb+'.');
  },
  abortVenture(venture){
    if(!venture)return;
    if(!confirm('Abort venture "'+venture.venturerName+'" ('+(venture.totalInvestment||0).toLocaleString()+'gp investment lost)?'))return;
    venture.status='failed';
    venture.completedTurn=this.currentCampaign.currentTurn||1;
    const character=(this.currentCampaign?.characters||[]).find(c=>c.id===venture.venturerCharacterId);
    if(character){
      if(!Array.isArray(character.earningsLedger))character.earningsLedger=[];
      character.earningsLedger.push({ventureId:venture.id, turn:venture.completedTurn, gp:-(venture.totalInvestment||0), kind:'venture-aborted', fromDomainId:venture.originDomainId, toDomainId:venture.destinationDomainId, aborted:true});
      this.addCharacterHistory(character, 'venture',
        'Aborted venture — lost '+(venture.totalInvestment||0).toLocaleString()+'gp investment.',
        {ventureId:venture.id, source:'venture-aborted'}
      );
    }
    const abortSummary = 'Venture aborted: '+venture.venturerName+' lost '+(venture.totalInvestment||0).toLocaleString()+'gp investment.';
    this.recordAppliedEvent('venture-result', {
      ventureId: venture.id, outcome: 'failed', finalSalePrice: 0
    }, { submittedBy: 'gm', result: { domainsChanged: [], hexesChanged: [], charactersChanged: character ? [character.id] : [], treasuryDelta: -(venture.totalInvestment||0), narrativeSummary: abortSummary } });
    this.showToast('Venture aborted, loss booked.');
  },
  // Lookup helpers for the Ventures view rendering
  domainNameById(id){return this.domains.find(d=>d.id===id)?.name || id || '?';},
  ventureStatusLabel(v){
    return ({'in-transit':'⛵ In transit','selling':'🛒 Selling at destination','complete':'✓ Complete','failed':'✗ Failed'})[v?.status] || v?.status || '?';
  },
  ventureProfitColor(v){
    if(v?.status==='complete'){return (v.profitGp||0)>=0 ? 'accent-green' : 'accent-red';}
    if(v?.status==='failed') return 'accent-red';
    return '';
  },

  pluralize(n, sing, plur){
    return n + ' ' + (n === 1 ? sing : (plur || sing + 's'));
  },

  showToast(msg,ms=2200,type){
    this.toast=msg;
    // Semantic variant (graphic-designer O3, 2026-06-14): an optional 'success'|'warn'|'error'
    // tints the bar (left accent stripe; error darkens it). Back-compatible — existing 2-arg
    // calls pass no type and keep the neutral brown bar. When unspecified, a light heuristic
    // infers 'error' from failure phrasing so the many existing error toasts read as errors
    // without touching every call site; pass an explicit type to override.
    this.toastType = type || this._inferToastType(msg);
    clearTimeout(this._toastTimer);
    // Joachim 2026-05-30 — toasts felt too quick to read. Bump every call by +4s.
    // Defaults: 2200ms → 6200ms; explicit ms=5000 (commit-turn) → 9000ms; ms=8000 (commit-fail) → 12000ms.
    this._toastTimer=setTimeout(()=>{ this.toast=''; this.toastType=''; },ms+4000);
  },
  _inferToastType(msg){
    const m = String(msg || '').toLowerCase();
    if(/\b(fail|failed|error|could not|couldn't|cannot|can't|invalid|required|denied|not allowed|no .* to|unable|missing)\b/.test(m)) return 'error';
    return '';
  },

  newCampaign(){
    if(this.currentCampaign&&!confirm('Replace the current campaign? Unsaved changes will be lost.'))return;
    const name=prompt('Campaign name:','New Campaign')||'New Campaign';
    this.currentCampaign=blankCampaign({name});
    this.domains=[];this.selectedDomainId=null;
    this.fileHandle=null;this.fileName='';
    this.mapViewBox=null; // #225 re-fit the map to the new campaign on next open
    this.showToast('Campaign "'+name+'" created (unsaved).');
  },

  // Header "🏠 Welcome" button — return to the first-run welcome / launcher screen
  // (the no-campaign state on World ▸ Domains). The welcome banner still offers the demo,
  // the template picker, Open, and Start blank, so the demo stays one click away. Confirms
  // first only if there are unsaved changes; clearing the campaign is otherwise reversible
  // (reopen from the welcome screen). Mirrors loadCampaignFromObject's mutation-guard tail
  // so clearing currentCampaign doesn't trip the dirty flag / beforeunload guard.
  showWelcomeScreen(){
    if(this.dirty && this.currentCampaign && !confirm('Return to the welcome screen? Your unsaved changes will be lost.')) return;
    this._ignoreMutations = true;
    this.currentCampaign = null;
    this.domains = [];
    this.selectedDomainId = null;
    this.fileHandle = null;
    this.fileName = '';
    this.mapViewBox = null;
    this.currentView = 'domains';    // the welcome banner lives on the Domains tab
    this.domainsSubView = 'domains';
    this.dirty = false;
    const release = () => { this._ignoreMutations = false; this.dirty = false; };
    if(typeof this.$nextTick === 'function') this.$nextTick(release); else setTimeout(release, 0);
    setTimeout(release, 0);
  },

  loadCampaignFromObject(obj,sourceName){
    if(!obj||obj.kind!=='campaign')throw new Error('Not a campaign file (kind="'+(obj&&obj.kind||'?')+'")');
    // Suppress dirty-marking while the campaign hydrates: the deep watchers fire as
    // currentCampaign/domains are assigned, which is a load, not a user edit.
    this._ignoreMutations = true;
    const camp=migrateCampaign(obj);
    // Security/integrity gate (appsec audit C1/I2, 2026-05-31). A shared .acks.json is
    // untrusted input — validateCampaign flags duplicate ids, non-unique hex coords, and
    // missing/non-array core collections. Surface issues and let the GM decide rather than
    // silently trusting the file (the old guard only checked kind==='campaign'). Validate
    // here while domains are still populated + hexes still nested (before the lift empties them).
    try{
      const vr = window.ACKS.validateCampaign(camp);
      if(vr && vr.ok === false && Array.isArray(vr.errors) && vr.errors.length){
        const shown = vr.errors.slice(0,8).map(e => '• '+e).join('\n');
        const more = vr.errors.length > 8 ? ('\n…and '+(vr.errors.length-8)+' more.') : '';
        const proceed = window.confirm('This campaign file has '+vr.errors.length+' data-integrity issue(s):\n\n'+shown+more+'\n\nLoading anyway may cause incorrect behavior. Load it regardless?');
        if(!proceed) throw new Error('Load cancelled — campaign failed validation ('+vr.errors.length+' issue(s)).');
      }
    }catch(verr){
      if(/Load cancelled/.test(verr.message)) throw verr; // user explicitly aborted
      console.warn('validateCampaign check skipped (validator error):', verr); // never let a validator bug block a good file
    }
    // Turn Cycle v2: ensure the new event arrays exist (additive schema) for older v2 saves.
    this.currentCampaign=camp;          // domains stay attached — single home (no empty / re-stitch)
    this.mapViewBox=null; // #225 re-fit the map to the loaded campaign on next open
    // UI-only post-migrate load steps (lift + per-entity shapes + agricultural projects), shared
    // with the session-restore path so they run once, consistently. Idempotent.
    this._finishLoad(camp);
    this.selectedDomainId=this.domains[0]?this.domains[0].id:null;
    this.fileName=sourceName||'';
    // A freshly loaded campaign is the clean baseline. Clear dirty, then release the
    // mutation guard after Alpine has flushed the load-triggered watcher callbacks.
    this.dirty = false;
    const release = () => { this._ignoreMutations = false; };
    if(typeof this.$nextTick === 'function') this.$nextTick(release); else setTimeout(release, 0);
    setTimeout(()=>{ this._ignoreMutations = false; this.dirty = false; }, 0); // belt-and-suspenders
    this.showToast('Loaded "'+this.currentCampaign.name+'" ('+this.pluralize(this.domains.length, 'domain')+').');
  },

  // UI-only post-migrate load steps (NOT in the engine's migrateCampaign): ensure the core
  // top-level collections exist, run the lazy per-entity shape migrations, lift nested hexes/
  // settlements/rumors to the top level, then materialize agricultural Projects (which needs the
  // lifted hexes). Shared by loadCampaignFromObject + the session-restore path so it runs once per
  // load instead of being duplicated. Idempotent — safe to re-run on already-processed (session-
  // cache) data. migrateCampaign already ran with domains attached, so the engine's domain-reading
  // migrations (mining strip, treasuries, classification, parties, …) are done; these are the steps
  // that live in the UI layer.
  _finishLoad(camp){
    if(!camp) return;
    if(!Array.isArray(camp.domains))      camp.domains = [];
    if(!Array.isArray(camp.pendingEvents))camp.pendingEvents = [];
    if(!Array.isArray(camp.eventLog))     camp.eventLog = [];
    if(!Array.isArray(camp.hexes))        camp.hexes = [];
    if(!Array.isArray(camp.settlements))  camp.settlements = [];
    if(!Array.isArray(camp.rumors))       camp.rumors = [];
    const ds = camp.domains;
    // Turn Cycle v2 — lazy-migrate legacy domain.pendingPlayerInput into player-plan events.
    window.ACKS.migratePendingPlayerInputToEvents(camp);
    // Foundation #16 — strongholds → components[] shape.
    ds.forEach(d => window.ACKS.migrateStrongholdToComponents(d));
    // Foundation #17 — hex.landImprovementProjects[] → accumulated invested. Reads the NESTED hexes,
    // so it must run BEFORE the lift empties domain.geography.hexes[].
    ds.forEach(d => (d.geography?.hexes||[]).forEach(h => window.ACKS.migrateHexToAccumulatedImprovement(h)));
    // Foundation #18 — single supervisor → multi-supervisor array. Also pre-lift (nested hexes).
    ds.forEach(d => (d.geography?.hexes||[]).forEach(h => window.ACKS.migrateHexToMultiSupervisor(h)));
    // Officers — idempotent shape-ensure for domain.magistrates (RR p.344).
    ds.forEach(d => window.ACKS.ensureMagistratesShape(d));
    // Foundation #193 — lift hexes/settlements/rumors to the top-level collections (empties the
    // nested domain.geography.hexes[]). Idempotent.
    const liftSynth = { domains: ds, hexes: camp.hexes, settlements: camp.settlements, rumors: camp.rumors };
    window.ACKS.liftToTopLevelCollections(liftSynth);
    camp.hexes = liftSynth.hexes;
    camp.settlements = liftSynth.settlements;
    camp.rumors = liftSynth.rumors;
    // Wave Construction-B — materialize agricultural Projects now that hexes are lifted into
    // camp.hexes (templates ship hexes nested, so migrateCampaign's earlier pass saw none). Idempotent.
    window.ACKS.migrateAgriculturalToProjects(camp);
    // T6 single-home — now that the hexes/settlements are lifted (and any legacy nested membership has
    // backfilled domainId/hexId onto the canonical entities), STRIP the nested hex/settlement mirror so
    // the single home (campaign.hexes / .settlements) is the only home in memory. The unit mirror was
    // already stripped inside migrateCampaign (strip-unit-mirror, order 155). Idempotent.
    if(window.ACKS.stripHexSettlementMirrors) window.ACKS.stripHexSettlementMirrors(camp);
  },

  // Templates ship with our app and must never be overwritten by Save.
  // Filename convention: shipped templates begin with "v2-" and end with ".acks.json".
  isTemplateFilename(name){ return /^v2-.+\.acks\.json$/i.test(name||''); },

  async openCampaign(){
    if(this.fsaOpenSupported){
      try{
        const [handle]=await window.showOpenFilePicker({
          multiple:false,
          types:[{description:'ACKS Campaign',accept:{'application/json':['.acks.json','.json']}}]
        });
        const file=await handle.getFile();
        // If this is a shipped template, do NOT bind the file handle — Save would otherwise overwrite it.
        // The user must explicitly Save As to a new file. Show a toast so they know what just happened.
        if(this.isTemplateFilename(handle.name)){
          this.fileHandle=null;
          this.loadCampaignFromObject(JSON.parse(await file.text()),'');
          this.showToast('Template loaded — Save will prompt for a new file so the template stays intact.', 6000);
        } else {
          this.fileHandle=handle;
          this.loadCampaignFromObject(JSON.parse(await file.text()),handle.name);
        }
      }catch(e){
        if(e.name!=='AbortError'){console.error(e);alert('Open failed: '+e.message);}
      }
    }else{
      // Fallback: standard file input
      this.$refs.campaignFileInput.click();
    }
  },

  async importCampaignFile(file){
    if(!file)return;
    try{
      this.fileHandle=null; // no live write-back when loaded via input element
      this.loadCampaignFromObject(JSON.parse(await file.text()),file.name);
      if(this.isTemplateFilename(file.name)){
        this.showToast('Template loaded — Save will prompt for a new file so the template stays intact.', 6000);
      }
    }catch(e){alert('Could not load campaign: '+e.message);}
  },

  // Welcome banner — instant-load the inlined Established March demo.
  // The template object is shipped in acks-demo-template.js; deep-clone before
  // loading so user edits don't mutate the inline source.
  loadDemoTemplate(){
    if(this.currentCampaign && !confirm('Replace the current campaign with the demo? Unsaved changes will be lost.'))return;
    const tpl = window.ACKS_DEMO_TEMPLATE;
    if(!tpl){ alert('Demo template not loaded — make sure acks-demo-template.js is present next to index.html and reload.'); return; }
    try{
      const clone = JSON.parse(JSON.stringify(tpl));
      this.fileHandle = null; // template → unbound, Save prompts for a new file
      this.loadCampaignFromObject(clone, '');
      this.showToast('Demo loaded — Save will prompt for a new file so the template stays intact.', 6000);
    }catch(e){
      console.error(e);
      alert('Could not load demo: '+e.message);
    }
  },

  // Welcome-banner template picker — load one of the six shipped Templates/*.acks.json.
  // On the hosted site (http/https) the folder is same-origin, so fetch + load in one click,
  // exactly like the demo. Under file:// relative fetch is blocked by the browser, so fall back
  // to the manual file picker. Loaded unbound (sourceName '') so Save can't overwrite the
  // shipped template — same posture as the demo and the Open-of-a-template paths.
  async loadShippedTemplate(filename){
    if(this.currentCampaign && !confirm('Replace the current campaign with this template? Unsaved changes will be lost.'))return;
    const httpish = location.protocol === 'http:' || location.protocol === 'https:';
    if(httpish){
      try{
        const resp = await fetch('Templates/'+filename, {cache:'no-cache'});
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        const obj = await resp.json();
        this.fileHandle = null; // template → unbound, Save prompts for a new file
        this.loadCampaignFromObject(obj, '');
        this.showToast('Template loaded — Save will prompt for a new file so the template stays intact.', 6000);
        return;
      }catch(e){
        console.warn('Template fetch failed; falling back to the file picker:', e);
        this.showToast('Couldn’t auto-load the template — pick '+filename+' from the Templates/ folder.', 7000);
      }
    } else {
      this.showToast('Running from a local file — pick '+filename+' from the Templates/ folder.', 7000);
    }
    // Fallback (file:// or a fetch error): the manual file input → importCampaignFile().
    this.$refs.campaignFileInput.click();
  },

  // Welcome banner — derive the demo's headline counts from the inlined demo template so the
  // copy can't go stale when the demo is regenerated (ux-product audit O3). Defensive defaults
  // if the template script somehow didn't load.
  demoStats(){
    const t = window.ACKS_DEMO_TEMPLATE || {};
    const arr = (x) => Array.isArray(x) ? x : [];
    const due = arr(t.pendingEvents).filter(e => e && e.status === 'pending' && (e.targetTurn || 0) <= (t.currentTurn || 1)).length;
    return {
      turn: t.currentTurn || 1,
      domains: arr(t.domains).length,
      characters: arr(t.characters).length,
      settlements: arr(t.settlements).length,
      rumors: arr(t.rumors).length,
      pendingDue: due
    };
  },

  async ensureWritePermission(handle){
    const opts={mode:'readwrite'};
    try{
      if((await handle.queryPermission(opts))==='granted')return true;
      if((await handle.requestPermission(opts))==='granted')return true;
    }catch(e){console.warn('Permission query/request failed',e);}
    return false;
  },

  serializedCampaign(){
    // Domains live on currentCampaign (single home), so the deep clone already includes them — no
    // re-stitch. Stamp lastModifiedAt on the campaign + each domain, drop the legacy field.
    const c=JSON.parse(JSON.stringify(this.currentCampaign));
    // T6 single-home — strip the now-gone nested mirrors (geography.hexes / hex.settlement /
    // garrison / mercenaryCompany) from the save-clone so the saved file carries only the canonical
    // top-level collections (campaign.hexes / .settlements / .units). Runs on the clone above.
    if(window.ACKS.stripNestedMirrors) window.ACKS.stripNestedMirrors(c);
    const today=new Date().toISOString().slice(0,10);
    c.lastModifiedAt=today;
    (c.domains||[]).forEach(dc=>{ dc.lastModifiedAt=today; });
    delete c.domainIds; // legacy field
    return c;
  },

  async saveCampaign(){
    if(!this.currentCampaign){alert('No campaign loaded.');return;}
    const payload=this.serializedCampaign();
    const json=JSON.stringify(payload,null,2);
    const suggestedName=slugify(payload.name||payload.id||'campaign')+'.acks.json';

    // Path A: we already have a live file handle — write back silently
    if(this.fileHandle){
      const ok=await this.ensureWritePermission(this.fileHandle);
      if(!ok){
        alert('Write permission to "'+this.fileName+'" was denied. You can choose a new location.');
        this.fileHandle=null;
        return this.saveCampaign();
      }
      try{
        const w=await this.fileHandle.createWritable();
        await w.write(json);await w.close();
        this.currentCampaign.lastModifiedAt=payload.lastModifiedAt;
        this.dirty=false; // written to the bound file — no unsaved content changes
        this.showToast('Saved to '+this.fileName+'.');
      }catch(e){
        console.error(e);alert('Save failed: '+e.message+'\n\nTry Save again, or your browser may have revoked file access.');
      }
      return;
    }

    // Path B: no handle yet, FSA save supported — prompt for location and get handle
    if(this.fsaSaveSupported){
      try{
        const handle=await window.showSaveFilePicker({
          suggestedName,
          types:[{description:'ACKS Campaign',accept:{'application/json':['.acks.json','.json']}}]
        });
        this.fileHandle=handle;
        this.fileName=handle.name;
        const w=await handle.createWritable();
        await w.write(json);await w.close();
        this.currentCampaign.lastModifiedAt=payload.lastModifiedAt;
        this.dirty=false; // written to the newly bound file
        this.showToast('Saved to '+handle.name+'.');
      }catch(e){
        if(e.name!=='AbortError'){console.error(e);alert('Save failed: '+e.message);}
      }
      return;
    }

    // Path C: fallback — trigger a download
    this.downloadJSON(payload,suggestedName);
    this.currentCampaign.lastModifiedAt=payload.lastModifiedAt;
    this.dirty=false; // exported a complete copy to the user's downloads
    this.showToast('Downloaded '+suggestedName+'.');
  },

  // Always prompts for a new location. Use to fork a campaign into a fresh file,
  // or to save a template-derived campaign to your own file for the first time.
  async saveCampaignAs(){
    if(!this.currentCampaign){alert('No campaign loaded.');return;}
    this.fileHandle=null; // force the "prompt for location" path in saveCampaign
    return this.saveCampaign();
  },

  upsertDomain(d){
    const i=this.domains.findIndex(x=>x.id===d.id);
    if(i>=0)this.domains[i]=d;else this.domains.push(d);
  },

  addBlankDomain(){
    if(!this.currentCampaign){alert('Create or open a campaign first.');return;}
    const d=blankDomain({name:'New Domain'});
    this.upsertDomain(d);this.selectedDomainId=d.id;this.activeTab='overview';
  },

  addFromTemplate(tpl){
    if(!this.currentCampaign){alert('Create or open a campaign first.');return;}
    const { domain: d, characters } = buildDomainFromTemplate(tpl);
    // v2: link companion characters (ruler + henchmen) into campaign.characters before the domain
    if(!Array.isArray(this.currentCampaign.characters)) this.currentCampaign.characters = [];
    characters.forEach(ch => this.currentCampaign.characters.push(ch));
    this.upsertDomain(d);this.selectedDomainId=d.id;this.activeTab='overview';
    this.showToast('Added "'+d.name+'" to campaign.');
  },

  async importDomainFiles(fileList){
    if(!this.currentCampaign){alert('Create or open a campaign first.');return;}
    // 2026-05-30 v0.9 close-out — extended to walk all top-level collections, not just
    // the original three (domains/characters/parties). Previous behavior silently dropped
    // stashes, rumors, Wave-A relations, notable items, ventures, etc. — meaning shared
    // domain files arrived bare-bones at the destination. See CLAUDE.md §8 for context.
    //
    // Collision semantics: skip duplicates by ID (idempotent — re-importing the same file is a no-op).
    // For hexes, ALSO skip on coordinate collision (since (q,r) is unique per campaign per Data Dictionary §1).
    // For each top-level collection we ensure it exists on currentCampaign and on the file's obj before walking.
    const camp = this.currentCampaign;
    const counts = {};       // collection name -> # added this import
    const skipped = [];      // human-readable per-item skip reasons

    // Helper — ensure dest is an array
    const ensureArr = (key) => { if(!Array.isArray(camp[key])) camp[key] = []; };

    // The collections we walk on a v2 campaign import.
    // 'domains' is handled separately (via upsertDomain).
    // 'hexes' has an extra (q,r) coordinate uniqueness check.
    // Workflow state (pendingEvents) is excluded — those are destination-scoped.
    // eventLog is included so imported event history travels with the data.
    // Derived from the §15.5 collection registry (every descriptor with importable:true; see
    // acks-engine.js registerCollection). 'domains' + 'hexes' are deliberately excluded (importable:
    // false) — they are special-cased above with their own upsert / coordinate-uniqueness handling.
    // The §8.9 importer mandate is now automatic: a module that registers an importable collection is
    // walked here with no edit to this file. (Pre-refactor this was a hand-maintained literal — the
    // dominant per-burst merge-conflict site.)
    const SIMPLE_ID_COLLECTIONS = window.ACKS.importableCollections();
    // eventLog has 'id' inside event.id (one level nested). We skip wrap mismatch for now; handled inline below.

    // Prepare existing-ID sets for fast collision detection
    SIMPLE_ID_COLLECTIONS.forEach(ensureArr);
    ensureArr('domains'); ensureArr('hexes');
    const existingIdSets = {};
    for(const key of ['domains', ...SIMPLE_ID_COLLECTIONS]){
      existingIdSets[key] = new Set((camp[key]||[]).map(x=>x && x.id).filter(Boolean));
    }
    // Hex extra: track existing coordinates
    const existingHexIds = new Set((camp.hexes||[]).map(h=>h&&h.id).filter(Boolean));
    const existingHexCoords = new Set(
      (camp.hexes||[]).filter(h=>h&&h.coord).map(h => h.coord.q + ',' + h.coord.r)
    );

    for(const file of fileList){
      try{
        const obj = JSON.parse(await file.text());
        if(obj.kind === 'campaign'){
          // Walk domains via upsert
          for(const d of (obj.domains||[])){
            if(existingIdSets.domains.has(d.id)){ skipped.push('domain '+d.id+' (duplicate)'); continue; }
            this.upsertDomain(d); existingIdSets.domains.add(d.id);
            counts.domains = (counts.domains||0) + 1;
          }
          // Walk hexes with both id + coord uniqueness
          for(const h of (obj.hexes||[])){
            if(!h || !h.id){ continue; }
            if(existingHexIds.has(h.id)){ skipped.push('hex '+h.id+' (duplicate id)'); continue; }
            const ckey = h.coord ? (h.coord.q + ',' + h.coord.r) : null;
            if(ckey && existingHexCoords.has(ckey)){
              skipped.push('hex '+h.id+' (coordinate '+window.ACKS.hexDisplayLabel(h.coord.q, h.coord.r)+' already taken)');
              continue;
            }
            camp.hexes.push(h); existingHexIds.add(h.id);
            if(ckey) existingHexCoords.add(ckey);
            counts.hexes = (counts.hexes||0) + 1;
          }
          // Walk every simple-id collection
          for(const key of SIMPLE_ID_COLLECTIONS){
            const incoming = obj[key];
            if(!Array.isArray(incoming)) continue;
            const set = existingIdSets[key];
            for(const item of incoming){
              if(!item || !item.id){ continue; }
              if(set.has(item.id)){ skipped.push(key.slice(0,-1)+' '+item.id+' (duplicate)'); continue; }
              camp[key].push(item); set.add(item.id);
              counts[key] = (counts[key]||0) + 1;
            }
          }
          // eventLog: entries are {event:{id, ...}, ...} — dedupe by event.id
          if(Array.isArray(obj.eventLog)){
            if(!Array.isArray(camp.eventLog)) camp.eventLog = [];
            const existingEventIds = new Set(camp.eventLog.map(e => e && e.event && e.event.id).filter(Boolean));
            for(const entry of obj.eventLog){
              const evId = entry && entry.event && entry.event.id;
              if(!evId){ continue; }
              if(existingEventIds.has(evId)){ skipped.push('event-log '+evId+' (duplicate)'); continue; }
              camp.eventLog.push(entry); existingEventIds.add(evId);
              counts.eventLog = (counts.eventLog||0) + 1;
            }
          }
        } else if(obj.kind === 'domain'){
          // Single-domain file: nothing else to pull. Cross-refs may resolve via destination data.
          if(existingIdSets.domains.has(obj.id)){ skipped.push('domain '+obj.id+' (duplicate)'); continue; }
          this.upsertDomain(obj); existingIdSets.domains.add(obj.id);
          counts.domains = (counts.domains||0) + 1;
        } else {
          alert('Could not import '+file.name+': file kind is "'+(obj.kind||'?')+'" — expected "campaign" or "domain".');
        }
      } catch(e){ alert('Could not parse '+file.name+': '+e.message); }
    }
    if(!this.selectedDomainId && this.domains.length) this.selectedDomainId = this.domains[0].id;

    // Phase 3 Military W1 — an imported domain arrives with its nested garrison units AND
    // the same units arrive first-class via the 'units' collection (different parsed objects,
    // same ids). Re-unify immediately so both homes share one object (the load-time lift
    // would otherwise only heal this on the next reload).
    try { window.ACKS.migrateGarrisonUnitsToUnits(camp); } catch(e){ console.warn('unit re-unification after import failed', e); }

    // Build toast summary — only mention collections that actually had imports
    const PLURALIZE = {
      domains:'domain', characters:'character', parties:'party',
      hexes:'hex', settlements:'settlement', rumors:'rumor',
      stashes:'stash', ventures:'venture', passiveInvestments:'passive investment',
      henchmanships:'henchmanship', specialistContracts:'specialist contract',
      hirelingContracts:'hireling contract', magistracies:'magistracy',
      vassalages:'vassalage', tributaryAgreements:'tributary agreement',
      notableItems:'notable item', itemCustody:'custody record', groups:'group',
      journeys:'journey', outposts:'outpost', dungeons:'dungeon',
      deities:'deity', congregations:'congregation', divineFavors:'divine favor',
      attunements:'attunement', settlementVisits:'settlement visit',
      oaths:'oath', vagaryOfIncursionEvents:'incursion event', eventLog:'event-log entry',
      units:'unit', armies:'army',
      researchProjects:'research project', apprenticeships:'apprenticeship',
      loans:'loan', bankAccounts:'bank account',
      lettersOfCredit:'letter of credit'   // === Banking B4/B5 (team burst9 2026-06-20)
    };
    const parts = [];
    for(const [key, n] of Object.entries(counts)){
      const word = PLURALIZE[key] || key;
      const pluralized = (n === 1 || word === 'party') ? (word === 'party' && n !== 1 ? 'parties' : word) : (word.endsWith('y') ? word.slice(0,-1)+'ies' : word + 's');
      parts.push(n + ' ' + pluralized);
    }
    let msg = parts.length ? 'Imported ' + parts.join(', ') + '.' : 'Nothing imported.';
    if(skipped.length) msg += ' (' + skipped.length + ' duplicate' + (skipped.length === 1 ? '' : 's') + ' skipped)';
    // Surface a longer toast since the message may list many collections
    this.showToast(msg, 6000);
  },

  duplicateDomain(id){
    const orig=this.domains.find(d=>d.id===id);if(!orig)return;
    const copy=JSON.parse(JSON.stringify(orig));
    copy.id=slugify(orig.name+' copy')+'-'+Math.random().toString(36).slice(2,6);
    copy.name=orig.name+' (copy)';copy.history=[];
    this.upsertDomain(copy);this.selectedDomainId=copy.id;
  },

  removeDomain(id){
    if(!confirm('Remove this domain from the campaign?'))return;
    this.domains=this.domains.filter(d=>d.id!==id);
    if(this.selectedDomainId===id)this.selectedDomainId=this.domains[0]?this.domains[0].id:null;
  },

  downloadDomain(d){this.downloadJSON(d,d.id+'.domain.json');},
  downloadJSON(obj,filename){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;
    document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},100);
  },

  applyRawJson(){
    try{
      const obj=JSON.parse(this.$refs.rawJson.value);
      // v2: raw-JSON edits must already be v2 shape; no migrate step
      const migrated=obj;
      const i=this.domains.findIndex(d=>d.id===migrated.id);
      if(i>=0)this.domains[i]=migrated;else this.upsertDomain(migrated);
      this.selectedDomainId=migrated.id;
      this.rawJsonError='Applied.';
      setTimeout(()=>this.rawJsonError='',2000);
    }catch(e){this.rawJsonError=e.message;}
  },

  // logEvent — DEPRECATED 2026-05-28 (Foundation #234). No-op stub kept ONLY so the
  // _legacyCommitTurnDeadCode dead method body doesn't fail static lint. New code MUST
  // emit a typed event (via recordAppliedEvent or window.ACKS.applyEvent) — the Campaign
  // Log view now renders from eventLog directly, not from campaign.log[].
  logEvent(_text){
    // intentionally empty — see Foundation #234
  },

  // (Campaign Log retired 2026-06-22 — campaignLogEntries()/_computeCampaignLogEntries() removed
  // with the redundant Campaign Log view. The Event Log shows everything; the day/month-scale
  // views filter it. The campaignLogHidden flag lives on — it now gates the Daily Events
  // "show routine" toggle and the per-entity history boxes.)

  // Build a context-rich narrative for a rejected event so the Event Log shows WHAT
  // was rejected rather than a bare "Rejected by GM". Pulls payload preview fields by
  // kind so a rejected rumor-emit reads "Rejected rumor-emit (from engine): 'Brigands
  // gather in the Thorn Wood' (topic: brigands, level 2)" instead of nothing.
  // Used by both resolvePendingEvent (real-time reject) and commitTurn's reject loop.
  _buildRejectionSummary(ev){
    if(!ev) return 'Rejected by GM';
    const kind = ev.kind || 'event';
    const payload = ev.payload || {};
    const submitter = ev.submittedBy || 'unknown';
    // Small helpers to resolve refs to human names (falls back to the id when not found).
    const domName = id => {
      if(!id) return null;
      const d = (this.domains||[]).find(x => x.id === id);
      return d?.name ? d.name : id;
    };
    const setName = id => {
      if(!id) return null;
      const s = (this.currentCampaign?.settlements||[]).find(x => x.id === id);
      return s?.name ? s.name : id;
    };
    const chName = id => {
      if(!id) return null;
      const c = (this.currentCampaign?.characters||[]).find(x => x.id === id);
      return c?.name ? c.name : id;
    };
    let preview = null;
    // Kind-aware preview selection — rumor-emit's canonical text field is `rumorText`,
    // not `text`. Other kinds use payload.narrativeSummary / text / title / summary.
    if(kind === 'rumor-emit'){
      preview = payload.rumorText || payload.narrativeSummary || payload.text;
    } else {
      preview = payload.narrativeSummary || payload.text || payload.title || payload.summary;
    }
    // Kind-specific extra context (appended after preview when both exist).
    const extras = [];
    if(kind === 'rumor-emit'){
      if(payload.topic) extras.push('topic: '+payload.topic);
      if(payload.apparentLevel) extras.push(payload.apparentLevel);
      if(payload.truthLevel) extras.push('truth: '+payload.truthLevel);
      if(payload.settlementId) extras.push('at '+setName(payload.settlementId));
      else if(payload.domainId) extras.push('in '+domName(payload.domainId));
      else if(payload.scope) extras.push('scope: '+payload.scope);
    } else if(kind === 'treasury-grant'){
      if(payload.amount != null) extras.push((payload.amount>=0?'+':'')+payload.amount+'gp');
      if(payload.domainId) extras.push('domain: '+domName(payload.domainId));
      if(payload.reason) extras.push(payload.reason);
    } else if(kind === 'gm-fiat'){
      if(payload.field) extras.push('field: '+payload.field);
      if(payload.targetId) extras.push('target: '+payload.targetId);
      if(payload.reason) extras.push(payload.reason);
    } else if(kind === 'player-plan'){
      if(payload.domainId) extras.push('domain: '+domName(payload.domainId));
      const actionCount = Array.isArray(payload.intendedActions) ? payload.intendedActions.length : 0;
      if(actionCount) extras.push(actionCount+' action'+(actionCount===1?'':'s'));
    } else if(kind === 'adventure-result'){
      if(payload.lairId) extras.push('lair: '+payload.lairId);
      if(payload.outcome) extras.push('outcome: '+payload.outcome);
      if(payload.hexId) extras.push('hex: '+payload.hexId);
    } else if(kind === 'character-level-up'){
      if(payload.characterId) extras.push(chName(payload.characterId));
      if(payload.newLevel != null) extras.push('→ L'+payload.newLevel);
    } else if(kind === 'character-death'){
      if(payload.characterId) extras.push(chName(payload.characterId));
      if(payload.reason) extras.push(payload.reason);
    } else if(kind === 'venture-launch'){
      if(payload.venturerCharacterId) extras.push(chName(payload.venturerCharacterId));
      if(payload.totalInvestment != null) extras.push((payload.totalInvestment||0).toLocaleString()+'gp');
      if(payload.destinationDomainId) extras.push('→ '+domName(payload.destinationDomainId));
    } else if(kind === 'passive-investment-create' || kind === 'passive-investment-delete'){
      if(payload.name || payload.type) extras.push(payload.name || payload.type);
      if(payload.capital != null) extras.push((payload.capital||0).toLocaleString()+'gp');
    }
    // Truncate long previews so a 500-char freeform rumor doesn't drown the log row.
    if(preview && preview.length > 200) preview = preview.slice(0, 197) + '...';
    let summary = 'Rejected '+kind+' (from '+submitter+')';
    if(preview) summary += ': "'+preview+'"';
    if(extras.length) summary += ' ['+extras.join(', ')+']';
    if(ev.gmNotes) summary += ' — GM note: '+ev.gmNotes;
    return summary;
  },

  // Record a "fait accompli" event — one whose work has already been done inline by the
  // emit site (Alpine UI mutated state directly). The event lands in eventLog with
  // status='applied', skipping pendingEvents. This is the path for typed events that
  // describe "this thing happened" (level-ups, deaths, venture launches, etc.) rather
  // than "please approve this" submissions.
  //
  // Use cases (Foundation #234):
  //  - character auto-levels during commit → emit character-level-up
  //  - GM forces a level-up → emit character-level-up with source='gm-fiat'
  //  - character dies/retires → emit character-death
  //  - passive investment created/deleted → emit passive-investment-{create,delete}
  //  - venture launched → emit venture-launch
  //  - GM treasury adjust, gm-fiat edits, manual resolves all use this too (via existing paths)
  //
  // External tools should NOT use this — they should push to pendingEvents and let the
  // GM resolve via the Event Log view. This helper is for internal "already-done" emits.
  recordAppliedEvent(kind, payload, opts){return window.ACKS.recordAppliedEvent(this.currentCampaign, kind, payload, opts);},

  // Apply an ad-hoc treasury change (adventurer windfall, capital expenditure, GM correction…)
  // Logs to both the campaign log and the domain's per-domain history (as a transaction entry).
  adjustTreasury(d,amount,note){
    if(!d||!amount)return;
    const before=d.treasury.gp||0;
    d.treasury.gp=before+amount;
    const dateStr='Turn '+(this.currentCampaign?.currentTurn||1);
    // No campaign-log push — adjustTreasury callers (promptAdjustTreasury) emit a
    // treasury-grant or treasury-debit event which lands in eventLog with the same narrative.
    d.history.push({
      kind:'treasury-adjustment',
      date:dateStr,
      deltaTreasury:amount,
      note:note||'',
      treasuryBefore:before,
      treasuryAfter:d.treasury.gp
    });
  },
  // Found a named urban settlement on a specific hex per ACKS RR p.350.
  // Transfers peasants → settlement on the hex, deducts 10,000gp from treasury, logs as treasury adjustment.
  foundSettlementOnHex(d, hex, name, peasantsToTransfer){
    if(!d)return;
    if(!hex){alert('Hex not found.');return;}
    const existing = settlementAtHexG(hex);
    if(existing){alert('This hex already has a settlement ('+(existing.name||'unnamed')+').');return;}
    const cost=10000;
    const n=peasantsToTransfer||100;
    const trimmedName=(name||'').trim();
    if(!trimmedName){alert('Settlement needs a name.');return;}
    if(n<75||n>249){alert('Initial founding requires 75-249 peasant families.');return;}
    if((d.demographics.peasantFamilies||0)<n){alert('Not enough peasant families ('+d.demographics.peasantFamilies+' available, '+n+' needed).');return;}
    if((d.treasury.gp||0)<cost){alert('Not enough treasury ('+(d.treasury.gp||0).toLocaleString()+'gp available, '+cost.toLocaleString()+'gp needed).');return;}
    if(!confirm('Found settlement "'+trimmedName+'" on hex '+window.ACKS.hexDisplayLabel(hex.coord.q, hex.coord.r)+'?\n\nCost: 10,000gp from treasury\nTransfer '+n+' peasant families to the settlement\n\nThis sets the settlement\'s initial investment tier (max 249 families).'))return;
    // Apply
    this.adjustTreasury(d, -cost, 'Founded "'+trimmedName+'" on hex '+window.ACKS.hexDisplayLabel(hex.coord.q, hex.coord.r)+', '+n+' families');
    // Foundation #241 — go through the canonical setter so rural hex.families gets the matching haircut.
    window.ACKS.setPeasantPopulation(this.currentCampaign, d, (d.demographics.peasantFamilies||0) - n);
    // Single-home (T6): the settlement lives in the canonical campaign.settlements[], linked to the
    // hex by hexId (the embedded hex.settlement mirror is gone). blankSettlement gives it a stable id.
    const s = window.ACKS.blankSettlement({ name:trimmedName, families:n, totalInvestment:cost, foundedTurn:this.currentCampaign?.currentTurn||1, hexId:hex.id });
    if(!Array.isArray(this.currentCampaign.settlements)) this.currentCampaign.settlements = [];
    this.currentCampaign.settlements.push(s);
    this.markDirty(); this.schedulePersist();
    this.showToast('Founded "'+trimmedName+'" with '+n+' families.');
  },

  promptAdjustTreasury(d,sign){
    if(!d)return;
    const label=sign>0?'Add gp to':'Withdraw gp from';
    const amountStr=prompt(label+' '+d.name+'\'s treasury:\n\nAmount (positive integer):','0');
    if(!amountStr)return;
    const amount=sign*Math.abs(parseInt(amountStr.replace(/[^0-9-]/g,''),10)||0);
    if(!amount)return;
    const note=prompt('Reason (will be saved to campaign log):','')||'';
    this.adjustTreasury(d,amount,note);
  },

  get selectedDomain(){return this.domains.find(d=>d.id===this.selectedDomainId)||null;},
  get rootDomains(){return this.domains.filter(d=>!d.liegeId||!this.domains.find(x=>x.id===d.liegeId));},
  vassalsOf(id){return window.ACKS.vassalsOf(this.currentCampaign, id);},
  otherDomains(id){return this.domains.filter(d=>d.id!==id);},
  liegeOf(d){return d&&d.liegeId?this.domains.find(x=>x.id===d.liegeId)||null:null;},
  // A domain is the apex of its realm iff it has no liege (or its liege isn't loaded). Walks the chain to find it.
  realmApex(d){
    let cur=d;
    const seen=new Set();
    while(cur && cur.liegeId && !seen.has(cur.id)){
      seen.add(cur.id);
      const next=this.domains.find(x=>x.id===cur.liegeId);
      if(!next)return cur;
      cur=next;
    }
    return cur||d;
  },
  isRealmApex(d){return !d.liegeId;},
  // Flat list of {domain, depth} containing only domains BELOW the given id (vassals, sub-vassals, ...)
  vassalChainUnder(rootId){return window.ACKS.vassalChainUnder(this.currentCampaign, rootId);},
  // Flat list of {domain, depth} for arbitrary-depth tree rendering. Roots first, then DFS.
  get domainTree(){
    const out=[];
    const visited=new Set();
    const visit=(d,depth)=>{
      if(visited.has(d.id))return; // cycle guard
      visited.add(d.id);
      out.push({domain:d,depth});
      this.vassalsOf(d.id).forEach(child=>visit(child,depth+1));
    };
    this.rootDomains.forEach(r=>visit(r,0));
    // Also include any orphan domains whose liegeId points to a missing domain (safety)
    this.domains.forEach(d=>{if(!visited.has(d.id))out.push({domain:d,depth:0});});
    return out;
  },

  totalFamilies(d){return window.ACKS.totalFamilies(this.currentCampaign, d);},
  moraleLevel(score){return MORALE_LEVEL_NAMES[String(clamp(score||0,-4,4))]||'—';},
  moraleEmoji(score){return MORALE_EMOJI[String(clamp(score||0,-4,4))]||'';},
  moraleEffectSummary(score){
    const s=String(clamp(score||0,-4,4));
    return ({'-4':'Rebellion: bandits 1/family, no growth, income to 0.','-3':'Defiance: bandits 1/2, lose 3d10/1000, income -50%.','-2':'Turbulence: bandits 1/5, lose 2d10/1000, income -20%.','-1':'Demoralized: lose 1d10/1000 families/month.','0':'Apathetic.','1':'Loyal: +1d10/1000 families.','2':'Dedicated: +2d10/1000.','3':'Steadfast: +3d10/1000, +1 vassal loyalty.','4':'Stalwart: +4d10/1000, +2 vassal loyalty.'})[s]||'';
  },
  // Morale-effect summary (original paraphrase, mechanical facts preserved; RR pp.349-351) for the "State of Your Domain" panel
  moraleStateText(score){return MORALE_STATE_TEXT[String(clamp(score||0,-4,4))]||'';},
  // Stronghold value required for current hex count (ACKS RAW: 15000gp per controlled 6-mile hex)
  strongholdRequired(d){return window.ACKS.strongholdRequired(d);},
  // Effective stronghold value across all components (Foundation #16). When
  // stronghold-by-buildings is on AND a component has structures, that component's value is
  // computed from its structures; else its manual buildValue is used. Total = sum across components.
  // Falls back to the legacy single-stronghold shape if components hasn't been migrated yet.
  strongholdValue(d){return window.ACKS.strongholdValue(this.currentCampaign, d);},
  // Returns one of: 'adequate', 'half', 'quarter', 'critical', 'none'
  strongholdState(d){
    const req=this.strongholdRequired(d);
    const sv=this.strongholdValue(d);
    if(req===0)return 'none';
    if(sv>=req)return 'adequate';
    if(sv>=req/2)return 'half';
    if(sv>=req/4)return 'quarter';
    return 'critical';
  },
  // Human-readable adequacy summary for the stronghold line (RR p.348). Referenced from the
  // domain Overview's stronghold card. Was missing — restored to fix the Alpine ReferenceError
  // that was disrupting reactivity (including toast rendering).
  strongholdAdequacy(d){
    if(!d) return '';
    const req = this.strongholdRequired(d);
    const sv  = this.strongholdValue(d);
    if(req === 0) return 'No hexes claimed yet — no stronghold value requirement.';
    const ratio = sv / req;
    const reqStr = req.toLocaleString() + 'gp required (15,000gp per controlled hex, RR p.348)';
    if(sv >= req) return 'Adequate — '+sv.toLocaleString()+'gp ≥ '+reqStr+'.';
    if(sv >= req/2) return 'Half-strength — '+sv.toLocaleString()+'gp covers ½ of '+reqStr+'. Morale check at −1.';
    if(sv >= req/4) return 'Quarter-strength — '+sv.toLocaleString()+'gp covers ¼ of '+reqStr+'. Morale check at −2.';
    return 'Critical undervalue — '+sv.toLocaleString()+'gp << '+reqStr+'. Populace feels exposed; morale check at −3.';
  },
  // Build SVG polyline points string from a numeric series. Returns "" when series has <2 finite points.
  // Maps the series to fit within (width x height) with a small inner margin. Defensive against
  // undefined/NaN values — old history entries that pre-date moraleAfter/populationAfter fields would
  // otherwise yield "NaN,NaN" coords and trigger an SVG parsing error in the console.
  sparklinePoints(series, width=160, height=36){
    if(!Array.isArray(series))return '';
    const clean = series.map(v => Number(v)).filter(v => Number.isFinite(v));
    if(clean.length < 2)return '';
    const xs=clean.length-1;
    const min=Math.min(...clean), max=Math.max(...clean);
    const span=(max-min)||1;
    const pad=2;
    return clean.map((v,i)=>{
      const x=pad+(i/xs)*(width-pad*2);
      const y=height-pad-((v-min)/span)*(height-pad*2);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
  },
  // Extract a series from history. metric: 'treasury' | 'morale' | 'population'
  // Defensive: history entries from older engine versions might be missing the after-fields;
  // coerce to a finite number with 0 fallback so the sparkline doesn't trip on NaN.
  historySeries(d,metric){
    if(!d||!Array.isArray(d.history))return [];
    const num=(v) => (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
    const initial=metric==='treasury'?num(d.history[0]?.snapshotBefore?.treasuryGp)
      :metric==='morale'?num(d.history[0]?.moraleBefore)
      :num(d.history[0]?.populationBefore);
    const after=d.history.map(h=>metric==='treasury'?num(h.snapshotAfter?.treasuryGp)
      :metric==='morale'?num(h.moraleAfter)
      :num(h.populationAfter));
    return [initial,...after];
  },
  sparklineRange(d,metric){
    const s=this.historySeries(d,metric);
    if(s.length<2)return '';
    return s[0].toLocaleString()+' → '+s[s.length-1].toLocaleString();
  },

  // Total hexes across all vassals (including this domain itself when asked from the realm apex)
  totalHexesInRealm(d){
    let total=(d.geography?.controlledHexes||0);
    this.vassalChainUnder(d.id).forEach(entry=>total+=(entry.domain.geography?.controlledHexes||0));
    return total;
  },
  // Push per-hex totals up to the aggregate fields (controlledHexes, peasantFamilies, weighted-avg landRevenuePerFamily)
  syncHexesToAggregate(d){
    const hexes=window.ACKS.hexesForDomain(this.currentCampaign, d.id);
    if(hexes.length===0)return;
    const totalFam=hexes.reduce((s,h)=>s+(h.families||0),0);
    const totalLand=hexes.reduce((s,h)=>s+(h.families||0)*(h.valuePerFamily||0),0);
    d.geography.controlledHexes=hexes.length;
    if(totalFam>0){
      d.demographics.peasantFamilies=totalFam;
      d.income.landRevenuePerFamily=Math.round((totalLand/totalFam)*100)/100;
    }
    this.showToast('Synced '+hexes.length+' hexes → '+totalFam.toLocaleString()+' families, avg '+(d.income.landRevenuePerFamily).toFixed(2)+'gp/family.');
  },
  // House rules.
  // Delegate to the engine's canonical accessor so the UI agrees with the engine on
  // EVERY stored shape. Templates ship some rules as a bare boolean (e.g.
  // "families-per-hex-tracking": true); the engine treats `true` and {enabled:true}
  // alike, but this method used to read only `.enabled`, so a bare-true rule rendered
  // as OFF — the per-hex columns never appeared and the toggle couldn't flip it.
  // (2026-06-01 — user-reported "families per hex is broken".)
  isHouseRuleEnabled(id){
    if(window.ACKS && window.ACKS.isHouseRuleEnabled) return window.ACKS.isHouseRuleEnabled(this.currentCampaign, id);
    const v = this.currentCampaign?.houseRules?.[id];
    return v === true || !!(v && v.enabled === true);
  },
  toggleHouseRule(id){
    if(!this.currentCampaign)return;
    if(!this.currentCampaign.houseRules||typeof this.currentCampaign.houseRules!=='object'||Array.isArray(this.currentCampaign.houseRules))this.currentCampaign.houseRules={};
    // Normalize ANY stored shape (undefined / bare boolean / object) to the canonical
    // {enabled:bool} before flipping. Without this, a bare-boolean rule from a template
    // can't be toggled — `(true).enabled = …` is a silent no-op on a primitive, so the
    // rule would stick on (or off) forever.
    const enabling = !this.isHouseRuleEnabled(id);
    this.currentCampaign.houseRules[id]={enabled:enabling};
    this.markDirty(); this.schedulePersist();
  },
  incomeFactor(morale){return window.ACKS.incomeFactor(morale);},
  baseMorale(d){return baseMoraleFromClassification(this.effectiveClassification(d),this.effectiveRuler(d));},
  // Required garrison cost = peasant rate × peasant families + 2gp × urban families (urban is flat per RR p.351)
  requiredGarrison(d){return window.ACKS.requiredGarrison(this.currentCampaign, d);},
  // Suggest classification from ACKS RR p.340 criteria. GM can still override (RR allows it; cataclysms etc. justify regression).
  // We don't know proximity to other settlements without map data, so we approximate from family count + morale + hexes.
  // Domain XP earned by the ruler this month: net income above GP threshold (ACKS RR p.423).
  // If the ruler has multiple income sources (mercantile, hijinks, etc.), GP threshold is shared across all — we only see domain here so this is a per-domain contribution.
  //
  // Errata §1.1 (RR r10 p.425): "Henchmen vassals subtract their expected monthly wage (p. 168)
  // from domain income while magistrates just treat their salary as domain income for XP
  // purposes." A henchman-ruled domain therefore has its XP-basis income reduced by the
  // henchman's monthlyWage — that wage already earns the henchman XP elsewhere (the patron
  // pays them); subtracting it from domain XP avoids double-counting. PA stays untouched
  // because the wage doesn't change the domain's structural scale.
  //
  // Per Joachim 2026-05-28: this is RAW, not house-ruled — applies to all henchman rulers.
  domainXpFromNet(d, net){return window.ACKS.domainXpFromNet(this.currentCampaign, d, net);},
  // Effective classification per ACKS RR p.340 — auto-derived, no manual override.
  // Change indirectly by changing families, morale, or hex count.
  // Bandits per ACKS RR p.350 — emerge from disgruntled domains at low morale.
  //   -4 (Rebellious): 1 bandit per family (one able-bodied man per family)
  //   -3 (Defiant): 1 per 2 families
  //   -2 (Turbulent): 1 per 5 families
  //   -1 and above: no bandits
  // Urban / market class helpers (ACKS RR p.350-351)
  // Settlements live per-hex (hex.settlement) as named entities. Legacy aggregate at demographics.urbanFamilies
  // is only used when no hex has a settlement yet.
  hexSettlements(d){return window.ACKS.hexSettlements(this.currentCampaign, d);},
  // Settlement Demographics SD-1 — the per-settlement Step-3 census roster read (Settlement_Demographics_Plan.md).
  demoSettlementId: null,   // the settlement whose demographic roster is expanded (scoped to selectedDomain)
  demoSettlement(){ const id=this.demoSettlementId; if(!id) return null; const e=(this.hexSettlements(this.selectedDomain)||[]).find(x=>x.settlement&&x.settlement.id===id); if(e) return e.settlement; return (this.currentCampaign?.settlements||[]).find(s=>s&&s.id===id)||null; },  /* campaign-wide fallback for the Roster ▸ Settlements sheet (UI overhaul 2026-06-22) */
  demographicRoster(){ const s=this.demoSettlement(); return s ? window.ACKS.settlementDemographics(this.currentCampaign, s) : null; },
  demoRosterRows(){ const d=this.demographicRoster(); if(!d) return []; return d.byLevel.filter((r,i)=>{ const e=d.expected.byLevel[i], real=d.realized.byLevel[i]; return e.all>=0.5 || real.all>0; }); },
  fmtExpected(v){ return window.ACKS.formatExpectedCount(v); },
  // SD-2 — the reconciliation workspace (residents homed here + assign/remove home; civic placement).
  demoAssignPick: '',
  demoResidents(){ const id=this.demoSettlementId; if(!id) return []; return (this.currentCampaign?.characters||[]).filter(c => c.homeSettlementId===id && c.lifecycleState!=='deceased'); },
  demoUnhomedCandidates(){ return (this.currentCampaign?.characters||[]).filter(c => !c.homeSettlementId && c.lifecycleState!=='deceased').sort((a,b)=>(a.name||'').localeCompare(b.name||'')); },
  demoBucketLabel(c){ return window.ACKS.coreBucketForCharacter(this.currentCampaign, c) || '—'; },
  demoAssignResident(){ const id=this.demoAssignPick; if(!id) return; const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); if(!c) return; this.commitStatEdit({entityType:'character', entityId:c.id, entity:c, fieldPath:'homeSettlementId', label:'Home settlement', oldValue:(c.homeSettlementId||null), newValue:this.demoSettlementId}); this.demoAssignPick=''; },
  demoRemoveResident(c){ if(!c) return; this.commitStatEdit({entityType:'character', entityId:c.id, entity:c, fieldPath:'homeSettlementId', label:'Home settlement', oldValue:(c.homeSettlementId||null), newValue:null}); },
  // SD-5a — the emergent reads (service legibility + the world-people query, plan §8).
  demoServices(){ const id=this.demoSettlementId; return id ? window.ACKS.settlementServices(this.currentCampaign, id) : null; },
  demoMostNotable(){ const d=this.selectedDomain; return (d&&d.id) ? window.ACKS.mostNotableResident(this.currentCampaign, {domainId:d.id}) : null; },
  demoFindBucket: '', demoFindMinLevel: 1, demoFindScope: 'settlement', demoFindWithin: 3,
  demoFindResults(){
    const C=this.currentCampaign; if(!C) return [];
    const q={ minLevel: Math.max(1, Number(this.demoFindMinLevel)||1) };
    if(this.demoFindBucket) q.bucket=this.demoFindBucket;
    if(this.demoFindScope==='settlement'){ q.settlementId=this.demoSettlementId; }
    else if(this.demoFindScope==='near'){ const s=this.demoSettlement(); if(s&&s.hexId){ q.nearHexId=s.hexId; q.withinHexes=Math.max(0, Number(this.demoFindWithin)||0); } else { const d=this.selectedDomain; q.domainId=d&&d.id; } }
    else { const d=this.selectedDomain; q.domainId=d&&d.id; }
    return window.ACKS.findResidents(C, q);
  },
  demoOpenResident(id){ const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); if(c) this.openCharacterEditor(c); },
  // SD-2b — opt-in auto-generation: mint the notable open slots from the NPC generator (gated on
  // living-census + demographics-auto-generate + the generator present). The roster READ is always-on;
  // only the MINT is gated. Each minted NPC is a normal generated Character, reconciled by the SAME accessors.
  demoAutoGenOn(){ return this.isHouseRuleEnabled('living-census') && this.isHouseRuleEnabled('demographics-auto-generate') && typeof window.ACKS.generateNPC==='function'; },
  demoFillMinLevel: 5,
  demoOpenNotableCount(){ const s=this.demoSettlement(); if(!s) return 0; return window.ACKS.demographicOpenNotableSlots(this.currentCampaign, s, {minLevel: Math.max(1, Number(this.demoFillMinLevel)||1)}).reduce((n,x)=>n+x.open, 0); },
  _afterAutoFill(r, noun){ if(!r || !r.ok){ this.showToast('Auto-fill unavailable'+(r&&r.reason?(' ('+r.reason+')'):'')); return false; } const n=(r.created&&r.created.length)||0; this.markDirty(); this.schedulePersist(); this.showToast(n>0 ? ('✨ Generated '+n+' '+noun+(n===1?'':'s')) : 'No open notable slots to fill — lower the L≥ floor'); return true; },
  demoAutoFill(){ const s=this.demoSettlement(); if(!s) return; this._afterAutoFill(window.ACKS.autoFillSettlementRoster(this.currentCampaign, s, {minLevel: Math.max(1, Number(this.demoFillMinLevel)||5)}), 'resident'); },
  demoFillSlot(bucket, level){ const s=this.demoSettlement(); if(!s) return; const r=window.ACKS.fillDemographicSlot(this.currentCampaign, s, bucket, level); this._afterAutoFill((r && r.ok) ? {ok:true, created:[r.character]} : r, bucket+' L'+level); },
  realmFillOffice(officeKey){ const d=this.selectedDomain; if(!d) return; const r=window.ACKS.fillRealmOffice(this.currentCampaign, d, officeKey); this._afterAutoFill((r && r.ok) ? {ok:true, created:[r.character]} : r, 'court official'); },
  realmAutoFill(){ const d=this.selectedDomain; if(!d) return; this._afterAutoFill(window.ACKS.autoFillRealmEntourage(this.currentCampaign, d, {}), 'court official'); },
  ruralFillMinLevel: 2,
  ruralAutoFill(){ const d=this.selectedDomain; if(!d) return; this._afterAutoFill(window.ACKS.autoFillDomainCountryside(this.currentCampaign, d, {minLevel: Math.max(1, Number(this.ruralFillMinLevel)||2)}), 'countryside resident'); },
  // SD-3 — the realm command structure (T1; gated on the living-census house rule). Domain-scoped:
  // the realm's expected leveled offices reconciled against its actual holders (ruler + magistrates +
  // homeDomainId entourage + vassal lords). The accessor is pure; the UI shows it only when the rule is on.
  realmCensusOn(){ return this.isHouseRuleEnabled('living-census'); },
  realmCensus(){ const d=this.selectedDomain; return (d&&d.id) ? window.ACKS.realmCommandStructure(this.currentCampaign, d.id) : null; },
  realmAssignPick: '',
  realmEntourageCandidates(){ const d=this.selectedDomain; if(!d||!d.id) return []; return (this.currentCampaign?.characters||[]).filter(c => c.homeDomainId!==d.id && c.lifecycleState!=='deceased').sort((a,b)=>(b.level||1)-(a.level||1)||(a.name||'').localeCompare(b.name||'')); },
  realmAssignEntourage(){ const id=this.realmAssignPick; const d=this.selectedDomain; if(!id||!d||!d.id) return; const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); if(!c) return; this.commitStatEdit({entityType:'character', entityId:c.id, entity:c, fieldPath:'homeDomainId', label:'Home domain', oldValue:(c.homeDomainId||null), newValue:d.id}); this.realmAssignPick=''; },
  realmRemoveEntourage(e){ if(!e||!e.id) return; const c=(this.currentCampaign?.characters||[]).find(x=>x.id===e.id); if(!c) return; this.commitStatEdit({entityType:'character', entityId:c.id, entity:c, fieldPath:'homeDomainId', label:'Home domain', oldValue:(c.homeDomainId||null), newValue:null}); },
  // SD-7b — the placement taxonomy (the 7-category accounting + the RAW realm templates; gated on the
  // living-census house rule, the deep tier per OQ-8). placementCensus scopes to the selected domain
  // (its ruler + homed + court + lieged retainers); placementTemplateForDomain resolves its worked roster.
  placementCensusOn(){ return this.isHouseRuleEnabled('living-census'); },
  placementCensus(){ const d=this.selectedDomain; return (d&&d.id) ? window.ACKS.placementCensus(this.currentCampaign, {domainId:d.id}) : null; },
  placementCategoryLabel(cat){ return window.ACKS.placementCategoryLabel(cat); },
  realmTemplate(){ const d=this.selectedDomain; return (d&&d.id) ? window.ACKS.placementTemplateForDomain(this.currentCampaign, d) : null; },
  totalUrbanFamiliesFromHexes(d){return window.ACKS.totalUrbanFamiliesFromHexes(this.currentCampaign, d);},
  totalUrbanInvestmentFromHexes(d){return window.ACKS.totalUrbanInvestmentFromHexes(this.currentCampaign, d);},
  // Effective urban family count for calculations. Per-hex settlements take precedence; falls back to legacy aggregate.
  effectiveUrbanFamilies(d){return window.ACKS.effectiveUrbanFamilies(this.currentCampaign, d);},
  // Per-settlement market class
  settlementMarketClass(s){return window.ACKS.settlementMarketClass(s);},
  settlementTradeRate(s){return window.ACKS.settlementTradeRate(s);},
  settlementCapacity(s){return window.ACKS.settlementCapacity(s);},
  // Urban investment (Investment tab, 2026-06-23) — RAW-immediate (RR p.351/p.353; see
  // ACKS.applyUrbanInvestment). The advisory monthly-revenue cap = this month's morale-adjusted gross
  // income ("a ruler cannot spend more than his domain's revenue on urban investment each month").
  urbanInvestmentRevenueCap(d){ if(!d) return 0; return window.ACKS.bankersRound((this.monthlyGrossIncome(d)||0) * this.incomeFactor(d.demographics?.morale||0)); },
  // Apply immediate urban investment for every settlement with a positive amount in the panel's
  // transient `amounts` {settlementId: gp} map. Rolls 1d10/1,000gp, raises totalInvestment + cap,
  // debits treasury — per settlement, immediately. Clears the inputs + toasts the result.
  investUrbanNow(d, amounts){
    const c = this.currentCampaign; if(!c || !d) return;
    const A = window.ACKS;
    const results = [];
    for(const { settlement } of (this.hexSettlements(d) || [])){
      const amt = Math.floor((amounts && amounts[settlement.id]) || 0);
      if(amt <= 0) continue;
      const r = A.applyUrbanInvestment(c, d, settlement, amt);
      if(r) results.push(r);
    }
    if(results.length === 0){ this.showToast('Enter an investment amount first (1,000gp grants 1d10 families).', 4000); return; }
    if(amounts) for(const k of Object.keys(amounts)) amounts[k] = 0;
    this.markDirty(); this.schedulePersist();
    const totalGp = results.reduce((s,r) => s + r.spent, 0);
    const totalFam = results.reduce((s,r) => s + r.gained, 0);
    const detail = results.map(r => r.settlementName + ' +' + r.gained + (r.capped ? ' (at cap)' : '')).join('; ');
    this.showToast('Invested ' + totalGp.toLocaleString() + 'gp · +' + totalFam.toLocaleString() + ' urban families — ' + detail, 6000);
  },
  // Villages/Towns/Cities benchmarks (RR p.351)
  settlementType(s){return lookupSettlementBenchmark(s.families||0).type;},
  settlementIncomeBenchmark(s){
    const b=lookupSettlementBenchmark(s.families||0);
    if(b.incomeMin===0&&b.incomeMax===0)return 'no benchmark income';
    if(b.incomeMax===Infinity)return b.incomeMin.toLocaleString()+'gp+';
    return b.incomeMin.toLocaleString()+'-'+b.incomeMax.toLocaleString()+'gp';
  },
  // Compute the settlement's actual net (revenue - expenses) using its own families
  // For sanity-checking against benchmarks. Doesn't apply morale factor (benchmark is pre-morale).
  settlementNetBenchmark(s){
    const f=s.families||0;
    if(f===0)return 0;
    const cls=lookupMarketClass(f);
    const revenue=(cls.tradePerFamily+4+2)*f;  // trade + service + tax
    const expenses=(2+1+1+1)*f;                // garrison + liturgy + tithe + upkeep
    return revenue-expenses;
  },
  // Domain-level market class summary (largest settlement's class, or legacy aggregate)
  marketClassRow(d){return window.ACKS.marketClassRow(this.currentCampaign, d);},
  marketClass(d){return window.ACKS.marketClass(this.currentCampaign, d);},
  urbanCapacity(d){return window.ACKS.urbanCapacity(this.currentCampaign, d);},

  banditCount(d){return window.ACKS.banditCount(d);},
  // #476 E10 — the materialized morale-banditry bands of a domain (RR pp.350–351).
  banditryBands(d){
    if(!d || !this.currentCampaign || typeof window.ACKS.banditryBandsForDomain !== 'function') return [];
    return window.ACKS.banditryBandsForDomain(this.currentCampaign, d.id);
  },
  // #476 E10 — the militia-drawn portion of the banditry (RR p.433): bands whose template
  // carries a troopTypeKey fight as trained troops, not peasant rabble. null = none.
  banditryMilitiaInfo(d){
    const bands = this.banditryBands(d).filter(g => g && g.groupTemplate && g.groupTemplate.troopTypeKey);
    if(!bands.length) return null;
    const raiders = bands.reduce((s, g) => s + Math.max(0, (g.count || 0) - (g.casualties || 0)), 0);
    const t = bands[0].groupTemplate;
    return { bands: bands.length, raiders, label: t.troopLabel || t.troopTypeKey };
  },
  // #476 E10 — the NPC bandit-leader challenger (RR p.351): the object, the NPC's name, the message.
  banditChallenger(d){ return (d && d.banditryChallenger) || null; },
  banditChallengerName(d){
    const c = d && d.banditryChallenger; if(!c) return '';
    const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === c.characterId);
    return (ch && ch.name) || 'A bandit lord';
  },
  banditChallengerText(d){
    const c = d && d.banditryChallenger; if(!c) return '';
    const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === c.characterId);
    const lvl = ch ? (' (L' + (ch.level || 1) + ')') : '';
    return c.pillaging
      ? lvl + ' is looting the domain — −4 to its morale rolls until the ruler meets him in battle (RR p.351).'
      : lvl + ' has risen from the rebels to challenge the ruler — meet him in battle (the bands above, via Military ▸ ⚔ Active Threats) or raise morale above −2 to disperse him (RR p.351).';
  },
  // Phase 3 Military W2 — the Vagaries of Incursion domain-panel reads.
  incursionBands(d){
    if(!d || !this.currentCampaign || typeof window.ACKS.incursionBandsForDomain !== 'function') return [];
    return window.ACKS.incursionBandsForDomain(this.currentCampaign, d.id);
  },
  // Military W8 — the independent brigand armies a Vagary of Recruitment raised against this domain
  // (JJ p.111). They are real Armies (in 🎖 Armies); the GM meets one via the Battle Wizard.
  brigandArmies(d){
    if(!d || !this.currentCampaign || typeof window.ACKS.brigandArmiesForDomain !== 'function') return [];
    return window.ACKS.brigandArmiesForDomain(this.currentCampaign, d.id)
      .filter(a => (window.ACKS.armyTroopCount ? window.ACKS.armyTroopCount(this.currentCampaign, a) : 1) > 0);
  },
  incursionChanceLine(d){
    if(!d || !this.currentCampaign || typeof window.ACKS.domainDailyEncounterChance !== 'function') return '';
    const c = window.ACKS.domainDailyEncounterChance(this.currentCampaign, d);
    let line = c.pct + '% per day — effective territory ' + c.effectiveHexes + ' hexes';
    if(c.configuration !== 'secure'){
      line += ' (' + c.actualHexes + ' held; dangerous borders: ' + c.configuration
        + (c.configurationSource === 'override' ? ', GM-set' : '') + ', JJ p.102)';
    }
    line += ' · ' + c.effective;
    if(c.demoted){
      const why = [c.insufficientGarrison ? 'garrison under strength' : null, c.insufficientStronghold ? 'stronghold under value' : null].filter(Boolean).join(' + ');
      line += ' (⚠ one class worse — ' + why + ', JJ p.102)';
    }
    return line;
  },

  // RR p.340 — classification is a GM judgment. Stored domain.classification wins; the
  // families/morale/hexes heuristic is only a suggestion. Both lifted to the engine
  // (ACKS.effectiveDomainClassification / suggestDomainClassification) so display + the
  // garrison-rate/base-morale math agree, and the GM can override (editable on Overview).
  effectiveClassification(d){return window.ACKS.effectiveDomainClassification(d);},
  suggestedClassification(d){return window.ACKS.suggestDomainClassification(d);},

  // Per RAW (RR pp.340, 349) hex classification is a domain property, not a per-hex one.
  // Default mode: every hex inherits the domain's class. Families-per-hex-tracking ON:
  // derive from hex.families using thresholds scaled from the domain rule.
  // Stored hex.classification is ignored — kept in schema for forward-compat.
  effectiveHexClassification(d, h){
    if(!d) return 'Borderlands';
    if(!this.isHouseRuleEnabled || !this.isHouseRuleEnabled('families-per-hex-tracking')){
      return this.effectiveClassification(d);
    }
    const fam = h?.families || 0;
    if(fam >= 80) return 'Civilized';
    if(fam >= 20) return 'Borderlands';
    return 'Outlands';
  },
  garrisonHeadcount(d){return window.ACKS.garrisonHeadcount(this.currentCampaign, d);},
  garrisonCost(d){return window.ACKS.garrisonCost(this.currentCampaign, d);},
  garrisonBR(d){return window.ACKS.garrisonBR(this.currentCampaign, d);},
  // T6 single-home — a character's mercenary-company units, from the canonical campaign.units[].
  characterMercUnits(c){return (window.ACKS && window.ACKS.characterMercenaryUnits) ? window.ACKS.characterMercenaryUnits(this.currentCampaign, c) : [];},

  // Effective tribute owed by a vassal to its liege, this month. Returns 0 if no liege OR
  // tributePaid is false. When tributeAuto is on (the default), it's the RAW precise tribute by the
  // families in the vassal's WHOLE realm — its own domain plus every sub-vassal realm (RR p.346:
  // 18gp × realm-families^0.6, rounded to 5gp). RAW tribute is a fixed obligation by realm size, NOT
  // a percentage of income. Otherwise (auto off), the GM's manual tributeToLiege ("set as desired"
  // is itself RAW). The %-of-gross-income auto mode + tributePct field were removed 2026-06-05.
  tributeOwed(d){return window.ACKS.tributeOwed(this.currentCampaign, d);},

  // Favors & Duties (F&D-2) UI → domain-app-favors-duties.js (T5 chip 7, 2026-06-23)

  // Effective per-hex land value INCLUDING agricultural improvements (Phase 2a.5).
  // Hard cap at 9gp/family per RR p.341.
  effectiveHexValue(h){return window.ACKS.effectiveHexValue(h);},
  // Phase 3 hook (RR p.341): "During a siege, land improvements can be destroyed by bombardment as
  // wooden structures — multiply shp dealt by 8 to calculate loss of gp value."
  // Reserved no-op. Phase 3 (Domains at War) will call this from siege/bombardment resolution.
  damageHexImprovements(hex, gpDamage){
    if(!hex||!gpDamage||gpDamage<=0)return 0;
    const before = hex.landImprovementBonus || 0;
    if(before <= 0) return 0;
    // Each +1 improvement represents 25,000gp of work. Damage erodes accumulated improvement value.
    // Convert gpDamage into +1 levels lost (rounded down — partial damage doesn't degrade until threshold).
    const levelsLost = Math.min(before, Math.floor(gpDamage / 25000));
    hex.landImprovementBonus = before - levelsLost;
    return levelsLost;
  },
  // Phase 3 hook (RR p.341): "If a domain has land improvements, their value is reduced by 1gp per 1gp
  // plundered from the domain during pillaging."
  // Reserved no-op. Phase 3 will call this from looting/pillaging resolution.
  plunderHexImprovements(hex, gpLooted){
    if(!hex||!gpLooted||gpLooted<=0)return 0;
    const before = hex.landImprovementBonus || 0;
    if(before <= 0) return 0;
    // 1gp plundered = 1gp improvement value lost. Same 25,000gp/level conversion.
    const levelsLost = Math.min(before, Math.floor(gpLooted / 25000));
    hex.landImprovementBonus = before - levelsLost;
    return levelsLost;
  },
  // Total in-progress agricultural improvement projects across a domain (for UI display).
  domainImprovementProjectsInProgress(d){
    const hexes=window.ACKS.hexesForDomain(this.currentCampaign, d.id);
    return hexes.reduce((s,h)=>s+(Array.isArray(h.landImprovementProjects)?h.landImprovementProjects.length:0),0);
  },
  // Total completed +bonus across all hexes (for UI display).
  domainTotalLandImprovementBonus(d){return window.ACKS.domainTotalLandImprovementBonus(this.currentCampaign, d);},

  incomeBreakdown(d){return window.ACKS.incomeBreakdown(this.currentCampaign, d);},
  monthlyGrossIncome(d){return window.ACKS.monthlyGrossIncome(this.currentCampaign, d);},
  // RAW canonical "Domain Income" per RR (p.423 "Experience from Domains" definition,
  // confirmed 2026-05-28 by Joachim against latest RR text): "Domain income is the difference
  // between domain revenue and domain expenses." That is — revenue (land + service + tax +
  // trade + tariffs + vassal tribute + other) × morale-factor − expenses (garrison + liturgy
  // + maintenance + tithe + tribute paid out + upkeep + personal). Morale IS a real
  // adjustment per RR p.350 income table, so it propagates. Used as the single input to BOTH
  // PA bracket lookup AND XP threshold comparison — same number, same source-of-truth.
  // The Marcus p.350 example understates by ignoring expenses; the p.423 definition is the
  // authoritative one. Earlier interpretation of this method returned gross revenue;
  // that was overturned 2026-05-28.
  domainIncome(d){return window.ACKS.domainIncome(this.currentCampaign, d);},

  // ─── Magistrate helpers (Officers tab) ──────────────────────────────────
  // RAW: each magistrate keeps 12.5% of the expense they oversee as monthly
  // salary. The expense itself is unchanged from the ruler's POV — salary is
  // "abstractly paid out of his domain expenses" (RR p.344). For the
  // magistrate, the salary counts as domain income for XP (p.425).
  // Mapping role → base expense category:
  //   captainOfGuard → garrison (current garrison cost)
  //   chaplain       → tithe (1gp × (peasant+urban) if paid, else 0)
  //   munerator      → liturgy (liturgyPerFamily × (peasant+urban))
  //   steward        → maintenance (stronghold 1gp/peasant + urban 1gp/urban)
  magistrateBaseExpenseForRole(d, roleKey){return window.ACKS.magistrateBaseExpenseForRole(this.currentCampaign, d, roleKey);},
  magistrateSalaryForRole(d, roleKey){return window.ACKS.magistrateSalaryForRole(this.currentCampaign, d, roleKey);},
  // Sum every magistrate salary this character earns across all domains in the
  // campaign. Used by character XP threshold logic (RR p.425: magistrate
  // salary counts as domain income for the magistrate).
  magistrateSalariesByCharacter(charId){
    if(!charId) return 0;
    let total = 0;
    (this.domains||[]).forEach(d => {
      const mg = d.magistrates || {};
      ['captainOfGuard','chaplain','munerator','steward'].forEach(roleKey => {
        const slot = mg[roleKey];
        if(slot && slot.characterId === charId){
          total += this.magistrateSalaryForRole(d, roleKey);
        }
      });
    });
    return total;
  },
  // Resolve a character's current location label. Two layers:
  //   (1) BASE LOCATION — venture-aware (in-transit / selling override hex),
  //       else the hex coord + domain name, else "—".
  //   (2) ACTIVITY TAGS — suffixes describing what they're DOING right now.
  //       Current tags: "(administering)" when administersThisMonth is set
  //       on their ruled domain or any magistrate slot they hold.
  //       Convention: append " (activity)" — multiple activities join with " · ".
  //       Extend here as new activities land — e.g. "(researching)" for spell
  //       research, "(recovering)" for permanent wound recovery, "(in court)"
  //       for civil proceedings. Keep tags short + lowercase + parenthesised.
  // Resolve a character's current location label — purely geographic.
  // Format: "(q,r) · Settlement · Domain", or "(unknown hex)" if currentHexId
  // doesn't resolve, or "—" when no currentHexId is set.
  //
  // Note: a character on an active venture shows their origin hex here (their
  // currentHexId hasn't moved). The "on venture to X" engagement is carried by
  // characterActivities. Once per-day travel hex tracking lands in Phase 3
  // Military §2, Location will show their actual hex on the travel path.
  characterLocationLabel(ch){
    if(!ch) return '—';
    const hexId = ch.currentHexId;
    if(!hexId) return '—';
    // Single-home (T6): resolve the hex from canonical campaign.hexes; its domainId names the
    // owning domain → "<hex name> · <domain>" (canonical hex name, Architecture §11.3), else wilderness.
    const h = window.ACKS.findHex(this.currentCampaign, hexId);
    if(!h) return '(unknown hex)';
    const d = h.domainId ? (this.domains||[]).find(x => x.id === h.domainId) : null;
    return d ? (hexLabelFor(h) + ' · ' + d.name) : hexLabelFor(h);
  },

  // Total XP this henchman earns this month from all roles combined. Per
  // Errata §1.1 (RR p.425), henchman vassals subtract their wage from domain
  // income before comparing to threshold (the existing domainXpFromNet
  // helper already does that). Magistrate salary counts as domain income for
  // XP (RR p.425) — applies the threshold per role to match the existing
  // per-domain pattern used elsewhere in the tool.
  henchmanXpThisMonth(ch){
    if(!ch) return 0;
    const threshold = (typeof computeGpThreshold === 'function')
      ? computeGpThreshold(ch.level||1)
      : (window.ACKS && typeof window.ACKS.computeGpThreshold === 'function' ? window.ACKS.computeGpThreshold(ch.level||1) : 0);
    let xp = 0;
    // Vassal-rulership XP (errata §1.1 already in domainXpFromNet)
    (this.domains||[]).forEach(d => {
      if(d.rulerCharacterId === ch.id){
        const dxp = this.domainXpFromNet(d, this.monthlyNet(d));
        if(dxp && dxp > 0) xp += dxp;
      }
    });
    // Magistrate salary XP (RAW p.425)
    const mr = ['captainOfGuard','chaplain','munerator','steward'];
    (this.domains||[]).forEach(d => {
      mr.forEach(rk => {
        if(d.magistrates?.[rk]?.characterId === ch.id){
          const salary = this.magistrateSalaryForRole(d, rk);
          xp += Math.max(0, salary - threshold);
        }
      });
    });
    return xp;
  },

  // For a henchman, collect every position they hold in the realm: ruling a
  // vassal domain (in selectedDomain's chain) AND/OR holding magistrate slots
  // in any domain. Each entry has { label, income, domainId, kind }. Used by
  // the Henchmen box's Role + Domain Income columns.
  henchmanRoles(ch, parentDomain){
    if(!ch || !parentDomain) return [];
    const roles = [];
    // Vassal-ruler entries — walk the chain under parentDomain.
    (this.vassalChainUnder(parentDomain.id)||[]).forEach(e => {
      if(e.domain.rulerCharacterId === ch.id){
        roles.push({
          label: 'Vassal Ruler of ' + e.domain.name,
          income: this.domainIncome(e.domain),
          domainId: e.domain.id,
          kind: 'vassal',
        });
      }
    });
    // Magistrate entries — walk every domain in the campaign (not just the
    // chain under parentDomain; a henchman might be a magistrate in an
    // unrelated domain, e.g. seconded to a sibling realm).
    const mr = (typeof window !== 'undefined' && window.ACKS?.MAGISTRATE_ROLES) || {};
    (this.domains||[]).forEach(d => {
      ['captainOfGuard','chaplain','munerator','steward'].forEach(rk => {
        if(d.magistrates?.[rk]?.characterId === ch.id){
          roles.push({
            label: (mr[rk]?.label || rk) + ' of ' + d.name,
            income: this.magistrateSalaryForRole(d, rk),
            domainId: d.id,
            kind: 'magistrate',
          });
        }
      });
    });
    return roles;
  },
  // List of all parties administering the domain this month — ruler if
  // administersThisMonth, plus any magistrate slot whose administersThisMonth
  // is true and has a real characterId. Used by morale-mod calc and the UI.
  // Returns array of { who: 'Aelric Bran', via: 'ruler' | 'captainOfGuard' | ... }.
  magistrateAdminCandidates(d){return window.ACKS.magistrateAdminCandidates(this.currentCampaign, d);},

  expenseBreakdown(d){return window.ACKS.expenseBreakdown(this.currentCampaign, d);},
  monthlyExpenses(d){return window.ACKS.monthlyExpenses(this.currentCampaign, d);},
  monthlyNet(d){return window.ACKS.monthlyNet(this.currentCampaign, d);},

  moraleModifiersFor(d){return window.ACKS.moraleModifiersFor(this.currentCampaign, d);},

  incomeSum(p){return window.ACKS.incomeSum(p);},
  expenseSum(p){return window.ACKS.expenseSum(p);},
  moraleModSum(p){return window.ACKS.moraleModSum(p);},
  urbanInvestmentTotal(p){return (p.urbanInvestments||[]).reduce((s,inv)=>s+(inv.amount||0),0);},
  // Cap urban investment to the proposed gross-adjusted income for the month (ACKS RR p.351 — "cannot spend more than domain revenue")
  urbanInvestmentCap(p){return Math.round(this.incomeSum(p)*p.incomeFactor);},
  // Phase 2a.5 — sum of agricultural orders this turn (25,000gp each ticked)
  // Foundation #17 — orders carry a gpAmount (any value), not a boolean. Sum all amounts.
  agriculturalOrderTotal(p){return (p.agriculturalOrders||[]).reduce((s,o)=>s+(Number(o.gpAmount)||0),0);},
  agriculturalOrdersChecked(p){return (p.agriculturalOrders||[]).filter(o=>(Number(o.gpAmount)||0) > 0);},
  proposedMoraleChange(p){
    const adj=(p.moraleRoll||0)+this.moraleModSum(p);
    const base=baseMoraleFromClassification(p.classification,p.ruler);
    return moraleChangeFromRoll(adj,p.moraleBefore,base);
  },
  proposedNewMorale(p){return clamp(p.moraleBefore+this.proposedMoraleChange(p),-4,4);},

  // Turn Cycle v2 — humanize an event's target (which entity it affects) for the modal.
  summarizeEventTarget(ev){return window.ACKS.summarizeEventTarget(this.currentCampaign, ev);},

  // Humanize the event payload for at-a-glance display. Each kind picks its most salient fields.
  summarizeEventPayload(ev){return window.ACKS.summarizeEventPayload(this.currentCampaign, ev);},

  // Foundation #15 — orchestration lifted into ACKS.proposeMonthlyTurn.
  // This Alpine method is now a thin shell that supplies UI-bound helpers and surfaces UI state.
  // The engine builds the proposal shape; we copy the result onto this.* for Alpine reactivity.
  // ----- Calendar day-tick controls (Phase 2.95 §10/§11) -----
  // (dayModeEngaged retired 2026-06-13 — the world clock is always visible now; its two
  //  buttons grey via advanceLocked instead of the whole widget hiding.)
  dayClockLabel(){
    try { return window.ACKS.currentDateString(this.currentCampaign) || ''; } catch(e){ return ''; }
  },
  // ── 📋 Review tab + advance gating (2026-06-13) ─────────────────────────────────────────
  goToReview(sub){ this.currentView = 'review'; if(sub) this.reviewSubView = sub; },
  advanceBlockers(){ try { return window.ACKS.dailyAdvanceBlockers(this.currentCampaign) || []; } catch(e){ return []; } },
  // Both advance buttons grey while: a staged day / staged turn awaits its commit, or a
  // clock-holding situation (active encounter, battle in motion) needs the GM. Month-grained
  // pending events deliberately do NOT lock the clock (they're decided at the month commit).
  advanceLocked(){
    if(!this.currentCampaign) return true;
    // The monthly turn now stages across the whole month (auto-staged when you open the 🏰 Monthly
    // Turn tab), so it no longer locks the day clock — only a staged DAY-tick or a clock-holding
    // situation (active encounter / battle) does. The month still can't roll over without committing
    // the turn: the day-30 tick re-stages the turn instead of advancing.
    return !!this.dayTickProposal || this.advanceBlockers().length > 0;
  },
  advanceLockReason(){
    if(!this.currentCampaign) return '';
    if(this.dayTickProposal) return 'A staged day awaits review — commit or cancel it in 📜 Events ▸ Daily Events.';
    const b = this.advanceBlockers();
    if(!b.length) return '';
    const enc = b.filter(x => x.kind === 'encounter').length;
    const btl = b.filter(x => x.kind === 'battle').length;
    const bits = [];
    if(enc) bits.push(enc + ' encounter' + (enc === 1 ? '' : 's'));
    if(btl) bits.push(btl + ' battle' + (btl === 1 ? '' : 's'));
    return 'The clock is held — ' + bits.join(' + ') + ' need' + ((enc + btl) === 1 ? 's' : '') + ' resolution in 📋 Review.';
  },
  // "Next month ▶": run the rest of the month through the normal day review, then stage the
  // monthly turn (the commit chains via _nextMonthIntent in commitDayTick). Already at day
  // 30 → straight to the turn proposal.
  advanceToNextMonth(){
    if(!this.currentCampaign || this.advanceLocked() || this.domains.length === 0) return;
    const dim = this.currentCampaign.currentDayInMonth || 1;
    if(dim >= 30){ this.proposeMonthlyTurn(); return; }
    this._nextMonthIntent = true;
    this._proposeDayTick(30 - dim);
    this.goToReview('pending-events');
  },
  // The Pending Events calendar cursors + table reads (engine: calendarDayShift /
  // calendarShiftMonths / eventsOnCalendarDay / monthlyEventsForReview).
  reviewDayInfo(){ try { return window.ACKS.calendarDayShift(this.currentCampaign, this.reviewDayOffset); } catch(e){ return { label: '—', year: 1, month: 1, day: 1, turn: 1 }; } },
  reviewMonthInfo(){ try { return window.ACKS.calendarShiftMonths(this.currentCampaign, this.reviewMonthOffset); } catch(e){ return { label: '—', year: 1, month: 1, turn: 1 }; } },
  reviewDailyRows(){
    try {
      const rows = window.ACKS.eventsOnCalendarDay(this.currentCampaign, this.reviewDayInfo()) || [];
      return this.reviewShowRoutine ? rows : rows.filter(r => !r.campaignLogHidden);
    } catch(e){ return []; }
  },
  reviewMonthlyRows(){
    try { return window.ACKS.monthlyEventsForReview(this.currentCampaign, this.reviewMonthInfo()) || []; } catch(e){ return []; }
  },
  reviewRowPayloadSummary(r){
    try { return (r && r.event && window.ACKS.summarizeEventPayload(this.currentCampaign, r.event)) || ''; } catch(e){ return ''; }
  },
  // Accept/reject straight from the queue tables — the same manual-resolve path the Event
  // Log offers (resolvePendingEvent); anything left pending is decided at the month commit.
  reviewResolvePending(r, decision){ if(r && r.event) this.resolvePendingEvent(r.event, decision); },
  // loyalty-check rows resolve via the Roll Loyalty modal (the Event Log convention) — the
  // modal's Apply updates the pending event in place.
  reviewRollLoyalty(r){
    const ev = r && r.event; if(!ev) return;
    const ch = (this.currentCampaign?.characters || []).find(c => c.id === ev.payload?.characterId);
    if(!ch){ this.showToast('Character not found: ' + (ev.payload?.characterId || '?')); return; }
    this.openLoyaltyRollModal(ch, { reason: ev.payload?.reason || 'other', reasonNote: ev.payload?.reasonNote || '', modifier: ev.payload?.modifier || 0, pendingEventId: ev.id });
  },
  _proposeDayTick(days){
    this.dayTickError = null;
    // proposeDayTick clones the campaign internally; domains live on it (single home), so the
    // day-tick consumers (construction) find the domain treasuries directly — no attach needed.
    try {
      // Materialize Projects for any funded-but-not-yet-projected hex (the panel writes the budget
      // field directly) so the tick finds + advances them; also clears capped budgets. Idempotent.
      window.ACKS.migrateAgriculturalToProjects(this.currentCampaign);
      this.dayTickProposal = window.ACKS.proposeDayTick(this.currentCampaign, days, {});
      // Pre-attach each record's notable events as a STABLE array on the record. Calling a helper
      // inside the review surface's nested x-for mis-renders under Alpine (only one record's
      // notables show); iterating r._notables is reliable.
      if(this.dayTickProposal){
        this.dayTickProposal.daysRequested = days;  // for the "paused early" check (see dayTickPausedEarly)
        (this.dayTickProposal.pendingRecords||[]).forEach(r => {
          if(!r) return;
          r._notables = this.dayTickRecordNotables(r);
          if(r.kind === 'survival'){ r.label = this._dayTickSurvivalLabel(r); r._survivalRows = this.dayTickSurvivalRows(r); }
        });
      }
    }
    catch(e){ console.error('proposeDayTick error', e); this.dayTickError = String((e && e.message) || e); }
  },
  // Re-run a PENDING day-tick proposal after the latest committed day changed under it (a forage / nav
  // reroll, or a supply-toggle re-resolve). The proposal is a snapshot taken from the prior state, so
  // without this it goes stale — the review wouldn't reflect a just-rerolled dehydration (Joachim
  // 2026-06-05: "not sure the day review is refreshing"). No-op when no proposal is open.
  _refreshPendingDayTick(){ if(this.dayTickProposal) this._proposeDayTick(this.dayTickProposal.daysRequested || 1); },
  // "+1 day": stage the next day for review (the Review tab shows it; commit applies it).
  // At day 30 the forward click IS the month rollover → stage the monthly turn instead.
  // (tickWeek / tickToMonthEnd retired 2026-06-13 — "Next month ▶" covers the multi-day path.)
  tickDay(){
    if(this.advanceLocked()) return;
    this._nextMonthIntent = false;
    if(this._dayTickAtMonthEnd()) return;
    this._proposeDayTick(1);
    this.goToReview('pending-events');
  },
  // Day 30 is the last day of the month — advancing a day rolls into the NEXT month, which is the
  // monthly turn. So at month end a forward day-tick stages the monthly turn (proposeMonthlyTurn —
  // a propose-review-commit the GM confirms in Review ▸ Domain Review; commitTurn resets the day
  // clock to 1 + advances the calendar, so day/calendar stay synced) instead of clamping at 30 as
  // a silent no-op. Returns true if it handled the click. (Joachim 2026-06-05: "the +1 day
  // committed at month should trigger the advance month mechanic.")
  _dayTickAtMonthEnd(){
    const dim = (this.currentCampaign && this.currentCampaign.currentDayInMonth) || 1;
    if(dim >= 30){ this.proposeMonthlyTurn(); return true; }   // 30 = MONTH_LEN (proposeDayTick)
    return false;
  },
  dayTickRecordGroups(){
    const p = this.dayTickProposal; const map = {};
    if(p){ (p.pendingRecords || []).forEach(r => { (map[r.consumer] = map[r.consumer] || []).push(r); }); }
    return Object.keys(map).map(k => ({ consumer: k, records: map[k] }));
  },
  // True only when a pause genuinely cut a MULTI-day advance short (asked for N days, stopped at
  // fewer). A single-day tick always opens the review surface, so it isn't meaningfully "paused".
  dayTickPausedEarly(){
    const p = this.dayTickProposal;
    return !!(p && p.paused && (p.daysAdvanced||0) < (p.daysRequested||1));
  },
  // Notable events (lost / hungry / dehydrated / encounter …) attributed to a specific pending
  // record, so they render UNDER their own record instead of in one shared top banner. Journey
  // records match by journeyId (correct with multiple journeys); other consumers fall back to
  // same-consumer attribution. tickDayOnce tags every notable with {consumer, payload.journeyId}.
  // The day-tick proposal's over-budget heads-up list (#346 / Joachim 2026-06-05): active characters
  // whose committed undertakings exceed their RAW day budget, deduped by character (a multi-day advance
  // with the pause rule off emits one notable per day). Read-only — feeds the Activities section in the
  // review surface; the engine's activity-budget consumer raises these + pauses on them when the rule is on.
  dayTickOverBudget(){
    const p = this.dayTickProposal;
    if(!p || !Array.isArray(p.notableEvents)) return [];
    const seen = {}, out = [];
    for(const e of p.notableEvents){
      if(!e || e.kind !== 'activity-overbudget' || !e.characterId) continue;
      if(seen[e.characterId]) continue;
      seen[e.characterId] = 1;
      out.push(e);
    }
    return out;
  },
  dayTickRecordNotables(record){
    const p = this.dayTickProposal;
    if(!p || !record) return [];
    return (p.notableEvents || []).filter(e => {
      if(!e || e.consumer !== record.consumer) return false;
      // The comprehensive per-day umbrella (Travel pivot / CoL-1 survival-day) is conveyed by the record
      // summary line itself; the per-thing notables (lost/hunger/fording/…) are what the GM reviews under it.
      if(e.type === 'travel-day' || e.type === 'survival-day') return false;
      // Match by journeyId AND dayIndex — a multi-day advance has one record per day for the same journey,
      // so journeyId alone showed every day's notables under each day's record (an earlier day surfaced a
      // later day's dehydration — the review must not look into the future). tickJourneyDay stamps dayIndex.
      if(record.journeyId) return !!(e.payload && e.payload.journeyId === record.journeyId && (e.payload.dayIndex == null || e.payload.dayIndex === record.newDayIndex));
      return true;
    });
  },
  // The relevant text of a notable, with the leading "<journey/record name>: " stripped so we
  // don't repeat the journey label the record already shows.
  // A notable event's text with the leading "‹journey name / route›: " prefix stripped — the
  // route is already shown once at the top of the panel (and in the review surface header), so
  // repeating it on every line is noise. Handles both shapes: day-record notables carry `.text`,
  // day-tick proposal notables carry `.label`.
  dayTickNotableText(ne){
    const t = (ne && (ne.text || ne.label || ne.summary || ne.type || ne.kind)) || 'event';
    const i = t.indexOf(': ');
    return (i > 0 && i < 80) ? t.slice(i + 2) : t;
  },
  toggleRejectDayTickRecord(r){ if(r) r.rejected = !r.rejected; },
  // ── Survival record detail (CoL-1, Joachim 2026-06-06) ──────────────────────────────────────────
  // A survival record's header label: who (party or lone character) + where. More legible than the bare
  // "survival record". Set on the record in _proposeDayTick.
  _dayTickSurvivalLabel(record){
    const camp = this.currentCampaign || {}; const ids = record.memberIds || [];
    const first = (camp.characters||[]).find(c => c && c.id === ids[0]);
    let who;
    if(record.partyId){ const p = (camp.parties||[]).find(x => x && x.id === record.partyId); who = (p && p.name) || 'Party'; }
    else who = (first && first.name) || 'A character';
    const hexId = first && first.currentHexId;
    const hex = hexId ? (camp.hexes||[]).find(h => h && h.id === hexId) : null;
    const where = hex ? (' · ' + (window.ACKS.hexName ? hexLabelFor(hex) : hexId)) : '';
    return '🍖 ' + who + where;
  },
  // Per-member rows for a survival record's detail: name + conditions (hunger/thirst ladders + CON loss)
  // + whether they ate/drank today + food/water left + a critical (CON 0) flag. Reads the PROPOSED
  // post-day member state (record.survival.members) so the review shows the day's actual outcome.
  dayTickSurvivalRows(record){
    if(!record || record.kind !== 'survival' || !record.survival || !record.survival.members) return [];
    const camp = this.currentCampaign || {}; const A = window.ACKS;
    const upd = record.survival.inventoryUpdates || {};
    const out = [];
    for(const id of (record.memberIds || Object.keys(record.survival.members))){
      const m = record.survival.members[id]; if(!m) continue;
      const ch = (camp.characters||[]).find(x => x && x.id === id);
      const conds = [];
      const h = m.foodDeficitDays || 0;
      if(h > 0) conds.push({ label: (h>=7?'Starving':(h>=2?'Underfed':'Hungry')), detail: 'day '+h+((m.conLossHunger||0)>0?(' · −'+m.conLossHunger+' CON'):''), cls:'bg-orange-200 text-orange-900' });
      const d = m.waterDeficitDays || 0;
      if(d > 0) conds.push({ label:'Dehydrated', detail:'day '+d+((m.conLossThirst||0)>0?(' · −'+m.conLossThirst+' CON'):''), cls:'bg-sky-200 text-sky-900' });
      const inv = upd[id] || (ch && ch.inventory) || [];
      const foodDays = (A && A.rationDaysAvailable) ? (A.rationDaysAvailable({ inventory: inv }) || 0) : 0;
      out.push({ id, name: (ch && ch.name) || id, conditions: conds, fedFood: !!m.fedFood, fedWater: !!m.fedWater,
                 foodDays: Math.round(foodDays), waterDays: Math.round((m.waterDaysCarried||0)*10)/10, critical: !!m.critical });
    }
    return out;
  },
  // Step out of the review to a character's Survival tab to act (forage / move). Cancels the proposal
  // first (it's a snapshot; acting would stale it) — mirrors the over-budget "Resolve →" pattern.
  dayTickGoToSurvival(id){
    const ch = (this.currentCampaign && this.currentCampaign.characters || []).find(c => c && c.id === id);
    if(!ch) return;
    this.cancelDayTick();
    this.openCharacterEditor(ch);
    this.characterEditorTab = 'survival';
  },
  cancelDayTick(){ this.dayTickProposal = null; this.dayTickError = null; this._nextMonthIntent = false; },
  _persistDayTick(){
    // A day-tick is a content mutation — mark dirty + persist to the SESSION cache (debounced),
    // exactly like every other edit. Do NOT write the bound .acks.json file; that stays explicit
    // (Save campaign). The old fallback chain (autosave -> saveCampaign -> persistCampaignToDisk)
    // landed on saveCampaign() because the intended autosave() was never implemented, so every tick
    // was silently writing the user's file + flashing a "Saved" toast.
    this.markDirty();
    this.schedulePersist();
  },
  commitDayTick(){
    if(!this.dayTickProposal) return;
    const monthEndReached = !!this.dayTickProposal.monthEndReached;
    // Domains live on the campaign (single home), so the construction commit debits the real
    // domain treasury directly.
    try {
      // E2g — committing materializes the day's encounter proposals as entities; point the GM
      // at the work queue (Review ▸ ⚔ Encounters) the moment they exist.
      const encBefore = (window.ACKS.activeEncounters(this.currentCampaign) || []).length;
      window.ACKS.commitDayTick(this.currentCampaign, this.dayTickProposal, null);
      this.dayTickProposal = null;
      const encNew = (window.ACKS.activeEncounters(this.currentCampaign) || []).length - encBefore;
      if(encNew > 0) this.showToast('⚔ ' + encNew + ' encounter' + (encNew === 1 ? '' : 's') + ' await' + (encNew === 1 ? 's' : '') + ' resolution — 📋 Review ▸ ⚔ Encounters. The clock holds until they\'re resolved.', 7000);
    } catch(e){ console.error('commitDayTick error', e); this.dayTickError = String((e && e.message) || e); }
    this._persistDayTick();
    // "Next month ▶" chaining (2026-06-13): the committed days finished the month and nothing
    // new needs the GM → stage the monthly turn at once. A pause or a fresh blocker breaks the
    // chain (resolve it, then click Next month again — at day 30 it goes straight to the turn).
    const intent = this._nextMonthIntent; this._nextMonthIntent = false;
    if(intent && monthEndReached && !this.dayTickError && !this.advanceBlockers().length){ this.proposeMonthlyTurn(); }
  },
  proposeMonthlyTurn(){
    this.turnProposalError = '';
    try {
      const result = window.ACKS.proposeMonthlyTurn(this.currentCampaign);
      if(result.error){
        this.turnProposalError = result.error;
        this.currentView='domain-turn';
        return;
      }
      this.turnEventProposals   = result.turnEventProposals;
      this.turnVentureProposals = result.turnVentureProposals;
      this.turnProposal         = result.turnProposal;
      this.turnLivingExpenseProposal = result.livingExpenseProposal || null;   // CoL-2 preview
      this.turnSyndicateTributeProposal = result.syndicateTributeProposal || null;   // HJ-2 preview
      this.currentView='domain-turn';   // 2026-06-13 — the turn stages in Review ▸ Domain Review (was a modal)
    } catch(e){
      console.error('proposeMonthlyTurn error', e);
      this.turnProposalError = 'Failed to propose turn: ' + e.message;
      this.currentView='domain-turn';
    }
  },

  // (The _buildTurnHelpers callback bag was removed 2026-06-06 — audit batch 3. The engine now owns
  // the whole turn: ACKS.proposeMonthlyTurn(campaign) / ACKS.commitTurn(campaign, proposal). The
  // economy lives in acks-engine-economy.js; this object's economy methods delegate to it.)

  // Regenerate income/expense/moraleMods when the user toggles tithePaid / tributePaid / administersThisMonth in the modal
  recomputeProposal(p){
    const orig=this.domains.find(x=>x.id===p.domainId);
    if(!orig)return;
    const synth=JSON.parse(JSON.stringify(orig));
    synth.expenses.tithePaid=p.tithePaid;
    synth.expenses.tributePaid=p.tributePaid;
    synth.ruler.administersThisMonth=p.administersThisMonth;
    p.income=this.incomeBreakdown(synth).map(r=>({...r}));
    p.expenses=this.expenseBreakdown(synth).map(r=>({...r}));
    p.moraleMods=this.moraleModifiersFor(synth).map(m=>({...m}));
  },

  cancelTurn(){this.turnProposal=null;this.turnVentureProposals=null;this.turnEventProposals=null;this.turnProposalError='';},

  // Manual event resolution — accept/reject a pending event at any time, decoupled from
  // the month commit (used by the Event Log + Review ▸ Pending Events queue rows). Mirrors
  // the commitTurn event-apply pattern (engine sets the
  // status, pushes to eventLog, and we filter pendingEvents afterward). Same audit shape
  // either way. `decision` is 'accept' | 'reject'; 'skip' is handled by leaving the event
  // in pendingEvents untouched. For rumor-emit events, the GM may have already edited
  // ep.event.payload.rumorText / .apparentLevel / .topic / .truthLevel inline — those
  // edits are already on the event object by the time this is called.
  resolvePendingEvent(ev, decision){
    if(!ev || !this.currentCampaign) return false;
    if(decision !== 'accept' && decision !== 'reject') return false;
    if(ev.status !== window.ACKS.EVENT_STATUS.PENDING) {
      this.showToast('Event already resolved.');
      return false;
    }
    const currentTurnNum = this.currentCampaign.currentTurn || 1;
    // Domains live on the campaign (single home), so engine handlers traverse campaign.domains directly.
    {
      if(decision === 'accept'){
        try {
          const applyResult = window.ACKS.applyEvent(this.currentCampaign, ev);
          ev.status = window.ACKS.EVENT_STATUS.APPLIED;
          ev.appliedAtTurn = currentTurnNum;
          if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
          this.currentCampaign.eventLog.push({
            event: ev,
            result: applyResult?.result || { narrativeSummary: ev.kind + ' applied' },
            appliedAtTurn: currentTurnNum,
            appliedAt: new Date().toISOString()
          });
          this.showToast('Accepted: ' + ev.kind + ' (' + ev.submittedBy + ')');
        } catch(e){
          // Apply threw — treat like Advance Month's auto-reject-on-error path so the
          // event doesn't get stuck in pending forever.
          console.error('resolvePendingEvent accept threw:', e);
          ev.status = window.ACKS.EVENT_STATUS.REJECTED;
          ev.appliedAtTurn = currentTurnNum;
          ev.gmNotes = (ev.gmNotes || '') + (ev.gmNotes ? ' · ' : '') + 'engine error: ' + e.message;
          if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
          this.currentCampaign.eventLog.push({
            event: ev,
            result: { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: 'Engine error: ' + e.message },
            appliedAtTurn: currentTurnNum,
            appliedAt: new Date().toISOString()
          });
          this.showToast('Apply failed: ' + e.message, 6000);
        }
      } else {
        // Reject — no apply, just log.
        ev.status = window.ACKS.EVENT_STATUS.REJECTED;
        ev.appliedAtTurn = currentTurnNum;
        if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
        this.currentCampaign.eventLog.push({
          event: ev,
          result: { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: this._buildRejectionSummary(ev) },
          appliedAtTurn: currentTurnNum,
          appliedAt: new Date().toISOString()
        });
        this.showToast('Rejected: ' + ev.kind);
      }
      // Remove from pendingEvents (it's now in eventLog with applied/rejected status).
      this.currentCampaign.pendingEvents = (this.currentCampaign.pendingEvents || []).filter(e => e.id !== ev.id);
    }
    return true;
  },
  // Reroll a single vagary in the proposal (GM can re-randomize before commit if desired)
  rerollVagary(vp){
    const v=rollVagary();
    vp.vagaryId=v.id;vp.vagaryName=v.name;vp.vagaryText=v.text;
    vp.vagaryEffect=v.effect;vp.vagaryEffectValue=v.effectValue||0;vp.vagarySeverity=v.severity;
    vp.applyEffect=v.effect!=='none';
  },
  // Apply a vagary effect to a venture record. Returns a human-readable summary string.
  applyVagaryToVenture(venture, vp){return window.ACKS.applyVagaryToVenture(this.currentCampaign, venture, vp);},

  // Foundation #15 — orchestration lifted into ACKS.commitTurn.
  // Alpine wrapper: assembles a proposal payload from the modal state, delegates to the engine,
  // then surfaces UI side effects (log entries → campaign log; result blurbs → toast).
  commitTurn(){
    if(!this.turnProposal) return;
    const proposal = {
      turnEventProposals: this.turnEventProposals || [],
      turnVentureProposals: this.turnVentureProposals || [],
      turnProposal: this.turnProposal
    };
    // Wrap engine call defensively — if anything throws mid-commit, the engine may have
    // already mutated state; we still want to close the modal and surface a useful toast
    // (rather than leaving the user staring at an unresponsive dialog).
    let result;
    try {
      result = window.ACKS.commitTurn(this.currentCampaign, proposal);
    } catch(e){
      console.error('commitTurn threw:', e);
      this.turnProposal = null;
      this.turnVentureProposals = null;
      this.turnEventProposals = null;
      this.showToast('Commit failed: ' + (e && e.message ? e.message : String(e)), 8000);
      return;
    }
    result = result || {};
    // Surface log entries to the campaign log + console.
    // Engine logEntries are summary strings of typed events already in eventLog —
    // no separate campaign-log push needed (Foundation #234). The strings are still
    // available via result.logEntries if any caller wants to surface them as toasts.
    // Clear the staged turn (Domain Review falls back to its empty state).
    this.turnProposal = null;
    this.turnVentureProposals = null;
    this.turnEventProposals = null;
    // Build toast blurbs.
    const committed = result.committed || 0;
    const vagariesApplied = result.vagariesApplied || 0;
    const ventureAnnihilations = result.ventureAnnihilations || 0;
    const passiveResult = result.passiveResult || { totalGp: 0, payouts: [] };
    const levelUpResults = result.levelUpResults || [];
    // Real conditional pluralization via the global this.pluralize helper.
    const p = this.pluralize.bind(this);
    const ventureBlurb = vagariesApplied > 0 ? (' · ' + p(vagariesApplied, 'venture vagary', 'venture vagaries') + (ventureAnnihilations > 0 ? ' (' + ventureAnnihilations + ' total loss)' : '')) : '';
    const passiveBlurb = passiveResult.totalGp > 0 ? (' · passive +' + passiveResult.totalGp.toLocaleString() + 'gp across ' + p(passiveResult.payouts.length, 'investment')) : '';
    const levelUpBlurb = levelUpResults.length > 0 ? (' · ' + p(levelUpResults.reduce((s, r) => s + r.levelUps.length, 0), 'level-up') + ' across ' + p(levelUpResults.length, 'character')) : '';
    // Bump toast duration to 5s so the result is comfortably readable. Defensive: if the
    // toast helper is missing or throws, fall back to a console log so the commit silently
    // completing isn't mistaken for a no-op.
    try {
      this.showToast('Committed ' + p(committed, 'domain') + '. Now on Turn ' + (this.currentCampaign?.currentTurn || 1) + '.' + ventureBlurb + passiveBlurb + levelUpBlurb, 5000);
    } catch(e){
      console.error('showToast threw:', e);
    }
  },
  // ════ TEAM SESSION (world-front 2026-06-13) — per-agent Alpine state props + methods; add yours after YOUR marker (additive, never reorder); Lead removes this block at integration ════
  // ── agent-1 (Religion R1) state + methods ──
  // Religion R1 (team 2026-06-13) — the ⛪ Religion view. Thin Alpine layer over the
  // acks-engine-religion.js verbs; every action mutates currentCampaign through the engine
  // (which emits the typed events) then markDirty + schedulePersist + a toast.
  religionDeityForm: { name: '', alignment: 'Lawful' },
  religionCongForm: { name: '', deityId: '', highPriestCharacterId: '', domainWorshipDomainId: '', usurpedSettlementId: '', personalCongregants: 0 },
  religionGrantGp: {},          // per-caster grant input (keyed by charId)
  religionPrayGp: {},           // per-caster pray-and-sacrifice input (keyed by charId)
  religionConsecrateDomain: {}, // per-caster consecrate-fields target domain (keyed by charId)
  // — reads —
  religionDeities(){ return (this.currentCampaign && this.currentCampaign.deities) || []; },
  religionCongregations(){ return (this.currentCampaign && this.currentCampaign.congregations) || []; },
  religionDeityName(id){ const d = this.religionDeities().find(x => x.id === id); return d ? (d.name || d.id) : '—'; },
  religionCharName(id){ const c = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x.id === id); return c ? (c.name || c.id) : '—'; },
  religionDomainName(id){ const d = (this.domains || []).find(x => x.id === id); return d ? (d.name || d.id) : id; },
  // Wave E — co-extraction over a usurped settlement (RR p.388). The founder lists usurped settlements;
  // the table names them. A divine caster usurps it in the 🔮 Arcane hub first; then a chaplain co-extracts.
  religionUsurpedSettlements(){ try { return (window.ACKS.usurpedSettlements(this.currentCampaign) || []).map(s => ({ id: s.id, name: s.name || s.id })); } catch(e){ return []; } },
  religionSettlementName(id){ const s = ((this.currentCampaign && this.currentCampaign.settlements) || []).find(x => x.id === id); return s ? (s.name || s.id) : id; },
  religionWeeklyDP(cong){ try { return window.ACKS.congregationWeeklyDivinePowerGp(this.currentCampaign, cong) || 0; } catch(e){ return 0; } },
  religionMonthlyDP(cong){ try { return window.ACKS.congregationMonthlyDivinePowerGp(this.currentCampaign, cong) || 0; } catch(e){ return 0; } },
  religionAutoMaintain(cong){ return !!(cong && cong.autoMaintain !== false); },
  religionAvailable(id){ try { return window.ACKS.divinePowerAvailable(this.currentCampaign, id) || 0; } catch(e){ return 0; } },
  religionDivineCasterRows(){
    const camp = this.currentCampaign; if(!camp) return [];
    const A = window.ACKS; const chars = camp.characters || [];
    const priestIds = new Set((camp.congregations || []).map(c => c.highPriestCharacterId).filter(Boolean));
    const ct = camp.currentTurn || 1;
    const liveEntries = ch => (ch.divinePower && Array.isArray(ch.divinePower.entries) ? ch.divinePower.entries : [])
      .filter(e => { if(!e) return false; const exp = (e.expiresAtTurn != null) ? e.expiresAtTurn : (e.accruedAtTurn != null ? e.accruedAtTurn + 1 : null); return exp == null || exp > ct; });
    return chars.filter(ch => ch && (A.isDivineCaster(ch) || priestIds.has(ch.id) ||
        (ch.divinePower && (((ch.divinePower.entries || []).length > 0) || (ch.divinePower.reliquaryStoreGp > 0) || (ch.divinePower.prayedThisTurnGp > 0)))))
      .map(ch => {
        const fav = A.divineFavorOf(camp, ch.id);
        const deity = fav ? A.findDeity(camp, fav.deityId) : null;
        return { ch, available: this.religionAvailable(ch.id), favor: fav, deity, entries: liveEntries(ch) };
      });
  },
  // — actions —
  religionAddDeity(){
    const f = this.religionDeityForm; if(!f.name.trim()) return;
    const dei = window.ACKS.blankDeity({ name: f.name.trim(), alignment: f.alignment,
      acceptsBloodSacrifice: f.alignment === 'Chaotic' ? 'sapient' : 'none' });
    if(!Array.isArray(this.currentCampaign.deities)) this.currentCampaign.deities = [];
    this.currentCampaign.deities.push(dei);
    this.religionDeityForm = { name: '', alignment: 'Lawful' };
    this.markDirty(); this.schedulePersist();
    this.showToast('Deity added: ' + dei.name);
  },
  religionFoundCongregation(){
    const f = this.religionCongForm; if(!f.highPriestCharacterId) return;
    const cong = window.ACKS.foundCongregation(this.currentCampaign, {
      name: f.name.trim() || ('Congregation of ' + this.religionCharName(f.highPriestCharacterId)),
      deityId: f.deityId || null, highPriestCharacterId: f.highPriestCharacterId,
      domainWorshipDomainId: f.domainWorshipDomainId || null,
      usurpedSettlementId: f.usurpedSettlementId || null,   // Wave E — co-extraction (RR p.388, Balbus)
      personalCongregants: Number(f.personalCongregants) || 0
    });
    this.religionCongForm = { name: '', deityId: f.deityId, highPriestCharacterId: '', domainWorshipDomainId: '', usurpedSettlementId: '', personalCongregants: 0 };
    this.markDirty(); this.schedulePersist();
    this.showToast('Congregation founded' + (cong ? ': ' + (cong.name || '') : ''));
  },
  religionToggleMaintain(congId){
    const cong = this.religionCongregations().find(c => c.id === congId); if(!cong) return;
    window.ACKS.setCongregationMaintenance(this.currentCampaign, congId, !(cong.autoMaintain !== false), 0);
    this.markDirty(); this.schedulePersist();
  },
  religionGrantDP(charId){
    const gp = Number(this.religionGrantGp[charId]) || 0; if(gp <= 0) return;
    window.ACKS.grantDivinePower(this.currentCampaign, charId, gp);
    this.religionGrantGp[charId] = '';
    this.markDirty(); this.schedulePersist();
    this.showToast('Granted ' + gp.toLocaleString() + ' gp divine power');
  },
  religionConsecrate(charId){
    const domId = this.religionConsecrateDomain[charId]; if(!domId) return;
    const r = window.ACKS.consecrateFields(this.currentCampaign, { casterId: charId, domainId: domId });
    if(!r || !r.ok){ this.showToast('Cannot consecrate: ' + (r && r.reason === 'insufficient-divine-power' ? ('needs ' + (r.cost || 0).toLocaleString() + ' gp DP') : (r && r.reason) || 'failed')); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Consecrated fields — ' + (r.cost || 0).toLocaleString() + ' gp DP, Land Value ' + (r.landValueDelta > 0 ? '+1' : (r.landValueDelta < 0 ? '−1' : 'no change')));
  },
  religionPray(charId){
    const gp = Number(this.religionPrayGp[charId]) || 0; if(gp <= 0) return;
    const r = window.ACKS.prayAndSacrifice(this.currentCampaign, charId, gp);
    if(!r || !r.ok){ this.showToast('Cannot pray: ' + (r && r.reason === 'insufficient-divine-power' ? 'not enough divine power' : (r && r.reason) || 'failed')); return; }
    this.religionPrayGp[charId] = '';
    this.markDirty(); this.schedulePersist();
    this.showToast('Returned ' + gp.toLocaleString() + ' gp DP — XP settles on Advance Month');
  },
  // ── agent-2 (DC-2) state + methods ──
  // DC-2 — the classification-advancement readout for the Domain-Advancement panel (layered on
  // DC-0's domainAdvancementSpatial). Returns the current tier, the next tier, the permanent floor,
  // and the per-condition checklist for the next tier (RR p.340 — advances on ANY one). Pure read
  // over the engine helpers; null when there is no campaign/domain. The morale gate reads the
  // CURRENT (pre-turn) morale — a readiness preview; the actual advance at month-end reads post-turn.
  domainAdvancementReadout(d){
    const c = this.currentCampaign; if(!c || !d) return null;
    const A = window.ACKS; if(!A || typeof A.classificationAdvanceCheck !== 'function') return null;
    const current  = A.effectiveDomainClassification(d);
    const fam      = A.domainFamilies(d);
    const hexes    = A.controlledHexCount(d);
    const road     = A.effectiveRoadToTown(c, d);
    const city     = A.effectiveNearFriendlyCity(c, d);   // 'within-48mi'|'within-72mi'|'none'
    const morale   = (d.demographics && d.demographics.morale) || 0;
    const moraleOK = morale >= 1;
    const urban    = A.domainHasUrbanSettlement(c, d);
    const check    = A.classificationAdvanceCheck(c, d);
    const next     = current === 'Outlands' ? 'Borderlands' : current === 'Borderlands' ? 'Civilized' : null;
    const ms       = (morale >= 0 ? '+' : '') + morale;
    const cityTxt  = city === 'none' ? '✗' : city.replace('within-', '≤').replace('mi', 'mi');
    let conditions = [];
    if(next === 'Borderlands'){
      conditions = [
        { label: '≥185 families · road to a town ≤24mi · morale ≥+1', met: (fam >= 185 && road && moraleOK),
          detail: fam.toLocaleString() + ' fam · road ' + (road ? '✓' : '✗') + ' · morale ' + ms },
        { label: '≥5 hexes · ≥925 families · morale ≥+1', met: (hexes >= 5 && fam >= 925 && moraleOK),
          detail: hexes + ' hexes · ' + fam.toLocaleString() + ' fam · morale ' + ms },
        { label: 'an established urban settlement · friendly city ≤72mi', met: (urban && (city === 'within-72mi' || city === 'within-48mi')),
          detail: 'settlement ' + (urban ? '✓' : '✗') + ' · friendly city ' + cityTxt }
      ];
    } else if(next === 'Civilized'){
      conditions = [
        { label: '≥375 families · road to a town ≤24mi · morale ≥+1', met: (fam >= 375 && road && moraleOK),
          detail: fam.toLocaleString() + ' fam · road ' + (road ? '✓' : '✗') + ' · morale ' + ms },
        { label: '≥7 hexes · ≥1,200 families · morale ≥+1', met: (hexes >= 7 && fam >= 1200 && moraleOK),
          detail: hexes + ' hexes · ' + fam.toLocaleString() + ' fam · morale ' + ms },
        { label: 'an established urban settlement · friendly city ≤48mi', met: (urban && city === 'within-48mi'),
          detail: 'settlement ' + (urban ? '✓' : '✗') + ' · friendly city ' + cityTxt }
      ];
    }
    return {
      current, next,
      qualifies: !!check,
      reason: check ? check.reason : null,
      conditions,
      floor: d.classificationAdvancedTo || null,
      lockedAt: (d.classificationLockedAt != null) ? d.classificationLockedAt : null
    };
  },
  // Manual advance (RR p.340 "the Judge may advance for other in-game circumstances"). Routes
  // through the canonical engine path (processClassificationAdvancement scoped to this domain) so
  // it sets the permanent floor + emits the domain-advanced event exactly like the monthly turn.
  // The deep currentCampaign $watch catches the mutation (dirty + persist), matching commitStatEdit.
  advanceDomainNow(d){
    const c = this.currentCampaign; if(!c || !d) return;
    const A = window.ACKS;
    const res = A.classificationAdvanceCheck(c, d);
    if(!res){ this.showToast(d.name + ' does not currently qualify for advancement.', 4000); return; }
    A.processClassificationAdvancement(c, { onlyDomainId: d.id });
    this.showToast(d.name + ' advanced ' + res.from + ' → ' + res.to + ' (RR p.340).', 5000);
  },
  // GM spatial overrides for the advancement check (canonical-setter discipline — the derived
  // value is the truth; the override wins). Both route through commitStatEdit (gm-fiat, audited).
  // roadToTownOverride is a tri-state null|true|false; nearFriendlyCity is the band string.
  setDomainRoadOverride(d, selectVal){
    if(!d) return;
    const newV = selectVal === 'yes' ? true : selectVal === 'no' ? false : null;
    const oldV = (d.roadToTownOverride === true || d.roadToTownOverride === false) ? d.roadToTownOverride : null;
    this.commitStatEdit({ entityType:'domain', entityId:d.id, entity:d, fieldPath:'roadToTownOverride',
      label:'Road-to-town override', oldValue:oldV, newValue:newV });
  },
  setDomainFriendlyCity(d, selectVal){
    if(!d) return;
    const newV = selectVal || 'auto';
    const oldV = (d.nearFriendlyCity && d.nearFriendlyCity !== 'auto') ? d.nearFriendlyCity : 'auto';
    this.commitStatEdit({ entityType:'domain', entityId:d.id, entity:d, fieldPath:'nearFriendlyCity',
      label:'Friendly-city band', oldValue:oldV, newValue:newV });
  },
  // ── agent-3 (Terrain T3) state + methods ──
  // Terrain T3 (Phase_2.5_Terrain_Model_Plan.md §7) — read-only hex-card readout helpers.
  // hexTerrainDetailLine: the resolved base · sub-type · derived biome · Köppen climate, at a glance
  // (only the parts that are set; the dropdowns above SET them). hexVisibilityLine: the RR p.275
  // sighting factor (full / −33% / −50% + the reason) — it scales sighting range and so the distance
  // at which wilderness encounters begin. Both defensive: a null / terrain-less hex → '' (card hides).
  hexTerrainDetailLine(hex){
    const A = window.ACKS;
    if(!hex || !hex.terrain) return '';
    const base = A.terrainBase(hex.terrain) || String(hex.terrain || '');
    let head = base.charAt(0).toUpperCase() + base.slice(1);
    const sub = String(hex.terrainSubtype || '').trim();
    if(sub) head += ' · ' + sub;
    const parts = [head];
    const biome = A.biomeForHex(hex);
    if(biome) parts.push(biome + ' biome');
    const kop = String(hex.koppen || '').trim();
    if(kop){ const k = (A.KOPPEN_CLIMATE || {})[kop]; parts.push(kop + (k ? ' (' + k.name + ')' : '')); }
    return parts.join(' · ');
  },
  hexVisibilityLine(hex){
    if(!hex || !hex.terrain) return '';
    const f = window.ACKS.visibilityFactorForHex(hex);
    if(f >= 1) return 'Full — open sighting (RR p.275)';
    return '−' + Math.round((1 - f) * 100) + '% — sighting & encounter distance reduced (RR p.275)';
  },
  // ── agent-4 (Proficiency PT-1) state + methods ──
  // PT-0 — format a canonical {key,ranks(,spec,label)} proficiency entry (or a legacy string) for
  // display: the catalog label (or a custom human label), " — spec", and " (rank N)" when N > 1.
  proficiencyDisplayLabel(p){
    const A = window.ACKS;
    if(p == null) return '';
    if(typeof p === 'string'){ const parsed = (A && A.parseProficiencyEntry) ? A.parseProficiencyEntry(p) : null; if(!parsed) return p; p = parsed; }
    const inCatalog = !!(A && A.PROFICIENCY_CATALOG && A.PROFICIENCY_CATALOG[p.key]);
    let s = inCatalog ? A.proficiencyLabel(p.key) : (p.label || (A && A.proficiencyLabel ? A.proficiencyLabel(p.key) : (p.key || '')));
    if(p.spec) s += ' — ' + p.spec;
    if(p.ranks > 1) s += ' (rank ' + p.ranks + ')';
    return s;
  },
  // PT-0 — parse free-text ("Bargaining (2)", "Craft (smithing)") into a canonical {key,ranks(,spec)}
  // entry and append it (logged). A custom (off-catalog) input keeps its human label.
  addProficiency(raw){
    const s = String(raw == null ? '' : raw).trim(); if(!s) return;
    const A = window.ACKS;
    const parsed = (A && A.parseProficiencyEntry) ? A.parseProficiencyEntry(s) : null;
    let entry;
    if(parsed){
      entry = parsed.spec ? { key:parsed.key, ranks:parsed.ranks, spec:parsed.spec } : { key:parsed.key, ranks:parsed.ranks };
      if(A.PROFICIENCY_CATALOG && !A.PROFICIENCY_CATALOG[parsed.key] && parsed.label && parsed.label !== parsed.key) entry.label = parsed.label;
    } else {
      entry = { key: s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), ranks:1, label:s };
    }
    this.commitListMutation({ entityType:'character', entityId:this.characterEditing.id, entity:this.characterEditing, fieldPath:'proficiencies', label:'Proficiency', action:'add', value:entry, valueDisplay:this.proficiencyDisplayLabel(entry) });
  },
  // The shared Proficiency Throw modal (RR pp.9–10). A throw is a pure die (engine Layer 1/3) —
  // the modal computes the forecast + rolls; the consequence is the GM's to apply (DQ3/Q3).
  profThrow: { open:false, characterId:null, character:null, actorPicker:false, taskKey:'adventuring:dungeonbashing', abilityKey:'STR', relevantRanks:0, manualTarget:null, situational:0, secret:false, logToEvent:false, result:null, _logged:false },
  // Open for a FIXED character (the Skills-tab / Inspector "roll" buttons), or GENERIC (ch omitted →
  // the GM picks the actor in-modal: the PT-5 "make a throw" affordance). opts.taskKey pre-selects a throw.
  openProficiencyThrowModal(ch, opts){
    opts = opts || {};
    const generic = !ch;
    if(generic){
      const actors = this.profThrowActorOptions();
      ch = (this.characterEditing && actors.some(a => a.id === this.characterEditing.id)) ? this.characterEditing : (actors[0] ? ((this.currentCampaign.characters||[]).find(c => c && c.id === actors[0].id)) : null);
      if(!ch){ this.showToast && this.showToast('No active character to roll for.'); return; }
    }
    const avail = (window.ACKS.characterAvailableThrows(this.currentCampaign, ch) || []);
    this.profThrow = {
      open:true, characterId:ch.id, character:ch, actorPicker:(generic || !!opts.actorPicker),
      taskKey: opts.taskKey || (avail[0] && avail[0].taskKey) || 'adventuring:dungeonbashing',
      abilityKey:'STR', relevantRanks:0, manualTarget:null, situational:0, secret:false, logToEvent:false, result:null, _logged:false
    };
  },
  // Active characters that can be rolled for (the generic actor picker).
  profThrowActorOptions(){
    const A = window.ACKS;
    return ((this.currentCampaign && this.currentCampaign.characters) || [])
      .filter(c => c && (A.isActive ? A.isActive(c) : (c.alive !== false)))
      .map(c => ({ id:c.id, label:(c.name || c.id) + (c.class ? (' · ' + c.class + ' L' + (c.level||1)) : '') }));
  },
  // The GM switched the actor in the picker — re-anchor + re-validate the selected throw + reset the result.
  profThrowSetActor(id){
    const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id);
    if(!ch) return;
    const avail = (window.ACKS.characterAvailableThrows(this.currentCampaign, ch) || []);
    this.profThrow.characterId = ch.id; this.profThrow.character = ch;
    if(!this.profThrowOptions().some(o => o.taskKey === this.profThrow.taskKey)) this.profThrow.taskKey = (avail[0] && avail[0].taskKey) || 'adventuring:dungeonbashing';
    this.profThrow.result = null; this.profThrow._logged = false; this.profThrow.logToEvent = false;
  },
  closeProficiencyThrowModal(){ this.profThrow.open = false; this.profThrow.result = null; },
  profThrowChar(){
    // Prefer the live campaign object (reflects edits), fall back to the stored ref (matches the
    // Loyalty modal; robust if the character isn't in currentCampaign.characters yet).
    const id = this.profThrow.characterId;
    const live = id ? ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id) : null;
    return live || this.profThrow.character || null;
  },
  profThrowIsImprovised(){ return /^improvised:/.test(this.profThrow.taskKey || ''); },
  // The dropdown rows: the character's available throws (Adventuring sub-throws + their profs)
  // + the JJ p.94 improvised difficulty classes.
  profThrowOptions(){
    const ch = this.profThrowChar();
    if(!ch) return [];
    const rows = (window.ACKS.characterAvailableThrows(this.currentCampaign, ch) || []).map(r => Object.assign({ improvised:false }, r));
    const imp = Object.entries(window.ACKS.IMPROVISED_THROW_DIFFICULTY || {}).map(([k, v]) => ({ taskKey:'improvised:' + k, label:v.label, improvised:true, universal:false, resolvedTarget:null }));
    return rows.concat(imp);
  },
  // The roll:false forecast for the current selection (resolved target + itemized modifiers).
  profThrowForecast(){
    const ch = this.profThrowChar();
    if(!ch) return null;
    const sit = this.profThrow.situational ? [{ source:'situational', value:Number(this.profThrow.situational) || 0, label:'situational' }] : [];
    if(this.profThrowIsImprovised()){
      const dc = (this.profThrow.taskKey || '').replace(/^improvised:/, '');
      return window.ACKS.characterProficiencyThrow(this.currentCampaign, ch, null, { difficultyClass:dc, abilityKeyOverride:this.profThrow.abilityKey, relevantRanks:Number(this.profThrow.relevantRanks) || 0, situational:sit, roll:false });
    }
    return window.ACKS.characterProficiencyThrow(this.currentCampaign, ch, this.profThrow.taskKey, { situational:sit, roll:false });
  },
  profThrowAllModifiers(){ const f = this.profThrowForecast(); return (f && f.itemizedModifiers) ? f.itemizedModifiers : []; },
  // class-derived tasks have no engine number — the GM supplies one via profThrow.manualTarget.
  profThrowEffectiveTarget(){
    const f = this.profThrowForecast();
    if(!f) return null;
    if(f.resolvedTarget != null) return f.resolvedTarget;
    if(f.baseTargetSource && this.profThrow.manualTarget) return Number(this.profThrow.manualTarget) || null;
    return null;
  },
  profThrowChance(){
    const f = this.profThrowForecast(); const t = this.profThrowEffectiveTarget();
    if(!f || t == null) return 0;
    return window.ACKS.throwSuccessChance(t, f.modifierTotal || 0, f.autoFailBand, f.proficient) || 0;
  },
  proficiencyLabelText(key){ return window.ACKS.proficiencyLabel(key); },
  rollProfThrow(){
    const ch = this.profThrowChar(); const f = this.profThrowForecast(); const t = this.profThrowEffectiveTarget();
    if(!ch || !f || t == null) return;
    this.profThrow.result = window.ACKS.rollProficiencyThrow({
      target:t, modifiers:f.itemizedModifiers || [], proficient:f.proficient,
      autoFailBand:f.autoFailBand, fumbleEffect:f.fumbleEffect, secret:this.profThrow.secret
    });
    // re-rolling invalidates a prior record so the GM can record the new outcome
    this.profThrow._logged = false; this.profThrow.logToEvent = false;
  },
  // gm-fiat-proficiency-throws (house rule): the GM declares the outcome instead of rolling the die.
  profThrowGmFiatOn(){ return window.ACKS.isHouseRuleEnabled(this.currentCampaign, 'gm-fiat-proficiency-throws'); },
  profThrowDeclare(success){
    const f = this.profThrowForecast(); const t = this.profThrowEffectiveTarget();
    this.profThrow.result = {
      natural:null, target:(t!=null?t:null), modifiers:(f&&f.itemizedModifiers)||[], modifierTotal:(f&&f.modifierTotal)||0,
      total:null, success:!!success, margin:null, auto:null, botch:false, crit:false,
      fumbleEffect:null, secret:this.profThrow.secret, die:'d20', gmFiat:true
    };
    this.profThrow._logged = false; this.profThrow.logToEvent = false;
  },
  // auto-resolve-trivial-throws (house rule): a foregone-conclusion throw resolves without a die —
  // ≥0.95 (only a natural 1 can fail) → auto-success; ≤0.05 (only a natural 20 can succeed) → auto-fail.
  profThrowTrivial(){
    if(!window.ACKS.isHouseRuleEnabled(this.currentCampaign, 'auto-resolve-trivial-throws')) return null;
    const t = this.profThrowEffectiveTarget(); if(t == null) return null;
    const ch = this.profThrowChance();
    if(ch >= 0.95) return { auto:'success', reason:'only a natural 1 fails' };
    if(ch <= 0.05) return { auto:'fail', reason:'only a natural 20 succeeds' };
    return null;
  },
  profThrowApplyAuto(){
    const tr = this.profThrowTrivial(); if(!tr) return;
    const f = this.profThrowForecast(); const t = this.profThrowEffectiveTarget();
    this.profThrow.result = {
      natural:null, target:t, modifiers:(f&&f.itemizedModifiers)||[], modifierTotal:(f&&f.modifierTotal)||0,
      total:null, success:(tr.auto==='success'), margin:null, auto:tr.auto, botch:false, crit:false,
      fumbleEffect:null, secret:this.profThrow.secret, die:'d20', autoResolved:true, autoReason:tr.reason
    };
    this.profThrow._logged = false; this.profThrow.logToEvent = false;
  },
  // Optional record-only audit (the GM ticks "Record this throw") — campaignLogHidden by default.
  profThrowToggleLog(){
    if(!this.profThrow.logToEvent || !this.profThrow.result || this.profThrow._logged) return;
    const ch = this.profThrowChar(); const f = this.profThrowForecast(); const r = this.profThrow.result;
    let narrative = '';
    if(r.gmFiat) narrative = (f ? f.label : 'Proficiency throw') + ': GM declared ' + (r.success ? 'success' : 'failure');
    else if(r.autoResolved) narrative = (f ? f.label : 'Proficiency throw') + ': auto-' + (r.success ? 'success' : 'failure') + ' (' + (r.autoReason || 'trivial') + ')';
    const data = Object.assign({ actorCharacterId: ch ? ch.id : null, taskKey: this.profThrow.taskKey, label: f ? f.label : '', narrative }, r);
    window.ACKS.recordProficiencyThrow(this.currentCampaign, data);
    this.profThrow._logged = true;
    if(this.markDirty) this.markDirty(); if(this.schedulePersist) this.schedulePersist();
    if(this.showToast) this.showToast('Proficiency throw recorded to the Event Log.');
  },
  // ── agent-5 (Hijinks HJ-1) state + methods ──
  // Phase 2.7 Hijinks (RR pp.360–370) — the Activities ▸ Hijinks launch + lists. The engine
  // (acks-engine-hijinks.js) owns startHijink + the slot-60 day-consumer; this is the surface.
  hijinkLaunch: { perpetratorCharacterId:'', type:'carousing', bossCharacterId:'', settlementId:'' },
  hijinkRefOpen: false,
  hijinkDefList(){
    const D = (window.ACKS && window.ACKS.HIJINK_DEFINITIONS) || {};
    return (window.ACKS && window.ACKS.hijinkTypes ? window.ACKS.hijinkTypes() : Object.keys(D)).map(type => {
      const d = D[type] || {};
      return { type, label:d.label||type, icon:d.icon||'🗡', requiredSkill:d.requiredSkill||'', plannable:!!d.plannable, desc:d.desc||'' };
    });
  },
  // Active characters generally eligible to perpetrate (RAW: Streetwise or a thieving class).
  hijinkEligiblePerpetrators(){
    const A = window.ACKS; if(!A || !this.currentCampaign) return [];
    return (this.currentCampaign.characters||[]).filter(c => c
      && (A.isActive ? A.isActive(c) : (c.alive !== false))
      && A.hijinkPerpetratorEligible && A.hijinkPerpetratorEligible(c));
  },
  _hijinkPerp(){ return (this.currentCampaign?.characters||[]).find(c => c && c.id === this.hijinkLaunch.perpetratorCharacterId) || null; },
  // Can the selected perpetrator attempt this type? (class restriction — RR p.362 assassinating.)
  hijinkTypeAllowed(type){
    const A = window.ACKS, perp = this._hijinkPerp();
    if(!A || !perp) return true;                       // nothing picked yet — don't disable
    return !!(A.hijinkPerpetratorEligible && A.hijinkPerpetratorEligible(perp, type));
  },
  hijinkCanLaunch(){
    const perp = this._hijinkPerp();
    return !!(perp && this.hijinkLaunch.type && window.ACKS && window.ACKS.hijinkPerpetratorEligible
      && window.ACKS.hijinkPerpetratorEligible(perp, this.hijinkLaunch.type));
  },
  hijinkLaunchDisabledReason(){
    const A = window.ACKS, perp = this._hijinkPerp();
    if(!perp) return 'Pick an eligible perpetrator.';
    const r = A && A.hijinkIneligibleReason ? A.hijinkIneligibleReason(perp, this.hijinkLaunch.type) : '';
    return r || '';
  },
  hijinkLaunchForecast(){
    const A = window.ACKS, perp = this._hijinkPerp(); if(!A || !perp || !this.hijinkLaunch.type) return null;
    const def = A.hijinkDefinition ? A.hijinkDefinition(this.hijinkLaunch.type) : null; if(!def) return null;
    const prof = A.hijinkThrowProfile(this.currentCampaign, perp, this.hijinkLaunch.type, {});
    const b = prof.bonus || 0;
    const parts = (prof.parts||[]).map(p => p.label + ' ' + (p.value>=0?'+':'') + p.value).join(', ');
    const throwText = '1d20 ' + (b>=0?'+':'') + b + ' vs ' + prof.target + '+'
      + (parts ? ' (' + parts + ')' : '')
      + (def.victimPenalty ? ' · − victim level at resolution' : '');
    const lvl = Math.max(1, perp.level||1);
    const planExpr = lvl>=9 ? '2d4+3' : lvl>=5 ? '2d6+3' : '2d8+3';
    const perfExpr = lvl>=9 ? '2d6+5' : lvl>=5 ? '3d4+8' : '3d6+10';
    const timingText = def.plannable
      ? ('plan ' + planExpr + ' + perform 1 + lay low 2d8+3 days')
      : ('perform ' + perfExpr + ' days');
    return { requiredSkill: def.requiredSkill, desc: def.desc, throwText, timingText };
  },
  launchHijinkSubmit(){
    if(!this.hijinkCanLaunch() || !window.ACKS || !window.ACKS.startHijink) return;
    const res = window.ACKS.startHijink(this.currentCampaign, {
      perpetratorCharacterId: this.hijinkLaunch.perpetratorCharacterId,
      type: this.hijinkLaunch.type,
      bossCharacterId: this.hijinkLaunch.bossCharacterId || null,
      settlementId: this.hijinkLaunch.settlementId || null,
      crew: this.crewHijinksOn() ? (this.hj3CrewIds || []).slice() : []   // HJ-3 — gated crew-hijinks
    });
    if(!res || !res.ok){ this.showToast('Could not assign hijink: ' + ((res && (res.detail||res.error)) || 'unknown'), 4000); return; }
    const def = window.ACKS.hijinkDefinition(res.hijink.type) || {};
    this.showToast('🗡 ' + (this._hijinkPerp()?.name || 'Perpetrator') + ' begins a ' + (def.label||res.hijink.type).toLowerCase() + ' hijink — advance the Day Clock to resolve it.', 4500);
    this.hijinkLaunch.perpetratorCharacterId = '';     // keep type/boss/settlement for a quick repeat
    this.hj3CrewIds = [];                              // HJ-3 — reset the crew selection
    this.markDirty(); this.schedulePersist();
    if(this.dayTickProposal) this._refreshPendingDayTick();
  },
  _hijinkCharName(id){ const c = (this.currentCampaign?.characters||[]).find(x => x && x.id === id); return (c && c.name) || '—'; },
  _hijinkWhere(h){
    if(h.settlementId){ const s = (this.currentCampaign?.settlements||[]).find(x => x && x.id === h.settlementId); if(s) return s.name || s.id; }
    if(h.hexId){ const hx = (this.currentCampaign?.hexes||[]).find(x => x && x.id === h.hexId); if(hx) return (window.ACKS && window.ACKS.hexName) ? hexLabelFor(hx) : h.hexId; }
    return '—';
  },
  _hijinkRow(h){
    const def = (window.ACKS && window.ACKS.hijinkDefinition) ? (window.ACKS.hijinkDefinition(h.type)||{}) : {};
    const phaseCls = { 'planning':'bg-gray-200', 'performing':'bg-amber-200', 'laying-low':'bg-sky-200' }[h.status] || 'bg-gray-100';
    const outCls = { 'complete':'bg-green-200', 'failed':'bg-gray-300', 'caught':'bg-red-200 text-red-900' }[h.status] || 'bg-gray-100';
    const take = (h.status==='complete') ? (h.rewardText || '—') : (h.status==='caught') ? ('charged: ' + (h.charge||'—')) : '—';
    const outText = (h.status==='complete') ? '✓ success' : (h.status==='caught') ? '✗ caught' : '✗ failed';
    return {
      id: h.id, perpName: this._hijinkCharName(h.perpetratorCharacterId),
      icon: def.icon||'🗡', typeLabel: def.label||h.type,
      phaseText: (window.ACKS && window.ACKS.hijinkPhaseLabel) ? window.ACKS.hijinkPhaseLabel(h) : h.status,
      phaseClass: phaseCls, where: this._hijinkWhere(h),
      outcomeText: outText, outcomeClass: outCls, takeText: take
    };
  },
  hijinkActiveRows(){
    const term = ['complete','failed','caught'];
    return (this.currentCampaign?.hijinks||[]).filter(h => h && term.indexOf(h.status) < 0).map(h => this._hijinkRow(h));
  },
  hijinkResolvedRows(){
    const term = ['complete','failed','caught'];
    return (this.currentCampaign?.hijinks||[]).filter(h => h && term.indexOf(h.status) >= 0).map(h => this._hijinkRow(h));
  },
  allSieges(){ return (this.currentCampaign && this.currentCampaign.sieges) || []; },
  activeSiegesFiltered(){ const t = (this.siegesSearch||'').toLowerCase(); return this.allSieges().filter(s => s && s.status !== 'resolved' && this._siegeMatch(s, t)); },
  pastSiegesFiltered(){ const t = (this.siegesSearch||'').toLowerCase(); return this.allSieges().filter(s => s && s.status === 'resolved' && this._siegeMatch(s, t)); },
  // ── the launcher ──
  openSiegeWizard(opts){
    opts = opts || {}; const armies = this.siegeArmyOptions(), doms = this.siegeDefenderOptions();
    const firstStronghold = doms.find(d => d.strongholdGp > 0) || doms[0] || {};
    this.siegeWizard = {
      besiegerArmyId: opts.besiegerArmyId || (armies[0] && armies[0].id) || '',
      defenderDomainId: opts.defenderDomainId || firstStronghold.id || '',
      material: 'stone', siteType: 'normal', resolutionMode: 'simplified',
      shpOverride: '', unitCapacityOverride: '', name: ''
    };
  },
  closeSiegeWizard(){ this.siegeWizard = null; },
  // ── the detail / resolution modal ──
  openSiegePanel(id){ this.siegePanelId = id; this.siegePanelOpen = true; this.siegeBlockadeFeet = 0; this.siegeBlockadeWeeks = 0; this.siegeBombardDays = 1; },
  closeSiegePanel(){ this.siegePanelOpen = false; },   // keep siegePanelId set — no null teardown
  currentSiege(){ return this.siegePanelId ? window.ACKS.findSiege(this.currentCampaign, this.siegePanelId) : null; },
  // ── agent-2 (Delves D1 Mortal Wounds) state + methods ──
  // The manual GM Record-a-wound modal + the character-sheet Wounds readout. The resolver +
  // convalescence consumer live in acks-engine-mortal-wounds.js (RR pp.300–301 + Appendix C).
  recordWound: { open:false, characterId:null, charName:'', charClass:'', charLevel:1, conMod:0, hitDieType:null, hdBonus:0,
    damageType:'savage', abstract:true, heavyHelm:false, treatmentTiming:'', healingMagicLevel:0,
    pickBand:false, conditionId:'in-shock', healedToOneHp:true, magicalHealing:false, result:null },
  openRecordWoundModal(ch){
    if(!ch) return;
    const A = window.ACKS;
    const conMod = (A && A.mortalWoundAbilityMod) ? A.mortalWoundAbilityMod(ch.abilities && ch.abilities.CON) : 0;
    const hd = ch.hp && ch.hp.hitDice && String(ch.hp.hitDice).match(/d(\d+)/i);
    const hitDieType = hd ? ('d' + hd[1]) : null;
    const hdBonus = (hitDieType && A && A.HIT_DIE_VALUE_BONUS) ? (A.HIT_DIE_VALUE_BONUS[hitDieType] || 0) : 0;
    this.recordWound = {
      open:true, characterId: ch.id, charName: ch.name, charClass: ch.class || '', charLevel: ch.level || 1,
      conMod, hitDieType, hdBonus,
      damageType:'savage', abstract:true, heavyHelm:false, treatmentTiming:'', healingMagicLevel:0,
      pickBand:false, conditionId:'in-shock', healedToOneHp:true, magicalHealing:false, result:null
    };
  },
  closeRecordWoundModal(){ this.recordWound.open = false; this.recordWound.result = null; },
  woundDamageTypes(){ return (window.ACKS && window.ACKS.DAMAGE_TYPES) || ['savage']; },
  woundConditions(){ return ((window.ACKS && window.ACKS.MORTAL_WOUND_CONDITIONS) || []).map(b => ({ id: b.id, label: b.label })); },
  woundTimingOptions(){ const m = (window.ACKS && window.ACKS.TREATMENT_TIMING_LABELS) || {}; return Object.keys(m).map(k => ({ key: k, label: m[k] })); },
  woundConvalescenceDays(ch){ const A = window.ACKS; return (A && A.characterConvalescence) ? A.characterConvalescence(ch).daysRemaining : 0; },
  recordWoundRoll(){
    const rw = this.recordWound; const camp = this.currentCampaign;
    if(!camp){ this.showToast('No campaign loaded.'); return; }
    const ch = (camp.characters || []).find(c => c.id === rw.characterId);
    if(!ch){ this.showToast('Character not found.'); return; }
    const opts = { damageType: rw.damageType, abstract: rw.abstract, heavyHelm: rw.heavyHelm };
    if(!rw.abstract){
      if(rw.treatmentTiming) opts.treatmentTiming = rw.treatmentTiming;
      if(rw.healingMagicLevel) opts.healingMagicLevel = Number(rw.healingMagicLevel) || 0;
    }
    if(rw.pickBand) opts.conditionId = rw.conditionId;
    try { rw.result = window.ACKS.rollMortalWound(ch, opts); }
    catch(e){ this.showToast('Roll failed: ' + e.message); }
  },
  recordWoundApply(){
    const rw = this.recordWound;
    if(!rw.result){ this.showToast('Roll first, then apply.'); return; }
    const camp = this.currentCampaign;
    if(!camp){ this.showToast('No campaign loaded.'); return; }
    try {
      const rec = window.ACKS.applyMortalWound(camp, rw.characterId, rw.result, { healedToOneHp: rw.healedToOneHp, magicalHealing: rw.magicalHealing });
      if(!rec){ this.showToast('Could not apply the wound.'); return; }
      this.showToast(rec.outcome === 'killed' ? (rw.charName + ' is slain.') : (rw.charName + ' — ' + (rec.conditionLabel || 'wounded') + '.'));
      this.closeRecordWoundModal();
    } catch(e){ this.showToast('Apply failed: ' + e.message); }
  },
  // ── agent-4 (DC-3) state + methods ──
  // DC-3 (RR pp.350-351) — the per-band morale EFFECTS for the Morale block's "Effects this month"
  // readout. A thin null-safe pass-through to the engine's SINGLE-source accessor
  // (ACKS.domainMoraleEffects); the recruitment / vassal-loyalty / conscript / spy-thief consumers
  // read the SAME accessor, so the readout and those consumers can never drift. Reactive: the engine
  // reads d.demographics.morale on the Alpine proxy inside x-effect, so the box recomputes on a
  // morale change (the domainAdvancementReadout pattern).
  domainMoraleEffects(d){
    const A = window.ACKS;
    if(!A || typeof A.domainMoraleEffects !== 'function' || !d) return null;
    return A.domainMoraleEffects(this.currentCampaign, d);
  },
  // Military W7 (conscripts/militia) UI → domain-app-military-w7.js (T5 chip 6, 2026-06-23)
  // Mounts (Phase 2.5 MO-4) UI → domain-app-mounts.js (T5 chip 6, 2026-06-23)
  // Voyages V6 (Vessel/voyage) UI → domain-app-voyages.js (T5 chip 6, 2026-06-23)
  // TEAM BURST5 state + methods → domain-app-burst5.js (T5 chip 5, 2026-06-23)
  // Recruitment (hirelings + realm-scale) UI → domain-app-recruit.js (T5 chip 8, 2026-06-23)
  // Map Mode UI → domain-app-map.js (T5 chip 8, 2026-06-23)
  // Encounters / Lairs / bestiary UI → domain-app-encounters.js (T5 chip 8, 2026-06-23)
  // Warfare (armies / battles / sieges / units) UI → domain-app-warfare.js (T5 chip 8, 2026-06-23)
  // Journeys / travel UI → domain-app-journeys.js (T5 chip 8, 2026-06-23)
  // Entity Inspector UI → domain-app-inspector.js (T5 chip 8, 2026-06-23)
  // Trade Wizard (buy/sell at market) UI → domain-app-trade.js (T5 chip 8, 2026-06-23)
  // Gladiators / arena UI → domain-app-gladiators.js (T5 chip 8, 2026-06-23)
  // Magic Research UI → domain-app-magic-research.js (T5 chip 8, 2026-06-23)
  // NPC Generators UI → domain-app-generators.js (T5 chip 8, 2026-06-23)
  // Construction Wizard UI → domain-app-construction.js (T5 chip 8, 2026-06-23)
  // Chronicle / narrative log UI → domain-app-chronicle.js (T5 chip 8, 2026-06-23)
  // Syndicates (hijinks) UI → domain-app-syndicates.js (T5 chip 8, 2026-06-23)
  // Banking & Loans UI → domain-app-banking.js (T5 chip 8, 2026-06-23)
};
return _acksApplyAppMixins(_component);
}
