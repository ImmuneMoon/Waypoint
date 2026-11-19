/* netmatchcheck.js: map builder B5 and Match a wall in the one-module world, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 6, 2026-11-19), word for word with the comment that heads them. They are
   section (6) of B5's pending check, whose sections (1) to (5) and whose heading are netwallcheck.js: the host's real code as one module
   over the real fog.js and fogcore, every send packed for the wire, a real player page per connection, and (6a) to (6g) in it (no fog, under
   fog, a player's map copy, a player's page and a hostile host, and Match a wall's three rounds). The statements both read are
   tools/wallkit.js, taken first.
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netmatchcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc, broadcastSrc } = kit.netSlices('netmatchcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, ownKeySrc, siSrc } = kit.netHarness('netmatchcheck');
const j = JSON.stringify;
pendingChecks.push((async () => {
    const { FC, Sx, Fx, J, ownK, copyOf, flat, has3, KEYSW, has6, less, matchAs, noGeo, SIXWORDS, breathe, WALLC, BOX, D, wallOf, LINE, GATE, STRAY, NONE } = await require('./wallkit').wallKit();   // B5's shared statements (tools/wallkit.js)
    // ---- (6) the one-module world, in the shape of the possession world above: the host's real code as one module over the real fog.js and
    // fogcore, every send packed for the wire, and a real player page per connection (applyItem, applyItemDelta and the fogDiff branch over the
    // real cleanHostMap) ----
    const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const fogSrc = fogT.slice(fogT.indexOf('function core() {'), fogT.indexOf('/* ---------- the overlay'));
    const wholeS = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const bw = (n, file) => between('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]', n, typeof file === 'string' ? file : undefined);   // file: a part of net.js, read by its own name
    const modSrc = ['var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {}, bannedIds = {}, _travelDenyLast = {};',
        'var fxLib = function() { return {}; }, itemLib = function() { return {}; }, withHoverLines = function(v) { return v; };',
        ownKeySrc, siSrc(), bw('mapheld', 'netfog.js'), fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js'), bw('foglit', 'netfog.js'), fnSrc('function anyFog(', '\n}\n', 'anyFog', 'netfog.js') + '\n}\n', lineOf('function mapFogged('), lineOf('var FOG_DIFF_ADD_MAX = ', 'netfog.js'),
        fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\n', lineOf('function uniqueIds(', 'netfog.js'), fnSrc('function itemDelta(itemId, clean) {', '\nfunction applyItemDelta(', 'itemDelta', 'netfog.js'), fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n',
        wholeS('net.sendItem = function('), wholeS('net.broadcastItemFiltered = function('), wholeS('net.itemGone = function('), wholeS('net.pushItems = function('), wholeS('net.summonPlayerToMap = function('), bw('stage'),
        fnSrc('function freeSpotNear(', '\n}\n', 'freeSpotNear') + '\n}\n', fnSrc('function stepOffPortal(', '\n}\n', 'stepOffPortal') + '\n}\n', fnSrc('function portalUnder(', '\n}\n', 'portalUnder') + '\n}\n', fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel'),
        lineOf('var _saveSoon = null;'), lineOf('function saveRemoteSoon()'), bw('bpos'), src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')), bw('pos'), bw('patch', 'netfog.js'), bw('fogmove', 'netfog.js'), ordersSrc,
        'return { snapshot: sanitizeAppState, seedSnap: fogSeedSnapshot, arm: fogArm, heldNote: mapHeldNote, heldOf: mapHeldOf, patchIn: applyClientItemFiltered };'].join('\n');
    const NAMES = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'peerProfileId', 'lim', 'pushChat', 'state', 'broadcast', '_lastSent', 'setTimeout', 'clearTimeout', 'save', 'toast', 'logEvent', 'renderRoster', 'dropWaitingFor', 'allow', 'render', 'broadcastRoster', 'checkRoomHandouts', 'applyPosToDom', 'bellOut', 'renderNotepad', 'fogNow', 'ensurePlayerToken', 'findLandingRoom', 'landingPoint'];
    const buildHost = new Function(...NAMES, modSrc);
    const buildFog = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { fogDropIds: fogDropIds, fogLitFor: fogLitFor, canSeePoint: canSeePoint, invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor, tokenSightCells: tokenSightCells, viewersFor: viewersFor, moveBlocked: moveBlocked, moveCells: moveCells, fogMarksFor: fogMarksFor, fogOffFor: fogOffFor };');
    const pageSrc = [ownKeySrc, broadcastSrc, lineOf('function escAttr(s) {'), fnSrc('function sanitizeRichText(', '\n}\n', 'sanitizeRichText') + '\n}\n', lineOf('function safeColor('), lineOf('function cleanHostWbItem(w) {'), lineOf('function cleanHostTokSenses(w) {'), lineOf('function cleanHostFxb(w) {'), lineOf('function cleanHostLight(w) {'),
        fnSrc('function ownCellKeysOf(', '\n}\n', 'ownCellKeysOf') + '\n}\n', fnSrc('function ownTokIdsOf(', '\n}\n', 'ownTokIdsOf') + '\n}\n', fnSrc('function cleanHostMap(', '\n}\n', 'cleanHostMap') + '\n}\n', bw('actlog', 'netfog.js'),
        fnSrc('function applyItem(msg) {', '\n}\n', 'applyItem', 'netfog.js') + '\n}\n', fnSrc('function applyItemDelta(msg) {', '\n}\n', 'applyItemDelta', 'netfog.js') + '\n}\n', bw('fogdiffapply', 'netfog.js'),
        lineOf('function fromHost('), fnSrc('function mapStub(map) {', '\n}\n', 'mapStub', 'netfog.js') + '\n}\n', fnSrc('function activeItemPatch() {', '\n}\n', 'activeItemPatch', 'netfog.js') + '\n}\n',
        'return { applyItem: applyItem, applyItemDelta: applyItemDelta, cleanMap: cleanHostMap, fogDiff: function(msg, conn) {', bw('fogdiff'), '} };'].join('\n');
    const buildPage = new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanWaitingItem', pageSrc);
    const mkPage = myId => {
        const asked = [], hostConn = { peer: 'h', open: true, send(m) { packCheck(m); asked.push(copyOf(m)); } };
        const netP = { role: 'client', active: true, foreign: true, syncedPeer: 'h', stream: false, applyingRemote: false, myId, conns: [hostConn], roster: {} };
        const camp = { id: 'k', activeItemId: 'mA', items: {} }, state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
        const P = buildPage(netP, state, { wpFogCore: FC, wpFog: { invalidateVision() {}, redraw() {} } }, () => camp, () => {}, () => {}, H.cleanWaitingItem);
        const feed = m => { m = copyOf(m); if (m.type === 'item') P.applyItem(m); else if (m.type === 'itemDelta') P.applyItemDelta(m); else if (m.type === 'fogDiff') P.fogDiff(m, { peer: 'h' }); };
        return { P, camp, asked, feed, map: id => camp.items[id] };
    };
    const T = (id, owner, charId, c, r, more) => Object.assign({ id, type: 'image', isChar: true, charName: id, x: c * 50, y: r * 50, w: 50, h: 50, rot: 0, front: 0 }, owner ? { ownerId: owner } : {}, charId ? { charId } : {}, more || {});
    const M = (id, wb, fogged) => ({ id, type: 'map', meta: { title: 'The ' + id, gridType: 'square', cellValue: 5, cellUnit: 'ft' }, rooms: [], links: [], cats: {}, fog: fogged ? { on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } } : { on: false }, whiteboard: wb });
    const sysS = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }] }, { F: Fx, gmView: true });
    const CRYPT = '/saves/images/k/crypt door.png';
    // mA: the map both players are on, no fog: a secret door with a look named for it (sdR), one drawn as a line and named Door (sdL), a see-through
    // barrier's (sdG), a door of the GM's that is no secret (gd), a drawing of Ana's (sA) and two long-named pieces, so that a change travels as a
    // delta. mF: a fogged dark 5 ft map: Ana's token at (2,2), a secret door the host's piece calls OPEN standing as a column between her and an orc
    // three cells off, and a bat 14 cells off (past her 12 cells of sight) whose token carries the three keys as stray values
    const mkB = () => {
        const ev = [], timers = [], feats = { fog: true, lighting: true, sheets: true, turning: true }, saidAll = [];
        const camp = { id: 'k', system: sysS, fog: { fields: { sight: 'f_sight', sightUnit: 'ft' }, defaults: { sight: 30 } }, turnRules: {},
            items: {
                mA: M('mA', [T('tA', 'u_a', 'c_a', 2, 2), T('tB', 'u_b', 'c_b', 2, 4), { id: 'pad1', type: 'rect', name: 'p'.repeat(240), x: 1, y: 1, w: 5, h: 5 }, { id: 'pad2', type: 'rect', name: 'q'.repeat(240), x: 2, y: 2, w: 5, h: 5 },
                    D('sdR', { x: 400, y: 200, name: 'SENTINEL_VAULT_DOOR', seenColor: '#2B2B33', seenTexture: 'stone' }),
                    Object.assign({ id: 'sdL' }, LINE, { x: 500, y: 200, blocksSight: true, sightType: 'door', color: '#7b5a3a', name: 'Door', secret: true, doorLock: true }),
                    Object.assign({ id: 'sdG' }, GATE, { x: 600, y: 200, sightType: 'door', color: 'transparent', secret: true, doorLock: true, name: 'SENTINEL_FORCE_GATE' }),
                    { id: 'gd', type: 'rect', x: 700, y: 200, w: 50, h: 50, blocksSight: true, sightType: 'door', color: '#224466', name: 'Gate' },
                    { id: 'sA', type: 'path', x: 10, y: 10, w: 20, h: 20, baseW: 20, baseH: 20, pts: [[0, 0], [10, 10]], color: '#e9e9f0', strokeWidth: 3, ownerId: 'u_a', byPlayer: true, z: 35 }], false),
                mF: M('mF', [T('tAf', 'u_a', 'c_a', 2, 2), T('orcF', '', 'c_n', 5, 2), T('batF', '', 'c_n', 2, 16, { secret: true, seenColor: '#123456', seenTexture: 'grass' }),
                    D('sdF', { x: 200, y: 0, w: 50, h: 250, color: '#5a3a1a', name: 'SENTINEL_CRYPT_DOOR', texSrc: CRYPT, texTile: 1 })], true) },
            chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sight: 60 } }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_sight: 60 } }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: { f_sight: 60 } } } };
        const W = { ev, camp, timers, now: 0, saves: 0, toasts: [] };
        const mkConn = (peer, page) => ({ peer, open: true, sent: [], page: page || null, send(m) { packCheck(m); this.sent.push(copyOf(m)); ev.push(peer + ':' + m.type + (m.itemId ? ':' + m.itemId : '')); if (this.page) this.page.feed(m); } });
        W.a1 = mkConn('pA1', mkPage('u_a')); W.b1 = mkConn('pB', mkPage('u_b')); W.w1 = mkConn('pW');   // pW: a peer still waiting for the GM's Allow
        W.net = { active: true, role: 'host', paused: false, applyingRemote: false, myId: 'u_gm', conns: [W.a1, W.b1, W.w1], roster: { pA1: { id: 'u_a', name: 'Ana', location: 'mA' }, pB: { id: 'u_b', name: 'Bo', location: 'mA' } }, combats: {}, targets: {}, travelLocked: false, tokenDropped: () => false };
        const state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
        const win = { wpFogCore: FC, wpSystemCore: Sx, wpFormula: Fx, wpDiceCore: null, wpVtt: { on: k => feats[k] !== false, campaignOn: k => feats[k] !== false, mode: () => 'host' }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDocRender: { cleanDoc: d => copyOf(d) } };
        W.fog = buildFog(win, { getElementById: () => null }, () => null, () => camp, state); win.wpFog = W.fog; W.win = win;   // W.win: the host's window, so that part (6f) can take the fog core off it
        const setT = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearT = id => { const t = timers[id - 1]; if (t) t.fn = null; };
        W.fire = ms => { const due = timers.filter(t => t.fn && t.ms === ms); due.forEach(t => { const f = t.fn; t.fn = null; f(); }); return due.length; };
        const bc = (m, ex) => { packCheck(m); W.net.conns.forEach(c => { if (c !== ex && c.open && ownK(W.net.roster, c.peer)) c.send(m); }); };
        W.api = buildHost(W.net, () => Sx, win, () => false, () => camp, e => { throw e; }, c => (W.net.roster[c.peer] ? W.net.roster[c.peer].id : null), { allow: () => true }, () => {}, state, bc, {}, setT, clearT,
            () => { W.saves++; }, t => W.toasts.push(t), () => {}, () => {}, () => {}, () => true, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => W.now, () => false, () => null, () => null);
        W.tok = (id, mapId) => camp.items[mapId || 'mA'].whiteboard.find(w => w.id === id);
        W.stream = () => W.api.snapshot(state.appState).campaigns.k.items;   // the stream window's copy: no recipient
        // the join as admitPlayer makes it: the map they land on held, the snapshot made with that record, every fogged map it carries whole seeded
        W.join = (c, landing) => { W.net.roster[c.peer].location = landing; W.api.heldNote(c, landing); const snap = { type: 'snapshot', appState: W.api.snapshot(state.appState, W.net.roster[c.peer].id, W.api.heldOf(c)), stage: { campId: 'k', itemId: landing } }; c.send(snap); W.api.seedSnap(c, snap);
            Object.keys(snap.appState.campaigns.k.items).forEach(id => { c.page.camp.items[id] = copyOf(snap.appState.campaigns.k.items[id]); if (c.page.camp.items[id].type === 'map') c.page.P.cleanMap(c.page.camp.items[id]); }); c.page.camp.activeItemId = landing; return snap; };
        W.gmSave = id => { W.fog.invalidateVision(); W.net.sendItem('k', id); };   // the GM's save of a map: the fog works its vision out again, the map goes to the table
        W.step = () => { const out = ev.slice(); saidAll.push(J(W.net.conns.map(c => c.sent))); ev.length = 0; W.net.conns.forEach(c => { c.sent.length = 0; }); return out; };   // what went out since the last step, by connection and kind; the text of it is kept
        W.steps = () => saidAll.length;
        W.text = from => saidAll.slice(from || 0).concat([J(W.net.conns.map(c => c.sent))]).join('\n');   // everything sent to anyone, from that step on, as text
        return W;
    };
    const on = (item, ids) => ids.map(id => flat(((item && item.whiteboard) || []).find(w => w && w.id === id)));
    const lastOf = (c, type, mapId) => c.sent.filter(m => m.type === type && m.itemId === mapId).pop();
    const LEAK = /"secret"|seenColor|seenTexture|doorOpen|doorLock|groupId|g_vault|g_crypt|texSrc|texTile|vault door|crypt door|other door|6b4a2a|7b5a3a|5a3a1a|5b3b1b|planks|cobbles|SENTINEL|"Door"/;

    // (6a) no fog: the join snapshot, a whole copy, a delta, the GM's own work on the door behind the wall, the look named for it, and the finding
    {
        const W = mkB(), hR = W.tok('sdR'), hL = W.tok('sdL'), hG = W.tok('sdG'), IDS = ['sdR', 'sdL', 'sdG'];
        const wallR = (x, look) => flat(wallOf('sdR', Object.assign({ x, y: 200 }, look)));   // the door has a name of its own; the copy has none, as no copy has
        const wallL = flat(Object.assign({ id: 'sdL' }, LINE, { x: 500, y: 200, blocksSight: true, sightType: 'wall', color: WALLC })), wallG = flat(Object.assign({ id: 'sdG' }, GATE, { x: 600, y: 200, sightType: 'wall', color: 'transparent' }));
        const want0 = J([wallR(400, { color: '#2b2b33', texture: 'stone' }), wallL, wallG]), hostWas = J(W.camp.items.mA);
        const snapA = W.join(W.a1, 'mA'), snapB = W.join(W.b1, 'mA'), evJoin = W.step();
        const joined = { ev: evJoin, wire: [snapA, snapB].map(s => J(on(s.appState.campaigns.k.items.mA, IDS)) === want0), page: [W.a1, W.b1].map(c => J(on(c.page.map('mA'), IDS)) === want0), gd: [W.a1, W.b1].map(c => c.page.map('mA').whiteboard.find(w => w.id === 'gd').sightType), host: J(W.camp.items.mA) === hostWas };
        W.net.sendItem('k', 'mA');   // the GM's first save: the snapshot set no shared baseline, so the map goes whole
        const wholeWire = [W.a1, W.b1].map(c => J(on((lastOf(c, 'item', 'mA') || {}).item, IDS)) === want0), wholeHost = J(W.camp.items.mA) === hostWas, evWhole = W.step();
        W.net.broadcastItemFiltered('k', 'mA');   // a one-off send of the whole map (a travel, a summon, a push)
        const pushWire = [W.a1, W.b1].map(c => J(on((lastOf(c, 'item', 'mA') || {}).item, IDS)) === want0), evPush = W.step();
        const streamItems = W.stream(), streamOk = J(on(streamItems.mA, IDS)) === want0 && on(streamItems.mF, ['sdF'])[0] === flat(wallOf('sdF', { x: 200, y: 0, w: 50, h: 250, color: WALLC, texture: 'bricks' })) && !LEAK.test(J(streamItems));   // the stream window's copy of both maps
        hR.x = 450; W.net.sendItem('k', 'mA');   // the GM moves the secret door: a delta
        const dMove = lastOf(W.a1, 'itemDelta', 'mA'), setMove = dMove && dMove.whiteboard ? dMove.whiteboard.set.map(flat) : null, evMove = W.step();
        const pageMove = [W.a1, W.b1].map(c => on(c.page.map('mA'), ['sdR'])[0] === wallR(450, { color: '#2b2b33', texture: 'stone' }));
        // the GM's own work on the door behind the wall: renamed, repainted, unlocked, shut, regrouped, another pattern and picture; and the others' locks
        hR.name = 'SENTINEL_RENAMED'; hR.color = '#5b3b1b'; delete hR.doorLock; delete hR.doorOpen; hR.groupId = 'g_crypt'; hR.texture = 'cobbles'; hR.texSrc = '/saves/images/k/other door.png'; hR.texTile = 4; delete hL.doorLock; hL.doorOpen = true; hG.name = 'SENTINEL_OTHER_GATE'; delete hG.doorLock;
        W.net.sendItem('k', 'mA'); const evOwn = W.step();
        delete hR.texture; delete hR.texSrc; delete hR.texTile; hR.name = 'Door'; W.net.sendItem('k', 'mA'); const evBare = W.step();   // the door's own pattern and picture taken off, and renamed: the wall is the same text, so nothing goes out
        hR.texture = 'cobbles'; hR.texSrc = '/saves/images/k/other door.png'; hR.texTile = 4; hR.name = 'SENTINEL_RENAMED'; W.net.sendItem('k', 'mA'); const evBack = W.step();
        hR.seenColor = '#334455'; hR.seenTexture = ''; W.net.sendItem('k', 'mA');   // the look named for it is the players' to see: it travels, as the wall's color
        const dLook = lastOf(W.a1, 'itemDelta', 'mA'), setLook = dLook && dLook.whiteboard ? dLook.whiteboard.set.map(flat) : null, evLook = W.step();
        const pageLook = [W.a1, W.b1].map(c => on(c.page.map('mA'), ['sdR'])[0] === wallR(450, { color: '#334455' }));
        const before = W.text(), mark = W.steps(), hostKeys = [hR.secret, hL.secret, hG.secret];
        check('map builder B5 in the one-module world (the real sanitizeAppState, sendItem, broadcastItemFiltered and itemDelta into real player pages; a map with no fog): each secret door reaches every player as a wall, in the join snapshot, on a whole copy, on a one-off send of the map and in the delta that follows the GM moving it, and stands as that wall on each player\'s page: the look named for it, the Wall material\'s color on the line named Door, which has no name there, as none of the three has, and nothing drawn for the see-through barrier\'s; the GM\'s own door beside them is a door; the stream window\'s copy holds the same walls, on the fogged map too; the host\'s own map is left as it was by every send, and a peer still waiting for the GM is sent nothing',
            J(joined) === J({ ev: ['pA1:snapshot', 'pB:snapshot'], wire: [true, true], page: [true, true], gd: ['door', 'door'], host: true }) && J(evWhole) === J(['pA1:item:mA', 'pB:item:mA']) && J(wholeWire) === J([true, true]) && wholeHost && J(evPush) === J(['pA1:item:mA', 'pB:item:mA']) && J(pushWire) === J([true, true]) && streamOk
            && J(evMove) === J(['pA1:itemDelta:mA', 'pB:itemDelta:mA']) && J(setMove) === J([wallR(450, { color: '#2b2b33', texture: 'stone' })]) && J(pageMove) === J([true, true]) && J(hostKeys) === J([true, true, true]) && W.w1.sent.length === 0,
            J([joined, evWhole, wholeWire, evPush, pushWire, streamOk, evMove, setMove, pageMove]));
        check('map builder B5 in the one-module world, on a map with no fog: while the door is secret, what the GM does to the door behind the wall goes to nobody: renamed, repainted in another color that is not see-through, unlocked, shut, regrouped and given another pattern and picture, and the other two unlocked, opened and renamed, the next save sends no message at all; the look the GM names for it does travel, as the wall\'s own color with no pattern, and each page follows; and in everything sent to anyone so far (two snapshots, the whole copies, the deltas) the text holds no tick, neither key of the look, no open or locked word, no group, no picture fill, and nothing of any secret door\'s own color, pattern, picture path or name',
            J(evOwn) === J([]) && J(evBare) === J([]) && J(evBack) === J([]) && J(evLook) === J(['pA1:itemDelta:mA', 'pB:itemDelta:mA']) && J(setLook) === J([wallR(450, { color: '#334455' })]) && J(pageLook) === J([true, true]) && !LEAK.test(before) && /sdR/.test(before) && /"sightType":"wall"/.test(before) && /2b2b33/.test(before),
            J([evOwn, evLook, setLook, pageLook, (before.match(LEAK) || [''])[0]]));
        // found: the row's way (the tick deleted), and by opening it
        const foundR = FC.secretReveal(hR); W.net.sendItem('k', 'mA');
        const dR = lastOf(W.a1, 'itemDelta', 'mA'), setR = dR && dR.whiteboard ? dR.whiteboard.set.map(flat) : null, evR = W.step(), doorR = flat(less(hR, ['seenColor', 'seenTexture']));
        const pageR = [W.a1, W.b1].map(c => on(c.page.map('mA'), ['sdR'])[0] === doorR);
        hL.doorOpen = true; const foundL = FC.secretReveal(hL); W.net.sendItem('k', 'mA'); const evL = W.step(), pL = W.b1.page.map('mA').whiteboard.find(w => w.id === 'sdL');
        const after = W.text(mark), stillG = [W.a1, W.b1].map(c => on(c.page.map('mA'), ['sdG'])[0] === wallG);
        check('map builder B5 in the one-module world: found. Once the GM reveals it (the tick deleted on the host, the map saved) the door reaches every player as the door it is, as a delta, and stands on each page with its own color, pattern, picture, name and group; one found by opening it stands there as an open door; the secret door nobody found is still a wall on every page; and what is sent after the finding still holds no tick and neither key of the look, which stay on the host\'s piece',
            foundR === true && J(evR) === J(['pA1:itemDelta:mA', 'pB:itemDelta:mA']) && J(setR) === J([doorR]) && J(pageR) === J([true, true]) && hR.seenColor === '#334455' && /"sightType","door"/.test(doorR) && /SENTINEL_RENAMED/.test(doorR) && /5b3b1b/.test(doorR) && /other door/.test(doorR) && /g_crypt/.test(doorR) && /cobbles/.test(doorR)
            && foundL === true && J(evL) === J(['pA1:itemDelta:mA', 'pB:itemDelta:mA']) && !!pL && pL.sightType === 'door' && pL.doorOpen === true && pL.color === '#7b5a3a' && pL.name === 'Door' && J(stillG) === J([true, true]) && !/"secret"|seenColor|seenTexture/.test(after) && W.w1.sent.length === 0,
            J([foundR, evR, setR, pageR, foundL, evL, pL, stillG]));
    }
    // (6b) under fog: the host reads an open secret door as shut, so the creature behind it is on no copy; a catch-up; the finding
    {
        const idsOf = it => ((it && it.whiteboard) || []).map(w => w.id);
        const F0 = mkB(); delete F0.tok('sdF', 'mF').secret; const openSeen = idsOf(F0.join(F0.a1, 'mF').appState.campaigns.k.items.mF);   // the same door, open and no secret: the orc behind it is seen
        const F = mkB(), hF = F.tok('sdF', 'mF'), hostWas = J(F.camp.items.mF), snapF = F.join(F.a1, 'mF'), itF = snapF.appState.campaigns.k.items.mF;
        const wallF = flat(wallOf('sdF', { x: 200, y: 0, w: 50, h: 250, color: WALLC, texture: 'bricks' }));
        const joinF = { ids: idsOf(itF), wire: on(itF, ['sdF'])[0] === wallF, page: on(F.a1.page.map('mF'), ['sdF'])[0] === wallF, stubA: itF && snapF.appState.campaigns.k.items.mA.stub === true, host: J(F.camp.items.mF) === hostWas, ev: F.step() };
        F.gmSave('mF'); const wholeTextF = J((lastOf(F.a1, 'item', 'mF') || {}).item), wholeF = { ids: idsOf((lastOf(F.a1, 'item', 'mF') || {}).item), wire: on((lastOf(F.a1, 'item', 'mF') || {}).item, ['sdF'])[0] === wallF, ev: F.step() };
        // the third review of fold B5 (wire V4): on a FOGGED map every save sends each player on it their copy whole, whatever changed. The GM renames,
        // repaints, unlocks and regroups the door behind the wall and saves: Ana is sent the map again, and it is the very same text as the copy before it
        hF.name = 'SENTINEL_RENAMED'; hF.color = '#5b3b1b'; delete hF.doorLock; hF.groupId = 'g_crypt'; F.gmSave('mF');
        const againF = { same: J((lastOf(F.a1, 'item', 'mF') || {}).item) === wholeTextF, ev: F.step() };
        F.tok('batF', 'mF').y = 250; F.api.arm('mF'); const fired = F.fire(150);   // the bat flies to three cells off her token: caught up in place
        const diff = lastOf(F.a1, 'fogDiff', 'mF'), added = diff && Array.isArray(diff.add) ? diff.add.map(a => [a.item.id, has3(a.item)]) : null, evDiff = F.step(), pageDiff = idsOf(F.a1.page.map('mF')).slice().sort();
        const before = F.text();
        check('map builder B5 in the one-module world, under fog (the real fog.js judging for each player): a secret door the host\'s piece calls open still stops sight, so the orc behind it is on no copy of Ana\'s, where the same door open and no secret lets her see it; her join snapshot and her whole copy hold the door as a wall in the Wall material\'s look; a bat that flies into her sight is caught up in place, the orc still left out, and the bat\'s token, which carried the three keys as stray values, arrives without them; nothing sent so far names the orc or holds the tick, a key of the look, or anything of the door\'s own; nothing goes to a player who is not on that map',
            J(openSeen) === J(['tAf', 'orcF', 'sdF']) && J(joinF) === J({ ids: ['tAf', 'sdF'], wire: true, page: true, stubA: true, host: true, ev: ['pA1:snapshot'] }) && J(wholeF) === J({ ids: ['tAf', 'sdF'], wire: true, ev: ['pA1:item:mF'] })
            && fired === 1 && J(evDiff) === J(['pA1:fogDiff:mF']) && J(added) === J([['batF', []]]) && J(pageDiff) === J(['batF', 'sdF', 'tAf']) && !LEAK.test(before) && !/orcF/.test(before) && /sdF/.test(before) && F.b1.sent.length === 0 && F.w1.sent.length === 0,
            J([openSeen, joinF, wholeF, fired, evDiff, added, pageDiff, (before.match(LEAK) || [''])[0]]));
        check('map builder B5 in the one-module world, under fog, a save after a change to the door behind the wall (the third review): a fogged map is sent whole to each player on it at every save, whatever changed. With the secret door renamed, repainted, unlocked and regrouped on the host and the map saved, Ana is sent one whole copy of the map and nobody else is sent anything. That copy is the very same text as the copy before it, so the send says nothing of the door: it holds the wall, and no name, color, lock or group of the door\'s',
            againF.same && J(againF.ev) === J(['pA1:item:mF']) && wholeTextF.length > 100 && /"sightType":"wall"/.test(wholeTextF) && /sdF/.test(wholeTextF) && !LEAK.test(wholeTextF) && hF.name === 'SENTINEL_RENAMED' && hF.color === '#5b3b1b' && hF.groupId === 'g_crypt' && !ownK(hF, 'doorLock'),
            J([againF, wholeTextF.slice(0, 400)]));
        const foundF = FC.secretReveal(hF); F.gmSave('mF');   // found: an open door now, and the orc behind it comes into sight
        const itAfter = (lastOf(F.a1, 'item', 'mF') || {}).item, evFound = F.step(), doorF = flat(copyOf(hF)), pgF = F.a1.page.map('mF');
        check('map builder B5 in the one-module world, under fog: found. With the tick deleted on the host and the map saved, Ana\'s copy holds the door as the open door it is, with its own color, pattern, picture and name, and the orc that stood behind the wall is on her copy and on her page',
            foundF === true && J(evFound) === J(['pA1:item:mF']) && J(idsOf(itAfter)) === J(['tAf', 'orcF', 'batF', 'sdF']) && on(itAfter, ['sdF'])[0] === doorF && on(pgF, ['sdF'])[0] === doorF && /"doorOpen",true/.test(doorF) && /"sightType","door"/.test(doorF) && /crypt door/.test(doorF) && idsOf(pgF).indexOf('orcF') >= 0,
            J([foundF, evFound, idsOf(itAfter), on(itAfter, ['sdF'])[0] === doorF]));
    }
    // (6c) a player's map copy: nothing a player sends sets, clears or reads any of it
    {
        const P = mkB(); P.join(P.a1, 'mA'); P.join(P.b1, 'mA'); P.step();
        const hR = P.tok('sdR'), hL = P.tok('sdL'), hG = P.tok('sdG'), hGd = P.tok('gd'), wasR = J(hR), wasL = J(hL), wasG = J(hG), wasGd = J(hGd), wasMap = J(P.camp.items.mA);
        const DOORISH = Object.assign({ secret: true, blocksSight: true, sightType: 'door' }, STRAY);
        // first a copy that changes nothing but those keys: on every piece of her page's copy, her own and the GM's alike
        const keysOnly = copyOf(P.a1.page.map('mA')); keysOnly.whiteboard.forEach(w => { Object.assign(w, DOORISH, { doorOpen: true }); });
        const changed0 = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: keysOnly }, P.net.roster.pA1, { conn: P.a1 }), same0 = J(P.camp.items.mA) === wasMap;
        const copy = copyOf(P.a1.page.map('mA')), cw = id => copy.whiteboard.find(w => w.id === id);
        Object.assign(cw('tA'), { x: 150 }, DOORISH);   // her own token, moved, with the three keys and a door's flags
        Object.assign(cw('sA'), { pts: [[0, 0], [9, 9]] }, DOORISH);   // her own drawing, redrawn, likewise
        copy.whiteboard.push(Object.assign({ id: 'sNew', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [10, 10]] }, DOORISH));   // a new drawing of hers
        Object.assign(cw('sdR'), { sightType: 'door', doorOpen: true, color: '#ff0000', name: 'Found it', seenColor: '#ff0000' });   // the GM's secret door sent back as an open door (her copy holds no tick to send)
        Object.assign(cw('sdL'), { secret: false, sightType: 'door' });
        copy.whiteboard = copy.whiteboard.filter(w => w.id !== 'sdG');   // ... and one left out
        Object.assign(cw('gd'), { secret: true, doorOpen: true }, STRAY);   // the GM's own door, ticked Secret by her
        const out = { conn: P.a1 }, changed = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copy }, P.net.roster.pA1, out);
        const tA = P.tok('tA'), sA = P.tok('sA'), sNew = P.tok('sNew');
        P.net.sendItem('k', 'mA'); const sentP = J(P.net.conns.map(c => c.sent)), bPage = P.b1.page.map('mA'), wallRb = on(bPage, ['sdR'])[0] === flat(wallOf('sdR', { x: 400, y: 200, color: '#2b2b33', texture: 'stone' }));
        check('map builder B5 in the one-module world, a player\'s map copy (the real patch gate): a copy that only puts the tick, both keys of the look, a door\'s flags and the open word on every piece of the map, her own and the GM\'s, changes nothing on the host at all, the map exactly as it was; a copy that puts them on her own token, on a drawing of her own and on a new drawing while it moves the token and redraws moves the token and takes the drawings, and none of those keys comes in with them; the GM\'s secret door sent back as an open door in another color, another sent back with a tick that is false, a third left out of the copy, and the GM\'s own door sent back ticked Secret and open, each leave the host\'s piece exactly as it was; what the host then sends to the table holds no tick and no key of the look, and the other player\'s page still holds a wall',
            changed0 === false && same0 && changed === true && tA.x === 150 && has3(tA).length === 0 && !ownK(tA, 'blocksSight') && !ownK(tA, 'sightType') && J(sA.pts) === J([[0, 0], [9, 9]]) && has3(sA).length === 0 && !ownK(sA, 'blocksSight') && !!sNew && sNew.byPlayer === true && has3(sNew).length === 0 && !ownK(sNew, 'blocksSight') && !ownK(sNew, 'sightType')
            && J(hR) === wasR && J(hL) === wasL && J(hG) === wasG && J(hGd) === wasGd && P.tok('sdG') === hG && !/"secret"|seenColor|seenTexture/.test(sentP) && /sNew/.test(sentP) && wallRb && bPage.whiteboard.find(w => w.id === 'gd').sightType === 'door' && !ownK(bPage.whiteboard.find(w => w.id === 'gd'), 'doorOpen'),
            J([changed0, same0, changed, tA, sA, sNew, J(hR) === wasR, J(hL) === wasL, J(hG) === wasG, J(hGd) === wasGd, wallRb]));
    }
    // (6d) a player's page and a hostile host: the three ways a piece arrives (a whole map, a delta, a catch-up), each through the real code
    {
        const pg = mkPage('u_a'), evil = (id, more) => Object.assign({ id }, BOX, { blocksSight: true, sightType: 'door', secret: true }, STRAY, more || {});
        pg.feed({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', meta: { title: 'A' }, rooms: [], links: [], cats: {}, fog: { on: true }, whiteboard: [T('tA', 'u_a', 'c_a', 2, 2), evil('e1')] } });
        const afterItem = pg.map('mA').whiteboard.map(w => [w.id, has3(w)]);
        pg.feed({ type: 'itemDelta', campId: 'k', itemId: 'mA', whiteboard: { set: [evil('e2'), evil('e1', { x: 5 })], del: [], order: ['tA', 'e1', 'e2'] } });
        pg.feed({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: [{ item: Object.assign(T('orc', '', '', 5, 5), { secret: true }, STRAY), after: 'tA' }] });
        const got = pg.map('mA').whiteboard.map(w => [w.id, has3(w), w.sightType || '', w.x]);
        check('map builder B5, a player\'s page and a hostile host (the real applyItem, applyItemDelta and fogDiff branch over the real cleanHostMap): a piece that arrives with the tick and the look\'s keys on a whole map, in a delta\'s set, or as a creature added by a catch-up is kept without them each time, a door still the door the host called it; the page asks the host for nothing',
            J(afterItem) === J([['tA', []], ['e1', []]]) && J(got) === J([['tA', [], '', 100], ['orc', [], '', 250], ['e1', [], 'door', 5], ['e2', [], 'door', 100]]) && pg.asked.length === 0 && !/"secret"|seenColor|seenTexture/.test(J(pg.map('mA'))),
            J([afterItem, got, pg.asked]));
    }
    // (6e) Match a wall in the one-module world, on a map with no fog: a secret door drawn as a line, matched to the wall line it meets. The wall is
    // a stroke of the pen at 5 px, opacity 0.55, round nib, made a wall, its color in upper case as a file may write one. The door begins where
    // the wall ends: 9 px, opacity 0.8, square nib, in a color and under a name of its own, locked, ticked Secret, and Match pressed (matchAs)
    {
        const WALLM = () => ({ id: 'wlM', type: 'path', x: 900, y: 200, w: 10, h: 50, baseW: 10, baseH: 50, z: 10, pts: [[0, 0], [0, 50]], color: '#3A4A5A', strokeWidth: 5, tip: 'round', opacity: 0.55, blocksSight: true, sightType: 'wall' });
        const DOORM = () => ({ id: 'sdM', type: 'path', x: 900, y: 250, w: 10, h: 40, baseW: 10, baseH: 40, z: 10, pts: [[0, 0], [0, 40]], color: '#8a5a2b', strokeWidth: 9, tip: 'square', opacity: 0.8, name: 'SENTINEL_MATCHED_DOOR', blocksSight: true, sightType: 'door', doorLock: true, secret: true });
        const mkM = () => { const W = mkB(), wb = W.camp.items.mA.whiteboard; wb.push(WALLM(), DOORM()); W.hit = matchAs(W.tok('sdM'), wb); return W; };
        const twinOn = list => { const a = (list || []).find(w => w && w.id === 'wlM'), b = (list || []).find(w => w && w.id === 'sdM'); return !!a && !!b && noGeo(a) === noGeo(b) && a.y !== b.y; };   // the wall and the door's copy: the same text but for id and geometry
        const pageTwin = W => [W.a1, W.b1].map(c => twinOn((c.page.map('mA') || {}).whiteboard));
        const lookOn = c => { const d = ((c.page.map('mA') || {}).whiteboard || []).find(w => w.id === 'sdM') || {}; return [d.sightType, d.color, d.strokeWidth, ownK(d, 'opacity') ? d.opacity : 'solid', d.tip]; };   // the door's copy as a player's page holds it
        const setIds = c => { const d = lastOf(c, 'itemDelta', 'mA'); return d && d.whiteboard ? d.whiteboard.set.map(w => w.id) : null; };   // which pieces the last delta carried
        const MLEAK = /seenWidth|seenOpacity|seenTip|SENTINEL_MATCHED|8a5a2b|102030/, DELTA = ['pA1:itemDelta:mA', 'pB:itemDelta:mA'], saveM = W => { W.net.sendItem('k', 'mA'); };
        await breathe();
        const W = mkM(), hW = W.tok('wlM'), hD = W.tok('sdM'), hostWas = J(W.camp.items.mA);
        const snapA = W.join(W.a1, 'mA'), snapB = W.join(W.b1, 'mA'), evJoin = W.step();
        const joined = { hit: W.hit, keys: [hD.seenColor, hD.seenWidth, hD.seenOpacity, hD.seenTip], own: [hD.color, hD.strokeWidth, hD.opacity, hD.tip], snap: [snapA, snapB].map(s => twinOn(s.appState.campaigns.k.items.mA.whiteboard)), page: pageTwin(W), look: lookOn(W.a1), host: J(W.camp.items.mA) === hostWas, ev: evJoin };
        saveM(W); const wholeIt = (lastOf(W.a1, 'item', 'mA') || {}).item, whole = { twin: twinOn(wholeIt && wholeIt.whiteboard), page: pageTwin(W), ev: W.step() };   // the GM's first save: the map goes whole
        W.net.broadcastItemFiltered('k', 'mA'); const pushIt = (lastOf(W.b1, 'item', 'mA') || {}).item, pushed = { twin: twinOn(pushIt && pushIt.whiteboard), ev: W.step() };   // a one-off send of the whole map
        const streamTwin = twinOn((W.stream().mA || {}).whiteboard);   // the stream window's copy
        check('Match a wall in the one-module world (the real sanitizeAppState, sendItem and broadcastItemFiltered into real player pages; a map with no fog): a secret door drawn as a line 9 px wide at opacity 0.8 with the square nib, matched to the wall line it meets, 5 px at opacity 0.55 with the round nib and its color in upper case. The press names the wall\'s color in lower case, its width, its opacity and its nib on the door and leaves the door\'s own as drawn. The wall and the door reach each player as the same text but for id and geometry: in the join snapshot, on each player\'s page, on the whole copy of the GM\'s first save, on a one-off send of the map and in the stream window\'s copy. On a page the door is a wall in the wall line\'s color, 5 px wide, at opacity 0.55, with the round nib. The host\'s own map is left as it was, and a peer still waiting for the GM is sent nothing',
            J(joined) === J({ hit: { color: '#3a4a5a', width: 5, opacity: 0.55, tip: 'round' }, keys: ['#3a4a5a', 5, 0.55, 'round'], own: ['#8a5a2b', 9, 0.8, 'square'], snap: [true, true], page: [true, true], look: ['wall', '#3a4a5a', 5, 0.55, 'round'], host: true, ev: ['pA1:snapshot', 'pB:snapshot'] })
            && J(whole) === J({ twin: true, page: [true, true], ev: ['pA1:item:mA', 'pB:item:mA'] }) && J(pushed) === J({ twin: true, ev: ['pA1:item:mA', 'pB:item:mA'] }) && streamTwin && W.w1.sent.length === 0,
            J([joined, whole, pushed, streamTwin]));
        // the GM's own work on the door behind the wall, while all three are matched: its own width, its own opacity, its own nib, then all of them, its color and its lock
        const quiet = [];
        hD.strokeWidth = 14; saveM(W); quiet.push(W.step());
        hD.opacity = 0.3; saveM(W); quiet.push(W.step());
        delete hD.opacity; saveM(W); quiet.push(W.step());
        hD.tip = 'flat'; saveM(W); quiet.push(W.step());
        hD.strokeWidth = '2'; hD.opacity = 1; hD.tip = 'round'; hD.color = '#102030'; delete hD.doorLock; saveM(W); quiet.push(W.step());
        const stillTwin = pageTwin(W), ownNow = [hD.color, hD.strokeWidth, hD.opacity, hD.tip];
        // the wall itself is redrawn: wider, solid, with the flat nib, in another color. The wall travels. The door's copy, still in the look it was matched to, does not
        hW.strokeWidth = 7; delete hW.opacity; hW.tip = 'flat'; hW.color = '#556677'; saveM(W);
        const wallSet = setIds(W.a1), evWall = W.step(), apart = pageTwin(W), lookOld = lookOn(W.a1);
        // Match pressed again: the seen keys change, so the door's copy travels, and it is the wall's twin again
        const hit2 = matchAs(hD, W.camp.items.mA.whiteboard); saveM(W);
        const doorSet = setIds(W.a1), evMatch = W.step(), again = pageTwin(W), lookNew = lookOn(W.b1);
        // one of the three taken off: the copy keeps the door's OWN for it, so from then on the door's own travels. Its opacity here
        delete hD.seenOpacity; saveM(W); const evOff = W.step();   // the door's own opacity is 1 by now, solid as the wall: the copy is the same text still
        hD.opacity = 0.6; saveM(W); const ownSet = setIds(W.a1), evOwn = W.step(), lookOwn = lookOn(W.a1);
        // Back to the Wall look (inspector.js setItemSeen 'reset'): the five keys of the look off. A wall in the Wall material's color at the door's OWN width, opacity and nib, as drawn
        ['seenColor', 'seenTexture', 'seenWidth', 'seenOpacity', 'seenTip'].forEach(k => { delete hD[k]; }); saveM(W);
        const resetSet = setIds(W.a1), evReset = W.step(), lookReset = lookOn(W.a1), saidM = W.text();
        check('Match a wall in the one-module world, what a change behind the wall sends (the real sendItem and itemDelta; a map with no fog). While the width, the opacity and the nib are all three matched, what the GM does to the door\'s OWN look goes to nobody: made 14 px wide, faded to opacity 0.3, made solid again, given the flat nib, then given a width that is a text, an opacity of 1, the round nib and another color, and unlocked. Each of the five saves sends no message at all, and each page still holds the door as the wall line\'s twin. When the wall line itself is redrawn, 7 px wide, solid, with the flat nib and in another color, the wall alone travels, and the door\'s copy stays in the look it was matched to, so the two are apart until the next press. Match pressed again changes the seen keys: the door\'s copy alone travels, and on each page it is the wall\'s twin again, 7 px, solid, flat nib, in the wall\'s new color. With the seen opacity taken off while the door\'s own is solid, nothing is sent; then the door\'s own opacity set to 0.6 does travel, since the copy keeps the door\'s own for whatever is not matched. Back to the Wall look takes the five keys of the look off: the copy travels as a wall in the Wall material\'s color at the door\'s own width as drawn, 2 px, its own opacity and its own nib. In everything sent to anyone the text holds none of the six keys, no name, color or lock of the door\'s, and a peer still waiting for the GM is sent nothing',
            J(quiet) === J([[], [], [], [], []]) && J(stillTwin) === J([true, true]) && J(ownNow) === J(['#102030', '2', 1, 'round'])
            && J(evWall) === J(DELTA) && J(wallSet) === J(['wlM']) && J(apart) === J([false, false]) && J(lookOld) === J(['wall', '#3a4a5a', 5, 0.55, 'round'])
            && !!hit2 && J(evMatch) === J(DELTA) && J(doorSet) === J(['sdM']) && J(again) === J([true, true]) && J(lookNew) === J(['wall', '#556677', 7, 'solid', 'flat'])
            && J(evOff) === '[]' && J(evOwn) === J(DELTA) && J(ownSet) === J(['sdM']) && J(lookOwn) === J(['wall', '#556677', 7, 0.6, 'flat'])
            && J(evReset) === J(DELTA) && J(resetSet) === J(['sdM']) && J(lookReset) === J(['wall', WALLC, 2, 0.6, 'round'])
            && !LEAK.test(saidM) && !MLEAK.test(saidM) && /wlM/.test(saidM) && /sdM/.test(saidM) && W.w1.sent.length === 0,
            J([quiet, stillTwin, ownNow, [evWall, wallSet, apart, lookOld], [!!hit2, evMatch, doorSet, again, lookNew], [evOff, evOwn, ownSet, lookOwn], [evReset, resetSet, lookReset], (saidM.match(LEAK) || saidM.match(MLEAK) || [''])[0]]));
        // a player's map copy: nothing a player sends sets any of the three
        await breathe();
        const P = mkM(); P.join(P.a1, 'mA'); P.join(P.b1, 'mA'); P.step();
        const pD = P.tok('sdM'), pW = P.tok('wlM'), pL = P.tok('sdL'), wasD = J(pD), wasW = J(pW), wasL = J(pL), wasMapM = J(P.camp.items.mA), SEENK = { seenWidth: 44.5, seenOpacity: 0.125, seenTip: 'flat' }, hasW = o => (o && typeof o === 'object' ? KEYSW.filter(k => ownK(o, k)) : ['no piece']);
        const keysOnlyM = copyOf(P.a1.page.map('mA')); keysOnlyM.whiteboard.forEach(w => { Object.assign(w, SEENK); });   // first a copy that changes nothing but those keys, on every piece of her page's copy
        const changedK = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: keysOnlyM }, P.net.roster.pA1, { conn: P.a1 }), sameK = J(P.camp.items.mA) === wasMapM;
        const copyM = copyOf(P.a1.page.map('mA')), cwM = id => copyM.whiteboard.find(w => w.id === id);
        Object.assign(cwM('tA'), { x: 150 }, SEENK);   // her own token, moved, with the three keys
        Object.assign(cwM('sA'), { pts: [[0, 0], [9, 9]] }, SEENK);   // her own drawing, redrawn, likewise
        copyM.whiteboard.push(Object.assign({ id: 'sNewM', type: 'path', ownerId: 'u_a', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [10, 10]] }, SEENK));   // a new drawing of hers
        Object.assign(cwM('sdM'), SEENK, { strokeWidth: 44.5, opacity: 0.125, tip: 'flat' });   // the GM's matched door, a wall on her page, sent back redrawn and with the three keys
        Object.assign(cwM('wlM'), SEENK); Object.assign(cwM('sdL'), SEENK);   // the wall it meets, and the GM's other secret door drawn as a line
        const changedM = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copyM }, P.net.roster.pA1, { conn: P.a1 });
        const tAM = P.tok('tA'), sAM = P.tok('sA'), sNewM = P.tok('sNewM');
        P.net.sendItem('k', 'mA'); const sentM = J(P.net.conns.map(c => c.sent)), bTwinM = twinOn((P.b1.page.map('mA') || {}).whiteboard);
        check('Match a wall in the one-module world, a player\'s map copy (the real patch gate): a copy that only puts a seen width, a seen opacity and a seen nib on every piece of the map, her own and the GM\'s, changes nothing on the host at all, the map exactly as it was. A copy that puts them on her own token, on a drawing of her own and on a new drawing, while it moves the token and redraws, moves the token and takes the drawings, and none of the three comes in with them. The GM\'s matched door, sent back redrawn at another width, opacity and nib with the three keys, the wall line it meets and the GM\'s other secret door drawn as a line, each sent back with the three keys, leave the host\'s pieces exactly as they were: the door keeps the look it was matched to and its own as drawn. What the host then sends to the table holds none of the six keys and no value she named, and the other player\'s page still holds the door as the wall line\'s twin',
            changedK === false && sameK && changedM === true && tAM.x === 150 && hasW(tAM).length === 0 && J(sAM.pts) === J([[0, 0], [9, 9]]) && hasW(sAM).length === 0 && !!sNewM && sNewM.byPlayer === true && hasW(sNewM).length === 0
            && J(pD) === wasD && J(pW) === wasW && J(pL) === wasL && P.tok('sdM') === pD && pD.seenWidth === 5 && pD.seenOpacity === 0.55 && pD.seenTip === 'round' && pD.strokeWidth === 9 && pD.opacity === 0.8 && pD.tip === 'square'
            && !SIXWORDS.test(sentM) && !/44\.5|0\.125/.test(sentM) && /sNewM/.test(sentM) && bTwinM,
            J([changedK, sameK, changedM, tAM, sAM, sNewM, J(pD) === wasD, J(pW) === wasW, J(pL) === wasL, bTwinM]));
        // a player's page and a hostile host: the three ways a piece arrives, each with the three keys on it
        const pgM = mkPage('u_a'), evilM = (id, more) => Object.assign({ id }, LINE, { blocksSight: true, sightType: 'door', secret: true, seenColor: '#112233', seenWidth: 5, seenOpacity: 0.5, seenTip: 'flat' }, more || {});
        pgM.feed({ type: 'item', campId: 'k', itemId: 'mA', item: { id: 'mA', type: 'map', meta: { title: 'A' }, rooms: [], links: [], cats: {}, fog: { on: true }, whiteboard: [T('tA', 'u_a', 'c_a', 2, 2), evilM('e1')] } });
        const afterItemM = pgM.map('mA').whiteboard.map(w => [w.id, has6(w)]);
        pgM.feed({ type: 'itemDelta', campId: 'k', itemId: 'mA', whiteboard: { set: [evilM('e2'), evilM('e1', { x: 5 })], del: [], order: ['tA', 'e1', 'e2'] } });
        pgM.feed({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: [{ item: Object.assign(T('orc', '', '', 5, 5), { seenWidth: 5, seenOpacity: 0.5, seenTip: 'flat' }), after: 'tA' }] });
        const gotM = pgM.map('mA').whiteboard.map(w => [w.id, has6(w), w.sightType || '', w.x, w.strokeWidth === undefined ? 'none' : w.strokeWidth, w.tip || '']);
        check('Match a wall, a player\'s page and a hostile host (the real applyItem, applyItemDelta and fogDiff branch over the real cleanHostMap): a piece that arrives with a seen width, a seen opacity and a seen nib on a whole map, in a delta\'s set, or as a creature added by a catch-up is kept without them each time, beside the tick and the color named, a door drawn as a line still the door the host called it at its own width and nib; the page asks the host for nothing',
            J(afterItemM) === J([['tA', []], ['e1', []]]) && J(gotM) === J([['tA', [], '', 100, 'none', ''], ['orc', [], '', 250, 'none', ''], ['e1', [], 'door', 5, 6, 'square'], ['e2', [], 'door', 200, 6, 'square']]) && pgM.asked.length === 0 && !SIXWORDS.test(J(pgM.map('mA'))),
            J([afterItemM, gotM, pgM.asked]));
    }
    // (6f) Match a wall, round two, in the one-module world, on a map with no fog: the GM's Lock in place. A wall line locked in place with the
    // secret door that meets it, matched and not locked; the pair the other way round; a box that is a wall, locked; and what keeps its lock: a
    // door that is no secret, a wall that leads to another map, an NPC's token and a floor piece. And four drawings of Ana's: one the GM locked,
    // one the GM made a wall, one made a wall and locked, and one made a see-through barrier and locked
    {
        await breathe();
        const PENL = (id, x, y, len, more) => Object.assign({ id, type: 'path', x, y, w: 10, h: len, baseW: 10, baseH: len, z: 10, pts: [[0, 0], [0, len]] }, more);
        const WLOOK = { color: '#3A4A5A', strokeWidth: 5, tip: 'round', opacity: 0.55, blocksSight: true, sightType: 'wall' }, DLOOK = { color: '#8a5a2b', strokeWidth: 9, tip: 'square', opacity: 0.8, blocksSight: true, sightType: 'door', secret: true };
        const INK = (id, x, more) => Object.assign({ id, type: 'path', x, y: 400, w: 20, h: 20, baseW: 20, baseH: 20, pts: [[0, 0], [10, 10]], color: '#e9e9f0', strokeWidth: 3, ownerId: 'u_a', byPlayer: true, z: 35 }, more);   // a drawing of Ana's
        const mkL = () => { const W = mkB(), wb = W.camp.items.mA.whiteboard;
            wb.push(PENL('wlK', 900, 200, 50, Object.assign({ locked: true }, WLOOK)), PENL('sdK', 900, 250, 40, Object.assign({ name: 'SENTINEL_K' }, DLOOK)),
                PENL('wlU', 1000, 200, 50, Object.assign({}, WLOOK)), PENL('sdU', 1000, 250, 40, Object.assign({ name: 'SENTINEL_U', locked: true }, DLOOK)),
                { id: 'bxK', type: 'rect', x: 1100, y: 200, w: 50, h: 50, color: '#445566', blocksSight: true, sightType: 'wall', locked: true },
                { id: 'gdK', type: 'rect', x: 1200, y: 200, w: 50, h: 50, color: '#224466', blocksSight: true, sightType: 'door', locked: true },
                { id: 'ptK', type: 'rect', x: 1300, y: 200, w: 50, h: 50, color: '#445566', blocksSight: true, sightType: 'wall', targetMapId: 'mF', locked: true },
                T('tokK', '', 'c_n', 28, 4, { locked: true }), { id: 'flK', type: 'rect', x: 1500, y: 200, w: 50, h: 50, color: '#5a5663', layer: 'back', locked: true },
                INK('sK1', 100, { locked: true }), INK('sK2', 200, { blocksSight: true, sightType: 'wall' }), INK('sK3', 300, { blocksSight: true, sightType: 'wall', locked: true }), INK('sK4', 400, { barrier: true, locked: true }));
            W.hits = [matchAs(W.tok('sdK'), wb), matchAs(W.tok('sdU'), wb)]; return W; };
        const KEEPL = ['gdK', 'ptK', 'tokK', 'flK', 'sK1'], GOESL = ['wlK', 'sdK', 'wlU', 'sdU', 'bxK', 'sK2', 'sK3', 'sK4'], HOSTL = ['wlK', 'sdU', 'bxK', 'gdK', 'ptK', 'tokK', 'flK', 'sK1', 'sK3', 'sK4'];
        const byIdL = (list, id) => (list || []).find(w => w && w.id === id), lockedIn = list => (list || []).filter(w => w && ownK(w, 'locked')).map(w => w.id + ':' + w.locked);
        // the two pairs as a copy holds them: each wall and its door the same text but for id and geometry, and the locked wall the very text the wall that is not locked is
        const pairsOn = list => { const a = byIdL(list, 'wlK'), b = byIdL(list, 'sdK'), c = byIdL(list, 'wlU'), d = byIdL(list, 'sdU'); return !!a && !!b && !!c && !!d && noGeo(a) === noGeo(b) && noGeo(c) === noGeo(d) && noGeo(a) === noGeo(c) && a.y !== b.y && a.x !== c.x && b.sightType === 'wall' && d.sightType === 'wall' && b.strokeWidth === 5 && d.opacity === 0.55; };
        const seenOn = list => J([lockedIn(list), pairsOn(list), GOESL.filter(id => !byIdL(list, id) || ownK(byIdL(list, id), 'locked'))]), WANTL = J([KEEPL.map(id => id + ':true'), true, []]);
        const W = mkL(), hostWas = J(W.camp.items.mA), hostLocks = lockedIn(W.camp.items.mA.whiteboard);
        const snapA = W.join(W.a1, 'mA'), snapB = W.join(W.b1, 'mA'), evJoin = W.step();
        const joined = { hits: W.hits.map(h => !!h && h.width === 5), snap: [snapA, snapB].map(s => seenOn(s.appState.campaigns.k.items.mA.whiteboard) === WANTL), page: [W.a1, W.b1].map(c => seenOn(c.page.map('mA').whiteboard) === WANTL), ev: evJoin };
        W.net.sendItem('k', 'mA'); const whole = { wire: [W.a1, W.b1].map(c => seenOn(((lastOf(c, 'item', 'mA') || {}).item || {}).whiteboard) === WANTL), ev: W.step() };   // the GM's first save: the map goes whole
        W.net.broadcastItemFiltered('k', 'mA'); const pushed = { wire: [W.a1, W.b1].map(c => seenOn(((lastOf(c, 'item', 'mA') || {}).item || {}).whiteboard) === WANTL), ev: W.step() };   // a one-off send of the whole map
        const streamL = seenOn((W.stream().mA || {}).whiteboard) === WANTL, hostSame = J(W.camp.items.mA) === hostWas;
        // The GM moves the locks about behind the walls: the wall that was locked is unlocked and the other locked, the secret door that was
        // locked is unlocked and the other locked, the box wall's lock is taken off. What leaves of a wall is the same text, so nothing goes out
        delete W.tok('wlK').locked; W.tok('wlU').locked = true; W.tok('sdK').locked = true; delete W.tok('sdU').locked; W.tok('bxK').locked = false; W.net.sendItem('k', 'mA');
        const evQuiet = W.step(), stillOn = [W.a1, W.b1].map(c => seenOn(c.page.map('mA').whiteboard) === WANTL);
        // ... while the lock of a door that is no secret is the players' to see: unlocked, the door travels, alone
        delete W.tok('gdK').locked; W.net.sendItem('k', 'mA');
        const dGd = lastOf(W.a1, 'itemDelta', 'mA'), gdSet = dGd && dGd.whiteboard ? dGd.whiteboard.set.map(w => [w.id, ownK(w, 'locked'), w.sightType]) : null, evGd = W.step(), saidL = W.text();
        // With no fog core on the host's window (the map with fog taken out of the campaign first, since the fog cannot judge without its core): the
        // join snapshot and the stream window's copy hold the same, the matched doors in the look Match set
        let snapN = null, streamN = null, errN = ''; const N = mkL(); delete N.camp.items.mF; N.win.wpFogCore = undefined;
        try { snapN = N.join(N.a1, 'mA'); streamN = N.stream(); } catch (e) { errN = String(e && e.message); }
        const boxOf = s => { const r = s ? byIdL(s.appState.campaigns.k.items.mA.whiteboard, 'sdR') || {} : {}; return [r.sightType, r.color, ownK(r, 'texture') ? r.texture : 'no pattern']; };   // the secret door that is a box, with a look named for it: only the core reads that look, so its copy says whether a core was at hand
        const noCoreL = { err: errN, snap: !!snapN && seenOn(snapN.appState.campaigns.k.items.mA.whiteboard) === WANTL, stream: !!streamN && seenOn((streamN.mA || {}).whiteboard) === WANTL, same: !!snapN && J(byIdL(snapN.appState.campaigns.k.items.mA.whiteboard, 'sdK')) === J(byIdL(snapA.appState.campaigns.k.items.mA.whiteboard, 'sdK')),
            box: [boxOf(snapA), boxOf(snapN)], fogMap: !!snapN && ownK(snapN.appState.campaigns.k.items, 'mF') };
        check('Match a wall, round two, in the one-module world, the GM\'s Lock in place (the real sanitizeAppState, sendItem, broadcastItemFiltered and itemDelta into real player pages; a map with no fog). A wall line locked in place beside the secret door that meets it, matched and not locked, and the pair the other way round: in the join snapshot, on each player\'s page, on the whole copy of the GM\'s first save, on a one-off send of the map and in the stream window\'s copy, each wall and its door are the same text but for id and geometry, the locked wall is the very text the wall that is not locked is, and none of the four, nor a box wall locked in place, nor a drawing of a player\'s that the GM made a wall or a see-through barrier and locked, says locked. A door that is no secret, a wall that leads to another map, an NPC\'s token, a floor piece and a player\'s drawing the GM locked each still say so. The host\'s own map keeps all ten locks, and no send changes it. When the GM then moves the locks about behind the walls, unlocking the one wall and locking the other, likewise the two secret doors, and taking the box wall\'s lock off, the save sends no message at all; when the GM unlocks the door that is no secret, that door alone travels, without its lock. With no fog core on the host\'s window the join snapshot and the stream window\'s copy hold the very same, the matched door the same text as with the core, while the secret door that is a box stands there in the Wall material\'s color with no pattern, where the core sends it in the look named for it: so no core was at hand. Nothing sent names a secret door or holds its own color, and a peer still waiting for the GM is sent nothing',
            J(joined) === J({ hits: [true, true], snap: [true, true], page: [true, true], ev: ['pA1:snapshot', 'pB:snapshot'] }) && J(whole) === J({ wire: [true, true], ev: ['pA1:item:mA', 'pB:item:mA'] }) && J(pushed) === J({ wire: [true, true], ev: ['pA1:item:mA', 'pB:item:mA'] }) && streamL && hostSame
            && J(hostLocks) === J(HOSTL.map(id => id + ':true')) && J(evQuiet) === '[]' && J(stillOn) === J([true, true]) && J(evGd) === J(['pA1:itemDelta:mA', 'pB:itemDelta:mA']) && J(gdSet) === J([['gdK', false, 'door']])
            && J(noCoreL) === J({ err: '', snap: true, stream: true, same: true, box: [['wall', '#2b2b33', 'stone'], ['wall', WALLC, 'no pattern']], fogMap: false }) && !/SENTINEL|8a5a2b|seenWidth|seenColor|"secret"/.test(saidL) && /wlK/.test(saidL) && /sdU/.test(saidL) && W.w1.sent.length === 0,
            J([joined, whole, pushed, streamL, hostSame, hostLocks, evQuiet, stillOn, evGd, gdSet, noCoreL, snapA ? seenOn(snapA.appState.campaigns.k.items.mA.whiteboard) : 'no snapshot']));
        // A player's map copy. Her copy of a wall no longer says locked, and the host still judges by its own map: a copy that moves, redraws or
        // leaves out a drawing of her own that the GM locked, made a wall, or both, changes nothing there
        await breathe();
        const P = mkL(); P.join(P.a1, 'mA'); P.join(P.b1, 'mA'); P.step();
        const INKS = ['sK1', 'sK2', 'sK3', 'sK4'], mineL = id => byIdL(P.a1.page.map('mA').whiteboard, id) || {}, onHerPage = INKS.map(id => [id, ownK(mineL(id), 'locked') ? mineL(id).locked : 'no lock said', mineL(id).blocksSight === true, mineL(id).barrier === true, mineL(id).ownerId]);
        const ACTS = [['move', w => { w.x += 7; w.y += 3; }], ['redraw', w => { w.pts = [[0, 0], [9, 4], [3, 9]]; }], ['erase', null]], tries = [];
        INKS.forEach(id => ACTS.forEach(act => { const copy = copyOf(P.a1.page.map('mA')), was = J(P.camp.items.mA), host = P.tok(id), out = { conn: P.a1 };
            if (act[1]) act[1](copy.whiteboard.find(w => w.id === id)); else copy.whiteboard = copy.whiteboard.filter(w => w.id !== id);
            const changed = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copy }, P.net.roster.pA1, out);
            tries.push([id, act[0], changed, J(P.camp.items.mA) === was, P.tok(id) === host, out.whole === true]); }));
        // round three: a copy of her page as it stands, the four named as she holds them (three of them with no lock said), asks for nothing
        const asItIs = { conn: P.a1 }, asItIsWas = J(P.camp.items.mA), asItIsChanged = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copyOf(P.a1.page.map('mA')) }, P.net.roster.pA1, asItIs), asItIsGot = [asItIsChanged, J(P.camp.items.mA) === asItIsWas, asItIs.whole === true];
        // the gate is live: the same redraw of a drawing of hers that the GM neither locked nor made a wall is taken
        const ctlCopy = copyOf(P.a1.page.map('mA')); ctlCopy.whiteboard.find(w => w.id === 'sA').pts = [[0, 0], [9, 4], [3, 9]];
        const ctlChanged = P.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: ctlCopy }, P.net.roster.pA1, { conn: P.a1 }), ctlPts = J(P.tok('sA').pts);
        P.net.sendItem('k', 'mA'); const bPageL = P.b1.page.map('mA').whiteboard, bHolds = INKS.map(id => { const w = byIdL(bPageL, id) || {}; return [id, w.x, J(w.pts), ownK(w, 'locked')]; });
        check('Match a wall, round two, in the one-module world, a player\'s map copy and a drawing of her own that the GM locked or made a wall (the real patch gate over the real join snapshot). On Ana\'s page her drawing that the GM locked still says locked, while the one the GM made a wall, the one made a wall and locked and the one made a see-through barrier and locked say nothing of a lock: each is a wall or a barrier there, as a plain wall is sent. The host judges by its own map, which keeps the locks. A copy of hers that moves one of the four, one that redraws it and one that leaves it out, twelve copies in all, each change nothing on the host at all: the map is exactly as it was and the very piece still stands. Round three: each copy that moves, redraws or leaves out a drawing the GM made a wall or a see-through barrier is answered with the map whole, locked or not, since her copy of it says no lock and nothing else would put her screen right; for the drawing that is locked and no wall, whose lock her page shows, nothing is sent back, as before; and a copy of her page as it stands changes nothing and asks for nothing. The same redraw of a drawing of hers that the GM neither locked nor made a wall is taken, so the gate is live. And what the host then sends leaves each of the four on the other player\'s page where it stood, as it was drawn',
            J(onHerPage) === J([['sK1', true, false, false, 'u_a'], ['sK2', 'no lock said', true, false, 'u_a'], ['sK3', 'no lock said', true, false, 'u_a'], ['sK4', 'no lock said', false, true, 'u_a']])
            && tries.length === 12 && tries.every(t => t[2] === false && t[3] === true && t[4] === true) && tries.every(t => t[5] === (t[0] !== 'sK1')) && tries.filter(t => t[5]).length === 9 && J(asItIsGot) === J([false, true, false]) && J([P.tok('sK1').locked, P.tok('sK3').locked, P.tok('sK4').locked, P.tok('sK2').blocksSight]) === J([true, true, true, true])
            && ctlChanged === true && ctlPts === J([[0, 0], [9, 4], [3, 9]]) && J(bHolds) === J([['sK1', 100, J([[0, 0], [10, 10]]), true], ['sK2', 200, J([[0, 0], [10, 10]]), false], ['sK3', 300, J([[0, 0], [10, 10]]), false], ['sK4', 400, J([[0, 0], [10, 10]]), false]]),
            J([onHerPage, tries, asItIsGot, ctlChanged, ctlPts, bHolds]));
    }
    // (6g) Round three of Match a wall in the one-module world, on a map with no fog: a player's line keeps its nib. Ana's copy of the map
    // carries nine new drawings of hers, each naming a nib its own way, and her earlier drawing redrawn with the flat nib. The host rebuilds
    // each (playerStroke), and what it then sends reaches Bo's page and the stream window's copy
    {
        await breathe();
        const N = mkB(); N.join(N.a1, 'mA'); N.join(N.b1, 'mA'); N.step();
        const NIBS = [['nSq', 'square', 'square'], ['nFl', 'flat', 'flat'], ['nFill', 'fill', NONE], ['nRo', 'round', NONE], ['nUp', 'Square', NONE], ['nMk', '<img src=x onerror=alert(1)>', NONE], ['nNum', 7, NONE], ['nList', ['flat'], NONE], ['nNo', undefined, NONE]];
        const inkN = (id, y, tip) => { const w = { id, type: 'path', ownerId: 'u_a', x: 40, y, w: 30, h: 10, baseW: 30, baseH: 10, pts: [[0, 0], [30, 5]], color: '#e9e9f0', strokeWidth: 4 }; if (tip !== undefined) w.tip = tip; return w; };
        const tipOn = (list, id) => { const w = (list || []).find(p => p && p.id === id); return !w ? 'not there' : ownK(w, 'tip') ? w.tip : NONE; }, hostWb = () => N.camp.items.mA.whiteboard;
        const restOf = () => J(hostWb().filter(w => w.id !== 'sA' && NIBS.every(n => n[0] !== w.id))), restWas = restOf();   // every piece that is not one of hers named below
        const copyN = copyOf(N.a1.page.map('mA')); NIBS.forEach((n, i) => { copyN.whiteboard.push(inkN(n[0], 300 + 20 * i, n[1])); });
        Object.assign(copyN.whiteboard.find(w => w.id === 'sA'), { pts: [[0, 0], [9, 4], [3, 9]], tip: 'flat' });
        const changedN = N.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copyN }, N.net.roster.pA1, { conn: N.a1 });
        const hostTips = NIBS.map(n => tipOn(hostWb(), n[0])).concat([tipOn(hostWb(), 'sA')]), hostFill = J(N.tok('nFill'));
        N.net.sendItem('k', 'mA'); const evN = N.step(), bWb = N.b1.page.map('mA').whiteboard, bTips = NIBS.map(n => tipOn(bWb, n[0])).concat([tipOn(bWb, 'sA')]), streamTips = NIBS.map(n => tipOn((N.stream().mA || {}).whiteboard, n[0])).concat([tipOn((N.stream().mA || {}).whiteboard, 'sA')]);
        // her next copy: the flat line redrawn naming the Fill tip, the square one redrawn naming markup. The redraws land, and neither word comes in
        const copyN2 = copyOf(N.a1.page.map('mA')); Object.assign(copyN2.whiteboard.find(w => w.id === 'nFl') || {}, { pts: [[0, 0], [30, 9]], tip: 'fill' }); Object.assign(copyN2.whiteboard.find(w => w.id === 'nSq') || {}, { pts: [[0, 0], [30, 9]], tip: '<b>fill</b>' });
        const changedN2 = N.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copyN2 }, N.net.roster.pA1, { conn: N.a1 }), redrawn = [J((N.tok('nFl') || {}).pts), J((N.tok('nSq') || {}).pts)];
        N.net.sendItem('k', 'mA'); N.step(); const saidN = N.text(), tipsSaid = (saidN.match(/"tip":("[^"]*"|[^,}]*)/g) || []).filter((t, i, all) => all.indexOf(t) === i).sort();
        const WANTN = NIBS.map(n => n[2]).concat(['flat']);
        check('Match a wall, round three, in the one-module world, a player\'s line keeps its nib (the real patch gate with the real playerStroke, then the real sendItem into real player pages; a map with no fog): Ana\'s copy of the map carries a new line of hers with the square nib and one with the flat nib, and her earlier drawing redrawn with the flat nib. Each stands on the host with its nib, reaches Bo\'s page with it, and stands so in the stream window\'s copy. A new line that names the Fill tip, the word round, another case of square, markup, a number, a list that holds the word, or no nib at all is taken as a line with no nib, on the host, on Bo\'s page and in the stream window\'s copy: the one that named the Fill tip stands on the host as a plain round line of hers and never as a filled region. Nothing else on the host\'s map moved. Her next copy redraws the flat line naming the Fill tip and the square one naming markup: both redraws land, and in everything sent to anyone from the first join on no nib is said but the words round, square and flat',
            changedN === true && J(hostTips) === J(WANTN) && J(bTips) === J(WANTN) && J(streamTips) === J(WANTN) && restOf() === restWas && evN.length > 0 && evN.every(e => /^p(A1|B):item(Delta)?:mA$/.test(e))
            && hostFill === J({ id: 'nFill', type: 'path', x: 40, y: 340, w: 30, h: 10, baseW: 30, baseH: 10, z: 35, pts: [[0, 0], [30, 5]], color: '#e9e9f0', strokeWidth: 4, ownerId: 'u_a', byPlayer: true })
            && changedN2 === true && J(redrawn) === J(['[[0,0],[30,9]]', '[[0,0],[30,9]]']) && tipsSaid.length > 0 && tipsSaid.every(t => t === '"tip":"round"' || t === '"tip":"square"' || t === '"tip":"flat"') && tipsSaid.indexOf('"tip":"square"') >= 0 && tipsSaid.indexOf('"tip":"flat"') >= 0 && !/onerror|<b>/.test(saidN) && N.w1.sent.length === 0,
            J([changedN, hostTips, bTips, streamTips, restOf() === restWas, evN, hostFill, changedN2, redrawn, tipsSaid]));
        // Round four: a redraw that names no nib leaves a ROUND line, through a real player page. Her copy above redrew her flat line naming the
        // Fill tip and her square one naming markup. Neither names a nib, so both lines are round on the host now, and reach Bo's page and the
        // stream window's copy with no nib (round three left them flat and square there, redrawn or not). Her next copy redraws her earlier
        // drawing, which is flat, with nothing said of a nib; redraws the line that lost its flat nib with the square one; names the line
        // that lost its square nib with the flat nib and nothing else changed, which is no redraw; and moves a round line
        const R4 = ['nFl', 'nSq', 'sA', 'nRo'], tipsOf = list => R4.map(id => tipOn(list, id)), seenBy = () => [tipsOf(hostWb()), tipsOf(N.b1.page.map('mA').whiteboard), tipsOf((N.stream().mA || {}).whiteboard)];   // on the host, on Bo's page, in the stream window's copy
        const after2 = seenBy();
        const copyN3 = copyOf(N.a1.page.map('mA')), c3 = id => copyN3.whiteboard.find(w => w.id === id) || {}, asHost = id => { const h = N.tok(id) || {}; return { x: h.x, y: h.y, pts: copyOf(h.pts || []) }; };
        Object.assign(c3('sA'), { pts: [[0, 0], [5, 9], [3, 2]] }); delete c3('sA').tip;
        Object.assign(c3('nFl'), { pts: [[0, 0], [30, 2]], tip: 'square' });
        Object.assign(c3('nSq'), asHost('nSq'), { tip: 'flat' });
        Object.assign(c3('nRo'), asHost('nRo')); c3('nRo').x += 5; delete c3('nRo').tip;
        const sqWas = J(N.tok('nSq')), changedN3 = N.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copyN3 }, N.net.roster.pA1, { conn: N.a1 }), hostNow3 = tipsOf(hostWb()), sqSame = J(N.tok('nSq')) === sqWas, moved3 = [J((N.tok('sA') || {}).pts), J((N.tok('nFl') || {}).pts), (N.tok('nRo') || {}).x];
        N.net.sendItem('k', 'mA'); const set3 = (lastOf(N.b1, 'itemDelta', 'mA') || { whiteboard: { set: [] } }).whiteboard.set.map(w => [w.id, ownK(w, 'tip') ? w.tip : NONE]).sort(), ev3 = N.step(), after3 = seenBy();   // set3: what the host's save then carried to Bo, read before the step empties what was sent: each changed line whole, with its nib or with none
        // ... and a copy that changes ONLY a nib: her line with no nib named with the flat one, at the host's own points and place. No redraw: nothing changes on the host, and the GM's save sends nobody anything
        const copyN4 = { id: 'mA', type: 'map', whiteboard: hostWb().filter(w => w.ownerId === 'u_a').map(w => (w.byPlayer ? Object.assign({ id: w.id, type: 'path', ownerId: 'u_a', x: w.x, y: w.y, w: w.w, h: w.h, pts: copyOf(w.pts) }, w.id === 'nSq' ? { tip: 'flat' } : w.id === 'nFl' ? { tip: 'round' } : ownK(w, 'tip') ? { tip: w.tip } : {}) : copyOf(w))) };
        const hostWas4 = J(hostWb()), changedN4 = N.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copyN4 }, N.net.roster.pA1, { conn: N.a1 }), same4 = J(hostWb()) === hostWas4;
        N.net.sendItem('k', 'mA'); const ev4 = N.step(), after4 = seenBy(), saidN4 = N.text(), tipsSaid4 = (saidN4.match(/"tip":("[^"]*"|[^,}]*)/g) || []).filter((t, i, all) => all.indexOf(t) === i).sort();
        const ROUND2 = [NONE, NONE, 'flat', NONE], ROUND3 = ['square', NONE, NONE, NONE];
        check('Match a wall, round four, in the one-module world, a redraw that names no nib leaves a round line (the real patch gate with the real playerStroke, then the real sendItem and itemDelta into real player pages; a map with no fog): after Ana\'s copy that redrew her flat line naming the Fill tip and her square line naming markup, neither of which names a nib, both lines stand on the host with no nib, and so on Bo\'s page and in the stream window\'s copy, while her earlier drawing is still flat. Her next copy redraws that flat drawing with nothing said of a nib: it stands round on the host, on Bo\'s page and in the stream window\'s copy. In the same copy the line that lost its flat nib is redrawn with the square nib and has it everywhere; a round line that is moved stays round; and the line that lost its square nib is named with the flat nib at the host\'s own points and place, which is no redraw: it is text for text as it was on the host and has no nib anywhere. The GM\'s save after it carries the three changed lines to Bo, each whole, the square one with its nib and the two round ones with none. Then a copy that changes only a nib, naming one line with the flat nib and another with the word round and everything of hers as the host holds it, changes nothing on the host, and the GM\'s save after it sends nobody anything. In everything sent from the first join on no nib is said but the words round, square and flat',
            J(after2) === J([ROUND2, ROUND2, ROUND2]) && changedN3 === true && J(hostNow3) === J(ROUND3) && sqSame && J(moved3) === J(['[[0,0],[5,9],[3,2]]', '[[0,0],[30,2]]', 45]) && ev3.length > 0 && ev3.every(e => /^p(A1|B):itemDelta:mA$/.test(e)) && J(after3) === J([ROUND3, ROUND3, ROUND3])
            && J(set3) === J([['nFl', 'square'], ['nRo', NONE], ['sA', NONE]]) && changedN4 === false && same4 && J(ev4) === '[]' && J(after4) === J([ROUND3, ROUND3, ROUND3])
            && tipsSaid4.length > 0 && tipsSaid4.every(t => t === '"tip":"round"' || t === '"tip":"square"' || t === '"tip":"flat"') && N.w1.sent.length === 0,
            J([after2, changedN3, hostNow3, sqSame, moved3, ev3, after3, set3, changedN4, same4, ev4, after4, tipsSaid4]));
    }
})());

T.finish();
