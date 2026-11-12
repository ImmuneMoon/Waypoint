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
            get textContent() { return this._text !== undefined ? this._text : this.children.map(k => k.textContent).join(''); }, set textContent(v) { this.children.length = 0; this._text = String(v); },   // as a browser: setting the text takes the children away
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
    const RC = await import(url('roomcore.js')), SC = await import(url('safecore.js'));

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

    /* ---- fold 2: finding a room ---- */
    const RMS = [{ id: 'a', x: 0, y: 0, name: 'Old Mill', cat: 'inn', notes: 'A wheel that turns at night.', characters: [{ name: 'Bren', info: 'Miller, owes the guild' }] }, { id: 'b', x: 10, y: 10, name: 'Café Dock', cat: 'dock', notes: '', characters: [] }, { id: 'c', x: 20, y: 20, name: 'Dock 10', cat: 'gone', notes: 'Smugglers', characters: [] }, { id: 'd', x: 30, y: 30, name: 'dock 2', cat: 'dock' }];
    const CATS = { inn: { label: 'Inns', color: '#4f8fe0' }, dock: { label: 'Docks', color: '#3fb8a0' }, cave: { label: 'Caves', color: '#c46bd6' } };
    check('fold 2 roomcore: words are compared folded (lower case, accents left out); a room is found when every word is in its name, its notes or who is there, and it says which: name, notes or who; nothing typed finds every room as all',
        RC.fold('Café ÄBC') === 'cafe abc' && RC.fold(null) === '' && RC.roomMatch(RMS[1], 'cafe') === 'name' && RC.roomMatch(RMS[0], 'mill wheel') === 'notes' && RC.roomMatch(RMS[0], 'MILLER guild') === 'who' && RC.roomMatch(RMS[0], 'mill dock') === '' && RC.roomMatch(RMS[0], '   ') === 'all'
        && RC.roomMatch(null, 'x') === '' && J(RC.roomWords({ name: 5, characters: [null, { name: 'Ann' }] })) === J({ name: '5', notes: '', who: 'ann ' }) && RC.queryWords('a b c d e f g h i j k l m n').length === 12, J([RC.roomMatch(RMS[0], 'mill wheel'), RC.roomWords(RMS[0])]));
    check('fold 2 roomcore: a room\'s category is its own where the map has it, else the map\'s first; the categories used come in the map\'s order with label, colour and count, none for a category no room is in; a room stands out under the words and the chips picked, and is a hit only of words',
        RC.roomCatOf(RMS[2], CATS) === 'inn' && RC.roomCatOf(RMS[1], CATS) === 'dock' && RC.roomCatOf(RMS[0], null) === ''
        && J(RC.catsUsed(RMS, CATS)) === J([{ key: 'inn', label: 'Inns', color: '#4f8fe0', n: 2 }, { key: 'dock', label: 'Docks', color: '#3fb8a0', n: 2 }]) && J(RC.catsUsed(RMS, null)) === '[]' && RC.catsUsed([{ cat: 'x' }], { x: { label: '' } })[0].label === 'Unnamed'
        && J(RC.roomShown(RMS[0], '', [], CATS)) === J({ shown: true, hit: false }) && J(RC.roomShown(RMS[0], 'mill', ['dock'], CATS)) === J({ shown: false, hit: false }) && J(RC.roomShown(RMS[1], 'dock', ['dock'], CATS)) === J({ shown: true, hit: true }) && J(RC.roomShown(RMS[0], '', ['inn'], CATS)) === J({ shown: true, hit: false }), J(RC.catsUsed(RMS, CATS)));
    check('fold 2 roomcore: the rooms ordered as made, by name as a person reads it (2 before 10, case ignored), or by category in the map\'s order and then name; nothing of the list itself changed',
        J(RC.roomsOrdered(RMS, 'made', CATS).map(x => x.id)) === J(['a', 'b', 'c', 'd']) && J(RC.roomsOrdered(RMS, 'name', CATS).map(x => x.id)) === J(['b', 'd', 'c', 'a']) && J(RC.roomsOrdered(RMS, 'cat', CATS).map(x => x.id)) === J(['c', 'a', 'b', 'd'])
        && J(RMS.map(x => x.id)) === J(['a', 'b', 'c', 'd']) && J(RC.roomsOrdered(null, 'name')) === '[]', J(RC.roomsOrdered(RMS, 'name', CATS).map(x => x.id)));
    const findSrc = cut(dm, 'find', 'datamap.js');
    const mkFind = o => {
        o = o || {};
        const doc = mkDoc(), main = doc.createElement('div'), bar = doc.createElement('div'), box = doc.createElement('input'), chips = doc.createElement('div'), nEl = doc.createElement('span'), mm = doc.createElement('div'), zb = doc.createElement('div'), wrap = doc.createElement('div');
        main.id = 'main'; bar.id = 'dataFind'; bar.hidden = true; box.id = 'dataFindBox'; chips.id = 'dataFindChips'; nEl.id = 'dataFindN'; mm.id = 'minimap'; zb.id = 'zoomBox';
        Object.assign(doc.byId, { main, dataFind: bar, dataFindBox: box, dataFindChips: chips, dataFindN: nEl, minimap: mm, zoomBox: zb });
        const mw = o.mainW || 1000, mt = o.miniTop || 66;
        main.getBoundingClientRect = () => ({ left: 100, top: 40, right: 100 + mw, width: mw, height: 700 });
        mm.getBoundingClientRect = () => (o.noMini ? { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } : { left: 144, right: 330, top: mt, bottom: mt + 186, width: 186, height: 186 });
        zb.getBoundingClientRect = () => ({ left: 100 + mw - 220, right: 100 + mw - 14, top: 66, bottom: 102, width: 206, height: 36 });
        const say = doc.createElement('span'); say.id = 'dataFindSay'; doc.byId.dataFindSay = say;
        if (o.noRulers) doc.body.classList.add('no-rulers');
        chips.querySelector = sel => chips.children.find(c => sel.indexOf('"' + c.dataset.cat + '"') >= 0) || null;
        const edgeEls = (o.links || []).map(l => { const e = doc.createElement('line'); e.setAttribute('data-a', l[0]); e.setAttribute('data-b', l[1]); return e; });
        doc.querySelectorAll = () => edgeEls;
        wrap.scrollLeft = 0; wrap.scrollTop = 0; wrap.clientWidth = 800; wrap.clientHeight = 600;
        const am = { id: o.mapId || 'm1', type: 'map', cats: o.cats || CATS, rooms: (o.rooms || RMS).map(x => Object.assign({}, x)) };
        const state = { viewMode: o.view || 'data', zoomLevel: 2, els: {}, selId: null, selLink: 3 };
        am.rooms.forEach(rm => { const el = doc.createElement('div'); el.classList.add('room'); el.offsetWidth = 120; el.offsetHeight = 50; state.els[rm.id] = el; });
        const log = { renders: 0 }, timers = [];
        const win = { wpNet: o.foreign ? { foreign: true } : null, wpStream: !!o.stream, listeners: {}, addEventListener(tp, f) { (this.listeners[tp] = this.listeners[tp] || []).push(f); } };
        const api = new Function('window', 'document', 'state', 'getActiveMap', 'RC', 'wrap', 'render', 'setTimeout', 'clearTimeout', 'cssColor', findSrc + '\nreturn { sync: dataFindSync, apply: dataFindApply, next: dataFindNext, place: dataFindPlace, st: function() { return _df; } };')(
            win, doc, state, () => am, RC, wrap, () => { log.renders++; }, f => { timers.push(f); return timers.length; }, () => {}, SC.cssColor);
        return { doc, bar, box, chips, nEl, say, am, state, log, timers, win, wrap, edgeEls, api };
    };
    const F = mkFind({ links: [['a', 'b'], ['b', 'd'], ['c', 'a']] }); F.api.sync();
    const chipText = F.chips.children.map(c => c.children.map(k => k.textContent).join('|'));
    check('fold 2 the Find strip (datamap.js, run for real on a page of plain objects): on the Data Map it shows, placed between the minimap and the zoom box, with a chip for each category the rooms use, made by name with its colour (checked: safecore cssColor), label and count as text, and a name a screen reader says',
        F.bar.hidden === false && F.bar.style.left === '238px' && F.bar.style.right === '228px' && J(chipText) === J(['|Inns|2', '|Docks|2']) && F.chips.children[0].children[0].style.backgroundColor === '#4f8fe0' && F.chips.children[0].attrs['aria-pressed'] === 'false' && F.chips.children[0].attrs['aria-label'] === 'Inns, 2 rooms', J([F.bar.style, chipText]));
    F.box.value = 'dock'; F.doc.fire(F.box, 'input', {}); F.timers.shift()();
    const hitIds = F.am.rooms.filter(x => F.state.els[x.id].classList.contains('df-hit')).map(x => x.id), dimIds = F.am.rooms.filter(x => F.state.els[x.id].classList.contains('df-dim')).map(x => x.id), edgeDim = F.edgeEls.map(e => e.classList.contains('df-dim'));
    check('fold 2 words typed in the box: the rooms found are lit and counted, the rest dimmed, and a link fades unless both its rooms stand out',
        J(hitIds) === J(['b', 'c', 'd']) && J(dimIds) === J(['a']) && F.nEl.textContent === '3 of 4' && F.nEl.attrs['aria-label'] === '3 of 4 rooms found' && J(edgeDim) === J([true, false, true]), J([hitIds, dimIds, edgeDim, F.nEl.textContent]));
    const kE1 = F.doc.fire(F.box, 'keydown', { key: 'Enter' }), first = F.state.selId, sl = F.wrap.scrollLeft, st = F.wrap.scrollTop; F.doc.fire(F.box, 'keydown', { key: 'Enter' }); const second = F.state.selId; F.doc.fire(F.box, 'keydown', { key: 'Enter', shiftKey: true }); const back = F.state.selId;   // b at 10, 10: its middle (70, 35) at twice the zoom, less half the map
    const kIme = F.doc.fire(F.box, 'keydown', { key: 'Enter', isComposing: true }), kDel = F.doc.fire(F.box, 'keydown', { key: 'Delete' });
    check('fold 2 Enter goes to the next room found in reading order, selects it and centres the view on it, Shift+Enter to the one before; every key stays in the box, and Enter that ends a composition does nothing',
        kE1.stopped && kE1.prevented && first === 'b' && second === 'c' && back === 'b' && F.state.selLink === null && sl === 70 * 2 - 400 && st === 35 * 2 - 300 && kDel.stopped && !kIme.prevented && F.log.renders === 3 && F.say.textContent === 'Café Dock, 1 of 3', J([first, second, back, sl, st, F.log.renders]));
    const fEsc = F.doc.fire(F.box, 'keydown', { key: 'Escape' });
    check('fold 2 Escape in the box clears it, and every room stands as before', fEsc.prevented && F.box.value === '' && F.am.rooms.every(x => !F.state.els[x.id].classList.contains('df-dim') && !F.state.els[x.id].classList.contains('df-hit')) && F.nEl.textContent === '', '');
    const chipEv = { target: F.chips.children[1] }; F.chips.children[1].closest = () => F.chips.children[1];
    (F.chips.listeners.click || []).forEach(l => l.f(chipEv));
    const afterChip = F.am.rooms.filter(x => F.state.els[x.id].classList.contains('df-dim')).map(x => x.id), docksOn = F.chips.children[1].classList.contains('on'), focusOn = F.doc.activeElement === F.chips.children[1];
    check('fold 2 a chip pressed shows only its category\'s rooms, the rest dimmed and no room lit; it is marked pressed, and the focus stays on it though the chips are made again',
        J(afterChip) === J(['a', 'c']) && docksOn && F.chips.children[1].attrs['aria-pressed'] === 'true' && focusOn && F.am.rooms.every(x => !F.state.els[x.id].classList.contains('df-hit')), J([afterChip, docksOn, focusOn]));
    F.am.id = 'm2'; F.api.sync();
    check('fold 2 another map on screen lets the words and the chips go', F.box.value === '' && F.api.st().picked.length === 0 && F.api.st().mapId === 'm2', J(F.api.st()));
    const one = mkFind({ cats: { inn: { label: 'Inns' } }, rooms: [{ id: 'x', cat: 'inn' }, { id: 'y', cat: 'inn' }] }); one.api.sync();
    const none = mkFind({ rooms: [] }); none.api.sync(); const play = mkFind({ view: 'visual' }); play.api.sync(); const fr = mkFind({ foreign: true }); fr.api.sync(); const sw = mkFind({ stream: true }); sw.api.sync(); const nm = mkFind({ noMini: true }); nm.api.sync();
    check('fold 2 no chips where the rooms are all of one category; the strip is put away with no rooms, on the play map, at someone else\'s table and in the stream window; with the minimap folded away the strip starts past the left ruler',
        one.bar.hidden === false && one.chips.children.length === 0 && [none, play, fr, sw].every(W => W.bar.hidden === true) && nm.bar.style.left === '44px', J([one.chips.children.length, nm.bar.style.left]));
    {   // the review of fold 2 (run for real)
        const G = mkFind(); G.api.sync(); G.box.value = 'dock'; G.doc.fire(G.box, 'keydown', { key: 'Enter', shiftKey: true }); const lastFirst = G.state.selId;
        G.doc.fire(G.box, 'keydown', { key: 'Enter' }); G.doc.fire(G.box, 'keydown', { key: 'Enter' }); G.box.value = 'mill'; G.doc.fire(G.box, 'keydown', { key: 'Enter' }); const newWords = G.state.selId;
        G.box.value = 'dock'; G.doc.fire(G.box, 'keydown', { key: 'Enter' }); G.doc.fire(G.box, 'keydown', { key: 'Enter' }); const c1 = G.chips.children[0]; c1.closest = () => c1; (G.chips.listeners.click || []).forEach(l => l.f({ target: c1 })); const atAfterChip = G.api.st().at;
        const kK = G.doc.fire(G.box, 'keydown', { key: 'k', ctrlKey: true }), kKm = G.doc.fire(G.box, 'keydown', { key: 'K', metaKey: true });
        check('fold 2 the review: Shift+Enter as the first press goes to the last room found; Enter after new words were typed, before the box\'s wait is over, starts from their first room; a chip pressed starts Enter again from the first; Ctrl+K and the command key\'s K go on to quick jump',
            lastFirst === 'd' && newWords === 'a' && atAfterChip === -1 && !kK.stopped && !kKm.stopped, J([lastFirst, newWords, atAfterChip]));
        const hostile = mkFind({ cats: { inn: { label: 'Inns', color: 'url(/saves/x.png)' }, dock: { label: 'Docks', color: 'red; background-image: url(x)' } } }); hostile.api.sync();
        check('fold 2 the review: a category\'s colour from a file reaches a chip only as safecore cssColor keeps it, so a picture or a second property named in its place draws the plain grey',
            hostile.chips.children.length === 2 && hostile.chips.children.every(c => c.children[0].style.backgroundColor === '#888') && hostile.chips.children.every(c => c.children[0].style.background === undefined), J(hostile.chips.children.map(c => c.children[0].style)));
        const narrow = mkFind({ mainW: 480, noMini: true }); narrow.api.sync(); const under = mkFind({ miniTop: 110 }); under.api.sync(); const noRul = mkFind({ noRulers: true, noMini: true }); noRul.api.sync();
        check('fold 2 the review: where too little room is left between the minimap and the zoom box the strip takes a row of its own under the zoom box, past the left ruler to the area\'s edge; a minimap standing under the zoom box is not in the strip\'s row; with the rulers off it starts at the edge',
            narrow.bar.style.top === '70px' && narrow.bar.style.left === '44px' && narrow.bar.style.right === '8px' && under.bar.style.top === '' && under.bar.style.left === '44px' && noRul.bar.style.left === '8px', J([narrow.bar.style, under.bar.style, noRul.bar.style]));
        const besideM = mkFind({ mainW: 520 }); besideM.api.sync(); const mmUnder = mkFind({ mainW: 480, miniTop: 110 }); mmUnder.api.sync(); const roomy = mkFind({ mainW: 520, miniTop: 110 }); roomy.api.sync(); const tight = mkFind({ mainW: 380, miniTop: 110 }); tight.api.sync();
        check('fold 2 the second look: the strip\'s own row under the zoom box never lies over an open minimap, whether it stands in the zoom box\'s row or under it (main.js cornerFit\'s mm-under): beside it where there is room, else under it; where the strip still fits its own row it stays there, clear of a minimap under the zoom box',
            roomy.bar.style.top === '' && roomy.bar.style.left === '44px' && besideM.bar.style.top === '70px' && besideM.bar.style.left === '238px' && mmUnder.bar.style.top === '70px' && mmUnder.bar.style.left === '238px' && tight.bar.style.top === '264px' && tight.bar.style.left === '44px' && tight.bar.style.right === '8px', J([besideM.bar.style, mmUnder.bar.style, tight.bar.style]));
        const rw = { name: 'A', notes: 'b', characters: [] }, w1 = RC.roomWords(rw), w2 = RC.roomWords(rw); rw.notes = 'Smugglers'; const w3 = RC.roomWords(rw);
        check('fold 2 the review: a room\'s folded words are kept until its words change, so a drag that draws the Data Map at every move folds nothing again',
            w1 === w2 && w3 !== w1 && w3.notes === 'smugglers', J([w1, w3]));
        const pc = { constructor: { label: 'Ports', color: '#123456' }, toString: { label: 'Other' } };
        check('fold 2 the review: a category keyed as a name every object inherits is counted and chipped as any other',
            J(RC.catsUsed([{ cat: 'constructor' }, { cat: 'toString' }, { cat: 'constructor' }], pc)) === J([{ key: 'constructor', label: 'Ports', color: '#123456', n: 2 }, { key: 'toString', label: 'Other', color: '', n: 1 }]), J(RC.catsUsed([{ cat: 'constructor' }], pc)));
        check('fold 2 the review: quick jump reads a room by the Find box\'s own rule (jumpMatch): every word, accents left out, in its name, its notes or who is there, and says which',
            RC.jumpMatch('Café Dock', '', '', 'cafe') === 'name' && RC.jumpMatch('Loft', RC.fold('the smith is old'), '', 'old smith') === 'notes' && RC.jumpMatch('Cellar', '', RC.fold('Bren the miller owes the guild'), 'guild miller') === 'who' && RC.jumpMatch('Loft', 'x', 'y', 'zzz') === '' && RC.jumpMatch('Loft', '', '', '  ') === '', '');
        const dmr = read('scripts/datamap.js'), ins = read('scripts/inspector.js'), css2 = read('style.css');
        check('fold 2 the review (source): the Data Map draws a room\'s category by roomcore\'s rule; a rename ended by a press elsewhere, a note typed in Properties and a character\'s words ask the strip again; the strip\'s place follows a class of the body and the chips scroll by the wheel with their edge faded where more lie past it; a hit glows and never wears the outline selection and linking wear; the strip moves under a hidden top row\'s bar; the box\'s own clear mark is put away; the Order list is styled as the list\'s Find box',
            dmr.includes("RC.roomCatOf(r, activeMap.cats)) ? activeMap.cats[RC.roomCatOf(r, activeMap.cats)] : null)||{label:'Unknown',color:'#000'};") && dmr.includes("if (window.wpDataFind && typeof window.wpDataFind.apply === 'function') window.wpDataFind.apply();   // fold 2: a name typed may now be found")
            && (ins.match(/if \(window\.wpDataFind && typeof window\.wpDataFind\.apply === 'function'\) window\.wpDataFind\.apply\(\);/g) || []).length === 2 && dmr.includes("new MutationObserver(function() { dataFindPlace(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });") && dmr.includes("chips.addEventListener('wheel', function(e) {")
            && css2.includes('.room.df-hit{box-shadow:0 0 0 2px rgba(224,165,79,.55), 0 0 16px rgba(224,165,79,.5); z-index:3}') && !/\.room\.df-hit\{[^}]*outline/.test(css2) && css2.includes('  body.row-hidden:not(.tour-on):not(.stream-mode) #dataFind:not([style*="top"]) { top: calc(var(--rowbar) + 32px); }')
            && css2.includes('#dataFindBox::-webkit-search-cancel-button{display:none}') && /#elementRoomOrder\{[^}]*background:var\(--panel2\)/.test(css2) && css2.includes('.room.df-dim.sel{opacity:.6}'));
    }
    check('fold 2 the wiring (source): the Data Map\'s drawing ends by asking the strip, each link\'s line, wide stroke and chip name the rooms it joins, main.js puts the strip away off the Data Map, Escape in the box is the box\'s own while it holds words, and the page holds the strip with the app\'s own magnifier drawing',
        dm.includes("    if (typeof dataFindSync === 'function') dataFindSync();") && dm.includes("hit.setAttribute('data-a', lk[0]); hit.setAttribute('data-b', lk[1]);") && dm.includes("ln.setAttribute('data-a', lk[0]); ln.setAttribute('data-b', lk[1]);") && dm.includes("del.setAttribute('data-a', lk[0]); del.setAttribute('data-b', lk[1]);")
        && read('scripts/main.js').includes("var dataFindEl = document.getElementById('dataFind'); if (dataFindEl && !(!isPlanner && state.viewMode === 'data')) dataFindEl.hidden = true;") && read('scripts/esckey.js').includes("t.id === 'dataFindBox' ||")
        && read('index.html').includes('<div id="dataFind" role="search" hidden>') && read('index.html').includes('<path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.4 15.4l5.1 5.1"/></svg><input type="search" id="dataFindBox" placeholder="Find a room"'));
    // quick jump (main.js's cmdkrows slice, run for real) and the rooms list (inspector.js, source)
    const mj = read('scripts/main.js'), ck = mj.slice(mj.indexOf('// [shelfcheck:cmdkrows-start]'), mj.indexOf('// [shelfcheck:cmdkrows-end]'));
    const runCk = (entries, q) => { const list = { innerHTML: '' }; const fn = new Function('window', 'document', 'state', 'esc', '_cmdkEntries', 'cmdkHintSync', 'var _cmdkShown, _cmdkIdx;\n' + ck + '\ncmdkRender(' + JSON.stringify(q) + '); return _cmdkShown;'); return fn({ wpRoomCore: RC }, { getElementById: () => list }, { appState: { campaigns: {} } }, x => String(x), entries, () => {}); };
    const ents = [{ kind: 'room', label: 'Loft', sub: 'Town', wn: RC.fold('A trapdoor to the café'), ww: '' }, { kind: 'room', label: 'Cellar', sub: 'Town', wn: '', ww: RC.fold('Bren the miller, owes the guild') }, { kind: 'room', label: 'Café', sub: 'Inns' }];
    const q1 = runCk(ents, 'Café'), q2 = runCk(ents, 'guild miller'), q3 = runCk(ents, 'zzz'), q4 = runCk(ents, 'cafe');
    check('fold 2 quick jump (main.js, run for real): a room is found by every word, accents left out, in its name or, ranked below a name and said beside it, in its notes or by who is there; a word nowhere finds nothing',
        J(q1.map(e => [e.label, e.sub])) === J([['Café', 'Inns'], ['Loft', 'Town, in its notes']]) && J(q2.map(e => [e.label, e.sub])) === J([['Cellar', 'Town, by who is there']]) && q3.length === 0 && ents[0].sub === 'Town' && J(q4.map(e => [e.label, e.sub])) === J([['Café', 'Inns'], ['Loft', 'Town, in its notes']]), J([q1, q2, q4]));
    const ins = read('scripts/inspector.js');
    check('fold 2 the rooms list (source): on the Data Map an Order list of As made, By name and By category, kept on this computer as one of three words and read back so; the rooms come in that order, by category under a heading of each, escaped; the list keeps the focus',
        ins.includes("function elRoomOrder() { var v = ''; try { v = localStorage.getItem('wp_roomOrder') || ''; } catch (e) {} return v === 'name' || v === 'cat' ? v : 'made'; }") && ins.includes('<select id="elementRoomOrder" aria-label="Order of the rooms">')
        && ins.includes("ordered = window.wpRoomCore.roomsOrdered(items, roomOrd, activeMap.cats)") && ins.includes("html += '<div class=\"el-layer-head\">' + esc(cE && cE.label ? cE.label : 'No category') + '</div>';") && ins.includes("var ns = document.getElementById('elementRoomOrder'); if (ns) ns.focus();"));

    /* ---- the styles, Help, the notes ---- */
    /* ---- fold 3: a room and its place on the play map ---- */
    {
        const M = { whiteboard: [
            { id: 'small', type: 'rect', x: 10, y: 10, w: 20, h: 20, nodeId: 'r1' }, { id: 'big', type: 'rect', x: 0, y: 0, w: 200, h: 100, nodeId: 'r1' },
            { id: 'tok', isChar: true, x: 0, y: 0, w: 900, h: 900, nodeId: 'r1' }, { id: 'wait', waiting: true, x: 0, y: 0, w: 900, h: 900, nodeId: 'r2' },
            { id: 'note', gmNoteFor: 'p', x: 0, y: 0, w: 900, h: 900, nodeId: 'r2' }, { id: 'nobox', nodeId: 'r3' }, { id: 'none', x: 0, y: 0, w: 50, h: 50 },
            { id: 'r4p', x: 5, y: 5, nodeId: 'r4' }, null, 'junk'] };
        const placed = RC.roomsPlaced(M), room = { id: 'r9', name: 'Old Mill' };
        const area = RC.roomPlacePiece('area', room, { x: 10.4, y: -3, w: 120.6, h: 80 }), floor = RC.roomPlacePiece('floor', room, { x: 0, y: 0, w: 50, h: 50 }, { color: '#222', texture: 'stone', layer: 'front', nodeId: 'x', type: 'circle' });
        check('fold 3 (roomcore run for real): a room\'s place is the largest piece of the play map that names it, never a token, a waiting token, a GM note card or a piece with no place on the board; the rooms placed are those that have one, in an object with no prototype; a place drawn is a clear area hidden from players and marked roomArea, or a floor in the floor handed in, its box whole pixels at 0 or more and its name the room\'s; any other kind, a box under 10 px or one that is no number makes none',
            RC.roomPlaceOf(M, 'r1').id === 'big' && RC.roomPlaceOf(M, 'r2') === null && RC.roomPlaceOf(M, 'r3') === null && RC.roomPlaceOf(M, 'r4').id === 'r4p' && RC.roomPlaceOf(null, 'r1') === null && RC.roomPlaceOf({}, 'r1') === null
            && J(Object.keys(placed).sort()) === J(['r1', 'r4']) && Object.getPrototypeOf(placed) === null && J(RC.roomsPlaced('x')) === '{}'
            && J(area) === J({ type: 'rect', x: 10, y: 0, w: 121, h: 80, color: 'transparent', layer: 'back-mid', nodeId: 'r9', name: 'Old Mill', hidden: true, roomArea: true })
            && J(floor) === J({ color: '#222', texture: 'stone', layer: 'back', nodeId: 'r9', type: 'rect', x: 0, y: 0, w: 50, h: 50, name: 'Old Mill' })
            && RC.roomPlacePiece('floor', room, { x: 0, y: 0, w: 50, h: 50 }).color === '#3a3a44' && RC.roomPlacePiece('area', { id: 'r', name: '' }, { x: 0, y: 0, w: 50, h: 50 }).name === 'Room'
            && RC.roomPlacePiece('door', room, { x: 0, y: 0, w: 50, h: 50 }) === null && RC.roomPlacePiece('area', room, { x: 0, y: 0, w: 9, h: 50 }) === null && RC.roomPlacePiece('area', room, { x: 'a', y: 0, w: 50, h: 50 }) === null
            && RC.roomPlacePiece('area', {}, { x: 0, y: 0, w: 50, h: 50 }) === null && RC.roomPlacePiece('area', room, null) === null, J([area, floor]));
    }
    {
        const wbS = read('scripts/whiteboard.js'), rpS = cut(wbS, 'roomplace', 'whiteboard.js');
        const mkRP = o => {
            o = o || {}; const doc = mkDoc(), toasts = [], asks = [], saves = []; let n = 0, renders = 0, viewSet = [];
            const mv = doc.createElement('button'); mv.classList.add('active'); let mvClicks = 0; mv.click = () => { mvClicks++; }; doc.byId.moveModeBtn = mv;
            const nb = doc.createElement('button'); nb.classList.add('on'); doc.byId.wbRoomNamesBtn = nb;
            const store = Object.assign({}, o.store || {}), ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } };
            const am = o.am || { id: 'm1', type: 'map', rooms: [{ id: 'r1', name: 'Old Mill' }], whiteboard: [] }, state = { selWbId: null, selWbIds: [] };
            const win = { wpRoomCore: RC, wpStream: !!o.stream, wpSetViewMode: v => viewSet.push(v), wpBuildCore: { pieceProps: m => (m === 'floor' ? { color: '#444', texture: 'planks' } : null) } };
            const api = new Function('window', 'document', 'getActiveMap', 'buildMay', 'toast', 'showConfirm', 'state', 'uid', 'save', 'render', 'wbWrap', 'localStorage', rpS + '\nreturn { step: roomPlaceStep, row: roomShowRow, sync: roomNameSync, places: roomNamePlaces, on: roomNamesOn, ROW: ROOM_SHOW_ROW, LEADS: ROOM_LEADS };')(
                win, doc, () => (o.noMap ? null : am), () => o.may !== false, m => toasts.push(m), (q, cb, op) => asks.push({ q, cb, op }), state, () => 'u' + (++n), () => saves.push(1), () => { renders++; }, { style: {} }, ls);
            return { api, win, doc, am, state, toasts, asks, saves, store, nb, get renders() { return renders; }, viewSet, get mvClicks() { return mvClicks; } };
        };
        const W = mkRP(), armed = W.win.wpRoomPlace('r1'), P = W.win.wpPlace;
        W.api.step(P.roomplace, 10, 10, 5, 5); const reArm = W.win.wpPlace && W.win.wpPlace.roomplace === P.roomplace, small = W.asks.length;
        W.api.step(P.roomplace, 100, 120, 160, 90); const ask = W.asks[0];
        ask.cb(true); const ar = W.am.whiteboard[0], arSel = W.state.selWbId;
        W.api.step(P.roomplace, 300, 120, 60, 60); W.asks[1].cb('alt'); const fl = W.am.whiteboard[1];
        W.api.step(P.roomplace, 300, 120, 60, 60); W.asks[2].cb(false); const kept = W.am.whiteboard.length;
        W.api.step(P.roomplace, 300, 120, 60, 60); W.am.rooms.length = 0; W.asks[3].cb(true); const gone = W.am.whiteboard.length, goneSaid = W.toasts.slice(-1)[0];
        check('fold 3, Place it (whiteboard.js roomplace, run for real): it switches to the play map and arms the map\'s next drag for that room; a click or a box under 12 px arms it again and asks nothing; a box asks, its buttons alone, an area only you see or a floor players see; the area is laid hidden and marked, the floor in Build\'s Floor material, each named after the room, selected, one save; Cancel lays nothing, and a room deleted meanwhile lays nothing and says so',
            armed === true && J(W.viewSet) === J(['visual']) && P.type === 'roomplace' && P.roomplace.roomId === 'r1' && P.roomplace.mapId === 'm1' && reArm && small === 0
            && ask.q === 'The place of Old Mill: an area only you see, or a floor players see?' && ask.op.yes === 'An area only I see' && ask.op.alt === 'A floor players see' && ask.op.noEnter === true
            && ar.hidden === true && ar.roomArea === true && ar.nodeId === 'r1' && ar.name === 'Old Mill' && ar.x === 100 && ar.w === 160 && ar.id === 'wbu1' && arSel === ar.id
            && fl.texture === 'planks' && fl.color === '#444' && fl.layer === 'back' && !fl.hidden && fl.nodeId === 'r1' && kept === 2 && gone === 2 && goneSaid === 'That room is gone. Nothing was placed.' && W.saves.length === 2,
            J([armed, W.viewSet, reArm, small, W.asks.length, kept, gone, W.saves.length, W.toasts]));
        const P2 = mkRP({ may: false }), P3 = mkRP({ stream: true }), P4 = mkRP();
        const noRoom = P4.win.wpRoomPlace('nope'), other = mkRP(); other.win.wpRoomPlace('r1'); const oP = other.win.wpPlace.roomplace; other.am.id = 'm2'; other.api.step(oP, 0, 0, 100, 100);
        check('fold 3: Place it is the GM\'s own (never on a player\'s app or in the stream window, never for a room that is not there), and a drag that lands on another map lays nothing',
            P2.win.wpRoomPlace('r1') === false && !P2.win.wpPlace && P3.win.wpRoomPlace('r1') === false && noRoom === false && other.asks.length === 0 && other.toasts.slice(-1)[0] === 'That map is no longer on screen. Nothing was placed.');
        const Q = mkRP(), linked = { id: 'a', nodeId: 'r1' };
        check('fold 3, Show on the Data Map (run for real): on the GM\'s menu of one piece whose room is on the Data Map, its words and drawing fixed; never for two pieces, a piece with no room or a room that is gone, on a player\'s app or in the stream window',
            Q.api.row([linked], Q.am).html === Q.api.ROW && Q.api.ROW.includes('<span>Show on the Data Map<small>Its room, selected.</small></span>') && Q.api.row([linked, linked], Q.am) === null && Q.api.row([{ id: 'b' }], Q.am) === null
            && Q.api.row([{ id: 'c', nodeId: 'gone' }], Q.am) === null && mkRP({ may: false }).api.row([linked], Q.am) === null && mkRP({ stream: true }).api.row([linked], Q.am) === null && Q.api.row([linked], null) === null);
        const R = mkRP(), el = R.doc.createElement('div'); el.querySelector = s => { const k = el.children.find(c => c.classList.contains(s.replace(':scope > .', ''))) || null; if (k) k.remove = () => el.removeChild(k); return k; };
        R.am.whiteboard = [{ id: 'floor', type: 'rect', x: 0, y: 0, w: 300, h: 200, nodeId: 'r1' }, { id: 'mark', type: 'rect', x: 10, y: 10, w: 30, h: 30, nodeId: 'r1' }, { id: 'tok', isChar: true, x: 0, y: 0, w: 999, h: 999, nodeId: 'r1' }, { id: 'tx', type: 'text', x: 0, y: 0, w: 999, h: 999, nodeId: 'r1' }, { id: 'lost', type: 'rect', x: 0, y: 0, w: 5, h: 5, nodeId: 'gone' }];
        const pl = R.api.places(R.am);
        R.api.sync(el, { id: 'floor' }, pl); const tag = el.children[0];
        const t1 = tag && tag.className, w1 = tag && tag.textContent, h1 = tag && tag.attrs['aria-hidden'];
        R.am.rooms[0].name = '<b>x</b>'; R.api.sync(el, { id: 'floor' }, R.api.places(R.am)); const w2 = el.children[0].textContent;
        R.api.sync(el, { id: 'floor' }, null); const gone1 = el.children.length;
        const bare = R.doc.createElement('div'); let asked = 0; bare.querySelector = () => { asked++; return null; }; R.api.sync(bare, { id: 'none' }, pl);
        const off = mkRP({ store: { wp_roomNames: 'off' } }), gm = mkRP({ may: false }), st = mkRP({ stream: true });
        R.nb.listeners.click[0].f({}); const offNow = [R.store.wp_roomNames, R.nb.classList.contains('on'), R.nb.attrs['aria-checked'], R.api.places(R.am)]; R.nb.listeners.click[0].f({});
        check('fold 3, room names (run for real): a room\'s name stands once, on its place, the largest piece that names it, never on a small mark of the same room, a token, a text box or a piece whose room is gone; set as text in a plate hidden from a screen reader; a piece that wears none and never did passes by without a lookup; none with Room names unticked, on a player\'s app or in the stream window; the View tick is this computer\'s, starts ticked and is read once',
            J(Object.keys(pl)) === J(['floor']) && pl.floor === R.am.rooms[0] && t1 === 'wb-room-name' && w1 === 'Old Mill' && h1 === 'true' && w2 === '<b>x</b>' && gone1 === 0 && asked === 0
            && off.api.places(off.am) === null && gm.api.places(gm.am) === null && st.api.places(st.am) === null && R.api.places({ rooms: [], whiteboard: [] }) === null
            && R.api.on() === true && J(offNow) === J(['off', false, 'false', null]) && R.store.wp_roomNames === 'on' && R.nb.classList.contains('on'), J([pl && Object.keys(pl), t1, w1, w2, gone1, asked, offNow]));
        const L = mkRP({ am: { id: 'm1', type: 'map', rooms: [{ id: 'r1', name: 'Door', targetMapId: 'm2' }], whiteboard: [] } }), lp = L.win.wpRoomPlace('r1');
        const L2 = mkRP(); L2.win.wpRoomPlace('r1'); const rec = L2.win.wpPlace.roomplace; L2.am.rooms[0].targetMapId = 'm9'; L2.api.step(rec, 0, 0, 100, 100);
        const L3 = mkRP(); L3.win.wpRoomPlace('r1'); L3.api.step(L3.win.wpPlace.roomplace, 0, 0, 100, 100); L3.am.rooms[0].targetMapId = 'm9'; L3.asks[0].cb('alt');
        check('the review of fold 3: a room that leads to another map gets no place drawn, since a piece linked to it is a way there and a hidden one a trap tile, refused as Place it is pressed, at the drag and at the answer, in words that say what to do',
            lp === false && !L.win.wpPlace && L.toasts[0] === L.api.LEADS && L.api.LEADS === 'This room leads to another map, so a piece linked to it is a way there. Link the doorway piece to it in Properties instead.'
            && L2.asks.length === 0 && L2.toasts.slice(-1)[0] === L2.api.LEADS && L3.am.whiteboard.length === 0 && L3.toasts.slice(-1)[0] === L3.api.LEADS);
        check('fold 3 is wired (source): the placement hands a drag to roomPlaceStep, the board marks an area and asks for its name plate, the menu offers Show on the Data Map after Make a room for this, and a press on it shows the room',
            wbS.includes("    if (P.roomplace) { roomPlaceStep(P.roomplace, px, py, pw, ph); return; }") && wbS.includes("el.classList.toggle('wb-room-area', item.roomArea === true && !!item.nodeId && !clientView);")
            && wbS.includes("          roomNameSync(el, item, rnPlaces);") && wbS.includes("var rnPlaces = typeof roomNamePlaces === 'function' ? roomNamePlaces(activeMap) : null;") && /if \(rmRow\) html \+= rmRow\.html;\n\s*var rsRow = typeof roomShowRow === 'function'/.test(wbS) && wbS.includes("var rsSaid = selectedIds.length === 1 && window.wpRoomShowData ? window.wpRoomShowData(selectedIds[0]) : '';"));
    }
    {
        const dmS = read('scripts/datamap.js'), plS = cut(dmS, 'place', 'datamap.js');
        const mk = () => { const views = [], st = { selId: 'x', selWbId: null, selWbIds: [] }, am = { id: 'm1', type: 'map', meta: {}, rooms: [{ id: 'r1', x: 100, y: 40 }, { id: 'r2', x: 0, y: 0 }], whiteboard: [{ id: 'p', x: 10, y: 20, w: 200, h: 100, nodeId: 'r1' }, { id: 'q', x: 0, y: 0, w: 10, h: 10 }] }; let renders = 0, cams = 0;
            const win = { wpSetViewMode: v => views.push(v), appRender: () => { renders++; }, appRestoreCamera: () => { cams++; } };
            const api = new Function('window', 'getActiveMap', 'state', 'RC', plS + '\nreturn { play: roomShowPlay, data: roomShowData };')(win, () => am, st, RC);
            return { api, am, st, views, get renders() { return renders; }, get cams() { return cams; } }; };
        const A = mk(), s1 = A.api.play('r1'), B = mk(), s2 = B.api.play('r2'), C = mk(), s3 = C.api.data('p'), D = mk(), s4 = D.api.data('q');
        check('fold 3, Show it both ways (datamap.js place, run for real): from a room to its place, the play map with the place selected and in the middle of the view; a room with no place says so and moves nothing; from a piece to its room, the Data Map with the room selected and in the middle; a piece with no room says so',
            s1 === '' && J(A.views) === J(['visual']) && A.am.meta.lastWbX === 110 && A.am.meta.lastWbY === 70 && A.st.selWbId === 'p' && A.st.selId === null && A.renders === 1 && A.cams === 1
            && s2 === 'This room has no place on the play map yet. Press Place it to draw one.' && B.views.length === 0
            && s3 === '' && J(C.views) === J(['data']) && C.am.meta.lastX === 170 && C.am.meta.lastY === 70 && C.st.selId === 'r1' && C.st.selWbId === null
            && s4 === 'That piece names no room on the Data Map.' && D.views.length === 0, J([s1, s2, s3, s4, A.am.meta, C.am.meta]));
        check('fold 3, a room with no place (source): the Data Map marks it no-place from roomsPlaced and gives it a No place line with Place it, whose press is no press on the room; the style sheet dashes its edge and shows the line only selected, never on a player\'s app',
            dmS.includes("var seen={}, placed = RC.roomsPlaced(activeMap);") && dmS.includes("el.classList.toggle('no-place', !placed[r.id]);") && dmS.includes("el.insertAdjacentHTML('beforeend', '<div class=\"rnp\"><span>No place</span><button type=\"button\" class=\"rnp-go\"")
            && plS.includes("['pointerdown', 'mousedown', 'dblclick'].forEach(function(ev) { b.addEventListener(ev, function(e) { e.stopPropagation(); }); });")
            && read('style.css').includes('.room.no-place{border-top:1px dashed var(--dim);') && read('style.css').includes('.room.sel.no-place .rnp{display:flex}') && read('style.css').includes('body.net-client .room .rnp{display:none}')
            && read('style.css').includes('.wb-item.wb-room-area { opacity: 1; outline: none; box-sizing: border-box; border: 2px dashed var(--gold); }') && read('style.css').includes('body.placing #whiteboard .wb-item svg path { pointer-events: none; }') && read('style.css').includes('.wb-item.wb-room-area:not(.sel) { pointer-events: none; }')
            && read('style.css').includes('.room .rnp{display:none; position:absolute;') && read('style.css').includes('body.net-client .room.no-place{border-top:1px solid var(--edge);'));
    }
    {
        const inS = read('scripts/inspector.js'), prS = cut(inS, 'placerow', 'inspector.js');
        const mk = (mode) => new Function('window', 'state', 'document', 'toast', prS + '\nreturn { html: roomPlaceRowHtml };')({ wpRoomCore: RC }, { viewMode: mode }, {}, () => {});
        const am = { whiteboard: [{ id: 'p', x: 0, y: 0, w: 10, h: 10, nodeId: 'r1' }] };
        const h1 = mk('data').html({ id: 'r1' }, am), h2 = mk('data').html({ id: 'r2', name: '<script>' }, am), h3 = mk('visual').html({ id: 'r1' }, am);
        check('fold 3, a room\'s Properties (inspector.js placerow, run for real): on the Data Map, Show on the play map for a room with a place and No place yet with Place it for one with none, in fixed words with nothing of the room in the markup; on the play map nothing',
            h1.includes('id="fRoomShowPlay"') && h1.includes('>Show on the play map</button>') && !h1.includes('fRoomPlace') && h2.includes('No place on the play map yet.') && h2.includes('id="fRoomPlace"') && !h2.includes('script') && h3 === ''
            && inS.includes("(typeof roomPlaceRowHtml === 'function' ? roomPlaceRowHtml(r, activeMap) : '')+") && inS.includes("if (typeof roomPlaceRowWire === 'function') roomPlaceRowWire(r);"), J([h1, h2, h3]));
    }
    const css = read('style.css'), ix = read('index.html'), wn = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wn2 = read('assets/whatsnew.txt');
    check('the styles: the handle on a room\'s right edge shows, and takes a press, only under the pointer or on the room selected, and never in Link Mode, the Pan tool, while a link is dragged or on a joined player\'s app; a room a link is dragged over is lit; the line dragged is dashed gold and takes no press; the name box stands in the name\'s place; the empty map\'s words take no press, so a double-click on them reaches the ground',
        css.includes('.room:hover .rlink, .room.sel .rlink{opacity:1; pointer-events:auto}') && /\.room \.rlink\{[^}]*opacity:0; pointer-events:none;/.test(css) && css.includes('body.linkmode .room .rlink, body.data-pan .room .rlink, body.room-linking .room .rlink, body.net-client .room .rlink{display:none}') && css.includes('.room.room-target{outline:2px dashed var(--gold);') && css.includes('#edges .link-draft{stroke:var(--gold); stroke-width:2; stroke-dasharray:6 4; pointer-events:none}')
        && css.includes('.room.renaming .rn{display:none}') && /\.room \.rn-edit\{cursor:text;/.test(css) && /#dataEmpty \{[^}]*pointer-events: none;/.test(css));
    check('Help says it in the Data Map\'s Rooms and Connections, the empty map says how to begin, and both release notes say it',
        ix.includes('Add Room</b>, or double-click empty ground. A room is one node of the data map.') && ix.includes('<li>The new room comes up with its name ready to type. Press <kbd>Enter</kbd> to keep it, or <kbd>Esc</kbd> to keep New room.</li>')
        && ix.includes('<b>Make a room for this</b> on a piece&rsquo;s right-click menu adds a room to the Data Map and links the piece to it.') && ix.includes('<li>The dot shows when you point at a room or select it.</li>') && ix.includes('Drag from the <b>small dot</b> on a room&rsquo;s right edge to another room to connect them.')
        && ix.includes('Let go on empty ground and a new room is made there, linked, with its name ready to type.') && ix.includes('Double-click anywhere, or press Add Room on the toolbar. Drag from the dot on a room&rsquo;s edge to link it to another.')
        && css.includes('.room.df-dim{opacity:.22}') && css.includes('.room.df-hit{box-shadow:') && css.includes('body.net-client #dataFind, body.stream-mode #dataFind{display:none}')
        && ix.includes('<h4>Finding a room</h4>') && ix.includes('The <b>Find a room</b> box along the top of the Data Map reads each room&rsquo;s name, its notes and who is there.') && ix.includes('A dimmed room still works as any room does.') && ix.includes('The chips show when the rooms are in two categories or more.')
        && ix.includes('<h4>A room and the play map</h4>') && ix.includes('Select it and it says <b>No place</b>, with <b>Place it</b> beside.') && ix.includes('Untick <b>Room names</b> in the View menu to put them away.')
        && [wn, wn2].every(t => t.includes('- A room with no place on the play map now has a dashed edge. Select it and') && t.includes('- Fixed: placing a shape or Build\'s pieces over a filled region could drag'))
        && [wn, wn2].every(t => t.includes('- A Find a room box runs along the top of the Data Map. It reads each room\'s') && t.includes('- Quick jump finds a room by the words in its notes or by who is there too.'))
        && [wn, wn2].every(t => /\nThe Data Map\n- A new room comes up with its name ready to type, on the room itself\./.test(t) && t.includes('now stand as a stair, each\n  one in sight.\n') && t.includes('this. The room goes on the Data Map, linked to the piece, and its name is')));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { summed = true; console.log('FAIL      roomcheck threw: ' + (e && e.stack || e)); process.exitCode = 1; });
