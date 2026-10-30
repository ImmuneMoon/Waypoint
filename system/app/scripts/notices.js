/* Notifications (1.5.5, backlog 160). The owner, 2026-10-18, by prompt: "I need a dedicated notifications area. they can come in on toasts but
   i need an area to see them all and a way to delete ones i dont need, or clear it all together. with a confirm"; and their picks: "A bell in
   the top row (Recommended)", "Every notice (Recommended)", "Until you clear them (Recommended)", the drawing "A. Plain bell (Recommended)",
   the list "As drawn (Recommended)", and for players "Yes, for the session (Recommended)".

   Every notice the app shows (io.js toast) is kept here as well, newest first, one list a campaign: the same notice again within a few
   seconds is one line with a count. What waits for you (an approval, time rules due) is said by its own module through wait(key, text, kind,
   arg) and stands on top, marked, with its button, for as long as the module's own test for that kind says it still waits (each module puts
   its kinds in window.wpNoticeKinds: { label, still(arg), run(arg) }), or until it says done(key). A kind may offer a second answer beside
   its button, alt(arg) under altLabel, as the time rules that wait in a fight with the Calendar off offer Apply and Skip (backlog 152, fold
   4b); tip and altTip are the two buttons' tooltips, and stay: true keeps the list up after its button, as the second answer always does,
   the focus going on to the row after it. A kind may offer several answers more, picks(arg), a list of { label, tip } each a button, and pick(arg,
   place) answers it (a stray round's ways, 1.6.0). A kind whose items wait nowhere else says only: true (the time rules that wait in the bell): its
   row has no x and Clear all leaves it, so its own answers alone take it off the list. The bell's number is what waits. The x
   takes a notice away; on what waits it takes it off the list only, since the thing itself still waits, in the Review or the Calendar, and it
   comes back if its module says it anew. Clear all asks first.

   The list is kept on this computer for a campaign of your own (wpCanPersistLocal), through a restart: the newest NOTE_MAX of a campaign and
   NOTE_CAMPS campaigns, under a key that is no setting (every wp_ key is mirrored into the settings file, which holds 2 MB for all of them).
   What is kept is read back as data. At someone else's table a player's list is kept for the session alone: in memory, and let go once
   another campaign is on screen. What waits is never stored, since each module says it again. Every word reaches the page as a text node,
   since a notice may name a player or a character from the table. The bell's menu is a menu of the top row (toprow.js MENUS): its keys,
   Escape and one menu at a time are the row's. */
import { getActiveCampaign } from './models.js';
import { showConfirm } from './dialogs.js';
// [lookcheck:notices-start]
var NOTE_MAX = 200, NOTE_CAMPS = 12, NOTE_CHARS = 240, NOTE_KEY = 'wpNotes', NOTE_JOIN_MS = 3000;
var _mem = Object.create(null), _kept = Object.create(null), _wait = Object.create(null), _gone = Object.create(null), _store = null, _seq = 0, _saveT = null;
// A notice's words: one line of plain text, control and direction characters taken out, at most NOTE_CHARS characters (never half of one)
function noteText(s) {
    var t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim(), a = Array.from(t);
    return a.length > NOTE_CHARS ? a.slice(0, NOTE_CHARS - 1).join('').replace(/\s+$/, '') + '\u2026' : t;
}
function campId() { var c = getActiveCampaign(); return c && typeof c.id === 'string' ? c.id : ''; }
function keeps() { var n = window.wpNet; return typeof window.wpCanPersistLocal === 'function' && window.wpCanPersistLocal() === true && !(n && n.foreign); }
// A stored notice read as data: { i, at, m, n? } or null
function noteOk(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    var i = Object.prototype.hasOwnProperty.call(x, 'i') ? x.i : null, at = Object.prototype.hasOwnProperty.call(x, 'at') ? x.at : null, m = Object.prototype.hasOwnProperty.call(x, 'm') ? noteText(x.m) : '', n = Object.prototype.hasOwnProperty.call(x, 'n') ? x.n : null;
    if (typeof i !== 'string' || !/^n[0-9a-z]{1,12}_[0-9a-z]{1,8}$/.test(i) || typeof at !== 'number' || !isFinite(at) || at < 0 || !m) return null;
    var o = { i: i, at: at, m: m }; if (typeof n === 'number' && Math.floor(n) === n && n > 1) o.n = Math.min(n, 9999);
    return o;
}
// What this computer keeps: { campaign id: { at, l: [notice] } }, read once and bounded as it is read
function store() {
    if (_store) return _store;
    var raw = null; try { raw = JSON.parse(localStorage.getItem(NOTE_KEY) || 'null'); } catch (e) { raw = null; }
    _store = Object.create(null);
    var c = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.v === 1 && raw.c && typeof raw.c === 'object' && !Array.isArray(raw.c) ? raw.c : {};
    Object.keys(c).slice(0, NOTE_CAMPS).forEach(function(k) {
        var e = c[k]; if (!k || k.length > 80 || !e || typeof e !== 'object' || !Array.isArray(e.l)) return;
        var l = []; e.l.slice(0, NOTE_MAX).forEach(function(x) { var o = noteOk(x); if (o) l.push(o); });
        _store[k] = { at: typeof e.at === 'number' && isFinite(e.at) ? e.at : 0, l: l };
    });
    return _store;
}
function saveNow() {
    _saveT = null; var st = store(), out = {};
    Object.keys(st).sort(function(a, b) { return st[b].at - st[a].at; }).slice(0, NOTE_CAMPS).forEach(function(k) { if (st[k].l.length) out[k] = { at: st[k].at, l: st[k].l }; });
    try { if (Object.keys(out).length) localStorage.setItem(NOTE_KEY, JSON.stringify({ v: 1, c: out })); else localStorage.removeItem(NOTE_KEY); } catch (e) {}
}
function saveSoon(cid) {
    if (!_kept[cid]) return;
    var st = store(); if (st[cid]) st[cid].at = Date.now();
    if (!_saveT) _saveT = setTimeout(saveNow, 400);
}
// The list of the campaign on screen. A list kept for the session alone goes once another campaign is on screen
function listOf(cid) {
    Object.keys(_mem).forEach(function(k) { if (k !== cid && !_kept[k]) delete _mem[k]; });
    if (_mem[cid]) return _mem[cid];
    if (cid && keeps()) { var st = store(); if (!st[cid]) st[cid] = { at: Date.now(), l: [] }; _kept[cid] = true; _mem[cid] = st[cid].l; }
    else _mem[cid] = [];
    return _mem[cid];
}
// A notice shown: kept. The same words again within NOTE_JOIN_MS are one line, counted. Answers the notice, or null
function add(msg, now) {
    if (window.wpStream || window.wpPopout) return null;
    var m = noteText(msg); if (!m) return null;
    now = typeof now === 'number' && isFinite(now) ? now : Date.now();
    var cid = campId(), l = listOf(cid), top = l[0];
    if (top && top.m === m && now - top.at < NOTE_JOIN_MS) { top.n = Math.min((top.n || 1) + 1, 9999); top.at = now; }
    else { l.unshift({ i: 'n' + Math.floor(now).toString(36).slice(-12) + '_' + (_seq++ % 2821109907456).toString(36), at: now, m: m }); if (l.length > NOTE_MAX) l.length = NOTE_MAX; }
    saveSoon(cid); sync(); return l[0];
}
function kindOf(k) { var ks = window.wpNoticeKinds; return ks && typeof k === 'string' && Object.prototype.hasOwnProperty.call(ks, k) && ks[k] && typeof ks[k] === 'object' ? ks[k] : null; }
// A kind whose items wait nowhere but here (only: true, with a button of its own to answer them): no x, and Clear all leaves them on the list
function onlyHere(kind) { var k = kindOf(kind); return !!k && k.only === true && typeof k.run === 'function'; }
// What waits for you, said by its module. soft: only where nothing is said under that key yet (a module that says it again at every redraw).
// Said otherwise, it stands again even where an x took it off the list
function wait(key, text, kind, arg, soft) {
    var t = noteText(text); if (typeof key !== 'string' || !key || !t) return false;
    var cid = campId(), w = _wait[cid] || (_wait[cid] = Object.create(null));
    if (soft === true && w[key]) return false;
    w[key] = { t: t, kind: typeof kind === 'string' ? kind : '', arg: arg, at: w[key] ? w[key].at : Date.now() };
    if (soft !== true && _gone[cid]) delete _gone[cid][key];
    sync(); return true;
}
function done(key) {
    var cid = campId(), had = !!(_wait[cid] && _wait[cid][key]);
    if (_wait[cid]) delete _wait[cid][key]; if (_gone[cid]) delete _gone[cid][key];
    if (had) sync(); return had;
}
// What waits now, oldest first: an item whose kind says it no longer waits is let go; one the x took off is not shown
function waiting() {
    var cid = campId(), w = _wait[cid]; if (!w) return [];
    var out = [];
    Object.keys(w).forEach(function(key) {
        var it = w[key], k = kindOf(it.kind), still = true;
        if (k && typeof k.still === 'function') { try { still = k.still(it.arg) !== false; } catch (e) { still = true; } }
        if (!still) { delete w[key]; if (_gone[cid]) delete _gone[cid][key]; return; }
        if (_gone[cid] && _gone[cid][key]) return;
        out.push({ key: key, t: it.t, kind: it.kind, arg: it.arg, at: it.at });
    });
    return out.sort(function(a, b) { return a.at - b.at; });
}
function remove(id) {
    var cid = campId(), l = listOf(cid), at = -1;
    l.forEach(function(n, k) { if (n.i === id) at = k; });
    if (at < 0) return false;
    l.splice(at, 1); saveSoon(cid); sync(); return true;
}
function dismiss(key) {
    var cid = campId(); if (!_wait[cid] || !_wait[cid][key] || onlyHere(_wait[cid][key].kind)) return false;
    (_gone[cid] || (_gone[cid] = Object.create(null)))[key] = true; sync(); return true;
}
// Clear all, after a question: every notice goes, and what waits leaves the list (it still waits where it waits), but for what waits only here
function clearAll(yes) {
    var cid = campId(), l = listOf(cid), w = _wait[cid];
    if (yes !== true) {
        var ws = waiting(), here = ws.some(function(x) { return onlyHere(x.kind); });
        if (!l.length && !ws.some(function(x) { return !onlyHere(x.kind); })) return false;
        showConfirm('Clear all notifications? Anything still waiting for you stays waiting, in the Review and in the Calendar.' + (here ? ' What waits only here stays on this list until you answer it.' : ''), function(ok) { if (ok === true) clearAll(true); });
        return false;
    }
    l.length = 0; saveSoon(cid);
    if (w) { var g = _gone[cid] || (_gone[cid] = Object.create(null)); Object.keys(w).forEach(function(key) { if (!onlyHere(w[key].kind)) g[key] = true; }); }
    sync(); return true;
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function whenWords(at, now) {   // the time today, else the day and the time
    var d = new Date(at), n = new Date(typeof now === 'number' ? now : Date.now()), hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate() ? hm : d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + hm;
}
function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.appendChild(document.createTextNode(String(text))); return e; }
function mkBtn(cls, text, title, keep) { var b = mk('button', cls, text); b.type = 'button'; if (title) b.title = title; if (keep) b.setAttribute('data-keep', ''); return b; }
// The list under the bell: what waits, then everything else, newest first. Elements and text nodes alone
function draw() {
    var box = document.getElementById('notesList'); if (!box) return false;
    while (box.firstChild) box.removeChild(box.firstChild);
    var ws = waiting(), l = listOf(campId()), now = Date.now();
    if (ws.length) {
        box.appendChild(mk('div', 'rm-label notes-sec', 'Waiting for you'));
        ws.forEach(function(w) {
            var row = mk('div', 'notes-item notes-wait'), txt = mk('span', 'notes-txt', w.t), k = kindOf(w.kind);
            txt.appendChild(mk('span', 'notes-when', whenWords(w.at, now))); row.appendChild(txt);
            var last = null;
            if (k && typeof k.run === 'function') { var go = mkBtn('tool notes-go', typeof k.label === 'string' && k.label ? k.label.slice(0, 20) : 'Open', typeof k.tip === 'string' && k.tip ? k.tip : 'Open what waits', k.stay === true); go.setAttribute('data-note-go', w.key); row.appendChild(go); last = go; }
            if (k && typeof k.run === 'function' && typeof k.alt === 'function') { var al = mkBtn('tool ghost notes-alt', typeof k.altLabel === 'string' && k.altLabel ? k.altLabel.slice(0, 20) : 'Skip', typeof k.altTip === 'string' && k.altTip ? k.altTip : 'Let it go', true); al.setAttribute('data-note-alt', w.key); row.appendChild(al); last = al; }   // 152 fold 4b: a kind's second answer, the list kept up
            if (k && typeof k.pick === 'function' && typeof k.picks === 'function') { var pl = []; try { pl = k.picks(w.arg); } catch (er) { pl = []; } if (Array.isArray(pl) && pl.length) { var pb = mk('div', 'notes-picks'); pl.slice(0, 12).forEach(function(p, i) { if (!p || typeof p.label !== 'string' || !p.label) return; var pc = mkBtn('tool ghost notes-pick', p.label.slice(0, 40), typeof p.tip === 'string' ? p.tip : '', true); pc.setAttribute('data-note-pick', w.key); pc.setAttribute('data-note-i', String(i)); pb.appendChild(pc); }); row.className += ' notes-wrap'; row.appendChild(pb); } }   // 1.6.0: its other answers, each a button of its own
            if (onlyHere(w.kind) && last) last.setAttribute('data-note-stop', '');   // 152 fold 4b's review: it waits nowhere else, so it has no x, and its last answer is where the focus goes on to
            else { var x = mkBtn('tool ghost notes-x', '\u00d7', 'Take this off the list. It still waits where it waits', true); x.setAttribute('data-note-off', w.key); x.setAttribute('aria-label', 'Take off the list'); x.setAttribute('data-note-stop', ''); row.appendChild(x); }
            box.appendChild(row);
        });
    }
    if (l.length) {
        box.appendChild(mk('div', 'rm-label notes-sec', ws.length ? 'Earlier' : 'Notices'));
        l.forEach(function(n) {
            var row = mk('div', 'notes-item'), txt = mk('span', 'notes-txt', n.m + (n.n > 1 ? ' \u00d7' + n.n : ''));
            txt.appendChild(mk('span', 'notes-when', whenWords(n.at, now))); row.appendChild(txt);
            var x = mkBtn('tool ghost notes-x', '\u00d7', 'Delete this notice', true); x.setAttribute('data-note-x', n.i); x.setAttribute('aria-label', 'Delete'); x.setAttribute('data-note-stop', ''); row.appendChild(x);
            box.appendChild(row);
        });
    }
    if (!ws.length && !l.length) box.appendChild(mk('div', 'notes-none', 'Nothing yet.'));
    place();
    var cl = document.getElementById('notesClear'); if (cl) cl.disabled = !l.length && !ws.some(function(w) { return !onlyHere(w.kind); });   // nothing it could clear: what waits only here stays
    return true;
}
// The list stands under the bell and inside the window: its right edge at the bell's, else as near as the window lets it. The wrap is where it
// is measured from, since the list is placed in it. true: placed
function place() {
    var m = document.getElementById('notesMenu'), w = document.getElementById('notesMenuWrap'); if (!m || !w || typeof w.getBoundingClientRect !== 'function') return false;
    var r = w.getBoundingClientRect(), vw = window.innerWidth || 0; if (!(vw > 0)) return false;
    var mw = Math.min(340, vw - 16), x = Math.max(8, Math.min(r.right - mw, vw - 8 - mw));
    m.style.left = Math.round(x - r.left) + 'px'; m.style.right = 'auto';
    return true;
}
// The bell's number (what waits), and the list drawn again while it is up
function sync() {
    var n = waiting().length, bd = document.getElementById('notesBadge');
    if (bd) { var t = n ? String(Math.min(n, 99)) : ''; if (bd.textContent !== t) bd.textContent = t; bd.style.display = n ? '' : 'none'; }
    var m = document.getElementById('notesMenu'); if (m && m.hidden !== true) draw();
    return n;
}
// A press in the list: what waits opens (or, where its kind offers one, takes its second answer), an x takes one off and the focus goes on to the
// row after it, as it does after a button that keeps the list up; Clear all asks
function onPress(e) {
    var t = e.target, at = function(s) { return t && t.closest ? t.closest(s) : null; }, go = at('[data-note-go]'), alt = at('[data-note-alt]'), off = at('[data-note-off]'), x = at('[data-note-x]'), pkB = at('[data-note-pick]');
    if (at('#notesClear')) { clearAll(); return; }
    if (pkB) {   // 1.6.0: one of its other answers; the list stays up and the focus goes on
        var pkK = pkB.getAttribute('data-note-pick'), pkI = Number(pkB.getAttribute('data-note-i')), pkW = waiting().filter(function(w) { return w.key === pkK; })[0] || null, pkD = pkW ? kindOf(pkW.kind) : null, pkAt = stops().indexOf(rowStop(pkB.parentNode));
        if (pkD && typeof pkD.pick === 'function') { try { pkD.pick(pkW.arg, pkI); } catch (er) {} }
        focusAt(pkAt); return;
    }
    if (go || alt) {
        var btn = go || alt, key = btn.getAttribute(go ? 'data-note-go' : 'data-note-alt'), it = (waiting().filter(function(w) { return w.key === key; })[0]) || null, k = it ? kindOf(it.kind) : null, fn = k ? (go ? k.run : k.alt) : null;
        var kept = btn.getAttribute('data-keep') != null, at0 = kept ? stops().indexOf(rowStop(btn)) : -1;
        if (typeof fn === 'function') { try { fn(it.arg); } catch (er) {} }
        if (kept) focusAt(at0);
        return;
    }
    if (!off && !x) return;
    var pos = stops().indexOf(off || x);
    if (off) dismiss(off.getAttribute('data-note-off')); else remove(x.getAttribute('data-note-x'));
    focusAt(pos);
}
function stops() { return Array.prototype.slice.call(document.querySelectorAll('#notesList [data-note-stop]')); }   // each row's last stop: its x, or, for what waits only here, its last answer
function rowStop(btn) { var r = btn.parentNode, ks = r && r.children ? Array.prototype.slice.call(r.children) : []; return ks.filter(function(c) { return !!c && typeof c.getAttribute === 'function' && c.getAttribute('data-note-stop') != null; })[0] || null; }   // the stop of a button's own row
function focusAt(pos) {   // the stop at that place in the list as it is now, else the last, else Clear all, else the bell
    var after = stops(), to = (pos >= 0 ? after[Math.min(pos, after.length - 1)] : null) || document.getElementById('notesClear');
    if (to && typeof to.focus === 'function' && !to.disabled) to.focus(); else { var b = document.getElementById('notesBtn'); if (b) b.focus(); }
}
// [lookcheck:notices-end]
(function wire() {
    var m = document.getElementById('notesMenu'); if (m) m.addEventListener('click', onPress);
    window.addEventListener('resize', function() { var mn = document.getElementById('notesMenu'); if (mn && mn.hidden !== true) place(); });
    sync();
})();
window.wpNotices = { add: add, wait: wait, done: done, sync: sync, draw: draw, waiting: waiting };
export { add, wait, done, sync, draw };
