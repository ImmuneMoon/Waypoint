/* Table trackers (1.6.0, backlog 29; the owner, 2026-10-29, by prompt on docs/sheets/trackers-sheet.html: "A. A strip on the map
   (Recommended)", a countdown's time "Each one picks (Recommended)", a clock "A. A circle in parts (Recommended)", and at the end "A. Glow and a
   chat line (Recommended)"). The pure half is trackcore.js.

   The strip (#trkStrip) runs along the top left of the play map. Each tracker is a pill: its colour, its name, its value. On the GM's screen
   (the machine that owns the campaign) a counter and a clock have − and +, a countdown its start and pause, a press on a name opens the
   tracker's menu beside it (#trkMenu, closed by Escape as a right-click menu is), and + Tracker opens the form (#trkPanel, a floating box). A
   tracker the GM keeps to themselves wears a small GM mark. A player's strip shows only what the host sent them (net.js trkSendTo), drawn the
   same way with no control but the fold, which puts the strip away on this screen alone (wp_trkFold). The stream window shows the trackers shown
   to the table, from the save it reads (stream.js).

   The GM's machine ticks once a second: a countdown that reaches its end stops there, and each machine that sees a tracker reach its end
   (a countdown run out, a clock filled) says so once in Table Chat (net.trackerLine) and lights its pill. Every step is logged ('trackers v1'). */
import { state } from './state.js';
import { getActiveCampaign, getActiveMap } from './models.js';
import { save, toast } from './io.js';
import { showConfirm } from './dialogs.js';
import './trackcore.js';

function TK() { return window.wpTrackCore || null; }
function net() { return window.wpNet || null; }
function log(step, facts) { if (window.wpStepLog) window.wpStepLog('trackers v1', step, facts || {}); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.dataset.tip = tip; return b; }
var SVG = 'http://www.w3.org/2000/svg';

// [trackcheck:core-start]
// Who this screen is: a player's app (or the stream window) at someone's table shows what it was sent; every other screen is the campaign's own
function atTable(n) { return !!n && n.active === true && n.role === 'client' && n.foreign === true; }
// May this machine change the trackers? The campaign's own machine, never at someone's table, never the stream window, never where the app
// keeps nothing of its own (a website's plan that joins tables alone)
function gmHand(n, w) { if (atTable(n) || (n && n.stream) || (w && w.wpStream)) return false; return !(w && typeof w.wpCanPersistLocal === 'function' && w.wpCanPersistLocal() !== true); }
// The campaign's map ids, for the cleaner
function mapsOf(camp) { var o = Object.create(null); if (camp && camp.items && typeof camp.items === 'object') Object.keys(camp.items).forEach(function(id) { var it = camp.items[id]; if (it && it.type === 'map') o[id] = 1; }); return o; }
// A copy of what a host sent, turned to this machine's own clock: a running real countdown ends at its left from the moment it arrived; a
// running game one keeps the left it was sent (the host sends again as the clock moves)
function localCopy(list, at) {
    return (Array.isArray(list) ? list : []).map(function(t) {
        var c = Object.assign({}, t);
        if (c.kind === 'timer' && c.run === true) { if (c.base !== 'game') c.end = at + c.left; else delete c.run; c.live = true; }
        return c;
    });
}
// The trackers that reached their end since the last look: seen holds each id's last state (true: at its end). One not seen before is no news
function newlyDone(list, seen, now, clockT) {
    var T = TK(), out = [];
    (list || []).forEach(function(t) { var d = T.doneOf(t, now, clockT); if (Object.prototype.hasOwnProperty.call(seen, t.id) && seen[t.id] === false && d) out.push(t); seen[t.id] = d; });
    return out;
}
// The form's figures as a tracker: d is what the form holds ({ id, kind, name, color, here, table, v, min, max, start, parts, fill, amount,
// unit, base, left, run, end }); mapId the map on screen. Blank lowest and highest are none
function fromForm(d, mapId, unitSecs) {
    var T = TK(), num = function(v) { var n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : Number(v); return isFinite(n) ? n : null; };
    var t = { id: d.id, kind: d.kind, name: d.name, color: d.color };
    if (d.here === true && mapId) t.map = mapId; if (d.table === true) t.vis = 'all';
    if (d.kind === 'count') { t.v = num(d.v); var lo = num(d.min), hi = num(d.max), st = num(d.start); if (lo !== null) t.min = Math.round(lo); if (hi !== null) t.max = Math.round(hi); if (st !== null) t.start = Math.round(st); if (t.v === null) t.v = 0; }
    else if (d.kind === 'clock') { t.parts = num(d.parts); t.fill = num(d.fill) || 0; }
    else {
        var amt = num(d.amount), u = num(unitSecs) || 60, game = d.base === 'game';
        if (game) t.base = 'game';
        t.total = amt !== null && amt > 0 ? Math.round(amt * u) * (game ? 1 : 1000) : null;
        if (d.sameTime === true && typeof d.left === 'number') { t.left = d.left; if (d.run === true) { t.run = true; t.end = d.end; } }
        else t.left = t.total;
    }
    return T.cleanTracker(t, {});
}
// [trackcheck:core-end]

var _rx = { list: [], at: 0 };   // what a host sent this player's app, on this machine's clock
var _seen = Object.create(null), _seenKey = '';   // each tracker's last state, to say an end once; kept for one campaign or table
var _menu = '', _form = null, _sig = '';
function strip() { return document.getElementById('trkStrip'); }
function panel() { return document.getElementById('trkPanel'); }
function menuEl() { return document.getElementById('trkMenu'); }
function foldOn() { try { return localStorage.getItem('wp_trkFold') === '1'; } catch (e) { return false; } }
function foldSet(on) { try { if (on) localStorage.setItem('wp_trkFold', '1'); else localStorage.removeItem('wp_trkFold'); } catch (e) {} }
function campNow() { var c = getActiveCampaign(); return c && typeof c.id === 'string' ? c : null; }
function mapNow() { var m = getActiveMap(); return m && m.type === 'map' && typeof m.id === 'string' ? m.id : ''; }
function clockT(camp) { return camp && camp.clock && typeof camp.clock.t === 'number' && isFinite(camp.clock.t) ? camp.clock.t : 0; }
function dayLen(camp) { var CC = window.wpCalendarCore; try { return CC && CC.dayLength ? CC.dayLength(camp && camp.system ? camp.system.calendar || null : null) : 86400; } catch (e) { return 86400; } }
function ownList(camp) { var T = TK(); return camp && T ? T.cleanTrackers(camp.trackers, { maps: mapsOf(camp) }) : []; }
// The trackers this screen shows now
function shownList() {
    var T = TK(), n = net(), camp = campNow(); if (!T || !camp) return [];
    if (atTable(n)) return _rx.list;
    return T.onMap(ownList(camp), mapNow());
}
function onPlay() { return state.viewMode === 'visual' && !!mapNow(); }

// The GM's hand: one change to the campaign's list, saved, sent to the table and logged
function commit(fn, step, facts) {
    var camp = campNow(), T = TK(); if (!camp || !T || !gmHand(net(), window)) return false;
    var list = ownList(camp), out = fn(list); if (!out) return false;
    out = T.cleanTrackers(out, { maps: mapsOf(camp) });
    if (out.length) camp.trackers = out; else delete camp.trackers;
    save();
    var n = net(); if (n && typeof n.syncTrackers === 'function') n.syncTrackers();
    log(step, facts);
    draw(true);
    return true;
}
function replaceOne(id, fn) { return function(list) { var hit = false, out = list.map(function(t) { if (t.id !== id) return t; var n = fn(t); if (n) { hit = true; return n; } return t; }); return hit ? out : null; }; }
function stepBy(id, d) {
    var camp = campNow(), T = TK(), before = ownList(camp).filter(function(t) { return t.id === id; })[0]; if (!before) return;
    if (commit(replaceOne(id, function(t) { return T.step(t, d); }), 'step', { kind: before.kind, by: d })) seeNow();
}
function startStop(id) {
    var camp = campNow(), T = TK(), now = Date.now(), ck = clockT(camp), t0 = ownList(camp).filter(function(t) { return t.id === id; })[0]; if (!t0) return;
    var run = t0.run === true;
    commit(replaceOne(id, function(t) { return run ? T.pause(t, now, ck) : T.start(t, now, ck); }), run ? 'pause' : 'start', { base: t0.base === 'game' ? 'game' : 'real' });
}
function resetOne(id) { var T = TK(), t0 = ownList(campNow()).filter(function(t) { return t.id === id; })[0]; if (t0) commit(replaceOne(id, function(t) { return T.reset(t); }), 'reset', { kind: t0.kind }); }
function flip(id, key) {
    var mapId = mapNow(), t0 = ownList(campNow()).filter(function(t) { return t.id === id; })[0]; if (!t0) return;
    commit(replaceOne(id, function(t) {
        var n = Object.assign({}, t);
        if (key === 'vis') { if (n.vis === 'all') delete n.vis; else n.vis = 'all'; }
        else { if (n.map) delete n.map; else if (mapId) n.map = mapId; else return null; }
        return n;
    }), key === 'vis' ? 'shown' : 'where', key === 'vis' ? { table: t0.vis !== 'all' } : { every: !!t0.map });
}
function removeOne(id) {
    var t0 = ownList(campNow()).filter(function(t) { return t.id === id; })[0]; if (!t0) return;
    showConfirm('Remove the tracker ' + t0.name + '? Everyone who sees it loses it.', function(yes) {
        if (yes !== true) return;
        commit(function(list) { return list.filter(function(t) { return t.id !== id; }); }, 'remove', { kind: t0.kind });
    });
}
// What every machine that sees a tracker does once a second: the GM's settles a countdown at its end; each says an end it sees once
function seeNow() {
    var T = TK(), n = net(), camp = campNow(); if (!T || !camp) return;
    var key = (atTable(n) ? 't:' + (n.syncedPeer || '') : 'c:') + camp.id; if (key !== _seenKey) { _seenKey = key; _seen = Object.create(null); }
    var list = atTable(n) ? _rx.list : ownList(camp), now = Date.now(), ck = clockT(camp);
    newlyDone(list, _seen, now, ck).forEach(function(t) {
        if (n && typeof n.trackerLine === 'function') n.trackerLine(T.endLine(t));
        log('end', { kind: t.kind, table: atTable(n) || t.vis === 'all' });
    });
}
function tick() {
    var T = TK(), n = net(), camp = campNow(); if (!T || !camp) return;
    if (gmHand(n, window)) {
        var now = Date.now(), ck = clockT(camp), list = ownList(camp), ended = false;
        list.forEach(function(t) { if (t.kind === 'timer' && t.run === true && T.settle(t, now, ck)) ended = true; });
        if (ended) commit(function(l) { return l.map(function(t) { return T.settle(t, now, ck) || t; }); }, 'settle', {});
        else if (n && n.active === true && n.role === 'host' && typeof n.syncTrackers === 'function') n.syncTrackers(now);   // what each player sees, looked at again: a game countdown moves with the clock, and an undo, a restore point or an import changes the list without the strip (net.js sends only a change)
    }
    seeNow();
    draw(false);
}

// The strip. Built again only when what it holds changes; a countdown's figures are set in place every second
// [sinkcheck:trkpill-start]
function clockSvg(parts, fill, hex) {
    var T = TK(), s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('class', 'trk-clock'); s.setAttribute('aria-hidden', 'true');
    var c = document.createElementNS(SVG, 'circle'); c.setAttribute('cx', '10'); c.setAttribute('cy', '10'); c.setAttribute('r', '8.5'); c.setAttribute('fill', 'none'); c.setAttribute('stroke', hex); c.setAttribute('stroke-width', '1.3'); s.appendChild(c);
    T.clockParts(parts, fill, 10, 8.5).forEach(function(p) { var e = document.createElementNS(SVG, 'path'); e.setAttribute('d', p.d); e.setAttribute('fill', p.on ? hex : 'none'); e.setAttribute('class', 'trk-part'); s.appendChild(e); });
    return s;
}
function pill(t, gm, camp, now) {
    var T = TK(), hex = T.COLORS[t.color] || T.COLORS.gold, done = T.doneOf(t, now, clockT(camp));
    var p = el('div', 'trk-pill' + (done ? ' trk-done' : '')); p.dataset.trk = t.id;
    var dot = el('span', 'trk-dot'); dot.style.background = hex; p.appendChild(dot);
    if (gm && t.vis !== 'all') { var g = el('span', 'trk-gm', 'GM'); g.dataset.tip = 'Only you see this tracker. Its menu shows it to the table.'; p.appendChild(g); }
    if (gm) { var nb = btn('trk-name', t.name, 'Open this tracker’s menu'); nb.dataset.trkmenu = t.id; nb.setAttribute('aria-haspopup', 'true'); p.appendChild(nb); }
    else p.appendChild(el('span', 'trk-name', t.name));
    if (t.kind === 'clock') p.appendChild(clockSvg(t.parts, t.fill, hex));
    var v = el('b', 'trk-val', T.face(t, now, clockT(camp), dayLen(camp))); p.appendChild(v);
    if (gm && t.kind !== 'timer') {
        var mi = btn('trk-btn', '−', t.kind === 'clock' ? 'Empty one part' : 'One less'); mi.dataset.trkstep = t.id; mi.dataset.by = '-1'; p.appendChild(mi);
        var pl = btn('trk-btn', '+', t.kind === 'clock' ? 'Fill one part' : 'One more'); pl.dataset.trkstep = t.id; pl.dataset.by = '1'; p.appendChild(pl);
    }
    if (gm && t.kind === 'timer') { var run = t.run === true, sb = btn('trk-btn', run ? '❚❚' : '▶', run ? 'Pause the countdown' : (t.left > 0 && t.left < t.total ? 'Go on with the countdown' : 'Start the countdown')); sb.dataset.trkrun = t.id; p.appendChild(sb); }
    return p;
}
// [sinkcheck:trkpill-end]
// The selector of a control of the strip, to find it again once the strip is drawn anew
function focusKey(b) {
    if (b.id) return '#' + b.id;
    var d = b.dataset || {}, q = function(k, v) { return '[data-' + k + '="' + String(v).replace(/[^A-Za-z0-9_-]/g, '') + '"]'; };
    if (d.trkstep) return q('trkstep', d.trkstep) + q('by', d.by);
    if (d.trkrun) return q('trkrun', d.trkrun);
    if (d.trkmenu) return q('trkmenu', d.trkmenu);
    return '';
}
function draw(force) {
    var box = strip(), T = TK(); if (!box || !T) return;
    var n = net(), camp = campNow(), gm = gmHand(n, window), play = onPlay() && !!camp, list = play ? shownList() : [], now = Date.now();
    var show = play && (list.length > 0 || gm);
    if (!show) { if (box.style.display !== 'none') box.style.display = 'none'; _sig = ''; return; }
    var tv = !!(n && n.stream), folded = !tv && foldOn(), sig = JSON.stringify([gm, folded, list.map(function(t) { var c = Object.assign({}, t); if (c.kind === 'timer') { c.left = c.run === true ? -1 : c.left; delete c.end; } return c; }), T.LIMITS.list]);
    if (box.style.display === 'none') box.style.display = '';
    if (force || sig !== _sig) {
        var had = document.activeElement && box.contains(document.activeElement) ? focusKey(document.activeElement) : '';   // a press from the keyboard keeps its place when the strip is drawn again
        _sig = sig; box.textContent = '';
        if (!tv) { var f = btn('trk-fold', folded ? (list.length ? 'Trackers · ' + list.length : 'Trackers') : '◂', folded ? 'Show the trackers' : 'Put the trackers away on this screen'); f.id = 'trkFold'; f.setAttribute('aria-expanded', folded ? 'false' : 'true'); box.appendChild(f); }   // the stream window, the party's screen, has no fold: it shares this computer's storage with the GM's window
        if (!folded) {
            list.forEach(function(t) { box.appendChild(pill(t, gm, camp, now)); });
            if (gm) { var a = btn('trk-pill trk-add', '+ Tracker', 'Add a counter, a countdown or a clock to this map or every map'); a.id = 'trkAdd'; if (ownList(camp).length >= T.LIMITS.list) a.disabled = true; box.appendChild(a); }
        }
        if (had) { var back = box.querySelector(had); if (back) back.focus(); }
        return;
    }
    if (folded) return;
    list.forEach(function(t) {
        if (t.kind !== 'timer') return;
        var p = box.querySelector('[data-trk="' + t.id + '"]'); if (!p) return;
        var v = p.querySelector('.trk-val'), txt = T.face(t, now, clockT(camp), dayLen(camp)); if (v && v.textContent !== txt) v.textContent = txt;
        p.classList.toggle('trk-done', T.doneOf(t, now, clockT(camp)));
    });
}

// The tracker's menu, beside its name
function closeMenu() { var m = menuEl(); if (m) m.style.display = 'none'; _menu = ''; }
function openMenu(id, anchor) {
    var m = menuEl(), t = ownList(campNow()).filter(function(x) { return x.id === id; })[0]; if (!m || !t) return;
    m.textContent = ''; _menu = id;
    var row = function(words, act, tip) { var b = btn('trk-mi', words, tip); b.dataset.trkact = act; b.setAttribute('role', 'menuitem'); m.appendChild(b); return b; };
    m.appendChild(el('div', 'trk-mlabel', t.name));
    if (t.kind === 'timer') row(t.run === true ? 'Pause' : 'Start', 'run', t.run === true ? 'Stop the countdown where it is' : 'Run the countdown');
    row(t.kind === 'timer' ? 'Reset to ' + TK().fmtLeft(t, t.total, dayLen(campNow())) : t.kind === 'clock' ? 'Empty the clock' : 'Reset to ' + (typeof t.start === 'number' ? t.start : TK().cleanTracker(Object.assign({}, t, { v: 0 }), {}).v), 'reset', 'Put it back as it started');
    m.appendChild(el('div', 'trk-msep'));
    row(t.vis === 'all' ? 'Only me' : 'Show it to the table', 'vis', t.vis === 'all' ? 'Keep it to yourself: players stop seeing it' : 'Every player who can see it gets it now');
    var w = row(t.map ? 'On every map' : 'On this map only', 'where', t.map ? 'Show it on every map' : 'Show it on this map alone'); if (!t.map && !mapNow()) w.disabled = true;
    m.appendChild(el('div', 'trk-msep'));
    row('Edit…', 'edit', 'Change its name, kind, colour, time or parts');
    row('Remove', 'remove', 'Remove it for everyone. You are asked first');
    m.style.display = 'block';
    var r = anchor.getBoundingClientRect(), mw = m.offsetWidth || 200, mh = m.offsetHeight || 220;
    m.style.left = Math.max(4, Math.min(r.left, window.innerWidth - mw - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(r.bottom + 4, window.innerHeight - mh - 4)) + 'px';
    var first = m.querySelector('button'); if (first) first.focus();
}

// The form, a floating box beside the strip
var UNITS = [['s', 'Seconds', 1], ['m', 'Minutes', 60], ['h', 'Hours', 3600], ['d', 'Days', 0]];
function unitSecs(u, camp) { var x = UNITS.filter(function(k) { return k[0] === u; })[0]; return x ? (x[2] || dayLen(camp)) : 60; }
function draftOf(t, camp) {
    var d = { id: t.id, kind: t.kind, name: t.name, color: t.color, here: !!t.map, table: t.vis === 'all', v: t.v, min: t.min, max: t.max, start: t.start, parts: t.parts || 4, fill: t.fill || 0, base: t.base === 'game' ? 'game' : 'real', unit: 'm', amount: 10 };
    if (t.kind === 'timer') {
        var secs = t.base === 'game' ? t.total : t.total / 1000, D = dayLen(camp);
        d.unit = secs % D === 0 && t.base === 'game' ? 'd' : secs % 3600 === 0 ? 'h' : secs % 60 === 0 ? 'm' : 's';
        d.amount = secs / unitSecs(d.unit, camp); d.left = t.left; d.run = t.run === true; d.end = t.end; d.total = t.total;
    }
    return d;
}
function openForm(id) {
    var p = panel(), T = TK(), camp = campNow(); if (!p || !T || !camp || !gmHand(net(), window)) return;
    var t = id ? ownList(camp).filter(function(x) { return x.id === id; })[0] : null;
    if (!t) { if (ownList(camp).length >= T.LIMITS.list) { toast('A campaign holds at most ' + T.LIMITS.list + ' trackers.'); return; } t = T.fresh('count', 'tk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mapNow()); }
    _form = { isNew: !id, d: draftOf(t, camp) };
    p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p);
    var s = strip(), r = s ? s.getBoundingClientRect() : null;
    if (r && !p.dataset.moved) { p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 330)) + 'px'; p.style.top = Math.max(8, r.bottom + 8) + 'px'; }
    drawForm();
    var nm = document.getElementById('trkName'); if (nm) { nm.focus(); nm.select(); }
    log('form', { fresh: _form.isNew });
}
function closeForm() { var p = panel(); if (p) p.style.display = 'none'; _form = null; }
function chips(name, opts, cur) {
    var w = el('div', 'trk-chips'); w.setAttribute('role', 'group');
    opts.forEach(function(o) { var b = btn('trk-chip' + (o[0] === cur ? ' on' : ''), o[1], o[2]); b.dataset.trkset = name; b.dataset.val = o[0]; b.setAttribute('aria-pressed', o[0] === cur ? 'true' : 'false'); w.appendChild(b); });
    return w;
}
// A labelled field. A group of buttons sits in no label: a press on the words would press its first button
function field(label, input, note) { var w = el(input.tagName === 'INPUT' || input.tagName === 'SELECT' ? 'label' : 'div', 'trk-cap'); w.appendChild(el('span', '', label)); w.appendChild(input); if (note) w.appendChild(el('small', 'trk-note', note)); return w; }
function numIn(id, v, lo, hi, ph) { var i = el('input', 'field trk-num'); i.type = 'number'; i.id = id; if (typeof lo === 'number') i.min = String(lo); if (typeof hi === 'number') i.max = String(hi); i.step = '1'; i.value = typeof v === 'number' && isFinite(v) ? String(v) : typeof v === 'string' ? v.slice(0, 12) : ''; if (ph) i.placeholder = ph; return i; }
function drawForm() {
    var body = document.getElementById('trkBody'), T = TK(), camp = campNow(); if (!body || !_form || !T) return;
    var d = _form.d; body.textContent = '';
    var title = document.getElementById('trkTitle'); if (title) title.textContent = _form.isNew ? 'New tracker' : 'Tracker';
    var nm = el('input', 'field'); nm.id = 'trkName'; nm.maxLength = T.LIMITS.name; nm.value = d.name || ''; nm.setAttribute('autocomplete', 'off'); body.appendChild(field('Name', nm));
    body.appendChild(field('Kind', chips('kind', [['count', 'Counter', 'A number with − and +'], ['timer', 'Countdown', 'Time left, with start and pause'], ['clock', 'Clock', 'A circle you fill one part at a time']], d.kind)));
    if (d.kind === 'count') {
        var row = el('div', 'trk-row');
        row.appendChild(field('Value', numIn('trkV', d.v, -T.LIMITS.count, T.LIMITS.count)));
        row.appendChild(field('Lowest', numIn('trkMin', d.min, -T.LIMITS.count, T.LIMITS.count, 'None')));
        row.appendChild(field('Highest', numIn('trkMax', d.max, -T.LIMITS.count, T.LIMITS.count, 'None')));
        row.appendChild(field('Reset to', numIn('trkStart', d.start, -T.LIMITS.count, T.LIMITS.count, '0')));
        body.appendChild(row);
    } else if (d.kind === 'clock') {
        var rowC = el('div', 'trk-row');
        rowC.appendChild(field('Parts', numIn('trkParts', d.parts, T.LIMITS.parts[0], T.LIMITS.parts[1])));
        rowC.appendChild(field('Filled', numIn('trkFill', d.fill, 0, T.LIMITS.parts[1])));
        body.appendChild(rowC);
    } else {
        var rowT = el('div', 'trk-row'), u = el('select', 'field trk-unit'); u.id = 'trkUnit';
        UNITS.forEach(function(k) { if (k[0] === 'd' && d.base !== 'game') return; var o = el('option', '', k[1]); o.value = k[0]; u.appendChild(o); });
        u.value = d.unit === 'd' && d.base !== 'game' ? 'h' : d.unit;
        rowT.appendChild(field('Time', numIn('trkAmount', d.amount, 1, 100000))); rowT.appendChild(field('Unit', u)); body.appendChild(rowT);
        body.appendChild(field('Runs on', chips('base', [['real', 'Real time', 'Counts the seconds as they pass at the table'], ['game', 'The game clock', 'Counts the campaign’s own time, as the Calendar moves it']], d.base),
            d.base === 'game' ? 'It counts down as the game clock moves: by your steps, a fight’s rounds, or the clock running by itself.' : 'It counts the seconds as they pass at the table, up to 24 hours.'));
        if (!_form.isNew) { var keep = el('label', 'trk-keep'), kc = el('input'); kc.type = 'checkbox'; kc.id = 'trkSame'; kc.checked = d.sameTime !== false; keep.appendChild(kc); keep.appendChild(document.createTextNode(' Keep the time it has left')); body.appendChild(keep); }
    }
    var sw = el('div', 'trk-chips trk-swatches'); sw.setAttribute('role', 'group');
    T.COLOR_KEYS.forEach(function(k) { var b = btn('trk-swatch' + (k === d.color ? ' on' : ''), '', k.charAt(0).toUpperCase() + k.slice(1)); b.dataset.trkset = 'color'; b.dataset.val = k; b.style.background = T.COLORS[k]; b.setAttribute('aria-label', k); b.setAttribute('aria-pressed', k === d.color ? 'true' : 'false'); sw.appendChild(b); });
    body.appendChild(field('Colour', sw));
    var mapOk = !!mapNow();
    body.appendChild(field('Where', chips('here', [['1', 'This map', 'Shown on the map on screen alone'], ['0', 'Every map', 'Shown on every map of the campaign']], d.here && mapOk ? '1' : '0')));
    if (!mapOk) { var hb = body.querySelector('[data-trkset="here"][data-val="1"]'); if (hb) hb.disabled = true; }
    body.appendChild(field('Who sees it', chips('table', [['0', 'Only me', 'Kept on your computer. No player gets it'], ['1', 'The table', 'Every player who can see it gets it']], d.table ? '1' : '0')));
    var bs = el('div', 'trk-btns'), cancel = btn('tool ghost', 'Cancel'), ok = btn('tool', 'Save'); cancel.id = 'trkCancel'; ok.id = 'trkSave'; bs.appendChild(cancel); bs.appendChild(ok); body.appendChild(bs);
}
function readForm() {
    if (!_form) return; var d = _form.d, g = function(id) { var e = document.getElementById(id); return e ? e.value : undefined; };
    var nm = g('trkName'); if (nm !== undefined) d.name = nm;
    if (d.kind === 'count') { d.v = g('trkV'); d.min = g('trkMin'); d.max = g('trkMax'); d.start = g('trkStart'); }
    else if (d.kind === 'clock') { d.parts = g('trkParts'); d.fill = g('trkFill'); }
    else { d.amount = g('trkAmount'); d.unit = g('trkUnit') || d.unit; var k = document.getElementById('trkSame'); d.sameTime = !!k && k.checked; }
}
function saveForm() {
    readForm(); if (!_form) return;
    var camp = campNow(), d = _form.d, T = TK();
    if (d.kind === 'timer' && d.sameTime === true) { var probe = fromForm(Object.assign({}, d, { sameTime: false }), mapNow(), unitSecs(d.unit, camp)); if (!probe || probe.total !== d.total || (d.base === 'game') !== (probe.base === 'game')) d.sameTime = false; }   // a new time or a new clock starts afresh
    var t = fromForm(d, mapNow(), unitSecs(d.unit, camp));
    if (!t) { toast('That tracker could not be saved. Give it a time of at least one second.'); log('fail', { where: 'form' }); return; }
    var isNew = _form.isNew;
    var ok = commit(function(list) { if (isNew) { if (list.length >= T.LIMITS.list) return null; return list.concat([t]); } return list.map(function(x) { return x.id === t.id ? t : x; }); }, isNew ? 'add' : 'edit', { kind: t.kind, table: t.vis === 'all', every: !t.map });
    if (!ok && isNew) toast('A campaign holds at most ' + T.LIMITS.list + ' trackers.');
    closeForm();
}

// The chat line (net.js renderChat hands a tracker's record here)
function renderLine(m) {
    var box = el('div', 'chat-trk'), T = TK();
    var s = document.createElementNS(SVG, 'svg'); s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var pth = document.createElementNS(SVG, 'path'); pth.setAttribute('d', 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 3.5V12l6 6'); s.appendChild(pth); box.appendChild(s);
    var g = el('div', 'chat-trk-txt'); g.appendChild(el('div', '', String(m && m.text || '').slice(0, 200))); g.appendChild(el('small', '', 'Tracker')); box.appendChild(g);
    return box;
}
// What a host sent this player's app (net.js trkmsg, already cleaned), or [] for none (a new snapshot)
function receive(list, at) {
    var T = TK(); if (!T) return;
    _rx = { list: localCopy(T.cleanTrackers(list, { wire: true }), typeof at === 'number' && at > 0 ? at : Date.now()), at: at };
    if (!list || !list.length) { _seen = Object.create(null); _seenKey = ''; }
    seeNow(); draw(true);
    log('received', { n: _rx.list.length });
}

(function wire() {
    if (typeof document === 'undefined') return;
    var box = strip(); if (!box) return;
    box.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !box.contains(b)) return;
        if (b.id === 'trkFold') { foldSet(!foldOn()); closeMenu(); draw(true); log('fold', { on: foldOn() }); return; }
        if (b.id === 'trkAdd') { closeMenu(); openForm(''); return; }
        if (b.dataset.trkstep) { stepBy(b.dataset.trkstep, Number(b.dataset.by) || 0); return; }
        if (b.dataset.trkrun) { startStop(b.dataset.trkrun); return; }
        if (b.dataset.trkmenu) { if (_menu === b.dataset.trkmenu) closeMenu(); else openMenu(b.dataset.trkmenu, b); }
    });
    var m = menuEl();
    if (m) m.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !b.dataset.trkact) return;
        var id = _menu, act = b.dataset.trkact; closeMenu();
        if (act === 'run') startStop(id); else if (act === 'reset') resetOne(id); else if (act === 'vis' || act === 'where') flip(id, act); else if (act === 'edit') openForm(id); else if (act === 'remove') removeOne(id);
    });
    document.addEventListener('pointerdown', function(e) { if (!_menu) return; var mm = menuEl(); if (mm && mm.contains(e.target)) return; if (e.target && e.target.closest && e.target.closest('[data-trkmenu]')) return; closeMenu(); }, true);
    window.addEventListener('resize', closeMenu);
    var p = panel();
    if (p) {
        var cl = document.getElementById('trkCloseBtn'); if (cl) cl.addEventListener('click', closeForm);
        p.addEventListener('click', function(e) {
            var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !_form) return;
            if (b.id === 'trkCancel') { closeForm(); return; }
            if (b.id === 'trkSave') { saveForm(); return; }
            if (b.dataset.trkset) {
                readForm(); var k = b.dataset.trkset, v = b.dataset.val, d = _form.d;
                if (k === 'kind') { d.kind = v; if (v === 'timer') d.sameTime = false; }
                else if (k === 'base') { d.base = v; d.sameTime = false; }
                else if (k === 'color') d.color = v;
                else if (k === 'here') d.here = v === '1';
                else if (k === 'table') d.table = v === '1';
                drawForm();
                var again = p.querySelector('[data-trkset="' + k + '"][data-val="' + v + '"]'); if (again) again.focus();
            }
        });
        p.addEventListener('keydown', function(e) { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); saveForm(); } });
        var head = document.getElementById('trkHead'), drag = null;
        if (head) {
            head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
            head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.dataset.moved = '1'; });
            head.addEventListener('pointerup', function() { drag = null; });
        }
    }
    setInterval(tick, 1000);
    setTimeout(function() { draw(true); }, 0);
})();
window.wpTrackers = { draw: draw, receive: receive, renderLine: renderLine, open: openForm, close: closeForm, closeMenu: closeMenu, list: shownList };
export { atTable, gmHand, mapsOf, localCopy, newlyDone, fromForm };
