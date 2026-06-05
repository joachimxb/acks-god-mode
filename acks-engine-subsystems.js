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
// §27 — the coord the route is anchored at: routeAnchorCoord (set while straying off authored hexes)
// takes precedence, else the coord of routeAnchorHexId (mid-journey re-route) or startHexId (true
// origin). Returns {q,r} or null. This lets a lost party's route resolve from a trackless-wilderness
// coord that has no hex id. Pure read.
function _journeyStartCoord(campaign, journey){
  const A = _jACKS();
  if(journey && journey.routeAnchorCoord && typeof journey.routeAnchorCoord.q === 'number'){
    return { q: journey.routeAnchorCoord.q, r: journey.routeAnchorCoord.r };
  }
  const h = A.resolveHexAnywhere(campaign, (journey && (journey.routeAnchorHexId || journey.startHexId)) || null);
  return (h && h.coord) ? { q: h.coord.q, r: h.coord.r } : null;
}

function computeJourneyDistance(campaign, journey){
  const A = _jACKS();
  // startHex = the route anchor (current position after a re-route / while straying, else the true
  // origin). Resolve by coord first (a strayed anchor may sit on an UNauthored hex), then by id.
  const startCoord = _journeyStartCoord(campaign, journey);
  let startHex = startCoord ? A.hexAtCoord(campaign, startCoord.q, startCoord.r) : null;
  if(!startHex) startHex = A.resolveHexAnywhere(campaign, journey.routeAnchorHexId || journey.startHexId);
  if(!startHex && startCoord) startHex = { coord: startCoord, terrain: null };  // synthetic anchor for trackless wilderness (§27)
  const destHex  = A.resolveHexAnywhere(campaign, journey.destinationHexId);
  // total = the actual VIA-WAYPOINT hex distance (route.length-1), not the direct start→dest distance —
  // so a waypointed (or re-routed) journey travels its whole route instead of arriving early at the
  // direct-line count. Falls back to the direct metric only if the route can't be built.
  let total = 0;
  try { const r = journeyRoute(campaign, journey); if(r && r.length) total = r.length - 1; } catch(e){ /* fall through */ }
  if(!total && startHex && destHex && startHex.coord && destHex.coord) total = A.hexAxialDistance(startHex.coord, destHex.coord);
  // covered is EPOCH-relative: total hexes walked minus the baseline banked at the last re-route, so a
  // re-routed journey's progress counts from the anchor. coveredBaseline defaults 0 (never re-routed).
  const rawCovered = (journey.days || []).reduce((s, d) => s + ((d && d.hexesTraveled) || 0), 0);
  const covered = Math.max(0, rawCovered - (journey.coveredBaseline || 0));
  const remaining = Math.max(0, total - covered);
  return { total, covered, remaining, startHex, destHex };
}

// §24 — the ordered hexes a journey passes THROUGH, start→(waypoints)→destination, as a straight
// hex-line over the grid (deterministic; the epsilon nudge makes every step edge-adjacent). Each
// entry: { coord:{q,r}, hexId, hex, entrySide, exitSide }. hex/hexId are null where no hex is
// authored at that coord (the route still crosses that geography — the day handler falls back to the
// journey's base environment there, so per-side travel effects apply only where cartography exists).
// entrySide/exitSide are the edge indices (0..5) crossed into / out of that hex (null at the ends).
// Pure read; route.length-1 === computeJourneyDistance().total by construction.
function journeyRoute(campaign, journey){
  const A = _jACKS();
  if(!campaign || !journey) return [];
  // §24/§27 — the route runs from the anchor coord (a strayed/re-routed position, else the true origin),
  // so the live/remaining route reflects where the party actually is — even on an UNauthored hex.
  const startCoord = _journeyStartCoord(campaign, journey);
  if(!startCoord) return [];
  const dest = A.resolveHexAnywhere(campaign, journey.destinationHexId);
  const legs = [startCoord];
  for(const wp of (journey.waypoints || [])){
    const wh = A.resolveHexAnywhere(campaign, wp && wp.hexId);
    if(wh && wh.coord) legs.push(wh.coord);
  }
  legs.push((dest && dest.coord) ? dest.coord : start.coord);
  const coords = [];
  for(let i = 0; i < legs.length - 1; i++){
    const seg = hexLineDraw(legs[i], legs[i + 1]);
    for(let j = (i === 0 ? 0 : 1); j < seg.length; j++) coords.push(seg[j]);
  }
  const route = coords.map(c => {
    const hex = A.hexAtCoord(campaign, c.q, c.r);
    return { coord: { q: c.q, r: c.r }, hexId: hex ? hex.id : null, hex: hex || null, entrySide: null, exitSide: null };
  });
  for(let i = 0; i < route.length - 1; i++){
    const side = hexEdgeBetween(route[i].coord, route[i + 1].coord);
    if(side >= 0){ route[i].exitSide = side; route[i + 1].entrySide = hexOppositeEdge(side); }
  }
  return route;
}

// §24 — does traversing `hex` (entering via entrySide, leaving via exitSide; either null at a route
// end) earn the road movement bonus (×3/2, no getting lost, safe encounter column — RR p.272/p.275)?
// The coarse legacy hex.hasRoad flag (the pre-§24 signal) counts as a road throughout the hex, so
// existing saves keep their behaviour. Otherwise the per-side roadSides apply Joachim's rule: a
// pass-through hex needs a road on BOTH the entered and exited sides (the road connects them); a hex
// the journey ENDS in (no exit side) needs a road on the entered side; a hex it STARTS from (no entry
// side) needs one on the exit side. Pure.
function roadBonusForStep(hex, entrySide, exitSide){
  if(!hex) return false;
  if(hex.hasRoad === true) return true;
  const rs = hex.roadSides;
  if(!Array.isArray(rs) || !rs.length) return false;
  const norm = s => (((s % 6) + 6) % 6);
  const hasEntry = (entrySide == null) || rs.indexOf(norm(entrySide)) >= 0;
  const hasExit  = (exitSide  == null) || rs.indexOf(norm(exitSide))  >= 0;
  return hasEntry && hasExit;
}

// §24 — what happens crossing the edge between fromHex and toHex (exitSide on fromHex). The editor
// mirrors river + crossing marks onto both hexes (a river on side i of A is recorded as side (i+3)%6
// of B), so either hex answers. Returns { barrier, crossingType, swimmingThrowNeeded }:
//   • no river on the edge                              → barrier:false, 'none'
//   • river + ford/bridge mark (crossingSides)          → barrier:true,  'ford'            (free, RAW negates the barrier)
//   • river + a road runs onto it (roadSides ∩ river)   → barrier:true,  'implicit-bridge' (free — a road crossing a river IS a bridge)
//   • river, unbridged + unforded                       → barrier:true,  'swim'            (Swimming throw, RR p.271)
// Pure.
function riverCrossingForStep(fromHex, toHex, exitSide){
  const none = { barrier: false, crossingType: 'none', swimmingThrowNeeded: false };
  if(exitSide == null) return none;
  const a = (((exitSide % 6) + 6) % 6), b = hexOppositeEdge(a);
  const has = (hex, key, side) => !!(hex && Array.isArray(hex[key]) && hex[key].indexOf(side) >= 0);
  if(!(has(fromHex, 'riverSides', a) || has(toHex, 'riverSides', b))) return none;
  if(has(fromHex, 'crossingSides', a) || has(toHex, 'crossingSides', b)) return { barrier: true, crossingType: 'ford', swimmingThrowNeeded: false };
  if(has(fromHex, 'roadSides', a)     || has(toHex, 'roadSides', b))     return { barrier: true, crossingType: 'implicit-bridge', swimmingThrowNeeded: false };
  return { barrier: true, crossingType: 'swim', swimmingThrowNeeded: true };
}

// §24 / RR p.271 — simplified party Swimming throw to ford an UNbridged river edge. RAW is a per-round
// 11+ throw modified by Strength/encumbrance, −2/−4 in cold/rough-or-fast water, with failure risking
// drowning; full per-character per-round drowning resolution is deferred to Phase 3.6 Proficiency
// Throws. For now this is ONE party throw — base 11+, +2 if a participant carries a relevant
// proficiency (mirrors the J1 nav bonus), the cold/rough penalties folded into the target. On failure
// the day handler holds the party at the near bank and surfaces a 'fording' pause event for the GM.
function _journeyFordBonus(campaign, journey){
  const ids = (journey && journey.participantCharacterIds) || [];
  const RE = /(swimming|athletics|adventuring|survival|seafaring)/i;
  let bonus = 0;
  for(const c of ((campaign && campaign.characters) || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    for(const p of (c.proficiencies || [])){
      const name = (typeof p === 'string') ? p : ((p && (p.name || p.id || p.proficiency)) || '');
      if(RE.test(name)) bonus = Math.max(bonus, 2);
    }
  }
  return bonus;
}
function journeyFordingThrow(campaign, journey, opts){
  opts = opts || {};
  const rng = opts.rng || Math.random;
  let target = 11;
  if(opts.coldWater)  target += 2;   // a −2 to the throw is a +2 to the target
  if(opts.roughWater) target += 4;
  const bonus = _journeyFordBonus(campaign, journey);
  const rolled = 1 + Math.floor(rng() * 20);
  const total = rolled + bonus;
  return { rolled, bonus, target, total, success: total >= target, coldWater: !!opts.coldWater, roughWater: !!opts.roughWater };
}

// §7 — navigation throw (1d20 + party proficiency bonus ≥ terrain target). RR p.275: an unmodified
// natural 1 ALWAYS fails, regardless of bonus. Pure given rng.
function rollNavigation(navTarget, bonus, rng){
  rng = rng || Math.random;
  const rolled = 1 + Math.floor(rng() * 20);
  const total = rolled + (bonus || 0);
  const naturalOne = (rolled === 1);
  return { rolled, target: navTarget, bonus: bonus || 0, total, naturalOne, success: !naturalOne && total >= navTarget };
}

// §7 navigation-throw bonus (RR p.275): +4 if any traveller has the Navigation proficiency OR the
// Pathfinding class power, +8 if the party collectively has BOTH. Nothing else modifies this throw —
// Land Surveying (points-of-interest assessment), Adventuring (camp/first-aid/etc.), Survival, and
// Seafaring (sea navigation, a different throw) do NOT help a land getting-lost check. Pathfinding is a
// class power; Navigation is a proficiency — scan both lists (some saves list either in either). Pure.
function _journeyNavBonus(campaign, journey){
  const ids = journey.participantCharacterIds || [];
  let hasNav = false, hasPath = false;
  const scan = (entry) => {
    const name = (typeof entry === 'string') ? entry : ((entry && (entry.name || entry.id || entry.proficiency)) || '');
    if(/\bnavigation\b/i.test(name)) hasNav = true;
    if(/\bpathfinding\b/i.test(name)) hasPath = true;
  };
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    for(const p of (c.proficiencies || [])) scan(p);
    for(const cp of (c.classPowers || [])) scan(cp);
  }
  return (hasNav && hasPath) ? 8 : (hasNav || hasPath) ? 4 : 0;
}

// §12 (J1 STUB) — per-day wilderness encounter check. On a hit, returns a placeholder
// "GM, resolve this" encounter + notable event (pauseTrigger 'encounter'); the real
// pool-first draw (lairs / persistent wanderers / rival journeys) lands with #476, and
// Phase 3 #141 owns the actual tables. Roads are safe in J1. Pure given rng.
// Travel pivot (2026-06-04): a journey's auto-name describes WHO is travelling, not the route.
//   - a PARTY moving → the party's name;
//   - a single character (no party) → that character's name;
//   - a group of ≥2 characters (no party) → "<first character to join>'s travelling group"
//     (participantCharacterIds[0] = the first traveller added).
// Returns null when there's no named traveller yet (caller falls back to a route label / "Journey").
// `journey` may be a real journey or a {partyId, participantCharacterIds} shape (the planner uses the latter).
function journeyDefaultName(campaign, journey){
  if(!journey) return null;
  if(journey.partyId && campaign && Array.isArray(campaign.parties)){
    const p = campaign.parties.find(x => x && x.id === journey.partyId);
    if(p && (p.name || '').trim()) return p.name.trim();
  }
  const ids = (journey.participantCharacterIds || []).filter(Boolean);
  const chars = (campaign && campaign.characters) || [];
  const nameOf = id => { const c = chars.find(x => x && x.id === id); return (c && (c.name || '').trim()) ? c.name.trim() : null; };
  if(ids.length === 1) return nameOf(ids[0]);
  if(ids.length >= 2){ const n = nameOf(ids[0]); return n ? (n + "'s travelling group") : null; }
  return null;
}

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

// ─── Phase 2.5 Provisioning (RR p.278 "Surviving the Wild") — per-member food/water ───────────────
// V2/V3: the daily survival resolution. Replaces the old first-participant-only hunger/dehydration read.
// Food is discrete ration items in a member's carry inventory and (when sharing) the party camp stash;
// water is the metered waterDaysCarried counter on each member (+ the camp's barrels). The abstract
// journey.supplies.{rations,waterRations} counters are SEEDED into tight inventory at launch/load
// (seedJourneyProvisions) — decision #1 (real inventory, not an abstract counter).

// "Hex contains fresh water" (§4.1 step 1): a river edge, a lake, a freshwater 'water' body, a
// settlement (wells/markets — 🔧), or a neighbouring FRESH body. Bordering a SALT sea grants nothing.
function _journeyBordersFreshWater(campaign, hex){
  if(!campaign || !hex || !hex.coord || typeof _jACKS().hexAtCoord !== 'function') return false;
  const A = _jACKS();
  for(const d of HEX_EDGE_DELTAS){
    const n = A.hexAtCoord(campaign, hex.coord.q + d[0], hex.coord.r + d[1]);
    if(!n) continue;
    if(n.hasLake === true) return true;
    if(n.terrain === 'water' && n.freshWater === true) return true;
  }
  return false;
}
function hasFreshSource(campaign, hex){
  if(!hex) return false;
  if(Array.isArray(hex.riverSides) && hex.riverSides.length > 0) return true;
  if(hex.hasLake === true) return true;
  if(hex.terrain === 'water' && hex.freshWater === true) return true;
  if(hex.settlement) return true;                                   // a settlement guarantees water (🔧)
  if(_journeyBordersFreshWater(campaign, hex)) return true;
  return false;
}

// Idempotent: convert a journey's legacy abstract supplies into tight inventory — ration days into a
// camp ration line (or the first participant's pack when partyless) + waterRations spread across the
// members' waterDaysCarried. Called from startJourney + migrateCampaign so every path lands tight.
function seedJourneyProvisions(campaign, journey){
  const A = _jACKS();
  if(!campaign || !journey || journey._provisionsSeeded) return;
  const sup = journey.supplies || {};
  const rations = Number(sup.rations) || 0;
  const water = Number(sup.waterRations) || 0;
  const ids = (journey.participantCharacterIds || []).filter(Boolean);
  if(rations > 0 && typeof A.makeRationLine === 'function'){
    const line = A.makeRationLine({ rationType: 'iron', daysRemaining: rations });
    const party = journey.partyId ? (campaign.parties || []).find(p => p && p.id === journey.partyId) : null;
    const camp = (party && typeof A.ensurePartyCampStash === 'function') ? A.ensurePartyCampStash(campaign, party) : null;
    if(camp){ camp.items = camp.items || []; camp.items.push(line); }
    else { const c0 = (campaign.characters || []).find(c => c && c.id === ids[0]); if(c0){ c0.inventory = c0.inventory || []; c0.inventory.push(line); } }
  }
  if(water > 0 && ids.length){
    const per = water / ids.length;
    for(const id of ids){ const c = (campaign.characters || []).find(x => x && x.id === id); if(c) c.waterDaysCarried = (Number(c.waterDaysCarried) || 0) + per; }
  }
  journey.supplies = Object.assign({}, sup, { rations: 0, waterRations: 0 });
  journey._provisionsSeeded = true;
}

// Drain up to nDays person-day rations from an inventory array's ration lines (peels daysRemaining,
// keeps the line stone in sync, drops emptied lines). Mutates `inv`. Returns days actually drawn.
function _drawRationDays(inv, nDays){
  const A = _jACKS();
  if(!Array.isArray(inv) || nDays <= 0) return 0;
  let need = nDays, drawn = 0;
  for(const it of inv){
    if(need <= 0) break;
    if(!A.isRationLine(it)) continue;
    const have = Math.max(0, Number(it.daysRemaining) || 0);
    if(have <= 0) continue;
    const take = Math.min(have, need);
    it.daysRemaining = have - take;
    it.stone = it.daysRemaining * (A.RATION_FOOD_ST_PER_DAY || 1 / 6);
    need -= take; drawn += take;
  }
  for(let i = inv.length - 1; i >= 0; i--){ const it = inv[i]; if(A.isRationLine(it) && (Number(it.daysRemaining) || 0) <= 0) inv.splice(i, 1); }
  return drawn;
}

// The per-member daily survival resolution (§4.1 water, §4.2 food, §6 sharing). PURE — reads campaign
// state, simulates on clones, returns the post-state absolutes commit replays. Food/water sources, the
// forage-water throw, the share-rations pooling (camp-first, leader-priority), and the §1.2/§1.3
// deficit ladders + CON loss all live here. The day-tick splices this in; commit applies it.
function journeyDaySurvival(campaign, journey, hex, opts){
  const A = _jACKS();
  opts = opts || {};
  const rng = opts.rng || Math.random;
  const FOOD_ST = A.RATION_FOOD_ST_PER_DAY || 1 / 6;
  const out = { ignored: false, waterSourced: false, waterForage: null, members: {}, inventoryUpdates: {}, campItems: null, campWater: null, notableEvents: [], anyHungry: false, anyThirsty: false, anyCritical: false };
  if(A.isHouseRuleEnabled(campaign, 'ignore-rations')){ out.ignored = true; return out; }

  const ids = (journey.participantCharacterIds || []).filter(Boolean);
  const members = ids.map(id => (campaign.characters || []).find(c => c && c.id === id)).filter(Boolean);
  if(!members.length) return out;

  const share = !!journey.shareRations;
  const party = journey.partyId ? (campaign.parties || []).find(p => p && p.id === journey.partyId) : null;
  const camp = (party && typeof A.partyCampStash === 'function') ? A.partyCampStash(campaign, party.id) : null;
  // Leader-first ordering (decision #8, 🔧): the party leader, then the others in a stable order.
  const leaderId = party ? (party.leaderCharacterId || (Array.isArray(party.memberCharacterIds) && party.memberCharacterIds[0]) || null) : null;
  const order = members.slice().sort((a, b) => (a.id === leaderId ? -1 : b.id === leaderId ? 1 : 0));

  // working clones (tick is pure) — full inventories so non-ration items survive the record.
  const M = {};
  for(const c of members){
    M[c.id] = {
      id: c.id,
      inv: JSON.parse(JSON.stringify(c.inventory || [])),
      water: Number(c.waterDaysCarried) || 0,
      waterCap: (typeof A.waterCapacityDays === 'function') ? A.waterCapacityDays(c) : 0,
      foodDeficitDays: (typeof c.foodDeficitDays === 'number') ? c.foodDeficitDays : (Number(c.hungerDays) || 0),
      waterDeficitDays: (typeof c.waterDeficitDays === 'number') ? c.waterDeficitDays : (Number(c.dehydrationDays) || 0),
      conLossHunger: Number(c.conLossHunger) || 0,
      conLossThirst: Number(c.conLossThirst) || 0,
      conBase: (c.abilities && Number(c.abilities.CON)) || 0,
      fedFood: false, fedWater: false
    };
  }
  const campItems = camp ? JSON.parse(JSON.stringify(camp.items || [])) : null;
  let campWater = camp ? (Number(camp.waterDaysCarried) || 0) : 0;
  let campWaterTouched = false, campItemsTouched = false;
  // Legacy abstract party stores (journey.supplies) as a SHARED fallback pool, drawn after personal +
  // (when sharing) camp. seedJourneyProvisions zeroes these at launch/load (decision #1 — real
  // inventory), so a provisioned journey is fully tight (pool 0); an unseeded/legacy one draws here and
  // behaves exactly as before. Recorded post-draw as newRations / newWaterRations.
  let poolRations = (journey.supplies && Number(journey.supplies.rations)) || 0;
  let poolWater = (journey.supplies && Number(journey.supplies.waterRations)) || 0;
  const hasOwnRation = inv => (inv || []).some(x => A.isRationLine(x) && (Number(x.daysRemaining) || 0) >= 1);

  // ── §4.1 WATER — free source → forage → drink (own → shared camp/others → shared pool), leader-first ──
  // forageNoSource (rerollJourneyForage): the day being re-rolled DID forage, so force the no-source forage
  // path regardless of how this hex resolves now. A reroll re-resolves day.hexId, which on an arrival day or
  // an unauthored day-start can land on a watered hex (the arrival hex / the last authored hex) where the
  // original tick had foraged on a sourceless environment — without this the throw would silently vanish.
  const forceForage = !!opts.forageNoSource;
  if(!forceForage && hasFreshSource(campaign, hex)){
    out.waterSourced = true;
    for(const c of members){ const m = M[c.id]; m.water = m.waterCap; m.fedWater = true; }   // free top-up to capacity
  } else {
    let foraged = false;
    if(journey.forageWaterEnabled){
      // one party Foraging throw (14+, 18+ barrens/desert; +4 if any member has Survival proficiency).
      // forageTarget pins the original throw's target so a reroll re-rolls the same throw, only the die.
      const dry = (hex && (hex.terrain === 'barrens' || hex.terrain === 'desert'));
      const target = (typeof opts.forageTarget === 'number') ? opts.forageTarget : (dry ? 18 : 14);
      const hasSurvival = members.some(c => (c.proficiencies || []).some(p => /survival/i.test(typeof p === 'string' ? p : (p && p.name) || '')));
      // forageReuse (reapplyLatestDaySurvival): reuse the day's existing throw instead of rolling, so a
      // re-resolve triggered by an unrelated toggle (share rations) leaves the water outcome undisturbed.
      const reuse = opts.forageReuse;
      const bonus = (reuse && typeof reuse.bonus === 'number') ? reuse.bonus : (hasSurvival ? 4 : 0);
      const rolled = (reuse && typeof reuse.rolled === 'number') ? reuse.rolled : (1 + Math.floor(rng() * 20));
      const success = (rolled + bonus) >= target;
      out.waterForage = { attempted: true, success, rolled, bonus, target, foragers: members.length };
      if(success){
        foraged = true;
        const credit = 3; // 3 days/forager, capped at each forager's container capacity (decision #9 — surplus lost)
        for(const c of members){ const m = M[c.id]; m.water = Math.min(m.waterCap || 0, Math.max(m.water, credit)); m.fedWater = true; }
      }
    }
    if(!foraged){
      for(const c of order){
        const m = M[c.id];
        if(m.water >= 1){ m.water -= 1; m.fedWater = true; continue; }                         // own reserve
        if(share && campWater >= 1){ campWater -= 1; campWaterTouched = true; m.fedWater = true; continue; }  // camp barrels
        if(share){ const d = order.find(o => M[o.id].water >= 1); if(d){ M[d.id].water -= 1; m.fedWater = true; continue; } }  // a comrade's reserve
        if(poolWater >= 1){ poolWater -= 1; m.fedWater = true; continue; }                      // legacy party stores
      }
    }
  }

  // ── §4.2 FOOD — own rations → (shared) camp → (shared) a comrade's → shared pool, leader-first ──
  for(const c of order){
    const m = M[c.id];
    if(_drawRationDays(m.inv, 1) > 0){ m.fedFood = true; continue; }                            // own pack
    if(share && campItems && _drawRationDays(campItems, 1) > 0){ campItemsTouched = true; m.fedFood = true; continue; }  // camp stash
    if(share){ const d = order.find(o => hasOwnRation(M[o.id].inv)); if(d && _drawRationDays(M[d.id].inv, 1) > 0){ m.fedFood = true; continue; } }  // a comrade's pack
    if(poolRations >= 1){ poolRations -= 1; m.fedFood = true; continue; }                       // legacy party stores
  }
  out.newRations = poolRations; out.newWaterRations = poolWater;

  // ── §1.2 / §1.3 ladders + CON loss (consecutive-deficit-day model — §12 simplification) ──
  for(const c of members){
    const m = M[c.id];
    let conLostHunger = 0, conLostThirst = 0;
    if(m.fedFood){
      m.foodDeficitDays = 0;
      if(m.conLossHunger > 0){ m.conLossHunger -= 1; conLostHunger = -1; }   // recover 1/day on a full ration
    } else {
      m.foodDeficitDays += 1;
      if(m.foodDeficitDays >= 7){ m.conLossHunger += 1; conLostHunger = 1; } // Starving: lose 1 CON/day
    }
    if(m.fedWater){
      m.waterDeficitDays = 0;
      if(m.conLossThirst > 0){ const rec = Math.min(3, m.conLossThirst); m.conLossThirst -= rec; conLostThirst = -rec; } // recover 3/day
    } else {
      m.waterDeficitDays += 1;
      const loss = 1 + Math.floor(rng() * 6); m.conLossThirst += loss; conLostThirst = loss;   // Dehydrated: 1d6 CON/day
    }
    const hungry = m.foodDeficitDays >= 1, underfed = m.foodDeficitDays >= 2, starving = m.foodDeficitDays >= 7;
    const dehydrated = m.waterDeficitDays >= 1;
    const effCon = m.conBase - m.conLossHunger - m.conLossThirst;
    const critical = m.conBase > 0 && effCon <= 0;
    if(hungry) out.anyHungry = true;
    if(dehydrated) out.anyThirsty = true;
    if(critical) out.anyCritical = true;
    out.members[c.id] = {
      fedFood: m.fedFood, fedWater: m.fedWater,
      waterDaysCarried: m.water,
      foodDeficitDays: m.foodDeficitDays, waterDeficitDays: m.waterDeficitDays,
      underfed, starving, dehydrated, hungry,
      conLossHunger: m.conLossHunger, conLossThirst: m.conLossThirst,
      conLostHunger, conLostThirst, effectiveCon: effCon, critical
    };
  }
  // record a member's new inventory only when its ration lines actually changed (others stay untouched)
  for(const c of members){ if(_invRationsDiffer(c.inventory, M[c.id].inv)) out.inventoryUpdates[c.id] = M[c.id].inv; }
  if(campItemsTouched) out.campItems = campItems;
  if(campWaterTouched) out.campWater = campWater;

  // ── transient notable signals (folded into the umbrella event; drive the pause check + day digest) ──
  const nm = (journey.name || 'Journey');
  if(out.anyHungry) out.notableEvents.push({ kind:'journey-day-tick', type:'hunger', pauseTrigger:'supplies-low', primaryHexId: journey.startHexId || null, label: nm + ': a traveller is going hungry (no food)', payload:{ journeyId: journey.id } });
  if(out.anyThirsty) out.notableEvents.push({ kind:'journey-day-tick', type:'dehydration', pauseTrigger:'supplies-low', primaryHexId: journey.startHexId || null, label: nm + ': a traveller is dehydrated (no water)', payload:{ journeyId: journey.id } });
  if(out.anyCritical) out.notableEvents.push({ kind:'journey-day-tick', type:'survival-critical', pauseTrigger:'supplies-low', primaryHexId: journey.startHexId || null, label: nm + ': a traveller is at death’s door (CON 0) — GM, resolve', payload:{ journeyId: journey.id } });
  // legacy party stores running low (only when nobody's actually going hungry yet)
  const lowAt = members.length * (A.JOURNEY_SUPPLY_LOW_DAYS || 3);
  if(!out.anyHungry && out.newRations > 0 && out.newRations < lowAt) out.notableEvents.push({ kind:'journey-day-tick', type:'supplies-low', pauseTrigger:'supplies-low', primaryHexId: journey.startHexId || null, label: nm + ': party stores low (' + out.newRations + ' rations left)', payload:{ journeyId: journey.id } });
  return out;
}
// True when two inventories' ration lines differ (count or remaining days) — so commit only rewrites
// a member's inventory when its food actually changed.
function _invRationsDiffer(a, b){
  const A = _jACKS();
  const ra = (a || []).filter(x => A.isRationLine(x)).map(x => (x.catalogId || x.name) + ':' + (Number(x.daysRemaining) || 0)).join('|');
  const rb = (b || []).filter(x => A.isRationLine(x)).map(x => (x.catalogId || x.name) + ':' + (Number(x.daysRemaining) || 0)).join('|');
  return ra !== rb;
}
// Apply the recorded survival absolutes to the campaign (called by commitJourneyRecord). Sets each
// member's water + deficit counters + condition flags + CON loss, rewrites changed inventories, and
// updates the camp stash's rations/water. Mirrors the legacy hungerDays/dehydrationDays for back-compat.
function applyJourneyDaySurvival(campaign, journey, survival){
  if(!campaign || !survival || survival.ignored || !survival.members) return;
  for(const id of Object.keys(survival.members)){
    const c = (campaign.characters || []).find(x => x && x.id === id);
    if(!c) continue;
    const m = survival.members[id];
    c.waterDaysCarried = m.waterDaysCarried;
    c.foodDeficitDays = m.foodDeficitDays;
    c.waterDeficitDays = m.waterDeficitDays;
    c.underfed = m.underfed; c.starving = m.starving; c.dehydrated = m.dehydrated;
    c.conLossHunger = m.conLossHunger; c.conLossThirst = m.conLossThirst;
    c.hungerDays = m.foodDeficitDays; c.dehydrationDays = m.waterDeficitDays;   // legacy mirror
    if(survival.inventoryUpdates && survival.inventoryUpdates[id]) c.inventory = survival.inventoryUpdates[id];
  }
  if(survival.campItems != null || survival.campWater != null){
    const party = journey.partyId ? (campaign.parties || []).find(p => p && p.id === journey.partyId) : null;
    const camp = (party && global.ACKS && global.ACKS.partyCampStash) ? global.ACKS.partyCampStash(campaign, party.id) : null;
    if(camp){
      if(survival.campItems != null) camp.items = survival.campItems;
      if(survival.campWater != null) camp.waterDaysCarried = survival.campWater;
    }
  }
}

// §5.1 — resolve ONE day for ONE in-transit journey. PURE: returns the pending record
// (carrying the §4.2 Day record + the post-state absolutes commit replays) plus any
// notable events + encounters. Does not mutate the campaign.
// Party overland base speed (RR pp.83-84 + p.272): a party travels at its SLOWEST member's encumbrance
// rate — 24/18/12/6 mi/day for unencumbered/lightly/heavily/severely loaded; an overloaded member → 0 =
// the party can't move. Mercenaries + pack animals aren't tracked as individual carriers, so "members" =
// the participant characters; no participant characters → the flat base (JOURNEY_BASE_SPEED_MILES_PER_DAY,
// 24). This is the "current speed" the Journey panel shows above Pace/Mode, and the value the GM speed
// override (§26) replaces. Exposed so the UI mirrors exactly what tickJourneyDay uses for the base.
function journeyBaseSpeedMilesPerDay(campaign, journey){
  const A = _jACKS();
  const ids = (journey && journey.participantCharacterIds) || [];
  if(!ids.length || !campaign || !Array.isArray(campaign.characters)) return A.JOURNEY_BASE_SPEED_MILES_PER_DAY;
  let slowest = Infinity;
  for(const c of campaign.characters){
    if(!c || ids.indexOf(c.id) === -1) continue;
    const mpd = (typeof A.carryEncumbranceInfo === 'function') ? A.carryEncumbranceInfo(c).band.milesPerDay : A.JOURNEY_BASE_SPEED_MILES_PER_DAY;
    if(typeof mpd === 'number' && mpd < slowest) slowest = mpd;
  }
  return (slowest === Infinity) ? A.JOURNEY_BASE_SPEED_MILES_PER_DAY : slowest;
}

function tickJourneyDay(campaign, journey, ctx){
  const A = _jACKS();
  ctx = ctx || {};
  const rng = ctx.rng || Math.random;
  const participants = Math.max(1, (journey.participantCharacterIds || []).length);
  const dist = computeJourneyDistance(campaign, journey);
  const startHex = dist.startHex;
  const newDayIndex = (journey.currentDayIndex || 0) + 1;
  // EFFECTIVE pace = the GM's pace capped by what the travellers' other activities leave room for
  // (Joachim 2026-06-05). An administering ruler caps the party at half speed; a fully-booked one at
  // 'halted' (×0 — no progress that day). campaign.domains is attached by the day-tick pipeline, so
  // the domain-admin gate resolves. Falls back to the stored pace if the helper isn't present.
  const pace = (typeof A.journeyEffectivePace === 'function') ? A.journeyEffectivePace(campaign, journey) : (journey.pace || 'normal');
  const halted = (pace === 'halted');   // the day's activities (or the GM) leave no room to travel → 0 hexes, no nav/ford
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

  // ── route + base environment (§24): the journey steps hex-by-hex along journeyRoute. Where a route
  // coord isn't authored we fall back to the START hex's coarse environment, so sparse campaigns
  // travel exactly as the pre-§24 distance engine did and per-side road/river effects appear only
  // where the GM has drawn them. ──
  const route = (function(){ try { return journeyRoute(campaign, journey); } catch(e){ return []; } })();
  const baseEnv = {
    terrain: (startHex && startHex.terrain) || 'grassland',
    hasRoad: !!(startHex && startHex.hasRoad),
    hasTrail: !!(startHex && startHex.hasTrail),
    groundCondition: (startHex && startHex.groundCondition) || 'clear',
    roadSides: [], riverSides: [], crossingSides: []
  };
  const baseTerrain = baseEnv.terrain;
  const hexAtPos = pos => { const s = route[pos]; return (s && s.hex) ? s.hex : baseEnv; };

  // Day-level (non-terrain) speed factors — base × weather × temperature × pace. Terrain + ground are
  // charged PER HEX during the walk below (a hex of speed-mult m costs MILES_PER_HEX / m of the day's
  // budget), so the day's reach equals the old hexes/day when terrain is uniform and varies hex-by-hex
  // when it isn't (RR p.272 / pp.277-278).
  const weatherMult = (A.JOURNEY_WEATHER_SPEED[weather.condition] != null) ? A.JOURNEY_WEATHER_SPEED[weather.condition] : 1;
  const tempMult = (A.JOURNEY_TEMPERATURE_SPEED[weather.temperature] != null) ? A.JOURNEY_TEMPERATURE_SPEED[weather.temperature] : 1;
  const paceMult = (A.JOURNEY_PACE_SPEED[pace] != null) ? A.JOURNEY_PACE_SPEED[pace] : 1;
  // §26 — GM speed override: a positive journey.speedOverrideMilesPerDay REPLACES the party's base
  // "current speed" (the slowest-member rate) for this leg — it is a GM-chosen BASE RATE, not a fixed
  // final distance. The SAME day modifiers then apply on top: × weather × temperature × pace here, plus
  // per-hex terrain/ground/road during the walk below. So pace still multiplies it (forced march ×1.5),
  // weather/terrain still bite, and pace still governs fatigue (RR p.279). null/0 ⇒ the slowest-member
  // rate governs. (Speed and exertion stay separable — pace is set independently of the override.)
  const ovRaw = journey.speedOverrideMilesPerDay;
  const overrideMiles = (typeof ovRaw === 'number' && isFinite(ovRaw) && ovRaw > 0) ? ovRaw : null;
  // base = the party's current speed (slowest member, RR pp.83-84) OR the GM override (§26) when set.
  const baseMilesPerDay = (overrideMiles != null) ? overrideMiles : journeyBaseSpeedMilesPerDay(campaign, journey);
  let milesBudget = baseMilesPerDay * weatherMult * tempMult * paceMult;
  const coldWater = (weather.temperature === 'frigid' || weather.temperature === 'cold'); // −2 to a ford (§24)

  // ── fatigue (§10 / JJ p.84): a 6-day strenuous streak forces a rest day ──
  const simplifiedFatigue = A.isHouseRuleEnabled(campaign, 'simplified-fatigue');
  const strenuousPace = (pace === 'normal' || pace === 'forced-march');
  const restDay = (!simplifiedFatigue && strenuousPace && fatigueDays >= A.JOURNEY_FATIGUE_CYCLE_DAYS);

  // Route position = hexes already covered; the next hex to ENTER is pos+1.
  const startPos = dist.covered;
  const curStep = route.length ? (route[Math.min(startPos, route.length - 1)] || null) : null;
  const curHex = (curStep && curStep.hex) ? curStep.hex : baseEnv;
  const nextStep = (startPos + 1 < route.length) ? route[startPos + 1] : null;
  const nextHex = nextStep ? hexAtPos(startPos + 1) : curHex;
  const onRoadOrTrail =
    roadBonusForStep(nextHex, nextStep ? nextStep.entrySide : null, nextStep ? nextStep.exitSide : null) || !!nextHex.hasTrail ||
    roadBonusForStep(curHex, null, curStep ? curStep.exitSide : null) || !!curHex.hasTrail;

  // §27 — the party's physical coord at day start (= route[covered]); the stray walk + re-anchor use it.
  const curCoord = (curStep && curStep.coord) ? { q: curStep.coord.q, r: curStep.coord.r }
                 : (startHex && startHex.coord) ? { q: startHex.coord.q, r: startHex.coord.r } : { q: 0, r: 0 };

  // ── navigation (§7 / RR p.275): one Navigation throw per travel day. Skipped only when NOT lost and
  // following a road/trail (those routes are safe); a LOST party always throws — that's its chance to
  // re-orient. +4 for the Navigation proficiency OR the Pathfinding class power, +8 for both; an
  // unmodified natural 1 always fails. The Judge throws secretly on the party's behalf. ──
  let navRecord = null;
  let strayHeading = (typeof journey.strayHeading === 'number') ? journey.strayHeading : null;
  const wasLost = isLost;
  if(!restDay && !halted && dist.remaining > 0 && (isLost || !onRoadOrTrail)){
    // Throw against where the party IS when lost (the strayed anchor), else the hex it's entering.
    const navTerrain = isLost ? ((curHex && curHex.terrain) || baseTerrain) : (nextHex.terrain || baseTerrain);
    const navTarget = (A.JOURNEY_NAV_THROWS[navTerrain] != null) ? A.JOURNEY_NAV_THROWS[navTerrain] : 6;
    const bonus = _journeyNavBonus(campaign, journey);
    const nav = rollNavigation(navTarget, bonus, rng);
    const bonusRec = bonus ? [{ source: 'party-proficiency', value: bonus }] : [];
    if(nav.success && wasLost){
      // Recovered (RR p.275): the party realizes it was lost and resumes toward its destination. The
      // route is already anchored at its strayed position (re-anchored each lost day), so clearing
      // isLost lets the normal route walk below resume dest-ward from here.
      isLost = false; strayHeading = null;
      navRecord = { rolled: nav.rolled, target: nav.target, bonuses: bonusRec, result: 'success-recovered', naturalOne: nav.naturalOne };
      notableEvents.push({
        kind: 'journey-day-tick', type: 'navigation-recovered', primaryHexId: journey.currentHexId || journey.startHexId || null,
        label: (journey.name || 'Journey') + ': found the way again (nav ' + nav.rolled + (bonus ? ('+' + bonus) : '') + ' vs ' + navTarget + '+)',
        payload: { journeyId: journey.id, dayIndex: newDayIndex }
      });
    } else if(!nav.success){
      // Lost (RR p.275). Crucially the party does NOT realize it — it strays toward a random hex face
      // (1d6) and keeps moving, unaware, until a later successful throw. A heading already set persists
      // ("blithely continues on"); a freshly-lost party rolls one. The pause is GM-facing — the Judge
      // made the secret throw, so the fiction stays "the party doesn't know."
      isLost = true;
      if(strayHeading == null) strayHeading = Math.floor(rng() * 6);
      navRecord = { rolled: nav.rolled, target: nav.target, bonuses: bonusRec, result: 'fail-unknown-lost', naturalOne: nav.naturalOne, strayHeading: strayHeading };
      notableEvents.push({
        kind: 'journey-lost', type: 'navigation-fail', pauseTrigger: 'navigation-fail', primaryHexId: journey.currentHexId || journey.startHexId || null,
        label: (journey.name || 'Journey') + ': lost in ' + navTerrain + ' — strays ' + (HEX_FACE_LABELS[strayHeading] || ('face ' + strayHeading)) + ', unaware (nav ' + nav.rolled + (bonus ? ('+' + bonus) : '') + ' vs ' + navTarget + '+' + (nav.naturalOne ? ', natural 1' : '') + ')',
        payload: { journeyId: journey.id, dayIndex: newDayIndex, strayHeading: strayHeading }
      });
    } else {
      // Success, not lost — routine travel; emit no event.
      navRecord = { rolled: nav.rolled, target: nav.target, bonuses: bonusRec, result: 'success', naturalOne: nav.naturalOne };
    }
  }

  // ── movement (§6/§24): walk the route hex-by-hex, spending the day's mile budget. Each hex entered
  // costs MILES_PER_HEX / (terrain × ground speed); the road bonus overrides terrain when the
  // traversal qualifies (RR p.272). An UNforded river edge (riverSides with no crossing/bridge)
  // triggers a Swimming throw (RR p.271): success crosses but ends the day (swim speed ¼), failure
  // holds the party at the near bank with a 'fording' pause for the GM. No movement on a rest/lost day;
  // a travel day always advances at least one hex (RAW floors progress ≥1). ──
  let hexesToday = 0, dayAllRoaded = true, hardestNav = -1, representativeTerrain = baseTerrain, fordingRecord = null;
  let strayPath = null, strayLandingCoord = null;
  if(!restDay && !halted && isLost && dist.remaining > 0){
    // ── LOST (RR p.275): the party covers a full day's distance toward its random stray heading, OFF
    // the planned route and unaware. Terrain + ground pace each hex (looked up by coord, falling back to
    // the base environment where unauthored); NO road bonus (it isn't following one) and NO river fording
    // (wandering blind) — v1 simplifications. The landing coord re-anchors the route below, so the day
    // progresses AWAY from the goal, not toward it. ──
    const d = HEX_EDGE_DELTAS[((strayHeading % 6) + 6) % 6] || [0, 0];
    let cur = { q: curCoord.q, r: curCoord.r };
    strayPath = [];
    while(true){
      const toQ = cur.q + d[0], toR = cur.r + d[1];
      const toHex = A.hexAtCoord(campaign, toQ, toR);
      const terr = (toHex && toHex.terrain) || baseTerrain;
      const tMult = (A.JOURNEY_TERRAIN_SPEED[terr] != null) ? A.JOURNEY_TERRAIN_SPEED[terr] : 1;
      const gKey = (toHex && toHex.groundCondition) || 'clear';
      const gMult = (A.JOURNEY_GROUND_SPEED[gKey] != null) ? A.JOURNEY_GROUND_SPEED[gKey] : 1;
      const costMiles = A.JOURNEY_MILES_PER_HEX / Math.max(0.01, tMult * gMult);
      if(hexesToday > 0 && milesBudget < costMiles) break;   // always take the first hex (RAW floors progress ≥1)
      milesBudget -= costMiles; hexesToday += 1; cur = { q: toQ, r: toR };
      dayAllRoaded = false;
      strayPath.push({ hexId: toHex ? toHex.id : null, q: toQ, r: toR });
      { const nt = (A.JOURNEY_NAV_THROWS[terr] != null) ? A.JOURNEY_NAV_THROWS[terr] : 0; if(nt > hardestNav){ hardestNav = nt; representativeTerrain = terr; } }
    }
    strayLandingCoord = cur;
  } else if(!restDay && !halted && !isLost && dist.remaining > 0 && route.length > 1){
    let pos = startPos;
    while(pos < route.length - 1 && (pos - startPos) < dist.remaining){
      const fromStep = route[pos], toStep = route[pos + 1];
      const fromHex = hexAtPos(pos), toHex = hexAtPos(pos + 1);
      const roaded = roadBonusForStep(toHex, toStep ? toStep.entrySide : null, toStep ? toStep.exitSide : null);
      const tMult = roaded ? A.JOURNEY_TERRAIN_SPEED.road : (A.JOURNEY_TERRAIN_SPEED[toHex.terrain] != null ? A.JOURNEY_TERRAIN_SPEED[toHex.terrain] : 1);
      const gKey = toHex.groundCondition || 'clear';
      const gMult = (A.JOURNEY_GROUND_SPEED[gKey] != null) ? A.JOURNEY_GROUND_SPEED[gKey] : 1;
      const costMiles = A.JOURNEY_MILES_PER_HEX / Math.max(0.01, tMult * gMult);
      if(hexesToday > 0 && milesBudget < costMiles) break; // can't afford another hex (but always take the first)
      const crossing = riverCrossingForStep(fromHex, toHex, fromStep ? fromStep.exitSide : null);
      const fromId = fromStep ? fromStep.hexId : null, toId = toStep ? toStep.hexId : null;
      if(crossing.barrier && crossing.swimmingThrowNeeded){
        const roughWater = !!(fromHex && fromHex.fastWater) || !!(toHex && toHex.fastWater);
        const ford = journeyFordingThrow(campaign, journey, { rng, coldWater, roughWater });
        if(!ford.success){
          fordingRecord = { result: 'failed', crossingType: 'swim', rolled: ford.rolled, bonus: ford.bonus, target: ford.target, fromHexId: fromId, toHexId: toId };
          notableEvents.push({ kind: 'journey-fording', type: 'fording-fail', pauseTrigger: 'fording', primaryHexId: fromId || journey.currentHexId || null, involvedHexIds: [fromId, toId].filter(Boolean),
            label: (journey.name || 'Journey') + ': blocked at an unfordable river (Swimming ' + ford.rolled + (ford.bonus ? ('+' + ford.bonus) : '') + ' vs ' + ford.target + '+) — GM, resolve the crossing (drowning risk, RR p.271)',
            payload: { journeyId: journey.id, dayIndex: newDayIndex, throw: ford } });
          break; // held at the near bank — no further movement today
        }
        milesBudget -= costMiles; pos += 1; hexesToday += 1;
        if(!roaded) dayAllRoaded = false;
        { const nt = (A.JOURNEY_NAV_THROWS[toHex.terrain] != null) ? A.JOURNEY_NAV_THROWS[toHex.terrain] : 0; if(nt > hardestNav){ hardestNav = nt; representativeTerrain = toHex.terrain || baseTerrain; } }
        fordingRecord = { result: 'forded-swim', crossingType: 'swim', rolled: ford.rolled, bonus: ford.bonus, target: ford.target, fromHexId: fromId, toHexId: toId };
        notableEvents.push({ kind: 'journey-fording', type: 'fording-success', primaryHexId: toId || null, involvedHexIds: [fromId, toId].filter(Boolean),
          label: (journey.name || 'Journey') + ': forded the river by swimming (Swimming ' + ford.rolled + (ford.bonus ? ('+' + ford.bonus) : '') + ' vs ' + ford.target + '+)',
          payload: { journeyId: journey.id, dayIndex: newDayIndex, throw: ford } });
        break; // swimming a river ends the day's march (swim speed ¼)
      }
      // free step — open ground, or a ford/bridge negates the river barrier
      milesBudget -= costMiles; pos += 1; hexesToday += 1;
      if(!roaded) dayAllRoaded = false;
      { const nt = (A.JOURNEY_NAV_THROWS[toHex.terrain] != null) ? A.JOURNEY_NAV_THROWS[toHex.terrain] : 0; if(nt > hardestNav){ hardestNav = nt; representativeTerrain = toHex.terrain || baseTerrain; } }
    }
  }
  const dayRoaded = (hexesToday > 0) ? dayAllRoaded : roadBonusForStep(curHex, null, curStep ? curStep.exitSide : null);
  // §24 — the hexes ENTERED this day, in order, for the day log. The party's current physical position
  // is the last entry; unauthored coords carry hexId:null but still list (as a column·row step).
  // A lost day's path is the strayed walk (off-route); a normal day reads the planned route.
  const hexPath = (isLost && strayPath) ? strayPath.slice() : (function(){
    const out = [];
    for(let i = startPos + 1; i <= startPos + hexesToday && i < route.length; i++){
      const s = route[i]; if(s && s.coord) out.push({ hexId: s.hexId || null, q: s.coord.q, r: s.coord.r });
    }
    return out;
  })();
  const milesToday = hexesToday * A.JOURNEY_MILES_PER_HEX;
  // Halted (×0): the day's activities (or the GM) left no room to travel — record why (non-pausing).
  if(halted){
    notableEvents.push({ kind: 'journey-day-tick', type: 'halted', primaryHexId: journey.startHexId || null,
      label: (journey.name || 'Journey') + ': halted — the day’s activities left no time to travel (0 miles)',
      payload: { journeyId: journey.id, dayIndex: newDayIndex } });
  }
  const newCovered = dist.covered + hexesToday;
  // A LOST party can never "arrive" — it's moving the wrong way (and the re-anchor below nets covered to 0).
  const willArrive = !isLost && ((dist.total > 0) ? (newCovered >= dist.total) : true); // 0-distance arrives at once

  // ── survival (§4 / RR p.278): PER-MEMBER food + water (Provisioning V2/V3). The abstract supplies
  // counters were seeded into tight inventory at launch (seedJourneyProvisions); journeyDaySurvival
  // draws food from ration items + water from waterDaysCarried / sources / forage, applies the §1.2/§1.3
  // deficit ladders + CON loss per traveller, and folds its signals into the umbrella event below.
  // ignore-rations opts out. The result's per-member absolutes ride on the record (commit replays them
  // via applyJourneyDaySurvival). hungerDays/dehydrationDays/rationsConsumed are kept as first-member
  // mirrors for the day-record display + back-compat. ──
  // skipSurvival (rerollJourneyNav): re-roll navigation / movement only and leave provisioning entirely
  // untouched — reuses the proven ignore-rations "ignored" shape, so the record carries no survival and
  // no forage throw, and rerollJourneyNav restores the held water/food outcome afterward.
  const survival = (ctx && ctx.skipSurvival)
    ? { ignored: true, members: {}, notableEvents: [], waterForage: null }
    : journeyDaySurvival(campaign, journey, curHex, { rng });
  if(!survival.ignored){
    survival.notableEvents.forEach(e => notableEvents.push(e));
    rations = (typeof survival.newRations === 'number') ? survival.newRations : rations;
    waterRations = (typeof survival.newWaterRations === 'number') ? survival.newWaterRations : waterRations;
    const _firstSurv = survival.members && survival.members[(journey.participantCharacterIds || [])[0]];
    if(_firstSurv){ hungerDays = _firstSurv.foodDeficitDays; dehydrationDays = _firstSurv.waterDeficitDays; }
  }
  const _survMembers = survival.members ? Object.keys(survival.members).map(k => survival.members[k]) : [];
  const rationsConsumed = _survMembers.filter(m => m.fedFood).length;
  const waterConsumed = _survMembers.filter(m => m.fedWater).length;

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

  // ── encounter check (§12 — J1 stub). Safe on a day spent entirely on roads; flavour terrain is the
  // hardest hex actually traversed (§24). ──
  const enc = rollEncounter(campaign, journey, { rng, terrain: representativeTerrain, hasRoad: dayRoaded, dayIndex: newDayIndex });
  if(enc){ encounters.push(enc.encounterRecord); notableEvents.push(enc.notableEvent); }

  // ── status transition + arrival event. currentHexId now advances hex-by-hex along the route to the
  // authored hex the party is in (it stays put across UNauthored stretches — no hex id to move to). ──
  let newStatus = 'in-transit';
  let newCurrentHexId = journey.currentHexId || journey.startHexId || null;
  // §27 re-anchor post-state: carried forward unchanged on a normal day; on a LOST day the route is
  // re-anchored at the strayed landing coord and the day's hexes are banked, so progress (covered) nets
  // to 0 — the route then runs from where the party physically is, unused until a recovery throw.
  let newStrayHeading = isLost ? strayHeading : null;
  let newRouteAnchorCoord = journey.routeAnchorCoord || null;
  let newRouteAnchorHexId = journey.routeAnchorHexId || null;
  let newCoveredBaseline = journey.coveredBaseline || 0;
  let reanchored = false;
  if(willArrive){
    newStatus = 'arrived';
    newCurrentHexId = journey.destinationHexId || newCurrentHexId;
    notableEvents.push({ kind: 'journey-arrived', type: 'arrived', primaryHexId: journey.destinationHexId || null, involvedHexIds: [journey.startHexId, journey.destinationHexId].filter(Boolean), label: (journey.name || 'Journey') + ': arrived at destination (day ' + newDayIndex + ')', payload: { journeyId: journey.id, destinationHexId: journey.destinationHexId } });
  } else if(isLost && strayLandingCoord){
    const lh = A.hexAtCoord(campaign, strayLandingCoord.q, strayLandingCoord.r);
    if(lh) newCurrentHexId = lh.id;   // else hold at the last authored hex — the party is in trackless wilderness (§24)
    newRouteAnchorCoord = { q: strayLandingCoord.q, r: strayLandingCoord.r };
    newRouteAnchorHexId = lh ? lh.id : null;
    newCoveredBaseline = (dist.covered || 0) + (journey.coveredBaseline || 0) + hexesToday; // bank today's hexes ⇒ next-day covered = 0
    reanchored = true;
  } else if(hexesToday > 0){
    const here = route[startPos + hexesToday];
    if(here && here.hexId) newCurrentHexId = here.hexId;
  }

  // ── the review-surface summary label (every day; routine travel emits NO event) ──
  let summaryLabel;
  if(willArrive)            summaryLabel = (journey.name || 'Journey') + ': arrived (day ' + newDayIndex + ')';
  else if(restDay)          summaryLabel = (journey.name || 'Journey') + ': forced rest (day ' + newDayIndex + ')';
  else if(fordingRecord && fordingRecord.result === 'failed')
                            summaryLabel = (journey.name || 'Journey') + ': ' + (hexesToday > 0 ? ('+' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ', then ') : '') + 'blocked at a river (day ' + newDayIndex + ')';
  else if(isLost)           summaryLabel = (journey.name || 'Journey') + ': lost — strayed ' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ' ' + (HEX_FACE_LABELS[strayHeading] || '') + ', unaware (day ' + newDayIndex + ')';
  else                      summaryLabel = (journey.name || 'Journey') + ': +' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ' (' + milesToday + ' mi)' + (fordingRecord && fordingRecord.result === 'forded-swim' ? ', forded a river' : '') + ', day ' + newDayIndex;

  // ── §4.2 Day record ──
  // Provisioning — a COMPACT per-member post-day survival snapshot (only the fields
  // characterJourneyConditions reads), so the members table can PREVIEW the proposed day's
  // conditions (Dehydrated / Underfed + CON loss) while a day-tick proposal is open, matching the
  // day review (Joachim 2026-06-05: the members "should be Dehydrated here, as they are on the day
  // review"). The real per-character fields are still applied only on commit (applyJourneyDaySurvival).
  const memberSurvival = {};
  if(survival && survival.members){
    for(const _sid of Object.keys(survival.members)){
      const _m = survival.members[_sid] || {};
      memberSurvival[_sid] = {
        foodDeficitDays: _m.foodDeficitDays || 0, waterDeficitDays: _m.waterDeficitDays || 0,
        conLossHunger: _m.conLossHunger || 0, conLossThirst: _m.conLossThirst || 0
      };
    }
  }
  const dayRecord = {
    dayIndex: newDayIndex,
    hexId: (curStep && curStep.hexId) || journey.currentHexId || journey.startHexId || null,  // the hex the party was in at day start
    weather: { condition: weather.condition, temperature: weather.temperature || 'moderate', rolledOrSet: weather.rolledOrSet || 'gm-fiat' },
    pace: restDay ? 'rest' : pace,
    speedOverrideMilesPerDay: (overrideMiles != null && !restDay) ? overrideMiles : null,  // §26 — GM speed override in effect this day (null ⇒ pace governed)
    milesTraveled: milesToday,
    hexesTraveled: hexesToday,
    hexPath,                                                 // §24 — [{hexId, q, r}] hexes entered this day (in order); last = current position
    arrivedAt: newCurrentHexId,
    navigationThrow: navRecord,
    strayHeading: isLost ? strayHeading : null,              // §27 — hex face strayed toward this day (null ⇒ not lost)
    fording: fordingRecord,                                  // §24 river-crossing record (null on a dry day)
    rationsConsumed: { food: rationsConsumed, water: waterConsumed, animalFeed: 0, animalWater: 0, shipStores: 0 },
    waterForage: (survival && survival.waterForage) || null, // Provisioning — the day's water-Foraging throw (null = none attempted), for the day log + its reroll
    memberSurvival,                                          // Provisioning — compact per-member post-day survival (for the members-table proposed-day preview)
    fatigueAccumulated,
    encounters: encounters.map(e => ({ kind: e.triggeredBy || 'wandering-roll', encounterId: e.id })),
    notableEvents: notableEvents.map(n => ({ kind: n.kind, type: n.type || null, text: n.label })),  // type routes each to the nav vs forage row in the day log
    status: 'pending'
  };

  // ── Travel pivot (2026-06-04): ONE comprehensive travel event per committed day ──
  // The per-thing notable events built above (lost / hunger / dehydration / fording / forced-rest /
  // encounter / arrival) become TRANSIENT signals: they still drive the GM pause check
  // (dayTickPauseReasons reads pauseTrigger BEFORE emission) and the day-log digest
  // (dayRecord.notableEvents), but they are NOT each emitted as their own eventLog entry. Instead the
  // single journey-day-tick (or journey-arrived) event below carries the WHOLE day — every hex entered
  // (context.involvedHexIds), where the party actually ended (primaryHexId — NOT the origin, the bug
  // this fixes), the travellers (relatedEntities, role 'traveller'), and the full day record in the
  // payload — so a traveller's history (ACKS.characterHistory) and any hex's history are each complete
  // from one event. A routine day (nothing notable) is flagged campaignLogHidden: it stays out of the
  // narrative Campaign Log while remaining in the Event Log + both histories, so every hex travelled is
  // still recorded. Hour-readiness (cadence survey §6-7 / RR p.272): the DAY is the RAW travel unit;
  // within-day hour stamps land later as child encounter events via Event.subdayContext (Monster
  // Persistence #476) — the hexPath order already encodes within-day sequence, so no fake hours here.
  const _dayWasNotable = notableEvents.length > 0;
  notableEvents.forEach(e => { e.transient = true; });
  const _travellerIds = (journey.participantCharacterIds || []).filter(Boolean);
  const _related = _travellerIds.map(id => ({ kind: 'character', id, role: 'traveller' }));
  _related.push({ kind: 'journey', id: journey.id, role: 'subject' });
  const _dayStartHexId = (curStep && curStep.hexId) || journey.currentHexId || journey.startHexId || null;
  const _involvedHexIds = [];
  if(_dayStartHexId) _involvedHexIds.push(_dayStartHexId);
  hexPath.forEach(h => { if(h && h.hexId && _involvedHexIds.indexOf(h.hexId) < 0) _involvedHexIds.push(h.hexId); });
  notableEvents.push({
    kind: willArrive ? 'journey-arrived' : 'journey-day-tick',
    type: 'travel-day',
    primaryHexId: newCurrentHexId || _dayStartHexId || null,
    involvedHexIds: _involvedHexIds,
    relatedEntities: _related,
    campaignLogHidden: !_dayWasNotable,
    label: summaryLabel,
    payload: {
      journeyId: journey.id,
      dayIndex: newDayIndex,
      narrative: summaryLabel,
      day: {
        hexPath: hexPath,
        fromHexId: _dayStartHexId,
        arrivedAt: newCurrentHexId,
        milesTraveled: milesToday,
        hexesTraveled: hexesToday,
        pace: restDay ? 'rest' : pace,
        speedOverrideMilesPerDay: (overrideMiles != null && !restDay) ? overrideMiles : null,
        weather: { condition: weather.condition, temperature: weather.temperature || 'moderate' },
        navigation: navRecord,
        lost: isLost,
        strayHeading: isLost ? strayHeading : null,
        fording: fordingRecord,
        rationsConsumed: { food: rationsConsumed, water: waterConsumed },
        waterForage: (survival && survival.waterForage) || null,
        hungerDays: hungerDays,
        dehydrationDays: dehydrationDays,
        fatigueDays: fatigueDays,
        fatigueAccumulated: fatigueAccumulated,
        encounters: dayRecord.encounters,
        happenings: dayRecord.notableEvents,
        arrived: willArrive
      }
    }
  });

  const record = {
    kind: 'journey-day', journeyId: journey.id, name: journey.name || 'Journey', label: summaryLabel,
    dayRecord,
    newDayIndex, newFatigueDays: fatigueDays, newIsLost: isLost,
    newRations: rations, newWaterRations: waterRations,
    newHungerDays: hungerDays, newDehydrationDays: dehydrationDays,
    survival: survival.ignored ? null : survival,   // Provisioning V2/V3 — per-member absolutes (commit replays via applyJourneyDaySurvival)
    newCurrentHexId, newStatus, primaryHexId: journey.startHexId || null,
    // §27 getting-lost post-state (commitJourneyRecord applies these; reroll-revert restores the pre-state)
    newStrayHeading, newRouteAnchorCoord, newRouteAnchorHexId, newCoveredBaseline, reanchored
  };
  // Attribute every notable to THIS day. A multi-day advance produces one journey record per day, and the
  // day-tick review surface matches a record's notables by (journeyId, dayIndex) — without a dayIndex on
  // each (the survival signals from journeyDaySurvival carried only journeyId) the matcher fell back to
  // journeyId alone, so every day's record showed every day's notables (a later day's dehydration surfaced
  // under an earlier day — the "review looks into the future" bug). Stamp it where missing.
  notableEvents.forEach(e => { if(e){ e.payload = e.payload || {}; if(e.payload.dayIndex == null) e.payload.dayIndex = newDayIndex; } });
  return { record, notableEvents, encounters };
}

// ── Deterministic day-tick PREVIEW (Joachim 2026-06-05) ───────────────────────────────────
// proposeJourneyDay is the PURE preview path the floating Day-tick review reads (the reroll path
// calls tickJourneyDay directly, with Math.random). If the preview rolled with Math.random it
// would re-throw nav/forage/survival every time the review opened — so the same committed state
// showed a DIFFERENT upcoming day on each open ("always different / pulling from the future").
// Instead we seed the preview's dice from a fingerprint of the journey's CURRENT committed state
// + the world day: re-opening / refreshing the review previews the IDENTICAL upcoming day, and it
// changes ONLY when the GM changes something real (reroll a prior day, toggle forage/rations → a
// new fingerprint → a new, still-stable preview). commitJourneyRecord replays the recorded
// absolutes, so what the GM ratifies is exactly what lands. A caller may still inject ctx.rng to
// force genuine randomness (the reroll path does, via tickJourneyDay directly).
function _jHash32(str){
  let h = 2166136261 >>> 0;                                  // FNV-1a
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function _jMulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Everything that determines the upcoming day's outcome: the world day (so consecutive days in a
// multi-day advance differ), the journey's position + lost-state + pace/override + supply toggles
// + supplies, and each traveller's survival state (so a forage/ration change re-previews).
function _journeyPreviewFingerprint(campaign, j, ctx){
  ctx = ctx || {};
  const cal = (campaign && campaign.calendar) || {};
  const sids = j.participantCharacterIds || [];
  const surv = [];
  for(const id of sids){
    const c = (campaign.characters || []).find(x => x && x.id === id);
    if(!c){ surv.push(id + ':?'); continue; }
    surv.push([id, c.hungerDays||0, c.dehydrationDays||0, c.waterDaysCarried||0,
               c.foodDeficitDays||0, c.waterDeficitDays||0,
               c.underfed?1:0, c.starving?1:0, c.dehydrated?1:0].join('|'));
  }
  return JSON.stringify({
    d: ctx.dayInMonth || (campaign && campaign.currentDayInMonth) || 1, y: cal.year||1, m: cal.month||1,
    id: j.id, di: j.currentDayIndex||0, hex: j.currentHexId||j.startHexId||null,
    cov: j.covered||0, base: j.coveredBaseline||0, anc: j.routeAnchorCoord||j.routeAnchorHexId||null,
    lost: j.isLost?1:0, stray: (typeof j.strayHeading==='number')?j.strayHeading:null,
    pace: j.pace||'normal', ov: j.speedOverrideMilesPerDay||0, mode: j.mode||'overland',
    fw: j.forageWaterEnabled?1:0, sr: j.shareRations?1:0, sup: j.supplies||null, surv: surv
  });
}
function _seededJourneyRng(campaign, j, ctx){
  return _jMulberry32(_jHash32(_journeyPreviewFingerprint(campaign, j, ctx)));
}

// §14 day-handler for journeys (Calendar §10.2 slot 30). PURE: proposes one day per
// in-transit journey without mutating. commitJourneyRecord applies a ratified record.
function proposeJourneyDay(campaign, ctx){
  const pendingRecords = [], notableEvents = [], encounters = [];
  if(!campaign || !Array.isArray(campaign.journeys)) return { pendingRecords, notableEvents, encounters };
  ctx = ctx || {};
  for(const j of campaign.journeys){
    if(!j || j.status !== 'in-transit') continue;
    // Stable preview: seed each journey's day from its committed-state fingerprint unless the
    // caller forced an rng. Re-opening / refreshing the review reproduces the same upcoming day.
    const rng = ctx.rng || _seededJourneyRng(campaign, j, ctx);
    const out = tickJourneyDay(campaign, j, Object.assign({}, ctx, { rng: rng }));
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
    dehydrationDays: (_firstC && _firstC.dehydrationDays) || 0,
    // §27 getting-lost — the lost flow re-anchors per day, so a reroll must restore these too.
    strayHeading: (typeof j.strayHeading === 'number') ? j.strayHeading : null,
    coveredBaseline: j.coveredBaseline || 0,
    routeAnchorCoord: j.routeAnchorCoord || null,
    routeAnchorHexId: j.routeAnchorHexId || null
  };
  // Provisioning V2/V3 — per-member survival pre-snapshot (water/food/conditions/CON + inventory +
  // camp), captured pre-apply so a reroll can revert every traveller and the camp, not just the first.
  {
    const _sids = j.participantCharacterIds || [];
    const _pre = {};
    for(const c of (campaign.characters || [])){
      if(!c || _sids.indexOf(c.id) < 0) continue;
      _pre[c.id] = {
        waterDaysCarried: Number(c.waterDaysCarried) || 0,
        foodDeficitDays: Number(c.foodDeficitDays) || 0, waterDeficitDays: Number(c.waterDeficitDays) || 0,
        underfed: !!c.underfed, starving: !!c.starving, dehydrated: !!c.dehydrated,
        conLossHunger: Number(c.conLossHunger) || 0, conLossThirst: Number(c.conLossThirst) || 0,
        hungerDays: Number(c.hungerDays) || 0, dehydrationDays: Number(c.dehydrationDays) || 0,
        inventory: JSON.parse(JSON.stringify(c.inventory || []))
      };
    }
    let _camp = null;
    if(j.partyId && global.ACKS && global.ACKS.partyCampStash){
      const _cp = global.ACKS.partyCampStash(campaign, j.partyId);
      if(_cp) _camp = { items: JSON.parse(JSON.stringify(_cp.items || [])), waterDaysCarried: Number(_cp.waterDaysCarried) || 0 };
    }
    dr._preDay.survival = { members: _pre, camp: _camp };
  }
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
  // §27 getting-lost post-state: the stray heading + (when a lost day re-anchored) the coord anchor and
  // banked baseline. Recompute the route snapshot when re-anchored so the UI/integrators see the live
  // route from the party's strayed position.
  if('newStrayHeading' in record) j.strayHeading = (typeof record.newStrayHeading === 'number') ? record.newStrayHeading : null;
  if('newCoveredBaseline' in record) j.coveredBaseline = record.newCoveredBaseline;
  if('newRouteAnchorCoord' in record) j.routeAnchorCoord = record.newRouteAnchorCoord || null;
  if('newRouteAnchorHexId' in record) j.routeAnchorHexId = record.newRouteAnchorHexId || null;
  if(record.reanchored){ try { j.routeCoords = journeyRoute(campaign, j).map(s => s.coord); } catch(e){ /* keep prior snapshot */ } }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: record.newDayIndex, type: (record.newStatus === 'arrived' ? 'arrived' : 'day-tick'), narrative: record.label || ('day ' + record.newDayIndex) });
  // Provisioning V2/V3 — apply the per-member survival absolutes (water/food/conditions/CON loss +
  // changed inventories + camp), replacing the old uniform first-member mirror. Sets hungerDays/
  // dehydrationDays per traveller as a back-compat alias. No-op on a journey with ignore-rations.
  applyJourneyDaySurvival(campaign, j, record.survival);
  // mirror fatigue + advance positions (survival persists across journeys — §10.4)
  const ids = j.participantCharacterIds || [];
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    c.personalFatigue = record.newFatigueDays;
    // Place each traveller at the journey's current hex EVERY day, not just on arrival — the party
    // physically moves along the route. newCurrentHexId advances only to AUTHORED hexes (it holds at
    // the last authored hex across unauthored stretches, since a character can only be located at a
    // real hex), so this leaves them at the nearest settled hex they've reached. §24 hex-by-hex.
    if(record.newCurrentHexId) c.currentHexId = record.newCurrentHexId;
    if(record.newStatus === 'arrived'){ c.currentHexId = j.destinationHexId || c.currentHexId; c.currentJourneyId = null; }
    else { c.currentJourneyId = j.id; }
  }
  // The party tracks the journey's current hex each day too (and clears its active-journey link on arrival).
  if(j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt){
      if(record.newCurrentHexId) pt.currentHexId = record.newCurrentHexId;
      if(record.newStatus === 'arrived'){ pt.activeJourneyId = null; pt.currentHexId = j.destinationHexId || pt.currentHexId; }
      // The party's camp stash travels with it (Items I1 / Stash B) — follow the party's hex each day.
      if(global.ACKS && global.ACKS.syncPartyCampHex) global.ACKS.syncPartyCampHex(campaign, pt);
    }
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
function rerollJourneyDay(campaign, journey, ctx){
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
  // §27 getting-lost — restore the per-day-mutated lost state (snapshot may predate the field on old
  // saves; default sensibly), then refresh the route snapshot from the reverted anchor.
  j.strayHeading = (typeof pre.strayHeading === 'number') ? pre.strayHeading : null;
  if(typeof pre.coveredBaseline === 'number') j.coveredBaseline = pre.coveredBaseline;
  if('routeAnchorCoord' in pre) j.routeAnchorCoord = pre.routeAnchorCoord || null;
  if('routeAnchorHexId' in pre) j.routeAnchorHexId = pre.routeAnchorHexId || null;
  try { j.routeCoords = journeyRoute(campaign, j).map(s => s.coord); } catch(e){ /* keep prior snapshot */ }
  const ids = j.participantCharacterIds || [];
  const _preMembers = pre.survival && pre.survival.members;
  for(const c of (campaign.characters || [])){
    if(c && ids.indexOf(c.id) >= 0){
      // Provisioning V2/V3 — restore the full per-member survival snapshot (water/food/conditions/CON +
      // inventory); old records (no .survival) fall back to the legacy first-member hunger/dehydration.
      const ps = _preMembers && _preMembers[c.id];
      if(ps){
        c.waterDaysCarried = ps.waterDaysCarried; c.foodDeficitDays = ps.foodDeficitDays; c.waterDeficitDays = ps.waterDeficitDays;
        c.underfed = ps.underfed; c.starving = ps.starving; c.dehydrated = ps.dehydrated;
        c.conLossHunger = ps.conLossHunger; c.conLossThirst = ps.conLossThirst;
        c.hungerDays = ps.hungerDays; c.dehydrationDays = ps.dehydrationDays;
        if(Array.isArray(ps.inventory)) c.inventory = JSON.parse(JSON.stringify(ps.inventory));
      } else {
        c.hungerDays = pre.hungerDays || 0;
        c.dehydrationDays = pre.dehydrationDays || 0;
      }
      c.personalFatigue = pre.fatigueDays || 0;
      c.currentJourneyId = j.id; // re-link (a revert may have un-done an arrival)
      c.currentHexId = pre.currentHexId; // revert the day's per-day placement (and any arrival move-to-destination)
    }
  }
  // revert the camp stash to its pre-day food/water too
  if(pre.survival && pre.survival.camp && j.partyId && typeof A.partyCampStash === 'function'){
    const cp = A.partyCampStash(campaign, j.partyId);
    if(cp){ cp.items = JSON.parse(JSON.stringify(pre.survival.camp.items || [])); cp.waterDaysCarried = pre.survival.camp.waterDaysCarried || 0; }
  }
  // revert the party to its pre-day hex too (commitJourneyRecord now moves it every day); an arrival
  // reroll additionally re-links the activeJourneyId it had cleared.
  if(j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt){ pt.currentHexId = pre.currentHexId || pt.currentHexId; if(wasArrival) pt.activeJourneyId = j.id; }
  }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: dayNum, type: 'reroll', narrative: 'GM rerolled day ' + dayNum + '.' });
  // 3. re-run the day with fresh randomness (Math.random in the live app / tests). ctx passes through —
  //    rerollJourneyNav uses { skipSurvival:true } to re-roll movement only and hold provisioning fixed.
  const out = tickJourneyDay(campaign, j, ctx || {});
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

// Provisioning — GM reroll of JUST the latest day's water-Foraging throw + the dependent survival
// (food/water/conditions/CON), leaving the day's movement + navigation untouched (those are the full
// day-reroll's job). Reverts the per-member + camp + supply-pool survival state from the day's
// pre-snapshot, re-runs journeyDaySurvival with fresh randomness on the day-start hex (forcing the
// forage throw, since the GM is re-rolling THIS day's forage), re-applies, and patches the day record
// + the committed umbrella event's digest. Latest-day-only + world-not-moved (same gate as the full
// day reroll), and only when the day actually made a forage throw. Returns the new waterForage, or null.
function rerollJourneyForage(campaign, journey){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!journeyLastDayRerollable(campaign, j)) return null;
  const day = j.days[j.days.length - 1];
  const pre = day && day._preDay;
  if(!pre || !pre.survival) return null;       // old record without the per-member survival snapshot
  if(!day.waterForage) return null;            // nothing was foraged this day — nothing to reroll
  // revert the survival-relevant state to the day's pre-state (per-member + camp + the abstract pool)
  const ids = j.participantCharacterIds || [];
  const pm = pre.survival.members || {};
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    const ps = pm[c.id]; if(!ps) continue;
    c.waterDaysCarried = ps.waterDaysCarried; c.foodDeficitDays = ps.foodDeficitDays; c.waterDeficitDays = ps.waterDeficitDays;
    c.underfed = ps.underfed; c.starving = ps.starving; c.dehydrated = ps.dehydrated;
    c.conLossHunger = ps.conLossHunger; c.conLossThirst = ps.conLossThirst;
    c.hungerDays = ps.hungerDays; c.dehydrationDays = ps.dehydrationDays;
    if(Array.isArray(ps.inventory)) c.inventory = JSON.parse(JSON.stringify(ps.inventory));
  }
  if(pre.survival.camp && j.partyId && typeof A.partyCampStash === 'function'){
    const cp = A.partyCampStash(campaign, j.partyId);
    if(cp){ cp.items = JSON.parse(JSON.stringify(pre.survival.camp.items || [])); cp.waterDaysCarried = pre.survival.camp.waterDaysCarried || 0; }
  }
  j.supplies = j.supplies || {};
  j.supplies.rations = pre.rations; j.supplies.waterRations = pre.waterRations;
  // re-resolve survival on the day's start hex with fresh randomness (force the forage throw)
  const hex = (campaign.hexes || []).find(h => h && h.id === day.hexId) || null;
  const savedForage = j.forageWaterEnabled;
  j.forageWaterEnabled = true;
  // The day foraged (guarded above), so force the no-source forage path + reuse the original throw's target
  // — re-roll the same throw even if day.hexId now resolves to a watered hex (arrival / unauthored-day-start).
  const origTarget = (day.waterForage && typeof day.waterForage.target === 'number') ? day.waterForage.target : undefined;
  const surv = journeyDaySurvival(campaign, j, hex, { rng: Math.random, forageNoSource: true, forageTarget: origTarget });
  j.forageWaterEnabled = savedForage;
  applyJourneyDaySurvival(campaign, j, surv);
  j.supplies.rations = (typeof surv.newRations === 'number') ? surv.newRations : j.supplies.rations;
  j.supplies.waterRations = (typeof surv.newWaterRations === 'number') ? surv.newWaterRations : j.supplies.waterRations;
  // update the day record (the day log reads this)
  const fed = surv.members ? Object.keys(surv.members).map(k => surv.members[k]) : [];
  day.waterForage = surv.waterForage || null;
  day.rationsConsumed = { food: fed.filter(m => m.fedFood).length, water: fed.filter(m => m.fedWater).length, animalFeed: 0, animalWater: 0, shipStores: 0 };
  // refresh the day's SURVIVAL notables (the forage-row bullets) to match the rerolled outcome, keeping the
  // nav/movement ones — else a re-rolled "water found" day keeps a stale "a traveller is dehydrated" bullet
  // (the same notable-refresh reapplyLatestDaySurvival does; the member Conditions cell already re-derives).
  const _SURV_TYPES = ['hunger', 'dehydration', 'survival-critical', 'supplies-low'];
  const newSurvNotables = (surv.notableEvents || []).map(e => ({ kind: e.kind, type: e.type || null, text: e.label }));
  day.notableEvents = (day.notableEvents || []).filter(ne => _SURV_TYPES.indexOf(ne.type) < 0).concat(newSurvNotables);
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: day.dayIndex, type: 'forage-reroll', narrative: 'GM rerolled day ' + day.dayIndex + ' water-foraging.' });
  // patch the committed umbrella event's digest (best-effort — keep the audit consistent with the record)
  try {
    const entry = (campaign.eventLog || []).find(e => e && e.event && e.event.payload && e.event.payload.journeyId === j.id && e.event.payload.dayIndex === day.dayIndex && e.event.payload.day);
    if(entry){
      entry.event.payload.day.waterForage = day.waterForage;
      entry.event.payload.day.rationsConsumed = { food: day.rationsConsumed.food, water: day.rationsConsumed.water };
      const happ = entry.event.payload.day.happenings || [];
      entry.event.payload.day.happenings = happ.filter(h => !h.type || _SURV_TYPES.indexOf(h.type) < 0).concat(newSurvNotables);
    }
  } catch(e){ /* audit patch is best-effort */ }
  return day.waterForage;
}

// Provisioning rows (Joachim 2026-06-05) — the day log splits into a navigation row and a forage row,
// each with its own GM reroll. rerollJourneyNav re-rolls the NAVIGATION row only: navigation / movement /
// fording / encounter / arrival re-roll with fresh randomness, while the day's water + food + conditions
// outcome is HELD exactly as committed (its mirror is rerollJourneyForage, which re-rolls water and holds
// movement). It runs the full whole-day re-tick with survival skipped, then restores the captured
// provisioning outcome onto the new day. If the new route strays somewhere drier the GM can follow with a
// forage reroll. Latest-day-only + world-not-moved (same gate). Returns the new record, or null.
function rerollJourneyNav(campaign, journey){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!journeyLastDayRerollable(campaign, j)) return null;
  const day = j.days[j.days.length - 1];
  if(!day) return null;
  const SURV_TYPES = ['hunger', 'dehydration', 'survival-critical', 'supplies-low'];
  const ids = j.participantCharacterIds || [];
  // 1. capture the committed (post-day) provisioning outcome so the nav reroll holds it fixed
  const cap = {
    waterForage: day.waterForage ? JSON.parse(JSON.stringify(day.waterForage)) : null,
    rationsConsumed: day.rationsConsumed ? JSON.parse(JSON.stringify(day.rationsConsumed)) : null,
    survNotables: (day.notableEvents || []).filter(ne => SURV_TYPES.indexOf(ne.type) >= 0).map(ne => JSON.parse(JSON.stringify(ne))),
    rations: (j.supplies && j.supplies.rations), waterRations: (j.supplies && j.supplies.waterRations),
    members: {}, camp: null
  };
  for(const c of (campaign.characters || [])){
    if(c && ids.indexOf(c.id) >= 0){
      cap.members[c.id] = {
        waterDaysCarried: c.waterDaysCarried, foodDeficitDays: c.foodDeficitDays, waterDeficitDays: c.waterDeficitDays,
        underfed: c.underfed, starving: c.starving, dehydrated: c.dehydrated,
        conLossHunger: c.conLossHunger, conLossThirst: c.conLossThirst,
        hungerDays: c.hungerDays, dehydrationDays: c.dehydrationDays,
        inventory: Array.isArray(c.inventory) ? JSON.parse(JSON.stringify(c.inventory)) : null
      };
    }
  }
  if(j.partyId && typeof A.partyCampStash === 'function'){
    const cp = A.partyCampStash(campaign, j.partyId);
    if(cp) cap.camp = { items: JSON.parse(JSON.stringify(cp.items || [])), waterDaysCarried: cp.waterDaysCarried || 0 };
  }
  // 2. full whole-day re-roll with survival SKIPPED (no forage throw, no ration draw, no survival events)
  const rec = rerollJourneyDay(campaign, j, { skipSurvival: true });
  if(!rec) return null;
  const newDay = j.days[j.days.length - 1];
  // 3. restore the held provisioning outcome (members + camp + supplies + the day record)
  for(const c of (campaign.characters || [])){
    const m = c && cap.members[c.id];
    if(c && ids.indexOf(c.id) >= 0 && m){
      c.waterDaysCarried = m.waterDaysCarried; c.foodDeficitDays = m.foodDeficitDays; c.waterDeficitDays = m.waterDeficitDays;
      c.underfed = m.underfed; c.starving = m.starving; c.dehydrated = m.dehydrated;
      c.conLossHunger = m.conLossHunger; c.conLossThirst = m.conLossThirst;
      c.hungerDays = m.hungerDays; c.dehydrationDays = m.dehydrationDays;
      if(Array.isArray(m.inventory)) c.inventory = JSON.parse(JSON.stringify(m.inventory));
    }
  }
  if(cap.camp && j.partyId && typeof A.partyCampStash === 'function'){
    const cp = A.partyCampStash(campaign, j.partyId);
    if(cp){ cp.items = JSON.parse(JSON.stringify(cap.camp.items)); cp.waterDaysCarried = cap.camp.waterDaysCarried; }
  }
  j.supplies = j.supplies || {};
  if(typeof cap.rations === 'number') j.supplies.rations = cap.rations;
  if(typeof cap.waterRations === 'number') j.supplies.waterRations = cap.waterRations;
  newDay.waterForage = cap.waterForage;
  if(cap.rationsConsumed) newDay.rationsConsumed = cap.rationsConsumed;
  // keep the new day's nav/movement notables; restore the held survival ones (the forage row's content)
  newDay.notableEvents = (newDay.notableEvents || []).filter(ne => SURV_TYPES.indexOf(ne.type) < 0).concat(cap.survNotables);
  // 4. patch the committed umbrella event's day digest so the audit holds the restored provisioning
  try {
    const entry = (campaign.eventLog || []).find(e => e && e.event && e.event.payload && e.event.payload.journeyId === j.id && e.event.payload.dayIndex === newDay.dayIndex && e.event.payload.day);
    if(entry){
      entry.event.payload.day.waterForage = newDay.waterForage;
      if(cap.rationsConsumed) entry.event.payload.day.rationsConsumed = { food: cap.rationsConsumed.food, water: cap.rationsConsumed.water };
      const happ = entry.event.payload.day.happenings || [];
      entry.event.payload.day.happenings = happ.filter(h => !h.type || SURV_TYPES.indexOf(h.type) < 0).concat(cap.survNotables);
    }
  } catch(e){ /* audit patch is best-effort */ }
  return rec;
}

// Re-resolve the LATEST committed day's survival with the journey's CURRENT supply toggles (forage water /
// share rations) — used when the GM flips a toggle after a day's been ticked, so "today" updates at once
// (Joachim 2026-06-05: the toggle is the party's standing order, and flipping it should re-resolve the day
// the GM is looking at, not just the next tick). Reverts the per-member + camp + pool survival from the
// day's pre-snapshot, re-runs journeyDaySurvival on the party's CURRENT hex — resolved the same way the
// water indicator is (campaign.hexes by currentHexId, natural source check), so the re-resolve agrees with
// what the GM sees — reusing the day's existing forage throw if one was made (so an unrelated share-rations
// flip doesn't re-roll the water), then updates the day record (waterForage / rationsConsumed / the
// survival notables) + the umbrella event digest. Same latest-day-only + world-not-moved gate; null on day
// 0 (nothing committed) — there the toggle just sets the order for the first tick. Returns the survival.
function reapplyLatestDaySurvival(campaign, journey){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!journeyLastDayRerollable(campaign, j)) return null;     // no current committed day to re-resolve (incl. day 0)
  const day = j.days[j.days.length - 1];
  const pre = day && day._preDay;
  if(!pre || !pre.survival) return null;                      // old record without the per-member snapshot
  const SURV_TYPES = ['hunger', 'dehydration', 'survival-critical', 'supplies-low'];
  const ids = j.participantCharacterIds || [];
  // reuse the day's existing forage throw (so a share-rations flip leaves the water alone); null ⇒ fresh roll
  const forageReuse = day.waterForage ? { rolled: day.waterForage.rolled, bonus: day.waterForage.bonus, target: day.waterForage.target } : null;
  // revert the survival-relevant state to the day's pre-state (per-member + camp + the abstract pool)
  const pm = pre.survival.members || {};
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    const ps = pm[c.id]; if(!ps) continue;
    c.waterDaysCarried = ps.waterDaysCarried; c.foodDeficitDays = ps.foodDeficitDays; c.waterDeficitDays = ps.waterDeficitDays;
    c.underfed = ps.underfed; c.starving = ps.starving; c.dehydrated = ps.dehydrated;
    c.conLossHunger = ps.conLossHunger; c.conLossThirst = ps.conLossThirst;
    c.hungerDays = ps.hungerDays; c.dehydrationDays = ps.dehydrationDays;
    if(Array.isArray(ps.inventory)) c.inventory = JSON.parse(JSON.stringify(ps.inventory));
  }
  if(pre.survival.camp && j.partyId && typeof A.partyCampStash === 'function'){
    const cp = A.partyCampStash(campaign, j.partyId);
    if(cp){ cp.items = JSON.parse(JSON.stringify(pre.survival.camp.items || [])); cp.waterDaysCarried = pre.survival.camp.waterDaysCarried || 0; }
  }
  j.supplies = j.supplies || {};
  j.supplies.rations = pre.rations; j.supplies.waterRations = pre.waterRations;
  // re-resolve on the party's current hex (the indicator's hex) with the journey's live toggles
  const hex = (campaign.hexes || []).find(h => h && h.id === (j.currentHexId || j.startHexId)) || null;
  const surv = journeyDaySurvival(campaign, j, hex, { rng: Math.random, forageReuse: forageReuse });
  applyJourneyDaySurvival(campaign, j, surv);
  j.supplies.rations = (typeof surv.newRations === 'number') ? surv.newRations : j.supplies.rations;
  j.supplies.waterRations = (typeof surv.newWaterRations === 'number') ? surv.newWaterRations : j.supplies.waterRations;
  // update the day record: water + rations consumed + the survival notables (keep the nav/movement notables)
  const fed = surv.members ? Object.keys(surv.members).map(k => surv.members[k]) : [];
  day.waterForage = surv.waterForage || null;
  day.rationsConsumed = { food: fed.filter(m => m.fedFood).length, water: fed.filter(m => m.fedWater).length, animalFeed: 0, animalWater: 0, shipStores: 0 };
  const newSurvNotables = (surv.notableEvents || []).map(e => ({ kind: e.kind, type: e.type || null, text: e.label }));
  day.notableEvents = (day.notableEvents || []).filter(ne => SURV_TYPES.indexOf(ne.type) < 0).concat(newSurvNotables);
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: day.dayIndex, type: 'supply-reapply', narrative: 'GM changed supply orders — re-resolved day ' + day.dayIndex + '.' });
  // patch the committed umbrella event's day digest (best-effort) so the audit holds the re-resolved day
  try {
    const entry = (campaign.eventLog || []).find(e => e && e.event && e.event.payload && e.event.payload.journeyId === j.id && e.event.payload.dayIndex === day.dayIndex && e.event.payload.day);
    if(entry){
      entry.event.payload.day.waterForage = day.waterForage;
      entry.event.payload.day.rationsConsumed = { food: day.rationsConsumed.food, water: day.rationsConsumed.water };
      const happ = entry.event.payload.day.happenings || [];
      entry.event.payload.day.happenings = happ.filter(h => !h.type || SURV_TYPES.indexOf(h.type) < 0).concat(newSurvNotables);
    }
  } catch(e){ /* audit patch is best-effort */ }
  return surv;
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
  j.strayHeading = null;          // §27 getting-lost — fresh journey, not straying
  j.routeAnchorCoord = null;      // §27 — anchor by startHexId until a stray/re-route moves it
  j.fatigueDays = j.fatigueDays || 0;
  j.startedAtTurn = (campaign.currentTurn != null) ? campaign.currentTurn : (j.startedAtTurn || null);
  j.startedAtDayInMonth = campaign.currentDayInMonth || j.startedAtDayInMonth || 1;
  const dist = computeJourneyDistance(campaign, j);
  j.daysRemainingEstimate = dist.total > 0 ? Math.max(1, Math.ceil(dist.total / 4)) : 0;
  // §24 — stamp the planned hex path so the UI/integrators can read it without recomputing.
  try { j.routeCoords = journeyRoute(campaign, j).map(s => s.coord); } catch(e){ j.routeCoords = j.routeCoords || []; }
  const ids = j.participantCharacterIds || [];
  for(const c of (campaign.characters || [])){ if(c && ids.indexOf(c.id) >= 0) c.currentJourneyId = j.id; }
  if(j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt) pt.activeJourneyId = j.id;
  }
  // Phase 2.5 Provisioning — convert the wizard's abstract rations/water into tight inventory now
  // (decision #1): camp ration items + per-member waterDaysCarried. Idempotent.
  seedJourneyProvisions(campaign, j);
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
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: j.currentDayIndex || 0, type: 'aborted', narrative: 'Stopped moving' + (reason ? (': ' + reason) : '') + '.' });
  try {
    campaign.eventLog = campaign.eventLog || [];
    const cal = campaign.calendar || {};
    const ev = A.newEvent('journey-aborted', {
      submittedBy: 'engine', status: (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
      targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      context: { primaryHexId: atHex, involvedHexIds: [atHex].filter(Boolean), settlementId: null, domainId: null, relatedEntities: ids.map(id => ({ kind: 'character', id, role: 'subject' })) },
      payload: { journeyId: j.id, reason: reason || null, narrative: (j.name || 'Journey') + ' — travellers stopped moving' + (reason ? (' (' + reason + ')') : '') + '.' }
    });
    ev.appliedAtTurn = campaign.currentTurn || 1;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: (j.name || 'Journey') + ' — stopped moving.' }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
  } catch(e){ /* never let event emission block an abort */ }
  return j;
}

// §24 — change a journey's remaining waypoints and/or destination, including MID-JOURNEY. opts:
//   { waypointIds:[hexId,…], destinationHexId:'hex-…' }  (omit a key to leave that part unchanged).
// The party stays exactly where it is and continues from there: when the journey is already under way
// (some distance covered) we re-anchor the route to the current hex (routeAnchorHexId) and bank the
// hexes walked so far (coveredBaseline), so the recomputed route — and its progress — start from the
// party's position rather than teleporting them onto the Nth hex of the new line. startHexId is kept as
// the TRUE origin (journey name + day-log history). A re-route also clears 'lost' (the GM has re-oriented
// them) and, if applied to an already-'arrived' journey with a new destination, resumes travel. Emits a
// 'journey-rerouted' audit event with the §3.5 context envelope. Returns the journey (null if not found).
function reRouteJourney(campaign, journey, opts){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!j) return null;
  opts = opts || {};
  const has = k => Object.prototype.hasOwnProperty.call(opts, k);
  const prevDestId = j.destinationHexId;
  if(has('waypointIds')) j.waypoints = (opts.waypointIds || []).filter(Boolean).map(id => ({ hexId: id, label: '', plannedPurpose: null }));
  if(has('destinationHexId')) j.destinationHexId = opts.destinationHexId || null;
  const totalCovered = (j.days || []).reduce((s, d) => s + ((d && d.hexesTraveled) || 0), 0);
  const resumingArrived = (j.status === 'arrived') && has('destinationHexId') && j.destinationHexId && j.destinationHexId !== prevDestId;
  if(resumingArrived) j.status = 'in-transit';
  const underway = (j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost') && totalCovered > 0 && j.currentHexId;
  if(underway){
    j.routeAnchorHexId = j.currentHexId;   // the route now begins where the party is
    j.coveredBaseline = totalCovered;      // …and its progress (epoch covered) restarts at 0
  }
  j.isLost = false;                        // a fresh heading re-orients a lost party
  j.strayHeading = null;                   // §27 — drop the stray heading; the GM has re-oriented them
  j.routeAnchorCoord = null;               // §27 — re-anchor by the (authored) current hex, not a strayed coord
  try { j.routeCoords = journeyRoute(campaign, j).map(s => s.coord); } catch(e){ /* keep prior snapshot */ }
  const dist = computeJourneyDistance(campaign, j);
  j.daysRemainingEstimate = dist.total > 0 ? Math.max(1, Math.ceil(dist.remaining / 4)) : 0;
  const wpN = (j.waypoints || []).length;
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: j.currentDayIndex || 0, type: 'rerouted',
    narrative: 'Re-routed' + (has('destinationHexId') ? (' to ' + (j.destinationHexId || '—')) : '') + (has('waypointIds') ? (' via ' + wpN + ' waypoint' + (wpN === 1 ? '' : 's')) : '') + '.' });
  try {
    campaign.eventLog = campaign.eventLog || [];
    const cal = campaign.calendar || {};
    const atHex = j.currentHexId || j.startHexId || null;
    const ev = A.newEvent('journey-rerouted', {
      submittedBy: 'engine', status: (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
      targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      context: { primaryHexId: atHex, involvedHexIds: [atHex, j.destinationHexId].concat((j.waypoints || []).map(w => w.hexId)).filter(Boolean), settlementId: null, domainId: null, relatedEntities: (j.participantCharacterIds || []).map(id => ({ kind: 'character', id, role: 'subject' })) },
      payload: { journeyId: j.id, destinationHexId: j.destinationHexId || null, waypointHexIds: (j.waypoints || []).map(w => w.hexId), narrative: (j.name || 'Journey') + ' re-routed.' }
    });
    ev.appliedAtTurn = campaign.currentTurn || 1;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: (j.name || 'Journey') + ' re-routed.' }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
  } catch(e){ /* never block a re-route on event emission */ }
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
// §27 getting-lost — human labels for the 6 hex faces in HEX_EDGE_DELTAS order, for the flat-top render
// convention (face 0 = SE, 1 = S, 2 = SW, 3 = NW, 4 = N, 5 = NE). Used to narrate a lost party's stray.
const HEX_FACE_LABELS = Object.freeze(['southeast', 'south', 'southwest', 'northwest', 'north', 'northeast']);
// The edge index (0..5) you EXIT a hex through to reach an adjacent neighbour, or -1 if the two
// coords aren't adjacent. The neighbour's matching ENTRY edge is the opposite, (i+3)%6 — the deltas
// are arranged so HEX_EDGE_DELTAS[(i+3)%6] === −HEX_EDGE_DELTAS[i].
function hexEdgeBetween(from, to){
  if(!from || !to) return -1;
  const dq = (to.q || 0) - (from.q || 0), dr = (to.r || 0) - (from.r || 0);
  return HEX_EDGE_DELTAS.findIndex(d => d[0] === dq && d[1] === dr);
}
function hexOppositeEdge(i){ return (((i % 6) + 6) % 6 + 3) % 6; }
function _axialToCube(q, r){ return { x: q, y: -q - r, z: r }; }
function _cubeRound(c){
  let rx = Math.round(c.x), ry = Math.round(c.y), rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x), dy = Math.abs(ry - c.y), dz = Math.abs(rz - c.z);
  if(dx > dy && dx > dz) rx = -ry - rz;
  else if(dy > dz)       ry = -rx - rz;
  else                   rz = -rx - ry;
  return { q: rx, r: rz };
}
// Ordered axial coords along the straight line from a→b INCLUSIVE. With the tiny epsilon nudge
// (the offsets sum to ~0 so the cube x+y+z≈0 constraint holds) every consecutive pair is exactly
// one hex apart — i.e. a walkable, edge-adjacent path. Returns [{q,r},…]; a 0-distance line is [a].
function hexLineDraw(a, b){
  const N = _jACKS().hexAxialDistance(a, b);
  if(!(N > 0)) return [{ q: a.q || 0, r: a.r || 0 }];
  const ac = _axialToCube(a.q || 0, a.r || 0), bc = _axialToCube(b.q || 0, b.r || 0);
  const out = [];
  for(let i = 0; i <= N; i++){
    const t = i / N;
    out.push(_cubeRound({
      x: ac.x + (bc.x - ac.x) * t + 1e-6,
      y: ac.y + (bc.y - ac.y) * t + 1e-6,
      z: ac.z + (bc.z - ac.z) * t - 2e-6
    }));
  }
  return out;
}
// The two endpoints [{x,y},{x,y}] of edge `i` (0..5) of the hex at axial (q,r). Edge i spans
// corner i → corner (i+1)%6, and faces neighbour (q,r)+HEX_EDGE_DELTAS[i].
function hexEdgePoints(q, r, size, i){
  size = size || MAP_DEFAULT_HEX_SIZE;
  const c = hexAxialToPixel(q, r, size);
  const cor = hexCornerPoints(c.x, c.y, size);
  return [ cor[((i % 6) + 6) % 6], cor[(((i % 6) + 6) % 6 + 1) % 6] ];
}
// Midpoint of edge i (0..5) — the point a road "from the middle" reaches out to.
function hexEdgeMidpoint(q, r, size, i){
  const p = hexEdgePoints(q, r, size, i);
  return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
}
// Per-side RIVER geometry (#225 Add/Edit hexes): a river runs ALONG the chosen hex edges (the hex
// boundary), so each side i in `sides` yields the straight segment corner i → corner (i+1)%6.
// Returns [{x1,y1,x2,y2}, …]. (Contrast roads, which run from the centre out to side midpoints.)
function hexRiverSegments(q, r, size, sides){
  const out = [];
  Array.from(new Set((sides || []).map(i => ((i % 6) + 6) % 6))).forEach(i => {
    const p = hexEdgePoints(q, r, size, i);
    out.push({ x1: p[0].x, y1: p[0].y, x2: p[1].x, y2: p[1].y });
  });
  return out;
}
// Per-side ROAD geometry (#225): a road "goes from the middle" out to each chosen side's midpoint,
// with FAINTLY CIRCULAR bends where segments meet at the centre. Returns an SVG path `d` string:
//   • 0 sides → ''                                            (no road)
//   • 1 side  → centre → side-midpoint                        (a stub / dead-end, e.g. to a settlement)
//   • 2 sides → mid(a) → [Q control = centre] → mid(b)        (the common through-road; the quadratic's
//               centre control rounds the bend — straight for opposite sides, a gentle arc for adjacent)
//   • 3+ sides → centre → each side-midpoint                  (a junction; the centre hub is rounded by
//               the caller drawing a small disc — see index.html)
function hexRoadPathD(q, r, size, sides){
  const uniq = Array.from(new Set((sides || []).map(i => ((i % 6) + 6) % 6))).sort((a, b) => a - b);
  if(uniq.length === 0) return '';
  const c = hexAxialToPixel(q, r, size);
  const mid = i => hexEdgeMidpoint(q, r, size, i);
  const f = n => n.toFixed(2);
  if(uniq.length === 1){
    const m = mid(uniq[0]);
    return 'M' + f(c.x) + ' ' + f(c.y) + 'L' + f(m.x) + ' ' + f(m.y);
  }
  if(uniq.length === 2){
    const a = mid(uniq[0]), b = mid(uniq[1]);
    return 'M' + f(a.x) + ' ' + f(a.y) + 'Q' + f(c.x) + ' ' + f(c.y) + ' ' + f(b.x) + ' ' + f(b.y);
  }
  return uniq.map(i => { const m = mid(i); return 'M' + f(c.x) + ' ' + f(c.y) + 'L' + f(m.x) + ' ' + f(m.y); }).join('');
}
// Crossing (ford/bridge) mark on edge i: a short segment centred on the edge midpoint, PERPENDICULAR
// to the edge (i.e. along the centre→midpoint spoke — for a regular hexagon that line is perpendicular
// to the edge), `len` long. Drawn over a river to read as "you can cross here". Returns {x1,y1,x2,y2}.
function hexCrossingSegment(q, r, size, i, len){
  const c = hexAxialToPixel(q, r, size);
  const m = hexEdgeMidpoint(q, r, size, i);
  let dx = m.x - c.x, dy = m.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const h = (len != null ? len : size * 0.34) / 2;
  return { x1: m.x - dx * h, y1: m.y - dy * h, x2: m.x + dx * h, y2: m.y + dy * h };
}

// Axial {q,r} ↔ GM-facing column·row (offset). The column·row pair is THE coordinate GMs read
// off published Auran/JG maps (RR p.273 "hex 401"); axial {q,r} stays the internal canonical store
// (positioning, neighbours, distance — HEX_EDGE_DELTAS, hexAxialToPixel, hexAxialDistance — all axial).
// Flat-top, odd-q: column = q; the row undoes the half-column vertical shear so hexes at the same
// visual height share a row number (redblobgames). EXACT + INVERTIBLE for integer q (q-(q&1) is always
// even, so the >>1 never loses a bit) — round-trips both ways. These are the one boundary where the two
// systems meet: convert at the UI edge, never store column·row. Coords can be negative (the store has no
// fixed origin).
function hexAxialToColRow(q, r){
  return { col: q, row: r + ((q - (q & 1)) >> 1) };
}
function hexColRowToAxial(col, row){
  return { q: col, r: row - ((col - (col & 1)) >> 1) };
}
// RAW-style column·row display label — the GM-facing hex number, e.g. "151099" (column 151, row 099).
// Column and row run together, each zero-padded to the SAME width = max(digits in col, digits in row, 2),
// so the number reads like a published Auran/JG map and always **splits unambiguously in half** (a column
// past 99 pads the row to match — "151"+"099"; small maps stay "0000"). Negatives carry a leading '-'.
// This is what hexName() embeds and what the map draws. (Uniform-width per Joachim, 2026-06-03 — min-2-each
// gave the ambiguous "15199".)
function hexDisplayLabel(q, r){
  const { col, row } = hexAxialToColRow(q, r);
  const w = Math.max(2, String(Math.abs(col)).length, String(Math.abs(row)).length);
  const pad = n => (n < 0 ? '-' : '') + String(Math.abs(n)).padStart(w, '0');
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

// Lay out a rectangular block of blank, UNCLAIMED, UNEXPLORED hexes — the "Create Map" world starter.
// The grid is defined in GM-facing COLUMN·ROW space (the published Auran/JG convention), but each hex
// stores canonical axial {q,r} (converted via hexColRowToAxial). Existing hexes are INCORPORATED, never
// overwritten: any cell whose axial coord is already occupied is skipped, so this is safe to run on a
// populated campaign (fill the gaps around what you've built) and idempotent (a re-run creates nothing).
// opts: { cols, rows, startCol=1, startRow=1 }. Returns { created, skipped }. Mutates campaign.hexes.
// New hexes are domainless (domainId:null) with no terrain and explored:false — a clean canvas to paint.
function generateBlankHexGrid(campaign, opts){
  opts = opts || {};
  const cols = Math.max(0, Math.floor(opts.cols || 0));
  const rows = Math.max(0, Math.floor(opts.rows || 0));
  const startCol = Number.isFinite(opts.startCol) ? Math.floor(opts.startCol) : 1;
  const startRow = Number.isFinite(opts.startRow) ? Math.floor(opts.startRow) : 1;
  const blankHex = global.ACKS && global.ACKS.blankHex;
  if(!campaign || typeof campaign !== 'object' || typeof blankHex !== 'function') return { created: 0, skipped: 0 };
  if(!Array.isArray(campaign.hexes)) campaign.hexes = [];
  // Occupied axial coords. campaign.hexes is the canonical collection — claimed hexes are reference-
  // unified into it on load (liftToTopLevelCollections), so this set covers every existing hex.
  const used = new Set();
  campaign.hexes.forEach(h => { if(h && h.coord) used.add(h.coord.q + ',' + h.coord.r); });
  let created = 0, skipped = 0;
  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const ax = hexColRowToAxial(startCol + c, startRow + r);
      const key = ax.q + ',' + ax.r;
      if(used.has(key)){ skipped++; continue; }
      used.add(key);
      const hex = blankHex({ coord: { q: ax.q, r: ax.r }, terrain: '', explored: false });
      hex.domainId = null; // unclaimed wilderness — a blank canvas to paint a world onto
      campaign.hexes.push(hex);
      created++;
    }
  }
  return { created, skipped };
}

// ── Fill-layer palettes (M2). Color a hex by one attribute at a time. ──
const HEX_TERRAIN_COLORS = Object.freeze({
  barrens:'#cdbfa6', desert:'#e7d9a0', forest:'#3f7d4e', grassland:'#9cc46b',
  hills:'#bda05a', jungle:'#2f6b3a', mountains:'#8d9095', scrubland:'#c2b46a', swamp:'#6b7d52',
  // Water — oceans, seas, big lakes. RAW lists "Ocean" (and "River") as terrain types in the
  // encounter-by-terrain tables (JJ); a hex map needs open-water hexes for coastal/island realms.
  // CARTOGRAPHIC only here — land travel can't cross water (you need a vessel: RR Ch.7 Voyages),
  // so 'water' is deliberately absent from JOURNEY_TERRAIN_SPEED / JOURNEY_NAV_THROWS.
  water:'#6ea4d4'
});
// Common GM/author synonyms → the canonical base types, so a campaign that says "plains" or
// "woods" still colors (RAW has no single master terrain list — §2.2; the templates + demo use
// "plains"/"coast"). Unknown terms stay neutral. "coast" is a water-adjacent LAND hex, not open
// water — it stays grassland; sea/ocean/lake map to the new 'water' fill.
const HEX_TERRAIN_ALIASES = Object.freeze({
  plains:'grassland', plain:'grassland', steppe:'grassland', prairie:'grassland', meadow:'grassland',
  farmland:'grassland', fields:'grassland', pasture:'grassland', savanna:'grassland', savannah:'grassland',
  coast:'grassland', coastal:'grassland', shore:'grassland', shoreline:'grassland', seaside:'grassland', beach:'grassland',
  // 'lake'/'lakes' deliberately NOT aliased to salt 'water' (Provisioning §3.1): a fresh lake is a
  // LAND hex with hasLake=true, not a salt sea. Open 'water' = RAW Ocean (salt by default; a genuine
  // freshwater body sets the freshWater flag). The literal terrain "lake" is superseded by hasLake.
  sea:'water', seas:'water', ocean:'water', oceans:'water', waters:'water',
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
  tickJourneyDay, proposeJourneyDay, commitJourneyRecord, startJourney, abortJourney, reRouteJourney, rerollJourneyDay, journeyLastDayRerollable, computeJourneyDistance, rollNavigation, journeyDefaultName, journeyBaseSpeedMilesPerDay,
  // §24 hex-by-hex resolution — route + pure per-step travel effects (roads / rivers / fording).
  journeyRoute, roadBonusForStep, riverCrossingForStep, journeyFordingThrow,
  // Phase 2.5 Provisioning (RR p.278) — per-member food/water resolution (V2/V3) + the forage reroll.
  hasFreshSource, seedJourneyProvisions, journeyDaySurvival, applyJourneyDaySurvival, rerollJourneyForage, rerollJourneyNav, reapplyLatestDaySurvival,
  // Phase 2.95 §4.2 — Hireling recruitment engine helpers.
  parseAvailabilitySpec, rollAvailabilitySpec, rollAvailabilitySpecDetailed, rollDiceNotation, rollDiceNotationDetailed, rollAvailability, rollAvailabilityDetailed, resolveSolicitFee, rollReactionToHiring, computeReactionMods, solicitHirelings, individuateHirelingCandidate,
  findPersistentCandidates, computeEffectiveLoyalty,
  // Phase 2.5 Map Mode (#225) — pure geometry + fill-layer helpers (Architecture §11).
  // M0–M2: projection, bounds, labels, fill layers. M3–M6: adjacency/edges, glyph sizing, layer catalogs.
  MAP_DEFAULT_HEX_SIZE, hexAxialToPixel, hexCornerPoints, hexPolygonPoints, hexMapBounds, hexAxialToColRow, hexColRowToAxial, hexDisplayLabel, hexName, generateBlankHexGrid,
  hexNeighborDeltas, hexEdgeBetween, hexOppositeEdge, hexLineDraw, hexEdgePoints, hexEdgeMidpoint, hexRiverSegments, hexRoadPathD, hexCrossingSegment, settlementGlyphScale, mapSymbolLayers, mapEdgeLayers, mapTerrainTypes,
  HEX_FACE_LABELS,
  HEX_TERRAIN_COLORS, HEX_CLASSIFICATION_COLORS, HEX_LANDVALUE_RAMP, hexFillColor, hexFillLayers, hexFillLegend
});

// Register the Journeys consumer in the §14 shape (Calendar §10.2 slot 30 — travel).
// registerDayConsumer + the day-tick orchestrator ship from acks-engine.js (loaded first),
// so ACKS.registerDayConsumer is available here. pauseTriggers wire the auto-pause-* rules.
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('journeys', {
    handler: proposeJourneyDay,
    order: 30,
    pauseTriggers: ['encounter', 'navigation-fail', 'supplies-low', 'fording'],
    commit: commitJourneyRecord
  });
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
