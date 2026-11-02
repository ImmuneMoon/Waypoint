/* Arranging a sheet by dragging (1.6.2, backlog 171 (b); the owner, by prompt: "In the System editor (Recommended)", "Sections and fields
   (Recommended)", "Side by side (Recommended)"). The pure half: what a drop means and what it does to a layout's sections. It reads and writes the
   plain list of sections the System editor holds and touches nothing else; arrange.js is the page's half.
   A section's order is its place in the list, drawn tab by tab. `beside` (true only) stands a section on the row of the section drawn before it. */

// the run a section is drawn in: the sections above the tabs, or those of one tab
export function runOf(sec, tabIds) {
    if (sec.pinned) return 'pin';
    if (!tabIds || !tabIds.length) return 'page';
    return tabIds.indexOf(sec.tab) >= 0 ? sec.tab : tabIds[0];
}
function isChild(secs, sec) { var p = sec.parent && secs.find(function(x) { return x.id === sec.parent; }); return !!(p && !p.parent); }
function hasKids(secs, id) { return secs.some(function(x) { return x.parent === id; }); }
function at(secs, id) { for (var i = 0; i < secs.length; i++) if (secs[i].id === id) return i; return -1; }
// the next top-level section drawn after place i in the same run, or -1
function nextInRun(secs, i, tabIds) {
    var r = runOf(secs[i], tabIds);
    for (var k = i + 1; k < secs.length; k++) { if (!isChild(secs, secs[k]) && runOf(secs[k], tabIds) === r) return k; }
    return -1;
}
// the first section of the row a section stands on
export function rowHead(secs, id, tabIds) {
    var i = at(secs, id); if (i < 0 || isChild(secs, secs[i])) return i < 0 ? null : id;
    var head = secs[i], r = runOf(head, tabIds);
    for (var k = i - 1; k >= 0 && head.beside === true; k--) { if (!isChild(secs, secs[k]) && runOf(secs[k], tabIds) === r) head = secs[k]; }
    return head.id;
}
// the last section of the row a section stands on
export function rowTail(secs, id, tabIds) {
    var i = at(secs, id); if (i < 0) return null;
    for (;;) { var n = nextInRun(secs, i, tabIds); if (n < 0 || secs[n].beside !== true) return secs[i].id; i = n; }
}
// taking a section out: the one drawn after it must not join the row before
function lift(secs, i, tabIds) {
    var s = secs[i];
    if (!isChild(secs, s) && s.beside !== true) { var n = nextInRun(secs, i, tabIds); if (n >= 0 && secs[n].beside === true) delete secs[n].beside; }
    secs.splice(i, 1); delete s.beside;
    return s;
}
function take(s, like) {
    if (like.pinned) s.pinned = true; else delete s.pinned;
    if (typeof like.tab === 'string' && like.tab) s.tab = like.tab; else delete s.tab;
}
function unnest(s) { delete s.parent; delete s.first; }

// where: { before: id } a row above that section's row, { after: id } a row below it, { left: id } or { right: id } on its row, { tab: tabId } the end of that tab.
// Answers true when the list changed. A section that holds sub-sections never becomes one.
export function moveSection(secs, id, where, tabIds) {
    if (!Array.isArray(secs) || !where) return false;
    var i = at(secs, id); if (i < 0) return false;
    var s = secs[i], key = where.before || where.after || where.left || where.right || null, was = JSON.stringify(secs);
    function moved() { return JSON.stringify(secs) !== was; }
    if (typeof where.tab === 'string') {
        if (!tabIds || tabIds.indexOf(where.tab) < 0) return false;
        lift(secs, i, tabIds); unnest(s); delete s.pinned; s.tab = where.tab; secs.push(s);
        return moved();
    }
    if (!key) return false;
    if (key === id) {   // onto itself: a section on a row takes a row of its own there
        if (where.before) { var n = nextInRun(secs, i, tabIds); if (n >= 0 && secs[n].beside === true) delete secs[n].beside; }
        else if (where.after) delete s.beside;
        return moved();
    }
    var x = secs[at(secs, key)]; if (!x || x.parent === id) return false;
    var into = isChild(secs, x) ? x.parent : null;   // the target is a sub-section: the moved one becomes a sibling, if it may
    if (into && hasKids(secs, id)) { key = into; x = secs[at(secs, key)]; into = null; where = { before: key }; }
    lift(secs, i, tabIds);
    if (into) {
        s.parent = into; if (x.first === true) s.first = true; else delete s.first;
        delete s.pinned; delete s.tab;
        secs.splice(where.before || where.left ? at(secs, key) : at(secs, key) + 1, 0, s);
        return moved();
    }
    unnest(s); take(s, x);
    if (where.before) secs.splice(at(secs, rowHead(secs, key, tabIds)), 0, s);
    else if (where.after) secs.splice(at(secs, rowTail(secs, key, tabIds)) + 1, 0, s);
    else if (where.right) { s.beside = true; secs.splice(at(secs, key) + 1, 0, s); }
    else { if (x.beside === true) s.beside = true; x.beside = true; secs.splice(at(secs, key), 0, s); }   // on its left: it takes that section's place on the row
    return moved();
}

// a placement moved within a section or into another, before place `to` of that section's list (past the end: last)
export function moveField(secs, fromId, pi, toId, to) {
    var a = secs[at(secs, fromId)], b = secs[at(secs, toId)]; if (!a || !b || !Array.isArray(a.fields) || !a.fields[pi]) return false;
    if (!Array.isArray(b.fields)) b.fields = [];
    var n = typeof to === 'number' && to >= 0 ? Math.min(to, b.fields.length) : b.fields.length;
    if (a === b && (n === pi || n === pi + 1)) return false;
    var pl = a.fields.splice(pi, 1)[0];
    if (a === b && n > pi) n--;
    b.fields.splice(n, 0, pl);
    return true;
}
export function addField(secs, toId, pl, to) {
    var b = secs[at(secs, toId)]; if (!b || !pl) return false;
    if (!Array.isArray(b.fields)) b.fields = [];
    b.fields.splice(typeof to === 'number' && to >= 0 ? Math.min(to, b.fields.length) : b.fields.length, 0, pl);
    return true;
}

// the keys, for a grip that has the focus. A section: Up and Down by a row, Right and Left onto or off the row. Answers what moveSection takes, or null.
export function sectionKey(secs, id, key, tabIds) {
    var i = at(secs, id); if (i < 0) return null;
    var s = secs[i], r = runOf(s, tabIds), kid = isChild(secs, s), same = secs.filter(function(x) { return kid ? x.parent === s.parent : !isChild(secs, x) && runOf(x, tabIds) === r; });
    var heads = kid ? same.map(function(x) { return x.id; }) : same.filter(function(x) { return x.beside !== true; }).map(function(x) { return x.id; });
    var mine = heads.indexOf(kid ? id : rowHead(secs, id, tabIds));
    if (key === 'ArrowUp') { if (!kid && (s.beside === true || nextIsBeside(secs, i, tabIds))) return { before: rowHead(secs, id, tabIds) }; return mine > 0 ? { before: heads[mine - 1] } : null; }
    if (key === 'ArrowDown') { if (!kid && (s.beside === true || nextIsBeside(secs, i, tabIds))) return { after: rowTail(secs, id, tabIds) }; return mine >= 0 && mine < heads.length - 1 ? { after: kid ? heads[mine + 1] : rowTail(secs, heads[mine + 1], tabIds) } : null; }
    if (kid) return null;
    var k = same.indexOf(s);
    if (key === 'ArrowRight') { var nx = same[k + 1]; if (nx && nx.beside === true) return { right: nx.id }; return s.beside !== true && k > 0 ? { right: same[k - 1].id } : null; }
    if (key === 'ArrowLeft') return s.beside === true && k > 0 ? { left: same[k - 1].id } : null;
    return null;
}
function nextIsBeside(secs, i, tabIds) { var n = nextInRun(secs, i, tabIds); return n >= 0 && secs[n].beside === true; }

/* ---- where a pointer is, read from boxes measured on the page ({ id, l, t, r, b } in one set of coordinates, in the order drawn) ---- */
export var EDGE = { px: 56, share: 0.24 };
// a section dropped: boxes are the top-level sections of the view, or the sub-sections of one section
export function dropSection(boxes, x, y, id) {
    var list = boxes.filter(function(b) { return b.id !== id; }); if (!list.length) return null;
    var inside = null; list.forEach(function(b) { if (x >= b.l && x <= b.r && y >= b.t && y <= b.b) inside = b; });
    if (inside) {
        var edge = Math.min(EDGE.px, (inside.r - inside.l) * EDGE.share);
        if (x <= inside.l + edge) return { left: inside.id };
        if (x >= inside.r - edge) return { right: inside.id };
        return y < (inside.t + inside.b) / 2 ? { before: inside.id } : { after: inside.id };
    }
    var above = null, below = null;   // in a gap: the nearest box up or down the page
    list.forEach(function(b) { if (b.b <= y && (!above || b.b > above.b)) above = b; if (b.t >= y && (!below || b.t < below.t)) below = b; });
    if (below && (!above || below.t - y <= y - above.b)) return { before: below.id };
    if (above) return { after: above.id };
    var last = list[list.length - 1]; return { after: last.id };
}
// a field dropped: cells are the placements of one section as drawn, { pi, l, t, r, b } in reading order. Answers the place to insert before.
export function dropField(cells, x, y, end) {
    for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (y < c.t || (y <= c.b && x < (c.l + c.r) / 2)) return c.pi;
    }
    return end;
}
// the placements of a section as cleaned, by their places in the section as the draft holds it (the cleaner drops what no longer stands)
export function placeMap(drafted, cleaned) {
    var out = [], k = 0, same = function(a, b) { return !!a && !!b && a.id === b.id && a.roll === b.roll && a.kind === b.kind && a.g === b.g; };
    (cleaned || []).forEach(function(p) { var i = k; while (i < (drafted || []).length && !same(drafted[i], p)) i++; if (i < (drafted || []).length) { out.push(i); k = i + 1; } else out.push(-1); });
    return out;
}
