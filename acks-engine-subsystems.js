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

// ─── Review-tab calendar cursors + dated event reads (2026-06-13) ────────────
// The Review ▸ Pending Events tables page through the calendar (◀ today ▶). These
// are pure derived reads — nothing here mutates the campaign. Turn numbers and the
// calendar advance in lockstep (commitTurn does both), so a month offset of -1 is
// both "last calendar month" and "turn − 1"; the cursors carry the pair.

// The current calendar position shifted by `monthOffset` whole months.
// → { year, month, turn, label } on the fixed 12-month / 30-day-per-month clock.
function calendarShiftMonths(campaign, monthOffset){
  const cal = (campaign && campaign.calendar) || {};
  const off = monthOffset || 0;
  const baseY = cal.year || 1, baseM = cal.month || 1;
  const total = (baseY * 12 + (baseM - 1)) + off;     // months since year 0
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  const turn = ((campaign && campaign.currentTurn) || 1) + off;
  return { year, month, turn, label: monthName(campaign, month) + ', Year ' + year };
}

// The current calendar position shifted by `dayOffset` days (30-day months).
// → { year, month, day, turn, label, isToday }.
function calendarDayShift(campaign, dayOffset){
  const dim = (campaign && campaign.currentDayInMonth) || 1;
  const total = dim + (dayOffset || 0);               // 1-based day within the current month
  const monthShift = Math.floor((total - 1) / 30);
  const day = ((total - 1) % 30 + 30) % 30 + 1;
  const m = calendarShiftMonths(campaign, monthShift);
  return {
    year: m.year, month: m.month, day, turn: m.turn,
    // "Day 12 of Mosadios, Year 2" — reads right for named AND generic ("Month 3") calendars.
    label: 'Day ' + day + ' of ' + monthName(campaign, m.month) + ', Year ' + m.year,
    isToday: (dayOffset || 0) === 0
  };
}

// An event's day stamp, when it carries one: appliedAtDay (the #346 errand stamp set at
// apply time) or gameTimeAt.day (the day-tick emissions). Null = month-grained.
function _eventDayStamp(ev){
  if(!ev) return null;
  if(ev.appliedAtDay != null) return ev.appliedAtDay;
  if(ev.gameTimeAt && ev.gameTimeAt.day != null) return ev.gameTimeAt.day;
  return null;
}

// Uniform row shape for the Review ▸ Pending Events tables. `entryOrEv` is either a
// pendingEvents[] event (isPending) or an eventLog[] wrapper {event, result, appliedAtTurn}.
function _reviewEventRow(entryOrEv, isPending){
  const ev = isPending ? entryOrEv : ((entryOrEv && entryOrEv.event) || entryOrEv);
  const res = isPending ? null : (entryOrEv && entryOrEv.result) || null;
  return {
    isPending: !!isPending,
    id: ev.id,
    kind: ev.kind,
    status: isPending ? 'pending' : (ev.status || 'applied'),
    submittedBy: ev.submittedBy || '',
    summary: (res && res.narrativeSummary) || '',
    targetTurn: ev.targetTurn != null ? ev.targetTurn : null,
    day: _eventDayStamp(ev),
    campaignLogHidden: !isPending && !!(entryOrEv && entryOrEv.campaignLogHidden),
    event: ev
  };
}

// Every DAY-dated event on one calendar day — committed log entries plus any
// future-dated pending events. `info` is a calendarDayShift() cursor. Month-grained
// events (no day stamp) belong to monthlyEventsForReview below.
function eventsOnCalendarDay(campaign, info){
  if(!campaign || !info) return [];
  const rows = [];
  (campaign.eventLog || []).forEach(entry => {
    const ev = (entry && entry.event) || entry;
    if(!ev) return;
    const evDay = _eventDayStamp(ev);
    if(evDay == null) return;
    const evTurn = (entry.appliedAtTurn != null) ? entry.appliedAtTurn : ev.appliedAtTurn;
    const gta = ev.gameTimeAt;
    // A full game-date stamp matches on (year, month, day); a bare day stamp on (turn, day).
    const matches = (gta && gta.day != null)
      ? (gta.year === info.year && gta.month === info.month && gta.day === info.day)
      : (evTurn === info.turn && evDay === info.day);
    if(matches) rows.push(_reviewEventRow(entry, false));
  });
  (campaign.pendingEvents || []).forEach(ev => {
    if(!ev || ev.status !== 'pending') return;
    const evDay = _eventDayStamp(ev);
    if(evDay == null) return;
    const gta = ev.gameTimeAt;
    const matches = (gta && gta.day != null)
      ? (gta.year === info.year && gta.month === info.month && gta.day === info.day)
      : ((ev.targetTurn || 0) === info.turn && evDay === info.day);
    if(matches) rows.push(_reviewEventRow(ev, true));
  });
  return rows;
}

// Every MONTH-grained event for one month: the pending queue targeting that turn
// (overdue items surface on the CURRENT month — they're due now) + the turn's applied
// log entries. Pending rows lead. `info` is a calendarShiftMonths() cursor.
function monthlyEventsForReview(campaign, info){
  if(!campaign || !info) return [];
  const currentTurn = (campaign.currentTurn || 1);
  const pending = [], logged = [];
  (campaign.pendingEvents || []).forEach(ev => {
    if(!ev || ev.status !== 'pending') return;
    if(_eventDayStamp(ev) != null) return;            // the daily table's business
    const t = ev.targetTurn || 0;
    const onItsMonth = (t === info.turn);
    const dueNow = (info.turn === currentTurn && t <= currentTurn);
    if(onItsMonth || dueNow) pending.push(_reviewEventRow(ev, true));
  });
  (campaign.eventLog || []).forEach(entry => {
    const ev = (entry && entry.event) || entry;
    if(!ev) return;
    if(_eventDayStamp(ev) != null) return;
    const evTurn = (entry.appliedAtTurn != null) ? entry.appliedAtTurn : ev.appliedAtTurn;
    if(evTurn === info.turn) logged.push(_reviewEventRow(entry, false));
  });
  return pending.concat(logged);
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
  // T6 single-home — the settlement lives in the canonical campaign.settlements[].
  if(Array.isArray(campaign.settlements)){
    const top = campaign.settlements.find(s => s && s.id === settlementId);
    if(top && top.name) return top.name;
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
  // T6 single-home — the settlement lives in the canonical campaign.settlements[].
  let settlement = null;
  if(Array.isArray(campaign.settlements)){
    settlement = campaign.settlements.find(s => s && s.id === opts.settlementId);
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
      // Single-home (T6): the patron's company units live in campaign.units (stationedAt the character);
      // read existing same-type units via unitsStationedAt (the mercenaryCompany.units mirror is gone).
      const companyUnits = global.ACKS.unitsStationedAt(campaign, { kind: 'character', id: patron.id }) || [];
      // #548 — targetGarrisonUnitId payload field. '__new__' = force create even if same-type exists.
      // Specific id = use that unit directly. Unset = auto-find first same-type sibling (legacy behavior).
      let unit;
      if(p.targetGarrisonUnitId === '__new__'){
        unit = null;
      } else if(p.targetGarrisonUnitId){
        unit = companyUnits.find(u => u.id === p.targetGarrisonUnitId);
        if(!unit) unit = companyUnits.find(u => u.unitTypeKey === p.hireTypeId);
      } else {
        unit = companyUnits.find(u => u.unitTypeKey === p.hireTypeId);
      }
      if(!unit){
        // W1: create through blankUnit (TROOP_CATALOG wage/BR defaults — closes the old
        // "pending Phase 3 DaW" zero-wage placeholders; race defaults 'man' — the settlement's
        // prevailing race lands with realm recruitment, W7) + stationUnit (first-class
        // campaign.units[] membership alongside the mercenary-company mirror).
        unit = global.ACKS.blankUnit({
          displayName: unitDisplayName,
          unitTypeKey: p.hireTypeId,
          count: 0,
          stationedAtHexId: patron.currentHexId || null
        });
        unit.recruitedAt = p.settlementId || null;
        global.ACKS.stationUnit(campaign, unit, { kind: 'character', id: patron.id });
      }
      unit.count = Number(unit.count || 0) + addCount;
      if(p.commandUnitId === unit.id && Array.isArray(p.candidateIds) && p.candidateIds[0]){
        unit.commanderCharacterId = p.candidateIds[0];
      }
      unitId = unit.id;
      destNarr = "into " + (patron.name || 'patron') + "'s company";
    } else {
      // Single-home (T6): the domain's garrison units live in campaign.units (stationedAt the domain);
      // read existing same-type units via unitsStationedAt (the garrison.units mirror is gone).
      const garrisonUnits = global.ACKS.unitsStationedAt(campaign, { kind: 'domain-garrison', id: ruledDomain.id }) || [];
      // #548 — targetGarrisonUnitId payload field. See merc-company branch above.
      let unit;
      if(p.targetGarrisonUnitId === '__new__'){
        unit = null;
      } else if(p.targetGarrisonUnitId){
        unit = garrisonUnits.find(u => u.id === p.targetGarrisonUnitId);
        if(!unit) unit = garrisonUnits.find(u => u.unitTypeKey === p.hireTypeId);
      } else {
        unit = garrisonUnits.find(u => u.unitTypeKey === p.hireTypeId);
      }
      if(!unit){
        // W1: blankUnit (catalog wage/BR) + stationUnit (campaign.units[] + the garrison mirror).
        unit = global.ACKS.blankUnit({
          displayName: unitDisplayName,
          unitTypeKey: p.hireTypeId,
          count: 0,
          stationedAtHexId: patron.currentHexId || null
        });
        global.ACKS.stationUnit(campaign, unit, { kind: 'domain-garrison', id: ruledDomain.id });
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

    // Settlement Demographics SD-2 — a hired hireling is "from" the market it was solicited in
    // (the recruitment settlement): tag its home so it fills that settlement's Step-3 roster
    // (ACKS.realizedDemographics reconciles it against the expectation, plan §7). Don't clobber a
    // GM-set home.
    if(p.settlementId && !cand.homeSettlementId) cand.homeSettlementId = p.settlementId;

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

// ─── Day-aware recruitment drives (Phase 2.95 #310 — RR p.164) ─────────────────────────────────
// Soliciting for hirelings is an ONGOING activity: the patron is "in the market" for up to 3 weeks,
// candidates trickle in (½ week 1, ¼ week 2, remainder week 3), each week costs the solicit fee, and it
// costs 1 ancillary/day (the activity budget reads the active drive). The global Day Clock advances it
// (the 'recruitment' day-consumer). A drive lives on the patron (character.recruitmentDrives[]).

// Game-day ordinal (months are 30 days) — a monotonic day count for measuring elapsed weeks.
function _campaignDayOrd(campaign){
  return (((campaign && campaign.currentTurn) || 1) - 1) * 30 + (((campaign && campaign.currentDayInMonth) || 1));
}
function recruitmentDrivesForPatron(campaign, patronId){
  const c = ((campaign && campaign.characters) || []).find(x => x && x.id === patronId);
  return (c && Array.isArray(c.recruitmentDrives)) ? c.recruitmentDrives : [];
}
function activeRecruitmentDrivesForPatron(campaign, patronId){
  return recruitmentDrivesForPatron(campaign, patronId).filter(d => d && d.status === 'active');
}

// Start a solicitation drive: rolls the total availability + the RAW 3-week schedule once
// (solicitHirelings). RAW p.164 — candidates arrive AFTER a week of soliciting, so a fresh drive reveals
// NOTHING on day 0; the 'recruitment' day-consumer reveals ½/¼/remainder at +7/+14/+21 days and charges
// each week's fee as that week completes. PURE state. Returns { ok, drive, feeOwedGp:0 } or { ok:false, error }.
function startRecruitmentDrive(campaign, opts){
  opts = opts || {};
  const patron = ((campaign && campaign.characters) || []).find(c => c && c.id === opts.patronCharacterId);
  if(!patron) return { ok:false, error:'unknown-patron' };
  if(opts.marketClassIdx == null || opts.marketClassIdx < 0 || opts.marketClassIdx > 5) return { ok:false, error:'bad-market-class' };
  let sol;
  try { sol = solicitHirelings({ hireCategory: opts.hireCategory, hireTypeId: opts.hireTypeId, marketClassIdx: opts.marketClassIdx, rng: opts.rng }); }
  catch(e){ return { ok:false, error:'solicit-failed', detail:String((e && e.message) || e) }; }
  const ord = _campaignDayOrd(campaign);
  const drive = {
    id: newId(ID_PREFIXES.recruitmentDrive),
    patronCharacterId: patron.id,
    settlementId: opts.settlementId || null,
    marketClassIdx: opts.marketClassIdx,
    hireCategory: opts.hireCategory, hireTypeId: opts.hireTypeId,
    hireTypeLabel: (sol.row && sol.row.label) || opts.hireTypeId,
    startedTurn: (campaign && campaign.currentTurn) || 1, startedDayOrd: ord,
    totalAvailable: sol.totalAvailable, weekly: (sol.weekly || []).slice(), feeWeekly: sol.feeWeekly,
    weeksRevealed: 0,                                  // RAW p.164: candidates arrive after a week of soliciting, not on day 0
    revealedAvailable: 0,
    weeksCharged: 0, feesAccruedGp: 0,                 // each week's fee is charged by the day-consumer when that week completes
    status: 'active'
  };
  patron.recruitmentDrives = patron.recruitmentDrives || [];
  patron.recruitmentDrives.push(drive);
  return { ok:true, drive: drive, feeOwedGp: 0 };       // no upfront fee — week 1's fee lands when week 1 completes (+7 days)
}

// PURE peek: what a drive would reveal at game-day `dayOrd` (no mutation). null = no new week yet.
// RAW p.164: week N's candidates (+ its fee) land after N full weeks of soliciting have elapsed, so a
// fresh drive (elapsedWeeks 0) reveals nothing; week 1 at +7, week 2 at +14, week 3 at +21 (complete).
// Returns { weeksRevealed, revealedAvailable, weeksCharged, feeOwed, completed }.
function _recruitmentDriveRevealAt(d, dayOrd){
  const elapsedWeeks = Math.max(0, Math.floor((dayOrd - (d.startedDayOrd || dayOrd)) / 7));
  const target = Math.min(3, elapsedWeeks);            // week N arrives after N full weeks (was 1+elapsedWeeks — that revealed week 1 on day 0)
  if(target <= d.weeksRevealed) return null;           // no new week elapsed yet
  const revealedAvailable = (d.weekly || []).slice(0, target).reduce((s, n) => s + (n || 0), 0);
  const newWeeks = Math.max(0, target - d.weeksCharged);
  return { weeksRevealed: target, revealedAvailable, weeksCharged: Math.max(d.weeksCharged, target), feeOwed: newWeeks * (d.feeWeekly || 0), completed: target >= 3 };
}
function _applyRecruitmentReveal(d, rev){
  d.weeksRevealed = rev.weeksRevealed; d.revealedAvailable = rev.revealedAvailable;
  d.weeksCharged = rev.weeksCharged; d.feesAccruedGp = (d.feesAccruedGp || 0) + (rev.feeOwed || 0);
  if(rev.completed) d.status = 'complete';              // all candidates available — search done (RR p.164)
}

// Advance every active drive to the current game day: reveal newly-available weeks + accrue their fees
// (no gp debit — the day-tick / caller debits the returned feeOwedGp). Returns the changed drives:
// [{ patronId, drive, weeksNewlyRevealed, feeOwedGp, completed }].
function advanceRecruitmentDrives(campaign, opts){
  opts = opts || {};
  const ord = (typeof opts.dayOrd === 'number') ? opts.dayOrd : _campaignDayOrd(campaign);
  const out = [];
  for(const c of ((campaign && campaign.characters) || [])){
    if(!c || !Array.isArray(c.recruitmentDrives)) continue;
    for(const d of c.recruitmentDrives){
      if(!d || d.status !== 'active') continue;
      const rev = _recruitmentDriveRevealAt(d, ord);
      if(!rev) continue;
      const before = d.weeksRevealed;
      _applyRecruitmentReveal(d, rev);
      out.push({ patronId: c.id, drive: d, weeksNewlyRevealed: rev.weeksRevealed - before, feeOwedGp: rev.feeOwed, completed: rev.completed });
    }
  }
  return out;
}

// ─── 'recruitment' day-consumer (Calendar §14) — the global Day Clock advances active drives ──────
// PURE propose: peeks each active drive at the target day and emits one record per drive that reveals a
// new week (carrying the resolved post-state + the week's fee) + a transient "now available" notable.
// Commit applies the reveal to the real drive and charges the week's solicit fee from the patron's purse
// (GP Wave B; RR p.164 — per week, per hireling type). order 45 (after survival 35, before construction 50).
function proposeRecruitmentDay(campaign, ctx){
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  const dayInMonth = (ctx && ctx.dayInMonth) || ((campaign && campaign.currentDayInMonth) || 1);
  const dayOrd = (((campaign && campaign.currentTurn) || 1) - 1) * 30 + dayInMonth;
  for(const c of ((campaign && campaign.characters) || [])){
    if(!c || !Array.isArray(c.recruitmentDrives)) continue;
    for(const d of c.recruitmentDrives){
      if(!d || d.status !== 'active') continue;
      const rev = _recruitmentDriveRevealAt(d, dayOrd);
      if(!rev) continue;
      out.pendingRecords.push({ kind: 'recruitment', patronId: c.id, driveId: d.id, reveal: rev });
      out.notableEvents.push({ kind: 'gm-narrative', type: 'recruitment', transient: true, primaryHexId: null,
        label: (c.name || 'A patron') + ': ' + rev.revealedAvailable + ' ' + (d.hireTypeLabel || d.hireTypeId) + (rev.completed ? ' available — search complete' : ' available so far'),
        payload: { characterId: c.id, driveId: d.id } });
    }
  }
  return out;
}
function commitRecruitmentRecord(campaign, record){
  if(!record || record.kind !== 'recruitment' || !record.reveal) return;
  const A = _jACKS();
  const c = ((campaign && campaign.characters) || []).find(x => x && x.id === record.patronId);
  const d = (c && Array.isArray(c.recruitmentDrives)) ? c.recruitmentDrives.find(x => x && x.id === record.driveId) : null;
  if(!d) return;
  _applyRecruitmentReveal(d, record.reveal);
  // charge the week's solicit fee from the patron's purse (RR p.164 — per week, per type), GP Wave B.
  const fee = record.reveal.feeOwed || 0;
  if(fee > 0 && typeof A.applyWealthTransfer === 'function'){
    const spec = { amount: fee, source: { kind: 'character-gp', id: c.id }, destination: { kind: 'external', label: 'Solicitation fee' }, allowOverdraft: true, reason: 'Hireling solicitation fee', bucket: 'recruitment' };
    try { A.applyWealthTransfer(campaign, spec); if(typeof A.recordWealthTransfer === 'function') A.recordWealthTransfer(campaign, spec, { submittedBy: 'engine' }); } catch(e){}
  }
}

// Stop a drive (the patron leaves the market / has hired enough) — marks it 'stopped' (kept for history).
function stopRecruitmentDrive(campaign, patronId, driveId){
  const d = recruitmentDrivesForPatron(campaign, patronId).find(x => x && x.id === driveId);
  if(!d) return { ok:false, error:'drive-not-found' };
  if(d.status === 'active') d.status = 'stopped';
  return { ok:true, drive: d };
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
    for(const p of (c.proficiencies || [])){       // PT-0: read the canonical {key} slug too
      const name = (typeof p === 'string') ? p : ((p && (p.key || p.name || p.label || p.proficiency)) || '');
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
  // PT-5 — folded onto Layer 1 (ACKS.rollProficiencyThrow), the last of the 1d20 fold sweep.
  // autoFailBand:0 preserves the EXACT behaviour this shipped with — RR p.271 Swimming as coded
  // here has no nat-1 auto-fail (a high Swimming bonus can carry a natural 1). The RR pp.9–10
  // nat-1 rule is a separate RAW question, deliberately NOT changed inside a byte-identical fold.
  // proficient:false (no nat-20 rule). Same single rng consumption + same compare → byte-identical;
  // the legacy {rolled,bonus,target,total,success} shape is preserved. (proficiencies.js loads after
  // subsystems.js — resolves at runtime via the _jACKS() handle, like rollNavigation above.)
  const r = _jACKS().rollProficiencyThrow({ target, modifiers: [{ source: 'swimming', value: bonus || 0 }], autoFailBand: 0, proficient: false, rng });
  return { rolled: r.natural, bonus, target, total: r.total, success: r.success, coldWater: !!opts.coldWater, roughWater: !!opts.roughWater };
}

// §7 — navigation throw (1d20 + party proficiency bonus ≥ terrain target). RR p.275: an unmodified
// natural 1 ALWAYS fails, regardless of bonus. Pure given rng.
function rollNavigation(navTarget, bonus, rng){
  // PT-6 — folded onto Layer 1 (ACKS.rollProficiencyThrow): nat-1 auto-fail (autoFailBand 1), no
  // nat-20 rule (proficient false). Byte-identical to the inline 1d20 it replaces (same single rng
  // consumption + same RAW math); the legacy {rolled,target,bonus,total,naturalOne,success} shape is
  // preserved for the journey day-log + journeys smoke. (proficiencies.js loads after subsystems.js,
  // so this resolves at runtime — the same cross-module pattern as the _jACKS().trackingFindThrow call.)
  const r = _jACKS().rollProficiencyThrow({ target: navTarget, modifiers: [{ source: 'party', value: bonus || 0 }], autoFailBand: 1, proficient: false, rng: rng || Math.random });
  return { rolled: r.natural, target: navTarget, bonus: bonus || 0, total: r.total, naturalOne: r.natural === 1, success: r.success };
}

// §7 navigation-throw bonus (RR p.275): +4 if any traveller has the Navigation proficiency OR the
// Pathfinding class power, +8 if the party collectively has BOTH. Nothing else modifies this throw —
// Land Surveying (points-of-interest assessment), Adventuring (camp/first-aid/etc.), Survival, and
// Seafaring (sea navigation, a different throw) do NOT help a land getting-lost check. Pathfinding is a
// class power; Navigation is a proficiency — scan both lists (some saves list either in either). Pure.
function _journeyNavBonus(campaign, journey){
  const ids = journey.participantCharacterIds || [];
  let hasNav = false, hasPath = false;
  const scan = (entry) => {       // PT-0: read the canonical {key} slug as well as legacy strings / {name}
    const name = (typeof entry === 'string') ? entry : ((entry && (entry.key || entry.name || entry.label || entry.id || entry.proficiency)) || '');
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

// ─── #476 E1 — proposal-id minting (collision-proof) ──────────────────────────────────────────
// Encounter proposal ids are minted at PROPOSE time from the seeded rng so a re-opened preview
// shows the same id and the commit's id-idempotent create replays cleanly. But an id-idempotent
// create silently MERGES two different encounters if two mints ever collide (a constant test rng,
// or two seeded streams emitting the same draw) — so the mint checks both the campaign's existing
// entities and the batch's own mints (takenIds, threaded through a day's loop) and appends a
// deterministic counter suffix until free. Same state → same suffixes → previews stay byte-stable.
function _mintEncounterProposalId(campaign, rng, takenIds){
  const base = 'enc-' + ('0000000' + Math.floor((rng || Math.random)() * 78364164096).toString(36)).slice(-7);
  const A = _jACKS();
  let id = base, n = 2;
  while((takenIds && takenIds[id]) || (typeof A.findEncounter === 'function' && A.findEncounter(campaign, id))){
    id = base + '-' + n; n++;
  }
  if(takenIds) takenIds[id] = true;
  return id;
}

// E4m — name a loose-band verdict for the GM review ("who answers the draw"): the chase's
// quarry, or the migrant group's name. GM-facing — the characters just meet a band.
function _looseBandMetText(campaign, bind){
  const A = _jACKS();
  if(bind && bind.bandKind === 'pursuer' && bind.encounterId){
    const chase = (typeof A.findEncounter === 'function') ? A.findEncounter(campaign, bind.encounterId) : null;
    const ps = (chase && chase.partySide) || {};
    const party = ps.partyId ? ((campaign.parties || []).find(p => p && p.id === ps.partyId)) : null;
    const ch = ((ps.characterIds || []).length) ? ((campaign.characters || []).find(c => c && c.id === ps.characterIds[0])) : null;
    const quarry = (party && party.name) || (ch && ch.name) || 'another party';
    return 'the band hunting ' + quarry + ' crosses your path';
  }
  if(bind && bind.bandKind === 'migrant' && bind.groupId){
    const g = (campaign.groups || []).find(x => x && x.id === bind.groupId);
    return 'the roaming band' + (g && g.name ? ' “' + g.name + '”' : '') + ' is met here';
  }
  return 'a known band abroad here';
}

// ─── #476 E1 — the per-hex travel encounter throw (JJ pp.41–42; replaces the J1 1/6 stub) ─────
// ONE hex's RAW draw: the 1d20 category throw on the territory-classification column (a road
// folds one column LEFT — roads are safer, not safe, reversing the J1 "roads = no encounters"
// stub; travel is the daytime 8h block, so no night shift), then monster identity POOL-FIRST
// through encounterDraw (existing lair → the MM p.15 lair-vs-wandering split / seeded shells /
// else GM-pick until #141's identity tables land — D12). Returns null on no-encounter. A meeting
// category (monster/civilized) returns { encounterRecord, notableEvent } with the full draw +
// the pre-rolled RAW distance riding the record, so the commit materializes the Encounter entity
// byte-identically to the reviewed preview (seeded rng). A terrain category (dangerous/valuable/
// unique) returns a notable WITHOUT an entity — a discovery has no sides; its 1d12 content
// tables are #141 — and demotes to no-encounter on a known route (JJ p.42 step 7).
function rollEncounter(campaign, journey, opts){
  opts = opts || {};
  const rng = opts.rng || Math.random;
  const hexId = (opts.hexId !== undefined) ? opts.hexId : ((journey && (journey.currentHexId || journey.startHexId)) || null);
  const coord = opts.coord || null;
  const dayIndex = opts.dayIndex || ((journey && journey.currentDayIndex) || 0) + 1;
  if(!campaign || (!hexId && !coord) || typeof ACKS.encounterDraw !== 'function') return null;
  // Known route: a hex some PRIOR committed day of this journey already traversed —
  // matched by id when authored, by coord when not.
  const knownRoute = (opts.knownRoute != null) ? !!opts.knownRoute
    : !!(journey && Array.isArray(journey.days) && journey.days.some(d => d && Array.isArray(d.hexPath) && d.hexPath.some(h => h
        && ((hexId && h.hexId === hexId) || (coord && h.q === coord.q && h.r === coord.r)))));
  // The hex (or, for an unauthored sparse-route step, the journey's current/start hex
  // ENVIRONMENT — the §24 fallback) keys both the identity table and the distance row.
  const hex = hexId ? (campaign.hexes || []).find(h => h && h.id === hexId) : null;
  const envHex = hex || (campaign.hexes || []).find(h => h && h.id === ((journey && (journey.currentHexId || journey.startHexId)) || null)) || null;
  // E4: identity rolls on the JJ tables inside the draw (table-first — RAW JJ p.43; the
  // hex's lairs MATCH the rolled monster via the 6a Lair % binding rather than overriding
  // the table). A pooled dynamic lair is revealed only when the table rolls ITS monster
  // in-lair (RAW's parenthetical) — the old blanket includeDynamicPool stays off.
  const draw = ACKS.encounterDraw(campaign, hexId, {
    road: !!opts.hasRoad, night: false, resting: false, knownRoute, rng,
    terrainKey: (!hex && envHex && typeof ACKS.terrainKey === 'function') ? ACKS.terrainKey(envHex) : undefined,
    hasRiver: (!hex && envHex) ? !!(Array.isArray(envHex.riverSides) && envHex.riverSides.length) : undefined,
    // E4m — the drawing group: a loose band abroad here can answer the wandering verdict,
    // but never a chase's own quarry (meeting your pursuer is the chase's catch).
    partySide: { partyId: (journey && journey.partyId) || null,
                 characterIds: ((journey && journey.participantCharacterIds) || []).slice() }
  });
  if(!draw || draw.category === 'no-encounter') return null;
  const jName = (journey && journey.name) || 'Journey';
  // Terrain categories — a discovery notable, no entity.
  if(draw.category === 'dangerous' || draw.category === 'valuable' || draw.category === 'unique'){
    const label = jName + ': ' + draw.category + ' terrain encounter — GM, resolve (the 1d12 terrain tables land with #141)';
    return { encounterRecord: null, notableEvent: {
      kind: 'journey-encounter', type: 'encounter', pauseTrigger: 'encounter', primaryHexId: hexId,
      label: label,
      payload: { journeyId: journey && journey.id, dayIndex, hexId, encounterId: null,
                 category: draw.category, rarity: null, lairId: null, seededShellLairIds: null,
                 encounterKind: null, fragmentCount: null }
    } };
  }
  // Meeting categories (monster / civilized) → the entity proposal. The id is minted from the
  // SEEDED rng (7-char base36, the registered enc- prefix) so a re-opened preview shows the
  // same id and the commit creates the entity under it (createEncounter is id-idempotent).
  const encId = _mintEncounterProposalId(campaign, rng, opts.takenIds);
  const prop = draw.proposal || null;
  const ir = draw.identityRoll || null, bind = draw.binding || null;
  let label, monsters = [], lairId = null, seededShellLairIds = null, encounterKind = null, fragmentCount = null;
  if(ir){
    // E4 — the table named the creature; the label states the 6a verdict so the GM
    // ratifies knowing exactly what the commit will do to the world.
    const mName = (ir.key && typeof ACKS.monsterDisplayName === 'function' && ACKS.monsterDisplayName(ir.key)) || ir.label || 'creatures';
    const head = jName + ': ' + (draw.category === 'civilized' ? 'civilized encounter — ' : 'encounter — ');
    const n = bind && bind.count;
    if(!ir.key){
      label = head + ir.label + ' (rolled ' + ir.natural + ' on the ' + (draw.category === 'civilized' ? 'civilized' : (draw.rarity || '')) + ' table — GM details the specifics) — GM, resolve';
      encounterKind = 'wandering';
    } else if(bind && bind.mode === 'existing-lair'){
      lairId = bind.lairId; encounterKind = 'at-lair';
      const den = (typeof ACKS.findLair === 'function') ? ACKS.findLair(campaign, bind.lairId) : null;
      if(den) monsters = (den.groupIds || []).map(id => ({ groupId: id }));
      label = head + mName + ' in their lair here' + (n ? ' (' + n + ' inhabitants)' : '') + ' — GM, resolve';
    } else if(bind && bind.mode === 'fragment'){
      lairId = bind.lairId; encounterKind = 'wandering-fragment'; fragmentCount = n || null;
      label = head + (n ? n + ' ' : 'a band of ') + mName.toLowerCase() + (n === 1 ? '' : 's')
        + ' out from their lair in this hex — GM, resolve (Tracking can follow them home)';
    } else if(bind && bind.mode === 'populate-shell'){
      encounterKind = 'at-lair';
      label = head + mName + ' in their lair (' + (n || '?') + ') — details one of this hex’s seeded lairs at commit — GM, resolve';
    } else if(bind && bind.mode === 'reveal-dynamic'){
      encounterKind = 'at-lair';
      const dl = (typeof ACKS.findLair === 'function') ? ACKS.findLair(campaign, bind.lairId) : null;
      label = head + mName + ' in their lair — reveals the pooled “' + ((dl && dl.name) || 'dynamic lair') + '” here at commit — GM, resolve';
    } else if(bind && bind.mode === 'fresh-lair'){
      encounterKind = 'at-lair';
      label = head + mName + ' in their lair (' + (n || '?') + ') — a new den in this hex at commit — GM, resolve';
    } else if(bind && bind.mode === 'loose-band'){
      // E4m — a known band abroad answers: name it so the GM ratifies knowing who.
      encounterKind = 'wandering';
      lairId = bind.lairId || null;
      label = head + (n ? n + ' ' : '') + mName.toLowerCase() + (n === 1 ? '' : 's')
        + ' — ' + _looseBandMetText(campaign, bind) + ' — GM, resolve';
    } else {
      encounterKind = 'wandering';
      const where = (bind && bind.inLair)
        ? (draw.category === 'civilized' ? ' at their dwelling' : ' in their lair (unauthored hex — no den is minted)')
        : ' (wandering)';
      label = head + (n ? n + ' ' : '') + (n === 1 ? mName : mName + (draw.category === 'civilized' ? '' : 's')).replace(/ss$/, 's')
        + where + ' — GM, resolve';
    }
  } else if(draw.category === 'civilized'){
    label = jName + ': civilized encounter — travellers, locals, or a patrol; GM, pick who';
  } else if(prop && prop.source === 'existing-lair'){
    lairId = prop.lairId;
    encounterKind = prop.encounterKind || 'at-lair';
    const mName = (typeof ACKS.monsterDisplayName === 'function' && ACKS.monsterDisplayName(prop.contents.monsterCatalogKey)) || 'unknown creatures';
    if(encounterKind === 'wandering-fragment'){
      // M4 (RAW MM p.15): the lair'd hex's monsters met AWAY from home — a fragment, no hoard,
      // the lair itself not located. Tracking can follow them home (§6.2 — the GM affordance).
      fragmentCount = (prop.fragment && prop.fragment.count) || null;
      label = jName + ': encounter — '
        + (fragmentCount ? fragmentCount + ' ' : 'a band of ') + mName.toLowerCase() + (fragmentCount === 1 ? '' : 's')
        + ' out from an unlocated lair in this hex — GM, resolve (Tracking can follow them home)';
    } else {
      label = jName + ': encounter — ' + mName + ' lair'
        + (prop.contents.totalInhabitantCount ? ' (' + prop.contents.totalInhabitantCount + ' inhabitants)' : '')
        + ' — GM, resolve';
      monsters = prop.contents.groupIds.map(id => ({ groupId: id }));
    }
  } else if(prop && prop.source === 'seeded-shell'){
    // D4→D5: the hex was seeded with undetailed lair shells — the encounter should BE one of them,
    // not a fresh invention. The GM populates a shell (lair detail ✨ / Lair Wizard) and resolves.
    seededShellLairIds = prop.candidates.map(l => l.id);
    label = jName + ': encounter — this hex holds '
      + prop.candidates.length + ' unauthored lair' + (prop.candidates.length === 1 ? '' : 's')
      + ' (seeded) — GM: populate one or resolve generically';
  } else {
    label = jName + ': ' + (draw.rarity ? (draw.rarity + ' ') : '') + 'monster encounter — GM, pick the creature (catalog)';
  }
  // Pre-roll the RAW distance with the SEEDED rng — the commit copies it verbatim. The
  // env hex (computed above) keys the terrain row for unauthored sparse-route steps.
  const rowKey = (envHex && typeof ACKS.encounterRowKeyForHex === 'function') ? ACKS.encounterRowKeyForHex(envHex) : null;
  const sizeCount = ((journey && journey.participantCharacterIds) || []).length || 1;
  const monsterCount = (bind && bind.count) || fragmentCount || (prop && prop.contents && prop.contents.totalInhabitantCount) || null;
  const distance = (rowKey && typeof ACKS.computeEncounterDistance === 'function')
    ? ACKS.computeEncounterDistance({ terrainRow: rowKey, light: 'daylight', sideACount: sizeCount, sideBCount: monsterCount, rng })
    : null;
  const encounterRecord = {
    id: encId, dayIndex, hexId, coord: coord || (hex && hex.coord) || null,
    triggeredBy: 'wandering-roll', encounterTableUsed: draw.columnKey,
    category: draw.category, rarity: draw.rarity || null,
    monsters: monsters, lairId: lairId, rivalJourneyId: null, outcome: 'unresolved', survivorsCarriedOver: [],
    partyCasualtiesSummary: null, treasureGained: null, resolvedByEventId: null,
    // The compacted draw + distance the commit materializes the entity from (plan §15.2).
    // E4: identityRoll + binding ride verbatim — the commit applies the RECORDED verdict
    // (no re-roll), so the materialized entity matches the reviewed preview byte-for-byte.
    draw: { hexId: draw.hexId, territoryClass: draw.territoryClass, columnKey: draw.columnKey,
            category: draw.category, rarity: draw.rarity, identity: draw.identity,
            identityRoll: ir, binding: bind,
            proposal: prop ? { source: prop.source, lairId: prop.lairId || null,
                               encounterKind: prop.encounterKind || null, fragment: prop.fragment || null,
                               contents: prop.contents || null,
                               candidateLairIds: prop.candidates ? prop.candidates.map(l => l.id) : null } : null },
    distance: distance
  };
  const notableEvent = {
    kind: 'journey-encounter', type: 'encounter', pauseTrigger: 'encounter', primaryHexId: hexId,
    label: label,
    payload: { journeyId: journey && journey.id, dayIndex, hexId, encounterId: encId,
               category: draw.category, rarity: draw.rarity || null,
               identityLabel: ir ? ir.label : null, monsterKey: ir ? (ir.key || null) : null,
               bindingMode: bind ? bind.mode : null,
               lairId: lairId, seededShellLairIds: seededShellLairIds, encounterKind: encounterKind, fragmentCount: fragmentCount }
  };
  return { encounterRecord, notableEvent };
}

// Voyages V4 — the maritime mirror of rollEncounter: build {encounterRecord, notableEvent} from a
// SEA draw (ACKS.seaEncounterDraw). A meeting (monster/civilized) → an Encounter entity record (the
// commit materializes it via createEncounterFromDraw, which reads draw.atSea/seaZone/evasion + uses
// the sea distance); a NAUTICAL result → a GM-resolve notable, no entity (the sea terrain-encounter,
// the land dangerous/valuable/unique precedent); no-encounter → null. The draw is seeded (preview
// byte-stable); the id is minted collision-proof; nothing is materialized until commit.
function _seaEncounterRecord(campaign, journey, draw, opts){
  opts = opts || {};
  if(!draw || draw.category === 'no-encounter') return null;
  const rng = opts.rng || Math.random;
  const jName = (journey && journey.name) || 'Voyage';
  const hexId = opts.hexId || null;
  if(draw.category === 'nautical'){
    const n = draw.nautical || {};
    return { encounterRecord: null, notableEvent: {
      kind: 'journey-encounter', type: 'sea-nautical', pauseTrigger: 'encounter', primaryHexId: hexId,
      label: jName + ': nautical encounter — ' + (n.name || 'something at sea') + (n.effect ? (' — ' + n.effect) : '') + ' (GM resolves)' + (n.persistent ? ' — mark it on the map' : ''),
      payload: { journeyId: journey && journey.id, dayIndex: opts.dayIndex, hexId, encounterId: null,
                 category: 'nautical', nauticalType: n.type || null, nauticalName: n.name || null, persistent: !!n.persistent }
    } };
  }
  const encId = _mintEncounterProposalId(campaign, rng, opts.takenIds);
  const ir = draw.identityRoll || null, bind = draw.binding || null;
  const mName = (ir && ir.key && typeof ACKS.monsterDisplayName === 'function' && ACKS.monsterDisplayName(ir.key)) || (ir && ir.label) || 'creatures';
  const n = bind && bind.count;
  const evadeNote = (draw.evasion && draw.evasion.canEvade) ? ' (vessels can try to evade)' : (draw.category === 'monster' ? ' (vessels cannot evade a sea creature)' : '');
  let label;
  if(draw.category === 'civilized'){
    label = jName + ': sea encounter — ' + mName + evadeNote + ' — GM, resolve';
  } else if(bind && bind.mode === 'fresh-lair'){
    label = jName + ': sea encounter — ' + mName + ' at their lair here (islet/reef/wreck/underwater)' + (n ? ' (' + n + ')' : '') + ' — GM, resolve';
  } else {
    label = jName + ': sea encounter — ' + (n ? n + ' ' : '') + mName.toLowerCase() + (n === 1 ? '' : 's') + ' at sea' + evadeNote + ' — GM, resolve';
  }
  const encounterRecord = {
    id: encId, dayIndex: opts.dayIndex, hexId, coord: opts.coord || null,
    triggeredBy: 'sea-wandering-roll', encounterTableUsed: draw.columnKey,
    category: draw.category, rarity: draw.rarity || null,
    monsters: [], lairId: (bind && bind.lairId) || null, rivalJourneyId: null, outcome: 'unresolved', survivorsCarriedOver: [],
    partyCasualtiesSummary: null, treasureGained: null, resolvedByEventId: null,
    // The whole sea draw rides verbatim (seeded — byte-stable); the commit's createEncounterFromDraw
    // reads draw.atSea/seaZone/evasion + the identity/binding and uses draw.distance (the sea distance).
    draw: draw,
    distance: draw.distance || null
  };
  const notableEvent = {
    kind: 'journey-encounter', type: 'sea-encounter', pauseTrigger: 'encounter', primaryHexId: hexId,
    label: label,
    payload: { journeyId: journey && journey.id, dayIndex: opts.dayIndex, hexId, encounterId: encId,
               category: draw.category, rarity: draw.rarity || null, atSea: true, seaZone: draw.seaZone || null,
               identityLabel: ir ? ir.label : null, monsterKey: ir ? (ir.key || null) : null,
               bindingMode: bind ? bind.mode : null }
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
  // a settlement guarantees water (🔧). T6 single-home — read the canonical campaign.settlements[];
  // the embedded hex.settlement is a back-compat bridge for un-lifted inputs (dead post-strip), the
  // sibling of voyageHexIsFreshFood.
  if(hex.settlement) return true;
  if(global.ACKS && global.ACKS.settlementForHex && global.ACKS.settlementForHex(campaign, hex.id)) return true;
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
// state, simulates on clones, returns the post-state absolutes commit replays. MOVER-AGNOSTIC (CoL-1,
// Architecture §3.13): it operates on an explicit member set + share context (args), so BOTH the journey
// tick and the off-journey 'survival' day-consumer reuse the EXACT same resolution — one resolution per
// character per day. journeyDaySurvival (below) is the thin journey adapter; the survival consumer is the
// other caller. Food/water sources, the forage-water throw, the share-rations pooling (camp-first,
// leader-priority), and the §1.2/§1.3 deficit ladders + CON loss all live here.
//   args = { members:[char], hex, share, camp, leaderId, poolRations, poolWater, forageWater,
//            notable:{ kind, prefix, primaryHexId, payload, transient } }
function resolveDaySurvival(campaign, args, opts){
  const A = _jACKS();
  opts = opts || {};
  args = args || {};
  const rng = opts.rng || Math.random;
  const FOOD_ST = A.RATION_FOOD_ST_PER_DAY || 1 / 6;
  const out = { ignored: false, waterSourced: false, waterForage: null, members: {}, inventoryUpdates: {}, campItems: null, campWater: null, notableEvents: [], anyHungry: false, anyThirsty: false, anyCritical: false };
  if(A.isHouseRuleEnabled(campaign, 'ignore-rations')){ out.ignored = true; return out; }

  const members = (args.members || []).filter(Boolean);
  if(!members.length) return out;
  const hex = args.hex;

  const share = !!args.share;
  const camp = args.camp || null;
  // Leader-first ordering (decision #8, 🔧): the party leader, then the others in a stable order.
  const leaderId = args.leaderId || null;
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
  let poolRations = Number(args.poolRations) || 0;
  let poolWater = Number(args.poolWater) || 0;
  const hasOwnRation = inv => (inv || []).some(x => A.isRationLine(x) && (Number(x.daysRemaining) || 0) >= 1);

  // ── §4.1 WATER — free source → forage → drink (own → shared camp/others → shared pool), leader-first ──
  // forageNoSource (rerollJourneyForage): the day being re-rolled DID forage, so force the no-source forage
  // path regardless of how this hex resolves now. A reroll re-resolves day.hexId, which on an arrival day or
  // an unauthored day-start can land on a watered hex (the arrival hex / the last authored hex) where the
  // original tick had foraged on a sourceless environment — without this the throw would silently vanish.
  const forceForage = !!opts.forageNoSource;
  if(!forceForage && (args.freeWater || hasFreshSource(campaign, hex))){   // args.freeWater: settled regime (CoL-1 §16.1) — water tops up even with no mapped source
    out.waterSourced = true;
    for(const c of members){ const m = M[c.id]; m.water = m.waterCap; m.fedWater = true; }   // free top-up to capacity
  } else {
    let foraged = false;
    if(args.forageWater){
      // one party Foraging throw (14+, 18+ barrens/desert; +4 if any member has Survival proficiency).
      // forageTarget pins the original throw's target so a reroll re-rolls the same throw, only the die.
      const dry = (hex && (hex.terrain === 'barrens' || hex.terrain === 'desert'));
      const target = (typeof opts.forageTarget === 'number') ? opts.forageTarget : (dry ? 18 : 14);
      const hasSurvival = members.some(c => (c.proficiencies || []).some(p => /survival/i.test(typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || '')));   // PT-0: read the {key} slug too
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
    if(args.freeFood){ m.fedFood = true; continue; }                                            // settled regime (CoL-1 §16.1) — food abstracted into cost of living
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
  const _n = args.notable || {};
  const nKind = _n.kind || 'journey-day-tick';
  const nm = _n.prefix || 'Journey';
  const nHex = _n.primaryHexId || null;
  const nPay = _n.payload || {};
  const nTrans = !!_n.transient;
  const _push = (type, label) => out.notableEvents.push({ kind: nKind, type: type, pauseTrigger: 'supplies-low', transient: nTrans, primaryHexId: nHex, label: label, payload: nPay });
  if(out.anyHungry) _push('hunger', nm + ': a traveller is going hungry (no food)');
  if(out.anyThirsty) _push('dehydration', nm + ': a traveller is dehydrated (no water)');
  if(out.anyCritical) _push('survival-critical', nm + ': a traveller is at death’s door (CON 0) — GM, resolve');
  // legacy party stores running low (only when nobody's actually going hungry yet)
  const lowAt = members.length * (A.JOURNEY_SUPPLY_LOW_DAYS || 3);
  if(!out.anyHungry && out.newRations > 0 && out.newRations < lowAt) _push('supplies-low', nm + ': party stores low (' + out.newRations + ' rations left)');
  return out;
}

// Thin journey adapter (CoL-1): builds the member set + share/camp/pool context from the journey and
// delegates to resolveDaySurvival. Identical inputs → identical output, so the journey path is byte-for-
// byte unchanged. (Off-journey party sharing rides on party.shareProvisions via the 'survival' consumer;
// the journey keeps its own shareRations flag — the GM's per-journey override.)
function journeyDaySurvival(campaign, journey, hex, opts){
  const A = _jACKS();
  const ids = (journey.participantCharacterIds || []).filter(Boolean);
  const members = ids.map(id => (campaign.characters || []).find(c => c && c.id === id)).filter(Boolean);
  const party = journey.partyId ? (campaign.parties || []).find(p => p && p.id === journey.partyId) : null;
  const camp = (party && typeof A.partyCampStash === 'function') ? A.partyCampStash(campaign, party.id) : null;
  const leaderId = party ? (party.leaderCharacterId || (Array.isArray(party.memberCharacterIds) && party.memberCharacterIds[0]) || null) : null;
  // CoL-1 lifestyle exemption (Joachim 2026-06-06): a day travelled through a hex that shelters the party
  // — a settlement, a complete stronghold, or a domain ruled (own / vassal chain) by ANY traveller —
  // consumes no rations or water (they live off the lifestyle). Out of such a hex, the field day resolves
  // as normal. groupProvisioningRegime reads the whole member set, so a ruler carries his companions.
  const onLifestyle = (typeof A.groupProvisioningRegime === 'function')
    && A.groupProvisioningRegime(campaign, members, hex) === 'settled';
  return resolveDaySurvival(campaign, {
    members: members, hex: hex, share: !!journey.shareRations, camp: camp, leaderId: leaderId,
    freeFood: onLifestyle, freeWater: onLifestyle,
    poolRations: (journey.supplies && Number(journey.supplies.rations)) || 0,
    poolWater: (journey.supplies && Number(journey.supplies.waterRations)) || 0,
    forageWater: !!journey.forageWaterEnabled,
    notable: { kind: 'journey-day-tick', prefix: (journey.name || 'Journey'), primaryHexId: journey.startHexId || null, payload: { journeyId: journey.id } }
  }, opts);
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
// Apply the recorded survival absolutes to the campaign. MOVER-AGNOSTIC (CoL-1): sets each member's water
// + deficit counters + condition flags + CON loss, rewrites changed inventories, and (when a partyId is
// given) updates that party's camp stash rations/water. Both the journey commit and the 'survival'
// consumer commit call this.
function applyDaySurvival(campaign, survival, partyId){
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
  if((survival.campItems != null || survival.campWater != null) && partyId){
    const party = (campaign.parties || []).find(p => p && p.id === partyId);
    const camp = (party && global.ACKS && global.ACKS.partyCampStash) ? global.ACKS.partyCampStash(campaign, party.id) : null;
    if(camp){
      if(survival.campItems != null) camp.items = survival.campItems;
      if(survival.campWater != null) camp.waterDaysCarried = survival.campWater;
    }
  }
}
function applyJourneyDaySurvival(campaign, journey, survival){
  applyDaySurvival(campaign, survival, journey && journey.partyId);
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
// W4 — does an OPPOSING army stand on the hex the marching army is entering? Reads
// each army's EFFECTIVE day position: a same-day proposed move (the ctx._armyDay
// stash, journey-order earlier movers) wins over the committed currentHexId.
function _armyContactBlocker(campaign, marchingArmy, hexId, ctx){
  const A = _jACKS();
  if(!campaign || !marchingArmy || !hexId) return null;
  for(const ar of (campaign.armies || [])){
    if(!ar || ar.id === marchingArmy.id) continue;
    const stashed = ctx && ctx._armyDay && ctx._armyDay.moves[ar.id];
    const effHexId = stashed ? stashed.endHexId : ar.currentHexId;
    if(effHexId !== hexId) continue;
    if(typeof A.armyTroopCount === 'function' && A.armyTroopCount(campaign, ar) <= 0) continue;
    if(typeof A.armiesOpposed === 'function' && !A.armiesOpposed(campaign, marchingArmy, ar)) continue;
    return ar;
  }
  return null;
}

function journeyBaseSpeedMilesPerDay(campaign, journey){
  const A = _jACKS();
  // W4 — an army's march: the army governs the base rate (slowest unit × the
  // large-army multiplier × the war-machine cap, RR pp.448–449). The §26 GM
  // override still wins in tickJourneyDay (the escape hatch outranks everything).
  if(journey && journey.armyId && typeof A.findArmy === 'function' && typeof A.armyExpeditionSpeedMilesPerDay === 'function'){
    const army = A.findArmy(campaign, journey.armyId);
    if(army) return A.armyExpeditionSpeedMilesPerDay(campaign, army);
  }
  // A single unit rallying to a muster point (journey.unitId): the unit's own troop-type pace.
  if(journey && journey.unitId && typeof A.findUnit === 'function' && typeof A.unitMarchMilesPerDay === 'function'){
    const unit = A.findUnit(campaign, journey.unitId);
    if(unit) return A.unitMarchMilesPerDay(unit);
  }
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
  // W4 — an ARMY's march (journey.armyId): the army governs speed (slowest unit ×
  // large-army × war machines), the ARMY weather table applies (RR p.449), and the
  // party-grain machinery stands down — no navigation throw (armies campaign on
  // mapped regions behind scouting screens 🔧), no per-hex encounter draws (the
  // slot-88 military consumer owns army-scale contact), no character survival
  // (army supply is W5), no party fatigue streak (the 3-of-7 rest rule on the army).
  const _marchArmy = (journey.armyId && typeof A.findArmy === 'function') ? A.findArmy(campaign, journey.armyId) : null;
  const isArmy = !!_marchArmy;
  // A single unit rallying to a muster point (journey.unitId) stands the party-grain
  // machinery down the SAME way an army's march does (no navigation throw / no per-hex
  // encounter draws / no character survival / no party fatigue; the column weather table;
  // hold at an unbridged river) — but it is NOT an army, so the army-scale CONTACT +
  // ctx._armyDay machinery (gated on isArmy) stays off. `standDown` is the shared gate;
  // the substitution is value-identical for armies and parties (zero regression).
  const isUnit = !!(journey.unitId);
  const standDown = isArmy || isUnit;
  // Voyages V2 — a journey riding a Vessel (shipId). The SEA speed model (vessel voyage speed ×
  // wind strength × point of sail × pace, oar-vs-sail, the 24h doubling — A.voyageDayMiles)
  // REPLACES the land base × weather × temperature below; and the party-grain LAND machinery
  // stands down for v2: no getting-lost throw (sea navigation is V3), no ration survival (ship
  // stores / scurvy / fishing are V3), no per-hex wandering encounter (sea encounters are V4),
  // no party fatigue (crewing is unstrenuous, RR p.318). Per-hex movement still runs — water hexes
  // pace at ×1 (water is absent from JOURNEY_TERRAIN_SPEED), so the budget governs hexes covered.
  // A voyage is never an army/unit march (those are standDown), so the gates are independent.
  const _voyageVessel = (!standDown && journey.shipId && typeof A.vesselForJourney === 'function')
    ? A.vesselForJourney(campaign, journey) : null;
  const isVoyage = !!_voyageVessel;
  const dist = computeJourneyDistance(campaign, journey);
  const startHex = dist.startHex;
  const newDayIndex = (journey.currentDayIndex || 0) + 1;
  // EFFECTIVE pace = the GM's pace capped by what the travellers' other activities leave room for
  // (Joachim 2026-06-05). An administering ruler caps the party at half speed; a fully-booked one at
  // 'halted' (×0 — no progress that day). campaign.domains is attached by the day-tick pipeline, so
  // the domain-admin gate resolves. Falls back to the stored pace if the helper isn't present.
  const pace = (typeof A.journeyEffectivePace === 'function') ? A.journeyEffectivePace(campaign, journey) : (journey.pace || 'normal');
  const halted = (pace === 'halted');   // the day's activities (or the GM) leave no room to travel → 0 hexes, no nav/ford
  // Weather HW-2 (team agent-2): the slot-1 weather day-consumer hands the day's per-region
  // weather to downstream consumers via ctx.weatherByRegion (keyed by the 24-mile region key).
  // Prefer THIS journey's own region (multi-region-day correctness), fall back to the single
  // ctx.weather (the common single-region case), then the gm-fiat default. Defensive: works
  // with the weather module absent (falls straight to ctx.weather).
  const weather = (function(){
    const byR = ctx.weatherByRegion;
    if(byR && typeof A.journeyRegionKey === 'function'){
      const k = A.journeyRegionKey(campaign, journey);
      if(k && byR[k] && byR[k].condition) return byR[k];
    }
    return (ctx.weather && ctx.weather.condition) ? ctx.weather : { condition: 'fair', temperature: 'moderate', rolledOrSet: 'gm-fiat' };
  })();

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
  // Armies read the RR p.449 severe-weather table (rain/snow ×½, storm ×¼ — a column
  // suffers where a party shrugs); parties keep the J2 RAW readings.
  const weatherMult = standDown
    ? A.armyWeatherSpeedMult(weather.condition, null)
    : ((A.JOURNEY_WEATHER_SPEED[weather.condition] != null) ? A.JOURNEY_WEATHER_SPEED[weather.condition] : 1);
  const tempMult = standDown
    ? A.armyWeatherSpeedMult(null, weather.temperature)
    : ((A.JOURNEY_TEMPERATURE_SPEED[weather.temperature] != null) ? A.JOURNEY_TEMPERATURE_SPEED[weather.temperature] : 1);
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

  // ── fatigue (§10 / JJ p.84): a 6-day strenuous streak forces a rest day. Armies
  // run the RR p.448 3-of-7 rule instead (armyFatigued, derived from marchedOrds —
  // surfaced, never auto-rested: the GM rests the column). ──
  const simplifiedFatigue = A.isHouseRuleEnabled(campaign, 'simplified-fatigue');
  const strenuousPace = (pace === 'normal' || pace === 'forced-march');
  const restDay = (!simplifiedFatigue && !standDown && !isVoyage && strenuousPace && fatigueDays >= A.JOURNEY_FATIGUE_CYCLE_DAYS);

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

  // ── Voyages V2 (RR pp.318–322): for a journey riding a Vessel, the SEA speed model replaces the
  // land base × weather × temperature × pace milesBudget computed above. The vessel's travel heading
  // is derived from the route (current hex → the next route step, else → the destination), so the
  // point of sail reads heading vs the day's wind direction (HW-3 / ctx.weather). voyageDayMiles
  // resolves wind strength × point of sail (sail) / wind-oar, the oar-vs-sail pick, crew/damage
  // reduction, pace, and the 24h doubling. The §26 override still flows through (as a base rate). ──
  let voyageInfo = null;
  let _voyageSeaZone = null;   // V3a — the hex's sea zone (lake/river/coast/open-sea); drives the weathering ½ + the sea-nav target
  let _voyProvision = null;    // V3c — the day's ship-stores provisioning result (null = not a voyage / untracked / ignore-rations)
  let _riverCurrent = null;    // V5 — the day's river current modifier (null = not a river / no current set); a flat ± mi/day
  if(isVoyage){
    const _fromC = (curStep && curStep.coord) ? curStep.coord : curCoord;
    let _toC = (nextStep && nextStep.coord) ? nextStep.coord : null;
    if(!_toC && journey.destinationHexId && typeof A.findHex === 'function'){
      const _dh = A.findHex(campaign, journey.destinationHexId);
      if(_dh && _dh.coord) _toC = _dh.coord;
    }
    const _headingDeg = (_toC && typeof A.vesselBearingDeg === 'function') ? A.vesselBearingDeg(_fromC, _toC) : null;
    // The day's sea zone = the hex being ENTERED (nextHex, falling back to the current hex). V3a:
    // the GM-set hex.seaZone (default 'coast') keys the weathering speed effect + the sea-nav target.
    _voyageSeaZone = (typeof A.seaZoneForHex === 'function') ? A.seaZoneForHex(nextHex || curHex) : 'coast';
    voyageInfo = A.voyageDayMiles(campaign, journey, _voyageVessel, { weather, pace, overrideMiles, headingDeg: _headingDeg, seaZone: _voyageSeaZone });
    milesBudget = voyageInfo.miles;
    // V3c — ship-stores provisioning (RR p.321): the crew eats 1 store/day; the deprivation ENTERING the
    // day governs TODAY's speed (underfed ½ / starving ⅓). Opt-in (the GM provisioned the vessel — shipStores
    // tracked) + gated by the shipped `ignore-rations` opt-out. The day's consumption / deficit / scurvy-counter
    // absolutes are recorded into record.voyageState below (commit applies; a reroll reverts). The hex being
    // ENTERED decides fresh-food/port (cures scurvy + clears the deficit — RR p.321). A grounded crew still eats.
    if(!A.isHouseRuleEnabled(campaign, 'ignore-rations') && typeof A.computeShipProvisionDay === 'function'){
      _voyProvision = A.computeShipProvisionDay(campaign, _voyageVessel, { hex: nextHex || curHex });
      if(_voyProvision.tracked && _voyProvision.deprivation.speedMult !== 1) milesBudget *= _voyProvision.deprivation.speedMult;
    }
    // V5 — river current (RR p.331): a flat ± mi/day applied AFTER the wind model + crew deprivation
    // (the river carries the hull regardless of wind/crew — downriver adds, upriver fights). Gated on
    // a river zone + a GM-set journey.riverCurrent, and NOT under a §26 override (the override is an
    // exact GM rate). Opt-in by data — a river voyage with no current set is byte-unchanged.
    if(_voyageSeaZone === 'river' && voyageInfo.propulsion !== 'override' && typeof A.riverCurrentModifierMi === 'function'){
      _riverCurrent = A.riverCurrentModifierMi(journey);
      if(_riverCurrent && _riverCurrent.mi) milesBudget = Math.max(0, milesBudget + _riverCurrent.mi);
    }
  }

  // ── navigation (§7 / RR p.275; V3a sea nav RR p.320): one Navigation throw per travel day. LAND:
  // skipped only when NOT lost and following a road/trail (those routes are safe); a LOST party always
  // throws — its chance to re-orient. +4 for Navigation OR Pathfinding, +8 for both; nat-1 always fails.
  // VOYAGE (V3a): the SAME machinery with SEA targets (Lake/River 4+ / Coast 7+ / Open Sea 11+ — the
  // GM-set hex.seaZone), the navigator/master-mariner-gated +4/+8 (seaNavBonus), and the fog −4 / rain −2
  // weathering penalty; lake/river is "safe water" (you follow the bank — the sea analog of a road) and is
  // skipped when not lost, coast/open-sea always throw. A lost VESSEL strays exactly like a lost party
  // (RR p.320 — being lost at sea is treated as being lost in the wilderness), so the §27 stray machinery
  // below runs unchanged. E5 — a party FOLLOWING TRACKS makes no Navigation throw (land only). Secret throw. ──
  const followingTrail = !!((typeof A.journeyTrackingPursuit === 'function') && A.journeyTrackingPursuit(campaign, journey.id));
  let navRecord = null;
  let strayHeading = (typeof journey.strayHeading === 'number') ? journey.strayHeading : null;
  const wasLost = isLost;
  const _voyOnSafeWater = isVoyage && (_voyageSeaZone === 'lake' || _voyageSeaZone === 'river');
  // ── Voyages V3b (RR pp.319–320): a GROUNDED/ENTANGLED vessel (vessel.grounded set by a prior day's
  // failed hazard) makes no way until it is refloated/cut free — it HOLDS this day (a pause for the GM
  // to clear vessel.grounded). And on a GALE day at sea (V2's voyageInfo.gale, not on safe inland water,
  // not under a §26 override), a Seafaring "ride out the gale" throw decides whether the hull takes 2d8/hr
  // damage. Both ROLL here (pure) and ride record.voyageState → commit applies → reroll reverts. ──
  const _voyageStuck = isVoyage && !!_voyageVessel.grounded;
  let _galeResult = null;
  if(isVoyage && !_voyageStuck && voyageInfo && voyageInfo.gale && !_voyOnSafeWater && voyageInfo.propulsion !== 'override' && typeof A.rollVoyageGale === 'function'){
    _galeResult = A.rollVoyageGale(campaign, _voyageVessel, { atHalfSpeed: (pace === 'half-speed' || pace === 'halted'), rng });
  }
  const _navActive = !restDay && !halted && !_voyageStuck && !standDown && dist.remaining > 0 && (
    isVoyage ? (isLost || !_voyOnSafeWater)
             : (isLost || (!onRoadOrTrail && !followingTrail))
  );
  if(_navActive){
    // Throw against where the party/vessel IS when lost (the strayed anchor), else the hex it's entering.
    let navTarget, bonus, navTerrain, navWeatherLabel = null;
    if(isVoyage){
      const zone = isLost ? ((typeof A.seaZoneForHex === 'function') ? A.seaZoneForHex(curHex) : 'coast') : _voyageSeaZone;
      const fx = (typeof A.voyageWeatherEffects === 'function') ? A.voyageWeatherEffects(weather.condition, zone) : { navTargetPenalty: 0, label: null };
      navTarget = ((A.SEA_NAV_THROWS && A.SEA_NAV_THROWS[zone] != null) ? A.SEA_NAV_THROWS[zone] : 7) + (fx.navTargetPenalty || 0);
      bonus = (typeof A.seaNavBonus === 'function') ? A.seaNavBonus(campaign, journey, _voyageVessel) : 0;
      navTerrain = 'the ' + String(zone).replace('-', ' ');   // "the coast" / "the open sea" / "the lake"
      navWeatherLabel = fx.label;
    } else {
      navTerrain = isLost ? ((curHex && curHex.terrain) || baseTerrain) : (nextHex.terrain || baseTerrain);
      navTarget = (A.JOURNEY_NAV_THROWS[navTerrain] != null) ? A.JOURNEY_NAV_THROWS[navTerrain] : 6;
      bonus = _journeyNavBonus(campaign, journey);
    }
    const nav = rollNavigation(navTarget, bonus, rng);
    const bonusRec = bonus ? [{ source: isVoyage ? 'crew-navigation' : 'party-proficiency', value: bonus }] : [];
    if(nav.success && wasLost){
      // Recovered (RR p.275 / p.320): the party/crew realizes it strayed and resumes toward its
      // destination. The route is already anchored at its strayed position (re-anchored each lost day),
      // so clearing isLost lets the normal route walk below resume dest-ward from here.
      isLost = false; strayHeading = null;
      navRecord = { rolled: nav.rolled, target: nav.target, bonuses: bonusRec, result: 'success-recovered', naturalOne: nav.naturalOne };
      notableEvents.push({
        kind: 'journey-day-tick', type: 'navigation-recovered', primaryHexId: journey.currentHexId || journey.startHexId || null,
        label: (journey.name || (isVoyage ? 'Voyage' : 'Journey')) + ': ' + (isVoyage ? 'regained its bearings' : 'found the way again') + ' (nav ' + nav.rolled + (bonus ? ('+' + bonus) : '') + ' vs ' + navTarget + '+)',
        payload: { journeyId: journey.id, dayIndex: newDayIndex }
      });
    } else if(!nav.success){
      // Lost / off course (RR p.275 / p.320). Crucially the party/crew does NOT realize it — it strays
      // toward a random hex face (1d6) and keeps moving, unaware, until a later successful throw. A heading
      // already set persists ("blithely continues on"); a freshly-lost one rolls. The pause is GM-facing
      // — the Judge made the secret throw, so the fiction stays "they don't know."
      isLost = true;
      if(strayHeading == null) strayHeading = Math.floor(rng() * 6);
      navRecord = { rolled: nav.rolled, target: nav.target, bonuses: bonusRec, result: 'fail-unknown-lost', naturalOne: nav.naturalOne, strayHeading: strayHeading };
      notableEvents.push({
        kind: 'journey-lost', type: 'navigation-fail', pauseTrigger: 'navigation-fail', primaryHexId: journey.currentHexId || journey.startHexId || null,
        label: (journey.name || (isVoyage ? 'Voyage' : 'Journey')) + ': ' + (isVoyage ? ('drifts off course on ' + navTerrain) : ('lost in ' + navTerrain)) + ' — strays ' + (HEX_FACE_LABELS[strayHeading] || ('face ' + strayHeading)) + ', unaware (nav ' + nav.rolled + (bonus ? ('+' + bonus) : '') + ' vs ' + navTarget + '+' + (nav.naturalOne ? ', natural 1' : '') + (navWeatherLabel ? (', ' + navWeatherLabel) : '') + ')',
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
  let strayPath = null, strayLandingCoord = null, armyContactRecord = null;
  if(!restDay && !halted && !_voyageStuck && isLost && dist.remaining > 0){
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
  } else if(!restDay && !halted && !_voyageStuck && !isLost && dist.remaining > 0 && route.length > 1){
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
      if(standDown && crossing.barrier && crossing.swimmingThrowNeeded){
        // 🔧 W4: a marching column (an army, or a single unit rallying in) cannot swim a
        // river — it HOLDS at the near bank until the GM re-routes via a ford or bridge.
        fordingRecord = { result: 'failed', crossingType: 'army-held', rolled: null, bonus: 0, target: null, fromHexId: fromId, toHexId: toId };
        notableEvents.push({ kind: 'journey-fording', type: 'fording-fail', pauseTrigger: 'fording', primaryHexId: fromId || journey.currentHexId || null, involvedHexIds: [fromId, toId].filter(Boolean),
          label: (journey.name || (isArmy ? 'Army' : 'Column')) + ': held at an unbridged river — troops need a ford or a bridge (re-route, or build one)',
          payload: { journeyId: journey.id, dayIndex: newDayIndex } });
        break; // held at the near bank — no further movement today
      }
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
      // W4 — army contact (RR p.447, step 3c/d): an acting army entering the same
      // 6-mile hex as an opposing army HALTS there. The march record carries the
      // contact; the slot-88 military consumer rolls both contact reconnaissance
      // throws and proposes the battle (paused for the GM).
      if(isArmy && toId){
        const _blocker = _armyContactBlocker(campaign, _marchArmy, toId, ctx);
        if(_blocker){
          armyContactRecord = { opposingArmyId: _blocker.id, opposingArmyName: _blocker.name || 'an opposing army', hexId: toId };
          notableEvents.push({ kind: 'journey-day-tick', type: 'army-contact', pauseTrigger: 'encounter', primaryHexId: toId,
            label: (journey.name || 'Army') + ': marched into ' + (_blocker.name || 'an opposing army') + ' — the armies meet',
            payload: { journeyId: journey.id, armyId: _marchArmy.id, opposingArmyId: _blocker.id, dayIndex: newDayIndex } });
          break; // the march halts at the contact hex (RR p.447 — battle, then movement may continue)
        }
      }
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
  // ── Voyages V3b — nautical hazards (RR p.320) + the day's vessel-state assembly. On entering a
  // GM-flagged hazard hex this day, a Seafaring throw is rolled (post-walk on the day's hexPath, the
  // encounter-check pattern); failure holes the hull (SHP) or grounds/entangles the vessel. The day's
  // SHP loss (hazards + the gale throw above) and any new grounding are accumulated into record.voyageState
  // (absolutes commitJourneyRecord applies + a reroll reverts). A STUCK vessel made no way (gated above) →
  // record the pause. Opt-in by data (hex.nauticalHazard); a non-hazard, non-gale voyage day carries no
  // voyageState. Both nautical hazards and a gale use pauseTrigger 'fording' (the journeys consumer's
  // barrier-class trigger) so the GM is stopped to resolve the damage. ──
  let _voyageState = null, _voyShpDamage = 0, _voyGrounded = isVoyage ? (_voyageVessel.grounded || null) : null;
  const _hazardResults = [];
  if(isVoyage){
    if(_voyageStuck){
      notableEvents.push({ kind: 'journey-day-tick', type: 'voyage-grounded', pauseTrigger: 'fording', primaryHexId: journey.currentHexId || journey.startHexId || null,
        label: (journey.name || 'Voyage') + ': ' + (_voyageVessel.grounded === 'kelp' ? 'entangled in kelp' : _voyageVessel.grounded === 'too-shallow' ? 'grounded in the shallows (too shallow for its draft)' : 'aground on a ' + _voyageVessel.grounded) + ' — making no way until freed (RR p.320)',
        payload: { journeyId: journey.id, dayIndex: newDayIndex } });
    } else {
      const _atHalf = (pace === 'half-speed' || pace === 'halted');
      for(const _ph of hexPath){
        if(!_ph || !_ph.hexId) continue;
        const _hx = (typeof A.findHex === 'function') ? A.findHex(campaign, _ph.hexId) : null;
        // Sea nautical hazard (V3b) — a GM-flagged hex.nauticalHazard (kelp/rock/reef/…).
        const _hz = (typeof A.nauticalHazardForHex === 'function') ? A.nauticalHazardForHex(_hx) : null;
        if(_hz){
          const _hr = A.rollNauticalHazard(campaign, _voyageVessel, _hz, { atHalfSpeed: _atHalf, rng });
          if(_hr){
            _hazardResults.push(_hr);
            if(!_hr.success){
              _voyShpDamage += _hr.shpDamage || 0;
              if(_hr.grounded && !_voyGrounded) _voyGrounded = _hr.grounded;   // first grounding/entangle this day sticks (cleared by the GM)
              notableEvents.push({ kind: 'journey-day-tick', type: 'nautical-hazard', pauseTrigger: 'fording', primaryHexId: _ph.hexId,
                label: (journey.name || 'Voyage') + ': struck ' + _hz.label + (_hr.shpDamage ? (' — ' + _hr.shpDamage + ' hull damage') : '') + (_hr.grounded ? (_hr.grounded === 'kelp' ? ' — entangled' : ' — run aground') : '') + ' (Seafaring ' + _hr.rolled + (_hr.bonus ? ('+' + _hr.bonus) : '') + ' vs ' + _hr.target + '+' + (_hr.naturalOne ? ', natural 1' : '') + ')',
                payload: { journeyId: journey.id, dayIndex: newDayIndex } });
            }
          }
        }
        // V5 — river depth vs draft (RR p.331): on a river hex with a GM-set depth, a hull deeper than
        // the water grounds. IMPASSABLE (< draft) → the vessel can go no further (no throw); SHALLOW
        // (within 2′) → a sandbar/shoal-class Seafaring throw with the shallow-draft +4 SUPPRESSED (the
        // galley's shallow draft is already why the hex reads "within 2′"). A depth grounding rides the
        // same record.voyageState.newGrounded ('too-shallow') + reroll-revert path as a sea hazard.
        const _isRiverHex = (typeof A.seaZoneForHex === 'function') ? (A.seaZoneForHex(_hx) === 'river') : (_voyageSeaZone === 'river');
        if(_isRiverHex && typeof A.riverDepthClearance === 'function'){
          const _dc = A.riverDepthClearance(_voyageVessel, _hx);
          if(_dc.status === 'impassable'){
            if(!_voyGrounded) _voyGrounded = 'too-shallow';
            notableEvents.push({ kind: 'journey-day-tick', type: 'river-too-shallow', pauseTrigger: 'fording', primaryHexId: _ph.hexId,
              label: (journey.name || 'Voyage') + ': the river is too shallow (' + _dc.depthFt + '′ < the ' + _dc.draftFt + '′ draft) — the vessel can go no further (RR p.331)',
              payload: { journeyId: journey.id, dayIndex: newDayIndex } });
          } else if(_dc.status === 'shallow'){
            const _sr = A.rollNauticalHazard(campaign, _voyageVessel, 'sandbar', { atHalfSpeed: _atHalf, suppressShallowBonus: true, rng });
            if(_sr){
              _hazardResults.push(_sr);
              if(!_sr.success){
                _voyShpDamage += _sr.shpDamage || 0;
                if(!_voyGrounded) _voyGrounded = 'too-shallow';
                notableEvents.push({ kind: 'journey-day-tick', type: 'river-shallows', pauseTrigger: 'fording', primaryHexId: _ph.hexId,
                  label: (journey.name || 'Voyage') + ': scraped the shallows (' + _dc.depthFt + '′ over a ' + _dc.draftFt + '′ draft)' + (_sr.shpDamage ? (' — ' + _sr.shpDamage + ' hull damage') : '') + ' — run aground (Seafaring ' + _sr.rolled + (_sr.bonus ? ('+' + _sr.bonus) : '') + ' vs ' + _sr.target + '+' + (_sr.naturalOne ? ', natural 1' : '') + ')',
                  payload: { journeyId: journey.id, dayIndex: newDayIndex } });
              }
            }
          }
        }
      }
    }
    if(_galeResult && !_galeResult.success){
      _voyShpDamage += _galeResult.shpDamage || 0;
      notableEvents.push({ kind: 'journey-day-tick', type: 'gale-damage', pauseTrigger: 'fording', primaryHexId: journey.currentHexId || journey.startHexId || null,
        label: (journey.name || 'Voyage') + ': caught in a gale — ' + _galeResult.shpDamage + ' hull damage over ' + _galeResult.hoursCaught + 'h (Seafaring ' + _galeResult.rolled + (_galeResult.bonus ? ('+' + _galeResult.bonus) : '') + ' vs ' + _galeResult.target + '+)',
        payload: { journeyId: journey.id, dayIndex: newDayIndex } });
    }
    // V3c — ship-stores deprivation / scurvy heads-up notables (the consumption itself rides record.voyageState
    // below). A 'supplies-low' pause (the journeys consumer's barrier-class trigger) stops the GM the day the
    // crew first goes underfed / starving / breaks out in scurvy. Cure-at-port is good news (no pause).
    if(_voyProvision && _voyProvision.tracked){
      const _vHex = journey.currentHexId || journey.startHexId || null;
      if(_voyProvision.becameStarving)
        notableEvents.push({ kind: 'journey-day-tick', type: 'voyage-starvation', pauseTrigger: 'supplies-low', primaryHexId: _vHex,
          label: (journey.name || 'Voyage') + ': the crew is starving (' + _voyProvision.newDeficit + ' days without stores) — ⅓ speed + a morale calamity, mutiny risk (RR p.321)',
          payload: { journeyId: journey.id, dayIndex: newDayIndex } });
      else if(_voyProvision.becameUnderfed)
        notableEvents.push({ kind: 'journey-day-tick', type: 'voyage-underfed', pauseTrigger: 'supplies-low', primaryHexId: _vHex,
          label: (journey.name || 'Voyage') + ': the crew goes underfed (ship stores exhausted) — ½ voyage speed (RR p.321)',
          payload: { journeyId: journey.id, dayIndex: newDayIndex } });
      if(_voyProvision.scurvyOnset)
        notableEvents.push({ kind: 'journey-day-tick', type: 'voyage-scurvy', pauseTrigger: 'supplies-low', primaryHexId: _vHex,
          label: (journey.name || 'Voyage') + ': scurvy breaks out — a month at sea without fresh food (GM applies −1 STR/CON, RR p.321)',
          payload: { journeyId: journey.id, dayIndex: newDayIndex } });
      else if(_voyProvision.scurvyCured)
        notableEvents.push({ kind: 'journey-day-tick', type: 'voyage-scurvy-cured', primaryHexId: _vHex,
          label: (journey.name || 'Voyage') + ': fresh food at port — the scurvy lifts (RR p.321)',
          payload: { journeyId: journey.id, dayIndex: newDayIndex } });
    }
    // Assemble record.voyageState when EITHER the hull changed (V3b) OR ship stores are tracked (V3c —
    // every provisioned voyage day records its consumption/deficit/scurvy absolutes so a reroll reverts).
    const _hasHullChange = (_voyShpDamage > 0 || (_voyGrounded !== (_voyageVessel.grounded || null)));
    const _hasProvision = !!(_voyProvision && _voyProvision.tracked);
    if(_hasHullChange || _hasProvision){
      _voyageState = { vesselId: _voyageVessel.id };
      if(_hasHullChange){
        const _cls = (typeof A.vesselClass === 'function') ? A.vesselClass(_voyageVessel) : null;
        const _curShp = (typeof _voyageVessel.shp === 'number') ? _voyageVessel.shp : (_cls ? _cls.shp : 0);
        const _newShp = Math.max(0, _curShp - _voyShpDamage);
        let _newCondition = _voyageVessel.condition || 'seaworthy';
        if(_newShp <= 0) _newCondition = 'sinking';
        else if(_cls && _newShp < _cls.shp) _newCondition = 'damaged';
        _voyageState.newShp = _newShp; _voyageState.newCondition = _newCondition; _voyageState.newGrounded = _voyGrounded || null;
        _voyageState.shpDamage = _voyShpDamage; _voyageState.hazardEvents = _hazardResults;
        _voyageState.galeEvent = (_galeResult && !_galeResult.success) ? _galeResult : null;
        if(_newShp <= 0){
          notableEvents.push({ kind: 'journey-day-tick', type: 'voyage-sinking', pauseTrigger: 'fording', primaryHexId: journey.currentHexId || journey.startHexId || null,
            label: (journey.name || 'Voyage') + ': the hull is breached (0 SHP) — sinking, GM resolve (RR p.322)',
            payload: { journeyId: journey.id, dayIndex: newDayIndex } });
        }
      }
      if(_hasProvision){
        _voyageState.newShipStores = _voyProvision.newStores;
        _voyageState.newProvisionDeficitDays = _voyProvision.newDeficit;
        _voyageState.newScurvyDays = _voyProvision.newScurvyDays;
        _voyageState.newScurvy = _voyProvision.newScurvy;
      }
    }
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
  const survival = ((ctx && ctx.skipSurvival) || standDown || isVoyage)
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
  // Armies skip the party streak — commitJourneyRecord stamps marchedOrds and the
  // RR p.448 3-of-7 rule derives fatigue from the window (armyFatigued).
  let fatigueAccumulated = 0;
  if(standDown || isVoyage){
    // no party fatigue machinery for a marching column (army or rallying unit) or a voyage
    // (crewing a vessel is unstrenuous — RR p.318; under-crew/rest is a vessel-state concern, V3)
  } else if(restDay){
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

  // ── encounter checks (#476 E1 — RAW: one throw per hex ENTERED, JJ p.41). Each throw runs on
  // ITS hex's territory column; a day spent on roads uses the safer +Road column (§24's dayRoaded
  // — per-hex roadedness isn't retained from the walk, so the day-level flag stands in 🔧); a
  // hex this journey already traversed demotes terrain finds (JJ p.42 step 7). A day that
  // entered no hex (rest / blocked at a river / halted) makes no travel throw — the stationary
  // rest/night checks are the 'encounters' day consumer's (slot 80). ──
  const _encSeen = {};
  const _encTaken = {};   // proposal-id mints shared across the day's hexes (collision-proof)
  // W4 — a marching column (army or rallying unit) draws no per-hex wandering encounters
  // (armies meet the world through the military layer: contact, invasion, the incursion
  // machinery; a single rallying detachment we leave alone for v1) 🔧. Voyages V2 — a sea voyage
  // draws no per-hex LAND wandering encounter either; the sea-encounter tables are V4 (gated on the
  // Monster Catalog's sea entries, the same way the land E-layer was pre-E4).
  for(const _ph of ((standDown || isVoyage) ? [] : hexPath)){
    if(!_ph) continue;
    // An UNauthored hex (hexId null — the sparse-campaign norm) still gets its RAW throw:
    // unsettled territory, no pool, the start-hex environment for distance (§24 fallback).
    const _ekey = _ph.hexId || ('c' + _ph.q + ',' + _ph.r);
    if(_encSeen[_ekey]) continue;
    _encSeen[_ekey] = true;
    const enc = rollEncounter(campaign, journey, { rng, hexId: _ph.hexId || null, coord: { q: _ph.q, r: _ph.r }, hasRoad: dayRoaded, dayIndex: newDayIndex, takenIds: _encTaken });
    if(enc){
      if(enc.encounterRecord) encounters.push(enc.encounterRecord);
      notableEvents.push(enc.notableEvent);
    }
  }
  // Voyages V4 — the maritime E-layer (JJ pp.71–78). A sea voyage was stood down from the LAND
  // encounter loop above; here it makes the SEA encounter throw instead — once per 24-mile region
  // crossed (every ~4th 6-mile hex 🔧), or once per 6-mile hex on a trade route (the JJ p.71 Sea
  // Encounter Throw Frequency for sailing). 24-hour open-sea sailing uses the night column (more
  // dangerous). A meeting (monster/civilized) rides `encounters` → the commit materializes the
  // Encounter entity exactly as the land path does; a nautical result is a GM-resolve notable.
  if(isVoyage && !standDown && !restDay && hexPath.length && typeof ACKS.seaEncounterDraw === 'function'){
    const _seaTrade = !!journey.tradeRoute;
    const _seaNight = !!(voyageInfo && voyageInfo.continuousSailing);
    const _seaCond = (voyageInfo && voyageInfo.weathering) ? String(voyageInfo.weathering).toLowerCase() : 'clear';
    const _seaPartySide = { partyId: (journey && journey.partyId) || null, characterIds: ((journey && journey.participantCharacterIds) || []).slice() };
    let _seaHex = 0;
    for(const _ph of hexPath){
      if(!_ph) continue;
      _seaHex++;
      if(!_seaTrade && (_seaHex % 4 !== 1)) continue;   // per 24-mile region (every 4th 6-mile hex); trade route = every hex
      const _sdraw = ACKS.seaEncounterDraw(campaign, _ph.hexId || null, {
        seaZone: _voyageSeaZone, tradeRoute: _seaTrade, night: _seaNight, weatherCondition: _seaCond,
        rng, partySide: _seaPartySide
      });
      const _srec = _seaEncounterRecord(campaign, journey, _sdraw, { hexId: _ph.hexId || null, coord: { q: _ph.q, r: _ph.r }, dayIndex: newDayIndex, rng, takenIds: _encTaken });
      if(_srec){ if(_srec.encounterRecord) encounters.push(_srec.encounterRecord); notableEvents.push(_srec.notableEvent); }
    }
  }

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

  // W4 — stash the army's proposed day-end position + contact on the shared day ctx
  // (the E6-interlock pattern), so the slot-88 military consumer — same day, later
  // slot — evaluates POST-march positions instead of yesterday's.
  if(isArmy && ctx._armyDay){
    ctx._armyDay.moves[journey.armyId] = { journeyId: journey.id, endHexId: newCurrentHexId || null, hexPath: hexPath.slice(), pace: restDay ? 'rest' : pace, arrived: willArrive };
    if(armyContactRecord) ctx._armyDay.contacts.push(Object.assign({ armyId: journey.armyId }, armyContactRecord));
  }

  // ── the review-surface summary label (every day; routine travel emits NO event) ──
  let summaryLabel;
  if(willArrive)            summaryLabel = (journey.name || 'Journey') + ': arrived (day ' + newDayIndex + ')';
  else if(restDay)          summaryLabel = (journey.name || 'Journey') + ': forced rest (day ' + newDayIndex + ')';
  else if(fordingRecord && fordingRecord.result === 'failed')
                            summaryLabel = (journey.name || 'Journey') + ': ' + (hexesToday > 0 ? ('+' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ', then ') : '') + 'blocked at a river (day ' + newDayIndex + ')';
  else if(armyContactRecord)
                            summaryLabel = (journey.name || 'Journey') + ': +' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ', then met ' + (armyContactRecord.opposingArmyName || 'an opposing army') + ' (day ' + newDayIndex + ')';
  else if(_voyageStuck)     summaryLabel = (journey.name || 'Voyage') + ': ' + (_voyageVessel.grounded === 'kelp' ? 'entangled in kelp' : _voyageVessel.grounded === 'too-shallow' ? 'grounded in the shallows (too shallow for its draft)' : 'aground on a ' + _voyageVessel.grounded) + ' — making no way (day ' + newDayIndex + ')';
  else if(isLost)           summaryLabel = (journey.name || 'Journey') + ': lost — strayed ' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ' ' + (HEX_FACE_LABELS[strayHeading] || '') + ', unaware (day ' + newDayIndex + ')';
  else if(isVoyage)         summaryLabel = (journey.name || 'Voyage') + ': +' + hexesToday + ' hex' + (hexesToday === 1 ? '' : 'es') + ' (' + milesToday + ' mi' + (voyageInfo ? (' under ' + (voyageInfo.propulsion === 'oar' ? 'oar' : voyageInfo.propulsion === 'override' ? 'a set rate' : 'sail') + (voyageInfo.continuousSailing ? ', sailing through the night' : '') + (voyageInfo.gale && voyageInfo.propulsion !== 'override' ? ' (gale)' : '') + (voyageInfo.weathering ? (' · ' + voyageInfo.weathering) : '')) : '') + (isLost ? ', off course' : '') + (_voyShpDamage > 0 ? (' · ' + _voyShpDamage + ' hull damage') : '') + (_voyGrounded && _voyGrounded !== (isVoyage && _voyageVessel.grounded || null) ? (' · ' + (_voyGrounded === 'kelp' ? 'entangled' : 'run aground') ) : '') + (_voyProvision && _voyProvision.tracked && _voyProvision.deprivation.speedMult !== 1 ? (' · ' + _voyProvision.deprivation.level) : '') + '), day ' + newDayIndex;

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
    voyage: voyageInfo ? {                                   // Voyages V2/V3a — the day's sailing/rowing breakdown (null on a land day)
      propulsion: voyageInfo.propulsion, windLabel: voyageInfo.windLabel, windDirectionLabel: voyageInfo.windDirectionLabel,
      pointOfSail: voyageInfo.pointOfSail, pointOfSailLabel: voyageInfo.pointOfSailLabel, masterMariner: voyageInfo.masterMariner,
      continuousSailing: voyageInfo.continuousSailing, gale: voyageInfo.gale, crewDamageFactor: voyageInfo.crewDamageFactor,
      sailMiles: voyageInfo.sailMiles, oarMiles: voyageInfo.oarMiles,
      seaZone: _voyageSeaZone,                               // V3a — the day's sea zone (lake/river/coast/open-sea)
      riverCurrent: (_riverCurrent && _riverCurrent.mi) ? { mi: _riverCurrent.mi, speed: _riverCurrent.speed, heading: _riverCurrent.heading } : null,  // V5 — the day's river current modifier (null = no current)
      weathering: voyageInfo.weathering || null,             // V3a — fog/rain/snow this day (null = none); slowed by weatheringSpeedMult
      weatheringSpeedMult: (voyageInfo.weatheringSpeedMult != null) ? voyageInfo.weatheringSpeedMult : 1,
      // V3b — nautical hazards + gale damage this day (null/0 = none); the SHP/grounded mutation rides record.voyageState
      hazards: _hazardResults.length ? _hazardResults.map(h => ({ hazard: h.hazard, success: h.success, shpDamage: h.shpDamage, grounded: h.grounded })) : null,
      gale: (_galeResult && !_galeResult.success) ? { shpDamage: _galeResult.shpDamage, hoursCaught: _galeResult.hoursCaught } : null,
      shpDamage: _voyShpDamage,
      grounded: _voyGrounded || null,
      stuck: !!_voyageStuck,
      // V3c — ship stores / deprivation / scurvy this day (null = not tracked); level governs today's speed (entering deficit)
      provision: (_voyProvision && _voyProvision.tracked) ? {
        stores: _voyProvision.newStores, deficitDays: _voyProvision.newDeficit, level: _voyProvision.deprivation.level,
        speedMult: _voyProvision.deprivation.speedMult, scurvyDays: _voyProvision.newScurvyDays, scurvy: _voyProvision.newScurvy,
        scurvyOnset: _voyProvision.scurvyOnset, scurvyCured: _voyProvision.scurvyCured, becameUnderfed: _voyProvision.becameUnderfed,
        becameStarving: _voyProvision.becameStarving, freshFood: _voyProvision.freshFood, ate: _voyProvision.ate
      } : null
    } : null,
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
    armyId: journey.armyId || null,                          // W4 — an army's march day (null = a party's)
    armyContact: armyContactRecord,                          // W4 — {opposingArmyId, hexId} when the march halted on an opposing army
    encounters: encounters.map(e => ({ kind: e.triggeredBy || 'wandering-roll', encounterId: e.id })),
    // type routes each notable to the nav vs forage row in the day log; payload is KEPT in the
    // committed digest — the day-log affordances (E2 ⚔ Resolve via payload.encounterId; M4's
    // → lair / 🐾 Track home via payload.lairId) read it. Older saves' digests lack it → the
    // buttons simply hide (graceful), so no migration.
    notableEvents: notableEvents.map(n => ({ kind: n.kind, type: n.type || null, text: n.label, payload: n.payload || null })),
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
  if(isArmy) _related.push({ kind: 'army', id: journey.armyId, role: 'subject' });   // W4 — the marching army
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
    voyageState: _voyageState,                       // Voyages V3b — vessel-state absolutes (shp/condition/grounded); commit applies via applyVoyageDayState (null on a non-hazard/non-gale day)
    newCurrentHexId, newStatus, primaryHexId: journey.startHexId || null,
    // §27 getting-lost post-state (commitJourneyRecord applies these; reroll-revert restores the pre-state)
    newStrayHeading, newRouteAnchorCoord, newRouteAnchorHexId, newCoveredBaseline, reanchored,
    // #476 E1 — the day's meeting encounters (full draw + pre-rolled distance); the commit
    // materializes each as an Encounter entity under its preview-minted id.
    encounterProposals: encounters
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
  // The day being LEFT, as an absolute world ordinal turn*30 + day. In the pipeline ctx.dayInMonth is the
  // day being ENTERED (tickDayOnce's nextDay), so the day left is dayInMonth-1 — which also equals
  // work.currentDayInMonth (incremented AFTER this runs). Prefer ctx.dayInMonth so a direct call that
  // sequences days via ctx (without moving the campaign clock) is handled too. The lockstep skip-guard
  // compares each in-transit journey's travel marker against it.
  const _leftDayInMonth = (typeof ctx.dayInMonth === 'number') ? (ctx.dayInMonth - 1) : ((campaign.currentDayInMonth) || 1);
  const leftOrd = ((campaign.currentTurn || 1) * 30) + _leftDayInMonth;
  // W4 — the shared army-day stash (the E6-interlock pattern): each army journey's
  // proposed end position + contacts ride the day ctx so the slot-88 military
  // consumer evaluates POST-march positions. Created on the ORIGINAL ctx object —
  // the per-journey Object.assign copy below shares the nested reference.
  if(!ctx._armyDay) ctx._armyDay = { moves: {}, contacts: [] };
  for(const j of campaign.journeys){
    if(!j || j.status !== 'in-transit') continue;
    // Lockstep skip-guard (Complete Movement, 2026-06-05): one leg per world day. If this journey's
    // travel for the day being left has already been resolved — by a manual "Complete Movement" or an
    // earlier pass — don't resolve it again (that would march the party twice in one day). A journey
    // the GM did NOT move falls through and is auto-resolved here at the commit tick.
    if(j.lastTravelWorldOrd != null && j.lastTravelWorldOrd >= leftOrd) continue;
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
  // Voyages V3b/V3c — vessel pre-state snapshot (hull shp/condition/grounded + the V3c provisioning
  // ladder: shipStores/deficit/scurvy-counter/scurvy), captured pre-apply so a reroll reverts the
  // vessel too. Only when this day mutated the vessel (record.voyageState present).
  if(record.voyageState && record.voyageState.vesselId && global.ACKS && typeof global.ACKS.findVessel === 'function'){
    const _vv = global.ACKS.findVessel(campaign, record.voyageState.vesselId);
    if(_vv) dr._preDay.voyage = { vesselId: _vv.id, shp: _vv.shp, condition: _vv.condition, grounded: _vv.grounded || null,
                                  shipStores: _vv.shipStores, provisionDeficitDays: _vv.provisionDeficitDays,
                                  daysAtSeaWithoutFreshFood: _vv.daysAtSeaWithoutFreshFood, scurvy: _vv.scurvy };
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
  // Lockstep marker (Complete Movement, 2026-06-05): the absolute world ordinal of the day this leg
  // TRAVELLED ON (the day being left). The consumer path tags the record with the day being ENTERED
  // (tickDayOnce's nextDay), so the travel day is dayInMonth-1; the Complete-Movement / start path carries
  // no tag, so the travel day is the current clock day. proposeJourneyDay's skip-guard + the UI's
  // "already moved today" check read this to enforce one leg per world day. (rerollJourneyDay re-runs a
  // PAST leg under a later clock, so it restores the original marker after the re-commit.)
  {
    const _travelDayInMonth = (typeof record.dayInMonth === 'number') ? (record.dayInMonth - 1) : ((campaign.currentDayInMonth) || 1);
    j.lastTravelWorldOrd = ((campaign.currentTurn || 1) * 30) + _travelDayInMonth;
  }
  // §27 getting-lost post-state: the stray heading + (when a lost day re-anchored) the coord anchor and
  // banked baseline. Recompute the route snapshot when re-anchored so the UI/integrators see the live
  // route from the party's strayed position.
  if('newStrayHeading' in record) j.strayHeading = (typeof record.newStrayHeading === 'number') ? record.newStrayHeading : null;
  if('newCoveredBaseline' in record) j.coveredBaseline = record.newCoveredBaseline;
  if('newRouteAnchorCoord' in record) j.routeAnchorCoord = record.newRouteAnchorCoord || null;
  if('newRouteAnchorHexId' in record) j.routeAnchorHexId = record.newRouteAnchorHexId || null;
  if(record.reanchored){ try { j.routeCoords = journeyRoute(campaign, j).map(s => s.coord); } catch(e){ /* keep prior snapshot */ } }
  // #476 E1 — materialize the day's meeting encounters as Encounter entities. The draw + the
  // pre-rolled distance rode the record from the seeded preview, so the entity matches what the
  // GM reviewed byte-for-byte; createEncounter is id-idempotent, so the propose pass's working-
  // copy commit and a reroll's re-commit never duplicate.
  if(Array.isArray(record.encounterProposals) && record.encounterProposals.length
     && global.ACKS && typeof global.ACKS.createEncounterFromDraw === 'function'){
    for(const ep of record.encounterProposals){
      if(!ep || !ep.draw) continue;
      global.ACKS.createEncounterFromDraw(campaign, ep.draw, {
        id: ep.id, trigger: 'journey-travel',
        partySide: { partyId: j.partyId || null, journeyId: j.id,
                     characterIds: (j.participantCharacterIds || []).slice(),
                     faceCharacterId: null,
                     sizeCount: (j.participantCharacterIds || []).length || 1 },
        distance: ep.distance || null,
        onDayInMonth: (dr.worldDay && dr.worldDay.dayInMonth) || undefined
      });
    }
  }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: record.newDayIndex, type: (record.newStatus === 'arrived' ? 'arrived' : 'day-tick'), narrative: record.label || ('day ' + record.newDayIndex) });
  // Provisioning V2/V3 — apply the per-member survival absolutes (water/food/conditions/CON loss +
  // changed inventories + camp), replacing the old uniform first-member mirror. Sets hungerDays/
  // dehydrationDays per traveller as a back-compat alias. No-op on a journey with ignore-rations.
  applyJourneyDaySurvival(campaign, j, record.survival);
  // Voyages V3b — apply the day's vessel-state absolutes (SHP / condition / grounded). PURE-absolute
  // (the tick already rolled), the applyDaySurvival precedent; a reroll reverts from _preDay.voyage.
  if(record.voyageState && global.ACKS && typeof global.ACKS.applyVoyageDayState === 'function') global.ACKS.applyVoyageDayState(campaign, j, record.voyageState);
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
  // W4 — the ARMY tracks its march the same way: position follows the journey each
  // day, the marched-day window feeds the RR p.448 3-of-7 fatigue rule, and arrival
  // releases the march link (the journey stays in campaign.journeys as the log).
  if(j.armyId){
    const army = (campaign.armies || []).find(a => a && a.id === j.armyId);
    if(army){
      if(record.newCurrentHexId) army.currentHexId = record.newCurrentHexId;
      const dr2 = record.dayRecord || {};
      if((dr2.hexesTraveled || 0) > 0 && global.ACKS && typeof global.ACKS.recordArmyMarchDay === 'function'){
        const _travelDayInMonth = (typeof record.dayInMonth === 'number') ? (record.dayInMonth - 1) : ((campaign.currentDayInMonth) || 1);
        const _travelOrd = ((campaign.currentTurn || 1) * 30) + _travelDayInMonth;
        global.ACKS.recordArmyMarchDay(army, _travelOrd, dr2.pace || j.pace || 'normal');
      }
      if(record.newStatus === 'arrived'){
        army.journeyId = null;
        (army.history = army.history || []).push({ turn: campaign.currentTurn || null, dayInMonth: campaign.currentDayInMonth || null, type: 'march-arrived', narrative: (army.name || 'The army') + ' arrived at ' + (j.destinationHexId || 'its destination') + '.' });
      }
    }
  }
  // A marching UNIT (journey.unitId) on arrival. Two cases:
  //  • RETURN HOME (journey.unitReturnHome) — it falls back into its home-domain garrison.
  //  • RALLY (the call-up) — it joins the army it was called up to, its strength now counted.
  if(j.unitId && record.newStatus === 'arrived'){
    const unit = (campaign.units || []).find(u => u && u.id === j.unitId);
    const A = global.ACKS;
    if(unit && (j.unitReturnHome || unit.returnJourneyId === j.id)){
      const homeDomId = (A && typeof A.unitHomeDomainId === 'function') ? A.unitHomeDomainId(campaign, unit) : (unit.homeDomainId || null);
      if(A && typeof A.stationUnit === 'function'){
        if(homeDomId && (campaign.domains || []).some(d => d && d.id === homeDomId)){
          A.stationUnit(campaign, unit, { kind: 'domain-garrison', id: homeDomId });
          if(unit.homeHexId) unit.stationedAtHexId = unit.homeHexId;
        } else {
          A.stationUnit(campaign, unit, { kind: 'hex', id: j.destinationHexId || record.newCurrentHexId || null });   // home vanished — hold at the arrival hex
        }
      }
      unit.returnJourneyId = null;
      (unit.history = unit.history || []).push({ turn: campaign.currentTurn || null, dayInMonth: campaign.currentDayInMonth || null, type: 'returned-home', text: 'Marched home and fell back into the garrison.' });
    } else if(unit){
      const armyId = unit.rallyingToArmyId;
      const army = armyId ? (campaign.armies || []).find(a => a && a.id === armyId) : null;
      if(army && A && typeof A.stationUnit === 'function'){
        A.stationUnit(campaign, unit, { kind: 'army', id: army.id });
        (army.history = army.history || []).push({ turn: campaign.currentTurn || null, dayInMonth: campaign.currentDayInMonth || null, type: 'reinforcement-arrived', narrative: (unit.displayName || unit.unitTypeKey || 'A unit') + ' marched in and joined ' + (army.name || 'the army') + '.' });
      } else if(A && typeof A.stationUnit === 'function'){
        // a FREE march (startUnitMarch / journey.unitMarch) — the unit halts at the hex it marched to
        A.stationUnit(campaign, unit, { kind: 'hex', id: j.destinationHexId || record.newCurrentHexId || null });
        (unit.history = unit.history || []).push({ turn: campaign.currentTurn || null, dayInMonth: campaign.currentDayInMonth || null, type: 'march-arrived', text: 'Marched to ' + (j.destinationHexId || 'its destination') + '.' });
      }
      unit.rallyingToArmyId = null; unit.rallyJourneyId = null; unit.marchJourneyId = null;
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
  // The LATEST leg is ALWAYS rerollable — it IS the journey's current state (Joachim 2026-06-05: "you
  // should always be able to reroll the last leg"). A NEWER leg supersedes it (Complete Movement or the
  // next day-tick creates one); the world clock no longer locks it on its own. The old nowOrd<=legOrd
  // clock-lock is dropped now that one leg = one world day. Still gated on a _preDay snapshot (legacy
  // legs without one stay non-rerollable) + not aborted (a deliberate GM decision, not a die roll).
  return true;
}

// GM reroll of the LATEST committed day: revert the journey + participants to the day's pre-state
// snapshot, prune that day's journey events from the eventLog, re-run the day with fresh
// randomness, re-commit, and re-emit the new day's notable events. Only the latest day is
// rerollable (downstream days depend on it) and only while the world clock still stands on it
// (journeyLastDayRerollable). Returns the new record, or null if not possible.
function rerollJourneyDay(campaign, journey, ctx){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!journeyLastDayRerollable(campaign, j)) return null; // no snapshot or aborted
  const _origTravelOrd = j.lastTravelWorldOrd; // this leg's travel marker — restored after the re-commit (below)
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
  // 1b. #476 E1 — drop the reverted day's materialized Encounter entities (+ any encounter-*
  // events hanging off them): the day never happened. Surgical, like rerollHexSearch's
  // discovery reversal — a GM who already walked/resolved one of these loses that walk with
  // the day, which is the point of the reroll. E4: an encounter whose 6a binding MINTED a
  // lair (detailed a shell / revealed a pooled lair / created a fresh den) unwinds that
  // first — the world keeps no den from a day that never happened.
  {
    const _encIds = ((lastDay && lastDay.encounters) || []).map(e => e && e.encounterId).filter(Boolean);
    if(_encIds.length){
      if(Array.isArray(campaign.encounters)){
        for(const e of campaign.encounters){
          if(e && _encIds.indexOf(e.id) >= 0 && e.monsterSide && e.monsterSide.minted && typeof A._unwindEncounterMinting === 'function')
            A._unwindEncounterMinting(campaign, e.monsterSide.minted);
        }
        campaign.encounters = campaign.encounters.filter(e => !(e && _encIds.indexOf(e.id) >= 0));
      }
      campaign.eventLog = (campaign.eventLog || []).filter(entry => {
        const ev = entry && entry.event;
        return !(ev && ev.payload && ev.payload.encounterId && _encIds.indexOf(ev.payload.encounterId) >= 0);
      });
    }
  }
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
  // Voyages V3b — revert the vessel from the pre-day snapshot (shp/condition/grounded), so a reroll of
  // a hazard/gale day undoes the hull damage + any grounding (the world keeps nothing from a re-rolled day).
  if(pre.voyage && pre.voyage.vesselId && typeof A.findVessel === 'function'){
    const _vv = A.findVessel(campaign, pre.voyage.vesselId);
    if(_vv){
      _vv.shp = pre.voyage.shp; _vv.condition = pre.voyage.condition; _vv.grounded = pre.voyage.grounded || null;
      // V3c — restore the ship-stores ladder (shipStores/deficit/scurvy-counter/scurvy) to its pre-day value
      if('shipStores' in pre.voyage) _vv.shipStores = pre.voyage.shipStores;
      if('provisionDeficitDays' in pre.voyage) _vv.provisionDeficitDays = pre.voyage.provisionDeficitDays;
      if('daysAtSeaWithoutFreshFood' in pre.voyage) _vv.daysAtSeaWithoutFreshFood = pre.voyage.daysAtSeaWithoutFreshFood;
      if('scurvy' in pre.voyage) _vv.scurvy = pre.voyage.scurvy;
    }
  }
  // revert the party to its pre-day hex too (commitJourneyRecord now moves it every day); an arrival
  // reroll additionally re-links the activeJourneyId it had cleared.
  if(j.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === j.partyId);
    if(pt){ pt.currentHexId = pre.currentHexId || pt.currentHexId; if(wasArrival) pt.activeJourneyId = j.id; }
  }
  (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: dayNum, type: 'reroll', narrative: 'GM rerolled day ' + dayNum + '.' });
  // 3. re-run the day with fresh randomness + commit + re-emit its events (the shared tick→commit→emit
  //    core, also used by the start-flow's first-day travel). ctx passes through — rerollJourneyNav uses
  //    { skipSurvival:true } to re-roll movement only and hold provisioning fixed.
  const _rerolledRec = _commitJourneyDayAndEmit(campaign, j, ctx);
  // The re-commit stamped lastTravelWorldOrd with the CURRENT clock, but a reroll re-does the SAME past
  // leg — restore its original travel ordinal so the lockstep skip-guard still lands on the right day
  // (otherwise the next +1 day would wrongly skip, or double-count, a travel day).
  if(_rerolledRec && _origTravelOrd != null) j.lastTravelWorldOrd = _origTravelOrd;
  return _rerolledRec;
}

// Resolve ONE journey day with fresh randomness: tick → commit → emit the day's notable events to the
// eventLog (best-effort; mirrors emitDayTickEvents). The shared core of rerollJourneyDay (which reverts
// the latest day first) and advanceJourneyOneDay (the start-flow's first-day travel). Mutates the
// campaign (commits the day + emits events). Returns the committed record, or null.
function _commitJourneyDayAndEmit(campaign, j, ctx){
  const A = _jACKS();
  const out = tickJourneyDay(campaign, j, ctx || {});
  if(!out || !out.record) return null;
  commitJourneyRecord(campaign, out.record);
  const ids = j.participantCharacterIds || [];
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
  } catch(e){ /* never let event emission block the day */ }
  return out.record;
}

// Resolve + commit the journey's NEXT day with fresh randomness, emitting its events — WITHOUT the global
// Day Clock (so starting / advancing one journey doesn't tick weather / construction / the date). The
// start flow calls this so setting out resolves day 1 at once (Joachim 2026-06-05: "it should start it
// now") — the day becomes the rerollable current state, and the Day Clock advances the rest. The day is
// stamped on the journey's current world day (startedAtDayInMonth + dayIndex-1), so it's the rerollable
// "current" leg until the clock moves past it. In-transit only; returns the committed record, or null.
function advanceJourneyOneDay(campaign, journey, ctx){
  const A = _jACKS();
  const j = (typeof journey === 'string') ? A.findJourney(campaign, journey) : journey;
  if(!j || j.status !== 'in-transit') return null;
  return _commitJourneyDayAndEmit(campaign, j, ctx);
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
  if(j.status === 'lost') j.status = 'in-transit';   // E8 — a re-route re-orients a KNOWINGLY-lost party too (RR p.285)
  j.lostEncounterId = null;
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
// hexName(hex, campaign?) — the canonical hex display label. A settlement's name takes precedence
// over terrain. T6 single-home: the settlement now lives in campaign.settlements[] (keyed by hexId),
// so pass `campaign` to resolve it (settlementForHex). The legacy embedded hex.settlement is still
// read first for back-compat (transitional hexes + test literals that embed a settlement), so the
// extra arg is optional — a caller without a campaign just gets the terrain label for a settled hex.
function hexName(hex, campaign){
  if(!hex) return '';
  const coords = hex.coord ? hexDisplayLabel(hex.coord.q, hex.coord.r) : '';
  let settlement = (hex.settlement && hex.settlement.name) ? String(hex.settlement.name).trim() : '';
  if(!settlement && campaign && hex.id && global.ACKS && global.ACKS.settlementForHex){
    const s = global.ACKS.settlementForHex(campaign, hex.id);
    if(s && s.name) settlement = String(s.name).trim();
  }
  let base = settlement;
  if(!base && hex.terrain){
    const t = String(hex.terrain).trim();
    base = t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    // Terrain model — a sub-type'd hex names as "Barrens (tundra)"; an unset sub-type is omitted.
    const sub = hex.terrainSubtype ? String(hex.terrainSubtype).trim() : '';
    if(base && sub) base = base + ' (' + sub + ')';
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
// === Terrain T3 (team) === Phase_2.5_Terrain_Model_Plan.md §7 (T3 render).
// Biome palette for the optional "Color by: Biome" fill layer — the JJ p.40 biome column
// (BIOMES, catalogs), DERIVED per hex from its Köppen code (biomeForHex). 10 colours, NOT a
// 22-colour sub-type palette (plan §4 / Map plan §4 — keep the standard view legible). Keyed in
// the canonical BIOMES order (the JJ p.40 column), so the legend reads in that order. Climate-
// evocative colours (tropical green / tawny savanna / pale sand / cold grey-blue …). A hex with
// no Köppen / override (biome '') falls through to HEX_FILL_UNKNOWN, so the map never holes.
const HEX_BIOME_COLORS = Object.freeze({
  'Rainforest':'#15803d', 'Savanna':'#dcae52', 'Desert':'#ecdba0', 'Semi-Arid Desert':'#cba66e',
  'Steppe':'#b6c06a', 'Scrub':'#8f9a4f', 'Forest':'#4f9d5e', 'Taiga':'#5b8c84',
  'Prairie':'#c3dd76', 'Tundra':'#c0cdcf'
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
    case 'biome': { // === Terrain T3 (team) === derived biome (Köppen → biomeForHex, catalogs)
      const A = global.ACKS || {};
      const b = A.biomeForHex ? A.biomeForHex(hex) : (hex.biomeOverride || '');
      return HEX_BIOME_COLORS[b] || HEX_FILL_UNKNOWN; // unset biome → neutral parchment
    }
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
    { id:'biome',          label:'Biome' },   // === Terrain T3 (team) === derived from Köppen (JJ p.40)
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
    case 'biome': // === Terrain T3 (team) === the 10 JJ p.40 biomes + an "Unset" row (no Köppen)
      return Object.keys(HEX_BIOME_COLORS).map(k => ({ label: k, color: HEX_BIOME_COLORS[k] }))
        .concat([{ label: 'Unset', color: HEX_FILL_UNKNOWN }]);
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

// ─── CoL-1 (Phase 2.5 Provisioning §16.2) — off-journey survival day-consumer ──────────────────────
// Generalizes the field food/water resolution to EVERY field character not already resolved by a journey,
// so a character standing in the wild gets hungry/thirsty when the GM advances the day. Runs the SAME
// resolveDaySurvival primitive as the journey tick. Field characters are grouped by (party, hex) so a
// co-located sharing party pools food+water (camp-first, leader-first); everyone else resolves alone.
// SETTLED characters (settlement / ruled-domain / stronghold hex — characterProvisioningRegime) are
// auto-provisioned: a settled day = free food + topped water (freeFood/freeWater), so deficits clear and
// a character leaves town topped up — but only when they actually need it (no no-op churn). Dedups against
// the 'journeys' consumer by membership. Notable signals are TRANSIENT (pause + review surface only;
// condition flags persist via commit — no eventLog spam in CoL-1).

// A settled character needs a top-up day only if under water capacity OR carrying any deficit / CON loss.
function _settledNeedsTopUp(campaign, c){
  const A = _jACKS();
  if(!c) return false;
  if((Number(c.foodDeficitDays) || 0) > 0 || (Number(c.waterDeficitDays) || 0) > 0) return true;
  if((Number(c.conLossHunger) || 0) > 0 || (Number(c.conLossThirst) || 0) > 0) return true;
  const cap = (typeof A.waterCapacityDays === 'function') ? A.waterCapacityDays(c) : 0;
  return (Number(c.waterDaysCarried) || 0) < cap;
}

// Partition active characters into FIELD groups (resolved this day) + SETTLED chars (topped up if needed).
function _survivalDayGroups(campaign){
  const A = _jACKS();
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  const isActive = A.isActive;
  // Companion-aware (CoL-1, Joachim 2026-06-06): a character is on lifestyle if anyone in their cohort
  // (party / journey co-members at the same hex) rules the hex's domain — so a ruler's companions standing
  // in his realm are exempt, party-sharing or not. Field characters everywhere else always consume.
  const regimeOf = A.characterEffectiveRegime || A.characterProvisioningRegime;
  const onJourney = {};
  // E8 — a KNOWINGLY-lost journey (status 'lost', RR p.285) is deliberately NOT excluded: it
  // holds its position (the journeys consumer ticks only in-transit), so its members are a
  // stationary field group — this consumer owns their food/water while they search for the
  // landmark, and the rest-night camp checks face them too (lost camps stay dangerous).
  (campaign.journeys || []).forEach(j => {
    if(j && (j.status === 'in-transit' || j.status === 'resting')){
      (j.participantCharacterIds || []).forEach(id => { onJourney[id] = 1; });
    }
  });
  const parties = (campaign.parties || []);
  const partyOf = (cid) => parties.find(p => p && Array.isArray(p.memberCharacterIds) && p.memberCharacterIds.indexOf(cid) >= 0) || null;
  const field = [], settled = [];
  for(const c of chars){
    if(!c || !c.id) continue;
    if(typeof isActive === 'function' && !isActive(c)) continue;
    if(onJourney[c.id]) continue;
    const r = (typeof regimeOf === 'function') ? regimeOf(campaign, c) : 'field';
    if(r === 'settled') settled.push(c); else field.push(c);
  }
  const groups = [], claimed = {};
  for(const c of field){
    if(claimed[c.id]) continue;
    const p = partyOf(c.id);
    if(p && p.shareProvisions && p.currentHexId && c.currentHexId === p.currentHexId){
      const mates = field.filter(x => !claimed[x.id] && partyOf(x.id) === p && x.currentHexId === p.currentHexId);
      mates.forEach(x => { claimed[x.id] = 1; });
      groups.push({
        partyId: p.id, members: mates, hex: A.findHex(campaign, p.currentHexId), share: true,
        camp: (typeof A.partyCampStash === 'function') ? A.partyCampStash(campaign, p.id) : null,
        leaderId: p.leaderCharacterId || (p.memberCharacterIds || [])[0] || null,
        prefix: p.name || 'Party', payload: { partyId: p.id, campaignLogHidden: true }
      });
    } else {
      claimed[c.id] = 1;
      groups.push({
        partyId: null, members: [c], hex: A.findHex(campaign, c.currentHexId), share: false, camp: null, leaderId: null,
        prefix: c.name || 'A character', payload: { characterId: c.id, campaignLogHidden: true }
      });
    }
  }
  return { groups: groups, settled: settled };
}

// CoL-1 (2026-06-08) — whether the day's survival outcome is worth a permanent record. A purely routine
// fed+watered day with no deficit and no change is NOT recorded (no eventLog noise). Recorded when any
// member is hungry/thirsty/critical, is still carrying a deficit or CON loss, or changed today (lost OR
// recovered CON / cleared a deficit) — i.e. there is an actual survival CONDITION to write to history.
function _survivalDayWorthRecording(surv){
  if(!surv || surv.ignored) return false;
  if(surv.anyHungry || surv.anyThirsty || surv.anyCritical) return true;
  const ms = surv.members || {};
  for(const id in ms){
    const m = ms[id]; if(!m) continue;
    if((m.foodDeficitDays || 0) > 0 || (m.waterDeficitDays || 0) > 0) return true;   // still in deficit
    if((m.conLossHunger || 0) > 0 || (m.conLossThirst || 0) > 0) return true;        // still carrying CON loss
    if((m.conLostHunger || 0) !== 0 || (m.conLostThirst || 0) !== 0) return true;    // changed today (loss or recovery)
  }
  return false;
}

// A compact per-member status fragment for the survival-day label/history.
function _survivalMemberFragment(name, m){
  if(!m) return name;
  const bits = [];
  if(m.starving) bits.push('starving (day ' + (m.foodDeficitDays || 0) + ')');
  else if(m.underfed) bits.push('underfed (day ' + (m.foodDeficitDays || 0) + ')');
  else if(m.hungry) bits.push('hungry');
  if(m.dehydrated) bits.push('dehydrated (day ' + (m.waterDeficitDays || 0) + ')');
  const net = (m.conLostHunger || 0) + (m.conLostThirst || 0);                       // +lost / −recovered today
  if(net > 0) bits.push('lost ' + net + ' CON');
  else if(net < 0) bits.push('regained ' + (-net) + ' CON');
  if(m.critical) bits.push('at death’s door (CON 0)');
  if(!bits.length) bits.push('fed and watered');
  return name + ' — ' + bits.join(', ');
}

// Build the comprehensive (non-transient) survival-day event for one resolved group — the off-journey
// counterpart of journey-day-tick (CoL-1, 2026-06-08). Carries the full day's per-member outcome + the
// context envelope (the hex as primaryHexId, each member as a related character, the party), so the day
// surfaces in ACKS.characterHistory / hexHistory / partyHistory. campaignLogHidden on a recovery-only
// day (stays in the Event Log + histories, off the narrative Campaign Log); surfaced when a condition is
// active that day. The per-thing transient signals still drive the pause + day-review digest.
function _buildSurvivalDayEvent(campaign, surv, memberChars, partyId, hex, settled){
  const related = [];
  const membersOut = {};
  (memberChars || []).forEach(c => {
    if(!c || !c.id) return;
    related.push({ kind: 'character', id: c.id, role: 'subject' });
    const m = surv.members && surv.members[c.id];
    if(m) membersOut[c.id] = {
      name: c.name || c.id, fedFood: !!m.fedFood, fedWater: !!m.fedWater,
      foodDeficitDays: m.foodDeficitDays || 0, waterDeficitDays: m.waterDeficitDays || 0,
      conLossHunger: m.conLossHunger || 0, conLossThirst: m.conLossThirst || 0,
      conLostHunger: m.conLostHunger || 0, conLostThirst: m.conLostThirst || 0,
      hungry: !!m.hungry, underfed: !!m.underfed, starving: !!m.starving, dehydrated: !!m.dehydrated,
      critical: !!m.critical, waterDaysCarried: m.waterDaysCarried || 0
    };
  });
  if(partyId) related.push({ kind: 'party', id: partyId, role: 'subject' });
  const frags = (memberChars || []).map(c => _survivalMemberFragment(c.name || c.id, surv.members && surv.members[c.id]));
  let label = frags.slice(0, 3).join('; ');
  if(frags.length > 3) label += '; and ' + (frags.length - 3) + ' more';
  if(settled && label) label += ' (sheltered)';
  const notableNow = !!(surv.anyHungry || surv.anyThirsty || surv.anyCritical);
  return {
    kind: 'survival-day',
    type: 'survival-day',
    transient: false,
    primaryHexId: (hex && hex.id) || null,
    relatedEntities: related,
    campaignLogHidden: !notableNow,    // recovery-only days stay out of the Campaign Log (still in history)
    label: label || 'survival day',
    payload: {
      survivalDay: true, partyId: partyId || null, hexId: (hex && hex.id) || null, settled: !!settled,
      anyHungry: !!surv.anyHungry, anyThirsty: !!surv.anyThirsty, anyCritical: !!surv.anyCritical,
      members: membersOut, narrative: label || 'survival day'
    }
  };
}

// Deterministic survival PREVIEW seed (CoL-1, 2026-06-08) — the same fix the journey path uses
// (_seededJourneyRng above). The off-journey 'survival' consumer's ONLY die is the Dehydrated 1d6
// CON loss (resolveDaySurvival §1.3). If it rolled with Math.random, the floating Day-tick review
// would show a DIFFERENT loss each time it re-opened (the GM cancels + re-ticks, or the review
// refreshes) — the committed state hadn't changed, but the previewed dehydration jumped around.
// Instead seed each group's dice from a fingerprint of its CURRENT committed pre-state + the world
// day: re-opening previews the IDENTICAL day, and it changes only when the GM changes something real
// (advance the clock, give the party water → a new fingerprint → a new, still-stable preview).
// commitSurvivalRecord replays the recorded absolutes, so the ratified loss is exactly what was
// reviewed. A caller may still inject ctx.rng to force genuine randomness. Reuses the journey path's
// _jHash32 (FNV-1a) + _jMulberry32 PRNG (defined above).
function _survivalPreviewFingerprint(campaign, group, ctx){
  ctx = ctx || {};
  const cal = (campaign && campaign.calendar) || {};
  const surv = [];
  for(const c of (group.members || [])){
    if(!c){ surv.push('?'); continue; }
    surv.push([c.id, c.hungerDays || 0, c.dehydrationDays || 0, c.waterDaysCarried || 0,
               c.foodDeficitDays || 0, c.waterDeficitDays || 0,
               c.conLossHunger || 0, c.conLossThirst || 0,
               c.underfed ? 1 : 0, c.starving ? 1 : 0, c.dehydrated ? 1 : 0].join('|'));
  }
  return JSON.stringify({
    d: ctx.dayInMonth || (campaign && campaign.currentDayInMonth) || 1, y: cal.year || 1, m: cal.month || 1,
    party: group.partyId || null, hex: (group.hex && group.hex.id) || null,
    share: group.share ? 1 : 0, settled: group.settled ? 1 : 0, surv: surv
  });
}
function _seededSurvivalRng(campaign, group, ctx){
  return _jMulberry32(_jHash32(_survivalPreviewFingerprint(campaign, group, ctx)));
}

// PURE handler (Calendar §14): propose each field group's survival + settled top-ups. No mutation.
function proposeSurvivalDay(campaign, ctx){
  const A = _jACKS();
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  if(!campaign || (A.isHouseRuleEnabled && A.isHouseRuleEnabled(campaign, 'ignore-rations'))) return out;
  const split = _survivalDayGroups(campaign);
  for(const g of split.groups){
    // Stable preview: seed the day's 1d6 dehydration from the group's committed fingerprint unless
    // the caller forced an rng — so re-opening / refreshing the review reproduces the same day.
    const rng = (ctx && ctx.rng) || _seededSurvivalRng(campaign, g, ctx);
    const surv = resolveDaySurvival(campaign, {
      members: g.members, hex: g.hex, share: g.share, camp: g.camp, leaderId: g.leaderId,
      notable: { kind: 'survival-day-tick', prefix: g.prefix, primaryHexId: (g.hex && g.hex.id) || null, payload: g.payload, transient: true }
    }, Object.assign({}, ctx || {}, { rng: rng }));
    if(surv.ignored) continue;
    out.pendingRecords.push({ kind: 'survival', partyId: g.partyId, memberIds: g.members.map(m => m.id), survival: surv });
    (surv.notableEvents || []).forEach(e => out.notableEvents.push(e));
    // CoL-1 (2026-06-08): persist the day to the eventLog/history when it carries a condition (not a
    // routine fed day). One comprehensive survival-day event per group — the off-journey counterpart of
    // journey-day-tick — surfaces in characterHistory / hexHistory / partyHistory.
    if(_survivalDayWorthRecording(surv)){
      out.notableEvents.push(_buildSurvivalDayEvent(campaign, surv, g.members, g.partyId, g.hex, false));
    }
  }
  for(const c of split.settled){
    if(!_settledNeedsTopUp(campaign, c)) continue;
    const hex = A.findHex(campaign, c.currentHexId);
    // A settled day tops water to capacity (freeWater) so the 1d6 never rolls — but seed it anyway
    // for consistency, so any future settled die is preview-stable too.
    const rng = (ctx && ctx.rng) || _seededSurvivalRng(campaign, { members: [c], hex: hex, partyId: null, share: false, settled: true }, ctx);
    const surv = resolveDaySurvival(campaign, {
      members: [c], hex: hex, share: false, camp: null, leaderId: null,
      freeFood: true, freeWater: true,
      notable: { kind: 'survival-day-tick', prefix: c.name || 'A character', primaryHexId: c.currentHexId || null, payload: { characterId: c.id }, transient: true }
    }, Object.assign({}, ctx || {}, { rng: rng }));
    if(surv.ignored) continue;
    out.pendingRecords.push({ kind: 'survival', partyId: null, memberIds: [c.id], survival: surv });
    // A settled top-up that CLEARS a deficit (recovery) is recorded too — campaignLogHidden, but in history.
    if(_survivalDayWorthRecording(surv)){
      out.notableEvents.push(_buildSurvivalDayEvent(campaign, surv, [c], null, hex, true));
    }
  }
  return out;
}

// COMMIT (Calendar §14): apply one ratified survival record's absolutes.
function commitSurvivalRecord(campaign, record){
  if(!record || record.kind !== 'survival' || !record.survival) return;
  applyDaySurvival(campaign, record.survival, record.partyId || null);
}

// ─── Attach to ACKS namespace ────────────────────────────────────────────
const ACKS = global.ACKS = global.ACKS || {};
Object.assign(ACKS, {
  CALENDARS, calendarFor, monthName, seasonFor, currentDateString, advanceCalendarOneMonth, advanceCalendarOneDay,
  // Review tab (2026-06-13) — calendar cursors + dated event reads for Pending Events.
  calendarShiftMonths, calendarDayShift, eventsOnCalendarDay, monthlyEventsForReview,
  rollLoyaltyCheck, tickHenchmanLoyalty, RUMOR_TOPICS, RUMOR_APPARENT_LEVELS, RUMOR_TRUTH_LEVELS, RUMOR_PROLIFERATION_CHANCE, blankRumor, tickRumorApparentLevels, NOTABILITY_CATEGORIES, ENTRYWAY_KINDS, ENTRYWAY_SECURITY, ASSET_RESTRICTIONS, ENTRYWAY_INSPECTION_DEFAULT, computeTransactionThreshold, blankNotability, blankEntryway, blankRegulatedAsset, travelEstimate, rollEncounter, applyTravelTick,
  // Phase 2.5 Journeys (#475 — J1 + J2) — overland travel day-tick consumer.
  tickJourneyDay, proposeJourneyDay, commitJourneyRecord, startJourney, advanceJourneyOneDay, abortJourney, reRouteJourney, rerollJourneyDay, journeyLastDayRerollable, computeJourneyDistance, rollNavigation, journeyDefaultName, journeyBaseSpeedMilesPerDay,
  // §24 hex-by-hex resolution — route + pure per-step travel effects (roads / rivers / fording).
  journeyRoute, roadBonusForStep, riverCrossingForStep, journeyFordingThrow,
  // Phase 2.5 Provisioning (RR p.278) — per-member food/water resolution (V2/V3) + the forage reroll.
  hasFreshSource, seedJourneyProvisions, resolveDaySurvival, journeyDaySurvival, applyDaySurvival, applyJourneyDaySurvival, rerollJourneyForage, rerollJourneyNav, reapplyLatestDaySurvival,
  // CoL-1 (Provisioning §16.2) — off-journey survival day-consumer.
  proposeSurvivalDay, commitSurvivalRecord,
  // #476 E1 — the slot-80 rest/night encounter consumer (JJ p.41).
  proposeEncounterDay, commitEncounterRecord,
  // #476 E3c — the slot-82 pursuit consumer (the day handler + its commit hook).
  proposePursuitDay, commitPursuitRecord, trackingQuarryWalkDay, trackingSpringCatch,
  // #476 E6 — the slot-84 monster-bands consumer (wander + homing motion).
  proposeMonsterBandDay, commitMonsterBandRecord,
  // Phase 3 Military W2 — the slot-86 incursions consumer (the Vagaries of Incursion,
  // JJ pp.100–106) + the domain-panel lookup.
  proposeIncursionDay, commitIncursionRecord, incursionBandsForDomain,
  // #476 E10 — domain-morale banditry (RR pp.350–351): the monthly reconcile + lookup.
  banditryBandsForDomain, processBanditryForTurn,
  // Phase 3 Military W4 — the slot-88 military consumer (the campaign cycle, RR p.447).
  proposeMilitaryDay, commitMilitaryRecord,
  // Phase 2.95 §4.2 — Hireling recruitment engine helpers.
  parseAvailabilitySpec, rollAvailabilitySpec, rollAvailabilitySpecDetailed, rollDiceNotation, rollDiceNotationDetailed, rollAvailability, rollAvailabilityDetailed, resolveSolicitFee, rollReactionToHiring, computeReactionMods, solicitHirelings, individuateHirelingCandidate,
  findPersistentCandidates, computeEffectiveLoyalty,
  // Phase 2.95 #310 — day-aware recruitment drives (RR p.164).
  startRecruitmentDrive, advanceRecruitmentDrives, stopRecruitmentDrive, recruitmentDrivesForPatron, activeRecruitmentDrivesForPatron,
  proposeRecruitmentDay, commitRecruitmentRecord,
  // Phase 2.5 Map Mode (#225) — pure geometry + fill-layer helpers (Architecture §11).
  // M0–M2: projection, bounds, labels, fill layers. M3–M6: adjacency/edges, glyph sizing, layer catalogs.
  MAP_DEFAULT_HEX_SIZE, hexAxialToPixel, hexCornerPoints, hexPolygonPoints, hexMapBounds, hexAxialToColRow, hexColRowToAxial, hexDisplayLabel, hexName, generateBlankHexGrid,
  hexNeighborDeltas, hexEdgeBetween, hexOppositeEdge, hexLineDraw, hexEdgePoints, hexEdgeMidpoint, hexRiverSegments, hexRoadPathD, hexCrossingSegment, settlementGlyphScale, mapSymbolLayers, mapEdgeLayers, mapTerrainTypes,
  HEX_FACE_LABELS,
  HEX_TERRAIN_COLORS, HEX_TERRAIN_ALIASES, HEX_BIOME_COLORS, HEX_CLASSIFICATION_COLORS, HEX_LANDVALUE_RAMP, hexFillColor, hexFillLayers, hexFillLegend
});

// ─── #476 E1 — rest/night encounter checks (JJ p.41) — the slot-80 consumer ──────────────────
// The Calendar §12 collision slot gets its first occupant: STATIONARY field groups (a party
// camped in the wild, a lone warden, a RESTING journey's party — an in-transit journey's
// per-hex travel throws already covered its day) face the RAW rest/stationary frequencies:
// unsettled = one check per 12 hours day AND night; outlands = nights; borderlands = every
// 3rd night; civilized = every 7th night (cadence keyed off the absolute world ordinal —
// deterministic, no stored state). Terrain categories demote while resting (JJ p.42 step 7),
// so a camp check yields a MEETING (monster / civilized) or nothing. Seeded rng off
// (group, hex, world-day) — the review re-opens byte-stable; the commit materializes the
// Encounter entity under the preview-minted id. Camps are finally dangerous.

// Stationary field groups by (party, hex) — mirrors the survival consumer's grouping. Settled
// characters face settlement encounters, not wilderness ones (JJ p.41) — skipped; so is anyone
// whose in-transit journey already threw for the day.
function _restEncounterGroups(campaign){
  const A = _jACKS();
  const out = {};
  const inTransit = {};
  for(const j of (campaign.journeys || [])){
    if(j && j.status === 'in-transit') (j.participantCharacterIds || []).forEach(id => { inTransit[id] = true; });
  }
  for(const ch of (campaign.characters || [])){
    if(!ch || !ch.currentHexId) continue;
    if(inTransit[ch.id]) continue;
    if(typeof A.characterEffectiveRegime === 'function' && A.characterEffectiveRegime(campaign, ch) !== 'field') continue;
    const key = (ch.partyId || ('solo-' + ch.id)) + '@' + ch.currentHexId;
    (out[key] = out[key] || { key: key, partyId: ch.partyId || null, hexId: ch.currentHexId, characterIds: [] }).characterIds.push(ch.id);
  }
  return Object.keys(out).map(k => out[k]);
}

// §14 day-handler (slot 80). PURE — proposes rest-encounter records without mutating;
// commitEncounterRecord materializes a ratified record's Encounter entity.
function proposeEncounterDay(campaign, ctx){
  const pendingRecords = [], notableEvents = [], encounters = [];
  if(!campaign) return { pendingRecords, notableEvents, encounters };
  ctx = ctx || {};
  const A = _jACKS();
  if(typeof A.encounterDraw !== 'function' || typeof A.restEncounterChecksForDay !== 'function')
    return { pendingRecords, notableEvents, encounters };
  const dayInMonth = (typeof ctx.dayInMonth === 'number') ? ctx.dayInMonth : ((campaign.currentDayInMonth || 1) + 1);
  const worldOrd = ((campaign.currentTurn || 1) * 30) + dayInMonth;
  const takenIds = {};   // proposal-id mints shared across the day's groups (collision-proof)
  for(const g of _restEncounterGroups(campaign)){
    const hex = (campaign.hexes || []).find(h => h && h.id === g.hexId);
    if(!hex) continue;
    const territory = (typeof A.territoryClassForHex === 'function') ? A.territoryClassForHex(campaign, hex) : 'unsettled';
    const checks = A.restEncounterChecksForDay(territory, worldOrd);
    if(!checks.length) continue;
    const rng = ctx.rng || _jMulberry32(_jHash32('rest-enc|' + g.key + '|' + worldOrd));
    for(const chk of checks){
      const draw = A.encounterDraw(campaign, g.hexId, { resting: true, night: chk.period === 'night', rng: rng,
        partySide: { partyId: g.partyId || null, characterIds: g.characterIds.slice() } });   // E4m — quarry exclusion
      if(!draw || draw.category === 'no-encounter') continue;
      if(draw.category !== 'monster' && draw.category !== 'civilized') continue;  // resting demotes terrain finds (belt + braces)
      const encId = _mintEncounterProposalId(campaign, rng, takenIds);
      const party = g.partyId ? (campaign.parties || []).find(p => p && p.id === g.partyId) : null;
      const firstCh = (campaign.characters || []).find(c => c && c.id === g.characterIds[0]);
      const who = (party && party.name) || (firstCh && firstCh.name) || 'A camped group';
      const prop = draw.proposal || null;
      const ir = draw.identityRoll || null, bind = draw.binding || null;
      let what;
      if(ir){
        // E4 — the table named them; say what the commit will do (ratify-informed).
        const mName = (ir.key && typeof A.monsterDisplayName === 'function' && A.monsterDisplayName(ir.key)) || ir.label || 'creatures';
        const n = bind && bind.count;
        if(!ir.key) what = ir.label + ' (rolled ' + ir.natural + ' — GM details the specifics) — GM, resolve';
        else if(bind && bind.mode === 'existing-lair') what = mName + ' — their lair is in this hex; GM, resolve';
        else if(bind && bind.mode === 'fragment') what = (n ? n + ' ' : '') + mName.toLowerCase() + (n === 1 ? '' : 's') + ' out from their lair here — GM, resolve';
        else if(bind && (bind.mode === 'populate-shell' || bind.mode === 'fresh-lair' || bind.mode === 'reveal-dynamic'))
          what = mName + ' in their lair — the den materializes here at commit; GM, resolve';
        else if(bind && bind.mode === 'loose-band')
          what = (n ? n + ' ' : '') + mName.toLowerCase() + (n === 1 ? '' : 's') + ' — ' + _looseBandMetText(campaign, bind) + ' — GM, resolve';
        else what = (n ? n + ' ' : '') + mName + (bind && bind.inLair ? ' at their dwelling' : ' (wandering)') + ' — GM, resolve';
      }
      else if(draw.category === 'civilized') what = 'civilized visitors — GM, pick who';
      else if(prop && prop.source === 'existing-lair'){
        const mName = (typeof A.monsterDisplayName === 'function' && A.monsterDisplayName(prop.contents.monsterCatalogKey)) || 'creatures';
        what = prop.encounterKind === 'wandering-fragment'
          ? (mName + ' out from their lair — GM, resolve')
          : (mName + ' — their lair is in this hex; GM, resolve');
      }
      else if(prop && prop.source === 'seeded-shell') what = 'something from one of this hex’s unauthored lairs — GM, populate + resolve';
      else what = (/^[aeiou]/.test(draw.rarity || '') ? 'an ' : 'a ') + (draw.rarity ? (draw.rarity + ' ') : '') + 'monster — GM, pick the creature (catalog)';
      const label = who + ': ' + (chk.period === 'night' ? 'night' : 'daytime') + ' camp encounter — ' + what;
      pendingRecords.push({
        kind: 'rest-encounter', label: label,
        encounterId: encId, hexId: g.hexId, partyId: g.partyId, characterIds: g.characterIds.slice(),
        period: chk.period, territoryClass: territory, dayInMonth: dayInMonth,
        draw: { hexId: draw.hexId, territoryClass: draw.territoryClass, columnKey: draw.columnKey,
                category: draw.category, rarity: draw.rarity, identity: draw.identity,
                identityRoll: ir, binding: bind,
                proposal: prop ? { source: prop.source, lairId: prop.lairId || null,
                                   encounterKind: prop.encounterKind || null, fragment: prop.fragment || null,
                                   contents: prop.contents || null,
                                   candidateLairIds: prop.candidates ? prop.candidates.map(l => l.id) : null } : null },
        primaryHexId: g.hexId
      });
      // The notable pauses the tick (auto-pause-on-encounter) and emits via the gm-narrative
      // fallback, campaignLogHidden — the entity + its eventual encounter-resolved narrate the
      // story; this line keeps the Event Log + hex/character histories complete.
      notableEvents.push({
        type: 'encounter', pauseTrigger: 'encounter', primaryHexId: g.hexId,
        campaignLogHidden: true,
        relatedEntities: g.characterIds.map(id => ({ kind: 'character', id: id, role: 'subject' }))
          .concat(g.partyId ? [{ kind: 'party', id: g.partyId, role: 'subject' }] : []),
        label: label,
        payload: { encounterId: encId, hexId: g.hexId, period: chk.period, category: draw.category, rarity: draw.rarity || null, narrative: label }
      });
    }
  }
  return { pendingRecords, notableEvents, encounters };
}

// Apply a ratified rest-encounter record: materialize the Encounter entity (id-idempotent —
// safe across the propose pass's working-copy commit and the real commit).
function commitEncounterRecord(campaign, record){
  if(!campaign || !record || record.kind !== 'rest-encounter' || !record.draw) return;
  const A = _jACKS();
  if(typeof A.createEncounterFromDraw !== 'function') return;
  A.createEncounterFromDraw(campaign, record.draw, {
    id: record.encounterId, trigger: 'rest-night',
    partySide: { partyId: record.partyId || null, journeyId: null,
                 characterIds: (record.characterIds || []).slice(),
                 faceCharacterId: null,
                 sizeCount: (record.characterIds || []).length || 1 },
    // 🔧 moon phase is GM detail — a night check defaults to full-moon visibility; the GM
    // refines light on the entity (E2's surface offers the pick).
    light: record.period === 'night' ? 'full-moon' : 'daylight',
    onDayInMonth: record.dayInMonth
  });
}

// ── #476 E3c — the 'pursuit' day-consumer (slot 82, right after encounters) ─────────
// Each PURSUING encounter ('monster-pursuit' ON; pursuit.status 'pursuing') advances
// daily: a keep-the-trail Tracking throw (RR p.120 — 11+, the party-size count bands,
// natural 1 fails, ± the pursuit's standing GM modifier) and a gap update — the
// party's straight-line hex movement ×6 mi vs the pursuer's half-expedition-speed
// (🔧 v1: straight-line distance, not the walked path; the trail's water/rain·snow
// breaks + Passing Without Trace are GM levers — the standing modifier + the
// trace-concealed tick). Lost → the encounter resolves 'evaded'. Caught (gap ≤ 0) →
// a FRESH encounter at the party's hex (trigger 'pursuit', distance pre-rolled with
// the seeded rng so previews are byte-stable); the old one resolves 'evaded' and
// priorReactionBetween recalls it (D9). The handler is PURE (the day-tick working
// copy); commitPursuitRecord applies the ratified record.
function _pursuingEncounters(campaign){
  return ((campaign && campaign.encounters) || []).filter(e => e && e.status === 'active' && e.pursuit && e.pursuit.status === 'pursuing');
}
function proposePursuitDay(campaign, ctx){
  const pendingRecords = [], notableEvents = [];
  if(!campaign) return { pendingRecords, notableEvents };
  ctx = ctx || {};
  const A = _jACKS();
  const dayInMonth = (typeof ctx.dayInMonth === 'number') ? ctx.dayInMonth : ((campaign.currentDayInMonth || 1) + 1);
  const worldOrd = ((campaign.currentTurn || 1) * 30) + dayInMonth;
  const takenIds = {};
  for(const enc of _pursuingEncounters(campaign)){
    const pur = enc.pursuit;
    const rng = ctx.rng || _jMulberry32(_jHash32('pursuit|' + enc.id + '|' + worldOrd));
    if(pur.traceConcealed){
      const label = pur.pursuerLabel + ' loses the trail — concealed (Passing Without Trace).';
      pendingRecords.push({ kind: 'pursuit-day', label, encounterId: enc.id, outcome: 'lost',
        reason: 'trace concealed (Passing Without Trace)', dayInMonth, primaryHexId: enc.hexId });
      notableEvents.push({ type: 'pursuit-lost', primaryHexId: enc.hexId, campaignLogHidden: true,
        relatedEntities: ((enc.partySide && enc.partySide.characterIds) || []).map(id => ({ kind: 'character', id, role: 'subject' })),
        label, payload: { encounterId: enc.id, narrative: label } });
      continue;
    }
    // keep-the-trail (RR p.120): 11+, the party-size count bands, natural 1 fails.
    const n = (enc.partySide && (enc.partySide.sizeCount || ((enc.partySide.characterIds || []).length))) || 1;
    const countBonus = (n >= 17) ? 8 : (n > 8) ? 6 : (n > 4) ? 4 : (n >= 2) ? 2 : 0;
    const mod = Number(pur.gmMod) || 0;
    const natural = 1 + Math.floor(rng() * 20);
    const total = natural + countBonus + mod;
    const success = (natural !== 1) && (total >= 11);
    const newHexId = (typeof A.encounterPartyHexId === 'function') ? A.encounterPartyHexId(campaign, enc) : enc.hexId;
    const oldHexId = pur.lastPartyHexId || newHexId;
    const hexes = campaign.hexes || [];
    const oldHex = hexes.find(h => h && h.id === oldHexId);
    const newHex = hexes.find(h => h && h.id === newHexId);
    const partyMiles = (oldHex && newHex && oldHex !== newHex && typeof A.hexAxialDistance === 'function')
      ? (A.hexAxialDistance(oldHex.coord || oldHex, newHex.coord || newHex) || 0) * 6 : 0;
    const pursuerMiles = pur.pursuerMilesPerDay || 12;
    const gapBefore = Number(pur.gapMiles) || 0;
    const rawGap = gapBefore + partyMiles - pursuerMiles;
    const caught = success && rawGap <= 0;
    const gapAfter = Math.max(0, rawGap);
    const outcome = !success ? 'lost' : (caught ? 'caught' : 'tracking');
    let caughtEncounterId = null, caughtDistance = null;
    if(caught){
      caughtEncounterId = _mintEncounterProposalId(campaign, rng, takenIds);
      // pre-roll the fresh meeting's distance with the seeded rng (byte-stable previews)
      const rowKey = newHex && typeof A.encounterRowKeyForHex === 'function' ? A.encounterRowKeyForHex(newHex) : null;
      if(rowKey && typeof A.computeEncounterDistance === 'function'){
        caughtDistance = A.computeEncounterDistance({ terrainRow: rowKey, light: 'daylight',
          sideACount: n, sideBCount: (enc.monsterSide && enc.monsterSide.count) || 1, rng });
      }
    }
    const throwText = (natural === 1 ? 'natural 1' : (total + ' vs 11+'));
    const label = !success
      ? (pur.pursuerLabel + ' loses the trail (' + throwText + ').')
      : caught
        ? ('🐺 ' + pur.pursuerLabel + ' catches up — a fresh encounter at the party\'s hex!')
        : (pur.pursuerLabel + ' holds the trail (' + throwText + ') — ' + gapAfter + ' mi behind.');
    pendingRecords.push({
      kind: 'pursuit-day', label, encounterId: enc.id, outcome,
      trailThrow: { natural, countBonus, mod, total, target: 11, success },
      partyMiles, pursuerMiles, gapBefore, gapAfter, newPartyHexId: newHexId,
      caughtEncounterId, caughtDistance, dayInMonth, primaryHexId: newHexId
    });
    notableEvents.push({
      type: caught ? 'encounter' : (success ? 'pursuit-day' : 'pursuit-lost'),
      pauseTrigger: caught ? 'encounter' : undefined,
      primaryHexId: newHexId, campaignLogHidden: true,
      relatedEntities: ((enc.partySide && enc.partySide.characterIds) || []).map(id => ({ kind: 'character', id, role: 'subject' }))
        .concat((enc.partySide && enc.partySide.partyId) ? [{ kind: 'party', id: enc.partySide.partyId, role: 'subject' }] : []),
      label, payload: { encounterId: enc.id, caughtEncounterId, outcome, narrative: label }
    });
  }
  // ── E5 — the follows (direction 'party'): the quarry walks its plan, the RAW loss events
  // break the trail, the catch springs the meeting. Computed from start-of-day state (the
  // E3c lag convention); _commitTrackingRecord applies the recorded absolutes. ──
  for(const enc of _trackingEncounters(campaign)){
    const pur = enc.pursuit;
    const rng = ctx.rng || _jMulberry32(_jHash32('tracking|' + enc.id + '|' + worldOrd));
    const A2 = _jACKS();
    const q0 = JSON.parse(JSON.stringify(pur.quarry || {}));
    // A quarry whose Group settled into a living den mid-follow is home — the world's truth wins.
    if(q0.groupId){
      const den = (campaign.lairs || []).find(l => l && (l.status === 'active' || l.status === 'unknown') && (l.groupIds || []).indexOf(q0.groupId) >= 0);
      const dh = (den && den.hexId) ? ((campaign.hexes || []).find(h => h && h.id === den.hexId) || null) : null;
      if(den && dh && dh.coord){
        q0.halted = true; q0.destLairId = den.id;
        q0.destCoord = { q: dh.coord.q, r: dh.coord.r };
        q0.coord = { q: dh.coord.q, r: dh.coord.r };
        q0.hexId = den.hexId;
      }
    }
    const walk = trackingQuarryWalkDay(campaign, q0, rng);
    // Loss events (RR p.120): ONE hour of rain/snow destroys the trail; so does the trail
    // entering water. Either forces a fresh find throw ("must search again"). The day's
    // condition comes from the day-tick ctx when the weather layer supplies it (T4); the
    // GM's weatherLostPending lever asserts the rain/snow day until then.
    const cond = (ctx.weather && ctx.weather.condition) || null;
    const rainDay = pur.weatherLostPending === true || cond === 'rainy' || cond === 'snowy' || cond === 'stormy';
    let refind = null, lossCause = null, outcome = 'tracking';
    if(rainDay || walk.waterCrossed){
      lossCause = rainDay ? 'rain' : 'water';
      refind = (typeof A2.trackingFindThrow === 'function')
        ? A2.trackingFindThrow({ ranks: pur.trackerRanks, countTracked: pur.countTracked,
                                 rainHours: rainDay ? 1 : 0, gmMod: pur.gmMod, rng: rng })
        : { natural: 20, target: 11, modifiers: [], total: 20, success: true };
      if(!refind.success) outcome = 'lost';
    }
    // Caught — the trackers stand where the quarry now is.
    const partyCoord = _trackingPartyCoord(campaign, pur);
    const gapHexes = (partyCoord && q0.coord && typeof A2.hexAxialDistance === 'function') ? A2.hexAxialDistance(partyCoord, q0.coord) : null;
    const gapMiles = (gapHexes == null) ? null : gapHexes * 6;
    if(outcome === 'tracking' && gapHexes === 0) outcome = 'caught';
    let caughtEncounterId = null, caughtDistance = null;
    if(outcome === 'caught'){
      caughtEncounterId = _mintEncounterProposalId(campaign, rng, takenIds);
      const qHex = q0.hexId ? (campaign.hexes || []).find(h => h && h.id === q0.hexId) : null;
      const rowKey = qHex && typeof A2.encounterRowKeyForHex === 'function' ? A2.encounterRowKeyForHex(qHex) : null;
      const denCatch = !!(q0.destLairId && q0.halted && q0.destCoord && q0.coord && q0.coord.q === q0.destCoord.q && q0.coord.r === q0.destCoord.r);
      let sideB = pur.countTracked || 1;
      if(denCatch){
        const den = (typeof A2.findLair === 'function') ? A2.findLair(campaign, q0.destLairId) : null;
        if(den && typeof A2.lairInhabitantCount === 'function') sideB = A2.lairInhabitantCount(campaign, den) || sideB;
      }
      const jt = pur.journeyId ? ((campaign.journeys || []).find(x => x && x.id === pur.journeyId) || null) : null;
      const nTrackers = (jt && (jt.participantCharacterIds || []).length) || 1;
      if(rowKey && typeof A2.computeEncounterDistance === 'function'){
        caughtDistance = A2.computeEncounterDistance({ terrainRow: rowKey, light: 'daylight', sideACount: nTrackers, sideBCount: sideB, rng: rng });
      }
    }
    const tn = pur.trackerName || 'The trackers';
    const ql = pur.quarryLabel || 'the band';
    const refindText = refind ? ((lossCause === 'rain' ? 'rain/snow washed the trail' : 'the trail entered water')
      + ' — re-find ' + (refind.natural === 1 ? 'natural 1' : (refind.total + ' vs 11+')) + (refind.success ? ' ✓' : ' ✗')) : null;
    const label = outcome === 'lost'
      ? ('🐾 ' + tn + ' loses the trail of ' + ql + ' — ' + refindText + '.')
      : outcome === 'caught'
        ? ('🐾 ' + tn + ' — caught up with ' + ql + ': a fresh encounter at its hex!')
        : ('🐾 on the trail of ' + ql + (refindText ? (' (' + refindText + ')') : '')
           + (walk.camped ? ' — the band camps' : (walk.arrived ? ' — the band has gone to ground' : ''))
           + ((gapMiles != null) ? (' — ' + gapMiles + ' mi behind.') : '.'));
    pendingRecords.push({
      kind: 'tracking-day', label, encounterId: enc.id, outcome,
      refind, lossCause,
      newQuarry: q0, quarryWalk: { moved: walk.moved, camped: walk.camped, arrived: walk.arrived, waterCrossed: walk.waterCrossed },
      gapMiles, newDestinationHexId: (outcome === 'tracking' && q0.hexId) ? q0.hexId : null,
      caughtEncounterId, caughtDistance, dayInMonth, primaryHexId: q0.hexId || enc.hexId || null
    });
    const j2 = pur.journeyId ? ((campaign.journeys || []).find(x => x && x.id === pur.journeyId) || null) : null;
    notableEvents.push({
      type: outcome === 'caught' ? 'encounter' : (outcome === 'lost' ? 'tracking-lost' : 'tracking-day'),
      pauseTrigger: outcome === 'caught' ? 'encounter' : (outcome === 'lost' ? 'navigation-fail' : undefined),
      primaryHexId: q0.hexId || enc.hexId || null, campaignLogHidden: true,
      relatedEntities: ((j2 && j2.participantCharacterIds) || [pur.trackerCharacterId]).filter(Boolean).map(id => ({ kind: 'character', id, role: 'subject' }))
        .concat(pur.trackerPartyId ? [{ kind: 'party', id: pur.trackerPartyId, role: 'subject' }] : []),
      label, payload: { encounterId: enc.id, caughtEncounterId, outcome, narrative: label }
    });
  }
  return { pendingRecords, notableEvents };
}
function commitPursuitRecord(campaign, record){
  if(record && record.kind === 'tracking-day') return _commitTrackingRecord(campaign, record);   // E5 — the follow's day
  const A = _jACKS();
  const enc = ((campaign && campaign.encounters) || []).find(e => e && e.id === record.encounterId);
  if(!enc || !enc.pursuit) return;
  const pur = enc.pursuit;
  if(record.trailThrow){
    pur.throws.push(Object.assign({ kind: 'keep-trail', atTurn: campaign.currentTurn || 1, atDay: record.dayInMonth || null }, record.trailThrow));
  }
  if(record.outcome === 'lost'){
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-lost',
      reason: record.reason || ((record.trailThrow && record.trailThrow.natural === 1) ? 'natural 1 — the trail is gone' : 'the trail is gone') });
    if(typeof A.recordEncounterResolved === 'function')
      A.recordEncounterResolved(campaign, enc.id, 'evaded', { note: 'The pursuit lost the trail' + (record.reason ? ' — ' + record.reason : '') + '.' });
    // E6 — the hunt over, the band turns for home (or, denless, becomes a wandering
    // migrant). 🔧 v1 position: the chase model is straight-line gapMiles behind the
    // party, so the band stands at the trail's anchor hex when the trail goes cold.
    if(typeof A.pursuitAftermath === 'function')
      A.pursuitAftermath(campaign, enc, { hexId: record.newPartyHexId || pur.lastPartyHexId || enc.hexId });
    return;
  }
  pur.gapMiles = record.gapAfter;
  pur.lastPartyHexId = record.newPartyHexId;
  if(record.outcome === 'caught'){
    // The fresh meeting at the party's hex — the same sides. The monster side carries
    // pursuitEncounterId = the chase it sprang from (E4m), so priorReactionBetween
    // recalls the evaded meeting (D9) even for a den-less, group-less band — and any
    // lair/Group refs ride along as before.
    const fresh = (typeof A.createEncounter === 'function') ? A.createEncounter(campaign, {
      id: record.caughtEncounterId || undefined,
      trigger: 'pursuit', hexId: record.newPartyHexId,
      category: enc.category || 'monster', rarity: enc.rarity || null,
      partySide: {
        partyId: (enc.partySide && enc.partySide.partyId) || null,
        journeyId: (enc.partySide && enc.partySide.journeyId) || null,
        characterIds: ((enc.partySide && enc.partySide.characterIds) || []).slice(),
        faceCharacterId: (enc.partySide && enc.partySide.faceCharacterId) || null,
        sizeCount: (enc.partySide && enc.partySide.sizeCount) || null
      },
      monsterSide: Object.assign({}, enc.monsterSide, { groupIds: ((enc.monsterSide && enc.monsterSide.groupIds) || []).slice(), pursuitEncounterId: enc.id }),
      createReason: 'pursuit-caught-up',
      occurredOnDayInMonth: record.dayInMonth || null
    }) : null;
    if(fresh && record.caughtDistance && fresh.distance == null){
      fresh.distance = record.caughtDistance;
      fresh.history.push({ turn: fresh.occurredAtTurn, type: 'distance',
        reason: (record.caughtDistance.distanceFt != null ? record.caughtDistance.distanceFt : '?') + ' ft (' + (record.caughtDistance.terrainRow || 'terrain') + ')' });
    }
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-caught',
      reason: pur.pursuerLabel + ' caught up' + (fresh ? ' — fresh encounter ' + fresh.id : '') });
    if(typeof A.recordEncounterResolved === 'function')
      A.recordEncounterResolved(campaign, enc.id, 'evaded', { note: 'The pursuer caught up — a fresh encounter springs at the party\'s hex.' });
    return;
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-day',
    reason: 'trail held (' + (record.trailThrow ? record.trailThrow.total + ' vs 11+' : '—') + ') — ' + record.gapAfter + ' mi behind (party +' + record.partyMiles + ' / pursuer −' + record.pursuerMiles + ')' });
}

// ── #476 E5 — the party-direction follow (the same slot-82 consumer; pursuit.direction
// 'party' — the E3c chase's mirror). One day of a follow: the quarry walks its plan, the
// RAW loss events break the trail (RR p.120 — ONE hour of rain/snow, or the trail entering
// water; either forces a fresh find throw, "must search again"), FOLLOWING itself needs no
// throw, and a catch — the trackers standing where the quarry is — springs a fresh meeting
// at its hex. Handlers are PURE; commit applies the recorded absolutes. ──
function _trackingEncounters(campaign){
  return ((campaign && campaign.encounters) || []).filter(e => e && e.pursuit && e.pursuit.direction === 'party' && e.pursuit.status === 'tracking');
}
// Where the trackers ARE (their journey's physical position — the §27 stray anchor when
// off-route, else the current/start hex; a journeyless tracker reads from the character).
function _trackingPartyCoord(campaign, pur){
  const j = pur.journeyId ? ((campaign.journeys || []).find(x => x && x.id === pur.journeyId) || null) : null;
  if(j){
    if(j.routeAnchorCoord && typeof j.routeAnchorCoord.q === 'number') return { q: j.routeAnchorCoord.q, r: j.routeAnchorCoord.r };
    const hid = j.currentHexId || j.startHexId || null;
    const hx = hid ? ((campaign.hexes || []).find(h => h && h.id === hid) || null) : null;
    if(hx && hx.coord) return { q: hx.coord.q, r: hx.coord.r };
  }
  const ch = (campaign.characters || []).find(x => x && x.id === pur.trackerCharacterId);
  const hx2 = (ch && ch.currentHexId) ? ((campaign.hexes || []).find(h => h && h.id === ch.currentHexId) || null) : null;
  return (hx2 && hx2.coord) ? { q: hx2.coord.q, r: hx2.coord.r } : null;
}
// E6 — one 6-mile wander step: a random face, never directly back into the hex just left
// (Joachim 2026-06-11: "The movement is random, but wandering never goes directly back to
// the hex from where it just came from"). Shared by the quarry walk + the band consumer.
function _wanderPickStep(cur, last, rng, allow){
  const pick = (excludeBack) => {
    const opts = [];
    for(let d = 0; d < 6; d++){
      const dd = HEX_EDGE_DELTAS[d] || [0, 0];
      const c = { q: cur.q + dd[0], r: cur.r + dd[1] };
      if(excludeBack && last && c.q === last.q && c.r === last.r) continue;
      if(allow && !allow(c)) continue;
      opts.push(c);
    }
    return opts;
  };
  let opts = pick(true);
  // E10 — a FENCED walk (a banditry band raids within its domain) may find only the
  // back-face left (a dead-end spur): doubling back beats leaving the domain. Unfenced
  // walks never retry — a hex always has 5 non-back faces, so the rng stream is unchanged.
  if(!opts.length && allow) opts = pick(false);
  if(!opts.length) return null;
  return opts[Math.floor((rng || Math.random)() * opts.length)];
}
// One day of the quarry's walk (MUTATES the quarry object passed — the propose path clones
// first; beginTracking uses it directly for the trail-age head start). 🔧 v1: a straight
// hex-line at 6 mi per hex regardless of terrain (catalog expedition speeds already average
// a terrain mix); flags — does not resolve — the RAW water loss (a river edge crossed or a
// water hex entered on the quarry's path; the consumer answers it with the re-find throw).
// A destination-less quarry WANDERS (E6 — the migration movement): half expedition speed
// is set at begin; each step picks via _wanderPickStep against quarry.lastCoord. The rng
// is required for the wander steps (the consumer passes its seeded stream; legacy quarries
// with a stored straight heading walk it only when no rng is given).
function trackingQuarryWalkDay(campaign, quarry, rng){
  const A = _jACKS();
  const out = { moved: 0,
                fromCoord: { q: (quarry.coord && quarry.coord.q) || 0, r: (quarry.coord && quarry.coord.r) || 0 },
                toCoord: null, path: [], waterCrossed: false, camped: false, arrived: false };
  if(quarry.halted){ out.toCoord = out.fromCoord; return out; }
  const MILES_PER_HEX = 6;
  let budget = (Number(quarry.milesPerDay) || 0) + (Number(quarry.mileRemainder) || 0);
  let cur = { q: out.fromCoord.q, r: out.fromCoord.r };
  let last = (quarry.lastCoord && typeof quarry.lastCoord.q === 'number') ? { q: quarry.lastCoord.q, r: quarry.lastCoord.r } : null;
  const atDest = c => !!(quarry.destCoord && c.q === quarry.destCoord.q && c.r === quarry.destCoord.r);
  // E10 — a tracked morale-banditry band keeps to its domain (the fenced wander).
  const qGroup = quarry.groupId ? (((campaign && campaign.groups) || []).find(x => x && x.id === quarry.groupId) || null) : null;
  const qFence = (qGroup && qGroup.banditryDomainId)
    ? (c => { const hx = A.hexAtCoord(campaign, c.q, c.r); return !!(hx && hx.domainId === qGroup.banditryDomainId); })
    : null;
  while(budget >= MILES_PER_HEX && !atDest(cur)){
    let next = null;
    if(quarry.destCoord){
      const line = hexLineDraw(cur, quarry.destCoord);
      next = (line.length > 1) ? line[1] : null;
    } else if(rng){
      next = _wanderPickStep(cur, last, rng, qFence);   // E6 — the wander activity (E10 — fenced for banditry)
    } else if(typeof quarry.heading === 'number'){
      // pre-E6 follows persisted a straight heading — honored only on rng-less calls
      const d = HEX_EDGE_DELTAS[((quarry.heading % 6) + 6) % 6] || [0, 0];
      next = { q: cur.q + d[0], r: cur.r + d[1] };
    }
    if(!next) break;
    const fromHex = A.hexAtCoord(campaign, cur.q, cur.r);
    const toHex = A.hexAtCoord(campaign, next.q, next.r);
    const side = hexEdgeBetween(cur, next);
    const crossing = riverCrossingForStep(fromHex, toHex, side >= 0 ? side : null);
    if((crossing && crossing.barrier) || (toHex && toHex.terrain === 'water')) out.waterCrossed = true;
    last = cur; cur = next; out.moved++; budget -= MILES_PER_HEX;
    out.path.push({ q: cur.q, r: cur.r });
  }
  quarry.mileRemainder = atDest(cur) ? 0 : Math.max(0, budget);
  quarry.coord = { q: cur.q, r: cur.r };
  quarry.lastCoord = last ? { q: last.q, r: last.r } : (quarry.lastCoord || null);
  const hx = A.hexAtCoord(campaign, cur.q, cur.r);
  quarry.hexId = hx ? hx.id : null;
  if(atDest(cur)){ quarry.halted = true; out.arrived = true; }
  if(!quarry.halted && quarry.walkDaysLeft != null){
    quarry.walkDaysLeft = Math.max(0, quarry.walkDaysLeft - 1);
    if(quarry.walkDaysLeft === 0){ quarry.halted = true; out.camped = true; }
  }
  out.toCoord = { q: cur.q, r: cur.r };
  return out;
}
// Steer the follow's journey to the trail head WITHOUT the journey-rerouted ceremony (the
// daily pursuit notable narrates the day; a journey-rerouted event per day would spam the
// log). The reRouteJourney core minus the event/history — and minus the lost-state reset:
// the trail steering must not silently re-orient a party that is genuinely lost.
function _quietRetargetJourney(campaign, j, destHexId){
  if(!j || !destHexId || j.destinationHexId === destHexId) return;
  if(j.status === 'arrived') j.status = 'in-transit';   // the quarry moved on — the follow resumes
  j.destinationHexId = destHexId;
  const totalCovered = (j.days || []).reduce((s, d) => s + ((d && d.hexesTraveled) || 0), 0);
  if((j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost') && totalCovered > 0 && j.currentHexId){
    j.routeAnchorHexId = j.currentHexId;   // the route continues from where the party is
    j.coveredBaseline = totalCovered;
  }
  try { j.routeCoords = journeyRoute(campaign, j).map(s => s.coord); } catch(e){ /* keep prior snapshot */ }
  const dist = computeJourneyDistance(campaign, j);
  j.daysRemainingEstimate = dist.total > 0 ? Math.max(1, Math.ceil(dist.remaining / 4)) : 0;
}
// The shared catch — beginTracking's same-hex immediate case + the consumer's commit.
// Springs the fresh meeting at the quarry's hex (trigger 'pursuit', createReason
// 'tracking-caught-up', monsterSide.pursuitEncounterId → D9 recalls the tracked meeting);
// a quarry caught AT its den is an at-lair meeting against the den's living population,
// and the arrival IS the discovery (discoverLair method 'tracking' + the chronicle
// record). opts: { caughtEncounterId?, caughtDistance?, dayInMonth?, rng? }.
function trackingSpringCatch(campaign, enc, opts){
  const A = _jACKS();
  const o = opts || {};
  const pur = enc.pursuit || {};
  const q = pur.quarry || {};
  const ms = enc.monsterSide || {};
  const rng = o.rng || Math.random;
  let lair = null, denCatch = false;
  if(q.destLairId && q.halted && q.destCoord && q.coord && q.coord.q === q.destCoord.q && q.coord.r === q.destCoord.r){
    lair = (typeof A.findLair === 'function') ? A.findLair(campaign, q.destLairId) : null;
    if(lair) denCatch = true;
  }
  if(denCatch && lair && !lair.knownToPlayers){
    if(typeof A.discoverLair === 'function') A.discoverLair(campaign, lair.id, { by: pur.trackerCharacterId || null, method: 'tracking' });
    if(typeof A.recordLairDiscovered === 'function') A.recordLairDiscovered(campaign, lair.id, { byCharacterId: pur.trackerCharacterId || null, method: 'track-home' });
  }
  const j = pur.journeyId ? ((campaign.journeys || []).find(x => x && x.id === pur.journeyId) || null) : null;
  const trackerIds = (j && (j.participantCharacterIds || []).length) ? j.participantCharacterIds.slice() : [pur.trackerCharacterId].filter(Boolean);
  const aliveOf = g => (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
  const grp = q.groupId ? ((campaign.groups || []).find(x => x && x.id === q.groupId) || null) : null;
  const count = denCatch
    ? ((lair && typeof A.lairInhabitantCount === 'function') ? (A.lairInhabitantCount(campaign, lair) || ms.count || null) : (ms.count || null))
    : (grp ? aliveOf(grp) : ((pur.countTracked || ms.count) || null));
  // Distance pre-rolled by the consumer (byte-stable previews); the immediate path rolls here.
  let distance = o.caughtDistance || null;
  if(!distance && q.hexId){
    const qHex = (campaign.hexes || []).find(h => h && h.id === q.hexId) || null;
    const rowKey = (qHex && typeof A.encounterRowKeyForHex === 'function') ? A.encounterRowKeyForHex(qHex) : null;
    if(rowKey && typeof A.computeEncounterDistance === 'function'){
      distance = A.computeEncounterDistance({ terrainRow: rowKey, light: 'daylight',
        sideACount: trackerIds.length || 1, sideBCount: count || 1, rng });
    }
  }
  const fresh = (typeof A.createEncounter === 'function') ? A.createEncounter(campaign, {
    id: o.caughtEncounterId || undefined,
    trigger: 'pursuit', hexId: q.hexId || null,
    category: enc.category || 'monster', rarity: enc.rarity || null,
    partySide: { partyId: pur.trackerPartyId || null, journeyId: pur.journeyId || null,
                 characterIds: trackerIds, faceCharacterId: null, sizeCount: trackerIds.length || 1 },
    monsterSide: Object.assign({}, ms, {
      groupIds: grp ? [grp.id] : ((ms.groupIds || []).slice()),
      pursuitEncounterId: enc.id,
      encounterKind: denCatch ? 'at-lair' : 'wandering',
      lairId: denCatch ? lair.id : (ms.lairId || null),
      count: count
    }),
    createReason: 'tracking-caught-up',
    occurredOnDayInMonth: (o.dayInMonth != null) ? o.dayInMonth : (campaign.currentDayInMonth || null)
  }) : null;
  if(fresh && distance && fresh.distance == null){
    fresh.distance = distance;
    fresh.history.push({ turn: fresh.occurredAtTurn, type: 'distance',
      reason: (distance.distanceFt != null ? distance.distanceFt : '?') + ' ft (' + (distance.terrainRow || 'terrain') + ')' });
  }
  pur.status = 'caught';
  enc.history = enc.history || [];
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'tracking-caught',
    reason: 'the trackers caught up with ' + (pur.quarryLabel || 'the band')
      + (denCatch ? (' at its lair — ' + ((lair && lair.name) || 'the den') + ' discovered') : '')
      + (fresh ? (' — fresh encounter ' + fresh.id) : '') });
  return { encounter: fresh, denCatch: denCatch, lair: lair || null };
}
// Commit half of a follow's day (dispatched from commitPursuitRecord on kind 'tracking-day').
function _commitTrackingRecord(campaign, record){
  const enc = ((campaign && campaign.encounters) || []).find(e => e && e.id === record.encounterId);
  if(!enc || !enc.pursuit || enc.pursuit.direction !== 'party') return;
  const pur = enc.pursuit;
  if(record.refind){
    pur.throws.push(Object.assign({ kind: 're-find', cause: record.lossCause || null,
      atTurn: campaign.currentTurn || 1, atDay: record.dayInMonth || null }, record.refind));
  }
  pur.weatherLostPending = false;   // the GM's rain lever is one-shot — consumed by this day
  if(record.newQuarry) pur.quarry = JSON.parse(JSON.stringify(record.newQuarry));
  const q = pur.quarry || {};
  // A tracked migrant Group moves with the follow (the world stays consistent — E4m).
  if(q.groupId && q.hexId){
    const g = (campaign.groups || []).find(x => x && x.id === q.groupId);
    if(g) g.currentHexId = q.hexId;
  }
  enc.history = enc.history || [];
  if(record.outcome === 'lost'){
    pur.status = 'lost';
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'tracking-lost',
      reason: (record.lossCause === 'rain' ? 'an hour of rain/snow washed out the trail (RR p.120)' : 'the trail entered water (RR p.120)')
        + ' — the re-find failed; the follow ends' });
    return;
  }
  if(record.newDestinationHexId && pur.journeyId){
    const j = (campaign.journeys || []).find(x => x && x.id === pur.journeyId);
    if(j) _quietRetargetJourney(campaign, j, record.newDestinationHexId);
  }
  if(record.outcome === 'caught'){
    trackingSpringCatch(campaign, enc, { caughtEncounterId: record.caughtEncounterId,
      caughtDistance: record.caughtDistance, dayInMonth: record.dayInMonth });
    return;
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'tracking-day',
    reason: 'on the trail' + ((record.gapMiles != null) ? (' — ' + record.gapMiles + ' mi behind') : '')
      + (record.quarryWalk && record.quarryWalk.camped ? ' (the band camps)' : '')
      + (record.refind ? ' (trail re-found)' : '') });
}

// ── #476 E6 — the 'monster-bands' day-consumer (slot 84): autonomous band motion ─────
// Joachim 2026-06-11: "Monster movement: Wander activity. Monsters utilize this type of
// movement when they are migrating. Wandering movement is at half-speed. The movement is
// random, but wandering never goes directly back to the hex from where it just came from.
// … If monsters wander into a Domain, they basically act like in Vagaries of Incursion
// (their entry is counted as a positive occurrence of the Daily Domain Encounter
// Probability). On entry, they roll according to JJ p.103 to determine their disposition.
// … Monsters on their way home do not stop or change their behaviour even if they run
// into a domain."
// Two motions, both read off looseMonsterBands (the ONE roster, so what the dice can find
// is exactly what moves):
//   • migrant — WANDERS: half expedition speed, each 6-mile step a random face, never
//     directly back. Entering a DOMAIN (a border crossing onto a domainId hex) rolls the
//     JJ p.103 disposition at once — linger (1d100 ≤ Lair %) → the band settles AS a den
//     at the entry hex (the E3a/E4m adopt mechanics: the den binds THE Group, full
//     strength gathers it to the rolled lair count, hoard only at full strength); migrate
//     → it keeps wandering. The entry is recorded as a positive occurrence of the Daily
//     Domain Encounter Probability — a STUB the Vagaries of Incursion machinery consumes
//     when it lands with the mass-combat phase (Phase 3 Military).
//   • homing — a post-chase band returning to its den (pursuitAftermath): FULL expedition
//     speed, straight line, no stops and NO domain disposition en route (the directive),
//     dissolving into the den on arrival (a transient walk token — the den's population
//     never moved out). Still on the looseMonsterBands roster, so a third party can run
//     into it (E4m) and it can pick up a new pursuit on the way.
// Group walk state lives on group.wanderState (lazy): { coord, lastCoord, mileRemainder,
// mode (null = wandering | 'heading-home'), destLairId, dissolveOnArrival, lastDomainId,
// halted (the GM's parking lever) }. The Group's currentHexId stays the placement truth —
// a GM move (the hex disagreeing with the walk coord) reseeds the walk there; the coord
// carries the band across unauthored hexes where currentHexId goes null.
// Gated on persistent-wandering-monsters (world persistence — default ON; OFF = the
// static shipped world). Handlers PURE (the day-tick working copy); commit replays the
// recorded absolutes.
function _bandExpeditionSpeed(tpl){
  const A = _jACKS();
  const entry = (tpl && tpl.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(tpl.monsterCatalogKey) : null;
  const exp = entry ? parseFloat(String(entry.expeditionSpeed || '')) : NaN;
  return { entry, fullSpeed: (isFinite(exp) && exp > 0) ? exp : 24 };   // 🔧 an unknown creature walks at the human norm
}
function proposeMonsterBandDay(campaign, ctx){
  const pendingRecords = [], notableEvents = [];
  if(!campaign) return { pendingRecords, notableEvents };
  ctx = ctx || {};
  const A = _jACKS();
  if(!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'persistent-wandering-monsters'))) return { pendingRecords, notableEvents };
  if(typeof A.looseMonsterBands !== 'function') return { pendingRecords, notableEvents };
  const dayInMonth = (typeof ctx.dayInMonth === 'number') ? ctx.dayInMonth : ((campaign.currentDayInMonth || 1) + 1);
  const worldOrd = ((campaign.currentTurn || 1) * 30) + dayInMonth;
  const MILES_PER_HEX = 6;
  for(const row of A.looseMonsterBands(campaign)){
    if(row.kind !== 'migrant' && row.kind !== 'homing' && row.kind !== 'banditry') continue;
    const g = (campaign.groups || []).find(x => x && x.id === row.groupId);
    if(!g) continue;
    const ws0 = g.wanderState || {};
    if(ws0.halted) continue;                       // the GM parked the band
    // Position: the Group's hex is the truth when it disagrees with the walk coord (the
    // GM moved the band, or this is its first walk); the coord carries it off-map.
    let coord = (ws0.coord && typeof ws0.coord.q === 'number') ? { q: ws0.coord.q, r: ws0.coord.r } : null;
    let lastCoord = (ws0.lastCoord && typeof ws0.lastCoord.q === 'number') ? { q: ws0.lastCoord.q, r: ws0.lastCoord.r } : null;
    const posHex = g.currentHexId ? ((campaign.hexes || []).find(h => h && h.id === g.currentHexId) || null) : null;
    if(posHex && posHex.coord && (!coord || posHex.coord.q !== coord.q || posHex.coord.r !== coord.r)){
      coord = { q: posHex.coord.q, r: posHex.coord.r };
      lastCoord = null;
    }
    if(!coord) continue;                           // hexless and never walked — nowhere to start
    const homing = row.kind === 'homing';
    // E10 — a morale-banditry band raids WITHIN its domain: the wander is fenced (a step
    // must land on one of the domain's hexes; only the back-face beats leaving), and the
    // domain-entry disposition below never applies (these are the domain's own men, not
    // an incursion — they neither linger-as-a-lair nor count as a Vagaries occurrence).
    const banditry = row.kind === 'banditry';
    const fence = banditry
      ? (c => { const hx = (typeof A.hexAtCoord === 'function') ? A.hexAtCoord(campaign, c.q, c.r) : null; return !!(hx && hx.domainId === row.banditryDomainId); })
      : null;
    const speed = _bandExpeditionSpeed(g.groupTemplate);
    const entry = speed.entry;
    const rng = ctx.rng || _jMulberry32(_jHash32('monster-band|' + g.id + '|' + worldOrd));
    const name = row.label || (entry && entry.name) || g.name || 'A band';
    let destLair = null, destCoord = null;
    if(homing){
      destLair = (typeof A.findLair === 'function') ? A.findLair(campaign, ws0.destLairId) : null;
      const denHex = (destLair && destLair.hexId) ? ((campaign.hexes || []).find(h => h && h.id === destLair.hexId) || null) : null;
      const denLiving = destLair && (destLair.status === 'active' || destLair.status === 'unknown');
      if(!denLiving || !denHex || !denHex.coord){
        // the den died (or lost its place) while they walked — they become migrants and wander
        const label = '🚶 ' + name + ' finds no den left to return to — it becomes a migrant and wanders.';
        pendingRecords.push({ kind: 'monster-band-day', label, groupId: g.id, outcome: 'home-lost',
          path: [], domainEntries: [], settle: null, arrivedHome: null,
          newWanderState: { coord, lastCoord, mileRemainder: Number(ws0.mileRemainder) || 0, mode: null,
                            destLairId: null, dissolveOnArrival: false,
                            lastDomainId: ('lastDomainId' in ws0) ? ws0.lastDomainId : ((posHex && posHex.domainId) || null), halted: false },
          newHexId: g.currentHexId || null, dayInMonth, primaryHexId: g.currentHexId || null });
        continue;
      }
      destCoord = { q: denHex.coord.q, r: denHex.coord.r };
    }
    // ── the day's walk (pre-rolled on the working copy; commit replays the absolutes) ──
    let budget = (homing ? speed.fullSpeed : (speed.fullSpeed / 2)) + (Number(ws0.mileRemainder) || 0);
    let cur = coord, last = lastCoord;
    let curDomain = ('lastDomainId' in ws0) ? (ws0.lastDomainId || null) : (() => {
      const hx = (typeof A.hexAtCoord === 'function') ? A.hexAtCoord(campaign, cur.q, cur.r) : null;
      return (hx && hx.domainId) || null;
    })();
    const path = [], domainEntries = [];
    let arrivedHome = false, settle = null;
    const atDest = c => !!(destCoord && c.q === destCoord.q && c.r === destCoord.r);
    if(homing && atDest(cur)) arrivedHome = true;
    while(budget >= MILES_PER_HEX && !arrivedHome && !settle){
      let next = null;
      if(homing){
        const line = hexLineDraw(cur, destCoord);
        next = (line.length > 1) ? line[1] : null;
      } else {
        next = _wanderPickStep(cur, last, rng, fence);
      }
      if(!next) break;
      last = cur; cur = next; budget -= MILES_PER_HEX;
      path.push({ q: cur.q, r: cur.r });
      const hx = (typeof A.hexAtCoord === 'function') ? A.hexAtCoord(campaign, cur.q, cur.r) : null;
      const dom = (hx && hx.domainId) || null;
      if(homing){
        if(atDest(cur)) arrivedHome = true;        // homers do not stop or change behaviour (E6)
      } else if(!banditry && dom && dom !== curDomain){
        // E6 — wandered INTO a domain (a border crossing): the entry counts as a positive
        // occurrence of the Daily Domain Encounter Probability (Vagaries of Incursion —
        // recorded as a STUB for the mass-combat phase to consume), and the band rolls
        // its JJ p.103 disposition NOW: linger → it settles at the entry hex; migrate →
        // it keeps wandering. E9 — a hex already at its JJ p.69 lair cap never takes the
        // linger roll ("it is simply too crowded for them"): the entry still counts as
        // the day's occurrence, but the band moves on to another hex.
        const capHere = (hx && typeof A.hexLairCapacity === 'function') ? A.hexLairCapacity(campaign, hx.id) : null;
        const hexFull = !!(capHere && capHere.full);
        const pct = (entry && typeof entry.lairPct === 'number') ? entry.lairPct : 0;
        const lingerRoll = hexFull ? null : (1 + Math.floor(rng() * 100));
        const lingers = !hexFull && pct > 0 && lingerRoll <= pct;
        const strengthRoll = hexFull ? null : (1 + Math.floor(rng() * 100));
        const fullStrength = lingers && strengthRoll <= pct;
        const alive = (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
        let fullCount = alive;
        if(fullStrength && entry && entry.numberAppearing){
          const spec = entry.numberAppearing.lair || entry.numberAppearing.wandering || '1';
          const rolled = (typeof A._rollDiceStr === 'function') ? A._rollDiceStr(spec, rng) : alive;
          fullCount = Math.max(alive, rolled);
        }
        domainEntries.push({ domainId: dom, hexId: hx ? hx.id : null, occurrence: true,
                             lingerRoll, lairPct: pct, lingers, strengthRoll, fullStrength,
                             hexFull, lairCap: capHere ? { count: capHere.count, max: capHere.max } : null });
        // W2 interlock — the physical border crossing IS this domain's positive occurrence
        // today: the incursion consumer (slot 86, same tick) reads the stash off the shared
        // day ctx and skips its probability roll (JJ p.103 / E6 — never double-roll).
        if(ctx) (ctx._wanderEntryDomainIds = ctx._wanderEntryDomainIds || []).push(dom);
        if(lingers && hx){
          settle = { hexId: hx.id, fullStrength, count: fullCount,
                     monsterCatalogKey: (g.groupTemplate && g.groupTemplate.monsterCatalogKey) || null };
        }
      }
      curDomain = dom;
    }
    const endHex = (typeof A.hexAtCoord === 'function') ? A.hexAtCoord(campaign, cur.q, cur.r) : null;
    const newWS = { coord: { q: cur.q, r: cur.r }, lastCoord: last ? { q: last.q, r: last.r } : null,
                    mileRemainder: (arrivedHome || settle) ? 0 : Math.max(0, budget),
                    mode: homing ? 'heading-home' : null,
                    destLairId: homing ? (ws0.destLairId || null) : null,
                    dissolveOnArrival: homing ? !!ws0.dissolveOnArrival : false,
                    lastDomainId: curDomain, halted: false };
    let label;
    if(arrivedHome)            label = '🏠 ' + name + ' reaches its den' + (destLair && destLair.name ? (' — ' + destLair.name) : '') + (ws0.dissolveOnArrival ? '.' : ' and rejoins it.');
    else if(settle)            label = '🏚 ' + name + ' wanders into a domain and LINGERS (JJ p.103) — it settles as a lair' + (settle.fullStrength ? ' at full strength.' : '.');
    else if(domainEntries.length) label = '🚶 ' + name + ' wanders into a domain — the day counts as a domain encounter; '
      + (domainEntries.some(de => de.hexFull) ? 'the hex is at its lair cap (JJ p.69), too crowded to den — it moves on' : 'it migrates onward')
      + ' (' + path.length + ' hexes).';
    else if(banditry)          label = path.length
      ? ('🏴 ' + name + ' raids within ' + (row.banditryDomainName || 'its domain') + ' (' + path.length + ' hexes today).')
      : ('🏴 ' + name + ' holds its ground in ' + (row.banditryDomainName || 'its domain') + '.');
    else                       label = (homing ? ('🏠 ' + name + ' presses on toward its den (') : ('🚶 ' + name + ' wanders (')) + path.length + ' hexes today).';
    pendingRecords.push({ kind: 'monster-band-day', label, groupId: g.id,
      outcome: arrivedHome ? 'arrived-home' : (settle ? 'settled' : 'moving'),
      path, domainEntries, settle, arrivedHome: arrivedHome ? { lairId: ws0.destLairId || null } : null,
      newWanderState: newWS, newHexId: endHex ? endHex.id : null,
      dayInMonth, primaryHexId: endHex ? endHex.id : null });
    if(settle || arrivedHome || domainEntries.length){
      notableEvents.push({ type: settle ? 'band-settled' : (arrivedHome ? 'band-home' : 'band-incursion'),
        primaryHexId: endHex ? endHex.id : null, campaignLogHidden: true,
        relatedEntities: [{ kind: 'group', id: g.id, role: 'subject' }],
        label, payload: { groupId: g.id, narrative: label, domainEntries: domainEntries.slice() } });
    }
  }
  return { pendingRecords, notableEvents };
}
function commitMonsterBandRecord(campaign, record){
  if(!campaign || !record || record.kind !== 'monster-band-day') return;
  const A = _jACKS();
  const g = (campaign.groups || []).find(x => x && x.id === record.groupId);
  if(!g) return;
  const turn = campaign.currentTurn || 1;
  if(record.newWanderState) g.wanderState = JSON.parse(JSON.stringify(record.newWanderState));
  g.currentHexId = record.newHexId || null;
  g.history = g.history || [];
  if(record.outcome === 'home-lost'){
    g.history.push({ turn, type: 'wander', reason: 'no den left to return to — the band wanders as a migrant' });
    return;
  }
  // The Vagaries occurrence stub — recorded on the Group; the Daily Domain Encounter
  // Probability machinery consumes these when Vagaries of Incursion lands (Phase 3 Military).
  for(const de of (record.domainEntries || [])){
    const dom = (campaign.domains || []).find(d => d && d.id === de.domainId);
    g.history.push({ turn, type: 'incursion',
      reason: 'wandered into ' + ((dom && dom.name) || 'a domain') + ' — counts as the day’s domain encounter occurrence (Vagaries of Incursion, Phase 3 Military); disposition '
        + (de.hexFull
            ? ('migrates — the hex is at its lair cap (' + (de.lairCap ? (de.lairCap.count + ' of ' + de.lairCap.max) : 'full') + ', JJ p.69), too crowded to den')
            : ((de.lingers ? 'lingers' : 'migrates') + ' (' + de.lingerRoll + ' vs Lair ' + de.lairPct + '%)')) });
  }
  // Linger → the band settles AS a den at the entry hex (JJ p.103; the E4m adopt — the
  // den binds THE Group, no second population; full strength gathers it to the lair count).
  if(record.settle && record.settle.hexId){
    const s = record.settle;
    const entry = (s.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(s.monsterCatalogKey) : null;
    // AD-C (RR p.386) — a dungeon at this hex captures the band to lair WITHIN it, BEFORE the JJ p.69
    // hex cap (a dungeon concentrates lairs — its own 1/3-full cap governs).
    if(typeof A.settleBandIntoDungeon === 'function'){
      const r = A.settleBandIntoDungeon(campaign, { hexId: s.hexId, groupId: g.id,
        monsterKey: (entry && entry.key) || s.monsterCatalogKey || '', fullStrength: !!s.fullStrength, count: s.count, turn, via: 'wander' });
      if(r && r.ok){
        const alive0 = (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
        if(s.fullStrength && s.count > alive0) g.count = (g.count || 0) + (s.count - alive0);
        g.currentHexId = s.hexId; g.wanderState = null;
        g.history.push({ turn, type: 'settled', reason: 'lured into ' + ((r.dungeon && r.dungeon.name) || 'a dungeon') + ' — ' + ((r.lair && (r.lair.name || r.lair.id)) || 'a lair') });
        return;
      }
    }
    // E9 — re-check the JJ p.69 cap at commit (another band may have denned this hex the
    // same day, or the GM authored a lair since the propose pass): full ⇒ the band moves on.
    const capNow = (typeof A.hexLairCapacity === 'function') ? A.hexLairCapacity(campaign, record.settle.hexId) : null;
    if(capNow && capNow.full){
      g.history.push({ turn, type: 'wander',
        reason: 'the hex filled to its lair cap (' + capNow.count + ' of ' + capNow.max + ', JJ p.69) before the band could den — it moves on' });
      return;
    }
    const lair = (typeof A.createLair === 'function') ? A.createLair(campaign, {
      hexId: s.hexId, monsterCatalogKey: (entry && entry.key) || s.monsterCatalogKey || '',
      status: 'active', establishedBy: 'wander-settle', establishedAtTurn: turn,
      knownToPlayers: false, name: ((entry && entry.name) || g.name || 'Monster') + ' lair'
    }) : null;
    if(lair){
      if(lair.lairPct == null && entry) lair.lairPct = entry.lairPct;
      lair.treasureType = s.fullStrength ? ((entry && entry.treasureType) || '') : '';
      lair.groupIds = [g.id];
      const alive = (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
      if(s.fullStrength && s.count > alive) g.count = (g.count || 0) + (s.count - alive);
      lair.totalInhabitantCount = (typeof A.lairInhabitantCount === 'function') ? A.lairInhabitantCount(campaign, lair) : null;
      lair.history = lair.history || [];
      lair.history.push({ turn, type: 'settled',
        reason: 'a wandering band lingered on entering the domain (JJ p.103) — ' + (s.fullStrength ? ('full lair strength (' + s.count + ')') : 'wandering numbers (no hoard yet)') });
      g.currentHexId = s.hexId;
      g.wanderState = null;                        // housed — no longer migrating
      g.history.push({ turn, type: 'settled', reason: 'lingered and denned — ' + (lair.name || lair.id) });
    }
    return;
  }
  // Arrived home — the transient walk token dissolves into the den (the population never
  // moved out for the hunt); a real Group the GM sent home is adopted back in instead.
  if(record.arrivedHome){
    const lair = (typeof A.findLair === 'function') ? A.findLair(campaign, record.arrivedHome.lairId) : null;
    if(lair && (lair.status === 'active' || lair.status === 'unknown' || lair.status === 'dynamic')){
      lair.history = lair.history || [];
      if(g.wanderState && g.wanderState.dissolveOnArrival){
        lair.history.push({ turn, type: 'returned', reason: 'the hunting band returned to the den (its population already counts them)' });
        campaign.groups = (campaign.groups || []).filter(x => !(x && x.id === g.id));
      } else {
        if((lair.groupIds || []).indexOf(g.id) < 0) lair.groupIds = (lair.groupIds || []).concat([g.id]);
        lair.totalInhabitantCount = (typeof A.lairInhabitantCount === 'function') ? A.lairInhabitantCount(campaign, lair) : null;
        lair.history.push({ turn, type: 'returned', reason: (g.name || 'a band') + ' returned and rejoined the den' });
        g.currentHexId = lair.hexId || record.newHexId || null;
        g.wanderState = null;
        g.history.push({ turn, type: 'returned', reason: 'reached the den — home' });
      }
    } else {
      // the den vanished between propose and commit — wander on as a migrant
      if(g.wanderState){ g.wanderState.mode = null; g.wanderState.destLairId = null; g.wanderState.dissolveOnArrival = false; }
      g.history.push({ turn, type: 'wander', reason: 'the den was gone — the band wanders as a migrant' });
    }
    return;
  }
  // routine motion — the Group moved; the day record carried the path (no history spam)
}

// ── Phase 3 Military W2 — the 'incursions' day consumer (slot 86): the Vagaries of ──────
// Incursion (JJ pp.100–106). Gated on the 'vagaries-of-incursion' rule (default OFF —
// JJ p.100 calls the chapter "strictly optional"; the bundled demo enables it). Every
// world day each domain rolls its Daily Domain Encounter Probability (effective
// territory per dangerous borders, JJ p.102; an insufficient garrison/stronghold reads
// one classification worse). A day on which a physical wandering band crossed the
// domain's border (the monster-bands consumer, slot 84) already HAS its occurrence —
// the ctx stash interlock skips the roll. A positive day builds the whole RAW chain as
// ONE record: entry hex (🔧 v1: a seeded pick among the domain's exposed border hexes —
// RAW says judge from the geography; re-place the band via the Inspector) → rarity
// (JJ p.72, on the effective classification) → the 1d100 identity on the entry hex's
// terrain table → linger/migrate vs Lair % + the number encountered (JJ p.103; treasure
// only at full lair strength or a mercantilist arrival) → the Domain Encounter Reaction
// 2d6 (current morale + the alignment circumstance, doubled when the band's BR tops the
// garrison's; animal/vermin/ooze/construct intelligence caps at Neutral — 🔧 the elven-
// fastness exception stays the GM's edit) → recon-lite for BOTH sides (RR p.452 — an
// oblivious ruler may not know the monsters came) → the platoon-scale BR comparison +
// the JJ p.104 verdict lines. COMMIT materializes the band as a Group with the verdict
// on group.incursion: a migrating band wanders on via the E6 machinery from tomorrow; a
// lingering band holds (wanderState.halted) as the standing threat the BR comparison
// priced; a lingering NEUTRAL band settles as a den at once (JJ p.103 "attempt to find
// a place to settle"), respecting the E9 hex cap. The comprehensive 'domain-incursion'
// event rides the notable (record-only; chronicle-visible).
function _incursionSizeMod(troops){
  const n = Math.max(0, Number(troops) || 0);
  if(n <= 600) return -2;
  if(n <= 3000) return -1;
  if(n <= 12000) return 0;
  if(n <= 36000) return 1;
  if(n <= 72000) return 2;
  return 3;
}
function _incursionProximityMod(distHexes){
  if(distHexes == null) return 0;
  if(distHexes <= 0) return 2;                       // same 6-mile hex
  if(distHexes === 1) return 1;                      // adjacent 6-mile hexes
  if(distHexes <= 3) return 0;                       // ~the same 24-mile hex
  return -Math.ceil((distHexes - 3) / 4);            // −1 per 24-mile hex beyond
}
// RR p.452 terrain row (keyed on the shipped base + sub-type): open ground +1 to
// observe an army in it, concealing terrain −1, everything else 0.
function _incursionTerrainConcealMod(hex){
  if(!hex) return 0;
  const A = _jACKS();
  const base = (typeof A.terrainBase === 'function') ? A.terrainBase(hex.terrain) : String(hex.terrain || '');
  const sub = String(hex.terrainSubtype || '').toLowerCase();
  if(base === 'barrens' || base === 'desert' || base === 'grassland') return 1;
  if(base === 'scrubland') return (sub === 'high' || sub === 'dense') ? -1 : 1;
  if(base === 'forest') return (sub === 'taiga') ? -1 : 0;
  if(base === 'hills') return (sub === 'rocky') ? -1 : 0;
  if(base === 'swamp') return (sub === 'marshy') ? -1 : 0;
  return 0;
}
// RR p.452 recon-lite for a domain encounter (JJ p.103): one 2d6 per side with the
// derivable modifier subset (opposing size · proximity · regional familiarity · terrain
// concealment · garrison cavalry scouting · the JJ Aerial tag). The W4 full recon adds
// SA, magic, spies, screens, stratagems, prisoners. The garrison observes from the
// stronghold hex (the hex with the largest settlement, else the domain's first — JJ
// p.103 "assume the garrison is in the domain's stronghold").
function _incursionReconLite(campaign, d, entryHex, entry, count, rng){
  const A = _jACKS();
  const domHexes = ((campaign && campaign.hexes) || []).filter(h => h && h.domainId === d.id);
  let strongholdHex = null, best = -1;
  for(const h of domHexes){
    const s = A.settlementForHex ? A.settlementForHex(campaign, h.id) : null;   // T6 single-home
    const fam = (s && s.families) || 0;
    if(fam > best){ best = fam; strongholdHex = h; }
  }
  const dist = (strongholdHex && strongholdHex.coord && entryHex && entryHex.coord && typeof A.hexAxialDistance === 'function')
    ? A.hexAxialDistance(strongholdHex.coord, entryHex.coord) : null;
  let cav = 0;
  for(const u of (A.domainGarrisonUnits ? A.domainGarrisonUnits(campaign, d) : [])){
    if(!u) continue;
    const row = (typeof A.findTroopType === 'function')
      ? A.findTroopType(u.unitTypeKey, { race: u.race || 'man', veteran: !!u.veteran, loadout: u.loadout || null }) : null;
    if(row && row.category === 'cavalry') cav++;
  }
  const cavMod = cav >= 101 ? 3 : cav >= 21 ? 2 : cav >= 6 ? 1 : 0;
  const mc = (entry && typeof A.massCombatRow === 'function') ? A.massCombatRow(entry.key) : null;
  const aerial = !!(mc && Array.isArray(mc.tags) && mc.tags.indexOf('aerial') >= 0);
  const roll2d6 = () => (1 + Math.floor(rng() * 6)) + (1 + Math.floor(rng() * 6));
  const mkSide = mods => {
    const applied = mods.filter(m => m.value !== 0);
    const roll = roll2d6();
    const total = roll + applied.reduce((s, m) => s + m.value, 0);
    const band = (typeof A.reconRollBand === 'function') ? A.reconRollBand(total) : { key: 'failure', label: 'Failure' };
    return { roll, total, result: band.key, resultLabel: band.label, mods: applied };
  };
  const ruler = mkSide([
    { label: 'a band of ' + (count != null ? count : '?'), value: _incursionSizeMod(count || 1) },
    { label: 'proximity (' + (dist != null ? dist + ' hexes' : 'unknown') + ')', value: _incursionProximityMod(dist) },
    { label: 'more familiar with the region', value: 1 },
    { label: 'their terrain', value: _incursionTerrainConcealMod(entryHex) },
    { label: 'garrison cavalry scouting (' + cav + ' units)', value: cavMod }
  ]);
  const monsters = mkSide([
    { label: 'garrison of ' + ((typeof A.garrisonHeadcount === 'function') ? A.garrisonHeadcount(campaign, d) : '?'), value: _incursionSizeMod((typeof A.garrisonHeadcount === 'function') ? A.garrisonHeadcount(campaign, d) : 0) },
    { label: 'proximity (' + (dist != null ? dist + ' hexes' : 'unknown') + ')', value: _incursionProximityMod(dist) },
    { label: 'less familiar with the region', value: -1 },
    { label: 'observing from the air', value: aerial ? 2 : 0 },
    { label: 'the stronghold’s terrain', value: _incursionTerrainConcealMod(strongholdHex) }
  ]);
  const aware = k => (k === 'marginal' || k === 'success' || k === 'major');
  return { ruler, monsters, rulerAware: aware(ruler.result), monstersIntel: aware(monsters.result) };
}
// The JJ p.104 mass-combat trigger lines — GM guidance recorded with the verdict (the
// battles themselves are W3/W6; deployment is the GM's call, so both branches print).
function _incursionVerdictLines(attitude, monsterBr, garrisonBr, intel, sapient, lingering){
  const lines = [];
  const priced = (monsterBr != null && garrisonBr != null);
  if(attitude === 'hostile'){
    lines.push('garrison deployed → pitched battle — hostile monsters always fight (JJ p.104)');
    if(priced){
      if(monsterBr > 2 * garrisonBr && intel && sapient)
        lines.push('garrison in the stronghold → they ASSAULT it (BR ' + monsterBr + ' > 2× garrison ' + garrisonBr + ', with the intelligence and means)');
      else if(monsterBr > 2 * garrisonBr)
        lines.push('garrison in the stronghold → they pillage the domain (BR tops 2× the garrison but ' + (sapient ? 'their reconnaissance failed' : 'they lack the wits to assault') + ')');
      else
        lines.push('garrison in the stronghold → they pillage the domain (BR ' + monsterBr + ' ≤ 2× garrison ' + garrisonBr + ')');
    } else lines.push('garrison in the stronghold → pillage vs assault is the Judge’s call (no priced BR)');
  } else if(attitude === 'unfriendly'){
    if(priced){
      if(monsterBr >= garrisonBr) lines.push('garrison deployed → they FIGHT (BR ' + monsterBr + ' ≥ garrison ' + garrisonBr + ')');
      else lines.push('garrison deployed → they are DRIVEN OFF (BR ' + monsterBr + ' < garrison ' + garrisonBr + ')');
    } else lines.push('garrison deployed → fight vs driven-off is the Judge’s call (no priced BR)');
    lines.push('left alone → they loot supplies, then ' + (lingering ? 'keep at it until driven off' : 'depart'));
  } else if(attitude === 'neutral'){
    lines.push('garrison deployed → they turn UNFRIENDLY (JJ p.104)');
    lines.push('left alone → ' + (lingering ? 'they look for a place to settle' : 'they exit peacefully within 1d4 weeks') + ' — and the peasants grumble (−1 on the next domain morale roll)');
  } else if(attitude === 'mercantilist'){
    lines.push('they head for the settlement to trade (treasure as merchandise — M&M); garrison deployed → they turn UNFRIENDLY');
  } else if(attitude === 'friendly'){
    lines.push('they offer their help (mercenary or henchman offers at +2); garrison deployed → they turn UNFRIENDLY');
  }
  return lines;
}
function proposeIncursionDay(campaign, ctx){
  const pendingRecords = [], notableEvents = [];
  if(!campaign) return { pendingRecords, notableEvents };
  ctx = ctx || {};
  const A = _jACKS();
  if(!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'vagaries-of-incursion'))) return { pendingRecords, notableEvents };
  const dayInMonth = (typeof ctx.dayInMonth === 'number') ? ctx.dayInMonth : ((campaign.currentDayInMonth || 1) + 1);
  const worldOrd = ((campaign.currentTurn || 1) * 30) + dayInMonth;
  const entered = ctx._wanderEntryDomainIds || [];
  for(const d of (campaign.domains || [])){
    if(!d) continue;
    if(entered.indexOf(d.id) >= 0) continue;           // the physical entry IS today's occurrence
    const chance = (typeof A.domainDailyEncounterChance === 'function') ? A.domainDailyEncounterChance(campaign, d) : null;
    if(!chance || !(chance.pct > 0)) continue;
    const rng = ctx.rng || _jMulberry32(_jHash32('incursion|' + d.id + '|' + worldOrd));
    const roll = Math.round(rng() * 1000) / 10;        // 0.0–99.9 at the table's half-percent grain
    if(roll >= chance.pct) continue;                   // quiet day — no record (no spam)
    // ── an incursion! the entry hex: a seeded pick among the exposed border hexes ──
    const domHexes = (campaign.hexes || []).filter(h => h && h.domainId === d.id && h.coord);
    let candidates = [];
    if(domHexes.length){
      const byCoord = new Map();
      for(const h of (campaign.hexes || [])){ if(h && h.coord) byCoord.set(h.coord.q + ',' + h.coord.r, h); }
      const deltas = (typeof A.hexNeighborDeltas === 'function') ? A.hexNeighborDeltas() : [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
      candidates = domHexes.filter(h => deltas.some(dl => {
        const n = byCoord.get((h.coord.q + dl[0]) + ',' + (h.coord.r + dl[1])) || null;
        if(!n) return true;                            // unauthored = the open wilds
        if(n.domainId) return false;
        const base = (typeof A.terrainBase === 'function') ? A.terrainBase(n.terrain) : n.terrain;
        return base !== 'water';                       // unsettled land
      }));
      if(!candidates.length) candidates = domHexes;
    }
    let entryHex = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : null;
    // AD-C (RR p.386) — a stocked dungeon LURES the arrival to its hex (its whole purpose is to draw
    // wandering monsters in). When the domain holds a live, not-full dungeon, the incursion lands there.
    if(typeof A.dungeonForArrival === 'function'){
      const lure = A.dungeonForArrival(campaign, d);
      if(lure && lure.hexId){ const lh = (campaign.hexes || []).find(h => h && h.id === lure.hexId); if(lh) entryHex = lh; }
    }
    // ── identity: rarity (JJ p.72, the effective classification) → the terrain table ──
    const rar = (typeof A.rollEncounterRarity === 'function') ? A.rollEncounterRarity(chance.effective, rng) : { roll: null, rarity: 'common' };
    let identity = null;
    if(entryHex && typeof A.rollEncounterIdentity === 'function' && typeof A.terrainKey === 'function'){
      const tKey = A.terrainKey(entryHex);
      if(tKey) identity = A.rollEncounterIdentity({
        terrainKey: tKey, hasRiver: !!(Array.isArray(entryHex.riverSides) && entryHex.riverSides.length),
        category: 'monster', rarity: rar.rarity, rng
      });
    }
    const entry = (identity && identity.key && typeof A.findMonster === 'function') ? A.findMonster(identity.key) : null;
    const idLabel = (entry && entry.name) || (identity && identity.label) || 'monsters (GM identifies)';
    // ── linger or migrate (JJ p.103) + the number encountered ──
    const lairPct = (entry && typeof entry.lairPct === 'number') ? entry.lairPct : 0;
    // AD-C (RR p.386) — a dungeon seeded with treasure ≥ the monster's Treasure-Type average DOUBLES its
    // Lair %. The full-strength roll stays against the PLAIN Lair % ("1d100 again against its Lair characteristic").
    const lairBonus = (entryHex && typeof A.dungeonLairBonus === 'function') ? A.dungeonLairBonus(campaign, entryHex.id, entry) : 1;
    const effLairPct = Math.min(100, lairPct * lairBonus);
    const lingerRoll = 1 + Math.floor(rng() * 100);
    const lingering = effLairPct > 0 && lingerRoll <= effLairPct;
    const strengthRoll = lingering ? (1 + Math.floor(rng() * 100)) : null;
    const fullStrength = !!(lingering && strengthRoll <= lairPct);
    let count = null, countSpec = null;
    if(entry && entry.numberAppearing){
      countSpec = fullStrength ? (entry.numberAppearing.lair || entry.numberAppearing.wandering)
                               : (entry.numberAppearing.wandering || entry.numberAppearing.lair);
      if(countSpec && typeof A._rollDiceStr === 'function') count = Math.max(1, A._rollDiceStr(countSpec, rng) || 1);
    }
    // ── the platoon-scale BR comparison (JJ p.105) ──
    const garrisonBr = (typeof A.domainGarrisonPlatoonBr === 'function') ? A.domainGarrisonPlatoonBr(campaign, d) : 0;
    const monsterBr = (entry && typeof entry.battleRating === 'number' && count)
      ? ((typeof A.monsterPlatoonBr === 'function') ? A.monsterPlatoonBr(entry.battleRating, count) : null) : null;
    // ── the Domain Encounter Reaction (JJ p.103): 2d6 + morale + alignment ──
    const mods = [];
    const morale = (d.demographics && typeof d.demographics.morale === 'number') ? d.demographics.morale : 0;
    if(morale !== 0) mods.push({ label: 'domain morale score', value: morale });
    const rulerCh = (typeof A.rulerCharacter === 'function') ? A.rulerCharacter(campaign, d) : null;
    const dAl = String((rulerCh && rulerCh.alignment) || '').charAt(0).toUpperCase();
    const mAl = String((entry && entry.alignment) || '').charAt(0).toUpperCase();
    const brTops = (monsterBr != null) && (monsterBr > garrisonBr);
    if(dAl && mAl){
      if(dAl === 'L' && mAl === 'L') mods.push({ label: 'lawful domain, lawful monsters', value: 2 });
      else if((dAl === 'L' || dAl === 'N') && mAl === 'C')
        mods.push({ label: 'lawful/neutral domain, chaotic monsters' + (brTops ? ' — doubled, their BR tops the garrison’s' : ''), value: brTops ? -4 : -2 });
      else if(dAl === 'C' && mAl === 'L')
        mods.push({ label: 'chaotic domain, lawful monsters' + (brTops ? ' — doubled, their BR tops the garrison’s' : ''), value: brTops ? -4 : -2 });
    }
    const reactionRoll = (1 + Math.floor(rng() * 6)) + (1 + Math.floor(rng() * 6));
    const reactionTotal = reactionRoll + mods.reduce((s, m) => s + m.value, 0);
    let band = (typeof A.domainEncounterReactionBand === 'function') ? A.domainEncounterReactionBand(reactionTotal) : { key: 'neutral', label: 'Neutral' };
    const types = (entry && entry.creatureTypes) || [];
    const mindCapped = types.some(t => t === 'animal' || t === 'vermin' || t === 'ooze' || t === 'construct');
    let attitudeCapped = false;
    if(mindCapped && (band.key === 'mercantilist' || band.key === 'friendly')){
      const neutral = ((A.DOMAIN_REACTION_BANDS || []).find(b => b.key === 'neutral')) || { key: 'neutral', label: 'Neutral — exploratory' };
      band = neutral; attitudeCapped = true;
    }
    const sapient = !mindCapped;
    const treasureType = (fullStrength || band.key === 'mercantilist') ? ((entry && entry.treasureType) || '') : '';
    // ── recon-lite (RR p.452) + the verdict ──
    const recon = _incursionReconLite(campaign, d, entryHex, entry, count, rng);
    const verdictLines = _incursionVerdictLines(band.key, monsterBr, garrisonBr, recon.monstersIntel, sapient, lingering);
    // ── the pre-minted Group id (the E1 collision-proof preview idiom: the work-copy
    // commit and the real commit must create the SAME band) ──
    const groupId = 'grp-' + Math.floor(rng() * Math.pow(36, 7)).toString(36).padStart(7, '0');
    const label = '⚔ ' + (d.name || 'Domain') + ': domain encounter — '
      + (count != null ? count + ' × ' : '') + idLabel
      + ' (' + rar.rarity + ', ' + (lingering ? 'LINGERING' : 'migrating') + ') · ' + band.label
      + (recon.rulerAware ? '' : ' · the ruler is UNAWARE');
    pendingRecords.push({
      kind: 'incursion', label, groupId,
      domainId: d.id, hexId: entryHex ? entryHex.id : null,
      chance: { pct: chance.pct, roll, actualHexes: chance.actualHexes, effectiveHexes: chance.effectiveHexes,
                configuration: chance.configuration, base: chance.base, classification: chance.effective, demoted: chance.demoted },
      identity: { label: idLabel, key: (identity && identity.key) || null,
                  natural: identity ? identity.natural : null, tableKey: identity ? identity.tableKey : null,
                  rarity: rar.rarity, rarityRoll: rar.roll },
      lairPct, lingerRoll, lingering, strengthRoll, fullStrength, count, countSpec, treasureType,
      reaction: { roll: reactionRoll, mods, total: reactionTotal, attitude: band.key, attitudeLabel: band.label, capped: attitudeCapped },
      recon, brComparison: { monsterBr, garrisonBr, verdictLines },
      dayInMonth, primaryHexId: entryHex ? entryHex.id : null
    });
    notableEvents.push({
      type: 'incursion', pauseTrigger: 'encounter', kind: 'domain-incursion',
      primaryHexId: entryHex ? entryHex.id : null, domainId: d.id,
      relatedEntities: [{ kind: 'domain', id: d.id, role: 'target' }, { kind: 'group', id: groupId, role: 'subject' }],
      label,
      payload: { domainId: d.id, groupId, hexId: entryHex ? entryHex.id : null,
                 chance: { pct: chance.pct, roll }, identity: { label: idLabel, key: (identity && identity.key) || null, rarity: rar.rarity },
                 count, disposition: lingering ? 'lingering' : 'migrating', fullStrength, treasureType,
                 reaction: { roll: reactionRoll, total: reactionTotal, attitude: band.key, mods },
                 recon: { rulerAware: recon.rulerAware, monstersIntel: recon.monstersIntel,
                          ruler: { roll: recon.ruler.roll, total: recon.ruler.total, result: recon.ruler.result },
                          monsters: { roll: recon.monsters.roll, total: recon.monsters.total, result: recon.monsters.result } },
                 brComparison: { monsterBr, garrisonBr, verdictLines }, narrative: label }
    });
  }
  return { pendingRecords, notableEvents };
}
function commitIncursionRecord(campaign, record){
  if(!campaign || !record || record.kind !== 'incursion') return;
  const A = _jACKS();
  const d = (campaign.domains || []).find(x => x && x.id === record.domainId);
  if(!d) return;
  const turn = campaign.currentTurn || 1;
  if(!Array.isArray(campaign.groups)) campaign.groups = [];
  if(campaign.groups.some(g => g && g.id === record.groupId)) return;   // defensive — already committed
  const entry = (record.identity && record.identity.key && typeof A.findMonster === 'function') ? A.findMonster(record.identity.key) : null;
  const att = (record.reaction && record.reaction.attitude) || 'neutral';
  const g = (typeof A.blankGroup === 'function') ? A.blankGroup({
    id: record.groupId,
    name: (entry && entry.name) || (record.identity && record.identity.label) || 'Arriving monsters',
    groupTemplate: { monsterCatalogKey: (entry && entry.key) || null,
                     creatureTypes: (entry && Array.isArray(entry.creatureTypes)) ? entry.creatureTypes.slice() : ['humanoid'],
                     hitDice: (entry && entry.hd) || null },
    count: record.count || 0,
    currentHexId: record.hexId || null,
    currentDomainId: record.domainId,
    lifecycleState: 'wild'
  }) : null;
  if(!g) return;
  g.incursion = {
    domainId: record.domainId, attitude: att,
    disposition: record.lingering ? 'lingering' : 'migrating',
    fullStrength: !!record.fullStrength, treasureType: record.treasureType || '',
    rulerAware: !!(record.recon && record.recon.rulerAware),
    monstersIntel: !!(record.recon && record.recon.monstersIntel),
    arrivedAtTurn: turn, arrivedOnDay: record.dayInMonth || null
  };
  g.history = g.history || [];
  g.history.push({ turn, type: 'incursion',
    reason: 'arrived as a domain encounter at ' + (d.name || 'a domain') + ' (Vagaries of Incursion, JJ p.101) — '
      + ((record.reaction && record.reaction.attitudeLabel) || att) + ', ' + (record.lingering ? 'lingering' : 'migrating')
      + (record.recon && record.recon.rulerAware === false ? '; the ruler is unaware' : '') });
  // a lingering band holds where it arrived (the standing threat the verdict priced);
  // a migrating band's wanderState stays null — the E6 machinery walks it from tomorrow.
  if(record.lingering){
    g.wanderState = { coord: null, lastCoord: null, mileRemainder: 0, mode: null,
                      destLairId: null, dissolveOnArrival: false, lastDomainId: record.domainId, halted: true };
  }
  campaign.groups.push(g);
  // AD-C (RR p.386) — a dungeon at the entry hex LURES the lingering band to lair WITHIN it (any
  // attitude — it dens in the dungeon, it does not ally with the domain), gated by the dungeon's own
  // 1/3-full cap. Falls through to the JJ p.103 bare-hex settle when no dungeon captured the band.
  let denned = false;
  if(record.lingering && record.hexId && typeof A.settleBandIntoDungeon === 'function'){
    const r = A.settleBandIntoDungeon(campaign, { hexId: record.hexId, groupId: g.id,
      monsterKey: (entry && entry.key) || (record.identity && record.identity.key) || '',
      fullStrength: !!record.fullStrength, count: record.count, turn, via: 'incursion' });
    if(r && r.ok){ denned = true; g.wanderState = null; }
  }
  // a lingering NEUTRAL band looks for a place to settle at once (JJ p.103); the E9 hex
  // cap can refuse it ("simply too crowded" — it holds as a loose band instead).
  if(!denned && record.lingering && att === 'neutral' && record.hexId){
    const capNow = (typeof A.hexLairCapacity === 'function') ? A.hexLairCapacity(campaign, record.hexId) : null;
    if(capNow && capNow.full){
      g.history.push({ turn, type: 'wander',
        reason: 'sought to settle but the hex is at its lair cap (' + capNow.count + ' of ' + capNow.max + ', JJ p.69) — the band holds as a loose camp' });
    } else {
      const lair = (typeof A.createLair === 'function') ? A.createLair(campaign, {
        hexId: record.hexId, monsterCatalogKey: (entry && entry.key) || '',
        status: 'active', establishedBy: 'incursion-settle', establishedAtTurn: turn,
        knownToPlayers: false, name: ((entry && entry.name) || g.name || 'Monster') + ' lair'
      }) : null;
      if(lair){
        if(lair.lairPct == null && entry) lair.lairPct = entry.lairPct;
        lair.treasureType = record.fullStrength ? ((entry && entry.treasureType) || '') : '';
        lair.groupIds = [g.id];
        lair.totalInhabitantCount = (typeof A.lairInhabitantCount === 'function') ? A.lairInhabitantCount(campaign, lair) : null;
        lair.history = lair.history || [];
        lair.history.push({ turn, type: 'settled',
          reason: 'a domain-encounter arrival lingered and settled (JJ p.103) — '
            + (record.fullStrength ? ('full lair strength (' + (record.count || '?') + ')') : 'wandering numbers (no hoard yet)') });
        g.wanderState = null;                          // housed
        g.history.push({ turn, type: 'settled', reason: 'lingered and denned — ' + (lair.name || lair.id) });
      }
    }
  }
  // AD-C (RR p.387) — a migrating band of men / dwarves / elves past an OWNED dungeon = adventurers come
  // to clear it (a GM one-off-delve prompt; non-blocking, fired only when no dungeon captured the band).
  if(!denned && !record.lingering && record.hexId && typeof A.noteDungeonInvaders === 'function'){
    A.noteDungeonInvaders(campaign, { hexId: record.hexId, groupId: g.id, monsterKey: (entry && entry.key) || '', via: 'incursion' });
  }
  // JJ p.103 — peasants distrust a NEUTRAL band the garrison is not deployed against:
  // −1 on the NEXT domain morale roll. One-shot; the monthly turn consumes the flag
  // (clear it by hand if the garrison was in fact deployed — deployment is W4 state).
  if(att === 'neutral') d.incursionXenophobiaPending = true;
}
// The UI read: the live incursion bands standing in a domain (alive + still on the
// domain's ground; a settled band keeps showing through its den's hex).
function incursionBandsForDomain(campaign, domainId){
  const A = _jACKS();
  const out = [];
  for(const g of ((campaign && campaign.groups) || [])){
    if(!g || !g.incursion || g.incursion.domainId !== domainId) continue;
    const alive = (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
    if(alive <= 0) continue;
    const hex = g.currentHexId ? ((campaign.hexes || []).find(h => h && h.id === g.currentHexId) || null) : null;
    if(!hex || hex.domainId !== domainId) continue;    // wandered off (or off the map) — no longer this domain's problem
    out.push(g);
  }
  return out;
}

// ── #476 E10 — domain-morale banditry (RR pp.350–351): the monthly materialization ──────
// "Domains with current morale scores of -2 or less will be plagued by bandits." The RAW
// counts are already derived (banditCount, the economy module: −2 → 1 bandit per 5 peasant
// families, −3 → 1 per 2, −4 → every able-bodied man); the income loss is already wired
// (INCOME_FACTOR_BY_MORALE) and the extra family flight too (rollMoraleExtra). E10 puts the
// bandits IN THE WORLD: placed Groups (banditryDomainId) raiding within their domain —
// fenced wander on the Day Clock, found by the wandering draw (E4m, source 'banditry-band'),
// meetable / attackable / trackable like any band. Reconciled every monthly turn:
//   • casualties settle FIRST — killed bandits are the domain's own men: the population
//     falls by the number killed (RR p.351 "killing 100 bandits reduces the population by
//     100 families"); freeing prisoners instead is the GM's call (restore families by hand).
//   • the target re-derives off the post-settlement morale + families; bands rise, swell,
//     wane, or disband to match — morale recovering to −1 or better disbands them WITHOUT
//     population loss (RR p.351 "reduce the number of bandits to zero without diminishing
//     the population" — the men return to their fields).
//   • bandits count as an ENEMY ARMY (RR p.351): while they plague the domain the occupation
//     penalty builds on the morale roll — 0 the first month, then −1 per month, cumulative
//     (RR p.349) — moraleModifiersFor reads it off d.banditryOccupationMonths (lazy field).
// NOT here (Phase 3 Military §4.2.1): the army-scale battle (+1 morale on defeating the
// bandit army, prisoner release) and the cumulative-% NPC bandit-leader challenger.
// 🔧 The band split is presentation (RAW musters the bandits as one army): one band per
// domain hex, at most 6, sized evenly — the scale a travelling party actually meets.
// Gated on the 'domain-morale-banditry' rule (default ON); OFF = no reconcile runs (any
// already-risen bands stay as world entities — the founded-dens precedent, HR-Enc).
function banditryBandsForDomain(campaign, domainId){
  return ((campaign && campaign.groups) || []).filter(g => g && g.banditryDomainId === domainId);
}
function _banditryEmitEvent(campaign, d, payload, narrative){
  const A = _jACKS();
  if(typeof A.newEvent !== 'function') return null;
  const ev = A.newEvent('domain-banditry', {
    submittedBy: 'engine', targetTurn: campaign.currentTurn || 1, cadence: 'monthly-turn',
    payload: Object.assign({ domainId: d.id, narrative }, payload || {})
  });
  if(typeof A.setEventContext === 'function'){
    const firstHex = (campaign.hexes || []).find(h => h && h.domainId === d.id) || null;
    A.setEventContext(ev, {
      primaryHexId: firstHex ? firstHex.id : null,
      domainId: d.id,
      relatedEntities: [{ kind: 'domain', id: d.id, role: 'subject' }]
        .concat(((payload && payload.bands) || []).map(b => ({ kind: 'group', id: b.groupId, role: 'subject' })))
    });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = campaign.currentTurn || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}
// Reconcile ONE banditry sub-population (militia-drawn or rabble) to its target. Mutates
// campaign.groups (rises new bands, removes disbanded/wiped). Returns { action, bands }.
// rng is consumed ONLY on a rise (the hex shuffle) — a 0-target / no-bands no-op never
// touches it, so a domain with no at-home trained militia leaves the rng stream for the
// rabble reconcile exactly as the pre-split code saw it (byte-identical).
function _reconcileBanditrySubset(campaign, d, bands, target, opts){
  const A = _jACKS();
  const rng = opts.rng, turn = opts.turn, moraleName = opts.moraleName;
  const aliveNow = bands.reduce((s, g) => s + Math.max(0, (g.count || 0) - (g.casualties || 0)), 0);
  if(target <= 0 && bands.length){
    // Morale recovered (or this sub-population is gone) — the men return to their fields,
    // WITHOUT population loss (RR p.351).
    const ids = new Set(bands.map(g => g.id));
    campaign.groups = campaign.groups.filter(g => !(g && ids.has(g.id)));
    return { action: 'disbanded', bands: [] };
  }
  if(target > 0 && !bands.length){
    // Rise — 🔧 one band per domain hex, at most 6, sized evenly (rng-placed).
    const spots = (campaign.hexes || []).filter(h => h && h.domainId === d.id);
    for(let i = spots.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
    const nBands = Math.max(1, Math.min(6, spots.length || 1, target));
    const base = Math.floor(target / nBands), rem = target % nBands;
    const made = [];
    for(let i = 0; i < nBands; i++){
      const g = (typeof A.blankGroup === 'function') ? A.blankGroup({
        name: opts.bandName(nBands, i),
        groupTemplate: opts.template(),
        count: base + (i < rem ? 1 : 0),
        currentHexId: spots.length ? spots[i % spots.length].id : null,
        currentDomainId: d.id
      }) : null;
      if(!g) break;
      g.banditryDomainId = d.id;
      g.history.push({ turn, type: 'banditry', reason: opts.riseReason(moraleName) });
      campaign.groups.push(g);
      made.push(g);
    }
    return { action: 'rise', bands: made };
  }
  if(target > 0 && bands.length && aliveNow !== target){
    // Resize the existing set evenly (positions + histories kept); a share of 0 disbands
    // that band (the target shrank below the band count).
    const base = Math.floor(target / bands.length), rem = target % bands.length;
    bands.forEach((g, i) => { g.count = base + (i < rem ? 1 : 0); g.casualties = 0; });
    const empty = new Set(bands.filter(g => (g.count || 0) <= 0).map(g => g.id));
    if(empty.size){
      campaign.groups = campaign.groups.filter(g => !(g && empty.has(g.id)));
      bands = bands.filter(g => !empty.has(g.id));
    }
    return { action: (target > aliveNow) ? 'swell' : 'wane', bands };
  }
  return { action: null, bands };
}
// ── The NPC bandit-leader challenger (RR pp.350–351) ─────────────────────────
// At morale ≤ −2 with banditry active, a CUMULATIVE monthly chance (1% / 5% / 10% at −2 / −3 /
// −4) that a leader emerges from the bandits to challenge the ruler. He offers battle at the
// first opportunity; if the ruler does not meet him in battle, he loots/pillages the domain
// (−4 to its morale rolls — moraleModifiersFor reads d.banditryChallenger.pillaging). Defeating
// his bandit army (the W3 battle aftermath clears the challenge) or raising morale above −2 (the
// bands disperse) ends it. The challenge roll + the generated NPC ride an ISOLATED seeded rng
// (the _seededMilitaryRng / army-disease idiom) so the shared band-reconcile rng stream stays
// byte-stable — tests force/deny a spawn via options.challengerRng. Lazy/defensive domain fields
// (d.banditryChallenger, d.banditryChallengeChance) like d.banditryOccupationMonths — no migration.
const _BANDIT_CHALLENGE_PCT = Object.freeze({ '-2': 1, '-3': 5, '-4': 10 });
function _processBanditryChallenger(campaign, d, opts){
  const A = _jACKS();
  const turn = opts.turn || (campaign.currentTurn || 1);
  const target = opts.target || 0;
  const morale = (opts.morale != null) ? opts.morale : 0;
  const bands = opts.bands || [];
  const out = opts.out || null;
  const dn = d.name || d.id;
  const crng = opts.challengerRng || _jMulberry32(_jHash32('bandit-challenger|' + d.id + '|' + turn + '|' + morale));
  const log = (narrative, action, extra) => {
    _banditryEmitEvent(campaign, d, Object.assign({ action: action, morale: morale }, extra || {}), narrative);
    if(out){ out.logEntries.push(narrative); out.domains.push(Object.assign({ domainId: d.id, action: action }, extra || {})); }
  };
  const existing = d.banditryChallenger || null;
  if(existing){
    const ch = (campaign.characters || []).find(c => c && c.id === existing.characterId) || null;
    // Dispersed: morale recovered (no bandits left) or the challenger is already gone.
    if(target <= 0 || !ch || ch.lifecycleState === 'deceased' || ch.lifecycleState === 'departed'){
      if(ch && ch.lifecycleState !== 'deceased' && ch.lifecycleState !== 'departed'){
        ch.lifecycleState = 'departed';
        if(typeof A.addCharacterHistory === 'function') A.addCharacterHistory(campaign, ch, 'note', 'The bandit revolt in ' + dn + ' subsided — he loses his army and slips away (RR p.351)');
      }
      d.banditryChallenger = null;
      log('\u{1F3F3} ' + ((ch && ch.name) || 'The bandit lord') + ' loses his army and vanishes as ' + dn + '’s revolt subsides.', 'challenger-dispersed', { challengerCharacterId: existing.characterId });
      return;
    }
    // Persists: re-assert his command of the current bands; escalate offering → pillaging if the
    // ruler did not meet him in battle since he emerged (the −4 then engages via moraleModifiersFor).
    for(const g of bands){ if(g) g.commanderCharacterId = existing.characterId; }
    if(existing.status === 'offering'){
      existing.status = 'pillaging'; existing.pillaging = true; existing.pillageSinceTurn = turn;
      log('\u{1F451} ' + ch.name + ' takes the field unopposed and begins to loot ' + dn + ' — −4 to its morale rolls until the ruler meets him in battle (RR p.351).', 'challenger-pillages', { challengerCharacterId: existing.characterId });
    }
    return;
  }
  // No challenger yet — accumulate + roll the cumulative monthly chance (reset when not plagued).
  if(target <= 0 || morale > -2){ if(d.banditryChallengeChance) d.banditryChallengeChance = 0; return; }
  const inc = _BANDIT_CHALLENGE_PCT[String(morale)] || 0;
  if(inc <= 0) return;
  d.banditryChallengeChance = Math.min(100, (d.banditryChallengeChance || 0) + inc);
  if((1 + Math.floor(crng() * 100)) > d.banditryChallengeChance) return;   // no leader emerges this month
  if(typeof A.generateNPC !== 'function') return;                          // generators not loaded — skip
  // His level grants personal authority +0 at the domain's income (RR p.351): PA = lvl − bracket
  // − 1, so lvl = bracket(income) + 1 ⇒ PA = 0. (The RAW −4-Rebellious note — income 0 → level 1
  // → PA 0 — generalized across all three bands; a richer, less-crashed domain draws an abler rival.)
  const income = (typeof A.domainIncome === 'function') ? A.domainIncome(campaign, d) : 0;
  const bracket = (typeof A.personalAuthorityBracketForIncome === 'function') ? A.personalAuthorityBracketForIncome(income) : 0;
  const lvl = Math.max(1, Math.min(14, bracket + 1));
  const hexId = (bands.find(g => g && g.currentHexId) || {}).currentHexId
    || ((typeof A.domainSeatHexId === 'function') ? A.domainSeatHexId(campaign, d) : null);
  let gen = null;
  try {
    gen = A.generateNPC(campaign, { class: 'fighter', targetLevel: lvl, alignment: 'Chaotic',
      socialTier: 'independent', controlledBy: 'gm', hexId: hexId, domainId: d.id }, { rng: crng });
  } catch(e){ gen = null; }
  if(!gen || !gen.character) return;
  const ch = gen.character;
  ch.banditChallenge = { domainId: d.id, sinceTurn: turn };
  if(!Array.isArray(campaign.characters)) campaign.characters = [];
  campaign.characters.push(ch);
  for(const g of bands){ if(g) g.commanderCharacterId = ch.id; }
  d.banditryChallenger = { characterId: ch.id, sinceTurn: turn, status: 'offering', pillaging: false };
  d.banditryChallengeChance = 0;
  if(typeof A.addCharacterHistory === 'function') A.addCharacterHistory(campaign, ch, 'note', 'Emerged from the bandits of ' + dn + ' to challenge its ruler (RR p.351)');
  log('\u{1F451} A bandit lord, ' + ch.name + ' (L' + lvl + '), has risen from the rebels of ' + dn + ' to challenge its ruler — he will offer battle at the first opportunity (RR p.351).', 'challenger-emerged', { challengerCharacterId: ch.id, challengerLevel: lvl, challengerName: ch.name });
}

function processBanditryForTurn(campaign, options){
  const A = _jACKS();
  const o = options || {};
  const rng = o.rng || Math.random;
  const out = { ruleOn: false, domains: [], logEntries: [] };
  if(!campaign) return out;
  out.ruleOn = !!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'domain-morale-banditry'));
  if(!out.ruleOn) return out;
  const turn = campaign.currentTurn || 1;
  campaign.groups = campaign.groups || [];
  const NAMES = A.MORALE_LEVEL_NAMES || {};
  for(const d of (campaign.domains || [])){
    if(!d || !d.demographics) continue;
    const dn = d.name || d.id;
    let bands = banditryBandsForDomain(campaign, d.id);
    // 1) Casualty settlement — killed bandits are the domain's own men (RR p.351).
    let killed = 0;
    for(const g of bands){
      const c = Math.max(0, g.casualties || 0);
      if(c > 0){
        killed += Math.min(c, Math.max(0, g.count || 0));
        g.count = Math.max(0, (g.count || 0) - c);
        g.casualties = 0;
      }
    }
    if(killed > 0) d.demographics.peasantFamilies = Math.max(0, (d.demographics.peasantFamilies || 0) - killed);
    // A wholly-wiped band is gone (the same disaffection raises NEW bands below if morale
    // still warrants them — RR p.351's Anárion example: defeat them, morale unchanged, a
    // fresh muster the next month).
    const wiped = new Set(bands.filter(g => (g.count || 0) <= 0).map(g => g.id));
    if(wiped.size) campaign.groups = campaign.groups.filter(g => !(g && wiped.has(g.id)));
    bands = bands.filter(g => !wiped.has(g.id));
    // 2) The RAW target off the post-settlement morale + families, split into militia-drawn
    // rebels (RR p.433 — "any rebels will be drawn from the militia": armed + trained, far
    // more dangerous) + peasant rabble. The militia POOL caps how many fight as trained
    // troops; the surplus are rabble (the Anárion example — rebels far exceed the militia).
    const target = (typeof A.banditCount === 'function') ? A.banditCount(d) : 0;
    const aliveBefore = bands.reduce((s, g) => s + Math.max(0, (g.count || 0) - (g.casualties || 0)), 0);
    const bandsBefore = bands.length;
    const militiaRow = (typeof A.domainMilitiaTroopRow === 'function') ? A.domainMilitiaTroopRow(campaign, d) : null;
    const militiaPool = (militiaRow && typeof A.domainTrainedMilitiaPool === 'function') ? A.domainTrainedMilitiaPool(campaign, d) : 0;
    const militiaTarget = (militiaRow && militiaPool > 0) ? Math.min(target, militiaPool) : 0;
    const rabbleTarget = Math.max(0, target - militiaTarget);
    const troopLabel = militiaRow ? (militiaRow.label || militiaRow.typeKey) : null;
    const morale = (d.demographics.morale != null) ? d.demographics.morale : 0;
    const moraleName = NAMES[String(morale)] || ('morale ' + morale);
    // Partition the surviving bands by whether they're militia-drawn (troopTypeKey set).
    const militiaBands = bands.filter(g => g.groupTemplate && g.groupTemplate.troopTypeKey);
    const rabbleBands = bands.filter(g => !(g.groupTemplate && g.groupTemplate.troopTypeKey));
    // Reconcile militia FIRST so a no-militia domain leaves the rng untouched for the rabble
    // shuffle — the rabble-only path is then byte-identical to the pre-split code.
    const milRes = _reconcileBanditrySubset(campaign, d, militiaBands, militiaTarget, {
      rng, turn, moraleName,
      template: () => ({ monsterCatalogKey: 'bandit', creatureTypes: ['humanoid'], hitDice: (militiaRow && militiaRow.hd) || '1',
        troopTypeKey: militiaRow.typeKey, troopRace: militiaRow.race, troopLoadout: militiaRow.loadout || null,
        troopVeteran: !!militiaRow.veteran, troopLabel }),
      bandName: (n, i) => 'Rebel ' + troopLabel + ' of ' + dn + (n > 1 ? ' · band ' + (i + 1) : ''),
      riseReason: (mn) => 'risen in armed revolt from ' + dn + '’s trained militia (morale ' + mn + ', RR p.433)'
    });
    const rabRes = _reconcileBanditrySubset(campaign, d, rabbleBands, rabbleTarget, {
      rng, turn, moraleName,
      template: () => ({ monsterCatalogKey: 'bandit', creatureTypes: ['humanoid'], hitDice: '1' }),
      bandName: (n, i) => 'Bandits of ' + dn + (n > 1 ? ' · band ' + (i + 1) : ''),
      riseReason: (mn) => 'risen from ' + dn + '’s disaffected families (morale ' + mn + ', RR pp.350–351)'
    });
    const allBands = milRes.bands.concat(rabRes.bands);
    const aliveAfter = allBands.reduce((s, g) => s + Math.max(0, (g.count || 0) - (g.casualties || 0)), 0);
    // 3) The enemy-army occupation counter (RR p.349 + p.351; moraleModifiersFor reads it).
    d.banditryOccupationMonths = (target > 0) ? ((d.banditryOccupationMonths || 0) + 1) : 0;
    // 4) The combined action (totals-derived, matching the pre-split semantics; falls back to
    // a sub-action so a militia uprising at a stable total still records).
    let action = null;
    if(target <= 0 && bandsBefore > 0) action = 'disbanded';
    else if(target > 0 && bandsBefore === 0) action = 'rise';
    else if(target > 0 && aliveAfter > aliveBefore) action = 'swell';
    else if(target > 0 && aliveAfter < aliveBefore && allBands.length) action = 'wane';
    if(!action) action = milRes.action || rabRes.action || null;
    // 5) Record what changed (a no-change plague month records nothing).
    if(killed > 0 || wiped.size > 0 || action){
      const milNote = militiaTarget > 0
        ? (' — ' + militiaTarget.toLocaleString() + ' drawn from the trained militia fight as ' + troopLabel + ' (RR p.433)')
        : '';
      const parts = [];
      if(killed > 0) parts.push(killed.toLocaleString() + ' bandits were killed — ' + dn + ' loses ' + killed.toLocaleString() + ' families (RR p.351)');
      if(action === 'rise') parts.push('⚔ Banditry plagues ' + dn + ' — ' + target.toLocaleString() + ' of its men have turned bandit (' + moraleName + ', RR pp.350–351)' + milNote + '; ' + allBands.length + ' band' + (allBands.length === 1 ? '' : 's') + ' now raid the domain');
      else if(action === 'swell') parts.push('⚔ Banditry in ' + dn + ' swells to ' + target.toLocaleString() + ' raiders (' + moraleName + ')' + milNote);
      else if(action === 'wane') parts.push('Banditry in ' + dn + ' wanes to ' + target.toLocaleString() + ' raiders' + milNote);
      else if(action === 'disbanded') parts.push('\u{1F3F3} The bandits of ' + dn + ' lay down their arms and return to their fields — morale has recovered');
      const narrative = parts.join('. ') + '.';
      const bandRoster = allBands.map(g => ({ groupId: g.id, count: g.count || 0, hexId: g.currentHexId || null,
        troopTypeKey: (g.groupTemplate && g.groupTemplate.troopTypeKey) || null }));
      _banditryEmitEvent(campaign, d, {
        action: action || 'casualties-settled', morale, target, killed, familiesLost: killed,
        militiaTarget, troopTypeKey: militiaRow ? militiaRow.typeKey : null, troopLabel,
        occupationMonths: d.banditryOccupationMonths || 0, bands: bandRoster
      }, narrative);
      out.logEntries.push(narrative);
      out.domains.push({ domainId: d.id, action: action || 'casualties-settled', target, killed, militiaTarget, bands: bandRoster });
    }
    // 6) The NPC bandit-leader challenger (RR pp.350–351) — emerge / pillage / disperse.
    _processBanditryChallenger(campaign, d, { challengerRng: o.challengerRng, turn: turn,
      target: target, morale: morale, moraleName: moraleName, bands: allBands, out: out });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 Military W4 — the slot-88 'military' day consumer: the campaign cycle
// (RR p.447). Runs AFTER journeys (slot 30) moved the armies — the shared
// ctx._armyDay stash carries each army journey's PROPOSED day-end position +
// march contacts, so this consumer evaluates post-march positions. Per day:
//   1. initiative + initial reconnaissance per army with an opposing army in
//      range (RR p.447 steps 1–2; rolled daily-when-in-range — the tool's Day
//      Clock is RAW's "shift to days in close proximity" grain 🔧),
//   2. contacts (a march that halted on an opposing army, or opposing armies
//      newly co-located) → contact recon both ways → awareness → the strategic
//      situation → a BATTLE proposal (paused for the GM; commit creates the
//      W3 Battle entity in setup),
//   3. invasions (an army's march entered an unfriendly domain, RR p.458) →
//      the immediate domain morale roll, once per army-domain,
//   4. occupation flips (the RR p.458 wages math, checked daily) + endings,
//   5. pillage progress (armies mid-pillage; the rolled Results at completion).
// All previews are SEEDED (byte-stable re-opens, the journey-preview pattern);
// an injected ctx.rng (tests) overrides. RAW core — no house rule gates this.
// ═══════════════════════════════════════════════════════════════════════════
function _seededMilitaryRng(campaign, ctx){
  const parts = ['military', (campaign.currentTurn || 1), (ctx && ctx.dayInMonth) != null ? ctx.dayInMonth : (campaign.currentDayInMonth || 1)];
  for(const a of (campaign.armies || [])){
    if(!a) continue;
    parts.push(a.id, a.currentHexId || '', a.strategicStance || '', a.journeyId || '', a.pillage ? 'p' + a.pillage.startedOrd : '');
  }
  return _jMulberry32(_jHash32(parts.join('|')));
}
function _mintBattleProposalId(rng){
  let s = '';
  for(let i = 0; i < 7; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rng() * 36)];
  return 'btl-' + s;
}
function proposeMilitaryDay(campaign, ctx){
  const A = _jACKS();
  const pendingRecords = [], notableEvents = [];
  if(!campaign || !Array.isArray(campaign.armies) || !campaign.armies.length) return { pendingRecords, notableEvents };
  ctx = ctx || {};
  const stash = ctx._armyDay || { moves: {}, contacts: [] };
  const rng = ctx.rng || _seededMilitaryRng(campaign, ctx);
  const dayInMonth = (ctx.dayInMonth != null) ? ctx.dayInMonth : (campaign.currentDayInMonth || 1);
  const ord = ((campaign.currentTurn || 1) * 30) + dayInMonth;
  const active = campaign.armies.filter(a => a && typeof A.armyTroopCount === 'function' && A.armyTroopCount(campaign, a) > 0);
  if(!active.length) return { pendingRecords, notableEvents };
  const effHex = a => { const m = stash.moves[a.id]; return (m && m.endHexId) ? m.endHexId : a.currentHexId; };
  const armyName = a => (a && a.name) || 'an army';
  // The day's weather for an army's hex (RR p.449 weather→war coupling). Mirrors the army-
  // march resolution (tickJourneyDay): the slot-1 weather consumer hands the day's per-region
  // weather down via ctx.weatherByRegion (keyed by 24-mile region); prefer THIS army's region,
  // fall back to the single ctx.weather (the common single-region case). The producer already
  // skips generation under gm-set-weather, so an absent region ⇒ null (no effect) — no on-
  // demand roll, so a static UI readout / an existing consumer test sees no phantom weather.
  const armyDayWeather = (hex) => {
    const byR = ctx.weatherByRegion;
    if(byR && hex && hex.coord && typeof A.regionKeyForCoord === 'function'){
      const k = A.regionKeyForCoord(hex.coord);
      if(k && byR[k] && byR[k].condition) return byR[k];
    }
    return (ctx.weather && ctx.weather.condition) ? ctx.weather : null;
  };
  // The day's weather for an army by its hex id (recon reads the OBSERVING army's hex —
  // RR p.449). Resolves the hex object so armyDayWeather can key the 24-mile region.
  const armyDayWeatherFor = (hexId) => armyDayWeather((campaign.hexes || []).find(h => h && h.id === hexId));

  // ── 1. initiative + initial reconnaissance (armies with an opposing army in range) ──
  const initiativeOf = {};
  for(const army of active){
    const oppos = active.filter(o => o.id !== army.id && A.armiesOpposed(campaign, army, o)
      && A.armyInReconRange(campaign, army, o, { obsHexId: effHex(army), oppHexId: effHex(o) }));
    if(!oppos.length) continue;
    const initiative = A.rollArmyInitiative(campaign, army, { rng });
    initiativeOf[army.id] = initiative.total;
    const recons = [];
    const obsWx = armyDayWeatherFor(effHex(army));   // the observing army's day weather (RR p.449 recon penalty)
    for(const o of oppos){
      const rr = A.armyReconRoll(campaign, army, o, { rng, obsHexId: effHex(army), oppHexId: effHex(o), weather: obsWx });
      const report = A.buildIntelReport(campaign, army, o, rr, { rng, atOrd: ord });
      recons.push({ opposingArmyId: o.id, opposingName: armyName(o), recon: { roll: rr.roll, total: rr.total, mods: rr.mods, result: rr.result, resultLabel: rr.resultLabel }, report });
    }
    const fat = A.armyFatigued(campaign, army, ord);
    pendingRecords.push({
      kind: 'army-day', armyId: army.id, name: armyName(army),
      label: '\u{1F396} ' + armyName(army) + ': initiative ' + initiative.total + ' (1d6 ' + initiative.roll + (initiative.sa ? ' + SA ' + initiative.sa : '') + (initiative.forcedBonus ? ' + forced march ' + initiative.forcedBonus : '') + ') · ' + recons.length + ' reconnaissance roll' + (recons.length === 1 ? '' : 's'),
      initiative, recons, fatigued: fat.fatigued ? fat : null, status: 'pending'
    });
    if(fat.fatigued){
      notableEvents.push({ kind: 'army-day', type: 'army-fatigued', transient: true,
        label: '\u{26A0} ' + armyName(army) + ' is FATIGUED — ' + fat.reasons.join('; '),
        payload: { armyId: army.id } });
    }
  }

  // ── 2. contacts → battles (RR p.447 steps 3c–d) ──
  const contacts = [];
  const seenPair = {};
  for(const c of (stash.contacts || [])){
    const a = active.find(x => x.id === c.armyId), b = active.find(x => x.id === c.opposingArmyId);
    if(!a || !b) continue;
    contacts.push({ acting: a, other: b, hexId: c.hexId });
    seenPair[[a.id, b.id].sort().join('|')] = true;
  }
  for(let i = 0; i < active.length; i++){
    for(let k = i + 1; k < active.length; k++){
      const a = active[i], b = active[k];
      if(!A.armiesOpposed(campaign, a, b)) continue;
      const ha = effHex(a), hb = effHex(b);
      if(!ha || ha !== hb) continue;
      const key = [a.id, b.id].sort().join('|');
      if(seenPair[key]) continue;
      const aMoved = !!stash.moves[a.id], bMoved = !!stash.moves[b.id];
      if(!aMoved && !bMoved) continue;   // a standing stalemate is the GM's status quo — fresh contact only
      if(_militaryBattleBetween(campaign, a, b)) continue;   // already fighting
      const acting = (aMoved && !bMoved) ? a : ((bMoved && !aMoved) ? b : ((initiativeOf[a.id] || 0) >= (initiativeOf[b.id] || 0) ? a : b));
      contacts.push({ acting, other: acting === a ? b : a, hexId: ha });
      seenPair[key] = true;
    }
  }
  for(const c of contacts){
    if(_militaryBattleBetween(campaign, c.acting, c.other)) continue;
    const contactWx = armyDayWeatherFor(c.hexId);   // both armies stand at the contact hex (RR p.449 recon penalty)
    const reconActing = A.armyReconRoll(campaign, c.acting, c.other, { rng, obsHexId: c.hexId, oppHexId: c.hexId, weather: contactWx });
    const reconOther = A.armyReconRoll(campaign, c.other, c.acting, { rng, obsHexId: c.hexId, oppHexId: c.hexId, weather: contactWx });
    const reportActing = A.buildIntelReport(campaign, c.acting, c.other, reconActing, { rng, atOrd: ord });
    const reportOther = A.buildIntelReport(campaign, c.other, c.acting, reconOther, { rng, atOrd: ord });
    const awareness = A.contactAwareness(reconActing, reconOther);
    const actingStance = c.acting.strategicStance || 'defensive';
    const otherStance = c.other.strategicStance || 'defensive';
    const sit = A.resolveStrategicSituation(awareness, actingStance, otherStance);
    const battleProposalId = sit.battle ? _mintBattleProposalId(rng) : null;
    const label = '\u{2694} ' + armyName(c.acting) + ' meets ' + armyName(c.other) + (c.hexId ? ' at ' + c.hexId : '') + ' — ' + sit.label;
    pendingRecords.push({
      kind: 'army-contact', actingArmyId: c.acting.id, otherArmyId: c.other.id, hexId: c.hexId || null,
      name: armyName(c.acting) + ' \u{2194} ' + armyName(c.other),
      reconActing: { roll: reconActing.roll, total: reconActing.total, mods: reconActing.mods, result: reconActing.result, resultLabel: reconActing.resultLabel },
      reconOther: { roll: reconOther.roll, total: reconOther.total, mods: reconOther.mods, result: reconOther.result, resultLabel: reconOther.resultLabel },
      reportActing, reportOther,
      awareness, actingStance, otherStance,
      situation: sit.situation, situationLabel: sit.label, battle: !!sit.battle,
      battleProposalId, scale: A.armyDominantScale(campaign, c.acting),
      label, status: 'pending'
    });
    notableEvents.push({
      kind: 'army-contact', type: 'army-contact', pauseTrigger: sit.battle ? 'encounter' : null,
      primaryHexId: c.hexId || null,
      relatedEntities: [
        { kind: 'army', id: c.acting.id, role: 'subject' }, { kind: 'army', id: c.other.id, role: 'target' },
        c.acting.leaderCharacterId ? { kind: 'character', id: c.acting.leaderCharacterId, role: 'commander' } : null,
        c.other.leaderCharacterId ? { kind: 'character', id: c.other.leaderCharacterId, role: 'commander' } : null
      ].filter(Boolean),
      label: label + (sit.battle ? ' — committing creates the battle (World \u{25B8} \u{1F38C} Battles)' : ' — no battle (stances hold)'),
      payload: { actingArmyId: c.acting.id, otherArmyId: c.other.id, hexId: c.hexId || null,
                 awareness, situation: sit.situation, situationLabel: sit.label, battle: !!sit.battle,
                 battleId: battleProposalId,
                 reconActing: { result: reconActing.result, total: reconActing.total },
                 reconOther: { result: reconOther.result, total: reconOther.total },
                 narrative: label }
    });
  }

  // ── 2b. garrison reaction (JJ pp.104–106) — a sally army deployed against an incursion
  //        band resolves the moment it stands on the band's hex: an abstract drive-off (a
  //        weak Unfriendly), or a W3 battle (Hostile / strong-Unfriendly; the GM may play
  //        out any in the panel). The army-vs-army contact above is army-only; this is the
  //        army-vs-band detector (the §6 engine gap). "Band moved / band gone" are surfaced
  //        live on the army card (re-route / recall — D3), not as daily records. ──
  for(const army of active){
    if(!army.reactionTargetGroupId) continue;
    if(army.reactionBattleId && (campaign.battles || []).some(b => b && b.id === army.reactionBattleId)) continue;  // a battle already fired
    const band = (campaign.groups || []).find(g => g && g.id === army.reactionTargetGroupId) || null;
    const bandAlive = band && (typeof A.groupActiveCount === 'function' ? A.groupActiveCount(band) > 0 : true);
    if(!band || !bandAlive) continue;                              // gone — the army card prompts a recall
    const armyHex = effHex(army);
    if(!armyHex || armyHex !== band.currentHexId){
      // ── AUTO-CHASE (v2, JJ p.104) — not co-located: the sally force keeps after a band
      //    that wanders before it arrives. Each day, if the band has moved off the army's
      //    march target, re-route the march to the band's last-known hex (its move commits
      //    THIS tick, so this is its committed position — a natural one-day stern-chase lag;
      //    a faster force closes in over days → the contact resolution below). Mirrors the
      //    E5 tracking re-target (commit → _quietRetargetJourney — no journey-rerouted spam;
      //    the daily chase record narrates). An arrived force (its journeyId nulled on
      //    arrival) starts a fresh march. Skips when the march already targets the band, so
      //    a march toward a stationary band produces no chase records. The GM may still
      //    re-route / recall by hand (the army card), or reject this record to hold the
      //    heading — superseding the v1 "the army card prompts re-route" narrowing. ──
      if(band.currentHexId){
        const marchJourney = army.journeyId ? (campaign.journeys || []).find(j => j && j.id === army.journeyId) : null;
        const marchingTo = marchJourney ? marchJourney.destinationHexId : null;
        const haveStart = marchJourney || (army.currentHexId && army.currentHexId !== band.currentHexId);
        if(marchingTo !== band.currentHexId && haveStart){
          pendingRecords.push({
            kind: 'army-band-chase', armyId: army.id, groupId: band.id,
            domainId: (band.incursion && band.incursion.domainId) || null,
            journeyId: marchJourney ? marchJourney.id : null, newDestinationHexId: band.currentHexId,
            fromHexId: marchingTo || armyHex || army.currentHexId || null,
            name: armyName(army) + ' \u{1F43E} ' + (band.name || 'band'),
            label: '\u{1F43E} ' + armyName(army) + ' presses the pursuit — ' + (band.name || 'the band')
              + ' moved to ' + band.currentHexId + '; re-routing to follow (JJ p.104)',
            status: 'pending'
          });
        }
      }
      continue;                                                   // en route (or chasing) — no contact this tick
    }
    const unitIds = (typeof A.armyUnits === 'function') ? A.armyUnits(campaign, army).map(u => u.id) : [];
    const prev = (typeof A.garrisonReactionPreview === 'function') ? A.garrisonReactionPreview(campaign, band, unitIds) : null;
    if(!prev) continue;
    // band strategic stance (JJ p.104): Hostile → offensive; Unfriendly → offensive if its BR
    // tops the force, else evasive (retreating).
    const bandStance = (prev.effectiveAttitude === 'hostile' || (prev.bandBr != null && prev.bandBr > prev.forceBr)) ? 'offensive' : 'evasive';
    const battle = (prev.outcome === 'battle' || prev.outcome === 'priced-by-gm');  // GM-priced → offer the panel (a weak band can still be dismissed there)
    const battleProposalId = battle ? _mintBattleProposalId(rng) : null;
    const domainId = (band.incursion && band.incursion.domainId) || null;
    const label = '\u{2694} ' + armyName(army) + ' meets ' + (band.name || 'the band') + (armyHex ? ' at ' + armyHex : '')
      + ' — ' + (battle ? 'they give battle' : 'driven off') + (prev.flips ? ' (deploying turned them unfriendly)' : '');
    pendingRecords.push({
      kind: 'army-band-contact', armyId: army.id, groupId: band.id, domainId,
      hexId: armyHex || null, name: armyName(army) + ' \u{2194} ' + (band.name || 'band'),
      forceBr: prev.forceBr, bandBr: prev.bandBr, attitude: prev.attitude, attitudeLabel: prev.attitudeLabel,
      effectiveAttitude: prev.effectiveAttitude, flips: prev.flips, lingering: prev.lingering,
      outcome: battle ? 'battle' : 'driven-off', lines: prev.lines,
      battleProposalId, scale: 'platoon', bandStance, armyStance: army.strategicStance || 'offensive',
      label, status: 'pending'
    });
    notableEvents.push({
      kind: 'domain-warfare', type: battle ? 'reaction-battle' : 'reaction-driven-off',
      pauseTrigger: battle ? 'encounter' : null,
      primaryHexId: armyHex || null, domainId,
      relatedEntities: [
        { kind: 'army', id: army.id, role: 'subject' }, { kind: 'group', id: band.id, role: 'target' },
        army.leaderCharacterId ? { kind: 'character', id: army.leaderCharacterId, role: 'commander' } : null
      ].filter(Boolean),
      label: label + (battle ? ' — committing creates the battle (Review \u{25B8} \u{1F38C} Battles)' : ' — the band is driven off'),
      payload: { action: battle ? 'reaction-battle' : 'reaction-driven-off',
                 armyId: army.id, groupId: band.id, domainId: domainId || '', hexId: armyHex || '',
                 forceBr: prev.forceBr, bandBr: (prev.bandBr != null ? prev.bandBr : undefined),
                 attitude: prev.attitude, effectiveAttitude: prev.effectiveAttitude,
                 battleId: battleProposalId || undefined, narrative: label }
    });
  }

  // ── 3. invasions (RR p.458) — marches that entered an unfriendly domain today ──
  for(const army of active){
    const m = stash.moves[army.id];
    if(!m) continue;
    const enteredDomains = {};
    for(const ph of (m.hexPath || [])){
      const h = ph && ph.hexId ? (campaign.hexes || []).find(x => x && x.id === ph.hexId) : null;
      if(!h || !h.domainId || enteredDomains[h.domainId]) continue;
      enteredDomains[h.domainId] = true;
      const dom = (campaign.domains || []).find(d => d && d.id === h.domainId);
      if(!dom || A.domainFriendlyToArmy(campaign, dom, army)) continue;
      if((army.invasions || {})[dom.id]) continue;   // the once-per-domain invasion stamp
      const extraMods = A.invasionGarrisonSupportMods(campaign, dom);
      const morale = A.immediateDomainMoraleRoll(campaign, dom, { rng, extraMods });
      const label = '\u{26A0} ' + armyName(army) + ' INVADES ' + (dom.name || 'a domain') + ' — immediate domain morale roll (RR p.458)';
      pendingRecords.push({
        kind: 'domain-invasion', armyId: army.id, domainId: dom.id, hexId: h.id,
        name: armyName(army) + ' \u{2192} ' + (dom.name || 'domain'),
        morale, label, status: 'pending'
      });
      notableEvents.push({
        kind: 'domain-warfare', type: 'domain-invaded', pauseTrigger: 'encounter',
        primaryHexId: h.id, domainId: dom.id,
        relatedEntities: [
          { kind: 'army', id: army.id, role: 'subject' }, { kind: 'domain', id: dom.id, role: 'target' },
          army.leaderCharacterId ? { kind: 'character', id: army.leaderCharacterId, role: 'commander' } : null
        ].filter(Boolean),
        label,
        payload: { action: 'invaded', armyId: army.id, domainId: dom.id, hexId: h.id,
                   moraleRoll: { roll: morale.roll, modSum: morale.modSum, adjusted: morale.adjusted, before: morale.before, after: morale.after },
                   narrative: armyName(army) + ' invaded ' + (dom.name || 'a domain') + ' (morale ' + morale.before + ' \u{2192} ' + morale.after + ').' }
      });
    }
  }

  // ── 3b. supply (RR pp.450–452, campaign-cycle step 4) — each on-campaign army checks
  //        supply weekly (daily in barrens/desert). Simplified deducts the cost; the full
  //        check resolves the line/base when triggered. Out of supply → the RR p.452 ladder
  //        + a loyalty calamity (applied on commit). ──
  for(const army of active){
    if(typeof A.armyInSupply !== 'function') break;
    const armyHex = (campaign.hexes || []).find(h => h && h.id === effHex(army));
    const baseT = (armyHex && typeof A.terrainBase === 'function') ? A.terrainBase(armyHex.terrain) : (armyHex && armyHex.terrain);
    const dailyCheck = (baseT === 'barrens' || baseT === 'desert');     // RR p.451 — checked daily there
    const since = (army.lastSupplyCheckOrd != null) ? (ord - army.lastSupplyCheckOrd) : Infinity;
    if(since < (dailyCheck ? 1 : 7)) continue;
    const sup = A.armyInSupply(campaign, army, { armyHexId: effHex(army), weather: armyDayWeather(armyHex) });
    if(sup.hungerless) continue;                                        // constructs/undead never check
    const hasWater = !!(armyHex && (baseT === 'water' || (Array.isArray(armyHex.riverSides) && armyHex.riverSides.length) || armyHex.hasLake || armyHex.freshWater));
    const dehydrated = !sup.inSupply && dailyCheck && !hasWater;
    const condition = sup.inSupply ? 'supplied' : (dehydrated ? 'dehydrated' : ((sup.fraction != null && sup.fraction >= 0.5) ? 'underfed' : 'starving'));
    const fedByReq = !!(army.requisitioning && army.requisitioning.atOrd === ord);
    const reasonText = (sup.reasons || []).map(r => ({
      'cannot-pay': "can't pay the cost", 'insufficient-base': 'no base of sufficient value',
      'line-blocked': 'supply line cut', 'line-overextended': 'supply line overextended', 'line-no-base': 'no supply base'
    })[r] || r).join(', ');
    // RR p.449 — sweltering raises the supply cost +25% (folded into sup.cost) and doubles
    // the out-of-supply penalty; surface both on the record label.
    const wxSupplyNote = (sup.weatherSupplyMult > 1) ? ' \u{00B7} sweltering +25% supply (RR p.449)' : '';
    const wxDoubledNote = (!sup.inSupply && sup.outOfSupplyDoubled) ? ' \u{00B7} penalties DOUBLED (sweltering)' : '';
    const label = sup.inSupply
      ? '\u{1F69A} ' + armyName(army) + ': in supply (' + (sup.cost || 0).toLocaleString() + 'gp/wk' + (sup.line && sup.line.status === 'simplified' ? ', simplified' : (sup.line && sup.line.weightedLength != null ? ', line ' + sup.line.weightedLength + '/16' : '')) + ')' + wxSupplyNote
      : '\u{26A0} ' + armyName(army) + ': OUT OF SUPPLY' + (reasonText ? ' — ' + reasonText : '') + ' → ' + condition + ' (RR p.452)' + wxSupplyNote + wxDoubledNote;
    pendingRecords.push({
      kind: 'army-supply', armyId: army.id, name: armyName(army),
      inSupply: sup.inSupply, cost: sup.cost, baseValue: sup.baseValue, line: sup.line || null,
      fraction: sup.fraction, dehydrated, condition, simplified: sup.simplified, simplifiedTrigger: sup.simplifiedTrigger,
      weatherSupplyMult: sup.weatherSupplyMult, outOfSupplyDoubled: sup.outOfSupplyDoubled,
      reasons: sup.reasons, ord, payGold: sup.inSupply && !fedByReq, fedByReq, hasWater,
      label, status: 'pending'
    });
    notableEvents.push({
      kind: 'army-supply', type: sup.inSupply ? 'army-supplied' : 'army-out-of-supply',
      pauseTrigger: sup.inSupply ? null : 'supplies-low',
      campaignLogHidden: sup.inSupply,                                  // routine "in supply" stays out of the chronicle
      primaryHexId: effHex(army) || null,
      relatedEntities: [{ kind: 'army', id: army.id, role: 'subject' }].concat(army.leaderCharacterId ? [{ kind: 'character', id: army.leaderCharacterId, role: 'commander' }] : []),
      label,
      payload: { armyId: army.id, inSupply: sup.inSupply, cost: sup.cost, baseValue: sup.baseValue,
                 lineStatus: sup.line ? sup.line.status : null, reasons: sup.reasons, condition,
                 narrative: label }
    });
  }

  // ── 3c. Vagaries of War (JJ pp.113–115, W8) — each on-campaign army rolls weekly, AFTER the
  //        supply check, behind the vagaries-of-war rule (twice/week in a siege → take the worse).
  //        An Army entity IS a mustered field force, so every active army counts as "on campaign"
  //        (RAW's finer "in enemy territory / >1 month" gating is a 🔧 v1 simplification). The
  //        rolled vagary is a GM-resolve record + a vagary-of-war event; the self-contained Good/
  //        Ill Omen ±10-to-next-roll modifier is applied on commit. Weekly cadence via
  //        army.lastWarVagaryOrd (the supply check's lastSupplyCheckOrd convention). ──
  if(typeof A.rollWarVagary === 'function' && typeof A.isHouseRuleEnabled === 'function'
     && A.isHouseRuleEnabled(campaign, 'vagaries-of-war')){
    for(const army of active){
      if(typeof A.warVagaryDue === 'function' && !A.warVagaryDue(campaign, army, ord)) continue;
      const v = A.rollWarVagary(campaign, army, { rng });
      if(!v || !v.row) continue;
      const leaderDomain = army.leaderCharacterId ? (campaign.domains || []).find(d => d && d.rulerCharacterId === army.leaderCharacterId) || null : null;
      const unit = (typeof A.vagaryRealmUnitSize === 'function') ? A.vagaryRealmUnitSize(campaign, leaderDomain) : null;
      const isNone = !!(v.row.effect && v.row.effect.category === 'none');
      const detail = (v.siege ? ' [siege — worst of ' + v.draws.length + ']' : '') + (v.mod ? ' [' + (v.mod > 0 ? '+' : '') + v.mod + ' carried]' : '');
      const label = '\u{1F3B2} ' + armyName(army) + ' — Vagary of War: ' + v.row.name + ' (' + v.row.brief + ')' + detail;
      pendingRecords.push({
        kind: 'army-vagary', armyId: army.id, name: armyName(army),
        vagaryKey: v.row.key, vagaryName: v.row.name, brief: v.row.brief, effect: v.row.effect,
        roll: v.roll, mod: v.mod, total: v.total, siege: v.siege, nextMod: v.nextMod,
        realmUnitScale: unit ? unit.scale : null, ord,
        label, status: 'pending'
      });
      notableEvents.push({
        kind: 'vagary-of-war', type: 'vagary-of-war',
        pauseTrigger: isNone ? null : 'encounter',                        // a consequential vagary halts a multi-day advance for GM review
        campaignLogHidden: isNone,                                        // "All Quiet" stays out of the chronicle (Event Log only)
        primaryHexId: effHex(army) || null,
        relatedEntities: [{ kind: 'army', id: army.id, role: 'subject' }].concat(army.leaderCharacterId ? [{ kind: 'character', id: army.leaderCharacterId, role: 'commander' }] : []),
        label,
        payload: { armyId: army.id, vagaryKey: v.row.key, name: v.row.name, brief: v.row.brief,
                   roll: v.roll, mod: v.mod, total: v.total, pickBest: v.pickBest, pickWorst: v.pickWorst,
                   siege: v.siege, realmUnitScale: unit ? unit.scale : null, effect: v.row.effect, narrative: label }
      });
    }
  }

  // ── 3d. weather disease (RR p.449, core RAW — NOT gated on vagaries-of-war) — each on-
  //        campaign army runs a WEEKLY disease check: frigid/cold exposure (10%/5%) and
  //        rainy/snowy wetness (10%) are separate causes, each its own roll. A hit = an
  //        epidemic (each unit makes a Death save or is incapacitated, JJ pp.113–114; GM-
  //        resolved). An ISOLATED per-army seeded rng keeps these draws out of the main
  //        military stream (initiative/recon/contact/vagaries/pillage stay byte-stable);
  //        placed after vagaries so its presence never shifts those draws either. ──
  if(typeof A.rollArmyWeatherDisease === 'function'){
    for(const army of active){
      const armyHex = (campaign.hexes || []).find(h => h && h.id === effHex(army));
      const dayWx = armyDayWeather(armyHex);
      if(!dayWx) continue;
      const since = (army.lastWeatherDiseaseOrd != null) ? (ord - army.lastWeatherDiseaseOrd) : Infinity;
      if(since < 7) continue;                                            // weekly cadence
      const diseaseRng = _jMulberry32(_jHash32('military-disease|' + ord + '|' + army.id));
      const dz = A.rollArmyWeatherDisease(campaign, army, { weather: dayWx, rng: diseaseRng });
      if(!dz.chance) continue;                                           // this weather carries no disease chance → no check
      if(dz.contracted){
        const causeText = (dz.causes || []).join(' + ');
        const label = '\u{1F9A0} ' + armyName(army) + ': a disease breaks out (' + causeText + ', RR p.449) — each unit makes a Death save or is incapacitated (JJ pp.113\u{2013}114)';
        pendingRecords.push({
          kind: 'army-disease', armyId: army.id, name: armyName(army), contracted: true,
          condPct: dz.condPct, tempPct: dz.tempPct, causes: dz.causes, condition: dz.condition, temperature: dz.temperature,
          ord, label, status: 'pending'
        });
        notableEvents.push({
          kind: 'army-disease', type: 'army-disease', pauseTrigger: 'encounter',   // a weather epidemic halts a multi-day advance for GM review
          primaryHexId: effHex(army) || null,
          relatedEntities: [{ kind: 'army', id: army.id, role: 'subject' }].concat(army.leaderCharacterId ? [{ kind: 'character', id: army.leaderCharacterId, role: 'commander' }] : []),
          label,
          payload: { armyId: army.id, contracted: true, causes: dz.causes, condPct: dz.condPct, tempPct: dz.tempPct,
                     condition: dz.condition, temperature: dz.temperature, narrative: label }
        });
      } else {
        // a quiet "checked, no disease" record carries the weekly cadence advance on commit;
        // it fires only on disease-weather weeks (uncommon), so it's low-noise (no notable).
        pendingRecords.push({
          kind: 'army-disease', armyId: army.id, name: armyName(army), contracted: false,
          condPct: dz.condPct, tempPct: dz.tempPct, ord, status: 'pending',
          label: '\u{1F9A0} ' + armyName(army) + ': no disease this week (' + (dz.condPct ? dz.condPct + '% wetness' : '') + (dz.condPct && dz.tempPct ? ' + ' : '') + (dz.tempPct ? dz.tempPct + '% exposure' : '') + ', RR p.449)'
        });
      }
    }
  }

  // ── 4. occupation flips + endings (RR p.458, the wages math checked daily) ──
  const overrides = {};
  for(const a of active){ const m = stash.moves[a.id]; if(m && m.endHexId) overrides[a.id] = m.endHexId; }
  for(const dom of (campaign.domains || [])){
    if(!dom) continue;
    const status = A.domainOccupationStatus(campaign, dom, { armyHexOverrides: overrides });
    if(status.occupied && !dom.occupiedBy){
      const occupier = (campaign.characters || []).find(ch => ch && ch.id === status.occupierLeaderId) || null;
      const label = '\u{1F3F4} ' + (dom.name || 'A domain') + ' is OCCUPIED by ' + (occupier ? occupier.name : 'the invaders') + ' (' + status.netPerFamily.toFixed(1) + 'gp/family of occupying troops > ' + status.threshold + 'gp garrison cost, RR p.458)';
      pendingRecords.push({
        kind: 'domain-occupation', domainId: dom.id, name: dom.name || 'domain',
        occupierLeaderId: status.occupierLeaderId, occupierArmyIds: status.occupierArmyIds,
        math: { occupyingWages: status.occupyingWages, defendingWages: status.defendingWages, peasantFamilies: status.peasantFamilies, netPerFamily: status.netPerFamily, threshold: status.threshold },
        label, status: 'pending'
      });
      notableEvents.push({
        kind: 'domain-warfare', type: 'domain-occupied', domainId: dom.id,
        primaryHexId: null,
        relatedEntities: [
          { kind: 'domain', id: dom.id, role: 'target' },
          status.occupierLeaderId ? { kind: 'character', id: status.occupierLeaderId, role: 'commander' } : null
        ].filter(Boolean),
        label,
        payload: { action: 'occupied', domainId: dom.id, occupierLeaderId: status.occupierLeaderId,
                   math: { occupyingWages: status.occupyingWages, defendingWages: status.defendingWages, netPerFamily: status.netPerFamily, threshold: status.threshold },
                   narrative: label }
      });
    } else if(!status.occupied && dom.occupiedBy){
      const months = Math.max(1, A.occupationMonths(campaign, dom, ord));
      const label = '\u{1F3F3} The occupation of ' + (dom.name || 'a domain') + ' is BROKEN — the owner resumes control (next morale roll \u{2212}' + months + ', RR p.458)';
      pendingRecords.push({
        kind: 'occupation-end', domainId: dom.id, name: dom.name || 'domain', months, label, status: 'pending'
      });
      notableEvents.push({
        kind: 'domain-warfare', type: 'occupation-ended', domainId: dom.id, primaryHexId: null,
        relatedEntities: [{ kind: 'domain', id: dom.id, role: 'target' }],
        label,
        payload: { action: 'occupation-ended', domainId: dom.id, months, narrative: label }
      });
    }
  }

  // ── 5. pillage progress (RR pp.458–459) ──
  for(const army of active){
    if(!army.pillage) continue;
    const p = army.pillage;
    const dom = (campaign.domains || []).find(d => d && d.id === p.domainId);
    if(!dom) continue;
    const elapsed = ord - p.startedOrd + 1;   // the start day counts (a 1-day pillage completes the day it began)
    if(elapsed >= p.daysRequired){
      const results = A.rollPillageResults(campaign, dom, { rng, saltTheEarth: p.saltTheEarth, proportionUnits: p.unitsProportion });
      const morale = results.destroyed ? null : A.immediateDomainMoraleRoll(campaign, dom, { rng, extraMods: [{ label: 'The domain was pillaged (RR p.459)', value: -4 }] });
      const label = '\u{1F525} ' + armyName(army) + (p.saltTheEarth ? ' SALTS THE EARTH of ' : ' pillages ') + (dom.name || 'the domain') + ': ' + results.gold.toLocaleString() + 'gp, ' + results.supplies.toLocaleString() + 'gp supplies, ' + results.prisoners + ' prisoners; ' + results.familiesLost + ' families lost' + (results.destroyed ? ' — the domain is DESTROYED' : '');
      pendingRecords.push({
        kind: 'pillage-complete', armyId: army.id, domainId: dom.id,
        name: armyName(army) + ' \u{2192} ' + (dom.name || 'domain'),
        results, morale, label, status: 'pending'
      });
      notableEvents.push({
        kind: 'domain-warfare', type: 'domain-pillaged', pauseTrigger: 'encounter', domainId: dom.id,
        primaryHexId: army.currentHexId || null,
        relatedEntities: [
          { kind: 'army', id: army.id, role: 'subject' }, { kind: 'domain', id: dom.id, role: 'victim' },
          army.leaderCharacterId ? { kind: 'character', id: army.leaderCharacterId, role: 'commander' } : null
        ].filter(Boolean),
        label,
        payload: { action: 'pillaged', armyId: army.id, domainId: dom.id, saltTheEarth: p.saltTheEarth,
                   results: { gold: results.gold, supplies: results.supplies, prisoners: results.prisoners, familiesLost: results.familiesLost, destroyed: results.destroyed, proportion: results.proportion },
                   narrative: label }
      });
    } else {
      notableEvents.push({
        kind: 'army-day', type: 'pillage-progress', transient: true,
        label: '\u{1F525} ' + armyName(army) + (p.saltTheEarth ? ' salts the earth of ' : ' pillages ') + (dom.name || 'the domain') + ' — day ' + elapsed + ' of ' + p.daysRequired,
        payload: { armyId: army.id, domainId: dom.id }
      });
    }
  }
  return { pendingRecords, notableEvents };
}
function _militaryBattleBetween(campaign, a, b){
  for(const btl of (campaign.battles || [])){
    if(!btl || !(btl.status === 'setup' || btl.status === 'fighting' || btl.status === 'ended')) continue;
    const ids = [btl.sides && btl.sides.a && btl.sides.a.armyId, btl.sides && btl.sides.b && btl.sides.b.armyId];
    if(ids.indexOf(a.id) >= 0 && ids.indexOf(b.id) >= 0) return btl;
  }
  return null;
}
// COMMIT half — applies a ratified military record to the real campaign (and to the
// working copy between proposal days). Events ride the notable-event channel
// (emitDayTickEvents) — the commits here write STATE.
function commitMilitaryRecord(campaign, record){
  const A = _jACKS();
  if(!campaign || !record) return;
  if(record.kind === 'army-day'){
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId);
    if(!army) return;
    if(record.initiative) army.lastInitiative = record.initiative.total;
    if(Array.isArray(record.recons) && record.recons.length){
      if(!Array.isArray(army.intelReports)) army.intelReports = [];
      for(const r of record.recons){ if(r && r.report) army.intelReports.push(r.report); }
      if(army.intelReports.length > 40) army.intelReports = army.intelReports.slice(-40);
    }
  } else if(record.kind === 'army-contact'){
    const acting = (campaign.armies || []).find(a => a && a.id === record.actingArmyId);
    const other = (campaign.armies || []).find(a => a && a.id === record.otherArmyId);
    if(acting && record.reportActing){ (acting.intelReports = acting.intelReports || []).push(record.reportActing); }
    if(other && record.reportOther){ (other.intelReports = other.intelReports || []).push(record.reportOther); }
    if(record.battle && record.battleProposalId && acting && other && typeof A.createBattle === 'function'){
      if(!(campaign.battles || []).some(b => b && b.id === record.battleProposalId)){
        A.createBattle(campaign, {
          id: record.battleProposalId,
          hexId: record.hexId || null,
          scale: record.scale || 'company',
          awareness: record.awareness || 'mutual',
          sideA: { kind: 'army', armyId: acting.id, stance: record.actingStance || 'defensive' },
          sideB: { kind: 'army', armyId: other.id, stance: record.otherStance || 'defensive' }
        });
      }
    }
  } else if(record.kind === 'army-band-contact'){
    // Garrison reaction (JJ pp.104–106): the sally force has reached the band.
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId) || null;
    const band = (campaign.groups || []).find(g => g && g.id === record.groupId) || null;
    if(!army || !band) return;
    const dom = (campaign.domains || []).find(d => d && d.id === record.domainId) || null;
    const turn = campaign.currentTurn || 1;
    // neutral / mercantilist / friendly bands turn UNFRIENDLY when deployed against (JJ p.104).
    if(record.flips && band.incursion){
      band.incursion.attitude = 'unfriendly';
      (band.history = band.history || []).push({ turn, type: 'incursion',
        reason: 'turned unfriendly — the garrison deployed against it (JJ p.104)' });
    }
    if(record.outcome === 'battle'){
      if(record.battleProposalId && typeof A.createBattle === 'function'
         && !(campaign.battles || []).some(b => b && b.id === record.battleProposalId)){
        A.createBattle(campaign, {
          id: record.battleProposalId,
          name: (army.name || 'Reaction force') + ' vs ' + (band.name || 'the band'),
          hexId: record.hexId || null,
          scale: record.scale || 'platoon',
          awareness: 'mutual',
          sideA: { kind: 'army', armyId: army.id, stance: record.armyStance || 'offensive' },
          sideB: { kind: 'groups', groupIds: [band.id], stance: record.bandStance || 'offensive' },
          options: { armySizeAsymmetry: true }
        });
        army.reactionBattleId = record.battleProposalId;     // the re-fire guard (one battle per reaction)
        (army.history = army.history || []).push({ turn, type: 'reaction-battle',
          text: 'Gave battle to ' + (band.name || 'the band') + (dom ? (' in ' + (dom.name || dom.id)) : '') + ' (JJ p.104)' });
      }
    } else {   // driven off (JJ p.104) — the band is repelled and leaves the field
      if(band.incursion){ band.incursion.outcome = 'driven-off'; band.incursion.drivenOffAtTurn = turn; }
      band.currentHexId = null;                              // out of the hex — off the active map (no longer the domain's problem)
      band.wanderState = null;
      (band.history = band.history || []).push({ turn, type: 'incursion',
        reason: 'driven off by ' + (army.name || 'the garrison') + ' (JJ p.104) — repelled from ' + (dom ? (dom.name || dom.id) : 'the domain') });
      army.reactionTargetGroupId = null;                     // mission accomplished — the GM recalls the force
      (army.history = army.history || []).push({ turn, type: 'reaction-driven-off',
        text: 'Drove off ' + (band.name || 'the band') + (dom ? (' from ' + (dom.name || dom.id)) : '') + ' (JJ p.104)' });
    }
  } else if(record.kind === 'army-band-chase'){
    // Garrison-reaction AUTO-CHASE (v2, JJ p.104): the band wandered before the sally force
    // arrived — re-target its march to follow (the E5 _quietRetargetJourney pattern; no
    // journey-rerouted spam — the daily chase record narrates). The journey is found by the
    // id captured at propose: an arrival committed THIS same tick (the journeys consumer,
    // slot 30) nulled army.journeyId + flipped the journey to 'arrived', so we re-link it and
    // _quietRetargetJourney resumes it. A force with no journey at all (arrived before this
    // record was raised) starts a fresh march from where it stands.
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId) || null;
    const band = (campaign.groups || []).find(g => g && g.id === record.groupId) || null;
    if(!army || !band || !record.newDestinationHexId) return;
    const turn = campaign.currentTurn || 1;
    let j = record.journeyId ? (campaign.journeys || []).find(x => x && x.id === record.journeyId) : null;
    if(!j && army.journeyId) j = (campaign.journeys || []).find(x => x && x.id === army.journeyId);
    if(j){
      _quietRetargetJourney(campaign, j, record.newDestinationHexId);
      army.journeyId = j.id;                                  // re-link — an arrival this same tick may have nulled it
    } else if(army.currentHexId && army.currentHexId !== record.newDestinationHexId && typeof A.startArmyMarch === 'function'){
      A.startArmyMarch(campaign, army.id, { destinationHexId: record.newDestinationHexId, pace: 'normal' });
    }
    (army.history = army.history || []).push({ turn, type: 'reaction-chase',
      text: 'Pressed the pursuit — re-routed to follow ' + (band.name || 'the band') + ' to ' + record.newDestinationHexId + ' (JJ p.104)' });
  } else if(record.kind === 'domain-invasion'){
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId);
    const dom = (campaign.domains || []).find(d => d && d.id === record.domainId);
    if(!dom) return;
    if(record.morale && typeof A.applyImmediateMoraleResult === 'function') A.applyImmediateMoraleResult(campaign, dom, record.morale);
    if(army){
      if(!army.invasions || typeof army.invasions !== 'object') army.invasions = {};
      army.invasions[dom.id] = ((campaign.currentTurn || 1) * 30) + (campaign.currentDayInMonth || 1);
      (army.history = army.history || []).push({ turn: campaign.currentTurn || null, dayInMonth: campaign.currentDayInMonth || null, type: 'invasion', narrative: (army.name || 'The army') + ' invaded ' + (dom.name || 'a domain') + '.' });
    }
  } else if(record.kind === 'domain-occupation'){
    if(typeof A.occupyDomain === 'function') A.occupyDomain(campaign, record.domainId, { leaderCharacterId: record.occupierLeaderId || null });
  } else if(record.kind === 'occupation-end'){
    if(typeof A.endOccupation === 'function') A.endOccupation(campaign, record.domainId, {});
  } else if(record.kind === 'army-supply'){
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId);
    if(!army) return;
    if(typeof A.applyArmySupplyOutcome === 'function'){
      A.applyArmySupplyOutcome(campaign, army, {
        inSupply: record.inSupply, cost: record.cost, fraction: record.fraction,
        dehydrated: record.dehydrated, payGold: record.payGold, ord: record.ord,
        outOfSupplyDoubled: record.outOfSupplyDoubled   // RR p.449 — sweltering doubles the out-of-supply penalty
      });
    }
  } else if(record.kind === 'army-disease'){
    // RR p.449 weather disease — advance the weekly disease cadence. A contracted epidemic
    // is a GM-resolve event (the notable, emitted by the orchestrator); the per-unit Death
    // saves are the GM's (like the W8 Disease vagary). (Reject = the cadence does NOT advance,
    // so the army is re-checked the next due tick.)
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId);
    if(!army) return;
    army.lastWeatherDiseaseOrd = (record.ord != null) ? record.ord : ((campaign.currentTurn || 1) * 30 + (campaign.currentDayInMonth || 1));
  } else if(record.kind === 'army-vagary'){
    // Phase 3 Military W8 — the Vagaries of War (JJ pp.113–115). The vagary-of-war EVENT was emitted
    // by the orchestrator (the notable); here we only advance the weekly cadence + carry the self-
    // contained Good/Ill Omen ±10-to-next-roll modifier. The GM applies the rest. (Reject = the
    // cadence does NOT advance, so the army is re-rolled the next tick.)
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId);
    if(!army) return;
    army.lastWarVagaryOrd = record.ord;
    army.vagaryWarNextMod = record.nextMod || 0;     // overwrites the consumed carried mod + sets the new omen mod (0 if none)
    (army.history = army.history || []).push({ turn: campaign.currentTurn || null, dayInMonth: campaign.currentDayInMonth || null, type: 'vagary-of-war', text: 'Vagary of War: ' + (record.vagaryName || record.vagaryKey) });
  } else if(record.kind === 'pillage-complete'){
    const army = (campaign.armies || []).find(a => a && a.id === record.armyId);
    const dom = (campaign.domains || []).find(d => d && d.id === record.domainId);
    if(!army || !dom) return;
    if(typeof A.applyPillageResults === 'function') A.applyPillageResults(campaign, army, dom, record.results, record.morale);
    army.pillage = null;
  }
}

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
  // CoL-1 (Provisioning §16.2) — off-journey survival, slot 35 (right after travel; dedups vs journeys).
  ACKS.registerDayConsumer('survival', {
    handler: proposeSurvivalDay,
    order: 35,
    pauseTriggers: ['supplies-low'],
    commit: commitSurvivalRecord
  });
  // Phase 2.95 #310 — day-aware recruitment, slot 45: advances active solicitation drives (RR p.164).
  ACKS.registerDayConsumer('recruitment', {
    handler: proposeRecruitmentDay,
    order: 45,
    pauseTriggers: [],
    commit: commitRecruitmentRecord
  });
  // #476 E1 — the slot-80 collision/encounter consumer: rest/night checks for stationary
  // field groups (JJ p.41). The Calendar §12 reserved slot's first occupant.
  ACKS.registerDayConsumer('encounters', {
    handler: proposeEncounterDay,
    order: 80,
    pauseTriggers: ['encounter'],
    commit: commitEncounterRecord
  });
  // #476 E3c + E5 — pursuit, both directions (slot 82): monster chases follow the party's
  // trail daily (the 'monster-pursuit' rule gates the OFFER); party follows track their
  // quarry (E5 — RAW-core, no rule). A catch-up pauses the tick; a lost trail pauses as a
  // navigation-fail.
  ACKS.registerDayConsumer('pursuit', {
    handler: proposePursuitDay,
    order: 82,
    pauseTriggers: ['encounter', 'navigation-fail'],
    commit: commitPursuitRecord
  });
  // #476 E6 — autonomous band motion (slot 84): wandering migrants + homing post-chase
  // bands. No pause triggers — the world moves on its own; settles + domain incursions
  // surface as notables in the review.
  ACKS.registerDayConsumer('monster-bands', {
    handler: proposeMonsterBandDay,
    order: 84,
    pauseTriggers: [],
    commit: commitMonsterBandRecord
  });
  // Phase 3 Military W2 — the Vagaries of Incursion (slot 86): the daily domain-
  // encounter probability + materialization (JJ pp.100–106), behind the
  // vagaries-of-incursion rule. Runs AFTER monster-bands so a physical border
  // crossing (the E6 occurrence) suppresses the day's roll — never double-roll.
  ACKS.registerDayConsumer('incursions', {
    handler: proposeIncursionDay,
    order: 86,
    pauseTriggers: ['encounter'],
    commit: commitIncursionRecord
  });
  // Phase 3 Military W4 + W5 — the campaign cycle (slot 88, RR p.447): initiative +
  // reconnaissance, army contacts → battles, invasions → the immediate morale roll,
  // the weekly supply check (W5, step 4), occupation flips, pillage progress. Runs
  // LAST so the day's marches (slot 30, via the ctx._armyDay stash) are on the table.
  ACKS.registerDayConsumer('military', {
    handler: proposeMilitaryDay,
    order: 88,
    pauseTriggers: ['encounter', 'supplies-low'],
    commit: commitMilitaryRecord
  });
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
