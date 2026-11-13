// furncheck — furnishings (1.6.2, backlog 222; the owner, 2026-11-12, by prompt: "Drawn now, painted later", "Build's Objects tab (Recommended)",
// any version on any map, a tint, and of what a furnishing does, "The system says"; the look "Use these drawings" and "Yes, use the set").
// furncore.js imported and run: the 21 kinds in four looks, each drawing made of the module's constants, what a piece keeps of a furnishing
// against hostile input, its size, its words. objcore's furnRule and furnProps run for real: the rules a map object that names a kind gives,
// the system's first. The palette's own judges (furnish.js, its [furncheck:pal-*] slice) and the board's drop (whiteboard.js, its
// [furncheck:drop-*] slice) run on plain objects. Fold 2, packs: the core's pack half, a pack's look placed as the piece's own picture, the palette's
// Looks, the packs window's own judges (furnpack.js, its [furncheck:packwin-*] slice) and Properties of a look from a pack. The map's picture, the wire both ways and a file's import run for real. The page, the
// Properties block, Rules for, the styles, Help and both release notes pinned. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
const slice = (s, t) => { const a = s.indexOf('// [' + t + '-start]'), b = s.indexOf('// [' + t + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + t); return s.slice(s.indexOf(NL, a) + 1, b); };
const count = (s, t) => s.split(t).length - 1;
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    const U = p => url.pathToFileURL(app(p)).href;
    const FU = await import(U('scripts/furncore.js')), O = await import(U('scripts/objcore.js')), S = await import(U('scripts/shotcore.js')), CU = await import(U('scripts/cleanup.js'));
    const fuSrc = read('scripts/furncore.js'), ocSrc = read('scripts/objcore.js'), fnSrc = read('scripts/furnish.js'), wbSrc = read('scripts/whiteboard.js'), netSrc = read('scripts/net.js');
    const insSrc = read('scripts/inspector.js'), moSrc = read('scripts/mapobjects.js'), ix = read('index.html'), css = read('style.css'), mainSrc = read('scripts/main.js'), cuSrc = read('scripts/cleanup.js'), scSrc = read('scripts/shotcore.js');
    const KEYS = ['chest', 'crate', 'barrel', 'cabinet', 'chair', 'bench', 'stool', 'sofa', 'bed', 'bedroll', 'table', 'desk', 'bookshelf', 'hearth', 'counter', 'workbench', 'light', 'plant', 'statue', 'sacks', 'rug'];
    const ERAS = ['fantasy', 'victorian', 'modern', 'futuristic'];

    // ---- the pure core ----
    check('the set the owner passed: 21 kinds in six groups and four looks, in that order, all frozen, and the core publishes what it exports',
        J(FU.FURN_KINDS.map(k => k.key)) === J(KEYS) && J(FU.FURN_ERAS.map(e => e.id)) === J(ERAS) && J(FU.FURN_ERAS.map(e => e.label)) === J(['Fantasy', 'Victorian', 'Modern', 'Futuristic'])
        && J(FU.FURN_GROUPS) === J(['Storage', 'Seating and rest', 'Tables and shelves', 'Kitchen and work', 'Lighting', 'Decor']) && [FU.FURN_KINDS, FU.FURN_ERAS, FU.FURN_GROUPS].every(Object.isFrozen)
        && FU.FURN_KINDS.every(k => Object.isFrozen(k) && FU.FURN_GROUPS.indexOf(k.group) >= 0 && /^[A-Z][a-z]+( [a-z]+)*$/.test(k.label)) && FU.FURN_GROUPS.every(g => FU.FURN_KINDS.some(k => k.group === g)),
        FU.FURN_KINDS.map(k => k.key));
    const bad = [];
    FU.FURN_KINDS.forEach(k => ERAS.forEach(e => { const s = FU.furnSvg({ k: k.key, era: e }); if (!s || /undefined|NaN|null|Infinity/.test(s) || !/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="0 0 \d+ \d+">[\s\S]+<\/svg>$/.test(s) || /<script|on[a-z]+=|href|url\(|<image|<foreignObject/i.test(s)) bad.push(k.key + ':' + e); }));
    check('every one of the 84 drawings is made: one svg of the module\'s shapes, sized by its cells, with no undefined, no NaN, no script, no handler, no link, no picture and no address in it',
        bad.length === 0 && FU.furnSvg({ k: 'table', era: 'modern' }).indexOf('width="100" height="50"') > 0 && FU.furnSvg({ k: 'chest', era: 'fantasy' }).indexOf('width="50" height="50"') > 0, bad);
    const tinted = FU.furnSvg({ k: 'chest', era: 'fantasy', tint: '#1f7a8c' }), plain = FU.furnSvg({ k: 'chest', era: 'fantasy' });
    check('a tint paints the main colour: it is in the drawing, the plain one does not hold it, and the drawing is otherwise made the same way',
        tinted.indexOf('#1f7a8c') > 0 && plain.indexOf('#1f7a8c') < 0 && tinted !== plain && FU.furnSvg({ k: 'chest', era: 'fantasy', tint: '#1F7A8C' }) === tinted);
    const hostile = [null, 1, 'chest', [], {}, { k: 'chest' }, { era: 'fantasy' }, { k: 'Chest', era: 'fantasy' }, { k: 'chest', era: 'Fantasy' }, { k: '__proto__', era: 'fantasy' }, { k: 'constructor', era: 'modern' }, { k: 'chest', era: 'toString' }, { k: 'toString', era: 'fantasy' }, Object.create({ k: 'chest', era: 'fantasy' })];
    check('what is no furnishing is none: no kind, no look, another case, a prototype\'s name, an inherited key, a list, a word, a number; and nothing of it is drawn',
        hostile.every(v => FU.cleanFurn(v) === null && FU.furnSvg(v) === '' && FU.furnSrc(v) === '' && FU.furnWords(v) === ''), hostile.filter(v => FU.cleanFurn(v) !== null));
    const tints = ['#ABCDEF', '#abc', 'red', '#12345g', ' #123456', '#1234567', 7, { v: 1 }, 'url(x)', '#123456;x'].map(t => FU.cleanFurn({ k: 'bed', era: 'modern', tint: t }));
    check('a piece keeps a furnishing as its kind, its look and a tint of six hex digits in lower case, and nothing else it was handed',
        J(FU.cleanFurn({ k: 'bed', era: 'modern', tint: '#ABCDEF', src: '/x.png', extra: 1 })) === J({ k: 'bed', era: 'modern', tint: '#abcdef' }) && tints.slice(1).every(c => J(c) === J({ k: 'bed', era: 'modern' })), tints);
    check('its words, its address and its size: Chest, Fantasy; a data address of the drawing alone; a cell 50 square, or 60 by 52 on hexagons, a table two cells wide',
        FU.furnWords({ k: 'chest', era: 'fantasy' }) === 'Chest, Fantasy' && FU.furnSrc({ k: 'chest', era: 'fantasy' }) === 'data:image/svg+xml,' + encodeURIComponent(plain)
        && J(FU.furnSize('chest', false)) === J({ w: 50, h: 50 }) && J(FU.furnSize('chest', true)) === J({ w: 60, h: 52 }) && J(FU.furnSize('table', false)) === J({ w: 100, h: 50 }) && FU.furnSize('nope', false) === null
        && FU.furnKind('toString') === null && FU.furnKind('bed').label === 'Bed' && FU.eraLabel('modern') === 'Modern' && FU.eraLabel('x') === '');
    check('the core is pure: it imports nothing, names no page, storage, clock or chance, and the window only to publish itself; plain ASCII',
        !/^import /m.test(fuSrc) && fuSrc.split('window').length === 3 && fuSrc.includes("if (typeof window !== 'undefined') window.wpFurnCore = API;") && !/\b(document|localStorage|fetch|setTimeout|Date)\b|Math\.random|innerHTML/.test(fuSrc) && !/[^\x00-\x7f]/.test(fuSrc));

    // ---- the rules: a map object that names a kind ----
    check('a map object may name the kind it gives its rules to, by the core\'s own key alone, and its words say so first',
        O.cleanObj({ id: 'a', name: 'Heavy chest', furn: 'chest' }).furn === 'chest' && ['Chest', 'nope', 1, '__proto__', null].every(v => !('furn' in O.cleanObj({ id: 'a', name: 'x', furn: v })))
        && O.objWords({ id: 'a', name: 'x', furn: 'chest', cover: 'half' }) === 'Rules for Chest · Half cover' && O.objWords({ id: 'a', name: 'x', cover: 'half' }) === 'Half cover');
    const sysL = [{ id: 's1', name: 'Iron chest', furn: 'chest', cover: 'threeq', stops: true }], ownL = [{ id: 'c1', name: 'My chest', furn: 'chest', cover: 'half' }, { id: 'c2', name: 'Long table', furn: 'table', cover: 'half', w: 3 }, { id: 'c3', name: 'Wall shelf', furn: 'bookshelf', sight: true }];
    check('the rule for a kind is the first object that names it, the system\'s set before the campaign\'s own; a kind none names has none',
        O.furnRule([sysL, ownL], 'chest').id === 's1' && O.furnRule([[], ownL], 'chest').id === 'c1' && O.furnRule([null, ownL], 'table').id === 'c2' && O.furnRule([sysL, ownL], 'bed') === null && O.furnRule([sysL], 'nope') === null && O.furnRule('x', 'chest') === null);
    const pNone = O.furnProps({ k: 'table', era: 'victorian', tint: '#224466' }, [sysL, ownL.slice(0, 1)], false), pSys = O.furnProps({ k: 'chest', era: 'modern' }, [sysL, ownL], true), pBig = O.furnProps({ k: 'table', era: 'fantasy' }, [[], ownL], false), pWall = O.furnProps({ k: 'bookshelf', era: 'fantasy' }, [[], ownL], false);
    check('a furnishing no object names is a plain picture: the kind\'s own size, over the map\'s pictures, its name its words, no key of cover so the system\'s rule for pictures speaks, no picture path and no colour',
        J(pNone) === J({ name: 'Table, Victorian', layer: 'back-mid', w: 100, h: 50, furn: { k: 'table', era: 'victorian', tint: '#224466' }, color: 'transparent', fit: true }), pNone);
    check('a furnishing a map object names takes that object\'s rules: its name, cover and grade, what it stops or blocks, its size where the object names one and the kind\'s own where it does not, on hexagons too',
        pSys.name === 'Iron chest' && pSys.cover === 'yes' && pSys.coverAs === 'threeq' && pSys.barrier === true && pSys.w === 60 && pSys.h === 52 && !pSys.src && pSys.color === 'transparent' && pSys.fit === true && J(pSys.furn) === J({ k: 'chest', era: 'modern' })
        && pBig.w === 150 && pBig.h === 50 && pBig.coverAs === 'half' && pWall.blocksSight === true && pWall.sightType === 'wall' && pWall.w === 100 && pWall.h === 50 && O.furnProps({ k: 'nope', era: 'fantasy' }, [], false) === null, [pSys, pBig, pWall]);
    check('objcore imports the furnishings core alone beside fogcore and publishes the two', /\nimport \{ cleanFurn, furnKind, furnWords \} from '\.\/furncore\.js';/.test(ocSrc) && ocSrc.includes('furnRule: furnRule, furnProps: furnProps };'));

    // ---- the review of fold 1 ----
    const untinted = [];
    FU.FURN_KINDS.forEach(k => ERAS.forEach(e => { if (FU.furnSvg({ k: k.key, era: e, tint: '#123456' }) === FU.furnSvg({ k: k.key, era: e })) untinted.push(k.key + ':' + e); }));
    check('the review of fold 1: a tint changes every one of the 84 drawings, the seven that ignored it among them', untinted.length === 0, untinted);
    const cH = O.furnProps({ k: 'table', era: 'modern' }, [], false, { w: 100, h: 100 }), cR = O.furnProps({ k: 'chest', era: 'modern' }, [[{ id: 'r', name: 'Box', furn: 'chest', w: 2 }]], true, { w: 80, h: 70 }), cO = O.objProps({ id: 'a', name: 'Crate', w: 2 }, false, { w: 30, h: 40 });
    check('the review of fold 1: a furnishing and a map object are sized by the map\'s own cell where it is handed in, the kind\'s cells or the rule\'s, and by 50, or 60 by 52, where none is',
        cH.w === 200 && cH.h === 100 && cR.w === 160 && cR.h === 70 && cO.w === 60 && cO.h === 40 && O.objProps({ id: 'a', name: 'C' }, true, { w: 0, h: 'x' }).w === 60 && O.furnProps({ k: 'bed', era: 'modern' }, [], false, null).h === 100, [cH, cR, cO]);
    check('the review of fold 1: the palette sizes by the map\'s own lattice and redraws when a rule is renamed, and an object\'s own row places the furnishing it shows',
        fnSrc.includes("if (L.type === 'hex' && L.s > 0 && L.h > 0) return { w: 2 * L.s, h: L.h };") && fnSrc.includes("O.furnProps(f, ruleLists(campNow()), state.gridType === 'hex', cellNow(), src)") && fnSrc.includes("return r ? r.id + '=' + r.name : '';")
        && moSrc.includes("var fu = !o.src && o.furn && FS && C.furnProps ? C.furnProps({ k: o.furn, era: FS.era() }, [[o]], hex, cell) : null;") && moSrc.includes("close(); window.wpArmPlacement(fu ? 'image' : C.objType(o), p, o.name);") && moSrc.includes("save(); rows(); if (window.wpFurnish) window.wpFurnish.draw(); return true; }"));
    check('the review of fold 1: a character given a picture of its own shows it on the board and in the map\'s picture, the cast keeps a furnishing, and a portal\'s thumbnail follows a look',
        S.picOf({ type: 'image', isChar: true, src: '/saves/images/a.png', furn: { k: 'sofa', era: 'modern' } }) === '/saves/images/a.png' && S.picOf({ type: 'image', isChar: true, furn: { k: 'sofa', era: 'modern' } }) === FU.furnSrc({ k: 'sofa', era: 'modern' })
        && wbSrc.includes("furn: (window.wpFurnCore && it.furn ? window.wpFurnCore.cleanFurn(it.furn) : null) || undefined, w: it.w || 60,") && wbSrc.includes("if (c.furn && window.wpFurnCore) { var cf = window.wpFurnCore.cleanFurn(c.furn); if (cf) it.furn = cf; }")
        && read('scripts/mapshot.js').includes("Array.isArray(it.pts) ? it.pts.length : 0, it.furn || null]; }))"));
    // ---- the palette's judges ----
    const pal = new Function(slice(fnSrc, 'furncheck:pal') + '\nreturn { ruleLists, palModel, eraKept, foldsKept, furnWord, furnRead, packsOf, lookKept, tileTip };')();
    const pm = pal.palModel(FU, ''), pmF = pal.palModel(FU, '  CHE '), pmN = pal.palModel(FU, 'zzz');
    check('the palette: every group in order with its kinds, words typed keep the kinds whose name holds them in any case, nothing matched is no group',
        J(pm.map(g => g.group)) === J(FU.FURN_GROUPS) && pm.reduce((n, g) => n + g.kinds.length, 0) === 21 && J(pmF.map(g => g.kinds.map(k => k.key))) === J([['chest']]) && pmN.length === 0);
    check('what this computer keeps is read back as data: the look one of the four else the first, the folds only the core\'s own group names else Storage alone',
        pal.eraKept(FU, 'modern') === 'modern' && pal.eraKept(FU, '__proto__') === 'fantasy' && pal.eraKept(FU, null) === 'fantasy'
        && J(pal.foldsKept(FU, '["Decor","Storage","x","__proto__"]')) === J(['Storage', 'Decor']) && J(pal.foldsKept(FU, '{')) === J(['Storage']) && J(pal.foldsKept(FU, null)) === J(['Storage']) && J(pal.foldsKept(FU, '{"0":"Decor"}')) === J(['Storage']));
    check('a drag hands over the kind and the look as words, and only words that make a furnishing come back as one',
        pal.furnWord({ k: 'bed', era: 'modern' }) === 'bed:modern' && J(pal.furnRead(FU, 'bed:modern')) === J({ k: 'bed', era: 'modern' })
        && ['bed', 'bed:modern:x', 'bed:Modern', ':', '__proto__:fantasy', 5, null, 'x'.repeat(41) + ':modern', 'bed:modern\u0000'].every(s => pal.furnRead(FU, s) === null));
    check('a tile says where its rules come from, in plain words', pal.tileTip(FU, 'chest', { name: 'Iron chest' }) === 'Chest. Its rules come from your map object Iron chest. Click it, then click the map, or drag it there.'
        && pal.tileTip(FU, 'bed', null) === 'Bed. No map object gives it rules, so it is a plain picture. Click it, then click the map, or drag it there.' && J(pal.ruleLists({ system: { objects: [1] }, objects: [2] })) === J([[1], [2]]) && J(pal.ruleLists(null)) === J([null, null]));
    check('the palette writes no markup: elements and text nodes, a tile\'s picture the drawing\'s own address; it is draggable, places by the board\'s one placement, and logs its steps',
        !/innerHTML|insertAdjacentHTML|outerHTML|eval\(|new Function/.test(fnSrc) && fnSrc.includes("im.src = src || F.furnSrc({ k: k.key, era: _p.era });") && fnSrc.includes("b.draggable = true;") && fnSrc.includes("ev.dataTransfer.setData('application/x-wp-furn', furnWord(f));")
        && fnSrc.includes("window.wpArmPlacement('image', p, F.furnKind(f.k).label.toLowerCase());") && fnSrc.includes("if (window.wpPlace) window.wpPlace.sized = true;") && fnSrc.includes("window.wpStepLog('furnish v1'") && fnSrc.includes("localStorage.setItem('wp_furnEra', _p.era)"));

    // ---- the board: drawn from its words, dropped from the palette ----
    check('the board draws a furnishing from its words, every other picture as before; and the drop takes a furnishing before a file',
        wbSrc.includes("var FUd = window.wpFurnCore, fuD = item.furn && FUd && !item.src ? FUd.cleanFurn(item.furn) : null, wantSrc = fuD ? FUd.furnSrc(fuD) : resolveImg(item.src);") && count(wbSrc, 'resolveImg(item.src)') === 1
        && wbSrc.indexOf("if (wpFurn) { furnDropAt(wpFurn, e); return; }") > wbSrc.indexOf("if (wpPic) { libDropAt(wpPic, e); return; }") && wbSrc.indexOf("if (wpFurn) { furnDropAt(wpFurn, e); return; }") < wbSrc.indexOf("var f = e.dataTransfer.files[0];"));
    const dropRun = (o) => {
        const st = { viewMode: o.view || 'visual', selWbId: null, selWbIds: [1] }, am = o.map === undefined ? { type: 'map', whiteboard: [] } : o.map, toasts = [], saved = [];
        const win = { wpFurnCore: FU, wpFurnish: { read: s => { const p = s.split(':'); return FU.cleanFurn({ k: p[0], era: p[1] }); }, propsOf: f => O.furnProps(f, [o.rules || [], []], false) }, wpCanPersistLocal: () => o.mine !== false, wpSnapOn: () => !!o.snap, wpLatticeOf: () => ({ type: 'square', size: 50 }) };
        const fn = new Function('window', 'getActiveMap', 'state', 'toast', 'wbWrap', 'wbX', 'wbY', 'uid', 'newOpacityProps', 'save', 'render', 'snapToHex', slice(wbSrc, 'furncheck:drop') + '\nreturn furnDropAt;')(win, () => am, st, t => toasts.push(t), { getBoundingClientRect: () => ({}) }, (x) => x, (x, y) => y, () => 'u1', () => ({ opacity: 0.8 }), () => saved.push(1), () => {}, undefined);
        fn(o.str || 'bed:modern', { clientX: o.x === undefined ? 300 : o.x, clientY: o.y === undefined ? 200 : o.y });
        return { am, st, toasts, saved };
    };
    const d1 = dropRun({}), d2 = dropRun({ snap: true, x: 312, y: 236, str: 'chest:fantasy', rules: [{ id: 'r', name: 'Strongbox', furn: 'chest', cover: 'total' }] }), d3 = dropRun({ mine: false }), d4 = dropRun({ view: 'data' }), d5 = dropRun({ str: 'bed:Modern' });
    const p1 = d1.am.whiteboard[0], p2 = d2.am.whiteboard[0];
    check('a furnishing let go on the map lands with its middle under the pointer as a picture piece of its words, takes New item opacity, is selected and saved once',
        d1.am.whiteboard.length === 1 && p1.type === 'image' && p1.id === 'wbu1' && p1.x === 300 - 25 && p1.y === 200 - 50 && p1.w === 50 && p1.h === 100 && J(p1.furn) === J({ k: 'bed', era: 'modern' }) && p1.opacity === 0.8 && !p1.src
        && d1.st.selWbId === 'wbu1' && J(d1.st.selWbIds) === '[]' && d1.saved.length === 1 && d1.toasts[0] === 'Placed Bed, Modern.', [p1, d1.toasts]);
    check('with Snap on its corner sits on the lattice, and a map object that names its kind gives it its rules and its name',
        p2.x === 300 && p2.y === 200 && p2.cover === 'yes' && p2.coverAs === 'total' && p2.name === 'Strongbox' && d2.toasts[0] === 'Placed Strongbox.', p2);
    check('nothing is laid at someone else\'s table, on a page or the data map, or for words that make no furnishing, and the first two are said',
        d3.am.whiteboard.length === 0 && d3.toasts[0] === "Not while you're at someone else's table." && d4.am.whiteboard.length === 0 && d4.toasts[0] === 'Open a play map first.' && d5.am.whiteboard.length === 0 && d5.toasts.length === 0 && d5.saved.length === 0);
    const seatRun = (o) => { const st = { selWbId: 'p' }, it = { id: 'p', x: o.x, y: o.y, w: 50, h: 50 }, am = { whiteboard: [it] }, saved = [];
        new Function('getActiveMap', 'state', 'window', 'save', 'render', 'snapToHex', slice(wbSrc, 'furncheck:seat') + '\nreturn furnSeatNew;')(() => am, st, { wpSnapOn: () => o.snap, wpLatticeOf: () => o.lat }, () => saved.push(1), () => {}, (x, y) => ({ x: Math.round(x / 60) * 60, y: Math.round(y / 52) * 52 }))();
        return [it.x, it.y, saved.length]; };
    check('a furnishing placed by a click sits on the lattice where Snap is on, its corner on squares and its middle in a hex cell; with Snap off or no grid it stays and nothing is saved again',
        J(seatRun({ snap: true, x: 137, y: 62, lat: { type: 'square', size: 50 } })) === J([150, 50, 1]) && J(seatRun({ snap: true, x: 137, y: 62, lat: { type: 'square', size: 40, ox: 5, oy: 5 } })) === J([125, 45, 1])
        && J(seatRun({ snap: true, x: 137, y: 62, lat: { type: 'hex' } })) === J([155, 79, 1]) && J(seatRun({ snap: false, x: 137, y: 62, lat: { type: 'square', size: 50 } })) === J([137, 62, 0]) && J(seatRun({ snap: true, x: 137, y: 62, lat: null })) === J([137, 62, 0])
        && wbSrc.includes("    if (props.furn && !cell && !dragged) furnSeatNew();   // 1.6.2 (backlog 222)\n"));
    check('the Objects tab begins at Furnishings, with Map objects in it', wbSrc.includes("if (c.nextElementSibling && (c.nextElementSibling.id === 'buildFurn' || c.nextElementSibling.id === 'buildObjRows')) part = 'objects';"));

    // ---- the map's picture, the wire and a file ----
    check('the map\'s picture draws a furnishing as the board does, from its words, and a picture as before',
        S.picOf({ type: 'image', furn: { k: 'sofa', era: 'victorian' } }) === FU.furnSrc({ k: 'sofa', era: 'victorian' }) && S.picOf({ type: 'image', furn: { k: 'x', era: 'victorian' }, src: '/saves/images/a.png' }) === '/saves/images/a.png' && S.picOf({ type: 'image', furn: 'chest' }) === '');
    const wireStmt = /    if \(w\.furn !== undefined\) \{ var FUw = [^\n]*\n/.exec(netSrc), hostStmt = /if \(w\.furn !== undefined\) \{ var FUh = [^}]*\}[^}]*\}/.exec(netSrc);
    const runStmt = (st, w, win) => new Function('w', 'window', st + '\nreturn w;')(w, win);
    const wIn = () => [{ id: 'a', type: 'image', furn: { k: 'bed', era: 'modern', tint: '#AABBCC', src: 'x' } }, { id: 'b', type: 'image', furn: { k: 'nope', era: 'modern' } }, { id: 'c', type: 'rect', furn: { k: 'bed', era: 'modern' } }, { id: 'd', type: 'image', furn: 'bed' }];
    const wOut = wIn().map(w => runStmt(wireStmt[0], w, { wpFurnCore: FU })), hOut = wIn().map(w => runStmt(hostStmt[0], w, { wpFurnCore: FU })), wNo = wIn().map(w => runStmt(wireStmt[0], w, {})), hNo = wIn().map(w => runStmt(hostStmt[0], w, {}));
    check('on the wire both ways a furnishing is only its kind, its look and its tint, only on a picture, and none at all without the cleaner on hand',
        !!wireStmt && !!hostStmt && [wOut, hOut].every(L => J(L.map(w => w.furn || 'none')) === J([{ k: 'bed', era: 'modern', tint: '#aabbcc' }, 'none', 'none', 'none'])) && [wNo, hNo].every(L => L.every(w => !('furn' in w))),
        [wOut, hOut]);
    check('the host cleans it among the keys a shown piece leaves with, and a player\'s app right after a container\'s mark, so the box, the texture and the ground run as pinned',
        netSrc.includes("// the map builder: a shown piece's texture leaves only as a name of the app's own list, none without the cleaner (whatever a save held)\n    if (w.furn !== undefined) { var FUw")
        && netSrc.includes("if (w.waiting) return cleanWaitingItem(w); delete w.box; if (w.boxed !== 1) delete w.boxed; if (w.furn !== undefined) { var FUh") && count(netSrc, 'w.furn !== undefined') === 2);
    const icOf = () => ({ items: { m1: { id: 'm1', type: 'map', whiteboard: wIn() } } }), ic1 = icOf(), ic2 = icOf();
    CU.cleanImportItems(ic1, { FU: FU }); CU.cleanImportItems(ic2, {});
    check('a file\'s furnishing comes in as the core keeps it, on a picture alone, and none without the core; the import is handed the core',
        J(ic1.items.m1.whiteboard.map(w => w.furn || 'none')) === J([{ k: 'bed', era: 'modern', tint: '#aabbcc' }, 'none', 'none', 'none']) && ic2.items.m1.whiteboard.every(w => !('furn' in w))
        && mainSrc.includes('SU: window.wpSetupCore, FU: window.wpFurnCore }; }') && cuSrc.includes("if (w.furn !== undefined) { var FUd = deps && deps.FU"), J(ic1.items.m1.whiteboard));

    // ---- Properties, Rules for, the page, the styles, Help and the notes ----
    const insB = slice(insSrc, 'furncheck:insp');
    const insHtml = (w) => { let html = ''; new Function('w', 'window', 'esc', 'html0', insB.replace(/html \+=/g, 'html0.h +=') + '\n')(w, { wpFurnCore: FU }, s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), { set h(v) { html = v; }, get h() { return html; } }); return html; };
    const hA = insHtml({ type: 'image', furn: { k: 'chest', era: 'victorian', tint: '#112233' } }), hB = insHtml({ type: 'image', furn: { k: 'chest', era: 'victorian' } }), hC = insHtml({ type: 'image', src: '/saves/images/a.png' }), hD = insHtml({ type: 'rect', furn: { k: 'chest', era: 'victorian' } });
    check('Properties of a furnishing: its kind, its look picked from the four with its own selected, its tint with No tint, which is off with no tint; nothing for any other piece',
        hA.includes('<label for="wbFurnEra">Chest, drawn as</label>') && (hA.match(/<option /g) || []).length === 4 && hA.includes('<option value="victorian" selected>Victorian</option>') && hA.includes('id="wbFurnTint" value="#112233"')
        && hA.includes('id="wbFurnNoTint">No tint') && hB.includes('id="wbFurnNoTint" disabled>No tint') && hB.includes('value="#8a5a2b"') && hC === '' && hD === '', [hA, hC]);
    check('its handlers set the look and the tint through the core, and a furnishing is offered neither Align its grid nor Trim to cells',
        insSrc.includes("var furnSet = function(ch) { var FUh = window.wpFurnCore, cur = FUh ? FUh.cleanFurn(w.furn) : null, nx = cur ? FUh.cleanFurn(Object.assign({}, cur, ch)) : null; if (!nx) return; if (w.name === FUh.furnWords(cur)) w.name = FUh.furnWords(nx); w.furn = nx; save(); render(); };")
        && insSrc.includes("if (_el_wbFurnNoTint) _el_wbFurnNoTint.addEventListener('click', function() { furnSet({ tint: '' }); });") && count(insSrc, "state.gridType !== 'off' && !w.furn && w.type === 'image' && !w.isChar && !w.waiting ? '<button") === 2);
    check('a map object\'s Edit has Rules for, its kinds by name with No furnishing first, and an object that names one and has no picture shows its drawing',
        moSrc.includes("row('Rules for', fk);") && moSrc.includes("op0 = el('option', '', 'No furnishing')") && moSrc.includes("commit({ furn: fk.value || undefined })") && moSrc.includes("fsrc = !o.src && o.furn && FUt ? FUt.furnSrc({ k: o.furn, era: window.wpFurnish ? window.wpFurnish.era() : FUt.FURN_ERAS[0].id }) : ''"));
    check('the page: the palette on the Objects tab before Map objects, its script after the map objects\' own, the core brought by objcore',
        ix.includes('                  <div class="draw-menu-label">Furnishings</div>\n                  <div class="build-furn" id="buildFurn"></div>\n                  <div class="menu-rule"></div>\n                  <div class="draw-menu-label">Map objects</div>\n')
        && ix.includes('<script type="module" src="scripts/mapobjects.js"></script>\n<script type="module" src="scripts/furnish.js"></script>\n') && count(ix, 'id="buildFurn"') === 1 && fnSrc.includes("import './objcore.js';"));
    check('the styles: each drawing on a checker so its clear part shows, a tile marked Rules, and the Properties block',
        css.includes('.build-cell .furn-face { display: flex;') && css.includes('repeating-conic-gradient(#1c1c24 0 25%, #22222c 0 50%)') && css.includes('.furn-rule { position: absolute;') && css.includes('.insp-furn-tint { display: flex;'));
    const help = /<li><b>Furnishings:<\/b>[\s\S]*?<\/ul>\n\s*<\/li>/.exec(ix);
    check('Help says where they are, how to place them, where their rules come from, and the look and tint in Properties, in plain words',
        !!help && help[0].includes('Build&rsquo;s Objects tab') && help[0].includes('<b>Rules for</b>') && help[0].includes('<b>Tint</b>') && help[0].includes('<b>No tint</b>') && !/[;()–—]/.test(help[0].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')));
    const notes = [readRoot('WHATSNEW.txt'), read('assets/whatsnew.txt')].map(t => /\n- Furnishings: chairs, chests, beds, tables, lights, plants and more, 21 kinds\n[\s\S]*?take a tint\.\n/.exec(t));
    // ---- fold 2: packs ----
    const FC = await import(U('scripts/fogcore.js')), rule = FC.cleanTexSrc;
    check('a pack\'s id, a look\'s key and a pack\'s name: fp_ and 4 to 24 letters or digits; a kind and an era of the core\'s own; a name of 60 characters at most with no control character',
        FU.cleanPackId('fp_ab12') === 'fp_ab12' && ['fp_ab1', 'FP_ab12', 'fp_AB12', 'fp_' + 'a'.repeat(25), '__proto__', 5, null].every(v => FU.cleanPackId(v) === '')
        && FU.lookKey('chest', 'modern') === 'chest.modern' && FU.lookKey('toString', 'modern') === '' && FU.lookKey('chest', 'Modern') === ''
        && FU.packName('  Old\u0000Town  ') === 'Old Town' && FU.packName('x'.repeat(80)).length === 60 && FU.packName(5) === '' && FU.PACK_MAX === 24);
    const pk = FU.cleanPack({ id: 'fp_ab12', name: 'Woods', looks: { 'bed.modern': '/saves/images/fp_ab12/b.png', 'chest.fantasy': '/saves/images/fp_ab12/c.png', 'chest.x': '/saves/images/a.png', 'sofa.modern': 'https://x.test/a.png', 'crate.fantasy': '/saves/images/../data.json', toString: '/saves/images/a.png' }, extra: 1 }, rule);
    check('a pack keeps its id, its name and the looks whose kind, era and picture path are sound, in the core\'s own order; a web address or a walk is no look',
        J(pk) === J({ id: 'fp_ab12', name: 'Woods', looks: { 'chest.fantasy': '/saves/images/fp_ab12/c.png', 'bed.modern': '/saves/images/fp_ab12/b.png' } })
        && FU.cleanPack({ id: 'fp_ab12', name: 'W', looks: { 'chest.fantasy': '/saves/images/a.png' } }, null).looks['chest.fantasy'] === undefined
        && [null, [], 'x', { id: 'fp_ab12' }, { name: 'W' }, { id: 'bad', name: 'W' }].every(v => FU.cleanPack(v, rule) === null), pk);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: 'fp_' + String(1000 + i), name: 'P' + i, looks: {} }));
    check('a campaign\'s packs: each id once, 24 at most, a list alone; a pack\'s look by its kind and era, and how many it holds',
        FU.cleanPacks(many, rule).length === 24 && FU.cleanPacks([many[0], many[0], many[1]], rule).length === 2 && J(FU.cleanPacks({ a: many[0] }, rule)) === '[]'
        && FU.packLook(pk, 'chest', 'fantasy') === '/saves/images/fp_ab12/c.png' && FU.packLook(pk, 'chest', 'modern') === '' && FU.packLook(null, 'chest', 'fantasy') === '' && FU.packCount(pk) === 2 && FU.packCount(null) === 0);
    check('a look as a file is kind-era, and a file\'s name says its kind and era with a hyphen, an underscore or a space, in any case; nothing else is a look',
        FU.lookFile('chest', 'fantasy', 'webp') === 'chest-fantasy.webp' && FU.lookFile('chest', 'fantasy', 'exe') === 'chest-fantasy.png' && FU.lookFile('nope', 'fantasy', 'png') === ''
        && J(FU.lookOfFile('Sofa-Modern.PNG')) === J({ k: 'sofa', era: 'modern' }) && J(FU.lookOfFile('light_futuristic.webp')) === J({ k: 'light', era: 'futuristic' }) && J(FU.lookOfFile('bed victorian.jpeg')) === J({ k: 'bed', era: 'victorian' })
        && ['lamp-modern.png', 'chest-modern.gif', 'chest-modern.png.exe', 'x/chest-modern.png', 'chest--modern.png', 5].every(n => FU.lookOfFile(n) === null));
    const bytes = (a, n) => Uint8Array.from(a.concat(Array(Math.max(0, (n || 12) - a.length)).fill(0)));
    check('a picture\'s kind is read from its first bytes, never its name: png, jpeg and webp; anything else, or too short, is none',
        FU.picKind(bytes([0x89, 0x50, 0x4e, 0x47])) === 'png' && FU.picKind(bytes([0xff, 0xd8, 0xff])) === 'jpeg' && FU.picKind(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])) === 'webp'
        && FU.picKind(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])) === '' && FU.picKind(bytes([0x3c, 0x73, 0x76, 0x67])) === '' && FU.picKind(bytes([0x89, 0x50, 0x4e, 0x47], 8)) === '' && FU.picKind(null) === '');
    check('a piece keeps the pack its picture came from only as a sound id',
        J(FU.cleanFurn({ k: 'bed', era: 'modern', pack: 'fp_ab12' })) === J({ k: 'bed', era: 'modern', pack: 'fp_ab12' }) && !('pack' in FU.cleanFurn({ k: 'bed', era: 'modern', pack: '../x' })));
    const pP = O.furnProps({ k: 'chest', era: 'fantasy', pack: 'fp_ab12' }, [], false, null, '/saves/images/fp_ab12/c.png'), pQ = O.furnProps({ k: 'chest', era: 'fantasy', pack: 'fp_ab12' }, [], false, null, ''), pR = O.furnProps({ k: 'chest', era: 'fantasy', pack: 'fp_ab12' }, [], false, null, 'https://x.test/c.png'), pS = O.furnProps({ k: 'chest', era: 'fantasy' }, [], false, null, '/saves/images/fp_ab12/c.png');
    check('a look from a pack is placed with the pack\'s picture as the piece\'s own, through the campaign\'s picture rule; with no picture, or one the rule refuses, or no pack, it is Waypoint\'s drawing',
        pP.src === '/saves/images/fp_ab12/c.png' && pP.furn.pack === 'fp_ab12' && !pQ.src && !('pack' in pQ.furn) && !pR.src && !('pack' in pR.furn) && !pS.src, [pP, pQ, pR, pS]);
    check('a piece with a picture of its own shows it, on the board and in the map\'s picture; with none it is drawn from its words',
        S.picOf({ type: 'image', src: '/saves/images/fp_ab12/c.png', furn: { k: 'chest', era: 'fantasy', pack: 'fp_ab12' } }) === '/saves/images/fp_ab12/c.png' && scSrc.includes("var fu = item && item.furn && !item.src ? cleanFurn(item.furn) : null;"));
    check('a drag hands over a pack\'s look as kind, era and pack, and only a sound pack id comes back',
        pal.furnWord({ k: 'bed', era: 'modern', pack: 'fp_ab12' }) === 'bed:modern:fp_ab12' && J(pal.furnRead(FU, 'bed:modern:fp_ab12')) === J({ k: 'bed', era: 'modern', pack: 'fp_ab12' })
        && ['bed:modern:', 'bed:modern:fp_', 'bed:modern:fp_ab12:x'].every(s => pal.furnRead(FU, s) === null));
    const camP = { furnPacks: [{ id: 'fp_ab12', name: 'Woods', looks: {} }, { id: 'bad', name: 'X' }] };
    check('the palette reads a campaign\'s packs by the picture rule, and the look kept for a campaign only where it still has that pack',
        J(pal.packsOf(FU, camP, rule).map(p => p.id)) === J(['fp_ab12']) && J(pal.packsOf(FU, camP, null)) === '[]' && J(pal.packsOf(FU, {}, rule)) === '[]'
        && pal.lookKept('{"c1":"fp_ab12"}', 'c1', pal.packsOf(FU, camP, rule)) === 'fp_ab12' && pal.lookKept('{"c1":"fp_gone1"}', 'c1', pal.packsOf(FU, camP, rule)) === ''
        && pal.lookKept('{"__proto__":"fp_ab12"}', '__proto__', []) === '' && pal.lookKept('{', 'c1', pal.packsOf(FU, camP, rule)) === '' && pal.lookKept('{"c2":"fp_ab12"}', 'c1', pal.packsOf(FU, camP, rule)) === '');
    check('a kind the pack has no picture for is Waypoint\'s drawing, marked, and its tile says so',
        pal.tileTip(FU, 'bed', null, true) === 'Bed. This pack has no picture for it, so this is Waypoint\u2019s own drawing. No map object gives it rules, so it is a plain picture. Click it, then click the map, or drag it there.'
        && fnSrc.includes("if (pack && !src) b.appendChild(el('span', 'furn-base', 'Waypoint'));") && fnSrc.includes("sel.id = 'furnLooks';") && fnSrc.includes("pb.type = 'button'; pb.id = 'furnPacksBtn';"));
    const pwSrc = read('scripts/furnpack.js'), pw = new Function('PIC_MAX', slice(pwSrc, 'furncheck:packwin') + '\nreturn { packMay, packIdOf, readPackFile, importWords };')(4 * 1024 * 1024);
    check('the packs window is the GM\'s: never at someone else\'s table, never in the stream window, never where the campaign cannot be written',
        pw.packMay(null, {}) && !pw.packMay({ active: true, role: 'client' }, {}) && !pw.packMay({ stream: true }, {}) && !pw.packMay(null, { wpStream: true }) && !pw.packMay(null, { wpCanPersistLocal: () => false }) && pw.packMay({ active: true, role: 'host' }, { wpCanPersistLocal: () => true }));
    check('a new pack\'s id is one no pack in the lists holds',
        pw.packIdOf([], 0) === 'fp_0000' && pw.packIdOf([[{ id: 'fp_0000' }, { id: 'fp_00001' }]], 0) === 'fp_00002' && FU.cleanPackId(pw.packIdOf([], 2176782335)) === pw.packIdOf([], 2176782335) && FU.cleanPackId(pw.packIdOf(null, 'x')) === 'fp_0000');
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const rf = pw.readPackFile(FU, { wpfurn: 1, name: ' Woods ', looks: { 'chest.fantasy': png, 'chest.x': png, 'bed.modern': 'data:image/svg+xml;base64,PHN2Zz4=', 'sofa.modern': png + '"><script>', 'toString': png, 'crate.victorian': 5 } });
    check('a .wpfurn file is read as data: its name and each look\'s picture as a png, jpeg or webp data address under a kind and era of the core, every refusal counted by its reason',
        rf.name === 'Woods' && J(rf.looks) === J([{ k: 'chest', era: 'fantasy', data: png }]) && rf.left.kind === 2 && rf.left.picture === 3
        && [null, [], { looks: {} }, { wpfurn: 2 }, { wpfurn: '1' }].every(j => pw.readPackFile(FU, j) === null) && pw.readPackFile(FU, { wpfurn: 1 }).looks.length === 0, rf);
    check('an import says what it did, in plain words',
        pw.importWords('Woods', 3, { kind: 0, picture: 0, upload: 0 }) === 'Brought in Woods: 3 pictures.' && pw.importWords('Woods', 1, { kind: 1, picture: 2, upload: 1 }) === 'Brought in Woods: 1 picture. Left out: 1 names no kind and era, 2 are no png, jpeg or webp picture of 4 MB or less, 1 could not be saved.'
        && pw.importWords('A pack', 0, { kind: 2, picture: 0, upload: 0 }) === 'Nothing of A pack could be brought in. Left out: 2 name no kind and era.');
    check('the window writes no markup, checks each picture by its bytes and size before it uploads it, never reads a file past its cap, keeps the packs through the core, and logs its steps',
        !/innerHTML|insertAdjacentHTML|outerHTML|eval\(|new Function/.test(pwSrc) && pwSrc.includes("var F = FU(), kind = F.picKind(u); if (!kind || u.length > PIC_MAX) return '';") && pwSrc.includes("if (file.size > FILE_MAX) { toast('That file is too large to be a pack.'); return; }")
        && pwSrc.includes("function packsOf(c) { var F = FU(), r = srcRule(); return F && r && c && c.furnPacks ? F.cleanPacks(c.furnPacks, r) : []; }") && pwSrc.includes("window.wpStepLog('furnpack v1'") && pwSrc.includes("if (!packMay(net(), window)) { toast('Furnishing packs are the GM\u2019s.'); return; }"));
    const insP = (w, packName) => { let html = ''; new Function('w', 'window', 'esc', 'html0', insB.replace(/html \+=/g, 'html0.h +=') + '\n')(w, { wpFurnCore: FU, wpFurnish: packName === undefined ? undefined : { packName: () => packName } }, s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), { set h(v) { html = v; }, get h() { return html; } }); return html; };
    const hP = insP({ type: 'image', src: '/saves/images/fp_ab12/c.png', furn: { k: 'chest', era: 'fantasy', pack: 'fp_ab12' } }, 'Old <Town>'), hQ = insP({ type: 'image', src: '/saves/images/fp_ab12/c.png', furn: { k: 'chest', era: 'fantasy', pack: 'fp_ab12' } }, '');
    check('Properties of a look from a pack: from a pack, the pack\'s name escaped or that it is gone, and Use Waypoint\'s drawing, which takes the pack and its picture off',
        hP.includes('<label>Chest, from a pack</label>') && hP.includes('Old &#60;Town&#62;') && hP.includes('id="wbFurnBase"') && !hP.includes('wbFurnEra') && hQ.includes('A pack no longer in this campaign')
        && insSrc.includes("if (_el_wbFurnBase) _el_wbFurnBase.addEventListener('click', function() { var FUh = window.wpFurnCore, cur = FUh ? FUh.cleanFurn(w.furn) : null; if (!cur) return; delete cur.pack; delete w.src; w.furn = cur; save(); render(); });"), hP);
    check('a campaign\'s packs never leave the host, and a save\'s are cleaned as it loads, by the cleaners objcore brings before the first load',
        netSrc.includes("        delete camp.furnPacks;   // 1.6.2 (backlog 222)") && read('scripts/io.js').includes("if (c.furnPacks !== undefined) { var FUl = window.wpFurnCore, FCp = window.wpFogCore, fpL = FUl && FUl.cleanPacks && FCp && FCp.cleanTexSrc ? FUl.cleanPacks(c.furnPacks, FCp.cleanTexSrc) : [];")
        && read('scripts/io.js').includes("import './objcore.js';") && ocSrc.includes("from './fogcore.js'"));
    check('the page: the packs window with its buttons and its two file pickers, its script after the palette\'s, and Escape closes it',
        ix.includes('<script type="module" src="scripts/furnish.js"></script>\n<script type="module" src="scripts/furnpack.js"></script>\n') && ['furnPackModal', 'furnPackList', 'furnPackImportFile', 'furnPackImportFolder', 'furnPackFromOther', 'furnPackFile', 'furnPackDir', 'furnPackFromList', 'furnPackClose'].every(id => count(ix, 'id="' + id + '"') === 1)
        && ix.includes('<input type="file" id="furnPackDir" webkitdirectory multiple hidden>') && read('scripts/esckey.js').includes("['furnPackModal', 'furnPackClose']"));
    check('Help says what a pack is, where it comes in and the two ways to bring one in or send one out',
        !!help && help[0].includes('A <b>pack</b> gives furnishings another look.') && help[0].includes('chest-fantasy.png') && help[0].includes('Export gives you either.'));
    check('both release notes say it, alike', notes.every(Boolean) && notes[0][0] === notes[1][0] && notes[0][0].includes('Rules for'));
    const ci = readRoot('.github/workflows/checks.yml');
    check('CI runs this suite in a step of its own', count(ci, 'run: node tools/furncheck.js') === 1);

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
