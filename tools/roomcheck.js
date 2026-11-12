// The Data Map's rooms (1.6.2, backlog 45, fold 1: adding and linking rooms): roomcore.js imported and run as it is, datamap.js's page slice and
// whiteboard.js's play map row sliced by their [roomcheck:*] markers and run for real on a page of plain objects, and the wiring, the styles, Help and
// both release notes pinned. Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      roomcheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..', 'system', 'app'), read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(root, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;
const cut = (src, name, file) => { const a = src.indexOf('// [roomcheck:' + name + '-start]'), z = src.indexOf('// [roomcheck:' + name + '-end]'); if (a < 0 || z < a || src.indexOf('// [roomcheck:' + name + '-start]', a + 1) >= 0) throw new Error('roomcheck: slice ' + name + ' of ' + file); return src.slice(a, z); };

// A page of plain objects: elements with listeners, classes, children and the focus; nothing is ever parsed as markup
function mkDoc() {
    const doc = { activeElement: null, listeners: {}, hit: null };
    function mkEl(tag) {
        const cls = new Set();
        const el = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, listeners: {}, attrs: {}, dataset: {}, style: {}, value: '',
            classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); } },
            get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
            addEventListener(t, f, cap) { (this.listeners[t] = this.listeners[t] || []).push({ f, cap: !!cap }); },
            appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
            insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; },
            removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; if (doc.activeElement === c) { doc.activeElement = null; fire(c, 'blur', {}); } return c; },
            setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
            querySelector(sel) { const want = sel.replace(/^\./, ''); const walk = n => { for (const k of n.children) { if (k.classList.contains(want)) return k; const d = walk(k); if (d) return d; } return null; }; return walk(this); },
            closest(sel) { let n = this; const parts = sel.split(' '), last = parts[parts.length - 1]; while (n) { if (last.charAt(0) === '.' ? n.classList.contains(last.slice(1)) : n.id === last.slice(1)) { if (parts.length < 2) return n; let p = n.parentNode; while (p) { if (p.id === parts[0].slice(1)) return n; p = p.parentNode; } return null; } n = n.parentNode; } return null; },
            focus() { doc.activeElement = this; }, select() { this.selected = true; }, getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }, offsetWidth: 0, offsetHeight: 0 };
        return el;
    }
    function fire(el, type, ev) { ev = ev || {}; ev.stopped = false; ev.prevented = false; ev.stopPropagation = () => { ev.stopped = true; }; ev.preventDefault = () => { ev.prevented = true; }; ev.target = ev.target || el; (el.listeners[type] || []).forEach(l => l.f(ev)); return ev; }
    doc.createElement = mkEl; doc.createElementNS = (ns, tag) => mkEl(tag);
    doc.body = mkEl('body');
    doc.addEventListener = (t, f) => { (doc.listeners[t] = doc.listeners[t] || []).push(f); };
    doc.elementFromPoint = () => doc.hit;
    doc.byId = {}; doc.getElementById = id => doc.byId[id] || null;
    doc.fire = fire; doc.fireDoc = (t, ev) => { ev = ev || {}; ev.preventDefault = () => { ev.prevented = true; }; (doc.listeners[t] || []).forEach(f => f(ev)); return ev; };
    return doc;
}

(async () => {
    const RC = await import(url('roomcore.js'));

    /* ---- the pure half ---- */
    check('roomcore: a room\'s name from what was typed is one line with no control characters, its spaces made one, trimmed, at most 120 characters with half a character dropped; nothing typed keeps the name it had, and New room where it had none',
        RC.roomNameOf('  Old\u0007 Mill \n gate ', 'x') === 'Old Mill gate' && RC.roomNameOf('', 'Ford') === 'Ford' && RC.roomNameOf('   ', '') === 'New room' && RC.roomNameOf(5, null) === 'New room'
        && RC.roomNameOf('a'.repeat(119) + '😀') === 'a'.repeat(119) && RC.roomNameOf('b'.repeat(200)).length === 120, J(RC.roomNameOf('  Old\u0007 Mill \n gate ', 'x')));
    const stair = [{ x: 100, y: 100 }, { x: 124, y: 124 }];
    check('roomcore: a new room\'s place (freeSpot) is the one asked for where no room stands within a few pixels, else stepped down and right until clear, never left of or above 10, and a place that is no number reads 100',
        J(RC.freeSpot([], 300.4, 200.6)) === J({ x: 300, y: 201 }) && J(RC.freeSpot(stair, 100, 100)) === J({ x: 172, y: 172 }) && J(RC.freeSpot([{ x: 100, y: 100 }], 141, 100)) === J({ x: 141, y: 100 })
        && J(RC.freeSpot(null, -50, 3)) === J({ x: 10, y: 10 }) && J(RC.freeSpot([], 'a', NaN)) === J({ x: 100, y: 100 }) && J(RC.freeSpot([null, 5, { x: 'a' }], 100, 100)) === J({ x: 100, y: 100 }), J(RC.freeSpot(stair, 100, 100)));
    const nr = RC.newRoom('r1', stair, { c_a: { label: 'A' }, c_b: {} }, 100, 100), nr0 = RC.newRoom(7, [], null, 20, 30, 'Gate');
    check('roomcore: a new room (newRoom) in the map\'s first category at a free place, named New room or as asked, with empty notes and characters, its keys in the order the app writes them; none for a map with no category',
        J(nr) === J({ id: 'r1', name: 'New room', cat: 'c_a', x: 172, y: 172, notes: '', characters: [] }) && J(nr0) === J({ id: '7', name: 'Gate', x: 20, y: 30, notes: '', characters: [] }), J([nr, nr0]));
    const L = [['a', 'b'], ['b', 'c', 'route']];
    const l1 = RC.linkAdd(L, 'c', 'a', 'secret'), l2 = RC.linkAdd(L, 'c', 'b', 'oneway'), l3 = RC.linkAdd(L, 'd', 'e', '');
    check('roomcore: a link (linkAt, linkAdd) found either way round; a new one pushed with the type new links take, a plain one as two ids; one already there kept as it is and answered as had; nothing for a room to itself, an empty id or no list',
        RC.linkAt(L, 'b', 'a') === 0 && RC.linkAt(L, 'x', 'a') === -1 && RC.linkAt(null, 'a', 'b') === -1 && J(l1) === J({ at: 2, had: false }) && J(L[2]) === J(['c', 'a', 'secret']) && J(l2) === J({ at: 1, had: true }) && J(L[1]) === J(['b', 'c', 'route'])
        && J(l3) === J({ at: 3, had: false }) && J(L[3]) === J(['d', 'e']) && RC.linkAdd(L, 'a', 'a') === null && RC.linkAdd(L, '', 'a') === null && RC.linkAdd(null, 'a', 'b') === null && RC.linkAdd(L, 'a', 5) === null && L.length === 4, J(L));
    check('roomcore: a room made away from the Data Map (besideRooms) stands right of the rooms there, level with the topmost, clear of any; on an empty map at 100, 100',
        J(RC.besideRooms([{ x: 100, y: 300 }, { x: 400, y: 120 }, { x: 'z', y: 0 }])) === J({ x: 600, y: 120 }) && J(RC.besideRooms([])) === J({ x: 100, y: 100 }) && J(RC.besideRooms(null)) === J({ x: 100, y: 100 }), J(RC.besideRooms([{ x: 100, y: 300 }, { x: 400, y: 120 }])));
    const ok = w => RC.pieceRoomOk(w);
    check('roomcore: a piece that may be made a room\'s place (pieceRoomOk) is a shape, a picture or a filled region with no room yet; never a token, a waiting token, a GM note card, a piece that has a room, a wall, a see-through barrier, a door, a line, a text box or a trigger zone',
        ['rect', 'hexagon', 'circle', 'diamond', 'image'].every(t => ok({ type: t })) && ok({ type: 'path', tip: 'fill' })
        && [{ type: 'rect', isChar: true }, { type: 'rect', waiting: 1 }, { type: 'rect', gmNoteFor: 'x' }, { type: 'rect', nodeId: 'r1' }, { type: 'rect', blocksSight: true }, { type: 'rect', barrier: true }, { type: 'rect', sightType: 'door' }, { type: 'path' }, { type: 'path', tip: 'square' }, { type: 'text' }, { type: 'trigger' }, null, 5, []].every(w => !ok(w))
        && RC.pieceRoomName({ name: ' The <b>Inn</b> ' }) === 'The <b>Inn</b>' && RC.pieceRoomName({}) === 'New room' && RC.pieceRoomName({ name: 4 }) === 'New room', '');
    check('roomcore is pure and publishes itself: it imports nothing, reads no clock or chance, and puts its API on window.wpRoomCore',
        !/^import /m.test(read('scripts/roomcore.js')) && !/Date\.now|Math\.random|new Date/.test(read('scripts/roomcore.js')) && /window\.wpRoomCore = API;/.test(read('scripts/roomcore.js')));

    /* ---- the Data Map's page slice, run on a page of plain objects ---- */
    const dm = read('scripts/datamap.js'), pageSrc = cut(dm, 'page', 'datamap.js');
    const mkWorld = o => {
        o = o || {};
        const doc = mkDoc(), wrap = doc.createElement('div'), canvas = doc.createElement('div'), svg = doc.createElement('svg');
        wrap.id = 'canvasWrap'; canvas.id = 'canvas'; svg.id = 'edges'; wrap.appendChild(canvas); canvas.appendChild(svg);
        wrap.scrollLeft = 1000; wrap.scrollTop = 2000; wrap.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 });
        const am = { id: 'm1', type: 'map', cats: { c1: { label: 'Rooms' } }, rooms: (o.rooms || []).map(r => Object.assign({}, r)), links: (o.links || []).map(l => l.slice()) };
        const state = { viewMode: 'data', zoomLevel: o.zoom || 2, snap: !!o.snap, linkType: o.linkType || '', els: {}, selId: null, selLink: null, linkStart: 'x' };
        const log = { saves: 0, renders: 0, dm: 0, toasts: [], picked: [] };
        let n = 0;
        const win = { wpCanPersistLocal: () => o.persist !== false, wpNet: o.foreign ? { foreign: true } : null, isPanMode: !!o.playPan, listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } };
        if (o.pan) doc.body.classList.add('data-pan');
        const render = () => { log.renders++; am.rooms.forEach(r => { if (!state.els[r.id]) { const el = doc.createElement('div'); el.classList.add('room'); el.dataset.id = r.id; el.offsetWidth = 120; el.offsetHeight = 50; const rn = doc.createElement('div'); rn.classList.add('rn'); const rc = doc.createElement('div'); rc.classList.add('rc'); el.appendChild(rn); el.appendChild(rc); canvas.appendChild(el); state.els[r.id] = el; } }); };
        const api = new Function('window', 'document', 'state', 'getActiveMap', 'getSnapCoords', 'uid', 'save', 'render', 'RC', 'isLinkMode', 'svg', 'canvas', 'wrap', 'toast', 'selectLink', 'LINK_TYPES', 'setTimeout', 'renderDataMap', 'wbX', 'wbY',
            pageSrc + '\nreturn { roomAddAt: roomAddAt, roomRename: roomRename, roomLinkStart: roomLinkStart, roomLinkMove: roomLinkMove, roomLinkEnd: roomLinkEnd, dataPt: dataPt, roomGround: roomGround };')(
            win, doc, state, () => (o.noMap ? null : am), (x, y) => ({ x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 }), () => 'n' + (++n), () => { log.saves++; }, render, RC, () => !!o.linkMode, svg, canvas, wrap,
            t => log.toasts.push(t), i => { log.picked.push(i); state.selLink = i; }, { '': { label: 'Path' }, route: { label: 'Route' } }, f => f(), () => { log.dm++; }, (cx, cy, rb, w) => (cx - rb.left + w.scrollLeft) / state.zoomLevel, (cx, cy, rb, w) => (cy - rb.top + w.scrollTop) / state.zoomLevel);
        return { doc, wrap, canvas, svg, am, state, log, win, api };
    };
    // a room added (as Add Room, a double-click or the drag's empty ground ask it)
    const A = mkWorld({ rooms: [{ id: 'r0', name: 'Hall', x: 150, y: 150 }] });
    const ad1 = A.api.roomAddAt(150, 150), inp1 = A.doc.activeElement, ad1el = A.state.els[ad1.room.id];
    check('the Data Map (datamap.js, run for real): a room added is a new room of roomcore\'s at a free place, selected, saved once and drawn, with its name ready to type on its own box: an input made by name, holding the name, all of it selected, focused, the box marked renaming',
        ad1.room.id === 'n1' && ad1.room.x === 198 && ad1.room.y === 198 && A.am.rooms.length === 2 && A.state.selId === 'n1' && A.state.selLink === null && A.state.linkStart === null && A.log.saves === 1
        && inp1 && inp1.className === 'rn-edit' && inp1.value === 'New room' && inp1.selected === true && inp1.parentNode === ad1el && ad1el.children.indexOf(inp1) === 1 && ad1el.children[2].classList.contains('rc') && ad1el.classList.contains('renaming') && inp1.attrs['aria-label'] === 'Room name' && inp1.maxLength === 120, J([ad1.room, A.log]));
    inp1.value = '  Old   Mill '; const kE = A.doc.fire(inp1, 'keydown', { key: 'Enter' }); const savesE = A.log.saves; A.doc.fire(inp1, 'blur', {});
    check('the name typed: Enter keeps it as roomcore reads it, as a save of its own, takes the input off and the mark with it, and the blur that follows changes nothing more; every key typed there goes no further than the box',
        A.am.rooms[1].name === 'Old Mill' && savesE === 2 && A.log.saves === 2 && kE.stopped && kE.prevented && !ad1el.classList.contains('renaming') && inp1.parentNode === null, J([A.am.rooms[1], A.log.saves]));
    const B = mkWorld(); const bA = B.api.roomAddAt(10, 10), bI = B.doc.activeElement; bI.value = 'Nope'; const kEsc = B.doc.fire(bI, 'keydown', { key: 'Escape' });
    const B2 = mkWorld(); B2.api.roomAddAt(10, 10); const b2I = B2.doc.activeElement; b2I.value = 'Kept'; B2.doc.fire(b2I, 'blur', {});
    const B3 = mkWorld(); B3.api.roomAddAt(10, 10); const b3I = B3.doc.activeElement; b3I.value = '   '; B3.doc.fire(b3I, 'blur', {});
    const B4 = mkWorld(); B4.api.roomAddAt(10, 10); const b4I = B4.doc.activeElement; B4.am.id = 'other'; b4I.value = 'Elsewhere'; B4.doc.fire(b4I, 'blur', {});
    check('Escape keeps the name the room had and saves nothing; leaving the box keeps what was typed; a box left empty keeps the name; a name typed after another map came on screen writes nothing; a press in the box never reaches the room under it',
        bA.room.name === 'New room' && B.am.rooms[0].name === 'New room' && B.log.saves === 1 && kEsc.prevented && B2.am.rooms[0].name === 'Kept' && B2.log.saves === 2 && B3.am.rooms[0].name === 'New room' && B3.log.saves === 1
        && B4.am.rooms[0].name === 'New room' && B4.log.saves === 1 && ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu'].every(t => B2.doc.fire(b2I, t, {}).stopped), J([B.am.rooms, B2.am.rooms, B3.am.rooms, B4.am.rooms]));
    {   // the review: keys stay in the box; Enter that ends a composition is the composition's; a press elsewhere draws only the room's box and the name field
        const K = mkWorld(); K.api.roomAddAt(10, 10); const kI = K.doc.activeElement, kDel = K.doc.fire(kI, 'keydown', { key: 'Delete' }), kA = K.doc.fire(kI, 'keydown', { key: 'a' }), kZ = K.doc.fire(kI, 'keydown', { key: 'z', ctrlKey: true });
        kI.value = 'Half'; const kIme = K.doc.fire(kI, 'keydown', { key: 'Enter', isComposing: true }); const stillOpen = kI.parentNode !== null;
        const rBefore = K.log.renders, fN = K.doc.createElement('input'); fN.value = 'New room'; K.doc.byId.fName = fN; K.doc.fire(kI, 'blur', {});
        const F2 = mkWorld(); F2.api.roomAddAt(10, 10); const f2I = F2.doc.activeElement; f2I.value = 'Lost'; F2.doc.hasFocus = () => false; F2.doc.fire(f2I, 'blur', {}); const f2Open = f2I.parentNode !== null && F2.am.rooms[0].name === 'New room';
        check('the review (run for real): Delete, a letter and Ctrl+Z typed in the name box go no further; Enter that ends a composition keeps the box open; a press elsewhere keeps the name and writes it only into the room\'s own box and the name field in Properties, never drawing the app or the Data Map\'s links again, so a press there or on a link is not lost under a redraw; the window losing the focus leaves the box open',
            [kDel, kA, kZ].every(e => e.stopped) && !kDel.prevented && !kIme.prevented && stillOpen && K.am.rooms[0].name === 'Half' && K.log.renders === rBefore && K.log.dm === 0 && K.state.els.n1.querySelector('.rn').textContent === 'Half' && fN.value === 'Half' && f2Open, J([K.log, fN.value, f2Open]));
    }
    const S = mkWorld({ snap: true }); const sA = S.api.roomAddAt(130, 170);
    const S2 = mkWorld({ snap: true, rooms: [{ id: 'q', x: 150, y: 150 }] }); const s2A = S2.api.roomAddAt(130, 170);
    const S3 = mkWorld({ snap: true }); const s3A = S3.api.roomAddAt(2, 3);
    check('the review: with Snap on, a room that steps clear of another lands on the grid too, at the first free place stepping down and right; near the top or left edge a grid point it could not stand on is passed over (the check)',
        s2A.room.x === 150 && s2A.room.y === 200 && s3A.room.x === 50 && s3A.room.y === 50, J([s2A.room, s3A.room]));
    const N1 = mkWorld({ persist: false }), N2 = mkWorld({ foreign: true }), N3 = mkWorld({ noMap: true });
    check('Snap seats a new room on the grid first; nothing is added where the campaign cannot be written here, at someone else\'s table or with no map',
        sA.room.x === 150 && sA.room.y === 150 && N1.api.roomAddAt(1, 1) === null && N2.api.roomAddAt(1, 1) === null && N3.api.roomAddAt(1, 1) === null && N1.am.rooms.length === 0 && N2.am.rooms.length === 0 && N1.log.saves + N2.log.saves === 0, J(sA.room));
    // the link dragged from a room's handle
    const lw = (o, end) => {
        const W = mkWorld(Object.assign({ rooms: [{ id: 'a', name: 'A', x: 100, y: 100 }, { id: 'b', name: 'B', x: 400, y: 100 }] }, o || {}));
        W.state.els.a = W.canvas.appendChild(Object.assign(W.doc.createElement('div'), { offsetWidth: 120, offsetHeight: 50 })); W.state.els.a.classList.add('room'); W.state.els.a.dataset.id = 'a';
        W.state.els.b = W.canvas.appendChild(Object.assign(W.doc.createElement('div'), { offsetWidth: 120, offsetHeight: 50 })); W.state.els.b.classList.add('room'); W.state.els.b.dataset.id = 'b';
        W.started = W.api.roomLinkStart('a', { clientX: 300, clientY: 300 });
        W.line = W.svg.children[0];
        if (end) end(W);
        return W;
    };
    const toRoom = lw({ linkType: 'route' }, W => { W.api.roomLinkMove({ clientX: 360, clientY: 310 }); W.doc.hit = W.state.els.b; W.res = W.api.roomLinkEnd({ clientX: 360, clientY: 310 }, false); });
    check('a drag from a room\'s handle (run for real): it draws a dashed line from the room\'s right edge, follows the pointer in the map\'s own place, and let go on another room links the two with the type new links take, picks the link, saves once, says it and takes its line away',
        toRoom.started === true && toRoom.line && toRoom.line.attrs.class === 'link-draft' && toRoom.line.attrs.x1 === '220' && toRoom.line.attrs.y1 === '125' && toRoom.line.attrs.x2 === '630' && toRoom.line.attrs.y2 === '1130'
        && toRoom.res === 'linked' && J(toRoom.am.links) === J([['a', 'b', 'route']]) && toRoom.state.selLink === 0 && toRoom.state.selId === null && toRoom.log.saves === 1 && J(toRoom.log.toasts) === J(['Rooms linked: Route.']) && toRoom.svg.children.length === 0 && !toRoom.doc.body.classList.contains('room-linking'), J([toRoom.line && toRoom.line.attrs, toRoom.res, toRoom.am.links, toRoom.log]));
    const had = lw({ links: [['b', 'a']] }, W => { W.api.roomLinkMove({ clientX: 360, clientY: 310 }); W.doc.hit = W.state.els.b; W.res = W.api.roomLinkEnd({ clientX: 360, clientY: 310 }, false); });
    const ground = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); W.doc.hit = W.canvas; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
    const self = lw({}, W => { W.api.roomLinkMove({ clientX: 360, clientY: 310 }); W.doc.hit = W.state.els.a; W.res = W.api.roomLinkEnd({ clientX: 360, clientY: 310 }, false); });
    const still = lw({}, W => { W.api.roomLinkMove({ clientX: 302, clientY: 301 }); W.doc.hit = W.canvas; W.res = W.api.roomLinkEnd({ clientX: 302, clientY: 301 }, false); });
    const cancel = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, true); });
    const away = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); W.doc.hit = W.doc.body; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
    const swapped = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); W.am.id = 'm2'; W.doc.hit = W.canvas; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
    check('let go on two rooms already linked, the link is picked and said, nothing added or saved; let go on empty ground, a new room is made there, centred on the pointer, linked and ready to name; let go on the room it began on, a cancel, outside the map or after another map came on screen, nothing changes; a press that dragged nothing picks the room',
        had.res === 'had' && J(had.am.links) === J([['b', 'a']]) && J(had.log.picked) === J([0]) && had.log.saves === 0 && J(had.log.toasts) === J(['These rooms are already linked.'])
        && ground.res === 'new' && ground.am.rooms.length === 3 && ground.am.rooms[2].x === 630 && ground.am.rooms[2].y === 1170 && J(ground.am.links) === J([['a', 'n1']]) && ground.state.selId === 'n1' && ground.doc.activeElement && ground.doc.activeElement.className === 'rn-edit' && ground.log.saves === 1
        && [self, cancel, away, swapped].every(W => W.res === 'none' && W.am.rooms.length === 2 && W.am.links.length === 0 && W.log.saves === 0 && W.svg.children.length === 0)
        && still.res === 'picked' && still.state.selId === 'a' && still.log.saves === 0, J([had.res, ground.res, ground.am.rooms[2], self.res, cancel.res, away.res, swapped.res, still.res]));
    const inLink = lw({ linkMode: true }), inPan = lw({ pan: true }), playPan = lw({ playPan: true }), twice = lw({}, W => { W.again = W.api.roomLinkStart('b', { clientX: 1, clientY: 1 }); });
    const P = mkWorld(); P.win.wpSpacePan = true; const pRes = P.api.roomLinkStart('zz', { clientX: 0, clientY: 0 });
    check('a link is dragged from a handle only in the Data Map\'s Select tool: never in Link Mode, the Data Map\'s Pan tool or with Space held (the play map\'s Pan, a flag the two views share, does not count), never a second while one is under way, and never from a room that is not there',
        inLink.started === false && inPan.started === false && playPan.started === true && twice.again === false && pRes === false && inLink.svg.children.length === 0, J([inLink.started, inPan.started, twice.again]));
    {   // the review: a room under the pointer is lit; a release on a link says so and makes nothing; the window lost lets the drag go
        const T = lw({}, W => { W.doc.hit = W.state.els.b; W.api.roomLinkMove({ clientX: 360, clientY: 310 }); W.lit = W.state.els.b.classList.contains('room-target'); W.doc.hit = W.canvas; W.api.roomLinkMove({ clientX: 380, clientY: 320 }); W.unlit = !W.state.els.b.classList.contains('room-target'); });
        const chip = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); const c = W.doc.createElement('div'); c.classList.add('edge-del'); c.classList.add('near'); W.canvas.appendChild(c); W.doc.hit = c; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
        const hitL = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); const c = W.doc.createElement('div'); c.classList.add('edge-del'); c.classList.add('labelled'); W.canvas.appendChild(c); W.doc.hit = c; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
        const unseen = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); const c = W.doc.createElement('div'); c.classList.add('edge-del'); W.canvas.appendChild(c); W.doc.hit = c; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
        const wideHit = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); const h = W.doc.createElement('line'); h.setAttribute('class', 'hit'); W.svg.appendChild(h); W.doc.hit = h; W.res = W.api.roomLinkEnd({ clientX: 500, clientY: 450 }, false); });
        const noBtn = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); W.api.roomLinkMove({ clientX: 510, clientY: 460, buttons: 0 }); W.after = W.doc.body.classList.contains('room-linking'); W.rooms = W.am.rooms.length; });
        const lost = lw({}, W => { W.api.roomLinkMove({ clientX: 500, clientY: 450 }); (W.win.listeners.blur || []).forEach(f => f({})); W.after = W.doc.body.classList.contains('room-linking'); });
        check('the review and the check (run for real): the room under the pointer is lit while a link is dragged over it and no longer once it moves off; let go on a link\'s chip in sight, nothing is made and the GM is told to let go on a room or on empty ground, while the wide stroke along a line and a chip not shown are ground and make a room; the window lost mid-drag, or a move with no button held, lets the drag go',
            T.lit && T.unlit && [chip, hitL].every(W => W.res === 'none' && W.am.rooms.length === 2 && W.am.links.length === 0 && J(W.log.toasts) === J(['Let go on a room to link it, or on empty ground for a new room.']))
            && [unseen, wideHit].every(W => W.res === 'new' && W.am.rooms.length === 3) && lost.after === false && lost.svg.children.length === 0 && noBtn.after === false && noBtn.rooms === 2, J([T.lit, T.unlit, chip.res, hitL.res, unseen.res, wideHit.res, lost.after, noBtn.after]));
    }
    const G = mkWorld();
    check('the empty ground (roomGround) is the map\'s box, its canvas, its lines, or anything inside the box that is no room and no link\'s chip',
        G.api.roomGround(G.wrap) && G.api.roomGround(G.canvas) && G.api.roomGround(G.svg) && !G.api.roomGround(null) && !G.api.roomGround(G.doc.body) && J(G.api.dataPt({ clientX: 300, clientY: 250 })) === J({ x: 600, y: 1100 }), '');
    // the listeners the slice wires as it loads
    const H = mkWorld({ rooms: [{ id: 'a', x: 0, y: 0 }] }); H.state.els.a = H.canvas.appendChild(Object.assign(H.doc.createElement('div'), { offsetWidth: 120, offsetHeight: 50 })); H.state.els.a.classList.add('room'); H.state.els.a.dataset.id = 'a';
    const hd = H.doc.createElement('div'); hd.classList.add('rlink'); H.state.els.a.appendChild(hd);
    const capL = (H.canvas.listeners.pointerdown || []).filter(l => l.cap);
    const evH = { target: hd, clientX: 5, clientY: 5, button: 0 }; capL.forEach(l => l.f(Object.assign(evH, { stopPropagation() { evH.stopped = true; }, preventDefault() { evH.prevented = true; } })));
    const linking = H.doc.body.classList.contains('room-linking'); H.doc.fireDoc('keydown', { key: 'Escape' }); const afterEsc = H.doc.body.classList.contains('room-linking');
    const evR = { target: H.state.els.a, button: 0 }; capL.forEach(l => l.f(Object.assign(evR, { stopPropagation() { evR.stopped = true; }, preventDefault() {} })));
    const D = mkWorld(); const dbl = (D.wrap.listeners.dblclick || [])[0]; const dE = { target: D.canvas, clientX: 300, clientY: 250, preventDefault() { dE.prevented = true; } }; dbl.f(dE);
    const D2 = mkWorld({ linkMode: true }); const dE2 = { target: D2.canvas, clientX: 300, clientY: 250, preventDefault() {} }; D2.wrap.listeners.dblclick[0].f(dE2);
    const D3 = mkWorld({ rooms: [{ id: 'a', x: 0, y: 0 }] }); D3.wrap.listeners.dblclick[0].f({ target: D3.doc.createElement('div'), clientX: 1, clientY: 1, preventDefault() {} });
    check('as it loads it hears a press on a handle in the capture phase, so the room never starts its own drag, and a press elsewhere on a room is left alone; Escape lets a drag go where nothing else wanted the key; a double-click on empty ground adds a room centred on it, never in Link Mode and never on something drawn there',
        capL.length === 1 && evH.stopped && evH.prevented && linking && !afterEsc && !evR.stopped && D.am.rooms.length === 1 && D.am.rooms[0].x === 530 && D.am.rooms[0].y === 1070 && dE.prevented && D2.am.rooms.length === 0 && D3.am.rooms.length === 1, J([capL.length, linking, afterEsc, D.am.rooms]));
    check('the Data Map is wired (source): it imports roomcore, every room box carries its handle, Add Room asks roomAddAt at the middle of the view, and the slice publishes window.wpRoomAdd',
        /^import \* as RC from '\.\/roomcore\.js';/m.test(dm) && dm.includes(`el.innerHTML='<div class="rn"></div><div class="rc"></div><div class="badges"></div><div class="rlink" title="Drag to another room to link them. Let go on empty ground for a new linked room." aria-hidden="true"></div>';`)
        && /var cy = \(wrap\.scrollTop \+ wrap\.clientHeight\/2\) \/ state\.zoomLevel - 20;\n\s*roomAddAt\(cx, cy\);/.test(dm) && !/name:'New room'/.test(dm) && pageSrc.includes('window.wpRoomAdd = { at: roomAddAt, rename: roomRename };'));

    /* ---- the play map's row ---- */
    const wb = read('scripts/whiteboard.js'), prSrc = cut(wb, 'pieceroom', 'whiteboard.js');
    const mkRow = o => { o = o || {}; let n = 0; return new Function('window', 'buildMay', 'uid', prSrc + '\nreturn { row: pieceRoomRow, make: pieceRoomMake, ROW: ROOM_ROW };')({ wpRoomCore: o.noCore ? undefined : RC, wpStream: !!o.stream }, () => o.may !== false, () => 'p' + (++n)); };
    const PR = mkRow(), floor = { id: 'w1', type: 'rect', name: 'Kitchen' };
    const rowOk = PR.row([floor]), am2 = { type: 'map', cats: { k: {} }, rooms: [{ id: 'r1', x: 100, y: 100 }] }, made = PR.make(am2, floor);
    check('the play map\'s Make a room for this (whiteboard.js, run for real): offered for one piece that may be a room\'s place, on the GM\'s own campaign; it adds a room beside the rooms there, named after the piece, in the map\'s first category, links the piece to it and answers the room',
        rowOk && rowOk.item === floor && rowOk.html === PR.ROW && J(made) === J({ id: 'p1', name: 'Kitchen', cat: 'k', x: 300, y: 100, notes: '', characters: [] }) && floor.nodeId === 'p1' && am2.rooms.length === 2, J(made));
    {   // the review: a piece hidden from players gives its room no name; a link to a room that is gone is no room
        const hidR = PR.make({ type: 'map', rooms: [] }, { type: 'rect', hidden: true, name: 'Secret vault' }), stale = { type: 'rect', nodeId: 'gone' }, live = { type: 'rect', nodeId: 'r1' };
        check('the review (run for real): a room made for a piece hidden from players starts as New room, never the piece\'s name, since every player is sent the map\'s rooms by name; a piece whose room was deleted is offered the row again and gets a new room, while one whose room stands is not',
            hidR.name === 'New room' && RC.pieceRoomName({ hidden: true, name: 'X' }) === 'New room' && RC.pieceRoomOk(stale, [{ id: 'r1' }]) && !RC.pieceRoomOk(live, [{ id: 'r1' }]) && !RC.pieceRoomOk(stale) && !RC.pieceRoomOk(stale, 'x')
            && PR.row([stale], { rooms: [{ id: 'r1' }] }) !== null && PR.row([live], { rooms: [{ id: 'r1' }] }) === null && PR.make({ type: 'map', rooms: [{ id: 'r1', x: 0, y: 0 }] }, stale).id === 'p3' && stale.nodeId === 'p3', J(hidR));
    }
    const emptyMap = { type: 'map' }, made2 = PR.make(emptyMap, { type: 'circle' });
    check('it is offered for nothing else: two pieces, a piece that has a room now, a token, on a player\'s app, in the stream window, with no rooms core; and makes nothing for such a piece or a page; a map with no rooms yet gets its first at 100, 100',
        PR.row([floor]) === null && PR.row([{ type: 'rect' }, { type: 'rect' }]) === null && PR.row([{ type: 'rect', isChar: true }]) === null && PR.row([]) === null && mkRow({ may: false }).row([{ type: 'rect' }]) === null && mkRow({ stream: true }).row([{ type: 'rect' }]) === null && mkRow({ noCore: true }).row([{ type: 'rect' }]) === null
        && PR.make(am2, { type: 'rect', isChar: true }) === null && PR.make({ type: 'page' }, { type: 'rect' }) === null && made2.x === 100 && made2.y === 100 && made2.name === 'New room' && !('cat' in made2), J(made2));
    check('the row is wired (source): fixed words and the Add Room drawing, on the GM\'s menu after a placed mine\'s row, handed the map\'s rooms; its words and its drawing take no press, since the menu reads the class of what was pressed (the review: a click on its words did nothing); its press makes the room, says it, opens Properties and puts the cursor in the room\'s name, and the menu saves and draws once',
        PR.ROW.includes('<span>Make a room for this<small>Adds it to the Data Map, linked.</small></span>') && PR.ROW.includes('<path d="M12 4.5v15M4.5 12h15"/>')
        && /if \(mnRow\) html \+= mnRow\.html;\n\s*var rmRow = typeof pieceRoomRow === 'function' \? pieceRoomRow\(selectedIds\.map\(function\(sid\) \{ return am\.whiteboard\.find\(function\(x\) \{ return x\.id === sid; \}\); \}\), am\) : null;/.test(wb)
        && read('style.css').includes('#contextMenu .menu-item.cm-room-make > * { pointer-events: none; }') && read('style.css').includes('#contextMenu .menu-item.cm-room-make small { display: block;')
        && wb.includes("if (rmDo) { toast(rmW.hidden ? 'Room made and linked. Players are sent room names, so give it one they may know.' : 'Room made and linked: ' + rmDo.name + '. Type its name in Properties.'); if (window.wpOpenRightPanel) window.wpOpenRightPanel(); setTimeout(function() { var fN = document.getElementById('fName');")
        && dm.includes("if((modeStr === 'data' ? !!(document.body && document.body.classList.contains('data-pan')) : window.isPanMode) || window.wpSpacePan) return;") && dm.includes("(wrapEl === wrap ? document.body.classList.contains('data-pan') : window.isPanMode)"));

    /* ---- the styles, Help, the notes ---- */
    const css = read('style.css'), ix = read('index.html'), wn = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wn2 = read('assets/whatsnew.txt');
    check('the styles: the handle on a room\'s right edge shows, and takes a press, only under the pointer or on the room selected, and never in Link Mode, the Pan tool, while a link is dragged or on a joined player\'s app; a room a link is dragged over is lit; the line dragged is dashed gold and takes no press; the name box stands in the name\'s place; the empty map\'s words take no press, so a double-click on them reaches the ground',
        css.includes('.room:hover .rlink, .room.sel .rlink{opacity:1; pointer-events:auto}') && /\.room \.rlink\{[^}]*opacity:0; pointer-events:none;/.test(css) && css.includes('body.linkmode .room .rlink, body.data-pan .room .rlink, body.room-linking .room .rlink, body.net-client .room .rlink{display:none}') && css.includes('.room.room-target{outline:2px dashed var(--gold);') && css.includes('#edges .link-draft{stroke:var(--gold); stroke-width:2; stroke-dasharray:6 4; pointer-events:none}')
        && css.includes('.room.renaming .rn{display:none}') && /\.room \.rn-edit\{cursor:text;/.test(css) && /#dataEmpty \{[^}]*pointer-events: none;/.test(css));
    check('Help says it in the Data Map\'s Rooms and Connections, the empty map says how to begin, and both release notes say it',
        ix.includes('Add Room</b>, or double-click empty ground. A room is one node of the data map.') && ix.includes('<li>The new room comes up with its name ready to type. Press <kbd>Enter</kbd> to keep it, or <kbd>Esc</kbd> to keep New room.</li>')
        && ix.includes('<b>Make a room for this</b> on a piece&rsquo;s right-click menu adds a room to the Data Map and links the piece to it.') && ix.includes('<li>The dot shows when you point at a room or select it.</li>') && ix.includes('Drag from the <b>small dot</b> on a room&rsquo;s right edge to another room to connect them.')
        && ix.includes('Let go on empty ground and a new room is made there, linked, with its name ready to type.') && ix.includes('Double-click anywhere, or press Add Room on the toolbar. Drag from the dot on a room&rsquo;s edge to link it to another.')
        && [wn, wn2].every(t => /\nThe Data Map\n- A new room comes up with its name ready to type, on the room itself\./.test(t) && t.includes('now stand as a stair, each\n  one in sight.\n') && t.includes('this. The room goes on the Data Map, linked to the piece, and its name is')));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { summed = true; console.log('FAIL      roomcheck threw: ' + (e && e.stack || e)); process.exitCode = 1; });
