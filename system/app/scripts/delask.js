/* Deleting what matters asks first (1.6.3; Fulllion's rulings of 2026-11-17 on the map and fog review, findings 15 and 16).

   Finding 15, "Ask when locked": structure is locked by default and a locked piece can now be clicked to see which it is, so a stray Delete
   after that click used to take the wall or the floor away with no word. Every way of deleting on the board (the Delete key, the right-click
   row, the Layers list's bin, Properties' Delete, the selection toolbar's bin) now goes through this module, which asks ONE question first
   where what is picked holds a locked piece, a token (a character token or a waiting one) or, on the Data Map, a room. On a yes everything
   picked goes. A plain unlocked piece goes at once, as before.

   Finding 16, "Move with it, ask on delete": a flattened picture (flatten.js flatLay, `flatPic: true`) names the pieces drawn into it
   (`flatIn`), which stay on the map out of sight, the walls among them still blocking. Deleting such a picture asks whether to put its pieces
   back as they were (what Unflatten does) or to delete them with it. That question also covers the locked pieces and tokens picked beside it,
   so the GM is asked once whatever is picked.

   The pure half (delCount, roomCount, delWords, roomWords, delApply, roomApply) reads and changes only what it is handed, so buildcheck runs
   it in Node. The flow (delAsk, delWb, delRooms) takes the app's question as an argument (dialogs.js showConfirm, which every caller already
   imports), so this module imports no page module. Each caller still saves once and draws once, so one Undo takes the whole delete back. */
import { flatUndo, flatDrop } from './flatten.js';
import { structOk } from './buildcore.js';   // the review of 87d9b6e0: a locked piece is said to be part of the map's structure only where it is

// [buildcheck:delask-start]
// A piece that counts as a token for the question: a character token or a waiting token (Onboarding F1a)
function delTok(w) { return !!w && (w.isChar === true || !!w.isChar || !!w.waiting); }

// What a delete of these ids on a map's board would take: how many pieces, how many of them locked, how many tokens, and each flattened picture
// among them with how many pieces it holds. A flattened picture that holds no piece any more is a plain picture here. The ids are read as a set,
// so a piece named twice counts once; an id the map does not hold counts for nothing.
function delCount(list, ids) {
    var want = Object.create(null), c = { n: 0, locked: 0, struct: 0, tokens: 0, flats: [], kids: 0 };
    (Array.isArray(ids) ? ids : []).forEach(function(id) { if (typeof id === 'string') want[id] = 1; });
    var items = Array.isArray(list) ? list : [], kidsOf = Object.create(null);
    items.forEach(function(w) { if (w && typeof w.flatIn === 'string' && want[w.id] !== 1) kidsOf[w.flatIn] = (kidsOf[w.flatIn] || 0) + 1; });   // a piece picked itself goes anyway, so it is no piece to put back
    items.forEach(function(w) {
        if (!w || typeof w.id !== 'string' || want[w.id] !== 1) return;
        want[w.id] = 2; c.n++;
        var flat = w.flatPic === true && kidsOf[w.id] > 0;
        // a flattened picture that holds pieces has a question of its own, so its own lock (a picture on the back layer is structure) is not
        // counted again as a further locked piece (the review of 87d9b6e0)
        if (w.locked && !flat) { c.locked++; if (structOk(w)) c.struct++; }
        if (delTok(w)) c.tokens++;
        if (flat) { c.flats.push({ id: w.id, kids: kidsOf[w.id] }); c.kids += kidsOf[w.id]; }
    });
    return c;
}
// How many of these ids are rooms of the Data Map, and the name of the first, for the question
function roomCount(rooms, ids) {
    var want = Object.create(null), c = { n: 0, name: '' };
    (Array.isArray(ids) ? ids : []).forEach(function(id) { if (typeof id === 'string') want[id] = 1; });
    (Array.isArray(rooms) ? rooms : []).forEach(function(r) { if (r && typeof r.id === 'string' && want[r.id] === 1) { want[r.id] = 2; if (!c.n && typeof r.name === 'string') c.name = r.name.trim().slice(0, 80); c.n++; } });
    return c;
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
// The question for a delete on the board, or '' where none is asked (nothing locked, no token, no flattened picture that holds pieces).
// `flat` says the question has the two flattened answers (Put the pieces back, Delete them too) in place of one Delete.
function delWords(c) {
    if (!c || !c.n) return { text: '', flat: false };
    var extra = function(others) {
        var bits = [];
        if (c.locked) bits.push(plural(c.locked, 'locked piece', 'locked pieces'));
        if (c.tokens) bits.push(plural(c.tokens, 'token', 'tokens'));
        return bits.length ? ' ' + (others ? 'What else is picked goes too, with ' : 'This takes ') + bits.join(' and ') + '.' : '';
    };
    if (c.flats.length) {
        var one = c.flats.length === 1;
        return { text: (one ? 'Delete the flattened picture? Its ' : 'Delete ' + c.flats.length + ' flattened pictures? Their ') + plural(c.kids, 'piece', 'pieces') + ' can be put back as ' + (c.kids === 1 ? 'it was' : 'they were') + ', or deleted with ' + (one ? 'it.' : 'them.') + extra(c.n > c.flats.length), flat: true };
    }
    if (!c.locked && !c.tokens) return { text: '', flat: false };
    if (c.n === 1) return { text: c.tokens ? 'Delete this token?' : c.struct ? 'Delete this locked piece? It is part of the map’s structure.' : 'Delete this locked piece?', flat: false };   // structure by buildcore structOk alone: a text box or a shape locked by hand is no part of it
    return { text: 'Delete ' + plural(c.n, 'piece', 'pieces') + '?' + extra(false), flat: false };
}
// The question for a delete of rooms on the Data Map: always asked, since a room takes its links with it
function roomWords(c) {
    if (!c || !c.n) return '';
    if (c.n === 1) return 'Delete the room' + (c.name ? ' ' + c.name : '') + '? Its links go with it.';
    return 'Delete ' + c.n + ' rooms? Their links go with them.';
}
// Takes the ids off a map's board. `how` is 'back' (a flattened picture's pieces are put back as Unflatten puts them), 'all' (they go with it)
// or nothing (a picture that holds pieces is never deleted this way without one, so a caller cannot strand them by mistake: its pieces are put
// back). A waiting token that goes stays away this session (window.wpWaitingGone). Answers how many pieces went and how many came back.
function delApply(map, ids, how) {
    var out = { gone: 0, back: 0, with: 0 };
    if (!map || !Array.isArray(map.whiteboard)) return out;
    var want = Object.create(null); (Array.isArray(ids) ? ids : []).forEach(function(id) { if (typeof id === 'string') want[id] = 1; });
    var goes = map.whiteboard.filter(function(w) { return w && want[w.id] === 1; });
    out.gone = goes.length;
    if (typeof window !== 'undefined' && typeof window.wpWaitingGone === 'function') { try { window.wpWaitingGone(goes); } catch (e) {} }
    // each flattened picture first: its pieces put back or taken with it (a piece that is picked itself goes below either way, and is not counted)
    goes.filter(function(w) { return w.flatPic === true; }).forEach(function(w) {
        if (how === 'all') { var d = flatDrop(map, w.id, want); if (d > 0) out.with += d; }
        else { var b = flatUndo(map, w.id, want); if (b > 0) out.back += b; }
    });
    map.whiteboard = map.whiteboard.filter(function(w) { return !(w && want[w.id] === 1); });
    return out;
}
// Takes rooms off the Data Map with every link that names one of them
function roomApply(map, ids) {
    if (!map) return 0;
    var want = Object.create(null); (Array.isArray(ids) ? ids : []).forEach(function(id) { if (typeof id === 'string') want[id] = 1; });
    var before = Array.isArray(map.rooms) ? map.rooms.length : 0;
    if (Array.isArray(map.rooms)) map.rooms = map.rooms.filter(function(r) { return !(r && want[r.id] === 1); });
    if (Array.isArray(map.links)) map.links = map.links.filter(function(l) { return !(Array.isArray(l) && (want[l[0]] === 1 || want[l[1]] === 1)); });
    return before - (Array.isArray(map.rooms) ? map.rooms.length : 0);
}
// What the notice says once a delete went through
function delSaid(out) {
    if (!out) return 'Deleted.';
    if (out.back) return 'Deleted. ' + plural(out.back, 'piece is', 'pieces are') + ' back as ' + (out.back === 1 ? 'it was.' : 'they were.');
    if (out.with) return 'Deleted with ' + plural(out.with, 'piece', 'pieces') + ' drawn into it.';
    return 'Deleted.';
}
// The question, asked through `confirm` (showConfirm's shape: title, callback, opts), then go(how): go(null) where nothing is asked, go('back')
// or go('all') for a flattened picture's two answers, go('yes') for a plain yes; nothing at all on Cancel. A question is answered by its buttons
// alone (noEnter), since a key pressed for something else must not delete a wall
function delAsk(q, confirm, go) {
    if (!q || !q.text) { go(null); return; }
    if (typeof confirm !== 'function') return;
    if (q.flat) confirm(q.text, function(a) { if (a === 'alt') go('all'); else if (a) go('back'); }, { noEnter: true, yes: 'Put the pieces back', alt: 'Delete them too' });
    else confirm(q.text, function(a) { if (a) go('yes'); }, { noEnter: true, yes: 'Delete' });
}
// [buildcheck:delask-end]

function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('delete v1', s, f || {}); } catch (e) {} }
function say(t) { if (typeof window !== 'undefined' && typeof window.appToast === 'function') window.appToast(t); }   // the page's notice, through its window name, so the pure part loads in Node
// What is said where the map changed under an open question (the review of 87d9b6e0)
var DEL_MOVED = 'Nothing was deleted: the map changed before you answered.';
// The map a question was asked on, found again when it is answered (the review of 87d9b6e0): showConfirm queues questions behind each other, so
// the GM may switch maps, or an Undo may put a new copy of the map in its place, before the answer comes. `now` (the caller's getActiveMap)
// answers the map on screen then: the question goes on with it only while it is the same map by its id, so the delete lands in the map that is
// saved, recorded as a step and sent to the table, and otherwise nothing is deleted and the GM is told. With no `now` the map handed in stands
function delAgain(map, now) {
    if (typeof now !== 'function') return map;
    var cur = null; try { cur = now(); } catch (e) { cur = null; }
    return cur && map && cur.id === map.id ? cur : null;
}
// The whole of a delete on the board: asks where it must, then takes the pieces and calls done(out, how) for the caller to clear its
// selection, save once and draw (out is delApply's answer, how the answer: null where nothing was asked, 'back', 'all' or 'yes'). Nothing
// happens on Cancel, nor where the map changed before the answer (`now`, delAgain above)
function delWb(map, ids, confirm, done, now) {
    if (!map || !Array.isArray(map.whiteboard)) return;
    var c = delCount(map.whiteboard, ids), q = delWords(c);
    if (!c.n) return;
    delAsk(q, confirm, function(how) {
        var m = how ? delAgain(map, now) : map;   // a delete with no question is made at once, on the map handed in
        if (!m || !Array.isArray(m.whiteboard)) { step('moved', { pieces: c.n }); say(DEL_MOVED); return; }
        var out = delApply(m, ids, how === 'all' ? 'all' : 'back');
        step(q.text ? 'asked' : 'plain', { pieces: c.n, locked: c.locked, tokens: c.tokens, flats: c.flats.length, how: how || 'none' });
        if (typeof done === 'function') done(out, how);
    });
}
// The whole of a delete of rooms on the Data Map: always asks, then takes the rooms and their links and calls done(n). `now` as for delWb
function delRooms(map, ids, confirm, done, now) {
    if (!map) return;
    var c = roomCount(map.rooms, ids);
    if (!c.n) return;
    delAsk({ text: roomWords(c), flat: false }, confirm, function() {
        var m = delAgain(map, now);
        if (!m) { step('moved', { rooms: c.n }); say(DEL_MOVED); return; }
        var n = roomApply(m, ids);
        step('rooms', { rooms: n });
        if (typeof done === 'function') done(n);
    });
}
if (typeof window !== 'undefined') window.wpDelAsk = { delWb: delWb, delRooms: delRooms, delSaid: delSaid };
export { delTok, delCount, roomCount, delWords, roomWords, delApply, roomApply, delSaid, delAsk, delAgain, DEL_MOVED, delWb, delRooms };
