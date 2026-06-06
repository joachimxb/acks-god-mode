/* =============================================================================
 * acks-engine-economy.js — ACKS God Mode Domain Economy (Module: economy)
 *
 * Lifted out of index.html on 2026-06-06 (audit batch 3 — engine↔UI boundary
 * inversion, thermonuclear.md C1 / Restructuring Appendix R1). These are the
 * pure ACKS income / expense / morale / tribute / XP rules. They previously
 * lived ONLY in the Alpine UI, so proposeMonthlyTurn / commitTurn (in
 * acks-engine.js) had to call BACK UP into the UI through a 24-method `helpers`
 * bag — a third-party tool, a bot, or a headless test could not compute a
 * domain's monthly economy without the browser. Now the engine owns the rules
 * and the UI methods delegate down here (the same direction the UI already used
 * for bankersRound / roundToNearest5 / effectiveDomainClassification).
 *
 * Every function is pure (campaign, domain) → value / rows — no `this`, no DOM,
 * no Alpine. House-rule reads go through ACKS.isHouseRuleEnabled(campaign, id).
 * Sibling/vassal lookups read campaign.domains directly (single home — audit
 * batch 2). Computed values are byte-identical to the pre-lift UI; the
 * characterization oracle in tests/economy.smoke.js asserts it.
 *
 * Load order: AFTER acks-engine-catalogs.js (STRONGHOLD_CATALOG), acks-engine.js
 * (the rounding/morale/market/classification helpers + the morale/tax/garrison
 * constants) and acks-engine-entities.js (MAGISTRATE_ROLES / _SALARY_FRACTION).
 * Function-to-function references inside the module are direct; references OUT
 * to other engine modules are call-time aliases onto global.ACKS.
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Constants owned by earlier-loaded modules (catalogs / engine / entities). Captured at
// load time — this module loads after all three, per the load-order note above.
const STRONGHOLD_CATALOG          = ACKS.STRONGHOLD_CATALOG;
const MAGISTRATE_ROLES            = ACKS.MAGISTRATE_ROLES;
const MAGISTRATE_SALARY_FRACTION  = ACKS.MAGISTRATE_SALARY_FRACTION;
const DEFAULT_TAX_RATES           = ACKS.DEFAULT_TAX_RATES;
const REQUIRED_GARRISON_PER_FAMILY= ACKS.REQUIRED_GARRISON_PER_FAMILY;
const INCOME_FACTOR_BY_MORALE     = ACKS.INCOME_FACTOR_BY_MORALE;
const STRONGHOLD_VALUE_PER_HEX    = ACKS.STRONGHOLD_VALUE_PER_HEX;

// Call-time aliases for engine helpers in this + other modules (resolve at invocation, so load
// order between sibling modules never matters for the function bodies).
const bankersRound                 = (...a) => ACKS.bankersRound(...a);
const roundToNearest5              = (...a) => ACKS.roundToNearest5(...a);
const rawTributeForRealmFamilies   = (...a) => ACKS.rawTributeForRealmFamilies(...a);
const lookupMarketClass            = (...a) => ACKS.lookupMarketClass(...a);
const urbanMaxFamilies             = (...a) => ACKS.urbanMaxFamilies(...a);
const strongholdMoralePenalty      = (...a) => ACKS.strongholdMoralePenalty(...a);
const effectiveDomainClassification= (...a) => ACKS.effectiveDomainClassification(...a);
const computePersonalAuthority     = (...a) => ACKS.computePersonalAuthority(...a);
const computeGpThreshold           = (...a) => ACKS.computeGpThreshold(...a);
const isPlayerControlled           = (...a) => ACKS.isPlayerControlled(...a);
const isHenchman                   = (...a) => ACKS.isHenchman(...a);
const isHouseRuleEnabled           = (campaign, id) => ACKS.isHouseRuleEnabled(campaign, id);

// =============================================================================
// Realm structure (vassal walk) — reads campaign.domains (single home).
// =============================================================================
function vassalsOf(campaign, id){ return (campaign.domains||[]).filter(d => d.liegeId === id); }
// Flat list of {domain, depth} for domains BELOW the given id (vassals, sub-vassals, …).
function vassalChainUnder(campaign, rootId){
  const out = [];
  const visited = new Set([rootId]);
  const visit = (parentId, depth) => {
    vassalsOf(campaign, parentId).forEach(v => {
      if(visited.has(v.id)) return;
      visited.add(v.id);
      out.push({ domain: v, depth });
      visit(v.id, depth + 1);
    });
  };
  visit(rootId, 0);
  return out;
}

// =============================================================================
// Population + families
// =============================================================================
function hexSettlements(d){
  return (d.geography?.hexes||[])
    .map((h,i) => ({ hex:h, hexIndex:i, settlement:h.settlement }))
    .filter(x => x.settlement);
}
function totalUrbanFamiliesFromHexes(d){ return hexSettlements(d).reduce((s,x) => s + (x.settlement.families||0), 0); }
function totalUrbanInvestmentFromHexes(d){ return hexSettlements(d).reduce((s,x) => s + (x.settlement.totalInvestment||0), 0); }
// Per-hex settlements take precedence; falls back to legacy aggregate demographics.urbanFamilies.
function effectiveUrbanFamilies(d){
  const fromHexes = totalUrbanFamiliesFromHexes(d);
  if(fromHexes > 0 || hexSettlements(d).length > 0) return fromHexes;
  return d.demographics?.urbanFamilies || 0;
}
function totalFamilies(d){ return (d.demographics.peasantFamilies||0) + effectiveUrbanFamilies(d); }

// =============================================================================
// Land value + improvements
// =============================================================================
// Effective per-hex land value INCLUDING agricultural improvements (Phase 2a.5). Cap 9gp/family (RR p.341).
function effectiveHexValue(h){
  const base  = h?.valuePerFamily || 0;
  const bonus = h?.landImprovementBonus || 0;
  return Math.min(9, base + bonus);
}
function domainTotalLandImprovementBonus(d){
  const hexes = d.geography?.hexes || [];
  return hexes.reduce((s,h) => s + (h.landImprovementBonus||0), 0);
}

// =============================================================================
// Markets / settlements (RR pp.350–351)
// =============================================================================
function settlementMarketClass(s){ return lookupMarketClass(s.families||0).class; }
function settlementTradeRate(s){ return lookupMarketClass(s.families||0).tradePerFamily; }
function settlementCapacity(s){ return urbanMaxFamilies(s.totalInvestment||0); }
// Domain-level market class summary (largest settlement's class, or legacy aggregate).
function marketClassRow(d){ return lookupMarketClass(effectiveUrbanFamilies(d)); }
function marketClass(d){ return marketClassRow(d).class; }
function tradeRevenuePerFamily(d){ return marketClassRow(d).tradePerFamily; }
function urbanCapacity(d){
  const hexInv = totalUrbanInvestmentFromHexes(d);
  if(hexInv > 0) return urbanMaxFamilies(hexInv);
  return urbanMaxFamilies(d.urban?.totalInvestment||0);
}

// =============================================================================
// Garrison (RR p.351)
// =============================================================================
function garrisonHeadcount(d){ return (d.garrison?.units||[]).reduce((s,u) => s + (u.count||0), 0); }
function garrisonCost(d){ return (d.garrison?.units||[]).reduce((s,u) => s + (u.count||0)*(u.monthlyWage||0), 0); }
function garrisonBR(d){ return (d.garrison?.units||[]).reduce((s,u) => s + (u.count||0)*(u.brPerSoldier||0), 0); }
// Required garrison cost = peasant rate × peasant families + 2gp × urban families (urban flat, RR p.351).
function requiredGarrison(campaign, d){
  const peasantReq = (REQUIRED_GARRISON_PER_FAMILY[effectiveDomainClassification(d)]||2) * (d.demographics.peasantFamilies||0);
  const urbanReq = 2 * effectiveUrbanFamilies(d);
  return peasantReq + urbanReq;
}
// Bandits per RR p.350 — emerge from disgruntled domains at low morale.
function banditCount(d){
  const fam = d.demographics?.peasantFamilies || 0;
  const m = d.demographics?.morale ?? 0;
  if(m <= -4) return fam;
  if(m === -3) return Math.floor(fam/2);
  if(m === -2) return Math.floor(fam/5);
  return 0;
}

// =============================================================================
// Stronghold value + requirement (RR pp.348–349)
// =============================================================================
function strongholdRequired(d){ return (d.geography?.controlledHexes||0) * STRONGHOLD_VALUE_PER_HEX; }
// Effective stronghold value across all components (Foundation #16). When stronghold-by-buildings is
// on AND a component has structures, that component's value is computed from its structures; else its
// manual buildValue. Falls back to the legacy single-stronghold shape if components hasn't migrated.
function strongholdValue(campaign, d){
  if(!d || !d.stronghold) return 0;
  const buildingsOn = isHouseRuleEnabled(campaign, 'stronghold-by-buildings');
  const comps = Array.isArray(d.stronghold.components) ? d.stronghold.components : null;
  if(comps){
    return comps.reduce((sum, c) => {
      if(buildingsOn && Array.isArray(c.structures) && c.structures.length > 0){
        return sum + c.structures.reduce((s, row) => {
          const cat = STRONGHOLD_CATALOG.find(x => x.key === row.structureKey);
          return s + (cat ? cat.cost * (row.quantity||0) : 0);
        }, 0);
      }
      return sum + (c.buildValue || 0);
    }, 0);
  }
  if(buildingsOn && (d.stronghold.structures||[]).length > 0){
    return d.stronghold.structures.reduce((s, row) => {
      const cat = STRONGHOLD_CATALOG.find(c => c.key === row.structureKey);
      return s + (cat ? cat.cost * (row.quantity||0) : 0);
    }, 0);
  }
  return d.stronghold.buildValue || 0;
}

// =============================================================================
// Magistrate salaries (RR p.344 — 12.5% of overseen expense, paid out of the pool)
// =============================================================================
function magistrateBaseExpenseForRole(campaign, d, roleKey){
  if(!d) return 0;
  const fam = d.demographics?.peasantFamilies || 0;
  const urb = effectiveUrbanFamilies(d);
  switch(roleKey){
    case 'captainOfGuard': return garrisonCost(d);
    case 'chaplain':       return d.expenses?.tithePaid ? (fam+urb) : 0;
    case 'munerator':      return (d.expenses?.liturgyPerFamily ?? 1) * (fam+urb);
    case 'steward':        return fam + urb;
    default: return 0;
  }
}
function magistrateSalaryForRole(campaign, d, roleKey){
  const base = magistrateBaseExpenseForRole(campaign, d, roleKey);
  return bankersRound(base * (MAGISTRATE_SALARY_FRACTION || 0.125));
}
// Everyone administering the domain this month — ruler if administersThisMonth, plus any magistrate
// slot whose administersThisMonth is set. Returns [{who, via}]. Drives the +1 morale lever + the UI.
function magistrateAdminCandidates(campaign, d){
  if(!d) return [];
  const out = [];
  if(d.administersThisMonth){
    const r = rulerCharacter(campaign, d);
    out.push({ who: r ? r.name : 'Ruler', via: 'ruler' });
  }
  const mg = d.magistrates || {};
  const labelByRole = MAGISTRATE_ROLES || {};
  ['captainOfGuard','chaplain','munerator','steward'].forEach(roleKey => {
    const slot = mg[roleKey];
    if(slot && slot.administersThisMonth && slot.characterId){
      const ch = (campaign.characters||[]).find(c => c.id === slot.characterId);
      out.push({ who: (ch ? ch.name : '(unassigned)') + ' (' + (labelByRole[roleKey]?.label||roleKey) + ')', via: roleKey });
    }
  });
  return out;
}

// =============================================================================
// Ruler resolution (Phase 2.6) — links domain.rulerCharacterId to the roster.
// =============================================================================
function rulerCharacter(campaign, d){
  if(!d) return null;
  if(d.rulerCharacterId){
    const ch = (campaign.characters||[]).find(c => c.id === d.rulerCharacterId);
    if(ch) return ch;
  }
  return null;
}
// Canonical ruler stats for game mechanics. Personal Authority is COMPUTED from level × the domain's
// monthly income (RR p.350 PA table). Falls back to the legacy d.ruler struct for pre-2.6 data.
function effectiveRuler(campaign, d){
  if(!d) return { name:'', class:'', level:1, personalAuthority:0, gpThreshold:0, administersThisMonth:false, isPC:false };
  const ch = rulerCharacter(campaign, d);
  if(ch){
    const domainIncomeVal = domainIncome(campaign, d);
    return {
      name: ch.name,
      class: ch.class || '',
      level: ch.level || 1,
      personalAuthority: computePersonalAuthority(ch.level||1, domainIncomeVal),
      gpThreshold: computeGpThreshold(ch.level||1),
      administersThisMonth: !!d.administersThisMonth,
      isPC: isPlayerControlled(ch)
    };
  }
  const r = d.ruler || {};
  return {
    name: r.name || '', class: r.class || '', level: r.level || 1,
    personalAuthority: r.personalAuthority || 0, gpThreshold: r.gpThreshold || 0,
    administersThisMonth: !!r.administersThisMonth, isPC: !!r.isPC
  };
}

// =============================================================================
// Tribute (RR p.346) — fixed obligation by realm-family count (batch-2 RAW form).
// =============================================================================
function tributeOwed(campaign, d){
  if(!d.liegeId) return 0;
  if(d.expenses?.tributePaid === false) return 0;
  if(d.expenses?.tributeAuto !== false){
    // Realm families = this domain + every sub-vassal realm's families (recursive chain).
    let realmFamilies = totalFamilies(d);
    for(const { domain:v } of vassalChainUnder(campaign, d.id)) realmFamilies += totalFamilies(v);
    return rawTributeForRealmFamilies(realmFamilies);
  }
  return roundToNearest5(d.expenses?.tributeToLiege || 0);
}

// =============================================================================
// Income / expense / morale breakdowns + sums + net (RR pp.339–351)
// =============================================================================
function incomeFactor(morale){ return INCOME_FACTOR_BY_MORALE[String(Math.max(-4, Math.min(4, morale||0)))] ?? 1; }

function incomeBreakdown(campaign, d){
  const fam = d.demographics.peasantFamilies || 0;
  const urb = effectiveUrbanFamilies(d);
  const taxRate = DEFAULT_TAX_RATES[d.taxPolicy?.rate] ?? (d.income.taxPerFamily||2);
  // Land revenue (RR p.339–340). DEFAULT (average effective value × peasantFamilies) IS the RAW model
  // (single-hex / uniform-value domains, where avg × families == the per-hex sum). families-per-hex-
  // tracking is a beyond-RAW high-fidelity overlay computing the literal per-hex sum. "effective value"
  // = base valuePerFamily + landImprovementBonus, capped at 9 (RR p.341).
  let landRow;
  const hexes = d.geography?.hexes || [];
  const totalImprovementBonus = domainTotalLandImprovementBonus(d);
  const improvedTag = totalImprovementBonus > 0 ? ' [improved +' + totalImprovementBonus + ' total]' : '';
  if(isHouseRuleEnabled(campaign, 'families-per-hex-tracking') && hexes.length > 0){
    const hexTotal = hexes.reduce((s, h) => s + (h.families||0)*effectiveHexValue(h), 0);
    const hexFam   = hexes.reduce((s, h) => s + (h.families||0), 0);
    landRow = { label: 'Land revenue (hex-by-hex, ' + hexes.length + ' hexes, ' + hexFam + ' families)' + improvedTag, gp: bankersRound(hexTotal) };
  } else if(hexes.length > 0){
    const avgValue = hexes.reduce((s, h) => s + effectiveHexValue(h), 0) / hexes.length;
    landRow = { label: 'Land revenue (' + avgValue.toFixed(2) + ' avg × ' + fam + ' families across ' + hexes.length + ' hexes)' + improvedTag, gp: bankersRound(avgValue * fam) };
  } else {
    landRow = { label: 'Land revenue (' + (d.income.landRevenuePerFamily||6) + ' × ' + fam + ')', gp: (d.income.landRevenuePerFamily||0) * fam };
  }
  const rows = [
    landRow,
    { label: 'Service revenue (' + (d.income.serviceRevenuePerFamily||4) + ' × ' + (fam+urb) + ')', gp: (d.income.serviceRevenuePerFamily||0)*(fam+urb) },
    { label: 'Tax (' + taxRate + ' × ' + (fam+urb) + ')', gp: taxRate*(fam+urb) }
  ];
  // Trade revenue (RR p.351). Per-settlement when hex settlements exist; per-domain aggregate otherwise.
  const settlements = hexSettlements(d);
  if(settlements.length > 0){
    settlements.forEach(({settlement}) => {
      const rate = settlementTradeRate(settlement);
      if(rate > 0 && (settlement.families||0) > 0){
        rows.push({ label: 'Trade revenue (' + settlement.name + ' Class ' + settlementMarketClass(settlement) + ': ' + rate + ' × ' + settlement.families + ')', gp: bankersRound(rate * settlement.families) });
      }
    });
  } else if(urb > 0){
    const tradeRate = tradeRevenuePerFamily(d);
    if(tradeRate > 0){
      rows.push({ label: 'Trade revenue (Class ' + marketClass(d) + ': ' + tradeRate + ' × ' + urb + ' urban)', gp: bankersRound(tradeRate * urb) });
    }
  }
  if(d.income.tariffs) rows.push({ label: 'Tariffs', gp: d.income.tariffs });
  const miscIncPerFam = d.income.miscPerFamily || 0;
  if(miscIncPerFam > 0) rows.push({ label: 'Misc/family (' + miscIncPerFam + ' × ' + (fam+urb) + ')', gp: miscIncPerFam*(fam+urb) });
  const miscIncFlat = d.income.miscFlat || 0;
  if(miscIncFlat > 0) rows.push({ label: 'Misc (flat)', gp: miscIncFlat });
  // Auto-flow: tribute from each vassal (effective tribute respects tributePaid).
  const vassals = (campaign.domains||[]).filter(x => x.liegeId === d.id);
  const vassalIds = new Set(vassals.map(v => v.id));
  vassals.forEach(v => {
    const t = tributeOwed(campaign, v);
    if(t > 0) rows.push({ label: 'Tribute from ' + v.name + ' (vassal)', gp: t });
    else if(v.liegeId === d.id && v.expenses?.tributePaid === false) rows.push({ label: 'Tribute from ' + v.name + ' (NOT PAID)', gp: 0 });
  });
  // Non-vassal tributes in (skip entries whose source is now a vassal). Read gpPerMonth (canonical) or legacy amount.
  (d.income.tributesIn||[]).forEach(t => {
    if(t.fromDomainId && vassalIds.has(t.fromDomainId)) return;
    const gp = t.gpPerMonth ?? t.amount ?? 0;
    const src = t.fromDomainId ? ((campaign.domains||[]).find(x => x.id === t.fromDomainId)?.name || t.fromDomainId) : '?';
    rows.push({ label: 'Tribute from ' + src, gp });
  });
  (d.income.other||[]).forEach(o => rows.push({ label: o.label||'Other', gp: o.gpPerMonth ?? o.amount ?? 0 }));
  return rows;
}
function monthlyGrossIncome(campaign, d){ return incomeBreakdown(campaign, d).reduce((s,r) => s + (r.gp||0), 0); }

function expenseBreakdown(campaign, d){
  const fam = d.demographics.peasantFamilies || 0;
  const urb = effectiveUrbanFamilies(d);
  const liturgy = (d.expenses.liturgyPerFamily ?? 1) * (fam+urb);
  const tithe = d.expenses.tithePaid ? (fam+urb) : 0;
  const strongholdMaint = fam;  // 1gp per peasant family
  const urbanUpkeep = urb;      // 1gp per urban family (RR p.351)
  const garrison = garrisonCost(d);
  // Magistrate salary annotation — paid out of the existing expense pool (total unchanged).
  const charById = (id) => (campaign.characters||[]).find(c => c.id === id);
  const magistrateNoteFor = (roleKey) => {
    const slot = d.magistrates?.[roleKey];
    if(!slot || !slot.characterId) return '';
    const ch = charById(slot.characterId);
    if(!ch) return '';
    const salary = magistrateSalaryForRole(campaign, d, roleKey);
    if(salary <= 0) return '';
    const roleLabel = (MAGISTRATE_ROLES||{})[roleKey]?.label || roleKey;
    return ' · ' + roleLabel + ' ' + ch.name + ': ' + salary.toLocaleString() + 'gp salary';
  };
  const rows = [
    { label: 'Garrison [req ' + requiredGarrison(campaign, d).toLocaleString() + ']' + magistrateNoteFor('captainOfGuard'), gp: garrison },
    { label: 'Liturgies' + magistrateNoteFor('munerator'), gp: liturgy },
    { label: 'Tithes' + (d.expenses.tithePaid ? '' : ' (NOT PAID)') + magistrateNoteFor('chaplain'), gp: tithe },
    { label: 'Stronghold maintenance' + magistrateNoteFor('steward'), gp: strongholdMaint }
  ];
  if(urbanUpkeep > 0) rows.push({ label: 'Urban upkeep (1gp × ' + urb + ' urban)', gp: urbanUpkeep });
  const miscExpPerFam = d.expenses.miscPerFamily || 0;
  if(miscExpPerFam > 0) rows.push({ label: 'Misc/family (' + miscExpPerFam + ' × ' + (fam+urb) + ')', gp: miscExpPerFam*(fam+urb) });
  const miscExpFlat = d.expenses.miscFlat ?? d.expenses.personalExpenses ?? 0;
  if(miscExpFlat > 0) rows.push({ label: 'Misc (flat)', gp: miscExpFlat });
  // Auto-flow: tribute to liege.
  if(d.liegeId){
    const owed = tributeOwed(campaign, d);
    const liege = (campaign.domains||[]).find(x => x.id === d.liegeId);
    const liegeName = liege ? liege.name : '(missing liege)';
    if(owed > 0){
      const note = d.expenses?.tributeAuto !== false ? ' (auto · RAW)' : ' (manual)';
      rows.push({ label: 'Tribute to ' + liegeName + ' (liege)' + note, gp: owed });
    } else if(d.expenses?.tributePaid === false){
      rows.push({ label: 'Tribute to ' + liegeName + ' (NOT PAID — defiance, will hit morale)', gp: 0 });
    }
  }
  // Manual tributes out (non-vassalage). Skip entries pointing to this domain's liege (auto-flow above).
  (d.expenses.tithesOut||[]).forEach(t => {
    if(t.toDomainId && t.toDomainId === d.liegeId) return;
    const gp = t.gpPerMonth ?? t.amount ?? 0;
    const tgt = t.toDomainId ? ((campaign.domains||[]).find(x => x.id === t.toDomainId)?.name || t.toDomainId) : '?';
    rows.push({ label: 'Tribute to ' + tgt, gp });
  });
  return rows;
}
function monthlyExpenses(campaign, d){ return expenseBreakdown(campaign, d).reduce((s,r) => s + (r.gp||0), 0); }

function monthlyNet(campaign, d){
  const gross = monthlyGrossIncome(campaign, d);
  const adj = bankersRound(gross * incomeFactor(d.demographics.morale));
  return adj - monthlyExpenses(campaign, d);
}
// RAW "Domain Income" (RR p.423): revenue − expenses (the single input to PA + XP-threshold).
function domainIncome(campaign, d){ return monthlyNet(campaign, d); }

function moraleModifiersFor(campaign, d){
  const mods = [];
  const fam = d.demographics.peasantFamilies || 0;
  const taxRate = DEFAULT_TAX_RATES[d.taxPolicy?.rate] ?? 2;
  const liturgy = d.expenses.liturgyPerFamily ?? 1;
  const reqRate = REQUIRED_GARRISON_PER_FAMILY[effectiveDomainClassification(d)] || 2;
  const gpf = fam > 0 ? garrisonCost(d)/fam : reqRate;
  if(gpf < reqRate && fam > 0) mods.push({ label: 'Garrison below required (' + reqRate + 'gp/family)', value: -Math.max(1, Math.ceil(reqRate - gpf)) });
  // RR p.349 — stronghold-adequacy penalty, emitted as a row so it flows through moraleModSum.
  const strongholdReq = strongholdRequired(d), strongholdVal = strongholdValue(campaign, d);
  const strongholdPen = strongholdMoralePenalty(strongholdVal, strongholdReq);
  if(strongholdPen < 0) mods.push({ label: 'Stronghold below minimum (' + strongholdVal.toLocaleString() + '/' + strongholdReq.toLocaleString() + 'gp, RR p.349)', value: strongholdPen });
  if(taxRate > 2) mods.push({ label: 'Taxes high (' + taxRate + 'gp)', value: -(taxRate-2) });
  else if(taxRate < 2) mods.push({ label: 'Taxes low (' + taxRate + 'gp)', value: (2-taxRate) });
  if(liturgy > 1) mods.push({ label: 'Liturgy above baseline', value: Math.floor(liturgy-1) });
  else if(liturgy < 1) mods.push({ label: 'Liturgy below baseline', value: -Math.ceil(1-liturgy) });
  if(!d.expenses.tithePaid) mods.push({ label: 'Tithe not paid', value: -1 });
  // RR p.351 — administered this month → +1 (only one applies even if several are ticked).
  const adminList = magistrateAdminCandidates(campaign, d);
  if(adminList.length > 0){
    const label = adminList.length === 1
      ? 'Administered by ' + adminList[0].who
      : 'Administered by ' + adminList.map(a => a.who).join('; ');
    mods.push({ label, value: 1 });
  }
  return mods;
}

// Sums over a proposal row (p.income / p.expenses / p.moraleMods) — pure, no campaign needed.
function incomeSum(p){ return (p.income||[]).reduce((s,r) => s + (r.gp||0), 0); }
function expenseSum(p){ return (p.expenses||[]).reduce((s,r) => s + (r.gp||0), 0); }
function moraleModSum(p){ return (p.moraleMods||[]).reduce((s,r) => s + (r.value||0), 0); }

// Domain XP earned by the ruler this month: net income above the GP threshold (RR p.423). Errata §1.1
// (RR r10 p.425): a HENCHMAN ruler subtracts their expected monthly wage from the XP basis (the wage
// already earns them XP via the patron — avoids double-counting). Magistrate salary counts as domain
// income for XP. Per Joachim 2026-05-28 this is RAW, applies to all henchman rulers.
function domainXpFromNet(campaign, d, net){
  const thr = effectiveRuler(campaign, d).gpThreshold || 0;
  if(thr <= 0) return null;
  const ch = rulerCharacter(campaign, d);
  const henchmanWage = (isHenchman(ch)) ? (ch.monthlyWage || 0) : 0;
  return Math.max(0, (net||0) - henchmanWage - thr);
}

Object.assign(ACKS, {
  // Realm structure
  vassalsOf, vassalChainUnder,
  // Population + families
  hexSettlements, totalUrbanFamiliesFromHexes, totalUrbanInvestmentFromHexes, effectiveUrbanFamilies, totalFamilies,
  // Land value
  effectiveHexValue, domainTotalLandImprovementBonus,
  // Markets
  settlementMarketClass, settlementTradeRate, settlementCapacity, marketClassRow, marketClass, tradeRevenuePerFamily, urbanCapacity,
  // Garrison
  garrisonHeadcount, garrisonCost, garrisonBR, requiredGarrison, banditCount,
  // Stronghold
  strongholdRequired, strongholdValue,
  // Magistrates
  magistrateBaseExpenseForRole, magistrateSalaryForRole, magistrateAdminCandidates,
  // Ruler resolution
  rulerCharacter, effectiveRuler, domainIncome,
  // Tribute
  tributeOwed,
  // Income / expense / morale
  incomeFactor, incomeBreakdown, monthlyGrossIncome, expenseBreakdown, monthlyExpenses, monthlyNet, moraleModifiersFor,
  incomeSum, expenseSum, moraleModSum, domainXpFromNet
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
