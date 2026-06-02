/* =============================================================================
 * acks-engine-subsystems.js — ACKS God Mode Subsystem Modules (Module 2)
 *
 * Extracted from acks-engine.js §9.53–§9.6 on 2026-05-28 as part of the
 * engine-split polish work. Covers:
 *   - §9.53 Calendar (Phase 2.95, default + Auran)
 *   - §9.54 Hirelings & loyalty (Phase 2.95)
 *   - §9.55 Rumors (Phase 2.8 + What's the Word)
 *   - §9.56 Markets & Merchandise (Phase 2.9)
 *   - §9.6 Travel + encounter stubs (Phase 2.6.7)
 *
 * Each subsystem uses helpers from acks-engine-catalogs.js (HOUSERULES_REGISTRY
 * lookups) and from acks-engine.js (newId, factories). All access is via
 * global.ACKS. This module loads LAST in index.html (catalogs → engine →
 * entities → entity-registry → field-schemas → events → subsystems), so every
 * engine helper is already present on global.ACKS by the time these functions run.
 *
 * Load order: AFTER acks-engine-catalogs.js, AFTER acks-engine.js so that
 * global.ACKS.newId etc. are available at runtime when subsystem functions
 * are invoked.
 * =============================================================================
 */
(function(global){
'use strict';

// Local aliases for hot symbols the subsystems use frequently.
// At call-time, global.ACKS.X is the canonical access pattern.
const newId               = function(prefix){ return global.ACKS.newId(prefix); };
const registerEventHandler = function(kind, handler){ return global.ACKS.registerEventHandler(kind, handler); };
const addRumorReach        = function(rumor, settlementId, apparentLevel, turn, source){ return global.ACKS.addRumorReach(rumor, settlementId, apparentLevel, turn, source); };
const newEvent             = function(kind, opts){ return global.ACKS.newEvent(kind, opts); };
const SCHEMA_VERSION = 2; // mirror of acks-engine.js core constant
const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES||{})[key]; } });

// =============================================================================
// 9.53 CALENDAR (Phase 2.95 — Auran calendar gated by 'auran-calendar' house rule)
// =============================================================================
// See Phase_2.95_Calendar_Plan.md.

const CALENDARS = Object.freeze({
  'default': Object.freeze({
    id: 'default',
    name: 'Real-life-style monthly',
    months: Object.freeze([
      Object.freeze({ id:1, name:'Month 1', days:30 }),
      Object.freeze({ id:2, name:'Month 2', days:30 }),
      Object.freeze({ id:3, name:'Month 3', days:30 }),
      Object.freeze({ id:4, name:'Month 4', days:30 }),
      Object.freeze({ id:5, name:'Month 5', days:30 }),
      Object.freeze({ id:6, name:'Month 6', days:30 }),
      Object.freeze({ id:7, name:'Month 7', days:30 }),
      Object.freeze({ id:8, name:'Month 8', days:30 }),
      Object.freeze({ id:9, name:'Month 9', days:30 }),
      Object.freeze({ id:10, name:'Month 10', days:30 }),
      Object.freeze({ id:11, name:'Month 11', days:30 }),
      Object.freeze({ id:12, name:'Month 12', days:30 })
    ]),
    daysPerYear: 360,
    seasons: Object.freeze({ spring:[3,4,5], summer:[6,7,8], autumn:[9,10,11], winter:[12,1,2] }),
    festivals: Object.freeze([])
  }),
  'auran': Object.freeze({
    id: 'auran',
    name: 'Auran Empire calendar',
    // Approximate month names — refine against canonical source materials when GM is available.
    months: Object.freeze([
      Object.freeze({ id:1, name:'Mosadios', days:30 }),
      Object.freeze({ id:2, name:'Stragalios', days:30 }),
      Object.freeze({ id:3, name:'Sutekos', days:30 }),
      Object.freeze({ id:4, name:'Korokakos', days:30 }),
      Object.freeze({ id:5, name:'Lemnoros', days:30 }),
      Object.freeze({ id:6, name:'Bouzioros', days:30 }),
      Object.freeze({ id:7, name:'Argosthes', days:30 }),
      Object.freeze({ id:8, name:'Hyperberetios', days:30 }),
      Object.freeze({ id:9, name:'Skirophoros', days:30 }),
      Object.freeze({ id:10, name:'Pyanepsion', days:30 }),
      Object.freeze({ id:11, name:'Boedromion', days:30 }),
      Object.freeze({ id:12, name:'Anthesterion', days:30 })
    ]),
    daysPerYear: 360,
    seasons: Object.freeze({ spring:[2,3,4], summer:[5,6,7], autumn:[8,9,10], winter:[11,12,1] }),
    festivals: Object.freeze([
      Object.freeze({ day: 1, month: 1, name: 'Empire Day' }),
      Object.freeze({ day: 21, month: 6, name: 'Midsummer Feast' })
    ])
  })
});

function calendarFor(campaign){
  if(!campaign || !campaign.calendar) return CALENDARS['default'];
  const kind = campaign.calendar.kind || 'default';
  return CALENDARS[kind] || CALENDARS['default'];
}

function monthName(campaign, monthNumber){
  const cal = calendarFor(campaign);
  const m = (cal.months||[]).find(x => x.id === monthNumber);
  return m ? m.name : ('Month ' + monthNumber);
}

function seasonFor(campaign, monthNumber){
  const cal = calendarFor(campaign);
  const seasons = cal.seasons || {};
  for(const seasonName of Object.keys(seasons)){
    if((seasons[seasonName]||[]).indexOf(monthNumber) >= 0) return seasonName;
  }
  return 'unknown';
}

function currentDateString(campaign){
  if(!campaign || !campaign.calendar) return 'Year 1, Month 1';
  const cal = campaign.calendar;
  const y = cal.year || 1;
  const m = cal.month || 1;
  const d = cal.day || 1;
  // Default GM view is month-granularity (day always 1 post-monthly-advance). Sub-month
  // day info appears only when day > 1, e.g. for events that explicitly track days.
  const dayPart = (d && d > 1) ? (', Day ' + d) : '';
  return 'Year ' + y + ', ' + monthName(campaign, m) + dayPart;
}

function advanceCalendarOneMonth(campaign){
  if(!campaign || !campaign.calendar) return;
  let m = campaign.calendar.month || 1;
  let y = campaign.calendar.year || 1;
  m += 1;
  if(m > 12){ m = 1; y += 1; }
  campaign.calendar.month = m;
  campaign.calendar.year = y;
  campaign.calendar.day = 1; // default to day 1 of the new month
  campaign.calendar.season = seasonFor(campaign, m);
}

// Advance the global day clock by one day within the current month (Calendar §10.1).
// Does NOT roll over to the next month — month rollover is the monthly commit's job
// (commitTurn -> runDayTickToMonthEnd). Clamps at day 30 (the month length). Returns the
// new currentDayInMonth.
function advanceCalendarOneDay(campaign){
  if(!campaign) return 1;
  let d = campaign.currentDayInMonth || 1;
  if(d < 30) d += 1;
  campaign.currentDayInMonth = d;
  if(campaign.calendar) campaign.calendar.day = d;
  return d;
}

// =============================================================================
// 9.54 HIRELINGS & LOYALTY (Phase 2.95)
// =============================================================================
// See Phase_2.95_Hirelings_Plan.md.

// Roll a loyalty check per RR. Returns one of: 'rebellion'|'discontent'|'hesitant'|'loyal'|'fanatic'.
// Loyalty score from -2 (rebellious) to +4 (fanatic). Roll 2d6 + loyalty + mod; cross-reference table.
function rollLoyaltyCheck(character, modifier){
  if(!character) return null;
  const loyalty = (typeof character.loyalty === 'number') ? character.loyalty : 0;
  const roll = (1 + Math.floor(Math.random()*6)) + (1 + Math.floor(Math.random()*6));
  const total = roll + loyalty + (modifier || 0);
  // Rough RAW table summary:
  let outcome;
  if(total <= 2) outcome = 'rebellion';
  else if(total <= 5) outcome = 'discontent';
  else if(total <= 8) outcome = 'hesitant';
  else if(total <= 11) outcome = 'loyal';
  else outcome = 'fanatic';
  return { roll, modifier: modifier||0, loyalty, total, outcome };
}

// --- recruit-hireling handler (Phase 2.95 §4.2 / §310.3) ---
// Full recruitment workflow. Three branches by hireCategory:
//   - 'mercenary'   : count-level hire. Updates or creates a garrison unit
//                     on the patron's ruled domain. Optional commander gets
//                     set if commandUnitId is supplied with one candidate.
//   - 'henchman'    : individual hires. Upgrades each candidate from
//   - 'specialist'  : individual hires.
//                     kind='candidate' → 'henchman'/'specialist', sets
//                     liegeCharacterId, wage, starting loyalty (CHA + BoAK +
//                     élan bonus), pushes a recruitment history entry,
//                     and fills any roleToFill slot (magistrate or unit).
// Rejected candidates also get a history entry recording the rejection
// (Joachim 2026-05-28: track ALL hiring situations including rejections).
// Narrative helpers for the recruit-hireling handler — resolve labels and names
// without coupling to UI code.
function __resolveLabel(category, typeId){
  const ACKS = global.ACKS; if(!ACKS) return typeId || '';
  let table = null;
  if(category === 'mercenary')  table = ACKS.HIRELING_MERCENARIES;
  else if(category === 'henchman')   table = ACKS.HIRELING_HENCHMEN;
  else if(category === 'specialist') table = ACKS.HIRELING_SPECIALISTS;
  if(!table) return typeId || '';
  const row = table.find(r => r.id === typeId);
  return row ? row.label : (typeId || '');
}
function __resolveSettlementName(campaign, settlementId){
  if(!campaign || !settlementId) return settlementId || '';
  // Search top-level collection first.
  if(Array.isArray(campaign.settlements)){
    const top = campaign.settlements.find(s => s && s.id === settlementId);
    if(top && top.name) return top.name;
  }
  // Fall back to per-hex embedded settlements.
  for(const d of (campaign.domains||[])){
    for(const h of (d.geography && d.geography.hexes || [])){
      if(h && h.settlement && (h.settlement.id === settlementId || (d.id + ':' + (h.coord ? h.coord.q + ',' + h.coord.r : ''))  === settlementId)){
        return h.settlement.name || settlementId;
      }
    }
  }
  return settlementId;
}

// _autoEmitRecruitmentNotability — emits a civic rumor when a recruitment
// session's expenditure crosses the settlement's transaction threshold.
// Gated by the 'recruitment-notability' house rule (+ rumors-auto-emit
// inside _autoEmitRumor). Called from applyEvent_recruitHireling after the
// hire is applied.
//
// opts: { settlementId, patronCharacterId, totalExpenditure, narrativeSummary,
//         hireCategory, hireTypeId, sourceEventId }
function _autoEmitRecruitmentNotability(campaign, opts){
  if(!campaign || !opts || !opts.settlementId) return null;
  // §310.3f-fix26 — route through ACKS.isHouseRuleEnabled so the
  // {enabled: bool} shape is honored.
  if(!global.ACKS || !global.ACKS.isHouseRuleEnabled || !global.ACKS.isHouseRuleEnabled(campaign, 'recruitment-notability')) return null;
  // Find settlement — try top-level collection first, then per-hex.
  let settlement = null;
  if(Array.isArray(campaign.settlements)){
    settlement = campaign.settlements.find(s => s && s.id === opts.settlementId);
  }
  if(!settlement){
    for(const d of (campaign.domains||[])){
      const hexes = (d.geography && d.geography.hexes) || [];
      for(const h of hexes){
        if(h && h.settlement && h.settlement.id === opts.settlementId){
          settlement = h.settlement;
          break;
        }
      }
      if(settlement) break;
    }
  }
  if(!settlement) return null;
  const ACKS = global.ACKS;
  const threshold = (ACKS && ACKS.computeTransactionThreshold)
    ? ACKS.computeTransactionThreshold(settlement)
    : Math.floor((settlement.families || 0) * 0.5);
  if((opts.totalExpenditure || 0) < threshold) return null;
  // Build rumor text — reuse the narrative as the recognizable detail.
  const baseNarrative = opts.narrativeSummary || (((campaign.characters||[]).find(c => c.id === opts.patronCharacterId)?.name) || 'A patron') + ' was active in the market.';
  const rumorText = baseNarrative + " The transaction drew notice from the market's notables.";
  if(!(ACKS && typeof ACKS._autoEmitRumor === 'function')) return null;
  return ACKS._autoEmitRumor(campaign, {
    settlementId: opts.settlementId,
    rumorText,
    apparentLevel: 'uncommon',
    truthLevel: 'true',
    topic: 'civic',
    sourceEventId: opts.sourceEventId || null,
    sourceCharacterId: opts.patronCharacterId || null,
    submittedBy: 'engine'
  });
}

// findPersistentCandidates — locates individuated NPCs still available in a
// market matching the current solicit filter. Used by the
// persistent-hireling-candidates house rule (§310.4) to surface "the world
// remembers" candidates alongside fresh rolls.
//
// opts: { settlementId, hireCategory, hireTypeId, classRequired }
// Returns: Character[] (still kind='candidate', alive, matching provenance)
function findPersistentCandidates(campaign, opts){
  opts = opts || {};
  if(!campaign || !opts.settlementId) return [];
  if(!Array.isArray(campaign.characters)) return [];
  return campaign.characters.filter(c => {
    if(!c) return false;
    if(c.alive === false) return false;
    if(!global.ACKS.isCandidate(c)) return false;
    const prov = c.recruitmentProvenance;
    if(!prov || prov.settlementId !== opts.settlementId) return false;
    if(opts.hireTypeId  && prov.hireTypeId   !== opts.hireTypeId)  return false;
    if(opts.hireCategory && prov.hireCategory !== opts.hireCategory) return false;
    if(opts.classRequired && c.class && c.class !== opts.classRequired) return false;
    return true;
  });
}

const RECRUITMENT_ROLE_SLOTS = Object.freeze(['captainOfGuard','chaplain','munerator','steward']);

function applyEvent_recruitHireling(campaign, event){
  const ACKS = global.ACKS;
  const p = event.payload || {};
  if(!p.patronCharacterId) throw new Error('recruit-hireling: missing patronCharacterId');
  if(!p.hireCategory)      throw new Error('recruit-hireling: missing hireCategory');
  if(!p.hireTypeId)        throw new Error('recruit-hireling: missing hireTypeId');
  const patron = (campaign.characters||[]).find(c => c.id === p.patronCharacterId);
  if(!patron) throw new Error('recruit-hireling: unknown patronCharacterId: ' + p.patronCharacterId);

  const turn = event.targetTurn || event.appliedAtTurn || campaign.currentTurn || 1;
  const aMod = (ACKS && ACKS.abilityMod) ? ACKS.abilityMod : (s => Math.floor(((s||10) - 10) / 2));

  // ─── Branch 1: mercenary count-level hire ─────────────────────────────────
  // Destination policy:
  //   - If patron.id rules a domain → unit goes into that domain's garrison
  //     (default — landed-lord case).
  //   - Else → unit goes into patron.mercenaryCompany.units (landless-patron
  //     case — adventurer / venturer / wandering captain).
  // The payload may force the landless path with destinationKind='company'
  // for a landed lord who wants a private retinue separate from garrison.
  if(p.hireCategory === 'mercenary'){
    const ruledDomain = (campaign.domains||[]).find(d => d.rulerCharacterId === patron.id);
    const wantsCompany = (p.destinationKind === 'company') || !ruledDomain;
    const addCount = Number(p.count || 1);
    const typeLabel = (typeof __resolveLabel === 'function') ? __resolveLabel('mercenary', p.hireTypeId) : p.hireTypeId;
    const setName = (typeof __resolveSettlementName === 'function' && p.settlementId) ? __resolveSettlementName(campaign, p.settlementId) : (p.settlementId || '');

    let destNarr = '';
    let unitId = null;
    let domainsChanged = [];

    // Look up the catalog row's displayName for the unit.
    const ACKS3 = global.ACKS;
    const rowForLabel = (ACKS3 && ACKS3.HIRELING_MERCENARIES || []).find(r => r.id === p.hireTypeId);
    const unitDisplayName = (rowForLabel && rowForLabel.label) || p.hireTypeId;
    if(wantsCompany){
      if(!patron.mercenaryCompany) patron.mercenaryCompany = { units: [] };
      if(!Array.isArray(patron.mercenaryCompany.units)) patron.mercenaryCompany.units = [];
      // #548 — targetGarrisonUnitId payload field. '__new__' = force create even if same-type exists.
      // Specific id = use that unit directly. Unset = auto-find first same-type sibling (legacy behavior).
      let unit;
      if(p.targetGarrisonUnitId === '__new__'){
        unit = null;
      } else if(p.targetGarrisonUnitId){
        unit = patron.mercenaryCompany.units.find(u => u.id === p.targetGarrisonUnitId);
        if(!unit) unit = patron.mercenaryCompany.units.find(u => u.unitTypeKey === p.hireTypeId);
      } else {
        unit = patron.mercenaryCompany.units.find(u => u.unitTypeKey === p.hireTypeId);
      }
      if(!unit){
        unit = {
          schemaVersion: 2,
          id: newId('gar'),
          name: '',
          unitTypeKey: p.hireTypeId,
          count: 0,
          monthlyWage: 0,           // race-keyed; pending Phase 3 DaW wage table
          brPerSoldier: 0,          // pending
          stationedAtHexId: patron.currentHexId || null,
          commanderCharacterId: null,
          recruitedAt: p.settlementId || null
        };
        patron.mercenaryCompany.units.push(unit);
      }
      unit.count = Number(unit.count || 0) + addCount;
      if(p.commandUnitId === unit.id && Array.isArray(p.candidateIds) && p.candidateIds[0]){
        unit.commanderCharacterId = p.candidateIds[0];
      }
      unitId = unit.id;
      destNarr = "into " + (patron.name || 'patron') + "'s company";
    } else {
      // Write to the EXISTING domain.garrison.units structure (matches what the UI reads).
      if(!ruledDomain.garrison) ruledDomain.garrison = { units: [] };
      if(!Array.isArray(ruledDomain.garrison.units)) ruledDomain.garrison.units = [];
      // #548 — targetGarrisonUnitId payload field. See merc-company branch above.
      let unit;
      if(p.targetGarrisonUnitId === '__new__'){
        unit = null;
      } else if(p.targetGarrisonUnitId){
        unit = ruledDomain.garrison.units.find(u => u.id === p.targetGarrisonUnitId);
        if(!unit) unit = ruledDomain.garrison.units.find(u => u.unitTypeKey === p.hireTypeId);
      } else {
        unit = ruledDomain.garrison.units.find(u => u.unitTypeKey === p.hireTypeId);
      }
      if(!unit){
        unit = {
          schemaVersion: 2,
          id: newId('gar'),
          name: '',
          unitTypeKey: p.hireTypeId,
          count: 0,
          monthlyWage: 0,           // race-keyed; pending
          brPerSoldier: 0,          // pending
          stationedAtHexId: patron.currentHexId || null,
          commanderCharacterId: null
        };
        ruledDomain.garrison.units.push(unit);
      }
      unit.count = Number(unit.count || 0) + addCount;
      if(p.commandUnitId === unit.id && Array.isArray(p.candidateIds) && p.candidateIds[0]){
        unit.commanderCharacterId = p.candidateIds[0];
      }
      unitId = unit.id;
      domainsChanged = [ruledDomain.id];
      destNarr = 'for ' + ruledDomain.name;
    }

    if(!Array.isArray(patron.history)) patron.history = [];
    patron.history.push({
      turn, type: 'recruitment',
      summary: patron.name + ' hired ' + addCount + ' ' + typeLabel + ' ' + destNarr + (setName ? ' (from ' + setName + ')' : ''),
      extra: { action: 'hired-unit', hireCategory: 'mercenary', hireTypeId: p.hireTypeId, count: addCount, settlementId: p.settlementId || null, monthlyOffered: p.monthlyOffer || 0, unitId, destinationKind: wantsCompany ? 'company' : 'garrison' }
    });

    const mercNarrative = patron.name + ' hired ' + addCount + ' ' + typeLabel + (setName ? ' in ' + setName : '') + ' ' + destNarr + '.';
    // Recruitment-Notability hook (§347). Wage × count for mercenaries.
    const wageRaw = (typeof row !== 'undefined' && row && typeof row.wage === 'number') ? row.wage : 0;
    let row_merc = null;
    if(global.ACKS && global.ACKS.HIRELING_MERCENARIES){
      row_merc = global.ACKS.HIRELING_MERCENARIES.find(rr => rr.id === p.hireTypeId);
    }
    const wagePerSoldier = (row_merc && typeof row_merc.wage === 'number') ? row_merc.wage : (typeof p.monthlyOffer === 'number' ? p.monthlyOffer : 0);
    _autoEmitRecruitmentNotability(campaign, {
      settlementId: p.settlementId,
      patronCharacterId: patron.id,
      totalExpenditure: addCount * wagePerSoldier,
      narrativeSummary: mercNarrative,
      hireCategory: 'mercenary',
      hireTypeId: p.hireTypeId,
      sourceEventId: event.id
    });
    return {
      result: {
        domainsChanged, charactersChanged: [patron.id], hexesChanged: [],
        treasuryDelta: 0,
        narrativeSummary: mercNarrative,
        unitId, count: addCount,
        destinationKind: wantsCompany ? 'company' : 'garrison'
      }
    };
  }

  // ─── Branch 2: individual hires (henchman / specialist) ──────────────────
  const charactersChanged = [patron.id];
  const candidateIds = Array.isArray(p.candidateIds) ? p.candidateIds : [];
  const rejectedIds  = Array.isArray(p.rejectedCandidateIds) ? p.rejectedCandidateIds : [];
  const hiredIds = [];

  // Defensive henchman-cap check (RR p.164). The UI guards against this too,
  // but the engine is the source of truth.
  if(p.hireCategory === 'henchman' && candidateIds.length > 0){
    const ACKS2 = global.ACKS;
    const cap = (ACKS2 && ACKS2.computeHenchmanCap) ? ACKS2.computeHenchmanCap(patron) : Math.max(0, aMod(patron.abilities && patron.abilities.CHA || 10) + 4);
    const currentlyServing = (campaign.characters||[]).filter(c => c.liegeCharacterId === patron.id && global.ACKS.isHenchman(c) && global.ACKS.isActive(c)).length;
    if(currentlyServing + candidateIds.length > cap){
      throw new Error('Patron at henchman cap (' + currentlyServing + ' / ' + cap + '). Release a current henchman before recruiting more.');
    }
  }

  for(const cid of candidateIds){
    const cand = (campaign.characters||[]).find(c => c.id === cid);
    if(!cand) continue;
    // Allow re-hiring of an already-individuated candidate even if kind got set
    // to 'candidate' earlier. Tolerate kind === 'candidate' or unset.
    const targetKind = (p.hireCategory === 'henchman') ? 'henchman'
                     : (p.hireCategory === 'specialist') ? 'specialist'
                     : 'hireling';
    // #453 — c.kind retired; canonical five-axis fields are the source of truth.
    // Promotion flips lifecycle 'candidate' → 'active' and ensures socialTier
    // matches the final tier (in case hireCategory drifts from it).
    cand.socialTier = targetKind;
    cand.lifecycleState = 'active';
    cand.liegeCharacterId = patron.id;
    if(typeof p.monthlyOffer === 'number') cand.monthlyWage = p.monthlyOffer;

    // Starting loyalty: base 0 + CHA mod + Blood of Ancient Kings + élan bonus.
    let loy = 0;
    loy += aMod(patron.abilities && patron.abilities.CHA || 10);
    if(Array.isArray(patron.classPowers) && patron.classPowers.some(cp => /Blood of Ancient Kings/i.test(cp))) loy += 1;
    if(p.reactionBandKey === 'accept-elan') loy += 1;
    cand.loyalty = Math.max(-4, Math.min(4, loy));

    // Candidate history.
    if(!Array.isArray(cand.history)) cand.history = [];
    cand.history.push({
      turn, type: 'recruitment',
      summary: cand.name + ' was hired by ' + (patron.name||'(?)') + ' at ' + (p.monthlyOffer||0) + ' gp/mo' + (p.reactionBandKey === 'accept-elan' ? ' (accepted with élan)' : ''),
      extra: { action: 'hired', patronCharacterId: patron.id, settlementId: p.settlementId || null, monthlyOffered: p.monthlyOffer || 0, rollResult: p.rollResult || null, bandKey: p.reactionBandKey || null }
    });

    // Role assignment.
    if(p.roleToFill && RECRUITMENT_ROLE_SLOTS.indexOf(p.roleToFill) >= 0 && p.roleDomainId){
      const dom = (campaign.domains||[]).find(d => d.id === p.roleDomainId);
      if(dom){
        if(!dom.magistrates) dom.magistrates = {};
        if(!dom.magistrates[p.roleToFill]) dom.magistrates[p.roleToFill] = {};
        dom.magistrates[p.roleToFill].characterId = cand.id;
      }
    }
    if(p.roleToFill === 'unit-command' && p.commandUnitId){
      // Find the unit across all domains.
      for(const dom of (campaign.domains||[])){
        const u = (dom.garrisonUnits||[]).find(x => x.id === p.commandUnitId);
        if(u){ u.commanderCharacterId = cand.id; break; }
      }
    }

    charactersChanged.push(cand.id);
    hiredIds.push(cand.id);
  }

  // Rejection history entries — Joachim 2026-05-28 design: record ALL hiring
  // situations, including rejections.
  for(const cid of rejectedIds){
    const cand = (campaign.characters||[]).find(c => c.id === cid);
    if(!cand) continue;
    if(!Array.isArray(cand.history)) cand.history = [];
    cand.history.push({
      turn, type: 'recruitment',
      summary: cand.name + ' rejected offer from ' + (patron.name||'(?)') + ' at ' + (p.monthlyOffer||0) + ' gp/mo',
      extra: { action: 'rejected', patronCharacterId: patron.id, settlementId: p.settlementId || null, monthlyOffered: p.monthlyOffer || 0, rollResult: p.rollResult || null, bandKey: p.reactionBandKey || null }
    });
    charactersChanged.push(cand.id);
  }

  // Patron-side summary entry.
  if(!Array.isArray(patron.history)) patron.history = [];
  patron.history.push({
    turn, type: 'recruitment',
    summary: patron.name + ' soliciting in ' + (p.settlementId||'(market)') + ': hired ' + hiredIds.length + (rejectedIds.length ? ', rejected by ' + rejectedIds.length : ''),
    extra: { action: 'patron-summary', hireCategory: p.hireCategory, hireTypeId: p.hireTypeId, settlementId: p.settlementId||null, monthlyOffered: p.monthlyOffer||0, candidateIds: hiredIds, rejectedCandidateIds: rejectedIds }
  });

  const individualNarrative = (function(){
        const setName = (typeof __resolveSettlementName === 'function' && p.settlementId) ? __resolveSettlementName(campaign, p.settlementId) : (p.settlementId || '');
        const hiredNames = hiredIds.map(id => {
          const c = (campaign.characters||[]).find(x => x.id === id);
          if(!c) return id;
          const prof = (typeof __resolveLabel === 'function') ? __resolveLabel(p.hireCategory, p.hireTypeId) : '';
          return c.name + (prof ? ' (' + prof + ')' : '');
        });
        const refusedNames = rejectedIds.map(id => {
          const c = (campaign.characters||[]).find(x => x.id === id);
          return c ? c.name : id;
        });
        let s = (patron.name||'(?)');
        if(hiredIds.length === 0 && rejectedIds.length === 0){
          s += ' soliciting' + (setName ? ' in ' + setName : '') + ' produced no decisions.';
        } else if(hiredIds.length === 0){
          s += ' solicited' + (setName ? ' in ' + setName : '') + ', refused by ' + (refusedNames.length <= 3 ? refusedNames.join(', ') : (refusedNames.length + ' candidates')) + '.';
        } else {
          s += ' hired ' + (hiredNames.length <= 3 ? hiredNames.join(', ') : (hiredIds.length + ' ' + p.hireCategory + 's (' + hiredNames.slice(0,3).join(', ') + ', …)'));
          if(p.roleToFill && p.roleDomainId){
            const dom = (campaign.domains||[]).find(d => d.id === p.roleDomainId);
            const roleLabels = { captainOfGuard:'Captain of the Guard', chaplain:'Chaplain', munerator:'Munerator', steward:'Steward', 'unit-command':'unit commander' };
            const roleLabel = roleLabels[p.roleToFill] || p.roleToFill;
            s += ' as ' + roleLabel + (dom ? ' of ' + dom.name : '');
          }
          if(setName) s += ' in ' + setName;
          if(refusedNames.length > 0) s += '; refused by ' + (refusedNames.length <= 3 ? refusedNames.join(', ') : (refusedNames.length + ' candidates'));
          s += '.';
        }
        return s;
      })();
  // Recruitment-Notability hook (§347). Wage × hired count for individual hires.
  const individualWage = (typeof p.monthlyOffer === 'number') ? p.monthlyOffer : 0;
  _autoEmitRecruitmentNotability(campaign, {
    settlementId: p.settlementId,
    patronCharacterId: patron.id,
    totalExpenditure: hiredIds.length * individualWage,
    narrativeSummary: individualNarrative,
    hireCategory: p.hireCategory,
    hireTypeId: p.hireTypeId,
    sourceEventId: event.id
  });
  return {
    result: {
      domainsChanged: [], charactersChanged, hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: individualNarrative,

      hiredCandidateIds: hiredIds,
      rejectedCandidateIds: rejectedIds
    }
  };
}
registerEventHandler('recruit-hireling', applyEvent_recruitHireling);

// --- loyalty-check handler ---
// Apply a Loyalty Roll outcome (RR p.168). The roll itself happens at modal
// time — by the time we reach commit, payload.rollResult holds the rolled
// outcome. The handler:
//   1. Reads rollResult.loyaltyDelta and applies it to character.loyalty (clamped -4..+4 per RAW p.166)
//   2. Pushes a structured entry to character.loyaltyHistory[]
//   3. Builds a RAW-flavoured narrativeSummary
// If rollResult is missing (rare — only happens if a pending event is committed
// without resolution via the modal), the handler falls back to a single random
// roll using rollLoyalty so something still commits cleanly.
function applyEvent_loyaltyCheck(campaign, event){
  const p = event.payload || {};
  const ch = (campaign.characters||[]).find(x => x.id === p.characterId);
  if(!ch) throw new Error('loyalty-check: unknown characterId: '+p.characterId);
  let rr = p.rollResult;
  if(!rr || typeof rr !== 'object'){
    // Fallback: roll inline. Pending events committed without modal resolution land here.
    rr = (typeof rollLoyalty === 'function')
      ? rollLoyalty(ch.loyalty||0, p.modifier||0)
      : rollLoyaltyCheck(ch, p.modifier);  // legacy fallback if the new helper isn't loaded
  }
  const delta = Number(rr.loyaltyDelta || 0);
  const before = Number(ch.loyalty || 0);
  const after = Math.max(-4, Math.min(4, before + delta));  // RAW caps loyalty at -4..+4
  ch.loyalty = after;
  if(!Array.isArray(ch.loyaltyHistory)) ch.loyaltyHistory = [];
  ch.loyaltyHistory.push({
    turn: event.targetTurn || event.appliedAtTurn || campaign.currentTurn || 1,
    delta: after - before,
    reason: p.reason || '(no reason given)',
    reasonNote: p.reasonNote || '',
    rollResult: rr,
    outcome: rr.bandKey || rr.outcome || '(unknown)',
    newValue: after
  });
  const bandLabel = rr.bandLabel || rr.outcome || 'rolled';
  const breakdown = (rr.natRoll != null)
    ? 'nat ' + rr.natRoll + ' (' + rr.d1 + '+' + rr.d2 + ') + loy ' + (rr.loyaltyScore||0) + ' + mod ' + (rr.situationalModifier||0) + ' = ' + rr.adjusted
    : '(rolled ' + (rr.total || '?') + ')';
  const deltaStr = (delta > 0 ? ' (loyalty +' + delta + ' → ' + after + ')'
                  : delta < 0 ? ' (loyalty ' + delta + ' → ' + after + ')'
                              : '');
  const reasonStr = p.reason ? ' following ' + p.reason : '';
  return {
    result: {
      domainsChanged: [], charactersChanged: [ch.id], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: (ch.name||'(?)') + ' rolled ' + bandLabel + reasonStr + ': ' + breakdown + deltaStr + '.',
      loyaltyCheckResult: rr
    }
  };
}
registerEventHandler('loyalty-check', applyEvent_loyaltyCheck);

// --- hireling-calamity handler (Phase 2.95 §3.6 / §4.1) ---
// Applies a calamity per RR p.166. RAW gives calamities a *standing* -1
// loyalty penalty AND triggers a loyalty roll, so the handler does both:
//   1. transfer-of-employment: rebase loyalty + morale on new employer per
//      RR p.165 and update liegeCharacterId.
//   2. Apply -1 calamity penalty to character.loyalty (clamped -4..+4).
//   3. Record to character.calamities[], character.loyaltyHistory[] (as a
//      drift entry with outcome='drift'), and character.history[].
//   4. Auto-emit a pending loyalty-check with reason='calamity' + reasonNote.
//      Store the new event's id in payload.loyaltyCheckEventId for traceability.
const CALAMITY_KIND_LABELS = Object.freeze({
  'rations':                'went without rations',
  'wages':                  'went without wages',
  'enervation':             'suffered an enervation',
  'curse':                  'suffered a curse',
  'magical-disease':        'suffered a magical disease',
  'hp-zero':                'was reduced to 0 hp',
  'transfer-of-employment': 'was transferred to a new employer',
  'hidden-comrades':        'discovered a previously-rejected comrade in the party',
  'other':                  'suffered a calamity'
});

function applyEvent_hirelingCalamity(campaign, event){
  const p = event.payload || {};
  const ch = (campaign.characters||[]).find(x => x.id === p.characterId);
  if(!ch) throw new Error('hireling-calamity: unknown characterId: '+p.characterId);
  const kind = p.kind;
  if(!kind) throw new Error('hireling-calamity: missing kind');
  const turn = event.targetTurn || event.appliedAtTurn || campaign.currentTurn || 1;

  const baseKindLabel = CALAMITY_KIND_LABELS[kind] || 'suffered a calamity';
  const charactersChanged = [ch.id];
  const narrativeBits = [];

  // (1) Transfer-of-employment rebase per RR p.165.
  // RAW: loyalty + morale immediately recalculated based on new employer's CHA,
  // proficiencies, and class powers. We approximate the recalc with the new
  // employer's CHA mod (+1 for Blood of Ancient Kings) as the new BASE loyalty,
  // and let the follow-on calamity penalty + loyalty roll do the rest.
  if(kind === 'transfer-of-employment'){
    const newEmpId = p.newEmployerCharacterId;
    if(!newEmpId) throw new Error('hireling-calamity: transfer-of-employment requires newEmployerCharacterId');
    const newEmp = (campaign.characters||[]).find(x => x.id === newEmpId);
    if(!newEmp) throw new Error('hireling-calamity: unknown newEmployerCharacterId: '+newEmpId);
    const oldEmpId = ch.liegeCharacterId;
    const oldEmp = oldEmpId ? (campaign.characters||[]).find(x => x.id === oldEmpId) : null;

    const aMod = (global.ACKS && global.ACKS.abilityMod) ? global.ACKS.abilityMod : (s => Math.floor((s - 10) / 2));
    const newCha = (newEmp.abilities && newEmp.abilities.CHA) || 10;
    const boakBonus = ((newEmp.classPowers||[]).some(cp => /Blood of Ancient Kings/i.test(cp))) ? 1 : 0;
    const newBaseLoyalty = Math.max(-4, Math.min(4, aMod(newCha) + boakBonus));
    ch.loyalty = newBaseLoyalty;
    ch.liegeCharacterId = newEmpId;
    if(p.previousEmployerCharacterId == null) p.previousEmployerCharacterId = oldEmpId || null;
    charactersChanged.push(newEmpId);
    if(oldEmpId && oldEmpId !== newEmpId) charactersChanged.push(oldEmpId);
    narrativeBits.push('loyalty rebased to ' + newBaseLoyalty + ' under ' + (newEmp.name||'new employer'));
  }

  // (2) -1 standing calamity penalty per RR p.166.
  const beforeLoy = Number(ch.loyalty || 0);
  const afterLoy = Math.max(-4, Math.min(4, beforeLoy - 1));
  const calamityDelta = afterLoy - beforeLoy; // typically -1 unless already at floor
  ch.loyalty = afterLoy;

  // (3a) character.calamities[] (ledger).
  if(!Array.isArray(ch.calamities)) ch.calamities = [];
  ch.calamities.push({
    turn,
    kind,
    severity: p.severity || 'normal',
    reasonNote: p.reasonNote || '',
    eventId: event.id,
    restoredTurn: null
  });

  // (3b) loyaltyHistory drift entry.
  if(!Array.isArray(ch.loyaltyHistory)) ch.loyaltyHistory = [];
  ch.loyaltyHistory.push({
    turn,
    delta: calamityDelta,
    reason: 'calamity',
    reasonNote: baseKindLabel + (p.reasonNote ? ' — ' + p.reasonNote : ''),
    rollResult: null,
    outcome: 'drift',
    newValue: afterLoy
  });

  // (3c) character.history entry.
  if(!Array.isArray(ch.history)) ch.history = [];
  ch.history.push({
    turn,
    type: 'note',
    summary: (ch.name||'(?)') + ' ' + baseKindLabel + ' (loyalty ' + beforeLoy + ' → ' + afterLoy + ')',
    extra: { kind, severity: p.severity || 'normal', calamityEventId: event.id }
  });

  // (4) Auto-emit follow-on loyalty-check.
  if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
  const followEv = newEvent('loyalty-check', {
    payload: {
      characterId: ch.id,
      reason: 'calamity',
      reasonNote: baseKindLabel + (p.reasonNote ? ' — ' + p.reasonNote : '')
    },
    submittedBy: 'engine',
    targetTurn: turn,
    parentEventId: event.id
  });
  campaign.pendingEvents.push(followEv);
  p.loyaltyCheckEventId = followEv.id;

  const summary = (ch.name||'(?)') + ' ' + baseKindLabel +
    ' (loyalty ' + beforeLoy + ' → ' + afterLoy + ')' +
    (narrativeBits.length ? '; ' + narrativeBits.join('; ') : '') +
    '. Loyalty roll pending.';

  return {
    result: {
      domainsChanged: [], charactersChanged, hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: summary,
      followOnEventId: followEv.id,
      calamityKind: kind,
      calamityDelta
    }
  };
}
registerEventHandler('hireling-calamity', applyEvent_hirelingCalamity);

// §310.6 — Loyalty drift ledger helper.
// Effective loyalty = clamp(base + permanentWoundPenalty + mortalityPenalty, -4, +4).
// Used by Loyalty Roll modal so wound/mortality penalties matter to actual rolls.
function computeEffectiveLoyalty(character){
  if(!character) return 0;
  const base      = Number(character.loyalty || 0);
  const wound     = Number(character.permanentWoundPenalty || 0);
  const mortality = Number(character.mortalityPenalty || 0);
  return Math.max(-4, Math.min(4, base + wound + mortality));
}

// --- hireling-restored handler (Phase 2.95 §4.5) ---
// Reverses ledger entries when a hireling is cured / restored.
function applyEvent_hirelingRestored(campaign, event){
  const p = event.payload || {};
  const ch = (campaign.characters||[]).find(x => x.id === p.characterId);
  if(!ch) throw new Error('hireling-restored: unknown characterId: '+p.characterId);
  const kind = p.restoredKind;
  if(!kind) throw new Error('hireling-restored: missing restoredKind');
  const turn = event.targetTurn || event.appliedAtTurn || campaign.currentTurn || 1;

  const before = computeEffectiveLoyalty(ch);
  let summary = '';
  if(kind === 'wound'){
    const prev = Number(ch.permanentWoundPenalty || 0);
    ch.permanentWoundPenalty = 0;
    summary = (ch.name||'(?)') + " was healed of a permanent wound (loyalty penalty " + prev + " → 0).";
  } else if(kind === 'mortality-side-effect'){
    const delta = Math.abs(Number(p.delta || 0));
    const prev = Number(ch.mortalityPenalty || 0);
    ch.mortalityPenalty = Math.min(0, prev + delta);
    summary = (ch.name||'(?)') + " was relieved of a Tampering side effect (mortality penalty " + prev + " → " + ch.mortalityPenalty + ").";
  } else if(kind === 'curse' || kind === 'disease' || kind === 'wage-paid' || kind === 'other'){
    summary = (ch.name||'(?)') + ' restoration recorded: ' + kind + (p.narrativeNotes ? ' — ' + p.narrativeNotes : '');
  } else {
    summary = (ch.name||'(?)') + ' restoration recorded: ' + kind;
  }
  const after = computeEffectiveLoyalty(ch);

  if(!Array.isArray(ch.history)) ch.history = [];
  ch.history.push({
    turn, type: 'note',
    summary,
    extra: { kind: 'hireling-restored', restoredKind: kind, narrativeNotes: p.narrativeNotes || '' }
  });

  if(!Array.isArray(ch.loyaltyHistory)) ch.loyaltyHistory = [];
  if(after !== before){
    ch.loyaltyHistory.push({
      turn,
      delta: after - before,
      reason: 'restoration',
      reasonNote: 'restored ' + kind,
      rollResult: null,
      outcome: 'restoration',
      newValue: after
    });
  }

  return {
    result: {
      domainsChanged: [], charactersChanged: [ch.id], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: summary,
      effectiveLoyaltyBefore: before,
      effectiveLoyaltyAfter:  after
    }
  };
}
registerEventHandler('hireling-restored', applyEvent_hirelingRestored);


// Loyalty drift tick — called from commitTurn per turn. Adjusts each henchman's loyalty by:
//   +1 if their wage was paid this turn and the ruler had treasury > 0
//   -1 if their wage was missed (domain went negative)
// Capped at -2..+4. Logs deltas to loyaltyHistory.
function tickHenchmanLoyalty(campaign, currentTurn){
  if(!campaign || !Array.isArray(campaign.characters)) return [];
  const drifts = [];
  campaign.characters.forEach(ch => {
    if(!ch.liegeCharacterId) return;     // only true henchmen (with a liege) drift
    if(typeof ch.loyalty !== 'number') ch.loyalty = 0;
    // Find the liege's domain (best-effort).
    const lordDomain = (campaign.domains||[]).find(d => d.rulerCharacterId === ch.liegeCharacterId);
    if(!lordDomain) return;
    const treasury = lordDomain.treasury?.gp || 0;
    const wage = ch.monthlyWage || 0;
    let delta = 0;
    let reason = '';
    if(wage > 0 && treasury >= 0){
      delta = 1; reason = 'wage paid; treasury solvent';
    } else if(wage > 0 && treasury < 0){
      delta = -1; reason = 'wage missed; treasury insolvent';
    }
    if(delta !== 0){
      const newLoyalty = Math.max(-2, Math.min(4, ch.loyalty + delta));
      const actualDelta = newLoyalty - ch.loyalty;
      if(actualDelta !== 0){
        ch.loyalty = newLoyalty;
        if(!Array.isArray(ch.loyaltyHistory)) ch.loyaltyHistory = [];
        ch.loyaltyHistory.push({ turn: currentTurn, delta: actualDelta, reason, newValue: newLoyalty });
        drifts.push({ characterId: ch.id, delta: actualDelta, reason, newValue: newLoyalty });
      }
    }
  });
  return drifts;
}

// =============================================================================
// 9.54.2 HIRELING RECRUITMENT HELPERS (Phase 2.95 §4.2 / §310.3)
// =============================================================================
// Engine layer for the hireling recruitment workflow. Catalogs live in
// acks-engine-catalogs.js (HIRELING_MERCENARIES, HIRELING_HENCHMEN,
// HIRELING_SPECIALISTS, REACTION_TO_HIRING, HIRELING_SOLICIT_FEE_PER_WEEK,
// RECRUITMENT_MODIFIERS).
//
// Workflow (RR pp.164–165):
//   1. solicitHirelings(opts) — pays the weekly fee, rolls availability for
//      the chosen hireType + market class, schedules arrivals over 3 weeks
//      per RAW (1/2 in week 1, 1/4 in week 2, rest in week 3).
//   2. individuateHirelingCandidate(opts) — for each candidate the patron
//      wants to engage, materialise a Character record with kind='candidate'.
//   3. rollReactionToHiring(modifier) — 2d6 + CHA + signing-bonus + prof + sit.
//      Bands per REACTION_TO_HIRING.
//   4. Apply via recruit-hireling event (handler in §310.3d).

// Roll a notation like "2d6", "1d10", "4d100", "3d4+1". Supports +/- modifier.
function rollDiceNotation(notation, rng){
  rng = rng || Math.random;
  if(typeof notation !== 'string') return 0;
  const m = notation.match(/^(\d+)d(\d+)\s*([+-]\s*\d+)?$/);
  if(!m) return 0;
  const n = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s/g,''), 10) : 0;
  let sum = 0;
  for(let i=0; i<n; i++) sum += Math.floor(rng() * sides) + 1;
  return sum + mod;
}

// §310.3f-fix21 — Detailed variant. Returns { dice:[r1,r2,...], n, sides,
// modifier, total, notation } so the UI can render the individual rolls.
function rollDiceNotationDetailed(notation, rng){
  rng = rng || Math.random;
  if(typeof notation !== 'string') return { dice:[], n:0, sides:0, modifier:0, total:0, notation: String(notation) };
  const m = notation.match(/^(\d+)d(\d+)\s*([+-]\s*\d+)?$/);
  if(!m) return { dice:[], n:0, sides:0, modifier:0, total:0, notation };
  const n = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s/g,''), 10) : 0;
  const dice = [];
  for(let i=0; i<n; i++) dice.push(Math.floor(rng() * sides) + 1);
  const sum = dice.reduce((a,b)=>a+b, 0);
  return { dice, n, sides, modifier: mod, total: sum + mod, notation };
}

// Parse a RAW availability cell into a structured spec.
//   '4d100'        → { type:'dice', notation:'4d100' }
//   '1'            → { type:'count', count:1 }
//   '2'            → { type:'count', count:2 }
//   '1 (85%)'      → { type:'percent-single', count:1, percent:85 }
//   '1d2 (50%)'    → { type:'percent-dice', notation:'1d2', percent:50 }
//   '2d4×50'       → { type:'dice-times', notation:'2d4', multiplier:50 }
//   '-' or '—'     → { type:'none' }
function parseAvailabilitySpec(s){
  if(s == null) return { type:'none' };
  s = String(s).trim();
  if(s === '-' || s === '—' || s === '') return { type:'none' };
  // "1 (85%)" — count with percent gate
  let m = s.match(/^(\d+)\s*\((\d+)%\)$/);
  if(m) return { type:'percent-single', count: parseInt(m[1],10), percent: parseInt(m[2],10) };
  // "1d2 (50%)" — dice with percent gate
  m = s.match(/^(\d+d\d+(?:[+-]\d+)?)\s*\((\d+)%\)$/);
  if(m) return { type:'percent-dice', notation: m[1], percent: parseInt(m[2],10) };
  // "2d4×50" or "2d4x50" — dice times multiplier
  m = s.match(/^(\d+d\d+(?:[+-]\d+)?)\s*[×x]\s*(\d+)$/);
  if(m) return { type:'dice-times', notation: m[1], multiplier: parseInt(m[2],10) };
  // "4d100", "1d8+1" — straight dice
  m = s.match(/^(\d+d\d+(?:[+-]\d+)?)$/);
  if(m) return { type:'dice', notation: m[1] };
  // "1", "2", "10" — exact count
  m = s.match(/^(\d+)$/);
  if(m) return { type:'count', count: parseInt(m[1],10) };
  return { type:'unknown', raw: s };
}

// Roll a parsed availability spec; returns the count of candidates present
// in the market for this hire type this week's worth of soliciting.
function rollAvailabilitySpec(spec, rng){
  return rollAvailabilitySpecDetailed(spec, rng).total;
}

// §310.3f-fix21 — Detailed: returns { kind, total, ...breakdown } so the
// UI can show the GM what was actually rolled.
//   kind = 'none' | 'count' | 'dice' | 'dice-times' | 'percent-single' | 'percent-dice'
//   For dice / dice-times: { diceRoll: {dice, n, sides, modifier, total, notation}, multiplier?, total }
//   For percent-single:    { percentRoll, percentTarget, succeeded, count, total }
//   For percent-dice:      { percentRoll, percentTarget, succeeded, diceRoll?, total }
//   For count:             { count, total }
function rollAvailabilitySpecDetailed(spec, rng){
  rng = rng || Math.random;
  if(!spec || spec.type === 'none')    return { kind:'none', total:0 };
  if(spec.type === 'unknown')          return { kind:'none', total:0, raw: spec.raw };
  if(spec.type === 'count')            return { kind:'count', count: spec.count, total: spec.count };
  if(spec.type === 'dice'){
    const dr = rollDiceNotationDetailed(spec.notation, rng);
    return { kind:'dice', diceRoll: dr, total: dr.total };
  }
  if(spec.type === 'dice-times'){
    const dr = rollDiceNotationDetailed(spec.notation, rng);
    return { kind:'dice-times', diceRoll: dr, multiplier: spec.multiplier, total: dr.total * spec.multiplier };
  }
  if(spec.type === 'percent-single'){
    const r = Math.floor(rng() * 100) + 1;
    const ok = r <= spec.percent;
    return { kind:'percent-single', percentRoll: r, percentTarget: spec.percent, succeeded: ok, count: spec.count, total: ok ? spec.count : 0 };
  }
  if(spec.type === 'percent-dice'){
    const r = Math.floor(rng() * 100) + 1;
    const ok = r <= spec.percent;
    let dr = null;
    if(ok) dr = rollDiceNotationDetailed(spec.notation, rng);
    return { kind:'percent-dice', percentRoll: r, percentTarget: spec.percent, succeeded: ok, diceRoll: dr, total: dr ? dr.total : 0 };
  }
  return { kind:'none', total:0 };
}

// Convenience: look up the cell for (hireTypeRow, marketClassIdx) and roll it.
function rollAvailability(row, marketClassIdx, rng){
  return rollAvailabilityDetailed(row, marketClassIdx, rng).total;
}

// §310.3f-fix21 — Detailed cell roll. Returns
//   { cellRaw, marketClassIdx, marketClassLabel, spec, ...specDetail }
function rollAvailabilityDetailed(row, marketClassIdx, rng){
  if(!row || !Array.isArray(row.cells)) return { cellRaw: '', marketClassIdx, kind:'none', total:0 };
  if(marketClassIdx < 0 || marketClassIdx >= row.cells.length) return { cellRaw: '', marketClassIdx, kind:'none', total:0 };
  const cellRaw = row.cells[marketClassIdx];
  const spec = parseAvailabilitySpec(cellRaw);
  const detail = rollAvailabilitySpecDetailed(spec, rng);
  const ACKS = global.ACKS;
  const mkLabel = (ACKS && ACKS.HIRELING_MARKET_CLASSES && ACKS.HIRELING_MARKET_CLASSES[marketClassIdx] && ACKS.HIRELING_MARKET_CLASSES[marketClassIdx].label) || ('Class ' + (marketClassIdx+1));
  return Object.assign({ cellRaw, marketClassIdx, marketClassLabel: mkLabel, spec }, detail);
}

// Roll the per-week solicit fee for a market class.
function resolveSolicitFee(marketClassIdx, rng){
  const ACKS = global.ACKS;
  const table = (ACKS && ACKS.HIRELING_SOLICIT_FEE_PER_WEEK) || [];
  const row = table.find(r => r.marketClassIdx === marketClassIdx);
  if(!row) return 0;
  return rollDiceNotation(row.notation, rng);
}

// Reaction-to-Hiring roll (RR p.165). Returns { d1, d2, natRoll, modifier,
// adjusted, bandKey, bandLabel, accent, note }. Modifier comes pre-computed
// by computeReactionMods or supplied directly.
function rollReactionToHiring(modifier, rng, prerolled){
  rng = rng || Math.random;
  const d1 = (prerolled && prerolled.length === 2) ? prerolled[0] : Math.floor(rng() * 6) + 1;
  const d2 = (prerolled && prerolled.length === 2) ? prerolled[1] : Math.floor(rng() * 6) + 1;
  const natRoll = d1 + d2;
  const mod = Number(modifier || 0);
  const adjusted = natRoll + mod;
  const ACKS = global.ACKS;
  const table = (ACKS && ACKS.REACTION_TO_HIRING) || [];
  const band = table.find(b => adjusted >= b.min && adjusted <= b.max) || table[table.length-1];
  return {
    d1, d2, natRoll, modifier: mod, adjusted,
    bandKey: band ? band.key : 'unknown',
    bandLabel: band ? band.label : '(?)',
    accent: band ? band.accent : 'amber',
    note: band ? band.note : ''
  };
}

// Compute the patron's modifier to the reaction roll. RR p.164–165:
//   + CHA modifier (use computeChaMod helper)
//   + signing bonus (week=+1, month=+2, year=+3 — opts.signingBonusTier)
//   + proficiency bonuses (Diplomacy / Intimidation / Mystic Aura / Seduction
//     — at most one applies per attempt; opts.persuasionProficiency='diplomacy' etc.)
//   + situational (opts.situational, -2..+2 typical)
//   - cumulative -1 per previous failed attempt by anyone in the same party
//     against this candidate (opts.previousFailedAttempts)
//   - regional slander penalty if a prior candidate slandered this party
//     in this town (opts.regionalSlanderPenalty, set externally by the workflow)
function computeReactionMods(patron, opts){
  opts = opts || {};
  const ACKS = global.ACKS;
  const aMod = (ACKS && ACKS.abilityMod) ? ACKS.abilityMod : (s => Math.floor(((s||10) - 10) / 2));
  let mod = 0;
  // CHA
  if(patron && patron.abilities){
    mod += aMod(patron.abilities.CHA || 10);
  }
  // Signing bonus
  const sbTiers = (ACKS && ACKS.RECRUITMENT_MODIFIERS && ACKS.RECRUITMENT_MODIFIERS.signingBonus) || [];
  const sb = sbTiers.find(t => t.tier === (opts.signingBonusTier || 'none'));
  if(sb) mod += sb.modifier;
  // Proficiency (at most one)
  if(opts.persuasionProficiency){
    mod += 1; // RAW: the proficiency grants a +1 bonus
  }
  // Situational
  mod += Number(opts.situational || 0);
  // Previous failed attempts (cumulative -1 per attempt by same party)
  const slanderCum = (ACKS && ACKS.RECRUITMENT_MODIFIERS && ACKS.RECRUITMENT_MODIFIERS.multipleAttemptsCumulativePenalty) || -1;
  mod += slanderCum * Math.max(0, Number(opts.previousFailedAttempts || 0));
  // Regional slander (set externally — engine reads candidate.recruitmentLedger or
  // a per-settlement memory; v1 takes the value directly from opts).
  mod += Number(opts.regionalSlanderPenalty || 0);
  return mod;
}

// solicitHirelings — high-level orchestrator. Pays the weekly fee (returned
// for the GM to debit), rolls availability for the chosen hireType at the
// chosen market class, schedules arrivals across 3 weeks per RR p.164
// (1/2 rounded up in week 1, 1/4 rounded down min 1 in week 2, rest in week 3).
// Returns { row, marketClassIdx, totalAvailable, weekly: [w1, w2, w3],
//   feeWeekly: <gp rolled>, feeTotalIf3Weeks: <fee × 3> }.
function solicitHirelings(opts){
  opts = opts || {};
  const ACKS = global.ACKS;
  const { hireCategory, hireTypeId, marketClassIdx, rng } = opts;
  const _rng = rng || Math.random;
  let table = null;
  if(hireCategory === 'mercenary')  table = ACKS.HIRELING_MERCENARIES;
  else if(hireCategory === 'henchman') table = ACKS.HIRELING_HENCHMEN;
  else if(hireCategory === 'specialist') table = ACKS.HIRELING_SPECIALISTS;
  else throw new Error('solicitHirelings: unknown hireCategory: ' + hireCategory);
  const row = table.find(r => r.id === hireTypeId);
  if(!row) throw new Error('solicitHirelings: unknown hireTypeId: ' + hireTypeId);
  if(marketClassIdx == null || marketClassIdx < 0 || marketClassIdx > 5) throw new Error('solicitHirelings: marketClassIdx must be 0..5');
  // §310.3f-fix21 — capture the detailed breakdown so the GM can see what
  // dice rolled and any percent-gate outcomes.
  const availabilityDetail = rollAvailabilityDetailed(row, marketClassIdx, _rng);
  const total = availabilityDetail.total;
  // RAW: week 1 = ceil(total/2), week 2 = floor(remaining/2) min 1 if remaining > 0,
  // week 3 = remainder. Always at least 1 in week 2 if remaining > 0.
  const w1 = Math.ceil(total / 2);
  const rem1 = total - w1;
  const w2 = rem1 > 0 ? Math.max(1, Math.floor(rem1 / 2)) : 0;
  const w3 = rem1 > 0 ? Math.max(0, rem1 - w2) : 0;
  // Fee: also expose the detail.
  const feeTable = (ACKS && ACKS.HIRELING_SOLICIT_FEE_PER_WEEK) || [];
  const feeRow = feeTable.find(r => r.marketClassIdx === marketClassIdx) || null;
  const feeDetail = feeRow ? rollDiceNotationDetailed(feeRow.notation, _rng) : { dice:[], total:0, notation:'-' };
  const fee = feeDetail.total;
  return {
    row, marketClassIdx, hireCategory, hireTypeId,
    totalAvailable: total,
    weekly: [w1, w2, w3],
    feeWeekly: fee,
    feeTotalIf3Weeks: fee * 3,
    // §310.3f-fix21 — detail for the GM-facing breakdown.
    availabilityDetail,
    feeDetail,
    feeNotation: feeRow ? feeRow.notation : '-',
  };
}

// individuateHirelingCandidate — materialise a single Character record for a
// rolled candidate the patron wants to engage. Idempotent insofar as it
// always produces a fresh Character with stable id; the caller is responsible
// for pushing it to campaign.characters.
//
// Stats for v1 are rolled minimally (3d6 down the line). The GM can edit
// from the candidate sheet. Class is supplied via opts.classRequired (for
// role-targeted henchman searches like Chaplain → divine caster) or left
// blank for the GM to fill.
function individuateHirelingCandidate(opts){
  opts = opts || {};
  const ACKS = global.ACKS;
  const rng = opts.rng || Math.random;
  const { row, hireCategory } = opts;
  if(!row) throw new Error('individuateHirelingCandidate: row required');
  const rollAbility = () => Math.floor(rng()*6)+1 + Math.floor(rng()*6)+1 + Math.floor(rng()*6)+1;
  const id = newId('character');
  const baseName =
    hireCategory === 'henchman' ? ('Henchman L' + (row.level||0))
    : hireCategory === 'specialist' ? (row.label)
    : (row.label);
  const level = (hireCategory === 'henchman') ? (row.level || 0) : 0;
  const wageGp = (typeof row.wage === 'number') ? row.wage : 0;
  const ch = {
    schemaVersion: 2,
    id,
    kind: 'candidate',                 // lifecycle state — transitions on hire
    name: baseName,
    alignment: 'N',
    race: 'human',
    class: opts.classRequired || '',
    level,
    xp: 0,
    hp: { current: 0, max: 0, hitDice: '' },
    ac: 0,
    attackThrow: 10,
    abilities: { STR: rollAbility(), INT: rollAbility(), WIS: rollAbility(), DEX: rollAbility(), CON: rollAbility(), CHA: rollAbility() },
    savingThrows: { paralysis: 13, death: 14, blast: 15, implements: 16, spells: 17 },
    proficiencies: [],
    classPowers: [],
    henchmanCap: 0,
    inventory: [],
    personalGp: 0,
    currentHexId: opts.currentHexId || null,
    currentDomainId: opts.currentDomainId || null,
    partyId: null,
    travelDestination: null,
    travelPace: 'walking',
    background: '',
    personality: '',
    goals: [],
    relationships: [],
    secrets: '',
    voice: '',
    liegeCharacterId: null,
    loyalty: 0,
    monthlyWage: wageGp,
    upkeepMonthly: 0,
    honor: [],
    shame: [],
    mercantileNetwork: [],
    earningsLedger: [],
    history: [],
    loyaltyHistory: [],
    calamities: [],
    autoAdvance: true,
    alive: true,
    deceasedTurn: null,
    // Recruitment-specific provenance.
    recruitmentProvenance: {
      hireCategory,
      hireTypeId: row.id,
      hireTypeLabel: row.label,
      settlementId: opts.settlementId || null,
      individuationTurn: opts.turn || null
    },
    notes: ''
  };
  return ch;
}

// =============================================================================
// 9.55 RUMORS (Phase 2.8 — gated by 'rumors-manual' house rule)
// =============================================================================
// See Phase_2.8_Rumors_Plan.md. Rumors live on Settlement.rumors[] and are also
// recorded as rumor-emit events in eventLog (canonical creation trail).

const RUMOR_TOPICS = Object.freeze(['succession','treason','wealth','magic','war','scandal','religion','monster','trade','other']);
const RUMOR_APPARENT_LEVELS = Object.freeze(['common','uncommon','rare','obscure']);
const RUMOR_TRUTH_LEVELS = Object.freeze(['true','false','mixed','unknown']);

// Default proliferation chances per apparent level (RR / What's the Word).
const RUMOR_PROLIFERATION_CHANCE = Object.freeze({ 'common': 25, 'uncommon': 10, 'rare': 5, 'obscure': 1 });

function blankRumor(opts){
  opts = opts || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.rumor),
    text: opts.text || '',
    truthLevel: opts.truthLevel || 'unknown',
    apparentLevel: opts.apparentLevel || 'uncommon',
    topic: opts.topic || 'other',
    origin: opts.origin || {
      submittedAt: new Date().toISOString(),
      submittedBy: 'gm',
      sourceEventId: null,
      sourceCharacterId: null
    },
    proliferation: opts.proliferation || {
      enabled: false,
      chancePerMonth: RUMOR_PROLIFERATION_CHANCE[opts.apparentLevel || 'uncommon'] || 10,
      settlementsReached: []
    },
    history: opts.history || [],
    notes: opts.notes || ''
  };
}

// --- rumor-emit handler ---
// (Updated for Foundation #193) Writes to top-level campaign.rumors with a reach[] entry.
// If the event references an existing rumor (by sourceEventId or by matching text+settlement),
// it adds a reach entry instead of creating a duplicate. If neither settlementId nor domainId
// is given, the rumor is campaign-scoped (reach stays empty) and lives only in eventLog terms.
function applyEvent_rumorEmit(campaign, event){
  const p = event.payload || {};
  if(!Array.isArray(campaign.rumors)) campaign.rumors = [];
  let targetSettlement = null;
  let targetDomain = null;
  if(p.settlementId){
    targetSettlement = (campaign.settlements||[]).find(s => s.id === p.settlementId) || null;
    if(!targetSettlement) throw new Error('rumor-emit: settlementId not found: '+p.settlementId);
    // Locate the owning domain via the hex this settlement sits on
    const hex = (campaign.hexes||[]).find(h => h.id === targetSettlement.hexId);
    if(hex && hex.domainId){
      targetDomain = (campaign.domains||[]).find(d => d.id === hex.domainId) || null;
    }
  } else if(p.domainId){
    targetDomain = (campaign.domains||[]).find(d => d.id === p.domainId);
    if(!targetDomain) throw new Error('rumor-emit: domainId not found: '+p.domainId);
    // Pick the first settlement in the domain as default landing site
    const domainHexIds = new Set((campaign.hexes||[]).filter(h => h.domainId === targetDomain.id).map(h => h.id));
    targetSettlement = (campaign.settlements||[]).find(s => domainHexIds.has(s.hexId)) || null;
  }

  const apparentLevel = p.apparentLevel || 'uncommon';
  const turn = event.targetTurn || event.appliedAtTurn || (campaign.currentTurn||1);

  // Build the canonical top-level rumor record. Each rumor-emit creates a NEW rumor entity unless
  // the event explicitly references one to add reach to (future-extension: payload.rumorId).
  const rumor = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(ID_PREFIXES.rumor),
    text: p.rumorText || '',
    truthLevel: p.truthLevel || 'unknown',
    topic: p.topic || 'other',
    reach: [],
    origin: {
      submittedAt: event.submittedAt,
      submittedBy: event.submittedBy,
      sourceEventId: p.sourceEventId || null,
      sourceCharacterId: p.sourceCharacterId || null
    },
    proliferation: { enabled: false, chancePerMonth: RUMOR_PROLIFERATION_CHANCE[apparentLevel] || 10 },
    history: [{ turn: turn, event: 'created', note: 'Created via rumor-emit event '+event.id }],
    notes: ''
  };
  if(targetSettlement){
    addRumorReach(rumor, targetSettlement.id, apparentLevel, turn, null);
  }
  campaign.rumors.push(rumor);

  const where = targetSettlement ? targetSettlement.name : '(campaign-scoped)';
  return {
    result: {
      domainsChanged: targetDomain ? [targetDomain.id] : [],
      charactersChanged: [], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: 'Rumor planted at '+where+' ('+apparentLevel+'): "'+rumor.text.substring(0,100)+(rumor.text.length>100?'..."':'"'),
      rumorId: rumor.id,
      settlementId: targetSettlement ? targetSettlement.id : null
    }
  };
}
registerEventHandler('rumor-emit', applyEvent_rumorEmit);

// Apparent-level drift: monthly tick called from commitTurn when the 'rumors-manual' house rule is on.
// (Updated for Foundation #193) Walks every reach entry on every top-level rumor. Each reach entry
// drifts independently — a rumor that's "common" in Saltspur and "obscure" in Northwatch stays
// that way until each location independently moves up a tier.
function tickRumorApparentLevels(campaign, currentTurn){
  if(!campaign || !Array.isArray(campaign.rumors)) return [];
  const driftLog = [];
  // Drift goes obscure → rare → uncommon → common (the rumor spreads / becomes more known)
  const driftMap = { 'obscure': 'rare', 'rare': 'uncommon', 'uncommon': 'common', 'common': 'common' };
  campaign.rumors.forEach(r => {
    (r.reach||[]).forEach(rch => {
      const oldLevel = rch.apparentLevel;
      const newLevel = driftMap[oldLevel];
      if(newLevel !== oldLevel){
        rch.apparentLevel = newLevel;
        if(!Array.isArray(r.history)) r.history = [];
        r.history.push({ turn: currentTurn, event: 'spread', note: 'At '+rch.settlementId+': drifted '+oldLevel+' → '+newLevel });
        driftLog.push({ rumorId: r.id, settlementId: rch.settlementId, oldLevel, newLevel });
      }
    });
  });
  return driftLog;
}

// =============================================================================
// 9.56 MARKETS & MERCHANDISE (Phase 2.9 — gated by markets-* house rules)
// =============================================================================
// See Phase_2.9_M_and_M_Plan.md.

const NOTABILITY_CATEGORIES = Object.freeze(['weapons','armor','magic','luxury','exotic','livestock','art','food']);
const ENTRYWAY_KINDS = Object.freeze(['road','river','sea','caravan-track','jungle-path','mountain-pass','smuggler-cove']);
const ENTRYWAY_SECURITY = Object.freeze(['patrolled','watched','lawless','interdicted']);
const ASSET_RESTRICTIONS = Object.freeze(['licensed','forbidden','interdicted']);

// Default inspection chance per entryway security level (chance the cargo is inspected per RR-ish convention)
const ENTRYWAY_INSPECTION_DEFAULT = Object.freeze({
  'patrolled': 80,
  'watched': 40,
  'lawless': 5,
  'interdicted': 95
});

// Transaction threshold formula per RR-ish: half a gp per family. Settlements can override.
function computeTransactionThreshold(settlement){
  if(!settlement) return 0;
  if(typeof settlement.transactionThreshold === 'number') return settlement.transactionThreshold;
  return Math.floor((settlement.families||0) * 0.5);
}

function blankNotability(){
  // All categories default to 0; positive means famous-for, negative means scarce-of.
  const obj = {};
  NOTABILITY_CATEGORIES.forEach(c => obj[c] = 0);
  return obj;
}

function blankEntryway(opts){
  opts = opts || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId('ent'),
    kind: opts.kind || 'road',
    label: opts.label || '',
    direction: opts.direction || '',
    securityLevel: opts.securityLevel || 'watched',
    inspectionChance: opts.inspectionChance != null ? opts.inspectionChance : ENTRYWAY_INSPECTION_DEFAULT[opts.securityLevel || 'watched'],
    notes: opts.notes || ''
  };
}

function blankRegulatedAsset(opts){
  opts = opts || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId('reg'),
    merchandiseCategoryId: opts.merchandiseCategoryId || '',
    restriction: opts.restriction || 'licensed',
    license: opts.license || null,
    notes: opts.notes || ''
  };
}

// =============================================================================
// 9.6 JOURNEYS — overland travel day-tick consumer (Phase 2.5 #475, J1)
// =============================================================================
// Journey is the first real travel consumer of the Calendar day-tick pipeline (the
// construction consumer is the proof). Per Phase_2.5_Journeys_Plan.md §5: an in-transit
// Journey contributes one Day record per tick; movement (§6), navigation (§7), survival
// (§8), and the JJ p.84 fatigue cycle (§10) resolve each day. The handler is PURE (it
// proposes records without mutating); commitJourneyRecord replays the recorded absolutes
// onto the real campaign, so a stochastic day (nav/encounter rolls) commits exactly what
// the GM reviewed. RAW is the DEFAULT — `simplified-fatigue` and `ignore-rations` are the
// opt-outs, never RAW-behind-a-toggle (CLAUDE §6 + the flip-queue). Sea/air modes (§13),
// the pool-first encounter draw (#476), and splitting/merging (§16) are later slices.

// global.ACKS is fully assembled by the time any of these run (subsystems loads last).
function _jACKS(){ return global.ACKS; }

// §6 — distance covered/remaining, in 6-mile hexes (axial). Pure.
function computeJourneyDistance(campaign, journey){
  const A = _jACKS();
  const startHex = A.resolveHexAnywhere(campaign, journey.startHexId);
  const destHex  = A.resolveHexAnywhere(campaign, journey.destinationHexId);
  let total = 0;
  if(startHex && destHex && startHex.coord && destHex.coord) total = A.hexAxialDistance(startHex.coord, destHex.coord);
  const covered = (journey.days || []).reduce((s, d) => s + ((d && d.hexesTraveled) || 0), 0);
  const remaining = Math.max(0, total - covered);
  return { total, covered, remaining, startHex, destHex };
}

// §7 — navigation throw (1d20 + party proficiency bonus ≥ terrain target). Pure given rng.
function rollNavigation(navTarget, bonus, rng){
  rng = rng || Math.random;
  const rolled = 1 + Math.floor(rng() * 20);
  const total = rolled + (bonus || 0);
  return { rolled, target: navTarget, bonus: bonus || 0, total, success: total >= navTarget };
}

// Best of the party's travel proficiencies → a simplified +2 for J1 (full throw math is
// Phase 3.6 Proficiency Throws). Pure read.
function _journeyNavBonus(campaign, journey){
  const ids = journey.participantCharacterIds || [];
  const RE = /(navigation|pathfinding|land surveying|adventuring|survival|seafaring)/i;
  let bonus = 0;
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    for(const p of (c.proficiencies || [])){
      const name = (typeof p === 'string') ? p : ((p && (p.name || p.id || p.proficiency)) || '');
      if(RE.test(name)) bonus = Math.max(bonus, 2);
    }
  }
  return bonus;
}

// §12 (J1 STUB) — per-day wilderness encounter check. On a hit, returns a placeholder
// "GM, resolve this" encounter + notable event (pauseTrigger 'encounter'); the real
// pool-first draw (lairs / persistent wanderers / rival journeys) lands with #476, and
// Phase 3 #141 owns the actual tables. Roads are safe in J1. Pure given rng.
function rollEncounter(campaign, journey, opts){
  opts = opts || {};
  const rng = opts.rng || Math.random;
  const chance = opts.hasRoad ? 0 : (1 / 6); // ~1-in-6 wilderness; roads safe for J1
  if(chance <= 0 || rng() >= chance) return null;
  const hexId = (journey && journey.startHexId) || null;
  const dayIndex = opts.dayIndex || ((journey && journey.currentDayIndex) || 0) + 1;
  const encId = 'enc-' + Math.floor(rng() * 2176782336).toString(36); // 'enc' is not a registered ID prefix
  const encounterRecord = {
    id: encId, dayIndex, hexId, triggeredBy: 'wandering-roll', encounterTableUsed: null,
    monsters: [], rivalJourneyId: null, outcome: 'unresolved', survivorsCarriedOver: [],
    partyCasualtiesSummary: null, treasureGained: null, resolvedByEventId: null
  };
  const notableEvent = {
    kind: 'journey-encounter', type: 'encounter', pauseTrigger: 'encounter', primaryHexId: hexId,
    label: ((journey && journey.name) || 'Journey') + ': encounter check — GM, resolve this encounter (' + (opts.terrain || 'wilderness') + ')',
    payload: { journeyId: journey && journey.id, dayIndex, hexId, encounterId: encId }
  };
  return { encounterRecord, notableEvent };
}

// §5.1 — resolve ONE day for ONE in-transit journey. PURE: returns the pending record
// (carrying the §4.2 Day record + the post-state absolutes commit replays) plus any
// notable events + encounters. Does not mutate the campaign.
function tickJourneyDay(campaign, journey, ctx){
  const A = _jACKS();
  ctx = ctx || {};
  const rng = ctx.rng || Math.random;
  const participants = Math.max(1, (journey.participantCharacterIds || []).length);
  const dist = computeJourneyDistance(campaign, journey);
  const startHex = dist.startHex;
  const newDayIndex = (journey.currentDayIndex || 0) + 1;
  const pace = journey.pace || 'normal';
  const weather = (ctx.weather && ctx.weather.condition) ? ctx.weather : { condition: 'fair', temperature: 'moderate', rolledOrSet: 'gm-fiat' };

  // carry-forward absolutes
  let fatigueDays = journey.fatigueDays || 0;
  let isLost = !!journey.isLost;
  let rations = (journey.supplies && journey.supplies.rations) || 0;
  let waterRations = (journey.supplies && journey.supplies.waterRations) || 0;
  const firstChar = (campaign.characters || []).find(c => c && c.id === (journey.participantCharacterIds || [])[0]);
  let hungerDays = (firstChar && firstChar.hungerDays) || 0;
  let dehydrationDays = (firstChar && firstChar.dehydrationDays) || 0;

  const notableEvents = [];
  const encounters = [];

  // ── speed (§6): base × terrain × weather × temperature × ground × pace ──
  const baseTerrain = (startHex && startHex.terrain) || 'grassland';
  const hasRoad = !!(startHex && startHex.hasRoad);
  const terrainMult = hasRoad ? A.JOURNEY_TERRAIN_SPEED.road
    : (A.JOURNEY_TERRAIN_SPEED[baseTerrain] != null ? A.JOURNEY_TERRAIN_SPEED[baseTerrain] : 1);
  const weatherMult = (A.JOURNEY_WEATHER_SPEED[weather.condition] != null) ? A.JOURNEY_WEATHER_SPEED[weather.condition] : 1;
  // RR pp.277-278: frigid/sweltering temperatures each halve speed (a separate axis from precipitation).
  const tempMult = (A.JOURNEY_TEMPERATURE_SPEED[weather.temperature] != null) ? A.JOURNEY_TEMPERATURE_SPEED[weather.temperature] : 1;
  // RR p.272: mud/snow underfoot is a further ×1/2 that compounds on terrain. GM-set per hex.
  const groundCond = (startHex && startHex.groundCondition) || 'clear';
  const groundMult = (A.JOURNEY_GROUND_SPEED[groundCond] != null) ? A.JOURNEY_GROUND_SPEED[groundCond] : 1;
  const paceMult = (A.JOURNEY_PACE_SPEED[pace] != null) ? A.JOURNEY_PACE_SPEED[pace] : 1;
  const milesPerDay = A.JOURNEY_BASE_SPEED_MILES_PER_DAY * terrainMult * weatherMult * tempMult * groundMult * paceMult;
  let hexesPerDay = Math.floor(milesPerDay / A.JOURNEY_MILES_PER_HEX);
  if(hexesPerDay < 1) hexesPerDay = 1; // a travel day always covers at least one hex

  // ── fatigue (§10 / JJ p.84): a 6-day strenuous streak forces a rest day ──
  const simplifiedFatigue = A.isHouseRuleEnabled(campaign, 'simplified-fatigue');
  const strenuousPace = (pace === 'normal' || pace === 'forced-march');
  const restDay = (!simplifiedFatigue && strenuousPace && fatigueDays >= A.JOURNEY_FATIGUE_CYCLE_DAYS);

  // ── navigation (§7): skip on road/trail; roll only while actually traveling ──
  let navRecord = null;
  if(!restDay && !hasRoad && !(startHex && startHex.hasTrail) && dist.remaining > 0){
    const navTarget = (A.JOURNEY_NAV_THROWS[baseTerrain] != null) ? A.JOURNEY_NAV_THROWS[baseTerrain] : 6;
    const bonus = _journeyNavBonus(campaign, journey);
    const nav = rollNavigation(navTarget, bonus, rng);
    navRecord = { rolled: nav.rolled, target: nav.target, bonuses: bonus ? [{ source: 'party-proficiency', value: bonus }] : [], result: nav.success ? 'success' : 'fail-known-lost' };
    if(!nav.success){
      isLost = true;
      notableEvents.push({
        kind: 'journey-lost', type: 'navigation-fail', pauseTrigger: 'navigation-fail', primaryHexId: journey.startHexId || null,
        label: (journey.name || 'Journey') + ': lost in ' + baseTerrain + ' (nav ' + nav.rolled + (bonus ? ('+' + bonus) : '') + ' vs ' + navTarget + '+)',
        payload: { journeyId: journey.id, dayIndex: newDayIndex }
      });
    } else if(isLost){
      // A successful throw re-orients a previously-lost party (RR p.275 recovery). Without this,
      // isLost carried forward forever and the party made 0 progress despite succeeding — the
      // "journey never arrives" bug. Recovering clears lost so movement resumes this day.
      isLost = false;
      navRecord.result = 'success-recovered';
      notableEvents.push({
        kind: 'journey-day-tick', type: 'navigation-recovered', primaryHexId: journey.startHexId || null,
        label: (journey.name || 'Journey') + ': found the way again (nav ' + nav.rolled + (bonus ? ('+' + bonus) : '') + ' vs ' + navTarget + '+)',
        payload: { journeyId: journey.id, dayIndex: newDayIndex }
      });
    }
  }

  // ── movement: none on a rest day or a freshly-lost day ──
  const hexesToday = (!restDay && !isLost) ? Math.min(hexesPerDay, dist.remaining) : 0;
  const milesToday = hexesToday * A.JOURNEY_MILES_PER_HEX;
  const newCovered = dist.covered + hexesToday;
  const willArrive = (dist.total > 0) ? (newCovered >= dist.total) : true; // 0-distance arrives at once

  // ── survival (§8): RAW default; ignore-rations opts out ──
  const ignoreRations = A.isHouseRuleEnabled(campaign, 'ignore-rations');
  let rationsConsumed = 0, waterConsumed = 0;
  if(!ignoreRations){
    rationsConsumed = Math.min(rations, participants);
    waterConsumed = Math.min(waterRations, participants);
    rations = Math.max(0, rations - participants);
    waterRations = Math.max(0, waterRations - participants);
    const hungry = rationsConsumed < participants;
    const thirsty = waterConsumed < participants;
    hungerDays = hungry ? (hungerDays + 1) : 0;
    dehydrationDays = thirsty ? (dehydrationDays + 1) : 0;
    if(hungry) notableEvents.push({ kind: 'journey-day-tick', type: 'hunger', pauseTrigger: 'supplies-low', primaryHexId: journey.startHexId || null, label: (journey.name || 'Journey') + ': out of food — party hungry (day ' + hungerDays + ')', payload: { journeyId: journey.id, dayIndex: newDayIndex } });
    if(thirsty) notableEvents.push({ kind: 'journey-day-tick', type: 'dehydration', pauseTrigger: 'supplies-low', primaryHexId: journey.startHexId || null, label: (journey.name || 'Journey') + ': out of water — party dehydrated (day ' + dehydrationDays + ')', payload: { journeyId: journey.id, dayIndex: newDayIndex } });
    const lowAt = participants * A.JOURNEY_SUPPLY_LOW_DAYS;
    if(!hungry && rations > 0 && rations < lowAt) notableEvents.push({ kind: 'journey-day-tick', type: 'supplies-low', pauseTrigger: 'supplies-low', primaryHexId: journey.startHexId || null, label: (journey.name || 'Journey') + ': supplies low (' + rations + ' rations left)', payload: { journeyId: journey.id, dayIndex: newDayIndex } });
  }

  // ── fatigue accrual / reset (RR p.279 "Rest and Recuperation") ──
  let fatigueAccumulated = 0;
  if(restDay){
    fatigueDays = 0; // a dedicated rest day clears the streak (RR p.279)
    notableEvents.push({ kind: 'journey-day-tick', type: 'forced-rest', primaryHexId: journey.startHexId || null, label: (journey.name || 'Journey') + ': forced rest — party was fatigued (RR p.279)', payload: { journeyId: journey.id, dayIndex: newDayIndex } });
  } else if(pace === 'forced-march'){
    // RAW (RR p.279): a single forced march fatigues the party at once — it "counts as six days
    // of strenuous activity, immediately requiring rest." Jump the streak to the cycle cap so the
    // NEXT strenuous day becomes a forced rest. (The cumulative −1-to-throws penalty is deferred
    // with the rest of survival; fatigueDays is the counter the GM-facing tracker reads.)
    const before = fatigueDays;
    fatigueDays = Math.max(fatigueDays, A.JOURNEY_FATIGUE_CYCLE_DAYS);
    fatigueAccumulated = fatigueDays - before;
  } else if(strenuousPace){
    fatigueDays += 1; fatigueAccumulated = 1; // ordinary travel = one strenuous day (RR p.279)
  }

  // ── encounter check (§12 — J1 stub) ──
  const enc = rollEncounter(campaign, journey, { rng, terrain: baseTerrain, hasRoad, dayIndex: newDayIndex });
  if(enc){ encounters.push(enc.encounterRecord); notableEvents.push(enc.notableEvent); }

  // ── status transition + arrival event ──
  let newStatus = 'in-transit';
  let newCurrentHexId = journey.currentHexId || journey.startHexId || null;
  if(willArrive){
    newStatus = 'arrived';
    newCurrentHexId = journey.destinationHexId || newCurrentHexId;
    notableEvents.push({ kind: 'journey-arrived', type: 'arrived', primaryHexId: journey.destinationHexId || null, involvedHexIds: [journey.startHexId, journey.destinationHexId].filter(Boolean), label: (journey.name || 'Journey') + ': arrived at destination (day ' + newDayIndex + ')', payload: { journeyId: journey.id, destinationHexId: journey.destinationHexId } });
  }

  // ── the review-surface summary label (every day; routine travel emits NO event) ──
  let summaryLabel;
  if(willArrive)      summaryLabel = (journey.name || 'Journey') + ': arrived (day ' + newDayIndex + ')';
  else if(restDay)    summaryLabel = (journey.name || 'Journey') + ': forced rest (day ' + newDayIndex + ')';
  else if(isLost)     summaryLabel = (journey.name || 'Journey') + ': lost — no progress (day ' + newDayIndex + ')';
  else                summaryLabel = (journey.name || 'Journey') + ': +' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ' (' + milesToday + ' mi), day ' + newDayIndex;

  // ── §4.2 Day record ──
  const dayRecord = {
    dayIndex: newDayIndex,
    hexId: journey.startHexId || null,
    weather: { condition: weather.condition, temperature: weather.temperature || 'moderate', rolledOrSet: weather.rolledOrSet || 'gm-fiat' },
    pace: restDay ? 'rest' : pace,
    milesTraveled: milesToday,
    hexesTraveled: hexesToday,
    arrivedAt: newCurrentHexId,
    navigationThrow: navRecord,
    rationsConsumed: { food: rationsConsumed, water: waterConsumed, animalFeed: 0, animalWater: 0, shipStores: 0 },
    fatigueAccumulated,
    encounters: encounters.map(e => ({ kind: e.triggeredBy || 'wandering-roll', encounterId: e.id })),
    notableEvents: notableEvents.map(n => ({ kind: n.kind, text: n.label })),
    status: 'pending'
  };

  const record = {
    kind: 'journey-day', journeyId: journey.id, name: journey.name || 'Journey', label: summaryLabel,
    dayRecord,
    newDayIndex, newFatigueDays: fatigueDays, newIsLost: isLost,
    newRations: rations, newWaterRations: waterRations,
    newHungerDays: hungerDays, newDehydrationDays: dehydrationDays,
    newCurrentHexId, newStatus, primaryHexId: journey.startHexId || null
  };
  return { record, notableEvents, encounters };
}

// §14 day-handler for journeys (Calendar §10.2 slot 30). PURE: proposes one day per
// in-transit journey without mutating. commitJourneyRecord applies a ratified record.
function proposeJourneyDay(campaign, ctx){
  const pendingRecords = [], notableEvents = [], encounters = [];
  if(!campaign || !Array.isArray(campaign.journeys)) return { pendingRecords, notableEvents, encounters };
  for(const j of campaign.journeys){
    if(!j || j.status !== 'in-transit') continue;
    const out = tickJourneyDay(campaign, j, ctx);
    if(out && out.record){
      pendingRecords.push(out.record);
      (out.notableEvents || []).forEach(e => notableEvents.push(e));
      (out.encounters || []).forEach(e => encounters.push(e));
    }
  }
  return { pendingRecords, notableEvents, encounters };
}

// Apply a ratified Day record to the REAL campaign (replay of recorded absolutes — no
// re-rolling, so the commit matches exactly what the GM reviewed). Called on the working
// clone between days during propose, and on the real campaign during commit.
function commitJourneyRecord(campaign, record){
  if(!campaign || !record || record.kind !== 'journey-day' || !record.journeyId) return;
  const j = (campaign.journeys || []).find(x => x && x.id === record.journeyId);
  if(!j) return;
  const dr = JSON.parse(JSON.stringify(record.dayRecord || {}));
  // Pre-day snapshot so the GM can reroll the LATEST day (revert + re-tick — rerollJourneyDay).
  // Captured BEFORE the record's post-state absolutes are applied below, so it holds the state
  // the day started from. Survival (hunger/dehydration) lives on participants — capture the first.
  const _firstC = (campaign.characters || []).find(c => c && c.id === (j.participantCharacterIds || [])[0]);
  dr._preDay = {
    currentDayIndex: j.currentDayIndex || 0,
    fatigueDays: j.fatigueDays || 0,
    isLost: !!j.isLost,
    rations: (j.supplies && j.supplies.rations) || 0,
    waterRations: (j.supplies && j.supplies.waterRations) || 0,
    currentHexId: j.currentHexId || j.startHexId || null,
    status: j.status || 'in-transit',
    hungerDays: (_firstC && _firstC.hungerDays) || 0,
    dehydrationDays: (_firstC && _firstC.dehydrationDays) || 0
  };
  // World-date stamp: which world day this leg happened on, so the GM can reroll the LATEST
  // day only while the clock still stands on it (Journeys J2 feedback — once +1 day / Advance
  // month moves the world past, the leg is history and locks). The day-tick tags the record
  // with the leg's dayInMonth (tickDayOnce); a day-tick never changes the turn, so the month
  // is the current turn. Direct/reroll commits (no tag) fall back to the settled clock.
  dr.worldDay = {
    turn: campaign.currentTurn || 1,
    dayInMonth: (typeof record.dayInMonth === 'number') ? record.dayInMonth : (campaign.currentDayInMonth || 1)
  };
  dr.status = 'committed';
  (j.days = j.days || []).push(dr);
  j.currentDayIndex = record.newDayIndex;
  j.fatigueDays = record.newFatigueDays;
  j.isLost = record.newIsLost;
  j.supplies = j.supplies || {};
  j.supplies.rations = record.newRations;
  j.supplies.waterRations = record.newWaterRations;
  j.currentHexId = record.newCurrentHexId;
  j.status = record.newStatus;
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: record.newDayIndex, type: (record.newStatus === 'arrived' ? 'arrived' : 'day-tick'), narrative: record.label || ('day ' + record.newDayIndex) });
  // mirror survival state onto participants (persists across journeys — §10.4)
  const ids = j.participantCharacterIds || [];
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    c.personalFatigue = record.newFatigueDays;
    c.hungerDays = record.newHungerDays;
    c.dehydrationDays = record.newDehydrationDays;
    if(record.newStatus === 'arrived'){ c.currentHexId = j.destinationHexId || c.currentHexId; c.currentJourneyId = null; }
    else { c.currentJourneyId = j.id; }
  }
  if(record.newStatus === 'arrived' && j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt){ pt.activeJourneyId = null; pt.currentHexId = j.destinationHexId || pt.currentHexId; }
  }
}

// Can the journey's LATEST day be rerolled right now? (Journeys J2 feedback.) Yes only when:
//   (a) that day carries a _preDay snapshot to revert to, AND
//   (b) the journey wasn't deliberately aborted (abort is a GM decision, not a die roll), AND
//   (c) the world clock still stands on the day the leg happened — once the world rolls past
//       it (+1 day / Advance month), the leg is history and locks.
// A just-ARRIVED leg stays rerollable while the clock is still on its day (the GM may redo a
// bad-luck final leg). Legacy day records (no worldDay stamp) fall back to the snapshot-only
// rule so older saves behave as before. Compares an absolute day ordinal (turn*30 + day).
function journeyLastDayRerollable(campaign, journey){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!j || j.status === 'aborted' || !Array.isArray(j.days) || !j.days.length) return false;
  const last = j.days[j.days.length - 1];
  if(!last || !last._preDay) return false;
  const wd = last.worldDay;
  if(!wd) return true; // pre-stamp record — preserve the old snapshot-only behavior
  const nowOrd = (((campaign && campaign.currentTurn) || 1) * 30) + (((campaign && campaign.currentDayInMonth) || 1));
  const legOrd = ((wd.turn || 1) * 30) + (wd.dayInMonth || 1);
  return nowOrd <= legOrd; // world hasn't advanced past the leg's day
}

// GM reroll of the LATEST committed day: revert the journey + participants to the day's pre-state
// snapshot, prune that day's journey events from the eventLog, re-run the day with fresh
// randomness, re-commit, and re-emit the new day's notable events. Only the latest day is
// rerollable (downstream days depend on it) and only while the world clock still stands on it
// (journeyLastDayRerollable). Returns the new record, or null if not possible.
function rerollJourneyDay(campaign, journey){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!journeyLastDayRerollable(campaign, j)) return null; // no snapshot, aborted, or the world has moved past this day
  const lastDay = j.days[j.days.length - 1];
  const pre = lastDay._preDay;
  const wasArrival = (j.status === 'arrived'); // reverting an arrival must also un-do the move-to-destination
  const dayNum = lastDay.dayIndex;
  // 1. prune this day's journey events from the eventLog (lost / hunger / dehydration / encounter / arrived)
  campaign.eventLog = (campaign.eventLog || []).filter(entry => {
    const ev = entry && entry.event;
    if(!ev || !ev.payload || ev.payload.journeyId !== j.id) return true;
    if(ev.payload.dayIndex === dayNum) return false;
    if(ev.kind === 'journey-arrived') return false; // a journey arrives once = its latest day
    return true;
  });
  // 2. revert journey + participants to the pre-day snapshot
  j.days.pop();
  j.currentDayIndex = pre.currentDayIndex;
  j.fatigueDays = pre.fatigueDays;
  j.isLost = pre.isLost;
  j.supplies = j.supplies || {};
  j.supplies.rations = pre.rations;
  j.supplies.waterRations = pre.waterRations;
  j.currentHexId = pre.currentHexId;
  j.status = pre.status;
  const ids = j.participantCharacterIds || [];
  for(const c of (campaign.characters || [])){
    if(c && ids.indexOf(c.id) >= 0){
      c.hungerDays = pre.hungerDays || 0;
      c.dehydrationDays = pre.dehydrationDays || 0;
      c.personalFatigue = pre.fatigueDays || 0;
      c.currentJourneyId = j.id; // re-link (a revert may have un-done an arrival)
      if(wasArrival) c.currentHexId = pre.currentHexId; // un-do the arrival's move-to-destination
    }
  }
  // reverting an arrival also un-does the party's arrival bookkeeping (commitJourneyRecord
  // had cleared activeJourneyId + moved the party to the destination on arrival).
  if(wasArrival && j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt){ pt.activeJourneyId = j.id; pt.currentHexId = pre.currentHexId || pt.currentHexId; }
  }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: dayNum, type: 'reroll', narrative: 'GM rerolled day ' + dayNum + '.' });
  // 3. re-run the day with fresh randomness (Math.random in the live app / tests)
  const out = tickJourneyDay(campaign, j, {});
  if(!out || !out.record) return null;
  // 4. commit the new record (updates journey.days + participant survival state)
  commitJourneyRecord(campaign, out.record);
  // 5. re-emit the new day's notable events to the eventLog (best-effort; mirrors emitDayTickEvents)
  try {
    campaign.eventLog = campaign.eventLog || [];
    const cal = campaign.calendar || {};
    const dayInMonth = (j.startedAtDayInMonth || 1) + Math.max(0, (out.record.newDayIndex || 1) - 1);
    (out.notableEvents || []).forEach(e => {
      let ev;
      try {
        ev = A.newEvent(e.kind || 'gm-narrative', {
          submittedBy: 'engine', status: (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
          targetTurn: campaign.currentTurn || 1,
          gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: dayInMonth },
          context: { primaryHexId: e.primaryHexId || null, involvedHexIds: e.involvedHexIds || [], settlementId: null, domainId: null, relatedEntities: (ids || []).map(id => ({ kind: 'character', id, role: 'subject' })) },
          payload: e.payload || { journeyId: j.id }
        });
      } catch(_e){ return; }
      ev.appliedAtTurn = campaign.currentTurn || 1;
      campaign.eventLog.push({ event: ev, result: { narrativeSummary: e.label || 'journey event' }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
    });
  } catch(e){ /* never let event emission block a reroll */ }
  return out.record;
}

// Transition a planning journey to in-transit: set the clock + pointers, link the party
// + participants, and emit a journey-start event with the context envelope. The day-tick
// only advances in-transit journeys, so this is the entry point (called from the UI / a
// Player Portal queue / a test). Returns the journey.
function startJourney(campaign, journey){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!j) return null;
  j.status = 'in-transit';
  j.currentHexId = j.startHexId || j.currentHexId || null;
  j.currentDayIndex = 0;
  j.isLost = false;
  j.fatigueDays = j.fatigueDays || 0;
  j.startedAtTurn = (campaign.currentTurn != null) ? campaign.currentTurn : (j.startedAtTurn || null);
  j.startedAtDayInMonth = campaign.currentDayInMonth || j.startedAtDayInMonth || 1;
  const dist = computeJourneyDistance(campaign, j);
  j.daysRemainingEstimate = dist.total > 0 ? Math.max(1, Math.ceil(dist.total / 4)) : 0;
  const ids = j.participantCharacterIds || [];
  for(const c of (campaign.characters || [])){ if(c && ids.indexOf(c.id) >= 0) c.currentJourneyId = j.id; }
  if(j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt) pt.activeJourneyId = j.id;
  }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, type: 'started', narrative: 'Journey began' + (j.destinationHexId ? (' toward ' + j.destinationHexId) : '') + '.' });
  try {
    campaign.eventLog = campaign.eventLog || [];
    const cal = campaign.calendar || {};
    const ev = A.newEvent('journey-start', {
      submittedBy: 'engine', status: (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
      targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      context: { primaryHexId: j.startHexId || null, involvedHexIds: [j.startHexId, j.destinationHexId].filter(Boolean), settlementId: null, domainId: null, relatedEntities: ids.map(id => ({ kind: 'character', id, role: 'subject' })) },
      payload: { journeyId: j.id, startHexId: j.startHexId, destinationHexId: j.destinationHexId, narrative: (j.name || 'Journey') + ' set out.' }
    });
    ev.appliedAtTurn = campaign.currentTurn || 1;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: (j.name || 'Journey') + ' set out.' }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
  } catch(e){ /* never let event emission block a journey start */ }
  return j;
}

// Abort an in-flight (or planning/resting/lost) journey: flip status to 'aborted',
// unlink each participant's currentJourneyId + the party's activeJourneyId, append a
// history entry, and emit a journey-aborted event with the §3.5 context envelope
// (primaryHexId = the hex the party was at when it stopped). The day-tick only advances
// in-transit journeys, so an aborted journey can never be re-ticked. Returns the journey.
function abortJourney(campaign, journey, reason){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!j) return null;
  const atHex = j.currentHexId || j.startHexId || null;
  j.status = 'aborted';
  const ids = j.participantCharacterIds || [];
  for(const c of (campaign.characters || [])){
    if(c && ids.indexOf(c.id) >= 0 && c.currentJourneyId === j.id) c.currentJourneyId = null;
  }
  if(j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt && pt.activeJourneyId === j.id) pt.activeJourneyId = null;
  }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: j.currentDayIndex || 0, type: 'aborted', narrative: 'Journey aborted' + (reason ? (': ' + reason) : '') + '.' });
  try {
    campaign.eventLog = campaign.eventLog || [];
    const cal = campaign.calendar || {};
    const ev = A.newEvent('journey-aborted', {
      submittedBy: 'engine', status: (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
      targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      context: { primaryHexId: atHex, involvedHexIds: [atHex].filter(Boolean), settlementId: null, domainId: null, relatedEntities: ids.map(id => ({ kind: 'character', id, role: 'subject' })) },
      payload: { journeyId: j.id, reason: reason || null, narrative: (j.name || 'Journey') + ' was aborted' + (reason ? (' (' + reason + ')') : '') + '.' }
    });
    ev.appliedAtTurn = campaign.currentTurn || 1;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: (j.name || 'Journey') + ' aborted.' }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
  } catch(e){ /* never let event emission block an abort */ }
  return j;
}

// Compatibility stubs retained for older call sites (superseded by the Journey model).
function travelEstimate(character, destinationHexId, options){
  // Superseded by computeJourneyDistance + the Journey day-tick. Kept as a harmless null.
  return null;
}
function applyTravelTick(campaign, options){
  // Superseded by the day-tick pipeline (registerDayConsumer 'journeys'). No-op.
  return { arrivals: [], encounters: [], inTransit: [] };
}

// =============================================================================
// 9.7 MAP — hex geometry + fill layers (Phase 2.5 Map Mode, #225 — M0–M2)
// =============================================================================
// Pure, deterministic helpers backing the SVG hex map (Phase_2.5_Map_Mode_Plan.md;
// Architecture §11). The map is a PURE VIEW over campaign.hexes[] — these functions add
// no persisted data. Coordinate convention (Architecture §11.3): the canonical store is
// axial {q,r}; render FLAT-TOP. Every function here is side-effect-free and stable per
// input so it unit-tests cleanly (tests/map.smoke.js).

const MAP_DEFAULT_HEX_SIZE = 40; // internal SVG units (center→corner); the viewBox scales it.

// Flat-top axial {q,r} → pixel center (Architecture §11.3: x = size·3/2·q, y = size·√3·(r + q/2)).
function hexAxialToPixel(q, r, size){
  size = size || MAP_DEFAULT_HEX_SIZE;
  return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
}

// The 6 corner points of a flat-top hexagon centered at (cx,cy). Corner i at angle 60°·i
// (i=0 is due-right), so the top + bottom edges run flat — i.e. a flat-top hex.
function hexCornerPoints(cx, cy, size){
  size = size || MAP_DEFAULT_HEX_SIZE;
  const pts = [];
  for(let i = 0; i < 6; i++){
    const a = Math.PI / 180 * (60 * i);
    pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
  }
  return pts;
}

// Convenience: the SVG `points` attribute string for the hex at axial (q,r).
function hexPolygonPoints(q, r, size){
  size = size || MAP_DEFAULT_HEX_SIZE;
  const c = hexAxialToPixel(q, r, size);
  const round = n => Math.round(n * 100) / 100;
  return hexCornerPoints(c.x, c.y, size).map(p => round(p.x) + ',' + round(p.y)).join(' ');
}

// Bounding box (pixel space) over a set of hexes + a margin (pixels). Each item carries
// either `.coord {q,r}` (the persisted shape) or a bare `{q,r}`. Returns null for an empty
// set. Accounts for each hex's full extent (±size in x, ±√3/2·size in y).
function hexMapBounds(hexes, size, margin){
  size = size || MAP_DEFAULT_HEX_SIZE;
  margin = (margin == null) ? size * 1.5 : margin;
  const list = (hexes || []).filter(h => h && (h.coord || typeof h.q === 'number'));
  if(!list.length) return null;
  const halfH = Math.sqrt(3) / 2 * size;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const h of list){
    const q = h.coord ? h.coord.q : h.q;
    const r = h.coord ? h.coord.r : h.r;
    const c = hexAxialToPixel(q, r, size);
    if(c.x - size  < minX) minX = c.x - size;
    if(c.x + size  > maxX) maxX = c.x + size;
    if(c.y - halfH < minY) minY = c.y - halfH;
    if(c.y + halfH > maxY) maxY = c.y + halfH;
  }
  minX -= margin; minY -= margin; maxX += margin; maxY += margin;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// Flat-top axial neighbour deltas in EDGE order (M4): edge i (between corner i and corner
// (i+1)%6 of hexCornerPoints) faces the neighbour at (q+dq, r+dr). This pairing lets the UI
// compute domain borders (an edge whose neighbour is in a different domain / absent) and
// road/river networks (segments toward like-featured neighbours) — Architecture §11.4.
const HEX_EDGE_DELTAS = Object.freeze([ [1,0], [0,1], [-1,1], [-1,0], [0,-1], [1,-1] ]);
function hexNeighborDeltas(){ return HEX_EDGE_DELTAS.map(d => d.slice()); }
// The two endpoints [{x,y},{x,y}] of edge `i` (0..5) of the hex at axial (q,r). Edge i spans
// corner i → corner (i+1)%6, and faces neighbour (q,r)+HEX_EDGE_DELTAS[i].
function hexEdgePoints(q, r, size, i){
  size = size || MAP_DEFAULT_HEX_SIZE;
  const c = hexAxialToPixel(q, r, size);
  const cor = hexCornerPoints(c.x, c.y, size);
  return [ cor[((i % 6) + 6) % 6], cor[(((i % 6) + 6) % 6 + 1) % 6] ];
}

// RAW-style column-row display label (RR p.273 "hex 401" convention; published Auran maps use
// 4-digit COLROW). Axial {q,r} stays the canonical truth (shown in the tooltip); this is the
// GM-familiar secondary. Flat-top: column = q; the row undoes the half-column vertical shear
// (odd-q axial→offset, redblobgames) so hexes at the same visual height share a row number.
// Coords can be negative (the store is relative to no fixed origin), so negatives carry a '-'.
function hexDisplayLabel(q, r){
  const col = q;
  const row = r + ((q - (q & 1)) >> 1); // odd-q axial→offset row (exact: numerator is always even)
  const pad = n => (n < 0 ? '-' : '') + String(Math.abs(n)).padStart(2, '0');
  return pad(col) + pad(row);
}

// THE canonical hex display name — used everywhere a hex is referred to in prose (the hex card,
// World › Hexes, Activities, journey routes, character location). Standard (Architecture §11.3):
//   • a hex with a settlement →  "<Settlement> (<coords>)"   e.g. "Saltspur (0000)"
//   • else a hex with terrain →  "<Terrain> (<coords>)"      e.g. "Forest (0100)"
//   • else                     →  "<coords>"                  e.g. "0301"
// <coords> is the RAW column-row label (hexDisplayLabel). This does NOT replace the bare
// column-row number drawn at the top of each hex on the map. Terrain is Title-cased; the domain
// is NOT part of the name (callers add "in <domain>" separately where useful).
function hexName(hex){
  if(!hex) return '';
  const coords = hex.coord ? hexDisplayLabel(hex.coord.q, hex.coord.r) : '';
  const settlement = (hex.settlement && hex.settlement.name) ? String(hex.settlement.name).trim() : '';
  let base = settlement;
  if(!base && hex.terrain){
    const t = String(hex.terrain).trim();
    base = t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  if(!base) return coords;
  return coords ? (base + ' (' + coords + ')') : base;
}

// ── Fill-layer palettes (M2). Color a hex by one attribute at a time. ──
const HEX_TERRAIN_COLORS = Object.freeze({
  barrens:'#cdbfa6', desert:'#e7d9a0', forest:'#3f7d4e', grassland:'#9cc46b',
  hills:'#bda05a', jungle:'#2f6b3a', mountains:'#8d9095', scrubland:'#c2b46a', swamp:'#6b7d52'
});
// Common GM/author synonyms → the 9 canonical base types, so a campaign that says "plains" or
// "woods" still colors (RAW has no single master terrain list — §2.2; the templates + demo use
// "plains"/"coast"). Unknown terms stay neutral. "coast" is a water-adjacent LAND hex, not a base
// type — mapped to grassland for now (a distinct coastal / Sea fill is reserved, plan §2.2).
const HEX_TERRAIN_ALIASES = Object.freeze({
  plains:'grassland', plain:'grassland', steppe:'grassland', prairie:'grassland', meadow:'grassland',
  farmland:'grassland', fields:'grassland', pasture:'grassland', savanna:'grassland', savannah:'grassland',
  coast:'grassland', coastal:'grassland', shore:'grassland', shoreline:'grassland', seaside:'grassland', beach:'grassland',
  woods:'forest', woodland:'forest', woodlands:'forest', taiga:'forest', boreal:'forest',
  mountain:'mountains', peaks:'mountains', alpine:'mountains',
  hill:'hills', highlands:'hills',
  marsh:'swamp', marshland:'swamp', bog:'swamp', fen:'swamp', wetland:'swamp', wetlands:'swamp',
  scrub:'scrubland', heath:'scrubland', moor:'scrubland', moorland:'scrubland',
  waste:'barrens', wastes:'barrens', wasteland:'barrens', tundra:'barrens', badlands:'barrens',
  sand:'desert', dunes:'desert', sandy:'desert',
  rainforest:'jungle', rainforests:'jungle', tropical:'jungle'
});
const HEX_CLASSIFICATION_COLORS = Object.freeze({
  civilized:'#2c7fb8', borderlands:'#7fcdbb', outlands:'#edf8b1', unsettled:'#d9d2c0'
});
// Sequential YlGn ramp for land value 3..9 (RR p.341) — 7 distinct buckets.
const HEX_LANDVALUE_RAMP = Object.freeze(['#f7fcb9','#d9f0a3','#addd8e','#78c679','#41ab5d','#238443','#005a32']);
const HEX_FILL_UNKNOWN   = '#d9d2c0'; // neutral parchment — blank/unknown attribute
const HEX_FILL_UNCLAIMED = '#cbc6b8'; // neutral grey — domainId == null
// M6 domain-aware + extra fill palettes (the rest of the §4.1 catalog).
const HEX_SECURED_COLORS = Object.freeze({ // RR p.338/348 stronghold-adequacy bands (per domain)
  adequate:'#3aa35a', half:'#e8c34a', quarter:'#e08a3c', critical:'#cc4125', none:HEX_FILL_UNKNOWN
});
const HEX_ECONOMY_COLORS = Object.freeze({ agricultural:'#9cc46b', pastoralist:'#cda85b', mining:'#9a8aa8' });
const HEX_POP_CEILING    = Object.freeze({ civilized:780, borderlands:375, outlands:185, unsettled:185 }); // RR p.340
// Diverging red→green morale ramp for −4..+4 (9 steps), index = clamp(round(m),−4,4)+4.
const HEX_MORALE_RAMP = Object.freeze(['#cc4125','#e0653c','#e8a24a','#e8c34a','#dcdc8c','#bfe08a','#8fd06a','#5cb85c','#3aa35a']);
function _moraleColor(m){ return HEX_MORALE_RAMP[Math.max(-4, Math.min(4, Math.round(Number(m) || 0))) + 4]; }

// Stable hue (0..359) from a string id — deterministic, so a domain keeps its color across renders.
function _mapHashHue(str){
  str = String(str || '');
  let h = 0;
  for(let i = 0; i < str.length; i++){ h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return h % 360;
}
function _domainFill(domainId){
  if(!domainId) return HEX_FILL_UNCLAIMED;
  return 'hsl(' + _mapHashHue(domainId) + ', 55%, 72%)';
}

// The fill color for a hex under a given layer. Deterministic + stable per input (M2 DoD).
// Hex-only layers (terrain/domain/land-value/classification/population/economy/exploration) ignore
// `ctx`; domain-aggregate layers (secured/morale) read precomputed per-domain maps from `ctx`
// (the engine has no campaign reference) — `ctx.securedStateByDomain[id]`, `ctx.moraleByDomain[id]`.
// Unknown/blank values fall back to neutral parchment so the map never renders a hole.
function hexFillColor(hex, layer, ctx){
  hex = hex || {};
  switch(layer){
    case 'domain':
      return _domainFill(hex.domainId);
    case 'land-value': {
      const v = Number(hex.valuePerFamily);
      if(!Number.isFinite(v) || v < 3) return HEX_FILL_UNKNOWN;
      return HEX_LANDVALUE_RAMP[Math.min(9, Math.max(3, Math.round(v))) - 3];
    }
    case 'classification': {
      const c = String(hex.classification || '').trim().toLowerCase();
      return HEX_CLASSIFICATION_COLORS[c] || HEX_FILL_UNKNOWN;
    }
    case 'population': { // families as a fraction of the classification ceiling (RR p.340)
      const fam = Number(hex.families) || 0;
      if(fam <= 0) return HEX_FILL_UNKNOWN;
      const cap = HEX_POP_CEILING[String(hex.classification || '').trim().toLowerCase()] || 185;
      const ratio = Math.max(0, Math.min(1, fam / cap));
      return HEX_LANDVALUE_RAMP[Math.round(ratio * (HEX_LANDVALUE_RAMP.length - 1))];
    }
    case 'morale': { // domain morale −4..+4 (diverging); needs ctx.moraleByDomain
      if(!hex.domainId) return HEX_FILL_UNCLAIMED;
      const m = ctx && ctx.moraleByDomain ? ctx.moraleByDomain[hex.domainId] : null;
      return (m == null) ? HEX_FILL_UNKNOWN : _moraleColor(m);
    }
    case 'secured': { // per-domain stronghold adequacy (RR p.338); needs ctx.securedStateByDomain
      if(!hex.domainId) return HEX_FILL_UNCLAIMED;
      const st = ctx && ctx.securedStateByDomain ? ctx.securedStateByDomain[hex.domainId] : null;
      return HEX_SECURED_COLORS[st] || HEX_FILL_UNKNOWN;
    }
    case 'economy': {
      const e = String(hex.economyType || 'agricultural').trim().toLowerCase().split('-')[0];
      return HEX_ECONOMY_COLORS[e] || HEX_FILL_UNKNOWN;
    }
    case 'exploration':
      return hex.explored === false ? '#6b6450' : '#cfe3b0'; // fogged vs explored
    case 'terrain':
    default: {
      // Tolerate MM biome sub-types ("Forest (Taiga)" → "forest"), any casing, and common synonyms.
      const t = String(hex.terrain || '').split('(')[0].trim().toLowerCase();
      return HEX_TERRAIN_COLORS[HEX_TERRAIN_ALIASES[t] || t] || HEX_FILL_UNKNOWN;
    }
  }
}

// The fill-layer catalog driving the "Color by:" radio (the full §4.1 set). Adding another
// layer is one entry here + one case in hexFillColor + one branch in hexFillLegend.
function hexFillLayers(){
  return [
    { id:'terrain',        label:'Terrain' },
    { id:'domain',         label:'Domain' },
    { id:'land-value',     label:'Land value' },
    { id:'classification', label:'Classification' },
    { id:'population',     label:'Population' },
    { id:'morale',         label:'Domain morale' },
    { id:'secured',        label:'Secured' },
    { id:'economy',        label:'Economy' },
    { id:'exploration',    label:'Exploration' }
  ];
}

// Legend rows [{label, color}] for the active fill layer. The 'domain' layer needs the
// campaign's domains (array of {id,name}) to enumerate; the rest are static palettes.
function hexFillLegend(layer, domains){
  switch(layer){
    case 'domain': {
      const rows = (domains || []).map(d => ({ label: d.name || d.id, color: _domainFill(d.id) }));
      rows.push({ label: 'Unclaimed', color: HEX_FILL_UNCLAIMED });
      return rows;
    }
    case 'land-value':
      return HEX_LANDVALUE_RAMP.map((c, i) => ({ label: (i + 3) + ' gp', color: c }));
    case 'classification':
      return [['Civilized','civilized'],['Borderlands','borderlands'],['Outlands','outlands'],['Unsettled','unsettled']]
        .map(pair => ({ label: pair[0], color: HEX_CLASSIFICATION_COLORS[pair[1]] }));
    case 'population':
      return [{ label:'Low', color:HEX_LANDVALUE_RAMP[0] }, { label:'Mid', color:HEX_LANDVALUE_RAMP[3] }, { label:'At ceiling', color:HEX_LANDVALUE_RAMP[HEX_LANDVALUE_RAMP.length - 1] }];
    case 'morale':
      return [{ label:'−4', color:_moraleColor(-4) }, { label:'0', color:_moraleColor(0) }, { label:'+4', color:_moraleColor(4) }];
    case 'secured':
      return [['Adequate','adequate'],['Below min','half'],['Below ½','quarter'],['Critical','critical']]
        .map(pair => ({ label: pair[0], color: HEX_SECURED_COLORS[pair[1]] })).concat([{ label:'Unclaimed', color:HEX_FILL_UNCLAIMED }]);
    case 'economy':
      return [['Agricultural','agricultural'],['Pastoralist','pastoralist'],['Mining','mining']]
        .map(pair => ({ label: pair[0], color: HEX_ECONOMY_COLORS[pair[1]] }));
    case 'exploration':
      return [{ label:'Explored', color:'#cfe3b0' }, { label:'Unexplored', color:'#6b6450' }];
    case 'terrain':
    default:
      return Object.keys(HEX_TERRAIN_COLORS).map(k => ({ label: k.charAt(0).toUpperCase() + k.slice(1), color: HEX_TERRAIN_COLORS[k] }));
  }
}

// ── M3 symbols + M4 edges: layer catalogs (toggle checkboxes) + glyph sizing. ──
// Settlement glyph radius as a multiple of `size`, ramped by the RR p.351 population
// benchmarks (Hamlet → Metropolis) so a glyph grows with market class.
function settlementGlyphScale(families){
  const n = Number(families) || 0;
  if(n >= 5000) return 0.42; // Large City / Metropolis (market I–II)
  if(n >= 1250) return 0.36; // City (III)
  if(n >= 500)  return 0.30; // Town (IV)
  if(n >= 100)  return 0.24; // Village (V–VI)
  if(n >= 1)    return 0.19; // Hamlet / small village
  return 0.16;
}
function mapSymbolLayers(){
  return [
    { id:'settlements', label:'Settlements' },
    { id:'strongholds', label:'Strongholds' },
    { id:'lairs',       label:'Lairs' },
    { id:'dungeons',    label:'Dungeons' },
    { id:'pois',        label:'POIs' }
  ];
}
function mapEdgeLayers(){
  return [
    { id:'borders', label:'Domain borders' },
    { id:'roads',   label:'Roads' },
    { id:'rivers',  label:'Rivers' },
    { id:'trails',  label:'Trails' }
  ];
}
// The 9 ACKS base terrain types (RR p.272/275; §2.2) for the create-hex picker — the same set
// the terrain fill palette and the travel/navigation catalogs key on. value = engine key
// (lowercase, what the catalogs expect), label = Title Case for display.
function mapTerrainTypes(){
  return Object.keys(HEX_TERRAIN_COLORS).map(k => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }));
}

// ─── Attach to ACKS namespace ────────────────────────────────────────────
const ACKS = global.ACKS = global.ACKS || {};
Object.assign(ACKS, {
  CALENDARS, calendarFor, monthName, seasonFor, currentDateString, advanceCalendarOneMonth, advanceCalendarOneDay, rollLoyaltyCheck, tickHenchmanLoyalty, RUMOR_TOPICS, RUMOR_APPARENT_LEVELS, RUMOR_TRUTH_LEVELS, RUMOR_PROLIFERATION_CHANCE, blankRumor, tickRumorApparentLevels, NOTABILITY_CATEGORIES, ENTRYWAY_KINDS, ENTRYWAY_SECURITY, ASSET_RESTRICTIONS, ENTRYWAY_INSPECTION_DEFAULT, computeTransactionThreshold, blankNotability, blankEntryway, blankRegulatedAsset, travelEstimate, rollEncounter, applyTravelTick,
  // Phase 2.5 Journeys (#475 — J1 + J2) — overland travel day-tick consumer.
  tickJourneyDay, proposeJourneyDay, commitJourneyRecord, startJourney, abortJourney, rerollJourneyDay, journeyLastDayRerollable, computeJourneyDistance, rollNavigation,
  // Phase 2.95 §4.2 — Hireling recruitment engine helpers.
  parseAvailabilitySpec, rollAvailabilitySpec, rollAvailabilitySpecDetailed, rollDiceNotation, rollDiceNotationDetailed, rollAvailability, rollAvailabilityDetailed, resolveSolicitFee, rollReactionToHiring, computeReactionMods, solicitHirelings, individuateHirelingCandidate,
  findPersistentCandidates, computeEffectiveLoyalty,
  // Phase 2.5 Map Mode (#225) — pure geometry + fill-layer helpers (Architecture §11).
  // M0–M2: projection, bounds, labels, fill layers. M3–M6: adjacency/edges, glyph sizing, layer catalogs.
  MAP_DEFAULT_HEX_SIZE, hexAxialToPixel, hexCornerPoints, hexPolygonPoints, hexMapBounds, hexDisplayLabel, hexName,
  hexNeighborDeltas, hexEdgePoints, settlementGlyphScale, mapSymbolLayers, mapEdgeLayers, mapTerrainTypes,
  HEX_TERRAIN_COLORS, HEX_CLASSIFICATION_COLORS, HEX_LANDVALUE_RAMP, hexFillColor, hexFillLayers, hexFillLegend
});

// Register the Journeys consumer in the §14 shape (Calendar §10.2 slot 30 — travel).
// registerDayConsumer + the day-tick orchestrator ship from acks-engine.js (loaded first),
// so ACKS.registerDayConsumer is available here. pauseTriggers wire the auto-pause-* rules.
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('journeys', {
    handler: proposeJourneyDay,
    order: 30,
    pauseTriggers: ['encounter', 'navigation-fail', 'supplies-low'],
    commit: commitJourneyRecord
  });
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
