/* netpossesscheck.js: which maps a player's app holds, the patch gate and the delta between two copies, and a player's explored ground on
   the wire, the tests that came out of netfogcheck.js and netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test
   split", step 6, 2026-11-19), each block word for word with the comment that heads it: per-player map possession with the take-back
   (mapGive, mapTake, mapLeft, the stub and its line), the patch gate and the delta (a token or a stroke the GM locked, a drawing made a wall
   or a barrier, the host's count for the GM's undo, R2 security's cluster A on the patch path and on the delta path), and, from netcheck.js,
   a player's explored ground kept by the host and sent on (1.6.3 finding 13: memsend and fogMem). The code lives mostly in netfog.js, a part
   of net.js, read by its own name; the slices of other areas read the joined net.js through srcjoin.
   Run: node tools/netpossesscheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc, broadcastSrc } = kit.netSlices('netpossesscheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { helpersSrc, storage, H, ownKeySrc, siSrc } = kit.netHarness('netpossesscheck');
const j = JSON.stringify;
// per-player map possession (security, the owner's ruling of 2026-10-01): a player's app holds only the maps they have reached. Run for real in the
// one-module world (the real sanitizeAppState, sendItem, broadcastItemFiltered, itemGone, pushItems, summonPlayerToMap, stageConn, hostTravel, the
// needItem branch, the live position relay, fogSeed / fogCatchUp / the acks over the real fog.js, fogcore and the real itemDelta) with a real player
// page per connection (applyItem, applyItemDelta, applyFogDiff and the real cleanHostMap)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const fogSrc = fogT.slice(fogT.indexOf('function core() {'), fogT.indexOf('/* ---------- the overlay'));
    const whole9 = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const bw = (n, file) => between('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]', n, typeof file === 'string' ? file : undefined);   // file: a part of net.js, read by its own name
    const has = n => src.indexOf('// [netcheck:' + n + '-start]') >= 0;
    const J = v => JSON.stringify(v);
    const mhSrc = require('./checkkit').part('netfog.js').indexOf('// [netcheck:mapheld-start]') >= 0 ? bw('mapheld', 'netfog.js') : '';   // absent on the code before this fold: the cases then fail, not the run
    const niBody = has('needitem') ? bw('needitem') : (() => { const a = src.indexOf("} else if (msg.type === 'needItem' && net.role === 'host') {"), b = src.indexOf("\n    } else if (msg.type === 'stage'", a); return src.slice(src.indexOf('\n', a) + 1, b); })();
    const trSrc = fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel');
    const modSrc = ['var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {}, bannedIds = {}, _travelDenyLast = {};',
        'var fxLib = function() { return {}; }, itemLib = function() { return {}; }, withHoverLines = function(v) { return v; };',
        ownKeySrc, siSrc(), mhSrc, fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js'), bw('foglit', 'netfog.js'), fnSrc('function anyFog(', '\n}\n', 'anyFog', 'netfog.js') + '\n}\n', lineOf('function mapFogged('), lineOf('var FOG_DIFF_ADD_MAX = ', 'netfog.js'),
        fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\n', lineOf('function uniqueIds(', 'netfog.js'), fnSrc('function itemDelta(itemId, clean) {', '\nfunction applyItemDelta(', 'itemDelta', 'netfog.js'), fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n',
        whole9('net.sendItem = function('), whole9('net.broadcastItemFiltered = function('), whole9('net.itemGone = function('), whole9('net.pushItems = function('), whole9('net.summonPlayerToMap = function('), bw('stage'), bw('combats'),
        fnSrc('function freeSpotNear(', '\n}\n', 'freeSpotNear') + '\n}\n', fnSrc('function stepOffPortal(', '\n}\n', 'stepOffPortal') + '\n}\n', fnSrc('function portalUnder(', '\n}\n', 'portalUnder') + '\n}\n', trSrc,
        lineOf('var _saveSoon = null;'), lineOf('function saveRemoteSoon()'), bw('bpos'), src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')), bw('pos'), bw('patch', 'netfog.js'), bw('fogmove', 'netfog.js'), ordersSrc,
        'return { snapshot: sanitizeAppState, travel: hostTravel, stageConn: stageConn, relay: broadcastPos, seedSnap: fogSeedSnapshot, catchUp: fogCatchUp, fire: fogMoveFire, arm: fogArm, forgetConn: fogForgetConn, forgetAll: fogForgetAll, ackTook: ackTook, fogHeld: function() { return _fogHeld; },',
        'held: typeof mapHeld === "function" ? mapHeld : null, heldNote: typeof mapHeldNote === "function" ? mapHeldNote : null, heldOf: typeof mapHeldOf === "function" ? mapHeldOf : null, give: typeof mapGive === "function" ? mapGive : null, stub: typeof mapStub === "function" ? mapStub : null, store: function() { return typeof _mapHeld === "object" ? _mapHeld : null; }, take: typeof mapTake === "function" ? mapTake : null, left: typeof mapLeft === "function" ? mapLeft : null, follow: typeof followConns === "function" ? followConns : null, pend: function(p, m) { return typeof hidPendOf === "function" ? hidPendOf(p, m) : null; }, posIn: typeof handlePos === "function" ? handlePos : null, patchIn: typeof applyClientItemFiltered === "function" ? applyClientItemFiltered : null,',
        'needItem: function(msg, conn) {', niBody, '}, stubSync: typeof mapStubSync === "function" ? mapStubSync : null, stubSaid: function() { return typeof _stubSaid === "object" ? _stubSaid : null; } };'].join('\n');
    const NAMES9 = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'peerProfileId', 'lim', 'pushChat', 'state', 'broadcast', '_lastSent', 'setTimeout', 'clearTimeout', 'save', 'toast', 'logEvent', 'renderRoster', 'dropWaitingFor', 'allow', 'render', 'broadcastRoster', 'checkRoomHandouts', 'applyPosToDom', 'bellOut', 'renderNotepad', 'fogNow', 'ensurePlayerToken', 'findLandingRoom', 'landingPoint'];
    const build9 = new Function(...NAMES9, modSrc);
    const buildFog9 = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { fogDropIds: fogDropIds, fogLitFor: fogLitFor, canSeePoint: canSeePoint, invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor, tokenSightCells: tokenSightCells, viewersFor: viewersFor, moveBlocked: moveBlocked, moveCells: moveCells, fogMarksFor: fogMarksFor, fogOffFor: fogOffFor };');
    // a player's page: the real applyItem, applyItemDelta, applyFogDiff and the fogDiff branch, over the real cleanHostMap and its cleaners
    const pageSrc = [ownKeySrc, broadcastSrc, lineOf('function escAttr(s) {'), fnSrc('function sanitizeRichText(', '\n}\n', 'sanitizeRichText') + '\n}\n', lineOf('function safeColor('), lineOf('function cleanHostWbItem(w) {'), lineOf('function cleanHostTokSenses(w) {'), lineOf('function cleanHostFxb(w) {'), lineOf('function cleanHostLight(w) {'),
        fnSrc('function ownCellKeysOf(', '\n}\n', 'ownCellKeysOf') + '\n}\n', fnSrc('function ownTokIdsOf(', '\n}\n', 'ownTokIdsOf') + '\n}\n', fnSrc('function cleanHostMap(', '\n}\n', 'cleanHostMap') + '\n}\n', bw('actlog', 'netfog.js'),
        fnSrc('function applyItem(msg) {', '\n}\n', 'applyItem', 'netfog.js') + '\n}\n', fnSrc('function applyItemDelta(msg) {', '\n}\n', 'applyItemDelta', 'netfog.js') + '\n}\n', bw('fogdiffapply', 'netfog.js'),
        lineOf('function fromHost('), fnSrc('function mapStub(map) {', '\n}\n', 'mapStub', 'netfog.js') + '\n}\n', fnSrc('function activeItemPatch() {', '\n}\n', 'activeItemPatch', 'netfog.js') + '\n}\n',
        'return { applyItem: applyItem, applyItemDelta: applyItemDelta, cleanMap: cleanHostMap, patch: activeItemPatch, fogDiff: function(msg, conn) {', bw('fogdiff'), '}, mapBack: function(msg, conn) {', has('mapback') ? bw('mapback') : '', '} };'].join('\n');   // mapback: absent on the code before the take-back — its cases then fail, not the run
    const buildPage = new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanWaitingItem', pageSrc);
    const mkPage = (myId, active) => {
        const asked = [], hostConn = { peer: 'h', open: true, send(m) { packCheck(m); asked.push(JSON.parse(J(m))); } };
        const net = { role: 'client', active: true, foreign: true, syncedPeer: 'h', stream: false, applyingRemote: false, myId, conns: [hostConn], roster: {} };
        const camp = { id: 'k', activeItemId: active || 'mA', items: {} }, state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
        const cnt = { render: 0, nav: 0 };
        const P = buildPage(net, state, { wpFogCore: FCx, wpFog: { invalidateVision() {}, redraw() {} } }, () => camp, () => { cnt.render++; }, () => { cnt.nav++; }, H.cleanWaitingItem);
        const feed = m => { m = JSON.parse(J(m)); if (m.type === 'item') P.applyItem(m); else if (m.type === 'itemDelta') P.applyItemDelta(m); else if (m.type === 'fogDiff') P.fogDiff(m, { peer: 'h' }); else if (m.type === 'mapBack') P.mapBack(m, { peer: 'h' }); else if (m.type === 'itemGone') delete camp.items[m.itemId]; };
        return { P, camp, asked, feed, cnt, state, net, map: id => camp.items[id] };
    };
    const T = (id, owner, charId, c, r, more) => Object.assign({ id, type: 'image', isChar: true, charName: id, x: c * 50, y: r * 50, w: 50, h: 50, rot: 0, front: 0 }, owner ? { ownerId: owner } : {}, charId ? { charId } : {}, more || {});
    const M = (id, wb, meta, fog) => ({ id, type: 'map', meta: Object.assign({ title: 'The ' + id, gridType: 'square', cellValue: 5, cellUnit: 'ft' }, meta || {}), rooms: [], links: [], cats: {}, fog: fog ? Object.assign({ on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } }, fog) : { on: false }, whiteboard: wb });
    const sys9 = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }] }, { F: Fx, gmView: true });
    // mA: the map everyone is on, a door to mB on it; mB: locked, nobody on it, a text piece and a monster that is no character, Ana's token already
    // there; mC: open, unreached; mF: a fogged dark map, Ana's token at (2,2) and an orc 13 cells off; dD: a page
    const mkW = o => {
        o = o || {};
        const ev = [], timers = [], feats = { fog: true, lighting: true, sheets: true, turning: true };
        const camp = { id: 'k', system: sys9, fog: { fields: { sight: 'f_sight', sightUnit: 'ft' }, defaults: { sight: 30 } }, turnRules: {},
            items: { mA: M('mA', [T('tA', 'u_a', 'c_a', 2, 2), T('tB', 'u_b', 'c_b', 2, 4), { id: 'beast', type: 'image', name: 'SENTINEL_BEAST_A', x: 500, y: 500, w: 50, h: 50 }, { id: 'door', type: 'rect', name: 'Door', targetMapId: 'mB', x: 300, y: 300, w: 50, h: 50 }]),
                mB: M('mB', [{ id: 'noteB', type: 'text', text: 'SENTINEL_TEXT_B', x: 10, y: 10, w: 100, h: 30 }, { id: 'tokB', type: 'image', name: 'SENTINEL_TOK_B', x: 500, y: 500, w: 50, h: 50 }, { id: 'pad1', type: 'rect', name: 'p'.repeat(240), x: 1, y: 1, w: 5, h: 5 }, { id: 'pad2', type: 'rect', name: 'q'.repeat(240), x: 2, y: 2, w: 5, h: 5 }, T('tAb', 'u_a', 'c_a', 4, 4)], { playerLock: true, parentId: 'mA', sortIndex: 2 }),
                mC: M('mC', [{ id: 'noteC', type: 'text', text: 'SENTINEL_TEXT_C', x: 10, y: 10, w: 100, h: 30 }], { sortIndex: 3 }),
                mF: M('mF', [T('tAf', 'u_a', 'c_a', 2, 2), T('orcF', '', 'c_n', 15, 2, { name: 'SENTINEL_ORC_F' })], { sortIndex: 4 }, {}),
                dD: { id: 'dD', type: 'doc', meta: { title: 'Page', players: true }, blocks: [] } },
            chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sight: 60 } }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_sight: 60 } }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: { f_sight: 60 } } } };
        const W = { ev, camp, timers, now: 0, saves: 0, toasts: [], roster: 0, logs: [], ensured: [] };
        const mkConn = (peer, open) => { const c = { peer, open: open !== false, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(J(m))); ev.push(peer + ':' + m.type + (m.itemId ? ':' + m.itemId : '')); if (this.page) this.page.feed(m); } }; return c; };
        W.a1 = mkConn('pA1'); W.a2 = mkConn('pA2'); W.b1 = mkConn('pB'); W.w1 = mkConn('pW'); W.c1 = mkConn('pC', false);
        W.a1.page = mkPage('u_a'); W.a2.page = mkPage('u_a'); W.b1.page = mkPage('u_b');
        W.net = { active: true, role: 'host', paused: false, applyingRemote: false, myId: 'u_gm', conns: [W.a1, W.a2, W.b1, W.w1, W.c1], roster: { pA1: { id: 'u_a', name: 'Ana', location: 'mA' }, pA2: { id: 'u_a', name: 'Ana', location: 'mA' }, pB: { id: 'u_b', name: 'Bo', location: 'mA' }, pC: { id: 'u_c', name: 'Cy', location: 'mA' } }, combats: {}, targets: {}, travelLocked: false, tokenDropped: () => false };
        const state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
        const win = { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpDiceCore: null, wpVtt: { on: k => feats[k] !== false, campaignOn: k => feats[k] !== false, mode: () => 'host' }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDocRender: { cleanDoc: d => JSON.parse(J(d)) } };
        W.fog = buildFog9(win, { getElementById: () => null }, () => null, () => camp, state); win.wpFog = W.fog;
        const setT = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearT = id => { const t = timers[id - 1]; if (t) t.fn = null; };
        W.fire = ms => { const due = W.timers.filter(t => t.fn && t.ms === ms); due.forEach(t => { const f = t.fn; t.fn = null; f(); }); return due.length; };
        const bc = (m, ex) => { packCheck(m); ev.push('broadcast:' + m.type + (m.itemId ? ':' + m.itemId : '')); W.net.conns.forEach(c => { if (c !== ex && c.open && Object.prototype.hasOwnProperty.call(W.net.roster, c.peer)) c.send(m); }); };
        const lastSent = {};
        // ensurePlayerToken as the real one behaves on the wire: a token made for the player on the map they arrive on, then the map to the table
        const ensure = (pid, mapId) => { W.ensured.push(pid + ':' + mapId); const m = camp.items[mapId]; if (!m || m.type !== 'map' || m.whiteboard.some(w => w.ownerId === pid)) return false; m.whiteboard.push(T('new_' + pid + '_' + mapId, pid, pid === 'u_a' ? 'c_a' : 'c_b', 6, 6)); W.net.broadcastItemFiltered('k', mapId); return true; };
        W.api = build9(W.net, () => Sx, win, () => false, () => camp, e => { throw e; }, c => (W.net.roster[c.peer] ? W.net.roster[c.peer].id : null), { allow: () => true }, () => {}, state, bc, lastSent, setT, clearT,
            () => { W.saves++; }, t => W.toasts.push(t), (k, t) => W.logs.push(k + ':' + t), () => { W.roster++; }, () => {}, () => true, () => {}, () => ev.push('roster-out'), () => {}, () => {}, () => {}, () => {}, () => W.now, ensure, () => null, () => null);
        W.lastSent = lastSent; W.state = state;
        W.types = c => c.sent.map(m => m.type + (m.itemId ? ':' + m.itemId : ''));
        W.clear = () => { ev.length = 0; W.net.conns.forEach(c => { c.sent.length = 0; }); };
        W.held = (c, id) => (W.api.held ? W.api.held(c, id) : null);
        W.note = (c, id) => { if (W.api.heldNote) W.api.heldNote(c, id); };
        W.heldOf = c => (W.api.heldOf ? W.api.heldOf(c) : null);
        W.leak = (c, re) => c.sent.some(m => re.test(J(m)));
        // the join as admitPlayer makes it: the map they land on held, the snapshot made with that record, every fogged map it carries whole seeded
        W.join = (c, landing) => { W.net.roster[c.peer].location = landing; W.note(c, landing); const snap = { type: 'snapshot', appState: W.api.snapshot(state.appState, W.net.roster[c.peer].id, W.heldOf(c)), stage: { campId: 'k', itemId: landing } }; c.send(snap); W.api.seedSnap(c, snap); Object.keys(snap.appState.campaigns.k.items).forEach(id => { c.page.camp.items[id] = JSON.parse(J(snap.appState.campaigns.k.items[id])); if (c.page.camp.items[id].type === 'map') c.page.P.cleanMap(c.page.camp.items[id]); }); c.page.camp.activeItemId = landing; return snap; };
        // the map as the host's own sanitizer gives it (the shared copy of an unfogged map), to compare a page's copy against
        W.cleanOf = id => JSON.parse(J(W.api.snapshot(state.appState, 'u_zz', { [id]: 1 }).campaigns.k.items[id]));
        return W;
    };
    const STUB = (id, title, meta) => ({ type: 'map', id, stub: true, meta: Object.assign({ title }, meta || {}), whiteboard: [], rooms: [], links: [], cats: {} });
    const SENT_B = /SENTINEL_TEXT_B|SENTINEL_TOK_B|noteB|tokB/, SENT_C = /SENTINEL_TEXT_C|noteC/, SENT_F = /SENTINEL_ORC_F|orcF|tAf/;

    // (1) the join snapshot: the map they land on whole, every other map of the hosted campaign as its stub (name, lock, nesting; nothing on it)
    {
        const W = mkW(), snap = W.join(W.a1, 'mA'), it = snap.appState.campaigns.k.items;
        const nothingHeld = W.api.snapshot(W.state.appState, 'u_a', {}).campaigns.k.items;
        const stream = W.api.snapshot({ activeCampaignId: 'k', campaigns: { k: W.camp } }).campaigns.k.items, noHeld = W.api.snapshot({ activeCampaignId: 'k', campaigns: { k: W.camp } }, 'u_a').campaigns.k.items;
        check('possession: the join snapshot for a player landing on mA carries mA whole (its beast, its door) and every other hosted map as a stub — type map, its id, a true stub mark, the meta the Maps list and a portal hover need (title; playerLock only where it is set; parentId, sortIndex as numbers), empty whiteboard, rooms, links and cats, no fog, no key besides — so nothing of the locked map, the unreached map or the fogged map (no piece, no text, no token, no creature) is in it; a page still travels; with no map held every map is a stub',
            J(it.mA.whiteboard.map(w => w.id)) === J(['tA', 'tB', 'beast', 'door']) && J(it.mB) === J(STUB('mB', 'The mB', { playerLock: true, parentId: 'mA', sortIndex: 2 })) && J(it.mC) === J(STUB('mC', 'The mC', { sortIndex: 3 })) && J(it.mF) === J(STUB('mF', 'The mF', { sortIndex: 4 }))
            && !SENT_B.test(J(snap)) && !SENT_C.test(J(snap)) && !SENT_F.test(J(snap)) && /SENTINEL_BEAST_A/.test(J(snap)) && it.dD && it.dD.type === 'doc' && Object.keys(nothingHeld).filter(id => nothingHeld[id].type === 'map').every(id => nothingHeld[id].stub === true),
            J([it.mB, it.mC, it.mF, Object.keys(it)]));
        check('possession: the GM\'s own campaign is left whole; the stream window\'s copy (no recipient) and a copy made without the record (an older caller) carry every map whole as before',
            W.camp.items.mB.whiteboard.length === 5 && !('stub' in W.camp.items.mB) && J(stream.mB.whiteboard.map(w => w.id)) === J(['noteB', 'tokB', 'pad1', 'pad2', 'tAb']) && !('stub' in stream.mB) && noHeld.mB.whiteboard.length === 5 && !('stub' in noHeld.mB) && noHeld.mC.whiteboard.length === 1, J([stream.mB, noHeld.mC]));
        const held1 = { a1: ['mA', 'mB', 'mC', 'mF', 'dD'].map(id => W.held(W.a1, id)), b1: W.held(W.b1, 'mA'), fogRec: Object.keys(W.api.fogHeld()) };
        const F = mkW(); F.join(F.a1, 'mF'); const fogSeeded = Object.keys((F.api.fogHeld().pA1) || {});
        check('possession: the record names only the map given (the landing map for that connection, nothing for a stub, nothing for another connection) and fogSeedSnapshot seeds a fogged map only where the snapshot carried it whole — a stub is no copy',
            J(held1) === J({ a1: [true, false, false, false, false], b1: false, fogRec: [] }) && J(fogSeeded) === J(['mF']) && F.held(F.a1, 'mF') === true && F.held(F.a1, 'mA') === false, J([held1, fogSeeded]));
    }
    // (2) nothing of a map goes to a connection that holds only its stub: a lock's push, a whole send, a delta, a fogged map's send and catch-up, a live position
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.clear();
        // a lock's change, pushed as the sidebar pushes it: a connection holding the stub gets the stub afresh — the lock gone, nothing of the map
        delete W.camp.items.mB.meta.playerLock; W.net.pushItems(['mB']); W.net.broadcastItemFiltered('k', 'mF');
        const stubOut = W.ev.slice(), stubMsgs = [W.a1, W.a2, W.b1].map(c => c.sent.map(m => m.item)), stubPages = [W.a1, W.a2, W.b1].map(c => [J(c.page.map('mB')), J(c.page.map('mF')), c.page.asked.length]);
        check('possession: a lock\'s change pushed to the table (net.pushItems, net.broadcastItemFiltered, run for real) reaches a connection holding the map\'s stub as a fresh stub alone — the lock gone, nothing of what is on the map, no ack — unfogged or fogged, never the waiting peer; their pages keep it as a stub and ask for nothing',
            J(stubOut) === J(['pA1:item:mB', 'pA2:item:mB', 'pB:item:mB', 'pA1:item:mF', 'pA2:item:mF', 'pB:item:mF']) && stubMsgs.every(ms => ms.length === 2 && J(ms[0]) === J(STUB('mB', 'The mB', { parentId: 'mA', sortIndex: 2 })) && J(ms[1]) === J(STUB('mF', 'The mF', { sortIndex: 4 }))) && [W.a1, W.a2, W.b1].every(c => c.sent.every(m => m.ack === undefined))
            && stubPages.every(p => p[0] === J(STUB('mB', 'The mB', { parentId: 'mA', sortIndex: 2 })) && p[1] === J(STUB('mF', 'The mF', { sortIndex: 4 })) && p[2] === 0) && W.w1.sent.length === 0 && !W.leak(W.a1, SENT_B) && !W.leak(W.b1, SENT_F), J([stubOut, stubMsgs[0], stubPages]));
        W.camp.items.mB.meta.playerLock = true; W.clear();
        W.net.sendItem('k', 'mB'); W.net.sendItem('k', 'mF'); W.net.sendItem('k', 'mC');
        W.camp.items.mB.whiteboard.push({ id: 'noteB2', type: 'text', text: 'SENTINEL_TEXT_B', x: 50, y: 50, w: 100, h: 30 }); W.net.sendItem('k', 'mB');   // a change: as a delta, were there a baseline
        const quiet = W.ev.slice(); W.api.arm('mF'); const fired = W.fire(150), cu = W.api.catchUp(W.b1, W.camp, W.camp.items.mF, 'u_b', Object.create(null));
        W.api.relay({ type: 'pos', campId: 'k', itemId: 'mB', wbId: 'tokB', x: 1, y: 2, rot: 0, front: 0, final: true }, null, W.camp, W.camp.items.mB, W.camp.items.mB.whiteboard[1]);
        W.api.relay({ type: 'pos', campId: 'k', itemId: 'mF', wbId: 'tAf', x: 1, y: 2, rot: 0, front: 0, final: true }, null, W.camp, W.camp.items.mF, W.camp.items.mF.whiteboard[0]);
        const posQuiet = W.ev.slice(quiet.length);
        W.net.sendItem('k', 'mA'); W.net.broadcastItemFiltered('k', 'mA'); W.api.relay({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'beast', x: 1, y: 2, rot: 0, front: 0, final: true }, null, W.camp, W.camp.items.mA, W.camp.items.mA.whiteboard[2]);
        const onA = W.ev.slice(quiet.length + posQuiet.length);
        W.clear(); W.net.pushItems(['dD']); const pageOut = W.ev.slice();
        check('possession: a whole send, a delta and a fogged map\'s send and catch-up of a map nobody holds reach nobody (no item, no itemDelta, no fogDiff, nothing to the waiting peer; fogCatchUp says false of a connection holding the stub — the order and the pointers are not sent again for it), and the live position relay says nothing of a piece on it, fogged or not (a player\'s own token on the fogged one too); the map everyone is on still goes to everyone there — a send\'s whole copy (no shared baseline yet: the snapshot sets none), a push\'s whole copy and a live position; a handbook page pushed to the table (a page let open to players) still reaches every admitted connection — nobody "holds" a page',
            J(quiet) === J([]) && fired === 1 && cu === false && J(posQuiet) === J([]) && J(onA) === J(['pA1:item:mA', 'pA2:item:mA', 'pB:item:mA', 'pA1:item:mA', 'pA2:item:mA', 'pB:item:mA', 'pA1:pos:mA', 'pA2:pos:mA', 'pB:pos:mA']) && !W.leak(W.a1, SENT_B) && !W.leak(W.b1, SENT_B) && !W.leak(W.a1, SENT_F) && J(pageOut) === J(['pA1:item:dD', 'pA2:item:dD', 'pB:item:dD']), J([quiet, posQuiet, onA, pageOut]));
        const pages = [W.a1, W.a2, W.b1].map(c => [J(c.page.map('mB')) === J(STUB('mB', 'The mB', { parentId: 'mA', sortIndex: 2 })), J(c.page.map('mC')) === J(STUB('mC', 'The mC', { sortIndex: 3 })), c.page.asked.length]);
        check('possession: after all that every page still holds mB (as the last stub pushed to it) and mC as their stubs and asked for nothing', pages.every(p => p[0] && p[1] && p[2] === 0), J(pages));
    }
    // (3) the arrival: a summon gives the map whole before the stage word, to that connection alone; the record; a delta then reaches it
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); delete W.camp.items.mB.meta.playerLock; W.clear();
        const ok = W.net.summonPlayerToMap('u_b', 'mB');
        const bTypes = W.types(W.b1), bItem = W.b1.sent.find(m => m.type === 'item' && m.itemId === 'mB'), bPage = W.b1.page.map('mB');
        check('possession: summoning Bo to mB (net.summonPlayerToMap, stageConn, run for real) makes his token there and tells the table (nobody holds mB: no copy goes out, Ana\'s connections get the stub afresh), then gives his connection mB whole — the text, the monster, Ana\'s token and his new one, no stub mark — and only then the stage word, and after it the take-back word for mA, the map he left (his page holds mA\'s stub, the record no longer names it for him; Ana\'s connections keep it whole and are sent no take-back); the record names mB for his connection alone; Ana\'s connections hear nothing of what is on mB (one fresh stub each, no content, nothing else) and the waiting peer nothing at all',
            ok === true && J(bTypes) === J(['item:mB', 'stage', 'mapBack:mA']) && W.held(W.b1, 'mA') === false && J(W.b1.page.map('mA')) === J(STUB('mA', 'The mA')) && [W.a1, W.a2].every(c => W.held(c, 'mA') === true && !('stub' in c.page.map('mA'))) && !!bItem && J(bItem.item.whiteboard.map(w => w.id)) === J(['noteB', 'tokB', 'pad1', 'pad2', 'tAb', 'new_u_b_mB']) && bItem.item.stub === undefined && J(W.ensured) === J(['u_b:mB'])
            && J(bPage.whiteboard.map(w => w.id)) === J(['noteB', 'tokB', 'pad1', 'pad2', 'tAb', 'new_u_b_mB']) && !('stub' in bPage) && J(bPage) === J(W.cleanOf('mB')) && W.held(W.b1, 'mB') === true && W.held(W.a1, 'mB') === false && W.held(W.a2, 'mB') === false && [W.a1, W.a2].every(c => J(W.types(c)) === J(['item:mB']) && J(c.sent[0].item) === J(STUB('mB', 'The mB', { parentId: 'mA', sortIndex: 2 }))) && W.w1.sent.length === 0 && W.net.roster.pB.location === 'mB',
            J([ok, bTypes, bItem && bItem.item.whiteboard.map(w => w.id), W.ensured, W.a1.sent.length]));
        W.clear(); W.camp.items.mB.whiteboard[0].text = 'SENTINEL_TEXT_B changed'; W.net.sendItem('k', 'mB');
        const afterDelta = { b: W.types(W.b1), a: W.types(W.a1).concat(W.types(W.a2)), page: J(W.b1.page.map('mB')) === J(W.cleanOf('mB')), asked: W.b1.page.asked.length };
        W.clear(); W.api.relay({ type: 'pos', campId: 'k', itemId: 'mB', wbId: 'tokB', x: 1, y: 2, rot: 0, front: 0, final: true }, null, W.camp, W.camp.items.mB, W.camp.items.mB.whiteboard[1]);
        const posB = W.ev.slice();
        W.clear(); W.net.summonPlayerToMap('u_b', 'mB'); const again = W.types(W.b1);
        check('possession: a change to mB then reaches Bo as a delta (the real itemDelta against the baseline his copy was made from), his page equal to the host\'s copy, Ana\'s connections nothing; a live position on mB goes to his connection alone; summoned to mB again he gets the stage word and no second copy',
            J(afterDelta) === J({ b: ['itemDelta:mB'], a: [], page: true, asked: 0 }) && J(posB) === J(['pB:pos:mB']) && J(again) === J(['stage']), J([afterDelta, posB, again]));
    }
    // (4) the baseline: a change made while only Bo held mB, then Ana arrives — Bo's delta goes first, Ana's whole copy is the baseline's own, and the next delta fits both
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.b1, 'mA'); delete W.camp.items.mB.meta.playerLock; W.net.summonPlayerToMap('u_b', 'mB'); W.clear();
        W.camp.items.mB.whiteboard.push({ id: 'noteB3', type: 'text', text: 'late', x: 70, y: 70, w: 100, h: 30 });   // not yet sent to anyone
        W.net.summonPlayerToMap('u_a', 'mB');
        const order = W.ev.filter(e => /^(pA1|pB):/.test(e)), pagesEq = [W.a1, W.b1].map(c => J(c.page.map('mB')) === J(W.cleanOf('mB')));
        W.clear(); W.camp.items.mB.whiteboard[1].x = 900; W.net.sendItem('k', 'mB');
        const next = { types: W.ev.filter(e => /^(pA1|pB):/.test(e)), eq: [W.a1, W.b1].map(c => J(c.page.map('mB')) === J(W.cleanOf('mB'))), asked: W.a1.page.asked.length + W.b1.page.asked.length };
        check('possession: a change made while only Bo held mB is sent to him as a delta before Ana\'s whole copy goes (then her stage word, then the take-back of the map she left), so both pages equal the host\'s copy, and the next change reaches both as a delta that fits both — no page asks for the whole map',
            J(order) === J(['pB:itemDelta:mB', 'pA1:item:mB', 'pA1:stage', 'pA1:mapBack:mA']) && J(pagesEq) === J([true, true]) && J(next) === J({ types: ['pA1:itemDelta:mB', 'pB:itemDelta:mB'], eq: [true, true], asked: 0 }), J([order, pagesEq, next]));
    }
    // (5) a portal: hostTravel gives the destination whole before the personal stage, to the traveler's connection alone; a locked destination still refuses
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.clear();
        W.camp.items.mA.whiteboard[0].x = 300; W.camp.items.mA.whiteboard[0].y = 300;   // Ana stands on the door: only the token on the portal steps off (the travel rule of cluster A), so mA changes and goes to its holders
        const door = W.camp.items.mA.whiteboard[3], refused = W.api.travel(W.a1, W.net.roster.pA1, door, W.camp.items.mA);
        const refusedOut = { ret: refused, a1: W.types(W.a1), held: W.held(W.a1, 'mB') };
        delete W.camp.items.mB.meta.playerLock; W.clear();
        const went = W.api.travel(W.a1, W.net.roster.pA1, door, W.camp.items.mA);
        const a1T = W.types(W.a1), a2T = W.types(W.a2), bT = W.types(W.b1), iB = a1T.indexOf('item:mB'), iS = a1T.indexOf('stage');
        const stage = W.a1.sent.find(m => m.type === 'stage'), pageB = W.a1.page.map('mB');
        check('possession: a portal to the locked mB refuses as before (travelDenied, nothing of the map, nothing held); unlocked, hostTravel (run for real) moves Ana\'s token off the door and sends mA to everyone holding it, then gives her connection mB whole and only then her personal stage word; her other connection and Bo get nothing of mB; her page holds mB as the host\'s copy, no stub mark',
            J(refusedOut) === J({ ret: false, a1: ['travelDenied'], held: false }) && went === true && iB >= 0 && iS > iB && a1T.filter(t => t === 'item:mB').length === 1 && J(a2T) === J(['item:mA']) && J(bT) === J(['item:mA']) && !!stage && stage.personal === true && stage.stage.itemId === 'mB'
            && J(pageB) === J(W.cleanOf('mB')) && !('stub' in pageB) && W.held(W.a1, 'mB') === true && W.held(W.a2, 'mB') === false && W.held(W.b1, 'mB') === false && W.net.roster.pA1.location === 'mB' && W.net.roster.pA2.location === 'mA', J([refusedOut, a1T, a2T, bT]));
    }
    // (5b) fold 2's review: a portal's travel sends the traveler the fights on the map they arrive on, after the stage word, and the empty list where
    // they leave a map with a fight for one with none (hostTravel and the combats slice, run for real); nobody else is sent any of it
    {
        const go = fights => { const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); delete W.camp.items.mB.meta.playerLock; W.camp.items.mA.whiteboard[0].x = 300; W.camp.items.mA.whiteboard[0].y = 300;
            W.net.combats = fights; W.clear(); const went = W.api.travel(W.a1, W.net.roster.pA1, W.camp.items.mA.whiteboard[3], W.camp.items.mA);
            const a1T = W.types(W.a1), cm = W.a1.sent.filter(m => m.type === 'combats');
            return { went, order: a1T.filter(t => t === 'stage' || t === 'combats'), keys: cm.map(m => Object.keys(m.combats)), others: [W.a2, W.b1].map(c => c.sent.filter(m => m.type === 'combats').length) }; };
        const both = go({ f_moat0001: { id: 'f_moat0001', mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'rtB', name: 'Bo', tokId: 'tB' }] }, f_moat0002: { id: 'f_moat0002', mapId: 'mB', round: 2, turn: 0, rows: [{ id: 'r_beast', name: 'Beast', tokId: 'tokB' }] } });
        const away = go({ f_moat0001: { id: 'f_moat0001', mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'rtB', name: 'Bo', tokId: 'tB' }] } }), none = go({});
        check('fold 2\'s review (hostTravel, run for real with the combats slice): a portal\'s travel sends the traveler the fights on the map they arrive on, after the stage word and with nothing of the fight they left; leaving a map with a fight for one with none sends the empty list after the stage word; between two maps with no fight nothing; their other connection and the player who stayed are sent none of it',
            J([both, away, none]) === J([{ went: true, order: ['stage', 'combats'], keys: [['f_moat0002']], others: [0, 0] }, { went: true, order: ['stage', 'combats'], keys: [[]], others: [0, 0] }, { went: true, order: ['stage'], keys: [], others: [0, 0] }]), J([both, away, none]));
    }
    // (6) needItem: a map the connection was never given is refused there; one it holds, and a page, are sent
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.clear();
        W.api.needItem({ type: 'needItem', campId: 'k', itemId: 'mC' }, W.a1); W.api.needItem({ type: 'needItem', campId: 'k', itemId: 'mB' }, W.a1); W.api.needItem({ type: 'needItem', campId: 'k', itemId: 'mF' }, W.a1);
        const refused = W.types(W.a1); W.clear();
        W.api.needItem({ type: 'needItem', campId: 'k', itemId: 'mA' }, W.a1); W.api.needItem({ type: 'needItem', campId: 'k', itemId: 'dD' }, W.a1); W.api.needItem({ type: 'needItem', campId: 'x', itemId: 'mA' }, W.a1);
        check('possession: a player\'s app asking for a map it was never given (the unreached map, the locked one, the fogged one) gets nothing — the needItem branch run for real through sendItem\'s own gate; the map it holds and a handbook page come as before, another campaign\'s nothing',
            J(refused) === J([]) && !W.leak(W.a1, SENT_B) && !W.leak(W.a1, SENT_C) && J(W.types(W.a1)) === J(['item:mA', 'item:dD']), J([refused, W.types(W.a1)]));
    }
    // (7) the player's side: a stub asks for the whole map on a delta or a catch-up and keeps nothing of either; a whole copy replaces it; a hostile mark
    {
        const pg = mkPage('u_a'); pg.camp.items.mB = STUB('mB', 'The mB', { playerLock: true });
        pg.feed({ type: 'itemDelta', campId: 'k', itemId: 'mB', whiteboard: { set: [{ id: 'x1', type: 'rect', x: 1, y: 1, w: 5, h: 5 }], del: [], order: ['x1'] } });
        const afterDelta = { asked: pg.asked.map(m => m.type + ':' + m.itemId), map: J(pg.map('mB')) };
        pg.feed({ type: 'fogDiff', campId: 'k', itemId: 'mB', add: [{ item: { id: 'orc9', type: 'image', isChar: true }, after: null }] });
        const afterDiff = { asked: pg.asked.map(m => m.type + ':' + m.itemId), map: J(pg.map('mB')) };
        pg.feed({ type: 'item', campId: 'k', itemId: 'mB', item: { id: 'mB', type: 'map', meta: { title: 'The mB' }, rooms: [], links: [], cats: {}, whiteboard: [{ id: 'noteB', type: 'text', text: 'hello', x: 1, y: 1, w: 5, h: 5 }] } });
        const wholeIn = { ids: pg.map('mB').whiteboard.map(w => w.id), stub: 'stub' in pg.map('mB') };
        pg.feed({ type: 'itemDelta', campId: 'k', itemId: 'mB', whiteboard: { set: [{ id: 'x2', type: 'rect', x: 1, y: 1, w: 5, h: 5 }], del: [], order: ['noteB', 'x2'] } });
        const deltaNow = { ids: pg.map('mB').whiteboard.map(w => w.id), asked: pg.asked.length };
        const hostile = (m => { pg.P.cleanMap(m); return m; })({ id: 'mZ', type: 'map', stub: true, meta: { title: 'Z' }, whiteboard: [{ id: 'z1', type: 'rect' }], rooms: [{ id: 'r' }], links: [[1, 2]], cats: {} });
        const odd = (m => { pg.P.cleanMap(m); return m; })({ id: 'mY', type: 'map', stub: 'yes', meta: { title: 'Y' }, whiteboard: [{ id: 'y1', type: 'rect' }], rooms: [], links: [] });
        check('possession (the player\'s side, run for real): a delta or a catch-up for a map held as a stub asks for the whole map once each and changes nothing of the stub; the whole map then replaces it (no stub mark) and the next delta applies; a host\'s map marked a stub comes in empty whatever it carries, and a mark that is not true is taken off',
            J(afterDelta) === J({ asked: ['needItem:mB'], map: J(STUB('mB', 'The mB', { playerLock: true })) }) && J(afterDiff) === J({ asked: ['needItem:mB', 'needItem:mB'], map: J(STUB('mB', 'The mB', { playerLock: true })) }) && J(wholeIn) === J({ ids: ['noteB'], stub: false }) && J(deltaNow) === J({ ids: ['noteB', 'x2'], asked: 2 })
            && hostile.stub === true && J(hostile.whiteboard) === J([]) && J(hostile.rooms) === J([]) && J(hostile.links) === J([]) && !('stub' in odd) && J(odd.whiteboard.map(w => w.id)) === J(['y1']), J([afterDelta, afterDiff, wholeIn, deltaNow, hostile, odd]));
    }
    // (8) fog: a fogged map given at an arrival is one copy of that player's through their own fog, seeded; its catch-up and whole re-sends go to its holders alone; the acks ride the whole copy
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.api.ackTook(W.a1, 7); W.clear();
        W.net.summonPlayerToMap('u_a', 'mF');
        const aT = W.types(W.a1), aItem = W.a1.sent.find(m => m.type === 'item'), fogRec = Object.keys(W.api.fogHeld().pA1 || {});
        W.clear(); W.camp.items.mF.whiteboard[1].x = 250;   // the orc steps to 5 cells off Ana's token: in her sight now
        W.api.arm('mF'); W.fire(150); const caught = W.ev.slice();
        W.clear(); W.net.broadcastItemFiltered('k', 'mF'); W.net.sendItem('k', 'mF'); const resent = W.ev.slice();
        check('possession: a fogged map given at Ana\'s arrival (summoned to mF) is her own copy through her own fog (the orc 13 cells off left out, her token in) with the step-back\'s number on it, and fogSeed records it; a move of the orc into her sight is caught up in place on her connection alone (the real fogCatchUp over the real fog.js); a whole re-send of mF goes to her connection alone: a push gives her other connection and Bo, who hold its stub, the stub afresh and nothing of the map, a send gives them nothing',
            J(aT) === J(['item:mF', 'stage', 'mapBack:mA']) && !!aItem && J(aItem.item.whiteboard.map(w => w.id)) === J(['tAf']) && aItem.ack === 7 && J(fogRec) === J(['mF']) && J(caught) === J(['pA1:fogDiff:mF']) && J(W.a1.page.map('mF').whiteboard.map(w => w.id)) === J(['tAf', 'orcF'])
            && J(resent) === J(['pA2:item:mF', 'pB:item:mF', 'pA1:item:mF', 'pA1:item:mF']) && [W.a2, W.b1].every(c => c.sent.length === 1 && J(c.sent[0].item) === J(STUB('mF', 'The mF', { sortIndex: 4 }))) && !W.leak(W.a2, SENT_F) && !W.leak(W.b1, SENT_F), J([aT, fogRec, caught, resent]));
    }
    // (9) forgotten with the connection, with the map and at a new table; a map that goes leaves every page
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.b1, 'mA'); delete W.camp.items.mB.meta.playerLock; W.net.summonPlayerToMap('u_b', 'mB');
        const before = [W.held(W.a1, 'mA'), W.held(W.b1, 'mB'), W.held(W.b1, 'mA')];
        W.api.forgetConn('pB'); const conn = [W.held(W.a1, 'mA'), W.held(W.b1, 'mB')];
        W.net.summonPlayerToMap('u_a', 'mB'); const left = [W.held(W.a1, 'mB'), W.held(W.a1, 'mA'), W.a1.page.map('mA') && W.a1.page.map('mA').stub === true];   // Ana leaves mA: her page holds its stub
        W.net.itemGone('k', 'mA'); W.net.itemGone('k', 'mB'); const gone = [W.held(W.a1, 'mB'), 'mA' in W.a1.page.camp.items, 'mB' in W.a1.page.camp.items];
        W.note(W.a1, 'mC'); const noted = W.held(W.a1, 'mC'); W.api.forgetAll(); const all = [W.held(W.a1, 'mC'), J(W.api.store())];
        check('possession: the record is forgotten with the connection (fogForgetConn, as the close handler and a kick go through it), with a map that goes (net.itemGone: every page loses it too — a map the GM deletes while a player is away takes its stub with it) and at a new table (fogForgetAll)',
            J(before) === J([true, true, false]) && J(conn) === J([true, false]) && J(left) === J([true, false, true]) && J(gone) === J([false, false, false]) && noted === true && J(all) === J([false, '{}']), J([before, conn, left, gone, noted, all]));
    }
    // (10) the source: the join, the stage and the travel wired to the record; the stage word still written in three places; Help and the lock's tooltip say it
    {
        const srcNoCm = src.replace(/\/\/[^\n]*/g, '');
        const html = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'), sbSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sidebar.js'), 'utf8');
        check('possession (source): admitPlayer forgets the connection\'s record, notes the landing map and hands the record to sanitizeAppState (and forgets it when the snapshot fails); stageConn and hostTravel give the map before their stage word (the only three stage words as before); the needItem branch answers through sendItem alone; a player\'s app put on a map it holds as a stub asks for it whole (applyStage); Help, the Lock for players tooltip and the Maps list\'s lock badge say a map a player has not reached is not on their machine',
            /camp\.items\[stage\.itemId\]\.stub === true && net\.needItem\) net\.needItem\(stage\.campId, stage\.itemId\);/.test(fnSrc('function applyStage(stage) {', '\n}\n', 'applyStage', 'netfog.js')) && /si-lock" title="[^"]*holds only its name/.test(sbSrc) &&
            /if \(typeof mapForgetConn === 'function'\) mapForgetConn\(conn\.peer\);[^\n]*\n\s*if \(land\.stage && typeof mapHeldNote === 'function'\) mapHeldNote\(conn, land\.stage\.itemId\);/.test(src) && /sanitizeAppState\(state\.appState, prof\.id, typeof mapHeldOf === 'function' \? mapHeldOf\(conn\) : null\)/.test(src) && /sendFailed\(e, 'snapshot'\);[^\n]*if \(typeof mapForgetConn === 'function'\) mapForgetConn\(conn\.peer\); \}/.test(src)
            && /ensurePlayerToken\(p\.id, stage\.itemId\);\n\s*if \(typeof mapGive === 'function'\) mapGive\(c, stage\.campId, stage\.itemId\);[^\n]*\n\s*if \(c\.open\) \{ try \{ c\.send\(personal \? \{ type: 'stage'/.test(src) && /if \(conn && typeof mapGive === 'function'\) mapGive\(conn, tCamp\.id, pRoom\.targetMapId\);[^\n]*\n\s*if \(conn\) \{ try \{ conn\.send\(\{ type: 'stage', personal: true/.test(src)
            && (src.match(/type: 'stage'/g) || []).length === 3 && /net\.sendItem\(msg\.campId, msg\.itemId, conn\);/.test(has('needitem') ? bw('needitem') : '') && !/conn\.send\(/.test(has('needitem') ? bw('needitem') : 'conn.send(') && (srcNoCm.match(/mapGive\(/g) || []).length === 3 && (srcNoCm.match(/mapStub\(/g) || []).length === 5
            && /not on their machine/.test(html) && /id="ctxLockItem"[^\n]*not on their machine/.test(html) && /<li>A map they have not reached, locked or not, is likewise not on their machine\./.test(html));
    }
    // (11) the take-back (the owner's ruling of 2026-10-01): a map a player leaves is taken back from that connection — the host forgets it for the
    // connection and sends one word, the player's app puts the stub back — and it is given whole again when they return
    {
        const W = mkW(); Object.assign(W.camp.items.mA.meta, { playerLock: true, parentId: 'mC', sortIndex: 1 }); delete W.camp.items.mB.meta.playerLock;
        W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.clear();
        W.camp.items.mA.whiteboard[0].x = 300; W.camp.items.mA.whiteboard[0].y = 300;   // Ana stands on the door
        const own0 = [W.api.travel(W.a1, W.net.roster.pA1, W.camp.items.mA.whiteboard[3], W.camp.items.mA), W.a1.sent.filter(m => m.type === 'travelDenied').map(m => m.reason), W.net.roster.pA1.location, W.held(W.a1, 'mA')]; W.clear();   // mA is locked for players — closed both ways: her own request is refused, and she still holds the map
        const went = W.api.travel(W.a1, W.net.roster.pA1, W.camp.items.mA.whiteboard[3], W.camp.items.mA, true);   // the GM's own hand sends her through
        const a1T = W.types(W.a1), back = W.a1.sent.filter(m => m.type === 'mapBack'), stubA = STUB('mA', 'The mA', { playerLock: true, parentId: 'mC', sortIndex: 1 });
        check('possession (take-back): Ana is sent from mA to mB through a portal by the GM\'s own hand (hostTravel, run for real; mA is locked for players, closed both ways, so her own request is refused first and takes nothing back) — after mB is given whole and her stage word sent, her connection gets one take-back word for mA; her page then holds mA as its stub (its title, its lock, its nesting; nothing on it) and mB whole, and the record no longer names mA for her connection; her other connection and Bo, still on mA, keep it whole and are sent no take-back; her page asks for nothing',
            J(own0) === J([false, ['here'], 'mA', true]) && went === true && J(a1T.slice(-3)) === J(['item:mB', 'stage', 'mapBack:mA']) && back.length === 1 && J(W.a1.page.map('mA')) === J(stubA) && J(W.a1.page.map('mB')) === J(W.cleanOf('mB')) && W.held(W.a1, 'mA') === false && W.held(W.a1, 'mB') === true
            && [W.a2, W.b1].every(c => W.held(c, 'mA') === true && !c.sent.some(m => m.type === 'mapBack') && J(c.page.map('mA')) === J(W.cleanOf('mA'))) && W.a1.page.asked.length === 0, J([went, a1T, W.a1.page.map('mA')]));
        check('possession (take-back): the take-back word carries nothing of the map — its type, the campaign, the map\'s id and the stub\'s meta (title, lock, nesting, sort order) and no key besides: no item, no piece, no room, no link, no fog',
            back.length === 1 && J(back[0]) === J({ type: 'mapBack', campId: 'k', itemId: 'mA', meta: { title: 'The mA', playerLock: true, parentId: 'mC', sortIndex: 1 } }) && !/SENTINEL_BEAST_A|beast|door|whiteboard|rooms|links|fog|gridType/.test(J(back[0])), J(back));
        W.clear(); W.camp.items.mA.whiteboard[2].x = 777; W.net.sendItem('k', 'mA');
        W.api.relay({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'beast', x: 5, y: 6, rot: 0, front: 0, final: true }, null, W.camp, W.camp.items.mA, W.camp.items.mA.whiteboard[2]);
        W.api.needItem({ type: 'needItem', campId: 'k', itemId: 'mA' }, W.a1);
        const later = { a1: W.types(W.a1), a2: W.types(W.a2), b: W.types(W.b1), bPage: J(W.b1.page.map('mA')) === J(W.cleanOf('mA')), aPage: J(W.a1.page.map('mA')) === J(stubA), asked: W.a1.page.asked.length + W.b1.page.asked.length };
        W.clear(); W.net.pushItems(['mA']); const pushed = { a1: W.a1.sent.map(m => m.type + ':' + J(m.item)), b: W.types(W.b1) };
        check('possession (take-back): a later change on mA sends her connection nothing — no delta, no copy, no live position, and its ask for the whole map is refused (the needItem branch, sendItem\'s own gate) — while Bo and her other connection, still on mA, get the delta (Bo\'s page equal to the host\'s copy) and the position; a push of mA reaches her as its stub afresh alone',
            J(later) === J({ a1: [], a2: ['itemDelta:mA', 'pos:mA'], b: ['itemDelta:mA', 'pos:mA'], bPage: true, aPage: true, asked: 0 }) && J(pushed) === J({ a1: ['item:' + J(stubA)], b: ['item:mA'] }), J([later, pushed]));
        // (b) she returns: given whole again before the stage word, held again, deltas flow again; and a second time
        W.clear(); const ret = W.net.summonPlayerToMap('u_a', 'mA');
        const rT = W.types(W.a1), rPage = [J(W.a1.page.map('mA')) === J(W.cleanOf('mA')), 'stub' in W.a1.page.map('mA'), J(W.a1.page.map('mB')) === J(STUB('mB', 'The mB', { parentId: 'mA', sortIndex: 2 }))], rHeld = [W.held(W.a1, 'mA'), W.held(W.a1, 'mB')];
        W.clear(); W.camp.items.mA.whiteboard[2].y = 888; W.net.sendItem('k', 'mA');
        const rDelta = { a1: W.types(W.a1), b: W.types(W.b1), eq: J(W.a1.page.map('mA')) === J(W.cleanOf('mA')), asked: W.a1.page.asked.length };
        W.clear(); W.net.summonPlayerToMap('u_a', 'mB'); const again = { t: W.types(W.a1), held: [W.held(W.a1, 'mA'), W.held(W.a1, 'mB')], pages: [J(W.a1.page.map('mA')) === J(stubA), J(W.a1.page.map('mB')) === J(W.cleanOf('mB'))] };
        check('possession (take-back): she returns (summoned to mA, stageConn run for real) — mA is given whole again before her stage word (the host\'s copy, no stub mark) and held again, mB is taken back in its turn (her page holds its stub), and the next change on mA reaches her as a delta that fits (her page equal to the host\'s copy, nothing asked); leaving a second time takes it back again and gives mB whole again',
            ret === true && J(rT) === J(['item:mA', 'stage', 'mapBack:mB']) && J(rPage) === J([true, false, true]) && J(rHeld) === J([true, false]) && J(rDelta) === J({ a1: ['itemDelta:mA'], b: ['itemDelta:mA'], eq: true, asked: 0 })
            && J(again) === J({ t: ['item:mB', 'stage', 'mapBack:mA'], held: [false, true], pages: [true, true] }), J([ret, rT, rPage, rHeld, rDelta, again]));
    }
    // (11c) the drop: a player's own token dropped on a portal travels through the real pos gate — the take-back follows the same order, and
    // nothing the gate or its timers send afterwards names the map for that connection
    {
        const W = mkW(); delete W.camp.items.mB.meta.playerLock; W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.clear();
        const tA = W.camp.items.mA.whiteboard[0], door = W.camp.items.mA.whiteboard[3];
        W.net.tokenDropped = (item, map) => item === tA && map === W.camp.items.mA ? W.api.travel(W.a1, W.net.roster.pA1, door, map) : false;   // as net.tokenDropped: the dropper's connection, the portal under the token
        if (W.api.posIn) W.api.posIn({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tA', x: 300, y: 300, rot: 0, front: 0, final: true, a: 3 }, W.a1);
        W.timers.slice().forEach(t => { if (t.fn) { const f = t.fn; t.fn = null; f(); } });   // whatever the drop armed (the save, the room check, a catch-up)
        const a1T = W.types(W.a1), backAt = a1T.indexOf('mapBack:mA'), onDoor = tA.x < door.x + door.w && tA.x + tA.w > door.x && tA.y < door.y + door.h && tA.y + tA.h > door.y;
        const drop = { tail: a1T.slice(Math.max(0, backAt - 2), backAt + 1), backs: a1T.filter(t => t === 'mapBack:mA').length, after: backAt >= 0 ? a1T.slice(backAt + 1).filter(t => /:mA$/.test(t)) : ['none'], held: [W.held(W.a1, 'mA'), W.held(W.a1, 'mB')], page: [J(W.a1.page.map('mA')) === J(STUB('mA', 'The mA')), J(W.a1.page.map('mB')) === J(W.cleanOf('mB'))], loc: W.net.roster.pA1.location, onDoor,
            others: [W.a2, W.b1].map(c => [c.sent.some(m => m.type === 'pos' && m.itemId === 'mA' && m.wbId === 'tA'), c.sent.some(m => m.type === 'mapBack'), W.held(c, 'mA'), J(c.page.map('mA')) === J(W.cleanOf('mA'))]) };
        W.clear(); const stood = [tA.x, tA.y];
        if (W.api.posIn) W.api.posIn({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tA', x: 400, y: 400, rot: 0, front: 0, final: true, a: 4 }, W.a1);   // her app's late move on the map she left
        const late = { moved: tA.x !== stood[0] || tA.y !== stood[1], sent: W.ev.filter(e => !/^roster/.test(e)) };
        check('possession (take-back): a drop of her own token on the portal, through the real pos gate (handlePos, then hostTravel as net.tokenDropped calls it), takes mA back in the same order — mB whole, her stage word, then one take-back word — and nothing the gate or its timers send afterwards names mA for her connection; her token is left beside the door on the host\'s map, her other window and Bo see the move and keep mA whole (pages equal to the host\'s copy); a late move of hers on mA, the map she left, moves nothing and is sent to no one',
            !!W.api.posIn && J(drop) === J({ tail: ['item:mB', 'stage', 'mapBack:mA'], backs: 1, after: [], held: [false, true], page: [true, true], loc: 'mB', onDoor: false, others: [[true, false, true, true], [true, false, true, true]] }) && J(late) === J({ moved: false, sent: [] }), J([a1T, drop, late]));
    }
    // (12) the GM's stage moving the table takes the map back from every connection it moved, never from a wanderer it left behind
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.net.roster.pB.detached = true; W.clear();
        const moved = W.api.follow ? W.api.follow({ campId: 'k', itemId: 'mC' }) : -1;
        const per = [W.a1, W.a2].map(c => { const t = W.types(c), whole = c.sent.findIndex(m => m.type === 'item' && m.itemId === 'mC' && m.item.stub !== true); return { backs: t.filter(x => /^mapBack/.test(x)), order: whole >= 0 && t.indexOf('stage') > whole && t.indexOf('mapBack:mA') > t.indexOf('stage'), held: [W.held(c, 'mA'), W.held(c, 'mC')], pages: [J(c.page.map('mA')) === J(STUB('mA', 'The mA')), J(c.page.map('mC')) === J(W.cleanOf('mC'))] }; });
        const stay = { backs: W.b1.sent.filter(m => m.type === 'mapBack').length, held: [W.held(W.b1, 'mA'), W.held(W.b1, 'mC')], page: [J(W.b1.page.map('mA')) === J(W.cleanOf('mA')), W.b1.page.map('mC').stub === true] };
        W.clear(); W.camp.items.mA.whiteboard[2].x = 912; W.net.sendItem('k', 'mA'); const after = [W.types(W.a1), W.types(W.a2), W.types(W.b1).length];
        check('possession (take-back): the GM\'s stage moving the table from mA to mC (followConns, stageConn, run for real) gives each connection it moved mC whole, then its stage word, then takes mA back (each page holds mA\'s stub and mC as the host\'s copy; the record names mC alone); Bo, a wanderer the stage left behind, keeps mA whole and is sent no take-back; the waiting peer and a closed connection are sent nothing; a change on mA then reaches Bo alone',
            moved === 3 && per.every(p => J(p) === J({ backs: ['mapBack:mA'], order: true, held: [false, true], pages: [true, true] })) && J(stay) === J({ backs: 0, held: [true, false], page: [true, true] }) && W.w1.sent.length === 0 && W.c1.sent.length === 0 && J(after) === J([[], [], 1]), J([moved, per, stay, after]));
    }
    // (13) per connection: a player's second window on the same map keeps it when the first leaves; a stage that gives no map takes nothing back
    {
        const W = mkW(); delete W.camp.items.mB.meta.playerLock; W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA'); W.clear();
        W.net.summonPlayerToMap('u_a', 'mB');   // her first connection alone
        const first = { a1: [W.held(W.a1, 'mA'), W.held(W.a1, 'mB')], a2: [W.held(W.a2, 'mA'), W.held(W.a2, 'mB')], a2Sent: W.types(W.a2), a2Page: J(W.a2.page.map('mA')) === J(W.cleanOf('mA')), loc: [W.net.roster.pA1.location, W.net.roster.pA2.location] };
        W.clear(); W.camp.items.mA.whiteboard[2].x = 640; W.net.sendItem('k', 'mA'); const chg = { a1: W.types(W.a1), a2: W.types(W.a2).length, eq: J(W.a2.page.map('mA')) === J(W.cleanOf('mA')) };
        W.clear(); W.api.stageConn(W.a2, { campId: 'k', itemId: 'mB' }, true);
        const second = { a2: W.types(W.a2), held: [W.held(W.a2, 'mA'), W.held(W.a2, 'mB')], page: J(W.a2.page.map('mA')) === J(STUB('mA', 'The mA')) };
        check('possession (take-back): per connection — Ana\'s first window is summoned to mB and loses mA; her second window, still on mA, keeps it whole, is sent no take-back and still gets its changes; when that window is moved too it loses mA in its turn (mB whole, the stage word, then the take-back)',
            J(first) === J({ a1: [false, true], a2: [true, false], a2Sent: [], a2Page: true, loc: ['mB', 'mA'] }) && J(chg) === J({ a1: [], a2: 1, eq: true }) && J(second) === J({ a2: ['item:mB', 'stage', 'mapBack:mA'], held: [false, true], page: true }), J([first, chg, second]));
        W.clear(); W.api.stageConn(W.b1, { campId: 'k', itemId: 'dD' }, true); W.api.stageConn(W.b1, { campId: 'k', itemId: 'nope' }, true);
        const noGive = { b: W.types(W.b1), held: W.held(W.b1, 'mA'), stub: 'stub' in W.b1.page.map('mA') };
        const lone = mkW(); lone.join(lone.a1, 'mA'); lone.clear();
        const none = [lone.api.left ? lone.api.left(lone.a1, 'k') : -1, lone.api.take ? lone.api.take(lone.a1, 'k', 'mB') : null, lone.api.take ? lone.api.take(lone.w1, 'k', 'mA') : null, lone.api.take ? lone.api.take(null, 'k', 'mA') : null, lone.held(lone.a1, 'mA'), lone.a1.sent.length + lone.w1.sent.length];
        check('possession (take-back): a stage that could give no map (it names a page, or nothing) takes nothing back — the connection keeps the map its screen shows; a connection on the one map it holds loses nothing, and a take-back of a map a connection does not hold (a stub, a waiting peer, no connection) does nothing and sends nothing',
            J(noGive) === J({ b: ['stage', 'stage'], held: true, stub: false }) && J(none) === J([0, false, false, false, true, 0]), J([noGive, none]));
    }
    // (14) a fogged map is taken back the same way: what the host knew of that copy is forgotten, and it comes back whole through the player's own fog
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.b1, 'mA'); W.net.summonPlayerToMap('u_a', 'mF'); const rec0 = Object.keys(W.api.fogHeld().pA1 || {});
        W.net.summonPlayerToMap('u_a', 'mA'); const rec1 = Object.keys(W.api.fogHeld().pA1 || {}), pageF = J(W.a1.page.map('mF'));
        W.clear(); W.camp.items.mF.whiteboard[1].x = 250;   // the orc steps into what would be her sight
        W.api.arm('mF'); W.fire(150); const cu = W.api.catchUp(W.a1, W.camp, W.camp.items.mF, 'u_a', Object.create(null)); W.net.sendItem('k', 'mF');
        W.api.relay({ type: 'pos', campId: 'k', itemId: 'mF', wbId: 'orcF', x: 250, y: 100, rot: 0, front: 0, final: true }, null, W.camp, W.camp.items.mF, W.camp.items.mF.whiteboard[1]);
        const quiet = W.ev.slice();
        W.clear(); W.net.summonPlayerToMap('u_a', 'mF'); const backT = W.types(W.a1), backItem = W.a1.sent.find(m => m.type === 'item' && m.itemId === 'mF'), rec2 = Object.keys(W.api.fogHeld().pA1 || {});
        check('possession (take-back): a fogged map is taken back the same way — the host forgets what her copy of it held (the fog record), her page holds its stub with none of the fog\'s notes, and no catch-up, whole re-send or live position of it reaches her connection (the real fogCatchUp says false); when she returns it is given whole again through her own fog (the orc, now in her sight, on it), recorded afresh, before her stage word',
            J(rec0) === J(['mF']) && J(rec1) === J([]) && pageF === J(STUB('mF', 'The mF', { sortIndex: 4 })) && cu === false && J(quiet) === J([]) && J(backT) === J(['item:mF', 'stage', 'mapBack:mA']) && !!backItem && J(backItem.item.whiteboard.map(w => w.id)) === J(['tAf', 'orcF']) && J(rec2) === J(['mF']) && W.held(W.a1, 'mF') === true && W.held(W.a1, 'mA') === false,
            J([rec0, rec1, pageF, cu, quiet, backT, rec2]));
    }
    // (14b) the drawings of theirs the GM hid on a map they leave are forgotten with their copy, and noted afresh when the map is given again
    {
        const W = mkW(); W.camp.items.mA.whiteboard.push({ id: 'strA', type: 'path', byPlayer: true, ownerId: 'u_a', hidden: true, pts: [[0, 0], [5, 5]], x: 0, y: 0, w: 5, h: 5 });
        W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.net.sendItem('k', 'mA');
        const p0 = [J(W.api.pend('pA1', 'mA')), J(W.api.pend('pA2', 'mA'))];
        W.net.summonPlayerToMap('u_a', 'mC'); const p1 = [J(W.api.pend('pA1', 'mA')), J(W.api.pend('pA2', 'mA'))];
        W.net.summonPlayerToMap('u_a', 'mA'); const p2 = [J(W.api.pend('pA1', 'mA')), W.a1.page.map('mA').whiteboard.some(w => w.id === 'strA')];
        check('possession (take-back): the host\'s note of a drawing of hers the GM hid on mA goes with her copy when she leaves (her other window, still there, keeps its own) and is made afresh when mA is given whole again — the hidden drawing itself on no copy',
            J(p0) === J(['{"strA":1}', '{"strA":1}']) && J(p1) === J(['null', '{"strA":1}']) && J(p2) === J(['{"strA":1}', false]), J([p0, p1, p2]));
    }
    // (14c) a note of a hidden drawing is kept only for a connection holding the map whole: none comes back while its player is away, so a drawing
    // the GM hid and showed again meanwhile is theirs to erase at once when they return
    {
        const W = mkW(), strA = { id: 'strA', type: 'path', byPlayer: true, ownerId: 'u_a', hidden: true, pts: [[0, 0], [5, 5]], x: 0, y: 0, w: 5, h: 5 }; W.camp.items.mA.whiteboard.push(strA);
        W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.net.sendItem('k', 'mA');
        W.net.summonPlayerToMap('u_a', 'mC');   // her first window leaves mA
        W.camp.items.mA.whiteboard[2].x = 321; W.net.sendItem('k', 'mA'); W.net.pushItems(['mA']);   // the GM works on mA while she is away, the drawing still hidden
        const away = [J(W.api.pend('pA1', 'mA')), J(W.api.pend('pA2', 'mA'))];
        delete strA.hidden; W.net.sendItem('k', 'mA');   // the GM shows it again: her other window gets it
        W.net.summonPlayerToMap('u_a', 'mA');   // she returns: the whole map, the shown drawing on it
        const back = [J(W.api.pend('pA1', 'mA')), W.a1.page.map('mA').whiteboard.some(w => w.id === 'strA')];
        const copy = JSON.parse(J(W.a1.page.map('mA'))); copy.whiteboard = copy.whiteboard.filter(w => w.id !== 'strA');   // her first copy after returning: she erased it
        const out = { conn: W.a1 }, changed = W.api.patchIn ? W.api.patchIn({ type: 'item', campId: 'k', itemId: 'mA', item: copy }, W.net.roster.pA1, out) : null;
        const erased = { changed, whole: out.whole === true, onHost: W.camp.items.mA.whiteboard.some(w => w.id === 'strA') };
        check('possession (take-back): the host\'s note of a hidden drawing is kept only for a connection holding the map whole — while she is away no send or push of mA notes it again for the connection that left (her other window, still there, keeps its note) — so a drawing of hers the GM hid and showed again while she was away is on the whole map she gets back with no note left, and her first copy without it erases it at once (no whole map sent back to put it right)',
            J(away) === J(['null', '{"strA":1}']) && J(back) === J(['null', true]) && J(erased) === J({ changed: true, whole: false, onHost: false }), J([away, back, erased]));
    }
    // (15) the player's side, run for real: the word from the synced host alone, for a map this copy holds, and nothing of the word but its cleaned meta
    {
        const wholeA = () => ({ id: 'mA', type: 'map', meta: { title: 'The mA', playerLock: true, parentId: 'mC', sortIndex: 1, gridType: 'square' }, rooms: [{ id: 'r1', name: 'Hall' }], links: [['r1', 'r1']], cats: { c: { color: '#ffffff' } }, fog: { on: true }, fogLit: ['1,1'], fogMarks: [{ c: '2,2', g: 1 }], fogOff: { tA: ['s'] }, lightsCapped: true,
            whiteboard: [{ id: 'tA', type: 'image', isChar: true, ownerId: 'u_a', x: 1, y: 1, w: 50, h: 50 }, { id: 'beast', type: 'image', name: 'SENTINEL_BEAST_A', x: 5, y: 5, w: 50, h: 50 }] });
        const mk = active => { const pg = mkPage('u_a', active || 'mB'); pg.camp.items.mA = wholeA(); pg.camp.items.mB = { id: 'mB', type: 'map', meta: { title: 'The mB' }, rooms: [], links: [], cats: {}, whiteboard: [{ id: 'noteB', type: 'text', text: 'x', x: 1, y: 1, w: 5, h: 5 }] }; pg.camp.items.dD = { id: 'dD', type: 'doc', meta: { title: 'Page' }, blocks: [] }; return pg; };
        const word = more => Object.assign({ type: 'mapBack', campId: 'k', itemId: 'mA', meta: { title: 'The mA', playerLock: true, parentId: 'mC', sortIndex: 1 } }, more || {});
        const stubA = J(STUB('mA', 'The mA', { playerLock: true, parentId: 'mC', sortIndex: 1 }));
        const run = (pg, m, conn) => { if (pg.P.mapBack) pg.P.mapBack(JSON.parse(J(m)), conn || { peer: 'h' }); return pg; };
        const honest = run(mk(), word()), hOut = { map: J(honest.map('mA')) === stubA, other: honest.map('mB').whiteboard.length, render: honest.cnt.render, nav: honest.cnt.nav, asked: honest.asked.length, remote: honest.net.applyingRemote };
        check('possession (take-back, the player\'s side, run for real): the synced host\'s word puts the stub in the map\'s place — its title, its lock and its place in the Maps list, an empty whiteboard, no rooms, no links, no categories, none of the fog\'s notes (its fog, lit cells, marks, switched-off senses, light cap) — the Maps list is drawn again, the map on screen is left alone, and nothing is asked of the host',
            J(hOut) === J({ map: true, other: 1, render: 0, nav: 1, asked: 0, remote: false }), J([hOut, honest.map('mA')]));
        const before = J(mk().camp.items);
        const other = run(mk(), word(), { peer: 'x' }), own0 = mk(); own0.net.foreign = false; run(own0, word()); const unsynced = mk(); unsynced.net.syncedPeer = null; run(unsynced, word());
        const absent = run(mk(), word({ itemId: 'mZ' })), page = run(mk(), word({ itemId: 'dD' })), camp2 = run(mk(), word({ campId: 'other' }));
        const odd = ['__proto__', 'constructor', 'hasOwnProperty', '', 5, null, undefined, { a: 1 }].map(id => { const pg = mk(); let threw = false; try { run(pg, word({ itemId: id })); } catch (e) { threw = true; } return !threw && J(pg.camp.items) === before && Object.keys(pg.camp.items).length === 3; });
        check('possession (take-back, the player\'s side): a take-back from a connection other than the synced host, before the snapshot or with no synced host changes nothing; one naming a map this copy does not hold adds nothing, one naming a page leaves the page, one naming another campaign or an id that is no key (a prototype\'s name, an empty one, a number, nothing, an object) does nothing and throws nothing',
            has('mapback') && J(honest.map('mA')) === stubA && [other, own0, unsynced, page, camp2].every(pg => J(pg.camp.items) === before && pg.cnt.nav === 0) && J(absent.camp.items) === before && !('mZ' in absent.camp.items) && odd.every(Boolean) && ({}).stub === undefined && ({}).meta === undefined, J([J(other.camp.items) === before, J(own0.camp.items) === before, J(unsynced.camp.items) === before, J(page.camp.items) === before, J(camp2.camp.items) === before, odd]));
        const hostile = run(mk(), word({ meta: { title: 'T'.repeat(500), playerLock: 0, parentId: 7, sortIndex: 'x', bg: 'http://example.invalid/x.png', collapsed: true, lastWbX: 5 }, item: wholeA(), whiteboard: [{ id: 'evil', type: 'text', text: 'SENTINEL_EVIL' }], rooms: [{ id: 'r9' }], links: [[1, 2]], fog: { on: true }, fogLit: ['9,9'], stub: 'no' }));
        const noMeta = [undefined, null, 'x', 7, ['a']].map(mv => J(run(mk(), word({ meta: mv })).map('mA')) === stubA);
        const long = run(mk(), word({ meta: { title: 'ok', parentId: 'p'.repeat(400), sortIndex: Infinity } })).map('mA');
        check('possession (take-back, the player\'s side): whatever else a host puts in the word, the stub is all that is kept — the meta cleaned as the host\'s own stub is made (a title cut to 200, a lock only where it is set, a parent only as a string cut to 160, a sort order only as a finite number, no other key), no item, piece, room, link or fog from the message; a word with no usable meta keeps the copy\'s own title, lock and nesting',
            J(hostile.map('mA')) === J(STUB('mA', 'T'.repeat(200))) && !/SENTINEL_EVIL|evil|example\.invalid|collapsed|lastWbX|fogLit/.test(J(hostile.camp.items)) && noMeta.every(Boolean) && J(long) === J(STUB('mA', 'ok', { parentId: 'p'.repeat(160) })), J([hostile.map('mA').meta.title.length, noMeta, long.meta]));
        const shown = mk('mA'); shown.state.selId = 'r1'; shown.state.selWbId = 'beast'; shown.state.selWbIds = ['beast']; const patchWhole = shown.P.patch ? shown.P.patch() : null; run(shown, word());
        const sOut = { map: J(shown.map('mA')) === stubA, render: shown.cnt.render, sel: [shown.state.selId, shown.state.selWbId, J(shown.state.selWbIds)], asked: shown.asked.length, patch: shown.P.patch ? shown.P.patch() : 'none', whole: !!patchWhole && patchWhole.type === 'item' && patchWhole.itemId === 'mA' };
        check('possession (take-back, the player\'s side): a take-back of the map on screen (no honest host sends one: the stage word comes first) leaves its stub on screen — drawn again, the selection dropped, nothing asked — and a player\'s app sends no copy of a stub as its own (activeItemPatch: the host would read a copy with nothing on it as their drawings erased), while a map held whole is still sent',
            J(sOut) === J({ map: true, render: 1, sel: [null, null, '[]'], asked: 0, patch: null, whole: true }), J(sOut));
        // the stub still names the map in the Maps list and at a portal's hover: the sidebar's row and the hover's line, sliced and run on the stub
        const rd9 = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n'), sb9 = rd9('sidebar.js'), wb9 = rd9('whiteboard.js');
        const escT = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const rowI = sb9.indexOf('function rowHtml(item, depth, hasKids, collapsed) {'), rowE = sb9.indexOf('// Both lists render as nested trees', rowI);
        const hvI = wb9.indexOf('var destTT = r.targetMapId && getActiveCampaign()'), hvE = wb9.indexOf('\n', wb9.indexOf('var destLine = destTT ?', hvI));
        let row = '', hover = '', stubTitle = null;
        try {
            const st = honest.map('mA'); stubTitle = st.stub === true ? st.meta.title : null;
            row = new Function('camp', 'esc', 'mapPresenceHtml', sb9.slice(rowI, rowE) + '\nreturn rowHtml;')(honest.camp, escT, () => '')(st, 0, false, false);
            hover = new Function('r', 'getActiveCampaign', 'esc', 'isClientTT', wb9.slice(hvI, hvE) + '\nreturn destLine;')({ targetMapId: 'mA' }, () => honest.camp, escT, true);
        } catch (e) { row = 'threw: ' + e.message; }
        check('possession (take-back): the stub a map leaves behind still names it — the Maps list\'s row (sidebar.js rowHtml, sliced and run on the stub) shows its title and its lock badge, and a portal\'s hover (whiteboard.js, its destination line sliced and run) says where it leads and that it is closed for now',
            rowI >= 0 && rowE > rowI && hvI >= 0 && hvE > hvI && stubTitle === 'The mA' && /<span class="si-title">The mA<\/span>/.test(row) && /si-lock/.test(row) && /\u2192 The mA/.test(hover) && /closed for now/.test(hover), J([row.slice(0, 200), hover]));
    }
    // (16) the source: where a roster location is set, and the take-back wired after each stage word; the client's branch; Help and the tooltips
    {
        const srcNoCm = src.replace(/\/\/[^\n]*/g, ''), html = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'), sbSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sidebar.js'), 'utf8');
        const mb = has('mapback') ? bw('mapback') : '';
        check('possession (take-back, source): a roster location is set in three places as before (the join, stageConn, hostTravel — the join\'s snapshot replaces the record, the other two take back after their stage word: mapLeft right after it, three calls with its definition); mapTake forgets the record and the fog record before it sends, and sends the stub\'s meta alone; the mapBack branch is the client\'s, gated by fromHost, builds the stub through mapStub and never from the message\'s own item; no other message of the host\'s carries the word',
            (srcNoCm.match(/\.location = [^=]/g) || []).length === 3
            && /if \(c\.open\) \{ try \{ c\.send\(personal \? \{ type: 'stage', stage: stage, personal: true \} : \{ type: 'stage', stage: stage \}\); \} catch \(e\) \{ sendFailed\(e\); \} \}\n\s*if \(typeof mapLeft === 'function'\) mapLeft\(c, stage\.campId\);/.test(src)
            && /if \(conn\) \{ try \{ conn\.send\(\{ type: 'stage', personal: true, stage: \{[^\n]*\n\s*if \(conn && typeof mapLeft === 'function'\) mapLeft\(conn, tCamp\.id\);/.test(src)
            && (srcNoCm.match(/mapLeft\(/g) || []).length === 3 && require('./checkkit').familyCount('net.js', /(?<!\/\/[^\n]*)mapTake\(/g) === 2 && require('./checkkit').familyCount('net.js', /(?<!\/\/[^\n]*)type: 'mapBack'/g) === 1   /* counted over net.js's whole family outside its comments, as srcNoCm counts */
            && /delete _mapHeld\[conn\.peer\]\[mapId\];\n\s*if \(typeof fogForgetOne === 'function'\) fogForgetOne\(conn\.peer, mapId\);[\s\S]*conn\.send\(\{ type: 'mapBack', campId: campId, itemId: mapId, meta: mapStub\(it\)\.meta \}\)/.test(mhSrc)
            && /\} else if \(msg\.type === 'mapBack' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:mapback-start\]/.test(src) && /if \(!fromHost\(conn\)\) return;/.test(mb) && /mapStub\(\{ id: msg\.itemId, meta: /.test(mb) && !/msg\.item\b(?!Id)/.test(mb) && !/msg\.whiteboard|msg\.rooms/.test(mb));
        check('possession (take-back, words): Help says a map a player leaves is taken back until they return, and the Lock for players tooltip and the Maps list\'s lock badge say a player who is not on a map holds only its name',
            /<li><b>What reaches a player[^\n]*\s*<ul>\s*<li>A map they leave is taken back until they return/.test(html) && /id="ctxLockItem"[^\n]*again once they leave/.test(html) && /si-lock" title="[^"]*A player who is not here holds only its name/.test(sbSrc));
    }
    // (17) H2 (2026-10-01): a map renamed, re-nested or moved in the Maps list while a player is away reaches the connections holding only its stub — as
    // its stub afresh, nothing else of the map — so their Maps list and a portal's hover on another map give its present name
    {
        const W = mkW(); W.join(W.a1, 'mA'); W.join(W.a2, 'mA'); W.join(W.b1, 'mA');
        const sync = () => (W.net.syncMapStubs ? W.net.syncMapStubs() : null), seen = () => { if (W.api.stubSync) W.api.stubSync(W.camp, false); };
        seen();                                                   // as admitPlayer reads every stub at each admission
        W.net.summonPlayerToMap('u_b', 'mC'); seen(); W.camp.activeItemId = 'mC'; W.clear();   // Bo is away on mC, where the GM is too; Ana's two connections are on mA
        const idle = sync(), idleOut = W.ev.slice();
        W.camp.items.mA.meta.title = 'Harbor, renamed'; const ch1 = sync();
        const bo1 = W.b1.sent.slice(), boPage1 = J(W.b1.page.map('mA')), anaGot = [W.a1, W.a2].map(c => W.types(c)), anaPages = [W.a1, W.a2].map(c => J(c.page.map('mA')) === J(W.cleanOf('mA')) && c.page.map('mA').meta.title === 'Harbor, renamed' && c.page.asked.length === 0);
        W.clear(); const again = sync(), againOut = W.ev.slice();
        W.net.roster.pA2.location = 'dD'; W.camp.items.mA.meta.title = 'Harbor, renamed twice'; const chP = sync();   // Ana's second window was put on a page: it still holds mA whole (nothing was taken back), though it is not "on" it
        const heldOff = [chP, W.a2.sent.length, W.a2.sent.every(m => (m.type === 'item' || m.type === 'itemDelta') && m.itemId === 'mA' && !(m.item && m.item.stub === true)), !('stub' in W.a2.page.map('mA')) && W.a2.page.map('mA').meta.title === 'Harbor, renamed twice', W.a2.page.asked.length, J(W.b1.page.map('mA')) === J(STUB('mA', 'Harbor, renamed twice'))];
        W.net.roster.pA2.location = 'mA'; W.clear();
        W.camp.items.mC.meta.parentId = 'mA'; const ch2 = sync(), out2 = W.ev.slice(), anaC = J(W.a1.page.map('mC'));   // re-nested: Ana holds mC's stub; Bo holds it whole and the GM is on it (the save itself sends that map)
        W.clear(); W.camp.items.mB.meta.sortIndex = 9; const ch3 = sync(), out3 = W.ev.slice(), stubB = J(W.b1.page.map('mB'));
        W.clear(); W.camp.items.mN = M('mN', [{ id: 'noteN', type: 'text', text: 'SENTINEL_TEXT_N', x: 1, y: 1, w: 10, h: 10 }], { sortIndex: 7 }); const ch4 = sync(), out4 = W.ev.slice(), stubN = [W.a1, W.b1].map(c => J(c.page.map('mN')));
        const leak4 = [W.a1, W.a2, W.b1].some(c => W.leak(c, /SENTINEL_TEXT_N|noteN/)), saidOf = () => (W.api.stubSaid && W.api.stubSaid()) || null, saidN = !!(saidOf() && saidOf().mN);
        W.clear(); delete W.camp.items.mN; W.net.itemGone('k', 'mN'); const goneN = !!saidOf() && !saidOf().mN, ch5 = sync();
        const admOrder = (fnSrc('function admitPlayer(', '\n}\n', 'admitPlayer').match(/net\.syncMapStubs\(\)|mapStubSync\(camp, false\)|net\.roster\[conn\.peer\] = prof/g) || []).map(s => (/syncMapStubs/.test(s) ? 'tell' : /mapStubSync/.test(s) ? 'read' : 'roster'));   // what admitPlayer does about the stubs, in its own order, from its source
        W.clear(); W.camp.items.mB.meta.title = 'Vault'; admOrder.forEach(k => { if (k === 'tell') sync(); else if (k === 'read') seen(); });   // a rename whose save had not run yet when a player is admitted
        const admOut = W.ev.slice(), admStub = J(W.a1.page.map('mB')); W.clear(); const afterSeen = sync(), seenOut = W.ev.slice();   // told at the admission, before it reads — and not again
        W.clear(); W.net.role = 'client'; W.camp.items.mB.meta.title = 'Vault 2'; const asClient = sync(); W.net.role = 'host'; W.net.active = false; const offline = sync(); W.net.active = true;
        const quietOut = W.ev.slice(), waiting = W.w1.sent.length + W.c1.sent.length;
        // nobody at the table: a rename is read, not told — and is not told again once someone is; a map nobody holds whole is never copied for it
        const W2 = mkW(), ros2 = W2.net.roster, sent2 = []; W2.net.roster = {}; W2.camp.items.mA.meta.title = 'Renamed with nobody here';
        const sendItem2 = W2.net.sendItem; W2.net.sendItem = function(c, id) { sent2.push(id); return sendItem2.apply(this, arguments); };
        const empty2 = W2.net.syncMapStubs ? W2.net.syncMapStubs() : null, said2 = !!(W2.api.stubSaid && W2.api.stubSaid() && /Renamed with nobody here/.test(String(W2.api.stubSaid().mA)));
        W2.net.roster = ros2; const then2 = W2.net.syncMapStubs ? W2.net.syncMapStubs() : null;
        W2.camp.items.mB.meta.title = 'Vault'; W2.camp.activeItemId = 'mA'; const ch6 = W2.net.syncMapStubs ? W2.net.syncMapStubs() : null;   // mB: held whole by nobody
        const nobody = [empty2, said2, then2, ch6, sent2.slice(), W2.ev.filter(e => !/^p(A1|A2|B):item:mB$/.test(e))];
        check('possession (a fresh stub): a map renamed while a player is away (net.syncMapStubs, run for real at a save of the GM\'s) reaches the connection that holds only its stub as the stub afresh — the new title, its lock and place, nothing of what is on the map, no ack, nothing else sent to it — while the connections holding the map whole get it the usual way, as their own copy (their pages equal to the host\'s copy, nothing asked) — one that holds the map whole without being on it (its stage named a page) too: its copy, never the stub; with nothing changed nothing is sent, twice over',
            J(idle) === J([]) && J(idleOut) === J([]) && J(ch1) === J(['mA']) && bo1.length === 1 && J(bo1[0]) === J({ type: 'item', campId: 'k', itemId: 'mA', item: STUB('mA', 'Harbor, renamed') }) && boPage1 === J(STUB('mA', 'Harbor, renamed')) && !W.leak(W.b1, /SENTINEL_BEAST_A/)
            && anaGot.every(t => t.length === 1 && /^(item|itemDelta):mA$/.test(t[0])) && anaPages.every(Boolean) && J(again) === J([]) && J(againOut) === J([]) && J(heldOff) === J([['mA'], 1, true, true, 0, true]), J([idle, idleOut, ch1, bo1, anaGot, anaPages, again, againOut, heldOff]));
        check('possession (a fresh stub): a map nested under another, one moved in the Maps list and one made since the last admission reach their stub holders the same way — parentId, sortIndex and the lock kept as the stub carries them, a new map as its name alone (nothing drawn on it travels) — never the connection holding the map whole, the waiting peer or a closed connection; a map that is gone is forgotten; a change whose save had not run when a player is admitted is told to the table at that admission — before the newcomer is on the roster and before the stubs are read (admitPlayer\'s own order, read from its source) — and not sent again; a player\'s app and a machine that hosts nothing send nothing; with nobody at the table a change is read and never told later, and a map nobody holds whole is not copied for its rename',
            J(ch2) === J(['mC']) && J(out2) === J(['pA1:item:mC', 'pA2:item:mC']) && anaC === J(STUB('mC', 'The mC', { parentId: 'mA', sortIndex: 3 }))
            && J(ch3) === J(['mB']) && J(out3) === J(['pA1:item:mB', 'pA2:item:mB', 'pB:item:mB']) && stubB === J(STUB('mB', 'The mB', { playerLock: true, parentId: 'mA', sortIndex: 9 }))
            && J(ch4) === J(['mN']) && J(out4) === J(['pA1:item:mN', 'pA2:item:mN', 'pB:item:mN']) && stubN.every(s => s === J(STUB('mN', 'The mN', { sortIndex: 7 }))) && !leak4 && saidN && goneN && J(ch5) === J([])
            && J(admOrder) === J(['tell', 'roster', 'read']) && J(admOut) === J(['pA1:item:mB', 'pA2:item:mB', 'pB:item:mB']) && admStub === J(STUB('mB', 'Vault', { playerLock: true, parentId: 'mA', sortIndex: 9 }))
            && J(afterSeen) === J([]) && J(seenOut) === J([]) && J(asClient) === J([]) && J(offline) === J([]) && J(quietOut) === J([]) && waiting === 0
            && J(nobody) === J([[], true, [], ['mB'], [], []]), J([ch2, out2, ch3, out3, ch4, out4, stubN, leak4, saidN, goneN, ch5, admOrder, admOut, admStub, afterSeen, seenOut, asClient, offline, quietOut, waiting, nobody]));
        const srcNoCm17 = src.replace(/\/\/[^\n]*/g, '');
        check('possession (a fresh stub, source): the GM\'s save runs net.syncMapStubs after the map on screen has gone; admitPlayer reads every stub as its snapshot is made; a push sends the stub through the same one function (mapStubSend — the stub is still made in five places and no more); a new table and a deleted map forget what was said',
            /if \(patch\) net\.sendItem\(patch\.campId, patch\.itemId\);\n\s*if \(net\.syncMapStubs\) net\.syncMapStubs\(\);/.test(src) && /mapHeldNote\(conn, land\.stage\.itemId\);\n\s*if \(camp && typeof mapStubSync === 'function'\) mapStubSync\(camp, false\);/.test(src)
            && /if \(it\.type === 'map' && typeof mapStubSend === 'function' && typeof mapHeld === 'function'\) mapStubSend\(mapStubMsg\(campId, itemId, it\)\);/.test(src) && (srcNoCm17.match(/mapStub\(/g) || []).length === 5 && (srcNoCm17.match(/mapStubSend\(/g) || []).length === 3
            && /function mapForgetAll\(\) \{ _mapHeld = Object\.create\(null\); _stubSaid = Object\.create\(null\); \}/.test(mhSrc) && /delete _stubSaid\[mapId\]/.test(mhSrc));
    }
    // (18) H2 (2026-10-01): a map a player's app holds only as its stub, opened from their own Maps list, says why — one line of plain text on the board
    {
        const whSrc = has('where') ? bw('where') : '';
        const WS = new Function('localStorage', 'crypto', helpersSrc + '\n' + whSrc + '\nreturn { line: typeof stubLine === "function" ? stubLine : null, paint: typeof paintStubLine === "function" ? paintStubLine : null, words: typeof STUB_LINE === "string" ? STUB_LINE : null };')(storage, globalThis.crypto);
        const LINE = 'You are not on this map. It appears when you travel or are summoned there.';
        const player = { role: 'client', active: true, foreign: true, syncedPeer: 'h', stream: false };
        const W = mkW(); W.join(W.b1, 'mA'); const pc = W.b1.page.camp;   // Bo's page after the real snapshot: mA whole, every other map its stub
        const at = (n, id, camp) => { const c = camp === undefined ? pc : camp; if (c && id !== undefined) c.activeItemId = id; return WS.line ? WS.line(n, c) : null; };
        const never = [at(player, 'mA'), at(player, 'mB'), at(player, 'mC'), at(player, 'mF'), at(player, 'dD'), at(player, 'nope')];
        W.net.summonPlayerToMap('u_b', 'mC'); const left = [at(player, 'mA'), at(player, 'mC')];   // he left mA: its stub; mC arrived whole
        W.net.summonPlayerToMap('u_b', 'mA'); const back = [at(player, 'mA'), at(player, 'mC')];   // and back: mA whole again, mC taken back
        const others = [at({ role: 'host', active: true, foreign: true, stream: false }, 'mC'), at({ role: 'client', active: true, foreign: false, stream: false }, 'mC'), at({ role: 'client', active: false, foreign: true, stream: false }, 'mC'), at({ role: null, active: false, foreign: false }, 'mC'), at(Object.assign({}, player, { stream: true }), 'mC'), at(null, 'mC')];
        const odd = [at(player, undefined, null), at(player, undefined, {}), at(player, undefined, { items: null }), at(player, undefined, { activeItemId: 'constructor', items: {} }), at(player, undefined, { activeItemId: 'm', items: { m: { type: 'map', stub: 1 } } }), at(player, undefined, { activeItemId: 'm', items: { m: { type: 'doc', stub: true } } }), at(player, undefined, { activeItemId: 'm', items: { m: 'stub' } })];
        const log = [], box = { classes: new Set() };
        Object.defineProperty(box, 'textContent', { set(v) { log.push(['text', String(v)]); }, get() { return ''; } });
        ['innerHTML', 'outerHTML'].forEach(k => Object.defineProperty(box, k, { set(v) { log.push(['markup', k]); }, get() { return ''; } }));
        box.insertAdjacentHTML = () => log.push(['markup', 'insertAdjacentHTML']); box.setAttribute = (k, v) => log.push(['attr', k]); box.appendChild = () => log.push(['child']);
        box.classList = { toggle: (c, on) => { if (on) box.classes.add(c); else box.classes.delete(c); log.push(['class', c, !!on]); } };
        if (WS.paint) { WS.paint(box, LINE); WS.paint(box, ''); }
        const html18 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n'), css18 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8').replace(/\r\n/g, '\n');
        check('possession (the stub\'s line, the real stubLine run on a player\'s real copy): a map this player\'s app holds only as its stub — never reached (locked or not, fogged or not) or left — reads "You are not on this map. It appears when you travel or are summoned there."; the map they are on, a map that has arrived whole (a summon there and back), a page and no map at all read nothing',
            WS.words === LINE && J(never) === J(['', LINE, LINE, LINE, '', '']) && J(left) === J([LINE, '']) && J(back) === J(['', LINE]), J([WS.words, never, left, back]));
        check('possession (the stub\'s line): only on a player\'s app at a table — never the GM\'s (a host), never offline (this machine\'s own campaign, or no session), never the stream window — and never for a copy of an odd shape (no campaign, no items, a prototype\'s name, a stub mark that is not true, a page marked stub)',
            others.every(v => v === '') && others.length === 6 && odd.every(v => v === '') && odd.length === 7, J([others, odd]));
        check('possession (the stub\'s line, on the page): it is painted as text alone (textContent and a class — no markup, no attribute, no child) into an element of its own over the map area (a child of #main, which does not scroll — beside the zoom box, outside the board and its scrolling wrapper, so it stays in view wherever the board is panned) that takes no pointer events and shows only on a player\'s app; renderWhere paints it at every render, before the top bar\'s own early returns, so it is gone the moment the map arrives whole; Help says it where possession is described',
            J(log) === J([['text', LINE], ['class', 'on', true], ['text', ''], ['class', 'on', false]])
            && /function renderWhere\(\) \{\n[^\n]*fxClockStart\(\);[^\n]*\n\s*renderStubLine\(\);/.test(src) && /function renderStubLine\(\) \{ var box = ui\('wbStubNote'\), t = box \? stubLine\(net, campOf\(state\.appState && state\.appState\.activeCampaignId\)\) : ''; if \(!box \|\| t === _stubKey\) return; _stubKey = t; paintStubLine\(box, t\); \}/.test(src)
            && /\n      <div id="wbStubNote" role="status"><\/div>\n      <div id="zoomBox">/.test(html18) && html18.indexOf('<div id="main" class="main">') >= 0 && html18.indexOf('<div id="main" class="main">') < html18.indexOf('<div id="wbStubNote"') && html18.indexOf('<div id="wbStubNote"') < html18.indexOf('<div id="whiteboardWrap">') && (html18.match(/id="wbStubNote"/g) || []).length === 1 && /\n\s*#main \{ display: flex; flex: 1; overflow: hidden; position: relative; \}/.test(css18)
            && /\n\s*#wbStubNote \{ display: none; position: absolute;[^}\n]*pointer-events: none;[^}\n]*\}/.test(css18) && /\n\s*body\.net-client #wbStubNote\.on \{ display: block; \}/.test(css18) && !/#wbStubNote[^{\n]*\{[^}]*[{;\s]content\s*:/.test(css18)
            && /<li>If their screen ever shows such a map, the board says so in one line: they are not on it, and it appears when they travel or are summoned there\.<\/li>/.test(html18), J(log));
    }
})());

// The patch gate and the delta between two copies (applyClientItemFiltered with playerStroke and strokeActs, itemDelta and
// applyItemDelta: netfog.js, read by its own name), the blocks as they stood in netcheck.js, moved with their area (the review of next area 6).
// the patch gate: own keys only, and a token (or a stroke) the GM locked is frozen for its player
{
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js');
    const cleanersSrc = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
    const stroke = (w, pid) => (w && w.type === 'path' && w.ownerId === pid && Array.isArray(w.pts)) ? { id: w.id, type: 'path', byPlayer: true, ownerId: pid, pts: w.pts, x: w.x || 0, y: w.y || 0 } : null;
    const coreP = { ownPostures: () => true, postureAt: (sys, v) => ({ i: v === 'kneeling' ? 1 : 0, p: { id: v === 'kneeling' ? v : 'standing' } }) };   // 1.6.0: a system's own list stands in (none is a default)
    const runPatch = (camps, msg) => { try { return new Function('state', 'window', 'playerStroke', 'msg', 'prof', cleanersSrc + ownKeySrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true }, wpSystemCore: coreP }, stroke, msg, { id: 'u_p' }); } catch (e) { return 'threw: ' + e.message; } };
    const mk = () => ({ c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [
        { id: 't1', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0 },
        { id: 't2', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, locked: true },
        { id: 's1', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [1, 1]], x: 0, y: 0, locked: true },
        { id: 's2', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [2, 2]], x: 0, y: 0 }] } } } });
    const moveAll = { campId: 'c1', itemId: 'm1', item: { whiteboard: [
        { id: 't1', x: 40, y: 50, rot: 90, front: 45, posture: 'kneeling', elevation: 2 },
        { id: 't2', x: 40, y: 50, rot: 90, front: 45, posture: 'kneeling', elevation: 2 }] } };
    const cs = mk(), chg = runPatch(cs, moveAll), wb = cs.c1.items.m1.whiteboard, byId = id => wb.find(w => w.id === id);
    check('patch (host): a player\'s own unlocked token moves, turns and takes its stance; their token the GM LOCKED is frozen — no move, turn, facing, posture or elevation',
        chg === true && byId('t1').x === 40 && byId('t1').front === 45 && byId('t1').posture === 'kneeling' && byId('t1').elevation === 2
        && j(byId('t2')) === j({ id: 't2', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, locked: true }), j([chg, wb]));
    const csW = mk(); csW.c1.items.m1.whiteboard.push({ id: 'wt', waiting: 1, ownerId: 'u_p', x: 0, y: 0 }, { id: 'wo', waiting: 1, ownerId: 'u_q', x: 0, y: 0 });
    const chgW = runPatch(csW, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'wt', x: 40, y: 50, rot: 90, front: 45, posture: 'kneeling', elevation: 2 }, { id: 'wo', x: 40, y: 50 }] } }), byW = id => csW.c1.items.m1.whiteboard.find(w => w.id === id);
    check('patch (F1a): a player\'s own WAITING token takes a move and nothing else — no turn, facing, posture or elevation; another player\'s never moves',
        chgW === true && j(byW('wt')) === j({ id: 'wt', waiting: 1, ownerId: 'u_p', x: 40, y: 50 }) && j(byW('wo')) === j({ id: 'wo', waiting: 1, ownerId: 'u_q', x: 0, y: 0 }), j([chgW, byW('wt'), byW('wo')]));
    check('patch (host): a drawing the GM locked is not erased by leaving it out of a patch (an unlocked one still is), nor redrawn',
        !!byId('s1') && !byId('s2') && j(byId('s1').pts) === '[[0,0],[1,1]]', j(wb.map(w => w.id)));
    const cs2 = mk(), redraw = runPatch(cs2, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 's1', type: 'path', ownerId: 'u_p', pts: [[5, 5], [9, 9]] }, { id: 's2', type: 'path', ownerId: 'u_p', pts: [[0, 0], [2, 2]] }] } });
    check('patch (host): a locked stroke\'s new points are refused', j(cs2.c1.items.m1.whiteboard.find(w => w.id === 's1').pts) === '[[0,0],[1,1]]', j([redraw, cs2.c1.items.m1.whiteboard]));
    const csH = mk(); csH.c1.items.m1.whiteboard.push({ id: 's3', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [3, 3]], x: 0, y: 0, hidden: true }, { id: 't3', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, hidden: true }, { id: 's5', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [5, 5]], x: 0, y: 0, hidden: 1 });
    const heldH = [{ id: 't1', x: 0, y: 0, rot: 0, front: 0 }, { id: 't2', x: 0, y: 0 }, { id: 's1', type: 'path', ownerId: 'u_p', pts: [[0, 0], [1, 1]] }, { id: 's2', type: 'path', ownerId: 'u_p', pts: [[0, 0], [2, 2]] }], hb = id => csH.c1.items.m1.whiteboard.find(w => w.id === id);
    runPatch(csH, { campId: 'c1', itemId: 'm1', item: { whiteboard: heldH } }); const afterOut = [!!hb('s3'), !!hb('s2'), !!hb('t3'), !!hb('s5')];
    runPatch(csH, { campId: 'c1', itemId: 'm1', item: { whiteboard: heldH.concat([{ id: 't3', x: 40, y: 50, rot: 90, front: 45, posture: 'kneeling' }, { id: 's3', type: 'path', ownerId: 'u_p', pts: [[9, 9], [8, 8]] }]) } });
    check('hidden pieces (patch, host): a player\'s own drawing the GM hid is not on their copy, so a map copy of theirs that leaves it out does not erase it (it left by the GM\'s hand, not theirs; one they left out themselves still goes); a copy that names it, or their hidden token, changes neither',
        j(afterOut) === j([true, true, true, true]) && j(hb('s3')) === j({ id: 's3', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [3, 3]], x: 0, y: 0, hidden: true }) && j(hb('t3')) === j({ id: 't3', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, hidden: true })
        && (() => { const c2 = mk(); c2.c1.items.m1.whiteboard.push({ id: 's4', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [4, 4]], x: 0, y: 0 }); runPatch(c2, { campId: 'c1', itemId: 'm1', item: { whiteboard: heldH } }); return !c2.c1.items.m1.whiteboard.some(w => w.id === 's4'); })(), j([afterOut, hb('s3'), hb('t3')]));
    const protoRuns = [['constructor', 'm1'], ['__proto__', 'm1'], ['hasOwnProperty', 'm1'], ['c1', 'constructor'], ['c1', 'toString'], ['c1', '__proto__'], [5, 'm1'], ['c1', 7]].map(([c, i]) => runPatch(mk(), { campId: c, itemId: i, item: { whiteboard: [{ id: 't1', x: 9, y: 9 }] } }));
    check('patch (host): a campaign or map id that is a prototype key (or not a string) names nothing — refused, never a throw', protoRuns.every(r => r === false), j(protoRuns));
}
// 49 (c) (the owner, by prompt, 2026-10-06: "Lock it for its player"): a player's drawing the GM made a wall (Blocks sight) or a see-through
// barrier (Stops movement only) is no longer its player's to redraw or erase. The patch gate with the REAL playerStroke and the real fogcore
// (strokeHeld, the one judge), a player's own eraser's two helpers sliced from whiteboard.js and run for real, and the words
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCh = await import(url('fogcore.js')), rdH = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
    const coreH = rdH('system/app/scripts/fogcore.js'), wbH = rdH('system/app/scripts/whiteboard.js'), ixH = rdH('system/app/index.html'), claudeH = (() => { try { return rdH('CLAUDE.md'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } })();   // CLAUDE.md is kept on the maintainer's machine only (git-ignored): its pins run where it is there
    // (1) the judge: the two flags alone, a wall as the wall judges read it (any value that blocks), a barrier only as true
    const held = w => FCh.strokeHeld(w);
    check('49 (c) the judge (fogcore strokeHeld, run for real): a drawing the GM made a wall is held — Blocks sight as true and as any value that blocks sight, a door open or shut, a hidden one too — and so is one made a see-through barrier, only as true; a barrier flag that is a word or a number, no flag, false flags, and what is no object are not held; the fog core publishes it both ways',
        held({ blocksSight: true }) === true && held({ blocksSight: 1 }) === true && held({ blocksSight: true, sightType: 'door', doorOpen: true }) === true && held({ blocksSight: true, hidden: true }) === true && held({ barrier: true }) === true && held({ barrier: true, sightType: 'door', doorOpen: true }) === true
        && held({ barrier: 'yes' }) === false && held({ barrier: 1 }) === false && held({}) === false && held({ blocksSight: false, barrier: false }) === false && held({ blocksSight: 0 }) === false && held(null) === false && held(undefined) === false && held('wall') === false && held(7) === false
        && coreH.includes('barrierOn: barrierOn, isDoor: isDoor, strokeHeld: strokeHeld, cleanBarrier: cleanBarrier,') && coreH.includes('barrierOn, isDoor, strokeHeld, cleanBarrier,'),
        j([held({ blocksSight: 1 }), held({ barrier: 'yes' }), held(null)]));
    // (2) the host's patch gate
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js');
    const cleanersSrc = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
    const psSrc = fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n';
    const run = (camps, msg, o) => { o = o || {}; const out = {}; let r;
        try { r = new Function('state', 'window', 'msg', 'prof', 'out', cleanersSrc + ownKeySrc + psSrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof, out);')({ appState: { campaigns: camps } }, o.noCore ? { wpVtt: { campaignOn: () => true } } : { wpVtt: { campaignOn: () => true }, wpFogCore: FCh }, msg, { id: o.pid || 'u_p' }, out); } catch (e) { r = 'threw: ' + e.message; }
        return { r, whole: out.whole === true, strokes: out.strokes === true }; };
    const S = (id, extra) => Object.assign({ id, type: 'path', byPlayer: true, ownerId: 'u_p', x: 5, y: 5, w: 10, h: 10, baseW: 10, baseH: 10, z: 35, pts: [[0, 0], [4, 4]], color: '#e9e9f0', strokeWidth: 3 }, extra);
    const mk = () => ({ c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [S('wall', { blocksSight: true, sightType: 'wall' }), S('one', { blocksSight: 1 }), S('door', { blocksSight: true, sightType: 'door', doorOpen: true }), S('bar', { barrier: true }), S('odd', { barrier: 'yes' }), S('plain'), S('lockd', { locked: true }), S('hers', { ownerId: 'u_q', blocksSight: true })] } } } });
    const wbOf = c => c.c1.items.m1.whiteboard, ids = c => wbOf(c).map(w => w.id).join(), by = (c, id) => wbOf(c).find(w => w.id === id);
    // a copy of the map as an honest app of pid would send it: each drawing of theirs as it stands, but those named in drop, and those in redo changed
    const copy = (c, o) => { o = o || {}; const pid = o.pid || 'u_p'; return { campId: 'c1', itemId: 'm1', item: { whiteboard: wbOf(c).filter(w => w.ownerId === pid && (o.drop || []).indexOf(w.id) < 0).map(w => Object.assign({ id: w.id, type: 'path', ownerId: pid, x: w.x, y: w.y, w: 10, h: 10, pts: w.pts.map(p => p.slice()) }, (o.redo || {})[w.id])) } }; };
    const all = ['wall', 'one', 'door', 'bar', 'odd', 'plain', 'lockd'];
    const cE = mk(), eAll = run(cE, copy(cE, { drop: all }));
    const cW = mk(), eWall = run(cW, copy(cW, { drop: ['wall'] })), cB = mk(), eBar = run(cB, copy(cB, { drop: ['bar'] })), cN = mk(), eNone = run(cN, copy(cN));
    check('49 (c) an erase (the host\'s patch gate with the real playerStroke and the real fogcore): a copy of the map that leaves every drawing of theirs out erases the plain one and the one whose barrier flag is only a word, and keeps each one the GM made a wall or a barrier (and the locked one, as ever); the sender is to get the map whole, so their screen holds the lines again; a copy that leaves out only a wall, or only a barrier, changes nothing and is answered the same way; a copy that names them all as they stand changes nothing and asks for no whole map',
        eAll.r === true && eAll.whole === true && eAll.strokes === true && ids(cE) === 'wall,one,door,bar,lockd,hers'
        && eWall.r === false && eWall.whole === true && ids(cW) === 'wall,one,door,bar,odd,plain,lockd,hers' && eBar.r === false && eBar.whole === true && ids(cB) === 'wall,one,door,bar,odd,plain,lockd,hers'
        && eNone.r === false && eNone.whole === false && eNone.strokes === false && ids(cN) === 'wall,one,door,bar,odd,plain,lockd,hers', j([eAll, ids(cE), eWall, eBar, eNone]));
    const P2 = [[9, 9], [1, 1]], redo = id => { const c = mk(), was = j(by(c, id)), r = run(c, copy(c, { redo: { [id]: { pts: P2 } } })); return { r: r.r, whole: r.whole, same: j(by(c, id)) === was, pts: j(by(c, id).pts) }; };
    const move = id => { const c = mk(), was = j(by(c, id)), r = run(c, copy(c, { redo: { [id]: { x: 77 } } })); return { r: r.r, whole: r.whole, same: j(by(c, id)) === was, x: by(c, id).x }; };
    const rW = redo('wall'), rO = redo('one'), rD = redo('door'), rB = redo('bar'), rP = redo('plain'), rOdd = redo('odd'), mW = move('wall'), mB = move('bar'), mP = move('plain');
    const cM = mk(), bad = run(cM, { campId: 'c1', itemId: 'm1', item: { whiteboard: copy(cM).item.whiteboard.map(w => (w.id === 'wall' ? Object.assign({}, w, { pts: 'none' }) : w)) } });
    check('49 (c) a redraw: new points, or a new place, for a drawing the GM made a wall, a door or a barrier are refused — the host\'s drawing is byte for byte as it was, its flags with it — and the sender is to get the map whole; the same redraw of a plain drawing, and of one whose barrier flag is only a word, lands as ever and asks for no whole map; a copy that names a wall in a shape that is no drawing changes nothing, erases nothing and asks for nothing',
        [rW, rO, rD, rB, mW, mB].every(x => x.r === false && x.whole === true && x.same === true) && rW.pts === '[[0,0],[4,4]]' && mW.x === 5
        && rP.r === true && rP.whole === false && rP.pts === j(P2) && rOdd.r === true && rOdd.whole === false && rOdd.pts === j(P2) && mP.r === true && mP.whole === false && mP.x === 77
        && bad.r === false && bad.whole === false && ids(cM) === 'wall,one,door,bar,odd,plain,lockd,hers' && by(cM, 'wall').blocksSight === true, j([rW, rO, rD, rB, mW, mB, rP, rOdd, mP, bad]));
    // handed back, another player's, and with no judge
    const cU = mk(); delete by(cU, 'wall').blocksSight; delete by(cU, 'wall').sightType; delete by(cU, 'bar').barrier;
    const uE = run(cU, copy(cU, { drop: ['wall', 'bar'] })), cU2 = mk(); delete by(cU2, 'wall').blocksSight; const uR = run(cU2, copy(cU2, { redo: { wall: { pts: P2 } } }));
    const cQ = mk(), qE = run(cQ, copy(cQ, { pid: 'u_q', drop: ['hers'] }), { pid: 'u_q' }), cX = mk(), noCore = run(cX, copy(cX, { drop: ['wall'] }), { noCore: true });
    check('49 (c) handed back, another player, and no judge: once the GM unticks the line it is its player\'s again — the same copy erases it, the same redraw lands; another player\'s copy keeps their own wall drawing the same way and never touches this player\'s; with no fog core on the page the rule cannot be asked and the gate answers as it did before; the gate asks the judge in exactly four places, the redraw and the erase, each once for a drawing the GM also locked and once for one that is not (round three of Match a wall), through its one helper',
        uE.r === true && uE.whole === false && ids(cU) === 'one,door,odd,plain,lockd,hers' && uR.r === true && uR.whole === false && j(by(cU2, 'wall').pts) === j(P2)
        && qE.r === false && qE.whole === true && ids(cQ) === 'wall,one,door,bar,odd,plain,lockd,hers' && noCore.r === true && noCore.whole === false && ids(cX) === 'one,door,bar,odd,plain,lockd,hers'
        && (patchSrc.match(/strokeHeldOn\(/g) || []).length === 5 && patchSrc.includes("function strokeHeldOn(w) { var FCh = window.wpFogCore; return !!(FCh && typeof FCh.strokeHeld === 'function' && FCh.strokeHeld(w)); }")
        && /if \(pOut\.whole\) net\.sendItem\(msg\.campId, msg\.itemId, conn, null, msg\.a\);/.test(src), j([uE, ids(cU), uR, qE, noCore, ids(cX)]));
    // Round three of Match a wall (2026-10-12): a drawing the GM made a wall or a see-through barrier AND locked. No plain wall carries a lock to
    // players (round two), so its player's copy of such a drawing says no lock: nothing on their screen tells them it is frozen, and a copy of
    // theirs may redraw it or leave it out. The host changes nothing, as ever for a locked piece, and now answers with the map whole, as it does
    // for a wall that is not locked, so their screen holds the line again. A drawing that is locked and NO wall still says locked on their
    // screen (their app stops them there), and is answered with nothing, as before; so is a locked token
    const SL = (id, extra) => S(id, Object.assign({ locked: true }, extra));
    const mkLk = () => { const gm = SL('gmline', { blocksSight: true, sightType: 'wall' }); delete gm.byPlayer;   // a wall line that carries their id and is no drawing of a player's
        return { c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [SL('lw', { blocksSight: true, sightType: 'wall' }), SL('lb', { barrier: true }), SL('ld', { blocksSight: true, sightType: 'door', doorOpen: true }), SL('lone', { blocksSight: 1 }),
            SL('lk'), SL('lodd', { barrier: 'yes' }), gm, { id: 'ltok', type: 'image', isChar: true, ownerId: 'u_p', x: 5, y: 5, rot: 0, front: 0, blocksSight: true, locked: true }, { id: 'lbox', type: 'rect', byPlayer: true, ownerId: 'u_p', x: 5, y: 5, w: 10, h: 10, rot: 0, front: 0, blocksSight: true, sightType: 'wall', locked: true }, S('free'), SL('lhers', { ownerId: 'u_q', blocksSight: true, sightType: 'wall' })] } } } }; };
    // a copy of the map as an app of pid would send it, with nothing of a lock or of a wall in it: each piece of theirs as it stands, but those dropped and those changed
    const copyL = (c, o) => { o = o || {}; const pid = o.pid || 'u_p'; return { campId: 'c1', itemId: 'm1', item: { whiteboard: wbOf(c).filter(w => w.ownerId === pid && (o.drop || []).indexOf(w.id) < 0).map(w => Object.assign(w.type === 'path' ? { id: w.id, type: 'path', ownerId: pid, x: w.x, y: w.y, w: 10, h: 10, pts: w.pts.map(p => p.slice()) } : { id: w.id, x: w.x, y: w.y, rot: 0, front: 0 }, (o.redo || {})[w.id])) } }; };
    const tryL = (o, how) => { const c = mkLk(), was = j(wbOf(c)), r = run(c, copyL(c, o), how); return [r.r, r.whole, j(wbOf(c)) === was]; };   // [what the gate answered, the map whole is owed, the host's map is text for text as it was]
    const HELDL = ['lw', 'lb', 'ld', 'lone'], PLAINL = ['lk', 'lodd', 'gmline'], P3 = [[9, 9], [1, 1]];
    const actsL = id => [tryL({ drop: [id] }), tryL({ redo: { [id]: { pts: P3 } } }), tryL({ redo: { [id]: { x: 77 } } }), tryL({ redo: { [id]: { y: 77 } } })];   // left out, new points, moved across, moved down
    const heldL = HELDL.map(actsL), plainL = PLAINL.map(actsL), WHOLE4 = j([[false, true, true], [false, true, true], [false, true, true], [false, true, true]]), NONE4 = j([[false, false, true], [false, false, true], [false, false, true], [false, false, true]]);
    const boxL = [tryL({ redo: { lbox: { type: 'path', ownerId: 'u_p', w: 10, h: 10, pts: P3 } } }), tryL({ redo: { lbox: { x: 77 } } }), tryL({ drop: ['lbox'] })];   // a box that carries the marks of a player's drawing, which no tool makes: named as a drawing, moved, left out
    const asIsL = tryL({}), tokL = tryL({ redo: { ltok: { x: 77, y: 60, rot: 90, front: 45 } } }), badL = [tryL({ redo: { lw: { pts: 'none' } } }), tryL({ redo: { lw: { type: 'rect', pts: P3 } } }), tryL({ redo: { lw: { ownerId: 'u_q', pts: P3 } } })];
    const noCoreL = [tryL({ drop: ['lw'] }, { noCore: true }), tryL({ redo: { lw: { pts: P3 } } }, { noCore: true }), tryL({ redo: { lb: { x: 77 } } }, { noCore: true })];
    const cFree = mkLk(), rFree = run(cFree, copyL(cFree, { redo: { free: { pts: P3 } } })), cMixK = mkLk(), rMixK = run(cMixK, copyL(cMixK, { drop: ['lk', 'free'] })), cMixW = mkLk(), rMixW = run(cMixW, copyL(cMixW, { drop: ['lw', 'free'] }));
    const ALLL = 'lw,lb,ld,lone,lk,lodd,gmline,ltok,lbox,free,lhers', LESSFREE = 'lw,lb,ld,lone,lk,lodd,gmline,ltok,lbox,lhers';
    const qDropL = tryL({ pid: 'u_q', drop: ['lhers'] }, { pid: 'u_q' }), qAsIsL = tryL({ pid: 'u_q' }, { pid: 'u_q' });
    const runBare = (camps, msg) => { try { return new Function('state', 'window', 'msg', 'prof', cleanersSrc + ownKeySrc + psSrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true }, wpFogCore: FCh }, msg, { id: 'u_p' }); } catch (e) { return 'threw: ' + e.message; } };
    const bareL = [{ drop: ['lw'] }, { redo: { lw: { pts: P3 } } }, { drop: ['lk'] }].map(o => { const c = mkLk(), was = j(wbOf(c)); return [runBare(c, copyL(c, o)), j(wbOf(c)) === was]; });
    check('49 (c) a wall the GM also locked (round three of Match a wall; the host\'s patch gate with the real playerStroke and the real fogcore): no plain wall carries a lock to players, so a player\'s copy of a drawing of theirs that the GM made a wall or a see-through barrier and locked says nothing of the lock. A copy of the map that leaves such a drawing out, gives it new points, or moves it across or down changes nothing on the host, the map text for text as it was, and the sender is to get the map whole, as for a wall that is not locked: held of a wall, a see-through barrier, an open door and a drawing whose Blocks sight is a 1. A copy that names them all as they stand changes nothing and asks for nothing, and so does one that names the wall in a shape that is no drawing, as another kind of piece, or under another player\'s id. A drawing that is locked and no wall, one whose barrier flag is only a word, and a wall line that carries the player\'s id and is no drawing of a player\'s are kept under each of the four and are NOT answered with the map whole, as before; nor is a locked token of theirs that blocks sight, which neither moves nor turns, nor a locked box that blocks sight and carries the marks of a player\'s drawing, named by the copy as a drawing, moved or left out. With no fog core on the page the rule cannot be asked: the locked drawing stays, and nothing is sent back. In the same copy a plain drawing of theirs is still redrawn and erased: beside a locked plain drawing left out that asks for nothing, beside a locked wall left out it asks for the map whole. Another player\'s copy that leaves out their own locked wall is answered the same way and touches nothing of this player\'s. And the gate called with no answer to fill throws nothing',
        heldL.every(a => j(a) === WHOLE4) && heldL.length === 4 && plainL.every(a => j(a) === NONE4) && plainL.length === 3
        && j(asIsL) === j([false, false, true]) && j(tokL) === j([false, false, true]) && boxL.every(t => j(t) === j([false, false, true])) && badL.every(t => j(t) === j([false, false, true])) && noCoreL.every(t => j(t) === j([false, false, true]))
        && rFree.r === true && rFree.whole === false && rFree.strokes === true && j(by(cFree, 'free').pts) === j(P3) && ids(cFree) === ALLL
        && rMixK.r === true && rMixK.whole === false && ids(cMixK) === LESSFREE && rMixW.r === true && rMixW.whole === true && ids(cMixW) === LESSFREE && by(cMixW, 'lw').locked === true
        && j(qDropL) === j([false, true, true]) && j(qAsIsL) === j([false, false, true]) && bareL.every(b => j(b) === j([false, true])),
        j([heldL, plainL, asIsL, tokL, boxL, badL, noCoreL, [rFree, ids(cFree)], [rMixK, ids(cMixK)], [rMixW, ids(cMixW)], qDropL, qAsIsL, bareL]));
    // Round three of Match a wall: a player's line keeps the nib it was drawn with, so that every screen draws it as its drawer's does. Until
    // then the host rebuilt a player's drawing with no nib at all, and every other screen drew a square or a flat line round. playerStroke keeps
    // tip only as the word square or the word flat. Anything else names no nib: the line is round, as before. Never the Fill tip: a filled
    // region is no line, and a player hands the host lines alone
    const PSr = new Function(psSrc + '\nreturn playerStroke;')();
    const inkP = more => Object.assign({ id: 'wbN1', type: 'path', ownerId: 'u_p', x: 5, y: 6, w: 30, h: 40, baseW: 30, baseH: 40, pts: [[0, 0], [30, 40]], color: '#aabbcc', strokeWidth: 7, opacity: 0.5 }, more);
    const INKJ = '{"id":"wbN1","type":"path","x":5,"y":6,"w":30,"h":40,"baseW":30,"baseH":40,"z":35,"pts":[[0,0],[30,40]],"color":"#aabbcc","strokeWidth":7,"ownerId":"u_p","byPlayer":true,"opacity":0.5}', nibJ = t => INKJ.slice(0, -1) + ',"tip":"' + t + '"}';
    const NONIB = ['round', 'fill', 'Square', 'SQUARE', 'Flat', ' square', 'square ', 'flat\n', 'squareflat', 'butt', '', '<img src=x onerror=alert(1)>', 5, 0, 1, true, false, null, undefined, ['square'], ['flat'], { tip: 'flat' }, { toString() { return 'square'; } }, new String('flat')];
    const nibKept = ['square', 'flat'].map(t => j(PSr(inkP({ tip: t }), 'u_p'))), nibNone = NONIB.map(v => j(PSr(inkP({ tip: v }), 'u_p'))), nibBare = j(PSr(inkP({ opacity: undefined, tip: 'flat' }), 'u_p'));
    // ... and through the gate: five new drawings, and two that stand on the map redrawn, each naming a nib
    const cT = mk(), mT = copy(cT); mT.item.whiteboard.push(inkP({ id: 'nSq', tip: 'square' }), inkP({ id: 'nFl', tip: 'flat' }), inkP({ id: 'nFi', tip: 'fill' }), inkP({ id: 'nRo', tip: 'round' }), inkP({ id: 'nNo' }));
    mT.item.whiteboard.forEach(w => { if (w.id === 'plain') { w.pts = P2; w.tip = 'flat'; } if (w.id === 'odd') { w.pts = P2; w.tip = 'fill'; } });
    const rT = run(cT, mT), tipsT = ['nSq', 'nFl', 'nFi', 'nRo', 'nNo', 'plain', 'odd', 'wall'].map(id => { const w = by(cT, id); return !w ? 'not there' : 'tip' in w ? w.tip : 'no nib'; });
    check('a player\'s line keeps its nib (round three of Match a wall; net.js playerStroke run for real, alone and through the real patch gate): a drawing a player hands the host is rebuilt with its nib where that is the word square or the word flat, as the last key of the rebuilt drawing, and with nothing else of it moved: text for text the drawing rebuilt without a nib, and the nib. Any other value names no nib and the drawing is rebuilt exactly as one that names none: the word round, the word fill, another case of square or flat, a blank before or after the word, a line break after it, the two words run together, a word the app does not know, an empty text, markup, a number, a truth value, null, nothing, a list that holds the word, an object, an object that reads as the word and a boxed text. A drawing with no opacity carries its nib right after its marks of whose it is. Through the gate a new drawing lands with the square nib, one with the flat nib, and one that names the Fill tip, one that names round and one that names none each land as a line with no nib; a drawing redrawn with the flat nib takes it with its new points, and one redrawn naming the Fill tip takes its new points and no nib; a drawing the copy does not change gains none',
        j(nibKept) === j([nibJ('square'), nibJ('flat')]) && nibNone.length === 24 && nibNone.every(t => t === INKJ) && nibBare === '{"id":"wbN1","type":"path","x":5,"y":6,"w":30,"h":40,"baseW":30,"baseH":40,"z":35,"pts":[[0,0],[30,40]],"color":"#aabbcc","strokeWidth":7,"ownerId":"u_p","byPlayer":true,"tip":"flat"}'
        && rT.r === true && rT.strokes === true && j(tipsT) === j(['square', 'flat', 'no nib', 'no nib', 'no nib', 'flat', 'no nib', 'no nib']) && j(by(cT, 'plain').pts) === j(P2) && j(by(cT, 'odd').pts) === j(P2) && j(by(cT, 'nFi')) === INKJ.replace('wbN1', 'nFi') && j(by(cT, 'nSq')) === nibJ('square').replace('wbN1', 'nSq'),
        j([nibKept, nibNone.map((t, i) => (t === INKJ ? '' : [String(NONIB[i]), t])).filter(Boolean), nibBare, rT, tipsT]));
    // Round four of Match a wall: a redraw and the nib. Round three's gate laid the rebuilt drawing over the host's line, and a rebuilt drawing
    // that names no nib has no tip key at all, so a square or a flat line that its player redrew with the round nib stayed square or flat on
    // the host and on every other screen. Now a redraw that names no nib leaves the host's line ROUND: its square or flat tip is deleted, as
    // its drawer's screen shows it. A redraw is new points or a new place, as ever: a copy that changes only the nib is none, and changes
    // nothing. Only the words square and flat are taken off. A tip of fill, should one ever stand on a player's drawing on the host, is no
    // nib of a line and stays, and so does the word round, which the board reads as it reads no nib
    const mkNib = () => ({ c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [S('sq', { tip: 'square' }), S('fl', { tip: 'flat' }), S('ro'), S('rd', { tip: 'round' }), S('fi', { tip: 'fill' }), S('wsq', { tip: 'square', blocksSight: true, sightType: 'wall' }), S('lfl', { tip: 'flat', locked: true }), S('hers', { ownerId: 'u_q', tip: 'square' })] } } } });
    const nibOf = w => (!w ? 'not there' : 'tip' in w ? w.tip : 'no nib');
    // [what the gate answered, the map whole is owed, a drawing of theirs changed, the nib the host's line then has, its points, its place across, every other piece of the map is text for text as it was]
    const nibRe = (id, more, how) => { const c = mkNib(), others = () => j(wbOf(c).filter(w => w.id !== id)), was = others(), r = run(c, copy(c, { redo: { [id]: more } }), how), w = by(c, id); return [r.r, r.whole, r.strokes, nibOf(w), j(w.pts), w.x, others() === was]; };
    const P1J = j([[0, 0], [4, 4]]), LANDS = t => j([true, false, true, t, j(P2), 5, true]), STAYS = t => j([false, false, false, t, P1J, 5, true]);
    const nib4None = [nibRe('sq', { pts: P2 }), nibRe('fl', { pts: P2 }), nibRe('ro', { pts: P2 }), nibRe('sq', { pts: P2, tip: 'round' }), nibRe('fl', { pts: P2, tip: 'fill' }), nibRe('sq', { pts: P2, tip: 'Square' }), nibRe('fl', { pts: P2, tip: ['flat'] }), nibRe('sq', { pts: P2 }, { noCore: true })];   // redrawn naming no nib: nothing at all, the word round, the Fill tip, another case, a list that holds the word; and with no fog core on the page
    const nibMoved = [nibRe('sq', { x: 77 }), nibRe('fl', { y: 77 })];   // a new place alone is a redraw too
    const nibNamed = [nibRe('sq', { pts: P2, tip: 'flat' }), nibRe('fl', { pts: P2, tip: 'square' }), nibRe('ro', { pts: P2, tip: 'flat' }), nibRe('sq', { pts: P2, tip: 'square' }), nibRe('rd', { pts: P2, tip: 'square' })];   // redrawn naming square or flat: that nib, whatever nib of a LINE stood (round four had a sixth here, over a tip of fill: round five turned it, below)
    const nibOnly = [nibRe('sq', {}), nibRe('sq', { tip: 'flat' }), nibRe('sq', { tip: 'round' }), nibRe('fl', { tip: 'square' }), nibRe('ro', { tip: 'flat' }), nibRe('ro', { tip: 'square' })];   // a copy that names the drawing as it stands, or changes only its nib: no redraw
    const nibOdd = [nibRe('fi', { pts: P2 }), nibRe('rd', { pts: P2 })];   // a tip on the host's line that is neither square nor flat is not taken off
    const nibHeld = [nibRe('wsq', { pts: P2 }), nibRe('lfl', { pts: P2 }), nibRe('wsq', { pts: P2 }, { noCore: true })];   // a redraw the gate refuses takes no nib off: a wall, a locked line. With no fog core the wall is no wall to the gate, and the redraw lands as any does
    // Round five of Match a wall: a redraw never makes a FILLED REGION a line. Round four laid a nib named by the copy over whatever stood, so
    // a copy that named the square nib or the flat one for a host piece whose tip is fill, with other points or with only another place, left
    // an open line where a region stood, its holes still on it and read by nothing. Now a nib named for such a piece is not taken: the redraw
    // lands (its points, its place) and the piece is the region it was. FLIPPED against round four at the first four and the last: there the
    // region took that nib. The fifth, a move that names no nib, left it a region in round four too
    const nibFill = [nibRe('fi', { pts: P2, tip: 'flat' }), nibRe('fi', { pts: P2, tip: 'square' }), nibRe('fi', { x: 77, tip: 'flat' }), nibRe('fi', { y: 77, tip: 'square' }), nibRe('fi', { x: 77 }), nibRe('fi', { pts: P2, tip: 'flat' }, { noCore: true })];
    // ... and a region as the Fill tool leaves one, with a hole. A row: [what the gate answered, the map whole is owed, a drawing of theirs changed, its nib, its points, its place across, its place
    // down, its holes, the fog core reads it as a line, how many stretches the fog core reads of it (a region is closed, and so is each of its holes), it is text for text the region it was but
    // for what the copy changed and every other piece is as it was]
    const RGPTS = [[0, 0], [10, 0], [10, 10], [0, 10]], RGNEW = [[0, 0], [10, 0], [5, 10]], RGHOLES = [[[2, 2], [6, 2], [6, 6]]];
    const mkRg = extra => ({ c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [S('rg', Object.assign({ tip: 'fill', pts: RGPTS.map(p => p.slice()), holes: RGHOLES.map(h => h.map(p => p.slice())) }, extra)), S('hers', { ownerId: 'u_q', tip: 'square' })] } } } });
    const rgRe = (more, extra, now) => { const c = mkRg(extra), others = () => j(wbOf(c).filter(o => o.id !== 'rg')), was = others(), r = run(c, copy(c, { redo: { rg: more } })), w = by(c, 'rg');
        return [r.r, r.whole, r.strokes, nibOf(w), j(w.pts), w.x, w.y, j(w.holes), FCh.lineOf(w), FCh.pathSegs(w).length, j(w) === j(S('rg', Object.assign({ tip: 'fill', pts: RGPTS, holes: RGHOLES }, extra, now))) && others() === was]; };
    const rgGot = [rgRe({ pts: RGNEW, tip: 'flat' }, {}, { pts: RGNEW }), rgRe({ pts: RGNEW, tip: 'square' }, {}, { pts: RGNEW }), rgRe({ x: 77, tip: 'flat' }, {}, { x: 77 }), rgRe({ y: 77, tip: 'square' }, {}, { y: 77 }), rgRe({ pts: RGNEW }, {}, { pts: RGNEW }),
        rgRe({ pts: RGNEW, tip: 'flat' }, { blocksSight: true, sightType: 'wall' }, {}), rgRe({ x: 77, tip: 'square' }, { barrier: true }, {})];   // the last two: a region the GM made a wall, or a see-through barrier, is held and stays whole
    const RGJ = j(RGPTS), RGNJ = j(RGNEW), RGHJ = j(RGHOLES);
    const rgWant = [[true, false, true, 'fill', RGNJ, 5, 5, RGHJ, false, 6, true], [true, false, true, 'fill', RGNJ, 5, 5, RGHJ, false, 6, true], [true, false, true, 'fill', RGJ, 77, 5, RGHJ, false, 7, true], [true, false, true, 'fill', RGJ, 5, 77, RGHJ, false, 7, true], [true, false, true, 'fill', RGNJ, 5, 5, RGHJ, false, 6, true],
        [false, true, false, 'fill', RGJ, 5, 5, RGHJ, false, 7, true], [false, true, false, 'fill', RGJ, 5, 5, RGHJ, false, 7, true]];
    // ... and what round four left of it, as the fog core reads that: an open line of two stretches, its hole read by nothing. The rows above are told from this
    const rgAsLine = S('rg', { tip: 'flat', pts: RGNEW, holes: RGHOLES }), rgLineRead = [FCh.lineOf(rgAsLine), FCh.pathSegs(rgAsLine).length];
    // ... and text for text: three redraws in one copy. The square line redrawn naming no nib is the very drawing a round line redrawn is, a line that named no nib takes the flat one as its last key, and a flat line takes the square one in the place its nib stood
    const cTxt = mkNib(), rTxt = run(cTxt, copy(cTxt, { redo: { sq: { pts: P2 }, ro: { pts: P2, tip: 'flat' }, fl: { pts: P2, tip: 'square' } } }));
    const txtGot = [j(by(cTxt, 'sq')) === j(S('sq', { pts: P2 })), j(by(cTxt, 'ro')) === j(S('ro', { pts: P2, tip: 'flat' })), j(by(cTxt, 'fl')) === j(S('fl', { tip: 'square', pts: P2 })), nibOf(by(cTxt, 'hers')), nibOf(by(cTxt, 'fi')), nibOf(by(cTxt, 'wsq')), nibOf(by(cTxt, 'lfl'))];
    check('a redraw and the nib (rounds four and five of Match a wall; the host\'s patch gate with the real playerStroke and the real fogcore): a redraw of a player\'s own line that names no nib leaves the host\'s line with NO tip key where it had the square nib or the flat one, since on its drawer\'s screen it is round now: redrawn with new points and nothing said of a nib, with the word round, with the Fill tip, with another case of the word or with a list that holds it, and with no fog core on the page alike; a line that had no nib has none after. A new place alone is a redraw too, and takes the nib off the same way. A redraw that names the square nib or the flat one sets it, whatever nib of a line stood there: flat over square, square over flat, on a line that had none and over the word round. ROUND FIVE, FLIPPED against round four: over a tip of fill it is NOT set, since a redraw never makes a filled region a line. A copy that names the square nib or the flat one for a host piece whose tip is fill, with other points or with only another place across or down, lands its points and its place and leaves the tip fill, with no fog core on the page too. A region as the Fill tool leaves one, with a hole, redrawn or only moved by a copy that names the flat nib or the square one, is text for text the region it was but for the new points or the new place: its tip is fill, its holes are as they were, and the fog core still reads it closed with its hole (six stretches for three points and a hole of three, seven for four points) and as no line, where round four left an open line of two stretches whose hole nothing read. A region the GM made a wall or a see-through barrier is held whole under such a copy, and the map whole is owed. A copy that names the line as it stands, or that changes only its nib, is still no redraw: the gate answers that nothing changed, the host\'s line keeps its nib and its points, and nothing is owed. A tip of fill on the host\'s line, should one ever be there, is NOT deleted by a redraw that names no nib, and neither is the word round: only the words square and flat are taken off. A redraw the gate refuses takes nothing off: a wall keeps its square nib and the map whole is owed, a locked line keeps its flat nib and nothing is owed; with no fog core on the page the wall is no wall to the gate, so its redraw lands and its nib goes. In every one of these the rest of the map is text for text as it was, another player\'s square line among it. And text for text: a square line redrawn naming no nib is the very drawing a line with no nib redrawn is, a line that had none takes the flat nib as its last key, and a flat line takes the square nib in its nib\'s own place',
        nib4None.length === 8 && nib4None.every(g => j(g) === LANDS('no nib')) && j(nibMoved) === j([[true, false, true, 'no nib', P1J, 77, true], [true, false, true, 'no nib', P1J, 5, true]])
        && j(nibNamed.map(g => j(g))) === j([LANDS('flat'), LANDS('square'), LANDS('flat'), LANDS('square'), LANDS('square')]) && nibNamed.length === 5
        && j(nibFill.map(g => j(g))) === j([LANDS('fill'), LANDS('fill'), j([true, false, true, 'fill', P1J, 77, true]), j([true, false, true, 'fill', P1J, 5, true]), j([true, false, true, 'fill', P1J, 77, true]), LANDS('fill')]) && nibFill.length === 6
        && j(rgGot) === j(rgWant) && rgGot.length === 7 && j(rgLineRead) === j([true, 2])
        && j(nibOnly.map(g => j(g))) === j([STAYS('square'), STAYS('square'), STAYS('square'), STAYS('flat'), STAYS('no nib'), STAYS('no nib')])
        && j(nibOdd.map(g => j(g))) === j([LANDS('fill'), LANDS('round')])
        && j(nibHeld.map(g => j(g))) === j([j([false, true, false, 'square', P1J, 5, true]), STAYS('flat'), LANDS('no nib')])
        && rTxt.r === true && rTxt.whole === false && rTxt.strokes === true && j(txtGot) === j([true, true, true, 'square', 'fill', 'square', 'flat']),
        j([nib4None, nibMoved, nibNamed, nibFill, rgGot, rgLineRead, nibOnly, nibOdd, nibHeld, rTxt, txtGot, by(cTxt, 'sq')]));
    // (3) a player's own eraser: the two helpers run for real, their call sites pinned
    const eA = wbH.indexOf('// [netcheck:erasehold-start]'), eZ = wbH.indexOf('// [netcheck:erasehold-end]'), eSrc = eA > 0 && eZ > eA ? wbH.slice(eA, eZ) : 'throw new Error("no erasehold slice");';
    const mkE = win => new Function('window', '"use strict";\n' + eSrc + '\nreturn { held: eraseHeld, words: eraseHeldWords };')(win);
    const E = mkE({ wpFogCore: FCh }), E0 = mkE({}), wallI = S('w', { blocksSight: true, name: '<img src=x onerror=1>' }), barI = S('b', { barrier: true });
    const fnE = wbH.slice(wbH.indexOf('  function eraseWorldPoint(x, y) {'), wbH.indexOf('  var _erasedAny = false;'));
    const iOwn = fnE.indexOf("if (eraserClient && item.ownerId !== window.wpNet.myId) { out.push(item); return; }"), iAny = fnE.indexOf('if (!any) { out.push(item); return; }'), iHeld = fnE.indexOf('if (eraseHeld(item, eraserClient)) { heldHit = item; out.push(item); return; }   // 49 (c): touched, and kept whole'), iChg = fnE.indexOf('changed = true;\n          // Runs of consecutive intact segments become the surviving pieces');
    check('49 (c) a player\'s own eraser (whiteboard.js, the erasehold slice run for real with the real fogcore): a line of theirs the GM made a wall or a barrier is held on a player\'s app and never on the GM\'s, whose eraser takes any line as ever; a plain line and one whose barrier flag is only a word are not; with no fog core nothing is held; the notice is fixed words that name a wall or a barrier and nothing of the line; the eraser asks only after the line is theirs and the eraser touched it, keeps the line whole, says the notice once a stroke and is ready to say it again at the next',
        E.held(wallI, true) === true && E.held(barI, true) === true && E.held(wallI, false) === false && E.held(barI, false) === false && E.held(S('p'), true) === false && E.held(S('o', { barrier: 'yes' }), true) === false && E.held(null, true) === false && E0.held(wallI, true) === false
        && E.words(wallI) === 'Your GM made that line a wall. It stays until they hand it back.' && E.words(barI) === 'Your GM made that line a barrier. It stays until they hand it back.' && E.words(null) === 'Your GM made that line a barrier. It stays until they hand it back.'
        && iOwn > 0 && iAny > iOwn && iHeld > iAny && iChg > iHeld && fnE.includes('if (ddx*ddx + ddy*ddy <= reachSq) { if (eraseHeld(item, eraserClient)) { heldHit = item; out.push(item); return; } changed = true; return; }')
        && (fnE.match(/eraseHeld\(item, eraserClient\)/g) || []).length === 2 && fnE.includes('      if (heldHit && !_heldSaid) { _heldSaid = true; toast(eraseHeldWords(heldHit)); }\n      if (changed) {')
        && wbH.includes("      isErasing = false; lastErasePt = null; _heldSaid = false; if (_eraserCursor) _eraserCursor.classList.remove('pressed');") && wbH.includes('  var lastErasePt = null, _heldSaid = false;') && !/innerHTML|setAttribute/.test(eSrc),
        j([E.held(wallI, true), E.held(wallI, false), E.words(wallI), iOwn, iAny, iHeld, iChg]));
    // (4) said
    const noteH = "- A player's line that you tick Blocks sight or Stops movement only is\n  yours from then on. Its player can no longer erase or redraw it, and\n  their eraser says why. Untick it to hand the line back.\n";
    check('49 (c) said: Help for the GM says that a player\'s line ticked Blocks sight or Stops movement only is the GM\'s from then on and how it is handed back; Help for players has Your drawings, with what they may erase and that a wall or a barrier of the GM\'s stays; both release notes carry the same lines; CLAUDE.md names the one judge and its two askers',
        ixH.includes('Tick <b>Blocks sight</b> or <b>Stops movement only</b> on a player&rsquo;s line and it is yours from then on: its player can no longer erase or redraw it. Untick it to hand the line back.</li>')
        && ixH.includes('<li><b>Your drawings:</b> you have the pen and the eraser too. You can erase only your own marks. A line of yours that your GM made a wall or a barrier stays: you can no longer erase it, until they hand it back.</li>')
        && rdH('WHATSNEW.txt').includes(noteH) && rdH('system/app/assets/whatsnew.txt').includes(noteH)
        && (claudeH === null || (claudeH.includes('fogcore `strokeHeld` is the one judge, asked by the host\'s patch path (net.js `strokeHeldOn`') && claudeH.includes('and by a player\'s own eraser (whiteboard.js `eraseHeld`)'))));
})());
// 127 (the owner, by prompt, 2026-10-06: the GM's Undo takes back what the GM did to a player's drawing, "and still never moves or erases what the
// player did themselves"): the host notes what players do to their own drawings in the one place a drawing of theirs is taken — the patch gate,
// run for real with the REAL playerStroke, the real fogcore and a recorder in the count's place. (The count itself and the undo that reads it are
// cleanupcheck's.)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCn = await import(url('fogcore.js'));
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js'), actsSrc = between('// [netcheck:strokeacts-start]', '// [netcheck:strokeacts-end]', 'strokeacts', 'netfog.js');
    const cleanersSrc = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
    const psSrc = fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n';
    const run = (camps, msg, pid, pend) => { const notes = [], out = pend ? { conn: { peer: 'peer1' } } : {}; let r;
        try { r = new Function('state', 'window', 'msg', 'prof', 'out', 'strokeNote', 'hidPendOf', cleanersSrc + ownKeySrc + psSrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof, out);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true }, wpFogCore: FCn }, msg, { id: pid || 'u_p' }, out, (c, m, what, id) => { notes.push([c, m, what, id].join(':')); }, pend ? () => pend : undefined); } catch (e) { r = 'threw: ' + e.message; }
        return { r, notes: notes.join(' '), whole: out.whole === true }; };
    const S = (id, extra) => Object.assign({ id, type: 'path', byPlayer: true, ownerId: 'u_p', x: 5, y: 5, w: 10, h: 10, baseW: 10, baseH: 10, z: 35, pts: [[0, 0], [4, 4]], color: '#e9e9f0', strokeWidth: 3 }, extra);
    // keep: named as it stands; gone: left out; redo: named with new points; wall, lockd: named with new points (refused); hid: hidden; wall2 (a barrier), lockd2 and shown (the GM
    // hid it and has shown it again: this copy may be older than the showing) are left out, and kept; hers: another player's; tok: their own token
    const mk = () => ({ c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [S('keep'), S('gone'), S('redo'), S('wall', { blocksSight: true }), S('lockd', { locked: true }), S('hid', { hidden: true }), S('wall2', { barrier: true }), S('lockd2', { locked: true }), S('shown'), S('hers', { ownerId: 'u_q' }), { id: 'tok', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0 }] } } } });
    const copyOf = w => ({ id: w.id, type: 'path', ownerId: 'u_p', x: w.x, y: w.y, w: 10, h: 10, pts: w.pts.map(p => p.slice()) });
    const c = mk(), idsNow = () => c.c1.items.m1.whiteboard.map(w => w.id).join();   // read after the gate ran: an erase hands the map a new list
    const copyMsg = () => ({ campId: 'c1', itemId: 'm1', item: { whiteboard: [copyOf(S('keep')), Object.assign(copyOf(S('redo')), { pts: [[1, 1], [2, 2]] }), Object.assign(copyOf(S('wall')), { pts: [[8, 8], [9, 9]] }), Object.assign(copyOf(S('lockd')), { pts: [[8, 8], [9, 9]] }),
        copyOf(S('new1')), copyOf(S('new1')), { id: 'tok', x: 30, y: 40, rot: 0, front: 0 }, Object.assign(copyOf(S('hers')), { ownerId: 'u_q' })] } });
    const pendRec = { shown: 1 }, a = run(c, copyMsg(), 'u_p', pendRec), ids1 = idsNow(), a2 = run(c, copyMsg(), 'u_p', pendRec), ids2 = idsNow();   // the same copy twice: the second time the shown drawing is theirs to erase
    const same = run(mk(), { campId: 'c1', itemId: 'm1', item: { whiteboard: ['keep', 'gone', 'redo', 'wall', 'lockd', 'wall2', 'lockd2', 'shown'].map(id => copyOf(S(id))).concat([{ id: 'tok', x: 0, y: 0, rot: 0, front: 0 }]) } });
    check('undo count (127, the host\'s patch gate with the real playerStroke and the real fogcore): a copy of the map notes each thing its player did to a drawing of their own, once, with the campaign and the map — a new drawing as added (the same new id twice in one copy is added once), a drawing sent with new points as redrawn, one left out as erased — and notes nothing for what the gate refuses or what is not theirs to do: a redraw of a line the GM made a wall or of a locked drawing, a hidden drawing, another player\'s drawing, a move of their own token; a barrier or a locked drawing the copy leaves out is kept and is no erase, and neither is one the GM hid and has shown again, the once that the copy may be older than the showing — the next copy without it is an erase, and is noted; a copy that names every drawing as it stands notes nothing',
        a.r === true && a.notes === 'c1:m1:redrawn:redo c1:m1:added:new1 c1:m1:erased:gone' && a.whole === true && ids1 === 'keep,redo,wall,lockd,hid,wall2,lockd2,shown,hers,tok,new1'
        && a2.notes === 'c1:m1:erased:shown' && ids2 === 'keep,redo,wall,lockd,hid,wall2,lockd2,hers,tok,new1' && same.r === false && same.notes === '', j([a, ids1, a2, ids2, same]));
    // The owed review, 2026-10-09: a drawing the GM's undo brought back is noted with its time (hidBack). Every copy of its player's that lacks it
    // within HID_BACK_MS of the step is no erase; a note past its time, one from a time that has not come, and one with no time are spent at once
    const backCopy = () => ({ campId: 'c1', itemId: 'm1', item: { whiteboard: ['keep', 'gone', 'redo', 'wall', 'lockd', 'wall2', 'lockd2'].map(id => copyOf(S(id))).concat([{ id: 'tok', x: 0, y: 0, rot: 0, front: 0 }]) } });   // every drawing of theirs as it stands, but `shown`
    const bq = pv => { const cB = mk(), rec = { shown: pv }, hasS = () => cB.c1.items.m1.whiteboard.some(w => w.id === 'shown'), r1 = run(cB, backCopy(), 'u_p', rec), h1 = hasS(), r2 = run(cB, backCopy(), 'u_p', rec), h2 = hasS(); return [h1, r1.whole, r1.notes, h2, r2.whole, r2.notes, 'shown' in rec]; };
    const tNow = Date.now(), KEPT = j([true, true, '', true, true, '', true]), SPENT = j([false, false, 'c1:m1:erased:shown', false, false, '', false]);
    const bFresh = bq({ at: tNow }), bEdge = bq({ at: tNow - 2000 }), bOld = bq({ at: tNow - 65000 }), bAhead = bq({ at: tNow + 3600000 }), bText = bq({ at: 'x' }), bBare = bq({}), bList = bq([tNow]);
    check('a drawing the GM\'s undo brought back, in the patch gate (the owed review of 2026-10-09; run for real): while its note is within its time, every copy of its player\'s that lacks the drawing erases nothing, is answered with the map whole and leaves the note standing, the second such copy as the first; a note past its time is spent, and that copy is the player\'s own erase, noted as one; a note from a time that has not come, one whose time is no number and one with no time are spent alike; the time is 5 seconds',
        j(bFresh) === KEPT && j(bEdge) === KEPT && j(bOld) === SPENT && j(bAhead) === SPENT && j(bText) === SPENT && j(bBare) === SPENT && j(bList) === SPENT && /var STROKE_CAP = 600, STROKE_PTS_CAP = 60000, HID_BACK_MS = 5000;/.test(patchSrc),
        j([bFresh, bEdge, bOld, bAhead, bText, bBare, bList]));
    check('undo count (127, the source): the gate notes in exactly three places, each through typeof so that a page with no count is as before; the count is published as three questions and a number, never as its sets; a map that is deleted takes its count with it; the count is not forgotten at a new table (a step of the GM\'s undo may be older than the session)',
        (patchSrc.match(/if \(typeof strokeNote === 'function'\) strokeNote\(msg\.campId, msg\.itemId, '(added|redrawn|erased)', /g) || []).length === 3 && (patchSrc.match(/strokeNote\(/g) || []).length === 3
        && /net\.strokeActs = strokeActs; net\.strokeSeq = function\(\) \{ return _strokeSeq; \};/.test(actsSrc) && !/net\.[A-Za-z_]+ = _strokeActs/.test(src) && /if \(typeof strokeActsForget === 'function'\) strokeActsForget\(campId, itemId\);/.test(fnSrc('net.itemGone = function(campId, itemId, title) {', '\n};', 'itemGone'))
        && require('./checkkit').familyCount('net.js', /_strokeActs = /g) === 1 && require('./checkkit').familyCount('net.js', /_strokeSeq = /g) === 1 && (src.match(/strokeActsForget\(/g) || []).length === 2);
})());
// R2 security (cluster A, #1 #3 #23): the patch path with the REAL playerStroke — a copy of the map they are on, ids that are keys, each new id once,
// and a budget of points per player per map beside the count
{
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js');
    const cleanersSrc = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
    const psSrc = fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n';
    const runP = (camps, msg, prof) => { try { return new Function('state', 'window', 'msg', 'prof', cleanersSrc + ownKeySrc + psSrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true } }, msg, prof); } catch (e) { return 'threw: ' + e.message; } };
    const mk = () => ({ c1: { id: 'c1', items: {
        m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tA', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0 }, { id: 's1', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [1, 1]], x: 0, y: 0 }] },
        m2: { id: 'm2', type: 'map', meta: { playerLock: true }, whiteboard: [{ id: 'tB', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0 }] } } } });
    const sk = (id, pts) => ({ id, type: 'path', ownerId: 'u_p', pts: pts || [[0, 0], [9, 9]] });
    const ids = wb => wb.map(w => w.id);
    // #1: the map they are on (the pos gate's rule)
    const cA = mk(), rA = runP(cA, { campId: 'c1', itemId: 'm2', item: { whiteboard: [{ id: 'tB', x: 400, y: 500 }, sk('g1')] } }, { id: 'u_p', location: 'm1' });
    const cC = mk(), rC = runP(cC, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 400, y: 500 }, sk('s1', [[0, 0], [1, 1]]), sk('g1')] } }, { id: 'u_p', location: 'm1' });
    const cD = mk(), rD = runP(cD, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 400, y: 500 }, sk('s1', [[0, 0], [1, 1]])] } }, { id: 'u_p', location: null });
    const cE = mk(), rE = runP(cE, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 400, y: 500 }, sk('s1', [[0, 0], [1, 1]])] } }, { id: 'u_p', location: 'm2' });
    check('security (patch, host): a map copy from a player names the map they are on, as the pos gate and the threats branch have it — a copy of a map they left a token on (here one closed to players) moves nothing there and draws nothing, so no room\'s handout is found on a map they never traveled to; a copy of the map they stand on lands; a player with no place yet, as before; the GM moved them meanwhile: the stale copy of the old map is dropped',
        rA === false && j(cA.c1.items.m2) === j(mk().c1.items.m2) && rC === true && cC.c1.items.m1.whiteboard[0].x === 400 && j(ids(cC.c1.items.m1.whiteboard)) === j(['tA', 's1', 'g1'])
        && rD === true && cD.c1.items.m1.whiteboard[0].x === 400 && rE === false && j(cE.c1.items.m1) === j(mk().c1.items.m1), j([rA, cA.c1.items.m2, rC, ids(cC.c1.items.m1.whiteboard), rD, rE, cE.c1.items.m1.whiteboard[0]]));
    // #3: a new drawing's id
    const cI = mk(), oddIds = ['x'.repeat(100000), 'constructor', '__proto__', 'hasOwnProperty', '"><b>', '', 'a b', 'x'.repeat(81)];
    const rI = runP(cI, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 0, y: 0 }, sk('s1', [[0, 0], [1, 1]])].concat(oddIds.map(id => sk(id))).concat([sk('dup', [[1, 1], [2, 2]]), sk('dup', [[3, 3], [4, 4]]), sk('dup', [[5, 5], [6, 6]]), sk('wb' + 'k'.repeat(78)), sk('a.b:c-d_e')]) } }, { id: 'u_p', location: 'm1' });
    const wbI = cI.c1.items.m1.whiteboard;
    check('security (patch, host): a new drawing\'s id is short plain text — letters, digits, _ . : - and up to 80 of them — and never a prototype\'s key: one 100,000 characters long, "constructor", "__proto__", "hasOwnProperty", markup, an empty one, one with a space and one 81 long each name nothing and are stored nowhere; the same new id three times in one copy lands once (the later entries redraw the first); the existing token and drawing are untouched',
        rI === true && j(ids(wbI)) === j(['tA', 's1', 'dup', 'wb' + 'k'.repeat(78), 'a.b:c-d_e']) && j(wbI.find(w => w.id === 'dup').pts) === j([[5, 5], [6, 6]]) && j(wbI[0]) === j(mk().c1.items.m1.whiteboard[0]) && j(wbI[1].pts) === j([[0, 0], [1, 1]]) && JSON.stringify(cI).length < 2000,
        j([rI, ids(wbI).map(s => s.slice(0, 20)), JSON.stringify(cI).length]));
    // #23: a budget of points per player per map
    const big = n => { const p = []; for (let i = 0; i < n; i++) p.push([i, i]); return p; };
    const cB = mk(), many = []; for (let i = 0; i < 600; i++) many.push(sk('b' + i, big(4000)));
    const rB = runP(cB, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 0, y: 0 }, sk('s1', [[0, 0], [1, 1]])].concat(many) } }, { id: 'u_p', location: 'm1' });
    const wbB = cB.c1.items.m1.whiteboard, ptsOf = () => wbB.filter(w => w.type === 'path' && w.byPlayer).reduce((n, w) => n + w.pts.length, 0), held = () => wbB.filter(w => w.type === 'path').map(w => sk(w.id, w.pts));
    const step1 = { ret: rB, ids: ids(wbB), pts: ptsOf(), bytes: JSON.stringify(cB.c1.items.m1).length };
    const rB2 = runP(cB, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 0, y: 0 }].concat(held()).concat([sk('more4k', big(4000)), sk('tiny', [[0, 0], [1, 1]])]) } }, { id: 'u_p', location: 'm1' });
    const step2 = { ret: rB2, more: ids(wbB).includes('more4k'), tiny: ids(wbB).includes('tiny'), pts: ptsOf() };
    const rB3 = runP(cB, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 0, y: 0 }].concat(held().map(h => h.id === 's1' ? sk('s1', big(4000)) : h)) } }, { id: 'u_p', location: 'm1' });
    const step3 = { ret: rB3, s1: wbB.find(w => w.id === 's1').pts.length, pts: ptsOf() };
    const rB4 = runP(cB, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 'tA', x: 0, y: 0 }].concat(held().map(h => h.id === 's1' ? sk('s1', big(3000)) : h)) } }, { id: 'u_p', location: 'm1' });
    const step4 = { ret: rB4, s1: wbB.find(w => w.id === 's1').pts.length, pts: ptsOf(), tA: j(wbB[0]) === j(mk().c1.items.m1.whiteboard[0]) };
    check('security (patch, host): a player\'s drawings on one map are bounded by their points as well as by their count — 600 new drawings of 4,000 points each leave 14 on the map (60,000 points a player a map, counted with what is there), the map under 2 MB; a further drawing of 4,000 points is refused while a small one still lands; a redraw of 4,000 points that would take their points past the budget is refused and one of 3,000 within it lands; their token is untouched throughout',
        step1.ret === true && j(step1.ids.slice(0, 3)) === j(['tA', 's1', 'b0']) && step1.ids.length === 16 && step1.pts === 56002 && step1.bytes < 2e6
        && step2.ret === true && step2.more === false && step2.tiny === true && step2.pts === 56004
        && step3.ret === false && step3.s1 === 2 && step3.pts === 56004 && step4.ret === true && step4.s1 === 3000 && step4.pts === 59002 && step4.tA,
        j([step1.ret, step1.ids.length, step1.pts, step1.bytes, step2, step3, step4]));
}
// R2 security (cluster A, #3, the delta path): the host's itemDelta and a player's applyItemDelta key their id maps off the prototype, so a drawing
// an older save named for a prototype's key ("constructor") is deleted on every copy when it is erased, instead of standing as a ghost
{
    const qh = new Function(fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\nreturn quickHash;')();
    const idSrc = lineOf('function uniqueIds(', 'netfog.js') + '\n' + fnSrc('function itemDelta(itemId, clean) {', '\nfunction applyItemDelta(', 'itemDelta', 'netfog.js');
    const mkMap = ids => ({ type: 'map', id: 'm1', whiteboard: ids.map(id => ({ id, type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[0, 0], [1, 1]] })), rooms: [] });
    const delta = (baseIds, nowIds) => new Function('_lastSent', 'quickHash', 'cleanMap', idSrc + '\nreturn itemDelta("m1", cleanMap);')({ m1: mkMap(baseIds) }, qh, mkMap(nowIds));
    const dC = delta(['t1', 'constructor', 'toString'], ['t1']), dAdd = delta(['t1'], ['t1', 'constructor']), dPlain = delta(['t1', 'd2'], ['t1']);
    const adSrc = fnSrc('function applyItemDelta(msg) {', '\n}\n', 'applyItemDelta', 'netfog.js') + '\n}\n';
    const applyD = (ids, msg) => {
        const camp = { id: 'c1', activeItemId: 'm1', items: { m1: mkMap(ids) } }, asked = [];
        new Function('state', 'net', 'window', 'broadcast', 'cleanHostMap', 'actOver', 'ackIn', 'getActiveCampaign', 'render', 'updateSidebarNav', 'msg',
            ownKeySrc + adSrc + '\napplyItemDelta(msg);')({ appState: { campaigns: { c1: camp } } }, { applyingRemote: false }, {}, m => asked.push(m.type), () => {}, () => {}, () => 0, () => camp, () => {}, () => {}, msg);
        return { ids: camp.items.m1.whiteboard.map(w => w.id), asked };
    };
    const aDel = applyD(['t1', 'constructor', 'hasOwnProperty'], { type: 'itemDelta', campId: 'c1', itemId: 'm1', whiteboard: { set: [], del: ['constructor', 'hasOwnProperty'], order: ['t1'] } });
    const aSet = applyD(['t1', 'constructor'], { type: 'itemDelta', campId: 'c1', itemId: 'm1', whiteboard: { set: [{ id: 'constructor', type: 'path', byPlayer: true, ownerId: 'u_p', pts: [[5, 5], [6, 6]] }], del: [] } });
    const aOrder = applyD(['t1', 'constructor', 'd2'], { type: 'itemDelta', campId: 'c1', itemId: 'm1', whiteboard: { set: [], del: [], order: ['constructor', 'd2', 't1'] } });
    check('security (deltas, both sides — the real itemDelta and applyItemDelta): a drawing named for a prototype\'s key is a drawing like any other — erased on the host, the delta names it in del (it used to count as still there, so every other copy kept a ghost of it); added, the delta sets it; a player\'s copy told to delete it deletes it, told to set it replaces its own copy once, and sorts it by the order given',
        j(dC.whiteboard) === j({ set: [], del: ['constructor', 'toString'], order: ['t1'] }) && j(dAdd.whiteboard) === j({ set: [mkMap(['constructor']).whiteboard[0]], del: [], order: ['t1', 'constructor'] }) && j(dPlain.whiteboard) === j({ set: [], del: ['d2'], order: ['t1'] })
        && j(aDel.ids) === j(['t1']) && j(aSet.ids) === j(['t1', 'constructor']) && j(aOrder.ids) === j(['constructor', 'd2', 't1']) && [aDel, aSet, aOrder].every(a => a.asked.length === 0),
        j([dC, dAdd, dPlain, aDel, aSet, aOrder]));
}
{   // 1.6.3 (the owner's ruling of 2026-11-17, finding 13: "Keep it across sessions"): a player's explored ground, kept by the host (fog.js
    // memHostNote), is sent to each connection of theirs once a map and a grid and fog epoch (memSendTo, sliced by its memsend markers and run for
    // real), and their app takes it from the synced host alone (the fogMem branch, sliced by its fogmem markers and run for real)
    const msSrc = between('// [netcheck:memsend-start]', '// [netcheck:memsend-end]', 'memsend', 'netfog.js'), fmSrc = between('// [netcheck:fogmem-start]', '// [netcheck:fogmem-end]', 'fogmem');
    const ownM = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
    const asked = [], memOut = (camp, map, pid, sent) => { asked.push([map.id, pid, sent]); return pid === 'u_a' && sent !== 'K1' ? { k: 'K1', c: ['1,1', '2,1'] } : null; };
    const win = { wpFog: { memOut: memOut } }, fails = [];
    const M = new Function('window', 'own', 'sendFailed', msSrc + '\nreturn { memSendTo: memSendTo, memSentForget: memSentForget };')(win, ownM, e => fails.push(String(e)));
    const sentA = [], sentB = [], cA = { peer: 'pA', open: true, send: m => { packCheck(m); sentA.push(JSON.parse(JSON.stringify(m))); } }, cA2 = { peer: 'pA2', open: true, send: m => sentB.push(m) }, cShut = { peer: 'pS', open: false, send: () => fails.push('shut') };
    const campM = { id: 'k1', items: { mA: { id: 'mA', type: 'map' } } };
    M.memSendTo(cA, 'u_a', campM, 'mA'); M.memSendTo(cA, 'u_a', campM, 'mA'); M.memSendTo(cA2, 'u_a', campM, 'mA'); M.memSendTo(cShut, 'u_a', campM, 'mA'); M.memSendTo(cA, 'u_a', campM, 'nope');
    const afterTwice = sentA.length; M.memSentForget('pA'); M.memSendTo(cA, 'u_a', campM, 'mA'); const afterForget = sentA.length; M.memSentForget(null, 'mA'); M.memSendTo(cA, 'u_a', campM, 'mA'); const afterMap = sentA.length;
    check('1.6.3 (finding 13) a player\'s explored ground on the wire (net.js memSendTo, run for real): one connection is sent its player\'s ground of a map once for each grid and fog epoch, as the message fogMem with the campaign, the map, the key and the cells; asked again it sends nothing, another connection of theirs gets its own, a closed connection and a map that is not there nothing; forgetting the connection or the map sends it again',
        afterTwice === 1 && j(sentA[0]) === j({ type: 'fogMem', campId: 'k1', itemId: 'mA', k: 'K1', c: ['1,1', '2,1'] }) && sentB.length === 1 && j(asked.slice(0, 2)) === j([['mA', 'u_a', null], ['mA', 'u_a', 'K1']]) && afterForget === 2 && afterMap === 3 && fails.length === 0, j([sentA, sentB.length, asked, fails]));
    const seeds = [], mkC = (o) => { const net = Object.assign({ role: 'client', foreign: true, syncedPeer: 'h', stream: false }, o || {}), state = { appState: { activeCampaignId: 'k1' } };
        return new Function('net', 'state', 'window', 'validKey', 'return function(msg, conn) {\n' + fmSrc + '\n};')(net, state, { wpFog: { memSeed: (id, k, c) => seeds.push([id, k, c.length]) } }, k => typeof k === 'string' && k.length > 0 && !(k in Object.prototype)); };
    const okMsg = { type: 'fogMem', campId: 'k1', itemId: 'mA', k: 'K1', c: ['1,1'] };
    mkC()(okMsg, { peer: 'h' }); mkC()(okMsg, { peer: 'x' }); mkC({ stream: true })(okMsg, { peer: 'h' }); mkC({ foreign: false })(okMsg, { peer: 'h' });
    mkC()(Object.assign({}, okMsg, { campId: 'k2' }), { peer: 'h' }); mkC()(Object.assign({}, okMsg, { itemId: '__proto__' }), { peer: 'h' }); mkC()(Object.assign({}, okMsg, { k: 5 }), { peer: 'h' }); mkC()(Object.assign({}, okMsg, { c: 'x' }), { peer: 'h' });
    check('1.6.3 (finding 13) a player\'s app takes its explored ground (the fogMem branch, run for real) from the synced host alone, after its snapshot, never in the stream window, for the campaign on screen, a map by a valid key, a key that is text and cells that are a list; it hands them to fog.js memSeed, which reads them as data',
        j(seeds) === j([['mA', 'K1', 1]]), j(seeds));
    check('1.6.3 (finding 13) the explored ground is the host\'s: sanitizeAppState sends no campaign\'s fogMem, no player\'s message writes it (fogMem is a branch of a player\'s app alone, the host\'s branches as they were), and it is sent after each whole copy of a fogged map goes, by the join snapshot, a copy sent alone and one sent to the table',
        /delete camp\.pinnedPages; delete camp\.groups; delete camp\.panelOrder; delete camp\.fogMem;/.test(require('./checkkit').part('netfog.js')) && !/msg\.type === 'fogMem' && net\.role === 'host'/.test(src) && /msg\.type === 'fogMem' && net\.role === 'client'/.test(src)
        && (src.match(/if \(typeof memSendTo === 'function'\) memSendTo\(conn, pr\.id, camp, itemId\);/g) || []).length === 2 && /fogSeed\(conn, id, sc\.items\[id\]\); var prS = net\.roster\[conn\.peer\]; if \(prS && typeof prS\.id === 'string'\) memSendTo\(conn, prS\.id, camp, id\);/.test(require('./checkkit').part('netfog.js'))
        && /function fogForgetConn\(peer\) \{ if \(typeof memSentForget === 'function'\) memSentForget\(peer\);/.test(require('./checkkit').part('netfog.js')) && /if \(typeof memSentForget === 'function'\) memSentForget\(null, mapId\);/.test(require('./checkkit').part('netfog.js')) && /if \(typeof memSentForget === 'function'\) memSentForget\(null, null\);/.test(require('./checkkit').part('netfog.js')));
    // the review of 1.6.3 (finding 13). (a) A map taken back from a connection (the take-back, fogForgetOne, its line run for real) forgets the key
    // of the ground last sent to that connection for that map alone, so it is sent again on their return though their screen let it go meanwhile
    const ffLine = (require('./checkkit').part('netfog.js').match(/\nfunction fogForgetOne\([^\n]*/) || [''])[0];   // in netfog.js, a part of net.js
    const FF = new Function('own', "'use strict'; var _fogHeld = { pA: { mA: 1, mB: 1 } }, _hidPend = { pA: { mA: 1 } }, _memSent = { pA: { mA: 'K1', mB: 'K2' }, pB: { mA: 'K3' } };" + ffLine + '\nreturn { run: fogForgetOne, sent: function() { return _memSent; }, held: function() { return _fogHeld; } };')(ownM);
    FF.run('pA', 'mA'); FF.run('pZ', 'mA'); FF.run(5, 'mA');
    const FF2 = new Function('own', "'use strict'; var _fogHeld = { pA: { mA: 1 } }, _hidPend = {};" + ffLine + '\nreturn fogForgetOne;')(ownM); let ff2 = ''; try { FF2('pA', 'mA'); } catch (e) { ff2 = String(e); }
    check('the review of 1.6.3 (finding 13): a map taken back from a connection forgets the explored ground last sent to it for that map alone (fogForgetOne, its line run for real), so their return sends it again; another map, another connection and a stranger are left as they were; with no record of what was sent nothing throws',
        j(FF.sent()) === j({ pA: { mB: 'K2' }, pB: { mA: 'K3' } }) && j(FF.held()) === j({ pA: { mB: 1 } }) && ff2 === '', j([FF.sent(), ff2]));
    // (b) the ground a token is dragged through: an accepted drag notes the places it passes, about half a cell apart and 400 at most, thinned
    // evenly (the pos gate's line, run for real), and an accepted drop hands them a moment later to fog.js memHostPath with every other open drag
    // held at its start (the drop's line, run for real); a drop never hands the same path twice
    const recLine = src.split('\n').find(l => l.indexOf('var pthW = frW.path') >= 0) || '', dropLine = src.split('\n').find(l => l.indexOf('window.wpFog.memHostPath(mapD, campD, pidD, wD, pathD)') >= 0) || '';
    const rec = new Function('frW', 'w', 'msg', recLine);
    const frR = { x: 0, y: 0 }, moves = [[10, 0], [30, 0], [40, 0], [70, 5], [70, 5], [200, 0]]; moves.forEach(m => rec(frR, { x: m[0], y: m[1], rot: 90 }, { final: false })); rec(frR, { x: 900, y: 0 }, { final: true });
    const frBig = { x: 0, y: 0 }; for (let i = 1; i <= 1000; i++) rec(frBig, { x: i * 30, y: 0 }, { final: false });
    const ran = [], timers = [], landed = [], winD = { wpFog: { memHostPath: (m, c, p, w, pts) => { ran.push([m.id, c.id, p, w.id, pts.length]); return pts.length; } } };
    const drop = new Function('frW', 'map', 'w', 'camp', 'pr', 'window', 'setTimeout', 'fogLanded', 'console', dropLine);
    const frD = { path: [{ x: 1, y: 1 }, { x: 40, y: 1 }] }; drop(frD, { id: 'mA' }, { id: 'tA' }, { id: 'k1' }, { id: 'u_a' }, winD, f => timers.push(f), (mid, fn) => { landed.push(mid); return fn(); }, console);
    const before = ran.length; timers.forEach(f => f()); drop(frD, { id: 'mA' }, { id: 'tA' }, { id: 'k1' }, { id: 'u_a' }, winD, f => timers.push(f), (mid, fn) => fn(), console); const again = timers.length;
    check('the review of 1.6.3 (finding 13): an accepted drag notes the places it passes, about half a cell apart, with its facing, the drop itself not among them and 400 at most, thinned evenly; an accepted drop hands them to fog.js memHostPath a moment later, with the other open drags held at their start, and never twice (the pos gate\'s two lines, run for real)',
        j(frR.path) === j([{ x: 30, y: 0, rot: 90, front: 0 }, { x: 70, y: 5, rot: 90, front: 0 }, { x: 200, y: 0, rot: 90, front: 0 }]) && frBig.path.length <= 400 && frBig.path.length > 200 && frBig.path[0].x === 30 && frBig.path[frBig.path.length - 1].x === 30000
        && before === 0 && j(ran) === j([['mA', 'k1', 'u_a', 'tA', 2]]) && j(landed) === j(['mA']) && frD.path === null && again === 1
        && src.indexOf(recLine) > src.indexOf('        if (fbW && conn && conn.open && typeof conn.send === ') && src.indexOf(recLine) < src.indexOf('        if (msg.final) {', src.indexOf(recLine)) && src.indexOf('            net.tokenDropped(w, map);') < src.indexOf(dropLine) && src.indexOf(dropLine) < src.indexOf('window.wpRecord.moved(map, w, frW')
        && /if \(wasHost && typeof fogDragSweep === 'function'\) fogDragSweep\(true\);[^\n]*\n\s*if \(wasHost && window\.wpFog && typeof window\.wpFog\.memFlush === 'function'\) \{ try \{ window\.wpFog\.memFlush\(true\);/.test(src), j([frR.path, frBig.path.length, ran, landed, again]));
}

T.finish();
