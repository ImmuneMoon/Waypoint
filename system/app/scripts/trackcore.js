/* Table trackers (1.6.0, backlog 29) — the pure half. The owner, 2026-10-29, by prompt on docs/sheets/trackers-sheet.html: "A. A strip on
   the map (Recommended)", a countdown's time "Each one picks (Recommended)" (real time or the game clock), a clock "A. A circle in parts
   (Recommended)", and at the end "A. Glow and a chat line (Recommended)".

   A tracker belongs to a campaign (camp.trackers, a list, absent when there are none), on one map (map, a map's id) or on every map (no map).
   It is the GM's alone (no vis) or shown to the table (vis: 'all'). Its value is the GM's to set. Three kinds:
     count   a number v with − and +, from min to max where they are set; start is what Reset puts back.
     clock   parts (2 to 12) and fill (0 to parts).
     timer   a countdown of total, left while it stands, run with end while it runs. base 'game' counts game seconds against the campaign's
             clock (end is a game second); no base counts real milliseconds (end is a moment of this machine's own clock).
   What a player is sent (wireFor) is the trackers shown to the table on every map and on the map that player stands on, each without its map,
   its vis or its end: a running countdown says the time left at the moment it is sent. A GM-only tracker is never in it.
   No DOM, no state: tools/trackcheck.js runs it under Node. Published as window.wpTrackCore. */
'use strict';

var LIMITS = Object.freeze({
    list: 24,               // trackers a campaign
    name: 40,               // a tracker's name (code points, one line)
    count: 9999,            // a counter runs from -9999 to 9999
    parts: [2, 12],         // a clock's parts
    real: 86400000,         // a real-time countdown: at most 24 hours (milliseconds)
    game: 315360000,        // a game-clock countdown: at most 3650 days of 24 hours (game seconds)
    hide: 64                // players a campaign keeps the trackers from
});
var KINDS = ['count', 'clock', 'timer'];
// The colours a tracker may wear, by name: a name is all a tracker stores and all the wire carries, so no colour text ever reaches a style
var COLORS = Object.freeze({ gold: '#d4a64a', red: '#d9534f', blue: '#5b8fd9', violet: '#a77fd6', green: '#5cb87a', grey: '#9a9688' });
var COLOR_KEYS = Object.keys(COLORS);
var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
var CTRL_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
var DEFAULT_NAME = { count: 'Counter', clock: 'Clock', timer: 'Countdown' };

function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function own(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
function whole(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }
function clampInt(v, lo, hi, dflt) { if (typeof v !== 'number' || !isFinite(v)) return dflt; v = Math.round(v); return v < lo ? lo : v > hi ? hi : v; }
function cutName(v) { if (typeof v !== 'string') return ''; var a = Array.from(v.replace(CTRL_G, ' ').trim()); return a.slice(0, LIMITS.name).join('').trim(); }
function mapKey(k) { return typeof k === 'string' && k.length > 0 && k.length <= 160 && !(k in Object.prototype) ? k : ''; }
function capOf(base) { return base === 'game' ? LIMITS.game : LIMITS.real; }
function unitOf(base) { return base === 'game' ? 1 : 1000; }   // a game countdown counts whole seconds, a real one whole seconds kept in milliseconds

// One tracker as the campaign keeps it, or null. o: { maps } (the campaign's map ids, an object; a tracker of a map no longer there is
// dropped), { wire: true } (a player's copy: no map, no vis, no end, and a running countdown's left is what the host sent)
function cleanTracker(t, o) {
    o = o || {};
    if (!isObj(t) || typeof t.id !== 'string' || !ID_RE.test(t.id) || t.id in Object.prototype) return null;
    var kind = KINDS.indexOf(t.kind) >= 0 ? t.kind : null; if (!kind) return null;
    var out = { id: t.id, kind: kind, name: cutName(t.name) || DEFAULT_NAME[kind], color: COLOR_KEYS.indexOf(t.color) >= 0 ? t.color : 'gold' };
    if (!o.wire) {
        var m = mapKey(t.map); if (m) { if (isObj(o.maps) && !own(o.maps, m)) return null; out.map = m; }   // a tracker of a map that is gone goes with it
        if (t.vis === 'all') out.vis = 'all';
    }
    if (kind === 'count') {
        var lo = whole(t.min, -LIMITS.count, LIMITS.count), hi = whole(t.max, -LIMITS.count, LIMITS.count);
        if (lo !== null && hi !== null && lo > hi) { lo = null; hi = null; }
        var a = lo === null ? -LIMITS.count : lo, b = hi === null ? LIMITS.count : hi;
        out.v = clampInt(t.v, a, b, Math.min(Math.max(0, a), b));
        if (lo !== null) out.min = lo; if (hi !== null) out.max = hi;
        if (!o.wire) { var st = whole(t.start, a, b); if (st !== null && st !== 0) out.start = st; }
    } else if (kind === 'clock') {
        out.parts = clampInt(t.parts, LIMITS.parts[0], LIMITS.parts[1], 4);
        out.fill = clampInt(t.fill, 0, out.parts, 0);
    } else {
        var base = t.base === 'game' ? 'game' : '', cap = capOf(base), u = unitOf(base);
        if (base) out.base = base;
        var tot = clampInt(t.total, u, cap, 600 * u); tot = Math.max(u, Math.round(tot / u) * u); out.total = tot;
        out.left = clampInt(t.left, 0, tot, tot);
        if (t.run === true) {
            if (o.wire) out.run = true;
            else { var e = typeof t.end === 'number' && isFinite(t.end) && t.end >= 0 && t.end <= 1e16 ? Math.round(t.end) : null; if (e !== null) { out.run = true; out.end = e; } }
        }
    }
    return out;
}
// The campaign's list, or a player's copy of what was sent: cleaned, ids kept once, at most LIMITS.list. Answers an array (empty for none)
function cleanTrackers(list, o) {
    if (!Array.isArray(list)) return [];
    var seen = Object.create(null), out = [];
    for (var i = 0, n = Math.min(list.length, LIMITS.list * 4); i < n && out.length < LIMITS.list; i++) { var t = cleanTracker(list[i], o); if (t && !seen[t.id]) { seen[t.id] = 1; out.push(t); } }
    return out;
}
// A countdown's time left now: now is this machine's clock (ms), clockT the campaign's clock (game seconds). A running real one stands at its
// end less now; a running game one at its end less the clock; a standing one at left. Never below 0, never past its total
function leftNow(t, now, clockT) {
    if (!t || t.kind !== 'timer') return 0;
    if (t.run !== true || typeof t.end !== 'number') return t.left;
    var l = t.base === 'game' ? t.end - (typeof clockT === 'number' && isFinite(clockT) ? clockT : 0) : t.end - (typeof now === 'number' ? now : 0);
    return Math.max(0, Math.min(t.total, Math.ceil(l)));
}
// Has it reached its end? A countdown at no time left, a clock with every part filled. A counter never
function doneOf(t, now, clockT) {
    if (!t) return false;
    if (t.kind === 'clock') return t.fill >= t.parts;
    if (t.kind === 'timer') return leftNow(t, now, clockT) <= 0;
    return false;
}
// The trackers a screen shows: on the GM's, those of every map and of the map on screen, the GM's own too
function onMap(list, mapId) { return (Array.isArray(list) ? list : []).filter(function(t) { return t && (!t.map || t.map === mapId); }); }
// What one player is sent: the trackers shown to the table on every map and on the map they stand on (where, a map id or null), each as a
// copy without its map, its vis or its end; a running countdown carries its time left now and run. A GM-only tracker never
function wireFor(list, where, now, clockT) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(t) {
        if (!t || t.vis !== 'all' || (t.map && t.map !== where)) return;
        var w = { id: t.id, kind: t.kind, name: t.name, color: t.color };
        if (t.kind === 'count') { w.v = t.v; if (typeof t.min === 'number') w.min = t.min; if (typeof t.max === 'number') w.max = t.max; }
        else if (t.kind === 'clock') { w.parts = t.parts; w.fill = t.fill; }
        else { if (t.base === 'game') w.base = 'game'; w.total = t.total; w.left = leftNow(t, now, clockT); if (t.run === true && w.left > 0) w.run = true; }
        out.push(w);
    });
    return out;
}
// The same list in a form that changes only when what a player is shown changes: a running real countdown by its end (its left moves every
// moment and is worked out on their machine), every other as sent. What the host compares before it sends again
function wireSig(list, where, now, clockT) {
    return JSON.stringify(wireFor(list, where, now, clockT).map(function(w) {
        if (w.kind !== 'timer' || w.base === 'game' || !w.run) return w;
        var t = (list || []).filter(function(x) { return x && x.id === w.id; })[0]; return Object.assign({}, w, { left: 0, end: t ? t.end : 0 });
    }));
}

// The GM's hand. Each answers a new tracker (the one given is never changed) or null when nothing changes
function step(t, d) {
    if (!t || typeof d !== 'number' || !isFinite(d)) return null;
    var n = Object.assign({}, t);
    if (t.kind === 'count') { var lo = typeof t.min === 'number' ? t.min : -LIMITS.count, hi = typeof t.max === 'number' ? t.max : LIMITS.count; n.v = clampInt(t.v + Math.round(d), lo, hi, t.v); return n.v === t.v ? null : n; }
    if (t.kind === 'clock') { n.fill = clampInt(t.fill + Math.round(d), 0, t.parts, t.fill); return n.fill === t.fill ? null : n; }
    return null;
}
function start(t, now, clockT) {
    if (!t || t.kind !== 'timer' || t.run === true) return null;
    var l = t.left > 0 ? t.left : t.total, n = Object.assign({}, t, { run: true, left: l });
    n.end = t.base === 'game' ? Math.round((typeof clockT === 'number' && isFinite(clockT) ? clockT : 0) + l) : Math.round((typeof now === 'number' ? now : 0) + l);
    return n;
}
function pause(t, now, clockT) {
    if (!t || t.kind !== 'timer' || t.run !== true) return null;
    var n = Object.assign({}, t, { left: leftNow(t, now, clockT) }); delete n.run; delete n.end; return n;
}
function reset(t) {
    if (!t) return null;
    var n = Object.assign({}, t);
    if (t.kind === 'count') { var lo = typeof t.min === 'number' ? t.min : -LIMITS.count, hi = typeof t.max === 'number' ? t.max : LIMITS.count; n.v = typeof t.start === 'number' ? t.start : Math.min(Math.max(0, lo), hi); }
    else if (t.kind === 'clock') n.fill = 0;
    else { n.left = t.total; delete n.run; delete n.end; }
    return JSON.stringify(n) === JSON.stringify(t) ? null : n;
}
// A running countdown that has reached its end, stopped there: left 0, run and end gone. null while it still runs or stands
function settle(t, now, clockT) {
    if (!t || t.kind !== 'timer' || t.run !== true || leftNow(t, now, clockT) > 0) return null;
    var n = Object.assign({}, t, { left: 0 }); delete n.run; delete n.end; return n;
}

// Words. A real countdown as m:ss or h:mm:ss; a game one by its largest units (2 d 3 h, 2 h 15 min, 45 min, 30 s), day length given
function fmtReal(ms) {
    var s = Math.max(0, Math.ceil((typeof ms === 'number' && isFinite(ms) ? ms : 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    var two = function(x) { return (x < 10 ? '0' : '') + x; };
    return h ? h + ':' + two(m) + ':' + two(r) : two(m) + ':' + two(r);
}
function fmtGame(secs, dayLen) {
    var s = Math.max(0, Math.round(typeof secs === 'number' && isFinite(secs) ? secs : 0)), D = whole(dayLen, 60, 1e9) || 86400;
    var d = Math.floor(s / D), h = Math.floor((s % D) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (d) return d + ' d' + (h ? ' ' + h + ' h' : '');
    if (h) return h + ' h' + (m ? ' ' + m + ' min' : '');
    if (m) return m + ' min' + (r && m < 10 ? ' ' + r + ' s' : '');
    return r + ' s';
}
function fmtLeft(t, left, dayLen) { return t && t.base === 'game' ? fmtGame(left, dayLen) : fmtReal(left); }
// What a tracker says on its pill, as text
function face(t, now, clockT, dayLen) {
    if (!t) return '';
    if (t.kind === 'count') return String(t.v);
    if (t.kind === 'clock') return t.fill + '/' + t.parts;
    return fmtLeft(t, leftNow(t, now, clockT), dayLen);
}
// The chat line when one reaches its end
function endLine(t) {
    if (!t) return '';
    return t.kind === 'clock' ? 'The ' + t.name + ' clock is full.' : 'The ' + t.name + ' countdown has run out.';
}
// The parts of a clock as the circle draws them: one path a part, from the top clockwise, each { d, on }. r: the radius, c: the centre
function clockParts(parts, fill, c, r) {
    var n = clampInt(parts, LIMITS.parts[0], LIMITS.parts[1], 4), f = clampInt(fill, 0, n, 0), out = [];
    var pt = function(a) { return (c + r * Math.sin(a)).toFixed(2) + ' ' + (c - r * Math.cos(a)).toFixed(2); };
    for (var i = 0; i < n; i++) {
        var a0 = 2 * Math.PI * i / n, a1 = 2 * Math.PI * (i + 1) / n;
        out.push({ d: 'M' + c + ' ' + c + 'L' + pt(a0) + 'A' + r + ' ' + r + ' 0 0 1 ' + pt(a1) + 'Z', on: i < f });
    }
    return out;
}
// A fresh tracker of a kind, for the GM's + Tracker. id: a fresh id the caller made
function fresh(kind, id, mapId) {
    var t = { id: id, kind: KINDS.indexOf(kind) >= 0 ? kind : 'count', name: '', color: 'gold' };
    if (mapId) t.map = mapId;
    return cleanTracker(t, {});
}

// The players the GM keeps every tracker from (the owner, 2026-10-29, by prompt: "gm but for the whole table or specific players"): camp.trkHide,
// profile ids, each once, at most 64; absent for none. Such a player is sent no tracker at all
var PID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
function cleanHide(v) {
    var out = [];
    (Array.isArray(v) ? v.slice(0, LIMITS.hide * 4) : []).forEach(function(id) { if (typeof id === 'string' && PID_RE.test(id) && !(id in Object.prototype) && out.indexOf(id) < 0 && out.length < LIMITS.hide) out.push(id); });
    return out;
}
function hiddenFrom(camp, pid) { return isObj(camp) && typeof pid === 'string' && cleanHide(camp.trkHide).indexOf(pid) >= 0; }
// The list with one player put in or taken out; null where nothing changes (a hostile id, a full list)
function hideSet(v, pid, on) {
    var list = cleanHide(v), at = list.indexOf(pid);
    if (typeof pid !== 'string' || !PID_RE.test(pid) || (pid in Object.prototype)) return null;
    if (on) { if (at >= 0 || list.length >= LIMITS.hide) return null; return list.concat([pid]); }
    if (at < 0) return null; list.splice(at, 1); return list;
}

var API = { LIMITS: LIMITS, COLORS: COLORS, COLOR_KEYS: COLOR_KEYS, KINDS: KINDS, cleanTracker: cleanTracker, cleanTrackers: cleanTrackers, leftNow: leftNow, doneOf: doneOf, onMap: onMap,
    wireFor: wireFor, wireSig: wireSig, step: step, start: start, pause: pause, reset: reset, settle: settle, fmtReal: fmtReal, fmtGame: fmtGame, fmtLeft: fmtLeft, face: face,
    endLine: endLine, clockParts: clockParts, fresh: fresh, cleanHide: cleanHide, hiddenFrom: hiddenFrom, hideSet: hideSet };
if (typeof window !== 'undefined') window.wpTrackCore = API;
export { LIMITS, COLORS, COLOR_KEYS, KINDS, cleanTracker, cleanTrackers, leftNow, doneOf, onMap, wireFor, wireSig, step, start, pause, reset, settle, fmtReal, fmtGame, fmtLeft, face, endLine, clockParts, fresh, cleanHide, hiddenFrom, hideSet };
