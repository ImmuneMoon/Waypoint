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
        out.N = N;
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
    check('combat roster (source): a roll\'s answer is net.diceRoll\'s own ({ ok, value, priv }) through the sheet\'s rollInit; combats go to players only through combatsFor (the broadcast and the join snapshot), never net.combats as it is',
        /return \{ ok: true, value: res\.value, priv: !!rec\.priv \};/.test(src) && (src.match(/type: 'combats'/g) || []).length === 2 && /combats: combatsFor\(prof\.id\)/.test(src) && !/combats: net\.combats/.test(src)
        && /broadcast\(\{ type: 'combats', combats: combatsFor\(null\) \}, null\)/.test(src) && /c\.send\(\{ type: 'combats', combats: combatsFor\(pr\.id\) \}\)/.test(src));
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
    const sN = src.replace(/\r\n/g, '\n'), siA = sN.indexOf('function sanitizeItem('), siB = sN.indexOf('\n}\n', siA) + 2, wn = (sN.match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0];
    const siF = new Function('window', wn + '\n' + sN.slice(siA, siB) + '\nreturn sanitizeItem;')({});
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
    const siA = src.indexOf('function sanitizeItem('), siB = src.indexOf('\n}\n', siA) + 2, wn = (src.match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0];
    const siL = new Function('window', wn + '\n' + src.slice(siA, siB) + '\nreturn sanitizeItem;')({});
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
    const siA = src.indexOf('function sanitizeItem('), siB = src.indexOf('\n}\n', siA) + 2, wn = (src.match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0];
    const siL = new Function('window', '"use strict";\n' + wn + '\n' + src.slice(siA, siB) + '\nreturn sanitizeItem;')({});
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
Promise.all(pendingChecks).then(() => {   // the async checks land before the summary
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
});
