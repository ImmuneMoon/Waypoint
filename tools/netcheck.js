/* Offline check of the host-side wire gates in system/app/scripts/net.js — the code a hostile peer talks to.
   The REAL code is sliced out of net.js by its [netcheck:…] markers (never copied), so a rewrite that loosens a
   gate fails here. Covers: the admission gate (an unadmitted or prototype-keyed peer is closed, heartbeats keep a
   waiting peer alive only for a while), the hello handshake (identity validation, the table-key proof + challenge,
   bans before version/password, the password lockout, the hello storm), the join queue (one place per connection,
   bounded), broadcast() (admitted peers only on the host), and chat (the sender is the roster's, never the claim).
   Run: node tools/netcheck.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');

function between(a, b, label) {
    const i = src.indexOf(a), j = src.indexOf(b);
    if (i < 0 || j < 0 || j <= i) throw new Error('netcheck: marker ' + label + ' not found in net.js');
    if (src.indexOf(a, i + 1) >= 0 || src.indexOf(b, j + 1) >= 0) throw new Error('netcheck: marker ' + label + ' is not unique');
    return src.slice(i + a.length, j);
}
const helpersSrc = between('// [netcheck:helpers-start]', '// [netcheck:helpers-end]', 'helpers');
const gateSrc = between('// [netcheck:gate-start]', '// [netcheck:gate-end]', 'gate') + '\n}';   // the slice ends inside the client auth branch: close it
const queueSrc = between('// [netcheck:queue-start]', '// [netcheck:queue-end]', 'queue');
const broadcastSrc = between('// [netcheck:broadcast-start]', '// [netcheck:broadcast-end]', 'broadcast');
const chatSrc = between('// [netcheck:chat-start]', '// [netcheck:chat-end]', 'chat');
const rosterSrc = between('// [netcheck:roster-start]', '// [netcheck:roster-end]', 'roster');
const rosterCleanSrc = between('// [netcheck:rosterclean-start]', '// [netcheck:rosterclean-end]', 'rosterclean');
const awaySrc = between('// [netcheck:away-start]', '// [netcheck:away-end]', 'away');

let pass = 0, fail = 0;
// PeerJS 1.5.2's default serializer is BinaryPack (loaded from a CDN, not vendored): its pack() reads value.constructor for every
// object and throws on one it does not know — an object with no prototype, or an own "constructor" / "hasOwnProperty" — and the real
// broadcast() swallows the throw. Every harness send runs this emulation, so a payload production could not deliver never passes here.
function packCheck(v) {
    if (typeof v === 'number') { if (Math.floor(v) === v && (v > 18446744073709551615 || v < -9223372036854775808)) throw new Error('Invalid integer'); return; }   // an "integer" past 64 bits (1e300, Infinity)
    if (typeof v === 'function') throw new Error('Type "function" not yet supported');
    if (v === null || typeof v !== 'object') return;
    if ('BYTES_PER_ELEMENT' in v && !ArrayBuffer.isView(v)) throw new Error('an object with BYTES_PER_ELEMENT is packed as an (empty) typed array');
    const C = v.constructor;
    if (C === undefined) throw new TypeError("Cannot read properties of undefined (reading 'toString')");
    if (Array.isArray(v)) { v.forEach(packCheck); return; }
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || C === Date) return;
    if (C !== Object) throw new Error('Type "' + String(C) + '" not yet supported');
    if (typeof v.hasOwnProperty !== 'function') throw new TypeError('obj.hasOwnProperty is not a function');
    for (const k in v) if (v.hasOwnProperty(k)) packCheck(v[k]);
}
const pendingChecks = [];   // checks that finish asynchronously, awaited before the summary
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } }

/* ---- the sliced code, built once ---- */
const storage = (() => { let m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, clear: () => { m = {}; } }; })();
const H = new Function('localStorage', 'crypto', helpersSrc + '\nreturn { own, validProfileId, newKey, tableKeys, tableKeyFor, rememberTableKey, safeAvatar, cleanRosterName, cleanWaitingItem, cleanFace, faceView, FACE_PICS, charFacePlan };')(storage, globalThis.crypto);
const RC = new Function('localStorage', 'crypto', helpersSrc + '\n' + rosterCleanSrc + '\nreturn { cleanHostRoster, cleanHostAway, validKey };')(storage, globalThis.crypto);

const ENV_NAMES = ['net', 'own', 'validProfileId', 'cleanFace', '_connMeta', 'UNADMITTED_TTL', 'noteSeen', 'denyJoin', 'lastSeen', 'HB_STALE', 'bannedIds', 'getActiveCampaign', 'APP_VERSION', 'versionCmp', 'updateMessage', 'toast', 'logEvent', 'newerSeen', 'ui', '_pwFails', 'approvedIds', 'admitPlayer', 'queueJoin', 'setTimeout', 'clearTimeout', 'tableKeyFor', 'getProfile', 'showConfirm', 'pendingJoins', 'processNextApproval', 'allow', 'pushChat', 'broadcast', 'safeAvatar', 'cleanRosterName', 'awayMap', 'validKey', 'sendFailed'];
// the env supplies every name a slice references — except the function the slice itself DEFINES (a var of the same name would overwrite the hoisted declaration)
const pre = (except) => 'var ' + ENV_NAMES.filter(n => except.indexOf(n) < 0).map(n => n + ' = env.' + n).join(', ') + ';\n';
const runGate = new Function('env', 'msg', 'conn', pre([]) + gateSrc + '\nreturn "ran";');
const runQueue = new Function('env', 'conn', 'prof', 'why', pre(['queueJoin']) + queueSrc + '\nreturn queueJoin(conn, prof, why);');
const runBroadcast = new Function('env', 'msg', 'exceptConn', pre(['broadcast']) + broadcastSrc + '\nreturn broadcast(msg, exceptConn);');
const runChat = new Function('env', 'msg', 'conn', pre([]) + chatSrc + '\nreturn "ran";');
const runRoster = new Function('env', pre([]) + rosterSrc + '\nreturn { rosterPayload, broadcastRoster };');
const runAway = new Function('env', pre(['awayMap']) + awaySrc + '\nreturn awayMap();');

/* ---- a fresh host harness per scenario ---- */
function versionCmp(a, b) { const pa = String(a).split('-')[0].split('.').map(Number), pb = String(b).split('-')[0].split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; }
function harness(opts) {
    opts = opts || {};
    const h = {
        sent: [], admitted: [], closed: [], toasts: [], confirms: [], timers: [], pushed: [], bcast: [], seen: [],
        camp: { id: 'c1', players: opts.players || {}, bannedPlayers: opts.bannedPlayers || {} },
    };
    const env = {
        net: { role: opts.role || 'host', myId: 'u_gm', conns: [], roster: Object.create(null), gmId: '' },
        own: H.own, validProfileId: H.validProfileId, tableKeyFor: H.tableKeyFor,
        _connMeta: Object.create(null), UNADMITTED_TTL: 10 * 60 * 1000, HB_STALE: 8000, lastSeen: {},
        noteSeen: p => h.seen.push(p),
        denyJoin: (conn, reason) => { conn.send({ type: 'denied', reason }); conn.close(); },
        bannedIds: {}, approvedIds: {}, newerSeen: {}, _pwFails: [], pendingJoins: [],
        getActiveCampaign: () => h.camp, APP_VERSION: '1.5.0', versionCmp, updateMessage: () => 'update',
        toast: m => h.toasts.push(String(m)), logEvent: () => {}, showConfirm: m => h.confirms.push(m),
        ui: () => ({ value: opts.password || '' }),
        admitPlayer: (conn, prof, key) => { h.admitted.push({ peer: conn.peer, prof, key }); env.net.roster[conn.peer] = prof; },
        processNextApproval: () => {},
        getProfile: () => ({ id: 'u_me', name: 'Me' }),
        setTimeout: (fn, ms) => { const id = h.timers.length + 1; h.timers.push({ id, fn, ms }); return id; },
        clearTimeout: id => { h.timers = h.timers.filter(t => t.id !== id); },
        allow: () => true,
        pushChat: m => h.pushed.push(m),
        broadcast: (m, ex) => { packCheck(m); h.bcast.push({ m, ex }); },
        safeAvatar: H.safeAvatar, cleanRosterName: H.cleanRosterName, cleanFace: H.cleanFace, awayMap: () => ({ u_a: 'map_1' }), validKey: RC.validKey, sendFailed: () => {},
    };
    env.queueJoin = (conn, prof, why) => runQueue(env, conn, prof, why);
    h.env = env;
    h.conn = (peer) => { const c = { peer, open: true, send: m => { packCheck(m); h.sent.push({ peer, m }); }, close: () => { c.open = false; h.closed.push(peer); } }; env.net.conns.push(c); env._connMeta[peer] = { openedAt: Date.now(), hellos: 0 }; return c; };
    h.hello = (conn, profile, extra) => runGate(env, Object.assign({ type: 'hello', profile, version: '1.5.0' }, extra || {}), conn);
    h.fireTimers = () => { const t = h.timers.splice(0); t.forEach(x => x.fn()); return t.length; };
    h.lastSent = (peer, type) => h.sent.filter(s => s.peer === peer && s.m.type === type).pop();
    return h;
}

/* ================= helpers ================= */
check('own(): a plain object never answers for a prototype key', H.own({}, 'constructor') === false && H.own({}, '__proto__') === false && H.own({ a: 1 }, 'a') === true && H.own({ a: null }, 'a') === false && H.own(null, 'a') === false);
check('validProfileId: short plain ids pass; prototype keys, spaces, empty and long ids fail', H.validProfileId('u_abc123') && H.validProfileId('player.7:x-y') && !H.validProfileId('constructor') && !H.validProfileId('__proto__') && !H.validProfileId('hasOwnProperty') && !H.validProfileId('a b') && !H.validProfileId('') && !H.validProfileId('x'.repeat(81)) && !H.validProfileId(42));
check('newKey: 32 hex chars, unique', (() => { const a = H.newKey(), b = H.newKey(); return /^[0-9a-f]{32}$/.test(a) && a !== b; })());
check('table keys (client): remembered per GM id, absent → empty string, a prototype key never reads', (() => { storage.clear(); H.rememberTableKey('u_gm', 'k1'); return H.tableKeyFor('u_gm') === 'k1' && H.tableKeyFor('u_other') === '' && H.tableKeyFor('constructor') === '' && H.tableKeyFor(undefined) === ''; })());

/* ================= the admission gate ================= */
{
    const h = harness(); const c = h.conn('peerX');
    runGate(h.env, { type: 'item', campId: 'c1', itemId: 'm1' }, c);
    check('gate: a message before admission closes the connection', h.closed.indexOf('peerX') >= 0 && h.seen.length === 0);
}
{
    const h = harness(); const c = h.conn('peerH');
    runGate(h.env, { type: 'hb' }, c);
    check('gate: a waiting peer\'s heartbeat is noted, not closed', h.closed.length === 0 && h.seen[0] === 'peerH');
    h.env._connMeta.peerH.openedAt = Date.now() - h.env.UNADMITTED_TTL - 1;
    runGate(h.env, { type: 'hb' }, c);
    check('gate: past the unadmitted TTL the heartbeat no longer keeps it alive', h.closed.indexOf('peerH') >= 0);
}
{
    const h = harness(); const c = h.conn('constructor');   // a peer that chose a prototype key as its PeerJS id
    runGate(h.env, { type: 'travel', viaItemId: 'p1' }, c);
    check('gate: a peer id of "constructor" is not admitted by Object.prototype (prototype-free roster + own())', h.closed.indexOf('constructor') >= 0);
}

/* ================= hello: strangers, known players, the key ================= */
{
    const h = harness(); const c = h.conn('p1');
    h.hello(c, { id: 'u_new', name: 'Newcomer' });
    check('hello: a stranger waits for the GM (wait sent, queued, not admitted)', h.lastSent('p1', 'wait') && h.env.pendingJoins.length === 1 && h.admitted.length === 0 && h.env.pendingJoins[0].why === '');
}
{
    const h = harness({ players: { u_known: { name: 'Kay', key: 'k'.repeat(32) } } }); const c = h.conn('p2');
    h.hello(c, { id: 'u_known', name: 'Kay' }, { key: 'k'.repeat(32) });
    check('hello: a known player with the matching table key goes straight in, key kept', h.admitted.length === 1 && h.admitted[0].key === 'k'.repeat(32) && h.env.pendingJoins.length === 0 && !h.lastSent('p2', 'auth'));
}
{
    const h = harness({ players: { u_known: { name: 'Kay', key: 'k'.repeat(32) } } }); const c = h.conn('p3');
    h.hello(c, { id: 'u_known', name: 'Kay' });   // no key (a fresh join does not know the GM yet)
    const auth = h.lastSent('p3', 'auth');
    check('hello: a known id without the key is challenged (auth with the GM id), not admitted, not queued yet', auth && auth.m.gmId === 'u_gm' && h.admitted.length === 0 && h.env.pendingJoins.length === 0 && h.timers.length === 1);
    h.hello(c, { id: 'u_known', name: 'Kay' }, { key: 'k'.repeat(32) });   // the client answers with the right key
    check('hello: the keyed answer to the challenge admits; the challenge timer is cleared', h.admitted.length === 1 && h.timers.length === 0);
}
{
    const h = harness({ players: { u_known: { name: 'Kay', key: 'k'.repeat(32) } } }); const c = h.conn('p4');
    h.hello(c, { id: 'u_known', name: 'Kay' }, { key: 'wrong' });
    check('hello: a wrong key is challenged first (never admitted on the claim)', h.lastSent('p4', 'auth') && h.admitted.length === 0);
    h.hello(c, { id: 'u_known', name: 'Kay' }, { key: 'still-wrong' });
    check('hello: a second wrong key → the GM decides, flagged as a known name without its key', h.admitted.length === 0 && h.env.pendingJoins.length === 1 && h.env.pendingJoins[0].why === 'nokey' && h.lastSent('p4', 'wait'));
}
{
    const h = harness({ players: { u_known: { name: 'Kay', key: 'k'.repeat(32) } } }); const c = h.conn('p5');
    h.hello(c, { id: 'u_known', name: 'Kay' });
    const fired = h.fireTimers();   // an older client never answers the challenge
    check('hello: no answer to the challenge (an older client) → the GM is asked, still not admitted', fired === 1 && h.env.pendingJoins.length === 1 && h.env.pendingJoins[0].why === 'nokey' && h.admitted.length === 0);
}
{
    const h = harness({ players: { u_legacy: { name: 'Old', firstSeen: 1 } } }); const c = h.conn('p6');   // a record from before table keys
    h.hello(c, { id: 'u_legacy', name: 'Old' });
    check('hello: a pre-key record is not auto-admitted — the GM is asked once (then a key is issued on admit)', h.admitted.length === 0 && h.env.pendingJoins.length === 1 && !h.lastSent('p6', 'auth'));
}
{
    const h = harness(); h.env.approvedIds.u_dropped = true; const c = h.conn('p7');
    h.hello(c, { id: 'u_dropped', name: 'Dee' });
    check('hello: a yes the GM gave to a dropped connection is good once, then spent', h.admitted.length === 1 && !('u_dropped' in h.env.approvedIds));
}

/* ================= the impersonation the audit found ================= */
{
    const h = harness({ players: { u_victim: { name: 'Victim', key: 'v'.repeat(32) }, u_mallory: { name: 'Mallory', key: 'm'.repeat(32) } } });
    const cA = h.conn('peerA'); h.env.net.roster.peerA = { id: 'u_mallory', name: 'Mallory' };
    h.env.bannedIds.u_mallory = true; delete h.env.net.roster.peerA;   // the GM kicked Mallory (kickPlayer: ban + out of the roster at once)
    const cB = h.conn('peerB'); h.hello(cB, { id: 'u_mallory', name: 'Mallory' }, { key: 'm'.repeat(32) });
    check('kicked: rejoining under the own id is refused even with the key (ban before everything)', h.lastSent('peerB', 'denied') && /removed/.test(h.lastSent('peerB', 'denied').m.reason) && h.admitted.length === 0);
    const cC = h.conn('peerC'); h.hello(cC, { id: 'u_victim', name: 'x' });
    check('kicked: claiming another known player\'s id without their key is challenged, never admitted', h.lastSent('peerC', 'auth') && h.admitted.length === 0);
    h.fireTimers();
    check('kicked: … and after the unanswered challenge it is the GM\'s call, flagged', h.admitted.length === 0 && h.env.pendingJoins.length === 1 && h.env.pendingJoins[0].why === 'nokey');
}

/* ================= Kick and Ban take every connection of a profile (fold M1) ================= */
// net.kickPlayer and the Players panel's Ban branch are run for real over a gate harness: the real admission gate and broadcast() judge what follows
{
    const js = JSON.stringify;
    const kickSrc = (() => { const k = 'net.kickPlayer = function(', i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: net.kickPlayer not found once'); return src.slice(i, e + 4); })();
    const banA = 'if (btn.dataset.ban) {', banB = '} else if (btn.dataset.unban) {', banI = src.indexOf(banA), banJ = src.indexOf(banB);
    if (banI < 0 || banJ < banI || src.indexOf(banA, banI + 1) >= 0 || src.indexOf(banB, banJ + 1) >= 0) throw new Error('netcheck: the Ban branch not found once');
    const banBody = src.slice(banI + banA.length, banJ);
    const buildKick = new Function('net', 'own', 'bannedIds', 'renderRoster', 'sensesForget', 'dropWaitingFor', 'sendFailed', 'setTimeout', 'toast', 'render', 'broadcastTargets', 'broadcastRoster', kickSrc + '\nreturn net.kickPlayer;');
    const runBan = new Function('btn', 'camp', 'net', 'dropWaitingFor', 'save', 'toast', banBody);
    // pA1 and pA2 admitted as u_a, pB as u_b, pX and pY as profiles whose ids only end or begin like u_a's, pW waiting for the GM
    const mkK = pre => {
        const h = harness(), env = h.env, ev = [];
        ['pA1', 'pA2', 'pB', 'pW', 'pX', 'pY'].forEach(p => h.conn(p));
        Object.assign(env.net.roster, { pA1: { id: 'u_a', name: 'Pat' }, pA2: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' }, pX: { id: 'u_a2', name: 'Ex' }, pY: { id: 'xu_a', name: 'Wy' } });
        if (pre) pre(h);
        h.told = [];   // each 'kicked' as it goes out, with how many roster entries of its profile are left at that moment
        h.seq = [];    // round 2: every send, the redraw, the pointers and the roster going out, in order (the last two with the roster keys left then)
        env.net.conns.forEach(c => { const s = c.send; c.send = m => { if (m) h.seq.push('send:' + c.peer + ':' + m.type); if (m && m.type === 'kicked') { const p = h.snap && h.snap[c.peer]; h.told.push(c.peer + ':' + Object.keys(env.net.roster).filter(k => p && env.net.roster[k].id === p).length); } return s(m); }; });
        h.snap = {}; Object.keys(env.net.roster).forEach(k => { h.snap[k] = env.net.roster[k].id; });
        h.ev = ev;
        // the redraw records the pointers it would draw; the pointers and the roster go out through the real broadcast() (the roster's payload
        // built by the real rosterPayload; the pointers as broadcastTargets sends them on a table with no fog), so a removed connection's share shows
        const left = () => Object.keys(env.net.roster).join('+'), realB = (m, ex) => runBroadcast(env, m, ex);
        env.net.kickPlayer = buildKick(env.net, H.own, env.bannedIds, () => ev.push('roster'), id => ev.push('forget:' + id), id => ev.push('drop:' + id), e => ev.push('failed:' + (e && e.message)), env.setTimeout, t => ev.push('toast:' + t),
            () => h.seq.push('render[' + Object.keys(env.net.targets || {}).join('+') + ']'),
            () => { h.seq.push('targets(' + left() + ')'); realB({ type: 'targets', targets: JSON.parse(JSON.stringify(env.net.targets)) }, null); },
            () => { h.seq.push('roster-out(' + left() + ')'); runRoster(Object.assign({}, env, { broadcast: realB })).broadcastRoster(); });
        h.kick = k => { let threw = ''; try { env.net.kickPlayer(k); } catch (e) { threw = e.message; } return threw; };
        h.kicked = () => h.sent.filter(s => s.m.type === 'kicked').map(s => s.peer);
        h.rosterKeys = () => Object.keys(env.net.roster).sort();
        return h;
    };
    const A = mkK(), aThrew = A.kick('pA1');
    const aNow = { roster: A.rosterKeys(), kicked: A.kicked(), told: A.told.slice(), timers: A.timers.map(t => t.ms), closed: A.closed.slice(), ev: A.ev.slice(), banned: Object.keys(A.env.bannedIds), threw: aThrew };
    A.sent.length = 0; runBroadcast(A.env, { type: 'chat', text: 'after' }); const aBcast = A.sent.map(s => s.peer);
    A.sent.length = 0; A.hello(A.env.net.conns.find(c => c.peer === 'pA2'), { id: 'u_a', name: 'Pat' }); const aHello2 = A.lastSent('pA2', 'denied');
    const c0 = A.closed.length, aFired = A.fireTimers(), aClosed = A.closed.slice(c0);   // the refused hello closed pA2 once already (denyJoin): the kick's own closes come after
    const cA3 = A.conn('pA3'); A.hello(cA3, { id: 'u_a', name: 'Pat' }, { key: 'k'.repeat(32) }); const aRejoin = A.lastSent('pA3', 'denied');
    check('M1: removing a player (net.kickPlayer, run for real) removes every admitted connection of their profile — both of Pat\'s leave the roster before either is told, each is told \'kicked\' once and closed 400 ms later; their profile is forgotten once, their waiting token dropped once, one toast; the session ban holds their profile; profiles whose ids only begin or end the same keep their places',
        aNow.threw === '' && js(aNow.roster) === js(['pB', 'pX', 'pY']) && js(aNow.kicked) === js(['pA1', 'pA2']) && js(aNow.told) === js(['pA1:0', 'pA2:0']) && js(aNow.timers) === js([400, 400]) && aNow.closed.length === 0
        && js(aNow.ev) === js(['roster', 'forget:u_a', 'drop:u_a', 'toast:Pat removed from the session.']) && js(aNow.banned) === js(['u_a']) && aFired === 2 && js(aClosed) === js(['pA1', 'pA2']), js([aNow, aFired, aClosed]));
    check('M1: after the kick nothing of the table reaches the second connection (broadcast(), run for real, sends only to pB, pX and pY), its hello in the 400 ms before the close is refused as removed, and a rejoin on a new connection is refused by the session ban even with the table key; nothing is admitted',
        js(aBcast) === js(['pB', 'pX', 'pY']) && !!aHello2 && /removed/.test(aHello2.m.reason) && !!aRejoin && /removed/.test(aRejoin.m.reason) && A.admitted.length === 0, js([aBcast, aHello2, aRejoin, A.admitted]));
    const B = mkK(); B.kick('pB'); const bOut = { roster: B.rosterKeys(), kicked: B.kicked(), timers: B.timers.length, ev: B.ev.slice(), banned: Object.keys(B.env.bannedIds) };
    const W = mkK(); W.kick('pW'); const wOut = { roster: W.rosterKeys(), kicked: W.kicked(), timers: W.timers.length, ev: W.ev.slice(), banned: Object.keys(W.env.bannedIds) };
    const unknown = ['pGhost', 'constructor', '__proto__', 'hasOwnProperty', '', undefined, null].map(k => { const U = mkK(); const threw = U.kick(k); return [threw, U.rosterKeys().length, U.sent.length, U.timers.length, U.ev.filter(e => !/^toast:/.test(e)), Object.keys(U.env.bannedIds)]; });
    const Cl = mkK(h => { h.env.net.role = 'client'; }); Cl.kick('pA1'); const clOut = [Cl.rosterKeys().length, Cl.sent.length, Cl.timers.length, Cl.ev, Object.keys(Cl.env.bannedIds)];
    check('M1: removing another player (pB) leaves both of Pat\'s connections at the table; removing a waiting peer tells and closes that peer alone and forgets, bans and drops nobody; an unknown key, a prototype name or no key sends nothing, queues no close and forgets nobody; a player\'s machine does nothing at all',
        js(bOut) === js({ roster: ['pA1', 'pA2', 'pX', 'pY'], kicked: ['pB'], timers: 1, ev: ['roster', 'forget:u_b', 'drop:u_b', 'toast:Bea removed from the session.'], banned: ['u_b'] })
        && js(wOut) === js({ roster: ['pA1', 'pA2', 'pB', 'pX', 'pY'], kicked: ['pW'], timers: 1, ev: ['toast:Player removed from the session.'], banned: [] })
        && unknown.every(u => js(u) === js(['', 5, 0, 0, [], []])) && js(clOut) === js([5, 0, 0, [], []]), js([bOut, wOut, unknown, clOut]));
    // three connections of one profile (the one clicked in the middle), one roster entry with no connection left, and a send that throws
    const T = mkK(h => { h.conn('pA3'); h.env.net.roster.pA3 = { id: 'u_a', name: 'Pat' }; h.env.net.roster.pA4 = { id: 'u_a', name: 'Pat' }; });
    T.kick('pA2'); const tOut = { roster: T.rosterKeys(), kicked: T.kicked(), timers: T.timers.length, ev: T.ev.slice() }; T.fireTimers(); tOut.closed = T.closed.slice();
    const F = mkK(h => { h.env.net.conns.find(c => c.peer === 'pA1').send = () => { throw new Error('boom'); }; }); const fThrew = F.kick('pA1');
    const fOut = { threw: fThrew, roster: F.rosterKeys(), kicked: F.kicked(), timers: F.timers.length, ev: F.ev.slice() }; F.fireTimers(); fOut.closed = F.closed.slice();
    check('M1: every connection of the profile goes, however many — three open ones and a roster entry whose connection is gone, the middle one clicked: all four entries leave, the three are told and closed, forgotten and dropped once; a send that throws on one is reported and the other is still told, and both are closed',
        js(tOut) === js({ roster: ['pB', 'pX', 'pY'], kicked: ['pA1', 'pA2', 'pA3'], timers: 3, ev: ['roster', 'forget:u_a', 'drop:u_a', 'toast:Pat removed from the session.'], closed: ['pA1', 'pA2', 'pA3'] })
        && js(fOut) === js({ threw: '', roster: ['pB', 'pX', 'pY'], kicked: ['pA2'], timers: 2, ev: ['roster', 'forget:u_a', 'drop:u_a', 'failed:boom', 'toast:Pat removed from the session.'], closed: ['pA1', 'pA2'] }), js([tOut, fOut]));
    // the Players panel's Ban branch, run for real with the real kickPlayer: one call covers the whole profile
    const banRun = (pid, pre) => { const K = mkK(pre), calls = [], real = K.env.net.kickPlayer, camp = { players: { u_a: { name: 'Pat' } } }, saves = []; K.env.net.active = true; K.env.net.kickPlayer = k => { calls.push(k); return real(k); };
        let threw = ''; try { runBan({ dataset: { ban: pid } }, camp, K.env.net, id => K.ev.push('drop:' + id), () => saves.push(1), t => K.ev.push('toast:' + t)); } catch (e) { threw = e.message; } return { threw, calls, roster: K.rosterKeys(), kicked: K.kicked(), timers: K.timers.length, forgot: K.ev.filter(e => /^forget:/.test(e)), banned: Object.keys(camp.bannedPlayers), session: Object.keys(K.env.bannedIds), saves: saves.length }; };
    const ban1 = banRun('u_a'), banAway = banRun('u_gone'), banClient = banRun('u_a', h => { h.env.net.role = 'client'; });
    const scripts = fs.readdirSync(path.join(__dirname, '..', 'system', 'app', 'scripts')).filter(f => /\.js$/.test(f)), noCom = s => s.replace(/\/\/[^\n]*/g, '');
    const kickedSends = scripts.map(f => [f, (fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').match(/type: 'kicked'/g) || []).length]).filter(x => x[1]);
    const kickCalls = scripts.map(f => [f, (noCom(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8')).match(/kickPlayer\(/g) || []).length]).filter(x => x[1]);
    check('M1: a Ban from the Players panel (its branch run for real) calls net.kickPlayer exactly once, with the first roster key of the profile, and that one call takes both of Pat\'s connections (told, closed, forgotten once); a profile not at the table and a player\'s machine call it not at all; in the source the Ban branch calls it once and never in a loop, net.js calls it twice (the roster\'s kick button, the Ban branch) and no other script does, and kickPlayer is the only place that sends \'kicked\'; the host still has 24 message branches',
        js(ban1) === js({ threw: '', calls: ['pA1'], roster: ['pB', 'pX', 'pY'], kicked: ['pA1', 'pA2'], timers: 2, forgot: ['forget:u_a'], banned: ['u_a'], session: ['u_a'], saves: 1 }) && js(banAway.calls) === js([]) && banAway.kicked.length === 0 && banAway.threw === '' && js(banClient.calls) === js([]) && banClient.kicked.length === 0 && banClient.threw === ''
        && (noCom(banBody).match(/net\.kickPlayer\(/g) || []).length === 1 && !/forEach|\bfor \(|\bwhile \(/.test(noCom(banBody)) && js(kickCalls) === js([['net.js', 2]]) && (noCom(src).match(/net\.kickPlayer\(/g) || []).length === 2
        && js(kickedSends) === js([['net.js', 1]]) && kickSrc.indexOf("conn.send({ type: 'kicked' });") >= 0 && (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 24, js([ban1, banAway, banClient, kickCalls, kickedSends]));

    /* round 2: the review's three older gaps — a removed player's pointer and roster row, a second connection under one key, a queued request */
    const tg = { u_a: { mapId: 'm1', id: 'orc' }, u_b: { mapId: 'm1', id: 'gob' } }, withT = t => h => { h.env.net.targets = JSON.parse(js(t)); };
    const outOf = (K, type) => K.sent.filter(s => s.m.type === type).map(s => s.peer + '=' + (type === 'roster' ? s.m.roster.map(e => e.id) : Object.keys(s.m.targets)).join('+'));
    const P1 = mkK(withT(tg)), p1Threw = P1.kick('pA1');
    const p1 = { threw: p1Threw, targets: Object.keys(P1.env.net.targets), seq: P1.seq.slice(), tgt: outOf(P1, 'targets'), ros: outOf(P1, 'roster'), ev: P1.ev.slice(), kicked: P1.kicked() };
    check('M1 round 2: removing a player who holds a target pointer (net.kickPlayer, run for real) deletes their pointer and keeps the others\'; once both of their roster entries are gone the map is redrawn without it, then the pointers go out once and the roster once, both before either connection is told \'kicked\'; the real broadcast() gives them to pB, pX and pY only, the pointers without theirs and the roster without them, and the removed connections get nothing but \'kicked\'',
        p1.threw === '' && js(p1.targets) === js(['u_b']) && js(p1.seq) === js(['render[u_b]', 'targets(pB+pX+pY)', 'send:pB:targets', 'send:pX:targets', 'send:pY:targets', 'roster-out(pB+pX+pY)', 'send:pB:roster', 'send:pX:roster', 'send:pY:roster', 'send:pA1:kicked', 'send:pA2:kicked'])
        && js(p1.tgt) === js(['pB=u_b', 'pX=u_b', 'pY=u_b']) && js(p1.ros) === js(['pB=u_b+u_a2+xu_a', 'pX=u_b+u_a2+xu_a', 'pY=u_b+u_a2+xu_a']) && js(p1.ev) === js(['roster', 'forget:u_a', 'drop:u_a', 'toast:Pat removed from the session.']) && js(p1.kicked) === js(['pA1', 'pA2']), js(p1));
    const noPtr = [mkK(withT({ u_b: tg.u_b })), mkK(withT({})), mkK()].map(K => { const threw = K.kick('pA2'); return { threw, targets: K.env.net.targets ? Object.keys(K.env.net.targets) : null, seq: K.seq.slice() }; });
    const quiet = ['pW', 'pGhost', 'constructor', '__proto__', undefined].map(k => { const K = mkK(withT(tg)); const threw = K.kick(k); return { threw, targets: Object.keys(K.env.net.targets), seq: K.seq.slice() }; });
    const Cl2 = mkK(h => { withT(tg)(h); h.env.net.role = 'client'; }); Cl2.kick('pA1'); const cl2 = { targets: Object.keys(Cl2.env.net.targets), seq: Cl2.seq.slice() };
    const rosterThenKicked = ['roster-out(pB+pX+pY)', 'send:pB:roster', 'send:pX:roster', 'send:pY:roster', 'send:pA1:kicked', 'send:pA2:kicked'];
    check('M1 round 2: removing a player who holds no pointer (another\'s pointer only, an empty set, no set at all) redraws nothing and sends no pointers, the others\' pointer stays, and the roster still goes out once, to pB, pX and pY, before \'kicked\'; removing a waiting peer, an unknown key, a prototype name or no key redraws nothing and sends neither the pointers nor the roster, and every pointer stays (the waiting peer is told \'kicked\' alone); a player\'s machine does nothing',
        js(noPtr) === js([{ threw: '', targets: ['u_b'], seq: rosterThenKicked }, { threw: '', targets: [], seq: rosterThenKicked }, { threw: '', targets: null, seq: rosterThenKicked }])
        && js(quiet) === js([{ threw: '', targets: ['u_a', 'u_b'], seq: ['send:pW:kicked'] }].concat([1, 2, 3, 4].map(() => ({ threw: '', targets: ['u_a', 'u_b'], seq: [] })))) && js(cl2) === js({ targets: ['u_a', 'u_b'], seq: [] }), js([noPtr, quiet, cl2]));
    // two open DataConnections under one peer key (a modified client): the one found first and the other
    const dupRun = (peer, dups) => { const K = mkK(h => { dups.forEach(p => h.conn(p)); }), cs = K.env.net.conns;
        cs.forEach(c => { c.nK = 0; const s = c.send; c.send = m => { if (m && m.type === 'kicked') c.nK++; return s(m); }; });
        const threw = K.kick(peer), r = { threw, peers: cs.map(c => c.peer), told: cs.map(c => c.nK), openAt: cs.map(c => c.open), timers: K.timers.map(t => t.ms), roster: K.rosterKeys() };
        r.fired = K.fireTimers(); r.open = cs.map(c => c.open); r.closed = K.closed.slice(); r.seq = K.seq.filter(e => /^roster-out|^targets|^render/.test(e)); return r; };
    const dA = dupRun('pA1', ['pA1', 'pB']), dA2 = dupRun('pA2', ['pA1']), dW = dupRun('pW', ['pW']);
    const T8 = [true, true, true, true, true, true, true, true], T7 = T8.slice(1);
    check('M1 round 2: a second open DataConnection under a removed key is told \'kicked\' once and closed at 400 ms like the first — clicking either key of the profile reaches both of pA1\'s — while another player\'s second connection (pB) stays open and untold; both under a waiting peer\'s key are told and closed too; each connection gets one close, none before 400 ms',
        js(dA) === js({ threw: '', peers: ['pA1', 'pA2', 'pB', 'pW', 'pX', 'pY', 'pA1', 'pB'], told: [1, 1, 0, 0, 0, 0, 1, 0], openAt: T8, timers: [400, 400, 400], roster: ['pB', 'pX', 'pY'], fired: 3, open: [false, false, true, true, true, true, false, true], closed: ['pA1', 'pA1', 'pA2'], seq: ['roster-out(pB+pX+pY)'] })
        && js(dA2) === js({ threw: '', peers: ['pA1', 'pA2', 'pB', 'pW', 'pX', 'pY', 'pA1'], told: [1, 1, 0, 0, 0, 0, 1], openAt: T7, timers: [400, 400, 400], roster: ['pB', 'pX', 'pY'], fired: 3, open: [false, false, true, true, true, true, false], closed: ['pA1', 'pA1', 'pA2'], seq: ['roster-out(pB+pX+pY)'] })
        && js(dW) === js({ threw: '', peers: ['pA1', 'pA2', 'pB', 'pW', 'pX', 'pY', 'pW'], told: [0, 0, 0, 1, 0, 0, 1], openAt: T7, timers: [400, 400], roster: ['pA1', 'pA2', 'pB', 'pX', 'pY'], fired: 2, open: [true, true, true, false, true, true, false], closed: ['pW', 'pW'], seq: [] }), js([dA, dA2, dW]));

    // processNextApproval, run for real over the real queueJoin: a request whose profile is banned never reaches the GM
    const pnaSrc = (() => { const k = 'function processNextApproval() {', i = src.indexOf(k), e = src.indexOf('\n}\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: processNextApproval not found once'); return src.slice(i, e + 3); })();
    const buildPNA = new Function('env', pre(['processNextApproval']) + 'var approvalOpen = false;\n' + pnaSrc + '\nreturn { run: processNextApproval, isOpen: function() { return approvalOpen; } };');
    const withQ = h => { h.env.net.active = true; h.asks = []; h.env.showConfirm = (m, cb) => h.asks.push({ m, cb }); h.P = buildPNA(h.env); h.env.processNextApproval = h.P.run;
        h.answer = yes => h.asks[h.asks.length - 1].cb(yes); h.says = () => h.asks.map(a => a.m); h.types = peer => h.sent.filter(s => s.peer === peer).map(s => s.m.type + (s.m.reason ? '(' + s.m.reason + ')' : '')); return h; };
    const RM = 'You were removed from this session.', BN = 'You are banned from this campaign.', askOf = (n, hint) => '"' + n + '" wants to join your table' + (hint ? ' — a name this table already knows, but without its table key (a fresh install, or someone else using that name)' : '') + '. Let them in?';
    const calBan = () => ({ u_cal: { name: 'Cal', bannedAt: 1 } });
    // Ann on screen; Sam (banned for the session), Cal (banned from the campaign) and Bo wait behind her
    const Q1 = withQ(harness({ bannedPlayers: calBan() })); Q1.env.bannedIds.u_sam = true;
    const q1c = ['qA', 'qS', 'qC', 'qB'].map(p => Q1.conn(p));
    [['u_ann', 'Ann'], ['u_sam', 'Sam'], ['u_cal', 'Cal'], ['u_bo', 'Bo']].forEach((x, i) => Q1.env.queueJoin(q1c[i], { id: x[0], name: x[1] }, ''));
    const q1a = { says: Q1.says(), waiting: Q1.env.pendingJoins.map(q => q.prof.id), open: Q1.P.isOpen(), closed: Q1.closed.slice() };
    Q1.answer(true);
    const q1b = { says: Q1.says(), waiting: Q1.env.pendingJoins.length, open: Q1.P.isOpen(), admitted: Q1.admitted.map(a => a.peer), closed: Q1.closed.slice(), S: Q1.types('qS'), C: Q1.types('qC'), B: Q1.types('qB') };
    Q1.answer(true); const q1d = { admitted: Q1.admitted.map(a => a.peer), open: Q1.P.isOpen(), asks: Q1.asks.length, roster: Object.keys(Q1.env.net.roster) };
    check('M1 round 2: a queued join request (processNextApproval, run for real over the real queueJoin) whose profile is banned for the session or from the campaign is refused with the words the hello gate gives each (removed from this session; banned from this campaign) and never put to the GM; when the GM answers the request before them, both are refused and the next one in line (Bo) is shown at once; Bo is let in on a yes and the queue is left empty and closed',
        js(q1a) === js({ says: [askOf('Ann')], waiting: ['u_sam', 'u_cal', 'u_bo'], open: true, closed: [] })
        && js(q1b) === js({ says: [askOf('Ann'), askOf('Bo')], waiting: 0, open: true, admitted: ['qA'], closed: ['qS', 'qC'], S: ['wait', 'denied(' + RM + ')'], C: ['wait', 'denied(' + BN + ')'], B: ['wait'] })
        && js(q1d) === js({ admitted: ['qA', 'qB'], open: false, asks: 2, roster: ['qA', 'qB'] }), js([q1a, q1b, q1d]));
    // nothing on screen: a banned request is refused at once and leaves no prompt open, so the next request is shown; a prototype name is never taken for a ban
    const Q2 = withQ(harness({ bannedPlayers: calBan() })); Q2.env.bannedIds.u_sam = true;
    Q2.env.queueJoin(Q2.conn('qS'), { id: 'u_sam', name: 'Sam' }, 'nokey'); Q2.env.queueJoin(Q2.conn('qC'), { id: 'u_cal', name: 'Cal' }, '');
    const q2a = { says: Q2.says(), open: Q2.P.isOpen(), waiting: Q2.env.pendingJoins.length, closed: Q2.closed.slice(), S: Q2.types('qS'), C: Q2.types('qC') };
    Q2.env.queueJoin(Q2.conn('qK'), { id: 'u_kay', name: 'Kay' }, 'nokey'); const q2b = { says: Q2.says(), open: Q2.P.isOpen() };
    Q2.env.queueJoin(Q2.conn('qP'), { id: 'constructor', name: 'Proto' }, ''); Q2.answer(false);
    const q2c = { says: Q2.says(), open: Q2.P.isOpen(), closed: Q2.closed.slice(), K: Q2.types('qK'), P: Q2.types('qP') };
    check('M1 round 2: with nothing on screen a request of a profile banned for the session, or from the campaign, is refused at once, with no prompt and none left open; an ordinary request after them is shown as before, a known name without its key with the hint; a profile named like a prototype key is never taken for banned and is put to the GM in turn',
        js(q2a) === js({ says: [], open: false, waiting: 0, closed: ['qS', 'qC'], S: ['wait', 'denied(' + RM + ')'], C: ['wait', 'denied(' + BN + ')'] }) && js(q2b) === js({ says: [askOf('Kay', true)], open: true })
        && js(q2c) === js({ says: [askOf('Kay', true), askOf('Proto')], open: true, closed: ['qS', 'qC', 'qK'], K: ['wait', 'denied(The GM declined your request to join.)'], P: ['wait'] }), js([q2a, q2b, q2c]));
    // banned while the request waited: Dee removed for the session, Eve banned from the campaign by the Players panel's Ban branch (run for real)
    const Q3 = withQ(harness()), q3c = ['qA', 'qD', 'qE', 'qF'].map(p => Q3.conn(p));
    [['u_ann', 'Ann'], ['u_dee', 'Dee'], ['u_eve', 'Eve'], ['u_fay', 'Fay']].forEach((x, i) => Q3.env.queueJoin(q3c[i], { id: x[0], name: x[1] }, ''));
    Q3.env.bannedIds.u_dee = true; let q3Threw = ''; try { runBan({ dataset: { ban: 'u_eve' } }, Q3.camp, Q3.env.net, () => {}, () => {}, () => {}); } catch (e) { q3Threw = e.message; }
    const q3a = { says: Q3.says(), waiting: Q3.env.pendingJoins.length }; Q3.answer(false);
    const q3b = { threw: q3Threw, says: Q3.says(), open: Q3.P.isOpen(), waiting: Q3.env.pendingJoins.length, closed: Q3.closed.slice(), D: Q3.types('qD'), E: Q3.types('qE'), F: Q3.types('qF'), admitted: Q3.admitted.length, session: Object.keys(Q3.env.bannedIds).sort() };
    check('M1 round 2: a request whose profile is removed for the session, or banned from the campaign in the Players panel, while it waits behind another is refused when its turn comes and never shown; the GM\'s No to the one before still turns that one away, and the next ordinary request is shown',
        js(q3a) === js({ says: [askOf('Ann')], waiting: 3 }) && js(q3b) === js({ threw: '', says: [askOf('Ann'), askOf('Fay')], open: true, waiting: 0, closed: ['qA', 'qD', 'qE'], D: ['wait', 'denied(' + RM + ')'], E: ['wait', 'denied(' + BN + ')'], F: ['wait'], admitted: 0, session: ['u_ann', 'u_dee'] }), js([q3a, q3b]));
    // the review's case end to end: a known id without its key is challenged, the GM removes or bans that profile, the challenge runs out
    const e2e = act => { const K = withQ(mkK(h => { h.camp.players.u_a = { name: 'Pat', key: 'k'.repeat(32) }; h.camp.players.u_k = { name: 'Kay', key: 'q'.repeat(32) }; }));
        const pid = act === 'kick' ? 'u_a' : 'u_k', c = K.conn('pN'); K.hello(c, { id: pid, name: K.camp.players[pid].name });
        const asked = K.types('pN'); let threw = '';
        try { if (act === 'kick') K.env.net.kickPlayer('pA1'); else if (act === 'ban') runBan({ dataset: { ban: 'u_k' } }, K.camp, K.env.net, () => {}, () => {}, () => {}); } catch (e) { threw = e.message; }
        K.fireTimers(); const r = { asked, threw, types: K.types('pN'), says: K.says(), admitted: K.admitted.map(a => a.peer), waiting: K.env.pendingJoins.length, open: K.P.isOpen(), atTable: Object.keys(K.env.net.roster).filter(k => K.env.net.roster[k].id === pid) };
        if (act === 'none') { K.answer(true); r.after = { admitted: K.admitted.map(a => a.peer), atTable: Object.keys(K.env.net.roster).filter(k => K.env.net.roster[k].id === pid) }; }
        return r; };
    const eKick = e2e('kick'), eBan = e2e('ban'), eNone = e2e('none');
    check('M1 round 2 (the review\'s case, end to end): a known player\'s new connection without the table key is challenged; if the GM removes that player from the session (net.kickPlayer) or bans them from the campaign (the Ban branch) before the challenge runs out, the request it then queues is refused (with the removal words, or the ban words), never shown, and nobody is let back in; with neither, the GM is asked with the hint as before and a yes lets them in',
        js(eKick) === js({ asked: ['auth'], threw: '', types: ['auth', 'wait', 'denied(' + RM + ')'], says: [], admitted: [], waiting: 0, open: false, atTable: [] })
        && js(eBan) === js({ asked: ['auth'], threw: '', types: ['auth', 'wait', 'denied(' + BN + ')'], says: [], admitted: [], waiting: 0, open: false, atTable: [] })
        && js(eNone) === js({ asked: ['auth'], threw: '', types: ['auth', 'wait'], says: [askOf('Kay', true)], admitted: [], waiting: 0, open: true, atTable: [], after: { admitted: ['pN'], atTable: ['pN'] } }), js([eKick, eBan, eNone]));
}

/* ================= identity validation, whitelist, storms, versions, passwords ================= */
{
    const h = harness();
    ['constructor', '__proto__', 'a b', 'x'.repeat(81), ''].forEach((id, i) => { const c = h.conn('q' + i); h.hello(c, { id, name: 'N' }); });
    const denials = h.sent.filter(s => s.m.type === 'denied' && /not valid/.test(s.m.reason)).length;
    check('hello: prototype keys, spaces, over-long and empty ids are refused as invalid', denials === 5 && h.admitted.length === 0 && h.env.pendingJoins.length === 0);
}
{
    const h = harness({ players: { u_k: { name: 'K', key: 'z'.repeat(32) } } }); const c = h.conn('w1');
    h.hello(c, { id: 'u_k', name: 'K', color: '#12ab34', avatar: 'data:text/html;base64,AAAA', location: 'map_secret', evil: { deep: 1 }, gm: true }, { key: 'z'.repeat(32) });
    const prof = h.admitted[0] && h.admitted[0].prof;
    check('hello: only id/name/color survive from the profile (a bad avatar and any extra field are dropped)', prof && Object.keys(prof).sort().join() === 'color,id,name' && prof.color === '#12ab34');
}
{
    const h = harness(); const c = h.conn('s1');
    for (let i = 0; i < 5; i++) h.hello(c, { id: 'u_storm', name: 'S' });
    check('hello: a hello storm on one connection closes it', h.closed.indexOf('s1') >= 0);
}
{
    const h = harness(); const c = h.conn('v1');
    h.hello(c, { id: 'u_newer', name: 'N' }, { version: '9.9.9' });
    check('hello: a newer client is a toast + queued join, never a dialog (which would sit on the pending Allow/Deny)', h.confirms.length === 0 && h.toasts.some(t => /newer/.test(t)) && h.env.pendingJoins.length === 1);
    const c2 = h.conn('v2'); h.hello(c2, { id: 'u_old', name: 'O' }, { version: '1.0.0' });
    check('hello: an older client is turned away with the update notice', h.lastSent('v2', 'denied') && h.lastSent('v2', 'denied').m.update === true);
}
{
    const h = harness({ players: { u_b: { name: 'B', key: 'b'.repeat(32) } }, bannedPlayers: { u_b: true } }); const c = h.conn('b1');
    h.hello(c, { id: 'u_b', name: 'B' }, { key: 'b'.repeat(32), version: '9.9.9' });
    check('hello: a campaign ban wins over a valid key and a newer version (no toast, no admit)', h.lastSent('b1', 'denied') && /banned/.test(h.lastSent('b1', 'denied').m.reason) && h.admitted.length === 0 && h.confirms.length === 0 && !h.toasts.some(t => /newer/.test(t)));
}
{
    const h = harness({ password: 'sesame' });
    for (let i = 0; i < 20; i++) { const c = h.conn('pw' + i); h.hello(c, { id: 'u_guess' + i, name: 'G' }, { password: 'nope' + i }); }
    check('password: every wrong guess is refused', h.sent.filter(s => s.m.type === 'denied' && /Wrong session password/.test(s.m.reason)).length === 20);
    const cR = h.conn('pwR'); h.hello(cR, { id: 'u_right', name: 'R' }, { password: 'sesame' });
    check('password: after 20 wrong guesses in a minute the door is locked briefly, even for the right word', h.lastSent('pwR', 'denied') && /Too many/.test(h.lastSent('pwR', 'denied').m.reason));
    h.env._pwFails.length = 0;
    const cOk = h.conn('pwOK'); h.hello(cOk, { id: 'u_right2', name: 'R' }, { password: 'sesame' });
    check('password: the right word joins the queue as normal once the lockout lapses', h.lastSent('pwOK', 'wait') && h.env.pendingJoins.some(j => j.prof.id === 'u_right2'));
}

/* ================= the join queue ================= */
{
    const h = harness(); const c = h.conn('j1');
    h.env.queueJoin(c, { id: 'u_j', name: 'J' }, ''); h.env.queueJoin(c, { id: 'u_j', name: 'J' }, '');
    check('queue: one place in line per connection', h.env.pendingJoins.length === 1 && h.sent.filter(s => s.m.type === 'wait').length === 1);
    for (let i = 0; i < 12; i++) h.env.queueJoin(h.conn('jj' + i), { id: 'u_jj' + i, name: 'J' }, '');
    check('queue: the line is bounded — beyond it a join is told the table is busy', h.env.pendingJoins.length === 12 && h.sent.some(s => s.m.type === 'denied' && /busy/.test(s.m.reason)));
}

/* ================= broadcast ================= */
{
    const h = harness(); const a = h.conn('adm'), w = h.conn('waiting'); h.env.net.roster.adm = { id: 'u_a', name: 'A' };
    runBroadcast(h.env, { type: 'roster' }, null);
    check('broadcast (host): reaches admitted peers only — a peer still waiting for the Allow hears nothing', h.sent.some(s => s.peer === 'adm') && !h.sent.some(s => s.peer === 'waiting'));
    const hc = harness({ role: 'client' }); const host = hc.conn('host');
    runBroadcast(hc.env, { type: 'item' }, null);
    check('broadcast (client): the single host connection still receives (the gate is host-side only)', hc.sent.some(s => s.peer === 'host'));
}

/* ================= chat ================= */
{
    const h = harness(); const c = h.conn('ch1'); h.env.net.roster.ch1 = { id: 'u_pat', name: 'Pat', color: '#112233' };
    runChat(h.env, { type: 'chat', text: 'x'.repeat(3000), from: { id: 'u_gm', name: 'GM', gm: true }, scope: 'whisper', ts: 1, roll: { fake: 1 } }, c);
    const m = h.pushed[0];
    check('chat: the sender is the roster entry — a claimed GM/other identity, whisper scope, roll and clock are all replaced', m && m.from.id === 'u_pat' && m.from.name === 'Pat' && m.from.color === '#112233' && !('gm' in m.from) && m.scope === 'global' && !m.roll && m.text.length === 2000 && m.ts > 1 && h.bcast.length === 1 && h.bcast[0].m === m && h.bcast[0].ex === c);
    runChat(h.env, { type: 'chat', text: 42, from: { id: 'u_pat' } }, c);
    check('chat: a non-string text is dropped', h.pushed.length === 1);
}

/* ================= asset requests ================= */
check('asset-req: the picture limiter has NO per-request spacing (a map\'s pictures arrive in one burst) and answers a refusal', /allow\('asset', \{ perMs: 0, burst: \d+, windowMs: \d+, table: \d+ \}, conn\.peer\)\) \{ answerAsset\(conn, msg\.path, 'busy'\); return; \}/.test(src));
check('asset-req: a missing or over-cap picture is answered, never dropped silently', /answerAsset\(conn, msg\.path, 'missing'\)/.test(src) && /answerAsset\(conn, msg\.path, 'too-big'\)/.test(src));
check('asset arrival (client): a refused picture clears its pending flag and retries on busy, settles on missing', /msg\.error === 'busy' && tries <= 5/.test(src) && /assetCache\[msg\.path\] = ASSET_PLACEHOLDER/.test(src));

/* ================= what a client accepts from a host ================= */
check('client: every campaign/item lookup from a host message is an own-key lookup (campOf/validKey) in applyStage, applyItem, applyItemDelta, handlePos, itemGone, chars, system', (src.match(/campOf\(/g) || []).length >= 8 && /function applyItem\(msg\) \{\n\s*var camp = campOf\(msg\.campId\);\n\s*if \(!camp \|\| !validKey\(msg\.itemId\)\) return;/.test(src) && /function applyItemDelta\(msg\) \{\n\s*var camp = campOf\(msg\.campId\); if \(!camp \|\| !validKey\(msg\.itemId\)\) return;/.test(src));
check('client: a host map is cleaned on the snapshot, on a whole item and after a delta (text items rebuilt, colors checked, bounded)', (src.match(/cleanHostMap\(/g) || []).length >= 4 && /if \(incoming\.type === 'map'\) incoming = cleanHostMap\(incoming\)/.test(src) && /if \(it\.type === 'map'\) cleanHostMap\(it\)/.test(src));
check('client: a snapshot without a usable appState is refused before anything is set; prototype keys are purged', /if \(!msg \|\| !msg\.appState \|\| typeof msg\.appState !== 'object' \|\| !msg\.appState\.campaigns/.test(src) && /\['__proto__', 'constructor', 'prototype'\]\.forEach/.test(src));
check('client: the join snapshot\'s system is re-cleaned as the players\' view before its characters are (a host\'s system is never rendered raw)', /function applySnapshot\(msg\)[\s\S]{0,9000}?cs\.system = snapSys; else delete cs\.system;[\s\S]{0,400}?cleanChar\(/.test(src) && /var snapSys = \(cs\.system && window\.wpFormula\) \? window\.wpSystemCore\.cleanSystem\(cs\.system, \{ F: window\.wpFormula, gmView: false, libCats: \{\} \}\) : null;/.test(src)
    && /else \{ var csys = window\.wpSystemCore\.cleanSystem\(msg\.system, \{ F: window\.wpFormula, gmView: false, libCats: \{\} \}\); if \(csys\) campS\.system = csys; \}/.test(src)
    && /gmView: false, pages: [^\n]*, libCats: window\.wpLibrary && window\.wpLibrary\.catsFor \? window\.wpLibrary\.catsFor\(\) : null \}\); if \(psys\) camp\.system = psys; else delete camp\.system;/.test(src));
check('wireConn: a message that throws never leaves applyingRemote on', /try \{ handleMessage\(d, conn\); \} catch \(e\)[^\n]*finally \{ net\.applyingRemote = false; \}/.test(src));
check('assets (client): prototype-free caches, own-key arrival check, size cap, old blob revoked, no outside URLs', /var assetCache = Object\.create\(null\)/.test(src) && /var assetPending = Object\.create\(null\)/.test(src) && /!own\(assetPending, msg\.path\)\) return;/.test(src) && /msg\.data\.byteLength > AUDIO_CAP/.test(src) && /URL\.revokeObjectURL\(assetCache\[msg\.path\]\)/.test(src) && /return ASSET_PLACEHOLDER;\s*\/\/ an absolute URL from a host/.test(src));
check('chat (client): only the synced host, shape-checked, text capped', /if \(conn\.peer !== net\.syncedPeer \|\| typeof msg\.text !== 'string' \|\| !msg\.from/.test(src) && /text: msg\.text\.slice\(0, 2000\)/.test(src));
check('rich text: the sanitiser drops the dangerous tags with their content and never keeps an event handler or a script-scheme link', /RICH_DROP = \/\^\(script\|style\|iframe\|object\|embed/.test(src) && /safeRichHref/.test(src) && /RICH_STYLE/.test(src));

/* ================= doc theming mid-session ================= */
check('docStyle: the campaign look syncs on every host save like the system (once per change, admitted peers only)', /net\.syncDocStyle = function\(force\)/.test(src) && /net\.syncDocStyle\(\);/.test(src) && /if \(c\.open && own\(net\.roster, c\.peer\)\) \{ try \{ c\.send\(msg\); \}/.test(src) && /net\._lastDocStyleSig = quickHash\(JSON\.stringify\(dsm\.docStyle\)\)/.test(src));
check('docStyle: a client takes it from the synced host only, for the hosted campaign, re-validated; a host has no branch for it', /msg\.type === 'docStyle' && net\.role === 'client'/.test(src) && /conn\.peer !== net\.syncedPeer \|\| net\.stream\) return;\n\s*if \(typeof msg\.campId !== 'string' \|\| msg\.campId !== state\.appState\.activeCampaignId\) return;\n\s*var campDS = campOf/.test(src) && /cleanDocStyle\(msg\.docStyle\)/.test(src) && !/msg\.type === 'docStyle' && net\.role === 'host'/.test(src));

/* ================= the audits' small follow-ups ================= */
check('door-req: a player toggles a door only on the map they are ON, not one they left a token on', /if \(profDR\.location && profDR\.location !== amDR\.id\) \{ denyDR\('far'\); return; \}/.test(src));
{
    const ioSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
    check('export: a campaign file never carries the players\' table keys (stripTableKeys on the campaign and everything scopes)', /function stripTableKeys\(payload\)/.test(ioSrc) && /delete p\.key/.test(ioSrc) && /payload = stripTableKeys\(clone\(state\.appState\)\)/.test(ioSrc) && /payload = stripTableKeys\(\{ activeCampaignId: camp\.id, campaigns: cc \}\)/.test(ioSrc));
    const wbSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    check('blasts: every push goes through pushBlast, which drops the oldest past BLAST_CAP', /function pushBlast\(b\) \{ blasts\.push\(b\); if \(blasts\.length > BLAST_CAP\)/.test(wbSrc) && (wbSrc.match(/\bblasts\.push\(/g) || []).length === 1);
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
    check('welcome: the profile boxes are filled from the stored profile even before net.js has loaded, and a welcome save never blanks a stored name', /function wcProfile\(\) \{\s*if \(window\.wpNet && window\.wpNet\.getProfile\) return window\.wpNet\.getProfile\(\);\s*try \{ var p = JSON\.parse\(localStorage\.getItem\('wp_profile'\)/.test(mainSrc) && /if \(name \|\| !\(wcProfile\(\)\.name \|\| ''\)\.trim\(\)\) patch\.name = name;/.test(mainSrc) && !/setProfile\(\{ name: \(nm && nm\.value \|\| ''\)\.trim\(\)/.test(mainSrc));
    check('Ctrl+K room jump: a joined player never switches to the data map', /if \(en\.roomId && it\.type === 'map' && !\(window\.wpNet && window\.wpNet\.foreign\)\)/.test(mainSrc));
}

/* ================= the roster reaches players again (1.5.0 regression from 9526489) + its sinks ================= */
const j = JSON.stringify;
{
    const threw = v => { try { packCheck(v); return false; } catch (e) { return true; } };
    check('packCheck: the harness refuses what BinaryPack refuses (no prototype, an own constructor or hasOwnProperty, nested) and passes plain data', threw(Object.create(null)) && threw({ a: [Object.create(null)] }) && threw({ constructor: { x: 1 } }) && threw({ hasOwnProperty: 1 }) && !threw({ a: [1, 'x', { b: null }], d: new Uint8Array(2) }) && !threw([])
        && threw({ rot: 1e300 }) && threw([Infinity]) && threw({ f: () => 1 }) && threw({ BYTES_PER_ELEMENT: 1 }) && !threw({ a: 1.5, b: -5, c: NaN, t: 1790000000000 }));
    const h = harness(); h.conn('pA'); h.conn('pB');
    const R = h.env.net.roster;
    R.pA = { id: 'u_a', name: 'Ann\u202e', color: '#12ab34', avatar: 'data:image/png;base64,AAAA', location: 'map_1', detached: false, stale: true, key: 'secret' };
    R.pB = { id: 'u_b', name: 'Bo', avatar: 'data:image/png;base64,x" onerror="alert(1)', location: null };
    R.constructor = { id: 'u_c', name: 'C' }; R.hasOwnProperty = { id: 'u_h', name: 'H' }; R['__proto__'] = { id: 'u_p', name: 'P' }; R.bad = { id: 'bad id!', name: 'X' };
    h.env.broadcast = (m, ex) => runBroadcast(h.env, m, ex);
    const cw = console.warn; console.warn = () => {}; runBroadcast(h.env, { type: 'roster', roster: R, away: {} }, null); console.warn = cw;   // the refusal is logged in production; quiet here
    check('roster: the old payload (the prototype-free map itself) reaches NO player — the bug, reproduced through the real broadcast()', !h.sent.some(s => s.m.type === 'roster'));
    const RR = runRoster(h.env), pay = RR.rosterPayload();
    check('roster: the payload is a plain array of entries rebuilt field by field — no peer-id keys, no stale or key, a bidi name cleaned, a quote-breaking avatar dropped, an invalid id skipped',
        Array.isArray(pay) && pay.length === 5 && !threw(pay) && j(pay.find(e => e.id === 'u_a')) === j({ id: 'u_a', name: 'Ann', location: 'map_1', detached: false, color: '#12ab34', avatar: 'data:image/png;base64,AAAA' })
        && j(pay.find(e => e.id === 'u_b')) === j({ id: 'u_b', name: 'Bo', location: null, detached: false }) && !pay.some(e => e.id === 'bad id!'), j(pay));
    RR.broadcastRoster();
    const got = h.sent.filter(s => s.m.type === 'roster');
    check('roster: broadcastRoster reaches every admitted player through the real broadcast(), with the away map', got.length === 2 && got.every(s => Array.isArray(s.m.roster) && s.m.away.u_a === 'map_1'), got.length);
    check('roster: net.roster itself stays prototype-free on the host (own() and the admission gate rely on it) and on every reset', /roster: Object\.create\(null\),/.test(src) && (src.match(/net\.roster = Object\.create\(null\);/g) || []).length >= 3);
}
{
    const hostile = [null, 5, [], { id: '__proto__', name: 'x' }, { id: 'constructor' }, { id: 'u_ok', name: '  Zed\u0007\u200b  ', color: 'red', avatar: 'data:image/png;base64,AA" onerror="x', location: '__proto__', detached: 'yes', extra: 1 },
        { id: 'u_ok', name: 'dup' }, { id: 'u_n', name: { toString: 0 } }, { id: 'u_long', name: 'x'.repeat(100), color: '#ABCDEF', avatar: 'data:image/webp;base64,QUJD', location: 'map_2', detached: true }];
    const cr = RC.cleanHostRoster(hostile);
    check('roster (client): a hostile roster is rebuilt — prototype-free, prototype ids and non-objects skipped, first of a duplicate kept, every field checked',
        Object.getPrototypeOf(cr) === null && Object.keys(cr).join() === 'u_ok,u_n,u_long' && j(cr.u_ok) === j({ id: 'u_ok', name: 'Zed', location: null, detached: false })
        && cr.u_n.name === 'Player' && cr.u_long.name.length === 40 && cr.u_long.color === '#ABCDEF' && cr.u_long.avatar === 'data:image/webp;base64,QUJD' && cr.u_long.location === 'map_2' && cr.u_long.detached === true, j(cr));
    const many = RC.cleanHostRoster(Array.from({ length: 100 }, (_, i) => ({ id: 'u_' + i, name: 'P' + i })));
    const old = RC.cleanHostRoster({ peerX: { id: 'u_x', name: 'X' } });
    check('roster (client): at most 64 players; a 1.4.9 host\'s peer-keyed object still reads; junk is an empty map', Object.keys(many).length === 64 && Object.keys(old).join() === 'u_x' && Object.keys(RC.cleanHostRoster('x')).length === 0 && Object.keys(RC.cleanHostRoster(null)).length === 0);
    const aw = RC.cleanHostAway(JSON.parse('{"u_a":"map_1","constructor":"map_2","bad id!":"m","u_b":5,"u_c":"__proto__","__proto__":"map_9"}'));
    check('roster (client): the away map keeps checked player ids to checked map ids only, prototype-free; an array is nothing', Object.getPrototypeOf(aw) === null && Object.keys(aw).join() === 'u_a' && aw.u_a === 'map_1' && Object.keys(RC.cleanHostAway(['x'])).length === 0, j(aw));
    check('roster (client): only the synced host\'s roster is taken, and it is rebuilt by the cleaners (never msg.roster itself)', /msg\.type === 'roster' && net\.role === 'client'\) \{[^\n]*\n\s*if \(conn\.peer !== net\.syncedPeer\) return;[^\n]*\n\s*net\.roster = cleanHostRoster\(msg\.roster\);[^\n]*\n\s*net\.away = cleanHostAway\(msg\.away\);/.test(src));
    check('roster (client): every teardown (reconnect given up, the GM ending it, a kick, a leave) clears the old table\'s players; a silent reconnect retry keeps the away map (tokens stay on their last maps)', (src.match(/net\.roster = Object\.create\(null\); net\.away = Object\.create\(null\);/g) || []).length === 2 && /net\.roster = Object\.create\(null\); if \(!silent\) net\.away = Object\.create\(null\);/.test(src));
    check('roster: a name keeps its joiners (an emoji sequence, a Persian ZWNJ) while bidi overrides, zero-width spaces and control characters go', H.cleanRosterName('\uD83D\uDC69\u200D\uD83D\uDCBB Sam') === '\uD83D\uDC69\u200D\uD83D\uDCBB Sam' && H.cleanRosterName('\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645') === '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645' && H.cleanRosterName('\u202eA\u200bB\u0007') === 'AB');
    {
        const ha = harness(); ha.camp.players = JSON.parse('{"u_a":{"lastMap":"map_1"},"constructor":{"lastMap":"map_2"},"hasOwnProperty":{"lastMap":"map_3"},"u_b":{"lastMap":{"x":1}},"u_c":{"lastMap":"__proto__"},"u_d":{},"u_e":null}');
        const away = runAway(ha.env);
        ha.conn('pZ'); ha.env.net.roster.pZ = { id: 'u_z', name: 'Z' }; ha.env.awayMap = () => runAway(ha.env); ha.env.broadcast = (m, ex) => runBroadcast(ha.env, m, ex);
        runRoster(ha.env).broadcastRoster();
        check('away (host): only checked player ids to checked map ids, in a PLAIN object — a "constructor" or "hasOwnProperty" record can no longer stop the roster reaching players', j(away) === j({ u_a: 'map_1' }) && Object.getPrototypeOf(away) === Object.prototype && ha.sent.filter(s => s.m.type === 'roster').length === 1, j(away));
    }
}
{
    const h = harness({ players: { u_q: { name: 'Q', key: 'q'.repeat(32) }, u_r: { name: 'R', key: 'r'.repeat(32) } } });
    h.hello(h.conn('q1'), { id: 'u_q', name: ' Q\u202e\u0007 ', avatar: 'data:image/png;base64,AAAA" onerror="alert(1)' }, { key: 'q'.repeat(32) });
    h.hello(h.conn('r1'), { id: 'u_r', name: 'R', avatar: 'data:image/png;base64,iVBORw0KGgo=' }, { key: 'r'.repeat(32) });
    const pq = h.admitted.find(a => a.prof.id === 'u_q'), pr = h.admitted.find(a => a.prof.id === 'u_r');
    check('hello: a valid image prefix with a quote-breaking tail is dropped (the whole data URL must be base64); a real one is kept; the name loses bidi and control characters', pq && !('avatar' in pq.prof) && pq.prof.name === 'Q' && pr && pr.prof.avatar === 'data:image/png;base64,iVBORw0KGgo=', j(h.admitted.map(a => a.prof)));
    check('setProfile keeps only a whole base64 image data URL too', /if \(typeof patch\.avatar === 'string'\) \{ if \(safeAvatar\(patch\.avatar\)\) p\.avatar = patch\.avatar;/.test(src));
}
{
    const rd = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
    const sbSrc = rd('sidebar.js'), wbSrc2 = rd('whiteboard.js'), inSrc = rd('inspector.js'), shSrc = rd('sheets.js');
    check('avatar sinks: no profile picture is pasted raw into markup anywhere (renderRoster and Maps presence escape it after the whole-URL check; the party strip and hover card use the same check)',
        !/\+ p\.avatar \+/.test(src) && /var avOk = safeAvatar\(p\.avatar\);/.test(src) && /src="' \+ escTextRoster\(p\.avatar\) \+ '"/.test(src)
        && /net\.safeAvatar\(p\.avatar\)/.test(sbSrc) && /src="' \+ esc\(p\.avatar\) \+ '"/.test(sbSrc) && !/src="' \+ p\.avatar/.test(sbSrc)
        && (wbSrc2.match(/window\.wpNet\.safeAvatar\(p\.avatar\)/g) || []).length === 1 && !/base64,\/\.test\(p\.avatar\)/.test(wbSrc2));   // one: the party strip (Onboarding F1c: the hover card no longer reads a profile picture at all)
    check('attribute sinks: roster ids and peer keys are escaped (the Properties owner picker, the whisper list, summon/kick, the Players panel)',
        /'<option value="'\+esc\(pid\)\+'"'/.test(inSrc) && /data-summon="' \+ escTextRoster\(peerKey\)/.test(src) && /data-kick="' \+ escTextRoster\(peerKey\)/.test(src) && /'<option value="' \+ escTextRoster\(e\[0\]\) \+ '">Whisper: '/.test(src)
        && !/data-(un)?ban="' \+ pid \+/.test(src) && !/data-forget="' \+ pid \+/.test(src));
    const stSrc = rd('settings.js'), mnSrc = rd('main.js'), chk = s => { const m = s.match(/return (typeof v === 'string' && v\.length <= 200000 && \/\^data:image[^\n]*?\.test\(v\));/); return m ? m[1] : null; };
    check('own-profile avatar: Settings\' preview and the welcome circle draw the stored picture as a node after the SAME whole-URL check as net.js (a restored prefs file never writes markup)',
        chk(src) && chk(src) === chk(stSrc) && chk(src) === chk(mnSrc) && /im\.src = safeAv\(p\.avatar\) \? p\.avatar : def;/.test(stSrc) && /avI\.src = wcSafeAvatar\(prof\.avatar\) \? prof\.avatar : wpDefaultAvatar\(prof\.color\);/.test(mnSrc)
        && !/innerHTML = '<img src="' \+ \(p\.avatar/.test(stSrc) && !/innerHTML = '<img src="' \+ \(prof\.avatar/.test(mnSrc) && !/innerHTML = '<img src="' \+ data \+/.test(mnSrc), [chk(src), chk(stSrc), chk(mnSrc)].join(' | '));
    check('snapshot: a player re-parents the decoded state, the campaign map and every campaign to a plain prototype (a packed "__proto__" re-parents a BinaryPack map), then drops the host\'s player records unread',
        /\[msg\.appState, msg\.appState\.campaigns\]\.forEach\(function\(o\) \{ if \(Object\.getPrototypeOf\(o\) !== Object\.prototype\) Object\.setPrototypeOf\(o, Object\.prototype\); \}\);/.test(src)
        && /forEach\(function\(cS\) \{\s*if \(!cS \|\| typeof cS !== 'object'\) return;\s*if \(Object\.getPrototypeOf\(cS\) !== Object\.prototype\) Object\.setPrototypeOf\(cS, Object\.prototype\);[^\n]*\n\s*delete cS\.players;/.test(src));
    { const o = {}; o['__proto__'] = { players: { u_x: {} } }; const before = o.players !== undefined; if (Object.getPrototypeOf(o) !== Object.prototype) Object.setPrototypeOf(o, Object.prototype); delete o.players;
      check('snapshot: (the technique) an object re-parented by an assigned "__proto__" key loses the inherited field once its prototype is reset', before && o.players === undefined); }
    check('Players panel: the join count is a number (a player record from a save or an import never writes markup); a roster location and an item lookup are escaped / own-keyed',
        /countOf\(p\.joinCount\) \+ ' join'/.test(src) && !/\(p\.joinCount \|\| 0\)/.test(src) && /function countOf\(v\) \{ var n = Math\.floor\(Number\(v\)\); return isFinite\(n\) && n > 0 \? n : 0; \}/.test(src)
        && /data-jump="' \+ escTextRoster\(p\.location\)/.test(src) && /own\(camp\.items, p\.location\) \? camp\.items\[p\.location\]/.test(src));
    check('snapshot: a player drops the host\'s player records unread (an honest host already strips them)', /delete cS\.players;/.test(src));
    check('broadcast: a send the packer refuses is logged, never silent', /try \{ c\.send\(msg\); \} catch \(e\) \{ try \{ console\.warn\('wire send failed'/.test(src));
    check('sheet: a player sees their own character\'s owner as their own name and anyone else\'s missing owner as "a player" — never a bare id; the GM\'s view is unchanged',
        /if \(away && c\.ownerId === myId\(\) && n\.getProfile\) \{ var pr = n\.getProfile\(\);/.test(shSrc) && /return pn\[c\.ownerId\] \|\| \(away \? 'a player' : c\.ownerId\);/.test(shSrc) && /function playerNames\(camp\) \{\s*var out = Object\.create\(null\);/.test(shSrc));
}

/* ================= no value can make a send fail silently ================= */
{
    const bare = src.match(/\.send\([^;]*\); \} catch \(e\) \{\}/g) || [];   // spans lines: a send whose catch sits lines below counts too
    check('every per-peer send that fails is logged (sendFailed), none swallowed by a bare catch (one-line or multi-line); a refused snapshot also tells the GM',
        bare.length === 0 && /catch \(e\) \{ sendFailed\(e, 'handout'\); return; \}/.test(src) && (src.match(/catch \(e\) \{ sendFailed\(e\); \}/g) || []).length >= 50 && /catch \(e\) \{ sendFailed\(e, 'snapshot'\); toast\('Could not send the campaign to '/.test(src) && /function sendFailed\(e, what\) \{ try \{ console\.warn\(/.test(src),
        bare.map(s => s.replace(/\s+/g, ' ').slice(0, 80)).join(' | '));
    check('player gates bound every number they store (rotation, facing, stroke geometry): a finite 1e300 is an "integer" the packer refuses',
        /w\.rot = Math\.max\(-1e6, Math\.min\(1e6, wr\)\); w\.front = Math\.max\(-1e6, Math\.min\(1e6, wf\)\);/.test(src) && /msg\.rot = Math\.max\(-1e6, Math\.min\(1e6, prot\)\); msg\.front = Math\.max\(-1e6, Math\.min\(1e6, pfr\)\);/.test(src)
        && /var num = function\(v, d\) \{ return \(typeof v === 'number' && isFinite\(v\)\) \? Math\.max\(-1e6, Math\.min\(1e6, v\)\) : d; \};/.test(src) && /init: Math\.max\(-1e6, Math\.min\(1e6, Number\(r\.init\) \|\| 0\)\)/.test(src));
    const wireNum = new Function((src.match(/function wireNum\(k, v\) \{[^\n]*\}/) || ['function wireNum(k, v) { return NaN; }'])[0] + '\nreturn wireNum;')();
    const bounded = JSON.parse('{"a":1e20,"b":[1e300,-1e20,5,1.5],"t":1790000000000,"s":"1e300"}', wireNum);
    const threw2 = v => { try { packCheck(v); return false; } catch (e) { return true; } };
    check('wire clones: sanitizeItem and sanitizeAppState bound every number as they copy (a GM box, an import or a formula past 64 bits can never stop a map, a join or a snapshot)',
        /var m = JSON\.parse\(JSON\.stringify\(item\), wireNum\);/.test(src) && /var c = JSON\.parse\(JSON\.stringify\(s\), wireNum\);/.test(src) && threw2({ a: 1e20 }) && !threw2(bounded)
        && bounded.a === 1e15 && bounded.b[0] === 1e15 && bounded.b[1] === -1e15 && bounded.b[2] === 5 && bounded.b[3] === 1.5 && bounded.t === 1790000000000 && bounded.s === '1e300', j(bounded));
    check('pos relay: the host rebuilds a player\'s move from its own fields before relaying it (extras a modified client adds never reach the table)', /msg = \{ type: 'pos', campId: msg\.campId, itemId: msg\.itemId, wbId: msg\.wbId, x: msg\.x, y: msg\.y, rot: msg\.rot, front: msg\.front, final: msg\.final === true \};[^\n]*\n\s*applyPosToDom\(msg\);\s*broadcastPos\(msg, conn, camp, map, w\);/.test(src));
    check('share: the size counted against a player\'s budget is real binary\'s (a decoded map claiming a negative byteLength is refused)', /if \(en\.data && !\(en\.data instanceof ArrayBuffer \|\| ArrayBuffer\.isView\(en\.data\)\)\) return;/.test(src));
    {
        const rd2 = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
        check('GM boxes: the Rotation box keeps one turn and the map scale a sane number (the wire refuses a whole number past 64 bits)', /var rn = \(parseInt\(v, 10\) \|\| 0\) % 360; if \(rn > 180\) rn -= 360; if \(rn <= -180\) rn \+= 360; w\.rot = rn;/.test(rd2('inspector.js')) && /if \(isFinite\(v\) && v > 0 && v <= 1e9\) m\.meta\.cellValue = v;/.test(rd2('whiteboard.js')));
    }
    check('Session Log: the entry kind in the class attribute is a known kind or "other" (an imported log cannot break out of it)', /<span class="log-kind k-' \+ \(Object\.prototype\.hasOwnProperty\.call\(_logKinds, e\.kind\) \? e\.kind : 'other'\) \+ '">'/.test(src) && !/log-kind k-' \+ escText\(e\.kind\)/.test(src));
}

/* ================= the local server: request bodies are decoded as UTF-8 across chunk boundaries ================= */
{
    const rdS = rel => fs.readFileSync(path.join(__dirname, '..', ...rel.split('/')), 'utf8');
    const srvs = [['system/resources/app/main.js', 6], ['tools/dev-server.js', 5]].map(([rel, n]) => { const s = rdS(rel); return { rel, n, readers: (s.match(/req\.on\('data'/g) || []).length, utf8: (s.match(/req\.setEncoding\('utf8'\); req\.on\('data', (c|chunk) => body \+= \1\);/g) || []).length, raw: (s.match(/body \+= (c|chunk)\.toString\(\)/g) || []).length }; });
    check('local server: every request body is read as UTF-8 text (setEncoding before the data handler) — a character split between two chunks can never be saved as \uFFFD (main.js and the dev server alike)',
        srvs.every(x => x.readers === x.n && x.utf8 === x.n && x.raw === 0), j(srvs));
    const { PassThrough } = require('stream'); const em = Buffer.from('a\u2014b \uD83D\uDC09', 'utf8');   // an em dash (3 bytes) and an emoji (4 bytes)
    const splitRead = (cut) => new Promise(res => { const req = new PassThrough(); let body = ''; req.setEncoding('utf8'); req.on('data', c => body += c); req.on('end', () => res(body)); req.write(em.slice(0, cut)); req.write(em.slice(cut)); req.end(); });
    pendingChecks.push(Promise.all([2, 3, 7, 8, 9].map(splitRead)).then(outs => check('local server: a body split inside an em dash or an emoji decodes whole', outs.every(o => o === 'a\u2014b \uD83D\uDC09'), j(outs))));
}

/* ================= threat marks from a player (5h Fold 3): the host's own gate, run on the real code ================= */
{
    const core = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js'), 'utf8').replace(/\r\n/g, '\n');
    const fb = core.slice(core.indexOf('// Stage 5h Fold 3: facing.'), core.indexOf('function makeResolver('));
    const FC = new Function('LIMITS', 'isObj', fb + '\nreturn { cleanThreats: cleanThreats };')({ threats: 6 }, v => !!v && typeof v === 'object' && !Array.isArray(v));
    const thSrc = between('// [netcheck:threats-start]', '// [netcheck:threats-end]', 'threats');
    const runTh = new Function('msg', 'conn', 'net', 'getActiveCampaign', 'SC', 'peerPaused', 'allow', 'own', 'window', 'render', 'saveRemoteSoon', thSrc + '\nreturn "ran";');
    const scen = (msg, o) => {
        o = o || {};
        const tok = (id, extra) => Object.assign({ id, isChar: true, charId: 'c_1', ownerId: 'u_p', x: 0, y: 0 }, extra || {});
        const camp = { id: 'camp1', activeItemId: 'm0', items: { m1: { type: 'map', whiteboard: [tok('t1', o.had ? { threats: o.had } : {}), tok('t2', { ownerId: 'u_q' }), tok('t3', { hidden: true }), { id: 'i1', type: 'image', ownerId: 'u_p' }] }, m2: { type: 'map', whiteboard: [tok('t9')] } } };
        const sent = [];
        const netX = { paused: !!o.paused, roster: { pA: { id: 'u_p', location: 'm1' } }, sendItem: (c, i) => sent.push([c, i]) };
        runTh(msg, { peer: 'pA' }, netX, () => camp, () => FC, () => !!o.peerPaused, () => !o.flood, H.own, { wpVtt: { campaignOn: () => !o.off } }, () => {}, () => {});
        const w = id => camp.items.m1.whiteboard.find(x => x.id === id) || camp.items.m2.whiteboard.find(x => x.id === id);
        return { w, sent };
    };
    const m = extra => Object.assign({ type: 'threats', campId: 'camp1', itemId: 'm1', wbId: 't1', threats: [120, 'x', 1e300, 180, 120] }, extra || {});
    const ok = scen(m()), none = r => r.sent.length === 0;
    check('threats (host): a player\'s marks land on their own shown character token on the map they are on, cleaned (whole degrees, no junk, no repeats), and the map goes out', j(ok.w('t1').threats) === '[120,180]' && j(ok.sent) === '[["camp1","m1"]]', j([ok.w('t1'), ok.sent]));
    const cleared = scen(m({ threats: [] }), { had: [60] });
    check('threats (host): an empty list clears the key', !('threats' in cleared.w('t1')) && cleared.sent.length === 1);
    const refused = [scen(m({ wbId: 't2' })), scen(m({ wbId: 't3' })), scen(m({ wbId: 'i1' })), scen(m({ itemId: 'm2', wbId: 't9' })), scen(m({ campId: 'other' })), scen(m(), { paused: true }), scen(m(), { peerPaused: true }), scen(m(), { off: true }), scen(m(), { flood: true }), scen(m({ wbId: 5 })), scen(m({ itemId: '__proto__' }))];
    check('threats (host): refused, silently — another player\'s token, a hidden token, a non-character item, a map they are not on, another campaign, the table or the player paused, Token facing off, a flood, a malformed message',
        refused.every(none) && !('threats' in refused[0].w('t2')) && !('threats' in refused[1].w('t3')) && !('threats' in refused[3].w('t9')), refused.map(r => r.sent.length).join());
    const same = scen(m({ threats: [60] }), { had: [60] });
    check('threats (host): an unchanged list sends nothing', same.sent.length === 0);
}

/* ================= status effects on the wire (5h): the host handler's gates, the per-peer projection ================= */
{
    const fxR = (() => { const i = src.indexOf('// [netcheck:charfx-start]'), k = src.indexOf('// [netcheck:charfx-end]'); return i >= 0 && k > i ? src.slice(i, k) : ''; })();
    const order = ['Sx.cleanCharEffect(msg); if (!qx) return;', "denyX('paused')", "denyX('slow')", "denyX('off')", "denyX('missing')", "denyX('owner')", 'Sx.applyEffectOp(campX.system, chX, qx.fieldId, qx, Fx, { player: true, view:', "conn.send({ type: 'char-ack', rid: qx.rid })", 'net.syncCharDelta(qx.charId, dX);'];
    let at = -1; const inOrder = order.every(s => { const p = fxR.indexOf(s, at + 1); if (p < 0) return false; at = p; return true; });
    check('char-effect (host): shape, pause, rate, feature, existence and ownership are checked in that order before the list\'s own rules; then store, ack, sync (behaviour: systemcheck runs this slice)', fxR.length > 0 && inOrder);
    check('char-effect (host): every projection carries the full library (a GM-only effect reaches its owner inline, never as a bare id); the probe that decides who sees a field is marked',
        /S\.charFor\(src, view, pid, \{ lib: libD, items: itD, full: camp\.system \}\)/.test(src) && /S\.charFor\(probe, view, pid, \{ probe: true \}\)/.test(src) && /charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt, full: fullSys \}\)/.test(src) && /SQ\.charFor\(srcQ, viewQ, pidQ, \{ lib: fxLib\(campQ\.system\), items: itemLib\(campQ\.system\), full: campQ\.system \}\)/.test(src)
        && /S\.charFor\(camp\.chars\[charId\], view, recipientId, \{ lib: lib, items: items, full: camp\.system \}\)/.test(src) && /S\.charFor\(src, view, src\.ownerId, \{ lib: lib \|\| null, items: items \|\| null, full: full \|\| null \}\)/.test(src));
    const ciR = (() => { const i = src.indexOf('// [netcheck:charitem-start]'), k = src.indexOf('// [netcheck:charitem-end]'); return i >= 0 && k > i ? src.slice(i, k) : ''; })();
    const ciOrder = ['Si.cleanCharItem(msg); if (!qi) return;', "denyI('paused')", "denyI('slow')", "denyI('off')", "denyI('missing')", "denyI('owner')", 'Si.applyRowOp(campI.system, chI, qi.fieldId, qi, Fi, { player: true, view:', "{ type: 'char-ack', rid: qi.rid }", 'net.syncCharDelta(qi.charId, dI);'];
    let ciAt = -1; const ciIn = ciOrder.every(s => { const p = ciR.indexOf(s, ciAt + 1); if (p < 0) return false; ciAt = p; return true; });
    check('char-item (host, Stage 6 F4a): shape, pause, rate, feature, existence and ownership are checked in that order before the list\'s own rules (applyRowOp on the players\' view); then store, ack, sync; a delta never sends a value raw (fail closed)',
        ciR.length > 0 && ciIn && /if \(values\[f\] === null\) sub\[f\] = null; else if \(proj && proj\.values\[f\] !== undefined\) sub\[f\] = proj\.values\[f\];/.test(src));
    check('throw-req (host, Stage 6 F4a): the throw names a row of a VISIBLE item list; the definition is read on the host through rowDef (a GM-only item or one with no blast is never thrown by a player)',
        /var fT = St\.fieldById\(campT\.system, msg\.fieldId\); if \(!fT \|\| fT\.kind !== 'item-list' \|\| fT\.vis !== 'all'\) return;/.test(src) && /var rdT = St\.rowDef\(campT\.system, rowT\), defT = rdT \? rdT\.def : null; if \(!defT \|\| defT\.vis === 'gm' \|\| !defT\.area\) return;/.test(src) && /vT\.find\(function\(r\) \{ return r && r\.hid !== 1 && St\.rowIdOf\(r\) === msg\.rowId; \}\)/.test(src));
    check('Stage 6: a joining player\'s client keeps the host\'s whole copy of every character from the snapshot, and a delta only updates that copy (never starts a partial one a refusal would read as "no value")',
        /charSessionReset\(\);\s*\n\s*Object\.values\(state\.appState\.campaigns \|\| \{\}\)\.forEach\(function\(cs\) \{ if \(cs && cs\.chars && typeof cs\.chars === 'object'\) Object\.keys\(cs\.chars\)\.forEach\(function\(id\) \{ noteHostCopy\(id, cs\.chars\[id\]\.values\); \}\); \}\);/.test(src)
        && /hb = _charHost\[msg\.id\] \|\| null;/.test(src) && !/_charHost\[msg\.id\] = \{\}/.test(src));
    check('Stage 6: the host\'s Undo window — every pickup opens or extends it, a drop inside it lowers its count and never closes it (it lapses)',
        /if \(gA\) \{ gA\.added \+= resI\.added; gA\.until = nowI \+ Si\.LIMITS\.undoGraceMs; \} else _rowGrace\[gkA\] = \{ until: nowI \+ Si\.LIMITS\.undoGraceMs, added: resI\.added \};/.test(ciR) && /else if \(grI && resI\.undone > 0\) grI\.added = Math\.max\(0, grI\.added - resI\.undone\);/.test(ciR) && !/delete _rowGrace\[gkI\]/.test(ciR));
    check('Stage 6 removal rules on the wire: a bound item\'s refusal and a cursed one\'s answer carry the GM\'s message, which the client cleans as text (cleanItemMsg) before a toast shows it; the host keys legacy GM-only rows before hosting sends anything',
        /conn\.send\(\{ type: 'char-deny', rid: qi\.rid, reason: 'stays', msg: resI\.msg \|\| '' \}\)/.test(ciR) && /conn\.send\(\(resI\.hid \|\| resI\.keptOn\) && resI\.msg \? \{ type: 'char-ack', rid: qi\.rid, msg: resI\.msg \} : \{ type: 'char-ack', rid: qi\.rid \}\)/.test(ciR)
        && /charPendingDone\(msg\.rid, msg\.type === 'char-ack', SC2\.cleanDenyReason\(msg\.reason\), SC2\.cleanItemMsg\(msg\.msg\)\)/.test(src) && /Sh\.stampRows\(campH\.system, campH\.chars \|\| \{\}\);[^\n]*\n\s*net\.applyingRemote = true; save\(true\);/.test(src));
}

// Stage 6 look fold: the players' view of a system carrying every look-fold key packs for the wire (no prototype-free object —
// the lesson of the roster bug), for both look test systems
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const errs = ['look-d20', 'look-3d6'].map(n => { try { const sys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(sys); return sys && sys.sheet && sys.sheet.look && sys.sheet.look.palette ? null : n + ': no palette'; } catch (e) { return n + ': ' + e.message; } }).filter(Boolean);
    check('look: the players\' view of both look test systems (a palette, and every later look key) packs for the wire', errs.length === 0, errs.join('; '));
    const errsH = ['hud-d20', 'hud-3d6', 'hud-bare'].map(n => { try { const sys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(sys); return sys && sys.sheet && sys.sheet.hud && Array.isArray(sys.sheet.hud.sections) ? null : n + ': no HUD'; } catch (e) { return n + ': ' + e.message; } }).filter(Boolean);
    check('HUD frame HF1: the players\' view of the three HUD test systems (the HUD a second layout of the sheet) packs for the wire — no prototype-free object in it', errsH.length === 0, errsH.join('; '));
    const trapP = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(trapP);
    check('HUD frame HF5a: the players\' view that goes over the wire carries a label naming a GM-only value scrubbed ("Trap save"), and the GM-only field\'s key nowhere in it', ((trapP.rolls.find(r => r.id === 'r_trap') || {}).label === 'Trap save') && JSON.stringify(trapP).indexOf('GMFig') < 0, JSON.stringify(trapP.rolls));
})());
/* ---- Onboarding F0: a player's live move (pos) — the same rules as a patch, and the role reset after a session ---- */
{
    const posSrc = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos');
    const runPos = new Function('env', 'msg', 'conn', 'var net = env.net, campOf = env.campOf, validKey = env.validKey, peerPaused = env.peerPaused, allow = env.allow, checkRoomHandouts = env.checkRoomHandouts, applyPosToDom = env.applyPosToDom, broadcastPos = env.broadcastPos, toast = env.toast, saveRemoteSoon = env.saveRemoteSoon, window = env.window, setTimeout = env.setTimeout;\n' + posSrc + '\nreturn handlePos(msg, conn);');
    const mk = () => {
        const log = { relayed: 0, dropped: 0, rooms: 0 };
        const camp = { items: { m1: { type: 'map', whiteboard: [{ id: 't_own', isChar: true, ownerId: 'u_a', x: 0, y: 0 }, { id: 't_hid', isChar: true, ownerId: 'u_a', hidden: true, x: 0, y: 0 }, { id: 't_oth', isChar: true, ownerId: 'u_b', x: 0, y: 0 }, { id: 't_obj', ownerId: 'u_a', x: 0, y: 0 }] },
                                m2: { type: 'map', whiteboard: [{ id: 't_far', isChar: true, ownerId: 'u_a', x: 0, y: 0 }] } } };
        const env = { net: { role: 'host', paused: false, roster: { peerA: { id: 'u_a', location: 'm1' } }, tokenDropped() { log.dropped++; } }, campOf: () => camp, validKey: k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(camp.items, k),
                      peerPaused: () => false, allow: () => true, checkRoomHandouts() { log.rooms++; }, applyPosToDom() {}, broadcastPos() { log.relayed++; }, toast() {}, saveRemoteSoon() {}, window: {}, setTimeout: f => f() };
        return { env, camp, log };
    };
    const t = (wbId, itemId, extra, tweak) => { const h = mk(); if (tweak) tweak(h.env); runPos(h.env, Object.assign({ type: 'pos', campId: 'c', itemId: itemId || 'm1', wbId, x: 50, y: 60, final: true }, extra || {}), { peer: 'peerA' }); const w = h.camp.items[itemId || 'm1'].whiteboard.find(x => x.id === wbId); return Object.assign({ moved: w.x === 50 }, h.log); };
    const own = t('t_own'), hid = t('t_hid'), oth = t('t_oth'), obj = t('t_obj'), far = t('t_far', 'm2'), truthy = t('t_own', 'm1', { final: 'yes' }), paused = t('t_own', 'm1', null, e => { e.peerPaused = () => true; });
    check('pos gate (F0): a player moves only a SHOWN CHARACTER token they own ON THE MAP THEY ARE ON — a hidden token, another player\'s, an item that is not a character, a copy on another map and a paused player never move, relay, travel or reveal a handout; only final === true travels',
        own.moved && own.relayed === 1 && own.dropped === 1 && own.rooms === 1 && [hid, oth, obj, far, paused].every(r => !r.moved && !r.relayed && !r.dropped && !r.rooms) && truthy.moved && truthy.dropped === 0 && truthy.rooms === 0, j([own, hid, oth, obj, far, truthy, paused]));
    const noLoc = t('t_own', 'm1', null, e => { e.net.roster.peerA.location = null; });
    const hW = mk(); hW.camp.items.m1.whiteboard.push({ id: 't_wait', waiting: 1, ownerId: 'u_a', x: 0, y: 0, rot: 30, front: 10 }, { id: 't_waitB', waiting: 1, ownerId: 'u_b', x: 0, y: 0 }, { id: 't_waitH', waiting: 1, ownerId: 'u_a', hidden: true, x: 0, y: 0 });
    ['t_wait', 't_waitB', 't_waitH'].forEach(id => runPos(hW.env, { type: 'pos', campId: 'c', itemId: 'm1', wbId: id, x: 50, y: 60, rot: 90, front: 45, final: true }, { peer: 'peerA' }));
    const wW = id => hW.camp.items.m1.whiteboard.find(x => x.id === id);
    check('pos gate (F1a): a player\'s own shown WAITING token moves and relays, but never turns — the host keeps its rotation and facing; another player\'s waiting token and a hidden one never move',
        wW('t_wait').x === 50 && wW('t_wait').y === 60 && wW('t_wait').rot === 30 && wW('t_wait').front === 10 && hW.log.relayed === 1 && wW('t_waitB').x === 0 && wW('t_waitH').x === 0, j([hW.camp.items.m1.whiteboard, hW.log]));
    check('pos gate (F0 review): a player with no location yet (joined while the GM was on a page) still moves their own shown token; the map rule applies once they have one', noLoc.moved && noLoc.relayed === 1, j(noLoc));
    const ioN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), wbN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
    check('undo + presence (F0): an undo strips a restored token\'s owner only when the player holds a live token of the SAME character (or same-named pet); a kept character\'s token shows only where its player is',
        /liveOwned\[grp\(w\)\] = 1/.test(ioN) && /if \(s && s\.isChar && s\.ownerId && liveOwned\[grp\(s\)\]\) delete s\.ownerId;/.test(ioN) && /var presOwner = item\.ownerId \|\| keptOwnerOf\(item\);/.test(wbN) && /absentOwner = item\.waiting \? [^\n]*: !window\.wpNet\.isPresent\(presOwner, activeMap\.id\);/.test(wbN));
    check('session end (F0): leaving a table resets net.role, the code and the last stage (a trailing comment had swallowed them since 92352e2)', /net\.active = false; net\.role = null; net\.code = null; net\.lastStage = null;   \/\//.test(src) && !/\/\/[^\n]*net\.role = null;/.test(src));
    check('throw-req (F0): a throw needs a shown token of THAT character on the map (a kept character has none of its own)', /w\.ownerId === profT\.id && w\.charId === msg\.charId; \}\)\) return;/.test(src));
    check('client (F0): a character copy that is no longer ours drops its queued edits BEFORE they are replayed (both the snapshot and a single copy)', /if \(outC\[id\]\.partial \|\| outC\[id\]\.ownerId !== net\.myId\) dropP\(id\); \}\);[^\n]*\n\s*campC\.chars = outC; Object\.keys\(outC\)\.forEach\(reapplyPending\);/.test(src) && /if \(c1\.partial \|\| c1\.ownerId !== net\.myId\) dropP\(c1\.id\); campC\.chars\[c1\.id\] = c1; noteHostCopy\(c1\.id, c1\.values\); reapplyPending\(c1\.id\);/.test(src));
    check('arrival (F0): ensurePlayerToken, Bring and the GM\'s walk through a portal all use the one resolver and the one chooser (no "first owned wins" demotion left)',
        (src.match(/S\.tokenSourceFor\(camp, /g) || []).length === 3 && (src.match(/ownedTokenPlan\(camp, \{ keep: /g) || []).length === 3 && !/slice\(1\)\.forEach\(function\(w\) \{ delete w\.ownerId; \}\)/.test(src));
}

/* ================= F0 sweep: gaps found beside the binding fold, each on the real code ================= */
const lineOf = k => { const i = src.indexOf(k); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); };
const ownKeySrc = [lineOf('function own('), lineOf('function validKey('), lineOf('function campOf(')].join('\n') + '\n';   // the real own-key one-liners
const fnSrc = (start, end, label) => { const i = src.indexOf(start), k = src.indexOf(end, i + 1); if (i < 0 || k < 0) throw new Error('netcheck: ' + label + ' not found in net.js'); return src.slice(i, k); };
// fold M2: sanitizeItem as it runs, with the two it calls: wireNum (above it) and wireWbItem (right after it)
const siSrc = () => {
    const a = src.indexOf('function sanitizeItem('), b = src.indexOf('\n}\n', src.indexOf('function wireWbItem(', a));
    if (a < 0 || b < a) throw new Error('netcheck: sanitizeItem and wireWbItem not found in net.js');
    return (src.match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0] + '\n' + src.slice(a, b + 3);
};
const mkConn = (peer, open) => ({ peer, open: open !== false, sent: [], send(m) { this.sent.push(m); } });
// the table's follow and the summons: a connection still waiting for the GM's Allow hears nothing, not even where the table is
{
    const stSrc = between('// [netcheck:stage-start]', '// [netcheck:stage-end]', 'stage');
    const setup = () => {
        const ensured = [], fx = [];
        const net = { conns: [mkConn('pA'), mkConn('pWait'), mkConn('pDet'), mkConn('constructor'), mkConn('pShut', false)], roster: { pA: { id: 'u_a' }, pDet: { id: 'u_d', detached: true }, pShut: { id: 'u_s' } }, sendFxArrival: (c, m) => fx.push([c.peer, m]) };
        const fns = new Function('net', 'own', 'ensurePlayerToken', 'sendFailed', stSrc + '\nreturn { stageConn, summonConn, followConns };')(net, H.own, (pid, map) => ensured.push([pid, map]), () => {});
        return { net, fns, ensured, fx, sentTo: p => net.conns.find(c => c.peer === p).sent };
    };
    const st = { campId: 'c1', itemId: 'm2' };
    const f = setup(), moved = f.fns.followConns(st);
    check('stage (host): the follow moves every admitted player still following — the stage message and the map\'s running weather reach them — and nobody else: not a peer waiting for the Allow, not a prototype-key peer, not a detached wanderer',
        moved === 2 && j(f.sentTo('pA')) === j([{ type: 'stage', stage: st }]) && f.sentTo('pWait').length === 0 && f.sentTo('constructor').length === 0 && f.sentTo('pDet').length === 0
        && j(f.fx) === j([['pA', 'm2']]) && f.net.roster.pA.location === 'm2' && f.net.roster.pShut.location === 'm2' && f.sentTo('pShut').length === 0 && !f.net.roster.pDet.location && j(f.ensured) === j([['u_a', 'm2'], ['u_s', 'm2']]), j([moved, f.net.conns.map(c => [c.peer, c.sent]), f.fx, f.ensured]));
    const g = setup(), wait = g.net.conns[1], det = g.net.conns[2];
    const pW = g.fns.summonConn(wait, st), pD = g.fns.summonConn(det, st);
    check('stage (host): a summon reaches an admitted player (personal: it ends their detour) and never a waiting peer — who gets no stage, no weather, no token',
        pW === null && wait.sent.length === 0 && !g.fx.some(x => x[0] === 'pWait') && j(g.ensured) === j([['u_d', 'm2']]) && pD === g.net.roster.pDet && pD.detached === false && pD.location === 'm2' && j(det.sent) === j([{ type: 'stage', stage: st, personal: true }]), j([wait.sent, det.sent, g.fx]));
    check('stage (host): the follow timer goes through followConns, every summon through summonConn, and a map\'s running weather is sent to an admitted peer only',
        /var moved = followConns\(s2\);/.test(src) && (src.match(/net\.conns\.forEach\(function\(c\) \{ summonConn\(c, stage\); \}\);/g) || []).length === 2 && /var p = summonConn\(c, stage\);/.test(src) && /var p = summonConn\(c, \{ campId: camp\.id, itemId: mapId \}\);/.test(src)
        && /net\.sendFxArrival = function\(conn, mapId\) \{[^\n]*\n\s*if \(!net\.active \|\| net\.role !== 'host' \|\| !conn \|\| !conn\.open \|\| !mapId \|\| !window\.wpFx \|\| !own\(net\.roster, conn\.peer\)\) return;/.test(src)
        && (src.match(/type: 'stage'/g) || []).length === 3);
}
// the GM's ping (fold P): net.sendFx to everyone on the effect's map, or to one player there (every connection of theirs), admitted peers only
pendingChecks.push((async () => {
    const urlF = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const FXC = await import(urlF('fxcore.js'));
    const sfSrc = between('// [netcheck:sendfx-start]', '// [netcheck:sendfx-end]', 'sendfx');
    const setup = (o) => {
        o = o || {};
        const failed = [];
        const conns = [mkConn('pA'), mkConn('pA2'), mkConn('pB'), mkConn('pC'), mkConn('pWait'), mkConn('constructor'), mkConn('pShut', false), mkConn('pDet')];
        if (o.throwB) conns[2].send = function() { throw new Error('gone'); };
        const net = { active: o.active !== false, role: o.role || 'host', conns, roster: { pA: { id: 'u_a', location: 'm1' }, pA2: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' }, pC: { id: 'u_c', location: 'm2' }, pShut: { id: 'u_s', location: 'm1' }, pDet: { id: 'u_d', location: 'm1', detached: true } } };
        new Function('net', 'own', 'window', 'sendFailed', sfSrc)(net, H.own, { wpFxCore: o.noCore ? undefined : FXC }, e => failed.push(e.message));
        return { net, failed, got: () => conns.filter(c => c.sent.length).map(c => c.peer).join(), sent: p => conns.find(c => c.peer === p).sent };
    };
    const ping = { kind: 'burst', look: 'ping', mapId: 'm1', x: 125, y: 75, r: 50, ms: 1600, evil: '<b>', type: 'nope' };
    const all = setup(); all.net.sendFx(ping);
    check('ping (host): to everyone on the map — every admitted, open connection whose player is on it (a player\'s second connection too, a wanderer there too), nobody on another map, never a peer waiting for the Allow nor a prototype-key peer',
        all.got() === 'pA,pA2,pB,pDet' && j(all.sent('pA')) === j([{ kind: 'burst', mapId: 'm1', x: 125, y: 75, look: 'ping', r: 50, ms: 1600, type: 'fx' }]), all.got());
    const one = setup(); one.net.sendFx(ping, 'u_a');
    const far = setup(); far.net.sendFx(ping, 'u_c');
    const nob = setup(); nob.net.sendFx(ping, 'u_zz');
    const proto = setup(); proto.net.sendFx(ping, 'constructor'); proto.net.sendFx(ping, '__proto__');
    check('ping (host): to one player — every connection of theirs on that map and nobody else; a player on another map gets nothing (the map test kept); an unknown or prototype name reaches nobody',
        one.got() === 'pA,pA2' && far.got() === '' && nob.got() === '' && proto.got() === '', j([one.got(), far.got(), nob.got(), proto.got()]));
    const bad = [5, '', {}, true, ['u_a']].map(t => { const s = setup(); s.net.sendFx(ping, t); return s.got(); });
    const undef = setup(); undef.net.sendFx(ping, undefined); const nul = setup(); nul.net.sendFx(ping, null);
    check('ping (host): a recipient that is not a profile id sends nothing at all (never everyone); absent or null is everyone',
        bad.every(g => g === '') && undef.got() === 'pA,pA2,pB,pDet' && nul.got() === 'pA,pA2,pB,pDet', j(bad));
    const stopAll = setup(); stopAll.net.sendFx({ kind: 'stop', what: 'weather' });
    const stopOne = setup(); stopOne.net.sendFx({ kind: 'stop' }, 'u_c');
    check('ping (host): a stop still clears every admitted player whatever their map, or the one named; waiting and prototype-key peers never hear it',
        stopAll.got() === 'pA,pA2,pB,pC,pDet' && j(stopAll.sent('pC')) === j([{ kind: 'stop', what: 'weather', type: 'fx' }]) && stopOne.got() === 'pC', j([stopAll.got(), stopOne.got()]));
    const nots = [{ role: 'client' }, { active: false }, { noCore: true }].map(o => { const s = setup(o); s.net.sendFx(ping); s.net.sendFx(ping, 'u_a'); return s.got(); });
    const refused = setup(); refused.net.sendFx({ kind: 'burst', look: 'pong', mapId: 'm1', x: 1, y: 1 }); refused.net.sendFx(null); refused.net.sendFx({ look: 'ping', mapId: 'm1', x: 1, y: 1 }, 'u_a');
    const thr = setup({ throwB: true }); thr.net.sendFx(ping);
    check('ping (host): only a host in a session sends; what cleanFx refuses goes nowhere; a send that throws is reported and the rest still hear it',
        nots.every(g => g === '') && refused.got() === '' && thr.got() === 'pA,pA2,pDet' && j(thr.failed) === j(['gone']), j([nots, refused.got(), thr.got(), thr.failed]));
    check('ping (host): the host still has no receive branch for an effect — the only fx branch is the client\'s, from the synced host, re-cleaned there',
        (src.match(/msg\.type === 'fx'/g) || []).length === 1 && /\} else if \(msg\.type === 'fx' && net\.role === 'client'\) \{\r?\n[^\n]*\r?\n[^\n]*\r?\n\s*if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer \|\| net\.stream \|\| !window\.wpFxCore \|\| !window\.wpFx\) return;\r?\n\s*var cfx = window\.wpFxCore\.cleanFx\(msg\); if \(cfx\) window\.wpFx\.receive\(cfx\);/.test(src));
})());
// the patch gate: own keys only, and a token (or a stroke) the GM locked is frozen for its player
{
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch');
    const cleanersSrc = src.slice(src.indexOf('var POSTURE_SET = '), src.indexOf('function sanitizeItem('));
    const stroke = (w, pid) => (w && w.type === 'path' && w.ownerId === pid && Array.isArray(w.pts)) ? { id: w.id, type: 'path', byPlayer: true, ownerId: pid, pts: w.pts, x: w.x || 0, y: w.y || 0 } : null;
    const runPatch = (camps, msg) => { try { return new Function('state', 'window', 'playerStroke', 'msg', 'prof', cleanersSrc + ownKeySrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true } }, stroke, msg, { id: 'u_p' }); } catch (e) { return 'threw: ' + e.message; } };
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
    const protoRuns = [['constructor', 'm1'], ['__proto__', 'm1'], ['hasOwnProperty', 'm1'], ['c1', 'constructor'], ['c1', 'toString'], ['c1', '__proto__'], [5, 'm1'], ['c1', 7]].map(([c, i]) => runPatch(mk(), { campId: c, itemId: i, item: { whiteboard: [{ id: 't1', x: 9, y: 9 }] } }));
    check('patch (host): a campaign or map id that is a prototype key (or not a string) names nothing — refused, never a throw', protoRuns.every(r => r === false), j(protoRuns));
}
// the live drag: the same lock rule
{
    const posSrc = fnSrc('function handlePos(msg, conn) {', '\n// Client: a player\'s threat marks', 'handlePos');
    const runPos = (msg) => {
        const map = { type: 'map', whiteboard: [{ id: 't1', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0 }, { id: 't2', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, locked: true }] };
        const out = { bcast: [], dom: [], saved: 0, dropped: 0 };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_p', location: 'm1' } }, tokenDropped: () => { out.dropped++; } };
        const state = { appState: { campaigns: { c1: { id: 'c1', items: { m1: map } } } } };
        new Function('state', 'net', 'peerPaused', 'allow', 'window', 'checkRoomHandouts', 'setTimeout', 'applyPosToDom', 'broadcastPos', 'toast', 'saveRemoteSoon', 'msg', 'conn', ownKeySrc + posSrc + '\nreturn handlePos(msg, conn);')(
            state, net, () => false, () => true, {}, () => {}, () => {}, m => out.dom.push(m), m => out.bcast.push(m), () => {}, () => { out.saved++; }, msg, mkConn('pA'));
        out.w = id => map.whiteboard.find(w => w.id === id);
        return out;
    };
    const ok = runPos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: 't1', x: 30, y: 40, rot: 90, front: 10, final: true });
    const lk = runPos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: 't2', x: 30, y: 40, rot: 90, front: 10, final: true });
    check('pos (host): a player\'s own token follows their drag; the one the GM locked does not move, turn or relay (and never fires travel)',
        ok.w('t1').x === 30 && ok.bcast.length === 1 && ok.dropped === 1 && lk.w('t2').x === 0 && lk.w('t2').rot === 0 && lk.w('t2').front === 0 && lk.bcast.length === 0 && lk.dom.length === 0 && lk.dropped === 0 && lk.saved === 0, j([ok.bcast, lk.bcast, lk.w('t2')]));
}
// threat marks (the sheet's facing dial) on a locked token
{
    const core = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js'), 'utf8').replace(/\r\n/g, '\n');
    const fb = core.slice(core.indexOf('// Stage 5h Fold 3: facing.'), core.indexOf('function makeResolver('));
    const FC = new Function('LIMITS', 'isObj', fb + '\nreturn { cleanThreats: cleanThreats };')({ threats: 6 }, v => !!v && typeof v === 'object' && !Array.isArray(v));
    const thSrc = between('// [netcheck:threats-start]', '// [netcheck:threats-end]', 'threats');
    const camp = { id: 'camp1', activeItemId: 'm0', items: { m1: { type: 'map', whiteboard: [{ id: 't4', isChar: true, ownerId: 'u_p', x: 0, y: 0, locked: true }] } } };
    const sent = [];
    new Function('msg', 'conn', 'net', 'getActiveCampaign', 'SC', 'peerPaused', 'allow', 'own', 'window', 'render', 'saveRemoteSoon', thSrc + '\nreturn "ran";')(
        { type: 'threats', campId: 'camp1', itemId: 'm1', wbId: 't4', threats: [120] }, { peer: 'pA' }, { paused: false, roster: { pA: { id: 'u_p', location: 'm1' } }, sendItem: (c, i) => sent.push([c, i]) }, () => camp, () => FC, () => false, () => true, H.own, { wpVtt: { campaignOn: () => true } }, () => {}, () => {});
    check('threats (host): a token the GM locked takes no threat marks from its player', sent.length === 0 && !('threats' in camp.items.m1.whiteboard[0]), j([sent, camp.items.m1.whiteboard[0]]));
}
// a player's portal crossing: a play map, and another one
{
    const trSrc = fnSrc('function hostTravel(conn, traveler, portal, fromMap) {', '\n// The portal item under a token\'s center', 'hostTravel');
    const runTr = (portalOver) => {
        const from = { id: 'm1', type: 'map', meta: { title: 'Here' }, rooms: [], whiteboard: [{ id: 'tok', isChar: true, ownerId: 'u_p', x: 0, y: 0, w: 60, h: 52 }] };
        const camp = { id: 'c1', items: { m1: from, m2: { id: 'm2', type: 'map', meta: { title: 'There' }, rooms: [], whiteboard: [] }, p1: { id: 'p1', type: 'planner', meta: { title: 'Notes' }, blocks: [] }, d1: { id: 'd1', type: 'doc', meta: { title: 'Page' }, blocks: [] } } };
        const traveler = { id: 'u_p', name: 'P', location: 'm1' }, conn = mkConn('pA'), portal = Object.assign({ id: 'po', x: 0, y: 0, w: 60, h: 52 }, portalOver);
        let ret;
        try {
            ret = new Function('getActiveCampaign', 'net', '_travelDenyLast', 'sendFailed', 'findLandingRoom', 'landingPoint', 'freeSpotNear', 'stepOffPortal', 'portalUnder', 'renderRoster', 'broadcastRoster', 'ensurePlayerToken', 'save', 'toast', 'logEvent', 'window', 'conn', 'traveler', 'portal', 'fromMap', ownKeySrc + trSrc + '\nreturn hostTravel(conn, traveler, portal, fromMap);')(
                () => camp, { travelLocked: false, broadcastItemFiltered: () => {} }, {}, () => {}, () => null, () => null, () => ({ x: 0, y: 0 }), () => {}, () => null, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, {}, conn, traveler, portal, from);
        } catch (e) { ret = 'threw: ' + e.message; }
        return { ret, sent: conn.sent, loc: traveler.location };
    };
    const good = runTr({ targetMapId: 'm2' });
    const bad = [{ targetMapId: 'p1' }, { targetMapId: 'd1' }, { targetMapId: 'm1' }, { targetMapId: 'constructor' }, { targetMapId: '__proto__' }, { targetMapId: 'toString' }].map(runTr);
    check('travel (host): a portal to another play map moves the player there; one to a planner, a handbook page, the map it stands on, or a prototype key moves nobody (as the GM\'s own walk-through has it)',
        good.ret === true && good.loc === 'm2' && good.sent.length === 1 && bad.every(b => b.ret === false && b.loc === 'm1' && b.sent.length === 0), j([good, bad]));
}
// Forget: asked first, and whole — a player at the table plays on, but nothing brings their record back until the GM's next Allow
{
    const fgSrc = between('// [netcheck:forget-start]', '// [netcheck:forget-end]', 'forget');
    const slSrc = fnSrc('function syncLastMaps() {', '\n// Who is on a given map', 'syncLastMaps');
    const run = (answer, fid, opts) => {
        opts = opts || {};
        const camp = { id: 'c1', players: { u_a: { name: 'Ana', key: 'k1', lastMap: 'm0' }, u_b: { name: 'Bo', key: 'k2' } } };
        const net = { role: 'host', roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' } }, forgotten: Object.create(null) };
        const out = { asked: [], toasts: [], saved: 0, redraws: 0, camp, net, waitRemoved: [], waitChanged: [] };
        out.approvedIds = { u_a: true };   // a yes to a connection that had dropped, not yet used
        const env = [net, H.own, (m, cb) => { out.asked.push(m); cb(answer); }, () => (opts.switched ? { id: 'c2' } : camp), () => { out.saved++; }, m => out.toasts.push(m), () => { out.redraws++; }, out.approvedIds, () => ({ playableChars: (c, pid) => pid === 'u_a' ? [{ id: 'c_1' }] : [] }), (c, pid) => { out.waitRemoved.push(pid); return ['m1']; }, (c, maps) => { out.waitChanged.push(maps); }];
        const fns = new Function('net', 'own', 'showConfirm', 'getActiveCampaign', 'save', 'toast', 'renderPlayersPanel', 'approvedIds', 'SC', 'removeWaiting', 'waitingChanged', fgSrc + '\n' + slSrc + '\nreturn { forgetPlayer, syncLastMaps };')(...env);
        fns.forgetPlayer(camp, fid);
        fns.syncLastMaps();
        return out;
    };
    const yes = run(true, 'u_a'), no = run(false, 'u_a');
    check('forget (host): asked first, naming them and saying they stay at the table; on yes the record goes for good — the roster sync that runs on every redraw no longer re-creates it while they play on — and a one-time approval still waiting goes too (Cancel keeps it)',
        yes.asked.length === 1 && /Forget Ana\?/.test(yes.asked[0]) && /stay at the table/.test(yes.asked[0]) && !('u_a' in yes.camp.players) && yes.net.forgotten.u_a === true && yes.saved === 1 && yes.redraws === 1
        && yes.camp.players.u_b.lastMap === 'm1' && !('u_a' in yes.approvedIds) && no.approvedIds.u_a === true, j([yes.asked, yes.camp.players, yes.approvedIds]));
    check('forget (F1a): a Forget takes the player\'s waiting token too (Cancel leaves it)', j(yes.waitRemoved) === j(['u_a']) && j(yes.waitChanged) === j([['m1']]) && no.waitRemoved.length === 0 && no.waitChanged.length === 0, j([yes.waitRemoved, no.waitRemoved]));
    const gone = run(true, 'u_a', { switched: true }), proto = run(true, 'constructor'), stranger = run(true, 'u_zz');
    check('forget (host): Cancel keeps them (and the sync still records where they are); an answer after a campaign switch changes nothing; a prototype-key or unknown id asks nothing',
        no.camp.players.u_a.key === 'k1' && no.camp.players.u_a.lastMap === 'm1' && !no.net.forgotten.u_a && no.saved === 0 && gone.camp.players.u_a.key === 'k1' && gone.saved === 0
        && proto.asked.length === 0 && stranger.asked.length === 0 && proto.saved === 0, j([no.camp.players, gone.camp.players, proto.asked]));
    check('forget (host): the Players panel\'s Forget goes through forgetPlayer, and only the GM\'s next Allow (admitPlayer) ends a forget, before the record is written again — and any admission uses up a one-time approval, so none is left over to let them straight back in',
        /\} else if \(btn\.dataset\.forget\) \{\s*forgetPlayer\(camp, btn\.dataset\.forget\);\s*return;/.test(src) && /delete net\.forgotten\[prof\.id\];[^\n]*\n\s*delete approvedIds\[prof\.id\];[^\n]*\n\s*var rec = camp\.players\[prof\.id\] = /.test(src) && /net\.forgotten = Object\.create\(null\);/.test(src)
        && /if \(!p \|\| !p\.id \|\| !p\.location \|\| net\.forgotten\[p\.id\]\) return;/.test(src));
}

// the heartbeat: a player waiting for the GM's Allow hears it too (it carries nothing of the table), so the wait is not taken for a lost GM
{
    const hbSrc = fnSrc('function hbTick() {', '\n// Where each player was last seen', 'hbTick');
    const conns = [mkConn('pA'), mkConn('pWait'), mkConn('pShut', false)], bc = [];
    const net = { active: true, role: 'host', conns, roster: { pA: { id: 'u_a' } } };
    new Function('net', 'setIndicator', 'lastSeen', 'HB_DEAD', 'HB_STALE', 'toast', 'renderRoster', 'sendFailed', 'broadcast', hbSrc + '\nreturn hbTick();')(net, () => {}, {}, 20000, 8000, () => {}, () => {}, () => {}, m => bc.push(m));
    check('heartbeat (host): every open connection hears it — an admitted player and one still waiting for the Allow — and nothing else goes to the waiting one; a closed connection is skipped',
        j(conns[0].sent) === '[{"type":"hb"}]' && j(conns[1].sent) === '[{"type":"hb"}]' && conns[2].sent.length === 0 && bc.every(m => m.type !== 'hb'), j([conns.map(c => c.sent), bc]));
}

// Onboarding F2b: a side about to freeze in a print dialog asks the other to wait (the hold), capped; the next word from it ends the wait
{
    const hSrc = between('// [netcheck:hold-start]', '// [netcheck:hold-end]', 'hold');
    const runHold = (role, ms) => { const st = { holdUntil: {}, hostHoldUntil: 0 }; new Function('msg', 'conn', 'net', 'holdUntil', 'HOLD_MAX', 'st', hSrc.replace('hostHoldUntil = Date.now() + msH', 'st.hostHoldUntil = Date.now() + msH'))({ type: 'hold', ms }, { peer: 'pA' }, { role }, st.holdUntil, 180000, st); return st; };
    const t0 = Date.now(), hOk = runHold('host', 60000), hBig = runHold('host', 1e12), hBad = runHold('host', 'x'), hStr = runHold('host', '60000'), hTrue = runHold('host', true), hNeg = runHold('host', -5), cOk = runHold('client', 30000);
    check('F2b the hold (run for real): the host waits for that player the time asked (3 minutes at most; nothing for a malformed or negative one); a player waits for their GM the same way',
        hOk.holdUntil.pA - t0 >= 59000 && hOk.holdUntil.pA - t0 <= 61000 && hBig.holdUntil.pA - t0 <= 181000 && hBig.holdUntil.pA - t0 >= 179000 && Math.abs(hBad.holdUntil.pA - Date.now()) < 1000 && Math.abs(hStr.holdUntil.pA - Date.now()) < 1000 && Math.abs(hTrue.holdUntil.pA - Date.now()) < 1000 && Math.abs(hNeg.holdUntil.pA - Date.now()) < 1000 && cOk.hostHoldUntil - t0 >= 29000 && !('pA' in cOk.holdUntil), j([hOk, cOk]));
    const hbSrcH = fnSrc('function hbTick() {', '\n// Where each player was last seen', 'hbTick');
    const tickHost = (seenAgo, holdFor) => { const conns = [mkConn('pA')], closed = []; conns[0].close = () => closed.push('pA'); const net = { active: true, role: 'host', conns, roster: { pA: { id: 'u_a', name: 'Pat' } } }, now = Date.now(), toasts = [];
        new Function('net', 'setIndicator', 'lastSeen', 'HB_DEAD', 'HB_STALE', 'toast', 'renderRoster', 'sendFailed', 'broadcast', 'holdUntil', hbSrcH + '\nreturn hbTick();')(net, () => {}, { pA: now - seenAgo }, 20000, 8000, t => toasts.push(t), () => {}, () => {}, () => {}, holdFor ? { pA: now + holdFor } : {});
        return { closed, toasts, stale: !!net.roster.pA.stale }; };
    const quiet = tickHost(30000, 0), held = tickHost(30000, 60000), heldOver = tickHost(30000, -1);
    check('F2b the host waits for a player who said they would freeze: silent 30 s, held — not dropped (marked not responding); not held, or the hold run out — dropped',
        quiet.closed.length === 1 && held.closed.length === 0 && held.stale === true && held.toasts.length === 0 && heldOver.closed.length === 1, j([quiet, held, heldOver]));
    const hpSrc = between('// [netcheck:holdpeers-start]', '// [netcheck:holdpeers-end]', 'holdpeers');
    const peers = (role) => { const conns = [mkConn('pA'), mkConn('pWait'), mkConn('pShut', false)], ticks = [], ls = { pA: 1, pWait: 1 }, st = { hostLastSeen: 1 };
        const net = { active: true, role, conns, roster: { pA: { id: 'u_a' } } };
        new Function('net', 'own', 'HOLD_MAX', 'sendFailed', 'lastSeen', 'hbTick', 'st', hpSrc.replace('hostLastSeen = now;', 'st.hostLastSeen = now;'))(net, H.own, 180000, () => {}, ls, () => ticks.push(1), st);
        const r1 = net.holdPeers(999999); net.heldDone(); return { conns, ticks, ls, st, r1 }; };
    const pH = peers('host'), pC = peers('client');
    check('F2b holdPeers: the host tells its admitted players only (a waiting one hears nothing but the heartbeat), a player tells their GM; the time capped; after the dialog this side\'s clocks restart and a heartbeat goes at once',
        j(pH.conns[0].sent) === j([{ type: 'hold', ms: 180000 }]) && pH.conns[1].sent.length === 0 && pH.conns[2].sent.length === 0 && pH.ticks.length === 1 && pH.ls.pA > 1 && pH.ls.pWait > 1 && pH.st.hostLastSeen > 1
        && j(pC.conns[0].sent) === j([{ type: 'hold', ms: 180000 }]) && pC.conns[1].sent.length === 0 && pC.r1 === true, j([pH.conns.map(c => c.sent), pC.conns.map(c => c.sent)]));
    const ns = src.replace(/\r\n/g, '\n'), ioS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
    check('F2b (source): any word from the other side ends its hold, and a player waits for a GM who said so; Save PDF holds the table too',
        /function noteSeen\(peerId\) \{ var now = Date\.now\(\); lastSeen\[peerId\] = now; delete holdUntil\[peerId\]; if \(net\.role === 'client'\) \{ hostLastSeen = now; hostHoldUntil = 0; \} \}/.test(ns) && /if \(age0 > HB_DEAD && !\(hostHoldUntil > now\)\) \{/.test(ns) && /hbTimer = null; lastSeen = \{\}; hostLastSeen = 0; holdUntil = \{\}; hostHoldUntil = 0;/.test(ns)
        && /if \(nP && nP\.holdPeers\) nP\.holdPeers\(180000\); try \{ window\.print\(\); \} finally \{ if \(nP && nP\.heldDone\) nP\.heldDone\(\); \}/.test(ioS));
}

// Stage 6 HUD frame (HF3): the HUDs' roll history — a local ring of what this machine saw, tagged here with the character; no wire change
{
    const rtSrc = between('// [netcheck:rolltag-start]', '// [netcheck:rolltag-end]', 'rolltag');
    // env: the active campaign (its id and characters), this machine's profile id, the dice's label cap, and the HUD hook's calls
    const mk = (chars, myId) => {
        const env = { camp: { id: 'k1', chars: chars || {} }, fired: [], net: { myId: myId || 'u_me' } };
        const win = { wpSheets: { rolled: (m, cid) => env.fired.push([m ? m.roll.id : null, cid]) }, wpDiceCore: { LIMITS: { label: 60 } } };
        Object.assign(env, new Function('getActiveCampaign', 'window', 'net', rtSrc + '\nreturn { ringPush, ringRepaint, ringReset, tagByName, chatHistoryOf, ring: function() { return rollRing; } };')(() => env.camp, win, env.net));
        return env;
    };
    const ME = { id: 'u_me', name: 'Me', gm: false }, GM = { id: 'u_gm', name: 'GM', gm: true }, MATE = { id: 'u_mate', name: 'Mate', gm: false };
    const R = (id, ts, as, from, scope) => ({ from: from || ME, text: '', scope: scope || 'global', ts, roll: { id, ts, as, expr: '1d20', from: from || ME }, res: { ok: true }, rollBad: null, toName: '' });
    const ids = l => l.map(x => x.roll.id).join(',');
    const e1 = mk();
    ['c_bren', 'bad', '__proto__', 'c_' + 'x'.repeat(25), 7, undefined].forEach((cid, i) => e1.ringPush(R('r' + i, 100 + i, 'Bren'), cid));
    check('HF3 ring: only a valid character id is kept as the tag (with no character of that name here, anything else is untagged); seq rises by one per roll; every live roll fires the HUD hook with its tag',
        j(e1.ring().map(e => e.cid)) === j(['c_bren', '', '', '', '', '']) && j(e1.ring().map(e => e.seq)) === j([1, 2, 3, 4, 5, 6]) && e1.net.rollSeq() === 6
        && e1.fired.length === 6 && j(e1.fired[0]) === j(['r0', 'c_bren']) && e1.fired[1][1] === '', j([e1.ring().map(e => e.cid), e1.fired]));
    const e2 = mk();
    e2.ringPush(R('a', 100), 'c_a'); e2.ringPush(R('c', 300), 'c_a'); e2.fired.length = 0;
    e2.ringPush(R('b', 200, 'Ana'), '', true); e2.ringPush(R('z', 50, 'Ana'), '', true); e2.ringPush(R('b', 200, 'Ana'), '', true); e2.ringPush(R('a', 100), '', true);
    check('HF3 ring: the join\'s history lands in time order, fires no hook (no NEW), and never doubles a roll already there — an earlier replay or a live roll (still in the ring after the chat let it go)',
        j(e2.ring().map(e => e.m.roll.id)) === j(['z', 'a', 'b', 'c']) && e2.fired.length === 0 && e2.ring().filter(e => e.replay).length === 2 && e2.ring().filter(e => e.m.roll.id === 'a').length === 1 && e2.ring()[1].replay === false, j([e2.ring().map(e => e.m.roll.id), e2.fired]));
    // tagging on arrival: the one character here a roll can have been made as (any of that name for the GM, else one its sender owns)
    const chars = { c_mine: { id: 'c_mine', name: 'Kael', ownerId: 'u_me' }, c_mate: { id: 'c_mate', name: 'Kael', ownerId: 'u_mate' }, c_bren: { id: 'c_bren', name: 'Bren', ownerId: 'u_me' }, c_npc: { id: 'c_npc', name: 'Orc' }, c_twin: { id: 'c_twin', name: 'Orc' }, bad_id: { name: 'Bren', ownerId: 'u_me' } };
    const e3 = mk(chars);
    e3.ringPush(R('m1', 10, 'Kael', ME), ''); e3.ringPush(R('t1', 20, 'Kael', MATE), ''); e3.ringPush(R('g1', 30, 'Bren', GM), ''); e3.ringPush(R('g2', 40, 'Kael', GM), ''); e3.ringPush(R('g3', 50, 'Orc', GM), ''); e3.ringPush(R('x1', 60, 'Bren', MATE), ''); e3.ringPush(R('p1', 70, undefined, ME), '');
    check('HF3 ring: another machine\'s roll is tagged on arrival — its sender\'s own character of that name, any of that name for the GM\'s roll; none or several (two named Kael for the GM, two NPCs named Orc), a sender who owns none of that name, or no "as" leave it untagged; a key that is not a character id is never a tag',
        j(e3.ring().map(e => e.cid)) === j(['c_mine', 'c_mate', 'c_bren', '', '', '', '']) && e3.tagByName({ roll: { as: 'Bren' }, from: ME }) === 'c_bren', j(e3.ring().map(e => e.cid)));
    check('HF3 rollsFor: newest first; a tagged roll lists for its character only; an untagged one by its name only when the GM or this machine\'s own player made it — a teammate\'s roll as a same-named character of theirs never shows in mine',
        ids(e3.net.rollsFor('c_mine', 'Kael', 0, 10)) === 'g2,m1' && ids(e3.net.rollsFor('c_mate', 'Kael', 0, 10)) === 'g2,t1' && ids(e3.net.rollsFor('c_bren', 'Bren', 0, 10)) === 'g1'
        && ids(e3.net.rollsFor('c_npc', 'Orc', 0, 10)) === 'g3' && ids(e3.net.rollsFor('c_zz', 'Zed', 0, 10)) === '' && ids(e3.net.rollsFor('c_zz', '', 0, 10)) === '', j([ids(e3.net.rollsFor('c_mine', 'Kael', 0, 10)), ids(e3.net.rollsFor('c_bren', 'Bren', 0, 10))]));
    chars.c_bren.name = 'Brennan';
    check('HF3 rollsFor: a roll tagged on arrival stays with its character after a rename (the GM\'s roll as Bren still lists for Brennan; a later character given the old name does not take it)',
        ids(e3.net.rollsFor('c_bren', 'Brennan', 0, 10)) === 'g1' && ids(e3.net.rollsFor('c_new', 'Bren', 0, 10)) === '');
    check('HF3 rollsFor: honours max (1..100, default 10) and a Clear\'s seq mark', ids(e3.net.rollsFor('c_mine', 'Kael', 0, 1)) === 'g2' && ids(e3.net.rollsFor('c_mine', 'Kael', 3, 10)) === 'g2' && e3.net.rollsFor('c_mine', 'Kael', 0, 0).length === 2);
    e3.camp = { id: 'k2', chars };
    check('HF3 rollsFor: another campaign\'s rolls never show', e3.net.rollsFor('c_mine', 'Kael', 0, 10).length === 0);
    const e4 = mk();
    e4.ringPush(R('old', 5000, 'Ana'), 'c_a'); const mark = e4.net.rollSeq(); e4.ringPush(R('skew', 1000, 'Ana'), 'c_a');
    const got = e4.net.rollsFor('c_a', 'Ana', mark, 10);
    check('HF3 rollsFor: a Clear, then a live roll with an OLDER host clock, still shows (Clear compares this machine\'s seq, never ts)', ids(got) === 'skew', ids(got));
    got[0].ts = 1; got[0].extra = 1;
    check('HF3 rollsFor: returns top-level copies (the ring\'s entry is untouched) carrying what the card reads', e4.ring()[1].m.ts === 1000 && !('extra' in e4.ring()[1].m) && got[0].fresh === true
        && j(Object.keys(got[0]).sort()) === j(['extra', 'fresh', 'from', 'res', 'roll', 'rollBad', 'scope', 'seq', 'toName', 'ts']));
    const e5 = mk();
    for (let i = 0; i < 305; i++) e5.ringPush(R('n' + i, i, 'Ana'), 'c_a');
    check('HF3 ring: capped at 300, the oldest going first; seq runs on', e5.ring().length === 300 && e5.ring()[0].m.roll.id === 'n5' && e5.net.rollSeq() === 305);
    e5.fired.length = 0; e5.ringRepaint();
    check('HF3 ring: a repaint calls the hook with no roll (every HUD\'s foot)', j(e5.fired) === j([[null, '']]));
    e5.fired.length = 0; e5.ringReset();
    check('HF3 ring: a reset empties it and repaints every foot, and seq runs on (a Clear mark from before hides nothing new)', e5.ring().length === 0 && j(e5.fired) === j([[null, '']]) && e5.net.rollSeq() === 305 && (e5.ringPush(R('after', 1, 'Ana'), 'c_a'), e5.net.rollsFor('c_a', 'Ana', 305, 10).length === 1));
    const log = [{ from: { id: 'u' }, text: 'hi', scope: 'global', ts: 1 }, { from: { id: 'g' }, text: 'psst', scope: 'whisper', ts: 2 }, R('w', 3, 'Ana', ME, 'whisper'), Object.assign(R('g1', 4, 'Ana'), { cid: 'c_a', seq: 9 })];
    const h = e5.chatHistoryOf(log);
    check('HF3 chatHistoryOf: whispers (and private rolls) never go to a joiner; a roll is rebuilt with exactly from, text, scope, ts, roll (no local tag rides along)',
        h.length === 2 && h[0].text === 'hi' && j(Object.keys(h[1])) === j(['from', 'text', 'scope', 'ts', 'roll']) && h[1].roll.id === 'g1', j(h));
    const many = []; for (let i = 0; i < 70; i++) many.push({ from: { id: 'u' }, text: 't' + i, scope: 'global', ts: i });
    check('HF3 chatHistoryOf: the last 60', e5.chatHistoryOf(many).length === 60 && e5.chatHistoryOf(many)[0].text === 't10');
    const dsr = fnSrc('function diceSessionReset(clearChat) {', '\n// Roll from here', 'diceSessionReset');
    const js = fnSrc('function joinSession(code, name, isRetry, probe) {', '\n    var profile = ', 'joinSession'), gu = fnSrc('function giveUpAndRestore(msg) {', '\n    load();', 'giveUpAndRestore');
    const outside = src.replace(rtSrc, '').replace(dsr, '');
    check('HF3 source: the join sends chatHistoryOf(chatLog); a replayed roll goes into the ring beside the chat; our pending request carries its character and the client reads it before clearing; the host tags a roll-req and a local roll with the character',
        /var recent = chatHistoryOf\(chatLog\);/.test(src) && /chatLog\.push\(hm\); ringPush\(hm, '', true\);/.test(src) && /if \(addedR\) ringRepaint\(\);/.test(src)
        && /_dicePending = \{ rid: rid, expr: expr, charId: o\.charId \|\| '', timer:/.test(src)
        && /var cidP = \(_dicePending && rc\.rid === _dicePending\.rid\) \? _dicePending\.charId : '';[^\n]*\n\s*if \(_dicePending && rc\.rid === _dicePending\.rid\) \{ clearTimeout\(_dicePending\.timer\); _dicePending = null;/.test(src)
        && /\{ bad: rp\.ok \? null : rp\.reason, cid: cidP \}/.test(src)
        && (src.match(/pushRoll\(recQ, resQ, '(whisper|global)', \{ cid: chQ \? q\.charId : '' \}\)/g) || []).length === 2
        && /pushRoll\(rec, res, scope, \{ toName: toName, cid: chR \? chR\.id : '' \}\);/.test(src)
        && /pushChat\(m\); ringPush\(m, opts && opts\.cid\);/.test(src));
    check('HF3 source: the ring is emptied when a session that clears the chat ends, when a fresh Join starts (never a retry or a generation probe, before the old table is left) and when a lost table is given up; seq is never reset; nothing else touches rollRing, so no send path carries it',
        /if \(clearChat\) \{[^\n]*rollRing = \[\]; ringRepaint\(\);/.test(dsr) && !/ringSeq = 0/.test(dsr) && !/rollRing|ringSeq/.test(outside)
        && /\n    if \(!isRetry && !probe\) ringReset\(\);[^\n]*\n    leaveSession\(true\);/.test(js) && /\n    ringReset\(\);/.test(gu) && (outside.match(/ringReset\(\)/g) || []).length === 2,
        (outside.match(/[^\n]*(rollRing|ringSeq)[^\n]*/) || [''])[0]);
}

// HUD frame (HF4b): a player's batched edit (a section's Reset all) — one message, one rate token, judged whole by the host
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const E = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ fieldId: 'f_' + i, value: i }, extra || {}));
    const okC = Sx.cleanCharEdits({ rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: 3, junk: 1 }, { fieldId: 'f_b', value: { cur: '4', junk: 1 } }, { fieldId: 'f_c', value: true }], extra: 1 });
    const badC = [
        { rid: 'e1', charId: 'c_1', values: [] }, { rid: 'e1', charId: 'c_1', values: E(11) }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: 1 }, { fieldId: 'f_a', value: 2 }] },
        { rid: 'bad rid!', charId: 'c_1', values: E(1) }, { rid: 'e1', charId: 'x', values: E(1) }, { rid: 'e1', charId: 'c_1', values: 'f_a' }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: [1] }] },
        { rid: 'e1', charId: 'c_1', values: [null] }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: '__proto__', value: 1 }] }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: NaN }] }, null
    ].map(m => Sx.cleanCharEdits(m));
    check('HF4b cleanCharEdits: one to ten values of one character, each field once, each value by char-edit\'s own shape rules (only the keys it knows); anything else is dropped',
        j(okC) === j({ rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: 3 }, { fieldId: 'f_b', value: { cur: 4 } }, { fieldId: 'f_c', value: true }] }) && Sx.cleanCharEdits({ rid: 'e1', charId: 'c_1', values: E(10) }).values.length === 10 && badC.every(x => x === null), j([okC, badC]));
    // the host's handler, sliced from net.js and run against the real systemcore
    const chSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits');
    const sys = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [
        { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, edit: 'owner', vis: 'all' },
        { id: 'f_ds', key: 'DS', kind: 'number', def: 0, min: 0, max: 3, edit: 'owner', vis: 'all', counter: true },
        { id: 'f_gm', key: 'G', kind: 'number', def: 0, edit: 'gm', vis: 'all' }] }, { F: Fx, gmView: true });
    const run = (msg, tweak) => {
        const sent = [], deltas = [], saves = [], env = { tokens: 0 }, o = { paused: false, peerPaused: false, on: true, limited: false, owner: 'u_a', char: true };
        if (tweak) tweak(o);
        const camp = { system: sys, chars: o.char ? { c_1: { id: 'c_1', name: 'A', ownerId: 'u_a', npc: false, values: { f_hp: { cur: 2 }, f_ds: 3 } } } : {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        const net = { paused: o.paused, roster: { pA: { id: o.owner } }, syncCharDelta: (id, d) => deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const lim = { allow: () => { env.tokens++; return o.limited ? 'slow' : true; } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'lim', 'var charLimit = lim, _charSlowSaid = {};\n' + chSrc)(
            msg, conn, net, () => Sx, { wpFormula: Fx, wpVtt: { on: k => k !== 'sheets' || o.on }, wpSheets: { charChanged() {} }, wpDiceCore: null }, () => o.peerPaused, () => camp, () => saves.push(1), () => {}, lim);
        return { sent, deltas, saves: saves.length, tokens: env.tokens, vals: camp.chars.c_1 ? camp.chars.c_1.values : null };
    };
    const M = values => ({ type: 'char-edits', rid: 'e1', charId: 'c_1', values });
    const good = run(M([{ fieldId: 'f_hp', value: { cur: 99 } }, { fieldId: 'f_ds', value: 0 }]));
    check('HF4b char-edits (host): a Reset all of two values takes ONE rate token and is stored whole — each value by its field\'s rules (the pool clamped to its max), ONE ack, ONE delta carrying both, one save; every message packs for the wire',
        good.tokens === 1 && j(good.sent) === j([{ type: 'char-ack', rid: 'e1' }]) && j(good.deltas) === j([['c_1', { f_hp: { cur: 10 }, f_ds: 0 }]]) && good.saves === 1 && j(good.vals) === j({ f_hp: { cur: 10 }, f_ds: 0 }), j(good));
    const oneBad = run(M([{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_gm', value: 5 }])), badVal = run(M([{ fieldId: 'f_ds', value: 0 }, { fieldId: 'f_hp', value: 'lots' }])), noField = run(M([{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_zz', value: 1 }]));
    const untouched = r => r.deltas.length === 0 && r.saves === 0 && j(r.vals) === j({ f_hp: { cur: 2 }, f_ds: 3 });
    check('HF4b char-edits (host): one value it may not set (a GM-edit field, a value that is not a number, a field that is not there) refuses the whole batch with ONE deny — nothing stored, no delta, no save',
        untouched(oneBad) && j(oneBad.sent) === j([{ type: 'char-deny', rid: 'e1', reason: 'field' }]) && untouched(badVal) && j(badVal.sent) === j([{ type: 'char-deny', rid: 'e1', reason: 'value' }]) && untouched(noField) && noField.sent.length === 1 && noField.sent[0].type === 'char-deny', j([oneBad.sent, badVal.sent, noField.sent]));
    const two = [{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_ds', value: 0 }];
    const gates = [['paused', o => { o.paused = true; }], ['paused', o => { o.peerPaused = true; }], ['slow', o => { o.limited = true; }], ['off', o => { o.on = false; }], ['missing', o => { o.char = false; }], ['owner', o => { o.owner = 'u_b'; }]].map(([why, tw]) => [why, run(M(two), tw)]);
    const junk = run({ type: 'char-edits', rid: 'e1', charId: 'c_1', values: E(11) });
    check('HF4b char-edits (host): the same gates as one char-edit, in its order — a paused table or player, the rate (one "slow" answer), the sheets feature, a character that is gone, one that is not theirs — each refused with ONE deny and nothing stored; a malformed batch is dropped unanswered',
        gates.every(([why, r]) => j(r.sent) === j([{ type: 'char-deny', rid: 'e1', reason: why }]) && r.deltas.length === 0 && r.saves === 0) && gates[0][1].tokens === 0 && gates[2][1].tokens === 1 && junk.sent.length === 0 && junk.tokens === 0,
        j(gates.map(([w, r]) => [w, r.sent, r.tokens])));
    const ceOrder = ['Sm.cleanCharEdits(msg); if (!qm) return;', "denyM('paused')", 'charLimit.allow(conn.peer, Date.now())', "denyM('off')", "denyM('missing')", "denyM('owner')", 'Sm.applyEdit(campM.system, workM,', "{ type: 'char-ack', rid: qm.rid }", 'net.syncCharDelta(qm.charId, dM);'];
    let ceAt = -1; const ceIn = ceOrder.every(t => { const p = chSrc.indexOf(t, ceAt + 1); if (p < 0) return false; ceAt = p; return true; });
    check('HF4b char-edits (source): the gates run in char-edit\'s order before any value is judged, the values are judged on a working copy and stored only after all pass; the client sends one message of the cleaned values',
        ceIn && /if \(!resM\.ok\) \{ denyM\(resM\.reason\); return; \}/.test(chSrc) && chSrc.indexOf('chM.values[k] = dM[k]') > chSrc.indexOf('for (var iM = 0;')
        && /net\.charEdits = function\(charId, list\) \{/.test(src) && (src.match(/type: 'char-edits'/g) || []).length === 1);
})());

// HUD frame (HF5b): a player's roll on the host reads CombatRound from the combat on the map they are on — the real roll-req branch, run with the
// real dicecore, formula engine and systemcore on the hud-d20 fixture; every message it sends packs for the wire
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rqSrc = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq');
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const gmSys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8')), { F: Fx, gmView: true });
    const run = o => {
        o = o || {};
        const tok = { id: 't1', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0 };
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_str: 14, f_level: 5 } } }, items: { m1: { type: 'map', whiteboard: o.noToken ? [] : [tok] }, m2: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: o.loc || 'm1' } }, combats: o.combats !== undefined ? o.combats : { m1: { mapId: 'm1', round: 3, turn: 0, rows: [] } } };
        const out = { table: [], sent: [], pushed: [] };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', expr: 'd20 + RoundNow', charId: 'c_a', label: 'Attack (+5)' }, o.msg || {});
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            msg, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope, x) => out.pushed.push([scope, x && x.cid]), () => {});
        return out;
    };
    const rd = (rec, n) => ((rec && rec.names) || []).filter(x => x.name === n).map(x => x.value)[0];
    const a = run(), b = run({ combats: {} }), c = run({ combats: { m2: { mapId: 'm2', round: 7, turn: 0, rows: [] } } }), d = run({ noToken: true }), e = run({ msg: { priv: 'gm' } }), f = run({ loc: 'm2' }), g = run({ msg: { expr: 'd20 + GMFig' } });
    check('HF5b roll-req (host, run for real): a player\'s roll reads CombatRound from the combat on the map they are on (3); 0 with no combat, a combat on another map, no token of theirs there, or when they are on another map; a private roll carries it too; a GM-only name is refused; the record keeps its label and character; every message packs',
        a.table.length === 1 && rd(a.table[0], 'RoundNow') === 3 && a.table[0].label === 'Attack (+5)' && a.table[0].as === 'Ana' && a.sent.length === 0 && j(a.pushed) === j([['global', 'c_a']])
        && rd(b.table[0], 'RoundNow') === 0 && rd(c.table[0], 'RoundNow') === 0 && rd(d.table[0], 'RoundNow') === 0 && rd(f.table[0], 'RoundNow') === 0
        && e.table.length === 0 && e.sent.length === 1 && e.sent[0].priv === 'gm' && rd(e.sent[0], 'RoundNow') === 3
        && g.table.length === 0 && g.sent.length === 1 && g.sent[0].type === 'roll-deny' && g.sent[0].reason === 'error',
        j([a, b.table, c.table, d.table, f.table, e.sent, g.sent]));
})());

// 1.5.0 derived GM-only values: the GM's own roll (net.diceRoll, run for real with the real dicecore, formula engine and systemcore) goes to the
// GM alone when it names a GM-only field anywhere or reads a value worked out from one; a player's own roll-req of such a value is refused
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), rqSrc = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq');
    const line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const sysD = Sx.cleanSystem({ v: 1, name: 'D', rolls: [], fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_b', key: 'Bonus', kind: 'formula', formula: 'GMFig + 1' }, { id: 'f_at', key: 'Atk', kind: 'formula', formula: 'Bonus + 2' },
        { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max' }, { id: 'f_sk', key: 'Sk', kind: 'skill', base: 'GMFig', def: 3 },
        { id: 'f_a', key: 'A', kind: 'number', def: 4 }, { id: 'f_fl', key: 'Flag', kind: 'number', def: 0 }, { id: 'f_fx', key: 'Effects', kind: 'effects' }],
        effects: [{ id: 'e_g', name: 'Veil', vis: 'gm', mods: [{ f: 'f_a', op: 'add', v: 2 }] }] }, { F: Fx, gmView: true });
    const run = (expr, o, env) => { env = env || {}; const out = { table: [], pushed: [], toasts: [], target: [] };
        const camp = { id: 'k', system: sysD, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: env.values || {} } } };
        const tgt = { peer: 'pA', open: true, send(m) { packCheck(m); out.target.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: env.active !== false, role: 'host', stream: false, conns: [tgt], roster: { pA: { id: 'u_a', name: 'Pat' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null } };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), k => (k === 'chatTo' ? { value: env.to || '' } : null), e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', (rec.names || []).map(n => n.name).join(',')]), () => {});
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o || {})); return out; };
    const priv = r => !!r.ret && r.ret.ok === true && r.ret.priv === true && r.table.length === 0 && r.target.length === 0 && j(r.pushed.map(p => p.slice(0, 2))) === j([['whisper', 'gm']]) && r.toasts.length === 1;
    const pub = r => !!r.ret && r.ret.ok === true && r.ret.priv === false && r.table.length === 1 && !r.table[0].priv && r.target.length === 0 && j(r.pushed.map(p => p.slice(0, 2))) === j([['global', '']]) && r.toasts.length === 0;
    const toastOf = n => 'Kept private: that roll uses a GM-only value (' + n + ').';
    const dG = run('d6 + GMFig'), dB = run('d6 + Bonus', { label: 'Attack (13)' }), dAt = run('d6 + Atk'), dHm = run('d6 + HP.max'), dHf = run('d6 + HP'), dHs = run('d6 + HP', {}, { values: { f_hp: { cur: 5 } } }), dSk = run('d6 + Sk'), dSr = run('d6 + Sk.ranks'), dA = run('d6 + A');
    check('derived GM-only values: the GM\'s own public roll (net.diceRoll, run for real) goes to the GM alone with the toast when it reads a GM-only value or one worked out from it — a formula, a formula over it, a pool whose max is one (its max; the pool full or stored), a skill — and stays public for a skill\'s ranks and a plain number; every message packs',
        [dG, dB, dAt, dHm, dHf, dHs, dSk].every(priv) && [dSr, dA].every(pub) && dG.toasts[0] === toastOf('GMFig') && dB.toasts[0] === toastOf('Bonus') && dAt.toasts[0] === toastOf('Atk') && dHm.toasts[0] === toastOf('HP.max') && dHf.toasts[0] === toastOf('HP') && dHs.toasts[0] === toastOf('HP') && dSk.toasts[0] === toastOf('Sk')
        && dA.table[0].names.length === 1 && dA.table[0].names[0].name === 'A' && dA.table[0].names[0].value === 4, j([dG, dB, dHs, dA].map(r => [r.ret, r.table.length, r.pushed, r.toasts])));
    const dIf = run('if(Flag, GMFig, 0) + d6'), dIf0 = run('if(0, GMFig, 1) + d6'), dIfD = run('if(d20 >= 21, GMFig, 0) + d6'), dIfB = run('if(Flag, Bonus, 0) + d6'), dW = run('d6 + Bonus', {}, { to: 'pA' }), dWa = run('d6 + A', {}, { to: 'pA' }), dOff = run('d6 + Bonus', {}, { active: false }), dPriv = run('d6 + Bonus', { priv: true }), dFx = run('d6 + A', {}, { values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } });
    check('derived GM-only values: a GM-only name the formula writes in a branch it does not take still keeps the roll private (the card shows the text); a derived value in such a branch is not read, so the roll stays public; a whisper of a derived value reaches no one (a plain one reaches its player); offline nothing is kept back or said; Private asks nothing; a GM-only effect still keeps it private',
        priv(dIf) && dIf.toasts[0] === toastOf('GMFig') && j(dIf.pushed[0][2]) === j('Flag') && [dIf0, dIfD].every(r => priv(r) && r.toasts[0] === toastOf('GMFig') && r.pushed[0][2] === '') && pub(dIfB) && dIfB.table[0].names.map(n => n.name).join(',') === 'Flag'
        && priv(dW) && dW.target.length === 0 && dWa.target.length === 1 && !dWa.target[0].priv && dWa.target[0].to === 'pA' && dWa.table.length === 0 && dWa.toasts.length === 0
        && dOff.ret.ok === true && dOff.ret.priv === false && dOff.toasts.length === 0 && dOff.table.length === 0 && j(dOff.pushed.map(p => p.slice(0, 2))) === j([['global', '']])
        && dPriv.ret.priv === true && dPriv.toasts.length === 0 && dPriv.table.length === 0 && priv(dFx) && dFx.toasts[0] === 'Kept private: a GM-only effect changes A.', j([dIf.pushed, dIf.toasts, dIfB.table, dW.target, dWa.target, dOff, dPriv.toasts, dFx.toasts]));
    const runQ = expr => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysD, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            { type: 'roll-req', rid: 'q1', expr: expr, charId: 'c_a' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {});
        return out; };
    const qB = runQ('d20 + Bonus'), qAt = runQ('d20 + Atk'), qA = runQ('d20 + A'), qSk = runQ('d20 + Sk'), qSkB = runQ('d20 + Sk.base'), qSkR = runQ('d20 + Sk.ranks');
    check('derived GM-only values: a player\'s own roll-req is worked out on the players\' view, so a value built on a GM-only field is refused ("GM only"), never rolled — a skill over one and its .base too (they read ranks + 0 there, a wrong total); a plain value and the skill\'s ranks go to the table',
        [qB, qAt, qSk, qSkB].every(q => q.table.length === 0 && q.sent.length === 1 && q.sent[0].type === 'roll-deny' && /GM only/.test(q.sent[0].message)) && qA.table.length === 1 && qA.sent.length === 0
        && qSkR.table.length === 1 && qSkR.sent.length === 0 && j((qSkR.table[0].names || []).map(n => [n.name, n.value])) === j([['Sk.ranks', 3]]), j([qB.sent, qAt.sent, qA.table.length, qSk.sent, qSk.table, qSkB.sent, qSkR.table]));
    // 1.5.0 GM-only rolls: the caller's gmOnly (a GM-only field's own roll, a GM-only roll, a GM-only item's damage) keeps a hosting GM's roll to the GM
    const toastG = l => 'Kept private: that roll is GM only' + (l ? ' (' + l + ')' : '') + '.';
    const gF = run('d100', { label: 'Hidden Sanity', gmOnly: true }), gNl = run('d6', { gmOnly: true }), gW = run('2d6', { label: 'Orb damage', gmOnly: true }, { to: 'pA' }), gOff = run('d100', { label: 'Hidden Sanity', gmOnly: true }, { active: false });
    const gP = run('d100', { label: 'Hidden Sanity', gmOnly: true, priv: true }), gV = run('d100', { label: 'Luck', gmOnly: false }), gB = run('d6 + GMFig', { label: 'Veiled', gmOnly: true }), gFx = run('d6 + A', { label: 'Hex', gmOnly: true }, { values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } });
    check('GM-only rolls: a roll the caller marks GM-only (a GM-only field\'s own roll, a GM-only roll, a GM-only item\'s damage; net.diceRoll run for real) goes to the hosting GM alone with one toast naming its label, before the whisper (the whispered player gets nothing); with no label the toast says so plainly; offline nothing is kept back or said; Private asks nothing; unmarked it stays public; a GM-only name or effect as well still makes one toast; every message packs',
        priv(gF) && gF.toasts[0] === toastG('Hidden Sanity') && priv(gNl) && gNl.toasts[0] === toastG('') && priv(gW) && gW.target.length === 0 && gW.toasts[0] === toastG('Orb damage')
        && gOff.ret.ok === true && gOff.ret.priv === false && gOff.toasts.length === 0 && gOff.table.length === 0 && j(gOff.pushed.map(p => p.slice(0, 2))) === j([['global', '']])
        && gP.ret.priv === true && gP.toasts.length === 0 && gP.table.length === 0 && pub(gV) && gV.table[0].label === 'Luck' && [gB, gFx].every(r => priv(r) && r.toasts[0] === toastG(r === gB ? 'Veiled' : 'Hex')),
        j([gF.toasts, gNl.toasts, gW.target, gW.toasts, gOff, gP.toasts, gV.table, gB.toasts, gFx.toasts]));
})());

// 1.5.0 GM-only rolls: a throw from the GM's sheet (whiteboard.js wpArmBlast, placeBlast, placeThrownBlast and resolveThrow, run for real with the
// real net.broadcastBlast): a GM-only item's blast reaches the players on that map unnamed and its damage roll carries gmOnly; a visible item's keeps both
pendingChecks.push((async () => {
    const wbT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const cut = (a, b) => { const i = wbT.indexOf(a), k = wbT.indexOf(b, i); if (i < 0 || k < 0 || wbT.indexOf(a, i + 1) >= 0) throw new Error('netcheck: whiteboard.js ' + a + ' not found once'); return wbT.slice(i, k); };
    const armSrc = cut('  window.wpArmBlast = function(ft, name, ctx) {', "  // A client's received shared blast"), placeSrc = cut('  function placeBlast(e) {', '  // A blast thrown from a character sheet'), throwSrc = cut('  // A blast thrown from a character sheet', '  var _lastThrowTx = null;');
    const bbSrc = between('// [netcheck:blast-start]', '// [netcheck:blast-end]', 'blast');
    const runT = (name, ctx, o) => { o = o || {}; const out = { sent: [], rolls: [], placed: [], applied: [] };
        const peer = id => ({ peer: id, open: true, send(m) { packCheck(m); out.sent.push([id, JSON.parse(JSON.stringify(m))]); } });
        const net = { active: true, role: 'host', conns: [peer('pA'), peer('pB')], roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm2' } } };
        const camp = { id: 'k', system: { combat: { blastAuto: o.auto || 'roll', hpResource: 'f_hp' } } }, map = { id: 'm1' };
        new Function('net', 'getActiveCampaign', 'sendFailed', bbSrc)(net, () => camp, e => { throw e; });
        const win = { wpNet: net, wpVtt: { on: () => true }, wpDice: { rollFor: (...a) => { out.rolls.push(JSON.parse(JSON.stringify(a))); return { ok: true, value: 7 }; } } };
        const api = new Function('window', 'document', 'toast', 'getActiveMap', 'getActiveCampaign', 'seatBlast', 'pushBlast', 'renderMeasures', 'syncBlastMenu', 'blastDistances', 'blastRadiusYd', 'applyBlastDamage', 'wbWrap', 'state',
            'var _armedThrow = null;\n' + placeSrc + throwSrc + armSrc + '\nreturn { place: placeBlast };')(
            win, { body: { classList: { add() {}, remove() {} } }, getElementById: () => null }, () => {}, () => map, () => camp, () => {}, b => out.placed.push(JSON.parse(JSON.stringify(b))), () => {}, () => {}, () => [], () => 1,
            (b, total, hp) => out.applied.push([total, hp]), { getBoundingClientRect: () => ({ left: 0, top: 0 }), scrollLeft: 0, scrollTop: 0, style: {} }, { zoomLevel: 1 });
        win.wpArmBlast(10, name, ctx); api.place({ clientX: 120, clientY: 80 }); return out; };
    const ctxT = (dmg, gm) => Object.assign({ charId: 'c_n', fieldId: 'f_it', rowId: 'w_1', by: 'Nix', damage: dmg }, gm === undefined ? {} : { gmOnly: gm });
    const blastT = name => [['pA', { type: 'blast', campId: 'k', mapId: 'm1', blast: { x: 120, y: 80, ft: 10, elev: 0, name: name, by: 'Nix' } }]];
    const tG = runT('Orb', ctxT('3d6', true)), tV = runT('Frag', ctxT('2d6', false)), tU = runT('Frag', ctxT('2d6')), tF = runT('Orb', ctxT('3d6', true), { auto: 'full' });
    check('GM-only rolls: a GM-only item thrown from the GM\'s sheet (whiteboard.js arm, place, throw and damage, run for real with the real net.broadcastBlast) reaches the players on that map as an unnamed blast (the thrower\'s name kept, the GM\'s own marker keeps the item\'s) and its damage roll carries gmOnly; a visible item\'s blast keeps its name and its roll is unmarked (as is a throw that says nothing); full auto still applies the total; a player on another map gets nothing; every message packs',
        j(tG.sent) === j(blastT('')) && tG.placed.length === 1 && tG.placed[0].name === 'Orb' && j(tG.rolls) === j([['c_n', '3d6', 'Orb damage', { gmOnly: true, dmg: true }]]) && tG.applied.length === 0
        && j(tV.sent) === j(blastT('Frag')) && j(tV.rolls) === j([['c_n', '2d6', 'Frag damage', { gmOnly: false, dmg: true }]]) && j(tU.sent) === j(blastT('Frag')) && j(tU.rolls) === j(tV.rolls)
        && j(tF.sent) === j(blastT('')) && j(tF.rolls) === j(tG.rolls) && j(tF.applied) === j([[7, 'f_hp']]), j([tG, tV.sent, tV.rolls, tU.rolls, tF.applied]));
})());

// 1.5.0 GM-only pools: a visible pool whose max is worked out from a GM-only field is GM-only as a whole. The host's char-edit, char-edits and
// char-effect (sliced, run for real with the real systemcore, formula engine and the host's own per-peer sync, also sliced) never let the hidden
// max reach a player: an edit of such a pool is refused (never clamped and answered), and what the host stores in it (an effect's clamp, the GM's
// own fill or damage) never travels, to its owner or a teammate
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const edSrc = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), msSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits');
    const fxSrc = between('// [netcheck:charfx-start]', '// [netcheck:charfx-end]', 'charfx'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_wis', key: 'Wis', kind: 'number', def: 5, edit: 'owner' }, { id: 'f_bon', key: 'Bonus', kind: 'formula', formula: 'GMFig + 1' },
        { id: 'f_vig', key: 'Vigor', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max', min: 0, edit: 'owner', hover: true },
        { id: 'f_gri', key: 'Grit', kind: 'resource', maxFormula: 'Bonus', def: 0, min: 0, edit: 'owner' },
        { id: 'f_mana', key: 'Mana', kind: 'resource', maxFormula: 'Wis * 2', def: 'max', min: 0, edit: 'owner', hover: true }, { id: 'f_fx', key: 'Fx', kind: 'effects', edit: 'owner' }],
        effects: [{ id: 'e_dr', name: 'Drain', mods: [{ f: 'f_vig', op: 'add', v: -5, part: 'max' }, { f: 'f_mana', op: 'add', v: -3, part: 'max' }] }] }, { F: Fx, gmView: true });
    const hideP = /f_vig|f_gri|Vigor|Grit/;
    const host = (src, msg) => {
        const camp = { id: 'k', system: sysP, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_vig: { cur: 20 }, f_gri: { cur: 4 }, f_mana: { cur: 10 } } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        const out = { answer: [], owner: [], mate: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + (src || ''))(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true });
        out.camp = camp; out.net = net; out.vals = camp.chars.c_1.values; return out;
    };
    const quiet = r => r.owner.length === 0 && r.mate.length === 0 && r.saves === 0 && j(r.vals) === j({ f_vig: { cur: 20 }, f_gri: { cur: 4 }, f_mana: { cur: 10 } });
    const E1 = (fid, cur) => ({ type: 'char-edit', rid: 'e1', charId: 'c_1', fieldId: fid, value: { cur } }), deny = r => j(r.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'field' }]);
    const eV = host(edSrc, E1('f_vig', 999)), eV1 = host(edSrc, E1('f_vig', 1)), eG = host(edSrc, E1('f_gri', 999)), eM = host(edSrc, E1('f_mana', 999));
    check('GM-only pools: a player\'s char-edit of a pool whose max is GM-only (directly, or through a visible formula) is refused like a GM-only field\'s ("field") whatever the value — never clamped against the hidden max and answered: nothing stored, sent or saved; a pool with a visible max is still clamped, acked and synced; every message packs',
        [eV, eV1, eG].every(r => deny(r) && quiet(r)) && j(eM.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(eM.vals.f_mana) === j({ cur: 10 }) && j(eM.owner) === j([{ type: 'charDelta', campId: 'k', id: 'c_1', values: { f_mana: { cur: 10 } } }]) && eM.saves === 1,
        j([eV.answer, eG.answer, eM.answer, eM.owner]));
    const B = values => ({ type: 'char-edits', rid: 'e1', charId: 'c_1', values }), bV = host(msSrc, B([{ fieldId: 'f_mana', value: { cur: 3 } }, { fieldId: 'f_vig', value: { cur: 999 } }])), bG = host(msSrc, B([{ fieldId: 'f_gri', value: { cur: 0 } }]));
    check('GM-only pools: a player\'s char-edits (a Reset all) naming such a pool is refused whole with ONE "field" deny, nothing stored, sent or saved',
        [bV, bG].every(r => deny(r) && quiet(r)), j([bV.answer, bV.owner, bG.answer]));
    const fX = host(fxSrc, { type: 'char-effect', rid: 'e1', charId: 'c_1', fieldId: 'f_fx', op: 'add', rowId: 'x_1', ref: 'e_dr' });
    const fOwn = fX.owner.length === 1 ? fX.owner[0] : {}, fMate = fX.mate.length === 1 ? fX.mate[0] : {};
    check('GM-only pools: an effect a player adds that lowers such a pool\'s max is stored with the host\'s clamp (Vigor 20 to 19, Mana 10 to 7) and acked, but the owner\'s delta carries the effect and Mana only, and a teammate\'s copy (hover fields, host-worked lines) nothing of Vigor',
        j(fX.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(fX.vals.f_vig) === j({ cur: 19 }) && j(fX.vals.f_mana) === j({ cur: 7 })
        && fOwn.type === 'charDelta' && j(Object.keys(fOwn.values || {}).sort()) === j(['f_fx', 'f_mana']) && j(fOwn.values.f_mana) === j({ cur: 7 })
        && fMate.type === 'char' && fMate.char.partial === true && !hideP.test(j(fMate.char)) && (fMate.char.lines || []).some(l => /^Mana 7/.test(l)), j([fX.answer, fX.vals, fX.owner, fX.mate]));
    const gm = host('');   // the GM's own changes: a fill, Reset all, damage from full — the host stores the number, then syncs it as every change is
    Object.assign(gm.vals, { f_vig: { cur: 24 }, f_gri: { cur: 13 } }); gm.net.syncCharDelta('c_1', { f_vig: { cur: 24 }, f_gri: { cur: 13 } });
    const gmOnlyOut = gm.owner.length + gm.mate.length;
    gm.vals.f_vig = { cur: 11 }; gm.vals.f_mana = { cur: 9 }; gm.net.syncCharDelta('c_1', { f_vig: { cur: 11 }, f_mana: { cur: 9 } }); gm.net.syncChars(); gm.net.syncChar('c_1');
    check('GM-only pools: a number the GM\'s machine stores in such a pool (a fill, Reset all, blast damage) reaches no one — alone, nothing is sent; beside a visible change, the owner gets only that; a whole resend (syncChars, syncChar) carries it to no one',
        gmOnlyOut === 0 && j(gm.owner[0]) === j({ type: 'charDelta', campId: 'k', id: 'c_1', values: { f_mana: { cur: 9 } } }) && gm.owner.length === 3 && gm.mate.length === 3 && !gm.owner.concat(gm.mate).some(m => hideP.test(j(m))), j([gm.owner, gm.mate]));
})());

// Turn-based combat T5b on the wire: a player's press on a timed effect's countdown (pause, resume, reset, dismiss) through the host's
// char-effect (the [netcheck:charfx] slice, run for real with the real systemcore): its owner may unless the campaign keeps timers the GM's;
// a teammate never; an unknown act never passes the shape. And the player's own machine (net.charEffect, sliced) sends the act, and holds
// back a press the campaign keeps the GM's
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const fxSrc = between('// [netcheck:charfx-start]', '// [netcheck:charfx-end]', 'charfx'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysQ = Sx.cleanSystem({ v: 1, name: 'Q', rolls: [], fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', edit: 'owner' }], effects: [{ id: 'e_b', name: 'Bless', dur: '2 turns', mods: [] }] }, { F: Fx, gmView: true });
    const row0 = () => [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: 0 } }];
    const host = (act, rules, from) => {
        const camp = { id: 'k', system: sysQ, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_fx: row0() } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        if (rules) camp.turnRules = rules;
        const out = { answer: [], owner: [], mate: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: from || 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const msg = { type: 'char-effect', rid: 'e1', charId: 'c_1', fieldId: 'f_fx', op: 'timer', rowId: 'x_1', act };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + fxSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true });
        out.list = camp.chars.c_1.values.f_fx; return out;
    };
    const same = r => j(r.list) === j(row0()) && r.owner.length === 0 && r.mate.length === 0 && r.saves === 0;
    const pA = host('pause'), pG = host('pause', { timers: 'gm' }), pO = host('pause', { timers: 'owner' }), pB = host('pause', null, 'pB'), pX = host('explode'), rA = host('reset'), dA = host('dismiss');
    const ownT = r => { const d = r.owner.find(m => m.type === 'charDelta'); return d && d.values && d.values.f_fx ? d.values.f_fx[0].t : undefined; };
    check('T5b on the wire (host): the owner\'s pause is stored, acked, saved and synced to them with the paused countdown (a teammate\'s copy carries none); with Effect timers "You only" refused as "field", nothing stored, sent or saved; a teammate\'s press refused as not theirs; an unknown act dropped unanswered; reset from now, dismiss drops the countdown',
        j(pA.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(pA.list[0].t) === j({ left: 12, at: 0, p: 1 }) && j(ownT(pA)) === j({ left: 12, at: 0, p: 1 }) && pA.saves === 1 && !/"t":/.test(j(pA.mate))
        && j(pG.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'field' }]) && same(pG) && j(pO.list[0].t) === j({ left: 12, at: 0, p: 1 })
        && j(pB.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'owner' }]) && same(pB) && pX.answer.length === 0 && same(pX)
        && rA.list[0].t.left === 12 && rA.list[0].t.at > 0 && !('t' in dA.list[0]) && j(dA.answer) === j([{ type: 'char-ack', rid: 'e1' }]), j([pA.answer, pA.list, pA.owner, pG.answer, pB.answer, pX.answer, rA.list, dA.list]));
    const ceSrc = src.replace(/\r\n/g, '\n'), ceA = ceSrc.indexOf('net.charEffect = function'), ceB = ceSrc.indexOf('// A player throws an item from their sheet');
    const client = (rules) => {
        const sent = [], camp = { id: 'k', system: Sx.cleanSystem(sysQ, { F: Fx, gmView: false }), chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: Date.now() } }] } } } };
        if (rules) camp.turnRules = rules;
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', 'charPendingDone', 'setTimeout', 'var _charPending = {};\n' + ceSrc.slice(ceA, ceB))(net, () => Sx, () => camp, { wpFormula: Fx, wpVtt: { on: () => true } }, () => {}, () => 0);
        const r = net.charEffect('c_1', 'f_fx', { op: 'timer', rowId: 'x_1', act: 'pause' });
        return { r, sent, t: camp.chars.c_1.values.f_fx[0].t };
    };
    const cO = client(null), cG = client({ timers: 'gm' });
    check('T5b on the wire (player): the press is applied at once (paused) and sent with its act and nothing else; kept the GM\'s, it is refused on the player\'s machine and nothing is sent',
        ceA > 0 && ceB > ceA && cO.r.ok && cO.t.p === 1 && cO.sent.length === 1 && j(Object.keys(cO.sent[0]).sort()) === j(['act', 'charId', 'fieldId', 'op', 'rid', 'rowId', 'type']) && cO.sent[0].act === 'pause' && cO.sent[0].op === 'timer'
        && cG.r.error === 'That list cannot be changed.' && cG.sent.length === 0 && !cG.t.p, j([cO, cG]));
    // the option mid-session: the host's sync (sliced) and a client's take (sliced), run for real
    const trS = between('// [netcheck:turnrulessync-start]', '// [netcheck:turnrulessync-end]', 'turnrulessync'), trR = between('// [netcheck:turnrules-start]', '// [netcheck:turnrules-end]', 'turnrules');
    const sentT = { a: [], w: [] }, campT = { id: 'k_1', turnRules: { walls: 'warn', timers: 'owner' } };
    const netT = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentT.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sentT.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'getActiveCampaign', 'own', 'sendFailed', trS)(netT, () => campT, (o, k) => Object.prototype.hasOwnProperty.call(o, k), e => { throw e; });
    netT.syncTurnRules(); netT.syncTurnRules(); campT.turnRules.timers = 'gm'; netT.syncTurnRules(); campT.turnRules.walls = 'off'; netT.syncTurnRules(); netT.role = 'client'; campT.turnRules.timers = 'owner'; netT.syncTurnRules();
    check('T5b the option mid-session (host): sent to admitted players once per change of who may press (a waiting peer gets nothing; a change to another rule sends nothing), the one word only; a client never sends one; it follows every host save and the snapshot sets its signature',
        j(sentT.a) === j([{ type: 'turnRules', campId: 'k_1', timers: 'owner' }, { type: 'turnRules', campId: 'k_1', timers: 'gm' }]) && sentT.w.length === 0
        && /net\.syncCampName\(\); \/\/ [^\n]*\n\s*net\.syncTurnRules\(\);/.test(src.replace(/\r\n/g, '\n')) && /var trm = net\.turnRulesMessage\(\); if \(trm\) net\._lastTurnRulesSig = trm\.campId \+ '\\n' \+ trm\.timers;/.test(src)
        && !/msg\.type === 'turnRules' && net\.role === 'host'/.test(src), j(sentT));
    const runT = (netC, msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', turnRules: { walls: 'warn' } } } } }; let drawn = 0;
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', trR)(netC, { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpSheetsSync: () => { drawn++; } });
        return [st.appState.campaigns.k_1.turnRules, drawn]; };
    const cl = { foreign: true, syncedPeer: 'h', stream: false }, TR = t => ({ type: 'turnRules', campId: 'k_1', timers: t });
    const tOk = runT(cl, TR('gm'), 'h'), tBad = runT(cl, TR('everyone'), 'h'), tOther = runT(cl, TR('gm'), 'x'), tCamp = runT(cl, { type: 'turnRules', campId: 'k_2', timers: 'gm' }, 'h'), tStream = runT({ foreign: true, syncedPeer: 'h', stream: true }, TR('gm'), 'h'), tProto = runT(cl, { type: 'turnRules', campId: '__proto__', timers: 'gm' }, 'h');
    check('T5b the option mid-session (player): taken from the synced host only, for the hosted campaign, gm or owner only; the other rules kept; the sheet redrawn; anything else changes nothing',
        j(tOk) === j([{ walls: 'warn', timers: 'gm' }, 1]) && [tBad, tOther, tCamp, tStream, tProto].every(r => j(r) === j([{ walls: 'warn' }, 0])), j([tOk, tBad, tOther, tCamp, tStream, tProto]));
})());

// The bell (the HUD's notes, 2026-09-26): the feeds on this machine, no wire change — an apply card (the host's postApply for the character it
// moved; a player's applyin by the name it carries) and a reminder (the host's postDue; a player's duein) each hand the character's bell a note
// through bellOut (sliced as they are, run with a recording bellOut)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Dx = await import(url('dicecore.js'));
    const paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), aiSrc = between('// [netcheck:applyin-start]', '// [netcheck:applyin-end]', 'applyin');
    const pdSrc = between('// [netcheck:postdue-start]', '// [netcheck:postdue-end]', 'postdue'), diSrc = between('// [netcheck:duein-start]', '// [netcheck:duein-end]', 'duein');
    const bells = [], bellOut = (cid, note, as) => bells.push([cid, note, as === undefined ? null : as]);
    const netH = { active: true, role: 'host', conns: [], roster: {} };
    const rec = { type: 'apply', id: 'r_a1', from: { id: 'u_gm', name: 'GM', gm: true }, lines: [{ n: 'HP', d: -3, v: 7 }], ts: 1, label: 'Hit', as: 'Pat' };
    const postApply = new Function('net', 'sendTable', 'sendFailed', 'peerProfileId', 'pushChat', 'logEvent', 'applyLine', 'bellOut', paSrc + '\nreturn postApply;')(netH, () => {}, e => { throw e; }, () => null, () => {}, () => {}, () => '', bellOut);
    postApply(Object.assign({}, rec), 'owner', { id: 'c_p', name: 'Pat', ownerId: 'u_a' }, null); postApply(Object.assign({}, rec), 'table', null, null);
    const hostApply = bells.splice(0);
    new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', aiSrc)(rec, { peer: 'H' }, { foreign: true, syncedPeer: 'H', stream: false }, () => Dx, () => {}, bellOut);
    new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', aiSrc)(Object.assign({}, rec, { as: undefined }), { peer: 'H' }, { foreign: true, syncedPeer: 'H', stream: false }, () => Dx, () => {}, bellOut);
    new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', aiSrc)(rec, { peer: 'X' }, { foreign: true, syncedPeer: 'H', stream: false }, () => Dx, () => {}, bellOut);
    const cliApply = bells.splice(0);
    check('The bell (wire feeds): the host\'s apply card hands the bell of the character it moved a note carrying the card (a card with no character: none); a player\'s machine hands its bell the cleaned card and the name it carries (none without a name, or from a peer that is not its host)',
        hostApply.length === 1 && hostApply[0][0] === 'c_p' && hostApply[0][1].apply.label === 'Hit' && cliApply.length === 1 && cliApply[0][0] === '' && cliApply[0][2] === 'Pat' && j(cliApply[0][1].apply.lines) === j(rec.lines) && cliApply[0][1].apply.from.gm === true, j([hostApply, cliApply]));
    const due = { type: 'due', id: 'r_d1', charId: 'c_p', act: 'r_re', why: 'turn', round: 2, ts: 1, from: { id: 'u_gm', name: 'GM', gm: true }, label: 'Regenerate' };
    new Function('rec', 'ch', 'toOwner', 'net', 'peerProfileId', 'sendFailed', 'pushChat', 'bellOut', pdSrc + '\npostDue(rec, ch, toOwner);')(Object.assign({}, due), { id: 'c_p', ownerId: 'u_a' }, false, netH, () => null, e => { throw e; }, () => {}, bellOut);
    const hostDue = bells.splice(0);
    const din = (m, peer) => new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', diSrc)(m, { peer: peer || 'host1' }, { foreign: true, syncedPeer: 'host1', stream: false }, () => Dx, () => {}, bellOut);
    din(due); din(Object.assign({}, due, { theirs: 1 })); din(due, 'other'); din(Object.assign({}, due, { charId: '../x' }));
    const cliDue = bells.splice(0);
    check('The bell (wire feeds): a reminder hands its character\'s bell a note on the host (the one it posted) and on a player\'s machine (the cleaned one; not the GM\'s copy marked theirs, not from another peer, not a malformed one)',
        hostDue.length === 1 && hostDue[0][0] === 'c_p' && hostDue[0][1].due.label === 'Regenerate' && cliDue.length === 1 && cliDue[0][0] === 'c_p' && cliDue[0][1].due.why === 'turn', j([hostDue, cliDue]));
    check('The bell (source): bellOut hands sheets.js the note (a failure never breaks the message path); the feeds are guarded so a harness without it runs as before',
        /function bellOut\(cid, note, as\) \{ try \{ if \(window\.wpSheets && window\.wpSheets\.bellNote\) window\.wpSheets\.bellNote\(cid, note, as\); \} catch \(e\) \{ console\.error\(e\); \} \}/.test(src)
        && (src.match(/typeof bellOut === 'function'/g) || []).length === 9);
})());

// Stage 6 library L1c: the item library's manifest never goes in the players' snapshot, and the host's projections read the library through
// a lookup (itemLib, run for real): the system's items as a map while there is no library on this machine, a lookup once there is
{
    const T = src.replace(/\r\n/g, '\n'), il = (T.match(/function itemLib\(sys\) \{[^\n]*\}/) || [''])[0];
    const mk = win => new Function('window', il + '\nreturn itemLib;')(win);
    const sysI = { items: [{ id: 'i_a', name: 'A' }, { id: 'bad', name: 'X' }] }, libE = { id: 'i_l', name: 'L' };
    const noLib = mk({})(sysI), empty = mk({ wpLibrary: { size: () => 0, entry: () => libE } })(sysI), withLib = mk({ wpLibrary: { size: () => 3, entry: id => (id === 'i_l' ? libE : null) } })(sysI);
    check('L1c itemLib: a map of the system\'s items (well-formed ids only) with no library here or an empty one; with one, a lookup — the system\'s own item first, then the library, else nothing',
        typeof noLib === 'object' && j(Object.keys(noLib)) === j(['i_a']) && typeof empty === 'object' && typeof withLib === 'function' && withLib('i_a').name === 'A' && withLib('i_l') === libE && withLib('i_x') === null && withLib('bad') === null);
    check('L1c the players\' snapshot drops the item library\'s manifest beside the sounds and music (a player holds only the copies on their rows)',
        /        delete camp\.music;[^\n]*\n        delete camp\.library;/.test(T));
}

// Stage 6 HUD H7: the apply action on the wire. The host's char-apply (sliced, run for real with the real systemcore, formula engine, the host's
// per-peer sync and the card's delivery, also sliced): the owner's press is worked out through THEIR view (a GM-only action, one naming a GM-only
// value, or one moving a GM-only pool is not there) and applied all or nothing whatever the pool's edit setting (owner, 2026-09-26); the card
// goes to the table only when every pool it moves is shown on hover (else the owner and the GM); and a client takes a card only from its host
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply'), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta'), aiSrc = between('// [netcheck:applyin-start]', '// [netcheck:applyin-end]', 'applyin');
    const sysA = Sx.cleanSystem({ v: 1, name: 'A', fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 4, vis: 'gm' },
        { id: 'f_hp', key: 'HP', label: 'Hit points', kind: 'resource', maxFormula: '10', def: 'max', min: -5, edit: 'gm', hover: true },
        { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '6', def: 'max', min: 0, edit: 'owner' },
        { id: 'f_in', key: 'Incoming', kind: 'number', def: 0, min: -99, max: 99, edit: 'owner' },
        { id: 'f_vig', key: 'Vigor', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max', min: 0, edit: 'owner', hover: true }],
        rolls: [
            { id: 'r_w', label: 'Apply wounds', apply: [{ f: 'f_hp', formula: 'Incoming' }] },
            { id: 'r_c', label: 'Costs', apply: [{ f: 'f_fp', formula: '2' }, { f: 'f_hp', formula: '1' }] },
            { id: 'r_s', label: 'Secret', apply: [{ f: 'f_hp', formula: 'GMFig' }] },
            { id: 'r_g', label: 'GM', apply: [{ f: 'f_hp', formula: '1' }], vis: 'gm' },
            { id: 'r_v', label: 'Vig', apply: [{ f: 'f_vig', formula: '1' }] },
            { id: 'r_z', label: 'Div', apply: [{ f: 'f_fp', formula: 'FP / (Incoming - Incoming)' }] },
            { id: 'r_roll', label: 'Roll', formula: 'd6' }] }, { F: Fx, gmView: true });
    const START = { f_in: 3, f_fp: { cur: 1 } };
    const host = (msg, o) => {
        o = o || {};
        const camp = { id: 'k', system: sysA, items: {}, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(o.vals || START)) }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} }, c_n: { id: 'c_n', name: 'Orc', ownerId: 'u_a', npc: true, values: {} } } };
        const out = { answer: [], owner: [], mate: [], wait: [], chat: [], logs: [], saves: 0, changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: !!o.paused, combats: {}, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }, { peer: 'pW', open: true, send: box(out.wait) }], roster: { pA: { id: 'u_a', name: 'Ana P', location: 'm1' }, pB: { id: 'u_b', name: 'Bo P' } } };
        const win = { wpFormula: Fx, wpVtt: { on: k => o.off !== k }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged: id => out.changed.push(id) }, wpDiceCore: null };
        const sendTable = (m, ex) => net.conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); });
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), o.lim || { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), sendTable, m => out.chat.push(JSON.parse(JSON.stringify(m))), (k, t) => out.logs.push(k + ': ' + t), r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out;
    };
    const A = (act, extra) => Object.assign({ type: 'char-apply', rid: 'a1', charId: 'c_1', act: act }, extra || {});
    const card = list => list.filter(m => m.type === 'apply'), still = r => j(r.vals) === j(START) && r.owner.length === 0 && r.mate.length === 0 && r.chat.length === 0 && r.saves === 0;
    const denied = (r, reason) => j(r.answer.map(m => m.type + ':' + m.reason)) === j(['char-deny:' + reason]) && still(r);
    const w1 = host(A('r_w', { label: 'Apply wounds' })), cW = card(w1.owner)[0] || {};
    check('H7 char-apply: the owner presses Apply wounds on their own character — HP is "GM edits", and the host still works it out and applies it (10 - Incoming 3 = 7): one ack, one save, the delta to the owner, the card to the whole table (HP is shown on hover) and to the host\'s chat and log, never to a peer still waiting',
        j(w1.answer) === j([{ type: 'char-ack', rid: 'a1' }]) && j(w1.vals.f_hp) === j({ cur: 7 }) && w1.saves === 1 && j(w1.changed) === j(['c_1'])
        && w1.owner.some(m => m.type === 'charDelta' && j(m.values) === j({ f_hp: { cur: 7 } }))
        && cW.from && j(cW.from) === j({ id: 'u_a', name: 'Ana P', gm: false }) && cW.as === 'Ana' && cW.label === 'Apply wounds' && j(cW.lines) === j([{ n: 'Hit points', d: -3, v: 7 }]) && !('priv' in cW) && Dx.cleanApply(cW) !== null
        && card(w1.mate).length === 1 && w1.wait.length === 0 && w1.chat.length === 1 && w1.chat[0].scope === 'global' && w1.logs.length === 1 && /^char: Ana P as Ana applied Apply wounds: Hit points/.test(w1.logs[0]),
        j([w1.answer, w1.vals, w1.owner, w1.mate, w1.chat, w1.logs]));
    const c1 = host(A('r_c')), cC = card(c1.owner)[0] || {};
    check('H7 char-apply: Apply costs moves both pools at once (FP 1 - 2 floors at 0, HP 10 - 1) and, since FP is not shown on hover, its card goes to the owner and the GM only (priv), never to a teammate; with no label sent, the action\'s own',
        j(c1.vals.f_fp) === j({ cur: 0 }) && j(c1.vals.f_hp) === j({ cur: 9 }) && cC.priv === 'gm' && cC.label === 'Costs' && j(cC.lines) === j([{ n: 'FP', d: -2, v: 0 }, { n: 'Hit points', d: -1, v: 9 }]) && card(c1.mate).length === 0 && c1.chat[0].scope === 'whisper',
        j([c1.vals, c1.owner, c1.mate]));
    const dS = host(A('r_s')), dG = host(A('r_g')), dV = host(A('r_v')), dN = host(A('r_nope')), dR = host(A('r_roll'));
    check('H7 char-apply: an action not in the player\'s own view — one naming a GM-only value, a GM-only one, one moving a GM-only pool, an unknown id, a roll — is refused ("field"): nothing stored, sent, shown or saved',
        [dS, dG, dV, dN, dR].every(r => denied(r, 'field')), j([dS.answer, dG.answer, dV.answer, dN.answer, dR.answer]));
    const dO = host(A('r_w', { charId: 'c_2' })), dNpc = host(A('r_w', { charId: 'c_n' })), dM = host(A('r_w', { charId: 'c_9' })), dP = host(A('r_w'), { paused: true }), dOff = host(A('r_w'), { off: 'sheets' });
    let asked = 0; const dSlow = host(A('r_w'), { lim: { allow: () => { asked++; return 'slow'; } } });
    check('H7 char-apply: another player\'s character or an NPC ("owner"), a character that is gone ("missing"), a paused table ("paused"), sheets off ("off") and a peer over the edit rate ("slow", one token) are refused with nothing moved',
        denied(dO, 'owner') && denied(dNpc, 'owner') && denied(dM, 'missing') && denied(dP, 'paused') && denied(dOff, 'off') && denied(dSlow, 'slow') && asked === 1,
        j([dO.answer, dNpc.answer, dM.answer, dP.answer, dOff.answer, dSlow.answer]));
    const dZ = host(A('r_w'), { vals: { f_in: 0, f_fp: { cur: 1 } } }), dE = host(A('r_z'));
    check('H7 char-apply: an amount of 0 is "none" (nothing to apply); an amount the engine refuses is "error" with its own message riding along; either way nothing moves',
        j(dZ.answer) === j([{ type: 'char-deny', rid: 'a1', reason: 'none' }]) && dZ.saves === 0 && dZ.chat.length === 0
        && j(dE.answer) === j([{ type: 'char-deny', rid: 'a1', reason: 'error', msg: 'Division by zero.' }]) && still(dE), j([dZ.answer, dE.answer]));
    const bad = [A('x'), A('r_w', { charId: 'nope' }), Object.assign(A('r_w'), { rid: 'a b' }), A('r_w', { label: 'x'.repeat(61) }), A('r_w', { label: 'a' + String.fromCharCode(0) })].map(m => host(m));
    check('H7 char-apply: a malformed request (not a roll id, a bad character id or rid, a label past 60 or with a control character) is dropped in silence', bad.every(r => r.answer.length === 0 && still(r)), j(bad.map(r => r.answer)));
    // the GM's own press goes through the same delivery: 'gm' reaches no one; 'owner' each of the owner's connections
    const gmOut = host(''); const Pn = new Function('net', 'sendTable', 'sendFailed', 'peerProfileId', 'pushChat', 'logEvent', 'applyLine', paSrc + '\nreturn postApply;');
    const sent = [], mk = p => ({ peer: p, open: true, send: m => sent.push(p + ':' + m.type + (m.priv ? ':priv' : '')) }), netG = { active: true, role: 'host', conns: [mk('pA'), mk('pA2'), mk('pB')], roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const chatG = [], postG = Pn(netG, (m, ex) => netG.conns.forEach(c => c.send(m)), e => { throw e; }, c => netG.roster[c.peer] ? netG.roster[c.peer].id : null, m => chatG.push(m.scope), () => {}, () => '');
    postG({ type: 'apply', id: 'r_1', from: { id: 'g', name: 'GM', gm: true }, lines: [{ n: 'HP', d: -1, v: 1 }], ts: 1 }, 'gm', { ownerId: 'u_a' }, null);
    postG({ type: 'apply', id: 'r_2', from: { id: 'g', name: 'GM', gm: true }, lines: [{ n: 'HP', d: -1, v: 1 }], ts: 1 }, 'owner', { ownerId: 'u_a' }, null);
    check('H7 postApply: a GM-only card reaches no one (the GM\'s chat alone, private); an owner card reaches each of the owner\'s connections, private, never another player',
        gmOut.answer.length === 0 && j(sent) === j(['pA:apply:priv', 'pA2:apply:priv']) && j(chatG) === j(['whisper', 'whisper']), j([sent, chatG]));
    // the late joiner's chat history: the host sends the public cards rebuilt (nothing local rides along), never a private one; a client takes
    // a public card cleaned, once, and never a private or malformed one (a hostile host's)
    const nsrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const hoAt = nsrc.indexOf('function chatHistoryOf(log) {'), chatHistoryOf = new Function(nsrc.slice(hoAt, nsrc.indexOf('\n', hoAt)) + '\nreturn chatHistoryOf;')();
    const pubRec = { type: 'apply', id: 'r_pub', from: { id: 'u_a', name: 'Ana P', gm: false }, label: 'Take 3', lines: [{ n: 'HP', d: -3, v: 7 }], ts: 3 }, prvRec = Object.assign({}, pubRec, { id: 'r_prv', priv: 'gm', ts: 4 });
    const sentH = chatHistoryOf([{ from: pubRec.from, text: '', scope: 'global', ts: 3, apply: pubRec, local: 1 }, { from: prvRec.from, text: '', scope: 'whisper', ts: 4, apply: prvRec }]);
    const hiA = nsrc.indexOf('var histD = window.wpDiceCore, histF = window.wpFormula;'), hiB = nsrc.indexOf("    } else if (msg.type === 'roster' && net.role === 'client') {");
    const runHist = log => { const box = {}; new Function('msg', 'window', 'box', 'ringPush', 'ringRepaint', 'renderChat', 'ui', 'var chatLog = [], chatUnread = 0;\n' + nsrc.slice(hiA, hiB) + '\nbox.chatLog = chatLog;')({ type: 'chat-history', log }, { wpDiceCore: Dx, wpFormula: Fx }, box, () => {}, () => {}, () => {}, () => null); return box.chatLog; };
    const gotH = runHist(sentH.concat([{ from: prvRec.from, text: '', scope: 'global', ts: 4, apply: prvRec }, { from: pubRec.from, text: '', scope: 'global', ts: 5, apply: Object.assign({}, pubRec, { id: 'r_bad', lines: [] }) }, sentH[0]]));
    check('H7 chat history: the host sends a public apply card rebuilt (no local keys) and never a private one; a late joiner takes the public card once, cleaned, and never a private or malformed one',
        j(sentH) === j([{ from: pubRec.from, text: '', scope: 'global', ts: 3, apply: pubRec }]) && gotH.length === 1 && j(gotH[0]) === j({ from: pubRec.from, text: '', scope: 'global', ts: 3, apply: Dx.cleanApply(pubRec) }), j([sentH, gotH]));
    const client = (msg, from, o) => { o = o || {}; const chat = []; new Function('msg', 'conn', 'net', 'DC', 'pushChat', aiSrc)(msg, { peer: from || 'H' }, { foreign: true, syncedPeer: 'H', stream: !!o.stream }, () => Dx, m => chat.push(m)); return chat; };
    const recOk = { type: 'apply', id: 'r_abc', from: { id: 'u_a', name: 'Ana P', gm: false }, as: 'Ana', label: 'Costs', lines: [{ n: 'FP', d: -2, v: 0 }], ts: 9, priv: 'gm', evil: '<b>' };
    const got = client(recOk), fromOther = client(recOk, 'X'), inStream = client(recOk, 'H', { stream: true }), badRec = client(Object.assign({}, recOk, { lines: [{ n: '', d: 1, v: 1 }] }));
    check('H7 a client takes an apply card only from its synced host, outside the stream window, cleaned (a private one as a whisper; nothing extra rides along); a malformed one is dropped',
        got.length === 1 && got[0].scope === 'whisper' && j(got[0].apply) === j(Dx.cleanApply(recOk)) && !('evil' in got[0].apply) && fromOther.length === 0 && inStream.length === 0 && badRec.length === 0, j(got));
})());

// Stage 6 HUD H7b: a list's apply action on the wire — the owner's press names its row ({ f, r, i }); the host finds the list and its action in
// THEIR view, works the amounts out through that row's names (a row they cannot see is gone), and a row of a GM-only item keeps the card between
// them and the GM (sliced char-apply + postApply, run for real; here the presser's connection is the table's own, so a card to them is seen)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply'), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysL = Sx.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 3, vis: 'gm' },
        { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, edit: 'gm' },
        { id: 'f_ep', key: 'EP', kind: 'resource', maxFormula: '6', def: 'max', min: 0, edit: 'owner', hover: true },
        { id: 'f_pw', key: 'Powers', kind: 'item-list', edit: 'owner', list: { noQty: true, stats: [{ key: 'FPCost' }, { key: 'EPCost' }], cols: [{ key: 'Sly', label: 'Sly', formula: 'Row.FPCost + GMFig' }],
            rolls: [{ label: 'Use', formula: '3d6' }, { label: 'Costs', apply: [{ f: 'f_fp', formula: 'Row.FPCost' }, { f: 'f_ep', formula: 'Row.EPCost' }] }, { label: 'Sly', apply: [{ f: 'f_ep', formula: 'Row.Sly' }] }, { label: 'Tire', apply: [{ f: 'f_ep', formula: 'Row.EPCost' }] }] } },
        { id: 'f_gl', key: 'GMList', kind: 'item-list', vis: 'gm', list: { rolls: [{ label: 'G', apply: [{ f: 'f_ep', formula: '1' }] }] } }],
        items: [{ id: 'i_push', name: 'Force Push', stats: { FPCost: 3, EPCost: 2 } }, { id: 'i_dark', name: 'Dark', vis: 'gm', stats: { FPCost: 1, EPCost: 1 } }] }, { F: Fx, gmView: true });
    const START = { f_fp: { cur: 5 }, f_pw: [{ id: 'w_1', defId: 'i_push' }, { id: 'w_2', defId: 'i_dark' }, { id: 'w_3', defId: 'i_push', hid: 1 }], f_gl: [{ id: 'w_g', defId: 'i_push' }] };
    const host = msg => {
        const camp = { id: 'k', system: sysL, items: {}, chars: { c_1: { id: 'c_1', name: 'Jed', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } } };
        const out = { owner: [], mate: [], chat: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conns = [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }];
        const net = { active: true, role: 'host', paused: false, combats: {}, conns, roster: { pA: { id: 'u_a', name: 'Jed P' }, pB: { id: 'u_b', name: 'Bo P' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conns[0], net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), (m, ex) => conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); }), m => out.chat.push(JSON.parse(JSON.stringify(m))), () => {}, r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out;
    };
    const R = (r, i, extra) => Object.assign({ type: 'char-apply', rid: 'a1', charId: 'c_1', row: { f: 'f_pw', r: r, i: i } }, extra || {});
    const typ = list => list.map(m => m.type + (m.reason ? ':' + m.reason : '') + (m.priv ? ':priv' : ''));
    const r1 = host(R('w_1', 1, { label: 'Force Push · Costs' })), c1 = r1.owner.find(m => m.type === 'apply') || {};
    check('H7b char-apply on a row: the owner\'s Apply costs on Force Push reads that row (FP 5 - 3, a "GM edits" pool, and EP 6 - 2) and is acked; the card, labelled with the item, goes to the owner and the GM only (FP is not on hover)',
        j(r1.vals.f_fp) === j({ cur: 2 }) && j(r1.vals.f_ep) === j({ cur: 4 }) && r1.owner.some(m => m.type === 'char-ack') && c1.label === 'Force Push · Costs' && c1.priv === 'gm' && j(c1.lines) === j([{ n: 'FP', d: -3, v: 2 }, { n: 'EP', d: -2, v: 4 }]) && !r1.mate.some(m => m.type === 'apply'),
        j([typ(r1.owner), typ(r1.mate), r1.vals]));
    const r2 = host(R('w_2', 3)), c2 = r2.owner.find(m => m.type === 'apply') || {};
    check('H7b char-apply on a row of a GM-only item (shown to its owner inline): applied, and its card goes to the presser and the GM alone, even though EP is shown on hover',
        j(r2.vals.f_ep) === j({ cur: 5 }) && c2.priv === 'gm' && !r2.mate.some(m => m.type === 'apply') && r2.chat.length === 1 && r2.chat[0].scope === 'whisper', j([typ(r2.owner), typ(r2.mate)]));
    const t1 = host(R('w_1', 3)), cT = t1.owner.find(m => m.type === 'apply') || {};
    check('H7b char-apply on a visible row moving a pool shown on hover: its card goes to the whole table', j(t1.vals.f_ep) === j({ cur: 4 }) && !('priv' in cT) && t1.mate.some(m => m.type === 'apply'), j([typ(t1.owner), typ(t1.mate)]));
    const dH = host(R('w_3', 1)), dRoll = host(R('w_1', 0)), dSly = host(R('w_1', 2)), dList = host(Object.assign(R('w_1', 1), { row: { f: 'f_zz', r: 'w_1', i: 1 } })), dNone = host(R('w_9', 1)), dGl = host(Object.assign(R('w_g', 0), { row: { f: 'f_gl', r: 'w_g', i: 0 } }));
    const quietL = r => j(r.vals) === j(START) && r.chat.length === 0 && r.saves === 0 && r.mate.length === 0;
    check('H7b char-apply refusals on a row: a kept curse\'s row or one that is not there ("missing"), a list roll, a list that is not theirs or a GM-only list\'s action ("field"), an amount through a column that is GM only in their view ("error", with its message) — nothing moved',
        j(typ(dH.owner)) === j(['char-deny:missing']) && j(typ(dNone.owner)) === j(['char-deny:missing']) && j(typ(dRoll.owner)) === j(['char-deny:field']) && j(typ(dList.owner)) === j(['char-deny:field']) && j(typ(dGl.owner)) === j(['char-deny:field'])
        && j(typ(dSly.owner)) === j(['char-deny:error']) && /GM only/.test(dSly.owner[0].msg || '') && [dH, dNone, dRoll, dList, dSly, dGl].every(quietL),
        j([dH.owner, dNone.owner, dRoll.owner, dList.owner, dSly.owner]));
    const nsrcL = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), caAt = nsrcL.indexOf('net.charApply = function(charId, actId, label, row) {'), caSrc = nsrcL.slice(caAt, nsrcL.indexOf('\n};', caAt) + 3);
    const clientReq = (calls, o) => { o = o || {}; const sent = [], pend = {}, camp = { system: sysL, chars: { c_1: { id: 'c_1', ownerId: 'u_a' }, c_2: { id: 'c_2', ownerId: 'u_b' } } }, conn = { peer: 'H', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', myId: 'u_a', conns: [conn] };
        const run = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', caSrc + '\nreturn net.charApply;')(netC, () => Sx, () => camp, { wpVtt: { on: () => true } }, pend, () => {}, () => 0);
        const res = calls.map(a => run.apply(null, a)); return { sent, res }; };
    const cr = clientReq([['c_1', null, 'x'.repeat(70), { f: 'f_pw', r: 'w_1', i: 1 }], ['c_1', 'r_x', 'Again']]), cr2 = clientReq([['c_1', 'r_x', 'Take 3']]), cr3 = clientReq([['c_2', 'r_x', 'Nope']]);
    check('H7b net.charApply (the player\'s request, run for real): a list action sends its row ({ f, r, i }) and no act, the label cut to 60; a system action sends its id; a second press while one waits is held; another player\'s character is refused',
        cr.sent.length === 1 && j(Object.keys(cr.sent[0]).sort()) === j(['charId', 'label', 'rid', 'row', 'type']) && j(cr.sent[0].row) === j({ f: 'f_pw', r: 'w_1', i: 1 }) && cr.sent[0].label.length === 60 && Sx.cleanCharApply(cr.sent[0]) !== null
        && cr.res[1].error === 'Waiting for the GM to apply the last one.' && j(cr2.sent) === j([{ type: 'char-apply', rid: cr2.sent[0].rid, charId: 'c_1', act: 'r_x', label: 'Take 3' }]) && cr3.sent.length === 0 && cr3.res[0].error === 'That character is not yours.',
        j([cr.sent, cr.res, cr2.sent, cr3.res]));
})());

// Stage 6 HUD R1: a roll's consequences on the wire. A player's roll that names its entry is rebuilt by the host from the entry's own formula
// (their modifier and advantage as data) — a made-up formula is refused, so a hit cannot be faked; its consequences land on the host's copy through
// the player's own view (success, failure, always; Set to), with one delta. The GM's own roll applies them where it is made (sliced, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src2 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src2.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src2.slice(i, src2.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysT = Sx.cleanSystem({ v: 1, name: 'T', fields: [
        { id: 'f_hits', key: 'Hits', kind: 'number', def: 0, min: 0, max: 9, edit: 'gm' }, { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '10', min: 0, def: 'max' }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }],
        rolls: [
            { id: 'r_win', label: 'Win', formula: '3d6 <= 30', then: [{ f: 'f_hits', formula: '1', add: true, when: 'hit' }, { f: 'f_hits', formula: '0', set: true, when: 'miss' }] },
            { id: 'r_lose', label: 'Lose', formula: '3d6 <= 0', then: [{ f: 'f_hits', formula: '1', add: true, when: 'hit' }, { f: 'f_hits', formula: '0', set: true, when: 'miss' }, { f: 'f_fp', formula: '1' }] },
            { id: 'r_d20', label: 'Adv', formula: 'd20 >= 1', then: [{ f: 'f_hits', formula: '2', add: true, when: 'hit' }] },
            { id: 'r_plain', label: 'Plain', formula: 'd6' },
            { id: 'r_sec', label: 'Sec', formula: '3d6 <= 30', then: [{ f: 'f_hits', formula: 'GMFig', add: true }] },
            { id: 'r_gm', label: 'GM', formula: '3d6 <= 30', vis: 'gm', then: [{ f: 'f_hits', formula: '1', add: true }] }] }, { F: Fx, gmView: true });
    const START = { f_hits: 3 };
    const runQ = (msg, o) => { o = o || {}; const out = { table: [], sent: [], deltas: [], saves: 0 };
        const camp = { id: 'k', activeItemId: 'm1', system: sysT, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => { out.saves++; });
        out.vals = camp.chars.c_a.values; return out; };
    const qWin = runQ({ act: 'r_win', expr: '3d6 <= 30' }), qLose = runQ({ act: 'r_lose', expr: '3d6 <= 0' });
    check('R1 a player\'s roll with consequences: on success (Win) Hits + 1, on failure (Lose) Hits set to 0 and FP - 1 always — on the host\'s copy, through their view, with one delta and a save, after the roll went to the table',
        qWin.table.length === 1 && j(qWin.vals.f_hits) === '4' && j(qWin.deltas) === j([['c_a', { f_hits: 4 }]]) && qWin.saves === 1
        && qLose.table.length === 1 && j(qLose.vals) === j({ f_hits: 0, f_fp: { cur: 9 } }) && j(qLose.deltas) === j([['c_a', { f_hits: 0, f_fp: { cur: 9 } }]]), j([qWin.vals, qWin.deltas, qLose.vals, qLose.deltas]));
    const wMod = Dx.composeModifier('3d6 <= 30', 2, Fx.parse).expr, qMod = runQ({ act: 'r_win', expr: wMod, mod: 2 }), aAdv = Dx.withAdvantage('d20 >= 1', 'adv', Fx.parse).expr, qAdv = runQ({ act: 'r_d20', expr: aAdv, adv: 'adv' });
    const qFake = runQ({ act: 'r_lose', expr: '3d6 <= 100' }), qFakeMod = runQ({ act: 'r_win', expr: '3d6 <= 30', mod: 2 }), qNoAdv = runQ({ act: 'r_d20', expr: 'd20 >= 1', adv: 'dis' });
    const refused = q => q.table.length === 0 && q.deltas.length === 0 && j(q.vals) === j(START) && q.sent.length === 1 && q.sent[0].type === 'roll-deny' && q.sent[0].message === 'That roll does not match its button now.';
    check('R1 the host rebuilds the formula from the entry (advantage, then the modifier): a shift-click modifier or advantage sent as data is rolled and applies its consequences; a formula that is not the entry\'s (a made-up target, a modifier it does not carry, the wrong advantage) is refused with nothing rolled or changed',
        qMod.table.length === 1 && qMod.table[0].expr === wMod && j(qMod.vals.f_hits) === '4' && qAdv.table.length === 1 && qAdv.table[0].expr === aAdv && j(qAdv.vals.f_hits) === '5' && [qFake, qFakeMod, qNoAdv].every(refused),
        j([qMod.table.map(r => r.expr), qAdv.table.map(r => r.expr), qFake.sent, qFakeMod.sent, qNoAdv.sent]));
    const qGm = runQ({ act: 'r_gm', expr: '3d6 <= 30' }), qSec = runQ({ act: 'r_sec', expr: '3d6 <= 30' }), qPlain = runQ({ act: 'r_plain', expr: 'd6' });
    check('R1 an entry the player\'s view does not have (a GM-only roll) is refused; one whose consequences name a GM-only value rolls with none (their view dropped them); a roll with none changes nothing',
        refused(qGm) && qSec.table.length === 1 && qSec.deltas.length === 0 && j(qSec.vals) === j(START) && qPlain.table.length === 1 && qPlain.deltas.length === 0, j([qGm.sent, qSec.deltas, qPlain.deltas]));
    // the player's side: net.diceRoll's client branch sends the entry, its modifier and advantage as data (never with a row)
    const runC = (expr, o) => { const sent = []; const conn = { peer: 'H', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', conns: [conn], roster: {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'setTimeout', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true } }, () => ({ id: 'k', system: sysT, chars: {} }), () => ({ id: 'u_a', name: 'Pat' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => {}, () => 0);
        const ret = dr(expr, o); return { ret, sent }; };
    const cA = runC('3d6 <= (30) + 2', { charId: 'c_a', act: 'r_win', mod: 2, adv: 'adv', label: 'Win' }), cR = runC('d6', { charId: 'c_a', act: 'r_win', row: { f: 'f_w', r: 'w_1' } }), cP = runC('d6', { charId: 'c_a' });
    check('R1 the player\'s request (net.diceRoll, run for real): a roll with consequences sends act, mod and adv beside its formula (the host rebuilds and checks it); a row roll sends no act; a plain roll neither',
        cA.sent.length === 1 && cA.sent[0].act === 'r_win' && cA.sent[0].mod === 2 && cA.sent[0].adv === 'adv' && Dx.cleanRollReq(cA.sent[0]) !== null && cR.sent.length === 1 && !('act' in cR.sent[0]) && cP.sent.length === 1 && !('act' in cP.sent[0]) && !('mod' in cP.sent[0]),
        j([cA.sent, cR.sent, cP.sent]));
    // the GM's own roll: net.diceRoll applies them here, synced when hosting
    const runG = (expr, o, env) => { env = env || {}; const out = { deltas: [], saves: 0, changed: [] };
        const camp = { id: 'k', system: sysT, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } } };
        const net = { active: env.active !== false, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged: id => out.changed.push(id) } };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; });
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o || {})); out.vals = camp.chars.c_a.values; return out; };
    const gWin = runG('3d6 <= 30', { act: 'r_win' }), gOff = runG('3d6 <= 0', { act: 'r_lose' }, { active: false }), gNo = runG('3d6 <= 30', {});
    check('R1 the GM\'s own roll with consequences applies them where it is rolled: hosting, one delta and a save; offline, a save and no delta; a roll that does not name its entry changes nothing',
        gWin.ret.ok && j(gWin.vals.f_hits) === '4' && j(gWin.deltas) === j([['c_a', { f_hits: 4 }]]) && gWin.saves === 1 && j(gWin.changed) === j(['c_a'])
        && gOff.ret.ok && j(gOff.vals) === j({ f_hits: 0, f_fp: { cur: 9 } }) && gOff.deltas.length === 0 && gOff.saves === 1 && gNo.ret.ok && j(gNo.vals) === j(START) && gNo.saves === 0,
        j([gWin.vals, gWin.deltas, gOff.vals, gNo.vals]));
})());

// Stage 6 HUD R2b: a list roll with consequences or needs on the wire — the host finds the list's roll in the player's view by its index, rebuilds its
// formula, refuses it while its needs fail, and moves the row's counters after it lands (sliced roll-req and diceroll, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src3 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src3.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src3.slice(i, src3.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysW = Sx.cleanSystem({ v: 1, name: 'W', rolls: [], fields: [
        { id: 'f_wp', key: 'Weapons', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Shots' }], counters: [{ key: 'Charges', def: 3, max: 'Row.Shots' }, { key: 'Hits' }],
            rolls: [{ label: 'Fire', formula: '3d6 <= 30', needs: 'Row.Charges >= 1', needsText: 'Out of charges', then: [{ c: 'Charges', formula: '1' }, { c: 'Hits', formula: '1', add: true, when: 'hit' }] }, { label: 'Damage', formula: '2d6', needs: 'Row.Hits > 0', needsText: 'No hit pending', then: [{ c: 'Hits', formula: '0', set: true }] }] } }],
        items: [{ id: 'i_bl', name: 'Blaster', stats: { Shots: 5 } }] }, { F: Fx, gmView: true });
    const rowsW = ct => [{ id: 'w_1', defId: 'i_bl', qty: 1, ct: ct }];
    const runW = (msg, ct) => { const out = { table: [], sent: [], deltas: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysW, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: rowsW(ct) } } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { out.table.push(rec.expr); }, () => {}, () => {}, () => {});
        out.ct = camp.chars.c_a.values.f_wp[0].ct; return out; };
    const wFire = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 2 }), wEmpty = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 0 });
    const wDmg = runW({ expr: '2d6', row: { f: 'f_wp', r: 'w_1', i: 1 } }, { Charges: 2, Hits: 1 }), wNoHit = runW({ expr: '2d6', row: { f: 'f_wp', r: 'w_1', i: 1 } }, { Charges: 2 }), wFake = runW({ expr: '3d6 <= 99', row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 2 });
    const wMod = runW({ expr: Dx.composeModifier('3d6 <= 30', 1, Fx.parse).expr, row: { f: 'f_wp', r: 'w_1', i: 0 }, mod: 1 }, { Charges: 2 }), wPlain = runW({ expr: 'd6', row: { f: 'f_wp', r: 'w_1' } }, { Charges: 2 });
    const refusedW = (w, m) => w.table.length === 0 && w.deltas.length === 0 && w.sent.length === 1 && w.sent[0].type === 'roll-deny' && w.sent[0].message === m;
    check('R2b a player\'s list roll by its index: Fire spends a charge and scores a hit on the host\'s copy (one delta); with no charge it is refused "Out of charges" before anything is rolled; Damage clears the hit, and with none it is refused "No hit pending"; a formula that is not the roll\'s is refused; a modifier sent as data is rolled; a plain row roll (no index) changes nothing',
        wFire.table.length === 1 && j(wFire.ct) === j({ Charges: 1, Hits: 1 }) && wFire.deltas.length === 1 && refusedW(wEmpty, 'Out of charges') && j(wEmpty.ct) === j({ Charges: 0 })
        && wDmg.table.length === 1 && j(wDmg.ct) === j({ Charges: 2, Hits: 0 }) && refusedW(wNoHit, 'No hit pending') && refusedW(wFake, 'That roll does not match its button now.')
        && wMod.table.length === 1 && j(wMod.ct) === j({ Charges: 1, Hits: 1 }) && wPlain.table.length === 1 && wPlain.deltas.length === 0 && j(wPlain.ct) === j({ Charges: 2 }),
        j([wFire.ct, wEmpty.sent, wDmg.ct, wNoHit.sent, wFake.sent, wMod.ct, wPlain.ct]));
    // the GM's own: net.diceRoll with the row's index — its needs before anything is rolled, its consequences here
    const runGW = (expr, o, ct) => { const out = { deltas: [], saves: 0 };
        const camp = { id: 'k', system: sysW, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: rowsW(ct) } } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; });
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); out.ct = camp.chars.c_a.values.f_wp[0].ct; return out; };
    const gFire = runGW('3d6 <= 30', { row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 2 }), gEmpty = runGW('3d6 <= 30', { row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 0 });
    check('R2b the GM\'s own list roll by its index: its consequences move the counters here (one delta, a save); a roll whose needs fail is refused with its text before anything is rolled',
        gFire.ret.ok && j(gFire.ct) === j({ Charges: 1, Hits: 1 }) && gFire.deltas.length === 1 && gFire.saves === 1 && j(gEmpty.ret) === j({ error: 'Out of charges' }) && j(gEmpty.ct) === j({ Charges: 0 }) && gEmpty.saves === 0,
        j([gFire.ret, gFire.ct, gEmpty.ret]));
    const runCW = o => { const sent = []; const conn = { peer: 'H', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', conns: [conn], roster: {} };
        new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'setTimeout', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true } }, () => ({ id: 'k', system: sysW, chars: {} }), () => ({ id: 'u_a', name: 'Pat' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => {}, () => 0)('3d6 <= (30) + 1', o); return sent; };
    const cwI = runCW({ charId: 'c_a', row: { f: 'f_wp', r: 'w_1', i: 0 }, mod: 1 });
    check('R2b the player\'s request (net.diceRoll, run for real): a list roll with consequences or needs sends the row\'s index and its modifier', cwI.length === 1 && j(cwI[0].row) === j({ f: 'f_wp', r: 'w_1', i: 0 }) && cwI[0].mod === 1 && Dx.cleanRollReq(cwI[0]) !== null, j(cwI));
    const apSrcW = between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply'), paSrcW = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), dlSrcW = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysWA = Sx.cleanSystem({ v: 1, name: 'WA', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Shots' }], counters: [{ key: 'Charges', def: 3, max: 'Row.Shots' }], rolls: [{ label: 'Reload', apply: [{ c: 'Charges', formula: 'Row.Shots', set: true }] }] } }], items: [{ id: 'i_bl', name: 'Blaster', stats: { Shots: 5 } }] }, { F: Fx, gmView: true });
    const campWA = { id: 'k', system: sysWA, items: {}, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_1', defId: 'i_bl', qty: 1, ct: { Charges: 1 } }] } } } }, outWA = { sent: [], chat: [] };
    const connWA = { peer: 'pA', open: true, send: m => { packCheck(m); outWA.sent.push(JSON.parse(JSON.stringify(m))); } }, netWA = { active: true, role: 'host', paused: false, combats: {}, conns: [connWA], roster: { pA: { id: 'u_a', name: 'Pat' } } };
    new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrcW + '\n' + paSrcW + '\n' + apSrcW)(
        { type: 'char-apply', rid: 'a1', charId: 'c_a', row: { f: 'f_wp', r: 'w_1', i: 0 }, label: 'Blaster · Reload' }, connWA, netWA, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } }, () => false, () => campWA, () => {}, e => { throw e; }, c => (netWA.roster[c.peer] ? netWA.roster[c.peer].id : null), { allow: () => true },
        (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), () => {}, m => outWA.chat.push(m), () => {}, r => Dx.applyText(r));
    check('R2b a player\'s list action (char-apply with the row) moves the row\'s counter on the host\'s copy (Reload: Charges 1 to 5), acked, its card to them and the GM',
        j(campWA.chars.c_a.values.f_wp[0].ct) === j({ Charges: 5 }) && outWA.sent.some(m => m.type === 'char-ack') && outWA.sent.some(m => m.type === 'apply' && m.priv === 'gm' && j(m.lines) === j([{ n: 'Charges', d: 4, v: 5 }])), j([campWA.chars.c_a.values.f_wp, outWA.sent.map(m => m.type)]));
})());

// Stage 6 HUD R3: a roll's Malf on the wire — the host works it out through the player's view, puts it on the record (every machine then shows the
// malfunction from the draws), and a malfunction is a failure with its own consequences; the GM's own: a GM-only Malf keeps the roll private
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysM = Sx.cleanSystem({ v: 1, name: 'M', fields: [{ id: 'f_j', key: 'Jam', kind: 'number', def: 0 }, { id: 'f_h', key: 'Hits', kind: 'number', def: 0 }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 3, vis: 'gm' }],
        rolls: [{ id: 'r_a', label: 'A', formula: '3d6 <= 30', malf: '3', then: [{ f: 'f_j', formula: '1', add: true, when: 'malf' }, { f: 'f_h', formula: '1', add: true, when: 'hit' }] },
            { id: 'r_b', label: 'B', formula: '3d6 <= 30', malf: '19', then: [{ f: 'f_j', formula: '1', add: true, when: 'malf' }, { f: 'f_h', formula: '1', add: true, when: 'hit' }] },
            { id: 'r_g', label: 'G', formula: '3d6 <= 30', malf: 'GMFig' }] }, { F: Fx, gmView: true });
    const runM = msg => { const out = { table: [], sent: [], deltas: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysM, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => {});
        out.vals = camp.chars.c_a.values; return out; };
    const mA = runM({ act: 'r_a', expr: '3d6 <= 30' }), mB = runM({ act: 'r_b', expr: '3d6 <= 30' }), mG = runM({ act: 'r_g', expr: '3d6 <= 30' });
    check('R3 a player\'s roll with a Malf: the host puts the Malf on the record; a natural total at or past it (Malf 3: always) is a malfunction — a failure (no On success change) with its On malfunction change; below it (Malf 19: never) the roll is judged as usual; a Malf the player\'s view does not have (GM-only) is not on the record',
        mA.table.length === 1 && mA.table[0].malf === 3 && Dx.cleanRoll(mA.table[0]).malf === 3 && j(mA.vals) === j({ f_j: 1 })
        && mB.table.length === 1 && mB.table[0].malf === 19 && j(mB.vals) === j({ f_h: 1 }) && mG.table.length === 1 && !('malf' in mG.table[0]), j([mA.table[0], mA.vals, mB.vals, mG.table[0]]));
    const runGM = (expr, o) => { const out = { pushed: [], toasts: [] };
        const camp = { id: 'k', system: sysM, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; }, () => {}, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', rec.malf]), () => {}, () => {});
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); out.vals = camp.chars.c_a.values; return out; };
    const gA = runGM('3d6 <= 30', { act: 'r_a' }), gG = runGM('3d6 <= 30', { act: 'r_g' });
    check('R3 the GM\'s own roll with a Malf carries it on the record and applies its On malfunction change here; a Malf that reads a GM-only value keeps the roll private (the card would show it)',
        gA.ret.ok && j(gA.pushed) === j([['global', '', 3]]) && j(gA.vals) === j({ f_j: 1 }) && gG.ret.ok && gG.pushed[0][1] === 'gm' && gG.pushed[0][2] === 3 && gG.toasts.some(t => /GMFig/.test(t)), j([gA.pushed, gA.vals, gG.pushed, gG.toasts]));
})());

// Chat cards (owner 2026-09-27): a damage roll's mark — the host puts it on the record from the roll entry its formula matched (a system roll by
// its id, a list's roll by its index), never from the player's word; the GM's own roll from its entry, or this machine's own word (a thrown item's damage)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysD = Sx.cleanSystem({ v: 1, name: 'D', fields: [{ id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', list: { rolls: [{ label: 'Hit', formula: 'd6', dmg: true }, { label: 'Aim', formula: 'd20' }] } }],
        rolls: [{ id: 'r_d', label: 'Dmg', formula: '2d6', dmg: true }, { id: 'r_p', label: 'Plain', formula: 'd20' }] }, { F: Fx, gmView: true });
    const chD = () => ({ c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_w: [{ id: 'w_1', own: 1, qty: 1, def: { name: 'Axe' } }] } } });
    const runD = msg => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysD, chars: chD(), items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => {});
        return out; };
    const dA = runD({ act: 'r_d', expr: '2d6' }), dP = runD({ act: 'r_p', expr: 'd20' }), dL = runD({ row: { f: 'f_w', r: 'w_1', i: 0 }, expr: 'd6' }), dL2 = runD({ row: { f: 'f_w', r: 'w_1', i: 1 }, expr: 'd20' });
    const dX = runD({ expr: 'd20', dmg: 1 }), dF = runD({ act: 'r_d', expr: '1d6' });
    check('Chat cards: a player\'s damage roll is marked by the host from the entry its formula matched (a system roll by its id, a list\'s roll by its index); an unmarked entry, a request that claims the mark, or one whose formula does not match its button puts none on the table',
        dA.table.length === 1 && dA.table[0].dmg === 1 && Dx.cleanRoll(dA.table[0]).dmg === 1 && dP.table.length === 1 && !('dmg' in dP.table[0]) && dL.table.length === 1 && dL.table[0].dmg === 1 && dL2.table.length === 1 && !('dmg' in dL2.table[0])
        && dX.table.length === 1 && !('dmg' in dX.table[0]) && dF.table.length === 0, j([dA.table, dP.table, dL.table, dL2.table, dX.table, dF.sent]));
    const runGD = (expr, o) => { const out = { pushed: [] };
        const camp = { id: 'k', system: sysD, chars: chD() };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, (rec, res, scope) => out.pushed.push([scope, rec.dmg === undefined ? null : rec.dmg]), () => {}, () => {});
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); return out; };
    const gD = runGD('2d6', { act: 'r_d' }), gP = runGD('d20', { act: 'r_p' }), gO = runGD('3d6', { dmg: true }), gL = runGD('d6', { row: { f: 'f_w', r: 'w_1', i: 0 } }), gN = runGD('3d6', { dmg: 1 });
    check('Chat cards: the GM\'s own roll is marked from its entry (a system roll, a list\'s roll) or from this machine\'s own word (true only: a thrown item\'s damage); an unmarked entry is not; a player\'s request to the host never carries the word',
        j(gD.pushed) === j([['global', 1]]) && j(gP.pushed) === j([['global', null]]) && j(gO.pushed) === j([['global', 1]]) && j(gL.pushed) === j([['global', 1]]) && j(gN.pushed) === j([['global', null]]) && !/req\.dmg/.test(src4),
        j([gD.pushed, gP.pushed, gO.pushed, gL.pushed, gN.pushed]));
})());

// owed review F5a2 #1: a GM-only value read through a choice's option (Secret = GMFig, the Longsword picking it) — the GM's public roll of the choice,
// of a visible formula over it, of a column reading Row.Ability and of a pool whose max reads it stays private with its toast; a roll of a plain
// value still goes to the table (net.diceRoll sliced, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const a2_line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const a2_helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(a2_line).join('\n') + '\n';
    const a2_drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const a2_sys = Sx.cleanSystem({ v: 1, name: 'A2', rolls: [], fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 12 }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', vis: 'gm', def: 17 },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Ability', kind: 'pick', def: 'Plain', opts: [{ label: 'Plain', name: 'ST' }, { label: 'Secret', name: 'GMFig' }] }], cols: [{ key: 'Eff', label: 'Eff', formula: 'Row.Ability + 1' }] } },
        { id: 'f_ab', key: 'AtkBonus', label: 'Atk', kind: 'formula', vis: 'all', formula: 'Weapons.Longsword.Ability + 2' },
        { id: 'f_gr', key: 'Grit', label: 'Grit', kind: 'resource', vis: 'all', edit: 'owner', maxFormula: 'Weapons.Longsword.Ability * 2', min: 0, def: 'max' }],
        items: [{ id: 'i_ls', name: 'Longsword', key: 'Longsword', stats: { Ability: 'Secret' } }] }, { F: Fx, gmView: true });
    const a2_runGM = expr => { const out = { pushed: [], toasts: [], table: [] };
        const camp = { id: 'k', system: a2_sys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_ls', defId: 'i_ls', qty: 1 }] } } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + a2_helpers + a2_drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '']), () => {}, () => {});
        out.ret = dr(expr, { charId: 'c_a' }); return out; };
    const a2_hid = ['Weapons.Longsword.Ability', 'AtkBonus', 'Weapons.Eff', 'Grit.max'].map(n => [n, a2_runGM('d20 + ' + n)]), a2_pub = a2_runGM('d20 + ST');
    check('F5a2 owed review #1 on the wire: the GM\'s public roll of a choice whose option reads a GM-only value (Weapons.Longsword.Ability), of a visible formula over it (AtkBonus), of a column reading Row.Ability (Weapons.Eff) and of a pool whose max reads it (Grit.max) is kept private with its toast, nothing to the table; d20 + ST still goes to the table',
        a2_hid.every(([n, r]) => r.ret.ok && r.ret.priv === true && j(r.pushed) === j([['whisper', 'gm']]) && r.table.length === 0 && r.toasts.length === 1 && r.toasts[0].indexOf('Kept private: that roll uses a GM-only value (') === 0 && r.toasts[0].indexOf(n) > 0)
        && a2_pub.ret.ok && a2_pub.ret.priv === false && j(a2_pub.pushed) === j([['global', '']]) && a2_pub.table.length === 1 && a2_pub.toasts.length === 0, j([a2_hid.map(([n, r]) => [n, r.pushed, r.toasts]), a2_pub.pushed]));
})());
// owed review F5b: the GM's own roll on a row while hosting (net.diceRoll sliced and run for real) — a column reading a GM-only value, a choice's
// option naming one, a column a GM-only effect moves (one and two columns deep), six columns deep to a choice or to that effect, a visible item's row
// on a GM-only list, and a curse the GM keeps on while its owner sees it off each stay the GM's, with a toast, and nothing reaches the table; a plain
// row roll and a row switched on as usual go to the table; the owner's own roll on the kept-on row stays public and reads what they hold (roll-req)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const b5_src = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const b5_line = k => { const i = b5_src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return b5_src.slice(i, b5_src.indexOf('\n', i)); };
    const b5_helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(b5_line).join('\n') + '\n';
    const b5_dr = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), b5_rq = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq');
    const b5_runGM = (sys, ch, expr, o) => { const out = { table: [], pushed: [], toasts: [] };
        const camp = { id: 'k', system: sys, chars: { [ch.id]: JSON.parse(JSON.stringify(ch)) } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + b5_helpers + b5_dr + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', (rec.names || []).map(n => n.name + '=' + n.value)]), () => {}, () => {});
        out.ret = dr(expr, Object.assign({ charId: ch.id }, o)); return out; };
    const b5_runReq = (sys, ch, msg) => { const out = { table: [], sent: [], pushed: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { [ch.id]: JSON.parse(JSON.stringify(ch)) }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: ch.ownerId, name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + b5_helpers + b5_rq)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: ch.id }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '']), () => {}, () => {});
        return out; };
    const b5_priv = (r, t) => !!r.ret && r.ret.ok === true && r.ret.priv === true && r.table.length === 0 && r.pushed.length === 1 && r.pushed[0][0] === 'whisper' && r.pushed[0][1] === 'gm' && r.toasts.length === 1 && (t instanceof RegExp ? t.test(r.toasts[0]) : r.toasts[0] === t);
    const b5_pub = r => !!r.ret && r.ret.ok === true && r.ret.priv === false && r.table.length === 1 && !('priv' in r.table[0]) && r.pushed.length === 1 && r.pushed[0][0] === 'global' && r.pushed[0][1] === '' && r.toasts.length === 0;
    // S1, S2, S5: a list whose Sly column reads GMFig and whose Grip choice has an option naming GMFig (the list's names derive from a GM-only value);
    // S3, S4, S2e and the control: the same list without either (Grip: Strong = ST only), so only a GM-only effect on ST can make a roll the GM's
    const b5_raw = { v: 1, name: 'P', rolls: [], fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 10 }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', vis: 'gm', def: 5 }, { id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all' },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { label: 'Level', min: 0, max: 9, def: 1 },
            stats: [{ key: 'Acc' }, { key: 'Grip', kind: 'pick', opts: [{ label: 'Strong', name: 'ST' }, { label: 'Secret', name: 'GMFig' }] }],
            cols: [{ key: 'Sly', label: 'Sly', formula: 'Row.lvl + GMFig' }, { key: 'Hit', label: 'Hit', formula: 'Row.Acc + ST' }, { key: 'Deep', label: 'Deep', formula: 'Row.Hit + 1' }] } },
        { id: 'f_se', key: 'Secret', label: 'Secret', kind: 'item-list', vis: 'gm', edit: 'owner', list: { rolls: [{ label: 'Hush', formula: 'd6' }] } }],
        items: [{ id: 'i_bl', name: 'Blaster', stats: { Acc: 3, Grip: 'Secret' } }],
        effects: [{ id: 'e_curse', name: 'Curse', vis: 'gm', mods: [{ f: 'f_st', op: 'add', v: -3 }] }] };
    const b5_rawN = JSON.parse(JSON.stringify(b5_raw)); b5_rawN.fields[3].list.cols = b5_rawN.fields[3].list.cols.filter(c => c.key !== 'Sly'); b5_rawN.fields[3].list.stats[1].opts = [{ label: 'Strong', name: 'ST' }]; b5_rawN.items[0].stats.Grip = 'Strong';
    const b5_sys = Sx.cleanSystem(b5_raw, { F: Fx, gmView: true }), b5_sysN = Sx.cleanSystem(b5_rawN, { F: Fx, gmView: true });
    const b5_ch = fx => ({ id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_wp: [{ id: 'w_b', defId: 'i_bl', qty: 1, lvl: 2 }], f_se: [{ id: 'w_s', defId: 'i_bl', qty: 1 }], f_fx: fx ? [{ id: 'x_1', ref: 'e_curse', on: true }] : [] } });
    const b5_row = (lb, f, r) => ({ label: 'Blaster · ' + lb, row: { f: f || 'f_wp', r: r || 'w_b' } });
    const b5_S1 = b5_runGM(b5_sys, b5_ch(false), 'd20 + Row.Sly', b5_row('Sneak')), b5_S2 = b5_runGM(b5_sys, b5_ch(false), 'd6 + Row.Grip', b5_row('Grip')), b5_S2e = b5_runGM(b5_sysN, b5_ch(true), 'd6 + Row.Grip', b5_row('Grip'));
    const b5_S3 = b5_runGM(b5_sysN, b5_ch(true), 'd20 + Row.Hit', b5_row('Attack')), b5_S4 = b5_runGM(b5_sysN, b5_ch(true), 'd20 + Row.Deep', b5_row('Deep'));
    const b5_S5 = b5_runGM(b5_sys, b5_ch(false), 'd6', b5_row('Hush', 'f_se', 'w_s')), b5_P = b5_runGM(b5_sysN, b5_ch(false), 'd20 + Row.Hit', b5_row('Attack'));
    check('owed F5b the GM\'s own row roll, hosting (net.diceRoll run for real): a column reading GMFig (S1), a choice whose option names GMFig (S2), a column a GM-only effect moves (S3) or two columns down to it (S4), a choice whose option names ST under that effect (S2e) and a visible item\'s row on a GM-only list (S5) each go to the GM alone (whisper, priv gm) with one toast that says why, and nothing reaches the table; the same row\'s plain Row.Hit with no effect on goes to the table (Row.Hit = 13)',
        b5_priv(b5_S1, /^Kept private: that roll uses a GM-only value \(.*GMFig/) && b5_priv(b5_S2, /^Kept private: that roll uses a GM-only value \(.*GMFig/)
        && b5_priv(b5_S2e, /^Kept private: a GM-only effect changes .*\bST\b/) && b5_priv(b5_S3, /^Kept private: a GM-only effect changes .*\bST\b/) && b5_priv(b5_S4, /^Kept private: a GM-only effect changes .*\bST\b/)
        && b5_priv(b5_S5, 'Kept private: that roll is on a GM-only item or list (Blaster · Hush).') && b5_pub(b5_P) && j(b5_P.pushed[0][2]) === j(['Row.Hit=13']),
        j([b5_S1.pushed, b5_S1.toasts, b5_S2.pushed, b5_S2.toasts, b5_S2e.pushed, b5_S2e.toasts, b5_S3.pushed, b5_S3.toasts, b5_S4.pushed, b5_S4.toasts, b5_S5.pushed, b5_S5.toasts, b5_P.pushed, b5_P.toasts]));
    // six columns deep (a list's most): A reads Row.B, … the last reads a choice whose option names GMFig, ST under the GM-only effect, or a choice naming ST under it
    const b5_chain = (base, end) => { const ks = ['A', 'B', 'C', 'D', 'E', 'G2'], r = JSON.parse(JSON.stringify(base));
        r.fields[3].list.cols = ks.map((k, i) => ({ key: k, label: k, formula: i < ks.length - 1 ? 'Row.' + ks[i + 1] : end })); return Sx.cleanSystem(r, { F: Fx, gmView: true }); };
    const b5_c6 = b5_chain(b5_raw, 'Row.Grip'), b5_e6 = b5_chain(b5_rawN, 'ST'), b5_g6 = b5_chain(b5_rawN, 'Row.Grip');
    const b5_C6 = b5_runGM(b5_c6, b5_ch(false), 'd20 + Row.A', b5_row('Attack')), b5_E6 = b5_runGM(b5_e6, b5_ch(true), 'd20 + Row.A', b5_row('Attack')), b5_G6 = b5_runGM(b5_g6, b5_ch(true), 'd20 + Row.A', b5_row('Attack')), b5_E6off = b5_runGM(b5_e6, b5_ch(false), 'd20 + Row.A', b5_row('Attack'));
    check('owed F5b a GM-only value six columns down stays the GM\'s: a chain of six columns ending in a choice whose option names GMFig, in ST under a GM-only effect, or in a choice whose option names ST under it keeps the GM\'s roll private (every column is followed, not four); the same chain with no effect on goes to the table (Row.A = 10)',
        b5_c6.fields[3].list.cols.length === 6 && b5_priv(b5_C6, /^Kept private: that roll uses a GM-only value \(.*GMFig/) && b5_priv(b5_E6, /^Kept private: a GM-only effect changes .*\bST\b/) && b5_priv(b5_G6, /^Kept private: a GM-only effect changes .*\bST\b/)
        && b5_pub(b5_E6off) && j(b5_E6off.pushed[0][2]) === j(['Row.A=10']), j([b5_C6.pushed, b5_C6.toasts, b5_E6.pushed, b5_E6.toasts, b5_G6.pushed, b5_G6.toasts, b5_E6off.pushed, b5_E6off.toasts]));
    // a curse the GM keeps on: the player switched it off (applyRowOp, run for real) — their copy reads it off (Row.Hit 1), the GM's on (3)
    const b5_rawK = { v: 1, name: 'K', rolls: [], fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 10 },
        { id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'Worn' }, stats: [{ key: 'Acc' }], cols: [{ key: 'Hit', label: 'Hit', formula: 'Row.Acc + Row.on * 2' }] } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'curse', eqMsg: 'It clings', stats: { Acc: 1 } }] };
    const b5_sysK = Sx.cleanSystem(b5_rawK, { F: Fx, gmView: true }), b5_pvK = Sx.cleanSystem(b5_sysK, { F: Fx, gmView: false });
    const b5_chOn = { id: 'c_k', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_gr: [{ id: 'w_r', defId: 'i_ring', qty: 1, on: true }] } };
    const b5_op = Sx.applyRowOp(b5_sysK, JSON.parse(JSON.stringify(b5_chOn)), 'f_gr', { op: 'set', rowId: 'w_r', facts: { on: false } }, Fx, { player: true, view: b5_pvK });
    const b5_chK = JSON.parse(JSON.stringify(b5_chOn)); b5_chK.values.f_gr = b5_op && b5_op.ok ? b5_op.value : [];
    const b5_ring = lb => ({ label: 'Ring · ' + lb, row: { f: 'f_gr', r: 'w_r' } });
    const b5_K1 = b5_runGM(b5_sysK, b5_chK, 'd20 + Row.Hit', b5_ring('Attack')), b5_K2 = b5_runGM(b5_sysK, b5_chK, 'd6 + Row.on', b5_ring('Worn')), b5_KOn = b5_runGM(b5_sysK, b5_chOn, 'd20 + Row.Hit', b5_ring('Attack'));
    const b5_KQ = b5_runReq(b5_sysK, b5_chK, { expr: 'd20 + Row.Hit', label: 'Ring · Attack', row: { f: 'f_gr', r: 'w_r' } });
    check('owed F5b a curse the GM keeps on (its owner switched it off: stored on, keptOn 1): the GM\'s roll of that row (Row.Hit, Row.on) stays the GM\'s with "its owner sees that item switched off", nothing to the table; the same row switched on as usual goes to the table (Row.Hit = 3); the owner\'s own roll on it through the host stays public and reads their copy (Row.Hit = 1)',
        j(b5_chK.values.f_gr.map(r => [r.on, r.keptOn])) === j([[true, 1]])
        && b5_priv(b5_K1, 'Kept private: its owner sees that item switched off (Ring · Attack).') && b5_priv(b5_K2, 'Kept private: its owner sees that item switched off (Ring · Worn).')
        && b5_pub(b5_KOn) && j(b5_KOn.pushed[0][2]) === j(['Row.Hit=3'])
        && b5_KQ.table.length === 1 && !('priv' in b5_KQ.table[0]) && j(b5_KQ.table[0].names) === j([{ name: 'Row.Hit', value: 1 }]) && j(b5_KQ.pushed) === j([['global', '']]) && !b5_KQ.sent.some(m => m.type === 'roll-deny' || m.type === 'roll'),
        j([b5_chK.values.f_gr, b5_K1.pushed, b5_K1.toasts, b5_K2.pushed, b5_K2.toasts, b5_KOn.pushed, b5_KQ.table, b5_KQ.sent, b5_KQ.pushed]));
})());
// Stage 6 HUD G10: the round hook fires when a combat's round changes — its start, a step past either end (net.js combatSet / combatStep, run
// for real) — never within a round, on a roster edit that keeps the round, or at its end; a hook that throws never stops the turn
{
    const setSrcG = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepSrcG = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep');
    const ccSrcG = fnSrc('function cleanCombats(c) {', '\nfunction applyNotepad(', 'cleanCombats');
    const calls = [], errs = [], hook = { throws: false };
    const netG = { role: 'host', active: true, combats: {} }, campG = { items: { m1: { type: 'map', meta: { title: 'Keep' } } } };
    const win = { wpSheets: { roundHook: (mapId, c) => { calls.push(mapId + ':' + c.round); if (hook.throws) throw new Error('boom'); } } };
    new Function('net', 'window', 'getActiveCampaign', 'broadcastCombats', 'logEvent', 'toast', 'render', 'console', 'showConfirm', ccSrcG + '\n' + setSrcG + '\n' + stepSrcG)(
        netG, win, () => campG, () => {}, () => {}, () => {}, () => {}, { error: e => errs.push(String(e && e.message)) }, () => {});
    const rw = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: 'N' + i, tokId: 't' + i, init: 0, src: null }));
    const st = () => netG.combats.m1 ? 'r' + netG.combats.m1.round + 't' + netG.combats.m1.turn : 'none';
    const seen = [];
    netG.combatSet('m1', { round: 1, turn: 0, rows: rw(2) }); seen.push(st() + '=' + calls.join());
    netG.combatSet('m1', { round: 1, turn: 1, rows: rw(3) }); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', 1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', 1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', -1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', -1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', -1); seen.push(st() + '=' + calls.join());
    hook.throws = true; netG.combatStep('m1', 1); netG.combatStep('m1', 1); netG.combatStep('m1', 1); seen.push(st() + '=' + calls.join()); hook.throws = false;
    netG.combatSet('m1', { round: 5, turn: 0, rows: rw(3) }); seen.push(st() + '=' + calls.join());
    netG.combatSet('m1', null); seen.push(st() + '=' + calls.join());
    check('G10 the round hook (net.js, run for real): at the combat\'s start (round 1), a step past the last (round 2) and back past the first (round 1), a roster edit that sets another round — never within a round, on a roster edit that keeps it, at round 1\'s first turn stepping back, or at the end; a hook that throws is logged and the turn still moves',
        j(seen) === j(['r1t0=m1:1', 'r1t1=m1:1', 'r1t2=m1:1', 'r2t0=m1:1,m1:2', 'r1t2=m1:1,m1:2,m1:1', 'r1t1=m1:1,m1:2,m1:1', 'r1t0=m1:1,m1:2,m1:1',
            'r2t0=m1:1,m1:2,m1:1,m1:2', 'r5t0=m1:1,m1:2,m1:1,m1:2,m1:5', 'none=m1:1,m1:2,m1:1,m1:2,m1:5']) && j(errs) === j(['boom']), j([seen, errs]));
}

// Turn-based combat T2: a player's End turn — the host steps only for the player whose own character token has the turn, on the map they are on,
// for the row they saw (a stale or second press never skips the next character), turn-based combat on, not paused, rate-limited; the client
// offers it only then (net.myTurnTok) and sends the row it saw
{
    const teSrc = between('// [netcheck:turnend-start]', '// [netcheck:turnend-end]', 'turnend');
    const runTE = (msg, o) => {
        o = o || {}; const steps = [];
        const map = { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_orc', isChar: true, charId: 'c_o' }, { id: 't_sam', isChar: true, charId: 'c_s', ownerId: 'u_b' }, { id: 't_box', isChar: false, ownerId: 'u_a' }] };
        const camp = { items: { m1: map, m2: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: !!o.paused, roster: { pA: { id: 'u_a', location: o.loc || 'm1' } }, combats: { m1: { round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_orc', tokId: 't_orc' }, { id: 'r_pat', tokId: 't_pat' }, { id: 'r_sam', tokId: 't_sam' }, { id: 'r_box', tokId: 't_box' }, { id: 'r_trap', tokId: null }] } }, combatStep: (m, d) => steps.push(m + ':' + d) };
        const own = (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k);
        new Function('msg', 'conn', 'net', 'window', 'getActiveCampaign', 'peerPaused', 'allow', 'own', teSrc)(Object.assign({ type: 'turn-end' }, msg), { peer: 'pA' }, net,
            { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => camp, () => !!o.peerPaused, () => o.slow !== true, own);
        return steps;
    };
    const ok = { mapId: 'm1', row: 'r_pat' };
    check('turn-end (net.js, run for real): the player whose own character token has the turn steps the combat once, as the GM\'s Next turn',
        j(runTE(ok)) === j(['m1:1']));
    check('turn-end: nothing for a row they did not see on turn (stale, or someone else\'s), another\'s token, a GM token, a token that is not a character, a row with no token, another map than theirs, no row, turn-based combat off, a paused table or player, past the rate',
        [runTE({ mapId: 'm1', row: 'r_orc' }), runTE(ok, { turn: 0 }), runTE({ mapId: 'm1', row: 'r_sam' }, { turn: 2 }), runTE({ mapId: 'm1', row: 'r_box' }, { turn: 3 }), runTE({ mapId: 'm1', row: 'r_trap' }, { turn: 4 }),
            runTE({ mapId: 'm2', row: 'r_pat' }), runTE(ok, { loc: 'm2' }), runTE({ mapId: 'm1' }), runTE({ mapId: 'm1', row: 5 }), runTE(ok, { turns: false }), runTE(ok, { paused: true }), runTE(ok, { peerPaused: true }), runTE(ok, { slow: true }), runTE({ mapId: {}, row: 'r_pat' })].every(s => s.length === 0));
    // the client's side: whose turn it is on the map in view, and the message it sends
    const mtSrc = fnSrc('net.myTurnTok = function', '\n// the player ends their own turn', 'myTurnTok'), teCl = fnSrc('net.turnEnd = function', '\n// A player\'s change of a carried list', 'turnEnd');
    const cl = o => {
        o = o || {}; const sent = [];
        const camp = { activeItemId: o.mid || 'm1', items: { m1: { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_orc', isChar: true }] } } };
        const net = { active: true, role: o.role || 'client', stream: false, myId: 'u_a', foreign: true, syncedPeer: 'gm', conns: [{ peer: 'gm', open: o.open !== false, send: m => sent.push(m) }], combats: { m1: { round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_orc', tokId: 't_orc' }, { id: 'r_pat', tokId: 't_pat' }] } } };
        new Function('net', 'window', 'getActiveCampaign', 'own', mtSrc + '\n' + teCl)(net, { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k));
        return { tok: net.myTurnTok(), end: net.turnEnd(), sent: sent };
    };
    const cOn = cl(), cOff = [cl({ turn: 0 }), cl({ turns: false }), cl({ role: 'host' }), cl({ mid: 'm9' })], cShut = cl({ open: false });
    check('turn-end, the client: myTurnTok names the map, the row and the token only while the player\'s own token has the turn there (turn-based combat on, at a table); End turn sends that row, else says why and sends nothing',
        cOn.tok && cOn.tok.mapId === 'm1' && cOn.tok.rowId === 'r_pat' && cOn.tok.tok.id === 't_pat' && j(cOn.sent) === j([{ type: 'turn-end', mapId: 'm1', row: 'r_pat' }]) && j(cOn.end) === j({ ok: true })
        && cOff.every(c => c.tok === null && !c.sent.length && c.end.error === 'It is not your turn.') && !cShut.sent.length && cShut.end.error === 'Not at the table yet.', j([cOn, cOff.map(c => c.end)]));
}

// Turn-based combat T2b: a reminder card — the host delivers a player's to each of that player's admitted connections (the GM's copy then says
// whose it is), else keeps it the GM's; a client takes one from its synced host only, cleaned, never a GM's copy; the turn's start runs on
// every step that moves the turn (net.js combatStep / combatSet, run for real)
pendingChecks.push((async () => {
    const Dx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dicecore.js')).split(String.fromCharCode(92)).join('/'));
    const pdSrc = between('// [netcheck:postdue-start]', '// [netcheck:postdue-end]', 'postdue'), diSrc = between('// [netcheck:duein-start]', '// [netcheck:duein-end]', 'duein');
    const pidOf = c => ({ pA: 'u_a', pA2: 'u_a', pB: 'u_b', pW: 'u_a' })[c.peer];
    const runPD = (ch, toOwner, o) => {
        o = o || {}; const conns = [mkConn('pA'), mkConn('pA2'), mkConn('pB'), mkConn('pW'), mkConn('pShut', false)], chat = [];
        const net = { active: true, role: o.role || 'host', conns, roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' }, pShut: { id: 'u_a' } } };
        new Function('rec', 'ch', 'toOwner', 'net', 'peerProfileId', 'sendFailed', 'pushChat', pdSrc + '\npostDue(rec, ch, toOwner);')({ type: 'due', id: 'r_d1', charId: 'c_a', act: 'r_re', why: 'turn', round: 2, ts: 1, from: { id: 'u_gm', name: 'GM', gm: true } }, ch, toOwner, net, pidOf, e => { throw e; }, m => chat.push(m));
        return { sent: conns.map(c => c.peer + ':' + c.sent.length).join(','), chat };
    };
    const ana = { id: 'c_a', ownerId: 'u_a' }, pd1 = runPD(ana, true), pd2 = runPD(ana, false), pd3 = runPD({ id: 'c_a', ownerId: 'u_c' }, true), pd4 = runPD({ id: 'c_o', ownerId: 'u_a', npc: true }, true);
    check('T2b postDue (net.js, run for real): a player\'s reminder reaches each admitted connection of theirs (a waiting or closed one nothing, another player nothing) and the GM\'s copy says it is theirs; otherwise the GM\'s alone — the player not at the table, an NPC, or a GM reminder; always a whisper',
        pd1.sent === 'pA:1,pA2:1,pB:0,pW:0,pShut:0' && pd1.chat.length === 1 && pd1.chat[0].due.theirs === 1 && pd1.chat[0].scope === 'whisper'
        && [pd2, pd3, pd4].every(p => p.sent === 'pA:0,pA2:0,pB:0,pW:0,pShut:0' && p.chat.length === 1 && !p.chat[0].due.theirs && p.chat[0].scope === 'whisper'), j([pd1.sent, pd2.sent, pd3.sent, pd4.sent]));
    const runDI = (msg, o) => {
        o = o || {}; const chat = [];
        new Function('msg', 'conn', 'net', 'DC', 'pushChat', diSrc)(msg, { peer: o.peer || 'host1' }, { foreign: true, syncedPeer: 'host1', stream: !!o.stream }, () => Dx, m => chat.push(m));
        return chat;
    };
    const dueOk = { type: 'due', id: 'r_d1', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_a', act: 'r_re', label: '<img src=x>', why: 'turn', round: 2, ts: 1 };
    const di1 = runDI(dueOk);
    check('T2b a client\'s reminder (net.js, run for real): from the synced host only, cleaned (the label stays text), a whisper; nothing from another peer, in the stream window, malformed, or a GM\'s copy (theirs)',
        di1.length === 1 && di1[0].due.label === '<img src=x>' && di1[0].scope === 'whisper' && di1[0].due.charId === 'c_a'
        && [runDI(dueOk, { peer: 'other' }), runDI(dueOk, { stream: true }), runDI(Object.assign({}, dueOk, { act: 'f_hp' })), runDI(Object.assign({}, dueOk, { theirs: 1 }))].every(c => c.length === 0), j(di1));
    const setSrcT = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepSrcT = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep'), ccSrcT = fnSrc('function cleanCombats(c) {', '\nfunction applyNotepad(', 'cleanCombats');
    const callsT = [], netT = { role: 'host', active: true, combats: {} };
    new Function('net', 'window', 'getActiveCampaign', 'broadcastCombats', 'logEvent', 'toast', 'render', 'console', 'showConfirm', ccSrcT + '\n' + setSrcT + '\n' + stepSrcT)(
        netT, { wpSheets: { roundHook: (m, c) => callsT.push('R' + c.round), turnHook: (m, c) => callsT.push('T' + c.round + '.' + c.turn) } }, () => ({ items: { m1: { type: 'map', meta: { title: 'K' } } } }), () => {}, () => {}, () => {}, () => {}, { error: () => {} }, () => {});
    const rwT = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: 'N' + i, tokId: 't' + i, init: 0, src: null }));
    netT.combatSet('m1', { round: 1, turn: 0, rows: rwT(2) }); netT.combatSet('m1', { round: 1, turn: 1, rows: rwT(3) }); netT.combatStep('m1', 1); netT.combatStep('m1', 1); netT.combatStep('m1', -1); netT.combatStep('m1', -1); netT.combatStep('m1', -1); netT.combatStep('m1', -1);
    check('T2b the turn\'s start (net.js, run for real): at the combat\'s start (after the round), on each step that moves the turn (after the round when it changes too) — never on a roster edit, or a step back at round 1\'s first turn',
        j(callsT) === j(['R1', 'T1.0', 'T1.2', 'R2', 'T2.0', 'R1', 'T1.2', 'T1.1', 'T1.0']), j(callsT));
})());

// Turn-based combat T3a (D11, owner): walls stop a player's token — the host's pos gate (net.js, run for real) asks the fog for the move from
// where the drag began; the campaign's mode: refuse (mid-drag moves are not applied; the drop puts the token back for everyone, the mover
// too, with a note), warn (through, a note to the mover and the GM), off; a client shows the note from its synced host only, as plain text
{
    const posW = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), tnW = between('// [netcheck:turnnote-start]', '// [netcheck:turnnote-end]', 'turnnote');
    const runW = (mode, moves, o) => {
        o = o || {}; const w = { id: 't1', isChar: true, charId: 'c_w', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, map = { type: 'map', whiteboard: [w] }, camp = { items: { m1: map }, turnRules: mode === undefined ? undefined : { walls: mode } };
        const out = { bcast: [], dom: [], toasts: [], sent: [], asked: [], bells: [] }, conn = { peer: 'pA', send: m => out.sent.push(m) };
        const env = { net: { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' } }, tokenDropped() {} }, campOf: () => camp, validKey: k => k === 'm1', peerPaused: () => false, allow: () => true, checkRoomHandouts() {},
            applyPosToDom: m => out.dom.push(m), broadcastPos: (m, ex) => out.bcast.push([m.x, m.y, m.final, ex === null ? 'all' : 'others']), toast: t => out.toasts.push(t), saveRemoteSoon() {}, sendFailed: e => { throw e; },
            window: { wpFog: { moveBlocked: (mp, tok, fx, fy, tx, ty) => { out.asked.push([fx, fy, tx, ty]); return tx >= 200 && fx < 200; } } }, setTimeout: f => f(), bellOut: (cid, note) => out.bells.push([cid, note.title, note.text]) };
        const run = new Function('env', 'msg', 'conn', 'var net = env.net, campOf = env.campOf, validKey = env.validKey, peerPaused = env.peerPaused, allow = env.allow, checkRoomHandouts = env.checkRoomHandouts, applyPosToDom = env.applyPosToDom, broadcastPos = env.broadcastPos, toast = env.toast, saveRemoteSoon = env.saveRemoteSoon, sendFailed = env.sendFailed, window = env.window, setTimeout = env.setTimeout, bellOut = env.bellOut;\n' + posW + '\nreturn function(m, c) { return handlePos(m, c); };')(env);
        moves.forEach(mv => run(Object.assign({ type: 'pos', campId: 'c', itemId: 'm1', wbId: 't1' }, mv), conn));
        out.at = [w.x, w.y]; return out;
    };
    const drag = [{ x: 100, y: 0 }, { x: 250, y: 0 }, { x: 300, y: 0, final: true }];
    const rf = runW(undefined, drag), rfE = runW('refuse', drag), wn = runW('warn', drag), of = runW('off', drag), ok = runW('refuse', [{ x: 100, y: 0 }, { x: 150, y: 0, final: true }]);
    const two = runW('refuse', [{ x: 100, y: 0, final: true }, { x: 150, y: 0 }, { x: 250, y: 0, final: true }]);
    check('walls (host, run for real): refuse by default — a move past the wall is not applied mid-drag, the drop puts the token back where the drag began for everyone (the mover too) with one note to them; every check measures from where the drag began',
        j(rf.at) === j([0, 0]) && j(rf.bcast) === j([[100, 0, false, 'others'], [0, 0, true, 'all']]) && rf.sent.length === 1 && rf.sent[0].type === 'turn-note' && /wall/.test(rf.sent[0].text) && rf.asked.every(a => a[0] === 0 && a[1] === 0) && j(rfE) === j(rf), j(rf));
    check('walls: warn lets the move through with a note to the mover and the GM; off never asks; a move clear of the wall goes through untouched; each drop begins the next drag from where it landed',
        j(wn.at) === j([300, 0]) && wn.sent.length === 1 && /went through a wall/.test(wn.sent[0].text) && wn.toasts.length === 1 && j(of.at) === j([300, 0]) && !of.asked.length && !of.sent.length
        && j(ok.at) === j([150, 0]) && !ok.sent.length && j(two.at) === j([100, 0]) && j(two.asked.map(a => a[0])) === j([0, 100, 100]), j([wn, of.asked, two]));
    const runTN = (msg, o) => { o = o || {}; const t = []; new Function('msg', 'conn', 'net', 'toast', 'bellOut', tnW)(msg, { peer: o.peer || 'h' }, { foreign: true, syncedPeer: 'h', stream: false }, x => t.push(x), (cid, note) => (o.bells || []).push([cid, note.title, note.text])); return t; };
    check('turn-note (client, run for real): the synced host\'s note shows as one plain line (controls and bidi marks out, 200 at most); nothing from another peer or that is not text',
        j(runTN({ type: 'turn-note', text: 'A wall\u202e\u0007 is <b>here</b>' + 'x'.repeat(300) })) === j(['A wall   is <b>here</b>' + 'x'.repeat(177)]) && !runTN({ type: 'turn-note', text: 'x' }, { peer: 'o' }).length && !runTN({ type: 'turn-note', text: 5 }).length);
    const tb = [], tbN = []; runTN({ type: 'turn-note', text: 'Your \u202eturn', charId: 'c_p' }, { bells: tb }); runTN({ type: 'turn-note', text: 'x', charId: '../c' }, { bells: tbN }); runTN({ type: 'turn-note', text: 'x', charId: 5 }, { bells: tbN }); runTN({ type: 'turn-note', text: 'x' }, { bells: tbN }); runTN({ type: 'turn-note', text: ' ', charId: 'c_p' }, { bells: tbN }); runTN({ type: 'turn-note', text: 'x', charId: 'c_p' }, { peer: 'o', bells: tbN });
    const tnS = (() => { const T = src.replace(/\r\n/g, '\n'), i = T.indexOf('function turnNote(conn, text, cid) {'); return i < 0 ? '' : T.slice(i, T.indexOf('\n}\n', i) + 2); })();
    const tnSent = [], tnC = { send: m => tnSent.push(m) }, TNf = new Function('sendFailed', tnS + '\nreturn turnNote;')(e => { throw e; });
    TNf(tnC, 'a', 'c_p'); TNf(tnC, 'b', '../x'); TNf(tnC, 'c'); TNf(tnC, 'd', 5); TNf(tnC, 'e', 'c_' + 'x'.repeat(30)); TNf(null, 'f', 'c_p');
    check('The bell (Bell-b): turnNote (net.js, run for real) adds the character only when it is a well-formed id (a path, a number, none, one too long: the note alone); no connection, nothing',
        j(tnSent) === j([{ type: 'turn-note', text: 'a', charId: 'c_p' }, { type: 'turn-note', text: 'b' }, { type: 'turn-note', text: 'c' }, { type: 'turn-note', text: 'd' }, { type: 'turn-note', text: 'e' }]), j(tnSent));
    check('The bell (Bell-b): a turn note naming a character goes to that character\'s bell as its cleaned line (sheets.js takes the player\'s own only); none for a bad or missing id, an empty line or another peer; on the host the walls\' notes name the token\'s character and Warn also notes it in the GM\'s bell',
        j(tb) === j([['c_p', 'Turn', 'Your  turn']]) && !tbN.length && rf.sent.every(m => m.charId === 'c_w') && wn.sent[0].charId === 'c_w' && j(wn.bells) === j([['c_w', 'Turn', 'Moved through a wall.']]) && !rf.bells.length && !of.bells.length, j([tb, tbN, rf.sent, wn.sent, wn.bells]));
}

// Turn-based combat T3b (D2, D3, D5): the move limit and the out-of-turn lock on the host — the real pos gate and the real patch path together (a
// client saves its map right after a drop; that copy closes the drag, judged and counted from where it began, when the drag's final pos was
// lost), and the turn's start (turnMoveStart: the allowance through the player's view, their note)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const posT = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), patT = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch'), tmT = between('// [netcheck:turnmove-start]', '// [netcheck:turnmove-end]', 'turnmove');
    const clT = src.slice(src.indexOf('var POSTURE_SET = '), src.indexOf('function sanitizeItem('));
    const lineT = k => { const i = src.indexOf(k); return src.slice(i, src.indexOf('\n', i)); };
    const helpT = ['function peerProfileId(', 'function fxLib(', 'function itemLib('].map(lineT).join('\n') + '\n';
    const sysT = Sx.cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_sp', key: 'Speed', kind: 'number', def: 30 }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }], rolls: [], combat: { turn: { move: 'Speed', unit: 'ft', diag: 'one' } } }, { F: Fx, gmView: true });
    const mkT = o => {
        o = o || {};
        const pat = { id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, orc = { id: 't_o', isChar: true, charId: 'c_o', x: 500, y: 0, w: 50, h: 50 }, free = { id: 't_f', isChar: true, charId: 'c_f', ownerId: 'u_a', x: 0, y: 500, w: 50, h: 50 };
        const map = { type: 'map', meta: { gridType: 'square' }, whiteboard: [pat, orc, free] };
        const camp = { id: 'c1', items: { m1: map }, system: o.system || sysT, turnRules: o.rules || {}, chars: { c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: {} }, c_o: { id: 'c_o', name: 'Orc', npc: true, values: {} } } };
        const out = { bcast: [], notes: [], toasts: [], sent: [], bells: [] }, conn = { peer: 'pA', open: true, send: m => out.sent.push(m) }, conn2 = { peer: 'pA2', open: true, send: m => out.sent.push(Object.assign({ to: 'pA2' }, m)) };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' }, pA2: { id: 'u_a', location: 'm1' } }, conns: [conn, conn2], tokenDropped() {}, combats: { m1: { round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_o', tokId: 't_o' }, { id: 'r_p', tokId: 't_p' }] } } };
        const win = { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true, campaignOn: () => true }, wpFog: { moveBlocked: (mp, w, fx, fy, tx, ty) => tx >= 1000, moveCells: (mp, w, fx, fy, tx, ty) => Math.max(Math.abs(tx - fx), Math.abs(ty - fy)) / 50 }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpFormula: Fx };
        const api = new Function('state', 'net', 'window', 'peerPaused', 'allow', 'checkRoomHandouts', 'applyPosToDom', 'broadcastPos', 'toast', 'saveRemoteSoon', 'sendFailed', 'setTimeout', 'playerStroke', 'SC', 'getActiveCampaign', 'bellOut',
            clT + ownKeySrc + helpT + posT + '\n' + patT + '\n' + tmT + '\nreturn { pos: function(m, c) { return handlePos(m, c); }, patch: function(m) { return applyClientItemFiltered(m, { id: "u_a" }); }, start: turnMoveStart };')(
            { appState: { campaigns: { c1: camp } } }, net, win, () => false, () => true, () => {}, () => {}, (m, ex) => out.bcast.push([m.wbId, m.x, m.y, ex === null ? 'all' : 'others']), t => out.toasts.push(t), () => {}, e => { throw e; }, f => f(), () => null, () => Sx, () => camp, (cid, note) => out.bells.push([cid, note.title, note.text]));
        if (o.allow !== undefined) net.turnMove = { m1: { rowId: 'r_p', tokId: 't_p', moved: o.moved || 0, allow: o.allow } };
        const P = (wb, x, y, fin) => api.pos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: wb, x, y, final: !!fin }, conn);
        const C = (wb, x, y) => { const copy = JSON.parse(JSON.stringify(map.whiteboard)); copy.find(w => w.id === wb).x = x; copy.find(w => w.id === wb).y = y; api.patch({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: copy } }); };
        out.notes = () => out.sent.filter(m => m.type === 'turn-note').map(m => (m.to ? m.to + ':' : '') + m.text);
        return { out, net, map, camp, pat, free, P, C, api };
    };
    const wt = mkT({ rules: { walls: 'refuse' }, turns: false }); wt.map.whiteboard.push({ id: 't_w', waiting: 1, ownerId: 'u_a', x: 0, y: 200, w: 50, h: 50 }); wt.C('t_w', 1100, 200); const wtW = wt.map.whiteboard.find(w => w.id === 't_w');
    const wt2 = mkT({ rules: { walls: 'refuse' }, turns: false }); wt2.map.whiteboard.push({ id: 't_w', waiting: 1, ownerId: 'u_a', x: 0, y: 200, w: 50, h: 50 }); wt2.C('t_w', 300, 200); const wt2W = wt2.map.whiteboard.find(w => w.id === 't_w');
    check('F1a the walls rule on a waiting token\'s map copy (run for real): past a wall it goes back (it never lands where a move would be refused); within the walls it moves',
        wtW.x === 0 && wtW.y === 200 && wt2W.x === 300, j([wtW, wt2W, wt.out.notes()]));
    // the pos path: within the move, past it (refuse), the copy that follows a refused drop, a lost final (the copy closes it), warn, off
    const a = mkT({ allow: 4 }); a.P('t_p', 50, 0); a.P('t_p', 100, 0, true); a.C('t_p', 100, 0);
    const aMoved = a.net.turnMove.m1.moved, aNotes = a.out.notes();
    a.P('t_p', 150, 0); a.P('t_p', 250, 0, true); a.C('t_p', 250, 0);
    check('T3b the move limit (host, run for real): a drop within the move goes through and counts from where its drag began, with a note of what is left; one past it is not applied mid-drag, goes back for everyone with a note, and the map copy that repeats it moves nothing and says nothing more',
        aMoved === 2 && j(aNotes) === j(['Moved 2 squares (10 ft); 2 squares (10 ft) left.']) && a.net.turnMove.m1.moved === 2 && a.pat.x === 100
        && j(a.out.notes().slice(1)) === j(['That is 3 squares (15 ft); you have 2 squares (10 ft) left.']) && a.out.bcast.filter(b => b[3] === 'all').length === 2 && a.out.bcast.filter(b => b[3] === 'all').every(b => b[1] === 100), j([aMoved, a.out.notes(), a.out.bcast]));
    const b = mkT({ allow: 4 }); b.P('t_p', 50, 0); b.C('t_p', 250, 0);
    const b2 = mkT({ allow: 4 }); b2.P('t_p', 50, 0); b2.C('t_p', 150, 0);
    check('T3b a drag whose final pos was lost: the map copy after it closes it — past the move, the token goes back to where the drag began for everyone, with a note to each of the player\'s connections; within it, the whole drag counts (from its start, not the last mid-drag place), with its note',
        b.pat.x === 0 && b.out.bcast.some(x => x[1] === 0 && x[3] === 'all') && j(b.out.notes()) === j(['That is 5 squares (25 ft); you have 4 squares (20 ft) left.', 'pA2:That is 5 squares (25 ft); you have 4 squares (20 ft) left.'])
        && b2.pat.x === 150 && b2.net.turnMove.m1.moved === 3 && j(b2.out.notes()) === j(['Moved 3 squares (15 ft); 1 square (5 ft) left.', 'pA2:Moved 3 squares (15 ft); 1 square (5 ft) left.']), j([b.out.notes(), b2.out.notes(), b2.net.turnMove]));
    const w = mkT({ allow: 4, rules: { move: 'warn' } }); w.P('t_p', 300, 0, true);
    const bo = mkT({ turn: 0, rules: { order: 'warn' } }); bo.P('t_p', 50, 0, true); const br = mkT({ turn: 0 }); br.P('t_p', 50, 0, true);
    const bp = mkT({ allow: 4 }); bp.P('t_p', 50, 0); bp.C('t_p', 250, 0); const bs = mkT(); bs.api.start('m1', bs.net.combats.m1);
    check('The bell (Bell-b): every turn note of the move gates names the token\'s character — Your turn, a counted or refused move, out of turn, and the map copy\'s note to each of the player\'s connections; Warn past the move or out of turn also notes it in the GM\'s bell; a refusal does not',
        [w, bo, br, bp, bs].every(x => { const tn = x.out.sent.filter(m => m.type === 'turn-note'); return tn.length > 0 && tn.every(m => m.charId === 'c_p'); }) && bp.out.sent.filter(m => m.type === 'turn-note').length === 2
        && j(w.out.bells) === j([['c_p', 'Turn', 'Moved 2 squares (10 ft) past the move.']]) && j(bo.out.bells) === j([['c_p', 'Turn', 'Moved out of turn.']]) && !br.out.bells.length && !bp.out.bells.length, j([w.out.bells, bo.out.bells, bs.out.sent]));
    const f = mkT({ allow: 4, rules: { move: 'off' } }); f.P('t_p', 300, 0, true);
    const g = mkT({ allow: 4 }); g.P('t_f', 400, 500, true);
    const nt = mkT({ allow: 4, turns: false }); nt.P('t_p', 300, 0, true);
    check('T3b the move limit\'s modes: warn lets it past with a note to the player and the GM; off neither stops nor counts nor notes; a token outside the combat and a table without turn-based combat are free',
        w.pat.x === 300 && j(w.out.notes()) === j(['That went 2 squares (10 ft) past your move.']) && w.out.toasts.length === 1 && f.pat.x === 300 && !f.out.notes().length && f.net.turnMove.m1.moved === 0
        && g.free.x === 400 && !g.out.notes().length && nt.pat.x === 300 && !nt.out.notes().length, j([w.out.notes(), w.out.toasts, f.out.notes()]));
    // out of turn
    const o1 = mkT({ turn: 0 }); o1.P('t_p', 50, 0); o1.P('t_p', 100, 0, true); o1.C('t_p', 100, 0);
    const o2 = mkT({ turn: 0, rules: { order: 'warn' } }); o2.P('t_p', 100, 0, true);
    const o3 = mkT({ turn: 0, rules: { order: 'off' } }); o3.P('t_p', 100, 0, true);
    const o4 = mkT({ turn: 0 }); o4.C('t_p', 100, 0);
    const o5 = mkT({ turn: 0 }); o5.P('t_p', 50, 0); const o5mid = o5.pat.x;
    const wl = mkT(); wl.C('t_p', 1000, 0);
    const b3 = mkT({ allow: 4 }); b3.P('t_p', 50, 0); b3.C('t_p', 150, 0); b3.P('t_p', 200, 0, true);
    check('T3b out of turn: a token in the combat moves only on its turn — refused, not applied mid-drag and put back with one note (its map copy after moves nothing); a copy alone is refused too; warn lets it with notes to them and the GM; off lets it be. A map copy alone crossing a wall is put back with its note; a copy closes its drag, so the next drag begins where it landed',
        o1.pat.x === 0 && j(o1.out.notes()) === j(['It is not your turn: your token goes back.']) && o4.pat.x === 0 && o4.out.notes().length === 2 && o5mid === 0
        && wl.pat.x === 0 && /A wall is in the way/.test(wl.out.notes()[0] || '') && b3.pat.x === 200 && b3.net.turnMove.m1.moved === 4
        && o2.pat.x === 100 && j(o2.out.notes()) === j(['You moved out of turn.']) && o2.out.toasts.length === 1 && o3.pat.x === 100 && !o3.out.notes().length, j([o1.out.notes(), o4.out.notes(), o2.out.notes()]));
    // the turn's start: the allowance through the player's view
    const s1 = mkT(); s1.api.start('m1', s1.net.combats.m1);
    const s2 = mkT(); s2.api.start('m1', Object.assign({}, s2.net.combats.m1, { turn: 0 }));
    const s3 = mkT({ system: Sx.cleanSystem(Object.assign({}, sysT, { combat: { turn: { move: 'GMFig * 30', unit: 'ft' } } }), { F: Fx, gmView: true }) }); s3.api.start('m1', s3.net.combats.m1);
    const s4 = mkT({ turns: false }); s4.api.start('m1', s4.net.combats.m1);
    check('T3b the turn\'s start (turnMoveStart, run for real): the player\'s token gets its system\'s Move per turn as the map\'s cells (Speed 30 ft on 5 ft squares: 6) and each of its player\'s connections hears it; an NPC\'s token has no state; a move reading a GM-only value, or turn-based combat off, sets no limit',
        j(s1.net.turnMove.m1) === j({ rowId: 'r_p', tokId: 't_p', moved: 0, allow: 6 }) && j(s1.out.notes()) === j(['Your turn: 6 squares (30 ft) to move.', 'pA2:Your turn: 6 squares (30 ft) to move.'])
        && !('m1' in s2.net.turnMove) && s3.net.turnMove.m1.allow === null && !s3.out.notes().length && !('m1' in s4.net.turnMove), j([s1.net.turnMove, s1.out.notes(), s2.net.turnMove, s3.net.turnMove]));
})());

// Turn-based combat T4 (D4, D5): the actions a turn allows — the host's spend (net.js, run for real), the refill at a turn's start and the clearing
// at the combat's end, the player's counts on the wire (their connections only), and a client's intake (the synced host only, cleaned)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js'));
    const posA = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), taA = between('// [netcheck:turnacts-start]', '// [netcheck:turnacts-end]', 'turnacts'), aiA = between('// [netcheck:actsin-start]', '// [netcheck:actsin-end]', 'actsin');
    const pidA = ['function peerProfileId('].map(k => { const i = src.indexOf(k); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const mkA = o => {
        o = o || {};
        const map = { type: 'map', whiteboard: [{ id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_o', isChar: true, charId: 'c_o' }, { id: 't_q', isChar: true, charId: 'c_q', ownerId: 'u_a' }] };
        const camp = { id: 'c1', items: { m1: map }, turnRules: o.rules || {}, system: { combat: { turn: { acts: o.acts || [{ key: 'Action', n: 1 }, { key: 'Bonus', label: 'Bonus action', n: 2 }] } } }, chars: { c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a' }, c_o: { id: 'c_o', name: 'Orc', npc: true }, c_q: { id: 'c_q', name: 'Quin', ownerId: 'u_a' } } };
        const out = { sent: [], toasts: [], bells: [] }, mk = p => ({ peer: p, open: true, send: m => out.sent.push(Object.assign({ to: p }, m)) }), conns = [mk('pA'), mk('pA2'), mk('pB')];
        const net = { role: 'host', conns, roster: { pA: { id: 'u_a', location: 'm1' }, pA2: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' } }, combats: { m1: { round: 1, turn: 1, rows: [{ id: 'r_o', tokId: 't_o' }, { id: 'r_p', tokId: 't_p' }] } } };
        const api = new Function('net', 'window', 'SC', 'getActiveCampaign', 'own', 'toast', 'sendFailed', 'applyPosToDom', 'broadcastPos', 'bellOut', pidA + posA + '\n' + taA + '\nreturn { spend: actSpend, start: turnActsStart, end: turnActsEnd };')(
            net, { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => Sx, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), t => out.toasts.push(t), e => { throw e; }, () => {}, () => {}, (cid, note) => out.bells.push([cid, note.title, note.text]));
        const sp = (cost, ch) => api.spend(camp, ch || 'c_p', net.roster.pA, cost, conns[0], 'Pat');
        out.notes = () => out.sent.filter(m => m.type === 'turn-note').map(m => m.text);
        out.left = () => out.sent.filter(m => m.type === 'acts-left').map(m => m.to + ':' + JSON.stringify(m.left) + ':' + m.mode);
        return { out, net, camp, api, sp, conns };
    };
    const a = mkA(); const a1 = a.sp('Action'), a2 = a.sp('Action'), a3 = a.sp('Bonus');
    check('T4 actSpend (host, run for real): a press that costs an action spends it (a note of what is left; its player\'s connections hear the counts, another player nothing); none left under Refuse is refused with why, spending nothing; another action still has its own count',
        a1 === '' && a2 === 'No Action left this turn.' && a3 === '' && j(a.net.turnSpent) === j({ c_p: { Action: 1, Bonus: 1 } }) && j(a.out.notes()) === j(['Action: 0 of 1 left this turn.', 'Bonus action: 1 of 2 left this turn.'])
        && j(a.out.left()) === j(['pA:{"Action":0,"Bonus":2}:refuse', 'pA2:{"Action":0,"Bonus":2}:refuse', 'pA:{"Action":0,"Bonus":1}:refuse', 'pA2:{"Action":0,"Bonus":1}:refuse']), j([a1, a2, a3, a.net.turnSpent, a.out.notes(), a.out.left()]));
    const w = mkA({ rules: { acts: 'warn' } }); w.sp('Action'); const w2 = w.sp('Action');
    const f = mkA({ rules: { acts: 'off' } }); const f1 = f.sp('Action'), f2 = f.sp('Action');
    const nq = mkA(); const nq1 = nq.sp('Action', 'c_q');
    const nt = mkA({ turns: false }); nt.sp('Action'); const nt2 = nt.sp('Action');
    const nk = mkA(); const nk1 = nk.sp('Nope'), nk2 = nk.sp('');
    check('The bell (Bell-b): an action\'s turn note names its character (what is left, and past it under Warn), and Warn also notes it in the GM\'s bell; a spend within the count does not',
        w.out.sent.filter(m => m.type === 'turn-note').length === 2 && w.out.sent.filter(m => m.type === 'turn-note').every(m => m.charId === 'c_p') && j(w.out.bells) === j([['c_p', 'Turn', 'Used a Action past what a turn allows.']]), j([w.out.sent, w.out.bells]));
    check('T4 actSpend\'s modes and reach: Warn lets a press past the count through with a note to them and the GM (it still counts); Off neither counts nor notes; a character not in the combat, turn-based combat off, a cost naming no action or none: free',
        w2 === '' && w.net.turnSpent.c_p.Action === 2 && /used past what a turn allows/.test(w.out.notes()[1]) && w.out.toasts.length === 1 && j(w.out.left().pop()) === j('pA2:{"Action":0,"Bonus":2}:warn')
        && f1 === '' && f2 === '' && !f.out.sent.length && !('c_p' in f.net.turnSpent) && nq1 === '' && !('c_q' in nq.net.turnSpent) && nt2 === '' && !nt.out.sent.length && nk1 === '' && nk2 === '' && !nk.out.sent.length, j([w.net.turnSpent, w.out.notes(), f.out.sent]));
    const s = mkA(); s.sp('Action'); s.out.sent.length = 0; s.api.start('m1', s.net.combats.m1); const sAfter = j(s.net.turnSpent), sLeft = s.out.left();
    s.sp('Action'); s.out.sent.length = 0; s.api.end('m1', s.net.combats.m1); const eLeft = s.out.left();
    const s2 = mkA(); s2.sp('Action'); s2.api.start('m1', Object.assign({}, s2.net.combats.m1, { turn: 0 }));
    check('T4 a turn\'s start gives the character whose turn it is its actions back (its player hears the full counts); another\'s stay spent; the combat\'s end clears its characters\' counts (null: their sheets stop greying)',
        sAfter === '{}' && j(sLeft) === j(['pA:{"Action":1,"Bonus":2}:refuse', 'pA2:{"Action":1,"Bonus":2}:refuse']) && j(eLeft) === j(['pA:null:refuse', 'pA2:null:refuse']) && j(s2.net.turnSpent) === j({ c_p: { Action: 1 } }), j([sAfter, sLeft, eLeft, s2.net.turnSpent]));
    const runAI = (msg, o) => { o = o || {}; const net = { foreign: true, syncedPeer: 'h', stream: false, actsLeft: o.had || undefined }, seen = []; new Function('msg', 'conn', 'net', 'window', aiA)(Object.assign({ type: 'acts-left' }, msg), { peer: o.peer || 'h' }, net, { wpSheets: { charChanged: id => seen.push(id) } }); return { al: net.actsLeft, seen }; };
    const ai1 = runAI({ charId: 'c_p', left: { Action: 0, Bonus: 2, 'bad key': 1, Big: 12, Frac: 0.5, constructor: 1 }, mode: 'warn' }), ai2 = runAI({ charId: 'c_p', left: null }, { had: { c_p: { left: {}, mode: 'refuse' } } });
    check('T4 a client\'s counts (net.js, run for real): from the synced host only — action keys (in a map with no prototype: constructor is a key like any) and whole numbers 0 to 9 kept, anything else dropped, the mode refuse unless warn; null clears; its sheet and HUD redraw; nothing from another peer, a bad character id or a left that is neither',
        j(ai1.al.c_p) === j({ left: { Action: 0, Bonus: 2, constructor: 1 }, mode: 'warn' }) && Object.getPrototypeOf(ai1.al.c_p.left) === null && j(ai1.seen) === j(['c_p']) && !('c_p' in ai2.al) && j(ai2.seen) === j(['c_p'])
        && [runAI({ charId: 'c_p', left: {} }, { peer: 'o' }), runAI({ charId: 'x', left: {} }), runAI({ charId: 'c_p', left: [1] })].every(r => !r.seen.length), j([ai1, ai2]));
    const T = src.replace(/\r\n/g, '\n');
    check('T4 the presses on the host (source): a player\'s roll with a cost spends it once it is a valid roll, before it is recorded (refused: a roll-deny with why); a player\'s apply action once its change is worked out, before it lands; turnStarted refills, the combat\'s end clears',
        /var whyQ = Dq\.checkTableRoll\(resQ\); if \(whyQ\) \{ denyQ\(whyQ\); return; \}\n\s*if \(actQ && actQ\.cost && chQ && typeof actSpend === 'function'\) \{ var costQ = actSpend\(campQ, q\.charId, net\.roster\[conn\.peer\], actQ\.cost, conn, chQ\.name\); if \(costQ\) \{ denyQ\('error', \{ error: \{ message: costQ, pos: 0, len: 0 \} \}\); return; \} \}/.test(T)
        && /if \(!resA\.ok\) \{ denyA\(resA\.reason, resA\.message\); return; \}\n\s*var costA = typeof actSpend === 'function' \? actSpend\(campA, qa\.charId, profA, actA\.cost, conn, chA\.name\) : ''; if \(costA\) \{ denyA\('error', costA\); return; \}/.test(T)
        && /try \{ turnActsStart\(mapId, c\); \} catch \(e\)/.test(T) && /if \(had\) \{ try \{ turnActsEnd\(mapId, had\); \} catch \(e\)/.test(T));
})());

// Turn-based combat T5a (D9, D10): timed effects on the GM's own machine — a turn takes a round, a combat's start stops the clock and its end
// starts it, outside combat the clock runs (every character not in one); what runs out comes off with a private line for the GM and each of its
// player's connections (net.js fxtime, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ftS = between('// [netcheck:fxtime-start]', '// [netcheck:fxtime-end]', 'fxtime'), pidF = (() => { const i = src.indexOf('function peerProfileId('); return src.slice(i, src.indexOf('\n', i)) + '\n'; })();
    const sysF = Sx.cleanSystem({ v: 1, name: 'F', fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_b', name: 'Bless', dur: '2 turns', mods: [] }, { id: 'e_q', name: 'Quick', dur: '10 seconds', mods: [] }] }, { F: Fx, gmView: true });
    const mkF = o => {
        o = o || {};
        const map = { type: 'map', whiteboard: [{ id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_q', isChar: true, charId: 'c_q', ownerId: 'u_a' }] };
        const camp = { items: { m1: map }, system: sysF, chars: {
            c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 6, at: 0 } }] } },
            c_q: { id: 'c_q', name: 'Quin', ownerId: 'u_a', values: { f_fx: [{ id: 'x_2', ref: 'e_q', on: true, t: { left: 10, at: 1000 } }] } },
            c_r: { id: 'c_r', name: 'Rex', npc: true, values: { f_fx: [{ id: 'x_3', ref: 'e_q', on: true, t: { left: 10, at: 1000 } }] } } } };
        const out = { deltas: [], changed: [], chat: [], saves: 0 }, mk = p => ({ peer: p, open: true, sent: [], send(m) { this.sent.push(m); } }), conns = [mk('pA'), mk('pB')];
        const net = { active: true, role: o.role || 'host', stream: false, myId: 'u_gm', conns, roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } }, combats: o.combats || {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const api = new Function('net', 'window', 'SC', 'getActiveCampaign', 'own', 'saveRemoteSoon', 'pushChat', 'sendFailed', pidF + ftS + '\nreturn { apply: fxApply, turn: turnFxStart, edge: fxCombatEdge, clock: fxClockTick, inCombat: net.charInCombat };')(
            net, { wpVtt: { on: k => k !== 'sheets' || o.sheets !== false }, wpSheets: { charChanged: id => out.changed.push(id) } }, () => Sx, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), () => out.saves++, m => out.chat.push(m), e => { throw e; });
        return { out, net, camp, api, conns };
    };
    const cb = { round: 1, turn: 0, rows: [{ id: 'r_p', tokId: 't_p' }] };
    const a = mkF({ combats: { m1: cb } }); a.api.turn('m1', cb);
    check('T5a a turn\'s start (host, run for real): a round of the character\'s timed effects passes; one that runs out comes off (stored, sent as a delta, its views redrawn) with a private line for the GM and each connection of its player, never another\'s',
        j(a.camp.chars.c_p.values.f_fx) === '[]' && j(a.out.deltas) === j([['c_p', { f_fx: [] }]]) && j(a.out.changed) === j(['c_p']) && a.out.chat.length === 1 && a.out.chat[0].text === 'Bless ran out on Pat.' && a.out.chat[0].scope === 'whisper'
        && a.conns[0].sent.length === 1 && a.conns[0].sent[0].text === 'Bless ran out on Pat.' && !a.conns[1].sent.length && a.api.inCombat('c_p') === true && a.api.inCombat('c_q') === false, j([a.out, a.conns.map(c => c.sent)]));
    const b = mkF({ combats: { m1: cb } }); b.camp.chars.c_p.values.f_fx[0].t = { left: 6, at: Date.now() - 2000 }; b.api.edge('m1', cb, 'bank');
    const bT = b.camp.chars.c_p.values.f_fx[0].t; b.api.edge('m1', cb, 'resume'); const rT = b.camp.chars.c_p.values.f_fx[0].t;
    check('T5a a combat\'s start banks what ran and stops the clock; its end starts it again from now (what is left carries from one encounter to the next)',
        bT.at === 0 && bT.left < 6 && bT.left >= 0 && rT.left === bT.left && rT.at > 0, j([bT, rT]));
    const c = mkF({ combats: { m1: cb } }); c.camp.chars.c_p.values.f_fx[0].t = { left: 6, at: 1000 }; c.api.clock();   // Pat's clock long started: in the combat it must not tick
    const d = mkF({ role: 'client' }); d.api.clock();
    const e = mkF({ sheets: false }); e.api.clock();
    check('T5a the clock (every few seconds, on the GM\'s own machine): each character out of combat — Quick (10 s since long ago) runs out on Quin and on the NPC Rex (their lines: Quin\'s player hears it; an NPC\'s to the GM alone); Pat, in the combat, is left to his turns; a player\'s machine and a table without sheets run nothing',
        j(c.camp.chars.c_q.values.f_fx) === '[]' && j(c.camp.chars.c_r.values.f_fx) === '[]' && c.camp.chars.c_p.values.f_fx.length === 1 && j(c.out.chat.map(m => m.text)) === j(['Quick ran out on Quin.', 'Quick ran out on Rex.']) && c.conns[0].sent.length === 1
        && d.camp.chars.c_q.values.f_fx.length === 1 && !d.out.chat.length && e.camp.chars.c_q.values.f_fx.length === 1, j([c.out.chat, c.conns[0].sent]));
    const T = src.replace(/\r\n/g, '\n');
    check('T5a the wiring (source): a player\'s added effect starts its timer on the host with the host\'s clock and whether they are in a combat; turnStarted takes a round; a combat\'s start banks and its end resumes; the clock starts with the first render',
        /view: window\.wpSheets \? window\.wpSheets\.playerSystem\(campX\) : null, now: Date\.now\(\), inCombat: !!\(net\.charInCombat && net\.charInCombat\(qx\.charId\)\), timersGm: !!\(campX\.turnRules && campX\.turnRules\.timers === 'gm'\) \}\);/.test(T) && /try \{ turnFxStart\(mapId, c\); \} catch \(e\)/.test(T)
        && /if \(combat && !had\) \{ try \{ fxCombatEdge\(mapId, net\.combats\[mapId\], 'bank'\); \}/.test(T) && /if \(had\) \{ try \{ fxCombatEdge\(mapId, had, 'resume'\); \}/.test(T) && /function renderWhere\(\) \{\n\s*if \(typeof fxClockStart === 'function'\) fxClockStart\(\);/.test(T));
})());

// The combat roster on the wire (1.5.0): players get the order, never a number. A row's initiative can be the total of a roll the GM alone
// saw (the roster's Roll keeps one that reads a GM-only value private, and its total still sets the order); on a fogged map an unseen
// creature's row is Hidden whole. Run for real: the roster's Roll and Start (sliced from whiteboard.js) into net.js's combatSet, combatsFor,
// broadcastCombats and cleanCombats (the [netcheck:combats] slice), with anyFog and fogDrop as they are; fogDropIds is the one stand-in
{
    const cbSrc = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats');
    const setSrc = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet');
    const fogSrc = fnSrc('function fogDrop(', '\nfunction fogFilterClean(', 'fogDrop') + fnSrc('function anyFog(camp) {', '\n// Everything a player receives', 'anyFog');
    const wb = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const wbCut = (a, b, label) => { const i = wb.indexOf(a), k = wb.indexOf(b, i + 1); if (i < 0 || k < 0 || wb.indexOf(a, i + 1) >= 0) throw new Error('netcheck: ' + label + ' not found once in whiteboard.js'); return wb.slice(i, k); };
    const sortSrc = wbCut('function combatSortByInit(rows) {', '\nfunction renderCombatModal() {', 'combatSortByInit'), wireSrc = wbCut('(function wireCombatModal() {', '\nfunction renderCombatStrip() {', 'wireCombatModal');
    const fe = () => ({ on: {}, style: {}, value: '', addEventListener(t, f) { this.on[t] = f; }, querySelectorAll: () => [] });
    // o.fog: m1 is fogged; o.drops: { profileId: { tokId: 1 } } — what fogDropIds hides from whom (null when nothing, as it does);
    // o.rolled: what the sheet's rollInit gave (net.diceRoll's own shape: { ok, value, priv }, or { error })
    const scen = o => {
        o = o || {};
        const tok = (id, ownerId) => ({ id, isChar: true, ownerId: ownerId || null, x: 0, y: 0 });
        const camp = { id: 'k', activeItemId: 'm1', items: { m1: { type: 'map', meta: { title: 'Keep' }, fog: o.fog ? { on: true } : { on: false }, whiteboard: [tok('t_ana', 'u_a'), tok('t_orc'), tok('t_gob'), tok('t_x')] }, m2: { type: 'map', meta: { title: 'Yard' }, whiteboard: [] } } };
        const conns = [mkConn('pA'), mkConn('pB'), mkConn('pWait'), mkConn('pShut', false)];
        const net = { active: true, role: 'host', conns, roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' }, pShut: { id: 'u_s' } }, combats: {} };
        const out = { toasts: [], rolls: [], bcast: [], net, conns };
        const win = { wpFog: { fogDropIds: (pid, c, map) => (o.drops && map === c.items.m1 && o.drops[pid]) || null }, wpVtt: { on: k => k === 'fog' } };
        const broadcast = (msg, except) => { packCheck(msg); out.bcast.push(JSON.parse(JSON.stringify(msg))); conns.forEach(c => { if (c !== except && c.open && net.roster[c.peer]) c.send(msg); }); };   // admitted peers only, as the real one on a host
        const N = new Function('net', 'getActiveCampaign', 'window', 'broadcast', 'sendFailed', 'logEvent', 'toast', 'render', 'renderNotepad', fogSrc + '\n' + cbSrc + '\n' + setSrc + '\nreturn { cleanCombats, combatsFor, broadcastCombats };')(
            net, () => camp, win, broadcast, e => { throw e; }, () => {}, t => out.toasts.push(t), () => {}, () => {});
        out.N = N; out.camp = camp;
        const els = {}; ['combatModal', 'combatRows', 'combatAddBtn', 'combatAddName', 'combatCancelBtn', 'combatCloseBtn', 'combatStartBtn'].forEach(id => { els[id] = fe(); });
        const draft = { mapId: 'm1', running: false, rows: [
            { id: 'r_t_orc', name: 'Orc', tokId: 't_orc', init: 12, src: 'orc.png', on: true, charId: null },
            { id: 'r_t_ana', name: 'Ana', tokId: 't_ana', init: 0, src: 'ana.png', on: true, party: true, charId: 'c_a' },
            { id: 'r_t_gob', name: 'Goblin', tokId: 't_gob', init: 8, src: 'gob.png', on: true, charId: 'c_g' },
            { id: 'c_trap', name: 'Trap', tokId: null, init: 5, src: null, on: true, custom: true },
            { id: 'r_t_x', name: 'Bystander', tokId: 't_x', init: 3, src: null, on: false, charId: null }] };
        const sheets = { rollInit: cid => { out.rolls.push(cid); return o.rolled !== undefined ? o.rolled : { ok: true, value: 23, priv: true }; } };
        const W = new Function('document', 'window', 'toast', 'renderCombatModal', 'draft', 'var combatDraft = draft;\n' + sortSrc + '\n' + wireSrc + '\nreturn { draft: function() { return combatDraft; } };')(
            { getElementById: id => els[id] || null }, { wpSheets: sheets, wpNet: net }, t => out.toasts.push(t), () => {}, draft);
        const at = (sel, i) => ({ target: { closest: s => s === '.combat-row' ? { dataset: { i: String(i) } } : s === sel ? {} : null } });
        out.rollRow = name => { const i = W.draft().rows.findIndex(r => r.name === name); els.combatRows.on.click(at('.combat-roll', i)); };
        out.start = () => els.combatStartBtn.on.click({});
        out.draftRows = () => W.draft() && W.draft().rows.map(r => r.name + ':' + r.init);
        out.last = c => { const m = c.sent.filter(x => x.type === 'combats'); m.forEach(packCheck); return m.length ? JSON.parse(JSON.stringify(m[m.length - 1])) : null; };
        return out;
    };
    const rowsOf = m => m && m.combats && m.combats.m1 ? m.combats.m1.rows : null;
    const full = (id, name, tokId, src) => ({ id, name, tokId, src });
    const order = [full('r_t_gob', 'Goblin', 't_gob', 'gob.png'), full('r_t_orc', 'Orc', 't_orc', 'orc.png'), full('c_trap', 'Trap', null, null), full('r_t_ana', 'Ana', 't_ana', 'ana.png')];

    // no fog: the private roll's 23 puts the Goblin first for the GM and the players; the players' rows carry no number
    const a = scen();
    a.rollRow('Goblin');
    const aDraft = a.draftRows();
    a.start();
    const aHost = a.net.combats.m1, aMsg = a.last(a.conns[0]), aMsgB = a.last(a.conns[1]);
    check('combat roster (whiteboard + net.js, run for real): a private initiative roll still sets the order — its total fills the row and the roster sorts by it — and the host keeps every number for the GM\'s roster',
        j(a.rolls) === '["c_g"]' && j(aDraft) === j(['Goblin:23', 'Orc:12', 'Trap:5', 'Bystander:3', 'Ana:0']) && aHost.rows.map(r => r.name + ':' + r.init).join() === 'Goblin:23,Orc:12,Trap:5,Ana:0' && aHost.turn === 0 && aHost.round === 1,
        j([a.rolls, aDraft, aHost]));
    check('combat roster (no fog): players get the order, the names, the tokens and the pictures, never a number — one broadcast, the same for each admitted player; a waiting or closed connection gets nothing',
        j(aMsg) === j({ type: 'combats', combats: { m1: { mapId: 'm1', round: 1, turn: 0, rows: order } } }) && j(aMsgB) === j(aMsg) && a.bcast.length === 1 && j(a.bcast[0]) === j(aMsg)
        && a.conns[2].sent.length === 0 && a.conns[3].sent.length === 0 && j(a.bcast).indexOf('init') < 0 && j(a.bcast).indexOf('23') < 0, j([aMsg, a.bcast.length, a.conns[2].sent]));
    const snapA = a.N.combatsFor('u_a');
    check('combat roster: the join snapshot\'s combats (combatsFor, per player) carry no number either, and building them leaves the host\'s own rows as they were',
        j(snapA) === j(aMsg.combats) && aHost.rows[0].init === 23 && aHost.rows[0].src === 'gob.png' && aHost.rows.every(r => 'init' in r), j([snapA, aHost.rows[0]]));
    const cl = a.N.cleanCombats(aMsg.combats);
    check('combat roster (a player\'s machine): the host\'s rows without a number clean to 0 each, keeping the order, the turn and the round (nothing on a player\'s side reads it)',
        cl.m1.rows.map(r => r.name + ':' + r.init).join() === 'Goblin:0,Orc:0,Trap:0,Ana:0' && cl.m1.turn === 0 && cl.m1.round === 1 && cl.m1.mapId === 'm1', j(cl));

    // fog: a player who cannot see the Goblin gets a Hidden row with nothing of it (no name, token, picture, or the row id that carries its
    // token's); one who sees everything gets the plain order; a combat on an unfogged map at the same table has no number either
    const f = scen({ fog: true, drops: { u_a: { t_gob: 1 } } });
    f.rollRow('Goblin'); f.start();
    f.net.combatSet('m2', { mapId: 'm2', round: 2, turn: 1, rows: [{ id: 'c_tur', name: 'Turret', tokId: null, init: 9, src: null }, { id: 'c_gat', name: 'Gate', tokId: null, init: 4, src: null }] });
    const fA = f.last(f.conns[0]), fB = f.last(f.conns[1]);
    const hid = { id: 'h0', name: 'Hidden', tokId: null, src: null };
    check('combat roster (fog): an unseen creature\'s row is Hidden whole — no name, token, picture or token-bearing id — in its place in the order; nor is there a number on any row, on the fogged map or an unfogged one',
        j(rowsOf(fA)) === j([hid].concat(order.slice(1))) && j(fA.combats.m2) === j({ mapId: 'm2', round: 2, turn: 1, rows: [full('c_tur', 'Turret', null, null), full('c_gat', 'Gate', null, null)] })
        && j(fA).indexOf('gob') < 0 && j(fA).indexOf('Goblin') < 0 && j(fA).indexOf('init') < 0, j(fA));
    check('combat roster (fog): each admitted player gets their own copy (the one who sees the Goblin, the plain order); nothing goes to a waiting or closed connection; the host keeps the Goblin whole with its 23',
        j(rowsOf(fB)) === j(order) && j(fB).indexOf('init') < 0 && f.bcast.length === 0 && f.conns[2].sent.length === 0 && f.conns[3].sent.length === 0
        && f.net.combats.m1.rows[0].name === 'Goblin' && f.net.combats.m1.rows[0].init === 23 && f.net.combats.m1.rows[0].tokId === 't_gob', j([fB, f.net.combats.m1.rows[0]]));
    const fSnap = f.N.combatsFor('u_a'), fSnapB = f.N.combatsFor('u_b');
    check('combat roster (fog): the join snapshot for each player matches what the broadcast sent them', j(fSnap) === j(fA.combats) && j(fSnapB) === j(fB.combats), j([fSnap, fSnapB]));

    // the Roll button: a refusal toasts and changes nothing; an answer with no number (a request still waiting) changes nothing
    const e1 = scen({ rolled: { error: 'Dice are off for this campaign (Settings > VTT features).' } }); e1.rollRow('Goblin');
    const e2 = scen({ rolled: { ok: true, pending: true } }); e2.rollRow('Goblin');
    check('combat roster: a refused initiative roll toasts its reason and leaves the order; one with no number yet leaves it too',
        j(e1.toasts) === j(['Dice are off for this campaign (Settings > VTT features).']) && j(e1.draftRows()) === j(['Orc:12', 'Ana:0', 'Goblin:8', 'Trap:5', 'Bystander:3']) && j(e2.draftRows()) === j(e1.draftRows()) && e2.toasts.length === 0,
        j([e1.toasts, e1.draftRows(), e2.draftRows()]));
    check('combat roster (source): a roll\'s answer is net.diceRoll\'s own ({ ok, value, priv }) through the sheet\'s rollInit; combats go to players only through combatsFor (the broadcast, the join snapshot, the one player whose sight moved and, fold M7, a copy caught up in place), never net.combats as it is',
        /return \{ ok: true, value: res\.value, priv: !!rec\.priv \};/.test(src) && (src.match(/type: 'combats'/g) || []).length === 4 && (between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove').match(/type: 'combats'/g) || []).length === 1
        && (src.match(/if \(inFight\) c\.send\(\{ type: 'combats', combats: combatsFor\(pid\) \}\);/g) || []).length === 2 && /combats: combatsFor\(prof\.id\)/.test(src) && !/combats: net\.combats/.test(src)
        && /broadcast\(\{ type: 'combats', combats: combatsFor\(null\) \}, null\)/.test(src) && /c\.send\(\{ type: 'combats', combats: combatsFor\(pr\.id\) \}\)/.test(src));

    // Fold M0 (a security fix): a token the GM hides after the fight began reaches players as a nameless stub, so its row goes out Hidden too, on
    // a table without fog as on a fogged one (combatHidden, run for real in combatsFor and broadcastCombats); the host keeps the row whole. m2
    // holds a hidden token with the Orc's id and a combat of its own: a hidden token counts on its own map only. An item whose id reads 'null'
    // (a file may hold any id) is hidden on m1: a row with no token is never touched
    const tokOf = (s, mapId, id) => s.camp.items[mapId].whiteboard.find(w => w.id === id);
    const hidRow = i => ({ id: 'h' + i, name: 'Hidden', tokId: null, src: null });
    const hideWorld = o => {
        const s = scen(o); s.rollRow('Goblin'); s.start(); s.net.combats.m1.round = 3; s.net.combats.m1.turn = 1;
        s.camp.items.m1.whiteboard.push({ id: 'null', hidden: true, x: 0, y: 0 });
        s.camp.items.m2.whiteboard.push({ id: 't_orc', isChar: true, hidden: true, x: 0, y: 0 });
        s.net.combats.m2 = { mapId: 'm2', round: 2, turn: 2, rows: [{ id: 'r_g2', name: 'Goblin2', tokId: 't_gob', init: 6, src: 'g2.png' }, { id: 'r_o2', name: 'Orc2', tokId: 't_orc', init: 4, src: 'o2.png' }, { id: 'c_gate', name: 'Gate', tokId: null, init: 2, src: null }] };
        tokOf(s, 'm1', 't_gob').hidden = true; return s;
    };
    const m2Out = hid1 => ({ mapId: 'm2', round: 2, turn: 2, rows: [full('r_g2', 'Goblin2', 't_gob', 'g2.png'), hid1 ? hidRow(1) : full('r_o2', 'Orc2', 't_orc', 'o2.png'), full('c_gate', 'Gate', null, null)] });
    const U = hideWorld(), ub0 = U.bcast.length; U.N.broadcastCombats();
    const uA = U.last(U.conns[0]), uB = U.last(U.conns[1]), uSnap = [U.N.combatsFor('u_a'), U.N.combatsFor(null)], uHost = U.net.combats.m1.rows[0];
    check('fold M0: on a table without fog a token the GM hid after the fight began goes out as a Hidden row (broadcastCombats, run for real) — no name, token, picture or token-bearing id, in its place, with the order, the count, the round and the turn intact and every other row whole (the Trap, with no token, too); a hidden token on another map than the combat\'s hides nothing, and one hidden on the combat\'s own map does',
        j(uA) === j({ type: 'combats', combats: { m1: { mapId: 'm1', round: 3, turn: 1, rows: [hidRow(0)].concat(order.slice(1)) }, m2: m2Out(true) } })
        && j(rowsOf(uA)).indexOf('gob') < 0 && j(rowsOf(uA)).indexOf('Goblin') < 0 && j(uA.combats.m2).indexOf('Orc2') < 0 && j(uA.combats.m2).indexOf('o2.png') < 0, j(uA));
    check('fold M0: without fog that is still one broadcast, the same for each admitted player, nothing to a waiting or closed connection; the join snapshot (combatsFor) says the same; the host keeps the hidden token\'s row whole with its number',
        U.bcast.length === ub0 + 1 && j(uB) === j(uA) && j(U.bcast[U.bcast.length - 1]) === j(uA) && U.conns[2].sent.length === 0 && U.conns[3].sent.length === 0
        && j(uSnap) === j([uA.combats, uA.combats]) && j(uHost) === j({ id: 'r_t_gob', name: 'Goblin', tokId: 't_gob', init: 23, src: 'gob.png' }), j([U.bcast.length - ub0, uSnap, uHost]));
    tokOf(U, 'm1', 't_gob').hidden = false; tokOf(U, 'm2', 't_orc').hidden = false; U.N.broadcastCombats(); const uShown = U.last(U.conns[0]);
    check('fold M0: a token shown again goes out whole — its row as it was, on both maps',
        j(uShown) === j({ type: 'combats', combats: { m1: { mapId: 'm1', round: 3, turn: 1, rows: order }, m2: m2Out(false) } }), j(uShown));
    // fogged: Bo cannot see the Orc on m1; the Goblin is hidden
    const Fh = hideWorld({ fog: true, drops: { u_b: { t_orc: 1 } } }), fb0 = Fh.bcast.length; Fh.N.broadcastCombats();
    const fhA = Fh.last(Fh.conns[0]), fhB = Fh.last(Fh.conns[1]);
    check('fold M0: on a fogged table the hidden token\'s row is Hidden in every player\'s own copy (per-player sends, no broadcast), alongside a row hidden by their sight — Ana, who sees the Orc, gets it whole; Bo gets both Hidden, each by its place; the Trap and Ana whole; m2 (no fog there) as on a table without fog; the join snapshot matches',
        Fh.bcast.length === fb0 && fb0 === 0 && j(fhA) === j({ type: 'combats', combats: { m1: { mapId: 'm1', round: 3, turn: 1, rows: [hidRow(0)].concat(order.slice(1)) }, m2: m2Out(true) } })
        && j(fhB) === j({ type: 'combats', combats: { m1: { mapId: 'm1', round: 3, turn: 1, rows: [hidRow(0), hidRow(1), order[2], order[3]] }, m2: m2Out(true) } })
        && Fh.conns[2].sent.length === 0 && Fh.conns[3].sent.length === 0 && j(Fh.N.combatsFor('u_a')) === j(fhA.combats) && j(Fh.N.combatsFor('u_b')) === j(fhB.combats), j([fhA, fhB, Fh.bcast.length]));

    // net.syncCombatHidden (run for real): the host sends the combats again only when a running row's hidden flag changes
    const Sy = scen(); Sy.rollRow('Goblin'); Sy.start();
    const syn = () => { const n = Sy.bcast.length; Sy.net.syncCombatHidden(); return Sy.bcast.length - n; };
    const syFirst = syn() + syn(), syQuiet = syn();
    tokOf(Sy, 'm1', 't_gob').hidden = true; const syHide = syn(), syHideMsg = Sy.bcast[Sy.bcast.length - 1], syHideAgain = syn();
    tokOf(Sy, 'm1', 't_x').hidden = true; Sy.camp.items.m1.whiteboard.push({ id: 'null', hidden: true }); const syOff = syn();   // the Bystander, left out of the fight, and an item no row names
    tokOf(Sy, 'm1', 't_gob').hidden = false; const syShow = syn(), syShowMsg = Sy.bcast[Sy.bcast.length - 1];
    Sy.net.combats.m2 = { mapId: 'm2', round: 1, turn: 0, rows: [{ id: 'c_tur', name: 'Turret', tokId: null, init: 9, src: null }] }; const syAdd = syn(), syAddMsg = Sy.bcast[Sy.bcast.length - 1];
    delete Sy.net.combats.m2; const syDel = syn();
    const cliBefore = Sy.conns.map(c => c.sent.length).join(); Sy.net.role = 'client'; tokOf(Sy, 'm1', 't_orc').hidden = true; const syCli = syn(), cliSent = Sy.conns.map(c => c.sent.length).join();
    Sy.net.role = 'host'; Sy.net.active = false; const syOffline = syn(); Sy.net.active = true; const syBack = syn(), syBackMsg = Sy.bcast[Sy.bcast.length - 1];
    check('fold M0: net.syncCombatHidden (run for real on a table without fog) sends the combats at most once while the flags stay the same, then nothing; one broadcast when a running row\'s token is hidden (its row Hidden) and nothing more after; nothing when a token no running row names is hidden; one more when it is shown (its row whole again)',
        syFirst <= 1 && syQuiet === 0 && syHide === 1 && j(rowsOf(syHideMsg)) === j([hidRow(0)].concat(order.slice(1))) && syHideAgain === 0 && syOff === 0 && syShow === 1 && j(rowsOf(syShowMsg)) === j(order),
        j([syFirst, syQuiet, syHide, syHideAgain, syOff, syShow, syHideMsg, syShowMsg]));
    check('fold M0: a combat added or removed changes what net.syncCombatHidden compares (one send each); on a player\'s machine or with no session it sends nothing, and once hosting again it catches up with a change made meanwhile',
        syAdd === 1 && !!syAddMsg.combats.m2 && syDel === 1 && syCli === 0 && cliSent === cliBefore &&syOffline === 0 && syBack === 1 && rowsOf(syBackMsg)[1].name === 'Hidden' && rowsOf(syBackMsg)[1].id === 'h1',
        j([syAdd, syDel, syCli, syOffline, syBack]));
    const Sf = scen({ fog: true }); Sf.rollRow('Goblin'); Sf.start(); Sf.net.syncCombatHidden(); Sf.conns.forEach(c => { c.sent.length = 0; });
    tokOf(Sf, 'm1', 't_gob').hidden = true; Sf.net.syncCombatHidden();
    const sfOut = Sf.conns.map(c => c.sent.filter(m => m.type === 'combats').length).join(''), sfRows = [rowsOf(Sf.last(Sf.conns[0])), rowsOf(Sf.last(Sf.conns[1]))];
    check('fold M0: on a fogged table net.syncCombatHidden sends each admitted player their own copy, the hidden token\'s row Hidden; no broadcast, nothing to a waiting or closed connection',
        sfOut === '1100' && Sf.bcast.length === 0 && j(sfRows) === j([[hidRow(0)].concat(order.slice(1)), [hidRow(0)].concat(order.slice(1))]), j([sfOut, sfRows]));

    // what the table holds is recorded by every send of the rows to the table: a re-hide after another send (a turn step, a Start) still goes out
    const Sr = scen(); Sr.rollRow('Goblin'); Sr.start(); Sr.net.syncCombatHidden();
    const srn = () => { const n = Sr.bcast.length; Sr.net.syncCombatHidden(); return Sr.bcast.length - n; };
    tokOf(Sr, 'm1', 't_gob').hidden = true; const srHide = srn(); tokOf(Sr, 'm1', 't_gob').hidden = false; Sr.N.broadcastCombats(); const srWhole = rowsOf(Sr.bcast[Sr.bcast.length - 1]);
    tokOf(Sr, 'm1', 't_gob').hidden = true; const srReHide = srn(), srReMsg = Sr.bcast[Sr.bcast.length - 1], srQuiet = srn();
    check('fold M0: a token hidden again after the rows went out whole for another reason (a turn step) is sent again: every send of the rows to the table records what it holds, so net.syncCombatHidden compares with what the players last got',
        srHide === 1 && j(srWhole) === j(order) && srReHide === 1 && j(rowsOf(srReMsg)) === j([hidRow(0)].concat(order.slice(1))) && srQuiet === 0, j([srHide, srWhole, srReHide, srReMsg, srQuiet]));
    const ioSrcM0 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), undoLine = (ioSrcM0.match(/\n[^\n]*if \(hosting\) \{ window\.wpNet\.applyingRemote = true; save\(true\);[^\n]*/) || [''])[0];
    check('fold M0 (source): the GM\'s undo while hosting (io.js), saved as a remote change so the host\'s save hook returns early, calls net.syncCombatHidden itself, after the map and the other maps it undid went out',
        undoLine.length > 0 && /window\.wpNet\.sendItem\(camp\.id, item\.id\);[^\n]*wUndo\.forEach\([^\n]*broadcastItemFiltered[^\n]*\}\); if \(window\.wpNet\.syncCombatHidden\) window\.wpNet\.syncCombatHidden\(\); \}/.test(undoLine), undoLine.slice(0, 400));
    // the host's save calls it right after the map it saved went out (its stub first), run for real: net.onLocalSave sliced whole, over stubs
    const olsSrc = fnSrc('net.onLocalSave = function() {', '\n};\n', 'onLocalSave') + '\n};';
    const SYNCS = ['syncStance', 'syncSounds', 'syncMusic', 'syncSystem', 'syncSenses', 'syncDocStyle', 'syncCampName', 'syncTurnRules', 'syncLibrary', 'syncNewPlayers', 'syncCampFog'];
    const runSave = (s, patch) => {
        const log = [], real = s.net.syncCombatHidden;
        SYNCS.forEach(k => { s.net[k] = () => log.push(k); });
        s.net.sendItem = (c, i) => { log.push('sendItem:' + i); s.conns.forEach(cn => { if (cn.open && s.net.roster[cn.peer]) cn.send({ type: 'item', campId: c, itemId: i }); }); };
        s.net.syncCombatHidden = () => { log.push('combatHidden'); real(); };
        new Function('net', 'window', 'activeItemPatch', 'quickHash', '_lastPatchHash', 'broadcast', 'scheduleStageFollow', 'getActiveMap', 'checkRoomHandouts', olsSrc)(
            s.net, {}, () => (patch ? { campId: 'k', itemId: 'm1', item: { id: 'm1' } } : null), () => 'h', {}, m => log.push('broadcast:' + m.type), () => log.push('follow'), () => null, () => {});
        s.net.onLocalSave(); s.net.syncCombatHidden = real; return log;
    };
    const Ls = scen(); Ls.rollRow('Goblin'); Ls.start(); Ls.net.syncCombatHidden(); tokOf(Ls, 'm1', 't_gob').hidden = true; Ls.conns.forEach(c => { c.sent.length = 0; });
    const lsHost = runSave(Ls, true), lsWire = Ls.conns[0].sent.map(m => m.type), lsRows = rowsOf(Ls.last(Ls.conns[0]));
    const lsNoPatch = runSave(Ls, false);
    Ls.net.role = 'client'; const lsCli = runSave(Ls, true); Ls.net.role = 'host'; Ls.net.applyingRemote = true; const lsRemote = runSave(Ls, true); Ls.net.applyingRemote = false;
    check('fold M0: the host\'s save (net.onLocalSave, run for real) calls net.syncCombatHidden once, right after the map went out (sendItem) — a player gets the map (its stub) first, then the combats with the row Hidden; a save with no map to send still calls it once; a player\'s save and a remote change\'s save never do',
        j(lsHost) === j(SYNCS.concat(['sendItem:m1', 'combatHidden', 'follow'])) && j(lsWire) === j(['item', 'combats']) && j(lsRows) === j([hidRow(0)].concat(order.slice(1)))
        && j(lsNoPatch) === j(SYNCS.concat(['combatHidden', 'follow'])) && lsCli.indexOf('combatHidden') < 0 && !lsCli.some(e => SYNCS.indexOf(e) >= 0) && lsCli.length > 0 &&j(lsRemote) === j([]), j([lsHost, lsWire, lsNoPatch, lsCli, lsRemote]));
    const wbAll = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
    check('fold M0 (source): combatHidden is defined once and read only by combatsFor and net.syncCombatHidden, inside the combats slice; net.syncCombatHidden is called once, from the host\'s save; the GM\'s own strip (whiteboard.js) reads neither; the host\'s message handler has the same number of branches as before',
        (src.match(/function combatHidden\(/g) || []).length === 1 && (src.match(/combatHidden\(/g) || []).length === 3 && (cbSrc.match(/combatHidden\(/g) || []).length === 3
        && (src.match(/syncCombatHidden/g) || []).length === 3 && (cbSrc.match(/syncCombatHidden/g) || []).length === 1 && (olsSrc.match(/syncCombatHidden/g) || []).length === 2 && (cbSrc.match(/_combatHidSig = combatHidSigNow\(\);/g) || []).length === 1
        && !/combatsFor|combatHidden|syncCombatHidden/.test(wbAll) && (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 24,
        j([(src.match(/combatHidden\(/g) || []).length, (src.match(/syncCombatHidden/g) || []).length, (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length]));
}

// Stage 6 F4b: a row's facts on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on ONE
// host whose state carries across messages: a bound switch's grace, a curse kept on, the owner's delta, the notices; every message packs
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysF = Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' }, lvl: { min: 0, max: 5, def: 1 } } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'It will not come off' }, { id: 'i_amu', name: 'Amulet', eq: 'curse', eqMsg: 'It clings' }, { id: 'i_blade', name: 'Blade' }, { id: 'i_veil', name: 'Veil', vis: 'gm', eq: 'curse' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysF, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: false }, { id: 'w_a1', defId: 'i_amu', qty: 1, on: false }, { id: 'w_b1', defId: 'i_blade', qty: 1 }, { id: 'w_v1', defId: 'i_veil', qty: 1, on: true }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) }, connB = { peer: 'pB', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SET = (rid, rowId, facts, conn) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.notes.length = 0; H.handle({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'set', rowId, facts }, conn || connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), notes: out.notes.slice() }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id);
    const r1 = SET('q1', 'w_r1', { on: true }), g1 = Object.keys(H.grace());
    const r2 = SET('q2', 'w_r1', { on: false });
    const r3 = SET('q3', 'w_r1', { on: true }); Object.keys(H.grace()).forEach(k => { H.grace()[k].until = 0; });
    const r4 = SET('q4', 'w_r1', { on: false });
    check('F4b on the wire, bound: switching the Ring on is acked, synced to its owner (a teammate\'s copy carries nothing of the list) and told to the GM ("switched on Ring ... bound"), and opens the switch\'s grace; switched off inside it, it comes off; once it lapses the host refuses with the GM\'s message ("stays"), tells the GM, and stores or sends nothing',
        j(r1.answer) === j([{ type: 'char-ack', rid: 'q1' }]) && ownRow(r1.owner, 'w_r1').on === true && !/f_wp|Ring|Readied|w_r1/.test(j(r1.mate)) && r1.notes.length === 1 && /switched on Ring .* bound: it stays on/.test(r1.notes[0]) && j(g1) === j(['c_1|f_wp|w_r1|on'])
        && j(r2.answer) === j([{ type: 'char-ack', rid: 'q2' }]) && ownRow(r2.owner, 'w_r1').on === false && r3.notes.length === 1
        && j(r4.answer) === j([{ type: 'char-deny', rid: 'q4', reason: 'stays', msg: 'It will not come off' }]) && r4.owner.length === 0 && row('w_r1').on === true && r4.notes.length === 1 && /tried to switch off Ring .* it stays on \(bound\)/.test(r4.notes[0]),
        j([r1, r2, r4, g1]));
    const c1 = SET('q5', 'w_a1', { on: true }), c2 = SET('q6', 'w_a1', { on: false });
    check('F4b on the wire, curse on contact: switched off by its owner the host keeps it on (keptOn) and acks with the GM\'s message; the owner\'s delta says off with no keptOn; the GM alone is told, both when it went on and when it stays on out of their sight',
        c1.notes.length === 1 && /switched on Amulet .* curse on contact/.test(c1.notes[0]) && j(c2.answer) === j([{ type: 'char-ack', rid: 'q6', msg: 'It clings' }]) && j(row('w_a1')) === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: true, keptOn: 1 })
        && j(ownRow(c2.owner, 'w_a1')) === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: false }) && !/keptOn|clings/.test(j(c2.owner)) && !/f_wp|Amulet|clings|keptOn|w_a1/.test(j(c2.mate)) && c2.notes.length === 1 && /switched off Amulet .* out of their sight/.test(c2.notes[0]),
        j([c1, c2, row('w_a1')]));
    const l1 = SET('q7', 'w_b1', { lvl: 9, note: 'my blade' }), v1 = SET('q8', 'w_v1', { on: false }), x1 = SET('q9', 'w_b1', { lvl: 2 }, connB), x2 = SET('q10', 'w_b1', { on: 'yes' }), x3 = SET('q11', 'w_b1', { lvl: '3' });
    check('F4b on the wire: a level is clamped by the host (9 to 5) and a note stored, both in the owner\'s delta; a GM-only item\'s curse is judged on the host\'s own entry and its inline copy reads off (no message: none was set); another player\'s change is "owner"; a malformed fact (a string switch or level) is dropped unanswered',
        j(row('w_b1')) === j({ id: 'w_b1', defId: 'i_blade', qty: 1, lvl: 5, note: 'my blade' }) && j(ownRow(l1.owner, 'w_b1')) === j(row('w_b1')) && j(l1.answer) === j([{ type: 'char-ack', rid: 'q7' }])
        && row('w_v1').keptOn === 1 && j(ownRow(v1.owner, 'w_v1')) === j({ id: 'w_v1', qty: 1, on: false, def: Sx.cleanRowDef({ name: 'Veil', vis: 'gm' }, false), lnk: 1 }) && j(v1.answer) === j([{ type: 'char-ack', rid: 'q8' }])
        && j(x1.answer) === j([{ type: 'char-deny', rid: 'q9', reason: 'owner' }]) && x2.answer.length === 0 && x3.answer.length === 0 && row('w_b1').lvl === 5,
        j([l1, v1, x1, row('w_v1')]));
    check('F4b the client sends a set op\'s facts beside the keys each op uses; the host judges them with the switch\'s grace from its own clock',
        /if \(q\.facts !== undefined\) mI\.facts = q\.facts;/.test(src) && /var ogI = !!\(_rowGrace\[gkI \+ '\|on'\] && _rowGrace\[gkI \+ '\|on'\]\.until > nowI\);/.test(src));
})());

// Stage 6 F4b review: the switch's grace is spent once (the GM switching it on again is not undone by it), and the lock covers dropping while it
// is on (owner) — the real char-item handler, delta and notice again, on one host whose state carries across messages
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' } } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'It will not come off' }, { id: 'i_amu', name: 'Amulet', eq: 'curse', eqMsg: 'It clings' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysR, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: false }, { id: 'w_a1', defId: 'i_amu', qty: 1, on: true }] } } } };
    const out = { answer: [], owner: [], notes: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), notes: out.notes.slice() }; };
    const vals = () => camp.chars.c_1.values.f_wp, row = id => vals().find(r => r.id === id);
    const g1 = SEND('q1', { op: 'set', rowId: 'w_r1', facts: { on: true } }), g2 = SEND('q2', { op: 'set', rowId: 'w_r1', facts: { on: false } }), spent = !('c_1|f_wp|w_r1|on' in H.grace());
    row('w_r1').on = true;   // the GM switches it on again, on their own sheet (a local change, not through this handler)
    const g3 = SEND('q3', { op: 'set', rowId: 'w_r1', facts: { on: false } });
    check('F4b review on the wire: a bound switch\'s grace lets it go once and is spent; the GM switching it on again inside what was left of the window holds (the player\'s switch-off is refused with the message)',
        j(g1.answer) === j([{ type: 'char-ack', rid: 'q1' }]) && j(g2.answer) === j([{ type: 'char-ack', rid: 'q2' }]) && spent && j(g3.answer) === j([{ type: 'char-deny', rid: 'q3', reason: 'stays', msg: 'It will not come off' }]) && row('w_r1').on === true,
        j([g1.answer, g2.answer, g3.answer, H.grace()]));
    const r1 = SEND('q4', { op: 'remove', rowId: 'w_r1' }), r2 = SEND('q5', { op: 'remove', rowId: 'w_a1' }), kept = vals().filter(r => r.defId === 'i_amu');
    check('F4b review on the wire (owner: the lock covers dropping while it is on): dropping the Ring while it is on is refused with its switch message and the GM is told of the attempt; dropping the Amulet while it is on leaves the owner\'s sheet (their delta has no Amulet) but stays on the character, hidden, under an id they never held, with the GM\'s message and a notice',
        j(r1.answer) === j([{ type: 'char-deny', rid: 'q4', reason: 'stays', msg: 'It will not come off' }]) && r1.owner.length === 0 && r1.notes.length === 1 && /tried to remove Ring/.test(r1.notes[0])
        && j(r2.answer) === j([{ type: 'char-ack', rid: 'q5', msg: 'It clings' }]) && kept.length === 1 && kept[0].hid === 1 && kept[0].on === true && kept[0].id !== 'w_a1' && !/i_amu|Amulet/.test(j(r2.owner)) && r2.notes.length === 1 && /dropped Amulet/.test(r2.notes[0]),
        j([r1, r2, kept]));
})());

// Stage 6 F4b follow-up: a refused attempt repeated is one notice per quiet window — the real char-item handler, delta and notice on one host;
// the player still gets every refusal, the GM one notice, and the next one after the window counts the tries that went unsaid
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysQ = Sx.cleanSystem({ v: 1, name: 'Q', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' } } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'It will not come off' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysQ, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: true }] } } } };
    const out = { answer: [], owner: [], notes: [], logs: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, tried: function() { return _triedSaid; } };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), (k, t) => out.logs.push(k + ':' + t));
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; out.logs.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), notes: out.notes.slice(), logs: out.logs.slice() }; };
    const OFF = rid => SEND(rid, { op: 'set', rowId: 'w_r1', facts: { on: false } }), deny = rid => j([{ type: 'char-deny', rid, reason: 'stays', msg: 'It will not come off' }]);
    const t1 = OFF('q1'), t2 = OFF('q2'), t3 = OFF('q3'), d1 = SEND('q4', { op: 'remove', rowId: 'w_r1' });
    Object.keys(H.tried()).forEach(k => { H.tried()[k].at = 0; });   // the quiet window lapses
    const t4 = OFF('q5'), t5 = OFF('q6');
    check('F4b follow-up on the wire: a player repeating a refused switch-off gets every refusal, but the GM one notice (toast and log) per 30 s quiet window; a refused drop is its own kind and still told; after the window the next notice counts the tries that went unsaid, and the count starts again',
        [t1, t2, t3, t4, t5].every((r, i) => j(r.answer) === deny('q' + [1, 2, 3, 5, 6][i])) && camp.chars.c_1.values.f_wp[0].on === true
        && t1.notes.length === 1 && /tried to switch off Ring/.test(t1.notes[0]) && !/more tr/.test(t1.notes[0]) && t1.logs.length === 1 && t2.notes.length === 0 && t2.logs.length === 0 && t3.notes.length === 0
        && d1.notes.length === 1 && /tried to remove Ring/.test(d1.notes[0])
        && t4.notes.length === 1 && /\(2 more tries since the last notice\)$/.test(t4.notes[0]) && t4.logs.length === 1 && t5.notes.length === 0
        && /_rowGrace = \{\}; _triedSaid = \{\};/.test(src),
        j([t1, t2, t3, d1, t4, t5]));
})());

// owed review F5a2 #3 (owner 2026-09-27): a player's pick over a hidden choice the GM set and holds on their copy — the real char-item handler
// (with the real delta and the GM's notice, sliced from net.js) on one host: acked and stored as theirs, the GM alone told; a GM-held visible
// choice or number still refused
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const a2_ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), a2_dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const a2_ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const a2_sys = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], listRules: { ownerStats: true }, fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 12 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'all', def: 10 }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', vis: 'gm', def: 17 },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Acc' }, { key: 'Ability', kind: 'pick', def: 'Plain', opts: [{ label: 'Plain', name: 'ST' }, { label: 'Other', name: 'DX' }, { label: 'Secret', name: 'GMFig' }] }] } }],
        items: [{ id: 'i_rp', name: 'Rapier', key: 'Rapier', stats: { Acc: 2 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: a2_sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_rp', defId: 'i_rp', qty: 1, ov: { stats: { Ability: 'Secret' }, held: ['Ability'] } }, { id: 'w_r2', defId: 'i_rp', qty: 1, ov: { stats: { Acc: 5, Ability: 'Other' }, held: ['Acc', 'Ability'] } }] } } } };
    const out = { answer: [], owner: [], notes: [], logs: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + a2_dlSrc + '\n' + a2_ntSrc + '\nreturn { handle: function(msg, conn) {\n' + a2_ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), (k, t) => out.logs.push(k + ':' + t));
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; out.logs.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), notes: out.notes.slice(), logs: out.logs.slice() }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id), r2Before = j(row('w_r2'));
    const p1 = SEND('q1', { op: 'ov', rowId: 'w_rp', ov: { stats: { Ability: 'Other' } } }), p2 = SEND('q2', { op: 'ov', rowId: 'w_r2', ov: { stats: { Ability: 'Plain' } } }), p3 = SEND('q3', { op: 'ov', rowId: 'w_r2', ov: { stats: { Acc: 1 } } });
    const a2_note = 'Ana changed Rapier’s Ability — their pick replaced the hidden choice you set (set it again with ✎ if you want it back).';
    check('F5a2 owed review #3 on the wire (owner 2026-09-27): a player\'s pick over a hidden choice the GM set on their copy is acked plainly and stored as theirs (their delta carries Other, nothing of Secret or GMFig), and the GM alone is told whose pick replaced which item\'s choice (a toast and the Items log); a GM-held visible choice or number is refused (field) with nothing stored, sent or told',
        j(p1.answer) === j([{ type: 'char-ack', rid: 'q1' }]) && j(row('w_rp').ov) === j({ stats: { Ability: 'Other' } }) && j(ownRow(p1.owner, 'w_rp')) === j({ id: 'w_rp', defId: 'i_rp', qty: 1, ov: { stats: { Ability: 'Other' } } }) && !/Secret|GMFig|hidden/.test(j(p1.owner))
        && j(p1.notes) === j([a2_note]) && j(p1.logs) === j(['items:' + a2_note])
        && j(p2.answer) === j([{ type: 'char-deny', rid: 'q2', reason: 'field' }]) && j(p3.answer) === j([{ type: 'char-deny', rid: 'q3', reason: 'field' }]) && p2.owner.length + p3.owner.length + p2.notes.length + p3.notes.length === 0 && j(row('w_r2')) === r2Before,
        j([p1, p2, p3, row('w_rp')]));
})());
// Stage 6 F4c1: stats and what was paid on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on
// one host; the players' view of both rows test systems and of a system keyed to trip the packer; 150 rows at their largest within budget
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const fxV = ['rows-d20', 'rows-3d6'].map(n => { try { const v = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(v); return [n, !/Heat|Vorpal|Hidden/.test(J(v)) && v.fields.some(f => f.list && Array.isArray(f.list.stats) && f.list.price) && v.items.some(i => i.stats)]; } catch (e) { return [n, false, e.message]; } });
    const trap = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', list: { stats: [{ key: 'constructor' }, { key: 'toString' }, { key: 'hasOwnProperty' }, { key: 'BYTES_PER_ELEMENT' }, { key: 'Acc' }] } }], items: [{ id: 'i_t', name: 'T', stats: JSON.parse('{"constructor":1,"toString":2,"hasOwnProperty":3,"BYTES_PER_ELEMENT":5,"Acc":4}') }] }, { F: Fx, gmView: false });
    let trapOk = true; try { packCheck(trap); } catch (e) { trapOk = e.message; }
    check('F4c1 on the wire: the players\' view of both rows test systems (list stats, a price, entry stats) packs and carries no GM-only list, item or key (Heat, Vorpal, Hidden); a list or an item keyed with the packer\'s own names (constructor, toString, hasOwnProperty) keeps none of them and packs',
        fxV.every(x => x[1]) && trapOk === true && J(trap.fields[0].list.stats.map(s => s.key)) === J(['Acc']) && J(trap.items[0].stats) === J({ Acc: 4 }), J([fxV, trapOk]));
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, price: 'Cost', stats: [{ key: 'Acc', show: true }, { key: 'Cost' }] } },
        { id: 'f_sc', key: 'Secret', label: 'Secret', kind: 'item-list', edit: 'owner', vis: 'gm', list: { stats: [{ key: 'Heat' }] } }],
        items: [{ id: 'i_blaster', name: 'Blaster', stats: { Acc: 2, Cost: 500, Heat: 7 } }, { id: 'i_rune', name: 'Rune', vis: 'gm', stats: { Acc: 5, Cost: 10, Heat: 9 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysP, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r', defId: 'i_rune', qty: 1, paid: 10 }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.notes.length = 0; const s0 = out.saves; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0 }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id);
    const a1 = SEND('q1', { op: 'add', defId: 'i_blaster', rowId: 'w_n1' }), afterAdd = J(row('w_n1'));
    const s1 = SEND('q2', { op: 'set', rowId: 'w_n1', facts: { paid: 1 } });
    const m1 = SEND('q3', { op: 'set', rowId: 'w_n1', facts: { paid: '5' } }), m2 = SEND('q4', { op: 'set', rowId: 'w_n1', facts: { paid: -1 } }), m3 = SEND('q5', { op: 'set', rowId: 'w_n1', facts: { note: 'hi', paid: '5' } });
    check('F4c1 on the wire: a player\'s add is acked and records what one cost from the host\'s own entry (500), stored and in their delta — beside their GM-only item\'s inline copy with its list\'s stats only (no Heat); a teammate\'s copy carries nothing of the list',
        J(a1.answer) === J([{ type: 'char-ack', rid: 'q1' }]) && afterAdd === J({ id: 'w_n1', defId: 'i_blaster', qty: 1, paid: 500 }) && J(ownRow(a1.owner, 'w_n1')) === afterAdd && a1.saves === 1
        && J((ownRow(a1.owner, 'w_r') || {}).def && ownRow(a1.owner, 'w_r').def.stats) === J({ Acc: 5, Cost: 10 }) && ownRow(a1.owner, 'w_r').paid === 10 && !/Heat|f_sc/.test(J(a1.owner)) && !/f_wp|Blaster|Rune/.test(J(a1.mate)), J([a1, afterAdd]));
    check('F4c1 on the wire: a player\'s change of what was paid is refused ("field") with nothing stored, sent or saved; a malformed paid (a string, below 0, beside another fact) is dropped unanswered and changes nothing',
        J(s1.answer) === J([{ type: 'char-deny', rid: 'q2', reason: 'field' }]) && s1.owner.length === 0 && s1.saves === 0 && [m1, m2, m3].every(r => r.answer.length === 0 && r.owner.length === 0 && r.saves === 0) && J(row('w_n1')) === afterAdd, J([s1, m1, m3, row('w_n1')]));
    const stats10 = Array.from({ length: 10 }, (_, i) => ({ key: 'S' + i, label: 'Stat number ' + i, show: i < 3 })), vals10 = v => { const o = {}; stats10.forEach((s, i) => { o[s.key] = v * (i + 1) + 0.25; }); return o; };
    const big = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, price: 'S0', stats: stats10 } }],
        items: [{ id: 'i_pub', name: 'A public item with a long name', notes: 'n'.repeat(200), stats: vals10(99) }, { id: 'i_gm', name: 'A GM-only item with a long name', vis: 'gm', notes: 'g'.repeat(200), stats: vals10(-9999999) }] }, { F: Fx, gmView: true });
    const rowsB = []; for (let i = 0; i < 150; i++) rowsB.push(i % 2 ? { id: 'w_p' + i, defId: 'i_pub', qty: 99, paid: 99999999.25, note: 'x'.repeat(200) } : { id: 'w_g' + i, defId: 'i_gm', qty: 99, paid: 123456.789, note: 'y'.repeat(200) });
    const viewB = Sx.cleanSystem(big, { F: Fx, gmView: false }), libB = {}; big.items.forEach(i => { libB[i.id] = i; });
    const projB = Sx.charFor({ id: 'c_b', name: 'B', ownerId: 'u_b', npc: false, values: { f_wp: rowsB } }, viewB, 'u_b', { items: libB }), msgB = { type: 'char', campId: 'k', char: projB };
    let packedB = true; try { packCheck(msgB); } catch (e) { packedB = e.message; }
    const sizeB = J(msgB).length, inlB = projB.values.f_wp.filter(r => r.lnk === 1);
    check('F4c1 on the wire: 150 rows at their largest (pointers with what was paid, GM-only items inline with ten stats, 200-character notes) project, pack and stay within 200,000 bytes (' + sizeB + ' bytes)',
        packedB === true && sizeB < 200000 && projB.values.f_wp.length === 150 && inlB.length === 75 && Object.keys(inlB[0].def.stats).length === 10 && projB.values.f_wp.every(r => typeof r.paid === 'number'), String(packedB) + ' ' + sizeB);
})());

// Stage 6 F4c3: custom rows on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on one host:
// a player's own row (acked, own in their delta, its Undo window open), the GM's fields refused, a GM-made row theirs to leave alone, a derived id,
// the list's tick, a key a GM-only entry has (accepted: never confirmed) and a visible one (refused with the reason alone); 150 custom rows in budget
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysC = Sx.cleanSystem({ v: 1, name: 'C', rolls: [], fields: [{ id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, cats: ['Skill'], stats: [{ key: 'Rel' }] } }],
        items: [{ id: 'i_karate', name: 'Karate', category: 'Skill', key: 'Karate' }, { id: 'i_hidden', name: 'Hidden', category: 'Skill', key: 'Hidden', vis: 'gm' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysC, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sk: [{ id: 'w_g', qty: 1, def: { name: 'Relic', damage: '2d6', rm: 'bound' } }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], saves: 0 }, all = [], box = b => m => { packCheck(m); const c = JSON.parse(J(m)); b.push(c); all.push(c); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; const s0 = out.saves, before = J(camp.chars.c_1.values.f_sk); H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_sk', op: 'custom' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0, same: J(camp.chars.c_1.values.f_sk) === before }; };
    const row = id => camp.chars.c_1.values.f_sk.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_sk || []).find(r => r.id === id), deny = (rid, reason) => J([{ type: 'char-deny', rid, reason }]);
    const n1 = SEND('q1', { rowId: 'w_p1', def: {} }), g1 = Object.keys(H.grace()), n2 = SEND('q2', { rowId: 'w_p1', def: { name: 'Pazaak', key: 'Hidden', stats: { Rel: 2 } } });
    const n3 = SEND('q3', { rowId: 'w_p1', def: { damage: '1d6' } }), n4 = SEND('q4', { rowId: 'w_g', def: { name: 'Mine' } }), n5 = SEND('q5', { rowId: 'w_karate', def: {} }), n6 = SEND('q6', { rowId: 'w_p2', def: { key: 'Karate' } });
    const n7 = SEND('q7', { rowId: 'w_p1', def: JSON.parse('{"stats":{"toString":1}}') }), n8 = SEND('q8', { rowId: 'w_p1' });
    delete camp.system.fields[0].list.custom; const n9 = SEND('q9', { rowId: 'w_p1', def: { name: 'X' } }); camp.system.fields[0].list.custom = true;
    check('F4c3 on the wire: a player\'s new custom row is acked, stored as theirs (own) and in their delta (a teammate gets nothing of the list), and opens its Undo window; their key a GM-only entry has is accepted (never confirmed) while a visible one\'s is refused with the reason alone; the GM\'s fields, a GM-made row, a derived id and a list without Custom rows are refused, storing and sending nothing; a malformed message is dropped unanswered; the GM\'s damage never reaches its owner',
        J(n1.answer) === J([{ type: 'char-ack', rid: 'q1' }]) && row('w_p1').own === 1 && ownRow(n1.owner, 'w_p1').own === 1 && !/f_sk/.test(J(n1.mate)) && g1.some(k => /w_p1/.test(k))
        && J(n2.answer) === J([{ type: 'char-ack', rid: 'q2' }]) && row('w_p1').def.key === 'Hidden' && ownRow(n2.owner, 'w_p1').def.name === 'Pazaak'
        && n3.answer.length === 1 && J(n3.answer) === deny('q3', 'field') && n3.same && n3.saves === 0 && J(n4.answer) === deny('q4', 'field') && n4.same && J(n5.answer) === deny('q5', 'value') && n5.same
        && J(n6.answer) === deny('q6', 'value') && n6.same && n7.answer.length === 0 && n7.same && n8.answer.length === 0 && J(n9.answer) === deny('q9', 'field') && n9.same
        && !/2d6|"bound"/.test(J(all.filter(m => m.type !== 'char-ack' && m.type !== 'char-deny'))),
        J([n1.answer, g1, n2.answer, n3.answer, n4.answer, n5.answer, n6.answer, n7.answer, n8.answer, n9.answer, row('w_p1')]));
    const many = Array.from({ length: 150 }, (_, i) => ({ id: 'w_c' + i, qty: 1, own: 1, def: { name: 'Custom ' + i, icon: '', category: 'Skill', notes: 'n'.repeat(200), key: 'K' + i, stats: { Rel: i } } }));
    const view = Sx.cleanSystem(sysC, { F: Fx, gmView: false }), projM = Sx.projectRows(many, view, {}, view.fields[0].list); let packedM = true; try { packCheck({ type: 'charDelta', charId: 'c_1', values: { f_sk: projM } }); } catch (e) { packedM = e.message; }
    check('F4c3 on the wire: 150 custom rows (a key, a note, a stat each) project and pack within the budget; the client sends a custom op\'s def',
        packedM === true && projM.length === 150 && J(projM).length < 200000 && /if \(q\.def !== undefined\) mI\.def = q\.def;/.test(src), J([packedM, J(projM).length]));
})());

// owed review F4c3#2 (c3_): an entry only a GM-only library pack holds reads GM-only wherever the GM's machine hands it out — library.js entryFor
// (sliced, run on a stubbed library) behind rowDef, the rows' copies and the wire's itemLib: given to a player it reaches them with no key or
// blast, the host refuses its throw, and its key is free to that player's custom op, on the host and on their client (the real net.charItem, #8)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js')), J = JSON.stringify;
    const c3_lb = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n');
    const c3_la = c3_lb.indexOf('function entry(id)'), c3_lz = c3_lb.indexOf('function entriesOf(', c3_la); if (c3_la < 0 || c3_lz < 0) throw new Error('netcheck: library.js entryFor not found');
    const c3_mp = o => Object.assign(Object.create(null), o);
    const c3_byId = c3_mp({ i_sec: { id: 'i_sec', name: 'Assassin blade', category: 'Blade', key: 'AssassinBlade', vis: 'all', damage: '2d6', area: { ft: 10, shape: 'circle', name: 'Arc' } },
        i_pub: { id: 'i_pub', name: 'Longsword', category: 'Blade', key: 'Longsword', vis: 'all', damage: '1d8', area: { ft: 5, shape: 'circle', name: 'Sweep' } }, i_own: { id: 'i_own', name: 'Own secret', category: 'Blade', key: 'OwnSecret', vis: 'gm' } });
    const c3_cur = { campId: 'k', sig: '', byId: c3_byId, packs: c3_mp({ p_gm: ['i_sec'], p_pub: ['i_pub', 'i_own'] }), n: 3, state: 'ready', error: '' };
    const c3_sys = Sx.cleanSystem({ v: 1, name: 'G', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, cats: ['Blade'] } }], items: [] }, { F: Fx, gmView: true });
    const c3_camp = { id: 'k', library: { dir: 'lib1', packs: [{ id: 'p_gm', name: 'Secrets', rev: 1, count: 1, vis: 'gm' }, { id: 'p_pub', name: 'Gear', rev: 1, count: 2 }] }, system: c3_sys,
        chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const c3_L = new Function('getActiveCampaign', 'cur', 'manifestSig', 'map', c3_lb.slice(c3_la, c3_lz) + '\nreturn { entry: entry, entryFor: entryFor };')(() => c3_camp, c3_cur, Lx.manifestSig, () => Object.create(null));
    const c3_e1 = c3_L.entryFor('i_sec'), c3_e1b = c3_L.entryFor('i_sec'), c3_e2 = c3_L.entryFor('i_pub'), c3_e3 = c3_L.entryFor('i_own'), c3_e4 = c3_L.entryFor('i_zz');
    delete c3_camp.library.packs[0].vis; const c3_e5 = c3_L.entryFor('i_sec'); c3_camp.library.packs[0].vis = 'gm'; const c3_e6 = c3_L.entryFor('i_sec');
    check('owed review F4c3#2 entryFor (library.js, sliced and run): an entry of a GM-only pack reads as a copy marked GM-only (its key and blast as stored; the same copy each call) while the pack\'s own copy keeps its vis; a visible pack\'s entry is the stored one; an entry marked GM-only itself as stored; an unknown id nothing; the pack\'s mark is read at each call (made visible: the stored entry); it is the lookup systemcore reads and the one the rows\' copies are kept current from and taken from when the items move in',
        c3_e1.vis === 'gm' && c3_e1.key === 'AssassinBlade' && c3_e1.area.ft === 10 && c3_e1 !== c3_byId.i_sec && c3_byId.i_sec.vis === 'all' && c3_e1b === c3_e1 && c3_e2 === c3_byId.i_pub && c3_e3 === c3_byId.i_own && c3_e4 === null
        && c3_e5 === c3_byId.i_sec && c3_e6.vis === 'gm' && /\nsetLibraryFind\(entryFor\);\n/.test(c3_lb) && /var r = libSnaps\(camp\.system, camp\.chars, entryFor\);/.test(c3_lb) && /\n\s*libSnaps\(sysAfter, camp\.chars \|\| \{\}, entryFor\);/.test(c3_lb),
        J([c3_e1, c3_e2 === c3_byId.i_pub, c3_e3 === c3_byId.i_own, c3_e4, c3_e5 && c3_e5.vis, c3_e6 && c3_e6.vis]));

    // the host: the GM gives both entries (the rows keep their copies), then the player's custom op goes through the real char-item handler
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const c3_out = { answer: [], owner: [], mate: [] }, c3_box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); }, c3_placed = [];
    const c3_net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: c3_box(c3_out.owner) }, { peer: 'pB', open: true, send: c3_box(c3_out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const c3_win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null,
        wpLibrary: { size: () => 3, entry: c3_L.entry, entryFor: c3_L.entryFor, playerEntry: () => null }, wpPlaceThrownBlast: b => c3_placed.push(b) };
    const c3_H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, view: function(id, pid) { return charViewFor(id, pid); } };')(
        c3_net, () => Sx, c3_win, () => false, () => c3_camp, () => {}, e => { throw e; }, c => (c3_net.roster[c.peer] ? c3_net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const c3_thI = src.indexOf("} else if (msg.type === 'throw-req' && net.role === 'host') {"), c3_thS = src.slice(c3_thI, src.indexOf('\n    } else if', c3_thI + 10)), c3_thBody = c3_thS.slice(c3_thS.indexOf('\n') + 1);
    const c3_map = { id: 'm1', whiteboard: [{ id: 't1', isChar: true, ownerId: 'u_a', charId: 'c_1' }] };
    const c3_throw = rowId => { const n0 = c3_placed.length; new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'charLimit', 'getActiveCampaign', 'getActiveMap', c3_thBody)({ type: 'throw-req', charId: 'c_1', fieldId: 'f_wp', rowId, mapId: 'm1', x: 100, y: 120 }, { peer: 'pA' }, c3_net, () => Sx, c3_win, () => false, { allow: () => true }, () => c3_camp, () => c3_map); return c3_placed.slice(n0); };
    const c3_SEND = (rid, q) => { c3_out.answer.length = 0; c3_out.owner.length = 0; c3_out.mate.length = 0; c3_H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'custom' }, q), { peer: 'pA', send: c3_box(c3_out.answer) }); return { answer: c3_out.answer.slice(), owner: c3_out.owner.slice(), mate: c3_out.mate.slice() }; };
    let c3_add, c3_proj, c3_tSec, c3_tPub, c3_s1, c3_s2; Sx.setLibraryFind(c3_L.entryFor);
    try {
        c3_add = Sx.applyRowOp(c3_sys, c3_camp.chars.c_1, 'f_wp', { op: 'add', defId: 'i_sec', rowId: 'w_sec' }, Fx, {}); c3_camp.chars.c_1.values.f_wp = c3_add.value;
        const c3_add2 = Sx.applyRowOp(c3_sys, c3_camp.chars.c_1, 'f_wp', { op: 'add', defId: 'i_pub', rowId: 'w_pub' }, Fx, {}); c3_camp.chars.c_1.values.f_wp = c3_add2.value;
        c3_proj = c3_H.view('c_1', 'u_a'); c3_tSec = c3_throw('w_sec'); c3_tPub = c3_throw('w_pub');
        c3_s1 = c3_SEND('q1', { rowId: 'w_n1', def: { name: 'Mine', key: 'AssassinBlade' } }); c3_s2 = c3_SEND('q2', { rowId: 'w_n2', def: { key: 'Longsword' } });
    } finally { Sx.setLibraryFind(null); }
    const c3_rowOf = (rows, id) => (rows || []).find(r => r.id === id) || null, c3_secP = c3_rowOf(c3_proj && c3_proj.values.f_wp, 'w_sec'), c3_pubP = c3_rowOf(c3_proj && c3_proj.values.f_wp, 'w_pub');
    const c3_ownD = ((c3_s1.owner[0] || {}).values || {}).f_wp || [], c3_secD = c3_rowOf(c3_ownD, 'w_sec'), c3_stored = c3_rowOf(c3_camp.chars.c_1.values.f_wp, 'w_sec');
    check('owed review F4c3#2 a GM-only pack\'s entry on a player\'s row (the host, the real delta and char-item handler): the row keeps a GM-only copy; its owner gets it inline with no key, blast or damage (a visible pack\'s entry keeps its key); the host refuses to throw it (the visible one is thrown); its key reads as free to that player\'s custom op (acked) while the visible entry\'s is taken',
        c3_add.ok && !!c3_stored && c3_stored.snap && c3_stored.snap.vis === 'gm' && !!c3_secP && c3_secP.lnk === 1 && c3_secP.def.name === 'Assassin blade' && !('key' in c3_secP.def) && !('area' in c3_secP.def) && !/AssassinBlade|2d6|"Arc"/.test(J(c3_proj))
        && !!c3_pubP && /Longsword/.test(J(c3_pubP)) && c3_tSec.length === 0 && c3_tPub.length === 1 && c3_tPub[0].ft === 5
        && J(c3_s1.answer) === J([{ type: 'char-ack', rid: 'q1' }]) && !!c3_secD && !('key' in c3_secD.def) && !('area' in c3_secD.def) && c3_rowOf(c3_ownD, 'w_n1').def.key === 'AssassinBlade' && !/f_wp/.test(J(c3_s1.mate))
        && J(c3_s2.answer) === J([{ type: 'char-deny', rid: 'q2', reason: 'value' }]),
        J([c3_add.ok, c3_stored, c3_secP, c3_tSec, c3_tPub, c3_s1.answer, c3_secD, c3_s2.answer]));

    // their client: the real net.charItem over the copy the host sent (its system is their view) — the same answers, in words (#8)
    const c3_cA = src.indexOf('net.charItem = function('), c3_cZ = src.indexOf('\n};\n', c3_cA) + 3, c3_sentC = [];
    const c3_view = Sx.cleanSystem(c3_sys, { F: Fx, gmView: false }), c3_campC = { id: 'k', system: c3_view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: JSON.parse(J(c3_proj.values.f_wp)) } } } };
    const c3_netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: null, conns: [{ peer: 'h', open: true, send: m => c3_sentC.push(JSON.parse(J(m))) }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(c3_cA, c3_cZ))(c3_netC, () => Sx, () => c3_campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const c3_cSec = c3_netC.charItem('c_1', 'f_wp', { op: 'custom', rowId: 'w_n1', def: { name: 'Mine', key: 'AssassinBlade' } }), c3_cPub = c3_netC.charItem('c_1', 'f_wp', { op: 'custom', rowId: 'w_n2', def: { key: 'Longsword' } }), c3_cBad = c3_netC.charItem('c_1', 'f_wp', { op: 'custom', rowId: 'w_n3', def: { key: '1x' } });
    check('owed review F4c3#2/#8 their client agrees (the real net.charItem): the GM-only pack\'s key is free (sent to the host), the visible entry\'s is taken ("That key is already used in this list."), a key that is not one says so ("Not a usable key: …"); only the accepted op is sent',
        c3_cSec.ok === true && c3_cPub.error === 'That key is already used in this list.' && c3_cBad.error === 'Not a usable key: a letter, then letters, digits and _ (up to 40).' && c3_sentC.length === 1 && c3_sentC[0].def.key === 'AssassinBlade',
        J([c3_cSec, c3_cPub, c3_cBad, c3_sentC]));
})());
// Stage 6 F4c2: a copy's own values on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on one
// host, Setting A switched off and on between messages; a copy's formulas and locks never reach its owner; 150 rows with their own values in budget
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysV = Sx.cleanSystem({ v: 1, name: 'V', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, on: { label: 'Readied' }, price: 'Cost', stats: [{ key: 'Acc', show: true }, { key: 'Dmg', show: true }, { key: 'Cost' }] } }],
        items: [{ id: 'i_blaster', name: 'Blaster', damage: '2d6', stats: { Acc: 2, Dmg: 3, Cost: 500 } }, { id: 'i_rune', name: 'Rune', vis: 'gm', stats: { Acc: 5 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysV, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_b', defId: 'i_blaster', qty: 1, paid: 500 }, { id: 'w_g', defId: 'i_blaster', qty: 1, paid: 500, ov: { name: 'Ahto', stats: { Dmg: 5 }, held: ['Dmg'], damage: '9d6', rm: 'bound', rmMsg: 'Bound here', eq: 'curse', eqMsg: 'Clings' } }, { id: 'w_r', defId: 'i_rune', qty: 1 }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], notes: [], saves: 0 }, all = [], box = b => m => { packCheck(m); const c = JSON.parse(J(m)); b.push(c); all.push(c); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.notes.length = 0; const s0 = out.saves, before = J(camp.chars.c_1.values.f_wp); H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'ov' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0, same: J(camp.chars.c_1.values.f_wp) === before }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id), deny = (rid, reason) => J([{ type: 'char-deny', rid, reason }]);
    const o1 = SEND('q1', { rowId: 'w_b', ov: { stats: { Acc: 9 } } });
    camp.system.listRules = { ownerStats: true };
    const o2 = SEND('q2', { rowId: 'w_b', ov: { stats: { Acc: 9 } } }), o3 = SEND('q3', { rowId: 'w_b', ov: { name: 'X' } }), o4 = SEND('q4', { rowId: 'w_r', ov: { stats: { Acc: 1 } } });
    const o5 = SEND('q5', { rowId: 'w_g', ov: { stats: { Acc: 8 } } }), mid5 = J(row('w_g').ov), o6 = SEND('q6', { rowId: 'w_g', ov: null }), o7 = SEND('q7', { rowId: 'w_g', ov: { stats: { Dmg: 1 } } });
    check('F4c2 on the wire: with Setting A off a player\'s own stat is refused ("field") with nothing stored, sent or saved; turned on, it is acked, stored and in their delta (Acc 9, a teammate\'s copy carries nothing of the list); another key ("field"), a GM-only item\'s inline copy ("missing", the answer carries nothing else) and a stat the GM set ("field", Q1 A) are refused; their null takes back their own stats only — the GM\'s name, stat, formula and locks stay on the host',
        J(o1.answer) === deny('q1', 'field') && o1.owner.length === 0 && o1.saves === 0 && o1.same
        && J(o2.answer) === J([{ type: 'char-ack', rid: 'q2' }]) && J(row('w_b').ov) === J({ stats: { Acc: 9 } }) && J(ownRow(o2.owner, 'w_b').ov) === J({ stats: { Acc: 9 } }) && o2.saves === 1 && !/f_wp|Blaster|w_b/.test(J(o2.mate))
        && J(o3.answer) === deny('q3', 'field') && o3.same && J(o4.answer) === deny('q4', 'missing') && o4.same && o4.owner.length === 0
        && o5.answer[0].type === 'char-ack' && mid5 === J({ name: 'Ahto', stats: { Dmg: 5, Acc: 8 }, held: ['Dmg'], damage: '9d6', rm: 'bound', rmMsg: 'Bound here', eq: 'curse', eqMsg: 'Clings' })
        && o6.answer[0].type === 'char-ack' && J(row('w_g').ov) === J({ name: 'Ahto', stats: { Dmg: 5 }, held: ['Dmg'], damage: '9d6', rm: 'bound', rmMsg: 'Bound here', eq: 'curse', eqMsg: 'Clings' }) && J(ownRow(o6.owner, 'w_g').ov) === J({ name: 'Ahto', stats: { Dmg: 5 }, held: ['Dmg'] })
        && J(o7.answer) === deny('q7', 'field') && o7.same,
        J([o1, o2, o3, o4, o6, o7, row('w_g')]));
    const junk = [{ ov: { stats: JSON.parse('{"toString":1}') } }, { ov: {} }, {}, { ov: { held: ['Acc'] } }, { ov: { foo: 1 } }, { ov: 'x' }, { ov: { stats: {} } }].map((q, i) => SEND('j' + i, Object.assign({ rowId: 'w_b' }, q))), strV = SEND('j7', { rowId: 'w_b', ov: { stats: { Acc: '3' } } });
    check('F4c2 on the wire (critic 5): a malformed ov is dropped unanswered, with nothing stored, sent or saved — a stat key that is not one (toString), an empty patch, no ov at all, held alone, unknown keys, not an object, empty stats; a string for a number stat (F5a2: a choice\'s label travels) is refused by the host with value, nothing stored',
        junk.every(r => r.answer.length === 0 && r.owner.length === 0 && r.saves === 0 && r.same) && J(strV.answer) === J([{ type: 'char-deny', rid: 'j7', reason: 'value' }]) && strV.same && strV.saves === 0, J(junk.map(r => [r.answer, r.same]).concat([[strV.answer, strV.same]])));
    check('F4c2 on the wire: nothing a player receives in any of these holds a copy\'s formula, lock or lock message (9d6, bound, Clings, rm, eq); the client sends a copy\'s own values beside the keys each op uses (null travels)',
        all.length > 0 && !/9d6|bound|Bound here|Clings|curse|"rm"|"eq"|rmMsg|eqMsg/.test(J(all)) && /if \(q\.ov !== undefined\) mI\.ov = q\.ov;/.test(src) && /if \(q\.facts !== undefined\) mI\.facts = q\.facts;/.test(src), J(all).slice(0, 400));
    const stats10 = Array.from({ length: 10 }, (_, i) => ({ key: 'S' + i, label: 'Stat number ' + i, show: i < 3 })), ovStats = {}; stats10.forEach((s, i) => { ovStats[s.key] = -99999999.25 + i; });
    const big = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], listRules: { ownerStats: true }, fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, price: 'S0', stats: stats10 } }], items: [{ id: 'i_pub', name: 'A public item with a long name', notes: 'n'.repeat(200) }] }, { F: Fx, gmView: true });
    const rowsB = []; for (let i = 0; i < 150; i++) rowsB.push({ id: 'w_p' + i, defId: 'i_pub', qty: 99, paid: 99999999.25, note: 'x'.repeat(200), ov: { name: 'N'.repeat(60), icon: 'icon:bolt', category: 'C'.repeat(40), notes: 'o'.repeat(200), stats: ovStats, held: stats10.map(s => s.key), area: { ft: 3000, shape: 'circle', name: 'A'.repeat(60) }, damage: '9d6', cost: '9', rm: 'curse', rmMsg: 'r'.repeat(200), eq: 'bound', eqMsg: 'e'.repeat(200) } });
    const viewB = Sx.cleanSystem(big, { F: Fx, gmView: false }), libB = {}; big.items.forEach(i => { libB[i.id] = i; });
    const stored = Sx.cleanValue(big.fields[0], rowsB, Sx.valueOpts(big)), projB = Sx.charFor({ id: 'c_b', name: 'B', ownerId: 'u_b', npc: false, values: { f_wp: stored } }, viewB, 'u_b', { items: libB }), msgB = { type: 'char', campId: 'k', char: projB };
    let packedB = true; try { packCheck(msgB); } catch (e) { packedB = e.message; }
    const sizeB = J(msgB).length, p0 = projB.values.f_wp[0];
    check('F4c2 on the wire: 150 rows each with every value of its own at its largest (ten stats, all held, a blast, 200-character notes) project, pack and stay within 200,000 bytes (' + sizeB + ' bytes), with no formula or lock in them',
        packedB === true && sizeB < 200000 && projB.values.f_wp.length === 150 && Object.keys(p0.ov.stats).length === 10 && p0.ov.held.length === 10 && !/9d6|curse|bound|rrrr|eeee/.test(J(msgB)), String(packedB) + ' ' + sizeB);
})());
{   // the joined player's top bar (1.5.0): "<campaign> › <map>" from the host's strings — the real whereName / tableWhere / paintWhere, sliced from net.js
    const whereSrc = between('// [netcheck:where-start]', '// [netcheck:where-end]', 'where');
    const WH = new Function('localStorage', 'crypto', helpersSrc + '\n' + whereSrc + '\nreturn { whereName, tableWhere, paintWhere };')(storage, globalThis.crypto);
    // A DOM stand-in that records every write: markup (innerHTML, outerHTML, insertAdjacentHTML, document.write) is a failure, and so is any attribute but the separator's constant aria-hidden
    function fakeDom() {
        const log = [];
        function node(tag) {
            const n = { tag, children: [], className: '', _text: '', _title: '', classes: new Set(), attrs: {} };
            Object.defineProperty(n, 'textContent', { get() { return n.children.length ? n.children.map(c => c.textContent).join('') : n._text; }, set(v) { n.children = []; n._text = String(v); log.push(['text', tag, String(v)]); } });
            Object.defineProperty(n, 'title', { get() { return n._title; }, set(v) { n._title = String(v); } });
            ['innerHTML', 'outerHTML'].forEach(k => Object.defineProperty(n, k, { get() { return ''; }, set(v) { log.push(['markup', k, String(v)]); } }));
            n.insertAdjacentHTML = (pos, v) => log.push(['markup', 'insertAdjacentHTML', String(v)]);
            n.setAttribute = (k, v) => { n.attrs[k] = String(v); log.push(['attr', k, String(v)]); };
            n.appendChild = c => { n.children.push(c); return c; };
            n.append = (...cs) => { cs.forEach(c => n.children.push(typeof c === 'string' ? { tag: '#text', textContent: c, children: [], attrs: {} } : c)); };
            n.replaceChildren = (...cs) => { n.children = []; n._text = ''; n.append(...cs); };
            n.classList = { toggle: (c, on) => { const want = on === undefined ? !n.classes.has(c) : !!on; if (want) n.classes.add(c); else n.classes.delete(c); return want; }, add: c => n.classes.add(c), remove: c => n.classes.delete(c), contains: c => n.classes.has(c) };
            return n;
        }
        return { log, box: node('div'), mapBox: node('div'), doc: { createElement: t => node(String(t).toLowerCase()), createTextNode: t => ({ tag: '#text', textContent: String(t), children: [], attrs: {} }), write: v => log.push(['markup', 'document.write', String(v)]) } };
    }
    const joined = { role: 'client', syncedPeer: 'room-peer', foreign: true, active: true };
    const HOST_C = '<img src=x onerror=alert(1)>', HOST_M = '<script>alert(1)</script>\u202e\u200b evil\u0007\nline"><b onclick=x>';
    const wantM = '<script>alert(1)</script> evil line"><b onclick=x>';
    const camp = { id: 'c_host', name: HOST_C, activeItemId: 'map_city', items: {
        map_world: { id: 'map_world', type: 'map', meta: { title: 'Parent World' } },
        map_region: { id: 'map_region', type: 'map', meta: { title: 'Parent Region', parentId: 'map_world' } },
        map_city: { id: 'map_city', type: 'map', meta: { title: HOST_M, parentId: 'map_region' } },
        doc_1: { id: 'doc_1', type: 'doc', meta: { title: 'A page' } } } };
    const w = WH.tableWhere(joined, camp);
    check('where (client): the top bar reads the host\'s campaign name and the map the player is on as plain strings — controls to spaces, bidi and zero-width out, never escaped into markup (text nodes need none)',
        !!w && w.camp === HOST_C && w.map === wantM && w.title === HOST_C + ' \u203a ' + wantM, j(w));
    const D = fakeDom(); WH.paintWhere(D.box, D.mapBox, w, D.doc);
    const kids = D.box.children, mkids = D.mapBox.children;
    check('where (client): hostile names reach the page as text only — no innerHTML / outerHTML / insertAdjacentHTML / document.write, no attribute but the separator\'s constant aria-hidden, the whole line in the title property',
        !D.log.some(e => e[0] === 'markup') && !D.log.some(e => e[0] === 'attr') && D.box.title === HOST_C && D.mapBox.title === wantM
        && kids.concat(mkids).every(k => k.children.length === 0 && !Object.keys(k.attrs).length), j(D.log));
    check('where (client): the campaign in its box and the map in the next section\'s (owner, 2026-09-26) — one span each, no separator, both switched on',
        kids.length === 1 && kids[0].className === 'tw-camp' && kids[0].textContent === HOST_C && mkids.length === 1 && mkids[0].className === 'tw-map' && mkids[0].textContent === wantM
        && D.box.textContent === HOST_C && D.mapBox.textContent === wantM && D.box.classes.has('on') && D.mapBox.classes.has('on'), j([kids.map(k => [k.className, k.textContent]), mkids.map(k => [k.className, k.textContent])]));
    check('where (client): a nested map shows its own title only — no parent map anywhere in the text, the title or the result, and nothing but the one separator',
        !/Parent/.test(D.box.textContent + '|' + D.box.title + '|' + D.mapBox.textContent + '|' + D.mapBox.title + '|' + j(w)), D.mapBox.textContent);
    WH.paintWhere(D.box, D.mapBox, null, D.doc);
    check('where (client): with nothing to show both boxes are emptied, their titles cleared and switched off', [D.box, D.mapBox].every(b => b.children.length === 0 && b.textContent === '' && b.title === '' && !b.classes.has('on')), j([D.box.textContent, D.box.title, [...D.box.classes], D.mapBox.textContent]));
    const off = [
        ['left the session', Object.assign({}, joined, { role: null, active: false }), camp],
        ['waiting for admission (no synced host, own campaign on screen)', Object.assign({}, joined, { syncedPeer: null, foreign: false }), camp],
        ['reconnecting (the host\'s campaign still on screen, no synced host)', Object.assign({}, joined, { syncedPeer: null }), camp],
        ['own campaign back (not foreign)', Object.assign({}, joined, { foreign: false }), camp],
        ['the stream window', { role: 'client', foreign: true, stream: true, syncedPeer: 'x' }, camp],
        ['the GM', { role: 'host', active: true, syncedPeer: null, foreign: false }, camp],
        ['no state at all', null, camp],
        ['no campaign yet', joined, null],
        ['a campaign with no items', joined, { name: 'C' }],
        ['a campaign with no map', joined, { name: 'C', items: {}, activeItemId: null }],
        ['an active page instead of a map', joined, Object.assign({}, camp, { activeItemId: 'doc_1' })],
        ['a prototype key for the active item', joined, Object.assign({}, camp, { activeItemId: 'constructor' })],
        ['__proto__ for the active item', joined, Object.assign({}, camp, { activeItemId: '__proto__' })],
        ['an active item that is gone', joined, Object.assign({}, camp, { activeItemId: 'map_gone' })],
    ];
    const shown = off.filter(o => WH.tableWhere(o[1], o[2]) !== null).map(o => o[0]);
    check('where (client): nothing is shown when left, waiting for admission, reconnecting, back on the own campaign, in the stream window, on the GM\'s side, or with no campaign / map on screen', shown.length === 0, shown);
    const blank = WH.tableWhere(joined, { name: '  \u200b ', activeItemId: 'm', items: { m: { type: 'map', meta: { title: { toString: 1 } } } } });
    const noMeta = WH.tableWhere(joined, { name: 42, activeItemId: 'm', items: { m: { type: 'map', meta: 'x' } } });
    const long = WH.tableWhere(joined, { name: 'c'.repeat(5000), activeItemId: 'm', items: { m: { type: 'map', meta: { title: 'm'.repeat(1e6) } } } });
    check('where (client): a blank or non-string name reads as the GM\'s own fallbacks (Unnamed Campaign, Untitled); each name is capped at 200 characters',
        !!blank && blank.camp === 'Unnamed Campaign' && blank.map === 'Untitled' && !!noMeta && noMeta.camp === 'Unnamed Campaign' && noMeta.map === 'Untitled' && !!long && long.camp.length === 200 && long.map.length === 200, j([blank, noMeta, long && [long.camp.length, long.map.length]]));
    const rd = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', f), 'utf8').replace(/\r\n/g, '\n');
    const mainSrc = rd(path.join('scripts', 'main.js')), htmlSrc = rd('index.html'), cssSrc = rd('style.css');
    check('where (client): wired — renderWhere paints only through paintWhere with the real document, off the synced host\'s campaign; main.js render() calls it before its no-map return; renderRoster calls it as the session class changes',
        /function renderWhere\(\) \{[^}]*tableWhere\(net, campOf\(state\.appState && state\.appState\.activeCampaignId\)\);[^}]*paintWhere\(box, mapBox, w, document\);\n\}/.test(src) && /var box = ui\('tableWhere'\), mapBox = ui\('tableWhereMap'\); if \(!box \|\| !mapBox\) return;/.test(src)
        && /export function render\(\) \{\s*if \(window\.wpHideTooltip\)[^\n]*\n\s*if \(window\.wpNet && window\.wpNet\.renderWhere\) window\.wpNet\.renderWhere\(\);[^\n]*\n\s*var activeMap = getActiveMap\(\);\s*if\(!activeMap\) return;/.test(mainSrc)
        && /classList\.toggle\('net-client'[^\n]*\n\s*renderWhere\(\);/.test(src));
    check('where (client): the campaign\'s box sits beside the campaign select, the map\'s in the next section (after the breadcrumb\'s place), both hidden unless a joined player has something to show',
        /<header>[\s\S]*<select id="campaignSelect"[^\n]*\n\s*<div id="tableWhere" class="table-where"><\/div>[\s\S]*<div class="header-sep"><\/div>[\s\S]*<div id="mapBreadcrumb"><\/div>\n\s*<div id="tableWhereMap" class="table-where"><\/div>[\s\S]*<\/header>/.test(htmlSrc)
        && /\n\s*#tableWhere, #tableWhereMap \{ display: none;/.test(cssSrc) && /\n\s*body\.net-client #tableWhere\.on, body\.net-client #tableWhereMap\.on \{ display: inline-flex; \}/.test(cssSrc) && !/#tableWhere(Map)?[^{\n]*\{[^}]*[{;\s]content\s*:/.test(cssSrc)
        && /\n\s*body\.net-client #tableWhereMap\.on \{ flex: 1 1 0; justify-content: center; max-width: none; \}/.test(cssSrc) && /\n\s*body\.net-client #tableWhereMap\.on \+ \.spacer \{ display: none; \}/.test(cssSrc) && /<div id="tableWhereMap" class="table-where"><\/div>\n\s*<div class="spacer"><\/div>/.test(htmlSrc));   // centred in its section: the box takes the spacer's place
}

// 1.5.0 the player's top bar: a campaign renamed mid-session reaches admitted players once per change (the real host sync, sliced), and a
// client takes it only from its synced host, for the hosted campaign, as a string cut to 200 (the real client branch, sliced)
{
    const syncSrc = between('// [netcheck:campnamesync-start]', '// [netcheck:campnamesync-end]', 'campnamesync'), rcvSrc = between('// [netcheck:campname-start]', '// [netcheck:campname-end]', 'campname');
    const sent = { a: [], w: [] }, campH = { id: 'k_1', name: 'Old <b>' };
    const netH = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sent.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sent.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'getActiveCampaign', 'own', 'sendFailed', syncSrc)(netH, () => campH, (o, k) => Object.prototype.hasOwnProperty.call(o, k), e => { throw e; });
    netH.syncCampName(); const n1 = sent.a.length; netH.syncCampName(); const n2 = sent.a.length; campH.name = 'New Name'; netH.syncCampName(); campH.name = 'x'.repeat(300); netH.syncCampName();
    netH.role = 'client'; netH.syncCampName(); const n5 = sent.a.length;
    check('1.5.0 top bar: a campaign renamed mid-session goes to admitted players once per change (a waiting peer gets nothing), cut to 200; a client never sends one; it follows every host save and the snapshot sets its signature',
        n1 === 1 && n2 === 1 && n5 === 3 && sent.w.length === 0 && JSON.stringify(sent.a[0]) === JSON.stringify({ type: 'campName', campId: 'k_1', name: 'Old <b>' }) && sent.a[1].name === 'New Name' && sent.a[2].name.length === 200
        && /net\.syncDocStyle\(\); \/\/ [^\n]*\n\s*net\.syncCampName\(\);/.test(src) && /var cnm = net\.campNameMessage\(\); if \(cnm\) net\._lastCampNameSig = cnm\.campId \+ '\\n' \+ cnm\.name;/.test(src)
        && !/msg\.type === 'campName' && net\.role === 'host'/.test(src), JSON.stringify(sent));
    const run = (netC, msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', name: 'Old' } } } }; let painted = 0;
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'renderWhere', rcvSrc)(netC, { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), () => { painted++; });
        return [st.appState.campaigns.k_1.name, painted]; };
    const okC = { role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, mk = n => ({ type: 'campName', campId: 'k_1', name: n });
    const r1 = run(okC, mk('<img src=x onerror=alert(1)>'), 'host1'), r2 = run(okC, mk('New'), 'evil'), r3 = run(Object.assign({}, okC, { stream: true }), mk('New'), 'host1'), r4 = run(Object.assign({}, okC, { foreign: false }), mk('New'), 'host1');
    const r5 = run(okC, { type: 'campName', campId: 'k_2', name: 'New' }, 'host1'), r6 = run(okC, { type: 'campName', campId: 'k_1', name: { toString: 1 } }, 'host1'), r7 = run(okC, mk('y'.repeat(500)), 'host1'), r8 = run(okC, { type: 'campName', campId: '__proto__', name: 'New' }, 'host1');
    check('1.5.0 top bar: a client takes a campaign rename only from its synced host, for the hosted campaign, as a string cut to 200 (stored as it is: the top bar paints text) and repaints; another peer, the stream window, a machine not showing the host\'s campaign, another campaign, a non-string or a prototype id changes nothing',
        JSON.stringify(r1) === JSON.stringify(['<img src=x onerror=alert(1)>', 1]) && JSON.stringify([r2, r3, r4, r5, r6, r8]) === JSON.stringify(Array(6).fill(['Old', 0])) && r7[0].length === 200 && r7[1] === 1, JSON.stringify([r1, r2, r3, r4, r5, r6, r7[1], r8]));
}

// Fog play areas (review follow-up a): a campaign's fog defaults changed mid-session reach admitted players once per change (the real host
// sync, sliced), and a client takes them only from its synced host, for the hosted campaign, cleaned again, then redraws (the real branch)
pendingChecks.push((async () => {
    const FCx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/'));
    const syncF = between('// [netcheck:campfogsync-start]', '// [netcheck:campfogsync-end]', 'campfogsync'), rcvF = between('// [netcheck:campfog-start]', '// [netcheck:campfog-end]', 'campfog');
    const sentF = { a: [], w: [] }, campF = { id: 'k_1', fog: { defaults: { sight: 6 } } };
    const netF = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentF.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sentF.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'getActiveCampaign', 'own', 'sendFailed', 'window', syncF)(netF, () => campF, (o, k) => Object.prototype.hasOwnProperty.call(o, k), e => { throw e; }, { wpFogCore: FCx });
    netF.syncCampFog(); const f1 = sentF.a.length; netF.syncCampFog(); const f2 = sentF.a.length; campF.fog = { defaults: { sight: 6, emptyFog: 'none', vision: 'nope' }, fields: { sight: 'x y' } }; netF.syncCampFog(); netF.role = 'client'; netF.syncCampFog();
    check('Fog play areas: a campaign\'s fog defaults changed mid-session go to admitted players once per change (a waiting peer gets nothing), cleaned (a malformed field or vision dropped); a client never sends them; every host save sends them, the snapshot sets their signature',
        f1 === 1 && f2 === 1 && sentF.a.length === 2 && sentF.w.length === 0 && j(sentF.a[1]) === j({ type: 'campFog', campId: 'k_1', fog: { fields: {}, defaults: { sight: 6, emptyFog: 'none' } } })
        && /net\.syncNewPlayers\(\); \/\/ [^\n]*\n\s*net\.syncCampFog\(\);/.test(src) && /var cfm = net\.campFogMessage\(\); if \(cfm\) net\._lastCampFogSig = cfm\.campId \+ '\\n' \+ JSON\.stringify\(cfm\.fog\);/.test(src)
        && !/msg\.type === 'campFog' && net\.role === 'host'/.test(src), j(sentF));
    // lighting review: a change to the vision rules re-sends every fogged map of the hosted campaign, filtered per player (the real resendFogged)
    const rsF = between('// [netcheck:resendfogged-start]', '// [netcheck:resendfogged-end]', 'resendfogged'), sentR = [];
    const campR = { id: 'k_r', items: { mA: { id: 'mA', type: 'map', fog: { on: true } }, mB: { id: 'mB', type: 'map', fog: { on: false } }, mC: { id: 'mC', type: 'map', fog: { on: 'yes' } }, dD: { id: 'dD', type: 'doc', fog: { on: true } }, mE: { id: 'mE', type: 'map' }, mF: { id: 'mF', type: 'map', fog: { on: true } } } };
    const netR = { active: true, role: 'host', broadcastItemFiltered: (cid, id) => sentR.push(cid + '/' + id) };
    new Function('net', 'getActiveCampaign', rsF)(netR, () => campR);
    netR.resendFogged(); const r1 = sentR.slice(); netR.role = 'client'; netR.resendFogged(); netR.role = 'host'; netR.active = false; netR.resendFogged();
    check('Lighting: a change to the table\'s vision rules (the fog, lighting or facing switch, the master, the fog defaults) re-sends every fogged map of the hosted campaign to the players, filtered for each (not only the map on screen); nothing from a client or off a session',
        j(r1) === j(['k_r/mA', 'k_r/mF']) && sentR.length === 2
        && /net\.broadcastStance\(\);\n\s*if \(net\.resendFogged\) net\.resendFogged\(\);/.test(src) && /try \{ c\.send\(msg\); \} catch \(e\) \{ sendFailed\(e\); \} \} \}\);\n\s*if \(net\.resendFogged\) net\.resendFogged\(\);   \/\/ a default sight changed/.test(src), j(sentR));
    // senses S2a: a change to the system's senses re-sends the system (a no-op where the save already sent it) and then every fogged map; nothing
    // while they stand still, even as the rest of the system changes (the real syncSenses, sliced by its markers)
    {
        const ssS = between('// [netcheck:syncsenses-start]', '// [netcheck:syncsenses-end]', 'syncsenses'), logS = [];
        let msgS = { type: 'system', campId: 'k_s', system: { fields: [], combat: { senses: { list: [{ id: 'sn_force001' }] } } } };
        const netS = { active: true, role: 'host', systemMessage: () => msgS, syncSystem: f => logS.push('system' + (f ? ':forced' : '')), resendFogged: () => logS.push('maps') };
        new Function('net', ssS)(netS);
        const at = () => logS.length, runS = () => { const n0 = at(); netS.syncSenses(); return logS.slice(n0); };
        const s1 = runS(), s2 = runS();
        msgS = { type: 'system', campId: 'k_s', system: { fields: [{ id: 'f_new' }], combat: { senses: { list: [{ id: 'sn_force001' }] } } } }; const s3 = runS();
        msgS = { type: 'system', campId: 'k_s', system: { fields: [], combat: { senses: { list: [{ id: 'sn_force001', walls: 'pass' }] } } } }; const s4 = runS();
        msgS = { type: 'system', campId: 'k_s', system: { fields: [], combat: {} } }; const s5 = runS(), s6 = runS();
        msgS = { type: 'system', campId: 'k_other', system: { fields: [], combat: {} } }; const s7 = runS();
        netS.role = 'client'; msgS.system.combat.senses = { list: [] }; const s8 = runS(); netS.role = 'host'; netS.active = false; const s9 = runS(); netS.active = true;
        const msgKeep = msgS; msgS = null; const s10 = runS(); msgS = msgKeep;
        check('senses S2a: a change to the system\'s senses sends the system first and then every fogged map; nothing again while they stand still, even as the rest of the system changes (the system goes by its own sync); a change of campaign counts; nothing from a client, off a session or with no system',
            j([s1, s2, s3, s4, s5, s6, s7, s8, s9, s10]) === j([['system', 'maps'], [], [], ['system', 'maps'], ['system', 'maps'], [], ['system', 'maps'], [], [], []]), j([s1, s2, s3, s4, s5, s6, s7, s8, s9, s10]));
        check('senses S2a (source): every host save runs it right after the system\'s own sync; the snapshot sets its signature with the system\'s, and hosting afresh clears it',
            /net\.syncSystem\(\);   \/\/ and the system \(character sheets\), the same way\r?\n\s*net\.syncSenses\(\);/.test(src)
            && /var sysm = net\.systemMessage\(\); if \(sysm\) \{ net\._lastSystemSig = quickHash\(JSON\.stringify\(sysm\.system\)\); net\._lastSensesSig = sensesSigOf\(sysm\); \}/.test(src)
            && /net\._lastSystemSig = null;   \/\/ and the system\r?\n\s*net\._lastSensesSig = null;/.test(src) && (src.match(/net\.syncSenses = function/g) || []).length === 1);
    }
    // lighting L3: one player's copy of a fogged map (the real fogDrop / fogFilterClean / fogCopyFor): the creatures they cannot see dropped, the lit
    // cells only they get (never on the shared clone), the host's light cap; the host's own map never carries either
    const flF = between('// [netcheck:foglit-start]', '// [netcheck:foglit-end]', 'foglit');
    // the stub answers only for the host's own map and campaign, and the lit cells only for the drop worked out for that player (never the clone)
    const hostM = { type: 'map', id: 'm1', whiteboard: [{ id: 'foe', light: { bright: 2, dim: 4 } }, { id: 'me' }] }, campFL = { id: 'k_f' };
    const fwin = { wpFog: { fogDropIds: (rid, camp, map) => camp === campFL && map === hostM && rid === 'u_a' ? { foe: 1 } : null,
        fogLitFor: (rid, camp, map, drop) => camp !== campFL || map !== hostM ? null : rid === 'u_a' && drop && drop.foe === 1 ? { lit: [{ c: 3, r: 2, t: 2 }, { c: 4, r: 2, t: 1 }], capped: false } : rid === 'u_c' && drop === null ? { lit: [], capped: true } : null } };
    const FL = new Function('window', flF + '\nreturn fogCopyFor;')(fwin);
    const cleanM = { type: 'map', id: 'm1', whiteboard: [{ id: 'foe' }, { id: 'me' }] }, cA = FL(cleanM, campFL, hostM, 'u_a'), cB = FL(cleanM, campFL, hostM, 'u_b'), cC = FL(cleanM, campFL, hostM, 'u_c');
    const srcL = src.replace(/\r\n/g, '\n');
    check('Lighting: a player\'s copy of a fogged map carries only their own lit cells (a torch round a corner) and the host\'s light cap, always on a copy made for them — the shared clone and another player\'s copy never gain them; nothing extra, nothing copied',
        j(cA.whiteboard.map(w => w.id)) === j(['me']) && j(cA.fogLit) === j([{ c: 3, r: 2, t: 2 }, { c: 4, r: 2, t: 1 }]) && !('lightsCapped' in cA) && !('fogLit' in hostM) && !('lightsCapped' in hostM) && cB === cleanM && !('fogLit' in cleanM) && !('lightsCapped' in cleanM)
        && cC !== cleanM && cC.lightsCapped === true && !('fogLit' in cC) && cC.whiteboard === cleanM.whiteboard
        && /delete m\.fogLit; delete m\.lightsCapped;/.test(srcL) && (srcL.match(/var out = fogCopyFor\(clean, camp, it, pr\.id\);/g) || []).length === 2
        && /it = fogCopyFor\(it, \(s\.campaigns && s\.campaigns\[camp\.id\]\) \|\| camp, orig, recipientId\);/.test(srcL) && !/fogFilterClean\(clean, fogDrop\(/.test(srcL)
        && /var flC = window\.wpFogCore && window\.wpFogCore\.cleanFogLit \? window\.wpFogCore\.cleanFogLit\(m\.fogLit\) : null; if \(flC\) m\.fogLit = flC; else delete m\.fogLit;/.test(srcL) && /if \(m\.lightsCapped !== true\) delete m\.lightsCapped;/.test(srcL), j([cA, cC]));
    const runF = (netC, msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', fog: { defaults: { sight: 2 } } } } } }, calls = [];
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', rcvF)(netC, { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpFogCore: FCx, wpFog: { invalidateVision: () => calls.push('inv'), redraw: () => calls.push('draw') } });
        return [st.appState.campaigns.k_1.fog, calls]; };
    const okF = { role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, mkF = fog => ({ type: 'campFog', campId: 'k_1', fog });
    const g1 = runF(okF, mkF({ defaults: { sight: 9, emptyFog: 'none', on: true }, fields: { sight: 'f_sight' } }), 'host1'), g2 = runF(okF, mkF({ defaults: { sight: 9 } }), 'evil'), g3 = runF(Object.assign({}, okF, { stream: true }), mkF({ defaults: { sight: 9 } }), 'host1');
    const g4 = runF(okF, { type: 'campFog', campId: 'k_2', fog: {} }, 'host1'), g5 = runF(okF, mkF('<img>'), 'host1'), g6 = runF(okF, { type: 'campFog', campId: '__proto__', fog: {} }, 'host1');
    check('Fog play areas: a client takes the campaign\'s fog defaults only from its synced host, for the hosted campaign, cleaned again, then works the fog out afresh and redraws; another peer, the stream window, another campaign or a prototype id changes nothing; garbage cleans to the plain default',
        j(g1) === j([{ fields: { sight: 'f_sight' }, defaults: { sight: 9, on: true, emptyFog: 'none' } }, ['inv', 'draw']]) && j([g2, g3, g4, g6]) === j(Array(4).fill([{ defaults: { sight: 2 } }, []])) && j(g5) === j([{ fields: {}, defaults: { sight: 0 } }, ['inv', 'draw']]), j([g1, g2, g4, g5]));
})());

// Stage 6 library L3: the library on the wire, host side — the manifest players get (the real syncLibrary), a pack's index and entries by id
// (the real lib-idx / lib-get handler, over a real players' index), and a player's pick of a library entry through the real char-item handler
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js')), J = JSON.stringify;
    const lmSrc = between('// [netcheck:libmansync-start]', '// [netcheck:libmansync-end]', 'libmansync');
    const sentM = { a: [], w: [] }; let man = null;
    const netM = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentM.a.push(JSON.parse(J(m))); } }, { peer: 'pW', open: true, send: m => sentM.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'window', 'sendFailed', lmSrc)(netM, { wpLibrary: { playerManifest: () => man } }, e => { throw e; });
    netM.syncLibrary(); man = { campId: 'k', packs: [] }; netM.syncLibrary();
    man = { campId: 'k', packs: [{ id: 'p_a', name: 'Gear', count: 2, hash: 'abcdef12' }] }; netM.syncLibrary(); netM.syncLibrary();
    man = { campId: 'k', packs: [{ id: 'p_a', name: 'Gear', count: 3, hash: '12345678' }] }; netM.syncLibrary();
    man = { campId: 'k', packs: [] }; netM.syncLibrary(); netM.syncLibrary();
    netM.role = 'client'; man = { campId: 'k', packs: [{ id: 'p_z', name: 'Z', count: 1, hash: '00000000' }] }; netM.syncLibrary();
    check('L3 the manifest (host): sent to admitted players once per change (a waiting peer gets nothing), nothing while a campaign never had a pack, an empty one once when the last is gone; a client never sends one; it follows every host save, and a joining player gets it after the snapshot when it holds a pack',
        J(sentM.a.map(m => m.packs.map(p => p.count))) === J([[2], [3], []]) && sentM.a.every(m => m.type === 'libManifest' && m.campId === 'k') && sentM.w.length === 0
        && /net\.syncTurnRules\(\); \/\/ [^\n]*\n\s*net\.syncLibrary\(\);/.test(src) && /var lbm = net\.libManifestMessage\(\); if \(lbm && lbm\.packs\.length\) \{ try \{ conn\.send\(lbm\); \}/.test(src), J(sentM));

    const rqSrc = between('// [netcheck:libreq-start]', '// [netcheck:libreq-end]', 'libreq');
    const sysL = Sx.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [{ id: 'f_wp', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { cats: ['Gear'], stats: [{ key: 'Wt', label: 'Weight' }] } }] }, { F: Fx, gmView: true });
    const plCtx = Lx.libCtx(Sx.cleanSystem(sysL, { F: Fx, gmView: false }), Fx, false);
    const gmE = { i_rope: { id: 'i_rope', name: 'Rope', category: 'Gear', damage: '1d4', gmNotes: 'Cursed rope', rm: 'bound', rmMsg: 'Tied fast', desc: 'A rope.', stats: { Wt: 10 } }, i_hid: { id: 'i_hid', name: 'Hidden', category: 'Gear', vis: 'gm' }, i_sec: { id: 'i_sec', name: 'Secret pack item', category: 'Gear' }, i_ski: { id: 'i_ski', name: 'Skis', category: 'Sport' } };
    const many = Array.from({ length: 450 }, (_, i) => ({ id: 'i_m' + i, name: 'Many ' + i, category: 'Gear' }));
    const ixA = Lx.playerIndex([gmE.i_rope, gmE.i_hid, gmE.i_ski].concat(many), plCtx);   // the pack players may see (its GM-only entry never in it); p_g, a GM-only pack, has none
    const libFake = { size: () => 4, entry: id => (Object.prototype.hasOwnProperty.call(gmE, id) ? gmE[id] : null), playerIndexOf: id => (id === 'p_a' ? ixA : null), playerEntry: id => (Object.prototype.hasOwnProperty.call(ixA.byId, id) ? ixA.byId[id] : null) };
    const spent = Object.create(null), lim = { ok: true }, netQ = { active: true, role: 'host', roster: { pA: { id: 'u_a' }, pB: { id: 'u_a' }, pC: { id: 'u_c' } } }, campQ = { id: 'k', system: sysL };
    const runQ = (msg, peer) => { const got = []; new Function('net', 'conn', 'msg', 'window', 'getActiveCampaign', 'allow', 'sendFailed', '_libSpent', rqSrc)(netQ, { peer, send: m => { packCheck(m); got.push(JSON.parse(J(m))); } }, msg, { wpLibrary: libFake, wpLibraryCore: Lx }, () => campQ, () => lim.ok, e => { throw e; }, spent); return got; };
    const IDX = o => Object.assign({ type: 'lib-idx', rid: 'r1', campId: 'k', packId: 'p_a', page: 0 }, o), GET = o => Object.assign({ type: 'lib-get', rid: 'g1', campId: 'k', packId: 'p_a', ids: ['i_rope'] }, o);
    const q0 = runQ(IDX({ rid: undefined }), 'pA'), q0b = runQ(IDX({ rid: 'bad rid!' }), 'pA'), q1 = runQ(IDX(), 'pX');
    lim.ok = false; const q2 = runQ(IDX(), 'pA'); lim.ok = true;
    const q3 = runQ(IDX({ campId: 'k2' }), 'pA'), q4 = runQ(IDX({ packId: 'p_g' }), 'pA'), q5 = runQ(IDX({ packId: '__proto__' }), 'pA'), q6 = runQ(IDX({ page: 2 }), 'pA'), q7 = runQ(IDX({ page: '0' }), 'pA');
    const p0 = runQ(IDX(), 'pA'), p1 = runQ(IDX({ page: 1 }), 'pA');
    check('L3 lib-idx (host): nothing without a well-formed ask id; an unadmitted peer gets none, a flood busy, another campaign camp, a pack players may not see (or a bad id) pack, a page out of range page; a page answers with the players\' index rows (400 at most), its number, how many and the pack hash — never a GM-only entry or any GM text',
        q0.length === 0 && q0b.length === 0 && J(q1) === J([{ err: 'none', type: 'lib-idx-ans', rid: 'r1' }]) && q2[0].err === 'busy' && q3[0].err === 'camp' && q4[0].err === 'pack' && q5[0].err === 'pack' && q6[0].err === 'page' && q7[0].err === 'page'
        && p0[0].type === 'lib-idx-ans' && p0[0].rid === 'r1' && p0[0].rows.length === 400 && p0[0].pages === 2 && p0[0].page === 0 && p0[0].hash === ixA.hash && p1[0].rows.length === 52 && !/i_hid|Hidden|Cursed|1d4|bound|Tied/.test(J(p0.concat(p1))), J([q1, q2, q3, q4, q6, p0[0].pages, p1[0].rows.length]));
    const g1 = runQ(GET({ ids: ['i_rope', 'i_hid', 'i_sec', 'i_zz', 'i_rope'] }), 'pA'), g2 = runQ(GET({ ids: [] }), 'pA'), g3 = runQ(GET({ ids: Array.from({ length: 51 }, (_, i) => 'i_m' + i) }), 'pA'), g4 = runQ(GET({ ids: 'i_rope' }), 'pA');
    check('L3 lib-get (host): the asked entries of that pack in the players\' view (its description, no GM notes, formula text or lock), a GM-only entry, another pack\'s or an unknown id left out silently; no ids, more than 50 or not a list: ids',
        g1[0].type === 'lib-get-ans' && g1[0].rid === 'g1' && J(g1[0].entries.map(e => e.id)) === J(['i_rope']) && g1[0].entries[0].desc === 'A rope.' && !/Cursed|1d4|bound|Tied|gmNotes|i_hid|i_sec/.test(J(g1)) && g2[0].err === 'ids' && g3[0].err === 'ids' && g4[0].err === 'ids', J([g1, g2, g3]));
    spent.u_a = Lx.LIB.hostBudget - 50; const b1 = runQ(IDX(), 'pB'), bAfter = spent.u_a, b2 = runQ(IDX(), 'pC');
    check('L3 the budget (host): at most ' + (Lx.LIB.hostBudget / 1048576) + ' MB drawn by a profile in a session — a second connection of the same player shares it (budget, nothing counted), another player has their own',
        b1[0].err === 'budget' && bAfter === Lx.LIB.hostBudget - 50 && Array.isArray(b2[0].rows) && spent.u_c > 0, J([b1, bAfter, spent.u_c]));

    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const campC = { id: 'k', system: sysL, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [] } } } };
    const outC = { answer: [], owner: [], mate: [] };
    const netC = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); outC.owner.push(JSON.parse(J(m))); } }, { peer: 'pM', open: true, send: m => { packCheck(m); outC.mate.push(JSON.parse(J(m))); } }], roster: { pA: { id: 'u_a' }, pM: { id: 'u_m' } } };
    const winC = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: libFake };
    Sx.setLibraryFind(id => (Object.prototype.hasOwnProperty.call(gmE, id) ? gmE[id] : null));
    const HC = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        netC, () => Sx, winC, () => false, () => campC, () => {}, e => { throw e; }, c => (netC.roster[c.peer] ? netC.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const ADD = (rid, defId) => { outC.answer = []; outC.owner.length = 0; outC.mate.length = 0; HC.handle({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'add', defId, rowId: 'w_' + rid, qty: 1 }, { peer: 'pA', send: m => { packCheck(m); outC.answer.push(JSON.parse(J(m))); } }); return { answer: outC.answer.slice(), owner: outC.owner.slice(), mate: outC.mate.slice() }; };
    let a1, a2, a3, a4, a5, stored;
    try { a1 = ADD('a1', 'i_rope'); stored = campC.chars.c_1.values.f_wp.find(r => r.id === 'w_a1'); a2 = ADD('a2', 'i_hid'); a3 = ADD('a3', 'i_sec'); a4 = ADD('a4', 'i_ski'); a5 = ADD('a5', 'i_zz'); } finally { Sx.setLibraryFind(null); }
    const denied = (r, rid) => J(r.answer) === J([{ type: 'char-deny', rid, reason: 'missing' }]);
    check('L3 a player picks a library entry (host, the real char-item handler): an entry of a pack players may see is added — the row keeps the host\'s own copy (its lock and all), the owner\'s delta carries it inline in their view with no GM text; a GM-only entry, one of a GM-only pack, one outside the list\'s categories, an unknown one: missing, nothing stored',
        a1.answer[0].type === 'char-ack' && !!stored && stored.defId === 'i_rope' && stored.snap.rm === 'bound' && stored.snap.damage === '1d4' && a1.owner.some(m => /"lnk":1/.test(J(m)) && /Rope/.test(J(m)))
        && denied(a2, 'a2') && denied(a3, 'a3') && denied(a4, 'a4') && denied(a5, 'a5') && campC.chars.c_1.values.f_wp.length === 1 && !/Cursed|1d4|bound|Tied/.test(J(a1.owner.concat(a1.mate, a1.answer))), J([a1, a2 && a2.answer, stored]));
})());

// Stage 6 library L3b: the library on the wire, player side — the manifest taken (the real handler), and the real client code (asks one at
// a time, answers matched and cleaned again, a busy host asked again, a timeout, paging with a pack that changes mid-load, entries fetched
// and cached, the budget), driven with a recording connection and hand-fired timers
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js')), J = JSON.stringify, tick = () => new Promise(r => setImmediate(r));
    const lmSrc = between('// [netcheck:libman-start]', '// [netcheck:libman-end]', 'libman');
    const runMan = (netC, msg, peer, active) => { const took = []; let drawn = 0; const st = { appState: { activeCampaignId: active || 'k', campaigns: { k: { id: 'k' } } } };
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', lmSrc)(Object.assign({ libTake: m => took.push(m) }, netC), { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpLibraryCore: Lx, wpSheetsSync: () => { drawn++; } });
        return [took, drawn]; };
    const cl = { foreign: true, syncedPeer: 'h', stream: false }, MAN = { type: 'libManifest', campId: 'k', dir: 'l_abcd1234', packs: [{ id: 'p_a', name: '<b>Gear</b>', count: 2, hash: 'aaaaaaaa', rev: 9, vis: 'all' }, { id: 'nope', hash: 'aaaaaaaa' }] };
    const m1 = runMan(cl, MAN, 'h'), m2 = runMan(cl, MAN, 'x'), m3 = runMan(Object.assign({}, cl, { stream: true }), MAN, 'h'), m4 = runMan(cl, Object.assign({}, MAN, { campId: 'k2' }), 'h'), m5 = runMan(cl, MAN, 'h', 'k2'), m6 = runMan(cl, { type: 'libManifest', campId: 'k', packs: 'x' }, 'h');
    check('L3b the manifest (player): taken from the synced host only, for the hosted campaign, cleaned (no folder, revision or visibility; a bad pack left out; a name stays text) and the sheets redrawn; anything else changes nothing',
        J(m1) === J([[{ campId: 'k', packs: [{ id: 'p_a', name: '<b>Gear</b>', count: 2, hash: 'aaaaaaaa' }] }], 1]) && [m2, m3, m4, m5, m6].every(r => J(r) === J([[], 0]))
        && /\} else if \(\(msg\.type === 'lib-idx-ans' \|\| msg\.type === 'lib-get-ans'\) && net\.role === 'client'\) \{\n\s*if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer \|\| net\.stream\) return;[^\n]*\n\s*net\.libAnswer\(msg\);/.test(src), J([m1, m2, m4]));

    const lcSrc = between('// [netcheck:libclient-start]', '// [netcheck:libclient-end]', 'libclient');
    const timers = [], fakeSet = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, fakeClear = id => { if (timers[id - 1]) timers[id - 1].fn = null; }, fire = ms => { const t = timers.filter(x => x.fn && x.ms === ms); t.forEach(x => { const f = x.fn; x.fn = null; f(); }); return t.length; };
    const sent = [], conn = { peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(J(m))); } };
    const netL = { active: true, role: 'client', syncedPeer: 'h', conns: [conn] }, stL = { appState: { activeCampaignId: 'k' } };
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Wt', label: 'Weight' }] } }] }, { F: Fx, gmView: false }), campL = { id: 'k', system: sysP };
    const Lc = new Function('net', 'state', 'window', 'getActiveCampaign', 'setTimeout', 'clearTimeout', lcSrc + '\nreturn { lib: function() { return _lib; } };')(netL, stL, { wpLibraryCore: Lx, wpFormula: Fx }, () => campL, fakeSet, fakeClear);
    const last = () => sent[sent.length - 1], ans = (o) => netL.libAnswer(Object.assign({ type: last().type + '-ans', rid: last().rid }, o));
    netL.libTake({ campId: 'k', packs: [{ id: 'p_a', name: 'A', count: 3, hash: 'aaaaaaaa' }, { id: 'p_b', name: 'B', count: 1, hash: 'bbbbbbbb' }] });
    const noMan = (() => { stL.appState.activeCampaignId = 'k2'; const r = netL.libManifest(); stL.appState.activeCampaignId = 'k'; return r; })();
    const row = (id, name) => [id, '', name, 'Gear', '', [], '12345678'];
    const loadA = netL.libLoad('p_a'); await tick();
    const ask1 = J(last()), n1 = sent.length;
    netL.libAnswer({ type: 'lib-idx-ans', rid: 'wrong', packId: 'p_a', hash: 'aaaaaaaa', page: 0, pages: 2, rows: [row('i_x', 'X')] }); await tick();
    ans({ err: 'busy' }); await tick(); const afterBusy = sent.length; fire(800); await tick(); const retried = sent.length === afterBusy + 1 && last().rid !== JSON.parse(ask1).rid && last().page === 0;
    ans({ packId: 'p_a', hash: 'aaaaaaaa', page: 0, pages: 2, rows: [row('i_1', 'One'), ['bad'], row('i_1', 'Dup'), row('i_2', '<img src=x>')] }); await tick();
    const ask2 = last(); ans({ packId: 'p_a', hash: 'cccccccc', page: 1, pages: 2, rows: [row('i_3', 'Three')] }); await tick();   // the pack moved mid-load: read again from page 0
    const ask3 = last(); ans({ packId: 'p_a', hash: 'cccccccc', page: 0, pages: 1, rows: [row('i_1', 'One'), ['bad'], row('i_1', 'Dup'), row('i_3', 'Three'), row('i_2', '<img src=x>'), 'x'] }); await tick();
    const loadedA = await loadA;
    check('L3b paging (player): one ask at a time; an answer to another ask is ignored; busy is asked again after 800 ms with a new id; each index row cleaned again (a malformed one and a repeated id left out, a name stays text); a pack that changes mid-load is read again from its first page',
        n1 === 1 && JSON.parse(ask1).type === 'lib-idx' && JSON.parse(ask1).campId === 'k' && JSON.parse(ask1).packId === 'p_a' && JSON.parse(ask1).page === 0 && retried && ask2.page === 1 && ask3.page === 0 && loadedA === true
        && J(netL.libRows('p_a').map(r => r[0])) === J(['i_1', 'i_3', 'i_2']) && netL.libRows('p_a')[0][2] === 'One' && netL.libRows('p_a')[2][2] === '<img src=x>' && netL.libLoaded('p_a') === 3, J([sent.map(s => [s.type, s.page]), netL.libRows('p_a')]));
    const loadB = netL.libLoad('p_b'); await tick(); const nB = sent.length; fire(20000); await tick(); const loadedB = await loadB;
    const loadX = await netL.libLoad('p_zz');
    check('L3b a host that never answers: the ask gives up after 20 s (the load reports it, the next ask can go); a pack the manifest does not list is never asked for; another campaign on screen hides the manifest',
        nB === sent.length && loadedB === false && loadX === false && noMan === null, J([loadedB, loadX]));
    const getP = netL.libGet('p_a', ['i_1', 'i_3', 'bad id', 'i_1']); await tick();
    const g1 = last(); ans({ packId: 'p_a', hash: 'cccccccc', entries: [{ id: 'i_1', name: 'One', category: 'Gear', gmNotes: 'secret', damage: '9d9', desc: 'Long', stats: { Wt: 2, Nope: 5 } }, { id: 'i_9', name: 'Not asked' }] }); await tick();
    const g2 = last(); ans({ packId: 'p_a', hash: 'cccccccc', entries: [] }); await tick();
    const got = await getP, e1 = netL.libEntry('i_1');
    check('L3b entries (player): asked for 50 at a time (bad ids never asked, each once), what is held answered for each id asked, taken only if asked for, cleaned again in the players\' view (no GM notes or formula text, stats under the players\' keys only), what an answer left out asked for again once; the cache answers applyRowOp\'s lookup',
        g1.type === 'lib-get' && J(g1.ids) === J(['i_1', 'i_3']) && J(g2.ids) === J(['i_3']) && J(got.map(e => e.id)) === J(['i_1', 'i_1']) && e1.name === 'One' && !('gmNotes' in e1) && e1.damage === '' && J(e1.stats) === J({ Wt: 2 }) && e1.desc === 'Long' && netL.libEntry('i_9') === null && netL.libEntry('toString') === null, J([g1, g2, e1]));
    netL.libTake({ campId: 'k', packs: [{ id: 'p_a', name: 'A', count: 2, hash: 'dddddddd' }, { id: 'p_b', name: 'B', count: 1, hash: 'bbbbbbbb' }] });
    const afterMove = [netL.libRows('p_a').length, netL.libEntry('i_1')];
    Lc.lib().spent = Lx.LIB.clientBudget - 10; const getB = netL.libGet('p_a', ['i_1']); await tick(); ans({ packId: 'p_a', hash: 'dddddddd', entries: [{ id: 'i_1', name: 'One' }] }); await tick(); const overB = await getB;
    netL.libTake({ campId: 'k9', packs: [] }); const afterCamp = Lc.lib().idx;
    const pendR = netL.libLoad('p_zz'); netL.libTake({ campId: 'k', packs: [{ id: 'p_r', name: 'R', count: 1, hash: 'eeeeeeee' }] }); const loadR = netL.libLoad('p_r'); await tick(); netL.libReset(); const resetR = await loadR;
    check('L3b a pack whose hash moves is read again (its index and entries dropped); past ' + (Lx.LIB.clientBudget / 1048576) + ' MB a session nothing more is taken; another campaign clears everything; leaving the table ends the asks waiting',
        afterMove[0] === 0 && afterMove[1] === null && overB.length === 0 && netL.libEntry('i_1') === null && Object.keys(afterCamp).length === 0 && resetR === false && (await pendR) === false, J([afterMove, overB.length, resetR]));
    netL.libTake({ campId: 'k', packs: [{ id: 'p_q', name: 'Q', count: 1, hash: 'ffffffff' }, { id: 'p_w', name: 'W', count: 1, hash: '11111111' }] });
    const nQ0 = sent.length, lq = netL.libLoad('p_q'), lw = netL.libLoad('p_w'), gq = netL.libGet('p_q', ['i_q1']); await tick(); const oneAtATime = sent.length === nQ0 + 1 && last().packId === 'p_q';
    for (let i = 1; i <= 5; i++) { ans({ err: 'busy' }); await tick(); fire(800 * i); await tick(); }
    const asksQ = sent.slice(nQ0).filter(s => s.packId === 'p_q' && s.type === 'lib-idx').length; ans({ err: 'busy' }); await tick(); const gaveUp = (await lq) === false, nextWent = last().packId === 'p_w';
    ans({ packId: 'p_w', hash: '11111111', page: 0, pages: 1, rows: [row('i_w1', 'W1')] }); await tick(); const lwOk = await lw; ans({ packId: 'p_q', hash: 'ffffffff', entries: [{ id: 'i_q1', name: 'Q1' }] }); await tick(); const gqOk = (await gq).length === 1;
    check('L3b one ask in flight at the table (the rest wait their turn); a host still busy after five more tries is given up on and the next ask goes',
        oneAtATime && asksQ === 6 && gaveUp && nextWent && lwOk === true && gqOk, J([oneAtATime, asksQ, gaveUp, nextWent, lwOk, gqOk]));
    check('L3b a player\'s pick reads the entry they fetched (charItem and the changes worked out again pass the client\'s cache as opts.lib); the session end clears it and what players drew from the host',
        /S\.applyRowOp\(camp\.system, c, fieldId, q, window\.wpFormula, \{ player: true, view: camp\.system, lib: net\.libEntry \}\)/.test(src) && /var o = \{ player: true, view: camp\.system, lib: net\.libEntry \}/.test(src) && /net\.libReset\(\); _libSpent = Object\.create\(null\);/.test(src));
})());

// Stage 6 F6 (owner, 2026-09-27): a kept curse keeps working, nameless — the real char-item handler drops a cursed item (it stays on the
// character, hidden), the real delta carries the owner's nameless changes with the list, and the real client handler takes them onto the
// owner's own copy only (cleaned again); nothing of it names the item
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); return src.slice(i, k); })();
    const sysU = Sx.cleanSystem({ v: 1, name: 'U', rolls: [], fields: [{ id: 'f_dx', key: 'DX', kind: 'number', def: 10, vis: 'all' }, { id: 'f_gm', key: 'Luck', kind: 'number', vis: 'gm' }, { id: 'f_rg', key: 'Rings', label: 'Rings', kind: 'item-list', edit: 'owner', vis: 'all' }],
        items: [{ id: 'i_cur', name: 'Cursed ring', category: 'Ring', rm: 'curse', rmMsg: 'A chill lingers', mods: [{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_gm', op: 'add', v: -5 }] }] }, { F: Fx, gmView: true });
    const campU = { id: 'k', system: sysU, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_rg: [{ id: 'w_r', defId: 'i_cur', qty: 1 }] } } } };
    const outU = { owner: [], mate: [] };
    const netU = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); outU.owner.push(JSON.parse(J(m))); } }, { peer: 'pM', open: true, send: m => { packCheck(m); outU.mate.push(JSON.parse(J(m))); } }], roster: { pA: { id: 'u_a' }, pM: { id: 'u_m' } } };
    const winU = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const HU = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        netU, () => Sx, winU, () => false, () => campU, () => {}, e => { throw e; }, c => (netU.roster[c.peer] ? netU.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const ans = []; HU.handle({ type: 'char-item', rid: 'd1', charId: 'c_1', fieldId: 'f_rg', op: 'setQty', rowId: 'w_r', qty: 0 }, { peer: 'pA', send: m => { packCheck(m); ans.push(JSON.parse(J(m))); } });
    const kept = campU.chars.c_1.values.f_rg[0], delta = outU.owner.find(m => m.type === 'charDelta');
    check('F6 a cursed item dropped (host, the real handlers): it stays on the character hidden; the owner\'s delta carries their list without it and the curse\'s changes as nameless amounts on the fields they can see (DX −2; a GM-only field\'s never); nothing sent names or points at the item',
        ans[0].type === 'char-ack' && kept.hid === 1 && kept.defId === 'i_cur' && !!delta && J(delta.values.f_rg) === '[]' && J(delta.unseen) === J([{ f: 'f_dx', op: 'add', v: -2 }])
        && !/Cursed|i_cur|f_gm|w_r|Luck/.test(J(outU.owner.concat(outU.mate))) && outU.mate.every(m => !('unseen' in m)), J([ans, delta, outU.mate]));
    const inSrc = between('// [netcheck:charin-start]', '// [netcheck:charin-end]', 'charin');
    const view = Sx.cleanSystem(sysU, { F: Fx, gmView: false });
    const runIn = (chars, msg, peer) => { const st = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', system: view, chars } } } };
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', '_charPending', '_charHost', 'charPendingDone', 'reapplyPending', 'noteHostCopy', inSrc)({ foreign: true, syncedPeer: 'h', stream: false, myId: 'u_a' }, { peer }, msg, st, id => st.appState.campaigns[id] || null, { wpSystemCore: Sx, wpSheets: { charChanged() {}, charGone() {} } }, {}, {}, () => {}, () => {}, () => {});
        return st.appState.campaigns.k.chars; };
    const mine = () => ({ c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_rg: [] }, partial: false }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {}, partial: true } });
    const D = (id, unseen) => ({ type: 'charDelta', campId: 'k', id, values: { f_dx: 10 }, unseen });
    const c1 = runIn(mine(), D('c_1', [{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_gm', op: 'add', v: 9 }, { f: 'f_dx', op: 'add', v: 'x' }, { f: 'f_dx', op: 'add', v: 1, name: 'Leak' }]), 'h');
    const c2 = runIn(mine(), D('c_2', [{ f: 'f_dx', op: 'add', v: -2 }]), 'h'), c3 = (() => { const m0 = mine(); m0.c_1.unseen = [{ f: 'f_dx', op: 'add', v: -2 }]; return runIn(m0, D('c_1', []), 'h'); })(), c4 = runIn(mine(), D('c_1', [{ f: 'f_dx', op: 'add', v: -2 }]), 'x');
    check('F6 a player takes nameless changes onto their own copy only, cleaned again (fields of their view, amounts only, nothing else kept); an empty list clears them; a teammate\'s copy and anyone but the synced host change nothing',
        J(c1.c_1.unseen) === J([{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_dx', op: 'add', v: 1 }]) && !('unseen' in c2.c_2) && !('unseen' in c3.c_1) && !('unseen' in c4.c_1)
        && /withHoverLines\(window\.wpSystemCore\.charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt, full: fullSys \}\)/.test(src) && (src.match(/full: camp[AQ]?\.system \}/g) || []).length >= 5, J([c1.c_1, c2.c_2, c3.c_1]));
})());

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
// Stage 6 U2: a player's sheet upload (the [netcheck:charupload] slice, run for real with the real systemcore): their own character only, one
// every 10 s, oversize dropped; the proposal waits for the GM in camp.uploads (never in a snapshot); under setting B their own row facts apply
// at once and are synced to them. And the player's machine (net.charUpload, sliced) sends the file without its portrait, only for their own
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const upSrc = between('// [netcheck:charupload-start]', '// [netcheck:charupload-end]', 'charupload');
    const lst = { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Skill'], noQty: true, custom: true, multi: true, lvl: { label: 'Level', min: -10, max: 40, def: 10 }, stats: [{ key: 'attr', labels: ['ST', 'DX', 'IQ'] }, { key: 'diff' }] } };
    const sysU = (rules, gmList) => Sx.cleanSystem(Object.assign({ v: 1, name: 'U', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 10 }, gmList ? Object.assign({}, lst, { edit: 'gm' }) : lst], items: [{ id: 'i_climb', name: 'Climbing', key: 'Climbing', category: 'Skill', stats: { attr: 1, diff: 1 } }] }, rules ? { listRules: rules } : {}), { F: Fx, gmView: true });
    const find = s => nm => s.items.filter(e => e.name.toLowerCase() === String(nm).trim().toLowerCase());
    const dossier = (st, lvl) => ({ name: 'Ana', attributes: { strength: { value: st } }, skills: [{ name: 'Climbing', level: String(lvl), relativeLevel: 'DX/Average' }] });
    const host = (o) => {
        o = o || {}; const sys = sysU(o.rules, o.gmList), ch = { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: !!o.npc, values: { f_st: 12, f_sk: [Object.assign({ id: 'w_c', defId: 'i_climb', qty: 1, lvl: 12 }, o.hid ? { hid: 1 } : {})] } };
        const camp = { id: 'k', system: sys, chars: { c_1: ch, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        if (o.queue) camp.uploads = o.queue;
        const out = { answer: [], deltas: [], toasts: [], logs: [], told: [], saves: 0, camp }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: o.from || 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: !!o.paused, conns: [], roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } }, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const win = { wpFormula: Fx, wpVtt: { on: k => !(o.off && k === 'sheets') }, wpSheets: { sbFinder: (cp, s) => find(s), charChanged() {}, uploadsChanged: id => out.told.push(id), playerSystem: cp => Sx.cleanSystem(cp.system, { F: Fx, gmView: false }) } };
        const msg = Object.assign({ type: 'char-upload', rid: 'e1', charId: 'c_1', sheet: dossier(13, 14) }, o.msg || {});
        const at = o.at || {};
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'toast', 'logEvent', '_uploadAt', 'UPLOAD_GAP_MS', 'sheetsOnFor', 'allow', upSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), at, 10000, () => true, () => true);
        out.at = at; out.ch = ch; return out;
    };
    const kinds = r => (r.camp.uploads || []).map(u => [u.charId, u.from, u.name, u.changes.map(c => c.kind + ':' + c.label).join('|')]);
    const own = host(), mate = host({ from: 'pB' }), slow = host({ at: { pA: Date.now() - 2000 } }), later = host({ at: { pA: Date.now() - 11000 } }), npc = host({ npc: true });
    const big = host({ msg: { sheet: { name: 'Ana', notes: 'a'.repeat(1048577) } } }), badRid = host({ msg: { rid: 'e 1' } }), paused = host({ paused: true }), off = host({ off: true }), gone = host({ msg: { charId: 'c_9' } });
    const same = host({ msg: { sheet: { name: 'Ana', attributes: { strength: { value: 12 } }, skills: [{ name: 'Climbing', level: '12', relativeLevel: 'DX/Average' }] } } });
    const untouched = r => r.ch.values.f_st === 12 && r.ch.values.f_sk[0].lvl === 12 && r.deltas.length === 0;
    const denied = (r, why) => j(r.answer) === j([{ reason: why, type: 'char-upload-ans', rid: 'e1' }]) && !r.camp.uploads && r.saves === 0 && r.toasts.length === 0 && untouched(r);
    check('U2 on the wire (host): the owner\'s file becomes a proposal kept for the GM (camp.uploads: who, which character, its changes; a toast, a log line, the sheet told) and answered with its count; the character itself unchanged until the GM applies it',
        j(own.answer) === j([{ n: 2, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(kinds(own)) === j([['c_1', 'u_a', 'Pat', 'value:ST|fact:Skills: Climbing']]) && /^up_[a-z0-9]+$/.test(own.camp.uploads[0].id)
        && own.toasts.length === 1 && /Pat sent a sheet update for Ana: 2 changes to review/.test(own.toasts[0]) && j(own.logs) === j([['char', own.toasts[0]]]) && j(own.told) === j(['c_1']) && own.saves === 1 && untouched(own), j([own.answer, kinds(own), own.toasts]));
    check('U2 on the wire (host): refused and answered why — a teammate\'s upload of another\'s character (owner), an NPC (owner), a second upload within 10 s (slow; after it, read), a paused table, sheets off, a character gone; nothing kept, saved or said',
        denied(mate, 'owner') && denied(npc, 'owner') && denied(slow, 'slow') && denied(paused, 'paused') && denied(off, 'off') && denied(gone, 'missing') && later.answer[0].n === 2 && mate.at.pB === undefined && own.at.pA > 0,
        j([mate.answer, npc.answer, slow.answer, paused.answer, off.answer, gone.answer]));
    const wpcU = host({ msg: { sheet: { format: 'waypoint-character', v: 1, name: 'Ana', values: {} } } });
    check('F2a on the wire (host): a character file sent as a sheet update is refused and answered so — never read as a ShadowBase dossier; nothing kept, saved or said. The player shows only a reason of ours',
        denied(wpcU, 'file') && /\{ error: Object\.prototype\.hasOwnProperty\.call\(UP_WHY, msg\.reason\) \? UP_WHY\[msg\.reason\] : 'The GM could not read it\.' \}/.test(src.replace(/\r\n/g, '\n')) && /file: 'A character file only fills a character you are still making\.'/.test(src), j(wpcU.answer));
    check('U2 on the wire (host): an oversize file or a malformed request is dropped unanswered; a file matching the sheet answers 0 and keeps nothing',
        big.answer.length === 0 && !big.camp.uploads && badRid.answer.length === 0 && j(same.answer) === j([{ n: 0, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && !same.camp.uploads && same.toasts.length === 0 && same.saves === 1);
    const b = host({ rules: { uploadFacts: true } }), bOnly = host({ rules: { uploadFacts: true }, msg: { sheet: dossier(12, 15) } }), bGm = host({ rules: { uploadFacts: true }, gmList: true }), bHid = host({ rules: { uploadFacts: true }, hid: true });
    const old = [{ id: 'up_old', charId: 'c_1', from: 'u_a', name: 'Pat', at: 1, changes: [] }, { id: 'up_bo', charId: 'c_2', from: 'u_b', name: 'Bea', at: 1, changes: [] }], rep = host({ queue: old });
    check('U2 setting B (host): the owner\'s own row facts apply at once (a skill\'s level), synced to them as a delta, and answered as applied; the rest (a value) still waits; with only facts, nothing waits and the GM is not asked',
        j(b.answer) === j([{ n: 1, auto: 1, type: 'char-upload-ans', rid: 'e1' }]) && b.ch.values.f_sk[0].lvl === 14 && b.ch.values.f_st === 12 && j(b.deltas.map(d => [d[0], Object.keys(d[1])])) === j([['c_1', ['f_sk']]]) && j(kinds(b)) === j([['c_1', 'u_a', 'Pat', 'value:ST']])
        && j(bOnly.answer) === j([{ n: 0, auto: 1, type: 'char-upload-ans', rid: 'e1' }]) && bOnly.ch.values.f_sk[0].lvl === 15 && !bOnly.camp.uploads && bOnly.toasts.length === 0 && bOnly.saves === 1 && own.ch.values.f_sk[0].lvl === 12,
        j([b.answer, b.ch.values, kinds(b), bOnly.answer]));
    check('U2 setting B applies only what the owner could do by hand: on a list only the GM changes the fact waits for the GM with the rest; a row the GM keeps from them is never touched by their file',
        j(bGm.answer) === j([{ n: 2, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && bGm.ch.values.f_sk[0].lvl === 12 && bGm.deltas.length === 0 && j(kinds(bGm)) === j([['c_1', 'u_a', 'Pat', 'value:ST|fact:Skills: Climbing']])
        && bHid.ch.values.f_sk[0].lvl === 12 && bHid.deltas.length === 0 && !/fact:/.test(j(kinds(bHid))), j([bGm.answer, kinds(bGm), bHid.answer, kinds(bHid)]));
    check('U2 a newer upload of a character replaces its older one in the queue (another character\'s stays); the players\' snapshot drops the queue beside the library',
        j(rep.camp.uploads.map(u => u.id === 'up_old' ? 'old' : u.charId)) === j(['c_2', 'c_1']) && /        delete camp\.library;[^\n]*\n        delete camp\.uploads;/.test(src), j(rep.camp.uploads.map(u => u.id)));
    const cs = src.replace(/\r\n/g, '\n'), cA = cs.indexOf('var _uploadPending = {};'), cB = cs.indexOf('// U2: the host tells a character\'s owner'), dB = cs.indexOf('// A player throws an item from their sheet');
    const client = (charId, sheet, o) => {
        o = o || {}; const sent = [], answered = [], camp = { id: 'k', chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: {} }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} }, c_p: { id: 'c_p', name: 'P', ownerId: 'u_a', partial: true } } };
        const net = { active: true, role: o.role || 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', 'setTimeout', 'clearTimeout', cs.slice(cA, cB))(net, () => Sx, () => camp, { wpVtt: { on: () => !o.off } }, () => 0, () => {});
        return { r: net.charUpload(charId, sheet, a => answered.push(a)), sent };
    };
    const cOk = client('c_1', { name: 'Ana', portrait: 'data:image/png;base64,AAAA', skills: [] }), cMate = client('c_2', { name: 'Bo' }), cPart = client('c_p', { name: 'P' }), cBig = client('c_1', { name: 'A', notes: 'a'.repeat(1048577) }), cGm = client('c_1', {}, { role: 'host' }), cOff = client('c_1', {}, { off: true });
    const told = []; const hostNet = { active: true, role: 'host', roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } }, conns: [{ peer: 'pA', open: true, send: m => told.push(['pA', m]) }, { peer: 'pB', open: true, send: m => told.push(['pB', m]) }, { peer: 'pC', open: false, send: m => told.push(['pC', m]) }] };
    new Function('net', 'getActiveCampaign', 'sendFailed', cs.slice(cB, dB))(hostNet, () => ({ chars: { c_1: { id: 'c_1', ownerId: 'u_a' } } }), () => {});
    hostNet.uploadDone('c_1', 3, 5); hostNet.uploadDone('c_9', 1, 1);
    check('U2 on the wire (player): their own whole character\'s file is sent as { type, rid, charId, sheet } without its portrait; another\'s, a hover-only copy, an oversize file, the GM\'s own machine or sheets off send nothing and say why; the GM\'s verdict reaches the owner\'s machines only',
        cA > 0 && cB > cA && dB > cB && cOk.r.ok === true && cOk.sent.length === 1 && j(Object.keys(cOk.sent[0]).sort()) === j(['charId', 'rid', 'sheet', 'type']) && j(cOk.sent[0].sheet) === j({ name: 'Ana', skills: [] }) && cOk.sent[0].type === 'char-upload'
        && [cMate, cPart].every(c => c.r.error === 'That character is not yours.' && c.sent.length === 0) && cBig.r.error === 'That file is too large, or not a sheet.' && cBig.sent.length === 0 && cGm.r.error === 'Not at a table.' && cOff.r.error === 'Character sheets are off here.' && cOff.sent.length === 0
        && j(told) === j([['pA', { type: 'char-upload-done', charId: 'c_1', done: 3, of: 5 }]]), j([cOk, cMate.r, cPart.r, cBig.r, cGm.r, told]));
})());
// Onboarding F1a: the waiting token — the client's cleaner, and the host's section run for real with the real systemcore (one per player per
// campaign, moved not copied, gone once they have a token, the GM's Remove, the grace after a leave, the end of the session), the rules'
// push and a client's take of it, the free spot, and the hooks on the paths that end a player's stay
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js'));
    const good = H.cleanWaitingItem({ id: 'wbq1', type: 'image', waiting: 1, ownerId: 'u_a', name: 'Ana\u202e<b>', color: '#112233', x: 1e9, y: 5, w: 60, h: 52, src: 'https://evil/x.png', isChar: true, charId: 'c_1', face: 'x', sheet: {}, gmInfo: 'secret', hidden: true, layer: 'front' });
    check('F1a cleanWaitingItem (client): a waiting token from the host is rebuilt from its own fields only — its grid shape (a hexagon or a square; anything else a circle), its owner, a clean name, a hex colour, bounded geometry, hidden only when true; a picture, a character link, a sheet or GM info never come through',
        j(good) === j({ id: 'wbq1', type: 'circle', waiting: 1, ownerId: 'u_a', name: 'Ana<b>', color: '#112233', x: 60000, y: 5, w: 60, h: 52, layer: 'middle', hidden: true })
        && [{ id: 'a b', ownerId: 'u_a' }, { id: 'ok', ownerId: 'constructor' }, { id: 'ok', ownerId: 'u a' }, { id: 7, ownerId: 'u_a' }, null, 'x'].every(w => H.cleanWaitingItem(w) === null)
        && j(H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', color: 'red;x', hidden: 'yes', locked: 1, x: 'n' })) === j({ id: 'ok', type: 'circle', waiting: 1, ownerId: 'u_a', name: 'Player', color: '#4db3d3', x: 15000, y: 15000, w: 60, h: 52, layer: 'middle' })
        && H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', locked: true }).locked === true
        && H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', type: 'hexagon' }).type === 'hexagon' && H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', type: 'rect', w: 50, h: 50 }).type === 'rect' && ['image', 'diamond', 'constructor', '__proto__', 'x y', 7, 'Hexagon'].every(t => H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', type: t }).type === 'circle')
        && /function cleanHostWbItem\(w\) \{ if \(!w \|\| typeof w !== 'object' \|\| typeof w\.id !== 'string'\) return null; if \(w\.waiting\) return cleanWaitingItem\(w\);/.test(src), j(good));
    const wSrc = between('// [netcheck:waiting-start]', '// [netcheck:waiting-end]', 'waiting');
    const mkW = (o) => {
        o = o || {};
        const camp = { id: 'k', players: o.players || {}, chars: o.chars || {}, items: { m1: { id: 'm1', type: 'map', meta: { title: 'Inn' }, whiteboard: [] }, m2: { id: 'm2', type: 'map', meta: { title: 'Road' }, whiteboard: [] } } };
        if (o.rules) camp.newPlayers = o.rules;
        const out = { toasts: [], logs: [], saves: 0, sent: [], renders: 0, timers: [], cleared: [], camp };
        const net = { active: true, role: 'host', roster: o.roster || { pA: { id: 'u_a', name: 'Ana\u202e', color: '#112233', location: 'm1' } }, applyingRemote: false,
                      broadcastItemFiltered: (c, m) => out.sent.push(m), isConnected: pid => Object.values(net.roster).some(p => p && p.id === pid) };
        const api = new Function('net', 'SC', 'own', 'cleanRosterName', 'cleanFace', 'spawnSpot', 'toast', 'logEvent', 'save', 'getActiveCampaign', 'render', 'window', 'setTimeout', 'clearTimeout',
            wSrc + '\nreturn { removeWaiting, placeWaiting, settleWaiting, waitingChanged, startWaitGrace, endWaiting, dropWaitingFor };')(
            net, () => Sx, H.own, H.cleanRosterName, H.cleanFace, (map, lr, near) => ({ x: near ? near.x : 100, y: near ? near.y : 200 }), t => out.toasts.push(t), (k, t) => out.logs.push([k, t]),
            () => { out.saves++; if (!net.applyingRemote) out.saveOutsideRemote = true; }, () => camp, () => { out.renders++; }, {},
            (f, ms) => { out.timers.push({ f, ms }); return out.timers.length; }, id => { out.cleared.push(id); });
        return { api, net, camp, out, wb: id => camp.items[id].whiteboard };
    };
    const A = mkW(), p1 = A.api.placeWaiting(A.camp, 'u_a', A.camp.items.m1, null), w1 = JSON.parse(j(A.wb('m1')[0] || {}));   // a copy: the token itself moves on
    const p2 = A.api.placeWaiting(A.camp, 'u_a', A.camp.items.m2, null), w2 = A.wb('m2')[0] || {};
    const p3 = A.api.placeWaiting(A.camp, 'u_a', A.camp.items.m2, null);
    check('F1a placeWaiting: the first makes one waiting token (a circle with their clean name and colour, at the spawn spot) and tells the GM once (a toast and a Session Log "char" line); on another map it MOVES there under a fresh id (never two items with one id on a map: a stroke planted with its id cannot collide; the old map loses it, both maps reported); on its own map nothing changes',
        j(p1) === j(['m1']) && j(Object.assign({}, w1, { id: 'x' })) === j({ id: 'x', type: 'circle', waiting: 1, ownerId: 'u_a', w: 60, h: 52, layer: 'middle', name: 'Ana', color: '#112233', x: 100, y: 200 }) && /^wb[a-z0-9]{1,8}$/.test(w1.id)
        && j(A.out.toasts) === j(['Ana has no character yet \u2014 a waiting token on Inn.']) && j(A.out.logs) === j([['char', 'Ana has no character yet \u2014 a waiting token on Inn']])
        && j(p2.slice().sort()) === j(['m1', 'm2']) && A.wb('m1').length === 0 && w2.id !== w1.id && /^wb[a-z0-9]{1,8}$/.test(w2.id) && A.wb('m2').length === 1 && j(p3) === '[]' && A.out.toasts.length === 1, j([p1, w1, p2, p3, A.out.toasts]));
    A.wb('m1').push({ id: 'extra', type: 'circle', waiting: 1, ownerId: 'u_a', x: 0, y: 0 }, { id: 'other', type: 'circle', waiting: 1, ownerId: 'u_b', x: 0, y: 0 });
    const p4 = A.api.placeWaiting(A.camp, 'u_a', A.camp.items.m2, null), r1 = A.api.removeWaiting(A.camp, 'u_a');
    check('F1a: never two — a stray second waiting token of theirs goes when theirs is placed (another player\'s stays); removeWaiting takes every one of theirs and names the maps',
        j(p4) === j(['m1']) && j(A.wb('m1').map(w => w.id)) === j(['other']) && j(r1) === j(['m2']) && A.wb('m2').length === 0 && A.wb('m1').length === 1, j([p4, r1, A.wb('m1'), A.wb('m2')]));
    const B = mkW(), sKeep = B.api.settleWaiting(B.camp, 'u_a', B.camp.items.m1, 'none', null), nB = B.wb('m1').length;
    const sGone = B.api.settleWaiting(B.camp, 'u_a', B.camp.items.m1, 'keep', null), nB2 = B.wb('m1').length;
    B.api.settleWaiting(B.camp, 'u_a', B.camp.items.m1, 'none', null); const rmd = B.net.removeWaiting('u_a'), nB3 = B.wb('m1').length;
    const sBlocked = B.api.settleWaiting(B.camp, 'u_a', B.camp.items.m1, 'none', null), nB4 = B.wb('m1').length;
    B.net.allowWaiting('u_a'); const sAgain = B.api.settleWaiting(B.camp, 'u_a', B.camp.items.m1, 'none', null), nB5 = B.wb('m1').length;
    B.camp.newPlayers = { token: 'off' }; const sOff = B.api.settleWaiting(B.camp, 'u_a', B.camp.items.m1, 'none', null), nB6 = B.wb('m1').length;
    check('F1a settleWaiting + the GM\'s hands: nothing found places it, a token found removes it; the GM\'s Remove takes it and keeps it away for the session (a later arrival places none) until a give allows it again; a table that gives none removes it',
        j(sKeep) === j(['m1']) && nB === 1 && j(sGone) === j(['m1']) && nB2 === 0 && rmd === true && nB3 === 0 && j(sBlocked) === '[]' && nB4 === 0 && j(sAgain) === j(['m1']) && nB5 === 1 && j(sOff) === j(['m1']) && nB6 === 0, j([sKeep, sGone, rmd, sBlocked, sAgain, sOff]));
    const C = mkW(); C.api.placeWaiting(C.camp, 'u_a', C.camp.items.m1, null); C.out.sent.length = 0; C.out.saves = 0;
    C.api.startWaitGrace('u_a'); const g1 = C.out.timers[0]; if (g1) g1.f(); const kept = C.wb('m1').length;
    C.api.startWaitGrace('u_a'); C.api.startWaitGrace('u_a'); const restarted = C.out.cleared.length === 1; delete C.net.roster.pA; const g2 = C.out.timers[2]; if (g2) g2.f(); const gone = C.wb('m1').length;
    check('F1a the grace: a player who leaves keeps their waiting token for three minutes (180000 ms); back by then, it stays; a second leave restarts the clock; still away, it goes — saved (as the host\'s own write) and sent',
        g1 && g1.ms === 180000 && kept === 1 && restarted && gone === 0 && C.out.saves === 1 && !C.out.saveOutsideRemote && j(C.out.sent) === j(['m1']) && C.net.applyingRemote === false, j([C.out.timers.map(t => t && t.ms), kept, gone, C.out.saves, C.out.sent]));
    const D = mkW({ roster: { pA: { id: 'u_a', name: 'Ana', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm2' } } });
    D.api.placeWaiting(D.camp, 'u_a', D.camp.items.m1, null); D.api.placeWaiting(D.camp, 'u_b', D.camp.items.m2, null);
    D.net.hideWaiting('u_a', true); const hid = D.wb('m1')[0].hidden === true; D.net.hideWaiting('u_a', false); const shown = !('hidden' in D.wb('m1')[0]);
    D.api.startWaitGrace('u_b'); D.net.removeWaiting('u_a'); D.api.endWaiting(true);
    const allGone = D.wb('m1').length === 0 && D.wb('m2').length === 0;
    D.net.roster.pA.location = 'm1'; D.api.settleWaiting(D.camp, 'u_a', D.camp.items.m1, 'none', null); const unblocked = D.wb('m1').length === 1;
    D.wb('m1').length = 0; D.net.tidyWaiting(); const tidied = D.wb('m1').length === 1 && D.wb('m2').length === 1;
    check('F1a Hide / Show, the end of the session and the tidy: the GM hides and shows a waiting token; the end takes every one, clears the grace timers and forgets the session\'s Removes; a tidy (a setting changed) gives every connected player without a character theirs',
        hid && shown && allGone && D.out.cleared.length >= 1 && unblocked && tidied, j([hid, shown, allGone, D.out.cleared, unblocked, D.wb('m1'), D.wb('m2')]));
    // the review's fixes, run on the same section: beside the token they lost, a ban inside the grace, off takes an away player's, an undo's quiet tidy
    const E = mkW({ roster: { pA: { id: 'u_a', name: 'Ana', location: 'm1' } } });
    const nearP = E.api.settleWaiting(E.camp, 'u_a', E.camp.items.m1, 'none', null, { x: 700, y: 800 }), atNear = E.wb('m1')[0] || {};
    E.net.roster = {}; E.api.startWaitGrace('u_a'); E.api.dropWaitingFor('u_a'); const banned = E.wb('m1').length === 0 && E.out.cleared.length === 1;
    const F2 = mkW({ roster: { pA: { id: 'u_a', name: 'Ana', location: 'm1' } } }); F2.api.placeWaiting(F2.camp, 'u_a', F2.camp.items.m1, null); F2.api.placeWaiting(F2.camp, 'u_b', F2.camp.items.m2, null);   // u_b is away (not in the roster)
    F2.camp.newPlayers = { token: 'off' }; const offMaps = F2.net.tidyWaiting({ quiet: true }).sort(), offGone = F2.wb('m1').length === 0 && F2.wb('m2').length === 0 && F2.out.saves === 0;
    const G = mkW({ roster: { pA: { id: 'u_a', name: 'Ana', location: 'm1' } } }); G.api.placeWaiting(G.camp, 'u_a', G.camp.items.m1, null); G.wb('m1').push({ id: 'back', isChar: true, ownerId: 'u_a', x: 0, y: 0 }); G.out.saves = 0;
    const undoMaps = G.net.tidyWaiting({ quiet: true, mapId: 'm1' }), undoOk = j(undoMaps) === j(['m1']) && !G.wb('m1').some(w => w.waiting) && G.out.saves === 0;
    check('F1a review fixes: a waiting token placed after a give away stands beside the token they lost; a ban takes it at once even inside the grace (the timer stopped); turning waiting tokens off takes an away player\'s too; an undo that gives a token back settles it quietly (the undo saves and sends)',
        atNear.x === 700 && atNear.y === 800 && j(nearP) === j(['m1']) && banned && j(offMaps) === j(['m1', 'm2']) && offGone && undoOk, j([atNear, banned, offMaps, undoMaps, G.wb('m1')]));
    check('F1a review fixes (the hooks): a waiting token\'s map copy goes through the walls rule like a move before it takes x/y; the resolver passes the give-away spot and redraws a map a waiting token left; the GM\'s pending edit is flushed first; the Players panel\'s ban drops it; the Host panel box is the host\'s alone',
        /if \(\(lw\.isChar \|\| lw\.waiting\) && typeof moveRefused === 'function'\) \{[\s\S]{0,1400}?\n\s*if \(lw\.waiting\) \{ if \(lw\.x !== w\.x/.test(src) && /var wMaps = settleWaiting\(camp, pid, map, src\.op, landRoomId, opts\.near/.test(src) && /wMaps\.indexOf\(myActive\.activeItemId\) >= 0\)\) render\(\);/.test(src)
        && /function waitingChanged\(camp, maps\) \{\n\s*if \(!maps \|\| !maps\.length\) return;\n\s*if \(window\.wpHistFlush\) window\.wpHistFlush\(\);/.test(src.replace(/\r\n/g, '\n')) && /if \(key\) net\.kickPlayer\(key\);\n\s*dropWaitingFor\(pid\);/.test(src.replace(/\r\n/g, '\n')) && /if \(net\.active && net\.role !== 'host'\) \{ refreshNewPlayersBox\(\); return; \}/.test(src));
    // F1b review: the waiting token wears the roster face (kept for the GM while its player is away), cleaned on a player's copy; the client converges
    const Fw = mkW({ roster: { pA: { id: 'u_a', name: 'Ana', location: 'm1', face: 'pic:orc' } } }); Fw.api.placeWaiting(Fw.camp, 'u_a', Fw.camp.items.m1, null);
    const wf1 = (Fw.wb('m1')[0] || {}).face; Fw.net.roster.pA.face = '\u{1F409}'; const redress = Fw.api.placeWaiting(Fw.camp, 'u_a', Fw.camp.items.m1, null), wf2 = (Fw.wb('m1')[0] || {}).face;
    const rlSrc = src.replace(/\r\n/g, '\n'), rlA = rlSrc.indexOf('net.sendMyLook = function'), rlB = rlSrc.indexOf('net.removeWaiting = function');
    const rl = (o) => { const sent = [], timers = []; const netR = Object.assign({ active: true, role: 'client', paused: false, selfPaused: false, syncedPeer: 'h', myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => sent.push(m) }], roster: { u_a: { id: 'u_a', face: o.have } } }, o.net || {});
        const api = new Function('net', 'getProfile', 'cleanFace', 'own', 'sendFailed', 'setTimeout', rlSrc.slice(rlA, rlB) + '\nreturn net;')(netR, () => ({ face: o.want }), H.cleanFace, H.own, e => { throw e; }, (f) => { timers.push(f); return timers.length; });
        api.reconcileLook(); api.reconcileLook(); timers.forEach(f => f()); return { sent, timers: timers.length }; };
    const rDiff = rl({ have: 'pic:orc', want: '\u{1F409}' }), rSame = rl({ have: '\u{1F409}', want: '\u{1F409}' }), rPaused = rl({ have: 'pic:orc', want: '\u{1F409}', net: { selfPaused: true } }), rHost = rl({ have: 'pic:orc', want: '\u{1F409}', net: { role: 'host' } });
    check('F1b review fixes: the waiting token wears the face on the roster (and follows a change), cleaned on a player\'s copy; a player whose roster entry disagrees with their chosen face sends it again once, a moment later (never while paused, never when it agrees, never on the host)',
        wf1 === 'pic:orc' && wf2 === '\u{1F409}' && j(redress) === j(['m1']) && H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', face: '\u{1F409}' }).face === '\u{1F409}' && !('face' in H.cleanWaitingItem({ id: 'ok', ownerId: 'u_a', face: '<b>' }))
        && rDiff.timers === 1 && j(rDiff.sent) === j([{ type: 'my-look', face: '\u{1F409}' }]) && rSame.sent.length === 0 && rSame.timers === 0 && rPaused.sent.length === 0 && rPaused.timers === 0 && rHost.sent.length === 0 && rHost.timers === 0
        && /if \(net\.reconcileLook\) net\.reconcileLook\(\);/.test(src) && (src.match(/if \(!on && net\.reconcileLook\) net\.reconcileLook\(\);/g) || []).length === 2, j([wf1, wf2, rDiff, rSame, rPaused]));
    // the rules' push (host) and a client's take of it
    const nsSrc = between('// [netcheck:newplayerssync-start]', '// [netcheck:newplayerssync-end]', 'newplayerssync');
    const mkS = () => {
        const camp = { id: 'k' }, sent = { pA: [], pW: [] }, tidies = [];
        const net = { active: true, role: 'host', roster: { pA: { id: 'u_a' } }, conns: [{ peer: 'pA', open: true, send: m => sent.pA.push(m) }, { peer: 'pW', open: true, send: m => sent.pW.push(m) }], tidyWaiting: () => tidies.push(1) };
        new Function('net', 'SC', 'getActiveCampaign', 'own', 'sendFailed', nsSrc)(net, () => Sx, () => camp, H.own, e => { throw e; });
        return { camp, net, sent, tidies };
    };
    const P = mkS(); P.net.syncNewPlayers(); P.net.syncNewPlayers(); P.camp.newPlayers = { token: 'off', sight: true }; P.net.syncNewPlayers();
    check('F1a the rules on the wire (host): sent to admitted players once per change (a peer waiting for Allow hears nothing), always complete (the defaults filled in); a change mid-session settles every waiting token (a tidy), the first send does not; the snapshot sets the signature; every save syncs it',
        j(P.sent.pA) === j([{ type: 'newPlayers', campId: 'k', token: 'on', sight: false }, { type: 'newPlayers', campId: 'k', token: 'off', sight: true }]) && P.sent.pW.length === 0 && P.tidies.length === 1
        && /var npm = net\.newPlayersMessage\(\); if \(npm\) net\._lastNewPlayersSig = newPlayersSig\(npm\);/.test(src) && /net\.syncNewPlayers\(\); \/\/ and the rules for players without a character/.test(src) && /net\._lastNewPlayersSig = null; \/\/ and the rules/.test(src), j([P.sent, P.tidies]));
    const npSrc = between('// [netcheck:newplayers-start]', '// [netcheck:newplayers-end]', 'newplayers');
    const take = (msg, peer, start) => { const camp = { id: 'k' }; if (start) camp.newPlayers = start; const r = { renders: 0 }; new Function('msg', 'conn', 'net', 'state', 'campOf', 'SC', 'window', 'render', npSrc)(msg, { peer: peer || 'h' }, { foreign: true, syncedPeer: 'h', stream: false }, { appState: { activeCampaignId: 'k' } }, id => (id === 'k' ? camp : null), () => Sx, {}, () => { r.renders++; }); return Object.assign(r, { np: camp.newPlayers }); };
    const tOff = take({ type: 'newPlayers', campId: 'k', token: 'off', sight: true }), tDef = take({ type: 'newPlayers', campId: 'k', token: 'on', sight: false }, 'h', { token: 'off' }), tJunk = take({ type: 'newPlayers', campId: 'k', token: 'maybe', sight: 'yes' }, 'h', { sight: true });
    const tPeer = take({ type: 'newPlayers', campId: 'k', token: 'off' }, 'x'), tCamp = take({ type: 'newPlayers', campId: 'k2', token: 'off' });
    check('F1a the rules on the wire (player): taken only from the synced host, for the hosted campaign, and cleaned (the defaults store nothing, junk counts as the default); the map redraws',
        j(tOff.np) === j({ token: 'off', sight: true }) && tOff.renders === 1 && tDef.np === undefined && tJunk.np === undefined && tPeer.np === undefined && tPeer.renders === 0 && tCamp.np === undefined, j([tOff, tDef, tJunk, tPeer, tCamp]));
    // the free spot: a waiting token is an obstacle, except the one about to give way
    const fsSrc = fnSrc('function freeSpotNear(', '\nfunction ', 'freeSpotNear'), ssSrc = fnSrc('function spawnSpot(', '\n/* Host: player P', 'spawnSpot');
    const FS = new Function('window', 'landingPoint', fsSrc + '\n' + ssSrc + '\nreturn { freeSpotNear, spawnSpot };')({}, () => null);
    const mapF = { id: 'm1', meta: {}, whiteboard: [{ id: 'wt', waiting: 1, ownerId: 'u_a', x: 70, y: 74, w: 60, h: 52 }] };
    const blocked = FS.freeSpotNear(mapF, 100, 100, 60, 52, null, null), through = FS.spawnSpot(mapF, null, { x: 100, y: 100 }, 60, 52, 'wt');
    check('F1a the free spot: two joiners never share a spot and a new token never lands on a waiting one — except the waiting token that gives way to it (the new token takes its place)',
        !(blocked.x === 70 && blocked.y === 74) && through.x === 70 && through.y === 74, j([blocked, through]));
    check('F1a the hooks: the resolver settles the waiting token after every arrival and give (the new token takes its spot); a leave starts the grace, a return inside it ends it, a ban and a Forget take it, the end of the session takes them all; the pos and patch gates take a waiting token\'s move only',
        /var wMaps = settleWaiting\(camp, pid, map, src\.op, landRoomId, /.test(src) && /var spot = spawnSpot\(map, landRoomId, near, nw\.w \|\| 60, nw\.h \|\| 52, waitHere \? waitHere\.w\.id : null\);/.test(src)
        && /if \(p\) startWaitGrace\(p\.id\);/.test(src) && /if \(_waitGrace\[prof\.id\]\) \{ clearTimeout\(_waitGrace\[prof\.id\]\); delete _waitGrace\[prof\.id\]; \}/.test(src)
        && /if \(p\) dropWaitingFor\(p\.id\);/.test(src) && /endWaiting\(wasHost\);/.test(src)
        && /if \(w\.hidden \|\| !\(w\.isChar \|\| w\.waiting\) \|\|/.test(src) && /if \(lw\.waiting\) \{ if \(lw\.x !== w\.x \|\| lw\.y !== w\.y\) \{ lw\.x = w\.x; lw\.y = w\.y; changed = true; \} return; \}/.test(src));
})());
// Onboarding F1b: faces — the rule (cleanFace), how a face is drawn (faceView), the roster both ways, hello, setProfile and my-look (run for real)
{
    const F24 = ['\u{1F9D9}', '\u{1F9DD}', '\u{1F9DA}', '\u{1F9DB}', '\u{1F9DF}', '\u2694\uFE0F', '\u{1F5E1}\uFE0F', '\u{1F3F9}', '\u{1F6E1}\uFE0F', '\u{1F52E}', '\u{1F4DC}', '\u{1F451}', '\u{1F916}', '\u{1F47D}', '\u{1F680}', '\u{1F6F0}\uFE0F', '\u2699\uFE0F', '\u{1F575}\uFE0F', '\u{1F43A}', '\u{1F409}', '\u{1F985}', '\u{1F480}', '\u{1F525}', '\u26A1'];
    const shT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
    const esA = shT.indexOf('var EMOJI_SET = ['), esB = shT.indexOf('];', esA), EMOJI_SET = new Function('return ' + shT.slice(esA + 'var EMOJI_SET = '.length, esB + 1) + ';')();
    const badEs = EMOJI_SET.filter(x => H.cleanFace(x[0]) !== x[0]).map(x => x[0]);
    const fam = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', thumbs = '\u{1F44D}\u{1F3FD}';
    const refused = ['A', 'abc', '1', '\u{1F1FA}\u{1F1F8}', '<b>', 'x\u{1F525}', '\u{1F525}\u200B', '\u{1F525}\u202E', '\u0000', '\u{1F525}'.repeat(9), '\u{1F409}\u{1F409}', '\u200D', '\uFE0F', '\u200D'.repeat(8), '\u{1F3FD}', '\u00A9\u00AE\u2122', '\u{1F409}\u200D', '\u200D\u{1F409}', Array(9).fill('\u{1F409}').join('\u200D'), 'pic:', 'pic:../x', 'pic:ORC', 'pic:https://e/x.png', 'photo ', 'Default', 5, null, undefined, {}];
    check('F1b cleanFace: the 24 character faces and every emoji of the sheet editor pass whole; ONE joined sequence (a family, a couple, a gendered detective) and a skin tone stay whole; the picture, the default and the 15 bundled pictures by name; letters, digits, flags, markup, zero-width or bidi characters, a mixed string, a run of several emoji, a joiner, selector or skin tone alone, a dangling joiner, or any other shape is refused whole',
        F24.every(e => H.cleanFace(e) === e) && badEs.length === 0 && EMOJI_SET.length > 60 && H.cleanFace(fam) === fam && H.cleanFace(thumbs) === thumbs && H.cleanFace('\u{1F575}\uFE0F\u200D\u2642\uFE0F') === '\u{1F575}\uFE0F\u200D\u2642\uFE0F' && H.cleanFace('\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F468}') === '\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F468}'
        && ['photo', 'default', 'pic:orc', 'pic:minotaur_archer', 'pic:tharic'].every(f => H.cleanFace(f) === f) && H.FACE_PICS.length === 15 && refused.every(f => H.cleanFace(f) === ''), j(badEs));
    const def = c => 'DEF(' + c + ')', av = 'data:image/png;base64,AAAA';
    const fv = (p) => j(H.faceView(p, '#123456', def));
    check('F1b faceView: a bundled picture is the app\'s own asset (square art); an emoji is text; their picture only when it passes whole; the default (or a face the rule refuses) is the silhouette on their colour, and "default" wins over a picture',
        fv({ face: 'pic:orc', avatar: av }) === j({ img: 'assets/tutorial/orc_sq.jpg' }) && fv({ face: '\u{1F409}' }) === j({ emoji: '\u{1F409}' }) && fv({ face: 'photo', avatar: av }) === j({ img: av })
        && fv({ avatar: av }) === j({ img: av }) && fv({ face: 'photo', avatar: 'javascript:alert(1)' }) === j({ img: 'DEF(#123456)' }) && fv({ face: 'default', avatar: av }) === j({ img: 'DEF(#123456)' })
        && fv({ face: 'pic:../../x', avatar: av }) === j({ img: av }) && fv({ face: '<img src=x>' }) === j({ img: 'DEF(#123456)' }) && fv(null) === j({ img: 'DEF(#123456)' }));
    const rcSrc = between('// [netcheck:rosterclean-start]', '// [netcheck:rosterclean-end]', 'rosterclean');
    const cleanRoster = new Function('safeAvatar', 'cleanRosterName', 'validProfileId', 'cleanFace', rcSrc + '\nreturn cleanHostRoster;')(H.safeAvatar, H.cleanRosterName, H.validProfileId, H.cleanFace);
    const rc = cleanRoster([{ id: 'u_a', name: 'A', face: '\u{1F409}' }, { id: 'u_b', name: 'B', face: '<b>x</b>' }, { id: 'u_c', name: 'C', face: 'pic:orc' }]);
    check('F1b the roster both ways: a player\'s own roster copy keeps a clean face and drops any other; the host sends only a clean one; hello keeps a clean face and drops the rest; setProfile stores it through the same rule (\'\' clears)',
        rc.u_a.face === '\u{1F409}' && !('face' in rc.u_b) && rc.u_c.face === 'pic:orc'
        && /var fP = cleanFace\(p\.face\); if \(fP\) e\.face = fP;/.test(src) && /prof = \{ id: prof\.id, name: prof\.name, color: prof\.color, avatar: prof\.avatar, face: cleanFace\(prof\.face\) \};[^\n]*\n\s*if \(!prof\.face\) delete prof\.face;/.test(src)
        && /if \(typeof patch\.face === 'string'\) \{ var cf = cleanFace\(patch\.face\); if \(cf\) p\.face = cf; else if \(patch\.face === ''\) delete p\.face; \}/.test(src), j(rc));
    const expAt = src.indexOf('net.FACE_PICS = FACE_PICS.slice()'), helpEnd = src.indexOf('// [netcheck:helpers-end]'), picsAt = src.indexOf('var FACE_PICS = [');
    check('F1b the face exports run after the helpers assign FACE_PICS (above them, net.js stopped loading at the first line that read it: found live — the table could not be hosted)',
        expAt > helpEnd && helpEnd > picsAt && picsAt > 0 && (src.match(/net\.FACE_PICS = FACE_PICS\.slice\(\)/g) || []).length === 1, j([picsAt, helpEnd, expAt]));
    const mlSrc = between('// [netcheck:mylook-start]', '// [netcheck:mylook-end]', 'mylook');
    const look = (msg, o) => {
        o = o || {}; const out = { bc: 0, rr: 0, rd: 0, allows: 0 }, wtok = { id: 'wt', waiting: 1, ownerId: 'u_a', face: o.start };
        const net = { paused: !!o.paused, roster: { pA: { id: 'u_a', face: o.start } } };
        new Function('msg', 'conn', 'net', 'own', 'peerPaused', 'cleanFace', 'allow', 'broadcastRoster', 'renderRoster', 'render', 'SC', 'getActiveCampaign', mlSrc)(msg, { peer: o.peer || 'pA' }, net, H.own, () => !!o.pp, H.cleanFace, (k, lim) => { out.allows++; out.lim = lim; return o.allow !== false; }, () => { out.bc++; }, () => { out.rr++; }, () => { out.rd++; },
            () => ({ waitingTokensOf: (c, pid) => (pid === 'u_a' ? [{ w: wtok }] : []) }), () => ({ id: 'k' }));
        return Object.assign(out, { face: net.roster.pA.face, wface: wtok.face });
    };
    const lOk = look({ face: '\u{1F43A}' }), lClr = look({ face: '' }, { start: 'pic:orc' }), lBad = look({ face: '<script>' }, { start: 'pic:orc' }), lPause = look({ face: '\u{1F43A}' }, { paused: true }), lPP = look({ face: '\u{1F43A}' }, { pp: true });
    const lRate = look({ face: '\u{1F43A}' }, { allow: false }), lStranger = look({ face: '\u{1F43A}' }, { peer: 'pX' }), lSame = look({ face: 'pic:orc' }, { start: 'pic:orc' }), lShape = look({ face: 5 });
    check('F1b my-look (host, run for real): an admitted player\'s clean face is stored on their roster entry and their waiting token (the GM keeps seeing it while they are away) and sent to everyone (the roster redrawn); \'\' clears it; about one change a second (a burst of five); a refused face, a paused table or player, a flood, a stranger, no string or no change (which costs no allowance) changes nothing',
        lOk.face === '\u{1F43A}' && lOk.bc === 1 && lOk.rd === 1 && lOk.wface === '\u{1F43A}' && j(lOk.lim) === j({ perMs: 1000, burst: 5, windowMs: 10000 }) && lClr.face === undefined && lClr.wface === undefined && lClr.bc === 1 && lBad.face === 'pic:orc' && lBad.bc === 0 && lPause.face === undefined && lPP.bc === 0 && lRate.bc === 0 && lStranger.bc === 0 && lSame.bc === 0 && lSame.allows === 0 && lShape.bc === 0
        && /net\.sendMyLook = function\(\) \{\n\s*if \(!net\.active \|\| net\.role !== 'client' \|\| net\.paused \|\| net\.selfPaused \|\| !net\.syncedPeer/.test(src.replace(/\r\n/g, '\n')), j([lOk, lClr, lBad, lPause, lRate]));
}
// Onboarding F1c: a character's own picture — the plan (charFacePlan), char-pic on the host (run for real) and the player's sender
{
    const av = 'data:image/png;base64,AAAA';
    const plan = (f, a) => j(H.charFacePlan(f, a));
    check('F1c charFacePlan: their photo becomes a picture to save (only one that passes whole); a bundled picture by name; an emoji or the default is drawn on the tokens; no face chosen means their photo when they have one, else the default; anything the face rule refuses counts as no face',
        plan('photo', av) === j({ kind: 'picture', data: av }) && plan('photo', 'javascript:x') === j({ kind: 'face', face: 'default' }) && plan('pic:orc', av) === j({ kind: 'bundled', name: 'orc' }) && plan('\u{1F409}', av) === j({ kind: 'face', face: '\u{1F409}' })
        && plan('default', av) === j({ kind: 'face', face: 'default' }) && plan('', av) === j({ kind: 'picture', data: av }) && plan(undefined, undefined) === j({ kind: 'face', face: 'default' }) && plan('pic:../x', undefined) === j({ kind: 'face', face: 'default' }) && plan('<b>', av) === j({ kind: 'picture', data: av }));
    const cpSrc = between('// [netcheck:charpic-start]', '// [netcheck:charpic-end]', 'charpic');
    const pic = async (msg, o) => {   // the answer comes once applyCharFace settles: it is read after the promise queue drains
        o = o || {}; const out = { ans: [], applied: [], toasts: [], logs: [], cfg: null, syncOk: 0 };
        const camp = { id: 'k', chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: {} }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', values: {} }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: {} } } };
        const net = { paused: !!o.paused, roster: { pA: { id: 'u_a', name: 'Pat', avatar: o.avatar } } };
        const win = { wpVtt: { on: () => !o.off }, wpSheets: o.noSheets ? {} : { applyCharFace: (id, p, rep) => { out.applied.push([id, p, rep]); return o.reject ? Promise.reject(new Error('disk')) : Promise.resolve(o.result === undefined ? true : o.result); } } };
        new Function('msg', 'conn', 'net', 'own', 'peerPaused', 'cleanFace', 'safeAvatar', 'charFacePlan', 'allow', 'getActiveCampaign', 'window', 'toast', 'logEvent', 'sendFailed', cpSrc)(
            Object.assign({ type: 'char-pic', rid: 'p1', charId: 'c_1' }, msg), { peer: o.peer || 'pA', send: m => out.ans.push(JSON.parse(JSON.stringify(m))) }, net, H.own, () => !!o.peerPaused, H.cleanFace, H.safeAvatar, H.charFacePlan, (name, cfg) => { out.cfg = cfg; return o.allow !== false; }, () => camp, win, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), e => { throw e; });
        out.syncOk = out.ans.filter(a => a.ok).length + out.toasts.length;
        await new Promise(r => setImmediate(r));
        return out;
    };
    const why = r => r.ans.length === 1 ? (r.ans[0].reason || (r.ans[0].ok ? 'ok' : '?')) : 'none:' + r.ans.length;
    pendingChecks.push((async () => {
        const pOk = await pic({ face: 'pic:orc' }), pPhoto = await pic({ face: 'photo' }, { avatar: av }), pImg = await pic({ face: '', img: av }), pEmoji = await pic({ face: '\u{1F409}' });
        const denied = [];
        for (const [m, o] of [[{ face: 'pic:orc', charId: 'c_2' }], [{ face: 'pic:orc', charId: 'c_n' }], [{ face: 'pic:orc' }, { paused: true }], [{ face: 'pic:orc' }, { peerPaused: true }], [{ face: 'pic:orc' }, { off: true }], [{ face: 'pic:orc' }, { noSheets: true }],
            [{ face: 'pic:orc', charId: 'c_9' }], [{ face: '<b>' }], [{ face: '', img: 'data:image/svg+xml;base64,AA' }], [{ face: 'pic:orc', img: 'https://e/x.png' }], [{ face: 'pic:orc' }, { allow: false }]]) denied.push(await pic(m, o));
        const pFail = await pic({ face: 'pic:orc' }, { result: false }), pRej = await pic({ face: 'pic:orc' }, { reject: true }), pX = await pic({ face: 'pic:orc' }, { peer: 'pX' }), pRid = await pic({ face: 'pic:orc', rid: 'a b' });
        check('F1c char-pic (host, run for real): the owner\'s face or uploaded picture reaches applyCharFace as a plan (\'photo\' reads the picture on their roster entry), replacing its picture; the answer, the GM\'s toast and the Session Log line wait until it is saved, and one that could not be saved is answered so, told to no one; another\'s character, an NPC, a paused table or player, sheets off, a missing character, a face the rule refuses, a picture that fails the whole-string check (with a good face too) or a flood (per player and table-wide) is refused and answered why; a stranger or a bad rid gets nothing',
            why(pOk) === 'ok' && pOk.syncOk === 0 && j(pOk.applied) === j([['c_1', { kind: 'bundled', name: 'orc' }, true]]) && j(pPhoto.applied[0][1]) === j({ kind: 'picture', data: av }) && j(pImg.applied[0][1]) === j({ kind: 'picture', data: av }) && j(pEmoji.applied[0][1]) === j({ kind: 'face', face: '\u{1F409}' })
            && pOk.toasts.length === 1 && /Pat changed Ana\u2019s picture/.test(pOk.toasts[0]) && pOk.logs.length === 1 && pOk.logs[0][0] === 'char' && pOk.cfg && pOk.cfg.table > 0 && pOk.cfg.table <= 30
            && j(denied.map(why)) === j(['owner', 'owner', 'paused', 'paused', 'off', 'off', 'missing', 'bad', 'bad', 'bad', 'slow']) && denied.every(r => r.applied.length === 0 && r.toasts.length === 0)
            && why(pFail) === 'failed' && why(pRej) === 'failed' && [pFail, pRej].every(r => r.applied.length === 1 && r.toasts.length === 0 && r.logs.length === 0)
            && pX.ans.length === 0 && pRid.ans.length === 0, j([why(pOk), pOk.syncOk, denied.map(why), why(pFail), why(pRej)]));
    })());
    const cpaSrc = between('// [netcheck:charpicans-start]', '// [netcheck:charpicans-end]', 'charpicans');
    const picAns = (msg) => { const got = [], pend = { p1: { done: a => got.push(a), timer: 1 } }; let cleared = 0; new Function('msg', '_picPending', 'clearTimeout', cpaSrc)(msg, pend, () => { cleared++; }); return { got, left: Object.keys(pend).length, cleared }; };
    const aOk = picAns({ rid: 'p1', ok: true }), aWhy = picAns({ rid: 'p1', reason: 'failed' }), aProto = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nope'].map(r => picAns({ rid: 'p1', reason: r }).got[0].error), aNum = picAns({ rid: 'p1', reason: 7 }).got[0].error, aNo = picAns({ rid: 'zz', ok: true }), aProtoRid = picAns({ rid: '__proto__', ok: true });
    check('F1c char-pic answer (player, run for real): ok, or one of our own reasons in words; a reason naming a prototype key, or anything else, reads as a plain refusal; an answer to no question of ours does nothing',
        j(aOk.got) === j([{ ok: true }]) && aOk.left === 0 && aOk.cleared === 1 && aWhy.got[0].error === 'The GM could not save that picture.' && aProto.every(e => e === 'The GM could not take it.') && aNum === 'The GM could not take it.'
        && aNo.got.length === 0 && aNo.left === 1 && aNo.cleared === 0 && aProtoRid.got.length === 0, j([aOk, aWhy, aProto, aNum]));
    const ps = src.replace(/\r\n/g, '\n'), psA = ps.indexOf('var _picPending = {};'), psB = ps.indexOf('// Onboarding F1b: a player\'s changed face reaches the host');
    const sendPic = (charId, face, img, o) => { o = o || {}; const sent = [], camp = { id: 'k', chars: { c_1: { id: 'c_1', ownerId: 'u_a', values: {} }, c_2: { id: 'c_2', ownerId: 'u_b', values: {} }, c_p: { id: 'c_p', ownerId: 'u_a', partial: true } } };
        const netS = { active: true, role: 'client', stream: false, paused: !!o.paused, selfPaused: false, syncedPeer: 'h', myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) }] };
        new Function('net', 'getActiveCampaign', 'own', 'cleanFace', 'safeAvatar', 'window', 'setTimeout', 'clearTimeout', ps.slice(psA, psB))(netS, () => camp, H.own, H.cleanFace, H.safeAvatar, { wpVtt: { on: () => true } }, () => 0, () => {});
        return { r: netS.charPic(charId, face, img, () => {}), sent }; };
    const sOk = sendPic('c_1', 'pic:orc', ''), sImg = sendPic('c_1', '', av), sBadImg = sendPic('c_1', '', 'https://e/x.png'), sMate = sendPic('c_2', 'pic:orc', ''), sPart = sendPic('c_p', 'pic:orc', ''), sPause = sendPic('c_1', 'pic:orc', '', { paused: true }), sNone = sendPic('c_1', '<b>', '');
    check('F1c char-pic (player): only their own whole character, not while paused; a clean face, or a picture that passes whole, and nothing else travels',
        sOk.r.ok && j(Object.keys(sOk.sent[0]).sort()) === j(['charId', 'face', 'rid', 'type']) && sOk.sent[0].face === 'pic:orc' && sImg.sent[0].img === av && sImg.sent[0].face === ''
        && [sBadImg, sMate, sPart, sPause, sNone].every(x => x.r.error && x.sent.length === 0), j([sOk, sImg.sent, sBadImg.r, sMate.r, sPart.r, sPause.r, sNone.r]));
    const tfA = ps.indexOf('function tokenFromChar('), tfB = ps.indexOf('\n}\n', tfA) + 2;
    const tfc = new Function('net', 'cleanFace', ps.slice(tfA, tfB) + '\nreturn tokenFromChar;')({ roster: { pA: { id: 'u_a', color: '#123456' } } }, H.cleanFace);
    const tF = tfc({ id: 'c_1', name: 'Ana', portrait: '', face: '\u{1F409}' }, 'u_a'), tPo = tfc({ id: 'c_1', name: 'Ana', portrait: '/saves/images/x.png', face: '\u{1F409}' }, 'u_a'), tBad = tfc({ id: 'c_1', name: 'Ana', face: '<b>x</b>' }, 'u_a');
    check('F1c a token made for a character wears its own face (its picture wins; a face the rule refuses is left off)',
        tfA > 0 && tF.face === '\u{1F409}' && tF.type === 'circle' && tF.color === '#123456' && !('face' in tPo) && tPo.src === '/saves/images/x.png' && !('face' in tBad), j([tF, tPo, tBad]));
    const scF = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js'), 'utf8').replace(/\r\n/g, '\n');
    const faceRule = s => { const a = s.indexOf('var FACE_PICS = ['), b = s.indexOf('function cleanFace(v) {'), e = s.indexOf('\n}\n', b); return a < 0 || b < 0 || e < 0 ? null : s.slice(a, s.indexOf('\n', a)) + '\n' + s.slice(b, e + 2); };
    check('F1c the face rule is one rule: systemcore.js (a character\'s face, on load and from the wire) carries net.js cleanFace and its picture list word for word',
        faceRule(scF) !== null && faceRule(scF) === faceRule(ps));
}
// Onboarding F3a: a character a player makes — the host's char-make / char-name / char-done (the [netcheck:charmake|charname|chardone] slices,
// run for real with the real systemcore), the player's answers and the GM's verdict (charmakeans, charreview), who hears of one in the making
// (syncChar, syncCharGone, sendCharTo, charReview, sliced), and the refusals of a character not yet in play
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const lineOf = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const cleanCharName = new Function(lineOf('function cleanCharName(') + '\nreturn cleanCharName;')();
    const sysK = Sx.cleanSystem({ v: 1, name: 'K', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', edit: 'gm' }] }, { F: Fx, gmView: true });
    const mkSrc = between('// [netcheck:charmake-start]', '// [netcheck:charmake-end]', 'charmake'), nmSrc = between('// [netcheck:charname-start]', '// [netcheck:charname-end]', 'charname'), dnSrc = between('// [netcheck:chardone-start]', '// [netcheck:chardone-end]', 'chardone');
    const table = o => {
        o = o || {};
        const camp = { id: 'k', chars: Object.assign({ c_g: { id: 'c_g', name: 'Gil', ownerId: 'u_b', npc: false, values: {} } }, JSON.parse(JSON.stringify(o.chars || {}))), items: {}, players: {} };
        if (!o.noSys) camp.system = sysK;
        if (o.rules) camp.newPlayers = o.rules;
        const out = { answer: [], sentTo: [], toasts: [], logs: [], saves: 0, gives: [], synced: [], allowed: [], flushed: 0, camp };
        const conn = { peer: o.from || 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: true, role: 'host', paused: !!o.paused, applyingRemote: false, roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } }, syncChar: id => out.synced.push([id, net.applyingRemote]) };
        const win = { wpSheets: { charChanged() {}, giveCharacter: (pid, id, g) => { out.gives.push([pid, id, j(g), camp.chars[id].making, camp.chars[id].review, net.applyingRemote]); return true; } }, wpHistFlush: () => { out.flushed++; } };
        out.net = net;
        out.run = (source, msg) => { new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'save', 'sendFailed', 'toast', 'logEvent', 'own', 'sheetsOnFor', 'sendCharTo', 'allow', 'cleanCharName', 'cleanRosterName', source)(
            msg, conn, net, () => Sx, win, () => !!o.peerPaused, () => camp, () => { out.saves++; }, () => { out.saves++; }, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), H.own, () => !o.sheetsOff, (pid, id) => out.sentTo.push([pid, id]),
            k => { out.allowed.push(k); return o.slow !== k; }, cleanCharName, H.cleanRosterName); return out; };
        return out;
    };
    const mine = t => Object.keys(t.camp.chars).filter(k => t.camp.chars[k].ownerId === 'u_a');
    // char-make
    const m1 = table().run(mkSrc, { type: 'char-make', rid: 'k1', name: ' Vex\u202e  the\u200b Bold ' }), id1 = m1.answer[0] && m1.answer[0].charId, c1 = m1.camp.chars[id1];
    check('F3a char-make (host, run for real): an admitted player starts one — in the making and made by them (theirs, no values, no picture), its name cleaned (bidi and zero-width out, spaces collapsed), saved, sent to them alone, the GM told (toast and log), answered with its id',
        /^c_[a-z0-9]+$/.test(id1 || '') && j(m1.answer) === j([{ ok: true, charId: id1, type: 'char-make-ans', rid: 'k1' }]) && c1 && c1.making === 1 && c1.made === 1 && c1.ownerId === 'u_a' && c1.name === 'Vex the Bold' && c1.npc === false && c1.portrait === '' && j(c1.values) === '{}'
        && j(m1.sentTo) === j([['u_a', id1]]) && m1.saves === 1 && j(m1.toasts) === j(['Pat is making a character (Vex the Bold).']) && j(m1.logs) === j([['char', 'Pat is making a character (Vex the Bold)']]) && j(m1.allowed) === j(['charmake']), j([m1.answer, c1, m1.sentTo, m1.toasts]));
    const mBlank = table().run(mkSrc, { type: 'char-make', rid: 'k1', name: '\u200b ' }), mNum = table().run(mkSrc, { type: 'char-make', rid: 'k1', name: 7 });
    m1.run(mkSrc, { type: 'char-make', rid: 'k2', name: 'Another' });
    const mAgainSlow = table({ slow: 'charmakeagain', chars: { c_q: { id: 'c_q', name: 'Q', ownerId: 'u_a', npc: false, making: 1, made: 1, values: {} } } }).run(mkSrc, { type: 'char-make', rid: 'k2', name: 'Again' });
    check('F3a char-make: a blank or non-text name takes their table name; asking again while making gives the same one (sent again, no second; a light rate bucket of its own, never a real make\'s)',
        mBlank.camp.chars[mBlank.answer[0].charId].name === 'Pat' && mNum.camp.chars[mNum.answer[0].charId].name === 'Pat' && mine(m1).length === 1 && m1.answer[1].charId === id1 && m1.answer[1].ok === true && m1.sentTo.length === 2 && j(m1.allowed) === j(['charmake', 'charmakeagain']) && m1.camp.chars[id1].name === 'Vex the Bold'
        && j(mAgainSlow.answer) === j([{ reason: 'slow', type: 'char-make-ans', rid: 'k2' }]) && mAgainSlow.sentTo.length === 0 && mine(mAgainSlow).length === 1, j([m1.answer, m1.allowed, mAgainSlow.answer]));
    const busyChars = {}; for (let i = 0; i < 12; i++) busyChars['c_m' + i] = { id: 'c_m' + i, name: 'M' + i, ownerId: 'u_x' + i, npc: false, making: 1, values: {} };
    const eleven = Object.assign({}, busyChars); delete eleven.c_m11;
    const refused = (t, why) => j(t.answer) === j([{ reason: why, type: 'char-make-ans', rid: 'k1' }]) && mine(t).length === (t.had || 0) && t.saves === 0 && t.toasts.length === 0 && t.sentTo.length === 0;
    const mk = o => table(o).run(mkSrc, { type: 'char-make', rid: 'k1', name: 'Vex' });
    const have = mk({ chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } } }); have.had = 1;
    const busy = mk({ chars: busyChars }), notBusy = mk({ chars: eleven });
    check('F3a char-make refused and answered why, nothing made: they play a character already (have); a dozen being made at the table (busy; eleven is fine); making not open (the GM\'s invite or off, sheets off, no system: closed); a paused table or player (paused); the rate (slow, after the other gates)',
        refused(have, 'have') && refused(busy, 'busy') && notBusy.answer[0].ok === true && ['invite', 'off'].every(r => refused(mk({ rules: { create: r } }), 'closed')) && refused(mk({ sheetsOff: true }), 'closed') && refused(mk({ noSys: true }), 'closed')
        && refused(mk({ paused: true }), 'paused') && refused(mk({ peerPaused: true }), 'paused') && refused(mk({ slow: 'charmake' }), 'slow') && have.allowed.length === 0 && busy.allowed.length === 0, j([have.answer, busy.answer]));
    const silent = t => t.answer.length === 0 && mine(t).length === 0 && t.saves === 0;
    check('F3a char-make: a malformed request id or a peer not admitted (or named like a prototype key) gets no answer and makes nothing',
        silent(table().run(mkSrc, { type: 'char-make', rid: 'k 1', name: 'Vex' })) && silent(table().run(mkSrc, { type: 'char-make', name: 'Vex' })) && silent(table({ from: 'pZ' }).run(mkSrc, { type: 'char-make', rid: 'k1', name: 'Vex' })) && silent(table({ from: '__proto__' }).run(mkSrc, { type: 'char-make', rid: 'k1', name: 'Vex' })));
    // char-name
    const mkC = { c_m: { id: 'c_m', name: 'Vex', ownerId: 'u_a', npc: false, making: 1, made: 1, values: {} }, c_f: { id: 'c_f', name: 'Fin', ownerId: 'u_a', npc: false, values: {} }, c_o: { id: 'c_o', name: 'Oth', ownerId: 'u_b', npc: false, making: 1, values: {} } };
    const nm = (o, msg) => table(Object.assign({ chars: mkC }, o)).run(nmSrc, Object.assign({ type: 'char-name', rid: 'n1', charId: 'c_m', name: ' Nova\u0007 ' }, msg || {}));
    const n1 = nm(), nRef = (why, o, msg) => { const t = nm(o, msg); return j(t.answer) === j([{ reason: why, type: 'char-name-ans', rid: 'n1' }]) && t.camp.chars.c_m.name === 'Vex' && t.camp.chars.c_f.name === 'Fin' && t.saves === 0 && t.sentTo.length === 0; };
    check('F3a char-name (host, run for real; owner: only while in the making): the owner renames their character in the making (cleaned), saved and sent to them alone; a finished one (notmaking), another\'s (owner), one gone or a prototype id (missing), a name that cleans to nothing (bad), paused, the rate: refused, unchanged',
        j(n1.answer) === j([{ ok: true, type: 'char-name-ans', rid: 'n1' }]) && n1.camp.chars.c_m.name === 'Nova' && j(n1.sentTo) === j([['u_a', 'c_m']]) && n1.saves === 1 && j(n1.allowed) === j(['charname'])
        && nRef('notmaking', {}, { charId: 'c_f' }) && nRef('owner', {}, { charId: 'c_o' }) && nRef('missing', {}, { charId: 'c_9' }) && nRef('missing', {}, { charId: '__proto__' }) && nRef('bad', {}, { name: '\u200b\u202e' }) && nRef('bad', {}, { name: 12 })
        && nRef('paused', { paused: true }) && nRef('slow', { slow: 'charname' }), j(n1));
    // char-done
    const dn = (o, msg) => table(Object.assign({ chars: mkC }, o)).run(dnSrc, Object.assign({ type: 'char-done', rid: 'd1', charId: 'c_m' }, msg || {}));
    const onlyMk = { c_m: mkC.c_m, c_o: mkC.c_o }, d1 = dn({ chars: onlyMk }), dGive = dn({ chars: Object.assign({}, onlyMk, { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } }) }), dClash = dn({ chars: Object.assign({}, onlyMk, { c_v: { id: 'c_v', name: ' vex', ownerId: 'u_b', npc: false, values: {} } }) });
    check('F3a char-done (host, run for real): one in the making goes live — out of the making, marked for the GM\'s review, given to its owner in play with their face copied (a GM give meanwhile keeps theirs in play: owner, 2026-09-27) — as a remote change (not a GM undo step, the history flushed first, the flag restored); the GM told (toast, log); answered ok',
        j(d1.answer) === j([{ ok: true, type: 'char-done-ans', rid: 'd1' }]) && d1.camp.chars.c_m.making === undefined && d1.camp.chars.c_m.review === 1 && d1.camp.chars.c_m.made === 1 && j(d1.gives) === j([['u_a', 'c_m', j({ play: true, pic: true }), undefined, 1, true]])
        && d1.net.applyingRemote === false && d1.flushed === 1 && j(d1.toasts) === j(['Pat finished making Vex \u2014 review it on its sheet.']) && j(d1.logs) === j([['char', 'Pat finished making Vex']]) && j(d1.allowed) === j(['chardone'])
        && dGive.gives.length === 1 && dGive.gives[0][2] === j({ play: false, pic: true }) && j(dGive.answer) === j([{ ok: true, kept: true, type: 'char-done-ans', rid: 'd1' }]) && /^Pat finished making Vex \(the name is also another character\u2019s\) \u2014 review it on its sheet\.$/.test(dClash.toasts[0] || ''), j([d1, dGive.gives, dClash.toasts]));
    const d2 = dn({ chars: Object.assign({}, mkC, { c_f: { id: 'c_f', name: 'Fin', ownerId: 'u_a', npc: false, unlocked: 1, values: {} } }) }, { charId: 'c_f' });
    check('F3a char-done on an unlocked character: it locks again, marked for review, saved and synced (as a remote change), no give; the GM told',
        j(d2.answer) === j([{ ok: true, type: 'char-done-ans', rid: 'd1' }]) && d2.camp.chars.c_f.unlocked === undefined && d2.camp.chars.c_f.review === 1 && d2.saves === 1 && j(d2.synced) === j([['c_f', true]]) && d2.gives.length === 0 && d2.toasts[0] === 'Pat finished the sheet of Fin \u2014 review it on its sheet.', j(d2));
    const dRef = (why, o, msg) => { const t = dn(o, msg); return j(t.answer) === j([{ reason: why, type: 'char-done-ans', rid: 'd1' }]) && t.gives.length === 0 && t.synced.length === 0 && t.saves === 0 && t.toasts.length === 0 && t.camp.chars.c_m.making === 1 && t.camp.chars.c_m.review === undefined; };
    check('F3a char-done refused and answered why, nothing changed: a finished, locked character (notmaking), another\'s or an NPC (owner), one gone (missing), paused, the rate (slow); a malformed request id is dropped',
        dRef('notmaking', {}, { charId: 'c_f' }) && dRef('owner', {}, { charId: 'c_o' }) && dRef('owner', { chars: Object.assign({}, mkC, { c_n: { id: 'c_n', name: 'N', ownerId: 'u_a', npc: true, making: 1, values: {} } }) }, { charId: 'c_n' }) && dRef('missing', {}, { charId: 'c_9' }) && dRef('missing', {}, { charId: 'constructor' })
        && dRef('paused', { paused: true }) && dRef('paused', { peerPaused: true }) && dRef('slow', { slow: 'chardone' }) && dn({}, { rid: 'd 1' }).answer.length === 0);
    // the player's side: the answers, the GM's verdict
    const mkWhy = lineOf('var MK_WHY = {') + '\n' + lineOf('var TOK_WHY = {') + '\n' + lineOf('var LIGHT_WHY = {'), ansSrc = between('// [netcheck:charmakeans-start]', '// [netcheck:charmakeans-end]', 'charmakeans');
    const mkAns = (msg, kind) => { const got = [], pend = { k1: { kind, done: a => got.push(a), timer: 1 } }; let cleared = 0; new Function('msg', '_mkPending', 'clearTimeout', mkWhy + '\n' + ansSrc)(msg, pend, () => { cleared++; }); return { got, left: Object.keys(pend).length, cleared }; };
    const aOk = mkAns({ rid: 'k1', ok: true, charId: 'c_ab12' }), aBadId = mkAns({ rid: 'k1', ok: true, charId: '<img>' }), aHave = mkAns({ rid: 'k1', reason: 'have' }), aProto = ['__proto__', 'constructor', 'toString', 'nope', 5].map(r => mkAns({ rid: 'k1', reason: r }).got[0].error), aNo = mkAns({ rid: 'k9', ok: true }), aProtoRid = mkAns({ rid: '__proto__', ok: true }), aKept = mkAns({ rid: 'k1', ok: true, kept: true }), aKeptStr = mkAns({ rid: 'k1', ok: true, kept: 'yes' });
    check('F3a char-make / char-name / char-done answers (player, run for real): ok with a well-formed id only (else none), a reason of ours in words, a prototype-named or unknown reason a plain refusal; an answer to no question of ours does nothing',
        j(aOk.got) === j([{ ok: true, charId: 'c_ab12' }]) && aOk.left === 0 && aOk.cleared === 1 && j(aBadId.got) === j([{ ok: true, charId: null }]) && aHave.got[0].error === 'You already play a character here.' && aProto.every(e => e === 'The GM could not do that.')
        && aNo.got.length === 0 && aNo.left === 1 && aProtoRid.got.length === 0 && j(aKept.got) === j([{ ok: true, charId: null, kept: true }]) && j(aKeptStr.got) === j([{ ok: true, charId: null }]) && /\} else if \(\(msg\.type === 'char-make-ans' \|\| msg\.type === 'char-name-ans' \|\| msg\.type === 'char-done-ans' \|\| msg\.type === 'char-token-ans' \|\| msg\.type === 'tok-pic-ans' \|\| msg\.type === 'tok-light-ans'\) && net\.role === 'client'\) \{[^\n]*\n\s*\/\/ \[netcheck:charmakeans-start\]/.test(src), j([aOk, aBadId, aHave, aProto]));
    {   // the token creator's review: tok-pic's answers read in a token's words (the table chosen by what we asked, never by the host)
        const tw = r => mkAns({ rid: 'k1', reason: r }, 'tok-pic').got[0].error, cw = r => mkAns({ rid: 'k1', reason: r }).got[0].error, ckw = r => mkAns({ rid: 'k1', reason: r }, 'char-make').got[0].error;
        check('token creator review: tok-pic answers (player, run for real) read as a token\'s — gone (it may have moved to another map), not yours, locked, a picture that could not be used, the GM cannot take pictures, could not save it, a moment between pictures — the same reasons to char-make still read as a character\'s; a prototype-named reason a plain refusal either way; ok is ok',
            tw('missing') === 'That token is no longer here (it may have moved to another map).' && tw('tokowner') === 'That token is not yours.' && tw('locked') === 'The GM has locked that token.' && tw('bad') === 'That picture could not be used.' && tw('off') === 'The GM cannot take pictures here.' && tw('failed') === 'The GM could not save that picture.' && tw('slow') === 'A moment between pictures, please.' && tw('paused') === 'The table is paused.'
            && cw('missing') === 'That character is gone.' && cw('bad') === 'That name cannot be used.' && ckw('off') === 'Character sheets are off here.' && cw('tokowner') === 'The GM could not do that.' && tw('have') === 'The GM could not do that.' && tw('__proto__') === 'The GM could not do that.' && tw('constructor') === 'The GM could not do that.'
            && j(mkAns({ rid: 'k1', ok: true }, 'tok-pic').got) === j([{ ok: true, charId: null }]), j([tw('missing'), cw('missing')]));
    }
    const rvSrc = between('// [netcheck:charreview-start]', '// [netcheck:charreview-end]', 'charreview');
    const review = (msg, o) => { o = o || {}; const t = []; new Function('msg', 'conn', 'net', 'toast', 'cleanCharName', rvSrc)(msg, { peer: o.peer || 'h' }, { foreign: o.foreign !== false, stream: !!o.stream, syncedPeer: 'h' }, x => t.push(x), cleanCharName); return t; };
    check('F3a char-review (player, run for real): the GM\'s verdict from their own GM only — sent back (to fill in, Done again), removed, locked — its name and note cleaned (control and bidi characters out, 300 at most); an unknown or prototype-named outcome, another peer, a stream or no table: nothing',
        j(review({ outcome: 'back', name: 'Vex\u202e', note: ' Fix\u0000 your   ST ' })) === j(['Your GM sent back Vex to fill in (press Done when it is finished): Fix your ST']) && j(review({ outcome: 'removed', name: 'Vex' })) === j(['Your GM removed Vex.']) && j(review({ outcome: 'locked', name: 5 })) === j(['Your GM locked your character.'])
        && review({ outcome: 'back', name: 'V', note: 'x'.repeat(900) })[0].length === 'Your GM sent back V to fill in (press Done when it is finished): '.length + 300
        && ['__proto__', 'toString', 'nuke', 1].every(oc => review({ outcome: oc, name: 'V' }).length === 0) && review({ outcome: 'back', name: 'V' }, { peer: 'x' }).length === 0 && review({ outcome: 'back', name: 'V' }, { stream: true }).length === 0 && review({ outcome: 'back', name: 'V' }, { foreign: false }).length === 0);
    // who hears of it (host)
    const scA = src.indexOf('net.syncChar = function(id)'), scB = src.indexOf('net.syncCharDelta = function'), sgA = src.indexOf('net.syncCharGone = function'), sgB = src.indexOf('// A player\'s edit of their own sheet');
    const hostSend = () => {
        const got = [], camp = { id: 'k', chars: { c_m: { id: 'c_m', name: 'Vex', ownerId: 'u_a', npc: false, making: 1, made: 1, values: {} }, c_f: { id: 'c_f', name: 'Fin', ownerId: 'u_a', npc: false, review: 1, made: 1, values: {} } } };
        const conn = p => ({ peer: p, open: p !== 'pC', send: m => { packCheck(m); got.push([p, JSON.parse(JSON.stringify(m))]); } });
        const net = { active: true, role: 'host', roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' }, pC: { id: 'u_a' } }, conns: ['pA', 'pA2', 'pB', 'pC', 'pZ'].map(conn) };
        new Function('net', 'getActiveCampaign', 'peerProfileId', 'charViewFor', 'sendFailed', 'cleanCharName', src.slice(scA, scB) + '\n' + src.slice(sgA, sgB))(net, () => camp, c => net.roster[c.peer] && net.roster[c.peer].id, (id, pid) => Sx.charFor(camp.chars[id], sysK, pid), e => { throw e; }, cleanCharName);
        return { got, net, camp };
    };
    const hs = hostSend(), who = () => hs.got.splice(0).map(g => g[0] + ':' + g[1].type + (g[1].char ? (g[1].char.partial ? '/partial' : '/own') + (g[1].char.making ? '/making' : '') : ''));
    hs.net.syncChar('c_m'); const wMk = who(); hs.net.syncChar('c_f'); const wFin = who(); hs.net.syncCharGone('c_m', 'u_a'); const wGoneMk = who(); hs.net.syncCharGone('c_f'); const wGone = who(); hs.net.sendCharTo('u_a', 'c_m'); const wTo = who();
    hs.net.charReview('u_a', 'c_f', 'Fin\u202e', 'back', ' a\u0000b '); const rv = hs.got.splice(0); hs.net.charReview('u_a', 'c_f', 'Fin', 'nuke', 'x'); hs.net.charReview('u_a', 'c_f', 'Fin', 'removed', ''); const rv2 = hs.got.splice(0); hs.net.charReview('u_a', 'c_f', 'Fin', 'locked', 'y'.repeat(400)); const rv3 = hs.got.splice(0);
    check('F3a who hears of a character in the making (host, sliced): syncChar sends it to its owner\'s open connections alone (not even a "gone" to anyone else), a finished one as ever (teammates a partial copy, never review or made); syncCharGone to one player or all; sendCharTo its owner alone; the GM\'s verdict to its owner alone — a known outcome only, the name and note cleaned, no note key when empty, 300 at most',
        scA > 0 && scB > scA && sgA > 0 && sgB > sgA && j(wMk) === j(['pA:char/own/making', 'pA2:char/own/making']) && j(wFin) === j(['pA:char/own', 'pA2:char/own', 'pB:char/partial']) && j(wGoneMk) === j(['pA:charGone', 'pA2:charGone']) && j(wGone) === j(['pA:charGone', 'pA2:charGone', 'pB:charGone'])
        && j(wTo) === j(['pA:char', 'pA2:char'].map(x => x + '/own/making')) && j(rv) === j([['pA', { type: 'char-review', charId: 'c_f', name: 'Fin', outcome: 'back', note: 'a b' }], ['pA2', { type: 'char-review', charId: 'c_f', name: 'Fin', outcome: 'back', note: 'a b' }]])
        && j(rv2.map(g => [g[0], Object.keys(g[1]).sort()])) === j([['pA', ['charId', 'name', 'outcome', 'type']], ['pA2', ['charId', 'name', 'outcome', 'type']]]) && rv3.length === 2 && rv3[0][1].note.length === 300, j([wMk, wFin, wGoneMk, wGone, wTo, rv, rv2]));
    // F3b: Just a token (the [netcheck:chartoken] slice, run for real): sheets on — an empty character, made, unlocked, in play at once; off — a plain token
    const jtSrc = between('// [netcheck:chartoken-start]', '// [netcheck:chartoken-end]', 'chartoken');
    const jt = o => {
        o = o || {};
        const camp = { id: 'k', chars: Object.assign({ c_g: { id: 'c_g', name: 'Gil', ownerId: 'u_b', npc: false, values: {} } }, JSON.parse(JSON.stringify(o.chars || {}))), players: { u_a: { name: 'Pat' } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: o.wait ? [Object.assign({ id: 'wq1', type: 'circle', waiting: 1, ownerId: 'u_a', name: 'Pat', x: 100, y: 200, w: 60, h: 52 }, o.waitFace ? { face: o.waitFace } : {})] : [] }, m2: { id: 'm2', type: 'map', whiteboard: o.wait2 ? [{ id: 'wq2', type: 'circle', waiting: 1, ownerId: 'u_a', x: 5, y: 5 }] : [] } } };
        if (!o.noSys) camp.system = sysK;
        if (o.rules) camp.newPlayers = o.rules;
        if (o.tok) camp.items.m2.whiteboard.push({ id: 'tt', isChar: true, charName: 'Bo', ownerId: 'u_a' });
        if (o.doc) camp.items.d1 = { id: 'd1', type: 'page', whiteboard: [] };
        const out = { answer: [], toasts: [], logs: [], gives: [], faces: [], changed: [], allowed: [], seated: 0, camp };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netJ = { active: true, role: 'host', paused: !!o.paused, applyingRemote: false, roster: { pA: { id: 'u_a', name: 'Pat', location: o.loc === undefined ? 'm1' : o.loc, color: '#123456', face: o.face === undefined ? '\u{1F409}' : o.face, avatar: o.avatar || '' } } };
        const win = { wpSheets: { charChanged() {}, giveCharacter: (pid, id, g) => { out.gives.push([pid, id, j(g), camp.chars[id].unlocked, camp.chars[id].review, camp.chars[id].made, netJ.applyingRemote]); return true; }, applyTokenFace: (mid, wid, plan) => { out.faces.push([mid, wid, plan.kind]); } }, wpHistFlush() {}, wpSeatHex: () => { out.seated++; } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'toast', 'logEvent', 'own', 'sheetsOnFor', 'allow', 'cleanCharName', 'cleanRosterName', 'charFacePlan', 'spawnSpot', 'removeWaiting', 'waitingChanged', jtSrc)(
            Object.assign({ type: 'char-token', rid: 't1', name: ' Vex\u202e ' }, o.msg || {}), conn, netJ, () => Sx, win, () => false, () => camp, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), H.own, () => !o.sheetsOff,
            k => { out.allowed.push(k); return o.slow !== k; }, cleanCharName, H.cleanRosterName, H.charFacePlan, () => ({ x: 900, y: 800 }), (c, pid) => { const gone = []; Object.keys(c.items).forEach(id => { const m = c.items[id]; const b = m.whiteboard.length; m.whiteboard = m.whiteboard.filter(w => !(w.waiting && w.ownerId === pid)); if (m.whiteboard.length !== b) gone.push(id); }); return gone; }, (c, maps) => out.changed.push(maps));
        return out;
    };
    const j1 = jt(), id1J = j1.answer[0] && j1.answer[0].charId, c1J = j1.camp.chars[id1J];
    check('F3b char-token with sheets on (host, run for real): an empty character of theirs — made, unlocked, marked for the GM\'s review, its name cleaned — given in play at once with their face copied, as a remote change; the GM told; answered with its id',
        c1J && c1J.name === 'Vex' && c1J.ownerId === 'u_a' && c1J.made === 1 && c1J.unlocked === 1 && c1J.review === 1 && c1J.making === undefined && j(c1J.values) === '{}' && j(j1.gives) === j([['u_a', id1J, j({ play: true, pic: true }), 1, 1, 1, true]])
        && j(j1.answer) === j([{ ok: true, charId: id1J, type: 'char-token-ans', rid: 't1' }]) && j1.toasts[0] === 'Pat took just a token (Vex) \u2014 review it on its sheet.' && j(j1.logs) === j([['char', 'Pat took just a token (Vex)']]) && j(j1.allowed) === j(['chartoken']), j(j1));
    const jRef = (o, why) => { const r = jt(o); return j(r.answer) === j([{ reason: why, type: 'char-token-ans', rid: 't1' }]) && r.gives.length === 0 && r.changed.length === 0 && Object.keys(r.camp.chars).length === Object.keys(JSON.parse(JSON.stringify(o.chars || {}))).length + 1; };
    check('F3b char-token refused (sheets on): only where making is live (invite, off: closed); while they make one (making); while they play one (have); paused; the rate (slow)',
        jRef({ rules: { create: 'invite' } }, 'closed') && jRef({ rules: { create: 'off' } }, 'closed') && jRef({ chars: { c_m: { id: 'c_m', name: 'M', ownerId: 'u_a', making: 1, values: {} } } }, 'making') && jRef({ chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } } }, 'have')
        && jRef({ paused: true }, 'paused') && jRef({ slow: 'chartoken' }, 'slow') && jt({ msg: { rid: 't 1' } }).answer.length === 0);
    const j2 = jt({ sheetsOff: true, wait: true, wait2: true }), t2 = j2.camp.items.m1.whiteboard[0], j3 = jt({ noSys: true, rules: { token: 'off' } }), t3 = j3.camp.items.m1.whiteboard[0], j4 = jt({ sheetsOff: true, wait: true, waitFace: 'photo', face: 'photo', avatar: 'data:image/png;base64,iVBORw0KGgo=' }), j5 = jt({ sheetsOff: true, wait: true, wait2: true, loc: 'm2' });
    check('F3b char-token without sheets (or a system): their waiting token on the map they stand on becomes a plain token of theirs where it stands (same id; their name, colour and face), bound by its name (marked as their own choice); any other waiting token of theirs goes; with no waiting token one is made at the landing spot; a photo face is saved onto it after; nothing of a character',
        t2 && t2.id === 'wq1' && t2.waiting === undefined && t2.isChar === true && t2.charName === 'Vex' && t2.ownerId === 'u_a' && t2.face === '\u{1F409}' && t2.color === '#123456' && t2.x === 100 && j2.camp.players.u_a.charName === 'Vex' && j2.camp.players.u_a.charMade === 'Vex' && j(j2.allowed) === j(['chartoken']) && j2.camp.items.m2.whiteboard.length === 0
        && j(j2.changed) === j([['m1', 'm2']]) && j(j2.answer) === j([{ ok: true, type: 'char-token-ans', rid: 't1' }]) && Object.keys(j2.camp.chars).length === 1 && j2.gives.length === 0 && j2.toasts[0] === 'Pat took just a token (Vex).'
        && t3 && /^wb[a-z0-9]+$/.test(t3.id) && t3.x === 900 && t3.y === 800 && t3.isChar && j3.seated === 1 && j3.gives.length === 0
        && j4.camp.items.m1.whiteboard[0].face === undefined && j(j4.faces) === j([['m1', 'wq1', 'picture']])
        && j5.camp.items.m2.whiteboard.length === 1 && j5.camp.items.m2.whiteboard[0].id === 'wq2' && j5.camp.items.m2.whiteboard[0].isChar === true && j5.camp.items.m1.whiteboard.length === 0 && j(j5.changed) === j([['m2', 'm1']]), j([t2, j2.changed, t3, j4.faces, j5.changed]));
    check('F3b char-token refused without sheets: a token of their own or a character of theirs already (have), no map to stand on (nomap), the rate (slow); where making is off it is still offered',
        jRef({ sheetsOff: true, tok: true }, 'have') && jRef({ sheetsOff: true, wait: true, chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } } }, 'have') && jRef({ sheetsOff: true, loc: null }, 'nomap') && jRef({ sheetsOff: true, doc: true, loc: 'd1' }, 'nomap') && jRef({ sheetsOff: true, slow: 'chartoken' }, 'slow') && jt({ sheetsOff: true, rules: { create: 'off' } }).answer[0].ok === true);
    const dInv = dn({ chars: Object.assign({}, { c_m: Object.assign({}, mkC.c_m, { invited: 1 }), c_o: mkC.c_o }, { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } }) });
    check('F3b char-done on one the GM asked for: it goes into play even while they play another (a replacement), and the mark goes',
        dInv.gives.length === 1 && dInv.gives[0][2] === j({ play: true, pic: true }) && dInv.camp.chars.c_m.invited === undefined && j(dInv.answer) === j([{ ok: true, type: 'char-done-ans', rid: 'd1' }]), j(dInv));
    const invH = hostSend(); invH.net.charReview('u_a', 'c_m', 'Vex', 'invited', ''); const invSent = invH.got.splice(0);
    check('F3b the GM\'s invite reaches its player (host: invited is a known outcome) and reads "asked you to make a character … open it from your card"',
        j(invSent.map(g => [g[0], g[1].outcome])) === j([['pA', 'invited'], ['pA2', 'invited']]) && j(review({ outcome: 'invited', name: 'Vex' })) === j(['Your GM asked you to make a character: Vex \u2014 open it from your card.']));
    const fgS = between('// [netcheck:forget-start]', '// [netcheck:forget-end]', 'forget');
    const fg = answer => { const camp = { id: 'c1', players: { u_a: { name: 'Ana' } }, chars: { c_m: { id: 'c_m', ownerId: 'u_a', making: 1 }, c_k: { id: 'c_k', ownerId: 'u_a' }, c_o: { id: 'c_o', ownerId: 'u_b', making: 1 } } }, asked = [], gone = [];
        const netF = { role: 'host', roster: {}, forgotten: Object.create(null), syncCharGone: (id, only) => gone.push([id, only]) };
        new Function('net', 'own', 'showConfirm', 'getActiveCampaign', 'save', 'toast', 'renderPlayersPanel', 'approvedIds', 'SC', 'removeWaiting', 'waitingChanged', fgS + '\nreturn forgetPlayer;')(netF, H.own, (m, cb) => { asked.push(m); cb(answer); }, () => camp, () => {}, () => {}, () => {}, {}, () => ({ playableChars: () => [] }), () => [], () => {})(camp, 'u_a');
        return { asked, gone, chars: Object.keys(camp.chars) }; };
    const fgY = fg(true), fgN = fg(false);
    check('F3b Forget: the confirm says the character they are still making goes too; on yes it goes (from them alone), their finished ones and another player\'s stay; Cancel keeps it',
        /The character they are still making goes too\./.test(fgY.asked[0]) && j(fgY.gone) === j([['c_m', 'u_a']]) && j(fgY.chars) === j(['c_k', 'c_o']) && j(fgN.chars) === j(['c_m', 'c_k', 'c_o']) && fgN.gone.length === 0, j([fgY, fgN]));
    // the rules for making (camp.newPlayers create / fromFile): kept by the GM's waiting-token box, carried on the wire only where they differ, taken by a player
    const snpSrc = (() => { const i = src.indexOf('function setNewPlayers('); return src.slice(i, src.indexOf('\n}\n', i) + 2); })();
    const rnpSrc = (() => { const i = src.indexOf('function refreshNewPlayersBox('); return src.slice(i, src.indexOf('\n}\n', i) + 2); })().replace(/\r\n/g, '\n');
    const tickOf = (np, o) => { o = o || {}; const els = { netWaitingSelect: { value: '' }, netWaitingSight: { checked: false }, netMakeSelect: { value: '' }, netMakeFile: { checked: null, disabled: null } }; const camp = { id: 'k' }; if (np) camp.newPlayers = np;
        new Function('net', 'ui', 'SC', 'getActiveCampaign', rnpSrc + '\nreturn refreshNewPlayersBox;')({ active: !!o.client, role: o.client ? 'client' : 'host' }, id => els[id] || null, () => Sx, () => camp)(); return els.netMakeFile; };
    check('Onboarding F4 the "may start it from a file" tick shows the table\'s rule (on unless it is off), is disabled where making is off, and is read-only at someone else\'s table',
        tickOf(null).checked === true && tickOf(null).disabled === false && tickOf({ fromFile: false }).checked === false && tickOf({ create: 'off' }).disabled === true && tickOf({ create: 'invite' }).disabled === false && tickOf(null, { client: true }).disabled === true);
    const hMF = src.slice(src.indexOf("var _makeFile = ui('netMakeFile');"), src.indexOf('\nvar _makeSel')), gotMF = []; let lMF = null;
    new Function('ui', 'setNewPlayers', 'toast', hMF)(id => id === 'netMakeFile' ? { addEventListener: (ev, f) => { if (ev === 'change') lMF = f; } } : null, p => gotMF.push(p), () => {});
    if (lMF) { lMF.call({ checked: false }); lMF.call({ checked: true }); }
    check('Onboarding F4 the tick saves what it shows: unticked, players may not start from a file; ticked, they may', j(gotMF) === j([{ fromFile: false }, { fromFile: true }]), j(gotMF));
    const setNP = (start, patch) => { const camp = { id: 'k' }; if (start) camp.newPlayers = start; new Function('net', 'getActiveCampaign', 'SC', 'save', 'refreshNewPlayersBox', snpSrc + '\nreturn setNewPlayers;')({ active: true, role: 'host' }, () => camp, () => Sx, () => {}, () => {})(patch); return camp.newPlayers; };
    const nsS = between('// [netcheck:newplayerssync-start]', '// [netcheck:newplayerssync-end]', 'newplayerssync'), npS = between('// [netcheck:newplayers-start]', '// [netcheck:newplayers-end]', 'newplayers');
    const syncNP = np => { const camp = { id: 'k', newPlayers: np }, sent = []; const netS = { active: true, role: 'host', roster: { pA: { id: 'u_a' } }, conns: [{ peer: 'pA', open: true, send: m => sent.push(m) }], tidyWaiting: () => {} }; new Function('net', 'SC', 'getActiveCampaign', 'own', 'sendFailed', nsS)(netS, () => Sx, () => camp, H.own, e => { throw e; }); netS.syncNewPlayers(); return sent; };
    const takeNP = msg => { const camp = { id: 'k' }; new Function('msg', 'conn', 'net', 'state', 'campOf', 'SC', 'window', 'render', npS)(Object.assign({ type: 'newPlayers', campId: 'k' }, msg), { peer: 'h' }, { foreign: true, syncedPeer: 'h', stream: false }, { appState: { activeCampaignId: 'k' } }, id => (id === 'k' ? camp : null), () => Sx, {}, () => {}); return camp.newPlayers; };
    check('F3a the rules for making a character: the GM\'s waiting-token box keeps them when it changes its own (sight, token); the wire carries create and fromFile only where they differ (the default message unchanged); a player takes them cleaned (junk is the default)',
        j(setNP({ create: 'off', fromFile: false }, { sight: true })) === j({ sight: true, create: 'off', fromFile: false }) && j(setNP({ create: 'invite', sight: true }, { sight: false })) === j({ create: 'invite' }) && setNP(null, { sight: false }) === undefined
        && j(syncNP({ create: 'invite', fromFile: false })) === j([{ type: 'newPlayers', campId: 'k', token: 'on', sight: false, create: 'invite', fromFile: false }]) && j(syncNP(undefined)) === j([{ type: 'newPlayers', campId: 'k', token: 'on', sight: false }])
        && j(takeNP({ token: 'on', sight: false, create: 'off', fromFile: false })) === j({ create: 'off', fromFile: false }) && takeNP({ token: 'on', sight: false, create: 'live!', fromFile: 0 }) === undefined, j([setNP({ create: 'off', fromFile: false }, { sight: true }), syncNP({ create: 'invite', fromFile: false })]));
    // the refusals of a character not yet in play (a sheet upload of one fills it: Onboarding F4, its own check)
    const apS = between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply'), rqS = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), thI = src.indexOf("} else if (msg.type === 'throw-req' && net.role === 'host') {"), thS = src.slice(thI, src.indexOf('\n    } else if', thI + 10));
    check('F3a a character in the making is not at the table yet: an apply (making), a roll from it (char) and a throw from it are refused on the host; the deny word survives the client\'s cleaner',
        /if \(chA\.making === 1\) \{ denyA\('making'\); return; \}/.test(apS)
        && /srcQ\.ownerId !== pidQ \|\| srcQ\.making === 1 \|\| !SQ \|\| !campQ\.system\) \{ denyQ\('char'\); return; \}/.test(rqS) && thI > 0 && /chT\.ownerId !== profT\.id \|\| chT\.making === 1\) return;/.test(thS) && Sx.cleanDenyReason('making') === 'making');
    check('F3a the player keeps their own copy\'s marks (the snapshot, the chars list and a char message re-clean with the owner\'s state), and a delta\'s probe carries the making mark (charFor refuses it to anyone but the owner)',
        (src.match(/cleanChar\([^)]*, \{ state: 'owner' \}\)/g) || []).length === 3 && /probe = \{ id: id, name: src\.name, ownerId: src\.ownerId, npc: src\.npc, making: src\.making, values: \{\} \};/.test(src)
        && Sx.charFor({ id: 'c_m', name: 'V', ownerId: 'u_a', npc: false, making: 1, values: { f_st: 0 } }, Sx.cleanSystem(sysK, { F: Fx, gmView: false }), 'u_b', { probe: true }) === null);
})());
// Grid-shaped incoming tokens (owner, 2026-09-27): the waiting token (the [netcheck:waiting] slice) and Just a token (the [netcheck:chartoken]
// slice) come in in the cell shape of the map they land on; the free spot seats in a square grid's cells
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js'));
    const wS = between('// [netcheck:waiting-start]', '// [netcheck:waiting-end]', 'waiting');
    const campG = () => ({ id: 'k', players: {}, chars: {}, items: { mh: { id: 'mh', type: 'map', meta: { title: 'Hex', gridType: 'hex' }, whiteboard: [] }, ms: { id: 'ms', type: 'map', meta: { title: 'Sq', gridType: 'square' }, whiteboard: [] }, mo: { id: 'mo', type: 'map', meta: { title: 'Off' }, whiteboard: [] } } });
    const mkG = () => {
        const camp = campG(), spots = [], seats = [];
        const netG = { active: true, role: 'host', roster: { pA: { id: 'u_a', name: 'Ana', color: '#112233', location: 'mh' } }, applyingRemote: false, broadcastItemFiltered() {}, isConnected: () => true };
        const api = new Function('net', 'SC', 'own', 'cleanRosterName', 'cleanFace', 'spawnSpot', 'toast', 'logEvent', 'save', 'getActiveCampaign', 'render', 'window', 'setTimeout', 'clearTimeout', wS + '\nreturn { placeWaiting };')(
            netG, () => Sx, H.own, H.cleanRosterName, H.cleanFace, (map, lr, near, w, h) => { spots.push([map.id, w, h]); return { x: 100, y: 200 }; }, () => {}, () => {}, () => {}, () => camp, () => {}, { wpSeatCell: (it, m) => { seats.push([m.id, it.type]); return false; } }, () => 0, () => {});
        return { api, camp, spots, seats, wb: id => camp.items[id].whiteboard };
    };
    const G = mkG(); G.api.placeWaiting(G.camp, 'u_a', G.camp.items.mh, null); const gh = JSON.parse(j(G.wb('mh')[0]));
    G.api.placeWaiting(G.camp, 'u_a', G.camp.items.ms, null); const gs = JSON.parse(j(G.wb('ms')[0])); G.api.placeWaiting(G.camp, 'u_a', G.camp.items.mo, null); const go = JSON.parse(j(G.wb('mo')[0]));
    G.camp.items.mo.meta.gridType = 'hex'; const again = G.api.placeWaiting(G.camp, 'u_a', G.camp.items.mo, null), gAgain = G.wb('mo')[0];
    check('grid shape: a waiting token comes in in the cell shape of the map it lands on — a hexagon 60x52 on hex, moved to a square map a square 50x50 (the free spot asked for that size), to a map with no grid a circle 60x52; on its own map a grid change reshapes it in place (the map reported); each is seated in its cell',
        gh.type === 'hexagon' && gh.w === 60 && gh.h === 52 && gs.type === 'rect' && gs.w === 50 && gs.h === 50 && go.type === 'circle' && go.w === 60 && go.h === 52 && j(G.spots) === j([['mh', 60, 52], ['ms', 50, 50], ['mo', 60, 52]])
        && gAgain.type === 'hexagon' && gAgain.w === 60 && j(again) === j(['mo']) && G.seats.length === 4 && j(G.seats[3]) === j(['mo', 'hexagon']), j([gh, gs, go, gAgain, G.spots, G.seats, again]));
    const jtS = between('// [netcheck:chartoken-start]', '// [netcheck:chartoken-end]', 'chartoken');
    const cleanCharName = new Function((() => { const i = src.indexOf('function cleanCharName('); return src.slice(i, src.indexOf('\n', i)); })() + '\nreturn cleanCharName;')();
    const jtG = (mapId, wait) => {
        const camp = campG(), spots = [], seats = [];
        if (wait) camp.items[mapId].whiteboard.push(Object.assign({ id: 'wq', waiting: 1, ownerId: 'u_a', x: 100, y: 200 }, wait));
        const netJ = { active: true, role: 'host', paused: false, applyingRemote: false, roster: { pA: { id: 'u_a', name: 'Ana', location: mapId, color: '#123456', face: '\u{1F409}' } } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'toast', 'logEvent', 'own', 'sheetsOnFor', 'allow', 'cleanCharName', 'cleanRosterName', 'charFacePlan', 'spawnSpot', 'removeWaiting', 'waitingChanged', jtS)(
            { type: 'char-token', rid: 't1', name: 'Vex' }, { peer: 'pA', send() {} }, netJ, () => Sx, { wpSeatCell: (it, m) => { seats.push([m.id, it.type]); return false; }, wpSheets: {} }, () => false, () => camp, e => { throw e; }, () => {}, () => {}, H.own, () => false,
            () => true, cleanCharName, H.cleanRosterName, H.charFacePlan, (map, lr, near, w, h) => { spots.push([map.id, w, h]); return { x: 900, y: 800 }; }, () => [], () => {});
        return { tok: camp.items[mapId].whiteboard.find(w => w.ownerId === 'u_a'), spots, seats };
    };
    const jH = jtG('mh'), jS = jtG('ms'), jO = jtG('mo'), jW = jtG('mh', { type: 'hexagon', w: 60, h: 52 }), jOld = jtG('ms', { type: 'circle', w: 60, h: 52, x: 100, y: 200 });
    check('grid shape: Just a token without sheets comes in in the cell shape of the map they stand on — a new one a hexagon 60x52 on hex, a square 50x50 on a square grid (the free spot asked for that size), a circle with no grid; their hexagon waiting token stays a hexagon; a circle waiting token left from before becomes a square on a square map (its centre kept, seated)',
        jH.tok.type === 'hexagon' && jH.tok.w === 60 && jS.tok.type === 'rect' && jS.tok.w === 50 && jS.tok.h === 50 && j(jS.spots) === j([['ms', 50, 50]]) && jO.tok.type === 'circle' && jO.tok.w === 60 && j(jO.spots) === j([['mo', 60, 52]])
        && jW.tok.type === 'hexagon' && jW.tok.id === 'wq' && jW.seats.length === 0 && jOld.tok.type === 'rect' && jOld.tok.w === 50 && jOld.tok.x === 105 && jOld.tok.y === 201 && j(jOld.seats) === j([['ms', 'rect']]), j([jH.tok, jS.tok, jO.tok, jW.tok, jOld.tok, jOld.seats]));
    const fsS = fnSrc('function freeSpotNear(', '\nfunction ', 'freeSpotNear');
    const FSG = new Function('window', fsS + '\nreturn freeSpotNear;')({});
    const sqMap = { id: 'q', meta: { gridType: 'square' }, whiteboard: [{ id: 'o', isChar: true, x: 100, y: 200, w: 50, h: 50 }] };
    const blk = []; for (let i = 0; i < 5; i++) for (let k = 2; k < 7; k++) blk.push({ id: 'b' + i + '_' + k, isChar: true, x: i * 50, y: k * 50, w: 50, h: 50 });
    const f4 = FSG({ id: 'q4', meta: { gridType: 'square' }, whiteboard: blk }, 120, 230, 50, 50, null, null), f5 = FSG({ id: 'q5', meta: { gridType: 'square' }, whiteboard: [] }, 310, 290, 100, 100, null, null);
    const f1 = FSG(sqMap, 120, 230, 50, 50, null, null), f2 = FSG({ id: 'q2', meta: { gridType: 'square' }, whiteboard: [] }, 137, 241, 50, 50, null, null), f3 = FSG({ id: 'q3', meta: {}, whiteboard: [] }, 137, 241, 50, 50, null, null);
    check('grid shape: the free spot on a square grid is a whole cell (a 50x50 lands on the lattice) and a neighbouring cell (no cell skipped: past a taken 5x5 block the nearest free ring) is found when that one is taken; a sized-up token\'s corner lands on the lattice; with no grid nothing is rounded',
        j(f2) === j({ x: 100, y: 200 }) && f1.x % 50 === 0 && f1.y % 50 === 0 && Math.max(Math.abs(f1.x - 100), Math.abs(f1.y - 200)) === 50 && j(f3) === j({ x: 112, y: 216 })
        && f4.x % 50 === 0 && f4.y % 50 === 0 && Math.max(Math.abs(f4.x - 100), Math.abs(f4.y - 200)) === 150 && j(f5) === j({ x: 250, y: 250 }), j([f1, f2, f3, f4, f5]));
})());
{   // the token creator (fold 2): a token's kept original never leaves the host (sanitizeItem, run for real)
    const siA = src.indexOf('function sanitizeItem(');
    const siF = new Function('window', siSrc() + '\nreturn sanitizeItem;')({});
    const frK = { src: '/saves/images/lib/a.png', x: 1, y: 2, s: 3, of: '/saves/images/portraits/token-w1-k1.png' };
    const mapF = { id: 'm1', type: 'map', rooms: [], links: [], whiteboard: [{ id: 'w1', type: 'image', isChar: true, src: frK.of, frame: frK, gmInfo: 'secret', sheet: { a: 1 } }, { id: 'w2', type: 'image', src: '/saves/images/x.png', frame: { src: 'a' } }, { id: 'w3', hidden: true, type: 'image', frame: { src: 'b' }, x: 1, y: 2, w: 3, h: 4 }, { id: 'w4', type: 'rect', x: 0 }] };
    const outF = siF(mapF);
    check('token creator: a token\'s kept original (frame) never reaches a player — sanitizeItem (run for real) strips it with the attached sheet and the GM note from every token (a hidden one is only a stub); the rest of the token travels; the GM\'s own map keeps it',
        siA > 0 && outF.whiteboard.length === 4 && outF.whiteboard.every(w => !('frame' in w) && !('gmInfo' in w) && !('sheet' in w)) && outF.whiteboard[0].src === frK.of && outF.whiteboard[0].isChar === true && outF.whiteboard[3].x === 0
        && j(Object.keys(outF.whiteboard[2]).sort()) === j(['h', 'hidden', 'id', 'layer', 'locked', 'rot', 'type', 'w', 'x', 'y']) && j(mapF.whiteboard[0].frame) === j(frK) && !!mapF.whiteboard[1].frame, j(outF.whiteboard));
}
// Onboarding F4: a file fills a character in the making (the [netcheck:charfill] branch of char-upload, run for real with the real systemcore and
// sheetexport): at once, with its owner's rights, past the list rules while making (owner, 2026-09-27), read on the players' view only; the table's
// rule (fromFile), the library loading, the rate; counts only in the answer; the player's side reads the answer's words and counts
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), SXp = await import(url('sheetexport.js'));
    const upSrc = between('// [netcheck:charupload-start]', '// [netcheck:charupload-end]', 'charupload');
    const lstF = { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'gm', list: { cats: ['Skill'], noQty: true, multi: true, lvl: { label: 'Level', min: -10, max: 40, def: 10 }, stats: [{ key: 'attr', labels: ['ST', 'DX', 'IQ'] }, { key: 'diff' }] } };
    const sysF = (gmDx, iq) => Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', edit: 'gm', def: 10 }].concat(iq ? [{ id: 'f_iq', key: 'IQ', label: 'IQ', kind: 'number', vis: 'all', edit: 'gm', def: 10 }] : []).concat(gmDx ? [{ id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'gm', def: 10 }] : []).concat([lstF]),
        items: [{ id: 'i_climb', name: 'Climbing', key: 'Climbing', category: 'Skill', stats: { attr: 1, diff: 1 } }].concat(gmDx ? [{ id: 'i_pot', name: 'Pottery', key: 'Pottery', category: 'Skill', vis: 'gm', stats: { attr: 2, diff: 0 } }] : []) }, { F: Fx, gmView: true });
    const viewOf = cp => Sx.cleanSystem(cp.system, { F: Fx, gmView: false });
    const shPF = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), pfSrc = shPF.slice(shPF.indexOf('function playerFinder('), shPF.indexOf('function fromShadowBase('));
    const realFinder = win => new Function('window', pfSrc + '\nreturn playerFinder;')(win);
    const entL = { i_jump: { id: 'i_jump', name: 'Jumping', key: 'Jumping', category: 'Skill', notes: 'Leap.', stats: { attr: 1, diff: 0 } }, i_axe: { id: 'i_axe', name: 'Axe Throwing', key: 'AxeThrowing', category: 'Skill', stats: { attr: 1, diff: 1 } }, i_secret: { id: 'i_secret', name: 'Secret Art', key: 'SecretArt', category: 'Skill', notes: 'GM ONLY LORE', stats: { attr: 2, diff: 2 } } };
    const plCopy = e => { const c = JSON.parse(JSON.stringify(e)); delete c.notes; return c; };
    const libFake = { state: () => 'ready', entry: id => entL[id] || null, entriesOf: id => id === 'p_pub' ? [entL.i_jump, entL.i_axe] : id === 'p_gm' ? [entL.i_secret] : [],
        playerIndexOf: id => id === 'p_pub' ? { byId: { i_jump: plCopy(entL.i_jump), i_axe: plCopy(entL.i_axe) } } : null, playerEntry: id => id === 'i_jump' || id === 'i_axe' ? plCopy(entL[id]) : null };
    const dossier = { name: 'Vex', attributes: { strength: { value: 13 }, dexterity: { value: 14 } }, skills: [{ name: 'Climbing', level: '12', relativeLevel: 'DX/Average' }, { name: 'Pottery', level: '11', relativeLevel: 'IQ/Easy' }] };
    const run = (o) => {
        o = o || {}; const sys = sysF(o.gmDx, o.iq), ch = Object.assign({ id: 'c_m', name: 'Vex', ownerId: 'u_a', npc: false, making: 1, values: { f_st: 10, f_sk: [{ id: 'w_old', defId: 'i_climb', qty: 1, lvl: 3 }] } }, o.ch || {});
        const camp = { id: 'k', system: sys, chars: { c_m: ch } }; if (o.newPlayers) camp.newPlayers = o.newPlayers; if (o.lib) camp.library = { dir: 'l_x', packs: [{ id: 'p_pub', rev: 1 }].concat(o.noGm ? [] : [{ id: 'p_gm', rev: 1, vis: 'gm' }]) };
        const out = { answer: [], sent: [], toasts: [], logs: [], saves: 0, allowed: [], lims: [], changed: [], at: o.at || {}, camp, ch };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netF = { active: true, role: 'host', paused: false, conns: [], roster: { pA: { id: 'u_a', name: 'Pat' } }, sendCharTo: (pid, id) => out.sent.push([pid, id]), syncCharDelta() { out.delta = true; } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpLibrary: o.lib ? libFake : { state: () => (o.loading ? 'loading' : 'ready') }, wpSheets: { sbFinder: () => () => [], charChanged: id => out.changed.push(id), uploadsChanged() {}, playerSystem: viewOf, charFromJson: SXp.charFromJson } };
        win.wpSheets.playerFinder = realFinder(win);
        if (o.lib) Sx.setLibraryFind(libFake.entry);
        try {
            new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'toast', 'logEvent', '_uploadAt', 'UPLOAD_GAP_MS', 'sheetsOnFor', 'allow', upSrc)(
                Object.assign({ type: 'char-upload', rid: 'e1', charId: 'c_m', sheet: dossier }, o.msg || {}), conn, netF, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), out.at, 10000, () => o.sheetsOff !== true, (k, lim, peer) => { out.allowed.push(k); out.lims.push([k, lim, peer]); return o.slow !== k; });
        } finally { if (o.lib) Sx.setLibraryFind(null); }
        return out;
    };
    const R1 = run(), sk1 = R1.ch.values.f_sk || [];
    check('Onboarding F4 (host, run for real): a ShadowBase sheet sent for a character in the making fills it at once with its owner\'s rights — past the list rules while making (a row of their own on a list without Custom rows) — the old rows replaced; nothing waits for review; the answer counts only; its copy to its owner alone; the GM told (toast, log), their open sheet redrawn and the save made; the rate for fills (charfill: a file every 10 s a player, a dozen a minute for the table), the time of it kept',
        j(R1.answer) === j([{ n: 0, auto: 3, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && R1.ch.values.f_st === 13 && sk1.length === 2 && sk1[0].defId === 'i_climb' && sk1[0].lvl === 12 && sk1[1].def && sk1[1].def.name === 'Pottery' && sk1[1].lvl === 11 && !sk1.some(r => r.id === 'w_old')
        && !R1.camp.uploads && j(R1.sent) === j([['u_a', 'c_m']]) && !R1.delta && R1.toasts.length === 1 && /^Pat filled Vex from a file \(3 parts\)/.test(R1.toasts[0]) && R1.logs.length === 1 && R1.logs[0][0] === 'char' && R1.saves === 1 && j(R1.allowed) === j(['charfill'])
        && j(R1.lims) === j([['charfill', { perMs: 10000, burst: 2, windowMs: 60000, table: 12 }, 'pA']]) && typeof R1.at.pA === 'number' && R1.at.pA > 0 && j(R1.changed) === j(['c_m']), j([R1.answer, sk1, R1.toasts, R1.lims]));
    const R2 = run({ gmDx: true }), sk2 = R2.ch.values.f_sk || [];
    check('Onboarding F4 (host): nothing GM-only is read — a GM-only field of the file\'s key (DX) and a GM-only item of a row\'s name (Pottery) never fill, and the answer is the same with or without them (nothing to probe)',
        j(R2.answer) === j(R1.answer) && !('f_dx' in R2.ch.values) && !sk2.some(r => r.defId === 'i_pot') && sk2[1] && sk2[1].def && sk2[1].def.name === 'Pottery', j([R2.answer, sk2]));
    const pv = Sx.charForView({ id: 'c_s', name: 'Vex', ownerId: 'u_a', npc: false, values: { f_st: 15, f_sk: [{ id: 'w_a', defId: 'i_climb', qty: 1, lvl: 7 }] } }, viewOf({ system: sysF(false) }));
    const cfile = SXp.charToJson(viewOf({ system: sysF(false) }), pv, null, { exported: 'x', picture: 'data:image/png;base64,' + 'A'.repeat(50) });
    const R3 = run({ msg: { sheet: cfile } });
    check('Onboarding F4 (host): a character file (the player\'s own download) fills a character in the making the same way (its picture is never on the wire); on a character in play it is refused (file) and a ShadowBase sheet still goes to the GM\'s Review (owner, 2026-09-27: unlocked keeps today\'s Import)',
        j(R3.answer) === j([{ n: 0, auto: 2, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && R3.ch.values.f_st === 15 && (R3.ch.values.f_sk || []).length === 1 && R3.ch.values.f_sk[0].lvl === 7
        && j(run({ ch: { making: undefined, unlocked: 1 }, msg: { sheet: cfile } }).answer) === j([{ reason: 'file', type: 'char-upload-ans', rid: 'e1' }]) && (() => { const u = run({ ch: { making: undefined, unlocked: 1 } }); return u.answer[0].n > 0 && !!u.camp.uploads && u.ch.values.f_st === 10; })(), j(R3.answer));
    const sigF = { format: 'waypoint-character', v: 1, name: 'Vex', system: { sig: SXp.systemSig(viewOf({ system: sysF(false, true) })), fields: { f_st: { key: 'IQ', kind: 'number' }, f_x: { key: 'DX', kind: 'number' }, f_y: { key: 'Skills', kind: 'item-list' } } },
        values: { f_st: 12, f_x: 15, f_y: [{ id: 'w_1', defId: 'i_climb', qty: 1, lvl: 5 }, { id: 'w_2', defId: 'i_pot', qty: 1, lvl: 4 }] } };
    const T0 = run({ iq: true, msg: { sheet: sigF } }), T1 = run({ iq: true, gmDx: true, msg: { sheet: sigF } }), idN = v => j(v).replace(/"w_f[a-z0-9]+"/g, '"ID"');
    check('Onboarding F4 (host): a character file is read on the players\' view: the same file fills alike with or without a GM-only field (DX) and item (i_pot), the same answer and values (by field id on the file\'s own signature), never the GM-only field or item (nothing to probe)',
        j(T0.answer) === j(T1.answer) && idN(T0.ch.values) === idN(T1.ch.values) && T1.ch.values.f_st === 12 && T1.ch.values.f_iq === undefined && !('f_dx' in T1.ch.values) && !(T1.ch.values.f_sk || []).some(r => r.defId === 'i_pot'), j([T0.answer, T1.answer, T0.ch.values, T1.ch.values]));
    const lostF = JSON.parse(JSON.stringify(cfile)); lostF.values[Object.keys(lostF.values).find(k => Array.isArray(lostF.values[k]))].push({ id: 'w_z', defId: 'i_nowhere', qty: 1 });
    const RL = run({ msg: { sheet: lostF } });
    check('Onboarding F4 (host): a row the file points at that this campaign does not have, with nothing to know it by, is counted in the answer (never silently dropped)',
        j(RL.answer) === j([{ n: 0, auto: 2, left: 1, type: 'char-upload-ans', rid: 'e1' }]) && (RL.ch.values.f_sk || []).length === 1, j(RL.answer));
    // the real playerFinder (sheets.js): the view's items and the entries of the packs players may see, never a GM-only pack's; lib, the host's copy of a visible one
    const pfW = realFinder({ wpLibrary: libFake })({ id: 'k', library: { packs: [{ id: 'p_pub' }, { id: 'p_gm', vis: 'gm' }] } }, sysF(true));
    check('Onboarding F4 (host): the players\' finder (sheets.js playerFinder, run for real) finds the entries of a pack players may see by name and by key, its lib the host\'s own copy; never an entry of a GM-only pack nor a GM-only item, even handed the full system',
        j(pfW.find('Secret Art')) === '[]' && pfW.lib('i_secret') === null && pfW.find(' jumping ').map(e => e.id).join() === 'i_jump' && pfW.findKey('axethrowing').map(e => e.id).join() === 'i_axe' && pfW.lib('i_jump') === entL.i_jump
        && j(pfW.find('Pottery')) === '[]' && pfW.find('Climbing').map(e => e.id).join() === 'i_climb' && pfW.lib('i_climb') === null && pfW.lib('__proto__') === null);
    const dosL = { name: 'Vex', attributes: { strength: { value: 13 } }, skills: [{ name: 'Axe Throwing (long)', level: '12', relativeLevel: 'IQ/Average' }, { name: 'Secret Art', level: '11', relativeLevel: 'IQ/Easy' }, { name: 'Jumping', level: '10', relativeLevel: 'DX/Easy' }] };
    const L1 = run({ lib: true, msg: { sheet: dosL } }), L0 = run({ lib: true, noGm: true, msg: { sheet: dosL } }), skL = L1.ch.values.f_sk || [], axe = skL.find(r => r.defId === 'i_axe') || {}, sec = skL.find(r => (r.def && r.def.name === 'Secret Art')) || {};
    check('Onboarding F4 (host, with a library): a skill of a pack players may see comes in linked, with its copy, its level and its own name and numbers; one only a GM-only pack holds comes in as their own row — the same answer with or without that pack, nothing of it on the character (nothing to probe)',
        j(L1.answer) === j(L0.answer) && L1.answer[0].left === 0 && L1.answer[0].auto === 4 && !!axe.snap && axe.lvl === 12 && j(axe.ov) === j({ name: 'Axe Throwing (long)', stats: { attr: 2 } })
        && skL.some(r => r.defId === 'i_jump' && !!r.snap) && sec.own === 1 && !sec.defId && !sec.snap && !skL.some(r => r.defId === 'i_secret') && !/GM ONLY LORE|i_secret/.test(j(L1.ch.values)), j([L1.answer, L0.answer, skL]));
    const why = (o, reason) => { const r = run(o); return j(r.answer) === j([{ reason, type: 'char-upload-ans', rid: 'e1' }]) && r.ch.values.f_st === 10 && r.saves === 0 && r.toasts.length === 0 && r.sent.length === 0; };
    check('Onboarding F4 (host): refused, nothing changed — where the table does not let players start from a file (the tick off; making off; sheets off for the campaign), while the library still loads (wait), past the rate (slow), a file the GM cannot read (another version: unread); allowed when making is only on invitation',
        why({ newPlayers: { fromFile: false } }, 'nofile') && why({ newPlayers: { create: 'off' } }, 'nofile') && why({ sheetsOff: true }, 'nofile') && why({ loading: true }, 'wait') && why({ slow: 'charfill' }, 'slow') && run({ newPlayers: { create: 'invite' } }).answer[0].auto === 3
        && why({ msg: { sheet: Object.assign({}, cfile, { v: 99 }) } }, 'unread'));
    const uaS = between('// [netcheck:uploadans-start]', '// [netcheck:uploadans-end]', 'uploadans');
    const ua = msg => { const got = []; new Function('msg', 'pU', uaS)(msg, { done: a => got.push(a) }); return got[0]; };
    check('Onboarding F4 (player, run for real): the answer read in words (nofile, wait, file, slow) or as counts (never below 0, never past 100,000, a count that is not a number is 0); a reason not ours, a prototype name included, a plain refusal',
        ua({ reason: 'nofile' }).error === 'Starting a character from a file is not open at this table.' && /library is still loading/.test(ua({ reason: 'wait' }).error) && ua({ reason: 'file' }).error === 'A character file only fills a character you are still making.'
        && ua({ reason: '__proto__' }).error === 'The GM could not read it.' && ua({ reason: 'constructor' }).error === 'The GM could not read it.' && j(ua({ n: 0, auto: 3, left: 2 })) === j({ n: 0, auto: 3, left: 2 }) && j(ua({ n: 'x', auto: -5, left: 1e9 })) === j({ n: 0, auto: 0, left: 100000 }));
})());
// The token creator (owner, 2026-09-27): a player's framed picture for their own plain token — the host's tok-pic (the [netcheck:tokpic]
// slice, run for real) and the player's sender
pendingChecks.push((async () => {
    const tpS = between('// [netcheck:tokpic-start]', '// [netcheck:tokpic-end]', 'tokpic');
    const PIC = 'data:image/png;base64,iVBORw0KGgo=';
    const tp = async (o) => {
        o = o || {};
        const tok = Object.assign({ id: 'wt', isChar: true, charName: 'Vex', ownerId: 'u_a', type: 'circle', x: 0, y: 0, w: 60, h: 52 }, o.tok || {});
        const camp = { id: 'k', items: { m1: { id: 'm1', type: 'map', whiteboard: 'board' in o ? o.board : [tok] }, d1: { id: 'd1', type: 'page' } } };
        const out = { answer: [], faces: [], toasts: [], logs: [], allowed: [] };
        const conn = { peer: o.peer || 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netT = { active: true, role: 'host', paused: !!o.paused, roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } } };
        const win = { wpSheets: o.noSheets ? {} : { applyTokenFace: (m, w, plan, rep) => { out.faces.push([m, w, plan.kind, plan.data === PIC, rep]); return Promise.resolve(o.fail ? false : true); } } };
        new Function('msg', 'conn', 'net', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'toast', 'logEvent', 'own', 'allow', 'safeAvatar', tpS)(
            Object.assign({ type: 'tok-pic', rid: 'p1', mapId: 'm1', wbId: 'wt', img: PIC }, o.msg || {}), conn, netT, win, () => !!o.peerPaused, () => camp, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), H.own,
            k => { out.allowed.push(k); return o.slow !== k; }, H.safeAvatar);
        await new Promise(r => setTimeout(r, 0));
        return out;
    };
    const ok = await tp();
    const why = async (o, reason) => { const r = await tp(o); return j(r.answer) === j([{ reason, type: 'tok-pic-ans', rid: 'p1' }]) && r.faces.length === 0 && r.toasts.length === 0; };
    const refusals = [await why({ peer: 'pB' }, 'tokowner'), await why({ tok: { charId: 'c_1' } }, 'tokowner'), await why({ tok: { waiting: 1 } }, 'tokowner'), await why({ tok: { isChar: false } }, 'tokowner'),
        await why({ tok: { locked: true } }, 'locked'), await why({ tok: { hidden: true } }, 'locked'), await why({ msg: { wbId: 'nope' } }, 'missing'), await why({ msg: { mapId: 'd1' } }, 'missing'), await why({ msg: { mapId: '__proto__' } }, 'missing'), await why({ board: {} }, 'missing'), await why({ board: null }, 'missing'),
        await why({ msg: { img: 'data:image/svg+xml;base64,PHN2Zz4=' } }, 'bad'), await why({ msg: { img: 'https://evil/x.png' } }, 'bad'), await why({ msg: { img: 'data:image/png;base64,' + 'A'.repeat(200001) } }, 'bad'),
        await why({ paused: true }, 'paused'), await why({ peerPaused: true }, 'paused'), await why({ slow: 'charpic' }, 'slow'), await why({ noSheets: true }, 'off')];
    const unnamed = await tp({ tok: { charName: '' } }), failed = await tp({ fail: true }), badRid = await tp({ msg: { rid: 'p 1' } }), stranger = await tp({ peer: 'pZ' });
    check('token creator: tok-pic (host, run for real) — a player\'s framed picture for their OWN plain token is saved over its picture (applyTokenFace, replace) and answered ok, the GM told; refused and answered why, nothing saved: another\'s token, a character\'s token (its picture goes through char-pic), a waiting token (even one marked a character) or no token at all (tokowner), locked or hidden (locked), a token or map that is not there, not a map or a board that is not a list (missing), a picture that is not a whole safe picture — SVG, a web address, past 200,000 characters (bad), paused, the rate — one budget with char-pic, every picture saved on the GM\'s disk counted together (slow), no sheets module (off); a token with no name is "their token" to the GM; a failed save answers failed; a malformed request id or a peer not admitted: no answer',
        j(ok.answer) === j([{ ok: true, type: 'tok-pic-ans', rid: 'p1' }]) && j(ok.faces) === j([['m1', 'wt', 'picture', true, true]]) && j(ok.toasts) === j(['Pat changed the picture of their token (Vex).']) && j(ok.logs) === j([['char', 'Pat changed the picture of their token (Vex)']]) && j(ok.allowed) === j(['charpic'])
        && j(unnamed.toasts) === j(['Pat changed the picture of their token (their token).']) && refusals.every(Boolean) && j(failed.answer) === j([{ reason: 'failed', type: 'tok-pic-ans', rid: 'p1' }]) && failed.toasts.length === 0 && badRid.answer.length === 0 && stranger.answer.length === 0 && stranger.faces.length === 0, j([ok, refusals]));
    const ps = src.replace(/\r\n/g, '\n'), mkA = ps.indexOf('var _mkPending = {};'), mkB = ps.indexOf('// Onboarding F1b: a player\'s changed face reaches the host');
    const sendTP = (img, o) => { o = o || {}; const sent = []; const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', paused: false, selfPaused: false, myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) }] };
        const pend = new Function('net', 'safeAvatar', 'cleanCharName', 'setTimeout', 'clearTimeout', ps.slice(mkA, mkB) + '\nreturn _mkPending;')(netC, H.safeAvatar, v => String(v), () => 0, () => {}); return { r: netC.tokPic(o.map || 'm1', o.wb || 'wt', img, () => {}), sent, kinds: Object.keys(pend).map(k => pend[k].kind) }; };
    const sOk = sendTP(PIC), sBad = sendTP('https://evil/x.png');
    check('token creator: the player\'s tok-pic sender — only a whole safe picture travels, as { type, rid, mapId, wbId, img }; anything else is refused before it is sent; it remembers what it asked (its answer read in a token\'s words)',
        mkA > 0 && mkB > mkA && sOk.r.ok === true && sOk.sent.length === 1 && j(Object.keys(sOk.sent[0]).sort()) === j(['img', 'mapId', 'rid', 'type', 'wbId']) && sOk.sent[0].type === 'tok-pic' && j(sOk.kinds) === j(['tok-pic']) && sBad.r.error === 'That picture cannot be used.' && sBad.sent.length === 0 && sBad.kinds.length === 0, j([sOk, sBad.r]));
})());
// Lighting L4 (system light rules) on the wire: the Sight unit of the campaign's fog defaults (the real host sync and the client's branch,
// sliced), an item's light cleaned again by a client (the real cleanHostWbItem / cleanHostLight / cleanHostMap with the real fogcore), the
// system's light rules in the players' view (the real systemcore, cleaned twice) and a light on a player's copy of a map (the real sanitizeItem)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const chr = n => String.fromCharCode(n), ownK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    // (a) the host's message and its sync
    const syncL = between('// [netcheck:campfogsync-start]', '// [netcheck:campfogsync-end]', 'campfogsync'), rcvL = between('// [netcheck:campfog-start]', '// [netcheck:campfog-end]', 'campfog');
    const hostL = camp => { const sent = { a: [], w: [] }, resent = [];
        const net = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sent.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sent.w.push(m) }], roster: { pA: { id: 'u_a' } }, resendFogged: () => resent.push(sent.a.length) };
        new Function('net', 'getActiveCampaign', 'own', 'sendFailed', 'window', syncL)(net, () => camp, ownK, e => { throw e; }, { wpFogCore: FCx });
        return { net, sent, resent }; };
    const msgOf = unit => hostL({ id: 'k_1', fog: { defaults: { sight: 6 }, fields: { sight: 'f_sight', sightUnit: unit } } }).net.campFogMessage();
    const unitsOk = ['ft', 'm', 'cells'].map(u => j(msgOf(u))), junkU = ['yd', 'yards', 'FT', 'Cells', 'ft ', 'constructor', '__proto__', 'toString', '', 7, null, true, ['ft'], { ft: 1 }, '<img src=x>'].map(u => j(msgOf(u)));
    check('Lighting: the campaign\'s fog defaults carry the Sight unit to players only when it is feet, metres or cells, after the sight field; yards (no unit), a unit the app does not know, a prototype key or anything not text never travels',
        j(unitsOk) === j(['ft', 'm', 'cells'].map(u => j({ type: 'campFog', campId: 'k_1', fog: { fields: { sight: 'f_sight', sightUnit: u }, defaults: { sight: 6 } } })))
        && junkU.every(s => s === j({ type: 'campFog', campId: 'k_1', fog: { fields: { sight: 'f_sight' }, defaults: { sight: 6 } } }))
        && j(hostL({ id: 'k_1', fog: { fields: { sightUnit: 'cells' } } }).net.campFogMessage().fog) === j({ fields: { sightUnit: 'cells' }, defaults: { sight: 0 } }), j([unitsOk, junkU]));
    const campU = { id: 'k_1', fog: { defaults: { sight: 6 }, fields: { sight: 'f_sight' } } }, hU = hostL(campU), stepsU = [], stepU = () => { hU.net.syncCampFog(); stepsU.push([hU.sent.a.length, hU.resent.length]); };
    stepU(); stepU(); campU.fog.fields.sightUnit = 'ft'; stepU(); stepU(); campU.fog.fields.sightUnit = 'cells'; stepU(); campU.fog.fields.sightUnit = 'yd'; stepU(); campU.fog.fields.sightUnit = 'leagues'; stepU(); delete campU.fog.fields.sightUnit; stepU();
    hU.net.role = 'client'; campU.fog.fields.sightUnit = 'm'; stepU();
    check('Lighting: a change of the Sight unit alone goes to admitted players once (a waiting peer gets nothing) and re-sends every fogged map, after the message; the same unit again, or one unknown unit for another, sends nothing; a client never sends',
        j(stepsU) === j([[1, 1], [1, 1], [2, 2], [2, 2], [3, 3], [4, 4], [4, 4], [4, 4], [4, 4]]) && j(hU.resent) === j([1, 2, 3, 4]) && hU.sent.w.length === 0
        && j(hU.sent.a.map(m => m.fog.fields)) === j([{ sight: 'f_sight' }, { sight: 'f_sight', sightUnit: 'ft' }, { sight: 'f_sight', sightUnit: 'cells' }, { sight: 'f_sight' }]) && hU.sent.a.every(m => m.type === 'campFog' && m.campId === 'k_1' && j(m.fog.defaults) === j({ sight: 6 })), j([stepsU, hU.sent.a]));
    const runL = (msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', fog: { defaults: { sight: 2 }, fields: { sightUnit: 'm' } } } } } }, calls = [];
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', rcvL)({ role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, { peer }, msg, st, id => (ownK(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpFogCore: FCx, wpFog: { invalidateVision: () => calls.push('inv'), redraw: () => calls.push('draw') } });
        return [st.appState.campaigns.k_1.fog, calls]; };
    const mkL = fields => ({ type: 'campFog', campId: 'k_1', fog: { defaults: { sight: 9 }, fields } });
    const c1 = runL(mkL({ sight: 'f_sight', sightUnit: 'ft' }), 'host1'), c2 = runL(mkL({ sight: 'f_sight', sightUnit: '<img src=x onerror=alert(1)>' }), 'host1'), c3 = runL(mkL({ sightUnit: 'cells', sightunit: 'ft', unit: 'ft' }), 'host1'), c4 = runL(mkL({ sightUnit: { toString: null } }), 'host1'), c5 = runL(mkL({ sightUnit: 'ft' }), 'evil'), c6 = runL(mkL({ sightUnit: 'constructor' }), 'host1');
    check('Lighting: a client cleans the Sight unit its host sends again — feet, metres or cells are kept, anything else is dropped (the unit it had goes with it) and nothing but the known keys comes in — then works the fog out afresh and redraws; another peer changes nothing',
        j(c1) === j([{ fields: { sight: 'f_sight', sightUnit: 'ft' }, defaults: { sight: 9 } }, ['inv', 'draw']]) && j(c2) === j([{ fields: { sight: 'f_sight' }, defaults: { sight: 9 } }, ['inv', 'draw']]) && j(c3) === j([{ fields: { sightUnit: 'cells' }, defaults: { sight: 9 } }, ['inv', 'draw']])
        && j(c4) === j([{ fields: {}, defaults: { sight: 9 } }, ['inv', 'draw']]) && j(c6) === j(c4) && j(c5) === j([{ defaults: { sight: 2 }, fields: { sightUnit: 'm' } }, []]), j([c1, c2, c3, c4, c5, c6]));

    // (b) an item's light as a client keeps it
    const lineL = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); if (src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' is not unique'); return src.slice(i, src.indexOf('\n', i)); };
    const hmA = src.indexOf('function cleanHostMap(m) {'), hmB = src.indexOf('\n}\n', hmA) + 2;
    const hostSide = win => new Function('window', 'cleanWaitingItem', 'sanitizeRichText', 'safeColor', '"use strict";\n' + lineL('function cleanHostWbItem(w) {') + '\n' + lineL('function cleanHostLight(w) {') + '\n' + src.slice(hmA, hmB) + '\nreturn { cleanHostWbItem, cleanHostLight, cleanHostMap };')(win, H.cleanWaitingItem, t => 'T:' + String(t).length, v => (v === '#123456' ? v : ''));
    const CL = hostSide({ wpFogCore: FCx }), CN = hostSide({}), CO = hostSide({ wpFogCore: {} });
    const bad = 'Torch' + chr(0) + chr(10) + 'of' + chr(127) + '<b onclick=x>' + 'A'.repeat(500), badClean = 'Torch  of <b onclick=x>' + 'A'.repeat(37), ctrlRe = new RegExp('[' + chr(0) + '-' + chr(31) + chr(127) + ']');
    const items = () => [
        { id: 't1', type: 'image', isChar: true, x: 5, light: { bright: 20, dim: 40, off: true, unit: 'ft', name: 'Torch' } },
        { id: 't2', type: 'image', light: { bright: 3, dim: 1, off: 'yes', unit: 'furlong', name: bad, html: '<img>', constructor: 1 } },
        { id: 't3', type: 'image', light: { bright: 'x' } },
        { id: 'l1', type: 'light', light: { bright: 'x' } },
        { id: 'l2', type: 'light', light: { bright: 1e9, dim: -4, unit: 'cells', name: '  ' + chr(9) + ' ' } },
        { id: 't4', type: 'image', x: 1, y: 2 },
        { id: 'q1', waiting: 1, ownerId: 'u_a', type: 'circle', light: { bright: 5, dim: 5, name: 'Lamp' } },
        { id: 't5', type: 'image', light: null },
        { id: 't6', type: 'rect', light: '<img src=x onerror=alert(1)>' },
        { id: 'l3', type: 'light', light: ['ft'] },
        { id: 'x1', type: 'text', text: '<b>hi</b>', light: { bright: 0, dim: 2, unit: 'm', name: '<script>' } }];
    const got = items().map(w => CL.cleanHostWbItem(w)), lights = got.map(w => (ownK(w, 'light') ? w.light : 'none'));
    check('Lighting: a client cleans an item\'s light its host sends again (run for real) — the radii clamped, dim at least bright, off only when true, a unit only of feet, metres or cells, the name cut to 60 characters with its control characters made spaces and kept as plain text, nothing else carried; a light of nonsense leaves a token and reads 0 and 0 on a light source',
        j(lights) === j([{ bright: 20, dim: 40, off: true, unit: 'ft', name: 'Torch' }, { bright: 3, dim: 3, name: badClean }, 'none', { bright: 0, dim: 0 }, { bright: 1000, dim: 1000, unit: 'cells' }, 'none', 'none', 'none', 'none', { bright: 0, dim: 0 }, { bright: 0, dim: 2, unit: 'm', name: '<script>' }])
        && badClean.length === 60 && got[1].light.name.length === 60 && !ctrlRe.test(got[1].light.name) && got[10].text === 'T:9' && got[0].isChar === true && got[0].x === 5, j(lights));
    const plain = { id: 't4', type: 'image', x: 1, y: 2 }, plainOut = CL.cleanHostWbItem(plain), waitOut = CL.cleanHostWbItem(items()[6]);
    check('Lighting: an item without a light is untouched by the client\'s cleaner (the same item, no light key appears) and a waiting token still carries no light, whatever the host sent with it',
        plainOut === plain && j(plain) === j({ id: 't4', type: 'image', x: 1, y: 2 }) && !ownK(plain, 'light') && j(waitOut) === j(H.cleanWaitingItem(items()[6])) && !ownK(waitOut, 'light') && waitOut.waiting === 1 && !/Lamp/.test(j(waitOut))
        && CL.cleanHostWbItem({ id: 7, light: { bright: 1, dim: 1 } }) === null && CL.cleanHostWbItem(null) === null, j([plainOut, waitOut]));
    const noCore = [CN, CO].map(C => items().map(w => C.cleanHostWbItem(w)).map(w => (ownK(w, 'light') ? w.light : 'none')));
    check('Lighting: with no light cleaner on hand a client takes no light at all from its host — a good one, a hostile one and a light source\'s alike are removed, never kept as they came',
        j(noCore) === j([Array(11).fill('none'), Array(11).fill('none')]), j(noCore));
    const mapL = CL.cleanHostMap({ id: 'm1', type: 'map', whiteboard: items().concat([null, { id: 9 }, 'x']), rooms: 'x', cats: { a: { color: 'url(x)' }, b: { color: '#123456' } }, fogLit: '<img>', lightsCapped: 'yes' });
    check('Lighting: a whole map from the host has every item\'s light cleaned the same way (cleanHostMap, run for real) — the items that are not items dropped, each light as the item cleaner leaves it, the map\'s own lit cells and light cap still cleaned',
        j(mapL.whiteboard.map(w => w.id)) === j(['t1', 't2', 't3', 'l1', 'l2', 't4', 'q1', 't5', 't6', 'l3', 'x1']) && j(mapL.whiteboard.map(w => (ownK(w, 'light') ? w.light : 'none'))) === j(lights) && !ownK(mapL, 'fogLit') && !ownK(mapL, 'lightsCapped') && j(mapL.rooms) === '[]' && mapL.cats.a.color === '#888' && mapL.cats.b.color === '#123456', j(mapL));

    // (c) the system's light rules in the players' view, cleaned by the host and again by the client
    const base = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-bare.json'), 'utf8'));
    const longN = 'Gloom' + chr(7) + '<i>' + 'z'.repeat(500), longClean = 'Gloom <i>' + 'z'.repeat(51);
    const sysL = base(); sysL.combat = Object.assign({}, sysL.combat, { light: { html: '<img>', names: { dim: '  Dim' + chr(10) + 'light <b>x</b> ', dark: longN, bright: 'Bright', constructor: 'x' }, presets: [
        { name: 'Candle', bright: 5, dim: 10, unit: 'ft', pick: true, html: '<img>' }, { name: 'Torch' + chr(0) + '<script>', bright: 40, dim: 20, unit: 'furlong', pick: 'yes' }, { name: '', bright: 5, dim: 5 }, { name: 'Dark', bright: 0, dim: 0 },
        { name: 'Sun', bright: 1e9, dim: '7', unit: 'cells' }, { name: 'Text', bright: '5', dim: '9' }, null, 'x', { name: 'Glow', dim: 2, unit: 'm', pick: true }, { name: 7, bright: 3, dim: 3 }] } });
    const wantL = { names: { dim: 'Dim light <b>x</b>', dark: longClean }, presets: [{ name: 'Candle', bright: 5, dim: 10, unit: 'ft', pick: true }, { name: 'Torch <script>', bright: 40, dim: 40 }, { name: 'Sun', bright: 1000, dim: 1000, unit: 'cells' }, { name: 'Glow', bright: 0, dim: 2, unit: 'm', pick: true }] };
    const viewH = Sx.cleanSystem(sysL, { F: Fx, gmView: false }); let packedL = true; try { packCheck(viewH); } catch (e) { packedL = e.message; }
    const viewC = Sx.cleanSystem(JSON.parse(j(viewH)), { F: Fx, gmView: false, libCats: {} });
    const bareV = Sx.cleanSystem(base(), { F: Fx, gmView: false }), junkV = ['<img>', [], 7, null, { names: { dim: '' }, presets: [{ name: 'x' }] }, { names: 'x', presets: 'y' }].map(l => { const s = base(); s.combat = { light: l }; const v = Sx.cleanSystem(s, { F: Fx, gmView: false }); return !!v && !!v.combat && !ownK(v.combat, 'light'); });
    const manyS = base(); manyS.combat = { light: { presets: Array.from({ length: 40 }, (x, i) => ({ name: 'P' + i, bright: 1, dim: 2 })) } }; const manyV = Sx.cleanSystem(manyS, { F: Fx, gmView: false });
    check('Lighting: the system\'s light rules reach players in the players\' view (the real cleaner) — the names of dim light and darkness and the presets as short plain text with control characters made spaces, radii clamped, dim at least bright, a unit only of feet, metres or cells, the pick mark only when true, at most 24 presets, last in the combat rules; they pack for the wire and a client cleaning them again gets exactly what the host sent; a system with none, or with nonsense, carries none',
        !!viewH && j(viewH.combat.light) === j(wantL) && longClean.length === 60 && packedL === true && j(viewC) === j(viewH) && j(viewC.combat.light) === j(wantL) && Object.keys(viewH.combat).pop() === 'light'
        && !!bareV && !ownK(bareV.combat, 'light') && junkV.every(Boolean) && manyV.combat.light.presets.length === 24 && manyV.combat.light.presets[23].name === 'P23' && j(Sx.cleanSystem(JSON.parse(j(manyV)), { F: Fx, gmView: false, libCats: {} })) === j(manyV)
        && Sx.lightName(viewC, 1) === 'Dim light <b>x</b>' && Sx.lightName(viewC, 0) === longClean && Sx.lightName(viewC, 2) === '' && j(Sx.lightPresets(viewC)) === j(wantL.presets), j([viewH && viewH.combat, packedL, junkV]));

    // (d) a player's copy of a lit map
    const siA = src.indexOf('function sanitizeItem(');
    const siL = new Function('window', siSrc() + '\nreturn sanitizeItem;')({});
    const torch = { bright: 20, dim: 40, unit: 'ft', name: 'Torch' }, lamp = { bright: 2, dim: 4, off: true, unit: 'cells', name: 'Street lamp' };
    const mapS = { id: 'm1', type: 'map', rooms: [], links: [], fog: { on: true, mode: 'auto' }, whiteboard: [
        { id: 'w1', type: 'image', isChar: true, x: 1, y: 2, w: 3, h: 4, light: torch }, { id: 'w2', type: 'light', x: 5, y: 6, w: 7, h: 8, light: lamp }, { id: 'w3', type: 'image', sheet: { a: 1 }, gmInfo: 'secret', frame: { src: 'a' }, light: torch },
        { id: 'w4', type: 'image', hidden: true, x: 1, y: 2, w: 3, h: 4, light: { bright: 9, dim: 9, unit: 'm', name: 'Secret lantern' } }, { id: 'w5', type: 'light', hidden: true, x: 1, y: 2, w: 3, h: 4, light: { bright: 1, dim: 2, name: 'Secret glow' } }, { id: 'w6', type: 'rect', x: 0 }] };
    const before = j(mapS), outS = siL(mapS); let packedS = true; try { packCheck(outS); } catch (e) { packedS = e.message; }
    const stubKeys = j(['h', 'hidden', 'id', 'layer', 'locked', 'rot', 'type', 'w', 'x', 'y']);
    check('Lighting: a player\'s copy of a map keeps a visible item\'s light with its unit and name (sanitizeItem, run for real: a token\'s, a light source\'s, one on a token whose GM prep is stripped) and the light of a hidden item never travels — a hidden token or light source is only a stub, its light and its name nowhere in the copy; the host\'s own map is unchanged',
        siA > 0 && outS.whiteboard.length === 6 && j(outS.whiteboard[0].light) === j(torch) && j(outS.whiteboard[1].light) === j(lamp) && outS.whiteboard[1].type === 'light' && j(outS.whiteboard[2].light) === j(torch) && !ownK(outS.whiteboard[2], 'sheet') && !ownK(outS.whiteboard[2], 'gmInfo') && !ownK(outS.whiteboard[2], 'frame')
        && [3, 4].every(i => j(Object.keys(outS.whiteboard[i]).sort()) === stubKeys && outS.whiteboard[i].type === 'rect' && !ownK(outS.whiteboard[i], 'light')) && !/Secret|"unit":"m"/.test(j(outS)) && !ownK(outS.whiteboard[5], 'light') && packedS === true && j(mapS) === before
        && j(CL.cleanHostWbItem(JSON.parse(j(outS.whiteboard[0]))).light) === j(torch) && j(CL.cleanHostMap(JSON.parse(j(outS))).whiteboard.map(w => w.light || 0)) === j([torch, lamp, torch, 0, 0, 0]), j(outS.whiteboard));
})());
// Lighting L5 (a player's own light) on the wire: the host's tok-light (the [netcheck:toklight] slice, run for real with the real fogcore and
// systemcore), the player's sender and its answers (LIGHT_WHY), and no other door in: the patch gate takes no light, a hidden token's stub none
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js'));
    const ownK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const tlS = between('// [netcheck:toklight-start]', '// [netcheck:toklight-end]', 'toklight');
    const runTL = new Function('msg', 'conn', 'net', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'toast', 'logEvent', 'own', 'allow', 'save', 'render', '"use strict";\n' + tlS);
    const torch = { bright: 20, dim: 40, unit: 'ft', name: 'Torch' }, torchOff = { bright: 20, dim: 40, off: true, unit: 'ft', name: 'Torch' }, candle = { bright: 5, dim: 10, unit: 'ft', name: 'Candle' }, candleOff = { bright: 5, dim: 10, off: true, unit: 'ft', name: 'Candle' };
    const glow = { bright: 0, dim: 2, unit: 'm', name: 'Glow' }, sun = { bright: 30, dim: 30, name: 'Sun' }, lamp = { bright: 2, dim: 4, unit: 'cells', name: 'Lamp' };
    // the host's own list as a system file holds it: the cleaner drops what is no preset, so a place counts in the CLEANED list
    const presetsRaw = () => [null, { name: 'Candle', bright: 5, dim: 10, unit: 'ft', pick: true, html: '<img>' }, { name: 'Torch', bright: 20, dim: 40, unit: 'ft' }, { name: '', bright: 1, dim: 1, pick: true }, { name: 'Glow', dim: 2, unit: 'm', pick: true },
        { name: 'Lantern', bright: 30, dim: 60, pick: 'yes' }, { name: 'Sun', bright: 30, dim: 30, pick: true }];
    const sysOf = () => ({ combat: { light: { presets: presetsRaw() } } });
    const tl = (o) => {
        o = o || {};
        const tok = Object.assign({ id: 'wt', isChar: true, charName: 'Vex', ownerId: 'u_a', type: 'image', x: 0, y: 0, w: 60, h: 52, light: JSON.parse(j(torch)) }, o.tok || {});
        if (tok.light === undefined) delete tok.light;
        const tok2 = { id: 'wt', isChar: true, charName: 'Vex', ownerId: 'u_a', type: 'image', x: 9, y: 9, w: 60, h: 52, light: JSON.parse(j(lamp)) };
        const camp = { id: 'k', activeItemId: o.active || 'm1', items: { m1: { id: 'm1', type: 'map', whiteboard: 'board' in o ? o.board : [null, { id: 'wo', isChar: true, ownerId: 'u_b', light: JSON.parse(j(lamp)) }, tok] }, m2: { id: 'm2', type: 'map', whiteboard: [tok2] }, d1: { id: 'd1', type: 'page', whiteboard: [tok2] } } };
        if (!o.noSystem) camp.system = 'system' in o ? o.system : sysOf();
        const msg = Object.assign({ type: 'tok-light', rid: 'l1', mapId: 'm1', wbId: 'wt', on: true }, o.msg || {});
        (o.drop || []).forEach(k => { delete msg[k]; });
        const target = msg.mapId === 'm2' ? tok2 : tok, lightNow = () => j(target.light === undefined ? null : target.light);
        const out = { answer: [], ev: [], allowed: [], budgets: [], counted: [], asked: 0, threw: '' };
        const conn = { peer: o.peer || 'pA', send: m => { packCheck(m); out.ev.push('ans'); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netT = { active: true, role: 'host', paused: !!o.paused, applyingRemote: 'was' in o ? o.was : false, roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' }, pN: { id: 'u_n', name: '' } },
            broadcastItemFiltered: (c, m) => { out.ev.push('send:' + c + ':' + m + ':' + String(netT.applyingRemote)); } };
        const off = () => { out.asked++; return false; };
        const win = { wpFogCore: FCx, wpSystemCore: Sx, wpVtt: { on: off, campaignOn: off, enabled: off, featureOn: off }, wpHistFlush: () => { out.ev.push('flush:' + lightNow()); },
            wpFog: { invalidateVision: () => { out.ev.push('inv:' + lightNow()); }, redraw: () => { out.ev.push('redraw'); }, lightCount: m => { out.counted.push(m && m.id); return o.count || 0; } } };
        if (o.win) o.win(win);
        out.before = j(camp);
        try {
            runTL(msg, conn, netT, win, () => !!o.peerPaused, () => (o.noCamp ? null : camp), e => { throw e; }, t => { out.ev.push('toast'); out.toast = t; }, (k, t) => { out.ev.push('log'); out.log = [k, t]; }, H.own,
                (k, b, p) => { out.allowed.push([k, p]); out.budgets.push(b); return o.slow !== k; }, a => { out.ev.push('save:' + String(a) + ':' + String(netT.applyingRemote) + ':' + lightNow()); if (o.saveThrows) throw new Error('disk full'); }, () => { out.ev.push('render'); });
        } catch (e) { out.threw = e.message; }
        out.after = j(camp); out.flag = netT.applyingRemote; out.light = target.light; out.tok = tok; out.tok2 = tok2;
        return out;
    };
    const okAns = j([{ ok: true, type: 'tok-light-ans', rid: 'l1' }]);
    const steps = (from, to, extra) => j(['flush:' + j(from), 'inv:' + j(to), 'save:true:true:' + j(to), 'send:k:' + ((extra && extra.map) || 'm1') + ':false'].concat(extra && extra.away ? [] : ['render', 'redraw']).concat(['ans', 'toast', 'log']));
    const told = (r, words) => r.toast === words + '.' && j(r.log) === j(['char', words]) && r.ev.filter(e => e === 'toast').length === 1 && r.ev.filter(e => e === 'log').length === 1;
    const done = (r, from, to, words, extra) => j(r.answer) === okAns && j(r.light) === j(to) && j(r.ev) === steps(from, to, extra) && told(r, words) && r.flag === false && r.threw === '' && j(r.allowed) === j([['toklight', 'pA']]);
    const still = r => j(r.answer) === okAns && j(r.ev) === j(['ans']) && r.after === r.before && r.allowed.length === 0 && r.flag === false && r.threw === '';   // answered ok, nothing written, nobody told

    const cleaned = Sx.lightPresets(sysOf());
    check('a player\'s own light: the places a pick names are those of the host\'s cleaned list of presets — what is no preset is dropped before the places are counted, and the pick mark is kept only when it is true',
        j(cleaned) === j([{ name: 'Candle', bright: 5, dim: 10, unit: 'ft', pick: true }, { name: 'Torch', bright: 20, dim: 40, unit: 'ft' }, { name: 'Glow', bright: 0, dim: 2, unit: 'm', pick: true }, { name: 'Lantern', bright: 30, dim: 60 }, { name: 'Sun', bright: 30, dim: 30, pick: true }]), j(cleaned));

    // (a) the host: a plain switch
    const swOff = tl({ msg: { on: false } }), swOn = tl({ tok: { light: JSON.parse(j(torchOff)) } }), swBare = tl({ tok: { light: { bright: 3, dim: 3, off: true } } });
    check('a player\'s own light (host, run for real): their own token\'s light is put out and lit again with its radii, unit and name kept, answered ok, and the GM is told once in a toast and once in the log in words that name the player, the light and the token',
        done(swOff, torch, torchOff, 'Pat put out the light of their token (Vex)') && done(swOn, torchOff, torch, 'Pat lit Torch on their token (Vex)') && done(swBare, { bright: 3, dim: 3, off: true }, { bright: 3, dim: 3 }, 'Pat lit the light of their token (Vex)')
        && j(swOff.budgets.map(b => [typeof b.perMs, typeof b.burst, b.perMs > 0, b.burst >= 1])) === j([['number', 'number', true, true]]), j([swOff, swOn, swBare]));
    const hostile = { bright: 999, dim: 999, unit: 'cells', light: { bright: 500, dim: 500, unit: 'm', name: 'Mine' }, off: true, radius: 77, pick: true, html: '<img src=x onerror=alert(1)>', lightLock: false, locked: false, ownerId: 'u_a', charName: '<b>x</b>' };
    const swX = tl({ msg: Object.assign({}, hostile, { on: false, off: false }) }), swXon = tl({ tok: { light: JSON.parse(j(torchOff)) }, msg: Object.assign({}, hostile, { on: true }) });
    const onWords = ['false', 0, null, '', 'off', NaN, {}, []].map(v => [tl({ msg: { on: v } }), tl({ tok: { light: JSON.parse(j(torchOff)) }, msg: { on: v } })]), onGone = tl({ tok: { light: JSON.parse(j(torchOff)) }, drop: ['on'] });
    check('a player\'s own light (host): a switch takes nothing but on or off from the message — radii, a unit, a whole light, an off mark, a lock or a name for the token sent with it change nothing, and only the word false puts a light out (anything else lights it)',
        done(swX, torch, torchOff, 'Pat put out the light of their token (Vex)') && done(swXon, torchOff, torch, 'Pat lit Torch on their token (Vex)') && j(Object.keys(swX.tok).sort()) === j(['charName', 'h', 'id', 'isChar', 'light', 'ownerId', 'type', 'w', 'x', 'y']) && swX.tok.charName === 'Vex'
        && onWords.every(p => still(p[0]) && done(p[1], torchOff, torch, 'Pat lit Torch on their token (Vex)')) && done(onGone, torchOff, torch, 'Pat lit Torch on their token (Vex)'), j([swX, swXon]));

    // a pick
    const pkC = tl({ msg: { preset: 0, name: 'Candle' } }), pkG = tl({ msg: { preset: 2, name: 'Glow' } }), pkS = tl({ msg: { preset: 4, name: 'Sun' } }), pkOff = tl({ msg: { preset: 0, name: 'Candle', on: false } }), pkNew = tl({ tok: { light: undefined }, msg: { preset: 0, name: 'Candle' } });
    const pkX = tl({ msg: Object.assign({}, hostile, { preset: 0, name: 'Candle', on: true }) }), pkList = tl({ msg: { preset: 0, name: 'Candle' } });
    check('a player\'s own light (host): a pick copies the preset at that place of the host\'s own list by value — its radii, unit and name, a preset without a unit leaving none of the old light\'s — and takes nothing else from the message; a pick sent with on false gives the preset switched off; a token that had no light gets one',
        done(pkC, torch, candle, 'Pat lit Candle on their token (Vex)') && done(pkG, torch, glow, 'Pat lit Glow on their token (Vex)') && done(pkS, torch, sun, 'Pat lit Sun on their token (Vex)') && !ownK(pkS.light, 'unit') && done(pkOff, torch, candleOff, 'Pat put out the light of their token (Vex)')
        && done(pkNew, null, candle, 'Pat lit Candle on their token (Vex)') && j(pkNew.counted) === j(['m1']) && done(pkX, torch, candle, 'Pat lit Candle on their token (Vex)') && j(Object.keys(pkX.light)) === j(['bright', 'dim', 'unit', 'name'])
        && j(Sx.lightPresets(sysOf())) === j(cleaned) && !ownK(pkList.light, 'pick'), j([pkC, pkG, pkS, pkOff, pkNew, pkX]));

    // nothing to change
    const same = [tl({}), tl({ tok: { light: JSON.parse(j(torchOff)) }, msg: { on: false } }), tl({ tok: { light: JSON.parse(j(candle)) }, msg: { preset: 0, name: 'Candle' } }), tl({ tok: { light: JSON.parse(j(candleOff)) }, msg: { preset: 0, name: 'Candle', on: false } }),
        tl({ tok: { light: { bright: 20, dim: 40, unit: 'ft', name: 'Torch', html: '<img>' } } }), tl({ count: 1e9 }), tl({ slow: 'toklight' })];
    check('a player\'s own light (host): a light that is already as asked is answered ok with nothing written, saved or sent and nobody told — no history step, no count against the rate, the map\'s cap never in its way',
        same.every(still) && same.every(r => r.counted.length === 0), j(same));

    // one refusal per gate
    const why = (o, reason) => { const r = tl(o); return j(r.answer) === j([{ reason, type: 'tok-light-ans', rid: 'l1' }]) && j(r.ev) === j(['ans']) && r.after === r.before && j(r.allowed) === j(reason === 'slow' ? [['toklight', o.peer || 'pA']] : []) && r.flag === false && r.threw === '' && r.toast === undefined && r.log === undefined; };
    const pick = (p, n, more) => Object.assign({ msg: { preset: p, name: n } }, more || {}), bare = { light: undefined };
    const cases = [
        [{ paused: true }, 'paused'], [{ peerPaused: true }, 'paused'], [{ paused: true, msg: { mapId: 'nope' } }, 'paused'], [{ peerPaused: true, tok: { locked: true } }, 'paused'],
        [{ msg: { mapId: 'nope' } }, 'missing'], [{ msg: { mapId: 'd1' } }, 'missing'], [{ msg: { mapId: '__proto__' } }, 'missing'], [{ msg: { mapId: 'constructor' } }, 'missing'], [{ msg: { mapId: 'hasOwnProperty' } }, 'missing'], [{ msg: { mapId: 7 } }, 'missing'], [{ msg: { mapId: ['m1'] } }, 'missing'], [{ drop: ['mapId'] }, 'missing'],
        [{ msg: { wbId: 'nope' } }, 'missing'], [{ msg: { wbId: 7 } }, 'missing'], [{ msg: { wbId: ['wt'] } }, 'missing'], [{ drop: ['wbId'] }, 'missing'], [{ board: [] }, 'missing'], [{ board: {} }, 'missing'], [{ board: null }, 'missing'], [{ noCamp: true }, 'missing'],
        [{ peer: 'pB' }, 'tokowner'], [{ msg: { wbId: 'wo' } }, 'tokowner'], [{ tok: { ownerId: undefined } }, 'tokowner'], [{ tok: { ownerId: null } }, 'tokowner'], [{ tok: { ownerId: '' } }, 'tokowner'], [{ tok: { isChar: false } }, 'tokowner'], [{ tok: { isChar: false, type: 'light' } }, 'tokowner'],
        [{ tok: { waiting: 1 } }, 'tokowner'], [{ tok: { waiting: true, isChar: true } }, 'tokowner'], [{ peer: 'pB', tok: { locked: true, lightLock: true } }, 'tokowner'],
        [{ tok: { locked: true } }, 'locked'], [{ tok: { hidden: true } }, 'locked'], [{ tok: { locked: true, lightLock: true } }, 'locked'], [{ tok: { hidden: true }, msg: { preset: 0, name: 'Candle' } }, 'locked'],
        [{ tok: { lightLock: true } }, 'lightlock'], [{ tok: { lightLock: true }, msg: { on: false } }, 'lightlock'], [pick(0, 'Candle', { tok: { lightLock: true } }), 'lightlock'], [{ tok: { lightLock: true }, win: w => { delete w.wpFogCore; } }, 'lightlock'],
        [{ win: w => { delete w.wpFogCore; } }, 'off'], [{ win: w => { w.wpFogCore = {}; } }, 'off'], [{ win: w => { delete w.wpSystemCore; } }, 'off'], [{ win: w => { w.wpSystemCore = {}; } }, 'off'], [pick(77, 'Nope', { win: w => { delete w.wpSystemCore; } }), 'off'],
        [pick(5, 'Sun'), 'preset'], [pick(99, 'Candle'), 'preset'], [pick(-1, 'Candle'), 'preset'], [pick(0.5, 'Candle'), 'preset'], [pick(1e300, 'Candle'), 'preset'], [pick('0', 'Candle'), 'preset'], [pick(NaN, 'Candle'), 'preset'], [pick(null, 'Candle'), 'preset'],
        [pick([0], 'Candle'), 'preset'], [pick(true, 'Candle'), 'preset'], [pick('length', 'Candle'), 'preset'], [pick('constructor', 'Candle'), 'preset'], [pick('__proto__', 'Candle'), 'preset'],
        [pick(1, 'Torch'), 'preset'], [pick(3, 'Lantern'), 'preset'], [pick(0, 'Glow'), 'preset'], [pick(2, 'Candle'), 'preset'], [pick(0, 'candle'), 'preset'], [pick(0, 'Candle '), 'preset'], [pick(0, ''), 'preset'], [pick(0, 7), 'preset'], [pick(0, null), 'preset'], [pick(0, ['Candle']), 'preset'],
        [pick(0, 'constructor'), 'preset'], [pick(0, '__proto__'), 'preset'], [pick(0, 'toString'), 'preset'], [{ msg: { preset: 0 } }, 'preset'], [{ msg: { name: 'Candle' } }, 'preset'],
        [pick(0, 'Candle', { system: null }), 'preset'], [pick(0, 'Candle', { noSystem: true }), 'preset'], [pick(0, 'Candle', { system: { combat: { light: { presets: [{ name: 'Candle', bright: 5, dim: 10, unit: 'ft' }] } } } }), 'preset'],
        [pick(0, 'Candle', { system: { combat: { light: { presets: [{ name: 'Lamp', bright: 5, dim: 10, pick: true }, { name: 'Candle', bright: 5, dim: 10, unit: 'ft', pick: true }] } } } }), 'preset'], [pick(1, 'Torch', { tok: bare, count: 200 }), 'preset'],
        [{ tok: bare }, 'nolight'], [{ tok: bare, msg: { on: false } }, 'nolight'], [{ tok: { light: { bright: 0, dim: 0, name: 'Dark' } } }, 'nolight'], [{ tok: { light: '<img>' } }, 'nolight'], [{ tok: bare, count: 200 }, 'nolight'], [{ tok: bare, msg: hostile }, 'nolight'],
        [pick(0, 'Candle', { tok: bare, count: 200 }), 'cap'], [pick(0, 'Candle', { tok: bare, count: 201 }), 'cap'], [pick(0, 'Candle', { tok: bare, count: 200, slow: 'toklight' }), 'cap'], [pick(0, 'Candle', { tok: { light: null }, count: 1e9 }), 'cap'],
        [{ slow: 'toklight', msg: { on: false } }, 'slow'], [pick(0, 'Candle', { slow: 'toklight' }), 'slow'], [pick(0, 'Candle', { slow: 'toklight', tok: bare, count: 199 }), 'slow'], [{ slow: 'toklight', msg: { on: false }, peer: 'pN', tok: { ownerId: 'u_n' } }, 'slow']];
    const wrong = cases.filter(c => !why(c[0], c[1])).map(c => j([c[0], c[1], tl(c[0]).answer]));
    check('a player\'s own light (host): each gate refuses with its own reason and nothing is written, saved, sent, toasted or logged — a paused table or player (paused), a map that is no own key of the campaign, a page, a prototype name or not text, a token that is not there (missing), another player\'s token, one with no owner, an item that is no character, a waiting token (tokowner), a locked or hidden one (locked), a light the GM locked (lightlock), no fog core or no system core (off), a place out of range, negative, fractional, not a number or a prototype name, a preset not ticked for players, a name that is not that preset\'s or names a prototype key (preset), a switch on a token with no light (nolight), a new light at the map\'s cap (cap), the rate by its own budget (slow); the gates are asked in that order',
        wrong.length === 0 && cases.length > 80, wrong);
    const quiet = [tl({ msg: { rid: 'l 1' } }), tl({ msg: { rid: '' } }), tl({ msg: { rid: 7 } }), tl({ msg: { rid: 'x'.repeat(25) } }), tl({ msg: { rid: '<img>' } }), tl({ drop: ['rid'] }), tl({ msg: { rid: ['l1'] } }),
        tl({ peer: 'pZ' }), tl({ peer: 'constructor' }), tl({ peer: '__proto__' }), tl({ peer: 'hasOwnProperty' }), tl({ peer: 'pZ', paused: true }), tl({ peer: 'pZ', msg: { on: false } })];
    check('a player\'s own light (host): a request whose id is malformed and a peer who is not admitted (a prototype name is no player) get no answer at all, and nothing changes',
        quiet.every(r => r.answer.length === 0 && r.ev.length === 0 && r.after === r.before && r.allowed.length === 0 && r.threw === ''), j(quiet));

    // the lock is the word true only; the cap is for a new light only
    const lk = [tl({ tok: { lightLock: 'yes' }, msg: { on: false } }), tl({ tok: { lightLock: 1 }, msg: { on: false } }), tl({ tok: { lightLock: false }, msg: { on: false } }), tl({ tok: { lightLock: 'true' }, msg: { on: false } })];
    const capOld = tl({ count: 200, msg: { preset: 0, name: 'Candle' } }), capSw = tl({ count: 1e9, msg: { on: false } }), capUnder = tl({ tok: { light: undefined }, count: 199, msg: { preset: 0, name: 'Candle' } }), capNone = tl({ tok: { light: undefined }, count: 1e9, msg: { preset: 0, name: 'Candle' }, win: w => { delete w.wpFog; } });
    check('a player\'s own light (host): only a light lock that is true locks a light; the map\'s cap of ' + FCx.LIMITS.lights + ' light sources stops a new light only — a token that already carries a light may switch it or take another preset at the cap, and one light under the cap a new light is taken',
        lk.every(r => done(r, torch, torchOff, 'Pat put out the light of their token (Vex)')) && done(capOld, torch, candle, 'Pat lit Candle on their token (Vex)') && capOld.counted.length === 0 && done(capSw, torch, torchOff, 'Pat put out the light of their token (Vex)')
        && done(capUnder, null, candle, 'Pat lit Candle on their token (Vex)') && j(capUnder.counted) === j(['m1']) && FCx.LIMITS.lights === 200
        && j(capNone.answer) === okAns && j(capNone.light) === j(candle) && j(capNone.ev) === j(['flush:null', 'save:true:true:' + j(candle), 'send:k:m1:false', 'render', 'ans', 'toast', 'log']), j([lk, capOld, capSw, capUnder, capNone]));

    // the order of effects, the map sent, the GM's words
    const away = tl({ active: 'm2', msg: { on: false } }), other = tl({ msg: { mapId: 'm2', on: false } }), otherOn = tl({ active: 'm2', msg: { mapId: 'm2', preset: 4, name: 'Sun' } }), lampOff = Object.assign({}, { bright: 2, dim: 4, off: true }, { unit: 'cells', name: 'Lamp' });
    const wasOn = tl({ was: true, msg: { on: false } }), noFlush = tl({ msg: { on: false }, win: w => { delete w.wpHistFlush; } });
    check('a player\'s own light (host): the GM\'s pending edit is flushed to the history before the light is written, the vision is worked out afresh before the map goes out, the save runs as a remote change and the mark is back to what it was before the map is sent; the map sent is the message\'s map whichever map the GM is on, and only the GM\'s own open map is drawn again',
        done(swOff, torch, torchOff, 'Pat put out the light of their token (Vex)') && done(away, torch, torchOff, 'Pat put out the light of their token (Vex)', { away: true }) && done(other, lamp, lampOff, 'Pat put out the light of their token (Vex)', { map: 'm2', away: true }) && j(other.tok.light) === j(torch)
        && done(otherOn, lamp, sun, 'Pat lit Sun on their token (Vex)', { map: 'm2' }) && j(otherOn.tok.light) === j(torch)
        && j(wasOn.answer) === okAns && wasOn.flag === true && j(wasOn.ev) === j(['flush:' + j(torch), 'inv:' + j(torchOff), 'save:true:true:' + j(torchOff), 'send:k:m1:true', 'render', 'redraw', 'ans', 'toast', 'log'])
        && j(noFlush.answer) === okAns && j(noFlush.light) === j(torchOff) && j(noFlush.ev) === j(['inv:' + j(torchOff), 'save:true:true:' + j(torchOff), 'send:k:m1:false', 'render', 'redraw', 'ans', 'toast', 'log']), j([away, other, otherOn, wasOn, noFlush]));
    const thrown = [tl({ saveThrows: true, msg: { on: false } }), tl({ saveThrows: true, was: true, msg: { preset: 0, name: 'Candle' } }), tl({ saveThrows: true, tok: { light: undefined }, msg: { preset: 0, name: 'Candle' } })];
    check('a player\'s own light (host): when the save fails the light is put back as it was (none, where the token had none) and the vision worked out afresh, the mark of a remote change is put back to what it was, and nothing is sent, answered, drawn, toasted or logged',
        thrown[0].threw === 'disk full' && thrown[0].flag === false && j(thrown[0].ev) === j(['flush:' + j(torch), 'inv:' + j(torchOff), 'save:true:true:' + j(torchOff), 'inv:' + j(torch)]) && thrown[0].answer.length === 0 && j(thrown[0].light) === j(torch) && thrown[0].after === thrown[0].before
        && thrown[1].threw === 'disk full' && thrown[1].flag === true && j(thrown[1].ev) === j(['flush:' + j(torch), 'inv:' + j(candle), 'save:true:true:' + j(candle), 'inv:' + j(torch)]) && thrown[1].answer.length === 0 && j(thrown[1].light) === j(torch) && thrown[1].after === thrown[1].before
        && thrown[2].threw === 'disk full' && j(thrown[2].ev) === j(['flush:null', 'inv:' + j(candle), 'save:true:true:' + j(candle), 'inv:null']) && thrown[2].light === undefined && !('light' in thrown[2].tok) && thrown[2].after === thrown[2].before && thrown[2].answer.length === 0, j(thrown));
    {   // review: a whole map sent to the table becomes the baseline the next delta is worked out from (a light switched off by its player and on again by the GM went unsent, the same as the older baseline)
        const bfA = src.indexOf('net.broadcastItemFiltered = function(campId, itemId) {'), bfSrc = bfA >= 0 ? src.slice(bfA, src.indexOf('\n};\n', bfA) + 4) : '';
        const runBF = (fogged, had) => { const last = had ? { m1: { old: 1 } } : {}, sent = [], netB = { conns: [{ peer: 'pA', open: true, send: m => sent.push(['one', m.item.tag]) }], roster: { pA: { id: 'u_a' } } }, map = { id: 'm1', type: 'map', whiteboard: [{ id: 't', light: { bright: 1, dim: 2, off: true } }] };
            new Function('net', 'state', 'sanitizeItem', 'mapFogged', 'broadcast', '_lastSent', 'fogCopyFor', 'sendFailed', bfSrc)(netB, { appState: { campaigns: { k: { id: 'k', items: { m1: map } } } } }, it => JSON.parse(JSON.stringify(it)), () => fogged, (m, x) => sent.push(['all', m.type, m.itemId, x]), last, (clean) => Object.assign({ tag: 'mine' }, clean), e => { throw e; });
            netB.broadcastItemFiltered('k', 'm1'); netB.broadcastItemFiltered('k', 'nope'); map.whiteboard[0].light.off = false; return { last, sent, map }; };
        const bfOpen = runBF(false, true), bfNew = runBF(false, false), bfFog = runBF(true, true);
        check('sending a whole map to the table (broadcastItemFiltered, run for real): an unfogged one becomes the baseline of the next delta, as a copy (a later change to the map is a change against it); a fogged one, sent to each player through their own fog, leaves no shared baseline; a map that is not there sends nothing',
            bfSrc.length > 0 && j(bfOpen.sent) === j([['all', 'item', 'm1', null]]) && j(bfOpen.last.m1) === j({ id: 'm1', type: 'map', whiteboard: [{ id: 't', light: { bright: 1, dim: 2, off: true } }] }) && bfOpen.last.m1 !== bfOpen.map && j(bfNew.last.m1) === j(bfOpen.last.m1)
            && j(bfFog.sent) === j([['one', 'mine']]) && !('m1' in bfFog.last), j([bfOpen.sent, bfOpen.last, bfFog.sent, bfFog.last]));
    }
    const anon = tl({ peer: 'pN', tok: { ownerId: 'u_n', charName: '' }, msg: { on: false } }), anonPick = tl({ peer: 'pN', tok: { ownerId: 'u_n', charName: undefined }, msg: { preset: 2, name: 'Glow' } });
    check('a player\'s own light (host): a player with no name is "A player" to the GM and a token with no name "their token"',
        told(anon, 'A player put out the light of their token (their token)') && told(anonPick, 'A player lit Glow on their token (their token)') && j(anon.allowed) === j([['toklight', 'pN']]) && j(anonPick.light) === j(glow), j([anon.toast, anonPick.toast]));
    const gateless = tl({ msg: { preset: 0, name: 'Candle' } });
    check('a player\'s own light (host): no fog or lighting switch stands in its way — with every feature reading off and a map without fog, a light is still taken (a torch set ready beforehand)',
        done(gateless, torch, candle, 'Pat lit Candle on their token (Vex)') && !/wpVtt|campaignOn|\.fog\b|lighting/.test(tlS.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\/\/[^\n]*/g, '')) && !ownK(JSON.parse(gateless.before), 'fog'), j(gateless));
    check('a player\'s own light: the host\'s branch is taken for a tok-light message on the host only',
        /\} else if \(msg\.type === 'tok-light' && net\.role === 'host'\) \{\n\s*\/\/ \[netcheck:toklight-start\]/.test(src));

    // (b) the player's sender
    const mkA = src.indexOf('var _mkPending = {};'), mkB = src.indexOf('// Onboarding F1b: a player\'s changed face reaches the host');
    const sendTL = (o, more) => { more = more || {}; const sent = []; const netC = Object.assign({ active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', paused: false, selfPaused: false, myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] }, more.net || {});
        const pend = new Function('net', 'safeAvatar', 'cleanCharName', 'setTimeout', 'clearTimeout', src.slice(mkA, mkB) + '\nreturn _mkPending;')(netC, H.safeAvatar, v => String(v), () => 0, () => {});
        let called = 0; const r = netC.tokLight('map' in more ? more.map : 'm1', 'wb' in more ? more.wb : 'wt', o, () => { called++; }); return { r, sent, kinds: Object.keys(pend).map(k => pend[k].kind), called, keys: sent.map(m => Object.keys(m).sort()) }; };
    const sw = [sendTL({ on: true }), sendTL({ on: false }), sendTL(undefined), sendTL(null), sendTL({}), sendTL({ on: 0 }), sendTL({ on: 'false' }), sendTL({ on: false, bright: 9, dim: 9, unit: 'm', light: torch, name: 'Torch' })];
    const swKeys = j(['mapId', 'on', 'rid', 'type', 'wbId']), pkKeys = j(['mapId', 'name', 'on', 'preset', 'rid', 'type', 'wbId']);
    const pks = [sendTL({ on: true, preset: 2, name: 'Glow' }), sendTL({ preset: 0, name: 'Candle' }), sendTL({ on: false, preset: 99, name: 'Far' }), sendTL({ on: true, preset: 3, name: 'N'.repeat(200), bright: 50, dim: 50, unit: 'm' })];
    const idS = sendTL({ on: true }, { map: 12, wb: 34 });
    check('a player\'s own light: the sender (run for real) sends a switch as { type, rid, mapId, wbId, on } and a pick with its place and name besides — never a radius or a unit; only the word false puts out, the ids travel as text, a name is cut at 120 characters, and it remembers what it asked',
        mkA > 0 && mkB > mkA && sw.every(s => s.r.ok === true && s.sent.length === 1 && j(s.keys[0]) === swKeys && s.sent[0].type === 'tok-light' && s.sent[0].mapId === 'm1' && s.sent[0].wbId === 'wt' && /^k[a-z0-9]+$/.test(s.sent[0].rid) && j(s.kinds) === j(['tok-light']) && s.called === 0)
        && j(sw.map(s => s.sent[0].on)) === j([true, false, true, true, true, true, true, false])
        && pks.every(s => s.r.ok === true && s.sent.length === 1 && j(s.keys[0]) === pkKeys && s.sent[0].type === 'tok-light' && j(s.kinds) === j(['tok-light']))
        && j(pks.map(s => [s.sent[0].on, s.sent[0].preset, s.sent[0].name.length])) === j([[true, 2, 4], [true, 0, 6], [false, 99, 3], [true, 3, 120]]) && pks[0].sent[0].name === 'Glow' && pks[3].sent[0].name === 'N'.repeat(120)
        && idS.sent[0].mapId === '12' && idS.sent[0].wbId === '34', j([sw.map(s => s.sent), pks.map(s => s.sent)]));
    const sBad = [{ preset: 1.5, name: 'x' }, { preset: -1, name: 'x' }, { preset: 100, name: 'x' }, { preset: '1', name: 'x' }, { preset: NaN, name: 'x' }, { preset: Infinity, name: 'x' }, { preset: null, name: 'x' }, { preset: [1], name: 'x' }, { preset: true, name: 'x' },
        { preset: 1, name: '' }, { preset: 1 }, { preset: 1, name: 7 }, { preset: 1, name: null }, { preset: 1, name: ['x'] }, { preset: 1, name: { length: 3 } }].map(o => sendTL(o));
    const sAway = [sendTL({ on: false }, { net: { paused: true } }), sendTL({ on: false }, { net: { selfPaused: true } }), sendTL({ on: false }, { net: { role: 'host' } }), sendTL({ on: false }, { net: { syncedPeer: 'other' } }), sendTL({ on: false }, { net: { stream: true } })];
    check('a player\'s own light: the sender refuses a pick before anything is sent when its place is no whole number from 0 to 99 or it has no name of text, and sends nothing while paused, as a host, in a stream window or before the table is joined; nothing is left waiting for an answer',
        sBad.every(s => s.r.error === 'That light cannot be picked.' && s.sent.length === 0 && s.kinds.length === 0) && sAway.every(s => typeof s.r.error === 'string' && !!s.r.error && s.sent.length === 0 && s.kinds.length === 0) && sAway[0].r.error === 'The table is paused.', j([sBad.map(s => s.r), sAway.map(s => s.r)]));

    // (c) the answers
    const whySrc = lineOf('var MK_WHY = {') + '\n' + lineOf('var TOK_WHY = {') + '\n' + lineOf('var LIGHT_WHY = {'), ansSrc = between('// [netcheck:charmakeans-start]', '// [netcheck:charmakeans-end]', 'charmakeans');
    const ansOf = (msg, kind) => { const got = [], pend = { k1: { kind, done: a => got.push(a), timer: 1 } }; new Function('msg', '_mkPending', 'clearTimeout', whySrc + '\n' + ansSrc)(msg, pend, () => {}); return { got, left: Object.keys(pend).length }; };
    const lw = r => ansOf({ rid: 'k1', reason: r }, 'tok-light').got[0].error, tw = r => ansOf({ rid: 'k1', reason: r }, 'tok-pic').got[0].error, cw = r => ansOf({ rid: 'k1', reason: r }, 'char-make').got[0].error, plainNo = 'The GM could not do that.';
    const WHY = new Function(whySrc + '\nreturn { MK_WHY: MK_WHY, TOK_WHY: TOK_WHY, LIGHT_WHY: LIGHT_WHY };')();
    const hostReasons = Array.from(new Set((tlS.match(/reason: '([a-z]+)'/g) || []).map(s => s.slice(9, -1)))).sort();
    const words = { paused: 'The table is paused.', slow: 'A moment between changes of light, please.', missing: 'That token is no longer here (it may have moved to another map).', tokowner: 'That token is not yours.', locked: 'The GM has locked that token.', lightlock: 'The GM has locked that token’s light.',
        preset: 'That light is no longer on offer (the GM changed the list).', nolight: 'That token carries no light to switch.', cap: 'This map already has the most light sources it can hold.', off: 'The GM cannot take a light here.' };
    check('a player\'s own light: every reason the host gives has its words on the player\'s side and no other reason is listed — paused, slow, missing, tokowner, locked, lightlock, preset, nolight, cap, off',
        j(hostReasons) === j(Object.keys(words).sort()) && j(Object.keys(WHY.LIGHT_WHY).sort()) === j(hostReasons) && Object.keys(words).every(k => WHY.LIGHT_WHY[k] === words[k]), j([hostReasons, WHY.LIGHT_WHY]));
    const okL = ansOf({ rid: 'k1', ok: true }, 'tok-light'), okJunk = ansOf({ rid: 'k1', ok: true, light: torch, charId: '<img>', reason: 'cap' }, 'tok-light'), notOk = [ansOf({ rid: 'k1', ok: 'true', reason: 'cap' }, 'tok-light'), ansOf({ rid: 'k1', ok: 1 }, 'tok-light')], noQ = ansOf({ rid: 'k9', reason: 'cap' }, 'tok-light');
    check('a player\'s own light: the answers (player, run for real) are read in a light\'s words when a light was asked — each reason its own sentence; a reason of another table (have, closed, bad, failed, owner), a prototype name, an unknown word or something that is no text reads as a plain refusal; ok is ok only when true and carries nothing of a light; an answer to no question of ours does nothing',
        Object.keys(words).every(k => lw(k) === words[k]) && ['have', 'closed', 'bad', 'failed', 'owner', 'making', 'nomap', 'busy', 'notmaking', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope', '', 5, null, ['cap'], { cap: 1 }].every(r => lw(r) === plainNo)
        && j(okL.got) === j([{ ok: true, charId: null }]) && okL.left === 0 && j(okJunk.got) === j([{ ok: true, charId: null }]) && j(notOk[0].got) === j([{ error: words.cap }]) && j(notOk[1].got) === j([{ error: plainNo }]) && noQ.got.length === 0 && noQ.left === 1, j([Object.keys(words).map(lw), okL, okJunk, notOk]));
    check('a player\'s own light: the answers to a picture for a token and to a character in the making read as before — their own words for their own reasons, and a reason only a light has (lightlock, preset, nolight, cap) a plain refusal to them',
        tw('slow') === 'A moment between pictures, please.' && tw('missing') === 'That token is no longer here (it may have moved to another map).' && tw('off') === 'The GM cannot take pictures here.' && tw('bad') === 'That picture could not be used.' && tw('failed') === 'The GM could not save that picture.'
        && cw('slow') === 'A moment, please.' && cw('missing') === 'That character is gone.' && cw('off') === 'Character sheets are off here.' && cw('have') === 'You already play a character here.' && ansOf({ rid: 'k1', reason: 'slow' }).got[0].error === 'A moment, please.'
        && ['lightlock', 'preset', 'nolight', 'cap'].every(r => tw(r) === plainNo && cw(r) === plainNo && ansOf({ rid: 'k1', reason: r }).got[0].error === plainNo) && lw('slow') !== tw('slow') && lw('off') !== tw('off') && lw('off') !== cw('off')
        && j(Object.keys(WHY.TOK_WHY).sort()) === j(['bad', 'failed', 'locked', 'missing', 'off', 'paused', 'slow', 'tokowner']), j([tw('slow'), cw('slow'), tw('cap'), cw('cap')]));
    check('a player\'s own light: the answer to a light comes in by the same door as the other answers of its kind, on a player\'s side only',
        /\} else if \(\((?:msg\.type === '[a-z-]+' \|\| )+msg\.type === 'tok-light-ans'\) && net\.role === 'client'\) \{[^\n]*\n\s*\/\/ \[netcheck:charmakeans-start\]/.test(src));

    // (d) no other door in: the patch gate, the wire copy
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch'), cleanersSrc = src.slice(src.indexOf('var POSTURE_SET = '), src.indexOf('function sanitizeItem('));
    const stroke = (w, pid) => (w && w.type === 'path' && w.ownerId === pid && Array.isArray(w.pts)) ? { id: w.id, type: 'path', byPlayer: true, ownerId: pid, pts: w.pts, x: w.x || 0, y: w.y || 0 } : null;
    const runPatch = (camps, msg) => { try { return new Function('state', 'window', 'playerStroke', 'msg', 'prof', cleanersSrc + ownKeySrc + patchSrc + '\nreturn applyClientItemFiltered(msg, prof);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true }, wpFogCore: FCx, wpSystemCore: Sx }, stroke, msg, { id: 'u_p' }); } catch (e) { return 'threw: ' + e.message; } };
    const liveP = () => ({ c1: { id: 'c1', system: sysOf(), items: { m1: { type: 'map', whiteboard: [
        { id: 't1', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, light: JSON.parse(j(torch)), lightLock: true },
        { id: 't2', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0 },
        { id: 't3', isChar: true, ownerId: 'u_p', x: 0, y: 0, rot: 0, front: 0, light: JSON.parse(j(torchOff)) },
        { id: 't4', waiting: 1, ownerId: 'u_p', x: 0, y: 0 }] } } } });
    const csP = liveP(), big = { bright: 1000, dim: 1000, unit: 'cells', name: 'Mine' };
    const chgP = runPatch(csP, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 't1', x: 40, y: 50, rot: 90, front: 45, light: big, lightLock: false }, { id: 't2', x: 40, y: 50, light: big, lightLock: true }, { id: 't3', x: 40, y: 50, light: null }, { id: 't4', x: 40, y: 50, light: big, lightLock: true }] } });
    const wbP = csP.c1.items.m1.whiteboard, csQ = liveP(), chgQ = runPatch(csQ, { campId: 'c1', itemId: 'm1', item: { whiteboard: [{ id: 't1', x: 0, y: 0, rot: 0, front: 0, light: big }, { id: 't2', x: 0, y: 0, light: big, lightLock: true }, { id: 't3', x: 0, y: 0 }, { id: 't4', x: 0, y: 0, light: big }] } });
    check('a player\'s own light: a player\'s copy of the map brings no light in — the patch gate (run for real) moves their own token and takes no light, no change of one, no removal of one and no light lock from it, on a token in play and on a waiting one; a copy that changes nothing but a light changes nothing',
        chgP === true && j(wbP[0]) === j({ id: 't1', isChar: true, ownerId: 'u_p', x: 40, y: 50, rot: 90, front: 45, light: torch, lightLock: true }) && j(wbP[1]) === j({ id: 't2', isChar: true, ownerId: 'u_p', x: 40, y: 50, rot: 0, front: 0 })
        && j(wbP[2]) === j({ id: 't3', isChar: true, ownerId: 'u_p', x: 40, y: 50, rot: 0, front: 0, light: torchOff }) && j(wbP[3]) === j({ id: 't4', waiting: 1, ownerId: 'u_p', x: 40, y: 50 }) && chgQ === false && j(csQ) === j(liveP()), j([chgP, wbP, chgQ]));
    const siA = src.indexOf('function sanitizeItem(');
    const siL = new Function('window', '"use strict";\n' + siSrc() + '\nreturn sanitizeItem;')({});
    const mapS = { id: 'm1', type: 'map', rooms: [], links: [], whiteboard: [
        { id: 'w1', type: 'image', isChar: true, ownerId: 'u_a', x: 1, y: 2, w: 3, h: 4, light: torch, lightLock: true }, { id: 'w2', type: 'image', isChar: true, ownerId: 'u_a', x: 1, y: 2, w: 3, h: 4, light: candleOff },
        { id: 'w3', type: 'image', isChar: true, ownerId: 'u_a', gmInfo: 'secret', sheet: { a: 1 }, x: 1, y: 2, w: 3, h: 4, lightLock: true },
        { id: 'w4', type: 'image', isChar: true, ownerId: 'u_a', hidden: true, x: 1, y: 2, w: 3, h: 4, light: { bright: 9, dim: 9, unit: 'm', name: 'Secret lantern' }, lightLock: true }] };
    const beforeS = j(mapS), outS = siL(mapS); let packedS = true; try { packCheck(outS); } catch (e) { packedS = e.message; }
    const lineC = k => { const i = src.indexOf(k); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); };
    const cleanC = new Function('window', 'cleanWaitingItem', 'sanitizeRichText', '"use strict";\n' + lineC('function cleanHostWbItem(w) {') + '\n' + lineC('function cleanHostLight(w) {') + '\nreturn cleanHostWbItem;')({ wpFogCore: FCx }, H.cleanWaitingItem, t => t);
    const gotC = JSON.parse(j(outS)).whiteboard.map(w => cleanC(w));
    check('a player\'s own light: a player\'s copy of a map (sanitizeItem, run for real) carries a visible token\'s light lock with its light — their menu reads it, also on a token whose GM prep is stripped — and a client keeps both; a hidden token is only a stub with neither its light nor its lock; the host\'s own map is unchanged',
        siA > 0 && outS.whiteboard.length === 4 && outS.whiteboard[0].lightLock === true && j(outS.whiteboard[0].light) === j(torch) && !ownK(outS.whiteboard[1], 'lightLock') && j(outS.whiteboard[1].light) === j(candleOff)
        && outS.whiteboard[2].lightLock === true && !ownK(outS.whiteboard[2], 'gmInfo') && !ownK(outS.whiteboard[2], 'sheet') && j(Object.keys(outS.whiteboard[3]).sort()) === j(['h', 'hidden', 'id', 'layer', 'locked', 'rot', 'type', 'w', 'x', 'y'])
        && !ownK(outS.whiteboard[3], 'light') && !ownK(outS.whiteboard[3], 'lightLock') && !/Secret/.test(j(outS)) && (j(outS).match(/lightLock/g) || []).length === 2 && packedS === true && j(mapS) === beforeS
        && gotC[0].lightLock === true && j(gotC[0].light) === j(torch) && j(gotC[1].light) === j(candleOff) && gotC[2].lightLock === true && !ownK(gotC[3], 'light') && !ownK(gotC[3], 'lightLock'), j(outS.whiteboard));
})());
// Senses S0 (when vision changes): a character's change that moves what its tokens see by re-sends that player's own copy of each fogged map
// it moved on, with no map saved. Run for real: net.js's foglit and sensesmoved slices (sensesSeed, fogCopyFor, net.sensesMoved, sensesFire,
// sensesForget, sensesReset), the real sendItem and broadcastItemFiltered, the real character funnels (chardelta), a player's char-edit and
// char-effect, the effect timers (fxtime), the turn order and the target pointers (combats), the live position relay (bpos) and saveRemoteSoon,
// over the real fog.js (sightSigFor, viewersFor, tokenSightCells, canSeePoint, invalidateSeen, seenKeyOf, lightMoves), fogcore, systemcore and formula engine.
// A player's own move: the pos gate and the patch path (pos, patch, a move put back by snapBack) run for real over the same net, relay and fog —
// an accepted pos that takes the token into another cell or turns it (wpFog.seenKeyOf, read before the write and again after the seat) drops that
// player's set for that map, and every player's set for it where the token carries a light on a dark map (wpFog.lightMoves); one that leaves it
// in its cell and facing as it did drops nothing, but for a light carried inside a wall's cell, which is judged by its exact place; no map is sent
// after it by this fold. The threats branch, net.itemGone, net.kickPlayer and net.syncNewPlayers run for real too; a hidden Sight (sensesHidden) sends
// nothing from the hook to a player whose character stands on that map (sensesReads).
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
    const flS = between('// [netcheck:foglit-start]', '// [netcheck:foglit-end]', 'foglit'), smS = between('// [netcheck:sensesmoved-start]', '// [netcheck:sensesmoved-end]', 'sensesmoved');
    const dlS = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta'), edS = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), fxS = between('// [netcheck:charfx-start]', '// [netcheck:charfx-end]', 'charfx');
    const ftS = between('// [netcheck:fxtime-start]', '// [netcheck:fxtime-end]', 'fxtime'), cbS = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats'), bpS = between('// [netcheck:bpos-start]', '// [netcheck:bpos-end]', 'bpos');
    const siS = siSrc();
    const afS = fnSrc('function anyFog(', '\n}\n', 'anyFog') + '\n}\n', mfS = lineOf('function mapFogged('), svS = lineOf('var _saveSoon = null;') + '\n' + lineOf('function saveRemoteSoon()');
    const nsS2 = between('// [netcheck:newplayerssync-start]', '// [netcheck:newplayerssync-end]', 'newplayerssync'), thS2 = between('// [netcheck:threats-start]', '// [netcheck:threats-end]', 'threats');
    const posS2 = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), patS2 = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch'), clS2 = src.slice(src.indexOf('var POSTURE_SET = '), src.indexOf('function sanitizeItem('));
    const netSrc = ['var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {}, bannedIds = {};', siS, flS, afS, mfS, whole('net.sendItem = function('), whole('net.broadcastItemFiltered = function('), whole('net.itemGone = function('), whole('net.kickPlayer = function('), smS, nsS2, cbS, svS, dlS, ftS, bpS,
        'return { edit: function(msg, conn) {', edS, '}, fx: function(msg, conn) {', fxS, '}, threats: function(msg, conn) {', thS2, '}, sig: function() { return _sensesSig; }, pend: function() { return _sensesPend; }, at: function() { return _sensesAt; }, seed: sensesSeed, fire: sensesFire, forget: sensesForget, reset: sensesReset, pids: sensesPids,',
        'hidden: sensesHidden, drop: sensesDrop, forgetMap: sensesForgetMap, keys: sensesKeys, banned: function() { return bannedIds; }, reads: sensesReads,',
        'targets: typeof broadcastTargets === \'function\' ? broadcastTargets : null, targetsFor: typeof targetsFor === \'function\' ? targetsFor : null,',
        'copy: fogCopyFor, pos: broadcastPos, saveSoon: saveRemoteSoon, turn: turnFxStart, ms: SENSES_RESEND_MS, last: function() { return _lastSent; } };'].join('\n');
    const NAMES = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'peerProfileId', 'lim', 'own', 'pushChat', 'state', 'itemDelta', 'broadcast', '_lastSent', 'setTimeout', 'clearTimeout', 'save', 'toast', 'logEvent', 'renderRoster', 'dropWaitingFor', 'allow', 'render', 'broadcastRoster'];
    // a player's live move and the map copy their app saves after it: the real pos gate and the real patch path, over the same net, fog, relay and save
    const buildPos = new Function('state', 'net', 'window', 'peerPaused', 'allow', 'checkRoomHandouts', 'applyPosToDom', 'broadcastPos', 'toast', 'saveRemoteSoon', 'sendFailed', 'setTimeout', 'playerStroke', 'SC', 'getActiveCampaign', 'bellOut',
        clS2 + ownKeySrc + posS2 + '\n' + patS2 + '\nreturn { pos: function(m, c) { return handlePos(m, c); }, patch: function(m, p) { return applyClientItemFiltered(m, p); } };');
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
        const O = mkW({ maps: ['mL', 'mD'], bare: true }); O.camp.items.mL.whiteboard.push({ id: 'keep', type: 'rect', x: 5000, y: 5000, w: 4000, h: 4000, blocksSight: true }); O.sendAll();   // 80 cells square: over the cap of 6000 cells
        check('senses S0 (the ground): with Lighting off every fogged map reads by sight, a lit one too, and so does a lit map whose walls are over their cap, where no light is judged; where the campaign draws no fog on a map without a play area nothing is kept at all',
            j(dark) === j({ 'u_a|mA': '12', 'u_a|mL': '12', 'u_b|mA': '12', 'u_b|mL': '' }) && FCx.LIMITS.blockerCells === 6000 && j(O.sigs()) === j({ 'u_a|mD': 'L', 'u_a|mL': '12', 'u_b|mD': '', 'u_b|mL': '' }) && j(E.sigs()) === j({}), j([dark, O.sigs(), E.sigs()]));
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
        W.clear(); W.api.turn('mA', cb); const gone = { rows: W.camp.chars.c_a.values.f_fx.length, a1: W.types(W.a1), keys: W.pendKeys(), chat: W.chat.map(m => m.text) };
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
            && /net\.syncCharDelta = function\(id, values\) \{[^\n]*\n    if \(!net\.active \|\| net\.role !== 'host'\) return;\n    if \(net\.sensesMoved\) net\.sensesMoved\(id\);[^\n]*\n    var camp = getActiveCampaign\(\), S = SC\(\); if \(/.test(src)
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
            && /it = fogCopyFor\(it, \(s\.campaigns && s\.campaigns\[camp\.id\]\) \|\| camp, orig, recipientId\);/.test(src) && /function fogCopyFor\(clean, camp, map, recipientId\) \{\n    sensesSeed\(recipientId, camp, map\);\n    var drop = fogDrop\(/.test(src), j([none0, seeded, noName, same, moved]));
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
        W.gm('c_a', 65); W.clear(); W.fire(500);
        const a1 = W.types(W.a1), cm = W.a1.sent.find(m => m.type === 'combats'), tg = W.a1.sent.find(m => m.type === 'targets');
        check('senses S0: when the map sent again holds a combat or is pointed at, the turn order and the target pointers follow it to that player\'s connections only, after the map and as that player may now see them — the orc now in sight by its name, the ogre still Hidden and its pointer left out, never a number of the order',
            j(a1) === j(['item:mA', 'combats', 'targets']) && j(W.types(W.a2)) === j(a1) && quietOthers(W) && !!cm && j(cm.combats.mA.rows) === j([{ id: 'r_a', name: 'Ana', tokId: 'tA', src: null }, { id: 'r_o', name: 'Orc', tokId: 'orc', src: null }, { id: 'h2', name: 'Hidden', tokId: null, src: null }])
            && cm.combats.mA.round === 2 && cm.combats.mA.turn === 1 && !/init/.test(j(cm)) && !!tg && j(tg.targets) === j({ u_a: { mapId: 'mA', id: 'orc', x: 1, y: 2 } }), j([a1, W.types(W.a2), cm, tg]));
        const V = mkW({ maps: ['mA', 'mB', 'mO'] });
        V.net.combats = { mB: { mapId: 'mB', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA2', init: 9, src: null }] } }; V.net.targets = { u_a: { mapId: 'mB', id: 'orc2', x: 1, y: 2 }, u_z: null };
        V.gm('c_a', 64); V.clear(); V.fire(500); const plain = [V.types(V.a1), V.types(V.a2)];
        const X = mkW({ maps: ['mA', 'mO'] }); X.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: rows() } }; X.net.targets = {}; X.gm('c_a', 65); X.clear(); X.a2.open = false; X.fire(500);
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
            const id = wbId === undefined ? 'tA' : wbId, c = W[conn || 'a1'], t = W.tok(id, itemId), was = t ? [t.x, t.y] : null, held0 = W.fog.held();
            try { W.move(c, id, 150, 100, fin, itemId, more); } catch (e) { threw = e.message; }
            return { inv: W.invs(), order: W.ev.filter(e => /^key|^later|^seat|^asked|^inv|^relay/.test(e)), kept: W.kept(), held0, held: W.fog.held(), was, at: t ? [t.x, t.y] : null, turn: t ? [t.rot, t.front] : null, relay: W.ev.filter(e => /^relay/.test(e)), saved: W.ev.filter(e => e === 'saveSoon').length, dropped: W.ev.filter(e => /^dropped/.test(e)).length,
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
        const wallPre = W => { W.win.wpFog.moveBlocked = () => true; }, turnPre = W => { W.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_o', tokId: 'orc' }, { id: 'r_a', tokId: 'tA' }] } }; };
        const limitPre = W => { W.win.wpFog.moveCells = () => 9; W.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', tokId: 'tA' }] } }; W.net.turnMove = { mA: { rowId: 'r_a', tokId: 'tA', moved: 0, allow: 2 } }; };
        const wall = both({ pre: wallPre }), outOfTurn = both({ pre: turnPre }), pastMove = both({ pre: limitPre });
        const refused = [anothers, npcTok, stranger, lockedTok, hiddenTok, plainTok, elsewhere, tablePaused, onePaused, flood].concat(badNums, noSuch);
        check('senses S0: a pos the host refuses empties nothing — all four sets are the very sets they were, the token stays where it stood, nothing is relayed, saved or sent: another player\'s token, a creature\'s, a peer not admitted, a locked or a hidden token, a plain token, a map the player is not on, a paused table, a paused player, the rate limit, a place, turn or facing that is no number, a token or a map that is not there, a page, another campaign; and a move not yet final that a wall, the turn order or the turn\'s move stops',
            refused.length === 29 && refused.every(p => p.length === 2 && p.every(still)) && j(asked) === j(['pA1', 'pA1']) && [wall, outOfTurn, pastMove].every(p => still(p[0])), j([refused, wall[0], outOfTurn[0], pastMove[0]]));
        const back = r => j(r.inv) === j(['inv:mA']) && r.kept === '0101' && j(r.held) === j(['u_a|mO', 'u_b|mO']) && j(r.at) === j([100, 100]) && j(r.relay) === j(['relay:tA:true']) && r.notes === 1 && r.saved === 0 && r.dropped === 0 && j(r.out) === j(zero) && j(r.timers) === j([]) && r.threw === '';
        const wallWarn = one({ pre: W => { wallPre(W); W.camp.turnRules = { walls: 'warn' }; } }, true), asClient = one({ pre: W => { W.net.role = 'client'; } }, true);
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
        const quiet = (r, fin, at) => j(r.inv) === j([]) && r.kept === '1111' && j(r.held) === j(four) && j(r.held0) === j(four) && j(r.relay) === j(['relay:tA:' + fin]) && j(r.at) === j(at) && r.saved === (fin ? 1 : 0) && r.dropped === (fin ? 1 : 0) && r.notes === 0 && j(r.out) === j(zero) && r.threw === '';
        const own = (r, fin, at) => lands(r, 'inv:mA>u_a', '0111', less('u_a|mA'), 'relay:tA:' + fin, at) && r.saved === (fin ? 1 : 0);
        const every = (r, fin, at) => lands(r, 'inv:mA>undefined', '0101', ['u_a|mO', 'u_b|mO'], 'relay:tA:' + fin, at) && r.saved === (fin ? 1 : 0);
        const pair = (p, f, at) => p.length === 2 && f(p[0], false, at) && f(p[1], true, at);
        // Ana's token is 50 across on cells 50 across and stands at 100, 100: its centre is in its cell from 75 up to, and not at, 125
        const inCell = [[100, 100], [75, 75], [124, 124], [110, 80], [124.9, 75]], pastEdge = [[125, 100], [74, 100], [100, 125], [100, 74], [125, 125]];
        const stays = inCell.map(p => to(null, p[0], p[1])), steps = pastEdge.map(p => to(null, p[0], p[1]));
        const sameWay = to(null, 110, 110, { rot: 30, front: -30 }), sameWay2 = to({ pre: W => { W.tok('tA').rot = 90; W.tok('tA').front = 45; } }, 110, 110, { rot: 45, front: 90 });
        const turns = [{ rot: 90 }, { front: 45 }, { rot: -1 }, { rot: 30, front: 30 }, { rot: 360 }].map(m => to(null, 100, 100, m));
        check('senses S0: a pos that leaves a player\'s token in its cell and facing as it did empties no set (the real pos gate over the real seenKeyOf) — the four sets of two players on two maps are the very sets they were, mid-drag and at a final move alike, wherever in its cell the token is put, up to the cell\'s edge, and where its turn and its facing changed and add up to the way it faced; the move is written, relayed and saved as ever; one step past the edge, along either axis or both, empties the mover\'s set for that map and no other, and so does a turn on the spot, by its turn, by its facing or by both',
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

        // a final move is seated by the host: a stand-in that seats the token in a cell of its choosing
        const seatAt = (x, y, more) => W => { if (more) more(W); W.win.wpSeatHex = (w, map) => { W.ev.push('seat:' + w.id + ':' + (map && map.id)); w.x = x; w.y = y; return true; }; };
        const keyPre = W => { const real = W.win.wpFog.seenKeyOf; W.win.wpFog.seenKeyOf = (m, w) => { const k = real(m, w); W.ev.push('key:' + (m && m.id) + ':' + w.x + ',' + w.y + ',' + w.rot + ',' + w.front + '=' + k); return k; }; };
        const seatOut = to({ pre: seatAt(300, 100) }, 110, 110), seatIn = to({ pre: seatAt(100, 100) }, 150, 100), seatLit = to({ pre: seatAt(300, 100, lit) }, 110, 110), seatLitIn = to({ pre: seatAt(100, 100, lit) }, 150, 100);
        const readAt = to({ pre: seatAt(300, 100, keyPre) }, 110, 110, { rot: 90, front: 45 }), readStay = to({ pre: keyPre }, 110, 110);
        check('senses S0: a final move is judged by where the host seated the token, not by the place the pos named — a pos into its own cell that the seat carries into another cell empties its player\'s set (every player\'s for that map where it carries a light on a dark map), and a pos into another cell that the seat carries back into its own cell empties nothing; a move not yet final is not seated and is judged by the place it named; the token stands where it was seated',
            quiet(seatOut[0], false, [110, 110]) && own(seatOut[1], true, [300, 100]) && j(seatOut[1].order) === j(['later:50', 'seat:tA:mA', 'inv:mA>u_a', 'relay:tA:true']) && own(seatIn[0], false, [150, 100]) && quiet(seatIn[1], true, [100, 100]) && j(seatIn[1].order) === j(['later:50', 'seat:tA:mA', 'relay:tA:true'])
            && quiet(seatLit[0], false, [110, 110]) && every(seatLit[1], true, [300, 100]) && every(seatLitIn[0], false, [150, 100]) && quiet(seatLitIn[1], true, [100, 100]), j([seatOut, seatIn, seatLit, seatLitIn]));
        check('senses S0: the gate reads where the token sees and lights from twice at an accepted pos and at no other moment — first of the token as it stood and faced, before the new place and facing are written, then of the token as it now stands and faces, after a final move was seated; a set is emptied only after the second reading and before the move is relayed, and where the two readings are the same none is',
            j(readAt.map(r => r.order)) === j([['key:mA:100,100,0,0=2,2|2,2|0', 'key:mA:110,110,90,45=2,2|2,2|135', 'inv:mA>u_a', 'relay:tA:false'], ['key:mA:100,100,0,0=2,2|2,2|0', 'later:50', 'seat:tA:mA', 'key:mA:300,100,90,45=6,2|6,2|135', 'inv:mA>u_a', 'relay:tA:true']])
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
        const wallsOf = n => W => { W.camp.items.mA.fog.vision = Object.assign({}, narrow); W.camp.items.mA.whiteboard.push({ id: 'keep', type: 'rect', x: 5000, y: 5000, w: n * 50, h: n * 50, blocksSight: true }); };   // 70 cells square is under the cap of 6000 cells, 80 is over it
        const askPre = W => { const real = W.win.wpFog.lightMoves; W.win.wpFog.lightMoves = m => { const v = real(m); W.ev.push('asked:' + (m && m.id) + '=' + v); return v; }; };
        const step = (pre, fin, more) => one({ pre: fresh(pre) }, fin, 'a1', 'tA', 'mA', Object.assign({ x: 150, y: 100 }, more || {})), asks = r => r.order.filter(e => /^asked/.test(e)).join();
        const darkAs = [lightIs('dark'), lampOn(), wallsOf(70)], notDark = [lightIs('bright'), lightIs('dim'), lightIs(''), lampOn({ hidden: true }), lampOn({ gmNoteFor: 'u_a' }), W => { W.feats.lighting = false; }, wallsOf(80)];
        const places = darkAs.concat(notDark), when = i => i % 2 === 1, bearer = places.map((st, i) => step(W => { lit(W); st(W); askPre(W); }, when(i))), plain = places.map((st, i) => step(W => { st(W); askPre(W); }, !when(i)));
        const bearerToo = [step(W => { lit(W); askPre(W); }, true), step(W => { lit(W); bright(W); askPre(W); }, false)];
        const bearerOff = [step(W => { litOff(W); }, false), step(W => { litOff(W); bright(W); }, true)], bearerTurn = [step(lit, true, { x: 100, rot: 90 }), step(W => { lit(W); bright(W); }, false, { x: 100, rot: 90 })];
        const bearerStay = step(W => { lit(W); askPre(W); }, true, { x: 110, y: 110 });
        check('senses S0: a token that carries a light and moves into another cell empties every player\'s set for that map only where a light that moves changes what is seen there (the real pos gate over the real lightMoves) — on a map set dark, on one left to itself that holds a placed light source, and on a dark map whose walls are under their cap: of two players\' sets on two maps both of that map go and both of the other map stay; on a bright map, a dim one, one left to itself with no light source placed or with only a hidden one or a GM\'s note, with Lighting switched off, and on a dark map whose walls are over their cap, the mover\'s set for that map goes alone and the three others are the very sets they were; a light switched off and a turn on the spot alike; mid-drag and at a final move',
            FCx.LIMITS.blockerCells === 6000 && places.length === 10 && bearer.every((r, i) => (i < 3 ? every : own)(r, when(i), [150, 100])) && every(bearerToo[0], true, [150, 100]) && own(bearerToo[1], false, [150, 100])
            && every(bearerOff[0], false, [150, 100]) && own(bearerOff[1], true, [150, 100]) && every(bearerTurn[0], true, [100, 100]) && own(bearerTurn[1], false, [100, 100]), j([bearer, bearerToo, bearerOff, bearerTurn]));
        check('senses S0: a token without a light empties its player\'s set alone on every one of those maps, dark or not, and whether a light would move anything there is not even asked; for a light-bearer it is asked once, of the map the token stands on, after the move was written and before a set is emptied, and not at all where the token stayed in its cell and facing as it did',
            plain.length === 10 && plain.every((r, i) => own(r, !when(i), [150, 100]) && asks(r) === '') && bearer.every((r, i) => asks(r) === 'asked:mA=' + (i < 3))
            && j(bearerToo.map(r => r.order)) === j([['later:50', 'asked:mA=true', 'inv:mA>undefined', 'relay:tA:true'], ['asked:mA=false', 'inv:mA>u_a', 'relay:tA:false']])
            && quiet(bearerStay, true, [110, 110]) && asks(bearerStay) === '', j([plain, bearer.map(asks), bearerToo.map(r => r.order), bearerStay]));
        const olderLit = [undefined, null, 0].map((v, i) => step(W => { lit(W); bright(W); if (v === undefined) delete W.win.wpFog.lightMoves; else W.win.wpFog.lightMoves = v; }, when(i)));
        const olderPlain = step(noMoves(bright), true), olderDark = step(noMoves(lit), false);
        check('senses S0: with a fog module that does not say whether a light moves anything, a light-bearer\'s move into another cell empties every player\'s set for that map, on a bright map as on a dark one, as the host did before; a token without a light empties its player\'s alone; nothing is thrown',
            olderLit.length === 3 && olderLit.every((r, i) => every(r, when(i), [150, 100])) && own(olderPlain, true, [150, 100]) && every(olderDark, false, [150, 100]), j([olderLit, olderPlain, olderDark]));
        // a map nothing was worked out for yet: whether its walls are over their cap is counted by the question itself
        const unread = (n, fin) => one({ pre: older(W => { W.camp.items.mX = M('mX', 5, null, [T('tX', 'u_a', 'c_a', 2, 2, { light: Object.assign({}, torch) }), { id: 'keep', type: 'rect', x: 5000, y: 5000, w: n * 50, h: n * 50, blocksSight: true }]); }) }, fin, 'a1', 'tX', 'mX');
        const unreadOver = unread(80, true), unreadUnder = unread(70, false);
        check('senses S0: whether a light that moves changes what is seen is judged on the walls as they are counted at that moment — on a dark map nothing was worked out for yet, with a fog module that gives no text, a light-bearer\'s move names the mover alone where the walls are over their cap and every player where they are under it; the sets of the other maps are the very sets they were',
            lands(unreadOver, 'inv:mX>u_a', '1111', four, 'relay:tX:true') && lands(unreadUnder, 'inv:mX>undefined', '1111', four, 'relay:tX:false'), j([unreadOver, unreadUnder]));

        // a light carried inside a wall's cell is seated beside the wall by where the token stands in the cell: there the text holds the exact place.
        // Ana's token is put with its centre 20 to the left of and 10 above the middle of its cell, and moves 24 to the right inside that cell; the walls
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
            /var pOut = \{\}, changed = applyClientItemFiltered\(msg, profile, pOut\);\n            if \(changed\) \{\n(?:                [^\n]*\n){3,6}                saveRemoteSoon\(\);\n                if \(window\.wpFog && window\.wpFog\.invalidateSeen\) window\.wpFog\.invalidateSeen\(msg\.itemId\);[^\n]*\n                net\.sendItem\(msg\.campId, msg\.itemId, null, pOut\.strokes \? null : conn\);[^\n]*\n            \}\n            \/\/ \[netcheck:itempatch-end\]\n        \} else \{\n            applyItem\(msg\);/.test(src)
            && (srcC.match(/invalidateSeen\(/g) || []).length === 7 && j((srcC.match(calls) || []).sort()) === j(['invalidateSeen(id)', 'invalidateSeen(itemId)', 'invalidateSeen(map.id)', 'invalidateSeen(msg.itemId)', 'invalidateSeen(msg.itemId)', 'invalidateSeen(msg.itemId)', ownMove]) && !/invalidateSeen\(\s*\)/.test(srcC)
            && count1(flS, /invalidateSeen\(map\.id\)/g) && count1(whole('net.broadcastItemFiltered = function('), /invalidateSeen\(itemId\)/g) && count1(smS, /invalidateSeen\(/g) && count1(smS, /invalidateSeen\(id\)/g) && count1(posS2, /invalidateSeen\(msg\.itemId\)/g) && posC.split(ownMove).length === 2 && count1(posS2, /invalidateSeen\(msg\.itemId,/g) && count1(thS2, /invalidateSeen\(msg\.itemId\)/g)
            && (srcC.match(/seenKeyOf/g) || []).length === 5 && (posC.match(/seenKeyOf/g) || []).length === 3 && (between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove').replace(/\/\/[^\n]*/g, '').match(/seenKeyOf/g) || []).length === 2 && (srcC.match(/lightMoves/g) || []).length === 2 && (posC.match(/lightMoves/g) || []).length === 2
            && posC.split('\n').map(l => l.trim()).filter(l => l).join('\n').indexOf([
                'if (window.wpHistFlush) window.wpHistFlush();',
                'var skW = window.wpFog && window.wpFog.seenKeyOf ? window.wpFog.seenKeyOf(map, w) : null;',
                'w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;',
                'if (msg.final) setTimeout(function() { checkRoomHandouts(map); }, 50);',
                'if (msg.final && window.wpSeatHex && window.wpSeatHex(w, map)) { msg = Object.assign({}, msg, { x: w.x, y: w.y }); }',
                'var skN = skW === null ? null : window.wpFog.seenKeyOf(map, w), mvW = skW === null || skN !== skW;',
                'if (window.wpFog && window.wpFog.invalidateSeen && mvW) window.wpFog.' + ownMove + ';',
                'msg = { type: \'pos\', campId: msg.campId, itemId: msg.itemId, wbId: msg.wbId, x: msg.x, y: msg.y, rot: msg.rot, front: msg.front, final: msg.final === true };',
                'applyPosToDom(msg);',
                'broadcastPos(msg, conn, camp, map, w);'].join('\n')) > 0
            && /\nfunction snapBack\(camp, map, w, msg, to\) \{[^\n]*\n[^\n]*\n    w\.x = to\.x; w\.y = to\.y;\n    if \(window\.wpFog && window\.wpFog\.invalidateSeen\) window\.wpFog\.invalidateSeen\(msg\.itemId\);[^\n]*\n    var back = /.test(src), j(srcC.match(calls)));
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
        const hid = (system, fog) => W.api.hidden(campOf2(system, fog));
        const plainOnes = [hid(sysS), hid(sysVis), hid(sysGm, { fields: {} }), hid(sysGm, { fields: { sight: '' } }), hid(sysGm, { fields: { sight: 5 } }), hid(sysGm, { fields: null }), hid(sysGm, null), hid(sysGm, 'f_sight'), hid(null), hid(sysGm, { fields: { sight: 'f_nothing' } }), hid(sysDer, { fields: { sight: 'f_base' } }), W.api.hidden(null), W.api.hidden(undefined)];
        const hiddenOnes = [hid(sysGm), hid(sysDer), hid(sysDeep), hid(sysGmForm), hid(sysDer, { fields: { sight: 'f_g' } })], pool = hid(sysPool), poolCounts = Sx.gmDerivedNames(sysPool, Fx, ['Sight']).length > 0;
        const broken = [[() => null], [() => ({})], [() => Object.assign({}, Sx, { gmDerivedNames: undefined })], [() => Object.assign({}, Sx, { fieldById: undefined })], [() => Object.assign({}, Sx, { gmDerivedNames() { throw new Error('no'); } })], [() => Object.assign({}, Sx, { fieldById() { throw new Error('no'); } })], [null, true]].map(([sc, noF]) => {
            const V = mkW({ maps: ['mA'] }); if (sc) V.SC = sc; if (noF) delete V.win.wpFormula; let r; try { r = [V.api.hidden(campOf2(sysVis)), V.api.hidden(campOf2(sysVis, { fields: {} })), V.api.hidden(campOf2(sysVis, { fields: { sight: 5 } })), V.api.hidden(campOf2(sysVis, { fields: { sight: ['f_sight'] } })), V.api.hidden(campOf2(null))]; } catch (e) { r = 'threw: ' + e.message; } return r; });
        const ownRule = (() => { const V = mkW({ maps: ['mA'] }); V.SC = () => Object.assign({}, Sx, { gmDerivedNames: () => [] }); return [V.api.hidden(campOf2(sysGm)), V.api.hidden(campOf2(sysGmForm)), V.api.hidden(campOf2(sysVis)), V.api.hidden(campOf2(sysDer))]; })();
        check('senses S0: whether the campaign\'s Sight is hidden from players (sensesHidden, over the real character system and formula engine) — not with no field mapped, a mapped name that is no field, a number players see or a formula over values they see; hidden where the field is GM-only, a number or a formula, and where a formula players see reads a GM-only value, itself or through another formula, or is a pool whose full value reads one',
            plainOnes.every(v => v === false) && hiddenOnes.every(v => v === true) && pool === true && poolCounts === true, j([plainOnes, hiddenOnes, pool, poolCounts]));
        check('senses S0: where that cannot be judged — no character system on hand, one without the means, no formula engine, or an error while judging — a mapped Sight counts as hidden; with no field mapped, a mapped name that is not text or no character system in the campaign it never does; a GM-only field is hidden by its own mark, whatever the engine says of it',
            broken.every(r => j(r) === j([true, false, false, false, false])) && j(ownRule) === j([true, true, false, false]), j([broken, ownRule]));
        const sent = V => ({ made: V.made(500), inv: V.invs(), pend: V.pendKeys(), fired: V.fire(500), items: V.itemsOut(), sig: V.sigs()['u_a|mA'], at: V.ats()['u_a|mA'], fog: V.net.conns.map(c => c.sent.filter(m => m.type === 'combats' || m.type === 'targets').length) });
        const prime = system => { const V = mkW({ maps: ['mA', 'mO'], system }); V.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA', init: 3, src: null }] } }; V.net.sensesMoved(null); V.clear(); return V; };
        const hv = prime(sysVis); hv.api.edit(EDIT('f_base', 55), hv.a1); const seenOut = sent(hv);
        const hd = prime(sysDer); hd.api.edit(EDIT('f_base', 55), hd.a1); const derTypes = hd.types(hd.a1), derOut = sent(hd);
        const hg = prime(sysGm); hg.gm('c_a', 70); const gmOut = sent(hg); hg.ev.length = 0; hg.gm('c_a', 70); hg.net.sensesMoved(null); const gmAgain = sent(hg);
        const hn = prime(sysDer); hn.SC = () => null; hn.camp.chars.c_a.values.f_base = 55; hn.net.sensesMoved('c_a'); const blindOut = sent(hn);
        check('senses S0: with a hidden Sight a change that moves it sets no send and sends no map, turn order or pointer to anyone, at once or later — a player\'s own edit of a value the hidden formula reads, the GM\'s change of a GM-only number, a Sight that cannot be judged — though that map\'s set is still emptied when the host\'s own text moved, once; the same edit with a Sight players see queues and sends their map',
            j(seenOut) === j({ made: 1, inv: ['inv:mA'], pend: ['u_a|mA'], fired: 1, items: [1, 1, 0, 0, 0], sig: '13', at: '13', fog: [1, 1, 0, 0, 0] }) && j(derTypes) === j(['char-ack', 'charDelta'])
            && [derOut, blindOut].every(r => j(r) === j({ made: 0, inv: ['inv:mA'], pend: [], fired: 0, items: [0, 0, 0, 0, 0], sig: '12', at: '13', fog: [0, 0, 0, 0, 0] })) && j(gmOut) === j({ made: 0, inv: ['inv:mA'], pend: [], fired: 0, items: [0, 0, 0, 0, 0], sig: '12', at: '14', fog: [0, 0, 0, 0, 0] })
            && j(gmAgain) === j({ made: 0, inv: [], pend: [], fired: 0, items: [0, 0, 0, 0, 0], sig: '12', at: '14', fog: [0, 0, 0, 0, 0] }), j([seenOut, derTypes, derOut, gmOut, gmAgain, blindOut]));
        const late = prime(sysS); late.gm('c_a', 70); const lateKeys = late.pendKeys(); late.clear(); late.camp.system = sysGm; const lateOut = sent(late), lateLeft = late.pendKeys();
        const ctl = prime(sysS); ctl.gm('c_a', 70); ctl.clear(); const ctlOut = sent(ctl);
        const next = prime(sysGm); next.gm('c_a', 70); next.clear(); next.net.sendItem('k', 'mA'); const nextOut = [next.items(next.a1), next.sigs()['u_a|mA']];
        check('senses S0: a send already waiting when the Sight becomes hidden sends nothing when it fires and waits no longer; the player\'s copy follows at the next ordinary send of that map, made by the real sight',
            j(lateKeys) === j(['u_a|mA']) && lateOut.fired === 1 && j(lateOut.items) === j([0, 0, 0, 0, 0]) && j(lateOut.fog) === j([0, 0, 0, 0, 0]) && lateOut.sig === '12' && j(lateLeft) === j([]) && ctlOut.fired === 1 && j(ctlOut.items) === j([1, 1, 0, 0, 0]) && ctlOut.sig === '14'
            && j(nextOut) === j([['mA:tA+orc'], '14']), j([lateOut, lateLeft, ctlOut, nextOut]));
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

        // rows no send waits for: what a copy was made by with the text last known, kept since the copy was made; and the text last known alone, kept where the
        // Sight is hidden (the hook records what it saw and sends nothing to a player whose own character stands there)
        const O = mkW({ maps: ['mA', 'mO'] }), o0 = [Object.keys(O.sigs()), Object.keys(O.ats()), O.pendKeys()]; O.api.forgetMap('mA'); const o1 = [Object.keys(O.sigs()), Object.keys(O.ats())]; O.api.forget('u_a'); const o2 = [Object.keys(O.sigs()), Object.keys(O.ats())]; O.api.reset(); const o3 = [Object.keys(O.sigs()), Object.keys(O.ats())];
        const sysHid = Sx.cleanSystem({ v: 1, name: 'H', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'gm' }] }, { F: Fx, gmView: true });
        const hidW = () => { const V = mkW({ maps: ['mA', 'mO'], bare: true, system: sysHid }); V.net.sensesMoved(null); return V; }, rowsOf = V => [Object.keys(V.sigs()), Object.keys(V.ats()), V.pendKeys()];
        const h0 = rowsOf(hidW()), hMap = (() => { const V = hidW(); V.api.forgetMap('mA'); return rowsOf(V); })(), hPid = (() => { const V = hidW(); V.api.forget('u_a'); return rowsOf(V); })(), hAll = (() => { const V = hidW(); V.api.reset(); return rowsOf(V); })(), hGone = (() => { const V = hidW(); V.net.itemGone('k', 'mO'); return rowsOf(V); })();
        check('senses S0: a row no send waits for is dropped like any other — what a copy was made by and the text last known, both kept from the moment the copy is made, before the hook ever ran; and the text last known alone, kept where a hidden Sight sent a player with a character there nothing: by map, by player, by a map that left the table, and all of them for a new table',
            j(o0) === j([['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], ['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], []]) && j(o1) === j([['u_a|mO', 'u_b|mO'], ['u_a|mO', 'u_b|mO']]) && j(o2) === j([['u_b|mO'], ['u_b|mO']]) && j(o3) === j([[], []])
            && j(h0) === j([[], ['u_a|mA', 'u_a|mO', 'u_b|mA', 'u_b|mO'], ['u_a|mO']]) && j(hMap) === j([[], ['u_a|mO', 'u_b|mO'], ['u_a|mO']]) && j(hPid) === j([[], ['u_b|mA', 'u_b|mO'], []]) && j(hAll) === j([[], [], []]) && j(hGone) === j([[], ['u_a|mA', 'u_b|mA'], []]), j([o0, o1, o2, o3, h0, hMap, hPid, hAll, hGone]));

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

    // 25. a hidden Sight is judged per player and map: only a token that stands for a character reads the campaign's Sight field (sensesReads)
    {
        const W = mkW({ maps: ['mA'], bare: true }), rd = (camp, m, pid) => { try { return W.api.reads(camp, m, pid); } catch (e) { return 'threw: ' + e.message; } };
        const chars = { c_a: { id: 'c_a' }, c_b: { id: 'c_b' } }, mp = wb => ({ id: 'm', type: 'map', whiteboard: wb }), cp = ch => ({ id: 'k', chars: ch });
        const tok = (owner, charId, more) => Object.assign({ id: 't', isChar: true, ownerId: owner }, charId === undefined ? {} : { charId }, more || {});
        const one = (t, pid, ch) => rd(cp(ch === undefined ? chars : ch), mp([t]), pid || 'u_a');
        const yes = [one(tok('u_a', 'c_a')), rd(cp(chars), mp([null, 0, '', tok('u_b', 'c_b'), tok('u_a'), tok('u_a', 'c_zz'), tok('u_a', 'c_a')]), 'u_a'), one(tok('u_a', 'c_b')), one(tok('u_a', 'c_a', { hidden: true })), one(tok('u_b', 'c_b'), 'u_b')];
        const waitingTok = one(tok('u_a', undefined, { isChar: false, waiting: 1 })), plainTok = [one(tok('u_a')), one(tok('u_a', ''))], anothers = [one(tok('u_b', 'c_b')), one(tok('u_b', 'c_a')), one(tok('', 'c_a')), one(tok(undefined, 'c_a')), one(tok('u_a2', 'c_a')), one(tok('xu_a', 'c_a'))];
        const noChar = [one(tok('u_a', 'c_zz')), one(tok('u_a', 'C_A')), one(tok('u_a', 'c_a '))], protoNames = ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf'].map(n => one(tok('u_a', n)));
        const notText = [one(tok('u_a', 5), 'u_a', { 5: { id: 5 } }), one(tok('u_a', true), 'u_a', { true: {} }), one(tok('u_a', ['c_a'])), one(tok('u_a', { toString: () => 'c_a' })), one(tok('u_a', null), 'u_a', { null: {} })];
        const heir = one(tok('u_a', 'c_a'), 'u_a', Object.create({ c_a: { id: 'c_a' } }));
        const noChars = [undefined, null, 0, 5, true, '', 'c_a', () => {}].map(ch => rd({ id: 'k', chars: ch }, mp([tok('u_a', 'c_a')]), 'u_a')).concat([rd({ id: 'k' }, mp([tok('u_a', 'c_a')]), 'u_a'), rd({ id: 'k', chars: 'abc' }, mp([tok('u_a', '0')]), 'u_a'), rd({ id: 'k', chars: 'abc' }, mp([tok('u_a', 'length')]), 'u_a')]);
        const noList = [undefined, null, 0, 'text', 5, true, { 0: tok('u_a', 'c_a'), length: 1 }, { whiteboard: [tok('u_a', 'c_a')] }].map(wb => rd(cp(chars), mp(wb), 'u_a')).concat([rd(cp(chars), mp([]), 'u_a'), rd(cp(chars), { id: 'm', type: 'map' }, 'u_a'), rd(cp(chars), mp([null, undefined, 0, '', false]), 'u_a')]);
        const no = [waitingTok].concat(plainTok, anothers, noChar, protoNames, notText, [heir], noChars, noList);
        check('senses S0: whether a player\'s token on a map reads the campaign\'s Sight field at all (sensesReads, run for real) — only a token of that player\'s, on that map, whose character is one the campaign holds under its own name (shown or hidden, among others that do not count); never a waiting token, a plain token, another player\'s token or a creature\'s, a character the campaign does not hold, a name of the prototype or one only inherited, a name that is not text, a campaign whose characters are missing or are no object, a map whose items are no list or an empty one; nothing is thrown',
            yes.length === 5 && yes.every(v => v === true) && no.length === 45 && no.every(v => v === false), j([yes, no]));

        const sysHid = Sx.cleanSystem({ v: 1, name: 'H', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'gm' }] }, { F: Fx, gmView: true });
        // the two sides of one rule: the token that reads no Sight field for the host's hook (sensesReads) is the token fog.js gives the campaign's default
        const Wt = mkW({ maps: ['mA'], bare: true }); Wt.camp.chars[5] = { id: 5, name: 'Five', values: { f_sight: 100 } }; Wt.camp.chars = Object.assign(Object.create({ c_heir: { id: 'c_heir', name: 'Heir', values: { f_sight: 100 } } }), Wt.camp.chars);
        const sees = charId => { const t = T('tX', 'u_a', null, 2, 2); if (charId !== undefined) t.charId = charId; let c; try { c = Wt.fog.tokenSightCells(t, Wt.camp.items.mA, Wt.camp); } catch (e) { c = 'threw: ' + e.message; } return [c, rd(Wt.camp, { id: 'm', type: 'map', whiteboard: [t] }, 'u_a')]; };
        const ownChar = [sees('c_a'), sees('5')], noOwn = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'c_heir', 'c_zz', '', 5, true, ['c_a'], { toString: () => 'c_a' }, null, undefined].map(sees);
        const charsFn = Object.assign(() => {}, { c_a: { id: 'c_a', name: 'Ana', values: { f_sight: 100 } } });
        const listless = [[undefined], [null], ['c_a'], [5], [true], [charsFn], ['abc', 'length'], ['abc', '0']].map(a => { const t = T('tX', 'u_a', a[1] || 'c_a', 2, 2), camp = Object.assign({}, Wt.camp, { chars: a[0] }); let c; try { c = Wt.fog.tokenSightCells(t, Wt.camp.items.mA, camp); } catch (e) { c = 'threw: ' + e.message; } return [c, rd(camp, { id: 'm', type: 'map', whiteboard: [t] }, 'u_a')]; });
        check('senses S0: the host\'s hook and the fog agree on which token reads the campaign\'s Sight field (sensesReads beside the real tokenSightCells) — a token whose character the campaign holds under its own name sees by that character\'s Sight (60 ft is 12 cells, 100 ft is 20) and counts as reading it; a name the list only inherits, a name of the prototype, a name that is not text, a character the campaign does not hold or a campaign whose characters are missing or are no object (a text or a function with names of its own) stands for no character: that token sees by the campaign\'s default (30 ft, 6 cells) and reads nothing; nothing is thrown',
            j(ownChar) === j([[12, true], [20, true]]) && noOwn.length === 14 && noOwn.every(v => j(v) === j([6, false])) && listless.length === 8 && listless.every(v => j(v) === j([6, false])), j([ownChar, noOwn, listless]));
        // mW: Bo's waiting token, an orc 3 cells off; mP: Bo's plain token, an orc 8 cells off (the default sight is 30 ft, 6 cells, then 50 ft, 10 cells)
        const mkH = system => {
            const V = mkW({ maps: ['mA', 'mO'], bare: true, system });
            V.camp.items.mW = M('mW', 5, null, [T('tw', 'u_b', '', 2, 2, { isChar: false, waiting: 1 }), T('orcW', '', 'c_n', 5, 2)]); V.camp.items.mP = M('mP', 5, null, [T('tp', 'u_b', '', 2, 2), T('orcP', '', 'c_n', 10, 2)]);
            V.camp.newPlayers = { token: true, sight: false }; V.net.tidyWaiting = () => {}; V.sendAll(); V.net.syncNewPlayers(); V.clear();
            V.change = () => { V.camp.newPlayers = { token: true, sight: true }; V.camp.chars.c_a.values.f_sight = 70; V.camp.chars.c_b.values.f_sight = 70; V.camp.fog.defaults.sight = 50; V.net.syncNewPlayers(); };
            V.maps = c => c.sent.filter(m => m.type === 'item').map(m => m.itemId + ':' + m.item.whiteboard.map(w => w.id).join('+'));
            return V;
        };
        const H = mkH(sysHid), held0 = [H.sigs()['u_b|mW'], H.sigs()['u_b|mP'], H.sigs()['u_a|mA'], H.api.hidden(H.camp)]; H.change();
        const hNow = { pend: H.pendKeys(), made: H.made(500), inv: H.invs().filter((e, i, l) => l.indexOf(e) === i).sort(), at: H.ats(), now: H.itemsOut() }, hFired = H.fire(500), hOut = { a1: H.maps(H.a1), a2: H.maps(H.a2), b1: H.maps(H.b1), sig: H.sigs(), left: H.pendKeys() };
        H.clear(); H.net.sensesMoved(null); const hAgain = [H.pendKeys(), H.invs(), H.itemsOut()];
        const V0 = mkH(sysS); V0.change(); const vNow = V0.pendKeys(); V0.fire(500); const vOut = { a1: V0.maps(V0.a1), b1: V0.maps(V0.b1) };
        check('senses S0: with a hidden Sight nothing is queued or sent only to a player who owns a character\'s token on that map — at one and the same call (the rule \'a waiting token sees\' switched on through the real net.syncNewPlayers, the campaign\'s default sight raised, two characters\' hidden Sight changed) the player whose only token on a map is a waiting one, or a plain one, is sent that map with what it now sees, while no map with a character\'s token on it is queued or sent to its player; the host still empties each of those maps\' sets and records the text it saw; with a Sight players see the same call sends every map that moved',
            j(held0) === j(['', '6', '12', true]) && j(hNow) === j({ pend: ['u_b|mP', 'u_b|mW'], made: 2, inv: ['inv:mA', 'inv:mO', 'inv:mP', 'inv:mW'], at: { 'u_a|mA': '14', 'u_a|mO': '', 'u_a|mP': '', 'u_a|mW': '', 'u_b|mA': '14', 'u_b|mO': '14', 'u_b|mP': '10', 'u_b|mW': '10' }, now: [0, 0, 0, 0, 0] }) && hFired === 2
            && j(hOut) === j({ a1: [], a2: [], b1: ['mW:tw+orcW', 'mP:tp+orcP'], sig: { 'u_a|mA': '12', 'u_a|mO': '', 'u_a|mP': '', 'u_a|mW': '', 'u_b|mA': '12', 'u_b|mO': '12', 'u_b|mP': '10', 'u_b|mW': '10' }, left: [] }) && j(hAgain) === j([[], [], [0, 0, 0, 0, 0]])
            && j(vNow) === j(['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_b|mP', 'u_b|mW']) && j(vOut) === j({ a1: ['mA:tA+orc'], b1: ['mA:tB', 'mO:tB2+orc3', 'mW:tw+orcW', 'mP:tp+orcP'] }), j([held0, hNow, hFired, hOut, hAgain, vNow, vOut]));
        // the same at the fire: the sends were queued while players saw the Sight, which is hidden by the time they fire
        const L = mkH(sysS); L.change(); const lKeys = L.pendKeys(); L.camp.system = sysHid; L.clear(); const lFired = L.fire(500), lOut = { a1: L.maps(L.a1), a2: L.maps(L.a2), b1: L.maps(L.b1), rest: L.net.conns.map(c => c.sent.filter(m => m.type !== 'item').length), left: L.pendKeys(), sig: [L.sigs()['u_a|mA'], L.sigs()['u_b|mA'], L.sigs()['u_b|mO'], L.sigs()['u_b|mW'], L.sigs()['u_b|mP']] };
        // a player with a character's token and a waiting token on one map: the character's token reads the hidden Sight, so nothing is sent
        const X = mkH(sysHid); X.camp.items.mW.whiteboard.push(T('tB9', 'u_b', 'c_b', 2, 4)); X.sendAll(); X.change(); const xNow = [X.pendKeys(), X.api.reads(X.camp, X.camp.items.mW, 'u_b'), X.api.reads(X.camp, X.camp.items.mW, 'u_a'), X.api.reads(X.camp, X.camp.items.mP, 'u_b')];
        check('senses S0: the same when a send fires — queued while players could see the Sight, which is hidden by the time it fires, a map with a character\'s token of that player on it is not sent and waits no longer, while the map their waiting or plain token stands on is; and a player with both a character\'s token and a waiting token on one map is sent nothing of it',
            j(lKeys) === j(['u_a|mA', 'u_b|mA', 'u_b|mO', 'u_b|mP', 'u_b|mW']) && lFired === 5 && j(lOut) === j({ a1: [], a2: [], b1: ['mW:tw+orcW', 'mP:tp+orcP'], rest: [0, 0, 0, 0, 0], left: [], sig: ['12', '12', '12', '10', '10'] })
            && j(xNow) === j([['u_b|mP'], true, false, false]), j([lKeys, lFired, lOut, xNow]));
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
            && /var n = net\(\); if \(n && n\.syncSystem\) n\.syncSystem\(\);\n    if \(n && n\.active && n\.role === 'host' && n\.sensesMoved\) n\.sensesMoved\(null\);/.test(sheetsT) && (sheetsT.match(/n\.sensesMoved\(null\)/g) || []).length === 2 && (sheetsT.match(/sensesMoved/g) || []).length === 4
            && /if \(hosting\) \{ window\.wpNet\.applyingRemote = true; save\(true\); window\.wpNet\.applyingRemote = false; if \(window\.wpFog\) window\.wpFog\.invalidateVision\(\); if \(window\.wpNet\.sendItem\) window\.wpNet\.sendItem\(camp\.id, item\.id\);/.test(ioT));
        const dmT = read('datamap.js'), posCode = posS2.replace(/\/\/[^\n]*/g, ''), patCode = patS2.replace(/\/\/[^\n]*/g, '');
        check('senses S0 (source): nothing new comes in from a player — no branch of the host\'s message handler was added or names sight or senses, the hook and its timer read nothing of a message or of a connection\'s word, and what is kept (what a copy was made by, the text last known, the sends that wait) is never saved or sent: it lives in the host\'s memory, named nowhere else',
            hostBranches.length === 24 && !hostBranches.some(b => /sens|sight/i.test(b)) && !/msg\.type === '[^']*(sens|sight)/i.test(src) && !/\bmsg\b/.test(smCode) && !/\bconn\b/.test(smCode) && !/type: '(?!combats'|targets')/.test(smCode)
            && count(src, /_sensesSig/g) === count(flS + smS, /_sensesSig/g) && count(src, /_sensesPend/g) === count(smS, /_sensesPend/g) && count(smS, /_sensesPend/g) > 0 && count(flS, /_sensesSig/g) > 0 && !/_senses(Sig|Pend|At)/.test(sheetsT + ioT + fogT + dmT + read('main.js'))
            && count(src, /_sensesAt/g) === count(flS + smS, /_sensesAt/g) && count(flS, /_sensesAt/g) > 0 && count(smS, /_sensesAt/g) > 0
            && count(src.replace(/\/\/[^\n]*/g, ''), /sensesReads\(/g) === 3 && count(smCode, /sensesReads\(/g) === 3 && count(smCode, /sensesHidden\(/g) === 3 && count(smCode, /setTimeout\(/g) === 1 && count(smCode, /SENSES_RESEND_MS/g) === 2, j([hostBranches.length, count(src, /_sensesSig/g), count(src, /_sensesPend/g), count(src, /_sensesAt/g), count(smCode, /setTimeout\(/g)]));
        check('senses S0 (source): this fold holds no send after a player\'s own move — net.js names no send for a move that landed, no store and no timer of one, the pos gate and the patch path send no map and call no hook themselves, and the play map\'s own drag code holds no statement of this fold',
            !/sensesLanded|_landPend|landDrop|SENSES_LANDED_MS/.test(src) && !/senses[A-Z]|_senses|SENSES_/.test(posCode + patCode) && !/sendItem\(|broadcastItemFiltered\(|resendFogged\(/.test(posCode + patCode) && posCode.length > 0 && patCode.length > 0
            && dmT.length > 0 && !/senses/i.test(dmT) && !/\bamL\b/.test(dmT) && !/invalidateSeen|sightSigFor/.test(dmT), j([/sensesLanded|_landPend|landDrop|SENSES_LANDED_MS/.test(src), /senses/i.test(dmT), dmT.length]));
    }

    // 21. fold M0 (a security fix): a GM-note card's place never goes out while the GM drags it (sanitizeItem drops the card from every copy a player
    // gets), and the target pointers sent when a connection closes are each player's own on a fogged table (targetsFor), never all of them.
    // Run for real: the close handler's statement (sliced by a pattern, as the S0 close case slices its own), broadcastTargets and targetsFor (the
    // combats slice), broadcastPos (the bpos slice) and net.streamPos sliced whole, over the real fog.js
    {
        const tgLine = (src.match(/\n {12}(if \(p && net\.targets\[p\.id\]\) \{[^\n]*\})[^\n]*\n/) || [])[1] || '';
        const deliver = W2 => (m, ex) => { packCheck(m); W2.bc.push(JSON.parse(j(m))); W2.net.conns.forEach(c => { if (c !== ex && c.open && W2.net.roster[c.peer]) c.send(m); }); };   // as the real broadcast does on a host: admitted, open peers only
        const closeTg = (W2, conn) => { let renders = 0; W2.net.conns = W2.net.conns.filter(c => c !== conn); const p = W2.net.roster[conn.peer]; delete W2.net.roster[conn.peer];
            new Function('net', 'p', 'render', 'broadcastTargets', 'broadcast', tgLine)(W2.net, p, () => { renders++; }, W2.api.targets || (() => { W2.bc.push('no broadcastTargets in the combats slice'); }), deliver(W2)); return renders; };
        const ptr = { u_a: { mapId: 'mA', id: 'wolf', x: 1, y: 2 }, u_b: { mapId: 'mA', id: 'tB', x: 3, y: 4 }, u_c: { mapId: 'mA', id: 'tA', x: 5, y: 6 } };
        // u_a points at a wolf 10 cells from her token (in her sight of 12), which Bo's token, 48 rows off, cannot see; Bo points at his own token,
        // which hers cannot see; Cy points at Ana's token, which Ana sees, and his connection closes
        const tgWorld = fog => { const W = mkW({ maps: ['mA'] }), mA = W.camp.items.mA; mA.whiteboard.push(T('wolf', '', 'c_n', 12, 2)); if (!fog) mA.fog.on = false;
            W.net.targets = JSON.parse(j(ptr)); W.c1.open = true; W.clear(); W.bc.length = 0; W.shared.length = 0; return W; };
        const tgOf = c => c.sent.filter(m => m.type === 'targets').map(m => m.targets);
        const F = tgWorld(true), fR = closeTg(F, F.c1), fOut = { a1: tgOf(F.a1), a2: tgOf(F.a2), b1: tgOf(F.b1), w1: F.w1.sent.length, c1: F.c1.sent.length, bc: F.bc.length, left: Object.keys(F.net.targets).sort(), renders: fR };
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
        check('fold M0 (source): no pointer message goes to all outside broadcastTargets — net.js broadcasts one only there, in its branch for a table without fog; every other pointer message is a player\'s own copy built by targetsFor; the combats slice now defines broadcastTargets, and the host\'s message handler has the same number of branches as before',
            btSrc.length > 0 && cnt(src, /broadcast\(\{ type: 'targets'/g) === 1 && cnt(btSrc, /broadcast\(\{ type: 'targets'/g) === 1 && cnt(src, /targets: net\.targets/g) === 1 && cnt(btSrc, /targets: net\.targets/g) === 1
            && cnt(src, /type: 'targets'/g) === cnt(src, /type: 'targets', targets: targetsFor\(/g) + 1 && cbS.indexOf(btSrc) >= 0 && cbS.indexOf('function targetsFor(') >= 0 && hostB === 24,
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
        P.net.role = 'client'; P.net.conns = [hostC]; P.camp.activeItemId = 'mA'; P.shared.length = 0; P.bc.length = 0; sp(note, true); sp(wolf, true);
        const cli = [hostC.sent.map(m => m.type + ':' + m.itemId + ':' + m.wbId + ':' + m.final), P.shared.length, P.bc.length];
        check('fold M0: a drag on the GM\'s own screen (net.streamPos sliced whole, run on the host with the real broadcastPos) streams nothing of a GM-note card, on a fogged map or one without fog; a creature\'s drag reaches whom it did, the message as before; on a player\'s machine a drag still goes to the host alone, as before',
            spSrc.length > 0 && j(hostSp) === j({ noteF: ['00000', []], noteU: ['00000', []], wolfF: ['11000', []] }) && j(tokU) === j(['00000', ['pos:mU']])
            && j(wolfMsg) === j({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'wolf', x: 600, y: 100, rot: 0, front: 0, final: true }) && !!tokUMsg && tokUMsg.wbId === 'orc5' && tokUMsg.itemId === 'mU'
            && j(cli) === j([['pos:mA:note:true', 'pos:mA:wolf:true'], 0, 0]), j([hostSp, tokU, wolfMsg, tokUMsg, cli]));

        // (d) fold M0 round 2: a hidden token reaches players as a stub with no facing, so its live moves carry none — broadcastPos (the bpos
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
        check('fold M0: the live position relay (broadcastPos, run for real) sends a hidden token\'s move with its facing 0 to every player it reaches — on a fogged map each of Ana\'s two connections, on a map without fog the one broadcast — its place and its turn as they were; a visible creature keeps its facing; a GM-note card, hidden or not, still sends nothing; the caller\'s own message is never changed',
            j(rF.ghost) === j({ conns: [[want(qA, ghost, 0)], [want(qA, ghost, 0)], [], [], []], bc: [], kept: true })
            && j(rF.ghostU) === j({ conns: [[], [], [], [], []], bc: [want(qU, ghostU, 0)], kept: true })
            && j(rF.seen) === j({ conns: [[want(qA, seen, 30)], [want(qA, seen, 30)], [], [], []], bc: [], kept: true })
            && j(rF.ghostN) === j({ conns: [[], [], [], [], []], bc: [], kept: true }) && JSON.parse(rF.ghost.conns[0][0]).rot === 15 && JSON.parse(rF.ghostU.bc[0]).x === 600, j(rF));
    }
})());
// F11 (owner, 2026-09-28): a file that holds one entry twice on a list that takes an entry once — the second row comes in as a row of its own, on
// every path: a character in the making (the [netcheck:charfill] branch) and a player's upload the GM reviews (the [netcheck:charupload] slice),
// both run for real with the real systemcore, the real sends (the [netcheck:chardelta] slice, sendCharTo) and the GM's own Apply (sheets.js, sliced)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const upSrc = between('// [netcheck:charupload-start]', '// [netcheck:charupload-end]', 'charupload'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const stA = src.indexOf('function sendCharTo(pid, id) {'), stB = src.indexOf('net.sendCharTo = sendCharTo;'), stSrc = stA > 0 && stB > stA ? src.slice(stA, stB + 'net.sendCharTo = sendCharTo;'.length) : '';
    const shT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
    const cut = (t, a, b) => { const i = t.indexOf(a), k = i < 0 ? -1 : t.indexOf(b, i); return i < 0 || k < 0 ? '' : t.slice(i, k + b.length); };
    const pfSrc = shT.slice(shT.indexOf('function playerFinder('), shT.indexOf('function fromShadowBase(')), sfSrc = cut(shT, 'function sbFinder(camp, sys) {', '\n}\n'), acSrc = cut(shT, 'function afterCharChange(c, whole, values) {', '\n}\n'), apSrc = cut(shT, '    apply.onclick = function() {', '\n    };\n');
    const lvl = { label: 'Level', min: 0, max: 20, def: 0 }, num = ks => ks.map(k => ({ key: k }));
    const L = (id, key, cat, list) => ({ id, key, label: key, kind: 'item-list', vis: 'all', edit: 'owner', list: Object.assign({ cats: [cat], lvl }, list) });
    const sysT = gm => Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', edit: 'gm', def: 10 }, { id: 'f_dg', key: 'Dodge', label: 'Dodge', kind: 'number', vis: 'all', edit: 'gm', def: 8 }]
        .concat(gm ? [{ id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'gm', def: 10 }] : []).concat([
            L('f_adv', 'Advantages', 'Trait', { noQty: true, stats: num(['bp', 'per', 'granted', 'szd']) }), L('f_qk', 'Quirks', 'Trait', { noQty: true, stats: num(['bp', 'per', 'granted']) }),
            L('f_dis', 'Disadvantages', 'Flaw', { noQty: true, multi: true, stats: num(['bp', 'per', 'granted']) }), L('f_pw', 'Powers', 'Power', { noQty: true, stats: num(['cpA', 'cpC', 'cpK', 'fpP', 'epP', 'al', 'granted']) }),
            L('f_tq', 'Techniques', 'Technique', { stats: num(['cpA', 'cpC', 'cpK', 'skB', 'granted']) }), L('f_fm', 'Forms', 'Form', { noQty: true, on: { label: 'Active' }, stats: num(['cpA', 'granted']) })]),
        items: [{ id: 'i_par', name: 'Guarded Parry', category: 'Trait', stats: { bp: 5 } }, { id: 'i_keen', name: 'Keen Eye', category: 'Trait', stats: { bp: 2 } }, { id: 'i_cow', name: 'Cowardice', category: 'Flaw', stats: { bp: -10 } },
            { id: 'i_push', name: 'Push', category: 'Power', stats: { cpA: 4, cpC: 2, fpP: 2030405, al: 2, granted: 3 } }, { id: 'i_feint', name: 'Feint', category: 'Technique', stats: { cpA: 3 } }, { id: 'i_form', name: 'First Form', category: 'Form', stats: { cpA: 5 } }]
            .concat(gm ? [{ id: 'i_hid', name: 'Hidden Gift', category: 'Trait', vis: 'gm', stats: { bp: 7 } }] : []) }, { F: Fx, gmView: true });
    const viewOf = cp => Sx.cleanSystem(cp.system, { F: Fx, gmView: false });
    const finder = s => nm => s.items.filter(e => e.name.toLowerCase() === String(nm).trim().toLowerCase());
    // the file: one entry twice on each list that takes an entry once (a trait with a change of its own, a power with no cost of its own, a form), a second
    // entry of the same list, the same entry on another once-only list, twice on a list that takes several rows, and a GM-only entry's name twice; counted: twice on a list that counts
    const twice = { name: 'Vex', attributes: { strength: { value: 13 } }, traits: {
            advantages: [{ name: 'Guarded Parry', points: 5 }, { name: 'Guarded Parry', points: 5, modifiers: { dodge: 1 } }, { name: 'Keen Eye', points: 2 }, { name: 'Hidden Gift', points: 7 }, { name: 'Hidden Gift', points: 7 }],
            quirks: [{ name: 'Keen Eye', points: 2 }], disadvantages: [{ name: 'Cowardice', points: -10 }, { name: 'Cowardice', points: -10 }] },
        abilities: { forcePowers: [{ name: 'Push', level: 3 }, { name: 'Push', level: 3, fpCost: 3, epCost: 1, alignment: 'DS' }], lightsaberForms: [{ name: 'First Form', level: 2, cpCost: 5, active: true }, { name: 'First Form', level: 1, cpCost: 7 }] } };
    const counted = { name: 'Vex', abilities: { combatTechniques: [{ name: 'Feint', level: 1, cpCost: 3 }, { name: 'Feint', level: 1, cpCost: 3 }] } };
    const stated = { name: 'Vex', abilities: { forcePowers: [{ name: 'Push', level: 3, cpCost: 8 }, { name: 'Push', level: 3, cpCost: 5 }] } };   // the second row states a cost of its own
    const run = (o) => {
        o = o || {}; const sys = o.sys || sysT(o.gm), ch = Object.assign({ id: 'c_m', name: 'Vex', ownerId: 'u_a', npc: false, values: { f_st: 10 } }, o.play ? {} : { making: 1 }, o.ch || {});
        const camp = { id: 'k', system: sys, chars: { c_m: ch, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } }; if (o.packs) camp.library = { packs: o.packs };
        const out = { answer: [], owner: [], mate: [], toasts: [], logs: [], told: [], saves: 0, allowed: [], at: o.at || {}, camp, ch, sys }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpLibrary: Object.assign({ state: () => 'ready' }, o.lib || {}), wpSheets: { sbFinder: (cp, s) => finder(s), charChanged() {}, uploadsChanged: id => out.told.push(id), playerSystem: o.libCats ? cp => Sx.cleanSystem(cp.system, { F: Fx, gmView: false, libCats: o.libCats }) : viewOf } };   // libCats: the library's categories, as playerSystem reads them on the GM's machine
        win.wpSheets.playerFinder = new Function('window', pfSrc + '\nreturn playerFinder;')(win);
        if (o.realFinder) win.wpSheets.sbFinder = new Function('window', sfSrc + '\nreturn sbFinder;')(win);   // F11b: the GM's own finder (sheets.js, sliced) over the stub library
        const handle = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'toast', 'logEvent', '_uploadAt', 'UPLOAD_GAP_MS', 'sheetsOnFor', 'allow',
            'var _charPending = {}, _charSlowSaid = {}, _charHost = {}, _rowGrace = {}, charLimit = null;\n' + dlSrc.replace('var _uploadAt = {}, UPLOAD_GAP_MS = 10000;', '') + '\n' + stSrc + '\nreturn function(msg, conn) {\n' + upSrc + '\n};')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), out.at, 10000, () => true,
            (k, lim, peer) => { out.allowed.push(k); return o.slow !== k; });
        handle(Object.assign({ type: 'char-upload', rid: 'e1', charId: 'c_m', sheet: twice }, o.msg || {}), conn);
        out.again = sheet => { delete out.at.pA; handle({ type: 'char-upload', rid: 'e2', charId: 'c_m', sheet }, conn); };   // a later upload of the same player (past the rate)
        out.net = net; out.win = win; return out;
    };
    // a row as the checks read it: the entry it copies or the name it carries, its level, its switch, its count, its own numbers and changes
    const rowsOf = (vals, fid) => (vals[fid] || []).map(r => r.defId ? [r.defId, r.lvl, r.on === true, r.qty] : ['own', r.def && r.def.name, r.lvl, r.on === true, r.def && r.def.stats, (r.def && r.def.mods) || null]);
    const shape = vals => ({ adv: rowsOf(vals, 'f_adv'), qk: rowsOf(vals, 'f_qk'), dis: rowsOf(vals, 'f_dis'), pw: rowsOf(vals, 'f_pw'), tq: rowsOf(vals, 'f_tq'), fm: rowsOf(vals, 'f_fm') });
    const par2 = ['own', 'Guarded Parry', 0, false, { bp: 5 }, [{ f: 'f_dg', op: 'add', v: 1 }]], push2 = ['own', 'Push', 3, false, { cpA: 4, cpC: 2, fpP: 2030405, al: 2 }, null], form2 = ['own', 'First Form', 1, false, { cpA: 7 }, null], gift = ['own', 'Hidden Gift', 0, false, { bp: 7 }, null];
    const want = { adv: [['i_par', 0, false, 1], par2, ['i_keen', 0, false, 1], gift, gift], qk: [['i_keen', 0, false, 1]], dis: [['i_cow', 0, false, 1], ['i_cow', 0, false, 1]], pw: [['i_push', 3, false, 1], push2], tq: [], fm: [['i_form', 2, true, 1], form2] };
    const M = run(), MG = run({ gm: true }), mOwn = M.owner.length === 1 ? M.owner[0] : {}, mChar = mOwn.char || { values: {} };
    check('a file with one entry twice (making, host, run for real): on a list that takes an entry once the first row is the library\'s and the second a row of its own with the file\'s name, points and changes — a trait, a power (no cost in the file: priced as the entry is, by its level, with the entry\'s FP and alignment and none of the FP, EP or alignment the file states, and no granted points the file does not state), a form (its own cost, level and switch); every row is counted in the answer and none left out',
        j(M.answer) === j([{ n: 0, auto: 13, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(shape(M.ch.values)) === j(want) && M.ch.values.f_st === 13 && j(M.allowed) === j(['charfill']) && M.saves === 1
        && M.toasts.length === 1 && /^Pat filled Vex from a file \(13 parts\) /.test(M.toasts[0]) && !/left out/.test(M.toasts[0]) && !M.camp.uploads, j([M.answer, shape(M.ch.values), M.toasts]));
    check('a file with one entry twice (making): the second entry of a once-only list and the same entry on another once-only list stay the library\'s (what a file added is kept per list and per entry); a list that takes several rows of an entry holds two library rows as before',
        j(rowsOf(M.ch.values, 'f_adv')[2]) === j(['i_keen', 0, false, 1]) && j(rowsOf(M.ch.values, 'f_qk')) === j([['i_keen', 0, false, 1]]) && j(rowsOf(M.ch.values, 'f_dis')) === j([['i_cow', 0, false, 1], ['i_cow', 0, false, 1]])
        && !(M.ch.values.f_dis || []).some(r => r.def || r.own), j(shape(M.ch.values)));
    const MC = run({ msg: { sheet: counted } }), PC = run({ play: true, msg: { sheet: counted } }), opsOf = r => [].concat.apply([], ((r.camp.uploads || [])[0] || { changes: [] }).changes.map(c => (c.ops || []).map(q => q.op)));
    check('a file with one entry twice on a list that counts: the entry is one library row counted twice while making, and neither while making nor in the GM\'s queue does a row of its own stand in for it',
        j(rowsOf(MC.ch.values, 'f_tq')) === j([['i_feint', 1, false, 2]]) && MC.answer.length === 1 && MC.answer[0].n === 0 && MC.answer[0].auto >= 1 && PC.answer.length === 1 && PC.answer[0].n >= 1 && opsOf(PC).indexOf('add') >= 0 && opsOf(PC).indexOf('custom') < 0,
        j([MC.answer, rowsOf(MC.ch.values, 'f_tq'), PC.answer, opsOf(PC)]));
    const MS = run({ msg: { sheet: stated } }), PS = run({ play: true, msg: { sheet: stated } }), push5 = 'custom:Push:{"cpA":5,"fpP":0,"epP":0,"al":1}';
    check('a file with one entry twice: a second row that states a cost of its own keeps the file\'s cost, never the entry\'s — on the character in the making and in the GM\'s queue; both rows are counted',
        j(rowsOf(MS.ch.values, 'f_pw')) === j([['i_push', 3, false, 1], ['own', 'Push', 3, false, { cpA: 5, fpP: 0, epP: 0, al: 1 }, null]]) && j(MS.answer) === j([{ n: 0, auto: 2, left: 0, type: 'char-upload-ans', rid: 'e1' }])
        && j(PS.answer) === j([{ n: 2, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(((PS.camp.uploads || [])[0] || { changes: [] }).changes.map(c => c.kind + ':' + (c.ops[0].op === 'add' ? 'add:' + c.ops[0].defId : 'custom:' + c.ops[0].def.name + ':' + j(c.ops[0].def.stats)))) === j(['add:add:i_push', 'add:' + push5]),
        j([MS.answer, rowsOf(MS.ch.values, 'f_pw'), PS.answer, PS.camp.uploads]));
    const ownRows = (c, fid) => rowsOf(c.values || {}, fid);
    check('a file with one entry twice (making): its owner alone is sent the character, still in the making, with the library row and the row of its own; the other players are sent nothing until Done',
        stSrc.length > 0 && M.owner.length === 1 && mOwn.type === 'char' && mOwn.campId === 'k' && mChar.id === 'c_m' && mChar.making === 1 && mChar.partial === false && j(ownRows(mChar, 'f_adv').slice(0, 2)) === j([['i_par', 0, false, 1], par2])
        && j(ownRows(mChar, 'f_pw')) === j([['i_push', 3, false, 1], push2]) && j(ownRows(mChar, 'f_fm')) === j([['i_form', 2, true, 1], form2]) && M.mate.length === 0 && MG.mate.length === 0, j([M.owner, M.mate]));
    const noIds = v => j(v).replace(/"w_sb[a-z0-9]+"/g, '"ID"').replace(/"updated":\d+/g, '"updated":0');
    check('a file with one entry twice (making): the answer is counts only and the same whatever is GM-only — with a GM-only field and a GM-only entry of a name the file holds twice, the same answer, the same rows and the same copy to its owner, nothing of the entry on the character',
        j(MG.answer) === j(M.answer) && j(Object.keys(M.answer[0]).sort()) === j(['auto', 'left', 'n', 'rid', 'type']) && j(shape(MG.ch.values)) === j(shape(M.ch.values)) && noIds(MG.owner) === noIds(M.owner) && !/i_hid|f_dx/.test(j([MG.ch.values, MG.owner, MG.answer])), j([MG.answer, shape(MG.ch.values)]));
    // (b) the same file for a character in play: the GM's queue, then the GM's own Apply (sheets.js, sliced) and the real send
    const P = run({ play: true }), PG = run({ play: true, gm: true }), upP = (P.camp.uploads || [])[0] || { changes: [] };
    const adds = (up, label) => up.changes.filter(c => c.label === label).map(c => [c.kind, c.accept, (c.ops || []).map(q => q.op === 'add' ? 'add:' + q.defId : q.op === 'custom' ? 'custom:' + q.def.name + ':' + j(q.def.stats) + ':' + j(q.def.mods || null) : q.op + ':' + j(q.facts))]);
    check('a file with one entry twice (an upload for review, host, run for real): the GM\'s queue holds an add for each of the two rows — the library\'s entry, then a row of its own with the file\'s name, points and changes (a power\'s priced and costed as the entry is, never by the FP, EP or alignment the file states) — for a trait, a power and a form; the answer counts them all; the character is unchanged and nobody is sent anything until the GM applies it',
        j(P.answer) === j([{ n: 13, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && (P.camp.uploads || []).length === 1 && upP.charId === 'c_m' && upP.from === 'u_a' && upP.changes.length === 13 && upP.changes.filter(c => c.kind === 'add').length === 12
        && j(adds(upP, 'Advantages: Guarded Parry')) === j([['add', true, ['add:i_par', 'set:{"lvl":0}']], ['add', true, ['custom:Guarded Parry:{"bp":5}:[{"f":"f_dg","op":"add","v":1}]', 'set:{"lvl":0}']]])
        && j(adds(upP, 'Powers: Push')) === j([['add', true, ['add:i_push', 'set:{"lvl":3}']], ['add', true, ['custom:Push:{"cpA":4,"cpC":2,"fpP":2030405,"al":2}:null', 'set:{"lvl":3}']]])
        && j(adds(upP, 'Forms: First Form')) === j([['add', true, ['add:i_form', 'set:{"lvl":2,"on":true}']], ['add', true, ['custom:First Form:{"cpA":7}:null', 'set:{"lvl":1,"on":false}']]])
        && j(adds(upP, 'Advantages: Keen Eye')) === j([['add', true, ['add:i_keen', 'set:{"lvl":0}']]]) && j(adds(upP, 'Quirks: Keen Eye')) === j([['add', true, ['add:i_keen', 'set:{"lvl":0}']]])
        && j(adds(upP, 'Disadvantages: Cowardice').map(a => a[2][0])) === j(['add:i_cow', 'add:i_cow'])
        && j(shape(P.ch.values)) === j({ adv: [], qk: [], dis: [], pw: [], tq: [], fm: [] }) && P.ch.values.f_st === 10 && P.owner.length === 0 && P.mate.length === 0 && P.toasts.length === 1 && /13 changes to review/.test(P.toasts[0]) && j(P.told) === j(['c_m']),
        j([P.answer, upP.changes.map(c => [c.kind, c.label, c.ops]), P.owner, P.mate]));
    check('a file with one entry twice (an upload for review): the answer to the player is counts only, the same with or without a GM-only field and entry; on the GM\'s own system the GM-only entry is the first row\'s and the second is a row of its own',
        j(PG.answer) === j(P.answer) && j(Object.keys(P.answer[0]).sort()) === j(['auto', 'n', 'rid', 'type']) && j(adds((PG.camp.uploads || [])[0] || { changes: [] }, 'Advantages: Hidden Gift').map(a => a[2][0])) === j(['add:i_hid', 'custom:Hidden Gift:{"bp":7}:null'])
        && PG.owner.length === 0 && PG.mate.length === 0, j([PG.answer, P.answer]));
    const applyGm = (r, pick) => {   // the GM's Apply as the Review window makes it: every ticked change (pick: the GM's own ticks), the character synced whole, the owner told the count
        const up = Sx.cleanUploads(r.camp.uploads)[0], ticks = {}, said = [], done = [], apply = {}; up.changes.forEach(c => { ticks[c.id] = pick ? pick(c) : c.accept; });
        r.net.uploadDone = (id, d, of) => done.push([id, d, of]);
        const after = new Function('getActiveCampaign', 'syncOwners', 'save', 'net', 'window', 'renderViews', acSrc + '\nreturn afterCharChange;')(() => r.camp, () => {}, () => { r.saves++; }, () => r.net, {}, () => {});
        new Function('apply', 'up', 'ticks', 'getActiveCampaign', 'systemOf', 'charById', 'F', 'sbApplyProposal', 'afterCharChange', 'net', 'toast', 'closeReview', 'var lastChange = null;\n' + apSrc)(
            apply, up, ticks, () => r.camp, c => c.system, (id, c) => c.chars[id], () => Fx, Sx.sbApplyProposal, after, () => r.net, t => said.push(t), () => {});
        apply.onclick();
        return { said, done };
    };
    const A = acSrc && apSrc ? applyGm(P) : { said: [], done: [] }, aOwn = P.owner.length === 1 ? P.owner[0] : {}, aChar = aOwn.char || { values: {} }, aMate = P.mate.length === 1 ? P.mate[0] : {};
    check('a file with one entry twice (an upload for review): once the GM applies it (the Review window\'s own Apply and the real send, run for real) every change lands, the character holds the library row and the row of its own, its owner is sent the character whole with both rows and told the count, a teammate gets a hover copy without the rows, and the queue is empty',
        /sbApplyProposal\(sys, ch2, up, acc, F\(\)\)/.test(apSrc) && /n\.syncChar\(c\.id\)/.test(acSrc) && j(A) === j({ said: ['13 of 13 changes applied to Vex.'], done: [['c_m', 13, 13]] }) && j(shape(P.ch.values)) === j(want) && P.ch.values.f_st === 13
        && aOwn.type === 'char' && aChar.id === 'c_m' && aChar.partial === false && !('making' in aChar) && j(shape(aChar.values)) === j(want) && aMate.type === 'char' && aMate.char.partial === true && j(aMate.char.values) === '{}' && !/Guarded Parry|Push|First Form|i_par/.test(j(aMate))
        && j(P.camp.uploads) === '[]', j([A, shape(P.ch.values), P.owner, P.mate]));
    // (c) the gates as before: the rate and the size still refuse, whatever the file holds twice
    const fat = Object.assign({}, twice, { notes: 'a'.repeat(1048577) });
    const mSlow = run({ slow: 'charfill' }), mBig = run({ msg: { sheet: fat } }), pSlow = run({ play: true, at: { pA: Date.now() - 2000 } }), pBig = run({ play: true, msg: { sheet: fat } });
    const still = r => j(shape(r.ch.values)) === j({ adv: [], qk: [], dis: [], pw: [], tq: [], fm: [] }) && r.ch.values.f_st === 10 && !r.camp.uploads && r.saves === 0 && r.toasts.length === 0 && r.owner.length === 0 && r.mate.length === 0;
    const hostBr = src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || [];
    check('a file with one entry twice: the gates are as before — past the rate a fill and an upload are refused and answered slow, a file over the size is dropped unanswered, and nothing is changed, kept, saved, said or sent; the host still reads a file through its one branch (no branch added)',
        j(mSlow.answer) === j([{ reason: 'slow', type: 'char-upload-ans', rid: 'e1' }]) && still(mSlow) && j(mSlow.allowed) === j(['charfill']) && j(pSlow.answer) === j([{ reason: 'slow', type: 'char-upload-ans', rid: 'e1' }]) && still(pSlow)
        && mBig.answer.length === 0 && still(mBig) && mBig.allowed.length === 0 && pBig.answer.length === 0 && still(pBig) && Sx.cleanCharUpload({ type: 'char-upload', rid: 'e1', charId: 'c_m', sheet: twice }) !== null
        && hostBr.length === 24 && hostBr.filter(b => /'char-upload'/.test(b)).length === 1, j([mSlow.answer, pSlow.answer, mBig.answer, pBig.answer, hostBr.length]));
    // (d) F11b: a twin's changes are its entry's as the host holds it, a GM-only field's included (the players' copy a fill reads lacks them); a later
    // upload sends a row of its own whole (every stat, a dropped one as null, the changes where they differ, a twin's entry by id); a GM-only pack's
    // entry reaches the GM's finder as its GM-only copy, so it lends a row of its own nothing
    const dg1 = { f: 'f_dg', op: 'add', v: 1 };
    const sysG = (dx, bare) => Sx.cleanSystem({ v: 1, name: 'G', rolls: [], fields: [{ id: 'f_dg', key: 'Dodge', label: 'Dodge', kind: 'number', vis: 'all', edit: 'gm', def: 8 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: dx, edit: 'gm', def: 10 },
        L('f_adv', 'Advantages', 'Trait', { noQty: true, stats: num(['bp', 'per', 'granted']) })],
        items: bare ? [] : [{ id: 'i_grit', name: 'Grit', category: 'Trait', notes: 'Stands firm.', stats: { bp: 0, per: 3 }, mods: [dg1, { f: 'f_dx', op: 'add', v: 2 }], modsOn: true }] }, { F: Fx, gmView: true });   // modsOn: its changes work while switched on, on a list with no switch
    const gritM = [dg1, { f: 'f_dx', op: 'add', v: 2 }], grits = (p2, l2) => ({ name: 'Vex', traits: { advantages: [{ name: 'Grit', level: 2, points: 6 }, { name: 'Grit', level: l2 || 2, points: p2 === undefined ? 6 : p2 }] } });
    const GM = run({ sys: sysG('gm'), msg: { sheet: grits() } }), GV = run({ sys: sysG('all'), msg: { sheet: grits() } });
    const twinOwn = (msgs, fid) => { const c = msgs.length ? msgs[msgs.length - 1].char || {} : {}; return ((c.values || {})[fid] || []).filter(r => !r.defId && r.lnk !== 1).map(r => [r.def && r.def.name, r.def && r.def.stats, (r.def && r.def.mods) || null]); };
    const pvGrit = (viewOf(GM.camp).items || []).filter(e => e.id === 'i_grit').map(e => e.mods);
    check('a file with one entry twice (making, F11b): where the entry changes a field players may not see, the host\'s character holds the second row with the entry\'s changes as the host holds them, that field\'s included, though the players\' copy the file is read against lacks it; the library row stands first; the entry\'s "while switched on" is left off a list that has no switch, so the row is kept',
        j(pvGrit) === j([[dg1]]) && j(shape(GM.ch.values).adv) === j([['i_grit', 2, false, 1], ['own', 'Grit', 2, false, { bp: 0, per: 3 }, gritM]]) && j(shape(GV.ch.values).adv) === j(shape(GM.ch.values).adv)
        && (GM.ch.values.f_adv || []).filter(r => !r.defId).every(r => r.def.notes === 'Stands firm.' && !('modsOn' in r.def)) && (GM.camp.system.items[0] || {}).modsOn === true,
        j([pvGrit, shape(GM.ch.values).adv, shape(GV.ch.values).adv, GM.answer, GM.ch.values.f_adv]));
    check('a file with one entry twice (making, F11b): the answer is counts only and the same whether that field is GM-only or not; its owner alone is sent the character, and their copy carries no change to a GM-only field on any row, while a field they may see keeps its change',
        j(GM.answer) === j([{ n: 0, auto: 2, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(GV.answer) === j(GM.answer) && GM.owner.length === 1 && GM.mate.length === 0 && !/f_dx/.test(j(GM.owner))
        && j(twinOwn(GM.owner, 'f_adv')) === j([['Grit', { bp: 0, per: 3 }, [dg1]]]) && j(twinOwn(GV.owner, 'f_adv')) === j([['Grit', { bp: 0, per: 3 }, gritM]]),
        j([GM.answer, GV.answer, GM.owner, twinOwn(GV.owner, 'f_adv')]));
    // an entry of a pack players may see: the players' index holds their copy (no change to the GM-only field), the host's own copy (the library's entry) holds it
    const pkM = [dg1, { f: 'f_dx', op: 'add', v: 3 }], hostPk = { id: 'i_pk', name: 'Poise', category: 'Trait', vis: 'all', notes: 'Balanced.', stats: { bp: 0, per: 2 }, mods: pkM }, plPk = Object.assign({}, hostPk, { mods: [dg1] });
    const rawIw = { id: 'i_iw', name: 'Iron Will', category: 'Trait', vis: 'all', notes: 'Unbending.', stats: { bp: 0, per: 2 }, mods: [dg1] }, packs = [{ id: 'p_gm', vis: 'gm' }, { id: 'p_all', vis: 'all' }];
    const stubL = { playerIndexOf: pid => (pid === 'p_all' ? { byId: { i_pk: plPk } } : null), entry: id => (id === 'i_pk' ? hostPk : null), entriesOf: pid => (pid === 'p_all' ? [hostPk] : pid === 'p_gm' ? [rawIw] : []),
        entryFor: id => (id === 'i_iw' ? Object.assign({}, rawIw, { vis: 'gm' }) : id === 'i_pk' ? hostPk : null) };   // entryFor as library.js hands an entry out: a GM-only pack's as its GM-only copy
    const poises = { name: 'Vex', traits: { advantages: [{ name: 'Poise', level: 2, points: 4 }, { name: 'Poise', level: 2, points: 4 }] } };
    const PK = run({ sys: sysG('gm', true), packs, lib: stubL, libCats: { show: ['Trait'], hide: [] }, msg: { sheet: poises } });
    check('a file with one entry twice (making, F11b): for an entry of a pack players may see, the second row takes its changes from the host\'s own copy of the entry, never the players\' copy; the answer is counts only and its owner\'s copy carries no change to a GM-only field, on the library row or the second',
        j(shape(PK.ch.values).adv) === j([['i_pk', 2, false, 1], ['own', 'Poise', 2, false, { bp: 0, per: 2 }, pkM]]) && j(PK.answer) === j([{ n: 0, auto: 2, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && PK.owner.length === 1
        && !/f_dx/.test(j(PK.owner)) && j(twinOwn(PK.owner, 'f_adv')) === j([['Poise', { bp: 0, per: 2 }, [dg1]]]), j([shape(PK.ch.values).adv, PK.answer, PK.owner]));
    // C0: a later upload for review sends a row of its own whole — flat to twin (the entry's price and its changes, the twin's entry by id), then twin to flat (a dropped stat as null, no changes)
    const R0 = run({ play: true, sys: sysG('gm'), msg: { sheet: grits(5) } }), A0 = applyGm(R0), gRow = () => (R0.ch.values.f_adv || []).filter(r => !r.defId).map(r => [r.lvl, r.def.stats, r.def.mods || null, 'modsOn' in r.def]);
    const q0 = c => [c.kind, c.label, c.from, c.to, c.def || c.facts, c.twin || null], n1 = R0.owner.length, row1 = gRow();
    R0.again(grits()); const up1 = Sx.cleanUploads(R0.camp.uploads), ans1 = R0.answer.slice(1);
    const gi = R0.camp.system.items.filter(e => e.id === 'i_grit')[0], gritM2 = [{ f: 'f_dg', op: 'add', v: 2 }, { f: 'f_dx', op: 'add', v: 2 }]; gi.mods = gritM2;   // the GM changes the entry before Apply: the twin takes it as it is then
    const A1 = applyGm(R0), row2 = gRow(), own2 = R0.owner.slice(n1), n2 = R0.owner.length;
    R0.again(grits(8, 3)); const up2 = Sx.cleanUploads(R0.camp.uploads), A2 = applyGm(R0), row3 = gRow(), own3 = R0.owner.slice(n2);
    check('a later upload for review (F11b): a row of its own the file now prices as its entry is comes to the GM as one change holding the whole of its stats, the entry\'s changes and the entry by id; once applied the row reads as the entry does, with the entry\'s changes as the host holds them then, and its owner is sent it without a change to a GM-only field',
        j(A0.done) === j([['c_m', 2, 2]]) && j(row1) === j([[2, { bp: 5 }, null, false]]) && j(ans1) === j([{ n: 1, auto: 0, type: 'char-upload-ans', rid: 'e2' }]) && up1.length === 1
        && j(up1[0].changes.map(q0)) === j([['def', 'Advantages: Grit', '{"bp":5}', '{"bp":0,"per":3} and its changes', { stats: { bp: 0, per: 3 }, mods: gritM }, 'i_grit']])
        && j(A1) === j({ said: ['1 of 1 changes applied to Vex.'], done: [['c_m', 1, 1]] }) && j(row2) === j([[2, { bp: 0, per: 3 }, gritM2, false]]) && own2.length === 1 && !/f_dx/.test(j(own2)) && j(twinOwn(own2, 'f_adv')) === j([['Grit', { bp: 0, per: 3 }, [gritM2[0]]]]),
        j([A0, row1, ans1, up1.length && up1[0].changes.map(q0), A1, row2, own2]));
    check('a later upload for review (F11b): a row of its own the file prices otherwise comes to the GM with every stat the file no longer states sent to be dropped and its changes cleared; once applied the row holds the file\'s price alone, at the file\'s level, with no changes, and its owner is sent it',
        up2.length === 1 && j(up2[0].changes.map(q0)) === j([['fact', 'Advantages: Grit', 'level 2', 'level 3', { lvl: 3 }, null], ['def', 'Advantages: Grit', '{"bp":0,"per":3}', '{"bp":8}, no changes', { stats: { per: null, bp: 8 }, mods: null }, null]])
        && j(A2) === j({ said: ['2 of 2 changes applied to Vex.'], done: [['c_m', 2, 2]] }) && j(row3) === j([[3, { bp: 8 }, null, false]]) && own3.length === 1 && j(twinOwn(own3, 'f_adv')) === j([['Grit', { bp: 8 }, null]]) && j(R0.camp.uploads) === '[]',
        j([up2.length && up2[0].changes.map(q0), A2, row3, own3]));
    // the entry looked up afresh at Apply only for a second row: its library row on the list (a kept curse is not one) and an entry players may still see; else what the GM was shown
    const newer = r => { const e = r.camp.system.items.filter(x => x.id === 'i_grit')[0]; e.mods = gritM2; return e; };
    const RK = run({ play: true, sys: sysG('gm'), ch: { values: { f_adv: [{ id: 'w_k1', defId: 'i_grit', qty: 1, lvl: 2, hid: 1 }] } }, msg: { sheet: grits() } });
    const kAdds = ((RK.camp.uploads || [])[0] || { changes: [] }).changes.map(c => (c.ops || []).map(q => q.op).join('+')); newer(RK);
    const AK = applyGm(RK, c => c.kind === 'add' && c.ops.some(q => q.op === 'custom')), kRows = (RK.ch.values.f_adv || []).map(r => r.defId ? [r.defId, r.hid === 1] : [r.def.name, r.def.mods || null]);
    const RG = run({ play: true, sys: sysG('gm'), ch: { values: { f_adv: [{ id: 'w_l1', defId: 'i_grit', qty: 1, lvl: 2 }, { id: 'w_o1', qty: 1, lvl: 2, def: { name: 'Grit', category: 'Trait', stats: { bp: 5 } } }] } }, msg: { sheet: grits() } });
    const gTwin = (Sx.cleanUploads(RG.camp.uploads)[0] || { changes: [] }).changes.map(c => [c.kind, c.twin || null]); newer(RG).vis = 'gm';
    const AG = applyGm(RG), gRows = (RG.ch.values.f_adv || []).filter(r => !r.defId).map(r => [r.def.stats, r.def.mods || null]);
    check('a later upload for review (F11b): at Apply the host takes a second row\'s changes afresh only beside its library row (a kept curse of the entry is not one: with only the second row ticked it keeps the changes the GM was shown) and only from an entry players may still see (one made GM-only since lends nothing new: the row keeps what the GM was shown)',
        j(kAdds) === j(['add+set', 'custom+set']) && j(AK.done) === j([['c_m', 1, 2]]) && j(kRows) === j([['i_grit', true], ['Grit', gritM]])
        && j(gTwin) === j([['def', 'i_grit']]) && j(AG.done) === j([['c_m', 1, 1]]) && j(gRows) === j([[{ bp: 0, per: 3 }, gritM]]), j([kAdds, AK, kRows, gTwin, AG, gRows]));
    // C1: the GM's own finder (sheets.js sbFinder, run for real): a GM-only pack's entry as its GM-only copy, a visible pack's as it is
    const sf = new Function('window', sfSrc + '\nreturn sbFinder;')({ wpLibrary: stubL }), fnd = sf({ library: { packs } }, sysG('gm')), iw = fnd('Iron Will'), pk = fnd(' poise ');
    const fndSys = sf({ library: { packs } }, { items: [{ id: 'i_iw2', name: 'Iron Will', category: 'Trait' }] })('iron will').map(e => e.id);
    check('the GM\'s finder of entries by name (sheets.js, run for real): an entry of a GM-only pack is handed out as the library\'s GM-only copy, an entry of a pack players may see as it is, the system\'s own items first',
        sfSrc.length > 0 && iw.length === 1 && iw[0].vis === 'gm' && iw[0] !== rawIw && rawIw.vis === 'all' && iw[0].notes === 'Unbending.' && pk.length === 1 && pk[0] === hostPk && j(fndSys) === j(['i_iw2', 'i_iw']) && j(fnd('Grit').map(e => e.id)) === j(['i_grit']),
        j([iw, pk.map(e => e.id), fndSys]));
    const irons = { name: 'Vex', traits: { advantages: [{ name: 'Iron Will', level: 2, points: 4 }, { name: 'Iron Will', level: 2, points: 4 }] } };
    let I1 = null, upI = { changes: [] }, AI = null; Sx.setLibraryFind(stubL.entryFor);
    try { I1 = run({ play: true, sys: sysG('gm', true), packs, lib: stubL, realFinder: true, msg: { sheet: irons } }); upI = Sx.cleanUploads(I1.camp.uploads)[0] || upI; AI = applyGm(I1); } finally { Sx.setLibraryFind(null); }
    const ownI = (I1.ch.values.f_adv || []).filter(r => !r.defId).map(r => r.def), opI = [].concat.apply([], upI.changes.map(c => c.ops || [])).filter(q => q.op === 'custom');
    check('a file with one entry twice (an upload for review, F11b): where the entry is in a GM-only pack, the second row is a row of its own with the file\'s name and points only — no notes, no changes, none of the entry\'s price, no entry named — in the queue and once the GM applies it',
        j(I1.answer) === j([{ n: 2, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(adds(upI, 'Advantages: Iron Will')) === j([['add', true, ['add:i_iw', 'set:{"lvl":2}']], ['add', true, ['custom:Iron Will:{"bp":4}:null', 'set:{"lvl":2}']]])
        && j(opI.map(q => [q.def, 'twin' in q])) === j([[{ name: 'Iron Will', category: 'Trait', stats: { bp: 4 } }, false]]) && j(AI.done) === j([['c_m', 2, 2]])
        && j(shape(I1.ch.values).adv) === j([['i_iw', 2, false, 1], ['own', 'Iron Will', 2, false, { bp: 4 }, null]]) && ownI.length === 1 && !ownI[0].notes && !('mods' in ownI[0]) && ownI[0].vis === 'all',
        j([I1.answer, upI.changes.map(c => [c.kind, c.label, c.ops]), AI, shape(I1.ch.values).adv, ownI]));
    // (e) F11b round 2: a twin keeps its entry's switch (R1), every twin is marked whatever the players' copy carries (R2), a player's edit of a
    // row's changes keeps the ones they cannot see (R3), a choice only as the list spells it (R4), the GM's finder fails closed (R5), a mark lends
    // only to a row priced as its entry (R6), an add change keeps no mark of its own (R7)
    const dgA = v => ({ f: 'f_dg', op: 'add', v }), dxA = v => ({ f: 'f_dx', op: 'add', v });
    const sysF = dx => { const s = Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_dg', key: 'Dodge', label: 'Dodge', kind: 'number', vis: 'all', edit: 'gm', def: 8 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: dx, edit: 'gm', def: 10 },
        L('f_adv', 'Advantages', 'Trait', { noQty: true, stats: num(['bp', 'per', 'granted']) }), L('f_fm', 'Forms', 'Form', { noQty: true, on: { label: 'Active' }, stats: num(['cpA', 'granted']) }),
        L('f_pw', 'Powers', 'Power', { noQty: true, stats: num(['cpA', 'granted']).concat([{ key: 'psk', kind: 'pick', opts: [{ label: 'Agility', name: 'Dodge' }, { label: 'Might', name: 'Dodge' }] }]) })],
        items: [{ id: 'i_calm', name: 'Calm', category: 'Trait', notes: 'Unshaken.', stats: { bp: 0, per: 2 }, mods: [dxA(2)] },   // every change on a field that may be GM-only
            { id: 'i_stance', name: 'Stance', category: 'Form', stats: { cpA: 5 }, mods: [dgA(1)], modsOn: true }, { id: 'i_guard', name: 'Guard', category: 'Form', stats: { cpA: 3 }, mods: [dgA(1)] },
            { id: 'i_veil', name: 'Veil', category: 'Form', stats: { cpA: 4 }, mods: [dxA(1)], modsOn: true },
            { id: 'i_sense', name: 'Sense', category: 'Power', stats: { cpA: 4, psk: 'Agility' }, mods: [dxA(1)] }, { id: 'i_reach', name: 'Reach', category: 'Power', stats: { cpA: 6, psk: 'Might' }, mods: [dxA(1)] }] }, { F: Fx, gmView: true });
        s.fields.filter(f => f.id === 'f_pw')[0].list.stats.filter(x => x.key === 'psk')[0].opts[0].label = 'Agility (DX)';   // the GM renames a choice after the entries were read: Sense still holds the old label
        return s; };
    const forms = { name: 'Vex', traits: { advantages: [{ name: 'Calm', level: 2, points: 4 }, { name: 'Calm', level: 2, points: 4, baselinePoints: 3 }, { name: 'Calm', level: 2, points: 4, modifiers: { dodge: 1 } }] },
        abilities: { lightsaberForms: [{ name: 'Stance', level: 1, active: false }, { name: 'Stance', level: 1, active: false }, { name: 'Guard', level: 1 }, { name: 'Guard', level: 1 }, { name: 'Veil', level: 1 }, { name: 'Veil', level: 1 }],
            forcePowers: [{ name: 'Sense', level: 1 }, { name: 'Sense', level: 1 }, { name: 'Reach', level: 1 }, { name: 'Reach', level: 1 }] } };
    const twinsOf = (vals, fid) => ((vals || {})[fid] || []).filter(r => !r.defId && r.lnk !== 1).map(r => [r.def && r.def.name, r.on === true, (r.def && r.def.mods) || null, !!(r.def && r.def.modsOn === true)]);
    const lastChar = msgs => (msgs.length ? msgs[msgs.length - 1].char || {} : {});
    const at = (r, fid) => { const v = Sx.resolveAll(r.camp.system, r.ch, Fx)[fid]; return v ? v.value : undefined; };
    const fmW = [['i_stance', 1, false, 1], ['own', 'Stance', 1, false, { cpA: 5 }, [dgA(1)]], ['i_guard', 1, false, 1], ['own', 'Guard', 1, false, { cpA: 3 }, [dgA(1)]], ['i_veil', 1, false, 1], ['own', 'Veil', 1, false, { cpA: 4 }, [dxA(1)]]];
    const advW = [['i_calm', 2, false, 1], ['own', 'Calm', 2, false, { bp: 0, per: 2, granted: 3 }, [dxA(2)]], ['own', 'Calm', 2, false, { bp: 0, per: 2 }, [dgA(1)]]];
    const pwW = [['i_sense', 1, false, 1], ['own', 'Sense', 1, false, { cpA: 4 }, [dxA(1)]], ['i_reach', 1, false, 1], ['own', 'Reach', 1, false, { cpA: 6, psk: 'Might' }, [dxA(1)]]];
    const swW = [['Stance', false, [dgA(1)], true], ['Guard', false, [dgA(1)], false], ['Veil', false, [dxA(1)], true]];
    const FM = run({ sys: sysF('gm'), msg: { sheet: forms } }), FV = run({ sys: sysF('all'), msg: { sheet: forms } }), FP = run({ play: true, sys: sysF('gm'), msg: { sheet: forms } }), FPV = run({ play: true, sys: sysF('all'), msg: { sheet: forms } });
    const AFP = acSrc && apSrc ? applyGm(FP) : { said: [], done: [] };
    const onSheet = { name: 'Vex', abilities: { lightsaberForms: [{ name: 'Stance', level: 1, active: false }, { name: 'Stance', level: 1, active: true }] } }, FO = run({ sys: sysF('gm'), msg: { sheet: onSheet } });
    check('a file with one entry twice (F11b, making and for review, host, run for real): a second row of a form whose changes work while it is switched on keeps that switch as the entry has it, on a list with a switch, and one whose entry works always stays without it; switched off the row adds nothing, switched on it adds its changes',
        j(shape(FM.ch.values).fm) === j(fmW) && j(twinsOf(FM.ch.values, 'f_fm')) === j(swW) && at(FM, 'f_dg') === 11 && j(AFP.done) === j([['c_m', 13, 13]]) && j(shape(FP.ch.values).fm) === j(fmW) && j(twinsOf(FP.ch.values, 'f_fm')) === j(swW) && at(FP, 'f_dg') === 11
        && j(twinsOf(FO.ch.values, 'f_fm')) === j([['Stance', true, [dgA(1)], true]]) && at(FO, 'f_dg') === 9,
        j([shape(FM.ch.values).fm, twinsOf(FM.ch.values, 'f_fm'), at(FM, 'f_dg'), AFP, twinsOf(FP.ch.values, 'f_fm'), at(FP, 'f_dg'), twinsOf(FO.ch.values, 'f_fm'), at(FO, 'f_dg')]));
    const ownSw = [['Stance', false, [dgA(1)], true], ['Guard', false, [dgA(1)], false], ['Veil', false, null, false]];
    check('a file with one entry twice (F11b): its owner is sent the second row of a form with the same switch as the host holds, making and once the GM applies the review; a row whose every change is on a field they may not see reaches them with neither',
        FM.owner.length === 1 && j(twinsOf(lastChar(FM.owner).values, 'f_fm')) === j(ownSw) && FP.owner.length === 1 && j(twinsOf(lastChar(FP.owner).values, 'f_fm')) === j(ownSw)
        && j(twinsOf(lastChar(FV.owner).values, 'f_fm')) === j(swW) && FM.mate.length === 0,
        j([twinsOf(lastChar(FM.owner).values, 'f_fm'), twinsOf(lastChar(FP.owner).values, 'f_fm'), twinsOf(lastChar(FV.owner).values, 'f_fm')]));
    check('a file with one entry twice (F11b, making and for review): where every change of the entry is on a field players may not see, the host\'s second row holds them all (a trait, with granted points of the file\'s own, a power and a form) and the host reads them, while a second row with changes of the file\'s own keeps those; its owner\'s copy carries none of them and nothing of that field; the answer\'s counts are the same whether that field is GM-only or not',
        j(shape(FM.ch.values).adv) === j(advW) && j(shape(FP.ch.values).adv) === j(advW) && j(shape(FM.ch.values).pw) === j(pwW) && j(shape(FP.ch.values).pw) === j(pwW) && at(FM, 'f_dx') === 18 && at(FP, 'f_dx') === 18
        && [FM, FP].every(r => j(twinsOf(lastChar(r.owner).values, 'f_adv')) === j([['Calm', false, null, false], ['Calm', false, [dgA(1)], false]]) && j(twinsOf(lastChar(r.owner).values, 'f_pw')) === j([['Sense', false, null, false], ['Reach', false, null, false]]))
        && !/f_dx/.test(j([FM.owner, FP.owner, FM.answer, FP.answer])) && j(twinsOf(lastChar(FV.owner).values, 'f_adv')) === j([['Calm', false, [dxA(2)], false], ['Calm', false, [dgA(1)], false]])
        && j(FM.answer) === j([{ n: 0, auto: 13, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(FV.answer) === j(FM.answer) && j(FP.answer) === j([{ n: 13, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(FPV.answer) === j(FP.answer),
        j([shape(FM.ch.values).adv, shape(FP.ch.values).adv, shape(FM.ch.values).pw, at(FM, 'f_dx'), at(FP, 'f_dx'), FM.answer, FV.answer, FP.answer, FPV.answer, twinsOf(lastChar(FM.owner).values, 'f_adv')]));
    const pskW = r => (r.ch.values.f_pw || []).map(x => x.defId ? [x.defId, x.stats || null] : [x.def.name, x.def.stats]);
    check('a file with one entry twice (F11b, making and for review): an entry holding a choice the list no longer offers still gives its second row, which leaves the choice out (the list\'s default, as its library row reads) and takes the rest of its price; a choice the list offers is kept',
        [FM, FP].every(r => j(pskW(r)) === j([['i_sense', null], ['Sense', { cpA: 4 }], ['i_reach', null], ['Reach', { cpA: 6, psk: 'Might' }]])) && (FP.camp.system.items.filter(e => e.id === 'i_sense')[0] || { stats: {} }).stats.psk === 'Agility',
        j([pskW(FM), pskW(FP)]));
    // R1 at Apply: the switch is the entry's as the host holds it then — a second row whose switch the GM was offered, of an entry made to work always since
    const RS = run({ play: true, sys: sysF('gm'), ch: { values: { f_fm: [{ id: 'w_l1', defId: 'i_stance', qty: 1, lvl: 1, on: false }, { id: 'w_o1', qty: 1, lvl: 1, on: false, def: { name: 'Stance', category: 'Form', stats: { cpA: 5 }, mods: [dgA(1)] } }] } },
        msg: { sheet: { name: 'Vex', abilities: { lightsaberForms: [{ name: 'Stance', level: 1, active: false }, { name: 'Stance', level: 1, active: false }] } } } });
    const sQ = (Sx.cleanUploads(RS.camp.uploads)[0] || { changes: [] }).changes.map(c => [c.kind, c.def || null, c.twin || null]); delete RS.camp.system.items.filter(e => e.id === 'i_stance')[0].modsOn;
    const AS = applyGm(RS), sRow = twinsOf(RS.ch.values, 'f_fm');
    check('a later upload for review (F11b): a second row offered the switch of an entry whose changes work while switched on takes, at Apply, the switch as the host holds the entry then — made to work always since, the row\'s changes work always, and it adds them while switched off',
        j(sQ) === j([['def', { stats: { cpA: 5 }, mods: [dgA(1)], modsOn: true }, 'i_stance']]) && j(AS.done) === j([['c_m', 1, 1]]) && j(sRow) === j([['Stance', false, [dgA(1)], false]]) && at(RS, 'f_dg') === 10,
        j([sQ, AS, sRow, at(RS, 'f_dg')]));
    // R6: the entry's price read whatever the case its keys are spelt in (a visible pack's entry as the host holds it)
    const hostPk2 = Object.assign({}, hostPk, { stats: { BP: 0, PER: 2 } }), stubL2 = Object.assign({}, stubL, { entry: id => (id === 'i_pk' ? hostPk2 : null), entryFor: id => (id === 'i_pk' ? hostPk2 : null) });
    const PK2 = run({ sys: sysG('gm', true), packs, lib: stubL2, libCats: { show: ['Trait'], hide: [] }, msg: { sheet: poises } });
    check('a file with one entry twice (making, F11b): where the entry\'s price is spelt in another case than the list\'s, the second row is still read as priced as the entry is and takes its changes as the host holds them',
        j(shape(PK2.ch.values).adv) === j([['i_pk', 2, false, 1], ['own', 'Poise', 2, false, { bp: 0, per: 2 }, pkM]]) && j(PK2.answer) === j(PK.answer), j([shape(PK2.ch.values).adv, PK2.answer]));
    // R6 / R7: a queue from a save marks rows by hand (the GM's queue is never a player's word): a mark lends only to a row priced as its entry is,
    // and an add change itself names no entry (its op does)
    const RQ = run({ play: true, sys: sysF('gm'), ch: { values: { f_adv: [{ id: 'w_l1', defId: 'i_calm', qty: 1, lvl: 2 }] } }, msg: { sheet: { name: 'Vex' } } });
    const addQ = (id, rw, def, lv, twin, top) => Object.assign({ id, kind: 'add', f: 'f_adv', label: 'Advantages: ' + def.name, from: '', to: def.name, accept: true, ops: [Object.assign({ op: 'custom', rowId: rw, def }, twin ? { twin } : {}), { op: 'set', rowId: rw, facts: { lvl: lv } }] }, top ? { twin: top } : {});
    RQ.camp.uploads = [{ id: 'up_q1', charId: 'c_m', from: 'u_a', name: 'Pat', at: 1, changes: [addQ('u_q1', 'w_x1', { name: 'Plain', category: 'Trait', stats: { bp: 5 } }, 0, 'i_calm'),
        addQ('u_q2', 'w_x2', { name: 'Calm', category: 'Trait', stats: { bp: 0, per: 2, granted: 3 } }, 2, 'i_calm'), addQ('u_q3', 'w_x3', { name: 'Calm', category: 'Trait', stats: { bp: 0, per: 2 } }, 2, null, 'i_calm')] }];
    const cq = (Sx.cleanUploads(RQ.camp.uploads)[0] || { changes: [] }).changes.map(c => ['twin' in c, (c.ops || []).map(q => q.twin || null)]), AQ = applyGm(RQ);
    const qRows = (RQ.ch.values.f_adv || []).filter(r => !r.defId).map(r => [r.id, r.def.name, r.def.mods || null]);
    check('the GM\'s queue (F11b): a row marked with an entry it is not priced as takes nothing of that entry\'s changes, a row priced as it is (with granted points of its own) takes them as the host holds them, and an add change keeps no mark of its own — only its op names the entry, so an unmarked op beside one lends nothing',
        j(cq) === j([[false, ['i_calm', null]], [false, ['i_calm', null]], [false, [null, null]]]) && j(AQ.done) === j([['c_m', 3, 3]]) && j(qRows) === j([['w_x1', 'Plain', null], ['w_x2', 'Calm', [dxA(2)]], ['w_x3', 'Calm', null]]),
        j([cq, AQ, qRows]));
    // R3: a player's own edit of a row's changes (the real char-item handler, sliced, with the real delta): the changes the host set on fields they cannot see stay
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); return i < 0 || k < 0 ? '' : src.slice(i, k); })();
    const editRun = dx => {
        const sys = Sx.cleanSystem({ v: 1, name: 'E', rolls: [], fields: [{ id: 'f_dg', key: 'Dodge', label: 'Dodge', kind: 'number', vis: 'all', edit: 'gm', def: 8 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: dx, edit: 'gm', def: 10 },
            L('f_ft', 'Feats', 'Trait', { noQty: true, custom: true, on: { label: 'Active' } })], items: [] }, { F: Fx, gmView: true });
        const own = (id, name, mods) => ({ id, qty: 1, lvl: 0, on: false, own: 1, def: { name, category: 'Trait', icon: '', notes: '', vis: 'all', mods, modsOn: true } });
        const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ft: [own('w_t', 'Calm', [dgA(1), dxA(2)]), own('w_u', 'Plain', [dgA(1)])] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        const out = { answer: [], owner: [], mate: [], all: [] }, box = b => m => { packCheck(m); const c = JSON.parse(j(m)); b.push(c); out.all.push(c); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        const row = id => { const r = camp.chars.c_1.values.f_ft.find(x => x.id === id) || { def: {} }; return [r.def.mods || null, r.def.modsOn === true]; };
        const send = (rid, rowId, mods) => { out.answer.length = 0; out.owner.length = 0; H({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_ft', op: 'custom', rowId, def: { mods } }, { peer: 'pA', send: box(out.answer) });
            const ow = (((out.owner[out.owner.length - 1] || {}).values || {}).f_ft || []).find(x => x.id === rowId) || { def: {} }; return { answer: out.answer.slice(), host: row(rowId), mine: [ow.def.mods || null, ow.def.modsOn === true] }; };
        const e1 = send('r1', 'w_t', [dgA(2)]), e2 = send('r2', 'w_t', null), e3 = send('r3', 'w_t', [dgA(3)]), e4 = send('r4', 'w_t', []);
        const e5 = send('r5', 'w_t', Array.from({ length: Sx.LIMITS.effectMods }, (_, i) => dgA(i + 1))), e6 = send('r6', 'w_u', null);
        return { e1, e2, e3, e4, e5, e6, all: out.all, ok: ciSrc.length > 0 && ntSrc.length > 0 };
    };
    const EG = editRun('gm'), EV = editRun('all'), ack = rid => j([{ type: 'char-ack', rid }]);
    check('a player\'s own edit of a row\'s changes (F11b, the host\'s char-item handler, run for real): the changes the host set on a field they cannot see stay, after their own, after an edit and after clearing with nothing or an empty list, with the row\'s switch; a player who fills the row with their own keeps all of theirs (their copy never shows fewer than they sent); a row with nothing hidden is cleared of its changes and its switch as before; a field they may see is theirs to change',
        EG.ok && j(EG.e1.host) === j([[dgA(2), dxA(2)], true]) && j(EG.e2.host) === j([[dxA(2)], true]) && j(EG.e3.host) === j([[dgA(3), dxA(2)], true]) && j(EG.e4.host) === j([[dxA(2)], true])
        && j(EG.e5.host[0]) === j(Array.from({ length: Sx.LIMITS.effectMods }, (_, i) => dgA(i + 1))) && EG.e5.host[1] === true && j(EG.e5.mine[0]) === j(EG.e5.host[0]) && j(EG.e6.host) === j([null, false])
        && j(EV.e1.host) === j([[dgA(2)], true]) && j(EV.e2.host) === j([null, false]),
        j([EG.e1.host, EG.e2.host, EG.e3.host, EG.e4.host, EG.e5.host, EG.e6.host, EV.e1.host, EV.e2.host]));
    check('a player\'s own edit of a row\'s changes (F11b): the answer is the plain acknowledgement, the same whether a hidden change was kept or not, and their copy shows their own changes alone — with the switch while they have one, without either once they cleared theirs; nothing sent to anyone names the hidden field',
        ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].every((k, i) => j(EG[k].answer) === ack('r' + (i + 1)) && j(EV[k].answer) === j(EG[k].answer))
        && j(EG.e1.mine) === j([[dgA(2)], true]) && j(EG.e2.mine) === j([null, false]) && j(EG.e3.mine) === j([[dgA(3)], true]) && j(EG.e4.mine) === j([null, false]) && j(EG.e6.mine) === j([null, false])
        && EG.all.length > 0 && !/f_dx/.test(j(EG.all)),
        j([EG.e1, EG.e2, EG.e3, EG.e4, EG.e6.mine]));
    // R5: the GM's finder fails closed: a library that cannot hand out a GM-only pack's entry as its GM-only copy (no entryFor, or none for that id)
    const stubNo = { state: () => 'ready', entriesOf: pid => (pid === 'p_all' ? [hostPk] : pid === 'p_gm' ? [rawIw] : []) }, stubNull = Object.assign({}, stubNo, { entryFor: () => null });
    const fOf = lb => { const f = new Function('window', sfSrc + '\nreturn sbFinder;')({ wpLibrary: lb })({ library: { packs } }, sysG('gm')); return { iw: f('Iron Will'), pk: f('Poise') }; };
    const fNo = fOf(stubNo), fNull = fOf(stubNull);
    const flatIw = lb => { const r = run({ play: true, sys: sysG('gm', true), packs, lib: lb, realFinder: true, msg: { sheet: irons } }), up = Sx.cleanUploads(r.camp.uploads)[0] || { changes: [] }; return [].concat.apply([], up.changes.map(c => c.ops || [])).filter(q => q.op === 'custom').map(q => [q.def, 'twin' in q]); };
    const flatW = [[{ name: 'Iron Will', category: 'Trait', stats: { bp: 4 } }, false]];
    check('the GM\'s finder of entries by name (sheets.js, run for real, F11b): where the library has no GM-only copy to hand out (no lookup, or none for that entry) a GM-only pack\'s entry is still handed out GM-only, as a copy (the pack\'s entry keeps its own mark), and a visible pack\'s as it is; a file holding it twice then gives a second row of the file\'s name and points only',
        [fNo, fNull].every(f => f.iw.length === 1 && f.iw[0].vis === 'gm' && f.iw[0] !== rawIw && f.iw[0].id === 'i_iw' && f.iw[0].notes === 'Unbending.' && f.pk.length === 1 && f.pk[0] === hostPk) && rawIw.vis === 'all'
        && j(flatIw(stubNo)) === j(flatW) && j(flatIw(stubNull)) === j(flatW),
        j([fNo, fNull, flatIw(stubNo), flatIw(stubNull)]));
})());
// fold M2: one item's rule on its way to a player (wireWbItem), lifted out of sanitizeItem so one item can later be sent alone; a whole
// map's copy comes out byte for byte as it did before
{
    const [siNew, wwi] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({});
    const wireNumF = new Function((src.match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0] + '\nreturn wireNum;')();
    // sanitizeItem as it stood before fold M2 (a35b807), kept here to compare against
    const siOld = (function(window, wireNum) {
        return function sanitizeItem(item) {
            if (!item) return item;
            if (item.type === 'planner') return null;
            if (item.type === 'doc') return window.wpDocRender ? window.wpDocRender.cleanDoc(item) : null;
            if (item.type !== 'map') return item;
            var m = JSON.parse(JSON.stringify(item), wireNum);
            delete m.fogLit; delete m.lightsCapped;
            (m.rooms || []).forEach(function(r) {
                delete r.notes;
                delete r.handoutId;
                (r.characters || []).forEach(function(c) { delete c.info; delete c.ref; });
            });
            m.links = (m.links || []).map(function(lk) {
                if (!(lk[3] && typeof lk[3] === 'object')) return lk;
                var keep = lk.slice(0, 3); if (lk[3].label) keep.push({ label: lk[3].label }); return keep;
            });
            m.whiteboard = (m.whiteboard || []).filter(function(w) { return !w.gmNoteFor; }).map(function(w) {
                if (!w.hidden) {
                    if (w.sheet || w.gmInfo || w.frame) { w = JSON.parse(JSON.stringify(w)); delete w.sheet; delete w.gmInfo; delete w.frame; }
                    return w;
                }
                return { id: w.id, type: 'rect', hidden: true, x: w.x, y: w.y, w: w.w, h: w.h, rot: w.rot || 0, layer: w.layer, locked: true };
            });
            return m;
        };
    })({}, wireNumF);
    const torchM = { bright: 20, dim: 40, unit: 'ft', name: 'Torch' };
    const fixtures = [
        () => ({ id: 'm1', type: 'map', fog: { on: true, mode: 'auto' }, fogLit: ['1,1'], lightsCapped: true,
            rooms: [{ id: 'r1', notes: 'GM', handoutId: 'h1', characters: [{ id: 'c1', info: 'x', ref: 'y', name: 'Bo' }] }, { id: 'r2' }],
            links: [['r1', 'r2', 1, { label: 'Door', notes: 'trap' }], ['r2', 'r3', 0], ['r3', 'r1', 2, { notes: 'only a note' }]],
            whiteboard: [
                { id: 'w1', type: 'image', isChar: true, ownerId: 'u_a', x: 1e20, y: -1e20, w: 50, h: 50, rot: 30, front: 90, sheet: { hp: 5 }, gmInfo: 'secret', frame: { src: 'a', x: 1, y: 2, s: 3 }, light: torchM },
                { id: 'w2', type: 'image', isChar: true, hidden: true, x: 5, y: 6, w: 50, h: 50, front: 45, layer: 'tokens', sheet: { hp: 1 }, gmInfo: 'hidden secret', light: torchM },
                { id: 'w3', type: 'rect', gmNoteFor: 'r1', x: 0, y: 0, w: 10, h: 10, text: 'GM note' },
                { id: 'w4', type: 'text', x: 3, y: 4, text: 'Hello', fontSize: 1e20 },
                { id: 'w5', type: 'image', isChar: true, waiting: true, ownerId: 'u_b', x: 7, y: 8, w: 50, h: 50 },
                { id: 'w6', type: 'light', x: 9, y: 10, w: 20, h: 20, light: { bright: 2, dim: 4, off: true, unit: 'cells', name: 'Lamp' } },
                { id: 'w7', type: 'image', sheet: null, gmInfo: '', frame: 0, x: 1, y: 1 },
                { id: 'w8', type: 'rect', hidden: true, gmNoteFor: 'r2', x: 1, y: 1 },
                { id: 'w9', type: 'rect', hidden: true, x: 1e20, y: 2, w: 3, h: 4, rot: Infinity, layer: 'bg', text: 'the key' },
                { id: 'w10', type: 'image', hidden: 1, x: 1, y: 2, rot: NaN, sheet: { a: 1 } },
                { id: 'g1', type: 'image', isChar: true, gmInfo: 'a secret alone' }, { id: 's1', type: 'image', sheet: { hp: 1 } }, { id: 'f1', type: 'image', frame: { src: 'k' } },
                { id: 'v0', type: 'image', hidden: false, x: 1, y: 1, front: 30 }, { id: 'v1', type: 'image', hidden: 0, x: 2, y: 2, front: 60 },
                'a stray string', '', 0
            ] }),
        () => ({ id: 'm2', type: 'map' }),
        () => ({ id: 'm3', type: 'map', whiteboard: [], rooms: [{ id: 'r', characters: [] }], links: [] }),
        () => ({ id: 'p1', type: 'planner', content: 'GM' }),
        () => ({ id: 'd1', type: 'doc', blocks: [] }),
        () => ({ id: 'i1', type: 'image', src: '/saves/images/x.png' }),
        () => null
    ];
    const same = fixtures.map(fx => { const a = fx(), b = fx(), before = JSON.stringify(a); const n = siNew(a), o = siOld(b); return [JSON.stringify(n) === JSON.stringify(o), JSON.stringify(a) === before, JSON.stringify(n).slice(0, 60)]; });
    const img = fixtures[5](), m1out = siNew(fixtures[0]());
    check('fold M2: sanitizeItem (run for real) with its per-item rule lifted into wireWbItem gives, byte for byte, the copy it gave before (a hidden token, a GM-note card, a hidden one, sheet, GM note and kept original, 1e20, a text box, a waiting token, a light, falsy GM prep, a stray entry; a map with nothing, a planner, a page, a picture) and never touches the host\'s own map',
        same.every(s => s[0] && s[1]) && siNew(img) === img && m1out.whiteboard.length === 16 && m1out.whiteboard.find(w => w && w.id === 'v0').front === 30 && m1out.whiteboard.find(w => w && w.id === 'v1').front === 60 && !/secret|GM note|"sheet":\{|"frame":\{/.test(JSON.stringify(m1out)),
        JSON.stringify(same));
    const stubKeys = Object.keys(new Function((fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'cleanup.js'), 'utf8').match(/var STUB_KEYS = \{[^}]*\};/) || ['var STUB_KEYS = {};'])[0] + '\nreturn STUB_KEYS;')());
    const note = { id: 'n', type: 'rect', gmNoteFor: 'r1', x: 1 }, hid = { id: 'h', type: 'image', hidden: true, x: 1e20, y: 2, w: 3, h: 4, rot: Infinity, front: 45, layer: 'bg', sheet: { a: 1 }, light: torchM };
    const hidBefore = JSON.stringify(hid), stubF = wwi(hid, false), stubT = wwi(JSON.parse(JSON.stringify(hid), wireNumF), true);
    const wantStub = { id: 'h', type: 'rect', hidden: true, x: 1e15, y: 2, w: 3, h: 4, rot: 0, layer: 'bg', locked: true };
    const tok = { id: 't', type: 'image', isChar: true, x: 1e20, y: 1, sheet: { hp: 3 }, gmInfo: 'g', frame: { src: 'k' }, light: torchM }, tokBefore = JSON.stringify(tok), tokF = wwi(tok, false);
    const plain = { id: 'p', type: 'rect', x: 1, y: 2 }, prep = { id: 'q', type: 'image', x: 1, sheet: { a: 1 }, gmInfo: 'g', frame: { src: 'k' } }, prepT = wwi(prep, true);
    const vis = { id: 'v', type: 'image', isChar: true, x: 1e20, light: torchM }, visBefore = JSON.stringify(vis), visF = wwi(vis, false);
    const oneEach = [{ id: 'g', gmInfo: 'g' }, { id: 's', sheet: { a: 1 } }, { id: 'f', frame: { src: 'k' } }], oneF = oneEach.map(w => wwi(w, false)), oneT = oneEach.map(w => wwi(JSON.parse(JSON.stringify(w)), true));
    check('fold M2: wireWbItem (run for real) gives null for a GM-note card, and a hidden item exactly the position-only stub (its keys the ones cleanup.js knows a stub by), bounded, with no facing, sheet or light, whether it was cloned already or not',
        wwi(note, false) === null && wwi(note, true) === null && JSON.stringify(stubF) === JSON.stringify(wantStub) && JSON.stringify(stubT) === JSON.stringify(wantStub)
        && JSON.stringify(Object.keys(stubF).sort()) === JSON.stringify(stubKeys.slice().sort()) && JSON.stringify(hid) === hidBefore,
        JSON.stringify([stubF, stubT, stubKeys]));
    check('fold M2: wireWbItem on an item sent alone (cloned = false) copies and bounds it first and never touches the host\'s own item; on sanitizeItem\'s own clone (cloned = true) it works in place: a plain item is the same object, GM prep is deleted from it with no second clone',
        tokF !== tok && JSON.stringify(tok) === tokBefore && tokF.x === 1e15 && !('sheet' in tokF) && !('gmInfo' in tokF) && !('frame' in tokF) && JSON.stringify(tokF.light) === JSON.stringify(torchM) && tokF.isChar === true
        && wwi(plain, true) === plain && JSON.stringify(plain) === JSON.stringify({ id: 'p', type: 'rect', x: 1, y: 2 }) && prepT === prep && JSON.stringify(prep) === JSON.stringify({ id: 'q', type: 'image', x: 1 })
        && visF !== vis && visF.x === 1e15 && JSON.stringify(vis) === visBefore && visF.light !== vis.light && JSON.stringify(visF.light) === JSON.stringify(torchM)
        && oneF.concat(oneT).every(w => !('gmInfo' in w) && !('sheet' in w) && !('frame' in w)) && oneEach.every(w => Object.keys(w).length === 2),
        JSON.stringify([tokF, prepT, visF, oneF, oneT]));
    const siAt = src.indexOf('function sanitizeItem('), siEnd = src.indexOf('\n}\n', siAt) + 3, wwAt = src.indexOf('function wireWbItem(');
    const gap = src.slice(siEnd, wwAt).split('\n').filter(Boolean), siBody = src.slice(siAt, siEnd);
    check('fold M2: wireWbItem sits directly after sanitizeItem (comments only between), which calls it once on its own clone, and the hidden stub is written once in net.js',
        wwAt > siEnd && gap.every(l => /^\/\/ /.test(l)) && (siBody.match(/wireWbItem\(w, true\)/g) || []).length === 1 && !/gmNoteFor|hidden: true/.test(siBody)
        && (src.match(/function wireWbItem\(/g) || []).length === 1 && (src.match(/type: 'rect', hidden: true/g) || []).length === 1,
        JSON.stringify(gap));
}
// fold M3: a player's page as the 'fogDiff' branch and applyFogDiff see it, both sliced by their markers and run for real with the real
// cleaners (cleanHostWbItem, cleanHostLight and cleanWaitingItem from net.js, sanitizeRichText as it runs under Node, fogcore's cleanFogLit
// and cleanLight) and the real client broadcast. Each page keeps its own state, net and recorders
function mkFogClient(FCx, o) {
    o = o || {};
    const lnM = k => { const i = src.indexOf(k); if (i < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, src.indexOf('\n', i)); };
    const branch = between('// [netcheck:fogdiff-start]', '// [netcheck:fogdiff-end]', 'fogdiff'), apply = between('// [netcheck:fogdiffapply-start]', '// [netcheck:fogdiffapply-end]', 'fogdiffapply');
    const rich = lnM('function escAttr(s) {') + '\n' + fnSrc('function sanitizeRichText(', '\n}\n', 'sanitizeRichText') + '\n}\n';
    const rec = { asked: [], renders: 0, redraws: 0, invalidated: 0, saves: 0, other: [] };
    const hostConn = { peer: 'h', open: true, send(m) { packCheck(m); rec.asked.push(JSON.parse(JSON.stringify(m))); } };
    const net = { role: 'client', active: true, foreign: true, syncedPeer: 'h', stream: false, applyingRemote: false, myId: o.myId || 'u_me', conns: [hostConn], roster: {} };
    const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: o.active === undefined ? 'mA' : o.active, items: o.items || {} } } } };
    if (o.other) state.appState.campaigns.k2 = { id: 'k2', activeItemId: null, items: o.other };
    const win = { wpFogCore: o.core || FCx, wpFog: { invalidateVision() { rec.invalidated++; }, redraw() { rec.redraws++; } }, save() { rec.saves++; } };
    const recv = new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'cleanWaitingItem', 'onLocalSave', 'save',
        '"use strict";\n' + lnM('function own(o, k) {') + '\n' + lnM('function validKey(k) {') + '\n' + lnM('function campOf(id) {') + '\n' + broadcastSrc + '\n' + rich
        + lnM('function cleanHostWbItem(w) {') + '\n' + lnM('function cleanHostLight(w) {') + '\n' + lnM('function cleanHostTokSenses(w) {') + '\n' + apply + '\nreturn function(msg, conn) {\n' + branch + '\n};')(
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
        && pI.rec.saves === 0 && pI.rec.asked.length === 0 && !/save\(|onLocalSave|wpHist|sendItem|type: 'item'/.test(between('// [netcheck:fogdiffapply-start]', '// [netcheck:fogdiffapply-end]', 'fogdiffapply') + between('// [netcheck:fogdiff-start]', '// [netcheck:fogdiff-end]', 'fogdiff')),
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

    // (8) where it sits: a client branch (the host's branches still 24), and nothing sends the message yet
    check('fold M3: the catch-up is a client branch only (the host\'s branches stay 24, none new); the host builds it in one place only, its catch-up of a copy (fold M7)',
        (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 24 && /\} else if \(msg\.type === 'fogDiff' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:fogdiff-start\]/.test(src)
        && (src.match(/msg\.type === 'fogDiff'/g) || []).length === 1 && (src.match(/type: 'fogDiff'/g) || []).length === 1 && /function fogCatchUp\([^]*?type: 'fogDiff'/.test(between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove')));
})());
// fold M4: an open drag is judged where it began. The real pos gate, patch path, relay, sends, kick, senses and the fogmove slice are compiled as
// ONE module over the real fog.js, so they share the host's open drags; timers are fakes, the clock is the world's, every send packs for the wire
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx4 = await import(url('dicecore.js'));
    const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const fogSrc = fogT.slice(fogT.indexOf('function core() {'), fogT.indexOf('/* ---------- the overlay'));
    const realAllow = clock => new Function('window', 'Date', lineOf('var _lim = Object.create(null);') + '\n' + lineOf('function allow(') + '\nreturn allow;')({ wpDiceCore: Dx4 }, { now: clock });   // fold M9: the host's real limiter, on the world's clock
    const buildFog4 = () => new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { fogDropIds: fogDropIds, fogLitFor: fogLitFor, canSeePoint: canSeePoint, invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor, tokenSightCells: tokenSightCells, viewersFor: viewersFor, moveBlocked: moveBlocked, moveCells: moveCells };');
    const whole4 = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const bw = n => between('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]', n);
    const modSrc = ['var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {}, bannedIds = {};', siSrc(), bw('foglit'), fnSrc('function anyFog(', '\n}\n', 'anyFog') + '\n}\n', lineOf('function mapFogged('),
        fnSrc('function quickHash(', '\n}\n', 'quickHash') + '\n}\n', fnSrc('function playerStroke(', '\n}\n', 'playerStroke') + '\n}\n', whole4('net.sendItem = function('), whole4('net.broadcastItemFiltered = function('), whole4('net.itemGone = function('), whole4('net.kickPlayer = function('), bw('sensesmoved'), bw('combats'), lineOf('var _saveSoon = null;'), lineOf('function saveRemoteSoon()'), bw('bpos'),
        src.slice(src.indexOf('var POSTURE_SET = '), src.indexOf('function sanitizeItem(')), ownKeySrc, bw('pos'), bw('patch'), bw('fogdiffapply'), bw('fogmove'),
        'return { pos: handlePos, patch: applyClientItemFiltered, landed: fogLanded, sweep: fogDragSweep, open: openDrag, opens: openDrags, end: dragEnd, live: fogOwnLive, clean: sanitizeItem, combats: broadcastCombats, targets: broadcastTargets, drags: function() { return _dragFrom; }, stale: FOG_DRAG_STALE_MS,',
        'held: function() { return _fogHeld; }, seedSnap: fogSeedSnapshot, forgetAll: fogForgetAll, hash: quickHash, copy: fogCopyFor,',
        'arm: fogArm, fire: fogMoveFire, catchUp: fogCatchUp, key: fogKey, windowMs: fogWindowMs, pend: function() { return _fogPend; }, cost: function() { return _fogCost; }, sensesSig: function() { return _sensesSig; }, sensesForget: sensesForget,',
        'item: function(msg, conn) {', bw('itempatch'), '}, threatsIn: function(msg, conn) {', bw('threats'), '} };'].join('\n');
    const NAMES4 = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'sendFailed', 'peerProfileId', 'lim', 'pushChat', 'state', 'itemDelta', 'broadcast', '_lastSent', 'setTimeout', 'clearTimeout', 'save', 'toast', 'logEvent', 'renderRoster', 'dropWaitingFor', 'allow', 'render', 'broadcastRoster', 'checkRoomHandouts', 'applyPosToDom', 'playerStroke', 'bellOut', 'renderNotepad', 'fogNow'];
    const build4 = new Function(...NAMES4, modSrc);
    const J = v => JSON.stringify(v);
    const T = (id, owner, charId, c, r, more) => Object.assign({ id, type: 'image', isChar: true, charName: id, x: c * 50, y: r * 50, w: 50, h: 50, rot: 0, front: 0 }, owner ? { ownerId: owner } : {}, charId ? { charId } : {}, more || {});
    const M = (id, wb, fog) => ({ id, type: 'map', meta: { title: id, gridType: 'square', cellValue: 5, cellUnit: 'ft' }, rooms: [], links: [], fog: Object.assign({ on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } }, fog || {}), whiteboard: wb });
    const sysM = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }] }, { F: Fx, gmView: true });
    // mA: a dark 5 ft map; Ana's tA at (2,2) sees 12 cells, the orc at (15,2) is 13 away (seen from (5,2)); Bo's tB at (2,4) sees tA, never the orc.
    // mB: tA2 and orc2 the same way. mC: a facing cone of 90 degrees with tC and a bat 4 cells off. mO: Bo's other map
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
        const state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
        const win = { wpFogCore: FCx, wpSystemCore: Sx, wpFormula: Fx, wpDiceCore: null, wpVtt: { on: k => feats[k] !== false, campaignOn: k => feats[k] !== false, mode: () => 'host' }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } };
        W.fog = buildFog4()(win, { getElementById: () => null }, () => null, () => camp, state);
        win.wpFog = Object.assign({}, W.fog, { moveBlocked: (map, w, fx, fy, tx, ty) => { W.asked.push([fx, fy, tx, ty]); return !!(o.wall && o.wall(fx, fy, tx, ty)); } });
        if (o.fogLitFor) win.wpFog.fogLitFor = o.fogLitFor;
        W.winRef = win;   // fold M7: a case sets the GM's gesture on this page's own window   // a stand-in where a case needs lit cells on a copy without building the corner that gives them
        const setT = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearT = id => { const t = timers[id - 1]; if (t) t.fn = null; };
        const bc = (m, ex) => { packCheck(m); W.net.conns.forEach(c => { if (c !== ex && c.open && Object.prototype.hasOwnProperty.call(W.net.roster, c.peer)) c.send(m); }); };
        W.api = build4(W.net, () => Sx, win, peer => !!(o.paused && o.paused(peer)), () => camp, o.failed ? (e => { o.failed.push(e.message); }) : (e => { throw e; }), c => (W.net.roster[c.peer] ? W.net.roster[c.peer].id : null), { allow: () => true }, () => {}, state, () => null, bc, {}, setT, clearT,
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
    W1.clearSent(); W1.api.combats(); W1.api.targets(); const ro1 = { rows: W1.msg(W1.a1, 'combats').combats.mA.rows.map(r => r.name + ':' + r.tokId), targ: Object.keys(W1.msg(W1.a1, 'targets').targets) };
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
    check('fold M4: a token the GM hides mid-drag goes back where it began too, and no one is sent its facing with it (a hidden token\'s pos carries none)',
        J(hidden.place) === J([100, 100, 0, 30]) && hidden.entry && hidden.W.net.conns.every(c => c.sent.filter(x => x.type === 'pos').every(p => p.front === 0)) && hidden.a2Pos === 1,
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
    // inside one outer judgement both give the owner the live place; fogLanded(map) holds that map's drags only; a held drag read through openDrag
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
    check('fold M4: the player\'s own token at its live place goes on their own copy only, never on the clone the others\' copies share (a map where nobody\'s copy drops anything); two sends inside one outer judgement both give them the live place and everyone else the start; fogLanded on one map holds that map\'s drags only; a held drag read through openDrag is the drag and its facings are left alone',
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
    const fmSrc5 = bw('fogmove'), otherSrc5 = src.slice(0, src.indexOf('// [netcheck:fogmove-start]')) + src.slice(src.indexOf('// [netcheck:fogmove-end]'));
    const scripts5 = fs.readdirSync(path.join(__dirname, '..', 'system', 'app', 'scripts')).filter(f => /\.js$/.test(f) && f !== 'net.js').filter(f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').indexOf('_fogHeld') >= 0);
    check('fold M5 (source): the record is named only inside its slice and in no other script; each whole send seeds after its try (a send that throws returns first); the snapshot seeds only once it went out, after its try; the close handler, kickPlayer, itemGone, both unfogged sends and a new table forget',
        fmSrc5.indexOf('var _fogHeld') >= 0 && otherSrc5.indexOf('_fogHeld') < 0 && scripts5.length === 0
        && (src.match(/catch \(e\) \{ sendFailed\(e\); return; \}\n\s*if \(typeof fogSeed === 'function'\) fogSeed\(conn, itemId, out\);/g) || []).length === 2
        && /conn\.send\(snap\); snapOk = true;/.test(src) && /\n\s*if \(snapOk && typeof fogSeedSnapshot === 'function'\) fogSeedSnapshot\(conn, snap\);/.test(src)
        && /fogDragSweep\(\);[^\n]*\n\s*if \(typeof fogForgetConn === 'function'\) fogForgetConn\(conn\.peer\);/.test(src) && /if \(typeof fogForgetConn === 'function'\) keys\.forEach\(fogForgetConn\);/.test(whole4('net.kickPlayer = function('))
        && /fogForgetMap\(itemId\)/.test(whole4('net.itemGone = function(')) && /fogForgetAll\(\);/.test(fnSrc('function startHosting(forceFresh) {', '\n    diceSessionReset(true);', 'startHosting')), J(scripts5));

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

    // the player walked away from, and up to again; content: a GM-hidden creature arrives as its stub, nothing of the GM's rides along, no own token
    const H = S7(); H.camp.items.mA.whiteboard.push(T('ghost', '', 'c_n', 12, 20, { hidden: true, gmInfo: 'secret', sheet: { a: 1 }, frame: { src: 'k' } }));
    H.net.conns.forEach(c => { H.net.sendItem('k', 'mA', c); c.sent.length = 0; });
    H.move(H.a1, 'tA', 100, 1000, true); H.fire(150); const away = { b: H.b1.sent.filter(m => m.type !== 'pos').map(m => m.type + ':' + J(m.drop || '')), a: H.a1.sent.map(m => (m.add || []).map(a => a.item.id).join(',') + '/' + J(m.drop || [])), ghost: ((H.a1.sent[0] || {}).add || []).map(a => a.item).find(i => i.id === 'ghost'), agree: agree(H) };
    H.net.conns.forEach(c => { c.sent.length = 0; }); H.move(H.a1, 'tA', 100, 100, true); H.fire(150); const backM7 = { b: H.b1.sent.filter(m => m.type === 'fogDiff').map(m => (m.add || []).map(a => a.item.id + '@' + a.item.x + ',' + a.item.y + '<' + a.after).join(',')), agree: agree(H) };
    const all7 = H.net.conns.concat([]).reduce((acc, c) => acc.concat(c.sent.filter(m => m.type === 'fogDiff')), []).concat(G.a1.sent);
    const noOwn = [G, H].every(W => W.net.conns.every(c => c.sent.filter(m => m.type === 'fogDiff').every(m => (m.add || []).every(a => a.item.ownerId !== (W.net.roster[c.peer] || {}).id) && (m.drop || []).every(id => { const t = W.tok(id); return !t || t.ownerId !== (W.net.roster[c.peer] || {}).id; }))));
    check('fold M7: the player walked away from loses the mover\'s token and the one walked up to gets it back at the host\'s own place, after what their copy holds; a creature the GM hid arrives as its position-only stub; no catch-up carries a GM note, a sheet, a kept original or anyone\'s own token',
        J(away.b) === J(['fogDiff:["tA"]']) && J(away.a) === J(['ghost/["tB"]']) && J(Object.keys(away.ghost).sort()) === J(['h', 'hidden', 'id', 'locked', 'rot', 'type', 'w', 'x', 'y']) && away.agree
        && J(backM7.b) === J(['tA@100,100<null']) && backM7.agree && noOwn && !/secret|"sheet"|"gmInfo"|"frame"|gmNoteFor/.test(J(all7)),
        J([away, backM7]));

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
    const R7 = S7(); R7.net.combats = { mA: { mapId: 'mA', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Ana', tokId: 'tA' }, { id: 'r_o', name: 'Orc', tokId: 'orc' }] } }; R7.net.targets = { u_b: { id: 'orc', mapId: 'mA', name: 'Bea' } };
    R7.move(R7.a1, 'tA', 250, 100, true); R7.fire(150); const ros7 = { a1: kinds(R7.a1), rows: R7.msg(R7.a1, 'combats').combats.mA.rows.map(r => r.name), targ: Object.keys(R7.msg(R7.a1, 'targets').targets), b: kinds(R7.b1) };
    R7.net.conns.forEach(c => { c.sent.length = 0; }); R7.move(R7.a1, 'tA', 100, 100, true); R7.fire(150); ros7.back = R7.msg(R7.a1, 'combats').combats.mA.rows.map(r => r.name); ros7.backTarg = Object.keys(R7.msg(R7.a1, 'targets').targets);
    const R8 = S7(); R8.net.combats = { mO: { mapId: 'mO', round: 1, turn: 0, rows: [] } }; R8.move(R8.a1, 'tA', 250, 100, true); R8.fire(150); const noFight = kinds(R8.a1);
    const litB = S7({ fogLitFor: (pid, camp, map) => (pid === 'u_b' && map.id === 'mA' && map.whiteboard.find(w => w.id === 'tA').x > 200 ? { lit: [{ c: 9, r: 9, t: 2 }], capped: false } : null) });
    litB.net.conns.forEach(c => { litB.net.sendItem('k', 'mA', c); c.sent.length = 0; }); litB.move(litB.a1, 'tA', 250, 100, true); litB.fire(150); const lit7b = { b: litB.b1.sent.filter(m => m.type !== 'pos').map(m => m.type + ':' + J([m.add || null, m.drop || null, m.lit || null])), a: litB.a1.sent.map(m => J(m.lit || null)), view: litB.view(litB.b1).fogLit };
    litB.net.conns.forEach(c => { c.sent.length = 0; }); litB.move(litB.a1, 'tA', 100, 100, true); litB.fire(150); lit7b.off = litB.b1.sent.filter(m => m.type !== 'pos').map(m => J(m.lit)); lit7b.viewOff = litB.view(litB.b1).fogLit;
    const sysGm = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'gm' }] }, { F: Fx, gmView: true });
    const HS = S7({ system: sysGm }); HS.move(HS.a1, 'tA', 250, 100, true); HS.fire(150); const hidSight = kinds(HS.a1);
    check('fold M7: a copy the host holds no record of, more than 200 creatures to add, a message past 256 KB or an id past 256 characters each go as the whole copy, which is then recorded; the turn order and the pointers follow a change of what is held, only on a map with a fight or a pointer — a creature newly seen by its name, one no longer seen as Hidden; a light the player cannot see gives them its lit cells alone, and takes them away; a player whose Sight is GM-only still gets their landing',
        J(noRec7) === J([['item'], true]) && J(many7) === J(['item']) && J(big7) === J(['item']) && J(long7) === J(['item'])
        && J(ros7.a1) === J(['fogDiff', 'combats', 'targets']) && J(ros7.rows) === J(['Ana', 'Orc']) && J(ros7.targ) === J(['u_b']) && J(ros7.b) === J([]) && J(ros7.back) === J(['Ana', 'Hidden']) && J(ros7.backTarg) === J([]) && J(noFight) === J(['fogDiff'])
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
    RL.move(RL.a1, 'tA2', 250, 100, false, 'mB'); RL.net.conns.forEach(c => { c.sent.length = 0; }); RL.move(RL.a1, 'tA', 250, 100, true); RL.fire(150); const rl = (RL.msg(RL.a1, 'combats') || { combats: {} }).combats.mB;
    const SS = S7(); SS.api.sensesForget('u_a'); const ssBefore = Object.keys(SS.api.sensesSig()).filter(k => k.indexOf('u_a|') === 0).length; SS.move(SS.a1, 'tA', 250, 100, true); SS.fire(150); const ssAfter = Object.prototype.hasOwnProperty.call(SS.api.sensesSig(), 'u_a|mA');
    const OT = S7(); OT.camp.items.mA.whiteboard.push(T('tAnew', 'u_a', 'c_a', 3, 5)); OT.move(OT.a1, 'tA', 250, 100, true); OT.fire(150); const ownAdd = OT.a1.sent.filter(m => m.type === 'fogDiff').some(m => (m.add || []).some(a => a.item.id === 'tAnew')), ownAsk = OT.asks(OT.a1).length;
    const UF = S7(); UF.camp.items.mA.fog.on = false; UF.move(UF.a1, 'tA', 250, 100, true); const ufArmed = UF.timers.filter(t => t.fn && t.ms === 150).length;
    check('fold M7: the turn order follows only a change of what is held (lit cells alone send none) and is judged with every open drag at its start, one on another map too; a catch-up seeds what the player\'s copy was made by (senses); the player\'s own token the copy lacks is never added by it (the next whole copy brings it); a map without fog arms nothing; the light cap goes when it changes, both ways; the window reads a number only',
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

    const fm7 = bw('fogmove'), pos7 = bw('pos'), pat7 = bw('patch'), rest7 = src.slice(0, src.indexOf('// [netcheck:fogmove-start]')) + src.slice(src.indexOf('// [netcheck:fogmove-end]'));
    check('fold M7 (source): the fire\'s one timer lives in its slice, and its stores nowhere else; the pos gate reads where the token sees from once after the seat, records where the drag began at its first accepted move and arms after the save is asked for and before a portal is taken; the map copy reads each own token\'s key before anything lands (at the drag\'s start while one is open) and arms after the erased drawings go; nothing else arms',
        (fm7.match(/setTimeout\(/g) || []).length === 1 && !/_fogPend|_fogCost|_fogHeld/.test(rest7)
        && /if \(msg\.final && window\.wpSeatHex && window\.wpSeatHex\(w, map\)\) \{[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*var skN = skW === null \? null : window\.wpFog\.seenKeyOf\(map, w\), mvW = skW === null \|\| skN !== skW;/.test(pos7)
        && /broadcastPos\(msg, conn, camp, map, w\);\n[^\n]*frW\.lx = w\.x;[^\n]*\n\s*if \(frW\.sk === undefined\) frW\.sk = skW;/.test(pos7)
        && /saveRemoteSoon\(\);\n\s*if \(typeof fogArm === 'function' && skN !== null && frW\.sk !== skN\) fogArm\(msg\.itemId\);[^\n]*\n\s*net\.tokenDropped\(w, map\);/.test(pos7)
        && /var fkP = \[\];[^\n]*\n\s*msg\.item\.whiteboard\.forEach\(function\(w\) \{/.test(pat7) && /fkP\.push\(\[lw, fogKey\(liveItem, lw, typeof openDrag === 'function' \? openDrag\(msg\.itemId, lw\) : null\)\]\);\n\s*if \(\(lw\.isChar \|\| lw\.waiting\) && typeof moveRefused === 'function'\) \{/.test(pat7)
        && /if \(liveItem\.whiteboard\.length !== before\) \{ changed = true; if \(out\) out\.strokes = true; \}\n\s*if \(typeof fogArm === 'function' && fkP\.some\(function\(p\) \{ return fogKey\(liveItem, p\[0\]\) !== p\[1\]; \}\)\) fogArm\(msg\.itemId\);/.test(pat7)
        && (src.match(/fogArm\(/g) || []).length === 6 && /if \(window\.wpHostGesture === mapId\) \{ if \(typeof fogArm === 'function'\) fogArm\(mapId\); return; \}/.test(bw('sensesmoved')) && /net\.sendItem\(campT\.id, msg\.itemId, null, conn\);[^\n]*\n\s*if \(typeof fogArm === 'function'\) fogArm\(msg\.itemId\);/.test(bw('threats')) && /try \{ c\.send\(msg\); \} catch \(e\) \{ sendFailed\(e\); net\.sendItem\(camp\.id, m\.id, c\);/.test(fm7));

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
    const seatA9 = dmS9.indexOf("if (modeStr === 'visual' && state.gridType === 'hex' && multiDrag.some("), finA9 = dmS9.indexOf("window.wpNet.streamPos(item, true, dragMapId); // final, post-snap position"), loop9 = dmS9.indexOf('multiDrag.forEach(function(md) { if (md.item !== item && (md.item.isChar || md.item.waiting) && !md.item.hidden) window.wpNet.streamPos(md.item, true, dragMapId); });');
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
    check('fold M10: a Sight that has turned GM-only by the time its change fires sends nothing and arms nothing, even with the GM\'s gesture open (the hidden test comes first); a change of one player\'s Sight catches up only that player\'s connections, never another\'s stale copy; it is judged with an open drag at its start',
        J(hidLate) === J([[], 0, []]) && J(onlyHers) === J([]) && J(landedS) === J(['orc']), J([hidLate, onlyHers, landedS]));
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

    // senses S2a: a full sense on the host's judgement (the real fog.js vision half over the real sends): a creature in its reach is sent, one past it
    // dropped, its live moves relayed (canSeePoint); a sheet change that moves a sense's range catches its player's copies up in place; none when nothing moved
    const sysSn = list => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_sight', key: 'Sight', label: 'Sight', kind: 'number', def: 60, edit: 'owner', vis: 'all' }, { id: 'f_fs', key: 'ForceR', label: 'Force', kind: 'number', def: 0, vis: 'all' }], combat: list ? { senses: { list: list } } : {} }, { F: Fx, gmView: true });
    const snBy = n => [{ id: 'sn_force001', name: 'Force Sight', range: { by: 'n', n: n }, unit: 'ft', grade: 'full' }];
    const orcAt = W => { const t = W.tok('orc'); return [t.x + 25, t.y + 25]; };
    const wS = S7({ system: sysSn(snBy(65)) }), wN = S7({ system: sysSn(snBy(55)) }), wX = S7({ system: sysSn(null) });
    const snSeen = W => ({ a: W.view(W.a1, 'mA').ids.indexOf('orc') >= 0, a2: W.view(W.a2, 'mA').ids.indexOf('orc') >= 0, b: W.view(W.b1, 'mA').ids.indexOf('orc') >= 0, relay: W.fog.canSeePoint('u_a', W.camp, W.camp.items.mA, orcAt(W)[0], orcAt(W)[1]), relayB: W.fog.canSeePoint('u_b', W.camp, W.camp.items.mA, orcAt(W)[0], orcAt(W)[1]) });
    check('senses S2a (host): on a dark map the orc 13 cells off (her eyes see 12) reaches both of Ana\'s copies and her live relay through a sense of 65 ft; not through one of 55 ft or with none; Bo, 13.2 cells off, is never sent it',
        J(snSeen(wS)) === J({ a: true, a2: true, b: false, relay: true, relayB: false }) && J(snSeen(wN)) === J({ a: false, a2: false, b: false, relay: false, relayB: false }) && J(snSeen(wX)) === J(snSeen(wN)), J([snSeen(wS), snSeen(wN)]));
    const wF = S7({ system: sysSn([{ id: 'sn_force001', name: 'Force Sight', range: { by: 'field', field: 'f_fs' }, unit: 'ft', grade: 'full' }]) }), before2 = snSeen(wF);
    wF.camp.chars.c_a.values.f_fs = 65; wF.clearSent(); wF.net.sensesMoved('c_a'); const pend2 = Object.keys(wF.api.pend()).length + wF.timers.filter(t => t.fn && t.ms === 500).length; wF.fire(500);
    const got2 = { a1: wF.a1.sent.map(m => m.type + ':' + m.itemId), a2: wF.a2.sent.map(m => m.type + ':' + m.itemId), b: wF.b1.sent.length, seen: snSeen(wF), mB: wF.view(wF.a1, 'mB').ids.indexOf('orc2') >= 0 };
    wF.clearSent(); wF.net.sensesMoved('c_a'); const quiet2 = wF.timers.filter(t => t.fn && t.ms === 500).length; wF.fire(500);
    const bQuiet = wF.b1.sent.length + wF.a1.sent.length + wF.a2.sent.length;
    wF.camp.chars.c_a.values.f_fs = 0; wF.clearSent(); wF.net.sensesMoved('c_a'); wF.fire(500); const back2 = { a1: wF.a1.sent.map(m => m.type + ':' + m.itemId), seen: snSeen(wF) };
    check('senses S2a (host): a sense read from Ana\'s sheet that grows to reach the orc catches both her copies of each map it stands on up in place (a fogDiff per map, the orc added on both, Bo sent nothing); asked again with nothing moved, nothing is armed or sent; back to 0, the orc goes again',
        J(before2) === J({ a: false, a2: false, b: false, relay: false, relayB: false }) && pend2 >= 1 && J(got2.a1.sort()) === J(['fogDiff:mA', 'fogDiff:mB']) && J(got2.a2.sort()) === J(['fogDiff:mA', 'fogDiff:mB']) && got2.b === 0 && got2.mB && J(got2.seen) === J({ a: true, a2: true, b: false, relay: true, relayB: false })
        && quiet2 === 0 && bQuiet === 0 && J(back2.a1.sort()) === J(['fogDiff:mA', 'fogDiff:mB']) && back2.seen.a === false && back2.seen.relay === false, J([before2, pend2, got2, quiet2, bQuiet, back2]));

    // senses S2b: a token's own ranges (item.senses) are the GM's on the host: only that token's player receives them, on their own copies of a
    // fogged map (fogOwnSenses in fogCopyFor), cleaned, the senses the system holds only; the shared clone, anyone else's copy, an unfogged map,
    // a catch-up, a hidden or a waiting token never carry them; the host judges that player's copies by them; no patch of a player's sets them
    const snN = v => (J(v).match(/"senses"/g) || []).length;
    const snOf = (W, c, id, mapId) => { const it = W.last(c, mapId), t = it && it.whiteboard.find(w => w && w.id === id); return !t ? 'absent' : Object.prototype.hasOwnProperty.call(t, 'senses') ? t.senses : 'none'; };
    const s65 = () => [{ id: 'sn_force001', n: 65 }];
    const wT0 = S7({ system: sysSn(snBy(0)) }), wT = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }), seenT = [snSeen(wT0), snSeen(wT)];
    wT.tok('orc').senses = [{ id: 'sn_force001', n: 900 }]; wT.tok('tB').senses = [{ id: 'sn_force001', n: 5 }];
    wT.camp.items.mA.whiteboard.push(T('tH', 'u_a', 'c_a', 3, 3, { hidden: true, senses: [{ id: 'sn_force001', n: 70 }] }), { id: 'tW', type: 'circle', waiting: 1, ownerId: 'u_a', x: 150, y: 150, w: 50, h: 50, senses: [{ id: 'sn_force001', n: 80 }] },
        T('tP', 'u_a', '', 4, 4, { senses: [{ id: 'sn_force001', n: 1e9 }, { id: 'sn_other001', n: 30 }, { id: 'sn_force001', n: 3 }] }), T('tQ', 'u_a', '', 4, 5, { senses: [{ id: 'sn_other001', n: 30 }] }));
    const hostT = J(wT.camp.items.mA); wT.clearSent(); wT.net.sendItem('k', 'mA');
    const sentT = { a1: ['tA', 'tB', 'orc', 'tH', 'tW', 'tP', 'tQ'].map(id => snOf(wT, wT.a1, id)), a2: snOf(wT, wT.a2, 'tA'), b: ['tA', 'tB', 'orc', 'tP'].map(id => snOf(wT, wT.b1, id)), nA: snN(wT.last(wT.a1)), nB: snN(wT.last(wT.b1)), orcA: wT.ids(wT.a1).indexOf('orc') >= 0 };
    const clT = wT.api.clean(wT.camp.items.mA), cpT = wT.api.copy(clT, wT.camp, wT.camp.items.mA, 'u_a'), noneT = [snN(clT), snN(wT.api.copy(clT, wT.camp, wT.camp.items.mA, 'u_zz')), snN(wT.api.copy(clT, wT.camp, wT.camp.items.mA, null)) + snN(wT.api.copy(clT, wT.camp, wT.camp.items.mA, undefined)) + snN(wT.api.copy({ type: 'map', whiteboard: [] }, wT.camp, { id: 'mZ', type: 'map', fog: { on: true, mode: 'auto' } }, 'u_a')), cpT.whiteboard.find(w => w.id === 'tA') !== clT.whiteboard.find(w => w.id === 'tA'), cpT !== clT, snN(cpT)];
    wT.clearSent(); wT.net.broadcastItemFiltered('k', 'mA'); const bifT = [snOf(wT, wT.a1, 'tA'), snOf(wT, wT.b1, 'tB'), snOf(wT, wT.b1, 'tA'), snN(wT.last(wT.a1)), snN(wT.last(wT.b1))];
    const joinT = snN(wT.api.copy(wT.api.clean(JSON.parse(hostT)), wT.camp, JSON.parse(hostT), 'u_a'));
    check('senses S2b (host): a token given a range of its own sees by it on the host\'s judgement (a sense every token has at 0: the orc 13 cells off reaches both of Ana\'s copies only once her token has 65 ft); each copy of a fogged map carries the ranges of its own player\'s visible tokens alone — cleaned (the first of a sense, clamped), only the senses the system holds — never another player\'s, an NPC\'s, a hidden or a waiting token\'s, a plain send or one to the table alike; the join snapshot\'s copy (made from a clone of the map) the same',
        J(seenT) === J([{ a: false, a2: false, b: false, relay: false, relayB: false }, { a: true, a2: true, b: false, relay: true, relayB: false }])
        && J(sentT) === J({ a1: [s65(), 'none', 'none', 'none', 'none', [{ id: 'sn_force001', n: 100000 }], 'none'], a2: s65(), b: ['none', [{ id: 'sn_force001', n: 5 }], 'absent', 'none'], nA: 2, nB: 1, orcA: true })
        && J(bifT) === J([s65(), [{ id: 'sn_force001', n: 5 }], 'none', 2, 1]) && joinT === 2, J([seenT, sentT, bifT, joinT]));
    check('senses S2b (host): the shared clone every copy is made from never holds a token\'s ranges, nor a copy made for nobody or for a profile with no token there; the owner\'s copy gets a board and a token of its own (the clone untouched), and the host\'s own map is exactly as it was after every send',
        J(noneT) === J([0, 0, 0, true, true, 2]) && J(wT.camp.items.mA) === hostT && snN(wT.api.clean(wT.camp.items.mA)) === 0, J(noneT));
    const wU = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); wU.camp.items.mA.fog.on = false; wU.clearSent(); wU.net.sendItem('k', 'mA'); wU.net.broadcastItemFiltered('k', 'mA'); wU.net.sendItem('k', 'mA', wU.a1);
    const unfT = [wU.a1.sent.length, wU.b1.sent.length, snN(wU.a1.sent), snN(wU.a2.sent), snN(wU.b1.sent), snN(wU.api.copy(wU.api.clean(wU.camp.items.mA), wU.camp, JSON.parse(J(wU.camp.items.mA)), 'u_a'))];
    const wDr = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); wDr.move(wDr.a1, 'tA', 250, 100, false); wDr.clearSent(); wDr.net.sendItem('k', 'mA');
    const dragT = [wDr.at(wDr.a1, 'tA'), snOf(wDr, wDr.a1, 'tA'), wDr.at(wDr.b1, 'tA'), snOf(wDr, wDr.b1, 'tA')];
    const wCu = S7({ system: sysSn(snBy(0)) }); wCu.tok('orc').senses = [{ id: 'sn_force001', n: 900 }]; wCu.tok('tA').senses = [{ id: 'sn_force001', n: 5 }];
    wCu.move(wCu.a1, 'tA', 250, 100, false); wCu.move(wCu.a1, 'tA', 250, 100, true); wCu.fire(150); const cuT = [diffsTo(wCu, wCu.a1).map(m => (m.add || []).map(a => a.item.id)), snN(wCu.a1.sent), snN(wCu.a2.sent), snN(wCu.b1.sent)];
    check('senses S2b (host): a map with no fog carries no token\'s ranges to anyone (a save, a send to the table, a copy one player asked for, the join snapshot\'s copy made from a clone of it); a drag in progress keeps its player\'s ranges on the token at its live place, the others\' copies at its start without them; a copy caught up in place never carries a creature\'s ranges (the orc added without its own)',
        J(unfT) === J([3, 2, 0, 0, 0, 0]) && J(dragT) === J([[250, 100, 0, 0], s65(), [100, 100, 0, 0], 'none']) && J(cuT) === J([[['orc']], 0, 0, 0]), J([unfT, dragT, cuT]));
    const wG = S7({ system: sysSn(snBy(0)) }), gBefore = snSeen(wG); wG.tok('tA').senses = s65(); wG.fog.invalidateVision(); wG.clearSent(); wG.net.sendItem('k', 'mA');
    const gAfter = [snSeen(wG), snOf(wG, wG.a1, 'tA'), snOf(wG, wG.b1, 'tA'), wG.ids(wG.a1).indexOf('orc') >= 0];
    delete wG.tok('tA').senses; wG.fog.invalidateVision(); wG.clearSent(); wG.net.sendItem('k', 'mA'); const gGone = [snSeen(wG), snOf(wG, wG.a1, 'tA'), wG.ids(wG.a1).indexOf('orc') >= 0];
    check('senses S2b (host): the GM giving a token a range of its own (and the save that sends the map) reaches its player at once — the orc on both her copies and through her live relay, her token carrying the range, Bo\'s copy never; taking it away takes the orc and the range away again',
        J(gBefore) === J(seenT[0]) && J(gAfter) === J([seenT[1], s65(), 'none', true]) && J(gGone) === J([seenT[0], 'none', false]), J([gBefore, gAfter, gGone]));
    const wPt = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } });
    wPt.api.item(patchMsg({ senses: [{ id: 'sn_force001', n: 100000 }] }, [{ id: 'tB', x: 100, y: 200, rot: 0, front: 0, senses: [{ id: 'sn_force001', n: 100000 }] }]), wPt.a1);
    wPt.api.item(patchMsg({ x: 150 }), wPt.a1); wPt.api.patch(patchMsg({ x: 150, senses: [] }), { id: 'u_a' });
    const patT = [wPt.tok('tA').senses, Object.prototype.hasOwnProperty.call(wPt.tok('tB'), 'senses'), wPt.tok('tA').x, snN(wPt.b1.sent), wPt.a2.sent.filter(m => m.type === 'item').map(m => snN(m))];
    // what the mutants found: a hidden, waiting or GM-note item sharing a visible token's id never lends it its ranges, nor does a stub take
    // the visible one's; a senses list with a stray entry sends as ever; a host with no cleaner on hand sends no ranges at all
    const wDup = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }), dupB = wDup.camp.items.mA.whiteboard;
    dupB.push({ id: 'tA', type: 'rect', hidden: true, ownerId: 'u_a', x: 0, y: 0, w: 5, h: 5, senses: [{ id: 'sn_force001', n: 70 }] });
    wDup.clearSent(); wDup.net.sendItem('k', 'mA'); const dupA = wDup.last(wDup.a1).whiteboard.filter(w => w.id === 'tA').map(w => [!!w.hidden, w.senses || 'none']);
    const wDup2 = S7({ system: sysSn(snBy(0)) }), dupB2 = wDup2.camp.items.mA.whiteboard;
    dupB2.push({ id: 'tA', type: 'rect', hidden: true, ownerId: 'u_a', x: 0, y: 0, w: 5, h: 5, senses: s65() }, { id: 'tA', type: 'circle', waiting: 1, ownerId: 'u_a', x: 0, y: 0, w: 5, h: 5, senses: s65() }, { id: 'tA', type: 'note', gmNoteFor: 'u_a', ownerId: 'u_a', x: 0, y: 0, senses: s65() });
    wDup2.clearSent(); wDup2.net.sendItem('k', 'mA'); const dupC = snN(wDup2.last(wDup2.a1));
    const wStray = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); wStray.camp.system.combat.senses.list.push(null); wStray.clearSent(); let strayErr = ''; try { wStray.net.sendItem('k', 'mA'); } catch (e) { strayErr = e.message; }
    const wNoC = S7({ system: sysSn(snBy(0)), tA: { senses: s65() } }); delete wNoC.winRef.wpFogCore; wNoC.clearSent(); wNoC.net.sendItem('k', 'mA'); wNoC.winRef.wpFogCore = FCx;
    check('senses S2b (host): a hidden, a waiting or a GM-note item that shares a visible token\'s id never lends it its ranges and a hidden stub never takes the visible token\'s; a stray entry in the senses list sends as ever; with no cleaner on hand the host sends no ranges at all',
        J(dupA) === J([[false, s65()], [true, 'none']]) && dupC === 0 && strayErr === '' && J(snOf(wStray, wStray.a1, 'tA')) === J(s65()) && snN(wNoC.a1.sent) + snN(wNoC.a2.sent) + snN(wNoC.b1.sent) === 0 && wNoC.a1.sent.length === 1, J([dupA, dupC, strayErr, wNoC.a1.sent.length]));
    check('senses S2b (host): no map copy of a player\'s sets a token\'s ranges — their own token\'s stay the GM\'s (a range sent, none sent, an empty list), another\'s get none; the copies it sends on carry the host\'s ranges to that player\'s other connection and none to anyone else',
        J(patT) === J([s65(), false, 150, 0, [1]]), J(patT));

    // senses S3-1: blindness on the host's judgement and on the wire — the GM's Blind tick (item.blind) goes only to its own player on a
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

    // (6) where it is wired, in the source
    const hbA = src.indexOf('function hbTick() {'), hbS = src.slice(hbA, src.indexOf('\n    } else {', hbA));
    const clA = src.indexOf("conn.on('close', function() {"), clS = src.slice(clA, src.indexOf("} else if (net.leaving) {", clA));
    const kpS = whole4('net.kickPlayer = function('), lvS = fnSrc('function leaveSession(silent) {', '\n}\n', 'leaveSession'), shS = fnSrc('function startHosting(forceFresh) {', '\n    diceSessionReset(true);', 'startHosting');
    const fmS = bw('fogmove'), admS = fnSrc('function admitPlayer(', '\n}\n', 'admitPlayer');
    check('fold M4 (source): the heartbeat\'s host branch ends with the sweep; the close handler sweeps after it forgets the player\'s senses and before its save; kickPlayer sweeps once the roster entries are gone; the session\'s end sweeps every drag back before the table is torn down; a new table starts with no drag; the clock lives outside every slice; both whole-map sends, the snapshot, the turn order, the pointers and the senses resend are judged inside fogLanded; the pos gate and the patch path read the drag through openDrag',
        /fogDragSweep\(\);[^\n]*\n\s*\} else \{/.test(src.slice(hbA, hbA + hbS.length + 20)) && /sensesForget\(p\.id\);[^\n]*\n\s*if \(net\.role === 'host' && typeof fogDragSweep === 'function'\) fogDragSweep\(\);/.test(clS) && clS.indexOf('fogDragSweep()') < clS.indexOf('save(true)')
        && /renderRoster\(\); \}\n\s*if \(p && typeof fogDragSweep === 'function'\) fogDragSweep\(\);/.test(kpS) && lvS.indexOf('fogDragSweep(true)') > 0 && lvS.indexOf('fogDragSweep(true)') < lvS.indexOf('net.conns = []') && /sensesReset\(\);[^\n]*\n\s*_dragFrom = Object\.create\(null\); _refusedAt = Object\.create\(null\);/.test(shS)
        && /\nfunction fogNow\(\) \{ return Date\.now\(\); \}[^\n]*\n\/\/ \[netcheck:fogmove-start\]/.test(src) && fmS.indexOf('function fogNow') < 0 && (src.match(/function fogNow\(/g) || []).length === 1
        && (whole4('net.sendItem = function(').match(/fogLanded\(itemId, fogSend\)/g) || []).length === 1 && /var fogSend = function\(\) \{[^]*?var clean = sanitizeItem\(it\);/.test(whole4('net.sendItem = function(')) && /var fogSend = function\(\) \{[^\n]*\n\s*var clean = sanitizeItem\(it\);/.test(whole4('net.broadcastItemFiltered = function('))
        && /fogLanded\(null, mkSnap\); else mkSnap\(\);[^\n]*\n\s*conn\.send\(snap\);[^\n]*\n\s*\} catch \(e\) \{ sendFailed\(e, 'snapshot'\);/.test(admS) && (bw('combats').match(/fogLanded\(null, sendAll\)/g) || []).length === 2 && (bw('sensesmoved').match(/fogLanded\(null, sendAll\)/g) || []).length === 1
        && /frW = openDrag\(msg\.itemId, w\);/.test(bw('pos')) && /frP = \(typeof openDrag === 'function' \? openDrag\(msg\.itemId, lw\) : _dragFrom\[dkP\]\) \|\|/.test(bw('patch')));
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
    const cli = (myId, win) => new Function('window', 'net', 'cleanWaitingItem', 'sanitizeRichText', 'safeColor', '"use strict";\n' + lnS('function cleanHostWbItem(w) {') + '\n' + lnS('function cleanHostLight(w) {') + '\n' + lnS('function cleanHostTokSenses(w) {') + '\n' + src.slice(hmS, hmE) + '\nreturn { item: cleanHostWbItem, map: cleanHostMap };')(win || { wpFogCore: FCx }, { myId: myId }, H.cleanWaitingItem, t => t, v => v);
    const J = v => JSON.stringify(v), has = (w, k) => Object.prototype.hasOwnProperty.call(w, k);
    const raw = () => JSON.parse('[{"id":"sn_force001","n":1e9},{"id":"sn_force001","n":4},{"id":"sn_Bad","n":3},{"id":"sn_other001","n":-2},{"id":"__proto__","n":1}]');
    const toks = () => [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', senses: raw() }, { id: 'bo', type: 'image', isChar: true, ownerId: 'u_bo', senses: raw() }, { id: 'orc', type: 'image', isChar: true, senses: raw() },
        { id: 'nul', type: 'image', ownerId: '', senses: raw() }, { id: 'junk', type: 'image', ownerId: 'u_me', senses: 'sn_force001' }, { id: 'none', type: 'image', ownerId: 'u_me', senses: [] }, { id: 'wt', waiting: 1, type: 'circle', ownerId: 'u_me', x: 1, y: 1, w: 5, h: 5, senses: raw() }];
    const C = cli('u_me'), got = toks().map(w => C.item(w)).map(w => (has(w, 'senses') ? w.senses : 'none'));
    const want = [{ id: 'sn_force001', n: 100000 }, { id: 'sn_other001', n: 0 }];
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
    check('senses S3 (client): a player\'s app keeps the GM\'s Blind tick from its host only on a token of its own and only as true (no cleaner needed); another player\'s, an NPC\'s, one owned by nobody, a waiting token\'s or any other value is dropped, item by item and in a whole map; with no profile of its own, none',
        J(blGot) === J([[true, 0, 0, 0, 0, 0, 0, 0], [true, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]) && J(blMap) === J(blGot[0]), J([blGot, blMap]));
    const pg = mkFogClient(FCx, { myId: 'u_me', items: { mA: { id: 'mA', type: 'map', fog: { on: true }, meta: {}, rooms: [], links: [], whiteboard: [{ id: 'me', type: 'image', isChar: true, ownerId: 'u_me', x: 10, y: 10, w: 50, h: 50 }] } } });
    pg.recv({ type: 'fogDiff', campId: 'k', itemId: 'mA', add: [{ item: { id: 'orc', type: 'image', isChar: true, x: 100, y: 100, senses: raw(), blind: true }, after: 'me' }, { item: { id: 'me2', type: 'image', isChar: true, ownerId: 'u_me', x: 50, y: 50, senses: raw() }, after: 'orc' }] });
    const pgW = pg.map('mA').whiteboard;
    check('senses S2b (client): a map caught up in place (the real fogDiff branch and apply) cleans what it adds the same way — a creature\'s ranges from a hostile host dropped; a token of the player\'s own is never taken from a catch-up (the whole map asked for instead, where its ranges are cleaned as above)',
        J(pgW.map(w => w.id)) === J(['me', 'orc']) && !has(pgW[1], 'senses') && !has(pgW[1], 'blind') && J(pg.rec.asked.map(m => m.type)) === J(['needItem']), J([pgW, pg.rec.asked]));
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
    check('fold M6 (source): the resize and rotate handles publish the gesture once they hold the pointer and clear it at their pointerup, a cancel or a lost capture; a fog-brush stroke publishes it only when it paints (a door click does not) and clears it when the pointer comes up or is cancelled; a board drag publishes it on the play map only, once it holds the pointer, and clears it first thing at its pointerup (which a cancel, a lost capture and a lost focus reach through abortDrag); datamap.js names none of the host\'s senses',
        handle(resS, 'isResizing') && handle(rotS, 'isRotating') && fogS.indexOf('toggleDoorAt') >= 0 && fogS.indexOf('toggleDoorAt') < fogS.indexOf('hostGestureStart();') && /_fogPaintBtn = e\.button;\n\s*hostGestureStart\(\);/.test(fogS)
        && /document\.addEventListener\('pointerup', function\(\) \{ if \(_fogPaintBtn >= 0\) hostGestureEnd\(\); _fogPaintBtn = -1; \}\);/.test(fogS) && /document\.addEventListener\('pointercancel', function\(\) \{ if \(_fogPaintBtn >= 0\) hostGestureEnd\(\); _fogPaintBtn = -1; \}\);/.test(fogS)
        && /el\.classList\.add\('dragging'\);\n\s*if \(modeStr === 'visual' && window\.wpHostGestureStart\) window\.wpHostGestureStart\(\);/.test(dragS) && (dmT.match(/wpHostGestureStart\(\)/g) || []).length === 1
        && /if\(!dragging\) return;\n\s*if \(window\.wpHostGestureEnd\) window\.wpHostGestureEnd\(\);/.test(upS) && /function abortDrag\(e\) \{\n\s*if \(!dragging\) return;\n\s*el\.dispatchEvent\(new PointerEvent\('pointerup'/.test(dmT)
        && !/senses|amL|invalidateSeen|sightSigFor/.test(dmT), j([resS.length, rotS.length, fogS.length, dragS.length, upS.length]));
}
// fold M8: a player's app asks its host for one map whole (net.needItem), and a gesture's moves name the map it began on (net.streamPos)
{
    const w8 = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const mk8 = role => { const sent = [], n = { active: true, role, paused: false, selfPaused: false, conns: [{ peer: 'h', open: true, send(m) { packCheck(m); sent.push(JSON.parse(j(m))); } }] }; const camp = { id: 'k', activeItemId: 'mB', items: { mA: { id: 'mA', type: 'map' }, mB: { id: 'mB', type: 'map' } } };
        const relayed = []; new Function('net', 'getActiveCampaign', 'sendFailed', 'broadcastPos', '_posLast', 'var _posLast = 0;\n' + w8('net.needItem = function(') + w8('net.streamPos = function('))(n, () => camp, e => { throw e; }, (m, x, c, map) => relayed.push([m.itemId, map && map.id]));
        return { n, sent, relayed }; };
    const c8 = mk8('client'); c8.n.needItem('k', 'mA'); c8.n.needItem('k', 5); c8.n.needItem(null, 'mA'); c8.n.streamPos({ id: 't', x: 1, y: 2 }, true, 'mA'); c8.n.streamPos({ id: 't', x: 1, y: 2 }, true);
    const h8 = mk8('host'); h8.n.needItem('k', 'mA'); h8.n.streamPos({ id: 't', x: 1, y: 2 }, true, 'mA'); h8.n.streamPos({ id: 't', x: 1, y: 2 }, true, 'constructor');
    const off8 = mk8('client'); off8.n.active = false; off8.n.needItem('k', 'mA');
    check('fold M8: a player\'s app asks its host for one map whole in one message (never with an id that is no text, never off a table, never from the host); a gesture\'s final names the map it began on, the map on screen when none is given; on the host the relay is judged on that map (none for a prototype name)',
        j(c8.sent.map(m => m.type + ':' + m.itemId)) === j(['needItem:mA', 'pos:mA', 'pos:mB']) && j(c8.sent[0]) === j({ type: 'needItem', campId: 'k', itemId: 'mA' }) && h8.sent.length === 0 && j(h8.relayed) === j([['mA', 'mA'], ['constructor', null]]) && off8.sent.length === 0,
        j([c8.sent, h8.relayed]));
}
Promise.all(pendingChecks).then(() => {   // the async checks land before the summary
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
});
