// A map's places (1.6.3; a player's idea at the owner's game of 2026-11-15): placecore.js imported and run (the one judge of a place, its name
// and the list's reading order, a viewer's list failing closed), fog.js's placeSeen slice run with the real fogcore (what a player, the stream
// window and the GM's screen read as seen: what their tokens see now, what the screen remembers, a map with no fog), places.js's slices run on a
// page of plain objects that refuses markup (the box's list and a teleporter's card, a legend, hostile names as text nodes), and the wiring:
// the page, the floating box lists, Escape, the board's draw, Properties, Add, Show on my map, Help and both release notes, and CI.
// Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      placescheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..'), app = f => path.join(root, 'system', 'app', f), read = f => fs.readFileSync(app(f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify, count = (s, t) => s.split(t).length - 1;
// A slice of a script between its two markers
const slice = (src, name) => { const a = src.indexOf('// [' + name + '-start]'), z = src.indexOf('// [' + name + '-end]'); if (a < 0 || z < a) throw new Error('placescheck: no slice ' + name); return src.slice(a, z); };

// A page of plain objects: elements made by name, text nodes, and no markup ever (innerHTML and outerHTML throw)
function mkDoc() {
    const made = [];
    const node = tag => {
        const e = { nodeType: 1, tagName: String(tag).toUpperCase(), childNodes: [], className: '', dataset: {}, style: {}, attrs: {}, parentNode: null, type: '', title: '',
            get firstChild() { return this.childNodes[0] || null; },
            appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
            removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
            setAttribute(k, v) { this.attrs[k] = String(v); },
            get textContent() { return this.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); } };
        Object.defineProperty(e, 'innerHTML', { set() { throw new Error('innerHTML written'); }, get() { throw new Error('innerHTML read'); } });
        Object.defineProperty(e, 'outerHTML', { set() { throw new Error('outerHTML written'); } });
        made.push(e); return e;
    };
    return { made, createElement: node, createTextNode: t => ({ nodeType: 3, nodeValue: String(t) }) };
}
// Every element under a node, depth first
const all = n => n && n.childNodes ? n.childNodes.reduce((a, c) => a.concat(c.nodeType === 1 ? [c].concat(all(c)) : []), []) : [];
const byClass = (n, cls) => all(n).filter(e => (' ' + e.className + ' ').includes(' ' + cls + ' '));

(async () => {
    const FC = await import(url.pathToFileURL(app('scripts/fogcore.js')).href), PC = await import(url.pathToFileURL(app('scripts/placecore.js')).href);

    /* ---- placecore: the one judge ---- */
    {
        const long = 'A'.repeat(59) + '\u{1F3F0}' + 'tail';
        check('a place\'s name (cleanPlaceName): one line, trimmed, runs of spaces one, a control character or a line break a space, cut at 60 whole characters (a character past the basic plane is one, never half), and anything that is no text ""',
            PC.cleanPlaceName('  The   Rusty\nAnchor\u0007 ') === 'The Rusty Anchor' && PC.cleanPlaceName(long) === 'A'.repeat(59) + '\u{1F3F0}' && Array.from(PC.cleanPlaceName('x'.repeat(200))).length === 60
            && PC.cleanPlaceName(7) === '' && PC.cleanPlaceName(null) === '' && PC.cleanPlaceName({ toString: () => 'x' }) === '' && PC.cleanPlaceName('a\u2028b') === 'a b' && PC.NAME_MAX === 60,
            J([PC.cleanPlaceName('  The   Rusty\nAnchor\u0007 '), PC.cleanPlaceName(long)]));
        check('the Place tick as kept (cleanPlace): true or false, and nothing for anything else', PC.cleanPlace(true) === true && PC.cleanPlace(false) === false && [1, 'yes', 0, null, {}].every(v => PC.cleanPlace(v) === undefined));
        const map = { type: 'map', id: 'm1', rooms: [{ id: 'r1', name: 'The Market' }, { id: 'r2', name: '  ', targetMapId: 'm2' }, { id: 'r3', name: 'Sewer Gate', targetMapId: 'm3' }], whiteboard: [] };
        const titles = { m2: 'Undercity', m3: 'The Deep', m9: 'Far Shore' }, cx = { titleOf: id => titles[id] || '' };
        const P = (k) => Object.assign({ id: 'p' + Math.random().toString(36).slice(2, 7), type: 'rect', x: 100, y: 200, w: 40, h: 40, name: 'Crate' }, k);
        const of = w => PC.placeOf(w, map, cx);
        const ticked = of(P({ place: true })), named = of(P({ place: true, placeName: ' Old Well ' })), room = of(P({ nodeId: 'r1' })), portal = of(P({ targetMapId: 'm9' })), viaRoom = of(P({ nodeId: 'r2' })), roomGate = of(P({ nodeId: 'r3' }));
        check('a place (placeOf): a piece ticked Place is one, named by its own name where the GM typed none, else by its Place name; a piece that names a room is one with no tick, named by the room; a teleporter is one, named by the map it leads to (its own Portal to Map, or its room\'s where the room has no name), and the room\'s name comes first where it has one',
            ticked && ticked.name === 'Crate' && ticked.x === 120 && ticked.y === 220 && named.name === 'Old Well' && room.name === 'The Market' && room.room === 'r1' && room.to === ''
            && portal.name === 'Far Shore' && portal.to === 'm9' && viaRoom.name === 'Undercity' && viaRoom.to === 'm2' && roomGate.name === 'Sewer Gate' && roomGate.to === 'm3' && of(P({ place: true, name: '' })).name === PC.DEFAULT_NAME,
            J([ticked, named, room, portal, viaRoom, roomGate]));
        check('a piece that names a room or leads away and that the GM unticked (place: false) is no place, and nor is any piece with no tick and no room or way',
            of(P({ nodeId: 'r1', place: false })) === null && of(P({ targetMapId: 'm9', place: false })) === null && of(P({})) === null && of(P({ place: 'yes' })) === null && of(P({ nodeId: 'gone' })) === null);
        const wall = P({ place: true, blocksSight: true, sightType: 'wall' }), door = P({ place: true, blocksSight: true, sightType: 'door' }), secret = P({ place: true, blocksSight: true, sightType: 'door', secret: true });
        const never = [P({ place: true, isChar: true }), P({ place: true, waiting: true }), P({ place: true, gmNoteFor: 't1' }), P({ place: true, hidden: true }), P({ place: true, type: 'light' }), P({ place: true, type: 'maplegend' }), wall, secret, P({ place: true, barrier: true }), P({ nodeId: 'r1', hidden: true }), P({ targetMapId: 'm9', isChar: true })];
        check('never a place: a token, a waiting token, a GM note card, a hidden piece, a light source\'s marker, a legend, a plain wall, a see-through barrier, a secret door; a door, a wall that leads somewhere and a picture or a text box that blocks sight may be one (placeKindOk; a hidden piece is offered the tick by its own word)',
            never.every(w => of(w) === null) && of(door) !== null && of(P({ place: true, blocksSight: true, targetMapId: 'm9' })) !== null && of(P({ place: true, type: 'image', blocksSight: true })) !== null && of(P({ place: true, type: 'text', blocksSight: true })) !== null
            && PC.placeKindOk(P({ hidden: true }), true) === true && PC.placeKindOk(P({ hidden: true })) === false && PC.plainWall(wall) && !PC.plainWall(door) && PC.placeKindOk(null) === false && PC.placeKindOk({ type: 'rect' }) === false,
            J(never.map(of)));
        const pts = [[300, 10], [10, 30], [150, 18], [400, 300], [20, 290], [50, 160]].map((p, i) => ({ id: 'q' + i, x: p[0], y: p[1], name: 'n' + i }));
        check('reading order: top to bottom, and left to right along a row, a middle within 25 board pixels of its row\'s first counting as that row (readingOrder); the list handed in is left as it was',
            J(PC.readingOrder(pts).map(p => p.id)) === J(['q1', 'q2', 'q0', 'q5', 'q4', 'q3']) && pts[0].id === 'q0' && PC.ROW_BAND === 25 && J(PC.readingOrder(null)) === '[]');
        const m2 = { type: 'map', id: 'm2', rooms: map.rooms, whiteboard: [P({ id: 'a', place: true, x: 500, y: 10 }), P({ id: 'b', nodeId: 'r1', x: 0, y: 10 }), P({ id: 'c', place: true, hidden: true }), P({ id: 'd', x: 50, y: 400, targetMapId: 'm3' }), 'junk', null] };
        const lines = PC.placeLines(PC.placesOn(m2, cx));
        check('a map\'s places (placesOn): every place of it in reading order, numbered from 1 (placeLines), a teleporter with the map it leads to; nothing for what is no map; at most 200',
            J(lines) === J([{ n: 1, id: 'b', name: 'The Market', to: '' }, { n: 2, id: 'a', name: 'Crate', to: '' }, { n: 3, id: 'd', name: 'The Deep', to: 'm3' }]) && J(PC.placesOn(null, cx)) === '[]' && J(PC.placesOn({ whiteboard: 'x' }, cx)) === '[]'
            && PC.placesOn({ type: 'map', rooms: [], whiteboard: Array.from({ length: 260 }, (x, i) => ({ id: 'z' + i, type: 'rect', place: true, x: i, y: 0, w: 1, h: 1 })) }, cx).length === PC.LIST_MAX && PC.LIST_MAX === 200, J(lines));
        const l3 = PC.placesOn(m2, cx);
        check('a viewer\'s list fails closed (placesSeenOnly): a place is kept where its judge says true and nowhere else, and a judge of another length, or none, keeps nothing',
            J(PC.placesSeenOnly(l3, [true, false, true]).map(p => p.id)) === J(['b', 'd']) && PC.placesSeenOnly(l3, [true, true]).length === 0 && PC.placesSeenOnly(l3, null).length === 0 && PC.placesSeenOnly(l3, [1, 'yes', true]).length === 1);
        check('a signature moves with what a list draws, its mark and what is handed beside it (placesSig)',
            PC.placesSig(lines) === PC.placesSig(JSON.parse(J(lines))) && PC.placesSig(lines) !== PC.placesSig(lines.map(l => Object.assign({}, l, { name: l.name + '!' }))) && PC.placesSig(lines, 'a') !== PC.placesSig(lines, 'b') && PC.placesSig(lines) !== PC.placesSig(lines.map((l, i) => i ? l : Object.assign({}, l, { mark: true }))));
        check('placecore reads nothing but its arguments and fogcore: no window, document, storage, clock or random', !/\b(window|document|localStorage|Date|Math\.random)\b/.test(read('scripts/placecore.js').split('// Published for the scripts')[0].replace(/\/\/[^\n]*/g, '')));
    }

    /* ---- fog.js placeSeen, the slice run with the real fogcore ---- */
    {
        const fogS = read('scripts/fog.js'), seenS = slice(fogS, 'placescheck:seen');
        const grid = FC.gridFor('square', null, null), key = (x, y) => FC.cellKey(FC.cellOf(x, y, grid), grid);
        const mk = o => new Function('core', 'gridForMap', 'fogFeatureOn', 'mapFog', 'activeCamp', 'fogMask', 'isClientView', 'isStreamView', 'partyTiers', 'revealedTiers', 'myId', 'PARTY', 'rememberOn', '_mem', 'inMask',
            seenS + '\nreturn placeSeen;')(() => FC, () => o.grid === undefined ? grid : o.grid, () => o.fog !== false, () => ({ on: o.on !== false, epoch: 0 }), () => ({}), () => o.mask || { mode: 'all' }, () => o.who === 'player', () => o.who === 'stream',
            () => o.party, (m, c, who) => { o.asked = who; return o.tiers === undefined ? { keys: {} } : o.tiers; }, () => 'pl1', '*players', () => o.remember !== false, o.mem || {}, (mask, k) => mask.mode === 'all' ? true : mask.mode === 'none' ? false : !!mask.keys[k]);
        const map = { type: 'map', id: 'm1' }, pts = [{ x: 25, y: 25 }, { x: 125, y: 25 }, { x: 225, y: 25 }, { x: NaN, y: 1 }];
        const pl = { who: 'player', tiers: { keys: { [key(25, 25)]: 2 } }, mem: { m1: { key: 'square:50|0', cells: { [key(125, 25)]: { c: 2, r: 0 } } } } };
        const got = mk(pl)(map, pts);
        const forgot = mk(Object.assign({}, pl, { remember: false }))(map, pts), stale = mk(Object.assign({}, pl, { mem: { m1: { key: 'hex:30|0', cells: { [key(125, 25)]: 1 } } } }))(map, pts);
        check('a player\'s app (placeSeen, fog.js\'s slice): a pin is seen where their own tokens see its cell now (revealedTiers for their own id) or their screen remembers it, and never where neither does; with remembering off, or a memory kept under another grid, only what they see now; a point that is no number is not seen',
            J(got) === J([true, true, false, false]) && pl.asked === 'pl1' && J(forgot) === J([true, false, false, false]) && J(stale) === J([true, false, false, false]), J([got, forgot, stale]));
        const gm = { who: 'gm', tiers: { keys: { [key(225, 25)]: 1 } } }, gmGot = mk(gm)(map, pts);
        const st = { who: 'stream', party: { keys: { [key(125, 25)]: 2 } } }, stGot = mk(st)(map, pts);
        check('the GM\'s screen reads what the players\' tokens see together (PARTY), with no memory; the stream window the party\'s cells the host sent it (partyTiers)',
            J(gmGot) === J([false, false, true, false]) && gm.asked === '*players' && J(stGot) === J([false, true, false, false]), J([gmGot, stGot]));
        const allT = [mk({ who: 'player', fog: false }), mk({ who: 'player', on: false }), mk({ who: 'player', grid: null }), mk({ who: 'player', mask: { mode: 'none' } }), mk({ who: 'player', tiers: null })].map(f => f(map, pts));
        const outside = mk({ who: 'player', mask: { mode: 'set', keys: { [key(25, 25)]: 1 } }, tiers: { keys: {} } })(map, pts);
        check('every pin is seen where the fog does not apply: Fog of war off, this map\'s fog off, no grid, no play area with the rest left clear, the map on Reveal all; and a pin outside a play area is seen (that ground is never fogged)',
            allT.every(r => J(r) === J([true, true, true, true])) && J(outside) === J([false, true, true, false]) && J(mk({ who: 'player' })(null, pts)) === J([true, true, true, true]), J([allT, outside]));
        check('fog.js publishes it as wpFog.placeSeen, and it reads nothing but the fog\'s own readers', fogS.includes('    placeSeen: placeSeen,   // 1.6.3') && !/\bsend\(|wpNet|localStorage/.test(seenS));
    }

    /* ---- places.js: the lines a screen draws, the box and a legend, on a page of plain objects ---- */
    {
        const plS = read('scripts/places.js'), whoS = slice(plS, 'placescheck:who'), linesS = slice(plS, 'placescheck:lines'), drawS = slice(plS, 'placescheck:draw');
        const elS = (plS.match(/\nfunction el\(doc, tag, cls, text\) \{[^\n]*\}\n/) || [''])[0];
        const W = new Function(whoS + '\nreturn whoOf;')();
        check('who a screen draws for: the stream window, a player\'s app (its link up, or between attempts), else the GM',
            W({ active: true, role: 'client' }, false) === 'player' && W({ foreign: true }, false) === 'player' && W({ active: true, role: 'host' }, false) === 'gm' && W(null, false) === 'gm' && W({ active: true, role: 'client' }, true) === 'stream');
        const L = new Function(linesS + '\nreturn linesFor;')();
        const cx = { titleOf: id => ({ m3: 'The <b>Deep</b>' })[id] || '' };
        const map = { type: 'map', id: 'm1', rooms: [], whiteboard: [{ id: 'a', type: 'rect', place: true, name: 'Inn', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', type: 'rect', place: true, name: 'Tower', x: 100, y: 0, w: 10, h: 10 }, { id: 'c', type: 'rect', targetMapId: 'm3', x: 200, y: 0, w: 10, h: 10 }] };
        const seen = [true, false, true], seenOf = () => seen.slice(), store = Object.create(null);
        const plL = L(PC, map, 'player', seenOf, store, cx), stL = L(PC, map, 'stream', seenOf, store, cx), gmL = L(PC, map, 'gm', seenOf, store, cx);
        const failClosed = L(PC, map, 'player', () => [true], store, cx), noJudge = L(PC, map, 'player', null, store, cx);
        check('a player\'s list and the stream window\'s hold only the places their viewer has seen; the GM\'s holds every place and marks those no player has been seen to see, remembering the ones found seen; a judge of the wrong length shows a player nothing',
            J(plL.map(l => l.id)) === J(['a', 'c']) && J(plL.map(l => l.n)) === J([1, 2]) && J(stL) === J(plL) && J(gmL.map(l => [l.id, !!l.mark])) === J([['a', false], ['b', true], ['c', false]]) && store['m1|a'] === 1 && store['m1|b'] === undefined
            && failClosed.length === 0 && noJudge.length === 3, J([plL, gmL, failClosed]));
        seen[1] = true; L(PC, map, 'gm', seenOf, store, cx); seen[1] = false;
        check('the GM\'s mark goes once a player has been seen to see the place, and stays gone when their tokens move away', L(PC, map, 'gm', seenOf, store, cx).every(l => !l.mark));
        const D = new Function('el', drawS + '\nreturn { listInto, cardInto, legendInto, inkFor };')(new Function(elS + '\nreturn el;')());
        const doc = mkDoc(), body = doc.createElement('div');
        const hostile = [{ n: 1, id: 'x"><img src=x onerror=alert(1)>', name: '<script>alert(1)</script>', to: '' }, { n: 2, id: 'g', name: 'Gate & <i>Way</i>', to: 'm3', mark: true }];
        let threw = null, nList = 0;
        try { nList = D.listInto(body, hostile, 'g', l => ({ title: cx.titleOf(l.to), closed: true, gm: false, to: l.to }), 'player', doc); } catch (e) { threw = String(e); }
        const btns = byClass(body, 'places-line'), names = byClass(body, 'places-name').map(e => e.textContent), card = byClass(body, 'places-card')[0];
        check('the box\'s list (listInto): a line a place, its number, its name and a teleporter\'s arrow, each a text node of an element made by name, a hostile name or id never markup; the open card under its line says where it leads and that it is closed for now, with a slot for the picture named by the map\'s id',
            threw === null && nList === 2 && btns.length === 2 && J(names) === J(['<script>alert(1)</script>', 'Gate & <i>Way</i>']) && btns[0].dataset.id === hostile[0].id && btns[1].className.includes('unseen') && btns[1].className.includes('on')
            && card && card.textContent === 'Leads to The <b>Deep</b>Closed for now.' && byClass(card, 'places-card-pic')[0].dataset.map === 'm3' && byClass(body, 'places-to').length === 1 && byClass(body, 'places-unseen').length === 1, J([threw, names, card && card.textContent]));
        const b2 = doc.createElement('div'), b3 = doc.createElement('div');
        D.listInto(b2, [], '', null, 'gm', doc); D.listInto(b3, [], '', null, 'player', doc);
        const gmCard = D.cardInto(doc, { title: '', closed: true, gm: true, to: 'm9' });
        check('an empty list says so in fixed words, for the GM how to make a place and for a player that they have seen none here; the GM\'s card says closed to players, and a map with no title is Another map',
            b2.textContent.indexOf('Tick Place in a piece') >= 0 && b3.textContent === 'No places here that you have seen yet.' && gmCard.textContent === 'Leads to Another mapClosed to players for now.');
        const box = doc.createElement('div'), lg = D.legendInto(box, 'The <u>Harbor</u>', hostile, D.inkFor('#efe4c8'), doc);
        const lgB = byClass(box, 'lg-line');
        check('a legend (legendInto): its title and its numbered lines, each a button that names its place by data alone, every word a text node; a light plate gets dark words and a dark one light words, and a color that is no hex reads as light',
            lg === 2 && byClass(box, 'lg-title')[0].textContent === 'The <u>Harbor</u>' && lgB.length === 2 && lgB.map(b => b.textContent).join('|') === '1<script>alert(1)</script>|2Gate & <i>Way</i>\u2192' && lgB[1].className.includes('unseen')
            && box.style.color === '#2b2418' && D.inkFor('#101018') === '#f1ead8' && D.inkFor('#fff') === '#2b2418' && D.inkFor('red; x') === '#2b2418' && D.inkFor(null) === '#2b2418');
        const box2 = doc.createElement('div'); D.legendInto(box2, 'Map', [], '#000', doc);
        check('a legend with nothing its viewer has seen says No places yet', byClass(box2, 'lg-empty')[0].textContent === 'No places yet.' && byClass(box2, 'lg-line').length === 0);
        check('places.js writes no markup but the Properties field, which inspector.js lays as html and which escapes every word it does not write itself, and reads no storage',
            count(plS, 'innerHTML') === 0 && !/localStorage|eval\(|new Function/.test(plS) && /value="' \+ esc\(nm\) \+ '" placeholder="' \+ esc\(def\) \+ '"/.test(plS) && /function esc\(s\) \{ return String/.test(plS));
        check('a press: finds the place on this screen (its view to the pin, lit by the board\'s own find light for a moment) and opens a teleporter\'s card in the box; a line this screen no longer lists does nothing; and every step logs as places v1',
            /function press\(id, fromLegend\) \{\n    var map = getActiveMap\(\), lines = map \? linesNow\(map\) : \[\], l = lines\.filter\(function\(x\) \{ return x\.id === id; \}\)\[0\]; if \(!l\) return false;\n    find\(id\);/.test(plS)
            && plS.includes("e.classList.add('wb-find-lit')") && plS.includes("window.wpStepLog('places v1', s, f || {})") && plS.includes('/^data:image\\/png;base64,[A-Za-z0-9+\\/]+={0,2}$/'));
    }

    /* ---- the wiring ---- */
    {
        const ix = read('index.html'), css = read('style.css'), wb = read('scripts/whiteboard.js'), ins = read('scripts/inspector.js'), main = read('scripts/main.js'), il = read('scripts/ilayers.js');
        const fl = read('scripts/floats.js'), sh = read('scripts/sheets.js'), esc = read('scripts/esckey.js'), net = read('scripts/net.js'), cu = read('scripts/cleanup.js'), fc = read('scripts/fogcore.js');
        check('the page: placecore.js and places.js right after boxes.js; the top row\'s map pin after the pills, put away until the play map is on screen; Add\'s Place pin and Legend (Add is the GM\'s); the Places here box with its close, each id once',
            ix.includes('<script type="module" src="scripts/boxes.js"></script>\n<script type="module" src="scripts/placecore.js"></script>\n<script type="module" src="scripts/places.js"></script>')
            && ['placesBtn', 'placesPanel', 'placesHead', 'placesTitle', 'placesClose', 'placesBody', 'addPlacePinBtn', 'addLegendBtn'].every(id => count(ix, 'id="' + id + '"') === 1)
            && /id="docImportFile"[^\n]*\n      <button class="tool ghost icon" id="placesBtn" style="display:none;"[^>]*>[^\n]*<\/button>\n      <div class="header-sep"><\/div>/.test(ix) && /class="wb-tool-btn menu-row" id="addPlacePinBtn"/.test(ix) && /class="wb-tool-btn menu-row" id="addLegendBtn"/.test(ix)
            && ix.includes('<div id="placesPanel" style="display:none;" role="dialog" aria-label="Places here">'));
        check('a floating box by the rules: in floats.js FLOAT_IDS, sheets.js Z_BOXES and esckey.js ESC_LAST, closed by its own close on Escape, and put away in the stream window',
            /var FLOAT_IDS = \[[^\]]*'placesPanel'/.test(fl) && /var Z_BOXES = \[[^\]]*'placesPanel'/.test(sh) && /var ESC_LAST = \[[^\]]*'placesPanel'/.test(esc) && esc.includes("placesPanel: function(el) { if (!escPress(doc, 'placesClose')) el.style.display = 'none'; },")
            && css.includes('body.stream-mode #placesPanel { display: none !important; }'));
        check('the board draws a legend and a place pin through places.js, a placed pin asks it to open Properties, the redraw syncs it with and without a map, and Properties asks it for the Place tick and wires it',
            wb.includes("} else if (item.type === 'maplegend') {") && wb.includes("window.wpPlaces.legendDraw(el, item, activeMap);") && wb.includes("window.wpPlaces.pinDraw(el, item, activeMap);") && wb.includes("window.wpPlaces.placed(type, state.selWbId);")
            && count(main, 'if (window.wpPlaces) window.wpPlaces.sync();') === 2 && ins.includes("window.wpPlaces.fieldHtml(w) : '')+") && ins.includes('window.wpPlaces.fieldWire(w);'));
        check('Show on my map has a row for place pins and legends, among the kinds under Show more', il.includes("{ k: 'place', name: 'Place pins and legends', more: true }") && il.includes("else if (w.type === 'mappin' || w.type === 'maplegend') out.push('place');"));
        check('the wire: a place\'s tick and name go with a shown piece and only as their cleaners keep them, never on a secret door or a plain wall; a player\'s app cleans them again; a file\'s are cleaned on import; the secret door\'s copy drops them (SECRET_DROP)',
            net.includes("if (w.place !== undefined || w.placeName !== undefined) {") && net.includes("delete w.portalLock; delete w.place; delete w.placeName;") && net.includes("delete w.darkStep; delete w.cloud; if (w.place !== undefined && w.place !== true && w.place !== false) delete w.place; if (w.placeName !== undefined) { var PCh = window.wpPlaceCore")
            && cu.includes('var PLd = deps && deps.PLACE') && fc.includes('portalLock: 1, place: 1, placeName: 1 });') && main.includes('PLACE: window.wpPlaceCore'));
        const help = (() => { const a = ix.indexOf('<li><b>Places:</b>'), z = ix.indexOf('</ul>', a); return a > 0 ? ix.slice(a, z) : ''; })();
        check('Help says it in the play map\'s part, in plain words: the Place tick and name, Places here and a press, what a player sees, Place pin and Legend, and unticking',
            help.includes('Tick <b>Place</b> in a piece&rsquo;s Properties') && help.includes('<b>Places here</b>') && help.includes('A player sees a place once their token has seen its spot') && help.includes('<b>Place pin</b>') && help.includes('<b>Legend</b>') && help.includes('A hidden piece is not listed until you show it.')
            && ix.indexOf('<li><b>Places:</b>') > ix.indexOf('<li><b>Containers:</b>') && ix.indexOf('<li><b>Places:</b>') > ix.indexOf('data-pane="whiteboard"'));
        const notes = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(t => t.replace(/\r\n/g, '\n'));
        check('both release notes say it under 1.6.3, alike', notes.every(t => t.indexOf('Places on the map\n- A map can list its places now') > t.indexOf('WAYPOINT 1.6.3') && t.indexOf('Places on the map') < t.indexOf('WAYPOINT 1.6.2')) && notes[0] === notes[0] && notes[0].slice(0, notes[0].indexOf('WAYPOINT 1.6.2')) === notes[1].slice(0, notes[1].indexOf('WAYPOINT 1.6.2')));
        const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'checks.yml'), 'utf8');
        check('CI runs this suite under a plain name', /- name: placescheck, a map's places[^\n:]*\n\s+if: \$\{\{ !cancelled\(\) \}\}\n\s+run: node tools\/placescheck\.js/.test(ci.replace(/\r\n/g, '\n')));
    }
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      placescheck threw: ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
