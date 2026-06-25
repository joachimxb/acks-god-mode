/* =============================================================================
 * domain-app-encounters.js — ACKS God Mode app mixin: Encounters / Lairs / bestiary UI
 * =============================================================================
 *
 * Encounters / Lairs / bestiary UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  lairWizardTerrainOptions(){ return (window.ACKS.mapTerrainTypes ? window.ACKS.mapTerrainTypes() : []); },
  lairWizardHexOptions(){
    const camp = this.currentCampaign; const hexes = (camp && camp.hexes) || [];
    return hexes.map(h => {
      const coord = h.coord ? window.ACKS.hexDisplayLabel(h.coord.q, h.coord.r) : h.id;
      const dom = h.domainId ? (camp.domains||[]).find(d => d.id === h.domainId) : null;
      const parts = [coord];
      if(h.name) parts.push(h.name);
      if(h.terrain) parts.push('· ' + h.terrain);
      parts.push(dom ? ('· ' + dom.name) : '· unclaimed');
      return { id: h.id, label: parts.join(' ') };
    });
  },
  _lairWizardHex(id){ const camp = this.currentCampaign; return ((camp && camp.hexes) || []).find(h => h.id === id) || null; },
  lairWizardSeedIsDomain(){ const h = this._lairWizardHex(this.lairWizardSeed.hexId); return !!(h && h.domainId); },
  lairWizardSeedDice(){ const h = this._lairWizardHex(this.lairWizardSeed.hexId); return h ? (window.ACKS.lairDiceForHex(h) || window.ACKS.lairDiceForTerrain(h.terrain)) : null; },
  lairWizardSeedDiceLabel(){
    const d = this.lairWizardSeedDice();
    if(d) return d.key + ' (' + d.label + ' lairs)';
    const h = this._lairWizardHex(this.lairWizardSeed.hexId);
    return (h && h.terrain ? h.terrain : '(no terrain set)') + ' — no RAW lair density';
  },
  lairWizardRollSeed(){
    const dice = this.lairWizardSeedDice();
    this.lairWizardSeed.count = dice ? window.ACKS.rollLairCount(dice.spec) : 0;
  },
  // E9 — the picked hex's JJ p.69 cap, shown as seeding guidance (the GM may exceed it — authoring is sovereign).
  lairWizardSeedCapText(){
    return this.lairWizardSeed.hexId ? this.hexLairCapText(this.lairWizardSeed.hexId) : '';
  },
  // M2 — Generate-from-catalog (Plan §12.5): the Monster field is a catalog datalist OR free text.
  // When the typed/picked key resolves in the MONSTER_CATALOG, the wizard shows its mechanical stats
  // and (for a placed lair) offers to roll the population into a bound Group via generateLair.
  lairWizardCatalogOptions(){ return (window.ACKS.MONSTER_CATALOG || []).map(m => ({ key: m.key, name: m.name })); },
  lairWizardCatalogEntry(){ return window.ACKS.findMonster ? window.ACKS.findMonster((this.lairWizardForm.monsterCatalogKey || '').trim()) : null; },
  lairWizardCatalogLabel(){
    const e = this.lairWizardCatalogEntry(); if(!e) return '';
    const na = e.numberAppearing || {};
    return e.name + ' — HD ' + e.hd + ', Lair ' + e.lairPct + '%, Treasure ' + (e.treasureType || 'none')
      + ', appears ' + (na.lair || na.wandering || '?') + ' (lair) · ' + e.alignment + ' · MM p.' + (e.page || '?');
  },
  lairWizardApplyCatalog(){
    const e = this.lairWizardCatalogEntry(); if(!e) return;
    const f = this.lairWizardForm;
    f.monsterCatalogKey = e.key;                                   // normalise free text / alias to the canonical key
    if(!f.treasureType) f.treasureType = e.treasureType || '';
    const naDice = (e.numberAppearing && (e.numberAppearing.lair || e.numberAppearing.wandering)) || '1';
    f.inhabitants = window.ACKS._rollDiceStr ? Math.max(1, window.ACKS._rollDiceStr(naDice)) : f.inhabitants;
  },
  lairWizardCanSubmit(){
    if(this.lairWizardMode === 'seed'){
      return !!this.lairWizardSeed.hexId && !this.lairWizardSeedIsDomain() && !!this.lairWizardSeedDice() && (this.lairWizardSeed.count|0) > 0;
    }
    const f = this.lairWizardForm;
    if(!f.name && !f.monsterCatalogKey) return false;       // need at least a name or a monster
    if(f.destination === 'hex' && !f.hexId) return false;   // a placed lair needs a hex
    return true;
  },
  lairWizardSubmit(){
    if(!this.currentCampaign || !this.lairWizardCanSubmit()) return;
    const A = window.ACKS;
    if(this.lairWizardMode === 'seed'){
      const seeded = A.seedHexLairs(this.currentCampaign, this.lairWizardSeed.hexId, { count: this.lairWizardSeed.count|0 });
      this.markDirty(); this.schedulePersist();
      this.lairWizardOpen = false;
      if(this.showToast) this.showToast('Seeded ' + seeded.length + ' lair' + (seeded.length===1?'':'s') + ' — undetailed shells; flesh them out via the Inspector or Author mode.');
      return;
    }
    const f = this.lairWizardForm;
    const opts = {
      name: (f.name||'').trim(),
      monsterCatalogKey: (f.monsterCatalogKey||'').trim(),
      lairType: f.lairType,
      terrain: f.terrain,
      hasFortifications: !!f.hasFortifications,
      knownToPlayers: !!f.knownToPlayers,
      treasureType: (f.treasureType||'').trim().toUpperCase(),
      precisePlacement: (f.precisePlacement||'').trim(),
      notes: (f.notes||'').trim(),
      totalInhabitantCount: Math.max(0, f.inhabitants|0)   // manual estimate until M2 individuates groups
    };
    if(f.destination === 'dynamic'){ opts.status = 'dynamic'; opts.hexId = null; opts.establishedBy = 'dynamic-reveal'; }
    else { opts.status = 'active'; opts.hexId = f.hexId; opts.establishedBy = 'gm-fiat'; }
    // M2 Generate-from-catalog: a PLACED lair whose monster resolves in the catalog (and generate is
    // on) rolls its population into a bound Group via generateLair; the authored characteristics are
    // applied on top. A dynamic lair stays a shell (population comes on reveal+generate); a free-text
    // monster (not in the catalog) falls through to the manual createLair below.
    const entry = this.lairWizardCatalogEntry();
    if(f.destination === 'hex' && entry && f.generate !== false){
      const res = A.generateLair(this.currentCampaign, {
        monsterCatalogKey: entry.key, hexId: f.hexId, name: opts.name, knownToPlayers: opts.knownToPlayers,
        establishedBy: 'gm-fiat', reason: 'lair-wizard', count: ((f.inhabitants|0) > 0 ? (f.inhabitants|0) : undefined)
      });
      if(res && res.lair){
        Object.assign(res.lair, {
          lairType: f.lairType, terrain: f.terrain, hasFortifications: opts.hasFortifications,
          treasureType: opts.treasureType || res.lair.treasureType, precisePlacement: opts.precisePlacement, notes: opts.notes
        });
      }
      this.markDirty(); this.schedulePersist();
      this.lairWizardOpen = false;
      if(this.showToast) this.showToast('Lair generated: ' + entry.name + ' — ' + (res && res.count) + ' inhabitants (a Group was created). Open it to refine.');
      if(res && res.lair) this.inspectorOpenInspect('lair', res.lair.id);
      return;
    }
    const lair = A.createLair(this.currentCampaign, opts);
    this.markDirty(); this.schedulePersist();
    this.lairWizardOpen = false;
    if(this.showToast) this.showToast((f.destination==='dynamic' ? 'Dynamic lair authored (held unplaced).' : 'Lair created.') + ' Open it to add population + treasure.');
    if(lair) this.inspectorOpenInspect('lair', lair.id);
  },
  lairsAtHexId(hexId){ return window.ACKS.lairsAtHex(this.currentCampaign, hexId) || []; },
  lairMonsterLabel(l){
    if(!l) return '—';
    const n = (typeof window.ACKS.monsterDisplayName === 'function') ? window.ACKS.monsterDisplayName(l.monsterCatalogKey) : null;
    return n || l.monsterCatalogKey || '—';
  },
  lairHexLabel(l){
    if(!l || !l.hexId) return (l && l.status === 'dynamic') ? '(unplaced pool)' : '(no hex)';
    const h = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(x => x && x.id === l.hexId);
    return h ? hexLabelFor(h) : l.hexId;
  },
  lairStatusIcon(l){
    return { active:'🏚', unknown:'❓', dynamic:'🃏', cleared:'⚔', abandoned:'🍂', destroyed:'💥' }[l && l.status] || '🏚';
  },
  lairStatusLabel(l){
    if(!l) return '';
    if(l.status === 'unknown') return 'unauthored';
    if(l.status === 'dynamic') return 'dynamic (pool)';
    return l.status;
  },
  lairInhabitants(l){ return window.ACKS.lairInhabitantCount(this.currentCampaign, l); },
  // #476 E4h — the loose-band rows under World ▸ 🐉 Monsters (Joachim 2026-06-11): every monster
  // band NOT settled in a living lair. Migrants = living Groups whose home lair is gone
  // (abandoned/cleared/destroyed — abandonLair departs them alive) or who never had one;
  // pursuers = E3c chases in flight (the state lives ON the Encounter, D8 — incl. the undecided
  // 'offered'). Derived per render, never stored. Fragments never appear (no Group is minted);
  // a pursuing band's own Group (if any) folds into its chase row, not a second migrant row.
  monsterLooseBandRows(){
    // E4m — the eligibility CORE moved into the engine (ACKS.looseMonsterBands): the SAME
    // derivation now answers the wandering draw (a band the table rolls is met where this
    // table says it stands) and fills this view; only the display formatting lives here.
    const c = this.currentCampaign; if(!c) return [];
    const A = window.ACKS;
    if(typeof A.looseMonsterBands !== 'function') return [];
    return A.looseMonsterBands(c).map(b => {
      const hex = b.hexId ? ((c.hexes || []).find(h => h && h.id === b.hexId) || null) : null;
      const where = hex ? ((typeof A.hexName === 'function' && hexLabelFor(hex)) || hex.id) : null;
      const monster = (b.monsterKey && typeof A.monsterDisplayName === 'function' && A.monsterDisplayName(b.monsterKey)) || b.monsterKey || null;
      if(b.kind === 'pursuer'){
        const enc = (typeof A.findEncounter === 'function') ? A.findEncounter(c, b.encounterId) : null;
        return {
          key: 'pursuit-' + b.encounterId, icon: '🐺',
          band: b.label || monster || '—',
          monster: monster || b.label || '—',
          count: b.count,
          hexId: hex ? hex.id : null,
          where: where || 'on the trail',
          statusLabel: (b.pursuitStatus === 'pursuing') ? 'pursuing' : 'pursuit offered',
          statusText: (b.pursuitStatus === 'pursuing')
            ? ('🐺 pursuing ' + ((enc && this.encPartyLabel) ? this.encPartyLabel(enc) : 'a party') + ' — ' + (Math.round((b.gapMiles || 0) * 10) / 10) + ' mi behind')
            : 'pursuit offered — decide in the encounter',
          encounterId: b.encounterId, groupId: null
        };
      }
      if(b.kind === 'tracked'){
        // E5 — a band someone is FOLLOWING: a definite entity at its trail-head hex.
        const tb = b.trackedBy || {};
        const trackerName = tb.name || ((c.characters || []).find(x => x && x.id === tb.characterId) || {}).name || 'a tracker';
        return {
          key: 'tracked-' + b.encounterId, icon: '🐾',
          band: b.label || monster || '—',
          monster: monster || b.label || '—',
          count: b.count,
          hexId: hex ? hex.id : null,
          where: where || (b.quarryCoord ? ('coord ' + b.quarryCoord.q + ',' + b.quarryCoord.r + ' (unmapped)') : 'on the move'),
          statusLabel: b.halted ? 'tracked · gone to ground' : 'tracked',
          statusText: '🐾 tracked by ' + trackerName + (b.halted ? ' — it has gone to ground' : ' — on the move'),
          encounterId: b.encounterId, groupId: null
        };
      }
      if(b.kind === 'banditry'){
        // E10 — a domain's own morale-banditry (RR pp.350–351): raids within its domain
        // on the Day Clock; the monthly turn reconciles it; it disbands when morale recovers.
        const gb = ((c.groups || []).find(x => x && x.id === b.groupId)) || {};
        const dn = b.banditryDomainName || 'its domain';
        const ruleOn = (typeof A.isHouseRuleEnabled === 'function') && A.isHouseRuleEnabled(c, 'persistent-wandering-monsters');
        const moving = ruleOn && !b.halted && (!!hex || !!(gb.wanderState && gb.wanderState.coord));
        return {
          key: 'banditry-' + b.groupId, icon: '🏴',
          band: gb.name || b.label || 'Bandits',
          monster: monster || b.label || 'Bandit',
          count: b.count,
          hexId: hex ? hex.id : null,
          where: where || ('in ' + dn),
          statusLabel: 'banditry',
          statusText: '🏴 ' + dn + '’s own men turned bandit (domain morale, RR pp.350–351) — '
            + (moving ? 'raiding within the domain with the Day Clock' : 'raiding within the domain')
            + '; they disband when morale recovers to −1',
          encounterId: null, groupId: b.groupId
        };
      }
      if(b.kind === 'homing'){
        // E6 — a post-chase band walking home to its den (the monster-bands consumer
        // moves it; it dissolves into the den on arrival).
        const den = (typeof A.findLair === 'function') ? A.findLair(c, b.destLairId) : null;
        const gh = ((c.groups || []).find(x => x && x.id === b.groupId)) || {};
        return {
          key: 'homing-' + b.groupId, icon: '🏠',
          band: gh.name || b.label || monster || '—',
          monster: monster || b.label || '—',
          count: b.count,
          hexId: hex ? hex.id : null,
          where: where || 'on the road home',
          statusLabel: 'heading home',
          statusText: '🏠 heading home to ' + ((den && den.name) || 'its den') + ' — it will not stop on the way',
          encounterId: null, groupId: b.groupId
        };
      }
      const home = b.deadHomeLairId ? ((typeof A.findLair === 'function') ? A.findLair(c, b.deadHomeLairId) : null) : null;
      const g = ((c.groups || []).find(x => x && x.id === b.groupId)) || {};
      const tpl = g.groupTemplate || {};
      // E6 — a placed migrant WANDERS on the Day Clock (half speed, never doubling back)
      // unless the GM parked it (wanderState.halted) or the persistence rule is off. A band
      // strayed onto an unauthored coord keeps walking (the walk coord carries it off-map).
      const ruleOn = (typeof A.isHouseRuleEnabled === 'function') && A.isHouseRuleEnabled(c, 'persistent-wandering-monsters');
      const moving = ruleOn && !b.halted && (hex || !!(g.wanderState && g.wanderState.coord));
      // Phase 3 Military W2 — a band that arrived as a DOMAIN ENCOUNTER wears its verdict:
      // whose domain, what attitude, lingering (holds) vs migrating (wanders on via E6).
      if(b.incursion){
        const incDom = ((c.domains || []).find(x => x && x.id === b.incursion.domainId)) || null;
        return {
          key: 'group-' + b.groupId, icon: '⚔',
          band: g.name || '(unnamed band)',
          monster: monster || (tpl.creatureTypes || []).join(', ') || '—',
          count: b.count,
          hexId: hex ? hex.id : null,
          where: where || (g.wanderState && g.wanderState.coord && typeof g.wanderState.coord.q === 'number'
            ? ('near ' + g.wanderState.coord.q + ',' + g.wanderState.coord.r + ' — off the mapped hexes')
            : 'wandering — no fixed hex'),
          statusLabel: 'incursion · ' + (b.incursion.attitude || ''),
          statusText: '⚔ domain encounter at ' + ((incDom && incDom.name) || 'a domain') + ' (Vagaries of Incursion, JJ p.101) — '
            + (b.incursion.attitude || 'unknown') + ', ' + (b.incursion.disposition || '')
            + (b.incursion.rulerAware === false ? '; the ruler is UNAWARE' : '')
            + (moving ? ' · 🚶 wandering with the Day Clock' : (b.halted || b.incursion.disposition === 'lingering' ? ' · holding in the domain' : '')),
          encounterId: null, groupId: b.groupId
        };
      }
      return {
        key: 'group-' + b.groupId, icon: '🚶',
        band: g.name || '(unnamed band)',
        monster: monster || (tpl.creatureTypes || []).join(', ') || '—',
        count: b.count,
        hexId: hex ? hex.id : null,
        where: where || 'wandering — no fixed hex',
        statusLabel: b.halted ? 'migrant · halted' : 'migrant',
        statusText: (home ? ('migrant — out of ' + (home.name || 'a lost lair') + ' (' + home.status + ')') : 'migrant')
          + (moving ? ' · 🚶 wandering with the Day Clock' : (b.halted ? ' · halted by the GM' : '')),
        encounterId: null, groupId: b.groupId
      };
    });
  },

  lairDetailLair(){ return this.lairDetailId ? (window.ACKS.findLair(this.currentCampaign, this.lairDetailId) || null) : null; },
  lairDetailGroups(){
    const l = this.lairDetailLair(); if(!l) return [];
    const groups = (this.currentCampaign && this.currentCampaign.groups) || [];
    return (l.groupIds || []).map(gid => groups.find(g => g && g.id === gid)).filter(Boolean)
      .map(g => ({ g: g, active: window.ACKS.groupActiveCount(g) }));
  },
  lairDetailLeaders(){
    const l = this.lairDetailLair(); if(!l) return [];
    const chars = (this.currentCampaign && this.currentCampaign.characters) || [];
    return (l.leaderCharacterIds || []).map(cid => chars.find(c => c && c.id === cid)).filter(Boolean);
  },
  // A lair that can take a catalog population: an unauthored shell, a dynamic drop-in, or an
  // authored lair with no bound Groups yet (the Wizard's free-text path).
  lairDetailCanPopulate(){
    const l = this.lairDetailLair(); if(!l) return false;
    if(l.status === 'cleared' || l.status === 'destroyed') return false;
    return (l.status === 'unknown' || l.status === 'dynamic' || (l.groupIds || []).length === 0);
  },
  lairDetailPopulateEntry(){ return window.ACKS.findMonster ? window.ACKS.findMonster((this.lairDetailPopulateKey || '').trim()) : null; },
  lairPopulate(){
    const l = this.lairDetailLair(); const e = this.lairDetailPopulateEntry();
    if(!l || !e) return;
    const res = window.ACKS.generateLair(this.currentCampaign, { lairId: l.id, monsterCatalogKey: e.key, reason: 'lair-detail-populate' });
    this.markDirty(); this.schedulePersist();
    this.lairDetailPopulateKey = '';
    if(this.showToast) this.showToast(res && res.group
      ? ('Populated: ' + e.name + ' ×' + res.count + (l.treasureType ? ' · treasure ' + l.treasureType : '') + '.')
      : 'No catalog entry — authored as a shell.');
  },
  lairReveal(){
    const l = this.lairDetailLair(); const hexId = this.lairDetailRevealHexId;
    if(!l || l.status !== 'dynamic' || !hexId) return;
    window.ACKS.revealDynamicLair(this.currentCampaign, l.id, hexId, { reason: 'gm-reveal' });
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('Lair revealed into ' + this.lairHexLabel(l) + ' — now active.');
  },
  lairMarkDiscovered(){
    const l = this.lairDetailLair(); if(!l) return;
    window.ACKS.discoverLair(this.currentCampaign, l.id, { method: 'gm-reveal' });
    if(window.ACKS.recordLairDiscovered) window.ACKS.recordLairDiscovered(this.currentCampaign, l.id, { method: 'gm-reveal' });   // the chronicle-visible record (M4)
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('Marked discovered — the players now know of ' + (l.name || 'this lair') + '.');
  },
  // ⚔ E4j — the lair-assault entry (Joachim 2026-06-11: a known lair should be attackable;
  // resolution stays the GM's). The ready-check mirrors the engine gates so the button
  // explains itself (the disable-with-reason idiom).
  lairAttackReady(){
    const l = this.lairDetailLair(); if(!l) return { ok: false, reason: '' };
    if(!l.knownToPlayers) return { ok: false, reason: 'the players have not found this lair — let a search or a tracker find it, or 👁 Mark discovered' };
    if(!l.hexId) return { ok: false, reason: 'the lair is not placed in a hex' };
    const open = (this.currentCampaign?.encounters || []).find(e => e && e.status === 'active' && e.trigger === 'lair-assault' && e.monsterSide && e.monsterSide.lairId === l.id);
    if(open) return { ok: false, reason: 'an assault on this den is already under way — resolve it (Review ▸ ⚔ Encounters)' };
    const here = (this.currentCampaign?.characters || []).filter(ch => ch && ch.currentHexId === l.hexId);
    if(!here.length) return { ok: false, reason: 'no character stands at this hex — travel there first' };
    return { ok: true, reason: '' };
  },
  lairAttack(){
    const l = this.lairDetailLair(); if(!l) return;
    const r = window.ACKS.beginLairAssault(this.currentCampaign, l.id);
    if(!r || !r.ok){ this.showToast('Could not begin the assault: ' + ((r && r.error) || 'unknown error'), 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.closeLairDetail();                  // the resolution panel sits below this peek — close-then-open
    this.openEncounterModal(r.encounter.id);
    this.showToast('⚔ The party moves on ' + (l.name || 'the den') + ' — walk the encounter, or go straight to combat.', 5000);
  },
  lairMarkCleared(){
    const l = this.lairDetailLair(); if(!l) return;
    if(!confirm('Mark "' + (l.name || 'this lair') + '" cleared? Its inhabitants are slain/driven off (bound groups take full casualties); the structure remains.')) return;
    window.ACKS.clearLair(this.currentCampaign, l.id, { reason: 'gm-resolve' });
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('Lair cleared — structure remains (it can be reoccupied later).');
  },
  lairMarkAbandoned(){
    const l = this.lairDetailLair(); if(!l) return;
    if(!confirm('Mark "' + (l.name || 'this lair') + '" abandoned? Its inhabitants leave alive (their groups go off-map); the structure remains.')) return;
    window.ACKS.abandonLair(this.currentCampaign, l.id, { reason: 'gm-resolve' });
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('Lair abandoned — empty but intact.');
  },
  lairMarkDestroyed(){
    const l = this.lairDetailLair(); if(!l) return;
    if(!confirm('Destroy "' + (l.name || 'this lair') + '"? The structure itself is razed; a still-active population perishes with it.')) return;
    window.ACKS.destroyLair(this.currentCampaign, l.id, { reason: 'gm-resolve' });
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('Lair destroyed.');
  },
  encModalEnc(){ return this.encounterModalId ? window.ACKS.findEncounter(this.currentCampaign, this.encounterModalId) : null; },
  encModalPrior(){ const e = this.encModalEnc(); return e ? window.ACKS.priorReactionBetween(this.currentCampaign, e) : null; },
  encPriorText(){
    const p = this.encModalPrior(); if(!p) return '';
    return p.outcome + (p.reaction ? ' · last attitude ' + p.reaction : '')
      + ' · turn ' + (p.atTurn == null ? '?' : p.atTurn) + (p.onDayInMonth ? ', day ' + p.onDayInMonth : '');
  },
  encounterLabel(enc){ return window.ACKS.encounterDisplayName(this.currentCampaign, enc); },
  encounterById(id){ return id ? window.ACKS.findEncounter(this.currentCampaign, id) : null; },
  // A fragment's home den stays unlocated until discovered — the 🐾/👁 fragment buttons key on
  // this and flip to the full → lair once knownToPlayers (trackHomeAttempt refuses 'already-known').
  lairKnown(lairId){
    if(!lairId || !this.currentCampaign) return false;
    const l = window.ACKS.findLair(this.currentCampaign, lairId);
    return !!(l && l.knownToPlayers);
  },
  encHexLabel(enc){
    const h = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(x => x && x.id === enc.hexId);
    return h ? (window.ACKS.hexName ? hexLabelFor(h) : enc.hexId) : (enc.hexId || '');
  },
  encCharName(cid){ const c = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === cid); return (c && c.name) || cid; },
  encChaModText(cid){
    const c = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === cid);
    const s = c && c.abilities && c.abilities.CHA;
    const m = (typeof s === 'number' && window.ACKS.abilityMod) ? window.ACKS.abilityMod(s) : 0;
    return (m >= 0 ? '+' : '') + m;
  },
  encPartyLabel(enc){
    const ps = (enc && enc.partySide) || {};
    if(ps.partyId){
      const p = ((this.currentCampaign && this.currentCampaign.parties) || []).find(x => x && x.id === ps.partyId);
      if(p && p.name) return p.name + ' — ' + ((ps.characterIds || []).map(id => this.encCharName(id)).join(', ') || '(no members listed)');
    }
    const names = (ps.characterIds || []).map(id => this.encCharName(id));
    return names.length ? names.join(', ') : '(no characters bound — set the face via the Inspector)';
  },
  // E8 — the RR p.285 evasion-aftermath Navigation throw (at −4), worded with its full
  // arithmetic (the E2h convention). Old saves' aftermaths carry no navThrow → the static
  // pending-GM line renders instead.
  encAftermathNavText(a){
    const n = a && a.navThrow; if(!n) return '';
    const mods = (n.modifiers || []).map(m => (m.value >= 0 ? '+' : '') + m.value + ' (' + (m.source === 'party-proficiency' ? 'party' : (m.source === 'evasion-displaced' ? 'displaced' : m.source)) + ')').join(' ');
    const math = '🧭 Navigation 1d20 ' + n.natural + (mods ? (' ' + mods) : '') + ' = ' + n.total + ' vs ' + n.target + '+';
    if(a.knownLost) return math + ' → ✗ LOST — and knows it (RR p.285)' + (a.journeyId ? ' — the journey holds' : '');
    return math + ' → ✓ bearings kept (RR p.285)';
  },
  encMonsterText(enc){
    const ms = (enc && enc.monsterSide) || {};
    const mName = (ms.monsterCatalogKey && window.ACKS.monsterDisplayName && window.ACKS.monsterDisplayName(ms.monsterCatalogKey)) || ms.monsterCatalogKey
      || ms.label || '';   // E4: a null-key table identity (Dragon, Genie…) displays its printed label
    const what = mName || (enc.category === 'civilized' ? 'civilized folk (GM identifies)' : enc.category === 'monster' ? 'monsters (GM identifies)' : '(unidentified)');
    return (ms.count ? ms.count + ' × ' : '') + what;
  },
  // ── SD-5b — a civilized encounter GROUNDED to the actual townsperson who lives nearby (the
  // realized census): name them, link their sheet. Derived live (the stored id resolves to the
  // current character); null when not a grounded civilized meeting. ──
  encResidentLink(){
    const enc = this.encModalEnc(); if(!enc || !enc.monsterSide) return null;
    const cid = enc.monsterSide.residentCharacterId; if(!cid) return null;
    const c = (this.currentCampaign?.characters || []).find(x => x && x.id === cid);
    if(!c) return null;
    const sid = enc.monsterSide.residentSettlementId;
    const s = (sid && window.ACKS.findSettlement) ? window.ACKS.findSettlement(this.currentCampaign, sid) : null;
    const lvl = Number(c.level) || 1;
    const text = '🏛 This is ' + (c.name || 'a local')
      + (c.class ? ', ' + c.class + ' L' + lvl : ' (L' + lvl + ')')
      + (s && s.name ? ' — lives in ' + s.name : '')
      + ' (drawn from the settlement census)';
    return { text: text, character: c, characterId: cid };
  },
  // ── E4 — the table identity line + the 6a binding verdict + ⟳/pick affordances ──
  // E4n — the table this side rolls/picks on: the stored identity, or (identity-less —
  // a pre-E4n search fill, a gm-authored meeting, a legacy save) the hex's own table
  // derived by the engine (the same derivation the verbs use).
  encIdentityTableInfo(){
    const e = this.encModalEnc(); if(!e || !e.monsterSide) return null;
    if(e.monsterSide.identity) return e.monsterSide.identity;
    return window.ACKS.encounterDerivedTablePrior(this.currentCampaign, e) || null;
  },
  _encTableName(id){
    const A = window.ACKS;
    return id.tableKey ? ((A.ENCOUNTER_MONSTER_TABLES[id.tableKey] || {}).name || id.tableKey)
         : (id.columnKey ? 'Civilized — ' + ((((A.ENCOUNTER_CIVILIZED_TABLE || {}).columns || {})[id.columnKey] || {}).name || id.columnKey) : 'table');
  },
  encIdentityText(){
    const e = this.encModalEnc(); const id = e && e.monsterSide && e.monsterSide.identity;
    if(!id){
      // E4n — unrolled but rollable: name the table that applies so the ⟳/pick teach.
      const info = this.encIdentityTableInfo();
      if(!info) return '';
      return 'unrolled — ' + this._encTableName(info) + (info.rarity ? ' · ' + info.rarity : '') + (info.page ? ' (JJ p.' + info.page + ')' : '') + ' applies here';
    }
    if(id.gmChosen) return 'GM pick from ' + this._encTableName(id) + (id.rarity ? ' · ' + id.rarity : '') + (id.page ? ' (JJ p.' + id.page + ')' : '');
    return 'rolled ' + id.natural + ' on ' + this._encTableName(id) + (id.rarity ? ' · ' + id.rarity : '') + (id.page ? ' (JJ p.' + id.page + ')' : '');
  },
  encBindingText(){
    const e = this.encModalEnc(); const ms = e && e.monsterSide; const b = ms && ms.binding;
    if(!b) return '';
    const pct = (b.lairPct != null) ? b.lairPct + '%' : '?';
    const roll = (b.lairRoll != null) ? ('Lair: d100 ' + b.lairRoll + (b.inLair ? ' ≤ ' : ' > ') + pct) : (b.lairPct === 0 ? 'never lairs' : '');
    const minted = ms.minted && ms.minted.mode;
    let verdict;
    if(b.mode === 'existing-lair' || (b.inLair && ms.lairId && !minted)) verdict = 'in their lair — the known den here';
    else if(b.mode === 'fragment') verdict = 'abroad — a fragment of the den in this hex (no hoard with them)';
    else if(minted === 'populate-shell') verdict = 'in their lair — detailed one of this hex’s seeded lairs';
    else if(minted === 'reveal-dynamic') verdict = 'in their lair — revealed the pooled lair here';
    else if(minted === 'fresh-lair') verdict = 'in their lair — a new den in this hex';
    else if(b.inLair) verdict = (e.category === 'civilized') ? 'at their dwelling (no den entity)' : 'in their lair (unauthored hex — no den minted)';
    else if(b.mode === 'loose-band' && ms.source === 'pursuing-band') verdict = 'abroad — a known band, met mid-hunt (the band line below)';
    else if(b.mode === 'loose-band' && ms.source === 'migrant-band') verdict = 'abroad — a known roaming band (the band line below)';
    else if(b.mode === 'loose-band' && ms.source === 'banditry-band') verdict = 'abroad — the domain’s own bandits (the band line below)';
    else verdict = 'a wandering band';
    return roll ? (roll + ' → ' + verdict) : verdict;
  },
  // ── E4m — the band met is a KNOWN band (a pursuing band / a migrant Group): name it +
  // deep-link it. Derived live — a chase that has since ended reads as history.
  encBandLink(){
    const enc = this.encModalEnc(); if(!enc) return null;
    const ms = enc.monsterSide || {};
    if(ms.pursuitEncounterId){
      const chase = window.ACKS.findEncounter(this.currentCampaign, ms.pursuitEncounterId);
      const live = !!(chase && chase.status === 'active' && chase.pursuit && (chase.pursuit.status === 'offered' || chase.pursuit.status === 'pursuing'));
      const ps = (chase && chase.partySide) || {};
      const party = ps.partyId ? ((this.currentCampaign.parties || []).find(p => p && p.id === ps.partyId)) : null;
      const ch = ((ps.characterIds || []).length) ? ((this.currentCampaign.characters || []).find(c => c && c.id === ps.characterIds[0])) : null;
      const quarry = (party && party.name) || (ch && ch.name) || 'another party';
      const gap = (chase && chase.pursuit && chase.pursuit.gapMiles != null) ? (Math.round(chase.pursuit.gapMiles * 10) / 10) : null;
      return { encounterId: ms.pursuitEncounterId, groupId: null, live,
               text: live ? ('🐺 this is the band hunting ' + quarry + (gap != null ? ' — ' + gap + ' mi behind its quarry' : '') + '; scattering it (💨 dispersed) ends that chase')
                          : ('🐺 the band that hunted ' + quarry + ' (chase since ended)') };
    }
    if(!ms.lairId && (ms.groupIds || []).length){
      const g = ((this.currentCampaign && this.currentCampaign.groups) || []).find(x => x && x.id === ms.groupIds[0]);
      // E10 — a morale-banditry band: name whose men these are (RR pp.350–351).
      if(g && (g.banditryDomainId || ms.source === 'banditry-band')){
        const dom = ((this.currentCampaign && this.currentCampaign.domains) || []).find(d => d && d.id === (g.banditryDomainId || ms.banditryDomainId));
        return { encounterId: null, groupId: g.id, live: false,
                 text: '🏴 these are ' + ((dom && dom.name) || 'a domain') + '’s own men turned bandit (domain morale, RR pp.350–351) — the band raids within the domain until morale recovers (🐉 Monsters tab)' };
      }
      // Phase 3 Military W2 — a Vagaries of Incursion arrival: name whose domain it
      // descended on + its verdict (the JJ p.104 attitude row in the tone checklist
      // carries the ±mod into this meeting's reaction roll).
      if(g && g.incursion){
        const dom = ((this.currentCampaign && this.currentCampaign.domains) || []).find(d => d && d.id === g.incursion.domainId);
        return { encounterId: null, groupId: g.id, live: false,
                 text: '⚔ this band arrived as a domain encounter at ' + ((dom && dom.name) || 'a domain')
                   + ' (Vagaries of Incursion) — ' + (g.incursion.attitude || 'unknown') + ' toward the domain, '
                   + (g.incursion.disposition || '') + ' (🐉 Monsters tab)' };
      }
      if(g) return { encounterId: null, groupId: g.id, live: false,
                     text: '🚶 this is the roaming band “' + (g.name || 'unnamed') + '” — it persists in the world (🐉 Monsters tab)' };
    }
    return null;
  },
  // E4m — meetings where a third party ran into THIS chase's hunting band (derived:
  // their monsterSide.pursuitEncounterId points here). Shown in the pursuit panel.
  encPursuitMetBy(){
    const enc = this.encModalEnc(); if(!enc || !enc.pursuit) return [];
    return ((this.currentCampaign && this.currentCampaign.encounters) || [])
      .filter(e => e && e.monsterSide && e.monsterSide.pursuitEncounterId === enc.id)
      .map(e => ({ id: e.id, label: this.encPartyLabel(e), status: e.status, outcome: e.outcome }));
  },
  encIdentityRerollable(){
    const e = this.encModalEnc();
    // E4n — an identity-less side with a derivable hex table can roll/pick too.
    return !!(e && e.status === 'active' && e.monsterSide && this.encIdentityTableInfo() && !this.encSurpriseRolled() && !e.evasion && !e.reaction);
  },
  encModalRerollIdentity(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterRerollIdentity(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){
      this.showToast({ 'walk-past-identity': 'The walk is past identity — surprise has been rolled.',
                       'no-table-identity': 'No table identity to reroll — name the side via the Inspector.' }[r && r.error] || 'Could not reroll.');
      return;
    }
    this.markDirty(); this.persistSession();
    this.showToast('⟳ ' + (r.identity.label || r.identity.key) + ' (1d100 ' + r.identity.natural + ')');
  },
  encIdentityPickEntries(){
    const e = this.encModalEnc(); const id = this.encIdentityTableInfo();   // stored, or hex-derived (E4n)
    const A = window.ACKS;
    if(!e || !id) return [];
    if(id.columnKey){
      const col = (A.ENCOUNTER_CIVILIZED_TABLE.columns || {})[id.columnKey];
      return col ? col.rows : [];
    }
    const t = A.ENCOUNTER_MONSTER_TABLES[id.tableKey];
    const col = t && t.columns[this.encModal.identityPickRarity || 'common'];
    return col || [];
  },
  encModalApplyIdentityPick(){
    const enc = this.encModalEnc(); if(!enc || this.encModal.identityPickValue === '') return;
    const entry = this.encIdentityPickEntries()[Number(this.encModal.identityPickValue)];
    if(!entry) return;
    const r = window.ACKS.encounterChooseIdentity(this.currentCampaign, enc.id, {
      label: entry.label, key: entry.key, rarity: (enc.category === 'monster') ? this.encModal.identityPickRarity : undefined });
    if(!r || !r.ok){ this.showToast('Could not apply the pick.'); return; }
    this.encModal.identityPick = false; this.encModal.identityPickValue = '';
    this.markDirty(); this.persistSession();
    this.showToast('✓ ' + (entry.label || entry.key));
  },
  encAttitudeClass(band){
    return { hostile: 'border-red-600 bg-red-100 text-red-800', unfriendly: 'border-amber-500 bg-amber-100 text-amber-800',
             neutral: 'border-ink/40 bg-black/5', indifferent: 'border-sky-600 bg-sky-100 text-sky-900',
             friendly: 'border-green-600 bg-green-100 text-green-900' }[band] || 'border-ink/40';
  },
  // Roll + reroll the distance via the engine verb (E2h — locked once the walk is past it).
  encModalRollDistance(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterRollDistance(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){
      const msg = { 'no-distance-class': 'No distance class resolves here — set distance via the Inspector.',
                    'walk-past-distance': 'The walk is past distance — surprise has already been rolled.' }[r && r.error]
        || ('Could not roll: ' + ((r && r.error) || '?'));
      this.showToast(msg, 4000); return;
    }
    this.markDirty(); this.schedulePersist();
  },
  // ── E2j progressive disclosure — later phases stay hidden until the earlier steps
  // resolve (per Joachim): awareness waits on the distance roll; evasion + reaction (the
  // RAW fork — evade OR interact) wait on surprise concluding; influence is reaction-gated;
  // the resolution verbs wait on surprise too (✕ Dismiss stays — the GM strike-it override).
  // A RESOLVED encounter shows exactly the steps that were walked (data => visible).
  encStepAwarenessVisible(){
    const e = this.encModalEnc(); if(!e) return false;
    return !!(e.surprise || (e.status === 'active' && e.distance));
  },
  encStepEvasionVisible(){
    const e = this.encModalEnc(); if(!e) return false;
    return !!(e.evasion || (e.status === 'active' && this.encSurpriseRolled()));
  },
  encStepReactionVisible(){
    const e = this.encModalEnc(); if(!e) return false;
    return !!(e.reaction || (e.status === 'active' && this.encSurpriseRolled()));
  },
  encResolutionVerbsVisible(){
    const e = this.encModalEnc(); if(!e) return false;
    return e.status === 'active' && this.encSurpriseRolled();
  },
  // ── E2h reroll gates (the latest-step rule: a roll is re-rollable while it's still the
  // frontier — before a later step has consumed it; earlier-state surgery = the Inspector).
  encDistanceRerollable(){
    const e = this.encModalEnc();
    return !!(e && e.status === 'active' && e.distance && !this.encSurpriseRolled() && !e.evasion && !e.reaction);
  },
  encSurpriseRerollable(){
    const e = this.encModalEnc();
    return !!(e && e.status === 'active' && this.encSurpriseRolled() && !e.evasion && !e.reaction
      && (e.surprise.party.roll || e.surprise.monsters.roll));   // both fore+los → no die to re-throw
  },
  encEvasionRerollable(){
    const e = this.encModalEnc();
    return !!(e && e.status === 'active' && e.evasion && !e.evasion.success && !e.reaction);
  },
  encReactionRowRerollable(ri){
    const e = this.encModalEnc();
    if(!e || e.status !== 'active' || !e.reaction) return false;
    return ri === (e.reaction.rolls || []).length - 1;   // only the latest roll (initial or influence)
  },
  encModalRerollSurprise(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterRerollSurprise(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){ this.showToast('Could not reroll: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
  },
  encModalRerollEvasion(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterRerollEvasion(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){ this.showToast('Could not reroll: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    if(r.evasion && r.evasion.success && r.evasion.aftermath)
      this.showToast('Evaded on the reroll — displaced ' + r.evasion.aftermath.distanceFt + ' ft toward ' + r.evasion.aftermath.clockDirection + " o'clock. Navigation at −4 or knowingly lost (RR p.285).", 6000);
  },
  // One ⟳ on the latest reaction-list row — the initial roll re-throws via rerollReaction,
  // an influence attempt via rerollInfluence (same params, the event patched in place).
  encModalRerollLastRoll(){
    const enc = this.encModalEnc(); if(!enc || !enc.reaction) return;
    const rolls = enc.reaction.rolls || [];
    const last = rolls[rolls.length - 1]; if(!last) return;
    const r = (last.kind === 'influence')
      ? window.ACKS.encounterRerollInfluence(this.currentCampaign, enc.id, {})
      : window.ACKS.encounterRerollReaction(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){ this.showToast('Could not reroll: ' + ((r && r.error) || '?'), 3500); return; }
    this.encModalToneRederive();   // the standing attitude may have moved — the relationship rows follow
    this.markDirty(); this.schedulePersist();
    if(last.kind === 'influence' && r.attempt)
      this.showToast('Rerolled: ' + r.attempt.from + ' → ' + r.attempt.to + (r.attempt.bribe && r.attempt.bribe.backlash ? ' (bribe backlash!)' : '') + '.', 4000);
  },
  // ── E2h itemized math (every roll + every modifier visible to the GM).
  encDistanceDiceText(){
    const e = this.encModalEnc(); const A = window.ACKS;
    const row = e && e.distance && e.distance.terrainRow;
    const cls = row && A.ENCOUNTER_TERRAIN_ROWS && A.ENCOUNTER_TERRAIN_ROWS[row] && A.ENCOUNTER_DISTANCE_CLASSES
      ? A.ENCOUNTER_DISTANCE_CLASSES[A.ENCOUNTER_TERRAIN_ROWS[row].distance] : null;
    return cls ? cls.label : '';
  },
  encSurpriseSideText(side){
    const e = this.encModalEnc(); if(!e || !e.surprise) return '';
    const s = e.surprise[side]; if(!s) return '';
    const who = side === 'party' ? 'party' : 'monsters';
    if(!s.roll) return who + ' — not surprised (foreknowledge + line of sight: no roll)';
    const A = window.ACKS;
    const state = (A.SURPRISE_AWARENESS_STATES || {})[s.awareness] || { mod: 0 };
    const opp = side === 'party' ? 'monsters' : 'party';
    const hiddenPen = (e.surprise[opp] && e.surprise[opp].hidden) ? ((A.SURPRISE_HIDDEN_PENALTY != null) ? A.SURPRISE_HIDDEN_PENALTY : -2) : 0;
    const extra = (Number(s.roll.mod) || 0) - (state.mod || 0) - hiddenPen;
    let txt = who + ' 1d6 ' + s.roll.natural;
    if(state.mod) txt += ' ' + (state.mod > 0 ? '+' : '−') + Math.abs(state.mod) + ' (' + s.awareness + ')';
    if(hiddenPen) txt += ' ' + (hiddenPen > 0 ? '+' : '−') + Math.abs(hiddenPen) + ' (' + opp + ' hidden)';
    if(extra) txt += ' ' + (extra > 0 ? '+' : '−') + Math.abs(extra) + ' (GM)';
    txt += ' = ' + s.roll.total + ' · surprised on 2− → ' + (s.surprised ? 'SURPRISED' : 'ready');
    return txt;
  },
  encEvasionRollText(){
    const e = this.encModalEnc(); if(!e || !e.evasion || !e.evasion.roll || e.evasion.roll.auto) return '';
    const r = e.evasion.roll;
    const mods = (e.evasion.modifiers || []).map(m => (m.value > 0 ? '+' : '−') + Math.abs(m.value) + ' ' + m.label).join(' · ');
    const ti = e.evasion.targetInfo;
    const tgt = ((e.evasion.target != null) ? e.evasion.target : '?') + '+'
      + (ti ? ' (' + String(ti.terrainRow).replace(/-/g, ' ') + ' base ' + ti.base + ' + size ' + ti.sizeBand + ' +' + ti.sizeAdd + ')' : '');
    return '1d20 ' + r.natural + (mods ? ' · ' + mods : '') + ' = ' + r.total + ' vs ' + tgt + ' → ' + (e.evasion.success ? 'evaded ✓' : 'failed ✗');
  },
  encAwarenessPreview(){
    const A = window.ACKS;
    // A hidden side denies the opponent line of sight (RR p.284) — preview with the clamp applied.
    const pLos = !!this.encModal.pLos && !this.encModal.mHidden;
    const mLos = !!this.encModal.mLos && !this.encModal.pHidden;
    const pKey = A.surpriseAwarenessKey(!!this.encModal.pFore, pLos);
    const mKey = A.surpriseAwarenessKey(!!this.encModal.mFore, mLos);
    const el = A.encounterEvadeEligibility(pKey, mKey);
    if(el === 'no-encounter') return '⚠ Neither side aware — setting this resolves the encounter as "no encounter" (RR p.281).';
    const rolls = (k, oppHidden) => {
      const s = A.SURPRISE_AWARENESS_STATES[k];
      return s.rolls ? ('rolls 1d6' + (s.mod > 0 ? '+1' : s.mod < 0 ? '−1' : '') + (oppHidden ? ' −2 hidden' : '')) : 'not surprised';
    };
    return 'Party ' + pKey + ' (' + rolls(pKey, !!this.encModal.mHidden) + ') × monsters ' + mKey + ' (' + rolls(mKey, !!this.encModal.pHidden) + ') → evasion: ' + el + '.';
  },
  encModalSetAwareness(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterSetAwareness(this.currentCampaign, enc.id, {
      partyForeknowledge: !!this.encModal.pFore, partyLineOfSight: !!this.encModal.pLos,
      monsterForeknowledge: !!this.encModal.mFore, monsterLineOfSight: !!this.encModal.mLos,
      partyHidden: !!this.encModal.pHidden, monsterHidden: !!this.encModal.mHidden
    });
    if(!r || !r.ok){ this.showToast('Could not set awareness: ' + ((r && r.error) || '?'), 3500); return; }
    this.encModal.reassert = false;
    this.markDirty(); this.schedulePersist();
    if(r.noEncounter) this.showToast('Neither side became aware — resolved: no encounter (RR p.281).', 4500);
  },
  encSurpriseRolled(){ const e = this.encModalEnc(); return !!(e && e.surprise && e.surprise.party && e.surprise.party.surprised !== null); },
  encSurpriseNeedsRoll(){
    const e = this.encModalEnc();
    return !!(e && e.status === 'active' && e.surprise && !e.surprise.noEncounter && e.surprise.party && e.surprise.party.surprised === null);
  },
  encModalRollSurprise(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterRollSurprise(this.currentCampaign, enc.id, { partyMod: Number(this.encModal.pSurpMod) || 0, monsterMod: Number(this.encModal.mSurpMod) || 0 });
    if(!r || !r.ok){ this.showToast('Could not roll surprise: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
  },
  encEvasionGate(){
    const e = this.encModalEnc();
    if(!e || e.evasion) return { can: false, reason: '' };
    if(e.status !== 'active') return { can: false, reason: '— not attempted.' };
    if(e.reaction) return { can: false, reason: 'Refused — the party is already interacting (RR p.287).' };
    if(!e.surprise) return { can: false, reason: 'Set awareness first — evasion eligibility comes from the Surprise Matrix.' };
    const el = e.surprise.evadeEligibility;
    if(el === 'no-encounter') return { can: false, reason: 'No encounter.' };
    if(el === 'cannot') return { can: false, reason: 'Cannot evade — ' + (e.surprise.party.awareness === 'none' ? 'the party is unaware of the monsters.' : 'the monsters have them cold (foreknowledge + line of sight).') };
    return { can: true, reason: '' };
  },
  encEvasionRowKey(){
    const e = this.encModalEnc(); if(!e) return null;
    const A = window.ACKS;
    if(e.distance && e.distance.terrainRow) return e.distance.terrainRow;
    const hex = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(h => h && h.id === e.hexId) || null;
    return (hex && typeof A.encounterRowKeyForHex === 'function') ? A.encounterRowKeyForHex(hex) : null;
  },
  encEvasionPreview(){
    const e = this.encModalEnc(); if(!e) return '';
    if(e.surprise && (e.surprise.evadeEligibility === 'always' || (e.surprise.monsters && e.surprise.monsters.surprised)))
      return 'Automatic — ' + (e.surprise.monsters && e.surprise.monsters.surprised ? 'all the monsters are surprised.' : 'the party has them cold (foreknowledge + sight vs none).');
    const rowKey = this.encEvasionRowKey();
    if(!rowKey) return 'No terrain row resolves here — the GM sets the target (default 20+).';
    const t = window.ACKS.evasionTargetFor(rowKey, Number(this.encModal.evSize) || 1);
    return t ? ('Throw ' + t.target + '+ — ' + String(rowKey).replace(/-/g, ' ') + ' base ' + t.base + ' + size ' + t.sizeBand + ' (+' + t.sizeAdd + ').') : 'No terrain row resolves — GM sets the target.';
  },
  encEvasionAerialExempt(){
    const rowKey = this.encEvasionRowKey();
    return !!(rowKey && (window.ACKS.EVASION_AERIAL_EXEMPT_ROWS || []).includes(rowKey));
  },
  encModalAttemptEvasion(){
    const enc = this.encModalEnc(); if(!enc) return;
    const mods = [];
    if(this.encModal.evExplorer) mods.push({ label: 'explorer guide (familiar territory)', value: 5 });
    if(this.encModal.evForlorn) mods.push({ label: 'forlorn hope (reduced size)', value: 4 });
    if(this.encModal.evFly && !this.encEvasionAerialExempt()) mods.push({ label: 'monsters fly, party does not', value: -4 });
    if(Number(this.encModal.evSpeed)) mods.push({ label: 'speed differential', value: Number(this.encModal.evSpeed) });
    if(Number(this.encModal.evGmMod)) mods.push({ label: 'GM', value: Number(this.encModal.evGmMod) });
    const r = window.ACKS.encounterAttemptEvasion(this.currentCampaign, enc.id, {
      modifiers: mods, sizeCount: Number(this.encModal.evSize) || undefined, allowSurprised: !!this.encModal.evAllowSurprised
    });
    if(!r || !r.ok){
      const msg = { 'already-interacting': 'Refused — already interacting (RR p.287).', 'cannot-evade': 'The Surprise Matrix says this side cannot evade.', 'party-surprised': 'The party is surprised — only an unsurprised explorer guide lets it evade.' }[r && r.error] || ('Could not attempt: ' + ((r && r.error) || '?'));
      this.showToast(msg, 4500); return;
    }
    this.markDirty(); this.schedulePersist();
    if(r.evasion && r.evasion.success && r.evasion.aftermath)
      this.showToast('Evaded — displaced ' + r.evasion.aftermath.distanceFt + ' ft toward ' + r.evasion.aftermath.clockDirection + " o'clock. Navigation at −4 or knowingly lost (RR p.285).", 6000);
  },
  // ── E3b — tone + situational modifiers (JJ pp.84–87, D11). encModal.toneRows is the
  // working checklist: built by encModalToneReset (tone switch / open), refreshed by
  // encModalToneRederive (auto rows re-derive — speaker, standing attitude, counts —
  // while the GM's manual ticks + values are kept). Ticked rows feed BOTH the initial
  // reaction roll and every influence attempt as itemized modifiers (the E2h plumbing).
  encToneDef(){ return (window.ACKS.ENCOUNTER_TONES || {})[this.encModal.tone] || null; },
  encToneBand(band){ return window.ACKS.toneBandLabel ? window.ACKS.toneBandLabel(this.encModal.tone, band) : band; },
  encAttitudeText(reaction){
    if(!reaction || !reaction.current) return '';
    return window.ACKS.toneBandLabel ? window.ACKS.toneBandLabel(reaction.tone, reaction.current) : reaction.current;
  },
  _encToneActorId(){
    const e = this.encModalEnc();
    return (e && e.reaction) ? (this.encModal.inflActorId || null) : (this.encModal.faceId || null);
  },
  encModalToneReset(){
    const enc = this.encModalEnc(); if(!enc){ this.encModal.toneRows = []; return; }
    this.encModal.toneRows = window.ACKS.encounterToneRows(this.currentCampaign, enc.id, this.encModal.tone, { faceCharacterId: this._encToneActorId() }) || [];
  },
  encModalToneRederive(){
    const enc = this.encModalEnc(); if(!enc) return;
    const fresh = window.ACKS.encounterToneRows(this.currentCampaign, enc.id, this.encModal.tone, { faceCharacterId: this._encToneActorId() }) || [];
    const old = {}; (this.encModal.toneRows || []).forEach(r => { old[r.key] = r; });
    fresh.forEach(r => { const o = old[r.key]; if(o && !o.auto && !r.auto){ r.on = o.on; r.value = o.value; } });
    this.encModal.toneRows = fresh;
  },
  encToneActiveCount(){ return (this.encModal.toneRows || []).filter(r => r && r.on).length; },
  encToneModSum(){ return (this.encModal.toneRows || []).reduce((s, r) => s + ((r && r.on) ? (Number(r.value) || 0) : 0), 0); },
  encToneModText(){ const s = this.encToneModSum(); return (s >= 0 ? '+' : '−') + Math.abs(s); },
  encToneModifiers(){
    return (this.encModal.toneRows || []).filter(r => r && r.on && Number(r.value))
      .map(r => ({ label: r.label, value: Number(r.value) }));
  },
  encModalRollReaction(){
    const enc = this.encModalEnc(); if(!enc) return;
    const mods = this.encToneModifiers();
    if(Number(this.encModal.reactMod)) mods.push({ label: 'GM', value: Number(this.encModal.reactMod) });
    const r = window.ACKS.encounterRollReaction(this.currentCampaign, enc.id, { faceCharacterId: this.encModal.faceId || null, modifiers: mods, tone: this.encModal.tone });
    if(!r || !r.ok){ this.showToast('Could not roll reaction: ' + ((r && r.error) || '?'), 3500); return; }
    if(!this.encModal.inflActorId) this.encModal.inflActorId = this.encModal.faceId;
    this.encModalToneRederive();   // the standing attitude just changed — the relationship rows follow
    this.markDirty(); this.schedulePersist();
  },
  // Itemized roll math (E2h): 2d6 + CHA + each named modifier = total → band (clamp noted).
  // E3b: the band wears its tone's label (intimidated/overawed) + non-diplomatic rolls name the tone.
  encReactionRollText(r){
    if(!r) return '';
    const bandText = window.ACKS.toneBandLabel ? window.ACKS.toneBandLabel(r.tone, r.band) : r.band;
    let dice = '2d6 ' + r.natural;
    if(r.chaMod) dice += ' ' + (r.chaMod > 0 ? '+' : '−') + Math.abs(r.chaMod) + ' CHA';
    const mods = Array.isArray(r.modifiers) ? r.modifiers : null;
    if(mods && mods.length) dice += ' ' + mods.map(m => (m.value > 0 ? '+' : '−') + Math.abs(m.value) + ' ' + m.label).join(' · ');
    else if(r.modSum) dice += ' ' + (r.modSum > 0 ? '+' : '−') + Math.abs(r.modSum) + ' mods';
    dice += ' = ' + r.total + ' → ' + bandText + (r.clamped ? ' (' + r.clamped + ' clamp)' : '');
    const toneTag = (r.tone && r.tone !== 'diplomatic') ? (', ' + r.tone) : '';
    if(r.kind === 'initial') return dice + (toneTag ? ' (' + r.tone + ')' : '');
    return 'attempt ' + r.attempt + ' (' + r.timeRequired + toneTag + '): ' + dice + ' — ' + r.from + ' → ' + r.to
      + ((r.bribe && !(mods && mods.length)) ? (' · bribe +' + r.bribe.bonus) : '')
      + ((r.bribe && r.bribe.backlash) ? ' · bribe BACKLASH' : '');
  },
  encReactionFriendlyHint(){
    const e = this.encModalEnc();
    return !!(e && e.reaction && e.reaction.current === 'friendly' && e.category === 'monster');
  },
  encInfluenceNextInfo(){
    const e = this.encModalEnc(); if(!e || !e.reaction) return null;
    const n = (e.reaction.rolls || []).filter(r => r && r.kind === 'influence').length + 1;
    return Object.assign({ attemptNumber: n }, window.ACKS.influenceAttemptInfo(n));
  },
  encInfluenceForecast(){
    const info = this.encInfluenceNextInfo(); if(!info) return '';
    const cost = info.activitySlot === 'incidental' ? 'incidental — no budget cost'
      : info.activitySlot === 'ancillary' ? "costs 1 ancillary hour of the speaker's day"
      : ("costs the speaker's dedicated day" + (info.days > 1 ? ' × ' + info.days : ''));
    return 'Next: attempt ' + info.attemptNumber + ' — takes ' + info.time + ' · ' + cost + '.';
  },
  encInfluenceFits(){
    const e = this.encModalEnc(); const info = this.encInfluenceNextInfo();
    if(!e || !info) return { fits: false, reason: '' };
    if(info.activitySlot === 'incidental') return { fits: true, reason: '' };
    const actorId = this.encModal.inflActorId || (e.partySide && e.partySide.faceCharacterId) || null;
    if(!actorId) return { fits: true, reason: '' };          // no bound speaker — nothing to budget
    const A = window.ACKS;
    const BUDGET = A.ACTIVITY_BUDGET || { dedicatedPerDay: 1, ancillaryPerDedicatedDay: 4, ancillaryMaxPerDay: 12 };
    const b = A.characterActivityBudget(this.currentCampaign, actorId);
    const name = this.encCharName(actorId);
    if(info.activitySlot === 'dedicated'){
      if((b.dedicatedUsed || 0) >= (BUDGET.dedicatedPerDay || 1)) return { fits: false, reason: name + ' has no full-day slot left today — this attempt takes ' + info.time + '.' };
      return { fits: true, reason: '' };
    }
    const dedUsed = b.dedicatedUsed || 0, ancUsed = b.ancillaryUsed || 0;
    const ancCap = (dedUsed >= 1) ? BUDGET.ancillaryPerDedicatedDay : BUDGET.ancillaryMaxPerDay;
    if(ancUsed + 1 > ancCap) return { fits: false, reason: name + ' has no time left today — ' + ancUsed + ' of ' + ancCap + ' short tasks used' + (dedUsed >= 1 ? ' alongside a full-day task' : '') + '.' };
    return { fits: true, reason: '' };
  },
  encActorBriberyProficient(){
    const c = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === this.encModal.inflActorId);
    return !!(c && (c.proficiencies || []).some(p => /bribery/i.test(String((p && (p.key || p.name || p.label)) || p || ''))));   // PT-0: canonical {key} slug
  },
  encBribePayLabel(bonus){
    const t = window.ACKS.bribeBonusInfo(bonus, this.encActorBriberyProficient());
    return t ? t.pay : '';
  },
  encModalAttemptInfluence(){
    const enc = this.encModalEnc(); if(!enc) return;
    const fits = this.encInfluenceFits(); if(!fits.fits){ this.showToast(fits.reason, 4500); return; }
    const mods = this.encToneModifiers();
    if(Number(this.encModal.inflMod)) mods.push({ label: 'GM', value: Number(this.encModal.inflMod) });
    const opts = { actorCharacterId: this.encModal.inflActorId || null, modifiers: mods, tone: this.encModal.tone };
    if(this.encModal.inflBribe) opts.bribe = { bonus: this.encModal.inflBribe, proficient: this.encActorBriberyProficient() };
    const r = window.ACKS.encounterAttemptInfluence(this.currentCampaign, enc.id, opts);
    if(!r || !r.ok){ this.showToast('Could not attempt: ' + ((r && r.error) || '?'), 3500); return; }
    this.encModalToneRederive();   // the standing attitude shifted — the relationship rows follow
    this.markDirty(); this.schedulePersist();
    this.showToast('Influence: ' + r.attempt.from + ' → ' + r.attempt.to + (r.attempt.bribe && r.attempt.bribe.backlash ? ' (bribe backlash!)' : '') + '.', 4000);
  },
  // ── garrison-patrols — the patroller IS a detachment of the hex domain's real garrison
  // (MM p.226 / RR p.341). encGarrisonPatrol() is the derived display detail; the casualty
  // verb permanently subtracts the slain from the source garrison unit (it then flows into
  // garrison cost / Battle Rating / adequacy). ──
  encGarrisonPatrol(){
    const enc = this.encModalEnc(); if(!enc) return null;
    return window.ACKS.garrisonPatrolSummary(this.currentCampaign, enc.id);
  },
  encApplyGarrisonCasualties(){
    const enc = this.encModalEnc(); if(!enc) return;
    const n = Math.floor(Number(this.encModal.garrisonKilled) || 0);
    if(n <= 0) return;
    const r = window.ACKS.applyGarrisonPatrolCasualties(this.currentCampaign, enc.id, n);
    if(!r || !r.ok){ this.showToast('Could not apply casualties: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.encModal.garrisonKilled = 0;
    this.showToast('⚰ ' + r.killed + ' patroller(s) lost — garrison reduced to ' + r.remaining + '.', 5000);
  },
  encModalResolve(outcome){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.recordEncounterResolved(this.currentCampaign, enc.id, outcome, {});
    if(!r || !r.ok){ this.showToast('Could not resolve: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    if(outcome === 'combat') this.showToast('Combat — GM resolves at the table. Record the result afterwards as an adventure outcome (Events ▸ 📨 Emit Event ▸ adventure-result); a cleared lair flips from there.', 8000);
  },
  // ── E3a — settle-as-lair (the linger-or-migrate proposal panel; JJ p.69 + p.103).
  // The verb rolls a PROPOSAL (transient encModal.settle — nothing written); ⟳ re-rolls;
  // the dungeon ×2 tick recomputes vs the held naturals; confirm materializes.
  // ⚙️ The whole branch is the persistent-wandering-monsters rule (default ON) — OFF ⇒
  // the offer is HIDDEN, not disabled (principle 8); the engine verbs refuse 'rule-off'.
  encSettleRuleOn(){ return this.isHouseRuleEnabled('persistent-wandering-monsters'); },
  encSettleEligible(){
    const enc = this.encModalEnc(); if(!enc) return false;
    return !!window.ACKS.encounterSettleEligibility(this.currentCampaign, enc.id).eligible;
  },
  // Disable-with-reason (the Trade/Forage/influence idiom) — the offer must be
  // discoverable: the commonest draw ("monsters — GM identifies", no catalog key)
  // is exactly the ineligible case, and a hidden button teaches nothing.
  encSettleReason(){
    const enc = this.encModalEnc(); if(!enc) return '';
    const e = window.ACKS.encounterSettleEligibility(this.currentCampaign, enc.id);
    if(e.eligible) return '';
    if(e.reason === 'rule-off') return 'the Persistent wandering monsters house rule is off (⚙ House Rules ▸ ⚔ Encounters)';
    if(e.reason === 'no-catalog-monster') return 'name the monster first — its catalog entry carries the Lair %; use the other-side card’s pick-from-table, or 🔍 Open in Inspector';
    if(e.reason === 'no-lair-pct') return 'this monster has no Lair % in the catalog — author a den via the Lair Wizard instead';
    if(e.reason === 'already-at-lair') return 'they are already home — this meeting is at their lair';
    if(e.reason === 'fragment-has-home-lair') return 'this band forays from a home lair — it returns there, it does not found a second den' + (this.lairKnown(enc.monsterSide && enc.monsterSide.lairId) ? ' (its den is already discovered — → lair on the other-side card)' : ' (🐾 Track home on the other-side card follows the spoor to it)');
    if(e.reason === 'no-hex') return 'the encounter has no hex to den in';
    if(e.reason === 'hex-full'){
      const c = e.capacity || {};
      return (c.diceMax === 0)
        ? 'open water holds no land lairs (v1) — the band moves on'
        : 'the hex already holds its maximum lairs (' + c.count + ' of ' + c.max + ' — ' + c.territoryClass + ', JJ p.69): too crowded — the band moves on; clear or remove a den to make room';
    }
    if(e.reason === 'pursuit-in-progress') return 'they are taking up the chase — resolve the pursuit first';
    if(e.reason === 'banditry-band') return 'these are the domain’s own men turned bandit (RR pp.350–351) — they melt back to their fields when morale recovers; they do not found a lair';
    if(e.reason === 'band-mid-hunt') return 'the band is mid-hunt — it presses on after its quarry (see its ⚔ chase on the band line); the offer stands again once that chase ends';
    if(e.reason === 'settle-already-decided') return 'the linger roll was already made — they moved on';
    return e.reason;
  },
  // The resolved-EVADED offer (the banner button): one linger roll per meeting —
  // hidden once decided (settled → the → lair link; migrated → the settle-check stamp).
  encSettleOfferOnResolved(){
    if(!this.encSettleRuleOn()) return false;   // rule off ⇒ hidden, not disabled
    const e = this.encModalEnc();
    return !!(e && e.status === 'resolved' && e.outcome === 'evaded'
      && !(e.monsterSide && e.monsterSide.lairId)
      && !(e.history || []).some(h => h && h.type === 'settle-check'));
  },
  encSettleTitle(){
    const r = this.encSettleReason();
    return r ? ('Unavailable — ' + r)
      : 'Do they den here? Roll their Lair % — a lingerer settles a new lair at this hex (a second Lair % success = full lair strength), else they migrate onward (JJ p.69 + p.103). Rolls a proposal first — nothing is written until you confirm.';
  },
  encModalProposeSettle(){
    const enc = this.encModalEnc(); if(!enc) return;
    const p = window.ACKS.encounterProposeSettle(this.currentCampaign, enc.id, { dungeonBeckons: this.encModal.settleDungeon });
    if(!p || !p.ok){ this.showToast('Cannot roll settle: ' + ((p && p.error) || '?'), 3500); return; }
    this.encModal.settle = p;
  },
  encModalSettleRecompute(){
    if(!this.encModal.settle) return;
    this.encModal.settle = window.ACKS.settleProposalOutcome(this.encModal.settle, this.encModal.settleDungeon);
  },
  encSettleLingerText(){
    const p = this.encModal.settle; if(!p) return '';
    return 'linger: 1d100 ' + p.lingerNatural + ' vs Lair ' + p.effectivePct + '%'
      + (p.dungeonBeckons ? ' (' + p.lairPct + '% ×2 dungeon)' : '')
      + ' → ' + (p.lingers ? 'lingers ✓' : 'migrates ✗');
  },
  encSettleStrengthText(){
    const p = this.encModal.settle; if(!p || !p.lingers) return '';
    return 'strength: 1d100 ' + p.strengthNatural + ' vs Lair ' + p.lairPct + '% → ' + (p.fullStrength ? 'full lair strength ✓' : 'wandering numbers ✗');
  },
  encSettleConfirmLabel(){
    const p = this.encModal.settle; if(!p) return '';
    if(p.lingers) return '✓ Den here (create the lair)';
    const enc = this.encModalEnc();
    return (enc && enc.status === 'resolved') ? '✓ They moved on (record it)' : '✓ Record migration (dispersed)';
  },
  encSettleOutcomeText(){
    const p = this.encModal.settle; if(!p) return '';
    const enc = this.encModalEnc();
    const evaded = !!(enc && enc.status === 'resolved');   // the evaded path — the outcome stands
    if(!p.lingers) return 'The ' + (p.monsterName || 'monsters') + ' migrate onward — '
      + (evaded ? 'confirming records that they moved on (the meeting stays evaded).' : 'confirming records the meeting as dispersed.');
    const den = p.fullStrength
      ? ('Settles at FULL lair strength — ' + p.fullCount + ' ' + (p.monsterName || '') + ' den at this hex, hoard letter recorded (contents are the GM\'s).')
      : ('Settles at wandering strength — ' + p.wanderingCount + ' ' + (p.monsterName || '') + ' den at this hex with no hoard yet.');
    return den + (evaded ? ' The party fled — the den starts UNKNOWN to the players (find it via search or track-home).' : '');
  },
  encModalConfirmSettle(){
    const enc = this.encModalEnc(); if(!enc || !this.encModal.settle) return;
    const r = window.ACKS.encounterSettleAsLair(this.currentCampaign, enc.id, { proposal: this.encModal.settle });
    if(!r || !r.ok){ this.showToast('Could not settle: ' + ((r && r.error) || '?'), 3500); return; }
    this.encModal.settle = null;
    this.markDirty(); this.schedulePersist();
    this.showToast(r.migrated
      ? (r.settledAfterEvasion ? 'They moved on — the meeting stays evaded (JJ p.103).' : 'They migrate onward — recorded as dispersed (JJ p.103).')
      : (r.settledAfterEvasion
        ? ('🏚 ' + ((r.lair && r.lair.name) || 'A lair') + ' dens at ' + this.encHexLabel(enc) + ' behind the fled party — unknown to the players (search / track-home finds it).')
        : ('🏚 ' + ((r.lair && r.lair.name) || 'A lair') + ' settles at ' + this.encHexLabel(enc) + ' — see World ▸ 🐉 Monsters.')), 7000);
  },
  // ── E3c — pursuit (the GM's intent call + the running-chase levers; RR p.285 + p.120).
  encModalBeginPursuit(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterBeginPursuit(this.currentCampaign, enc.id, { mod: Number(this.encModal.pursuitMod) || 0 });
    if(!r || !r.ok){ this.showToast('Could not take up the trail: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast(r.takeUp && r.takeUp.success
      ? ('🐺 ' + ((r.pursuit && r.pursuit.pursuerLabel) || 'The pursuer') + ' is on the trail — the Day Clock advances the chase.')
      : 'The trail was never found — resolved as evaded.', 5000);
  },
  encModalDeclinePursuit(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterDeclinePursuit(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){ this.showToast('Could not waive: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
  },
  encModalAbandonPursuit(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterAbandonPursuit(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){ this.showToast('Could not break off: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
  },
  // E5 — the follow's controls + status line (the party-direction pursuit panel).
  encModalAbandonTracking(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterAbandonTracking(this.currentCampaign, enc.id, {});
    if(!r || !r.ok){ this.showToast('Could not give up the trail: ' + ((r && r.error) || '?'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('🐾 The trackers give up the trail. The journey keeps its last destination — Stop Journey if they should halt.', 4500);
  },
  encTrackingStatusText(){
    const enc = this.encModalEnc(); const pur = enc && enc.pursuit;
    if(!pur || pur.direction !== 'party') return '';
    const A = window.ACKS;
    const q = pur.quarry || {};
    let where = '';
    const j = pur.journeyId ? ((this.currentCampaign?.journeys || []).find(x => x && x.id === pur.journeyId) || null) : null;
    const pHexId = (j && (j.currentHexId || j.startHexId)) || null;
    const pHex = pHexId ? ((this.currentCampaign?.hexes || []).find(h => h && h.id === pHexId) || null) : null;
    if(pHex && pHex.coord && q.coord && typeof A.hexAxialDistance === 'function'){
      where = (A.hexAxialDistance(pHex.coord, q.coord) * 6) + ' mi ahead';
    }
    const plan = q.halted
      ? (q.destLairId ? 'it has gone to ground at its den' : 'it has camped')
      : (q.plan === 'heads-home' ? 'it is heading home'
        : q.plan === 'heads-to-settlement' ? 'it is making for a settlement'
        : 'it roams' + (q.walkDaysLeft != null ? ' (camps within ' + q.walkDaysLeft + ' day' + (q.walkDaysLeft === 1 ? '' : 's') + ')' : ''));
    return plan + (where ? (', ' + where) : '') + ' — the party follows at half expedition speed.';
  },
  encPursuitThrowText(t){
    if(!t) return '';
    // E5 — the find / re-find throws carry itemized modifiers (the E2h convention).
    if(t.kind === 'find' || t.kind === 're-find'){
      let s = (t.kind === 'find' ? 'find the trail' : ('re-find (' + (t.cause === 'rain' ? 'rain/snow' : t.cause === 'water' ? 'entered water' : 'lost') + ')')) + ': 1d20 ' + t.natural;
      const NAMES = { 'count-band': 'their numbers', 'extra-ranks': 'Tracking ranks', 'ground': 'ground', 'trail-age': 'trail age', 'rain-snow': 'rain/snow', 'dim-light': 'dim light', 'gm': 'GM' };
      for(const m of (t.modifiers || [])){
        s += ' ' + (m.value > 0 ? '+' : '−') + Math.abs(m.value) + ' (' + (NAMES[m.source] || m.source) + ')';
      }
      s += ' = ' + t.total + ' vs 11+ → ' + (t.natural === 1 ? 'natural 1 ✗' : (t.success ? 'found ✓' : 'no trail ✗'));
      return s;
    }
    let s = (t.kind === 'take-up' ? 'take-up' : 'keep trail') + ': 1d20 ' + t.natural;
    if(t.countBonus) s += ' +' + t.countBonus + ' (party size)';
    if(t.mod) s += ' ' + (t.mod > 0 ? '+' : '−') + Math.abs(t.mod) + ' (GM)';
    s += ' = ' + t.total + ' vs 11+ → ' + (t.natural === 1 ? 'natural 1 ✗' : (t.success ? 'holds ✓' : 'lost ✗'));
    return s;
  },
  encountersActiveCount(){ return this.allEncounters().filter(e => e && e.status === 'active').length; },
  _encounterMatchesSearch(e){
    const q = (this.encountersSearch || '').toLowerCase().trim();
    if(!q) return true;
    const hay = (this.encounterLabel(e) + ' ' + (e.trigger || '') + ' ' + (e.category || '') + ' ' + (e.rarity || '')
      + ' ' + this.encHexLabel(e) + ' ' + (e.outcome || '')).toLowerCase();
    return hay.indexOf(q) >= 0;
  },
  // Deep-link list helpers (E2c): the lair's meetings (world memory, D9) + the hex's.
  encountersForLair(lairId){
    return ((this.currentCampaign && this.currentCampaign.encounters) || [])
      .filter(e => e && e.monsterSide && e.monsterSide.lairId === lairId).slice().reverse();
  },
  encountersAtHexId(hexId){
    const list = window.ACKS.encountersAtHex(this.currentCampaign, hexId) || [];
    const act = list.filter(e => e && e.status === 'active');
    const res = list.filter(e => e && e.status !== 'active').slice(-6).reverse();
    return act.concat(res);
  },
  encounterRowText(e){
    return this.encounterLabel(e)
      + ' · ' + (e.status === 'active' ? ('active — ' + e.phase) : (e.outcome || 'resolved'))
      + ' · turn ' + (e.occurredAtTurn == null ? '?' : e.occurredAtTurn) + (e.occurredOnDayInMonth ? '/' + e.occurredOnDayInMonth : '');
  },
  // E4l — the pursuit take-up ⟳ (mirrors the engine gates so the button only shows when the
  // verb would act): the latest throw must BE the take-up (no daily keep-the-trail yet), a
  // settle decision retires it, and a resolved encounter is reversible only when the failed
  // take-up itself resolved it.
  encPursuitTakeUpRerollable(){
    const enc = this.encModalEnc(); if(!enc || !enc.pursuit) return false;
    const throws = (enc.pursuit.throws || []);
    const t = throws.length ? throws[throws.length - 1] : null;
    if(!t || t.kind !== 'take-up') return false;
    if(throws.some(x => x && x.kind === 'keep-trail')) return false;
    if((enc.history || []).some(h => h && h.type === 'settle-check')) return false;
    if(enc.status === 'resolved' && (t.success || enc.outcome !== 'evaded')) return false;
    return true;
  },
  encModalRerollTakeUp(){
    const enc = this.encModalEnc(); if(!enc) return;
    const r = window.ACKS.encounterRerollPursuitTakeUp(this.currentCampaign, enc.id);
    if(!r || !r.ok){ this.showToast('Could not reroll: ' + ((r && r.error) || 'unknown error'), 3500); return; }
    this.markDirty(); this.schedulePersist();
    if(r.changed) this.showToast(r.takeUp.success ? '🐺 The trail is found — the chase is on (the evade is un-resolved).' : 'The trail is lost — resolved evaded.', 4500);
  },
  // E4k/E5 (Joachim 2026-06-11) — the resolved banner's track target. A concluded REAL
  // meeting (parleyed / evaded / dispersed / combat — the band has parted, so there is a
  // trail) offers the FOLLOW (E5 — any creature: den-ful, den-less, migrant, civilized,
  // even unidentified). Null = no offer: no meeting, the den already known, met AT the
  // den, or a follow already live/caught on this meeting (the pursuit panel owns it then).
  encBannerTrackTarget(){
    const enc = this.encModalEnc(); if(!enc || enc.status !== 'resolved') return null;
    if(['parleyed','evaded','dispersed','combat'].indexOf(enc.outcome) < 0) return null;
    const ms = enc.monsterSide || {};
    if(ms.lairId && (this.lairKnown(ms.lairId) || ms.encounterKind === 'at-lair')) return null;
    if(enc.pursuit && enc.pursuit.direction === 'party' && (enc.pursuit.status === 'tracking' || enc.pursuit.status === 'caught')) return null;
    if(!enc.hexId) return null;
    return { encounterId: enc.id, hexId: enc.hexId, countTracked: ms.count || 0 };
  },
  // E5 — the one disable-with-reason left on the banner 🐾: a band mid-hunt presses on
  // after its quarry, so its motion belongs to the chase (meet it there — E4m).
  encTrackPartedReason(){
    const enc = this.encModalEnc(); if(!enc) return 'no encounter';
    const ms = enc.monsterSide || {};
    if(ms.pursuitEncounterId){
      const chase = window.ACKS.findEncounter(this.currentCampaign, ms.pursuitEncounterId);
      if(chase && chase.status === 'active' && chase.pursuit && chase.pursuit.direction !== 'party' && (chase.pursuit.status === 'offered' || chase.pursuit.status === 'pursuing'))
        return 'the band is mid-hunt — it presses on after its quarry (see its ⚔ chase on the band line)';
    }
    return '';
  },
  encTrackPartedReady(){ return this.encTrackPartedReason() === ''; },
  // #476 M1 — Lair Wizard (Inspector Create > Lair; §12.5). 'author' = one detailed lair (place on a
  // hex / hold in the dynamic pool); 'seed' = roll the RAW Lairs-per-Hex count for an unsettled hex.
  lairWizardOpen: false,
  lairWizardMode: 'author',
  lairWizardForm: { name:'', monsterCatalogKey:'', lairType:'lair', terrain:'', inhabitants:0, hasFortifications:false, knownToPlayers:false, treasureType:'', precisePlacement:'', notes:'', destination:'hex', hexId:'' },
  lairWizardSeed: { hexId:'', count:0 },
  // #476 M7 — World ▸ Lairs view + lair detail panel (Plan §12).
  lairDetailId: null,            // open lair in the detail modal (null = closed)
  encounterModalOpen: false,     // the resolution modal's visibility (#476 E2)
  encounterModalId: null,        // the encounter it shows — kept set on close so the mounted
                                 // subtree never re-evaluates against null during teardown (no Alpine warnings)
  encountersSearch: '',          // World ▸ Encounters — one search over both tables (E2g)
  encModal: {                    // transient step inputs for the resolution modal (reset on open)
    pFore: false, pLos: true, mFore: false, mLos: true, reassert: false,
    pSurpMod: 0, mSurpMod: 0,
    evSize: 1, evExplorer: false, evForlorn: false, evFly: false, evSpeed: 0, evGmMod: 0, evAllowSurprised: false,
    faceId: '', reactMod: 0,
    inflActorId: '', inflMod: 0, inflBribe: 0,
    garrisonKilled: 0              // garrison-patrols — patrollers slain this fight (→ encApplyGarrisonCasualties)
  },
  lairsSearch: '',               // Lairs view text filter (name / monster / hex)
  lairsStatusFilter: 'all',      // Lairs view status filter
  lairDetailPopulateKey: '',     // ✨ populate-from-catalog monster key (shells / empty lairs)
  lairDetailRevealHexId: '',     // reveal-a-dynamic-lair hex pick
  });
})();
