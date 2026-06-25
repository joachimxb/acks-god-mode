/* =============================================================================
 * domain-app-inspector.js — ACKS God Mode app mixin: Entity Inspector UI
 * =============================================================================
 *
 * Entity Inspector UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
 * reorder-gather of the feature’s members, which the team-session append-zones
 * (@b8..@b14) had scattered across the component literal. Registers a members object
 * on window.__ACKS_APP_MIXINS__; domainApp() merges it into the component
 * (descriptor-preserving, so getters survive). Members use this.* / window.ACKS.* only.
 * Loaded via <script src> after domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // ─── #555 Wave Inspector-B (2026-05-31) — top-level Inspector tab state + methods ───
  // The Inspector is a schema-driven Browse/Inspect/Edit/Create tool for any entity kind.
  // Reads from the Entity Registry (#550) for kind enumeration + lookups, and from the
  // Field Schemas (#554) for sectioned form rendering. Every edit emits gm-fiat through
  // the existing commitStatEdit pathway for full audit-log integration.
  inspectorSubView: 'browse',           // 'browse' | 'inspect' | 'create'
  inspectorSelectedKind: '',
  inspectorSelectedId: '',
  inspectorBrowseSearch: '',
  inspectorEditMode: false,             // Inspect view: locked by default, ✏ unlocks edits

  // Public deep-link entry point — any UI elsewhere can call this to jump in.
  inspectorOpen(kind, id){
    this.currentView = 'inspector';
    if(id){ this.inspectorOpenInspect(kind, id); }
    else if(kind){ this.inspectorSelectedKind = kind; this.inspectorOpenBrowse(); }
    else { this.inspectorOpenBrowse(); }
  },
  inspectorOpenBrowse(){
    this.inspectorSubView = 'browse';
    this.inspectorEditMode = false;
  },
  inspectorOpenInspect(kind, id){
    this.inspectorSelectedKind = kind;
    this.inspectorSelectedId = id;
    this.inspectorSubView = 'inspect';
    this.inspectorEditMode = false;
  },
  inspectorOpenCreate(kind){
    this.inspectorSelectedKind = kind;
    // #564 — Dispatch to dedicated creation wizard if one exists for this kind.
    // Otherwise fall through to the schema-driven stub (Wave C+ will populate the
    // generic Create form when more kinds have authored schemas).
    const dispatch = this.inspectorCreateDispatch(kind);
    if(dispatch){
      try { dispatch(); }
      catch(err){ console.error('inspectorOpenCreate dispatch failed', err); this.inspectorSubView = 'create'; }
      return;
    }
    this.inspectorSubView = 'create';
  },

  // Returns the launcher function for a kind, or null if no wizard exists yet.
  // Centralizes the kind→wizard mapping so the Create sub-view stub can also
  // surface "this kind has a wizard, click below to launch" for discoverability.
  inspectorCreateDispatch(kind){
    switch(kind){
      case 'character': return () => this.openNewCharacterEditor({ kind: 'NPC' });
      case 'domain':    return () => this.addBlankDomain();  // queued: Domain Wizard (#435) replaces this when shipped
      case 'journey':   return () => this.inspectorCreateBlankJourney();  // Phase 2.5 #475 — Admin verb (free-form); set status=in-transit + Tick Day to drive
      case 'army':      return () => this.inspectorCreateBlankArmy();  // Phase 3 Military — Admin verb (free-form blank); the 🎖 Muster modal on a character/domain is the guided Action verb
      case 'lair':      return () => this.openLairWizard('author');  // #476 M1 — the manual Lair Wizard (§12.5); the schemaForm edit sits under it for admin tweaks
      case 'vessel':    return () => this.inspectorCreateBlankVessel();  // === Voyages V1 (burst4) — Phase 3 #145 Admin verb (free-form blank → schemaForm edit; pick a class) ===
      // === Delves D2 (burst4) — Admin-verb create (blank + open the schemaForm edit). The guided
      // Action verb (the Foray Wizard) is D3; for D2 these spawn a blank entity for free-form authoring. ===
      case 'dungeon':   return () => this.inspectorCreateBlankDungeon();
      case 'delve':     return () => this.inspectorCreateBlankDelve();
      // === Gladiators G1 (b5-gladiators, burst5 2026-06-14) — Admin-verb create (blank + schemaForm
      // edit). The guided Action verbs (school/games/bout wizards) are G2–G6. (Lead: union with the
      // other burst5 lanes' dispatch cases at integration — this switch is shared + unmarked.) ===
      case 'bout':             return () => this.inspectorCreateBlankBout();
      case 'gladiator-school': return () => this.inspectorCreateBlankGladiatorSchool();
      case 'game':             return () => this.inspectorCreateBlankGame();
      // === Magic Research (AD-M1) — Admin verb (blank planning project → schemaForm edit). The guided
      // in-fiction Action verb is the character-sheet ⚗ Research panel (＋ New research). ===
      case 'research-project': return () => this.inspectorCreateBlankResearchProject();
      // Construction Wave C (2026-06-18) — the Construction Wizard is the create path for a Project (the
      // guided Action verb; the schemaForm edit under Inspect→Edit is the free-form tweak). No prefill →
      // the GM picks kind / structure / site / owner / supervisor / crew from scratch.
      case 'project':   return () => this.openConstructionWizard();
      // === @b13-customclasses (team) — Custom Classes W2 (#154): the 🛠 Class Builder is the
      // Generation-mode wizard for a ClassTemplate (point-buy → live-derived stats/XP/balance).
      // The bare schemaForm edit sits under Inspect→Edit for admin tweaks. ===
      case 'custom-class': return () => this.openClassBuilder();
      // Future entries land here as wizards ship:
      //   case 'venture':   return () => this.openLaunchVentureModal();
      //   case 'rumor':     return () => this.openAddRumorPrompt();
      //   case 'hex':       return () => { this.currentView = 'world'; this.worldSubView = 'hexes'; };
      //   case 'settlement': return null;  // requires hex context — stays a stub pointing to + Found Settlement
    }
    return null;
  },

  // Phase 2.5 #475 — Admin-verb create for a Journey: spawn a blank Journey and open it
  // in the Inspector's edit form. The GM fills in participants + start/destination hex,
  // sets status to 'in-transit' (or calls Start from a future J2 sub-tab), then drives it
  // with the Day Clock (Tick Day). No in-fiction cost — this is the free-form Admin verb.
  inspectorCreateBlankJourney(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.journeys)) this.currentCampaign.journeys = [];
    const j = window.ACKS.blankJourney({ name: 'New Journey' });
    this.currentCampaign.journeys.push(j);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('journey', j.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Journey created — set participants, start + destination hexes, then status = in-transit.');
  },

  // Magic Research (AD-M1) — Admin-verb create: spawn a blank planning project + open the schemaForm
  // edit. The guided Action verb (the character-sheet ⚗ Research panel) is the in-fiction path; this
  // is the free-form Admin path (the journey/dungeon precedent). No cost — the GM fills it in.
  inspectorCreateBlankResearchProject(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.researchProjects)) this.currentCampaign.researchProjects = [];
    const p = window.ACKS.blankResearchProject({ name: 'New Research Project' });
    this.currentCampaign.researchProjects.push(p);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('research-project', p.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Research Project created — set the researcher, kind + costs, then status = in-progress (or use a character sheet’s ⚗ Research panel).');
  },

  // Phase 3 Military — Admin-verb create for an Army: spawn a blank army (via the canonical
  // ACKS.createArmy setter) and open it in the Inspector edit form for free-form authoring.
  // No commander, no units, no cost — the GM fills it in. The guided in-fiction Action verb
  // is the 🎖 Muster modal (openMusterArmy) on a character sheet or a domain's Military tab.
  inspectorCreateBlankArmy(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    const army = window.ACKS.createArmy(this.currentCampaign, { name: 'New Army' });
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('army', army.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Army created — set the leader, then station units to it. (The 🎖 Muster army button on a character or a domain’s Military tab is the guided path.)');
  },

  // Friendly description of the wizard situation for the current kind.
  // Used by the Create sub-view stub to tell GMs what's coming.
  inspectorCreateStubMessage(kind){
    if(!kind) return 'Pick a kind first.';
    switch(kind){
      // Two-verb framing per Joachim 2026-05-31 (Architecture §10.13 to land):
      // ACTION verb = in-fiction wizard with cost + actor (Recruit, Launch, Start, Found, Appoint).
      // ADMIN verb  = Inspector Create — free-form GM authoring, no cost, no actor.
      // The Inspector Create button always means the Admin verb. Stubs below name
      // both verbs so the GM knows where each lives.
      case 'hex':          return 'Admin Create: a Hex Wizard with coord uniqueness + terrain + families lands in Wave Inspector-F. For now, use 🌍 World > Hexes "+ add hex" (spawns blank — laborious to fill).';
      case 'settlement':   return 'Admin Create: a Settlement Wizard lands in Wave Inspector-F. Distinct from the Action verb "+ found settlement" (per-hex, has cost). For now, use the per-hex button to found one.';
      case 'rumor':        return 'Admin Create: a Rumor Wizard lands in Wave Inspector-C+. The Action verb (auto-emit from events + GM emit) lives in 🌍 World > Rumors when rumors-manual is on.';
      case 'project':      return 'Admin Create: GM authoring of an in-flight project (no cost, no validation) lands in Wave Inspector-C+. The Action verb is the Construction Wizard (#535) — launched per-domain by a ruler.';
      case 'venture':      return 'Admin Create: GM authoring of a venture (e.g. one that started off-screen) lands in Wave Inspector-C+. The Action verb is "🚀 Launch Venture" in 🎭 Activities — character-action with destination + investment + cost. They are different verbs.';
      case 'party':        return 'Admin Create: Party authoring lands in Wave Inspector-C+. The Action verb (form a party from a list of characters) lives in 👥 Characters > Parties tab.';
      case 'stash':        return 'Admin Create: Stash authoring lands in Wave Inspector-C (one of the biggest unblocks — Stash data layer ships but no UI yet).';
      case 'group':        return 'Admin Create: Group authoring lands in Wave Inspector-C+.';
      case 'constructible':return 'Admin Create: Constructible (completed building) authoring lands in Wave Inspector-C+. Use to author existing buildings in templates without going through Construction. The Action verb is "construction-completed" event from the Construction Wizard pipeline.';
      case 'outpost':      return 'Admin Create: Outpost authoring lands in Wave Inspector-C+. Data layer is queued (Phase 2.95 Stash §H + Phase 3 Military §13).';
      case 'notableItem':  return 'Admin Create: Notable Item authoring lands in Wave Inspector-C+. Use to plant pre-known magic items / heirlooms in templates.';
      case 'journey':      return 'Admin Create: Journey authoring lands in Wave Inspector-C+. The Action verb (compose a journey by adding hops to a party) is queued for Phase 2.5 (#475).';
    }
    return 'Admin Create: a schema-driven Create form lands in Wave Inspector-C+ when more entity kinds have authored schemas. No dedicated Admin Wizard for this kind yet.';
  },

  // Registry-driven kind picker for the Browse sub-view. Sorted by display label.
  inspectorKindOptions(){
    if(!window.ACKS || !window.ACKS.entityKinds) return [];
    return window.ACKS.entityKinds().slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  },

  // Filtered entity list for the current selected kind. Caps at 200 to keep rendering snappy.
  inspectorBrowseList(){
    if(!this.inspectorSelectedKind) return [];
    const all = this.inspectorListEntities(this.inspectorSelectedKind);
    const q = (this.inspectorBrowseSearch || '').trim().toLowerCase();
    if(!q) return all.slice(0, 200);
    return all.filter(e => {
      if(!e) return false;
      const label = this.inspectorDisplayName(this.inspectorSelectedKind, e.id) || '';
      return (e.id + ' ' + label).toLowerCase().includes(q);
    }).slice(0, 200);
  },

  // Current Inspect target — the specific entity being viewed/edited.
  inspectorCurrentEntity(){
    if(!this.inspectorSelectedKind || !this.inspectorSelectedId) return null;
    return this.inspectorFindEntity(this.inspectorSelectedKind, this.inspectorSelectedId);
  },

  // Field schema for the current kind. Returns null when no schema authored yet
  // (the Inspect view shows a warning + raw-JSON fallback in that case).
  inspectorCurrentSchema(){
    if(!this.inspectorSelectedKind || !window.ACKS || !window.ACKS.fieldSchemaFor) return null;
    return window.ACKS.fieldSchemaFor(this.inspectorSelectedKind);
  },

  // Read a field value at a (possibly dotted) path. Supports nested objects.
  inspectorFieldValue(entity, fieldName){
    if(!entity || !fieldName) return undefined;
    const parts = fieldName.split('.');
    let v = entity;
    for(const part of parts){
      if(v == null) return undefined;
      v = v[part];
    }
    return v;
  },

  // Commit a field edit via the existing gm-fiat pathway (commitStatEdit).
  // Every Inspector save lands in the Event Log with full audit context.
  inspectorSetField(entity, fieldName, newValue){
    if(!entity || !fieldName) return;
    const oldValue = this.inspectorFieldValue(entity, fieldName);
    if(oldValue === newValue) return;
    this.commitStatEdit({
      entityType: this.inspectorSelectedKind,
      entityId: entity.id,
      entity,
      fieldPath: fieldName,
      oldValue,
      newValue,
      label: 'Inspector — ' + fieldName,
      reason: 'Inspector edit on ' + this.inspectorSelectedKind + ':' + entity.id
    });
  },

  // Inspector coord edits are GM-facing COLUMN·ROW (the map-label convention), committed as a whole
  // axial {q,r} via gm-fiat. A column·row edit isn't a single-axis change — moving the column while
  // holding the displayed row recomputes axial r — so it can't use the per-axis dotted path; it
  // commits the whole coord object. Pass null for the axis you're NOT changing (read back from current).
  inspectorSetCoordColRow(entity, fieldName, col, row){
    if(!entity || !fieldName || !window.ACKS) return;
    const v = this.inspectorFieldValue(entity, fieldName) || {};
    const cur = window.ACKS.hexAxialToColRow(v.q || 0, v.r || 0);
    const c  = (col == null) ? cur.col : col;
    const rw = (row == null) ? cur.row : row;
    this.inspectorSetField(entity, fieldName, window.ACKS.hexColRowToAxial(c, rw));
  },

  // ─── Composite-field edit helpers (Wave B.6 — 2026-05-31) ───
  // Array-length-changing edits commit the WHOLE array as newValue. CRITICAL: clone
  // the array first, mutate the clone, never the live array — inspectorSetField early-
  // returns when oldValue === newValue (same reference), so an in-place mutation would
  // be silently swallowed. (Same idiom as the constructionSupervisorCharacterIds editor.)
  // Leaf edits inside an item, and coord axes, don't change length — the markup commits
  // those via a dotted/indexed path inline (same idiom as the inventory editor).

  // Append a blank item to an array field, shaped by itemSchema.fields defaults.
  inspectorAddArrayItem(entity, fieldName, field){
    const cur = this.inspectorFieldValue(entity, fieldName);
    const list = Array.isArray(cur) ? cur.slice() : [];
    const item = {};
    const subs = (field && field.itemSchema && Array.isArray(field.itemSchema.fields)) ? field.itemSchema.fields : [];
    for(const sub of subs){
      if(sub.default !== undefined){ item[sub.name] = sub.default; continue; }
      switch(sub.type){
        case 'number': case 'gp': case 'id': item[sub.name] = null; break;
        case 'boolean': item[sub.name] = false; break;
        case 'enum': item[sub.name] = (Array.isArray(sub.enumValues) && sub.enumValues.length) ? sub.enumValues[0] : ''; break;
        default: item[sub.name] = ''; break; // string + any other leaf sub-type
      }
    }
    list.push(item);
    this.inspectorSetField(entity, fieldName, list);
  },
  inspectorRemoveArrayItem(entity, fieldName, i){
    const cur = this.inspectorFieldValue(entity, fieldName);
    const list = Array.isArray(cur) ? cur.slice() : [];
    if(i < 0 || i >= list.length) return;
    list.splice(i, 1);
    this.inspectorSetField(entity, fieldName, list);
  },
  inspectorToggleEnumMulti(entity, fieldName, val, on){
    const cur = this.inspectorFieldValue(entity, fieldName);
    const list = Array.isArray(cur) ? cur.slice() : [];
    const idx = list.indexOf(val);
    if(on){ if(idx === -1) list.push(val); }
    else if(idx !== -1){ list.splice(idx, 1); }
    this.inspectorSetField(entity, fieldName, list);
  },
  inspectorAddIdArrayItem(entity, fieldName, id){
    if(!id) return;
    const cur = this.inspectorFieldValue(entity, fieldName);
    const list = Array.isArray(cur) ? cur.slice() : [];
    if(!list.includes(id)) list.push(id);
    this.inspectorSetField(entity, fieldName, list);
  },
  inspectorRemoveIdArrayItem(entity, fieldName, i){
    const cur = this.inspectorFieldValue(entity, fieldName);
    const list = Array.isArray(cur) ? cur.slice() : [];
    if(i < 0 || i >= list.length) return;
    list.splice(i, 1);
    this.inspectorSetField(entity, fieldName, list);
  },

  // Picker options for type='id' fields — lists all entities of the schema-declared idKind.
  inspectorIdPickerOptions(idKind){
    return this.inspectorListEntities(idKind);
  },

  // ─── Campaign-merging helpers (#563 — 2026-05-31) ───
  // Domains now live on currentCampaign.domains (single home, 2026-06-05); the this.domains getter
  // returns that array, so these `kind === 'domain'` shortcuts are equivalent to the generic engine
  // registry path (ACKS.listEntities/findEntity, which read campaign.domains) and are kept only as a
  // thin convenience. Folding them into the generic path is a harmless follow-up cleanup.
  inspectorListEntities(kind){
    if(!kind || !window.ACKS || !window.ACKS.listEntities) return [];
    if(kind === 'domain') return this.domains || [];
    return window.ACKS.listEntities(this.currentCampaign, kind) || [];
  },
  inspectorFindEntity(kind, id){
    if(!kind || !id) return null;
    if(kind === 'domain') return (this.domains || []).find(d => d && d.id === id) || null;
    if(!window.ACKS || !window.ACKS.findEntity) return null;
    return window.ACKS.findEntity(this.currentCampaign, kind, id);
  },
  inspectorDisplayName(kind, id){
    if(!kind || !id) return id || '';
    if(kind === 'domain'){
      const d = (this.domains || []).find(x => x && x.id === id);
      return d ? (d.name || id) : id;
    }
    if(!window.ACKS || !window.ACKS.entityDisplayName) return id;
    return window.ACKS.entityDisplayName(this.currentCampaign, kind, id);
  },

  // Read-only formatting per field type. Mirrors the editor dispatch in markup.
  inspectorFormatField(field, value){
    if(value == null || value === '') return '—';
    if(field.type === 'boolean') return value ? '✓ true' : '✗ false';
    if(field.type === 'array' && Array.isArray(value)) return '[' + value.length + ' items]';
    if(field.type === 'object' && typeof value === 'object') return '{object}';
    if(field.type === 'history' && Array.isArray(value)) return '[' + value.length + ' history entries]';
    if(field.type === 'id' && typeof value === 'string'){
      const label = this.inspectorDisplayName(field.idKind, value);
      return label + ' (' + value + ')';
    }
    if(field.type === 'enumMulti' && Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if(field.type === 'idArray' && Array.isArray(value)) return '[' + value.length + ' refs]';
    if(field.type === 'gp' && typeof value === 'number') return value.toLocaleString() + ' gp';
    if(field.type === 'coord' && value && value.q != null) return window.ACKS.hexDisplayLabel(value.q, value.r); // GM-facing column·row
    if(field.type === 'computed') return '(computed — render in later wave)';
    return String(value);
  },
  // PT-5 — the Inspector proficiency-throw sheet rows: the character's available throws + resolved
  // target + success chance, each rollable. (A class-derived throw shows "GM" — the target is set in the modal.)
  inspectorProfThrowRows(ch){
    if(!ch) return [];
    const A = window.ACKS;
    return (A.characterAvailableThrows(this.currentCampaign, ch) || []).map(r => {
      const fc = A.characterProficiencyThrow(this.currentCampaign, ch, r.taskKey, { roll:false });
      return { taskKey:r.taskKey, label:r.label, group:r.group, universal:r.universal,
               resolvedTarget:r.resolvedTarget, baseTargetSource:r.baseTargetSource,
               chance:(fc && fc.successChance != null) ? fc.successChance : null };
    });
  },
  });
})();
