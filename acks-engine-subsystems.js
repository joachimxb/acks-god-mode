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
 * global.ACKS so load order is: catalogs → engine → subsystems is fine,
 * but the current order is catalogs → subsystems → engine which means the
 * subsystems can't call engine helpers at definition time. They only need
 * them at runtime, so that's fine.
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
// 9.6 TRAVEL + ENCOUNTER HOOKS (Phase 2.6.7 stubs — Phase 2.5/3 will fill)
// =============================================================================
// These are intentional no-op functions that future phases (Phase 2.5 wilderness
// travel, Phase 3 random encounters) will implement. Companion tools and the UI
// can call them today and get harmless null responses; the moment those phases
// land, the same call sites become live.

function travelEstimate(character, destinationHexId, options){
  // STUB: returns null. Phase 2.5 will return { eta:turn, route:[hexIds], chanceOfEncounter:n }
  return null;
}

function rollEncounter(hexOrParty, options){
  // STUB: returns null. Phase 3 Encounters (#141) will roll wilderness/dungeon encounter tables.
  return null;
}

function applyTravelTick(campaign, options){
  // STUB: no-op. Called per turn by commitTurn once Phase 2.5 lands; will advance characters along
  // their travelDestination, decrement remaining distance, surface arrivals as events.
  return { arrivals: [], encounters: [], inTransit: [] };
}

// ─── Attach to ACKS namespace ────────────────────────────────────────────
const ACKS = global.ACKS = global.ACKS || {};
Object.assign(ACKS, {
  CALENDARS, calendarFor, monthName, seasonFor, currentDateString, advanceCalendarOneMonth, advanceCalendarOneDay, rollLoyaltyCheck, tickHenchmanLoyalty, RUMOR_TOPICS, RUMOR_APPARENT_LEVELS, RUMOR_TRUTH_LEVELS, RUMOR_PROLIFERATION_CHANCE, blankRumor, tickRumorApparentLevels, NOTABILITY_CATEGORIES, ENTRYWAY_KINDS, ENTRYWAY_SECURITY, ASSET_RESTRICTIONS, ENTRYWAY_INSPECTION_DEFAULT, computeTransactionThreshold, blankNotability, blankEntryway, blankRegulatedAsset, travelEstimate, rollEncounter, applyTravelTick,
  // Phase 2.95 §4.2 — Hireling recruitment engine helpers.
  parseAvailabilitySpec, rollAvailabilitySpec, rollAvailabilitySpecDetailed, rollDiceNotation, rollDiceNotationDetailed, rollAvailability, rollAvailabilityDetailed, resolveSolicitFee, rollReactionToHiring, computeReactionMods, solicitHirelings, individuateHirelingCandidate,
  findPersistentCandidates, computeEffectiveLoyalty
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
