/* Flatten into one picture (1.6.2, backlog 39; the owner, 2026-11-07, by prompt: originals "Hidden, can be undone later", rule pieces "make the
   two choices optional", from "Right-click on a selection" and "Build's options", sharpness "Ask, as Save Map as Picture does"). The map picture's
   dialog plans and draws (mapshot.js, shotcore flatPlan); this lays the picture where the pieces were, in the map's list where the first of them
   stood, hides the plain pieces and keeps the pieces with rules drawing nothing, each naming the picture (flatIn) so that Unflatten puts them back
   as they were. One save each way, so one Undo takes either back. The GM's own campaign on this computer alone, as the dialog. */
function toast(t) { if (typeof window !== 'undefined' && typeof window.appToast === 'function') window.appToast(t); }   // the page's notice, through its window name, so the pure part loads in Node

// [buildcheck:flatten-start]
function flatId() { return 'wb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function flatLay(map, fp, url, id) {
    var pic = { id: id || flatId(), type: 'image', x: fp.box.x, y: fp.box.y, w: fp.box.w, h: fp.box.h, src: url, color: 'transparent', flatPic: true, flatAt: { x: fp.box.x, y: fp.box.y } };   // flatAt: where the picture stood when its pieces were last moved with it (flatFollow)
    if (fp.layer) pic.layer = fp.layer; if (fp.z) pic.z = fp.z;
    var first = map.whiteboard.indexOf(fp.draw[0]), hide = Object.create(null), ghost = Object.create(null);
    fp.hide.forEach(function(x) { hide[x] = 1; }); fp.ghost.forEach(function(x) { ghost[x] = 1; });
    map.whiteboard.forEach(function(w) {
        if (!w || typeof w.id !== 'string') return;
        if (hide[w.id] === 1) { w.hidden = true; w.flatIn = pic.id; }
        else if (ghost[w.id] === 1) { w.flatIn = pic.id; w.flatWas = { o: typeof w.opacity === 'number' ? w.opacity : null }; w.opacity = 0; }
    });
    map.whiteboard.splice(first >= 0 ? first : map.whiteboard.length, 0, pic);
    return pic;
}
// The pieces a picture names put back as they were and the picture taken away: how many came back, or -1 for no such picture. `skip`, a set of
// ids (1.6.3, delask.js), names pieces about to be deleted with the picture: they are put back all the same and are not counted
function flatUndo(map, picId, skip) {
    if (!map || !Array.isArray(map.whiteboard)) return -1;
    var at = -1; map.whiteboard.forEach(function(w, i) { if (w && w.id === picId && w.flatPic === true) at = i; }); if (at < 0) return -1;
    var n = 0; map.whiteboard.forEach(function(w) {
        if (!w || w.flatIn !== picId) return;
        if (w.flatWas && typeof w.flatWas === 'object') { if (typeof w.flatWas.o === 'number') w.opacity = w.flatWas.o; else delete w.opacity; delete w.flatWas; }
        else delete w.hidden;
        delete w.flatIn; if (!(skip && skip[w.id] === 1)) n++;
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
// 1.6.3 (Fulllion's ruling of 2026-11-17 on finding 16, "move with it"): the pieces drawn into a flattened picture move with the picture,
// keeping their place beside it. Each picture keeps where it stood when its pieces were last moved with it (flatAt). flatFollow moves every
// piece that names a picture by however far the picture has moved since, then notes where it stands now. io.js save() asks it right before it
// records the step, on the machine that owns the campaign alone, so a drag, a nudge, Properties' X and Y and anything else that moves the
// picture brings its pieces along in that same save and one Undo takes both back. A picture flattened before 1.6.3 has no flatAt: flatAnchor
// notes where it stands when the board first draws it (whiteboard.js render, before anyone can move it), and flatFollow moves nothing for a
// picture it finds with none. Answers how many pieces moved
function flatAnchor(w) {
    if (!w || w.flatPic !== true || typeof w.x !== 'number' || typeof w.y !== 'number' || !isFinite(w.x) || !isFinite(w.y)) return false;
    if (w.flatAt && typeof w.flatAt === 'object' && typeof w.flatAt.x === 'number' && typeof w.flatAt.y === 'number' && isFinite(w.flatAt.x) && isFinite(w.flatAt.y)) return false;
    w.flatAt = { x: w.x, y: w.y };
    return true;
}
function flatFollow(map) {
    if (!map || !Array.isArray(map.whiteboard)) return 0;
    var moved = Object.create(null), any = false;
    map.whiteboard.forEach(function(w) {
        if (!w || w.flatPic !== true || typeof w.id !== 'string') return;
        if (flatAnchor(w)) return;   // none noted yet: noted now, nothing moved
        if (typeof w.x !== 'number' || typeof w.y !== 'number' || !isFinite(w.x) || !isFinite(w.y)) return;
        var dx = w.x - w.flatAt.x, dy = w.y - w.flatAt.y;
        if (!dx && !dy) return;
        moved[w.id] = [dx, dy]; any = true;
        w.flatAt = { x: w.x, y: w.y };
    });
    if (!any) return 0;
    var n = 0;
    map.whiteboard.forEach(function(w) {
        if (!w || typeof w.flatIn !== 'string' || !moved[w.flatIn]) return;
        var d = moved[w.flatIn];
        if (typeof w.x === 'number' && isFinite(w.x)) w.x += d[0];
        if (typeof w.y === 'number' && isFinite(w.y)) w.y += d[1];
        n++;
    });
    return n;
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
if (typeof window !== 'undefined') window.wpFlatten = { lay: lay, undo: undo };
export { flatLay, flatUndo, flatDrop, flatAnchor, flatFollow, flatWords };
