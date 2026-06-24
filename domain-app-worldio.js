/* =============================================================================
 * domain-app-worldio.js — ACKS God Mode app mixin: World I/O (Excel import/export)
 * =============================================================================
 *
 * Bulk import/export of world-state (Domains · Hexes · Settlements · Lairs) via a real
 * .xlsx workbook — the first consumer of the XLS-1 field-schema foundation
 * (acks-engine-field-schemas.js → schemaToImportColumns). One source (the field-schema)
 * drives the template, the columns, validation, and the reference sheet, both ways.
 *
 * Pipeline (all in-memory; nothing mutates until Commit):
 *   parse → normalize → validate → cross-ref resolve → plan(diff) → [GM reviews] → commit
 *
 * SheetJS (xlsx community build) is LAZY-loaded from a version-pinned CDN + SRI on first
 * use (the core app loads/runs without it; "no build step" holds — Architecture §4 exception).
 *
 * Registers a members object on window.__ACKS_APP_MIXINS__; domainApp() merges it into the
 * component. Members use this.* / window.ACKS.* only. Loaded via <script src> after
 * domain-app.js, before Alpine's deferred init.
 *
 * Plan: Phase_2.5_Excel_Import_Plan.md (XLS-1..XLS-5). No save-format change.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);

  // ─── Module constants ───
  var WORLDIO = {
    // The v1 entity sheets, in DEPENDENCY ORDER (Domains → Hexes → Settlements → Lairs).
    SHEETS: [
      { sheet:'Domains',     kind:'domain',     coll:'domains',     label:'Domains' },
      { sheet:'Hexes',       kind:'hex',        coll:'hexes',       label:'Hexes' },
      { sheet:'Settlements', kind:'settlement', coll:'settlements', label:'Settlements' },
      { sheet:'Lairs',       kind:'lair',       coll:'lairs',       label:'Lairs' }
    ],
    FORMAT_VERSION: 1,
    // SheetJS community build — version-pinned CDN + SRI (plan §9 / OQ6). Swappable to a
    // vendored copy behind this shim if appsec / offline ever wins.
    XLSX_URL: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    XLSX_SRI: 'sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA=='
  };

  // ─── Pure helpers (module-private; closed over by the members below) ───
  function _norm(s){ return String(s == null ? '' : s).toLowerCase().replace(/\s+/g,'').trim(); }
  function _blank(v){ return v == null || (typeof v === 'string' && v.trim() === ''); }

  function _coerce(value, type){
    if(_blank(value)) return null;
    var s = (typeof value === 'string') ? value.trim() : value;
    if(type === 'number' || type === 'gp'){ var n = Number(String(s).replace(/,/g,'')); return isFinite(n) ? n : NaN; }
    if(type === 'boolean'){
      var t = String(s).toLowerCase().trim();
      if(['true','yes','y','1','x','✓','on'].indexOf(t) >= 0) return true;
      if(['false','no','n','0','off'].indexOf(t) >= 0) return false;
      return null;
    }
    return String(s).trim();   // string / longText / date / enum / id
  }
  function _int(value){ if(_blank(value)) return null; var n = parseInt(String(value).trim(), 10); return isFinite(n) ? n : NaN; }

  // Levenshtein (small strings) — for fuzzy "did you mean" (plan §7).
  function _lev(a, b){
    a = String(a); b = String(b);
    var m = a.length, n = b.length, i, j;
    if(!m) return n; if(!n) return m;
    var prev = []; for(j = 0; j <= n; j++) prev[j] = j;
    for(i = 1; i <= m; i++){
      var cur = [i];
      for(j = 1; j <= n; j++){
        cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  // Normalize a value against a legal enum set. Returns {value, warning?}. ADVISORY, never blocking:
  // an exact (case/space-insensitive) match → canonical; a single fuzzy near-miss → auto-corrected +
  // warned; anything else → the raw value is KEPT + warned. The schema's enum-typed fields (terrain,
  // koppen, …) are free strings the engine aliases, and legacy/non-canonical values (e.g. terrain
  // 'coast'/'plains') must survive a round-trip — so an unrecognised value is a warning, NOT a dropped
  // row. (Genuine blockers — missing required, bad coord, unresolved reference — stay hard errors.)
  function _checkEnum(raw, legal){
    if(_blank(raw)) return { value: null };
    var s = String(raw).trim();
    if(!legal || !legal.length) return { value: s };           // no legal set loaded → pass through
    var hit = legal.find(function(l){ return _norm(l) === _norm(s); });
    if(hit) return { value: hit, warning: (hit === s) ? null : ('“' + s + '” → “' + hit + '”') };
    var near = legal.filter(function(l){ return _lev(_norm(l), _norm(s)) <= 2; });
    if(near.length === 1) return { value: near[0], warning: '“' + s + '” → “' + near[0] + '”' };
    if(near.length > 1)   return { value: s, warning: '“' + s + '” is non-standard (closest: ' + near.slice(0,3).join(' / ') + ') — kept as entered' };
    return { value: s, warning: '“' + s + '” is not a standard value (' + legal.slice(0,5).join(', ') + (legal.length > 5 ? ', …' : '') + ') — kept as entered' };
  }

  function _getPath(obj, path){
    if(!obj) return undefined;
    var parts = path.split('.'), o = obj;
    for(var i = 0; i < parts.length; i++){ if(o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function _setPath(obj, path, val){
    var parts = path.split('.'), o = obj;
    for(var i = 0; i < parts.length - 1; i++){
      if(o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }

  // ─── The mixin members ───
  M.push({

    // Transient UI/work state (not persisted; Alpine-reactive).
    worldIO: {
      mode: 'create',        // 'create' (create-only) | 'upsert'
      preview: null,         // the planned diff (see _worldPlanImport), or null
      loading: false,
      error: '',
      fileName: '',
      showErrors: false      // expand the per-row error/warning list
    },
    _xlsxLoading: null,        // in-flight SheetJS load promise (dedupe)

    // ── SheetJS lazy-loader (XLS-5) — pinned CDN + SRI + graceful failure ──
    _worldEnsureXLSX(){
      if(window.XLSX) return Promise.resolve(window.XLSX);
      if(this._xlsxLoading) return this._xlsxLoading;
      this._xlsxLoading = new Promise(function(resolve, reject){
        var s = document.createElement('script');
        s.src = WORLDIO.XLSX_URL;
        s.integrity = WORLDIO.XLSX_SRI;
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
        s.onload = function(){ window.XLSX ? resolve(window.XLSX) : reject(new Error('The spreadsheet library loaded but did not initialise.')); };
        s.onerror = function(){ reject(new Error('Could not load the spreadsheet library (xlsx) from the CDN — check your internet connection and try again.')); };
        document.head.appendChild(s);
      });
      // On failure, clear so a later retry re-attempts.
      var self = this;
      this._xlsxLoading.catch(function(){ self._xlsxLoading = null; });
      return this._xlsxLoading;
    },

    // ════════════════════════ EXPORT (the mirror — plan §6) ════════════════════════
    async worldExportTemplate(){
      try {
        var XLSX = await this._worldEnsureXLSX();
        XLSX.writeFile(this._worldBuildWorkbook(XLSX, { template: true }), 'acks-world-template.xlsx');
      } catch(e){ this.showToast(e.message || 'Export failed.', 6000); }
    },
    async worldExportCurrent(){
      if(!this.currentCampaign){ this.showToast('Open or create a campaign first.'); return; }
      try {
        var XLSX = await this._worldEnsureXLSX();
        var nm = String(this.currentCampaign.name || 'world').replace(/[^\w-]+/g,'_').slice(0,40) || 'world';
        XLSX.writeFile(this._worldBuildWorkbook(XLSX, { template: false }), 'acks-world-' + nm + '.xlsx');
      } catch(e){ this.showToast(e.message || 'Export failed.', 6000); }
    },
    _worldBuildWorkbook(XLSX, opts){
      var A = window.ACKS, camp = this.currentCampaign, wb = XLSX.utils.book_new();
      WORLDIO.SHEETS.forEach(function(def){
        var cols = A.schemaToImportColumns(def.kind);
        var aoa = [cols.map(function(c){ return c.header; })];
        if(!opts.template && camp){
          (camp[def.coll] || []).forEach(function(item){ if(item) aoa.push(_worldExportRow(item, cols, camp, A)); });
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), def.sheet);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_worldReferenceAOA(A)), 'Reference');
      var meta = [
        ['formatVersion', WORLDIO.FORMAT_VERSION],
        ['exportedAtTurn', (camp && (camp.currentTurn != null ? camp.currentTurn : camp.turn)) || ''],
        ['campaignName', (camp && camp.name) || '']
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), '_meta');
      return wb;
    },

    // ════════════════════════ IMPORT (plan §5) ════════════════════════
    async worldOnFilePicked(ev){
      var file = ev && ev.target && ev.target.files && ev.target.files[0];
      if(ev && ev.target) ev.target.value = '';                  // reset so re-picking the same file fires
      if(!file) return;
      if(!this.currentCampaign){ this.showToast('Open or create a campaign first.'); return; }
      this.worldIO.error = ''; this.worldIO.loading = true; this.worldIO.preview = null; this.worldIO.fileName = file.name;
      try {
        var XLSX = await this._worldEnsureXLSX();
        var wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        this.worldIO.preview = this._worldPlanImport(XLSX, wb);
      } catch(e){
        this.worldIO.error = e.message || String(e);
        this.showToast('Import failed: ' + this.worldIO.error, 6000);
      } finally {
        this.worldIO.loading = false;
      }
    },

    // Parse + normalize + validate + resolve → a planned diff. Nothing mutates.
    _worldPlanImport(XLSX, wb){
      var A = window.ACKS, camp = this.currentCampaign;
      // Sheet name lookup (case/space-insensitive).
      var byNorm = {}; (wb.SheetNames || []).forEach(function(n){ byNorm[_norm(n)] = n; });

      // Indexes over EXISTING campaign state (the sheet rows are folded in below as they parse).
      var domainByKey = {};   // norm(name) | id → existing domain
      (camp.domains || []).forEach(function(d){ if(!d) return; if(d.id) domainByKey[d.id] = d; if(d.name) domainByKey[_norm(d.name)] = d; });
      var hexByCoord = {};    // "col,row" → existing hex
      (camp.hexes || []).forEach(function(h){ if(h && h.coord){ var cr = A.hexAxialToColRow(h.coord.q, h.coord.r); hexByCoord[cr.col + ',' + cr.row] = h; } });
      var hexById = {}; (camp.hexes || []).forEach(function(h){ if(h && h.id) hexById[h.id] = h; });

      // The set of domain NAMES that WILL exist after import (existing ∪ sheet) — for Liege/Domain resolution.
      var plannedDomainNames = {};   // norm(name) → true ; ids too
      Object.keys(domainByKey).forEach(function(k){ plannedDomainNames[k] = true; });
      // The set of hex coords that WILL exist (existing ∪ Hexes sheet) — for Settlement/Lair resolution.
      var plannedHexCoords = {}; Object.keys(hexByCoord).forEach(function(k){ plannedHexCoords[k] = true; });

      var out = { meta: _worldReadMeta(XLSX, wb, byNorm), sheets: [], hasBlockingErrors: false };

      // First pass — parse every sheet's rows so cross-sheet references can resolve.
      WORLDIO.SHEETS.forEach(function(def){
        var realName = byNorm[_norm(def.sheet)];
        var cols = A.schemaToImportColumns(def.kind);
        var sheetRes = { sheet: def.sheet, kind: def.kind, coll: def.coll, label: def.label, columns: cols, rows: [], unknownColumns: [], present: !!realName };
        if(realName){
          var aoa = XLSX.utils.sheet_to_json(wb.Sheets[realName], { header: 1, blankrows: false, defval: null });
          _worldParseSheet(aoa, cols, sheetRes, A);
        }
        // Register sheet-declared keys so later sheets / the same sheet's refs resolve.
        sheetRes.rows.forEach(function(r){
          if(def.kind === 'domain'){ if(r.name) plannedDomainNames[_norm(r.name)] = true; if(r.idVal) plannedDomainNames[r.idVal] = true; }
          if(def.kind === 'hex' && r.coords.coord){ var c = r.coords.coord; plannedHexCoords[c.col + ',' + c.row] = true; }
        });
        out.sheets.push(sheetRes);
      });

      // Second pass — resolve references + classify (create/update/skip) against existing state.
      out.sheets.forEach(function(sheetRes){
        var def = WORLDIO.SHEETS.find(function(d){ return d.kind === sheetRes.kind; });
        sheetRes.rows.forEach(function(r){
          // cross-ref resolution (hard errors on unresolved — OQ2)
          if(sheetRes.kind === 'hex' && r.idRefs.domainId != null){
            if(!plannedDomainNames[_norm(r.idRefs.domainId)] && !plannedDomainNames[r.idRefs.domainId]){
              r.errors.push('Domain “' + r.idRefs.domainId + '” not found (no such domain in the workbook or campaign)');
            }
          }
          if(sheetRes.kind === 'domain' && r.idRefs.liegeId != null){
            if(!plannedDomainNames[_norm(r.idRefs.liegeId)] && !plannedDomainNames[r.idRefs.liegeId]){
              r.errors.push('Liege “' + r.idRefs.liegeId + '” not found');
            }
          }
          if((sheetRes.kind === 'settlement' || sheetRes.kind === 'lair') && r.hexRefs.hexId){
            var c = r.hexRefs.hexId, key = c.col + ',' + c.row;
            // a lair may be unplaced (blank coord ⇒ dynamic pool) — only a PARTIAL/unresolved coord errors
            if(!plannedHexCoords[key]) r.errors.push('Hex ' + A.hexDisplayLabel(A.hexColRowToAxial(c.col, c.row).q, A.hexColRowToAxial(c.col, c.row).r) + ' (' + c.col + ',' + c.row + ') not found');
          }
          // existence (the upsert target) — used by the live action getter
          r.exists = _worldTargetExists(sheetRes.kind, r, { domainByKey: domainByKey, hexByCoord: hexByCoord, hexById: hexById, camp: camp, A: A });
        });
      });
      out.hasBlockingErrors = out.sheets.some(function(s){ return s.rows.some(function(r){ return r.errors.length; }); });
      return out;
    },

    // Live per-row action (depends on the create-only/upsert toggle, so a mode flip just re-renders).
    worldRowAction(row){
      if(row.errors && row.errors.length) return 'skip-error';
      if(row.exists) return (this.worldIO.mode === 'create') ? 'skip-exists' : 'update';
      return 'create';
    },
    worldSheetTally(sheetRes){
      var self = this, t = { create:0, update:0, skip:0, error:0 };
      (sheetRes.rows || []).forEach(function(r){
        var a = self.worldRowAction(r);
        if(a === 'create') t.create++; else if(a === 'update') t.update++;
        else if(a === 'skip-error') t.error++; else t.skip++;
      });
      return t;
    },
    worldPreviewRowsWithIssues(){
      var out = [];
      (this.worldIO.preview ? this.worldIO.preview.sheets : []).forEach(function(s){
        s.rows.forEach(function(r){
          if(r.errors.length || r.warnings.length) out.push({ sheet: s.sheet, rowNum: r.rowNum, errors: r.errors, warnings: r.warnings });
        });
        s.unknownColumns.forEach(function(h){ out.push({ sheet: s.sheet, rowNum: '(header)', errors: [], warnings: ['Unknown column “' + h + '” — ignored'] }); });
      });
      return out;
    },
    worldCancelImport(){ this.worldIO.preview = null; this.worldIO.fileName = ''; this.worldIO.error = ''; this.worldIO.showErrors = false; },

    // ── Commit (plan §5 step 6) — dependency-ordered, single pass; only valid rows land. ──
    worldCommitImport(){
      var pv = this.worldIO.preview; if(!pv) return;
      var A = window.ACKS, camp = this.currentCampaign, self = this;
      ['domains','hexes','settlements','lairs'].forEach(function(k){ if(!Array.isArray(camp[k])) camp[k] = []; });
      var touchedDomainIds = {}, counts = { domains:0, hexes:0, settlements:0, lairs:0 };

      var sheetOf = function(kind){ return pv.sheets.find(function(s){ return s.kind === kind; }) || { rows: [] }; };
      var actionable = function(row){ var a = self.worldRowAction(row); return a === 'create' || a === 'update'; };

      // 1) DOMAINS — create/upsert, then a second pass wires liegeId from the resolved name→domain map.
      var domainByKey = {};
      (camp.domains || []).forEach(function(d){ if(!d) return; if(d.id) domainByKey[d.id] = d; if(d.name) domainByKey[_norm(d.name)] = d; });
      var domainRows = sheetOf('domain').rows.filter(actionable);
      domainRows.forEach(function(r){
        var existing = (r.idVal && domainByKey[r.idVal]) || (r.name && domainByKey[_norm(r.name)]) || null;
        var d = existing || window.ACKS.blankDomain({ id: r.idVal || undefined, name: r.name || 'New Domain' });
        _worldApplyScalars(d, r, sheetOf('domain').columns);   // sets demographics.*, treasury.gp, taxPolicy.rate, type, isRealm, geography.primaryHex, …
        if(!existing){ self.upsertDomain(d); counts.domains++; } else { counts.domains++; }
        domainByKey[d.id] = d; if(d.name) domainByKey[_norm(d.name)] = d;
        r._committed = d; touchedDomainIds[d.id] = true;
      });
      // wire liege (two-pass: a vassal listed before its liege still links)
      domainRows.forEach(function(r){
        if(r._committed && r.idRefs.liegeId != null){
          var liege = domainByKey[r.idRefs.liegeId] || domainByKey[_norm(r.idRefs.liegeId)] || null;
          r._committed.liegeId = liege ? liege.id : r._committed.liegeId;
        }
      });
      // recompute vassalIds from the liege links
      (camp.domains || []).forEach(function(d){ if(d) d.vassalIds = (camp.domains || []).filter(function(x){ return x && x.liegeId === d.id; }).map(function(x){ return x.id; }); });

      // 2) HEXES — mint/upsert; set coord + the lazy domainId from the resolved Domain ref.
      var hexByCoord = {}, hexById = {};
      (camp.hexes || []).forEach(function(h){ if(!h) return; if(h.id) hexById[h.id] = h; if(h.coord){ var cr = A.hexAxialToColRow(h.coord.q, h.coord.r); hexByCoord[cr.col + ',' + cr.row] = h; } });
      sheetOf('hex').rows.filter(actionable).forEach(function(r){
        var coord = r.coords.coord;                       // {col,row} when present
        var existing = (r.idVal && hexById[r.idVal]) || (coord && hexByCoord[coord.col + ',' + coord.row]) || null;
        var h = existing || window.ACKS.blankHex({ id: r.idVal || undefined, coord: coord ? A.hexColRowToAxial(coord.col, coord.row) : undefined });
        if(!existing && coord) h.coord = A.hexColRowToAxial(coord.col, coord.row);
        _worldApplyScalars(h, r, sheetOf('hex').columns);
        // lazy domainId (the Domain column)
        if(r.idRefs.domainId != null){
          var dm = domainByKey[r.idRefs.domainId] || domainByKey[_norm(r.idRefs.domainId)] || null;
          if(dm){ h.domainId = dm.id; touchedDomainIds[dm.id] = true; }
        }
        if(!existing){ camp.hexes.push(h); counts.hexes++; } else counts.hexes++;
        if(h.id) hexById[h.id] = h; if(h.coord){ var cr2 = A.hexAxialToColRow(h.coord.q, h.coord.r); hexByCoord[cr2.col + ',' + cr2.row] = h; }
        r._committed = h;
      });

      // 3) SETTLEMENTS — mint/upsert; assign the resolved hexId (domain inherited from the hex).
      sheetOf('settlement').rows.filter(actionable).forEach(function(r){
        var hex = _worldResolveHex(r.hexRefs.hexId, hexByCoord); if(!hex && !r.idVal) return;
        var existing = r.idVal ? (camp.settlements.find(function(s){ return s && s.id === r.idVal; }) || null)
                               : (hex ? (camp.settlements.find(function(s){ return s && s.hexId === hex.id; }) || null) : null);
        var st = existing || window.ACKS.blankSettlement({ id: r.idVal || undefined, hexId: hex ? hex.id : null });
        if(hex) st.hexId = hex.id;
        _worldApplyScalars(st, r, sheetOf('settlement').columns);
        if(!existing){ camp.settlements.push(st); counts.settlements++; } else counts.settlements++;
        r._committed = st;
      });

      // 4) LAIRS — mint/upsert by Id, else append; a blank coord ⇒ a dynamic (unplaced) lair.
      sheetOf('lair').rows.filter(actionable).forEach(function(r){
        var hex = _worldResolveHex(r.hexRefs.hexId, hexByCoord);
        var existing = r.idVal ? (camp.lairs.find(function(l){ return l && l.id === r.idVal; }) || null) : null;
        var lr = existing || window.ACKS.blankLair({ id: r.idVal || undefined, hexId: hex ? hex.id : null, status: hex ? 'active' : 'dynamic' });
        if(hex) lr.hexId = hex.id;
        _worldApplyScalars(lr, r, sheetOf('lair').columns);
        if(!existing){ camp.lairs.push(lr); counts.lairs++; } else counts.lairs++;
        r._committed = lr;
      });

      // Reconcile each touched domain's geography aggregates from the hex.domainId claims (classification derives).
      Object.keys(touchedDomainIds).forEach(function(did){
        var d = (camp.domains || []).find(function(x){ return x && x.id === did; }); if(!d) return;
        var hexes = (typeof A.hexesForDomain === 'function') ? (A.hexesForDomain(camp, did) || []) : (camp.hexes || []).filter(function(h){ return h && h.domainId === did; });
        if(!d.geography || typeof d.geography !== 'object') d.geography = {};
        d.geography.controlledHexList = hexes.map(function(h){ return h.id; });
        d.geography.controlledHexes = hexes.length;
      });

      this.markDirty(); this.schedulePersist();
      if(this.currentCampaign && !this.selectedDomainId && this.domains && this.domains.length) this.selectedDomainId = this.domains[0].id;
      var parts = [];
      ['domains','hexes','settlements','lairs'].forEach(function(k){ if(counts[k]) parts.push(counts[k] + ' ' + k); });
      this.showToast(parts.length ? ('Imported ' + parts.join(', ') + '.') : 'Nothing to import.', 6000);
      this.worldCancelImport();
    },

    // ── Downloadable validation report (plan §7 / XLS-4) ──
    worldDownloadReport(){
      var pv = this.worldIO.preview; if(!pv) return;
      var lines = ['ACKS World Import — validation report', 'File: ' + (this.worldIO.fileName || '?'), 'Mode: ' + (this.worldIO.mode === 'create' ? 'Create-only' : 'Update existing'), ''];
      var self = this;
      pv.sheets.forEach(function(s){
        var t = self.worldSheetTally(s);
        lines.push('=== ' + s.sheet + ' — ' + t.create + ' new · ' + t.update + ' update · ' + t.skip + ' skip · ' + t.error + ' error ===');
        s.unknownColumns.forEach(function(h){ lines.push('  [warn] unknown column “' + h + '” — ignored'); });
        s.rows.forEach(function(r){
          r.errors.forEach(function(e){ lines.push('  ' + s.sheet + '!R' + r.rowNum + ' [ERROR] ' + e); });
          r.warnings.forEach(function(w){ lines.push('  ' + s.sheet + '!R' + r.rowNum + ' [warn] ' + w); });
        });
        lines.push('');
      });
      if(typeof this.downloadJSON === 'function'){
        var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'acks-import-report.txt';
        document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 100);
      }
    }

  });

  // ─── Parse one sheet's array-of-arrays into validated row records ───
  // aoa[0] = headers. Each row → { rowNum, idVal, name, values:{path→val}, coords:{path→{col,row}},
  //   hexRefs:{path→{col,row}}, idRefs:{path→raw}, errors:[], warnings:[], exists }.
  function _worldParseSheet(aoa, cols, sheetRes, A){
    if(!aoa || !aoa.length) return;
    var headers = (aoa[0] || []).map(function(h){ return String(h == null ? '' : h).trim(); });
    var headerNorm = headers.map(_norm);
    // map each column descriptor → its source cell index (by normalized header)
    cols.forEach(function(c){ c._idx = headerNorm.indexOf(_norm(c.header)); });
    // unknown columns (present in the sheet, not in the projection)
    var known = {}; cols.forEach(function(c){ known[_norm(c.header)] = true; });
    headers.forEach(function(h){ if(h && !known[_norm(h)]) sheetRes.unknownColumns.push(h); });

    for(var ri = 1; ri < aoa.length; ri++){
      var raw = aoa[ri]; if(!raw) continue;
      // skip fully-empty rows
      if(raw.every(function(v){ return _blank(v); })) continue;
      var rec = { rowNum: ri + 1, idVal: null, name: null, values: {}, coords: {}, hexRefs: {}, idRefs: {}, errors: [], warnings: [], exists: false };
      // group coord pairs by field path
      var coordCells = {};   // path → {col?, row?}
      cols.forEach(function(c){
        if(c._idx < 0) return;
        var cell = raw[c._idx];
        if(c.role === 'id'){ var idv = _coerce(cell, 'string'); if(idv) rec.idVal = idv; return; }
        if(c.role === 'coord' || c.role === 'hexRef'){
          var iv = _int(cell);
          if(iv != null && isNaN(iv)){ rec.errors.push(c.header + ' must be a whole number'); return; }
          if(iv != null){ coordCells[c.field] = coordCells[c.field] || {}; coordCells[c.field][c.axis] = iv; coordCells[c.field]._role = c.role; coordCells[c.field]._header = (c.header || '').replace(/(Col|Row)$/, ''); }
          return;
        }
        if(c.role === 'idRef'){ var rv = _coerce(cell, 'string'); if(rv != null) rec.idRefs[c.field] = rv; return; }
        if(c.role === 'enum'){
          var legal = (c.enumValues && c.enumValues.length) ? c.enumValues
            : (c.enumSource === 'subtypesForTerrain' ? A.resolveEnumSource('subtypesForTerrain', rec.values.terrain) : A.resolveEnumSource(c.enumSource));
          var res = _checkEnum(cell, legal);
          if(res.error) rec.errors.push(c.header + ': ' + res.error);
          else if(res.value != null){ rec.values[c.field] = res.value; if(res.warning) rec.warnings.push(c.header + ': ' + res.warning); }
          return;
        }
        // scalar
        var v = _coerce(cell, c.type);
        if(typeof v === 'number' && isNaN(v)){ rec.errors.push(c.header + ' must be a number'); return; }
        if(v != null){
          if((c.type === 'number' || c.type === 'gp') && v < 0) rec.warnings.push(c.header + ' is negative (' + v + ')');
          rec.values[c.field] = v;
          if(c.field === 'name') rec.name = v;
        }
      });
      // finalize coord pairs
      Object.keys(coordCells).forEach(function(path){
        var cc = coordCells[path];
        var hasCol = cc.col != null, hasRow = cc.row != null;
        if(!hasCol && !hasRow) return;                          // both blank → no coord (ok)
        if(hasCol !== hasRow){ rec.errors.push((cc._header || 'Coord') + ' needs BOTH Col and Row'); return; }
        if(cc._role === 'hexRef') rec.hexRefs[path] = { col: cc.col, row: cc.row };
        else rec.coords[path] = { col: cc.col, row: cc.row };
      });
      // The Köppen lever: Koppen set + Terrain blank ⇒ fill terrain (+ subtype) from the first suggestion.
      if(rec.values.koppen && !rec.values.terrain){
        var sug = (A.koppenSuggestions(rec.values.koppen) || [])[0];
        if(sug && sug.terrain){ rec.values.terrain = sug.terrain; if(sug.subtype && !rec.values.terrainSubtype) rec.values.terrainSubtype = sug.subtype; rec.warnings.push('Terrain filled from Köppen ' + rec.values.koppen + ' → ' + sug.terrain + (sug.subtype ? ('/' + sug.subtype) : '')); }
      }
      // Required-field check (from the schema columns).
      cols.forEach(function(c){
        if(!c.required) return;
        if(c.role === 'coord'){ if(!rec.coords[c.field]) rec.errors.push((c.header || '').replace(/(Col|Row)$/,'') + ' (coordinate) is required'); }
        else if(c.role === 'idRef'){ if(rec.idRefs[c.field] == null) rec.errors.push(c.header + ' is required'); }
        else if(c.role !== 'id' && c.role !== 'hexRef'){ if(rec.values[c.field] == null) rec.errors.push(c.header + ' is required'); }
      });
      sheetRes.rows.push(rec);
    }
  }

  // Does an upsert target already exist for this row?
  function _worldTargetExists(kind, r, ctx){
    if(kind === 'domain') return !!((r.idVal && ctx.domainByKey[r.idVal]) || (r.name && ctx.domainByKey[_norm(r.name)]));
    if(kind === 'hex'){ var c = r.coords.coord; return !!((r.idVal && ctx.hexById[r.idVal]) || (c && ctx.hexByCoord[c.col + ',' + c.row])); }
    if(kind === 'settlement'){
      if(r.idVal) return (ctx.camp.settlements || []).some(function(s){ return s && s.id === r.idVal; });
      var hx = _worldResolveHex(r.hexRefs.hexId, ctx.hexByCoord);
      return !!(hx && (ctx.camp.settlements || []).some(function(s){ return s && s.hexId === hx.id; }));
    }
    if(kind === 'lair') return !!(r.idVal && (ctx.camp.lairs || []).some(function(l){ return l && l.id === r.idVal; }));
    return false;
  }
  function _worldResolveHex(ref, hexByCoord){ return ref ? (hexByCoord[ref.col + ',' + ref.row] || null) : null; }

  // Apply a row's scalar/enum/coord values onto a (new or existing) entity — only columns PRESENT in
  // the row produce a value, so an upsert touches only those columns (idempotent re-import, plan §8).
  // idRef / hexRef / id columns are wired by the kind-specific commit code (refs resolved there).
  function _worldApplyScalars(entity, r, cols){
    cols.forEach(function(c){
      if(c.role === 'scalar' || c.role === 'enum'){ if(r.values[c.field] != null) _setPath(entity, c.field, r.values[c.field]); }
      else if(c.role === 'coord'){ var cc = r.coords[c.field]; if(cc) _setPath(entity, c.field, window.ACKS.hexColRowToAxial(cc.col, cc.row)); }
    });
  }

  // ─── Export one entity → an ordered cell array matching the column projection ───
  function _worldExportRow(item, cols, camp, A){
    return cols.map(function(c){
      if(c.role === 'id') return item.id || '';
      if(c.role === 'scalar' || c.role === 'enum'){ var v = _getPath(item, c.field); return v == null ? '' : v; }
      if(c.role === 'coord'){
        var coord = _getPath(item, c.field); if(!coord || coord.q == null) return '';
        var cr = A.hexAxialToColRow(coord.q, coord.r); return (c.axis === 'row') ? cr.row : cr.col;
      }
      if(c.role === 'hexRef'){
        var hid = _getPath(item, c.field); var hx = hid ? (camp.hexes || []).find(function(h){ return h && h.id === hid; }) : null;
        if(!hx || !hx.coord) return ''; var cr2 = A.hexAxialToColRow(hx.coord.q, hx.coord.r); return (c.axis === 'row') ? cr2.row : cr2.col;
      }
      if(c.role === 'idRef'){
        var id = _getPath(item, c.field) || (c.lazy ? item[c.field] : null); if(!id) return '';
        if(c.idKind === 'domain'){ var d = (camp.domains || []).find(function(x){ return x && x.id === id; }); return d ? d.name : id; }
        return id;   // character/other refs export the raw id (resolved by id on re-import)
      }
      return '';
    });
  }

  // ─── The Reference sheet — generated live from the same enumSource pointers (can't drift) ───
  function _worldReferenceAOA(A){
    var rows = [['Reference only — ignored on import. Legal values for the coded columns.'], []];
    var seen = {};
    WORLDIO.SHEETS.forEach(function(def){
      A.schemaToImportColumns(def.kind).forEach(function(col){
        if(col.role !== 'enum' || col.enumSource === 'subtypesForTerrain') return;
        if(seen[col.header]) return; seen[col.header] = true;
        var legal = (col.enumValues && col.enumValues.length) ? col.enumValues : A.resolveEnumSource(col.enumSource);
        rows.push([col.header, (legal || []).join(', ')]);
      });
    });
    (A.TERRAIN_BASES || []).forEach(function(b){ var subs = A.resolveEnumSource('subtypesForTerrain', b); rows.push(['Subtype · ' + b, subs.join(', ') || '(none)']); });
    rows.push([]);
    rows.push(['Coordinates', 'Each hex is addressed by two integer columns: Col + Row (the GM-facing hex number).']);
    rows.push(['Id column', 'Leave blank to CREATE a new entity; fill it (e.g. from an export) to UPDATE that entity.']);
    rows.push(['References', 'Domain / Liege / Hex columns accept a Name or an Id.']);
    rows.push(['Köppen lever', 'Set Koppen and leave Terrain blank → the importer fills Terrain (and Subtype) from the climate.']);
    return rows;
  }

  // ─── _meta sheet read ───
  function _worldReadMeta(XLSX, wb, byNorm){
    var name = byNorm['_meta'] || byNorm['meta']; if(!name) return null;
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null });
    var meta = {}; (aoa || []).forEach(function(r){ if(r && r[0] != null) meta[String(r[0]).trim()] = r[1]; });
    return meta;
  }

})();
