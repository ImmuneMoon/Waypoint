/* Flatten into one picture (1.6.2, backlog 39; the owner, 2026-11-07, by prompt: originals "Hidden, can be undone later", rule pieces "make the
   two choices optional", from "Right-click on a selection" and "Build's options", sharpness "Ask, as Save Map as Picture does"). The map picture's
   dialog plans and draws (mapshot.js, shotcore flatPlan); this lays the picture where the pieces were, in the map's list where the first of them
   stood, hides the plain pieces and keeps the pieces with rules drawing nothing, each naming the picture (flatIn) so that Unflatten puts them back
   as they were. One save each way, so one Undo takes either back. The GM's own campaign on this computer alone, as the dialog. */
function toast(t) { if (typeof window !== 'undefined' && typeof window.appToast === 'function') window.appToast(t); }   // the page's notice, through its window name, so the pure part loads in Node

// [buildcheck:flatten-start]
function flatId() { return 'wb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
// 1.6.3, the review of finding 16: how far from the board's corner, and how large, a figure of a flattened picture's frame may be. The board is
// far smaller, so a stray figure from a file past it is no frame at all (flatFrame below), and cleanup.js keeps the same bound on import
var FLAT_LIM = 1e7;
function flatNum(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= FLAT_LIM; }
function flatSize(v) { return typeof v === 'number' && isFinite(v) && v > 0 && v <= FLAT_LIM ? v : 100; }   // a piece with no size is drawn 100 px, as the board draws it
function flatTurn(r) { r = typeof r === 'number' && isFinite(r) ? r % 360 : 0; if (r > 180) r -= 360; if (r <= -180) r += 360; return r; }
// A piece's frame as the board draws it: its place, its size and its turn about its own middle. null where its place is no sound number
function flatBoxOf(w) {
    if (!w || !flatNum(w.x) || !flatNum(w.y)) return null;
    return { x: w.x, y: w.y, w: flatSize(w.w), h: flatSize(w.h), r: flatTurn(w.rot) };
}
// The frame a picture kept when its pieces were last placed beside it (flatAt), read as data: null where it is no sound frame. A flatAt written
// by the first build of 1.6.3 holds a place alone, and is read with the size and turn the picture has now, so its pieces move by place alone
function flatFrame(at, now) {
    if (!at || typeof at !== 'object' || !flatNum(at.x) || !flatNum(at.y)) return null;
    var f = { x: at.x, y: at.y, w: now ? now.w : 100, h: now ? now.h : 100, r: now ? now.r : 0 };
    if (at.w !== undefined || at.h !== undefined) { if (!(typeof at.w === 'number' && at.w > 0 && at.w <= FLAT_LIM && typeof at.h === 'number' && at.h > 0 && at.h <= FLAT_LIM)) return null; f.w = at.w; f.h = at.h; }
    if (at.r !== undefined) { if (!(typeof at.r === 'number' && isFinite(at.r))) return null; f.r = flatTurn(at.r); }
    return f;
}
function flatAtOf(b) { return { x: b.x, y: b.y, w: b.w, h: b.h, r: b.r }; }
// Where a piece stands beside its picture, in the picture's own frame: its middle from the picture's middle, turned back by the picture's turn,
// its size, and its turn beside the picture's. Kept on each piece as flatOff, so the next change of the picture places it from this alone
function flatRel(p, q) {
    var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2, qcx = q.x + q.w / 2, qcy = q.y + q.h / 2, a = -p.r * Math.PI / 180, dx = qcx - pcx, dy = qcy - pcy;
    return { dx: dx * Math.cos(a) - dy * Math.sin(a), dy: dx * Math.sin(a) + dy * Math.cos(a), w: q.w, h: q.h, r: flatTurn(q.r - p.r) };
}
// A piece's flatOff read as data, or null
function flatOffOf(o) {
    if (!o || typeof o !== 'object') return null;
    if (!flatNum(o.dx) || !flatNum(o.dy) || !(typeof o.w === 'number' && o.w > 0 && o.w <= FLAT_LIM) || !(typeof o.h === 'number' && o.h > 0 && o.h <= FLAT_LIM) || !(typeof o.r === 'number' && isFinite(o.r))) return null;
    return { dx: o.dx, dy: o.dy, w: o.w, h: o.h, r: flatTurn(o.r) };
}
function flatSame(a, b) { return !!a && !!b && Math.abs(a.dx - b.dx) < 1e-6 && Math.abs(a.dy - b.dy) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6 && Math.abs(a.r - b.r) < 1e-6; }
function flatRound(v) { return Math.round(v * 1000) / 1000; }
function flatLay(map, fp, url, id) {
    var pic = { id: id || flatId(), type: 'image', x: fp.box.x, y: fp.box.y, w: fp.box.w, h: fp.box.h, src: url, color: 'transparent', flatPic: true, flatAt: { x: fp.box.x, y: fp.box.y, w: fp.box.w, h: fp.box.h, r: 0 } };   // flatAt: the picture's frame when its pieces were last placed beside it (flatFollow)
    if (fp.layer) pic.layer = fp.layer; if (fp.z) pic.z = fp.z;
    var first = map.whiteboard.indexOf(fp.draw[0]), hide = Object.create(null), ghost = Object.create(null), pf = flatBoxOf(pic);
    fp.hide.forEach(function(x) { hide[x] = 1; }); fp.ghost.forEach(function(x) { ghost[x] = 1; });
    map.whiteboard.forEach(function(w) {
        if (!w || typeof w.id !== 'string') return;
        if (hide[w.id] === 1) { w.hidden = true; w.flatIn = pic.id; }
        else if (ghost[w.id] === 1) { w.flatIn = pic.id; w.flatWas = { o: typeof w.opacity === 'number' ? w.opacity : null }; w.opacity = 0; }
        else return;
        var qb = flatBoxOf(w); if (qb && pf) w.flatOff = flatRel(pf, qb);   // where it stands beside the picture (the review of finding 16)
    });
    map.whiteboard.splice(first >= 0 ? first : map.whiteboard.length, 0, pic);
    return pic;
}
// A piece drawn into a picture given back its own look: shown again, or its own opacity, and no mark of the picture left on it
function flatFree(w) {
    if (w.flatWas && typeof w.flatWas === 'object') { if (typeof w.flatWas.o === 'number') w.opacity = w.flatWas.o; else delete w.opacity; delete w.flatWas; }
    else delete w.hidden;
    delete w.flatIn; delete w.flatOff;
}
// The pieces a picture names put back as they were and the picture taken away: how many came back, or -1 for no such picture. `skip`, a set of
// ids (1.6.3, delask.js), names pieces about to be deleted with the picture: they are put back all the same and are not counted
function flatUndo(map, picId, skip) {
    if (!map || !Array.isArray(map.whiteboard)) return -1;
    var at = -1; map.whiteboard.forEach(function(w, i) { if (w && w.id === picId && w.flatPic === true) at = i; }); if (at < 0) return -1;
    var n = 0; map.whiteboard.forEach(function(w) {
        if (!w || w.flatIn !== picId) return;
        flatFree(w); if (!(skip && skip[w.id] === 1)) n++;
    });
    map.whiteboard.splice(at, 1);
    return n;
}
// 1.6.3 (Fulllion's ruling of 2026-11-17 on finding 16, "ask on delete": Delete them too): the picture taken away with every piece drawn into it.
// How many of those pieces went (a piece named in `skip`, deleted by its caller anyway, is not counted), or -1 for no such picture
function flatDrop(map, picId, skip) {
    if (!map || !Array.isArray(map.whiteboard)) return -1;
    if (!map.whiteboard.some(function(w) { return w && w.id === picId && w.flatPic === true; })) return -1;
    var n = 0;
    map.whiteboard = map.whiteboard.filter(function(w) {
        if (!w) return true;
        if (w.id === picId && w.flatPic === true) return false;
        if (w.flatIn === picId) { if (!(skip && skip[w.id] === 1)) n++; return false; }
        return true;
    });
    return n;
}
// 1.6.3 (Fulllion's ruling of 2026-11-17 on finding 16, "move with it", and its review): the pieces drawn into a flattened picture go wherever
// the picture goes, keeping their place beside it, whether it is moved, resized, turned or aligned. Each picture keeps its frame when its pieces
// were last placed beside it (flatAt: place, size and turn), and each piece where it stands beside the picture in the picture's own frame
// (flatOff). flatFollow, asked by io.js save() on every save of the machine that owns the campaign (at once, and again right before the step is
// recorded), places every piece of a picture whose frame changed from its flatOff alone, so it is idempotent: a piece dragged or nudged WITH its
// picture ends beside the picture once, never twice (the review's first finding), and a save that changes nothing moves nothing. Where the
// picture did not change, each piece's flatOff is taken again from where it stands, so a piece moved on its own (picked in Layers) keeps the
// place it was moved to. A resize scales each piece's place and size along the picture's own sides, and a turn turns each piece about the
// picture's middle and adds to its own turn, so a wall drawn into the picture stays on the wall the picture shows: exactly for a move, a turn
// and a resize that keeps the shape; a piece turned at a slant inside a picture stretched out of shape is placed by its middle and sized along
// its own sides. A picture flattened before 1.6.3 has no flatAt: flatAnchor notes its frame when the board first draws it (whiteboard.js render,
// before anyone can move it), and flatFollow moves nothing for a picture it finds with none. Answers how many pieces moved
function flatAnchor(w) {
    if (!w || w.flatPic !== true) return false;
    var b = flatBoxOf(w); if (!b) return false;
    if (flatFrame(w.flatAt, b)) return false;
    w.flatAt = flatAtOf(b);
    return true;
}
function flatFollow(map) {
    if (!map || !Array.isArray(map.whiteboard)) return 0;
    var pics = Object.create(null), any = false;
    map.whiteboard.forEach(function(w) {
        if (!w || w.flatPic !== true || typeof w.id !== 'string') return;
        var now = flatBoxOf(w); if (!now) return;
        var was = flatFrame(w.flatAt, now), fresh = !was;
        if (fresh) was = now;   // none noted yet (a file's, or one flattened before 1.6.3): noted now, nothing moved
        var changed = !fresh && (now.x !== was.x || now.y !== was.y || now.w !== was.w || now.h !== was.h || now.r !== was.r);
        pics[w.id] = { now: now, was: was, changed: changed }; any = true;
        if (fresh || changed || w.flatAt.w === undefined || w.flatAt.r === undefined) w.flatAt = flatAtOf(now);   // a first build's flatAt of a place alone is written whole
    });
    if (!any) return 0;
    var n = 0;
    map.whiteboard.forEach(function(w) {
        if (!w || typeof w.flatIn !== 'string') return;
        var P = pics[w.flatIn]; if (!P) return;
        var qb = flatBoxOf(w); if (!qb) return;
        if (!P.changed) { var rel = flatRel(P.now, qb); if (!flatSame(flatOffOf(w.flatOff), rel)) w.flatOff = rel; return; }
        var off = flatOffOf(w.flatOff) || flatRel(P.was, qb), sx = P.now.w / P.was.w, sy = P.now.h / P.was.h, a = P.now.r * Math.PI / 180;
        var only = sx === 1 && sy === 1 && P.now.r === P.was.r;   // a move alone: the piece's own size and turn, and no rounding
        var lx = off.dx * sx, ly = off.dy * sy, qw = off.w * sx, qh = off.h * sy;
        var cx = P.now.x + P.now.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), cy = P.now.y + P.now.h / 2 + lx * Math.sin(a) + ly * Math.cos(a);
        if (only) { w.x = cx - qb.w / 2; w.y = cy - qb.h / 2; }
        else {
            w.x = flatRound(cx - qw / 2); w.y = flatRound(cy - qh / 2);
            if (sx !== 1 || sy !== 1) { w.w = flatRound(qw); w.h = flatRound(qh); }
            if (P.now.r !== P.was.r) { var r = flatTurn(off.r + P.now.r); if (r || typeof w.rot === 'number') w.rot = flatRound(r); }
        }
        var nb = flatBoxOf(w); if (nb) w.flatOff = flatRel(P.now, nb);
        n++;
    });
    return n;
}
// 1.6.3, the review of finding 16 (Cut, Copy, Paste and Duplicate): the pieces drawn into a flattened picture among `items` that `items` does
// not already hold, from the map's list, so that a copy of the picture carries what is drawn into it
function flatKids(list, items) {
    var has = Object.create(null), pics = Object.create(null);
    (Array.isArray(items) ? items : []).forEach(function(w) { if (w && typeof w.id === 'string') { has[w.id] = 1; if (w.flatPic === true) pics[w.id] = 1; } });
    return (Array.isArray(list) ? list : []).filter(function(w) { return !!w && typeof w.flatIn === 'string' && pics[w.flatIn] === 1 && has[w.id] !== 1; });
}
// Copies made of pieces (a paste, a duplicate) named again for each other: `pairs` holds each copy (`it`, its new id already given) with the id
// of the piece it was made from (`old`). A piece drawn into a picture that was copied with it names the copy of that picture; one whose picture
// was not copied gets its own look back and names no picture; a copied picture none of whose pieces came with it is a plain picture, and one
// whose pieces came keeps where it stands now as its frame. Answers the set of new ids that are pieces drawn into a copied picture (out of sight)
function flatRemap(pairs) {
    var list = Array.isArray(pairs) ? pairs : [], to = Object.create(null), held = Object.create(null), kids = Object.create(null);
    list.forEach(function(p) { if (p && p.it && typeof p.old === 'string') to[p.old] = p.it.id; });
    list.forEach(function(p) { var it = p && p.it; if (it && typeof it.flatIn === 'string' && to[it.flatIn] !== undefined) held[it.flatIn] = 1; });
    list.forEach(function(p) {
        var it = p && p.it; if (!it) return;
        if (typeof it.flatIn === 'string' || it.flatIn !== undefined || it.flatOff !== undefined || it.flatWas !== undefined) {
            if (typeof it.flatIn === 'string' && to[it.flatIn] !== undefined) { it.flatIn = to[it.flatIn]; kids[it.id] = 1; }
            else flatFree(it);
        }
        if (it.flatPic === true && held[p.old] === 1) { var b = flatBoxOf(it); if (b) it.flatAt = flatAtOf(b); else delete it.flatAt; }
        else if (it.flatPic !== undefined || it.flatAt !== undefined) { delete it.flatPic; delete it.flatAt; }
    });
    return kids;
}
function flatWords(fp) {
    var d = fp.draw.length, g = fp.ghost.length, l = fp.left;
    return 'Flattened ' + d + (d === 1 ? ' piece' : ' pieces') + ' into one picture.' + (g ? ' ' + g + (g === 1 ? ' piece keeps its' : ' pieces keep their') + ' rules, drawing nothing.' : '') + (l ? ' ' + l + ' left as ' + (l === 1 ? 'it was' : 'they were') + '.' : '') + ' Unflatten on its right-click takes it apart.';
}
// [buildcheck:flatten-end]
function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('flatten v1', s, f || {}); } catch (e) {} }
function lay(map, fp, url) {
    flatLay(map, fp, url);
    if (window.wpSave) window.wpSave(true); if (window.appRender) window.appRender();
    step('done', { pieces: fp.draw.length, ghost: fp.ghost.length, left: fp.left });
    toast(flatWords(fp));
}
function undo(map, picId) {
    var n = flatUndo(map, picId); if (n < 0) return n;
    if (window.wpSave) window.wpSave(true); if (window.appRender) window.appRender();
    step('undone', { pieces: n });
    toast('Unflattened: ' + n + (n === 1 ? ' piece is' : ' pieces are') + ' back as ' + (n === 1 ? 'it was' : 'they were') + '.');
    return n;
}
if (typeof window !== 'undefined') window.wpFlatten = { lay: lay, undo: undo, follow: flatFollow };
export { flatLay, flatUndo, flatDrop, flatAnchor, flatFollow, flatKids, flatRemap, flatFree, flatFrame, flatOffOf, FLAT_LIM, flatWords };
