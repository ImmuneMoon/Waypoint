/* netdragcheck.js: an open drag judged where it began, and a player's copies caught up in place when a move lands, the tests that came
   out of netfogcheck.js (fold M4) and netcheck.js (folds M6 and M8) with their area (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test
   split", step 6, 2026-11-19), each block word for word with the comment that heads it. Fold M4 is the one-module world over the real
   fog.js (the pos gate, the patch path, the relay, the sends, kick, the senses' resend and the catch-up), with every later fold that runs
   in it; fold M6 the GM's open board gesture, published; fold M8 a player's app asking its host for one map whole and a gesture's moves
   naming the map. A player's page is tools/checkkit.js netFogClient's mkFogClient, as in netfogcheck.js. The code lives mostly in netfog.js,
   a part of net.js, read by its own name; the slices of other areas read the joined net.js through srcjoin.
   Run: node tools/netdragcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc } = kit.netSlices('netdragcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { ownKeySrc, siSrc, fightIn } = kit.netHarness('netdragcheck');
// a player's page as the fogDiff branch and applyFogDiff see it (fold M3; tools/checkkit.js netFogClient)
const { mkFogClient } = kit.netFogClient('netdragcheck');
const j = JSON.stringify;
// fold M4: an open drag is judged where it began. The real pos gate, patch path, relay, sends, kick, senses and the fogmove slice are compiled as
// ONE module over the real fog.js, so they share the host's open drags; timers are fakes, the clock is the world's, every send packs for the wire
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx4 = await import(url('dicecore.js'));
    const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const fogSrc = fogT.slice(fogT.indexOf('function core() {'), fogT.indexOf('/* ---------- the overlay'));
    const realAllow = clock => new Function('window', 'Date', lineOf('var _lim = Object.create(null);') + '\n' + lineOf('function allow(') + '\nreturn allow;')({ wpDiceCore: Dx4 }, { now: clock });   // fold M9: the host's real limiter, on the world's clock
    const buildFog4 = () => new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { fogDropIds: fogDropIds, fogLitFor: fogLitFor, canSeePoint: canSeePoint, invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor, tokenSightCells: tokenSightCells, viewersFor: viewersFor, moveBlocked: moveBlocked, moveCells: moveCells, fogMarksFor: fogMarksFor, fogOffFor: fogOffFor };');
    const whole4 = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const bw = (n, file) => between('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]', n, typeof file === 'string' ? file : undefined);   // file: a part of net.js, read by its own name
    const modSrc = ['var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {}, bannedIds = {};', siSrc(), bw('drawshow', 'netfog.js'), bw('foglit', 'netfog.js'), fnSrc('function anyFog(', '\n}\n', 'anyFog', 'netfog.js') + '\n}\n', lineOf('function mapFogged('),
        fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\n', fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n', whole4('net.sendItem = function('), whole4('net.broadcastItemFiltered = function('), whole4('net.itemGone = function('), whole4('net.kickPlayer = function('), bw('sensesmoved'), bw('combats'), lineOf('var _saveSoon = null;'), lineOf('function saveRemoteSoon()'), bw('bpos'),
        src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')), ownKeySrc, bw('pos'), bw('patch', 'netfog.js'), bw('fogdiffapply', 'netfog.js'), bw('fogmove', 'netfog.js'), ordersSrc,
        'return { pos: handlePos, patch: applyClientItemFiltered, landed: fogLanded, sweep: fogDragSweep, open: openDrag, opens: openDrags, end: dragEnd, live: fogOwnLive, clean: sanitizeItem, combats: broadcastCombats, targets: broadcastTargets, drags: function() { return _dragFrom; }, stale: FOG_DRAG_STALE_MS,',
        'held: function() { return _fogHeld; }, seedSnap: fogSeedSnapshot, forgetAll: fogForgetAll, hash: quickHash, copy: fogCopyFor, hid: function() { return _hidPend; },',
        'acks: function() { return _acks; }, ackTook: ackTook, ackOf: ackOf, withAck: withAck, ackSend: ackSend, forgetConn: fogForgetConn,',
        'arm: fogArm, fire: fogMoveFire, catchUp: fogCatchUp, key: fogKey, windowMs: fogWindowMs, pend: function() { return _fogPend; }, cost: function() { return _fogCost; }, sensesSig: function() { return _sensesSig; }, sensesForget: sensesForget,',
        'showKnows: showKnows, showGoneHas: showGoneHas, showAskIn: function(msg, conn) {', bw('showask'), '},',
        'item: function(msg, conn) {', bw('itempatch'), '}, threatsIn: function(msg, conn) {', bw('threats'), '} };'].join('\n');
    const NAMES4 = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'peerProfileId', 'lim', 'pushChat', 'state', 'itemDelta', 'broadcast', '_lastSent', 'setTimeout', 'clearTimeout', 'save', 'toast', 'logEvent', 'renderRoster', 'dropWaitingFor', 'allow', 'render', 'broadcastRoster', 'checkRoomHandouts', 'applyPosToDom', 'playerStroke', 'bellOut', 'renderNotepad', 'fogNow'];
    const build4 = new Function(...NAMES4, modSrc);
    const J = v => JSON.stringify(v);
    const T = (id, owner, charId, c, r, more) => Object.assign({ id, type: 'image', isChar: true, charName: id, x: c * 50, y: r * 50, w: 50, h: 50, rot: 0, front: 0 }, owner ? { ownerId: owner } : {}, charId ? { charId } : {}, more || {});
    const M = (id, wb, fog) => ({ id, type: 'map', meta: { title: id, gridType: 'square', cellValue: 5, cellUnit: 'ft' }, rooms: [], links: [], fog: Object.assign({ on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } }, fog || {}), whiteboard: wb });
    const sysM = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }], combat: { postures: ['standing', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-face-up'].map(id => ({ id, name: id })) } }, { F: Fx, gmView: true });   // 1.6.0: postures of its own, none being a default
    // mA: a dark 5 ft map; Ana's tA at (2,2) sees 12 cells, the orc at (15,2) is 13 away (seen from (5,2)); Bo's tB at (2,4) sees tA, never the orc.
    // mB: tA2 and orc2 the same way. mC: a facing cone of 90 degrees with tC and a bat 4 cells off. mO: Bo's other map
    const quickHash4 = new Function(fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\nreturn quickHash;')();
    const realDelta = ls => new Function('_lastSent', 'quickHash', lineOf('function uniqueIds(', 'netfog.js') + '\n' + fnSrc('function itemDelta(itemId, clean) {', '\nfunction applyItemDelta(', 'itemDelta', 'netfog.js') + '\nreturn itemDelta;')(ls, quickHash4);   // hidden pieces: a world sending an unfogged map's deltas for real (o.realDelta)
    const mk4 = o => {
        o = o || {};
        const ev = [], timers = [], feats = { fog: true, lighting: true, sheets: true, turning: true };
        const camp = { id: 'k', system: o.system || sysM, fog: { fields: { sight: 'f_sight', sightUnit: 'ft' }, defaults: { sight: 30 } }, turnRules: o.rules || {},
            items: { mA: M('mA', [T('tA', 'u_a', 'c_a', 2, 2, o.tA || {}), T('tB', 'u_b', 'c_b', 2, 4), T('orc', '', 'c_n', 15, 2)]), mB: M('mB', [T('tA2', 'u_a', 'c_a', 2, 2), T('orc2', '', 'c_n', 15, 2)]),
                mO: M('mO', [T('tB2', 'u_b', 'c_b', 2, 2)]), mC: M('mC', [T('tC', 'u_a', 'c_a', 6, 6, o.tC || {}), T('bat', '', 'c_n', 10, 6)], { vision: { mode: 'arc', arc: 90 } }) },
            chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sight: 60 } }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_sight: 60 } }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: { f_sight: 60 } } } };
        // fold M7: each connection also keeps a real player page (mkFogClient) that every copy lands on, whole or caught up in place
        const fold = (c, m) => { if (!c.page) c.page = mkFogClient(FCx, { myId: (W.net && W.net.roster[c.peer] && W.net.roster[c.peer].id) || 'u_none', items: {}, active: null });
            if (m.type === 'item') c.page.camp().items[m.itemId] = JSON.parse(J(m.item)); else if (m.type === 'fogDiff') c.page.recv(m, 'h'); else if (m.type === 'itemGone') delete c.page.camp().items[m.itemId]; };
        const mkConn = (peer, open) => ({ peer, open: open !== false, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(J(m))); fold(this, JSON.parse(J(m))); } });
        const W = { ev, camp, timers, now: 0, saves: 0, toasts: [], asked: [] };
        W.fire = ms => { const due = W.timers.filter(t => t.fn && t.ms === ms); due.forEach(t => { const f = t.fn; t.fn = null; f(); }); return due.length; };
        W.view = (c, mapId) => { const it = c.page && c.page.camp().items[mapId || 'mA']; return it ? { ids: it.whiteboard.map(w => w && w.id), fogLit: FCx.cleanFogLit(it.fogLit) || null, cap: it.lightsCapped === true } : null; };
        W.asks = c => (c.page ? c.page.rec.asked.slice() : []);
        W.a1 = mkConn('pA1'); W.a2 = mkConn('pA2'); W.b1 = mkConn('pB'); W.w1 = mkConn('pW');
        W.net = { active: true, role: 'host', paused: false, applyingRemote: false, myId: 'u_gm', conns: [W.a1, W.a2, W.b1, W.w1], roster: { pA1: { id: 'u_a', name: 'Pat' }, pA2: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } }, combats: {}, targets: {}, tokenDropped: w => ev.push('dropped:' + w.id) };
        const state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } }; W.state = state;   // R2 security: a case adds another campaign of the GM's beside the hosted one
        const win = { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpDiceCore: null, wpVtt: { on: k => feats[k] !== false, campaignOn: k => feats[k] !== false, mode: () => 'host' }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } };
        W.fog = buildFog4()(win, { getElementById: () => null }, () => null, () => camp, state);
        win.wpFog = Object.assign({}, W.fog, { moveBlocked: (map, w, fx, fy, tx, ty) => { W.asked.push([fx, fy, tx, ty]); return !!(o.wall && o.wall(fx, fy, tx, ty)); } });
        if (o.fogLitFor) win.wpFog.fogLitFor = o.fogLitFor;
        W.winRef = win;   // fold M7: a case sets the GM's gesture on this page's own window   // a stand-in where a case needs lit cells on a copy without building the corner that gives them
        const setT = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearT = id => { const t = timers[id - 1]; if (t) t.fn = null; };
        const bc = (m, ex) => { packCheck(m); W.net.conns.forEach(c => { if (c !== ex && c.open && Object.prototype.hasOwnProperty.call(W.net.roster, c.peer)) c.send(m); }); };
        const lastSent = {};
        W.api = build4(W.net, () => Sx, win, peer => !!(o.paused && o.paused(peer)), () => camp, o.failed ? (e => { o.failed.push(e.message); }) : (e => { throw e; }), c => (W.net.roster[c.peer] ? W.net.roster[c.peer].id : null), { allow: () => true }, () => {}, state, o.realDelta ? realDelta(lastSent) : () => null, bc, lastSent, setT, clearT,
            () => { W.saves++; }, t => W.toasts.push(t), () => {}, () => {}, () => {}, o.realAllow ? realAllow(() => W.now) : () => true, () => {}, () => {}, () => {}, m => ev.push('dom:' + m.wbId), () => null, () => {}, () => {}, () => W.now);
        W.move = (conn, wbId, x, y, fin, itemId, more) => W.api.pos(Object.assign({ type: 'pos', campId: 'k', itemId: itemId || 'mA', wbId, x, y, rot: 0, front: 0, final: fin }, more || {}), conn);
        W.tok = (id, mapId) => camp.items[mapId || 'mA'].whiteboard.find(w => w.id === id);
        W.clearSent = () => W.net.conns.forEach(c => { c.sent.length = 0; });
        W.last = (c, mapId) => { const m = c.sent.filter(x => x.type === 'item' && x.itemId === (mapId || 'mA')).pop(); return m ? m.item : null; };
        W.ids = (c, mapId) => { const it = W.last(c, mapId); return it ? it.whiteboard.map(w => w.id) : null; };
        W.at = (c, id, mapId) => { const it = W.last(c, mapId), t = it && it.whiteboard.find(w => w.id === id); return t ? [t.x, t.y, t.rot || 0, t.front || 0] : null; };
        W.msg = (c, type) => c.sent.filter(x => x.type === type).pop();
        W.poses = c => c.sent.filter(x => x.type === 'pos');
        W.entry = (mapId, id) => W.api.drags()[mapId + '|' + id];
        W.place = id => { const t = W.tok(id); return [t.x, t.y, t.rot || 0, t.front || 0]; };
        return W;
    };

    // (1) judged at the start: a whole copy asked for, a GM save, a copy sent to the table, the turn order and the pointers; Ana's own token alone
    // at the drag's live place, on her own copies; the host's map exactly as the drag left it; the drop, and the next copy holds the orc
    const W1 = mk4(), seen0 = !(W1.fog.fogDropIds('u_a', W1.camp, W1.camp.items.mA) || {}).orc;
    W1.move(W1.a1, 'tA', 250, 100, false);
    const seenMid = !(W1.fog.fogDropIds('u_a', W1.camp, W1.camp.items.mA) || {}).orc, e1 = W1.entry('mA', 'tA');
    W1.clearSent(); W1.net.sendItem('k', 'mA', W1.a1); const need1 = { ids: W1.ids(W1.a1), tA: W1.at(W1.a1, 'tA'), others: W1.a2.sent.length + W1.b1.sent.length };
    W1.clearSent(); W1.net.sendItem('k', 'mA'); const gm1 = { a1: W1.ids(W1.a1), a2: W1.ids(W1.a2), b: W1.ids(W1.b1), aT: W1.at(W1.a1, 'tA'), a2T: W1.at(W1.a2, 'tA'), bT: W1.at(W1.b1, 'tA'), w: W1.w1.sent.length };
    W1.clearSent(); W1.net.broadcastItemFiltered('k', 'mA'); const bif1 = { a1: W1.ids(W1.a1), b: W1.ids(W1.b1), aT: W1.at(W1.a1, 'tA'), bT: W1.at(W1.b1, 'tA') };
    W1.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA' }, { id: 'r_o', name: 'Orc', tokId: 'orc' }] } }; W1.net.targets = { u_gm: { id: 'orc', mapId: 'mA', name: 'GM' } };
    W1.net.roster.pA1.location = 'mA';   // fold 2: a player is sent the fights on the map they are on
    W1.clearSent(); W1.api.combats(); W1.api.targets(); const ro1 = { rows: fightIn(W1.msg(W1.a1, 'combats').combats, 'mA').rows.map(r => r.name + ':' + r.tokId), targ: Object.keys(W1.msg(W1.a1, 'targets').targets) };
    delete W1.net.roster.pA1.location;
    const host1 = W1.place('tA'), heldLeft1 = W1.api.opens().some(e => 'held' in e);
    W1.net.combats = {}; W1.net.targets = {};
    W1.move(W1.a1, 'tA', 250, 100, true); W1.clearSent(); W1.net.sendItem('k', 'mA'); const drop1 = { a1: W1.ids(W1.a1), entry: W1.entry('mA', 'tA') === undefined };
    check('fold M4: while a player\'s drag is open every copy of that fogged map is judged where the drag began (the real pos gate, sends and fog.js as one module): a whole copy she asks for, a GM save to the table and a copy sent to the table leave out the orc she would see only from mid-drag; the drag\'s token travels to her own copies at its live place and to everyone else\'s at its start; nothing goes to a peer not admitted',
        seen0 === false && seenMid === true && !!e1 && e1.x === 100 && e1.lx === 250 && J(need1.ids) === J(['tA', 'tB']) && J(need1.tA) === J([250, 100, 0, 0]) && need1.others === 0
        && J(gm1.a1) === J(['tA', 'tB']) && J(gm1.a2) === J(['tA', 'tB']) && J(gm1.b) === J(['tA', 'tB']) && J(gm1.aT) === J([250, 100, 0, 0]) && J(gm1.a2T) === J([250, 100, 0, 0]) && J(gm1.bT) === J([100, 100, 0, 0]) && gm1.w === 0
        && J(bif1.a1) === J(['tA', 'tB']) && J(bif1.b) === J(['tA', 'tB']) && J(bif1.aT) === J([250, 100, 0, 0]) && J(bif1.bT) === J([100, 100, 0, 0]),
        J([seen0, seenMid, e1, need1, gm1, bif1]));
    check('fold M4: the turn order and the pointers sent while the drag is open are judged at its start too (the orc\'s row reads Hidden, a pointer at it is dropped); the host\'s own map is left exactly as the drag has it, nothing held; after the drop lands there the next copy holds the orc and the drag is over',
        J(ro1.rows) === J(['Ana:tA', 'Hidden:null']) && J(ro1.targ) === J([]) && J(host1) === J([250, 100, 0, 0]) && heldLeft1 === false && J(drop1.a1) === J(['tA', 'tB', 'orc']) && drop1.entry,
        J([ro1, host1, drop1]));

    // (1b) map builder B1: a textured wall on the wire — each player's copy of the fogged map carries the piece with its texture and blocksSight; a hidden
    // textured piece's id and texture appear nowhere in anything sent; the patch gate takes neither key from a player
    const WT = mk4(); WT.camp.items.mA.whiteboard.push({ id: 'wallT', type: 'rect', x: 500, y: 500, w: 50, h: 50, z: 10, texture: 'bricks', blocksSight: true, sightType: 'wall', color: '#3f3b47', layer: 'back-mid', name: 'Wall' }, { id: 'hidT', type: 'hexagon', hidden: true, x: 600, y: 600, w: 60, h: 52, texture: 'grass', color: '#4b6b36', name: 'Secret grass' });
    // fold B7: four pieces of a world map on the same fogged map, each in one of the four land patterns, and a fifth whose save held another case of a name
    const LANDT = [{ id: 'landF', type: 'rect', x: 700, y: 500, w: 50, h: 50, z: 5, texture: 'forest', color: '#35532d', layer: 'back', name: 'Forest' }, { id: 'landM', type: 'hexagon', x: 760, y: 500, w: 60, h: 52, z: 5, texture: 'mountains', color: '#6d675f', layer: 'back', name: 'Mountains' },
        { id: 'landS', type: 'path', tip: 'fill', x: 700, y: 600, w: 100, h: 100, z: 5, pts: [[0, 0], [100, 0], [100, 100]], texture: 'sand', color: '#c9b27a', layer: 'back', name: 'Sand' }, { id: 'landW', type: 'circle', x: 820, y: 600, w: 50, h: 50, z: 5, texture: 'snow', color: '#e8eef2', layer: 'back', name: 'Snow' },
        { id: 'landX', type: 'rect', x: 880, y: 600, w: 50, h: 50, z: 5, texture: 'Snow', color: '#e8eef2', layer: 'back', name: 'Odd' }];
    WT.camp.items.mA.whiteboard.push(...LANDT.map(p => JSON.parse(JSON.stringify(p))));
    WT.clearSent(); WT.net.sendItem('k', 'mA');
    const landOf = wb => LANDT.map(p => { const w = Array.isArray(wb) ? wb.find(x => x.id === p.id) : null; return w ? [('texture' in w ? w.texture : 'none'), w.name, w.type] : null; });
    const landSent = [WT.a1, WT.a2, WT.b1].map(c => { const it = WT.last(c, 'mA'); return landOf(it && it.whiteboard); }), landPage = [WT.a1, WT.b1].map(c => landOf(c.page.camp().items.mA.whiteboard)), landHost = LANDT.map(p => { const w = WT.tok(p.id); return w ? w.texture : null; });
    // A player's app cleans what it is sent again. A page of this world stores a whole map as it came, so each land piece of each copy is handed to the
    // client's own one-liner here (cleanHostWbItem, sliced from net.js and run for real with the real fogcore)
    const lnT = k => { const i = src.indexOf(k); if (i < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, src.indexOf('\n', i)); };
    const cleanT = new Function('window', 'cleanWaitingItem', 'sanitizeRichText', 'safeColor', '"use strict";\n' + lnT('function cleanHostWbItem(w) {') + '\n' + lnT('function cleanHostLight(w) {') + '\nreturn cleanHostWbItem;')({ wpFogCore: FCx }, () => null, t => String(t), v => v);   // no land piece is a waiting token, a text box or a light: the three helpers are never asked
    const landApp = [WT.a1, WT.a2, WT.b1].map(c => { const it = WT.last(c, 'mA'), wb = it && Array.isArray(it.whiteboard) ? it.whiteboard : []; return landOf(LANDT.map(p => { const w = wb.find(x => x.id === p.id); return w ? cleanT(JSON.parse(J(w))) : null; }).filter(Boolean)); });
    const LANDWANT = [['forest', 'Forest', 'rect'], ['mountains', 'Mountains', 'hexagon'], ['sand', 'Sand', 'path'], ['snow', 'Snow', 'circle'], ['none', 'Odd', 'rect']];
    check('fold B7 on the wire (the mk4 host world): four pieces of a world map on a fogged map, in forest, mountains, sand and snow, reach each player\'s copy with their pattern, a box, a hexagon, a filled region and a circle alike (the real sends into real player pages). Each player\'s page holds them. A player\'s app, cleaning each piece of its copy again (cleanHostWbItem, run for real), keeps each pattern. A piece whose save held another case of a name reaches them with no pattern, while the host\'s own piece is left as it was',
        J(landSent) === J([LANDWANT, LANDWANT, LANDWANT]) && J(landPage) === J([LANDWANT, LANDWANT]) && J(landApp) === J([LANDWANT, LANDWANT, LANDWANT]) && J(landHost) === J(['forest', 'mountains', 'sand', 'snow', 'Snow']), J([landSent, landPage, landApp, landHost]));
    const wallOn = c => { const it = WT.last(c, 'mA'), w = it && it.whiteboard.find(x => x.id === 'wallT'); return w ? [w.texture, w.blocksSight, w.sightType, 'name' in w, 'hidden' in w] : null; };
    const wallGot = [WT.a1, WT.a2, WT.b1].map(wallOn), wallPage = [WT.a1, WT.b1].map(c => { const w = c.page.camp().items.mA.whiteboard.find(x => x.id === 'wallT'); return w ? [w.texture, w.blocksSight, 'name' in w] : null; }), sentAll = J(WT.net.conns.map(c => c.sent));
    const hostHid = WT.tok('hidT'), pA = WT.net.roster.pA1, tx0 = WT.tok('tA').x;
    const chg = WT.api.patch({ type: 'item', campId: 'k', itemId: 'mA', item: { whiteboard: [Object.assign({}, WT.tok('tA'), { x: 150, texture: 'bricks', blocksSight: true, sightType: 'wall', cover: 'yes', terrain: 3 }), { id: 'sT', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [10, 10]], texture: 'bricks', blocksSight: true, sightType: 'wall' }, { id: 'rT', type: 'rect', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50, texture: 'bricks' }, Object.assign({}, WT.a1.page.camp().items.mA.whiteboard.find(x => x.id === 'wallT'), { texture: 'grass', blocksSight: false })] } }, pA, {});   // the GM's wall as her own page holds it, with no name, changed by her
    const tA = WT.tok('tA'), sT = WT.tok('sT'), rT = WT.tok('rT'), wallAfter = WT.tok('wallT');
    check('map builder B1 on the wire (the mk4 host world): a textured wall on a fogged map reaches each player\'s copy (the real sends into real player pages) with its texture, blocksSight and sightType and without its name, as every plain wall leaves, while the host\'s own wall keeps its name; a hidden textured piece\'s id, texture and name appear nowhere in anything sent (nothing to a peer not admitted either) while the host keeps it; a player\'s patch moves their own token but sets neither texture, blocksSight, sightType, cover nor terrain on it, a new piece of theirs is refused, their stroke comes in without those keys, and the GM\'s wall is not theirs to touch: sent back as their page holds it, with no name and changed, it keeps its texture, its flag and its name on the host',
        J(wallGot) === J([['bricks', true, 'wall', false, false], ['bricks', true, 'wall', false, false], ['bricks', true, 'wall', false, false]]) && J(wallPage) === J([['bricks', true, false], ['bricks', true, false]]) && !/"name":"Wall"/.test(sentAll) && !/hidT|grass|Secret|"hidden"/.test(sentAll) && /wallT/.test(sentAll) && WT.w1.sent.length === 0 && !!hostHid && hostHid.texture === 'grass'
        && chg === true && tx0 === 100 && tA.x === 150 && !('texture' in tA) && !('blocksSight' in tA) && !('sightType' in tA) && !('cover' in tA) && !('terrain' in tA) && !!sT && sT.byPlayer === true && !('texture' in sT) && !('blocksSight' in sT) && !('sightType' in sT) && rT === undefined && wallAfter.texture === 'bricks' && wallAfter.blocksSight === true && wallAfter.name === 'Wall', J([wallGot, wallPage, tA, sT, wallAfter]));
    // (1c) map builder B3: a picture fill on the wire — each player's copy of the fogged map carries the piece with its path and its repeat; a hidden
    // piece's path and a web address a save held appear nowhere in anything sent; the patch gate takes neither key from a player
    const WP = mk4(), FLOORP = '/saves/images/k/stone floor.png', VAULTP = '/saves/images/k/secret vault.png';
    WP.camp.items.mA.whiteboard.push({ id: 'floorP', type: 'rect', x: 500, y: 500, w: 100, h: 100, z: 10, texSrc: FLOORP, texTile: 2, color: '#3f3b47', layer: 'back', name: 'Floor' }, { id: 'hidP', type: 'rect', hidden: true, x: 600, y: 600, w: 50, h: 50, texSrc: VAULTP, texTile: 'whole', name: 'Vault' }, { id: 'badP', type: 'rect', x: 700, y: 500, w: 50, h: 50, z: 10, texSrc: 'http://x.test/beacon.png', texTile: 9, name: 'Bad' });
    WP.clearSent(); WP.net.sendItem('k', 'mA');
    const picOn = (c, id) => { const it = WP.last(c, 'mA'), w = it && it.whiteboard.find(x => x.id === id); return w ? ['texSrc' in w ? w.texSrc : 'none', 'texTile' in w ? w.texTile : 'none'] : null; };
    const picGot = [WP.a1, WP.a2, WP.b1].map(c => picOn(c, 'floorP')), picBad = [WP.a1, WP.a2, WP.b1].map(c => picOn(c, 'badP')), picPage = [WP.a1, WP.b1].map(c => { const w = c.page.camp().items.mA.whiteboard.find(x => x.id === 'floorP'); return w ? [w.texSrc, w.texTile] : null; }), sentP = J(WP.net.conns.map(c => c.sent));
    const hostHidP = WP.tok('hidP'), pAp = WP.net.roster.pA1;
    const chgP = WP.api.patch({ type: 'item', campId: 'k', itemId: 'mA', item: { whiteboard: [Object.assign({}, WP.tok('tA'), { x: 150, texSrc: VAULTP, texTile: 2 }), { id: 'sP', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [10, 10]], texSrc: VAULTP, texTile: 1 }, Object.assign({}, WP.tok('floorP'), { texSrc: VAULTP, texTile: 'whole' }), Object.assign({}, WP.tok('badP'), { texSrc: VAULTP, texTile: 4 })] } }, pAp, {});
    const tAp = WP.tok('tA'), sPp = WP.tok('sP'), floorAfter = WP.tok('floorP'), sentP2 = J(WP.net.conns.map(c => c.sent));
    check('map builder B3 on the wire (the mk4 host world): a piece that wears a picture on a fogged map reaches each player\'s copy (the real sends into real player pages) with its path and its repeat; a web address a save held leaves as no fill at all, and a hidden piece\'s id, path and name appear nowhere in anything sent (nothing to a peer not admitted either) while the host keeps them; a player\'s patch moves their own token but sets neither key on it, their stroke comes in without them, and the GM\'s pieces keep the fill they had: no player names a path the host would then send to the table',
        J(picGot) === J(Array(3).fill([FLOORP, 2])) && J(picBad) === J(Array(3).fill(['none', 'none'])) && J(picPage) === J([[FLOORP, 2], [FLOORP, 2]]) && !/hidP|secret vault|Vault|beacon|x\.test/.test(sentP) && /floorP/.test(sentP) && WP.w1.sent.length === 0 && !!hostHidP && hostHidP.texSrc === VAULTP
        && chgP === true && tAp.x === 150 && !('texSrc' in tAp) && !('texTile' in tAp) && !!sPp && sPp.byPlayer === true && !('texSrc' in sPp) && !('texTile' in sPp) && floorAfter.texSrc === FLOORP && floorAfter.texTile === 2 && WP.tok('badP').texSrc === 'http://x.test/beacon.png' && !/secret vault|beacon/.test(sentP2), J([picGot, picBad, picPage, tAp, sPp, floorAfter]));

    // (2) a turn on the spot on a facing cone: the facings that hide the bat and show it, found by the real fog; nothing shows until the final
    const probe = mk4(), facingOf = r => { probe.tok('tC', 'mC').rot = r; return !(probe.fog.fogDropIds('u_a', probe.camp, probe.camp.items.mC) || {}).bat; };
    const rots = [0, 90, 180, 270], hideR = rots.find(r => !facingOf(r)), showR = rots.find(r => facingOf(r));
    const W2 = mk4({ tC: { rot: hideR } }); W2.move(W2.a1, 'tC', 300, 300, false, 'mC', { rot: showR });
    W2.clearSent(); W2.net.sendItem('k', 'mC'); const cone = { a1: W2.ids(W2.a1, 'mC'), tC: W2.at(W2.a1, 'tC', 'mC') };
    W2.api.landed('mC', () => W2.api.landed(null, () => W2.api.landed('mC', () => {}))); const e2 = W2.entry('mC', 'tC'), nest = [e2.rot, e2.lr, W2.tok('tC', 'mC').rot];
    W2.move(W2.a1, 'tC', 300, 300, true, 'mC', { rot: showR }); W2.clearSent(); W2.net.sendItem('k', 'mC'); const cone2 = W2.ids(W2.a1, 'mC');
    check('fold M4: a turn on the spot in progress on a facing cone reveals nothing until its final (the copy judged at the facing the drag began with, the player\'s own token at its live facing); fogLanded nested in itself (a map inside every map inside that map) leaves the drag\'s start and live facing and the token as they were',
        hideR !== undefined && showR !== undefined && J(cone.a1) === J(['tC']) && J(cone.tC) === J([300, 300, showR, 0]) && J(nest) === J([hideR, showR, showR]) && J(cone2) === J(['tC', 'bat']),
        J([hideR, showR, cone, nest, cone2]));

    // (3) fogLanded itself: restored when fn throws (an absent key absent again), fn's value returned, and what it judges equals a fresh fog module
    // with the token really at its start; afterwards the host's own fog judges the live place exactly as a fresh module does (nothing kept)
    const W3 = mk4(); W3.move(W3.a1, 'tA', 250, 100, false); delete W3.tok('tA').front;
    let threw3 = ''; try { W3.api.landed('mA', () => { throw new Error('boom'); }); } catch (e) { threw3 = e.message; }
    const after3 = { keys: Object.keys(W3.tok('tA')).includes('front'), place: [W3.tok('tA').x, W3.tok('tA').y], held: W3.api.opens().some(e => 'held' in e), open: !!W3.api.open('mA', W3.tok('tA')) };
    const fresh = (x, y) => { const cp = JSON.parse(J(W3.camp)); const t = cp.items.mA.whiteboard.find(w => w.id === 'tA'); t.x = x; t.y = y; const F = buildFog4()({ wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpVtt: { on: () => true, campaignOn: () => true, mode: () => 'host' }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } }, { getElementById: () => null }, () => null, () => cp, { appState: { campaigns: { k: cp } } }); return J(F.fogDropIds('u_a', cp, cp.items.mA)); };
    const inside3 = W3.api.landed('mA', () => J(W3.fog.fogDropIds('u_a', W3.camp, W3.camp.items.mA))), outside3 = J(W3.fog.fogDropIds('u_a', W3.camp, W3.camp.items.mA));
    check('fold M4: fogLanded puts every held token back exactly as it found it when fn throws (a key that was absent is absent again), returns fn\'s value, judges as a fresh fog module does with the token really at its start, and leaves the host\'s own fog judging the live place as a fresh module does',
        threw3 === 'boom' && after3.keys === false && J(after3.place) === J([250, 100]) && after3.held === false && after3.open === true && inside3 === fresh(100, 100) && outside3 === fresh(250, 100) && inside3 !== outside3,
        J([threw3, after3, inside3, outside3]));

    // R2 security (cluster A, #0): a session is one campaign — a map copy naming another of the GM's campaigns changes nothing there, is saved
    // nowhere, sends that campaign's map to no one, and its number is still taken; the same copy naming the hosted campaign lands as ever
    const W0 = mk4(), mZ = { id: 'mZ', type: 'map', meta: { title: 'mZ', gridType: 'square' }, rooms: [], links: [], whiteboard: [T('tZ', 'u_a', 'c_a', 2, 2)] };
    W0.state.appState.campaigns.k2 = { id: 'k2', items: { mZ: mZ }, chars: {} }; const before0 = J(mZ), saves0 = W0.timers.filter(t => t.ms === 250).length, made0 = () => W0.timers.filter(t => t.ms === 250).length - saves0;
    W0.clearSent(); W0.api.item({ type: 'item', campId: 'k2', itemId: 'mZ', a: 1, item: { whiteboard: [{ id: 'tZ', x: 500, y: 600, rot: 0, front: 0 }, { id: 'g0', type: 'path', ownerId: 'u_a', pts: [[0, 0], [1, 1]] }] } }, W0.a1);
    const other0 = { same: J(mZ) === before0, saves: made0(), sent: W0.net.conns.map(c => c.sent.filter(m => (m.type === 'item' || m.type === 'itemDelta') && (m.campId === 'k2' || m.itemId === 'mZ')).length), ack: W0.api.ackOf(W0.a1) };
    W0.api.item({ type: 'item', campId: 'k', itemId: 'mA', a: 2, item: { whiteboard: [Object.assign({}, W0.tok('tA'), { x: 150 })] } }, W0.a1);
    const ctrl0 = { x: W0.tok('tA').x, saves: made0(), ack: W0.api.ackOf(W0.a1) }, ipSrc = bw('itempatch');
    check('security (item patch, host — the real branch in the one-module world): a session is one campaign, as the threats and needItem branches have it — a map copy naming another of the GM\'s campaigns and a map there changes nothing on that map (no drawing, no move of their token there), queues no save, sends no copy or delta of it to anyone, the sender included, and still takes the patch\'s number; the same copy naming the hosted campaign lands as ever; the gate stands before the patch is applied',
        other0.same && other0.saves === 0 && J(other0.sent) === J([0, 0, 0, 0]) && other0.ack === 1 && ctrl0.x === 150 && ctrl0.saves === 1 && ctrl0.ack === 2
        && ipSrc.indexOf('msg.campId !== hcI.id') >= 0 && ipSrc.indexOf('msg.campId !== hcI.id') < ipSrc.indexOf('applyClientItemFiltered(msg, profile, pOut)'), J([other0, ctrl0]));

    // (4) a drag that ends without landing goes back where it began, place and facing, for everyone who sees it there: its connection closes, its
    // player is removed, sent to another map, the GM locks or hides the token; one the GM moved is forgotten, the GM's place standing
    const closeLine = (src.match(/\n\s*(if \(net\.role === 'host' && typeof fogDragSweep === 'function'\) fogDragSweep\(\);)[^\n]*/) || [])[1] || 'throw new Error("no close line")';
    const endCase = (setup, o) => {
        const W = mk4(Object.assign({ tA: { front: 30 } }, o || {})); W.move(W.a1, 'tA', 250, 100, false, 'mA', { front: 60 }); W.clearSent(); W.timers.length = 0;
        const midPlace = W.place('tA'); setup(W); W.api.sweep();
        return { W, mid: midPlace, place: W.place('tA'), entry: W.entry('mA', 'tA') === undefined, bPos: W.poses(W.b1).map(p => [p.x, p.y, p.front, p.final]), a2Pos: W.poses(W.a2).length, timers: W.timers.map(t => t.ms) };
    };
    const closed = endCase(W => { W.net.conns = W.net.conns.filter(c => c !== W.a1); delete W.net.roster.pA1; new Function('net', 'fogDragSweep', closeLine)(W.net, W.api.sweep); });
    const kicked = endCase(W => { W.net.kickPlayer('pA1'); });
    const summoned = endCase(W => { W.net.roster.pA1.location = 'mO'; W.net.roster.pA2.location = 'mO'; W.net.sendItem('k', 'mA', W.b1); W.sumB = W.at(W.b1, 'tA'); });
    const locked = endCase(W => { W.tok('tA').locked = true; W.move(W.a1, 'tA', 300, 100, false); W.lockedAt = [W.tok('tA').x, W.tok('tA').y]; W.net.sendItem('k', 'mA'); W.lockB = W.at(W.b1, 'tA'); W.clearSent(); });
    const hidden = endCase(W => { W.tok('tA').hidden = true; });
    const back = (r, a2, timers) => J(r.place) === J([100, 100, 0, 30]) && r.entry && J(r.bPos) === J([[100, 100, 30, true]]) && r.a2Pos === (a2 === undefined ? 1 : a2) && J(r.timers) === J(timers || [250]);
    check('fold M4: a drag that ends without landing goes back where it began, place and facing, with one final pos to each who sees it there and the save to come: its connection closed (the close handler\'s own line, run), its player removed (net.kickPlayer, run), its player sent to another map (a copy asked for meanwhile judged and shipping the token at its start), the GM locking the token (its moves refused meanwhile, a GM save shipping it at its start)',
        J(closed.mid) === J([250, 100, 0, 60]) && [closed, summoned, locked].every(r => back(r)) && back(kicked, 0, [250, 400, 400]) && J(summoned.W.sumB) === J([100, 100, 0, 30]) && J(locked.W.lockedAt) === J([250, 100]) && J(locked.W.lockB) === J([100, 100, 0, 30]),
        J([closed, kicked, summoned, locked].map(r => [r.place, r.entry, r.bPos, r.a2Pos, r.timers])));
    check('fold M4: a token the GM hides mid-drag goes back where it began on the host too, the drag forgotten, and no one is sent its place — its owner\'s other connection neither (a hidden token\'s moves reach no one)',
        J(hidden.place) === J([100, 100, 0, 30]) && hidden.entry && hidden.W.net.conns.every(c => c.sent.filter(x => x.type === 'pos').length === 0) && hidden.a2Pos === 0,
        J([hidden.place, hidden.bPos, hidden.W.net.conns.map(c => c.sent.filter(x => x.type === 'pos'))]));
    const W5 = mk4(); W5.move(W5.a1, 'tA', 250, 100, false); W5.tok('tA').x = 400; W5.clearSent(); W5.net.sendItem('k', 'mA', W5.b1); const gmMoved = { b: W5.at(W5.b1, 'tA') };
    W5.clearSent(); W5.api.sweep(); gmMoved.gone = W5.entry('mA', 'tA') === undefined; gmMoved.stay = W5.place('tA'); gmMoved.sent = W5.net.conns.map(c => c.sent.length);
    W5.asked.length = 0; W5.move(W5.a1, 'tA', 450, 100, false); gmMoved.fresh = W5.entry('mA', 'tA').x; gmMoved.from = W5.asked[0];
    const W6 = mk4({ rules: { walls: 'warn' } }); W6.move(W6.a1, 'tA', 250, 100, false); W6.tok('tA').rot = 90; W6.clearSent(); W6.net.sendItem('k', 'mA', W6.b1);
    const gmTurn = { b: W6.at(W6.b1, 'tA'), open: !!W6.entry('mA', 'tA') }; W6.asked.length = 0; W6.move(W6.a1, 'tA', 300, 100, true, 'mA', { rot: 90 }); gmTurn.from = W6.asked[0]; gmTurn.place = W6.place('tA');
    check('fold M4: a token the GM moves mid-drag ends that drag with the GM\'s place standing (judged there, the entry forgotten with nothing written or sent, the next move starting afresh from it); a turn the GM gives it mid-drag stands and the drag goes on (judged at its start place with the GM\'s facing; the final\'s wall check still asked from the start)',
        J(gmMoved.b) === J([400, 100, 0, 0]) && gmMoved.gone && J(gmMoved.stay) === J([400, 100, 0, 0]) && J(gmMoved.sent) === J([0, 0, 0, 0]) && gmMoved.fresh === 400 && J(gmMoved.from) === J([400, 100, 450, 100])
        && J(gmTurn.b) === J([100, 100, 90, 0]) && gmTurn.open && J(gmTurn.from) === J([100, 100, 300, 100]) && J(gmTurn.place) === J([300, 100, 90, 0]),
        J([gmMoved, gmTurn]));

    // (5) time: 30 s with no move puts it back, 29.999 s keeps it, a move restarts the count; a paused table (or player) keeps it, its count from the
    // resume, judged at its start meanwhile, and a final after the resume lands from the start; another player's drag outlives this one's close; the
    // session's end puts every drag back
    const W7 = mk4(); W7.move(W7.a1, 'tA', 250, 100, false); W7.now = W7.api.stale - 1; W7.api.sweep(); const kept7 = !!W7.entry('mA', 'tA');
    W7.now = W7.api.stale + 1; W7.api.sweep(); const back7 = [W7.entry('mA', 'tA') === undefined, W7.place('tA')];
    const W8 = mk4(); W8.move(W8.a1, 'tA', 250, 100, false); W8.now = 20000; W8.move(W8.a1, 'tA', 250, 150, false); W8.now = 45000; W8.api.sweep(); const kept8 = [!!W8.entry('mA', 'tA'), W8.place('tA')];
    let pausedPeer = false; const W9 = mk4({ paused: p => pausedPeer && p === 'pA1' }); W9.move(W9.a1, 'tA', 250, 100, false); W9.net.paused = true; W9.now = 60000; W9.api.sweep();
    const p9 = { kept: !!W9.entry('mA', 'tA') }; W9.clearSent(); W9.net.sendItem('k', 'mA', W9.b1); p9.b = W9.at(W9.b1, 'tA'); W9.net.paused = false; W9.now = 60000 + W9.api.stale - 1; W9.api.sweep(); p9.still = !!W9.entry('mA', 'tA');
    pausedPeer = true; W9.now = 200000; W9.api.sweep(); p9.peer = !!W9.entry('mA', 'tA'); pausedPeer = false;
    W9.asked.length = 0; W9.move(W9.a1, 'tA', 300, 100, true); p9.from = W9.asked[0]; p9.place = W9.place('tA');
    const W10 = mk4(); W10.move(W10.a1, 'tA', 250, 100, false); W10.move(W10.b1, 'tB', 150, 200, false); W10.net.conns = W10.net.conns.filter(c => c !== W10.a1); delete W10.net.roster.pA1; W10.api.sweep();
    const other10 = [W10.entry('mA', 'tA') === undefined, !!W10.entry('mA', 'tB'), W10.place('tB')];
    const W11 = mk4(); W11.move(W11.a1, 'tA', 250, 100, false); W11.move(W11.a1, 'tA2', 250, 100, false, 'mB'); W11.api.sweep(true); const all11 = [W11.api.opens().length, W11.place('tA'), [W11.tok('tA2', 'mB').x, W11.tok('tA2', 'mB').y]];
    W11.net.role = 'client'; W11.move(W11.a1, 'tA', 250, 100, false); const client11 = W11.api.opens().length;
    check('fold M4: 30 s with no move puts a drag back (29.999 s keeps it) and each accepted move restarts the count; a paused table or a paused player keeps it however long, counting from the resume, judged at its start meanwhile, and a final after the resume lands with its checks asked from the start; another player\'s open drag outlives this one\'s close; the end of the session puts every open drag back; a player\'s own machine keeps none',
        kept7 && back7[0] && J(back7[1]) === J([100, 100, 0, 0]) && kept8[0] && J(kept8[1]) === J([250, 150, 0, 0])
        && p9.kept && J(p9.b) === J([100, 100, 0, 0]) && p9.still && p9.peer && J(p9.from) === J([100, 100, 300, 100]) && J(p9.place) === J([300, 100, 0, 0])
        && other10[0] && other10[1] && J(other10[2]) === J([150, 200, 0, 0]) && all11[0] === 0 && J(all11[1]) === J([100, 100, 0, 0]) && J(all11[2]) === J([100, 100]) && client11 === 0,
        J([kept7, back7, kept8, p9, other10, all11, client11]));

    // (5b) what the mutants found: the owner's live place never reaches the shared clone (a map where nobody's copy drops anything); two sends
    // inside one outer judgment both give the owner the live place; fogLanded(map) holds that map's drags only; a held drag read through openDrag
    // is the drag and leaves its facings alone; a connection gone quiet (not open, its roster entry still there) ends its drag; a player's machine,
    // or a table off, sweeps nothing
    const W12 = mk4(); W12.camp.items.mA.whiteboard = W12.camp.items.mA.whiteboard.filter(w => w.id !== 'orc'); W12.move(W12.a1, 'tA', 250, 100, false); W12.clearSent(); W12.net.sendItem('k', 'mA');
    const shared12 = { a: W12.at(W12.a1, 'tA'), b: W12.at(W12.b1, 'tA') };
    const W13 = mk4(); W13.move(W13.a1, 'tA', 250, 100, false); W13.clearSent(); W13.api.landed(null, () => { W13.net.sendItem('k', 'mA'); W13.net.sendItem('k', 'mA'); });
    const twice13 = W13.a1.sent.filter(m => m.type === 'item').map(m => { const t = m.item.whiteboard.find(w => w.id === 'tA'); return [t.x, t.y]; }).concat(W13.b1.sent.filter(m => m.type === 'item').map(m => { const t = m.item.whiteboard.find(w => w.id === 'tA'); return [t.x, t.y]; }));
    W13.move(W13.a1, 'tA2', 250, 100, false, 'mB'); const onlyMap13 = W13.api.landed('mA', () => [W13.tok('tA').x, W13.tok('tA2', 'mB').x]);
    const W14 = mk4({ tC: { rot: 0 } }); W14.move(W14.a1, 'tC', 300, 300, false, 'mC', { rot: 90 });
    const held14 = W14.api.landed('mC', () => { const e = W14.api.open('mC', W14.tok('tC', 'mC')); return [!!e && e === W14.entry('mC', 'tC'), W14.tok('tC', 'mC').rot]; }), e14 = W14.entry('mC', 'tC');
    const W15 = mk4(); W15.move(W15.a1, 'tA', 250, 100, false); W15.a1.open = false; W15.api.sweep(); const quiet15 = [W15.entry('mA', 'tA') === undefined, W15.place('tA')];
    const W16 = mk4(); W16.move(W16.a1, 'tA', 250, 100, false); W16.net.role = 'client'; W16.now = 99999; W16.api.sweep(true); const cl16 = [!!W16.entry('mA', 'tA'), W16.place('tA')];
    W16.net.role = 'host'; W16.net.active = false; W16.api.sweep(true); cl16.push(!!W16.entry('mA', 'tA'), W16.place('tA'));
    check('fold M4: the player\'s own token at its live place goes on their own copy only, never on the clone the others\' copies share (a map where nobody\'s copy drops anything); two sends inside one outer judgment both give them the live place and everyone else the start; fogLanded on one map holds that map\'s drags only; a held drag read through openDrag is the drag and its facings are left alone',
        J(shared12.a) === J([250, 100, 0, 0]) && J(shared12.b) === J([100, 100, 0, 0]) && J(twice13) === J([[250, 100], [250, 100], [100, 100], [100, 100]]) && J(onlyMap13) === J([100, 250])
        && J(held14) === J([true, 0]) && e14.rot === 0 && e14.lr === 90 && W14.tok('tC', 'mC').rot === 90,
        J([shared12, twice13, onlyMap13, held14, e14]));
    const W17 = mk4({ wall: () => true }); W17.move(W17.a1, 'tA', 250, 100, false); W17.move(W17.a1, 'tA', 300, 100, false); const opened17 = !!W17.entry('mA', 'tA');
    W17.clearSent(); W17.timers.length = 0; W17.now = W17.api.stale + 1; W17.api.sweep(); const idle17 = [W17.entry('mA', 'tA') === undefined, W17.place('tA'), W17.net.conns.map(c => c.sent.length), W17.timers.length];
    const W18 = mk4(); W18.move(W18.a1, 'tA', 100, 100, false, 'mA', { rot: 90 }); W18.clearSent(); W18.timers.length = 0; W18.a1.open = false; W18.api.sweep();
    const turn18 = [W18.entry('mA', 'tA') === undefined, W18.place('tA'), W18.poses(W18.b1).map(p => [p.x, p.y, p.rot, p.final]), W18.timers.map(t => t.ms)];
    check('fold M4: a drag whose connection has gone quiet (no longer open, its roster entry still there) goes back where it began; a player\'s machine, and a table no longer running, sweep nothing; a drag whose every move was refused (a wall on Refuse) is forgotten at its end with nothing sent and nothing saved, its token never having left its start',
        quiet15[0] && J(quiet15[1]) === J([100, 100, 0, 0]) && J(cl16) === J([true, [250, 100, 0, 0], true, [250, 100, 0, 0]]) && opened17 && J(idle17) === J([true, [100, 100, 0, 0], [0, 0, 0, 0], 0])
        && J(turn18) === J([true, [100, 100, 0, 0], [[100, 100, 0, true]], [250]]),
        J([quiet15, cl16, opened17, idle17, turn18]));

    // fold M5: the host's record of what each connection's copy of each fogged map holds (inert: nothing reads it yet), seeded only after a send
    // that went out, per connection, and forgotten with the connection, the player, the map, an unfogged send and a new table
    const rec = (W, peer, mapId) => { const per = W.api.held()[peer], r = per && per[mapId]; return r ? { ids: Object.keys(r.ids).sort(), lit: r.lit, cap: r.cap } : null; };
    const want = (W, c, mapId) => { const it = W.last(c, mapId); return it ? { ids: it.whiteboard.map(w => w.id).sort(), lit: W.api.hash(JSON.stringify(it.fogLit || [])), cap: it.lightsCapped === true } : null; };
    const R1 = mk4(); R1.net.sendItem('k', 'mA'); const all1 = ['a1', 'a2', 'b1'].map(k => J(rec(R1, R1[k].peer, 'mA')) === J(want(R1, R1[k], 'mA'))), w1 = R1.api.held().pW === undefined;
    R1.camp.items.mA.whiteboard.push(T('wolf', '', 'c_n', 3, 2)); R1.clearSent(); R1.net.sendItem('k', 'mA', R1.a1); const only1 = [J(rec(R1, 'pA1', 'mA')) === J(want(R1, R1.a1, 'mA')), rec(R1, 'pA1', 'mA').ids.includes('wolf'), rec(R1, 'pA2', 'mA').ids.includes('wolf')];
    R1.clearSent(); R1.net.broadcastItemFiltered('k', 'mB'); const bif1r = ['a1', 'a2', 'b1'].map(k => J(rec(R1, R1[k].peer, 'mB')) === J(want(R1, R1[k], 'mB')));
    const failed2 = [], R2 = mk4({ failed: failed2 }); R2.a2.send = () => { throw new Error('packer'); }; R2.net.sendItem('k', 'mA');
    const R2b = mk4({ failed: failed2 }); R2b.b1.send = () => { throw new Error('packer'); }; R2b.net.broadcastItemFiltered('k', 'mA');
    const noRec = [rec(R2, 'pA2', 'mA'), !!rec(R2, 'pA1', 'mA'), rec(R2b, 'pB', 'mA'), !!rec(R2b, 'pA1', 'mA'), J(failed2) === J(['packer', 'packer'])];
    const R3 = mk4(); R3.camp.items.mO.fog.on = false; const snapCopy = R3.api.copy(R3.api.clean(R3.camp.items.mA), R3.camp, R3.camp.items.mA, 'u_b');
    R3.api.seedSnap(R3.b1, { appState: { activeCampaignId: 'k', campaigns: { k: { items: { mA: snapCopy, mO: R3.api.clean(R3.camp.items.mO), zz: { type: 'map', whiteboard: [{ id: 'q' }] } } } } } });
    const snap3 = [J(rec(R3, 'pB', 'mA')) === J({ ids: snapCopy.whiteboard.map(w => w.id).sort(), lit: R3.api.hash(JSON.stringify(snapCopy.fogLit || [])), cap: snapCopy.lightsCapped === true }), !!rec(R3, 'pB', 'mO'), rec(R3, 'pB', 'zz'), Object.keys(R3.api.held())];
    const R4 = mk4(); R4.net.sendItem('k', 'mA'); R4.net.sendItem('k', 'mB'); R4.net.itemGone('k', 'mB'); const gone4 = [!!rec(R4, 'pA1', 'mA'), rec(R4, 'pA1', 'mB'), rec(R4, 'pB', 'mB')];
    R4.camp.items.mA.fog.on = false; R4.net.sendItem('k', 'mA'); gone4.push(rec(R4, 'pA1', 'mA'), rec(R4, 'pB', 'mA'));
    const R4b = mk4(); R4b.net.sendItem('k', 'mA'); const had4b = !!rec(R4b, 'pA1', 'mA'); R4b.camp.items.mA.fog.on = false; R4b.net.broadcastItemFiltered('k', 'mA'); gone4.push(had4b, rec(R4b, 'pA1', 'mA'), rec(R4b, 'pB', 'mA'));
    const R5 = mk4(); R5.net.sendItem('k', 'mA'); R5.net.kickPlayer('pA1'); const kick5 = [rec(R5, 'pA1', 'mA'), rec(R5, 'pA2', 'mA'), !!rec(R5, 'pB', 'mA')];
    const R6 = mk4(); R6.net.sendItem('k', 'mA'); R6.api.forgetAll(); const all6 = Object.keys(R6.api.held()).length;
    const litMap = mk4({ fogLitFor: pid => (pid === 'u_a' ? { lit: [{ c: 3, r: 3, t: 2 }, { c: 4, r: 3, t: 1 }], capped: true } : null) }); litMap.net.sendItem('k', 'mA');
    const lit7 = [rec(litMap, 'pA1', 'mA'), want(litMap, litMap.a1, 'mA'), (litMap.last(litMap.a1, 'mA').fogLit || []).length, J(rec(litMap, 'pB', 'mA')) === J(want(litMap, litMap.b1, 'mA')), rec(litMap, 'pA1', 'mA').cap, rec(litMap, 'pB', 'mA').cap, rec(litMap, 'pA1', 'mA').lit !== rec(litMap, 'pB', 'mA').lit];
    const barPeer = mk4(); barPeer.a1.peer = 'p|A'; barPeer.net.roster = { 'p|A': { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } }; barPeer.camp.items['A|mA'] = barPeer.camp.items.mA; barPeer.net.sendItem('k', 'A|mA');
    const bar8 = [!!rec(barPeer, 'p|A', 'A|mA'), rec(barPeer, 'p', 'A|mA'), rec(barPeer, 'p|A', 'A')];
    check('fold M5: after each send that went out, the host records per connection what that copy of the fogged map holds — its items\' ids, its lit cells as a hash, its light cap — equal to the copy itself (a GM save to all, a copy to one connection alone leaving the player\'s other connection\'s record as it was, a copy sent to the table); a peer not admitted gets none; a send that throws records nothing for that connection and the others as ever',
        all1.every(Boolean) && w1 && J(only1) === J([true, true, false]) && bif1r.every(Boolean) && noRec[0] === null && noRec[1] && noRec[2] === null && noRec[3] && noRec[4] && J(lit7[0]) === J(lit7[1]) && lit7[2] === 2 && lit7[3] && lit7[4] === true && lit7[5] === false && lit7[6],
        J([all1, only1, bif1r, noRec, lit7]));
    check('fold M5: the join snapshot records every fogged map of the hosted campaign it carried (never an unfogged one, never a map the host does not hold); the record is forgotten for a map that goes (for everyone) or is sent to the table unfogged, for every connection of a removed player (another\'s kept), and at a new table; a connection\'s id or a map\'s id holding a bar never collide',
        snap3[0] && snap3[1] === false && snap3[2] === null && J(snap3[3]) === J(['pB']) && J(gone4) === J([true, null, null, null, null, true, null, null]) && J(kick5) === J([null, null, true]) && all6 === 0 && J(bar8) === J([true, null, null]),
        J([snap3, gone4, kick5, all6, bar8]));
    const fmSrc5 = bw('fogmove', 'netfog.js'), otherSrc5 = src.slice(0, src.indexOf('// [netcheck:fogmove-start]')) + src.slice(src.indexOf('// [netcheck:fogmove-end]'));
    const scripts5 = fs.readdirSync(path.join(__dirname, '..', 'system', 'app', 'scripts')).filter(f => /\.js$/.test(f) && f !== 'net.js').filter(f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').indexOf('_fogHeld') >= 0);
    check('fold M5 (source): the record is named only inside its slice and in no other script; each whole send seeds after its try (a send that throws returns first); the snapshot seeds only once it went out, after its try; the close handler, kickPlayer, itemGone, both unfogged sends and a new table forget',
        fmSrc5.indexOf('var _fogHeld') >= 0 && otherSrc5.indexOf('_fogHeld') < 0 && scripts5.length === 0
        && (src.match(/catch \(e\) \{ sendFailed\(e\); return; \}[^\n]*\n(?:\s*var fdB = [^\n]*\n)?\s*if \(typeof fogSeed === 'function' && fogSeed\(conn, itemId, out, (fd|fdB) \? \1\.sum : null\)\) fogRoster\(conn, pr\.id, itemId\);/g) || []).length === 2   /* 1.6.3 (the multiplayer review, finding 8), moved on purpose: each whole send hands fogSeed its copy's summary (fogDeltaFor), the table's send making it on the line before */
        && /conn\.send\(snap\); snapOk = true;/.test(src) && /\n\s*if \(snapOk && typeof fogSeedSnapshot === 'function'\) fogSeedSnapshot\(conn, snap\);/.test(src)
        && /fogDragSweep\(\);[^\n]*\n\s*if \(typeof fogForgetConn === 'function'\) fogForgetConn\(conn\.peer\);/.test(src) && /if \(typeof fogForgetConn === 'function'\) keys\.forEach\(fogForgetConn\);/.test(whole4('net.kickPlayer = function('))
        && /fogForgetMap\(itemId\)/.test(whole4('net.itemGone = function(')) && /fogForgetAll\(\);/.test(fnSrc('function startHosting(forceFresh) {', '\n    diceSessionReset(true);', 'startHosting')), J(scripts5));

    // 14c K1: how far each copy goes. The host takes a player's action number ('a') once the handler has run, whatever became of the action, per
    // connection; every copy of a map sent to that connection says it ('ack'); a put-back says the number of the action it answers
    {
        const A1 = mk4(), ak = () => J(Object.assign({}, A1.api.acks()));
        const nums = [3, '5', 5.5, -1, 0, NaN, Infinity, 2147483648, null, [], {}, 2, 2147483647].map(v => { A1.api.ackTook(A1.a2, v); return A1.api.ackOf(A1.a2); });
        A1.api.ackTook(A1.a1, 4); A1.api.ackTook(A1.a1, 2); const perConn = [A1.api.ackOf(A1.a1), A1.api.ackOf(A1.b1), A1.api.ackOf({ peer: 'nobody' }), A1.api.ackOf(null)];
        const src1 = { type: 'item', campId: 'k', itemId: 'mA', item: { x: 1 } }, wa = A1.api.withAck(src1, A1.a1), wat = [A1.api.withAck(src1, A1.a1, 9).ack, A1.api.withAck(src1, A1.a1, 1).ack, A1.api.withAck(src1, A1.a1, 'x').ack, A1.api.withAck(src1, A1.b1).ack];
        check('14c K1: an action number is taken only as a whole number from 1 to 2^31-1 (anything else is none), per connection, never lower than one taken before; a copy of a message says its connection\'s number (or the action\'s, where higher) and leaves the message as it was',
            J(nums) === J([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2147483647]) && J(perConn) === J([4, 0, 0, 0]) && wa !== src1 && wa.ack === 4 && wa.item === src1.item && !('ack' in src1) && J(wat) === J([9, 4, 4, 0]), J([nums, perConn, wat]));
        // every send of a map says the number of the connection it goes to; a peer not admitted gets nothing
        const A2 = mk4(); A2.api.ackTook(A2.a1, 7); A2.api.ackTook(A2.b1, 2); A2.clearSent();
        const ackOfLast = (c, type) => { const m = c.sent.filter(x => x.type === (type || 'item')).pop(); return m ? (Object.prototype.hasOwnProperty.call(m, 'ack') ? m.ack : 'none') : 'absent'; };
        A2.net.sendItem('k', 'mA'); const fogAll = [ackOfLast(A2.a1), ackOfLast(A2.a2), ackOfLast(A2.b1), ackOfLast(A2.w1)];
        A2.clearSent(); A2.net.sendItem('k', 'mA', A2.a1); const fogOne = [ackOfLast(A2.a1), ackOfLast(A2.b1)];
        A2.clearSent(); A2.net.broadcastItemFiltered('k', 'mA'); const fogBif = [ackOfLast(A2.a1), ackOfLast(A2.a2), ackOfLast(A2.b1), ackOfLast(A2.w1)];
        A2.camp.items.mA.fog.on = false;
        A2.clearSent(); A2.net.sendItem('k', 'mA'); const openAll = [ackOfLast(A2.a1), ackOfLast(A2.a2), ackOfLast(A2.b1), ackOfLast(A2.w1)];
        A2.clearSent(); A2.net.sendItem('k', 'mA', A2.b1); const openOne = [ackOfLast(A2.a1), ackOfLast(A2.b1)];
        A2.clearSent(); A2.net.broadcastItemFiltered('k', 'mA'); const openBif = [ackOfLast(A2.a1), ackOfLast(A2.a2), ackOfLast(A2.b1), ackOfLast(A2.w1)];
        A2.clearSent(); A2.api.ackSend({ type: 'itemDelta', campId: 'k', itemId: 'mA', whiteboard: { set: [], del: [] } }); const delta = [ackOfLast(A2.a1, 'itemDelta'), ackOfLast(A2.b1, 'itemDelta'), ackOfLast(A2.w1, 'itemDelta')];
        check('14c K1: every copy of a map the host sends says how far it goes for the connection it goes to — a fogged map to every connection, to one alone and to the table, an unfogged one whole to all, to one, to the table and as a delta; a peer not admitted gets none',
            J(fogAll) === J([7, 0, 2, 'absent']) && J(fogOne) === J([7, 'absent']) && J(fogBif) === J([7, 0, 2, 'absent']) && J(openAll) === J([7, 0, 2, 'absent']) && J(openOne) === J(['absent', 2]) && J(openBif) === J([7, 0, 2, 'absent']) && J(delta) === J([7, 2, 'absent']),
            J([fogAll, fogOne, fogBif, openAll, openOne, openBif, delta]));
        // the number is taken once the handler has run: a copy made inside it, before the move lands (the GM's pending edit saved first), says the old one
        const A3 = mk4(); A3.winRef.wpHistFlush = () => A3.net.sendItem('k', 'mA'); A3.api.ackTook(A3.a1, 3); A3.clearSent();
        A3.move(A3.a1, 'tA', 250, 100, true, 'mA', { a: 5 }); const inside = A3.a1.sent.filter(m => m.type === 'item').map(m => [m.ack, (m.item.whiteboard.find(w => w.id === 'tA') || {}).x]);
        delete A3.winRef.wpHistFlush; A3.clearSent(); A3.net.sendItem('k', 'mA'); const after = A3.a1.sent.filter(m => m.type === 'item').map(m => [m.ack, (m.item.whiteboard.find(w => w.id === 'tA') || {}).x]);
        check('14c K1: a move\'s number is taken only once its handler has run — a copy the host makes inside it before the move lands (the GM\'s pending edit saved first) still says the number before it and has the token where it was; the next copy says the move\'s number and has the token where it landed',
            J(inside) === J([[3, 100]]) && A3.api.ackOf(A3.a1) === 5 && J(after) === J([[5, 250]]), J([inside, after]));
        // whatever became of it: refused (another's token, a locked one, a paused table, a rate limit), dropped as malformed, a patch, threat marks
        const took = (fn) => { const W = mk4(); fn(W); return W.api.ackOf(W.a1); };
        const verdicts = [
            took(W => W.move(W.a1, 'tB', 300, 100, true, 'mA', { a: 4 })),
            took(W => { W.tok('tA').locked = true; W.move(W.a1, 'tA', 300, 100, true, 'mA', { a: 4 }); }),
            took(W => { W.net.paused = true; W.move(W.a1, 'tA', 300, 100, true, 'mA', { a: 4 }); }),
            took(W => W.api.pos({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tA', x: 'x', y: 1, final: true, a: 4 }, W.a1)),
            took(W => W.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { whiteboard: [Object.assign({}, W.tok('tA'), { x: 150 })] }, a: 4 }, W.a1)),
            took(W => { W.net.paused = true; W.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { whiteboard: [] }, a: 4 }, W.a1); }),
            took(W => { W.net.roster.pA1.location = 'mA'; W.api.threatsIn({ type: 'threats', campId: 'k', itemId: 'mA', wbId: 'tA', threats: [90], a: 4 }, W.a1); }),
            took(W => W.api.threatsIn({ type: 'threats', campId: 'k', itemId: 'mA', wbId: 'tB', threats: [90], a: 4 }, W.a1)),
            took(W => W.move(W.a1, 'tA', 300, 100, true, 'mA', { a: '4' })),
            took(W => W.move(W.a1, 'tA', 300, 100, true, 'mA'))];
        check('14c K1: the number is taken whatever became of the action — a move of another\'s token, of a locked one, on a paused table, a move that is no number, a patch (applied or dropped on a paused table), threat marks (applied or refused); a message with no number, or one that is no whole number, takes none (handled exactly as before)',
            J(verdicts) === J([4, 4, 4, 4, 4, 4, 4, 4, 0, 0]), J(verdicts));
        // a put-back answers the action it refuses, to its mover alone: the pos path (a wall) and the patch path
        const A5 = mk4({ wall: () => true }); A5.api.ackTook(A5.a1, 2); A5.clearSent(); A5.move(A5.a1, 'tA', 250, 100, true, 'mA', { a: 6 });
        const back5 = A5.a1.sent.filter(m => m.type === 'pos').map(m => [m.x, m.ack]), others5 = [A5.a2, A5.b1].map(c => c.sent.filter(m => m.type === 'pos').map(m => ('ack' in m) ? 'ack' : m.x));
        const A6 = mk4({ wall: () => true }); A6.clearSent(); A6.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { whiteboard: [Object.assign({}, A6.tok('tA'), { x: 250 })] }, a: 8 }, A6.a1);
        const back6 = A6.a1.sent.filter(m => m.type === 'pos').map(m => [m.x, m.ack]), others6 = [A6.a2, A6.b1].map(c => c.sent.filter(m => m.type === 'pos').map(m => ('ack' in m) ? 'ack' : m.x));
        const A7 = mk4({ wall: () => true }); A7.clearSent(); A7.api.patch({ type: 'item', campId: 'k', itemId: 'mA', item: { whiteboard: [Object.assign({}, A7.tok('tA'), { x: 250 })] }, a: 8 }, A7.net.roster.pA1, {});   // a caller that names no connection: as before, to everyone
        const noMover = [A7.a1, A7.b1].map(c => c.sent.filter(m => m.type === 'pos').map(m => ('ack' in m) ? 'ack' : m.x));
        check('14c K1: a move put back (a wall in the way, by the drop and by the map copy after it) reaches its mover once, saying the number of the action it answers, and everyone else who sees it as before, with no number; with no mover known it goes to everyone as before',
            J(back5) === J([[100, 6]]) && J(others5) === J([[100], [100]]) && J(back6) === J([[100, 8]]) && J(others6) === J([[100], [100]]) && J(noMover) === J([[100], [100]]), J([back5, others5, back6, others6, noMover]));
        // turn-based combat's put-backs answer their move too: out of turn, and past the move allowed
        const turnBack = (setup) => { const W = mk4(); W.net.combats = { f_pier0001: { id: 'f_pier0001', mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_b', name: 'Bo', tokId: 'tB' }, { id: 'r_a', name: 'Ana', tokId: 'tA' }] } }; if (setup) setup(W); W.clearSent(); W.move(W.a1, 'tA', 350, 100, true, 'mA', { a: 12 }); return W.a1.sent.filter(m => m.type === 'pos').map(m => [m.x, m.ack]); };
        const outOfTurn = turnBack(), pastMove = turnBack(W => { W.net.combats.f_pier0001.turn = 1; W.net.turnMove = { f_pier0001: { tokId: 'tA', rowId: 'r_a', allow: 1, moved: 0 } }; });
        check('14c K1: turn-based combat\'s put-backs (a move out of its turn, a move past the move allowed) reach the mover saying the number of the move they answer',
            J(outOfTurn) === J([[100, 12]]) && J(pastMove) === J([[100, 12]]), J([outOfTurn, pastMove]));
        const A8 = mk4(); A8.api.ackTook(A8.a1, 5); A8.api.ackTook(A8.b1, 6); A8.api.forgetConn('pA1'); const f1 = [A8.api.ackOf(A8.a1), A8.api.ackOf(A8.b1)]; A8.api.forgetAll(); const f2 = [A8.api.ackOf(A8.b1)];
        const srcNoCm = src.replace(/\/\/[^\n]*/g, '');
        check('14c K1: the number is forgotten with its connection (the close handler and a kick go through it) and at a new table; in net.js no map goes out as a bare item or through the shared broadcast but where the slice is missing, and every handler taking a number takes it in a finally',
            J(f1) === J([0, 6]) && J(f2) === J([0]) && !/conn\.send\(\{ type: 'item'/.test(srcNoCm) && !/onlyConn\.send\(full\)/.test(srcNoCm) && (srcNoCm.match(/else broadcast\((msg|bm), null\);/g) || []).length === 2
            && (srcNoCm.match(/\} finally \{ if \(typeof ackTook === 'function'\) ackTook\(conn, (msg\.a|aIn)\); \}/g) || []).length === 3 && (srcNoCm.match(/ackTook\(/g) || []).length === 4, J([f1, f2]));
    }
    // 14c K2: the player's side, run for real — a page built from the real client code (the record, applyItem, applyItemDelta, the pos branch,
    // streamPos, the map patch, sendThreats) wired to the host world above: each crossing is played out in order, a copy the host made before an
    // action of theirs landed reaching them after they acted, then the host handling what they sent. 'old' strips every number the host sends
    // (a host without this): the step-back shows, then is gone with the numbers
    {
        const pageSrc = [lineOf('function own(o, k) {'), lineOf('function validKey(k) {'), lineOf('function campOf(id) {'), bw('actlog', 'netfog.js'),
            fnSrc('function activeItemPatch(', '\n}\n', 'activeItemPatch', 'netfog.js') + '\n}\n', fnSrc('function applyItem(msg) {', '\n}\n', 'applyItem', 'netfog.js') + '\n}\n', fnSrc('function applyItemDelta(msg) {', '\n}\n', 'applyItemDelta', 'netfog.js') + '\n}\n',
            fnSrc('function handlePos(msg, conn) {', '\n}\n', 'handlePos') + '\n}\n', fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\n', 'var _lastPatchHash = {}, _posLast = 0;',
            whole4('net.streamPos = function('), whole4('net.onLocalSave = function('), whole4('net.sendThreats = function('),
            'return { applyItem: applyItem, applyItemDelta: applyItemDelta, pos: handlePos, rec: function() { return _act; }, forget: actForget };'].join('\n');
        const PNAMES = ['net', 'state', 'window', 'getActiveCampaign', 'getActiveMap', 'cleanHostMap', 'render', 'updateSidebarNav', 'broadcast', 'applyPosToDom', 'sendFailed', 'SC', 'broadcastPos', 'scheduleStageFollow', 'checkRoomHandouts'];
        const buildPage = new Function(...PNAMES, pageSrc);
        // one player's page (Ana, u_a) wired to world W's connection a1; old: the numbers the host sends are stripped on the way
        const mkPage = (W, old) => {
            const inbox = [], hostConn = { peer: 'h', open: true, send(m) { packCheck(m); inbox.push(JSON.parse(J(m))); } };
            const net = { role: 'client', active: true, foreign: true, syncedPeer: 'h', applyingRemote: false, myId: 'u_a', conns: [hostConn], roster: {}, paused: false, selfPaused: false };
            const camp = { id: 'k', activeItemId: 'mA', items: {} }, state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } }, viewMode: 'visual', wbEls: {} };
            const win = { wpFog: { invalidateVision() {}, redraw() {} }, wpSheets: { tokenTurned() {} } };
            const bcP = m => net.conns.forEach(c => { if (c.open) c.send(m); });
            const P = buildPage(net, state, win, () => camp, () => camp.items[camp.activeItemId], m => m, () => {}, () => {}, bcP, () => {}, () => {}, () => Sx, () => {}, () => {}, () => {});
            const strip = m => { if (!old) return m; const c = JSON.parse(J(m)); delete c.ack; return c; };
            const feed = m => { m = strip(m); if (m.type === 'item') P.applyItem(m); else if (m.type === 'itemDelta') P.applyItemDelta(m); else if (m.type === 'pos') P.pos(m, { peer: 'h' }); };
            const pg = { P, net, camp, inbox, feed,
                take: (from) => { const got = W.a1.sent.slice(from || 0); W.a1.sent.length = 0; got.forEach(feed); return got.length; },   // what the host sent a1 lands on the page, in order
                map: () => camp.items.mA, tok: id => camp.items.mA.whiteboard.find(w => w && w.id === id),
                drop: (id, x, y) => { const t = pg.tok(id); t.x = x; t.y = y; net.streamPos(t, true, 'mA'); },
                save: () => net.onLocalSave(),
                host: () => { const q = inbox.splice(0); q.forEach(m => { if (m.type === 'pos') W.api.pos(m, W.a1); else if (m.type === 'item') W.api.item(m, W.a1); else if (m.type === 'threats') W.api.threatsIn(m, W.a1); }); return q.map(m => m.type + ':' + m.a); } };
            W.clearSent(); W.net.sendItem('k', 'mA', W.a1); pg.take();   // her copy, as a join would give it
            return pg;
        };
        const gmSave = W => { W.net.sendItem('k', 'mA'); };
        // (1) a drop crossing the GM's save, then the drop's own map patch 500 ms later
        const dropCross = old => { const W = mk4(); const pg = mkPage(W, old); pg.drop('tA', 250, 100); gmSave(W); pg.take(); const mid = pg.tok('tA').x; pg.save(); const handled = pg.host(); gmSave(W); pg.take(); return { mid, handled, page: pg.tok('tA').x, host: W.tok('tA').x }; };
        const d1 = dropCross(false), d0 = dropCross(true);
        check('14c K2: a drop crossing the GM\'s save — without the numbers her token steps back on her screen and her drop\'s own map patch then moves it back for the table; with them the copy made before the drop landed gets it written back, the patch carries it, and the host and her screen both keep it',
            J(d0) === J({ mid: 100, handled: ['pos:1', 'item:2'], page: 100, host: 100 }) && J(d1) === J({ mid: 250, handled: ['pos:1', 'item:2'], page: 250, host: 250 }), J([d0, d1]));
        // (2) a stance, (3) two drawings around a crossing copy, (4) an erase, (5) the Facing dial's marks
        const stroke = (id, x) => ({ id, type: 'path', x, y: 10, w: 20, h: 20, baseW: 20, baseH: 20, pts: [[0, 0], [10, 10]], color: '#e9e9f0', strokeWidth: 3, ownerId: 'u_a', byPlayer: true, z: 35 });
        const stanceCross = old => { const W = mk4(); const pg = mkPage(W, old); pg.tok('tA').posture = 'crouching'; pg.save(); gmSave(W); pg.take(); const mid = pg.tok('tA').posture || 'standing'; pg.host(); gmSave(W); pg.take(); return { mid, page: pg.tok('tA').posture || 'standing', host: W.tok('tA').posture || 'standing' }; };
        const drawTwice = old => { const W = mk4(); const pg = mkPage(W, old); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); gmSave(W); pg.take(); const mid = pg.map().whiteboard.filter(w => w.type === 'path').map(w => w.id); pg.map().whiteboard.push(stroke('s2', 40)); pg.save(); pg.host(); gmSave(W); pg.take(); return { mid, page: pg.map().whiteboard.filter(w => w.type === 'path').map(w => w.id), host: W.camp.items.mA.whiteboard.filter(w => w.type === 'path').map(w => w.id) }; };
        const eraseCross = old => { const W = mk4(); W.camp.items.mA.whiteboard.push(stroke('s1', 10)); const pg = mkPage(W, old); pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); gmSave(W); pg.take(); const mid = pg.map().whiteboard.some(w => w.id === 's1'); pg.host(); pg.tok('tA').x = 150; pg.save(); pg.host(); gmSave(W); pg.take(); return { mid, page: pg.map().whiteboard.some(w => w.id === 's1'), host: W.camp.items.mA.whiteboard.some(w => w.id === 's1') }; };
        const marksCross = old => { const W = mk4(); W.net.roster.pA1.location = 'mA'; const pg = mkPage(W, old); pg.tok('tA').threats = [90]; pg.net.sendThreats('k', 'mA', 'tA', [90]); gmSave(W); pg.take(); const mid = J(pg.tok('tA').threats || []); pg.host(); gmSave(W); pg.take(); return { mid, page: J(pg.tok('tA').threats || []), host: J(W.tok('tA').threats || []) }; };
        const st = [stanceCross(true), stanceCross(false)], dr = [drawTwice(true), drawTwice(false)], er = [eraseCross(true), eraseCross(false)], mk = [marksCross(true), marksCross(false)];
        check('14c K2: a stance, two drawings, an erase and the Facing dial\'s marks, each crossing a copy made before it landed — without the numbers each is undone on her screen (and her first drawing erased for the table by her second, her erased drawing back for the table by her next patch); with them each stays, on her screen and on the host',
            J(st[0]) === J({ mid: 'standing', page: 'crouching', host: 'crouching' }) && J(st[1]) === J({ mid: 'crouching', page: 'crouching', host: 'crouching' })
            && J(dr[0]) === J({ mid: [], page: ['s2'], host: ['s2'] }) && J(dr[1]) === J({ mid: ['s1'], page: ['s1', 's2'], host: ['s1', 's2'] })
            && J(er[0]) === J({ mid: true, page: true, host: true }) && J(er[1]) === J({ mid: false, page: false, host: false })
            && J(mk[0]) === J({ mid: '[]', page: '[90]', host: '[90]' }) && J(mk[1]) === J({ mid: '[90]', page: '[90]', host: '[90]' }), J([st, dr, er, mk]));
        // (6) the host's verdicts: a refused drop's put-back, a newer drop still on its way when it comes, the GM moving her token, a token that left her
        const refused = (() => { const W = mk4({ wall: (fx, fy, tx) => tx >= 250 }); const pg = mkPage(W); pg.drop('tA', 250, 100); pg.host(); pg.take(); const after = pg.tok('tA').x; gmSave(W); pg.take(); const left = Object.keys(pg.P.rec().pend.mA ? pg.P.rec().pend.mA.t : {}).length; pg.save(); pg.host(); return { after, page: pg.tok('tA').x, host: W.tok('tA').x, left }; })();
        const newer = (() => { const W = mk4({ wall: (fx, fy, tx) => tx >= 250 }); const pg = mkPage(W); pg.drop('tA', 250, 100); pg.drop('tA', 150, 100); const q = pg.inbox.splice(0); W.api.pos(q[0], W.a1); pg.take(); const mid = pg.tok('tA').x; W.api.pos(q[1], W.a1); gmSave(W); pg.take(); return { mid, page: pg.tok('tA').x, host: W.tok('tA').x }; })();
        const gmDrag = (() => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); pg.feed({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tA', x: 400, y: 100, rot: 0, front: 0, final: false }); const mid = pg.tok('tA').x; pg.host(); gmSave(W); pg.take(); return { mid, page: pg.tok('tA').x, host: W.tok('tA').x }; })();
        const gone = (() => { const W = mk4(); W.camp.items.mA.fog.on = false; const pg = mkPage(W); pg.drop('tA', 250, 100); W.tok('tA').ownerId = 'u_b'; gmSave(W); pg.take(); return pg.tok('tA') ? pg.tok('tA').x : 'gone'; })();   // unfogged: the GM gave her token to Bo, and she still sees it
        check('14c K2: the host\'s word — a refused drop\'s put-back (it says the drop\'s number) lands at once and the copies after it are taken as they come; a put-back that comes while a newer drop of hers is on its way waits for it (the newer one lands on the host too); the GM dragging her token (no number) is the host\'s last word; a token no longer hers is taken as it comes',
            J(refused) === J({ after: 100, page: 100, host: 100, left: 0 }) && J(newer) === J({ mid: 150, page: 150, host: 150 }) && J(gmDrag) === J({ mid: 400, page: 250, host: 250 }) && gone === 100, J([refused, newer, gmDrag, gone]));
        // (7) an unfogged map (a delta or a whole copy for each connection), an old host, what a hostile number does, and the record's own bounds
        const openCross = old => { const W = mk4(); W.camp.items.mA.fog.on = false; const pg = mkPage(W, old); pg.drop('tA', 250, 100); gmSave(W); pg.take(); return pg.tok('tA').x; };
        const bad = [undefined, 'x', -1, 1.5, 0.5, NaN, [], {}, 2 ** 40, null].map(v => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); gmSave(W); const m = W.a1.sent.filter(x => x.type === 'item').pop(); W.a1.sent.length = 0; const c = JSON.parse(J(m)); if (v === undefined) delete c.ack; else c.ack = v; pg.feed(c); return pg.tok('tA').x; });
        const big = (() => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); gmSave(W); const m = W.a1.sent.filter(x => x.type === 'item').pop(); W.a1.sent.length = 0; m.ack = 2147483647; pg.feed(m); return [pg.tok('tA').x, Object.keys(pg.P.rec().pend.mA.t).length]; })();
        const cap = (() => { const W = mk4(); const pg = mkPage(W); for (let i = 0; i < 20; i++) { pg.camp.activeItemId = 'm' + i; pg.camp.items['m' + i] = { id: 'm' + i, type: 'map', whiteboard: [{ id: 't' + i, ownerId: 'u_a', x: i, y: 0 }] }; pg.save(); } return [Object.keys(pg.P.rec().pend).length, Object.keys(pg.P.rec().pend)[0], pg.P.rec().order.length]; })();
        const forgot = (() => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); const s1 = pg.P.rec().seq; pg.P.forget(); pg.drop('tA', 260, 100); return [s1, pg.P.rec().seq, Object.keys(pg.P.rec().pend).length]; })();
        // a delta written back as a whole copy is; a drawing set forgotten once a copy goes that far (the GM's erase then shows); the GM dragging her
        // token forgets her drop's record at once (a copy made meanwhile is taken as it comes); a live move carries no number and records nothing;
        // a number past the top leaves the record as it was
        const deltaCross = (() => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); const t0 = Object.assign({}, W.tok('tA')); pg.feed({ type: 'itemDelta', campId: 'k', itemId: 'mA', whiteboard: { set: [t0], del: [] }, ack: 0 }); return pg.tok('tA').x; })();
        const gmErase = (() => { const W = mk4(); const pg = mkPage(W); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take(); const had = pg.map().whiteboard.some(w => w.id === 's1'); W.camp.items.mA.whiteboard = W.camp.items.mA.whiteboard.filter(w => w.id !== 's1'); gmSave(W); pg.take(); return [had, pg.map().whiteboard.some(w => w.id === 's1')]; })();
        const gmFirst = (() => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); W.tok('tA').x = 400; pg.feed({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tA', x: 400, y: 100, rot: 0, front: 0, final: true }); gmSave(W); pg.take(); return pg.tok('tA').x; })();
        const liveNone = (() => { const W = mk4(); const pg = mkPage(W); const t = pg.tok('tA'); t.x = 180; pg.net.streamPos(t, false, 'mA'); const m = pg.inbox[0]; return [m && m.type, m && ('a' in m), Object.keys(pg.P.rec().pend).length]; })();
        const overTop = (() => { const W = mk4(); const pg = mkPage(W); pg.drop('tA', 250, 100); gmSave(W); const m = W.a1.sent.filter(x => x.type === 'item').pop(); W.a1.sent.length = 0; m.ack = 2 ** 40; pg.feed(m); return Object.keys(pg.P.rec().pend.mA.t).length; })();
        check('14c K2: a delta that crosses her drop gets it written back; a drawing the host has taken is forgotten from the record, so the GM\'s later erase shows; the GM moving her token forgets her drop\'s record at once, so a copy made meanwhile is taken as it comes; a live move carries no number and records nothing; a number past the top leaves the record as it was',
            deltaCross === 250 && J(gmErase) === J([true, false]) && gmFirst === 400 && J(liveNone) === J(['pos', false, 0]) && overTop === 1, J([deltaCross, gmErase, gmFirst, liveNone, overTop]));
        const actSrc = bw('actlog', 'netfog.js').replace(/\/\/[^\n]*/g, '');
        check('14c K2: an unfogged map\'s copy for her is written back as a fogged one is (and not by a host that says nothing); a number that is no whole number from 0 to 2^31-1 (or none) writes nothing back; the highest number writes nothing back and forgets the record; the record holds at most sixteen maps, the oldest going first; forgetting it keeps the count going up; nothing in the record reaches markup, and the snapshot and leaving forget it',
            openCross(false) === 250 && openCross(true) === 100 && J(bad) === J([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]) && J(big) === J([100, 0]) && J(cap) === J([16, 'm4', 16]) && J(forgot) === J([1, 2, 1])
            && !/innerHTML|insertAdjacentHTML|outerHTML|setAttribute/.test(actSrc) && /net\.syncedPeer = conn\.peer;[^\n]*\n\s*if \(typeof actForget === 'function'\) actForget\(\);/.test(src) && /var wasHost = net\.active && net\.role === 'host';\n\s*if \(typeof actForget === 'function'\) actForget\(\);/.test(src),
            J([openCross(false), openCross(true), bad, big, cap, forgot]));
        // hidden pieces (owner, 2026-10-01) on a map without fog, with the real itemDelta and a real player page: the hide goes out as a delta that
        // names the piece in del alone, a move of the hidden piece sends nothing, Show sets it back in the host's order
        const dW = () => { const W = mk4({ realDelta: true }); W.camp.items.mA.fog.on = false; const pg = mkPage(W); gmSave(W); pg.take(); W.clearSent(); return { W, pg }; };   // the first send to all is whole: the baseline
        const has = (pg, id) => pg.map().whiteboard.some(w => w.id === id), kindsOf = c => c.sent.map(m => m.type).filter(t => t !== 'pos'), wb = m => (m && m.whiteboard) || {};
        const hd = (() => { const { W, pg } = dW(); W.tok('orc').hidden = true; gmSave(W); const m1 = W.a1.sent.slice(); pg.take(); const page1 = pg.map().whiteboard.map(w => w.id);
            W.clearSent(); W.tok('orc').x = 999; gmSave(W); const moved = W.net.conns.map(c => kindsOf(c).length);
            W.tok('orc').hidden = false; gmSave(W); const m2 = W.a1.sent.slice(); pg.take();
            return { k1: m1.map(m => m.type), del1: wb(m1[0]).del, set1: (wb(m1[0]).set || []).map(w => w.id), order1: wb(m1[0]).order, raw1: J(m1), page1, moved, k2: m2.map(m => m.type), set2: (wb(m2[0]).set || []).map(w => [w.id, w.x]), order2: wb(m2[0]).order, page2: pg.map().whiteboard.map(w => w.id), host: W.camp.items.mA.whiteboard.map(w => w.id) }; })();
        check('hidden pieces (a map without fog, the real itemDelta and a real player page): the hide goes out as a delta naming the piece in del alone — no item of its id, no mark of a hidden thing — and it leaves her page; the GM moving it while hidden sends nothing to anyone; Show sets it back at its new place with the host\'s own order, which her page then holds',
            J(hd.k1) === J(['itemDelta']) && J(hd.del1) === J(['orc']) && J(hd.set1) === J([]) && J(hd.order1) === J(['tA', 'tB']) && !/\{"id":"orc"|"hidden"/.test(hd.raw1) && J(hd.page1) === J(['tA', 'tB']) && J(hd.moved) === J([0, 0, 0, 0])
            && J(hd.k2) === J(['itemDelta']) && J(hd.set2) === J([['orc', 999]]) && J(hd.order2) === J(['tA', 'tB', 'orc']) && J(hd.page2) === J(['tA', 'tB', 'orc']) && J(hd.host) === J(['tA', 'tB', 'orc']), J(hd));
        // a player's own drawing the GM hid: (a) her patch made while it was hidden lands after the GM shows it — nothing erased, her screen put right
        // with the map whole saying her patch's number, and an erase of hers right after that is an erase; (b) her patch made before the hide reached
        // her, naming it, leaves no ghost on her screen; (c) a hide and a show with no patch crossing: her next patch names it, then her erase erases
        const ea = (() => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            const s1 = W.camp.items.mA.whiteboard.find(w => w.id === 's1'); s1.hidden = true; gmSave(W); pg.take(); const gone = has(pg, 's1'), rec = J(W.api.hid());
            pg.drop('tA', 250, 100); pg.save();   // her patch, made from a copy without s1, on its way
            s1.hidden = false; W.clearSent(); gmSave(W); pg.take(); const shownMid = has(pg, 's1');   // the show reaches her first: her app drops the drawing her patch did not know of
            W.clearSent(); pg.host(); const hostHas = has({ map: () => W.camp.items.mA }, 's1'), wholes = W.a1.sent.filter(m => m.type === 'item').map(m => [m.ack, m.item.whiteboard.map(w => w.id).join()]), others = kindsOf(W.b1), recAfter = J(W.api.hid());
            pg.take(); const pageHas = has(pg, 's1');
            W.clearSent(); pg.tok('tA').x = 150; pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); pg.host(); const erased = !has({ map: () => W.camp.items.mA }, 's1'), wholes2 = W.a1.sent.filter(m => m.type === 'item').length;   // her erase, with her next move (a copy equal to her last patch is not sent again)
            return { gone, rec, shownMid, hostHas, wholes, others, recAfter, pageHas, erased, wholes2 }; })();
        const gh = (() => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            pg.drop('tA', 250, 100); pg.save();   // her patch, naming s1, on its way
            const s1 = W.camp.items.mA.whiteboard.find(w => w.id === 's1'); s1.hidden = true; W.clearSent(); gmSave(W); pg.take(); const ghost = has(pg, 's1');
            W.clearSent(); pg.host(); const wholes = W.a1.sent.filter(m => m.type === 'item').map(m => [m.ack, m.item.whiteboard.map(w => w.id).join()]); pg.take(); const after = has(pg, 's1'), hostHid = s1.hidden === true && W.camp.items.mA.whiteboard.indexOf(s1) >= 0;
            W.clearSent(); pg.tok('tA').x = 150; pg.save(); pg.host(); const again = W.a1.sent.filter(m => m.type === 'item').length; pg.take(); const later = has(pg, 's1');
            return { ghost, wholes, after, hostHid, again, later }; })();
        const nm = (() => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            const s1 = W.camp.items.mA.whiteboard.find(w => w.id === 's1'); s1.hidden = true; gmSave(W); pg.take(); s1.hidden = false; gmSave(W); pg.take(); const back = has(pg, 's1');
            W.clearSent(); pg.drop('tA', 250, 100); pg.save(); pg.host(); const wholes = W.a1.sent.filter(m => m.type === 'item').length, rec = J(W.api.hid());   // her copy names it: the record forgets it
            pg.take(); pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); pg.host(); const erased = !has({ map: () => W.camp.items.mA }, 's1');
            return { back, wholes, rec, erased }; })();
        check('hidden pieces (a player\'s own drawing the GM hid; the real patch gate, sends, itemDelta and player page): (a) her map copy made while it was hidden that lands after the GM shows it erases nothing — the host remembers, per connection of hers, the drawings of hers it hid — and she is sent the map whole saying her patch\'s number, which puts the drawing her app had dropped back on her screen; her erase with her next move is an erase (the record forgot the id with that copy); nobody else gets a whole map',
            ea.gone === false && ea.rec === J({ pA1: { mA: { s1: 1 } }, pA2: { mA: { s1: 1 } } }) && ea.shownMid === false && ea.hostHas === true && J(ea.wholes) === J([[3, 'tA,tB,orc,s1']]) && J(ea.others) === J([]) && ea.recAfter === J({ pA1: { mA: {} }, pA2: { mA: { s1: 1 } } }) && ea.pageHas === true && ea.erased === true && ea.wholes2 === 0, J(ea));
        check('hidden pieces (a player\'s own drawing the GM hid): (b) her copy made before the hide reached her names the drawing, and her app had written it back over the hide — she is sent the map whole saying her patch\'s number and the ghost goes, the host\'s drawing still hidden and in place; her next copy without it erases nothing and brings no whole map; (c) a hide and a show no patch crosses: the drawing is back on her screen, her next copy names it and brings no whole map (the record forgets it), and her erase after that is an erase',
            gh.ghost === true && J(gh.wholes) === J([[3, 'tA,tB,orc']]) && gh.after === false && gh.hostHid === true && gh.again === 0 && gh.later === false
            && nm.back === true && nm.wholes === 0 && nm.rec === J({ pA1: { mA: {} }, pA2: { mA: { s1: 1 } } }) && nm.erased === true, J([gh, nm]));
        // The owed review, 2026-10-09 (backlog 135): a drawing of hers the GM deleted and then brought back by Undo. Her copy made before the restored
        // map reached her lacks it: it is no erase — the undo tells the host which drawings it brought back (net.strokesBack) — and her screen is put
        // right with the map whole. Run twice: with that word, and without it (the same copy then erases the drawing, as it did before)
        const ub = told => (() => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            const hm = W.camp.items.mA, s1 = hm.whiteboard.find(w => w.id === 's1'), onHost = () => has({ map: () => hm }, 's1'), wholesNow = () => W.a1.sent.filter(m => m.type === 'item').map(m => [m.ack, m.item.whiteboard.map(w => w.id).join()]);
            hm.whiteboard.splice(hm.whiteboard.indexOf(s1), 1); gmSave(W); pg.take(); const held = has(pg, 's1');   // the GM deletes it: it leaves her page
            pg.drop('tA', 250, 100); pg.save(); pg.tok('tA').x = 260; pg.save();   // TWO patches of hers, each made from a copy without s1, on their way
            hm.whiteboard.push(s1); if (told) W.net.strokesBack('mA', told); const rec = J(W.api.hid()); W.clearSent(); gmSave(W); pg.take();   // the GM's Undo: the drawing is back and the host is told which; the map reaches her before her patches reach the host
            W.clearSent(); pg.host(); const hostHas = onHost(), wholes = wholesNow(), others = kindsOf(W.b1), recAfter = J(W.api.hid());
            pg.take(); const pageHas = has(pg, 's1');
            W.clearSent(); pg.tok('tA').x = 150; pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); pg.host(); const soon = onHost(), wholesSoon = wholesNow().length;   // her own erase while the note's time runs: kept once more, her screen put right
            pg.take(); W.now += 5001; W.clearSent(); pg.tok('tA').x = 140; pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); pg.host(); const erased = !onHost(), recEnd = J(W.api.hid());   // ... and once it is over, her erase is an erase
            return { held, rec, hostHas, wholes, others, recAfter, pageHas, soon, wholesSoon, erased, recEnd }; })();
        const ubY = ub([{ id: 's1', ownerId: 'u_a' }, { id: 's9', ownerId: 'u_b' }, null, { id: 7, ownerId: 'u_a' }, { id: 's8' }, { id: '', ownerId: 'u_a' }, { id: 's7', ownerId: '' }, { id: 's6', ownerId: 'u_zz' }]), ubN = ub(null);
        const ubRole = (() => { const { W } = dW(); W.net.role = 'client'; W.net.strokesBack('mA', [{ id: 's1', ownerId: 'u_a' }]); const asPlayer = J(W.api.hid()); W.net.role = 'host'; W.net.strokesBack(7, [{ id: 's1', ownerId: 'u_a' }]); W.net.strokesBack('', [{ id: 's1', ownerId: 'u_a' }]); W.net.strokesBack('mA', 'x'); W.net.strokesBack('mA', null); return [asPlayer, J(W.api.hid())]; })();
        // a copy of hers that names the drawing forgets the note at once: her erase right after it is an erase, with no wait
        const ubNamed = (() => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            const hm = W.camp.items.mA, s1 = hm.whiteboard.find(w => w.id === 's1'); hm.whiteboard.splice(hm.whiteboard.indexOf(s1), 1); gmSave(W); pg.take();
            W.now = 7000; hm.whiteboard.push(s1); W.net.strokesBack('mA', [{ id: 's1', ownerId: 'u_a' }]); const rec = J(W.api.hid()); gmSave(W); pg.take();
            pg.drop('tA', 250, 100); pg.save(); pg.host(); const recNamed = J(W.api.hid()); pg.take();
            pg.tok('tA').x = 150; pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); pg.host(); return { rec, recNamed, erased: !has({ map: () => hm }, 's1') }; })();
        const NOTE0 = { at: 0 };
        check('a drawing the GM\'s undo brought back (the owed review of 2026-10-09; the real patch gate, sends, itemDelta and player page): her map copies made before the restored map reached her lack the drawing and erase nothing, the second as the first — the host was told which drawings the step brought back and notes each, with its time, for every connection of its player, and nothing for a word with no id, no player or a player who is not at the table — and each is answered with the map whole saying that patch\'s number, which puts the drawing back on her screen, while everybody else gets only the move her second patch made, as a delta; while the note\'s time runs her own erase is kept once more, and once it is over her erase is an erase and the note is gone; a copy of hers that names the drawing forgets the note at once; without the host being told, the very same copy erases the drawing; a player\'s app notes nothing, nor does a word that names no map or is no list',
            ubY.held === false && ubY.rec === J({ pA1: { mA: { s1: NOTE0 } }, pA2: { mA: { s1: NOTE0 } }, pB: { mA: { s9: NOTE0 } } }) && ubY.hostHas === true && J(ubY.wholes) === J([[3, 'tA,tB,orc,s1'], [4, 'tA,tB,orc,s1']]) && J(ubY.others) === J(['itemDelta']) && ubY.recAfter === ubY.rec && ubY.pageHas === true
            && ubY.soon === true && ubY.wholesSoon === 1 && ubY.erased === true && ubY.recEnd === J({ pA1: { mA: {} }, pA2: { mA: { s1: NOTE0 } }, pB: { mA: { s9: NOTE0 } } })
            && ubN.rec === '{}' && ubN.hostHas === false && J(ubRole) === J(['{}', '{}'])
            && ubNamed.rec === J({ pA1: { mA: { s1: { at: 7000 } } }, pA2: { mA: { s1: { at: 7000 } } } }) && ubNamed.recNamed === J({ pA1: { mA: {} }, pA2: { mA: { s1: { at: 7000 } } } }) && ubNamed.erased === true, J([ubY, ubN, ubRole, ubNamed]));
        // 49 (c) (the owner, by prompt, 2026-10-06: "Lock it for its player"): a drawing of hers the GM made a wall, or a see-through barrier, end
        // to end — the real patch gate, sends, itemDelta, the real fogcore's judge and her real page. The tick reaches her page; a copy of hers
        // that leaves the line out erases nothing on the host and she is sent the map whole saying her patch's number, so her screen holds the
        // line again (nobody else gets a whole map); a copy that redraws it is answered the same way; a copy that names it as it stands brings
        // no whole map; once the GM unticks it, the same copy erases it
        const wallLock = flag => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            const s1 = W.camp.items.mA.whiteboard.find(w => w.id === 's1'); if (flag === 'wall') { s1.blocksSight = true; s1.sightType = 'wall'; } else s1.barrier = true;
            gmSave(W); pg.take(); const onPage = pg.tok('s1') ? [pg.tok('s1').blocksSight === true, pg.tok('s1').barrier === true] : null;
            W.clearSent(); pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); const sentA = pg.host(), aA = +String(sentA[sentA.length - 1]).split(':')[1];   // her copy without the line
            const hostHas = has({ map: () => W.camp.items.mA }, 's1'), wholes = W.a1.sent.filter(m => m.type === 'item').map(m => [m.ack === aA, m.item.whiteboard.some(w => w.id === 's1')]), others = kindsOf(W.b1);
            pg.take(); const back = has(pg, 's1');
            W.clearSent(); pg.tok('s1').pts = [[0, 0], [7, 3]]; pg.tok('s1').x = 44; pg.save(); pg.host();   // her copy with the line redrawn and moved
            const hostLine = J(s1.pts) + '@' + s1.x, wholes2 = W.a1.sent.filter(m => m.type === 'item').length; pg.take(); const pageLine = J(pg.tok('s1').pts) + '@' + pg.tok('s1').x;
            W.clearSent(); pg.tok('tA').x = 180; pg.save(); pg.host(); const wholes3 = W.a1.sent.filter(m => m.type === 'item').length, flagKept = flag === 'wall' ? s1.blocksSight === true : s1.barrier === true; pg.take();   // a copy that names the line as it stands
            delete s1.blocksSight; delete s1.sightType; delete s1.barrier; gmSave(W); pg.take(); const offPage = pg.tok('s1') ? [pg.tok('s1').blocksSight === true, pg.tok('s1').barrier === true] : null;
            W.clearSent(); pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.tok('tA').x = 200; pg.save(); pg.host(); const erased = !has({ map: () => W.camp.items.mA }, 's1'), wholes4 = W.a1.sent.filter(m => m.type === 'item').length;
            return { onPage, hostHas, wholes, others, back, hostLine, wholes2, pageLine, wholes3, flagKept, offPage, erased, wholes4 }; };
        const wlW = wallLock('wall'), wlB = wallLock('barrier'), wlWant = on => J({ onPage: on, hostHas: true, wholes: [[true, true]], others: [], back: true, hostLine: '[[0,0],[10,10]]@10', wholes2: 1, pageLine: '[[0,0],[10,10]]@10', wholes3: 0, flagKept: true, offPage: [false, false], erased: true, wholes4: 0 });
        check('49 (c) a wall drawing, end to end (the real patch gate, sends, itemDelta, the real fogcore and her real page): the GM\'s tick reaches her page; her copy without the line erases nothing on the host, and she is sent the map whole saying her patch\'s number, which puts the line back on her screen, while nobody else gets a whole map; her copy with the line redrawn and moved leaves the host\'s line as it was and is answered the same way, her page then holding the host\'s line; a copy that names it as it stands brings no whole map; the flag is the GM\'s throughout; unticked, the line is hers again and the same copy erases it — for a wall and for a see-through barrier alike',
            J(wlW) === wlWant([true, false]) && J(wlB) === wlWant([false, true]), J([wlW, wlB]));
        // Round three of Match a wall: the same, of a drawing the GM made a wall or a see-through barrier AND locked. Her page's copy of it says no
        // lock (no plain wall carries one to players), so until round three a copy of hers without the line was answered with nothing: the host
        // kept the line and her screen did not. Now it is answered as for any held wall. A drawing that is locked and no wall says locked on her
        // page, and a copy without it is still answered with nothing
        const lockedWall = flag => { const { W, pg } = dW(); pg.map().whiteboard.push(stroke('s1', 10)); pg.save(); pg.host(); gmSave(W); pg.take();
            const s1 = W.camp.items.mA.whiteboard.find(w => w.id === 's1'); if (flag === 'wall') { s1.blocksSight = true; s1.sightType = 'wall'; } else if (flag === 'barrier') s1.barrier = true; s1.locked = true;
            gmSave(W); pg.take(); const onPage = pg.tok('s1') ? [pg.tok('s1').blocksSight === true, pg.tok('s1').barrier === true, 'locked' in pg.tok('s1')] : null;
            W.clearSent(); pg.map().whiteboard = pg.map().whiteboard.filter(w => w.id !== 's1'); pg.save(); const sentA = pg.host(), aA = +String(sentA[sentA.length - 1]).split(':')[1];   // her copy without the line
            const hostHas = has({ map: () => W.camp.items.mA }, 's1'), wholes = W.a1.sent.filter(m => m.type === 'item').map(m => [m.ack === aA, m.item.whiteboard.some(w => w.id === 's1'), m.item.whiteboard.some(w => w.id === 's1' && 'locked' in w)]), others = kindsOf(W.b1);
            pg.take(); const back = has(pg, 's1'); if (!back) return { onPage, hostHas, wholes, others, back };
            W.clearSent(); pg.tok('s1').pts = [[0, 0], [7, 3]]; pg.tok('s1').x = 44; pg.save(); pg.host();   // her copy with the line redrawn and moved
            const hostLine = J(s1.pts) + '@' + s1.x, wholes2 = W.a1.sent.filter(m => m.type === 'item').length; pg.take(); const pageLine = J(pg.tok('s1').pts) + '@' + pg.tok('s1').x;
            W.clearSent(); pg.tok('tA').x = 180; pg.save(); pg.host(); const wholes3 = W.a1.sent.filter(m => m.type === 'item').length, kept = s1.locked === true && (flag === 'wall' ? s1.blocksSight === true : s1.barrier === true); pg.take();   // a copy that names the line as it stands
            return { onPage, hostHas, wholes, others, back, hostLine, wholes2, pageLine, wholes3, kept }; };
        const lwW = lockedWall('wall'), lwB = lockedWall('barrier'), lwN = lockedWall('none'), lwWant = on => J({ onPage: on, hostHas: true, wholes: [[true, true, false]], others: [], back: true, hostLine: '[[0,0],[10,10]]@10', wholes2: 1, pageLine: '[[0,0],[10,10]]@10', wholes3: 0, kept: true });
        check('49 (c) a wall drawing the GM also locked, end to end (round three of Match a wall; the real patch gate, sends, itemDelta, the real fogcore and her real page): the GM\'s tick reaches her page and the lock does not, since no plain wall carries one to players; her copy without the line erases nothing on the host, and she is sent the map whole saying her patch\'s number, which puts the line back on her screen, still with no lock said, while nobody else gets a whole map; her copy with the line redrawn and moved leaves the host\'s line as it was and is answered the same way, her page then holding the host\'s line; a copy that names it as it stands brings no whole map; the lock and the flag are the GM\'s throughout, for a wall and for a see-through barrier alike. A drawing of hers that is locked and no wall says locked on her page, and her copy without it erases nothing on the host and is answered with nothing, as before',
            J(lwW) === lwWant([true, false, false]) && J(lwB) === lwWant([false, true, false]) && J(lwN) === J({ onPage: [false, false, true], hostHas: true, wholes: [], others: [], back: false }), J([lwW, lwB, lwN]));
        // the record: made at a send of the map (whole or a delta) and at a join, for each connection of the drawing's owner; forgotten with the connection, the map and the table; its source
        const rc = (() => { const W = mk4({ realDelta: true }); W.camp.items.mA.fog.on = false; W.camp.items.mA.whiteboard.push(Object.assign(stroke('s1', 10), { hidden: true }), Object.assign(stroke('s2', 20), { hidden: 1, ownerId: 'u_b' }));
            W.net.sendItem('k', 'mA'); const r1 = J(W.api.hid()); W.net.broadcastItemFiltered('k', 'mB'); const r2 = J(W.api.hid()); W.net.broadcastItemFiltered('k', 'mA'); const r3 = J(W.api.hid());
            W.api.forgetConn('pA2'); const r4 = J(W.api.hid()); W.net.itemGone('k', 'mA'); const r5 = J(W.api.hid()); W.net.sendItem('k', 'mA'); W.api.forgetAll(); const r6 = J(W.api.hid()); return { r1, r2, r3, r4, r5, r6 }; })();
        check('hidden pieces (the record): a send of a map notes each hidden drawing of a player\'s for every connection of theirs — hidden as true or as 1, never for another player\'s connections nor a peer not admitted — whole or filtered alike, another map adding nothing; a closed connection, the map gone and a new table forget it; the join notes every map of the hosted campaign after the snapshot went, and the record lives in the host\'s memory alone (never saved, never sent)',
            rc.r1 === J({ pA1: { mA: { s1: 1 } }, pA2: { mA: { s1: 1 } }, pB: { mA: { s2: 1 } } }) && rc.r2 === rc.r1 && rc.r3 === rc.r1 && rc.r4 === J({ pA1: { mA: { s1: 1 } }, pB: { mA: { s2: 1 } } }) && rc.r5 === J({ pA1: {}, pB: {} }) && rc.r6 === '{}'
            && /if \(snapOk && typeof hidNoteAll === 'function'\) hidNoteAll\(\);/.test(src) && (src.match(/hidNote\(it\)/g) || []).length === 2 && !/_hidPend/.test((sa => sa.slice(sa.indexOf('function sanitizeAppState('), sa.indexOf('function fogNow()')))(require('./checkkit').part('netfog.js'))), J(rc));   // sanitizeAppState stands in netfog.js
    }
    // fold M7: the landing. A copy caught up in place after a move lands; every connection's copy then equals a fresh copy judged for it
    const fresh7 = (W, pid, mapId) => W.api.landed(null, () => { const m = W.camp.items[mapId || 'mA'], out = W.api.copy(W.api.clean(m), W.camp, m, pid); return { ids: out.whiteboard.map(w => w.id), fogLit: FCx.cleanFogLit(out.fogLit) || null, cap: out.lightsCapped === true }; });
    const agree = (W, conns, mapId) => (conns || [W.a1, W.a2, W.b1]).every(c => J(W.view(c, mapId)) === J(fresh7(W, W.net.roster[c.peer].id, mapId)) && W.asks(c).length === 0);
    const kinds = c => c.sent.map(m => m.type).filter(t => t !== 'pos');   // the live relay's moves aside
    const S7 = o => { const W = mk4(o); W.net.conns.forEach(c => { ['mA', 'mB', 'mO', 'mC'].forEach(id => W.net.sendItem('k', id, c)); c.sent.length = 0; }); return W; };
    const G = S7(); const pin7 = agree(G) && agree(G, null, 'mB');
    G.move(G.a1, 'tA', 250, 100, false); G.move(G.a1, 'tA', 250, 100, true); const armed7 = G.timers.filter(t => t.fn && t.ms === 150).length, before7 = [kinds(G.a1), kinds(G.a2), kinds(G.b1)];
    G.fire(150); const land7 = { a1: kinds(G.a1), a2: kinds(G.a2), b: kinds(G.b1), add: (G.a1.sent[0] && G.a1.sent[0].add || []).map(a => a.item.id), orc: G.a1.sent[0] && G.a1.sent[0].add && G.a1.sent[0].add[0].item, agree: agree(G) };
    const orcFresh = G.api.landed(null, () => G.api.copy(G.api.clean(G.camp.items.mA), G.camp, G.camp.items.mA, 'u_a').whiteboard.find(w => w.id === 'orc'));
    G.net.conns.forEach(c => { c.sent.length = 0; }); G.move(G.a1, 'tA', 100, 100, false); G.move(G.a1, 'tA', 100, 100, true); G.fire(150);
    const out7 = { a1: G.a1.sent.map(m => m.type + ':' + J(m.drop || m.add || '')), b: kinds(G.b1), agree: agree(G) };
    check('fold M7: a drop that lands where the mover now sees the orc catches their copies up in place at the fire and not before: each of their connections gets one fogDiff adding the orc exactly as a fresh copy carries it, nobody gets a whole map, a player whose sight did not change gets nothing; walking back takes it out again; every copy then equals a fresh copy judged for it (the real player pages applying what arrived)',
        pin7 && armed7 === 1 && J(before7) === J([[], [], []]) && J(land7.a1) === J(['fogDiff']) && J(land7.a2) === J(['fogDiff']) && J(land7.b) === J([]) && J(land7.add) === J(['orc']) && J(land7.orc) === J(orcFresh) && land7.agree
        && J(out7.a1) === J(['fogDiff:["orc"]']) && J(out7.b) === J([]) && out7.agree,
        J([pin7, armed7, before7, land7, out7]));

    // the player walked away from, and up to again; content: a GM-hidden creature is in no catch-up, nothing of the GM's rides along, no own token
    const H = S7(); H.camp.items.mA.whiteboard.push(T('ghost', '', 'c_n', 12, 20, { hidden: true, gmInfo: 'secret', sheet: { a: 1 }, frame: { src: 'k' } }));
    H.net.conns.forEach(c => { H.net.sendItem('k', 'mA', c); c.sent.length = 0; });
    H.move(H.a1, 'tA', 100, 1000, true); H.fire(150); const away = { b: H.b1.sent.filter(m => m.type !== 'pos').map(m => m.type + ':' + J(m.drop || '')), a: H.a1.sent.map(m => (m.add || []).map(a => a.item.id).join(',') + '/' + J(m.drop || [])), ghost: ((H.a1.sent[0] || {}).add || []).map(a => a.item).find(i => i.id === 'ghost'), agree: agree(H) };
    H.net.conns.forEach(c => { c.sent.length = 0; }); H.move(H.a1, 'tA', 100, 100, true); H.fire(150); const backM7 = { b: H.b1.sent.filter(m => m.type === 'fogDiff').map(m => (m.add || []).map(a => a.item.id + '@' + a.item.x + ',' + a.item.y + '<' + a.after).join(',')), agree: agree(H) };
    const all7 = H.net.conns.concat([]).reduce((acc, c) => acc.concat(c.sent.filter(m => m.type === 'fogDiff')), []).concat(G.a1.sent);
    const noOwn = [G, H].every(W => W.net.conns.every(c => c.sent.filter(m => m.type === 'fogDiff').every(m => (m.add || []).every(a => a.item.ownerId !== (W.net.roster[c.peer] || {}).id) && (m.drop || []).every(id => { const t = W.tok(id); return !t || t.ownerId !== (W.net.roster[c.peer] || {}).id; }))));
    check('fold M7: the player walked away from loses the mover\'s token and the one walked up to gets it back at the host\'s own place, after what their copy holds; a creature the GM hid, though in the mover\'s sight, is in no catch-up (no item, no id); no catch-up carries a GM note, a sheet, a kept original or anyone\'s own token',
        J(away.b) === J(['fogDiff:["tA"]']) && J(away.a) === J(['/["tB"]']) && away.ghost === undefined && !/ghost/.test(J(H.net.conns.map(c => c.sent))) && away.agree
        && J(backM7.b) === J(['tA@100,100<null']) && backM7.agree && noOwn && !/secret|"sheet"|"gmInfo"|"frame"|gmNoteFor/.test(J(all7)),
        J([away, backM7]));

    // hidden pieces: a hidden piece that is no creature (a trap tile) standing right before the creature a catch-up adds is never the place the add names
    const Hz = S7(); const wbZ = Hz.camp.items.mA.whiteboard; wbZ.splice(wbZ.findIndex(w => w.id === 'orc'), 0, { id: 'trapz', type: 'rect', hidden: 1, trap: true, targetMapId: 'mB', x: 700, y: 100, w: 50, h: 50 });
    Hz.net.conns.forEach(c => { Hz.net.sendItem('k', 'mA', c); c.sent.length = 0; });
    Hz.move(Hz.a1, 'tA', 250, 100, false); Hz.move(Hz.a1, 'tA', 250, 100, true); Hz.fire(150);
    const anchorZ = Hz.a1.sent.filter(m => m.type === 'fogDiff').map(m => (m.add || []).map(a => a.item.id + '<' + a.after));
    check('hidden pieces (the catch-up\'s anchor): a hidden trap tile standing right before the orc in the stacking order is never the place a catch-up names for it (the add comes after the last piece the copy holds), and nothing of the tile is on the wire; every copy still equals a fresh one',
        J(anchorZ) === J([['orc<tB']]) && !/trapz|700/.test(J(Hz.net.conns.map(c => c.sent))) && agree(Hz), J([anchorZ]));
    // hidden pieces in the one-module world (real player pages): hiding takes a piece out of every copy and showing puts it back, on a map
    // without fog (its whole copies here; its deltas with the real itemDelta above, 14c K2) and on a fogged one (whole copies); and a creature a copy holds that the GM hides leaves at the next catch-up
    const hasOrc = W => [W.a1, W.a2, W.b1].map(c => W.view(c).ids.indexOf('orc') >= 0), rawSent = W => J(W.net.conns.map(c => c.sent));
    const wHid = S7(); wHid.camp.items.mA.fog.on = false; wHid.net.sendItem('k', 'mA'); const hid0 = hasOrc(wHid);
    wHid.tok('orc').hidden = true; wHid.clearSent(); wHid.net.sendItem('k', 'mA'); const hid1 = hasOrc(wHid), hidRaw = rawSent(wHid);
    wHid.tok('orc').hidden = false; wHid.clearSent(); wHid.net.sendItem('k', 'mA'); const hid2 = hasOrc(wHid), hidOrder = J(wHid.view(wHid.b1).ids) === J(wHid.camp.items.mA.whiteboard.filter(w => !w.gmNoteFor && !w.hidden).map(w => w.id));
    check('hidden pieces (a map without fog, the real sends and player pages): everyone holds the orc; the GM hides it and it leaves every copy, with no item of that id and no mark of a hidden thing on the wire; shown again it is back, in the host\'s own stacking order though the copies had lost it',
        J(hid0) === J([true, true, true]) && J(hid1) === J([false, false, false]) && !/\{"id":"orc"|"hidden"/.test(hidRaw) && J(hid2) === J([true, true, true]) && hidOrder, J([hid0, hid1, hid2, hidOrder, hidRaw.slice(0, 300)]));
    const Hd = S7(); Hd.move(Hd.a1, 'tA', 250, 100, false); Hd.move(Hd.a1, 'tA', 250, 100, true); Hd.fire(150); const held0 = hasOrc(Hd);
    Hd.tok('orc').hidden = true; Hd.net.conns.forEach(c => { c.sent.length = 0; }); Hd.move(Hd.a1, 'tA', 300, 100, false); Hd.move(Hd.a1, 'tA', 300, 100, true); Hd.fire(150);
    const hidCu = { diffs: Hd.a1.sent.filter(m => m.type === 'fogDiff').map(m => J((m.add || []).map(a => a.item.id)) + '/' + J(m.drop || [])), has: hasOrc(Hd), agree: agree(Hd) };
    check('hidden pieces (a fogged map, the catch-up): a creature the mover\'s copies hold that the GM has hidden since is taken out by the next catch-up — though it stands in their sight — and every copy then equals a fresh one',
        J(held0) === J([true, true, false]) && J(hidCu.diffs) === J(['[]/["orc"]']) && J(hidCu.has) === J([false, false, false]) && hidCu.agree, J([held0, hidCu]));

    // arming: what arms the fire and what does not
    const armN = W => W.timers.filter(t => t.fn && t.ms === 150).length;
    const A1 = mk4(); A1.move(A1.a1, 'tA', 101, 100, true); const onePx = armN(A1);
    const A2 = mk4(); A2.move(A2.a1, 'tA', 250, 100, false); A2.move(A2.a1, 'tA', 100, 100, true); const outBack = armN(A2);
    const A3 = mk4(); A3.move(A3.a1, 'tA', 250, 100, false); A3.move(A3.a1, 'tA', 251, 100, true); const stays = armN(A3);
    const A4 = mk4({ wall: () => true }); for (let i = 0; i < 20; i++) A4.move(A4.a1, 'tA', 250 + i, 100, true); const refusedN = armN(A4);
    const pat = (W, props) => W.api.patch({ type: 'item', campId: 'k', itemId: 'mA', item: { type: 'map', whiteboard: [Object.assign({ id: 'tA', x: 100, y: 100, rot: 0, front: 0 }, props)] } }, { id: 'u_a' });
    const P1 = mk4(); pat(P1, { x: 101 }); const pOnePx = armN(P1); const P2 = mk4(); pat(P2, { x: 250 }); const pCell = armN(P2);
    const P3 = mk4(); pat(P3, { posture: 'crouching' }); const pPost = armN(P3); const P4 = mk4(); pat(P4, { elevation: 3 }); const pElev = armN(P4);
    const P5 = mk4({ wall: (fx, fy, tx) => tx >= 400 }); P5.move(P5.a1, 'tA', 300, 100, false); pat(P5, { x: 450 }); const pBack = [armN(P5), P5.place('tA')];
    const B1 = S7(); B1.move(B1.a1, 'tA', 250, 100, false); B1.move(B1.b1, 'tB', 100, 300, true); B1.fire(150); const midA = kinds(B1.a1); B1.move(B1.a1, 'tA', 250, 100, true); const armedAgain = armN(B1); B1.fire(150); const afterA = kinds(B1.a1);
    check('fold M7: a landing arms the fire only where it sees from differently than where the drag began (a 1 px drop in the cell, and a drag that went out and came back to its cell and facing, arm nothing; one that lands elsewhere arms even where the drop keeps the last move\'s cell); refused drops arm nothing; a map copy arms where it moved a token to another cell or changed its posture or elevation, never for 1 px nor for a move put back; while one player\'s drag is open another\'s landing sends them nothing, and their own drop then arms and lands',
        onePx === 0 && outBack === 0 && stays === 1 && refusedN === 0 && pOnePx === 0 && pCell === 1 && pPost === 1 && pElev === 1 && J(pBack) === J([0, [100, 100, 0, 0]]) && J(midA) === J([]) && armedAgain === 1 && J(afterA) === J(['fogDiff']),
        J([onePx, outBack, stays, refusedN, pOnePx, pCell, pPost, pElev, pBack, midA, armedAgain, afterA]));

    // the GM's gesture, the timer's window, crossings with whole sends, a send that throws, two connections of one player
    const T1 = S7(); T1.move(T1.a1, 'tA', 250, 100, true); T1.net.sendItem('k', 'mA'); T1.net.conns.forEach(c => { c.sent.length = 0; }); T1.fire(150); const crossed = T1.net.conns.map(c => c.sent.length);
    const failed7 = [], T2 = S7({ failed: failed7 }); let thrown = 0; const realSend = T2.a1.send; T2.a1.send = function(m) { if (m.type === 'fogDiff' && !thrown++) throw new Error('packer'); return realSend.call(this, m); };
    T2.move(T2.a1, 'tA', 250, 100, true); T2.fire(150); const thrown7 = { a1: kinds(T2.a1), failed: failed7.slice(), rec: J(rec(T2, 'pA1', 'mA')) === J(want(T2, T2.a1, 'mA')), agree: agree(T2) };
    const T3 = S7(); T3.move(T3.a1, 'tA', 250, 100, true); T3.net.sendItem('k', 'mA', T3.a1); T3.net.conns.forEach(c => { c.sent.length = 0; }); T3.fire(150); const two7 = [kinds(T3.a1), kinds(T3.a2), agree(T3)];
    const T4 = S7(); T4.move(T4.a1, 'tA', 250, 100, true); for (let i = 0; i < 29; i++) T4.move(T4.a1, 'tA', 250 + 50 * (i % 3), 100, true); const one150 = T4.timers.filter(t => t.ms === 150).length; T4.fire(150); const oneEach = T4.net.conns.map(c => c.sent.filter(m => m.type === 'fogDiff').length);
    check('fold M7: the fire\'s window is 150 ms, growing with the last fire\'s cost up to 1 s (anything that is no positive number reads 0); thirty drops before a fire arm it once, and a fire sends each connection one message at most; a GM save between a landing and its fire leaves the fire nothing; a catch-up whose send throws is followed by exactly one whole copy to that connection, which is what is then recorded; a whole copy one connection asked for meanwhile leaves the player\'s other connection its own catch-up',
        J([undefined, NaN, -5, 0, 40, 300, 5000].map(c => T1.api.windowMs(c))) === J([150, 150, 150, 150, 160, 1000, 1000]) && one150 === 1 && J(oneEach) === J([1, 1, 0, 0])
        && J(crossed) === J([0, 0, 0, 0]) && J(thrown7.a1) === J(['item']) && J(thrown7.failed) === J(['packer']) && thrown7.rec && thrown7.agree && J(two7) === J([[], ['fogDiff'], true]),
        J([one150, oneEach, crossed, thrown7, two7]));
    const gw = S7(); gw.move(gw.a1, 'tA', 250, 100, true); gw.winRef.wpHostGesture = 'mA'; gw.fire(150); const held7 = [kinds(gw.a1), gw.timers.filter(t => t.fn && t.ms === 150).length]; gw.winRef.wpHostGesture = null; gw.fire(150); held7.push(kinds(gw.a1));
    check('fold M7: a fire that finds the GM\'s own gesture open on its map sends nothing and waits (armed again); once the gesture is over the next fire catches the copies up',
        J(held7) === J([[], 1, ['fogDiff']]), J(held7));

    // fallbacks to the whole copy, the roster after a change only, the lit cells, a hidden Sight
    const F1 = S7(); F1.api.forgetAll(); F1.move(F1.a1, 'tA', 250, 100, true); F1.fire(150); const noRec7 = [kinds(F1.a1), J(rec(F1, 'pA1', 'mA')) === J(want(F1, F1.a1, 'mA'))];
    const F2 = S7(); for (let i = 0; i < 201; i++) F2.camp.items.mA.whiteboard.push(T('m' + i, '', 'c_n', 15, 3)); F2.net.sendItem('k', 'mA'); F2.net.conns.forEach(c => { c.sent.length = 0; }); F2.move(F2.a1, 'tA', 250, 100, true); F2.fire(150); const many7 = kinds(F2.a1);
    const F3 = S7(); F3.camp.items.mA.whiteboard.push(T('big', '', 'c_n', 15, 3, { src: 'data:image/png;base64,' + 'A'.repeat(270000) })); F3.net.sendItem('k', 'mA'); F3.net.conns.forEach(c => { c.sent.length = 0; }); F3.move(F3.a1, 'tA', 250, 100, true); F3.fire(150); const big7 = kinds(F3.a1);
    const F4 = S7(); F4.camp.items.mA.whiteboard.push(T('x'.repeat(257), '', 'c_n', 15, 3)); F4.net.sendItem('k', 'mA'); F4.net.conns.forEach(c => { c.sent.length = 0; }); F4.move(F4.a1, 'tA', 250, 100, true); F4.fire(150); const long7 = kinds(F4.a1);
    const R7 = S7(); R7.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA' }, { id: 'r_o', name: 'Orc', tokId: 'orc' }] } }; R7.net.targets = { u_b: { id: 'orc', mapId: 'mA', name: 'Bea' } }; R7.net.roster.pA1.location = 'mA';   // fold 2: Ana is on mA
    R7.move(R7.a1, 'tA', 250, 100, true); R7.fire(150); const ros7 = { a1: kinds(R7.a1), rows: fightIn(R7.msg(R7.a1, 'combats').combats, 'mA').rows.map(r => r.name), targ: Object.keys(R7.msg(R7.a1, 'targets').targets), b: kinds(R7.b1) };
    R7.net.conns.forEach(c => { c.sent.length = 0; }); R7.move(R7.a1, 'tA', 100, 100, true); R7.fire(150); ros7.back = fightIn(R7.msg(R7.a1, 'combats').combats, 'mA').rows.map(r => r.name); ros7.backTarg = Object.keys(R7.msg(R7.a1, 'targets').targets);
    const R8 = S7(); R8.net.combats = { mO: { mapId: 'mO', round: 1, turn: 0, rows: [] } }; R8.move(R8.a1, 'tA', 250, 100, true); R8.fire(150); const noFight = kinds(R8.a1);
    const litB = S7({ fogLitFor: (pid, camp, map) => (pid === 'u_b' && map.id === 'mA' && map.whiteboard.find(w => w.id === 'tA').x > 200 ? { lit: [{ c: 9, r: 9, t: 2 }], capped: false } : null) });
    litB.net.conns.forEach(c => { litB.net.sendItem('k', 'mA', c); c.sent.length = 0; }); litB.move(litB.a1, 'tA', 250, 100, true); litB.fire(150); const lit7b = { b: litB.b1.sent.filter(m => m.type !== 'pos').map(m => m.type + ':' + J([m.add || null, m.drop || null, m.lit || null])), a: litB.a1.sent.map(m => J(m.lit || null)), view: litB.view(litB.b1).fogLit };
    litB.net.conns.forEach(c => { c.sent.length = 0; }); litB.move(litB.a1, 'tA', 100, 100, true); litB.fire(150); lit7b.off = litB.b1.sent.filter(m => m.type !== 'pos').map(m => J(m.lit)); lit7b.viewOff = litB.view(litB.b1).fogLit;
    const sysGm = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'gm' }] }, { F: Fx, gmView: true });
    const HS = S7({ system: sysGm }); HS.move(HS.a1, 'tA', 500, 100, true); HS.fire(150); const hidSight = kinds(HS.a1);   // her Sight GM-only: the default (6 cells) sees the orc from five cells
    check('fold M7: a copy the host holds no record of, more than 200 creatures to add, a message past 256 KB or an id past 256 characters each go as the whole copy, which is then recorded; the turn order and the pointers follow a change of what is held, only on a map with a fight or a pointer — a creature newly seen by its name, one no longer seen as Hidden; a light the player cannot see gives them its lit cells alone, and takes them away; a player whose Sight is GM-only still gets their landing',
        J(noRec7) === J([['item'], true]) && J(many7) === J(['item']) && J(big7) === J(['item']) && J(long7) === J(['item'])
        && J(ros7.a1) === J(['fogDiff', 'combats', 'targets']) && J(ros7.rows) === J(['Ana', 'Orc']) && J(ros7.targ) === J(['u_b']) && J(ros7.b) === J([]) && J(ros7.back) === J(['Ana', 'Orc']) && J(ros7.backTarg) === J([]) && J(noFight) === J(['fogDiff'])
        && J(lit7b.b) === J(['fogDiff:[null,null,[{"c":9,"r":9,"t":2}]]']) && J(lit7b.a) === J(['null']) && J(lit7b.view) === J([{ c: 9, r: 9, t: 2 }]) && J(lit7b.off) === J(['[]']) && lit7b.viewOff === null && J(hidSight) === J(['fogDiff']),
        J([noRec7, many7, big7, long7, ros7, noFight, lit7b, hidSight]));

    // what the mutants found: the roster after a change of what is held only (a lit cell alone sends none), judged with every open drag at its
    // start (one on another map too); the senses record seeded by a catch-up; the player's own new token never added by it; no fire armed for an
    // unfogged map; the light cap sent when it changes; the window reads a number only
    const R9 = S7({ fogLitFor: (pid, camp, map) => (pid === 'u_b' && map.id === 'mA' && map.whiteboard.find(w => w.id === 'tA').x > 200 ? { lit: [{ c: 9, r: 9, t: 2 }], capped: true } : null) });
    R9.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA' }] } }; R9.net.conns.forEach(c => { R9.net.sendItem('k', 'mA', c); c.sent.length = 0; });
    R9.move(R9.a1, 'tA', 250, 100, true); R9.fire(150); const r9 = { b: kinds(R9.b1), capMsg: (R9.b1.sent.find(m => m.type === 'fogDiff') || {}).capped, cap: R9.view(R9.b1).cap };
    R9.net.conns.forEach(c => { c.sent.length = 0; }); R9.move(R9.a1, 'tA', 100, 100, true); R9.fire(150); r9.capOff = (R9.b1.sent.find(m => m.type === 'fogDiff') || {}).capped; r9.viewOff = R9.view(R9.b1).cap;
    const RL = S7(); RL.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA' }] }, mB: { mapId: 'mB', round: 1, turn: 0, rows: [{ id: 'r_a2', name: 'Ana', tokId: 'tA2' }, { id: 'r_o2', name: 'Orc2', tokId: 'orc2' }] } };
    RL.net.roster.pA1.location = 'mB'; RL.move(RL.a1, 'tA2', 250, 100, false, 'mB'); RL.net.conns.forEach(c => { c.sent.length = 0; }); RL.api.combats(); const rl = fightIn((RL.msg(RL.a1, 'combats') || { combats: {} }).combats, 'mB');   // fold 2: Ana on mB is sent the fights there, judged with her open drag there at its start
    const SS = S7(); SS.api.sensesForget('u_a'); const ssBefore = Object.keys(SS.api.sensesSig()).filter(k => k.indexOf('u_a|') === 0).length; SS.move(SS.a1, 'tA', 250, 100, true); SS.fire(150); const ssAfter = Object.prototype.hasOwnProperty.call(SS.api.sensesSig(), 'u_a|mA');
    const OT = S7(); OT.camp.items.mA.whiteboard.push(T('tAnew', 'u_a', 'c_a', 3, 5)); OT.move(OT.a1, 'tA', 250, 100, true); OT.fire(150); const ownAdd = OT.a1.sent.filter(m => m.type === 'fogDiff').some(m => (m.add || []).some(a => a.item.id === 'tAnew')), ownAsk = OT.asks(OT.a1).length;
    const UF = S7(); UF.camp.items.mA.fog.on = false; UF.move(UF.a1, 'tA', 250, 100, true); const ufArmed = UF.timers.filter(t => t.fn && t.ms === 150).length;
    check('fold M7: the turn order follows only a change of what is held (lit cells alone send none) and is judged with every open drag at its start (fold 2: the fights on the map the player is on, with their own drag there); a catch-up seeds what the player\'s copy was made by (senses); the player\'s own token the copy lacks is never added by it (the next whole copy brings it); a map without fog arms nothing; the light cap goes when it changes, both ways; the window reads a number only',
        J(r9.b) === J(['fogDiff']) && r9.capMsg === true && r9.cap === true && r9.capOff === false && r9.viewOff === false && J(rl && rl.rows.map(r => r.name)) === J(['Ana', 'Hidden'])
        && ssBefore === 0 && ssAfter === true && ownAdd === false && ownAsk === 0 && ufArmed === 0 && R9.api.windowMs('400') === 150,
        J([r9, rl, ssBefore, ssAfter, ownAdd, ownAsk, ufArmed]));

    // convergence: a seeded walk of 200 steps over two maps — drops, open drags, a lock put back by the sweep, GM saves, a GM gesture, a hidden
    // creature, a waiting token — and after every fire every connection's copy equals a fresh copy judged for it, and no page asked for a map
    const CW = S7(); CW.camp.items.mA.whiteboard.push(T('ghost', '', 'c_n', 9, 6, { hidden: true }), T('wt', 'u_b', '', 6, 9, { isChar: false, waiting: 1 }), T('orcB', '', 'c_n', 4, 12));
    CW.net.conns.forEach(c => { ['mA', 'mB'].forEach(id => CW.net.sendItem('k', id, c)); c.sent.length = 0; });
    let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const toks = [['a1', 'tA', 'mA'], ['b1', 'tB', 'mA'], ['a2', 'tA2', 'mB']], walk = []; let bad = '';
    for (let step = 0; step < 200 && !bad; step++) {
        const k = rnd(10), tk = toks[rnd(3)], x = 50 * rnd(20), y = 50 * rnd(20);
        if (k < 5) CW.move(CW[tk[0]], tk[1], x, y, true, tk[2]);
        else if (k < 7) CW.move(CW[tk[0]], tk[1], x, y, false, tk[2]);
        else if (k === 7) { const o = CW.tok('orc'); o.x = x; o.y = y; CW.net.sendItem('k', 'mA'); }
        else if (k === 8) { CW.winRef.wpHostGesture = rnd(2) ? 'mA' : null; }
        else { const t = CW.tok(tk[1], tk[2]); t.locked = true; CW.api.sweep(); delete t.locked; }
        if (rnd(3) === 0) { CW.winRef.wpHostGesture = null; CW.fire(150); ['mA', 'mB'].forEach(id => { if (!agree(CW, null, id)) bad = 'step ' + step + ' ' + id + ' ' + J([CW.view(CW.a1, id), fresh7(CW, 'u_a', id), CW.view(CW.b1, id), fresh7(CW, 'u_b', id)]); }); walk.push(step); }
    }
    CW.winRef.wpHostGesture = null; CW.move(CW.a1, 'tA', 250, 100, true); CW.fire(150); CW.fire(150);
    check('fold M7: over a seeded walk of 200 steps on two maps (drops, open drags, a lock put back by the sweep, GM saves, the GM\'s gesture, a hidden creature, a waiting token), after every fire every connection\'s copy equals a fresh copy judged for it, in the same order, with the same lit cells and cap, and no player page asked for a whole map',
        bad === '' && walk.length > 30 && ['mA', 'mB'].every(id => agree(CW, null, id)), bad || J(walk.length));

    const fm7 = bw('fogmove', 'netfog.js'), pos7 = bw('pos'), pat7 = bw('patch', 'netfog.js'), rest7 = src.slice(0, src.indexOf('// [netcheck:fogmove-start]')) + src.slice(src.indexOf('// [netcheck:fogmove-end]'));
    check('fold M7 (source): the fire\'s one timer lives in its slice, and its stores nowhere else; the pos gate reads where the token sees from once after the seat, records where the drag began at its first accepted move and arms after the save is asked for and before a portal is taken; the map copy reads each own token\'s key before anything lands (at the drag\'s start while one is open) and arms after the erased drawings go; nothing else arms',
        (fm7.match(/setTimeout\(/g) || []).length === 1 && !/_fogPend|_fogCost|_fogHeld/.test(rest7)
        && /if \(msg\.final && window\.wpSeatDrop && window\.wpSeatDrop\(w, map, w\.gridFit === true\)\) \{[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*var skN = skW === null \? null : window\.wpFog\.seenKeyOf\(map, w\), mvW = skW === null \|\| skN !== skW;/.test(pos7)
        && /broadcastPos\(msg, conn, camp, map, w\);\n[^\n]*frW\.lx = w\.x;[^\n]*\n\s*if \(frW\.sk === undefined\) frW\.sk = skW;/.test(pos7)
        && /saveRemoteSoon\(\);\n\s*if \(typeof marksOwnMoved === 'function'\) marksOwnMoved\(msg\.itemId, \[w\], pr\.id\);[^\n]*\n\s*if \(typeof fogArm === 'function' && skN !== null && frW\.sk !== skN\) fogArm\(msg\.itemId\);[^\n]*\n\s*net\.tokenDropped\(w, map\);/.test(pos7)
        && /var fkP = \[\];[^\n]*\n\s*msg\.item\.whiteboard\.forEach\(function\(w\) \{/.test(pat7) && /fkP\.push\(\[lw, fogKey\(liveItem, lw, typeof openDrag === 'function' \? openDrag\(msg\.itemId, lw\) : null\)\]\);\n\s*if \(\(lw\.isChar \|\| lw\.waiting\) && typeof moveRefused === 'function'\) \{/.test(pat7)
        && /if \(liveItem\.whiteboard\.length !== before\) \{ changed = true; if \(out\) out\.strokes = true; \}\n\s*var mvP = fkP\.filter\(function\(p\) \{ return fogKey\(liveItem, p\[0\]\) !== p\[1\]; \}\);[^\n]*\n\s*if \(mvP\.length && typeof marksOwnMoved === 'function'\) marksOwnMoved\(msg\.itemId, mvP\.map\(function\(p\) \{ return p\[0\]; \}\), profile\.id\);[^\n]*\n\s*if \(typeof fogArm === 'function' && mvP\.length\) fogArm\(msg\.itemId\);/.test(pat7)
        && (src.match(/fogArm\(/g) || []).length === 7 && /if \(window\.wpHostGesture === mapId\) \{ if \(typeof fogArm === 'function'\) fogArm\(mapId\); return; \}/.test(bw('sensesmoved')) && /net\.sendItem\(campT\.id, msg\.itemId, null, conn\);[^\n]*\n\s*if \(typeof fogArm === 'function'\) fogArm\(msg\.itemId\);/.test(bw('threats')) && /try \{ c\.send\(msg\); \} catch \(e\) \{ sendFailed\(e\); net\.sendItem\(camp\.id, m\.id, c\);/.test(fm7));

    // the snap rule (the owner, 2026-09-29): the GM's Snap on the wire (slices snapsync and snapmsg, run on stubs)
    {
        const ssSrc = bw('snapsync'), smSrc = bw('snapmsg');
        const ssWorld = (role, active) => { const sent = [], box = { on: false }, conns = [{ peer: 'pa', open: true, send: m => sent.push(['pa', m]) }, { peer: 'pb', open: true, send: m => sent.push(['pb', m]) }, { peer: 'pw', open: true, send: m => sent.push(['pw', m]) }, { peer: 'px', open: false, send: m => sent.push(['px', m]) }];
            const net = { active: active !== false, role: role || 'host', conns: conns, roster: { pa: {}, pb: {}, px: {} } };
            new Function('net', 'window', 'own', 'sendFailed', "'use strict';\n" + ssSrc)(net, { wpSnapOn: () => box.on }, (o, k) => Object.prototype.hasOwnProperty.call(o, k), () => {});
            return { net, sent, box }; };
        const sw = ssWorld(); sw.net.syncSnap(); const s1 = sw.sent.slice(); sw.net.syncSnap(); const s2 = sw.sent.length; sw.box.on = true; sw.net.syncSnap(); const s3 = sw.sent.slice(s1.length); sw.box.on = 'yes'; sw.net.syncSnap(); const s4 = sw.sent.slice(s1.length + s3.length);
        const swC = ssWorld('client'); swC.box.on = true; swC.net.syncSnap(); const swI = ssWorld('host', false); swI.box.on = true; swI.net.syncSnap();
        check('snap rule: syncSnap (host) — the table hears whether the GM\'s Snap is on, admitted open connections only, once per change (true only); a player\'s app or a host not live sends nothing; it starts as not yet sent',
            J(s1) === J([['pa', { type: 'snap', on: false }], ['pb', { type: 'snap', on: false }]]) && s2 === 2 && J(s3) === J([['pa', { type: 'snap', on: true }], ['pb', { type: 'snap', on: true }]]) && J(s4) === J([['pa', { type: 'snap', on: false }], ['pb', { type: 'snap', on: false }]])
            && swC.sent.length === 0 && swI.sent.length === 0 && /net\.tableSnapOn = false; net\._lastSnapSent = null;/.test(ssSrc), J([s1, s3, s4]));
        const smRun = (net, msg, peer) => { new Function('net', 'msg', 'conn', "'use strict';\n" + smSrc)(net, msg, { peer: peer }); return net.tableSnapOn; };
        const smGot = [smRun({ foreign: true, syncedPeer: 'h', tableSnapOn: false }, { on: true }, 'h'), smRun({ foreign: true, syncedPeer: 'h', tableSnapOn: true }, { on: 'yes' }, 'h'), smRun({ foreign: true, syncedPeer: 'h', tableSnapOn: false }, { on: true }, 'other'), smRun({ foreign: false, syncedPeer: 'h', tableSnapOn: false }, { on: true }, 'h'), smRun({ foreign: true, syncedPeer: 'h', tableSnapOn: true }, {}, 'h')];
        check('snap rule: a player\'s app takes the table\'s Snap from the synced host only, after the snapshot, as true only; the snapshot carries it and the app takes it (true only); a new table starts with Snap as it stands; the host\'s pos gate seats a player\'s drop by wpSeatDrop (a fitted token forced)',
            J(smGot) === J([true, false, false, false, false]) && /travelLocked: net\.travelLocked, snap: typeof window\.wpSnapOn === 'function' && window\.wpSnapOn\(\) === true, stance:/.test(src) && /setTravelLockLocal\(!!msg\.travelLocked\);\n\s*net\.tableSnapOn = msg\.snap === true;/.test(require('./checkkit').part('netfog.js'))
            && /net\._lastSnapSent = typeof window\.wpSnapOn === 'function' && window\.wpSnapOn\(\) === true;/.test(src) && /\} else if \(msg\.type === 'snap' && net\.role === 'client'\) \{/.test(src) && !/msg\.type === 'snap' && net\.role === 'host'/.test(src)
            && /if \(msg\.final && window\.wpSeatDrop && window\.wpSeatDrop\(w, map, w\.gridFit === true\)\) \{ msg = Object\.assign\(\{\}, msg, \{ x: w\.x, y: w\.y \}\); \}/.test(src) && !/window\.wpSeatHex\(w, map\)\) \{ msg = /.test(src), J(smGot));
    }
    // senses S7a (host): null areas on the wire — a hidden one left out whole, a visible one without its nulls, a player's word of their own tokens (fogOff)
    {
        const sysNl = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }], combat: { senses: { list: [{ id: 'sn_hear0001', name: 'Hearing', grade: 'mark', glyph: 'sound', walls: 'pass', arc: 'all', range: { by: 'n', n: 80 }, unit: 'ft' }] } } }, { F: Fx, gmView: true });
        const nW = S7({ system: sysNl }), mA = nW.camp.items.mA, tAt = nW.tok('tA'), bx = tAt.x, by = tAt.y;
        mA.whiteboard.push({ id: 'zoneV', type: 'rect', x: tAt.x - 50, y: tAt.y - 50, w: 150, h: 150, nulls: ['sn_hear0001', 'sn_other0001'] }, { id: 'zoneH', type: 'rect', hidden: true, x: 5000, y: 5000, w: 100, h: 100, nulls: ['sn_hear0001'] }, { id: 'zoneJ', type: 'rect', hidden: true, x: 6000, y: 6000, w: 100, h: 100, nulls: 'junk' });
        mA.meta = Object.assign({}, mA.meta, { updated: (mA.meta && mA.meta.updated || 0) + 1 }); nW.clearSent(); nW.net.sendItem('k', 'mA');
        const nA = nW.last(nW.a1), nB = nW.last(nW.b1), allSent = J(nW.a1.sent.concat(nW.a2.sent, nW.b1.sent)), cloneN = nW.api.clean(mA);
        const nGot = { aOff: nA && nA.fogOff, aMarks: nA && Object.prototype.hasOwnProperty.call(nA, 'fogMarks'), bOff: nB && Object.prototype.hasOwnProperty.call(nB, 'fogOff'), zoneV: nA && J(nA.whiteboard.find(w => w.id === 'zoneV') || null), hidIds: /zoneH|zoneJ/.test(allSent), nulls: /nulls|sn_other0001/.test(allSent), clone: /zoneH|zoneJ|nulls|fogOff/.test(J(cloneN)) };
        nW.clearSent(); nW.move(nW.a1, 'tA', bx + 400, by, false); nW.move(nW.a1, 'tA', bx + 400, by, true); nW.fire(150);
        const outD = nW.a1.sent.filter(m => m.type === 'fogDiff').map(m => J(m.off === undefined ? 'none' : m.off));
        nW.clearSent(); nW.move(nW.a1, 'tA', bx, by, false); nW.move(nW.a1, 'tA', bx, by, true); nW.fire(150);
        const backD = nW.a1.sent.filter(m => m.type === 'fogDiff').map(m => J(m.off === undefined ? 'none' : m.off));
        check('senses S7a (host): a null area the GM hid never reaches a player — no item, id or box (not even junk nulls); a visible one travels as its shape without its nulls; the owner of a token standing in one is told which of its senses fail there (only senses it holds; its marks by that sense gone), on their own copy only, never the shared clone; walking out sends them an empty word, walking back the word again',
            J(nGot.aOff) === J({ tA: ['sn_hear0001'] }) && nGot.aMarks === false && nGot.bOff === false && /"id":"zoneV"/.test(nGot.zoneV) && !/nulls/.test(nGot.zoneV) && nGot.hidIds === false && nGot.nulls === false && nGot.clone === false
            && J(outD) === J([J({})]) && J(backD) === J([J({ tA: ['sn_hear0001'] })]), J([nGot, outD, backD]));
        const nfW = S7({ system: sysNl }), nfM = nfW.camp.items.mA, nfT = nfW.tok('tA');
        nfM.whiteboard.push({ id: 'zoneF', type: 'rect', x: nfT.x - 50, y: nfT.y - 50, w: 150, h: 150, nulls: ['sn_hear0001'], nullFx: 'e_voidarea' }, { id: 'zoneG', type: 'rect', hidden: true, x: 5000, y: 5000, w: 100, h: 100, nulls: ['sn_hear0001'], nullFx: 'e_voidarea' }, Object.assign({ id: 'zoneT', type: 'rect', x: 7000, y: 7000, w: 10, h: 10, nullFx: 'e_voidarea' }));
        nfM.meta = Object.assign({}, nfM.meta, { updated: (nfM.meta && nfM.meta.updated || 0) + 1 }); nfW.clearSent(); nfW.net.sendItem('k', 'mA');
        const nfSent = J(nfW.a1.sent.concat(nfW.a2.sent, nfW.b1.sent)), nfClone = J(nfW.api.clean(nfM)), nfOwn = nfW.camp.items.mA.whiteboard.filter(w => w.nullFx !== undefined).length;
        check('a null area\'s effect (1.6.0, host): the key reaches no player on any copy of a map, nor the shared clone, a hidden area leaves whole as before, a piece with the key and no senses loses it too, and the GM\'s own map keeps it',
            !/nullFx|e_voidarea/.test(nfSent) && !/nullFx|e_voidarea/.test(nfClone) && /zoneF/.test(nfSent) && !/zoneG/.test(nfSent) && nfOwn === 3, J([nfSent.length, nfOwn]));
        check('senses S7a (source): a hidden null area is left out of a player\'s copy whole and its live moves reach no one; the whole copy, the catch-up and the player\'s app carry and clean fogOff',
            /if \(w\.gmNoteFor \|\| w\.hidden\) return null;/.test(src) && /if \(w && \(w\.gmNoteFor \|\| w\.hidden\)\) return;/.test(src) && /delete w\.unsensed; delete w\.nulls; \}/.test(src)
            && /if \(off\) out\.fogOff = off;/.test(require('./checkkit').part('netfog.js')) && /if \(ofHash !== rec\.of\) msg\.off = ofNow;/.test(require('./checkkit').part('netfog.js')) && /FCo\.cleanFogOff\(msg\.off, ownTokIdsOf\(map\)\)/.test(require('./checkkit').part('netfog.js')) && /window\.wpFogCore\.cleanFogOff\(m\.fogOff, ownTokIdsOf\(m\)\)/.test(src));
    }
    // senses S7b (host): smoke on the wire — a visible piece travels with its tick (every side must agree on what it hides), and a token walks through it
    {
        const sW = S7({}), mS = sW.camp.items.mA, tS = sW.tok('tA'), sx0 = tS.x, sy0 = tS.y;
        mS.whiteboard.push({ id: 'smokeV', type: 'rect', x: tS.x + 100, y: tS.y - 50, w: 100, h: 150, smoke: true });
        mS.meta = Object.assign({}, mS.meta, { updated: (mS.meta && mS.meta.updated || 0) + 1 }); sW.clearSent(); sW.net.sendItem('k', 'mA');
        const sA = sW.last(sW.a1), sB = sW.last(sW.b1), smA = sA && sA.whiteboard.find(w => w.id === 'smokeV'), smB = sB && sB.whiteboard.find(w => w.id === 'smokeV');
        sW.clearSent(); sW.move(sW.a1, 'tA', sx0 + 300, sy0, false); sW.move(sW.a1, 'tA', sx0 + 300, sy0, true); sW.fire(150);
        const tEnd = sW.tok('tA'), refused = sW.a1.sent.some(m => m.type === 'refused' || m.type === 'posBack' || (m.type === 'pos' && m.id === 'tA' && m.x === sx0));
        check('senses S7b (host): a visible smoke piece reaches each player with its tick (their screen hides by it as the host does); a player\'s token walks into and through smoke, the move never refused (smoke blocks sight, never movement)',
            !!smA && smA.smoke === true && !!smB && smB.smoke === true && tEnd.x !== sx0 && Math.abs(tEnd.x - (sx0 + 300)) <= 50 && refused === false, J([smA, smB, tEnd.x - sx0, refused]));
    }
    // see-through barriers (1.5.1, host; the owner's ruling of 2026-10-03: "active force fields are see through and impassible"): a piece flagged barrier stops a
    // player's token as a wall does and stops no sight — the real pos gate, patch path and sends over the real fog.js (moveBlocked, moveSetFor) and fogcore,
    // one module; the flag on the wire both ways
    {
        const NOTE = 'A wall is in the way: your token goes back.', WARN = 'That move went through a wall.';
        const bW = (rules, piece) => { const W = S7({ rules: rules }); W.winRef.wpFog.moveBlocked = W.fog.moveBlocked;   // the real judge (the world's own only records what is asked)
            const m = W.camp.items.mA; m.whiteboard.push(Object.assign({ id: 'ff', type: 'rect', x: 250, y: 100, w: 50, h: 50, barrier: true }, piece || {}), { id: 'imp', type: 'image', isChar: true, charName: 'imp', x: 400, y: 100, w: 50, h: 50, rot: 0, front: 0 });
            m.meta = Object.assign({}, m.meta, { updated: (m.meta && m.meta.updated || 0) + 1 }); W.clearSent(); return W; };
        const notes = c => c.sent.filter(x => x.type === 'turn-note').map(x => x.text), backs = c => c.sent.filter(x => x.type === 'pos' && x.wbId === 'tA' && x.final === true).map(x => [x.x, x.y]), at = W => W.place('tA').slice(0, 2);
        // the pos gate: Ana's tA stands at (100,100), the barrier in the cell at (250,100), her drop two cells past it
        const R = bW({}); R.move(R.a1, 'tA', 350, 100, false); const midR = at(R); R.move(R.a1, 'tA', 350, 100, true); const endR = at(R), notesR = notes(R.a1), backR = backs(R.a1), othersR = notes(R.b1).length;
        R.clearSent(); R.move(R.a1, 'tA', 250, 100, true); const inR = [at(R), notes(R.a1)]; R.clearSent(); R.move(R.a1, 'tA', 200, 100, true); const freeR = [at(R), notes(R.a1)];
        const Wn = bW({ walls: 'warn' }); Wn.move(Wn.a1, 'tA', 350, 100, false); Wn.move(Wn.a1, 'tA', 350, 100, true); const warn = [at(Wn), notes(Wn.a1), Wn.toasts.filter(t => /wall/.test(t))];
        const Of = bW({ walls: 'off' }); Of.move(Of.a1, 'tA', 350, 100, true); const off = [at(Of), notes(Of.a1), Of.toasts.filter(t => /wall/.test(t))];
        const through = [{ hidden: true }, { barrier: 1 }, { barrier: 'true' }, { sightType: 'door', doorOpen: true }, { gmNoteFor: 'u_a' }].map(p => { const W = bW({}, p); W.move(W.a1, 'tA', 350, 100, true); return [at(W), notes(W.a1).length]; });
        const stopped = [{ sightType: 'door' }, { sightType: 'door', doorLock: true }, { type: 'circle' }, { type: 'image' }, { rot: 30 }].map(p => { const W = bW({}, p); W.move(W.a1, 'tA', 350, 100, true); return [at(W), notes(W.a1)]; });
        const Ln = bW({}, { type: 'path', x: 275, y: 0, w: 10, h: 400, baseW: 10, baseH: 400, pts: [[0, 0], [0, 400]] }); Ln.move(Ln.a1, 'tA', 350, 100, true); const lineStop = [at(Ln), notes(Ln.a1)]; Ln.clearSent(); Ln.move(Ln.a1, 'tA', 200, 100, true); const lineFree = [at(Ln), notes(Ln.a1)];
        check('barriers (host, the real pos gate over the real fog.js): a player\'s token may not land in or cross a see-through barrier — mid-drag nothing is applied, and at the drop the token goes back where its drag began with the wall\'s own note, to its player alone; a drop short of it lands with no note; with the walls\' mode on Warn the move lands with the wall\'s warning to the player and the GM, on Off it lands unremarked',
            J(midR) === J([100, 100]) && J(endR) === J([100, 100]) && J(notesR) === J([NOTE]) && J(backR) === J([[100, 100]]) && othersR === 0 && J(inR) === J([[100, 100], [NOTE]]) && J(freeR) === J([[200, 100], []])
            && J(warn) === J([[350, 100], [WARN], ['tA moved through a wall.']]) && J(off) === J([[350, 100], [], []]), J([midR, endR, notesR, backR, inR, freeR, warn, off]));
        check('barriers (host): what stops and what does not, at the same gate — a barrier the GM hid, one flagged by anything but true, an open barrier door and a GM-note card let the token through; a closed barrier door (locked or not), a circle, an image and a turned rectangle stop it; a pen-line barrier stops a drop across the line and lets one short of it land',
            through.every(t => J(t) === J([[350, 100], 0])) && stopped.every(t => J(t) === J([[100, 100], [NOTE]])) && J(lineStop) === J([[100, 100], [NOTE]]) && J(lineFree) === J([[200, 100], []]), J([through, stopped, lineStop, lineFree]));
        // a drop is judged where the host will SEAT it (found by review, 2026-10-03): the real snap rule (datamap.js, its snaprule slice) beside the real wall
        // judge. Ana's token is two cells wide (100 by 50) at (100,100), its center in the cell at 150; the barrier fills the cell at 250. A drop sent to
        // x = 180 has its center in the open cell at 200, and Snap seats it with its corner at 200: its center in the barrier's cell
        const dmB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'datamap.js'), 'utf8').replace(/\r\n/g, '\n'), srA = dmB.indexOf('  // [systemcheck:snaprule-start]'), srB = dmB.indexOf('  // [systemcheck:snaprule-end]');
        const seatW = (snapOn, rules, tok, bar) => { const W = S7({ rules: rules || {}, tA: Object.assign({ w: 100 }, tok || {}) }), sw = { wpNet: { active: true, role: 'host' }, wpSeatHex: () => false }; W.winRef.wpFog.moveBlocked = W.fog.moveBlocked; W.seats = 0;
            new Function('window', 'getActiveMap', 'state', dmB.slice(srA, srB))(sw, () => null, { snap: snapOn, snapMode: 'grid', gridType: 'off' }); W.winRef.wpSeatDrop = (it, m, force) => { W.seats++; return sw.wpSeatDrop(it, m, force); };
            const m = W.camp.items.mA; m.whiteboard.push(Object.assign({ id: 'ff', type: 'rect', x: 250, y: 100, w: 50, h: 50, barrier: true }, bar || {})); m.meta = Object.assign({}, m.meta, { updated: (m.meta && m.meta.updated || 0) + 1 }); W.clearSent(); return W; };
        const drop = (W, x, y, fin) => { W.clearSent(); W.seats = 0; const s0 = W.saves; W.move(W.a1, 'tA', x, y, fin !== false); W.fire(250); return [at(W), notes(W.a1), W.seats, W.saves - s0]; };
        const sIn = drop(seatW(true), 180, 100), sShort = drop(seatW(true), 160, 100), sOffClear = drop(seatW(false), 180, 100), sOffIn = drop(seatW(false), 200, 100), sFit = drop(seatW(false, {}, { gridFit: true }), 180, 100);
        const sTall = drop(seatW(true, {}, { w: 50, h: 100 }, { x: 100, y: 250 }), 100, 180), sTallShort = drop(seatW(true, {}, { w: 50, h: 100 }, { x: 100, y: 250 }), 100, 160);
        const Wd = seatW(true), sMid = drop(Wd, 180, 100, false), sEnd = drop(Wd, 180, 100);
        const Ww = seatW(true, { walls: 'warn' }), sWarn = drop(Ww, 180, 100), warnToast = Ww.toasts.filter(t => /wall/.test(t)), sNoRule = drop(seatW(true, { walls: 'off' }), 180, 100);
        check('barriers (host, a drop is judged where it will be seated: the real snap rule beside the real wall judge): a token two cells wide sent to a place whose center is clear of a barrier, which Snap seats with its center in the barrier\'s cell, goes back with the wall\'s note and is seated nowhere (it used to be seated into the barrier, and could leave on the far side with a second drop), across and down alike; a drop its seat leaves short of the barrier lands at that seat and is saved; with Snap off nothing is seated and the place sent is judged, as before; a token fitted to the grid is seated whatever Snap says and is judged by that seat',
            srA > 0 && srB > srA && J(sIn) === J([[100, 100], [NOTE], 1, 0]) && J(sShort) === J([[150, 100], [], 2, 1]) && J(sOffClear) === J([[180, 100], [], 2, 1]) && J(sOffIn) === J([[100, 100], [NOTE], 1, 0]) && J(sFit) === J([[100, 100], [NOTE], 1, 0])
            && J(sTall) === J([[100, 100], [NOTE], 1, 0]) && J(sTallShort) === J([[100, 150], [], 2, 1]), J([sIn, sShort, sOffClear, sOffIn, sFit, sTall, sTallShort]));
        check('barriers (host, a drop judged by its seat): mid-drag nothing is seated and the place sent is judged, so the token follows the drag; the drop that ends the drag is judged by its seat and the token goes back where the drag began; under Warn the move lands at its seat with the wall\'s warning to the player and the GM (it used to land in the barrier unremarked); under Off no seat is tried before the move lands',
            J(sMid) === J([[180, 100], [], 0, 0]) && J(sEnd.slice(0, 3)) === J([[100, 100], [NOTE], 1]) && J(sWarn) === J([[200, 100], [WARN], 2, 1]) && J(warnToast) === J(['tA moved through a wall.']) && J(sNoRule) === J([[200, 100], [], 1, 1]), J([sMid, sEnd, sWarn, warnToast, sNoRule]));
        // the patch path: the map copy her app saves after a drop never lands the move a Refuse rule stops
        const copyOf = (W, x, y) => ({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [Object.assign({}, W.tok('tA'), { x: x, y: y })] } });
        const P = bW({}); P.api.item(copyOf(P, 350, 100), P.a1); const patR = [at(P), backs(P.a1)]; P.clearSent(); P.api.item(copyOf(P, 200, 100), P.a1); const patFree = at(P);
        const Pw = bW({ walls: 'warn' }); Pw.api.item(copyOf(Pw, 350, 100), Pw.a1); const Po = bW({ walls: 'off' }); Po.api.item(copyOf(Po, 350, 100), Po.a1);
        const mrf = new Function('window', 'net', 'own', lineOf('function moveMode(') + '\n' + fnSrc('function turnCombatOf(', '\n}\n', 'turnCombatOf') + '\n}\n' + fnSrc('function moveRefused(', '\n}\n', 'moveRefused') + '\n}\n' + ordersSrc + '\nreturn moveRefused;');
        const why = rules => { const W = bW(rules); return mrf({ wpFog: W.fog, wpVtt: { on: () => true } }, { combats: {}, turnMove: {} }, (o, k) => Object.prototype.hasOwnProperty.call(o, k))(W.camp, W.camp.items.mA, 'mA', W.tok('tA'), 100, 100, 350, 100); };
        check('barriers (host, the real patch path): a map copy carrying her token across a barrier is put back where it stood, for her and everyone, under Refuse — its note the wall\'s own (moveRefused over the real fog.js) — and lands under Warn and under Off, as a wall\'s; a copy that moves it short of the barrier lands',
            J(patR) === J([[100, 100], [[100, 100]]]) && J(patFree) === J([200, 100]) && J(at(Pw)) === J([350, 100]) && J(at(Po)) === J([350, 100]) && why({}) === NOTE && why({ walls: 'warn' }) === '' && why({ walls: 'off' }) === '', J([patR, patFree, at(Pw), at(Po), why({})]));
        // sight: the creature two cells past the barrier stays on her copy; the same piece as a wall takes it off
        const idsWith = piece => { const W = bW({}, piece); W.net.sendItem('k', 'mA'); return W.ids(W.a1); };
        const seeBar = idsWith(), seeWall = idsWith({ barrier: undefined, blocksSight: true }), seeBoth = idsWith({ blocksSight: true });
        check('barriers (host): a barrier stops no sight — the creature standing past it stays on the player\'s copy of the fogged map, where the same piece flagged Blocks sight takes it off (and a piece with both flags is that wall)',
            seeBar.indexOf('imp') >= 0 && seeBar.indexOf('ff') >= 0 && seeWall.indexOf('imp') < 0 && seeBoth.indexOf('imp') < 0, J([seeBar, seeWall, seeBoth]));
        // the wire, host to player: a shown barrier travels with its flag and its door keys, a hidden one not at all. A plain barrier, one that is no
        // door, leaves in a plain wall's one shape (the third review of fold B5): typed wall, whatever type it had or had not, and with nothing
        // of a door on it. That is why the plain barrier's type, once nothing, is now the word wall
        const Wr = bW({}); Wr.camp.items.mA.whiteboard.push({ id: 'ffHid', type: 'rect', x: 5000, y: 5000, w: 50, h: 50, barrier: true, hidden: true }, { id: 'gate', type: 'rect', x: 100, y: 600, w: 50, h: 50, barrier: true, sightType: 'door', doorOpen: true, doorLock: true },
            { id: 'ffWas', type: 'rect', x: 200, y: 600, w: 50, h: 50, barrier: true, sightType: 'wall', doorOpen: true, doorLock: true }, { id: 'ffOdd', type: 'rect', x: 300, y: 600, w: 50, h: 50, barrier: true, sightType: 'Door', doorLock: true }, { id: 'gateShut', type: 'rect', x: 400, y: 600, w: 50, h: 50, barrier: true, sightType: 'door', name: 'Force gate', groupId: 'g_cell' });
        const hostWr = J(Wr.camp.items.mA.whiteboard);
        Wr.camp.items.mA.meta = Object.assign({}, Wr.camp.items.mA.meta, { updated: 99 }); Wr.clearSent(); Wr.net.sendItem('k', 'mA');
        const cA = Wr.last(Wr.a1), cB = Wr.last(Wr.b1), allW = J(Wr.a1.sent.concat(Wr.a2.sent, Wr.b1.sent)), cloneW = Wr.api.clean(Wr.camp.items.mA), pick = (m, id) => { const w = m && m.whiteboard.find(x => x.id === id); return w ? [w.barrier, w.sightType, w.doorOpen, w.doorLock] : null; };
        const PLAINB = J([true, 'wall', undefined, undefined]), gateShut = (cA && cA.whiteboard.find(x => x.id === 'gateShut')) || {};
        check('barriers (host, the wire): a shown barrier reaches each player with its flag. A barrier\'s door travels with its type, open and locked as they are, so a player\'s app can offer the click, and with its name and its group. A plain barrier is no door and leaves in a plain wall\'s one shape: typed wall, though the host\'s piece names no type, and with no open or locked word, whether it carried none, was once a door and still holds them, or is typed by a word that is not door. The host reads each of those as shut whatever it holds, so the player\'s copy and the host agree. A barrier the GM hid reaches no one, no item and no id, on a player\'s copy or the shared clone. The host\'s own pieces are left as they were',
            [cA, cB, cloneW].every(m => J(pick(m, 'ff')) === PLAINB && J(pick(m, 'ffWas')) === PLAINB && J(pick(m, 'ffOdd')) === PLAINB && J(pick(m, 'gate')) === J([true, 'door', true, true]) && J(pick(m, 'gateShut')) === J([true, 'door', undefined, undefined]))
            && gateShut.name === 'Force gate' && gateShut.groupId === 'g_cell' && !Object.prototype.hasOwnProperty.call(Wr.tok('ff'), 'sightType') && Wr.tok('ffWas').doorOpen === true && Wr.tok('ffOdd').sightType === 'Door' && J(Wr.camp.items.mA.whiteboard) === hostWr
            && [Wr.tok('ff'), Wr.tok('ffWas'), Wr.tok('ffOdd'), Wr.tok('gateShut')].every(w => FCx.barrierOn(w) === true) && FCx.barrierOn(Wr.tok('gate')) === false
            && !/ffHid/.test(allW) && !/ffHid/.test(J(cloneW)), J([['ff', 'ffWas', 'ffOdd', 'gate', 'gateShut'].map(id => [id, pick(cA, id), pick(cB, id), pick(cloneW, id)]), gateShut, /ffHid/.test(allW)]));
        // the wire, player to host: a copy can neither set the flag nor clear it
        const Pt = bW({}); Pt.camp.items.mA.whiteboard.push({ id: 'pl1', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 600, w: 10, h: 10, baseW: 10, baseH: 10, z: 35, pts: [[0, 0], [10, 10]], color: '#e9e9f0', strokeWidth: 3, barrier: true });
        Pt.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [{ id: 'ff', type: 'rect', x: 250, y: 100, w: 50, h: 50 }, Object.assign({}, Pt.tok('tA'), { barrier: true, sightType: 'door' }),
            { id: 'pl1', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 600, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [5, 9]], barrier: false },
            { id: 'wbnew1', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [5, 5]], barrier: true, blocksSight: true, sightType: 'door', doorOpen: true }] } }, Pt.a1);
        const drew = Pt.tok('wbnew1'), redrew = Pt.tok('pl1'), has = (w, k) => !!w && Object.prototype.hasOwnProperty.call(w, k);
        check('barriers (host, a player\'s map copy): nothing a copy says sets the flag or clears it — the GM\'s barrier sent back without it is a barrier still, her own token sent flagged takes no flag and no door type, a new drawing of hers sent as a barrier, a wall and an open door is taken as the drawing alone, and a drawing of hers the GM made a barrier stays one, and stays as it was drawn, when her copy redraws it (49 (c): it is the GM\'s piece now)',
            Pt.tok('ff').barrier === true && !has(Pt.tok('tA'), 'barrier') && !has(Pt.tok('tA'), 'sightType') && !!drew && !has(drew, 'barrier') && !has(drew, 'blocksSight') && !has(drew, 'sightType') && !has(drew, 'doorOpen')
            && !!redrew && redrew.barrier === true && J(redrew.pts) === J([[0, 0], [10, 10]]), J([Pt.tok('ff'), drew, redrew]));
        check('barriers (source): the walls\' rule has one judge, asked in two places and both for a player\'s move — the pos gate and the patch path — so the GM\'s own moves are never stopped; a player\'s door request takes a wall\'s door or a barrier\'s, each flag only as true; a player\'s app keeps the flag only as true; nothing strips it from a shown piece on its way out, and a hidden piece is not sent',
            (src.match(/window\.wpFog\.moveBlocked\(/g) || []).length === 2 && /if \(wlM !== 'off' && window\.wpFog && window\.wpFog\.moveBlocked && window\.wpFog\.moveBlocked\(map, w, frW\.x, frW\.y, seatX, seatY\)\) \{/.test(src)
            && /if \(moveMode\(camp, 'walls'\) === 'refuse' && window\.wpFog && window\.wpFog\.moveBlocked && window\.wpFog\.moveBlocked\(map, w, fx, fy, tx, ty\)\) return 'A wall is in the way: your token goes back\.';/.test(src)
            && src.includes("if (!doorEl || (doorEl.blocksSight !== true && doorEl.barrier !== true) || doorEl.sightType !== 'door' || doorEl.hidden) return;") && src.includes('if (w.barrier !== undefined && w.barrier !== true) delete w.barrier;')
            && !/delete w\.barrier/.test(fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem')) && /if \(w\.gmNoteFor \|\| w\.hidden\) return null;/.test(fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem')));
    }
    // a portal's own lock (the owner, 2026-10-03) on the wire, in the same one-module world (the real sanitizeItem / wireWbItem, sends and patch path):
    // host to player a shown locked portal with its flag and a hidden one not at all; player to host nothing sets it and nothing clears it
    {
        const pW = () => { const W = S7({}); const m = W.camp.items.mA;
            m.whiteboard.push({ id: 'pLock', type: 'rect', x: 600, y: 600, w: 50, h: 50, targetMapId: 'mB', portalLock: true }, { id: 'pOpen', type: 'rect', x: 700, y: 600, w: 50, h: 50, targetMapId: 'mB' },
                { id: 'pHidTrap', type: 'rect', x: 5000, y: 5000, w: 50, h: 50, targetMapId: 'mB', portalLock: true, hidden: true, trap: true }, { id: 'pWord', type: 'rect', x: 800, y: 600, w: 50, h: 50, targetMapId: 'mB', portalLock: 'yes' }, { id: 'pOne', type: 'rect', x: 900, y: 600, w: 50, h: 50, targetMapId: 'mB', portalLock: 1 }, { id: 'pNodeWord', type: 'rect', x: 1000, y: 600, w: 50, h: 50, nodeId: 'rNode', portalLock: 'yes' }, { id: 'pNodeLock', type: 'rect', x: 1100, y: 600, w: 50, h: 50, nodeId: 'rNode', portalLock: true });
            m.meta = Object.assign({}, m.meta, { updated: (m.meta && m.meta.updated || 0) + 1 }); W.clearSent(); return W; };
        const hasK = (w, k) => !!w && Object.prototype.hasOwnProperty.call(w, k), lk = (m, id) => { const w = m && m.whiteboard.find(x => x.id === id); return w ? (hasK(w, 'portalLock') ? w.portalLock : 'none') : null; };
        const Wp = pW(); Wp.net.sendItem('k', 'mA');
        const pcA = Wp.last(Wp.a1), pcB = Wp.last(Wp.b1), cloneP = Wp.api.clean(Wp.camp.items.mA), allP = J(Wp.a1.sent.concat(Wp.a2.sent, Wp.b1.sent));
        const wireSrc = fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem');
        check('portal lock (host, the wire): a shown locked portal reaches each player with its flag — on a player\'s own copy of a fogged map and on the shared clone — so their board can show the lock; an unlocked portal carries no key; a hidden locked trap tile reaches no one (no item, no id); a host whose own map holds the flag as a word or a number sends none of it (it judges by true alone, and so does what it sends), its own map untouched',
            lk(pcA, 'pLock') === true && lk(pcB, 'pLock') === true && lk(cloneP, 'pLock') === true && lk(pcA, 'pOpen') === 'none' && lk(cloneP, 'pOpen') === 'none' && !/pHidTrap/.test(allP) && !/pHidTrap/.test(J(cloneP))
            && lk(pcA, 'pWord') === 'none' && lk(pcA, 'pOne') === 'none' && lk(cloneP, 'pWord') === 'none' && lk(cloneP, 'pOne') === 'none' && lk(pcA, 'pNodeWord') === 'none' && lk(cloneP, 'pNodeWord') === 'none' && lk(pcA, 'pNodeLock') === true && lk(cloneP, 'pNodeLock') === true && pcA.whiteboard.some(w => w.id === 'pWord' && w.targetMapId === 'mB') && Wp.tok('pWord').portalLock === 'yes' && Wp.tok('pOne').portalLock === 1
            && wireSrc.includes('    if (w.portalLock !== undefined && w.portalLock !== true) delete w.portalLock;') && /if \(w\.gmNoteFor \|\| w\.hidden\) return null;/.test(wireSrc), J([lk(pcA, 'pLock'), lk(pcB, 'pLock'), lk(pcA, 'pOpen'), lk(pcA, 'pWord'), lk(pcA, 'pOne'), /pHidTrap/.test(allP)]));
        // The third review of fold B5: a plain wall leaves in one shape, with nothing of a way through. So a lock is sent with a wall only where the
        // wall IS a way through. A wall that is a portal by its own Portal to Map, and one through the room it is linked to, keep the lock and
        // everything else of the way: the landing room, the trap mark, the icon and the name. A wall and a see-through barrier that lead nowhere,
        // which a way through that is gone may have left locked, leave without any of it. A piece that blocks nothing keeps it all
        const WAYS = { portalLock: true, trap: true, portalIcon: 'Gate', targetRoomId: 'room_k', name: 'Vault way' }, wAt = n => ({ type: 'rect', x: 1200 + n * 100, y: 900, w: 50, h: 50 });
        const wallWays = [Object.assign({ id: 'pwMap' }, wAt(0), { blocksSight: true, sightType: 'wall', targetMapId: 'mB' }, WAYS), Object.assign({ id: 'pwNode' }, wAt(1), { blocksSight: true, nodeId: 'rNode' }, WAYS), Object.assign({ id: 'pwBarMap' }, wAt(2), { barrier: true, targetMapId: 'mB' }, WAYS),
            Object.assign({ id: 'pwStale' }, wAt(3), { blocksSight: true, sightType: 'wall' }, WAYS), Object.assign({ id: 'pwBarStale' }, wAt(4), { barrier: true }, WAYS), Object.assign({ id: 'pwNoMap' }, wAt(5), { blocksSight: true, targetMapId: '', nodeId: null }, WAYS), Object.assign({ id: 'pwFree' }, wAt(6), WAYS)];
        const Ww = pW(); Ww.camp.items.mA.whiteboard.push(...wallWays.map(p => JSON.parse(J(p)))); Ww.camp.items.mA.meta = Object.assign({}, Ww.camp.items.mA.meta, { updated: (Ww.camp.items.mA.meta.updated || 0) + 1 }); Ww.clearSent(); Ww.net.sendItem('k', 'mA');
        const waysOf = (m, id) => { const w = m && m.whiteboard.find(x => x.id === id); return w ? Object.keys(WAYS).filter(k => hasK(w, k) && w[k] === WAYS[k]).join(' ') + ' | ' + (hasK(w, 'sightType') ? w.sightType : 'no type') : 'not sent'; };
        const wcA = Ww.last(Ww.a1), wcB = Ww.last(Ww.b1), wClone = Ww.api.clean(Ww.camp.items.mA), ALLW = 'portalLock trap portalIcon targetRoomId name', waysGot = wallWays.map(p => [p.id, waysOf(wcA, p.id), waysOf(wcB, p.id), waysOf(wClone, p.id)]);
        const waysWant = [['pwMap', ALLW + ' | wall'], ['pwNode', ALLW + ' | no type'], ['pwBarMap', ALLW + ' | no type'], ['pwStale', ' | wall'], ['pwBarStale', ' | wall'], ['pwNoMap', ' | wall'], ['pwFree', ALLW + ' | no type']].map(r => [r[0], r[1], r[1], r[1]]);
        const roomsW = Object.assign({}, Ww.camp.items.mA, { rooms: [{ id: 'rNode', targetMapId: 'mB' }] });   // the map with the room pwNode is linked to, as the app asks whether a piece is a portal
        check('portal lock (host, the wire, a wall): a wall that is a way through keeps its lock on the wire, with the landing room, the trap mark, the icon and the name of the way, whether it leads on by its own Portal to Map or through the room it is linked to, and a see-through barrier that leads on likewise. Each leaves under its own type or under none. A wall that leads nowhere is a plain wall and leaves in a plain wall\'s one shape: a lock, a trap mark, an icon, a landing room and a name left on it by a way through that is gone are not sent. That holds of a wall, of a see-through barrier, and of a wall whose way to another map is an empty text and whose link to a room is null, and each of those leaves typed wall. To the app such a piece is no portal, so the lock did nothing there. A piece that blocks nothing keeps all of it, as before. On a player\'s own copy of a fogged map and on the shared clone alike; the host\'s own pieces are left as they were',
            J(waysGot) === J(waysWant) && wallWays.every(p => J(Ww.tok(p.id)) === J(p)) && typeof FCx.isPortal === 'function' && ['pwMap', 'pwNode', 'pwBarMap'].every(id => FCx.isPortal(Ww.tok(id), roomsW) === true) && ['pwStale', 'pwBarStale', 'pwNoMap'].every(id => FCx.isPortal(Ww.tok(id), roomsW) === false),
            J([waysGot.filter((r, i) => J(r) !== J(waysWant[i])), wallWays.filter(p => J(Ww.tok(p.id)) !== J(p)).map(p => p.id)]));
        // player to host: a map copy
        const Wq = pW(); Wq.camp.items.mA.whiteboard.push({ id: 'plDraw', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 700, w: 10, h: 10, baseW: 10, baseH: 10, z: 35, pts: [[0, 0], [10, 10]], color: '#e9e9f0', strokeWidth: 3, targetMapId: 'mB', portalLock: true },   // a drawing of hers the GM made a portal and locked
            { id: 'plPlain', type: 'path', byPlayer: true, ownerId: 'u_a', x: 700, y: 700, w: 10, h: 10, baseW: 10, baseH: 10, z: 35, pts: [[0, 0], [10, 10]], color: '#e9e9f0', strokeWidth: 3 });   // and a plain drawing of hers
        Wq.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [
            { id: 'pLock', type: 'rect', x: 600, y: 600, w: 50, h: 50, targetMapId: 'mB' },                                // the GM's locked portal sent back without its flag
            { id: 'pOpen', type: 'rect', x: 700, y: 600, w: 50, h: 50, targetMapId: 'mB', portalLock: true },             // the GM's open portal sent back locked
            Object.assign({}, Wq.tok('tA'), { portalLock: true, targetMapId: 'mB' }),                                      // her own token sent as a locked portal
            { id: 'plDraw', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 700, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [5, 9]], portalLock: false },   // her own drawing redrawn, its lock sent as false
            { id: 'plPlain', type: 'path', byPlayer: true, ownerId: 'u_a', x: 700, y: 700, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [7, 7]], portalLock: true, targetMapId: 'mB' },   // her plain drawing redrawn and sent as a locked portal
            { id: 'wbnewP', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [5, 5]], portalLock: true, targetMapId: 'mB', nodeId: 'r1' }] } }, Wq.a1);   // a new drawing of hers sent as a locked portal
        const drewP = Wq.tok('wbnewP'), redrewP = Wq.tok('plDraw'), plainP = Wq.tok('plPlain'), afterFull = [Wq.tok('pLock').portalLock, hasK(Wq.tok('pOpen'), 'portalLock'), hasK(Wq.tok('tA'), 'portalLock'), hasK(Wq.tok('tA'), 'targetMapId')];
        Wq.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [Object.assign({}, Wq.tok('tA'), { x: Wq.tok('tA').x })] } }, Wq.a1);   // a copy that leaves the GM's portals out altogether
        const afterLean = [!!Wq.tok('pLock') && Wq.tok('pLock').portalLock, !!Wq.tok('pOpen') && hasK(Wq.tok('pOpen'), 'portalLock'), !!Wq.tok('pHidTrap') && Wq.tok('pHidTrap').portalLock];
        check('portal lock (host, a player\'s map copy — the real patch path): nothing a copy says sets a portal\'s lock or clears it — the GM\'s locked portal sent back without its flag, or left out of the copy altogether, is locked still; the GM\'s open portal sent back locked stays open; her own token sent as a locked portal takes no lock and no destination; a new drawing of hers sent as a locked portal is taken as the drawing alone, and so is a plain drawing of hers she redraws as one (the redraw lands, the lock and the destination do not); and a drawing of hers the GM made a portal and locked stays one when she redraws it with the lock sent as false; the patch path and the drawing\'s whitelist never name the flag',
            J(afterFull) === J([true, false, false, false]) && !!drewP && !hasK(drewP, 'portalLock') && !hasK(drewP, 'targetMapId') && !hasK(drewP, 'nodeId') && !!redrewP && redrewP.portalLock === true && redrewP.targetMapId === 'mB' && J(redrewP.pts) === J([[0, 0], [5, 9]])
            && !!plainP && J(plainP.pts) === J([[0, 0], [7, 7]]) && !hasK(plainP, 'portalLock') && !hasK(plainP, 'targetMapId') && J(afterLean) === J([true, false, true]) && !/portalLock/.test(bw('patch', 'netfog.js')) && !/portalLock/.test(fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js')), J([afterFull, drewP, redrewP, plainP, afterLean]));
    }
    // a piece's fog mark (1.5.4: Under fog, Always revealed) on the wire, in the same one-module world: host to player with a shown piece and only
    // as its two words; player to host nothing sets it and nothing clears it
    {
        const fW = () => { const W = S7({}); const m = W.camp.items.mA;
            m.whiteboard.push({ id: 'fHide', type: 'image', x: 600, y: 800, w: 100, h: 100, fogHand: 'hide' }, { id: 'fShow', type: 'rect', x: 800, y: 800, w: 50, h: 50, fogHand: 'show' }, { id: 'fPlain', type: 'rect', x: 900, y: 800, w: 50, h: 50 },
                { id: 'fWord', type: 'rect', x: 1000, y: 800, w: 50, h: 50, fogHand: 'yes' }, { id: 'fGone', type: 'image', x: 5000, y: 5200, w: 50, h: 50, fogHand: 'hide', hidden: true },
                { id: 'fhDraw', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 900, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [5, 9]] });
            m.meta = Object.assign({}, m.meta, { updated: (m.meta && m.meta.updated || 0) + 1 }); W.clearSent(); return W; };
        const hasK = (w, k) => !!w && Object.prototype.hasOwnProperty.call(w, k), fk = (m, id) => { const w = m && m.whiteboard.find(x => x.id === id); return w ? (hasK(w, 'fogHand') ? w.fogHand : 'none') : null; };
        const Wf = fW(); Wf.net.sendItem('k', 'mA');
        const fcA = Wf.last(Wf.a1), fcB = Wf.last(Wf.b1), cloneF = Wf.api.clean(Wf.camp.items.mA), allF = J(Wf.a1.sent.concat(Wf.a2.sent, Wf.b1.sent));
        const Wg = fW();
        Wg.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [
            { id: 'fHide', type: 'image', x: 600, y: 800, w: 100, h: 100 },                                   // the GM's Under fog picture sent back with no mark
            { id: 'fShow', type: 'rect', x: 800, y: 800, w: 50, h: 50, fogHand: 'hide' },                     // the Always revealed one sent back as Under fog
            { id: 'fPlain', type: 'rect', x: 900, y: 800, w: 50, h: 50, fogHand: 'show', page: 'plan_x' },                    // a plain piece sent back marked (and, backlog 125, as a pin)
            Object.assign({}, Wg.tok('tA'), { fogHand: 'show', page: 'plan_x' }),                                              // her own token marked
            { id: 'fhDraw', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 900, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [6, 6]], fogHand: 'hide' },   // her own drawing redrawn with a mark
            { id: 'wbnewF', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [5, 5]], fogHand: 'show', page: 'plan_x' }] } }, Wg.a1);   // a new drawing with one
        check('backlog 125 a pin (host, a player\'s map copy): nothing a player\'s copy says makes a piece a pin: the GM\'s piece sent back naming a page, her own token and her new drawing take no page key',
            !hasK(Wg.tok('fPlain'), 'page') && !hasK(Wg.tok('tA'), 'page') && !!Wg.tok('wbnewF') && !hasK(Wg.tok('wbnewF'), 'page') && !/\.page\b/.test(bw('patch', 'netfog.js')), J([hasK(Wg.tok('fPlain'), 'page'), hasK(Wg.tok('tA'), 'page'), hasK(Wg.tok('wbnewF'), 'page')]));
        const afterF = [Wg.tok('fHide').fogHand, Wg.tok('fShow').fogHand, hasK(Wg.tok('fPlain'), 'fogHand'), hasK(Wg.tok('tA'), 'fogHand'), !!Wg.tok('fhDraw') && J(Wg.tok('fhDraw').pts) === J([[0, 0], [6, 6]]), hasK(Wg.tok('fhDraw'), 'fogHand'), !!Wg.tok('wbnewF'), hasK(Wg.tok('wbnewF'), 'fogHand')];
        check('a piece\'s fog mark (host, the wire and a player\'s map copy — the real sends and patch path): a shown piece marked Under fog or Always revealed reaches each player with its mark, on a player\'s own copy and on the shared clone, so their own overlay reads what the host judges by; an unmarked one carries no key; a word that is no mark on the host\'s own map is sent as nothing (its own map untouched); a hidden one reaches no one. Nothing a player\'s copy says sets a mark, changes it or clears it: the GM\'s Under fog picture sent back without it keeps it, the Always revealed one sent back as Under fog stays as it was, a plain piece sent back marked takes none, and her own token, her redrawn drawing (the redraw itself lands) and a new drawing take none; the patch path and playerStroke never name the key',
            fk(fcA, 'fHide') === 'hide' && fk(fcB, 'fHide') === 'hide' && fk(cloneF, 'fHide') === 'hide' && fk(fcA, 'fShow') === 'show' && fk(cloneF, 'fShow') === 'show' && fk(fcA, 'fPlain') === 'none' && fk(fcA, 'fWord') === 'none' && fk(cloneF, 'fWord') === 'none' && !/fGone/.test(allF) && !/fGone/.test(J(cloneF)) && Wf.tok('fWord').fogHand === 'yes'
            && J(afterF) === J(['hide', 'show', false, false, true, false, true, false]) && fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem').includes("    if (w.fogHand !== undefined && w.fogHand !== 'hide' && w.fogHand !== 'show') delete w.fogHand;") && !/fogHand/.test(bw('patch', 'netfog.js')) && !/fogHand/.test(fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js')),
            J([fk(fcA, 'fHide'), fk(cloneF, 'fHide'), fk(fcA, 'fShow'), fk(fcA, 'fPlain'), fk(fcA, 'fWord'), /fGone/.test(allF), afterF]));
    }
    // drawings to show (1.6.2) on the wire, in the same one-module world, with the real fogcore: host to player only as the cleaner keeps them; a player's NEW
    // drawing is one whatever their copy says, and nothing else a copy says sets the mark, changes it or clears it; a drawing taken away a moment ago is not
    // added again by a copy made before that reached them; the ask's branch names to the GM only what it may
    {
        const pen = (id, more) => Object.assign({ id, type: 'path', x: 600, y: 900, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [5, 9]] }, more || {});
        const sW = () => { const W = S7({}); const m = W.camp.items.mA;
            m.whiteboard.push(pen('sGm', { toShow: true, showFor: 'scene' }), pen('sWord', { toShow: 'yes', showFor: 'fade' }), pen('sLong', { toShow: true, showFor: 'always' }), pen('sWall', { toShow: true, blocksSight: true, sightType: 'wall' }), pen('sHid', { toShow: true, hidden: true }), { id: 'sBox', type: 'rect', x: 900, y: 900, w: 50, h: 50, toShow: true },
                pen('sPlain'), pen('sMine', { toShow: true, showFor: 'fade', byPlayer: true, ownerId: 'u_a' }), pen('sOld', { byPlayer: true, ownerId: 'u_a' }), pen('sOther', { toShow: true, byPlayer: true, ownerId: 'u_b' }));
            m.meta = Object.assign({}, m.meta, { updated: (m.meta && m.meta.updated || 0) + 1 }); W.clearSent(); return W; };
        const hasK = (w, k) => !!w && Object.prototype.hasOwnProperty.call(w, k), sk = (m, id) => { const w = m && m.whiteboard.find(x => x.id === id); return !w ? null : (hasK(w, 'toShow') ? w.toShow : 0) + ':' + (hasK(w, 'showFor') ? w.showFor : 0); };
        const Ws = sW(); Ws.net.sendItem('k', 'mA');
        const sA = Ws.last(Ws.a1), cloneS = Ws.api.clean(Ws.camp.items.mA), allS = J(Ws.a1.sent.concat(Ws.a2.sent, Ws.b1.sent));
        check('a drawing to show (host, the wire, the real sends): a shown one reaches every player with its mark and how long it stays, on a player\'s own copy of a fogged map and on the shared clone; a word that is no mark, a word for how long that is none, a wall and a shape are sent as nothing (the host\'s own map untouched); a hidden one reaches no one; a plain drawing has no key',
            ['sGm', 'sMine'].every(id => sk(sA, id) === sk(cloneS, id)) && sk(sA, 'sGm') === 'true:scene' && sk(sA, 'sMine') === 'true:fade' && sk(sA, 'sWord') === '0:0' && sk(sA, 'sLong') === 'true:0' && sk(sA, 'sWall') === '0:0' && sk(sA, 'sBox') === '0:0' && sk(sA, 'sPlain') === '0:0' && !/sHid/.test(allS) && !/sHid/.test(J(cloneS)) && Ws.tok('sWord').toShow === 'yes',
            J(['sGm', 'sMine', 'sWord', 'sLong', 'sWall', 'sBox', 'sPlain'].map(id => sk(sA, id))));
        const Wp = sW(), touched = []; Wp.winRef.wpDrawShow = { touch: id => touched.push(id) };
        Wp.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [
            pen('sGm'), pen('sPlain', { toShow: true, showFor: 'fade' }), pen('sOther'), Object.assign({}, Wp.tok('tA'), { toShow: true }),
            pen('sMine', { pts: [[0, 0], [6, 6]], byPlayer: true, ownerId: 'u_a' }),                                                    // her drawing to show redrawn, naming no mark
            pen('sOld', { pts: [[0, 0], [7, 7]], toShow: true, showFor: 'fade', byPlayer: true, ownerId: 'u_a' }),   // her map drawing redrawn as one
            pen('wbNew1', { ownerId: 'u_a' }),                                                          // a new drawing that names no mark
            pen('wbNew2', { ownerId: 'u_a', toShow: false, showFor: 'scene' }),                         // a new one that says it is none
            pen('wbNew3', { ownerId: 'u_a', toShow: true, showFor: 'always' })] } }, Wp.a1);
        const afterS = ['sGm', 'sPlain', 'sOther', 'tA', 'sMine', 'sOld', 'wbNew1', 'wbNew2', 'wbNew3'].map(id => sk({ whiteboard: Wp.camp.items.mA.whiteboard }, id));
        check('a drawing to show (host, a player\'s map copy, the real patch path): a new drawing of a player\'s is one whatever their copy says, so no patched app draws on the map without the GM\'s word, how long it stays only as a word of the list; the map it stands on is watched from then on; nothing else a copy says sets, changes or clears the mark: the GM\'s drawing sent back with none keeps it, a plain one sent back marked takes none, a redraw of their own drawing to show keeps it and a redraw of a map drawing of theirs takes none, and the redraws land',
            J(afterS) === J(['true:scene', '0:0', 'true:0', '0:0', 'true:fade', '0:0', 'true:0', 'true:scene', 'true:0']) && J(Wp.tok('sMine').pts) === J([[0, 0], [6, 6]]) && J(Wp.tok('sOld').pts) === J([[0, 0], [7, 7]]) && J([...new Set(touched)]) === J(['mA']) && !/toShow|showFor/.test(fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js')), J([afterS, touched]));
        const Wg2 = sW(); Wg2.net.showDropped('mA', ['wbGone', 7]); const has0 = [Wg2.api.showGoneHas('mA', 'wbGone'), Wg2.api.showGoneHas('mB', 'wbGone'), Wg2.api.showGoneHas('mA', 'wbOther')];
        Wg2.api.item({ type: 'item', campId: 'k', itemId: 'mA', a: 4, item: { id: 'mA', type: 'map', whiteboard: [Object.assign({}, Wg2.tok('tA')), pen('wbGone', { ownerId: 'u_a', byPlayer: true, toShow: true })] } }, Wg2.a1);
        const refused = !Wg2.tok('wbGone'), whole = Wg2.last(Wg2.a1), realNow = Date.now; Date.now = () => realNow() + 11000;
        const late = Wg2.api.showGoneHas('mA', 'wbGone'); Date.now = realNow;
        check('a drawing to show taken away: a copy of a player\'s made before that reached them adds nothing and is answered with the map whole, for its map alone and for a few seconds; after them the same id is a new drawing', J(has0) === J([true, false, false]) && refused && !!whole && !whole.whiteboard.some(w => w.id === 'wbGone') && late === false, J([has0, refused, !!whole, late]));
        const Wk = sW(), asked = []; Wk.winRef.wpDrawShow = { asked: q => asked.push(q) }; Wk.net.roster.pA1.location = 'mA'; Wk.net.roster.pB.location = 'mA';
        const ask = (conn, m) => { asked.length = 0; Wk.api.showAskIn(Object.assign({ type: 'show-ask', campId: 'k', itemId: 'mA', ids: ['sMine'] }, m || {}), conn); return J(asked); };
        const okA = ask(Wk.a1), mixed = ask(Wk.a1, { ids: ['sMine', 'sOther', 'sGm', 'sOld', 'sHid', 'tA', 'nope', 7] }), notHers = ask(Wk.b1), noRoster = ask({ peer: 'pX' }), otherCamp = ask(Wk.a1, { campId: 'x' }), noList = ask(Wk.a1, { ids: 'sMine' }), emptyL = ask(Wk.a1, { ids: [] }), tooMany = ask(Wk.a1, { ids: Array(61).fill('sMine') }), notText = ask(Wk.a1, { itemId: 7 });
        Wk.net.roster.pA1.location = 'mB'; const elsewhere = ask(Wk.a1); Wk.net.roster.pA1.location = 'mA'; Wk.net.paused = true; const paused = ask(Wk.a1); Wk.net.paused = false;
        const Wl = sW(); Wl.net.roster.pA1.location = 'mA'; Wl.winRef.wpDrawShow = { asked: q => asked.push(q) }; asked.length = 0; const savesB = Wl.saves; Wl.api.showAskIn({ type: 'show-ask', campId: 'k', itemId: 'mA', ids: ['sMine'] }, Wl.a1); const sentNone = Wl.a1.sent.length + Wl.b1.sent.length;
        check('the ask (host, its branch run for real): an admitted player names drawings of their own to show on the map they are on, and only those reach the GM, by their id and name; nothing for another\'s drawing, the GM\'s, a hidden one, a map drawing, a token or an id that is none; nothing from a connection that is not admitted, for another campaign, another map, past 60 ids, with no list, or while the table or the player is paused; nothing is stored, saved or sent',
            okA === J([{ pid: 'u_a', name: 'Pat', mapId: 'mA', ids: ['sMine'] }]) && mixed === okA && [notHers, noRoster, otherCamp, noList, emptyL, tooMany, notText, elsewhere, paused].every(a => a === '[]') && Wl.saves === savesB && sentNone === 0 && asked.length === 1 && Wk.tok('sMine').toShow === true,
            J([okA, mixed, notHers, noRoster, otherCamp, noList, emptyL, tooMany, notText, elsewhere, paused]));
        const Wc = sW(); Wc.net.role = 'client'; Wc.net.foreign = true; Wc.net.conns = [Wc.a1]; const sends = () => Wc.a1.sent.filter(m => m.type === 'show-ask');
        const before = Wc.net.showAsk('mA', ['s1']), k0 = Wc.net.showKnown(); Wc.api.showKnows(true); const k1 = Wc.net.showKnown(), sent1 = Wc.net.showAsk('mA', ['s1', 's2']), odd = [undefined, null, 1, 'true', {}].map(v => { Wc.api.showKnows(v); return Wc.net.showKnown(); }); Wc.api.showKnows(true);
        const noIds = [Wc.net.showAsk('mA', []), Wc.net.showAsk('mA', 'x'), Wc.net.showAsk(7, ['s1'])]; Wc.a1.open = false; const shut = Wc.net.showAsk('mA', ['s1']); Wc.a1.open = true; Wc.net.foreign = false; const own1 = Wc.net.showAsk('mA', ['s1']); Wc.net.role = 'host'; const hostK = Wc.net.showKnown();
        check('the ask (a player\'s app, net.showAsk and the host\'s word): sent only once its host\'s snapshot said drawShow, and only as true; the map and the ids, and nothing else; never with no ids, a connection that is down, or a campaign of its own; the machine that hosts always knows it',
            before === false && k0 === false && k1 === true && sent1 === true && odd.every(v => v === false) && J(sends()) === J([{ type: 'show-ask', campId: 'k', itemId: 'mA', ids: ['s1', 's2'] }]) && noIds.every(v => v === false) && shut === false && own1 === false && hostK === true, J([sends(), noIds, shut, own1]));
        const showA = require('./checkkit').part('netfog.js').indexOf('function strokeShow('), kept = src.includes('hits: true, paused: net.paused, drawShow: true, pausedSelf:') && /\n    if \(typeof hitsKnow === 'function'\) hitsKnow\(msg\.hits\);[^\n]*\n    if \(typeof showKnows === 'function'\) showKnows\(msg\.drawShow\);/.test(require('./checkkit').part('netfog.js'));
        check('a drawing to show (source): the snapshot says drawShow and applySnapshot takes it through typeof after the host\'s other words; the rule that sends one piece and the player\'s app ask one cleaner, with none at hand none goes; the host stamps in one place, after playerStroke, and the last fight on a map asks the drawings that stay until then',
            showA > 0 && kept && fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem').includes("if (FCsw && typeof FCsw.keepShow === 'function') FCsw.keepShow(w); else { delete w.toShow; delete w.showFor; }") && src.includes("if (FCsh && typeof FCsh.keepShow === 'function') FCsh.keepShow(w); else { delete w.toShow; delete w.showFor; }") && require('./checkkit').familyCount('net.js', /strokeShow\(stroke, w, msg\.itemId\)/g) === 1 && bw('patch', 'netfog.js').indexOf('strokeShow(stroke') > bw('patch', 'netfog.js').indexOf('var stroke = playerStroke(w, profile.id);')
            && fnSrc('function combatOver(', '\n}\n', 'combatOver').includes('window.wpDrawShow.sceneOver(mapId);'));
    }
    // a barrier's Stops blasts tick (the owner, 2026-10-03: "A tick per barrier") on the wire, in the same one-module world: host to player with a
    // shown barrier and only as true; player to host nothing sets it and nothing clears it
    {
        const bW = () => { const W = S7({}); const m = W.camp.items.mA;
            m.whiteboard.push({ id: 'bStop', type: 'rect', x: 600, y: 800, w: 50, h: 50, barrier: true, blastStop: true }, { id: 'bPlain', type: 'rect', x: 700, y: 800, w: 50, h: 50, barrier: true },
                { id: 'bWord', type: 'rect', x: 800, y: 800, w: 50, h: 50, barrier: true, blastStop: 'yes' }, { id: 'bHidB', type: 'rect', x: 5000, y: 5200, w: 50, h: 50, barrier: true, blastStop: true, hidden: true },
                { id: 'bsDraw', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 900, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [5, 9]] });
            m.meta = Object.assign({}, m.meta, { updated: (m.meta && m.meta.updated || 0) + 1 }); W.clearSent(); return W; };
        const hasK = (w, k) => !!w && Object.prototype.hasOwnProperty.call(w, k), bk = (m, id) => { const w = m && m.whiteboard.find(x => x.id === id); return w ? (hasK(w, 'blastStop') ? w.blastStop : 'none') : null; };
        const Wb = bW(); Wb.net.sendItem('k', 'mA');
        const bcA = Wb.last(Wb.a1), bcB = Wb.last(Wb.b1), cloneB = Wb.api.clean(Wb.camp.items.mA), allB = J(Wb.a1.sent.concat(Wb.a2.sent, Wb.b1.sent));
        const Wc = bW();
        Wc.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', whiteboard: [
            { id: 'bStop', type: 'rect', x: 600, y: 800, w: 50, h: 50, barrier: true },                       // the GM's ticked barrier sent back without its tick
            { id: 'bPlain', type: 'rect', x: 700, y: 800, w: 50, h: 50, barrier: true, blastStop: true },     // the GM's plain barrier sent back ticked
            Object.assign({}, Wc.tok('tA'), { barrier: true, blastStop: true }),                               // her own token as a ticked barrier
            { id: 'bsDraw', type: 'path', byPlayer: true, ownerId: 'u_a', x: 600, y: 900, w: 10, h: 10, baseW: 10, baseH: 10, pts: [[0, 0], [6, 6]], barrier: true, blastStop: true },   // her own drawing redrawn as one
            { id: 'wbnewB', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [5, 5]], barrier: true, blastStop: true }] } }, Wc.a1);   // a new drawing as one
        const afterB = [Wc.tok('bStop').blastStop, hasK(Wc.tok('bPlain'), 'blastStop'), hasK(Wc.tok('tA'), 'blastStop'), hasK(Wc.tok('tA'), 'barrier'), !!Wc.tok('bsDraw') && J(Wc.tok('bsDraw').pts) === J([[0, 0], [6, 6]]), hasK(Wc.tok('bsDraw'), 'blastStop'), hasK(Wc.tok('bsDraw'), 'barrier'), !!Wc.tok('wbnewB'), hasK(Wc.tok('wbnewB'), 'blastStop'), hasK(Wc.tok('wbnewB'), 'barrier')];
        check('a barrier\'s Stops blasts tick (host, the wire and a player\'s map copy — the real sends and patch path): a shown ticked barrier reaches each player with its tick, on a player\'s own copy and on the shared clone; an unticked one carries no key; a word on the host\'s own map is sent as nothing (its own map untouched); a hidden one reaches no one. Nothing a player\'s copy says sets the tick or clears it: the GM\'s ticked barrier sent back without it keeps it, the plain one sent back ticked takes none, her own token, her redrawn drawing (the redraw itself lands) and a new drawing take neither the tick nor the barrier; the patch path and playerStroke never name the key',
            bk(bcA, 'bStop') === true && bk(bcB, 'bStop') === true && bk(cloneB, 'bStop') === true && bk(bcA, 'bPlain') === 'none' && bk(bcA, 'bWord') === 'none' && bk(cloneB, 'bWord') === 'none' && !/bHidB/.test(allB) && !/bHidB/.test(J(cloneB)) && Wb.tok('bWord').blastStop === 'yes'
            && J(afterB) === J([true, false, false, false, true, false, false, true, false, false]) && fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem').includes('    if (w.blastStop !== undefined && w.blastStop !== true) delete w.blastStop;') && !/blastStop/.test(bw('patch', 'netfog.js')) && !/blastStop/.test(fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js')),
            J([bk(bcA, 'bStop'), bk(cloneB, 'bStop'), bk(bcA, 'bPlain'), bk(bcA, 'bWord'), /bHidB/.test(allB), afterB]));
    }
    // difficult terrain T1 (host): a shown piece reaches every player with its cost (their ruler reads it), a hidden one not at all
    {
        const tW = S7({}), mT = tW.camp.items.mA, tT = tW.tok('tA');
        mT.whiteboard.push({ id: 'bogV', type: 'rect', x: tT.x + 100, y: tT.y, w: 100, h: 100, terrain: 3 }, { id: 'bogC', type: 'hexagon', x: tT.x + 200, y: tT.y, w: 60, h: 52, fill: true, terrain: 2 }, { id: 'bogH', type: 'rect', x: tT.x + 300, y: tT.y, w: 100, h: 100, hidden: true, terrain: 4 });
        mT.meta = Object.assign({}, mT.meta, { updated: (mT.meta && mT.meta.updated || 0) + 1 }); tW.clearSent(); tW.net.sendItem('k', 'mA');
        const tA = tW.last(tW.a1), tB = tW.last(tW.b1), of = m => m ? ['bogV', 'bogC', 'bogH'].map(id => { const w = m.whiteboard.find(x => x.id === id); return !w ? 'gone' : 'terrain' in w ? w.terrain : 'none'; }) : null;
        check('terrain T1 (host): a shown difficult piece and a painted cell reach each player with their cost; the cost of a hidden one reaches no one (what a hidden piece sends carries none)',
            J(of(tA).slice(0, 2)) === J([3, 2]) && J(of(tB).slice(0, 2)) === J([3, 2]) && of(tA)[2] !== 4 && of(tB)[2] !== 4 && !/"terrain":4/.test(J(tW.a1.sent)) && !/"terrain":4/.test(J(tW.b1.sent)), J([of(tA), of(tB)]));
    }
    // item 19b H5 (host): a shown piece's ground height reaches every player with the piece (their app reads the ground from its own copy); a hidden
    // piece is not sent at all; a player's copy of the map sets no ground
    {
        const gW = S7({}), mG = gW.camp.items.mA, tG = gW.tok('tA');
        mG.whiteboard.push({ id: 'hillV', type: 'rect', x: tG.x - 50, y: tG.y - 50, w: 200, h: 200, ground: 3 }, { id: 'pitV', type: 'path', tip: 'fill', x: tG.x + 300, y: tG.y, w: 100, h: 100, baseW: 100, baseH: 100, pts: [[0, 0], [100, 0], [100, 100], [0, 100]], ground: -2 }, { id: 'hillH', type: 'rect', x: tG.x + 500, y: tG.y, w: 100, h: 100, hidden: true, ground: 44 });
        mG.meta = Object.assign({}, mG.meta, { updated: (mG.meta && mG.meta.updated || 0) + 1 }); gW.clearSent(); gW.net.sendItem('k', 'mA');
        const gA = gW.last(gW.a1), gB = gW.last(gW.b1), gOf = m => m ? ['hillV', 'pitV', 'hillH'].map(id => { const w = m.whiteboard.find(x => x.id === id); return !w ? 'gone' : 'ground' in w ? w.ground : 'none'; }) : null;
        const cloneG = gW.api.clean(mG), allG = J(gW.a1.sent.concat(gW.a2.sent, gW.b1.sent)), pageG = gW.a1.page && gW.a1.page.camp().items.mA;
        const stroke = { id: 'wbstroke1', type: 'path', tip: 'fill', ownerId: 'u_a', x: 0, y: 0, w: 100, h: 100, baseW: 100, baseH: 100, pts: [[0, 0], [100, 0], [100, 100]], ground: 9 };
        const mine = JSON.parse(J(gA || { whiteboard: [] })); mine.whiteboard.forEach(w => { if (w.id === 'hillV') w.ground = 99; if (w.id === 'tA') w.ground = 9; if (w.id === 'pitV') delete w.ground; }); mine.whiteboard.push(stroke);
        gW.api.item({ type: 'item', campId: 'k', itemId: 'mA', item: mine }, gW.a1);
        const after = ['hillV', 'pitV', 'hillH', 'tA', 'wbstroke1'].map(id => { const w = mG.whiteboard.find(x => x.id === id); return !w ? 'gone' : 'ground' in w ? w.ground : 'none'; }), drew = mG.whiteboard.find(x => x.id === 'wbstroke1');
        check('item 19b H5 (host): a shown piece\'s ground height — a hill, a filled region as a pit — reaches each player with the piece and stands on their page; a hidden piece is not sent, nor its ground in anything sent; a player\'s copy of the map sets no ground: the GM\'s pieces keep theirs, their own token takes none and a drawing of theirs lands as a pen line with none',
            J(gOf(gA)) === J([3, -2, 'gone']) && J(gOf(gB)) === J([3, -2, 'gone']) && !/hillH|"ground":44/.test(allG) && J(gOf(cloneG)) === J([3, -2, 'gone']) && J(gOf(pageG)) === J([3, -2, 'gone'])
            && J(after) === J([3, -2, 44, 'none', 'none']) && !!drew && !('tip' in drew), J([gOf(gA), gOf(gB), gOf(cloneG), gOf(pageG), after, drew && Object.keys(drew)]));
        const wireSrc = fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem');
        check('item 19b H5 (source): the rule that sends one piece to a player names no ground (it is the table\'s to read: a player\'s app works its own token\'s height out from its copy), and sends nothing of a hidden piece; a player\'s drawing is rebuilt from a list of keys that holds none, and it names a nib in one statement alone, which hands on the nib the copy named and never names the Fill tip (round three of Match a wall: a player\'s line keeps its square or its flat nib, and a filled region is still no drawing a player hands the host); the player\'s app cleans it again before it returns the piece',
            !/ground/.test(wireSrc) && /if \(w\.gmNoteFor \|\| w\.hidden\) return null;/.test(wireSrc) && (pSt => !/ground/.test(pSt) && (pSt.match(/\.tip\b/g) || []).length === 4 && !/['"]fill['"]/.test(pSt) && !/\.tip\s*=[^=]/.test(pSt.replace('out.tip = w.tip;', '')))(require('./checkkit').cut('netfog.js', 'function playerStroke(', '\n}\n'))
            && /if \(w\.ground !== undefined\) \{ var FCg = window\.wpFogCore, gr = FCg && FCg\.cleanGround \? FCg\.cleanGround\(w\.ground\) : null; if \(gr\) w\.ground = gr; else delete w\.ground; \} return w; \}/.test(src));
    }
    // senses S4b: "Marks in a fight" played On your own turn — the host's refreshes of each player's held marks (slice marksheld, run on stubs)
    {
        const mhSrc = bw('marksheld');
        const mhWorld = (o) => {
            const calls = { hold: [], catch: [], forget: [], landed: [] }, oo = o || {};
            const camp = { id: 'k', fog: { fields: {}, defaults: oo.live ? { sight: 0 } : { sight: 0, marks: 'turn' } }, items: { m1: { id: 'm1', type: 'map', fog: { on: oo.unfogged !== true }, whiteboard: [{ id: 'ta', isChar: true, ownerId: 'u_a' }, { id: 'tb', isChar: true, ownerId: 'u_b' }, { id: 'tc', isChar: true, ownerId: 'u_c' }, { id: 'npc', isChar: true }, { id: 'hid', isChar: true, ownerId: 'u_h', hidden: true }, { id: 'wt', waiting: true, ownerId: 'u_w' }, { id: 'rock', type: 'rect', ownerId: 'u_r' }] } } };
            const net = { active: true, role: oo.role || 'host', conns: [{ peer: 'pa', open: true }, { peer: 'pa2', open: true }, { peer: 'pb', open: true }, { peer: 'pd', open: true }, { peer: 'px', open: false }, { peer: 'pz', open: true }], roster: { pa: { id: 'u_a' }, pa2: { id: 'u_a' }, pb: { id: 'u_b' }, pd: { id: 'u_d' }, px: { id: 'u_x' } }, combats: oo.noFight ? {} : { m1: { mapId: 'm1', rows: [{ tokId: 'ta' }, { tokId: 'npc' }, { tokId: 'tb' }, { name: 'Custom' }], turn: oo.turn || 0, round: 1 } } };   // fold 2: a fight names its map
            if (oo.second) net.combats.f_bridge01 = { id: 'f_bridge01', mapId: 'm1', rows: [{ tokId: 'tc' }, { tokId: 'wt' }], turn: oo.second.turn || 0, round: 1 };   // fold 2: a second fight on the same map
            const env = { net, window: { wpFog: { marksHold: (pid, cp, m, drop) => calls.hold.push([pid, m.id, drop && drop.dropFor]), marksForget: id => calls.forget.push(id) } }, getActiveCampaign: () => camp, own: (ob, k) => Object.prototype.hasOwnProperty.call(ob, k), mapFogged: m => !!(m && m.fog && m.fog.on), fogDrop: (cp, m, pid) => ({ dropFor: pid }),
                fogLanded: (id, fn) => { calls.landed.push(id); return fn(); }, fogCatchUp: (c, cp, m, pid, memo) => { calls.catch.push([c.peer, pid, m.id]); memo.n = (memo.n || 0) + 1; } };
            const api = new Function('env', "'use strict';\nvar net = env.net, window = env.window, getActiveCampaign = env.getActiveCampaign, own = env.own, mapFogged = env.mapFogged, fogDrop = env.fogDrop, fogLanded = env.fogLanded, fogCatchUp = env.fogCatchUp;\n" + ordersSrc + '\n' + mhSrc + '\nreturn { marksTurn: marksTurn, marksRound: marksRound, marksStart: marksStart, marksEnd: marksEnd, marksOwnMoved: marksOwnMoved };')(env);
            api.calls = calls; api.net = net; api.camp = camp; return api;
        };
        const mhT = mhWorld(); mhT.marksTurn('m1', mhT.net.combats.m1);
        const mhNpc = mhWorld({ turn: 1 }); mhNpc.marksTurn('m1', mhNpc.net.combats.m1);
        const mhCustom = mhWorld({ turn: 3 }); mhCustom.marksTurn('m1', mhCustom.net.combats.m1);
        const mhOff = [mhWorld({ live: true }), mhWorld({ unfogged: true }), mhWorld({ role: 'client' })].map(w => { w.marksTurn('m1', w.net.combats.m1); w.marksRound('m1', w.net.combats.m1); w.marksOwnMoved('m1', [{ id: 'ta', ownerId: 'u_a' }], 'u_a'); return w.calls.hold.length + w.calls.catch.length; });
        const mhOther = mhWorld(); mhOther.marksTurn('nope', mhOther.net.combats.m1); mhOther.marksTurn('constructor', mhOther.net.combats.m1); mhOther.marksTurn('m1', null);
        check('S4b marksTurn (host): a token\'s turn starting takes its player\'s marks afresh (judged with every open drag at its start, on their own drop set) and catches every connection of theirs up; an NPC\'s or a custom row\'s turn, a table playing As they move, an unfogged map, a player\'s app or a map the campaign lacks takes nothing',
            J(mhT.calls.hold) === J([['u_a', 'm1', 'u_a']]) && J(mhT.calls.catch) === J([['pa', 'u_a', 'm1'], ['pa2', 'u_a', 'm1']]) && J(mhT.calls.landed) === J(['m1'])
            && mhNpc.calls.hold.length === 0 && mhCustom.calls.hold.length === 0 && J(mhOff) === J([0, 0, 0]) && mhOther.calls.hold.length === 0 && mhOther.calls.catch.length === 0, J([mhT.calls, mhOff]));
        const mhR = mhWorld(); mhR.marksRound('m1', mhR.net.combats.m1);
        // fold 2's review: with a second fight on the map a new round of either takes afresh the marks of the players with no token in ANY fight there
        const mhR2 = mhWorld({ second: { turn: 0 } }); mhR2.marksRound('m1', mhR2.net.combats.m1); const mhR3 = mhWorld({ second: { turn: 0 } }); mhR3.marksRound('m1', mhR3.net.combats.f_bridge01);
        check('S4b marksRound (host): a new round takes afresh the marks of each player with no token in the fight — those with a token on the map (never by a hidden token or a plain shape) and every admitted one — and catches their connections up; players whose token has a row wait for its turn; fold 2\'s review: with two fights on the map, a row in either counts, whichever fight\'s round it is',
            J(mhR.calls.hold.map(h => h[0])) === J(['u_c', 'u_w', 'u_d']) && J(mhR.calls.catch) === J([['pd', 'u_d', 'm1']])
            && J(mhR2.calls.hold.map(h => h[0])) === J(['u_d']) && J(mhR2.calls.catch) === J([['pd', 'u_d', 'm1']]) && J(mhR3.calls.hold.map(h => h[0])) === J(['u_d']), J([mhR.calls, mhR2.calls, mhR3.calls]));
        const mhS = mhWorld(); mhS.marksStart('m1'); const mhSl = mhWorld({ live: true }); mhSl.marksStart('m1');
        check('S4b marksStart (host): a fight beginning forgets what was held on that map and takes everyone\'s marks from now (every player with a token there and every admitted one), catching each connection up; a table playing As they move only forgets',
            J(mhS.calls.forget) === J(['m1']) && J(mhS.calls.hold.map(h => h[0])) === J(['u_a', 'u_b', 'u_c', 'u_w', 'u_d']) && J(mhS.calls.catch.map(c => c[0])) === J(['pa', 'pa2', 'pb', 'pd']) && J(mhSl.calls.forget) === J(['m1']) && mhSl.calls.hold.length === 0 && mhSl.calls.catch.length === 0, J([mhS.calls, mhSl.calls]));
        const mhE = mhWorld({ noFight: true }); mhE.marksEnd('m1'); const mhEl = mhWorld({ live: true, noFight: true }); mhEl.marksEnd('m1'); const mhEc = mhWorld({ role: 'client', noFight: true }); mhEc.marksEnd('m1');
        check('S4b marksEnd (host): a fight ending forgets what was held on that map and catches every admitted connection up (the marks follow every move again), judged with every open drag at its start; As they move, or a player\'s app, only forgets',
            J(mhE.calls.forget) === J(['m1']) && mhE.calls.hold.length === 0 && J(mhE.calls.catch.map(c => c[0] + ':' + c[1])) === J(['pa:u_a', 'pa2:u_a', 'pb:u_b', 'pd:u_d']) && J(mhE.calls.landed) === J(['m1']) && J(mhEl.calls.forget) === J(['m1']) && mhEl.calls.catch.length === 0 && mhEc.calls.catch.length === 0, J([mhE.calls, mhEl.calls]));
        const own1 = mhWorld(); own1.marksOwnMoved('m1', [{ id: 'ta', ownerId: 'u_a' }], 'u_a');
        const own2 = mhWorld(); own2.marksOwnMoved('m1', [{ id: 'tb', ownerId: 'u_b' }], 'u_b'); own2.marksOwnMoved('m1', [{ id: 'ta', ownerId: 'u_a' }], 'u_b'); own2.marksOwnMoved('m1', [null], 'u_a');
        const own3 = mhWorld({ turn: 2 }); own3.marksOwnMoved('m1', [{ id: 'tc', ownerId: 'u_c' }, { id: 'tb', ownerId: 'u_b' }], 'u_b');
        const own4 = mhWorld({ noFight: true }); own4.marksOwnMoved('m1', [{ id: 'ta', ownerId: 'u_a' }], 'u_a'); const own5 = mhWorld({ turn: 3 }); own5.marksOwnMoved('m1', [{ id: 'ta', ownerId: 'u_a' }], 'u_a');
        // fold 2's review: a second fight on the map (Cy's token and the waiting token): Cy's drop on his own turn there takes his marks, off it nothing
        const own6 = mhWorld({ second: { turn: 0 } }); own6.marksOwnMoved('m1', [{ id: 'tc', ownerId: 'u_c' }], 'u_c'); const own7 = mhWorld({ second: { turn: 1 } }); own7.marksOwnMoved('m1', [{ id: 'tc', ownerId: 'u_c' }], 'u_c');
        check('S4b marksOwnMoved (host): a player\'s own drop takes their marks afresh only when one of the tokens is theirs and on its turn; another player\'s token, one off its turn, no fight or a custom row\'s turn takes nothing; fold 2\'s review: on its turn in the second fight on the map too',
            J(own1.calls.hold.map(h => h[0])) === J(['u_a']) && J(own1.calls.catch.map(c => c[0])) === J(['pa', 'pa2']) && own2.calls.hold.length === 0 && J(own3.calls.hold.map(h => h[0])) === J(['u_b']) && own4.calls.hold.length === 0 && own5.calls.hold.length === 0 && J(own6.calls.hold.map(h => h[0])) === J(['u_c']) && own7.calls.hold.length === 0, J([own1.calls, own3.calls, own6.calls, own7.calls]));
        check('S4b (source): the round hook, the turn hook, a fight\'s start and end, a player\'s drop on the pos gate and in a map copy, and a new table reach the held marks; nothing else calls them',
            /function roundChanged\(mapId, c\) \{[^\n]*if \(typeof marksRound === 'function'\) \{ try \{ marksRound\(mapId, c\); \}/.test(src) && /function turnStarted\(mapId, c\) \{[^\n]*if \(typeof marksTurn === 'function'\) \{ try \{ marksTurn\(mapId, c\); \}/.test(src)
            && /net\.combats\[fid\] = f;\n\s*if \(first && typeof marksStart === 'function'\) \{ try \{ marksStart\(mapId\); \}/.test(require('./checkkit').part('netfight.js')) && /if \(typeof fid === 'string'\) \{ delete net\.combats\[fid\];[^\n]*\n[^\n]*\n\s*if \(had && typeof marksEnd === 'function' && !fightsOn\(mapId\)\.length\) \{ try \{ marksEnd\(mapId\); \}/.test(src)
            && /fogForgetAll\(\);[^\n]*\n\s*if \(window\.wpFog && typeof window\.wpFog\.marksForget === 'function'\) window\.wpFog\.marksForget\(null\);/.test(src)
            && (src.match(/marksOwnMoved\(/g) || []).length === 3 && (src.match(/marksStart\(/g) || []).length === 3 /* 1.6.0: a fight that comes back (moved on purpose) */ && (src.match(/marksEnd\(/g) || []).length === 2 && (src.match(/marksTurn\(/g) || []).length === 2 && (src.match(/marksRound\(/g) || []).length === 2 && (src.match(/\.marksHold\(/g) || []).length === 1);
    }
    // fold M9: a final always lands — its own limiter (the host's real RateLimit on the world's clock), and a drop sends a final for every
    // dragged token on every grid
    const finalsTo = (W, id) => W.b1.sent.filter(m => m.type === 'pos' && m.wbId === id && m.final === true).length;
    const L1 = mk4({ realAllow: true }); L1.move(L1.a1, 'tA', 250, 100, false); L1.move(L1.a1, 'tA', 300, 100, true); const oneTick = [L1.place('tA'), finalsTo(L1, 'tA'), L1.timers.filter(t => t.ms === 250).length];
    const L2 = mk4({ realAllow: true }); ['tA_b', 'tA_c'].forEach((id, i) => L2.camp.items.mA.whiteboard.push(T(id, 'u_a', 'c_a', 3 + i, 3)));
    L2.move(L2.a1, 'tA', 250, 100, true); L2.move(L2.a1, 'tA_b', 300, 150, true); L2.move(L2.a1, 'tA_c', 350, 150, true); const three = [L2.place('tA'), L2.place('tA_b'), L2.place('tA_c')];
    const L3 = mk4({ realAllow: true }); let dial = 0; for (let i = 0; i < 300; i++) { L3.now = i * 33; L3.move(L3.a1, 'tA', 100, 100, true, 'mA', { rot: (i % 4) * 90 }); dial++; } const held10 = [finalsTo(L3, 'tA'), L3.place('tA')[2]];
    const L4 = mk4({ realAllow: true }); for (let i = 0; i < 241; i++) L4.move(L4.a1, 'tA', 100 + (i % 2) * 50, 100, true); const cap4 = finalsTo(L4, 'tA');
    const L5 = mk4({ realAllow: true }); L5.move(L5.a1, 'tA', 150, 100, false); L5.now = 5; L5.move(L5.a1, 'tA', 200, 100, false); const at5 = L5.place('tA')[0]; L5.now = 8; L5.move(L5.a1, 'tA', 250, 100, false); const at8 = L5.place('tA')[0];
    check('fold M9: a final has its own limiter (the host\'s real one on the world\'s clock): a drag\'s last move and its drop in the same instant both land (the drop written, relayed, saved); three tokens dropped in one gesture all land; the Facing dial held ten seconds at the key repeat (a final every 33 ms) lands every step; the 241st final within 4 s is refused; a drag\'s moves keep their 8 ms spacing',
        j(oneTick) === j([[300, 100, 0, 0], 1, 1]) && j(three) === j([[250, 100, 0, 0], [300, 150, 0, 0], [350, 150, 0, 0]]) && j(held10) === j([300, 270]) && cap4 === 240 && at5 === 150 && at8 === 250,
        j([oneTick, three, held10, cap4, at5, at8]));
    const dmS9 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'datamap.js'), 'utf8').replace(/\r\n/g, '\n');
    const seatA9 = dmS9.indexOf("if (modeStr === 'visual' && state.gridType === 'hex' && (cellRef || multiDrag.some("), finA9 = dmS9.indexOf("window.wpNet.streamPos(item, true, dragMapId); // final, post-snap position"), loop9 = dmS9.indexOf('multiDrag.forEach(function(md) { if (md.item !== item && (md.item.isChar || md.item.waiting) && !md.item.hidden) window.wpNet.streamPos(md.item, true, dragMapId); });');
    check('fold M9 (source): the two limiters have their own names and a final none of the drag\'s spacing; the drop sends a final for every other dragged character or waiting token that is not hidden, after the seat and before the one under the pointer, on every grid (no longer inside the hex seat)',
        /if \(!allow\(msg\.final \? 'posFinal' : 'pos', msg\.final \? \{ perMs: 0, burst: 240, windowMs: 4000, table: 20000 \} : \{ perMs: 8, burst: 240, windowMs: 4000, table: 20000 \}, conn\.peer\)\) return;/.test(src)
        && seatA9 > 0 && loop9 > seatA9 && finA9 > loop9 && (dmS9.match(/streamPos\(md\.item, true, dragMapId\)/g) || []).length === 1 && dmS9.slice(seatA9, loop9).indexOf('streamPos(md.item') < 0);

    // fold M10: the other entrances that sent the mover a whole map. A change of Sight catches their copies up in place; a map copy or threat
    // marks that changed something go whole to every other connection, the sender's own catching up in place when its fire comes
    const itemsTo = (W, c) => c.sent.filter(m => m.type === 'item').length, diffsTo = (W, c) => c.sent.filter(m => m.type === 'fogDiff');
    const S1 = S7(); S1.camp.chars.c_a.values.f_sight = 70; S1.net.sensesMoved('c_a'); S1.fire(500);
    const up10 = { a1: kinds(S1.a1), a2: kinds(S1.a2), b: kinds(S1.b1), add: (diffsTo(S1, S1.a1)[0] || {}).add, agree: agree(S1) };
    S1.net.conns.forEach(c => { c.sent.length = 0; }); S1.camp.chars.c_a.values.f_sight = 60; S1.net.sensesMoved('c_a'); S1.fire(500); const down10 = { a1: S1.a1.sent.map(m => m.type + ':' + J(m.drop || '')), agree: agree(S1) };
    const S2 = S7(); S2.camp.chars.c_a.values.f_sight = 70; S2.net.sensesMoved('c_a'); S2.net.sendItem('k', 'mA', S2.a1); S2.net.conns.forEach(c => { c.sent.length = 0; }); S2.fire(500); const between10 = [kinds(S2.a1), kinds(S2.a2)];
    const S3 = S7({ system: sysGm }); S3.camp.chars.c_a.values.f_sight = 70; S3.net.sensesMoved('c_a'); S3.fire(500); const hid10 = [kinds(S3.a1), kinds(S3.a2)];
    const S4 = S7(); S4.winRef.wpHostGesture = 'mA'; S4.camp.chars.c_a.values.f_sight = 70; S4.net.sensesMoved('c_a'); S4.fire(500); const gest10 = [kinds(S4.a1), S4.timers.filter(t => t.fn && t.ms === 150).length]; S4.winRef.wpHostGesture = null; S4.fire(150); gest10.push(kinds(S4.a1));
    check('fold M10: a change of Sight catches the player\'s copies up in place, map by map (their token on each): a raised Sight adds the creature it now reaches by a fogDiff to each of their connections and nobody gets a whole map; a lowered one takes it away; a whole copy one connection asked for in between leaves the other its own catch-up; a Sight the player cannot work out (GM-only) sends nothing from the change; while the GM\'s own gesture is open on that map nothing goes and the map\'s fire does it after',
        J(up10.a1) === J(['fogDiff', 'fogDiff']) && J(up10.a2) === J(['fogDiff', 'fogDiff']) && J(up10.b) === J([]) && J((up10.add || []).map(a => a.item.id)) === J(['orc']) && up10.agree && J(down10.a1) === J(['fogDiff:["orc"]', 'fogDiff:["orc2"]']) && down10.agree
        && J(between10) === J([['fogDiff'], ['fogDiff', 'fogDiff']]) && J(hid10) === J([[], []]) && J(gest10) === J([['fogDiff'], 1, ['fogDiff', 'fogDiff']]),
        J([up10, down10, between10, hid10, gest10]));
    // what the mutants found: a Sight that turns GM-only between the change and its fire sends nothing and arms nothing (the hidden test comes
    // before the GM's gesture); only the changed player's connections are caught up; the fire judges an open drag at its start
    const SH = S7(); SH.camp.chars.c_a.values.f_sight = 70; SH.net.sensesMoved('c_a'); SH.camp.system = sysGm; SH.winRef.wpHostGesture = 'mA'; SH.fire(500);
    const hidLate = [kinds(SH.a1), SH.timers.filter(t => t.fn && t.ms === 150).length]; SH.winRef.wpHostGesture = null; SH.fire(150); hidLate.push(kinds(SH.a1));
    const SO = S7(); const orcO = SO.tok('orc'); orcO.x = 100; orcO.y = 300; SO.camp.chars.c_a.values.f_sight = 70; SO.net.sensesMoved('c_a'); SO.fire(500); const onlyHers = kinds(SO.b1);
    const SL = S7(); SL.camp.items.mA.whiteboard.push(T('ogre', '', 'c_n', 18, 2)); SL.net.conns.forEach(c => { SL.net.sendItem('k', 'mA', c); c.sent.length = 0; });
    SL.move(SL.a1, 'tA', 250, 100, false); SL.net.conns.forEach(c => { c.sent.length = 0; }); SL.camp.chars.c_a.values.f_sight = 70; SL.net.sensesMoved('c_a'); SL.fire(500);
    const landedS = ((diffsTo(SL, SL.a2).find(m => m.itemId === 'mA') || {}).add || []).map(a => a.item.id);
    check('fold M10: a Sight that has turned GM-only by the time its change fires is judged by the campaign\'s default, as any other change: with the GM\'s gesture open it waits for it, and it sends nothing where the default changes nothing she holds; a change of one player\'s Sight catches up only that player\'s connections, never another\'s stale copy; it is judged with an open drag at its start',
        J(hidLate) === J([[], 1, []]) && J(onlyHers) === J([]) && J(landedS) === J(['orc']), J([hidLate, onlyHers, landedS]));
    const patchMsg = (props, extra) => ({ type: 'item', campId: 'k', itemId: 'mA', item: { type: 'map', whiteboard: [Object.assign({ id: 'tA', x: 100, y: 100, rot: 0, front: 0 }, props)].concat(extra || []) } });
    const PI = S7(); PI.api.item(patchMsg({ posture: 'crouching' }), PI.a1); const post10 = [itemsTo(PI, PI.a1), itemsTo(PI, PI.a2), itemsTo(PI, PI.b1), PI.timers.filter(t => t.fn && t.ms === 150).length];
    const sysElev = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'formula', formula: '30 + Elevation * 10', edit: 'owner', vis: 'all' }] }, { F: Fx, gmView: true });
    const PE = S7({ system: sysElev }); const seenBefore = !(PE.fog.fogDropIds('u_a', PE.camp, PE.camp.items.mA) || {}).orc; PE.api.item(patchMsg({ elevation: 4 }), PE.a1); const elevArm = PE.timers.filter(t => t.fn && t.ms === 150).length; PE.fire(150);
    const elev10 = { before: seenBefore, armed: elevArm, a1: kinds(PE.a1), add: ((diffsTo(PE, PE.a1)[0] || {}).add || []).map(a => a.item.id), agree: agree(PE) };
    const PN = S7(); PN.api.item(patchMsg({ elevation: 4 }), PN.a1); const nArm = PN.timers.filter(t => t.fn && t.ms === 150).length; PN.fire(150); const noRead10 = [nArm, kinds(PN.a1).filter(t => t !== 'item')];
    const stroke = { id: 'st1', type: 'path', x: 10, y: 10, w: 20, h: 20, pts: [[0, 0], [20, 20]], byPlayer: true, ownerId: 'u_a' };
    const PS = S7(); PS.api.item(patchMsg({}, [stroke]), PS.a1); const stroke10 = [itemsTo(PS, PS.a1), itemsTo(PS, PS.a2), itemsTo(PS, PS.b1)];
    const TH = S7(); TH.net.roster.pA1.location = 'mA'; TH.api.threatsIn({ type: 'threats', campId: 'k', itemId: 'mA', wbId: 'tA', threats: [90] }, TH.a1); const th10 = [itemsTo(TH, TH.a1), itemsTo(TH, TH.a2), itemsTo(TH, TH.b1), TH.timers.filter(t => t.fn && t.ms === 150).length];
    const UF10 = S7(); UF10.camp.items.mA.fog.on = false; UF10.api.item(patchMsg({ posture: 'crouching' }), UF10.a1); UF10.net.roster.pA1.location = 'mA'; UF10.api.threatsIn({ type: 'threats', campId: 'k', itemId: 'mA', wbId: 'tA', threats: [90] }, UF10.a1);
    const unf10 = [UF10.a1.sent.filter(m => m.type === 'item' || m.type === 'itemDelta').length, UF10.timers.filter(t => t.fn && t.ms === 150).length];
    check('fold M10: a player\'s map copy that changed a token of theirs goes whole to every other connection (their own other one too) and not back to the sender, and arms the fire; with a Sight worked out from Elevation, raising it catches the sender up in place by a fogDiff with the creature it now reaches; on a system whose Sight reads no stance the same change arms a fire that sends nothing; a drawing still goes to everyone; threat marks likewise go to all but the sender and arm the fire; on a map without fog both go to everyone as ever and arm nothing',
        J(post10) === J([0, 1, 1, 1]) && elev10.before === false && elev10.armed === 1 && J(elev10.a1) === J(['fogDiff']) && J(elev10.add) === J(['orc']) && elev10.agree && J(noRead10) === J([1, []])
        && J(stroke10) === J([1, 1, 1]) && J(th10) === J([0, 1, 1, 1]) && unf10[0] >= 1 && unf10[1] === 0,
        J([post10, elev10, noRead10, stroke10, th10, unf10]));

    // senses S2a: a full sense on the host's judgment (the real fog.js vision half over the real sends): a creature in its reach is sent, one past it
    // dropped, its live moves relayed (canSeePoint); a sheet change that moves a sense's range catches its player's copies up in place; none when nothing moved
    const sysSn = list => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }, { id: 'f_fs', key: 'EtherR', label: 'Ether', kind: 'number', def: 0, vis: 'all' }], combat: list ? { senses: { list: list } } : {} }, { F: Fx, gmView: true });
    const snBy = n => [{ id: 'sn_ether001', name: 'Ether Sight', range: { by: 'n', n: n }, unit: 'ft', grade: 'full' }];
    const orcAt = W => { const t = W.tok('orc'); return [t.x + 25, t.y + 25]; };
    const wS = S7({ system: sysSn(snBy(65)) }), wN = S7({ system: sysSn(snBy(55)) }), wX = S7({ system: sysSn(null) });
    const snSeen = W => ({ a: W.view(W.a1, 'mA').ids.indexOf('orc') >= 0, a2: W.view(W.a2, 'mA').ids.indexOf('orc') >= 0, b: W.view(W.b1, 'mA').ids.indexOf('orc') >= 0, relay: W.fog.canSeePoint('u_a', W.camp, W.camp.items.mA, orcAt(W)[0], orcAt(W)[1]), relayB: W.fog.canSeePoint('u_b', W.camp, W.camp.items.mA, orcAt(W)[0], orcAt(W)[1]) });
    check('senses S2a (host): on a dark map the orc 13 cells off (her eyes see 12) reaches both of Ana\'s copies and her live relay through a sense of 65 ft; not through one of 55 ft or with none; Bo, 13.2 cells off, is never sent it',
        J(snSeen(wS)) === J({ a: true, a2: true, b: false, relay: true, relayB: false }) && J(snSeen(wN)) === J({ a: false, a2: false, b: false, relay: false, relayB: false }) && J(snSeen(wX)) === J(snSeen(wN)), J([snSeen(wS), snSeen(wN)]));
    const wF = S7({ system: sysSn([{ id: 'sn_ether001', name: 'Ether Sight', range: { by: 'field', field: 'f_fs' }, unit: 'ft', grade: 'full' }]) }), before2 = snSeen(wF);
    wF.camp.chars.c_a.values.f_fs = 65; wF.clearSent(); wF.net.sensesMoved('c_a'); const pend2 = Object.keys(wF.api.pend()).length + wF.timers.filter(t => t.fn && t.ms === 500).length; wF.fire(500);
    const got2 = { a1: wF.a1.sent.map(m => m.type + ':' + m.itemId), a2: wF.a2.sent.map(m => m.type + ':' + m.itemId), b: wF.b1.sent.length, seen: snSeen(wF), mB: wF.view(wF.a1, 'mB').ids.indexOf('orc2') >= 0 };
    wF.clearSent(); wF.net.sensesMoved('c_a'); const quiet2 = wF.timers.filter(t => t.fn && t.ms === 500).length; wF.fire(500);
    const bQuiet = wF.b1.sent.length + wF.a1.sent.length + wF.a2.sent.length;
    wF.camp.chars.c_a.values.f_fs = 0; wF.clearSent(); wF.net.sensesMoved('c_a'); wF.fire(500); const back2 = { a1: wF.a1.sent.map(m => m.type + ':' + m.itemId), seen: snSeen(wF) };
    check('senses S2a (host): a sense read from Ana\'s sheet that grows to reach the orc catches both her copies of each map it stands on up in place (a fogDiff per map, the orc added on both, Bo sent nothing); asked again with nothing moved, nothing is armed or sent; back to 0, the orc goes again',
        J(before2) === J({ a: false, a2: false, b: false, relay: false, relayB: false }) && pend2 >= 1 && J(got2.a1.sort()) === J(['fogDiff:mA', 'fogDiff:mB']) && J(got2.a2.sort()) === J(['fogDiff:mA', 'fogDiff:mB']) && got2.b === 0 && got2.mB && J(got2.seen) === J({ a: true, a2: true, b: false, relay: true, relayB: false })
        && quiet2 === 0 && bQuiet === 0 && J(back2.a1.sort()) === J(['fogDiff:mA', 'fogDiff:mB']) && back2.seen.a === false && back2.seen.relay === false, J([before2, pend2, got2, quiet2, bQuiet, back2]));
    // the eyes' arc from the sheet (the owner's ruling of 2026-10-03) on the host's judgment — the real fog.js vision half over the real sends and
    // catch-up, a real player page per connection. mC is dark with a facing cone of 90 degrees: Ana's tC at (6,6) faces up, the bat stands 4 cells to
    // her right (90 degrees round), a rat 3 cells straight behind her. The system names her sheet's Sight arc as the eyes' arc; mA and mB see all round
    {
        const sysArc = field => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }, { id: 'f_arc', key: 'SightArc', label: 'Sight arc', kind: 'number', def: 0, vis: 'all' }, { id: 'f_garc', key: 'GmArc', label: 'GM arc', kind: 'number', def: 0, vis: 'gm' }], combat: { senses: { arc: { field: field } } } }, { F: Fx, gmView: true });
        const arcWorld = field => { const W = mk4({ system: sysArc(field) }); W.camp.items.mC.whiteboard.push(T('rat', '', 'c_n', 6, 9)); W.net.conns.forEach(c => { ['mA', 'mB', 'mO', 'mC'].forEach(id => W.net.sendItem('k', id, c)); c.sent.length = 0; }); return W; };
        const midOf = (W, id) => { const t = W.tok(id, 'mC'); return [t.x + 25, t.y + 25]; }, relayOf = (W, id) => W.fog.canSeePoint('u_a', W.camp, W.camp.items.mC, midOf(W, id)[0], midOf(W, id)[1]);
        const arcSeen = W => ({ a: W.view(W.a1, 'mC').ids.slice().sort(), a2: W.view(W.a2, 'mC').ids.slice().sort(), bat: relayOf(W, 'bat'), rat: relayOf(W, 'rat'), arcs: W.fog.viewersFor(W.camp.items.mC, W.camp, 'u_a').map(v => v.arc), round: W.fog.viewersFor(W.camp.items.mA, W.camp, 'u_a').map(v => v.arc) });
        const sentOf = c => c.sent.map(m => m.type + ':' + m.itemId).sort(), armed = W => W.timers.filter(t => t.fn && t.ms === 500).length, setArc = (W, f, v) => { W.camp.chars.c_a.values[f] = v; W.clearSent(); W.net.sensesMoved('c_a'); const n = armed(W); W.fire(500); return n; };
        const pageArc = (W, c, pid) => {   // the player's own app: the real fog.js over their copy of mC, the owner's copy of their character and the players' view of the system
            const hc = W.camp, campP = { id: 'k', system: Sx.cleanSystem(hc.system, { F: Fx, gmView: false }), fog: JSON.parse(J(hc.fog)), chars: { c_a: Sx.charFor(hc.chars.c_a, hc.system, pid) }, items: c.page.camp().items };
            const F = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { revealedTiers: revealedTiers, viewersFor: viewersFor };')(
                { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpVtt: { on: () => true, mode: () => 'client' }, wpNet: { myId: pid } }, { getElementById: () => null }, () => null, () => campP, { appState: { activeCampaignId: 'k', campaigns: { k: campP } } });
            const map = campP.items.mC, t = F.revealedTiers(map, campP, pid);
            return { arcs: F.viewersFor(map, campP, pid).map(v => v.arc), bat: t.keys['10,6'], rat: t.keys['6,9'], key: J(campP.system.combat.senses), whole: !!campP.chars.c_a && campP.chars.c_a.partial === false };
        };
        const wArc = arcWorld('f_arc'), arc0 = arcSeen(wArc), page0 = pageArc(wArc, wArc.a1, 'u_a');
        const armedWide = setArc(wArc, 'f_arc', 300), wide = { a1: sentOf(wArc.a1), a2: sentOf(wArc.a2), b: wArc.b1.sent.length, w: wArc.w1.sent.length, seen: arcSeen(wArc) }, page300 = pageArc(wArc, wArc.a1, 'u_a');
        wArc.clearSent(); wArc.net.sensesMoved('c_a'); const armedAgain = armed(wArc); wArc.fire(500);
        const armedRound = setArc(wArc, 'f_arc', 300.4); wArc.net.sensesMoved(null); const armedAny = armed(wArc); wArc.fire(500);
        const quiet = wArc.a1.sent.length + wArc.a2.sent.length + wArc.b1.sent.length + wArc.w1.sent.length;
        const armedAll = setArc(wArc, 'f_arc', 360), all = { a1: sentOf(wArc.a1), seen: arcSeen(wArc) };
        const armedBack = setArc(wArc, 'f_arc', 0), back = { a1: sentOf(wArc.a1), a2: sentOf(wArc.a2), b: wArc.b1.sent.length, seen: arcSeen(wArc) };
        check('eyes\' arc (host): on a map with a facing cone of 90 degrees a creature to Ana\'s side and one behind her are left out of both her copies and of her live relay; her sheet\'s arc widened to 300 arms one catch-up for that map alone and catches both her copies up in place (a fogDiff each, the creature in the widened arc added, the one behind still left out, Bo and a stranger sent nothing); the maps that see all round are untouched',
            J(arc0) === J({ a: ['tC'], a2: ['tC'], bat: false, rat: false, arcs: [90], round: [360] }) && armedWide === 1 && J(wide.a1) === J(['fogDiff:mC']) && J(wide.a2) === J(['fogDiff:mC']) && wide.b === 0 && wide.w === 0
            && J(wide.seen) === J({ a: ['bat', 'tC'], a2: ['bat', 'tC'], bat: true, rat: false, arcs: [300], round: [360] }), J([arc0, armedWide, wide]));
        check('eyes\' arc (host): nothing is armed or sent when the arc did not move — asked again as it stands, a value that rounds to the same degrees, any character at all; all round at 360 the creature behind comes too; back at 0 both leave again, in place',
            armedAgain === 0 && armedRound === 0 && armedAny === 0 && quiet === 0 && armedAll === 1 && J(all.a1) === J(['fogDiff:mC']) && J(all.seen) === J({ a: ['bat', 'rat', 'tC'], a2: ['bat', 'rat', 'tC'], bat: true, rat: true, arcs: [360], round: [360] })
            && armedBack === 1 && J(back.a1) === J(['fogDiff:mC']) && J(back.a2) === J(['fogDiff:mC']) && back.b === 0 && J(back.seen) === J(arc0), J([armedAgain, armedRound, armedAny, quiet, armedAll, all, armedBack, back]));
        check('eyes\' arc (the player\'s own screen, the real fog.js over their copy): the key reaches a player with the system (the same in both views) and their own app reads the arc the host judged by from their own copy of the character — the map\'s 90 before, 300 after — so their overlay shows the cell of the creature the host sent them and still fogs the one behind',
            J(page0) === J({ arcs: [90], key: '{"arc":{"field":"f_arc"}}', whole: true }) && J(page300) === J({ arcs: [300], bat: 2, key: '{"arc":{"field":"f_arc"}}', whole: true }) && J(wArc.camp.system.combat.senses) === '{"arc":{"field":"f_arc"}}', J([page0, page300]));
        const wSec = arcWorld('f_garc'), armedSec = setArc(wSec, 'f_garc', 300), sec = { senses: 'senses' in wSec.camp.system.combat, sent: wSec.a1.sent.length + wSec.a2.sent.length, seen: arcSeen(wSec) };
        check('eyes\' arc (host): an arc named on a field its player cannot read never reaches the system either side holds, so the host judges nobody by it — the number set on the sheet arms nothing, sends nothing and leaves her copies as the map\'s arc has them',
            sec.senses === false && armedSec === 0 && sec.sent === 0 && J(sec.seen) === J(arc0), J([armedSec, sec]));
    }

    // item 19b (the owner's answers of 2026-10-01): heights in the fog, on the host's judgment — the real fog.js vision half over the real sends,
    // the real patch path and catch-up, and a real player page per connection. mA is dark, 5 ft squares; Ana's tA stands at (2,2), Bo's tB at (2,4);
    // the orc is brought to (6,2), four cells off in Ana's row, with a crate (a see-over piece) between them
    const sysH19 = (height, senses) => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }],
        combat: Object.assign({ cover: { on: true } }, height ? { height: height } : {}, senses ? { senses: { list: senses } } : {}) }, { F: Fx, gmView: true });
    const hSense = (id, walls) => Object.assign({ id: id, name: id, grade: 'mark', glyph: walls ? 'sound' : 'tremor', arc: 'all', range: { by: 'n', n: 80 }, unit: 'ft' }, walls ? { walls: 'pass' } : {});
    const pieceH = (id, c, r, more) => Object.assign({ id: id, type: 'rect', x: c * 50, y: r * 50, w: 50, h: 50 }, more);
    const wH19 = (height, o) => {
        o = o || {}; const W = S7({ system: sysH19(height, o.senses) }), m = W.camp.items.mA, orc = W.tok('orc');
        orc.x = 300; orc.y = 100; if (o.orcElev !== 0) orc.elevation = o.orcElev === undefined ? 1 : o.orcElev;
        if (o.piece !== null) m.whiteboard.push(o.piece || pieceH('crate', 4, 2, { cover: 'yes', height: 2 }));
        if (o.setup) o.setup(W, m);
        m.meta.updated = (m.meta.updated || 0) + 1; W.fog.invalidateVision();   // as the GM's save does: the walls and the cover pieces are kept on the map's stamp
        W.clearSent(); W.net.sendItem('k', 'mA'); return W;
    };
    const hasOrc19 = W => [W.a1, W.a2, W.b1].map(c => W.view(c, 'mA').ids.indexOf('orc') >= 0);
    const relay19 = (W, pid, withTok) => { const t = W.tok('orc'); return withTok === false ? W.fog.canSeePoint(pid, W.camp, W.camp.items.mA, t.x + 25, t.y + 25) : W.fog.canSeePoint(pid, W.camp, W.camp.items.mA, t.x + 25, t.y + 25, t); };
    const hFlat = wH19(null), hClr = wH19({ rule: 'clears' }), hNoCrate = wH19({ rule: 'clears' }, { piece: null }), hLevel = wH19({ rule: 'clears' }, { orcElev: 0 }), hTall = wH19({ rule: 'clears' }, { orcElev: 2.5 }), hCoverOff = wH19({ rule: 'clears' }, { setup: W => { W.camp.system.combat.cover.on = false; } });
    const hElevOff = wH19({ rule: 'clears' }, { setup: W => { W.winRef.wpVtt.on = k => k !== 'elevation'; W.fog.invalidateVision(); } });
    check('item 19b H3 (host): with the system\'s height rule "clears", a creature one yard up behind a 2-yard crate is left out of both copies of the player whose token stands on the ground in line with it — and its live moves are no longer relayed to them — while the player whose line misses the crate keeps it; without the rule, without the crate, with the creature on the ground or taller than the crate, with the system\'s cover off or the table playing without Token elevation, every copy holds it as before',
        J(hasOrc19(hFlat)) === J([true, true, true]) && J(hasOrc19(hClr)) === J([false, false, true]) && relay19(hClr, 'u_a') === false && relay19(hClr, 'u_b') === true && relay19(hFlat, 'u_a') === true
        && [hNoCrate, hLevel, hTall, hCoverOff, hElevOff].every(W => J(hasOrc19(W)) === J([true, true, true]) && relay19(W, 'u_a') === true) && agree(hClr),
        J([hasOrc19(hFlat), hasOrc19(hClr), relay19(hClr, 'u_a'), relay19(hClr, 'u_b'), [hNoCrate, hLevel, hTall, hCoverOff, hElevOff].map(hasOrc19)]));
    const hUp = wH19({ rule: 'clears' }); hUp.clearSent(); hUp.timers.length = 0; pat(hUp, { elevation: 3 }); const upArmed = armN(hUp); hUp.fire(150);
    const upGot = { elev: hUp.tok('tA').elevation, a1: kinds(hUp.a1), a2: kinds(hUp.a2), add: (hUp.a1.sent.find(m => m.type === 'fogDiff') || {}).add, has: hasOrc19(hUp), agree: agree(hUp), relay: relay19(hUp, 'u_a') };
    hUp.clearSent(); hUp.timers.length = 0; pat(hUp, {}); hUp.fire(150); const downGot = { elev: hUp.tok('tA').elevation, drop: (hUp.a1.sent.find(m => m.type === 'fogDiff') || {}).drop, has: hasOrc19(hUp), agree: agree(hUp) };
    check('item 19b H3 (host): once that player\'s token climbs to 3 yards (their own stance, through the real patch path) it looks down over the crate: the landing arms the catch-up and both their copies are sent the creature in place, their relay follows; back on the ground it is taken out again; every copy then equals a fresh one',
        upArmed === 1 && upGot.elev === 3 && J(upGot.a1) === J(['fogDiff']) && J(upGot.a2) === J(['fogDiff']) && Array.isArray(upGot.add) && upGot.add.length === 1 && upGot.add[0].item.id === 'orc' && J(upGot.has) === J([true, true, true]) && upGot.agree && upGot.relay === true
        && downGot.elev === undefined && J(downGot.drop) === J(['orc']) && J(downGot.has) === J([false, false, true]) && downGot.agree, J([upArmed, upGot.elev, upGot.a1, upGot.has, upGot.agree, downGot]));
    const hTwo = wH19({ rule: 'clears' }, { setup: (W, m) => m.whiteboard.push(T('tA3', 'u_a', 'c_a', 6, 5)) }), hTwoHid = wH19({ rule: 'clears' }, { setup: (W, m) => m.whiteboard.push(T('tA3', 'u_a', 'c_a', 0, 2)) }), hTwoFar = wH19({ rule: 'clears' }, { setup: (W, m) => m.whiteboard.push(T('tA3', 'u_a', 'c_a', 30, 30)) });
    check('item 19b H3 (host): a creature is left out only when EVERY token of the player\'s has it hidden or does not see it — a second token of theirs whose line misses the crate keeps it on both copies; one that also stands behind the crate, or one too far to see it at all, does not',
        J(hasOrc19(hTwo)) === J([true, true, true]) && J(hasOrc19(hTwoHid)) === J([false, false, true]) && J(hasOrc19(hTwoFar)) === J([false, false, true]), J([hasOrc19(hTwo), hasOrc19(hTwoHid), hasOrc19(hTwoFar)]));
    const mk19 = (W, c) => { const it = c.page.camp().items.mA; return Object.prototype.hasOwnProperty.call(it, 'fogMarks') ? it.fogMarks : 'none'; };
    const hHear = wH19({ rule: 'clears' }, { senses: [hSense('sn_hear0001', true)] }), hFeel = wH19({ rule: 'clears' }, { senses: [hSense('sn_feel0001', false)] }), hFeelFlat = wH19(null, { senses: [hSense('sn_feel0001', false)], setup: (W, m) => { m.whiteboard = m.whiteboard.filter(w => w.id !== 'tA'); m.whiteboard.push(T('tA', 'u_a', 'c_a', 2, 2, { blind: true })); } });
    const hFeelBlind = wH19({ rule: 'clears' }, { senses: [hSense('sn_feel0001', false)], setup: (W, m) => { m.whiteboard = m.whiteboard.filter(w => w.id !== 'tA'); m.whiteboard.push(T('tA', 'u_a', 'c_a', 2, 2, { blind: true })); } });
    check('item 19b H3 (host): the piece stops what a wall stops and nothing else — a hearing that passes walls still marks the hidden creature on that player\'s copies (a cell, a glyph and the word that it stands in a cell they see, nothing of the creature), a mark sense the walls stop does not; that same sense marks it where no height hides it (a blind token on the ground, no rule: it marks the other player\'s token too, which it no longer sees), and not once the rule hides it from that token (the other mark stays)',
        J(hasOrc19(hHear)) === J([false, false, true]) && J(mk19(hHear, hHear.a1)) === J([{ c: 6, r: 2, k: 1, s: 1 }]) && J(mk19(hHear, hHear.a2)) === J([{ c: 6, r: 2, k: 1, s: 1 }]) && mk19(hHear, hHear.b1) === 'none' && !/"orc"/.test(J(hHear.a1.sent))
        && J(hasOrc19(hFeel)) === J([false, false, true]) && mk19(hFeel, hFeel.a1) === 'none' && J(mk19(hFeelFlat, hFeelFlat.a1)) === J([{ c: 2, r: 4, k: 2 }, { c: 6, r: 2, k: 2 }]) && J(mk19(hFeelBlind, hFeelBlind.a1)) === J([{ c: 2, r: 4, k: 2 }]),
        J([hasOrc19(hHear), mk19(hHear, hHear.a1), mk19(hFeel, hFeel.a1), mk19(hFeelFlat, hFeelFlat.a1), mk19(hFeelBlind, hFeelBlind.a1)]));
    const hOn = wH19(null); hOn.clearSent(); hOn.timers.length = 0; hOn.camp.system = sysH19({ rule: 'clears' }); hOn.net.sensesMoved(null); const onPend = hOn.timers.filter(t => t.fn && t.ms === 500).length; hOn.fire(500);
    const onGot = { a1: hOn.a1.sent.map(m => m.type + ':' + m.itemId + ':' + J(m.drop || [])), b: hOn.b1.sent.length, has: hasOrc19(hOn), agree: agree(hOn) };
    check('item 19b H3 (host): the rule switched on mid-session reaches the players it changes anything for — the system\'s change is compared per player (the text of what their tokens see by now names the height rule) and the player the crate hides the creature from has it taken out of both copies in place; the other player is sent nothing',
        onPend >= 1 && J(onGot.a1) === J(['fogDiff:mA:["orc"]']) && onGot.b === 0 && J(onGot.has) === J([false, false, true]) && onGot.agree, J([onPend, onGot]));
    const keys19 = (W, pid) => Object.keys(W.api.copy(W.api.clean(W.camp.items.mA), W.camp, W.camp.items.mA, pid)).sort(), itemKeys19 = W => Object.keys(W.last(W.b1).whiteboard.find(w => w.id === 'orc')).sort();
    check('item 19b (host): nothing new travels — a copy made under the height rule has the keys a copy without it has (a hidden creature is simply absent), the creature a player is sent is the item it was, the shared clone is untouched, and the campaign\'s fog defaults are what they were',
        J(keys19(hClr, 'u_a')) === J(keys19(hFlat, 'u_a')) && J(itemKeys19(hClr)) === J(itemKeys19(hFlat)) && J(hClr.api.clean(hClr.camp.items.mA)) === J(hFlat.api.clean(hFlat.camp.items.mA)) && J(FCx.cleanCampFog(hClr.camp.fog)) === J(FCx.cleanCampFog(hFlat.camp.fog)) && !/height|line3d|eye/.test(J(FCx.cleanCampFog(hClr.camp.fog))),
        J([keys19(hClr, 'u_a'), keys19(hFlat, 'u_a')]));
    // H4, the true 3D sightline: the eye a standing height above the token, the target at its own height; and the player's own screen agreeing with the host
    const crate1 = c => pieceH('crate', c, 2, { cover: 'yes', height: 1 }), lowWall = h => pieceH('lw', 4, 2, Object.assign({ blocksSight: true }, h ? { height: h } : {}));
    const d3Lvl = wH19({ line3d: true }, { orcElev: 0, piece: crate1(3) }), d3Eye = wH19({ line3d: true, eye: 2 }, { orcElev: 0, piece: crate1(3) }), d3Near = wH19({ line3d: true, eye: 2 }, { orcElev: 0, piece: crate1(5) }), d3None = wH19({ line3d: true, eye: 2 }, { orcElev: 0, piece: null });
    check('item 19b H4 (host): with the True 3D sightline a 1-yard crate hides a creature on the ground from a token whose eye is at the ground (no standing height), and not from one whose eye stands 2 yards up when the crate is near the eye — the same crate beside the creature, where the line has come down under it, hides it (from the other player\'s token too, whose line passes it there); a map with no piece that has a height is as before',
        J(hasOrc19(d3Lvl)) === J([false, false, true]) && J(hasOrc19(d3Eye)) === J([true, true, true]) && J(hasOrc19(d3Near)) === J([false, false, false]) && J(hasOrc19(d3None)) === J([true, true, true]) && relay19(d3Lvl, 'u_a') === false && relay19(d3Eye, 'u_a') === true,
        J([hasOrc19(d3Lvl), hasOrc19(d3Eye), hasOrc19(d3Near), hasOrc19(d3None)]));
    const d3Wall = wH19({ line3d: true, eye: 2 }, { orcElev: 3, piece: lowWall(1) }), d3Tall = wH19({ line3d: true, eye: 2 }, { orcElev: 3, piece: lowWall(2.5) }), d3Full = wH19({ line3d: true, eye: 2 }, { orcElev: 3, piece: lowWall(0) }), d3Off = wH19(null, { orcElev: 3, piece: lowWall(1) });
    check('item 19b H4 (host): a creature on a 3-yard ledge behind a sight-blocker with a height is sent to the player whose token\'s line passes over it (1 yard) and not where the piece is as tall as the line there (2.5 yards); a sight-blocker with no height is a wall, full height, and blocks always; without the option the low wall blocks as any wall; the relay judges the creature at its height (and a bare place, as before, by the cells)',
        J(hasOrc19(d3Wall)) === J([true, true, true]) && J(hasOrc19(d3Tall)) === J([false, false, true]) && J(hasOrc19(d3Full)) === J([false, false, true]) && J(hasOrc19(d3Off)) === J([false, false, true])
        && relay19(d3Wall, 'u_a') === true && relay19(d3Wall, 'u_a', false) === false && relay19(d3Tall, 'u_a') === false && agree(d3Wall) && agree(d3Tall),
        J([hasOrc19(d3Wall), hasOrc19(d3Tall), hasOrc19(d3Full), hasOrc19(d3Off), relay19(d3Wall, 'u_a'), relay19(d3Wall, 'u_a', false)]));
    const pageFog19 = (W, c, pid) => {   // the player's own app: the real fog.js over their copy, their own character and the players' view of the system
        const hostCamp = W.camp, campP = { id: 'k', system: Sx.cleanSystem(hostCamp.system, { F: Fx, gmView: false }), fog: JSON.parse(J(hostCamp.fog)), chars: { c_a: JSON.parse(J(hostCamp.chars.c_a)) }, items: c.page.camp().items };
        const F = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { revealedTiers: revealedTiers, fogMask: fogMask, gridForMap: gridForMap, heightShown: typeof heightShown === "function" ? heightShown : null };')(
            { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpVtt: { on: () => true, mode: () => 'client' }, wpNet: { myId: pid } }, { getElementById: () => null }, () => null, () => campP, { appState: { activeCampaignId: 'k', campaigns: { k: campP } } });
        const map = campP.items.mA, grid = F.gridForMap(map), flat = F.revealedTiers(map, campP, pid), had = flat.keys['6,2'], shown = F.heightShown ? F.heightShown(F.revealedTiers(map, campP, pid), map, campP, pid, grid, F.fogMask(map, campP, grid)) : flat;
        return { had: had, now: shown.keys['6,2'], n: shown.list.length - flat.list.length, system: J(campP.system.combat.height) };
    };
    const pgWall = pageFog19(d3Wall, d3Wall.a1, 'u_a'), pgTall = pageFog19(d3Tall, d3Tall.a1, 'u_a'), pgEye = pageFog19(d3Eye, d3Eye.a1, 'u_a');
    check('item 19b H4 (the player\'s own screen, the real fog.js over their copy): the option reaches a player with the system (the same in both views), and their overlay — which fogs the ground behind the low wall as ever — shows the cell of the creature the host sent them over it, that one cell and no other; where the host sent none, or the creature stands in a cell they already see, their overlay is what it was',
        pgWall.system === J({ line3d: true, eye: 2 }) && pgWall.had === undefined && pgWall.now === 2 && pgWall.n === 1 && pgTall.had === undefined && pgTall.now === undefined && pgTall.n === 0 && pgEye.had === 2 && pgEye.now === 2 && pgEye.n === 0, J([pgWall, pgTall, pgEye]));
    check('item 19b (pinned): the live relay hands the fog the piece it moves, so a creature\'s place is judged at its height as its drop is — the one call, in the bpos slice',
        (src.match(/wpFog\.canSeePoint\(/g) || []).length === 2 && (between('// [netcheck:soundhear-start]', '// [netcheck:soundhear-end]', 'soundhear').match(/wpFog\.canSeePoint\(/g) || []).length === 1 && /window\.wpFog\.canSeePoint\(pr\.id, camp, map, cx, cy, w\)/.test(between('// [netcheck:bpos-start]', '// [netcheck:bpos-end]', 'bpos')));   // the other: a door under a player's fog, a place with no piece to judge by (1.6.2, moved on purpose)

    // the connection library is a file of the app: where it is missing the file did not load, and the app says that — never that the internet is needed
    {
        const plSrc = (() => { try { return between('// [netcheck:peerlib-start]', '// [netcheck:peerlib-end]', 'peerlib'); } catch (e) { return ''; } })(), plSaid = [];
        const plRun = lib => { try { return new Function('toast', 'Peer', '"use strict";\n' + plSrc + '\nreturn peerLibMissing();')(m => plSaid.push(m), lib); } catch (e) { return 'threw'; } };
        const plGot = [plRun(undefined), plSaid.length, plRun(function Peer() {}), plSaid.length];
        check('the connection library missing (net.js peerLibMissing, run for real): hosting and joining both stop and say that a part of Waypoint did not load, with what to do — restart, then update or reinstall — once, in plain text; with the library there nothing is said and both go on; nowhere does the app say multiplayer needs an internet connection; the two entrances ask the one function, the only place that looks for the library',
            J(plGot) === J([true, 1, false, 1]) && plSaid[0] === 'Multiplayer can\u2019t start: a part of Waypoint did not load. Restart Waypoint; if it keeps happening, update or reinstall it.' && !/[<>]/.test(plSaid[0])
            && !/needs an internet connection/.test(src) && (src.match(/typeof Peer\b/g) || []).length === 1 && (src.match(/\n    if \(peerLibMissing\(\)\) return;\n/g) || []).length === 2
            && /\nfunction startHosting\(forceFresh\) \{\n[^]*?\n    if \(peerLibMissing\(\)\) return;\n[^]*?\nfunction joinSession\(code, name, isRetry, probe\) \{\n    if \(peerLibMissing\(\)\) return;\n/.test(src), J([plGot, plSaid]));
    }

    // a hidden ground piece counts for nothing a player is sent (the owner's ruling of 2026-10-01: "players see nothing where something is hidden"). The same
    // world with the real tokenElevation (whiteboard.js sliced by its ground markers) over the real fogcore as the host's stance module: the orc at (6,2)
    // on a ledge (a piece with a Ground height) the GM hid, then the same ledge shown
    const wbHg = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const stHg = (() => { try { return new Function('window', 'stanceOn', 'fmtElev', 'lenUnit', '"use strict";\n' + wbHg.slice(wbHg.indexOf('// [fogcheck:ground-start]'), wbHg.indexOf('// [fogcheck:ground-end]')) + '\nreturn { tokenElevation: tokenElevation, tokenGround: tokenGround };')({ wpFogCore: FCx }, () => true, String, () => 'yd'); } catch (e) { return null; } })();
    const ledgeHg = (c, r, g, hid) => pieceH('ledge', c, r, Object.assign({ ground: g }, hid ? { hidden: true } : {}));
    const wHg = (height, o, pieces, more) => wH19(height, Object.assign({}, o, { setup: (W, m) => { W.winRef.wpStance = stHg; pieces.forEach(p => m.whiteboard.push(p)); if (more) more(W, m); } }));
    const heldHg = (W, c) => (W.view(c, 'mA').ids.indexOf('ledge') >= 0 ? (c.page.camp().items.mA.whiteboard.find(w => w.id === 'ledge') || {}).ground : 'none');
    const gHid = wHg({ rule: 'clears' }, { orcElev: 0 }, [ledgeHg(6, 2, 1, true)]), gShown = wHg({ rule: 'clears' }, { orcElev: 0 }, [ledgeHg(6, 2, 1, false)]);
    const gMeHid = wHg({ rule: 'clears' }, {}, [ledgeHg(2, 2, 3, true)]), gMeShown = wHg({ rule: 'clears' }, {}, [ledgeHg(2, 2, 3, false)]);
    const gotHg = { hid: [hasOrc19(gHid), relay19(gHid, 'u_a'), heldHg(gHid, gHid.a1), agree(gHid)], shown: [hasOrc19(gShown), relay19(gShown, 'u_a'), heldHg(gShown, gShown.a1), agree(gShown)],
        meHid: [hasOrc19(gMeHid), relay19(gMeHid, 'u_a'), agree(gMeHid)], meShown: [hasOrc19(gMeShown), relay19(gMeShown, 'u_a'), agree(gMeShown)], leak: /ledge|ground/.test(J(gHid.a1.sent) + J(gHid.b1.sent) + J(gMeHid.a1.sent)) };
    // the GM shows the ledge mid-session (a save of the map, as Properties does), then hides it again: each player's copies follow, and equal a fresh one
    const flipHg = (W, hid) => { const m = W.camp.items.mA, l = m.whiteboard.find(w => w.id === 'ledge'); if (hid) l.hidden = true; else delete l.hidden; m.meta.updated = (m.meta.updated || 0) + 1; W.fog.invalidateVision(); W.clearSent(); W.net.sendItem('k', 'mA'); W.fire(150); return [hasOrc19(W), heldHg(W, W.a1), agree(W)]; };
    const gFlip = wHg({ rule: 'clears' }, { orcElev: 0 }, [ledgeHg(6, 2, 1, true)]), flipGot = [hasOrc19(gFlip), flipHg(gFlip, false), flipHg(gFlip, true)];
    check('a hidden ground piece counts for nothing a player is sent (host, the real tokenElevation; the owner\'s ruling of 2026-10-01): under "clears" a creature standing on a ledge the GM hid, behind a 2-yard crate, is judged as if the ledge were not there — every copy holds it, it is relayed, and no copy holds the ledge or a word of its ground; the same ledge shown lifts it a yard and it is left out of both copies of the player below it and of their relay, the ledge and its ground on their page; a player\'s own token on a hidden 3-yard ledge does not look down over the crate, on a shown one it does; shown mid-session and hidden again, each player\'s copies follow; every copy equals a fresh one',
        !!stHg && J(gotHg) === J({ hid: [[true, true, true], true, 'none', true], shown: [[false, false, true], false, 1, true], meHid: [[false, false, true], false, true], meShown: [[true, true, true], true, true], leak: false })
        && J(flipGot) === J([[true, true, true], [[false, false, true], 1, true], [[true, true, true], 'none', true]]), J([gotHg, flipGot]));
    // their marks: a blind token's tremor sense (the walls stop it) marks the creature where the ledge is hidden, and not where the shown ledge lets the crate hide it
    const blindHg = (W, m) => { m.whiteboard = m.whiteboard.filter(w => w.id !== 'tA'); m.whiteboard.push(T('tA', 'u_a', 'c_a', 2, 2, { blind: true })); };
    const gMkHid = wHg({ rule: 'clears' }, { orcElev: 0, senses: [hSense('sn_feel0001', false)] }, [ledgeHg(6, 2, 1, true)], blindHg), gMkShown = wHg({ rule: 'clears' }, { orcElev: 0, senses: [hSense('sn_feel0001', false)] }, [ledgeHg(6, 2, 1, false)], blindHg);
    // the true 3D sightline, and the player's own screen (the real fog.js over their copy, with the real tokenElevation): the host's word and their overlay agree
    const pageHg = (W, c, pid) => { const hostCamp = W.camp, campP = { id: 'k', system: Sx.cleanSystem(hostCamp.system, { F: Fx, gmView: false }), fog: JSON.parse(J(hostCamp.fog)), chars: { c_a: JSON.parse(J(hostCamp.chars.c_a)) }, items: c.page.camp().items };
        const F = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { revealedTiers: revealedTiers, fogMask: fogMask, gridForMap: gridForMap, heightShown: heightShown };')(
            { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpStance: stHg, wpVtt: { on: () => true, mode: () => 'client' }, wpNet: { myId: pid } }, { getElementById: () => null }, () => null, () => campP, { appState: { activeCampaignId: 'k', campaigns: { k: campP } } });
        const map = campP.items.mA, grid = F.gridForMap(map), flat = F.revealedTiers(map, campP, pid), shown = F.heightShown(F.revealedTiers(map, campP, pid), map, campP, pid, grid, F.fogMask(map, campP, grid));
        return [flat.keys['6,2'] === undefined ? null : flat.keys['6,2'], shown.keys['6,2'] === undefined ? null : shown.keys['6,2'], shown.list.length - flat.list.length]; };
    const g3Hid = wHg({ line3d: true, eye: 2 }, { orcElev: 0, piece: lowWall(1) }, [ledgeHg(6, 2, 3, true)]), g3Shown = wHg({ line3d: true, eye: 2 }, { orcElev: 0, piece: lowWall(1) }, [ledgeHg(6, 2, 3, false)]);
    const got3Hg = { hid: [hasOrc19(g3Hid), relay19(g3Hid, 'u_a'), pageHg(g3Hid, g3Hid.a1, 'u_a'), agree(g3Hid)], shown: [hasOrc19(g3Shown), relay19(g3Shown, 'u_a'), pageHg(g3Shown, g3Shown.a1, 'u_a'), agree(g3Shown)], mkHid: mk19(gMkHid, gMkHid.a1), mkShown: mk19(gMkShown, gMkShown.a1) };
    check('a hidden ground piece counts for nothing a player is sent (host and the player\'s own screen): under the true 3D sightline a creature on a hidden 3-yard ledge behind a 1-yard low wall is not seen over it — left out of that player\'s copies and of their relay, their overlay showing no cell behind the wall — and on the same ledge shown it is sent, relayed, and their overlay shows that one cell: the host rules what their own app works out; their marks alike — a sense the walls stop marks the creature on the hidden ledge (it stands on the ground for them) and not on the shown one, where the crate hides it from below',
        J(got3Hg) === J({ hid: [[false, false, true], false, [null, null, 0], true], shown: [[true, true, true], true, [null, 2, 1], true], mkHid: [{ c: 2, r: 4, k: 2 }, { c: 6, r: 2, k: 2 }], mkShown: [{ c: 2, r: 4, k: 2 }] }), J(got3Hg));

    // senses S2b: a token's own ranges (item.senses) are the GM's on the host: only that token's player receives them, on their own copies of a
    // fogged map (fogOwnSenses in fogCopyFor), cleaned, the senses the system holds only; the shared clone, anyone else's copy, an unfogged map,
    // a catch-up, a hidden or a waiting token never carry them; the host judges that player's copies by them; no patch of a player's sets them
    const snN = v => (J(v).match(/"senses"/g) || []).length;
    const snOf = (W, c, id, mapId) => { const it = W.last(c, mapId), t = it && it.whiteboard.find(w => w && w.id === id); return !t ? 'absent' : Object.prototype.hasOwnProperty.call(t, 'senses') ? t.senses : 'none'; };
    const s65 = () => [{ id: 'sn_ether001', n: 65 }];
    const wT0 = S7({ system: sysSn(snBy(0)) }), wT = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }), seenT = [snSeen(wT0), snSeen(wT)];
    wT.tok('orc').senses = [{ id: 'sn_ether001', n: 900 }]; wT.tok('tB').senses = [{ id: 'sn_ether001', n: 5 }];
    wT.camp.items.mA.whiteboard.push(T('tH', 'u_a', 'c_a', 3, 3, { hidden: true, senses: [{ id: 'sn_ether001', n: 70 }] }), { id: 'tW', type: 'circle', waiting: 1, ownerId: 'u_a', x: 150, y: 150, w: 50, h: 50, senses: [{ id: 'sn_ether001', n: 80 }] },
        T('tP', 'u_a', '', 4, 4, { senses: [{ id: 'sn_ether001', n: 1e9 }, { id: 'sn_other001', n: 30 }, { id: 'sn_ether001', n: 3 }] }), T('tQ', 'u_a', '', 4, 5, { senses: [{ id: 'sn_other001', n: 30 }] }));
    const hostT = J(wT.camp.items.mA); wT.clearSent(); wT.net.sendItem('k', 'mA');
    const sentT = { a1: ['tA', 'tB', 'orc', 'tH', 'tW', 'tP', 'tQ'].map(id => snOf(wT, wT.a1, id)), a2: snOf(wT, wT.a2, 'tA'), b: ['tA', 'tB', 'orc', 'tP'].map(id => snOf(wT, wT.b1, id)), nA: snN(wT.last(wT.a1)), nB: snN(wT.last(wT.b1)), orcA: wT.ids(wT.a1).indexOf('orc') >= 0 };
    const clT = wT.api.clean(wT.camp.items.mA), cpT = wT.api.copy(clT, wT.camp, wT.camp.items.mA, 'u_a'), noneT = [snN(clT), snN(wT.api.copy(clT, wT.camp, wT.camp.items.mA, 'u_zz')), snN(wT.api.copy(clT, wT.camp, wT.camp.items.mA, null)) + snN(wT.api.copy(clT, wT.camp, wT.camp.items.mA, undefined)) + snN(wT.api.copy({ type: 'map', whiteboard: [] }, wT.camp, { id: 'mZ', type: 'map', fog: { on: true, mode: 'auto' } }, 'u_a')), cpT.whiteboard.find(w => w.id === 'tA') !== clT.whiteboard.find(w => w.id === 'tA'), cpT !== clT, snN(cpT)];
    wT.clearSent(); wT.net.broadcastItemFiltered('k', 'mA'); const bifT = [snOf(wT, wT.a1, 'tA'), snOf(wT, wT.b1, 'tB'), snOf(wT, wT.b1, 'tA'), snN(wT.last(wT.a1)), snN(wT.last(wT.b1))];
    const joinT = snN(wT.api.copy(wT.api.clean(JSON.parse(hostT)), wT.camp, JSON.parse(hostT), 'u_a'));
    check('senses S2b (host): a token given a range of its own sees by it on the host\'s judgment (a sense every token has at 0: the orc 13 cells off reaches both of Ana\'s copies only once her token has 65 ft); each copy of a fogged map carries the ranges of its own player\'s visible tokens alone — cleaned (the first of a sense, clamped), only the senses the system holds — never another player\'s, an NPC\'s or a waiting token\'s (a hidden token is not sent at all), a plain send or one to the table alike; the join snapshot\'s copy (made from a clone of the map) the same',
        J(seenT) === J([{ a: false, a2: false, b: false, relay: false, relayB: false }, { a: true, a2: true, b: false, relay: true, relayB: false }])
        && J(sentT) === J({ a1: [s65(), 'none', 'none', 'absent', 'none', [{ id: 'sn_ether001', n: 100000 }], 'none'], a2: s65(), b: ['none', [{ id: 'sn_ether001', n: 5 }], 'absent', 'none'], nA: 2, nB: 1, orcA: true })
        && J(bifT) === J([s65(), [{ id: 'sn_ether001', n: 5 }], 'none', 2, 1]) && joinT === 2, J([seenT, sentT, bifT, joinT]));
    check('senses S2b (host): the shared clone every copy is made from never holds a token\'s ranges, nor a copy made for nobody or for a profile with no token there; the owner\'s copy gets a board and a token of its own (the clone untouched), and the host\'s own map is exactly as it was after every send',
        J(noneT) === J([0, 0, 0, true, true, 2]) && J(wT.camp.items.mA) === hostT && snN(wT.api.clean(wT.camp.items.mA)) === 0, J(noneT));
    const wU = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); wU.camp.items.mA.fog.on = false; wU.clearSent(); wU.net.sendItem('k', 'mA'); wU.net.broadcastItemFiltered('k', 'mA'); wU.net.sendItem('k', 'mA', wU.a1);
    const unfT = [wU.a1.sent.length, wU.b1.sent.length, snN(wU.a1.sent), snN(wU.a2.sent), snN(wU.b1.sent), snN(wU.api.copy(wU.api.clean(wU.camp.items.mA), wU.camp, JSON.parse(J(wU.camp.items.mA)), 'u_a'))];
    const wDr = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); wDr.move(wDr.a1, 'tA', 250, 100, false); wDr.clearSent(); wDr.net.sendItem('k', 'mA');
    const dragT = [wDr.at(wDr.a1, 'tA'), snOf(wDr, wDr.a1, 'tA'), wDr.at(wDr.b1, 'tA'), snOf(wDr, wDr.b1, 'tA')];
    const wCu = S7({ system: sysSn(snBy(0)) }); wCu.tok('orc').senses = [{ id: 'sn_ether001', n: 900 }]; wCu.tok('tA').senses = [{ id: 'sn_ether001', n: 5 }];
    wCu.move(wCu.a1, 'tA', 250, 100, false); wCu.move(wCu.a1, 'tA', 250, 100, true); wCu.fire(150); const cuT = [diffsTo(wCu, wCu.a1).map(m => (m.add || []).map(a => a.item.id)), snN(wCu.a1.sent), snN(wCu.a2.sent), snN(wCu.b1.sent)];
    check('senses S2b (host): a map with no fog carries no token\'s ranges to anyone (a save, a send to the table, a copy one player asked for, the join snapshot\'s copy made from a clone of it); a drag in progress keeps its player\'s ranges on the token at its live place, the others\' copies at its start without them; a copy caught up in place never carries a creature\'s ranges (the orc added without its own)',
        J(unfT) === J([3, 2, 0, 0, 0, 0]) && J(dragT) === J([[250, 100, 0, 0], s65(), [100, 100, 0, 0], 'none']) && J(cuT) === J([[['orc']], 0, 0, 0]), J([unfT, dragT, cuT]));
    const wG = S7({ system: sysSn(snBy(0)) }), gBefore = snSeen(wG); wG.tok('tA').senses = s65(); wG.fog.invalidateVision(); wG.clearSent(); wG.net.sendItem('k', 'mA');
    const gAfter = [snSeen(wG), snOf(wG, wG.a1, 'tA'), snOf(wG, wG.b1, 'tA'), wG.ids(wG.a1).indexOf('orc') >= 0];
    delete wG.tok('tA').senses; wG.fog.invalidateVision(); wG.clearSent(); wG.net.sendItem('k', 'mA'); const gGone = [snSeen(wG), snOf(wG, wG.a1, 'tA'), wG.ids(wG.a1).indexOf('orc') >= 0];
    check('senses S2b (host): the GM giving a token a range of its own (and the save that sends the map) reaches its player at once — the orc on both her copies and through her live relay, her token carrying the range, Bo\'s copy never; taking it away takes the orc and the range away again',
        J(gBefore) === J(seenT[0]) && J(gAfter) === J([seenT[1], s65(), 'none', true]) && J(gGone) === J([seenT[0], 'none', false]), J([gBefore, gAfter, gGone]));
    const wPt = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } });
    wPt.api.item(patchMsg({ senses: [{ id: 'sn_ether001', n: 100000 }] }, [{ id: 'tB', x: 100, y: 200, rot: 0, front: 0, senses: [{ id: 'sn_ether001', n: 100000 }] }]), wPt.a1);
    wPt.api.item(patchMsg({ x: 150 }), wPt.a1); wPt.api.patch(patchMsg({ x: 150, senses: [] }), { id: 'u_a' });
    const patT = [wPt.tok('tA').senses, Object.prototype.hasOwnProperty.call(wPt.tok('tB'), 'senses'), wPt.tok('tA').x, snN(wPt.b1.sent), wPt.a2.sent.filter(m => m.type === 'item').map(m => snN(m))];
    // what the mutants found: a hidden, waiting or GM-note item sharing a visible token's id never lends it its ranges (a hidden one is not sent: it cannot take
    // the visible one's; a senses list with a stray entry sends as ever; a host with no cleaner on hand sends no ranges at all
    const wDup = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }), dupB = wDup.camp.items.mA.whiteboard;
    dupB.push({ id: 'tA', type: 'rect', hidden: true, ownerId: 'u_a', x: 0, y: 0, w: 5, h: 5, senses: [{ id: 'sn_ether001', n: 70 }] });
    wDup.clearSent(); wDup.net.sendItem('k', 'mA'); const dupA = wDup.last(wDup.a1).whiteboard.filter(w => w.id === 'tA').map(w => [!!w.hidden, w.senses || 'none']);
    const wDup2 = S7({ system: sysSn(snBy(0)) }), dupB2 = wDup2.camp.items.mA.whiteboard;
    dupB2.push({ id: 'tA', type: 'rect', hidden: true, ownerId: 'u_a', x: 0, y: 0, w: 5, h: 5, senses: s65() }, { id: 'tA', type: 'circle', waiting: 1, ownerId: 'u_a', x: 0, y: 0, w: 5, h: 5, senses: s65() }, { id: 'tA', type: 'note', gmNoteFor: 'u_a', ownerId: 'u_a', x: 0, y: 0, senses: s65() });
    wDup2.clearSent(); wDup2.net.sendItem('k', 'mA'); const dupC = snN(wDup2.last(wDup2.a1));
    const wStray = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); wStray.camp.system.combat.senses.list.push(null); wStray.clearSent(); let strayErr = ''; try { wStray.net.sendItem('k', 'mA'); } catch (e) { strayErr = e.message; }
    const wNoC = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); delete wNoC.winRef.wpFogCore; wNoC.clearSent(); wNoC.net.sendItem('k', 'mA'); wNoC.winRef.wpFogCore = FCx;
    check('senses S2b (host): a hidden, a waiting or a GM-note item that shares a visible token\'s id never lends it its ranges, and the hidden one is not sent; a stray entry in the senses list sends as ever; with no cleaner on hand the host sends no ranges at all',
        J(dupA) === J([[false, s65()]]) && dupC === 0 && strayErr === '' && J(snOf(wStray, wStray.a1, 'tA')) === J(s65()) && snN(wNoC.a1.sent) + snN(wNoC.a2.sent) + snN(wNoC.b1.sent) === 0 && wNoC.a1.sent.length === 1, J([dupA, dupC, strayErr, wNoC.a1.sent.length]));
    check('senses S2b (host): no map copy of a player\'s sets a token\'s ranges — their own token\'s stay the GM\'s (a range sent, none sent, an empty list), another\'s get none; the copies it sends on carry the host\'s ranges to that player\'s other connection and none to anyone else',
        J(patT) === J([s65(), false, 150, 0, [1]]), J(patT));

    // senses S3-1: blindness on the host's judgment and on the wire — the GM's Blind tick (item.blind) goes only to its own player on a
    // fogged map, true only; a Blinded sheet with no map saved empties the live relay at once and catches the copies up; no patch sets it
    const sysBl = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }, { id: 'f_bl', key: 'Blinded', label: 'Blinded', kind: 'toggle', vis: 'all', edit: 'gm' }], combat: { senses: { blind: { field: 'f_bl' } } } }, { F: Fx, gmView: true });
    const blOf = (W, c, id, mapId) => { const it = W.last(c, mapId), t = it && it.whiteboard.find(w => w && w.id === id); return !t ? 'absent' : Object.prototype.hasOwnProperty.call(t, 'blind') ? t.blind : 'none'; };
    const bAt = (W, id) => { const t = W.tok(id); return [t.x + 25, t.y + 25]; };
    const wBl = S7({ system: sysBl }), blBefore = [wBl.view(wBl.a1).ids.slice(), wBl.fog.canSeePoint('u_a', wBl.camp, wBl.camp.items.mA, ...bAt(wBl, 'tB'))];
    wBl.tok('tA').blind = true; wBl.tok('tB').blind = 'yes'; wBl.fog.invalidateVision(); wBl.clearSent(); wBl.net.sendItem('k', 'mA');
    const blT = { before: blBefore, a1: wBl.ids(wBl.a1), a2: wBl.ids(wBl.a2), b: wBl.ids(wBl.b1), aTA: blOf(wBl, wBl.a1, 'tA'), aTAsenses: snOf(wBl, wBl.a1, 'tA'), a2TA: blOf(wBl, wBl.a2, 'tA'), bTA: blOf(wBl, wBl.b1, 'tA'), bTB: blOf(wBl, wBl.b1, 'tB'), relay: wBl.fog.canSeePoint('u_a', wBl.camp, wBl.camp.items.mA, ...bAt(wBl, 'tB')), clone: /"blind"/.test(J(wBl.api.clean(wBl.camp.items.mA))), host: [wBl.tok('tA').blind, wBl.tok('tB').blind] };
    check('senses S3 (host): a token the GM ticks Blind is judged blind at once (on a dark map Bo\'s token 2 cells off leaves both of Ana\'s copies and her live relay) and only its own player receives the tick, true only, on both her copies; Bo\'s copy carries none, nor any tick not true; the shared clone never holds one; the host\'s own map keeps both as set',
        J(blT) === J({ before: [['tA', 'tB'], true], a1: ['tA'], a2: ['tA'], b: ['tA', 'tB'], aTA: true, aTAsenses: 'none', a2TA: true, bTA: 'none', bTB: 'none', relay: false, clone: false, host: [true, 'yes'] }), J(blT));
    const wBn = S7({ system: sysBl }); wBn.tok('orc').x = 200; wBn.tok('orc').blind = true; wBn.tok('tB').blind = true; wBn.fog.invalidateVision(); wBn.clearSent(); wBn.net.sendItem('k', 'mA');
    const blN = [blOf(wBn, wBn.a1, 'orc'), blOf(wBn, wBn.a1, 'tB'), blOf(wBn, wBn.b1, 'tB'), blOf(wBn, wBn.b1, 'orc'), wBn.ids(wBn.a1)];
    const wBu = S7({ system: sysBl, tA: { blind: true } }); wBu.camp.items.mA.fog.on = false; wBu.clearSent(); wBu.net.sendItem('k', 'mA'); wBu.net.broadcastItemFiltered('k', 'mA');
    const blU = [wBu.a1.sent.length, (J(wBu.a1.sent).match(/"blind"/g) || []).length + (J(wBu.b1.sent).match(/"blind"/g) || []).length, (J(wBu.api.copy(wBu.api.clean(wBu.camp.items.mA), wBu.camp, JSON.parse(J(wBu.camp.items.mA)), 'u_a')).match(/"blind"/g) || []).length];
    check('senses S3 (host): an NPC\'s tick never reaches anyone (the orc Ana sees arrives without it), another player\'s never reaches Ana (Bo\'s own copy carries his, and blind he is sent no orc); a map with no fog carries no tick to anyone, the join snapshot\'s copy of it included',
        J(blN) === J(['none', 'none', true, 'absent', ['tA', 'tB', 'orc']]) && blU[0] >= 1 && blU[1] === 0 && blU[2] === 0, J([blN, blU]));
    const wBs = S7({ system: sysBl }), bsBefore = wBs.fog.canSeePoint('u_a', wBs.camp, wBs.camp.items.mA, ...bAt(wBs, 'tB'));
    wBs.camp.chars.c_a.values.f_bl = true; wBs.clearSent(); wBs.net.sensesMoved('c_a');
    const bsNow = { relay: wBs.fog.canSeePoint('u_a', wBs.camp, wBs.camp.items.mA, ...bAt(wBs, 'tB')), sentYet: wBs.a1.sent.length, bo: wBs.fog.canSeePoint('u_b', wBs.camp, wBs.camp.items.mA, ...bAt(wBs, 'tA')) };
    wBs.fire(500); const bsAfter = { a1: wBs.view(wBs.a1).ids, a2: wBs.view(wBs.a2).ids, b: wBs.b1.sent.length, kinds: wBs.a1.sent.map(m => m.type + ':' + m.itemId).sort() };
    wBs.camp.chars.c_a.values.f_bl = false; wBs.clearSent(); wBs.net.sensesMoved('c_a'); const bsBack = wBs.fog.canSeePoint('u_a', wBs.camp, wBs.camp.items.mA, ...bAt(wBs, 'tB')); wBs.fire(500); const bsBack2 = wBs.view(wBs.a1).ids;
    check('senses S3 (host): a Blinded toggle put on Ana\'s sheet with no map saved empties her live relay at once (before anything is sent; Bo\'s own sight untouched) and then catches both her copies up in place, Bo sent nothing; taking it off gives the relay and the copies back',
        bsBefore === true && J(bsNow) === J({ relay: false, sentYet: 0, bo: true }) && J(bsAfter.a1) === J(['tA']) && J(bsAfter.a2) === J(['tA']) && bsAfter.b === 0 && bsAfter.kinds.indexOf('fogDiff:mA') >= 0 && bsBack === true && J(bsBack2) === J(['tA', 'tB']), J([bsBefore, bsNow, bsAfter, bsBack, bsBack2]));
    const wBp = S7({ system: sysBl, tA: { blind: true } }); wBp.api.item(patchMsg({ blind: false }), wBp.a1); wBp.api.patch(patchMsg({ x: 150 }), { id: 'u_a' });
    const wBq = S7({ system: sysBl }); wBq.api.item(patchMsg({ blind: true }, [{ id: 'tB', x: 100, y: 200, rot: 0, front: 0, blind: true }]), wBq.a1);
    check('senses S3 (host): no map copy of a player\'s sets or clears the Blind tick — their own blinded token stays blind (a copy saying false, one with none), an unblinded one gains none, another\'s gains none',
        wBp.tok('tA').blind === true && !('blind' in wBq.tok('tA')) && !('blind' in wBq.tok('tB')), J([wBp.tok('tA'), wBq.tok('tA'), wBq.tok('tB')]));

    // fold R: a whole copy of a fogged map that changes which of a fight's tokens (or a pointer's) a connection holds sends that connection the
    // turn order and the pointers again at once — a creature the GM walks out of a player's sight loses its name there before the next turn step
    const rFight = W => { W.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA' }, { id: 'r_o', name: 'Orc', tokId: 'orc' }, { id: 'r_x', name: 'Extra' }] } }; Object.keys(W.net.roster).forEach(k => { W.net.roster[k].location = 'mA'; }); };   // fold 2: everyone stands on mA, where the fight is
    const rowsTo = (W, c) => { const m = W.msg(c, 'combats'), fr = m && fightIn(m.combats, 'mA'); return fr ? fr.rows.map(r => r.name) : null; }, rKinds = c => c.sent.map(m => m.type);
    const R1w = S7(); R1w.tok('orc').x = 250; rFight(R1w); R1w.clearSent(); R1w.net.sendItem('k', 'mA'); R1w.api.combats(); const rStart = [rowsTo(R1w, R1w.a1), rowsTo(R1w, R1w.b1)];
    R1w.tok('orc').x = 750; R1w.fog.invalidateVision(); R1w.clearSent(); R1w.net.sendItem('k', 'mA');
    const rAway = { a1: rKinds(R1w.a1), a2: rKinds(R1w.a2), b: rKinds(R1w.b1), rowsA: rowsTo(R1w, R1w.a1), rowsB: rowsTo(R1w, R1w.b1), orcA: R1w.ids(R1w.a1).indexOf('orc') >= 0 };
    R1w.tok('orc').x = 751; R1w.clearSent(); R1w.net.sendItem('k', 'mA'); const rStill = [rKinds(R1w.a1), rKinds(R1w.b1)];
    R1w.tok('orc').x = 250; R1w.fog.invalidateVision(); R1w.clearSent(); R1w.net.broadcastItemFiltered('k', 'mA'); const rBack = { a1: rKinds(R1w.a1), rowsA: rowsTo(R1w, R1w.a1) };
    check('fold R (and the owner\'s ruling of 2026-10-01): a creature the GM walks out of a player\'s sight (a GM save, a whole copy of a fogged map) has their turn order sent again at once — each of their connections, after the copy — where the orc, seen at the start, keeps its name; a save that changes nothing a fight\'s token is held by sends the copy alone; walking it back, a copy sent to the table names it again',
        J(rStart) === J([['Ana', 'Orc', 'Extra'], ['Ana', 'Orc', 'Extra']]) && J(rAway) === J({ a1: ['item', 'combats'], a2: ['item', 'combats'], b: ['item', 'combats'], rowsA: ['Ana', 'Orc', 'Extra'], rowsB: ['Ana', 'Orc', 'Extra'], orcA: false })
        && J(rStill) === J([['item'], ['item']]) && J(rBack) === J({ a1: ['item', 'combats'], rowsA: ['Ana', 'Orc', 'Extra'] }), J([rStart, rAway, rStill, rBack]));
    const R2w = S7(); R2w.tok('orc').x = 250; R2w.net.targets = { u_b: { id: 'orc', mapId: 'mA', name: 'Bea' } }; R2w.clearSent(); R2w.net.sendItem('k', 'mA');
    R2w.tok('orc').x = 750; R2w.fog.invalidateVision(); R2w.clearSent(); R2w.net.sendItem('k', 'mA');
    const rPtr = { a1: rKinds(R2w.a1), ptrA: Object.keys((R2w.msg(R2w.a1, 'targets') || {}).targets || {}) };
    const R3w = S7(); R3w.tok('orc').x = 250; R3w.clearSent(); R3w.net.sendItem('k', 'mA'); R3w.tok('orc').x = 750; R3w.fog.invalidateVision(); R3w.clearSent(); R3w.net.sendItem('k', 'mA'); const rNone = [rKinds(R3w.a1), rKinds(R3w.b1)];
    const R4w = S7(); rFight(R4w); R4w.api.forgetAll(); R4w.clearSent(); R4w.net.sendItem('k', 'mA', R4w.a1); const rFirst = [rKinds(R4w.a1), rKinds(R4w.a2)];
    const R5w = S7(); R5w.net.combats = { mB: { mapId: 'mB', round: 1, turn: 0, rows: [{ id: 'r_o', name: 'Orc', tokId: 'orc2' }] } }; R5w.tok('orc').x = 250; R5w.clearSent(); R5w.net.sendItem('k', 'mA'); R5w.tok('orc').x = 750; R5w.fog.invalidateVision(); R5w.clearSent(); R5w.net.sendItem('k', 'mA'); const rOther = rKinds(R5w.a1);
    const rFail = [], R7w = S7({ failed: rFail }); rFight(R7w); const a1Send = R7w.a1.send; R7w.a1.send = function(m) { if (m.type === 'fogDiff') throw new Error('packer'); return a1Send.call(this, m); };
    R7w.move(R7w.a1, 'tA', 250, 100, false); R7w.move(R7w.a1, 'tA', 250, 100, true); R7w.clearSent(); R7w.fire(150); const rFall = { a1: rKinds(R7w.a1).filter(t => t !== 'pos'), rows: rowsTo(R7w, R7w.a1), failed: rFail.slice() };
    const R6w = S7(); R6w.net.targets = { u_b: { id: 'orc', mapId: 'mB', name: 'Bea' } }; R6w.tok('orc').x = 250; R6w.clearSent(); R6w.net.sendItem('k', 'mA'); R6w.tok('orc').x = 750; R6w.fog.invalidateVision(); R6w.clearSent(); R6w.net.sendItem('k', 'mA'); const rOtherPtr = rKinds(R6w.a1);
    check('fold R: a pointer at a creature that leaves a player\'s sight is taken from their pointers at once; a map with no fight and no pointer sends the copy alone; a copy with no record before (a first copy, after the record was forgotten) sends the order where the map has a fight; a fight or a pointer on another map is not this copy\'s business; a catch-up whose message cannot go sends the whole copy and the order once',
        J(rPtr.a1) === J(['item', 'targets']) && J(rPtr.ptrA) === J([]) && J(rNone) === J([['item'], ['item']]) && J(rFirst) === J([['item', 'combats'], []]) && J(rOther) === J(['item']) && J(rOtherPtr) === J(['item'])
        && J(rFall) === J({ a1: ['item', 'combats'], rows: ['Ana', 'Orc', 'Extra'], failed: ['packer'] }), J([rPtr, rNone, rFirst, rOther, rOtherPtr, rFall]));

    // senses S4a (host): marks — a player's Hearing (80 ft: 16 cells on 5 ft squares, passing walls, all round) marks the orc 13 cells off that their
    // eyes (12) do not show: on their own copies of a fogged map only, a cell and a glyph number and nothing of the orc's; caught up with their moves
    const sysMk = (range, byField) => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }, { id: 'f_hr', key: 'HearR', label: 'Hearing', kind: 'number', def: 0, vis: 'all' }],
        combat: { senses: { list: [{ id: 'sn_hear0001', name: 'Hearing', grade: 'mark', glyph: 'sound', walls: 'pass', arc: 'all', range: byField ? { by: 'field', field: 'f_hr' } : { by: 'n', n: range }, unit: 'ft' }] } } }, { F: Fx, gmView: true });
    const mkOf = (W, c, mapId) => { const it = W.last(c, mapId); return !it ? 'absent' : Object.prototype.hasOwnProperty.call(it, 'fogMarks') ? it.fogMarks : 'none'; };
    const wM = S7({ system: sysMk(80) }); wM.tok('orc').unsensed = ['sn_other0001']; wM.tok('tB').unsensed = true; wM.camp.items.mA.fogMarks = [{ c: 1, r: 1, k: 1 }]; wM.camp.items.mA.fogOff = { tA: ['sn_hear0001'] }; wM.clearSent(); wM.net.sendItem('k', 'mA'); wM.net.broadcastItemFiltered('k', 'mB');
    const mkGot = { a1: mkOf(wM, wM.a1), a2: mkOf(wM, wM.a2), b: mkOf(wM, wM.b1), orcNamed: /"orc"|Orc|unsensed/.test(J(wM.a1.sent.concat(wM.b1.sent))), mB: mkOf(wM, wM.a1, 'mB'), clone: /fogMarks|fogOff/.test(J(wM.api.clean(wM.camp.items.mA))), tBUns: /unsensed/.test(J(wM.a1.sent)), hostUns: J(wM.tok('orc').unsensed) };
    const wM0 = S7({ system: sysMk(0) }); wM0.clearSent(); wM0.net.sendItem('k', 'mA'); const mk0 = [mkOf(wM0, wM0.a1), /fogMarks/.test(J(wM0.a1.sent))];
    const wMu = S7({ system: sysMk(80) }); wMu.camp.items.mA.fog.on = false; wMu.clearSent(); wMu.net.sendItem('k', 'mA'); const mkU = /fogMarks/.test(J(wMu.a1.sent.concat(wMu.b1.sent)));
    check('senses S4a (host): a creature a player\'s mark sense finds but their eyes do not is marked on each of their copies of that fogged map — a cell and a glyph number and nothing else (not its id, name, picture, nor the GM\'s tick of senses that never mark it) — for each player by their own tokens; never on the shared clone (not even from a host\'s map a hand-edited save left holding some), a map with no creature to mark, or a map with no fog; no key at all where there is no mark; the GM\'s ticks of senses that never mark a token never travel, on a creature a player is sent either',
        J(mkGot) === J({ a1: [{ c: 15, r: 2, k: 1 }], a2: [{ c: 15, r: 2, k: 1 }], b: [{ c: 15, r: 2, k: 1 }], orcNamed: false, mB: [{ c: 15, r: 2, k: 1 }], clone: false, tBUns: false, hostUns: '["sn_other0001"]' }) && J(mk0) === J(['none', false]) && mkU === false, J([mkGot, mk0, mkU]));
    const wMc = S7({ system: sysMk(80) }); wMc.move(wMc.a1, 'tA', 250, 100, false); wMc.move(wMc.a1, 'tA', 250, 100, true); wMc.clearSent(); wMc.fire(150);
    const mkIn = { a1: wMc.a1.sent.filter(m => m.type === 'fogDiff').map(m => [(m.add || []).map(a => a.item.id), m.marks]), page: wMc.a1.page.map('mA').fogMarks === undefined, b: wMc.b1.sent.filter(m => m.type === 'fogDiff').length };
    wMc.move(wMc.a1, 'tA', 100, 100, false); wMc.move(wMc.a1, 'tA', 100, 100, true); wMc.clearSent(); wMc.fire(150);
    const mkOut = { a1: wMc.a1.sent.filter(m => m.type === 'fogDiff').map(m => [m.drop, m.marks]), page: J(wMc.a1.page.map('mA').fogMarks) };
    wMc.tok('orc').x = 850; wMc.fog.invalidateVision(); wMc.clearSent(); wMc.net.sendItem('k', 'mA'); const mkGm = [mkOf(wMc, wMc.a1), mkOf(wMc, wMc.b1)];
    check('senses S4a (host): a player walking up to the marked orc sees it — their copy caught up in place gains the orc and loses the mark (an empty list), their page with no mark; walking back loses the orc and marks it again; Bo, whose marks did not change, is sent nothing; the GM moving the orc moves its mark on every copy',
        J(mkIn) === J({ a1: [[['orc'], []]], page: true, b: 0 }) && J(mkOut) === J({ a1: [[['orc'], [{ c: 15, r: 2, k: 1 }]]], page: '[{"c":15,"r":2,"k":1}]' }) && J(mkGm) === J([[{ c: 17, r: 2, k: 1 }], [{ c: 17, r: 2, k: 1 }]]), J([mkIn, mkOut, mkGm]));
    const wMf = S7({ system: sysMk(0, true) }); wMf.camp.chars.c_a.values.f_hr = 25; wMf.net.sensesMoved('c_a'); wMf.fire(500); wMf.clearSent(); wMf.camp.chars.c_a.values.f_hr = 30; wMf.net.sensesMoved('c_a'); const mkArmed = wMf.timers.filter(t => t.fn && t.ms === 500).length; wMf.fire(500);
    const mkQuiet = wMf.a1.sent.length + wMf.a2.sent.length + wMf.b1.sent.length;
    wMf.camp.chars.c_a.values.f_hr = 80; wMf.clearSent(); wMf.net.sensesMoved('c_a'); wMf.fire(500); const mkReach = wMf.a1.sent.filter(m => m.type === 'fogDiff').map(m => J(m.marks));
    check('senses S4a (host): a mark sense\'s range read from the sheet that changes with no creature in either range arms a catch-up that sends nothing; one that comes to reach the orc sends each of the player\'s copies its mark',
        mkArmed >= 1 && mkQuiet === 0 && J(mkReach) === J(['[{"c":15,"r":2,"k":1}]', '[{"c":15,"r":2,"k":1}]']), J([mkArmed, mkQuiet, mkReach]));

    // (6) where it is wired, in the source
    const hbA = src.indexOf('function hbTick() {'), hbS = src.slice(hbA, src.indexOf('\n    } else {', hbA));
    const clA = src.indexOf("conn.on('close', function() {"), clS = src.slice(clA, src.indexOf("} else if (net.leaving) {", clA));
    const kpS = whole4('net.kickPlayer = function('), lvS = fnSrc('function leaveSession(silent) {', '\n}\n', 'leaveSession'), shS = fnSrc('function startHosting(forceFresh) {', '\n    diceSessionReset(true);', 'startHosting');
    const fmS = bw('fogmove', 'netfog.js'), admS = fnSrc('function admitPlayer(', '\n}\n', 'admitPlayer');
    check('fold M4 (source): the heartbeat\'s host branch ends with the sweep; the close handler sweeps after it forgets the player\'s senses and before its save; kickPlayer sweeps once the roster entries are gone; the session\'s end sweeps every drag back before the table is torn down; a new table starts with no drag; the clock lives outside every slice; both whole-map sends, the snapshot, the turn order, the pointers and the senses resend are judged inside fogLanded; the pos gate and the patch path read the drag through openDrag',
        /fogDragSweep\(\);[^\n]*\n\s*\} else \{/.test(src.slice(hbA, hbA + hbS.length + 20)) && /sensesForget\(p\.id\);[^\n]*\n\s*if \(net\.role === 'host' && typeof fogDragSweep === 'function'\) fogDragSweep\(\);/.test(clS) && clS.indexOf('fogDragSweep()') < clS.indexOf('save(true)')
        && /renderRoster\(\); \}\n\s*if \(p && typeof fogDragSweep === 'function'\) fogDragSweep\(\);/.test(kpS) && lvS.indexOf('fogDragSweep(true)') > 0 && lvS.indexOf('fogDragSweep(true)') < lvS.indexOf('net.conns = []') && /sensesReset\(\);[^\n]*\n\s*_dragFrom = Object\.create\(null\); _refusedAt = Object\.create\(null\);/.test(shS)
        && /\nfunction fogNow\(\) \{ return Date\.now\(\); \}[^\n]*\n\/\/ \[netcheck:fogmove-start\]/.test(require('./checkkit').part('netfog.js')) && fmS.indexOf('function fogNow') < 0 && require('./checkkit').familyCount('net.js', /function fogNow\(/g) === 1
        && (whole4('net.sendItem = function(').match(/fogLanded\(itemId, fogSend\)/g) || []).length === 1 && /var fogSend = function\(\) \{[^]*?var clean = sanitizeItem\(it\);/.test(whole4('net.sendItem = function(')) && /var fogSend = function\(\) \{[^\n]*\n\s*var clean = sanitizeItem\(it\);/.test(whole4('net.broadcastItemFiltered = function('))
        && /fogLanded\(null, mkSnap\); else mkSnap\(\);[^\n]*\n\s*conn\.send\(snap\);[^\n]*\n\s*\} catch \(e\) \{ sendFailed\(e, 'snapshot'\);/.test(admS) && (bw('combats').match(/fogLanded\(null, sendAll\)/g) || []).length === 2 && (bw('sensesmoved').match(/fogLanded\(null, sendAll\)/g) || []).length === 1
        && /frW = openDrag\(msg\.itemId, w\);/.test(bw('pos')) && /frP = \(typeof openDrag === 'function' \? openDrag\(msg\.itemId, lw\) : _dragFrom\[dkP\]\) \|\|/.test(bw('patch', 'netfog.js')));
    const PM = mk4(); PM.move(PM.a1, 'tA', 250, 100, false); PM.tok('tA').x = 400; PM.asked.length = 0;
    PM.api.patch({ type: 'item', campId: 'k', itemId: 'mA', item: { type: 'map', whiteboard: [{ id: 'tA', x: 450, y: 100, rot: 0, front: 0 }] } }, { id: 'u_a' });
    check('fold M4: a map copy that lands after the GM moved the token mid-drag is judged from the GM\'s place (that drag is over), never from where the drag began',
        J(PM.asked[0]) === J([400, 100, 450, 100]) && J(PM.place('tA')) === J([450, 100, 0, 0]), J([PM.asked, PM.place('tA')]));
})());
// fold M6: the GM's open board gesture, published (inert): the helper run for real on a stub page, and where each gesture sets and clears it
{
    const rdS = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
    const wbT = rdS('whiteboard.js'), dmT = rdS('datamap.js');
    const hgA = wbT.indexOf('// [netcheck:hostgesture-start]'), hgB = wbT.indexOf('// [netcheck:hostgesture-end]'), hgS = hgA >= 0 && hgB > hgA ? wbT.slice(hgA, hgB) : 'throw new Error("hostgesture not found")';
    const page = (n, map) => { const win = { wpNet: n, on: {}, addEventListener(t, f) { this.on[t] = f; } }; new Function('window', 'getActiveMap', '"use strict";\n' + hgS)(win, () => map); return win; };
    const host = page({ active: true, role: 'host' }, { id: 'mA' }), seen = [host.wpHostGesture];
    host.wpHostGestureStart(); seen.push(host.wpHostGesture); host.wpHostGestureEnd(); seen.push(host.wpHostGesture); host.wpHostGestureStart(); host.on.blur(); seen.push(host.wpHostGesture);
    const others = [page({ active: true, role: 'client' }, { id: 'mA' }), page({ active: false, role: 'host' }, { id: 'mA' }), page(undefined, { id: 'mA' }), page({ active: true, role: 'host' }, null), page({ active: true, role: 'host' }, { id: 5 })].map(p => { p.wpHostGesture = 'stale'; p.wpHostGestureStart(); return p.wpHostGesture; });
    check('fold M6: the GM\'s open board gesture is published only on a hosting machine — the map\'s id while it runs, null when it ends or the window loses focus; a player\'s machine, a table not running, no table, no map or a map id that is no text publish none (and a stale mark is cleared)',
        j(seen) === j([null, 'mA', null, null]) && j(others) === j([null, null, null, null, null]) && typeof host.on.blur === 'function', j([seen, others]));
    const cut = (t, a, b) => { const i = t.indexOf(a), k = t.indexOf(b, i + 1); return i >= 0 && k > i ? t.slice(i, k) : ''; };
    const resS = cut(wbT, '  function attachResizeHandle() {', '\n  function facingStepFor('), rotS = cut(wbT, '  function attachRotateHandle() {', '\n  // Default opacity for newly created items'), fogS = cut(wbT, '      var _fogPaintBtn = -1;', '\n  // Fill bucket');
    const dragS = cut(dmT, '  function attachDrag(el, modeStr){', "\n      el.addEventListener('pointermove',function(e){"), upS = cut(dmT, "      el.addEventListener('pointerup',function(e){", '\n        if (lockedMq) {');
    const handle = (s, flag) => (s.match(/hostGestureStart\(\);/g) || []).length === 1 && new RegExp('setPointerCapture\\(e\\.pointerId\\); \\} catch\\(_\\) \\{\\}\\n\\n\\s*hostGestureStart\\(\\);').test(s) && new RegExp(flag + ' = false;\\n\\n\\s*hostGestureEnd\\(\\);').test(s)
        && /handle\.addEventListener\('pointercancel', hostGestureEnd\); handle\.addEventListener\('lostpointercapture', hostGestureEnd\);/.test(s);
    check('fold M6 (source): the resize and rotate handles publish the gesture once they hold the pointer and clear it at their pointerup, a cancel or a lost capture; a fog-brush stroke publishes it only when it paints (a door click does not) and clears it when the pointer comes up or is canceled; a board drag publishes it on the play map only, once it holds the pointer, and clears it first thing at its pointerup (which a cancel, a lost capture and a lost focus reach through abortDrag); datamap.js names none of the host\'s senses',
        handle(resS, 'isResizing') && handle(rotS, 'isRotating') && fogS.indexOf('toggleDoorAt') >= 0 && fogS.indexOf('toggleDoorAt') < fogS.indexOf('hostGestureStart();') && /_fogPaintBtn = e\.button;\n\s*hostGestureStart\(\);/.test(fogS)
        && /document\.addEventListener\('pointerup', function\(\) \{ if \(_fogPaintBtn >= 0\) \{ hostGestureEnd\(\); if \(window\.wpFog && window\.wpFog\.strokeEnd\) window\.wpFog\.strokeEnd\(\); \} _fogPaintBtn = -1; \}\);/.test(fogS) && /document\.addEventListener\('pointercancel', function\(\) \{ if \(_fogPaintBtn >= 0\) \{ hostGestureEnd\(\); if \(window\.wpFog && window\.wpFog\.strokeEnd\) window\.wpFog\.strokeEnd\(true\); \} _fogPaintBtn = -1; \}\);/.test(fogS)
        && /el\.classList\.add\('dragging'\);\n\s*if \(modeStr === 'visual' && window\.wpHostGestureStart\) window\.wpHostGestureStart\(\);/.test(dragS) && (dmT.match(/wpHostGestureStart\(\)/g) || []).length === 1
        && /if\(!dragging\) return;\n\s*if \(window\.wpHostGestureEnd\) window\.wpHostGestureEnd\(\);/.test(upS) && /function abortDrag\(e\) \{\n\s*if \(!dragging\) return;\n\s*el\.dispatchEvent\(new PointerEvent\('pointerup'/.test(dmT)
        && !/senses|amL|invalidateSeen|sightSigFor/.test(dmT), j([resS.length, rotS.length, fogS.length, dragS.length, upS.length]));
}
// fold M8: a player's app asks its host for one map whole (net.needItem), and a gesture's moves name the map it began on (net.streamPos)
{
    const w8 = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const mk8 = role => { const sent = [], n = { active: true, role, paused: false, selfPaused: false, foreign: true, syncedPeer: 'h', conns: [{ peer: 'h', open: true, send(m) { packCheck(m); sent.push(JSON.parse(j(m))); } }] }; const camp = { id: 'k', activeItemId: 'mB', items: { mA: { id: 'mA', type: 'map' }, mB: { id: 'mB', type: 'map' } } };
        const relayed = []; new Function('net', 'getActiveCampaign', 'sendFailed', 'broadcastPos', '_posLast', 'var _posLast = 0;\n' + w8('net.needItem = function(') + w8('net.streamPos = function('))(n, () => camp, e => { throw e; }, (m, x, c, map) => relayed.push([m.itemId, map && map.id]));
        return { n, sent, relayed }; };
    const c8 = mk8('client'); c8.n.needItem('k', 'mA'); c8.n.needItem('k', 5); c8.n.needItem(null, 'mA'); c8.n.streamPos({ id: 't', x: 1, y: 2 }, true, 'mA'); c8.n.streamPos({ id: 't', x: 1, y: 2 }, true);
    const h8 = mk8('host'); h8.n.needItem('k', 'mA'); h8.n.streamPos({ id: 't', x: 1, y: 2 }, true, 'mA'); h8.n.streamPos({ id: 't', x: 1, y: 2 }, true, 'constructor');
    const off8 = mk8('client'); off8.n.active = false; off8.n.needItem('k', 'mA');
    check('fold M8: a player\'s app asks its host for one map whole in one message (never with an id that is no text, never off a table, never from the host); a gesture\'s final names the map it began on, the map on screen when none is given; on the host the relay is judged on that map (none for a prototype name)',
        j(c8.sent.map(m => m.type + ':' + m.itemId)) === j(['needItem:mA', 'pos:mA', 'pos:mB']) && j(c8.sent[0]) === j({ type: 'needItem', campId: 'k', itemId: 'mA' }) && h8.sent.length === 0 && j(h8.relayed) === j([['mA', 'mA'], ['constructor', null]]) && off8.sent.length === 0,
        j([c8.sent, h8.relayed]));
}

// 1.6.3 (the multiplayer review, finding 8): a save of the GM's on a fogged map sent each player the whole map. Each connection's copy is now summed
// up as it goes out and the next send to it is a delta against that summary where the copy is large and the delta clearly smaller, nothing
// where it would be the same (the fogdelta slice of netfog.js, run for real, its delta laid as a player's app lays one)
{
    const J = j;
    const fdSrc = between('// [netcheck:fogdelta-start]', '// [netcheck:fogdelta-end]', 'fogdelta', 'netfog.js');
    const qh = fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\n';
    const FD = new Function('own', "'use strict';\nvar _fogHeld = Object.create(null);\n" + qh + fdSrc + '\nreturn { forDelta: fogDeltaFor, keep: function(peer, mapId, sum) { (_fogHeld[peer] = _fogHeld[peer] || Object.create(null))[mapId] = { sum: sum }; }, drop: function(peer, mapId) { delete _fogHeld[peer][mapId].sum; }, MIN: FOG_DELTA_MIN };')((o, k) => Object.prototype.hasOwnProperty.call(o, k));
    const piece = (i, x) => ({ id: 'w' + i, type: 'rect', x: x === undefined ? i * 10 : x, y: 5, w: 40, h: 40, name: 'piece number ' + i + ' of the map, with words enough to weigh something' });
    const mapOf = (n, more) => Object.assign({ type: 'map', id: 'm', meta: { title: 'M' }, rooms: [{ id: 'r1', name: 'Hall' }], links: [], cats: {}, fog: { on: true }, whiteboard: Array.from({ length: n }, (x, i) => piece(i)) }, more || {});
    const lay = (copy, d) => {   // as applyItemDelta lays a delta on a player's copy (netfog.js)
        const it = JSON.parse(J(copy));
        ['whiteboard', 'rooms'].forEach(key => { const ch = d[key]; if (!ch) return; const list = it[key], at = Object.create(null); list.forEach((x, i) => { at[x.id] = i; });
            ch.del.forEach(id => { if (at[id] !== undefined) list[at[id]] = null; }); ch.set.forEach(x => { if (at[x.id] !== undefined && list[at[x.id]]) list[at[x.id]] = x; else list.push(x); }); it[key] = list.filter(Boolean);
            if (ch.order) { const pos = Object.create(null); ch.order.forEach((id, i) => { pos[id] = i; }); it[key].sort((a, b) => (pos[a.id] === undefined ? 1e9 : pos[a.id]) - (pos[b.id] === undefined ? 1e9 : pos[b.id])); } });
        ['links', 'meta', 'cats'].forEach(k => { if (d[k] !== undefined) it[k] = d[k]; });
        return it; };
    const R = {};
    const big0 = mapOf(200), first = FD.forDelta({ peer: 'pA' }, 'm', big0, new Map());   // no record yet: whole
    R.first = [first.d, first.sum.n > FD.MIN];
    FD.keep('pA', 'm', first.sum);
    const same = FD.forDelta({ peer: 'pA' }, 'm', JSON.parse(J(big0)), new Map()); R.same = same.d;   // nothing changed: nothing goes
    const big1 = JSON.parse(J(big0)); big1.whiteboard[7].x = 999; big1.whiteboard.splice(20, 1); big1.whiteboard.push(piece(500)); big1.meta = { title: 'M2' };
    const one = FD.forDelta({ peer: 'pA' }, 'm', big1, new Map());
    R.one = one.d ? [one.d.type, one.d.whiteboard.set.map(w => w.id).join(), one.d.whiteboard.del.join(), !!one.d.whiteboard.order, J(one.d.meta), J(lay(big0, one.d)) === J(big1)] : null;
    const lit = JSON.parse(J(big0)); lit.fogLit = [[1, 2]]; R.lit = FD.forDelta({ peer: 'pA' }, 'm', lit, new Map()).d;   // their lit cells changed: whole
    const small0 = mapOf(4); const s0 = FD.forDelta({ peer: 'pS' }, 'm', small0, new Map()); FD.keep('pS', 'm', s0.sum); R.small = [FD.forDelta({ peer: 'pS' }, 'm', JSON.parse(J(small0)), new Map()).d, s0.sum.n < FD.MIN];   // a small copy: whole every time, as before
    const many = JSON.parse(J(big0)); many.whiteboard.forEach(w => { w.x += 1; }); R.many = FD.forDelta({ peer: 'pA' }, 'm', many, new Map()).d;   // everything moved: the delta is no smaller, whole
    FD.drop('pA', 'm'); R.dropped = FD.forDelta({ peer: 'pA' }, 'm', big1, new Map()).d;   // a catch-up sent in place drops the summary: whole
    const hm = new Map(), shared = mapOf(200); FD.forDelta({ peer: 'pB' }, 'm', shared, hm); const n1 = hm.size; FD.forDelta({ peer: 'pC' }, 'm', { type: 'map', id: 'm', whiteboard: shared.whiteboard.slice(1), rooms: shared.rooms, links: [], meta: shared.meta, cats: {} }, hm); R.memo = [n1, hm.size];   // a send's memo: a piece both copies share is hashed once
    const only = FD.forDelta({ peer: 'pA' }, 'm', big1, new Map(), true); R.only = [only.d, typeof only.sum.n];
    check('1.6.3 (the multiplayer review, finding 8) a fogged map\'s copy to one connection (netfog.js fogDeltaFor, run for real): the first copy goes whole and is summed up; the same copy again sends nothing; a piece moved, one taken away, one added and a new title go as a delta that, laid as a player\'s app lays one, gives that very copy; a change of their lit cells, a copy smaller than the floor, a change of every piece and a copy whose summary was dropped go whole; one send\'s memo hashes a shared piece once; a whole copy that went is only summed up',
        J(R.first) === J([null, true]) && R.same === false && J(R.one) === J(['itemDelta', 'w7,w500', 'w20', true, J({ title: 'M2' }), true]) && R.lit === null && J(R.small) === J([null, true]) && R.many === null && R.dropped === null && J(R.memo) === J([201, 201]) && J(R.only) === J([null, 'number']), J(R));
    const sendS = src.replace(/\r\n/g, '\n'), fogS = require('./checkkit').part('netfog.js').replace(/\r\n/g, '\n');
    check('1.6.3 (finding 8, wired): net.sendItem sends a fogged map\'s copy as the delta fogDeltaFor makes for that connection, never for a copy asked for alone, nothing where it is the same, and records its summary with fogSeed; the table\'s whole send records it too; a catch-up sent in place drops it; the unfogged path stringifies the map once',
        /var fd = typeof fogDeltaFor === 'function' \? fogDeltaFor\(conn, itemId, out, hm\) : null, dF = fd && !onlyConn \? fd\.d : null;[^\n]*\n\s*if \(dF === false\) return;/.test(sendS) && /fogDeltaFor\(conn, itemId, out, hmB, true\)/.test(sendS)
        && /delete rec\.sum;/.test(fogS) && /var msg = full, cleanText = JSON\.stringify\(clean\);/.test(sendS) && /_lastSent\[itemId\] = JSON\.parse\(cleanText\);/.test(sendS));
}
T.finish();
