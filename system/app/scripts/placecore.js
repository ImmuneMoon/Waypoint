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

import { isPortal, secretOn, zoneHolds, itemCovers, cleanTexSrc } from './fogcore.js';

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
function placesSig(lines, extra) { return JSON.stringify([extra === undefined ? '' : extra, (Array.isArray(lines) ? lines : []).map(function(l) { return [l.id, l.name, l.to, l.mark ? 1 : 0, l.pic === true ? 1 : typeof l.pic === 'string' ? l.pic.length + ':' + l.pic.slice(-40) : 0]; })]); }   // 1.6.4: and the picture a line shows (places.js picLines)

/* ---- A picture on a trigger zone or a place (1.6.4; Fulllion, 2026-11-22, by prompt, for his weekly game) ----
   A trigger zone, or a piece that is a place, may carry a picture the GM picked in its Properties: one of the campaign's own pictures
   (standPic, a /saves/images path as fogcore cleanTexSrc keeps it, picked from the Image Library) or a picture handout of the campaign
   (standHid, its id). When a player's own token is carried onto it by that player's gesture, the host shows the picture to that player
   (net.js standFire, the same secrecy as a trigger zone's message: triggerFire). What it shows and to whom are the GM's options:
     standScene: false   no scene (by default the picture opens big, as Show as a scene does);
     standJournal: false no copy in the Journal (by default a copy is kept);
     standWho            absent: the player who stood there sees it every time they stand there, with a Journal copy the first time only;
                         'once': each player sees it the first time they stand there, and never again;
                         'all':  the first player to stand there makes it show to everyone on that map, once, and never again.
   The host remembers who was shown it on the piece itself: standSeen { <player id>: 1 shown, 2 stood there } and standDone (true once an
   'all' picture went out). Every one of these keys is the GM's own: net.js wireWbItem keeps them all off every copy sent, cleanHostWbItem
   drops them on a player's app, a file's import keeps the picture and the options and drops the records (cleanup.js), and a player's map
   copy never sets them (the host takes only a player's own token moves and drawings). Nothing here is sent or stored: the callers do. */
var STAND_KEYS = ['standPic', 'standHid', 'standScene', 'standJournal', 'standWho', 'standSeen', 'standDone'];
var STAND_SEEN_MAX = 500;   // players a piece remembers; past it the oldest names go (a table never has that many)
var STAND_PIN_REACH = 30;   // board pixels: a place pin is small, so a token counts as on it with its middle within this of the pin's middle
// An id as a handout or a player's profile has one (net.js validProfileId's characters): letters, digits, _, ., : and -, 80 at most
function standId(v) { return typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) && v !== '__proto__' ? v : ''; }   // (never __proto__, which as a key of the records would name their prototype)
// Whether a piece may carry a picture at all: a trigger zone that is no mine, or a piece that may be a place (placeKindOk, hidden or not, as
// the Place tick asks). Properties offers the picture only where this is true, and the host fires only for such a piece
function standOk(w) {
    if (!isObj(w) || typeof w.id !== 'string' || !w.id || w.isChar || w.waiting || w.gmNoteFor) return false;
    if (w.type === 'trigger') return !w.mine;
    return placeKindOk(w, true);
}
// The picture's keys as they are kept, cleaned IN PLACE on the piece handed in (asked by cleanup.js on a file's import, with records false,
// and by the host before it reads a piece, with records true). standPic only as cleanTexSrc keeps it, standHid only as an id, never both
// (the picture wins); the two ticks only as false; standWho only as 'once' or 'all'; with records, standSeen only as ids to 1 or 2 (500 at
// most) and standDone only as true, and without, neither. A piece that may carry no picture, or that names none, keeps none of the keys
function cleanStand(w, records) {
    if (!isObj(w)) return w;
    var pic = typeof w.standPic === 'string' ? cleanTexSrc(w.standPic) : null, hid = pic ? '' : standId(w.standHid);
    if (!standOk(w) || (!pic && !hid)) { STAND_KEYS.forEach(function(k) { if (w[k] !== undefined) delete w[k]; }); return w; }
    if (pic) { w.standPic = pic; delete w.standHid; } else { w.standHid = hid; delete w.standPic; }
    if (w.standScene !== undefined && w.standScene !== false) delete w.standScene;
    if (w.standJournal !== undefined && w.standJournal !== false) delete w.standJournal;
    if (w.standWho !== undefined && w.standWho !== 'once' && w.standWho !== 'all') delete w.standWho;
    if (records === true && isObj(w.standSeen)) {
        var seen = {}, ks = Object.keys(w.standSeen).filter(function(k) { return standId(k) && (w.standSeen[k] === 1 || w.standSeen[k] === 2); });
        ks.slice(-STAND_SEEN_MAX).forEach(function(k) { seen[k] = w.standSeen[k]; });
        if (ks.length) w.standSeen = seen; else delete w.standSeen;
    } else if (w.standSeen !== undefined) delete w.standSeen;
    if (records !== true || w.standDone !== true) delete w.standDone;
    return w;
}
// Whether a token's middle (px, py) stands on a piece that carries a picture: a trigger zone by its own shape (fogcore zoneHolds, as
// triggerFire reads it), a place pin within STAND_PIN_REACH of its middle or inside its box, any other place by its outline (fogcore
// itemCovers, as the fog reads a piece's cells; a pen line covers nothing)
function standHolds(w, px, py) {
    if (!isObj(w) || typeof px !== 'number' || typeof py !== 'number' || !isFinite(px) || !isFinite(py)) return false;
    if (w.type === 'trigger') return zoneHolds(w, px, py);
    if (w.type === 'mappin') {
        var x = num(w.x, NaN), y = num(w.y, NaN), wd = Math.max(0, num(w.w, 0)), ht = Math.max(0, num(w.h, 0)); if (!isFinite(x) || !isFinite(y)) return false;
        if (Math.abs(px - (x + wd / 2)) <= STAND_PIN_REACH && Math.abs(py - (y + ht / 2)) <= STAND_PIN_REACH) return true;
    }
    return itemCovers(w, px, py, null);
}
// What the host does when player pid's gesture carried their token onto piece w (its keys cleaned with records). present: the ids of the
// players on that map now (pid among them or not). Answers null for nothing to show, else { to: [ids], scene, keep, seen, done? } where to
// are the players shown it, scene whether it opens big, keep whether their Journals keep a copy, seen standSeen as it is to be written on
// the piece, and done true for an 'all' picture, which never goes out again. A plan with neither scene nor keep is null: nothing goes out,
// and nothing is written. Who is told what is decided here alone, so placescheck runs every option
function standPlan(w, pid, present) {
    if (!isObj(w) || !standId(pid) || (!w.standPic && !w.standHid)) return null;
    var seen = isObj(w.standSeen) ? Object.assign({}, w.standSeen) : {}, sceneOn = w.standScene !== false, keepOn = w.standJournal !== false, who = w.standWho;
    var plan = null;
    if (who === 'all') {
        if (w.standDone === true) return null;   // it went out once already: nobody sees it again, the stander included
        var to = [pid]; (Array.isArray(present) ? present : []).forEach(function(p) { if (standId(p) && to.indexOf(p) < 0) to.push(p); });
        to.forEach(function(p) { if (seen[p] !== 2) seen[p] = p === pid ? 2 : 1; });
        plan = { to: to, scene: sceneOn, keep: keepOn, seen: seen, done: true };
    } else if (who === 'once') {
        if (seen[pid]) return null;   // shown it before (stood there, or shown it with everyone): once is once
        seen[pid] = 2; plan = { to: [pid], scene: sceneOn, keep: keepOn, seen: seen };
    } else {
        var first = !seen[pid]; seen[pid] = 2;
        plan = { to: [pid], scene: sceneOn, keep: keepOn && first, seen: seen };   // every time; the Journal copy the first time only
    }
    var ks = Object.keys(plan.seen); if (ks.length > STAND_SEEN_MAX) { var cut = {}; ks.slice(-STAND_SEEN_MAX).forEach(function(k) { cut[k] = plan.seen[k]; }); plan.seen = cut; }
    return plan.scene || plan.keep ? plan : null;
}

export { NAME_MAX, LIST_MAX, ROW_BAND, DEFAULT_NAME, cleanPlaceName, cleanPlace, plainWall, placeKindOk, roomOf, destOf, placeAuto, placeTicked, placeDefault, placeOf, readingOrder, placesOn, placesSeenOnly, placeLines, placesSig, STAND_KEYS, standOk, cleanStand, standHolds, standPlan };
// Published for the scripts that may not import it (net.js, cleanup.js through main.js's import, places.js reads it either way)
if (typeof window !== 'undefined') window.wpPlaceCore = { NAME_MAX: NAME_MAX, LIST_MAX: LIST_MAX, ROW_BAND: ROW_BAND, DEFAULT_NAME: DEFAULT_NAME, cleanPlaceName: cleanPlaceName, cleanPlace: cleanPlace, plainWall: plainWall, placeKindOk: placeKindOk, roomOf: roomOf, destOf: destOf, placeAuto: placeAuto, placeTicked: placeTicked, placeDefault: placeDefault, placeOf: placeOf, readingOrder: readingOrder, placesOn: placesOn, placesSeenOnly: placesSeenOnly, placeLines: placeLines, placesSig: placesSig, STAND_KEYS: STAND_KEYS, standOk: standOk, cleanStand: cleanStand, standHolds: standHolds, standPlan: standPlan };
