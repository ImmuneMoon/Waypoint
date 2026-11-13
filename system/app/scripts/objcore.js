/* Map objects, the pure half (1.6.0; the owner, 2026-10-31: "a dedicated section for items that you can use on a map that are recognized based on
   what they are and give cover", by prompt: "A row in Add", "The grade it says", and of where the list is kept, "with the system as long as the ones
   added to a campaign by the GM arent shown in other campaigns by default, but can be imported into them still").

   An object is a thing the GM places: a name, a picture or none, a grade of cover, and whether it blocks sight or stops tokens. A system's own set
   is sys.objects, kept in the GM's view alone, and the GM's own are camp.objects: each campaign holds its own, so an object made in one is seen in
   no other until it is imported, and a system file or a build that replaces a system leaves them as they are. A placed object is an ordinary piece
   with its values on it (objProps): a table gives cover because it is a table, not because of its size. Nothing here reads a save or the page.

   The shape has room for what comes later (interactions such as sitting in a chair, a box the GM sets as openable, what a box holds): a later key
   joins cleanObj and objProps, and an object from before it reads as having none. */
import { cleanTexSrc, cleanCoverPro } from './fogcore.js';
import { cleanFurn, furnKind, furnWords } from './furncore.js';   // 1.6.2 (backlog 222): the furnishing kinds an object may give its rules to

export var OBJ_MAX = 2000;
var NAME_MAX = 60, CELLS_MAX = 12, ID_RE = /^[A-Za-z0-9_-]{1,40}$/, HEX_RE = /^#[0-9a-fA-F]{6}$/;
export var OBJ_GRADES = ['half', 'threeq', 'total'];
var GRADE_WORDS = { half: 'Half cover', threeq: 'Three-quarters cover', total: 'Total cover' };
var LAND_COLOR = '#6b5b45';

function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
function cleanName(v) {
    if (typeof v !== 'string') return '';
    var t = Array.from(v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim());
    return (t.length > NAME_MAX ? t.slice(0, NAME_MAX).join('').trim() : t.join(''));
}
function cells(v) { return typeof v === 'number' && isFinite(v) && v >= 1 ? Math.min(CELLS_MAX, Math.floor(v)) : 1; }
// One object as it is kept, or null. A key that says nothing is left out, so an object of one name is one name
export function cleanObj(o) {
    if (!isObj(o)) return null;
    var id = own(o, 'id'), name = cleanName(own(o, 'name'));
    if (typeof id !== 'string' || !ID_RE.test(id) || !name) return null;
    var out = { id: id, name: name }, src = cleanTexSrc(own(o, 'src')), cv = own(o, 'cover'), w = cells(own(o, 'w')), h = cells(own(o, 'h')), col = own(o, 'color');
    if (src) out.src = src;
    if (OBJ_GRADES.indexOf(cv) >= 0) out.cover = cv;
    var pro = cleanCoverPro(own(o, 'pro')); if (pro) out.pro = pro;   // 1.6.2: its Protection, read as TargetCoverPro where it stands on the line
    var fk = own(o, 'furn'); if (typeof fk === 'string' && furnKind(fk)) out.furn = fk;   // 1.6.2 (backlog 222): the furnishing kind it gives its rules to (the owner: "The system says")
    if (own(o, 'sight') === true) out.sight = true; else if (own(o, 'stops') === true) out.stops = true;   // what blocks sight stops tokens already
    if (w > 1) out.w = w;
    if (h > 1) out.h = h;
    if (!out.src && typeof col === 'string' && HEX_RE.test(col)) out.color = col.toLowerCase();
    return out;
}
// A list as it is kept: each id once, the first of a name's ids kept, OBJ_MAX at most. Anything else is an empty list
export function cleanObjects(v) {
    if (!Array.isArray(v)) return [];
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < OBJ_MAX; i++) { var o = cleanObj(v[i]); if (o && !seen[o.id]) { seen[o.id] = 1; out.push(o); } }
    return out;
}
// What a placed object is: an ordinary piece's own keys, by whitelist. One grid cell is the map's own (cell: { w, h }, from its lattice), else 50 px
// on squares and 60 by 52 on hexagons, as a token's is.
// A piece that blocks sight is a wall, which gives total cover by itself; any other gives the grade it says, or none at all where it says none
function cellW(hex, cell) { return cell && typeof cell.w === 'number' && cell.w > 0 ? cell.w : hex ? 60 : 50; }
function cellH(hex, cell) { return cell && typeof cell.h === 'number' && cell.h > 0 ? cell.h : hex ? 52 : 50; }
export function objProps(o, hex, cell) {
    var c = cleanObj(o); if (!c) return null;
    var p = { name: c.name, w: (c.w || 1) * cellW(hex, cell), h: (c.h || 1) * cellH(hex, cell), layer: 'back-mid', mobj: true };   // backlog 231: a placed map object, which characters move, is never a map's structure   // 1.6.2: over the map's own pictures and under the tokens, so a character stands over a crate it stands at (the owner, 2026-11-02: why is this over the character)
    if (c.src) p.src = c.src; else p.color = c.color || LAND_COLOR;
    if (c.pro) p.coverPro = c.pro;
    if (c.sight) { p.blocksSight = true; p.sightType = 'wall'; } else {
        if (c.stops) p.barrier = true;
        if (c.cover) { p.cover = 'yes'; p.coverAs = c.cover; } else p.cover = 'no';
    }
    return p;
}
export function objType(o) { var c = cleanObj(o); return c && c.src ? 'image' : 'rect'; }
// What it does, in the row's own words
export function objWords(o) {
    var c = cleanObj(o); if (!c) return '';
    var w = [c.sight ? 'Blocks sight' : c.cover ? GRADE_WORDS[c.cover] : 'No cover'];
    if (c.furn) w.unshift('Rules for ' + furnKind(c.furn).label);
    if (c.pro) w.push('Protection ' + c.pro);
    if (c.stops) w.push('Stops tokens');
    if ((c.w || 1) > 1 || (c.h || 1) > 1) w.push((c.w || 1) + ' by ' + (c.h || 1) + ' cells');
    return w.join(' · ');
}
// An id no object of these lists holds, from a number the caller rolled
export function objId(lists, n) {
    var seen = Object.create(null); (Array.isArray(lists) ? lists : []).forEach(function(l) { (Array.isArray(l) ? l : []).forEach(function(o) { if (isObj(o) && typeof o.id === 'string') seen[o.id] = 1; }); });
    var base = 'o_' + (Math.abs(Math.floor(Number(n) || 0)) % 2176782336).toString(36), id = base, i = 1;
    while (seen[id]) id = base + '_' + (i++);
    return id;
}
// A list with an object of another campaign taken in, under a new id. The same object is not taken twice: { list, same: true }
export function objTake(list, o, id) {
    var l = cleanObjects(list), c = cleanObj(o); if (!c) return { list: l };
    if (l.some(function(x) { return x.name === c.name && (x.src || '') === (c.src || ''); })) return { list: l, same: true };
    if (l.length >= OBJ_MAX) return { list: l, full: true };
    c.id = id; l.push(c);
    return { list: cleanObjects(l), took: true };
}

// [furncheck:rules-start]
// 1.6.2 (backlog 222; the owner, 2026-11-12, by prompt: "The system says"): a furnishing's rules are a map object's that names its kind, the
// first such in the lists handed in, the system's set before the campaign's own. A pack, and the drawing, never carry rules
export function furnRule(lists, k) {
    if (!furnKind(k)) return null;
    var L = Array.isArray(lists) ? lists : [];
    for (var i = 0; i < L.length; i++) { var l = cleanObjects(L[i]); for (var j = 0; j < l.length; j++) if (l[j].furn === k) return l[j]; }
    return null;
}
// What a placed furnishing is: a picture piece that keeps its kind, its version and its tint, drawn by every machine from those words. With a
// rule it takes the rule's own keys (objProps) and the rule's size where the rule names one, else the kind's own. With none it is a plain picture
// over the map's pictures and under the tokens, with no key of cover, so the system's own rule for pictures says what it gives
export function furnProps(f, lists, hex, cell, src) {
    var c = cleanFurn(f); if (!c) return null;
    var rule = furnRule(lists, c.k), it = furnKind(c.k), p = rule ? objProps(rule, hex, cell) : { name: furnWords(c), layer: 'back-mid' };
    delete p.src; delete p.color;
    var cw = rule && (rule.w > 1 || rule.h > 1) ? [rule.w || 1, rule.h || 1] : [it.w, it.h];
    p.w = cw[0] * cellW(hex, cell); p.h = cw[1] * cellH(hex, cell);   // the map's own cell (backlog 38), so a one-cell chest fills one cell
    var ps = c.pack && src ? cleanTexSrc(src) : null; if (ps) p.src = ps; else delete c.pack;   // fold 2: a pack's picture, the piece's own from now on
    p.furn = c; p.color = 'transparent'; p.fit = true;   // fit: the box keeps the size it is given, never the drawing's own proportions
    return p;
}
// [furncheck:rules-end]

var API = { OBJ_MAX: OBJ_MAX, OBJ_GRADES: OBJ_GRADES, cleanObj: cleanObj, cleanObjects: cleanObjects, objProps: objProps, objType: objType, objWords: objWords, objId: objId, objTake: objTake, furnRule: furnRule, furnProps: furnProps };
if (typeof window !== 'undefined') window.wpObjCore = API;
