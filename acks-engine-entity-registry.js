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

  // Ordered for picker presentation — primary narrative anchors first, sub-entities last.
  const ENTITY_KINDS_LIST = [
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
      displayName: (c, obj) => (global.ACKS && global.ACKS.hexName && global.ACKS.hexName(obj)) || (obj && obj.coord ? ('(' + obj.coord.q + ',' + obj.coord.r + ')') : (obj && obj.id)) || '(unknown)' },

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
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) },

    { kind: 'settlementVisit', label: 'Settlement Visit', pluralLabel: 'Settlement Visits', icon: '🛤',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.settlementVisits) || [],
      find: (c, id) => ((c && c.settlementVisits) || []).find(x => x && x.id === id),
      displayName: (c, obj) => (obj && obj.id) },

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

    // ── SUB-ENTITIES (nested inside parents, but addressable by id) ──
    { kind: 'garrison-unit', label: 'Garrison Unit', pluralLabel: 'Garrison Units', icon: '⚔',
      addressable: true, chronicleable: true,
      list: (c) => {
        const out = [];
        for(const d of ((c && c.domains) || [])){
          for(const u of ((d && d.garrison && d.garrison.units) || [])){ if(u) out.push(u); }
        }
        for(const ch of ((c && c.characters) || [])){
          for(const u of ((ch && ch.mercenaryCompany && ch.mercenaryCompany.units) || [])){ if(u) out.push(u); }
        }
        return out;
      },
      find: (c, id) => {
        for(const d of ((c && c.domains) || [])){
          for(const u of ((d && d.garrison && d.garrison.units) || [])){ if(u && u.id === id) return u; }
        }
        for(const ch of ((c && c.characters) || [])){
          for(const u of ((ch && ch.mercenaryCompany && ch.mercenaryCompany.units) || [])){ if(u && u.id === id) return u; }
        }
        return null;
      },
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
      displayName: (c, obj) => (obj && obj.name) || (obj && obj.kind) || (obj && obj.id) }
  ];

  // Build lookup table
  const ENTITY_KINDS = {};
  for(const entry of ENTITY_KINDS_LIST){ ENTITY_KINDS[entry.kind] = entry; }

  // ── PUBLIC API ──

  function entityKinds(){ return ENTITY_KINDS_LIST.slice(); }
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
