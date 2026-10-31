/* Game record, the page's half (1.6.0). The owner, 2026-10-31: the GM may open a window that shows everything that happens in the game, what is
   rolled in the background and what is done by them or the players, who it was for and when, by the game's clock and by the GM's own.
   "this should be accessible, but not in their face": nothing here shows during play. A session runs from Host to End Session, or to the
   moment Waypoint closed, which is the time of its last line: one goes down each minute and as the window closes. Everything runs on the
   machine that hosts: no line is sent to anyone. Lines are words as the GM may read them, drawn as text nodes. */
import { CHIPS, ICON, cleanLine, parseFile, filter, shown, sessionWords, plays, fieldLines, asText, oldSessions } from './reccore.js';
import { stepLine } from './steplog.js';
import { getActiveCampaign } from './models.js';

var FLUSH_MS = 2500, BEAT_MS = 60000, SHOW = 1500, KEEP = 40000;
var R = { sess: null, camp: '', q: [], lines: [], t: 0, beat: 0, chars: Object.create(null), board: Object.create(null), sending: false };
var W = { open: false, list: [], at: '', chip: 'all', q: '', lines: [], more: 0, soon: 0 };

function logStep(step, facts) { try { var p = fetch('/api/log', { method: 'POST', body: stepLine('record v1', step, facts) }); if (p && p.catch) p.catch(function() {}); } catch (e) {} }
function urlOf(camp, session) { return '/api/record?camp=' + encodeURIComponent(camp) + (session ? '&session=' + encodeURIComponent(session) : ''); }
function gameNow() { try { return window.wpCalendar && window.wpCalendar.words ? String(window.wpCalendar.words() || '') : ''; } catch (e) { return ''; } }
function newId() { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return 's_' + String(Date.now()).padStart(13, '0') + '_' + s; }
function push(o) {
    var l = cleanLine(o); if (!l || !R.sess) return null;
    R.q.push(JSON.stringify(l)); R.lines.push(l); if (R.lines.length > KEEP) R.lines.splice(0, R.lines.length - KEEP);
    if (W.open && W.at === R.sess) redrawSoon();
    return l;
}
function flush(leaving) {
    if (!R.sess || !R.q.length || (R.sending && !leaving)) return;
    var body = R.q.join('\n') + '\n', n = R.q.length, url = urlOf(R.camp, R.sess);
    R.q = []; R.sending = true;
    var put = function() { R.sending = false; };
    try {
        fetch(url, { method: 'POST', body: body, keepalive: !!leaving && body.length < 60000 }).then(function(r) {
            if (r && r.ok) { put(); return; }
            throw new Error('status ' + (r && r.status));
        }).catch(function(e) { put(); R.q = body.trim().split('\n').concat(R.q); logStep('write failed', { lines: n, why: String(e && e.message || e).slice(0, 60) }); });
    } catch (e) { put(); R.q = body.trim().split('\n').concat(R.q); }
}
function tick() { push({ t: Date.now(), k: 'beat' }); flush(false); }
// the session opens with the table. A reload of the page is the same session: the table comes back under the same room code
function start(camp, room, resumed) {
    if (!camp || !camp.id) return;
    var keep = ''; try { keep = resumed ? sessionStorage.getItem('wp_recSess') || '' : ''; } catch (e) {}
    var had = !!(keep && /^s_[0-9]{13}_[a-z0-9]{6}$/.test(keep));
    R.sess = had ? keep : newId(); R.camp = camp.id; R.q = []; R.lines = []; R.chars = Object.create(null); R.board = Object.create(null);
    try { sessionStorage.setItem('wp_recSess', R.sess); } catch (e) {}
    if (had) push({ t: Date.now(), k: 'table', g: gameNow(), x: 'Waypoint reloaded', d: 'The table came back with room ' + room });
    else push({ t: Date.now(), k: 'open', g: gameNow(), room: room });
    Object.keys(camp.chars || {}).forEach(function(id) { R.chars[id] = snap(camp.chars[id]); });
    Object.keys(camp.items || {}).forEach(function(id) { var m = camp.items[id]; if (m && m.type === 'map' && Array.isArray(m.whiteboard)) R.board[id] = pieces(m); });
    clearInterval(R.t); clearInterval(R.beat); R.t = setInterval(tick, FLUSH_MS * 4); R.beat = 0;
    flush(false); logStep('session open', { resumed: had });
}
function end() {
    if (!R.sess) return;
    push({ t: Date.now(), k: 'end', g: gameNow(), how: 'end' }); flush(true);
    clearInterval(R.t); R.t = 0; R.sess = null; R.chars = Object.create(null); R.board = Object.create(null);
    try { sessionStorage.removeItem('wp_recSess'); } catch (e) {}
    logStep('session end', {});
}
function add(k, w, x, d, h) { if (!R.sess) return; push({ t: Date.now(), k: k, g: gameNow(), w: w, x: x, d: d, h: h ? 1 : 0 }); if (R.q.length > 40) flush(false); }

function snap(c) { try { return JSON.stringify(c && c.values || {}); } catch (e) { return '{}'; } }
// a character's sheet as it changed: every field that differs from what the record last saw of it, by the field's own label
function sheet(camp, id) {
    if (!R.sess || !camp || !camp.chars) return;
    var c = Object.prototype.hasOwnProperty.call(camp.chars, id) ? camp.chars[id] : null; if (!c) return;
    var now = snap(c), wasS = R.chars[id]; R.chars[id] = now;
    if (wasS === undefined || wasS === now) return;
    var was, cur; try { was = JSON.parse(wasS); cur = JSON.parse(now); } catch (e) { return; }
    var fields = camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : [], who = String(c.name || 'A character');
    var S = window.wpSystemCore, nameOf = function(r) { if (S && S.rowDef && camp.system) { try { var d = S.rowDef(camp.system, r); if (d && d.def && d.def.name) return d.def.name; } catch (e) {} } return ''; };
    Object.keys(cur).concat(Object.keys(was)).forEach(function(k, i, all) {
        if (all.indexOf(k) !== i) return;
        var f = fields.find(function(x) { return x && x.id === k; }), hid = !c.ownerId || !!(f && f.vis === 'gm');
        fieldLines(f ? f.label || f.key : k, was[k], cur[k], nameOf).forEach(function(l) { add('sheet', who, l.x, l.d, hid); });
    });
}
function pieceName(w) { return String(w && (w.charName || w.name) || (w && w.isChar ? 'A token' : 'A piece')); }
function mapName(m) { return String(m && m.meta && m.meta.title || 'a map'); }
function pieceOf(w) { return { x: w.x, y: w.y, hidden: !!w.hidden, locked: !!w.locked, open: !!w.doorOpen, name: pieceName(w), tok: !!w.isChar, door: w.sightType === 'door' }; }
function cellsWords(map, w, from) {
    var n = 0; try { n = window.wpFog && window.wpFog.moveCells ? window.wpFog.moveCells(map, w, from.x, from.y, w.x, w.y, '', {}) : 0; } catch (e) {}
    var c = Math.round(n * 10) / 10; return c > 0 ? c + (c === 1 ? ' cell on ' : ' cells on ') + mapName(map) : 'On ' + mapName(map);
}
// the map as the GM's own hand left it: what came, what went, what was hidden, shown, opened, shut or moved. A player's own move is said by moved()
function pieces(map) { var now = Object.create(null); map.whiteboard.forEach(function(w) { if (w && typeof w.id === 'string' && !w.gmNoteFor) now[w.id] = pieceOf(w); }); return now; }
function board(camp, map) {
    if (!R.sess || !map || !Array.isArray(map.whiteboard)) return;
    var was = R.board[map.id], now = pieces(map);
    R.board[map.id] = now;
    if (!was) return;
    var title = mapName(map);
    map.whiteboard.forEach(function(w) {
        if (!w || typeof w.id !== 'string' || w.gmNoteFor) return;
        var a = was[w.id], b = now[w.id]; if (!b) return;
        if (!a) { add('gm', 'You', 'Added ' + b.name, 'On ' + title, b.hidden); return; }
        if (a.hidden !== b.hidden) add('gm', 'You', (b.hidden ? 'Hid ' : 'Showed ') + b.name, 'On ' + title, 1);
        if (a.open !== b.open) add('gm', 'You', (b.open ? 'Opened ' : 'Closed ') + (b.door ? 'a door' : b.name), 'On ' + title);
        if (a.locked !== b.locked) add('gm', 'You', (b.locked ? 'Locked ' : 'Unlocked ') + b.name, 'On ' + title, 1);
        if (b.tok && (a.x !== b.x || a.y !== b.y)) add('move', b.name, 'Moved by you', cellsWords(map, w, a), b.hidden);
    });
    Object.keys(was).forEach(function(id) { if (!now[id]) add('gm', 'You', 'Removed ' + was[id].name, 'On ' + title, 1); });
}
function moved(map, w, from, who) {
    if (!R.sess || !map || !w) return;
    add('move', pieceName(w), 'Moved' + (who ? ' by ' + who : ''), cellsWords(map, w, from));
    var b = R.board[map.id]; if (b) b[w.id] = pieceOf(w);
}

/* ---------- the window ---------- */
function ui(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
var FMT = {
    day: function(t) { return new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); },
    time: function(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); },
};
function liveId() { return R.sess || ''; }
function redrawSoon() { if (W.soon) return; W.soon = setTimeout(function() { W.soon = 0; drawLines(); }, 600); }
function loadSession(id, then) {
    var g = W.list.find(function(s) { return s.id === id; });
    if (id === liveId()) { W.lines = R.lines; then(); return; }
    if (g && g.old) { W.lines = g.old.lines; then(); return; }
    fetch(urlOf(activeCampId(), id)).then(function(r) { return r.ok ? r.text() : ''; }).then(function(t) { W.lines = parseFile(t); then(); }).catch(function() { W.lines = []; then(); });
}
function activeCampId() { var c = getActiveCampaign(); return c && c.id || ''; }
function drawSessions() {
    var box = ui('recSessions'); if (!box) return;
    box.textContent = ''; box.appendChild(el('div', 'rec-lbl', 'Sessions'));
    if (!W.list.length) { box.appendChild(el('div', 'rec-none', 'No sessions yet. One begins when you host the campaign.')); return; }
    W.list.forEach(function(s) {
        var b = el('button', 'rec-ses' + (s.id === W.at ? ' on' : '')); b.type = 'button';
        b.appendChild(el('b', '', s.words.day)); b.appendChild(el('span', '', s.words.span)); b.appendChild(el('small', '', s.words.note));
        b.addEventListener('click', function() { pick(s.id); });
        box.appendChild(b);
    });
}
function drawChips() {
    var box = ui('recChips'); if (!box) return; box.textContent = '';
    CHIPS.forEach(function(c) {
        var b = el('button', 'rec-chip' + (W.chip === c[0] ? ' on' : ''), c[1]); b.type = 'button'; b.setAttribute('aria-pressed', W.chip === c[0] ? 'true' : 'false');
        b.addEventListener('click', function() { W.chip = c[0]; W.more = 0; drawChips(); drawLines(); });
        box.appendChild(b);
    });
}
function rowOf(l) {
    var r = el('div', 'rec-row' + (l.h ? ' hid' : ''));
    if (l.h) r.title = 'Your players never saw this';
    r.appendChild(el('span', 'rec-t', FMT.time(l.t)));
    r.appendChild(el('span', 'rec-g', l.g || ''));
    r.appendChild(el('i', 'wib wi-' + (ICON[l.k] || 'map')));
    r.appendChild(el('span', 'rec-w', l.w || ''));
    var x = el('span', 'rec-x'); x.appendChild(el('b', '', l.x || '')); if (l.d) x.appendChild(el('small', '', l.d));
    r.appendChild(x);
    return r;
}
function drawLines() {
    var box = ui('sessionLogList'); if (!box) return;
    var all = filter(W.lines, W.chip, W.q), cut = Math.max(0, all.length - SHOW - W.more), keep = all.slice(cut), stay = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.textContent = '';
    if (!W.at) { box.appendChild(el('div', 'rec-none', 'Host the campaign and everything that happens at the table is written here.')); return; }
    if (cut) { var more = el('button', 'tool ghost rec-more', 'Show earlier lines (' + cut + ' more)'); more.type = 'button'; more.addEventListener('click', function() { W.more += SHOW; drawLines(); }); box.appendChild(more); }
    if (!keep.length) box.appendChild(el('div', 'rec-none', W.q || W.chip !== 'all' ? 'Nothing here matches.' : 'Nothing has happened yet.'));
    keep.forEach(function(l) { box.appendChild(rowOf(l)); });
    if (stay) box.scrollTop = box.scrollHeight;
}
function pick(id) { W.at = id; W.more = 0; drawSessions(); loadSession(id, function() { drawLines(); var box = ui('sessionLogList'); if (box) box.scrollTop = box.scrollHeight; }); }
function open() {
    var m = ui('sessionLogModal'); if (!m) return;
    var c = getActiveCampaign(); if (!c) return;
    W.open = true; m.style.display = 'flex'; drawChips();
    fetch(urlOf(c.id)).then(function(r) { return r.ok ? r.json() : { sessions: [] }; }).catch(function() { return { sessions: [] }; }).then(function(d) {
        var files = d && Array.isArray(d.sessions) ? d.sessions : [], first = files.reduce(function(n, s) { var t = s.head && s.head.t; return typeof t === 'number' && (!n || t < n) ? t : n; }, 0);
        var now = Date.now(), list = files.map(function(s) { return { id: s.id, file: s, words: sessionWords(s, FMT, s.id === liveId(), now) }; });
        if (liveId() && !list.some(function(s) { return s.id === liveId(); })) list.unshift({ id: liveId(), words: sessionWords({ head: R.lines[0] || { t: now }, last: now }, FMT, true, now) });
        oldSessions(c.sessionLog, first).forEach(function(g, i) { list.push({ id: 'old' + i, old: g, words: sessionWords({ head: { t: g.start }, last: g.last, end: g.ended ? { t: g.ended } : null }, FMT, false, now) }); });
        W.list = list; W.at = liveId() || (list[0] ? list[0].id : ''); drawSessions();
        if (W.at) pick(W.at); else { W.lines = []; drawLines(); }
    });
}
function close() { var m = ui('sessionLogModal'); if (m) m.style.display = 'none'; W.open = false; }
function saveText() {
    var s = W.list.find(function(x) { return x.id === W.at; }); if (!s || !W.lines.length) return;
    var c = getActiveCampaign(), name = c && c.name || 'Campaign';
    var blob = new Blob([asText(name + ' — game record', s.words.day + ', ' + s.words.span, W.lines, FMT)], { type: 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = String(name).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-game-record.txt';
    document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function delSession() {
    var s = W.list.find(function(x) { return x.id === W.at; }); if (!s || !s.file || s.id === liveId()) return;
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Delete the record of ' + s.words.day + '? This cannot be undone.', function(yes) {
            if (!yes) return;
            fetch(urlOf(activeCampId(), s.id), { method: 'DELETE' }).catch(function() {}).then(function() { logStep('session deleted', {}); open(); });
        });
    });
}
(function wire() {
    if (typeof document === 'undefined') return;
    var on = function(id, ev, fn) { var e = ui(id); if (e) e.addEventListener(ev, fn); };
    on('netLogBtn', 'click', open); on('sessionLogClose', 'click', close); on('sessionLogSave', 'click', saveText); on('sessionLogClear', 'click', delSession);
    on('recSearch', 'input', function(e) { W.q = e.target.value; W.more = 0; drawLines(); });
    if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', function() { if (R.sess) { push({ t: Date.now(), k: 'beat' }); flush(true); } });
})();
function touched(map, w) { var b = R.board[map.id]; if (b && w) b[w.id] = pieceOf(w); }
window.wpRecord = { start: start, end: end, add: add, sheet: sheet, board: board, moved: moved, touched: touched, open: open, close: close, plays: plays, live: function() { return !!R.sess; } };
