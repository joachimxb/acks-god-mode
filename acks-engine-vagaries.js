/* =============================================================================
 * acks-engine-vagaries.js — ACKS God Mode: the Vagaries of Recruitment / War /
 * Battle (Phase 3 Military W8). JJ pp.110–117 — three OPTIONAL d100 random-event
 * tables, each behind its own default-OFF house rule (vagaries-of-recruitment /
 * -war / -battle), in the 🎖 Military category.
 *
 *   • Recruitment (JJ pp.110–112) — rolled each MONTH a domain ruler is recruiting
 *     mercenaries / conscripts / militia / vassal troops. The monthly driver
 *     (processRecruitmentVagariesForTurn) hooks commitTurn, like Favors & Duties.
 *   • War (JJ pp.113–115) — rolled each WEEK per army on campaign, AFTER the supply
 *     check (twice/week during sieges → take the worse). The slot-88 'military' day
 *     consumer rolls it (step 3c) and commits the GM-resolve record.
 *   • Battle (JJ pp.116–117) — 1d4 vagaries per HEROIC FORAY. declareForay rolls
 *     them onto foray.vagaries and emits one vagary-of-battle audit.
 *
 * Posture (the F&D auto-roll + GM-resolve-note pattern, the §15 design): the roll is
 * automated at the right cadence and the rolled vagary is surfaced as a GM-resolve
 * EVENT + record carrying the full narrative AND a STRUCTURED effect descriptor
 * (effect.category + params) ready for a future auto-apply wave. v1 AUTO-APPLIES only
 * the trivially-safe / self-contained vagary mechanics — the no-op entries (All Quiet
 * / Calm Amidst the Storm) and the War table's own Good/Ill Omen ±10-to-next-roll
 * modifier; everything that mutates economy / units / morale / spawns an army is left
 * as a GM-resolve note (exactly as RAW vagary tables are GM-adjudicated and as F&D-1
 * leaves its complex duty effects as notes). 🔧 v1: broader auto-apply is deferred.
 *
 * RAW print-error fixes (the d100 ranges, made contiguous; noted here + in the docs):
 *   • War: War Profiteers 29-32 / Siege Train Problems 32-36 overlapped at 32 →
 *     Siege Train 33-36.
 *   • Battle: Debris Heavy 41-45 / Deserters 45-50 overlapped at 45 → Deserters
 *     46-50; Monsters 71-75 / Piles of Dead 75-80 overlapped at 75 → Piles 76-80.
 *
 * No new entity / prefix; +3 house rules (catalogs) + 3 event kinds (events). No save
 * migration — the only stored fields (army.lastWarVagaryOrd, army.vagaryWarNextMod,
 * foray.vagaries) are read defensively / written at runtime, never on blankX, so the
 * 6 templates + demo stay migrate-no-ops.
 *
 * Load order: AFTER the military modules (battles / maneuvers / subsystems / troops)
 * + the engine core — the team-session glob runner loads a new module last, and every
 * cross-module call resolves at call time via the A() lazy accessor.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};
  function A(){ return global.ACKS; }

  // ── small helpers ───────────────────────────────────────────────────────────
  function _char(campaign, id){ return (campaign && id && (campaign.characters || []).find(c => c && c.id === id)) || null; }
  function _domain(campaign, id){ return (campaign && id && (campaign.domains || []).find(d => d && d.id === id)) || null; }
  function _worldOrd(campaign, dayInMonth){
    const t = (campaign && campaign.currentTurn) || 1;
    const d = (dayInMonth != null) ? dayInMonth : ((campaign && campaign.currentDayInMonth) || 1);
    return t * 30 + d;
  }
  function _ruleOn(campaign, id){ const a = A(); return !!(a && typeof a.isHouseRuleEnabled === 'function' && a.isHouseRuleEnabled(campaign, id)); }
  function _domainOfRuler(campaign, rulerId){ return rulerId ? (campaign.domains || []).find(d => d && d.rulerCharacterId === rulerId) || null : null; }

  // RAW note (JJ p.111 / p.113): units gained/lost scale with realm tier — a duchy or
  // principality deals in battalions (480 inf / 240 cav), a kingdom or empire in brigades
  // (1,920 / 960); everything else in companies (120 / 60). vagaryRealmUnitSize keys off
  // realmTitleForDomain (baron/viscount/count → company, duke/prince → battalion, king/
  // emperor → brigade). Returns the scale name; callers print the infantry/cavalry counts.
  const _REALM_UNIT = Object.freeze({
    company:   Object.freeze({ scale:'company',   infantry:120,  cavalry:60  }),
    battalion: Object.freeze({ scale:'battalion', infantry:480,  cavalry:240 }),
    brigade:   Object.freeze({ scale:'brigade',   infantry:1920, cavalry:960 })
  });
  function vagaryRealmUnitSize(campaign, domain){
    const a = A();
    const title = (domain && typeof a.realmTitleForDomain === 'function') ? a.realmTitleForDomain(domain) : 'baron';
    if(title === 'duke' || title === 'prince') return _REALM_UNIT.battalion;
    if(title === 'king' || title === 'emperor') return _REALM_UNIT.brigade;
    return _REALM_UNIT.company;
  }

  // =============================================================================
  // The three d100 tables. Each row: { min, max, key, name, brief, effect }.
  //   effect.category: 'none'          — no vagary (auto, no-op)
  //                    'next-roll-mod' — War Good/Ill Omen: ±10 to this army's NEXT roll (AUTO)
  //                    anything else   — GM-resolve (the mechanical params ride the descriptor;
  //                                      v1 surfaces brief + detail as the GM instruction)
  // `brief` is a one-line own-words gloss (NOT the RAW prose — §13.6 IP); `effect.detail`
  // carries the mechanical instruction for the GM. cite = JJ page.
  // =============================================================================

  // ── Vagaries of Recruitment (JJ pp.110–112) — rolled monthly per recruiting ruler ──
  const VAGARY_OF_RECRUITMENT = Object.freeze([
    { min:1,  max:2,   key:'war-declared',          name:'War Declared',          brief:'A threatened rival declares war.',
      effect:{ category:'spawn-enemy-army', detail:'A neighbouring ruler of about the leader\'s size attacks as swiftly as possible with a full complement of vassal troops. Pick (or re-roll if none).', cite:'JJ p.112' } },
    { min:3,  max:7,   key:'resignation',           name:'Resignation',           brief:'A commander resigns.',
      effect:{ category:'loyalty-cascade', target:'commander', result:'resign', detail:'Loyalty roll each commander (lowest morale first); the first "Betray"/"Immediate Attack" resigns. No failure → no effect.', cite:'JJ p.112' } },
    { min:8,  max:12,  key:'treacherous-mercenaries', name:'Treacherous Mercenaries', brief:'A paid merc unit abandons the army.',
      effect:{ category:'loyalty-cascade', target:'merc-unit', result:'desert', detail:'Loyalty roll each mercenary unit (lowest first); the first "Betray"/"Immediate Attack" deserts the day after it is next paid.', cite:'JJ p.112' } },
    { min:13, max:17,  key:'bidding-war',            name:'Bidding War',           brief:'A rival\'s recruiting drives up hiring costs.',
      effect:{ category:'merc-cost', mult:'1 + 2d4×100%', months:'1d6', detail:'The cost of FINDING and HIRING mercenaries (not their wages) rises by 2d4×100% for 1d6 months.', cite:'JJ p.111' } },
    { min:18, max:22,  key:'weak-recruits',          name:'Weak Recruits',         brief:'This month\'s conscripts/militia are sickly.',
      effect:{ category:'training-qualify', qualify:'light-only', detail:'Conscripts & militia recruited this month can qualify ONLY as light infantry (no heavy infantry / archers).', cite:'JJ p.112' } },
    { min:23, max:27,  key:'commander-casualty',     name:'Commander Casualty',    brief:'A commander dies of mishap or ill health.',
      effect:{ category:'death-save-cascade', target:'commander', detail:'Death save each commander (oldest first); the first to fail dies (restore life and limb can revive). No failure → no effect.', cite:'JJ p.112' } },
    { min:28, max:32,  key:'brigands-recruit',       name:'Brigands',              brief:'Renegade mercenaries harass the realm.',
      effect:{ category:'spawn-enemy-army', composition:'1 bowman unit + 1 light-cavalry unit + a mercenary officer (rank by realm tier); 50% a crusader, 50% a mage accompany', detail:'Treat as an independent enemy army (see MM Brigands).', cite:'JJ p.111' } },
    { min:33, max:37,  key:'commerce-disrupted',     name:'Commerce Disrupted',    brief:'War rumours spook the merchant guild.',
      effect:{ category:'market-class', delta:-1, months:'1d6', target:'largest-urban', detail:'The leader\'s largest urban settlement is treated as one market class SMALLER for 1d6 months.', cite:'JJ p.111' } },
    { min:38, max:42,  key:'war-profiteers-recruit', name:'War Profiteers',        brief:'Merchants raise prices on war goods.',
      effect:{ category:'equipment-cost', delta:0.10, seasons:'1d4', stacking:true, detail:'Adventuring equipment, artillery ammo, armor, mounts, and weapons cost +10% for 1d4 seasons (+10% more each time this recurs).', cite:'JJ p.112' } },
    { min:43, max:58,  key:'all-quiet-recruit',      name:'All Quiet',             brief:'No vagary this month.',
      effect:{ category:'none', cite:'JJ p.111' } },
    { min:59, max:63,  key:'tribute',                name:'Tribute',               brief:'Vassals and clients send gold.',
      effect:{ category:'gp-grant', amount:'min(one month\'s army wages, 1gp per family in the realm)', xpIncome:true, detail:'The leader gains the lesser of a month\'s army wages or 1gp/family; it counts toward his domain income for campaign XP.', cite:'JJ p.112' } },
    { min:64, max:68,  key:'commerce-improves',      name:'Commerce Improves',     brief:'The bigger military reassures the guild.',
      effect:{ category:'market-class', delta:1, months:'1d6', target:'largest-urban', detail:'The leader\'s largest urban settlement is treated as one market class LARGER for 1d6 months.', cite:'JJ p.111' } },
    { min:69, max:73,  key:'foreign-legion',         name:'Foreign Legion',        brief:'A foreign merc unit offers to serve.',
      effect:{ category:'offer-unit', kind:'foreign-legion', loyaltyMod:-1, detail:'A unit of mercenaries of a type not normally available offers to serve; if hired, language/culture impose −1 base loyalty.', cite:'JJ p.111' } },
    { min:74, max:78,  key:'soldier-of-fortune',     name:'Soldier of Fortune',    brief:'An adventurer offers to serve as a henchman.',
      effect:{ category:'offer-henchman', levelBelowLeader:2, detail:'Generate an NPC henchman two levels below the leader (NPC Parties rules); expects pay and position by class/level.', cite:'JJ p.112' } },
    { min:79, max:83,  key:'stout-recruits',         name:'Stout Recruits',        brief:'Hard times breed hard men.',
      effect:{ category:'training-qualify', qualify:'double', detail:'Twice as many conscripts/militia recruited this month qualify for advanced training (heavy infantry, cavalry, etc.).', cite:'JJ p.112' } },
    { min:84, max:88,  key:'surplus-sellswords',     name:'Surplus Sellswords',    brief:'A neighbour\'s peace frees its mercenaries.',
      effect:{ category:'merc-crop', mult:2, periods:4, detail:'The mercenary crop available in the realm is DOUBLED for the next four time periods (wages unchanged).', cite:'JJ p.112' } },
    { min:89, max:93,  key:'mercenaries-recruit',    name:'Mercenaries',           brief:'A merc unit offers its services.',
      effect:{ category:'offer-unit', kind:'mercenaries', veteranChance:0.25, detail:'Roll the unit type on the Follower Type & Equipment by Class table (leader\'s class); 25% chance they are veterans.', cite:'JJ p.112' } },
    { min:94, max:98,  key:'bold-captain',           name:'Bold Captain',          brief:'A talented young commander emerges.',
      effect:{ category:'offer-officer', rankByTier:true, loyalty:1, detail:'A new officer (captain / major / colonel / general by realm tier) joins with base loyalty +1 instead of −2.', cite:'JJ p.111' } },
    { min:99, max:100, key:'alliance-offered',       name:'Alliance Offered',      brief:'An impressed neighbour offers an alliance.',
      effect:{ category:'offer-alliance', troops:'1gp per family in the ally\'s realm', detail:'A neighbouring realm of about the leader\'s size offers alliance; it will send troops worth 1gp/family if the leader goes to war.', cite:'JJ p.112' } }
  ]);

  // ── Vagaries of War (JJ pp.113–115) — rolled weekly per army on campaign ──
  // (Print overlap fixed: Siege Train Problems 33-36, not 32-36.)
  const VAGARY_OF_WAR = Object.freeze([
    { min:1,  max:2,   key:'disease',               name:'Disease',               brief:'A major epidemic breaks out.',
      effect:{ category:'disease', table:'disease-type', detail:'Roll the Disease Type (1d100); each unit makes a Death save (bonus per disease) or is incapacitated for the duration, then recovers or dies (nat 1 / by the listed margin). Curable by divine casters / healers.', cite:'JJ pp.113–114' } },
    { min:3,  max:5,   key:'defection-own',         name:'Defection',             brief:'One of your commanders defects.',
      effect:{ category:'loyalty-cascade', target:'commander', result:'defect', side:'own', detail:'Morale roll each commander (lowest first); the first "Betray"/"Immediate Attack" defects — to an opposing army within a week\'s march at once, else when opportune.', cite:'JJ p.114' } },
    { min:6,  max:8,   key:'desertion',             name:'Desertion',             brief:'Scores of men desert.',
      effect:{ category:'loyalty-cascade', target:'unit', result:'desert', detail:'Morale roll each unit (lowest first); the first "Betray"/"Immediate Attack" deserts — joining a nearby enemy or disbanding for home.', cite:'JJ p.114' } },
    { min:9,  max:11,  key:'spy-lost',              name:'Spy Lost',              brief:'A friendly spy is caught.',
      effect:{ category:'spy', side:'lost', interrogate:'1d4', detail:'A spy you sent to infiltrate the enemy is caught (or a turncoat exposed); the enemy may interrogate him for 1d4 common facts about your army.', cite:'JJ p.114' } },
    { min:12, max:14,  key:'camp-followers',        name:'Camp Followers',        brief:'Itinerants and camp-wives arrive.',
      effect:{ category:'speed', mult:0.667, hijinkBonusEnemy:2, calamityToDriveOff:true, detail:'Expedition speed −⅓ and enemy spies +2 to hijinks while present; driving them off counts as a morale calamity.', cite:'JJ pp.113–114' } },
    { min:15, max:17,  key:'treacherous-guides',    name:'Treacherous Guides',    brief:'Native guides secretly inform the enemy.',
      effect:{ category:'speed', mult:1.333, weeks:1, reconBonusEnemy:1, hijinkFreeEnemy:1, detail:'Movement +⅓ for a week, but the enemy gets one free hijink and +1 reconnaissance.', cite:'JJ p.114' } },
    { min:18, max:20,  key:'commander-casualty-war', name:'Commander Casualty',   brief:'A commander dies of mishap or ill health.',
      effect:{ category:'death-save-cascade', target:'commander', detail:'Death save each commander (oldest first); the first to fail dies (restore life and limb can revive). No failure → no effect.', cite:'JJ p.114' } },
    { min:21, max:24,  key:'brigands-war',          name:'Brigands',              brief:'Brigands raid the supply lines.',
      effect:{ category:'spawn-enemy-army', supplyCostDelta:0.10, reconDelta:-1, composition:'bowmen + medium cavalry by realm tier, with statted mercenary officers (+50% crusaders, +50% mages)', detail:'Supply cost +10% and recon −1 until dealt with; treat the brigands as an independent enemy army.', cite:'JJ p.113' } },
    { min:25, max:28,  key:'supply-problems',       name:'Supply Problems',       brief:'This week\'s supplies do not arrive.',
      effect:{ category:'supply', state:'out', detail:'The army is OUT OF SUPPLY this week (the RR p.452 lack-of-supply ladder applies unless it requisitions/loots).', cite:'JJ p.115' } },
    { min:29, max:32,  key:'war-profiteers-war',    name:'War Profiteers',        brief:'Merchants raise prices for the campaign.',
      effect:{ category:'equipment-cost', delta:0.10, stacking:true, scope:'campaign', detail:'Artillery ammo, armor, mounts, supplies, and weapons cost +10% for the campaign (+10% more each recurrence).', cite:'JJ p.115' } },
    { min:33, max:36,  key:'siege-train-problems',  name:'Siege Train Problems',  brief:'Campaigning breaks the siege artillery.',
      effect:{ category:'death-save-cascade', target:'artillery', detail:'Death save each artillery piece (saves as a 4th-level fighter with a siege engineer/artillerist, else as a normal man); a failure breaks it (0 shp) — repair as a construction project (wood: 5 shp/gp).', cite:'JJ p.115' } },
    { min:37, max:40,  key:'bad-weather',           name:'Bad Weather',           brief:'Bad weather plagues the army.',
      effect:{ category:'weather', mode:'worse', detail:'Roll the weather twice each day and apply the worse result. (Severe Weather — JJ p.115 — is the intensified 1d4-week variant.)', cite:'JJ p.113' } },
    { min:41, max:45,  key:'ill-omen',              name:'Ill Omen',              brief:'An ominous portent worries the troops.',
      effect:{ category:'next-roll-mod', delta:-10, moraleDelta:-1, weeks:1, detail:'Morale rolls −1 for the next week; −10 to this army\'s next Vagaries of War roll (applied automatically).', cite:'JJ p.115' } },
    { min:46, max:55,  key:'all-quiet-war',         name:'All Quiet',             brief:'No vagary this week.',
      effect:{ category:'none', cite:'JJ p.114' } },
    { min:56, max:60,  key:'good-omen',             name:'Good Omen',             brief:'A positive portent lifts morale.',
      effect:{ category:'next-roll-mod', delta:10, moraleDelta:1, weeks:1, detail:'Morale rolls +1 for the next week; +10 to this army\'s next Vagaries of War roll (applied automatically).', cite:'JJ p.114' } },
    { min:61, max:64,  key:'good-weather',          name:'Good Weather',          brief:'Good weather shines on the army.',
      effect:{ category:'weather', mode:'better', detail:'Roll the weather twice each day and apply the better result.', cite:'JJ p.115' } },
    { min:65, max:68,  key:'artillery-magazine',    name:'Artillery Magazine',    brief:'A cache of artillery is discovered.',
      effect:{ category:'find-artillery', count:'1d4', ammo:'1d6 days', detail:'The army finds 1d4 artillery units, each with 1d6 days\' ammunition.', cite:'JJ p.114' } },
    { min:69, max:72,  key:'legendary-leadership',  name:'Legendary Leadership',  brief:'A legend grows around the leader.',
      effect:{ category:'morale-buff', target:'leader', moraleModDelta:1, persistent:true, lostOn:'two consecutive defeats', detail:'The leader gains a victory title; his morale modifier +1 until his army loses two battles in a row.', cite:'JJ p.115' } },
    { min:73, max:76,  key:'supply-boon',           name:'Supply Boon',           brief:'Local sources provision the army.',
      effect:{ category:'supply', state:'auto-in', marketClassDelta:1, detail:'The army is automatically in supply this week (no cost paid); its market class +1 for equipment this month.', cite:'JJ p.115' } },
    { min:77, max:80,  key:'friendly-peasants',     name:'Friendly Peasants',     brief:'Locals report enemy movements.',
      effect:{ category:'recon', delta:2, weeks:1, lostIf:'requisition-or-loot', detail:'+2 to all reconnaissance rolls next week — lost if the army requisitions or loots that week.', cite:'JJ p.114' } },
    { min:81, max:83,  key:'friendly-lord',         name:'Friendly Lord',         brief:'A local lord offers vassalage + a base.',
      effect:{ category:'offer-vassal', supplyBase:true, tribute:'monthly-income', detail:'A local lord offers to become a (sub-)vassal, extend his stronghold as a supply base, and pay a month\'s income — in exchange for protection from looting/conquest/pillage.', cite:'JJ p.114' } },
    { min:84, max:86,  key:'local-guides',          name:'Local Guides',          brief:'Helpful natives guide the army.',
      effect:{ category:'speed', mult:1.333, weeks:1, notOnRoad:true, detail:'Movement +⅓ for a week through hidden passes (no effect if already on a road).', cite:'JJ p.115' } },
    { min:87, max:89,  key:'ministers',             name:'Ministers',             brief:'Crusaders arrive to minister.',
      effect:{ category:'offer-unit', kind:'ministers', count:'2d6 crusaders (level 1d4)', moraleDelta:1, detail:'+1 morale to all units; the ministers leave if camp followers are allowed or the leader acts against their faith.', cite:'JJ p.115' } },
    { min:90, max:92,  key:'spy-found',             name:'Spy Found',             brief:'You catch an enemy spy.',
      effect:{ category:'spy', side:'found', interrogate:'1d4', detail:'An enemy spy (or a fresh turncoat) is caught; interrogate him for 1d4 common facts about the opposing army.', cite:'JJ p.115' } },
    { min:93, max:95,  key:'mercenaries-war',       name:'Mercenaries',           brief:'A merc unit offers its services.',
      effect:{ category:'offer-unit', kind:'mercenaries', veteranChance:0.25, detail:'Roll the unit type on the Follower Type & Equipment by Class table (leader\'s class); 25% chance veterans.', cite:'JJ p.115' } },
    { min:96, max:98,  key:'defection-enemy',       name:'Defection (enemy)',     brief:'An enemy commander defects to you.',
      effect:{ category:'offer-unit', kind:'defector', side:'enemy', detail:'An enemy commander defects and brings his units over to your army.', cite:'JJ p.114' } },
    { min:99, max:100, key:'plans-discovered',      name:'Plans Discovered',      brief:'The enemy\'s plans fall into your hands.',
      effect:{ category:'recon-intel', level:'major', autoInitiative:true, detail:'You learn the location, organization, and leadership of the opposing army as a major recon success, and auto-win the next initiative roll against it.', cite:'JJ p.115' } }
  ]);

  // ── Vagaries of Battle (JJ pp.116–117) — 1d4 per heroic foray ──
  // (Print overlaps fixed: Deserters 46-50, Piles of Dead 76-80.)
  const VAGARY_OF_BATTLE = Object.freeze([
    { min:1,  max:3,   key:'ambush',                name:'Ambush',                brief:'A trap is sprung — surprise and closer foes.',
      effect:{ category:'surprise', mod:-2, distanceMult:0.5, detail:'All adventurers roll surprise at −2; the distance to each group of foes is halved.', cite:'JJ p.116' } },
    { min:4,  max:7,   key:'battle-standard',       name:'Battle Standard',       brief:'Both standards are in sight — the stake doubles.',
      effect:{ category:'stake-mult', mult:2, moraleBonus:2, detail:'Double the BR staked for this foray; all creatures on both sides +2 to morale rolls.', cite:'JJ p.116' } },
    { min:8,  max:12,  key:'blood-and-mud',         name:'Blood and Mud',         brief:'Slippery ground — natural 1s fall prone.',
      effect:{ category:'condition', trigger:'natural-1', result:'prone', detail:'A creature that rolls a natural 1 on an attack or saving throw falls prone.', cite:'JJ p.116' } },
    { min:13, max:17,  key:'bombardment',           name:'Bombardment',           brief:'Artillery lobs fire onto the foray.',
      effect:{ category:'attack', target:18, ignoreArmor:true, dmg:'4d6', save:'Blast', delayRounds:'1d4', detail:'1d4 rounds in, an 18+ attack (ignoring armor) vs each creature; a hit deals 4d6 extraordinary bludgeoning unless a Blast save succeeds.', cite:'JJ p.116' } },
    { min:18, max:23,  key:'booby-traps',           name:'Booby Traps',           brief:'Hidden pits maim the unwary.',
      effect:{ category:'hazard', traps:'1 per BR staked', detail:'One concealed pit-and-spike trap per BR staked; combat speed 1-in-6 / running 2-in-6 to blunder in per round (10\' fall + 1d4 spikes).', cite:'JJ p.116' } },
    { min:24, max:28,  key:'calm-amidst-the-storm', name:'Calm Amidst the Storm', brief:'No vagary occurs.',
      effect:{ category:'none', cite:'JJ p.116' } },
    { min:29, max:30,  key:'culmination',           name:'Culmination',           brief:'Both sides pour troops in.',
      effect:{ category:'reinforce', side:'both', hdPerBr:10, rounds:5, detail:'In each of the first 5 rounds, +10 HD of creatures join per BR staked, on each side.', cite:'JJ p.116' } },
    { min:31, max:35,  key:'debris',                name:'Debris',                brief:'Littered ground — run/charge or fall.',
      effect:{ category:'terrain', runChargeSave:'Paralysis', detail:'Creatures that run or charge make a Paralysis save or fall prone halfway through the move.', cite:'JJ p.116' } },
    { min:36, max:40,  key:'debris-dangerous',      name:'Debris, Dangerous',     brief:'Dangerous litter — fall and take damage.',
      effect:{ category:'terrain', runChargeSave:'Paralysis', fallDamage:'1d4', detail:'Run/charge → Paralysis save or fall prone AND take 1d4 bludgeoning.', cite:'JJ p.116' } },
    { min:41, max:45,  key:'debris-heavy',          name:'Debris, Heavy',         brief:'Obstacle-strewn — half speed, no charge.',
      effect:{ category:'terrain', speedMult:0.5, noCharge:true, hideBonus:2, detail:'Speeds halved, no charging/running; +2 to hide proficiency throws (ample cover).', cite:'JJ p.116' } },
    { min:46, max:50,  key:'deserters',             name:'Deserters',             brief:'Fleeing deserters cross the fight.',
      effect:{ category:'reinforce', side:'weaker', hdPerBr:10, delayRounds:'1d4', hostile:'blockers', detail:'1d4 rounds in, 10 HD of deserters per BR staked enter from the enemy side fleeing to yours, attacking blockers; a reaction roll may rally them.', cite:'JJ p.117' } },
    { min:51, max:55,  key:'fire',                  name:'Fire',                  brief:'The battlefield is ablaze.',
      effect:{ category:'hazard', save:'Blast', dmg:'1d4', perRound:true, visibility:20, detail:'Each round, a Blast save or 1d4 fire damage; visibility reduced to 20\'.', cite:'JJ p.117' } },
    { min:56, max:60,  key:'fog-and-smoke',         name:'Fog and Smoke',         brief:'A cloud obscures the field.',
      effect:{ category:'visibility', ft:20, detail:'Maximum visibility is reduced to 20\' for the foray.', cite:'JJ p.117' } },
    { min:61, max:65,  key:'high-ground',           name:'High Ground',           brief:'The defender holds the high ground.',
      effect:{ category:'attack-mod', side:'defender', delta:1, detail:'The defending army\'s forces in this foray gain +1 to attack throws (attackers are subjacent).', cite:'JJ p.117' } },
    { min:66, max:70,  key:'marauders',             name:'Marauders',             brief:'Brigands prey on the wounded.',
      effect:{ category:'reinforce', side:'hostile-third', kind:'brigands', hdPerBr:10, delayRounds:'1d4', detail:'1d4 rounds in, 10 HD of brigands per BR staked arrive, attacking weak/damaged creatures and looting.', cite:'JJ p.117' } },
    { min:71, max:75,  key:'monsters',              name:'Monsters',              brief:'Blood draws monsters to the field.',
      effect:{ category:'reinforce', side:'hostile-third', kind:'monsters', hdPerBr:10, delayRounds:'1d4', byTerrain:true, detail:'1d4 rounds in, 10 HD of monsters per BR staked arrive (GM choice or by terrain), attacking weak/damaged creatures.', cite:'JJ p.117' } },
    { min:76, max:80,  key:'piles-of-dead',         name:'Piles of Dead',         brief:'Heaps of corpses choke the ground.',
      effect:{ category:'terrain', speedMult:0.5, noCharge:true, hideBonus:2, moraleDelta:-2, animatable:true, detail:'Speeds halved, no charge/run; +2 hide; −2 morale; the dead can be animated.', cite:'JJ p.117' } },
    { min:81, max:85,  key:'reinforcements-enemy',  name:'Reinforcements, Enemy', brief:'Enemy troops join the foray.',
      effect:{ category:'reinforce', side:'enemy', hdPerBr:10, delayRounds:'1d4', detail:'1d4 rounds in, 10 HD of enemy creatures per BR staked join.', cite:'JJ p.117' } },
    { min:86, max:90,  key:'reinforcements-friendly', name:'Reinforcements, Friendly', brief:'Friendly troops join the foray.',
      effect:{ category:'reinforce', side:'friendly', hdPerBr:10, delayRounds:'1d4', detail:'1d4 rounds in, 10 HD of friendly creatures per BR staked join.', cite:'JJ p.117' } },
    { min:91, max:95,  key:'scattered-bodies',      name:'Scattered Bodies',      brief:'Corpses litter the field.',
      effect:{ category:'terrain', runChargeSave:'Paralysis', moraleDelta:-1, animatable:true, count:'1d10×10', detail:'1d10×10 bodies; run/charge → Paralysis save or prone; −1 morale; the dead can be animated.', cite:'JJ p.117' } },
    { min:96, max:100, key:'volley-of-arrows',      name:'Volley of Arrows',      brief:'Arrows rain on friend and foe.',
      effect:{ category:'attack', target:11, byAc:true, dmg:'1d6', delayRounds:'1d4', detail:'1d4 rounds in, an 11+ attack (modified by AC) vs each creature; a hit deals 1d6 piercing.', cite:'JJ p.117' } }
  ]);

  const VAGARY_TABLES = Object.freeze({ recruitment: VAGARY_OF_RECRUITMENT, war: VAGARY_OF_WAR, battle: VAGARY_OF_BATTLE });

  // ── the resolver ─────────────────────────────────────────────────────────────
  function lookupVagaryRow(table, roll){
    const r = Math.max(1, Math.min(100, roll | 0));
    return (table || []).find(e => r >= e.min && r <= e.max) || null;
  }
  // Roll 1d100 (+ mod) on a table. RAW (JJ p.111): a modified roll of 101+ → pick the BEST
  // vagary for the ruler, 0 or less → the WORST (a GM judgment call; we flag it and clamp the
  // lookup to [1,100], surfacing pickBest/pickWorst so the UI can prompt an override).
  function rollVagaryTable(table, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const mod = opts.mod || 0;
    const raw = 1 + Math.floor(rng() * 100);
    const total = raw + mod;
    const clamped = Math.max(1, Math.min(100, total));
    return { roll: raw, mod, total, clamped, pickBest: total > 100, pickWorst: total < 1, row: lookupVagaryRow(table, clamped) };
  }

  function vagaryNarrative(label, row, extra){
    if(!row) return (label || 'Vagary') + ': (no result)';
    return (label ? label + ' — ' : '') + row.name + ': ' + (row.brief || '') + (extra ? ' ' + extra : '');
  }

  // =============================================================================
  // Recruitment driver (monthly) — hooked into commitTurn, the F&D pattern.
  // =============================================================================

  // Which domain rulers are recruiting THIS month? RAW (JJ p.110): "each month a domain
  // ruler is recruiting mercenaries, conscripts, militia, or vassal troops." We read the
  // shipped signals (no new instrumentation): an active mercenary recruitment drive
  // (R1–R3), a conscript/militia unit levied or trained this turn (W7 stamps unit.history
  // {turn,type:'levied'|'trained'}), or an army mustered this turn (createArmy stamps
  // army.history {turn,type:'mustered'} — covers vassal-troop call-up + general mustering).
  // Returns [{ ruler, domain, kinds:Set }].
  function rulersRecruitingThisMonth(campaign, turn){
    const a = A();
    turn = (turn != null) ? turn : (campaign && campaign.currentTurn) || 1;
    const byRuler = new Map();
    const add = (domain, kind) => {
      if(!domain || !domain.rulerCharacterId) return;
      const ruler = _char(campaign, domain.rulerCharacterId);
      if(!ruler) return;
      let e = byRuler.get(ruler.id);
      if(!e){ e = { ruler, domain, kinds: new Set() }; byRuler.set(ruler.id, e); }
      e.kinds.add(kind);
    };
    // mercenaries — an active recruitment drive owned by a domain ruler
    if(typeof a.activeRecruitmentDrivesForPatron === 'function'){
      for(const d of (campaign.domains || [])){
        if(!d || !d.rulerCharacterId) continue;
        const drives = a.activeRecruitmentDrivesForPatron(campaign, d.rulerCharacterId);
        if(drives && drives.length) add(d, 'mercenaries');
      }
    }
    // conscripts / militia — levied or trained this turn, homed in the domain
    for(const u of (campaign.units || [])){
      if(!u || !u.homeDomainId || (u.source !== 'conscript' && u.source !== 'militia')) continue;
      if(Array.isArray(u.history) && u.history.some(h => h && h.turn === turn && (h.type === 'levied' || h.type === 'trained'))){
        add(_domain(campaign, u.homeDomainId), u.source === 'militia' ? 'militia' : 'conscripts');
      }
    }
    // vassal troops / general mustering — an army mustered this turn by a domain ruler
    for(const army of (campaign.armies || [])){
      if(!army || !army.leaderCharacterId || !Array.isArray(army.history)) continue;
      if(army.history.some(h => h && h.turn === turn && h.type === 'mustered')){
        add(_domainOfRuler(campaign, army.leaderCharacterId), 'vassal-troops');
      }
    }
    return [...byRuler.values()];
  }

  // Emit a record-only vagary-of-recruitment event (the F&D _emitFavorDutyEvent pattern). `applied`
  // (W8 auto-apply) carries what the engine actually did this turn — a spawned brigand army or a
  // commerce market-class shift — and is folded into the payload + narrative so the chronicle reads
  // the consequence, not just the roll.
  function _emitRecruitmentVagary(campaign, ruler, domain, res, kinds, applied){
    const a = A();
    const row = res.row;
    const unit = vagaryRealmUnitSize(campaign, domain);
    const hexId = (domain && typeof a.domainSeatHexId === 'function') ? a.domainSeatHexId(campaign, domain) : null;
    const narrative = (ruler.name || 'A ruler') + ' (recruiting): ' + vagaryNarrative(null, row, applied ? applied.narrative : null);
    const ev = a.newEvent('vagary-of-recruitment', {
      submittedBy: 'engine',
      targetTurn: campaign.currentTurn || 1,
      cadence: 'monthly-turn',
      payload: {
        rulerCharacterId: ruler.id, vagaryKey: row.key, name: row.name, brief: row.brief,
        domainId: domain ? domain.id : null, roll: res.roll, mod: res.mod || 0,
        pickBest: res.pickBest, pickWorst: res.pickWorst,
        recruitingKinds: kinds, realmUnitScale: unit.scale,
        effect: row.effect, applied: applied || null, narrative
      }
    });
    if(typeof a.setEventContext === 'function'){
      a.setEventContext(ev, {
        primaryHexId: hexId, domainId: domain ? domain.id : null,
        relatedEntities: [
          { kind:'character', id: ruler.id, role:'subject' },
          domain ? { kind:'domain', id: domain.id, role:'site' } : null
        ].filter(Boolean)
      });
    }
    ev.status = (a.EVENT_STATUS && a.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = campaign.currentTurn || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative }, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // The monthly driver — one roll per recruiting ruler (JJ p.110), behind the
  // vagaries-of-recruitment rule. Returns { ruleOn, rolled:[], events, logEntries }.
  function processRecruitmentVagariesForTurn(campaign, options){
    options = options || {};
    const rng = options.rng || Math.random;
    const result = { ruleOn: false, rolled: [], events: 0, logEntries: [] };
    if(!campaign) return result;
    if(!_ruleOn(campaign, 'vagaries-of-recruitment')) return result;
    result.ruleOn = true;
    const turn = campaign.currentTurn || 1;
    for(const e of rulersRecruitingThisMonth(campaign, turn)){
      const res = rollVagaryTable(VAGARY_OF_RECRUITMENT, { rng });
      if(!res.row) continue;
      const kinds = [...e.kinds];
      // ── W8 auto-apply: the two world-mutating recruitment vagaries (the rest stay GM-resolve). ──
      let applied = null;
      if(res.row.key === 'brigands-recruit'){
        const sp = spawnBrigandArmy(campaign, { domain: e.domain, source: 'recruitment', vagaryKey: res.row.key, rng });
        if(sp){
          applied = { kind: 'brigands', armyId: sp.army.id, officerName: sp.officer ? sp.officer.name : null,
            narrative: '— an enemy army has mustered' + (sp.army.currentHexId ? ' nearby' : '') + ' (now in 🎖 Armies)' };
        }
      } else if(res.row.key === 'commerce-disrupted' || res.row.key === 'commerce-improves'){
        const delta = (res.row.effect && res.row.effect.delta) || (res.row.key === 'commerce-improves' ? 1 : -1);
        const months = 1 + Math.floor(rng() * 6);   // 1d6 months (JJ p.111)
        const cv = applyCommerceVagary(campaign, e.domain, delta, months, { vagaryKey: res.row.key, rng });
        if(cv){
          applied = { kind: 'commerce', settlementId: cv.settlementId, fromClass: cv.fromClass, toClass: cv.toClass,
            delta: cv.delta, months: cv.months,
            narrative: '— ' + cv.settlementName + ' is treated as market Class ' + cv.toClass + ' for ' + cv.months + ' month(s)' };
        }
      }
      _emitRecruitmentVagary(campaign, e.ruler, e.domain, res, kinds, applied);
      result.events++;
      result.rolled.push({ rulerCharacterId: e.ruler.id, domainId: e.domain ? e.domain.id : null, vagaryKey: res.row.key, name: res.row.name, roll: res.roll, kinds, applied });
      result.logEntries.push('Vagary of Recruitment — ' + (e.ruler.name || 'a ruler') + ': ' + res.row.name + ' (' + res.row.brief + ')' + (applied ? ' ' + applied.narrative : ''));
    }
    return result;
  }

  // =============================================================================
  // War driver (weekly per army on campaign) — called from the slot-88 military
  // consumer (propose), committed via commitMilitaryRecord. PURE: rolls + returns
  // the record fields; the consumer mutation (lastWarVagaryOrd, next-roll mod clear)
  // happens on commit.
  // =============================================================================

  // Is THIS army due a weekly war-vagary roll at world-ordinal `ord`? An Army entity in
  // campaign.armies[] IS a mustered field force (you keep garrison UNITS, not armies, in
  // peacetime — the W5 supply check treats every active army as on-campaign), so "on
  // campaign / out of garrison" = "is an active army". RAW's finer "in enemy territory /
  // >1 month" gating is a 🔧 v1 simplification (noted in the docs). Weekly cadence via
  // army.lastWarVagaryOrd, mirroring the supply check's lastSupplyCheckOrd.
  function warVagaryDue(campaign, army, ord){
    if(!army) return false;
    const since = (army.lastWarVagaryOrd != null) ? (ord - army.lastWarVagaryOrd) : Infinity;
    return since >= 7;
  }
  // Is the army in a siege (besieging or besieged)? RAW (JJ p.113): roll twice/week during
  // sieges and take the worse. Reads campaign.sieges[] (W6) defensively.
  function armyInSiege(campaign, army){
    if(!army || !Array.isArray(campaign.sieges)) return false;
    return campaign.sieges.some(s => s && s.status !== 'resolved' && (s.besiegerArmyId === army.id || s.defenderArmyId === army.id));
  }
  // Roll the war vagary for an army (PURE). Honors the stored next-roll modifier
  // (army.vagaryWarNextMod from a prior Good/Ill Omen) and the siege double-take-worse.
  // Returns { row, roll, mod, total, clamped, siege, rolls:[...], nextMod } — nextMod is
  // the ±10 this result imposes on the NEXT roll (applied on commit).
  function rollWarVagary(campaign, army, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const carriedMod = (army && army.vagaryWarNextMod) || 0;
    const siege = !!(opts.siege != null ? opts.siege : armyInSiege(campaign, army));
    const draws = [];
    const n = siege ? 2 : 1;
    for(let i = 0; i < n; i++) draws.push(rollVagaryTable(VAGARY_OF_WAR, { rng, mod: carriedMod }));
    // siege: take the WORSE (lower total — the table runs roughly bad→good, lowest = worst).
    let chosen = draws[0];
    for(const d of draws) if(d.total < chosen.total) chosen = d;
    const nextMod = (chosen.row && chosen.row.effect && chosen.row.effect.category === 'next-roll-mod') ? (chosen.row.effect.delta || 0) : 0;
    return { row: chosen.row, roll: chosen.roll, mod: carriedMod, total: chosen.total, clamped: chosen.clamped,
             pickBest: chosen.pickBest, pickWorst: chosen.pickWorst, siege, draws, nextMod };
  }

  // =============================================================================
  // Battle driver (1d4 per heroic foray) — called from declareForay (battles).
  // Returns an array of rolled rows. PURE.
  // =============================================================================
  function rollBattleVagaries(campaign, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const count = 1 + Math.floor(rng() * 4);   // JJ p.116 — 1d4 vagaries per foray
    const out = [];
    for(let i = 0; i < count; i++){
      const res = rollVagaryTable(VAGARY_OF_BATTLE, { rng });
      if(res.row) out.push({ vagaryKey: res.row.key, name: res.row.name, brief: res.row.brief, roll: res.roll, effect: res.row.effect });
    }
    return out;
  }

  // =============================================================================
  // W8 auto-apply (2026-06-23) — the two self-contained, world-mutating vagaries that
  // RAW makes mechanically unambiguous: Brigands (spawn an independent enemy army) and
  // Commerce Disrupted/Improves (a timed market-class shift on the largest urban settlement).
  // Everything else (loyalty cascades, deaths, offers, war modifiers) stays a GM-resolve note,
  // exactly as RAW vagary tables are GM-adjudicated. All behind the default-OFF vagary rules.
  // =============================================================================

  // JJ p.111 / p.113 — materialize the Brigands vagary as an independent enemy Army (RAW: "treat
  // as an independent enemy army"). Composition by realm tier (vagaryRealmUnitSize): one bowman
  // unit + one cavalry unit (light for the recruitment vagary; medium for the war vagary's supply-
  // line raiders), plus a mercenary captain if the NPC generator is loaded. The army + its units
  // (stationedAt the army) land at the target hex, marked army.brigandVagary (provenance — a field,
  // not an entity; §3.1). It is fought through the shipped W3 Battle Wizard (it shows in 🎖 Armies);
  // driving it off does NOT heal the domain (outside renegades, not the domain's own banditry —
  // RR p.351). Defensive: a missing blankArmy/blankUnit/generator degrades gracefully. Returns
  // { army, units, officer } or null.
  function spawnBrigandArmy(campaign, opts){
    const a = A();
    opts = opts || {};
    if(!campaign || typeof a.blankUnit !== 'function' || typeof a.blankArmy !== 'function') return null;
    const rng = opts.rng || Math.random;
    const domain = opts.domain || null;
    const source = opts.source || 'recruitment';
    const turn = campaign.currentTurn || 1;
    const unit = vagaryRealmUnitSize(campaign, domain);   // {scale, infantry, cavalry}
    const dn = domain ? (domain.name || domain.id) : 'the realm';
    // placement: war raiders strike at the army's hex (its supply lines); recruitment brigands
    // appear at the domain seat ("harass the realm").
    let hexId = opts.atHexId || null;
    if(!hexId && domain && typeof a.domainSeatHexId === 'function') hexId = a.domainSeatHexId(campaign, domain);
    if(!hexId && domain){ const h = (campaign.hexes || []).find(x => x && x.domainId === domain.id); hexId = h ? h.id : null; }
    const armyId = (typeof a.newId === 'function') ? a.newId((a.ID_PREFIXES && a.ID_PREFIXES.army) || 'army-')
      : ('army-' + Math.floor(rng() * 1e9).toString(36));
    // the mercenary captain (rank by realm tier), if the generator is available (battles-only test
    // harnesses don't load it — degrade to a commanderless band, which the battle engine accepts).
    let officer = null;
    if(typeof a.generateNPC === 'function'){
      const lvl = (unit.scale === 'brigade') ? 9 : (unit.scale === 'battalion') ? 7 : 5;
      try {
        const gen = a.generateNPC(campaign, { class: 'fighter', targetLevel: lvl, alignment: 'Chaotic',
          socialTier: 'independent', controlledBy: 'gm', hexId, domainId: domain ? domain.id : null }, { rng });
        if(gen && gen.character){
          officer = gen.character;
          if(!Array.isArray(campaign.characters)) campaign.characters = [];
          campaign.characters.push(officer);
          if(typeof a.addCharacterHistory === 'function'){
            a.addCharacterHistory(campaign, officer, 'note', 'A mercenary captain leading brigands raised against ' + dn + ' (' + (source === 'war' ? 'JJ p.113' : 'JJ p.111') + ')');
          }
        }
      } catch(e){ officer = null; }
    }
    const cavTypeKey = (source === 'war') ? 'medium-cavalry' : 'light-cavalry';
    const bow = a.blankUnit({ unitTypeKey: 'bowman', race: 'man', count: unit.infantry, source: 'mercenary',
      scale: unit.scale, stationedAt: { kind: 'army', id: armyId }, displayName: 'Brigand Bowmen' });
    const cav = a.blankUnit({ unitTypeKey: cavTypeKey, race: 'man', count: unit.cavalry, source: 'mercenary',
      scale: unit.scale, stationedAt: { kind: 'army', id: armyId }, displayName: (source === 'war' ? 'Brigand Riders' : 'Brigand Outriders') });
    const units = [bow, cav];
    if(!Array.isArray(campaign.units)) campaign.units = [];
    campaign.units.push(bow, cav);
    const army = a.blankArmy({
      id: armyId,
      name: 'Brigands of ' + dn,
      leaderCharacterId: officer ? officer.id : null,
      currentHexId: hexId,
      strategicStance: 'offensive',
      divisions: [{ name: 'Brigand band', commanderCharacterId: officer ? officer.id : null,
        unitIds: units.map(u => u.id), role: 'main' }]
    });
    army.brigandVagary = { domainId: domain ? domain.id : null, raidedArmyId: opts.raidedArmyId || null,
      source, vagaryKey: opts.vagaryKey || null, sinceTurn: turn, realmScale: unit.scale };
    (army.history = army.history || []).push({ turn, type: 'brigands-mustered',
      text: 'Mustered as brigands against ' + dn + ' — ' + unit.infantry + ' bowmen + ' + unit.cavalry + ' ' + (source === 'war' ? 'medium' : 'light') + ' cavalry (' + unit.scale + ' scale, ' + (source === 'war' ? 'JJ p.113' : 'JJ p.111') + ')' });
    if(!Array.isArray(campaign.armies)) campaign.armies = [];
    campaign.armies.push(army);
    return { army, units, officer };
  }
  // The independent brigand armies raised against a domain (UI surfacing). Provenance via the field.
  function brigandArmiesForDomain(campaign, domainId){
    return ((campaign && campaign.armies) || []).filter(ar => ar && ar.brigandVagary && ar.brigandVagary.domainId === domainId);
  }

  // The domain's largest urban settlement (the Commerce vagary's RAW target, JJ p.111).
  function largestUrbanSettlement(campaign, domain){
    const a = A();
    if(!campaign || !domain || typeof a.hexSettlements !== 'function') return null;
    let best = null;
    for(const x of a.hexSettlements(campaign, domain)){   // {hex, hexIndex, settlement}
      const s = x && x.settlement;
      if(!s) continue;
      if(!best || (s.families || 0) > (best.families || 0)) best = s;
    }
    return best;
  }
  // JJ p.111 — Commerce Disrupted/Improves: treat the largest urban settlement as one market class
  // SMALLER (delta −1) or LARGER (delta +1) for `months` (1d6). The shift is stored canonically as
  // settlement.marketClassVagary (read by economy.marketClassRow + self-expiring) AND cached into
  // settlement.marketClass — the override field the settlement-level readers (magic-items / events /
  // demographics / hijinks / banking) already honor — so the shift reaches every market-class
  // consumer with no signature churn. restoreMarketClass preserves the pre-vagary value across a
  // re-application. processCommerceVagaryExpiryForTurn restores it. Returns the shift or null.
  function applyCommerceVagary(campaign, domain, deltaClasses, months, opts){
    const a = A();
    opts = opts || {};
    const s = largestUrbanSettlement(campaign, domain);
    if(!s || !deltaClasses) return null;
    const turn = campaign.currentTurn || 1;
    const T = a.MARKET_CLASS_TABLE || [];
    let baseRow = s.marketClass ? T.find(x => x.class === s.marketClass) : null;
    if(!baseRow && typeof a.lookupMarketClass === 'function') baseRow = a.lookupMarketClass(s.families || 0);
    const shifted = (typeof a.shiftMarketClassRow === 'function') ? a.shiftMarketClassRow(baseRow, deltaClasses) : baseRow;
    if(!shifted) return null;
    // Keep the ORIGINAL restore target across re-applications (never bake in an already-shifted cache).
    const prevRestore = (s.marketClassVagary && 'restoreMarketClass' in s.marketClassVagary)
      ? s.marketClassVagary.restoreMarketClass : (s.marketClass || null);
    s.marketClassVagary = { delta: deltaClasses, untilTurn: turn + months, sinceTurn: turn,
      source: 'recruitment-vagary', vagaryKey: opts.vagaryKey || null, restoreMarketClass: prevRestore };
    s.marketClass = shifted.class;
    return { settlementId: s.id, settlementName: s.name || s.id, fromClass: (baseRow && baseRow.class) || null,
      toClass: shifted.class, delta: deltaClasses, months, untilTurn: turn + months };
  }
  // Monthly expiry — restore settlements whose Commerce vagary has run out (currentTurn ≥ untilTurn).
  // Runs every committed turn from commitTurn (the cache needs a campaign-aware tick to clear; the
  // canonical read self-expires regardless). Returns { restored, logEntries }.
  function processCommerceVagaryExpiryForTurn(campaign){
    const a = A();
    const out = { restored: [], logEntries: [] };
    if(!campaign) return out;
    const turn = campaign.currentTurn || 1;
    const T = a.MARKET_CLASS_TABLE || [];
    for(const s of (campaign.settlements || [])){
      const v = s && s.marketClassVagary;
      if(!v) continue;
      if(v.untilTurn != null && turn >= v.untilTurn){
        if(v.restoreMarketClass) s.marketClass = v.restoreMarketClass; else delete s.marketClass;
        delete s.marketClassVagary;
        let nowRow = s.marketClass ? T.find(x => x.class === s.marketClass) : null;
        if(!nowRow && typeof a.lookupMarketClass === 'function') nowRow = a.lookupMarketClass(s.families || 0);
        const cls = nowRow ? nowRow.class : '?';
        out.restored.push({ settlementId: s.id, marketClass: cls });
        out.logEntries.push('Commerce in ' + (s.name || s.id) + ' has returned to normal (market Class ' + cls + ', JJ p.111).');
      }
    }
    return out;
  }

  Object.assign(ACKS, {
    VAGARY_OF_RECRUITMENT, VAGARY_OF_WAR, VAGARY_OF_BATTLE, VAGARY_TABLES,
    lookupVagaryRow, rollVagaryTable, vagaryNarrative, vagaryRealmUnitSize,
    rulersRecruitingThisMonth, processRecruitmentVagariesForTurn, _emitRecruitmentVagary,
    warVagaryDue, armyInSiege, rollWarVagary,
    rollBattleVagaries,
    spawnBrigandArmy, brigandArmiesForDomain, largestUrbanSettlement,
    applyCommerceVagary, processCommerceVagaryExpiryForTurn
  });

  if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
