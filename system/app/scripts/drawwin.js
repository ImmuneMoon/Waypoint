// The paint window (1.6.2, backlog 232; the owner, 2026-11-13: "we sould let people draw textures and other items in waypoint too", and
// by prompt: pen, soft brush, eraser, fill, line, rectangle, circle, text, a selection you move or turn and a color picked from the picture,
// with Mirror left and right; for a pattern "Strokes wrap + live 3x3"; "Layers like a paint program"; and what it opens on "optional for
// the user"). The pack maker opens it from Draw… beside Use a picture… (furnpack.js) through window.wpPaint.open(opts):
//   opts.title   what is being drawn, said in the window's head
//   opts.cells   [across, down] for a furnishing, or opts.tile, the cells one picture of a pattern covers, which also makes strokes wrap
//   opts.px      a cell's pixels (the maker's template size)
//   opts.mine    the address of the picture it has now, or none
//   opts.wp      Waypoint's own drawing: { url } of a picture, or { paint(ctx, w, h) } that draws it
//   opts.done(file)  handed a PNG File at Done
// It keeps nothing: what it draws lives in this window until Done hands it on, and the maker keeps it as a picture of the draft.
// The pure half is drawcore.js. Everything here is the page's: canvases, the pointer, the keys.
import './drawcore.js';
import { toast } from './io.js';
import { showConfirm } from './dialogs.js';

var PIC_MAX = 4 * 1024 * 1024;
function DC() { return window.wpDrawCore; }
function log(step, facts) { if (window.wpStepLog) window.wpStepLog('paint v1', step, facts || {}); }
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function ico(d) { var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path'); s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.appendChild(p); return s; }
var EYE = 'M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';   // the fog's Reveal brush
var EYE_OFF = 'M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7zM4 4l16 16';
var SWATCHES = ['#000000', '#ffffff', '#6f4a2c', '#3b2a1b', '#c9a24a', '#8a8a92', '#4a7a3a', '#3a5f8a', '#a83a32', '#e3a63b'];

var _p = null, _uid = 0;
function uid() { _uid += 1; return 'L' + _uid; }
function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctxOf(c) { return c.getContext('2d', { willReadFrequently: true }); }
function active() { return _p ? _p.layers[_p.at] : null; }

// [drawcheck:hist-start]
// A step of undo: the layers' list as it stood and the pixels of the layers named, so that the same swap takes it back and forward
function snap(ids) {
    var e = { meta: _p.layers.map(function(l) { return { id: l.id, name: l.name, hidden: l.hidden, op: l.op }; }), at: _p.at, datas: {}, bytes: 0 };
    ids.forEach(function(id) { var L = _p.layers.filter(function(l) { return l.id === id; })[0]; if (L) { e.datas[id] = ctxOf(L.cv).getImageData(0, 0, _p.w, _p.h); e.bytes += _p.w * _p.h * 4; } });
    return e;
}
function push(ids) { var e = snap(ids); DC().histPush(_p.hist, e); _p.dirty = true; bar(); return e; }
// Puts a step back and answers the step that undoes that: the layers it names, and those standing now that it does not name
function swap(e) {
    var keep = Object.keys(e.datas), now = _p.layers.map(function(l) { return l.id; });
    now.forEach(function(id) { if (!e.meta.some(function(m) { return m.id === id; }) && keep.indexOf(id) < 0) keep.push(id); });
    var back = snap(keep), byId = {};
    _p.layers.forEach(function(l) { byId[l.id] = l; });
    _p.layers = e.meta.map(function(m) { var L = byId[m.id] || { id: m.id, cv: cv(_p.w, _p.h) }; L.name = m.name; L.hidden = m.hidden; L.op = m.op; return L; });
    Object.keys(e.datas).forEach(function(id) { var L = _p.layers.filter(function(l) { return l.id === id; })[0]; if (L) ctxOf(L.cv).putImageData(e.datas[id], 0, 0); });
    _p.at = Math.max(0, Math.min(_p.layers.length - 1, e.at));
    return back;
}
function undo() { if (!_p) return; if (_p.float) { floatCancel(); return; } if (DC().histUndo(_p.hist, swap)) { _p.dirty = true; log('undo', {}); paper(); } }
function redo() { if (!_p || _p.float) return; if (DC().histRedo(_p.hist, swap)) { _p.dirty = true; log('redo', {}); paper(); } }
// [drawcheck:hist-end]

// The stage: a checker, the trace, each layer's canvas bottom first, the stroke being drawn above the layer it goes onto, and the overlay
function paper() {
    var pp = $('paintPaper'); if (!pp || !_p) return;
    var z = _p.zoom, W = _p.w * z, H = _p.h * z;
    pp.style.width = W + 'px'; pp.style.height = H + 'px';
    pp.classList.toggle('pw-pixels', z >= 2);
    var typing = !!_p.textEl && document.activeElement === _p.textEl, erasing = !!(_p.stroke && _p.stroke.erase);
    pp.textContent = '';
    var tr = _p.traceEl; if (tr && _p.trace) pp.appendChild(tr);
    _p.layers.forEach(function(L, i) {
        L.cv.className = 'pw-layer'; L.cv.style.opacity = String(L.op); L.cv.style.display = L.hidden ? 'none' : ''; L.cv.style.visibility = erasing && i === _p.at ? 'hidden' : '';
        pp.appendChild(L.cv);
        if (i === _p.at) { _p.prev.className = 'pw-layer pw-prev'; _p.prev.style.opacity = String(L.op); _p.prev.style.display = erasing ? '' : 'none'; pp.appendChild(_p.prev); _p.buf.className = 'pw-layer pw-buf'; pp.appendChild(_p.buf); }
    });
    _p.over.className = 'pw-layer pw-over'; pp.appendChild(_p.over);
    if (_p.textEl) { pp.appendChild(_p.textEl); textPlace(); if (typing) _p.textEl.focus(); }
    drawOver(); layersDraw(); bar(); tileSoon();
    var zv = $('paintZoomV'); if (zv) zv.textContent = Math.round(z * 100) + '%';
}
// What every visible layer makes together, the stroke being drawn among them, onto ctx at scale s
function compose(g, s, withBuf) {
    _p.layers.forEach(function(L, i) {
        if (L.hidden) return;
        var mine = withBuf && i === _p.at && _p.stroke;
        g.globalAlpha = L.op; g.drawImage(mine && _p.stroke.erase ? _p.prev : L.cv, 0, 0, _p.w * s, _p.h * s);
        if (mine && _p.stroke.buf) { g.globalAlpha = L.op * _p.op; g.drawImage(_p.buf, 0, 0, _p.w * s, _p.h * s); }
        if (withBuf && i === _p.at && _p.float) { g.globalAlpha = L.op; g.save(); g.scale(s, s); floatOn(g); g.restore(); }
    });
    g.globalAlpha = 1;
}
// A selection that floats, drawn where it stands now, with a pattern's wrapping copies
function floatOn(g) {
    var f = _p.float; if (!f) return;
    var cx = f.x + f.w / 2, cy = f.y + f.h / 2, one = function(dx, dy) { g.save(); g.translate(cx + dx, cy + dy); g.rotate(f.a); g.drawImage(f.cv, -f.w / 2, -f.h / 2, f.w, f.h); g.restore(); };
    if (_p.wrap) [-1, 0, 1].forEach(function(i) { [-1, 0, 1].forEach(function(j) { one(i * _p.w, j * _p.h); }); }); else one(0, 0);
}
// The live 3 by 3 of a pattern: nine copies, the seams in gold
var _tileT = 0;
function tileSoon() { if (!_p || !_p.wrap || _tileT) return; _tileT = setTimeout(function() { _tileT = 0; tileDraw(); }, 50); }
function tileDraw() {
    var c = $('paintTile'); if (!c || !_p || !_p.wrap) return;
    var g = c.getContext('2d'), n = c.width / 3; g.clearRect(0, 0, c.width, c.height);
    var one = cv(Math.max(1, Math.round(n)), Math.max(1, Math.round(n))), og = one.getContext('2d'); compose(og, n / _p.w, true);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) g.drawImage(one, i * n, j * n, n, n);
    g.strokeStyle = 'rgba(227,166,59,.75)'; g.lineWidth = 1; g.beginPath();
    for (var k = 1; k < 3; k++) { g.moveTo(Math.round(k * n) + 0.5, 0); g.lineTo(Math.round(k * n) + 0.5, c.height); g.moveTo(0, Math.round(k * n) + 0.5); g.lineTo(c.width, Math.round(k * n) + 0.5); }
    g.stroke();
}

// Draws with each copy: the plain stroke, its mirror, and for a pattern the neighbors that wrap it
function withCopies(g, fn) {
    DC().copiesOf(_p.w, _p.h, _p.wrap, _p.mirror).forEach(function(c) { g.save(); g.setTransform(c.flip ? -1 : 1, 0, 0, 1, (c.flip ? _p.w : 0) + c.dx, c.dy); fn(g); g.restore(); });
}
function shapePath(g, t, a, b) {
    g.beginPath();
    if (t === 'line') { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); return; }
    var r = DC().rectOf(a.x, a.y, b.x, b.y, !!_p.shift);
    if (t === 'rect') g.rect(r.x, r.y, r.w, r.h);
    else g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
}
function shapeAt(g, t, a, b, alpha) {   // through a scratch canvas: its copies whole, then once at alpha
    var sc = _p.tmp.getContext('2d'); sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, _p.w, _p.h); shapeOn(sc, t, a, b);
    g.save(); g.globalAlpha = alpha; g.drawImage(_p.tmp, 0, 0); g.restore();
}
function shapeOn(g, t, a, b) {
    var e = t === 'line' && _p.shift ? DC().constrain(a.x, a.y, b.x, b.y) : b;
    withCopies(g, function(h) {
        h.lineWidth = _p.size; h.lineCap = 'round'; h.lineJoin = 'round'; h.strokeStyle = _p.color; h.fillStyle = _p.color;
        shapePath(h, t, a, e); if (t !== 'line' && _p.filled) h.fill(); else h.stroke();
    });
}
// The overlay: a shape being drawn, the box being picked, or the selection that floats with its turn handle
function drawOver() {
    if (!_p) return;
    var g = _p.over.getContext('2d'), z = _p.zoom; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, _p.w, _p.h);
    var s = _p.stroke;
    if (s && s.shape && s.b) shapeAt(g, s.shape, s.a, s.b, _p.op);
    if (s && s.pick && s.b) { var r = DC().rectOf(s.a.x, s.a.y, s.b.x, s.b.y, false); dashed(g, r.x, r.y, r.w, r.h, 0, z); }
    var f = _p.float; if (!f) return;
    var cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    floatOn(g);
    dashed(g, f.x, f.y, f.w, f.h, f.a, z);
    var lift = 20 / z, hp = DC().rotPt(cx, f.y - lift, cx, cy, f.a), tp = DC().rotPt(cx, f.y, cx, cy, f.a);
    g.save(); g.strokeStyle = '#e3a63b'; g.lineWidth = 1.5 / z; g.beginPath(); g.moveTo(tp.x, tp.y); g.lineTo(hp.x, hp.y); g.stroke();
    g.fillStyle = '#e3a63b'; g.beginPath(); g.arc(hp.x, hp.y, 5 / z, 0, Math.PI * 2); g.fill(); g.restore();
}
function dashed(g, x, y, w, h, a, z) {
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(a || 0); g.lineWidth = 1.5 / z;
    g.strokeStyle = '#000'; g.setLineDash([]); g.strokeRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = '#e3a63b'; g.setLineDash([5 / z, 4 / z]); g.strokeRect(-w / 2, -h / 2, w, h); g.restore();
}

// [drawcheck:tools-start]
function at(ev) { var r = $('paintPaper').getBoundingClientRect(); return { x: (ev.clientX - r.left) / _p.zoom, y: (ev.clientY - r.top) / _p.zoom }; }
function seg(g, a, b) { withCopies(g, function(h) { h.lineCap = 'round'; h.lineJoin = 'round'; h.lineWidth = _p.size; h.strokeStyle = _p.color; h.beginPath(); h.moveTo(a.x, a.y); h.lineTo(b.x, b.y); h.stroke(); if (a.x === b.x && a.y === b.y) { h.fillStyle = _p.color; h.beginPath(); h.arc(a.x, a.y, _p.size / 2, 0, Math.PI * 2); h.fill(); } }); }
function dabs(g, a, b) {
    var D = DC(), r = Math.max(1, _p.size / 2), run = D.dabsAlong(a.x, a.y, b.x, b.y, Math.max(1, _p.size / 6), _p.stroke.carry);
    _p.stroke.carry = run.carry;
    var rgb = D.rgbOf(_p.color);
    withCopies(g, function(h) { run.pts.forEach(function(p) { var gr = h.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); gr.addColorStop(0, 'rgba(' + rgb.join(',') + ',0.35)'); gr.addColorStop(1, 'rgba(' + rgb.join(',') + ',0)'); h.fillStyle = gr; h.beginPath(); h.arc(p.x, p.y, r, 0, Math.PI * 2); h.fill(); }); });
}
function down(ev) {
    if (!_p || ev.button !== 0 || (_p.textEl && ev.target === _p.textEl)) return;
    var p = at(ev), t = _p.tool, D = DC(), L = active(); if (!L) return;
    _p.shift = ev.shiftKey;
    if (_p.textEl) { textCommit(); return; }
    if (_p.float) {
        var hit = D.selHit(_p.float, p.x, p.y, 8 / _p.zoom, 20 / _p.zoom);
        if (hit) { _p.drag = { kind: hit, from: p, x: _p.float.x, y: _p.float.y, a: _p.float.a }; capture(ev); return; }
        floatStamp(); if (t === 'select') { /* a press outside a selection starts another */ } else return;
    }
    if (L.hidden) { toast('This layer is hidden. Show it to draw on it.'); return; }
    if (t === 'pick') { pick(p); return; }
    if (t === 'fill') { fill(p); return; }
    if (t === 'text') { textAt(p); return; }
    if (t === 'select') { _p.stroke = { pick: true, a: p, b: null }; capture(ev); return; }
    if (t === 'line' || t === 'rect' || t === 'circle') { _p.stroke = { shape: t, a: p, b: null }; capture(ev); return; }
    push([L.id]);
    _p.stroke = { a: p, last: p, carry: 0, buf: t !== 'eraser', erase: t === 'eraser' };
    var bg = _p.buf.getContext('2d'); bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, _p.w, _p.h);
    if (t === 'eraser') { _p.buf.style.opacity = '0'; seg(bg, p, p); L.cv.style.visibility = 'hidden'; _p.prev.style.display = ''; _p.prev.style.opacity = String(L.op); erasePrev(); }
    else { _p.buf.style.opacity = String(L.op * _p.op); if (t === 'brush') dabs(bg, p, p); else seg(bg, p, p); }
    capture(ev); tileSoon();
}
function move(ev) {
    if (!_p) return;
    var p = at(ev); _p.shift = ev.shiftKey;
    if (_p.drag) {
        var f = _p.float, d = _p.drag;
        if (d.kind === 'in') { f.x = d.x + (p.x - d.from.x); f.y = d.y + (p.y - d.from.y); }
        else f.a = DC().turnBy(f.x + f.w / 2, f.y + f.h / 2, p.x, p.y, ev.shiftKey);
        drawOver(); return;
    }
    var s = _p.stroke; if (!s) return;
    if (s.shape || s.pick) { s.b = p; drawOver(); return; }
    var L = active(); if (!L) return;
    if (s.erase) { seg(_p.buf.getContext('2d'), s.last, p); erasePrev(); }
    else if (_p.tool === 'brush') dabs(_p.buf.getContext('2d'), s.last, p);
    else seg(_p.buf.getContext('2d'), s.last, p);
    s.last = p; tileSoon();
}
function up(ev) {
    if (!_p) return;
    if (_p.drag) { _p.drag = null; tileSoon(); return; }
    var s = _p.stroke; if (!s) return; _p.stroke = null;
    var L = active(); if (!L) return;
    if (ev && ev.type !== 'blur' && ev.type !== 'pointercancel' && s.b !== undefined) s.b = s.b || at(ev);
    if (s.pick) { drawOver(); if (s.b) lift(DC().rectOf(s.a.x, s.a.y, s.b.x, s.b.y, false)); return; }
    if (s.shape) { if (s.b) { push([L.id]); shapeAt(ctxOf(L.cv), s.shape, s.a, s.b, _p.op); log('shape', { t: s.shape }); } drawOver(); tileSoon(); return; }
    if (s.buf || s.erase) { var g = ctxOf(L.cv); g.save(); g.globalAlpha = _p.op; if (s.erase) g.globalCompositeOperation = 'destination-out'; g.drawImage(_p.buf, 0, 0); g.restore(); var bg = _p.buf.getContext('2d'); bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, _p.w, _p.h); }
    if (s.erase) { L.cv.style.visibility = ''; _p.prev.style.display = 'none'; }
    tileSoon();
}
// The layer as the eraser's stroke would leave it, shown in its place while the stroke goes on
function erasePrev() {
    var L = active(), g = _p.prev.getContext('2d'); if (!L) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(L.cv, 0, 0); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = _p.op; g.drawImage(_p.buf, 0, 0); g.restore();
}
function capture(ev) { try { if (ev.target && ev.target.setPointerCapture) ev.target.setPointerCapture(ev.pointerId); } catch (e) { /* a pointer the page lost */ } }
function fill(p) {
    var L = active(), D = DC(), g = ctxOf(L.cv), id = g.getImageData(0, 0, _p.w, _p.h), rgb = D.rgbOf(_p.color);
    var m = D.floodMask(id.data, _p.w, _p.h, p.x, p.y, D.DRAW.TOL, _p.wrap), m2 = _p.mirror ? D.floodMask(id.data, _p.w, _p.h, _p.w - p.x, p.y, D.DRAW.TOL, _p.wrap) : null;
    if (!m && !m2) return;
    var paint = g.createImageData(_p.w, _p.h), d = paint.data;
    for (var q = 0; q < _p.w * _p.h; q++) if ((m && m.mask[q]) || (m2 && m2.mask[q])) { var j = q * 4; d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = 255; }
    D.histPush(_p.hist, snap([L.id])); _p.dirty = true;
    var sc = ctxOf(_p.tmp); sc.setTransform(1, 0, 0, 1, 0, 0); sc.putImageData(paint, 0, 0);
    g.save(); g.globalAlpha = _p.op; g.drawImage(_p.tmp, 0, 0); g.restore(); bar(); log('fill', {}); tileSoon();
}
function pick(p) {
    var one = cv(1, 1), g = ctxOf(one); g.setTransform(1, 0, 0, 1, -Math.floor(p.x), -Math.floor(p.y));
    _p.layers.forEach(function(L) { if (!L.hidden) { g.globalAlpha = L.op; g.drawImage(L.cv, 0, 0); } });
    var c = DC().pickAt(g.getImageData(0, 0, 1, 1).data, 1, 1, 0, 0);
    if (!c) { toast('Nothing is drawn there to pick a color from.'); return; }
    setColor(c.hex); toolSet(_p.before && _p.before !== 'pick' ? _p.before : 'pen'); log('pick', {});
}
// [drawcheck:tools-end]

// [drawcheck:float-start]
// A box of the layer lifted into a selection that floats: moved by a drag or the arrow keys, turned by its handle, and put down where it
// stands by Enter, another tool or a press outside it. Escape puts it back where it came from; Delete leaves the place it came from clear
function lift(r) {
    var L = active(), x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y)), w = Math.min(_p.w, Math.ceil(r.x + r.w)) - x, h = Math.min(_p.h, Math.ceil(r.y + r.h)) - y;
    if (w < 1 || h < 1) return;
    push([L.id]);
    var g = ctxOf(L.cv), piece = cv(w, h); ctxOf(piece).putImageData(g.getImageData(x, y, w, h), 0, 0); g.clearRect(x, y, w, h);
    _p.float = { cv: piece, x: x, y: y, w: w, h: h, a: 0 }; hold(); log('lift', {}); drawOver(); tileSoon();
}
function floatStamp() {
    var f = _p.float, L = active(); if (!f || !L) return;
    var g = ctxOf(L.cv), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    var one = function(dx, dy) { g.save(); g.translate(cx + dx, cy + dy); g.rotate(f.a); g.drawImage(f.cv, -f.w / 2, -f.h / 2, f.w, f.h); g.restore(); };
    if (_p.wrap) [-1, 0, 1].forEach(function(i) { [-1, 0, 1].forEach(function(j) { one(i * _p.w, j * _p.h); }); }); else one(0, 0);
    _p.float = null; _p.drag = null; hold(); bar(); log('stamp', {}); drawOver(); tileSoon();
}
function floatCancel() {   // the step its lifting or its text pushed is taken back and not offered again
    if (!_p.float) return;
    _p.float = null; _p.drag = null; DC().histUndo(_p.hist, swap); _p.hist.redo.pop(); hold(); log('float-back', {}); paper();
}
function floatDrop() { if (!_p.float) return; _p.float = null; _p.drag = null; hold(); bar(); log('float-delete', {}); drawOver(); tileSoon(); }
function nudge(dx, dy) { if (!_p.float) return; _p.float.x += dx; _p.float.y += dy; drawOver(); tileSoon(); }
// Text: typed in a box over the drawing, in one of Waypoint's own fonts at the brush's size, then a selection to move or turn
function textAt(p) {
    var t = el('input', 'pw-text'); t.type = 'text'; t.maxLength = DC().DRAW.TEXT; t.setAttribute('aria-label', 'The words to draw');
    var fs = textPx(), fc = fontOf();
    t.style.color = _p.color;
    _p.textEl = t; _p.textAt = p; $('paintPaper').appendChild(t); textPlace(); hold();
    t.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); textCommit(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); textDrop(); }
    });
    setTimeout(function() { t.focus(); }, 0);
}
// The words' box where they will be drawn, at the view's zoom
function textPlace() { var t = _p && _p.textEl, p = _p && _p.textAt; if (!t || !p) return; var fs = textPx(); t.style.left = (p.x * _p.zoom) + 'px'; t.style.top = (p.y * _p.zoom - fs * _p.zoom / 2) + 'px'; t.style.font = Math.round(fs * _p.zoom) + 'px ' + fontOf(); }
function fontWarm() { if (_p && document.fonts && document.fonts.load) document.fonts.load(textPx() + 'px ' + fontOf()).catch(function() {}); }
function textPx() { return Math.max(8, Math.round(_p.size * 2)); }
function fontOf() { var T = window.wpTextFmt, f = _p.font || 'Inter'; return T && T.fontCss ? (T.fontCss(f) || 'sans-serif') : 'sans-serif'; }
function textDrop() { if (_p && _p.textEl) { var t = _p.textEl; _p.textEl = null; if (t.parentNode) t.parentNode.removeChild(t); hold(); stageFocus(); } }
// Answers a promise that is kept once the words are a selection (at once where the font is there)
function textCommit() {
    if (!_p || !_p.textEl) return Promise.resolve();
    var words = DC().cleanText(_p.textEl.value), p = _p.textAt; textDrop(); if (!words.trim()) return Promise.resolve();
    var fs = textPx(), font = fs + 'px ' + fontOf(), d = _p, go = function() {
        if (_p !== d) return;
        var m = cv(1, 1).getContext('2d'); m.font = font; var w = Math.max(1, Math.ceil(m.measureText(words).width) + 4), h = Math.ceil(fs * 1.35);
        var piece = cv(w, h), g = piece.getContext('2d'); g.font = font; g.fillStyle = _p.color; g.globalAlpha = _p.op; g.textBaseline = 'middle'; g.fillText(words, 2, h / 2);
        push([active().id]); _p.float = { cv: piece, x: p.x, y: p.y - h / 2, w: w, h: h, a: 0 }; hold(); log('text', {}); drawOver(); tileSoon();
        if (_p.tool !== 'text' && _p.tool !== 'select') floatStamp();   // another tool was picked while the font came: it puts the words down
    };
    var ready = !document.fonts || !document.fonts.check; try { ready = ready || document.fonts.check(font); } catch (e) { ready = true; }
    if (ready || !document.fonts.load) { go(); return Promise.resolve(); }
    return document.fonts.load(font).then(go, go);
}
// The window holds Escape for itself while a selection floats or words are being typed (esckey.js escKeep reads .pw-hold)
function hold() { var b = $('paintBox'); if (b && _p) b.classList.toggle('pw-hold', !!(_p.float || _p.textEl)); }
// [drawcheck:float-end]

// The layers, the top first: each its eye and its name, the one drawn on marked. A double-click on a name renames it
function layersDraw() {
    var box = $('paintLayers'); if (!box || !_p) return;
    box.textContent = '';
    for (var i = _p.layers.length - 1; i >= 0; i--) (function(L, i) {
        var row = el('div', 'pw-lrow' + (i === _p.at ? ' on' : '')), eye = el('button', 'pw-eye'), nm = el('button', 'pw-lname', L.name);
        eye.type = 'button'; nm.type = 'button'; eye.appendChild(ico(L.hidden ? EYE_OFF : EYE)); eye.setAttribute('aria-pressed', L.hidden ? 'false' : 'true');
        eye.setAttribute('aria-label', (L.hidden ? 'Show ' : 'Hide ') + L.name); eye.dataset.tip = L.hidden ? 'Show this layer' : 'Hide this layer';
        nm.setAttribute('aria-pressed', i === _p.at ? 'true' : 'false'); nm.dataset.tip = 'Draw on this layer. Double-click to rename it.';
        eye.dataset.lid = L.id; nm.dataset.lid = L.id;
        eye.addEventListener('click', function() { if (_p.float) floatStamp(); push([]); L.hidden = !L.hidden; _p.lfocus = { id: L.id, part: 'pw-eye' }; log('layer-eye', {}); paper(); });
        nm.addEventListener('click', function() { if (_p.float) floatStamp(); _p.at = i; _p.lfocus = { id: L.id, part: 'pw-lname' }; paper(); });
        nm.addEventListener('dblclick', function() { rename(row, nm, L); });
        row.appendChild(eye); row.appendChild(nm); box.appendChild(row);
    })(_p.layers[i], i);
    var L = active(), op = $('paintLayerOp'), ov = $('paintLayerOpV'); if (op && L) { op.value = String(Math.round(L.op * 100)); if (ov) ov.textContent = Math.round(L.op * 100) + '%'; }
    var nL = _p.layers.length;
    ['paintLayerUp', 'paintLayerDown', 'paintLayerMerge', 'paintLayerDel', 'paintLayerAdd'].forEach(function(id) {
        var b = $(id); if (!b) return;
        b.disabled = id === 'paintLayerUp' ? _p.at >= nL - 1 : id === 'paintLayerDown' || id === 'paintLayerMerge' ? _p.at <= 0 : id === 'paintLayerDel' ? nL < 2 : nL >= DC().DRAW.LAYERS;
    });
    var lf = _p.lfocus; _p.lfocus = null;
    if (lf) { var to = [].slice.call(box.querySelectorAll('.' + lf.part)).filter(function(b) { return b.dataset.lid === lf.id; })[0]; if (to) to.focus(); }
    var ae = document.activeElement; if (ae && ae.disabled && $('paintBox') && $('paintBox').contains(ae)) stageFocus();   // a button that went off as it was pressed hands the focus to the drawing
}
function rename(row, nm, L) {
    var t = el('input', 'pw-lrename el-rename-in'); t.type = 'text'; t.maxLength = DC().DRAW.NAME; t.value = L.name; t.setAttribute('aria-label', 'The layer’s name');
    row.replaceChild(t, nm); t.focus(); t.select();
    var done = false, end = function(keep) { if (done) return; done = true; var v = DC().layerName(t.value); if (keep && v && v !== L.name) { push([]); L.name = v; log('layer-name', {}); } _p.lfocus = { id: L.id, part: 'pw-lname' }; layersDraw(); };
    t.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); end(true); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } });
    t.addEventListener('blur', function() { end(true); });
}
function layerAdd() {
    var D = DC(), r = D.layerAdd(_p.layers, uid(), _p.at); if (!r) { toast('A drawing holds ' + D.DRAW.LAYERS + ' layers at most.'); return; }
    if (_p.float) floatStamp();
    push([]); r.list[r.at].cv = cv(_p.w, _p.h); _p.layers = r.list; _p.at = r.at; log('layer-add', {}); paper();
}
function layerDel() {
    var L = active(), r = DC().layerDel(_p.layers, _p.at); if (!r) return;
    if (_p.float) floatStamp();
    push([L.id]); _p.layers = r.list; _p.at = r.at; log('layer-delete', {}); paper();
}
function layerMove(dir) { var r = DC().layerMove(_p.layers, _p.at, dir); if (!r) return; if (_p.float) floatStamp(); push([]); _p.layers = r.list; _p.at = r.at; log('layer-move', {}); paper(); }
function layerMerge() {
    if (_p.at < 1) return; if (_p.float) floatStamp();
    var up1 = _p.layers[_p.at], lo = _p.layers[_p.at - 1]; push([up1.id, lo.id]);
    var both = cv(_p.w, _p.h), g = both.getContext('2d');   // each at its own opacity, so the merged layer looks as the two did
    if (!lo.hidden) { g.globalAlpha = lo.op; g.drawImage(lo.cv, 0, 0); }
    if (!up1.hidden) { g.globalAlpha = up1.op; g.drawImage(up1.cv, 0, 0); }
    var lg = ctxOf(lo.cv); lg.clearRect(0, 0, _p.w, _p.h); lg.drawImage(both, 0, 0); lo.op = 1; lo.hidden = false;
    _p.layers = _p.layers.filter(function(l) { return l !== up1; }); _p.at -= 1; log('layer-merge', {}); paper();
}

// The tool bar: the tool in hand lit, and the options only it uses shown
function bar() {
    if (!_p) return;
    document.querySelectorAll('#paintTools [data-tool]').forEach(function(b) { var on = b.dataset.tool === _p.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var show = function(id, on) { var e = $(id); if (e) e.hidden = !on; };
    show('paintFilledRow', _p.tool === 'rect' || _p.tool === 'circle');
    show('paintFontRow', _p.tool === 'text');
    var sv = $('paintSizeV'); if (sv) sv.textContent = String(_p.size);
    var ovv = $('paintOpV'); if (ovv) ovv.textContent = Math.round(_p.op * 100) + '%';
    document.querySelectorAll('#paintSwatches .draw-swatch').forEach(function(s) { s.classList.toggle('active', s.dataset.c === _p.color); });
    var ci = $('paintColor'); if (ci && ci.value !== _p.color) ci.value = _p.color;
    var u = $('paintUndo'), r = $('paintRedo'); if (u) u.disabled = !_p.hist.undo.length && !_p.float; if (r) r.disabled = !_p.hist.redo.length || !!_p.float;
    var st = $('paintStage'); if (st) st.dataset.tool = _p.tool;
}
function toolSet(t) {
    if (!_p || DC().TOOLS.indexOf(t) < 0) return;
    if (_p.textEl) textCommit();
    if (_p.float && t !== 'select') floatStamp();
    if (t === 'pick' && _p.tool !== 'pick') _p.before = _p.tool;
    _p.tool = t; bar(); drawOver(); if (t === 'text') fontWarm();
}
function setColor(c) { var h = DC().cleanHex(c); if (h && _p) { _p.color = h; bar(); } }
function stageFocus() { var s = $('paintStage'); if (s) s.focus({ preventScroll: true }); }

// What it starts from: your picture, clear, or Waypoint's drawing, laid onto the first layer
function startFill(v) {
    var d = _p, g = ctxOf(_p.layers[0].cv); g.clearRect(0, 0, _p.w, _p.h);
    var o = _p.opts, paint = function(img) { if (_p !== d) return; g.drawImage(img, 0, 0, _p.w, _p.h); paper(); };
    if (v === 'mine' && o.mine) return loadImg(o.mine).then(paint, function() { toast('Your picture could not be read, so it starts clear.'); paper(); });
    if (v === 'wp' && o.wp) { if (o.wp.paint) { o.wp.paint(g, _p.w, _p.h); paper(); return Promise.resolve(); } if (o.wp.url) return loadImg(o.wp.url).then(paint, function() { paper(); }); }
    paper(); return Promise.resolve();
}
function loadImg(u) { return new Promise(function(ok, no) { var im = new Image(); im.onload = function() { ok(im); }; im.onerror = no; im.src = u; }); }
function startPick(v) {
    if (!_p || v === _p.start) return;
    var go = function() { if (_p.float) floatCancel(); if (_p.textEl) textDrop(); push(_p.layers.map(function(l) { return l.id; })); var L = { id: uid(), name: 'Layer 1', hidden: false, op: 1, cv: cv(_p.w, _p.h) }; _p.layers = [L]; _p.at = 0; _p.start = v; log('start', { from: v }); startFill(v); };
    var anyInk = _p.hist.undo.length > 0 || _p.hist.redo.length > 0;
    if (!anyInk) { _p.start = v; startFill(v); return; }
    showConfirm('Start again from ' + (v === 'mine' ? 'your picture' : v === 'wp' ? 'Waypoint’s drawing' : 'a clear drawing') + '? What you drew goes, and Undo brings it back.', function(ok) { if (ok && _p) go(); else { var s = $('paintStart'); if (s && _p) s.value = _p.start; } });
}
// The faint drawing under the canvas to trace; never part of the picture
function traceMake() {
    var o = _p.opts; if (!o.wp) return null;
    if (o.wp.url) { var im = el('img', 'pw-layer pw-trace'); im.alt = ''; im.src = o.wp.url; return im; }
    var c = cv(_p.w, _p.h); c.className = 'pw-layer pw-trace'; try { o.wp.paint(c.getContext('2d'), _p.w, _p.h); } catch (e) { return null; } return c;
}

// [drawcheck:open-start]
function open(opts) {
    var D = DC(), m = $('paintModal'); if (!D || !m || !opts || _p) return false;
    var px = typeof opts.px === 'number' ? opts.px : 200, wrap = typeof opts.tile === 'number' && opts.tile > 0;
    var sz = wrap ? D.canvasFor(opts.tile, opts.tile, px) : D.canvasFor(opts.cells ? opts.cells[0] : 1, opts.cells ? opts.cells[1] : 1, px);
    var L = { id: uid(), name: 'Layer 1', hidden: false, op: 1, cv: cv(sz.w, sz.h) }, choices = D.startChoices(!!opts.mine, !!opts.wp), TF = window.wpTextFmt, f0 = TF && TF.FONTS && TF.FONTS.length ? (TF.FONTS.some(function(f) { return f[0] === 'Inter'; }) ? 'Inter' : TF.FONTS[0][0]) : 'Inter';
    _p = { opts: opts, w: sz.w, h: sz.h, wrap: wrap, layers: [L], at: 0, tool: 'pen', color: '#3b2a1b', size: Math.max(2, Math.round(sz.w / 40)), op: 1, filled: false, font: 'Inter',
        mirror: false, trace: false, hist: D.histNew(), zoom: 1, dirty: false, start: choices[0].v, buf: cv(sz.w, sz.h), over: cv(sz.w, sz.h), prev: cv(sz.w, sz.h), tmp: cv(sz.w, sz.h), float: null, stroke: null, textEl: null, back: document.activeElement };
    _p.font = f0; var pfo = $('paintFont'); if (pfo) pfo.value = f0;
    _p.traceEl = traceMake();
    var t = $('paintTitle'); if (t) t.textContent = 'Draw: ' + (opts.title || 'a picture');
    var sl = $('paintSize'); if (sl) sl.textContent = sz.w + ' by ' + sz.h + ' pixels' + (sz.scaled ? ', held to ' + D.DRAW.MAX_SIDE + ' a side' : '');
    var ss = $('paintStart'); if (ss) { ss.textContent = ''; choices.forEach(function(c) { var o = el('option', null, c.label); o.value = c.v; ss.appendChild(o); }); ss.value = _p.start; }
    var tb = $('paintTileBox'); if (tb) tb.hidden = !wrap;
    var tr = $('paintTraceRow'), tc = $('paintTrace'); if (tr) tr.hidden = !_p.traceEl; if (tc) tc.checked = false;
    var mi = $('paintMirror'); if (mi) mi.checked = false;
    var fi = $('paintFilled'); if (fi) fi.checked = false;
    var sr = $('paintSizeR'); if (sr) sr.value = String(_p.size);
    var orr = $('paintOpR'); if (orr) orr.value = '100';
    var ln = $('paintLine'); if (ln) ln.textContent = wrap ? 'Strokes run off one edge and come back on the other, so the picture repeats with no seam. The 3 by 3 shows how it tiles.' : 'Clear parts stay clear, so the map shows through them. Nothing is kept until you press Done and then save the pack.';
    m.style.display = 'flex';
    var st = $('paintStage'), z = st ? D.fitZoom(sz.w, sz.h, Math.max(160, st.clientWidth - 24), Math.max(160, st.clientHeight - 24)) : 1; _p.zoom = z;
    log('open', { w: sz.w, h: sz.h, wrap: wrap ? 1 : 0, from: _p.start });
    startFill(_p.start); stageFocus();
    var d = _p; setTimeout(function() { if (_p !== d || !st) return; var z2 = D.fitZoom(d.w, d.h, Math.max(160, st.clientWidth - 24), Math.max(160, st.clientHeight - 24)); if (z2 !== d.zoom) { d.zoom = z2; paper(); } }, 40);   // measured again once the window has its size
    return true;
}
function close() {
    var m = $('paintModal'); if (m) m.style.display = 'none';
    if (_tileT) { clearTimeout(_tileT); _tileT = 0; }
    var w = _p && _p.opts && _p.opts.wp; if (w && typeof w.url === 'string' && w.url.slice(0, 5) === 'blob:') URL.revokeObjectURL(w.url);   // a pattern's start the maker made for this window alone
    var back = _p && _p.back, again = _p && _p.opts && _p.opts.back;
    _p = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus(); else if (typeof again === 'function') again();   // the focus back where the window was opened from, never left on the page behind var b = $('paintBox'); if (b) b.classList.remove('pw-hold');
}
function cancel() {
    if (!_p) return;
    if (_p.textEl) textDrop();
    if (!_p.dirty) { log('cancel', { changed: 0 }); close(); return; }
    showConfirm('Close the drawing without keeping it?', function(ok) { if (ok && _p) { log('cancel', { changed: 1 }); close(); } });
}
function done() {
    if (!_p) return;
    var d = _p, b = $('paintDone'); if (b) b.disabled = true;
    (_p.textEl ? textCommit() : Promise.resolve()).then(function() { if (_p === d) finish(d, b); });
}
function finish(d, b) {
    if (_p.float) floatStamp();
    var out = cv(_p.w, _p.h), g = out.getContext('2d'); compose(g, 1, false);
    out.toBlob(function(blob) {
        if (b) b.disabled = false;
        if (_p !== d) return;
        if (!blob) { toast('The drawing could not be made into a picture.'); log('done-fail', {}); return; }
        if (blob.size > PIC_MAX) { toast('The drawing is larger than 4 MB as a picture. Make it smaller in the pack maker’s template size, or use fewer colors.'); log('done-big', { kb: Math.round(blob.size / 1024) }); return; }
        var fn = d.opts.done; log('done', { kb: Math.round(blob.size / 1024), layers: d.layers.length }); close();
        if (typeof fn === 'function') fn(new File([blob], 'drawing.png', { type: 'image/png' }));
    }, 'image/png');
}
// [drawcheck:open-end]

// [drawcheck:keys-start]
// Every key pressed in the window is the window's: on the map behind it the arrows move and Delete deletes what is selected
function key(ev, outside) {
    if (!_p) return;
    var t = ev.target, field = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && t.type !== 'range' && t.type !== 'checkbox';
    if (ev.key === 'Tab') { tabRound(ev); return; }
    if (field) { if (ev.key !== 'Escape') ev.stopPropagation(); return; }
    var mod = ev.ctrlKey || ev.metaKey, k = ev.key, D = DC(), stop = function() { ev.preventDefault(); ev.stopPropagation(); };
    if (mod && !ev.altKey && (k === 'z' || k === 'Z')) { stop(); if (ev.shiftKey) redo(); else undo(); return; }
    if (mod && !ev.altKey && (k === 'y' || k === 'Y')) { stop(); redo(); return; }
    if (k === 'Escape') { if (_p.float) { stop(); floatCancel(); } return; }
    if (_p.float && (k === 'Delete' || k === 'Backspace')) { stop(); floatDrop(); return; }
    if (_p.float && k === 'Enter') { stop(); floatStamp(); return; }
    var step = ev.shiftKey ? 10 : 1;
    if (_p.float && k.indexOf('Arrow') === 0) { stop(); nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0); return; }
    if (!mod && !ev.altKey && (k === '[' || k === ']')) { stop(); sizeSet(_p.size + (k === ']' ? 1 : -1) * Math.max(1, Math.round(_p.size / 8))); return; }
    if (!mod && !ev.altKey && (outside || (t && (t.id === 'paintStage' || (t.closest && t.closest('#paintTools')))))) { var tl = D.toolOfKey(k); if (tl) { stop(); toolSet(tl); return; } }
    if (k === 'Enter' || k === ' ') return;   // a button's own press
    ev.stopPropagation();
}
// Tab and Shift+Tab go round the window's own controls, never on to the pack maker behind it
function tabRound(ev) {
    var box = $('paintBox'); if (!box) return;
    var list = [].slice.call(box.querySelectorAll('button, input, select, [tabindex="0"]')).filter(function(e) { return !e.disabled && e.getClientRects().length > 0 && !(e.closest && e.closest('[hidden]')); });
    if (!list.length) return;
    var i = list.indexOf(ev.target);
    if (ev.shiftKey && i <= 0) { ev.preventDefault(); list[list.length - 1].focus(); }
    else if (!ev.shiftKey && (i < 0 || i === list.length - 1)) { ev.preventDefault(); list[0].focus(); }
}
// A key pressed while the focus is outside the window, as after a press on a control that went away, is the window's all the same
function keyOut(ev) {
    if (!_p || ev.key === 'Escape') return;
    var t = ev.target, m = $('paintModal');
    if (t && m && m.contains(t)) return;
    if (t && t.closest && t.closest('#customConfirm, #customPrompt')) return;   // a question the window asked
    ev.stopPropagation();
    if (ev.key === 'Tab') { ev.preventDefault(); stageFocus(); return; }
    key(ev, true);
}
function sizeSet(v) { if (!_p) return; var D = DC(); _p.size = Math.max(D.DRAW.SIZE_MIN, Math.min(D.DRAW.SIZE_MAX, Math.round(v))); var r = $('paintSizeR'); if (r) r.value = String(_p.size); bar(); textPlace(); }
// [drawcheck:keys-end]

function wire() {
    var m = $('paintModal'); if (!m) return;
    var on = function(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); };
    document.querySelectorAll('#paintTools [data-tool]').forEach(function(b) { b.addEventListener('click', function() { toolSet(b.dataset.tool); }); });
    var sw = $('paintSwatches'); if (sw) SWATCHES.forEach(function(c) { var s = el('button', 'draw-swatch'); s.type = 'button'; s.dataset.c = c; s.style.background = c; s.setAttribute('aria-label', 'Color ' + c); s.addEventListener('click', function() { setColor(c); }); sw.appendChild(s); });
    on('paintColor', 'input', function(e) { setColor(e.target.value); });
    on('paintSizeR', 'input', function(e) { sizeSet(parseInt(e.target.value, 10)); });
    on('paintOpR', 'input', function(e) { if (_p) { _p.op = DC().cleanOp(parseInt(e.target.value, 10) / 100); bar(); } });
    on('paintFilled', 'change', function(e) { if (_p) _p.filled = !!e.target.checked; });
    on('paintMirror', 'change', function(e) { if (_p) { _p.mirror = !!e.target.checked; log('mirror', { on: _p.mirror ? 1 : 0 }); } });
    on('paintTrace', 'change', function(e) { if (_p) { _p.trace = !!e.target.checked; paper(); } });
    on('paintStart', 'change', function(e) { startPick(e.target.value); });
    on('paintFont', 'change', function(e) { if (_p) { _p.font = e.target.value; fontWarm(); } });
    var pf = $('paintFont'), T = window.wpTextFmt; if (pf && T && T.FONTS) T.FONTS.forEach(function(f) { var o = el('option', null, f[0]); o.value = f[0]; pf.appendChild(o); });
    on('paintLayerOp', 'input', function(e) { var L = active(); if (!L) return; if (_p.float) floatStamp(); if (!_p.opPushed) { push([]); _p.opPushed = true; } L.op = DC().cleanOp(parseInt(e.target.value, 10) / 100); paper(); });
    on('paintLayerOp', 'change', function() { if (_p) _p.opPushed = false; });
    on('paintLayerAdd', 'click', layerAdd); on('paintLayerDel', 'click', layerDel); on('paintLayerMerge', 'click', layerMerge);
    on('paintLayerUp', 'click', function() { layerMove(1); }); on('paintLayerDown', 'click', function() { layerMove(-1); });
    on('paintZoomIn', 'click', function() { if (_p) { _p.zoom = DC().zoomStep(_p.zoom, 1); paper(); } });
    on('paintZoomOut', 'click', function() { if (_p) { _p.zoom = DC().zoomStep(_p.zoom, -1); paper(); } });
    on('paintZoomFit', 'click', function() { var st = $('paintStage'); if (_p && st) { _p.zoom = DC().fitZoom(_p.w, _p.h, st.clientWidth - 24, st.clientHeight - 24); paper(); } });
    on('paintUndo', 'click', undo); on('paintRedo', 'click', redo);
    on('paintClearLayer', 'click', function() { var L = active(); if (!_p || !L) return; if (_p.float) floatStamp(); push([L.id]); ctxOf(L.cv).clearRect(0, 0, _p.w, _p.h); log('layer-clear', {}); paper(); });
    on('paintCancel', 'click', cancel); on('paintDone', 'click', done);
    var pp = $('paintPaper'); if (pp) { pp.addEventListener('pointerdown', down); pp.addEventListener('pointermove', move); pp.addEventListener('pointerup', up); pp.addEventListener('pointercancel', up); pp.addEventListener('lostpointercapture', function(ev) { if (_p && (_p.stroke || _p.drag)) up(ev); }); }
    window.addEventListener('blur', function() { if (_p && (_p.stroke || _p.drag)) up({ type: 'blur' }); });
    m.addEventListener('keydown', function(ev) { key(ev, false); });
    document.addEventListener('keydown', keyOut, true);
    // A paste while the window is up is no piece laid on the map behind it
    window.addEventListener('paste', function(ev) { if (!_p) return; var t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; ev.preventDefault(); ev.stopPropagation(); }, true);
    var st = $('paintStage'); if (st) st.addEventListener('wheel', function(ev) { if (!_p || !(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); _p.zoom = DC().zoomStep(_p.zoom, ev.deltaY < 0 ? 1 : -1); paper(); }, { passive: false });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpPaint = { open: open, close: close, cancel: cancel, shown: function() { return !!_p; } };
