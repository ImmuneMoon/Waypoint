/* The token creator (owner, 2026-09-27: "a token creator could be useful for images" / "the users need to be able to choose what part of an
   image is used for the crop too"): a picture is framed to a square before it becomes a profile picture, a character's picture or a token's.
   Drag to move, scroll, pinch or the slider to zoom; OK keeps what is inside the square (the middle when untouched); Cancel, x or Escape keep
   nothing. The saved file is always the square — the chips only preview the outline each map's grid cuts it to. window.wpFrame.
   open(source, opts, cb): source = a File or Blob, or a picture the app may show (safecore picRef); opts = { px: the saved side at most,
   as: 'data' (a data URL within opts.max characters) | 'blob' (a PNG), title, guide: { shape, w, h }, start: { x, y, s }, keep: true|false
   (the GM's "Keep the original" choice, shown only when given), onCancel, onError, maxInput (a larger cap for the GM's own local file) };
   cb({ data | blob, rect, w, h, keep }) on OK only; onCancel when it ends without a picture (Cancel, x, Escape, another framing opened over
   it, or a picture it could not read when there is no onError); onError when the picture could not be read. */
import { clampRect, zoomAt, panBy, zoomOf, setZoom, outSide, firstFit, guidePath, defaultRect, ENCODE, wheelFactor } from './framecore.js';
import { picRef } from './safecore.js';
import { getActiveMap } from './models.js';

var MAX_INPUT = 8 * 1024 * 1024;
var SVGNS = 'http://www.w3.org/2000/svg';
var st = null;   // the open framing: { img, w, h, r, opts, cb, url, own, opener, pointers, pinch, shape, gw, gh, g0, busy }
var gen = 0;      // the latest open: an older framing, open or still loading, ends as a cancel
function end(f) { if (typeof f === 'function') f(); }
function ui(id) { return document.getElementById(id); }
function toast(t) { if (window.appToast) window.appToast(t); }

function scaleOf() { var stage = ui('frameStage'); return st && st.r.s ? (stage ? stage.clientWidth : 300) / st.r.s : 1; }
function draw() {
    if (!st) return;
    var img = ui('frameImg'), k = scaleOf();
    img.style.width = (st.w * k) + 'px'; img.style.height = (st.h * k) + 'px';
    img.style.transform = 'translate(' + (-st.r.x * k) + 'px, ' + (-st.r.y * k) + 'px)';
    var z = ui('frameZoom'); if (z) z.value = String(Math.round(zoomOf(st.r, st.w, st.h) * 100));
    var shape = guidePath(st.shape, st.gw, st.gh), dim = ui('frameDim'), edge = ui('frameEdge');
    if (dim) dim.setAttribute('d', 'M0 0H100V100H0Z' + shape);
    if (edge) edge.setAttribute('d', shape);
    Array.prototype.forEach.call(document.querySelectorAll('#frameModal .frame-shape'), function(b) { b.classList.toggle('sel', b.dataset.shape === st.shape); b.setAttribute('aria-pressed', b.dataset.shape === st.shape ? 'true' : 'false'); });
}
function setRect(r) { if (!st) return; st.r = clampRect(r, st.w, st.h); draw(); }
// A screen point over the stage, in picture pixels
function picPoint(cx, cy) { var stage = ui('frameStage'), b = stage.getBoundingClientRect(), k = scaleOf(); return { x: st.r.x + (cx - b.left) / k, y: st.r.y + (cy - b.top) / k }; }

function onKey(e) {
    if (!st) return;
    var k = e.key, box = ui('frameModal');
    if (k === 'Tab') {   // the focus stays inside the creator
        var f = Array.prototype.filter.call(box.querySelectorAll('button, input'), function(el) { return el.offsetParent !== null && !el.disabled; });
        if (f.length) { var i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
        e.stopPropagation(); return;
    }
    e.stopPropagation();   // nothing behind the creator hears a key while it is open (the map, the dice panel, the face picker)
    var t = e.target, onSlider = t && t.id === 'frameZoom', step = st.r.s * (e.shiftKey ? 0.2 : 0.05);
    if (k === 'Escape') { e.preventDefault(); cancel(); }
    else if (k === 'Enter') { if (t && t.tagName === 'BUTTON' && t.id !== 'frameOk') return; e.preventDefault(); finish(); }
    else if (onSlider && /^Arrow|^Page|^Home$|^End$/.test(k)) return;   // the slider's own keys
    else if (k === 'ArrowLeft') { e.preventDefault(); setRect(panBy(st.r, -step, 0, st.w, st.h)); }
    else if (k === 'ArrowRight') { e.preventDefault(); setRect(panBy(st.r, step, 0, st.w, st.h)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setRect(panBy(st.r, 0, -step, st.w, st.h)); }
    else if (k === 'ArrowDown') { e.preventDefault(); setRect(panBy(st.r, 0, step, st.w, st.h)); }
    else if (k === '+' || k === '=') { e.preventDefault(); setRect(zoomAt(st.r, 1.1, NaN, NaN, st.w, st.h)); }
    else if (k === '-' || k === '_') { e.preventDefault(); setRect(zoomAt(st.r, 1 / 1.1, NaN, NaN, st.w, st.h)); }
    else if (k === '0') { e.preventDefault(); setRect(defaultRect(st.w, st.h)); }
}
function block(e) { if (!st) return; e.preventDefault(); e.stopPropagation(); }   // a paste or a dropped file never lands on the map behind it
// A chip: what that grid's one-cell token shows of the square (its own box and outline; the chip it opened with, the box it opened with) — a
// preview only: the saved square is the same
function pickShape(sh) {
    if (!st || (sh !== 'hexagon' && sh !== 'rect' && sh !== 'circle')) return;
    var S = window.wpSystemCore, c = sh === st.g0.shape ? st.g0 : (S && S.tokenCell ? S.tokenCell({ type: 'map', meta: { gridType: sh === 'hexagon' ? 'hex' : sh === 'rect' ? 'square' : 'off' } }) : { w: sh === 'rect' ? 50 : 60, h: sh === 'rect' ? 50 : 52 });
    st.shape = sh; st.gw = c.w; st.gh = c.h; draw();
}

function open(source, opts, cb) {
    if (st) cancel();
    opts = opts || {};
    var url = '', own = false;
    if (source && typeof source === 'object' && typeof source.size === 'number' && typeof source.type === 'string') {   // a File or a Blob
        if (source.type.indexOf('image/') !== 0) { toast('That file is not an image.'); return false; }
        var cap = typeof opts.maxInput === 'number' && opts.maxInput > 0 ? opts.maxInput : MAX_INPUT;
        if (source.size > cap) { toast('Image is too large — please pick one under ' + Math.round(cap / 1048576) + ' MB.'); return false; }
        url = URL.createObjectURL(source); own = true;
    } else if (typeof source === 'string') {
        var ref = picRef(source); if (!ref) { toast('That picture cannot be framed.'); return false; }
        url = /^(data|blob):/i.test(ref) ? ref : encodeURI(ref);   // a raw saves path may hold spaces (the library encodes it the same way)
    } else return false;
    var my = ++gen, img = new Image();
    img.onload = function() {
        if (my !== gen) { if (own) URL.revokeObjectURL(url); end(opts.onCancel); return; }   // another framing was opened meanwhile
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!(w > 0 && h > 0)) { if (own) URL.revokeObjectURL(url); toast('Could not read that image.'); end(opts.onError || opts.onCancel); return; }
        var S = window.wpSystemCore, am = null;
        try { am = getActiveMap(); } catch (er) { am = null; }   // the open map's grid names the default outline
        var g = opts.guide && typeof opts.guide === 'object' ? opts.guide : null, cell = S && S.tokenCell ? S.tokenCell(am) : { type: 'circle', w: 60, h: 52 };
        var shape = g && (g.shape === 'hexagon' || g.shape === 'rect' || g.shape === 'circle') ? g.shape : cell.type;
        st = { img: img, w: w, h: h, r: clampRect(opts.start || defaultRect(w, h), w, h), opts: opts, cb: cb, url: url, own: own, opener: document.activeElement, pointers: {}, pinch: null, shape: shape,
               gw: g && g.w > 0 ? g.w : cell.w, gh: g && g.h > 0 ? g.h : cell.h, busy: false };
        st.g0 = { shape: st.shape, w: st.gw, h: st.gh };   // the outline it opened with
        ui('frameImg').src = url;
        ui('frameTitle').textContent = typeof opts.title === 'string' && opts.title ? opts.title.slice(0, 80) : 'Frame the picture';
        var keepRow = ui('frameKeepRow'), keep = ui('frameKeep');
        if (keepRow) keepRow.style.display = typeof opts.keep === 'boolean' ? '' : 'none';
        if (keep) keep.checked = opts.keep === true;
        ui('frameModal').style.display = 'flex';
        window.addEventListener('keydown', onKey, true);
        ['paste', 'drop', 'dragover'].forEach(function(t) { window.addEventListener(t, block, true); });
        draw();
        try { ui('frameOk').focus(); } catch (er) {}
    };
    img.onerror = function() { if (own) URL.revokeObjectURL(url); if (my !== gen) { end(opts.onCancel); return; } toast('Could not read that image.'); end(opts.onError || opts.onCancel); };
    img.src = url;
    return true;
}
function close() {
    if (!st) return;
    var s = st; st = null;
    ui('frameModal').style.display = 'none';
    ui('frameImg').removeAttribute('src');
    if (s.own) { try { URL.revokeObjectURL(s.url); } catch (er) {} }
    window.removeEventListener('keydown', onKey, true);
    ['paste', 'drop', 'dragover'].forEach(function(t) { window.removeEventListener(t, block, true); });
    try { if (s.opener && s.opener.focus && document.body.contains(s.opener)) s.opener.focus(); } catch (er) {}
}
function cancel() { var s = st; close(); if (s && typeof s.opts.onCancel === 'function') s.opts.onCancel(); }
// OK: the square at its own pixels (at most opts.px a side), as a data URL that fits (PNG, then WebP, then JPEG) or a PNG blob
function finish() {
    if (!st || st.busy) return;
    var s = st, side = outSide(s.r.s, s.opts.px || 256), cv = document.createElement('canvas');
    cv.width = side; cv.height = side;
    var res = { rect: { x: s.r.x, y: s.r.y, s: s.r.s }, w: s.w, h: s.h, keep: !!(typeof s.opts.keep === 'boolean' && ui('frameKeep') && ui('frameKeep').checked) };
    var done = function() { var cb = s.cb; if (st === s) close(); if (typeof cb === 'function') cb(res); };
    try {
        cv.getContext('2d').drawImage(s.img, s.r.x, s.r.y, s.r.s, s.r.s, 0, 0, side, side);
        if (s.opts.as === 'blob') {
            s.busy = true;
            cv.toBlob(function(b) { s.busy = false; if (st !== s) return; if (!b) { toast('Could not save that picture.'); return; } res.blob = b; done(); }, 'image/png');   // cancelled or re-opened meanwhile: nothing
            return;
        }
        var data = '';
        for (var i = 0; i < ENCODE.length && !data; i++) {
            var e = ENCODE[i], c2 = cv;
            if (e.fill) { c2 = document.createElement('canvas'); c2.width = side; c2.height = side; var x2 = c2.getContext('2d'); x2.fillStyle = '#1e1c28'; x2.fillRect(0, 0, side, side); x2.drawImage(cv, 0, 0); }
            data = firstFit([{ type: e.type, data: e.q ? c2.toDataURL(e.type, e.q) : c2.toDataURL(e.type) }], s.opts.max);
        }
        if (!data) { toast('Could not shrink that picture enough — try a simpler one.'); return; }
        res.data = data; done();
    } catch (er) { s.busy = false; toast('That picture cannot be framed here.'); }   // a picture the canvas may not read back
}

// The creator's own controls (static markup in index.html #frameModal)
(function wire() {
    var stage = ui('frameStage'); if (!stage) return;
    stage.addEventListener('pointerdown', function(e) {
        if (!st) return; e.preventDefault();
        st.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        try { stage.setPointerCapture(e.pointerId); } catch (er) {}
        var ids = Object.keys(st.pointers);
        if (ids.length === 2) { var a = st.pointers[ids[0]], b = st.pointers[ids[1]]; st.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; }
    });
    stage.addEventListener('pointermove', function(e) {
        if (!st || !st.pointers[e.pointerId]) return;
        var p = st.pointers[e.pointerId], ids = Object.keys(st.pointers), k = scaleOf();
        if (ids.length >= 2 && st.pinch) {
            p.x = e.clientX; p.y = e.clientY;
            var a = st.pointers[ids[0]], b = st.pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = picPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
            setRect(zoomAt(st.r, d / st.pinch.d, mid.x, mid.y, st.w, st.h)); st.pinch.d = d;
            return;
        }
        var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        setRect(panBy(st.r, -dx / k, -dy / k, st.w, st.h));   // the picture follows the pointer: the square moves the other way
    });
    var up = function(e) { if (!st) return; delete st.pointers[e.pointerId]; if (Object.keys(st.pointers).length < 2) st.pinch = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function(e) { if (!st) return; e.preventDefault(); var f = wheelFactor(e.deltaY, e.deltaMode); if (f === 1) return; var pt = picPoint(e.clientX, e.clientY); setRect(zoomAt(st.r, f, pt.x, pt.y, st.w, st.h)); }, { passive: false });
    stage.addEventListener('dblclick', function() { if (st) setRect(defaultRect(st.w, st.h)); });
    var z = ui('frameZoom'); if (z) z.addEventListener('input', function() { if (st) setRect(setZoom(st.r, Number(z.value) / 100, st.w, st.h)); });
    Array.prototype.forEach.call(document.querySelectorAll('#frameModal .frame-shape'), function(b) { b.addEventListener('click', function() { pickShape(b.dataset.shape); }); });
    var c = ui('frameCentre'); if (c) c.addEventListener('click', function() { if (st) setRect(defaultRect(st.w, st.h)); });
    ui('frameOk').addEventListener('click', finish);
    ui('frameCancel').addEventListener('click', cancel);
    ui('frameClose').addEventListener('click', cancel);
    window.addEventListener('resize', function() { if (st) draw(); });
})();

window.wpFrame = { open: open, close: close, isOpen: function() { return !!st; } };
