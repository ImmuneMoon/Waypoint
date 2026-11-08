/* blastcore.js — explosives in play, the pure half (1.5.8; the owner, 2026-10-25, by prompt: "Blast damage by the book" and "Throw like the
   site"; and "once it starts using the site throws, it should automatically place an explosive in the area indicated in the throw, following
   rules on when it automatically detonates and causes damage", "we also need to consider how mines work", "Mines only activate when they are
   stepped on, as opposed to grenades that automatically detonate once deployed").

   It reads nothing but its arguments: whiteboard.js places, rolls and applies on the host. What is the GM's to set lives in the system's Combat
   card (systemcore cleanCombat's `blast`): the falloff a token's share of a blast takes, the throw's roll, the scatter of a miss, and how near
   and how far a thing may be thrown. With none set a blast is what it always was.

   Published as window.wpBlastCore when a window exists. */
var VERSION = 1;
var hasOwn = function(o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
var isObj = function(v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
var fin = function(v) { return typeof v === 'number' && isFinite(v); };
var CTRL = /[\u0000-\u001f\u007f]/g;
function text(v, n) { return typeof v === 'string' ? v.slice(0, n).replace(CTRL, ' ').trim() : ''; }

// The eight ways a miss lands, in the site's words (use-dice-roller.ts getScatterResult), each with its turn from the line of the throw in
// degrees: Long is on past the aim, Short back toward the thrower, Right a quarter turn clockwise on the board (whose y runs down)
var SCATTER_WAYS = Object.freeze(['Short', 'Short and to the right', 'Right', 'Long and to the right', 'Long', 'Long and to the left', 'Left', 'Short and to the left']);
var SCATTER_TURN = Object.freeze([180, 135, 90, 45, 0, -45, -90, -135]);
// ... and the six of the book (fix log (eo): "a direction the GM rolls (1d for the six hex sides)"), a sixth of a turn apart
var SCATTER_WAYS6 = Object.freeze(['Long', 'Long and to the right', 'Short and to the right', 'Short', 'Short and to the left', 'Long and to the left']);
var SCATTER_TURN6 = Object.freeze([0, 60, 120, 180, -120, -60]);

// How many dice a damage formula rolls: the sum of every NdM's N (a bare dM is one), 0 with none. The book's safe distance reads it
function diceCount(expr) {
    if (typeof expr !== 'string') return 0;
    var n = 0, re = /(\d*)\s*d\s*(\d+|%|F)/gi, m, guard = 0;
    while ((m = re.exec(expr.slice(0, 1200))) && guard++ < 200) n += m[1] ? Math.min(1000, parseInt(m[1], 10)) : 1;
    return n;
}
// 1.6.0 (the core's gap 8, each victim rolls its own dice): a damage formula at n dice in all, 1 to 100. The dice come off its last term
// first (a term left with none reads 0), and any past its own go onto its first: 6d6+2 at 4 is 4d6+2, 2d6+1d4 at 2 is 2d6+0. '' where the
// formula rolls no dice or n is no whole number from 1 to 100. withAdds (the core's rule, "that die's add goes with it"): each plain number
// added or taken off is scaled with the dice too, rounded down, so 4d6+4 at 3 is 3d6+3 and 2d6+3 at 1 is 1d6+1
function diceAt(expr, n, withAdds) {
    if (typeof expr !== 'string' || !fin(n) || Math.floor(n) !== n || n < 1 || n > 100) return '';
    var src = expr.slice(0, 1200), re = /(\d*)\s*d\s*(\d+|%|F)/gi, m, terms = [], guard = 0;
    while ((m = re.exec(src)) && guard++ < 200) terms.push({ at: m.index, len: m[0].length, n: m[1] ? Math.min(1000, parseInt(m[1], 10)) : 1, sides: m[2] });
    if (!terms.length) return '';
    var tot = terms.reduce(function(a, t) { return a + t.n; }, 0);
    if (withAdds === true) {   // scale the adds first (none is a die's count or sides), then find the dice again in what is left
        var k = n / tot; src = src.replace(/([+-]\s*)(\d+(?:\.\d+)?)(?![\d.]|\s*d)/gi, function(all, sg, num, at, whole) { return /d\s*$/i.test(whole.slice(0, at)) ? all : sg + Math.floor(parseFloat(num) * k + 1e-9); });
        terms = []; re.lastIndex = 0; guard = 0; while ((m = re.exec(src)) && guard++ < 200) terms.push({ at: m.index, len: m[0].length, n: m[1] ? Math.min(1000, parseInt(m[1], 10)) : 1, sides: m[2] });
    }
    for (var i = terms.length - 1; i >= 0 && tot > n; i--) { var cut = Math.min(terms[i].n, tot - n); terms[i].n -= cut; tot -= cut; }
    if (tot < n) terms[0].n += n - tot;
    var out = '', last = 0; terms.forEach(function(t) { out += src.slice(last, t.at) + (t.n > 0 ? t.n + 'd' + t.sides : '0'); last = t.at + t.len; });
    return out + src.slice(last);
}
// A token's share of a blast by the Combat tab's falloff formula, with its four names: BlastDamage (what was rolled), BlastDistance (yards
// from the blast's centre, height counted), BlastDice (how many dice the damage rolled) and Direct (1 for the token struck directly, else 0).
// Centre: 1 for a token in the blast's own cell. No dice are ever rolled. A whole number, 0 or more, at most what was rolled; null where the formula cannot be worked out
// 1.6.2: one Environment reading of a blast's, by its key in any case, 0 where it is not set there
function envRead(ev, key) { if (!isObj(ev)) return 0; var k = Object.keys(ev).filter(function(x) { return x.toLowerCase() === key; })[0]; return k !== undefined && fin(ev[k]) ? ev[k] : 0; }
function fallShare(F, formula, o) {
    if (!F || typeof F.evaluate !== 'function' || typeof formula !== 'string' || !formula || !isObj(o)) return null;
    var nm = { blastdamage: fin(o.dmg) ? o.dmg : 0, blastdistance: fin(o.dist) ? Math.max(0, o.dist) : 0, blastdice: fin(o.dice) ? o.dice : 0, direct: o.direct ? 1 : 0, centre: o.centre ? 1 : 0, blastfills: fin(o.fills) ? Math.max(0, o.fills) : 0, blastnodrop: o.noDrop === true ? 1 : 0, blastscale: fin(o.iscale) && o.iscale > 0 ? o.iscale : 1, mapcell: fin(o.cell) && o.cell > 0 ? o.cell : 1, hitscale: fin(o.scale) ? o.scale : 1 };   // 1.6.2 (vehicles, fold (e)): MapCell and HitScale, 1 where none is handed in   // 1.6.0: BlastFills, the yards an item fills, 0 for none; BlastNoDrop, 1 where its stat says so
    var ev = isObj(o.env) ? o.env : null;   // 1.6.2: the Environment readings where it went off, Env.<key>, 0 for one not set there
    var r = F.evaluate(formula, { vars: function(n) { var l = String(n).toLowerCase(); if (hasOwn(nm, l)) return nm[l]; if (l.indexOf('env.') === 0) return envRead(ev, l.slice(4)); return undefined; }, random: function() { return NaN; } });   // a die fails at the die (as systemcore's noDice): the cleaner keeps none
    if (!r || !r.ok) return null;
    var v = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; if (!fin(v)) return null;
    return Math.max(0, Math.min(fin(o.dmg) ? Math.max(0, Math.floor(o.dmg)) : 0, Math.floor(v)));
}
// What a throw's check means for where it lands (the site's rule): a critical failure goes off in the thrower's hand ('hand'), a success lands
// on its aim ('hit'), any other failure misses by its margin, at least 1 (a 17 or an 18 that is no critical misses by 1 where its margin is less)
function throwOutcome(check) {
    if (!isObj(check)) return { kind: 'hit', margin: 0 };
    if (check.crit === 'fumble') return { kind: 'fumble', margin: 0, natural: fin(check.total) ? check.total : null };
    if (check.pass) return { kind: 'hit', margin: 0 };
    var m = fin(check.margin) ? Math.floor(Math.abs(check.margin)) : 1;
    return { kind: 'miss', margin: Math.max(1, Math.min(100, m)) };
}
// Where a miss lands: from the aim, dist along the line of the throw turned by its way (an index of the ways: six, else eight). The line runs
// from the thrower to the aim; where the two stand on one point the line runs up the board. pxPer: board pixels to one unit of dist
function scatterPoint(aim, from, ft, way, pxPerFt, ways) {
    var six = ways !== 8, n = six ? 6 : 8, words = six ? SCATTER_WAYS6 : SCATTER_WAYS, turns = six ? SCATTER_TURN6 : SCATTER_TURN;
    if (!isObj(aim) || !fin(aim.x) || !fin(aim.y)) return null;
    var dx = isObj(from) && fin(from.x) ? aim.x - from.x : 0, dy = isObj(from) && fin(from.y) ? aim.y - from.y : 0, len = Math.hypot(dx, dy);
    var base = len > 1e-6 ? Math.atan2(dy, dx) : -Math.PI / 2, w = fin(way) ? ((Math.floor(way) % n) + n) % n : 0, a = base + turns[w] * Math.PI / 180;
    var d = (fin(ft) ? Math.max(0, ft) : 0) * (fin(pxPerFt) && pxPerFt > 0 ? pxPerFt : 0);
    return { x: Math.round((aim.x + Math.cos(a) * d) * 100) / 100, y: Math.round((aim.y + Math.sin(a) * d) * 100) / 100, way: w, words: words[w] };
}
// 1.6.0 A burst: where a stray round lands when the GM gives its way by a click: from the aim, dist toward the point clicked, at most the board's
// own top and left edge left to the caller. null where the click is on the aim itself, which gives no way. pxPer: board pixels to one unit of dist
function towardPoint(aim, to, dist, pxPer) {
    if (!isObj(aim) || !isObj(to) || !fin(aim.x) || !fin(aim.y) || !fin(to.x) || !fin(to.y)) return null;
    var dx = to.x - aim.x, dy = to.y - aim.y, len = Math.hypot(dx, dy); if (!(len > 1e-6)) return null;
    var d = (fin(dist) ? Math.max(0, dist) : 0) * (fin(pxPer) && pxPer > 0 ? pxPer : 0);
    return { x: Math.round((aim.x + dx / len * d) * 100) / 100, y: Math.round((aim.y + dy / len * d) * 100) / 100 };
}
// The scatter where the Combat tab names no formula (the book, fix log (eo)): a yard a point missed, never more than half the distance thrown
function bookScatterYd(margin, thrownYd) {
    var m = fin(margin) ? Math.max(0, Math.min(100, Math.floor(margin))) : 1, half = fin(thrownYd) ? Math.max(0, thrownYd / 2) : m;
    return Math.min(m, half);
}
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 1): a launched round that misses. missOf: how far a check missed, as a throw's miss reads
// it, at least 1 and at most 100; null for a verdict that is no failed check (dicecore verdictOf: a miss's margin is 0 or below). A critical
// failure is read by its margin too: what else it does is the Combat tab's to say
function missOf(vd) {
    if (!isObj(vd) || vd.kind !== 'check' || vd.pass !== false) return null;
    var m = fin(vd.margin) ? Math.floor(Math.abs(vd.margin)) : 1;
    return Math.max(1, Math.min(100, m));
}
// Where a round that flies straight would end with nothing in its way: on the ray from 'from' through 'aim', reach board pixels from 'from' (a
// number above 0), else on to the board's edge, and never past it (a square board of 'board' pixels from 0); null where the two points are one
function flightEnd(from, aim, reach, board) {
    if (!isObj(from) || !isObj(aim) || !fin(from.x) || !fin(from.y) || !fin(aim.x) || !fin(aim.y)) return null;
    var dx = aim.x - from.x, dy = aim.y - from.y, len = Math.hypot(dx, dy); if (!(len > 1e-6)) return null;
    var B = fin(board) && board > 0 ? board : 30000, ux = dx / len, uy = dy / len, edge = Infinity;
    if (ux > 1e-12) edge = Math.min(edge, (B - from.x) / ux); else if (ux < -1e-12) edge = Math.min(edge, -from.x / ux);
    if (uy > 1e-12) edge = Math.min(edge, (B - from.y) / uy); else if (uy < -1e-12) edge = Math.min(edge, -from.y / uy);
    var go = Math.max(0, Math.min(fin(reach) && reach > 0 ? reach : Infinity, edge)); if (!isFinite(go)) return null;
    return { x: Math.round((from.x + ux * go) * 100) / 100, y: Math.round((from.y + uy * go) * 100) / 100 };
}
// Of the boxes handed in ({ id, x, y, w, h }), the one the segment from a to b enters first and where along it (t, 0 to 1), at or after 'after'
// (0 to 1: a box first met before it is passed by); a box that holds a already is met at 0. null where it meets none. Pure geometry: the first
// of two met at once is the first in the list
function firstBox(a, b, boxes, after) {
    if (!isObj(a) || !isObj(b) || !fin(a.x) || !fin(a.y) || !fin(b.x) || !fin(b.y) || !Array.isArray(boxes)) return null;
    var dx = b.x - a.x, dy = b.y - a.y, from = fin(after) ? Math.max(0, Math.min(1, after)) : 0, best = null;
    for (var i = 0; i < boxes.length && i < 4000; i++) {
        var q = boxes[i]; if (!isObj(q) || typeof q.id !== 'string' || !fin(q.x) || !fin(q.y) || !fin(q.w) || !fin(q.h) || !(q.w > 0) || !(q.h > 0)) continue;
        var t0 = 0, t1 = 1, ok = true;
        [[dx, a.x, q.x, q.x + q.w], [dy, a.y, q.y, q.y + q.h]].forEach(function(s) {
            if (!ok) return;
            if (Math.abs(s[0]) < 1e-12) { if (s[1] < s[2] || s[1] > s[3]) ok = false; return; }
            var u = (s[2] - s[1]) / s[0], v = (s[3] - s[1]) / s[0]; if (u > v) { var w = u; u = v; v = w; }
            t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) ok = false;
        });
        if (!ok || t0 < from - 1e-9) continue;
        if (!best || t0 < best.t - 1e-12) best = { id: q.id, t: Math.round(t0 * 1e6) / 1e6 };
    }
    return best;
}
// A placed mine as its trigger zone carries it (the GM's own: a hidden zone travels to no player, and wireWbItem drops the key from every
// copy). What it holds: its blast (ft, a name, the damage formula's text, the damage type's key), the trigger radius in yards, the character
// that placed it and the row, its maker's name, whether it is the GM's alone, and the item's notes. Anything else is no key; null where no
// blast is left
var MINE_ID = /^c_[A-Za-z0-9_]{1,24}$/, MINE_FIELD = /^[A-Za-z0-9_]{1,64}$/, MINE_ROW = /^w_[A-Za-z0-9_]{1,24}$/, MINE_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function cleanMine(m) {   // 1.5.9 (es): and its fragmentation (frag, a formula's text) with that fragmentation's type (fragType, a key, only beside frag)
    if (!isObj(m)) return null;
    var ft = fin(m.ft) ? Math.round(m.ft) : 0; if (!(ft >= 1)) return null;
    var out = { ft: Math.min(3000, ft) };
    var nm = text(m.name, 240); if (nm) out.name = nm;
    var dm = text(m.damage, 1200); if (dm) out.damage = dm;
    if (typeof m.type === 'string' && MINE_TYPE.test(m.type)) out.type = m.type;
    out.trig = fin(m.trig) && m.trig > 0 ? Math.max(0.5, Math.min(100, Math.round(m.trig * 10) / 10)) : 2;
    if (typeof m.charId === 'string' && MINE_ID.test(m.charId)) out.charId = m.charId;
    if (typeof m.fieldId === 'string' && MINE_FIELD.test(m.fieldId)) out.fieldId = m.fieldId;
    if (typeof m.rowId === 'string' && MINE_ROW.test(m.rowId)) out.rowId = m.rowId;
    var by = text(m.by, 240); if (by) out.by = by;
    if (m.gmOnly === true) out.gmOnly = true;
    if (m.unarmed === true) out.unarmed = true;   // planted with a failed roll: it lies there and never goes off by a step (its planter knows)
    var lcM = text(m.loc, 60); if (lcM) out.loc = lcM;   // 1.6.2 (11): the location it strikes
    if (fin(m.ad) && m.ad > 0 && m.ad !== 1) out.ad = Math.max(0.1, Math.min(100, Math.round(m.ad * 10) / 10));
    var nt = text(m.notes, 800); if (nt) out.notes = nt;
    var fg = text(m.frag, 1200); if (fg) { out.frag = fg; if (typeof m.fragType === 'string' && MINE_TYPE.test(m.fragType)) out.fragType = m.fragType; }   // 1.5.9 (es): its fragmentation, rolled when it goes off
    var af = cleanAffs(m.aff); if (af) out.aff = af;   // 1.5.9 (es): and its afflictions
    if (fin(m.fills) && m.fills > 0) out.fills = Math.min(10000, m.fills); if (m.noDrop === true) out.noDrop = true; if (fin(m.iscale) && m.iscale > 0 && m.iscale !== 1) out.iscale = Math.min(1000, m.iscale);   // 1.6.2 (the core's gap 213): BlastScale too   // 1.6.0: BlastFills and BlastNoDrop, read from its row as it is placed
    return out;
}
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2, its affliction half): a blast's afflictions as a mine and a blast carry them, the
// shape systemcore cleanAffs keeps: at most 2, each { vs, fx, who, needs, lasts } (vs and needs a formula's text, fx an effect's id, who 'all'
// only, lasts { n, u } with its unit a word or a key); anything else is no key, and null where none is left
var AFF_FX = /^e_[A-Za-z0-9_]{1,24}$/, AFF_UNIT = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function cleanAffs(v) {
    if (!Array.isArray(v)) return null;
    var out = [];
    for (var i = 0; i < v.length && i < 40 && out.length < 2; i++) {
        var a = v[i]; if (!isObj(a)) continue;
        var vs = text(a.vs, 300), fx = typeof a.fx === 'string' && AFF_FX.test(a.fx) ? a.fx : ''; if (!vs || !fx) continue;
        var o = { vs: vs, fx: fx }; if (a.who === 'all') o.who = 'all';
        var nd = text(a.needs, 300); if (nd) o.needs = nd;
        if (isObj(a.lasts)) { var ln = text(a.lasts.n, 300), lu = typeof a.lasts.u === 'string' && AFF_UNIT.test(a.lasts.u) ? a.lasts.u : ''; if (ln && lu) o.lasts = { n: ln, u: lu }; }
        out.push(o);
    }
    return out.length ? out : null;
}
// Who an affliction reaches, each character once and in order: under all, the characters in the blast (inBlast: [{ id, shielded }], a character
// shielded by cover passed over); else those it hurt (hurt: [character ids], in the order they were hurt). Junk is left out
function affTargets(inBlast, hurt, all) {
    var out = [], seen = Object.create(null), add = function(id) { if (typeof id === 'string' && id && seen[id] !== 1) { seen[id] = 1; out.push(id); } };
    if (all === true) (Array.isArray(inBlast) ? inBlast : []).slice(0, 4000).forEach(function(r) { if (isObj(r) && r.shielded !== true) add(r.id); });
    else (Array.isArray(hurt) ? hurt : []).slice(0, 4000).forEach(add);
    return out;
}
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): who takes a blast's fragmentation, and by which roll. rows: [{ id, d }], each
// character token's id and its yards from the blast's centre, height counted; reach: how far the fragmentation reaches, in yards; o: direct
// (the token struck directly, or none), own (true: that token takes a hit of its own roll, wherever it stands) and each (true: every token
// rolls its own). The answer, in the rows' order and each token once: [{ id, own }], own where the token rolls its own, else it takes the one
// roll the others share. A row that is no token or stands past the reach is left out
function fragTargets(rows, reach, o) {
    if (!Array.isArray(rows)) return [];
    o = isObj(o) ? o : {};
    var R = fin(reach) ? Math.max(0, reach) : 0, dir = typeof o.direct === 'string' && o.direct ? o.direct : null, out = [], seen = Object.create(null);
    for (var i = 0; i < rows.length && i < 4000; i++) {
        var r = rows[i]; if (!isObj(r) || typeof r.id !== 'string' || !r.id || seen[r.id] === 1) continue;
        var isDir = dir !== null && r.id === dir && o.own === true;
        if (!isDir && !(fin(r.d) && r.d <= R + 1e-9)) continue;
        seen[r.id] = 1; out.push({ id: r.id, own: o.each === true || isDir });
    }
    return out;
}
// Whether a token stands in a mine's trigger: its centre within the trigger radius of the zone's centre, in yards (yardsBetween: the map's own
// reading of two board points). A token that stood in it where the gesture began sets nothing off: it has to step in
function inTrigger(zone, tokCentre, yardsBetween) {
    if (!isObj(zone) || !isObj(zone.mine) || !isObj(tokCentre) || typeof yardsBetween !== 'function') return false;
    var c = { x: (Number(zone.x) || 0) + (Number(zone.w) || 0) / 2, y: (Number(zone.y) || 0) + (Number(zone.h) || 0) / 2 };
    var d = yardsBetween(c, tokCentre); return fin(d) && d <= (fin(zone.mine.trig) ? zone.mine.trig : 2) + 1e-9;
}
// The stand-in drawings a thrown explosive and a placed mine wear on the map until an item has an icon of its own: the app's own, plain
// geometry on a 24-unit square in the toolbar's line style (paths only, numbers and their own letters)
var STAND_INS = Object.freeze({
    grenade: Object.freeze(['M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M10 9V6h4v3', 'M14 7l4-3', 'M9.5 13.5h5M9.5 16.5h5']),
    mine: Object.freeze(['M4 15c0-2.5 3.6-4 8-4s8 1.5 8 4-3.6 4-8 4-8-1.5-8-4z', 'M12 11V7', 'M7.5 11.5L6 8.5M16.5 11.5L18 8.5', 'M10 7h4'])
});
// 1.6.0 An attack on a line: who stands in it, nearest first. from and aim, board points that say its way; toks, [{ id, x, y, half }], each a token's centre and
// how far it reaches past its own cell; o: unit, board pixels a yard; width and reach, yards; stop, the part of the reach a wall lets it go (absent: all).
// A token seated in a cell is in the line where that cell's centre is under it, so the test is its centre against half the width. Bodies never stop it
function lineTargets(from, aim, toks, o) {
    o = o && typeof o === 'object' ? o : {}; var fin = function(v) { return typeof v === 'number' && isFinite(v); };
    if (!from || !aim || !fin(from.x) || !fin(from.y) || !fin(aim.x) || !fin(aim.y) || !fin(o.unit) || !(o.unit > 0) || !fin(o.width) || !fin(o.reach) || !(o.reach > 0)) return [];
    var dx = aim.x - from.x, dy = aim.y - from.y, d = Math.sqrt(dx * dx + dy * dy); if (!(d > 0)) return [];
    var ux = dx / d, uy = dy / d, far = o.reach * o.unit * (fin(o.stop) ? Math.max(0, Math.min(1, o.stop)) : 1), half = o.width * o.unit / 2, out = [];
    (Array.isArray(toks) ? toks : []).forEach(function(t) {
        if (!t || !fin(t.x) || !fin(t.y)) return; var px = t.x - from.x, py = t.y - from.y, along = px * ux + py * uy, off = Math.abs(px * uy - py * ux);
        if (along > 1e-9 && along <= far + 1e-9 && off <= half + (fin(t.half) ? Math.max(0, t.half) : 0) + 1e-9) out.push({ id: t.id, along: along });
    });
    return out.sort(function(a, b) { return a.along - b.along; }).map(function(t) { return t.id; });
}
// 1.6.2 (vehicles, fold (d), things in flight; the core's answers D1 to D5): a thing in flight moves a whole number of cells a round, cell by cell on
// the map's lattice (a hex of 30 px sides and 52 px rows, a square of 50 px, or 50 px steps on a map with no grid), homing (each step to the
// neighbour nearest the target's cell as it now stands) or straight (along the line it was launched on, kept as { ox, oy, dx, dy, k }). It passes
// over every other token, and arrives the moment it enters the target's cell. flyStep reads nothing but its arguments: { grid, from: {x, y},
// to: {x, y}, cells, homing, line } -> { x, y, path, arrived, line }, centres in board pixels; null for what is no place
var FLY_MAX = 200;
function hexOf(x, y) { var s = 30, h = 52, q = (x - s / 2) / (1.5 * s), r = y / h - q / 2, rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r), dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r)); if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; return { q: rx, r: ry }; }
function hexAt(c) { return { x: c.q * 45 + 15, y: (c.r + c.q / 2) * 52 }; }
function hexDist(a, b) { var dq = a.q - b.q, dr = a.r - b.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }
var HEX_NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
function sqOf(x, y) { return { q: Math.floor(x / 50), r: Math.floor(y / 50) }; }
function sqAt(c) { return { x: c.q * 50 + 25, y: c.r * 50 + 25 }; }
function sqDist(a, b) { return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r)); }
var SQ_NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function flyStep(o) {
    if (!isObj(o) || !isObj(o.from) || !isObj(o.to) || !fin(o.from.x) || !fin(o.from.y) || !fin(o.to.x) || !fin(o.to.y)) return null;
    var n = fin(o.cells) ? Math.max(0, Math.min(FLY_MAX, Math.floor(o.cells))) : 0, path = [];
    if (o.grid !== 'hex' && o.grid !== 'square') {   // no grid: 50 px a step, straight at the target or along the line
        var px = { x: o.from.x, y: o.from.y }, ln = isObj(o.line) && fin(o.line.dx) && fin(o.line.dy) ? o.line : null;
        for (var i = 0; i < n; i++) {
            var tx = o.homing === false && ln ? px.x + ln.dx * 50 : o.to.x, ty = o.homing === false && ln ? px.y + ln.dy * 50 : o.to.y, dx = tx - px.x, dy = ty - px.y, len = Math.hypot(dx, dy);
            if (o.homing !== false && len <= 50) { px = { x: o.to.x, y: o.to.y }; path.push(px); return { x: px.x, y: px.y, path: path, arrived: true, line: ln }; }
            if (!(len > 1e-9)) break; px = { x: Math.round((px.x + dx / len * 50) * 100) / 100, y: Math.round((px.y + dy / len * 50) * 100) / 100 }; path.push(px);
            if (Math.hypot(o.to.x - px.x, o.to.y - px.y) <= 25) return { x: px.x, y: px.y, path: path, arrived: true, line: ln };
        }
        return { x: px.x, y: px.y, path: path, arrived: false, line: ln };
    }
    var hex = o.grid === 'hex', cellOf = hex ? hexOf : sqOf, at = hex ? hexAt : sqAt, dist = hex ? hexDist : sqDist, nb = hex ? HEX_NB : SQ_NB;
    var cur = cellOf(o.from.x, o.from.y), tc = cellOf(o.to.x, o.to.y), line = isObj(o.line) && fin(o.line.ox) && fin(o.line.oy) && fin(o.line.dx) && fin(o.line.dy) ? { ox: o.line.ox, oy: o.line.oy, dx: o.line.dx, dy: o.line.dy, k: fin(o.line.k) ? Math.max(0, Math.floor(o.line.k)) : 0 } : null;
    if (cur.q === tc.q && cur.r === tc.r) { var p0 = at(cur); return { x: p0.x, y: p0.y, path: [], arrived: true, line: line }; }
    for (var j = 0; j < n; j++) {
        var next = null;
        if (o.homing === false && line) {   // the next cell along the line it was launched on, never the one it stands in
            for (var t = line.k + 1; t < line.k + 400 && !next; t++) { var c = cellOf(line.ox + line.dx * t * 10, line.oy + line.dy * t * 10); if (c.q !== cur.q || c.r !== cur.r) { next = c; line.k = t; } }
        } else {
            var best = null, bd = Infinity, bp = Infinity, tp = at(tc);
            nb.forEach(function(d) { var c = { q: cur.q + d[0], r: cur.r + d[1] }, cd = dist(c, tc), cp = at(c), pd = Math.hypot(cp.x - tp.x, cp.y - tp.y); if (cd < bd || (cd === bd && pd < bp)) { best = c; bd = cd; bp = pd; } });
            next = best;
        }
        if (!next) break; cur = next; var pp = at(cur); path.push(pp);
        if (cur.q === tc.q && cur.r === tc.r) return { x: pp.x, y: pp.y, path: path, arrived: true, line: line };
    }
    var pe = at(cur); return { x: pe.x, y: pe.y, path: path, arrived: false, line: line };
}
// the line a thing in flight is launched on: from where it is launched toward its target, a unit step a pixel; null where the two are one place
function flyLine(from, to) { if (!isObj(from) || !isObj(to) || !fin(from.x) || !fin(from.y) || !fin(to.x) || !fin(to.y)) return null; var dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy); return len > 1e-6 ? { ox: from.x, oy: from.y, dx: dx / len, dy: dy / len, k: 0 } : null; }
var API = { flyStep: flyStep, flyLine: flyLine, FLY_MAX: FLY_MAX, envRead: envRead, lineTargets: lineTargets, towardPoint: towardPoint, diceAt: diceAt, VERSION: VERSION, SCATTER_WAYS: SCATTER_WAYS, SCATTER_TURN: SCATTER_TURN, SCATTER_WAYS6: SCATTER_WAYS6, SCATTER_TURN6: SCATTER_TURN6, diceCount: diceCount, fallShare: fallShare, throwOutcome: throwOutcome, scatterPoint: scatterPoint, bookScatterYd: bookScatterYd, missOf: missOf, flightEnd: flightEnd, firstBox: firstBox, fragTargets: fragTargets, cleanAffs: cleanAffs, affTargets: affTargets, cleanMine: cleanMine, inTrigger: inTrigger, STAND_INS: STAND_INS };
if (typeof window !== 'undefined') window.wpBlastCore = API;
export { flyStep, flyLine, FLY_MAX, envRead, lineTargets, towardPoint, diceAt, VERSION, SCATTER_WAYS, SCATTER_TURN, SCATTER_WAYS6, SCATTER_TURN6, diceCount, fallShare, throwOutcome, scatterPoint, bookScatterYd, missOf, flightEnd, firstBox, fragTargets, cleanAffs, affTargets, cleanMine, inTrigger, STAND_INS };
