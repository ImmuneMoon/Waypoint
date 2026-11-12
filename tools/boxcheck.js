// Containers (1.6.2, backlog 42): boxcore.js imported and run (cleanBox, cleanBoxes, boxTiles, boxCount, boxOp through the real applyRowOp,
// newBoxId), boxes.js's GM slice run on a page of plain objects (which pieces may hold items, Holds items ticked and unticked), the container
// window drawn with text nodes, and the wiring: Properties, the right-click menu, Show on my map, the wire, a load, the floating box lists,
// the page, the styles, Help and both release notes. Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      boxcheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..'), app = f => path.join(root, 'system', 'app', f), read = f => fs.readFileSync(app(f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;

(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    const BC = await import(url.pathToFileURL(app('scripts/boxcore.js')).href);
    const sys = S.cleanSystem({ v: 1, name: 'B', fields: [
        { id: 'f_inv', key: 'Gear', label: 'Gear', kind: 'item-list', list: { trade: true } },
        { id: 'f_one', key: 'Charms', label: 'Charms', kind: 'item-list', list: { noQty: true, trade: true } },
        { id: 'f_trait', key: 'Traits', label: 'Traits', kind: 'item-list', list: {} },
        { id: 'f_gm', key: 'Secrets', label: 'Secrets', kind: 'item-list', vis: 'gm', list: { trade: true } },
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'number' }],
        items: [{ id: 'i_rope', key: 'Rope', name: 'Rope', icon: 'icon:check', notes: 'Fifty feet.' }, { id: 'i_coin', key: 'Coin', name: 'Coin Pouch', icon: '\u{1F4B0}' }, { id: 'i_hid', key: 'Hid', name: 'Hidden thing', vis: 'gm' }] }, { F, gmView: true });

    /* ---- the core ---- */
    {
        const lists = BC.boxLists(sys).map(f => f.id);
        const b = BC.cleanBox({ values: { f_inv: [{ id: 'w_1', defId: 'i_rope', qty: 3 }, { id: 'w_2', qty: 1, def: { name: 'Odd coin' } }, { id: 'w_3', defId: 'i_coin', qty: 2, hid: 1 }], f_gm: [{ id: 'w_9', defId: 'i_hid', qty: 1 }], f_hp: 7, nope: [1] } }, sys, 'c_bxabcd1234');
        const bad = [BC.cleanBox(null, sys, 'c_bxabcd1234'), BC.cleanBox({ values: {} }, sys, 'c_nope'), BC.cleanBox({ id: 'c_bxother123', values: {} }, sys, 'c_bxabcd1234'), BC.cleanBox({ values: {} }, sys, '__proto__')];
        check('the lists a container may hold are the item lists ticked Tradable that players see, never one not ticked, a GM-only list or anything that is no item list (boxLists)', J(lists) === J(['f_inv', 'f_one']), J(lists));
        check('one container (cleanBox, run for real): cleaned as a sheet with no player would be, keeping every item list, so a list unticked Tradable for a while loses nothing (the review), a row as the list keeps it; none for what is not one, an id that is no box id, an id that differs from its key or a prototype\'s name',
            b && J(Object.keys(b.values)) === J(['f_inv', 'f_gm']) && b.values.f_inv.length === 3 && b.values.f_inv[0].qty === 3 && b.id === 'c_bxabcd1234' && bad.every(x => x === null), J([b, bad]));
        const st = BC.cleanBoxes({ c_bxabcd1234: { values: { f_inv: [{ id: 'w_1', defId: 'i_rope', qty: 1 }] } }, c_bxzzzz9999: 'x', c_nope: { values: {} }, __proto__: { values: {} } }, sys);
        check('the store (cleanBoxes): an object with no prototype by box id, anything that is no container none, and nothing for anything that is no store',
            Object.getPrototypeOf(st) === null && J(Object.keys(st)) === J(['c_bxabcd1234']) && Object.keys(BC.cleanBoxes(null, sys)).length === 0 && Object.keys(BC.cleanBoxes([1], sys)).length === 0, J(Object.keys(st)));
        const many = {}; for (let i = 0; i < 520; i++) many['c_bx' + String(i).padStart(6, '0')] = { values: {} };
        check('the store holds BOX_MAX containers at most', Object.keys(BC.cleanBoxes(many, sys)).length === BC.BOX_MAX && BC.BOX_MAX === 500);
        const tiles = BC.boxTiles(sys, b);
        check('the tiles (boxTiles): each row a player could see in list order, its name, count, icon, notes and list; a row kept out of sight (hid) not shown; the count of what it holds',
            J(tiles.map(t => [t.fid, t.rowId, t.name, t.qty, t.icon, t.notes, t.list])) === J([['f_inv', 'w_1', 'Rope', 3, 'icon:check', 'Fifty feet.', 'Gear'], ['f_inv', 'w_2', 'Odd coin', 1, '', '', 'Gear']]) && BC.boxCount(sys, b) === 4, J(tiles));
        const r1 = BC.boxOp(sys, b, 'f_inv', { op: 'add', defId: 'i_rope', rowId: 'w_8', qty: 2 }, F, S.applyRowOp);
        const r2 = BC.boxOp(sys, { id: 'c_bxabcd1234', values: r1.values }, 'f_inv', { op: 'setQty', rowId: 'w_1', qty: 1 }, F, S.applyRowOp);
        const r3 = BC.boxOp(sys, { id: 'c_bxabcd1234', values: r2.values }, 'f_inv', { op: 'remove', rowId: 'w_2' }, F, S.applyRowOp);
        const r4 = BC.boxOp(sys, b, 'f_gm', { op: 'add', defId: 'i_rope', rowId: 'w_7', qty: 1 }, F, S.applyRowOp), r5 = BC.boxOp(sys, b, 'f_hp', { op: 'add', defId: 'i_rope', rowId: 'w_7', qty: 1 }, F, S.applyRowOp);
        const r6 = BC.boxOp(sys, { id: 'c_bxabcd1234', values: {} }, 'f_one', { op: 'add', defId: 'i_rope', rowId: 'w_6', qty: 1 }, F, S.applyRowOp), r7 = BC.boxOp(sys, { id: 'c_bxabcd1234', values: r6.values }, 'f_one', { op: 'add', defId: 'i_rope', rowId: 'w_5', qty: 1 }, F, S.applyRowOp);
        check('a change of what it holds (boxOp, through the real applyRowOp): an add stacks on the row of the same entry, a count set, a row taken out; never a list players do not see or one that is no item list; a list that holds each entry once refuses a second',
            r1.ok && r1.values.f_inv[0].qty === 5 && r2.ok && r2.values.f_inv[0].qty === 1 && r3.ok && r3.values.f_inv.length === 2 && !r3.values.f_inv.some(r => r.id === 'w_2')
            && !r4.ok && r4.reason === 'list' && !r5.ok && r6.ok && !r7.ok && b.values.f_inv[0].qty === 3, J([r1, r2, r3, r4, r5, r6, r7].map(r => r.ok ? 'ok' : r.reason)));
        let k = 0; const rand = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5][k++ % 20];
        const have = { c_bxaaaaaaaaaa: 1 }, nid = BC.newBoxId(rand, have);
        const rg = BC.boxOp(sys, b, 'f_inv', { op: 'add', defId: 'i_hid', rowId: 'w_4', qty: 1 }, F, S.applyRowOp);
        check('a GM-only entry is never put in: players will take what a container holds (the review)', !rg.ok && rg.reason === 'gm', J(rg));
        const camp = { boxes: { c_bxlive00001: { id: 'c_bxlive00001', values: {} }, c_bxgone00001: { id: 'c_bxgone00001', values: {} } }, items: { m1: { type: 'map', whiteboard: [{ id: 'a', type: 'image', box: 'c_bxlive00001' }, { id: 'b', type: 'rect', box: 'c_bxmiss00001' }, { id: 'c', type: 'image', isChar: true, box: 'c_bxlive00001' }, { id: 'd', type: 'rect', box: 7 }] }, p1: { type: 'planner' } } };
        const td = BC.boxesTidy(camp), wb = camp.items.m1.whiteboard;
        check('a load tidies a campaign (boxesTidy): a container no piece names goes, a piece naming one that is not there, or that may not hold items, holds none',
            J(Object.keys(camp.boxes)) === J(['c_bxlive00001']) && wb[0].box === 'c_bxlive00001' && !('box' in wb[1]) && !('box' in wb[2]) && !('box' in wb[3]) && J(td) === J({ boxes: 1, pieces: 3 }) && J(BC.boxesTidy(null)) === J({ boxes: 0, pieces: 0 }), J([td, camp]));
        const of = BC.boxesOf({ c_bxlive00001: { id: 'c_bxlive00001', values: { f_inv: [{ id: 'w_1' }] } }, c_bxother0001: { id: 'c_bxother0001', values: {} } }, { m1: { whiteboard: [{ box: 'c_bxlive00001' }] } });
        check('what a part of a campaign carries (boxesOf): the containers its pieces name, copied', J(Object.keys(of)) === J(['c_bxlive00001']) && of.c_bxlive00001.values.f_inv[0].id === 'w_1', J(of));
        check('a new box id (newBoxId): a box id, never one the store already holds', BC.boxIdOk(nid) && nid !== 'c_bxaaaaaaaaaa' && nid === 'c_bxssssssssss' && !BC.boxIdOk('constructor') && !BC.boxIdOk('c_bx'), nid);
    }

    /* ---- the GM's slice of boxes.js, on a page of plain objects ---- */
    {
        const src = read('scripts/boxes.js'), a = src.indexOf('// [boxcheck:gm-start]'), z = src.indexOf('// [boxcheck:gm-end]');
        const world = (o) => {
            o = o || {}; const calls = { saves: 0, renders: 0, steps: [], closed: 0 };
            const camp = { system: sys, boxes: o.boxes || undefined }, map = { id: 'm1', whiteboard: [] }, win = { wpNet: o.net || null, wpStream: !!o.stream, wpCanPersistLocal: () => o.persist !== false, appRender: () => calls.renders++, wpStepLog: (n, s, f) => calls.steps.push(s + ' ' + J(f)) };
            const fn = new Function('window', 'getActiveCampaign', 'getActiveMap', 'save', 'BC', 'step', 'close', '_box', src.slice(a, z) + '\nreturn { gmMay, boxPieceOk, holds };');
            const api = fn(win, () => camp, () => map, () => calls.saves++, Object.assign({}, BC, { newBoxId: (r, h) => BC.newBoxId(() => 0.1, h) }), (s, f) => win.wpStepLog('boxes v1', s, f || {}), () => calls.closed++, { pieceId: 'p1' });
            return { api, camp, map, calls };
        };
        const W = world(), ok = W.api.boxPieceOk;
        const kinds = [ok({ type: 'image' }), ok({ type: 'rect' }), ok({ type: 'circle' }), ok({ type: 'hexagon' }), ok({ type: 'diamond' }), ok({ type: 'image', isChar: true }), ok({ type: 'image', waiting: true }), ok({ type: 'rect', blocksSight: true }), ok({ type: 'rect', barrier: true, sightType: 'door' }), ok({ type: 'rect', barrier: true }), ok({ type: 'rect', fill: true }), ok({ type: 'text' }), ok({ type: 'path' }), ok({ type: 'trigger' }), ok({ type: 'light' }), ok({ type: 'rect', gmNoteFor: 'p1' }), ok({ type: 'rect', roomArea: true }), ok(null)];
        check('which pieces may hold items (boxPieceOk): a picture and a plain shape, a crate that only stops movement among them, never a token, a waiting token, a wall, a door, a painted cell, a text box, a drawing, a trigger zone, a light, a GM note card or a room\'s area',
            J(kinds) === J([true, true, true, true, true, false, false, false, false, true, false, false, false, false, false, false, false, false]), J(kinds));
        const w = { id: 'p1', type: 'image' }; W.map.whiteboard.push(w);
        const said = W.api.holds(w, true), id = w.box, made = W.camp.boxes && W.camp.boxes[id];
        const again = W.api.holds(w, true);
        check('Holds items ticked: a new container under a box id of its own, empty, the piece naming it, one save, the app drawn again, said and logged; ticked again nothing changes',
            BC.boxIdOk(id) && made && J(made) === J({ id, values: {} }) && W.calls.saves === 1 && W.calls.renders === 1 && said === 'It holds items now. Open contents to put some in.' && again === '' && W.calls.saves === 1 && W.calls.steps[0] === 'holds {"on":true}', J([said, id, made, W.calls]));
        W.camp.boxes[id].values = { f_inv: [{ id: 'w_1', defId: 'i_rope', qty: 2 }] };
        let asked = null; W.api.holds(w, false, (q, done) => { asked = q; done(false); });
        const kept = [w.box === id, !!W.camp.boxes[id]];
        W.api.holds(w, false, (q, done) => { done(true); });
        check('Holds items unticked with items in it asks first, with the count: a No keeps the container whole, a Yes takes it and the piece\'s key away, saves and closes its window',
            asked === 'It holds 2 items. Take them out with it? They cannot be put back.' && J(kept) === J([true, true]) && w.box === undefined && !(id in W.camp.boxes) && W.calls.closed === 1 && W.calls.steps.slice(-1)[0] === 'holds {"on":false,"n":2}', J([asked, kept, w, W.calls]));
        const w2 = { id: 'p2', type: 'rect' }; W.api.holds(w2, true); const id2 = w2.box; W.api.holds(w2, false, () => { throw new Error('asked'); });
        check('Holds items unticked on an empty container asks nothing', w2.box === undefined && !(id2 in W.camp.boxes));
        const others = [world({ net: { active: true, role: 'client' } }), world({ net: { foreign: true } }), world({ stream: true }), world({ persist: false })].map(V => { const x = { id: 'p1', type: 'image' }; V.map.whiteboard.push(x); return [V.api.holds(x, true), x.box === undefined, V.calls.saves, V.api.gmMay()]; });
        check('never on a player\'s app, at someone else\'s table, in the stream window or where this computer may not write the campaign: nothing made, nothing saved',
            others.every(o => J(o) === J(['', true, 0, false])), J(others));
        const wt = { id: 'p3', type: 'image', isChar: true }; W.api.holds(wt, true);
        check('a piece that may not hold items is not made one', wt.box === undefined);
    }

    /* ---- a copy of a container (Duplicate, a paste): one of its own ---- */
    {
        const src = read('scripts/boxes.js'), a = src.indexOf('// A copy of a container'), z = src.indexOf('// The window follows the app:');
        const camp = { boxes: { c_bxorig00001: { id: 'c_bxorig00001', values: { f_inv: [{ id: 'w_1', defId: 'i_rope', qty: 2 }] } } } }, steps = [];
        const fn = new Function('getActiveCampaign', 'boxOf', 'gmMay', 'BC', 'step', src.slice(a, z) + '\nreturn { copyFor, has };');
        const boxOf = (c, w) => c && w && typeof w.box === 'string' && c.boxes && Object.prototype.hasOwnProperty.call(c.boxes, w.box) ? c.boxes[w.box] : null;
        const api = fn(() => camp, boxOf, () => true, Object.assign({}, BC, { newBoxId: (r, h) => BC.newBoxId(() => 0.3, h) }), (s) => steps.push(s));
        const it = { id: 'x', type: 'image', box: 'c_bxorig00001' }; api.copyFor(it);
        const nid = it.box; camp.boxes[nid].values.f_inv[0].qty = 9;
        const lost = { id: 'y', type: 'image', box: 'c_bxnone00001' }; api.copyFor(lost);
        check('a copied container gets one of its own with a copy of what it holds, never the same one; a copy of one that is not there holds none; has() asks the store',
            BC.boxIdOk(nid) && nid !== 'c_bxorig00001' && camp.boxes.c_bxorig00001.values.f_inv[0].qty === 2 && !('box' in lost) && api.has(it) && !api.has(lost) && steps[0] === 'copy', J([it, lost, Object.keys(camp.boxes)]));
        const wbS = read('scripts/whiteboard.js'), ioS = read('scripts/io.js');
        check('Duplicate and a paste both ask for it, and with no module a copy holds none', wbS.includes("if (it.box !== undefined) { if (window.wpBoxes && window.wpBoxes.copyFor) window.wpBoxes.copyFor(it); else delete it.box; }") && ioS.includes("if (it.box !== undefined) { if (window.wpBoxes && window.wpBoxes.copyFor) window.wpBoxes.copyFor(it); else delete it.box; }"));
    }

    /* ---- the window: text nodes alone, its wiring ---- */
    {
        const bx = read('scripts/boxes.js');
        check('the container window writes no markup: every word set as text, the glyph an svg made by name from the app\'s own table, its notes in a tooltip',
            !/innerHTML|insertAdjacentHTML|outerHTML/.test(bx) && bx.includes("createElementNS(NS, 'svg')") && bx.includes('glyphPath(t.icon)') && bx.includes('b2.title = tipOf(t);') && bx.includes("e.textContent = String(text)"));
        check('every change goes through boxOp with the real applyRowOp, is one save and is logged as boxes v1; the window closes when its piece, its map or its campaign is gone, and is drawn again only by its own changes',
            bx.includes('var r = BC.boxOp(sysOf(camp), b, fid, q, F, applyRowOp);') && bx.includes('b.values = r.values; save(); step(what, {});') && bx.includes("window.wpStepLog('boxes v1', s, f || {})")
            && /function sync\(\) \{[^\n]*close\(\); return; \}[^\n]*nm\.textContent/.test(bx) && !/function sync\(\)[^\n]*draw\(\)/.test(bx));
        check('the library\'s picker opens with the list\'s own categories, and an entry put in from it goes through the same change', bx.includes("LP.open({ anchor: lb,") && bx.includes("change(fid, { op: 'add', defId: id, rowId: uid('w_'), qty: qty || 1 }, 'add-lib', ['.box-lib', '.box-item'])"));
    }

    /* ---- the wiring ---- */
    {
        const ins = read('scripts/inspector.js'), wb = read('scripts/whiteboard.js'), net = read('scripts/net.js'), io = read('scripts/io.js'), il = read('scripts/ilayers.js');
        const fl = read('scripts/floats.js'), sh = read('scripts/sheets.js'), esc = read('scripts/esckey.js'), ix = read('index.html'), css = read('style.css');
        check('Properties: Holds items with its count and Open contents, drawn after the map links and wired, a No asked with its buttons alone',
            ins.includes("(linkFold ? '</details>' : '') +   // 1.5.6: the end of a character token's Map links\n              (typeof boxFieldHtml === 'function' ? boxFieldHtml(w) : '')+") && ins.includes("if (typeof boxFieldWire === 'function') boxFieldWire(w);")
            && ins.includes("showConfirm(q, function(ok) { done(!!ok); }, { noEnter: true })") && ins.includes('id="wbHoldsItems"') && ins.includes('id="wbOpenBox"'));
        check('the right-click menu: Open contents on ONE container, the GM\'s, opening its window',
            wb.includes("function boxOpenRow(items)") && wb.includes("if (bxRow) html += bxRow.html;") && wb.includes("} else if (action.includes('cm-box-open')) {") && wb.includes("window.wpBoxes.open(selectedIds[0]);"));
        check('Show on my map: a Containers row that players see too, so As players see it leaves it as it is',
            il.includes("{ k: 'box', name: 'Containers', seen: true }") && il.includes("if (typeof w.box === 'string' && (typeof hasBox !== 'function' || hasBox(w))) out.push('box');") && il.includes('KINDS.filter(function(x) { return !x.more && !x.seen; })'));
        check('the wire: what containers hold and a piece\'s box id never leave the host, a container wearing only the mark boxed, which a player\'s app keeps only as 1',
            net.includes('delete camp.boxes;') && net.includes("if (w.box !== undefined) { if (typeof w.box === 'string' && /^c_bx[A-Za-z0-9]{4,20}$/.test(w.box)) w.boxed = 1; delete w.box; }") && net.includes("delete w.box; if (w.boxed !== 1) delete w.boxed;") && net.includes('return cleanWaitingItem(w); delete w.box;'));
        check('a load and an import: the store cleaned by its own cleaner against the campaign\'s system and tidied against its pieces, its core loaded before the first load; a Merge brings a file\'s containers by id; an export of a part carries the containers it names; a file\'s box key kept only as a box id on a piece that is no token',
            io.includes("import './boxcore.js';") && io.includes("BXl.cleanBoxes(c.boxes, c.system)") && io.includes("window.wpBoxCore.boxesTidy(c);") && io.includes("window.wpBoxCore.boxesOf(camp.boxes, items)")
            && read('scripts/main.js').includes("var bxI = window.wpBoxCore.cleanBoxes(ic.boxes, existing.system || ic.system);") && read('scripts/cleanup.js').includes("if (w.box !== undefined && (typeof w.box !== 'string' || !/^c_bx[A-Za-z0-9]{4,20}$/.test(w.box) || w.isChar || w.waiting)) delete w.box;"));
        check('the window follows the app: render() and the empty state ask its sync, and the menu row asks that the store holds the container',
            (read('scripts/main.js').match(/if \(window\.wpBoxes\) window\.wpBoxes\.sync\(\);/g) || []).length === 2 && wb.includes("!B.has(list[0])"));
        check('a floating box by the rules: FLOAT_IDS, Z_BOXES, and Escape by its own close',
            /var FLOAT_IDS = \[[^\]]*'boxPanel'/.test(fl) && /var Z_BOXES = \[[^\]]*'boxPanel'/.test(sh) && /var ESC_LAST = \[[^\]]*'boxPanel'/.test(esc) && esc.includes("boxPanel: function(el) { if (!escPress(doc, 'boxClose')) el.style.display = 'none'; },"));
        check('the page: the window with its close, the module after the layers, its styles',
            (ix.match(/id="boxPanel"/g) || []).length === 1 && ix.includes('id="boxClose"') && ix.includes('id="boxBody"') && ix.indexOf('scripts/ilayers.js') < ix.indexOf('scripts/boxes.js') && css.includes('#boxBody .box-grid {') && css.includes('#boxPanel {') && css.includes('#contextMenu .menu-item.cm-box-open > * { pointer-events: none; }'));
        check('Help says it, in its plain words', ix.includes('<li><b>Containers:</b> a picture, a shape or a map object can hold items') && ix.includes('What it holds stays on your computer until a player opens it. You are told who took what.') && ix.includes('Only lists ticked Tradable that players see can hold them, as a trade moves them.'));
        const wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt');
        check('both release notes say it, alike', wn.includes('- A picture, a shape or a map object can now hold items.') && wa.includes('- A picture, a shape or a map object can now hold items.'));
    }
    /* ---- fold 2: the host's branch, run for real with the real trade rule ---- */
    {
        const net = read('scripts/net.js'), bw = (a, z) => { const i = net.indexOf('// [netcheck:' + a + '-start]'), j = net.indexOf('// [netcheck:' + a + '-end]'); if (i < 0 || j < i) throw new Error('slice ' + a); return net.slice(i, j); };
        const helpers = bw('boxhost'), branch = bw('box');
        const mk = (o) => {
            o = o || {};
            const sysT = S.cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_inv', key: 'Gear', label: 'Gear', kind: 'item-list', list: { trade: true } }], items: [{ id: 'i_rope', key: 'Rope', name: 'Rope' }, { id: 'i_coin', key: 'Coin', name: 'Coin' }] }, { F, gmView: true });
            const box = { id: 'c_bxchest0001', values: { f_inv: [{ id: 'w_1', defId: 'i_rope', qty: 3 }, { id: 'w_2', defId: 'i_coin', qty: 1 }] } };
            const camp = { id: 'k1', system: sysT, boxes: { c_bxchest0001: box }, chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_p1', values: {} }, c_ava: { id: 'c_ava', name: 'Ava', ownerId: 'u_p2', values: {} } },
                items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'chest', type: 'image', name: 'Old chest', x: 100, y: 100, w: 50, h: 50, box: 'c_bxchest0001', hidden: !!o.hidden }, { id: 'tk', type: 'image', isChar: true, charId: 'c_kael', ownerId: 'u_p1', x: 150, y: 100, w: 50, h: 50 }, { id: 'ta', type: 'image', isChar: true, charId: 'c_ava', ownerId: 'u_p2', x: 150, y: 100, w: 50, h: 50 }] } } };
            const sent = [], told = [], logs = [], toasts = [], conns = [], steps = [];
            const conn = { peer: 'pA', open: true, send: m => sent.push(m) }, other = { peer: 'pB', open: true, send: m => told.push(m) }; conns.push(conn, other);
            const N = { roster: { pA: { id: 'u_p1', location: 'm1' }, pB: { id: 'u_p2', location: 'm1' } }, conns, paused: false, syncCharDelta: (id, v) => steps.push('delta ' + id + ' ' + Object.keys(v).join(',')) };
            const win = { wpBoxCore: BC, wpSheets: { charChanged: id => steps.push('changed ' + id) }, wpBoxes: { redraw: () => steps.push('gm redraw') }, wpStepLog: (n, s, f) => steps.push(n + ' ' + s + ' ' + JSON.stringify(f)) };
            const fn = new Function('net', 'window', 'getActiveCampaign', 'allow', 'peerPaused', 'handsTo', 'allyNear', 'SC', 'saveRemoteSoon', 'logEvent', 'toast', 'sendFailed',
                helpers + '\nreturn { run: function(msg, conn) {\n' + branch + '\n}, views: function() { return _boxViews; }, forget: boxForget };');
            const api = fn(N, win, () => camp, () => o.limit !== false, () => !!o.paused, (ch, pid) => !!ch && ch.ownerId === pid, () => o.near !== false, () => S, () => steps.push('save'), (k, s) => logs.push(s), s => toasts.push(s), () => {});
            return { api, camp, box, sent, told, logs, toasts, steps, conn, other };
        };
        const W = mk();
        W.api.run({ type: 'box', op: 'open', mapId: 'm1', itemId: 'chest', tok: 'tk' }, W.conn);
        const v = W.sent[0];
        check('a player opens a container next to a token of theirs (the host\'s branch, run for real): sent its name and tiles alone, the lists players see, no box id; the GM\'s record says who opened it',
            v && v.type === 'box-view' && v.itemId === 'chest' && v.name === 'Old chest' && JSON.stringify(v.tiles.map(x => [x.rowId, x.name, x.qty])) === JSON.stringify([['w_1', 'Rope', 3], ['w_2', 'Coin', 1]]) && !JSON.stringify(v).includes('c_bx') && W.logs[0] === 'Kael opened Old chest.', JSON.stringify(W.sent));
        W.api.run({ type: 'box', op: 'open', mapId: 'm1', itemId: 'chest', tok: 'ta' }, W.other);
        W.api.run({ type: 'box', op: 'take', mapId: 'm1', itemId: 'chest', tok: 'tk', fid: 'f_inv', rowId: 'w_1', qty: 2 }, W.conn);
        const took = W.sent.find(m => m.type === 'box-took'), tell = W.told.filter(m => m.type === 'box-view').slice(-1)[0];
        check('a take of part of a stack: off the container and onto the taker\'s own sheet through the trade\'s own rule, stored, sent and saved; the player told, the GM told who took what, and everyone with it open sent what is left',
            JSON.stringify(W.box.values.f_inv.map(r => [r.id, r.qty])) === JSON.stringify([['w_1', 1], ['w_2', 1]]) && W.camp.chars.c_kael.values.f_inv.length === 1 && W.camp.chars.c_kael.values.f_inv[0].qty === 2
            && took && took.lines[0] === 'Rope x2' && W.toasts[0] === 'Kael took Rope x2 from Old chest.' && W.steps.includes('delta c_kael f_inv') && W.steps.includes('changed c_kael') && W.steps.includes('save') && W.steps.includes('gm redraw')
            && tell && JSON.stringify(tell.tiles.map(x => [x.rowId, x.qty])) === JSON.stringify([['w_1', 1], ['w_2', 1]]), JSON.stringify([W.box.values, W.camp.chars.c_kael.values, took, W.toasts]));
        W.api.run({ type: 'box', op: 'take', mapId: 'm1', itemId: 'chest', tok: 'ta', all: true }, W.other);
        W.api.run({ type: 'box', op: 'take', mapId: 'm1', itemId: 'chest', tok: 'tk', fid: 'f_inv', rowId: 'w_2', qty: 1 }, W.conn);
        check('Take all moves everything still in it, and the last one is taken once: a second player asking for what is gone is told so and sent what is left',
            !W.box.values.f_inv && W.camp.chars.c_ava.values.f_inv.length === 2 && W.sent.some(m => m.type === 'box-deny' && m.reason === 'gone') && W.sent.slice(-1)[0].type === 'box-view' && W.sent.slice(-1)[0].tiles.length === 0, JSON.stringify([W.box, W.camp.chars.c_ava.values]));
        const R = (o, msg, c) => { const X = mk(o); X.api.run(Object.assign({ type: 'box', op: 'open', mapId: 'm1', itemId: 'chest', tok: 'tk' }, msg || {}), c === 'B' ? X.other : X.conn); return X; };
        const far = R({ near: false }), notMine = R({}, { tok: 'ta' }), hid = R({ hidden: true }), paused = R({ paused: true }), stub = R({}, { mapId: 'nope' }), limited = R({ limit: false });
        check('every step judged: too far, a token not theirs, a hidden container (answered nothing), a paused table, a map that is not there, the limiter; nothing moved and nothing told',
            far.sent[0].reason === 'far' && notMine.sent[0].reason === 'token' && hid.sent.length === 0 && paused.sent[0].reason === 'paused' && stub.sent.length === 0 && limited.sent.length === 0 && [far, notMine, hid, paused].every(X => X.box.values.f_inv.length === 2 && !X.logs.length),
            JSON.stringify([far.sent, notMine.sent, hid.sent, paused.sent]));
        const C = mk(); C.api.run({ type: 'box', op: 'open', mapId: 'm1', itemId: 'chest', tok: 'tk' }, C.conn); C.api.run({ type: 'box', op: 'close', mapId: 'm1', itemId: 'chest' }, C.conn);
        const k = 'k1|m1|chest', closed = C.api.views()[k] && !('pA' in C.api.views()[k]); C.api.forget();
        check('Close lets the host forget who has it open, and a new table forgets them all', closed && Object.keys(C.api.views()).length === 0 && net.includes("if (typeof boxForget === 'function') boxForget();"));
        check('the player\'s app takes a view from the synced host alone and never in the stream window, and says a refusal in its own words', net.includes("} else if (msg.type === 'box-view' && net.role === 'client') {") && bw('boxview').includes("if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;") && net.includes("far: 'Move a token of yours next to it to open it.'"));
    }

    /* ---- fold 2: the player's window, on a page of plain objects ---- */
    {
        const src = read('scripts/boxes.js'), a = src.indexOf('// [boxcheck:player-start]'), z = src.indexOf('// [boxcheck:player-end]');
        const fn = new Function('getActiveMap', 'state', 'toast', 'step', 'window', '_box', src.slice(a, z) + '\nreturn { cleanTiles, tokFor };');
        const api = fn(() => null, { selWbIds: [] }, () => {}, () => {}, { wpNet: { myId: 'u_p1' } }, {});
        const ct = api.cleanTiles([{ fid: 'f_inv', rowId: 'w_1', name: 'Rope\u0007<b>', qty: 3, icon: 'icon:check', notes: 'x'.repeat(900) }, { fid: 1, rowId: 'w' }, null, { fid: 'f', rowId: 'w_2', qty: -4 }]);
        check('the host\'s view cleaned again on the player\'s app: plain words cut to their length, a count a whole number, anything that is no tile left out', ct.length === 2 && ct[0].name === 'Rope <b>' && ct[0].notes.length === 600 && ct[0].qty === 3 && ct[1].qty === 1 && ct[1].name === 'Item', JSON.stringify(ct));
        const map = { whiteboard: [{ id: 't1', isChar: true, charId: 'c1', ownerId: 'u_p1', x: 500, y: 500, w: 50, h: 50 }, { id: 't2', isChar: true, charId: 'c2', ownerId: 'u_p1', x: 120, y: 100, w: 50, h: 50 }, { id: 't3', isChar: true, charId: 'c3', ownerId: 'u_p2', x: 100, y: 100, w: 50, h: 50 }] };
        const near = api.tokFor(map, { x: 100, y: 100, w: 50, h: 50 });
        const fn2 = new Function('getActiveMap', 'state', 'toast', 'step', 'window', '_box', src.slice(a, z) + '\nreturn { tokFor };');
        const sel = fn2(() => null, { selWbIds: ['t1'] }, () => {}, () => {}, { wpNet: { myId: 'u_p1' } }, {}).tokFor(map, { x: 100, y: 100, w: 50, h: 50 });
        check('it opens with the selected token of theirs, else the one of theirs nearest the container, never another player\'s', near && near.id === 't2' && sel && sel.id === 't1');
        check('the window writes no markup, and Take and Take all ask the host, which answers', !/innerHTML/.test(src.slice(a, z)) && src.includes("n.boxAsk('take', _box.mapId, _box.pieceId, Object.assign({ tok: _box.tok }, more))"));
    }
    {
        const wbS = read('scripts/whiteboard.js'), a = wbS.indexOf('// [boxcheck:mark-start]'), z = wbS.indexOf('// [boxcheck:mark-end]');
        const mkEl = () => { const kids = [], L = {}; const e = { kids, L, dataset: {}, attrs: {}, className: '', type: '', removed: false, appendChild(c) { kids.push(c); c.parent = e; return c; }, querySelector() { return kids.find(c => / wb-box|^wb-box/.test(' ' + c.className) && !c.removed) || null; }, addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, setAttribute(k, v) { e.attrs[k] = v; }, remove() { e.removed = true; } }; return e; };
        const run = (win, item, hidden) => { const doc = { createElement: () => mkEl() }; const f = new Function('window', 'document', wbS.slice(a, z) + '\nreturn boxMarkSync;')(win, doc); const el = mkEl(); f(el, item, hidden); return el; };
        const asked = [], opened = [], B = { gmMay: () => true, has: w => w.box === 'c_bxchest0001', open: id => opened.push(id), ask: id => asked.push(id) };
        const gm = run({ wpBoxes: B }, { id: 'p1', box: 'c_bxchest0001' });
        const pl = run({ wpBoxes: Object.assign({}, B, { gmMay: () => false }), wpNet: { active: true, role: 'client' } }, { id: 'p2', boxed: 1 });
        const none = [run({ wpBoxes: B }, { id: 'p3' }), run({ wpBoxes: B, wpStream: true }, { id: 'p1', box: 'c_bxchest0001' }), run({ wpBoxes: B }, { id: 'p1', box: 'c_bxchest0001' }, true), run({ wpBoxes: Object.assign({}, B, { gmMay: () => false }), wpNet: { active: true, role: 'client', stream: true } }, { id: 'p2', boxed: 1 })];
        gm.kids[0].L.click[0]({ stopPropagation() {}, preventDefault() {} }); pl.kids[0].L.click[0]({ stopPropagation() {}, preventDefault() {} });
        check('the mark: on the GM\'s screen a container\'s mark opens its window, on a player\'s app a container the host marked asks to open it; none on a piece that is none, in the stream window or on a hidden one; the chest\'s drawing and its words',
            gm.kids.length === 1 && gm.kids[0].className === 'wb-box wi-chest' && gm.kids[0].dataset.tip === 'Open contents' && pl.kids[0].dataset.tip === 'Open it' && JSON.stringify(opened) === '["p1"]' && JSON.stringify(asked) === '["p2"]' && none.every(e => e.kids.length === 0)
            && read('style.css').includes('.wi-chest { --wi:') && read('style.css').includes('.wb-item > .wb-box {'), JSON.stringify([opened, asked]));
    }
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      boxcheck threw: ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
