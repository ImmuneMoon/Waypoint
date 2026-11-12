/* Containers (1.6.2, backlog 42; the owner, 2026-11-12, by prompt after a drawn sheet: "A. Any piece, by a tick", "A. Next to it, a roll if
   locked", "A. Tiles, like a crate", "A. You mark it; a system may too"). The pure half. A container is a piece of the play map with Holds items
   ticked (the piece's key box, a box id); its items live in camp.boxes under that id, the GM's own, as a sheet with no player would hold them:
   { id, values: { <item list field id>: rows } }. They never stand in camp.chars, so no list of characters, time rule, rest or fight meets
   one. Every change of a container's items goes through systemcore applyRowOp on a stand-in sheet (boxChar), so a list's own rules and caps
   hold. Only the item lists ticked Tradable that players see may hold a container's items, since a player takes them into the same list of
   their own sheet, as a trade moves a row. */

import { cleanChar, rowDef, rowIdOf, fieldById, cleanPic, rowKeptFrom, tradeOfferable, makeResolver, tradeCarry } from './systemcore.js';

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
// Its lock (fold 2b): { on, rolls, key }. on only as true; rolls the ids of up to LOCK_ROLLS of the system's rolls, never its initiative roll;
// key the id of an item or a library entry a character may carry. A lock with nothing left is none. Its rolls and key stay while it is
// unlocked, so locking it again keeps them
var LOCK_ROLLS = 3, KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
function cleanLock(v, sys) {
    if (!isObj(v)) return null;
    var ids = map(); (isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (lockRollOk(r)) ids[r.id] = 1; });
    var rolls = []; (Array.isArray(v.rolls) ? v.rolls.slice(0, 12) : []).forEach(function(id) { if (typeof id === 'string' && ids[id] === 1 && rolls.indexOf(id) < 0 && rolls.length < LOCK_ROLLS) rolls.push(id); });
    var out = {}; if (v.on === true) out.on = true; if (rolls.length) out.rolls = rolls; if (typeof v.key === 'string' && KEY_ID.test(v.key)) out.key = v.key;
    return Object.keys(out).length ? out : null;
}
function lockRollOk(r) { return isObj(r) && typeof r.id === 'string' && r.init !== true && typeof r.formula === 'string' && !!r.formula && !Array.isArray(r.apply); }   // a roll, never the initiative roll nor an apply action (the review)
function boxLocked(box) { return isObj(box) && isObj(box.lock) && box.lock.on === true; }
// The row of a character's own that is its key: an item list players see, never a row kept from them (a GM-only entry, a kept curse:
// the review), since its name is sent to the player
function keyRowOf(ch, key, sys) {
    if (!isObj(ch) || !isObj(ch.values) || typeof key !== 'string' || !key || !isObj(sys)) return null; var hit = null;
    Object.keys(ch.values).some(function(k) { var f = fieldById(sys, k), rows = ch.values[k]; return !!f && f.kind === 'item-list' && f.vis === 'all' && Array.isArray(rows) && rows.some(function(r) { if (isObj(r) && r.defId === key && !(Number(r.qty) <= 0) && !rowKeptFrom(sys, r)) { hit = r; return true; } return false; }); });
    return hit;
}
// What a key is called, as its carrier's sheet names it
function keyName(sys, row) { if (!isObj(row)) return ''; var rd = rowDef(sys, row), d = rd && rd.def ? rd.def : null; return String((isObj(row.ov) && typeof row.ov.name === 'string' && row.ov.name) || (d && d.name) || 'Key').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80); }
// Fold 2c: the takes a container remembers, the newest first, TAKEN_MAX at most, so the GM may put one back: { id, at, ch, by, lines },
// each line the row the take landed in on the character (fid, rowId), how many came (qty) and its name. tell false: the GM puts things
// back without a line to the player (on by default). Never sent: the store is the GM's
var TAKEN_MAX = 10, TAKE_ID = /^t_[A-Za-z0-9]{4,20}$/, CH_ID = /^[A-Za-z0-9_-]{1,64}$/;
function txt(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : ''; }
function cleanTaken(v) {
    var out = []; (Array.isArray(v) ? v.slice(0, 40) : []).forEach(function(r) {
        if (out.length >= TAKEN_MAX || !isObj(r) || typeof r.id !== 'string' || !TAKE_ID.test(r.id) || typeof r.ch !== 'string' || !CH_ID.test(r.ch)) return;
        var lines = (Array.isArray(r.lines) ? r.lines.slice(0, 40) : []).map(function(l) { if (!isObj(l) || typeof l.fid !== 'string' || typeof l.rowId !== 'string' || !l.fid || !l.rowId) return null; var q = Math.floor(Number(l.qty)); return q >= 1 && q <= 1e6 ? { fid: l.fid.slice(0, 64), rowId: l.rowId.slice(0, 64), qty: q, name: txt(l.name, 120) || 'Item' } : null; }).filter(Boolean);
        if (!lines.length) return; out.push({ id: r.id, at: typeof r.at === 'number' && isFinite(r.at) && r.at > 0 ? Math.floor(r.at) : 0, ch: r.ch, by: txt(r.by, 80) || 'A character', lines: lines });
    });
    return out;
}
function rowQtyIn(f, r) { return f && isObj(f.list) && f.list.noQty ? 1 : (Math.floor(Number(r.qty)) >= 1 ? Math.floor(Number(r.qty)) : 1); }
// What a take gave the character: each row of the lists it changed that is new or holds more than before, by how much
function takenLines(sys, before, after) {
    var out = []; if (!isObj(after)) return out;
    Object.keys(after).forEach(function(fid) {
        var f = fieldById(sys, fid), was = map(); if (!f || !Array.isArray(after[fid])) return;
        (isObj(before) && Array.isArray(before[fid]) ? before[fid] : []).forEach(function(r) { if (isObj(r)) was[rowIdOf(r)] = rowQtyIn(f, r); });
        after[fid].forEach(function(r) { if (!isObj(r) || r.hid === 1) return; var id = rowIdOf(r), d = rowQtyIn(f, r) - (was[id] || 0); if (d < 1) return; var rd = rowDef(sys, r); out.push({ fid: fid, rowId: id, qty: d, name: txt((isObj(r.ov) && typeof r.ov.name === 'string' && r.ov.name) || (rd && rd.def && rd.def.name) || 'Item', 120) }); });
    });
    return out.slice(0, 40);
}
// What of a take can go back: each line's row on the character as it is now, as much as it still holds and no more than came. Only a row the
// trade itself would offer from them (the review): a row granted with another goes back with it, and one kept on them stays; nor a row that
// now holds parts of their own, which would go with it. Answers { lines, gone, held }: the trade's lines, how many lines found nothing left,
// and how many stay for one of those reasons
function putBackPlan(sys, ch, rec) {
    var lines = [], gone = 0, held = 0; if (!isObj(rec) || !Array.isArray(rec.lines)) return { lines: lines, gone: 0, held: 0 };
    var offer = map(), mine = map(); (typeof tradeOfferable === 'function' && isObj(ch) ? tradeOfferable(sys, ch, 'gm') : []).forEach(function(o) { offer[o.fid + '|' + o.rowId] = o; }); rec.lines.forEach(function(l) { mine[l.rowId] = 1; });
    var holdsOwn = function(id) { return isObj(ch) && isObj(ch.values) && Object.keys(ch.values).some(function(k) { return Array.isArray(ch.values[k]) && ch.values[k].some(function(x) { return isObj(x) && x.in === id && !mine[rowIdOf(x)]; }); }); };
    rec.lines.forEach(function(l) { var f = fieldById(sys, l.fid), rows = isObj(ch) && isObj(ch.values) && Array.isArray(ch.values[l.fid]) ? ch.values[l.fid] : [], r = rows.filter(function(x) { return isObj(x) && rowIdOf(x) === l.rowId && x.hid !== 1; })[0]; if (!f || !r) { gone++; return; } var o = offer[l.fid + '|' + l.rowId]; if (!o || o.no || holdsOwn(l.rowId)) { if (!(isObj(r) && typeof r.gr === 'string' && mine[r.gr])) held++; return; } lines.push({ fid: l.fid, rowId: l.rowId, qty: Math.min(l.qty, o.qty || rowQtyIn(f, r)) }); });
    return { lines: lines, gone: gone, held: held };
}
// Fold 3 (the owner, 2026-11-12: "A. You mark it; a system may too"): a fallen NPC is searched as a container is. Only a sheet with no player;
// lootable where the GM ticked Can be looted (the character's loot) or the system's rule holds on its sheet (combat.loot.if, the GM's view
// alone, a formula of the NPC's own names). The rows the GM ticks Never looted (the character's noLoot, row ids) never show
function bodyNpc(ch) { return isObj(ch) && ch.making !== 1 && !ch.partial && (ch.npc === true || !(typeof ch.ownerId === 'string' && ch.ownerId)); }
function bodyLootable(sys, ch, F) {
    if (!bodyNpc(ch)) return false; if (ch.loot === true) return true;
    var rule = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.loot) && typeof sys.combat.loot['if'] === 'string' ? sys.combat.loot['if'] : '';
    if (!rule || !F || typeof F.evaluate !== 'function') return false;
    var r; try { r = F.evaluate(rule, { vars: makeResolver(sys, ch, F, null), random: function() { return 1; } }); } catch (e) { return false; }
    return !!(r && r.ok && (r.value === true || (typeof r.value === 'number' && r.value !== 0)));
}
// The review of fold 3a: a row taken whole takes what hangs on it (the rows it granted, its parts, theirs: systemcore tradeCarry). From a body it
// may be taken only where none of those is Never looted, kept from players, a GM-only entry or in a list that cannot be looted
function bodyOfferOk(sys, ch, rowId) {
    if (!bodyNpc(ch) || typeof rowId !== 'string') return false; var nl = noLootOf(ch), ok = map(); boxLists(sys).forEach(function(f) { ok[f.id] = 1; });
    if (nl[rowId] === 1) return false;
    return tradeCarry(sys, ch.values, rowId).every(function(k) { var d = rowDef(sys, k.row), id = rowIdOf(k.row); return ok[k.f] === 1 && nl[id] !== 1 && k.row.hid !== 1 && !!(d && isObj(d.def)) && d.def.vis !== 'gm'; });
}
function noLootOf(ch) { var m = map(); (isObj(ch) && Array.isArray(ch.noLoot) ? ch.noLoot : []).forEach(function(id) { if (typeof id === 'string') m[id] = 1; }); return m; }
function cleanBox(raw, sys, id) {
    if (!isObj(raw) || !boxIdOk(id) || (raw.id !== undefined && raw.id !== id)) return null;
    var keep = map(); (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (isObj(f) && f.kind === 'item-list' && typeof f.id === 'string') keep[f.id] = 1; });
    var vin = map(); if (isObj(raw.values)) Object.keys(raw.values).forEach(function(k) { if (keep[k] && Array.isArray(raw.values[k])) vin[k] = raw.values[k]; });
    var c = cleanChar({ id: id, name: 'Container', npc: true, values: vin }, sys, { state: 'host' }), out = { id: id, values: {} };
    if (c && isObj(c.values)) Object.keys(c.values).forEach(function(k) { if (keep[k] && Array.isArray(c.values[k]) && c.values[k].length) out.values[k] = c.values[k]; });
    var lk = cleanLock(raw.lock, sys); if (lk) out.lock = lk;   // fold 2b
    var tk = cleanTaken(raw.taken); if (tk.length) out.taken = tk; if (raw.tell === false) out.tell = false;   // fold 2c
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
            out.push({ fid: f.id, list: f.label || f.key || '', rowId: rowIdOf(r), name: (isObj(r.ov) && typeof r.ov.name === 'string' && r.ov.name) || d.name || 'Item', qty: f.list && f.list.noQty ? 1 : Math.max(1, r.qty | 0), icon: typeof d.icon === 'string' ? d.icon : '', notes: typeof d.notes === 'string' ? d.notes : '', cat: typeof d.category === 'string' ? d.category : '', pic: cleanPic(r.pic) || cleanPic(d.pic) });   // the row's own picture, else its item's
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
// A row's own picture, set by the GM on a container's tile (none takes it off, the item's own showing again). Answers { ok, values }
function boxPic(sys, box, fid, rowId, path) {
    var f = fieldById(sys, fid); if (!f || boxLists(sys).indexOf(f) < 0 || !isObj(box) || !isObj(box.values) || !Array.isArray(box.values[fid])) return { ok: false, reason: 'list' };
    var p = path ? cleanPic(path) : ''; if (path && !p) return { ok: false, reason: 'pic' };
    var v = JSON.parse(JSON.stringify(box.values)), r = v[fid].filter(function(x) { return isObj(x) && rowIdOf(x) === rowId; })[0]; if (!r) return { ok: false, reason: 'gone' };
    if (p) r.pic = p; else delete r.pic;
    return { ok: true, values: v };
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
function boxesOf(store, items) { var out = map(), named = boxesNamed(items); if (isObj(store)) Object.keys(named).forEach(function(id) { if (Object.prototype.hasOwnProperty.call(store, id)) { out[id] = JSON.parse(JSON.stringify(store[id])); delete out[id].taken; delete out[id].tell; } }); return out; }   // a part exported for another campaign carries no record of who took what (the review of fold 2c)
// [boxcheck:core-end]

if (typeof window !== 'undefined') window.wpBoxCore = { bodyNpc: bodyNpc, bodyLootable: bodyLootable, bodyOfferOk: bodyOfferOk, noLootOf: noLootOf, TAKEN_MAX: TAKEN_MAX, cleanTaken: cleanTaken, takenLines: takenLines, putBackPlan: putBackPlan, LOCK_ROLLS: LOCK_ROLLS, lockRollOk: lockRollOk, cleanLock: cleanLock, boxLocked: boxLocked, keyRowOf: keyRowOf, keyName: keyName, BOX_MAX: BOX_MAX, boxPic: boxPic, boxPieceOk: boxPieceOk, boxesNamed: boxesNamed, boxesTidy: boxesTidy, boxesOf: boxesOf, boxLists: boxLists, boxIdOk: boxIdOk, newBoxId: newBoxId, cleanBox: cleanBox, cleanBoxes: cleanBoxes, boxChar: boxChar, boxTiles: boxTiles, boxCount: boxCount, boxOp: boxOp };
export { bodyNpc, bodyLootable, bodyOfferOk, noLootOf, TAKEN_MAX, cleanTaken, takenLines, putBackPlan, LOCK_ROLLS, lockRollOk, cleanLock, boxLocked, keyRowOf, keyName, BOX_MAX, boxPic, boxPieceOk, boxesNamed, boxesTidy, boxesOf, boxLists, boxIdOk, newBoxId, cleanBox, cleanBoxes, boxChar, boxTiles, boxCount, boxOp };
