/* The timeline ribbon (1.6.2, backlog 166 h; the owner, 2026-11-10, by prompt: "Both" a tab in the Calendar window and a window of its own,
   "Also the sessions played", "Smoothly, centuries to days", "Players see theirs; a press opens"). One ribbon of the campaign's time: its eras
   as colored bands, each dated note as a mark at its day (a yearly note at each year it falls in that is in view), a mark where each session
   played began, and a line where the clock stands now. The wheel and two buttons zoom about the pointer from centuries down to single days, a
   drag or the arrow keys move along it, and a press on a mark opens its day in the Calendar. It reads the clock as calendar.js hands it over,
   so a player sees the notes and eras the GM lets them see. Nothing of it is stored. Drawn with elements and text nodes alone. Steps log as
   timeline v1. */
import { cleanCalendar, dateOf, timeOf, dayLength, noteNext, fmtDate } from './calendarcore.js';

// [timelinecheck:core-start]
var TL_DAY_PX = 80, TL_SPAN_YEARS = 100000, TL_MARKS = 400, TL_PER_NOTE = 80;
function tlYears(cal) { var c = cleanCalendar(cal) || {}; return Array.isArray(c.periods) && c.periods.length ? c : null; }
// What stands on the ribbon, as days since day 1 (fractions for a moment within a day): { today, eras: [{ id, name, color, d0, d1 }] (d1 null
// while it goes on), notes, sessions: [{ day, at }] }. An era is drawn from the first day of its first year to the first day of the year after its
// last; a calendar with no years has no eras
function tlItems(cal, ck) {
    var dl = dayLength(cal), c = ck && typeof ck === 'object' ? ck : {}, yrs = tlYears(cal), out = { today: (typeof c.t === 'number' ? c.t : 0) / dl, eras: [], notes: [], sessions: [] };
    var yStart = function(yi) { var t = timeOf(cal, { yi: Math.max(0, yi), period: 0, pday: 1 }); return typeof t === 'number' ? t / dl : null; };
    if (yrs) (Array.isArray(c.eras) ? c.eras : []).forEach(function(e) {
        if (!e || typeof e.from !== 'number') return;
        var one = typeof yrs.one === 'number' ? yrs.one : 1, down = yrs.down === true, yi = function(y) { return down ? one - y : y - one; };
        var a = yi(e.from), b = typeof e.to === 'number' ? yi(e.to) : null, lo = b === null ? a : Math.min(a, b), hi = b === null ? null : Math.max(a, b);
        if (hi !== null && hi < 0) return;
        var d0 = yStart(lo), d1 = hi === null ? null : yStart(hi + 1); if (d0 === null) return;
        out.eras.push({ id: e.id, name: String(e.name || ''), color: /^#[0-9a-f]{6}$/.test(e.color) ? e.color : '#c9a227', d0: d0, d1: d1 });
    });
    out.notes = (Array.isArray(c.notes) ? c.notes : []).filter(function(n) { return n && typeof n.day === 'number'; });
    (Array.isArray(c.played) ? c.played : []).forEach(function(p) { if (p && typeof p.t === 'number') out.sessions.push({ day: p.t / dl, at: typeof p.at === 'number' ? p.at : 0 }); });
    return out;
}
// The notes in view, each at every day it falls on between d0 and d1: a yearly note at each year, TL_PER_NOTE times at most, TL_MARKS in all
function tlOccur(cal, notes, d0, d1) {
    var out = [];
    (notes || []).forEach(function(n) {
        if (out.length >= TL_MARKS) return;
        if (n.yearly !== true) { if (n.day >= Math.floor(d0) && n.day <= d1) out.push({ id: n.id, day: n.day, text: n.text, yearly: false }); return; }
        var from = Math.max(0, Math.floor(d0)), k = 0;
        while (k < TL_PER_NOTE && out.length < TL_MARKS) { var d = noteNext(cal, n, from); if (d < 0 || d > d1) break; out.push({ id: n.id, day: d, text: n.text, yearly: true }); from = d + 1; k++; }
    });
    return out.sort(function(a, b) { return a.day - b.day; });
}
// How near the ribbon may come (a day TL_DAY_PX wide) and how far out (TL_SPAN_YEARS of the calendar's years, or of 365 days with none), in days a pixel
function tlLimits(cal, width) { var c = tlYears(cal), yl = 365; if (c) { yl = 0; c.periods.forEach(function(p) { yl += p.days; }); } return { min: 1 / TL_DAY_PX, max: Math.max(1, TL_SPAN_YEARS * yl / Math.max(100, width)) }; }
// The view zoomed by f about the pixel at (from the ribbon's left), the day under it staying under it; held to the limits
function tlZoom(view, f, at, width, lim) {
    var dpp = Math.max(lim.min, Math.min(lim.max, view.dpp * f)), left = view.c - width * view.dpp / 2, day = left + at * view.dpp;
    return { c: day - at * dpp + width * dpp / 2, dpp: dpp };
}
// A view that shows every day between d0 and d1 with a twentieth of room either side, held to the limits
function tlFit(d0, d1, width, lim) { var span = Math.max(1, d1 - d0), dpp = Math.max(lim.min, Math.min(lim.max, span * 1.1 / Math.max(100, width))); return { c: (d0 + d1) / 2, dpp: dpp }; }
// The ticks along the ribbon: [{ day, label }] between d0 and d1, by years, by periods or by days, as many as fit at least 70 px apart
function tlTicks(cal, d0, d1, width) {
    var dpp = (d1 - d0) / Math.max(1, width), gap = 70 * dpp, out = [], c = tlYears(cal), dl = dayLength(cal), steps = [1, 2, 5];
    var nice = function(min) { for (var p = 1; p < 1e12; p *= 10) for (var i = 0; i < 3; i++) if (steps[i] * p >= min) return steps[i] * p; return 1e12; };
    if (c) {
        var yl = 0; c.periods.forEach(function(p) { yl += p.days; });
        if (gap >= yl * 0.9) {   // by years
            var step = nice(gap / yl), first = dateOf(cal, Math.max(0, d0) * dl), yi = Math.ceil(first.yi / step) * step;
            for (var n = 0; n < 200; n++, yi += step) { var t = timeOf(cal, { yi: yi, period: 0, pday: 1 }); if (typeof t !== 'number') break; var d = t / dl; if (d > d1) break; if (d >= d0) out.push({ day: d, label: String(dateOf(cal, t).year) }); }
            return out;
        }
        if (gap >= 8) {   // by periods: each period that starts in view and stands clear of the last (closer in, the days themselves)
            var at = dateOf(cal, Math.max(0, Math.floor(d0)) * dl), pyi = at.yi, pi = at.period, last = -Infinity;
            for (var m = 0; m < 400; m++) {
                var tp = timeOf(cal, { yi: pyi, period: pi, pday: 1 }); if (typeof tp !== 'number') break; var dp = tp / dl; if (dp > d1) break;
                if (dp >= d0 && dp - last >= gap) { out.push({ day: dp, label: c.periods[pi].name + (pi === 0 ? ', ' + dateOf(cal, tp).year : '') }); last = dp; }
                pi++; if (pi >= c.periods.length) { pi = 0; pyi++; }
            }
            return out;
        }
    }
    var ds = Math.max(1, nice(gap)), dd = Math.ceil(Math.max(0, d0) / ds) * ds;   // by days
    for (var k = 0; k < 200 && dd <= d1; k++, dd += ds) out.push({ day: dd, label: c ? fmtDate(cal, dd * dl).replace(/^[^,]*, /, '').replace(/, [^,]*$/, '') : 'Day ' + (dd + 1) });
    return out;
}
// [timelinecheck:core-end]

function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function log(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('timeline v1', s, f || {}); } catch (e) {} }
function realDay(at) { if (!(at > 0)) return ''; try { return new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
// The ribbon drawn into host: cal and ck the calendar and the clock as the screen holds them, pick(day) what a press on a mark does. The view
// is kept on the host, so a redraw keeps the place and the zoom
function draw(host, cal, ck, pick) {
    if (!host) return;
    var items = tlItems(cal, ck), dl = dayLength(cal);
    host.textContent = ''; host.classList.add('tl-host');
    var bar = el('div', 'tl-bar'), ribbon = el('div', 'tl-ribbon'); ribbon.tabIndex = 0; ribbon.setAttribute('role', 'group'); ribbon.setAttribute('aria-label', 'Timeline. Arrow keys move along it, plus and minus zoom.');
    var mkb = function(text, tip, f) { var b = el('button', 'tool ghost tl-btn', text); b.type = 'button'; b.title = tip; b.addEventListener('click', f); bar.appendChild(b); return b; };
    host.appendChild(bar); host.appendChild(ribbon);
    var W = function() { return Math.max(200, ribbon.clientWidth || 600); }, lim = function() { return tlLimits(cal, W()); };
    var all = [items.today].concat(items.notes.map(function(n) { return n.day; }), items.sessions.map(function(s) { return s.day; }), items.eras.map(function(e) { return e.d0; }));
    var fit = function() { return tlFit(Math.min.apply(null, all), Math.max.apply(null, all.concat(items.eras.map(function(e) { return e.d1 === null ? items.today : e.d1; }))), W(), lim()); };
    if (!host._tl) host._tl = fit();
    var paint = function() {
        var v = host._tl, w = W(), d0 = v.c - w * v.dpp / 2, d1 = v.c + w * v.dpp / 2, x = function(d) { return (d - d0) / v.dpp; };
        ribbon.textContent = '';
        items.eras.forEach(function(e) {
            var a = Math.max(-2, x(e.d0)), b = Math.min(w + 2, x(e.d1 === null ? Math.max(d1, items.today) : e.d1)); if (b <= a) return;
            var band = el('div', 'tl-era'); band.style.left = a + 'px'; band.style.width = (b - a) + 'px'; band.style.background = e.color; band.title = e.name; ribbon.appendChild(band);
            if (b - a > 40) { var nm = el('span', 'tl-era-name', e.name); nm.style.left = Math.max(2, a + 4) + 'px'; nm.style.maxWidth = (b - Math.max(2, a + 4) - 4) + 'px'; ribbon.appendChild(nm); }
        });
        tlTicks(cal, d0, d1, w).forEach(function(t) { var k = el('div', 'tl-tick'); k.style.left = x(t.day) + 'px'; k.appendChild(el('span', 'tl-tick-label', t.label)); ribbon.appendChild(k); });
        if (items.today >= d0 && items.today <= d1) { var td = el('div', 'tl-today'); td.style.left = x(items.today) + 'px'; td.title = 'Now: ' + fmtDate(cal, items.today * dl); ribbon.appendChild(td); }
        items.sessions.forEach(function(s) {
            if (s.day < d0 || s.day > d1) return;
            var b = el('button', 'tl-mark tl-session'); b.type = 'button'; b.style.left = x(s.day) + 'px'; var rd = realDay(s.at);
            b.title = 'A session began here, ' + fmtDate(cal, s.day * dl) + (rd ? '. Played ' + rd : '') + '. Press to open its day.'; b.dataset.day = String(Math.floor(s.day)); ribbon.appendChild(b);
        });
        var lastLabel = -Infinity;
        tlOccur(cal, items.notes, d0, d1).forEach(function(n) {
            var px = x(n.day + 0.5), b = el('button', 'tl-mark tl-note' + (n.day < Math.floor(items.today) ? ' tl-past' : '')); b.type = 'button'; b.style.left = px + 'px';
            b.title = fmtDate(cal, n.day * dl) + ': ' + n.text + (n.yearly ? ' (every year)' : '') + '. Press to open its day.'; b.dataset.day = String(n.day); ribbon.appendChild(b);
            if (px - lastLabel > 110) { var lb = el('span', 'tl-note-label', n.text); lb.style.left = Math.max(2, Math.min(w - 122, px - 60)) + 'px'; ribbon.appendChild(lb); lastLabel = px; }   // held inside the ribbon, never cut at an edge
        });
    };
    var zoom = function(f, at) { host._tl = tlZoom(host._tl, f, at === undefined ? W() / 2 : at, W(), lim()); paint(); };
    var zs = bar.appendChild(el('span', 'ui-seg tl-zoom')); zs.appendChild(mkb('−', 'Zoom out', function() { zoom(2); })); zs.appendChild(mkb('+', 'Zoom in', function() { zoom(0.5); }));   /* 1.6.2 (backlog 225): zoom out | in in one frame, Now and Everything beside */
    mkb('Now', 'Back to where the clock stands', function() { host._tl = { c: items.today, dpp: host._tl.dpp }; paint(); });
    mkb('Everything', 'Zoom out to show every era, note and session', function() { host._tl = fit(); paint(); });
    bar.appendChild(el('span', 'tl-key', 'Notes ●  Sessions ◆  Now |'));
    ribbon.addEventListener('wheel', function(e) { e.preventDefault(); var r = ribbon.getBoundingClientRect(); var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1); zoom(Math.exp(Math.max(-3, Math.min(3, dy * 0.0025))), e.clientX - r.left); }, { passive: false });   // a notch about a quarter, a long turn more
    var drag = null;
    ribbon.addEventListener('pointerdown', function(e) { if (e.target.closest && e.target.closest('.tl-mark')) return; drag = { x: e.clientX, c: host._tl.c, moved: false }; try { ribbon.setPointerCapture(e.pointerId); } catch (err) {} });
    ribbon.addEventListener('pointermove', function(e) { if (!drag) return; var dx = e.clientX - drag.x; if (Math.abs(dx) > 2) drag.moved = true; host._tl = { c: drag.c - dx * host._tl.dpp, dpp: host._tl.dpp }; paint(); });
    var up = function() { drag = null; }; ribbon.addEventListener('pointerup', up); ribbon.addEventListener('pointercancel', up);
    ribbon.addEventListener('click', function(e) { var m = e.target.closest ? e.target.closest('.tl-mark') : null; if (!m) return; var d = Number(m.dataset.day); if (d >= 0 && Math.floor(d) === d && typeof pick === 'function') { log('open', { kind: m.classList.contains('tl-session') ? 'session' : 'note' }); pick(d); } });
    ribbon.addEventListener('keydown', function(e) {
        var w = W(), k = e.key;
        if (k === 'ArrowLeft' || k === 'ArrowRight') { host._tl = { c: host._tl.c + (k === 'ArrowLeft' ? -1 : 1) * w * host._tl.dpp / 4, dpp: host._tl.dpp }; paint(); }
        else if (k === '+' || k === '=') zoom(0.5); else if (k === '-' || k === '_') zoom(2); else return;
        e.preventDefault(); e.stopPropagation();
    });
    paint();
    if (!ribbon.clientWidth && typeof requestAnimationFrame === 'function') requestAnimationFrame(function() { if (ribbon.isConnected) { if (!host._tlFitted) { host._tl = fit(); host._tlFitted = true; } paint(); } });
}

// The ribbon as a window of its own, the GM's, over the map: the calendar and the clock from calendar.js, a press opening the day there
var _tw = { drag: null };
function P() { return document.getElementById('timelinePanel'); }
function wDraw() { var C = window.wpCalendar, d = C && typeof C.timeData === 'function' ? C.timeData() : null, body = document.getElementById('timelineBody'); if (!body) return; if (!d) { body.textContent = ''; body.appendChild(el('div', 'sys-note', 'The timeline needs the Calendar. Switch it on in Settings.')); return; } draw(body, d.cal, d.ck, function(day) { if (C.openDay) C.openDay(day); }); }
function open() {
    var p = P(), n = window.wpNet; if (!p || (n && (n.foreign || (n.active && n.role === 'client')))) return false;
    p.style.display = 'flex'; if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    wDraw(); log('window'); return true;
}
function close() { var p = P(); if (p) p.style.display = 'none'; }
function wire() {
    var p = P(); if (!p) return;
    var c = document.getElementById('timelineClose'); if (c) c.addEventListener('click', close);
    var mb = document.getElementById('timelineCampBtn'); if (mb) mb.addEventListener('click', function() { if (!open() && typeof window.toast === 'function') window.toast('The timeline window is the GM’s. Players find it in the Calendar.'); });
    p.addEventListener('keydown', function(e) { if (e.key !== 'Escape') e.stopPropagation(); });
    var head = document.getElementById('timelineHead'); if (head) {
        head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); _tw.drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
        head.addEventListener('pointermove', function(e) { if (!_tw.drag) return; p.style.left = Math.max(0, e.clientX - _tw.drag.dx) + 'px'; p.style.top = Math.max(0, e.clientY - _tw.drag.dy) + 'px'; });
        head.addEventListener('pointerup', function() { if (_tw.drag) { _tw.drag = null; try { p.dispatchEvent(new Event('wpfloatmoved')); } catch (e) {} } });
    }
}
if (typeof window !== 'undefined') {
    window.wpTimeline = { draw: draw, open: open, close: close, refresh: function() { var p = P(); if (p && p.style.display !== 'none') wDraw(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
export { tlItems, tlOccur, tlLimits, tlZoom, tlFit, tlTicks };
