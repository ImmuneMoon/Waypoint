// A map's places, their pure half (1.6.3; a player's idea at the owner's game of 2026-11-15, the owner by prompt: "a list on the map thats
// interactable you can link to location pins, that reveal as the character sees the pin and it shows the name of the place with it"). It
// reads nothing but its arguments and fogcore.js (itself pure), so tools/placescheck.js runs it as it is. places.js draws what it answers.
//
// A PLACE is a piece of the play map that the map's list of places names. The GM makes one by ticking Place in its Properties (the piece's
// own key `place`, true only), and may name it (`placeName`, one line of 60 characters at most). A piece that names a room (nodeId) or leads
// to another map (a teleporter, fogcore isPortal) is a place with no tick, so a map's pins and portals are listed at once, unless the GM
// unticks it, which stores place: false. A place is never a token, a waiting token, a GM note card, a hidden piece, a secret door, a plain
// wall, a light source's marker (players never see one) or a legend itself (a legend lists places and is none).
//
// Its name, where the GM typed none: the room's name for a piece that names a room, else the title of the map a teleporter leads to, else the
// piece's own name, else "A place". The list stands in reading order: top to bottom, and left to right along a row (pieces whose middles lie
// within ROW_BAND of the first piece of their row are one row, so a pin set a few pixels lower still reads in its row).
//
// What a player may see of the list is NOT judged here: places.js asks fog.js which pins this screen's viewer has seen and passes the rest
// over (placesSeenOnly). Nothing here is sent or stored.

import { isPortal, secretOn } from './fogcore.js';

var NAME_MAX = 60;       // a place's name, as the Place name box takes it
var LIST_MAX = 200;      // places a map lists at most (a map holds 6000 pieces a player is sent; a list of more could not be read anyway)
var ROW_BAND = 25;       // board pixels: middles this close in height read as one row
var DEFAULT_NAME = 'A place';

// A plain object, never a list
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
// A finite number, else d
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

// A place's name as it is kept and shown: one line (a control character or a line break becomes a space, runs of spaces become one),
// trimmed, cut to 60 whole characters (a character outside the basic plane is one character, never half of one). Anything that is no text
// gives ''. Asked by the wire (net.js wireWbItem, cleanHostWbItem), a file's import (cleanup.js cleanImportItems) and the Place name box
function cleanPlaceName(v) {
    if (typeof v !== 'string') return '';
    var s = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
    var chars = Array.from(s); if (chars.length > NAME_MAX) s = chars.slice(0, NAME_MAX).join('').trim();
    return s;
}
// The Place tick as it is kept: true, false (a room's pin or a teleporter the GM unticked), or undefined (no key at all)
function cleanPlace(v) { return v === true ? true : v === false ? false : undefined; }

// A plain wall, as the host sends one in its one shape (net.js wireWbItem's own test, written out again here): a piece that blocks sight or
// is a see-through barrier, is no door, no token and no waiting token, leads nowhere and is no picture and no text box. It is never a place,
// so that no key tells one wall from another on the wire
function plainWall(w) {
    return isObj(w) && !!(w.blocksSight || w.barrier === true) && w.sightType !== 'door' && !w.isChar && !w.waiting && !w.targetMapId && !w.nodeId && w.type !== 'image' && w.type !== 'text';
}
// Whether a piece may be a place at all, whatever its tick: never a token, a waiting token, a GM note card, a hidden piece, a secret door,
// a plain wall, a light source's marker or a legend. Properties offers the Place tick only where this is true (a hidden piece excepted:
// the GM may tick it, and it is listed once shown, so `hiddenOk` lets the box ask about a hidden piece)
function placeKindOk(w, hiddenOk) {
    if (!isObj(w) || typeof w.id !== 'string' || !w.id) return false;
    if (w.isChar || w.waiting || w.gmNoteFor) return false;
    if (w.hidden && hiddenOk !== true) return false;
    if (w.type === 'light' || w.type === 'maplegend') return false;
    if (secretOn(w)) return false;
    if (plainWall(w)) return false;
    return true;
}
// The room a piece names (its nodeId, the first room of that id as the board's marker reads it), or null
function roomOf(w, map) {
    if (!isObj(w) || typeof w.nodeId !== 'string' || !w.nodeId || !isObj(map) || !Array.isArray(map.rooms)) return null;
    for (var i = 0; i < map.rooms.length; i++) { var r = map.rooms[i]; if (isObj(r) && r.id === w.nodeId) return r; }
    return null;
}
// The id of the map a teleporter leads to (its own Portal to Map, else its room's), or '' for a piece that leads nowhere
function destOf(w, map) {
    if (!isObj(w) || !isPortal(w, map)) return '';
    if (typeof w.targetMapId === 'string' && w.targetMapId) return w.targetMapId;
    var r = roomOf(w, map); return r && typeof r.targetMapId === 'string' ? r.targetMapId : '';
}
// Whether a piece is a place with no tick: it names a room on this map, or it leads to another map
function placeAuto(w, map) { return !!roomOf(w, map) || !!destOf(w, map); }
// Whether the Place tick stands ticked for a piece: its own tick, else (no key) whether it names a room or leads somewhere
function placeTicked(w, map) { var p = cleanPlace(isObj(w) ? w.place : undefined); return p === true || (p === undefined && placeAuto(w, map)); }
// The name a place shows where the GM typed none (the Place name box shows it greyed): the room's name, the destination map's title, the
// piece's own name, "A place". ctx.titleOf(mapId) answers a map's title on this screen (a player's app holds every map's title as a stub)
function placeDefault(w, map, ctx) {
    var r = roomOf(w, map), rn = r ? cleanPlaceName(r.name) : ''; if (rn) return rn;
    var to = destOf(w, map), tn = to && ctx && typeof ctx.titleOf === 'function' ? cleanPlaceName(ctx.titleOf(to)) : ''; if (tn) return tn;
    var own = cleanPlaceName(isObj(w) ? w.name : ''); return own || DEFAULT_NAME;
}
// The ONE judge of a place: { id, name, room, to, x, y } for a piece the map lists (room the id of the room it names or '', to the id of the
// map it leads to or '', x and y its middle on the board), else null. Never a hidden piece, whoever asks
function placeOf(w, map, ctx) {
    if (!placeKindOk(w) || !placeTicked(w, map)) return null;
    var x = num(w.x, NaN), y = num(w.y, NaN); if (!isFinite(x) || !isFinite(y)) return null;
    var wd = Math.max(0, num(w.w, 0)), ht = Math.max(0, num(w.h, 0)), r = roomOf(w, map);
    var name = cleanPlaceName(w.placeName) || placeDefault(w, map, ctx);
    return { id: w.id, name: name, room: r && typeof r.id === 'string' ? r.id : '', to: destOf(w, map), x: x + wd / 2, y: y + ht / 2 };
}
// Places in reading order: sorted by their middles' height, gathered into rows (a middle within ROW_BAND of its row's first), each row
// left to right. A new list; the one handed in is left as it was
function readingOrder(list) {
    var byY = (Array.isArray(list) ? list : []).filter(isObj).slice().sort(function(a, b) { return a.y - b.y || a.x - b.x; });
    var rows = [], row = null;
    byY.forEach(function(p) { if (!row || p.y - row.top > ROW_BAND) { row = { top: p.y, items: [] }; rows.push(row); } row.items.push(p); });
    var out = [];
    rows.forEach(function(rw) { rw.items.sort(function(a, b) { return a.x - b.x || a.y - b.y; }).forEach(function(p) { out.push(p); }); });
    return out;
}
// Every place of a map, in reading order, LIST_MAX at most. [] for anything that is no map. max, where it is a number, is the cut in place of
// LIST_MAX (places.js passes Infinity for a player, whose list is cut only after it is judged for what they have seen, so that a player who
// has seen places 201 and on of a crowded map still gets them; the cut of what a screen draws is then LIST_MAX all the same)
function placesOn(map, ctx, max) {
    if (!isObj(map) || !Array.isArray(map.whiteboard)) return [];
    var out = [];
    for (var i = 0; i < map.whiteboard.length; i++) { var p = placeOf(map.whiteboard[i], map, ctx); if (p) out.push(p); }
    var cut = typeof max === 'number' && max >= 0 ? max : LIST_MAX;
    return isFinite(cut) ? readingOrder(out).slice(0, cut) : readingOrder(out);
}
// The places a viewer may see: seen is a list of true and false, one for each place handed in (fog.js placeSeen), and a place is kept where
// it says true. A list of another length, or none, keeps nothing: failing closed, a player is never shown a place their screen cannot judge
function placesSeenOnly(list, seen) {
    var l = Array.isArray(list) ? list : []; if (!Array.isArray(seen) || seen.length !== l.length) return [];
    return l.filter(function(p, i) { return seen[i] === true; });
}
// The lines a list or a legend draws: numbered from 1 in the order handed in, each its name and, for a teleporter, the map it leads to
function placeLines(list) {
    return (Array.isArray(list) ? list : []).filter(isObj).map(function(p, i) { return { n: i + 1, id: p.id, name: cleanPlaceName(p.name) || DEFAULT_NAME, to: typeof p.to === 'string' ? p.to : '' }; });
}
// A text that changes whenever what a list or a legend draws changes, so a redraw is made only then
function placesSig(lines, extra) { return JSON.stringify([extra === undefined ? '' : extra, (Array.isArray(lines) ? lines : []).map(function(l) { return [l.id, l.name, l.to, l.mark ? 1 : 0]; })]); }

export { NAME_MAX, LIST_MAX, ROW_BAND, DEFAULT_NAME, cleanPlaceName, cleanPlace, plainWall, placeKindOk, roomOf, destOf, placeAuto, placeTicked, placeDefault, placeOf, readingOrder, placesOn, placesSeenOnly, placeLines, placesSig };
// Published for the scripts that may not import it (net.js, cleanup.js through main.js's import, places.js reads it either way)
if (typeof window !== 'undefined') window.wpPlaceCore = { NAME_MAX: NAME_MAX, LIST_MAX: LIST_MAX, ROW_BAND: ROW_BAND, DEFAULT_NAME: DEFAULT_NAME, cleanPlaceName: cleanPlaceName, cleanPlace: cleanPlace, plainWall: plainWall, placeKindOk: placeKindOk, roomOf: roomOf, destOf: destOf, placeAuto: placeAuto, placeTicked: placeTicked, placeDefault: placeDefault, placeOf: placeOf, readingOrder: readingOrder, placesOn: placesOn, placesSeenOnly: placesSeenOnly, placeLines: placeLines, placesSig: placesSig };
