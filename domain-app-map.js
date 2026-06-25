/* =============================================================================
 * domain-app-map.js — ACKS God Mode app mixin: Map Mode UI
 * =============================================================================
 *
 * Map Mode UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  // === @b14-politics     (team) — Politics P-5 generative Senate Wizard (materialize a populated senate): state + methods ===
  // Weather HW-3 (team agent-2): the map weather-layer toggle + read helpers. The overlay/legend/
  // hex-card line read the generated weather via window.ACKS (acks-engine-weather.js). Not persisted
  // (defaults off each session — kept out of the shared session-restore region).
  mapShowWeather: false,

  // ─── #225 Map Mode (M0–M2, 2026-06-02) — SVG hex map state + methods ───────
  // The map is a PURE VIEW over the campaign's hexes (Architecture §11; the geometry +
  // fill-layer math lives in the engine, acks-engine-subsystems.js §9.7). All viewport state
  // here is EPHEMERAL — persisted to the session cache (localStorage) only, never to the
  // .acks.json (plan §8). Clicking a hex reuses the EXISTING hex card (openHexDetail) — no
  // second hex editor. The click dispatch is mode-aware (inspect vs select) so a later
  // Journey-planner / generation-wizard can reuse the map as a hex PICKER with no rework.
  MAP_HEX_SIZE: 40,          // mirrors engine MAP_DEFAULT_HEX_SIZE; internal SVG units.
  mapFillLayer: 'terrain',   // active "Color by:" layer (terrain|domain|land-value|classification)
  mapMode: 'inspect',        // 'inspect' (click→hex card) | 'select' (click→hand id to a caller)
  mapViewBox: null,          // {x,y,w,h} — the SVG viewBox; null = not yet fitted
  _mapPan: null,             // in-flight drag-pan bookkeeping
  _mapDragged: false,        // set true once a drag moves; suppresses the trailing @click
  _mapSelectCb: null,        // select-mode callback (hexId, entry) => void
  _mapSelectHint: '',        // banner text shown while in select mode
  // M3–M6 layer toggles (symbols / edges / journeys / empty-cells), persisted in mapPrefs.
  mapSymbolToggles: { settlements:true, strongholds:true, lairs:true, dungeons:true, pois:true },
  mapEdgeToggles:   { borders:true, roads:true, rivers:true, trails:false },
  mapShowJourneys: true,
  mapEditAddMode: false,     // M5 — "Add/Edit hexes": faint addable empty cells + click an existing hex to edit it
  mapCreateAt: null,         // {q,r} when the create/edit-hex picker is open
  mapEditHexId: null,        // when the picker is editing an existing hex (vs creating); null = create
  mapCreateDomainId: '',     // chosen domain for the hex ('' = unclaimed wilderness)
  mapCreateTerrain: '',      // chosen terrain for the hex ('' = unset)
  mapCreateSubtype: '',      // terrain model — sub-type for the new/edited hex (contextual to the base; '' = any)
  mapCreateKoppen: '',       // terrain model — Köppen climate code for the new/edited hex ('' = unset)
  mapCreateRiverSides: [],   // #225 — hex sides (0..5) carrying a river (drawn along those edges; a movement barrier)
  mapCreateRoadSides: [],    // #225 — hex sides (0..5) the road reaches from the centre (with circular bends)
  mapCreateCrossingSides: [], // #225 — river sides (0..5) carrying a ford/bridge (negates the barrier); road×river is an implicit bridge
  // "Create Map" — lay out a blank W×H grid of unclaimed/unexplored hexes (world starter).
  mapGridModalOpen: false,
  mapGridCols: 10,
  mapGridRows: 10,
  mapGridStartCol: 1,
  mapGridStartRow: 1,

  // The render set: one entry per hex with its polygon + center + the (domainId, hexIndex)
  // openHexDetail wants. Domain-nested hexes (allHexes()) carry those keys directly; domainless
  // wilderness hexes (campaign.hexes[] with no domain match) render too and open the full hex
  // card by id (worldHexEditingHex resolves them via campaign.hexes — domainId/hexIndex are null).
  mapHexEntries(){
    const size = this.MAP_HEX_SIZE, A = window.ACKS;
    const out = [], seen = new Set();
    // HW-4 (team agent-3): the 6-mile (regional) view shows REGIONAL hexes only. Continental (24-mile)
    // aggregation cells render via mapContinentalMarkup; the local (1.5-mile) tier is a drill-down (HW-5).
    // hexScaleOf defaults to 'regional' for any unset/legacy hex, so existing campaigns are unchanged.
    const isRegional = h => !A.hexScaleOf || A.hexScaleOf(h) === 'regional';
    this.allHexes().forEach(e => {
      const h = e.hex; if(!h || !h.coord || !isRegional(h)) return;
      seen.add(h.id);
      const c = A.hexAxialToPixel(h.coord.q, h.coord.r, size);
      out.push({ hex:h, domainId:e.domainId, domainName:e.domainName, hexIndex:e.hexIndex,
                 cx:c.x, cy:c.y, points:A.hexPolygonPoints(h.coord.q, h.coord.r, size),
                 label:A.hexDisplayLabel(h.coord.q, h.coord.r), domainless:false });
    });
    (this.currentCampaign?.hexes||[]).forEach(h => {
      if(!h || !h.coord || seen.has(h.id) || !isRegional(h)) return;
      const c = A.hexAxialToPixel(h.coord.q, h.coord.r, size);
      out.push({ hex:h, domainId:h.domainId||null, domainName:null, hexIndex:-1,
                 cx:c.x, cy:c.y, points:A.hexPolygonPoints(h.coord.q, h.coord.r, size),
                 label:A.hexDisplayLabel(h.coord.q, h.coord.r), domainless:true });
    });
    return out;
  },
  mapFill(hex){ return window.ACKS.hexFillColor(hex, this.mapFillLayer, this.mapFillContext()); },
  mapFillLayers(){ return window.ACKS.hexFillLayers(); },
  mapSymbolLayers(){ return window.ACKS.mapSymbolLayers(); },
  mapEdgeLayers(){ return window.ACKS.mapEdgeLayers(); },
  mapTerrainTypes(){ return window.ACKS.mapTerrainTypes(); },
  mapLegend(){ return window.ACKS.hexFillLegend(this.mapFillLayer, this.domains); },
  // Per-domain aggregates for the domain-aware fills (secured/morale) — the engine has no campaign
  // reference, so the UI precomputes these and hands them to hexFillColor as ctx (computed once/render).
  mapFillContext(){
    const securedStateByDomain = {}, moraleByDomain = {};
    (this.domains || []).forEach(d => {
      securedStateByDomain[d.id] = this.strongholdState(d);
      moraleByDomain[d.id] = (d.demographics && d.demographics.morale) || 0;
    });
    return { securedStateByDomain, moraleByDomain };
  },
  mapHexTitle(entry){
    const h = entry.hex;
    const bits = [hexLabelFor(h) || entry.label];      // canonical hex name (Architecture §11.3)
    const _s = settlementAtHexG(h);   // T6 single-home
    if(_s && _s.name && h.terrain) bits.push(h.terrain); // terrain isn't in the name → show it
    bits.push(entry.domainName || (entry.domainless ? 'unclaimed' : ''));
    if(h.valuePerFamily != null) bits.push(h.valuePerFamily + ' gp/family');
    return bits.filter(Boolean).join('  ·  ');
  },
  // Build the full SVG inner markup (all hexes) as a string for x-html. Re-renders reactively
  // when the hex set or active fill layer changes (both read here). Each polygon carries
  // data-hex-id so the delegated click handler (mapSvgClick) can resolve which hex was clicked.
  mapSvgMarkup(){
    // HW-4 (team agent-3): at the continental (24-mile) scale the map renders the aggregated region
    // cells, not the 6-mile hexes. Branch out before the regional render.
    if(this.mapScale === 'continental') return this.mapContinentalMarkup();
    // HW-5 (team agent-6): at the local (1.5-mile) scale the map renders ONE 6-mile hex's drill-down —
    // its authored sub-hexes + the addable nesting-grid cells (mapLocalMarkup), not the whole 6-mile map.
    if(this.mapScale === 'local') return this.mapLocalMarkup();
    const size = this.MAP_HEX_SIZE, A = window.ACKS;
    const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const entries = this.mapHexEntries();
    const ctx = this.mapFillContext();
    const layer = this.mapFillLayer;
    const sw = (size * 0.04).toFixed(2), labelFs = (size * 0.22).toFixed(1);
    const deltas = A.hexNeighborDeltas();
    const byCoord = {};
    entries.forEach(e => { byCoord[e.hex.coord.q + ',' + e.hex.coord.r] = e; });
    const parts = [];

    // 1) FILLS (bottom) — clickable hex polygons.
    entries.forEach(e => {
      parts.push('<polygon data-hex-id="' + esc(e.hex.id) + '" points="' + e.points + '" fill="' + A.hexFillColor(e.hex, layer, ctx) + '" ' +
        'stroke="#4b3f2f" stroke-width="' + sw + '" style="cursor:pointer;transition:fill .15s;"><title>' + esc(this.mapHexTitle(e)) + '</title></polygon>');
    });

    // 1.5) WEATHER OVERLAY (HW-3, team agent-2) — a translucent fill per hex by its 24-mile region's
    // current-day weather (the JJ pp.40–41 generator), sitting ABOVE the terrain fill and BELOW the
    // features (edges/journeys/symbols draw over it). pointer-events:none so clicks fall through to the
    // base hex polygon. The region → weather map is built ONCE per render (cache-preferring).
    if(this.mapShowWeather){
      const wmap = A.weatherMapForCampaign(this.currentCampaign);
      entries.forEach(e => {
        const wr = wmap[A.regionKeyForCoord(e.hex.coord)];
        if(!wr) return;
        parts.push('<polygon points="' + e.points + '" fill="' + A.weatherFillColor(wr) + '" fill-opacity="0.55" style="pointer-events:none;"><title>' + esc(A.weatherSummaryText(wr)) + '</title></polygon>');
      });
    }

    // 2) EMPTY CELLS (M5) — faint addable hexes (click → create-hex picker).
    if(this.mapEditAddMode){
      this.mapEmptyCells().forEach(c => {
        parts.push('<polygon data-empty-q="' + c.q + '" data-empty-r="' + c.r + '" points="' + c.points + '" fill="#000000" fill-opacity="0.04" ' +
          'stroke="#4b3f2f" stroke-opacity="0.35" stroke-dasharray="' + (size*0.12).toFixed(1) + ',' + (size*0.08).toFixed(1) + '" stroke-width="' + sw + '" style="cursor:copy;"><title>Add a hex here (' + esc(c.label) + ')</title></polygon>');
      });
    }

    // 3) EDGES (M4) — domain borders (inset, so adjacent realms each show their own) + road/river/trail networks.
    const edgeMid = (q, r, i) => { const p = A.hexEdgePoints(q, r, size, i); return { x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2 }; };
    const inset = (p, c, f) => ({ x: c.x + (p.x - c.x) * (1 - f), y: c.y + (p.y - c.y) * (1 - f) });
    entries.forEach(e => {
      const q = e.hex.coord.q, r = e.hex.coord.r, c = { x:e.cx, y:e.cy };
      if(this.mapEdgeToggles.borders && e.hex.domainId){
        deltas.forEach((d, i) => {
          const nb = byCoord[(q+d[0]) + ',' + (r+d[1])];
          if(nb && nb.hex.domainId === e.hex.domainId) return; // interior edge — skip
          const ep = A.hexEdgePoints(q, r, size, i), a = inset(ep[0], c, 0.07), b = inset(ep[1], c, 0.07);
          parts.push('<line x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+b.x.toFixed(1)+'" y2="'+b.y.toFixed(1)+'" stroke="#3b2f1c" stroke-width="'+(size*0.07).toFixed(2)+'" stroke-linecap="round" style="pointer-events:none;"/>');
        });
      }
      const net = (color, width, dash) => (flag) => deltas.forEach((d, i) => {
        const nb = byCoord[(q+d[0]) + ',' + (r+d[1])];
        if(!nb || !flag(nb.hex)) return;
        const m = edgeMid(q, r, i);
        parts.push('<line x1="'+c.x.toFixed(1)+'" y1="'+c.y.toFixed(1)+'" x2="'+m.x.toFixed(1)+'" y2="'+m.y.toFixed(1)+'" stroke="'+color+'" stroke-width="'+width+'" stroke-linecap="round"'+(dash?' stroke-dasharray="'+dash+'"':'')+' style="pointer-events:none;"/>');
      });
      // ROADS — prefer the GM-drawn per-side geometry (#225: centre → chosen sides, faintly circular
      // bends); fall back to the legacy auto-network (spokes toward like-roaded neighbours) for hexes
      // carrying only the legacy hasRoad flag. roadSides is CARTOGRAPHIC and independent of hasRoad
      // (the coarse travel flag); hex-by-hex journeys will derive the road bonus from roadSides
      // (Phase_2.5_Journeys_Plan §24). They don't connect through the legacy network — by design.
      if(this.mapEdgeToggles.roads){
        const rs = e.hex.roadSides || [];
        if(rs.length){
          const dd = A.hexRoadPathD(q, r, size, rs);
          if(dd) parts.push('<path d="'+dd+'" fill="none" stroke="#6b4a2b" stroke-width="'+(size*0.09).toFixed(2)+'" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"/>');
          if(rs.length >= 3) parts.push('<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="'+(size*0.07).toFixed(2)+'" fill="#6b4a2b" style="pointer-events:none;"/>');
        } else if(e.hex.hasRoad){
          net('#6b4a2b', (size*0.08).toFixed(2), '')(h => h.hasRoad);
        }
      }
      if(this.mapEdgeToggles.trails && e.hex.hasTrail) net('#8a6d3b', (size*0.05).toFixed(2), (size*0.10).toFixed(1)+','+(size*0.08).toFixed(1))(h => h.hasTrail);
      // RIVERS (#225) — drawn ALONG the chosen edges (a movement barrier). Plus CROSSINGS (ford/bridge):
      // a short brown mark across the river where the GM placed a ford/bridge (crossingSides) OR where a
      // road crosses the river edge (roadSides ∩ riverSides — an implicit bridge). The river BARRIER + the
      // RAW fording cost are documented for hex-by-hex journeys (Phase_2.5_Journeys_Plan §24), not yet wired.
      if(this.mapEdgeToggles.rivers){
        const vs = e.hex.riverSides || [], cross = e.hex.crossingSides || [], rsR = e.hex.roadSides || [];
        A.hexRiverSegments(q, r, size, vs).forEach(s => parts.push('<line x1="'+s.x1.toFixed(1)+'" y1="'+s.y1.toFixed(1)+'" x2="'+s.x2.toFixed(1)+'" y2="'+s.y2.toFixed(1)+'" stroke="#3f73b8" stroke-width="'+(size*0.09).toFixed(2)+'" stroke-linecap="round" style="pointer-events:none;"/>'));
        for(let i = 0; i < 6; i++){
          if(vs.includes(i) && (cross.includes(i) || rsR.includes(i))){
            const cs = A.hexCrossingSegment(q, r, size, i, size * 0.40);
            parts.push('<line x1="'+cs.x1.toFixed(1)+'" y1="'+cs.y1.toFixed(1)+'" x2="'+cs.x2.toFixed(1)+'" y2="'+cs.y2.toFixed(1)+'" stroke="#6b4a2b" stroke-width="'+(size*0.11).toFixed(2)+'" stroke-linecap="round" style="pointer-events:none;"/>');
          }
        }
      }
    });

    // 4) JOURNEY ROUTES (M6) — highlighted dashed polyline + a current-position ring. The Journeys layer
    // shows only CURRENTLY ACTIVE journeys (planning / in-transit / resting / lost — the activeJourneys()
    // set); a completed (arrived) or stopped (aborted) journey drops off the map. EXCEPT a journey the GM
    // is actively viewing (_journeyMapView, set by "View on map") is ALWAYS drawn regardless of status —
    // so jumping to any journey, even a finished one, shows it, even with the layer switched off.
    {
      const ACTIVE_J = ['planning','in-transit','resting','lost'];
      const allRoutes = this.mapJourneyRoutes();
      const routes = this.mapShowJourneys
        ? allRoutes.filter(rt => ACTIVE_J.includes(rt.status) || rt.id === this._journeyMapView)
        : allRoutes.filter(rt => rt.id === this._journeyMapView);
      // Arrowhead at the destination end of each route line. One shared <marker> (strokeWidth units so it
      // scales with the line + zoom; orient=auto points it along the final segment toward the destination).
      if(routes.length){
        parts.push('<defs><marker id="jrnArrowDest" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="#d9762b" fill-opacity="0.9"/></marker></defs>');
      }
      routes.forEach(rt => {
        if(rt.pts.length >= 2){
          const dd = rt.pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
          parts.push('<path d="'+dd+'" fill="none" stroke="#d9762b" stroke-width="'+(size*0.10).toFixed(2)+'" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="'+(size*0.18).toFixed(1)+','+(size*0.14).toFixed(1)+'" stroke-opacity="0.85" marker-end="url(#jrnArrowDest)" style="pointer-events:none;"><title>'+esc(rt.name)+'</title></path>');
        }
        if(rt.current){
          parts.push('<circle cx="'+rt.current.x.toFixed(1)+'" cy="'+rt.current.y.toFixed(1)+'" r="'+(size*0.15).toFixed(1)+'" fill="#d9762b" stroke="#fff" stroke-width="'+(size*0.03).toFixed(2)+'" style="pointer-events:none;"><title>'+esc(rt.name)+' (current position)</title></circle>');
        }
      });
    }

    // 5) SYMBOLS (M3) — glyphs on top; pointer-events:none so clicks fall through to the hex polygon.
    const T = this.mapSymbolToggles;
    entries.forEach(e => {
      const h = e.hex, cx = e.cx, cy = e.cy;
      const hSet = settlementAtHexG(h);   // T6 single-home
      if(T.settlements && hSet){
        const rr = (size * A.settlementGlyphScale(hSet.families || 0)).toFixed(1);
        parts.push('<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+rr+'" fill="#f3ecd8" stroke="#4b3f2f" stroke-width="'+(size*0.04).toFixed(2)+'" style="pointer-events:none;"/>');
      }
      if(T.strongholds && h.primaryStructure){
        parts.push('<text x="'+cx.toFixed(1)+'" y="'+(cy - size*0.03).toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="'+(size*0.34).toFixed(1)+'" style="pointer-events:none;user-select:none;">♜</text>');
      }
      const badges = [];
      if(T.lairs    && (h.lairs||[]).length)            badges.push('⚔' + (h.lairs.length > 1 ? h.lairs.length : ''));
      if(T.dungeons && (h.dungeons||[]).length)         badges.push('🏛' + (h.dungeons.length > 1 ? h.dungeons.length : ''));
      if(T.pois     && (h.pointsOfInterest||[]).length) badges.push('⛯' + (h.pointsOfInterest.length > 1 ? h.pointsOfInterest.length : ''));
      if(badges.length){
        parts.push('<text x="'+cx.toFixed(1)+'" y="'+(cy + size*0.5).toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="'+(size*0.2).toFixed(1)+'" style="pointer-events:none;user-select:none;">'+esc(badges.join(' '))+'</text>');
      }
    });

    // 6) LABELS (top) — RAW column-row, near the top edge so symbols own the centre.
    entries.forEach(e => {
      parts.push('<text x="'+e.cx.toFixed(1)+'" y="'+(e.cy - size*0.58).toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="'+labelFs+'" fill="#2b2b2b" fill-opacity="0.75" style="pointer-events:none;user-select:none;font-family:monospace;">'+esc(e.label)+'</text>');
    });

    // 7) JOURNEY-PLANNING PREVIEW (top, on demand) — the route being composed in a map pick
    // (waypoints/destination), drawn ON TOP and regardless of the Journeys layer toggle so the GM
    // watches the route form as they click (§24 picker). Start = green, destination = red, waypoints
    // = numbered sky-blue, connected by a sky dashed line.
    const plan = this.mapPlanningRoute();
    if(plan){
      if(plan.pts.length >= 2){
        const dd = plan.pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
        parts.push('<path d="'+dd+'" fill="none" stroke="#0284c7" stroke-width="'+(size*0.09).toFixed(2)+'" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="'+(size*0.16).toFixed(1)+','+(size*0.12).toFixed(1)+'" stroke-opacity="0.9" style="pointer-events:none;"/>');
      }
      if(plan.start){ parts.push('<circle cx="'+plan.start.x.toFixed(1)+'" cy="'+plan.start.y.toFixed(1)+'" r="'+(size*0.16).toFixed(1)+'" fill="#16a34a" stroke="#fff" stroke-width="'+(size*0.03).toFixed(2)+'" style="pointer-events:none;"><title>Start</title></circle>'); }
      if(plan.dest){ parts.push('<circle cx="'+plan.dest.x.toFixed(1)+'" cy="'+plan.dest.y.toFixed(1)+'" r="'+(size*0.16).toFixed(1)+'" fill="#dc2626" stroke="#fff" stroke-width="'+(size*0.03).toFixed(2)+'" style="pointer-events:none;"><title>Destination</title></circle>'); }
      plan.waypoints.forEach(wp => {
        parts.push('<circle cx="'+wp.x.toFixed(1)+'" cy="'+wp.y.toFixed(1)+'" r="'+(size*0.18).toFixed(1)+'" fill="#0284c7" stroke="#fff" stroke-width="'+(size*0.03).toFixed(2)+'" style="pointer-events:none;"><title>Waypoint '+wp.n+'</title></circle>');
        parts.push('<text x="'+wp.x.toFixed(1)+'" y="'+wp.y.toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="'+(size*0.22).toFixed(1)+'" fill="#fff" style="pointer-events:none;user-select:none;font-weight:bold;">'+wp.n+'</text>');
      });
    }

    return parts.join('');
  },
  // The faint "addable" empty cells (M5): every axial neighbour of an existing hex that isn't itself
  // an existing hex. Clicking one opens the create-hex picker.
  mapEmptyCells(){
    const size = this.MAP_HEX_SIZE, A = window.ACKS, deltas = A.hexNeighborDeltas();
    const entries = this.mapHexEntries();
    const have = new Set(entries.map(e => e.hex.coord.q + ',' + e.hex.coord.r));
    const out = [], seen = new Set();
    entries.forEach(e => {
      const q = e.hex.coord.q, r = e.hex.coord.r;
      deltas.forEach(d => {
        const nq = q + d[0], nr = r + d[1], key = nq + ',' + nr;
        if(have.has(key) || seen.has(key)) return;
        seen.add(key);
        out.push({ q:nq, r:nr, points:A.hexPolygonPoints(nq, nr, size), label:A.hexDisplayLabel(nq, nr) });
      });
    });
    return out;
  },
  // Active journey routes (M6): each → ordered {x,y} centres for a polyline + the current-position centre.
  mapJourneyRoutes(){
    const size = this.MAP_HEX_SIZE, A = window.ACKS;
    const hexById = {};
    (this.currentCampaign?.hexes || []).forEach(h => { if(h && h.id) hexById[h.id] = h; });
    const centre = id => { const h = hexById[id]; if(!h || !h.coord) return null; const c = A.hexAxialToPixel(h.coord.q, h.coord.r, size); return { x:c.x, y:c.y }; };
    const routes = [];
    (this.currentCampaign?.journeys || []).forEach(j => {
      if(!j || j.status === 'aborted') return;
      // Draw the REMAINING leg: from where the party actually IS now (currentHexId) to the destination,
      // through the waypoints still AHEAD — not from the starting hex. The current-position ring sits at
      // the same origin, so the line emanates from it. Waypoints the party has already walked through (any
      // committed day's hexPath) are dropped so the line doesn't dogleg back to a hex they've left behind.
      const originId = j.currentHexId || j.routeAnchorHexId || j.startHexId;
      const visited = new Set();
      (j.days || []).forEach(d => (((d && d.hexPath) || []).forEach(p => { if(p && p.hexId) visited.add(p.hexId); })));
      const waypointIds = (j.waypoints || []).map(w => w.hexId).filter(id => id && !visited.has(id));
      const ids = [originId].concat(waypointIds, [j.destinationHexId]).filter(Boolean);
      const pts = ids.map(centre).filter(Boolean);
      if(!pts.length) return;
      routes.push({ id:j.id, status:j.status, name:j.name || 'Journey', pts, current:centre(originId) });
    });
    return routes;
  },
  // M5 "Add/Edit hexes" flow — the persistent picker panel shows the moment the toggle flips. This
  // resets it to the "no hex selected" state with default new-hex settings (the brush). mapEnterAddMode
  // is for the USER toggle; addHexViaMap enters the same way but pre-sets the brush domain.
  mapEnterAddMode(){ this.mapCreateAt = null; this.mapEditHexId = null; this.mapCreateDomainId = ''; this.mapCreateTerrain = ''; this.mapCreateSubtype = ''; this.mapCreateKoppen = ''; this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = []; this.schedulePersist(); },
  // Click an empty cell → select it for creation. KEEP the current domain/terrain brush (so settings
  // chosen in the panel before clicking carry into the new hex); only the per-hex geometry resets.
  mapClickEmpty(q, r){ this.mapCreateAt = { q, r }; this.mapEditHexId = null; this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = []; },
  // Open the picker on an existing hex, pre-filled with its current domain + terrain + rivers + roads + crossings.
  mapEditExistingHex(entry){
    const h = entry.hex;
    this.mapCreateAt = { q: h.coord.q, r: h.coord.r };
    this.mapEditHexId = h.id;
    this.mapCreateDomainId = h.domainId || '';
    this.mapCreateTerrain = h.terrain || '';
    this.mapCreateSubtype = h.terrainSubtype || '';
    this.mapCreateKoppen = h.koppen || '';
    this.mapCreateRiverSides    = Array.isArray(h.riverSides)    ? h.riverSides.slice()    : [];
    this.mapCreateRoadSides     = Array.isArray(h.roadSides)     ? h.roadSides.slice()     : [];
    this.mapCreateCrossingSides = Array.isArray(h.crossingSides) ? h.crossingSides.slice() : [];
  },
  mapCancelCreate(){ this.mapCreateAt = null; this.mapEditHexId = null; this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = []; if(this._hexAddReturn) this._returnFromHexAdd(); },
  // Toggle hex side `i` (0..5) in the road picker. `which` is 'mapCreateRoadSides'. (Rivers use the
  // 3-state cycle in mapMiniSideClick — none → river → river+ford/bridge → none.)
  mapToggleSide(which, i){
    const arr = this[which] || [];
    this[which] = arr.includes(i) ? arr.filter(x => x !== i) : arr.concat(i).sort((a, b) => a - b);
  },
  // Delegated click for the mini-hex side pickers (rivers click edges, roads click spokes). Reads the
  // data-mini-side / data-mini-kind attrs off the clicked element — same pattern as the main map SVG.
  // Roads toggle. Rivers cycle 3 states on each edge: none → river → river + ford/bridge → none.
  mapMiniSideClick(ev){
    const el = ev.target.closest('[data-mini-side]'); if(!el) return;
    const side = parseInt(el.getAttribute('data-mini-side'), 10);
    const kind = el.getAttribute('data-mini-kind');
    if(Number.isNaN(side)) return;
    if(kind !== 'river'){ this.mapToggleSide('mapCreateRoadSides', side); return; }
    const hasRiver = this.mapCreateRiverSides.includes(side);
    const hasCross = this.mapCreateCrossingSides.includes(side);
    if(!hasRiver){ this.mapCreateRiverSides = this.mapCreateRiverSides.concat(side).sort((a, b) => a - b); }           // none → river
    else if(!hasCross){ this.mapCreateCrossingSides = this.mapCreateCrossingSides.concat(side).sort((a, b) => a - b); } // river → river + crossing
    else { this.mapCreateRiverSides = this.mapCreateRiverSides.filter(x => x !== side); this.mapCreateCrossingSides = this.mapCreateCrossingSides.filter(x => x !== side); } // → none
  },
  // Mini interactive hex for the picker (kind='river'|'road'). Rivers: clickable edges (drawn along the
  // edge, blue when on). Roads: clickable spokes from the centre to each side (the active set drawn with
  // circular bends via hexRoadPathD, brown). Built as an x-html string + a delegated click (the same
  // <template x-for>-doesn't-work-in-SVG workaround the main map uses). Fixed size, independent of zoom.
  mapMiniHexMarkup(kind){
    const A = window.ACKS, S = 40;
    const on = kind === 'river' ? (this.mapCreateRiverSides || []) : (this.mapCreateRoadSides || []);
    const isOn = i => on.includes(i);
    const f = n => n.toFixed(1);
    const parts = ['<polygon points="' + A.hexPolygonPoints(0, 0, S) + '" fill="#faf6ec" stroke="#bcae93" stroke-width="1.5"/>'];
    if(kind === 'river'){
      const cross = this.mapCreateCrossingSides || [];
      for(let i = 0; i < 6; i++){
        const p = A.hexEdgePoints(0, 0, S, i), act = isOn(i);
        parts.push('<line x1="' + f(p[0].x) + '" y1="' + f(p[0].y) + '" x2="' + f(p[1].x) + '" y2="' + f(p[1].y) + '" stroke="' + (act ? '#3f73b8' : '#d9d2c0') + '" stroke-width="' + (act ? 5 : 2) + '" stroke-linecap="round" style="pointer-events:none;"/>');
        if(act && cross.includes(i)){ const cs = A.hexCrossingSegment(0, 0, S, i, S * 0.40); parts.push('<line x1="' + f(cs.x1) + '" y1="' + f(cs.y1) + '" x2="' + f(cs.x2) + '" y2="' + f(cs.y2) + '" stroke="#6b4a2b" stroke-width="4.5" stroke-linecap="round" style="pointer-events:none;"/>'); }
        parts.push('<line data-mini-side="' + i + '" data-mini-kind="river" x1="' + f(p[0].x) + '" y1="' + f(p[0].y) + '" x2="' + f(p[1].x) + '" y2="' + f(p[1].y) + '" stroke="transparent" stroke-width="13" style="cursor:pointer;pointer-events:stroke;"/>');
      }
    } else {
      for(let i = 0; i < 6; i++){
        const m = A.hexEdgeMidpoint(0, 0, S, i);
        if(!isOn(i)) parts.push('<line x1="0" y1="0" x2="' + f(m.x) + '" y2="' + f(m.y) + '" stroke="#d9d2c0" stroke-width="2" stroke-linecap="round" style="pointer-events:none;"/>');
        parts.push('<line data-mini-side="' + i + '" data-mini-kind="road" x1="0" y1="0" x2="' + f(m.x) + '" y2="' + f(m.y) + '" stroke="transparent" stroke-width="13" style="cursor:pointer;pointer-events:stroke;"/>');
      }
      const d = A.hexRoadPathD(0, 0, S, on);
      if(d) parts.push('<path d="' + d + '" fill="none" stroke="#6b4a2b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"/>');
      if(on.length >= 3) parts.push('<circle cx="0" cy="0" r="4.5" fill="#6b4a2b" style="pointer-events:none;"/>');
    }
    return parts.join('');
  },
  // Terrain options for the picker: the 9 base types, plus — when editing a hex whose terrain
  // isn't one of them (e.g. legacy "plains"/"coast") — its current value, so it's shown + preserved.
  mapTerrainOptions(){
    const base = window.ACKS.mapTerrainTypes();
    const cur = (this.mapCreateTerrain || '').trim();
    if(cur && !base.some(t => t.value === cur)) return [{ value: cur, label: cur + ' (current)' }].concat(base);
    return base;
  },
  // Sub-type options for the map Add/Edit brush — contextual to the brush's terrain base (terrain model T2).
  mapBrushSubtypeOptions(){
    const base = window.ACKS.terrainBase(this.mapCreateTerrain);
    // brush terrain chosen → that base's variants; brush terrain unset (the no-hex-selected
    // default state) → the full union, so the GM can pre-pick a sub-type default; water/jungle → [].
    const subs = base ? ((window.ACKS.TERRAIN_SUBTYPES && window.ACKS.TERRAIN_SUBTYPES[base]) || [])
                      : window.ACKS.allTerrainSubtypes();
    return subs.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
  },
  _mapFindHexById(id){
    return window.ACKS.findHex(this.currentCampaign, id) || null;
  },
  _mapFindHexByCoord(q, r){
    return (this.currentCampaign?.hexes || []).find(x => x.coord && x.coord.q === q && x.coord.r === r) || null;
  },
  // #225 — apply per-side rivers + crossings to `hex` AND mirror each shared edge to the neighbour's
  // opposite edge: a river (and any ford/bridge on it) lives ON the boundary, so it belongs to BOTH
  // hexes. The editing hex is authoritative for its 6 shared edges (its loaded state already reflects
  // prior mirrors), so we sync all 6 — idempotent. A crossing is only kept on an edge that has a river.
  _mapApplyWaterFeatures(hex, riverSides, crossingSides){
    const A = window.ACKS, deltas = A.hexNeighborDeltas();
    const norm = a => Array.from(new Set((a || []).map(i => ((i % 6) + 6) % 6))).sort((x, y) => x - y);
    const nwR = norm(riverSides);
    const nwC = norm(crossingSides).filter(i => nwR.includes(i));
    hex.riverSides = nwR;
    hex.crossingSides = nwC;
    for(let i = 0; i < 6; i++){
      const nb = this._mapFindHexByCoord(hex.coord.q + deltas[i][0], hex.coord.r + deltas[i][1]);
      if(!nb) continue;
      const opp = (i + 3) % 6;
      const setEdge = (arr, on) => { const s = new Set(arr || []); if(on) s.add(opp); else s.delete(opp); return Array.from(s).sort((a, b) => a - b); };
      nb.riverSides    = setEdge(nb.riverSides,    nwR.includes(i));
      nb.crossingSides = setEdge(nb.crossingSides, nwC.includes(i));
    }
  },
  // Move a hex between domains (or to/from unclaimed). Single-home (T6): a hex's domain claim IS
  // hex.domainId; just set it (and ensure the hex is in the canonical campaign.hexes).
  mapRehomeHex(hex, newDomainId){
    const cur = hex.domainId || null, next = newDomainId || null;
    if(cur === next) return;
    hex.domainId = next;
    if(Array.isArray(this.currentCampaign?.hexes) && !this.currentCampaign.hexes.some(h => h.id === hex.id)) this.currentCampaign.hexes.push(hex);
  },
  // The picker's Create/Save button. Branches on mapEditHexId (edit existing) vs create new.
  mapCreateHex(){
    const at = this.mapCreateAt; if(!at) return;
    // EDIT branch — an existing hex was clicked in Edit/Add mode.
    if(this.mapEditHexId){
      const hex = this._mapFindHexById(this.mapEditHexId);
      if(hex){
        this.mapRehomeHex(hex, this.mapCreateDomainId || '');
        hex.terrain = this.mapCreateTerrain || '';
        hex.terrainSubtype = this.mapCreateSubtype || '';   // terrain model
        hex.koppen = this.mapCreateKoppen || '';            // terrain model
        hex.roadSides = (this.mapCreateRoadSides || []).slice(); // CARTOGRAPHIC; hasRoad (travel flag) left untouched — see Phase_2.5_Journeys_Plan §24
        this._mapApplyWaterFeatures(hex, this.mapCreateRiverSides, this.mapCreateCrossingSides);
        this.markDirty(); this.schedulePersist();
        const d = this.mapCreateDomainId ? this.domains.find(x => x.id === this.mapCreateDomainId) : null;
        this.showToast('Updated hex ' + window.ACKS.hexDisplayLabel(hex.coord.q, hex.coord.r) + (d ? ' (' + d.name + ')' : ' (unclaimed)') + '.');
      }
      this.mapCreateAt = null; this.mapEditHexId = null; this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = [];
      if(this._hexAddReturn) this._returnFromHexAdd();
      return;
    }
    // CREATE branch — a new hex at the clicked empty cell.
    const coord = { q: at.q, r: at.r };
    const domId = this.mapCreateDomainId || '';
    // Unclaimed wilderness starts UNexplored (uncharted); a hex placed into a domain stays explored.
    const hex = window.ACKS.blankHex({ coord, terrain: this.mapCreateTerrain || '',
      terrainSubtype: this.mapCreateSubtype || '', koppen: this.mapCreateKoppen || '', // terrain model — brush defaults
      roadSides: (this.mapCreateRoadSides || []).slice(), explored: !!domId }); // rivers/crossings applied (+ mirrored) after the hex is in the campaign
    if(domId){
      const d = this.domains.find(x => x.id === domId);
      if(!d){ this.mapCreateAt = null; return; }
      hex.domainId = d.id;
      this.currentCampaign.hexes.push(hex);   // single-home (T6) — canonical store, claimed by domainId
      this.showToast('Created hex ' + window.ACKS.hexDisplayLabel(coord.q, coord.r) + ' in ' + (d.name || 'domain') + '.');
    } else {
      hex.domainId = null;
      if(!Array.isArray(this.currentCampaign.hexes)) this.currentCampaign.hexes = [];
      this.currentCampaign.hexes.push(hex);
      this.showToast('Created wilderness hex ' + window.ACKS.hexDisplayLabel(coord.q, coord.r) + ' (unclaimed).');
    }
    this._mapApplyWaterFeatures(hex, this.mapCreateRiverSides, this.mapCreateCrossingSides); // rivers + crossings (+ mirror to neighbours)
    this.markDirty(); this.schedulePersist();
    this.mapCreateAt = null; this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = [];
    if(this._hexAddReturn) this._returnFromHexAdd(); // per-domain "+ add hex" flow → back to the domain view
  },
  // M5 "Standard view" composite — terrain fill + all symbols + borders/roads/rivers + journeys.
  mapStandardView(){
    this.mapFillLayer = 'terrain';
    this.mapSymbolToggles = { settlements:true, strongholds:true, lairs:true, dungeons:true, pois:true };
    this.mapEdgeToggles   = { borders:true, roads:true, rivers:true, trails:false };
    this.mapShowJourneys = true;
    this.mapEditAddMode = false;
    this.mapCreateAt = null;
    this.mapEditHexId = null;
    this.mapCreateRiverSides = []; this.mapCreateRoadSides = []; this.mapCreateCrossingSides = [];
    this.schedulePersist();
  },
  // Delegated click on the SVG → resolve the clicked hex via its data-hex-id, then dispatch
  // (mapClickHex owns the drag-suppression + inspect/select mode handling).
  mapSvgClick(e){
    // HW-4 (team agent-3): a click on a continental cell DRILLS DOWN to the regional scale, framed
    // on that region's ~16 children (the §7.2 interlace). Cell polygons carry data-cont-key.
    if(this.mapScale === 'continental'){
      const cc = (e.target && e.target.closest) ? e.target.closest('[data-cont-key]') : null;
      if(cc){ if(this._mapDragged){ this._mapDragged = false; return; } this.mapContinentalDrill(cc.getAttribute('data-cont-key')); }
      return;
    }
    // HW-5 (team agent-6): at the local (1.5-mile) scale, a click on an EMPTY nesting-grid cell AUTHORS a
    // local hex (data-local-q/r → materializeLocalHex); a click on an AUTHORED local hex inspects it.
    if(this.mapScale === 'local'){
      const add = (e.target && e.target.closest) ? e.target.closest('[data-local-q]') : null;
      if(add){ if(this._mapDragged){ this._mapDragged = false; return; } this.mapLocalAddHex(parseInt(add.getAttribute('data-local-q'),10), parseInt(add.getAttribute('data-local-r'),10)); return; }
      const lh = (e.target && e.target.closest) ? e.target.closest('[data-hex-id]') : null;
      if(lh){ if(this._mapDragged){ this._mapDragged = false; return; } const hex = this._mapFindHexById(lh.getAttribute('data-hex-id')); if(hex) this.openHexDetail({ domainId:null, hexIndex:-1, hex:hex, domainName:null }); }
      return;
    }
    const el = (e.target && e.target.closest) ? e.target.closest('[data-hex-id],[data-empty-q]') : null;
    if(!el) return;
    if(el.hasAttribute('data-empty-q')){
      if(this._mapDragged){ this._mapDragged = false; return; } // a drag, not a click
      this.mapClickEmpty(parseInt(el.getAttribute('data-empty-q'), 10), parseInt(el.getAttribute('data-empty-r'), 10));
      return;
    }
    const entry = this.mapHexEntries().find(x => x.hex.id === el.getAttribute('data-hex-id'));
    if(entry) this.mapClickHex(entry);
  },

  // Fit the viewBox to all hexes (+ a margin). Called when entering the map with no viewport,
  // on campaign load, and by the "Fit" button.
  mapResetView(){
    const A = window.ACKS;
    // HW-5 (team agent-6): at local scale, fit to the drilled hex's nesting grid (its idealized ~16
    // cells + any authored sub-hexes), so an empty drill still frames the addable grid.
    if(this.mapScale === 'local'){
      const view = this.mapLocalView();
      if(view){
        const pseudo = view.idealizedCoords.concat(view.authored.map(h => h.coord)).map(c => ({ coord:c }));
        const b = A.hexMapBounds(pseudo, this.MAP_HEX_SIZE, this.MAP_HEX_SIZE * 1.5);
        if(b){ this.mapViewBox = { x:b.minX, y:b.minY, w:b.width, h:b.height }; this.schedulePersist(); return; }
      }
      // no valid parent in view → fall through to the regional fit below
    }
    // HW-4 (team agent-3): at continental scale, fit to the 24-mile cells (drawn at 4× hex size, so
    // a cell overlays its children's centroid — the §7.2 interlace; the same viewBox space as regional).
    if(this.mapScale === 'continental'){
      const contSize = this.MAP_HEX_SIZE * this.MAP_CONTINENTAL_FACTOR;
      const b = A.hexMapBounds(this.mapContinentalCells(), contSize, contSize * 1.0);
      if(!b){ const s = contSize; this.mapViewBox = { x:-s*2, y:-s*2, w:s*4, h:s*4 }; }
      else  { this.mapViewBox = { x:b.minX, y:b.minY, w:b.width, h:b.height }; }
      this.schedulePersist();
      return;
    }
    const hexes = this.mapHexEntries().map(e => e.hex);
    const b = A.hexMapBounds(hexes, this.MAP_HEX_SIZE, this.MAP_HEX_SIZE * 1.5);
    if(!b){ const s = this.MAP_HEX_SIZE; this.mapViewBox = { x:-s*2, y:-s*2, w:s*4, h:s*4 }; }
    else  { this.mapViewBox = { x:b.minX, y:b.minY, w:b.width, h:b.height }; }
    this.schedulePersist();
  },
  mapEnsureView(){ if(!this.mapViewBox) this.mapResetView(); },
  mapViewBoxStr(){ const v = this.mapViewBox; return v ? (v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h) : '0 0 100 100'; },

  // Screen point → world (viewBox) coords, accounting for preserveAspectRatio="meet" letterboxing
  // (uniform scale s, content centered). Lets pan + zoom track the cursor exactly regardless of the
  // container's aspect ratio. Pan/zoom then just re-pin: shift the viewBox so the grabbed/pointed
  // world point stays under the cursor (changing viewBox x/y shifts the mapped world 1:1).
  _mapScreenToWorld(svg, clientX, clientY){
    const vb = this.mapViewBox, rect = svg.getBoundingClientRect();
    if(!vb || !rect.width || !rect.height) return { x:0, y:0 };
    const s = Math.min(rect.width / vb.w, rect.height / vb.h);
    const ox = (rect.width - vb.w * s) / 2, oy = (rect.height - vb.h * s) / 2;
    return { x: vb.x + ((clientX - rect.left) - ox) / s, y: vb.y + ((clientY - rect.top) - oy) / s };
  },
  // Wheel = zoom about the cursor.
  mapWheel(e){
    const svg = e.currentTarget; if(!this.mapViewBox || !svg) return;
    const vb = this.mapViewBox;
    const before = this._mapScreenToWorld(svg, e.clientX, e.clientY);
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const newW = vb.w * factor, newH = vb.h * factor;
    const minW = this.MAP_HEX_SIZE * 0.5, maxW = this.MAP_HEX_SIZE * 4000; // clamp degenerate zoom
    if(newW < minW || newW > maxW) return;
    vb.w = newW; vb.h = newH;
    const after = this._mapScreenToWorld(svg, e.clientX, e.clientY);
    vb.x += before.x - after.x; vb.y += before.y - after.y; // re-pin the cursor's world point
    this.schedulePersist();
  },
  // Drag = pan (keep the grabbed world point under the cursor).
  mapPanStart(e){
    const svg = e.currentTarget; if(!this.mapViewBox || !svg) return;
    const g = this._mapScreenToWorld(svg, e.clientX, e.clientY);
    this._mapPan = { sx:e.clientX, sy:e.clientY, gx:g.x, gy:g.y };
    this._mapDragged = false;
  },
  mapPanMove(e){
    const p = this._mapPan, svg = this.$refs.mapSvg;
    if(!p || !this.mapViewBox || !svg) return;
    if(Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) > 3) this._mapDragged = true;
    const w = this._mapScreenToWorld(svg, e.clientX, e.clientY);
    this.mapViewBox.x += p.gx - w.x; this.mapViewBox.y += p.gy - w.y;
  },
  mapPanEnd(){ if(this._mapPan){ this._mapPan = null; this.schedulePersist(); } },

  // Mode-aware click dispatch — the seam that lets the map be reused as a hex picker (plan §9.1).
  mapClickHex(entry){
    if(this._mapDragged){ this._mapDragged = false; return; } // a drag, not a click
    if(this.mapMode === 'select' && typeof this._mapSelectCb === 'function'){
      this._mapSelectCb(entry.hex.id, entry);
      return;
    }
    // Edit/Add mode — clicking an existing hex opens the quick edit picker (domain + terrain),
    // pre-filled with the hex's current values. Works for domainless hexes too (this is how you
    // assign a wilderness hex to a domain). The full hex card is still one inspect-mode click away.
    if(this.mapEditAddMode){
      this.mapEditExistingHex(entry);
      return;
    }
    // inspect mode (default) — open the EXISTING hex card (no second editor). Works for domainless
    // wilderness hexes too: worldHexEditingHex() resolves them by id from campaign.hexes.
    this.openHexDetail({ domainId:entry.domainId, hexIndex:entry.hexIndex, hex:entry.hex, domainName:entry.domainName });
  },
  // Public seam for future callers (Journey planner, generation wizards): put the map into
  // select mode; clicking a hex hands its id to `cb`. Call mapEndSelect() to restore inspect.
  mapBeginSelect(cb, hint){ this._mapSelectCb = cb; this._mapSelectHint = hint || 'Click a hex to select it.'; this.mapMode = 'select'; this.currentView = 'world'; this.worldSubView = 'map'; this.mapEnsureView(); },
  mapEndSelect(){ this._mapSelectCb = null; this._mapSelectHint = ''; this.mapMode = 'inspect'; },
  // Fit the viewport to a journey's route (anchor→waypoints→dest) + its true origin, with a generous margin.
  mapFocusJourney(j){
    const A = window.ACKS;
    let coords = [];
    try { coords = (A.journeyRoute(this.currentCampaign, j) || []).map(s => s.coord).filter(Boolean); } catch(e){}
    const startHex = A.resolveHexAnywhere ? A.resolveHexAnywhere(this.currentCampaign, j.startHexId) : null;
    if(startHex && startHex.coord) coords.push(startHex.coord);
    if(!coords.length){ this.mapEnsureView(); return; }
    const b = A.hexMapBounds(coords.map(c => ({ coord: c })), this.MAP_HEX_SIZE, this.MAP_HEX_SIZE * 3);
    if(b) this.mapViewBox = { x:b.minX, y:b.minY, w:b.width, h:b.height };
    else this.mapEnsureView();
  },
  // The in-progress journey route while a map pick (waypoint OR destination) is active: ordered hex
  // centres start → waypoints → destination, read from the PENDING pick so it redraws as hexes are
  // clicked. Independent of the mapShowJourneys layer — this is a live planning overlay, not a saved route.
  mapPlanningRoute(){
    const wp = this._journeyWaypointPick, dp = this._journeyDestPick;
    if(!wp && !dp) return null;
    const size = this.MAP_HEX_SIZE, A = window.ACKS;
    const hexById = {};
    (this.currentCampaign?.hexes || []).forEach(h => { if(h && h.id) hexById[h.id] = h; });
    const centre = id => { const h = hexById[id]; if(!h || !h.coord) return null; const c = A.hexAxialToPixel(h.coord.q, h.coord.r, size); return { x:c.x, y:c.y }; };
    const jid = (wp && wp.journeyId) || (dp && dp.journeyId) || null;
    let startId, wpIds, destId;
    if(jid){
      // Editing a live journey: the route begins where the party IS (the re-route anchor / current hex).
      const jr = (this.currentCampaign?.journeys || []).find(x => x && x.id === jid);
      startId = jr ? (jr.routeAnchorHexId || jr.currentHexId || jr.startHexId) : null;
      wpIds = wp ? wp.ids : ((jr && jr.waypoints) || []).map(x => x.hexId).filter(Boolean);
      destId = dp ? (dp.pendingHexId || (jr && jr.destinationHexId)) : ((jr && jr.destinationHexId) || null);
    } else {
      const w = this.journeyWizard;
      startId = w.startHexId || null;
      wpIds = wp ? wp.ids : (w.waypointIds || []);
      destId = dp ? (dp.pendingHexId || w.destinationHexId) : (w.destinationHexId || null);
    }
    const pts = [startId].concat(wpIds || [], [destId]).filter(Boolean).map(centre).filter(Boolean);
    const waypoints = (wpIds || []).map((id, i) => { const c = centre(id); return c ? { x:c.x, y:c.y, n:i+1 } : null; }).filter(Boolean);
    return { pts, start:centre(startId), dest:centre(destId), waypoints };
  },
  // "Create Map" — count what a W×H grid at the current origin would add vs. keep. Mirrors the engine's
  // collision rule (skip cells whose axial coord is already occupied) so the modal previews honestly.
  mapGridPreview(){
    const A = window.ACKS, camp = this.currentCampaign;
    const cols = Math.max(0, Math.floor(this.mapGridCols || 0));
    const rows = Math.max(0, Math.floor(this.mapGridRows || 0));
    const sC = Math.floor(this.mapGridStartCol || 1), sR = Math.floor(this.mapGridStartRow || 1);
    const total = cols * rows;
    if(!camp || !total) return { total, create: 0, skip: 0, cols, rows };
    const used = new Set();
    (camp.hexes || []).forEach(h => { if(h && h.coord) used.add(h.coord.q + ',' + h.coord.r); });
    let skip = 0;
    for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
      const ax = A.hexColRowToAxial(sC + c, sR + r);
      if(used.has(ax.q + ',' + ax.r)) skip++;
    }
    return { total, create: total - skip, skip, cols, rows };
  },
  // Lay out the grid. Clamps each dimension to 1..200 (≤40k cells); confirms past 2,500 (draw cost).
  // Existing hexes in range are kept, never overwritten (engine generateBlankHexGrid). Re-fits the map.
  mapCreateGrid(){
    const camp = this.currentCampaign; if(!camp) return;
    const cols = Math.max(1, Math.min(200, Math.floor(this.mapGridCols || 0)));
    const rows = Math.max(1, Math.min(200, Math.floor(this.mapGridRows || 0)));
    const sC = Math.floor(this.mapGridStartCol || 1), sR = Math.floor(this.mapGridStartRow || 1);
    const cells = cols * rows;
    if(cells > 2500 && !window.confirm('Create a ' + cols + '×' + rows + ' map (' + cells.toLocaleString() + ' hexes)? Very large maps can make the map view slower to draw.')) return;
    const res = window.ACKS.generateBlankHexGrid(camp, { cols, rows, startCol: sC, startRow: sR });
    this.markDirty(); this.schedulePersist();
    this.mapGridModalOpen = false;
    this.mapViewBox = null; this.mapEnsureView(); // re-fit so the new grid is in view
    const kept = res.skipped ? (' · kept ' + res.skipped.toLocaleString() + ' existing') : '';
    this.showToast('Created ' + res.created.toLocaleString() + ' blank hex' + (res.created === 1 ? '' : 'es') + ' (' + cols + '×' + rows + ' grid)' + kept + '.');
  },
  // ── agent-3 (Hex Scales HW-4) state + methods ──
  // The active map scale (Phase_2.5_Hex_Scales_and_Weather_Plan §7.2). 'regional' (6-mile) is the
  // canonical shipped view; 'continental' (24-mile) renders the aggregated region cells. The 'local'
  // (1.5-mile) drill-down tier is the HW-5 follow-on. Transient (resets to regional on reload — a
  // zoomed-out exploration view, not a saved preference); not part of the .acks.json.
  mapScale: 'regional',
  // Continental cells draw at 4× the regional hex size (24mi vs 6mi); a cell then sits over its
  // children's centroid (the JJ p.467 interlace — axial→pixel is linear, so 4Q@size === Q@4·size).
  MAP_CONTINENTAL_FACTOR: 4,
  // The scale-selector options — fine→coarse (⬡ Local · ⬢ Regional · ⬣ Continental). HW-5 added Local.
  mapScaleOptions(){ return ['local','regional','continental'].map(id => window.ACKS.HEX_SCALE_META[id]); },
  // Continental + Regional are global toggles (the whole-map view); Local is PARENT-SCOPED — clicking it
  // drills into a chosen 6-mile hex (HW-5, mapEnterLocalScale). Switching to regional/continental clears
  // the local parent + cancels any pending local-pick.
  mapSetScale(s){
    if(s === 'local'){ this.mapEnterLocalScale(); return; }
    if(s !== 'regional' && s !== 'continental') return;
    if(this.mapScale === s && !this.mapLocalParentHexId) return;
    if(this.mapMode === 'select' && /1\.5-mile/.test(this._mapSelectHint || '')) this.mapEndSelect(); // cancel a pending local pick
    this.mapLocalParentHexId = null;
    this.mapScale = s; this.mapViewBox = null; this.mapEnsureView(); this.schedulePersist();
  },
  // The continental render set — one aggregate per 24-mile region (engine: continentalCellsForCampaign).
  mapContinentalCells(){ return window.ACKS.continentalCellsForCampaign(this.currentCampaign); },
  // Drill from a continental cell back to the 6-mile scale, framed on that region's ~16 children (§7.2).
  mapContinentalDrill(key){
    const A = window.ACKS;
    const cell = this.mapContinentalCells().find(c => c.key === key);
    this.mapScale = 'regional';
    if(cell){
      const byId = {}; this.mapHexEntries().forEach(e => { byId[e.hex.id] = e.hex; });
      const kids = (cell.childHexIds || []).map(id => byId[id]).filter(Boolean);
      const b = kids.length ? A.hexMapBounds(kids, this.MAP_HEX_SIZE, this.MAP_HEX_SIZE * 1.5) : null;
      if(b){ this.mapViewBox = { x:b.minX, y:b.minY, w:b.width, h:b.height }; }
      else { this.mapViewBox = null; this.mapEnsureView(); }
    } else { this.mapViewBox = null; this.mapEnsureView(); }
    this.schedulePersist();
  },
  // Build the continental (24-mile) SVG markup: each region cell as a hex at its continental coord,
  // drawn at 4× size. Fill honors the active "Color by:" layer via a SYNTHETIC hex built from the
  // aggregate (so the shipped hexFillColor handles terrain→dominant / biome / classification / …); an
  // optional weather tint per region (native at this scale, §7.3). data-cont-key drives the drill click.
  mapContinentalMarkup(){
    const A = window.ACKS, size = this.MAP_HEX_SIZE * this.MAP_CONTINENTAL_FACTOR;
    const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const cells = this.mapContinentalCells();
    const ctx = this.mapFillContext();
    const layer = this.mapFillLayer;
    const sw = (size * 0.03).toFixed(2), labelFs = (size * 0.10).toFixed(1), subFs = (size * 0.07).toFixed(1);
    const wmap = this.mapShowWeather ? A.weatherMapForCampaign(this.currentCampaign) : null;
    const parts = [];
    cells.forEach(c => {
      const pts = A.hexPolygonPoints(c.coord.q, c.coord.r, size);
      const pix = A.hexAxialToPixel(c.coord.q, c.coord.r, size);
      const synth = { terrain:c.dominantTerrain, koppen:c.koppen, biomeOverride:'', classification:c.classification, families:c.families, valuePerFamily:6, domainId:(c.domainIds.length === 1 ? c.domainIds[0] : null) };
      const title = 'Continental cell ' + A.hexDisplayLabel(c.coord.q, c.coord.r) + ' · ' + c.childCount + ' six-mile hex' + (c.childCount === 1 ? '' : 'es')
        + (c.dominantTerrain ? ' · ' + c.dominantTerrain : '') + ' · ' + (c.families || 0).toLocaleString() + ' families'
        + (c.koppen ? ' · ' + c.koppen + (c.biome ? ' (' + c.biome + ')' : '') : '')
        + (c.domainIds.length ? ' · ' + c.domainIds.length + ' domain' + (c.domainIds.length === 1 ? '' : 's') : ' · unclaimed')
        + ' — click to drill in';
      parts.push('<polygon data-cont-key="' + esc(c.key) + '" points="' + pts + '" fill="' + A.hexFillColor(synth, layer, ctx) + '" stroke="#4b3f2f" stroke-width="' + sw + '" style="cursor:pointer;transition:fill .15s;"><title>' + esc(title) + '</title></polygon>');
      if(wmap){ const wr = wmap[c.key]; if(wr) parts.push('<polygon points="' + pts + '" fill="' + A.weatherFillColor(wr) + '" fill-opacity="0.5" style="pointer-events:none;"><title>' + esc(A.weatherSummaryText(wr)) + '</title></polygon>'); }
      parts.push('<text x="' + pix.x.toFixed(1) + '" y="' + (pix.y - size * 0.62).toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="' + labelFs + '" fill="#2b2b2b" fill-opacity="0.8" style="pointer-events:none;user-select:none;font-family:monospace;">' + esc(A.hexDisplayLabel(c.coord.q, c.coord.r)) + '</text>');
      parts.push('<text x="' + pix.x.toFixed(1) + '" y="' + pix.y.toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="' + subFs + '" fill="#3b2f1c" fill-opacity="0.6" style="pointer-events:none;user-select:none;">' + esc((c.dominantTerrain || '—') + ' · ' + c.childCount) + '</text>');
    });
    return parts.join('');
  },
  // ── agent-6 (Hex Scales HW-5) state + methods — the local (1.5-mile) drill-down tier ──
  // Which 6-mile hex the local view is drilled into (null = not in a local drill). Transient (resets
  // on reload, like mapScale — a drill-in exploration view, not part of the .acks.json).
  mapLocalParentHexId: null,
  // The regional hex currently drilled into, or null. Guards on the live scale (a drilled hex that was
  // deleted / rescaled drops the drill).
  mapLocalParent(){
    if(!this.mapLocalParentHexId) return null;
    const h = this._mapFindHexById(this.mapLocalParentHexId);
    return (h && window.ACKS.hexScaleOf(h) === 'regional') ? h : null;
  },
  // The drill render set (engine: localDrillView) — idealized ~16 nesting cells + authored sub-hexes +
  // the still-empty addable cells + a derived aggregate. null when no valid parent is in view.
  mapLocalView(){ const p = this.mapLocalParent(); return p ? window.ACKS.localDrillView(this.currentCampaign, p) : null; },
  // Enter the Local tier (the ⬡ button). Re-enter the last-drilled hex if it's still valid, else put the
  // map into select mode so the GM clicks a 6-mile hex to drill into (mapClickHex → the cb → mapLocalDrill).
  mapEnterLocalScale(){
    if(this.mapLocalParent()){ this.mapLocalDrill(this.mapLocalParentHexId); return; }
    const A = window.ACKS;
    const hasRegional = (this.currentCampaign?.hexes || []).some(h => A.hexScaleOf(h) === 'regional');
    if(!hasRegional){ this.showToast('No 6-mile hexes on the map yet — add some first, then drill into one for 1.5-mile detail.', 5000); return; }
    this.mapBeginSelect(hexId => this.mapLocalDrill(hexId), 'Click a 6-mile hex to drill into its 1.5-mile detail.');
    this.showToast('Click a 6-mile hex to view & author its 1.5-mile detail (or pick another scale to cancel).', 5000);
  },
  // Drill INTO a regional hex → the local scale, framed on its nesting grid (§7.2).
  mapLocalDrill(hexId){
    const A = window.ACKS, h = this._mapFindHexById(hexId);
    if(!h || A.hexScaleOf(h) !== 'regional'){ this.showToast('Drill into a 6-mile (regional) hex to view its 1.5-mile detail.', 4000); return; }
    this.mapEndSelect();                         // leave the pick mode if we entered via the selector
    this.mapLocalParentHexId = hexId;
    this.mapScale = 'local';
    this.mapViewBox = null; this.mapResetView(); // fits to the local children / nesting grid
    this.schedulePersist();
  },
  // Climb back out of the local drill → the 6-mile view, framed on the parent hex.
  mapLocalBackToRegional(){
    const A = window.ACKS, parent = this.mapLocalParent();
    this.mapScale = 'regional'; this.mapLocalParentHexId = null;
    const entry = parent ? this.mapHexEntries().find(e => e.hex.id === parent.id) : null;
    const b = (entry) ? A.hexMapBounds([entry.hex], this.MAP_HEX_SIZE, this.MAP_HEX_SIZE * 3) : null;
    if(b){ this.mapViewBox = { x:b.minX, y:b.minY, w:b.width, h:b.height }; }
    else { this.mapViewBox = null; this.mapEnsureView(); }
    this.schedulePersist();
  },
  // Author a 1.5-mile hex at an empty nesting-grid cell (the addable cells, data-local-q/r). Materializes
  // it bound to the parent (engine: materializeLocalHex — domainless, out of the 6-mile economy), then
  // opens the standard hex card so the GM can set its terrain/detail.
  mapLocalAddHex(q, r){
    const A = window.ACKS, parent = this.mapLocalParent();
    if(!parent){ this.showToast('No 6-mile parent hex in view to add detail to.', 3000); return; }
    const hex = A.materializeLocalHex(this.currentCampaign, parent, { q, r });
    if(!hex){ this.showToast('Could not add the 1.5-mile hex.', 3000); return; }
    if(this.markDirty) this.markDirty();
    this.schedulePersist();
    this.openHexDetail({ domainId:null, hexIndex:-1, hex:hex, domainName:null });
    this.showToast('Added 1.5-mile detail ' + A.hexDisplayLabel(q, r) + ' — set its terrain on the hex card.', 4000);
  },
  // Build the local (1.5-mile) SVG markup: the AUTHORED sub-hexes (terrain fill via the active "Color by:"
  // layer, clickable to inspect, data-hex-id) + the empty nesting-grid cells (faint dashed, clickable to
  // author, data-local-q/r). Drawn at the regional hex size; the local coords sit at 4× the parent's, so
  // the ~16 children fill the space one 24-mile cell would (the §7.2 interlace, one tier down).
  mapLocalMarkup(){
    const A = window.ACKS, size = this.MAP_HEX_SIZE;
    const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const view = this.mapLocalView();
    if(!view) return '';
    const ctx = this.mapFillContext(), layer = this.mapFillLayer;
    const sw = (size * 0.04).toFixed(2), labelFs = (size * 0.16).toFixed(1);
    const parts = [];
    // empty cells first (so authored hexes paint over any overlap)
    view.addableCoords.forEach(c => {
      const pts = A.hexPolygonPoints(c.q, c.r, size);
      parts.push('<polygon data-local-q="' + c.q + '" data-local-r="' + c.r + '" points="' + pts + '" fill="#000000" fill-opacity="0.03" stroke="#3a4a5e" stroke-opacity="0.35" stroke-dasharray="' + (size*0.12).toFixed(1) + ',' + (size*0.08).toFixed(1) + '" stroke-width="' + sw + '" style="cursor:copy;"><title>Add 1.5-mile detail here (' + esc(A.hexDisplayLabel(c.q, c.r)) + ')</title></polygon>');
    });
    // authored sub-hexes
    view.authored.forEach(h => {
      if(!h.coord) return;
      const pts = A.hexPolygonPoints(h.coord.q, h.coord.r, size);
      const pix = A.hexAxialToPixel(h.coord.q, h.coord.r, size);
      const title = (hexLabelFor(h) || A.hexDisplayLabel(h.coord.q, h.coord.r)) + ' · 1.5-mile detail'
        + (h.terrain ? ' · ' + h.terrain : '') + (h.families ? ' · ' + h.families + ' families' : '') + ' — click to edit';
      parts.push('<polygon data-hex-id="' + esc(h.id) + '" points="' + pts + '" fill="' + A.hexFillColor(h, layer, ctx) + '" stroke="#4b3f2f" stroke-width="' + sw + '" style="cursor:pointer;transition:fill .15s;"><title>' + esc(title) + '</title></polygon>');
      parts.push('<text x="' + pix.x.toFixed(1) + '" y="' + pix.y.toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="' + labelFs + '" fill="#2b2b2b" fill-opacity="0.7" style="pointer-events:none;user-select:none;font-family:monospace;">' + esc(A.hexDisplayLabel(h.coord.q, h.coord.r)) + '</text>');
    });
    return parts.join('');
  },
  });
})();
