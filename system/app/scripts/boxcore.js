/* Containers (1.6.2, backlog 42; the owner, 2026-11-12, by prompt after a drawn sheet: "A. Any piece, by a tick", "A. Next to it, a roll if
   locked", "A. Tiles, like a crate", "A. You mark it; a system may too"). The pure half. A container is a piece of the play map with Holds items
   ticked (the piece's key box, a box id); its items live in camp.boxes under that id, the GM's own, as a sheet with no player would hold them:
   { id, values: { <item list field id>: rows } }. They never stand in camp.chars, so no list of characters, time rule, rest or fight meets
   one. Every change of a container's items goes through systemcore applyRowOp on a stand-in sheet (boxChar), so a list's own rules and caps
   hold. Only the item lists ticked Tradable that players see may hold a container's items, since a player takes them into the same list of
   their own sheet, as a trade moves a row. */

import { cleanChar, rowDef, rowIdOf, fieldById } from './systemcore.js';

// [boxcheck:core-start]
var BOX_ID = /^c_bx[A-Za-z0-9]{4,20}$/, BOX_MAX = 500;
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function map() { return Object.create(null); }
// The lists a container may hold: the system's item lists ticked Tradable that players see, the builder's own word for things that change hands
function boxLists(sys) { return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && f.vis === 'all' && isObj(f.list) && f.list.trade === true && typeof f.id === 'string'; }); }
function boxIdOk(id) { return typeof id === 'string' && BOX_ID.test(id) && !(id in Object.prototype); }
// A new box id from a source of letters (a test hands one in); never one the store already holds
function newBoxId(rand, have) { for (var n = 0; n < 50; n++) { var s = ''; for (var i = 0; i < 10; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor((rand ? rand() : 0) * 36) % 36); var id = 'c_bx' + s; if (!(have && Object.prototype.hasOwnProperty.call(have, id))) return id; } return null; }
// One container, cleaned as a sheet with no player would be. Every item list of the system is kept, so a list unticked Tradable for a while
// loses nothing (the review): only the lists boxLists names are shown and changed. None for what is not one
function cleanBox(raw, sys, id) {
    if (!isObj(raw) || !boxIdOk(id) || (raw.id !== undefined && raw.id !== id)) return null;
    var keep = map(); (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (isObj(f) && f.kind === 'item-list' && typeof f.id === 'string') keep[f.id] = 1; });
    var vin = map(); if (isObj(raw.values)) Object.keys(raw.values).forEach(function(k) { if (keep[k] && Array.isArray(raw.values[k])) vin[k] = raw.values[k]; });
    var c = cleanChar({ id: id, name: 'Container', npc: true, values: vin }, sys, { state: 'host' }), out = { id: id, values: {} };
    if (c && isObj(c.values)) Object.keys(c.values).forEach(function(k) { if (keep[k] && Array.isArray(c.values[k]) && c.values[k].length) out.values[k] = c.values[k]; });
    return out;
}
// The store: an object with no prototype by box id, BOX_MAX at most. Anything else none
function cleanBoxes(raw, sys) {
    var out = map(); if (!isObj(raw)) return out; var n = 0;
    Object.keys(raw).forEach(function(id) { if (n >= BOX_MAX) return; var b = cleanBox(raw[id], sys, id); if (b) { out[id] = b; n++; } });
    return out;
}
// A stand-in sheet for applyRowOp and tradeApply: an NPC with no player, holding a copy of the container's items
function boxChar(box) { return { id: box.id, name: 'Container', npc: true, ownerId: '', values: JSON.parse(JSON.stringify(isObj(box.values) ? box.values : {})) }; }
// The tiles a container shows: each row of each list it may hold, in list order, its name, count, icon and notes as the system or the row
// says. A row kept out of sight (hid) is not shown
function boxTiles(sys, box) {
    var out = []; if (!isObj(box) || !isObj(box.values)) return out;
    boxLists(sys).forEach(function(f) {
        var rows = box.values[f.id]; if (!Array.isArray(rows)) return;
        rows.forEach(function(r) {
            if (!isObj(r) || r.hid === 1) return; var rd = rowDef(sys, r), d = rd && rd.def ? rd.def : null; if (!d) return;
            out.push({ fid: f.id, list: f.label || f.key || '', rowId: rowIdOf(r), name: (isObj(r.ov) && typeof r.ov.name === 'string' && r.ov.name) || d.name || 'Item', qty: f.list && f.list.noQty ? 1 : Math.max(1, r.qty | 0), icon: typeof d.icon === 'string' ? d.icon : '', notes: typeof d.notes === 'string' ? d.notes : '', cat: typeof d.category === 'string' ? d.category : '' });
        });
    });
    return out;
}
function boxCount(sys, box) { return boxTiles(sys, box).reduce(function(s, t) { return s + t.qty; }, 0); }
// A change of a container's items: a row op through the one rule a sheet's own change goes through, on the stand-in sheet. Answers
// { ok, values } with the container's whole values after it, or { ok: false, reason }
function boxOp(sys, box, fid, q, F, applyRowOp) {
    var f = fieldById(sys, fid); if (!f || boxLists(sys).indexOf(f) < 0) return { ok: false, reason: 'list' };
    if (isObj(q) && q.op === 'add' && typeof q.defId === 'string') { var rq = rowDef(sys, { defId: q.defId }); if (rq && rq.def && rq.def.vis === 'gm') return { ok: false, reason: 'gm' }; }   // never a GM-only entry: players will take what a container holds (the review)
    var ch = boxChar(box), r = applyRowOp(sys, ch, fid, q, F, {}); if (!r || !r.ok) return { ok: false, reason: r && r.reason || 'value' };
    var v = ch.values; if (Array.isArray(r.value)) v[fid] = r.value;
    if (isObj(r.also)) Object.keys(r.also).forEach(function(k) { var fa = fieldById(sys, k); if (Array.isArray(r.also[k]) && fa && fa.kind === 'item-list') v[k] = r.also[k]; });
    var out = map(); Object.keys(v).forEach(function(k) { if (Array.isArray(v[k]) && v[k].length) out[k] = v[k]; });
    return { ok: true, values: out };
}
// A piece that may hold items: a picture or a plain shape, a map object among them, never a token, a waiting token, a wall, a door, a painted
// cell, a text box, a drawing, a trigger zone, a light, a GM note card or a room's area. A piece that only stops movement may (a crate)
var BOX_TYPES = { image: 1, rect: 1, square: 1, circle: 1, hexagon: 1, hex: 1, diamond: 1 };
function boxPieceOk(w) { return isObj(w) && !!BOX_TYPES[w.type] && !w.isChar && !w.waiting && !w.gmNoteFor && !w.fill && w.blocksSight !== true && w.sightType !== 'door' && w.roomArea !== true; }
// The ids the pieces of these items name, an object with no prototype
function boxesNamed(items) { var out = map(); (isObj(items) ? Object.keys(items).map(function(k) { return items[k]; }) : Array.isArray(items) ? items : []).forEach(function(it) { if (!isObj(it) || !Array.isArray(it.whiteboard)) return; it.whiteboard.forEach(function(w) { if (isObj(w) && boxIdOk(w.box)) out[w.box] = 1; }); }); return out; }
// A campaign tidied at a load (the review): a container no piece names goes, so the store holds live ones alone, and a piece whose box is not in
// the store, or that may no longer hold items, holds none. Answers how many of each went
function boxesTidy(camp) {
    var out = { boxes: 0, pieces: 0 }; if (!isObj(camp)) return out; var store = isObj(camp.boxes) ? camp.boxes : null, named = boxesNamed(camp.items);
    if (store) Object.keys(store).forEach(function(id) { if (!named[id]) { delete store[id]; out.boxes++; } });
    (isObj(camp.items) ? Object.keys(camp.items) : []).forEach(function(k) { var it = camp.items[k]; if (!isObj(it) || !Array.isArray(it.whiteboard)) return; it.whiteboard.forEach(function(w) { if (isObj(w) && w.box !== undefined && !(boxIdOk(w.box) && store && Object.prototype.hasOwnProperty.call(store, w.box) && boxPieceOk(w))) { delete w.box; out.pieces++; } }); });
    return out;
}
// What a part of a campaign carries (an export of a map): the containers its pieces name, copied
function boxesOf(store, items) { var out = map(), named = boxesNamed(items); if (isObj(store)) Object.keys(named).forEach(function(id) { if (Object.prototype.hasOwnProperty.call(store, id)) out[id] = JSON.parse(JSON.stringify(store[id])); }); return out; }
// [boxcheck:core-end]

if (typeof window !== 'undefined') window.wpBoxCore = { BOX_MAX: BOX_MAX, boxPieceOk: boxPieceOk, boxesNamed: boxesNamed, boxesTidy: boxesTidy, boxesOf: boxesOf, boxLists: boxLists, boxIdOk: boxIdOk, newBoxId: newBoxId, cleanBox: cleanBox, cleanBoxes: cleanBoxes, boxChar: boxChar, boxTiles: boxTiles, boxCount: boxCount, boxOp: boxOp };
export { BOX_MAX, boxPieceOk, boxesNamed, boxesTidy, boxesOf, boxLists, boxIdOk, newBoxId, cleanBox, cleanBoxes, boxChar, boxTiles, boxCount, boxOp };
