/* The map environment's tool (1.6.0, docs/MAP_ENVIRONMENT_PLAN.md 11 and 14; the owner, by prompt: "temperature should be its own button
   setting that has its own tools that you can use to apply or take away or set or reset or change the temperature of an area you define",
   and of the sheet: "C. Gauge", "As drawn"). The GM's alone, on the machine that owns the campaign. It paints a map's environment cells
   (meta.envCells) with the readings typed in its options, a brush 1, 3 or 5 cells wide, a dragged box or a piece's outline, and Erase gives
   cells back to the map's own value (meta.env), which the options set too. While the tool is in hand the painted cells are drawn over the
   board, tinted and with their figure, for the GM alone; nothing of it is sent (net.js keeps both keys off the wire). What a character reads
   is worked out by fogcore envAt and written by sheets.js envFollow. Published as window.wpEnvTool. */
import { state } from './state.js';
import { getActiveMap, getActiveCampaign } from './models.js';
import { save, toast } from './io.js';

// [systemcheck:envtool-start]
var ENV_BRUSHES = ['paint', 'box', 'piece', 'erase'], ENV_WIDTHS = [1, 3, 5];
var _env = { brush: 'paint', w: 1, vals: {}, stroke: null };
function envCore() { return typeof window !== 'undefined' ? window.wpFogCore || null : null; }
function envLoad() { try { var o = JSON.parse(localStorage.getItem('wp_envTool') || 'null'); if (o && ENV_BRUSHES.indexOf(o.brush) >= 0) _env.brush = o.brush; if (o && ENV_WIDTHS.indexOf(o.w) >= 0) _env.w = o.w; } catch (e) { /* kept for this computer where it can be */ } }
function envKeep() { try { localStorage.setItem('wp_envTool', JSON.stringify({ brush: _env.brush, w: _env.w })); } catch (e) { /* as above */ } }
function envReadings(camp) { var s = camp && camp.system; return s && Array.isArray(s.env) ? s.env.filter(function(e) { return !!e && typeof e.key === 'string'; }) : []; }
function envMetric() { return !!state && state.measureUnit === 'metric'; }
// A temperature is stored in degrees Celsius and shown in the viewer's half of Imperial or Metric; any other reading as it is
function envShown(e, c, metric) { return e && e.unit === 'temp' && !metric ? c * 9 / 5 + 32 : c; }
function envStored(e, v, metric) { return e && e.unit === 'temp' && !metric ? (v - 32) * 5 / 9 : v; }
function envUnit(e, metric) { return e && e.unit === 'temp' ? (metric ? '°C' : '°F') : (e && typeof e.unit === 'string' ? e.unit : ''); }
function envFig(n) { return String(Math.round(n * 10) / 10); }
function envGrid(map, FC) { return map && FC ? FC.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell) : null; }
function envCellOfKey(k, grid) { var m = /^(-?\d+)(,|:)(-?\d+)$/.exec(String(k)); if (!m || !grid) return null; return grid.type === 'square' ? (m[2] === ',' ? { c: +m[1], r: +m[3] } : null) : (m[2] === ':' ? { q: +m[1], r: +m[3] } : null); }
// The cells one press or drag covers: the brush's block round each cell the pointer passes, a dragged box's cells, or a piece's cells (the
// topmost plain piece under the point that is no token, waiting token or GM note card), each by its key
function envStrokeKeys(how, pts, map, grid, FC) {
    var keys = {}; if (!FC || !grid || !Array.isArray(pts) || !pts.length) return [];
    var add = function(cells) { (cells || []).forEach(function(c) { keys[FC.cellKey(c, grid)] = 1; }); };
    if (how === 'box' && pts.length >= 2) { var a = pts[0], b = pts[pts.length - 1], x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y); add(w < 1 && h < 1 ? [FC.cellOf(a.x, a.y, grid)] : FC.cellsUnderRect(x, y, w, h, grid)); }
    else if (how === 'piece') {
        var p = pts[0], ck = FC.cellKey(FC.cellOf(p.x, p.y, grid), grid), hit = null;
        (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(it) {
            if (!it || it.isChar || it.waiting || it.gmNoteFor || it.type === 'text' || it.type === 'light' || it.type === 'path' || FC.itemOver(it, grid)) return;
            var cs = FC.itemCells(it, grid); if (cs.some(function(c) { return FC.cellKey(c, grid) === ck; })) hit = cs;
        });
        add(hit);
    }
    else { var r = _env.w === 5 ? 2 : _env.w === 3 ? 1 : 0; pts.forEach(function(q) { add(FC.cellsNear(FC.cellOf(q.x, q.y, grid), r, grid)); }); }
    return Object.keys(keys);
}
// A stroke applied to a map's painted cells, pure: paint sets each reading of vals on each cell and keeps its other readings, erase takes the
// cells off. { cells: the new painted cells or null for none, over: true where they would pass the core's cap (nothing is then changed) }
function envPaint(cells, keys, vals, how, FC) {
    var out = {}; if (cells && typeof cells === 'object' && !Array.isArray(cells)) Object.keys(cells).forEach(function(k) { out[k] = Object.assign({}, cells[k]); });
    (Array.isArray(keys) ? keys : []).forEach(function(k) { if (how === 'erase') { delete out[k]; return; } var c = out[k] || {}; Object.keys(vals || {}).forEach(function(r) { c[r] = vals[r]; }); out[k] = c; });
    if (Object.keys(out).length > FC.LIMITS.envCells) return { cells: cells || null, over: true };
    return { cells: FC.cleanEnvCells(out), over: false };
}
// The tint of a painted cell, by its temperature where it has one: blue cold (below 10 C), red hot (above 32 C), else the app's gold
function envTint(vals, readings) {
    var t = null; (readings || []).forEach(function(e) { if (t === null && e.unit === 'temp' && vals && typeof vals[e.key] === 'number') t = vals[e.key]; });
    return t === null ? 'rgba(212,166,74,0.22)' : t < 10 ? 'rgba(90,150,230,0.30)' : t > 32 ? 'rgba(230,90,70,0.30)' : 'rgba(212,166,74,0.18)';
}
// [systemcheck:envtool-end]
function envMay() { var n = window.wpNet; return !(n && n.active && n.role === 'client') && !(n && n.stream) && !!(window.wpCanPersistLocal && window.wpCanPersistLocal()); }
function say(t) { toast(t); }
// The options: the four ways, the widths, a box a reading for what is painted, and a box a reading for the map's own value
function sync() {
    var menu = document.getElementById('envMenu'); if (!menu) return;
    menu.querySelectorAll('[data-envbrush]').forEach(function(b) { var on = b.getAttribute('data-envbrush') === _env.brush; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    menu.querySelectorAll('[data-envw]').forEach(function(b) { var on = +b.getAttribute('data-envw') === _env.w; b.classList.toggle('on', on); b.disabled = _env.brush !== 'paint' && _env.brush !== 'erase'; });
    var camp = getActiveCampaign(), rs = envReadings(camp), map = getActiveMap(), metric = envMetric(), FC = envCore();
    var none = document.getElementById('envNone'); if (none) none.hidden = rs.length > 0;
    var vbox = document.getElementById('envVals'), obox = document.getElementById('envOwn'); if (!vbox || !obox) return;
    vbox.textContent = ''; obox.textContent = '';
    var own = map && map.meta && FC ? FC.cleanEnvVals(map.meta.env) || {} : {};
    rs.forEach(function(e) {
        var row = function(box, cls, cap, val, title) {
            var l = document.createElement('label'); l.className = 'draw-menu-row env-row'; l.title = title;
            var n = document.createElement('span'); n.textContent = cap; l.appendChild(n);
            var wrap = document.createElement('span'); var i = document.createElement('input'); i.type = 'number'; i.step = 'any'; i.className = 'field ' + cls; i.dataset.key = e.key; i.value = val; wrap.appendChild(i);
            var u = document.createElement('span'); u.className = 'env-unit'; u.textContent = envUnit(e, metric); wrap.appendChild(u); l.appendChild(wrap); box.appendChild(l);
        };
        row(vbox, 'env-val', e.label, typeof _env.vals[e.key] === 'number' ? envFig(envShown(e, _env.vals[e.key], metric)) : '', 'What Paint, Drag a box and A piece’s outline set. Empty: those cells keep the map’s own ' + e.label);
        row(obox, 'env-own', 'This map’s own ' + e.label.toLowerCase(), typeof own[e.key] === 'number' ? envFig(envShown(e, own[e.key], metric)) : '', 'Where no cell is painted. Empty: this map gives no ' + e.label.toLowerCase());
    });
    var cnt = document.getElementById('envCount'); if (cnt) { var nC = map && map.meta && map.meta.envCells && typeof map.meta.envCells === 'object' ? Object.keys(map.meta.envCells).length : 0; cnt.textContent = nC ? nC + (nC === 1 ? ' cell painted on this map.' : ' cells painted on this map.') : 'No cell painted on this map.'; }
}
function onInput(t) {
    var camp = getActiveCampaign(), e = envReadings(camp).filter(function(x) { return x.key === t.dataset.key; })[0]; if (!e) return;
    var s = String(t.value).trim(), v = Number(s), ok = s !== '' && isFinite(v), metric = envMetric();
    if (t.classList.contains('env-val')) { if (ok) _env.vals[e.key] = envStored(e, v, metric); else delete _env.vals[e.key]; return; }
    if (!t.classList.contains('env-own')) return;
    var map = getActiveMap(), FC = envCore(); if (!map || !FC || !envMay()) return;
    map.meta = map.meta || {}; var own = FC.cleanEnvVals(map.meta.env) || {};
    if (ok) own[e.key] = envStored(e, v, metric); else delete own[e.key];
    var c = FC.cleanEnvVals(own); if (c) map.meta.env = c; else delete map.meta.env;
    save(); if (window.wpStepLog) window.wpStepLog('envtool v1', 'own', { readings: c ? Object.keys(c).length : 0 });
}
// A stroke: begun at a press, carried by the moves, laid at the release (a box at once, as the fog's box is)
function strokeStart(x, y) { if (!envMay()) return; _env.stroke = { pts: [{ x: x, y: y }] }; if (_env.brush === 'paint' || _env.brush === 'erase') draw(); }
function strokeMove(x, y) { var s = _env.stroke; if (!s) return; if (_env.brush === 'box') { s.pts[1] = { x: x, y: y }; draw(); return; } if (_env.brush === 'paint' || _env.brush === 'erase') { s.pts.push({ x: x, y: y }); if (s.pts.length > 4000) s.pts.splice(1, 1); } }
function strokeEnd(cancel) {
    var s = _env.stroke; _env.stroke = null; if (!s || cancel) { draw(); return; }
    var map = getActiveMap(), FC = envCore(), grid = envGrid(map, FC);
    if (!map || !FC) return;
    if (!grid) { say('This map has no grid to paint on. Set a grid, or give the map its own value in the options.'); draw(); return; }
    var how = _env.brush === 'erase' ? 'erase' : 'paint';
    if (how === 'paint' && !Object.keys(_env.vals).length) { say('Type a value for at least one reading in the Environment options first.'); draw(); return; }
    var keys = envStrokeKeys(_env.brush === 'erase' ? 'paint' : _env.brush, s.pts, map, grid, FC);
    if (_env.brush === 'piece' && !keys.length) { say('No piece there to take the outline of.'); draw(); return; }
    map.meta = map.meta || {};
    var r = envPaint(map.meta.envCells, keys, _env.vals, how, FC);
    if (r.over) { say('A map keeps at most ' + FC.LIMITS.envCells + ' painted cells. Nothing was painted.'); draw(); return; }
    if (r.cells) map.meta.envCells = r.cells; else delete map.meta.envCells;
    save();
    if (window.wpStepLog) window.wpStepLog('envtool v1', how, { cells: keys.length, total: r.cells ? Object.keys(r.cells).length : 0 });
    sync(); draw();
}
function setBrush(b) { if (ENV_BRUSHES.indexOf(b) < 0) return; _env.brush = b; envKeep(); sync(); }
function setWidth(w) { if (ENV_WIDTHS.indexOf(w) < 0) return; _env.w = w; envKeep(); sync(); }
// The layer over the board while the tool is in hand: each painted cell tinted, with its first reading's figure; a dragged box as an outline
function draw() {
    var wb = document.getElementById('whiteboard'); if (!wb) return;
    var svg = document.getElementById('envLayer'), on = !!window.isEnvMode && envMay(), map = on ? getActiveMap() : null, FC = envCore(), grid = map ? envGrid(map, FC) : null;
    if (!on || !grid) { if (svg) svg.remove(); return; }
    var NS = 'http://www.w3.org/2000/svg';
    if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.setAttribute('id', 'envLayer'); svg.setAttribute('aria-hidden', 'true'); wb.appendChild(svg); }
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var cells = map.meta && map.meta.envCells && typeof map.meta.envCells === 'object' ? map.meta.envCells : {}, rs = envReadings(getActiveCampaign()), metric = envMetric();
    Object.keys(cells).forEach(function(k) {
        var cell = envCellOfKey(k, grid); if (!cell) return; var vals = cells[k] || {};
        var poly = document.createElementNS(NS, 'polygon'); poly.setAttribute('points', FC.cellCorners(cell, grid).map(function(p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ')); poly.setAttribute('fill', envTint(vals, rs)); poly.setAttribute('class', 'env-cell'); svg.appendChild(poly);
        var e = rs.filter(function(x) { return typeof vals[x.key] === 'number'; })[0] || null; if (!e) return;
        var ctr = FC.cellCenter(cell, grid), tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', ctr.x.toFixed(1)); tx.setAttribute('y', (ctr.y + 4).toFixed(1)); tx.setAttribute('class', 'env-fig'); tx.textContent = envFig(envShown(e, vals[e.key], metric)) + envUnit(e, metric).replace(/^\s*/, ''); svg.appendChild(tx);
    });
    var st = _env.stroke; if (st && _env.brush === 'box' && st.pts.length >= 2) { var a = st.pts[0], b = st.pts[1], rc = document.createElementNS(NS, 'rect'); rc.setAttribute('x', Math.min(a.x, b.x)); rc.setAttribute('y', Math.min(a.y, b.y)); rc.setAttribute('width', Math.abs(a.x - b.x)); rc.setAttribute('height', Math.abs(a.y - b.y)); rc.setAttribute('class', 'env-box'); svg.appendChild(rc); }
}
function wire() {
    envLoad();
    var menu = document.getElementById('envMenu'); if (!menu) return;
    menu.querySelectorAll('[data-envbrush]').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); setBrush(b.getAttribute('data-envbrush')); }); });
    menu.querySelectorAll('[data-envw]').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); setWidth(+b.getAttribute('data-envw')); }); });
    menu.addEventListener('change', function(e) { var t = e.target; if (t && t.classList && (t.classList.contains('env-val') || t.classList.contains('env-own'))) onInput(t); });
    menu.addEventListener('input', function(e) { var t = e.target; if (t && t.classList && t.classList.contains('env-val')) onInput(t); });
}
if (typeof window !== 'undefined') {
    window.wpEnvTool = { sync: sync, draw: draw, strokeStart: strokeStart, strokeMove: strokeMove, strokeEnd: strokeEnd, may: envMay, setBrush: setBrush, setWidth: setWidth };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
export { envPaint, envStrokeKeys, envTint, envShown, envStored, envUnit, envCellOfKey };
