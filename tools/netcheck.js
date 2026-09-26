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
const H = new Function('localStorage', 'crypto', helpersSrc + '\nreturn { own, validProfileId, newKey, tableKeys, tableKeyFor, rememberTableKey, safeAvatar, cleanRosterName };')(storage, globalThis.crypto);
const RC = new Function('localStorage', 'crypto', helpersSrc + '\n' + rosterCleanSrc + '\nreturn { cleanHostRoster, cleanHostAway, validKey };')(storage, globalThis.crypto);

const ENV_NAMES = ['net', 'own', 'validProfileId', '_connMeta', 'UNADMITTED_TTL', 'noteSeen', 'denyJoin', 'lastSeen', 'HB_STALE', 'bannedIds', 'getActiveCampaign', 'APP_VERSION', 'versionCmp', 'updateMessage', 'toast', 'logEvent', 'newerSeen', 'ui', '_pwFails', 'approvedIds', 'admitPlayer', 'queueJoin', 'setTimeout', 'clearTimeout', 'tableKeyFor', 'getProfile', 'showConfirm', 'pendingJoins', 'processNextApproval', 'allow', 'pushChat', 'broadcast', 'safeAvatar', 'cleanRosterName', 'awayMap', 'validKey', 'sendFailed'];
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
        safeAvatar: H.safeAvatar, cleanRosterName: H.cleanRosterName, awayMap: () => ({ u_a: 'map_1' }), validKey: RC.validKey, sendFailed: () => {},
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
check('client: the join snapshot\'s system is re-cleaned as the players\' view before its characters are (a host\'s system is never rendered raw)', /function applySnapshot\(msg\)[\s\S]{0,9000}?cs\.system = snapSys; else delete cs\.system;[\s\S]{0,400}?cleanChar\(/.test(src) && /var snapSys = \(cs\.system && window\.wpFormula\) \? window\.wpSystemCore\.cleanSystem\(cs\.system, \{ F: window\.wpFormula, gmView: false \}\) : null;/.test(src));
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
        && (wbSrc2.match(/window\.wpNet\.safeAvatar\(p\.avatar\)/g) || []).length === 2 && !/base64,\/\.test\(p\.avatar\)/.test(wbSrc2));
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
        /S\.charFor\(src, view, pid, \{ lib: libD, items: itD \}\)/.test(src) && /S\.charFor\(probe, view, pid, \{ probe: true \}\)/.test(src) && /charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt \}\)/.test(src) && /SQ\.charFor\(srcQ, viewQ, pidQ, \{ lib: fxLib\(campQ\.system\), items: itemLib\(campQ\.system\) \}\)/.test(src)
        && /S\.charFor\(camp\.chars\[charId\], view, recipientId, \{ lib: lib, items: items \}\)/.test(src) && /S\.charFor\(src, view, src\.ownerId, \{ lib: lib \|\| null, items: items \|\| null \}\)/.test(src));
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
    check('pos gate (F0 review): a player with no location yet (joined while the GM was on a page) still moves their own shown token; the map rule applies once they have one', noLoc.moved && noLoc.relayed === 1, j(noLoc));
    const ioN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), wbN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
    check('undo + presence (F0): an undo strips a restored token\'s owner only when the player holds a live token of the SAME character (or same-named pet); a kept character\'s token shows only where its player is',
        /liveOwned\[grp\(w\)\] = 1/.test(ioN) && /if \(s && s\.isChar && s\.ownerId && liveOwned\[grp\(s\)\]\) delete s\.ownerId;/.test(ioN) && /var presOwner = item\.ownerId \|\| keptOwnerOf\(item\);/.test(wbN) && /absentOwner = !window\.wpNet\.isPresent\(presOwner, activeMap\.id\);/.test(wbN));
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
        const out = { asked: [], toasts: [], saved: 0, redraws: 0, camp, net };
        out.approvedIds = { u_a: true };   // a yes to a connection that had dropped, not yet used
        const env = [net, H.own, (m, cb) => { out.asked.push(m); cb(answer); }, () => (opts.switched ? { id: 'c2' } : camp), () => { out.saved++; }, m => out.toasts.push(m), () => { out.redraws++; }, out.approvedIds, () => ({ playableChars: (c, pid) => pid === 'u_a' ? [{ id: 'c_1' }] : [] })];
        const fns = new Function('net', 'own', 'showConfirm', 'getActiveCampaign', 'save', 'toast', 'renderPlayersPanel', 'approvedIds', 'SC', fgSrc + '\n' + slSrc + '\nreturn { forgetPlayer, syncLastMaps };')(...env);
        fns.forgetPlayer(camp, fid);
        fns.syncLastMaps();
        return out;
    };
    const yes = run(true, 'u_a'), no = run(false, 'u_a');
    check('forget (host): asked first, naming them and saying they stay at the table; on yes the record goes for good — the roster sync that runs on every redraw no longer re-creates it while they play on — and a one-time approval still waiting goes too (Cancel keeps it)',
        yes.asked.length === 1 && /Forget Ana\?/.test(yes.asked[0]) && /stay at the table/.test(yes.asked[0]) && !('u_a' in yes.camp.players) && yes.net.forgotten.u_a === true && yes.saved === 1 && yes.redraws === 1
        && yes.camp.players.u_b.lastMap === 'm1' && !('u_a' in yes.approvedIds) && no.approvedIds.u_a === true, j([yes.asked, yes.camp.players, yes.approvedIds]));
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
        j(tG.sent) === j(blastT('')) && tG.placed.length === 1 && tG.placed[0].name === 'Orb' && j(tG.rolls) === j([['c_n', '3d6', 'Orb damage', { gmOnly: true }]]) && tG.applied.length === 0
        && j(tV.sent) === j(blastT('Frag')) && j(tV.rolls) === j([['c_n', '2d6', 'Frag damage', { gmOnly: false }]]) && j(tU.sent) === j(blastT('Frag')) && j(tU.rolls) === j(tV.rolls)
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
        return { log, box: node('div'), doc: { createElement: t => node(String(t).toLowerCase()), createTextNode: t => ({ tag: '#text', textContent: String(t), children: [], attrs: {} }), write: v => log.push(['markup', 'document.write', String(v)]) } };
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
    const D = fakeDom(); WH.paintWhere(D.box, w, D.doc);
    const kids = D.box.children;
    check('where (client): hostile names reach the page as text only — no innerHTML / outerHTML / insertAdjacentHTML / document.write, no attribute but the separator\'s constant aria-hidden, the whole line in the title property',
        !D.log.some(e => e[0] === 'markup') && D.log.filter(e => e[0] === 'attr').every(e => e[1] === 'aria-hidden' && e[2] === 'true') && D.box.title === HOST_C + ' \u203a ' + wantM
        && kids.every(k => k.children.length === 0 && Object.keys(k.attrs).every(a => a === 'aria-hidden')), j(D.log));
    check('where (client): three spans — the campaign, a \u203a separator, the map — and the box is switched on',
        kids.length === 3 && j(kids.map(k => k.className)) === j(['tw-camp', 'tw-sep', 'tw-map']) && kids[0].textContent === HOST_C && kids[1].textContent === '\u203a' && kids[2].textContent === wantM
        && D.box.textContent === HOST_C + '\u203a' + wantM && D.box.classes.has('on'), j(kids.map(k => [k.className, k.textContent])));
    check('where (client): a nested map shows its own title only — no parent map anywhere in the text, the title or the result, and nothing but the one separator',
        !/Parent/.test(D.box.textContent + '|' + D.box.title + '|' + j(w)) && D.box.textContent.split('\u203a').length === 2 && D.box.title.split('\u203a').length === 2, D.box.textContent);
    WH.paintWhere(D.box, null, D.doc);
    check('where (client): with nothing to show the box is emptied, its title cleared and switched off', D.box.children.length === 0 && D.box.textContent === '' && D.box.title === '' && !D.box.classes.has('on'), j([D.box.textContent, D.box.title, [...D.box.classes]]));
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
        /function renderWhere\(\) \{[^}]*tableWhere\(net, campOf\(state\.appState && state\.appState\.activeCampaignId\)\);[^}]*paintWhere\(box, w, document\);\n\}/.test(src)
        && /export function render\(\) \{\s*if \(window\.wpHideTooltip\)[^\n]*\n\s*if \(window\.wpNet && window\.wpNet\.renderWhere\) window\.wpNet\.renderWhere\(\);[^\n]*\n\s*var activeMap = getActiveMap\(\);\s*if\(!activeMap\) return;/.test(mainSrc)
        && /classList\.toggle\('net-client'[^\n]*\n\s*renderWhere\(\);/.test(src));
    check('where (client): the box sits in the header beside the campaign select, hidden unless a joined player has something to show',
        /<header>[\s\S]*<select id="campaignSelect"[^\n]*\n\s*<div id="tableWhere" class="table-where"><\/div>[\s\S]*<\/header>/.test(htmlSrc)
        && /\n\s*#tableWhere \{ display: none;/.test(cssSrc) && /\n\s*body\.net-client #tableWhere\.on \{ display: inline-flex; \}/.test(cssSrc) && !/#tableWhere[^{\n]*\{[^}]*content:/.test(cssSrc));
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

Promise.all(pendingChecks).then(() => {   // the async checks land before the summary
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
});
