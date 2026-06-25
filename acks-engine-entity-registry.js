/* ACKS God Mode — acks-engine-entity-registry.js
 * Entity Registry (#550 — 2026-05-31 (renamed Object → Entity 2026-05-31)).
 *
 * The canonical registry of every "thing" in the data layer that can be:
 *   - listed (enumerated for a picker)
 *   - found by id (universal lookup)
 *   - labeled (UI display)
 *   - attached to an event's context envelope or a Chronicle entry
 *
 * Two flavors:
 *   - First-class entities (addressable: true, own collection on campaign.*)
 *   - Sub-entities (addressable: true but nested inside a parent)
 *
 * NOT in this registry:
 *   - Annotations / notes that live as fields on an entity (domain.notes,
 *     character.background, hex POI free text). Those are attributes, not subjects.
 *
 * Contributor mandate (CLAUDE §8.9):
 *   When a new addressable kind ships, register it here AND in importDomainFiles
 *   (SIMPLE_ID_COLLECTIONS) in the same delivery.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // §15.5 self-registration kernel (Architecture §9.4) — the entity registry is an accumulating
  // store seeded with the legacy set. A new module self-registers its kind from its own file via
  // ACKS.registerEntityKind(entry) instead of editing this central literal (the team-session
  // append-target this slice removes). The seed below carries the EXACT pre-refactor content + order.
  const ENTITY_KINDS_LIST = [];   // accumulating store (mutable; grows via registerEntityKind)
  const ENTITY_KINDS = {};        // kind → entry index (built by registerEntityKind, was a for-loop)

  function _entityKindSig(e){
    return JSON.stringify({ kind: e.kind, label: e.label, pluralLabel: e.pluralLabel,
      icon: e.icon, addressable: e.addressable, chronicleable: e.chronicleable });
  }
  function registerEntityKind(entry){
    if(!entry || !entry.kind) return;                      // falsy-safe no-op
    const kind = entry.kind, existing = ENTITY_KINDS[kind];
    if(existing){                                          // idempotent / conflict-keeps-original
      if(_entityKindSig(existing) !== _entityKindSig(entry)){
        try { console.warn('registerEntityKind: "' + kind + '" already registered with different metadata; keeping the original'); } catch(_e){}
      }
      return;
    }
    ENTITY_KINDS_LIST.push(entry);
    ENTITY_KINDS[kind] = entry;
  }

  // Ordered for picker presentation — primary narrative anchors first, sub-entities last.
  const ENTITY_KINDS_SEED = [
    // ── PRIMARY NARRATIVE ANCHORS ──
    { kind: 'character', label: 'Character', pluralLabel: 'Characters', icon: '🧙',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.characters) || [],
      find: (c, id) => ((c && c.characters) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) || '(unnamed)' },

    { kind: 'party', label: 'Party', pluralLabel: 'Parties', icon: '🧑‍🤝‍🧑',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.parties) || [],
      find: (c, id) => ((c && c.parties) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'group', label: 'Group', pluralLabel: 'Groups', icon: '👥',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.groups) || [],
      find: (c, id) => ((c && c.groups) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.groupTemplate && obj.groupTemplate.monsterCatalogKey) || (obj && obj.id) },

    // ── GEOGRAPHY ──
    { kind: 'hex', label: 'Hex', pluralLabel: 'Hexes', icon: '⬡',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.hexes) || [],
      find: (c, id) => ((c && c.hexes) || []).find(x => x && x.id === id),
      // Canonical hex name (Architecture §11.3) — hexName ships from acks-engine-subsystems.js (loaded
      // after this module), so reference it at call time via global.ACKS, with a coord/id fallback.
      displayName: (c, obj) => (global.ACKS && global.ACKS.hexName && global.ACKS.hexName(obj, c)) || (obj && obj.coord ? ('(' + obj.coord.q + ',' + obj.coord.r + ')') : (obj && obj.id)) || '(unknown)' },

    { kind: 'settlement', label: 'Settlement', pluralLabel: 'Settlements', icon: '🏘',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.settlements) || [],
      find: (c, id) => ((c && c.settlements) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'domain', label: 'Domain', pluralLabel: 'Domains', icon: '🏰',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.domains) || [],
      find: (c, id) => ((c && c.domains) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    // ── BUILDINGS + WORK IN PROGRESS ──
    { kind: 'project', label: 'Project', pluralLabel: 'Projects', icon: '🚧',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.projects) || [],
      find: (c, id) => ((c && c.projects) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.constructibleKind) || (obj && obj.id) },

    { kind: 'constructible', label: 'Constructible (completed building)', pluralLabel: 'Constructibles', icon: '🏛',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.constructibles) || [],
      find: (c, id) => ((c && c.constructibles) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.constructibleKind) || (obj && obj.id) },

    { kind: 'outpost', label: 'Outpost', pluralLabel: 'Outposts', icon: '⛺',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.outposts) || [],
      find: (c, id) => ((c && c.outposts) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    // Phase 2.5 Monster Persistence (#476, M0) — Lair, the NPC-inhabited placed entity (the
    // Outpost is its player-controlled mirror). campaign.lairs[]; see blankLair (§3.1).
    { kind: 'lair', label: 'Lair', pluralLabel: 'Lairs', icon: '🏚',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.lairs) || [],
      find: (c, id) => ((c && c.lairs) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.monsterCatalogKey) || (obj && obj.id) },

    // #476 Encounter layer E1 (D8) — the reified pre-combat interaction between two sides
    // (RR pp.280–287). campaign.encounters[]; resolved encounters persist as world memory.
    { kind: 'encounter', label: 'Encounter', pluralLabel: 'Encounters', icon: '🐉',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.encounters) || [],
      find: (c, id) => ((c && c.encounters) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.monsterSide && obj.monsterSide.monsterCatalogKey) || (obj && obj.category) || (obj && obj.id) },

    // === Delves D2 (burst4) — Dungeon (the delve target / arcane source) + Delve (the multi-foray
    // operation). 🏯 clashes with siege + stronghold-component, so Dungeon uses 🕳️ (per the prompt's
    // "confirm no icon clash"); ⛏ Delve is clash-free. campaign.dungeons[] (lazy-defaulted) +
    // campaign.delves[] (read defensively). displayName reads only blank{Dungeon,Delve} keys
    // (the registry⊆factory invariant). ===
    { kind: 'dungeon', label: 'Dungeon', pluralLabel: 'Dungeons', icon: '🕳️',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.dungeons) || [],
      find: (c, id) => ((c && c.dungeons) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'delve', label: 'Delve', pluralLabel: 'Delves', icon: '⛏',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.delves) || [],
      find: (c, id) => ((c && c.delves) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },
    // === end Delves D2 ===

    // ── WEALTH + INVENTORY ──
    { kind: 'stash', label: 'Stash', pluralLabel: 'Stashes', icon: '💰',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.stashes) || [],
      find: (c, id) => ((c && c.stashes) || []).find(x => x && x.id === id),
      // blankStash emits `name`, not `label` (integration audit fix, 2026-05-31).
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'notableItem', label: 'Notable Item', pluralLabel: 'Notable Items', icon: '⚔',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.notableItems) || [],
      find: (c, id) => ((c && c.notableItems) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    // ── COMMERCE + CHRONICLE THINGS ──
    { kind: 'venture', label: 'Mercantile Venture', pluralLabel: 'Ventures', icon: '⛵',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.ventures) || [],
      find: (c, id) => ((c && c.ventures) || []).find(x => x && x.id === id),
      // blankVenture emits no `name`; describe by venturer → destination (integration audit fix).
      displayName: (c, obj) => obj ? ((obj.venturerCharacterId || '?') + ' → ' + (obj.destinationDomainId || '?')) : '' },

    { kind: 'rumor', label: 'Rumor', pluralLabel: 'Rumors', icon: '💬',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.rumors) || [],
      find: (c, id) => ((c && c.rumors) || []).find(x => x && x.id === id),
      displayName: (c, obj) => ((obj && obj.text) || '').slice(0, 60) || (obj && obj.id) },

    { kind: 'journey', label: 'Journey', pluralLabel: 'Journeys', icon: '🧭',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.journeys) || [],
      find: (c, id) => ((c && c.journeys) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    // ── EVENTS (chronicled by other events, but can themselves be referenced) ──
    { kind: 'event', label: 'Event', pluralLabel: 'Events', icon: '📜',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.eventLog) || [],
      find: (c, id) => ((c && c.eventLog) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? (obj.kind + (obj.id ? ' · ' + obj.id : '')) : '' },

    // ── RELATIONS (Wave A first-class) ──
    { kind: 'henchmanship', label: 'Henchmanship', pluralLabel: 'Henchmanships', icon: '🤝',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.henchmanships) || [],
      find: (c, id) => ((c && c.henchmanships) || []).find(x => x && x.id === id),
      // blankHenchmanship emits `subjectCharacterId`, not `henchmanCharacterId` (integration audit fix).
      displayName: (c, obj) => obj ? ((obj.subjectCharacterId || '?') + ' under ' + (obj.patronCharacterId || '?')) : '' },

    { kind: 'specialistContract', label: 'Specialist Contract', pluralLabel: 'Specialist Contracts', icon: '🛠',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.specialistContracts) || [],
      find: (c, id) => ((c && c.specialistContracts) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.specialistCharacterId || '?') + ' for ' + (obj.employerCharacterId || '?')) : '' },

    { kind: 'hirelingContract', label: 'Hireling Contract', pluralLabel: 'Hireling Contracts', icon: '📝',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.hirelingContracts) || [],
      find: (c, id) => ((c && c.hirelingContracts) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.hirelingCharacterId || '?') + ' for ' + (obj.employerCharacterId || '?')) : '' },

    { kind: 'magistracy', label: 'Magistracy', pluralLabel: 'Magistracies', icon: '⚖',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.magistracies) || [],
      find: (c, id) => ((c && c.magistracies) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.role || '?') + ' of ' + (obj.domainId || '?')) : '' },

    { kind: 'vassalage', label: 'Vassalage', pluralLabel: 'Vassalages', icon: '👑',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.vassalages) || [],
      find: (c, id) => ((c && c.vassalages) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.vassalDomainId || '?') + ' → ' + (obj.suzerainCharacterId || '?')) : '' },

    { kind: 'tributaryAgreement', label: 'Tributary Agreement', pluralLabel: 'Tributary Agreements', icon: '💸',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.tributaryAgreements) || [],
      find: (c, id) => ((c && c.tributaryAgreements) || []).find(x => x && x.id === id),
      // blankTributaryAgreement emits `recipientDomainId`, not `payeeDomainId` (integration audit fix).
      displayName: (c, obj) => obj ? ((obj.payerDomainId || '?') + ' → ' + (obj.recipientDomainId || '?')) : '' },

    { kind: 'favorDutyObligation', label: 'Favor / Duty Obligation', pluralLabel: 'Favors & Duties', icon: '📜',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.favorDutyObligations) || [],
      find: (c, id) => ((c && c.favorDutyObligations) || []).find(x => x && x.id === id),
      // blankFavorDutyObligation emits `kind` (the edict) + `vassalDomainId` + `liegeCharacterId`.
      displayName: (c, obj) => obj ? ((obj.kind || 'edict') + ': ' + (obj.liegeCharacterId || '?') + ' → ' + (obj.vassalDomainId || '?')) : '' },

    // ── RESERVED (collections defined; subsystems not yet shipped) ──
    // === Religion R0 (team 2026-06-13) — Wave E now active (Phase_4_Religion_Plan.md). The
    // Deity reference entity is added; congregation/divineFavor were pre-reserved. divineFavor's
    // displayName is corrected to read only blankDivineFavor fields (it has NO `name`; D1) — else
    // the displayName + schema⊆factory smoke invariants fail once the factory exists. ──
    { kind: 'deity', label: 'Deity', pluralLabel: 'Deities', icon: '🛐',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.deities) || [],
      find: (c, id) => ((c && c.deities) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'congregation', label: 'Congregation', pluralLabel: 'Congregations', icon: '⛪',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.congregations) || [],
      find: (c, id) => ((c && c.congregations) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'divineFavor', label: 'Divine Favor', pluralLabel: 'Divine Favors', icon: '📿',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.divineFavors) || [],
      find: (c, id) => ((c && c.divineFavors) || []).find(x => x && x.id === id),
      // blankDivineFavor emits characterId + deityId (no `name`, D1) — describe by the relation.
      displayName: (c, obj) => obj ? ((obj.characterId || '?') + ' ⛪ ' + (obj.deityId || '?')) : '' },

    { kind: 'attunement', label: 'Attunement', pluralLabel: 'Attunements', icon: '🔮',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.attunements) || [],
      find: (c, id) => ((c && c.attunements) || []).find(x => x && x.id === id),
      // blankAttunement emits mageCharacterId + dungeonId (a relation; no `name`) — describe by the
      // relation (the divineFavor precedent).
      displayName: (c, obj) => obj ? ((obj.name) || ((obj.mageCharacterId || '?') + ' 🔮 ' + (obj.dungeonId || '?'))) : '' },

    // === Phase 4 — Sanctums AD-B — the Apprenticeship relation (apr-, campaign.apprenticeships[]; RR p.386).
    // An L0 apprentice studies under a sanctum-owning master toward an L1 companion. displayName reads only
    // blankApprenticeship keys (name/apprenticeCharacterId/masterCharacterId) per the registry⊆factory invariant. ──
    { kind: 'apprenticeship', label: 'Apprenticeship', pluralLabel: 'Apprenticeships', icon: '📖',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.apprenticeships) || [],
      find: (c, id) => ((c && c.apprenticeships) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.name) || ((obj.apprenticeCharacterId || '?') + ' 📖 ' + (obj.masterCharacterId || '?'))) : '' },

    // === Phase 4 — Magic Research (AD-M1) — the Research Project (rsp-, campaign.researchProjects[];
    // RR pp.388–393). A multi-day arcane undertaking (the Arcane-Domain consumer). displayName reads
    // only blankResearchProject keys (name/kind/id) per the registry⊆factory invariant. ──
    { kind: 'research-project', label: 'Research Project', pluralLabel: 'Research Projects', icon: '⚗',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.researchProjects) || [],
      find: (c, id) => ((c && c.researchProjects) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.name || obj.kind)) || (obj && obj.id) },

    // === Sages SG-2 (burst8 b8-sages 2026-06-19) — the multi-week SageCommission (sag-,
    // campaign.sageCommissions[]; Phase_4_Sages_Plan.md §3.3). A work-in-progress research
    // undertaking advanced on the slot-64 day-tick. displayName reads only blankSageCommission
    // keys (subject/id) per the registry⊆factory invariant (tests/smoke.js). ──
    { kind: 'sageCommission', label: 'Sage Commission', pluralLabel: 'Sage Commissions', icon: '📜',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.sageCommissions) || [],
      find: (c, id) => ((c && c.sageCommissions) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.subject) ? ('Research: ' + obj.subject) : (obj && obj.id) },

    // Delves D5 (team burst11 2026-06-20) — the kind was reserved 2026-05-30; this lane mints the
    // blankSettlementVisit factory + field-schema. displayName reads only blankSettlementVisit keys
    // (name/id) per the registry⊆factory invariant (tests/smoke.js).
    { kind: 'settlementVisit', label: 'Settlement Visit', pluralLabel: 'Settlement Visits', icon: '🛤',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.settlementVisits) || [],
      find: (c, id) => ((c && c.settlementVisits) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'oath', label: 'Oath', pluralLabel: 'Oaths', icon: '🗡',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.oaths) || [],
      find: (c, id) => ((c && c.oaths) || []).find(x => x && x.id === id),
      displayName: (c, obj) => ((obj && obj.text) || '').slice(0, 50) || (obj && obj.id) },

    // === Hijinks HJ-1 (team 2026-06-13) — the hijink attempt (Phase 2.7, RR pp.360–370).
    // campaign.hijinks[]; a day-tick-driven downtime activity. displayName reads only
    // blankHijink-emitted keys (label/type/id) per the registry⊆factory invariant. ──
    { kind: 'hijink', label: 'Hijink', pluralLabel: 'Hijinks', icon: '🗡',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.hijinks) || [],
      find: (c, id) => ((c && c.hijinks) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.label) || (obj && obj.type) || (obj && obj.id) },

    // === Hijinks HJ-2 (team 2026-06-13) — the criminal Syndicate (Phase 2.7, RR pp.358–362).
    // campaign.syndicates[]; the enterprise a boss runs out of a hideout. displayName reads
    // only blankSyndicate-emitted keys (name/id) per the registry⊆factory invariant. ──
    { kind: 'syndicate', label: 'Syndicate', pluralLabel: 'Syndicates', icon: '🏛',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.syndicates) || [],
      find: (c, id) => ((c && c.syndicates) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    // Phase 3 Military W1 (2026-06-12) — Unit (the Group's military sibling) + Army.
    // Units are first-class in campaign.units[]; the legacy 'garrison-unit' sub-entity
    // kind below keeps resolving the SAME objects through the nested mirrors.
    { kind: 'unit', label: 'Unit', pluralLabel: 'Units', icon: '🪖',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.units) || [],
      find: (c, id) => ((c && c.units) || []).find(x => x && x.id === id),
      displayName: (c, obj) => {
        if(!obj) return '';
        const name = (obj.displayName || '').trim() || obj.unitTypeKey || obj.id;
        const count = obj.count != null ? (' (' + obj.count + ')') : '';
        return name + count;
      } },

    { kind: 'army', label: 'Army', pluralLabel: 'Armies', icon: '🎖',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.armies) || [],
      find: (c, id) => ((c && c.armies) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.name || obj.id)) || '' },

    // Phase 3 Military W3 (2026-06-12) — Battle (the RR pp.461–472 engagement record).
    { kind: 'battle', label: 'Battle', pluralLabel: 'Battles', icon: '🎌',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.battles) || [],
      find: (c, id) => ((c && c.battles) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.name || obj.id)) || '' },

    // Phase 3 Military W6 (2026-06-13, burst3) — Siege (the RR pp.473–485 stronghold investment).
    // campaign.sieges[] (read defensively — no migrateCampaign injector). displayName reads only
    // blankSiege-emitted keys (name/id) per the registry⊆factory invariant.
    { kind: 'siege', label: 'Siege', pluralLabel: 'Sieges', icon: '🏯',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.sieges) || [],
      find: (c, id) => ((c && c.sieges) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.name || obj.id)) || '' },

    // === Voyages V1 (burst4 — 2026-06-14) — Vessel (Phase 3 Voyages #145, RR Ch.7).
    // campaign.vessels[] (read defensively — no migrateCampaign injector, so templates stay
    // migrate-no-ops). displayName reads only blankVessel keys (registry⊆factory invariant). ===
    { kind: 'vessel', label: 'Vessel', pluralLabel: 'Vessels', icon: '🚢',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.vessels) || [],
      find: (c, id) => ((c && c.vessels) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.name || obj.catalogKey || obj.id)) || '' },

    // === Mounts (Phase 2.5 MO-1 — 2026-06-21) — Mount (RR p.161 Domesticated Animals;
    // acks-engine-mounts.js). campaign.mounts[] (read defensively — no migrateCampaign
    // injector, so templates stay migrate-no-ops). displayName reads only blankMount keys
    // (the registry⊆factory invariant). ===
    { kind: 'mount', label: 'Mount', pluralLabel: 'Mounts', icon: '🐴',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.mounts) || [],
      find: (c, id) => ((c && c.mounts) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.name || obj.catalogKey || obj.id)) || '' },

    // === Politics P-1 (burst4 2026-06-13) — the senate/faction/senatorship data layer (RR pp.355–360;
    // acks-engine-politics.js). Read defensively (campaign.senates/factions/senatorships) — no
    // migrateCampaign injector, so the templates stay migrate-no-ops. displayName reads only the
    // matching blankX-emitted keys (the registry⊆factory invariant). ──
    { kind: 'senate', label: 'Senate', pluralLabel: 'Senates', icon: '🏛',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.senates) || [],
      find: (c, id) => ((c && c.senates) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'faction', label: 'Faction', pluralLabel: 'Factions', icon: '⚖',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.factions) || [],
      find: (c, id) => ((c && c.factions) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'senatorship', label: 'Senatorship', pluralLabel: 'Senatorships', icon: '🗳',
      addressable: true, chronicleable: false,
      list: (c) => (c && c.senatorships) || [],
      find: (c, id) => ((c && c.senatorships) || []).find(x => x && x.id === id),
      // blankSenatorship emits senatorCharacterId + senateId (no `name`) — describe by the relation.
      displayName: (c, obj) => obj ? ((obj.senatorCharacterId || '?') + ' in ' + (obj.senateId || '?')) : '' },

    // === Gladiators G1 (b5-gladiators, burst5 2026-06-14) — AXIOMS 4 (#150). Bout / Gladiator
    // School / Game are first-class; the gladiator is a Character (socialTier:'gladiator', not a
    // kind here). Read defensively (campaign.bouts/gladiatorSchools/games) — no migrateCampaign
    // injector, so templates stay migrate-no-ops. displayName reads only the matching blankX keys
    // (the registry⊆factory invariant; bout/game are checked, gladiator-school is skipped by the
    // cap-naming but kept factory-clean). ──
    { kind: 'bout', label: 'Bout', pluralLabel: 'Bouts', icon: '⚔',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.bouts) || [],
      find: (c, id) => ((c && c.bouts) || []).find(x => x && x.id === id),
      // blankBout emits no `name` — describe by kind + status.
      displayName: (c, obj) => obj ? ((obj.kind || 'bout') + ' · ' + (obj.status || '?')) : '' },

    { kind: 'gladiator-school', label: 'Gladiator School', pluralLabel: 'Gladiator Schools', icon: '🏟',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.gladiatorSchools) || [],
      find: (c, id) => ((c && c.gladiatorSchools) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'game', label: 'Gladiatorial Game', pluralLabel: 'Gladiatorial Games', icon: '🎪',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.games) || [],
      find: (c, id) => ((c && c.games) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },
    // === end Gladiators G1 ===
    // === Custom Classes & Races W1 (b5-custom-classes, team burst5) — #154. The two catalog/template
    // entities (acks-engine-custom-classes.js). Read defensively (campaign.customClasses/customRaces) —
    // no migrateCampaign injector, so templates stay migrate-no-ops. displayName reads only blankX keys
    // (the registry⊆factory invariant). Inspector-only first slice (the Class/Race Builder is W4). ──
    { kind: 'custom-class', label: 'Class Template', pluralLabel: 'Class Templates', icon: '🛠',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.customClasses) || [],
      find: (c, id) => ((c && c.customClasses) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.displayName || obj.key || obj.id)) || '' },

    { kind: 'custom-race', label: 'Race Template', pluralLabel: 'Race Templates', icon: '🧬',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.customRaces) || [],
      find: (c, id) => ((c && c.customRaces) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && (obj.displayName || obj.key || obj.id)) || '' },

    // ── SUB-ENTITIES (nested inside parents, but addressable by id) ──
    { kind: 'garrison-unit', label: 'Garrison Unit', pluralLabel: 'Garrison Units', icon: '⚔',
      addressable: true, chronicleable: true,
      // T6 single-home — garrison + private-retinue units read from the canonical campaign.units[]
      // by stationedAt kind (the nested domain.garrison.units / character.mercenaryCompany.units
      // mirror is gone). Distinct from the first-class 'unit' kind above, which lists ALL units.
      list: (c) => ((c && c.units) || []).filter(u => u && u.stationedAt &&
        (u.stationedAt.kind === 'domain-garrison' || u.stationedAt.kind === 'character')),
      find: (c, id) => ((c && c.units) || []).find(u => u && u.id === id && u.stationedAt &&
        (u.stationedAt.kind === 'domain-garrison' || u.stationedAt.kind === 'character')) || null,
      displayName: (c, obj) => {
        if(!obj) return '';
        const name = (obj.displayName || '').trim() || obj.unitTypeKey || obj.id;
        const count = obj.count != null ? (' (' + obj.count + ')') : '';
        return name + count;
      } },

    { kind: 'stronghold-component', label: 'Stronghold Component', pluralLabel: 'Stronghold Components', icon: '🏯',
      addressable: true, chronicleable: true,
      list: (c) => {
        const out = [];
        for(const d of ((c && c.domains) || [])){
          for(const sc of ((d && d.stronghold && d.stronghold.components) || [])){ if(sc) out.push(sc); }
        }
        return out;
      },
      find: (c, id) => {
        for(const d of ((c && c.domains) || [])){
          for(const sc of ((d && d.stronghold && d.stronghold.components) || [])){ if(sc && sc.id === id) return sc; }
        }
        return null;
      },
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.kind) || (obj && obj.id) },

    // === Banking (team b7 2026-06-19) — Banking & Loans B1 (#148). The shared Loan relation
    // (lon-, campaign.loans[]; RR p.42) + the BankAccount relation (bnk-, campaign.bankAccounts[];
    // RR p.313). displayName reads only blankLoan / blankBankAccount keys per the registry⊆factory
    // invariant (a Loan has no `name` — describe it by its counterparties + balance). ──
    { kind: 'loan', label: 'Loan', pluralLabel: 'Loans', icon: '💰',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.loans) || [],
      find: (c, id) => ((c && c.loans) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.kind || 'loan') + ': ' + ((obj.balanceGp != null ? obj.balanceGp : obj.principalGp) || 0) + 'gp'
        + (obj.debtor && obj.debtor.id ? (' → ' + obj.debtor.id) : '')) : '' },

    { kind: 'bankAccount', label: 'Bank Account', pluralLabel: 'Bank Accounts', icon: '🏦',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.bankAccounts) || [],
      find: (c, id) => ((c && c.bankAccounts) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.owner && obj.owner.id ? obj.owner.id : 'account') + ' · ' + (obj.balanceGp || 0) + 'gp') : '' },

    // === Banking B4/B5 (team burst9 2026-06-20) — the letter of credit (loc-, campaign.lettersOfCredit[]):
    // the inter-market draw primitive (RR p.42). displayName reads only blankLetterOfCredit keys (the
    // registry⊆factory invariant — a LoC has no `name`; describe it by face value + status). ──
    { kind: 'letterOfCredit', label: 'Letter of Credit', pluralLabel: 'Letters of Credit', icon: '📜',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.lettersOfCredit) || [],
      find: (c, id) => ((c && c.lettersOfCredit) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? ((obj.faceValueGp || 0) + 'gp letter · ' + (obj.status || 'outstanding')) : '' },

    // === Knowledge Layer Wave A (team burst7 2026-06-19) — Lore: a first-class fact (campaign.lore[]).
    // rumors subsume in Wave B. The per-knower Knowledge relation (knw-) is accessor-only — NOT a
    // registry kind (a join record surfaced via loreKnownBy / the Knowledge tab, not browsed). ===
    { kind: 'lore', label: 'Lore', pluralLabel: 'Lore', icon: '📚',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.lore) || [],
      find: (c, id) => ((c && c.lore) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.text) || (obj && obj.topic) || (obj && obj.id) || '(lore)' }
  ];
  ENTITY_KINDS_SEED.forEach(registerEntityKind);   // seed the stores byte-identically (order preserved)

  // ── PUBLIC API ──

  function entityKinds(){ return ENTITY_KINDS_LIST.slice(); }
  function registeredEntityKinds(){ return ENTITY_KINDS_LIST.slice(); }   // §15.5 kernel-convention accessor
  function entityKind(kind){ return ENTITY_KINDS[kind] || null; }
  function chronicleableEntityKinds(){ return ENTITY_KINDS_LIST.filter(k => k.chronicleable); }

  function listEntities(campaign, kind){
    const k = ENTITY_KINDS[kind];
    return k ? k.list(campaign) : [];
  }
  function findEntity(campaign, kind, id){
    const k = ENTITY_KINDS[kind];
    return k ? k.find(campaign, id) : null;
  }
  function entityDisplayName(campaign, kind, id){
    const k = ENTITY_KINDS[kind];
    if(!k) return id;
    const obj = k.find(campaign, id);
    return obj ? k.displayName(campaign, obj) : id;
  }
  function entityLabel(kind){ const k = ENTITY_KINDS[kind]; return k ? k.label : kind; }
  function entityIcon(kind){ const k = ENTITY_KINDS[kind]; return k ? k.icon : '·'; }
  function entityPluralLabel(kind){ const k = ENTITY_KINDS[kind]; return k ? k.pluralLabel : kind; }

  // Export onto window.ACKS
  Object.assign(ACKS, {
    ENTITY_KINDS,
    ENTITY_KINDS_LIST,
    registerEntityKind,
    registeredEntityKinds,
    entityKinds,
    entityKind,
    chronicleableEntityKinds,
    listEntities,
    findEntity,
    entityDisplayName,
    entityLabel,
    entityIcon,
    entityPluralLabel
  });

})(typeof window !== 'undefined' ? window : global);
