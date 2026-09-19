/* Fog of war / dynamic vision (1.5.0, v1) — the UI half: the see-through overlay the GM authors and previews on the
   play map, the fog toolbar mode's menu (#fogMenu: per-map on/off, the gridless ruleset+cell chooser, a default sight
   range, the reveal/hide brush, Reveal-all / Cover-all, and the player-fog preview picker), and the manual reveal/hide
   brush that whiteboard.js drives on a click in fog mode. wpFogSync rides the VTT feature switch. The pure geometry is
   fogcore.js (window.wpFogCore); the wire (per-recipient enforcement) is FV2 — in FV1 sanitizeItem STRIPS map.fog so
   no fog data travels and only the GM's own machine draws it. Design of record: docs/FOG_OF_WAR_PLAN.md §13. */
import { state } from './state.js';
import { getActiveMap, getActiveCampaign } from './models.js';

var ui = function(id) { return document.getElementById(id); };
function core() { return window.wpFogCore || null; }
function net() { return window.wpNet || null; }
function vtt() { return window.wpVtt || null; }
function toast(m) { if (window.appToast) window.appToast(m); }
// Only the GM's own machine draws fog in FV1 (no fog data reaches a client or the stream window)
function isGmView() { var v = vtt(); if (!v) return true; var m = v.mode(); return m === 'solo' || m === 'host'; }
function featureOn() { var v = vtt(); return v ? !!v.on('fog') : false; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function activeMap() { var m = getActiveMap(); return m && m.type === 'map' ? m : null; }
function activeCamp() { return getActiveCampaign() || null; }
function save() { if (window.wpSave) window.wpSave(true); }

/* ---------- the persisted fog data ---------- */
function DEF_MAP() { return { on: false, mode: 'auto', manual: { adds: [], cuts: [] } }; }
function mapFog(map) {   // the per-map store, lazily created and normalised
    if (!map) return DEF_MAP();
    var C = core();
    if (!map.fog || typeof map.fog !== 'object') map.fog = DEF_MAP();
    else if (C) map.fog = C.cleanFog(map.fog) || DEF_MAP();
    if (!map.fog.manual) map.fog.manual = { adds: [], cuts: [] };
    return map.fog;
}
function campFog(camp) {   // { fields:{sight}, defaults:{sight} } — v1 uses defaults.sight (a uniform sight range); the field mapping is FV2
    var C = core();
    if (!camp) return C ? C.cleanCampFog(null) : { fields: {}, defaults: { sight: 0 } };
    camp.fog = C ? C.cleanCampFog(camp.fog) : (camp.fog || { fields: {}, defaults: { sight: 0 } });
    return camp.fog;
}
function gridForMap(map) { var C = core(); if (!C || !map) return null; return C.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell); }
function perCellUnits() { try { return (window.wpMeasure && window.wpMeasure.cellYards()) || 1; } catch (e) { return 1; } }
// FV1: a single campaign-default sight range for every token (yards). FV2 resolves per-character sheet fields host-side.
function sightCells(camp) { var C = core(); if (!C) return 0; var cf = campFog(camp); return C.rangeToCells(cf.defaults.sight, perCellUnits()); }

/* ---------- who sees ---------- */
var previewMode = 'off';   // 'off' (whole board), 'party' (all character tokens), or a player's profile id
function tokenViewer(w, range) {
    return { x: w.x + (w.w || 60) / 2, y: w.y + (w.h || 52) / 2, front: w.front || 0, range: range, arc: 180 };
}
function viewers(map, camp) {
    var range = sightCells(camp), out = [];
    if (previewMode === 'off') return out;
    (map.whiteboard || []).forEach(function(w) {
        if (!w || !w.isChar || w.hidden) return;
        if (previewMode !== 'party' && w.ownerId !== previewMode) return;
        out.push(tokenViewer(w, range));
    });
    return out;
}
// The revealed cells to punch out of the fog, or null to mean "reveal everything" (no fog)
function revealedCells(map, camp, grid) {
    var C = core(), mf = mapFog(map);
    if (mf.mode === 'reveal') return null;
    var seen = Object.create(null), out = [];
    var add = function(cell) { var k = C.cellKey(cell, grid); if (!seen[k]) { seen[k] = 1; out.push(cell); } };
    if (mf.mode !== 'cover') viewers(map, camp).forEach(function(v) { C.visibleCells(v, grid).forEach(function(o) { add(o.cell); }); });
    (mf.manual.adds || []).forEach(function(c) { add(c); });
    var cut = Object.create(null); (mf.manual.cuts || []).forEach(function(c) { cut[C.cellKey(c, grid)] = 1; });
    return out.filter(function(cell) { return !cut[C.cellKey(cell, grid)]; });
}

/* ---------- the overlay layer (a canvas over #whiteboardWrap, never inside the scaled board — the #fxScreen pattern) ---------- */
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

// The overlay draws while fog is on AND (a preview is chosen OR the GM is painting) — otherwise the GM sees the whole board
function isFogMode() { return !!window.isFogMode; }
function active() {
    if (!featureOn() || !isGmView() || state.viewMode !== 'visual') return false;
    var map = activeMap(); if (!map) return false;
    if (!mapFog(map).on) return false;
    if (previewMode === 'off' && !isFogMode()) return false;
    return !!gridForMap(map);
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
    var cells = revealedCells(map, camp, grid);
    if (cells === null) return;   // Reveal-all: whole map shown, no fog
    var z = state.zoomLevel || 1, sx = wrap.scrollLeft, sy = wrap.scrollTop;
    // Fill the viewport with a see-through fog tint, then punch out the revealed cells (bounded by the vision cap)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(9,11,20,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    var pad = 80;
    for (var i = 0; i < cells.length; i++) {
        var ctr = C.cellCenter(cells[i], grid), lx = ctr.x * z - sx, ly = ctr.y * z - sy;
        if (lx < -pad || ly < -pad || lx > W + pad || ly > H + pad) continue;   // off-screen: nothing to punch
        if (grid.type === 'square') {
            var half = grid.size * z / 2;
            ctx.fillRect(lx - half - 1, ly - half - 1, half * 2 + 2, half * 2 + 2);
        } else {
            ctx.beginPath(); hexPath(ctx, lx, ly, grid.s * z * 1.02); ctx.fill();
        }
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

/* ---------- the manual brush (whiteboard.js calls paintAt on a click/drag in fog mode) ---------- */
var _saveTimer = null;
function queueSave() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(function() { _saveTimer = null; save(); }, 400); }
function withoutKey(list, key, grid, C) { return (list || []).filter(function(c) { return C.cellKey(c, grid) !== key; }); }
function paintAt(boardX, boardY, opposite) {
    if (!isGmView() || !canWrite()) return;
    var map = activeMap(), C = core(); if (!map || !C) return;
    var grid = gridForMap(map);
    if (!grid) { toast('This is a gridless map — choose a measurement grid in the fog menu first.'); return; }
    var mf = mapFog(map);
    if (mf.mode !== 'auto') { mf.mode = 'auto'; syncMenu(); }   // painting returns the map to computed vision + manual
    var cell = C.cellOf(boardX, boardY, grid), key = C.cellKey(cell, grid);
    var reveal = (brush === 'reveal') !== !!opposite;   // right-click paints the opposite brush
    mf.manual.adds = withoutKey(mf.manual.adds, key, grid, C);
    mf.manual.cuts = withoutKey(mf.manual.cuts, key, grid, C);
    var into = reveal ? mf.manual.adds : mf.manual.cuts, cap = C.LIMITS.manual;
    if (into.length < cap) into.push(cell);
    else toast('That map already has the most manual fog cells it can hold.');
    queueSave(); redraw();
}

/* ---------- the fog menu (#fogMenu, opened by the toolbar's fog mode button) ---------- */
var brush = 'reveal';
function fillPreviewOptions() {
    var sel = ui('fogPreview'); if (!sel) return;
    var cur = previewMode, n = net(), hosting = !!(n && n.active && n.role === 'host');
    var opts = '<option value="off">Off &mdash; whole board</option><option value="party">Party &mdash; all tokens</option>';
    if (hosting && n.roster) Object.keys(n.roster).forEach(function(k) { var p = n.roster[k]; if (p && p.id) opts += '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>'; });
    sel.innerHTML = opts;
    // keep the current choice if it still exists, else fall back to off
    var ok = Array.prototype.some.call(sel.options, function(o) { return o.value === cur; });
    sel.value = ok ? cur : 'off'; if (!ok) previewMode = 'off';
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
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
    document.querySelectorAll('#fogMenu .fog-brush-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.fbrush === brush); });
    fillPreviewOptions();
    var note = ui('fogNote');
    if (note) note.textContent = gridForMap(map) ? '' : 'Gridless map: pick a measurement grid above so fog can compute cells.';
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
        if (mf.on && ((map.meta && map.meta.gridType) || 'off') === 'off' && !mf.cell) mf.cell = { grid: 'square', len: 60 };   // a gridless map needs an assigned cell to compute vision — default to square / 60px
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
    document.querySelectorAll('#fogMenu .fog-brush-btn').forEach(function(b) { b.addEventListener('click', function() { brush = b.dataset.fbrush === 'hide' ? 'hide' : 'reveal'; syncMenu(); }); });
    var rev = ui('fogRevealAll');
    if (rev) rev.addEventListener('click', function() { var map = activeMap(); if (!map) return; mapFog(map).mode = 'reveal'; save(); syncMenu(); redraw(); toast('Whole map revealed. Paint or pick a preview to fog again.'); });
    var cov = ui('fogCoverAll');
    if (cov) cov.addEventListener('click', function() { var map = activeMap(); if (!map) return; mapFog(map).mode = 'cover'; save(); syncMenu(); redraw(); toast('Whole map covered — only cells you reveal by hand show.'); });
    var prev = ui('fogPreview');
    if (prev) prev.addEventListener('change', function() { previewMode = prev.value || 'off'; redraw(); });
    // the overlay follows the wrap and the window
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
    var b = ui('fogModeBtn'), show = featureOn() && isGmView() && canWrite();
    if (b) b.style.display = show ? '' : 'none';
    if (!show) { closeMenu(); if (window.isFogMode) { window.isFogMode = false; if (window.wpExitFogMode) window.wpExitFogMode(); } }
    redraw();
}
function tableLeft() { previewMode = 'off'; clearCanvas(); }
function onSnapshot() { previewMode = 'off'; redraw(); }
function foreign(isForeign) { if (isForeign) { previewMode = 'off'; clearCanvas(); } else redraw(); }

window.wpFogSync = sync;
window.wpFogRedraw = redraw;
setTimeout(sync, 0);
window.wpFog = {
    paintAt: paintAt, openMenu: openMenu, closeMenu: closeMenu, sync: sync, redraw: redraw,
    setPreview: function(p) { previewMode = p || 'off'; redraw(); }, preview: function() { return previewMode; },
    brush: function() { return brush; }, active: active,
    tableLeft: tableLeft, onSnapshot: onSnapshot, foreign: foreign,
    stats: function() { var map = activeMap(); return { on: map ? !!mapFog(map).on : false, mode: map ? mapFog(map).mode : null, preview: previewMode, brush: brush, fogMode: !!window.isFogMode }; }
};
