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
function viewersFor(map, camp, ownerId) {
    var out = [];
    (map.whiteboard || []).forEach(function(w) {
        if (!w || !w.isChar || w.hidden) return;
        if (ownerId && ownerId !== '*' && w.ownerId !== ownerId) return;
        out.push({ x: w.x + (w.w || 60) / 2, y: w.y + (w.h || 52) / 2, front: ((w.rot || 0) + (w.front || 0)), range: tokenSightCells(w, map, camp), arc: 180 });   // world facing = rot + front, so the vision arc follows the token's rotation
    });
    return out;
}
// ---- sight-blockers: the opaque-cell key set for a map, built from flagged board items (v1: static walls) ----
var _blockerCache = Object.create(null), _blockerWarned = Object.create(null);
function eligibleBlocker(w) {
    if (!w || !w.blocksSight || w.hidden || w.rot) return false;   // hidden/rotated never block (host & client must agree)
    if (w.fill) return true;                                        // a fill-bucket cell
    return w.type === 'rect' || w.type === 'hexagon';               // an axis-aligned rect or hexagon shape
}
function blockersFor(map, grid) {
    if (!map || !grid) return null;
    if (_blockerCache[map.id] !== undefined) return _blockerCache[map.id];
    var C = core(), wb = map.whiteboard || [], set = Object.create(null), n = 0, over = false;
    for (var i = 0; i < wb.length && !over; i++) {
        var w = wb[i]; if (!eligibleBlocker(w)) continue;
        var cells;
        if (w.fill) cells = [C.cellOf(w.x + (w.w || 0) / 2, w.y + (w.h || 0) / 2, grid)];
        else if (w.type === 'hexagon') cells = C.cellsUnderHex(w.x, w.y, w.w || 0, w.h || 0, grid);
        else cells = C.cellsUnderRect(w.x, w.y, w.w || 0, w.h || 0, grid);
        for (var j = 0; j < cells.length; j++) { var k = C.cellKey(cells[j], grid); if (!set[k]) { set[k] = 1; if (++n > C.LIMITS.blockerCells) { over = true; break; } } }
    }
    if (over && !_blockerWarned[map.id]) { _blockerWarned[map.id] = 1; toast('Too many sight-blockers on this map — vision is not being blocked here.'); }
    if (!over) _blockerWarned[map.id] = 0;
    var result = (over || n === 0) ? null : set;                    // over cap or none → no occlusion (fail open)
    _blockerCache[map.id] = result;
    return result;
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
    var list = revealedCellList(map, camp, recipientId);
    if (list === null) return null;                                     // reveal-all: nothing hidden
    var C = core(), keys = Object.create(null); list.forEach(function(c) { keys[C.cellKey(c, grid)] = 1; });
    var drop = Object.create(null), any = false;
    (map.whiteboard || []).forEach(function(w) {
        if (!w || !w.isChar) return;
        if (w.ownerId === recipientId) return;                          // your own token is always yours
        if (!keys[C.cellKey(C.cellOf(w.x + (w.w || 60) / 2, w.y + (w.h || 52) / 2, grid), grid)]) { drop[w.id] = 1; any = true; }
    });
    return any ? drop : null;
}
// A cached revealed-key set per (recipient, map): stable during a drag (the recipient's own tokens don't move), so the
// live pos fast-path stays cheap. Cleared by invalidateVision() on any save / token move / snapshot / fog edit.
var _keyCache = Object.create(null);
function invalidateVision() { _keyCache = Object.create(null); _blockerCache = Object.create(null); }
function canSeePoint(recipientId, camp, map, x, y) {
    if (!fogFeatureOn() || !map) return true;
    var mf = mapFog(map); if (!mf.on) return true;
    var grid = gridForMap(map); if (!grid) return true;
    var k = recipientId + '|' + map.id, ce = _keyCache[k];
    if (!ce) {
        var list = revealedCellList(map, camp, recipientId);
        ce = { all: list === null, keys: Object.create(null) };
        if (list) { var C = core(); list.forEach(function(c) { ce.keys[C.cellKey(c, grid)] = 1; }); }
        _keyCache[k] = ce;
    }
    if (ce.all) return true;
    return !!ce.keys[core().cellKey(core().cellOf(x, y, grid), grid)];
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
    var cells = revealedCellList(map, camp, drawOwner());
    if (cells === null) return;                                    // reveal-all: no fog
    var z = state.zoomLevel || 1, sx = wrap.scrollLeft, sy = wrap.scrollTop;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = isClientView() ? 'rgba(5,6,12,0.97)' : 'rgba(9,11,20,0.62)';   // players: opaque; the GM: see-through
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    var pad = 80;
    for (var i = 0; i < cells.length; i++) {
        var ctr = C.cellCenter(cells[i], grid), lx = ctr.x * z - sx, ly = ctr.y * z - sy;
        if (lx < -pad || ly < -pad || lx > W + pad || ly > H + pad) continue;
        if (grid.type === 'square') { var half = grid.size * z / 2; ctx.fillRect(lx - half - 1, ly - half - 1, half * 2 + 2, half * 2 + 2); }
        else { ctx.beginPath(); hexPath(ctx, lx, ly, grid.s * z * 1.02); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
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
    fogDropIds: fogDropIds, canSeePoint: canSeePoint, invalidateVision: invalidateVision, tokenSightCells: tokenSightCells,
    // GM tools
    paintAt: paintAt, openMenu: openMenu, closeMenu: closeMenu, sync: sync, redraw: redraw,
    setPreview: function(p) { previewMode = p || 'off'; redraw(); }, preview: function() { return previewMode; }, brush: function() { return brush; }, active: active,
    tableLeft: tableLeft, onSnapshot: onSnapshot, foreign: foreign,
    stats: function() { var map = activeMap(); return { on: map ? !!mapFog(map).on : false, mode: map ? mapFog(map).mode : null, preview: previewMode, brush: brush, fogMode: !!window.isFogMode, role: roleNow() }; }
};
