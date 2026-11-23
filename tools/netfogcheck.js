/* netfogcheck.js: a fogged map on the wire, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, area 9,
   2026-11-19). The code lives mostly in system/app/scripts/netfog.js, a part of net.js; the slices of its markers this suite reads (foglit,
   mapheld, fogmove with memsend, acks and hidpend, which stand inside it, patch and fogdiffapply) and every definition only it holds are
   read from the part by its own name, and the fights' orders from netfight.js by its own name, while the slices of other areas (the pos
   gate, the sends, the senses' resend) still read the joined net.js through srcjoin. The rest of netfog.js's slices went with their checks
   at step 6 of "Finishing the test split": landing and curstage to netpiececheck.js, actlog and drawshow to netdragcheck.js (actlog also to
   netpossesscheck.js and netmatchcheck.js), memsend and strokeacts to netpossesscheck.js, snapitems to netjoincheck.js, and broadcast is
   read once by tools/checkkit.js netSlices (broadcastSrc) for every suite that needs it.
   What it covers, each block as it stood in netcheck.js: a player's copy of a fogged map following what their tokens see (sensesMoved, the
   live position relay judged afresh, what each copy was made by), a player's page as the fogDiff branch and applyFogDiff see it (fold M3,
   with mkFogClient, a player's page of plain objects, which tools/checkkit.js netFogClient holds), and a token's own ranges for its senses
   kept on a player's app (senses S2b). With step 6 of "Finishing the test split" (2026-11-19) fold M4 (an open drag judged where it
   began, the catch-up when a move lands, and every later fold that runs in its world) went to netdragcheck.js, and per-player map
   possession with the take-back and the patch gate with the delta between two copies to netpossesscheck.js.
   Run: node tools/netfogcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file (netfog.js, netfight.js) reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc } = kit.netSlices('netfogcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, ownKeySrc, siSrc, fightIn } = kit.netHarness('netfogcheck');
// a player's page as the fogDiff branch and applyFogDiff see it (fold M3; tools/checkkit.js netFogClient, which netdragcheck shares)
const { mkFogClient } = kit.netFogClient('netfogcheck');
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
        W.clear(); cb.round = 2; W.api.turn('mA', cb); W.net.fxOutFlush(); /* 1.6.3 (the combat review, finding 12): what ran out is said once its step has run */ const gone = { rows: W.camp.chars.c_a.values.f_fx.length, a1: W.types(W.a1), keys: W.pendKeys(), chat: W.chat.map(m => m.text) };   // fold 3 (moved on purpose): the next round's turn, as a turn's timed effects count once a round
        W.fire(500); const ended = { a1: W.types(W.a1), a2: W.types(W.a2), b1: W.types(W.b1), items: W.items(W.a1), sig: W.sigs()['u_a|mA'] };
        check('senses S0: an effect\'s timer that only counts down (the real turn tick) sends the character and no map, though the hook is reached; when an effect that lowered Sight runs out, its player is sent that map once (60 ft again: 12 cells), and nobody else is',
            dazed === '4' && j(tick) === j({ left: [6, 6], a1: ['charDelta'], made: 0, keys: [], cmp: ['sig:u_a|mA=4', 'sig:u_b|mA=12'] }) && gone.rows === 0 && j(gone.keys) === j(['u_a|mA']) && j(gone.chat) === j(['Ran out: Dazzled on Ana, Bless on Ana.']) /* 1.6.3 (the combat review, finding 12), moved on purpose: one line a step for the GM, and one for the player */ && gone.a1.filter(t => t === 'chat').length === 1
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
        {   // 1.6.3 (the improvement week's review of sheets and rolls, finding 5): a player's sight is read from their own tokens alone, so once each
            // player's eyes on a map were judged, a change of one character judges only the players whose tokens on that map are of it, now or when last
            // judged (net.js sensesWho and _sensesBy, run for real over the real fog.js): Bo is passed over for Ana's change, both are judged when Ana's
            // token is handed to Bo, and a character another sheet is tied to (a link naming it) still judges every player
            const Y = mkW({ maps: ['mA'] }); Y.gm('c_a', 70); Y.fire(500); Y.ev.length = 0; Y.gm('c_a', 80); const second = Y.ev.filter(e => /^sig:/.test(e)).map(e => e.slice(4).split('=')[0]);
            Y.fire(500); Y.ev.length = 0; Y.camp.items.mA.whiteboard.find(w => w.id === 'tA').ownerId = 'u_b'; Y.net.sensesMoved('c_a'); const handed = Y.ev.filter(e => /^sig:/.test(e)).map(e => e.slice(4).split('=')[0]).sort();
            Y.fire(500); Y.ev.length = 0; Y.camp.system = Object.assign({}, Y.camp.system, { links: [{ id: 'k_m', key: 'Mount', kind: 'mount' }] }); Y.camp.chars.c_c.links = { k_m: 'c_a' }; Y.net.sensesMoved('c_a'); const tied = Y.ev.filter(e => /^sig:/.test(e)).map(e => e.slice(4).split('=')[0]).sort();
            Y.ev.length = 0; Y.net.sensesMoved(null); const every = Y.ev.filter(e => /^sig:/.test(e)).map(e => e.slice(4).split('=')[0]).sort();
            check('1.6.3 (finding 5) once each player\'s eyes were judged, a change of one character judges only the players whose tokens are of it, now or when last judged: Bo is passed over for Ana\'s change; handing her token to Bo judges both; a character a link names, and a change of every character, judge every player',
                j(second) === j(['u_a|mA']) && j(handed) === j(['u_a|mA', 'u_b|mA']) && j(tied) === j(['u_a|mA', 'u_b|mA']) && j(every) === j(['u_a|mA', 'u_b|mA']), j([second, handed, tied, every]));
        }
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
            j(a1) === j(['item:mA', 'combats', 'targets']) && j(W.types(W.a2)) === j(a1) && quietOthers(W) && !!cm && j(fightIn(cm.combats, 'mA').rows) === j([{ id: 'r_a', name: 'Ana', tokId: 'tA', src: null }, { id: 'r_o', name: 'Orc', tokId: 'orc', src: null }, { id: 'h2', name: 'Hidden', tokId: null, src: null, hid: 1 }]) /* 1.6.3 (the combat review, finding 24): a redacted row carries its mark, moved on purpose */
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
            hostBranches.length === 48 /* 1.6.4 (Drop here, a deliberate change of this pin): drop, the 48th; 1.6.4 (a player's name changed at the table, a deliberate change of this pin): profile-set, the 47th; 1.6.3 (the multiplayer review, finding 9): handout-want, the 46th; (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */ && !hostBranches.some(b => /sens|sight/i.test(b)) && !/msg\.type === '[^']*(sens|sight)/i.test(src) && !/\bmsg\b/.test(smCode) && !/\bconn\b/.test(smCode) && !/type: '(?!combats'|targets')/.test(smCode)
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
            && j(fOut) === j({ a1: [{ u_a: ptr.u_a }], a2: [{ u_a: ptr.u_a }], b1: [{ u_b: ptr.u_b }], w1: 0, c1: 0, bc: 0, left: ['u_a', 'u_b'], renders: 0 })   // the review of multiplayer speed, a deliberate change of this pin: the pointer line draws nothing now; closeRun draws once, a moment later (netjoincheck holds that)
            && !/wolf/.test(j(F.b1.sent)) && !/"tB"/.test(j(F.a1.sent)) && !/"u_c"/.test(j(F.net.conns.map(c => c.sent)))
            && j(gOut) === j(['0000', 0, 0, ['u_a', 'u_b']]), j([tgLine.length, fOut, gOut]));
        check('fold M0: on a table without fog the same close sends the pointers as before — one broadcast of all of them that remain, the closed player\'s gone, and no per-player copy',
            j(uOut) === j({ bc: [{ type: 'targets', targets: { u_a: ptr.u_a, u_b: ptr.u_b } }], direct: '0000', renders: 0 }), j(uOut));   // the review of multiplayer speed: the same deliberate change, no draw in the close event

        // (b) the source: every pointer message outside broadcastTargets is a player's own copy (targetsFor); the combats slice defines it
        const btA = src.indexOf('function broadcastTargets() {'), btB = btA < 0 ? -1 : src.indexOf('\n}\n', btA), btSrc = btB < 0 ? '' : src.slice(btA, btB + 3);
        const cnt = (s, re) => (s.match(re) || []).length, hostB = cnt(src, /msg\.type === '[a-z-]+' && net\.role === 'host'/g);
        check('fold M0 (source): no pointer message goes to all outside broadcastTargets — net.js broadcasts one only there, in its branch for a table without fog, and (hidden pieces) that one too is built by targetsFor; every other pointer message is a player\'s own copy built by targetsFor; the combats slice now defines broadcastTargets, and the host\'s message handler has the same number of branches as before (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
            btSrc.length > 0 && cnt(src, /broadcast\(\{ type: 'targets'/g) === 1 && cnt(btSrc, /broadcast\(\{ type: 'targets'/g) === 1 && cnt(src, /targets: net\.targets/g) === 0 && /broadcast\(\{ type: 'targets', targets: targetsFor\(null\) \}, null\)/.test(btSrc)
            && cnt(src, /type: 'targets'/g) === cnt(src, /type: 'targets', targets: targetsFor\(/g) && cbS.indexOf(btSrc) >= 0 && cbS.indexOf('function targetsFor(') >= 0 && hostB === 48 /* 1.6.4 (Drop here, a deliberate change of this pin): drop, the 48th; 1.6.4 (a player's name changed at the table, a deliberate change of this pin): profile-set, the 47th; 1.6.3 (the multiplayer review, finding 9): handout-want, the 46th; (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */,
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
        (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 48 /* 1.6.4 (Drop here, a deliberate change of this pin): drop, the 48th; 1.6.4 (a player's name changed at the table, a deliberate change of this pin): profile-set, the 47th; 1.6.3 (the multiplayer review, finding 9): handout-want, the 46th; (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */ && /\} else if \(msg\.type === 'fogDiff' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:fogdiff-start\]/.test(src)
        && (src.match(/msg\.type === 'fogDiff'/g) || []).length === 1 && require('./checkkit').familyCount('net.js', /type: 'fogDiff'/g) === 1 && /function fogCatchUp\([^]*?type: 'fogDiff'/.test(between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove', 'netfog.js')));
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

// 1.6.3 (the release click test): a player who crosses a portal onto a map where their character's token already stands away from the landing
// opened on the landing, with their token off the screen and nothing pointing at it. applyStage (with landOwnTok, read from netfog.js by its
// own name and run for real) opens the view on the player's own token nearest the landing, and on the landing only where they have none there
{
    const nfS = kit.part('netfog.js').replace(/\r\n/g, '\n'), ltS = between('// [netcheck:landowntok-start]', '// [netcheck:landowntok-end]', 'landowntok', 'netfog.js');
    const asA = nfS.indexOf('function applyStage(stage) {'), asZ = nfS.indexOf('\n}\n', asA), asS = asA < 0 || asZ < 0 ? 'throw new Error("applyStage");' : nfS.slice(asA, asZ + 3);
    const land = (wb, role) => {
        const map = { type: 'map', meta: {}, rooms: [{ id: 'rL' }], whiteboard: wb }, camp = { items: { mD: map } }, st = { appState: { activeCampaignId: 'c0', campaigns: { c1: camp } } }, netS = { role: role || 'client', myId: 'u_me' };
        new Function('campOf', 'validKey', 'state', 'net', 'landingPoint', 'camLand', 'updateCampaignSelect', 'updateSidebarNav', 'render', 'window', ltS + '\n' + asS + '\napplyStage({ campId: "c1", itemId: "mD", landRoomId: "rL" });')(
            id => (id === 'c1' ? camp : null), () => true, st, netS, () => ({ wbX: 1030, wbY: 1026 }), null, () => {}, () => {}, () => {}, {});
        return [map.meta.lastWbX, map.meta.lastWbY]; };
    const tok = (id, x, more) => Object.assign({ id, type: 'image', isChar: true, ownerId: 'u_me', x, y: 1000, w: 60, h: 52 }, more || {});
    const far = land([tok('t1', 2080)]), two = land([tok('t1', 2080), tok('t2', 1000)]), none = land([tok('o1', 1000, { ownerId: 'u_x' })]), hid = land([tok('t1', 2080, { hidden: true })]), gmS = land([tok('t1', 2080)], 'host');
    check('1.6.3 (the release click test): a player arriving through a portal opens on their own character token on that map, the one nearest the landing, wherever the host left it; on the landing where they have none (another player\'s token, a hidden one); the GM\'s app as before',
        j(far) === j([2110, 1026]) && j(two) === j([1030, 1026]) && j(none) === j([1030, 1026]) && j(hid) === j([1030, 1026]) && j(gmS) === j([1030, 1026]), j([far, two, none, hid, gmS]));
}

T.finish();
