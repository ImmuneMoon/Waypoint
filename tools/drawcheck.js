// Drawing in Waypoint (1.6.2, backlog 232): drawcore.js imported and run (the drawing's size, the copies a stroke is drawn at, a fill that
// wraps, a color picked, a brush's spacing, the layers' list, undo and redo, the selection and its turn, the zoom, what it starts from),
// and the paint window (drawwin.js), the pack maker's Draw…, the page, the styles, Escape, Help and both release notes pinned.
// Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      drawcheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app'), read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;
(async () => {
    const D = await import(url('drawcore.js'));
    // the size
    check('the drawing\'s size: cells across and down at a cell\'s pixels, a pattern t by t cells, held to 2048 a side by one scale for both so its shape stays, and said when held',
        J(D.canvasFor(2, 1, 200)) === J({ w: 400, h: 200, scaled: false }) && J(D.canvasFor(4, 4, 800)) === J({ w: 2048, h: 2048, scaled: true })
        && J(D.canvasFor(2, 1, 1600)) === J({ w: 2048, h: 1024, scaled: true }) && J(D.canvasFor(NaN, 'x', -5)) === J({ w: 1, h: 1, scaled: false }), J(D.canvasFor(2, 1, 1600)));
    // the copies
    const c0 = D.copiesOf(100, 50, false, false), cm = D.copiesOf(100, 50, false, true), cw = D.copiesOf(100, 50, true, false), cwm = D.copiesOf(100, 50, true, true);
    check('where a stroke is drawn: the plain stroke first; Mirror adds its copy across the middle; a pattern adds the eight neighbors that wrap it, a whole drawing away; both make eighteen',
        J(c0) === J([{ flip: false, dx: 0, dy: 0 }]) && cm.length === 2 && cm[1].flip === true && cm[1].dx === 0 && cw.length === 9 && cw.filter(c => c.dx === -100 && c.dy === 50).length === 1 && cw.every(c => !c.flip) && cwm.length === 18
        && J(D.copyPt(cm[1], 10, 7, 100)) === J({ x: 90, y: 7 }) && J(D.copyPt({ flip: false, dx: -100, dy: 0 }, 98, 5, 100)) === J({ x: -2, y: 5 }), J(cw));
    // the fill
    const W = 6, H = 4, px = () => new Uint8ClampedArray(W * H * 4), set = (a, x, y, c) => { const j = (y * W + x) * 4; a[j] = c[0]; a[j + 1] = c[1]; a[j + 2] = c[2]; a[j + 3] = c[3]; }, at = (a, x, y) => [...a.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
    const wall = px(); for (let y = 0; y < H; y++) set(wall, 2, y, [0, 0, 0, 255]);
    const RED = [200, 0, 0, 255], a1 = wall.slice(), n1 = D.flood(a1, W, H, 0, 0, RED, 32, false);
    check('a fill takes the pixels joined to where it is pressed, of a color within the tolerance, and stops at a wall: 8 of a 6 by 4 split by a column',
        n1 === 8 && J(at(a1, 1, 3)) === J(RED) && J(at(a1, 3, 0)) === J([0, 0, 0, 0]) && J(at(a1, 2, 1)) === J([0, 0, 0, 255]), n1);
    const a2 = wall.slice(), n2 = D.flood(a2, W, H, 0, 0, RED, 32, true);
    check('a pattern\'s fill wraps round the edges: past the left edge it reaches the right side, so the clear on both sides of the column is one place (20 pixels)',
        n2 === 20 && J(at(a2, 5, 2)) === J(RED) && J(at(a2, 2, 0)) === J([0, 0, 0, 255]), n2);
    const near = px(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(near, x, y, [10, 10, 10, 250]); set(near, 1, 1, [0, 0, 0, 255]); const a3 = near.slice(), n3 = D.flood(a3, W, H, 0, 0, [5, 5, 5, 255], 32, false), a4 = near.slice(), n4 = D.flood(a4, W, H, 0, 0, [5, 5, 5, 255], 0, false);
    check('the tolerance: a dark gray and a black pixel are one place at 32 and two at 0; a fill of the color already there, a press outside, a size that is none and bytes too short each change nothing',
        n3 === 24 && n4 === 23 && D.flood(a1.slice(), W, H, 0, 0, RED, 32, false) === 0 && D.flood(px(), W, H, -1, 0, RED, 32, false) === 0 && D.flood(px(), 0, H, 0, 0, RED) === 0 && D.flood(new Uint8ClampedArray(4), W, H, 0, 0, RED) === 0, [n3, n4]);
    const big = new Uint8ClampedArray(2048 * 2048 * 4), t0 = Date.now(), nb = D.flood(big, 2048, 2048, 1000, 1000, RED, 32, true);
    check('a fill of a whole drawing of 2048 by 2048 takes every pixel and ends in reasonable time', nb === 2048 * 2048 && Date.now() - t0 < 8000, [nb, Date.now() - t0]);
    const fm = D.floodMask(wall, W, H, 0, 0, 32, false), before = J([...wall]);
    check('the review of 232: where a fill reaches, without changing the bytes, for the window to lay the color over them at the stroke\'s opacity; flood writes those very pixels',
        fm.n === 8 && fm.mask[0] === 1 && fm.mask[2] === 0 && fm.mask[3] === 0 && J([...wall]) === before && D.floodMask(wall, W, H, -1, 0, 32, false) === null && D.floodMask(wall, W, H, NaN, 0) === null, fm && fm.n);
    // colors
    check('a color\'s text: six hex digits in lower case, three spread to six, anything else none; read back as its three numbers; the color picked where something is drawn, none where it is clear or outside',
        D.cleanHex('#ABCDEF') === '#abcdef' && D.cleanHex('#abc') === '#aabbcc' && D.cleanHex('red') === '' && D.cleanHex(null) === '' && J(D.rgbOf('#3b2a1b')) === J([59, 42, 27]) && J(D.rgbOf('nope')) === J([0, 0, 0])
        && D.hexOf(300, -4, 15.6) === '#ff0010' && J(D.pickAt(a1, W, H, 0, 0)) === J({ hex: '#c80000', a: 1 }) && D.pickAt(a1, W, H, 4, 0) === null && D.pickAt(a1, W, H, 9, 0) === null);
    // the brush
    const r1 = D.dabsAlong(0, 0, 10, 0, 4, 0), r2 = D.dabsAlong(10, 0, 20, 0, 4, r1.carry);
    check('a brush lays its dabs every gap pixels and carries what is left to the next segment, so a stroke drawn in two parts lays as one (0, 4, 8, then 12, 16, 20); a gap of nothing is held to a quarter pixel and a run to 20,000 dabs',
        J(r1.pts.map(p => p.x)) === J([0, 4, 8]) && J(r2.pts.map(p => p.x)) === J([12, 16, 20]) && D.dabsAlong(0, 0, 1, 0, 0, 0).pts.length === 5 && D.dabsAlong(0, 0, 1e9, 0, 1, 0).pts.length === 20000 && D.dabsAlong(0, 0, NaN, 0, 1, 0).pts.length === 0, J([r1, r2]));
    // the layers
    const L1 = [{ id: 'a', name: 'Layer 1', hidden: false, op: 1 }], ad = D.layerAdd(L1, 'b', 0), ad2 = D.layerAdd(ad.list, 'c', 0);
    check('a layer is added right above the one drawn on, named Layer and the next number not taken, and a drawing holds 8 at most',
        J(ad.list.map(l => l.id)) === J(['a', 'b']) && ad.at === 1 && ad.list[1].name === 'Layer 2' && J(ad2.list.map(l => l.id)) === J(['a', 'c', 'b']) && ad2.list[1].name === 'Layer 3'
        && D.layerAdd(Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, name: 'Layer ' + (i + 1) })), 'z', 0) === null && D.layerAdd(null, 'z') === null && L1.length === 1);
    const mv = D.layerMove(ad2.list, 1, 1), dl = D.layerDel(ad2.list, 2);
    check('a layer moved one step up or down, never past an end; one removed takes the one under it as the one drawn on, and the last is never removed',
        J(mv.list.map(l => l.id)) === J(['a', 'b', 'c']) && mv.at === 2 && D.layerMove(ad2.list, 2, 1) === null && D.layerMove(ad2.list, 0, -1) === null
        && J(dl.list.map(l => l.id)) === J(['a', 'c']) && dl.at === 1 && D.layerDel(L1, 0) === null && D.layerDel(ad2.list, 9) === null);
    check('a layer\'s name: one line, its spaces tidied, 40 characters at most; an opacity held to 0 and 1 by hundredths, one that is no number solid',
        D.layerName('  Lid\n of\tthe  chest ') === 'Lid of the chest' && D.layerName('x'.repeat(60)).length === 40 && D.layerName(5) === '' && D.cleanOp(0.456) === 0.46 && D.cleanOp(2) === 1 && D.cleanOp(-1) === 0 && D.cleanOp('a') === 1);
    // undo and redo
    const h = D.histNew(), state = { v: 0 }, swap = e => { const back = { v: state.v, bytes: 1 }; state.v = e.v; return back; };
    D.histPush(h, { v: 0, bytes: 1 }); state.v = 1; D.histPush(h, { v: 1, bytes: 1 }); state.v = 2;
    const u1 = D.histUndo(h, swap), s1 = state.v, u2 = D.histUndo(h, swap), s2 = state.v, u3 = D.histUndo(h, swap), r = D.histRedo(h, swap), s3 = state.v;
    D.histPush(h, { v: 9, bytes: 1 });
    check('undo puts each step back in turn and redo takes it forward again by the same swap; nothing is left to undo at the start; a new step empties redo',
        u1 && s1 === 1 && u2 && s2 === 0 && u3 === false && r && s3 === 1 && h.redo.length === 0, J([s1, s2, s3, h]));
    const hb = D.histNew(); for (let i = 0; i < 60; i++) D.histPush(hb, { i: i, bytes: 1 }); const hm = D.histNew(); for (let i = 0; i < 5; i++) D.histPush(hm, { i: i, bytes: 100 * 1024 * 1024 });
    check('undo keeps the newest 40 steps and lets the oldest go past 256 MB of pictures, keeping the newest always',
        hb.undo.length === 40 && hb.undo[0].i === 20 && hm.undo.length === 2 && hm.undo[1].i === 4, [hb.undo.length, hm.undo.length]);
    // shapes and the selection
    check('a box from two corners in either order, with Shift its sides alike toward the second corner; a line with Shift held to 15 degrees',
        J(D.rectOf(10, 10, 4, 20, false)) === J({ x: 4, y: 10, w: 6, h: 10 }) && J(D.rectOf(0, 0, -3, 8, true)) === J({ x: -8, y: 0, w: 8, h: 8 })
        && Math.abs(D.constrain(0, 0, 10, 1).y) < 1e-9 && Math.abs(D.constrain(0, 0, 10, 10.4).x - D.constrain(0, 0, 10, 10.4).y) < 1e-9);
    const sel = { x: 10, y: 10, w: 20, h: 10, a: 0 }, turned = { x: 10, y: 10, w: 20, h: 10, a: Math.PI / 2 };
    check('a press on a selection: on its turn handle above its top\'s middle, inside it, or outside; the handle and the inside follow its turn',
        D.selHit(sel, 20, -10, 8, 20) === 'turn' && D.selHit(sel, 15, 15, 8, 20) === 'in' && D.selHit(sel, 50, 50, 8, 20) === null && D.selHit(turned, 40, 15, 8, 20) === 'turn' && D.selHit(turned, 20, 22, 8, 20) === 'in' && D.selHit(turned, 12, 11, 8, 20) === null && D.selHit(null, 0, 0) === null);
    check('the turn from a selection\'s middle to the pointer, from straight up, by 15 degrees with Shift; a point turned about another',
        Math.abs(D.turnBy(0, 0, 10, 0, false) - Math.PI / 2) < 1e-9 && Math.abs(D.turnBy(0, 0, 10, -1, true) - Math.PI / 2) < 1e-9 && Math.abs(D.turnBy(0, 0, 0, -5, false)) < 1e-9
        && Math.abs(D.rotPt(1, 0, 0, 0, Math.PI / 2).y - 1) < 1e-9);
    // the view and the start
    check('the view\'s zoom: the largest step at which the drawing fits, never under an eighth; the steps in and out stop at their ends',
        D.fitZoom(120, 120, 468, 476) === 3 && D.fitZoom(2048, 2048, 400, 400) === 0.125 && D.zoomStep(1, 1) === 1.5 && D.zoomStep(8, 1) === 8 && D.zoomStep(0.125, -1) === 0.125 && D.zoomStep(1.2, 1) === 1.5);
    check('what it may start from: your picture where there is one (first, so it opens on it), then Clear, then Waypoint\'s drawing where it has one',
        J(D.startChoices(true, true).map(c => c.v)) === J(['mine', 'clear', 'wp']) && J(D.startChoices(false, true).map(c => c.v)) === J(['clear', 'wp']) && J(D.startChoices(false, false).map(c => c.v)) === J(['clear']));
    check('a tool\'s key, with nothing held: P, B, E, G, L, R, C, T, S and I, in either case; any other key none; every tool has one',
        D.toolOfKey('p') === 'pen' && D.toolOfKey('B') === 'brush' && D.toolOfKey('i') === 'pick' && D.toolOfKey('x') === null && D.toolOfKey('pp') === null && D.toolOfKey('toString') === null
        && D.TOOLS.every(t => Object.values(D.TOOL_KEYS).indexOf(t) >= 0) && D.cleanText('a\u0000b' + 'c'.repeat(300)).length === 200);
    const cs = read('scripts/drawcore.js');
    check('drawcore.js is pure: no page, no canvas, no clock, no randomness, and imports nothing',
        !/\b(document|window\.(?!wpDrawCore)|Date\.now|Math\.random|getContext|localStorage)\b/.test(cs.replace(/if \(typeof window !== 'undefined'\) window\.wpDrawCore = API;/, '')) && !/^import /m.test(cs));

    // the window and its wiring
    const dw = read('scripts/drawwin.js'), ix = read('index.html'), css = read('style.css'), esc = read('scripts/esckey.js'), fp = read('scripts/furnpack.js');
    const box = ix.slice(ix.indexOf('<div id="paintModal"'), ix.indexOf('<!-- Map objects (1.6.0)'));
    const ids = ['paintBox', 'paintTitle', 'paintSize', 'paintStart', 'paintTools', 'paintColor', 'paintSwatches', 'paintSizeR', 'paintOpR', 'paintFilledRow', 'paintFilled', 'paintFontRow', 'paintFont', 'paintStage', 'paintPaper', 'paintLayers', 'paintLayerAdd', 'paintLayerUp', 'paintLayerDown', 'paintLayerMerge', 'paintLayerDel', 'paintLayerOp', 'paintTileBox', 'paintTile', 'paintMirror', 'paintTraceRow', 'paintTrace', 'paintZoomOut', 'paintZoomIn', 'paintZoomFit', 'paintLine', 'paintUndo', 'paintRedo', 'paintClearLayer', 'paintCancel', 'paintDone'];
    check('the window is in the page once as fixed words: its ' + ids.length + ' parts, each once in the whole page, no script and no handler in its markup, every tool a button that says its name and its key',
        ix.split('id="paintModal"').length === 2 && ids.every(i => box.includes('id="' + i + '"') && ix.split('id="' + i + '"').length === 2) && !/<script|\son[a-z]+=/i.test(box)
        && D.TOOLS.every(t => new RegExp('data-tool="' + t + '" aria-pressed="false" aria-label="[^"]+" title="[^"]+ \\(' + Object.keys(D.TOOL_KEYS).find(k => D.TOOL_KEYS[k] === t).toUpperCase() + '\\)"').test(box)), ids.filter(i => !box.includes('id="' + i + '"')));
    const LINE = 'M5 19L19 5M3.5 17.5l3 3M17.5 3.5l3 3', BRUSH = 'M15.5 3.5l5 5-7.5 7.5-5-5zM8 11c-2.5.3-4 2-4 4.5 0 1.6-.7 3-1.5 4 3.5.5 7.5-.5 8.5-3.5', DROP = 'M15 3.5a2.5 2.5 0 0 1 3.5 0l2 2a2.5 2.5 0 0 1 0 3.5L18 11.5 12.5 6zM13.5 8L5 16.5V19h2.5L16 10.5M3.5 20.5l1.5-1.5';
    const own = id => { const i = ix.indexOf('id="' + id + '"'), m = /<path d="([^"]+)"/.exec(ix.slice(i, i + 900)); return m ? m[1] : ''; };
    const toolD = t => { const m = new RegExp('data-tool="' + t + '"[^>]*><svg class="ico"[^>]*><path d="([^"]+)"').exec(box); return m ? m[1] : ''; };
    check('the tools wear the app\'s own drawings where it has one (the pen, eraser, fill, rectangle, circle and text the toolbar\'s, select the Select tool\'s), and the three the owner passed for line, soft brush and pick a color (2026-11-13: "Line with end ticks", "Paintbrush, swept tip", "Eyedropper")',
        toolD('pen') === own('drawModeBtn') && toolD('eraser') === own('eraserModeBtn') && toolD('fill') === own('fillModeBtn') && toolD('rect') === own('shapeRectBtn') && toolD('circle') === own('shapeCircBtn') && toolD('text') === own('shapeTextBtn') && toolD('select') === own('moveModeBtn')
        && toolD('line') === LINE && toolD('brush') === BRUSH && toolD('pick') === DROP, J(D.TOOLS.map(toolD)));
    check('Escape: the window is the router\'s, pressed shut by Cancel; a selection that floats or words being typed keep their own Escape (.pw-hold), which puts them back and leaves the window up',
        esc.includes("['furnPackModal', 'furnPackClose'], ['paintModal', 'paintCancel'],") && esc.includes("if (escAt(t, '.pw-hold')) return true;") && dw.includes("function hold() { var b = $('paintBox'); if (b && _p) b.classList.toggle('pw-hold', !!(_p.float || _p.textEl)); }")
        && dw.includes("if (k === 'Escape') { if (_p.float) { stop(); floatCancel(); } return; }"));
    check('every key pressed in the window is the window\'s (the arrows, Delete and the letters never reach the map behind), a key that lands outside it while it is up too (the focus lost to the page), but for a question it asked; Tab goes round its own controls; a paste while it is up lays nothing on the map',
        dw.includes("m.addEventListener('keydown', function(ev) { key(ev, false); });") && dw.includes("document.addEventListener('keydown', keyOut, true);") && /\n    ev\.stopPropagation\(\);\n\}\n\/\/ Tab and Shift\+Tab/.test(dw) && dw.includes("if (ev.key === 'Tab') { tabRound(ev); return; }")
        && dw.includes("if (t && t.closest && t.closest('#customConfirm, #customPrompt')) return;")
        && dw.includes("window.addEventListener('paste', function(ev) { if (!_p) return; var t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; ev.preventDefault(); ev.stopPropagation(); }, true);"));
    check('the window keeps nothing: no storage, no save, no send, and no markup written from anything (layers and their names are elements and text nodes)',
        !/localStorage|sessionStorage|(^|[^.\w])save\(|wpNet|innerHTML|insertAdjacentHTML|outerHTML/.test(dw) && dw.includes("nm = el('button', 'pw-lname', L.name)"));
    check('Done: what every visible layer makes at its own opacity, a PNG of 4 MB at most handed to the caller as a File, never while a stroke, a selection or words are left half done; Cancel asks first where something was drawn; the start a pattern made for the window let go when it closes',
        dw.includes("(_p.textEl ? textCommit() : Promise.resolve()).then(function() { if (_p === d) finish(d, b); });") && dw.includes("function finish(d, b) {\n    if (_p.float) floatStamp();\n    var out = cv(_p.w, _p.h), g = out.getContext('2d'); compose(g, 1, false);") && dw.includes('if (blob.size > PIC_MAX)') && dw.includes("fn(new File([blob], 'drawing.png', { type: 'image/png' }))")
        && dw.includes("showConfirm('Close the drawing without keeping it?'") && dw.includes("w.url.slice(0, 5) === 'blob:') URL.revokeObjectURL(w.url);"));
    check('a merge keeps how the two layers looked: each drawn at its own opacity, the merged layer solid',
        dw.includes("if (!lo.hidden) { g.globalAlpha = lo.op; g.drawImage(lo.cv, 0, 0); }\n    if (!up1.hidden) { g.globalAlpha = up1.op; g.drawImage(up1.cv, 0, 0); }") && dw.includes('lo.op = 1; lo.hidden = false;'));
    check('the pack maker: Draw… beside Use a picture…, at the size the picked square asks for (a furnishing\'s cells, a pattern\'s or block\'s cells a picture covers, the template\'s pixels), Waypoint\'s drawing to start from or trace (a block\'s its material\'s pattern), and Done going through makerUse as a picked file does, only on the square it was drawn for',
        fp.includes("import './drawwin.js';") && fp.includes("drw = btn('tool', 'Draw…'") && fp.includes('bar.appendChild(use); bar.appendChild(drw); bar.appendChild(clr);')
        && fp.includes("if (_m === d && d.sel === key) makerUse(file); else toast('The pack maker moved on, so the drawing was not kept.');") && fp.includes('o.tile = t;') && fp.includes('o.cells = [kind.w, kind.h];') && fp.includes("o.wp = { url: F.furnSrc({ k: p[0], era: p[1] }) };") && fp.includes('var tb = await texPng(tex, px, t);'));
    check('the styles: the window over the pack maker and under the app\'s questions, its stage, layers, ticks and sliders the app\'s own',
        css.includes('#paintModal { z-index: 99992; }') && css.includes('#furnMakerModal { z-index: 99991; }') && /z-index:100010/.test(ix.slice(ix.indexOf('id="customConfirm"'), ix.indexOf('id="customConfirm"') + 300)) && css.includes('.pw-check input[type=checkbox] { width: 16px; height: 16px; margin: 0; flex: 0 0 16px; accent-color: var(--gold); cursor: pointer; }') && css.includes('.pw-slide input[type=range] { accent-color: var(--gold);'));
    const hAt = ix.indexOf('<li><b>Draw…</b> beside'), help = ix.slice(hAt, hAt + 1600), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt');
    check('Help says it, and both release notes', hAt > 0 && help.includes('comes back on the other, so it tiles with no seam') && /Layers stack/.test(help) && ix.includes('Pick a square, then <b>Use a picture</b> or <b>Draw…</b>.') && wn.includes('Draw') && wn.includes('paint') && wa.includes('paint'));
    check('the review of 232, the window: words typed are drawn before Done composes and when another tool is picked, at once where the font is there and fetched as the Text tool is picked; the eraser takes its stroke off once at the stroke\'s opacity, previewed meanwhile; a fill lays its color over what is there at the opacity; a shape\'s mirrored copies are drawn whole and laid down once; the live 3 by 3 shows a selection that floats; the words\' box follows the zoom and the size and keeps its focus',
        dw.includes("if (ready || !document.fonts.load) { go(); return Promise.resolve(); }") && dw.includes("if (_p.tool !== 'text' && _p.tool !== 'select') floatStamp();") && dw.includes("if (t === 'text') fontWarm();")
        && dw.includes("if (s.buf || s.erase) { var g = ctxOf(L.cv); g.save(); g.globalAlpha = _p.op; if (s.erase) g.globalCompositeOperation = 'destination-out';") && dw.includes('function erasePrev() {')
        && dw.includes("var m = D.floodMask(id.data, _p.w, _p.h, p.x, p.y, D.DRAW.TOL, _p.wrap)") && dw.includes("g.save(); g.globalAlpha = _p.op; g.drawImage(_p.tmp, 0, 0); g.restore(); bar(); log('fill', {});")
        && dw.includes("function shapeAt(g, t, a, b, alpha) {") && dw.includes("if (withBuf && i === _p.at && _p.float) { g.globalAlpha = L.op; g.save(); g.scale(s, s); floatOn(g); g.restore(); }")
        && dw.includes("if (_p.textEl) { pp.appendChild(_p.textEl); textPlace(); if (typing) _p.textEl.focus(); }"));
    check('the review of 232, the focus and the rest: a layer\'s control pressed keeps the focus, and one that went off as it was pressed hands it to the drawing; closing gives it back to what opened the window; Start from with only a redo left asks first; the font list shows the font the words are drawn in; a second window is refused and the maker lets go of a start made for a window that never opened',
        dw.includes("_p.lfocus = { id: L.id, part: 'pw-eye' };") && dw.includes('if (ae && ae.disabled && $(\'paintBox\') && $(\'paintBox\').contains(ae)) stageFocus();') && dw.includes("if (back && back.isConnected && typeof back.focus === 'function') back.focus(); else if (typeof again === 'function') again();")
        && dw.includes("var anyInk = _p.hist.undo.length > 0 || _p.hist.redo.length > 0;") && dw.includes("_p.font = f0; var pfo = $('paintFont'); if (pfo) pfo.value = f0;") && dw.includes("if (!D || !m || !opts || _p) return false;")
        && fp.includes("if (!F || !_m || !P || P.shown()) return;") && fp.includes("if (_m !== d || d.sel !== key) { gone(); return; }") && fp.includes("if (!P.open(o)) gone();"));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
