/* rowsheetcore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 3, linked sheets; split 2026-11-18 with no change in behavior).
   What it holds: a row joined to a sheet (a list ticked Rows are sheets, vehicles fold (a)). How a list's sheets are set (cleanSheetsSpec,
   sheetsOn, sheetsAny); the rows that hold a sheet (sheetRows); the one judge of a join (rowSheetSet); a new sheet made from a row
   (sheetFromRow); where the sheets go after a trade (sheetsGo); the figures a player's copy reads (sheetFigs, cleanSk, rowWords); and the
   rows let go when a character is deleted (rowSheetsDrop). The resolver's Row.sheet.<name> read (sheetVal) stays in systemcore.js.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   rowSheetCore() at its line `// [split:rowsheetcore.js]`, so the body below runs in the old order. The body keeps its lines at the
   left margin inside the install function, unchanged, so that every test that reads systemcore.js (through tools/srcjoin.js, which puts
   these lines back) sees the old file. The first lines import what the body uses of systemcore.js; the last line hands back the names
   systemcore.js uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it
   still stood in systemcore.js. */
// [split:of systemcore.js]
import { CHAR_ID, CTRL_RE_G, FIELD_ID, LIMITS, LINK_NAME, ROW_ID, _linkSrc, activeCharOf, charsIn, fieldById, fin, hasOwn, isObj, linkNamesIn, makeResolver, rowDef, rowIdOf, str } from './systemcore.js';   // [split:glue]
export function rowSheetCore() {   // [split:glue]
// [split:body-start]
// 1.6.2 (vehicles, fold (a); docs/VEHICLE_COMBAT_DESIGN.md; the owner, 2026-11-04, by prompt: the sheet's picture and name stand on the row and a
// press opens it, its figures are columns reading Row.sheet.<name>; a new sheet is a copy of the list's template where it names one, else the
// system's defaults, takes the row's name, belongs to whoever owns the row and has the list's toggle switched on; a trade or a give takes the sheet
// with its row, but a player's character in play never moves, and that join is dropped): a list ticked Rows are sheets (sheets { on?, tpl? }) lets a
// row keep sh, the id of a character of the campaign, one sheet at one row at a time. Row.sheet.<name> reads that sheet live with this very system,
// one level deep, as a link reads one, and Row.sheet.has is 1 while it is joined; a player's copy reads the figures its host worked out (sk)
function sheetsOn(spec) { return isObj(spec) && isObj(spec.sheets); }
function sheetsAny(sys) { return !!(sys && Array.isArray(sys.fields) && sys.fields.some(function(f) { return isObj(f) && f.kind === 'item-list' && sheetsOn(f.list); })); }
function cleanSheetsSpec(v, gmView) { if (!isObj(v)) return null; var o = {}; if (typeof v.on === 'string' && FIELD_ID.test(v.on)) o.on = v.on; if (gmView && typeof v.tpl === 'string' && CHAR_ID.test(v.tpl)) o.tpl = v.tpl; return o; }   // tpl, a character of the campaign: the GM's view alone
function rowWords(sys, r) { var rd = isObj(r) ? rowDef(sys, r) : null; return isObj(r) && isObj(r.ov) && typeof r.ov.name === 'string' && r.ov.name ? r.ov.name : rd && isObj(rd.def) && typeof rd.def.name === 'string' ? rd.def.name : ''; }
// Every row joined to a sheet, [{ c, f, r }], none a row kept from its player
function sheetRows(sys, chars) {
    var out = []; if (!sys || !Array.isArray(sys.fields) || !isObj(chars)) return out;
    var fs = sys.fields.filter(function(f) { return isObj(f) && f.kind === 'item-list' && sheetsOn(f.list); }); if (!fs.length) return out;
    Object.keys(chars).forEach(function(id) { var c = chars[id]; if (!isObj(c) || c.partial === true || !isObj(c.values)) return; fs.forEach(function(f) { (Array.isArray(c.values[f.id]) ? c.values[f.id] : []).forEach(function(r) { if (isObj(r) && typeof r.sh === 'string' && r.hid !== 1) out.push({ c: c, f: f, r: r }); }); }); });
    return out;
}
// The one judge of a row's sheet, the GM's own and a player's on the host: { ok, values: { <field id>: the list as it is to be stored } } or
// { ok: false, reason, msg }. toId '' takes the sheet off. A player joins a row of their own character to a sheet of their own (the owner's answer to
// Q2); one sheet stands at one row at a time; a row is never its own sheet's
function rowSheetSet(sys, chars, c, fid, rowId, toId, opts) {
    opts = opts || {};
    var f = fieldById(sys, fid); if (!f || f.kind !== 'item-list' || !sheetsOn(f.list) || !isObj(c)) return { ok: false, reason: 'field', msg: 'That list does not join its rows to sheets.' };
    if (opts.player && (c.npc === true || !c.ownerId || c.ownerId !== opts.pid)) return { ok: false, reason: 'owner', msg: 'That row is not yours.' };
    var list = JSON.parse(JSON.stringify(isObj(c.values) && Array.isArray(c.values[fid]) ? c.values[fid] : [])), r = null;
    list.forEach(function(x) { if (!r && isObj(x) && rowIdOf(x) === rowId) r = x; });
    if (!r || (opts.player && r.hid === 1)) return { ok: false, reason: 'missing', msg: 'That row is not there now.' };
    var vals = {}; vals[fid] = list;
    if (toId === '' || toId === null || toId === undefined) { if (typeof r.sh !== 'string') return { ok: false, reason: 'same', msg: 'That row has no sheet.' }; delete r.sh; return { ok: true, values: vals }; }
    if (typeof toId !== 'string' || !CHAR_ID.test(toId)) return { ok: false, reason: 'value', msg: 'That is not a sheet.' };
    if (toId === c.id) return { ok: false, reason: 'value', msg: 'A row cannot be joined to the sheet it is on.' };
    var t = isObj(chars) && hasOwn(chars, toId) ? chars[toId] : null; if (!isObj(t) || t.partial === true) return { ok: false, reason: 'missing', msg: 'That sheet is not here now.' };
    if (opts.player && (t.npc === true || !t.ownerId || t.ownerId !== opts.pid || t.shared === 1)) return { ok: false, reason: 'owner', msg: 'You can join only a sheet of your own.' };
    if (r.sh === toId) return { ok: false, reason: 'same', msg: 'That row is joined to that sheet already.' };
    var by = null; sheetRows(sys, chars).forEach(function(h) { if (!by && h.r.sh === toId && !(h.c.id === c.id && h.f.id === fid && rowIdOf(h.r) === rowId)) by = h; });
    if (by) return { ok: false, reason: 'error', msg: (t.name || 'That sheet') + ' is joined to ' + (opts.player ? 'another row' : (rowWords(sys, by.r) || 'a row') + ' of ' + (by.c.name || 'another character')) + ' already. Take that join off first.' };
    r.sh = toId; return { ok: true, values: vals };
}
// A new sheet made from a row: a copy of the list's template where it names one that is here (its values, none of its rows' joins, and its
// picture), else the system's defaults; the row's name; the row's owner (an NPC's row makes an NPC); the list's toggle switched on. Pure: the caller
// gives the id, keeps it, and stamps its revision
function sheetFromRow(sys, chars, c, fid, r, id) {
    var f = fieldById(sys, fid), sp = f && isObj(f.list) ? f.list.sheets : null, tp = isObj(sp) && typeof sp.tpl === 'string' && isObj(chars) && hasOwn(chars, sp.tpl) && isObj(chars[sp.tpl]) && chars[sp.tpl].partial !== true ? chars[sp.tpl] : null;
    var nm = str(rowWords(sys, r), LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'New sheet';
    var o = { id: id, name: nm, ownerId: isObj(c) && c.npc !== true && typeof c.ownerId === 'string' ? c.ownerId : '', portrait: tp && typeof tp.portrait === 'string' ? tp.portrait : '', npc: !!(isObj(c) && c.npc === true), values: tp && isObj(tp.values) ? JSON.parse(JSON.stringify(tp.values)) : {}, updated: Date.now() };
    Object.keys(o.values).forEach(function(k) { if (Array.isArray(o.values[k])) o.values[k].forEach(function(x) { if (isObj(x)) delete x.sh; }); });
    var tg = isObj(sp) && typeof sp.on === 'string' ? fieldById(sys, sp.on) : null; if (tg && tg.kind === 'toggle') o.values[tg.id] = true;
    return o;
}
// After a trade or a give, the sheets of the rows a character received (values: its lists as they are to be stored, changed in place): each sheet
// goes to the receiver's player (to an NPC's receiver, as an NPC), unless it is a player's character in play or the receiver itself, whose join is
// dropped. Changes the sheets themselves; { drop: how many joins went, give: the ids of the sheets that changed hands }
function sheetsGo(sys, camp, to, values) {
    var out = { drop: 0, give: [] }, chars = charsIn(camp); if (!isObj(values) || !isObj(to)) return out;
    var own = to.npc === true ? '' : typeof to.ownerId === 'string' ? to.ownerId : '', npc = to.npc === true;
    Object.keys(values).forEach(function(fid) {
        var f = fieldById(sys, fid); if (!f || f.kind !== 'item-list' || !sheetsOn(f.list) || !Array.isArray(values[fid])) return;
        values[fid].forEach(function(r) {
            if (!isObj(r) || typeof r.sh !== 'string') return;
            var t = hasOwn(chars, r.sh) && isObj(chars[r.sh]) ? chars[r.sh] : null; if (!t) return;
            var inP = t.npc !== true && t.ownerId ? activeCharOf(camp, t.ownerId) : null;   // the character a player plays by the host's record, or the only one they have: never a guess
            if (t.id === to.id || (inP && inP.id === t.id && (inP.how === 'record' || inP.how === 'only'))) { if ((t.ownerId || '') !== own || t.id === to.id) { delete r.sh; out.drop++; } return; }
            if ((t.ownerId || '') === own && (t.npc === true) === npc) return;
            t.ownerId = own; t.npc = npc; t.updated = Date.now(); out.give.push(t.id);
        });
    });
    return out;
}
// "Only the figures read": the figures of the sheets a character's rows are joined to, worked out by the host with the view handed in through the
// link source (each sheet as its owner holds it for the players' view): { <row id>: { id, name, v: { <name>: value } } } or null
function sheetFigs(sys, char, F) {
    if (!sheetsAny(sys) || !isObj(char) || !isObj(char.values) || !F || !_linkSrc) return null;
    var names = linkNamesIn(sys, 'Row.sheet'), out = null;
    sys.fields.forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || !sheetsOn(f.list)) return;
        (Array.isArray(char.values[f.id]) ? char.values[f.id] : []).forEach(function(r) {
            if (!isObj(r) || typeof r.sh !== 'string' || !CHAR_ID.test(r.sh) || r.sh === char.id || r.hid === 1) return;
            var o = null; try { o = _linkSrc(r.sh, sys); } catch (e) { o = null; } if (!isObj(o) || o.id !== r.sh) return;
            var rr = makeResolver(sys, o, F, { linkDepth: 1 }), v = {};   // a plain object: it travels (the wire's packer reads a prototype)
            names.forEach(function(w) { var x; try { x = rr(w); } catch (e) { x = undefined; } if (typeof x === 'number' && fin(x)) v[w] = x; else if (typeof x === 'boolean') v[w] = x; });
            (out = out || {})[rowIdOf(r)] = { id: r.sh, name: str(o.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', v: v };
        });
    });
    return out;
}
function cleanSk(raw, sys) {
    if (!isObj(raw) || !sheetsAny(sys)) return null;
    var out = null;
    Object.keys(raw).slice(0, LIMITS.carried).forEach(function(rid) {
        if (!ROW_ID.test(rid) || rid in Object.prototype) return; var e = raw[rid]; if (!isObj(e) || typeof e.id !== 'string' || !CHAR_ID.test(e.id)) return;
        var v = {}, n = 0, src = isObj(e.v) ? e.v : {};   // a plain object, named only by names no prototype holds
        Object.keys(src).forEach(function(w) { if (n >= LIMITS.linkNames || !LINK_NAME.test(w) || w === 'has' || w in Object.prototype) return; var x = src[w]; if (typeof x === 'number' && fin(x)) { v[w] = x; n++; } else if (typeof x === 'boolean') { v[w] = x; n++; } });
        (out = out || {})[rid] = { id: e.id, name: str(e.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', v: v };
    });
    return out;
}
// A character gone: every row joined to it lets it go. The ids of the characters whose rows changed
function rowSheetsDrop(sys, chars, id) {
    var out = []; if (typeof id !== 'string') return out;
    sheetRows(sys, chars).forEach(function(h) { if (h.r.sh === id) { delete h.r.sh; if (out.indexOf(h.c.id) < 0) out.push(h.c.id); } });
    return out;
}
// [split:body-end]
return { cleanSheetsSpec: cleanSheetsSpec, cleanSk: cleanSk, rowSheetSet: rowSheetSet, rowSheetsDrop: rowSheetsDrop, rowWords: rowWords, sheetFigs: sheetFigs, sheetFromRow: sheetFromRow, sheetRows: sheetRows, sheetsAny: sheetsAny, sheetsGo: sheetsGo, sheetsOn: sheetsOn };   // [split:glue]
}   // [split:glue]
