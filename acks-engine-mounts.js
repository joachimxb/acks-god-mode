/* =============================================================================
 * acks-engine-mounts.js — ACKS God Mode Mounts & Mounted Movement (Phase 2.5, MO-1)
 *
 * The Mount data layer: a frozen MOUNT_CATALOG (the RR Domesticated Animals roster)
 * + the first-class Mount entity (campaign.mounts[], prefix mnt-) + the load→speed,
 * care/feeding, training, and barding accessors. The journey engine consumes these:
 * a mounted participant travels at his mount's load-adjusted expedition speed, and
 * each mount eats + drinks per day (RR p.276). Surfaced in the character Inventory
 * tab via ownerCharacterId (the Vault pattern).
 *
 * Mirrors the shipped Vessel module (acks-engine-voyages.js): a catalog + a first-class
 * catalog-keyed instance, owned by a character, assignable to a journey. The journey
 * already RESERVED journey.packAnimalIds[] + journey.supplies.animalFeed/animalWater +
 * dayRecord.rationsConsumed.animalFeed/animalWater for exactly this.
 *
 * SCOPE (v1 — world-facing): ownership, load, expedition speed, feeding, training,
 * barding-as-load, cost, condition. Mounted COMBAT (RR pp.308–309: the +1 mounted
 * attack, stay-mounted saves, charging, calming) is DEFERRED with the rest of tactical
 * combat (Combat_RAW_Survey.md); the entity reserves the data combat will need
 * (training / bardingKey-AC / hp / condition). Build view: Phase_2.5_Mounts_Plan.md.
 *
 * SOURCE + IP (CLAUDE.md §13.6): mechanical values only, page-cited, no rule prose.
 *   MOUNT_CATALOG — RR p.161 Animal/Vehicle Speed and Encumbrance table (the 4 speeds +
 *                   normal/max load) · RR pp.147–148 descriptions (per-breed traits +
 *                   war-training) · RR p.276 daily food/water + grazers + dromedaries ·
 *                   RR p.130 Domesticated Animals costs (by training). Dog speeds from the
 *                   p.147 descriptions (not in the p.161 table — dogs aren't ridden).
 *   BARDING_AC    — RR p.128 Armor and Barding (AC bonus by type). Barding ENCUMBRANCE
 *                   "Varies" by creature size (RR p.128) and is explicitly NOT the p.140
 *                   large-creature (normal-load/5) rule ("Armor other than barding…"), so
 *                   the per-mount barding load is a GM-set field, not an invented formula.
 *
 * Load order: AFTER acks-engine.js (newId / ID_PREFIXES / SCHEMA_VERSION) and the journey
 * engine (acks-engine-subsystems.js) — the journey consumer late-binds A.mount* and this
 * module late-binds A.carryTotalEncumbrance / A.itemEncumbranceSt. index.html adds the
 * <script> in the travel cluster (after sea-encounters); tests/_engine.js auto-discovers it.
 * Self-contained: pure reads/setters over a passed campaign, late-bound on global.ACKS.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // Late-bound core helpers (this module loads after acks-engine.js; reference at call time).
  function _mACKS(){ return global.ACKS || ACKS; }
  function _newMountId(){
    const A = _mACKS();
    const prefix = (A.ID_PREFIXES && A.ID_PREFIXES.mount) || 'mnt';
    return (typeof A.newId === 'function') ? A.newId(prefix) : (prefix + '-' + Math.random().toString(36).slice(2, 9));
  }
  function _schemaVersion(){
    const A = _mACKS();
    return (typeof A.SCHEMA_VERSION === 'number') ? A.SCHEMA_VERSION : 2;
  }

  // A man-sized humanoid is assumed to weigh 15 stone for carrying-capacity purposes
  // (RR p.161); carried/worn gear adds to it. So a rider loads his mount with
  // MAN_SIZED_BODY_ST + his own carried encumbrance.
  const MAN_SIZED_BODY_ST = 15;

  // ── MOUNT_CATALOG (immutable reference data) ───────────────────────────────
  // RR p.161 (speeds + load) + pp.147–148 (traits/training) + p.276 (food/water) +
  // p.130 (cost by training). Flat rows (the TROOP_CATALOG / VESSEL_CATALOG shape).
  //   explorationFt / explorationEncFt — feet per turn; unencumbered (≤ normal load) / encumbered (≤ max)
  //   combatFt / combatEncFt           — feet per round (reference; mounted combat deferred)
  //   runningFt / runningEncFt          — feet per round (reference)
  //   expeditionMi / expeditionEncMi    — MILES PER DAY (the journey driver): full / half load
  //   normalLoadSt / maxLoadSt          — the load→speed gate (≤ normal = full speed, ≤ max = half, > max = can't move)
  //   dailyFoodSt / dailyWaterSt        — RR p.276 (= normalLoad/10 and normalLoad/5 for most)
  //   trainings                          — which trainings the breed allows ('draft'|'riding'|'war'|'hunting')
  //   cost                               — gp by training (RR p.130; only the keys the table prints)
  //   traits                             — 'surefooted'|'grazer'|'desert-dromedary'|'force-march'|'fear-paralysis'|'war-no-charge'|'war-no-extra-hoof'|'scent-track'|'hunt-assist'|'howdah'
  //   rideable / packable / draftable    — role eligibility · size — abstract size category
  const MOUNT_CATALOG = [
    { key:'camel',        label:'Camel',        explorationFt:150, explorationEncFt:75,  combatFt:50, combatEncFt:25, runningFt:150, runningEncFt:75,  expeditionMi:30, expeditionEncMi:15, normalLoadSt:30, maxLoadSt:60,  dailyFoodSt:3,   dailyWaterSt:6,   trainings:['riding','war'],          cost:{ riding:100 },               traits:['desert-dromedary','war-no-charge'],      rideable:true,  packable:true,  draftable:false, size:'large', page:161 },
    { key:'donkey',       label:'Donkey',       explorationFt:120, explorationEncFt:60,  combatFt:40, combatEncFt:20, runningFt:120, runningEncFt:60,  expeditionMi:24, expeditionEncMi:12, normalLoadSt:15, maxLoadSt:30,  dailyFoodSt:1.5, dailyWaterSt:3,   trainings:['draft','riding'],        cost:{ draft:10 },                 traits:['surefooted','grazer','fear-paralysis'],  rideable:true,  packable:true,  draftable:true,  size:'large', page:161 },
    { key:'horse-heavy',  label:'Horse, Heavy', explorationFt:150, explorationEncFt:75,  combatFt:50, combatEncFt:25, runningFt:150, runningEncFt:75,  expeditionMi:30, expeditionEncMi:15, normalLoadSt:40, maxLoadSt:80,  dailyFoodSt:4,   dailyWaterSt:8,   trainings:['draft','war'],           cost:{ draft:40, war:315 },        traits:[],                                        rideable:true,  packable:true,  draftable:true,  size:'large', page:161 },
    { key:'horse-light',  label:'Horse, Light', explorationFt:240, explorationEncFt:120, combatFt:80, combatEncFt:40, runningFt:240, runningEncFt:120, expeditionMi:48, expeditionEncMi:24, normalLoadSt:20, maxLoadSt:40,  dailyFoodSt:2,   dailyWaterSt:4,   trainings:['riding','war'],          cost:{ riding:75, war:150 },       traits:[],                                        rideable:true,  packable:true,  draftable:false, size:'large', page:161 },
    { key:'horse-medium', label:'Horse, Medium',explorationFt:180, explorationEncFt:90,  combatFt:60, combatEncFt:30, runningFt:180, runningEncFt:90,  expeditionMi:36, expeditionEncMi:18, normalLoadSt:30, maxLoadSt:60,  dailyFoodSt:3,   dailyWaterSt:6,   trainings:['draft','riding','war'],  cost:{ draft:30, riding:40, war:250 }, traits:[],                                    rideable:true,  packable:true,  draftable:true,  size:'large', page:161 },
    { key:'horse-steppe', label:'Horse, Steppe',explorationFt:210, explorationEncFt:105, combatFt:70, combatEncFt:35, runningFt:210, runningEncFt:105, expeditionMi:42, expeditionEncMi:21, normalLoadSt:25, maxLoadSt:40,  dailyFoodSt:2,   dailyWaterSt:4,   trainings:['draft','riding','war'],  cost:{ draft:30, riding:60, war:120 }, traits:['grazer','force-march'],              rideable:true,  packable:true,  draftable:true,  size:'large', page:161 },
    { key:'mule',         label:'Mule',         explorationFt:150, explorationEncFt:75,  combatFt:50, combatEncFt:25, runningFt:150, runningEncFt:75,  expeditionMi:30, expeditionEncMi:15, normalLoadSt:25, maxLoadSt:50,  dailyFoodSt:2.5, dailyWaterSt:5,   trainings:['draft','riding','war'],  cost:{ draft:20, riding:30, war:50 },  traits:['surefooted','war-no-extra-hoof'],    rideable:true,  packable:true,  draftable:true,  size:'large', page:161 },
    { key:'ox',           label:'Ox',           explorationFt:120, explorationEncFt:60,  combatFt:40, combatEncFt:20, runningFt:120, runningEncFt:60,  expeditionMi:24, expeditionEncMi:12, normalLoadSt:45, maxLoadSt:90,  dailyFoodSt:4.5, dailyWaterSt:9,   trainings:['draft'],                 cost:{ draft:40 },                 traits:['grazer'],                                rideable:false, packable:true,  draftable:true,  size:'large', page:161 },
    { key:'elephant',     label:'Elephant',     explorationFt:120, explorationEncFt:60,  combatFt:40, combatEncFt:20, runningFt:120, runningEncFt:60,  expeditionMi:24, expeditionEncMi:12, normalLoadSt:180,maxLoadSt:360, dailyFoodSt:18,  dailyWaterSt:36,  trainings:['riding','war'],          cost:{ riding:1500, war:2000 },    traits:['howdah'],                                rideable:true,  packable:true,  draftable:false, size:'huge',  page:161 },
    // Dogs — work/hunting animals, not ridden. Speeds from the p.147 descriptions (not the
    // p.161 table). Hunting dog: a sighthound variant runs 240' but cannot track (not modelled
    // as a separate row). Hunting dogs assist hunting on expeditions (RR p.276).
    { key:'dog-hunting',  label:'Dog, Hunting', explorationFt:180, explorationEncFt:90,  combatFt:60, combatEncFt:30, runningFt:180, runningEncFt:90,  expeditionMi:36, expeditionEncMi:18, normalLoadSt:2,  maxLoadSt:4,   dailyFoodSt:0.2, dailyWaterSt:0.4, trainings:['hunting'],               cost:{ hunting:10 },               traits:['scent-track','hunt-assist'],             rideable:false, packable:true,  draftable:false, size:'small', page:147 },
    { key:'dog-war',      label:'Dog, War',     explorationFt:150, explorationEncFt:75,  combatFt:50, combatEncFt:25, runningFt:150, runningEncFt:75,  expeditionMi:30, expeditionEncMi:15, normalLoadSt:6,  maxLoadSt:12,  dailyFoodSt:0.6, dailyWaterSt:1.2, trainings:['war'],                   cost:{ war:75 },                   traits:[],                                        rideable:false, packable:true,  draftable:false, size:'small', page:147 }
  ].map(Object.freeze);
  Object.freeze(MOUNT_CATALOG);

  const MOUNT_CATALOG_BY_KEY = {};
  for(const c of MOUNT_CATALOG){ MOUNT_CATALOG_BY_KEY[c.key] = c; }

  // Barding AC bonus by type (RR p.128). Encumbrance + cost "Vary" by creature size
  // (RR p.128) — barding is explicitly NOT scaled by the p.140 large-creature rule — so
  // the per-mount barding load is a GM-set field (mount.bardingLoadSt), never invented here.
  const BARDING_AC = Object.freeze({ leather:1, scale:2, chain:3, lamellar:4, plate:5 });

  // ── Catalog lookups ─────────────────────────────────────────────────────────
  function findMountClass(catalogKey){ return (catalogKey && MOUNT_CATALOG_BY_KEY[catalogKey]) || null; }
  function mountClassKeys(){ return MOUNT_CATALOG.map(c => c.key); }
  function mountCatalogList(){ return MOUNT_CATALOG.slice(); }
  function isMountClass(catalogKey){ return !!findMountClass(catalogKey); }
  function mountClassLabel(catalogKey){ const c = findMountClass(catalogKey); return c ? c.label : (catalogKey || ''); }
  function mountTrainingCost(catalogKey, training){
    const c = findMountClass(catalogKey);
    if(!c || !c.cost) return null;
    const v = c.cost[training];
    return (typeof v === 'number') ? v : null;
  }

  // ── The Mount entity (mutable instance; Phase_2.5_Mounts_Plan.md §3.3) ───────
  // References a MOUNT_CATALOG class for immutable breed stats; carries everything that
  // changes (training / barding / role / ownership / cargo / feeding condition / hp).
  // Cargo reuses the Items I1 stash-item shape (the same lines character inventory + stashes
  // use) so itemEncumbranceSt sums it uniformly and the Transfer UI can move items into panniers.
  function blankMount(opts){
    opts = opts || {};
    const cls = findMountClass(opts.catalogKey);
    const defaultTraining = cls && Array.isArray(cls.trainings) && cls.trainings.length ? cls.trainings[0] : 'draft';
    const cf = opts.conditionFlags || {};
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newMountId(),
      name: opts.name || '',
      catalogKey: opts.catalogKey || '',          // → MOUNT_CATALOG (immutable breed stats)
      training: opts.training || defaultTraining,  // 'draft' | 'riding' | 'war' | 'hunting' (∈ catalog.trainings)
      role: opts.role || 'mount',                  // 'mount' (ridden) | 'pack' (hauls cargo) | 'draft' (pulls a vehicle)
      ownerCharacterId: opts.ownerCharacterId || null,  // the owner — surfaces in their Inventory tab
      riderCharacterId: opts.riderCharacterId || null,  // who's seated (role:'mount'); the rider whose weight loads the mount
      currentHexId: opts.currentHexId || null,
      cargo: Array.isArray(opts.cargo) ? opts.cargo.slice() : [],   // Items I1 lines it carries (feed, loot, gear)
      // Barding (war-trained only). bardingKey → BARDING_AC; bardingLoadSt is GM-set (RR p.128 "Varies").
      bardingKey: opts.bardingKey || null,         // null | 'leather'|'scale'|'chain'|'lamellar'|'plate'
      bardingLoadSt: (opts.bardingLoadSt != null) ? Number(opts.bardingLoadSt) || 0 : 0,
      bardingHalf: !!opts.bardingHalf,             // half-barding (RR p.128 — front only)
      bardingSpiked: !!opts.bardingSpiked,         // spiked barding (combat reference)
      // Combat reference (mounted combat deferred — set by GM / MM link when combat ships).
      hp: (opts.hp != null) ? opts.hp : null,
      condition: opts.condition || 'healthy',      // 'healthy' | 'wounded' | 'dead'
      // Feeding state — mirrors the character provisioning ladder (RR p.276).
      foodDeficitDays: Number(opts.foodDeficitDays) || 0,
      waterDeficitDays: Number(opts.waterDeficitDays) || 0,
      conditionFlags: {
        hungry:     !!cf.hungry,
        underfed:   !!cf.underfed,
        starving:   !!cf.starving,
        dehydrated: !!cf.dehydrated
      },
      createdAtTurn: (opts.createdAtTurn != null) ? opts.createdAtTurn : null,
      notes: opts.notes || '',
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }

  // Canonical create setter — init-on-write (no migrateCampaign injector; campaign.mounts is
  // read defensively as `|| []` everywhere else, so old saves + templates stay migrate-no-ops).
  function createMount(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const m = blankMount(opts || {});
    if(!Array.isArray(campaign.mounts)) campaign.mounts = [];
    campaign.mounts.push(m);
    return m;
  }

  // ── Instance lookups (defensive — absent collection reads as []) ─────────────
  function _mounts(campaign){ return (campaign && Array.isArray(campaign.mounts)) ? campaign.mounts : []; }
  function findMount(campaign, mountId){
    if(!mountId) return null;
    return _mounts(campaign).find(m => m && m.id === mountId) || null;
  }
  function mountsOwnedBy(campaign, characterId){
    if(!characterId) return [];
    return _mounts(campaign).filter(m => m && m.ownerCharacterId === characterId);
  }
  function mountsAtHex(campaign, hexId){
    if(!hexId) return [];
    return _mounts(campaign).filter(m => m && m.currentHexId === hexId);
  }
  // The mounts travelling with a journey (the reserved journey.packAnimalIds[] holder).
  function mountsForJourney(campaign, journey){
    const ids = (journey && Array.isArray(journey.packAnimalIds)) ? journey.packAnimalIds : [];
    if(!ids.length) return [];
    return ids.map(id => findMount(campaign, id)).filter(Boolean);
  }
  function mountClass(mount){ return mount ? findMountClass(mount.catalogKey) : null; }
  function mountRider(campaign, mount){
    if(!mount || !mount.riderCharacterId || !campaign || !Array.isArray(campaign.characters)) return null;
    return campaign.characters.find(c => c && c.id === mount.riderCharacterId) || null;
  }

  // ── Trait predicates ─────────────────────────────────────────────────────────
  function mountHasTrait(mount, trait){
    const c = mountClass(mount);
    return !!(c && Array.isArray(c.traits) && c.traits.indexOf(trait) !== -1);
  }
  function mountIsGrazer(mount){ return mountHasTrait(mount, 'grazer'); }
  function mountIsSurefooted(mount){ return mountHasTrait(mount, 'surefooted'); }
  function mountIsDesertDromedary(mount){ return mountHasTrait(mount, 'desert-dromedary'); }
  function mountCanForceMarchFree(mount){ return mountHasTrait(mount, 'force-march'); }
  function mountCanBeWarTrained(catalogKey){
    const c = findMountClass(catalogKey);
    return !!(c && Array.isArray(c.trainings) && c.trainings.indexOf('war') !== -1);
  }
  function mountCanWearBarding(mount){ return !!(mount && mount.training === 'war'); }  // RR p.147 — war-trained only

  // ── Barding ──────────────────────────────────────────────────────────────────
  function mountBardingAc(mount){
    if(!mount || !mount.bardingKey) return 0;
    return BARDING_AC[mount.bardingKey] || 0;
  }
  function mountBardingLoadSt(mount){
    // RR p.128 — barding encumbrance "Varies" by size; the per-mount value is GM-set.
    if(!mount || !mount.bardingKey) return 0;
    return Number(mount.bardingLoadSt) || 0;
  }

  // ── Load → speed (RR p.161) ────────────────────────────────────────────────
  // A man-sized rider weighs 15 st + his carried/worn gear (RR p.161 example: a cavalry
  // soldier with spear+shield+leather = 19 st on his mount). Pack/draft animals carry no rider.
  function mountRiderWeightSt(campaign, mount){
    if(!mount || mount.role !== 'mount') return 0;
    const rider = mountRider(campaign, mount);
    if(!rider) return 0;
    const A = _mACKS();
    const gear = (typeof A.carryTotalEncumbrance === 'function') ? A.carryTotalEncumbrance(rider) : 0;
    return MAN_SIZED_BODY_ST + gear;
  }
  function mountCargoWeightSt(mount){
    const A = _mACKS();
    if(!mount || !Array.isArray(mount.cargo)) return 0;
    if(typeof A.itemEncumbranceSt === 'function') return mount.cargo.reduce((s, it) => s + A.itemEncumbranceSt(it), 0);
    // fallback if the core helper isn't loaded yet
    return mount.cargo.reduce((s, it) => s + (it && (it.encumbranceSt != null ? Number(it.encumbranceSt) : (parseFloat(it.stone) || 0)) || 0), 0);
  }
  function mountNormalLoadSt(mount){ const c = mountClass(mount); return c ? c.normalLoadSt : 0; }
  function mountMaxLoadSt(mount){ const c = mountClass(mount); return c ? c.maxLoadSt : 0; }
  // Everything weighing the mount down: the rider (if ridden) + cargo + barding.
  function mountCurrentLoadSt(campaign, mount){
    return mountRiderWeightSt(campaign, mount) + mountCargoWeightSt(mount) + mountBardingLoadSt(mount);
  }
  // 'full' (≤ normal load → full speed), 'half' (≤ max load → half speed), 'overloaded' (can't move).
  function mountLoadBand(campaign, mount){
    const c = mountClass(mount);
    if(!c) return 'full';
    const load = mountCurrentLoadSt(campaign, mount);
    if(load <= c.normalLoadSt) return 'full';
    if(load <= c.maxLoadSt) return 'half';
    return 'overloaded';
  }
  // The journey driver: load-adjusted expedition speed (miles/day). 0 = overloaded (halts the party).
  function mountExpeditionMi(campaign, mount){
    const c = mountClass(mount);
    if(!c) return 0;
    const band = mountLoadBand(campaign, mount);
    if(band === 'overloaded') return 0;
    return (band === 'half') ? c.expeditionEncMi : c.expeditionMi;
  }

  // ── Care & feeding (RR p.276) ──────────────────────────────────────────────
  function mountDailyFoodSt(mount){ const c = mountClass(mount); return c ? c.dailyFoodSt : 0; }
  function mountDailyWaterSt(mount){ const c = mountClass(mount); return c ? c.dailyWaterSt : 0; }
  // A short human-readable feeding/condition summary for the UI + day log.
  function mountFeedingStatus(mount){
    if(!mount) return 'healthy';
    if(mount.condition === 'dead') return 'dead';
    const f = mount.conditionFlags || {};
    if(f.starving) return 'starving';
    if(f.dehydrated) return 'dehydrated';
    if(f.underfed) return 'underfed';
    if(f.hungry) return 'hungry';
    return 'healthy';
  }

  // ── Per-day feeding (RR p.276) — the journey-consumer seam ───────────────────
  // PURE: reads the journey's mounts + its animal-feed/water stores, returns the day's
  // per-mount feeding outcome as absolutes (the resolveDaySurvival / computeShipProvisionDay
  // pattern). The journey day-tick calls this (gated by ignore-rations), records the result,
  // and applyMountFeedingDay replays it on commit; a reroll reverts from the _preDay snapshot.
  //   opts.forcedMarch   — the day's pace is forced-march (grazers can't graze, RR p.276)
  //   opts.hasFreshWater — the hex has a free water source (river/lake/settlement) → no water drawn
  //   opts.terrain       — the hex terrain key ('barrens'/'desert' block non-native grazing)
  function resolveMountFeedingDay(campaign, journey, opts){
    opts = opts || {};
    const out = { tracked:false, mounts:[], foodStoreAfter:0, waterStoreAfter:0,
                  foodConsumed:0, waterConsumed:0, anyShort:false, anyStarving:false, anyDehydrated:false };
    const herd = mountsForJourney(campaign, journey).filter(m => mountClass(m) && m.condition !== 'dead');
    if(!herd.length) return out;
    out.tracked = true;
    const sup = (journey && journey.supplies) || {};
    let foodStore = Number(sup.animalFeed) || 0;
    let waterStore = Number(sup.animalWater) || 0;
    out.foodStoreAfter = foodStore; out.waterStoreAfter = waterStore;
    const forcedMarch = !!opts.forcedMarch;
    const freeWater = !!opts.hasFreshWater;
    const grazeBlocked = (opts.terrain === 'barrens' || opts.terrain === 'desert');  // RR p.276 — only native grazers
    for(const m of herd){
      const needF = mountDailyFoodSt(m), needW = mountDailyWaterSt(m);
      // FOOD: graze free (grazer, not force-marched, terrain permits) else draw from the store
      let grazed=false, fedFood=false;
      if(mountIsGrazer(m) && !forcedMarch && !grazeBlocked){ grazed=true; fedFood=true; }
      else if(foodStore >= needF){ foodStore -= needF; out.foodConsumed += needF; fedFood=true; }
      // WATER: camels need none; a fresh source waters free; else draw from the store
      let fedWater=false, freeW=false;
      if(mountIsDesertDromedary(m)){ fedWater=true; }
      else if(freeWater){ fedWater=true; freeW=true; }
      else if(waterStore >= needW){ waterStore -= needW; out.waterConsumed += needW; fedWater=true; }
      // deficit ladders (RR p.276): a fed day resets to 0, a short day +1
      let fDef = fedFood ? 0 : (Number(m.foodDeficitDays)||0) + 1;
      let wDef = fedWater ? 0 : (Number(m.waterDeficitDays)||0) + 1;
      const flags = { hungry:fDef>=1, underfed:fDef>=2, starving:fDef>=7, dehydrated:wDef>=1 };
      if(!fedFood || !fedWater) out.anyShort = true;
      if(flags.starving) out.anyStarving = true;
      if(flags.dehydrated) out.anyDehydrated = true;
      out.mounts.push({ mountId:m.id, name:(m.name || mountClassLabel(m.catalogKey)),
        fedFood, fedWater, grazed, freeWater:freeW, needFood:needF, needWater:needW,
        foodDeficitDays:fDef, waterDeficitDays:wDef, flags });
    }
    out.foodStoreAfter = foodStore; out.waterStoreAfter = waterStore;
    return out;
  }
  // Replay the feeding outcome onto the campaign (idempotent SETs — safe to re-apply). Mirrors
  // applyDaySurvival/applyVoyageDayState: the tick already resolved; commit just writes the absolutes.
  function applyMountFeedingDay(campaign, journey, result){
    if(!campaign || !journey || !result || !result.tracked) return;
    journey.supplies = journey.supplies || {};
    journey.supplies.animalFeed = result.foodStoreAfter;
    journey.supplies.animalWater = result.waterStoreAfter;
    for(const r of (result.mounts || [])){
      const m = findMount(campaign, r.mountId);
      if(!m) continue;
      m.foodDeficitDays = r.foodDeficitDays;
      m.waterDeficitDays = r.waterDeficitDays;
      m.conditionFlags = { hungry:!!r.flags.hungry, underfed:!!r.flags.underfed, starving:!!r.flags.starving, dehydrated:!!r.flags.dehydrated };
    }
  }

  // ── Record-only audit event kinds (PR #89 kernel — self-registered, no events.js edit) ──
  function applyEvent_mountAudit(campaign, event){
    const p = (event && event.payload) || {};
    return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'mount event' } };
  }
  (function _registerMountEventKinds(){
    const A = _mACKS();
    if(typeof A.registerEventKind !== 'function') return;
    A.registerEventKind('mount-acquired', {
      schema: { R: { mountId: 'string' }, O: { catalogKey: 'string', ownerCharacterId: 'string', training: 'string', narrative: 'string' } },
      wizardOptOut: true, handler: applyEvent_mountAudit });
    A.registerEventKind('mount-died', {
      schema: { R: { mountId: 'string' }, O: { cause: 'string', narrative: 'string' } },
      wizardOptOut: true, handler: applyEvent_mountAudit });
  })();

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    MOUNT_CATALOG, BARDING_AC, MAN_SIZED_BODY_ST,
    findMountClass, mountClassKeys, mountCatalogList, isMountClass, mountClassLabel, mountTrainingCost,
    blankMount, createMount,
    findMount, mountsOwnedBy, mountsAtHex, mountsForJourney, mountClass, mountRider,
    mountHasTrait, mountIsGrazer, mountIsSurefooted, mountIsDesertDromedary, mountCanForceMarchFree,
    mountCanBeWarTrained, mountCanWearBarding,
    mountBardingAc, mountBardingLoadSt,
    mountRiderWeightSt, mountCargoWeightSt, mountNormalLoadSt, mountMaxLoadSt,
    mountCurrentLoadSt, mountLoadBand, mountExpeditionMi,
    mountDailyFoodSt, mountDailyWaterSt, mountFeedingStatus,
    resolveMountFeedingDay, applyMountFeedingDay
  });

})(typeof window !== 'undefined' ? window : global);
