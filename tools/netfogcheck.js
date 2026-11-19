/* netfogcheck.js: a fogged map on the wire, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, area 9,
   2026-11-19). The code lives mostly in system/app/scripts/netfog.js, a part of net.js; every slice of its markers (foglit, mapheld, fogmove,
   memsend, acks, hidpend, landing, curstage, actlog, strokeacts, patch, drawshow, snapitems, broadcast, fogdiffapply) and every definition
   only it holds is read from the part by its own name, and the fights' orders from netfight.js by its own name, while the slices of other
   areas (the pos gate, the sends, the senses' resend) still read the joined net.js through srcjoin.
   What it covers, each block as it stood in netcheck.js: a player's copy of a fogged map following what their tokens see (sensesMoved, the
   live position relay judged afresh, what each copy was made by), a player's page as the fogDiff branch and applyFogDiff see it (fold M3,
   with mkFogClient, a player's page of plain objects), an open drag judged where it began and a player's copies caught up in place when a
   move lands (fold M4: the one-module world over the real fog.js, with every later fold that runs in it), a token's own ranges for its
   senses kept on a player's app (senses S2b), per-player map possession with the take-back (mapGive, mapTake, mapLeft, the stub), and,
   last, the patch gate and the delta between two copies (a token or a stroke the GM locked, a drawing made a wall or a barrier, the host's
   count for the GM's undo, R2 security's cluster A on the patch path and on the delta path), moved with the review of next area 6.
   Run: node tools/netfogcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file (netfog.js, netfight.js) reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc } = kit.netSlices('netfogcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { helpersSrc, storage, H, ownKeySrc, siSrc, fightIn } = kit.netHarness('netfogcheck');
const broadcastSrc = between('// [netcheck:broadcast-start]', '// [netcheck:broadcast-end]', 'broadcast', 'netfog.js');
const j = JSON.stringify;
check('netfogcheck: netfog.js is a part of net.js, read by its own name', kit.part('netfog.js').includes('// [split:body-start]') && kit.part('netfog.js').includes('// [netcheck:fogmove-start]') && kit.part('netfog.js').includes('// [netcheck:mapheld-start]'));

// Senses S0 (when vision changes): a character's change that moves what its tokens see by re-sends that player's own copy of each fogged map
// it moved on, with no map saved. Run for real: net.js's foglit and sensesmoved slices (sensesSeed, fogCopyFor, net.sensesMoved, sensesFire,
// sensesForget, sensesReset), the real sendItem and broadcastItemFiltered, the real character funnels (chardelta), a player's char-edit and
// char-effect, the effect timers (fxtime), the turn order and the target pointers (combats), the live position relay (bpos) and saveRemoteSoon,
// over the real fog.js (sightSigFor, viewersFor, tokenSightCells, canSeePoint, invalidateSeen, seenKeyOf, lightMoves), fogcore, systemcore and formula engine.
// A player's own move: the pos gate and the patch path (pos, patch, a move put back by snapBack) run for real over the same net, relay and fog —
// an accepted pos that takes the token into another cell or turns it (wpFog.seenKeyOf, read before the write and again after the seat) drops that
// player's set for that map, and every player's set for it where the token carries a light on a dark map (wpFog.lightMoves); one that leaves it
// in its cell and facing as it did drops nothing, but for a light carried inside a wall's cell, which is judged by its exact place; no map is sent
// after it by this fold. The threats branch, net.itemGone, net.kickPlayer and net.syncNewPlayers run for real too; a hidden Sight is the campaign's
// default on both sides (the owner's answer of 2026-09-29: fog.js sightSecret, in fogcheck), so the hook holds nothing back.
// Timers are fakes fired by hand; every message sent packs for the wire
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const read = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
    const fogT = read('fog.js'), sheetsT = read('sheets.js'), ioT = read('io.js');
    const fogA = fogT.indexOf('function core() {'), fogB = fogT.indexOf('/* ---------- the overlay');
    if (fogA < 0 || fogB < fogA) throw new Error('netcheck: the vision half of fog.js not found');
    const fogSrc = fogT.slice(fogA, fogB);
    const whole = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const flS = between('// [netcheck:foglit-start]', '// [netcheck:foglit-end]', 'foglit', 'netfog.js'), smS = between('// [netcheck:sensesmoved-start]', '// [netcheck:sensesmoved-end]', 'sensesmoved');
    const dlS = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta'), edS = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), fxS = between('// [netcheck:charfx-start]', '// [netcheck:charfx-end]', 'charfx');
    const ftS = between('// [netcheck:fxtime-start]', '// [netcheck:fxtime-end]', 'fxtime', 'nettime.js'), cbS = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats'), bpS = between('// [netcheck:bpos-start]', '// [netcheck:bpos-end]', 'bpos');
    const siS = siSrc();
    const afS = fnSrc('function anyFog(', '\n}\n', 'anyFog', 'netfog.js') + '\n}\n', mfS = lineOf('function mapFogged('), svS = lineOf('var _saveSoon = null;') + '\n' + lineOf('function saveRemoteSoon()');
    const nsS2 = between('// [netcheck:newplayerssync-start]', '// [netcheck:newplayerssync-end]', 'newplayerssync'), thS2 = between('// [netcheck:threats-start]', '// [netcheck:threats-end]', 'threats');
    const posS2 = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), patS2 = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js'), clS2 = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
    const netSrc = ['var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {}, bannedIds = {};', siS, flS, afS, mfS, whole('net.sendItem = function('), whole('net.broadcastItemFiltered = function('), whole('net.itemGone = function('), whole('net.kickPlayer = function('), smS, nsS2, cbS, ordersSrc, svS, dlS, ftS, bpS,
        'return { edit: function(msg, conn) {', edS, '}, fx: function(msg, conn) {', fxS, '}, threats: function(msg, conn) {', thS2, '}, sig: function() { return _sensesSig; }, pend: function() { return _sensesPend; }, at: function() { return _sensesAt; }, seed: sensesSeed, fire: sensesFire, forget: sensesForget, reset: sensesReset, pids: sensesPids,',
        'drop: sensesDrop, forgetMap: sensesForgetMap, keys: sensesKeys, banned: function() { return bannedIds; },',
        'targets: typeof broadcastTargets === \'function\' ? broadcastTargets : null, targetsFor: typeof targetsFor === \'function\' ? targetsFor : null,',
        'copy: fogCopyFor, pos: broadcastPos, saveSoon: saveRemoteSoon, turn: turnFxStart, ms: SENSES_RESEND_MS, last: function() { return _lastSent; } };'].join('\n');
    const NAMES = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'peerProfileId', 'lim', 'own', 'pushChat', 'state', 'itemDelta', 'broadcast', '_lastSent', 'setTimeout', 'clearTimeout', 'save', 'toast', 'logEvent', 'renderRoster', 'dropWaitingFor', 'allow', 'render', 'broadcastRoster'];
    // a player's live move and the map copy their app saves after it: the real pos gate and the real patch path, over the same net, fog, relay and save
    const buildPos = new Function('state', 'net', 'window', 'peerPaused', 'allow', 'checkRoomHandouts', 'applyPosToDom', 'broadcastPos', 'toast', 'saveRemoteSoon', 'sendFailed', 'setTimeout', 'playerStroke', 'SC', 'getActiveCampaign', 'bellOut',
        clS2 + ownKeySrc + posS2 + '\n' + patS2 + '\n' + ordersSrc + '\nreturn { pos: function(m, c) { return handlePos(m, c); }, patch: function(m, p) { return applyClientItemFiltered(m, p); } };');
    const buildNet = new Function(...NAMES, netSrc);
    const buildFog = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { fogDropIds: fogDropIds, fogLitFor: fogLitFor, canSeePoint: canSeePoint, invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor, tokenSightCells: tokenSightCells, viewersFor: viewersFor, blocked: moveBlocked, wallCells: function(m) { return Object.keys(blockersFor(m, gridForMap(m)) || {}).sort(); }, held: function() { return Object.keys(_keyCache).sort(); }, seen: function(k) { return _keyCache[k]; }, walls: function() { return Object.keys(_blockerCache).sort(); } };');
    const sysS = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [
        { id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }, { id: 'f_mana', key: 'Mana', label: 'Mana', kind: 'number', def: 5, edit: 'owner', vis: 'all' }, { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', edit: 'owner' }],
        effects: [{ id: 'e_daze', name: 'Dazzled', dur: '2 turns', mods: [{ f: 'f_sight', op: 'add', v: -40 }] }, { id: 'e_bless', name: 'Bless', dur: '2 turns', mods: [{ f: 'f_mana', op: 'add', v: 1 }] }] }, { F: Fx, gmView: true });
    const T = (id, owner, charId, c, r, more) => Object.assign({ id, type: 'image', isChar: true, charName: id, x: c * 50, y: r * 50, w: 50, h: 50, rot: 0, front: 0 }, owner ? { ownerId: owner } : {}, charId ? { charId } : {}, more || {});
    const M = (id, per, fog, wb, meta) => ({ id, type: 'map', meta: Object.assign({ title: id, gridType: 'square', cellValue: per, cellUnit: 'ft' }, meta || {}), rooms: [], links: [], fog: Object.assign({ on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } }, fog || {}), whiteboard: wb });
    // mA: 5 ft squares, the orc 13 cells and the ogre 15 cells from Ana's token; mB: 10 ft squares, its orc 7 cells from hers; mO holds no token of hers
    const mapsAll = () => ({
        mA: M('mA', 5, null, [T('tA', 'u_a', 'c_a', 2, 2), T('tB', 'u_b', 'c_b', 2, 50), T('tC', 'u_c', 'c_c', 60, 50), T('orc', '', 'c_n', 15, 2), T('ogre', '', 'c_n', 17, 2)]),
        mB: M('mB', 10, null, [T('tA2', 'u_a', 'c_a', 2, 2), T('tB3', 'u_b', 'c_b', 2, 50), T('orc2', '', 'c_n', 9, 2)]),
        mO: M('mO', 5, null, [T('tB2', 'u_b', 'c_b', 2, 2), T('orc3', '', 'c_n', 15, 2)]),
        mL: M('mL', 5, { light: 'bright' }, [T('tA3', 'u_a', 'c_a', 2, 2), T('orc4', '', 'c_n', 15, 2)]),
        mD: M('mD', 5, { light: 'dim' }, [T('tA4', 'u_a', 'c_a', 2, 2)]),
        mR: M('mR', 5, { mode: 'reveal' }, [T('tA5', 'u_a', 'c_a', 2, 2)]),
        mV: M('mV', 5, { mode: 'cover' }, [T('tA6', 'u_a', 'c_a', 2, 2)]),
        mG: M('mG', 5, null, [T('tA7', 'u_a', 'c_a', 2, 2)], { gridType: 'off' }),
        mY: M('mY', 5, { on: 'yes' }, [T('tA8', 'u_a', 'c_a', 2, 2)]),
        mU: M('mU', 5, { on: false }, [T('tA9', 'u_a', 'c_a', 2, 2), T('orc5', '', 'c_n', 15, 2)]),
        dD: { id: 'dD', type: 'doc', meta: { title: 'dD' }, fog: { on: true }, whiteboard: [T('tA10', 'u_a', 'c_a', 2, 2)] } });
    const mkW = o => {
        o = o || {};
        const ev = [], feats = Object.assign({ fog: true, lighting: true, sheets: true, turning: true }, o.feats || {}), all = mapsAll(), items = {};
        (o.maps || Object.keys(all)).forEach(id => { items[id] = all[id]; });
        const camp = { id: 'k', system: o.system || sysS, fog: { fields: { sight: 'f_sight', sightUnit: 'ft' }, defaults: { sight: 30 } }, items, chars: {
            c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sight: 60, f_fx: [] } }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_sight: 60 } },
            c_c: { id: 'c_c', name: 'Cy', ownerId: 'u_c', npc: false, values: { f_sight: 60 } }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: { f_sight: 60 } } } };
        const W = { ev, camp, feats, live: true, saves: [], shared: [], chat: [], bc: [], seq: [] };   // seq (M1 round 2): every send, the redraw and the roster going out, in order
        const mkConn = (peer, open) => ({ peer, open, sent: [], send(m) { packCheck(m); W.seq.push('send:' + peer + ':' + m.type); ev.push('send:' + peer + ':' + m.type + (m.itemId ? ':' + m.itemId : '')); this.sent.push(JSON.parse(j(m))); } });
        W.a1 = mkConn('pA1', true); W.a2 = mkConn('pA2', true); W.b1 = mkConn('pB', true); W.w1 = mkConn('pW', true); W.c1 = mkConn('pC', false);
        W.net = { active: true, role: 'host', paused: false, applyingRemote: false, myId: 'u_gm', conns: [W.a1, W.a2, W.b1, W.w1, W.c1], roster: { pA1: { id: 'u_a', name: 'Pat' }, pA2: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' }, pC: { id: 'u_c', name: 'Cy' } }, combats: {}, targets: {} };
        const win = { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpDiceCore: null, wpVtt: { on: k => feats[k] !== false, campaignOn: k => feats[k] !== false, mode: () => (W.net.role === 'host' ? 'host' : 'client') }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } };
        const getCamp = () => (W.live ? camp : null);
        W.fog = buildFog(win, { getElementById: () => null }, () => null, getCamp, { appState: { campaigns: { k: camp } } });
        if (!o.noFog) win.wpFog = Object.assign({}, W.fog, { invalidateSeen: function(id, pid) { ev.push(arguments.length ? 'inv:' + (typeof id === 'string' ? id : typeof id) + (arguments.length > 1 ? '>' + (typeof pid === 'string' ? pid : typeof pid) : '') : 'inv'); W.fog.invalidateSeen.apply(null, arguments); }, invalidateVision: () => { ev.push('invAll'); W.fog.invalidateVision(); },
            sightSigFor: (p, c, m) => { const s = W.fog.sightSigFor(p, c, m); ev.push('sig:' + p + '|' + (m && m.id) + '=' + s); return s; } });
        if (o.win) o.win(win);
        W.win = win;
        W.timers = [];
        const setT = (fn, ms) => { W.timers.push({ fn, ms }); ev.push('timer:' + ms); return W.timers.length; }, clearT = id => { const t = W.timers[id - 1]; if (t && t.fn) { t.fn = null; ev.push('clear:' + t.ms); } };
        W.fire = ms => { const due = W.timers.filter(t => t.fn && t.ms === ms); due.forEach(t => { const f = t.fn; t.fn = null; f(); }); return due.length; };
        W.waiting = ms => W.timers.filter(t => t.fn && t.ms === ms).length;
        W.made = ms => W.timers.filter(t => t.ms === ms).length;
        W.state = { appState: { campaigns: { k: camp } } }; W.SC = () => Sx; W.toasts = [];
        W.api = buildNet(W.net, () => W.SC(), win, () => false, getCamp, e => { throw e; }, c => (W.net.roster[c.peer] ? W.net.roster[c.peer].id : null), { allow: () => true }, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), m => W.chat.push(m),
            W.state, () => (W.delta === undefined ? false : W.delta), (m, x) => { W.bc.push(JSON.parse(j(m))); W.shared.push(m.type + ':' + (m.itemId || '')); }, {}, setT, clearT, a => W.saves.push([a, W.net.applyingRemote]), t => W.toasts.push(t), () => {}, () => ev.push('roster'), pid => ev.push('dropWaiting:' + pid), () => true, () => W.seq.push('render'), () => W.seq.push('roster-out'));
        W.ats = () => { const o2 = {}, s = W.api.at(); Object.keys(s).sort().forEach(k => { o2[k] = s[k]; }); return o2; };
        W.invs = () => ev.filter(e => /^inv(:|$)/.test(e));
        W.itemsOut = () => W.net.conns.map(c => c.sent.filter(m => m.type === 'item').length);
        W.clear = () => { ev.length = 0; W.seq.length = 0; W.net.conns.forEach(c => { c.sent.length = 0; }); };
        W.sendAll = () => { Object.keys(camp.items).forEach(id => W.net.broadcastItemFiltered('k', id)); W.clear(); W.shared.length = 0; };   // every map as the table holds it: the copies made here seed what each player's was made by
        W.gm = (charId, v) => { camp.chars[charId].values.f_sight = v; W.net.syncCharDelta(charId, { f_sight: v }); };
        W.pendKeys = () => Object.keys(W.api.pend()).sort();
        W.sigs = () => { const o2 = {}, s = W.api.sig(); Object.keys(s).sort().forEach(k => { o2[k] = s[k]; }); return o2; };
        W.items = c => c.sent.filter(m => m.type === 'item').map(m => m.itemId + ':' + m.item.whiteboard.map(w => w.id).join('+'));
        W.types = c => c.sent.map(m => m.type + (m.itemId ? ':' + m.itemId : ''));
        if (!o.bare) W.sendAll();
        return W;
    };
    const EDIT = (fid, v, charId) => ({ type: 'char-edit', rid: 'e1', charId: charId || 'c_a', fieldId: fid, value: v });
    const quietOthers = W => W.b1.sent.length === 0 && W.w1.sent.length === 0 && W.c1.sent.length === 0;
    const noMapOthers = W => !W.b1.sent.some(m => m.type === 'item' || m.type === 'combats' || m.type === 'targets') && W.w1.sent.length === 0 && W.c1.sent.length === 0;

    // 0. the ground the cases stand on: the real fog.js gives cells, and the stores start as the copies sent made them
    {
        const W = mkW(), s0 = W.sigs();
        const D = mkW({ maps: ['mA', 'mL'], feats: { lighting: false } }), dark = D.sigs(), E = mkW({ maps: ['mA', 'mL'], bare: true }); E.camp.fog.defaults.emptyFog = 'none'; E.sendAll();
        const O = mkW({ maps: ['mL', 'mD'], bare: true }); O.camp.items.mL.whiteboard.push({ id: 'keep', type: 'rect', x: 5000, y: 5000, w: 4000, h: 4000, blocksSight: true }); O.sendAll();   // 80 cells square: over the old cap of 6000 cells, which since 1.6.3 (finding 0) switches no wall off
        check('senses S0 (the ground): with Lighting off every fogged map reads by sight, a lit one too, while a lit map whose walls are past the old cap reads L as any lit map (1.6.3, finding 0: its walls are walls); where the campaign draws no fog on a map without a play area nothing is kept at all',
            j(dark) === j({ 'u_a|mA': '12', 'u_a|mL': '12', 'u_b|mA': '12', 'u_b|mL': '' }) && FCx.LIMITS.blockerCells === 6000 && j(O.sigs()) === j({ 'u_a|mD': 'L', 'u_a|mL': 'L', 'u_b|mD': '', 'u_b|mL': '' }) && j(E.sigs()) === j({}), j([dark, O.sigs(), E.sigs()]));
        check('senses S0 (the ground): every copy of a fogged map made for a player records what their own tokens saw by, in cells — 60 ft is 12 cells on 5 ft squares and 6 on 10 ft squares, a lit or a dim map reads L whatever the sight, a map with no token of theirs an empty text; nothing is kept for a map shown whole, covered whole, without a grid, without fog or whose fog switch is not the word true, for a page, for a waiting peer or for a closed connection',
            j(s0) === j({ 'u_a|mA': '12', 'u_a|mB': '6', 'u_a|mD': 'L', 'u_a|mL': 'L', 'u_a|mO': '', 'u_b|mA': '12', 'u_b|mB': '6', 'u_b|mD': '', 'u_b|mL': '', 'u_b|mO': '12' }) && W.api.ms === 500 && j(W.api.pids()) === j(['u_a', 'u_b']) && W.made(500) === 0, j([s0, W.api.ms, W.api.pids()]));
    }

    // 1, 2. a player's own Sight edit: once, to the owner's connections only, after 500 ms, the character first
    {
        const W = mkW({ maps: ['mA', 'mO', 'mU'] }), before = W.fog.fogDropIds('u_a', W.camp, W.camp.items.mA);
        W.api.edit(EDIT('f_sight', 65), W.a1);
        const atOnce = { a1: W.types(W.a1), a2: W.types(W.a2), made: W.made(500), keys: W.pendKeys(), others: noMapOthers(W), mate: W.types(W.b1) };
        const n1 = W.fire(500), late = { a1: W.types(W.a1), a2: W.types(W.a2), items1: W.items(W.a1), items2: W.items(W.a2), others: noMapOthers(W), again: W.fire(500), left: W.pendKeys(), sig: W.sigs()['u_a|mA'], base: 'mA' in W.api.last(), shared: W.shared.slice() };
        check('senses S0: a player\'s own change of Sight (a real char-edit, 60 ft to 65 ft) sends nothing of the map at once and queues one send of half a second for that player and that map; when it fires, each of the owner\'s two connections gets that map exactly once, as their own copy (the orc now 13 cells in sight is in it, the ogre at 15 is not) with no shared baseline left for it; a teammate gets the character as ever and no map, a waiting peer and a closed connection nothing',
            j(Object.keys(before).sort()) === j(['ogre', 'orc', 'tB', 'tC']) && j(atOnce) === j({ a1: ['char-ack', 'charDelta'], a2: ['charDelta'], made: 1, keys: ['u_a|mA'], others: true, mate: ['char'] }) && n1 === 1
            && j(late.items1) === j(['mA:tA+orc']) && j(late.items2) === j(['mA:tA+orc']) && late.others === true && late.again === 0 && j(late.left) === j([]) && late.sig === '13' && late.base === false && late.shared.length === 0, j([before, atOnce, late]));
        check('senses S0: on the wire the character comes first and the map after it — a change of values as charDelta then item, a whole character (syncChar) as char then item, every character (syncChars) as chars then item',
            j(late.a1) === j(['char-ack', 'charDelta', 'item:mA']) && j(late.a2) === j(['charDelta', 'item:mA'])
            && (() => { const V = mkW({ maps: ['mA'] }); V.camp.chars.c_a.values.f_sight = 65; V.net.syncChar('c_a'); V.fire(500); return j(V.types(V.a1)) === j(['char', 'item:mA']) && j(V.types(V.b1)) === j(['char']); })()
            && (() => { const V = mkW({ maps: ['mA'] }); V.camp.chars.c_a.values.f_sight = 65; V.net.syncChars(); V.fire(500); return j(V.types(V.a1)) === j(['chars', 'item:mA']) && j(V.types(V.b1)) === j(['chars']); })(), j([late.a1, late.a2]));
    }

    // 3, 4. who sees what is judged afresh first, and also when nothing is sent; an unrelated value sends no map
    {
        const W = mkW({ maps: ['mA', 'mO'] });
        W.camp.chars.c_a.values.f_sight = 65; W.net.sensesMoved('c_a'); const evMoved = W.ev.slice();
        const X = mkW({ maps: ['mA', 'mO'] }); X.api.edit(EDIT('f_mana', 9), X.a1); const evMana = X.ev.slice(), manaOut = [X.types(X.a1), X.types(X.a2), X.types(X.b1), X.made(500), X.fire(500)];
        const N = mkW({ maps: ['mA', 'mO'] }); N.camp.chars.c_n.values.f_sight = 5; N.net.syncCharDelta('c_n', { f_sight: 5 }); const evNpc = N.ev.slice(), npcOut = [N.net.conns.map(c => c.sent.length), N.made(500)];
        const E = mkW({ maps: ['mA'] }); E.live = false; E.net.sensesMoved('c_a'); const evNoCamp = E.ev.slice();
        const L = mkW({ maps: ['mA'] }); L.net.conns.forEach(c => { c.open = false; }); L.camp.chars.c_a.values.f_sight = 65; L.net.sensesMoved('c_a'); const evAlone = L.ev.slice();
        const Q = mkW({ maps: ['mA'] }); Q.camp.items = null; Q.net.sensesMoved('c_a'); const evNoItems = Q.ev.slice();
        // what the hook empties: primed by one call that changes nothing, so the host has seen every player's text once
        const prime = maps => { const P = mkW({ maps }); P.net.sensesMoved(null); P.fire(500); P.clear(); return P; };
        const D = prime(['mA', 'mB', 'mO']);
        D.gm('c_a', 64); const dMoved = D.ev.filter(e => /^inv|^sig:u_a\|mA|^timer/.test(e));   // 64 ft: 13 cells on 5 ft squares, 6 as before on 10 ft squares
        D.ev.length = 0; D.net.sensesMoved('c_a'); D.net.syncCharDelta('c_a', { f_sight: 64 }); const dSame = D.invs();
        D.ev.length = 0; D.camp.chars.c_a.values.f_mana = 9; D.net.syncCharDelta('c_a', { f_mana: 9 }); const dMana = D.invs();
        D.ev.length = 0; D.gm('c_a', 63); const dCells = D.invs();   // 63 ft: 13 cells still
        D.ev.length = 0; D.gm('c_a', 60); D.gm('c_a', 64); const dBack = D.invs();
        D.ev.length = 0; D.camp.chars.c_n.values.f_sight = 5; D.net.syncCharDelta('c_n', { f_sight: 5 }); const dNpc = D.invs();
        D.ev.length = 0; D.camp.chars.c_b.values.f_sight = 100; D.net.sensesMoved(null); const dAny = D.invs();   // 20 cells on 5 ft squares (mA, mO), 10 on 10 ft squares (mB)
        const Lt = prime(['mL', 'mD', 'mO']); Lt.gm('c_a', 5); const lit = [Lt.invs(), Lt.made(500), Lt.ev.filter(e => /^sig:u_a/.test(e))];
        // the set of one map goes, the other maps' sets stay: the real canSeePoint fills both first
        const H = prime(['mA', 'mB', 'mO']); H.fog.canSeePoint('u_a', H.camp, H.camp.items.mA, 125, 125); H.fog.canSeePoint('u_a', H.camp, H.camp.items.mB, 125, 125); H.fog.canSeePoint('u_b', H.camp, H.camp.items.mA, 125, 2525); H.fog.canSeePoint('u_b', H.camp, H.camp.items.mO, 125, 125);
        const held0 = H.fog.held(); H.gm('c_a', 64); const held1 = H.fog.held();
        check('senses S0: the hook empties the set the live position relay judges by only where the text the host last saw for a player on a map has moved, and only that map\'s — a change of Sight on a dark map empties that map\'s set exactly once, after the comparison and before the send is queued, and every other map\'s set stays; the same call again, a value that does not feed Sight, a change within the same cell count and an NPC\'s change empty nothing; a Sight that goes back empties it again; never the whole of it',
            j(dMoved) === j(['sig:u_a|mA=13', 'inv:mA', 'timer:500']) && j(dSame) === j([]) && j(dMana) === j([]) && j(dCells) === j([]) && j(dBack) === j(['inv:mA', 'inv:mA']) && j(dNpc) === j([]) && j(dAny) === j(['inv:mA', 'inv:mB', 'inv:mO'])
            && j(held0) === j(['u_a|mA', 'u_a|mB', 'u_b|mA', 'u_b|mO']) && j(held1) === j(['u_a|mB', 'u_b|mO'])
            && [evMoved, evMana, evNpc, evNoCamp, evAlone, evNoItems].every(l => !l.includes('inv') && !l.includes('invAll') && l.filter(e => /^inv:/.test(e)).every(e => e === 'inv:mA' || e === 'inv:mO'))
            && evMoved.includes('inv:mA') && evMoved.indexOf('inv:mA') > evMoved.indexOf('sig:u_a|mA=13') && evMoved.indexOf('inv:mA') < evMoved.indexOf('timer:500'), j([dMoved, dSame, dMana, dCells, dBack, dNpc, dAny, held0, held1, evMoved]));
        check('senses S0: on a lit or a dim map, where every token reads L whatever its Sight, a character\'s change of Sight empties nothing and queues nothing; with no campaign, a campaign without items or nobody at the table the hook compares nothing and empties nothing',
            j(lit) === j([[], 0, ['sig:u_a|mL=L', 'sig:u_a|mD=L']]) && j(evNoCamp) === j([]) && j(evAlone) === j([]) && j(evNoItems) === j([]), j([lit, evNoCamp, evAlone, evNoItems]));
        check('senses S0: a change of a value that does not feed Sight sends the character as ever and no map — no send is queued and nothing fires; an NPC\'s change of Sight sends no player a map',
            j(manaOut) === j([['char-ack', 'charDelta'], ['charDelta'], ['char'], 0, 0]) && j(npcOut) === j([[0, 0, 0, 0, 0], 0]) && evMana.filter(e => /^sig:u_a\|mA=12$/.test(e)).length === 1, j([manaOut, npcOut]));
    }

    // 5, 6. cells, not the number typed; per map
    {
        const W = mkW({ maps: ['mA', 'mB', 'mO'] });
        W.gm('c_a', 62); const at62 = [W.pendKeys(), W.made(500)];
        W.gm('c_a', 64); const at64 = [W.pendKeys(), W.made(500)]; W.fire(500); const out64 = [W.items(W.a1), W.items(W.a2), W.items(W.b1), W.sigs()['u_a|mA'], W.sigs()['u_a|mB']];
        const U = mkW({ maps: ['mA', 'mO'] }); U.camp.fog.fields.sightUnit = 'cells'; U.net.sensesMoved(null); const unitKeys = U.pendKeys(); U.fire(500); const unitSig = U.sigs();
        const Y = mkW({ maps: ['mA'] }); delete Y.camp.fog.fields.sight; Y.sendAll(); const flat0 = Y.sigs()['u_a|mA']; Y.gm('c_a', 5); const flat = [flat0, Y.pendKeys(), Y.made(500)];
        check('senses S0: what is compared is the sight in cells, not the number on the sheet — 60 ft to 62 ft on 5 ft squares is 12 cells both and queues nothing; the same number counted in cells instead of feet moves it for every player; with no Sight field mapped a character\'s change never moves it (the campaign\'s default, 30 ft, 6 cells)',
            j(at62) === j([[], 0]) && j(unitKeys) === j(['u_a|mA', 'u_b|mA', 'u_b|mO']) && unitSig['u_a|mA'] === '60' && unitSig['u_b|mO'] === '60' && j(flat) === j(['6', [], 0]), j([at62, unitKeys, unitSig, flat]));
        check('senses S0: the comparison is per map — 60 ft to 64 ft is 13 cells on 5 ft squares and still 6 on 10 ft squares, so the one map is queued and sent and the other is not',
            j(at64) === j([['u_a|mA'], 1]) && j(out64) === j([['mA:tA+orc'], ['mA:tA+orc'], [], '13', '6']), j([at64, out64]));
    }

    // 7, 8. the throttle, per player and map
    {
        const W = mkW({ maps: ['mA', 'mO'] });
        W.gm('c_a', 64); W.gm('c_a', 70); W.gm('c_a', 75); const three = [W.pendKeys(), W.made(500), W.items(W.a1)];
        const f1 = W.fire(500), one = [W.items(W.a1), W.items(W.a2), W.sigs()['u_a|mA'], W.pendKeys()];
        W.clear(); W.gm('c_a', 60); const again = [W.pendKeys(), W.made(500)]; W.fire(500); const back = [W.items(W.a1), W.sigs()['u_a|mA']];
        W.clear(); W.gm('c_a', 64); W.gm('c_a', 60); const wentBack = [W.pendKeys(), W.waiting(500)]; const f3 = W.fire(500), none = [W.net.conns.map(c => c.sent.filter(m => m.type === 'item').length), W.pendKeys(), W.sigs()['u_a|mA']];
        W.clear(); W.gm('c_a', 75); const after = [W.pendKeys(), W.made(500)];
        check('senses S0: three changes of Sight inside the half second queue one send and give one map, carrying the state of the moment it fires (75 ft, 15 cells: the orc and the ogre); a change after it fired queues again',
            j(three) === j([['u_a|mA'], 1, []]) && f1 === 1 && j(one) === j([['mA:tA+orc+ogre'], ['mA:tA+orc+ogre'], '15', []]) && j(again) === j([['u_a|mA'], 2]) && j(back) === j([['mA:tA'], '12']), j([three, one, again, back]));
        check('senses S0: a Sight that went back to what the player\'s copy was made by before the send fired sends nothing — the send is dropped at its own moment, what the copy was made by stays, and the next change queues afresh',
            j(wentBack) === j([['u_a|mA'], 1]) && f3 === 1 && j(none) === j([[0, 0, 0, 0, 0], [], '12']) && j(after) === j([['u_a|mA'], 4]), j([wentBack, none, after]));
        const V = mkW({ maps: ['mA', 'mO'] });
        V.gm('c_a', 64); V.gm('c_b', 64); V.gm('c_a', 75); V.gm('c_b', 75); const two = [V.pendKeys(), V.made(500)]; V.fire(500);
        check('senses S0: the half second is kept per player and per map — two players whose Sight changes in the same window each have their own sends waiting and each get their own copy of each map, the other\'s token never in it',
            j(two) === j([['u_a|mA', 'u_b|mA', 'u_b|mO'], 3]) && j(V.items(V.a1)) === j(['mA:tA+orc+ogre']) && j(V.items(V.a2)) === j(['mA:tA+orc+ogre']) && j(V.items(V.b1)) === j(['mA:tB', 'mO:tB2+orc3']) && V.w1.sent.length === 0 && V.c1.sent.length === 0, j([two, V.items(V.a1), V.items(V.b1)]));
    }

    // 9, 10. effects: a ticking timer, an expiry that feeds Sight, a player's own effect
    {
        const W = mkW({ maps: ['mA', 'mO'], bare: true });
        W.camp.chars.c_a.values.f_fx = [{ id: 'x_1', ref: 'e_daze', on: true, t: { left: 12, at: 0 } }, { id: 'x_2', ref: 'e_bless', on: true, t: { left: 12, at: 0 } }];
        W.sendAll(); const dazed = W.sigs()['u_a|mA'];
        const cb = { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA', init: 3, src: null }] }; W.net.combats = { mA: cb };
        W.api.turn('mA', cb); const tick = { left: W.camp.chars.c_a.values.f_fx.map(r => r.t.left), a1: W.types(W.a1), made: W.made(500), keys: W.pendKeys(), cmp: W.ev.filter(e => /^sig:/.test(e)) };
        W.clear(); cb.round = 2; W.api.turn('mA', cb); const gone = { rows: W.camp.chars.c_a.values.f_fx.length, a1: W.types(W.a1), keys: W.pendKeys(), chat: W.chat.map(m => m.text) };   // fold 3 (moved on purpose): the next round's turn, as a turn's timed effects count once a round
        W.fire(500); const ended = { a1: W.types(W.a1), a2: W.types(W.a2), b1: W.types(W.b1), items: W.items(W.a1), sig: W.sigs()['u_a|mA'] };
        check('senses S0: an effect\'s timer that only counts down (the real turn tick) sends the character and no map, though the hook is reached; when an effect that lowered Sight runs out, its player is sent that map once (60 ft again: 12 cells), and nobody else is',
            dazed === '4' && j(tick) === j({ left: [6, 6], a1: ['charDelta'], made: 0, keys: [], cmp: ['sig:u_a|mA=4', 'sig:u_b|mA=12'] }) && gone.rows === 0 && j(gone.keys) === j(['u_a|mA']) && j(gone.chat) === j(['Dazzled ran out on Ana.', 'Bless ran out on Ana.'])
            && j(ended.a1.filter(t => t === 'item:mA')) === j(['item:mA']) && ended.a1.indexOf('charDelta') < ended.a1.indexOf('item:mA') && j(ended.a2.filter(t => /^item/.test(t))) === j(['item:mA']) && !ended.b1.some(t => /^item|^combats|^targets/.test(t)) && j(ended.items) === j(['mA:tA']) && ended.sig === '12', j([dazed, tick, gone, ended]));
        const P = mkW({ maps: ['mA', 'mO'] });
        P.api.fx({ type: 'char-effect', rid: 'e1', charId: 'c_a', fieldId: 'f_fx', op: 'add', rowId: 'x_9', ref: 'e_daze' }, P.a1);
        const put = { a1: P.types(P.a1), keys: P.pendKeys(), made: P.made(500), rows: P.camp.chars.c_a.values.f_fx.map(r => r.ref) }; P.fire(500); const putOut = [P.items(P.a1), P.items(P.a2), P.items(P.b1), P.sigs()['u_a|mA']];
        const B = mkW({ maps: ['mA', 'mO'] });
        B.api.fx({ type: 'char-effect', rid: 'e1', charId: 'c_a', fieldId: 'f_fx', op: 'add', rowId: 'x_9', ref: 'e_bless' }, B.a1); const blessed = [B.types(B.a1), B.pendKeys(), B.made(500), B.ev.filter(e => /^sig:/.test(e))];
        check('senses S0: an effect a player puts on their own character (the real char-effect) that lowers Sight queues one send and their map follows the character (60 ft less 40 is 20 ft, 4 cells); one that feeds another value reaches the hook and sends no map',
            j(put) === j({ a1: ['char-ack', 'charDelta'], keys: ['u_a|mA'], made: 1, rows: ['e_daze'] }) && j(putOut) === j([['mA:tA'], ['mA:tA'], [], '4']) && j(blessed) === j([['char-ack', 'charDelta'], [], 0, ['sig:u_a|mA=12', 'sig:u_b|mA=12']]), j([put, putOut, blessed]));
        const srcC = src.replace(/\/\/[^\n]*/g, '');
        check('senses S0 (source): each of the three funnels every character change leaves by calls the hook as its first statement after its host test — syncChars for any character, syncChar and syncCharDelta for the one that changed, ahead of whatever turns a change away — and nothing else in net.js calls it but a change of the rules for new players',
            /net\.syncChars = function\(\) \{[^\n]*\n    if \(!net\.active \|\| net\.role !== 'host'\) return;\n    if \(net\.sensesMoved\) net\.sensesMoved\(null\);\n/.test(src)
            && /net\.syncChar = function\(id\) \{[^\n]*\n    if \(!net\.active \|\| net\.role !== 'host'\) return;\n    if \(net\.sensesMoved\) net\.sensesMoved\(id\);\n/.test(src)
            && /net\.syncCharDelta = function\(id, values\) \{[^\n]*\n    if \(!net\.active \|\| net\.role !== 'host'\) return;\n    if \(net\.sensesMoved\) net\.sensesMoved\(id\);[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(id\);[^\n]*\n    if \(typeof tradeMoved === 'function'\) tradeMoved\(id\);[^\n]*\n    if \(typeof window !== 'undefined' && window\.wpRecord\)[^\n]*\n    var camp = getActiveCampaign\(\), S = SC\(\); if \(/.test(src)
            && (srcC.match(/sensesMoved\(/g) || []).length === 4 && (srcC.replace(nsS2.replace(/\/\/[^\n]*/g, ''), '').match(/sensesMoved\(/g) || []).length === 3 && (srcC.match(/net\.sensesMoved = function\(charId\) \{/g) || []).length === 1 && (srcC.match(/sensesFire\(/g) || []).length === 2);
    }

    // 11. seeded by every copy made for a player
    {
        const W = mkW({ maps: ['mA', 'mB', 'mO'], bare: true }), none0 = W.sigs();
        const clean = JSON.parse(j(W.camp.items.mA)), cp = W.api.copy(clean, W.camp, W.camp.items.mA, 'u_a'), seeded = W.sigs(); W.api.copy(clean, W.camp, W.camp.items.mA, null); W.api.copy(clean, W.camp, W.camp.items.mA, ''); const noName = W.sigs();
        W.net.sensesMoved('c_a'); const same = [W.pendKeys().filter(k => k === 'u_a|mA'), W.pendKeys().filter(k => k !== 'u_a|mA')]; W.api.reset(); W.api.copy(clean, W.camp, W.camp.items.mA, 'u_a');
        W.camp.chars.c_a.values.f_sight = 65; W.net.sensesMoved('c_a'); const moved = W.pendKeys().filter(k => k === 'u_a|mA');
        check('senses S0: the copy made for a joining player (the snapshot\'s own call of fogCopyFor) records what it was made by, so a first change that leaves their Sight where it was sends no map and one that moves it does; a copy made for nobody records nothing, and a map a player was never sent counts as moved',
            j(none0) === j({}) && j(cp.whiteboard.map(w => w.id)) === j(['tA']) && j(seeded) === j({ 'u_a|mA': '12' }) && j(noName) === j(seeded) && j(same) === j([[], ['u_a|mB', 'u_b|mA', 'u_b|mB']]) && j(moved) === j(['u_a|mA'])
            && /it = fogCopyFor\(it, \(s\.campaigns && s\.campaigns\[camp\.id\]\) \|\| camp, orig, recipientId\);/.test(require('./checkkit').part('netfog.js')) && /function fogCopyFor\(clean, camp, map, recipientId\) \{\n    sensesSeed\(recipientId, camp, map\);\n    var drop = fogDrop\(/.test(require('./checkkit').part('netfog.js')), j([none0, seeded, noName, same, moved]));
        const G = mkW({ maps: ['mA', 'mB', 'mO'] });
        G.camp.chars.c_a.values.f_sight = 70; G.net.sendItem('k', 'mA'); const first = [G.items(G.a1), G.items(G.a2), G.items(G.b1), G.w1.sent.length]; G.net.syncCharDelta('c_a', { f_sight: 70 });
        const gKeys = G.pendKeys(); G.fire(500); const gOut = [G.items(G.a1), G.items(G.a2), G.items(G.b1)];
        const H2 = mkW({ maps: ['mA', 'mB', 'mO'] });
        H2.camp.chars.c_a.values.f_sight = 70; H2.net.broadcastItemFiltered('k', 'mB'); H2.net.syncCharDelta('c_a', { f_sight: 70 }); const hKeys = H2.pendKeys(); H2.fire(500); const hOut = H2.items(H2.a1);
        const R = mkW({ maps: ['mA', 'mO'] });
        R.gm('c_a', 70); const rKeys = R.pendKeys(); R.net.sendItem('k', 'mA', R.a1); const rMid = [R.items(R.a1), R.items(R.a2)]; const rFired = R.fire(500), rOut = [R.items(R.a1), R.items(R.a2), R.pendKeys()];
        check('senses S0: a map just sent is not sent again — the GM\'s own change sends the map on screen first (sendItem), then the character, and the hook queues only that player\'s other fogged map (7 cells on 10 ft squares: its orc); the same after broadcastItemFiltered; a map sent while a send waited makes that send a no-op when it fires',
            j(first) === j([['mA:tA+orc'], ['mA:tA+orc'], ['mA:tB'], 0]) && j(gKeys) === j(['u_a|mB']) && j(gOut) === j([['mA:tA+orc', 'mB:tA2+orc2'], ['mA:tA+orc', 'mB:tA2+orc2'], ['mA:tB']])
            && j(hKeys) === j(['u_a|mA']) && j(hOut) === j(['mB:tA2+orc2', 'mA:tA+orc']) && j(rKeys) === j(['u_a|mA']) && j(rMid) === j([['mA:tA+orc'], []]) && rFired === 1 && j(rOut) === j([['mA:tA+orc'], [], []]), j([first, gKeys, gOut, hKeys, hOut, rMid, rOut]));
        const Z = mkW({ maps: ['mA'] }); Z.camp.items.mA.fog.mode = 'reveal'; Z.api.copy(clean, Z.camp, Z.camp.items.mA, 'u_a'); const dropped = Z.sigs();
        const NF = mkW({ maps: ['mA'], bare: true, win: w => { delete w.wpFog.sightSigFor; } }); let nfThrew = ''; try { NF.api.copy(clean, NF.camp, NF.camp.items.mA, 'u_a'); NF.net.sensesMoved('c_a'); } catch (e) { nfThrew = e.message; }
        const FO = mkW({ maps: ['mA'], bare: true, feats: { fog: false } }); FO.api.copy(clean, FO.camp, FO.camp.items.mA, 'u_a');
        const B0 = mkW({ maps: ['mA', 'mO'], bare: true }); B0.net.sensesMoved(null); const b0Keys = B0.pendKeys(); B0.fire(500); const b0Out = [B0.items(B0.a1), B0.items(B0.b1), B0.sigs()];
        check('senses S0: a player with no record of a map is sent it at the first change, also where none of their tokens sees there (an empty text is a record, no record is not one)',
            j(b0Keys) === j(['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO']) && j(b0Out) === j([['mA:tA', 'mO:'], ['mA:tB', 'mO:tB2'], { 'u_a|mA': '12', 'u_a|mO': '', 'u_b|mA': '12', 'u_b|mO': '12' }]), j([b0Keys, b0Out]));
        const NW = mkW({ maps: ['mA'], bare: true, noFog: true }); let nwThrew = ''; try { NW.api.seed('u_a', NW.camp, NW.camp.items.mA); NW.net.sensesMoved('c_a'); NW.api.fire('u_a', 'mA'); } catch (e) { nwThrew = e.message; }
        check('senses S0: a copy made of a map where a change of sight changes nothing (shown whole) drops what was kept for that player and map, and one made with the fog feature off keeps nothing; without the fog\'s comparison on hand nothing is kept, queued or thrown',
            j(dropped) === j({ 'u_b|mA': '12' }) && j(FO.sigs()) === j({}) && nfThrew === '' && j(NF.sigs()) === j({}) && j(NF.ev) === j([]) && NF.made(500) === 0 && nwThrew === '' && j(NW.sigs()) === j({}) && NW.made(500) === 0 && NW.net.conns.every(c => c.sent.length === 0), j([dropped, NF.ev, nwThrew]));
    }

    // 12. dropped on close, kept for a second connection; a new table starts with nothing
    {
        const W = mkW({ maps: ['mA', 'mB', 'mO'] });
        W.api.seed('xu_a', W.camp, W.camp.items.mA); W.api.seed('u_a2', W.camp, W.camp.items.mA);
        W.camp.chars.c_a.values.f_sight = 70; W.camp.chars.c_b.values.f_sight = 70; W.net.sensesMoved(null); const pend0 = W.pendKeys(); W.ev.length = 0;
        W.api.forget('u_a'); const afterF = { sig: Object.keys(W.sigs()), pend: W.pendKeys(), cleared: W.ev.filter(e => e === 'clear:500').length, waiting: W.waiting(500) };
        const fired = W.fire(500), outF = [W.items(W.a1), W.items(W.a2), W.items(W.b1)];
        W.api.forget('u_nobody'); W.api.forget(''); const stillB = Object.keys(W.sigs());
        check('senses S0: when a player is forgotten (sensesForget, run for real) nothing is kept under their profile and the sends waiting for them are cleared and never fire; another player\'s are untouched and still fire, and a profile whose id only begins or ends the same keeps its own',
            j(pend0) === j(['u_a|mA', 'u_a|mB', 'u_b|mA', 'u_b|mB', 'u_b|mO']) && j(afterF) === j({ sig: ['u_a2|mA', 'u_b|mA', 'u_b|mB', 'u_b|mO', 'xu_a|mA'], pend: ['u_b|mA', 'u_b|mB', 'u_b|mO'], cleared: 2, waiting: 3 }) && fired === 3
            && j(outF) === j([[], [], ['mA:tB', 'mB:tB3', 'mO:tB2+orc3']]) && j(stillB) === j(afterF.sig), j([pend0, afterF, outF]));
        // the close handler's own statement, run on the net it reads: the closing connection is already out of the list and of the roster
        const closeLine = (src.match(/\n        (if \(p && p\.id && !net\.conns\.some\(function\(c\) \{ return c\.open && net\.roster\[c\.peer\] && net\.roster\[c\.peer\]\.id === p\.id; \}\)\) sensesForget\(p\.id\);)[^\n]*\n/) || [])[1] || '';
        const closing = (W2, conn) => { const forgot = []; W2.net.conns = W2.net.conns.filter(c => c !== conn); const p = W2.net.roster[conn.peer]; delete W2.net.roster[conn.peer]; new Function('net', 'p', 'sensesForget', closeLine)(W2.net, p, id => { forgot.push(id); W2.api.forget(id); }); return forgot; };
        const C1 = mkW({ maps: ['mA'] }); C1.gm('c_a', 70); const c1a = closing(C1, C1.a1), kept = [Object.keys(C1.sigs()), C1.pendKeys()]; C1.fire(500); const keptOut = [C1.items(C1.a1), C1.items(C1.a2)];
        const c1b = closing(C1, C1.a2), goneAll = Object.keys(C1.sigs());
        const C2 = mkW({ maps: ['mA'] }); C2.a2.open = false; C2.gm('c_a', 70); const c2 = closing(C2, C2.a1), c2Left = [Object.keys(C2.sigs()), C2.pendKeys(), C2.fire(500), C2.items(C2.a2)];
        const C3 = mkW({ maps: ['mA'] }); const c3 = closing(C3, C3.w1), c3b = closing(C3, { peer: 'pGhost' });
        const C4 = mkW({ maps: ['mA'] }); delete C4.net.roster.pA2; C4.gm('c_a', 70); const c4 = closing(C4, C4.a1);
        check('senses S0: a closing connection forgets its player only when it was their last — with a second admitted connection of that profile open, what their copies were made by and the send waiting stay and the map still goes to it; when the other is closed or no longer admitted, or the last one closes, all of it goes; a waiting peer\'s close forgets nobody',
            closeLine.length > 0 && /delete net\.roster\[conn\.peer\];\n        if \(p && p\.id && /.test(src) && j(c1a) === j([]) && j(kept) === j([['u_a|mA', 'u_b|mA'], ['u_a|mA']]) && j(keptOut) === j([[], ['mA:tA+orc']]) && j(c1b) === j(['u_a']) && j(goneAll) === j(['u_b|mA'])
            && j(c2) === j(['u_a']) && j(c2Left) === j([['u_b|mA'], [], 0, []]) && j(c3) === j([]) && j(c3b) === j([]) && j(c4) === j(['u_a']), j([closeLine.length, c1a, kept, keptOut, c1b, goneAll, c2, c2Left, c3, c4]));
        const J = mkW({ maps: ['mA'] }); J.gm('c_a', 70); J.api.forget('u_a'); J.clear(); J.api.copy(JSON.parse(j(J.camp.items.mA)), J.camp, J.camp.items.mA, 'u_a'); const rejoined = J.sigs()['u_a|mA']; J.net.sensesMoved('c_a'); const rj = [J.pendKeys(), J.made(500)]; J.gm('c_a', 60); const rj2 = J.pendKeys();
        const S = mkW({ maps: ['mA', 'mO'] }); S.gm('c_a', 70); S.gm('c_b', 70); S.ev.length = 0; S.api.reset(); const rs = { sig: Object.keys(S.sigs()), pend: S.pendKeys(), cleared: S.ev.filter(e => e === 'clear:500').length, fired: S.fire(500), sent: S.net.conns.map(c => c.sent.filter(m => m.type === 'item').length) };
        check('senses S0: a player who joins again is recorded afresh by their new snapshot (no map for a Sight that stayed, one for a Sight that moved); a new table (sensesReset, which startHosting calls) starts with nothing kept and nothing waiting, and no send of the last table ever fires',
            rejoined === '14' && j(rj) === j([[], 1]) && j(rj2) === j(['u_a|mA']) && j(rs) === j({ sig: [], pend: [], cleared: 3, fired: 0, sent: [0, 0, 0, 0, 0] })
            && /function startHosting\(forceFresh\) \{\n    _lastSent = \{\};[^\n]*\n    sensesReset\(\);[^\n]*\n/.test(src), j([rejoined, rj, rj2, rs]));
    }

    // 13, 14. host only, active only, fogged maps only
    {
        const run = (pre, mid) => { const W = mkW({ maps: ['mA', 'mO'] }); W.camp.chars.c_a.values.f_sight = 70; if (pre) pre(W); W.net.sensesMoved('c_a'); const made = W.made(500), ev = W.ev.slice(), keys = W.pendKeys(); if (mid) mid(W); const fired = W.fire(500);
            return { made, inv: ev.filter(e => /^inv/.test(e)).length, sigs: ev.filter(e => /^sig:/.test(e)).length, keys, fired, sent: W.net.conns.map(c => c.sent.length), left: W.pendKeys(), again: W.made(500) - made, sig: W.sigs()['u_a|mA'], rows: W.api.keys().filter(k => /\|mA$/.test(k)).sort() }; };
        const quietHook = r => r.made === 0 && r.inv === 0 && r.sigs === 0 && r.fired === 0 && j(r.sent) === j([0, 0, 0, 0, 0]);
        const quietFire = r => r.made === 1 && r.fired === 1 && j(r.sent) === j([0, 0, 0, 0, 0]) && j(r.left) === j([]) && r.again === 0;
        const asClient = run(W => { W.net.role = 'client'; }), off = run(W => { W.net.active = false; }), ok = run();
        const ended = run(null, W => { W.net.active = false; }), turned = run(null, W => { W.net.role = 'client'; }), noFogNow = run(null, W => { delete W.win.wpFog; }), noSigNow = run(null, W => { delete W.win.wpFog.sightSigFor; });
        check('senses S0: only a host with a session running does any of it — on a player\'s machine or with no session the hook judges nothing, queues nothing and sends nothing; a session that ended, or a machine that stopped hosting, between the hook and the send sends nothing and queues nothing more',
            quietHook(asClient) && quietHook(off) && ok.made === 1 && ok.fired === 1 && j(ok.sent) === j([1, 1, 0, 0, 0]) && ok.sig === '14' && quietFire(ended) && quietFire(turned) && quietFire(noFogNow) && quietFire(noSigNow) && ended.sig === '12', j([asClient, off, ok, ended, turned, noFogNow, noSigNow]));
        const featOff = run(W => { W.feats.fog = false; }), fogOffMid = run(null, W => { W.camp.items.mA.fog.on = false; }), featOffMid = run(null, W => { W.feats.fog = false; }), goneMid = run(null, W => { delete W.camp.items.mA; }), protoMid = (() => { const W = mkW({ maps: ['mA'] }); W.api.fire('u_a', 'constructor'); W.api.fire('u_a', '__proto__'); return [W.net.conns.map(c => c.sent.length), Object.keys(W.sigs())]; })();
        const campMid = run(null, W => { W.live = false; }), wholeMid = run(null, W => { W.camp.items.mA.fog.mode = 'reveal'; });
        check('senses S0: only fogged maps are ever sent — with the fog feature off the hook compares nothing, empties nothing and drops what was kept for every map; a map whose fog was switched off, the feature switched off, a map deleted, no campaign, or a map now shown whole by the time the send fires sends nothing, and the send\'s own row is dropped with it (the other player\'s row of that map stays until the hook next runs); a name of the prototype is no map',
            featOff.made === 0 && featOff.inv === 0 && featOff.sigs === 0 && j(featOff.rows) === j([]) && featOff.sig === undefined && quietFire(fogOffMid) && quietFire(featOffMid) && quietFire(goneMid) && quietFire(campMid) && quietFire(wholeMid)
            && [fogOffMid, featOffMid, goneMid, campMid, wholeMid].every(r => r.sig === undefined && j(r.rows) === j(['u_b|mA'])) && ok.sig === '14' && j(ok.rows) === j(['u_a|mA', 'u_b|mA']) && j(protoMid) === j([[0, 0, 0, 0, 0], ['u_a|mA', 'u_b|mA']]), j([featOff, fogOffMid, featOffMid, goneMid, campMid, wholeMid, protoMid]));
        const W = mkW(); W.camp.chars.c_a.values.f_sight = 70; W.net.sensesMoved('c_a'); const compared = W.ev.filter(e => /^sig:/.test(e)).map(e => e.slice(4)), keysAll = W.pendKeys(); W.fire(500);
        const mapsSent = W.items(W.a1).map(s => s.split(':')[0]).sort(), sigAfter = W.sigs();
        check('senses S0: of a whole campaign, a change of one character\'s Sight compares only the fogged maps that hold a token of that character, for each admitted player, and sends only where the cells moved — never an unfogged map, a page, a map shown or covered whole or without a grid, a lit or a dim map (its cells do not depend on Sight), or a map with no token of that character',
            j(compared) === j(['u_a|mA=14', 'u_b|mA=12', 'u_a|mB=7', 'u_b|mB=6', 'u_a|mL=L', 'u_b|mL=', 'u_a|mD=L', 'u_b|mD=', 'u_a|mR=null', 'u_b|mR=null', 'u_a|mV=null', 'u_b|mV=null', 'u_a|mG=null', 'u_b|mG=null'])
            && j(keysAll) === j(['u_a|mA', 'u_a|mB']) && j(mapsSent) === j(['mA', 'mB']) && W.b1.sent.length === 0 && W.w1.sent.length === 0 && !Object.keys(sigAfter).some(k => /\|(mR|mV|mG|mY|mU|dD)$/.test(k)) && sigAfter['u_a|mL'] === 'L', j([compared, keysAll, mapsSent, sigAfter]));
        const Z = mkW({ maps: ['mA', 'mO'] }); Z.gm('c_a', 70); const zKeys = Z.pendKeys(); Z.ev.length = 0; Z.camp.items.mA.fog.mode = 'cover'; Z.net.sensesMoved('c_a'); const zAfter = [Z.pendKeys(), Z.ev.filter(e => e === 'clear:500').length, Object.keys(Z.sigs()), Z.fire(500), Z.net.conns.map(c => c.sent.filter(m => m.type === 'item').length)];
        check('senses S0: when a map stops being one a change of sight matters on (covered whole) while a send waits, the next call of the hook clears that send and drops what was kept for every player on that map',
            j(zKeys) === j(['u_a|mA']) && j(zAfter) === j([[], 1, ['u_a|mO', 'u_b|mO'], 0, [0, 0, 0, 0, 0]]), j([zKeys, zAfter]));
    }

    // 15, 16. a character handed over; any character
    {
        const W = mkW({ maps: ['mA', 'mO'] });
        W.camp.chars.c_a.ownerId = 'u_b'; W.camp.items.mA.whiteboard[0].ownerId = 'u_b'; W.net.syncChar('c_a'); const keys = W.pendKeys(); W.fire(500);
        check('senses S0: a character handed from one player to another re-sends that map to both — the one who no longer has a token seeing there and the one who now has two — and to nobody else; who holds the token decides, never the character\'s own owner',
            j(keys) === j(['u_a|mA', 'u_b|mA']) && j(W.items(W.a1)) === j(['mA:']) && j(W.items(W.a2)) === j(['mA:']) && j(W.items(W.b1)) === j(['mA:tA+tB']) && W.w1.sent.length === 0 && W.c1.sent.length === 0 && W.sigs()['u_a|mA'] === '' && W.sigs()['u_b|mA'] === '12,12', j([keys, W.items(W.a1), W.items(W.b1), W.sigs()]));
        const V = mkW({ maps: ['mA', 'mB', 'mO', 'mL', 'mU'] });
        V.camp.chars.c_b.values.f_sight = 70; V.net.sensesMoved(null); const compared = V.ev.filter(e => /^sig:/.test(e)).map(e => e.slice(4)), vKeys = V.pendKeys(); V.fire(500);
        const U = mkW({ maps: ['mA', 'mB', 'mO', 'mL', 'mU'] }); U.camp.chars.c_b.values.f_sight = 70; U.net.sensesMoved(undefined); const uKeys = U.pendKeys(); const U2 = mkW({ maps: ['mA', 'mO'] }); U2.camp.chars.c_b.values.f_sight = 70; U2.net.sensesMoved(''); const u2Keys = U2.pendKeys();
        check('senses S0: a change that may touch any character (the system, the library, a character deleted: the hook called with no character) compares every fogged map for every admitted player and sends only the copies that moved',
            j(compared) === j(['u_a|mA=12', 'u_b|mA=14', 'u_a|mB=6', 'u_b|mB=7', 'u_a|mO=', 'u_b|mO=14', 'u_a|mL=L', 'u_b|mL=']) && j(vKeys) === j(['u_b|mA', 'u_b|mB', 'u_b|mO']) && j(uKeys) === j(vKeys) && j(u2Keys) === j(['u_b|mA', 'u_b|mO'])
            && j(V.items(V.b1)) === j(['mA:tB', 'mB:tB3', 'mO:tB2+orc3']) && V.a1.sent.length === 0 && V.a2.sent.length === 0 && V.w1.sent.length === 0, j([compared, vKeys, uKeys, V.items(V.b1)]));
    }

    // 17. the turn order and the target pointers follow the map
    {
        const rows = () => [{ id: 'r_a', name: 'Ana', tokId: 'tA', init: 9, src: null }, { id: 'r_o', name: 'Orc', tokId: 'orc', init: 7, src: null }, { id: 'r_g', name: 'Ogre', tokId: 'ogre', init: 5, src: null }];
        const W = mkW({ maps: ['mA', 'mO'] });
        W.net.combats = { mA: { mapId: 'mA', round: 2, turn: 1, rows: rows() } }; W.net.targets = { u_a: { mapId: 'mA', id: 'orc', x: 1, y: 2 }, u_b: { mapId: 'mA', id: 'ogre', x: 3, y: 4 } };
        W.net.roster.pA1.location = 'mA'; W.net.roster.pA2.location = 'mA';   // fold 2: a player is sent the fights on the map they are on
        W.gm('c_a', 65); W.clear(); W.fire(500);
        const a1 = W.types(W.a1), cm = W.a1.sent.find(m => m.type === 'combats'), tg = W.a1.sent.find(m => m.type === 'targets');
        check('senses S0: when the map sent again holds a combat or is pointed at, the turn order and the target pointers follow it to that player\'s connections only, after the map and as that player may now see them — the orc now in sight by its name, the ogre still Hidden and its pointer left out, never a number of the order',
            j(a1) === j(['item:mA', 'combats', 'targets']) && j(W.types(W.a2)) === j(a1) && quietOthers(W) && !!cm && j(fightIn(cm.combats, 'mA').rows) === j([{ id: 'r_a', name: 'Ana', tokId: 'tA', src: null }, { id: 'r_o', name: 'Orc', tokId: 'orc', src: null }, { id: 'h2', name: 'Hidden', tokId: null, src: null }])
            && fightIn(cm.combats, 'mA').round === 2 && fightIn(cm.combats, 'mA').turn === 1 && !/init/.test(j(cm)) && !!tg && j(tg.targets) === j({ u_a: { mapId: 'mA', id: 'orc', x: 1, y: 2 } }), j([a1, W.types(W.a2), cm, tg]));
        const V = mkW({ maps: ['mA', 'mB', 'mO'] });
        V.net.combats = { mB: { mapId: 'mB', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA2', init: 9, src: null }] } }; V.net.targets = { u_a: { mapId: 'mB', id: 'orc2', x: 1, y: 2 }, u_z: null };
        V.gm('c_a', 64); V.clear(); V.fire(500); const plain = [V.types(V.a1), V.types(V.a2)];
        const X = mkW({ maps: ['mA', 'mO'] }); X.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: rows() } }; X.net.targets = {}; X.net.roster.pA1.location = 'mA'; X.net.roster.pA2.location = 'mA'; X.gm('c_a', 65); X.clear(); X.a2.open = false; X.fire(500);
        const Y = mkW({ maps: ['mA', 'mO'] }); Y.net.combats = null; Y.net.targets = { u_b: { mapId: 'mA', id: 'tB', x: 0, y: 0 } }; Y.gm('c_a', 65); Y.clear(); Y.fire(500);
        check('senses S0: a map with no combat on it and no pointer at it is sent alone (a combat or a pointer on another map sends neither); a combat without a pointer sends the turn order alone, a pointer without a combat the pointers alone; a connection of that player that has closed by then gets none of it',
            j(plain) === j([['item:mA'], ['item:mA']]) && j(X.types(X.a1)) === j(['item:mA', 'combats']) && X.a2.sent.length === 0 && j(Y.types(Y.a1)) === j(['item:mA', 'targets']) && quietOthers(X) && quietOthers(Y), j([plain, X.types(X.a1), X.types(X.a2), Y.types(Y.a1)]));
    }

    // 18. the live position relay, and saveRemoteSoon
    {
        const W = mkW({ maps: ['mA', 'mO'] }), mA = W.camp.items.mA, foe = T('wolf', '', 'c_n', 12, 2), POS = { type: 'pos', campId: 'k', itemId: 'mA', id: 'wolf', x: foe.x, y: foe.y };
        mA.whiteboard.push(foe);
        const relay = () => { W.clear(); W.api.pos(POS, null, W.camp, mA, foe); return W.net.conns.map(c => c.sent.length).join(''); };
        const r0 = relay(), held0 = W.fog.held();
        W.clear(); W.api.edit(EDIT('f_sight', 25), W.a1); const heldLow = W.fog.held(), r1 = relay();
        W.api.edit(EDIT('f_sight', 60), W.a1); const r2 = relay();
        W.camp.chars.c_a.values.f_sight = 25; const stale = relay(); W.net.sensesMoved('c_a'); const fresh = relay();
        W.clear(); W.api.pos({ type: 'pos', campId: 'k', itemId: 'mA', id: 'tB', x: 100, y: 2500 }, W.a1, W.camp, mA, mA.whiteboard[1]); const own1 = W.net.conns.map(c => c.sent.length).join('');
        W.clear(); W.camp.chars.c_a.values.f_sight = 60; W.net.sensesMoved('c_a'); W.api.pos(POS, W.a1, W.camp, mA, foe); const except = W.net.conns.map(c => c.sent.length).join('');
        W.clear(); W.api.pos({ type: 'pos', itemId: 'mU' }, W.a2, W.camp, null, null); const plainMap = [W.shared.slice(), W.net.conns.map(c => c.sent.length).join('')];
        check('senses S0: the live position relay (run for real over the real canSeePoint) follows a player\'s Sight at once — a creature 10 cells away is relayed to a player who sees 12 cells; after their own edit lowers their Sight to 5 cells its next move is not sent to them, and after it rises again it is; without the hook the relay would go on judging by the old set; a token\'s own player always gets its moves, the sender never, a waiting peer and a closed connection never',
            r0 === '11000' && j(held0) === j(['u_a|mA', 'u_b|mA']) && j(heldLow) === j([]) && r1 === '00000' && r2 === '11000' && stale === '11000' && fresh === '00000' && own1 === '00100' && except === '01000' && j(plainMap) === j([['pos:mU'], '00000']), j([r0, held0, heldLow, r1, r2, stale, fresh, own1, except, plainMap]));
        const K = mkW({ maps: ['mA', 'mO'] }); K.fog.invalidateVision(); K.fog.canSeePoint('u_a', K.camp, K.camp.items.mA, 125, 125); const walls0 = K.fog.walls(), heldK = K.fog.held(); K.win.wpFog.invalidateSeen(); const seenOnly = [K.fog.held(), K.fog.walls()]; K.fog.canSeePoint('u_a', K.camp, K.camp.items.mA, 125, 125); K.win.wpFog.invalidateVision(); const allGone = [K.fog.held(), K.fog.walls()];
        // a key is the player, a bar, the map: the map is what follows the FIRST bar (a profile id holds none; a map's id, from a file, may)
        const K2 = mkW({ maps: ['mA', 'mO'], bare: true }); K2.camp.items.A = M('A', 5, null, [T('tA11', 'u_a', 'c_a', 2, 2)]); K2.camp.items.mmA = M('mmA', 5, null, [T('tA12', 'u_a', 'c_a', 2, 2)]); K2.camp.items['x|mA'] = M('x|mA', 5, null, [T('tA13', 'u_a', 'c_a', 2, 2)]);
        const fill = () => { K2.fog.invalidateVision(); ['mA', 'mO', 'A', 'mmA', 'x|mA'].forEach(id => ['u_a', 'u_b'].forEach(p => K2.fog.canSeePoint(p, K2.camp, K2.camp.items[id], 125, 125))); return K2.fog.held(); };
        const full = fill(); K2.fog.invalidateSeen('mA'); const oneMap = K2.fog.held(), wallsK = K2.fog.walls(); K2.fog.invalidateSeen('A'); const short = K2.fog.held(); ['nowhere', '|mO', 'O', 'a|mO', 'u_a|mO', 'u_a', 'x', 'x|', 'x|m', '|x|mA'].forEach(n => K2.fog.invalidateSeen(n)); const none2 = K2.fog.held(); K2.fog.invalidateSeen('x|mA'); const barred = K2.fog.held();
        const wholeBy = [undefined, '', null, 5, {}, ['mA']].map(v => { fill(); K2.fog.invalidateSeen(v); return K2.fog.held().length; }); fill(); K2.fog.invalidateSeen(); const bare0 = K2.fog.held().length;
        check('senses S0: invalidateSeen (fog.js, run for real) empties the set the relay judges by and nothing else — the walls worked out for a map stay; invalidateVision empties both; both are published for the host beside the comparison, and with them where a token sees and lights from and whether a light that moves changes what is seen on a map',
            j(walls0) === j(['mA']) && j(heldK) === j(['u_a|mA']) && j(seenOnly) === j([[], ['mA']]) && j(allGone) === j([[], []]) && /window\.wpFog = \{\n[^\n]*\n\s*fogDropIds: fogDropIds,[^\n]*invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor,/.test(fogT)
            && typeof K.win.wpFog.seenKeyOf === 'function' && typeof K.win.wpFog.lightMoves === 'function', j([walls0, seenOnly, allGone]));
        check('senses S0: invalidateSeen given a map empties every player\'s set for that map and no other map\'s — the map of a set is what follows the first bar of its name, so a map whose name only ends the same, with a bar before the ending or without one, keeps its sets, and a map whose own name holds a bar is emptied by that whole name alone; a name no map bears empties nothing, the walls stay; given no map, or anything that is not a name, it empties the whole',
            j(full) === j(['u_a|A', 'u_a|mA', 'u_a|mO', 'u_a|mmA', 'u_a|x|mA', 'u_b|A', 'u_b|mA', 'u_b|mO', 'u_b|mmA', 'u_b|x|mA']) && j(oneMap) === j(['u_a|A', 'u_a|mO', 'u_a|mmA', 'u_a|x|mA', 'u_b|A', 'u_b|mO', 'u_b|mmA', 'u_b|x|mA'])
            && j(short) === j(['u_a|mO', 'u_a|mmA', 'u_a|x|mA', 'u_b|mO', 'u_b|mmA', 'u_b|x|mA']) && j(none2) === j(short) && j(barred) === j(['u_a|mO', 'u_a|mmA', 'u_b|mO', 'u_b|mmA']) && wallsK.length === 5 && j(wholeBy) === j([0, 0, 0, 0, 0, 0]) && bare0 === 0, j([full, oneMap, short, none2, barred, wallsK, wholeBy, bare0]));
        const oneOf = (m, p) => { fill(); const before = K2.fog.held().map(k => K2.fog.seen(k)); K2.fog.invalidateSeen(m, p); return full.filter((k, i) => K2.fog.seen(k) !== before[i]).join(); };
        const oneSet = [oneOf('mA', 'u_a'), oneOf('mA', 'u_b'), oneOf('mO', 'u_b'), oneOf('x|mA', 'u_a'), oneOf('A', 'u_b')], noSet = [oneOf('mA', 'u_zz'), oneOf('mA', 'u_'), oneOf('mA', 'u_a.x'), oneOf('nowhere', 'u_a'), oneOf('m', 'u_a'), oneOf('mA', 'U_A')];
        const mapWide = ['', null, undefined, 0, 5, true, {}, ['u_a']].map(p => oneOf('mA', p)), allWide = [[undefined, 'u_a'], ['', 'u_a'], [null, 'u_a'], [5, 'u_a'], [['mA'], 'u_a'], [{}, 'u_b']].map(a => oneOf(a[0], a[1]));
        check('senses S0: invalidateSeen given a map and a player (fog.js, run for real) drops that one player\'s set for that one map and leaves every other set the very set it was — a map whose name holds a bar by its whole name; a player with no set there, or a map no set is held for, drops nothing; a player that is no name or an empty one drops every player\'s set for that map, as the map alone does; and with no map named the whole is emptied, whoever the player',
            j(oneSet) === j(['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_a|x|mA', 'u_b|A']) && noSet.length === 6 && noSet.every(v => v === '') && mapWide.length === 8 && mapWide.every(v => v === 'u_a|mA,u_b|mA') && allWide.length === 6 && allWide.every(v => v === full.join()), j([oneSet, noSet, mapWide, allWide]));
        const S = mkW({ maps: ['mA'] }); S.clear();
        S.api.saveSoon(); S.api.saveSoon(); const two = [S.ev.slice(), S.saves.length]; const f250 = S.fire(250), saved = [j(S.saves), S.net.applyingRemote]; S.ev.length = 0; S.api.saveSoon(); const third = S.ev.slice();
        const SC2 = mkW({ maps: ['mA'] }); SC2.clear(); SC2.net.role = 'client'; SC2.api.saveSoon(); const sClient = SC2.ev.slice(); const SI = mkW({ maps: ['mA'] }); SI.clear(); SI.net.active = false; SI.api.saveSoon(); const sIdle = SI.ev.slice();
        const SN = mkW({ maps: ['mA'], noFog: true }); SN.api.saveSoon(); const SM = mkW({ maps: ['mA'], win: w => { delete w.wpFog.invalidateSeen; } }); SM.clear(); SM.api.saveSoon();
        S.fog.canSeePoint('u_a', S.camp, S.camp.items.mA, 125, 125); const heldS = S.fog.held(); S.api.saveSoon(); S.fire(250); const heldS2 = S.fog.held();
        check('senses S0: a player\'s change saved as a remote change (saveRemoteSoon, run for real) empties nothing of what the relay judges by — two calls are one save a quarter second later, written as a remote change, and a call after it saves again; the same on a player\'s machine, off a session and without the fog; it reads as it did before lighting\'s close-out',
            j(two) === j([['timer:250'], 0]) && f250 === 1 && j(saved) === j([j([[true, true]]), false]) && j(third) === j(['timer:250']) && j(sClient) === j(['timer:250']) && j(sIdle) === j(['timer:250']) && j(SN.ev) === j(['timer:250']) && j(SM.ev) === j(['timer:250'])
            && j(heldS) === j(['u_a|mA']) && j(heldS2) === j(heldS) && S.saves.length === 2 && !S.ev.some(e => /^inv/.test(e))
            && lineOf('function saveRemoteSoon()') === 'function saveRemoteSoon() { if (_saveSoon) return; _saveSoon = setTimeout(function() { _saveSoon = null; net.applyingRemote = true; try { save(true); } finally { net.applyingRemote = false; } }, 250); }'
            && (src.match(/function saveRemoteSoon\(/g) || []).length === 1, j([two, saved, third, sClient, sIdle, SN.ev, SM.ev, heldS, heldS2]));
    }

    // 20. a player's own move (the real pos gate and the map copy their app saves after it, over the real relay and the real fog.js canSeePoint and
    // invalidateSeen, seenKeyOf and lightMoves): an accepted pos that takes the token into another cell or turns it has what THAT player sees on that
    // map judged afresh, theirs alone, or every player's where the token carries a light on a dark map; this fold sends no map after it. Every map of
    // these cases is set dark unless a case says otherwise
    {
        const zero = [0, 0, 0, 0, 0], four = ['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'];
        const mkP = o => {
            o = o || {}; const W = mkW({ maps: ['mA', 'mO', 'mU', 'dD'], noFog: o.noFog });
            W.net.tokenDropped = w => { W.ev.push('dropped:' + w.id); };
            W.pp = buildPos(W.state, W.net, W.win, peer => (o.paused ? o.paused(peer) : false), () => (o.allow ? o.allow() : true), () => {}, () => {}, (m, ex, camp, map, w) => { W.ev.push('relay:' + m.wbId + ':' + m.final); if (!o.noRelay) W.api.pos(m, ex, camp, map, w); }, t => W.toasts.push(t), () => { W.ev.push('saveSoon'); W.api.saveSoon(); },
                e => { throw e; }, (fn, ms) => { W.ev.push('later:' + ms); return 0; }, () => null, () => W.SC(), () => (W.live ? W.camp : null), () => {});
            W.move = (conn, wbId, x, y, fin, itemId, more) => W.pp.pos(Object.assign({ type: 'pos', campId: 'k', itemId: itemId || 'mA', wbId, x, y, rot: 0, front: 0, final: fin }, more || {}), conn);
            W.copy = (wbId, x, y) => W.pp.patch({ type: 'item', campId: 'k', itemId: 'mA', item: { type: 'map', whiteboard: [{ id: wbId, x, y, rot: 0, front: 0 }] } }, { id: 'u_a' });
            W.tok = (id, mapId) => { const m = W.camp.items[mapId || 'mA']; return m && Array.isArray(m.whiteboard) ? m.whiteboard.find(w => w.id === id) : undefined; };
            // the four sets of two players on two maps, worked out by the real canSeePoint; kept() reads 1 where the very set is still held
            W.prime = () => { four.forEach(k => { const p = k.split('|'); W.fog.canSeePoint(p[0], W.camp, W.camp.items[p[1]], 125, 125); }); W.sets = four.map(k => W.fog.seen(k)); };
            W.kept = () => four.map((k, i) => (W.sets[i] && W.fog.seen(k) === W.sets[i] ? 1 : 0)).join('');
            if (o.pre) o.pre(W);
            W.clear();
            return W;
        };
        // one pos on a table whose four sets are worked out. The relay is a stand-in here, so what is held afterwards is what the gate itself left
        const one = (o, fin, conn, wbId, itemId, more) => {
            const W = mkP(Object.assign({ noRelay: true }, o)); W.prime(); if (o && o.mid) o.mid(W); W.clear(); let threw = '';   // o.pre runs before the sets are worked out, o.mid after
            const id = wbId === undefined ? 'tA' : wbId, c = W[conn || 'a1'], t = W.tok(id, itemId), was = t ? [t.x, t.y] : null, turn0 = t ? [t.rot || 0, t.front || 0] : null, held0 = W.fog.held();
            try { W.move(c, id, 150, 100, fin, itemId, more); } catch (e) { threw = e.message; }
            return { inv: W.invs(), order: W.ev.filter(e => /^key|^later|^seat|^asked|^inv|^relay/.test(e)), kept: W.kept(), held0, held: W.fog.held(), was, turn0, at: t ? [t.x, t.y] : null, turn: t ? [t.rot, t.front] : null, relay: W.ev.filter(e => /^relay/.test(e)), saved: W.ev.filter(e => e === 'saveSoon').length, dropped: W.ev.filter(e => /^dropped/.test(e)).length,
                notes: c.sent.filter(m => m.type === 'turn-note').length, out: W.net.conns.map(x => x.sent.filter(m => m.type !== 'turn-note').length), timers: W.timers.map(x => x.ms), threw };
        };
        const less = k => four.filter(x => x !== k);
        const lands = (r, inv, kept, held, relay, at) => j(r.inv) === j([inv]) && r.kept === kept && j(r.held) === j(held) && j(r.relay) === j([relay]) && j(r.at) === j(at || [150, 100]) && r.notes === 0 && j(r.out) === j(zero) && r.threw === '';
        const still = r => j(r.inv) === j([]) && r.kept === '1111' && j(r.held) === j(r.held0) && j(r.at) === j(r.was) && j(r.relay) === j([]) && r.saved === 0 && r.dropped === 0 && r.notes === 0 && j(r.out) === j(zero) && r.timers.length === 0 && r.threw === '';
        const both = (o, conn, wbId, itemId, more) => [one(o, false, conn, wbId, itemId, more), one(o, true, conn, wbId, itemId, more)];

        const mid = one(null, false), fin = one(null, true), loose = ['yes', 1, undefined, null, 'true'].map(f => one(null, f)), second = one(null, false, 'a2');
        const boA = both(null, 'b1', 'tB'), boO = both(null, 'b1', 'tB2', 'mO'), turned = one(null, false, 'a1', 'tA', 'mA', { x: 100, y: 100, rot: 90, front: 45 });
        const waitPre = W => { W.camp.items.mW = M('mW', 5, null, [T('tw', 'u_b', '', 2, 2, { isChar: false, waiting: 1, rot: 30, front: 15 }), T('orcW', '', 'c_n', 5, 2)]); W.fog.canSeePoint('u_b', W.camp, W.camp.items.mW, 125, 125); W.fog.canSeePoint('u_a', W.camp, W.camp.items.mW, 125, 125); };
        const waiting = both({ pre: waitPre }, 'b1', 'tw', 'mW', { rot: 90, front: 45 });
        const barPre = W => { ['a|b', 'b'].forEach(id => { W.camp.items[id] = M(id, 5, null, [T('t_' + id, 'u_a', 'c_a', 2, 2)]); W.fog.canSeePoint('u_a', W.camp, W.camp.items[id], 125, 125); W.fog.canSeePoint('u_b', W.camp, W.camp.items[id], 125, 125); }); };
        const bar = one({ pre: barPre }, true, 'a1', 't_a|b', 'a|b'), plainMap = one({ pre: W => { W.delta = null; } }, true, 'a1', 'tA9', 'mU');
        check('senses S0: a pos of a player\'s own token that the host accepts and that takes the token into another cell or turns it (the real pos gate over the real invalidateSeen and seenKeyOf) drops the set of what THAT player sees on THAT map, there and then, before the move is relayed — of two players\' sets on two maps exactly one is gone, the three others are the very sets they were; a move that is not final and a final one alike, from either of the player\'s connections, a turn on the spot too; for a token that carries no light the call names the map and the player\'s profile, never the map alone and never nothing',
            lands(mid, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:false') && mid.saved === 0 && mid.dropped === 0 && j(mid.timers) === j([]) && lands(fin, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:true') && fin.saved === 1 && fin.dropped === 1 && j(fin.timers) === j([250])
            && loose.length === 5 && loose.every(r => lands(r, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:false') && r.saved === 0) && lands(second, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:false')
            && lands(boA[0], 'inv:mA>u_b', '1101', less('u_b|mA'), 'relay:tB:false') && lands(boA[1], 'inv:mA>u_b', '1101', less('u_b|mA'), 'relay:tB:true') && lands(boO[0], 'inv:mO>u_b', '1110', less('u_b|mO'), 'relay:tB2:false') && lands(boO[1], 'inv:mO>u_b', '1110', less('u_b|mO'), 'relay:tB2:true')
            && lands(turned, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:false', [100, 100]) && j(turned.turn) === j([90, 45]), j([mid, fin, loose, second, boA, boO, turned]));
        check('senses S0: a waiting token\'s move counts as its player\'s own — their set for that map is dropped, another player\'s set for it stays, and the token keeps the turn and the facing the host gave it; a map whose id holds a bar loses that player\'s set and the map named by what follows the bar keeps its own; on a map without fog the call is made all the same and nothing is sent',
            waiting.every((r, i) => lands(r, 'inv:mW>u_b', '1111', four.concat(['u_a|mW']).sort(), 'relay:tw:' + (i === 1)) && j(r.held0) === j(four.concat(['u_a|mW', 'u_b|mW']).sort()) && j(r.turn) === j([30, 15]))
            && lands(bar, 'inv:a|b>u_a', '1111', four.concat(['u_a|b', 'u_b|a|b', 'u_b|b']).sort(), 'relay:t_a|b:true') && j(bar.held0) === j(four.concat(['u_a|a|b', 'u_a|b', 'u_b|a|b', 'u_b|b']).sort())
            && lands(plainMap, 'inv:mU>u_a', '1111', four, 'relay:tA9:true'), j([waiting, bar, plainMap]));

        // what the host refuses before the token is moved
        const anothers = both(null, 'a1', 'tB'), npcTok = both(null, 'a1', 'orc'), stranger = both(null, 'w1'), lockedTok = both({ pre: W => { W.tok('tA').locked = true; } }), hiddenTok = both({ pre: W => { W.tok('tA').hidden = true; } });
        const plainTok = both({ pre: W => { W.tok('tA').isChar = false; } }), elsewhere = both({ pre: W => { W.net.roster.pA1.location = 'mO'; } }), tablePaused = both({ pre: W => { W.net.paused = true; } }), asked = [];
        const onePaused = both({ paused: peer => { asked.push(peer); return peer === 'pA1'; } }), flood = both({ allow: () => false });
        const badNums = [{ x: 'abc' }, { x: NaN }, { x: Infinity }, { x: undefined }, { x: {} }, { y: NaN }, { y: -Infinity }, { y: 'here' }, { rot: 'round' }, { rot: Infinity }, { front: 'back' }, { front: [1, 2] }].map(more => both(null, 'a1', 'tA', 'mA', more));
        const noSuch = [both(null, 'a1', 'tZ'), both(null, 'a1', 5), both(null, 'a1', null), both(null, 'a1', 'tA', 'mNone'), both(null, 'a1', 'tA', 'constructor'), both(null, 'a1', 'tA10', 'dD'), both(null, 'a1', 'tA', 'mA', { campId: 'k9' })];
        const wallPre = W => { W.win.wpFog.moveBlocked = () => true; }, turnPre = W => { W.net.combats = { f_pier0001: { id: 'f_pier0001', mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_o', tokId: 'orc' }, { id: 'r_a', tokId: 'tA' }] } }; };   // fold 2's review: a fight by an id of its own
        const limitPre = W => { W.win.wpFog.moveCells = () => 9; W.net.combats = { f_pier0001: { id: 'f_pier0001', mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', tokId: 'tA' }] } }; W.net.turnMove = { f_pier0001: { rowId: 'r_a', tokId: 'tA', moved: 0, allow: 2 } }; };
        const wall = both({ pre: wallPre }), outOfTurn = both({ pre: turnPre }), pastMove = both({ pre: limitPre });
        const refused = [anothers, npcTok, stranger, lockedTok, hiddenTok, plainTok, elsewhere, tablePaused, onePaused, flood].concat(badNums, noSuch);
        check('senses S0: a pos the host refuses empties nothing — all four sets are the very sets they were, the token stays where it stood, nothing is relayed, saved or sent: another player\'s token, a creature\'s, a peer not admitted, a locked or a hidden token, a plain token, a map the player is not on, a paused table, a paused player, the rate limit, a place, turn or facing that is no number, a token or a map that is not there, a page, another campaign; and a move not yet final that a wall, the turn order or the turn\'s move stops',
            refused.length === 29 && refused.every(p => p.length === 2 && p.every(still)) && j(asked) === j(['pA1', 'pA1']) && [wall, outOfTurn, pastMove].every(p => still(p[0])), j([refused, wall[0], outOfTurn[0], pastMove[0]]));
        const back = r => j(r.inv) === j(['inv:mA']) && r.kept === '0101' && j(r.held) === j(['u_a|mO', 'u_b|mO']) && j(r.at) === j([100, 100]) && j(r.relay) === j(['relay:tA:true']) && r.notes === 1 && r.saved === 0 && r.dropped === 0 && j(r.out) === j(zero) && j(r.timers) === j([]) && r.threw === '';
        const wallWarn = one({ pre: W => { wallPre(W); W.camp.turnRules = { walls: 'warn' }; } }, true), asClient = one({ pre: W => { W.net.role = 'client'; W.net.foreign = true; W.net.syncedPeer = 'pA1'; } }, true);
        const noInv = both({ pre: W => { delete W.win.wpFog.invalidateSeen; } }), noFog = both({ noFog: true });
        check('senses S0: a final move the host puts back — a wall in the way, out of turn, past the turn\'s move — leaves the token where its drag began, with one note, and empties that map\'s sets for every player (the map alone is named), the other map\'s sets staying; a move through a wall the table only warns of lands, and drops the mover\'s set alone; a player\'s own machine, which applies the host\'s word, empties nothing; without the means to empty a set, or without the fog at all, the move lands as ever and nothing is thrown',
            [wall, outOfTurn, pastMove].every(p => back(p[1])) && j(wallWarn.inv) === j(['inv:mA>u_a']) && wallWarn.kept === '0111' && j(wallWarn.at) === j([150, 100]) && wallWarn.notes === 1 && wallWarn.saved === 1 && wallWarn.dropped === 1 && wallWarn.threw === ''
            && j(asClient.inv) === j([]) && asClient.kept === '1111' && j(asClient.at) === j([150, 100]) && asClient.saved === 0 && asClient.threw === ''
            && noInv.concat(noFog).every(r => j(r.inv) === j([]) && r.kept === '1111' && j(r.at) === j([150, 100]) && r.threw === '') && noInv[1].saved === 1 && noFog[1].dropped === 1, j([wall[1], outOfTurn[1], pastMove[1], wallWarn, asClient, noInv, noFog]));

        // the relay run for real after it. The wolf stands 15 cells from where Ana's token begins and 11 from where it walks to; Ana sees 12
        const walk = (o, fin) => {
            const W = mkP(o), mA = W.camp.items.mA, wolf = T('wolf', '', 'c_n', 17, 2); mA.whiteboard.push(wolf);
            const relay = () => { W.net.conns.forEach(c => { c.sent.length = 0; }); W.api.pos({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'wolf', x: wolf.x, y: wolf.y }, null, W.camp, mA, wolf); return W.net.conns.map(c => c.sent.length).join(''); };
            const r = { seen: [relay()] }, bo = W.fog.seen('u_b|mA'); W.fog.canSeePoint('u_a', W.camp, W.camp.items.mO, 125, 125); const far = W.fog.seen('u_a|mO');
            [300, 100, 300, 100].forEach(x => { W.move(W.a1, 'tA', x, 100, fin); r.seen.push(relay()); });
            return Object.assign(r, { inv: W.invs(), bo: !!bo && W.fog.seen('u_b|mA') === bo, far: !!far && W.fog.seen('u_a|mO') === far, items: W.itemsOut() });
        };
        const wMid = walk(null, false), wFin = walk(null, true), wNone = walk({ pre: W => { delete W.win.wpFog.invalidateSeen; } }, false);
        const wMap = walk({ pre: W => { const real = W.win.wpFog.invalidateSeen; W.win.wpFog.invalidateSeen = function(m, p) { if (arguments.length > 1) return; real.apply(null, arguments); }; } }, true);
        // facing: on a map seen through a quarter circle, the bat stands 5 cells to one side of Ana's token
        const face = fin => {
            const W = mkP({ pre: V => { V.camp.items.mF = M('mF', 5, { vision: { mode: 'arc', arc: 90 } }, [T('tF', 'u_a', 'c_a', 10, 10), T('bat', '', 'c_n', 15, 10)]); } }), mF = W.camp.items.mF, bat = mF.whiteboard[1];
            const relay = () => { W.net.conns.forEach(c => { c.sent.length = 0; }); W.api.pos({ type: 'pos', campId: 'k', itemId: 'mF', wbId: 'bat', x: bat.x, y: bat.y }, null, W.camp, mF, bat); return W.net.conns.map(c => c.sent.length).join(''); };
            return [0, 90, 270, 90, 0].map(rot => { W.move(W.a1, 'tF', 500, 500, fin, 'mF', { rot }); return relay(); }).concat([W.invs().join()]);
        };
        const fMid = face(false), fFin = face(true);
        const walked = ['00000', '11000', '00000', '11000', '00000'], fourInv = ['inv:mA>u_a', 'inv:mA>u_a', 'inv:mA>u_a', 'inv:mA>u_a'];
        check('senses S0: the live relay run for real after a player\'s own move (the real canSeePoint) judges from where their token now stands — once it has walked up to a creature the next relayed place of that creature reaches both their connections, once it has walked away it does not, mid-drag and at a final move alike, while another player\'s set and their own set for another map stay the very sets they were and no map is sent; without the call a creature walked up to is never relayed',
            [wMid, wFin].every(r => j(r.seen) === j(walked) && j(r.inv) === j(fourInv) && r.bo === true && r.far === true && j(r.items) === j(zero))
            && j(wNone.seen) === j(['00000', '00000', '00000', '00000', '00000']) && j(wMap.seen) === j(['00000', '00000', '00000', '00000', '00000']), j([wMid, wFin, wNone, wMap]));
        check('senses S0: and from where it now faces — on a map seen through a quarter circle a token that turns on the spot towards a creature has it relayed, and turned away from it has not, mid-drag and at a final move alike; each of the four turns empties its player\'s set once, and the pos before them, which left it where it stood and facing as it did, empties none',
            j(fMid) === j(fFin) && j(fMid) === j(walked.concat(['inv:mF>u_a,inv:mF>u_a,inv:mF>u_a,inv:mF>u_a'])), j([fMid, fFin]));

        // why a map is NOT sent after a player's own move: Ana's token steps one cell towards the orc (13 cells off, her sight 12), which is now in her sight
        const Y = mkP(); Y.move(Y.a1, 'tA', 150, 100, true);
        const yEv = Y.ev.slice(), yNow = { items: Y.itemsOut(), timers: Y.timers.map(t => t.ms), tok: [Y.tok('tA').x, Y.tok('tA').y], pend: Y.pendKeys(), sig: Y.sigs()['u_a|mA'] };
        const yCopy = Y.copy('tA', 150, 100), yAfter = { items: Y.itemsOut(), timers: Y.timers.map(t => t.ms), all: Y.net.conns.map(c => c.sent.filter(m => m.type !== 'pos').length) };
        Y.clear(); Y.net.sendItem('k', 'mA'); const yNext = [Y.items(Y.a1), Y.items(Y.a2), Y.items(Y.b1)];
        // and up to Bo's token (5 cells off): Bo now sees her, and is told where she stands, but holds no token of hers until that map is sent
        const B2 = mkP(); B2.move(B2.a1, 'tA', 100, 2250, true); const bNow = { b1: B2.types(B2.b1), items: B2.itemsOut(), copy: B2.copy('tA', 100, 2250), after: B2.itemsOut() }; B2.clear(); B2.net.sendItem('k', 'mA'); const bNext = [B2.items(B2.a1), B2.items(B2.b1)];
        // a key held down: five final moves in one moment
        const K = mkP(); [150, 200, 250, 300, 350].forEach(x => K.move(K.a1, 'tA', x, 100, true)); const kOut = { inv: K.invs(), items: K.itemsOut(), timers: K.timers.map(t => t.ms), copy: K.copy('tA', 350, 100), after: K.itemsOut(), at: K.tok('tA').x };
        const C0 = mkP(), cCopy = [C0.copy('tA', 150, 100), C0.tok('tA').x, C0.invs(), C0.itemsOut()];
        check('senses S0: this fold sends no map after a player\'s own move, so their copy of a fogged map follows at the next send of that map (the older defect, which it does not close) — a final move (the real pos gate) is relayed and saved and sets no send: no map goes to anyone, though a creature came into the mover\'s sight or they walked up to another player, who is told the place of a token their copy does not hold; the host already holds the new place, so the map copy the player\'s app saves next (the real patch path) reports nothing changed; five final moves in one moment send no map either; the next send of that map gives every player what they now see',
            j(yEv) === j(['later:50', 'inv:mA>u_a', 'relay:tA:true', 'send:pA2:pos:mA', 'saveSoon', 'timer:250', 'dropped:tA']) && j(yNow) === j({ items: zero, timers: [250], tok: [150, 100], pend: [], sig: '12' }) && yCopy === false && j(yAfter) === j({ items: zero, timers: [250], all: zero })
            && j(yNext) === j([['mA:tA+orc'], ['mA:tA+orc'], ['mA:tB']]) && j(bNow) === j({ b1: ['pos:mA'], items: zero, copy: false, after: zero }) && j(bNext) === j([['mA:tA+tB'], ['mA:tA+tB']])
            && j(kOut) === j({ inv: ['inv:mA>u_a', 'inv:mA>u_a', 'inv:mA>u_a', 'inv:mA>u_a', 'inv:mA>u_a'], items: zero, timers: [250], copy: false, after: zero, at: 350 }) && j(cCopy) === j([true, 150, [], zero]), j([yEv, yNow, yCopy, yAfter, yNext, bNow, bNext, kOut, cCopy]));

        // a drag moved the token on the host as it went, and the relay worked out what its player sees from there; then the drop is refused
        const snap = (pre, restrict, byCopy) => {
            const W = mkP({ pre }), mA = W.camp.items.mA, wolf = T('wolf', '', 'c_n', 17, 2); mA.whiteboard.push(wolf);
            const relay = () => { W.net.conns.forEach(c => { c.sent.length = 0; }); W.api.pos({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'wolf', x: wolf.x, y: wolf.y }, null, W.camp, mA, wolf); return W.net.conns.map(c => c.sent.length).join(''); };
            const r = { first: relay() }; W.fog.canSeePoint('u_b', W.camp, W.camp.items.mO, 125, 125);
            W.move(W.a1, 'tA', 300, 100, false); r.dragged = [W.tok('tA').x, relay(), W.fog.held()];
            if (restrict) restrict(W); W.clear();
            let cp; if (byCopy) cp = W.copy('tA', 450, 100); else W.move(W.a1, 'tA', 450, 100, true);
            Object.assign(r, { ev: W.ev.filter(e => /^inv|^relay|^timer|^saveSoon|^dropped/.test(e)), held: W.fog.held(), at: [W.tok('tA').x, W.tok('tA').y], back: W.a1.sent.filter(m => m.type === 'pos').map(m => [m.wbId, m.x, m.y, m.final]), notes: W.a1.sent.filter(m => m.type === 'turn-note').length, items: W.itemsOut() });
            r.after = relay(); if (byCopy) r.copy = cp;
            return r;
        };
        const byWall = W => { W.win.wpFog.moveBlocked = (m, w, fx, fy, tx) => tx >= 400; };
        const sWall = snap(byWall), sTurn = snap(null, turnPre), sMove = snap(null, limitPre), sCopy = snap(byWall, null, true), sLands = snap();
        const sOwnOnly = snap(W => { byWall(W); const real = W.win.wpFog.invalidateSeen; W.win.wpFog.invalidateSeen = function(m, p) { if (arguments.length < 2) return; real.apply(null, arguments); }; });
        const putBack = { first: '00000', dragged: [300, '11000', ['u_a|mA', 'u_b|mA', 'u_b|mO']], ev: ['inv:mA', 'relay:tA:true'], held: ['u_b|mA', 'u_b|mO'], at: [100, 100], back: [['tA', 100, 100, true]], notes: 1, items: zero, after: '00000' };
        check('senses S0: a move put back empties that map\'s sets (the real pos gate over the real relay and canSeePoint) — a drag moved the token on the host as it went and the relay judged what its player sees from there; when the drop is refused by a wall, by the turn order or by the turn\'s move the token is back where the drag began, that map\'s sets are emptied before the way back is relayed, another map\'s set stays, no map goes out, and the next relay judges from where the token stands: a creature seen only from where the drag got to is no longer relayed to its player; the same when the map copy their app saves is what is refused; a drop that lands drops the mover\'s set alone and the creature is relayed still',
            j(sWall) === j(putBack) && j(sTurn) === j(putBack) && j(sMove) === j(putBack) && j(sCopy) === j(Object.assign({}, putBack, { copy: false, notes: 0 }))
            && j(sOwnOnly) === j(Object.assign({}, putBack, { ev: ['relay:tA:true'], held: ['u_a|mA', 'u_b|mA', 'u_b|mO'], after: '11000' }))
            && j(sLands) === j(Object.assign({}, putBack, { ev: ['inv:mA>u_a', 'relay:tA:true', 'saveSoon', 'timer:250', 'dropped:tA'], held: ['u_b|mA', 'u_b|mO'], at: [450, 100], back: [], notes: 0, after: '11000' })), j([sWall, sTurn, sMove, sCopy, sOwnOnly, sLands]));

        // the gate reads where the token sees and lights from (the real seenKeyOf) before it writes the move and again once the token is seated, and
        // empties only where that is no longer the same: the mover's set, or every player's set for that map where the token carries a light (these maps are dark)
        const torch = { bright: 20, dim: 40, unit: 'ft' }, lit = W => { W.tok('tA').light = Object.assign({}, torch); }, litOff = W => { W.tok('tA').light = Object.assign({ off: true }, torch); };
        const to = (o, x, y, more) => both(o, 'a1', 'tA', 'mA', Object.assign({ x, y }, more || {}));
        const savedOf = (r, fin) => (fin && !(j(r.at) === j(r.was) && j(r.turn) === j(r.turn0)) ? 1 : 0);   // security (2026-10-01, cluster J #8): a final that leaves the token as it stood — its place, turn and facing — saves nothing; one that moved or turned it saves
        const quiet = (r, fin, at) => j(r.inv) === j([]) && r.kept === '1111' && j(r.held) === j(four) && j(r.held0) === j(four) && j(r.relay) === j(['relay:tA:' + fin]) && j(r.at) === j(at) && r.saved === savedOf(r, fin) && r.dropped === (fin ? 1 : 0) && r.notes === 0 && j(r.out) === j(zero) && r.threw === '';
        const own = (r, fin, at) => lands(r, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:' + fin, at) && r.saved === savedOf(r, fin);
        const every = (r, fin, at) => lands(r, 'inv:mA>undefined', '0101', ['u_a|mO', 'u_b|mO'], 'relay:tA:' + fin, at) && r.saved === savedOf(r, fin);
        const pair = (p, f, at) => p.length === 2 && f(p[0], false, at) && f(p[1], true, at);
        // Ana's token is 50 across on cells 50 across and stands at 100, 100: its center is in its cell from 75 up to, and not at, 125
        const inCell = [[100, 100], [75, 75], [124, 124], [110, 80], [124.9, 75]], pastEdge = [[125, 100], [74, 100], [100, 125], [100, 74], [125, 125]];
        const stays = inCell.map(p => to(null, p[0], p[1])), steps = pastEdge.map(p => to(null, p[0], p[1]));
        const sameWay = to(null, 110, 110, { rot: 30, front: -30 }), sameWay2 = to({ pre: W => { W.tok('tA').rot = 90; W.tok('tA').front = 45; } }, 110, 110, { rot: 45, front: 90 });
        const turns = [{ rot: 90 }, { front: 45 }, { rot: -1 }, { rot: 30, front: 30 }, { rot: 360 }].map(m => to(null, 100, 100, m));
        check('senses S0: a pos that leaves a player\'s token in its cell and facing as it did empties no set (the real pos gate over the real seenKeyOf) — the four sets of two players on two maps are the very sets they were, mid-drag and at a final move alike, wherever in its cell the token is put, up to the cell\'s edge, and where its turn and its facing changed and add up to the way it faced; the move is written and relayed as ever, and saved where it moved or turned the token (a final naming the very place where it stands, turned as it is, saves nothing: cluster J #8); one step past the edge, along either axis or both, empties the mover\'s set for that map and no other, and so does a turn on the spot, by its turn, by its facing or by both',
            stays.length === 5 && stays.every((p, i) => pair(p, quiet, inCell[i])) && pair(sameWay, quiet, [110, 110]) && sameWay.every(r => j(r.turn) === j([30, -30])) && pair(sameWay2, quiet, [110, 110]) && sameWay2.every(r => j(r.turn) === j([45, 90]))
            && steps.length === 5 && steps.every((p, i) => pair(p, own, pastEdge[i])) && turns.length === 5 && turns.every(p => pair(p, own, [100, 100])), j([stays, sameWay, sameWay2, steps, turns]));

        // by a counter: working a set out reads the table's turning switch, holding one reads nothing. The relay runs for real here
        const tally = (x, y, more, pre) => {
            const W = mkP({ pre }), real = W.win.wpVtt.on, n = { v: 0 }; W.prime();
            W.win.wpVtt.on = k => { if (k === 'turning') n.v++; return real(k); };
            W.clear(); W.move(W.a1, 'tA', x, y, false, 'mA', more); const moved = n.v, kept = W.kept(), inv = W.invs();
            const told = ['mA', 'mO'].map(id => { const m = W.camp.items[id], foe = m.whiteboard.find(w => /^orc/.test(w.id)); W.net.conns.forEach(c => { c.sent.length = 0; }); W.api.pos({ type: 'pos', campId: 'k', itemId: id, wbId: foe.id, x: foe.x, y: foe.y }, null, W.camp, m, foe); return W.net.conns.map(c => c.sent.length).join(''); });
            return { inv, moved, relayed: n.v, kept, after: W.kept(), held: W.fog.held(), told };
        };
        const tStay = tally(110, 110), tStayLit = tally(110, 110, null, lit), tStep = tally(150, 100), tTurn = tally(100, 100, { rot: 90 }), tLit = tally(150, 100, null, lit);
        check('senses S0: after a pos that left the token in its cell and facing as it did no set is worked out again — counted: neither the relay of that move nor the next relayed position of a creature on either map works one out, and the four sets are the very sets they were afterwards, with a light carried too; after a step into another cell or a turn the mover\'s set for that map is worked out afresh at the next relayed position, and where the token carries a light on a dark map every player\'s set for that map, the other map\'s staying the very sets they were',
            [tStay, tStayLit].every(r => j(r) === j({ inv: [], moved: 0, relayed: 0, kept: '1111', after: '1111', held: four, told: r.told }))
            && [tStep, tTurn].every(r => j(r.inv) === j(['inv:mA>u_a']) && r.moved === 0 && r.relayed > 0 && r.kept === '0111' && r.after === '0111' && j(r.held) === j(four))
            && j(tLit.inv) === j(['inv:mA>undefined']) && tLit.moved > 0 && tLit.relayed > tLit.moved && tLit.relayed > tStep.relayed && tLit.kept === '0101' && tLit.after === '0101' && j(tLit.held) === j(four), j([tStay, tStayLit, tStep, tTurn, tLit]));

        // a token without a size of its own sees from 30 across and 26 down of its corner and lights from the corner itself
        const bare = W => { const t = W.tok('tA'); delete t.w; delete t.h; t.x = 115; t.y = 110; };
        const bStay = [[119, 110], [100, 100], [119, 123]].map(p => to({ pre: bare }, p[0], p[1])), bSee = [[125, 110], [115, 124]].map(p => to({ pre: bare }, p[0], p[1])), bLight = [[95, 110], [115, 99]].map(p => to({ pre: bare }, p[0], p[1]));
        check('senses S0: where a token sees from and where it lights from are judged apart — a token without a size of its own sees from a little way in of its corner and lights from the corner itself: a pos that leaves both in their cells empties nothing, one that takes the place it sees from into another cell while the place it lights from stays empties its player\'s set, and so does one that takes the place it lights from into another cell while the place it sees from stays',
            bStay.every((p, i) => pair(p, quiet, [[119, 110], [100, 100], [119, 123]][i])) && bSee.every((p, i) => pair(p, own, [[125, 110], [115, 124]][i])) && bLight.every((p, i) => pair(p, own, [[95, 110], [115, 99]][i])), j([bStay, bSee, bLight]));

        const lights = [lit, litOff].map(pre => [to({ pre }, 150, 100), to({ pre }, 100, 100, { rot: 90 }), to({ pre }, 110, 110), to({ pre }, 124, 75, { rot: 20, front: -20 })]);
        const litElse = both({ pre: W => { W.tok('tB2', 'mO').light = Object.assign({}, torch); } }, 'b1', 'tB2', 'mO');
        check('senses S0: on a dark map a token that carries a light, switched on or switched off, and moves into another cell or turns on the spot empties every player\'s set for that map and no other map\'s — the map is named and no player; still in its cell and facing as it did it empties nothing; mid-drag and at a final move alike',
            lights.length === 2 && lights.every(l => pair(l[0], every, [150, 100]) && pair(l[1], every, [100, 100]) && pair(l[2], quiet, [110, 110]) && pair(l[3], quiet, [124, 75]))
            && litElse.every((r, i) => lands(r, 'inv:mO>undefined', '1010', ['u_a|mA', 'u_b|mA'], 'relay:tB2:' + (i === 1))), j([lights, litElse]));

        // a final move is seated by the host: a stand-in that seats the token in a cell of its choosing (asked twice at a drop: first of a copy, for the
        // wall rule to judge the seat, then of the token itself once the move is accepted)
        const seatAt = (x, y, more) => W => { if (more) more(W); W.win.wpSeatDrop = (w, map, force) => { W.ev.push('seat:' + w.id + ':' + (map && map.id)); if (force !== false) return false; w.x = x; w.y = y; return true; }; };   // the snap rule: the host seats by wpSeatDrop (a token not fitted: force false)
        const keyPre = W => { const real = W.win.wpFog.seenKeyOf; W.win.wpFog.seenKeyOf = (m, w) => { const k = real(m, w); W.ev.push('key:' + (m && m.id) + ':' + w.x + ',' + w.y + ',' + w.rot + ',' + w.front + '=' + k); return k; }; };
        const seatOut = to({ pre: seatAt(300, 100) }, 110, 110), seatIn = to({ pre: seatAt(100, 100) }, 150, 100), seatLit = to({ pre: seatAt(300, 100, lit) }, 110, 110), seatLitIn = to({ pre: seatAt(100, 100, lit) }, 150, 100);
        const readAt = to({ pre: seatAt(300, 100, keyPre) }, 110, 110, { rot: 90, front: 45 }), readStay = to({ pre: keyPre }, 110, 110);
        check('senses S0: a final move is judged by where the host seated the token, not by the place the pos named — a pos into its own cell that the seat carries into another cell empties its player\'s set (every player\'s for that map where it carries a light on a dark map), and a pos into another cell that the seat carries back into its own cell empties nothing; a move not yet final is not seated and is judged by the place it named; the token stands where it was seated',
            quiet(seatOut[0], false, [110, 110]) && own(seatOut[1], true, [300, 100]) && j(seatOut[1].order) === j(['seat:tA:mA', 'later:50', 'seat:tA:mA', 'inv:mA>u_a', 'relay:tA:true']) && own(seatIn[0], false, [150, 100]) && quiet(seatIn[1], true, [100, 100]) && j(seatIn[1].order) === j(['seat:tA:mA', 'later:50', 'seat:tA:mA', 'relay:tA:true'])
            && quiet(seatLit[0], false, [110, 110]) && every(seatLit[1], true, [300, 100]) && every(seatLitIn[0], false, [150, 100]) && quiet(seatLitIn[1], true, [100, 100]), j([seatOut, seatIn, seatLit, seatLitIn]));
        check('senses S0: the gate reads where the token sees and lights from twice at an accepted pos and at no other moment — first of the token as it stood and faced, before the new place and facing are written, then of the token as it now stands and faces, after a final move was seated; a set is emptied only after the second reading and before the move is relayed, and where the two readings are the same none is',
            j(readAt.map(r => r.order)) === j([['key:mA:100,100,0,0=2,2|2,2|0', 'key:mA:110,110,90,45=2,2|2,2|135', 'inv:mA>u_a', 'relay:tA:false'], ['seat:tA:mA', 'key:mA:100,100,0,0=2,2|2,2|0', 'later:50', 'seat:tA:mA', 'key:mA:300,100,90,45=6,2|6,2|135', 'inv:mA>u_a', 'relay:tA:true']])
            && j(readStay.map(r => r.order)) === j([['key:mA:100,100,0,0=2,2|2,2|0', 'key:mA:110,110,0,0=2,2|2,2|0', 'relay:tA:false'], ['key:mA:100,100,0,0=2,2|2,2|0', 'later:50', 'key:mA:110,110,0,0=2,2|2,2|0', 'relay:tA:true']])
            && readStay.every((r, i) => quiet(r, i === 1, [110, 110])), j([readAt, readStay]));

        // no text to compare: a map without a grid (its sets worked out while it had one), and a fog module that does not give the text
        const gridOff = W => { W.camp.items.mA.meta.gridType = 'off'; }, older = more => W => { if (more) more(W); delete W.win.wpFog.seenKeyOf; };
        const bright = W => { W.camp.items.mA.fog.light = 'bright'; }, noMoves = more => W => { if (more) more(W); delete W.win.wpFog.lightMoves; };
        const noGrid = [to({ mid: gridOff }, 100, 100), to({ mid: gridOff }, 150, 100)], noGridLit = [lit, litOff].map(pre => to({ pre, mid: gridOff }, 100, 100)), noGridOld = [lit, litOff].map(pre => to({ pre: noMoves(pre), mid: gridOff }, 100, 100));
        const old = [to({ pre: older() }, 100, 100), to({ pre: older() }, 150, 100)], oldLit = [lit, litOff].map(pre => to({ pre: older(pre) }, 100, 100));
        const oldBright = to({ pre: older(W => { lit(W); bright(W); }) }, 100, 100), oldest = to({ pre: older(noMoves(W => { lit(W); bright(W); })) }, 100, 100);
        const notFn = [null, 0, ''].map(v => to({ pre: W => { W.win.wpFog.seenKeyOf = v; } }, 100, 100));
        // a place the host holds that is no number: read as nothing it would be the cell the pos names here, and nothing would be emptied
        const lost = [['x', NaN], ['x', 'abc'], ['x', undefined], ['y', Infinity], ['y', {}]].map((a, i) => one({ pre: W => { const t = W.tok('tA'); t.x = 10; t.y = 10; t[a[0]] = a[1]; } }, i % 2 === 1, 'a1', 'tA', 'mA', { x: 10, y: 10 })), found = to({ pre: W => { const t = W.tok('tA'); t.x = 10; t.y = 10; } }, 10, 10);
        check('senses S0: where there is no text to compare the host empties at every accepted pos, as it did before, also for a pos that names the place where the token already stands — a token whose place on the host is no number (missing, a word, an object, without end) has its player\'s set emptied by a pos into the very cell that place would be in were it read as nothing, where a token that stands there empties none; with a fog module that does not give the text: the mover\'s set for that map, or every player\'s set for it where the token carries a light, switched on or off, and the map is dark, and the mover\'s alone where the map is bright; on a map without a grid: the mover\'s set alone, with a light carried too, since no light is judged there, and every player\'s only where the fog module does not say whether a light moves anything; with a module that gives neither, every player\'s set for a light-bearer on a bright map too; nothing is thrown',
            noGrid.concat(old).every((p, i) => pair(p, own, i % 2 ? [150, 100] : [100, 100])) && noGridLit.length === 2 && noGridLit.every(p => pair(p, own, [100, 100])) && noGridOld.length === 2 && noGridOld.every(p => pair(p, every, [100, 100]))
            && oldLit.length === 2 && oldLit.every(p => pair(p, every, [100, 100])) && pair(oldBright, own, [100, 100]) && pair(oldest, every, [100, 100]) && notFn.every(p => pair(p, own, [100, 100]))
            && lost.length === 5 && lost.every((r, i) => j(r.inv) === j(['inv:mA>u_a']) && r.kept === '0111' && j(r.at) === j([10, 10]) && j(r.relay) === j(['relay:tA:' + (i % 2 === 1)]) && r.threw === '') && pair(found, quiet, [10, 10]), j([noGrid, noGridLit, noGridOld, old, oldLit, oldBright, oldest, notFn, lost, found]));

        // a token that carries a light: what is refused, stopped or put back is refused, stopped or put back as ever
        const litNo = [W => { W.tok('tA').locked = true; }, W => { W.tok('tA').hidden = true; }, W => { W.tok('tA').isChar = false; }, W => { W.net.paused = true; }, W => { W.net.roster.pA1.location = 'mO'; }].map(f => to({ pre: W => { lit(W); f(W); } }, 150, 100))
            .concat([to({ pre: lit, allow: () => false }, 150, 100), to({ pre: lit, paused: () => true }, 150, 100), both({ pre: lit }, 'b1', 'tA', 'mA'), both({ pre: lit }, 'w1', 'tA', 'mA'), to({ pre: lit }, NaN, 100), to({ pre: lit }, 150, 100, { rot: 'round' })]);
        const litHalt = [wallPre, turnPre, limitPre].map(f => to({ pre: W => { lit(W); f(W); } }, 150, 100));
        check('senses S0: a pos the host refuses empties nothing where the token carries a light either — a locked, a hidden or a plain token, a paused table or player, a map the player is not on, the rate limit, another player\'s token, a peer not admitted, a place or a turn that is no number, and a move not yet final that a wall, the turn order or the turn\'s move stops: all four sets are the very sets they were and the token stays where it stood; a final move put back empties that map\'s sets for every player, the other map\'s staying',
            litNo.length === 11 && litNo.every(p => p.length === 2 && p.every(still)) && litHalt.every(p => still(p[0]) && back(p[1])), j([litNo, litHalt]));

        // the relay run for real on a dark map: Ana's token carries a torch (4 cells bright, 8 dim), Bo's stands 10 cells east of it and sees 2 cells
        // by itself; a rat is dragged beside where the torch is, then Ana walks 40 cells east and it is dragged beside where the torch was and now is
        const carry = (fin, pre, light) => {
            const W = mkP({ pre: V => { V.camp.chars.c_b.values.f_sight = 10; V.camp.items.mT = M('mT', 5, null, [T('tTa', 'u_a', 'c_a', 10, 10, light === null ? {} : { light: Object.assign({}, torch, light) }), T('tTb', 'u_b', 'c_b', 20, 10), T('rat', '', 'c_n', 11, 10)]); if (pre) pre(V); } }), mT = W.camp.items.mT, rat = mT.whiteboard[2];
            const relay = c => { W.net.conns.forEach(x => { x.sent.length = 0; }); rat.x = c * 50; W.api.pos({ type: 'pos', campId: 'k', itemId: 'mT', wbId: 'rat', x: rat.x, y: rat.y }, null, W.camp, mT, rat); return W.net.conns.map(x => x.sent.length).join(''); };
            const r = { before: [relay(11), relay(51)] }; W.fog.canSeePoint('u_b', W.camp, W.camp.items.mA, 125, 125); const other = W.fog.seen('u_b|mA'), bo = W.fog.seen('u_b|mT');
            W.clear(); W.move(W.a1, 'tTa', 2500, 500, fin, 'mT');
            Object.assign(r, { inv: W.invs(), told: W.b1.sent.filter(m => m.type === 'pos').map(m => [m.wbId, m.x, m.y, m.final]), afresh: !!bo && !!W.fog.seen('u_b|mT') && W.fog.seen('u_b|mT') !== bo, other: !!other && W.fog.seen('u_b|mA') === other });
            r.after = [relay(11), relay(51)]; r.items = W.itemsOut();
            return r;
        };
        const moverOnly = W => { const real = W.win.wpFog.invalidateSeen; W.win.wpFog.invalidateSeen = function(m, p) { return arguments.length > 1 && typeof p !== 'string' ? real(m, 'u_a') : real.apply(null, arguments); }; };
        const cMid = carry(false), cFin = carry(true), cOld = carry(true, moverOnly), cNone = carry(true, null, null), cOff = carry(true, null, { off: true });
        const carried = fin => ({ before: ['11100', '00000'], inv: ['inv:mT>undefined'], told: [['tTa', 2500, 500, fin]], afresh: true, other: true, after: ['00000', '11100'], items: zero });
        check('senses S0: the live relay run for real after a torch was carried away (the real pos gate, relay, canSeePoint and seenKeyOf, on a dark map) — another player, who sees two cells by themselves, is relayed a creature beside the torch ten cells from them; once the torch-bearer has walked forty cells on, the next relayed position of a creature beside where the torch was does not reach that player, one beside where the torch now is does, and they are told where the torch-bearer went; mid-drag and at a final move alike, their set for another map staying the very set it was and no map sent; had the mover\'s set alone been emptied, the creature where the torch was would still be relayed to them and the one beside the torch would not',
            j(cMid) === j(carried(false)) && j(cFin) === j(carried(true)) && j(cOld) === j(Object.assign(carried(true), { inv: ['inv:mT>u_a'], told: [], afresh: false, after: ['00100', '11000'] }))
            && j(cNone) === j(Object.assign(carried(true), { before: ['11000', '00000'], inv: ['inv:mT>u_a'], told: [], afresh: false, after: ['00000', '11000'] }))
            && j(cOff) === j(Object.assign(carried(true), { before: ['11000', '00000'], told: [], after: ['00000', '11000'] })), j([cMid, cFin, cOld, cNone, cOff]));

        // a light that moves changes which cells anybody sees only on a dark map (the real lightMoves): set dark, or left to itself with a light source
        // placed on it, its walls under their cap. The walls and the lights are read anew once a case has set its map. A case is one move, mid-drag
        // or final by turns, but for the first dark and the first bright map, which are moved both ways
        const fresh = f => W => { f(W); W.fog.invalidateVision(); }, lightIs = l => W => { if (l) W.camp.items.mA.fog.light = l; else delete W.camp.items.mA.fog.light; };
        const lampOn = more => W => { delete W.camp.items.mA.fog.light; W.camp.items.mA.whiteboard.push(Object.assign({ id: 'lamp', type: 'light', x: 2000, y: 2000, w: 50, h: 50, light: Object.assign({}, torch) }, more || {})); };
        const narrow = { mode: 'arc', arc: 30 };   // a map that holds a wall is seen through a narrow arc here: a set is then a walk over a slice of the disc, not the whole of it
        const wallsOf = n => W => { W.camp.items.mA.fog.vision = Object.assign({}, narrow); W.camp.items.mA.whiteboard.push({ id: 'keep', type: 'rect', x: 5000, y: 5000, w: n * 50, h: n * 50, blocksSight: true }); };   // 70 cells square is under the old cap of 6000 cells, 80 is over it, and since 1.6.3 (finding 0) both are walls alike
        const askPre = W => { const real = W.win.wpFog.lightMoves; W.win.wpFog.lightMoves = m => { const v = real(m); W.ev.push('asked:' + (m && m.id) + '=' + v); return v; }; };
        const step = (pre, fin, more) => one({ pre: fresh(pre) }, fin, 'a1', 'tA', 'mA', Object.assign({ x: 150, y: 100 }, more || {})), asks = r => r.order.filter(e => /^asked/.test(e)).join();
        const darkAs = [lightIs('dark'), lampOn(), wallsOf(70)], notDark = [lightIs('bright'), lightIs('dim'), lightIs(''), lampOn({ hidden: true }), lampOn({ gmNoteFor: 'u_a' }), W => { W.feats.lighting = false; }, wallsOf(80)];
        const places = darkAs.concat(notDark), when = i => i % 2 === 1, bearer = places.map((st, i) => step(W => { lit(W); st(W); askPre(W); }, when(i))), plain = places.map((st, i) => step(W => { st(W); askPre(W); }, !when(i)));
        const bearerToo = [step(W => { lit(W); askPre(W); }, true), step(W => { lit(W); bright(W); askPre(W); }, false)];
        const bearerOff = [step(W => { litOff(W); }, false), step(W => { litOff(W); bright(W); }, true)], bearerTurn = [step(lit, true, { x: 100, rot: 90 }), step(W => { lit(W); bright(W); }, false, { x: 100, rot: 90 })];
        const bearerStay = step(W => { lit(W); askPre(W); }, true, { x: 110, y: 110 });
        check('senses S0: a token that carries a light and moves into another cell empties every player\'s set for that map only where a light that moves changes what is seen there (the real pos gate over the real lightMoves) — on a map set dark, on one left to itself that holds a placed light source, and on a dark map whose walls are under the old cap or (1.6.3, finding 0: walls are always walls) past it: of two players\' sets on two maps both of that map go and both of the other map stay; on a bright map, a dim one, one left to itself with no light source placed or with only a hidden one or a GM\'s note, with Lighting switched off, the mover\'s set for that map goes alone and the three others are the very sets they were; a light switched off and a turn on the spot alike; mid-drag and at a final move',
            FCx.LIMITS.blockerCells === 6000 && places.length === 10 && bearer.every((r, i) => (i < 3 || i === 9 ? every : own)(r, when(i), [150, 100])) && every(bearerToo[0], true, [150, 100]) && own(bearerToo[1], false, [150, 100])
            && every(bearerOff[0], false, [150, 100]) && own(bearerOff[1], true, [150, 100]) && every(bearerTurn[0], true, [100, 100]) && own(bearerTurn[1], false, [100, 100]), j([bearer, bearerToo, bearerOff, bearerTurn]));
        check('senses S0: a token without a light empties its player\'s set alone on every one of those maps, dark or not, and whether a light would move anything there is not even asked; for a light-bearer it is asked once, of the map the token stands on, after the move was written and before a set is emptied, and not at all where the token stayed in its cell and facing as it did',
            plain.length === 10 && plain.every((r, i) => own(r, !when(i), [150, 100]) && asks(r) === '') && bearer.every((r, i) => asks(r) === 'asked:mA=' + (i < 3 || i === 9))
            && j(bearerToo.map(r => r.order)) === j([['later:50', 'asked:mA=true', 'inv:mA>undefined', 'relay:tA:true'], ['asked:mA=false', 'inv:mA>u_a', 'relay:tA:false']])
            && quiet(bearerStay, true, [110, 110]) && asks(bearerStay) === '', j([plain, bearer.map(asks), bearerToo.map(r => r.order), bearerStay]));
        const olderLit = [undefined, null, 0].map((v, i) => step(W => { lit(W); bright(W); if (v === undefined) delete W.win.wpFog.lightMoves; else W.win.wpFog.lightMoves = v; }, when(i)));
        const olderPlain = step(noMoves(bright), true), olderDark = step(noMoves(lit), false);
        check('senses S0: with a fog module that does not say whether a light moves anything, a light-bearer\'s move into another cell empties every player\'s set for that map, on a bright map as on a dark one, as the host did before; a token without a light empties its player\'s alone; nothing is thrown',
            olderLit.length === 3 && olderLit.every((r, i) => every(r, when(i), [150, 100])) && own(olderPlain, true, [150, 100]) && every(olderDark, false, [150, 100]), j([olderLit, olderPlain, olderDark]));
        // a map nothing was worked out for yet: whether its walls are over their cap is counted by the question itself
        const unread = (n, fin) => one({ pre: older(W => { W.camp.items.mX = M('mX', 5, null, [T('tX', 'u_a', 'c_a', 2, 2, { light: Object.assign({}, torch) }), { id: 'keep', type: 'rect', x: 5000, y: 5000, w: n * 50, h: n * 50, blocksSight: true }]); }) }, fin, 'a1', 'tX', 'mX');
        const unreadOver = unread(80, true), unreadUnder = unread(70, false);
        check('senses S0: whether a light that moves changes what is seen is judged on the walls as they are counted at that moment — on a dark map nothing was worked out for yet, with a fog module that gives no text, a light-bearer\'s move names every player where the walls are under the old cap and (1.6.3, finding 0) past it alike; the sets of the other maps are the very sets they were',
            lands(unreadOver, 'inv:mX>undefined', '1111', four, 'relay:tX:true') && lands(unreadUnder, 'inv:mX>undefined', '1111', four, 'relay:tX:false'), j([unreadOver, unreadUnder]));

        // a light carried inside a wall's cell is seated beside the wall by where the token stands in the cell: there the text holds the exact place.
        // Ana's token is put with its center 20 to the left of and 10 above the middle of its cell, and moves 24 to the right inside that cell; the walls
        // rule reads the real moveBlocked, which never counts the cell a move begins in
        const rule = mode => W => { W.camp.turnRules = { walls: mode }; W.win.wpFog.moveBlocked = W.fog.blocked; };
        const stand = W => { const t = W.tok('tA'); t.x = 80; t.y = 90; W.camp.items.mA.fog.vision = Object.assign({}, narrow); }, piece = more => W => { W.camp.items.mA.whiteboard.push(Object.assign({ id: 'wall', type: 'rect', x: 105, y: 105, w: 40, h: 40, blocksSight: true }, more || {})); };
        const inWall = (fin, f, x, mode, y) => one({ pre: fresh(W => { stand(W); rule(mode || 'off')(W); f(W); }) }, fin, 'a1', 'tA', 'mA', { x: x === undefined ? 104 : x, y: y === undefined ? 90 : y }), litWall = W => { lit(W); piece()(W); };
        const wLit = [inWall(false, litWall), inWall(true, litWall, 104, 'warn'), inWall(true, W => { litOff(W); piece({ sightType: 'door' })(W); }, 81), inWall(false, litWall, 80, 'refuse', 100)];
        const wWhen = [false, true, true, false], wAt = [[104, 90], [104, 90], [81, 90], [80, 100]], wBright = inWall(true, W => { litWall(W); bright(W); });
        const wQuiet = [inWall(false, lit), inWall(true, lit), inWall(true, piece()), inWall(true, W => { lit(W); piece({ hidden: true })(W); }), inWall(false, W => { lit(W); piece({ sightType: 'door', doorOpen: true })(W); }), inWall(false, W => { lit(W); piece({ x: 155 })(W); })], qWhen = [false, true, true, true, false, false];
        check('senses S0: a light-bearer that moves inside a wall\'s or a closed door\'s cell on a dark map empties every player\'s set for that map (the real pos gate over the real seenKeyOf, lightMoves and moveBlocked), by 24 px and by one, across the cell and down it, its light switched on or off, the walls rule on Off, on Warn and on Refuse (the cell a move begins in never stops it, and no note is sent), mid-drag and at a final move — the light is seated beside the wall by where the token stands in the cell; on a bright map the mover\'s set alone; the same move inside an open cell, beside a wall, in the cell of a hidden wall or of an open door, empties nothing, nor does a token without a light inside a wall\'s cell',
            wLit.length === 4 && wLit.every((r, i) => every(r, wWhen[i], wAt[i])) && own(wBright, true, [104, 90]) && wQuiet.length === 6 && wQuiet.every((r, i) => quiet(r, qWhen[i], [104, 90])), j([wLit, wBright, wQuiet]));

        // the relay run for real: a wall five cells long, the torch-bearer in its middle cell, left of the middle, so the torch is seated on the wall's
        // left; Bo's token stands past the wall's end, faces down the wall, sees two cells by itself and has a clear line to both sides; a rat is dragged to the left
        // of the wall and to the right of it, before and after the torch-bearer moves 24 px to the right inside the cell
        const nudge = (fin, mode, pre) => {
            const W = mkP({ pre: V => { V.camp.chars.c_b.values.f_sight = 10; rule(mode)(V); V.camp.items.mN = M('mN', 5, { vision: { mode: 'arc', arc: 60 } }, [T('tNa', 'u_a', 'c_a', 0, 0, { x: 480, y: 490, light: Object.assign({}, torch) }), T('tNb', 'u_b', 'c_b', 10, 3, { rot: 180 }), T('rat', '', 'c_n', 8, 10),
                { id: 'wallN', type: 'rect', x: 505, y: 405, w: 40, h: 240, blocksSight: true }]); if (pre) pre(V); V.fog.invalidateVision(); } }), mN = W.camp.items.mN, rat = mN.whiteboard[2];
            const relay = c => { W.net.conns.forEach(x => { x.sent.length = 0; }); rat.x = c * 50; W.api.pos({ type: 'pos', campId: 'k', itemId: 'mN', wbId: 'rat', x: rat.x, y: rat.y }, null, W.camp, mN, rat); return W.b1.sent.length; };
            const r = { walls: W.fog.wallCells(mN), before: [relay(8), relay(12)] }; W.fog.canSeePoint('u_b', W.camp, W.camp.items.mA, 125, 125); const other = W.fog.seen('u_b|mA'), bo = W.fog.seen('u_b|mN');
            W.clear(); W.move(W.a1, 'tNa', 504, 490, fin, 'mN');
            Object.assign(r, { inv: W.invs(), at: [W.tok('tNa', 'mN').x, W.tok('tNa', 'mN').y], notes: W.a1.sent.filter(m => m.type === 'turn-note').length, same: !!bo && W.fog.seen('u_b|mN') === bo, other: !!other && W.fog.seen('u_b|mA') === other });
            r.after = [relay(8), relay(12)]; r.items = W.itemsOut();
            return r;
        };
        const threePart = W => { const real = W.win.wpFog.seenKeyOf; W.win.wpFog.seenKeyOf = (m, w) => { const k = real(m, w); return typeof k === 'string' ? k.split('|').slice(0, 3).join('|') : k; }; };
        const nWall = [nudge(false, 'warn'), nudge(true, 'off')], nOld = nudge(true, 'off', threePart);
        const nudged = { walls: ['10,10', '10,11', '10,12', '10,8', '10,9'], before: [1, 0], inv: ['inv:mN>undefined'], at: [504, 490], notes: 0, same: false, other: true, after: [0, 1], items: zero };
        check('senses S0: the live relay run for real after a torch-bearer moved inside a wall\'s cell (the real pos gate, relay, canSeePoint, seenKeyOf, lightMoves and moveBlocked, on a dark map, the walls rule on Warn and on Off) — standing left of the middle of the cell the torch lights the wall\'s left side: a creature there is relayed to another player, who sees two cells by themselves, and one on the wall\'s right side is not; once the torch-bearer has moved 24 px to the right inside that cell, every player\'s set for that map is emptied, the next relayed position of a creature on the left does not reach that player and one on the right does; mid-drag and at a final move, with no note, their set for another map staying the very set it was and no map sent; had the text held no exact place, no set would be emptied and the relay would go on judging by where the torch was seated',
            nWall.every(r => j(r) === j(nudged)) && j(nOld) === j(Object.assign({}, nudged, { inv: [], same: true, after: [1, 0] })), j([nWall, nOld]));
    }

    // 21. a player's map copy and their threat marks: that map's set is emptied before the map goes out
    {
        const th = (pre, msg) => { const W = mkW({ maps: ['mA', 'mO'] }); W.net.roster.pA1.location = 'mA'; if (pre) pre(W); W.clear(); W.api.threats(Object.assign({ type: 'threats', campId: 'k', itemId: 'mA', wbId: 'tA', threats: [90] }, msg || {}), W.a1); return { ev: W.ev.filter(e => /^inv|^timer|^send:[^:]+:item/.test(e)), marks: W.camp.items.mA.whiteboard[0].threats, items: W.itemsOut() }; };
        const put = th(), same = th(W => { W.camp.items.mA.whiteboard[0].threats = [90]; }), notTheirs = th(null, { wbId: 'tB' }), lockedT = th(W => { W.camp.items.mA.whiteboard[0].locked = true; }), noInvT = th(W => { delete W.win.wpFog.invalidateSeen; });
        check('senses S0: a player\'s threat marks that changed something (the real threats branch) ask for the save, empty that map\'s set and then send the map, in that order and the set once — to every connection but the sender\'s, whose copy catches up in place (fold M10: the player\'s other connection gets it); marks that change nothing or are refused (another player\'s token, a locked one) empty nothing and send nothing',
            j(put.ev) === j(['timer:250', 'inv:mA', 'send:pA2:item:mA', 'send:pB:item:mA']) && j(put.marks) === j([90]) && [same, notTheirs, lockedT].every(r => j(r.ev) === j([]) && j(r.items) === j([0, 0, 0, 0, 0])) && j(noInvT.ev) === j(['timer:250', 'send:pA2:item:mA', 'send:pB:item:mA']), j([put, same, notTheirs, lockedT, noInvT]));
        const srcC = src.replace(/\/\/[^\n]*/g, ''), posC = posS2.replace(/\/\/[^\n]*/g, ''), count1 = (s, re) => (s.replace(/\/\/[^\n]*/g, '').match(re) || []).length === 1;
        // a call and what it is given, brackets inside brackets two deep
        const calls = /invalidateSeen\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, ownMove = 'invalidateSeen(msg.itemId, w.light && (!window.wpFog.lightMoves || window.wpFog.lightMoves(map)) ? undefined : pr.id)';
        check('senses S0 (source): a player\'s map copy that changed something empties that map\'s sets after the save is asked for and before the map goes out, and a copy that changed nothing does neither; nowhere in net.js is the whole of it emptied by that call, and the seven places that empty a set name the map — a copy made under a new text, a whole map sent to the table, the hook, a move put back, a map copy and threat marks every player\'s set of it, and a player\'s own move that player\'s alone, or every player\'s where the token carries a light and the fog says a light that moves changes what is seen on that map, or does not say; there the gate reads where the token sees and lights from before it writes the new place and facing, and empties after the write and the seat and before the move is rebuilt and relayed, only where that text is missing or is no longer the same (read once after the seat, fold M7); nothing else in net.js reads the text but fogKey (fold M7), or asks about a light that moves',
            /var pOut = \{ conn: conn \}, changed = applyClientItemFiltered\(msg, profile, pOut\);[^\n]*\n            if \(changed\) \{\n(?:                [^\n]*\n){3,6}                saveRemoteSoon\(\);\n                if \(window\.wpFog && window\.wpFog\.invalidateSeen\) window\.wpFog\.invalidateSeen\(msg\.itemId\);[^\n]*\n                net\.sendItem\(msg\.campId, msg\.itemId, null, pOut\.strokes \? null : conn\);[^\n]*\n            \}\n            if \(pOut\.whole\) net\.sendItem\(msg\.campId, msg\.itemId, conn, null, msg\.a\);[^\n]*\n            \} finally \{ if \(typeof ackTook === 'function'\) ackTook\(conn, msg\.a\); \}\n            \/\/ \[netcheck:itempatch-end\]\n        \} else \{\n            if \(!fromHost\(conn\)\) return;[^\n]*\n            applyItem\(msg\);/.test(src)
            && (srcC.match(/invalidateSeen\(/g) || []).length === 7 && j((srcC.match(calls) || []).sort()) === j(['invalidateSeen(id)', 'invalidateSeen(itemId)', 'invalidateSeen(map.id)', 'invalidateSeen(msg.itemId)', 'invalidateSeen(msg.itemId)', 'invalidateSeen(msg.itemId)', ownMove]) && !/invalidateSeen\(\s*\)/.test(srcC)
            && count1(flS, /invalidateSeen\(map\.id\)/g) && count1(whole('net.broadcastItemFiltered = function('), /invalidateSeen\(itemId\)/g) && count1(smS, /invalidateSeen\(/g) && count1(smS, /invalidateSeen\(id\)/g) && count1(posS2, /invalidateSeen\(msg\.itemId\)/g) && posC.split(ownMove).length === 2 && count1(posS2, /invalidateSeen\(msg\.itemId,/g) && count1(thS2, /invalidateSeen\(msg\.itemId\)/g)
            && (srcC.match(/seenKeyOf/g) || []).length === 5 && (posC.match(/seenKeyOf/g) || []).length === 3 && (between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove', 'netfog.js').replace(/\/\/[^\n]*/g, '').match(/seenKeyOf/g) || []).length === 2 && (srcC.match(/lightMoves/g) || []).length === 2 && (posC.match(/lightMoves/g) || []).length === 2
            && posC.split('\n').map(l => l.trim()).filter(l => l).join('\n').indexOf([
                'if (window.wpHistFlush) window.wpHistFlush();',
                'var skW = window.wpFog && window.wpFog.seenKeyOf ? window.wpFog.seenKeyOf(map, w) : null;',
                'w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;',
                'if (msg.final) setTimeout(function() { checkRoomHandouts(map); }, 50);',
                'if (msg.final && window.wpSeatDrop && window.wpSeatDrop(w, map, w.gridFit === true)) { msg = Object.assign({}, msg, { x: w.x, y: w.y }); }',
                'var skN = skW === null ? null : window.wpFog.seenKeyOf(map, w), mvW = skW === null || skN !== skW;',
                'if (window.wpFog && window.wpFog.invalidateSeen && mvW) window.wpFog.' + ownMove + ';',
                'msg = { type: \'pos\', campId: msg.campId, itemId: msg.itemId, wbId: msg.wbId, x: msg.x, y: msg.y, rot: msg.rot, front: msg.front, final: msg.final === true };',
                'applyPosToDom(msg);',
                'broadcastPos(msg, conn, camp, map, w);'].join('\n')) > 0
            && /\nfunction snapBack\(camp, map, w, msg, to, mover\) \{[^\n]*\n[^\n]*\n    w\.x = to\.x; w\.y = to\.y;\n    if \(to && typeof to\.rot === 'number'\) \{ w\.rot = to\.rot; w\.front = Number\(to\.front\) \|\| 0; \}[^\n]*\n    if \(window\.wpFog && window\.wpFog\.invalidateSeen\) window\.wpFog\.invalidateSeen\(msg\.itemId\);[^\n]*\n    var back = /.test(src), j(srcC.match(calls)));
    }

    // 22. a Sight a player cannot work out for themselves: nothing is sent from the hook
    {
        const F = (id, key, kind, more) => Object.assign({ id, key, label: key, kind, edit: 'owner', vis: 'all' }, more || {});
        const sysOf = fields => Sx.cleanSystem({ v: 1, name: 'H', rolls: [], fields }, { F: Fx, gmView: true });
        const base = F('f_base', 'Base', 'number', { def: 50 }), gmFig = F('f_g', 'GMFig', 'number', { def: 10, vis: 'gm' });
        const sysVis = sysOf([base, F('f_sight', 'Sight', 'formula', { formula: 'Base + 10' })]), sysGm = sysOf([F('f_sight', 'Sight', 'number', { def: 60, vis: 'gm' })]), sysDer = sysOf([base, gmFig, F('f_sight', 'Sight', 'formula', { formula: 'Base + GMFig' })]);
        const sysDeep = sysOf([base, gmFig, F('f_mid', 'Mid', 'formula', { formula: 'GMFig * 2' }), F('f_sight', 'Sight', 'formula', { formula: 'Base + Mid' })]), sysPool = sysOf([gmFig, F('f_sight', 'Sight', 'resource', { maxFormula: 'GMFig * 6', def: 'max', min: 0 })]);
        const sysGmForm = sysOf([base, F('f_sight', 'Sight', 'formula', { formula: 'Base + 10', vis: 'gm' })]);
        const W = mkW({ maps: ['mA'] }), campOf2 = (system, fog) => ({ id: 'k', system, fog: fog === undefined ? { fields: { sight: 'f_sight' } } : fog });
        const sent = V => ({ made: V.made(500), inv: V.invs(), pend: V.pendKeys(), fired: V.fire(500), items: V.itemsOut(), sig: V.sigs()['u_a|mA'], at: V.ats()['u_a|mA'], fog: V.net.conns.map(c => c.sent.filter(m => m.type === 'combats' || m.type === 'targets').length) });
        const prime = system => { const V = mkW({ maps: ['mA', 'mO'], system }); V.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA', init: 3, src: null }] } }; V.net.sensesMoved(null); V.clear(); return V; };
        const hv = prime(sysVis); hv.api.edit(EDIT('f_base', 55), hv.a1); const seenOut = sent(hv);
        const hd = prime(sysDer); hd.api.edit(EDIT('f_base', 55), hd.a1); const derTypes = hd.types(hd.a1), derOut = sent(hd);
        const hg = prime(sysGm); hg.gm('c_a', 70); const gmOut = sent(hg); hg.ev.length = 0; hg.gm('c_a', 70); hg.net.sensesMoved(null); const gmAgain = sent(hg);
        const hn = prime(sysDer); hn.SC = () => null; hn.camp.chars.c_a.values.f_base = 55; hn.net.sensesMoved('c_a'); const blindOut = sent(hn);
        check('senses S0: a hidden Sight is the campaign\'s default on the host too (the owner\'s answer, 2026-09-29), so a change of it moves nothing — a player\'s own edit of a value the hidden formula reads, the GM\'s change of a GM-only number, a system the hook cannot judge: no send, no map, turn order or pointer, no set emptied, the text the default\'s (6 cells) — while the same edit with a Sight players see queues and sends their map',
            j(seenOut) === j({ made: 1, inv: ['inv:mA'], pend: ['u_a|mA'], fired: 1, items: [1, 1, 0, 0, 0], sig: '13', at: '13', fog: [1, 1, 0, 0, 0] }) && j(derTypes) === j(['char-ack', 'charDelta'])
            && [derOut, blindOut, gmOut, gmAgain].every(r => j(r) === j({ made: 0, inv: [], pend: [], fired: 0, items: [0, 0, 0, 0, 0], sig: '6', at: '6', fog: [0, 0, 0, 0, 0] })), j([seenOut, derTypes, derOut, gmOut, gmAgain, blindOut]));
        const late = prime(sysS); late.gm('c_a', 70); const lateKeys = late.pendKeys(); late.clear(); late.camp.system = sysGm; const lateOut = sent(late), lateLeft = late.pendKeys();
        const ctl = prime(sysS); ctl.gm('c_a', 70); ctl.clear(); const ctlOut = sent(ctl);
        const next = prime(sysGm); next.gm('c_a', 70); next.clear(); next.net.sendItem('k', 'mA'); const nextOut = [next.items(next.a1), next.sigs()['u_a|mA']];
        check('senses S0: a send already waiting when the Sight becomes hidden fires as any other, with a copy made by the campaign\'s default (the Sight it now has for that player), and waits no longer; the next ordinary send of that map is made by the default too, never the hidden number',
            j(lateKeys) === j(['u_a|mA']) && lateOut.fired === 1 && j(lateOut.items) === j([1, 1, 0, 0, 0]) && j(lateOut.fog) === j([1, 1, 0, 0, 0]) && lateOut.sig === '6' && j(lateLeft) === j([]) && ctlOut.fired === 1 && j(ctlOut.items) === j([1, 1, 0, 0, 0]) && ctlOut.sig === '14'
            && j(nextOut) === j([['mA:tA'], '6']), j([lateOut, lateLeft, ctlOut, nextOut]));
    }

    // 23. the three stores, dropped as one: a row, a map's rows, a player's rows, all of them
    {
        const conn = peer => ({ peer, open: true, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(j(m))); } });
        const W = mkW({ maps: ['mA', 'mO'], bare: true });
        W.camp.items.b = M('b', 5, null, [T('tb1', 'u_a', 'c_a', 2, 2), T('tb2', 'u_b', 'c_b', 2, 50)]); W.camp.items.ab = M('ab', 5, null, [T('tb3', 'u_a', 'c_a', 2, 2), T('tb4', 'u_b', 'c_b', 2, 50)]);
        const p1 = conn('p1'), p10 = conn('p10'); W.net.conns.push(p1, p10); W.net.roster.p1 = { id: 'u_1', name: 'One' }; W.net.roster.p10 = { id: 'u_10', name: 'Ten' };
        W.camp.items.mA.whiteboard.push(T('t1', 'u_1', 'c_c', 4, 4), T('t10', 'u_10', 'c_c', 6, 6));
        W.sendAll(); W.camp.chars.c_a.values.f_sight = 70; W.camp.chars.c_b.values.f_sight = 70; W.camp.chars.c_c.values.f_sight = 70; W.net.sensesMoved(null);
        const stores = () => ({ sig: Object.keys(W.sigs()), at: Object.keys(W.ats()), pend: W.pendKeys() }), all0 = stores(), keys0 = W.api.keys().slice().sort();
        W.ev.length = 0; W.api.forgetMap('b'); const afterMap = stores(), clearedMap = W.ev.filter(e => e === 'clear:500').length;
        W.api.forgetMap(''); W.api.forgetMap('nowhere'); W.api.forgetMap('A'); W.api.forgetMap('|ab'); const afterNone = stores();
        W.ev.length = 0; W.api.forget('u_1'); const afterPid = stores(), clearedPid = W.ev.filter(e => e === 'clear:500').length;
        W.ev.length = 0; W.api.drop('u_a|mA'); W.api.drop('u_a|mO'); W.api.drop('u_zz|mA'); const afterDrop = stores(), clearedDrop = W.ev.filter(e => e === 'clear:500').length;
        const firedLeft = W.fire(500), sentLeft = [W.items(W.a1), W.items(W.b1), W.items(p1), W.items(p10)];
        W.net.sensesMoved(null); W.ev.length = 0; W.api.reset(); const afterReset = [stores(), W.api.keys(), W.ev.filter(e => e === 'clear:500').length > 0, W.fire(500)];
        const want0 = ['u_10|ab', 'u_10|b', 'u_10|mA', 'u_10|mO', 'u_1|ab', 'u_1|b', 'u_1|mA', 'u_1|mO', 'u_a|ab', 'u_a|b', 'u_a|mA', 'u_a|mO', 'u_b|ab', 'u_b|b', 'u_b|mA', 'u_b|mO'], moved0 = ['u_10|mA', 'u_1|mA', 'u_a|ab', 'u_a|b', 'u_a|mA', 'u_b|ab', 'u_b|b', 'u_b|mA', 'u_b|mO'];
        const less = (l, f) => l.filter(k => !f(k));
        check('senses S0: what is kept for a player and a map lives in three stores that are dropped as one — a map\'s rows go for every player with the sends waiting for it cleared, and a map whose name only ends the same keeps its own; a player\'s rows go with their sends, and a player whose name only begins the same keeps theirs; one row goes with its send; a send that was cleared never fires and the rest still do; a new table starts with all three empty',
            j(keys0) === j(want0) && j(all0) === j({ sig: want0, at: want0, pend: moved0 }) && j(afterMap) === j({ sig: less(want0, k => /\|b$/.test(k)), at: less(want0, k => /\|b$/.test(k)), pend: less(moved0, k => /\|b$/.test(k)) }) && clearedMap === 2 && j(afterNone) === j(afterMap)
            && j(afterPid) === j({ sig: less(afterMap.sig, k => /^u_1\|/.test(k)), at: less(afterMap.at, k => /^u_1\|/.test(k)), pend: less(afterMap.pend, k => /^u_1\|/.test(k)) }) && afterPid.pend.includes('u_10|mA') && clearedPid === 1
            && j(afterDrop) === j({ sig: less(afterPid.sig, k => /^u_a\|m/.test(k)), at: less(afterPid.at, k => /^u_a\|m/.test(k)), pend: less(afterPid.pend, k => /^u_a\|m/.test(k)) }) && clearedDrop === 1
            && firedLeft === 5 && j(sentLeft) === j([['ab:tb3'], ['mA:tB', 'mO:tB2+orc3', 'ab:tb4'], [], ['mA:tA+orc+ogre+t1+t10']]) && j(afterReset) === j([{ sig: [], at: [], pend: [] }, [], true, 0]), j([all0, afterMap, clearedMap, afterPid, clearedPid, afterDrop, clearedDrop, firedLeft, sentLeft, afterReset]));

        // rows no send waits for: what a copy was made by with the text last known, kept since the copy was made; and rows whose sends the hook queued
        // (a Sight hidden from players reads the campaign's default, as any other)
        const O = mkW({ maps: ['mA', 'mO'] }), o0 = [Object.keys(O.sigs()), Object.keys(O.ats()), O.pendKeys()]; O.api.forgetMap('mA'); const o1 = [Object.keys(O.sigs()), Object.keys(O.ats())]; O.api.forget('u_a'); const o2 = [Object.keys(O.sigs()), Object.keys(O.ats())]; O.api.reset(); const o3 = [Object.keys(O.sigs()), Object.keys(O.ats())];
        const sysHid = Sx.cleanSystem({ v: 1, name: 'H', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'gm' }] }, { F: Fx, gmView: true });
        const hidW = () => { const V = mkW({ maps: ['mA', 'mO'], bare: true, system: sysHid }); V.net.sensesMoved(null); return V; }, rowsOf = V => [Object.keys(V.sigs()), Object.keys(V.ats()), V.pendKeys()];
        const h0 = rowsOf(hidW()), hMap = (() => { const V = hidW(); V.api.forgetMap('mA'); return rowsOf(V); })(), hPid = (() => { const V = hidW(); V.api.forget('u_a'); return rowsOf(V); })(), hAll = (() => { const V = hidW(); V.api.reset(); return rowsOf(V); })(), hGone = (() => { const V = hidW(); V.net.itemGone('k', 'mO'); return rowsOf(V); })();
        check('senses S0: a row is dropped like any other — what a copy was made by and the text last known, both kept from the moment the copy is made, before the hook ever ran; and the rows of sends the hook queued (a hidden Sight reads the default, as any other), with their sends: by map, by player, by a map that left the table, and all of them for a new table',
            j(o0) === j([['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], ['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], []]) && j(o1) === j([['u_a|mO', 'u_b|mO'], ['u_a|mO', 'u_b|mO']]) && j(o2) === j([['u_b|mO'], ['u_b|mO']]) && j(o3) === j([[], []])
            && j(h0) === j([[], ['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], ['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO']]) && j(hMap) === j([[], ['u_a|mO', 'u_b|mO'], ['u_a|mO', 'u_b|mO']]) && j(hPid) === j([[], ['u_b|mA', 'u_b|mO'], ['u_b|mA', 'u_b|mO']]) && j(hAll) === j([[], [], []]) && j(hGone) === j([[], ['u_a|mA', 'u_b|mA'], ['u_a|mA', 'u_b|mA']]), j([o0, o1, o2, o3, h0, hMap, hPid, hAll, hGone]));

        // a map that stopped being fogged: the hook drops its rows for every player, whichever character changed
        const U = mkW({ maps: ['mA', 'mO'] }); U.gm('c_a', 70); U.gm('c_b', 70); const uKeys = [U.api.keys().slice().sort(), U.pendKeys()]; U.ev.length = 0;
        U.camp.items.mO.fog.on = false; U.net.sensesMoved('c_a'); const uOne = [U.api.keys().slice().sort(), U.pendKeys(), U.ev.filter(e => e === 'clear:500').length, U.invs()];
        U.camp.items.mA.fog.on = false; U.ev.length = 0; U.net.sensesMoved('c_n'); const uTwo = [U.api.keys(), U.pendKeys(), U.ev.filter(e => e === 'clear:500').length, U.ev.filter(e => /^sig:|^inv/.test(e)), U.fire(500), U.itemsOut()];
        check('senses S0: a map that is no longer fogged has its rows dropped by the hook for every player at the table, its sends cleared, whichever character changed and whether or not that map holds a token of it; nothing of it is compared, emptied or sent',
            j(uKeys) === j([['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], ['u_a|mA', 'u_b|mA', 'u_b|mO']]) && j(uOne) === j([['u_a|mA', 'u_b|mA'], ['u_a|mA', 'u_b|mA'], 1, []]) && j(uTwo) === j([[], [], 2, [], 0, [0, 0, 0, 0, 0]]), j([uKeys, uOne, uTwo]));

        // a map that is gone (net.itemGone, run for real), and a player removed from the session (net.kickPlayer, run for real)
        const G = mkW({ maps: ['mA', 'mO', 'mU'] }); G.gm('c_a', 70); G.gm('c_b', 70); G.net.sendItem('k', 'mU'); const gBase = Object.keys(G.api.last()); G.clear(); G.net.itemGone('k', 'mA');
        const gOut = [G.api.keys().slice().sort(), G.pendKeys(), G.ev.filter(e => e === 'clear:500').length, G.net.conns.map(c => c.sent.map(m => m.type + ':' + m.itemId).join()), G.fire(500), G.items(G.b1)];
        G.clear(); G.net.role = 'client'; G.net.itemGone('k', 'mO'); G.net.itemGone('k', 'mU'); const gQuiet = [G.api.keys(), G.net.conns.map(c => c.sent.length), Object.keys(G.api.last())];
        check('senses S0: when a map leaves the table (net.itemGone, run for real) every player\'s rows of it go with its sends, which never fire, and the other maps\' stay and still send; the players are told as ever, admitted and open connections only; off a session the rows and the baseline go and nobody is told',
            j(gBase) === j(['mU']) && j(gOut) === j([['u_a|mO', 'u_b|mO'], ['u_b|mO'], 2, ['itemGone:mA', 'itemGone:mA', 'itemGone:mA', '', ''], 1, ['mO:tB2+orc3']]) && j(gQuiet) === j([[], [0, 0, 0, 0, 0], []]), j([gBase, gOut, gQuiet]));
        // fold M1: every admitted connection of the removed profile goes with the one clicked (each told 'kicked', out of the roster, closed after 400 ms)
        const kick = (pre, peer) => { const K = mkW({ maps: ['mA', 'mO'] }); K.gm('c_a', 70); K.gm('c_b', 70); K.net.conns.forEach(c => { c.close = () => { K.ev.push('close:' + c.peer); }; }); if (pre) pre(K); K.clear(); const t0 = K.toasts.length; let threw = ''; try { K.net.kickPlayer(peer || 'pA1'); } catch (e) { threw = e.message; }
            const r = { K, keys: K.api.keys().slice().sort(), pend: K.pendKeys(), cleared: K.ev.filter(e => e === 'clear:500').length, roster: Object.keys(K.net.roster), banned: Object.keys(K.api.banned()), told: K.net.conns.map(c => c.sent.map(m => m.type).join()).join('/'), waiting: K.ev.filter(e => /^dropWaiting/.test(e)), close: K.made(400), toasts: K.toasts.length - t0, threw };
            r.shutAt = K.ev.filter(e => /^close:/.test(e)).length; K.fire(400); r.shut = K.ev.filter(e => /^close:/.test(e)); return r; };
        const bRows = ['u_b|mA', 'u_b|mO'], k1 = kick(), k1Fired = k1.K.fire(500), k1Items = [k1.K.items(k1.K.a1), k1.K.items(k1.K.a2), k1.K.items(k1.K.b1)];
        // after the kick: a GM save of each map, a whole map to the table, a change of Ana's Sight and every senses timer fired — nothing more reaches either connection of hers
        k1.K.clear(); k1.K.net.sendItem('k', 'mA'); k1.K.net.sendItem('k', 'mO'); k1.K.net.broadcastItemFiltered('k', 'mA'); k1.K.gm('c_a', 75); k1.K.gm('c_b', 75); const k1Later = { made: k1.K.waiting(500), pend: k1.K.pendKeys(), fired: k1.K.fire(500), a1: k1.K.a1.sent.length, a2: k1.K.a2.sent.length, b1: k1.K.items(k1.K.b1), rows: k1.K.api.keys().slice().sort() };
        k1.K.clear(); k1.K.net.kickPlayer('pA2'); const k2 = [k1.K.api.keys().slice().sort(), k1.K.pendKeys(), k1.K.ev.filter(e => e === 'clear:500').length, k1.K.net.conns.map(c => c.sent.map(m => m.type).join()).join('/'), Object.keys(k1.K.api.banned())];
        const kShut = kick(K => { K.a2.open = false; }), kOut = kick(K => { delete K.net.roster.pA2; }), kLast = kick(null, 'pB'), kNone = kick(null, 'pGhost'), kWait = kick(null, 'pW'), kClient = kick(K => { K.net.role = 'client'; });
        check('senses S0 and M1: a player removed from the session (net.kickPlayer, run for real) is forgotten there and then — their rows and their sends go, since the close that follows finds nobody to forget — and, CHANGED in fold M1, so is every other admitted connection of theirs: it is told \'kicked\', leaves the roster and is closed after 400 ms, and no GM save, whole map, change of Sight or senses timer sends it anything afterwards (before, it stayed and still got its map); a second connection already closed or no longer admitted changes none of it; another player\'s rows never go; removing a peer not at the table forgets nobody',
            j(k1.keys) === j(bRows) && j(k1.pend) === j(bRows) && k1.cleared === 1 && j(k1.roster) === j(['pB', 'pC']) && j(k1.banned) === j(['u_a']) && k1.told === 'kicked/kicked///' && j(k1.waiting) === j(['dropWaiting:u_a']) && k1.close === 2 && k1.shutAt === 0 && j(k1.shut) === j(['close:pA1', 'close:pA2']) && k1.toasts === 1 && k1.threw === ''
            && k1Fired === 2 && j(k1Items) === j([[], [], ['mA:tB', 'mO:tB2+orc3']]) && j(k1Later) === j({ made: 2, pend: bRows, fired: 2, a1: 0, a2: 0, b1: ['mA:tB', 'mO:tB2+orc3', 'mA:tB', 'mA:tB', 'mO:tB2+orc3'], rows: bRows }) && j(k2) === j([bRows, [], 0, '/kicked///', ['u_a']])
            && [kShut, kOut].every(r => j(r.keys) === j(bRows) && j(r.pend) === j(bRows) && r.cleared === 1 && j(r.roster) === j(['pB', 'pC']) && r.threw === '') && kShut.told === 'kicked/kicked///' && kShut.close === 2 && kOut.told === 'kicked////' && kOut.close === 1 && j(kOut.shut) === j(['close:pA1'])
            && j(kLast.keys) === j(['u_a|mA', 'u_a|mO']) && j(kLast.pend) === j(['u_a|mA']) && kLast.cleared === 2 && j(kLast.roster) === j(['pA1', 'pA2', 'pC']) && j(kLast.banned) === j(['u_b']) && kLast.told === '//kicked//' && j(kLast.shut) === j(['close:pB'])
            && [kNone, kWait, kClient].every(r => r.keys.length === 4 && r.pend.length === 3 && r.cleared === 0 && r.banned.length === 0 && r.roster.length === 4 && r.waiting.length === 0 && r.threw === '') && kWait.told === '///kicked/' && j(kWait.shut) === j(['close:pW']) && kNone.told === '////' && kNone.close === 0
            && kClient.told === '////' && kClient.close === 0 && kClient.toasts === 0, j([k1.keys, k1.pend, k1.cleared, k1.roster, k1.told, k1.close, k1.shut, k1.toasts, k1Fired, k1Items, k1Later, k2, kShut.told, kOut.told, kLast.keys, kLast.told, kNone.told, kWait.told, kClient.told]));
        // M1 round 2: the removed player's target pointer goes with them, through the real broadcastTargets on this fogged table (each admitted player their own view)
        const ptrs = () => ({ u_a: { mapId: 'mA', id: 'orc' }, u_b: { mapId: 'mA', id: 'tB' } });
        const kT = kick(K => { K.net.targets = ptrs(); }), kTo = { targets: Object.keys(kT.K.net.targets), seq: kT.K.seq.slice(), pB: kT.K.b1.sent.filter(m => m.type === 'targets').map(m => Object.keys(m.targets)), told: kT.told, shut: kT.shut };
        const kTn = kick(K => { K.net.targets = { u_b: ptrs().u_b }; }), kTw = kick(K => { K.net.targets = ptrs(); }, 'pW');
        check('senses S0 and M1 round 2: on a fogged table a removed player\'s target pointer is deleted, the map redrawn, and the real broadcastTargets sends the rest to the one admitted open connection left (pB, the pointer it may see), then the roster goes out, all before either of the removed connections is told \'kicked\'; they, the waiting peer and the closed connection get no pointers; a player with no pointer sends none and the roster still goes out; removing a waiting peer sends neither and keeps every pointer',
            j(kTo) === j({ targets: ['u_b'], seq: ['render', 'send:pB:targets', 'roster-out', 'send:pA1:kicked', 'send:pA2:kicked'], pB: [['u_b']], told: 'kicked/kicked/targets//', shut: ['close:pA1', 'close:pA2'] })
            && j([Object.keys(kTn.K.net.targets), kTn.K.seq]) === j([['u_b'], ['roster-out', 'send:pA1:kicked', 'send:pA2:kicked']]) && j([Object.keys(kTw.K.net.targets), kTw.K.seq, kTw.told]) === j([['u_a', 'u_b'], ['send:pW:kicked'], '///kicked/']), j([kTo, kTn.K.seq, kTw.K.seq]));
    }

    // 24. the rule 'a waiting token sees' (net.syncNewPlayers, run for real), and a merge while hosting (main.js)
    {
        const mkN = o => {
            o = o || {}; const W = mkW({ maps: ['mA', 'mO'], bare: true }), realM = W.net.sensesMoved;
            W.camp.items.mW = M('mW', 5, null, [T('tw', 'u_b', '', 2, 2, { isChar: false, waiting: 1 }), T('orcW', '', 'c_n', 5, 2)]); W.camp.newPlayers = { token: true, sight: false };
            W.net.tidyWaiting = () => { W.ev.push('tidy'); };
            if (o.noHook) delete W.net.sensesMoved; else W.net.sensesMoved = function(id) { W.ev.push('hook:' + String(id) + ':' + arguments.length); return realM.apply(W.net, arguments); };
            W.sendAll(); W.steps = () => W.ev.filter(e => /^tidy|^hook|^send:[^:]+:newPlayers|^timer/.test(e));
            return W;
        };
        const W = mkN(), held0 = [W.sigs()['u_b|mW'], W.sigs()['u_a|mW']];
        W.net.syncNewPlayers(); const first = W.steps(); W.clear(); W.net.syncNewPlayers(); const same = W.steps();
        W.clear(); W.camp.newPlayers = { token: true, sight: true }; W.net.syncNewPlayers(); const flip = W.steps(), flipKeys = W.pendKeys(); W.fire(500); const flipOut = [W.items(W.a1), W.items(W.a2), W.items(W.b1), W.sigs()['u_b|mW']];
        W.clear(); W.camp.newPlayers = { token: true, sight: false }; W.net.syncNewPlayers(); const back = W.pendKeys(); W.fire(500); const backOut = [W.items(W.a1), W.items(W.b1), W.sigs()['u_b|mW']];
        const C = mkN(); C.net.syncNewPlayers(); C.clear(); C.net.role = 'client'; C.camp.newPlayers = { token: true, sight: true }; C.net.syncNewPlayers(); const asClient = C.steps();
        const N = mkN({ noHook: true }); let nThrew = ''; try { N.net.syncNewPlayers(); N.clear(); N.camp.newPlayers = { token: true, sight: true }; N.net.syncNewPlayers(); } catch (e) { nThrew = e.message; } const noHook = N.steps();
        check('senses S0: when the rule for new players changes mid-session (net.syncNewPlayers, run for real) the hook is called for any character, after the rule went out and the waiting tokens were settled — a player whose waiting token now sees is sent that map with the creature in its sight, and again without it when the rule goes back, nobody else anything; the first send of the rule and one that changes nothing call nothing; a player\'s machine never does',
            j(held0) === j(['', '']) && j(first) === j(['send:pA1:newPlayers', 'send:pA2:newPlayers', 'send:pB:newPlayers']) && j(same) === j([])
            && j(flip) === j(['send:pA1:newPlayers', 'send:pA2:newPlayers', 'send:pB:newPlayers', 'tidy', 'hook:null:1', 'timer:500']) && j(flipKeys) === j(['u_b|mW']) && j(flipOut) === j([[], [], ['mW:tw+orcW'], '6'])
            && j(back) === j(['u_b|mW']) && j(backOut) === j([[], ['mW:tw'], '']) && j(asClient) === j([]) && nThrew === '' && j(noHook) === j(['send:pA1:newPlayers', 'send:pA2:newPlayers', 'send:pB:newPlayers', 'tidy']), j([held0, first, same, flip, flipKeys, flipOut, back, backOut, asClient, nThrew, noHook]));
        const mainT = read('main.js'), mergeLine = (mainT.match(/\n\s*var r = mergeAppState\(pendingImport\);\n\s*finishImport\('Merged: '[^\n]*\n\s*(var nM = window\.wpNet; if \(nM && nM\.active && nM\.role === 'host'\) \{[^\n]*?\})[^\n}]*\n\s*\}\);\n/) || [])[1] || '';
        const merge = wpNet => { const calls = [], w = { wpNet: typeof wpNet === 'function' ? wpNet(calls) : wpNet }; let threw = ''; try { new Function('window', mergeLine)(w); } catch (e) { threw = e.message; } return threw || calls.join(); };
        const both = c => ({ active: true, role: 'host', syncChars() { c.push('chars'); }, resendFogged() { c.push('fogged'); } });
        check('senses S0: Import > Merge while hosting is followed, after the merge is saved, by every character and then every fogged map going to the table again (the handler\'s own statement, run for real); on a player\'s machine, with no session or outside multiplayer nothing is called, and a host without either of the two calls the other',
            mergeLine.length > 0 && merge(both) === 'chars,fogged' && merge(c => Object.assign(both(c), { role: 'client' })) === '' && merge(c => Object.assign(both(c), { active: false })) === '' && merge(undefined) === '' && merge(null) === ''
            && merge(c => Object.assign(both(c), { syncChars: undefined })) === 'fogged' && merge(c => Object.assign(both(c), { resendFogged: undefined })) === 'chars' && (mainT.match(/resendFogged/g) || []).length === 2 && (mainT.match(/nM\.syncChars\(\)/g) || []).length === 1, j([mergeLine, merge(both)]));
    }

    // 25. which token reads a character's Sight at all (the real tokenSightCells): a token of the campaign's own character, by its own name
    {
        const sysHid = Sx.cleanSystem({ v: 1, name: 'H', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'gm' }] }, { F: Fx, gmView: true });
        // a token that stands for no character of the campaign's own sees by the campaign's default
        const Wt = mkW({ maps: ['mA'], bare: true }); Wt.camp.chars[5] = { id: 5, name: 'Five', values: { f_sight: 100 } }; Wt.camp.chars = Object.assign(Object.create({ c_heir: { id: 'c_heir', name: 'Heir', values: { f_sight: 100 } } }), Wt.camp.chars);
        const sees = charId => { const t = T('tX', 'u_a', null, 2, 2); if (charId !== undefined) t.charId = charId; let c; try { c = Wt.fog.tokenSightCells(t, Wt.camp.items.mA, Wt.camp); } catch (e) { c = 'threw: ' + e.message; } return c; };
        const ownChar = [sees('c_a'), sees('5')], noOwn = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'c_heir', 'c_zz', '', 5, true, ['c_a'], { toString: () => 'c_a' }, null, undefined].map(sees);
        const charsFn = Object.assign(() => {}, { c_a: { id: 'c_a', name: 'Ana', values: { f_sight: 100 } } });
        const listless = [[undefined], [null], ['c_a'], [5], [true], [charsFn], ['abc', 'length'], ['abc', '0']].map(a => { const t = T('tX', 'u_a', a[1] || 'c_a', 2, 2), camp = Object.assign({}, Wt.camp, { chars: a[0] }); let c; try { c = Wt.fog.tokenSightCells(t, Wt.camp.items.mA, camp); } catch (e) { c = 'threw: ' + e.message; } return c; });
        check('senses S0: which token reads the campaign\'s Sight field (the real tokenSightCells) — a token whose character the campaign holds under its own name sees by that character\'s Sight (60 ft is 12 cells, 100 ft is 20); a name the list only inherits, a name of the prototype, a name that is not text, a character the campaign does not hold or a campaign whose characters are missing or are no object (a text or a function with names of its own) stands for no character: that token sees by the campaign\'s default (30 ft, 6 cells); nothing is thrown',
            j(ownChar) === j([12, 20]) && noOwn.length === 14 && noOwn.every(v => v === 6) && listless.length === 8 && listless.every(v => v === 6), j([ownChar, noOwn, listless]));
        // mW: Bo's waiting token, an orc 3 cells off; mP: Bo's plain token, an orc 8 cells off (the default sight is 30 ft, 6 cells, then 50 ft, 10 cells)
        const mkH = system => {
            const V = mkW({ maps: ['mA', 'mO'], bare: true, system });
            V.camp.items.mW = M('mW', 5, null, [T('tw', 'u_b', '', 2, 2, { isChar: false, waiting: 1 }), T('orcW', '', 'c_n', 5, 2)]); V.camp.items.mP = M('mP', 5, null, [T('tp', 'u_b', '', 2, 2), T('orcP', '', 'c_n', 10, 2)]);
            V.camp.newPlayers = { token: true, sight: false }; V.net.tidyWaiting = () => {}; V.sendAll(); V.net.syncNewPlayers(); V.clear();
            V.change = () => { V.camp.newPlayers = { token: true, sight: true }; V.camp.chars.c_a.values.f_sight = 70; V.camp.chars.c_b.values.f_sight = 70; V.camp.fog.defaults.sight = 50; V.net.syncNewPlayers(); };
            V.maps = c => c.sent.filter(m => m.type === 'item').map(m => m.itemId + ':' + m.item.whiteboard.map(w => w.id).join('+'));
            return V;
        };
        const H = mkH(sysHid), held0 = [H.sigs()['u_b|mW'], H.sigs()['u_b|mP'], H.sigs()['u_a|mA']]; H.change();
        const hNow = { pend: H.pendKeys(), made: H.made(500), inv: H.invs().filter((e, i, l) => l.indexOf(e) === i).sort(), at: H.ats(), now: H.itemsOut() }, hFired = H.fire(500), hOut = { a1: H.maps(H.a1), a2: H.maps(H.a2), b1: H.maps(H.b1), sig: H.sigs(), left: H.pendKeys() };
        H.clear(); H.net.sensesMoved(null); const hAgain = [H.pendKeys(), H.invs(), H.itemsOut()];
        const V0 = mkH(sysS); V0.change(); const vNow = V0.pendKeys(); V0.fire(500); const vOut = { a1: V0.maps(V0.a1), b1: V0.maps(V0.b1) };
        check('senses S0: with a hidden Sight the campaign\'s default is what counts, for every player alike — at one and the same call (the rule \'a waiting token sees\' switched on through the real net.syncNewPlayers, the campaign\'s default sight raised, two characters\' hidden Sight changed) every map whose text moved is queued and sent to its players, a character\'s token and a waiting or plain one alike, each copy made by the default (10 cells: the orcs a real 70 ft would show stay out); the host empties each of those maps\' sets once; with a Sight players see the same call sends every map that moved, made by the real Sight',
            j(held0) === j(['', '6', '6']) && j(hNow) === j({ pend: ['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_b|mP', 'u_b|mW'], made: 5, inv: ['inv:mA', 'inv:mO', 'inv:mP', 'inv:mW'], at: { 'u_a|mA': '10', 'u_a|mO': '', 'u_a|mP': '', 'u_a|mW': '', 'u_b|mA': '10', 'u_b|mO': '10', 'u_b|mP': '10', 'u_b|mW': '10' }, now: [0, 0, 0, 0, 0] }) && hFired === 5
            && j(hOut) === j({ a1: ['mA:tA'], a2: ['mA:tA'], b1: ['mA:tB', 'mO:tB2', 'mW:tw+orcW', 'mP:tp+orcP'], sig: { 'u_a|mA': '10', 'u_a|mO': '', 'u_a|mP': '', 'u_a|mW': '', 'u_b|mA': '10', 'u_b|mO': '10', 'u_b|mP': '10', 'u_b|mW': '10' }, left: [] }) && j(hAgain) === j([[], [], [0, 0, 0, 0, 0]])
            && j(vNow) === j(['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_b|mP', 'u_b|mW']) && j(vOut) === j({ a1: ['mA:tA+orc'], b1: ['mA:tB', 'mO:tB2+orc3', 'mW:tw+orcW', 'mP:tp+orcP'] }), j([held0, hNow, hFired, hOut, hAgain, vNow, vOut]));
        // the same at the fire: the sends were queued while players saw the Sight, which is hidden by the time they fire (the default is theirs then)
        const L = mkH(sysS); L.change(); const lKeys = L.pendKeys(); L.camp.system = sysHid; L.clear(); const lFired = L.fire(500), lOut = { a1: L.maps(L.a1), a2: L.maps(L.a2), b1: L.maps(L.b1), rest: L.net.conns.map(c => c.sent.filter(m => m.type !== 'item').length), left: L.pendKeys(), sig: [L.sigs()['u_a|mA'], L.sigs()['u_b|mA'], L.sigs()['u_b|mO'], L.sigs()['u_b|mW'], L.sigs()['u_b|mP']] };
        // a player with a character's token and a waiting token on one map: both see by the default, and the map goes to them
        const X = mkH(sysHid); X.camp.items.mW.whiteboard.push(T('tB9', 'u_b', 'c_b', 2, 4)); X.sendAll(); X.change(); const xNow = [X.pendKeys()]; X.fire(500); xNow.push(X.maps(X.b1));
        check('senses S0: the same when a send fires — queued while players could see the Sight, which is hidden by the time it fires, every map goes to its players made by the campaign\'s default (never the hidden number) and waits no longer; and a player with both a character\'s token and a waiting token on one map is sent it, made by the default',
            j(lKeys) === j(['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_b|mP', 'u_b|mW']) && lFired === 5 && j(lOut) === j({ a1: ['mA:tA'], a2: ['mA:tA'], b1: ['mA:tB', 'mO:tB2', 'mW:tw+orcW', 'mP:tp+orcP'], rest: [0, 0, 0, 0, 0], left: [], sig: ['10', '10', '10', '10', '10'] })
            && j(xNow) === j([['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_b|mP', 'u_b|mW'], ['mA:tB', 'mO:tB2', 'mW:tw+orcW+tB9', 'mP:tp+orcP']]), j([lKeys, lFired, lOut, xNow]));
    }

    // 26. every copy made for a player records the text the host last knew as well, and empties that map's set when it moved (sensesSeed)
    {
        const W = mkW({ maps: ['mA', 'mO'], bare: true }), mA = W.camp.items.mA, clean = JSON.parse(j(mA)), took = () => { const e = W.ev.filter(x => /^inv|^sig:/.test(x)); W.ev.length = 0; return e; };
        const see = () => { W.fog.canSeePoint('u_a', W.camp, mA, 125, 125); W.fog.canSeePoint('u_a', W.camp, W.camp.items.mO, 125, 125); }, rows = () => [W.sigs(), W.ats(), W.fog.held()];
        see(); W.api.copy(clean, W.camp, mA, 'u_a'); const s1 = [took()].concat(rows());
        see(); W.api.copy(clean, W.camp, mA, 'u_a'); W.api.seed('u_a', W.camp, mA); const s2 = [took()].concat(rows());
        W.camp.chars.c_a.values.f_sight = 70; W.api.copy(clean, W.camp, mA, 'u_a'); const s3 = [took()].concat(rows());
        see(); W.api.copy(clean, W.camp, mA, 'u_b'); const s4 = [took()].concat(rows());
        see(); W.api.copy(clean, W.camp, mA, null); W.api.copy(clean, W.camp, mA, ''); W.api.seed('u_a', W.camp, null); const s5 = [took()].concat(rows());
        mA.fog.mode = 'reveal'; W.api.copy(clean, W.camp, mA, 'u_a'); const s6 = [took()].concat(rows()); mA.fog.mode = 'auto';
        const NI = mkW({ maps: ['mA'], bare: true, win: w => { delete w.wpFog.invalidateSeen; } }); let niThrew = ''; try { NI.api.copy(clean, NI.camp, NI.camp.items.mA, 'u_a'); } catch (e) { niThrew = e.message; }
        check('senses S0: a copy made for a player records the text the host last knew beside what the copy was made by (sensesSeed, run for real through fogCopyFor) — a copy made under a new text empties that map\'s set once, no other map\'s, and records it; a second copy under the same text empties nothing; another player\'s copy keeps its own rows; a copy for nobody or of no map records and empties nothing; a map where a change of sight changes nothing drops both rows and empties nothing; without the means to empty a set the text is recorded all the same',
            j(s1) === j([['sig:u_a|mA=12', 'inv:mA'], { 'u_a|mA': '12' }, { 'u_a|mA': '12' }, ['u_a|mO']]) && j(s2) === j([['sig:u_a|mA=12', 'sig:u_a|mA=12'], { 'u_a|mA': '12' }, { 'u_a|mA': '12' }, ['u_a|mA', 'u_a|mO']])
            && j(s3) === j([['sig:u_a|mA=14', 'inv:mA'], { 'u_a|mA': '14' }, { 'u_a|mA': '14' }, ['u_a|mO']]) && j(s4) === j([['sig:u_b|mA=12', 'inv:mA'], { 'u_a|mA': '14', 'u_b|mA': '12' }, { 'u_a|mA': '14', 'u_b|mA': '12' }, ['u_a|mO']])
            && j(s5) === j([[], { 'u_a|mA': '14', 'u_b|mA': '12' }, { 'u_a|mA': '14', 'u_b|mA': '12' }, ['u_a|mA', 'u_a|mO']]) && j(s6) === j([['sig:u_a|mA=null'], { 'u_b|mA': '12' }, { 'u_b|mA': '12' }, ['u_a|mA', 'u_a|mO']])
            && niThrew === '' && j([NI.sigs(), NI.ats()]) === j([{ 'u_a|mA': '12' }, { 'u_a|mA': '12' }]), j([s1, s2, s3, s4, s5, s6, niThrew]));
        // the hook at one text; the text moved by a route the hook never sees, which made a copy; the hook at the first text again
        const C = mkW(); C.net.sensesMoved(null); C.net.sensesMoved('c_a'); const c0 = [C.invs(), C.made(500), C.pendKeys(), C.ev.filter(e => /^sig:/.test(e)).length > 0];
        const D = mkW({ maps: ['mA', 'mO'] }); D.net.sensesMoved('c_a'); const dA = [D.invs(), D.ats()['u_a|mA']];
        D.camp.fog.fields.sightUnit = 'cells'; D.camp.chars.c_a.values.f_sight = 14; D.clear(); D.net.sendItem('k', 'mA'); const dB = [D.invs(), D.ats()['u_a|mA'], D.sigs()['u_a|mA'], D.ats()['u_b|mA'], D.items(D.a1)];
        D.fog.canSeePoint('u_a', D.camp, D.camp.items.mA, 125, 125); D.fog.canSeePoint('u_b', D.camp, D.camp.items.mO, 125, 125); const dHeld = D.fog.held(); D.clear();
        D.camp.chars.c_a.values.f_sight = 12; D.net.sensesMoved('c_a'); const dBack = [D.invs(), D.fog.held(), D.ats()['u_a|mA'], D.sigs()['u_a|mA'], D.pendKeys()];
        // and once more while that send waits: the text the host last knew (12) is no longer what the copy was made by (14), and a copy is made under 14 again
        D.camp.chars.c_a.values.f_sight = 14; D.clear(); D.net.sendItem('k', 'mA', D.a1); const dC = [D.invs(), D.ats()['u_a|mA'], D.sigs()['u_a|mA']]; D.fog.canSeePoint('u_a', D.camp, D.camp.items.mA, 125, 125); D.clear();
        D.camp.chars.c_a.values.f_sight = 12; D.net.sensesMoved('c_a'); const dD = [D.invs(), D.fog.held(), D.ats()['u_a|mA'], D.sigs()['u_a|mA'], D.pendKeys(), D.made(500)]; D.fire(500); const dOut = [D.items(D.a1), D.items(D.a2), D.sigs()['u_a|mA']];
        check('senses S0: a sight that moved by a way the hook never sees and then moved back through the hook still empties that map\'s set — the hook saw 12 cells; the unit of Sight changed in the fog menu and the map went out again (the copy made for each player records the text it was made by, 14 cells and 60 cells, and empties the set); a set was worked out under it; the character\'s change back to 12 cells empties it and queues the map, and so again when a copy made while that send waits moved the text once more; and after the copies every player holds were made, a first call of the hook that changes nothing compares, empties nothing and queues nothing',
            j(c0) === j([[], 0, [], true]) && j(dA) === j([[], '12']) && j(dB) === j([['inv:mA', 'inv:mA'], '14', '14', '60', ['mA:tA+orc']]) && j(dHeld) === j(['u_a|mA', 'u_b|mO']) && j(dBack) === j([['inv:mA'], ['u_b|mO'], '12', '14', ['u_a|mA']]) && j(dC) === j([['inv:mA'], '14', '14']) && j(dD) === j([['inv:mA'], ['u_b|mO'], '12', '14', ['u_a|mA'], 1]) && j(dOut) === j([['mA:tA'], ['mA:tA'], '12']), j([c0, dA, dB, dHeld, dBack, dC, dD, dOut]));
    }

    // 27. a whole map sent to the table (net.broadcastItemFiltered) empties that map's set first; a map's rows are found by the first bar of their name
    {
        const sendW = (pre, id) => { const W = mkW({ maps: ['mA', 'mO', 'mU'], noFog: pre === 'noFog' }); W.delta = null; if (typeof pre === 'function') pre(W); W.fog.canSeePoint('u_a', W.camp, W.camp.items.mA, 125, 125); W.fog.canSeePoint('u_b', W.camp, W.camp.items.mO, 125, 125); W.clear(); W.shared.length = 0; let threw = ''; try { W.net.broadcastItemFiltered('k', id); } catch (e) { threw = e.message; }
            return { ev: W.ev.filter(e => /^inv|^sig:|^send:/.test(e)), held: W.fog.held(), shared: W.shared.slice(), out: W.itemsOut(), threw }; };
        const bf = sendW(null, 'mA'), bfPlain = sendW(null, 'mU'), bfGone = sendW(null, 'mNone'), bfNoInv = sendW(W => { delete W.win.wpFog.invalidateSeen; }, 'mA'), bfNoFog = sendW('noFog', 'mA');
        check('senses S0: a whole map sent to the table (net.broadcastItemFiltered, run for real) empties that map\'s set first thing, before any copy is made or sent, and no other map\'s — a fogged map and a map without fog alike; a map that is not there empties and sends nothing; without the means to empty a set, or without the fog at all, the map goes out as ever and nothing is thrown',
            j(bf) === j({ ev: ['inv:mA', 'sig:u_a|mA=12', 'send:pA1:item:mA', 'sig:u_a|mA=12', 'send:pA2:item:mA', 'sig:u_b|mA=12', 'send:pB:item:mA'], held: ['u_b|mO'], shared: [], out: [1, 1, 1, 0, 0], threw: '' })
            && j(bfPlain) === j({ ev: ['inv:mU'], held: ['u_a|mA', 'u_b|mO'], shared: ['item:mU'], out: [0, 0, 0, 0, 0], threw: '' }) && j(bfGone) === j({ ev: [], held: ['u_a|mA', 'u_b|mO'], shared: [], out: [0, 0, 0, 0, 0], threw: '' })
            && j(bfNoInv) === j({ ev: ['sig:u_a|mA=12', 'send:pA1:item:mA', 'sig:u_a|mA=12', 'send:pA2:item:mA', 'sig:u_b|mA=12', 'send:pB:item:mA'], held: ['u_a|mA', 'u_b|mO'], shared: [], out: [1, 1, 1, 0, 0], threw: '' })
            && j([bfNoFog.ev, bfNoFog.out, bfNoFog.threw]) === j([['send:pA1:item:mA', 'send:pA2:item:mA', 'send:pB:item:mA'], [1, 1, 1, 0, 0], '']), j([bf, bfPlain, bfGone, bfNoInv, bfNoFog]));

        const F = mkW({ maps: ['mA'], bare: true }), ids = ['b', 'ab', 'a|b', 'm1', 'cave|m1'];
        ids.forEach(id => { F.camp.items[id] = M(id, 5, null, [T('t_' + id, 'u_a', 'c_a', 2, 2), T('o_' + id, '', 'c_n', 15, 2)]); }); F.sendAll();
        F.camp.chars.c_a.values.f_sight = 70; F.net.sensesMoved('c_a');
        const rowsF = () => ({ sig: Object.keys(F.sigs()), at: Object.keys(F.ats()), pend: F.pendKeys() }), clears = () => { const c = F.ev.filter(e => /^clear/.test(e)).sort(); F.ev.length = 0; return c; };
        const allF = ['u_a|ab', 'u_a|a|b', 'u_a|b', 'u_a|cave|m1', 'u_a|m1', 'u_a|mA', 'u_b|ab', 'u_b|a|b', 'u_b|b', 'u_b|cave|m1', 'u_b|m1', 'u_b|mA'], less = (l, gone) => l.filter(k => gone.indexOf(k) < 0), mine = l => l.filter(k => /^u_a\|/.test(k));
        const f0 = rowsF(); F.ev.length = 0;
        F.api.forgetMap('b'); const f1 = [rowsF(), clears()], goneB = ['u_a|b', 'u_b|b'];
        F.api.forgetMap('a|b'); const f2 = [rowsF(), clears()], goneAB = goneB.concat(['u_a|a|b', 'u_b|a|b']);
        F.net.itemGone('k', 'm1'); const f3 = [rowsF(), clears()], goneM1 = goneAB.concat(['u_a|m1', 'u_b|m1']);
        ['a', 'cave', 'cave|', '|m1', 'u_a|mA', 'u_a|cave|m1', 'u_a', 'A', ''].forEach(n => F.api.forgetMap(n)); const f4 = [rowsF(), clears()];
        F.clear(); const fRest = F.fire(500), fLate = F.items(F.a1), fMore = F.fire(500);
        check('senses S0: a map\'s rows are found by what follows the first bar of their name (sensesForgetMap, run for real; a profile id holds no bar, a map\'s id from a file may) — forgetting the map b drops every player\'s rows of b with the send that waits for it and leaves those of the maps a|b and ab; forgetting a|b drops its own; when the map m1 leaves the table the rows of cave|m1 stay with the send that waits for it, which still fires; a part of a name, a whole row\'s name or no name forgets nothing',
            j(f0) === j({ sig: allF, at: allF, pend: mine(allF) }) && j(f1) === j([{ sig: less(allF, goneB), at: less(allF, goneB), pend: mine(less(allF, goneB)) }, ['clear:500']])
            && j(f2) === j([{ sig: less(allF, goneAB), at: less(allF, goneAB), pend: mine(less(allF, goneAB)) }, ['clear:500']])
            && j(f3) === j([{ sig: less(allF, goneM1), at: less(allF, goneM1), pend: ['u_a|ab', 'u_a|cave|m1', 'u_a|mA'] }, ['clear:500']]) && j(f4) === j([f3[0], []])
            && fRest === 3 && j(fLate) === j(['mA:tA+orc', 'ab:t_ab+o_ab', 'cave|m1:t_cave|m1+o_cave|m1']) && fMore === 0, j([f0, f1, f2, f3, f4, fRest, fLate, fMore]));
    }

    // 19. the source pins
    {
        const smCode = smS.replace(/\/\/[^\n]*/g, ''), count = (s, re) => (s.match(re) || []).length, hostBranches = (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []);
        check('senses S0 (source): deleting a character and saving the system call the hook for any character, on a host with a session only; the GM\'s undo while hosting works the vision out afresh after its save as a remote change and before the map goes out',
            /var n = net\(\); if \(n && n\.active && n\.role === 'host'\) n\.syncCharGone\(id, c\.making === 1 \? prev : ''\);[^\n]*\n    if \(n && n\.active && n\.role === 'host' && n\.sensesMoved\) n\.sensesMoved\(null\);/.test(sheetsT)
            && /var n = net\(\); if \(n && n\.syncSystem\) n\.syncSystem\(\);\n    if \(n && n\.active && n\.role === 'host' && n\.sensesMoved\) n\.sensesMoved\(null\);/.test(require('./checkkit').part('sysederr.js')) && (sheetsT.match(/n\.sensesMoved\(null\)/g) || []).length === 2 && (sheetsT.match(/sensesMoved/g) || []).length === 4
            && /if \(hosting\) \{ window\.wpNet\.applyingRemote = true; save\(true\); window\.wpNet\.applyingRemote = false; if \(window\.wpFog\) window\.wpFog\.invalidateVision\(\); if \(backS && backS\.length && typeof window\.wpNet\.strokesBack === 'function'\) window\.wpNet\.strokesBack\(item\.id, backS\); if \(window\.wpNet\.sendItem\) window\.wpNet\.sendItem\(camp\.id, item\.id\);/.test(ioT));
        const dmT = read('datamap.js'), posCode = posS2.replace(/\/\/[^\n]*/g, ''), patCode = patS2.replace(/\/\/[^\n]*/g, '');
        check('senses S0 (source): nothing new comes in from a player — no branch of the host\'s message handler was added or names sight or senses, the hook and its timer read nothing of a message or of a connection\'s word, and what is kept (what a copy was made by, the text last known, the sends that wait) is never saved or sent: it lives in the host\'s memory, named nowhere else (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
            hostBranches.length === 45 /* 1.6.3 (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */ && !hostBranches.some(b => /sens|sight/i.test(b)) && !/msg\.type === '[^']*(sens|sight)/i.test(src) && !/\bmsg\b/.test(smCode) && !/\bconn\b/.test(smCode) && !/type: '(?!combats'|targets')/.test(smCode)
            && count(src, /_sensesSig/g) === count(flS + smS, /_sensesSig/g) && count(src, /_sensesPend/g) === count(smS, /_sensesPend/g) && count(smS, /_sensesPend/g) > 0 && count(flS, /_sensesSig/g) > 0 && !/_senses(Sig|Pend|At)/.test(sheetsT + ioT + fogT + dmT + read('main.js'))
            && count(src, /_sensesAt/g) === count(flS + smS, /_sensesAt/g) && count(flS, /_sensesAt/g) > 0 && count(smS, /_sensesAt/g) > 0
            && !/sensesReads|sensesHidden/.test(src) && count(smCode, /setTimeout\(/g) === 1 && count(smCode, /SENSES_RESEND_MS/g) === 2, j([hostBranches.length, count(src, /_sensesSig/g), count(src, /_sensesPend/g), count(src, /_sensesAt/g), count(smCode, /setTimeout\(/g)]));
        check('senses S0 (source): this fold holds no send after a player\'s own move — net.js names no send for a move that landed, no store and no timer of one, the pos gate and the patch path send no map and call no hook themselves, and the play map\'s own drag code holds no statement of this fold',
            !/sensesLanded|_landPend|landDrop|SENSES_LANDED_MS/.test(src) && !/senses[A-Z]|_senses|SENSES_/.test(posCode + patCode) && !/sendItem\(|broadcastItemFiltered\(|resendFogged\(/.test(posCode + patCode) && posCode.length > 0 && patCode.length > 0
            && dmT.length > 0 && !/senses/i.test(dmT) && !/\bamL\b/.test(dmT) && !/invalidateSeen|sightSigFor/.test(dmT), j([/sensesLanded|_landPend|landDrop|SENSES_LANDED_MS/.test(src), /senses/i.test(dmT), dmT.length]));
    }

    // 21. fold M0 (a security fix): a GM-note card's place never goes out while the GM drags it (sanitizeItem drops the card from every copy a player
    // gets), and the target pointers sent when a connection closes are each player's own on a fogged table (targetsFor), never all of them.
    // Run for real: the close handler's statement (sliced by a pattern, as the S0 close case slices its own), broadcastTargets and targetsFor (the
    // combats slice), broadcastPos (the bpos slice) and net.streamPos sliced whole, over the real fog.js
    {
        const tgLine = (src.match(/\n {12}(if \(p && net\.targets\[p\.id\] && [^\n]*\})[^\n]*\n/) || [])[1] || '';
        const deliver = W2 => (m, ex) => { packCheck(m); W2.bc.push(JSON.parse(j(m))); W2.net.conns.forEach(c => { if (c !== ex && c.open && W2.net.roster[c.peer]) c.send(m); }); };   // as the real broadcast does on a host: admitted, open peers only
        const closeTg = (W2, conn) => { let renders = 0; W2.net.conns = W2.net.conns.filter(c => c !== conn); const p = W2.net.roster[conn.peer]; delete W2.net.roster[conn.peer];
            new Function('net', 'p', 'conn', 'render', 'broadcastTargets', 'broadcast', tgLine)(W2.net, p, conn, () => { renders++; }, W2.api.targets || (() => { W2.bc.push('no broadcastTargets in the combats slice'); }), deliver(W2)); return renders; };
        const ptr = { u_a: { mapId: 'mA', id: 'wolf', x: 1, y: 2 }, u_b: { mapId: 'mA', id: 'tB', x: 3, y: 4 }, u_c: { mapId: 'mA', id: 'tA', x: 5, y: 6 } };
        // u_a points at a wolf 10 cells from her token (in her sight of 12), which Bo's token, 48 rows off, cannot see; Bo points at his own token,
        // which hers cannot see; Cy points at Ana's token, which Ana sees, and his connection closes
        const tgWorld = fog => { const W = mkW({ maps: ['mA'] }), mA = W.camp.items.mA; mA.whiteboard.push(T('wolf', '', 'c_n', 12, 2)); if (!fog) mA.fog.on = false;
            W.net.targets = JSON.parse(j(ptr)); W.c1.open = true; W.clear(); W.bc.length = 0; W.shared.length = 0; return W; };
        const tgOf = c => c.sent.filter(m => m.type === 'targets').map(m => m.targets);
        const F = tgWorld(true), fR = closeTg(F, F.c1), fOut = { a1: tgOf(F.a1), a2: tgOf(F.a2), b1: tgOf(F.b1), w1: F.w1.sent.length, c1: F.c1.sent.length, bc: F.bc.length, left: Object.keys(F.net.targets).sort(), renders: fR };
        const P2 = tgWorld(true); closeTg(P2, P2.a1); check('1.6.2 a connection that closes while another of that player is open takes no pointer with it (a reload\'s new connection may land first)', !!P2.net.targets.u_a, j(P2.net.targets));
        const G = tgWorld(true); delete G.net.targets.u_c; const gR = closeTg(G, G.c1), gOut = [G.net.conns.map(c => c.sent.length).join(''), G.bc.length, gR, Object.keys(G.net.targets).sort()];
        const U = tgWorld(false), uR = closeTg(U, U.c1), uOut = { bc: U.bc, direct: U.net.conns.map(c => c.sent.filter(m => m.type === 'targets').length).join(''), renders: uR };
        check('fold M0: when a connection holding a target pointer closes on a fogged table (the close handler\'s statement, run for real with the real broadcastTargets and targetsFor), its pointer is gone and each admitted player gets the pointers they may see — Bo\'s holds neither Ana\'s pointer at the wolf he cannot see nor its id, Ana\'s holds her own and not Bo\'s at a token she cannot see, and nothing is broadcast to all; a waiting peer gets nothing; a closing peer who held no pointer sends nothing',
            tgLine.length > 0 && typeof F.api.targets === 'function' && typeof F.api.targetsFor === 'function'
            && j(fOut) === j({ a1: [{ u_a: ptr.u_a }], a2: [{ u_a: ptr.u_a }], b1: [{ u_b: ptr.u_b }], w1: 0, c1: 0, bc: 0, left: ['u_a', 'u_b'], renders: 1 })
            && !/wolf/.test(j(F.b1.sent)) && !/"tB"/.test(j(F.a1.sent)) && !/"u_c"/.test(j(F.net.conns.map(c => c.sent)))
            && j(gOut) === j(['0000', 0, 0, ['u_a', 'u_b']]), j([tgLine.length, fOut, gOut]));
        check('fold M0: on a table without fog the same close sends the pointers as before — one broadcast of all of them that remain, the closed player\'s gone, and no per-player copy',
            j(uOut) === j({ bc: [{ type: 'targets', targets: { u_a: ptr.u_a, u_b: ptr.u_b } }], direct: '0000', renders: 1 }), j(uOut));

        // (b) the source: every pointer message outside broadcastTargets is a player's own copy (targetsFor); the combats slice defines it
        const btA = src.indexOf('function broadcastTargets() {'), btB = btA < 0 ? -1 : src.indexOf('\n}\n', btA), btSrc = btB < 0 ? '' : src.slice(btA, btB + 3);
        const cnt = (s, re) => (s.match(re) || []).length, hostB = cnt(src, /msg\.type === '[a-z-]+' && net\.role === 'host'/g);
        check('fold M0 (source): no pointer message goes to all outside broadcastTargets — net.js broadcasts one only there, in its branch for a table without fog, and (hidden pieces) that one too is built by targetsFor; every other pointer message is a player\'s own copy built by targetsFor; the combats slice now defines broadcastTargets, and the host\'s message handler has the same number of branches as before (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
            btSrc.length > 0 && cnt(src, /broadcast\(\{ type: 'targets'/g) === 1 && cnt(btSrc, /broadcast\(\{ type: 'targets'/g) === 1 && cnt(src, /targets: net\.targets/g) === 0 && /broadcast\(\{ type: 'targets', targets: targetsFor\(null\) \}, null\)/.test(btSrc)
            && cnt(src, /type: 'targets'/g) === cnt(src, /type: 'targets', targets: targetsFor\(/g) && cbS.indexOf(btSrc) >= 0 && cbS.indexOf('function targetsFor(') >= 0 && hostB === 45 /* 1.6.3 (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */,
            j([btSrc.length, cnt(src, /broadcast\(\{ type: 'targets'/g), cnt(src, /type: 'targets'/g), cbS.indexOf(btSrc), hostB]));

        // (c) the live position relay and the drag that feeds it
        const P = mkW({ maps: ['mA', 'mO', 'mU'] }), pA = P.camp.items.mA, pU = P.camp.items.mU, orc5 = pU.whiteboard.find(w => w.id === 'orc5');
        const note = { id: 'note', type: 'text', gmNoteFor: 'r1', text: 'Secret', x: 150, y: 100, w: 50, h: 50 }, noteU = Object.assign({}, note, { id: 'noteU' }), noteB = Object.assign({}, note, { id: 'noteB', ownerId: 'u_b' }), wolf = T('wolf', '', 'c_n', 12, 2);
        pA.whiteboard.push(note, noteB, wolf); pU.whiteboard.push(noteU);
        const POSOF = (map, w) => ({ type: 'pos', campId: 'k', itemId: map.id, wbId: w.id, x: w.x, y: w.y, rot: 0, front: 0, final: true });
        const relayP = (map, w) => { P.clear(); P.shared.length = 0; P.bc.length = 0; P.api.pos(POSOF(map, w), null, P.camp, map, w); return [P.net.conns.map(c => c.sent.length).join(''), P.shared.slice()]; };
        const rel = { noteF: relayP(pA, note), noteOwn: relayP(pA, noteB), noteU: relayP(pU, noteU), wolfF: relayP(pA, wolf), tokU: relayP(pU, orc5) };
        P.clear(); P.net.broadcastItemFiltered('k', 'mA'); const copyA = P.items(P.a1);
        check('fold M0: the live position relay (broadcastPos, run for real over the real canSeePoint) sends nothing of a GM-note card — on a fogged map where a player would see its cell, one marked as a player\'s own, and on a map without fog where it would have gone to all — while a creature in sight on a fogged map still reaches its player\'s two connections and a token on a map without fog is still one broadcast; the card is in no copy of the map a player gets',
            j(rel) === j({ noteF: ['00000', []], noteOwn: ['00000', []], noteU: ['00000', []], wolfF: ['11000', []], tokU: ['00000', ['pos:mU']] }) && copyA.length === 1 && !/note/.test(copyA[0]) && /wolf/.test(copyA[0]), j([rel, copyA]));
        const spSrc = whole('net.streamPos = function(');
        const stream = Wn => new Function('net', 'getActiveCampaign', 'broadcastPos', 'sendFailed', 'var _posLast = 0;\n' + spSrc + '\nreturn net.streamPos;')(Wn.net, () => Wn.camp, Wn.api.pos, e => { throw e; });
        const sp = stream(P), drag = (itemId, w) => { P.camp.activeItemId = itemId; P.clear(); P.shared.length = 0; P.bc.length = 0; sp(w, true); return [P.net.conns.map(c => c.sent.length).join(''), P.shared.slice()]; };
        const hostSp = { noteF: drag('mA', note), noteU: drag('mU', noteU), wolfF: drag('mA', wolf) }, wolfMsg = P.a1.sent[0], tokU = drag('mU', orc5), tokUMsg = P.bc[0];
        const hostC = { peer: 'pHost', open: true, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(j(m))); } };
        P.net.role = 'client'; P.net.conns = [hostC]; P.net.foreign = true; P.net.syncedPeer = 'pHost'; P.camp.activeItemId = 'mA'; P.shared.length = 0; P.bc.length = 0; sp(note, true); sp(wolf, true);
        const cli = [hostC.sent.map(m => m.type + ':' + m.itemId + ':' + m.wbId + ':' + m.final), P.shared.length, P.bc.length];
        check('fold M0: a drag on the GM\'s own screen (net.streamPos sliced whole, run on the host with the real broadcastPos) streams nothing of a GM-note card, on a fogged map or one without fog; a creature\'s drag reaches whom it did, the message as before; on a player\'s machine a drag still goes to the host alone, as before',
            spSrc.length > 0 && j(hostSp) === j({ noteF: ['00000', []], noteU: ['00000', []], wolfF: ['11000', []] }) && j(tokU) === j(['00000', ['pos:mU']])
            && j(wolfMsg) === j({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'wolf', x: 600, y: 100, rot: 0, front: 0, final: true }) && !!tokUMsg && tokUMsg.wbId === 'orc5' && tokUMsg.itemId === 'mU'
            && j(cli) === j([['pos:mA:note:true', 'pos:mA:wolf:true'], 0, 0]), j([hostSp, tokU, wolfMsg, tokUMsg, cli]));

        // (d) a hidden token is not on any player's copy (owner, 2026-10-01: nothing at all), so none of its live moves go out — broadcastPos (the bpos
        // slice) run for real over the real canSeePoint on a fresh host: a hidden creature 8 cells from Ana's token on the fogged mA, one on mU
        // (no fog), a visible one on mA, and a GM-note card that is hidden too; each turned and facing somewhere
        const Q = mkW({ maps: ['mA', 'mU'] }), qA = Q.camp.items.mA, qU = Q.camp.items.mU;
        const ghost = T('ghost', '', 'c_n', 10, 2, { hidden: true, front: 90, rot: 15 }), ghostU = T('ghostU', '', 'c_n', 12, 2, { hidden: true, front: 45, rot: 30 }), seen = T('seen', '', 'c_n', 11, 2, { front: 30, rot: 5 });
        const ghostN = { id: 'ghostN', type: 'text', gmNoteFor: 'r1', text: 'Secret', hidden: true, x: 450, y: 100, w: 50, h: 50, rot: 10, front: 60 };
        qA.whiteboard.push(ghost, seen, ghostN); qU.whiteboard.push(ghostU);
        const POSF = (map, w) => ({ type: 'pos', campId: 'k', itemId: map.id, wbId: w.id, x: w.x, y: w.y, rot: w.rot, front: w.front, final: false });
        const relayF = (map, w) => { Q.clear(); Q.bc.length = 0; Q.shared.length = 0; const m = POSF(map, w), before = j(m); Q.api.pos(m, null, Q.camp, map, w);
            return { conns: Q.net.conns.map(c => c.sent.map(x => j(x))), bc: Q.bc.map(x => j(x)), kept: j(m) === before && m.front === w.front }; };
        const want = (map, w, front) => j(Object.assign(POSF(map, w), { front }));
        const rF = { ghost: relayF(qA, ghost), ghostU: relayF(qU, ghostU), seen: relayF(qA, seen), ghostN: relayF(qA, ghostN) };
        check('hidden pieces: the live position relay (broadcastPos, run for real) sends nothing of a hidden token\'s move — on a fogged map to neither of Ana\'s connections, though she would see its cell, and on a map without fog no broadcast; a visible creature\'s move goes out as before with its place, its turn and its facing; a GM-note card, hidden or not, still sends nothing; the caller\'s own message is never changed',
            j(rF.ghost) === j({ conns: [[], [], [], [], []], bc: [], kept: true })
            && j(rF.ghostU) === j({ conns: [[], [], [], [], []], bc: [], kept: true })
            && j(rF.seen) === j({ conns: [[want(qA, seen, 30)], [want(qA, seen, 30)], [], [], []], bc: [], kept: true })
            && j(rF.ghostN) === j({ conns: [[], [], [], [], []], bc: [], kept: true }) && JSON.parse(rF.seen.conns[0][0]).rot === 5 && JSON.parse(rF.seen.conns[0][0]).x === 550, j(rF));
    }
})());
// fold M3: a player's page as the 'fogDiff' branch and applyFogDiff see it, both sliced by their markers and run for real with the real
// cleaners (cleanHostWbItem, cleanHostLight and cleanWaitingItem from net.js, sanitizeRichText as it runs under Node, fogcore's cleanFogLit
// and cleanLight) and the real client broadcast. Each page keeps its own state, net and recorders
function mkFogClient(FCx, o) {
    o = o || {};
    const lnM = k => { const i = src.indexOf(k); if (i < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, src.indexOf('\n', i)); };
    const branch = between('// [netcheck:fogdiff-start]', '// [netcheck:fogdiff-end]', 'fogdiff'), apply = between('// [netcheck:fogdiffapply-start]', '// [netcheck:fogdiffapply-end]', 'fogdiffapply', 'netfog.js');
    const rich = lnM('function escAttr(s) {') + '\n' + fnSrc('function sanitizeRichText(', '\n}\n', 'sanitizeRichText') + '\n}\n';
    const rec = { asked: [], renders: 0, redraws: 0, invalidated: 0, saves: 0, other: [] };
    const hostConn = { peer: 'h', open: true, send(m) { packCheck(m); rec.asked.push(JSON.parse(JSON.stringify(m))); } };
    const net = { role: 'client', active: true, foreign: true, syncedPeer: 'h', stream: false, applyingRemote: false, myId: o.myId || 'u_me', conns: [hostConn], roster: {} };
    const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: o.active === undefined ? 'mA' : o.active, items: o.items || {} } } } };
    if (o.other) state.appState.campaigns.k2 = { id: 'k2', activeItemId: null, items: o.other };
    const win = { wpFogCore: o.core || FCx, wpFog: { invalidateVision() { rec.invalidated++; }, redraw() { rec.redraws++; } }, save() { rec.saves++; } };
    const recv = new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'cleanWaitingItem', 'onLocalSave', 'save',
        '"use strict";\n' + lnM('function own(o, k) {') + '\n' + lnM('function validKey(k) {') + '\n' + lnM('function campOf(id) {') + '\n' + broadcastSrc + '\n' + rich
        + lnM('function cleanHostWbItem(w) {') + '\n' + lnM('function cleanHostLight(w) {') + '\n' + lnM('function cleanHostTokSenses(w) {') + '\n' + fnSrc('function ownCellKeysOf(', '\n}\n', 'ownCellKeysOf') + '\n}\n' + fnSrc('function ownTokIdsOf(', '\n}\n', 'ownTokIdsOf') + '\n}\n' + apply + '\nreturn function(msg, conn) {\n' + branch + '\n};')(
        net, state, win, () => state.appState.campaigns[state.appState.activeCampaignId], () => { rec.renders++; }, H.cleanWaitingItem, () => { rec.saves++; }, () => { rec.saves++; });
    return { net, state, rec, camp: () => state.appState.campaigns.k, map: id => state.appState.campaigns.k.items[id], recv: (msg, peer) => recv(JSON.parse(JSON.stringify(msg)), { peer: peer === undefined ? 'h' : peer }) };
}
pendingChecks.push((async () => {
    const FCx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/'));
    const me = { id: 'me1', type: 'image', isChar: true, ownerId: 'u_me', x: 10, y: 10, w: 50, h: 50 };
    const mkMap = () => ({ id: 'mA', type: 'map', fog: { on: true }, meta: { title: 'Cellar' }, rooms: [{ id: 'r1' }], links: [], fogLit: [{ c: 1, r: 1, t: 1 }], lightsCapped: true,
        whiteboard: [{ id: 'wall', type: 'line', x: 0, y: 0 }, Object.assign({}, me), { id: 'orc', type: 'image', isChar: true, x: 100, y: 100 }, { id: 'bo', type: 'image', isChar: true, ownerId: 'u_bo', x: 200, y: 50 }] });
    const pg = (o) => { o = o || {}; const items = { mA: mkMap(), mB: Object.assign(mkMap(), { id: 'mB' }), dD: { id: 'dD', type: 'doc', blocks: [] } }; return mkFogClient(FCx, Object.assign({ items }, o)); };
    const ids = m => m.whiteboard.map(w => w.id);
    const J = v => JSON.stringify(v);
    const nothing = p => J(p.camp().items.mA) === J(mkMap()) && p.rec.asked.length === 0 && p.rec.renders === 0 && p.rec.redraws === 0;
    const dropOrc = { type: 'fogDiff', campId: 'k', itemId: 'mA', drop: ['orc'] };

    // (1) the gate: the synced host only, never the stream window, a foreign table only, the hosted campaign, a key that is no prototype's
    const gates = [
        (() => { const p = pg(); p.recv(dropOrc, 'x'); return nothing(p); })(),
        (() => { const p = pg(); p.net.stream = true; p.recv(dropOrc); return nothing(p); })(),
        (() => { const p = pg(); p.net.foreign = false; p.recv(dropOrc); return nothing(p); })(),
        (() => { const p = pg({ other: { mA: mkMap() } }); p.recv(Object.assign({}, dropOrc, { campId: 'k2' })); return nothing(p) && J(p.state.appState.campaigns.k2.items.mA) === J(mkMap()); })(),
        (() => { const p = pg(); p.recv(Object.assign({}, dropOrc, { itemId: 'constructor' })); p.recv(Object.assign({}, dropOrc, { campId: 'constructor' })); p.recv(Object.assign({}, dropOrc, { itemId: 'x'.repeat(161) })); p.recv(Object.assign({}, dropOrc, { campId: 5 })); return nothing(p); })(),
        (() => { const p = pg(); p.recv(dropOrc); return J(ids(p.map('mA'))) === J(['wall', 'me1', 'bo']) && p.rec.asked.length === 0 && p.rec.renders === 1 && p.rec.redraws === 1 && p.rec.invalidated === 1; })()
    ];
    check('fold M3: a player takes a map caught up in place (\'fogDiff\', the branch and applyFogDiff run for real) only from the synced host, never in the stream window or off a table, only for the hosted campaign and a map key that is no prototype\'s; from the host it applies',
        gates.every(Boolean), J(gates));

    // (2) a map not held: one ask for the whole map, nothing made; a page is no map; a bad shape asks and applies nothing
    const pZ = pg(); pZ.recv({ type: 'fogDiff', campId: 'k', itemId: 'mZ', add: [{ item: { id: 'orc2', type: 'image', isChar: true }, after: null }] });
    const pDoc = pg(); pDoc.recv({ type: 'fogDiff', campId: 'k', itemId: 'dD', drop: ['x'] });
    const orcAdd = n => ({ item: { id: 'o' + n, type: 'image', isChar: true, x: n, y: 0 }, after: null });
    const shapes = [
        { add: Array.from({ length: 201 }, (_, i) => orcAdd(i)) }, { drop: Array.from({ length: 6001 }, (_, i) => 'd' + i) }, { drop: ['x'.repeat(257)] }, { drop: [''] }, { drop: [5] }, { drop: 'orc' },
        { add: [{ item: { id: 'x'.repeat(257), type: 'image' }, after: null }] }, { add: [{ item: { id: 'a', type: 'image' }, after: 'x'.repeat(257) }] }, { add: [{ item: { id: 'a', type: 'image' } }] }, { add: [{ item: { id: 7 }, after: null }] },
        { add: [{ item: [1], after: null }] }, { add: [null] }, { add: {} }, { lit: 'all' }, { lit: { c: 1 } }, { capped: 'yes' }, { capped: 1 },
        { drop: ['orc'], lit: 'x' }, { add: [orcAdd(1), { item: null, after: null }] }
    ].map(s => { const p = pg(); p.recv(Object.assign({ type: 'fogDiff', campId: 'k', itemId: 'mA' }, s)); return J(p.rec.asked) === J([{ type: 'needItem', campId: 'k', itemId: 'mA' }]) && J(p.camp().items.mA) === J(mkMap()) && p.rec.renders === 0 && p.net.applyingRemote === false; });
    const edge = (() => { const p = pg(); p.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: Array.from({ length: 200 }, (_, i) => orcAdd(i)), drop: Array.from({ length: 6000 }, (_, i) => (i ? 'd' + i : 'orc')) }); return p.rec.asked.length === 0 && p.map('mA').whiteboard.length === 203 && !ids(p.map('mA')).includes('orc'); })();
    check('fold M3: a map the player does not hold gets one ask for the whole map and nothing is made; a page is left alone; a bad shape (201 adds, 6001 drops, an id of 257 characters or none, an add with no after or no item, lit or capped of the wrong kind) asks once and applies nothing; 200 adds and 6000 drops apply',
        J(pZ.rec.asked) === J([{ type: 'needItem', campId: 'k', itemId: 'mZ' }]) && !Object.prototype.hasOwnProperty.call(pZ.camp().items, 'mZ') && pZ.rec.renders === 0
        && pDoc.rec.asked.length === 0 && J(pDoc.map('dD')) === J({ id: 'dD', type: 'doc', blocks: [] }) && shapes.every(Boolean) && edge,
        J([pZ.rec.asked, shapes, edge]));

    // (3) in place: the map object, its whiteboard array, meta, rooms and the player's own token object are the ones they were
    const pI = pg(), mI = pI.map('mA'), wbI = mI.whiteboard, metaI = mI.meta, roomsI = mI.rooms, meI = wbI[1];
    pI.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', drop: ['orc'], add: [{ item: { id: 'orc2', type: 'image', isChar: true, x: 5, y: 5 }, after: 'me1' }], lit: [{ c: 2, r: 2, t: 2 }], capped: false });
    check('fold M3: a catch-up applies in place: the map object, its whiteboard array, meta, rooms and the player\'s own token object are the very ones they were; the drop and the add land where the host put them; nothing is saved and no patch goes back',
        pI.map('mA') === mI && mI.whiteboard === wbI && mI.meta === metaI && mI.rooms === roomsI && wbI[1] === meI && J(ids(mI)) === J(['wall', 'me1', 'orc2', 'bo'])
        && pI.rec.saves === 0 && pI.rec.asked.length === 0 && !/save\(|onLocalSave|wpHist|sendItem|type: 'item'/.test(between('// [netcheck:fogdiffapply-start]', '// [netcheck:fogdiffapply-end]', 'fogdiffapply', 'netfog.js') + between('// [netcheck:fogdiff-start]', '// [netcheck:fogdiff-end]', 'fogdiff')),
        J(ids(mI)));

    // (4) the player's own token: never dropped, never replaced, never added; one ask follows
    const pO = pg(), meO = pO.map('mA').whiteboard[1];
    pO.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', drop: ['me1', 'orc'], add: [{ item: { id: 'me1', type: 'image', isChar: true, ownerId: 'u_bo', x: 999 }, after: null }, { item: { id: 'mine2', type: 'image', isChar: true, ownerId: 'u_me' }, after: null }, { item: { id: 'orc3', type: 'image', isChar: true }, after: 'bo' }] });
    check('fold M3: a drop or an add naming the player\'s own token (by its id or by its owner) is ignored, the rest applied, and one ask for the whole map follows',
        pO.map('mA').whiteboard[1] === meO && meO.x === 10 && meO.ownerId === 'u_me' && J(ids(pO.map('mA'))) === J(['wall', 'me1', 'bo', 'orc3']) && J(pO.rec.asked) === J([{ type: 'needItem', campId: 'k', itemId: 'mA' }]),
        J([ids(pO.map('mA')), pO.rec.asked]));

    // (5) the cleaner on every add: a waiting token rebuilt from its own fields, one whose id it refuses (the rest applied, one ask), a text
    // item's markup made text, a light cleaned; a held id (not theirs) replaced where it stands; the order the host gave
    const pC = pg();
    pC.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: [
        { item: { id: 'wt', type: 'circle', waiting: 1, ownerId: 'u_bo', name: 'Bo', x: 7, y: 8, w: 60, h: 52, src: '/saves/images/x.png', sheet: { a: 1 }, charId: 'c1' }, after: null },
        { item: { id: 'bad id!', type: 'circle', waiting: 1, ownerId: 'u_bo', x: 1, y: 1 }, after: null },
        { item: { id: 'tx', type: 'text', text: '<img src=x onerror=alert(1)>Hi', x: 1, y: 1 }, after: 'wt' },
        { item: { id: 'lamp', type: 'image', isChar: true, x: 3, y: 3, light: { bright: 3, dim: 1, unit: 'furlong', name: 'Lamp', html: '<b>' } }, after: 'tx' },
        { item: { id: 'orc', type: 'image', isChar: true, x: 111, y: 222 }, after: 'nowhere' },
        { item: { id: 'tail', type: 'image', isChar: true }, after: 'nowhere' }
    ] });
    const wC = pC.map('mA').whiteboard, byC = id => wC.find(w => w.id === id);
    check('fold M3: every added item is cleaned as a whole map\'s are (a waiting token rebuilt from its own fields, one whose id the cleaner refuses left out with one ask, a text item\'s markup made text, a light cleaned); a held id not theirs is replaced where it stands; after null goes first, after an unknown id last, two side by side keep their order',
        J(ids(pC.map('mA'))) === J(['wt', 'tx', 'lamp', 'wall', 'me1', 'orc', 'bo', 'tail']) && J(Object.keys(byC('wt')).sort()) === J(['color', 'h', 'id', 'layer', 'name', 'ownerId', 'type', 'w', 'waiting', 'x', 'y'])
        && byC('tx').text.indexOf('<') < 0 && /&lt;img/.test(byC('tx').text) && J(byC('lamp').light) === J(FCx.cleanLight({ bright: 3, dim: 1, unit: 'furlong', name: 'Lamp' })) && byC('lamp').light.dim >= byC('lamp').light.bright
        && byC('orc').x === 111 && byC('orc').y === 222 && J(pC.rec.asked) === J([{ type: 'needItem', campId: 'k', itemId: 'mA' }]),
        J([ids(pC.map('mA')), byC('wt'), byC('tx'), byC('lamp'), pC.rec.asked]));

    // (6) the lit cells and the light cap
    const litIn = [{ c: 2, r: 3, t: 2 }, { c: 'x', r: 1, t: 1 }, { c: 4, r: 4, t: 9 }];
    const pL = pg(), flOld = pL.map('mA').fogLit; pL.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', lit: litIn });
    const pL2 = pg(); pL2.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', lit: [], capped: false });
    const pL3 = pg(); pL3.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', drop: ['orc'] });
    const pL4 = pg(); pL4.map('mA').lightsCapped = undefined; delete pL4.map('mA').lightsCapped; pL4.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', capped: true });
    check('fold M3: lit replaces the lit cells with a new array cleaned by fogcore (a bad cell left out), an empty lit takes the key away, no lit leaves it; capped false takes the cap away, true sets it, no capped leaves it',
        J(pL.map('mA').fogLit) === J(FCx.cleanFogLit(litIn)) && J(pL.map('mA').fogLit) === J([{ c: 2, r: 3, t: 2 }]) && pL.map('mA').lightsCapped === true && pL.map('mA').fogLit !== flOld
        && !('fogLit' in pL2.map('mA')) && !('lightsCapped' in pL2.map('mA')) && J(pL3.map('mA').fogLit) === J([{ c: 1, r: 1, t: 1 }]) && pL3.map('mA').lightsCapped === true && pL4.map('mA').lightsCapped === true,
        J([pL.map('mA').fogLit, pL2.map('mA'), pL3.map('mA').fogLit]));

    // (7) the 6000 a map holds; the screen redrawn only for the map on it; a throw leaves the page taking remote changes no longer; two pages apart
    const pF = pg(); for (let i = 0; pF.map('mA').whiteboard.length < 5999; i++) pF.map('mA').whiteboard.push({ id: 'f' + i, type: 'rect' });
    pF.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: [orcAdd(1), orcAdd(2), orcAdd(3)] });
    const pB = pg(); pB.recv(Object.assign({}, dropOrc, { itemId: 'mB' }));
    const throwCore = Object.assign({}, FCx, { cleanFogLit: () => { throw new Error('boom'); } });
    const pT = pg({ core: throwCore }); let threw = false; try { pT.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', lit: [] }); } catch (e) { threw = true; }
    const p1 = pg(), p2 = pg(); p1.recv(dropOrc);
    check('fold M3: the 6000 items a map holds stay the cap (the rest asked for); only the map on screen is drawn again, the fog redrawn either way; a throw inside leaves the page no longer applying a remote change; two pages keep their own copies',
        pF.map('mA').whiteboard.length === 6000 && J(pF.rec.asked) === J([{ type: 'needItem', campId: 'k', itemId: 'mA' }])
        && pB.rec.renders === 0 && pB.rec.redraws === 1 && J(ids(pB.map('mB'))) === J(['wall', 'me1', 'bo']) && threw && pT.net.applyingRemote === false
        && J(ids(p1.map('mA'))) === J(['wall', 'me1', 'bo']) && J(ids(p2.map('mA'))) === J(['wall', 'me1', 'orc', 'bo']) && p2.rec.asked.length === 0,
        J([pF.map('mA').whiteboard.length, pF.rec.asked, pB.rec, threw, pT.net.applyingRemote]));

    // (8) where it sits: a client branch (the host's branches still 25), and nothing sends the message yet
    check('fold M3: the catch-up is a client branch only (the host\'s branches are 31: none new but video-up of item 21, char-delete of 1.5.4, char-style of item 35, char-ask of 1.5.5, char-damage and trade of 1.5.6, and voice-up of voice chat, 1.5.9); the host builds it in one place only, its catch-up of a copy (fold M7) (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
        (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 45 /* 1.6.3 (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */ && /\} else if \(msg\.type === 'fogDiff' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:fogdiff-start\]/.test(src)
        && (src.match(/msg\.type === 'fogDiff'/g) || []).length === 1 && require('./checkkit').familyCount('net.js', /type: 'fogDiff'/g) === 1 && /function fogCatchUp\([^]*?type: 'fogDiff'/.test(between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove', 'netfog.js')));
})());
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
        && (src.match(/catch \(e\) \{ sendFailed\(e\); return; \}[^\n]*\n\s*if \(typeof fogSeed === 'function' && fogSeed\(conn, itemId, out\)\) fogRoster\(conn, pr\.id, itemId\);/g) || []).length === 2
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
// senses S2b: a player's app keeps a token's own ranges from its host only on a token of its own, cleaned again (cleanHostTokSenses through
// cleanHostWbItem and cleanHostMap, run for real with the real fogcore): a hostile host's on anyone else's token, or with no cleaner, are dropped
pendingChecks.push((async () => {
    const FCx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/'));
    const lnS = k => { const i = src.indexOf(k); if (i < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, src.indexOf('\n', i)); };
    const hmS = src.indexOf('function cleanHostMap(m) {'), hmE = src.indexOf('\n}\n', hmS) + 2;
    const cli = (myId, win) => new Function('window', 'net', 'cleanWaitingItem', 'sanitizeRichText', 'safeColor', '"use strict";\n' + lnS('function cleanHostWbItem(w) {') + '\n' + lnS('function cleanHostLight(w) {') + '\n' + lnS('function cleanHostTokSenses(w) {') + '\n' + lnS('function cleanHostFxb(w) {') + '\n' + fnSrc('function ownCellKeysOf(', '\n}\n', 'ownCellKeysOf') + '\n}\n' + fnSrc('function ownTokIdsOf(', '\n}\n', 'ownTokIdsOf') + '\n}\n' + src.slice(hmS, hmE) + '\nreturn { item: cleanHostWbItem, map: cleanHostMap };')(win || { wpFogCore: FCx }, { myId: myId }, H.cleanWaitingItem, t => t, v => v);
    const J = v => JSON.stringify(v), has = (w, k) => Object.prototype.hasOwnProperty.call(w, k);
    const raw = () => JSON.parse('[{"id":"sn_ether001","n":1e9},{"id":"sn_ether001","n":4},{"id":"sn_Bad","n":3},{"id":"sn_other001","n":-2},{"id":"__proto__","n":1}]');
    const toks = () => [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', senses: raw() }, { id: 'bo', type: 'image', isChar: true, ownerId: 'u_bo', senses: raw() }, { id: 'orc', type: 'image', isChar: true, senses: raw() },
        { id: 'nul', type: 'image', ownerId: '', senses: raw() }, { id: 'junk', type: 'image', ownerId: 'u_me', senses: 'sn_ether001' }, { id: 'none', type: 'image', ownerId: 'u_me', senses: [] }, { id: 'wt', waiting: 1, type: 'circle', ownerId: 'u_me', x: 1, y: 1, w: 5, h: 5, senses: raw() }];
    const C = cli('u_me'), got = toks().map(w => C.item(w)).map(w => (has(w, 'senses') ? w.senses : 'none'));
    const want = [{ id: 'sn_ether001', n: 100000 }, { id: 'sn_other001', n: 0 }];
    const plain = { id: 'p', type: 'image', ownerId: 'u_me', x: 1 }, plainOut = C.item(plain);
    const noCore = [cli('u_me', {}), cli('u_me', { wpFogCore: {} }), cli('', { wpFogCore: FCx }), cli(undefined, { wpFogCore: FCx })].map(K => toks().map(w => K.item(w)).map(w => (has(w, 'senses') ? 1 : 0)));
    const mapS = C.map({ id: 'm1', type: 'map', whiteboard: toks(), rooms: [], links: [] });
    check('senses S2b (client): a player\'s app keeps a token\'s ranges from its host only on a token of its own, cleaned again (the first of a sense kept, clamped, a bad id dropped); another player\'s, an NPC\'s, one owned by nobody, junk, an empty list and a waiting token\'s are dropped; an item without them is the same item with no key added',
        J(got) === J([want, 'none', 'none', 'none', 'none', 'none', 'none']) && plainOut === plain && !has(plain, 'senses'), J(got));
    check('senses S2b (client): with no cleaner on hand, or no profile of its own, a player\'s app keeps no token\'s ranges at all; a whole map from the host is cleaned the same way item by item (cleanHostMap)',
        J(noCore) === J([[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]]) && J(mapS.whiteboard.map(w => (has(w, 'senses') ? w.senses : 'none'))) === J(got), J([noCore, mapS.whiteboard]));
    const blToks = () => [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', blind: true }, { id: 'me2', type: 'image', isChar: true, ownerId: 'u_me', blind: 'yes' }, { id: 'me3', type: 'image', isChar: true, ownerId: 'u_me', blind: 1 }, { id: 'bo', type: 'image', isChar: true, ownerId: 'u_bo', blind: true }, { id: 'orc', type: 'image', isChar: true, blind: true }, { id: 'nul', type: 'image', ownerId: '', blind: true }, { id: 'wt', waiting: 1, type: 'circle', ownerId: 'u_me', x: 1, y: 1, w: 5, h: 5, blind: true }, { id: 'plain', type: 'image', ownerId: 'u_me' }];
    const blGot = [cli('u_me'), cli('u_me', {}), cli('', { wpFogCore: FCx })].map(K => blToks().map(w => K.item(w)).map(w => (has(w, 'blind') ? w.blind : 0)));
    const blMap = C.map({ id: 'm1', type: 'map', whiteboard: blToks(), rooms: [], links: [] }).whiteboard.map(w => (has(w, 'blind') ? w.blind : 0));
    // senses S4a (client): a player's marks from a hostile host — a whole map cleaned (cleanHostMap) and a map caught up in place (applyFogDiff)
    const mkMarks = () => JSON.parse('[{"c":3,"r":3,"k":1},{"c":3,"r":3,"k":2},{"c":0,"r":0,"k":1},{"c":5,"r":5,"k":9},{"c":6,"r":6,"k":2,"id":"orc","name":"Orc"},{"q":2,"r":2,"k":4},"x",null]');
    const mapMk = cli('u_me').map({ id: 'm1', type: 'map', meta: { gridType: 'square' }, fog: { on: true }, whiteboard: [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', x: 10, y: 10, w: 30, h: 30 }, { id: 'bo', type: 'image', isChar: true, ownerId: 'u_bo', x: 310, y: 310, w: 30, h: 30 }], rooms: [], links: [], fogMarks: mkMarks(), fogOff: { me: ['sn_aaaaaaaa', 'bad', 'sn_aaaaaaaa'], bo: ['sn_bbbbbbbb'], ghost: ['sn_cccccccc'] } });
    const mapMkJunk = [cli('u_me').map({ id: 'm2', type: 'map', whiteboard: [], rooms: [], links: [], fogMarks: 'x' }), cli('u_me', {}).map({ id: 'm3', type: 'map', whiteboard: [], rooms: [], links: [], fogMarks: [{ c: 1, r: 1, k: 1 }] })];
    check('senses S4a (client): a player\'s app keeps its marks from its host only as a whole cell and a glyph number 1-4 (no id, no name), the first mark of a cell, none on a cell of its own token; marks that are no list, or no cleaner on hand, give none; S7a: what a null area switches off (fogOff) only for its own tokens, ids by pattern, each once',
        J(mapMk.fogMarks) === J([{ c: 3, r: 3, k: 1 }, { c: 6, r: 6, k: 2 }, { q: 2, r: 2, k: 4 }]) && J(mapMk.fogOff) === J({ me: ['sn_aaaaaaaa'] }) && mapMkJunk.every(m => !('fogMarks' in m) && !('fogOff' in m)), J([mapMk.fogMarks, mapMk.fogOff, mapMkJunk]));
    // item 19b (client): the word s on a mark — its creature stands in a cell this player sees, hidden by a piece — kept only as 1
    const sMarks = () => JSON.parse('[{"c":3,"r":3,"k":1,"s":1},{"c":4,"r":4,"k":2,"s":true},{"c":5,"r":5,"k":3,"s":"<img src=x onerror=alert(1)>"},{"c":6,"r":6,"k":4,"s":2},{"c":7,"r":7,"k":1,"s":{"x":1}},{"c":0,"r":0,"k":1,"s":1}]');
    const sMeTok = () => ({ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', x: 10, y: 10, w: 30, h: 30 }), sWant = [{ c: 3, r: 3, k: 1, s: 1 }, { c: 4, r: 4, k: 2 }, { c: 5, r: 5, k: 3 }, { c: 6, r: 6, k: 4 }, { c: 7, r: 7, k: 1 }];
    const mapMkS = cli('u_me').map({ id: 'm1', type: 'map', meta: { gridType: 'square' }, fog: { on: true }, whiteboard: [sMeTok()], rooms: [], links: [], fogMarks: sMarks() });
    const pgS = mkFogClient(FCx, { myId: 'u_me', items: { mA: { id: 'mA', type: 'map', meta: { gridType: 'square' }, fog: { on: true }, rooms: [], links: [], whiteboard: [sMeTok()] } } });
    pgS.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', marks: sMarks() });
    check('item 19b (client): a player\'s app keeps a mark\'s word that its creature stands in a cell they see (s) only as 1, on a whole map from its host (cleanHostMap) and on a catch-up (applyFogDiff) alike; anything else a host puts there goes, as everything a mark may not hold does, and a mark on its own token\'s cell is still dropped',
        J(mapMkS.fogMarks) === J(sWant) && J(pgS.map('mA').fogMarks) === J(sWant) && pgS.rec.asked.length === 0, J([mapMkS.fogMarks, pgS.map('mA').fogMarks]));
    const pgM = mkFogClient(FCx, { myId: 'u_me', items: { mA: { id: 'mA', type: 'map', meta: { gridType: 'square' }, fog: { on: true }, rooms: [], links: [], whiteboard: [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', x: 10, y: 10, w: 30, h: 30 }] } } });
    pgM.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', marks: mkMarks() }); const pgM1 = JSON.parse(J(pgM.map('mA').fogMarks || null));
    pgM.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', marks: [] }); const pgM2 = 'fogMarks' in pgM.map('mA');
    pgM.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', marks: 'x' }); const pgM3 = pgM.rec.asked.map(m => m.type);
    pgM.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', off: { me: ['sn_hear0001'], bo: ['sn_hear0001'] } }); const pgO1 = JSON.parse(J(pgM.map('mA').fogOff || null));
    pgM.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', off: {} }); const pgO2 = 'fogOff' in pgM.map('mA');
    const askedN = pgM.rec.asked.length; pgM.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', off: [['sn_hear0001']] }); const pgO3 = pgM.rec.asked.length - askedN;
    const smToks = () => [{ id: 's1', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: true }, { id: 's2', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: 'yes' }, { id: 's3', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: 1 }, { id: 's4', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: { on: true } }, { id: 's5', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: false }, { id: 's6', type: 'rect', x: 0, y: 0, w: 50, h: 50 }];
    const smCli = [cli('u_me'), cli('u_me', {}), cli('', { wpFogCore: FCx })].map(K => smToks().map(w => K.item(w)).map(w => (has(w, 'smoke') ? w.smoke : 0)));
    const smMapC = C.map({ id: 'm1', type: 'map', whiteboard: smToks(), rooms: [], links: [] }).whiteboard.map(w => (has(w, 'smoke') ? w.smoke : 0));
    const trToks = () => [3, 2.6, 40, '3', 1, { cost: 3 }, undefined].map((t, i) => Object.assign({ id: 't' + i, type: 'rect', x: 0, y: 0, w: 50, h: 50 }, t === undefined ? {} : { terrain: t }));
    const trCli = [cli('u_me'), cli('', { wpFogCore: FCx }), cli('u_me', {})].map(K => trToks().map(w => K.item(w)).map(w => (has(w, 'terrain') ? w.terrain : 0)));
    const trMapC = C.map({ id: 'm1', type: 'map', whiteboard: trToks(), rooms: [], links: [] }).whiteboard.map(w => (has(w, 'terrain') ? w.terrain : 0));
    check('terrain T1 (client): a player\'s app keeps a piece\'s difficult terrain from its host as its cost, a whole number 2 to 10 (40 reads 10), with or without a profile; a word, 1 or an object is dropped, item by item and in a whole map; with no cleaner on hand it does not come in',
        J(trCli) === J([[3, 3, 10, 0, 0, 0, 0], [3, 3, 10, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]]) && J(trMapC) === J(trCli[0]), J([trCli, trMapC]));
    // 1.6.2 (backlog 57): a kind of terrain a host names is kept only as a short name, and only beside a cost that was kept
    const tkToks = () => [{ terrain: 3, terrainKind: 'mud' }, { terrain: 3, terrainKind: 'deepSnow' }, { terrain: 3, terrainKind: '<b>x' }, { terrainKind: 'mud' }, { terrain: 1, terrainKind: 'mud' }, { terrain: 3, terrainKind: 7 }, { terrain: 3, terrainKind: { a: 1 } }, { terrain: 3, terrainKind: 'a'.repeat(300000) }, { terrain: 3 }].map((t, i) => Object.assign({ id: 'k' + i, type: 'rect', x: 0, y: 0, w: 50, h: 50 }, t));
    const tkCli = [cli('u_me'), cli('', { wpFogCore: FCx }), cli('u_me', {})].map(K => tkToks().map(w => K.item(w)).map(w => (has(w, 'terrainKind') ? w.terrainKind : 0)));
    const tkMapC = C.map({ id: 'm1', type: 'map', whiteboard: tkToks(), rooms: [], links: [] }).whiteboard.map(w => (has(w, 'terrainKind') ? w.terrainKind : 0));
    check('1.6.2 kinds of terrain (client, backlog 57): a player\'s app keeps the kind a host names for a piece only as a short name and only beside a cost it kept, item by item and in a whole map; markup, a number, an object, a name of 300,000 characters and a kind beside no cost or a cost under 2 are dropped; with no cleaner on hand none comes in',
        J(tkCli) === J([['mud', 'deepSnow', 0, 0, 0, 0, 0, 0, 0], ['mud', 'deepSnow', 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]]) && J(tkMapC) === J(tkCli[0]), J([tkCli, tkMapC]));
    const SxC = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).split(String.fromCharCode(92)).join('/'));
    const fxToks = () => [{ id: 'f1', isChar: true, x: 0, y: 0, w: 50, h: 50, fxb: Array.from({ length: 10 }, (_, i) => ({ n: i === 0 ? 'Bless' + String.fromCharCode(0) + 'ed' + 'x'.repeat(80) : 'E' + i, i: i === 1 ? 'icon:bolt' : i === 2 ? 'icon:nosuch' : i === 3 ? '<img src=x onerror=alert(1)>' : '', t: i === 4 ? 'debuff' : i === 5 ? 'evil' : 'buff' })) },
        { id: 'f2', type: 'rect', x: 0, y: 0, w: 50, h: 50, fxb: [{ n: 'Box' }] }, { id: 'f3', isChar: true, x: 0, y: 0, w: 50, h: 50, fxb: 'x' }, { id: 'f4', isChar: true, x: 0, y: 0, w: 50, h: 50, fxb: [{ n: 5 }, null, { n: '   ' }] }];
    const fxCli = cli('u_me', { wpFogCore: FCx, wpSystemCore: SxC }), fxGot = fxToks().map(w => fxCli.item(w)).map(w => (has(w, 'fxb') ? w.fxb : 'none')), fxNo = fxToks().map(w => cli('u_me').item(w)).map(w => has(w, 'fxb'));
    const f0 = fxGot[0];
    check('conditions C1 (client): a player\'s app keeps a character token\'s effects from its host cleaned — at most 8, a name as plain text of 60 at most, an icon only as the app would draw it, a tone of the two words; none on another piece, a list that is no list or one with no name left; with no cleaner on hand they do not come in',
        Array.isArray(f0) && f0.length === 8 && f0[0].n.length === 60 && f0[0].n.indexOf(String.fromCharCode(0)) < 0 && f0[1].i === 'icon:bolt' && f0[2].i === '' && f0[3].i === SxC.cleanIcon('<img src=x onerror=alert(1)>') && f0[4].t === 'debuff' && f0[5].t === '' && f0[6].t === 'buff'
        && fxGot[1] === 'none' && fxGot[2] === 'none' && fxGot[3] === 'none' && J(fxNo) === J([false, false, false, false]), J([fxGot, fxNo]));
    check('senses S7b (client): a player\'s app keeps a smoke tick from its host only as true, with or without a cleaner or a profile; any other value is dropped, item by item and in a whole map',
        J(smCli) === J([[true, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0]]) && J(smMapC) === J(smCli[0]), J([smCli, smMapC]));
    // see-through barriers (1.5.1, client): the flag from a host, only as true
    const brToks = () => [true, 'yes', 1, { on: true }, false, null, undefined].map((v, i) => Object.assign({ id: 'b' + i, type: 'rect', x: 0, y: 0, w: 50, h: 50, sightType: 'door' }, v === undefined ? {} : { barrier: v })).concat([{ id: 'wt', waiting: 1, type: 'circle', ownerId: 'u_me', x: 1, y: 1, w: 5, h: 5, barrier: true }]);
    const brCli = [cli('u_me'), cli('u_me', {}), cli('', { wpFogCore: FCx })].map(K => brToks().map(w => K.item(w)).map(w => (has(w, 'barrier') ? w.barrier : 0)));
    const brMapC = C.map({ id: 'm1', type: 'map', whiteboard: brToks(), rooms: [], links: [] }).whiteboard.map(w => (has(w, 'barrier') ? w.barrier : 0));
    check('barriers (client): a player\'s app keeps a piece\'s barrier flag from its host only as true, with or without a cleaner or a profile; a word, a number, an object, false or nothing is dropped (the key gone), item by item and in a whole map; a waiting token is rebuilt without it',
        J(brCli) === J([[true, 0, 0, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0, 0, 0]]) && J(brMapC) === J(brCli[0]), J([brCli, brMapC]));
    // a portal's own lock (the owner, 2026-10-03; client): the flag from a host, only as true
    const plToks = () => [true, 'yes', 1, { on: true }, false, null, undefined].map((v, i) => Object.assign({ id: 'q' + i, type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'm2' }, v === undefined ? {} : { portalLock: v })).concat([{ id: 'wt', waiting: 1, type: 'circle', ownerId: 'u_me', x: 1, y: 1, w: 5, h: 5, portalLock: true }]);
    const plCli = [cli('u_me'), cli('u_me', {}), cli('', { wpFogCore: FCx })].map(K => plToks().map(w => K.item(w)).map(w => (has(w, 'portalLock') ? w.portalLock : 0)));
    const plMapC = C.map({ id: 'm1', type: 'map', whiteboard: plToks(), rooms: [], links: [] }).whiteboard.map(w => (has(w, 'portalLock') ? w.portalLock : 0)), plKept = C.item({ id: 'q', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'm2', portalLock: 'yes' }), plNode = [C.item({ id: 'qn', type: 'rect', x: 0, y: 0, w: 50, h: 50, nodeId: 'r1', portalLock: 'yes' }), C.item({ id: 'qm', type: 'rect', x: 0, y: 0, w: 50, h: 50, nodeId: 'r1', portalLock: 1 }), C.item({ id: 'qt', type: 'rect', x: 0, y: 0, w: 50, h: 50, nodeId: 'r1', portalLock: true })];
    check('portal lock (client): a player\'s app keeps a portal\'s lock from its host only as true, with or without a cleaner or a profile; a hostile host\'s word ("yes"), a number, an object, false or nothing is dropped (the key gone, the portal itself kept), item by item and in a whole map; a waiting token is rebuilt without it',
        J(plCli) === J([[true, 0, 0, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0, 0, 0]]) && J(plMapC) === J(plCli[0]) && !!plKept && plKept.targetMapId === 'm2' && !has(plKept, 'portalLock') && plNode.every(w => !!w) && !has(plNode[0], 'portalLock') && !has(plNode[1], 'portalLock') && plNode[2].portalLock === true   // a portal through the node it is linked to (no Portal to Map of its own): the same rule
        && src.includes('if (w.portalLock !== undefined && w.portalLock !== true) delete w.portalLock; if (w.terrain !== undefined) {'), J([plCli, plMapC]));
    // a barrier's Stops blasts tick (the owner, 2026-10-03; client): the tick from a host, only as true
    const bsCli = [true, 'yes', 1, { on: true }, false, null, undefined].map(v => C.item(Object.assign({ id: 'qb', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: true }, v === undefined ? {} : { blastStop: v }))).map(w => (!w ? 'gone' : has(w, 'blastStop') ? w.blastStop : 0));
    check('a barrier\'s Stops blasts tick (client): a player\'s app keeps it from its host only as true; a hostile host\'s word, a number, an object, false or nothing is dropped (the key gone, the barrier kept)',
        J(bsCli) === J([true, 0, 0, 0, 0, 0, 0]) && src.includes('if (w.blastStop !== undefined && w.blastStop !== true) delete w.blastStop; if (w.barrier !== undefined && w.barrier !== true) delete w.barrier;'), J(bsCli));
    // a drawing to show (1.6.2; client): the mark from a host, only as the cleaner keeps it
    const shLine = o => Object.assign({ id: 'qs', type: 'path', x: 0, y: 0, w: 10, h: 10, pts: [[0, 0], [1, 1]] }, o), shCli = [[true, 'fade'], [true, 'scene'], [true, 'always'], ['yes', 'fade'], [1], [false, 'fade'], [{ a: 1 }], [null, 'scene']].map(p => C.item(shLine(Object.assign({ toShow: p[0] }, p.length > 1 ? { showFor: p[1] } : {})))).map(w => (!w ? 'gone' : [has(w, 'toShow') ? w.toShow : 0, has(w, 'showFor') ? w.showFor : 0]));
    const shWall = C.item(shLine({ toShow: true, showFor: 'fade', blocksSight: true })), shBox = C.item({ id: 'qb', type: 'rect', x: 0, y: 0, w: 10, h: 10, toShow: true }), shMap = C.map({ id: 'm1', type: 'map', whiteboard: [shLine({ toShow: true, showFor: 'scene' }), shLine({ id: 'q2', toShow: 'yes' })], rooms: [], links: [] }).whiteboard.map(w => (has(w, 'toShow') ? w.toShow : 0));
    check('a drawing to show (client): a player\'s app keeps the mark from its host only as true on a pen drawing and how long it stays only as one of its words; a hostile host\'s word, a number, an object, false or null is dropped with its stay (the key gone, the drawing kept), item by item and in a whole map; a wall and a shape keep none',
        J(shCli) === J([[true, 'fade'], [true, 'scene'], [true, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]) && !has(shWall, 'toShow') && !has(shWall, 'showFor') && !has(shBox, 'toShow') && J(shMap) === J([true, 0]), J([shCli, shMap]));
    // a piece's fog mark (1.5.4; client): the mark from a host, only as one of its two words
    const fhCli = ['hide', 'show', 'Hide', 'yes', 1, true, { a: 1 }, null, undefined].map(v => C.item(Object.assign({ id: 'qf', type: 'image', x: 0, y: 0, w: 50, h: 50 }, v === undefined ? {} : { fogHand: v }))).map(w => (!w ? 'gone' : has(w, 'fogHand') ? w.fogHand : 0));
    const pgCli = ['plan_x', 'doc_hb', '', 1, true, { a: 1 }, null, ['plan_x']].map(v => C.item({ id: 'qp', type: 'image', x: 0, y: 0, w: 50, h: 50, page: v })).map(w => (!w ? 'gone' : has(w, 'page') ? 'kept' : 0));
    check('backlog 125 a pin (client): a player\'s app keeps no page a host names for a piece, whatever it holds (an id, an empty word, a number, true, an object, null, a list): the key is dropped and the piece is kept',
        J(pgCli) === J([0, 0, 0, 0, 0, 0, 0, 0]), J(pgCli));
    check('a piece\'s fog mark (client): a player\'s app keeps it from its host only as one of its two words; a hostile host\'s other word, a number, true, an object, null or nothing is dropped (the key gone, the piece kept)',
        J(fhCli) === J(['hide', 'show', 0, 0, 0, 0, 0, 0, 0]) && src.includes("if (w.fogHand !== undefined && w.fogHand !== 'hide' && w.fogHand !== 'show') delete w.fogHand; if (w.blastStop !== undefined && w.blastStop !== true) delete w.blastStop;"), J(fhCli));
    check('senses S7a (client): a map caught up in place takes its word of what fails in a null area for its own tokens only (cleaned again), an empty word takes it away, a word that is no plain object is refused whole (the whole map asked for)',
        J(pgO1) === J({ me: ['sn_hear0001'] }) && pgO2 === false && pgO3 === 1, J([pgO1, pgO2, pgO3]));
    check('senses S4a (client): a map caught up in place takes its marks the same way (cleaned, none on its own token), an empty list takes them away, marks that are no list are refused whole (the whole map asked for)',
        J(pgM1) === J([{ c: 3, r: 3, k: 1 }, { c: 6, r: 6, k: 2 }, { q: 2, r: 2, k: 4 }]) && pgM2 === false && J(pgM3) === J(['needItem']), J([pgM1, pgM2, pgM3]));
    check('senses S3 (client): a player\'s app keeps the GM\'s Blind tick from its host only on a token of its own and only as true (no cleaner needed); another player\'s, an NPC\'s, one owned by nobody, a waiting token\'s or any other value is dropped, item by item and in a whole map; with no profile of its own, none',
        J(blGot) === J([[true, 0, 0, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]) && J(blMap) === J(blGot[0]), J([blGot, blMap]));
    const pg = mkFogClient(FCx, { myId: 'u_me', items: { mA: { id: 'mA', type: 'map', fog: { on: true }, meta: {}, rooms: [], links: [], whiteboard: [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', x: 10, y: 10, w: 50, h: 50 }] } } });
    pg.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: [{ item: { id: 'orc', type: 'image', isChar: true, x: 100, y: 100, senses: raw(), blind: true }, after: 'me' }, { item: { id: 'me2', type: 'image', isChar: true, ownerId: 'u_me', x: 50, y: 50, senses: raw() }, after: 'orc' }] });
    const pgW = pg.map('mA').whiteboard;
    check('senses S2b (client): a map caught up in place (the real fogDiff branch and apply) cleans what it adds the same way — a creature\'s ranges from a hostile host dropped; a token of the player\'s own is never taken from a catch-up (the whole map asked for instead, where its ranges are cleaned as above)',
        J(pgW.map(w => w.id)) === J(['me', 'orc']) && !has(pgW[1], 'senses') && !has(pgW[1], 'blind') && J(pg.rec.asked.map(m => m.type)) === J(['needItem']), J([pgW, pg.rec.asked]));
})());
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
T.finish();
