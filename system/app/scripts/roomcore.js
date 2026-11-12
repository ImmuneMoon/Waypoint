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

var API = { ROOM_W: ROOM_W, ROOM_H: ROOM_H, NAME_MAX: NAME_MAX, roomNameOf: roomNameOf, freeSpot: freeSpot, newRoom: newRoom, linkAt: linkAt, linkAdd: linkAdd, besideRooms: besideRooms, pieceRoomOk: pieceRoomOk, pieceRoomName: pieceRoomName };
if (typeof window !== 'undefined') window.wpRoomCore = API;
export { ROOM_W, ROOM_H, NAME_MAX, roomNameOf, freeSpot, newRoom, linkAt, linkAdd, besideRooms, pieceRoomOk, pieceRoomName };
