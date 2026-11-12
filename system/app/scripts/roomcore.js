// The Data Map's rooms, their pure half (1.6.2, backlog 45, fold 1: adding and linking rooms; the owner, 2026-11-11, by prompt: "Name ready, drag to
// link (Recommended)", "Double-click adds a room", "A room from a play map piece"). It reads nothing but its arguments, so a suite runs it as it is.
// A room is { id, name, cat, x, y, notes, characters } on its map's `rooms`; a link is [roomA, roomB] or [roomA, roomB, type] on its map's `links`;
// a piece of the play map stands for a room by its `nodeId`. datamap.js and whiteboard.js lay what this half answers.

var ROOM_W = 140, ROOM_H = 60;   // a room's box, as the Data Map's minimap and the room menu read it (the style sheet: 118 to 190 wide)
var NAME_MAX = 120;
var STEP = 24, NEAR_X = 40, NEAR_Y = 30, TRIES = 40;

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function num(v, d) { var n = typeof v === 'number' ? v : NaN; return isFinite(n) ? n : d; }

// The name a room takes from what was typed: one line, no control characters, at most 120 characters; nothing typed keeps the one it had
function roomNameOf(text, old) {
    var s = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).replace(/[\ud800-\udbff]$/, '').trim();
    if (s) return s;
    return typeof old === 'string' && old.trim() ? old : 'New room';
}

// A place for a new room at (x, y) that does not sit on top of another: stepped down and right while a room stands within a few pixels of it, so
// rooms added one after another at the middle of the view stand as a stair and each can be seen. Never left of or above 10
function freeSpot(rooms, x, y) {
    var list = Array.isArray(rooms) ? rooms : [];
    var px = Math.max(10, Math.round(num(x, 100))), py = Math.max(10, Math.round(num(y, 100)));
    for (var i = 0; i < TRIES; i++) {
        var hit = list.some(function(r) { return isObj(r) && Math.abs(num(r.x, -1e9) - px) < NEAR_X && Math.abs(num(r.y, -1e9) - py) < NEAR_Y; });
        if (!hit) break;
        px += STEP; py += STEP;
    }
    return { x: px, y: py };
}

// A new room, at a free place near (x, y), in the map's first category (none where the map has none)
function newRoom(id, rooms, cats, x, y, name) {
    var p = freeSpot(rooms, x, y), cat = isObj(cats) ? Object.keys(cats)[0] : undefined;
    var r = { id: String(id), name: roomNameOf(name, 'New room') };
    if (cat !== undefined) r.cat = cat;
    r.x = p.x; r.y = p.y; r.notes = ''; r.characters = [];
    return r;
}

// The link between two rooms, either way round: its place in the list, or -1
function linkAt(links, a, b) {
    if (!Array.isArray(links)) return -1;
    for (var i = 0; i < links.length; i++) { var l = links[i]; if (Array.isArray(l) && ((l[0] === a && l[1] === b) || (l[0] === b && l[1] === a))) return i; }
    return -1;
}

// A link added, of the type new links take; one already there is kept as it is and answered with `had`. Nothing for a room to itself or no room
function linkAdd(links, a, b, type) {
    if (!Array.isArray(links) || typeof a !== 'string' || typeof b !== 'string' || !a || !b || a === b) return null;
    var at = linkAt(links, a, b);
    if (at >= 0) return { at: at, had: true };
    links.push(typeof type === 'string' && type ? [a, b, type] : [a, b]);
    return { at: links.length - 1, had: false };
}

// Where a room made away from the Data Map goes: in a column right of the rooms there, level with the topmost, so it is found beside them
function besideRooms(rooms) {
    var list = (Array.isArray(rooms) ? rooms : []).filter(function(r) { return isObj(r) && isFinite(num(r.x, NaN)) && isFinite(num(r.y, NaN)); });
    if (!list.length) return freeSpot([], 100, 100);
    var right = -Infinity, top = Infinity;
    list.forEach(function(r) { right = Math.max(right, r.x + ROOM_W); top = Math.min(top, r.y); });
    return freeSpot(list, right + 60, top);
}

// A piece of the play map that may be made a room's place: one the GM laid that stands for an area (a shape, a picture, a filled region), with no
// room yet. Never a token, a waiting token, a GM note card, a light, a trigger zone, a text box or a line, nor a wall, a door or a barrier. Handed
// the map's rooms, a link to a room that is gone is no room (the review: deleting the room leaves the piece's nodeId behind)
var ROOM_KINDS = ['rect', 'hexagon', 'circle', 'diamond', 'image'];
function pieceRoomOk(w, rooms) {
    if (!isObj(w) || w.isChar || w.waiting || w.gmNoteFor) return false;
    if (w.nodeId && (!Array.isArray(rooms) || rooms.some(function(r) { return isObj(r) && r.id === w.nodeId; }))) return false;
    if (w.blocksSight || w.barrier === true || w.sightType === 'door') return false;
    if (ROOM_KINDS.indexOf(w.type) >= 0) return true;
    return w.type === 'path' && w.tip === 'fill';
}
// The name such a room starts with: the piece's own name, else New room. A piece hidden from players gives no name (the review): every player is
// sent the map's rooms by name, and the piece itself is sent to no one
function pieceRoomName(w) { return roomNameOf(isObj(w) && !w.hidden && typeof w.name === 'string' ? w.name : '', 'New room'); }

// ---- fold 2, finding a room (the owner, 2026-11-11, by prompt: "A Find box that dims the rest", "Category chips", "Quick jump reads more",
// "Rooms list by name"). Words are compared folded: lower case, accents left out, so Café finds cafe
function fold(v) { var s = typeof v === 'string' ? v : v == null ? '' : String(v); try { s = s.normalize('NFD'); } catch (e) {} return s.replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
// What a room is found by, folded: its name, its notes, and who is there (each character's name and what the GM wrote of them)
var _words = typeof WeakMap === 'function' ? new WeakMap() : null;   // a room's folded words, kept until its words change (the review: a drag draws the Data Map at every move)
function roomWords(r) {
    if (!isObj(r)) return { name: '', notes: '', who: '' };
    var who = (Array.isArray(r.characters) ? r.characters : []).filter(isObj).map(function(c) { return (typeof c.name === 'string' ? c.name : '') + ' ' + (typeof c.info === 'string' ? c.info : ''); }).join(' ');
    var src = String(r.name) + '\u0001' + String(r.notes) + '\u0001' + who, had = _words ? _words.get(r) : null;
    if (had && had.src === src) return had.w;
    var w = { name: fold(r.name), notes: fold(r.notes), who: fold(who) };
    if (_words) _words.set(r, { src: src, w: w });
    return w;
}
function queryWords(q) { return fold(q).split(/\s+/).filter(Boolean).slice(0, 12); }
// Whether a room is found by what was typed: every word somewhere in its name, its notes or who is there. Answers '' (not found), 'all' (nothing
// typed), 'name' (every word in its name), 'notes' (in its name and notes) or 'who' (only with who is there)
function roomMatch(r, q) {
    var ws = queryWords(q); if (!ws.length) return 'all';
    var w = roomWords(r), all = w.name + ' ' + w.notes + ' ' + w.who, nn = w.name + ' ' + w.notes;
    if (!ws.every(function(x) { return all.indexOf(x) >= 0; })) return '';
    if (ws.every(function(x) { return w.name.indexOf(x) >= 0; })) return 'name';
    return ws.every(function(x) { return nn.indexOf(x) >= 0; }) ? 'notes' : 'who';
}
// Quick jump's reading of a room (main.js cmdkRender), the Find box's own rule: 'name', 'notes', 'who' or '' for no word typed or none found
function jumpMatch(label, wn, ww, q) {
    var ws = queryWords(q); if (!ws.length) return '';
    var nm = fold(label), n2 = typeof wn === 'string' ? wn : '', w2 = typeof ww === 'string' ? ww : '', all = nm + ' ' + n2 + ' ' + w2;
    if (!ws.every(function(x) { return all.indexOf(x) >= 0; })) return '';
    if (ws.every(function(x) { return nm.indexOf(x) >= 0; })) return 'name';
    return ws.every(function(x) { return (nm + ' ' + n2).indexOf(x) >= 0; }) ? 'notes' : 'who';
}
// A room's category as the Data Map draws it: its own where the map has it, else the map's first
function roomCatOf(r, cats) { var keys = isObj(cats) ? Object.keys(cats) : []; return isObj(r) && keys.indexOf(r.cat) >= 0 ? r.cat : (keys[0] || ''); }
// The categories this map's rooms are in, in the map's own order, each with its label, colour and count; none for a category no room is in
function catsUsed(rooms, cats) {
    if (!isObj(cats)) return [];
    var n = Object.create(null); (Array.isArray(rooms) ? rooms : []).filter(isObj).forEach(function(rm) { var k = roomCatOf(rm, cats); if (k) n[k] = (n[k] || 0) + 1; });
    return Object.keys(cats).filter(function(k) { return n[k] > 0; }).map(function(k) { var c = isObj(cats[k]) ? cats[k] : {}; return { key: k, label: typeof c.label === 'string' && c.label ? c.label : 'Unnamed', color: typeof c.color === 'string' ? c.color : '', n: n[k] }; });
}
// Whether a room stands out (shown) under what was typed and the chips picked, and whether it is a hit of the words. With nothing typed and no
// chip picked every room is shown and none is a hit
function roomShown(r, q, picked, cats) {
    var m = roomMatch(r, q), inCat = !Array.isArray(picked) || !picked.length || picked.indexOf(roomCatOf(r, cats)) >= 0;
    return { shown: !!m && inCat, hit: !!m && m !== 'all' && inCat };
}
// The rooms in an order: 'name' (as a person reads them, 2 before 10, ignoring case), 'cat' (by the map's category order, then name), else as made
function roomsOrdered(rooms, how, cats) {
    var list = (Array.isArray(rooms) ? rooms : []).filter(isObj).map(function(rm, i) { return { r: rm, i: i }; });
    var nm = function(a, b) { var c = String(a.r.name || '').localeCompare(String(b.r.name || ''), undefined, { numeric: true, sensitivity: 'base' }); return c || a.i - b.i; };
    var keys = isObj(cats) ? Object.keys(cats) : [];
    if (how === 'name') list.sort(nm);
    else if (how === 'cat') list.sort(function(a, b) { var d = keys.indexOf(roomCatOf(a.r, cats)) - keys.indexOf(roomCatOf(b.r, cats)); return d || nm(a, b); });
    return list.map(function(e) { return e.r; });
}

var API = { ROOM_W: ROOM_W, fold: fold, queryWords: queryWords, jumpMatch: jumpMatch, roomWords: roomWords, roomMatch: roomMatch, roomCatOf: roomCatOf, catsUsed: catsUsed, roomShown: roomShown, roomsOrdered: roomsOrdered, ROOM_H: ROOM_H, NAME_MAX: NAME_MAX, roomNameOf: roomNameOf, freeSpot: freeSpot, newRoom: newRoom, linkAt: linkAt, linkAdd: linkAdd, besideRooms: besideRooms, pieceRoomOk: pieceRoomOk, pieceRoomName: pieceRoomName };
if (typeof window !== 'undefined') window.wpRoomCore = API;
export { fold, queryWords, jumpMatch, roomWords, roomMatch, roomCatOf, catsUsed, roomShown, roomsOrdered, ROOM_W, ROOM_H, NAME_MAX, roomNameOf, freeSpot, newRoom, linkAt, linkAdd, besideRooms, pieceRoomOk, pieceRoomName };
