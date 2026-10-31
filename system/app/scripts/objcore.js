/* Map objects, the pure half (1.6.0; the owner, 2026-10-31: "a dedicated section for items that you can use on a map that are recognized based on
   what they are and give cover", by prompt: "A row in Add", "The grade it says", and of where the list is kept, "with the system as long as the ones
   added to a campaign by the GM arent shown in other campaigns by default, but can be imported into them still").

   An object is a thing the GM places: a name, a picture or none, a grade of cover, and whether it blocks sight or stops tokens. A system's own set
   is sys.objects, kept in the GM's view alone, and the GM's own are camp.objects: each campaign holds its own, so an object made in one is seen in
   no other until it is imported, and a system file or a build that replaces a system leaves them as they are. A placed object is an ordinary piece
   with its values on it (objProps): a table gives cover because it is a table, not because of its size. Nothing here reads a save or the page.

   The shape has room for what comes later (interactions such as sitting in a chair, a box the GM sets as openable, what a box holds): a later key
   joins cleanObj and objProps, and an object from before it reads as having none. */
import { cleanTexSrc } from './fogcore.js';

export var OBJ_MAX = 200;
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
// What a placed object is: an ordinary piece's own keys, by whitelist. One grid cell is 50 px on squares and 60 by 52 on hexagons, as a token's is.
// A piece that blocks sight is a wall, which gives total cover by itself; any other gives the grade it says, or none at all where it says none
export function objProps(o, hex) {
    var c = cleanObj(o); if (!c) return null;
    var p = { name: c.name, w: (c.w || 1) * (hex ? 60 : 50), h: (c.h || 1) * (hex ? 52 : 50), layer: 'middle' };
    if (c.src) p.src = c.src; else p.color = c.color || LAND_COLOR;
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

var API = { OBJ_MAX: OBJ_MAX, OBJ_GRADES: OBJ_GRADES, cleanObj: cleanObj, cleanObjects: cleanObjects, objProps: objProps, objType: objType, objWords: objWords, objId: objId, objTake: objTake };
if (typeof window !== 'undefined') window.wpObjCore = API;
