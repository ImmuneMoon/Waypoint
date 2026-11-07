/* Flatten into one picture (1.6.2, backlog 39; the owner, 2026-11-07, by prompt: originals "Hidden, can be undone later", rule pieces "make the
   two choices optional", from "Right-click on a selection" and "Build's options", sharpness "Ask, as Save Map as Picture does"). The map picture's
   dialog plans and draws (mapshot.js, shotcore flatPlan); this lays the picture where the pieces were, in the map's list where the first of them
   stood, hides the plain pieces and keeps the pieces with rules drawing nothing, each naming the picture (flatIn) so that Unflatten puts them back
   as they were. One save each way, so one Undo takes either back. The GM's own campaign on this computer alone, as the dialog. */
function toast(t) { if (typeof window !== 'undefined' && typeof window.appToast === 'function') window.appToast(t); }   // the page's notice, through its window name, so the pure part loads in Node

// [buildcheck:flatten-start]
function flatId() { return 'wb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function flatLay(map, fp, url, id) {
    var pic = { id: id || flatId(), type: 'image', x: fp.box.x, y: fp.box.y, w: fp.box.w, h: fp.box.h, src: url, color: 'transparent', flatPic: true };
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
// The pieces a picture names put back as they were and the picture taken away: how many came back, or -1 for no such picture
function flatUndo(map, picId) {
    if (!map || !Array.isArray(map.whiteboard)) return -1;
    var at = -1; map.whiteboard.forEach(function(w, i) { if (w && w.id === picId && w.flatPic === true) at = i; }); if (at < 0) return -1;
    var n = 0; map.whiteboard.forEach(function(w) {
        if (!w || w.flatIn !== picId) return;
        if (w.flatWas && typeof w.flatWas === 'object') { if (typeof w.flatWas.o === 'number') w.opacity = w.flatWas.o; else delete w.opacity; delete w.flatWas; }
        else delete w.hidden;
        delete w.flatIn; n++;
    });
    map.whiteboard.splice(at, 1);
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
export { flatLay, flatUndo, flatWords };
