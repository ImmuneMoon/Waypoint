/* Fog of war / dynamic vision (1.5.0, v1) — the UI + vision half. FV1 gave the GM-side overlay and tools; FV2 makes
   it per-player and enforced:
   - the same pure geometry (fogcore.js / window.wpFogCore) computes, for any viewer, the cells their tokens reveal;
   - the HOST calls fogDropIds()/canSeePoint() (exposed on window.wpFog) to drop from a recipient's wire copy every
     creature they cannot see (net.js) — true absence, so a dev window has nothing to uncover;
   - the CLIENT paints an OPAQUE fog overlay of its own tokens' vision (map.fog + camp.fog now travel), matching what
     the host enforced; the GM sees a see-through authoring/preview overlay and the fog menu.
   Sight range resolves from a campaign-mapped character-sheet field (camp.fog.fields.sight) via the formula engine,
   falling back to camp.fog.defaults.sight. Design of record: docs/FOG_OF_WAR_PLAN.md §13. */
import { state } from './state.js';
import { getActiveMap, getActiveCampaign } from './models.js';

var ui = function(id) { return document.getElementById(id); };
function core() { return window.wpFogCore || null; }
function net() { return window.wpNet || null; }
function vtt() { return window.wpVtt || null; }
function toast(m) { if (window.appToast) window.appToast(m); }
function roleNow() { var v = vtt(); return v ? v.mode() : 'solo'; }
function isGmView() { var m = roleNow(); return m === 'solo' || m === 'host'; }
function isClientView() { return roleNow() === 'client'; }   // a foreign player past the snapshot (never the stream or awaiting)
function myId() { var n = net(); return (n && n.myId) || ''; }
function fogFeatureOn() { var v = vtt(); return v ? !!v.on('fog') : false; }   // host: the campaign setting; client: the GM's ceiling
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function activeMap() { var m = getActiveMap(); return m && m.type === 'map' ? m : null; }
function activeCamp() { return getActiveCampaign() || null; }
function save() { if (window.wpSave) window.wpSave(true); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------- the persisted fog data (travels in FV2) ---------- */
function DEF_MAP() { return { on: false, mode: 'auto', manual: { adds: [], cuts: [] } }; }
function mapFog(map) {
    if (!map) return DEF_MAP();
    var C = core();
    if (!map.fog || typeof map.fog !== 'object') map.fog = DEF_MAP();
    else if (C) map.fog = C.cleanFog(map.fog) || DEF_MAP();
    if (!map.fog.manual) map.fog.manual = { adds: [], cuts: [] };
    return map.fog;
}
function campFog(camp) {
    var C = core();
    if (!camp) return C ? C.cleanCampFog(null) : { fields: {}, defaults: { sight: 0 } };
    camp.fog = C ? C.cleanCampFog(camp.fog) : (camp.fog || { fields: {}, defaults: { sight: 0 } });
    return camp.fog;
}
function gridForMap(map) { var C = core(); if (!C || !map) return null; return C.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell); }
// Per-map yards-per-cell (mirrors whiteboard.js mapMeasureConfig without depending on the ACTIVE map — §11R-7)
var UNIT_YD = { yd: 1, ft: 1 / 3, m: 1.09361, km: 1093.61, mi: 1760 };
function cellYardsForMap(map) {
    var meta = (map && map.meta) || {}, gt = meta.gridType || 'off';
    var hex = gt === 'hex' || (gt === 'off' && map.fog && map.fog.cell && map.fog.cell.grid === 'hex');
    var per = (typeof meta.cellValue === 'number' && meta.cellValue > 0) ? meta.cellValue : (hex ? 1 : 5);
    return per * (UNIT_YD[meta.cellUnit] || (hex ? 1 : UNIT_YD.ft));
}
// One token's sight, in cells: the mapped sheet field via the formula engine, else the campaign default; clamped
function tokenSightCells(token, map, camp) {
    var C = core(); if (!C || !token) return 0;
    var cf = campFog(camp), yards = cf.defaults.sight || 0;
    if (cf.fields.sight && camp && camp.system && camp.chars && token.charId && window.wpSystemCore && window.wpFormula) {
        var ch = camp.chars[token.charId];
        if (ch) {
            var f = window.wpSystemCore.fieldById(camp.system, cf.fields.sight);
            if (f && f.key) { var r = window.wpSystemCore.makeResolver(camp.system, ch, window.wpFormula); var v = r(f.key); if (typeof v === 'number' && isFinite(v) && v >= 0) yards = v; }
        }
    }
    return C.rangeToCells(yards, cellYardsForMap(map));
}

/* ---------- who reveals what ----------
   ownerId: a player's profile id (their own tokens only) or '*' (every character token — the GM's party preview). */
// A map's vision mode: its explicit map.fog.vision, else the grid-type default (square = all-around, hex = 180° front
// cone). The arc is DECOUPLED from the grid type — a GM can give a square map a facing cone, or a hex map all-around.
function gridIsHexMap(map) {
    var gt = (map && map.meta && map.meta.gridType) || 'off';
    return gt === 'hex' || (gt === 'off' && !!(map && map.fog && map.fog.cell && map.fog.cell.grid === 'hex'));
}
function visionOf(map) {
    var v = map && map.fog && map.fog.vision, C = core(), def = C ? C.LIMITS.arcDeg : 180;
    if (v && v.mode === 'arc') return { mode: 'arc', arc: Math.max(1, Math.min(360, Math.round(v.arc || 0) || def)) };
    if (v && v.mode === 'all') return { mode: 'all', arc: 360 };
    return gridIsHexMap(map) ? { mode: 'arc', arc: def } : { mode: 'all', arc: 360 };
}
function viewersFor(map, camp, ownerId) {
    var turningOn = !window.wpVtt || window.wpVtt.on('turning'); var out = [], arc = turningOn ? visionOf(map).arc : 360;   // facing feature off ⇒ the cone falls back to all-around (nothing can aim it); host + client agree via the shared turning flag
    (map.whiteboard || []).forEach(function(w) {
        if (!w || !w.isChar || w.hidden) return;
        if (ownerId && ownerId !== '*' && w.ownerId !== ownerId) return;
        out.push({ x: w.x + (w.w || 60) / 2, y: w.y + (w.h || 52) / 2, front: ((w.rot || 0) + (w.front || 0)), range: tokenSightCells(w, map, camp), arc: arc });   // world facing = rot + front, so the arc follows the token's rotation
    });
    return out;
}
// ---- sight-blockers: the opaque-cell key set for a map, built from flagged board items (v1: static walls) ----
var _blockerCache = Object.create(null), _blockerStamp = Object.create(null), _blockerWarned = Object.create(null);
function eligibleBlocker(w) {
    if (!w || !w.blocksSight || w.hidden) return false;             // hidden never blocks (host & client must agree)
    if (w.sightType === 'door' && w.doorOpen) return false;         // an OPEN door blocks nothing; a closed one blocks like a wall
    if (w.type === 'circle') return true;                           // a pillar; its footprint is rotation-invariant
    if (w.rot) return false;                                        // a rotated rect/hex/diamond footprint is not supported in v1
    if (w.fill) return true;                                        // a fill-bucket cell
    return w.type === 'rect' || w.type === 'hexagon' || w.type === 'diamond';   // an axis-aligned solid shape
}
// The grid cells an eligible blocker item covers — shared by blockersFor and the door click-toggle so they agree.
function footprintCells(w, grid, C) {
    if (w.fill) return [C.cellOf(w.x + (w.w || 0) / 2, w.y + (w.h || 0) / 2, grid)];
    if (w.type === 'hexagon') return C.cellsUnderHex(w.x, w.y, w.w || 0, w.h || 0, grid);
    if (w.type === 'circle') return C.cellsUnderCircle(w.x, w.y, w.w || 0, w.h || 0, grid);
    if (w.type === 'diamond') return C.cellsUnderDiamond(w.x, w.y, w.w || 0, w.h || 0, grid);
    return C.cellsUnderRect(w.x, w.y, w.w || 0, w.h || 0, grid);
}
function blockersFor(map, grid) {
    if (!map || !grid) return null;
    // Key the memo on map.meta.updated (stamped every save, io.js) as well as map.id, so a blocker MOVE busts it even
    // in solo mode — there onLocalSave early-returns before invalidateVision(), so id alone would go stale.
    var stamp = (map.meta && map.meta.updated) || 0;
    if (_blockerCache[map.id] !== undefined && _blockerStamp[map.id] === stamp) return _blockerCache[map.id];
    var C = core(), wb = map.whiteboard || [], set = Object.create(null), n = 0, over = false;
    for (var i = 0; i < wb.length && !over; i++) {
        var w = wb[i]; if (!eligibleBlocker(w)) continue;
        var cells = footprintCells(w, grid, C);
        for (var j = 0; j < cells.length; j++) { var k = C.cellKey(cells[j], grid); if (!set[k]) { set[k] = 1; if (++n > C.LIMITS.blockerCells) { over = true; break; } } }
    }
    if (over && !_blockerWarned[map.id]) { _blockerWarned[map.id] = 1; toast('Too many sight-blockers on this map — vision is not being blocked here.'); }
    if (!over) _blockerWarned[map.id] = 0;
    var result = (over || n === 0) ? null : set;                    // over cap or none → no occlusion (fail open)
    _blockerStamp[map.id] = stamp;
    _blockerCache[map.id] = result;
    return result;
}
// A play-area item's footprint cells. Unlike sight-blockers (which punt on rotation), images/shapes can be rotated,
// so a rotated item is tested cell-by-cell against its OWN un-rotated box: exact for images/rects, a safe slight
// over-fog for hex/diamond, and it never LEAKS off a tilted corner. Circles are rotation-invariant; a fill is one cell.
function maskFootprint(w, grid, C) {
    if (!w.rot || w.fill || w.type === 'circle') return footprintCells(w, grid, C);
    var rad = w.rot * Math.PI / 180, ww = w.w || 0, hh = w.h || 0, cx = w.x + ww / 2, cy = w.y + hh / 2;
    var bw = Math.abs(ww * Math.cos(rad)) + Math.abs(hh * Math.sin(rad)), bh = Math.abs(ww * Math.sin(rad)) + Math.abs(hh * Math.cos(rad));
    var box = C.cellsUnderRect(cx - bw / 2, cy - bh / 2, bw, bh, grid), cos = Math.cos(-rad), sin = Math.sin(-rad), out = [];
    for (var i = 0; i < box.length; i++) {
        var p = C.cellCenter(box[i], grid), dx = p.x - cx, dy = p.y - cy;
        var lx = dx * cos - dy * sin + cx, ly = dx * sin + dy * cos + cy;   // rotate the cell centre back into the item's own frame
        if (lx >= w.x && lx <= w.x + ww && ly >= w.y && ly <= w.y + hh) out.push(box[i]);
    }
    return out;
}
// ---- fog areas ("play areas"): the cell region fog is CONFINED to, built from board items flagged `fogged` ----
// A per-item `fogged` flag marks an image/shape as a play area. Fog lives ONLY inside the union of such items'
// footprints — outside stays lit, so scenes and map art the GM never flagged are never fogged. With NO flagged
// item on the map, the campaign default decides: 'all' (fog the whole map — the pre-1.5.0 behaviour) or 'none'
// (no fog until an area is marked). Hidden items never contribute: the wire reduces a hidden item to a stub with
// no flags, so host and client must both ignore them to agree (same rule as the sight-blockers above).
var _maskCache = Object.create(null), _maskStamp = Object.create(null);
function fogMask(map, camp, grid) {
    if (!map || !grid) return { mode: 'all' };
    var stamp = (map.meta && map.meta.updated) || 0;
    if (_maskCache[map.id] !== undefined && _maskStamp[map.id] === stamp) return _maskCache[map.id];
    var C = core(), wb = map.whiteboard || [], set = Object.create(null), cells = [], n = 0, any = false, over = false;
    for (var i = 0; i < wb.length && !over; i++) {
        var w = wb[i]; if (!w || !w.fogged || w.hidden) continue;
        any = true;
        var fc = maskFootprint(w, grid, C);
        for (var j = 0; j < fc.length; j++) { var k = C.cellKey(fc[j], grid); if (!set[k]) { set[k] = 1; cells.push(fc[j]); if (++n > C.LIMITS.blockerCells) { over = true; break; } } }
    }
    var result;
    if (any && !over) result = { mode: 'set', keys: set, cells: cells };
    else if (any) result = { mode: 'all' };                             // over the cap → fail to whole-map fog (never under-fogs)
    else { var emp = campFog(camp).defaults.emptyFog; result = { mode: emp === 'none' ? 'none' : 'all' }; }
    _maskStamp[map.id] = stamp; _maskCache[map.id] = result;
    return result;
}
function inMask(mask, key) { return mask.mode === 'all' ? true : (mask.mode === 'none' ? false : !!mask.keys[key]); }
// Cover between two board points, for the ruler readout (1.5.0, v1). Resolve both ends to cells on the ACTIVE map's
// grid, reuse the same sight-blocker set fog uses, and map the system-neutral result to this campaign-system's cover
// tier. Returns { name, block } or null (no grid / same cell / no cover / cover off). Local + advisory: reads state,
// mutates nothing, sends nothing on the wire; host and client both run the identical fogcore + coverTier.
function coverBetween(x1, y1, x2, y2) {
    var map = activeMap(), camp = activeCamp(), C = core(); if (!map || !C) return null;
    var grid = gridForMap(map); if (!grid) return null;                 // gridless with no assigned cell → can't measure cover
    var a = C.cellOf(x1, y1, grid), b = C.cellOf(x2, y2, grid);
    if (C.cellKey(a, grid) === C.cellKey(b, grid)) return null;         // same cell → no cover
    var sys = camp && camp.system; if (!sys || !window.wpSystemCore) return null;
    var cov = C.coverBetween(a, b, grid, blockersFor(map, grid));
    return window.wpSystemCore.coverTier(sys, cov.coverage, cov.lineOfEffect);
}
// GM clicks a door while in fog mode → flip open/closed on the topmost door under the point. Host-authoritative:
// save() runs onLocalSave (invalidateVision + resend the map to players); the invalidate+redraw refresh the GM overlay.
function toggleDoorAt(boardX, boardY) {
    if (!isGmView() || !canWrite()) return false;
    var map = activeMap(), C = core(); if (!map || !C) return false;
    var grid = gridForMap(map); if (!grid) return false;
    var key = C.cellKey(C.cellOf(boardX, boardY, grid), grid), wb = map.whiteboard || [];
    for (var i = wb.length - 1; i >= 0; i--) {
        var w = wb[i];
        if (!w || w.blocksSight !== true || w.sightType !== 'door' || w.hidden) continue;
        var cells = footprintCells(w, grid, C);
        for (var j = 0; j < cells.length; j++) {
            if (C.cellKey(cells[j], grid) === key) { w.doorOpen = !w.doorOpen; save(); if (window.appRender) window.appRender(); invalidateVision(); redraw(); toast(w.doorOpen ? 'Door opened.' : 'Door closed.'); return true; }
        }
    }
    return false;
}

// The cells revealed to ownerId: their tokens' vision ∪ manual adds − manual cuts. null = the whole map (reveal mode).
function revealedCellList(map, camp, ownerId) {
    var C = core(), grid = gridForMap(map); if (!grid) return [];
    var mf = mapFog(map);
    if (mf.mode === 'reveal') return null;
    var seen = Object.create(null), out = [];
    var add = function(cell) { var k = C.cellKey(cell, grid); if (!seen[k]) { seen[k] = 1; out.push(cell); } };
    var blk = blockersFor(map, grid);
    if (mf.mode !== 'cover') viewersFor(map, camp, ownerId).forEach(function(v) { C.visibleCells(v, grid, blk).forEach(function(o) { add(o.cell); }); });
    (mf.manual.adds || []).forEach(add);
    var cut = Object.create(null); (mf.manual.cuts || []).forEach(function(c) { cut[C.cellKey(c, grid)] = 1; });
    return out.filter(function(cell) { return !cut[C.cellKey(cell, grid)]; });
}

/* ---------- host enforcement helpers (called by net.js) ---------- */
// Ids of the character tokens a recipient CANNOT see on a map (drop these from their wire copy). null = no fog / drop nothing.
function fogDropIds(recipientId, camp, map) {
    if (!fogFeatureOn() || !map || map.type !== 'map') return null;
    var mf = mapFog(map); if (!mf.on) return null;
    var grid = gridForMap(map); if (!grid) return null;                 // gridless with no assigned cell → can't compute → send all
    var mask = fogMask(map, camp, grid); if (mask.mode === 'none') return null;   // no play area marked + default 'none' → no fog region → nothing hidden
    var list = revealedCellList(map, camp, recipientId);
    if (list === null) return null;                                     // reveal-all: nothing hidden
    var C = core(), keys = Object.create(null); list.forEach(function(c) { keys[C.cellKey(c, grid)] = 1; });
    var drop = Object.create(null), any = false;
    (map.whiteboard || []).forEach(function(w) {
        if (!w || !w.isChar) return;
        if (w.ownerId === recipientId) return;                          // your own token is always yours
        var tk = C.cellKey(C.cellOf(w.x + (w.w || 60) / 2, w.y + (w.h || 52) / 2, grid), grid);
        if (inMask(mask, tk) && !keys[tk]) { drop[w.id] = 1; any = true; }   // hidden only inside a fog area a viewer can't see; a token OUT of every fog area is always visible
    });
    return any ? drop : null;
}
// A cached revealed-key set per (recipient, map): stable during a drag (the recipient's own tokens don't move), so the
// live pos fast-path stays cheap. Cleared by invalidateVision() on any save / token move / snapshot / fog edit.
var _keyCache = Object.create(null);
function invalidateVision() { _keyCache = Object.create(null); _blockerCache = Object.create(null); _blockerStamp = Object.create(null); _maskCache = Object.create(null); _maskStamp = Object.create(null); }
function canSeePoint(recipientId, camp, map, x, y) {
    if (!fogFeatureOn() || !map) return true;
    var mf = mapFog(map); if (!mf.on) return true;
    var grid = gridForMap(map); if (!grid) return true;
    var mask = fogMask(map, camp, grid); if (mask.mode === 'none') return true;   // no fog region on this map
    var k = recipientId + '|' + map.id, ce = _keyCache[k];
    if (!ce) {
        var list = revealedCellList(map, camp, recipientId);
        ce = { all: list === null, keys: Object.create(null) };
        if (list) { var C = core(); list.forEach(function(c) { ce.keys[C.cellKey(c, grid)] = 1; }); }
        _keyCache[k] = ce;
    }
    if (ce.all) return true;
    var pk = core().cellKey(core().cellOf(x, y, grid), grid);
    if (!inMask(mask, pk)) return true;                                 // outside every fog area → always visible
    return !!ce.keys[pk];
}

/* ---------- the overlay (a canvas over #whiteboardWrap; #fxScreen pattern) ---------- */
var previewMode = 'off';   // GM only: 'off' (whole board), 'party' (all tokens) or a player's profile id
function screenEl() { return ui('fogScreen'); }
function canvasEl() { var s = screenEl(); if (!s) return null; var c = s.querySelector('canvas.fog-canvas'); if (!c) { c = document.createElement('canvas'); c.className = 'fog-canvas'; s.appendChild(c); } return c; }
function placeScreen() {
    var s = screenEl(), wrap = ui('whiteboardWrap'); if (!s || !wrap) return;
    var r = wrap.getBoundingClientRect();
    s.style.left = r.left + 'px'; s.style.top = r.top + 'px'; s.style.width = r.width + 'px'; s.style.height = r.height + 'px';
    var c = canvasEl(); if (!c) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1), w = s.clientWidth, h = s.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr)); }
    c.style.width = w + 'px'; c.style.height = h + 'px';
    var ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function clearCanvas() { var c = screenEl() && screenEl().querySelector('canvas.fog-canvas'); if (c) { var x = c.getContext('2d'); if (x) x.clearRect(0, 0, c.width, c.height); } }
function isFogMode() { return !!window.isFogMode; }
function active() {
    if (state.viewMode !== 'visual') return false;
    var map = activeMap(); if (!map) return false;
    if (!fogFeatureOn() || !mapFog(map).on || !gridForMap(map)) return false;
    if (isGmView()) return true;   // fog enabled for this map => the GM always sees the see-through overlay (party vision by default), across every tool and while dragging items
    if (isClientView()) return true;                                // a player always sees their own-vision fog
    return false;                                                   // stream / awaiting: no fog overlay in v1
}
function drawOwner() {
    if (isClientView()) return myId();                             // a player sees only their own tokens' vision
    return (previewMode === 'off' || previewMode === 'party') ? '*' : previewMode;   // GM: all tokens, or one player
}
function hexPath(ctx, cx, cy, s) { for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i), px = cx + s * Math.cos(a), py = cy + s * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
function draw() {
    var s = screenEl(), wrap = ui('whiteboardWrap'), C = core(); if (!s || !wrap || !C) return;
    placeScreen();
    var c = s.querySelector('canvas.fog-canvas'); if (!c) return;
    var ctx = c.getContext('2d'); if (!ctx) return;
    var W = s.clientWidth, H = s.clientHeight;
    ctx.clearRect(0, 0, W, H);
    if (!active()) return;
    var map = activeMap(), camp = activeCamp(), grid = gridForMap(map);
    var mask = fogMask(map, camp, grid);
    if (mask.mode === 'none') return;                              // no play area marked + default 'none': nothing to fog
    var cells = revealedCellList(map, camp, drawOwner());
    if (cells === null) return;                                    // reveal-all: no fog
    var z = state.zoomLevel || 1, sx = wrap.scrollLeft, sy = wrap.scrollTop;
    var pad = 80 + (grid.type === 'square' ? grid.size * z / 2 : grid.s * z * 1.02);   // keep a cell whose CENTRE is off-view but whose body reaches the viewport (else a sliver of the clip edge stays unfogged at high zoom)
    var traceCell = function(cell) {                               // add one cell's outline to the current path (screen space); off-view cells are skipped
        var ctr = C.cellCenter(cell, grid), lx = ctr.x * z - sx, ly = ctr.y * z - sy;
        if (lx < -pad || ly < -pad || lx > W + pad || ly > H + pad) return;
        if (grid.type === 'square') { var half = grid.size * z / 2; ctx.rect(lx - half - 1, ly - half - 1, half * 2 + 2, half * 2 + 2); }
        else hexPath(ctx, lx, ly, grid.s * z * 1.02);
    };
    ctx.save();
    if (mask.mode === 'set') {                                     // confine the fog to the play-area cells
        ctx.beginPath();
        for (var mi = 0; mi < mask.cells.length; mi++) traceCell(mask.cells[mi]);
        ctx.clip();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = isClientView() ? 'rgba(5,6,12,0.97)' : 'rgba(9,11,20,0.62)';   // players: opaque; the GM: see-through
    ctx.fillRect(0, 0, W, H);                                      // one flat fill (clipped to the mask when set) — no per-cell alpha seams
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    for (var i = 0; i < cells.length; i++) traceCell(cells[i]);
    ctx.fill();                                                    // punch every revealed cell in one pass
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
}

/* ---------- the throttled redraw loop (runs only while the overlay is active) ---------- */
var raf = null, lastDraw = 0;
function tick() {
    raf = null;
    if (!active()) { clearCanvas(); return; }
    var now = Date.now();
    if (now - lastDraw >= 60) { lastDraw = now; draw(); }
    raf = requestAnimationFrame(tick);
}
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function redraw() { if (active()) { lastDraw = 0; kick(); } else clearCanvas(); }

/* ---------- the manual brush (whiteboard.js calls paintAt in fog mode) ---------- */
var brush = 'reveal', _saveTimer = null;
function queueSave() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(function() { _saveTimer = null; save(); }, 400); }
function withoutKey(list, key, grid, C) { return (list || []).filter(function(c) { return C.cellKey(c, grid) !== key; }); }
function paintAt(boardX, boardY, opposite) {
    if (!isGmView() || !canWrite()) return;
    var map = activeMap(), C = core(); if (!map || !C) return;
    var grid = gridForMap(map);
    if (!grid) { toast('This is a gridless map — choose a measurement grid in the fog menu first.'); return; }
    var mf = mapFog(map);
    if (mf.mode !== 'auto') { mf.mode = 'auto'; syncMenu(); }
    var cell = C.cellOf(boardX, boardY, grid), key = C.cellKey(cell, grid);
    var reveal = (brush === 'reveal') !== !!opposite;
    mf.manual.adds = withoutKey(mf.manual.adds, key, grid, C);
    mf.manual.cuts = withoutKey(mf.manual.cuts, key, grid, C);
    var into = reveal ? mf.manual.adds : mf.manual.cuts, cap = C.LIMITS.manual;
    if (into.length < cap) into.push(cell); else toast('That map already has the most manual fog cells it can hold.');
    queueSave(); redraw();
}

/* ---------- the fog menu (#fogMenu) ---------- */
function fillPreviewOptions() {
    var sel = ui('fogPreview'); if (!sel) return;
    var cur = previewMode, n = net(), hosting = !!(n && n.active && n.role === 'host');
    var opts = '<option value="off">Off &mdash; whole board</option><option value="party">Party &mdash; all tokens</option>';
    if (hosting && n.roster) Object.keys(n.roster).forEach(function(k) { var p = n.roster[k]; if (p && p.id) opts += '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>'; });
    sel.innerHTML = opts;
    var ok = Array.prototype.some.call(sel.options, function(o) { return o.value === cur; });
    sel.value = ok ? cur : 'off'; if (!ok) previewMode = 'off';
}
function fillSightField() {
    var sel = ui('fogSightField'); if (!sel) return;
    var camp = activeCamp(), sys = camp && camp.system, cf = campFog(camp);
    var opts = '<option value="">Default only (no field)</option>';
    if (sys && Array.isArray(sys.fields)) sys.fields.forEach(function(f) {
        if (f && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource')) opts += '<option value="' + esc(f.id) + '">' + esc(f.label || f.key || f.id) + '</option>';
    });
    sel.innerHTML = opts;
    var ok = Array.prototype.some.call(sel.options, function(o) { return o.value === (cf.fields.sight || ''); });
    sel.value = ok ? (cf.fields.sight || '') : '';
    var wrap = ui('fogSightFieldRow'); if (wrap) wrap.style.display = (sys && Array.isArray(sys.fields) && sys.fields.length) ? '' : 'none';
}
function syncMenu() {
    var map = activeMap(); if (!map) return;
    var mf = mapFog(map), camp = activeCamp(), cf = campFog(camp);
    var on = ui('fogOn'); if (on) on.checked = !!mf.on;
    var gridless = ((map.meta && map.meta.gridType) || 'off') === 'off';
    var gr = ui('fogGridlessRow'); if (gr) gr.style.display = gridless ? '' : 'none';
    if (gridless) {
        var cell = mf.cell || { grid: 'square', len: 60 };
        document.querySelectorAll('#fogMenu .fog-grid-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.fgrid === cell.grid); });
        var len = ui('fogCellLen'); if (len && document.activeElement !== len) len.value = cell.len;
    }
    var sight = ui('fogSight'); if (sight && document.activeElement !== sight) sight.value = cf.defaults.sight || 0;
    fillSightField();
    // vision mode (all-around vs a facing cone), decoupled from grid type
    var vis = visionOf(map), vsel = ui('fogVision');
    if (vsel) vsel.value = vis.mode;
    var arcRow = ui('fogVisionArcRow'); if (arcRow) arcRow.style.display = vis.mode === 'arc' ? '' : 'none';
    var arcIn = ui('fogVisionArc'); if (arcIn && document.activeElement !== arcIn) arcIn.value = vis.arc;
    var vdef = ui('fogVisionDefault'); if (vdef) { var dv = cf.defaults.vision; vdef.checked = !!(dv && dv.mode === vis.mode && (dv.mode === 'all' || dv.arc === vis.arc)); }
    var fDef = ui('fogOnDefault'); if (fDef) fDef.checked = !!cf.defaults.on;   // "new maps start with fog on" (campaign default)
    var fEmpty = ui('fogEmptyScope'); if (fEmpty && document.activeElement !== fEmpty) fEmpty.value = cf.defaults.emptyFog === 'none' ? 'none' : 'whole';   // what a map with no play area marked does
    document.querySelectorAll('#fogMenu .fog-brush-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.fbrush === brush); });
    fillPreviewOptions();
    var note = ui('fogNote'); if (note) note.textContent = gridForMap(map) ? '' : 'Gridless map: pick a measurement grid above so fog can compute cells.';
}
function openMenu() { var m = ui('fogMenu'); if (!m || !canWrite()) return; syncMenu(); m.classList.add('show'); redraw(); }
function closeMenu() { var m = ui('fogMenu'); if (m) m.classList.remove('show'); }

/* ---------- wiring ---------- */
(function wire() {
    var menu = ui('fogMenu'); if (!menu) return;
    ['pointerdown', 'click'].forEach(function(ev) { menu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
    var on = ui('fogOn');
    if (on) on.addEventListener('change', function() {
        var map = activeMap(); if (!map) return;
        var mf = mapFog(map); mf.on = on.checked;
        if (mf.on && ((map.meta && map.meta.gridType) || 'off') === 'off' && !mf.cell) mf.cell = { grid: 'square', len: 60 };
        save(); syncMenu(); redraw();
        toast(mf.on ? 'Fog on for this map.' : 'Fog off for this map — the whole map shows.');
    });
    document.querySelectorAll('#fogMenu .fog-grid-btn').forEach(function(b) {
        b.addEventListener('click', function() { var map = activeMap(); if (!map) return; var mf = mapFog(map); mf.cell = { grid: b.dataset.fgrid, len: (mf.cell && mf.cell.len) || 60 }; save(); syncMenu(); redraw(); });
    });
    var len = ui('fogCellLen');
    if (len) len.addEventListener('change', function() { var map = activeMap(); if (!map) return; var mf = mapFog(map), v = Math.round(Number(len.value) || 0); mf.cell = { grid: (mf.cell && mf.cell.grid) || 'square', len: Math.max(core().LIMITS.len[0], Math.min(core().LIMITS.len[1], v || 60)) }; save(); syncMenu(); redraw(); });
    var sight = ui('fogSight');
    if (sight) sight.addEventListener('change', function() { var camp = activeCamp(); if (!camp) return; var cf = campFog(camp), v = Math.round(Number(sight.value) || 0); cf.defaults.sight = Math.max(0, Math.min(100000, v)); save(); syncMenu(); redraw(); });
    var sfield = ui('fogSightField');
    if (sfield) sfield.addEventListener('change', function() { var camp = activeCamp(); if (!camp) return; var cf = campFog(camp); cf.fields.sight = sfield.value || undefined; if (!sfield.value) delete cf.fields.sight; save(); syncMenu(); redraw(); });
    var vsel = ui('fogVision');
    if (vsel) vsel.addEventListener('change', function() {
        var map = activeMap(); if (!map) return; var mf = mapFog(map), C = core();
        if (vsel.value === 'arc') { var cur = (mf.vision && mf.vision.mode === 'arc' && mf.vision.arc) || (C ? C.LIMITS.arcDeg : 180); mf.vision = { mode: 'arc', arc: cur }; }
        else mf.vision = { mode: 'all', arc: 360 };
        save(); invalidateVision(); syncMenu(); redraw();
    });
    var varc = ui('fogVisionArc');
    if (varc) varc.addEventListener('change', function() {
        var map = activeMap(); if (!map) return; var mf = mapFog(map), C = core();
        var a = Math.round(Number(varc.value) || 0); a = Math.max(1, Math.min(360, a || (C ? C.LIMITS.arcDeg : 180)));
        mf.vision = { mode: 'arc', arc: a }; save(); invalidateVision(); syncMenu(); redraw();
    });
    var vdef = ui('fogVisionDefault');
    if (vdef) vdef.addEventListener('change', function() {
        var camp = activeCamp(), map = activeMap(); if (!camp || !map) return; var cf = campFog(camp);
        if (vdef.checked) cf.defaults.vision = visionOf(map); else delete cf.defaults.vision;
        save(); syncMenu();
        toast(vdef.checked ? 'New maps in this campaign will start with this vision.' : 'New maps will use the grid default again.');
    });
    var fAll = ui('fogOnAllMaps');
    if (fAll) fAll.addEventListener('click', function() {
        var camp = activeCamp(); if (!camp || !camp.items || !canWrite()) return;
        var N = net(), hosting = !!(N && N.active && N.role === 'host'), n = 0, ids = [];
        Object.keys(camp.items).forEach(function(k) { var m = camp.items[k]; if (m && m.type === 'map') { mapFog(m).on = true; n++; ids.push(m.id); } });
        save(); invalidateVision(); syncMenu(); redraw();
        // save() only resends the ACTIVE map; re-enforce fog on EVERY map so a player viewing another map doesn't keep an unfogged copy (with creatures the GM now hides)
        if (hosting && N.broadcastItemFiltered) ids.forEach(function(id) { N.broadcastItemFiltered(camp.id, id); });
        toast('Fog on for all ' + n + ' map' + (n === 1 ? '' : 's') + ' in this campaign.');
    });
    var fDef = ui('fogOnDefault');
    if (fDef) fDef.addEventListener('change', function() {
        var camp = activeCamp(); if (!camp) return; var cf = campFog(camp);
        if (fDef.checked) cf.defaults.on = true; else delete cf.defaults.on;
        save(); syncMenu();
        toast(fDef.checked ? 'New maps in this campaign will start with fog on.' : 'New maps will start with fog off.');
    });
    var fEmpty = ui('fogEmptyScope');
    if (fEmpty) fEmpty.addEventListener('change', function() {
        var camp = activeCamp(); if (!camp) return; var cf = campFog(camp);
        if (fEmpty.value === 'none') cf.defaults.emptyFog = 'none'; else delete cf.defaults.emptyFog;
        save(); invalidateVision(); syncMenu(); redraw();
        toast(fEmpty.value === 'none' ? 'Maps with no play area marked now show no fog.' : 'Maps with no play area marked fog the whole map.');
    });
    document.querySelectorAll('#fogMenu .fog-brush-btn').forEach(function(b) { b.addEventListener('click', function() { brush = b.dataset.fbrush === 'hide' ? 'hide' : 'reveal'; syncMenu(); }); });
    var rev = ui('fogRevealAll');
    if (rev) rev.addEventListener('click', function() { var map = activeMap(); if (!map) return; mapFog(map).mode = 'reveal'; save(); syncMenu(); redraw(); toast('Whole map revealed. Paint or pick a preview to fog again.'); });
    var cov = ui('fogCoverAll');
    if (cov) cov.addEventListener('click', function() { var map = activeMap(); if (!map) return; mapFog(map).mode = 'cover'; save(); syncMenu(); redraw(); toast('Whole map covered — only cells you reveal by hand show.'); });
    var prev = ui('fogPreview');
    if (prev) prev.addEventListener('change', function() { previewMode = prev.value || 'off'; redraw(); });
    var wrap = ui('whiteboardWrap');
    if (wrap && window.ResizeObserver) { try { new ResizeObserver(function() { if (active()) draw(); }).observe(wrap); } catch (e) {} }
    window.addEventListener('resize', function() { if (active()) draw(); });
    window.addEventListener('scroll', function() { if (active()) { lastDraw = 0; kick(); } }, true);
    document.addEventListener('click', function(e) {
        if (menu.classList.contains('show') && !e.target.closest('#fogMenu') && !e.target.closest('#fogModeBtn') && !window.isFogMode) closeMenu();
    });
    setTimeout(placeScreen, 0);
})();

function sync() {   // the VTT switch moved, or a session started / ended
    var b = ui('fogModeBtn'), showBtn = fogFeatureOn() && isGmView() && canWrite();
    if (b) { b.style.display = showBtn ? '' : 'none'; if (b.parentNode) b.parentNode.style.display = showBtn ? '' : 'none'; }   // hide the wrapper too, else its empty flex slot leaves a double gap in the toolbar
    if (!showBtn) { closeMenu(); if (window.isFogMode && window.wpExitFogMode) { window.isFogMode = false; window.wpExitFogMode(); } }
    invalidateVision();
    redraw();
}
function tableLeft() { previewMode = 'off'; invalidateVision(); clearCanvas(); }
function onSnapshot() { previewMode = 'off'; invalidateVision(); redraw(); }
function foreign(isForeign) { previewMode = 'off'; invalidateVision(); if (isForeign) clearCanvas(); else redraw(); }

window.wpFogSync = sync;
window.wpFogRedraw = redraw;
setTimeout(sync, 0);
window.wpFog = {
    // host enforcement (net.js)
    fogDropIds: fogDropIds, canSeePoint: canSeePoint, invalidateVision: invalidateVision, tokenSightCells: tokenSightCells, coverBetween: coverBetween,
    // GM tools
    paintAt: paintAt, toggleDoorAt: toggleDoorAt, openMenu: openMenu, closeMenu: closeMenu, sync: sync, redraw: redraw,
    setPreview: function(p) { previewMode = p || 'off'; redraw(); }, preview: function() { return previewMode; }, brush: function() { return brush; }, active: active,
    tableLeft: tableLeft, onSnapshot: onSnapshot, foreign: foreign,
    stats: function() { var map = activeMap(); return { on: map ? !!mapFog(map).on : false, mode: map ? mapFog(map).mode : null, preview: previewMode, brush: brush, fogMode: !!window.isFogMode, role: roleNow() }; }
};
