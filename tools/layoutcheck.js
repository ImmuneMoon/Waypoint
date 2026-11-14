// The layout editor (1.6.2, backlog 224; the owner, 2026-11-13, by prompt: "View menu and Settings (Recommended)", "Drag, and a card of
// places (Recommended)", "Every side, edge or box (Recommended)", "Each computer its own (Recommended)"): layout.js imported and run, first
// its pure core (the cleaner, the nine places, a drop, the toolbar's side, what the others step in by), then the module on a page of plain
// objects (nothing written with no layout, a layout drawn, a narrow area and the other map putting it all back, the edit mode and Escape),
// and every place that wires it pinned. Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      layoutcheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app'), read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const rootRead = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;

// A page of plain objects: elements by id with a class list, a style that holds variables, a size and a place
function classes(el) {
    const s = new Set();
    return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c), toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }, list: () => [...s].sort(), get length() { return s.size; } };
}
function page(o) {
    o = o || {};
    const els = {}, store = Object.assign({}, o.store || {}), toasts = [];
    const mk = (id, box) => {
        const vars = {};
        const e = { id, hidden: false, children: [], parentElement: null, classList: null, box: Object.assign({ x: 0, y: 0, w: 0, h: 0 }, box || {}),
            style: { setProperty(k, v) { vars[k] = String(v); }, getPropertyValue(k) { return vars[k] || ''; }, removeProperty(k) { delete vars[k]; }, vars },
            get offsetWidth() { return e.box.w; }, get offsetHeight() { return e.box.h; }, get clientWidth() { return e.box.w; }, get clientHeight() { return e.box.h; },
            getBoundingClientRect() { return { left: e.box.x, top: e.box.y, right: e.box.x + e.box.w, bottom: e.box.y + e.box.h, width: e.box.w, height: e.box.h }; },
            addEventListener() {}, appendChild(c) { e.children.push(c); return c; }, removeChild(c) { e.children.splice(e.children.indexOf(c), 1); }, get firstChild() { return e.children[0] || null; }, querySelector() { return null; }, querySelectorAll() { return []; }, contains(t) { return t === e; }, closest() { return null; }, matches() { return false; }, focus() {}, click() {} };
        e.classList = classes(e); els[id] = e; return e;
    };
    const main = mk('main', { x: 34, y: 40, w: 1246, h: 720 });
    mk('wbFloatingToolbar', { x: 256, y: 678, w: 800, h: 52 }); mk('dataFloatingToolbar', { x: 500, y: 678, w: 300, h: 52 }); mk('wbEdgeTools', { x: 1204, y: 534, w: 50, h: 130 });
    mk('zoomBox', { x: 1040, y: 66, w: 226, h: 36 }); mk('minimap', { x: 78, y: 66, w: 180, h: 180 }); mk('partyStrip', { w: 0, h: 0 }); mk('trkStrip', { x: 266, y: 66, w: 230, h: 28 });
    mk('combatStrip', { w: 0, h: 0 }); mk('joinCard', { w: 0, h: 0 }); mk('dataFind', { x: 78, y: 66, w: 400, h: 32 });
    ['layCard', 'layPart', 'layTags', 'layShade'].forEach(id => { mk(id, { w: 300, h: 400 }).hidden = true; });
    Object.values(els).forEach(e => { if (e !== main) e.parentElement = main; });
    const body = { classList: null, id: 'body' }; body.classList = classes(body); (o.body || []).forEach(c => body.classList.add(c));
    const doc = { body, readyState: 'complete', activeElement: null, getElementById: id => els[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => mk('x' + Math.random()) };
    const win = { view: o.view === undefined ? 'play' : o.view, appToast: t => toasts.push(t) };
    win.wpFloats = { view: () => win.view };
    return { els, doc, win, store, toasts, body };
}
function install(P) {
    global.window = P.win; global.document = P.doc;
    global.localStorage = { getItem: k => (k in P.store ? P.store[k] : null), setItem: (k, v) => { P.store[k] = String(v); }, removeItem: k => { delete P.store[k]; } };
    global.getComputedStyle = () => ({ getPropertyValue: () => '', top: '0px' });
    global.requestAnimationFrame = f => f();
}

(async () => {
    // a page with no window while the module loads: nothing is wired at import
    delete global.window; delete global.document;
    const L = await import(url('layout.js'));
    const C = L.cleanLayout, A = { w: 1000, h: 600, t: 26, l: 44, r: 14, b: 8 };

    // 1. the cleaner: a layout is read back only as data, and a layout that says nothing is no layout
    check('the cleaner answers null for anything that is no layout, and for a layout that sets nothing (the page then draws as before)',
        [null, undefined, '', '{', '[]', '1', 'null', [], 5, 'x'.repeat(20001), {}, { play: {} }, { play: { bar: { side: 'bottom', edge: false, hide: false } } }, { data: { bar: { side: 'sideways' } } }, { play: { parts: { nowhere: { c: 'tl' } } } }]
            .every(x => C(x) === null));
    const one = C(JSON.stringify({ play: { bar: { side: 'top', edge: true, hide: 1 }, parts: { minimap: { c: 'tr', x: 12.6, y: 'a' }, zoomBox: { c: 'top' }, dataFind: { c: 'bl' }, wbEdgeTools: { c: 'mc', x: 1e9, y: -1e9 } }, colHide: true }, data: { bar: { side: 'free' }, colHide: true, parts: { wbEdgeTools: { c: 'tl' }, dataFind: { c: 'bc', x: 3, y: 4 } } }, extra: 1 }));
    check('the cleaner keeps a known side, a true edge and hide only as true, a known place per known control of that map (offsets whole and held to 20000), the column\'s hiding on the play map alone, and drops the rest',
        J(one) === J({ v: 1, play: { bar: { side: 'top', edge: true, hide: false }, parts: { wbEdgeTools: { c: 'mc', x: 20000, y: -20000 }, minimap: { c: 'tr', x: 13, y: 0 } }, colHide: true }, data: { bar: { side: 'bottom', edge: false, hide: false }, parts: { dataFind: { c: 'bc', x: 3, y: 4 } } } }), J(one));
    const proto = C('{"__proto__":{"bar":{"side":"top"}},"play":{"__proto__":{"x":1},"bar":{"side":"left","edge":true,"constructor":1},"parts":{"__proto__":{"c":"tl"},"minimap":{"c":"br","__proto__":{"c":"tl"}}}}}');
    check('a key named __proto__ reaches nothing: neither the layout, a view, the bar nor a place takes it',
        J(proto) === J({ v: 1, play: { bar: { side: 'left', edge: true, hide: false }, parts: { minimap: { c: 'br', x: 0, y: 0 } } } }) && ({}).bar === undefined && Object.getPrototypeOf(proto.play.parts) === Object.prototype, J(proto));
    check('a free bar keeps its place, never an edge; a free bar without a place goes back to the bottom',
        J(L.cleanBar({ side: 'free', edge: true, at: { c: 'bl', x: 5, y: 6 } })) === J({ side: 'free', edge: false, hide: false, at: { c: 'bl', x: 5, y: 6 } }) && J(L.cleanBar({ side: 'free', edge: true })) === J({ side: 'bottom', edge: true, hide: false }));

    // 2. the nine places
    const box = { w: 100, h: 40 };
    const xy = c => J(L.spotXY({ c, x: 0, y: 0 }, box, A));
    check('a place stands at its spot, kept clear of the rulers and the edges: the corners, the middles of the edges and the middle',
        xy('tl') === J({ x: 44, y: 26 }) && xy('tr') === J({ x: 886, y: 26 }) && xy('bl') === J({ x: 44, y: 552 }) && xy('br') === J({ x: 886, y: 552 })
        && xy('tc') === J({ x: 450, y: 26 }) && xy('mc') === J({ x: 450, y: 280 }) && xy('ml') === J({ x: 44, y: 280 }) && xy('mr') === J({ x: 886, y: 280 }) && xy('bc') === J({ x: 450, y: 552 }),
        [xy('tl'), xy('tr'), xy('bl'), xy('br'), xy('tc'), xy('mc')].join(' '));
    check('an offset counts inward from a right or bottom spot, and no place stands outside the area, however far it says',
        J(L.spotXY({ c: 'br', x: 10, y: 20 }, box, A)) === J({ x: 876, y: 532 }) && J(L.spotXY({ c: 'tl', x: -500, y: 9000 }, box, A)) === J({ x: 44, y: 552 })
        && J(L.spotXY({ c: 'tl', x: 0, y: 0 }, { w: 5000, h: 5000 }, A)) === J({ x: 44, y: 26 }) && J(L.spotXY(null, box, A)) === J({ x: 44, y: 26 }));
    let round = true, bad = '';
    for (let x = -50; x <= 1000; x += 37) for (let y = -50; y <= 600; y += 29) {
        const sp = L.spotOf(x, y, box, A), back = L.spotXY(sp, box, A), hx = Math.max(44, Math.min(886, x)), hy = Math.max(26, Math.min(552, y));
        if (back.x !== Math.round(hx) || back.y !== Math.round(hy)) { round = false; bad = J([x, y, sp, back]); }
    }
    check('a drop keeps the place it was let go at: the spot is the third its middle stands in, and the offset brings it back to the same pixel', round, bad);
    check('a drop is held to the third its middle stands in',
        L.spotOf(60, 40, box, A).c === 'tl' && L.spotOf(450, 280, box, A).c === 'mc' && L.spotOf(860, 540, box, A).c === 'br' && L.spotOf(450, 540, box, A).c === 'bc' && L.spotOf(860, 280, box, A).c === 'mr');

    // 3. the toolbar dropped, and what the others step in by
    const was = { side: 'right', edge: true, hide: true };
    check('the toolbar dropped at the middle of an edge takes that side, as a box or across the edge as it was, hidden as it was; at a corner or the middle it stands free there',
        J(L.barOf({ c: 'tc' }, was)) === J({ side: 'top', edge: true, hide: true }) && L.barOf({ c: 'bc' }, was).side === 'bottom' && L.barOf({ c: 'ml' }, was).side === 'left' && L.barOf({ c: 'mr' }, was).side === 'right'
        && J(L.barOf({ c: 'tl', x: 3, y: 4 }, was)) === J({ side: 'free', edge: false, hide: true, at: { c: 'tl', x: 3, y: 4 } }) && L.barOf({ c: 'mc' }, null).side === 'free');
    check('the others step in from the side the toolbar takes by its depth and 8 px; a bar at the bottom, a free one or a hidden one moves nobody',
        J(L.pushOf({ side: 'top' }, { top: 18, bottom: 70, left: 0, right: 1000 }, A)) === J({ t: 52, l: 0, r: 0 })
        && J(L.pushOf({ side: 'left' }, { left: 44, right: 90, top: 0, bottom: 0 }, A)) === J({ t: 0, l: 54, r: 0 })
        && J(L.pushOf({ side: 'right', edge: true }, { left: 957, right: 1000, top: 0, bottom: 0 }, A)) === J({ t: 0, l: 0, r: 37 })
        && [{ side: 'bottom', edge: true }, { side: 'free', at: { c: 'tl' } }, { side: 'top', hide: true }].every(b => J(L.pushOf(b, { top: 0, bottom: 300, left: 0, right: 300 }, A)) === J({ t: 0, l: 0, r: 0 })));
    check('the bar\'s classes: its side, a side as a column, across the edge, hidden; the bottom as a box is none',
        J(L.barClasses({ side: 'left', edge: true, hide: true })) === J(['lay-left', 'lay-side', 'lay-edge', 'lay-hide']) && J(L.barClasses({ side: 'bottom' })) === J([]) && J(L.barClasses({ side: 'free', at: { c: 'mc' } })) === J(['lay-free']));
    const w1 = L.layWith(null, 'play', { part: ['minimap', { c: 'br', x: 1, y: 2 }] }), w2 = L.layWith(w1, 'play', { part: ['minimap', null] }), w3 = L.layWith(w1, 'data', { part: ['wbEdgeTools', { c: 'tl' }] });
    check('one change made to a layout: a place set, a place taken off back to no layout at all, and a control the map has not refused',
        J(w1) === J({ v: 1, play: { bar: { side: 'bottom', edge: false, hide: false }, parts: { minimap: { c: 'br', x: 1, y: 2 } } } }) && w2 === null && J(w3) === J(w1)
        && J(L.layWith(null, 'play', { colHide: true })) === J({ v: 1, play: { bar: { side: 'bottom', edge: false, hide: false }, parts: {}, colHide: true } }));

    // 4. the module on a page: nothing written with no layout
    let P = page(); install(P);
    const API = L.API;
    const snap = p => J(Object.values(p.els).map(e => [e.id, e.classList.list(), e.style.vars]).concat([['body', p.body.classList.list()]]));
    const before = snap(P); API.sync();
    check('with no layout the page is left exactly as it was: no class, no variable, nothing held', snap(P) === before && !API.held(P.els.minimap));
    // a layout drawn
    P.store.wp_layout = J({ play: { bar: { side: 'top', edge: true }, parts: { minimap: { c: 'tr', x: 0, y: 0 } } } });
    P.els.wbFloatingToolbar.box = { x: 34, y: 58, w: 1246, h: 52 };   // as the style sheet stands it across the top, under the rulers
    API.sync();
    const E = P.els, mv = E.main.style.vars;
    check('a layout is drawn: the body says so, the bar takes its side and its edge, the others step down by the bar\'s depth, and a placed control stands at its place below it',
        P.body.classList.contains('lay-on') && J(E.wbFloatingToolbar.classList.list()) === J(['floating-toolbar', 'lay-bar', 'lay-edge', 'lay-top'].filter(c => c !== 'floating-toolbar').sort())
        && mv['--lay-t'] === '26px' && mv['--lay-et'] === '18px' && mv['--lay-pt'] === (18 + 52 + 8 - 26) + 'px' && mv['--lay-pl'] === '0px'
        && E.minimap.classList.contains('lay-at') && E.minimap.style.vars['--lay-x'] === (1246 - 14 - 180) + 'px' && E.minimap.style.vars['--lay-y'] === (26 + 52) + 'px' && API.held(E.minimap)
        && !E.zoomBox.classList.contains('lay-at') && E.wbEdgeTools.classList.contains('lay-low'), J([E.wbFloatingToolbar.classList.list(), mv, E.minimap.style.vars]));
    // the other map: the play map's layout goes, the data map has none
    P.win.view = 'data'; API.sync();
    check('on the Data Map the play map\'s layout is taken off whole (it has one of its own), and nothing stays held',
        !P.body.classList.contains('lay-on') && E.wbFloatingToolbar.classList.length === 0 && !E.minimap.classList.contains('lay-at') && !('--lay-pt' in mv) && !API.held(E.minimap));
    P.store.wp_layout = J({ play: { bar: { side: 'top' } }, data: { bar: { side: 'left' }, parts: { dataFind: { c: 'bc' } } } }); API.sync();
    check('the Data Map\'s own layout: its toolbar and its Find strip, and the play map\'s toolbar untouched',
        E.dataFloatingToolbar.classList.contains('lay-left') && E.dataFloatingToolbar.classList.contains('lay-side') && E.dataFind.classList.contains('lay-at') && E.wbFloatingToolbar.classList.length === 0);
    // a narrow area, a page, the stream window
    P.win.view = 'play'; API.sync(); const onPlay = E.wbFloatingToolbar.classList.contains('lay-top');
    P.body.classList.add('area-narrow'); API.sync();
    check('on a narrow area every control goes back to its own place, and comes back laid out when there is room',
        onPlay && !P.body.classList.contains('lay-on') && E.wbFloatingToolbar.classList.length === 0 && !E.dataFind.classList.contains('lay-at') && (P.body.classList.remove('area-narrow'), API.sync(), E.wbFloatingToolbar.classList.contains('lay-top')));
    P.win.view = 'page'; API.sync(); const offPage = !P.body.classList.contains('lay-on');
    P.win.view = 'play'; P.win.wpStream = true; API.sync();
    check('on a page and in the stream window nothing is laid out', offPage && !P.body.classList.contains('lay-on') && E.wbFloatingToolbar.classList.length === 0);
    delete P.win.wpStream;
    // the edit mode and Escape
    P.win.view = ''; const noMap = API.edit(true);
    P.win.view = 'play'; P.body.classList.add('area-narrow'); const narrowNo = API.edit(true); P.body.classList.remove('area-narrow');
    const yes = API.edit(true);
    check('the edit mode opens only on a map with room, saying why not otherwise, and shows its card',
        noMap === false && narrowNo === false && yes === true && API.editing() && P.body.classList.contains('lay-edit') && E.layCard.hidden === false && E.layShade.hidden === false
        && J(P.toasts) === J(['Open a map to change its layout.', 'Make the window wider to change the layout.']), J(P.toasts));
    E.layPart.hidden = false; API.escape(); const partFirst = E.layPart.hidden === true && API.editing();
    API.escape();
    check('Escape puts a control\'s card away first, then leaves the edit mode', partFirst && !API.editing() && !P.body.classList.contains('lay-edit') && E.layCard.hidden === true);
    API.edit(true); P.body.classList.add('area-narrow'); API.sync();
    check('the edit mode closes by itself when the area turns narrow', !API.editing() && E.layCard.hidden === true);
    P.body.classList.remove('area-narrow');
    // a side bar fitted as a column; a bar across an edge measured by what it holds
    E.wbFloatingToolbar.classList.add('lay-side'); P.body.classList.add('lay-on'); E.wbFloatingToolbar.box.h = 900; E.wbFloatingToolbar.children = [];
    const fitted = API.fitSide(E.wbFloatingToolbar), cols = E.wbFloatingToolbar.classList.contains('lay-cols') && E.wbFloatingToolbar.classList.contains('tb-tight');
    E.wbFloatingToolbar.classList.remove('lay-side'); const plain = API.fitSide(E.wbFloatingToolbar);
    E.wbFloatingToolbar.classList.add('lay-edge'); API.measure(E.wbFloatingToolbar, true); const meas = E.wbFloatingToolbar.classList.contains('lay-meas'); API.measure(E.wbFloatingToolbar, false);
    check('a bar down a side too tall for the area tightens, then takes two columns; any other is left to fitBar, and a bar across an edge is measured by what it holds',
        fitted === true && cols && plain === false && meas && !E.wbFloatingToolbar.classList.contains('lay-meas'));

    // 5. the wiring, pinned
    const lay = read('scripts/layout.js'), ix = read('index.html'), css = read('style.css'), wb = read('scripts/whiteboard.js'), mn = read('scripts/main.js'), tr = read('scripts/trackers.js'), esc = read('scripts/esckey.js'), st = read('scripts/settings.js');
    const once = id => ix.split(' id="' + id + '"').length === 2;
    check('the page loads the module and holds its controls once each: Edit layout on both maps\' View menus, the edit mode\'s card and a control\'s card, Settings\' Layout part',
        ix.includes('<script type="module" src="scripts/layout.js"></script>') && ['wbEditLayoutBtn', 'dataEditLayoutBtn', 'layCard', 'layPart', 'layTags', 'layShade', 'layHideTick', 'layColHideTick', 'layResetBtn', 'layDoneBtn', 'layPartBackBtn', 'setLaySide', 'setLayEdge', 'setLayHideBtn', 'setLayHideState', 'setLayEditBtn', 'setLayResetBtn'].every(once)
        && ['rulers', 'zoom', 'pointer', 'selbar'].every(k => ix.includes('data-lay-show="' + k + '"') && st.includes(k + ': [')) && ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].every(c => ix.includes('data-lay-spot="' + c + '"')));
    check('the switches of the card press the very switch Settings and the View menu press (settings.js viewSwitch), and the layout is this computer\'s key, read only through the cleaner',
        lay.includes("window.wpViewSwitch(k)") && lay.includes("var LAY_KEY = 'wp_layout';") && lay.includes('try { raw = localStorage.getItem(LAY_KEY); }') && lay.includes('_lay.lay = cleanLayout(raw);') && !/wpNet|net\.send|sendTo/.test(lay));
    check('every rule of the style sheet that moves a control waits for body.lay-on, which only a layout writes',
        (() => { const blk = css.slice(css.indexOf('/* 1.6.2 (backlog 224): the layout editor')); const rules = blk.split('\n').filter(l => /^[^ /].*\{/.test(l)); return rules.length > 40 && rules.every(l => /^(body\.lay-on|body\.lay-edit|body\.stream-mode|body:not\(\.lay-on\)|#lay|\.lay-hot|\.lay-tag|#layHotCol)/.test(l)); })());
    check('the narrow area and the stream window are this module\'s first questions, and a window of its own is never wired',
        /function layView\(\) \{\n    if \(window\.wpPopout \|\| window\.wpStream \|\| document\.body\.classList\.contains\('stream-mode'\)\) return '';/.test(lay) && lay.includes("on = !!v && !layNarrow()") && lay.includes("if (typeof window === 'undefined' || typeof document === 'undefined' || window.wpPopout || window.wpStream) return;"));
    check('the board asks it once the boxes are switched, and with no map; fitBar and optsFit ask it first; cornerFit and the trackers bar leave a placed box where it stands; Escape asks it',
        mn.includes("      if (window.wpFloats) window.wpFloats.sync();\n      if (window.wpLayout) window.wpLayout.sync();") && (mn.match(/window\.wpLayout\.sync\(\)/g) || []).length === 2
        && wb.includes('if (lay && lay.fitSide(_wbTb)) return;') && wb.includes('try { fitRow(); } finally { if (lay) lay.measure(_wbTb, false); }') && wb.includes("if (typeof window !== 'undefined' && window.wpLayout && window.wpLayout.menuFit(menu)) return;")
        && mn.includes('var hit = both && !held && mm.offsetLeft') && tr.includes('window.wpLayout.held(mm)') && esc.includes("contains('lay-edit')) return { act: 'close', layer: { el: doc.getElementById('layCard'), close: function() { if (win.wpLayout) win.wpLayout.escape(); } } };"));
    const help = ix.slice(ix.indexOf('<h4>The layout of the map</h4>'), ix.indexOf('<h4>Turning with your token</h4>'));
    const wn = [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')];
    check('Help says it in plain words (Edit layout, the four sides, across the edge, the pointer coming near, Put back, Escape, the narrow window), and both release notes have it the same',
        help.length > 400 && ['Edit layout', 'Across the edge', 'Show it only when the pointer comes near', 'Put back', 'Esc', 'narrow', 'Data Map', 'this computer'].every(w => help.includes(w)) && !/[;—(]/.test(help.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, "'"))
        && wn.every(t => /Lay out your table/.test(t)) && wn[0].match(/Lay out your table[\s\S]*?\n\n/)[0] === wn[1].match(/Lay out your table[\s\S]*?\n\n/)[0]);
    check('CI runs this suite under a plain name', /- name: layoutcheck, the layout editor [^\n:]*\n\s+if: \$\{\{ !cancelled\(\) \}\}\n\s+run: node tools\/layoutcheck\.js/.test(rootRead('.github/workflows/checks.yml').replace(/\r\n/g, '\n')));

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(e => { console.log('FAIL      layoutcheck threw: ' + (e && e.stack || e)); summed = true; process.exit(1); });
