/* netjoincheck.js: who comes to a table and how, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md,
   "Finishing the test split", step 4, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: net.js's helpers (own, validProfileId, the table keys), the admission gate,
   hello (strangers, known players, the table key proven and never sent, the impersonation the audit found), Kick and Ban taking every
   connection of a profile, identity validation, storms, versions and passwords, the join queue, broadcast, chat, what a client accepts
   from a host, the audits' small follow-ups, the roster reaching players and its sinks, no value making a send fail silently, the local
   server's bodies read as UTF-8, security R2 cluster J on the host, security S (the GM's signing key, trust on first use), Merge into,
   "Same person as..." and a hand-over in Player History, and the host id apart from the joining id. With step 5 (2026-11-19): the
   heartbeat reaching a player still waiting for the GM's Allow, and a side about to freeze in a print dialog asking for the hold (F2b).
   It reads the joined net.js through srcjoin, as netcheck did, and takes the gate's harness from tools/checkkit.js (netGate).
   Run: node tools/netjoincheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, tryBetween, fnSrc, ordersSrc } = kit.netSlices('netjoincheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { helpersSrc, storage, H, mkConn } = kit.netHarness('netjoincheck');
// the admission gate's harness netcheck kept at its top, the very code (checkkit netGate)
const { gateSrc, hmacRef, RC, pre, FPP, FPH, FPTAIL, pcStub, runGate, runBroadcast, runChat, runRoster, runAway, harness } = kit.netGate('netjoincheck');
const j = JSON.stringify;

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
// Security R2 (cluster B, #7 #22 #8): the table key is proven, never sent. The host challenges a known id with a fresh nonce; the player answers
// with HMAC-SHA256(key, 'wp-auth|' + nonce + '|' + the room id THEY dialed); the host checks it over its own room id. A key in clear (an older
// client) is ignored, so a proof relayed through a squatted room generation or another GM's table never opens the real one.
// 1.6.0, backlog 190 (the owner: "a general contingency for if a gm changes their system"; by prompt "Also chat and read pages"): the host holds a
// player with a character out of date at every gate the GM's own pause holds them at, and the player's app reads the same from its own copies
pendingChecks.push((async () => {
    const S = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).split(String.fromCharCode(92)).join('/'));
    const J = JSON.stringify, held = between('// [netcheck:sheetheld-start]', '// [netcheck:sheetheld-end]', 'sheetheld');
    const sys = { fields: [], sheetRev: 2 };
    const camp = { system: sys, chars: { c_k: { id: 'c_k', name: 'Kael', ownerId: 'u_p', values: {} }, c_m: { id: 'c_m', name: 'Mira', ownerId: 'u_q', values: {}, sheetRev: 2 }, c_n: { id: 'c_n', name: 'Npc', npc: true, values: {} } } };
    const ui = { n: 0 }, logs = [];
    const mk = (net) => new Function('net', 'SC', 'getActiveCampaign', 'refreshPauseUi', 'pausedById', 'window',
        held + '\nreturn { heldById, peerHeld, peerGmPaused, heldNames, heldSync, heldSay, heldBanner, HELD_WORDS };')(net, () => S, () => camp, () => { ui.n++; }, pid => !!(net.pausedPlayers && net.pausedPlayers[pid]), { wpStepLog: (a, b, o) => logs.push(a + ' ' + b + ' ' + J(o)) });
    const host = { role: 'host', active: true, roster: { pP: { id: 'u_p' }, pQ: { id: 'u_q' } }, pausedPlayers: { u_q: true } }, H = mk(host);
    const hostOk = H.heldById('u_p') === true && H.heldById('u_q') === false && H.heldById('') === false && H.peerHeld('pP') && !H.peerHeld('pQ') && !H.peerHeld('pX') && H.peerGmPaused('pQ') && !H.peerGmPaused('pP');
    const cl = { role: 'client', active: true, myId: 'u_p', stream: false }, C = mk(cl);
    C.heldSync(); const c1 = [cl.selfHeld, J(cl.heldNames), ui.n, C.heldBanner(), C.heldSay('x')];
    camp.chars.c_k.sheetRev = 2; C.heldSync(); const c2 = [cl.selfHeld, J(cl.heldNames), C.heldSay('x')];
    cl.stream = true; camp.chars.c_k.sheetRev = 1; C.heldSync(); const c3 = cl.selfHeld; cl.stream = false;
    cl.selfPaused = true; C.heldSync(); const c4 = C.heldSay('paused words'); cl.selfPaused = false;
    cl.heldNames = ['Kael', 'Sela']; const c5 = C.heldBanner(); cl.heldNames = [];
    const clientOk = c1[0] === true && c1[1] === J(['Kael']) && c1[2] === 1 && /^Kael needs a new sheet before you can play\. Open its sheet and press Send a new sheet\. Chat and pages still work\.$/.test(c1[3]) && c1[4] === C.HELD_WORDS
        && /^2 of your characters need a new sheet before you can play\. Open each sheet and press Send a new sheet\. Chat and pages still work\.$/.test(c5)
        && c2[0] === false && c2[1] === '[]' && c2[2] === 'x' && c3 === false && c4 === 'paused words' && logs.filter(l => /^sheetrev v1 (held|free)/.test(l)).length >= 2 && H.heldNames().length === 0;
    // the wiring: every pause gate composes the hold; the upload asks the GM's pause alone; a Waypoint file for an out-of-date character goes for review
    const wiredOk = src.includes("function peerPaused(peer) { var p = net.roster[peer]; return !!(p && (pausedById(p.id) || (typeof heldById === 'function' && heldById(p.id)))); }")
        && src.includes("if (net.paused || (typeof peerGmPaused === 'function' ? peerGmPaused(conn.peer) : peerPaused(conn.peer))) { ansU({ reason: 'paused' }); return; }")
        && src.includes("var staleU = !!(typeof Su.charStale === 'function' && Su.charStale(campU.system, chU));") && !src.includes("if (isFileU && !staleU)") /* 1.6.0: a character file goes for review on a character in play too (moved on purpose) */
        && src.includes("Su.revProposal(campU.system, chU, fillR, Fu, { view: viewR, lib: pfR.lib, now: nowU })") && src.includes("if (rdU) entU.reader = rdU.id; if (staleU) entU.rev = true;")
        && src.includes("if (msg.id && typeof peerHeld === 'function' && peerHeld(conn.peer)) return;") && src.includes("var frozenMe = (net.paused || net.selfPaused || net.selfHeld || net.reconnecting) && isClient;") /* 1.6.3 (finding 15): a reconnect holds as a pause does, moved on purpose */
        && (src.match(/if \(typeof heldSync === 'function'\) heldSync\(\)/g) || []).length === 5 && src.includes("if (srD) chD.sheetRev = srD;");
    check('1.6.0, backlog 190: the host holds a player who has a character out of date (heldById over systemcore staleOf; never for a current one, an NPC or another player), composed with the GM\'s own pause at every gate (peerPaused) while a new sheet may still be sent (the upload asks the GM\'s pause alone); '
        + 'a held player points at nothing; a Waypoint file for an out-of-date character in play goes to the Review as a new sheet (rev), one a reader takes too, while for a current one it is still refused; a character finished in the making is made current; '
        + 'the player\'s app reads its hold from its own copies (heldSync: the banner in fixed words, the board dimmed, the step logged, never in the stream window) and says a refusal the hold gave as one (heldSay), the GM\'s pause still said as a pause',
        hostOk && clientOk && wiredOk, J([hostOk, clientOk, wiredOk, c1, c2, c3, c4, logs]));
})());
pendingChecks.push((async () => {
    const j = JSON.stringify, K32 = 'k'.repeat(32), PROOF = (key, nonce, room) => hmacRef(key, 'wp-auth|' + nonce + '|' + room + FPTAIL);
    const h = harness({ players: { u_known: { name: 'Kay', key: K32 } } }); const c = h.conn('p2');
    h.hello(c, { id: 'u_known', name: 'Kay' }, { key: K32 }); await h.settle();
    const a = h.lastSent('p2', 'auth');
    check('hello: a hello carrying the table key itself (an older client) is never admitted on it — the known id is challenged with an auth naming the GM and a fresh nonce, not admitted, not queued yet', a && a.m.gmId === 'u_gm' && /^[0-9a-f]{32}$/.test(a.m.nonce) && h.admitted.length === 0 && h.env.pendingJoins.length === 0 && h.timers.length === 1, j([a && a.m, h.admitted]));
    h.hello(c, { id: 'u_known', name: 'Kay' }, { key: K32 }); await h.settle();
    check('hello: the key itself answering the challenge → the GM decides, flagged as a known name without its key; the challenge timer cleared', h.admitted.length === 0 && h.env.pendingJoins.length === 1 && h.env.pendingJoins[0].why === 'nokey' && h.lastSent('p2', 'wait') && h.timers.length === 0);
    const h2 = harness({ players: { u_known: { name: 'Kay', key: K32 } } }); const c2 = h2.conn('p3');
    h2.hello(c2, { id: 'u_known', name: 'Kay' }); await h2.settle();   // no proof yet (a fresh join does not know the nonce)
    const a2 = h2.lastSent('p3', 'auth');
    check('hello: a known id without a proof is challenged (auth with the GM id and a nonce of its own), not admitted, not queued yet', a2 && a2.m.gmId === 'u_gm' && typeof a2.m.nonce === 'string' && a2.m.nonce.length === 32 && a2.m.nonce !== a.m.nonce && h2.admitted.length === 0 && h2.env.pendingJoins.length === 0 && h2.timers.length === 1);
    h2.hello(c2, { id: 'u_known', name: 'Kay' }, { proof: PROOF(K32, a2.m.nonce, 'waypoint-c1') }); await h2.settle();   // the client answers with the proof over the host's room and its nonce
    check('hello: the answer proving the key over the host\'s own room and its nonce admits, the key kept, the challenge timer cleared', h2.admitted.length === 1 && h2.admitted[0].key === K32 && h2.env.pendingJoins.length === 0 && h2.timers.length === 0, j([h2.admitted, h2.env.pendingJoins.length, h2.timers.length]));
    // wrong proofs: never admitted, the GM decides
    const bad = async mk => { const hb = harness({ players: { u_known: { name: 'Kay', key: K32 } } }); const cb = hb.conn('px'); hb.hello(cb, { id: 'u_known', name: 'Kay' }); await hb.settle(); const n = hb.lastSent('px', 'auth').m.nonce; hb.hello(cb, { id: 'u_known', name: 'Kay' }, mk(n)); await hb.settle(); return { adm: hb.admitted.length, q: hb.env.pendingJoins.map(x => x.why), wait: !!hb.lastSent('px', 'wait'), h: hb, c: cb, n }; };
    const otherRoom = await bad(n => ({ proof: PROOF(K32, n, 'waypoint-c1-r1') })), otherGm = await bad(n => ({ proof: PROOF(K32, n, 'waypoint-zz') })), otherNonce = await bad(() => ({ proof: PROOF(K32, H.newKey(), 'waypoint-c1') }));
    const otherKey = await bad(n => ({ proof: PROOF('x'.repeat(32), n, 'waypoint-c1') })), cut = await bad(n => ({ proof: PROOF(K32, n, 'waypoint-c1').slice(0, 63) })), noStr = await bad(() => ({ proof: 12 })), empty = await bad(() => ({ proof: '' }));
    const refused = r => r.adm === 0 && j(r.q) === j(['nokey']) && r.wait;
    check('hello: a proof made for another room (a squatted generation of this code, another GM\'s table), over another nonce, with another key, cut short, empty or no string → never admitted; the GM decides, flagged nokey', [otherRoom, otherGm, otherNonce, otherKey, cut, noStr, empty].every(refused), j([otherRoom, otherGm, otherNonce, otherKey, cut, noStr, empty].map(r => [r.adm, r.q, r.wait])));
    otherRoom.h.hello(otherRoom.c, { id: 'u_known', name: 'Kay' }, { proof: PROOF(K32, otherRoom.n, 'waypoint-c1') }); await otherRoom.h.settle();
    check('hello: a nonce is good for one answer — the right proof after a wrong one is not taken (no second challenge, the one request in line)', otherRoom.h.admitted.length === 0 && otherRoom.h.env.pendingJoins.length === 1 && otherRoom.h.sent.filter(s => s.m.type === 'auth').length === 1);
    const lateP = harness({ players: { u_known: { name: 'Kay', key: K32 } } }); const cL = lateP.conn('pL');
    lateP.hello(cL, { id: 'u_known', name: 'Kay' }); await lateP.settle(); const nL = lateP.lastSent('pL', 'auth').m.nonce;
    lateP.fireTimers();   // 2.5 s with no answer: the request went to the GM
    lateP.hello(cL, { id: 'u_known', name: 'Kay' }, { proof: PROOF(K32, nL, 'waypoint-c1') }); await lateP.settle();
    check('hello: a right proof that lands after the challenge timer put the request to the GM leaves it with the GM — never admitted beside a request in line (a second admit on the GM\'s yes would re-issue the key under the player), never a second request', lateP.admitted.length === 0 && lateP.env.pendingJoins.length === 1 && lateP.env.pendingJoins[0].why === 'nokey' && lateP.sent.filter(s => s.m.type === 'auth').length === 1, j([lateP.admitted, lateP.env.pendingJoins.map(x => x.why)]));
    // the check is asynchronous: what changed while it ran is judged again
    const late = async (act) => { const hl = harness({ players: { u_known: { name: 'Kay', key: K32 } } }); const cl = hl.conn('pl'); hl.hello(cl, { id: 'u_known', name: 'Kay' }); await hl.settle(); const n = hl.lastSent('pl', 'auth').m.nonce; hl.hello(cl, { id: 'u_known', name: 'Kay' }, { proof: PROOF(K32, n, 'waypoint-c1') }); act(hl, cl); await hl.settle(); return { adm: hl.admitted.length, q: hl.env.pendingJoins.length, denied: hl.sent.filter(s => s.peer === 'pl' && s.m.type === 'denied').map(s => s.m.reason) }; };
    const closed = await late((hl, cl) => { cl.open = false; }), gone = await late(hl => { hl.env.net.role = null; });
    let dupOld = null; const dup = await late(hl => { dupOld = { h: hl, c: hl.conn('pOther') }; hl.env.net.roster.pOther = { id: 'u_known', name: 'Kay' }; hl.env.lastSeen.pOther = Date.now(); });
    const rotated = await late(hl => { hl.camp.players.u_known.key = 'n'.repeat(32); });
    // 1.6.3 (the multiplayer review, finding 17), moved on purpose: the same identity admitted meanwhile on another live connection was refused as
    // already at the table, which threw a player's F5 reload out of the session. The right key proven over this very connection now lets the new
    // connection in, and the old one leaves the roster and is closed
    check('hello: while a proof is being checked, a connection that closed or a table that ended admits nothing; the same identity admitted meanwhile on another live connection steps aside for a right proof over this connection (finding 17, moved on purpose: it was refused as already at the table); a key the GM re-issued meanwhile makes the old proof worthless (the GM decides)',
        j(closed) === j({ adm: 0, q: 0, denied: [] }) && j(gone) === j({ adm: 0, q: 0, denied: [] }) && dup.adm === 1 && dup.q === 0 && j(dup.denied) === j([]) && dupOld && dupOld.c.open === false && !('pOther' in dupOld.h.env.net.roster) && rotated.adm === 0 && rotated.q === 1, j([closed, gone, dup, rotated]));
    // the player's side: the auth branch answers with a proof over the room THIS app dialed, never the key; once per connection, before the snapshot only
    const N1 = H.newKey(), N2 = H.newKey(), KA = 'a'.repeat(32), KC = 'c'.repeat(32);
    const cl = (peer, keys, pre) => { const hc = harness({ role: 'client' }); storage.clear(); Object.keys(keys).forEach(g => H.rememberTableKey(g, keys[g])); if (pre) pre(hc); const cc = hc.conn(peer); return { h: hc, c: cc, hellos: () => hc.sent.filter(s => s.m.type === 'hello').map(s => s.m) }; };
    const C1 = cl('waypoint-mallory', { u_alice: KA, u_carol: KC });
    runGate(C1.h.env, { type: 'auth', gmId: 'u_alice', nonce: N1 }, C1.c); await C1.h.settle(); const said1 = C1.hellos();
    check('auth (client): the answer is a hello carrying a proof over the key for the GM named, the nonce and the room THIS app dialed — the key itself never, in no field', said1.length === 1 && said1[0].proof === PROOF(KA, N1, 'waypoint-mallory') && !('key' in said1[0]) && j(said1).indexOf(KA) < 0 && j(said1).indexOf(KC) < 0 && said1[0].version === '1.5.0' && said1[0].profile.id === 'u_me', j(said1));
    runGate(C1.h.env, { type: 'auth', gmId: 'u_carol', nonce: N1 }, C1.c); runGate(C1.h.env, { type: 'auth', gmId: 'u_alice', nonce: N2 }, C1.c); await C1.h.settle();
    const C2 = cl('waypoint-x', { u_alice: KA }, hc => { hc.env.net.syncedPeer = 'waypoint-x'; }); runGate(C2.h.env, { type: 'auth', gmId: 'u_alice', nonce: N1 }, C2.c); await C2.h.settle();
    const C3 = cl('waypoint-x', { u_alice: KA }); const other = { peer: 'other', open: true, send: m => C3.h.sent.push({ peer: 'other', m }) }; runGate(C3.h.env, { type: 'auth', gmId: 'u_alice', nonce: N1 }, other); await C3.h.settle();
    check('auth (client): one answer per connection — a second and a third challenge (another GM named, another nonce) get nothing; after the snapshot, or on a connection other than the one this app dialed, nothing at all', C1.hellos().length === 1 && C2.h.sent.length === 0 && C3.h.sent.length === 0, j([C1.hellos().length, C2.h.sent.length, C3.h.sent.length]));
    const C4 = cl('waypoint-x', { u_alice: KA }); runGate(C4.h.env, { type: 'auth', gmId: 'u_bob', nonce: N1 }, C4.c); await C4.h.settle();
    const C5 = cl('waypoint-x', { u_alice: KA }); runGate(C5.h.env, { type: 'auth', gmId: 'u_alice' }, C5.c); await C5.h.settle();   // a host before the proof (1.4.9) asks with no nonce
    const C6 = cl('waypoint-x', { u_alice: KA }); runGate(C6.h.env, { type: 'auth', gmId: 'u_alice', nonce: 'short' }, C6.c); await C6.h.settle();
    const plain = o => { const s = o.hellos(); return s.length === 1 && !('proof' in s[0]) && !('key' in s[0]) && j(s).indexOf(KA) < 0; };
    check('auth (client): with no key for the GM named, or a host that sends no usable nonce (an older host), a plain hello — the GM is simply asked — and never the key itself', plain(C4) && plain(C5) && plain(C6), j([C4.hellos(), C5.hellos(), C6.hellos()]));
    // the relay end to end (#7, #22): Alice's table knows Bob; Bob dials a room that is not hers, which forwards her challenge to him and his answer to her
    const KB = 'b'.repeat(32);
    const A = harness({ players: { u_bob: { name: 'Bob', key: KB } }, roomPeer: 'waypoint-alice' }); const mAtA = A.conn('mallory-peer');
    A.hello(mAtA, { id: 'u_bob', name: 'Bob' }); await A.settle(); const nA = A.lastSent('mallory-peer', 'auth').m.nonce;
    const B = cl('waypoint-mallory', { u_alice: KB }); runGate(B.h.env, { type: 'auth', gmId: 'u_alice', nonce: nA }, B.c); await B.h.settle();
    A.hello(mAtA, { id: 'u_bob', name: 'Bob' }, { proof: B.hellos()[0].proof }); await A.settle();
    const A2 = harness({ players: { u_bob: { name: 'Bob', key: KB } }, roomPeer: 'waypoint-alice' }); const bobAtA = A2.conn('bob-peer');
    A2.hello(bobAtA, { id: 'u_bob', name: 'Bob' }); await A2.settle(); const nA2 = A2.lastSent('bob-peer', 'auth').m.nonce;
    const B2 = cl('waypoint-alice', { u_alice: KB }); runGate(B2.h.env, { type: 'auth', gmId: 'u_alice', nonce: nA2 }, B2.c); await B2.h.settle();
    A2.hello(bobAtA, { id: 'u_bob', name: 'Bob' }, { proof: B2.hellos()[0].proof }); await A2.settle();
    check('relay (#7, #22, end to end on both sides\' real code): a challenge forwarded through another room — a squatted generation of the code, or a table of the forwarder\'s own — is answered with a proof over THAT room, which admits nothing at the real table (the GM decides, flagged nokey), and the key never left the player\'s machine; the player dialing the real room and answering its nonce goes straight in, the key kept',
        A.admitted.length === 0 && A.env.pendingJoins.length === 1 && A.env.pendingJoins[0].why === 'nokey' && j(B.h.sent).indexOf(KB) < 0 && A2.admitted.length === 1 && A2.admitted[0].key === KB && A2.env.pendingJoins.length === 0, j([A.admitted, A.env.pendingJoins.map(x => x.why), A2.admitted]));
    // the helpers themselves, and the first hello
    const vec = H.hmacHex ? await H.hmacHex('key', 'The quick brown fox jumps over the lazy dog') : null;
    const none = H.hmacHex ? await Promise.all([H.hmacHex('', 'x'), H.hmacHex(null, 'x'), H.hmacHex('k', 5)]) : [1];
    const noSub = H.hmacHex ? await (new Function('localStorage', 'crypto', helpersSrc + '\nreturn hmacHex;')(storage, {}))('key', 'x') : 1;
    check('auth proof: hmacHex is HMAC-SHA256 as hex (the known vector), null with no key, no text or no WebCrypto (the host then asks the GM; the player sends no proof); authData binds the nonce to the room dialed; sameStr compares whole strings only — a prefix, another length or another type never equal',
        vec === 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8' && none.every(x => x === null) && noSub === null && !!H.authData && H.authData('n1', 'waypoint-ab', 'P', 'H') === 'wp-auth|n1|waypoint-ab|P|H' && !!H.sameStr && H.sameStr('abc', 'abc') === true && !H.sameStr('abc', 'ab') && !H.sameStr('abc', 'abd') && !H.sameStr('', 'a') && !H.sameStr(undefined, undefined) && !H.sameStr(1, 1), j([vec, none, noSub]));
    const firstHello = (src.match(/conn\.send\(\{ type: 'hello'[^\n]*/g) || []).filter(l => /before the first heartbeat/.test(l));
    check('joinSession: the first hello carries no key and no proof — nothing of a previous table reaches the next host unasked (a known player is challenged for a proof instead); tableKeyFor(net.gmId) is gone', firstHello.length === 1 && !/\bkey\b|tableKeyFor|proof/.test(firstHello[0].split(');')[0]) && src.indexOf('tableKeyFor(net.gmId)') < 0, j(firstHello));
    check('reconnect: a retry dials the generation that last answered first, then the others in turn (retryGen, wired into joinSession and recorded at each open)', !!H.retryGen && H.retryGen(0, 1, 4) === 0 && H.retryGen(0, 2, 4) === 1 && H.retryGen(2, 1, 4) === 2 && H.retryGen(2, 3, 4) === 0 && H.retryGen(3, 2, 4) === 0 && H.retryGen(undefined, 1, 4) === 0 && H.retryGen('x', 7, 4) === 2 && /var gen = isRetry \? genNotRefused\(code, retryGen\(reconn\.gen, reconn\.tries, ROOM_GENS\), ROOM_GENS, roomPeerId\) : probe;/.test(src) && /reconn\.gen = gen;/.test(src));
    // #11: the key store — a snapshot's key taken once per connection, at most 50 kept, the launch merge capped alike
    const snapKeySrc = tryBetween('// [netcheck:snapkey-start]', '// [netcheck:snapkey-end]');
    if (!snapKeySrc) check('snapshot: the snapkey slice is marked', false, 'markers missing');
    else {
        const runSnapKey = new Function('net', 'msg', 'conn', 'rememberTableKey', snapKeySrc);
        storage.clear(); const netS = { gmId: '' }, cS = { peer: 'h1' };
        runSnapKey(netS, { gmId: 'u_a', key: 'k1' }, cS, H.rememberTableKey); const s1 = [netS.gmId, H.tableKeyFor('u_a')];
        runSnapKey(netS, { gmId: 'u_b', key: 'k2' }, cS, H.rememberTableKey); runSnapKey(netS, { gmId: 'u_a', key: 'junk' }, cS, H.rememberTableKey); const s2 = [netS.gmId, H.tableKeyFor('u_a'), H.tableKeyFor('u_b')];
        runSnapKey(netS, { gmId: 'u_a', key: 'k3' }, { peer: 'h2' }, H.rememberTableKey);   // the next connection (the GM let them in again, a fresh key issued): its first key is taken
        runSnapKey(netS, { gmId: 'u_c' }, { peer: 'h3' }, H.rememberTableKey); runSnapKey(netS, { gmId: 'u_c', key: 'k4' }, { peer: 'h3' }, H.rememberTableKey);   // a snapshot with no key spends nothing
        check('snapshot (client): a table key is taken once per connection — a later snapshot on the same connection stores no key under any GM id and overwrites none; the next connection\'s first keyed snapshot is taken (a GM\'s Allow issues a fresh key); the GM id follows every snapshot as before', j(s1) === j(['u_a', 'k1']) && j(s2) === j(['u_a', 'k1', '']) && H.tableKeyFor('u_a') === 'k3' && H.tableKeyFor('u_c') === 'k4' && netS.gmId === 'u_c', j([s1, s2, H.tableKeyFor('u_a'), H.tableKeyFor('u_c')]));
    }
    storage.clear(); for (let i = 0; i < 200; i++) H.rememberTableKey('u_gm' + i, 'k' + i);
    const cap1 = [Object.keys(JSON.parse(storage.getItem('wp_tableKeys'))).length, H.tableKeyFor('u_gm199'), H.tableKeyFor('u_gm150'), H.tableKeyFor('u_gm149'), H.tableKeyFor('u_gm0')];
    H.rememberTableKey('u_gm150', 'k150b'); for (let i = 200; i < 249; i++) H.rememberTableKey('u_gm' + i, 'k' + i);
    const cap2 = [Object.keys(JSON.parse(storage.getItem('wp_tableKeys'))).length, H.tableKeyFor('u_gm150'), H.tableKeyFor('u_gm151'), H.tableKeyFor('u_gm248')];
    check('table keys (client): at most 50 are kept, the oldest forgotten first; a key written again counts as the newest (a host sending snapshots under ever new GM ids cannot grow the store or the preferences file)', j(cap1) === j([50, 'k199', 'k150', '', '']) && j(cap2) === j([50, 'k150b', '', 'k248']), j([cap1, cap2]));
    const html = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const bootPrefs = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'bootprefs.js'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })();   // the launch merge: the page's script directly after /api/prefs.js (it was written into index.html until the page's policy stopped running script written into a page)
    const mergeLines = bootPrefs.split('\n').filter(l => l.indexOf("if (k === 'wp_tableKeys') {") >= 0);
    const runMerge = mergeLines.length === 1 ? new Function('k', 'f', 'localStorage', mergeLines[0].trim() + '\nreturn "fell through";') : () => 'no line';
    const mkStore = () => { const m = {}; const st = { refuse: false, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { if (st.refuse) throw new Error('quota'); m[k] = String(v); }, m }; return st; };
    const fileKeys = {}; for (let i = 0; i < 120; i++) fileKeys['u_f' + i] = 'f' + i; const localKeys = {}; for (let i = 0; i < 10; i++) localKeys['u_l' + i] = 'l' + i;
    const st1 = mkStore(); st1.setItem('wp_tableKeys', JSON.stringify(localKeys)); const m1 = runMerge('wp_tableKeys', { prefs: { wp_tableKeys: JSON.stringify(fileKeys) } }, st1); const merged = JSON.parse(st1.getItem('wp_tableKeys'));
    const st2 = mkStore(); st2.setItem('wp_tableKeys', JSON.stringify({ u_l0: 'l0' })); st2.refuse = true; const m2 = runMerge('wp_tableKeys', { prefs: { wp_tableKeys: JSON.stringify({ u_f0: 'f0' }) } }, st2);
    const st3 = mkStore(); st3.setItem('wp_tableKeys', JSON.stringify({ u_l0: 'l0' })); const m3 = runMerge('wp_tableKeys', { prefs: { wp_tableKeys: JSON.stringify({ u_f0: 'f0' }) } }, st3);
    check('launch merge (scripts/bootprefs.js, which the page runs directly after /api/prefs.js and before its first module; index.html holds no copy): the table keys of the file and this machine merge to at most 50, the file\'s newest kept and the oldest forgotten; a small merge keeps both sides whole; a storage refusal ends that key quietly instead of falling through to the raw file value',
        /<script src="\/api\/prefs\.js"><\/script>\n<script src="scripts\/bootprefs\.js"><\/script>\n<script type="module" src="scripts\/formula\.js"><\/script>/.test(html) && html.indexOf('<script type="module"') > html.indexOf('<script src="scripts/bootprefs.js">') && !/wp_tableKeys|wpFilePrefs/.test(html) && m1 !== 'fell through' && m1 !== 'no line' && Object.keys(merged).length === 50 && merged.u_f119 === 'f119' && merged.u_f70 === 'f70' && !('u_f69' in merged) && !('u_l0' in merged) && m2 !== 'fell through' && st2.m.wp_tableKeys === JSON.stringify({ u_l0: 'l0' }) && m3 !== 'fell through' && j(JSON.parse(st3.m.wp_tableKeys)) === j({ u_l0: 'l0', u_f0: 'f0' }), j([m1, merged && Object.keys(merged).length, m2, m3]));
    // #12: before the snapshot, or from a peer other than the synced host, no client branch applies anything (fromHost at every call site, the real branches run)
    const seg = (a, b, label) => { const i = src.indexOf(a), e = src.indexOf(b, i); if (i < 0 || e < 0 || src.indexOf(a, i + 1) >= 0) throw new Error('netcheck: the ' + label + ' branch not found once'); return src.slice(i, e); };
    const branches = [
        seg("} else if (msg.type === 'item') {", "} else if (msg.type === 'threats' && net.role === 'host') {", 'item'),
        seg("} else if (msg.type === 'itemDelta' && net.role === 'client') {", "} else if (msg.type === 'itemGone' && net.role === 'client') {", 'itemDelta'),
        seg("} else if (msg.type === 'stage' && net.role === 'client') {", "} else if (msg.type === 'snap' && net.role === 'client') {", 'stage, pause, pausePlayer'),
        seg("} else if (msg.type === 'travelLock' && net.role === 'client') {", "} else if (msg.type === 'travel' && net.role === 'host') {", 'travelLock, travelDenied'),
        seg("} else if (msg.type === 'handout' && net.role === 'client') {", "} else if (msg.type === 'end' && net.role === 'client') {", 'handout, notepad, combats, targets, pos'),
        seg("} else if (msg.type === 'chat-history' && net.role === 'client') {", "} else if (msg.type === 'roster' && net.role === 'client') {", 'chat-history')];
    const fromHostSrc = tryBetween('// [netcheck:fromhost-start]', '// [netcheck:fromhost-end]') || 'function fromHost() { return true; }';
    const DN = ['net', 'own', 'applyItem', 'applyItemDelta', 'applyStage', 'toast', 'setPausedLocal', 'setSelfPausedLocal', 'render', 'setTravelLockLocal', 'window', 'applyNotepad', 'cleanCombats', 'getActiveCampaign', 'combatRefresh', 'cleanTargets', 'handlePos', 'chatLog', 'ringPush', 'ringRepaint', 'renderChat', 'ui', 'chatUnread', 'state'];   // state: the handout gate (cluster F) reads the campaign on screen
    const dispatch = new Function('env', 'msg', 'conn', 'var ' + DN.map(n => n + ' = env.' + n).join(', ') + ';\n' + fromHostSrc + '\nif (false) {\n' + branches.join('\n') + '\n}\nreturn "ran";');
    const mkD = (foreign, synced) => { const rec = []; const env = { net: { role: 'client', foreign, syncedPeer: synced, paused: false, combats: {}, targets: {}, gmId: 'u_gm', stream: false }, state: { appState: { activeCampaignId: 'camp_tutorial' } }, own: H.own, applyItem: m => rec.push('item:' + m.itemId), applyItemDelta: () => rec.push('delta'), applyStage: s => rec.push('stage:' + (s && s.itemId)), toast: () => rec.push('t'), setPausedLocal: on => rec.push('pause:' + on), setSelfPausedLocal: on => rec.push('pauseMe:' + on), render: () => {}, setTravelLockLocal: on => rec.push('lock:' + on), window: { wpJournalReceive: () => rec.push('handout') }, applyNotepad: () => rec.push('notepad'), cleanCombats: () => { rec.push('combats'); return {}; }, getActiveCampaign: () => null, combatRefresh: () => {}, cleanTargets: () => { rec.push('targets'); return {}; }, handlePos: () => rec.push('pos'), chatLog: [], ringPush: () => {}, ringRepaint: () => {}, renderChat: () => rec.push('chat'), ui: () => null, chatUnread: 0 }; return { env, rec }; };
    const MSGS = [{ type: 'item', campId: 'camp_tutorial', itemId: 'map_tut_city', item: { type: 'map' } }, { type: 'itemDelta', campId: 'camp_tutorial', itemId: 'map_tut_city' }, { type: 'stage', stage: { campId: 'camp_tutorial', itemId: 'map_tut_city' } }, { type: 'pause', on: true }, { type: 'pausePlayer', on: true }, { type: 'travelLock', on: true }, { type: 'travelDenied', reason: 'closed' }, { type: 'handout', campId: 'camp_tutorial', gmId: 'u_gm' }, { type: 'notepad' }, { type: 'combats', combats: {} }, { type: 'targets', targets: {} }, { type: 'pos', wbId: 'w' }, { type: 'chat-history', log: [{ from: { id: 'gm', name: 'GM', gm: true }, text: 'hi', ts: 1 }] }];
    const runD = (foreign, synced, peer) => { const d = mkD(foreign, synced); let threw = ''; MSGS.forEach(m => { try { dispatch(d.env, m, { peer }); } catch (e) { threw += e.message + ';'; } }); return { rec: d.rec, log: d.env.chatLog.length, threw }; };
    const before = runD(false, null, 'room-x'), hop = runD(true, null, 'room-x'), elsewhere = runD(true, 'room-x', 'room-y'), fine = runD(true, 'room-x', 'room-x');
    check('pre-snapshot (every client branch run for real, gated by fromHost): before the snapshot, after a table hop with no snapshot yet, or from a peer other than the synced host, item / itemDelta / stage / pause / pausePlayer / travelLock / travelDenied / handout / notepad / combats / targets / pos / chat-history apply nothing — the player\'s own campaign is never touched by a host that has not admitted them; from the synced host each applies as before',
        before.threw === '' && before.rec.length === 0 && before.log === 0 && hop.rec.length === 0 && hop.log === 0 && elsewhere.rec.length === 0 && elsewhere.log === 0 && fine.threw === '' && j(fine.rec) === j(['item:map_tut_city', 'delta', 'stage:map_tut_city', 't', 'pause:true', 't', 'pauseMe:true', 't', 'lock:true', 't', 't', 'handout', 'notepad', 'combats', 'targets', 'pos', 'chat']) && fine.log === 1, j([before, hop, elsewhere, fine]));
    // #13: denied / kicked acted on once, from the dialed host only, the connection closed from this side
    const deniedSrc = tryBetween('// [netcheck:denied-start]', '// [netcheck:denied-end]') || seg("} else if ((msg.type === 'denied' || msg.type === 'kicked') && net.role === 'client') {", "} else if (msg.type === 'snapshot' && net.role === 'client') {", 'denied').replace(/^[^\n]*\n/, '');
    const DD = ['net', 'setStatus', 'showConfirm', 'toast', 'ui', 'window', 'setTimeout', 'updateMessage', 'APP_VERSION'];
    const runDenied = new Function('env', 'msg', 'conn', 'var ' + DD.map(n => n + ' = env.' + n).join(', ') + ';\n' + deniedSrc + '\nreturn "ran";');
    const updMsgSrc = (() => { const i = src.indexOf('function updateMessage(theirs, ours) {'); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 3); })();
    const realUpdateMessage = updMsgSrc ? new Function(updMsgSrc + '\nreturn updateMessage;')() : () => 'no updateMessage';
    const mkDen = () => { const hd = { confirms: [], status: [], timers: [], closed: 0, toasts: [] }; const conn = { peer: 'host-x', open: true, close: () => { hd.closed++; conn.open = false; } }; const env = { net: { role: 'client', conns: [conn], leaving: false, fromWelcome: false }, setStatus: s => hd.status.push(s), showConfirm: t => hd.confirms.push(t), toast: t => hd.toasts.push(t), ui: () => ({ style: {} }), window: {}, setTimeout: (fn, ms) => { hd.timers.push({ fn, ms }); return hd.timers.length; }, updateMessage: realUpdateMessage, APP_VERSION: '1.4.9' }; return { h: hd, env, conn }; };
    const D1 = mkDen(); const bigWhy = 'x'.repeat(100000);
    for (let i = 0; i < 50; i++) runDenied(D1.env, { type: 'denied', update: true, reason: bigWhy }, D1.conn);
    const d1 = { confirms: D1.h.confirms.length, status: D1.h.status.length, timers: D1.h.timers.map(t => t.ms), leaving: D1.env.net.leaving, said: D1.h.status[0] || '' }; D1.h.timers.forEach(t => t.fn());
    const D2 = mkDen(); runDenied(D2.env, { type: 'denied', reason: 'no' }, { peer: 'other', open: true, close: () => { D2.h.closed++; } });
    const D3 = mkDen(); runDenied(D3.env, { type: 'kicked' }, D3.conn); runDenied(D3.env, { type: 'kicked' }, D3.conn);
    const D4 = mkDen(); runDenied(D4.env, { type: 'denied', reason: 'The GM declined your request to join.' }, D4.conn); runDenied(D4.env, { type: 'denied', update: true, reason: 'again' }, D4.conn);
    check('denied / kicked (client): acted on once per connection — one status line, no dialog — and the connection closed from this side 400 ms later, so a host that keeps the line open and repeats itself is not followed (49 more on the same line do nothing); one from a connection other than the one this app dialed does nothing; the removal words for kicked; a plain reason shown as the status line',
        d1.confirms === 0 && d1.status === 1 && j(d1.timers) === j([400]) && D1.h.closed === 1 && d1.leaving === true && D2.h.status.length === 0 && D2.env.net.leaving === false && D2.h.timers.length === 0 && D2.h.closed === 0
        && D3.h.status.length === 1 && D3.h.status[0] === 'Removed from the session by the GM.' && D3.h.timers.length === 1 && D3.h.confirms.length === 0 && D4.h.status.length === 1 && D4.h.status[0] === 'The GM declined your request to join.' && D4.h.confirms.length === 0 && D4.h.timers.length === 1, j([d1.confirms, d1.status, d1.timers, D1.h.closed, D2.h, D3.h.status, D4.h.status]));
    // R2 security, cluster K (g15): an update notice is said in this app's OWN words — the host names its version at most — in the status line and
    // the toast, never in a dialog; a hostile reason is cut to 200 plain characters; update is true alone
    const D5 = mkDen(); runDenied(D5.env, { type: 'denied', update: true, v: '1.5.0', reason: 'Run this command to fix your install: <svg onload=x>' }, D5.conn);
    const D6 = mkDen(); runDenied(D6.env, { type: 'denied', update: true, v: '<script>1</script>', reason: 'x' }, D6.conn);
    const D7 = mkDen(); runDenied(D7.env, { type: 'denied', update: -1, reason: 'no' }, D7.conn);
    const D8 = mkDen(); runDenied(D8.env, { type: 'denied', reason: 'a\u0000b‮c\n\n  d' + 'y'.repeat(1000) }, D8.conn);
    const ownWords = s => /^Your Waypoint \(1\.4\.9\) is older than the GM's/.test(s) && /Update Waypoint, then rejoin/.test(s) && !/x{10}|svg|onload|Run this/.test(s);
    check('denied (client, security 2026-10-01): an update notice is this app\'s own words — its own version, the GM\'s only as a version number the host named — in the status line and the toast, never a dialog with the host\'s text; a version that is none names nothing; update counts only as true (anything else is a plain refusal); a reason is cut to 200 characters with control and bidi characters out',
        ownWords(d1.said) && !/\(.*\)\. Update/.test(d1.said.split('older than')[1] || '') && D1.h.toasts.length === 1 && ownWords(D1.h.toasts[0]) && D1.h.confirms.length === 0
        && D5.h.confirms.length === 0 && D5.h.status.length === 1 && ownWords(D5.h.status[0]) && /older than the GM's \(1\.5\.0\)\. Update/.test(D5.h.status[0])
        && D6.h.confirms.length === 0 && /older than the GM's\. Update/.test(D6.h.status[0]) && !/script/.test(D6.h.status[0])
        && D7.h.confirms.length === 0 && D7.h.status[0] === 'no' && D8.h.status.length === 1 && D8.h.status[0].length === 200 && /^a b c dy+$/.test(D8.h.status[0]) && D8.h.confirms.length === 0,
        j([d1.said.slice(0, 80), D5.h.status, D6.h.status, D7.h.status, D8.h.status[0] && D8.h.status[0].slice(0, 20), D8.h.status[0] && D8.h.status[0].length]));
})());
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
    const h = harness(); const c = h.conn('p7');   // security (2026-10-01, cluster J #1): no "go straight in" list — a yes the GM gave to a connection that dropped opens nothing to a later hello claiming that id
    h.hello(c, { id: 'u_dropped', name: 'Dee' });
    check('hello: a hello claiming an id the GM once said yes to (on a connection that had dropped) is a new request — queued for the GM, never admitted on the name alone; the gate holds no approved-ids list', h.admitted.length === 0 && h.env.pendingJoins.length === 1 && !/approvedIds/.test(gateSrc));
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
    // 1.6.3 (finding 31): the Ban branch now asks first, so what it does stands in banAsk (the banask slice), which these checks run with a
    // question answered yes at once (banAnswer), moved on purpose; the questions asked are kept in banAsked
    const banA = '// [netcheck:banask-start]', banB = '// [netcheck:banask-end]', banI = src.indexOf(banA), banJ = src.indexOf(banB);
    if (banI < 0 || banJ < banI || src.indexOf(banA, banI + 1) >= 0 || src.indexOf(banB, banJ + 1) >= 0) throw new Error('netcheck: the banask slice not found once');
    const banBody = src.slice(banI + banA.length, banJ), banAsked = []; let banAnswer = true;
    if (!/if \(btn\.dataset\.ban\) \{\r?\n\s+banAsk\(camp, btn\.dataset\.ban\);\r?\n\s+return;/.test(src)) throw new Error('netcheck: the Ban branch does not ask banAsk');
    const buildKick = new Function('net', 'own', 'bannedIds', 'renderRoster', 'sensesForget', 'dropWaitingFor', 'sendFailed', 'setTimeout', 'toast', 'render', 'broadcastTargets', 'broadcastRoster', kickSrc + '\nreturn net.kickPlayer;');
    const runBan = (btn, camp, net, drop, save, toast) => new Function('net', 'own', 'getActiveCampaign', 'showConfirm', 'renderPlayersPanel', 'dropWaitingFor', 'save', 'toast', banBody + '\nreturn banAsk;')(
        net, H.own, () => camp, (q, cb, o) => { banAsked.push([q, !!(o && o.noEnter)]); cb(banAnswer); }, () => {}, drop, save, toast)(camp, btn.dataset.ban);
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
        let threw = ''; try { runBan({ dataset: { ban: pid } }, camp, K.env.net, id => K.ev.push('drop:' + id), () => saves.push(1), t => K.ev.push('toast:' + t)); } catch (e) { threw = e.message; } return { threw, calls, roster: K.rosterKeys(), kicked: K.kicked(), timers: K.timers.length, forgot: K.ev.filter(e => /^forget:/.test(e)), banned: Object.keys(camp.bannedPlayers || {}), session: Object.keys(K.env.bannedIds), saves: saves.length }; };
    const ban1 = banRun('u_a'), banAway = banRun('u_gone'), banClient = banRun('u_a', h => { h.env.net.role = 'client'; });
    const scripts = fs.readdirSync(path.join(__dirname, '..', 'system', 'app', 'scripts')).filter(f => /\.js$/.test(f)), noCom = s => s.replace(/\/\/[^\n]*/g, '');
    const kickedSends = scripts.map(f => [f, (fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').match(/type: 'kicked'/g) || []).length]).filter(x => x[1]);
    const kickCalls = scripts.map(f => [f, (noCom(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8')).match(/kickPlayer\(/g) || []).length]).filter(x => x[1]);
    check('M1: a Ban from the Players panel (its branch run for real) calls net.kickPlayer exactly once, with the first roster key of the profile, and that one call takes both of Pat\'s connections (told, closed, forgotten once); a profile not at the table and a player\'s machine call it not at all; in the source the Ban branch calls it once and never in a loop, net.js calls it twice (the roster\'s kick button, the Ban branch) and no other script does, and kickPlayer is the only place that sends \'kicked\'; the host has 31 message branches (video-up of item 21 among them, and voice-up of voice chat, 1.5.9, the newest) (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
        js(ban1) === js({ threw: '', calls: ['pA1'], roster: ['pB', 'pX', 'pY'], kicked: ['pA1', 'pA2'], timers: 2, forgot: ['forget:u_a'], banned: ['u_a'], session: ['u_a'], saves: 1 }) && js(banAway.calls) === js([]) && banAway.kicked.length === 0 && banAway.threw === '' && js(banClient.calls) === js([]) && banClient.kicked.length === 0 && banClient.threw === ''
        && (noCom(banBody).match(/net\.kickPlayer\(/g) || []).length === 1 && !/forEach|\bfor \(|\bwhile \(/.test(noCom(banBody)) && js(kickCalls) === js([['net.js', 2]]) && (noCom(src).match(/net\.kickPlayer\(/g) || []).length === 2
        && js(kickedSends) === js([['net.js', 1]]) && kickSrc.indexOf("conn.send({ type: 'kicked' });") >= 0 && (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 47 /* 1.6.4 (a player's name changed at the table, a deliberate change of this pin): profile-set, the 47th; 1.6.3 (the multiplayer review, finding 9): handout-want, the 46th; (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */, js([ban1, banAway, banClient, kickCalls, kickedSends]));

    // 1.6.3 (the improvement week's review of multiplayer, finding 31): Ban asks first, by name and with its buttons alone; a no bans, kicks
    // and saves nothing (banAsk run for real with a question answered no), and the yes the checks above ran asked one question each
    banAsked.length = 0; banAnswer = false; const banNo = banRun('u_a'); banAnswer = true; const askedNo = banAsked.slice(); banAsked.length = 0; const banYes = banRun('u_a'), askedYes = banAsked.slice();
    check('1.6.3 (finding 31): Ban from Player History asks first, by name, answered by its buttons alone (noEnter), as removing a player and Forget do: a no writes no ban, removes nobody and saves nothing; a yes bans, removes and saves as before',
        js(askedNo) === js([['Ban Pat from this campaign? They are removed now and refused in later sessions until you unban them.', true]]) && js(banNo.calls) === js([]) && banNo.kicked.length === 0 && js(banNo.banned) === js([]) && banNo.saves === 0
        && askedYes.length === 1 && js(banYes.calls) === js(['pA1']) && js(banYes.banned) === js(['u_a']) && banYes.saves === 1, js([askedNo, banNo, askedYes, banYes]));
    // 1.6.3 (the review of the click test pages): the page editor's hook (planner.js plannerPlayersMoved, asked through window.wpPlannerPlayers)
    // draws inside the network path, so one that throws must not stop the roster going out (broadcastRoster, run for real through the real
    // broadcast()) nor Ban's save, notice and panel (banAsk, run for real). A hook that throws stands in for a page that fails to draw
    {
        const hadW = Object.prototype.hasOwnProperty.call(globalThis, 'window'), oldW = globalThis.window, ce = console.error, errs = [];
        globalThis.window = { wpPlannerPlayers() { throw new Error('page draw failed'); } }; console.error = e => errs.push(String(e && e.message));
        let rThrew = '', bOut = null; const K = mkK(); K.env.broadcast = (m, ex) => runBroadcast(K.env, m, ex);
        try { try { runRoster(K.env).broadcastRoster(); } catch (e) { rThrew = e.message; } bOut = banRun('u_a'); }
        finally { console.error = ce; if (hadW) globalThis.window = oldW; else delete globalThis.window; }
        const ros = K.sent.filter(s => s.m.type === 'roster').map(s => s.peer);
        check('1.6.3 (the review of the click test pages) a page editor that fails to draw when the players change never stops the roster reaching every player, nor a Ban\'s save, removal and notice: the failure is logged and the rest goes on',
            rThrew === '' && js(ros) === js(['pA1', 'pA2', 'pB', 'pX', 'pY']) && !!bOut && bOut.threw === '' && js(bOut.banned) === js(['u_a']) && bOut.saves === 1 && js(bOut.calls) === js(['pA1'])
            && errs.filter(e => e === 'page draw failed').length === 3 /* the roster, the roster the Ban's removal sends, and the Ban's own ask */, js([rThrew, ros, bOut, errs]));
    }

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
    const withQ = h => { h.env.net.active = true; h.asks = []; h.env.showConfirm = (m, cb, o) => h.asks.push({ m, cb, o }); h.P = buildPNA(h.env); h.env.processNextApproval = h.P.run;
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
    check('a join request takes its buttons alone (the owed review of 2026-10-09; processNextApproval, run for real): each request put to the GM carries the two marks that keep Enter and Escape from answering it, since a key typed for something else let a stranger in or turned a player away for the session',
        js(Q1.asks.map(a => a.o)) === js([{ noEnter: true, noEscape: true, yes: 'Let in', no: 'Turn away' }, { noEnter: true, noEscape: true, yes: 'Let in', no: 'Turn away' }]) && Q1.asks.every(a => typeof a.o.gone === 'function') && src.includes("{ noEnter: true, noEscape: true, yes: 'Let in', no: 'Turn away', gone: goneQ });") /* 1.6.3 (finding 2): and the watch that takes it away once its connection closed, moved on purpose */, js(Q1.asks.map(a => a.o)));
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
{   // 1.5.5 (the release trace, F5, its review): the host keeps one of the GM's characters' pointers under tk: and its token's id, and a player on the roster
    // under such an id would clear that pointer by leaving or being removed, and read it as their own for a roll's range. So such an id is refused at the
    // gate, a stranger's and one the campaign knows alike, before anything else is sent; an id that holds tk: further in is a stranger as ever
    const h = harness({ players: { 'tk:t_kn': { name: 'Mal', key: 'z'.repeat(32) } } });
    const cT = h.conn('qT'), cK = h.conn('qK'), cU = h.conn('qU');
    h.hello(cT, { id: 'tk:t_orc', name: 'Mal' }); h.hello(cK, { id: 'tk:t_kn', name: 'Mal' }); h.hello(cU, { id: 'u.tk:x', name: 'Una' });
    const deniedTk = ['qT', 'qK'].map(p => h.sent.filter(s => s.peer === p && s.m.type === 'denied' && /not valid/.test(s.m.reason)).length);
    check('1.5.5 (the release trace, F5, its review) hello: a profile id that begins with tk:, the key of one of the GM\'s characters\' pointers, is refused as not valid and closed before anything else is sent, a stranger\'s and one the campaign knows alike, so no player is ever on the roster under one; an id that holds tk: further in waits for the GM as any stranger does',
        JSON.stringify(deniedTk) === '[1,1]' && h.closed.indexOf('qT') >= 0 && h.closed.indexOf('qK') >= 0 && !h.sent.some(s => (s.peer === 'qT' || s.peer === 'qK') && s.m.type !== 'denied')
        && h.admitted.length === 0 && h.env.pendingJoins.length === 1 && h.env.pendingJoins[0].prof.id === 'u.tk:x' && h.closed.indexOf('qU') < 0,
        JSON.stringify([deniedTk, h.sent.map(s => [s.peer, s.m.type]), h.closed, h.env.pendingJoins.map(p => p.prof.id)]));
}
pendingChecks.push((async () => {
    const h = harness({ players: { u_k: { name: 'K', key: 'z'.repeat(32) } } }); const c = h.conn('w1');   // admitted on the proof of the table key (a key is proven, never sent: see the proof flow above)
    h.hello(c, { id: 'u_k', name: 'K' }); await h.settle(); const nonce = h.lastSent('w1', 'auth').m.nonce;
    h.hello(c, { id: 'u_k', name: 'K', color: '#12ab34', avatar: 'data:text/html;base64,AAAA', location: 'map_secret', evil: { deep: 1 }, gm: true }, { key: 'z'.repeat(32), proof: hmacRef('z'.repeat(32), 'wp-auth|' + nonce + '|waypoint-c1' + FPTAIL) }); await h.settle();
    const prof = h.admitted[0] && h.admitted[0].prof;
    check('hello: only id/name/color survive from the profile (a bad avatar and any extra field are dropped), beside the host\'s own copy of the name the player\'s app goes by (appName, 1.6.4, a deliberate change of this pin: the cleaned name itself, never a field the peer sent, and never in the roster sent out)', prof && Object.keys(prof).sort().join() === 'appName,color,id,name' && prof.color === '#12ab34' && prof.appName === prof.name, JSON.stringify(h.admitted));
})());
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
    check('hello: an older client is turned away with the update notice, the host naming its own version (security K g15: the player\'s app says the notice in its own words)', h.lastSent('v2', 'denied') && h.lastSent('v2', 'denied').m.update === true && h.lastSent('v2', 'denied').m.v === '1.5.0');
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
    check('password (security 2026-10-01, cluster J #3): twenty wrong guesses under twenty names lock nobody else out — the right word under another name joins the queue as normal', h.lastSent('pwR', 'wait') && !h.lastSent('pwR', 'denied') && h.env.pendingJoins.some(j => j.prof.id === 'u_right'));
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
// 1.6.3 (the improvement week's review of multiplayer, finding 12; Fulllion, 2026-11-21): a player may whisper the GM or another player, the
// GM sees every whisper, and the host judges it: never relayed to anyone but the one named, never broadcast. The host's chat branch, run for real
{
    const h = harness(); const cP = h.conn('ch1'), cR1 = h.conn('ch2'), cR2 = h.conn('ch3'), cO = h.conn('ch4');
    h.env.net.roster.ch1 = { id: 'u_pat', name: 'Pat' }; h.env.net.roster.ch2 = { id: 'u_rae', name: 'Rae' }; h.env.net.roster.ch3 = { id: 'u_rae', name: 'Rae' }; h.env.net.roster.ch4 = { id: 'u_odo', name: 'Odo' };
    const sentTo = () => h.sent.filter(s => s.m.type === 'chat').map(s => s.peer).sort().join(',');
    runChat(h.env, { type: 'chat', text: 'a plan for you', to: 'gm', toName: 'Odo', scope: 'global' }, cP);
    const toGm = [h.pushed.length, h.pushed[0] && h.pushed[0].scope, h.pushed[0] && h.pushed[0].toId, h.pushed[0] && h.pushed[0].toName, sentTo(), h.bcast.length];
    runChat(h.env, { type: 'chat', text: 'meet me after', to: 'u_rae' }, cP);
    const toRae = [h.pushed.length, h.pushed[1] && h.pushed[1].scope, h.pushed[1] && h.pushed[1].toId, h.pushed[1] && h.pushed[1].toName, h.pushed[1] && h.pushed[1].from.id, sentTo(), h.bcast.length];
    const before = h.pushed.length;
    ['u_pat', 'u_nobody', '__proto__', 'constructor', 'a b', 'p:u_rae'].forEach(to => runChat(h.env, { type: 'chat', text: 'x', to }, cP));
    const dropped = [h.pushed.length - before, sentTo(), h.bcast.length];
    cR1.open = false; cR2.open = false;
    runChat(h.env, { type: 'chat', text: 'still there?', to: 'u_rae' }, cP);
    const goneRae = [h.pushed.length - before, sentTo()];
    check('1.6.3 finding 12 (the host\'s chat branch, run for real): a player\'s whisper to the GM stays on the GM\'s machine, marked whisper to GM and sent to nobody; one to another player goes to that player\'s open connections and to nobody else, the GM seeing it too; one to themselves, to nobody at the table, to a closed connection\'s player or to a word that is no profile id is dropped; none is ever broadcast',
        j(toGm) === j([1, 'whisper', 'gm', 'GM', '', 0]) && j(toRae) === j([2, 'whisper', 'u_rae', 'Rae', 'u_pat', 'ch2,ch3', 0]) && j(dropped) === j([0, 'ch2,ch3', 0]) && j(goneRae) === j([0, 'ch2,ch3']),
        j({ toGm, toRae, dropped, goneRae }));
}
// 1.6.3 (the improvement week's review of multiplayer, findings 4 and 12): Table Chat's To list names a player by profile id, follows the roster,
// keeps a player who left marked not connected and refuses a whisper to them, never falling back to Everyone. The whisper slice, run for real
{
    const wSrc = between('// [netcheck:whisper-start]', '// [netcheck:whisper-end]', 'whisper');
    const mkW = (role, more) => {   // more (the review of multiplayer chat): { DC, win } for a typed roll's path
        const out = { sent: [], bcast: [], pushed: [], toasts: [], logs: [] };
        const sel = { value: '', style: { display: 'none' }, innerHTML: '' }, input = { value: '' };
        const net = { role, active: true, myId: role === 'host' ? 'u_gm' : 'u_me', conns: [], roster: Object.create(null) };
        const conn = (peer, pid, name) => { const c = { peer, open: true, send: m => out.sent.push({ peer, m: JSON.parse(JSON.stringify(m)) }) }; net.conns.push(c); if (pid) net.roster[peer] = { id: pid, name }; return c; };
        const api = new Function('net', 'own', 'validProfileId', 'ui', 'escTextRoster', 'escText', 'toast', 'getProfile', 'chatMen', 'unkeepLinks', 'DC', 'window', 'broadcast', 'sendFailed', 'pushChat', 'logEvent',
            wSrc + '\nreturn { refresh: refreshChatRecipients, send: sendChat, target: whisperTarget, tag: whisperTag, choices: whisperChoices, knows: whispersKnow, pick: whisperRollPick, priv: whisperRollPriv, words: WHISPER_ROLL_WORDS };')(
            net, H.own, H.validProfileId, id => id === 'chatTo' ? sel : id === 'chatInput' ? input : null, s => String(s), s => String(s), t => out.toasts.push(String(t)), () => ({ name: role === 'host' ? 'GM' : 'Me' }), () => undefined, null, (more && more.DC) || (() => null), (more && more.win) || {},
            (m, ex) => out.bcast.push(JSON.parse(JSON.stringify(m))), () => {}, m => out.pushed.push(m), (k, t, how) => out.logs.push([t, how && how.h]));
        const opts = () => [...sel.innerHTML.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m => m[1] + '=' + m[2]);
        return { out, sel, input, net, conn, api, opts };
    };
    // the GM: Trevor picked, then he reloads under a new connection id
    const G = mkW('host'); const old = G.conn('peerOld', 'u_tre', 'Trevor'); G.conn('peerMira', 'u_mira', 'Mira');
    G.api.refresh(); const optsA = G.opts(); G.sel.value = 'p:u_tre';
    old.open = false; delete G.net.roster.peerOld; G.conn('peerNew', 'u_tre', 'Trevor');
    G.input.value = 'Secret for Trevor'; G.api.send();
    const reloadSend = [G.out.sent.map(s => s.peer).join(), G.out.bcast.length, G.out.pushed.length, G.out.pushed[0] && G.out.pushed[0].toName, G.out.pushed[0] && G.out.pushed[0].scope, G.api.tag(G.out.pushed[0] || {}), G.out.logs.length && G.out.logs[0][1]];
    // Trevor leaves for good: his row stays, marked, and a whisper to him is refused with the words kept in the box
    G.net.conns.filter(c => c.peer === 'peerNew')[0].open = false; delete G.net.roster.peerNew;
    G.api.refresh(); const optsGone = G.opts(), keptPick = G.sel.value;
    G.input.value = 'Are you there?'; G.api.send();
    const refused = [G.out.sent.length, G.out.bcast.length, G.out.pushed.length, G.input.value, G.out.toasts.slice(-1)[0]];
    // a player: the GM and the other players, never themselves; a whisper to the GM goes to the host as a word naming whom, never with their own words of whom
    const P = mkW('client'); P.net.roster.u_me = { id: 'u_me', name: 'Me' }; P.net.roster.u_rae = { id: 'u_rae', name: 'Rae' }; P.conn('host');
    P.api.knows(true);   // the review of multiplayer chat: this host's snapshot said it judges whispers (whispers: true)
    P.api.refresh(); const optsP = P.opts(), shownP = P.sel.style.display;
    P.sel.value = 'gm'; P.input.value = 'I pick the lock'; P.api.send();
    const toGm = [P.out.bcast.length, P.out.bcast[0] && P.out.bcast[0].to, P.out.bcast[0] && 'toName' in P.out.bcast[0], P.out.pushed[0] && P.out.pushed[0].toId, P.api.tag(P.out.pushed[0] || {})];
    const tags = [P.api.tag({ toId: 'u_me', toName: 'Me' }), P.api.tag({ toId: 'u_rae', toName: 'Rae' }), P.api.tag({}), G.api.tag({ toId: 'gm', toName: 'GM' })];
    check('1.6.3 findings 4 and 12 (the whisper slice, run for real): the GM\'s To list names each player once by profile id; a player who reloads under a new connection id is still the one picked and the whisper reaches their new connection alone, marked whisper to Trevor, and the Game Record keeps it from players; once they leave their row stays, marked not connected, the pick is kept and never falls back to Everyone, and a whisper to them is refused with a word, sent nowhere and left in the box; a player\'s list offers the GM and the other players, never themselves, and a whisper to the GM goes to the host naming only gm; the tag reads whisper to you on the one it went to',
        j(optsA) === j(['=Everyone', 'p:u_tre=Whisper: Trevor', 'p:u_mira=Whisper: Mira']) && j(reloadSend) === j(['peerNew', 0, 1, 'Trevor', 'whisper', 'whisper to Trevor', true])
        && j(optsGone) === j(['=Everyone', 'p:u_mira=Whisper: Mira', 'p:u_tre=Whisper: Trevor (not connected)']) && keptPick === 'p:u_tre'
        && refused[0] === 1 && refused[1] === 0 && refused[2] === 1 && refused[3] === 'Are you there?' && /Trevor is not connected, so the whisper was not sent/.test(refused[4])
        && j(optsP) === j(['=Everyone', 'gm=Whisper: GM', 'p:u_rae=Whisper: Rae']) && shownP === 'block' && j(toGm) === j([1, 'gm', false, 'gm', 'whisper to GM'])
        && j(tags) === j(['whisper to you', 'whisper to Rae', 'whisper', 'whisper to you']),
        j({ optsA, reloadSend, optsGone, keptPick, refused, optsP, shownP, toGm, tags }));
    // The review of multiplayer chat (1.6.3): an older host rebuilds every player's chat line as said to everyone, and a newer player is admitted
    // to it, so a player's app shows no To list and sends no whisper until the host's snapshot says whispers: true (read as true only)
    const Q = mkW('client'); Q.net.roster.u_me = { id: 'u_me', name: 'Me' }; Q.net.roster.u_rae = { id: 'u_rae', name: 'Rae' }; Q.conn('host');
    const knowQ = [];
    [undefined, 'yes', 1, {}].forEach(v => { Q.api.knows(v); Q.sel.style.display = 'block'; Q.api.refresh(); knowQ.push(Q.sel.style.display); });
    Q.sel.value = 'gm'; Q.input.value = 'Psst'; Q.api.send();
    const oldHost = [Q.out.bcast.length, Q.out.bcast[0] && Q.out.bcast[0].scope, Q.out.bcast[0] && 'to' in Q.out.bcast[0], Q.out.pushed[0] && Q.out.pushed[0].scope, Q.api.pick()];
    Q.api.knows(true); Q.api.refresh(); const knownQ = Q.sel.style.display;
    check('the review of multiplayer chat (the whisper slice, run for real): until the host\'s snapshot says whispers: true a player\'s app shows no To list, for a key that is missing, a word, a number or an object alike, and a line it sends goes to everyone with no whom in it, whatever the hidden list held; once the host says true the list shows. The host says it in its snapshot, and the snapshot branch reads it, as a fresh join forgets it',
        j(knowQ) === j(['none', 'none', 'none', 'none']) && j(oldHost) === j([1, 'global', false, 'global', null]) && knownQ === 'block'
        && /pausedSelf: !!\(net\.pausedPlayers && net\.pausedPlayers\[prof\.id\]\), whispers: true, (?:profileSet: true, )?travelLocked:/.test(src) && src.includes("if (typeof whispersKnow === 'function') { whispersKnow(msg.whispers); refreshChatRecipients(); }")
        && src.includes("if (!isRetry && !probe) { _joinSlow = false; if (typeof whispersKnow === 'function') whispersKnow(false); }"), j({ knowQ, oldHost, knownQ }));
    // The review of multiplayer chat (1.6.3): a player's roll made while a whisper is picked goes to the GM only and says so. A typed /r through
    // sendChat, run for real with a stand-in roller, and any roll a player's app sends through net.diceRoll (whisperRollPriv)
    const rolled = [], R = mkW('client', { DC: () => ({ parseCommand: t => /^\/(r|roll|gmroll) /.test(t) ? { cmd: t.split(' ')[0].slice(1) === 'r' ? 'roll' : t.split(' ')[0].slice(1), expr: t.split(' ')[1] } : null }), win: { wpDice: { roll: (e, o) => { rolled.push([e, !!o.hide]); return {}; } } } });
    R.net.roster.u_me = { id: 'u_me', name: 'Me' }; R.net.roster.u_rae = { id: 'u_rae', name: 'Rae' }; R.conn('host'); R.api.knows(true); R.api.refresh();
    R.sel.value = 'gm'; R.input.value = '/r 1d20'; R.api.send(); const t1 = R.out.toasts.slice();
    R.sel.value = 'p:u_rae'; R.input.value = '/roll 2d6'; R.api.send();
    R.input.value = '/gmroll 1d4'; R.api.send(); const t3 = R.out.toasts.length;
    R.sel.value = ''; R.input.value = '/r 1d8'; R.api.send(); const t4 = R.out.toasts.length;
    const reqA = { type: 'roll-req' }, reqB = { type: 'roll-req', priv: 'gm' }; R.sel.value = 'gm'; const pa = R.api.priv(reqA), pb = R.api.priv(reqB); R.sel.value = ''; const reqC = {}, pc = R.api.priv(reqC);
    check('the review of multiplayer chat (sendChat and whisperRollPriv, run for real): a player who picked a whisper and types /r or /roll rolls to the GM only and is told so once; /gmroll is the GM only as ever, with no second word; with Everyone picked the roll is the table\'s; a roll request a player\'s app sends is made the GM\'s alone while a whisper is picked, said, and one already private or with Everyone picked is left as it was; net.diceRoll\'s player branch asks it',
        j(rolled) === j([['1d20', true], ['2d6', true], ['1d4', true], ['1d8', false]]) && j(t1) === j([R.api.words]) && t3 === 2 && t4 === 2 && R.out.bcast.length === 0
        && pa === true && reqA.priv === 'gm' && pb === false && pc === false && !('priv' in reqC) && R.out.toasts.length === 3
        && src.includes("        if (o.priv || o.hide) req.priv = 'gm';   // 1.6.3: a player's own hide is their To the GM only\n        else if (typeof whisperRollPriv === 'function') whisperRollPriv(req);".replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n')), j({ rolled, t1, toasts: R.out.toasts, pa, pb, pc, reqA }));
    check('1.6.3 finding 4 (source): the host\'s To list is drawn again whenever the roster changes, and the GM\'s roll whispered to a player goes by profile id to every open connection of theirs, kept the GM\'s where they are not connected',
        /function broadcastRoster\(\) \{[^\n]*if \(typeof refreshChatRecipients === 'function'\) refreshChatRecipients\(\); \}/.test(src)
        && /var tgW = \/\^p:\/\.test\(toKey\) && typeof whisperTarget === 'function' \? whisperTarget\(toKey\) : null, cW = tgW && tgW\.pid && typeof whisperConns === 'function' \? whisperConns\(tgW\.pid\) : null;/.test(src)
        && /else \{ rec\.priv = 'gm'; toast\(tgW\.name \+ ' is not connected, so that roll was kept for you\.'\); \}/.test(src));
}

/* ================= what a client accepts from a host ================= */
check('client: every campaign/item lookup from a host message is an own-key lookup (campOf/validKey) in applyStage, applyItem, applyItemDelta, handlePos, itemGone, chars, system', (src.match(/campOf\(/g) || []).length >= 8 && /function applyItem\(msg\) \{\n\s*var camp = campOf\(msg\.campId\);\n\s*if \(!camp \|\| !validKey\(msg\.itemId\)\) return;/.test(require('./checkkit').part('netfog.js')) && /function applyItemDelta\(msg\) \{\n\s*var camp = campOf\(msg\.campId\); if \(!camp \|\| !validKey\(msg\.itemId\)\) return;/.test(require('./checkkit').part('netfog.js')));
check('client: a host map is cleaned on the snapshot, on a whole item and after a delta (text items rebuilt, colors checked, bounded)', (src.match(/cleanHostMap\(/g) || []).length >= 4 && /if \(incoming\.type === 'map'\) incoming = cleanHostMap\(incoming\)/.test(require('./checkkit').part('netfog.js')) && /if \(it\.type === 'map'\) cleanHostMap\(it\)/.test(require('./checkkit').part('netfog.js')));
check('client: a snapshot without a usable appState is refused before anything is set; prototype keys are purged', /if \(!msg \|\| !msg\.appState \|\| typeof msg\.appState !== 'object' \|\| !msg\.appState\.campaigns/.test(require('./checkkit').part('netfog.js')) && /\['__proto__', 'constructor', 'prototype'\]\.forEach/.test(require('./checkkit').part('netfog.js')));
check('client: the join snapshot\'s system is re-cleaned as the players\' view before its characters are (a host\'s system is never rendered raw)', /function applySnapshot\(msg\)[\s\S]{0,9000}?cs\.system = snapSys; else delete cs\.system;[\s\S]{0,400}?cleanChar\(/.test(require('./checkkit').part('netfog.js')) && /var snapSys = \(cs\.system && window\.wpFormula\) \? window\.wpSystemCore\.cleanSystem\(cs\.system, \{ F: window\.wpFormula, gmView: false, libCats: \{\}, needShown: true \}\) : null;/.test(require('./checkkit').part('netfog.js'))
    && /else \{ var csys = window\.wpSystemCore\.cleanSystem\(msg\.system, \{ F: window\.wpFormula, gmView: false, libCats: \{\}, needShown: true \}\); if \(csys\) campS\.system = csys; \}/.test(src)
    && /gmView: false, pages: [^\n]*, libCats: window\.wpLibrary && window\.wpLibrary\.catsFor \? window\.wpLibrary\.catsFor\(\) : null, needShown: window\.wpLibrary && window\.wpLibrary\.needShown \? window\.wpLibrary\.needShown : null, ruleShown: window\.wpLibrary && window\.wpLibrary\.needRuleShown \? window\.wpLibrary\.needRuleShown : null \}\); if \(psys\) camp\.system = psys; else delete camp\.system;/.test(require('./checkkit').part('netfog.js')));
check('wireConn: a message that throws never leaves applyingRemote on', /try \{ handleMessage\(d, conn\); \} catch \(e\)[^\n]*finally \{ net\.applyingRemote = false; \}/.test(src));
check('assets (client): prototype-free caches, own-key arrival check, size cap, old blob revoked, no outside URLs', /var assetCache = Object\.create\(null\)/.test(src) && /var assetPending = Object\.create\(null\)/.test(src) && /!own\(assetPending, msg\.path\)\) return;/.test(src) && /msg\.data\.byteLength > AUDIO_CAP/.test(src) && /var type = assetMime\(msg\.path\), was = assetCache\[msg\.path\], made;/.test(src) && /URL\.revokeObjectURL\(was\)/.test(src) && /return ASSET_PLACEHOLDER;\s*\/\/ an absolute URL from a host/.test(src));
check('chat (client): only the synced host, shape-checked, text capped', /if \(conn\.peer !== net\.syncedPeer \|\| typeof msg\.text !== 'string' \|\| !msg\.from/.test(src) && /text: msg\.text\.slice\(0, 2000\)/.test(src));
check('rich text: the sanitiser drops the dangerous tags with their content and never keeps an event handler or a script-scheme link', /RICH_DROP = \/\^\(script\|style\|iframe\|object\|embed/.test(src) && /safeRichHref/.test(src) && /RICH_STYLE/.test(src));

/* ================= the audits' small follow-ups ================= */
check('door-req: a player toggles a door only on the map they are ON, not one they left a token on', /if \(profDR\.location && profDR\.location !== amDR\.id\) \{ denyDR\('far'\); return; \}/.test(src));
{
    const ioSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
    check('export: a campaign file never carries the players\' table keys (stripTableKeys on the campaign and everything scopes)', /function stripTableKeys\(payload\)/.test(ioSrc) && /delete p\.key/.test(ioSrc) && /payload = stripTableKeys\(clone\(state\.appState\)\)/.test(ioSrc) && /payload = stripTableKeys\(\{ activeCampaignId: camp\.id, campaigns: cc \}\)/.test(ioSrc));
    const wbSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    check('blasts: every push goes through pushBlast, which drops the oldest past BLAST_CAP', /function pushBlast\(b\) \{ blasts\.push\(b\); if \(blasts\.length > BLAST_CAP\)/.test(require('./checkkit').part('wbblast.js')) && require('./checkkit').familyCount('whiteboard.js', /\bblasts\.push\(/) === 1);
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
    check('welcome: the profile boxes are filled from the stored profile even before net.js has loaded, and a welcome save never blanks a stored name', /function wcProfile\(\) \{\s*if \(window\.wpNet && window\.wpNet\.getProfile\) return window\.wpNet\.getProfile\(\);\s*try \{ var p = JSON\.parse\(localStorage\.getItem\('wp_profile'\)/.test(mainSrc) && /if \(name \|\| !\(wcProfile\(\)\.name \|\| ''\)\.trim\(\)\) patch\.name = name;/.test(mainSrc) && !/setProfile\(\{ name: \(nm && nm\.value \|\| ''\)\.trim\(\)/.test(mainSrc));
    check('Ctrl+K room jump: a joined player never switches to the data map', /if \(en\.roomId && it\.type === 'map' && !\(window\.wpNet && window\.wpNet\.foreign\)\)/.test(mainSrc));
}

/* ================= the roster reaches players again (1.5.0 regression from 9526489) + its sinks ================= */
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
        ha.camp.items = { map_1: { type: 'map', whiteboard: ['u_a', 'constructor', 'hasOwnProperty', 'u_b', 'u_c', 'u_d', 'u_e'].map(pid => ({ id: 't_' + pid, isChar: true, ownerId: pid })) } };   // every record's player owns a token: the ids alone decide
        const away = runAway(ha.env);
        ha.conn('pZ'); ha.env.net.roster.pZ = { id: 'u_z', name: 'Z' }; ha.env.awayMap = () => runAway(ha.env); ha.env.broadcast = (m, ex) => runBroadcast(ha.env, m, ex);
        runRoster(ha.env).broadcastRoster();
        check('away (host): only checked player ids to checked map ids, in a PLAIN object — a "constructor" or "hasOwnProperty" record can no longer stop the roster reaching players', j(away) === j({ u_a: 'map_1' }) && Object.getPrototypeOf(away) === Object.prototype && ha.sent.filter(s => s.m.type === 'roster').length === 1, j(away));
        // secrets (R2 #21): the GM's registry of every player who ever joined, and where each was last, is the GM's — the table gets only what a screen
        // can ask about (isPresent: the owner of a character token on some map of the campaign, or of its character), and never a banned player
        const hb = harness({ players: { u_a: { lastMap: 'map_1' }, u_ban: { lastMap: 'map_2' }, u_gone: { lastMap: 'map_3' }, u_kept: { lastMap: 'map_2' }, u_wait: { lastMap: 'map_1' } }, bannedPlayers: { u_ban: { name: 'B', bannedAt: 1 } } });
        hb.camp.chars = { c_k: { id: 'c_k', ownerId: 'u_kept', npc: false }, c_n: { id: 'c_n', ownerId: 'u_gone', npc: true } };
        hb.camp.items = { map_1: { type: 'map', whiteboard: [{ id: 't_a', isChar: true, ownerId: 'u_a' }, { id: 't_ban', isChar: true, ownerId: 'u_ban' }, { id: 't_w', waiting: 1, ownerId: 'u_wait' }, { id: 't_n', isChar: true, charId: 'c_n' }] },
            map_2: { type: 'map', whiteboard: [{ id: 't_k', isChar: true, charId: 'c_k' }] }, p1: { type: 'planner', whiteboard: [{ id: 't_p', isChar: true, ownerId: 'u_gone' }] } };
        const awayB = runAway(hb.env);
        check('secrets: the away map names only a player who owns a character token on a map of the campaign (by the token, or by the character a token names), never a banned player, one with no token left, one with only a waiting token or one named only off a map; the map ids are its lastMap as ever',
            j(awayB) === j({ u_a: 'map_1', u_kept: 'map_2' }) && Object.getPrototypeOf(awayB) === Object.prototype, j(awayB));
    }
}
pendingChecks.push((async () => {
    const h = harness({ players: { u_q: { name: 'Q', key: 'q'.repeat(32) }, u_r: { name: 'R', key: 'r'.repeat(32) } } });   // admitted on the proof of their table keys (a key is proven, never sent)
    const cq = h.conn('q1'), cr = h.conn('r1'); h.hello(cq, { id: 'u_q', name: 'Q' }); h.hello(cr, { id: 'u_r', name: 'R' }); await h.settle();
    const nq = h.lastSent('q1', 'auth').m.nonce, nr = h.lastSent('r1', 'auth').m.nonce, PR = (k, n) => hmacRef(k, 'wp-auth|' + n + '|waypoint-c1' + FPTAIL);
    h.hello(cq, { id: 'u_q', name: ' Q\u202e\u0007 ', avatar: 'data:image/png;base64,AAAA" onerror="alert(1)' }, { proof: PR('q'.repeat(32), nq) });
    h.hello(cr, { id: 'u_r', name: 'R', avatar: 'data:image/png;base64,iVBORw0KGgo=' }, { proof: PR('r'.repeat(32), nr) }); await h.settle();
    const pq = h.admitted.find(a => a.prof.id === 'u_q'), pr = h.admitted.find(a => a.prof.id === 'u_r');
    check('hello: a valid image prefix with a quote-breaking tail is dropped (the whole data URL must be base64); a real one is kept; the name loses bidi and control characters', pq && !('avatar' in pq.prof) && pq.prof.name === 'Q' && pr && pr.prof.avatar === 'data:image/png;base64,iVBORw0KGgo=', j(h.admitted.map(a => a.prof)));
    check('setProfile keeps only a whole base64 image data URL too', /if \(typeof patch\.avatar === 'string'\) \{ if \(safeAvatar\(patch\.avatar\)\) p\.avatar = patch\.avatar;/.test(src));
})());
{
    const rd = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
    const sbSrc = rd('sidebar.js'), wbSrc2 = rd('whiteboard.js'), inSrc = rd('inspector.js'), shSrc = rd('sheets.js');
    check('avatar sinks: no profile picture is pasted raw into markup anywhere (renderRoster and Maps presence escape it after the whole-URL check; the party strip and hover card use the same check)',
        !/\+ p\.avatar \+/.test(src) && /var avOk = safeAvatar\(p\.avatar\);/.test(src) && /src="' \+ escTextRoster\(p\.avatar\) \+ '"/.test(src)
        && /net\.safeAvatar\(p\.avatar\)/.test(sbSrc) && /src="' \+ esc\(p\.avatar\) \+ '"/.test(sbSrc) && !/src="' \+ p\.avatar/.test(sbSrc)
        && (wbSrc2.match(/window\.wpNet\.safeAvatar\(p\.avatar\)/g) || []).length === 1 && !/base64,\/\.test\(p\.avatar\)/.test(wbSrc2));   // one: the party strip (Onboarding F1c: the hover card no longer reads a profile picture at all)
    check('attribute sinks: roster ids and peer keys are escaped (the Properties owner picker, the whisper list, summon/kick, the Players panel)',
        /'<option value="'\+esc\(pid\)\+'"'/.test(inSrc) && /data-summon="' \+ escTextRoster\(peerKey\)/.test(src) && /data-kick="' \+ escTextRoster\(peerKey\)/.test(src) && /'<option value="' \+ escTextRoster\(o\.v\) \+ '">Whisper: ' \+ escText\(o\.name\)/.test(src) && /'<option value="' \+ escTextRoster\(cur\) \+ '">Whisper: ' \+ escText\(gone\.name\)/.test(src) /* 1.6.3 (finding 4): the whisper list keyed by profile id, and a player who left, moved on purpose */
        && !/data-(un)?ban="' \+ pid \+/.test(src) && !/data-forget="' \+ pid \+/.test(src));
    const stSrc = rd('settings.js'), mnSrc = rd('main.js'), chk = s => { const m = s.match(/return (typeof v === 'string' && v\.length <= 200000 && \/\^data:image[^\n]*?\.test\(v\));/); return m ? m[1] : null; };
    check('own-profile avatar: Settings\' preview and the welcome circle draw the stored picture as a node after the SAME whole-URL check as net.js (a restored prefs file never writes markup)',
        chk(src) && chk(src) === chk(stSrc) && chk(src) === chk(mnSrc) && /im\.src = safeAv\(p\.avatar\) \? p\.avatar : def;/.test(stSrc) && /avI\.src = wcSafeAvatar\(prof\.avatar\) \? prof\.avatar : wpDefaultAvatar\(prof\.color\);/.test(mnSrc)
        && !/innerHTML = '<img src="' \+ \(p\.avatar/.test(stSrc) && !/innerHTML = '<img src="' \+ \(prof\.avatar/.test(mnSrc) && !/innerHTML = '<img src="' \+ data \+/.test(mnSrc), [chk(src), chk(stSrc), chk(mnSrc)].join(' | '));
    check('snapshot: a player re-parents the decoded state, the campaign map and every campaign to a plain prototype (a packed "__proto__" re-parents a BinaryPack map), then drops the host\'s player records unread',
        /\[msg\.appState, msg\.appState\.campaigns\]\.forEach\(function\(o\) \{ if \(Object\.getPrototypeOf\(o\) !== Object\.prototype\) Object\.setPrototypeOf\(o, Object\.prototype\); \}\);/.test(require('./checkkit').part('netfog.js'))
        && /forEach\(function\(cS\) \{\s*if \(!cS \|\| typeof cS !== 'object'\) return;\s*if \(Object\.getPrototypeOf\(cS\) !== Object\.prototype\) Object\.setPrototypeOf\(cS, Object\.prototype\);[^\n]*\n\s*delete cS\.players;/.test(require('./checkkit').part('netfog.js')));
    { const o = {}; o['__proto__'] = { players: { u_x: {} } }; const before = o.players !== undefined; if (Object.getPrototypeOf(o) !== Object.prototype) Object.setPrototypeOf(o, Object.prototype); delete o.players;
      check('snapshot: (the technique) an object re-parented by an assigned "__proto__" key loses the inherited field once its prototype is reset', before && o.players === undefined); }
    check('Players panel: the join count is a number (a player record from a save or an import never writes markup); a roster location and an item lookup are escaped / own-keyed',
        /countOf\(p\.joinCount\) \+ ' join'/.test(src) && !/\(p\.joinCount \|\| 0\)/.test(src) && /function countOf\(v\) \{ var n = Math\.floor\(Number\(v\)\); return isFinite\(n\) && n > 0 \? n : 0; \}/.test(src)
        && /data-jump="' \+ escTextRoster\(p\.location\)/.test(src) && /own\(camp\.items, p\.location\) \? camp\.items\[p\.location\]/.test(src));
    check('snapshot: a player drops the host\'s player records unread (an honest host already strips them)', /delete cS\.players;/.test(require('./checkkit').part('netfog.js')));
    check('broadcast: a send the packer refuses is logged, never silent', /try \{ c\.send\(msg\); \} catch \(e\) \{ try \{ console\.warn\('wire send failed'/.test(require('./checkkit').part('netfog.js')));
    check('sheet: a player sees their own character\'s owner as their own name and anyone else\'s missing owner as "a player" — never a bare id; the GM\'s view is unchanged',
        /if \(away && c\.ownerId === myId\(\) && n\.getProfile\) \{ var pr = n\.getProfile\(\);/.test(shSrc) && /return pn\[c\.ownerId\] \|\| \(away \? 'a player' : c\.ownerId\);/.test(shSrc) && /function playerNames\(camp\) \{\s*var out = Object\.create\(null\);/.test(shSrc));
}

/* ================= no value can make a send fail silently ================= */
{
    const bare = src.match(/\.send\([^;]*\); \} catch \(e\) \{\}/g) || [];   // spans lines: a send whose catch sits lines below counts too
    check('every per-peer send that fails is logged (sendFailed), none swallowed by a bare catch (one-line or multi-line); a refused snapshot also tells the GM',
        bare.length === 0 && /catch \(e\) \{ sendFailed\(e, 'handout'\); return; \}/.test(src) && (src.match(/catch \(e\) \{ sendFailed\(e\); \}/g) || []).length >= 50 && /catch \(e\) \{ sendFailed\(e, 'snapshot'\); toast\('Could not send the campaign to '/.test(src) && /function sendFailed\(e, what\) \{ try \{ console\.warn\(/.test(require('./checkkit').part('netfog.js')),
        bare.map(s => s.replace(/\s+/g, ' ').slice(0, 80)).join(' | '));
    check('player gates bound every number they store (rotation, facing, stroke geometry): a finite 1e300 is an "integer" the packer refuses',
        /w\.rot = Math\.max\(-1e6, Math\.min\(1e6, wr\)\); w\.front = Math\.max\(-1e6, Math\.min\(1e6, wf\)\);/.test(require('./checkkit').part('netfog.js')) && /msg\.rot = Math\.max\(-1e6, Math\.min\(1e6, prot\)\); msg\.front = Math\.max\(-1e6, Math\.min\(1e6, pfr\)\);/.test(src)
        && /var num = function\(v, d\) \{ return \(typeof v === 'number' && isFinite\(v\)\) \? Math\.max\(-1e6, Math\.min\(1e6, v\)\) : d; \};/.test(require('./checkkit').part('netfog.js')) && /init: Math\.max\(-1e6, Math\.min\(1e6, Number\(r\.init\) \|\| 0\)\)/.test(src));
    const wireNum = new Function((require('./checkkit').part('netfog.js').match(/function wireNum\(k, v\) \{[^\n]*\}/) || ['function wireNum(k, v) { return NaN; }'])[0] + '\nreturn wireNum;')();
    const bounded = JSON.parse('{"a":1e20,"b":[1e300,-1e20,5,1.5],"t":1790000000000,"s":"1e300"}', wireNum);
    const threw2 = v => { try { packCheck(v); return false; } catch (e) { return true; } };
    check('wire clones: sanitizeItem and sanitizeAppState bound every number as they copy (a GM box, an import or a formula past 64 bits can never stop a map, a join or a snapshot)',
        /var m = JSON\.parse\(JSON\.stringify\(item\), wireNum\);/.test(src) && /var c = JSON\.parse\(JSON\.stringify\(one\), wireNum\);/.test(require('./checkkit').part('netfog.js')) && threw2({ a: 1e20 }) && !threw2(bounded)
        && bounded.a === 1e15 && bounded.b[0] === 1e15 && bounded.b[1] === -1e15 && bounded.b[2] === 5 && bounded.b[3] === 1.5 && bounded.t === 1790000000000 && bounded.s === '1e300', j(bounded));
    check('pos relay: the host rebuilds a player\'s move from its own fields before relaying it (extras a modified client adds never reach the table)', /msg = \{ type: 'pos', campId: msg\.campId, itemId: msg\.itemId, wbId: msg\.wbId, x: msg\.x, y: msg\.y, rot: msg\.rot, front: msg\.front, final: msg\.final === true \};[^\n]*\n\s*applyPosToDom\(msg\);\s*broadcastPos\(msg, conn, camp, map, w\);/.test(src));
    check('share: the size counted against a player\'s budget is real binary\'s (a decoded map claiming a negative byteLength is refused)', /if \(en\.data && !\(en\.data instanceof ArrayBuffer \|\| ArrayBuffer\.isView\(en\.data\)\)\) return;/.test(src));
    {
        const rd2 = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
        check('GM boxes: the Rotation box keeps one turn and the map scale a sane number (the wire refuses a whole number past 64 bits)', /var rn = \(parseInt\(v, 10\) \|\| 0\) % 360; if \(rn > 180\) rn -= 360; if \(rn <= -180\) rn \+= 360; w\.rot = rn;/.test(rd2('inspector.js')) && /if \(isFinite\(v\) && v > 0 && v <= 1e9\) m\.meta\.cellValue = v;/.test(rd2('whiteboard.js')));
    }
    check('Game Record: a line\'s kind reaches a class only as a kind of the record (reccore.js cleanLine), never as a file named it', /Object\.prototype\.hasOwnProperty\.call\(KIND, o\.k\) \? o\.k : /.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'reccore.js'), 'utf8')));
}

/* ================= the local server: request bodies are decoded as UTF-8 across chunk boundaries ================= */
{
    const rdS = rel => fs.readFileSync(path.join(__dirname, '..', ...rel.split('/')), 'utf8');
    const srvs = [['system/resources/app/main.js', 6], ['tools/dev-server.js', 5]].map(([rel, n]) => { const s = rdS(rel); return { rel, n, readers: (s.match(/reqguard\.readBody\(req, res, reqguard\.BODY\.(small|prefs|data), /g) || []).length, own: (s.match(/req\.on\('data'/g) || []).length, raw: (s.match(/body \+= (c|chunk)\.toString\(\)/g) || []).length }; });
    const rgS = rdS('system/resources/app/reqguard.js'), rbA = rgS.indexOf('function readBody('), rbB = rgS.indexOf('/* ---- the error log ---- */'), rbSrc = rbA >= 0 && rbB > rbA ? rgS.slice(rbA, rbB) : '';
    check('local server: every request body is read as UTF-8 text (setEncoding before the data handler) — a character split between two chunks can never be saved as \uFFFD (main.js and the dev server alike, each through the one bounded reader they share, reqguard.readBody, and no reader of its own)',
        srvs.every(x => x.readers === x.n && x.own === 0 && x.raw === 0) && rbSrc.indexOf("req.setEncoding('utf8');") > 0 && rbSrc.indexOf("req.setEncoding('utf8');") < rbSrc.indexOf("req.on('data'") && !/toString\(\)/.test(rbSrc), j(srvs));
    const { PassThrough } = require('stream'); const em = Buffer.from('a\u2014b \uD83D\uDC09', 'utf8');   // an em dash (3 bytes) and an emoji (4 bytes)
    const RGs = (() => { try { return require('../system/resources/app/reqguard.js'); } catch (e) { return null; } })();
    const splitRead = (cut) => new Promise(res => { const req = new PassThrough(); req.headers = {}; if (!RGs) return res('no reqguard.js'); RGs.readBody(req, { writeHead() {}, end() {} }, 1000, body => res(body)); req.write(em.slice(0, cut)); req.write(em.slice(cut)); req.end(); });   // the servers' own reader, run for real
    pendingChecks.push(Promise.all([2, 3, 7, 8, 9].map(splitRead)).then(outs => check('local server: a body split inside an em dash or an emoji decodes whole', outs.every(o => o === 'a\u2014b \uD83D\uDC09'), j(outs))));
}
// security R2 cluster J (2026-10-01), the host side: what the fuzz harness (tools/fuzzcheck.js) still found on the GM's machine — a yes to a dropped join,
// the Start-combat offers a player can queue, the table-wide password lockout, unadmitted connections held without bound, pictures read without a
// byte budget, a stranger's close costing a save, and saves that write nothing new. Each run on the real code (sliced) and pinned where it is wired
pendingChecks.push((async () => {
    const J = JSON.stringify, PROOF = (key, nonce, room) => hmacRef(key, 'wp-auth|' + nonce + '|' + room + FPTAIL);
    const slice = (a, b) => { try { return between(a, b, a); } catch (e) { return null; } };
    /* ---- J1: a yes the GM gives to a join whose connection dropped admits nobody later (processNextApproval, run for real; the gate) ---- */
    {
        const apSrc = slice('// [netcheck:approval-start]', '// [netcheck:approval-end]');
        const runAp = (dropsFirst) => {   // dropsFirst: the connection goes while the GM's question is up. The approval runs on the gate harness's own state (bannedIds, the queue, the campaign), and the next hello claiming the id on the same
            const h = harness(); h.env.net.active = true; const out = { admitted: h.admitted, toasts: h.toasts, asks: [], threw: '', h }; const conn = h.conn('pD'); h.hello(conn, { id: 'u_drop', name: 'Dee' });   // a stranger's hello: queued for the GM
            const env = Object.assign({}, h.env, { approvalOpen: false, showConfirm: (t, cb) => out.asks.push(cb) });
            const names = Object.keys(env);
            try { new Function(...names, apSrc + '\nprocessNextApproval();')(...names.map(n => env[n])); if (dropsFirst) conn.close(); out.asks.forEach(cb => cb(true)); } catch (e) { out.threw = String(e && e.message); }
            if (!dropsFirst) h.env.lastSeen.pD = Date.now();   // the admitted connection is live (its heartbeats heard)
            const cT = h.conn('pThief'); h.hello(cT, { id: 'u_drop', name: 'Thief' });   // the next hello claiming that id, from a new connection
            out.queuedAfter = h.env.pendingJoins.filter(q => q.prof.id === 'u_drop' && q.conn === cT).length; out.waitSent = !!h.lastSent('pThief', 'wait'); out.deniedAfter = !!h.lastSent('pThief', 'denied');
            return out;
        };
        const dropped = apSrc ? runAp(true) : null, live = apSrc ? runAp(false) : null;
        check('cluster J #1 (host, processNextApproval run for real): a yes to a join whose connection has dropped admits nobody and keeps no "go straight in" note — the GM is told they will be asked again; a yes to a live connection admits it as ever; the next hello claiming that id, from any connection, is a new request queued for the GM, never admitted on the name alone; no approved-ids list is left anywhere in net.js',
            !!apSrc && dropped.threw === '' && dropped.admitted.length === 0 && dropped.asks.length === 1 && dropped.toasts.length === 1 && /asked again/.test(dropped.toasts[0]) && dropped.queuedAfter === 1 && dropped.waitSent
            && live.threw === '' && live.admitted.length === 1 && live.admitted[0].prof.id === 'u_drop' && live.toasts.length === 0 && live.queuedAfter === 0 && live.deniedAfter && !/approvedIds/.test(src), J([dropped && [dropped.threw, dropped.admitted, dropped.toasts, dropped.queuedAfter, dropped.waitSent], live && [live.threw, live.admitted.length, live.toasts, live.queuedAfter, live.deniedAfter]]));
    }
    /* ---- J2: one open Start-combat offer per player at a time (the targetask slice, run for real) ---- */
    {
        const taSrc = slice('// [netcheck:targetask-start]', '// [netcheck:targetask-end]');
        const world = () => {
            const st = { asked: {}, open: Object.create(null), asks: [], opened: [], threw: '' };
            const camp = { id: 'k', turnRules: {}, items: { m1: { id: 'm1', type: 'map', meta: { title: 'Keep' }, whiteboard: [{ id: 'orc', isChar: true, charName: 'Orc' }, { id: 'wolf', isChar: true, charName: 'Wolf' }, { id: 'bat', isChar: true, charName: 'Bat' }] } } };
            st.fire = (id, peer) => { const net = { role: 'host', roster: { pA: { id: 'u_a', name: 'Ana' }, pB: { id: 'u_b', name: 'Bo' } }, combats: {} };
                try { new Function('msg', 'conn', 'net', 'allow', 'applyTarget', 'broadcastTargets', 'combatAsked', 'combatAskOpen', 'getActiveCampaign', 'showConfirm', 'mapTitleOf', 'window', 'own', ordersSrc + '\n' + taSrc)(
                    { type: 'target', id, mapId: 'm1' }, { peer: peer || 'pA' }, net, () => true, () => {}, () => {}, st.asked, st.open, () => camp, (t, cb) => st.asks.push({ t, cb }), () => 'Keep', { wpOpenCombat: (m, o) => st.opened.push(o) }, H.own); }
                catch (e) { st.threw = String(e && e.message); } };
            return st;
        };
        const W = taSrc ? world() : null;
        let during = null, bo = 0, after = 0, again = 0, openAfter = null;
        if (W) {
            W.fire('orc'); W.fire('wolf'); W.fire('bat'); during = [W.asks.length, Object.keys(W.asked), Object.keys(W.open)];   // Ana: one offer open, the other two ask nothing and mark nothing
            W.fire('wolf', 'pB'); bo = W.asks.length;   // Bo has no offer open: his own is raised
            W.asks[0].cb(false); openAfter = Object.keys(W.open);   // Ana's answered: hers is no longer open
            W.fire('bat'); after = W.asks.length;   // the bat's offer was still owed: asked now
            W.fire('bat'); W.fire('orc'); again = W.asks.length;   // asked already: nothing more
        }
        check('cluster J #2 (host, the target branch run for real): a player targeting three of the GM\'s characters in turn raises ONE Start-combat offer — while theirs is open a further target asks nothing and marks nothing (so that offer is still owed); another player\'s own offer is raised beside it; once theirs is answered their next target asks again, and a character asked about is not asked about twice',
            !!W && W.threw === '' && J(during) === J([1, ['m1|orc'], ['u_a']]) && bo === 2 && J(openAfter) === J(['u_b']) && after === 3 && again === 3 && J(Object.keys(W.asked).sort()) === J(['m1|bat', 'm1|orc', 'm1|wolf']) && /combatAskOpen = Object\.create\(null\);/.test(src), J([W && W.threw, during, bo, openAfter, after, again]));
    }
    /* ---- J3: the password lockout is the guessed name's own, never the table's (the gate, run for real) ---- */
    {
        const h = harness({ password: 'sesame' });
        for (let i = 0; i < 25; i++) { const c = h.conn('pw' + i); h.hello(c, { id: 'u_guess' + i, name: 'G' }, { password: 'nope' + i }); }
        const cR = h.conn('pwR'); h.hello(cR, { id: 'u_right', name: 'R' }, { password: 'sesame' });
        for (let i = 0; i < 5; i++) { const c = h.conn('pg' + i); h.hello(c, { id: 'u_guesser', name: 'G' }, { password: 'nope' }); }
        const cL = h.conn('pwL'); h.hello(cL, { id: 'u_guesser', name: 'G' }, { password: 'sesame' });
        const cO = h.conn('pwO'); h.hello(cO, { id: 'u_other', name: 'O' }, { password: 'sesame' });
        const c4 = harness({ password: 'sesame' }); for (let i = 0; i < 4; i++) { const c = c4.conn('pf' + i); c4.hello(c, { id: 'u_four', name: 'F' }, { password: 'nope' }); } const cF = c4.conn('pfR'); c4.hello(cF, { id: 'u_four', name: 'F' }, { password: 'sesame' });
        check('cluster J #3 (host): twenty-five wrong passwords from twenty-five strangers lock nobody out — the right word under another name joins the queue as normal; five wrong words under ONE name within a minute lock that name briefly, even for the right word, while another name with the right word still joins; four wrong then the right word joins',
            h.sent.filter(s => s.m.type === 'denied' && /Wrong session password/.test(s.m.reason)).length === 30 && !!h.lastSent('pwR', 'wait') && !h.lastSent('pwR', 'denied') && !!h.lastSent('pwL', 'denied') && /Too many/.test(h.lastSent('pwL', 'denied').m.reason) && !h.lastSent('pwL', 'wait')
            && !!h.lastSent('pwO', 'wait') && !h.lastSent('pwO', 'denied') && !!c4.lastSent('pfR', 'wait') && !c4.lastSent('pfR', 'denied') && !/_pwFails\.length|_pwFails\.shift|_pwFails\[0\]/.test(gateSrc), J([h.lastSent('pwR', 'denied'), h.lastSent('pwL', 'denied'), h.lastSent('pwO', 'denied'), c4.lastSent('pfR', 'denied')]));
        if (h.env._pwFails && h.env._pwFails.u_guesser) h.env._pwFails.u_guesser = h.env._pwFails.u_guesser.map(t => t - 61000);
        const cOk = h.conn('pwOK'); h.hello(cOk, { id: 'u_guesser', name: 'G' }, { password: 'sesame' });
        check('cluster J #3 (host): the lockout lapses after a minute — the right word under that name joins the queue again', !!h.lastSent('pwOK', 'wait') && h.env.pendingJoins.some(q => q.prof.id === 'u_guesser'), J([h.lastSent('pwOK', 'denied')]));
    }
    /* ---- J4: a cap on the connections held before admission (unadmittedRoom, run for real) ---- */
    {
        const ccSrc = slice('// [netcheck:conncap-start]', '// [netcheck:conncap-end]');
        const mk = (silent, spoke, admitted) => {
            const w = { closed: [], net: { conns: [], roster: Object.create(null) }, meta: Object.create(null), lastSeen: {}, threw: '' };
            const add = (peer, hellos, t) => { const c = { peer, open: true, close() { c.open = false; w.closed.push(peer); } }; w.net.conns.push(c); w.meta[peer] = { openedAt: t, hellos }; w.lastSeen[peer] = t; return c; };
            for (let i = 0; i < silent; i++) add('s' + i, 0, 1000 + i); for (let i = 0; i < spoke; i++) add('h' + i, 1, 5000 + i); for (let i = 0; i < admitted; i++) { add('a' + i, 1, 100 + i); w.net.roster['a' + i] = { id: 'u_a' + i }; }
            w.room = conn => { try { return new Function('net', 'own', '_connMeta', 'lastSeen', 'UNADMITTED_MAX', ccSrc + '\nreturn unadmittedRoom;')(w.net, H.own, w.meta, w.lastSeen, 32)(conn); } catch (e) { w.threw = String(e && e.message); return null; } };
            return w;
        };
        const newcomer = { peer: 'new', open: true, close() {} };
        const A = ccSrc ? mk(31, 0, 5) : null, rA = A && A.room(newcomer);
        const B = ccSrc ? mk(30, 2, 3) : null, rB = B && B.room(newcomer);
        const C = ccSrc ? mk(0, 32, 0) : null, rC = C && C.room(newcomer);
        const newcomer2 = { peer: 'new2', open: true, close() {} };
        const D = ccSrc ? mk(32, 0, 0) : null, rD = D && D.room(newcomer); if (D && rD) { D.net.conns.push(newcomer); D.meta.new = { openedAt: 9e9, hellos: 0 }; } const rD2 = D && D.room(newcomer2);   // the newcomer listed (as the handler lists it), the next one knocks
        check('cluster J #4 (host, unadmittedRoom run for real): with fewer than 32 connections waiting for admission a newcomer has room and nothing is closed (admitted connections never count); at 32, the oldest that never said hello (held open on heartbeats alone) is closed and taken out of the list and its records, and the newcomer has room; with 32 waiting that all said hello, the newcomer is refused; the handler closes a refused connection before it is listed or wired',
            !!ccSrc && rA === true && A.closed.length === 0 && A.threw === '' && rB === true && J(B.closed) === J(['s0']) && !B.net.conns.some(c => c.peer === 's0') && !('s0' in B.meta) && !('s0' in B.lastSeen) && B.net.conns.length === 34
            && rC === false && C.closed.length === 0 && rD === true && rD2 === true && J(D.closed) === J(['s0', 's1']) && D.net.conns.length === 31
            && /peer\.on\('connection', function\(conn\) \{\s*if \(!connShapeOk\(conn\) \|\| !wireGuard\(conn\) \|\| !unadmittedRoom\(conn\)\) \{ try \{ conn\.close\(\); \} catch \(e\) \{\} return; \}[^\n]*\n\s*net\.conns\.push\(conn\);/.test(src), J([rA, A && A.closed, rB, B && B.closed, rC, rD, rD2, D && D.closed, A && A.threw]));
    }
    /* ---- J5: a byte budget on the pictures and sounds read for one connection (the asset gate, run for real on a clock of its own) ---- */
    {
        const aqSrc = slice('// [netcheck:assetreq-start]', '// [netcheck:assetreq-end]');
        const tick = () => new Promise(r => setTimeout(r, 30));
        const mkW = () => {
            const w = { fetched: 0, reads: 0, cancels: 0, now: 1e9, files: {}, threw: '' };
            const fetch = reqPath => { w.fetched++; let dec; try { dec = decodeURIComponent(reqPath); } catch (e) { dec = reqPath; } const f = w.files[dec]; if (!f) return Promise.resolve({ ok: false });
                const body = f.body || new Uint8Array(4);
                return Promise.resolve({ ok: true, headers: { get: h => (h === 'content-length' && f.stated !== false) ? String(f.len !== undefined ? f.len : body.byteLength) : null }, body: { cancel: () => { w.cancels++; } }, arrayBuffer: () => { w.reads++; return Promise.resolve(body.buffer.slice(0)); } }); };
            try { w.api = new Function('net', 'location', 'sendFailed', 'allow', 'fetch', 'setTimeout', 'Date', aqSrc + '\nreturn { handleAssetRequest, assetNoteSends, spent: function(p) { return assetSpent(p); }, budget: ASSET_BUDGET };')({ active: true, role: 'host', conns: [], stream: false }, { origin: 'http://localhost:3999' }, e => { throw e; }, () => true, fetch, setTimeout, { now: () => w.now }); }
            catch (e) { w.threw = String(e && e.message); w.api = null; }
            w.conn = peer => { const c = { peer, open: true, sent: [], send: m => { packCheck(m); c.sent.push(m.type === 'asset' ? (m.error ? 'refused:' + m.error : 'asset') : m.type === 'asset-part' ? 'part' : m.type); } }; if (w.api) w.api.assetNoteSends(c); return c; };
            w.ask = async (c, p) => { if (!w.api) return ['no slice']; const n = c.sent.length; w.api.handleAssetRequest({ type: 'asset-req', path: p }, c); await tick(); return c.sent.slice(n); };
            return w;
        };
        const MB = 1024 * 1024, W = aqSrc ? mkW() : null; let r = {};
        if (W && W.api) {
            const pics = []; for (let i = 0; i < 160; i++) { const p = '/saves/images/m1/pic' + i + '.png'; W.files[p] = { len: MB, body: new Uint8Array(8) }; pics.push(p); }
            const NOLEN = '/saves/images/m1/nolen.png', SND = '/saves/images/audio/c1/song.mp3'; W.files[NOLEN] = { body: new Uint8Array(3000), stated: false }; W.files[SND] = { len: MB, body: new Uint8Array(300 * 1024) };
            const A = W.conn('pA'), B = W.conn('pB');
            const refs = { type: 'item', item: { whiteboard: pics.map((p, i) => ({ id: 't' + i, src: p })) } }; A.send(refs); B.send(refs); A.send({ type: 'item', item: { whiteboard: [{ id: 'n', src: NOLEN }] } }); A.send({ type: 'sounds', list: [{ id: 's', path: SND }] });
            const n0 = A.sent.length, reads0 = W.reads, fetched0 = W.fetched;
            for (let i = 0; i < 160; i++) W.api.handleAssetRequest({ type: 'asset-req', path: pics[i] }, A);
            await tick(); await tick();
            const got = A.sent.slice(n0), served = got.filter(x => x === 'asset').length, busy = got.filter(x => x === 'refused:busy').length;
            r.burst = [served, busy, W.reads - reads0, W.cancels, W.api.spent('pA') === 150 * MB, W.fetched - fetched0];
            r.again = await W.ask(A, pics[0]); r.sound = await W.ask(A, SND); r.fetchedSpent = W.fetched;   // spent: nothing more is looked up or fetched
            r.other = (await W.ask(B, pics[0]))[0];   // another connection: its own budget
            r.otherSpent = W.api.spent('pB') === MB;
            W.now += 61000; r.later = await W.ask(A, pics[1]); r.laterSpent = W.api.spent('pA');   // a minute on: the window has passed
            const WN = mkW(); WN.files[NOLEN] = W.files[NOLEN]; const C = WN.conn('pC'); C.send({ type: 'item', item: { whiteboard: [{ id: 'n', src: NOLEN }] } });
            r.noLen = await WN.ask(C, NOLEN); r.noLenSpent = WN.api.spent('pC');
            r.budget = W.api.budget === 150 * MB;
        }
        check('cluster J #5 (host, the asset gate run for real): the bytes read for one connection\'s pictures and sounds are budgeted at 150 MB a minute, judged on each file\'s stated length before a byte is read — of 160 pictures of 1 MB asked in one burst 150 are read and served and 10 are answered busy, their bodies canceled and never read; with the budget spent a picture or a sound is answered busy with nothing fetched; another connection has a budget of its own; a minute on, the window has passed and the file is served; a file with no stated length is charged by its bytes once read',
            !!W && W.threw === '' && J(r.burst) === J([150, 10, 150, 10, true, 160]) && J(r.again) === J(['refused:busy']) && J(r.sound) === J(['refused:busy']) && r.fetchedSpent === 160 && r.other === 'asset' && r.otherSpent === true && J(r.later) === J(['asset']) && r.laterSpent === MB
            && J(r.noLen) === J(['asset']) && r.noLenSpent === 3000 && r.budget === true, J([W && W.threw, r]));
        check('cluster J #5 (source): the budget is forgotten with the connection and at a new table, beside the asset record', /delete assetInflight\[conn\.peer\]; delete assetRefs\[conn\.peer\]; delete assetBytes\[conn\.peer\];/.test(src) && /assetInflight = \{\}; assetRefs = Object\.create\(null\); assetBytes = Object\.create\(null\);/.test(src));
    }
    /* ---- J6: an unadmitted connection's close saves nothing and tells the table nothing (the close handler's body, run for real) ---- */
    {
        const clSrc = slice('// [netcheck:connclose-start]', '// [netcheck:connclose-end]');
        const runClose = (admitted) => {
            const out = { saves: 0, rosters: 0, renders: 0, rosterDraws: 0, toasts: [], logs: [], threw: '', swept: 0, forgotConn: [], hung: [] };
            const conn = { peer: 'pX', open: false };
            const env = { net: { role: 'host', active: true, conns: [conn, { peer: 'pO', open: true }], roster: Object.create(null), targets: {}, applyingRemote: false, leaving: false, code: 'abc' }, assetInflight: { pX: '/x' }, assetRefs: { pX: {} }, assetBytes: { pX: { t: 1, n: 1 } }, diceLimit: { forget() {} }, charLimit: { forget() {} }, _lim: {}, _connMeta: { pX: { openedAt: 1, hellos: 0 } }, lastSeen: { pX: 1 },
                sensesForget() {}, fogDragSweep() { out.swept++; }, fogForgetConn(p) { out.forgotConn.push(p); }, videoHang(p) { out.hung.push(p); }, videoTold() {}, renderRoster() { out.rosterDraws++; }, toast(m) { out.toasts.push(String(m)); }, getActiveCampaign: () => ({ items: {} }), logEvent: (k, m) => out.logs.push(m), startWaitGrace() {}, render() { out.renders++; }, broadcastTargets() {},
                save() { out.saves++; }, broadcastRoster() { out.rosters++; }, cancelReconnect() {}, setPausedLocal() {}, stopHeartbeat() {}, setIndicator() {}, load() {}, reconn: {}, scheduleReconnect() {}, getProfile: () => ({ name: 'Me' }), window: {} };
            if (admitted) { env.net.roster.pX = { id: 'u_x', name: 'Xan', location: 'm1' }; env.net.roster.pO = { id: 'u_o', name: 'Odo' }; }
            const names = Object.keys(env);
            try { new Function('conn', ...names, clSrc)(conn, ...names.map(n => env[n])); } catch (e) { out.threw = String(e && e.message); }
            out.left = { conns: env.net.conns.map(c => c.peer), meta: Object.keys(env._connMeta), seen: Object.keys(env.lastSeen), refs: Object.keys(env.assetRefs), bytes: Object.keys(env.assetBytes), roster: Object.keys(env.net.roster) };
            return out;
        };
        const adm = clSrc ? runClose(true) : null, str = clSrc ? runClose(false) : null;
        check('1.6.3 finding 32 (the close handler, run for real): a player who leaves from a map that is gone, or has no title, is said to have left their character on their last map, never on undefined',
            !!clSrc && adm.toasts[0] === 'Xan left. Their character stays on their last map.', J(adm && adm.toasts));
        const gone = o => J(o.left) === J({ conns: ['pO'], meta: [], seen: [], refs: [], bytes: [], roster: o === adm ? ['pO'] : [] });
        check('cluster J #6 (host, the close handler run for real): an admitted player\'s connection closing saves the campaign once, sends the roster once, redraws and says who left; a connection never admitted (a stranger whose junk message the gate closed, a waiting peer that gave up) is taken out of the list and its records the same, but costs no disk save, no roster message to the table, no redraw and no word',
            !!clSrc && adm.threw === '' && str.threw === '' && adm.saves === 1 && adm.rosters === 1 && adm.renders === 1 && adm.toasts.length === 1 && /Xan left/.test(adm.toasts[0]) && adm.logs.length === 1 && gone(adm)
            && str.saves === 0 && str.rosters === 0 && str.renders === 0 && str.toasts.length === 0 && str.logs.length === 0 && gone(str) && str.swept === 1 && J(str.forgotConn) === J(['pX']) && J(str.hung) === J(['pX']) && str.rosterDraws === 1, J([adm, str]));
    }
    /* ---- J6b: a player's app the GM ends the session for (or removes, or refuses) puts the GM's table notepad away with the table (a found fault
       of 1.5.4: that way out runs no leaveSession, and the pad stayed up with the GM's words and no button to close it). The close handler, run
       for real as a player's app ---- */
    {
        const clSrc = slice('// [netcheck:connclose-start]', '// [netcheck:connclose-end]');
        const runEnd = active => {
            const out = { resets: 0, draws: [], loads: 0, threw: '' }, conn = { peer: 'room', open: false };
            const net = { role: 'client', active, conns: [conn], roster: Object.create(null), targets: {}, applyingRemote: false, leaving: true, code: 'c1c1', peer: active ? { destroy() {} } : null, notepad: { on: true, text: 'The GM\'s words', look: { sig: 1 }, gm: 'GM' },
                combats: { f_dock0001: { id: 'f_dock0001', mapId: 'm1', round: 2, turn: 0, rows: [{ id: 'r1', name: 'Kael' }] } } };   // fold 2: the copy of the GM's fights it holds
            const env = { net, assetInflight: {}, assetRefs: {}, assetBytes: {}, diceLimit: null, charLimit: null, _lim: {}, _connMeta: {}, lastSeen: {},
                sensesForget() {}, fogDragSweep() {}, fogForgetConn() {}, videoHang() {}, videoTold() {}, videoOver() {}, renderRoster() {}, toast() {}, getActiveCampaign: () => null, logEvent() {}, startWaitGrace() {}, render() {}, broadcastTargets() {}, save() {}, broadcastRoster() {},
                cancelReconnect() {}, setPausedLocal() {}, stopHeartbeat() {}, setIndicator() {}, load() { out.loads++; }, reconn: {}, scheduleReconnect() {}, getProfile: () => ({ name: 'Me' }), window: {}, hostGone: () => false,
                padReset() { out.resets++; }, renderNotepad() { out.draws.push([net.active, net.notepad.on, net.notepad.text]); }, setTimeout: f => f() };
            const names = Object.keys(env);
            try { new Function('conn', ...names, clSrc)(conn, ...names.map(n => env[n])); } catch (e) { out.threw = String(e && e.message); }
            out.pad = net.notepad; out.combats = Object.keys(net.combats); return out;
        };
        const ended = clSrc ? runEnd(true) : null, own = clSrc ? runEnd(false) : null;
        check('fold 0\'s live check (fold 2, backlog 152): when the GM ends the table a player\'s app lets its copy of the GM\'s fights go with the table, so neither its turn strip, its pill nor its clock reads the GM\'s fights on its own campaign afterwards (the close handler run for real: that way out runs no leaveSession); a Leave of the player\'s own, which has put everything away already, touches nothing here',
            !!ended && ended.threw === '' && J(ended.combats) === '[]' && J(own.combats) === J(['f_dock0001']), J([ended && ended.combats, own && own.combats]));
        check('J6b (a player\'s app, the close handler run for real): the GM ends the session, removes the player or refuses them, and the table\'s connection closes: the GM\'s table notepad goes with the table, its words and what styled them, and is drawn again so that it is put away, after the app has left the table; a Leave of the player\'s own, which has put everything away already, does nothing more here',
            !!ended && ended.threw === '' && J(ended.pad) === J({ on: false, text: '' }) && ended.resets === 1 && J(ended.draws) === J([[false, false, '']]) && ended.loads === 1
            && own.threw === '' && own.resets === 0 && own.draws.length === 0 && own.pad.on === true && own.loads === 0, J([ended, own]));
    }
    /* ---- J2b: the Start-combat offer answered after its player left: the question may stay up while the player who targeted leaves the table or is
       removed (a found fault of 1.5.4), and a Yes then opens nothing for someone who is gone, and says so (the targetask slice, run for real) ---- */
    {
        const taSrc = slice('// [netcheck:targetask-start]', '// [netcheck:targetask-end]');
        const offer = (meanwhile, yes) => {
            const out = { asks: [], opened: [], toasts: [], threw: '' }, open = Object.create(null);
            const camp = { id: 'k', turnRules: {}, items: { m1: { id: 'm1', type: 'map', meta: { title: 'Keep' }, whiteboard: [{ id: 'orc', isChar: true, charName: 'Orc' }] } } };
            const net = { role: 'host', roster: Object.create(null), combats: {} }; net.roster.pA = { id: 'u_a', name: 'Ana' }; net.roster.pB = { id: 'u_b', name: 'Bo' };
            try {
                new Function('msg', 'conn', 'net', 'allow', 'applyTarget', 'broadcastTargets', 'combatAsked', 'combatAskOpen', 'getActiveCampaign', 'showConfirm', 'mapTitleOf', 'window', 'own', 'toast', ordersSrc + '\n' + taSrc)(
                    { type: 'target', id: 'orc', mapId: 'm1' }, { peer: 'pA' }, net, () => true, () => {}, () => {}, {}, open, () => camp, (t, cb) => out.asks.push(cb), () => 'Keep', { wpOpenCombat: (m, o) => out.opened.push([m, o]) }, H.own, m => out.toasts.push(String(m)));
                meanwhile(net); out.asks[0](yes);
            } catch (e) { out.threw = String(e && e.message); }
            out.open = Object.keys(open); return out;
        };
        const stays = taSrc ? offer(() => {}, true) : null, gone = taSrc ? offer(n => { delete n.roster.pA; }, true) : null, back = taSrc ? offer(n => { delete n.roster.pA; n.roster.pA2 = { id: 'u_a', name: 'Ana' }; }, true) : null;
        const goneNo = taSrc ? offer(n => { delete n.roster.pA; }, false) : null, otherGone = taSrc ? offer(n => { delete n.roster.pB; }, true) : null;
        const OPEN = J([['m1', { pre: ['orc'], owner: 'u_a' }]]);
        check('J2b (host, the target branch run for real): the Start-combat offer answered Yes while its player is still at the table opens the roster as before; answered Yes after that player left the table or was removed, it opens nothing and says why in plain words; a player back on a new connection counts as at the table; No says nothing; another player leaving changes nothing; either way the offer is no longer open',
            !!stays && [stays, gone, back, goneNo, otherGone].every(r => r.threw === '' && r.asks.length === 1 && r.open.length === 0) && J(stays.opened) === OPEN && stays.toasts.length === 0
            && gone.opened.length === 0 && J(gone.toasts) === J(['Ana has left the table, so no combat was started.']) && J(back.opened) === OPEN && back.toasts.length === 0
            && goneNo.opened.length === 0 && goneNo.toasts.length === 0 && J(otherGone.opened) === OPEN, J([stays, gone, back, goneNo, otherGone]));
    }
    /* ---- J8: a pos final that moves nothing writes nothing (the pos gate, run for real) ---- */
    {
        const posSrc = slice('// [netcheck:pos-start]', '// [netcheck:pos-end]');
        const mk = () => {
            const log = { saves: 0, relayed: 0 };
            const camp = { id: 'c', items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't', isChar: true, ownerId: 'u_a', x: 0, y: 0, rot: 0, front: 0 }] } } };
            const env = { net: { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' } }, tokenDropped() {}, turnMove: {} }, campOf: () => camp, validKey: k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(camp.items, k), peerPaused: () => false, allow: () => true, checkRoomHandouts() {}, applyPosToDom() {}, broadcastPos() { log.relayed++; }, toast() {}, saveRemoteSoon() { log.saves++; }, window: {}, setTimeout: f => f() };
            const names = Object.keys(env);
            const fn = posSrc ? new Function(...names, posSrc + '\nreturn handlePos;')(...names.map(n => env[n])) : null;   // built once: the drag record lives between calls, as it does on the host
            const pos = (x, y, final, more) => { fn(Object.assign({ type: 'pos', campId: 'c', itemId: 'm1', wbId: 't', x, y, rot: 0, front: 0, final }, more || {}), { peer: 'pA' }); return log.saves; };
            return { pos, log, tok: () => camp.items.m1.whiteboard[0] };
        };
        let r = null;
        if (posSrc) {
            const A = mk(); const a1 = A.pos(50, 60, true), a2 = A.pos(50, 60, true), a3 = A.pos(50, 60, true, { rot: 90 }), a4 = A.pos(50, 60, true, { rot: 90 }), a5 = A.pos(50, 60, true, { rot: 90, front: 45 });
            const B = mk(); B.pos(20, 20, false); B.pos(40, 40, false); const b1 = B.log.saves, b2 = B.pos(40, 40, true);   // a drag: its moves unsaved, its final at the last move's place saves
            const C = mk(); C.pos(20, 20, false); const c1 = C.pos(0, 0, true);   // a drag back to where it began: the moves it made were never saved, the final is
            const D = mk(); const d1 = D.pos(0, 0, true, { rot: 0, front: 0 });   // a lone final that moves nothing at all
            const E = mk(); E.pos(0, 0, false); E.pos(0, 0, false); const e1 = E.pos(0, 0, true);   // a drag whose every move left the token where it stood: nothing to save at its end
            r = { a: [a1, a2, a3, a4, a5], b: [b1, b2], c: c1, d: d1, e: e1, relayedA: A.log.relayed, tokA: [A.tok().x, A.tok().rot, A.tok().front] };
        }
        check('cluster J #8 (host, the pos gate run for real): a final that lands the token where it already stood — the same place, turn and facing — is relayed as ever but saves nothing; a change of place, of turn or of facing saves; a drag\'s final saves once (its moves were never saved) even back where the drag began, and a drag whose moves never moved the token ends with nothing saved',
            !!r && J(r.a) === J([1, 1, 2, 2, 3]) && J(r.b) === J([0, 1]) && r.c === 1 && r.d === 0 && r.e === 0 && r.relayedA === 5 && J(r.tokA) === J([50, 90, 45]), J(r));
    }
})());
// security S (2026-10-01): the GM's signing key, trust on first use — a player's app takes a table only from the GM it knows. The host's hello gate
// with its signing slice, and the player's snapshot gate, run for real on both sides (each machine its own storage, real WebCrypto); Node's own
// crypto is the reference for every signature the app makes (verified here) and for the hostile hosts' signatures the app is given (made here)
pendingChecks.push((async () => {
    const J = JSON.stringify, nodeCrypto = require('crypto');
    const T = {
        a: 'security S (a, both sides\' real code): a first join — the GM allows a stranger whose hello carried a fresh nonce, and the snapshot they are given carries the GM\'s public key (four fields) and a signature Node\'s own crypto verifies over that nonce, the host\'s room id, the GM id and the table key handed over; nothing but "wait" and the host\'s early proof went out before admission. The player\'s app holds what follows the snapshot while the signature is checked, then takes the snapshot and reads the rest in order: the key pinned for that GM id, the table key stored, the room code remembered as that GM\'s, no question asked',
        b: 'security S (b): on an automatic reconnect, a snapshot from the holder of another generation of the room code — its own key pair, naming the GM\'s id — is refused: nothing synced, nothing applied or read after it, the stored table key and the pin untouched, the connection closed from the player\'s side, no question raised, the words the app\'s own (said once however many such hosts answer, nothing of the host\'s text), and the reconnect put back where it stood so the next attempt dials the generation after it; a generation refused is not dialed again by that reconnect while another is left (genNotRefused)',
        c: 'security S (c): the real GM\'s snapshot on a reconnect — signed over the new connection\'s nonce and the room id, the table key the one the player proved — is taken with no question and no notice, the reconnect\'s count left as the open handler set it',
        d: 'security S (d): against a pinned GM a snapshot replayed from another connection of the same player (another nonce), one signed for another room id than the one this app dialed, and one whose table key was changed all fail — not taken, the stored key and pin untouched, the next generation tried, and no question (there is nothing to say yes to); the same host\'s snapshot made for this connection is taken',
        e: 'security S (e): a snapshot with no key at all (a host from before the signing key) is taken at once, as before, only when nothing is known against it — no pin for its GM id and the room code not another GM\'s; nothing is pinned from it. Under a pinned GM id it is refused — and taken, the pin forgotten, only after the player\'s yes to that table as it stands; refused too is a rightly signed one on a player\'s app with no WebCrypto (it cannot check). A key shown with a signature that does not verify pins nothing',
        f: 'security S (f): the private key never travels — no send of either host holds its private field or a "d" — and stays on the GM\'s machine (wp_gmSign); a snapshot\'s gmPub is rebuilt by whitelist (a hostile host\'s extra fields are not kept; another curve, another key type or a malformed coordinate is no key); the pins and the room codes kept are the 50 newest each, here and in the launch merge (index.html)',
        g: 'security S (g): the GM\'s pair is made once and kept (a second hosting signs with the same key); net.gmSignReset forgets it, so the next hosting makes a new pair; Settings ▸ Reset Multiplayer Identity (its confirm run for real) changes the identity and forgets the key on Yes alone — Cancel keeps both; Reset Preferences and the launch merge keep wp_gmSign, wp_gmPins and wp_gmRooms',
        h: 'security S (h): a room code this app has joined belongs to the GM id it synced with there — a snapshot naming another GM id at that code is refused however well signed; at the end of a join the player began they are asked ONCE (the app\'s own words, never on Enter), and nothing when the answer is no; a yes joins again and holds for that code, that GM id and that very key alone — the table is then taken, its key pinned, the code now its GM\'s — while another key under the same name, and that key shown without a signature of its own, are refused again',
        i: 'security S (i): while a snapshot\'s signature is checked at most 256 messages wait behind it; a snapshot from a connection other than the one this app dialed is not judged at all; an automatic reconnect never pins a key (an unpinned GM that shows one is taken as before, nothing remembered against the real GM)',
        j: 'security S (j, host): a hello with no nonce (an older app) or a malformed one gets the snapshot as before — unsigned, a new table key; the first nonce a connection sent is the one signed (a later hello cannot change it); a host with no WebCrypto hosts unsigned and says so once',
        l: 'security S (l): the signed text is made in one place (snapData) and what ties it to the connection in one more (snapBind, read by each side from its own end: the connection\'s two certificate fingerprints, the player\'s then the host\'s, null when either cannot be read): whatever it gives is signed by the host and read back by the player\'s app alike — a snapshot signed over one tie is taken and pinned by a player whose connection reads the same and refused, with no question, by one whose connection reads another; a connection whose tie cannot be read is signed nothing by the host, and under a pinned GM a player\'s app that cannot read its own takes nothing',
        m: 'security S (m): an automatic reconnect is held to the GM this session took its table from, in memory — on a player\'s app whose storage refuses every write (no pin, no room code kept) a first join is taken as ever, and on the reconnect a snapshot naming another GM id, one under the GM\'s id from another key and one under it with no key are each refused (said once, no question), the GM\'s own taken; a join the player begins is judged by what is stored alone',
        n: 'security S (n, the host\'s early proof): a hello that has passed the bans, the version and the password and carries a nonce is answered with ONE gmhello per connection — the GM id, the key\'s four public fields and a signature Node\'s own crypto verifies over wp-host, that nonce, the host\'s room id, the GM id and the connection\'s tie, and over no other nonce, room or tie — sent after the gate\'s own word (the wait, or the challenge with its 2.5 s timer as it was) and before any snapshot; a later hello with another nonce gets no second one (the first valid nonce is the one signed); none to a removed or banned id, an older version, a wrong password, the GM\'s own id, a hello with no nonce or a malformed one, from a host with no WebCrypto, on a connection whose tie cannot be read or one that closed meanwhile; the private half never in a send; a signature of one kind never stands for another (the early proof\'s does not verify as a snapshot\'s text, nor a snapshot\'s as the early proof\'s)',
        o: 'security S (o, the player\'s side): the GM\'s early proof is taken from the host this app dialed, before the snapshot, once — verified under the pinned key over this connection\'s nonce, the room dialed, the GM id and the tie, it marks the host as proven and stops the clock, and it pins nothing, stores nothing, says nothing and asks nothing; one on another connection, a second one (no signature is even checked for it) and one after the snapshot are not read; where nothing is known (a first join) no clock runs and a proof changes nothing — the key it shows is not pinned',
        p: 'security S (p, an automatic reconnect under the GM this session was with): a host that has not proven itself 5 s after the hello (HOST_PROOF_MS) — silent, or saying wait — is passed over: the connection closed from this side, the count put back, no question, said once in words of its own (never the "not the one you know" notice) — and that generation is NOT marked as refused: the GM\'s own app may only have been slow, so the round comes back to it and its proof, prompt the next time, is taken with its table; one that proves itself as someone else — its own key under the GM\'s id, another GM id, the GM\'s own proof made for another connection or shown at another room, a snapshot\'s signature shown as a proof, no key at all, a malformed word, a connection that reads another tie — is passed over at once, marked (not dialed again by that reconnect) and said once in the existing words; the GM\'s own proof is taken and its wait waited on, the clock stopped; a snapshot carrying the early proof\'s signature is refused; a session whose table had no key holds its host to nothing; once the GM\'s table is taken that reconnect is over — the generations it passed over are forgotten, so a later reconnect dials them again; the five seconds begin once the hello has left this machine (the channel\'s own queue and the connection library\'s both empty, looked at every 250 ms, 60 looks at most), at once where neither can be read',
        q: 'security S (q, a join the player began): at a room code this app knows the GM of, a host that says wait and proves nothing is not waited on past 15 s (1.6.0: an app just reloaded on a large campaign may be busy; an automatic reconnect stays at 5 s) — the next generation is tried and the join ends in ONE question, in words of its own that say the table may only be slow (never on Enter); a yes joins again and waits on that table with no clock (the wait is the player\'s own choice now), and is a yes to nothing else — an unsigned table naming the pinned GM is still refused, the pin and the table key untouched, while the GM\'s own proof and signed table are taken with no second question; for the question a host that proved itself as someone else and can be said yes to outranks one that was only late, never the other way about, and one with nothing to say yes to does not; one that proves itself with a key of its own under the GM\'s id is refused at once, the question offering that very key — after a yes its proof is taken (nothing pinned by it) and a third key\'s is refused again; at a code this app does not know no clock runs, yet a host naming a pinned GM without that GM\'s signature is not waited on',
        r: 'security S (r, a refusal with no proof): on an automatic reconnect under a GM this app holds the host to, a refusal or an end from a host that has not proven itself is not believed (hostDoubted) — the connection is closed from this side, nothing said, nothing asked, the count put back, the generation not marked refused (the GM\'s own app refuses before its proof too: the round comes back to it), the session not ended; from a host that has proven itself, on a join the player began, on a connection other than the one dialed, with a teardown already under way or where nothing is held, the word is taken as before',
        s: 'security S (s, wired): the gate begins the early proof once per connection beside the snapshot\'s signatures and the proof path waits for both; gmHail signs hostData and sends only type, gmId, gmPub and sig; the player\'s gmhello branch goes through hostHail; the denied / kicked and end branches ask hostDoubted first; the join arms the wait as its hello goes out; a snapshot stops the clock and is judged through the same two functions (hostKnown, hostRuling) as the early proof — the signature is verified in one place; Help says it on both panes',
        t: 'security S (t, only a table taken ends a reconnect — the close handler run for real on a player\'s app): a reconnect\'s connection that opened and then closes before its host proved itself or its table was taken puts the count and the generation back where they stood before it opened, so the attempts count on (and run out) and the next dials the generation after it; one whose host had proven itself starts over at that generation, as before; a join the player began, under a GM this app holds the host to, whose connection closes before any proof is passed over as a host that did not prove itself in time (hostGone: the next generation, the question of its own at the end, no reconnect started) — with nothing held, the host proven, a reconnect, a table already synced or the join already torn down, hostGone does nothing and the close is a dropped connection as before; the close of a connection a later dial has replaced puts nothing back and passes nothing over',
        u: 'security S (u, wired): the close handler puts a reconnect back before it schedules the next attempt and asks hostGone for a join the player began — only for the connection this app holds (cur, read before the list is filtered); hostLate goes through hostSlow and never through snapRefuse; "Reconnected" is said by the snapshot branch — on a reconnect, once per connection, when the table is taken, in place of the synced notice (the branch\'s one toast) — and no longer by the open handler; the join\'s end says a late table in words of its own; admitPlayer tells the table what every stub now says (net.syncMapStubs) before the newcomer is on the roster; Help (the player\'s pane) says the late table\'s question',
        k: 'security S (k, wired): handleMessage holds a player\'s messages behind a snapshot being checked and judges a snapshot before its branch applies anything; the join sends a fresh nonce in both hellos, marks an automatic reconnect, keeps where the reconnect stood and tries the next generation after a refusal; hosting loads the key; admitPlayer hands over the key the signature was made for and signs the snapshot; the proof path waits for the signatures; Help says it on both panes'
    };
    const done = new Set(), chk = (k, ok, detail) => { done.add(k); check(T[k], ok, detail); };
    try {
        const tb = n => tryBetween('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]');
        const gmSrc = tb('gmsign'), stSrc = tb('snaptrust'), skSrc = tb('snapkey');
        if (!gmSrc || !stSrc || !skSrc) throw new Error('the gmsign / snaptrust / snapkey slices are not marked in net.js');
        const mkStore = () => { const m = {}; return { m, getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
        const cloneStore = s => { const n = mkStore(); Object.assign(n.m, s.m); return n; };
        const HN = ['own', 'validProfileId', 'newKey', 'sameStr', 'tableKeyFor', 'rememberTableKey', 'cleanGmPub', 'samePub', 'validCn', 'snapData', 'snapBind', 'gmSignHex', 'gmVerify', 'gmKeyLoad', 'gmSignForget', 'gmPinFor', 'rememberGmPin', 'forgetGmPin', 'roomCodeOf', 'gmRoomFor', 'rememberGmRoom', 'hostData'];
        const helpers = (store, cr) => new Function('localStorage', 'crypto', helpersSrc + '\nreturn { ' + HN.map(n => n + ': typeof ' + n + ' === "function" ? ' + n + ' : null').join(', ') + ' };')(store, cr || globalThis.crypto);
        const nodeOk = (pub, sig, data) => { try { return nodeCrypto.verify('sha256', Buffer.from(data), { key: nodeCrypto.createPublicKey({ key: pub, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'hex')); } catch (e) { return false; } };
        const mkSigner = () => { const kp = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), jwk = kp.publicKey.export({ format: 'jwk' }); return { pub: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, sign: data => nodeCrypto.sign('sha256', Buffer.from(data), { key: kp.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex') }; };   // a host the suite builds itself: its signatures owe nothing to the app's code
        const dataOf = (cn, room, gm, key, bind) => 'wp-snap|' + cn + '|' + room + '|' + gm + '|' + key + (bind === undefined ? FPTAIL : bind);   // the suite's own reading of the signed text (bind: what ties it to the connection — the stub connections' two fingerprints, the player's then the host's)

        /* ---- the GM's machine: the real hello gate, the real signing slice; admission as admitPlayer does it (its two lines are pinned in k) ---- */
        const mkHost = async o => {
            o = o || {}; const store = o.store || mkStore(), HH = helpers(store), h = harness({ players: o.players || {}, roomPeer: o.roomPeer || 'waypoint-c1c1' });
            h.env.getProfile = () => ({ id: 'u_gm', name: 'GM' });
            const names = ['net', '_connMeta', 'newKey', 'getProfile', 'toast', 'gmKeyLoad', 'gmSignForget', 'gmSignHex', 'snapData', 'snapBind', 'hostData', 'sendFailed'];
            const e2 = { net: h.env.net, _connMeta: h.env._connMeta, newKey: HH.newKey, getProfile: h.env.getProfile, toast: m => h.toasts.push(String(m)), gmKeyLoad: o.noCrypto ? helpers(store, {}).gmKeyLoad : HH.gmKeyLoad, gmSignForget: HH.gmSignForget, gmSignHex: HH.gmSignHex, snapData: HH.snapData, snapBind: o.bind || HH.snapBind, hostData: HH.hostData, sendFailed: () => {} };   // (o.bind: a stand-in for the connection's tie, to run the seam)
            const G = new Function(...names, gmSrc + '\nreturn { gmSignArm, gmPresign, gmFreshKey, gmSignSnap, gmHail: typeof gmHail === "function" ? gmHail : null, key: function() { return _gmSign; } };')(...names.map(n => e2[n]));
            await G.gmSignArm();
            h.env.validCn = HH.validCn; h.env.gmPresign = (cm, cn, held, conn) => { const p = G.gmPresign(cm, cn, held, conn); if (p) h.pending.push(p); return p; };
            h.env.gmHail = (cm, cn, conn) => { const p = G.gmHail ? G.gmHail(cm, cn, conn) : null; if (p) h.pending.push(p); return p; };   // the early proof, its promise kept so a check can wait for it
            h.env.admitPlayer = (conn, prof, provenKey) => {
                const rec = h.camp.players[prof.id] = Object.assign({}, h.camp.players[prof.id], { name: prof.name });
                rec.key = (provenKey && rec.key === provenKey) ? rec.key : G.gmFreshKey(conn);
                h.env.net.roster[conn.peer] = prof; h.admitted.push({ peer: conn.peer, prof, key: rec.key });
                conn.send(G.gmSignSnap({ type: 'snapshot', gmId: 'u_gm', key: rec.key, appState: { campaigns: {} } }, conn));
            };
            return { h, G, store, HH };
        };
        const join = async (X, peer, prof, cn, key, cn2) => {   // a player's join as their app runs it: a hello (with the nonce), the challenge answered with the proof when a key is held, else the GM's yes
            const c = X.h.conn(peer), extra = cn === undefined ? {} : { cn };
            X.h.hello(c, prof, extra); await X.h.settle();
            const a = X.h.lastSent(peer, 'auth');
            if (a && key) { X.h.hello(c, prof, Object.assign({ proof: hmacRef(key, 'wp-auth|' + a.m.nonce + '|' + X.h.env.net.roomPeer + FPTAIL) }, cn2 === undefined ? extra : { cn: cn2 })); await X.h.settle(); }
            else if (a) X.h.fireTimers();
            const before = X.h.sent.filter(s => s.peer === peer).map(s => s.m.type), q = X.h.env.pendingJoins.find(x => x.conn === c);
            if (q) X.h.env.admitPlayer(c, q.prof);
            const s = X.h.lastSent(peer, 'snapshot');
            return { c, snap: s ? s.m : null, before, viaGm: !!q };
        };

        /* ---- a player's machine: the real snapshot gate; handleMessage's head and its snapshot branch as net.js has them (pinned in k), the snapkey slice run for real ---- */
        const runSnapKey = new Function('net', 'msg', 'conn', 'rememberTableKey', skSrc);
        const mkClient = o => {
            o = o || {}; const store = o.store || mkStore(), HC = helpers(store, o.noCrypto ? {} : null);
            const c = { status: [], toasts: [], confirms: [], log: [], next: 0, hb: 0, joins: [], warn: [], timers: [], verifies: 0 };
            const net = { role: 'client', conns: [], code: o.code || 'C1C1', active: true, gmId: '', syncedPeer: null }, reconn = { tries: 0, gen: 0, pending: false };
            const env = Object.assign({}, HC, { net, reconn, toast: t => c.toasts.push(String(t)), setStatus: s => c.status.push(String(s)), stopHeartbeat: () => { c.hb++; }, showConfirm: (t, cb, opts) => c.confirms.push({ t: String(t), cb, opts }), joinSession: (code, name) => c.joins.push([code, name]), console: { warn: (...a) => c.warn.push(a.map(String).join(' ')) },
                gmVerify: (p, s, d) => { c.verifies++; return HC.gmVerify(p, s, d); },   // counted: a word that is not read costs no signature check
                setTimeout: (fn, ms) => { c.timers.push({ fn, ms, on: true }); return c.timers.length; }, clearTimeout: id => { if (c.timers[id - 1]) c.timers[id - 1].on = false; } }, o.bind ? { snapBind: o.bind } : {});   // (the clock of the wait for the host's early proof is the suite's own)
            let S = null;
            const deliver = (m, conn) => {
                if (S.snapHeld(m, conn)) return 'held';
                if (m.type === 'gmhello') { if (S.hostHail) S.hostHail(m, conn); return 'hail'; }   // as handleMessage's gmhello branch
                if (m.type !== 'snapshot') { c.log.push(m.type); return 'read'; }
                if (conn.wpSnapOk === m) conn.wpSnapOk = null; else if (!S.snapArrived(m, conn)) return 'judging';
                net.syncedPeer = conn.peer; runSnapKey(net, m, conn, HC.rememberTableKey); c.log.push('snapshot'); return 'taken';
            };
            env.wireDeliver = deliver;
            const names = Object.keys(env);
            S = new Function(...names, stSrc + '\nreturn { snapHeld, snapArrived, snapRefuse, snapAsk, joinTrustReset, genNotRefused: typeof genNotRefused === "function" ? genNotRefused : null, hostHail: typeof hostHail === "function" ? hostHail : null, hostWait: typeof hostWait === "function" ? hostWait : null, hostHeld: typeof hostHeld === "function" ? hostHeld : null, hostDoubted: typeof hostDoubted === "function" ? hostDoubted : null, hostGone: typeof hostGone === "function" ? hostGone : null, proofMs: typeof HOST_PROOF_MS === "number" ? HOST_PROOF_MS : null, trust: function() { return _joinTrust; }, words: { refused: SNAP_REFUSED, ask: SNAP_ASK, max: SNAP_HOLD_MAX, late: typeof HOST_LATE === "string" ? HOST_LATE : null, lateAsk: typeof HOST_LATE_ASK === "string" ? HOST_LATE_ASK : null } };')(...names.map(n => env[n]));
            const connect = p => { p = p || {}; const conn = { peer: p.peer || 'waypoint-c1c1', open: true, closedN: 0, wpCn: p.cn || HC.newKey(), wpRetry: !!p.retry, wpBefore: p.before || null, peerConnection: pcStub(FPP, FPH), close() { conn.closedN++; conn.open = false; }, wpNext() { c.next++; } }; net.conns = [conn]; net.active = true; net.syncedPeer = null; return conn; };
            // until the snapshot's verdict is in: WebCrypto verifies off the main thread, so on a loaded machine 400 turns of the loop could run out
            // first and a case judged the join before its verdict (security S failed now and then in a full gate); past them it waits by the clock, 5 s at most
            const settle = async conn => { const t0 = Date.now(); for (let i = 0; conn.wpSnapWait && (i < 400 || Date.now() - t0 < 5000); i++) await new Promise(r => i < 400 ? setImmediate(r) : setTimeout(r, 1)); await new Promise(r => setImmediate(r)); };
            const fire = ms => { const due = c.timers.filter(t => t.on && (ms === undefined || t.ms === ms)); due.forEach(t => { t.on = false; t.fn(); }); return due.length; };
            return { c, net, reconn, S, HC, store, deliver, connect, settle, fire };
        };

        /* ---- (a) ---- */
        const A = await mkHost();                                  // the real GM, hosting at waypoint-c1c1
        const pat = mkClient({ code: 'C1C1' });                      // Pat's app
        const c1 = pat.connect({ peer: 'waypoint-c1c1' });
        const j1 = await join(A, 'pat-1', { id: 'u_pat', name: 'Pat' }, c1.wpCn), s1 = j1.snap;
        const hostOk = !!s1 && j1.viaGm && J(Object.keys(s1.gmPub || {}).sort()) === J(['crv', 'kty', 'x', 'y']) && /^[0-9a-f]{128}$/.test(s1.sig || '') && /^[0-9a-f]{32}$/.test(s1.key) && nodeOk(s1.gmPub, s1.sig, dataOf(c1.wpCn, 'waypoint-c1c1', 'u_gm', s1.key)) && A.h.camp.players.u_pat.key === s1.key && J(j1.before) === J(['wait', 'gmhello']);
        const r1 = [pat.deliver(s1, c1), pat.deliver({ type: 'sounds' }, c1), pat.deliver({ type: 'roster' }, c1)], mid1 = [pat.c.log.slice(), pat.net.syncedPeer];
        await pat.settle(c1);
        chk('a', hostOk && J(r1) === J(['judging', 'held', 'held']) && J(mid1) === J([[], null]) && J(pat.c.log) === J(['snapshot', 'sounds', 'roster']) && pat.net.syncedPeer === 'waypoint-c1c1' && pat.net.gmId === 'u_gm' && J(pat.HC.gmPinFor('u_gm')) === J(s1.gmPub) && pat.HC.tableKeyFor('u_gm') === s1.key && pat.HC.gmRoomFor('C1C1') === 'u_gm' && pat.c.confirms.length === 0 && pat.c.toasts.length === 0 && c1.open === true,
            J([hostOk, j1.before, r1, mid1, pat.c.log, pat.net.syncedPeer, pat.HC.gmPinFor('u_gm'), pat.HC.tableKeyFor('u_gm'), pat.HC.gmRoomFor('C1C1')]));

        /* ---- (b) ---- */
        const keys0 = pat.store.m.wp_tableKeys, pins0 = pat.store.m.wp_gmPins;
        const SQ = await mkHost({ roomPeer: 'waypoint-c1c1-r1' });   // whoever registered the code's next generation: another machine, so another key pair; it names itself u_gm
        const c2 = pat.connect({ peer: 'waypoint-c1c1-r1', retry: true, before: { tries: 2, gen: 0 } }); pat.reconn.tries = 0; pat.reconn.gen = 1;   // an automatic reconnect that reached generation 1 on its second attempt (the open handler began the count again)
        const j2 = await join(SQ, 'pat-2', { id: 'u_pat', name: 'Pat' }, c2.wpCn);
        const sq = Object.assign({}, j2.snap, { appState: { campaigns: { fake: { id: 'fake' } } }, reason: 'Trust me <b>now</b>', notepad: { gmId: 'u_gm', text: 'Trust me' } });
        const sqSigned = nodeOk(sq.gmPub, sq.sig, dataOf(c2.wpCn, 'waypoint-c1c1-r1', 'u_gm', sq.key)) && sq.gmPub.x !== s1.gmPub.x;
        const n2 = pat.c.log.length, r2 = [pat.deliver(sq, c2), pat.deliver({ type: 'chat' }, c2)];
        await pat.settle(c2);
        const r2b = pat.deliver({ type: 'stage' }, c2), rc1 = [pat.reconn.tries, pat.reconn.gen];
        const sig3 = mkSigner(), c2b = pat.connect({ peer: 'waypoint-c1c1-r2', retry: true, before: { tries: 3, gen: 0 } });   // and a second one, at the generation after
        pat.deliver({ type: 'snapshot', gmId: 'u_gm', key: 'e'.repeat(32), gmPub: sig3.pub, sig: sig3.sign(dataOf(c2b.wpCn, 'waypoint-c1c1-r2', 'u_gm', 'e'.repeat(32))), appState: {} }, c2b); await pat.settle(c2b);
        const idOfB = (code, g) => 'waypoint-' + code + (g ? '-r' + g : ''), gnr = pat.S.genNotRefused || (() => -1), badB = Object.keys(pat.S.trust().bad || {});
        const skipB = [gnr('c1c1', 0, 4, idOfB), gnr('c1c1', 1, 4, idOfB), gnr('c1c1', 2, 4, idOfB), gnr('c1c1', 3, 4, idOfB), gnr('zzzz', 1, 4, idOfB), gnr('c1c1', 1, 2, (c, g) => idOfB(c, g + 1))];   // (the last: every generation refused — the one asked for stands)
        chk('b', sqSigned && J(badB) === J(['waypoint-c1c1-r1', 'waypoint-c1c1-r2']) && J(skipB) === J([0, 3, 3, 3, 1, 1]) && J(r2) === J(['judging', 'held']) && r2b === 'held' && pat.c.log.length === n2 && pat.net.syncedPeer === null && pat.store.m.wp_tableKeys === keys0 && pat.store.m.wp_gmPins === pins0 && c2.open === false && c2.closedN === 1 && c2.wpSnapDead === true && c2b.open === false
            && J(rc1) === J([2, 0]) && J([pat.reconn.tries, pat.reconn.gen]) === J([3, 0]) && J(pat.c.toasts) === J([pat.S.words.refused + ' Still looking for your GM\u2026']) && pat.S.words.refused === 'This table\u2019s GM is not the one you know from this room code \u2014 the GM may have reinstalled, or someone else is at that code.'
            && pat.c.confirms.length === 0 && pat.c.next === 0 && pat.c.status.length === 0 && pat.net.active === true && !/Trust me/.test(J(pat.c.toasts)),
            J([sqSigned, badB, skipB, r2, r2b, pat.c.log.length - n2, pat.net.syncedPeer, pat.store.m.wp_tableKeys === keys0, pat.store.m.wp_gmPins === pins0, c2.open, c2.closedN, c2b.open, pat.reconn, pat.c.toasts, pat.c.confirms.length, pat.c.next]));

        /* ---- (c) ---- */
        const c3 = pat.connect({ peer: 'waypoint-c1c1', retry: true, before: { tries: 4, gen: 0 } }); pat.reconn.tries = 0; pat.reconn.gen = 0;
        const j3 = await join(A, 'pat-3', { id: 'u_pat', name: 'Pat' }, c3.wpCn, s1.key);   // known now: challenged, the key proven (the suite's own HMAC), straight in
        const nT = pat.c.toasts.length, r3 = pat.deliver(j3.snap, c3); await pat.settle(c3);
        chk('c', !!j3.snap && !j3.viaGm && j3.snap.key === s1.key && J(j3.snap.gmPub) === J(s1.gmPub) && j3.snap.sig !== s1.sig && nodeOk(j3.snap.gmPub, j3.snap.sig, dataOf(c3.wpCn, 'waypoint-c1c1', 'u_gm', s1.key)) && r3 === 'judging' && pat.c.log[pat.c.log.length - 1] === 'snapshot' && pat.net.syncedPeer === 'waypoint-c1c1'
            && pat.c.confirms.length === 0 && pat.c.toasts.length === nT && c3.open === true && J([pat.reconn.tries, pat.reconn.gen]) === J([0, 0]) && pat.HC.tableKeyFor('u_gm') === s1.key && pat.store.m.wp_gmPins === pins0,
            J([j3.viaGm, j3.snap && j3.snap.key === s1.key, r3, pat.c.log.slice(-1), pat.net.syncedPeer, pat.c.confirms.length, pat.c.toasts.length - nT, c3.open, pat.reconn]));

        /* ---- (d) and the rest: each a join the player began, on a copy of Pat's storage ---- */
        const first = async (o, snapOf) => {
            const P = mkClient(Object.assign({ store: cloneStore(pat.store), code: 'C1C1' }, o)), c = P.connect({ peer: o.peer || 'waypoint-c1c1' }), snap = await snapOf(c), r = P.deliver(snap, c);
            await P.settle(c); P.S.snapAsk('C1C1', 'Pat'); P.S.snapAsk('C1C1', 'Pat');
            const rf = P.S.trust().refused;
            return { P, c, r, taken: P.c.log.indexOf('snapshot') >= 0, next: P.c.next, hb: P.c.hb, active: P.net.active, asks: P.c.confirms.length, offer: rf ? rf.offer : undefined, key: P.HC.tableKeyFor('u_gm'), pin: P.HC.gmPinFor('u_gm'), synced: P.net.syncedPeer, dead: c.wpSnapDead === true };
        };
        const fromGm = async (c, peer) => (await join(A, peer, { id: 'u_pat', name: 'Pat' }, c.wpCn, s1.key)).snap;
        const dOther = await first({}, async () => s1);                                                             // the snapshot of Pat's first connection, replayed
        const dRoom = await first({ peer: 'waypoint-c1c1-r2' }, c => fromGm(c, 'pat-d2'));                           // the GM's own snapshot for this nonce, shown at another room id
        const dKey = await first({}, async c => Object.assign({}, await fromGm(c, 'pat-d3'), { key: 'f'.repeat(32) }));   // its table key changed on the way
        const dGood = await first({}, c => fromGm(c, 'pat-d4'));
        const refusedQuiet = x => x.r === 'judging' && !x.taken && x.next === 1 && x.hb === 1 && x.active === false && x.asks === 0 && x.offer === null && x.key === s1.key && J(x.pin) === J(s1.gmPub) && x.synced === null && x.dead;
        chk('d', refusedQuiet(dOther) && refusedQuiet(dRoom) && refusedQuiet(dKey) && dGood.taken && dGood.next === 0 && dGood.asks === 0 && dGood.offer === undefined && dGood.synced === 'waypoint-c1c1' && dGood.active === true,
            J([dOther, dRoom, dKey, dGood].map(x => [x.r, x.taken, x.next, x.hb, x.active, x.asks, x.offer, x.key === s1.key, x.synced, x.dead])));

        /* ---- (e) ---- */
        const old = mkClient({ code: 'OLD1' }), co = old.connect({ peer: 'waypoint-old1' });
        const eOld = [old.deliver({ type: 'snapshot', gmId: 'u_old', key: 'o'.repeat(32), appState: {} }, co), old.c.log.slice(), old.HC.gmPinFor('u_old'), old.HC.tableKeyFor('u_old'), old.HC.gmRoomFor('old1'), old.store.m.wp_gmPins];
        const co2 = old.connect({ peer: 'waypoint-old1' }), eOld2 = old.deliver({ type: 'snapshot', gmId: 'u_old', key: 'p'.repeat(32), appState: {} }, co2);   // the same older host again
        const eUnsigned = await first({}, async () => ({ type: 'snapshot', gmId: 'u_gm', key: 'g'.repeat(32), appState: {} }));   // an older host naming the pinned GM
        eUnsigned.P.c.confirms[0].cb(true); eUnsigned.P.S.joinTrustReset();   // the player says yes to that table as it stands (no key): the join begins again
        const cu = eUnsigned.P.connect({ peer: 'waypoint-c1c1' }), eYes = [eUnsigned.asks, J(eUnsigned.P.c.joins), eUnsigned.P.deliver({ type: 'snapshot', gmId: 'u_gm', key: 'g'.repeat(32), appState: {} }, cu), eUnsigned.P.HC.gmPinFor('u_gm'), eUnsigned.P.HC.tableKeyFor('u_gm')];
        const eBlind = await first({ noCrypto: true }, c => fromGm(c, 'pat-e2'));   // rightly signed, but this app cannot check it
        const sigBad = mkSigner(), bad = mkClient({ code: 'BAD1' }), cb = bad.connect({ peer: 'waypoint-bad1' });
        const rBad = bad.deliver({ type: 'snapshot', gmId: 'u_bad', key: 'b'.repeat(32), gmPub: sigBad.pub, sig: sigBad.sign(dataOf('0'.repeat(32), 'waypoint-bad1', 'u_bad', 'b'.repeat(32))), appState: {} }, cb); await bad.settle(cb);
        chk('e', J(eOld) === J(['taken', ['snapshot'], null, 'o'.repeat(32), 'u_old', undefined]) && eOld2 === 'taken' && !eUnsigned.taken && eUnsigned.next === 1 && eUnsigned.key === s1.key && J(eUnsigned.pin) === J(s1.gmPub) && J(eUnsigned.offer) === J({ pub: null }) && J(eYes) === J([1, J([['C1C1', 'Pat']]), 'taken', null, 'g'.repeat(32)])
            && !eBlind.taken && eBlind.next === 1 && eBlind.offer === null && eBlind.asks === 0 && rBad === 'judging' && bad.c.log[0] === 'snapshot' && bad.HC.gmPinFor('u_bad') === null && bad.HC.tableKeyFor('u_bad') === 'b'.repeat(32),
            J([eOld, eOld2, [eUnsigned.taken, eUnsigned.next, eUnsigned.offer], eYes, [eBlind.taken, eBlind.next, eBlind.offer, eBlind.asks], rBad, bad.c.log, bad.HC.gmPinFor('u_bad')]));

        /* ---- (f) ---- */
        const privA = JSON.parse(A.store.m.wp_gmSign || '{}').priv || {}, allSent = J(A.h.sent.concat(SQ.h.sent));
        const sigW = mkSigner(), wl = mkClient({ code: 'WL01' }), cw = wl.connect({ peer: 'waypoint-wl01' });
        wl.deliver({ type: 'snapshot', gmId: 'u_wl', key: 'w'.repeat(32), gmPub: Object.assign({ d: 'PRIVATE', ext: true, key_ops: ['verify'], alg: 'ES256', evil: '<svg onload=1>' }, sigW.pub), sig: sigW.sign(dataOf(cw.wpCn, 'waypoint-wl01', 'u_wl', 'w'.repeat(32))), appState: {} }, cw); await wl.settle(cw);
        const kept = JSON.parse(wl.store.m.wp_gmPins || '{}').u_wl, HW = wl.HC;
        const noKey = [Object.assign({}, sigW.pub, { crv: 'P-384' }), Object.assign({}, sigW.pub, { kty: 'RSA' }), Object.assign({}, sigW.pub, { x: sigW.pub.x + 'A' }), Object.assign({}, sigW.pub, { y: { a: 1 } }), Object.assign({}, sigW.pub, { x: sigW.pub.x.slice(0, 42) + '+' }), null, 'x', []].map(v => HW.cleanGmPub(v));
        const cap = mkStore(), HCap = helpers(cap); for (let i = 0; i < 60; i++) { HCap.rememberGmPin('u_g' + i, sigW.pub); HCap.rememberGmRoom('code' + i, 'u_g' + i); }
        HCap.rememberGmPin('u_g10', sigW.pub); HCap.rememberGmPin('u_g60', sigW.pub);
        const capped = [Object.keys(JSON.parse(cap.m.wp_gmPins)).length, !!HCap.gmPinFor('u_g9'), !!HCap.gmPinFor('u_g10'), !!HCap.gmPinFor('u_g11'), !!HCap.gmPinFor('u_g12'), !!HCap.gmPinFor('u_g60'), Object.keys(JSON.parse(cap.m.wp_gmRooms)).length, HCap.gmRoomFor('code9'), HCap.gmRoomFor('CODE59'), HCap.rememberGmPin('constructor', sigW.pub), HCap.rememberGmPin('u_x', { kty: 'EC' }), HCap.rememberGmRoom('a b', 'u_x'), HCap.gmPinFor('__proto__')];
        const htmlS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const bootS = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'bootprefs.js'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })();   // the launch merge's file (the page runs it directly after /api/prefs.js)
        const mLines = bootS.split('\n').filter(l => l.indexOf("if (k === 'wp_gmPins' || k === 'wp_gmRooms') {") >= 0);
        const runM = mLines.length === 1 ? new Function('k', 'f', 'localStorage', mLines[0].trim() + '\nreturn "fell through";') : () => 'no line';
        const fileP = {}; for (let i = 0; i < 120; i++) fileP['u_f' + i] = sigW.pub; const stM = mkStore(); stM.setItem('wp_gmPins', J({ u_l0: sigW.pub }));
        const mR = runM('wp_gmPins', { prefs: { wp_gmPins: J(fileP) } }, stM), mOut = JSON.parse(stM.m.wp_gmPins);
        chk('f', typeof privA.d === 'string' && privA.d.length === 43 && allSent.indexOf(privA.d) < 0 && allSent.indexOf('"d":') < 0 && allSent.indexOf('priv') < 0 && J(kept) === J({ kty: 'EC', crv: 'P-256', x: sigW.pub.x, y: sigW.pub.y }) && wl.c.log[0] === 'snapshot' && noKey.every(v => v === null)
            && J(capped) === J([50, false, true, false, true, true, 50, '', 'u_g59', false, false, false, null]) && mR !== 'fell through' && mR !== 'no line' && Object.keys(mOut).length === 50 && J(mOut.u_f119) === J(sigW.pub) && !('u_l0' in mOut) && !('u_f69' in mOut),
            J([typeof privA.d, allSent.indexOf('"d":'), kept, noKey, capped, mR, Object.keys(mOut).length]));

        /* ---- (g) ---- */
        const A2 = await mkHost({ store: A.store }), pubA2 = A2.G.key() && A2.G.key().pub, kept1 = A.store.m.wp_gmSign;
        A2.h.env.net.gmSignReset(); const gone = A.store.m.wp_gmSign === undefined && A2.G.key() === null;
        const A3 = await mkHost({ store: A.store }), pubA3 = A3.G.key() && A3.G.key().pub;
        const setJs = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'settings.js'), 'utf8').replace(/\r\n/g, '\n');
        const mId = setJs.match(/d\.showConfirm\('Reset your multiplayer identity\?[^\n']*', (function\(yes\) \{\n[\s\S]*?toast\('New identity generated\.'\);\n\s*\})\);/);   // the confirm's own callback, run for real
        const runId = (yes, win) => { const calls = []; if (!mId) return null; new Function('getProfile', 'saveProfile', 'window', 'toast', 'localStorage', 'return ' + mId[1])(() => ({ id: 'u_old', name: 'N' }), p => calls.push('save:' + (p.id !== 'u_old' && p.name === 'N')), win || { wpNet: { gmSignReset: () => calls.push('reset') } }, () => calls.push('toast'), { removeItem: k => calls.push('rm:' + k), setItem: (k, v) => calls.push('set:' + k + (v !== 'u_old' ? ':new' : ':old')) })(yes); return calls; };
        const idRuns = [runId(false), runId(undefined), runId(true), runId(true, {})];
        chk('g', J(pubA2) === J(s1.gmPub) && typeof kept1 === 'string' && gone && !!pubA3 && pubA3.x !== s1.gmPub.x && typeof A.store.m.wp_gmSign === 'string' && A.store.m.wp_gmSign !== kept1
            && J(idRuns) === J([[], [], ['save:true', 'set:wp_hostId:new', 'reset', 'toast'], ['save:true', 'set:wp_hostId:new', 'rm:wp_gmSign', 'toast']])
            && /saveProfile\(np\);\n\s*try \{ localStorage\.setItem\('wp_hostId', np\.id\); \} catch \(e\) \{\}[^\n]*\n\s*if \(window\.wpNet\) window\.wpNet\.myId = np\.id;\n\s*if \(window\.wpNet && window\.wpNet\.gmSignReset\) window\.wpNet\.gmSignReset\(\); else \{ try \{ localStorage\.removeItem\('wp_gmSign'\); \} catch \(e\) \{\} \}/.test(setJs)
            && /var keep = \{ wp_profile: 1, wp_hostId: 1, wp_version: 1, wp_lastHost: 1, wp_prefsStamp: 1, wp_gmSign: 1, wp_gmPins: 1, wp_gmRooms: 1, wp_tableKeys: 1, wp_tablesSeen: 1 \};/.test(setJs) && /var KEEP = \{ wp_profile: 1, wp_hostId: 1, wp_tableKeys: 1, wp_gmSign: 1, wp_gmPins: 1, wp_gmRooms: 1 \};/.test(bootS) && !/var KEEP = /.test(htmlS) && /<script src="\/api\/prefs\.js"><\/script>\n<script src="scripts\/bootprefs\.js"><\/script>/.test(htmlS),
            J([J(pubA2) === J(s1.gmPub), gone, pubA3 && pubA3.x !== s1.gmPub.x, idRuns]));

        /* ---- (h) ---- */
        const mal = mkSigner(), malSnap = c => ({ type: 'snapshot', gmId: 'u_mallory', key: 'm'.repeat(32), gmPub: mal.pub, sig: mal.sign(dataOf(c.wpCn, c.peer, 'u_mallory', 'm'.repeat(32))), appState: {} });
        const hNo = await first({ peer: 'waypoint-c1c1-r1' }, async c => malSnap(c));
        const ask = hNo.P.c.confirms[0] || {}; if (ask.cb) ask.cb(false);
        const noSaid = [hNo.taken, hNo.next, hNo.asks, J(hNo.offer) === J({ pub: mal.pub }), ask.t === hNo.P.S.words.ask, !!(ask.opts && ask.opts.noEnter === true && ask.opts.noEscape === true), hNo.P.c.joins.length, hNo.key === s1.key, hNo.P.HC.gmRoomFor('c1c1')];
        const hYes = await first({ peer: 'waypoint-c1c1-r1' }, async c => malSnap(c));
        hYes.P.net.active = false; hYes.P.c.confirms[0].cb(true); const joined = J(hYes.P.c.joins);
        hYes.P.S.joinTrustReset();                                       // as joinSession begins the join the yes started
        const other2 = mkSigner(), cy0 = hYes.P.connect({ peer: 'waypoint-c1c1' });   // on the way another key answers under the same name: not what the player said yes to
        const ry0 = hYes.P.deliver({ type: 'snapshot', gmId: 'u_mallory', key: 'n'.repeat(32), gmPub: other2.pub, sig: other2.sign(dataOf(cy0.wpCn, 'waypoint-c1c1', 'u_mallory', 'n'.repeat(32))), appState: {} }, cy0); await hYes.P.settle(cy0);
        const y0 = [ry0, hYes.P.c.log.indexOf('snapshot') >= 0, cy0.wpSnapDead === true, hYes.P.HC.gmPinFor('u_mallory')];
        const cyb = hYes.P.connect({ peer: 'waypoint-c1c1-r1' });   // and the very key the player said yes to, shown by a host that cannot sign with it
        const ryb = hYes.P.deliver({ type: 'snapshot', gmId: 'u_mallory', key: 'n'.repeat(32), gmPub: mal.pub, sig: other2.sign(dataOf(cyb.wpCn, 'waypoint-c1c1-r1', 'u_mallory', 'n'.repeat(32))), appState: {} }, cyb); await hYes.P.settle(cyb);
        const yb = [ryb, hYes.P.c.log.indexOf('snapshot') >= 0, cyb.wpSnapDead === true, hYes.P.HC.gmPinFor('u_mallory'), hYes.P.HC.tableKeyFor('u_mallory')];
        const cy1 = hYes.P.connect({ peer: 'waypoint-c1c1-r1' }), ry1 = hYes.P.deliver(malSnap(cy1), cy1); await hYes.P.settle(cy1);
        const y1 = [ry1, hYes.P.c.log.indexOf('snapshot') >= 0, J(hYes.P.HC.gmPinFor('u_mallory')) === J(mal.pub), hYes.P.HC.gmRoomFor('c1c1'), hYes.P.HC.tableKeyFor('u_mallory'), hYes.P.S.trust().accept, hYes.P.c.confirms.length, J(hYes.P.HC.gmPinFor('u_gm')) === J(s1.gmPub)];
        chk('h', J(noSaid) === J([false, 1, 1, true, true, true, 0, true, 'u_gm']) && hNo.P.S.words.ask === 'This table\u2019s GM is not the one you know from this room code. The GM may have reinstalled or moved to another computer \u2014 or someone else is at that code. If you are not sure, ask your GM before you say yes. Trust this table\u2019s GM from now on, and join?'
            && joined === J([['C1C1', 'Pat']]) && J(y0) === J(['judging', false, true, null]) && J(yb) === J(['judging', false, true, null, '']) && J(y1) === J(['judging', true, true, 'u_mallory', 'm'.repeat(32), null, 1, true]), J([noSaid, joined, y0, yb, y1]));

        /* ---- (i) ---- */
        const fl = mkClient({ store: cloneStore(pat.store), code: 'C1C1' }), cf = fl.connect({ peer: 'waypoint-c1c1' }), sf = await fromGm(cf, 'pat-i1');
        fl.deliver(sf, cf); for (let i = 0; i < 300; i++) fl.deliver({ type: 'pos' }, cf); await fl.settle(cf);
        const stray = { peer: 'waypoint-c1c1', open: true, wpCn: cf.wpCn, close() {} }, rStray = fl.deliver(sf, stray), nStray = fl.c.log.filter(x => x === 'snapshot').length;
        const rt = mkClient({ code: 'RT01' }), cr0 = rt.connect({ peer: 'waypoint-rt01' }); rt.deliver({ type: 'snapshot', gmId: 'u_rt', key: 'r'.repeat(32), appState: {} }, cr0);   // a table hosted before the signing key: synced, nothing pinned
        const sigR = mkSigner(), cr1 = rt.connect({ peer: 'waypoint-rt01-r1', retry: true, before: { tries: 1, gen: 0 } });
        const rRt = rt.deliver({ type: 'snapshot', gmId: 'u_rt', key: 's'.repeat(32), gmPub: sigR.pub, sig: sigR.sign(dataOf(cr1.wpCn, 'waypoint-rt01-r1', 'u_rt', 's'.repeat(32))), appState: {} }, cr1); await rt.settle(cr1);
        chk('i', fl.S.words.max === 256 && fl.c.log.length === 257 && fl.c.log[0] === 'snapshot' && rStray === 'judging' && nStray === 1 && stray.wpSnapWait === undefined && rRt === 'judging' && rt.c.log.filter(x => x === 'snapshot').length === 2 && rt.HC.gmPinFor('u_rt') === null && rt.store.m.wp_gmPins === undefined,
            J([fl.S.words.max, fl.c.log.length, rStray, nStray, rRt, rt.c.log, rt.HC.gmPinFor('u_rt')]));

        /* ---- (j) ---- */
        const B = await mkHost();
        const jOld = await join(B, 'old-1', { id: 'u_o1', name: 'O' }), jBad = [];
        for (const v of ['zz', 'A'.repeat(32), 'a'.repeat(33), 12, { a: 1 }, null]) jBad.push((await join(B, 'bad-' + jBad.length, { id: 'u_b' + jBad.length, name: 'B' }, v)).snap);
        const plain = s => !!s && !('gmPub' in s) && !('sig' in s) && /^[0-9a-f]{32}$/.test(s.key);
        const cnA = 'a'.repeat(32), cnB = 'b'.repeat(32); B.h.camp.players.u_k = { name: 'K', key: 'k'.repeat(32) };
        const jTwo = await join(B, 'two-1', { id: 'u_k', name: 'K' }, cnA, 'k'.repeat(32), cnB);   // the answer to the challenge carries another nonce: the first one stands
        const NC = await mkHost({ noCrypto: true }); await NC.G.gmSignArm(); const jNc = await join(NC, 'nc-1', { id: 'u_n1', name: 'N' }, 'c'.repeat(32));
        chk('j', plain(jOld.snap) && jBad.every(plain) && !!jTwo.snap && !jTwo.viaGm && nodeOk(jTwo.snap.gmPub, jTwo.snap.sig, dataOf(cnA, 'waypoint-c1c1', 'u_gm', 'k'.repeat(32))) && !nodeOk(jTwo.snap.gmPub, jTwo.snap.sig, dataOf(cnB, 'waypoint-c1c1', 'u_gm', 'k'.repeat(32)))
            && NC.G.key() === null && plain(jNc.snap) && NC.h.toasts.filter(t => /cannot sign your table/.test(t)).length === 1 && NC.store.m.wp_gmSign === undefined && B.h.toasts.filter(t => /cannot sign/.test(t)).length === 0,
            J([plain(jOld.snap), jBad.map(plain), jTwo.snap && Object.keys(jTwo.snap), NC.h.toasts, jNc.snap && Object.keys(jNc.snap)]));

        /* ---- (l) the seam the connection's tie goes through: one function, read by both sides ---- */
        const bindOf = b => () => b;
        const L = await mkHost({ bind: bindOf('|H1|P1') }), lp = mkClient({ code: 'C1C1', bind: bindOf('|H1|P1') }), cl = lp.connect({ peer: 'waypoint-c1c1' });
        const sl = (await join(L, 'lp-1', { id: 'u_lp', name: 'Lp' }, cl.wpCn)).snap;
        const lSigned = !!sl && nodeOk(sl.gmPub, sl.sig, dataOf(cl.wpCn, 'waypoint-c1c1', 'u_gm', sl.key, '|H1|P1')) && !nodeOk(sl.gmPub, sl.sig, dataOf(cl.wpCn, 'waypoint-c1c1', 'u_gm', sl.key));
        if (sl) lp.deliver(sl, cl); await lp.settle(cl);
        const lTaken = [lp.c.log[0], !!sl && J(lp.HC.gmPinFor('u_gm')) === J(sl.gmPub), lp.c.confirms.length];
        const lx = mkClient({ code: 'C1C1', store: cloneStore(lp.store), bind: bindOf('|H1|PX') }), cx = lx.connect({ peer: 'waypoint-c1c1' });   // the same player, the same GM, a connection that reads another tie
        const sx = sl ? (await join(L, 'lp-2', { id: 'u_lp', name: 'Lp' }, cx.wpCn, sl.key)).snap : null;
        if (sx) lx.deliver(sx, cx); await lx.settle(cx); lx.S.snapAsk('C1C1', 'Lp');
        const lOther = [!!sx && nodeOk(sx.gmPub, sx.sig, dataOf(cx.wpCn, 'waypoint-c1c1', 'u_gm', sl.key, '|H1|P1')), lx.c.log.indexOf('snapshot') >= 0, cx.wpSnapDead === true, lx.c.next, lx.c.confirms.length, !!sl && lx.HC.tableKeyFor('u_gm') === sl.key];
        const LN = await mkHost({ bind: bindOf(null) }), sn0 = (await join(LN, 'ln-1', { id: 'u_ln', name: 'Ln' }, 'd'.repeat(32))).snap;   // the host cannot read the tie: nothing is signed
        const ln = mkClient({ code: 'C1C1', store: cloneStore(pat.store), bind: bindOf(null) }), cn1 = ln.connect({ peer: 'waypoint-c1c1' });   // Pat's app cannot read it: the real GM's rightly signed snapshot verifies nothing
        ln.deliver(await fromGm(cn1, 'pat-l3'), cn1); await ln.settle(cn1); ln.S.snapAsk('C1C1', 'Pat');
        const lBlind = [ln.c.log.indexOf('snapshot') >= 0, cn1.wpSnapDead === true, ln.c.next, ln.c.confirms.length, ln.HC.tableKeyFor('u_gm') === s1.key];
        const nCalls = (s, re) => (s.match(re) || []).length;
        chk('l', lSigned && J(lTaken) === J(['snapshot', true, 0]) && J(lOther) === J([true, false, true, 1, 0, true]) && plain(sn0) && J(lBlind) === J([false, true, 1, 0, true])
            && A.HH.snapBind({}, true) === null && A.HH.snapBind({}, false) === null && A.HH.snapBind({ peerConnection: pcStub(FPH, FPP) }, true) === FPTAIL && A.HH.snapBind({ peerConnection: pcStub(FPP, FPH) }, false) === FPTAIL && A.HH.snapBind({ peerConnection: pcStub(FPP, FPH) }, true) !== FPTAIL && A.HH.snapData('c', 'r', 'g', 'k', '') === 'wp-snap|c|r|g|k' && A.HH.snapData('c', 'r', 'g', 'k', '|a|b') === 'wp-snap|c|r|g|k|a|b'
            && nCalls(src, /snapData\(/g) === 3 && nCalls(src, /snapBind\(/g) === 5 && nCalls(src, /hostData\(/g) === 3 && nCalls(gmSrc, /snapData\(cn, room, gm, key, bind\)/g) === 1 && /bind = snapBind\(conn, true\); if \(!kp \|\| !cm \|\| typeof bind !== 'string'\) return null;/.test(gmSrc)
            && /var bindS = snapBind\(conn, false\), data = typeof bindS === 'string' \? snapData\(validCn\(conn\.wpCn\) \? conn\.wpCn : '', conn\.peer, gmIdS, typeof msg\.key === 'string' \? msg\.key : '', bindS\) : null;/.test(stSrc),
            J([lSigned, lTaken, lOther, plain(sn0), lBlind, nCalls(src, /snapData\(/g), nCalls(src, /snapBind\(/g)]));

        /* ---- (m) a reconnect is judged by what this session took its table from, whatever storage kept ---- */
        const fullS = mkStore(); fullS.setItem = () => { throw new Error('QuotaExceededError'); };
        const fm = mkClient({ code: 'M1M1', store: fullS }), M = await mkHost({ roomPeer: 'waypoint-m1m1' });
        const cm1 = fm.connect({ peer: 'waypoint-m1m1' }), sm1 = (await join(M, 'fm-1', { id: 'u_fm', name: 'Fm' }, cm1.wpCn)).snap;
        if (sm1) fm.deliver(sm1, cm1); await fm.settle(cm1);
        const m1 = [fm.c.log[0], fm.HC.gmPinFor('u_gm'), fm.HC.gmRoomFor('m1m1'), Object.keys(fullS.m).length];
        const retryAt = (gen, tries, snapOf) => { const c = fm.connect({ peer: 'waypoint-m1m1' + (gen ? '-r' + gen : ''), retry: true, before: { tries, gen: 0 } }); return { c, r: fm.deliver(snapOf(c), c) }; };
        const sgM = mkSigner();
        const mA = retryAt(1, 1, () => ({ type: 'snapshot', gmId: 'u_else', key: 'x'.repeat(32), appState: {} })); await fm.settle(mA.c);   // another GM id, no key
        const mB = retryAt(2, 2, c => ({ type: 'snapshot', gmId: 'u_gm', key: 'y'.repeat(32), gmPub: sgM.pub, sig: sgM.sign(dataOf(c.wpCn, c.peer, 'u_gm', 'y'.repeat(32))), appState: {} })); await fm.settle(mB.c);   // the GM's id, another key
        const mC = retryAt(3, 3, () => ({ type: 'snapshot', gmId: 'u_gm', key: 'z'.repeat(32), appState: {} })); await fm.settle(mC.c);   // the GM's id, no key
        const nM = fm.c.log.length, cm4 = fm.connect({ peer: 'waypoint-m1m1', retry: true, before: { tries: 4, gen: 0 } }), sm4 = sm1 ? (await join(M, 'fm-2', { id: 'u_fm', name: 'Fm' }, cm4.wpCn, sm1.key)).snap : null;
        if (sm4) fm.deliver(sm4, cm4); await fm.settle(cm4);
        const mGm = [fm.c.log.length - nM, fm.c.log[fm.c.log.length - 1], cm4.open, fm.c.confirms.length, fm.c.toasts.length];
        fm.S.joinTrustReset(); const cm5 = fm.connect({ peer: 'waypoint-m1m1' }), m5 = fm.deliver({ type: 'snapshot', gmId: 'u_else', key: 'x'.repeat(32), appState: {} }, cm5);   // a join the player begins: only what is stored counts (here nothing)
        chk('m', J(m1) === J(['snapshot', null, '', 0]) && [mA, mB, mC].every(x => x.r === 'judging' && x.c.wpSnapDead === true && x.c.open === false) && nM === 1 && J(mGm) === J([1, 'snapshot', true, 0, 1]) && m5 === 'taken',
            J([m1, [mA, mB, mC].map(x => [x.r, x.c.wpSnapDead === true, x.c.open]), nM, mGm, m5]));

        /* ---- (k) ---- */
        const wired = [
            /function handleMessage\(msg, conn\) \{\n\s*if \(!msg \|\| !msg\.type\) return;\n\s*if \(net\.role === 'client' && !wireShapeOk\(msg\)\) return;[^\n]*\n\s*if \(net\.role === 'client' && snapHeld\(msg, conn\)\) return;/.test(src),
            /\} else if \(msg\.type === 'snapshot' && net\.role === 'client'\) \{\n\s*if \(conn\.wpSnapOk === msg\) conn\.wpSnapOk = null; else if \(!snapArrived\(msg, conn\)\) return;[^\n]*\n\s*net\.syncedPeer = conn\.peer;/.test(src),
            /conn\.on\('data', function\(d\) \{ wireDeliver\(d, conn\); \}\);/.test(src) && /function wireDeliver\(d, conn\) \{ try \{ handleMessage\(d, conn\); \} catch/.test(src),
            /conn\.wpCn = newKey\(\); conn\.wpRetry = !!isRetry;/.test(src) && /var gen = isRetry \? genNotRefused\(code, retryGen\(reconn\.gen, reconn\.tries, ROOM_GENS\), ROOM_GENS, roomPeerId\) : probe;/.test(src) && /version: APP_VERSION, cn: conn\.wpCn \}\);[^\n]*before the first heartbeat/.test(src) && /if \(validCn\(conn\.wpCn\)\) helloA\.cn = conn\.wpCn;/.test(src),
            /var wasRetry = reconn\.pending;\n\s*conn\.wpBefore = wasRetry \? \{ tries: reconn\.tries, gen: reconn\.gen \} : null;[^\n]*\n\s*cancelReconnect\(\);/.test(src) && /if \(!isRetry && !probe\) joinTrustReset\(\);/.test(src),
            /nextGen = conn\.wpNext = function\(\) \{[^\n]*\n\s*clearTimeout\(joinTimer\);\n\s*if \(net\.peer !== peer\) return;\n\s*net\.active = false;\n\s*try \{ peer\.destroy\(\); \} catch \(e\) \{\}\n\s*if \(probe \+ 1 < ROOM_GENS\) \{ joinSession\(code, name, false, probe \+ 1\); return; \}\n\s*joinFailed\(''\);/.test(src) && /if \(rfJ\) snapAsk\(code, name\);/.test(src) && /if \(rfJ\) setStatus\(rfJ\.late \? HOST_LATE \+ ' You have not joined\.' : SNAP_REFUSED \+ ' You have not joined\.'/.test(src),
            /gmSignArm\(\);[^\n]*\n\s*var peer = new Peer\(roomPeerId\(code, gen\), peerOpts\(_hostTok \|\| undefined\)\);/.test(src),   /* 1.6.2 (backlog 220), moved on purpose */
            /rec\.key = \(provenKey && rec\.key === provenKey\) \? rec\.key : gmFreshKey\(conn\);/.test(src) && /notepad: notepadMsg\(\) \}; if \(sheetFilesHere\(\)\) snap\.sheetFiles = true; var soSnap = [^\n]*?snap\.sheetOut = soSnap; gmSignSnap\(snap, conn\); \};/.test(src),
            /if \(!pwSat && !cm\.signed && validCn\(msg\.cn\)\) cm\.signed = gmPresign\(cm, msg\.cn, keyed0 \? rec0\.key : '', conn\);/.test(src)   /* 1.6.3 (a password set mid-session), moved on purpose: a seated player's hello with no password is signed for only once the key has passed */ && /hmacHex\(key0, fp0 \? authData\(nonce0, net\.roomPeer, fp0\[0\], fp0\[1\]\) : null\)\.then\(function\(want\) \{ return Promise\.all\(\[cm\.hail, cm\.signed\]\)\.then\(function\(\) \{ return want; \}\); \}\)\.then\(function\(want\) \{/.test(src),
            /<li><b>Your GM, and no one else:<\/b> the first time you join a table your app remembers its GM&rsquo;s key[\s\S]{0,400}?You are asked once whether to trust the table that answered[\s\S]{0,1500}?<li>This protection begins with the first table your GM hosts on this version\.<\/li>/.test(htmlS) && /<li><b>Your table is signed:<\/b>[^\n]*\s*<ul>\s*<li>It proves itself to a returning player&rsquo;s app as soon as that app says hello[^\n]*<\/li>\s*<li><b>Settings &#9656; Reset multiplayer identity<\/b> makes a new key with your new identity\. To your players&rsquo; apps your table is then a new GM&rsquo;s\.<\/li>/.test(htmlS)
        ];
        chk('k', wired.every(Boolean), J(wired));

        /* ---- (n) the host's early proof: one per connection, after the gates, before any admission ---- */
        const hostText = (cn, room, gm, bind) => 'wp-host|' + cn + '|' + room + '|' + gm + (bind === undefined ? FPTAIL : bind);   // the suite's own reading of what the early proof covers
        const typesTo = (X, peer) => X.h.sent.filter(s => s.peer === peer).map(s => s.m.type), hails = (X, peer) => X.h.sent.filter(s => s.peer === peer && s.m.type === 'gmhello').map(s => s.m);
        const ROOM = 'waypoint-c1c1', NH = await mkHost({ players: { u_k: { name: 'K', key: 'k'.repeat(32) } } });
        const cnS = 'a1'.repeat(16), cS = NH.h.conn('n-1'); NH.h.hello(cS, { id: 'u_s', name: 'S' }, { cn: cnS });
        const syncS = typesTo(NH, 'n-1'); await NH.h.settle();                       // what the gate said at once, then what followed
        const ghS = hails(NH, 'n-1')[0] || {}, afterS = typesTo(NH, 'n-1');
        const cnK = 'b2'.repeat(16), cnK2 = 'c3'.repeat(16), cK = NH.h.conn('n-2'); NH.h.hello(cK, { id: 'u_k', name: 'K' }, { cn: cnK });
        const syncK = [typesTo(NH, 'n-2'), NH.h.timers.map(t => t.ms)]; await NH.h.settle();
        const aK = NH.h.lastSent('n-2', 'auth'), midK = typesTo(NH, 'n-2');
        NH.h.hello(cK, { id: 'u_k', name: 'K' }, { proof: hmacRef('k'.repeat(32), 'wp-auth|' + (aK ? aK.m.nonce : '') + '|' + ROOM + FPTAIL), cn: cnK2 }); await NH.h.settle();
        const afterK = typesTo(NH, 'n-2'), ghK = hails(NH, 'n-2'), snK = (NH.h.lastSent('n-2', 'snapshot') || {}).m || {};
        const cnQ = 'd4'.repeat(16), X0 = { id: 'u_x', name: 'X' };
        const quiet = async (o, prof, extra, pre) => { const X = await mkHost(o); if (pre) pre(X); const c = X.h.conn('q-1'); X.h.hello(c, prof, extra); await X.h.settle(); return { hail: hails(X, 'q-1').length, types: typesTo(X, 'q-1') }; };
        const noHail = [
            await quiet({}, X0, { cn: cnQ }, X => { X.h.env.bannedIds.u_x = true; }),                                         // removed this session
            await quiet({}, X0, { cn: cnQ }, X => { X.h.camp.bannedPlayers.u_x = true; }),                                   // banned from the campaign
            await quiet({}, X0, { cn: cnQ, version: '1.4.9' }),                                                               // an older version
            await quiet({}, X0, { cn: cnQ, password: 'wrong' }, X => { X.h.env.ui = () => ({ value: 'pw' }); }),             // the wrong password
            await quiet({}, { id: 'u_gm', name: 'X' }, { cn: cnQ }),                                                          // the GM's own id
            await quiet({}, X0, {}), await quiet({}, X0, { cn: 'ZZ' }), await quiet({}, X0, { cn: cnQ.toUpperCase() }),       // no nonce, a malformed one
            await quiet({ noCrypto: true }, X0, { cn: cnQ }),                                                                 // a host with no WebCrypto
            await quiet({ bind: () => null }, X0, { cn: cnQ })                                                                // a connection whose tie cannot be read
        ];
        const yesPw = await quiet({}, X0, { cn: cnQ, password: 'pw' }, X => { X.h.env.ui = () => ({ value: 'pw' }); });
        const NC2 = await mkHost(), cC = NC2.h.conn('q-2'); NC2.h.hello(cC, { id: 'u_c', name: 'C' }, { cn: cnQ }); cC.open = false; await NC2.h.settle();
        const NS = await mkHost(), cT = NS.h.conn('q-3'); NS.h.hello(cT, { id: 'u_t', name: 'T' }, {}); await NS.h.settle();   // a first hello with no nonce, then three with one each
        for (const v of ['e5'.repeat(16), 'f6'.repeat(16), 'a7'.repeat(16)]) { NS.h.hello(cT, { id: 'u_t', name: 'T' }, { cn: v }); await NS.h.settle(); }
        const storm = hails(NS, 'q-3'), privN = (JSON.parse(NH.store.m.wp_gmSign || '{}').priv || {}).d || 'no key';
        const keysOk = m => J(Object.keys(m || {}).sort()) === J(['gmId', 'gmPub', 'sig', 'type']) && m.gmId === 'u_gm' && J(Object.keys(m.gmPub || {}).sort()) === J(['crv', 'kty', 'x', 'y']) && /^[0-9a-f]{128}$/.test(m.sig);
        chk('n', J(syncS) === J(['wait']) && J(afterS) === J(['wait', 'gmhello']) && keysOk(ghS) && nodeOk(ghS.gmPub, ghS.sig, hostText(cnS, ROOM, 'u_gm')) && !nodeOk(ghS.gmPub, ghS.sig, hostText(cnK, ROOM, 'u_gm')) && !nodeOk(ghS.gmPub, ghS.sig, hostText(cnS, ROOM + '-r1', 'u_gm')) && !nodeOk(ghS.gmPub, ghS.sig, hostText(cnS, ROOM, 'u_gm', '|x|y')) && !nodeOk(ghS.gmPub, ghS.sig, hostText(cnS, ROOM, 'u_else'))
            && J(syncK) === J([['auth'], [2500]]) && J(midK) === J(['auth', 'gmhello']) && J(afterK) === J(['auth', 'gmhello', 'snapshot']) && ghK.length === 1 && keysOk(ghK[0]) && nodeOk(ghK[0].gmPub, ghK[0].sig, hostText(cnK, ROOM, 'u_gm')) && !nodeOk(ghK[0].gmPub, ghK[0].sig, hostText(cnK2, ROOM, 'u_gm'))
            && nodeOk(snK.gmPub, snK.sig, dataOf(cnK, ROOM, 'u_gm', 'k'.repeat(32))) && !nodeOk(snK.gmPub, snK.sig, hostText(cnK, ROOM, 'u_gm')) && !nodeOk(ghK[0].gmPub, ghK[0].sig, dataOf(cnK, ROOM, 'u_gm', 'k'.repeat(32))) && !nodeOk(ghK[0].gmPub, ghK[0].sig, dataOf(cnK, ROOM, 'u_gm', ''))
            && !!NH.HH.hostData && NH.HH.hostData('c', 'r', 'g', '|a|b') === 'wp-host|c|r|g|a|b' && NH.HH.hostData('c', 'r', 'g', '') === 'wp-host|c|r|g' && NH.HH.snapData('c', 'r', 'g', '', '') === 'wp-snap|c|r|g|'
            && noHail.length === 10 && noHail.every(x => x.hail === 0) && yesPw.hail === 1 && hails(NC2, 'q-2').length === 0 && storm.length === 1 && nodeOk(storm[0].gmPub, storm[0].sig, hostText('e5'.repeat(16), ROOM, 'u_gm'))
            && privN.length === 43 && J(NH.h.sent.concat(NS.h.sent)).indexOf(privN) < 0 && J(NH.h.sent).indexOf('"d":') < 0,
            J([syncS, afterS, keysOk(ghS), syncK, midK, afterK, ghK.length, noHail, yesPw, hails(NC2, 'q-2').length, storm.length]));

        /* ---- (o) the player's side: the proof taken, nothing stored ---- */
        const tickS = async c => { const t0 = Date.now(); while (c && !(c.wpHostOk === true || c.wpSnapDead === true) && Date.now() - t0 < 3000) await new Promise(r => setTimeout(r, 1)); await new Promise(r => setImmediate(r)); };   // until the proof's verdict is in (WebCrypto, off the main thread)
        const idle = () => new Promise(r => setTimeout(r, 30));   // where nothing is to happen: long enough for a verdict that should not exist
        let seqH = 0;
        const hailOf = async (c, key) => { const peer = 'pat-h' + (seqH++), jn = await join(A, peer, { id: 'u_pat', name: 'Pat' }, c.wpCn, key === undefined ? s1.key : key); return { hail: hails(A, peer)[0] || { type: 'gmhello' }, snap: jn.snap }; };   // the real GM's early proof and snapshot for this connection's nonce
        const fresh = o => mkClient(Object.assign({ store: cloneStore(pat.store), code: 'C1C1' }, o || {}));
        const armed = P => P.c.timers.filter(t => t.on).map(t => t.ms), wait = (P, c) => { if (P.S.hostWait) P.S.hostWait(c); return c; };
        const o1 = fresh(), co1 = wait(o1, o1.connect({ peer: ROOM })), o1armed = armed(o1), o1held = o1.S.hostHeld ? o1.S.hostHeld(co1) : null, t01 = o1.c.timers[0];
        const g1 = await hailOf(co1), st1 = J(o1.store.m), o1r = o1.deliver(g1.hail, co1); await tickS(co1);
        const o1after = [co1.wpHostOk === true, armed(o1), J(o1.store.m) === st1, o1.c.toasts.length, o1.c.confirms.length, o1.c.status.length, co1.open, o1.c.next, o1.c.log.length];
        if (t01) t01.fn();                                                              // the clock's own word, were it still to come: nothing
        const nV1 = o1.c.verifies; o1.deliver(Object.assign({}, g1.hail, { sig: 'f'.repeat(128) }), co1); o1.deliver(g1.hail, co1); await idle();   // a second one and a third: not read — no signature is checked for them
        const o1second = [co1.open, co1.wpSnapDead === true, o1.c.next, nV1 > 0, o1.c.verifies - nV1];
        o1.deliver(g1.snap, co1); await o1.settle(co1); const o1snap = [o1.c.log.indexOf('snapshot') >= 0, o1.net.syncedPeer];
        const co1b = Object.assign(o1.connect({ peer: ROOM }), {}); o1.net.syncedPeer = ROOM; o1.deliver(Object.assign({}, g1.hail, { sig: 'f'.repeat(128) }), co1b); await idle();   // after a snapshot was taken: not read
        const o1post = [co1b.wpHailed === undefined, co1b.open];
        const o2 = fresh(), coB = wait(o2, o2.connect({ peer: ROOM })), g2 = await hailOf(coB);
        const stray2 = { peer: ROOM, open: true, wpCn: coB.wpCn, peerConnection: pcStub(FPP, FPH), close() { stray2.open = false; } };
        o2.deliver(Object.assign({}, g2.hail, { sig: 'f'.repeat(128) }), stray2); o2.deliver(g2.hail, stray2); await idle();
        const o2r = [stray2.wpHailed === undefined, stray2.open, coB.wpHostOk === undefined, coB.open, armed(o2)];
        const o3 = mkClient({ code: 'NEW9' }), co3 = wait(o3, o3.connect({ peer: 'waypoint-new9' })), sg3 = mkSigner();
        o3.deliver({ type: 'gmhello', gmId: 'u_new', gmPub: sg3.pub, sig: sg3.sign(hostText(co3.wpCn, 'waypoint-new9', 'u_new')) }, co3); await idle();
        const o3r = [armed(o3), Object.keys(o3.store.m).length, co3.wpHostOk === undefined, co3.open, o3.c.next, o3.c.toasts.length, o3.HC.gmPinFor('u_new')];
        chk('o', J(o1armed) === J([15000]) && !!o1held && o1held.gmId === 'u_gm' && J(o1held.pub) === J(s1.gmPub) && o1r === 'hail' && J(o1after) === J([true, [], true, 0, 0, 0, true, 0, 0]) && J(o1second) === J([true, false, 0, true, 0]) && J(o1snap) === J([true, ROOM]) && J(o1post) === J([true, true])
            && J(o2r) === J([true, true, true, true, [15000]]) && J(o3r) === J([[], 0, true, true, 0, 0, null]),
            J([o1armed, o1held, o1r, o1after, o1second, o1snap, o1post, o2r, o3r]));

        /* ---- (p) an automatic reconnect, under the GM this session took its table from ---- */
        const session = async o => { const P = fresh(o), c0 = P.connect({ peer: ROOM }); P.deliver((await hailOf(c0)).snap, c0); await P.settle(c0); return P; };   // a client whose session's table came from the GM
        const badOf = P => Object.keys(P.S.trust().bad || {});
        const idOfP = (code, g) => 'waypoint-' + code + (g ? '-r' + g : ''), gnrOf = (P, g) => (P.S.genNotRefused ? P.S.genNotRefused('c1c1', g, 4, idOfP) : -1);
        const rp = await session(), retry = (gen, tries) => { const c = rp.connect({ peer: ROOM + (gen ? '-r' + gen : ''), retry: true, before: { tries, gen: 0 } }); rp.reconn.tries = 0; rp.reconn.gen = gen; return wait(rp, c); };
        const pa = retry(1, 2), paArmed = armed(rp); rp.fire(5000);                                                           // (a) it stays silent
        const paR = [pa.open, pa.closedN, pa.wpSnapDead === true, [rp.reconn.tries, rp.reconn.gen], badOf(rp), rp.c.toasts.slice(), rp.c.confirms.length, rp.c.next, rp.c.status.length, rp.net.active, gnrOf(rp, 1)];
        const pb = retry(2, 3), pbWait = rp.deliver({ type: 'wait' }, pb); rp.fire(5000);                                     // (b) it says wait
        const pbR = [pbWait, pb.open, [rp.reconn.tries, rp.reconn.gen], badOf(rp).length, rp.c.toasts.length, rp.c.confirms.length, gnrOf(rp, 2)];
        const sgP = mkSigner(), pd = retry(3, 4); rp.deliver({ type: 'gmhello', gmId: 'u_gm', gmPub: sgP.pub, sig: sgP.sign(hostText(pd.wpCn, pd.peer, 'u_gm')) }, pd); await tickS(pd);   // (d) it proves itself as another GM: at once
        const pdR = [pd.open, armed(rp).length, [rp.reconn.tries, rp.reconn.gen], badOf(rp), rp.c.toasts.length, rp.c.toasts[1], rp.c.confirms.length, rp.c.next, gnrOf(rp, 3)];
        const again = async (mk, o, peer) => { const P = await session(o), c = wait(P, P.connect({ peer: peer || ROOM, retry: true, before: { tries: 1, gen: 0 } })), m = await mk(c); if (m) P.deliver(m, c); await tickS(c); return { P, c, v: [c.wpHostOk === true, c.open, c.wpSnapDead === true, P.c.toasts.length, P.c.confirms.length, armed(P).length, J(P.store.m) === J(pat.store.m)] }; };
        const pGood = await again(async c => (await hailOf(c)).hail); pGood.P.deliver({ type: 'wait' }, pGood.c); pGood.P.fire(); const pGoodLate = [pGood.c.open, pGood.c.wpSnapDead === true, pGood.P.c.toasts.length];
        const pBad = [
            await again(async c => ({ type: 'gmhello', gmId: 'u_else', gmPub: sgP.pub, sig: sgP.sign(hostText(c.wpCn, c.peer, 'u_else')) })),                    // another GM id, rightly signed by its own key
            await again(async c => (await hailOf({ wpCn: 'e'.repeat(32) })).hail),                                                                               // the GM's proof for another connection of the player
            await again(async c => (await hailOf(c)).hail, {}, ROOM + '-r2'),                                                                                    // the GM's proof for this nonce, shown at another room id
            await again(async c => { const g = await hailOf(c); return { type: 'gmhello', gmId: 'u_gm', gmPub: g.snap.gmPub, sig: g.snap.sig }; }),              // the snapshot's signature, shown as a proof
            await again(async () => ({ type: 'gmhello', gmId: 'u_gm' })),                                                                                         // no key at all
            await again(async () => ({ type: 'gmhello', gmId: { a: 1 }, gmPub: 'x', sig: 5 })),                                                                   // a malformed word
            await again(async c => (await hailOf(c)).hail, { bind: () => '|X|Y' })                                                                                // this connection reads another tie than the one signed
        ];
        const pSnap = await first({}, async c => { const g = await hailOf(c); return Object.assign({}, g.snap, { sig: g.hail.sig }); });   // and the other way about: a snapshot carrying the early proof's signature
        const crt = wait(rt, rt.connect({ peer: 'waypoint-rt01', retry: true, before: { tries: 1, gen: 0 } })), rtFree = [armed(rt).length, rt.S.hostHeld ? rt.S.hostHeld(crt) : 'none', rt.S.hostDoubted ? rt.S.hostDoubted(crt) : 'none', crt.open];
        const SAID_P = 'This table\u2019s GM is not the one you know from this room code \u2014 the GM may have reinstalled, or someone else is at that code. Still looking for your GM\u2026';
        const LATE_P = 'A table answered at this room code but did not show in time that it is your GM\u2019s. Still looking for your GM\u2026';
        const cBack = wait(rp, rp.connect({ peer: ROOM, retry: true, before: { tries: 5, gen: 0 } })), badWas = badOf(rp).length; rp.deliver((await hailOf(cBack)).snap, cBack); await rp.settle(cBack);   // the GM is found: that reconnect is over
        const backR = [badWas, rp.c.log[rp.c.log.length - 1], badOf(rp).length, gnrOf(rp, 3)];
        // the GM itself, slow once: passed over, not marked — and prompt on the next round, its proof and its table are taken
        const slw = await session(), sl1 = wait(slw, slw.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } })); slw.fire(5000);
        const slLate = [sl1.open, badOf(slw), gnrOf(slw, 0), [slw.reconn.tries, slw.reconn.gen], slw.c.toasts.slice()];
        const sl0 = wait(slw, slw.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } })); slw.fire(5000);   // and slow a second time: said once
        const sl2 = wait(slw, slw.connect({ peer: ROOM, retry: true, before: { tries: 5, gen: 0 } })), gSl = await hailOf(sl2); slw.deliver(gSl.hail, sl2); await tickS(sl2); slw.deliver(gSl.snap, sl2); await slw.settle(sl2);
        const slR = [sl0.open, slw.c.toasts.length, sl2.wpHostOk === true, sl2.open, slw.c.log[slw.c.log.length - 1], slw.net.syncedPeer, slw.c.confirms.length];
        // the clock starts once the hello has left this machine
        const sq1 = await session(), cs1 = sq1.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } }); cs1.dataChannel = { bufferedAmount: 90000 }; cs1.bufferSize = 0; wait(sq1, cs1);
        const sent0 = armed(sq1); sq1.fire(250); const sent1 = armed(sq1);
        cs1.dataChannel.bufferedAmount = 0; cs1.bufferSize = 3; sq1.fire(250); const sent2 = armed(sq1);   // the channel is empty, the library still holds pieces
        cs1.bufferSize = 0; sq1.fire(250); const sent3 = armed(sq1); sq1.fire(5000); const sent4 = [cs1.open, armed(sq1).length];
        const sq2 = await session(), cs2 = sq2.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } }); cs2.dataChannel = { bufferedAmount: 1 }; wait(sq2, cs2);   // a channel that never drains (the other side reads nothing)
        let looks = 0; while (J(armed(sq2)) === J([250]) && looks < 500) { sq2.fire(250); looks++; }
        const sentCap = [looks, armed(sq2)];
        const sq3 = await session(), cs3 = sq3.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } }); Object.defineProperty(cs3, 'dataChannel', { get() { throw new Error('gone'); } }); wait(sq3, cs3);
        const sq4 = await session(), cs4 = sq4.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } }); cs4.dataChannel = { bufferedAmount: 500 }; wait(sq4, cs4); const g4 = await hailOf(cs4); sq4.deliver(g4.hail, cs4); await tickS(cs4);   // the proof lands while the hello's tail is still leaving
        const sentOdd = [armed(sq3), cs4.wpHostOk === true, armed(sq4)];
        chk('p', rp.S.proofMs === 5000 && J(paArmed) === J([5000]) && J(paR) === J([false, 1, true, [2, 0], [], [LATE_P], 0, 0, 0, true, 1]) && J(pbR) === J(['read', false, [3, 0], 0, 1, 0, 2]) && J(pdR) === J([false, 0, [4, 0], [ROOM + '-r3'], 2, SAID_P, 0, 0, 0])
            && J(pGood.v) === J([true, true, false, 0, 0, 0, true]) && J(pGoodLate) === J([true, false, 0]) && pBad.length === 7 && pBad.every(x => J(x.v) === J([false, false, true, 1, 0, 0, true])) && pBad.every(x => x.P.c.toasts[0] === SAID_P) && refusedQuiet(pSnap) && J(rtFree) === J([0, null, false, true]) && J(backR) === J([1, 'snapshot', 0, 3])
            && J(slLate) === J([false, [], 0, [1, 0], [LATE_P]]) && J(slR) === J([false, 1, true, true, 'snapshot', ROOM, 0])
            && J(sent0) === J([250]) && J(sent1) === J([250]) && J(sent2) === J([250]) && J(sent3) === J([5000]) && J(sent4) === J([false, 0]) && J(sentCap) === J([60, [5000]]) && J(sentOdd) === J([[5000], true, []]),
            J([rp.S.proofMs, paArmed, paR, pbR, pdR, pGood.v, pGoodLate, pBad.map(x => x.v), [pSnap.r, pSnap.taken, pSnap.next, pSnap.asks, pSnap.offer], rtFree, backR, slLate, slR, sent0, sent1, sent2, sent3, sent4, sentCap, sentOdd]));

        /* ---- (q) a join the player began ---- */
        const LATE_Q = 'The table at this room code did not show in time that it is your GM\u2019s. It may only be slow \u2014 or someone else is at that code. Join again and wait for it as long as it takes? Your app still checks that it is your GM before you are joined.';
        const q1 = fresh(), cq1 = wait(q1, q1.connect({ peer: ROOM })); q1.deliver({ type: 'wait' }, cq1); q1.fire(15000);
        const q1r = [cq1.wpSnapDead === true, q1.c.next, q1.c.hb, q1.net.active, q1.c.status.slice(), q1.S.trust().refused, q1.c.confirms.length, q1.c.toasts.length, J(q1.store.m) === J(pat.store.m), badOf(q1).length];
        q1.S.snapAsk('C1C1', 'Pat'); q1.S.snapAsk('C1C1', 'Pat'); const askQ = q1.c.confirms.map(d => [d.t, !!d.opts && d.opts.noEnter === true && d.opts.noEscape === true]);
        if (q1.c.confirms[0]) q1.c.confirms[0].cb(true); q1.S.joinTrustReset();           // yes — and the join begins again, as joinSession begins it
        const cq1b = wait(q1, q1.connect({ peer: ROOM })), heldQ = q1.S.hostHeld ? q1.S.hostHeld(cq1b) : null, q1yes = [J(q1.c.joins), !!heldQ && heldQ.gmId === 'u_gm' && J(heldQ.pub) === J(s1.gmPub), armed(q1), q1.deliver({ type: 'wait' }, cq1b), q1.fire(), cq1b.open && cq1b.wpSnapDead !== true];   // held to the GM still, and no clock: its wait is waited on
        const q1n = q1.c.next, q1u = q1.deliver({ type: 'snapshot', gmId: 'u_gm', key: 'e'.repeat(32), appState: {} }, cq1b); await q1.settle(cq1b);   // after that yes, whoever answers shows an unsigned table under the GM's id
        const q1uns = [q1u, q1.c.log.indexOf('snapshot') >= 0, q1.net.syncedPeer, cq1b.wpSnapDead === true, q1.c.next - q1n, J(q1.HC.gmPinFor('u_gm')) === J(s1.gmPub), q1.HC.tableKeyFor('u_gm') === s1.key, q1.S.trust().refused, armed(q1).length];
        const qg = fresh(), cqg = wait(qg, qg.connect({ peer: ROOM })); qg.fire(15000); qg.S.snapAsk('C1C1', 'Pat'); if (qg.c.confirms[0]) qg.c.confirms[0].cb(true); qg.S.joinTrustReset();   // the same yes, and the GM itself answers the join that follows
        const cqg2 = wait(qg, qg.connect({ peer: ROOM })), gQ = await hailOf(cqg2); qg.deliver(gQ.hail, cqg2); await tickS(cqg2); const qgArm = armed(qg).length; qg.deliver(gQ.snap, cqg2); await qg.settle(cqg2);
        const qgR = [cqg2.wpHostOk === true, qgArm, qg.c.log.indexOf('snapshot') >= 0, qg.net.syncedPeer, qg.c.confirms.length, J(qg.HC.gmPinFor('u_gm')) === J(s1.gmPub), qg.S.trust().accept];
        const qs = fresh(), cqs = wait(qs, qs.connect({ peer: ROOM })); qs.fire(15000); qs.S.snapAsk('C1C1', 'Pat'); if (qs.c.confirms[0]) qs.c.confirms[0].cb(true); qs.S.joinTrustReset();   // that yes is for the join that follows, at that code: an automatic reconnect, and a join at another code this app knows the GM of, keep their five seconds
        const cqs2 = wait(qs, qs.connect({ peer: ROOM, retry: true, before: { tries: 1, gen: 0 } })), qsRetry = armed(qs); qs.HC.rememberGmRoom(qs.HC.roomCodeOf('ZZ99'), 'u_gm'); qs.net.code = 'ZZ99'; const cqs3 = wait(qs, qs.connect({ peer: 'waypoint-zz99' })), qsR = [qsRetry, armed(qs), !!cqs2 && !!cqs3];
        const mal2 = mkSigner(), malHail = (c, signer) => ({ type: 'gmhello', gmId: 'u_gm', gmPub: (signer || mal2).pub, sig: (signer || mal2).sign(hostText(c.wpCn, c.peer, 'u_gm')) });
        // which refusal the ONE question is about: late then shown (with something to say yes to), shown then late, late then shown with nothing to offer
        const qo1 = fresh(), qa1 = wait(qo1, qo1.connect({ peer: ROOM })); qo1.fire(15000); const qb1 = wait(qo1, qo1.connect({ peer: ROOM + '-r1' })); qo1.deliver(malHail(qb1), qb1); await tickS(qb1);
        const qo2 = fresh(), qa2 = wait(qo2, qo2.connect({ peer: ROOM })); qo2.deliver(malHail(qa2), qa2); await tickS(qa2); wait(qo2, qo2.connect({ peer: ROOM + '-r1' })); qo2.fire(15000);
        const qo3 = fresh(), qa3 = wait(qo3, qo3.connect({ peer: ROOM })); qo3.fire(15000); const qb3 = wait(qo3, qo3.connect({ peer: ROOM + '-r1' })); qo3.deliver({ type: 'gmhello', gmId: 'u_gm', gmPub: s1.gmPub, sig: 'f'.repeat(128) }, qb3); await tickS(qb3);
        const qOrder = [qo1.S.trust().refused, qo2.S.trust().refused, qo3.S.trust().refused, qb3.wpSnapDead === true];
        const q2 = fresh(), cq2 = wait(q2, q2.connect({ peer: ROOM })); q2.deliver(malHail(cq2), cq2); await tickS(cq2);
        const q2r = [cq2.wpSnapDead === true, q2.c.next, armed(q2).length, q2.S.trust().refused, q2.c.confirms.length, J(q2.store.m) === J(pat.store.m)];
        q2.S.snapAsk('C1C1', 'Pat'); const askQ2 = q2.c.confirms.map(d => d.t); if (q2.c.confirms[0]) q2.c.confirms[0].cb(true); q2.S.joinTrustReset();
        const cq2b = wait(q2, q2.connect({ peer: ROOM })), q2held = q2.S.hostHeld ? q2.S.hostHeld(cq2b) : null, q2armed = armed(q2);
        q2.deliver(malHail(cq2b), cq2b); await tickS(cq2b);
        const q2ok = [cq2b.wpHostOk === true, cq2b.open, armed(q2).length, J(q2.HC.gmPinFor('u_gm')) === J(s1.gmPub), q2.c.next];
        const q3 = fresh(), cq3 = wait(q3, q3.connect({ peer: ROOM })); q3.deliver(malHail(cq3), cq3); await tickS(cq3); q3.S.snapAsk('C1C1', 'Pat'); if (q3.c.confirms[0]) q3.c.confirms[0].cb(true); q3.S.joinTrustReset();
        const cq3b = wait(q3, q3.connect({ peer: ROOM })); q3.deliver(malHail(cq3b, mkSigner()), cq3b); await tickS(cq3b);   // after the yes, a third key answers under that name
        const q3r = [cq3b.wpHostOk === true, cq3b.wpSnapDead === true, q3.c.next];
        const q4 = fresh({ code: 'NEW1' }), cq4 = wait(q4, q4.connect({ peer: 'waypoint-new1' })), q4armed = armed(q4).length;
        q4.deliver(malHail(cq4), cq4); await tickS(cq4); const q4r = [q4armed, cq4.wpSnapDead === true, q4.c.next, q4.S.trust().refused];
        const LATE_RF = { gmId: 'u_gm', offer: null, late: true };
        chk('q', J(q1r) === J([true, 1, 1, false, ['Looking for your GM at this room code\u2026'], LATE_RF, 0, 0, true, 0]) && J(askQ) === J([[LATE_Q, true]]) && q1.S.words.lateAsk === LATE_Q && q1.S.words.ask !== LATE_Q && J(q1yes) === J([J([['C1C1', 'Pat']]), true, [], 'read', 0, true])
            && J(q1uns) === J(['judging', false, null, true, 1, true, true, { gmId: 'u_gm', offer: { pub: null } }, 0]) && J(qgR) === J([true, 0, true, ROOM, 1, true, null]) && J(qsR) === J([[5000], [5000, 15000], true])
            && J(qOrder) === J([{ gmId: 'u_gm', offer: { pub: mal2.pub } }, { gmId: 'u_gm', offer: { pub: mal2.pub } }, LATE_RF, true])
            && J(q2r) === J([true, 1, 0, { gmId: 'u_gm', offer: { pub: mal2.pub } }, 0, true]) && J(askQ2) === J([q2.S.words.ask]) && !!q2held && q2held.gmId === 'u_gm' && J(q2held.pub) === J(mal2.pub) && J(q2armed) === J([15000]) && J(q2ok) === J([true, true, 0, true, 1])
            && J(q3r) === J([false, true, 2]) && J(q4r) === J([0, true, 1, { gmId: 'u_gm', offer: { pub: mal2.pub } }]),
            J([q1r, askQ, q1yes, q1uns, qgR, qsR, qOrder, q2r, askQ2, q2held, q2armed, q2ok, q3r, q4r]));

        /* ---- (t) only a table taken ends a reconnect: the close handler, run for real as a player's app ---- */
        const clS = tb('connclose');
        const closeOf = (over, gone) => {
            const calls = { sched: 0, gone: 0 }, conn = Object.assign({ peer: ROOM, open: false }, over);
            const env = { net: { role: 'client', active: true, conns: over.stale ? [{ peer: ROOM + '-r1', open: true }, conn] : [conn], roster: Object.create(null), targets: {}, applyingRemote: false, leaving: false, code: 'c1c1', peer: {} }, assetInflight: {}, assetRefs: {}, assetBytes: {}, diceLimit: null, charLimit: null, _lim: {}, _connMeta: {}, lastSeen: {},
                sensesForget() {}, fogDragSweep() {}, fogForgetConn() {}, videoHang() {}, videoTold() {}, videoOver() {}, renderRoster() {}, toast() {}, getActiveCampaign: () => null, logEvent() {}, startWaitGrace() {}, render() {}, broadcastTargets() {}, save() {}, broadcastRoster() {},
                cancelReconnect() {}, setPausedLocal() {}, stopHeartbeat() {}, setIndicator() {}, load() {}, reconn: { tries: 0, gen: 2, code: null, name: null }, scheduleReconnect() { calls.sched++; }, getProfile: () => ({ name: 'Me' }), window: {}, hostGone: () => { calls.gone++; return !!gone; } };
            const names = Object.keys(env); let threw = '';
            try { new Function('conn', ...names, clS)(conn, ...names.map(n => env[n])); } catch (e) { threw = String(e && e.message); }
            return [threw, env.reconn.tries, env.reconn.gen, calls.sched, calls.gone, env.reconn.code, env.net.conns.length];
        };
        const tClose = clS ? [
            closeOf({ wpRetry: true, wpBefore: { tries: 7, gen: 1 } }),                       // a reconnect's connection, closed before any proof: back where it stood
            closeOf({ wpRetry: true, wpBefore: { tries: 7, gen: 1 }, wpHostOk: true }),       // its host had proven itself (or its table was taken): a dropped connection as before
            closeOf({ wpRetry: false, wpBefore: null }, true),                                // a join the player began, held and unproven: passed over, no reconnect
            closeOf({ wpRetry: false, wpBefore: null }, false),                               // nothing held: a dropped connection as before
            closeOf({ wpRetry: false, wpBefore: null, wpHostOk: true }, true),                // proven: hostGone is not even asked
            closeOf({ wpRetry: true, wpBefore: { tries: 7, gen: 1 }, stale: true }),          // a connection a later dial has replaced: nothing is put back
            closeOf({ wpRetry: false, wpBefore: null, stale: true }, true)                    // nor passed over
        ] : null;
        const goneOf = (o, pre) => { const P = fresh(o && o.fresh), c = P.connect(Object.assign({ peer: ROOM }, o && o.conn)); P.net.peer = {}; if (pre) pre(P, c); c.open = false; P.net.conns = []; const r = P.S.hostGone ? P.S.hostGone(c) : 'none'; return [r, P.c.next, P.S.trust().refused, P.net.active, c.wpSnapDead === true, P.c.toasts.length, P.c.confirms.length, badOf(P).length]; };
        const tGone = [
            goneOf(),                                                                          // held by the pin, unproven
            goneOf({ fresh: { code: 'NEW2' }, conn: { peer: 'waypoint-new2' } }),              // nothing known at this code
            goneOf({ conn: { retry: true, before: { tries: 1, gen: 0 } } }),                   // a reconnect's connection: the close handler's own business
            goneOf(null, (P, c) => { c.wpHostOk = true; }),                                    // proven
            goneOf(null, P => { P.net.syncedPeer = ROOM; }),                                   // a table already synced
            goneOf(null, P => { P.net.peer = null; })                                          // the join already torn down (a new join began)
        ];
        chk('t', !!tClose && J(tClose) === J([['', 7, 1, 1, 0, 'c1c1', 0], ['', 0, 2, 1, 0, 'c1c1', 0], ['', 0, 2, 0, 1, null, 0], ['', 0, 2, 1, 1, 'c1c1', 0], ['', 0, 2, 1, 0, 'c1c1', 0], ['', 0, 2, 1, 0, 'c1c1', 1], ['', 0, 2, 1, 0, 'c1c1', 1]])
            && J(tGone) === J([[true, 1, LATE_RF, false, true, 0, 0, 0], [false, 0, null, true, false, 0, 0, 0], [false, 0, null, true, false, 0, 0, 0], [false, 0, null, true, false, 0, 0, 0], [false, 0, null, true, false, 0, 0, 0], [false, 0, null, true, false, 0, 0, 0]]),
            J([tClose, tGone]));

        /* ---- (r) a refusal, or an end, with no proof ---- */
        const dz = async o => {
            const P = o.began ? fresh() : await session(), c = wait(P, P.connect(o.began ? { peer: ROOM } : { peer: ROOM, retry: true, before: { tries: 3, gen: 2 } })); P.reconn.tries = 0; P.reconn.gen = 1;
            if (o.proven) { P.deliver((await hailOf(c)).hail, c); await tickS(c); }
            P.net.leaving = !!o.leaving;
            const d = P.S.hostDoubted ? P.S.hostDoubted(o.other ? { peer: 'x', open: true, wpRetry: true, close() {} } : c) : 'none';
            return [d, c.open, c.wpSnapDead === true, [P.reconn.tries, P.reconn.gen], badOf(P).length, P.c.toasts.length, P.c.status.length, P.c.confirms.length, armed(P).length, P.net.leaving, P.net.active];
        };
        const rUn = await dz({}), rProven = await dz({ proven: true }), rBegan = await dz({ began: true }), rOther = await dz({ other: true }), rLeaving = await dz({ leaving: true });
        chk('r', J(rUn) === J([true, false, true, [3, 2], 0, 0, 0, 0, 0, false, true]) && J(rProven) === J([false, true, false, [0, 1], 0, 0, 0, 0, 0, false, true]) && J(rBegan) === J([false, true, false, [0, 1], 0, 0, 0, 0, 1, false, true])
            && J(rOther) === J([false, true, false, [0, 1], 0, 0, 0, 0, 1, false, true]) && J(rLeaving) === J([false, true, false, [0, 1], 0, 0, 0, 0, 1, true, true]) && rtFree[2] === false,
            J([rUn, rProven, rBegan, rOther, rLeaving]));

        /* ---- (s) wired ---- */
        const wiredH = [
            /if \(!pwSat && !cm\.hailed && validCn\(msg\.cn\)\) \{ cm\.hailed = true; cm\.hail = gmHail\(cm, msg\.cn, conn\); \}[^\n]*\n\s*if \(!pwSat && !cm\.signed && validCn\(msg\.cn\)\) cm\.signed = gmPresign\(/.test(gateSrc),   /* 1.6.3 (a password set mid-session), moved on purpose */
            /gmSignHex\(k\.priv, hostData\(cn, room, gm, bind\)\)/.test(gmSrc) && /conn\.send\(\{ type: 'gmhello', gmId: gm, gmPub: \{ kty: 'EC', crv: 'P-256', x: k\.pub\.x, y: k\.pub\.y \}, sig: s \}\);/.test(gmSrc) && nCalls(gmSrc, /type: 'gmhello'/g) === 1 && /if \(!s \|\| net\.role !== 'host' \|\| !conn\.open \|\| _connMeta\[conn\.peer\] !== cm\) return;/.test(gmSrc),
            /\} else if \(msg\.type === 'gmhello' && net\.role === 'client'\) \{\n\s*hostHail\(msg, conn\);/.test(src),
            /&& net\.role === 'client'\) \{\n\s*if \(hostDoubted\(conn\)\) return;[^\n]*\n\s*\/\/ \[netcheck:denied-start\]/.test(src) && /\} else if \(msg\.type === 'end' && net\.role === 'client'\) \{\n\s*if \(hostDoubted\(conn\)\) return;[^\n]*\n\s*\/\/ \[netcheck:end-start\]/.test(src),
            /cn: conn\.wpCn \}\);[^\n]*\n\s*hostWait\(conn\);[^\n]*\n\s*startHeartbeat\(\);/.test(src),
            /if \(!net\.conns\[0\] \|\| conn !== net\.conns\[0\] \|\| conn\.wpSnapWait\) return false;\n\s*hostWaitEnd\(conn\);/.test(stSrc) && /hostWaitEnd\(conn\); conn\.wpSnapDead = true; _joinTrust\.bad\[String\(conn\.peer\)\] = true;/.test(stSrc),
            nCalls(stSrc, /hostKnown\(/g) === 4 && nCalls(stSrc, /hostRuling\(/g) === 3 && nCalls(stSrc, /gmVerify\(/g) === 2 && nCalls(src, /gmVerify\(/g) === 3 && /var HOST_PROOF_MS = 5000, HOST_JOIN_MS = 15000, HOST_SENT_MS = 250, HOST_SENT_LOOKS = 60;/.test(stSrc) && /conn\.wpRetry === true \? HOST_PROOF_MS : HOST_JOIN_MS/.test(stSrc),
            /<li>It proves itself to a returning player&rsquo;s app as soon as that app says hello, before you let anyone in\. So their app does not sit waiting on someone else who answers at your code\.<\/li>/.test(htmlS) && /<li><b>Your GM, and no one else:<\/b>[\s\S]{0,800}?<li>Your GM&rsquo;s app proves itself within a few seconds of your hello\.[^\n]*<\/li>/.test(htmlS)
        ];
        chk('s', wiredH.every(Boolean), J(wiredH));

        /* ---- (u) wired: this round ---- */
        const snapBr = src.slice(src.indexOf("} else if (msg.type === 'snapshot' && net.role === 'client') {"), src.indexOf("} else if (msg.type === 'item') {")), admU = fnSrc('function admitPlayer(', '\n}\n', 'admitPlayer');
        const wiredU = [
            /\} else if \(net\.active && net\.code\) \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(conn\.wpHostOk !== true && cur\) \{\n\s*if \(conn\.wpBefore\) \{ reconn\.tries = conn\.wpBefore\.tries; reconn\.gen = conn\.wpBefore\.gen; \}\n\s*else if \(hostGone\(conn\)\) return;\n\s*\}\n(?:\s*\/\/[^\n]*\n)*\s*reconn\.code = net\.code;/.test(clS) && /\/\/ \[netcheck:connclose-start\]\n\s*var cur = net\.conns\[0\] === conn;[^\n]*\n\s*net\.conns = net\.conns\.filter\(/.test(src),
            /var h = hostHeld\(conn\); if \(!h\) return;\n\s*hostSlow\(conn, h\.gmId\);/.test(stSrc) && nCalls(stSrc, /snapRefuse\(/g) === 3 && nCalls(stSrc, /hostSlow\(/g) === 3,
            nCalls(src, /Reconnected/g) === 1 && /var backS = conn\.wpRetry === true && !conn\.wpBackSaid; conn\.wpBackSaid = true;\n\s*toast\(backS \? 'Reconnected [^']*' : webJ \? 'Campaign synced from host\.' : 'Campaign synced from host\. Your own campaigns come back when you leave\.'\);/.test(snapBr) && /setStatus\(webJ \? 'Connected\. You are at the GM[^']*s table\.' : 'Connected [^']* Your own campaigns are untouched and come back when you leave the session\.'\);/.test(snapBr) && nCalls(snapBr, /toast\(/g) === 1 && !/if \(wasRetry\) toast\(/.test(src),
            /if \(rfJ\) setStatus\(rfJ\.late \? HOST_LATE \+ ' You have not joined\.' : SNAP_REFUSED \+ ' You have not joined\.'/.test(src),
            /if \(!conn\.open\) return;\n\s*if \(typeof net\.syncMapStubs === 'function'\) net\.syncMapStubs\(\);/.test(admU) && admU.indexOf('net.syncMapStubs()') < admU.indexOf('net.roster[conn.peer] = prof') && nCalls(admU, /syncMapStubs\(\)/g) === 1,
            /<li><b>Your GM, and no one else:<\/b>[\s\S]{0,1200}?<li>If no table there shows in time that it is your GM&rsquo;s, you are asked whether to join again and wait for it\. It may only be slow\.<\/li>\s*<li>Your app still checks that it is your GM before you are joined\.<\/li>/.test(htmlS)
        ];
        chk('u', wiredU.every(Boolean), J(wiredU));
    } catch (e) { Object.keys(T).forEach(k => { if (!done.has(k)) check(T[k], false, 'threw: ' + (e && e.stack || e)); }); }
})());
    /* ---- 1.5.6: Merge into… in Player History (mergeRecords, run for real) ---- */
    {
        const apM = src.slice(src.indexOf('// [netcheck:approval-start]'), src.indexOf('// [netcheck:approval-end]'));
        const MR = new Function('own', 'validProfileId', 'net', 'showConfirm', 'admitPlayer', 'toast', 'getActiveCampaign', 'pendingJoins', 'approvalOpen', 'bannedIds', 'denyJoin', apM + '\nreturn mergeRecords;')(H.own, H.validProfileId, {}, () => {}, () => {}, () => {}, () => null, [], false, {}, () => {});
        const mk = () => ({ players: { u_app: { name: 'Kael (app)', key: 'K_OLD', charId: 'c_1', charName: 'Kael', lastMap: 'm2', firstSeen: 100, lastSeen: 500, joinCount: 7 }, u_web: { name: 'Kael (web)', key: 'K_WEB', firstSeen: 900, lastSeen: 950, joinCount: 1 }, u_o: { name: 'Other' } },
            chars: { c_1: { id: 'c_1', ownerId: 'u_app' }, c_2: { id: 'c_2', ownerId: 'u_o' } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', ownerId: 'u_app' }, { id: 't2', ownerId: 'u_web', waiting: true }] }, m2: { id: 'm2', type: 'map', whiteboard: [{ id: 't3', ownerId: 'u_app' }] } } });
        const c = mk(), ok = MR(c, 'u_app', 'u_web'), k = c.players.u_web;
        const bad = [MR(mk(), 'u_app', 'u_app'), MR(mk(), 'u_none', 'u_web'), MR(mk(), 'u_app', 'u_none'), MR(null, 'u_app', 'u_web')];
        const flat = src.split('\r\n').join('\n');
        check('1.5.6 Merge into… in Player History (mergeRecords run for real): the kept record keeps its own name and table key, takes the other\'s character binding and last map, the earlier first time seen, the later last time and both join counts, and notes the old id as was; every character and token the other owned becomes the kept one\'s on every map; the other record goes; nothing happens for one record, a record that is not there or no campaign; the button shows only for a player not at the table with another known player to merge into, and its ask is buttons only, one player at a time',
            ok && !c.players.u_app && k.name === 'Kael (web)' && k.key === 'K_WEB' && k.charId === 'c_1' && k.charName === 'Kael' && k.lastMap === 'm2' && k.firstSeen === 100 && k.lastSeen === 950 && k.joinCount === 8 && JSON.stringify(k.was) === '["u_app"]'
            && c.chars.c_1.ownerId === 'u_web' && c.chars.c_2.ownerId === 'u_o' && c.items.m1.whiteboard[0].ownerId === 'u_web' && c.items.m2.whiteboard[0].ownerId === 'u_web' && c.items.m1.whiteboard[1].ownerId === 'u_web' && bad.every(b => b === false)
            && flat.includes("(!online[pid] && ids.some(function(o) { return o !== pid && !online[o]; }) ? '<button class=\"tool ghost player-act\" data-merge=\"' + escTextRoster(pid) + '\"")
            && flat.includes("}, { noEnter: true, noEscape: true, yes: 'Merge', body: pk ? pk.el : undefined, ready: pk ? pk.ready : undefined });") && flat.includes("var pk = typeof playerPick === 'function' ? playerPick(camp, cands, 'Merge into', { name: camp.players[oldId].name, from: oldId }) : null;") && flat.includes("    } else if (btn.dataset.merge) {\n        mergeAsk(camp, btn.dataset.merge);"), JSON.stringify([ok, c.players, bad]));
    }
    /* ---- 1.5.6, backlog 185: "Same person as…" at the GM's Let them in? (the approval slice, run for real) ---- */
    {
        const apS = src.slice(src.indexOf('// [netcheck:approval-start]'), src.indexOf('// [netcheck:approval-end]'));
        const mkCamp = () => ({ id: 'k', players: { u_a: { name: 'Ana', lastSeen: 1, key: 'K_A', charId: 'c_1', lastMap: 'm1' }, u_b: { name: 'Bo', lastSeen: 5 }, u_c: { name: 'Cy', lastSeen: 9 }, u_ban: { name: 'Ban', lastSeen: 7 }, 'tk:x': { name: 'X' } }, bannedPlayers: { u_ban: true },
            chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_a' }, c_2: { id: 'c_2', name: 'Bo2', ownerId: 'u_b' } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', ownerId: 'u_a' }, { id: 't2', ownerId: 'u_b' }] }, m2: { id: 'm2', type: 'map', whiteboard: [{ id: 't3', ownerId: 'u_a', waiting: true }] }, d1: { id: 'd1', type: 'doc' } } });
        const run = (answers, opts) => {
            const camp = mkCamp(), asks = [], admitted = [], toasts = [], conn = { open: true }, ans = answers.slice();
            const env = { approvalOpen: false, pendingJoins: [{ conn, prof: { id: 'u_new', name: 'Web' } }], bannedIds: {}, net: { active: true, role: 'host', roster: { pC: { id: 'u_c' } } },
                getActiveCampaign: () => camp, denyJoin: () => {}, own: H.own, validProfileId: H.validProfileId, admitPlayer: (c, p) => admitted.push(p.id), toast: s => toasts.push(s), logEvent: () => {},
                SC: () => ({ playsAs: (cp, pid) => (pid === 'u_a' ? 'Kael' : '') }),
                document: { createElement: tag => ({ tagName: tag, children: [], className: '', textContent: '', value: '', checked: false, ls: {}, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); return c; }, get firstChild() { return this.children[0] || null; }, addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); } }), createTextNode: t => ({ textContent: String(t), children: [] }) },
                showConfirm: (text, cb, o) => { asks.push({ text, o: o || {} }); if (opts && opts.dropAt === asks.length) conn.open = false; let a = ans.shift(); if (a && typeof a === 'object') { const s = o.body.children[1]; s.value = a.pick; (s.ls.change || []).forEach(f => f()); a = true; } cb(a === undefined ? false : a); } };
            if (opts && opts.noOthers) camp.players = { u_c: { name: 'Cy' } };
            const names = Object.keys(env);
            let threw = ''; try { new Function(...names, apS + '\nprocessNextApproval();\nreturn { sameCandidates, takeOver };')(...names.map(n => env[n])); } catch (e) { threw = String(e && e.message); }
            return { camp, asks, admitted, toasts, threw };
        };
        const A = run(['alt', { pick: 'u_a' }]);   // Same person as…, Ana picked from the list (1.5.7: one list, not one question a player)
        const B = run(['alt', false, true]);   // Same person as…, Cancel at the list: the first question again, then plain Let them in
        const C = run(['alt', { pick: 'u_a' }], { dropAt: 2 });   // the connection drops while the list is up
        const D = run([true], { noOthers: true });   // nobody to be: no third button
        const E = run(['alt', { pick: 'u_c' }, true]);   // a pick that was never offered (a player at the table): the first question again, then let in as new
        const fns = new Function(...['net', 'own', 'validProfileId', 'showConfirm', 'admitPlayer', 'toast', 'getActiveCampaign', 'pendingJoins', 'approvalOpen', 'bannedIds', 'denyJoin'], apS + '\nreturn { sameCandidates, takeOver };')({}, H.own, H.validProfileId, () => {}, () => {}, () => {}, () => null, [], false, {}, () => {});
        const cs = mkCamp(), cand = fns.sameCandidates(cs, 'u_new', { pC: { id: 'u_c' } }), tc = mkCamp(), took = fns.takeOver(tc, 'u_a', 'u_new'), bad = [fns.takeOver(mkCamp(), 'u_zz', 'u_new'), fns.takeOver(mkCamp(), 'u_a', 'u_a'), fns.takeOver(mkCamp(), 'u_a', 'bad id!')];
        const J2 = JSON.stringify;
        check('1.5.6 "Same person as…" (backlog 185; processNextApproval, sameCandidates and takeOver run for real): the GM\'s Let them in? offers a third answer only where the campaign knows a player who is not at the table, listed one at a time, most recently seen first, never one at the table, a banned one, the newcomer or a GM character\'s key; Not them goes on, past the last back to the first question, Cancel back to it; a yes gives the newcomer the old player\'s record (no table key, the old id kept as was) and every character and token they own on every map, then lets them in; a connection gone by then is let in as nobody and nothing moves; with nobody to be, the question is as before',
            [A, B, C, D, E].every(r => r.threw === '') && J2(cand) === J2(['u_b', 'u_a'])
            && took && !tc.players.u_a && J2(tc.players.u_new.was) === J2(['u_a']) && tc.players.u_new.key === undefined && tc.players.u_new.charId === 'c_1' && tc.players.u_new.lastMap === 'm1' && tc.chars.c_1.ownerId === 'u_new' && tc.chars.c_2.ownerId === 'u_b'
            && tc.items.m1.whiteboard[0].ownerId === 'u_new' && tc.items.m1.whiteboard[1].ownerId === 'u_b' && tc.items.m2.whiteboard[0].ownerId === 'u_new' && bad.every(b => b === false)
            && A.asks.length === 2 && A.asks[0].o.alt === 'Same person as…' && /Who is "Web"/.test(A.asks[1].text) && A.asks[1].o.yes === 'Yes, the same' && A.asks[1].o.alt === undefined && A.asks.every(a => a.o.noEnter === true && a.o.noEscape === true)
            && A.asks[1].o.body.className === 'player-pick' && J2(A.asks[1].o.body.children[1].children.map(c => c.value)) === J2(['', 'u_b', 'u_a']) && J2(A.asks[1].o.body.children[1].children.map(c => c.textContent)) === J2(['Pick a player\u2026', 'Bo', 'Ana, plays Kael'])
            && J2(A.admitted) === J2(['u_new']) && J2(A.camp.players.u_new.was) === J2(['u_a']) && A.camp.chars.c_1.ownerId === 'u_new' && /takes over from Ana, playing Kael/.test(A.toasts.join())
            && B.asks.length === 3 && /wants to join/.test(B.asks[2].text) && J2(B.admitted) === J2(['u_new']) && !B.camp.players.u_new && B.camp.players.u_a.key === 'K_A'
            && C.admitted.length === 0 && C.camp.players.u_a && !C.camp.players.u_new && /already dropped/.test(C.toasts.join())
            && D.asks.length === 1 && D.asks[0].o.alt === undefined && J2(D.admitted) === J2(['u_new'])
            && E.asks.length === 3 && /wants to join/.test(E.asks[2].text) && J2(E.admitted) === J2(['u_new']) && !E.camp.players.u_new && E.camp.players.u_c, J2([cand, A.asks.map(a => a.text.slice(0, 60)), A.admitted, A.toasts, B.asks.length, C.toasts, D.asks.length, E.asks.length, [A, B, C, D, E].map(r => r.threw)]));
    }
    /* ---- 1.6.0: a hand-over moves only what the GM leaves ticked (found at the owner's table: a "Same person as…" opened on the wrong player and moved every character, with no list) ---- */
    {
        const apS = src.slice(src.indexOf('// [netcheck:approval-start]'), src.indexOf('// [netcheck:approval-end]')), J2 = JSON.stringify;
        // a page of plain objects: elements and text nodes alone, markup refused, a change heard by its listeners
        const fakeDoc = () => { const mk = tag => { const n = { tagName: tag, nodeType: 1, children: [], className: '', textContent: '', value: '', checked: false, disabled: false, type: '', ls: {}, parentNode: null,
                appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
                get firstChild() { return this.children[0] || null; }, addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }, fire(t) { (this.ls[t] || []).forEach(f => f({ target: this })); } };
                Object.defineProperty(n, 'innerHTML', { set() { throw new Error('markup'); } }); return n; };
            return { createElement: mk, createTextNode: t => ({ nodeType: 3, textContent: String(t), children: [] }) }; };
        const mk16 = () => ({ id: 'k', players: {
                u_rin: { name: 'Rin', lastSeen: 50, key: 'K_R', charId: 'c_r1', charName: 'Rook', firstSeen: 10, joinCount: 3, was: 'u_rin_old' },
                u_tam: { name: 'Tam', lastSeen: 90, key: 'K_T', charId: 'c_t1', charName: 'Wisp', firstSeen: 20, joinCount: 5, was: ['u_tam_a'] },
                u_rin2: { name: ' rIN ', lastSeen: 20 } },
            chars: { c_r1: { id: 'c_r1', name: 'Rook', ownerId: 'u_rin' }, c_r2: { id: 'c_r2', name: 'Moss', ownerId: 'u_rin' }, c_t1: { id: 'c_t1', name: 'Wisp', ownerId: 'u_tam' } },
            items: { m1: { id: 'm1', type: 'map', meta: { title: 'Harbor' }, whiteboard: [{ id: 't_r1', ownerId: 'u_rin', charId: 'c_r1', charName: 'Rook' }, { id: 't_r2', ownerId: 'u_rin', charId: 'c_r2', charName: 'Moss' }, { id: 't_rx', ownerId: 'u_rin', name: 'Crate' }, { id: 't_t1', ownerId: 'u_tam', charId: 'c_t1', charName: 'Wisp' }] },
                m2: { id: 'm2', type: 'map', meta: { title: 'Tower' }, whiteboard: [{ id: 't_r2b', ownerId: 'u_rin', charId: 'c_r2', charName: 'Moss' }] }, d1: { id: 'd1', type: 'doc' } } });
        const names = ['net', 'own', 'validProfileId', 'showConfirm', 'admitPlayer', 'toast', 'getActiveCampaign', 'pendingJoins', 'approvalOpen', 'bannedIds', 'denyJoin', 'logEvent', 'SC', 'document', 'window'];
        const run = (o) => {
            const camp = (o.camp || mk16)(), asks = [], admitted = [], toasts = [], logs = [], steps = [], conn = { open: true }, ans = o.answers.slice();
            const env = { net: { active: true, role: 'host', roster: {} }, own: H.own, validProfileId: H.validProfileId, admitPlayer: (c, p) => admitted.push(p.id), toast: s => toasts.push(s), getActiveCampaign: () => camp,
                pendingJoins: [{ conn, prof: { id: 'u_new', name: o.name } }], approvalOpen: false, bannedIds: {}, denyJoin: () => {}, logEvent: (k, t) => logs.push([k, t]), SC: () => ({ playsAs: (cp, pid) => (pid === 'u_rin' ? 'Rook' : '') }),
                document: fakeDoc(), window: { wpStepLog: (a, s, f) => steps.push([a, s, f]) },
                showConfirm: (text, cb, op) => { const q = { text, o: op || {}, ready: op && op.ready ? op.ready() : null }; asks.push(q);
                    let a = ans.shift();
                    if (a && typeof a === 'object') { const s = op.body.children[1]; if (a.pick !== undefined) { s.value = a.pick; s.fire('change'); } q.picked = s.value; q.rows = rowsOf(op.body);
                        (a.untick || []).forEach(t => { const r = op.body.children[2].children.find(x => x.children.length && x.children[1].textContent === t); r.children[0].checked = false; r.children[0].fire('change'); });
                        q.after = rowsOf(op.body); q.readyAt = op.ready ? op.ready() : null; a = true; }
                    cb(a === undefined ? false : a); } };
            let threw = ''; try { new Function(...names, apS + '\nprocessNextApproval();')(...names.map(n => env[n])); } catch (e) { threw = String(e && e.stack || e); }
            return { camp, asks, admitted, toasts, logs, steps, threw };
        };
        const rowsOf = body => body.children[2].children.map(r => r.children.length ? [r.className, r.children[0].checked, r.children[0].disabled, r.children[1].textContent] : r.textContent);
        // the join: Rin's new profile is asked about; the list opens on Rin (ignoring case and outer spaces, the most recently seen of two), Moss unticked
        const A = run({ name: '  rin', answers: ['alt', { untick: ['Moss'] }] });
        // a name the table does not know: the list opens on no one, Yes is not ready, and a Yes there moves nothing and asks the first question again
        const B = run({ name: 'Quill', answers: ['alt', {}, true] });
        // the same name, nothing changed: all ticked, everything moves and the old record goes, its older one-id was kept first
        const C = run({ name: 'Rin', answers: ['alt', { pick: 'u_rin' }] });
        // the list is drawn again when the pick changes
        const D = run({ name: 'Rin', answers: ['alt', { pick: 'u_tam' }] });
        const fns = new Function(...names, apS + '\nreturn { playerPick, takeOver, mergeRecords, wasList, ownedOf };')(...names.map(n => ({ own: H.own, validProfileId: H.validProfileId, document: fakeDoc(), net: {} })[n]));
        // Merge into…, from Player History's ask: Rin folded into Tam with Moss unticked; Moss and its tokens keep their owner, and Rin's record stays with them
        const cm = mk16(), pkM = fns.playerPick(cm, ['u_tam', 'u_rin2'], 'Merge into', { name: 'Rin', from: 'u_rin' }), mDef = pkM.pick();
        pkM.el.children[1].value = 'u_tam'; pkM.el.children[1].fire('change');
        const mossRow = pkM.el.children[2].children.find(r => r.children.length && r.children[1].textContent === 'Moss'); mossRow.children[0].checked = false; mossRow.children[0].fire('change');
        const mRows = rowsOf(pkM.el), mv = fns.mergeRecords(cm, 'u_rin', pkM.pick(), pkM.moves());
        // the same with everything ticked: the record goes, its history and its ids folded into was, oldest first
        const cw = mk16(), mw = fns.mergeRecords(cw, 'u_rin', 'u_tam', fns.playerPick(cw, ['u_tam'], 'Merge into', { from: 'u_rin' }).moves());
        // a was of a long history is bounded to the last 20, plain ids alone; one that is no list nor id goes
        const many = Array.from({ length: 25 }, (x, i) => 'u_old' + i), cb = mk16(); cb.players.u_rin.was = many.concat(['bad id!', 5, '__proto__', 'u_old3']);
        const mb = fns.mergeRecords(cb, 'u_rin', 'u_tam'), wb = cb.players.u_tam.was;
        const cn = mk16(); cn.players.u_rin.was = { x: 1 }; delete cn.players.u_tam.was; fns.takeOver(cn, 'u_rin', 'u_new');
        const own16 = fns.ownedOf(mk16(), 'u_rin');
        const noPick = fns.playerPick(mk16(), ['u_tam', 'u_rin'], 'Same person as', {}), noRows = noPick.el.children[2].children.length;
        const flat16 = src.split('\r\n').join('\n');
        check('1.6.0 a hand-over moves only what is ticked (processNextApproval, playerPick, takeOver and mergeRecords run for real on a page of plain objects): the "Same person as…" list opens on the record of the joiner\'s name, ignoring case and outer spaces, the most recently seen of two; with no name it knows it opens on an empty Pick a player… row, Yes is not ready, and a Yes there moves nothing and asks the first question again; under the list every character of the picked record by name with its tokens by name and map beneath it, following its tick, and its other tokens with ticks of their own, all ticked, drawn again when the pick changes; only the ticked ones move, and an unticked character and its tokens keep their owner, whose record stays with them; the toast says how many moved and stayed, one Game Record line names the record, the joiner and each character moved, the steps go to the app\'s log as counts; was a list, an older one-id was kept first, bounded to the last 20 plain ids; Merge into… the same, from its own record',
            [A, B, C, D].every(r => r.threw === '') && A.asks[1].ready === true && A.asks[1].picked === 'u_rin'
            && J2(A.asks[1].rows) === J2(['What moves. Untick anything that stays with Rin.', ['player-pick-row', true, false, 'Rook'], ['player-pick-row sub', true, true, 'Token Rook on Harbor'], ['player-pick-row', true, false, 'Moss'], ['player-pick-row sub', true, true, 'Token Moss on Harbor'], ['player-pick-row sub', true, true, 'Token Moss on Tower'], ['player-pick-row', true, false, 'Token Crate on Harbor']])
            && J2(A.asks[1].after.slice(3, 6).map(r => r[1])) === J2([false, false, false])
            && A.camp.chars.c_r1.ownerId === 'u_new' && A.camp.chars.c_r2.ownerId === 'u_rin' && A.camp.chars.c_t1.ownerId === 'u_tam'
            && J2(A.camp.items.m1.whiteboard.map(w => w.ownerId)) === J2(['u_new', 'u_rin', 'u_new', 'u_tam']) && A.camp.items.m2.whiteboard[0].ownerId === 'u_rin'
            && A.camp.players.u_rin && A.camp.players.u_rin.key === 'K_R' && A.camp.players.u_rin.charId === undefined && A.camp.players.u_rin.was === 'u_rin_old' && A.camp.players.u_new.charId === 'c_r1' && A.camp.players.u_new.key === undefined && A.camp.players.u_new.was === undefined
            && J2(A.toasts) === J2(['  rin takes over from Rin, playing Rook. Moved 1 character and 2 tokens. 1 character and 2 tokens stay with Rin.'])
            && J2(A.logs) === J2([['player', '  rin took over from Rin: moved Rook and 2 tokens, and 1 character and 2 tokens stay with Rin']]) && J2(A.admitted) === J2(['u_new'])
            && J2(A.steps) === J2([['players v1', 'same-asked', { offered: 3, named: true }], ['players v1', 'same-done', { chars: 1, toks: 2, leftChars: 1, leftToks: 2, kept: true }]])
            && B.asks.length === 3 && B.asks[1].ready === false && B.asks[1].picked === '' && B.asks[1].readyAt === false && J2(B.asks[1].rows) === J2([]) && B.asks[1].o.ready && /wants to join/.test(B.asks[2].text)
            && J2(B.admitted) === J2(['u_new']) && !B.camp.players.u_new && B.camp.chars.c_r1.ownerId === 'u_rin' && B.logs.length === 0 && B.steps[1][1] === 'same-back'
            && !C.camp.players.u_rin && J2(C.camp.players.u_new.was) === J2(['u_rin_old', 'u_rin']) && C.camp.chars.c_r2.ownerId === 'u_new' && C.camp.items.m2.whiteboard[0].ownerId === 'u_new' && /Moved 2 characters and 4 tokens\.$/.test(C.toasts[0])
            && C.logs[0][1] === 'Rin took over from Rin: moved Rook, Moss and 4 tokens'
            && J2(D.asks[1].rows) === J2(['What moves. Untick anything that stays with Tam.', ['player-pick-row', true, false, 'Wisp'], ['player-pick-row sub', true, true, 'Token Wisp on Harbor']]) && D.camp.chars.c_t1.ownerId === 'u_new' && D.camp.chars.c_r1.ownerId === 'u_rin'
            && mDef === 'u_rin2' && mRows[0] === 'What moves. Untick anything that stays with Rin.' && mv && mv.kept === true
            && cm.chars.c_r1.ownerId === 'u_tam' && cm.chars.c_r2.ownerId === 'u_rin' && J2(cm.items.m1.whiteboard.map(w => w.ownerId)) === J2(['u_tam', 'u_rin', 'u_tam', 'u_tam']) && cm.items.m2.whiteboard[0].ownerId === 'u_rin'
            && cm.players.u_rin && cm.players.u_rin.charId === undefined && cm.players.u_tam.charId === 'c_r1' && cm.players.u_tam.joinCount === 5 && J2(cm.players.u_tam.was) === J2(['u_tam_a'])
            && mw && !cw.players.u_rin && J2(cw.players.u_tam.was) === J2(['u_tam_a', 'u_rin_old', 'u_rin']) && cw.players.u_tam.joinCount === 8 && cw.chars.c_r2.ownerId === 'u_tam'
            && mb && wb.length === 20 && wb[19] === 'u_rin' && wb.every(x => /^u_[a-z0-9_]+$/.test(x)) && !wb.includes('bad id!') && wb.indexOf('u_old3') < 0 && wb[0] === 'u_old6'
            && J2(fns.wasList('u_x')) === J2(['u_x']) && J2(fns.wasList(['u_x', 'u_x', '', null], ['u_y'])) === J2(['u_x', 'u_y']) && J2(fns.wasList(7)) === J2([]) && J2(cn.players.u_new.was) === J2(['u_rin'])
            && J2(own16.chars.map(c => [c.name, c.toks.map(t => t.mapName)])) === J2([['Rook', ['Harbor']], ['Moss', ['Harbor', 'Tower']]]) && J2(own16.toks.map(t => t.name)) === J2(['Crate'])
            && noPick.pick() === null && noPick.ready() === false && noRows === 0
            && flat16.includes("var pid = pk ? pk.pick() : null; if (!pid) { pickLog('same-back', { picked: false }); askMain(); return; }") && flat16.includes("var kid = pk ? pk.pick() : null; if (!kid) { pickLog('merge-back', { picked: false }); renderPlayersPanel(); return; }")
            && !/sameOf\[0\]|cands\[0\]/.test(flat16.slice(flat16.indexOf('function processNextApproval()'), flat16.indexOf('// [netcheck:approval-end]')) + flat16.slice(flat16.indexOf('function mergeAsk('), flat16.indexOf('var _playersBtn')))
            && flat16.includes("}, { noEnter: true, noEscape: true, yes: 'Yes, the same', body: pk ? pk.el : undefined, ready: pk ? pk.ready : undefined, gone: goneQ });") /* 1.6.3 (finding 2): the watch beside it, moved on purpose */,
            J2([[A, B, C, D].map(r => r.threw), A.asks.map(q => [q.ready, q.picked, q.rows, q.after]), A.toasts, A.logs, A.steps, B.asks.map(q => [q.ready, q.picked, q.rows]), B.steps, C.toasts, C.logs, C.camp.players, D.asks.map(q => q.rows), mDef, mRows, mv, cm.players, cw.players, wb, cn.players]));
    }
{   // 1.6.0 the host id apart from the joining id (the owner, 2026-10-29, and the website session's decision 4 of 2026-10-23): net.js hostId, run for real
    const nS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const i0 = nS.indexOf('function hostId() {'), i1 = nS.indexOf('\n}\n', i0);
    const store = {}, ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    let prof = { id: 'u_first' };
    const H = new Function('localStorage', 'getProfile', 'validProfileId', nS.slice(i0, i1 + 2) + '\nreturn hostId;')(ls, () => prof, id => typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(id));
    const first = H(); prof = { id: 'u_second' }; const after = H(); store.wp_hostId = '<bad>'; const healed = H();
    const sites = (nS.match(/gmId: \(typeof hostId === 'function' \? hostId\(\) : getProfile\(\)\.id\)/g) || []).length, gmSites = (nS.match(/gm = \(typeof hostId === 'function' \? hostId\(\) : getProfile\(\)\.id\)/g) || []).length;
    check('1.6.0 the host id (net.js hostId, run for real): made once from the profile\'s id and kept as wp_hostId, so nothing changes for anyone; a profile that later takes another id leaves it standing; one that is no id is made again from the profile; every gmId the host sends (handouts, the notepad, a scene\'s close, the snapshot) and the key proof\'s gm read it; the GM\'s own screen speaks as it, a join as the profile\'s id, and leaving a table gives it back',
        first === 'u_first' && store.wp_hostId === 'u_second' && after === 'u_first' && healed === 'u_second' && sites === 9 /* 1.6.3 (the multiplayer review, finding 9), moved on purpose: the rejoin's list of handouts (handout-have) names the host too */ && gmSites === 2 && /getProfile\(\)\.id/.test(nS.slice(i0, i1)) && (nS.match(/getProfile\(\)\.id/g) || []).length === 12
        && nS.includes('net.myId = hostId();') && nS.includes("    var profile = setProfileName(name || getProfile().name || 'Player');\n    net.myId = profile.id;") && nS.includes("if (!window.wpStream && !net.stream && typeof hostId === 'function') net.myId = hostId();"),
        JSON.stringify([first, after, healed, store, sites, gmSites]));
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
// 1.6.3 (the improvement week's review of multiplayer, finding 33): the globe's tooltip counts the players at the table, each once: never a
// connection still waiting for the Allow, a closed one, or a player's second connection in the seconds of a reload (hbTick and playersHere, run for real)
{
    const hbSrc = fnSrc('function hbTick() {', '\n// Where each player was last seen', 'hbTick');
    const said = [];
    const tick = (conns, roster) => new Function('net', 'setIndicator', 'lastSeen', 'HB_DEAD', 'HB_STALE', 'toast', 'renderRoster', 'sendFailed', 'broadcast', hbSrc + '\nreturn hbTick();')({ active: true, role: 'host', conns, roster }, (k, t) => said.push(t), {}, 20000, 8000, () => {}, () => {}, () => {}, () => {});
    tick([mkConn('pWait'), mkConn('pShut', false), mkConn('pShut2', false)], { pShut: { id: 'u_a' } });
    tick([mkConn('pOld'), mkConn('pNew'), mkConn('pB'), mkConn('pWait')], { pOld: { id: 'u_a' }, pNew: { id: 'u_a' }, pB: { id: 'u_b' } });
    check('1.6.3 finding 33 (hbTick, run for real): with nobody admitted the globe says 0 players however many connections are open or closed; a player\'s two connections count once and a waiting one not at all; End session\'s question counts the same way',
        j(said) === j(['hosting, 0 players connected', 'hosting, 2 players connected']) && /var n = playersHere\(\);[^\n]*\n    import\('\.\/dialogs\.js'\)/.test(src), j(said));
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

// From netcheck.js's closing block ("Finishing the test split", step 6), where it ran after every pending check (it leans on none of them):
    // (g15) a snapshot's items as a player's app keeps them (snapItems, 1.5.4): a map and a page, each cleaned, and nothing of any other kind —
    // a planner named in a host's snapshot used to be kept as sent (a whole item of another kind was already refused: applyItem)
    {
        const siP = require('./checkkit').part('netfog.js'), siA = siP.indexOf('// [netcheck:snapitems-start]'), siZ = siP.indexOf('// [netcheck:snapitems-end]'), siSrc = siA >= 0 && siZ > siA ? siP.slice(siA, siZ) : 'function snapItems() { throw new Error("the snapitems slice is not marked"); }';
        const siTry = fn => { try { fn(); return ''; } catch (e) { return String(e && e.message); } }, siCalls = [];
        const mkSI = win => new Function('window', 'cleanHostMap', "'use strict';\n" + siSrc + '\nreturn snapItems;')(win, m => { siCalls.push('map:' + m.id); m.cleaned = 1; return m; });
        const winD = { wpDocRender: { cleanDoc: (d, o) => { siCalls.push('doc:' + d.id + ':' + j(o)); return d.bad ? null : { id: d.id, type: 'doc', clean: 1 }; } } };
        const mkCamp = () => ({ items: JSON.parse('{"m1":{"id":"m1","type":"map"},"d1":{"id":"d1","type":"doc"},"d2":{"id":"d2","type":"doc","bad":1},"p1":{"id":"p1","type":"planner","blocks":[{"type":"raw","content":"<b>x</b>"}]},"u1":{"id":"u1","type":"weird"},"n1":null,"s1":"text","t1":{"id":"t1"},"k1":{"id":"k1","type":["map"]},"toString":{"id":"ts","type":"map"},"__proto__":{"id":"pp","type":"map"}}') });
        const c1 = mkCamp(), e1 = siTry(() => mkSI(winD)(c1)), kept1 = Object.keys(c1.items).sort().join(','), calls1 = siCalls.slice(); siCalls.length = 0;
        const c2 = mkCamp(), e2 = siTry(() => mkSI({})(c2)), kept2 = Object.keys(c2.items).sort().join(',');   // no page cleaner on hand: a page is not kept as sent
        const odd = [{ items: 'abc' }, { items: [{ id: 'a', type: 'map' }] }, { items: null }, { items: 7 }, {}].map(c => { const e = siTry(() => mkSI(winD)(c)); return [e, j(c.items)]; });
        const heir = { items: Object.create({ evil: { id: 'evil', type: 'planner' } }) }; heir.items.m1 = { id: 'm1', type: 'map' }; const e3 = siTry(() => mkSI(winD)(heir));
        check('a snapshot\'s items on a player\'s app (snapItems, sliced by its snapitems markers and run for real): a map is cleaned as a host\'s map and a page as a host\'s page, in place; a page that does not clean, or with no page cleaner on hand, is dropped; a planner, an item of a kind this app does not know, of no kind, of a kind that is no text, and whatever is no item are dropped — none is kept as sent; an id a prototype holds is dropped whatever it names; items that are no plain object are none; items handed over with a prototype of the host\'s choosing get the plain one back, so nothing is inherited; nothing throws',
            e1 === '' && kept1 === 'd1,m1' && c1.items.m1.cleaned === 1 && j(c1.items.d1) === j({ id: 'd1', type: 'doc', clean: 1 }) && j(calls1) === j(['map:m1', 'doc:d1:{"keepHidden":true}', 'doc:d2:{"keepHidden":true}'])
            && e2 === '' && kept2 === 'm1' && odd.every(o => o[0] === '' && o[1] === '{}') && e3 === '' && Object.getPrototypeOf(heir.items) === Object.prototype && heir.items.evil === undefined && Object.keys(heir.items).join(',') === 'm1' && ({}).evil === undefined,
            j([e1, kept1, calls1, e2, kept2, odd, e3]));
        const snapP2 = require('./checkkit').part('netfog.js'), snapAt = snapP2.indexOf('function applySnapshot(msg) {'), snapBody = snapP2.slice(snapAt, snapAt + 4000);   // in netfog.js, a part of net.js
        check('a snapshot\'s items (wired): applySnapshot hands each campaign\'s items to snapItems, the one place that keeps or drops them, before the active item is chosen; nothing else in it walks the items one by one',
            snapAt > 0 && require('./checkkit').familyCount('net.js', 'snapItems(') === 2 && /\n        delete cS\.players;[^\n]*\n        snapItems\(cS(?:, [^\n]*)?\);[^\n]*\n        var actS = cS\.items && cS\.items\[cS\.activeItemId\];/.test(snapBody) && !/Object\.keys\(cS\.items \|\| \{\}\)\.forEach/.test(snapBody));
    }

// 1.6.3 (the multiplayer review, finding 16): a player's app keeps the body of a page the join snapshot names only by its stub where the page it
// already holds from the same GM has the same rev, holds every other as its stub and asks the host for it through needItem, one at a time
// (the snapitems and pageask slices of netfog.js, run for real); a page that arrives whole is marked with the rev it was asked for (pageGot)
{
    const J = j;
    const psSrc = between('// [netcheck:pageask-start]', '// [netcheck:pageask-end]', 'pageask', 'netfog.js'), siP16 = between('// [netcheck:snapitems-start]', '// [netcheck:snapitems-end]', 'snapitems', 'netfog.js');
    const timers = [], sent = [], net16 = { active: true, role: 'client', snapshotGen: 3 };
    const win16 = { wpDocRender: { cleanDoc: d => ({ id: d.id, type: 'doc', meta: { title: d.meta ? d.meta.title : '' }, blocks: Array.isArray(d.blocks) ? d.blocks.slice() : [] }) } };
    const A = new Function('window', 'cleanHostMap', 'own', 'net', 'broadcast', 'setTimeout', "'use strict';\n" + psSrc + '\n' + siP16 + '\nreturn { snapItems: snapItems, pageAsk: pageAsk, pageGot: pageGot, want: function() { return Object.keys(_pageWant); }, reset: pageWantReset };')(win16, m => m, H.own, net16, m => sent.push(m), (fn, ms) => timers.push([fn, ms]));
    const flush = () => { let k = 0; while (timers.length && k++ < 50) timers.shift()[0](); };
    const body = { id: 'd1', type: 'doc', meta: { title: 'Gods' }, blocks: [{ id: 'b1', type: 'text', content: 'old words' }], _rev: 'r1' };
    const prev = { id: 'k', items: { d1: body, d2: { id: 'd2', type: 'doc', meta: { title: 'Lore' }, blocks: [{ id: 'b', type: 'text', content: 'x' }], _rev: 'r-old' }, d3: { id: 'd3', type: 'doc', stub: true, meta: { title: 'Maps' }, blocks: [], _rev: 'r3' } } };
    const stub = (id, rev) => ({ id, type: 'doc', meta: { title: id }, blocks: [], stub: true, rev });
    const cNew = { id: 'k', items: { d1: stub('d1', 'r1'), d2: stub('d2', 'r2'), d3: stub('d3', 'r3'), d4: stub('d4', 'r4'), d5: { id: 'd5', type: 'doc', meta: { title: 'Whole' }, blocks: [{ id: 'w', type: 'text', content: 'all here' }] } } };
    A.reset(); A.snapItems(cNew, prev);
    const R = { kept: cNew.items.d1 === body, d2: [cNew.items.d2.stub, cNew.items.d2.blocks.length], d3: [cNew.items.d3.stub, cNew.items.d3 === prev.items.d3], d5: [cNew.items.d5.stub, cNew.items.d5.blocks.length], want: A.want().map(k => k.split('\n')[1]) };
    const fresh = { id: 'k', items: { d1: stub('d1', 'r1') } }; A.reset(); A.snapItems(fresh, null); R.noPrev = [fresh.items.d1.stub, A.want().length];
    A.reset(); A.snapItems({ id: 'k', items: { d2: stub('d2', 'r2'), d4: stub('d4', 'r4'), d6: stub('d6', 'r6') } }, prev);
    const got = { id: 'd4', type: 'doc', meta: {}, blocks: [] }; A.pageGot('k', 'd4', got);   // d4 arrives by itself before its turn: it is not asked for again
    A.pageAsk(3); flush(); R.asked = sent.map(m => m.type + ':' + m.campId + ':' + m.itemId); R.got = got._rev;
    sent.length = 0; A.reset(); A.snapItems({ id: 'k', items: { d7: stub('d7', 'r7'), d8: stub('d8', 'r8') } }, null); A.pageAsk(3); timers.shift()[0](); net16.snapshotGen = 4; flush(); R.stale = sent.length;
    check('1.6.3 (the multiplayer review, finding 16) a player\'s app and the pages a join snapshot names by their stubs (netfog.js snapitems and pageask, run for real): the body it held from the same GM with the same rev stays, the very object; a page with another rev, or with none held, or held only as its stub, is kept as its stub, no blocks, and asked for; a page sent whole is kept whole; with no table before, everything is asked; the asks go one by one through needItem, a page that arrived meanwhile passed over, and a newer snapshot stops them; a page that arrives is marked with the rev asked for',
        R.kept === true && J(R.d2) === J([true, 0]) && J(R.d3) === J([true, false]) && J(R.d5) === J([undefined, 1]) && J(R.want) === J(['d2', 'd3', 'd4']) && J(R.noPrev) === J([true, 1])
        && J(R.asked) === J(['needItem:k:d2', 'needItem:k:d6']) && R.got === 'r4' && R.stale === 1, J(R));
    const snapPF = require('./checkkit').part('netfog.js'), apS = snapPF.slice(snapPF.indexOf('function applySnapshot(msg) {'), snapPF.indexOf('\n}\n', snapPF.indexOf('function applySnapshot(msg) {')));
    check('1.6.3 (finding 16, wired): applySnapshot keeps the table held before only where the same GM\'s, empties what it waits for before the new snapshot is laid, hands each campaign the one held before, and asks for the stubs once the map is up; applyItem marks a page that arrives',
        /var prevSnap = state\.appState && state\.appState\._foreign && mark\.gm && state\.appState\._foreign\.gm === mark\.gm/.test(apS) && /if \(typeof pageWantReset === 'function'\) pageWantReset\(\);\r?\n\s*state\.appState = msg\.appState;/.test(apS)
        && /snapItems\(cS, prevSnap && typeof cS\.id === 'string' && own\(prevSnap\.campaigns, cS\.id\) \? prevSnap\.campaigns\[cS\.id\] : null\);/.test(apS) && /if \(typeof pageAsk === 'function'\) pageAsk\(net\.snapshotGen\);/.test(apS)
        && /camp\.items\[msg\.itemId\] = incoming;\r?\n\s*if \(incoming\.type === 'doc' && typeof pageGot === 'function'\) pageGot\(msg\.campId, msg\.itemId, incoming\);/.test(snapPF));
}
// 1.6.3 (the multiplayer review, finding 23): a player's connection closing froze the GM for up to two seconds inside its close event. The
// roster drawn again, the save, the roster sent to the table and the redraw now happen once, a moment later, for every close of that moment
// (the close handler and the closesoon slice, run for real)
{
    const J = j;
    const clSrc23 = between('// [netcheck:connclose-start]', '// [netcheck:connclose-end]', 'connclose'), csSrc = between('// [netcheck:closesoon-start]', '// [netcheck:closesoon-end]', 'closesoon');
    const out = { saves: 0, rosters: 0, renders: 0, rosterDraws: 0, toasts: [], logs: [], threw: '' }, timers = [];
    const net23 = { role: 'host', active: true, conns: [], roster: Object.create(null), targets: {}, applyingRemote: false, leaving: false, code: 'abc' };
    const env = { net: net23, assetInflight: {}, assetRefs: {}, assetBytes: {}, diceLimit: null, charLimit: null, _lim: {}, _connMeta: {}, lastSeen: {},
        sensesForget() {}, fogDragSweep() {}, fogForgetConn() {}, videoHang() {}, videoTold() {}, renderRoster() { out.rosterDraws++; }, toast(m) { out.toasts.push(String(m)); }, getActiveCampaign: () => ({ items: {} }), logEvent: (k, m) => out.logs.push(m), startWaitGrace() {}, render() { out.renders++; }, broadcastTargets() {},
        save() { out.saves++; }, broadcastRoster() { out.rosters++; }, cancelReconnect() {}, setPausedLocal() {}, stopHeartbeat() {}, setIndicator() {}, load() {}, reconn: {}, scheduleReconnect() {}, getProfile: () => ({ name: 'Me' }), window: {}, setTimeout: (fn, ms) => timers.push([fn, ms]) };
    const names = Object.keys(env);
    const api = new Function(...names, "'use strict';\n" + csSrc + '\nreturn { closeSoon: closeSoon, close: function(conn) {\n' + clSrc23 + '\n} };')(...names.map(n => env[n]));
    ['pA', 'pB', 'pS'].forEach(p => net23.conns.push({ peer: p, open: false })); net23.roster.pA = { id: 'u_a', name: 'Ana' }; net23.roster.pB = { id: 'u_b', name: 'Bo' };
    try { api.close(net23.conns[0]); api.close(net23.conns[0]); api.close(net23.conns[0]); } catch (e) { out.threw = String(e && e.message); }   // Ana, Bo and a stranger the gate never admitted, in one moment
    const before = [out.saves, out.rosters, out.renders, out.rosterDraws, out.toasts.length, out.logs.length, timers.length];
    timers.splice(0).forEach(t0 => t0[0]());
    const after = [out.saves, out.rosters, out.renders, out.rosterDraws];
    out.saves = out.rosters = out.renders = out.rosterDraws = 0; net23.conns.push({ peer: 'pZ', open: false }); api.close(net23.conns[0]); timers.splice(0).forEach(t0 => t0[0]());
    const stranger = [out.saves, out.rosters, out.renders, out.rosterDraws];
    net23.conns.push({ peer: 'pC', open: false }); net23.roster.pC = { id: 'u_c', name: 'Cy' }; out.saves = 0; api.close(net23.conns[0]); net23.active = false; timers.splice(0).forEach(t0 => t0[0]());
    const ended = [out.saves, out.rosterDraws];
    check('1.6.3 (the multiplayer review, finding 23) the close handler on the GM\'s machine (connclose and closesoon, run for real): two players and a stranger leaving in one moment are each told and logged at once, but the roster is drawn, the campaign saved, the roster sent and the app drawn ONCE, a moment later, for all of them; a stranger\'s close alone draws the roster and saves, sends and draws nothing; a table that has ended by then saves nothing',
        out.threw === '' && J(before) === J([0, 0, 0, 0, 2, 2, 1]) && J(after) === J([1, 1, 1, 1]) && J(stranger) === J([0, 0, 0, 1]) && J(ended) === J([0, 2]), J({ before, after, stranger, ended, threw: out.threw }));
    // The review of multiplayer speed: a player who holds a target pointer (most do in a fight) still drew the app inside the close event, and then
    // a second time in closeRun. Their pointer goes at once and is sent at once, and the app is drawn once, a moment later, with the rest
    net23.active = true; out.saves = out.rosters = out.renders = out.rosterDraws = 0; let sentT = 0; env.broadcastTargets = () => { sentT++; };
    const api2 = new Function(...names, "'use strict';\n" + csSrc + '\nreturn { close: function(conn) {\n' + clSrc23 + '\n} };')(...names.map(n => env[n]));
    net23.conns.push({ peer: 'pD', open: false }); net23.roster.pD = { id: 'u_d', name: 'Di' }; net23.targets.u_d = { tok: 't1', mapId: 'm1' };
    let threw2 = ''; try { api2.close(net23.conns[0]); } catch (e) { threw2 = String(e && e.message); }
    const pointBefore = [out.renders, sentT, 'u_d' in net23.targets ? 1 : 0, timers.length];
    timers.splice(0).forEach(t0 => t0[0]());
    check('the review of multiplayer speed (finding 23, a pointer): a player who leaves holding a target pointer has it taken off and sent to the table at once, draws nothing inside the close event, and the app is drawn once a moment later, with the save and the roster',
        threw2 === '' && J(pointBefore) === J([0, 1, 0, 1]) && J([out.renders, out.saves, out.rosters, out.rosterDraws]) === J([1, 1, 1, 1]), J({ pointBefore, after: [out.renders, out.saves, out.rosters, out.rosterDraws], threw2 }));
}
// 1.6.3, the multiplayer review, lane A batch 2 (the session): findings 2, 17 and 22, each on the real gate, queue, approval and sessgate code
pendingChecks.push((async () => {
    const J = JSON.stringify, K32 = 'k'.repeat(32), PROOF = (key, nonce, room) => hmacRef(key, 'wp-auth|' + nonce + '|' + room + FPTAIL);
    const pnaSrc = (() => { const k = 'function processNextApproval() {', i = src.indexOf(k), e = src.indexOf('\n}\n', i); return src.slice(i, e + 3); })();
    const buildP = new Function('env', pre(['processNextApproval']) + 'var approvalOpen = false;\n' + pnaSrc + '\nreturn { run: processNextApproval, isOpen: function() { return approvalOpen; } };');
    const withP = h => { h.env.net.active = true; h.asks = []; h.env.showConfirm = (m, cb, o) => h.asks.push({ m, cb, o }); h.P = buildP(h.env); h.env.processNextApproval = h.P.run; h.answer = a => h.asks[h.asks.length - 1].cb(a); return h; };
    const keyed = () => harness({ players: { u_kay: { name: 'Kay', key: K32 } } });
    const old = h => { const o = h.conn('pOld'); h.env.net.roster.pOld = { id: 'u_kay', name: 'Kay' }; h.env.lastSeen.pOld = Date.now(); return o; };
    const denied = (h, p) => h.sent.filter(s => s.peer === p && s.m.type === 'denied').map(s => s.m.reason), nonceOf = (h, p) => { const x = h.lastSent(p, 'auth'); return x ? x.m.nonce : 'none'; };
    /* finding 17: a reload's new connection while the old one still looks alive */
    const A = keyed(), aOld = old(A), aNew = A.conn('pNew'); A.hello(aNew, { id: 'u_kay', name: 'Kay' }); await A.settle();
    const aAsked = !!A.lastSent('pNew', 'auth') && denied(A, 'pNew').length === 0;
    A.hello(aNew, { id: 'u_kay', name: 'Kay' }, { proof: PROOF(K32, nonceOf(A, 'pNew'), 'waypoint-c1') }); await A.settle();
    const aOk = aAsked && A.admitted.length === 1 && A.admitted[0].peer === 'pNew' && aOld.open === false && !('pOld' in A.env.net.roster) && !!A.env.net.roster.pNew;
    const B = keyed(); old(B); const bNew = B.conn('pNew'); B.hello(bNew, { id: 'u_kay', name: 'Kay' }); await B.settle();
    B.hello(bNew, { id: 'u_kay', name: 'Kay' }, { proof: PROOF('x'.repeat(32), nonceOf(B, 'pNew'), 'waypoint-c1') }); await B.settle();
    const bOk = B.admitted.length === 0 && B.env.pendingJoins.length === 0 && J(denied(B, 'pNew')) === J(['That player identity is already at the table.']) && !!B.env.net.roster.pOld;
    const C = keyed(); old(C); const cNew = C.conn('pNew'); C.hello(cNew, { id: 'u_kay', name: 'Kay' }); await C.settle(); C.fireTimers();
    const cOk = C.admitted.length === 0 && C.env.pendingJoins.length === 0 && J(denied(C, 'pNew')) === J(['That player identity is already at the table.']);
    const D = harness({ players: { u_kay: { name: 'Kay' } } }); old(D); const dNew = D.conn('pNew'); D.hello(dNew, { id: 'u_kay', name: 'Kay' }); await D.settle();
    const E = harness(); old(E); const eNew = E.conn('pNew'); E.hello(eNew, { id: 'u_kay', name: 'Kay' }); await E.settle();
    const dOk = J(denied(D, 'pNew')) === J(['That player identity is already at the table.']) && !D.lastSent('pNew', 'auth') && J(denied(E, 'pNew')) === J(['That player identity is already at the table.']);
    check('1.6.3 (the multiplayer review, finding 17) a player\'s reload refused as already at the table: a known player who holds the table key is challenged though an old connection of theirs still looks alive, and the right key proven over the new connection lets it in while the old one leaves the roster and is closed; a wrong proof, or no answer, while the old one is live is refused as before and never put to the GM; a name with no table key, and a stranger\'s, are refused at once as before',
        aOk && bOk && cOk && dOk, J([aOk, bOk, cOk, dOk, A.admitted.map(a => a.peer), denied(B, 'pNew'), denied(C, 'pNew'), C.env.pendingJoins.length]));
    /* the review of finding 17: two windows of one player in one browser share the profile and the table key. The old connection is TOLD why it
       is closed (denyJoin with the words below), and a player's app told so gives up as one turned away does: it starts no reconnect, so the two
       windows never push each other off the table in a loop. Closed with no word, as before the review, the old app read a dropped link and
       reconnected. Host side: the gate run for real (A above). Player side: hostDoubted, the denied branch and the close handler run for real. */
    const DUPW = 'You joined this table again from another window.';
    const aTold = J(denied(A, 'pOld')) === J([DUPW]) && J(denied(A, 'pNew')) === '[]';
    const hdSrc = (() => { const i = src.indexOf('function hostDoubted(conn) {'); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 3); })();
    const dnSrc = between('// [netcheck:denied-start]', '// [netcheck:denied-end]', 'denied'), ccSrc = between('// [netcheck:connclose-start]', '// [netcheck:connclose-end]', 'connclose');
    const twoWin = (told) => {
        const out = { sched: 0, loads: 0, status: [], threw: '' }, timers = [];
        const conn = { peer: 'room-1', open: true, wpRetry: true, wpHostOk: true, close() { conn.open = false; } };   // an admitted connection: its snapshot was taken (wpHostOk), and it came back once already (wpRetry)
        const net = { role: 'client', active: true, code: 'abcdefghjk', conns: [conn], roster: Object.create(null), targets: {}, leaving: false, fromWelcome: false, peer: { destroy() {} }, notepad: { on: false, text: '' }, combats: {} };
        const env = { net, reconn: { tries: 0, gen: 0 }, hostHeld: () => ({ gmId: 'u_gm', pub: {} }), hostWaitEnd() {}, setStatus: s => out.status.push(s), showConfirm() {}, toast() {}, ui: () => null, window: {}, setTimeout: (f, ms) => timers.push(f), updateMessage: () => '', APP_VERSION: '1.6.3',
            assetInflight: {}, assetRefs: {}, assetBytes: {}, diceLimit: null, charLimit: null, _lim: {}, _connMeta: {}, lastSeen: {}, sensesForget() {}, fogDragSweep() {}, fogForgetConn() {}, videoHang() {}, videoTold() {}, videoOver() {}, renderRoster() {}, getActiveCampaign: () => null, logEvent() {}, startWaitGrace() {}, render() {}, broadcastTargets() {}, save() {}, broadcastRoster() {},
            cancelReconnect() {}, setPausedLocal() {}, stopHeartbeat() {}, setIndicator() {}, load() { out.loads++; }, scheduleReconnect() { out.sched++; }, getProfile: () => ({ name: 'Kay' }), hostGone: () => false, padReset() {}, renderNotepad() {} };
        const names = Object.keys(env);
        try {
            if (told) new Function('msg', 'conn', ...names, hdSrc + '\nif (hostDoubted(conn)) return;\n' + dnSrc)({ type: 'denied', reason: DUPW }, conn, ...names.map(n => env[n]));
            else conn.open = false;   // before the review: the host closed it with no word
            timers.splice(0).forEach(f => f());
            new Function('conn', ...names, ccSrc)(conn, ...names.map(n => env[n]));
        } catch (e) { out.threw = String(e && e.message); }
        return out;
    };
    const wTold = hdSrc && dnSrc && ccSrc ? twoWin(true) : null, wSilent = hdSrc && dnSrc && ccSrc ? twoWin(false) : null;
    const twoOk = !!wTold && wTold.threw === '' && wTold.sched === 0 && wTold.loads === 1 && J(wTold.status) === J([DUPW]) && wSilent.threw === '' && wSilent.sched === 1 && wSilent.loads === 0;
    check('the review of 1.6.3 (finding 17): the connection a reload or a second window replaced is told why it closes (You joined this table again from another window.), and a player\'s app told so gives up as one turned away does and starts no reconnect, so two windows of one player never push each other off the table in a loop (closed with no word, the same app would have reconnected)',
        aTold && twoOk, J([aTold, denied(A, 'pOld'), wTold, wSilent]));
    /* finding 2: a stale join question */
    const F = withP(harness()), fC = F.conn('pS'); F.hello(fC, { id: 'u_sam', name: 'Sam' }); fC.open = false; F.answer(false);
    const fOk = F.asks.length === 1 && !F.env.bannedIds.u_sam && !F.env._noKeyOut.u_sam && /had already dropped, so nothing was decided/.test(F.toasts.join('|')) && !F.P.isOpen() && F.env.outList().length === 0;
    const G = withP(harness()), gC = G.conn('pG'), gD = G.conn('pH'); G.hello(gC, { id: 'u_gil', name: 'Gil' }); G.hello(gD, { id: 'u_hal', name: 'Hal' });
    const gWatchBefore = G.asks[0].o.gone(); gC.open = false; const gWatchAfter = G.asks[0].o.gone(); G.asks[0].cb('gone');
    const gOk = gWatchBefore === false && gWatchAfter === true && /stopped waiting/.test(G.toasts.join('|')) && G.asks.length === 2 && /Hal/.test(G.asks[1].m) && !G.env.bannedIds.u_gil;
    const N = withP(keyed()), nC = N.conn('pK1'); N.hello(nC, { id: 'u_kay', name: 'Kay' }); await N.settle(); N.fireTimers(); N.answer(false);
    const nTurned = N.env._noKeyOut.u_kay === true && !N.env.bannedIds.u_kay && J(N.env.outList().map(o => [o.id, o.name, o.how])) === J([['u_kay', 'Kay', 'nokey']]);
    const nC2 = N.conn('pK2'); N.hello(nC2, { id: 'u_kay', name: 'Kay' }); await N.settle(); N.fireTimers();
    const nAgain = N.asks.length === 1 && J(denied(N, 'pK2')) === J(['The GM declined your request to join.']) && !N.lastSent('pK2', 'wait');   // refused at once, never put in line
    const nC3 = N.conn('pK3'); N.hello(nC3, { id: 'u_kay', name: 'Kay' }); await N.settle(); N.hello(nC3, { id: 'u_kay', name: 'Kay' }, { proof: PROOF(K32, nonceOf(N, 'pK3'), 'waypoint-c1') }); await N.settle();
    const nKey = N.admitted.length === 1 && N.admitted[0].peer === 'pK3';
    const S = withP(harness()), sC = S.conn('pZ'); S.hello(sC, { id: 'u_zed', name: '<b>Zed</b>' }); S.answer(false);
    const sOk = S.env.bannedIds.u_zed === true && J(S.env.outList().map(o => [o.id, o.how])) === J([['u_zed', 'turned']]) && /Player History can let them back in/.test(S.toasts.join('|'));
    const cl = between('// [netcheck:connclose-start]', '// [netcheck:connclose-end]', 'connclose'), dl = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dialogs.js'), 'utf8');
    const wired = cl.includes("pendingJoins = pendingJoins.filter(function(q) { return q.conn !== conn; });") && dl.includes("if (goneFn) goneT = setInterval(function() { var g = false; try { g = goneFn() === true; } catch (e) {} if (g) { cleanup(); callback('gone'); } }, 500);") && dl.includes('if (goneT) { clearInterval(goneT); goneT = null; }');
    check('1.6.3 (the multiplayer review, finding 2) a stale join question: an answer to a question whose connection closed decides nothing (a Turn away keeps nobody out); the question watches its connection and goes away by itself once it closes, and the next comes up; a name turned away without its table key is refused again with no question while the player who proves the key still comes straight in; a stranger turned away is kept out and listed by name; a closed connection leaves the line, and showConfirm\'s gone clears its watch with the question',
        fOk && gOk && nTurned && nAgain && nKey && sOk && wired, J([fOk, gOk, nTurned, nAgain, nKey, sOk, wired, N.asks.length, denied(N, 'pK2'), N.admitted.map(a => a.peer)]));
    /* finding 22: Removed this session, with Let back in */
    const R = harness(); R.env.outNote('u_a', 'Ann', 'removed'); R.env.bannedIds.u_a = true; R.env.bannedIds.u_b = true; R.env._noKeyOut.u_c = true; R.env.outNote('u_c', 'Cy', 'nokey'); R.env.bannedIds.constructor = true;
    const rList = R.env.outList().map(o => [o.id, o.name, o.how]).sort();
    const rBack = R.env.letBackIn('u_a'), rAgain = R.env.letBackIn('u_a'), rAfter = R.env.outList().map(o => o.id).sort();
    const olSrc = between('// [netcheck:outlist-start]', '// [netcheck:outlist-end]', 'outlist');
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const html = new Function('net', 'outList', 'escTextRoster', 'camp', 'var html = "";\n' + olSrc + '\nreturn html;')({ active: true, role: 'host' }, () => [{ id: 'u_x', name: '<img src=x onerror=1>', how: 'removed' }, { id: 'u_y', name: 'Yo', how: 'nokey' }], esc, {});   // (camp: the slice hands the campaign on screen to outList since the review of finding 22)
    const htmlP = new Function('net', 'outList', 'escTextRoster', 'camp', 'var html = "";\n' + olSrc + '\nreturn html;')({ active: false, role: null }, () => [{ id: 'u_x', name: 'X', how: 'removed' }], esc, {});
    const rOk = J(rList) === J([['u_a', 'Ann', 'removed'], ['u_b', 'Player', 'removed'], ['u_c', 'Cy', 'nokey']]) && rBack === true && rAgain === false && J(rAfter) === J(['u_b', 'u_c'])
        && /Removed this session \(2\)/.test(html) && !/<img/.test(html) && html.includes('&lt;img src=x onerror=1&gt;') && html.includes('data-letin="u_x"') && html.includes('data-letin="u_y"') && /Let back in/.test(html) && /without their table key/.test(html) && htmlP === ''
        && src.includes("} else if (btn.dataset.letin) {") && src.includes("if (typeof letBackIn === 'function' && letBackIn(lid)) { toast(nmL + ' may join again this session.');") && src.includes("if (p) { bannedIds[p.id] = true; if (typeof outNote === 'function') outNote(p.id, p.name, 'removed');");
    check('1.6.3 (the multiplayer review, finding 22) Player History lists those kept out of this session under Removed this session, each by the name the gate saw (a prototype key never), why in plain words and a Let back in that lifts it once; nothing is listed off a table; the roster\'s x notes the name it removes',
        rOk, J([rList, rBack, rAgain, rAfter, html.slice(0, 400)]));
    /* the review of finding 22: a player the campaign bans (its Ban removes one at the table through kickPlayer, which notes them as removed) stands
       under the campaign's own BANNED row and Unban, never under Removed this session with a Let back in that lifts nothing the gate still reads */
    const RB = harness(); RB.env.bannedIds.u_ban = true; RB.env.outNote('u_ban', 'Bea', 'removed'); RB.env.bannedIds.u_rem = true; RB.env.outNote('u_rem', 'Rem', 'removed');
    const campB = { bannedPlayers: { u_ban: { name: 'Bea', bannedAt: 1 } } };
    const rbWith = RB.env.outList(campB).map(o => o.id), rbNone = RB.env.outList().map(o => o.id).sort(), rbOdd = RB.env.outList({ bannedPlayers: 'x' }).map(o => o.id).sort();
    let olCamp = null; const htmlB = new Function('net', 'outList', 'escTextRoster', 'camp', 'var html = "";\n' + olSrc + '\nreturn html;')({ active: true, role: 'host' }, c => { olCamp = c; return RB.env.outList(c); }, esc, campB);
    const letSrc = (() => { const i = src.indexOf('} else if (btn.dataset.letin) {'), e = src.indexOf('} else if (btn.dataset.forget) {', i); return i < 0 || e < 0 ? '' : src.slice(i + '} else if (btn.dataset.letin) {'.length, e); })();
    const letT = [], letL = [], letLifted = [];
    const runLet = (lid) => new Function('btn', 'camp', 'outList', 'letBackIn', 'toast', 'logEvent', 'own', letSrc)({ dataset: { letin: lid } }, campB, RB.env.outList, id => { letLifted.push(id); return RB.env.letBackIn(id); }, t => letT.push(t), (k, m) => letL.push(m), H.own);
    runLet('u_ban'); const banStill = RB.env.bannedIds.u_ban === true && J(letLifted) === '[]' && /still banned from this campaign\. Unban lifts it\./.test(letT[0] || '') && letL.length === 0;
    runLet('u_rem'); const remBack = !RB.env.bannedIds.u_rem && J(letLifted) === J(['u_rem']) && /Rem may join again this session\./.test(letT[1] || '');
    const rbOk = J(rbWith) === J(['u_rem']) && J(rbNone) === J(['u_ban', 'u_rem']) && J(rbOdd) === J(['u_ban', 'u_rem']) && olCamp === campB && !htmlB.includes('data-letin="u_ban"') && htmlB.includes('data-letin="u_rem"') && /Removed this session \(1\)/.test(htmlB) && banStill && remBack;
    check('the review of 1.6.3 (finding 22): a player the campaign bans is left out of Removed this session (outList(camp)), so no Let back in is offered that the hello gate would still refuse; a Let back in pressed on a panel drawn before the ban says they are still banned and that Unban lifts it, and lifts nothing',
        rbOk, J([rbWith, rbNone, rbOdd, olCamp === campB, banStill, remBack, letT, letLifted]));
})());
// 1.6.3 (multiplayer, a password set mid-session; Fulllion's pick, by prompt: "Seated players skip it"). A GM hosts with no password, a player
// sits down, then the GM sets a session password. A seated player's dropped link reconnects with no password: the hello gate lets them back in
// once they prove the table key over this connection, never on a name alone, and their tries never count toward the lockout. Anyone new, a
// player with no key or a failed proof, and a removed player are judged as before. Each run on the real gate, sessgate and approval code
pendingChecks.push((async () => {
    const J = JSON.stringify, K32 = 'k'.repeat(32), PROOF = (key, nonce, room) => hmacRef(key, 'wp-auth|' + nonce + '|' + room + FPTAIL);
    const denied = (h, p) => h.sent.filter(x => x.peer === p && x.m.type === 'denied').map(x => x.m.reason), nonceOf = (h, p) => { const x = h.lastSent(p, 'auth'); return x ? x.m.nonce : 'none'; };
    const fails = (h, id) => (h.env._pwFails[id] || []).length;
    // a host whose campaign gave u_kay a table key, u_kay seated this session, and the password set after (the box read at each hello)
    const world = (o) => {
        o = o || {};
        const h = harness({ players: { u_kay: { name: 'Kay', key: K32 }, u_new: { name: 'Neo' } } });
        h.pw = o.pw === undefined ? 'sesame' : o.pw; h.env.ui = () => ({ value: h.pw });
        if (o.seated !== false) h.env.satNote('u_kay');
        h.signs = []; h.env.gmHail = (cm, cn) => { h.signs.push('hail ' + cn); return Promise.resolve(); }; h.env.gmPresign = (cm, cn, held) => { h.signs.push('sign ' + cn + ' ' + held); return Promise.resolve(); };
        return h;
    };
    const cn = 'ab'.repeat(16);
    /* a seated player with a valid key and no password is admitted after a password is set */
    const A = world(), aC = A.conn('pA'); A.hello(aC, { id: 'u_kay', name: 'Kay' }, { cn }); await A.settle();
    const aAsked = !!A.lastSent('pA', 'auth') && denied(A, 'pA').length === 0 && A.env.pendingJoins.length === 0 && A.signs.length === 0;   // challenged, never refused, never put to the GM, nothing signed yet
    A.hello(aC, { id: 'u_kay', name: 'Kay' }, { cn, proof: PROOF(K32, nonceOf(A, 'pA'), 'waypoint-c1') }); await A.settle();
    const aOk = aAsked && A.admitted.length === 1 && A.admitted[0].peer === 'pA' && A.admitted[0].key === K32 && denied(A, 'pA').length === 0 && fails(A, 'u_kay') === 0 && J(A.signs) === J(['hail ' + cn, 'sign ' + cn + ' ' + K32]);
    const A2 = world(), a2 = A2.conn('pA2'); A2.hello(a2, { id: 'u_kay', name: 'Kay' }); await A2.settle(); A2.hello(a2, { id: 'u_kay', name: 'Kay' }, { proof: PROOF(K32, nonceOf(A2, 'pA2'), 'waypoint-c1') }); await A2.settle();
    const a2Ok = A2.admitted.length === 1 && fails(A2, 'u_kay') === 0;   // a hello with no nonce: admitted with nothing to sign
    // the name is locked by someone else's wrong guesses: the seated player who proves the key still comes back
    const L = world(); for (let i = 0; i < 5; i++) { const c = L.conn('pG' + i); L.hello(c, { id: 'u_kay', name: 'Kay' }, { password: 'nope' + i }); await L.settle(); L.hello(c, { id: 'u_kay', name: 'Kay' }, { proof: 'f'.repeat(64) }); await L.settle(); }   // under a seated name a wrong word is no guess at the password: each is challenged, and each failed proof counts
    const lLocked = fails(L, 'u_kay') === 5 && denied(L, 'pG4')[0] === 'Wrong session password.';
    const lC = L.conn('pL'); L.hello(lC, { id: 'u_kay', name: 'Kay' }); await L.settle(); L.hello(lC, { id: 'u_kay', name: 'Kay' }, { proof: PROOF(K32, nonceOf(L, 'pL'), 'waypoint-c1') }); await L.settle();
    const lOk = lLocked && L.admitted.length === 1 && fails(L, 'u_kay') === 5;
    check('1.6.3 (a password set mid-session): a player seated this session whose reconnect sends no password is challenged for the table key and comes back in once the proof passes over this connection; nothing is signed for that connection until then; the try never counts toward the lockout, and a name locked by someone else\'s guesses does not keep its owner out',
        aOk && a2Ok && lOk, J([aAsked, A.admitted.map(a => a.peer), denied(A, 'pA'), fails(A, 'u_kay'), A.signs, a2Ok, lLocked, L.admitted.map(a => a.peer), fails(L, 'u_kay')]));
    /* a new player without the password is refused */
    const N = world(), nC = N.conn('pN'); N.hello(nC, { id: 'u_new', name: 'Neo' }); await N.settle();
    const nC2 = N.conn('pN2'); N.hello(nC2, { id: 'u_stranger', name: 'Str' }); await N.settle();
    const U = world({ seated: false }), uC = U.conn('pU'); U.hello(uC, { id: 'u_kay', name: 'Kay' }); await U.settle();   // the key's owner who never sat this session
    const nOk = J(denied(N, 'pN')) === J(['Wrong session password.']) && J(denied(N, 'pN2')) === J(['Wrong session password.']) && fails(N, 'u_new') === 1 && fails(N, 'u_stranger') === 1 && !N.lastSent('pN', 'auth') && N.env.pendingJoins.length === 0 && N.admitted.length === 0
        && J(denied(U, 'pU')) === J(['Wrong session password.']) && !U.lastSent('pU', 'auth') && fails(U, 'u_kay') === 1 && U.admitted.length === 0;
    const R = world(), rC = R.conn('pR'); R.hello(rC, { id: 'u_new', name: 'Neo' }, { password: 'sesame' }); await R.settle();
    const rOk = !!R.lastSent('pR', 'wait') && R.env.pendingJoins.length === 1 && denied(R, 'pR').length === 0;   // the right word: the GM is asked as ever
    check('1.6.3 (a password set mid-session): anyone who has not sat at the table this session still needs the password, a stranger, a known name with no key and the key\'s own owner alike: refused at once, counted toward the lockout, never challenged or put to the GM; the right word goes to the GM as before',
        nOk && rOk, J([denied(N, 'pN'), denied(N, 'pN2'), fails(N, 'u_new'), denied(U, 'pU'), fails(U, 'u_kay'), rOk]));
    /* a seated player with a bad proof is refused and does count toward the lockout */
    const B = world(), bC = B.conn('pB'); B.hello(bC, { id: 'u_kay', name: 'Kay' }, { cn }); await B.settle(); B.hello(bC, { id: 'u_kay', name: 'Kay' }, { cn, proof: PROOF('w'.repeat(32), nonceOf(B, 'pB'), 'waypoint-c1') }); await B.settle();
    const bWrong = J(denied(B, 'pB')) === J(['Wrong session password.']) && B.admitted.length === 0 && fails(B, 'u_kay') === 1 && B.env.pendingJoins.length === 0 && B.signs.length === 0;
    const T2 = world(), tC = T2.conn('pT'); T2.hello(tC, { id: 'u_kay', name: 'Kay' }); await T2.settle(); T2.fireTimers();
    const tSilent = J(denied(T2, 'pT')) === J(['Wrong session password.']) && fails(T2, 'u_kay') === 1 && T2.env.pendingJoins.length === 0;   // no answer to the challenge
    const P = world(), pC = P.conn('pP'); P.hello(pC, { id: 'u_kay', name: 'Kay' }); await P.settle(); P.hello(pC, { id: 'u_kay', name: 'Kay' }); await P.settle();
    const pNoProof = J(denied(P, 'pP')) === J(['Wrong session password.']) && fails(P, 'u_kay') === 1 && P.env.pendingJoins.length === 0 && P.admitted.length === 0;   // a second hello with no proof: no key to show
    const O = world(), oC = O.conn('pO', pcStub('sha-256 99:99', FPP)); O.hello(oC, { id: 'u_kay', name: 'Kay' }); await O.settle(); O.hello(oC, { id: 'u_kay', name: 'Kay' }, { proof: PROOF(K32, nonceOf(O, 'pO'), 'waypoint-c1'), fp: [FPP, FPH] }); await O.settle();
    const oOther = J(denied(O, 'pO')) === J(['Wrong session password.']) && fails(O, 'u_kay') === 1 && O.admitted.length === 0;   // the right key proven over another connection
    const Q = world(); for (let i = 0; i < 5; i++) { const c = Q.conn('pQ' + i); Q.hello(c, { id: 'u_kay', name: 'Kay' }); await Q.settle(); Q.hello(c, { id: 'u_kay', name: 'Kay' }, { proof: 'f'.repeat(64) }); await Q.settle(); }
    const qC = Q.conn('pQx'); Q.hello(qC, { id: 'u_kay', name: 'Kay' }); await Q.settle(); Q.hello(qC, { id: 'u_kay', name: 'Kay' }, { proof: 'f'.repeat(64) }); await Q.settle();
    const qLock = fails(Q, 'u_kay') === 5 && /^Too many wrong passwords under that name/.test(denied(Q, 'pQx')[0] || '') && Q.admitted.length === 0;
    const qR = Q.conn('pQr'); Q.hello(qR, { id: 'u_kay', name: 'Kay' }, { password: 'sesame' }); await Q.settle();
    const qRight = /^Too many wrong passwords under that name/.test(denied(Q, 'pQr')[0] || '');   // five failed proofs lock the name as five wrong words do
    check('1.6.3 (a password set mid-session): a seated name that skips the password and does not prove the key over this connection is refused as a wrong password and it counts toward the lockout: a wrong key, no answer to the challenge, a second hello with no proof, the right key proven over another connection; never put to the GM, nothing signed; five such tries lock the name for a minute as five wrong words do',
        bWrong && tSilent && pNoProof && oOther && qLock && qRight, J([denied(B, 'pB'), fails(B, 'u_kay'), B.signs, tSilent, pNoProof, denied(O, 'pO'), fails(O, 'u_kay'), fails(Q, 'u_kay'), denied(Q, 'pQx'), denied(Q, 'pQr')]));
    /* a removed player stays out */
    const K = world(); K.env.bannedIds.u_kay = true; K.env.satDrop('u_kay');   // the roster's x, as kickPlayer does it
    const kC = K.conn('pK'); K.hello(kC, { id: 'u_kay', name: 'Kay' }, { proof: PROOF(K32, 'x', 'waypoint-c1') }); await K.settle();
    const kOut = J(denied(K, 'pK')) === J(['You were removed from this session.']) && K.admitted.length === 0;
    K.env.letBackIn('u_kay'); const kC2 = K.conn('pK2'); K.hello(kC2, { id: 'u_kay', name: 'Kay' }); await K.settle();
    const kBack = J(denied(K, 'pK2')) === J(['Wrong session password.']) && !K.lastSent('pK2', 'auth');   // let back in, they are no longer seated: the password holds for them
    const W = world(); W.env.satNote('u_zed'); W.env.net.active = true;
    const pnaSrc = (() => { const k = 'function processNextApproval() {', i = src.indexOf(k), e = src.indexOf('\n}\n', i); return src.slice(i, e + 3); })();
    const P2 = new Function('env', pre(['processNextApproval']) + 'var approvalOpen = false;\n' + pnaSrc + '\nreturn processNextApproval;');
    const asks = []; W.env.showConfirm = (m, cb, o) => asks.push(cb); W.env.processNextApproval = P2(W.env);
    const wC = W.conn('pW'); W.hello(wC, { id: 'u_zed', name: 'Zed' }, { password: 'sesame' }); if (asks.length) asks[0](false);
    const wOut = asks.length === 1 && !W.env.own(W.env._satIds, 'u_zed') && W.env.bannedIds.u_zed === true;
    const nn = src.replace(/\r\n/g, '\n');
    const wired = /net\.roster\[conn\.peer\] = prof;\n\s*if \(typeof satNote === 'function'\) satNote\(prof\.id\);/.test(nn)
        && /if \(p && typeof satDrop === 'function'\) satDrop\(p\.id\);[^\n]*\n\s*var keys = p && p\.id \? Object\.keys\(net\.roster\)/.test(nn)
        && /if \(typeof _satIds !== 'undefined'\) _satIds = Object\.create\(null\);[^\n]*\n\s*if \(typeof _noKeyOut !== 'undefined'\) \{ _noKeyOut = Object\.create\(null\);/.test(nn);
    check('1.6.3 (a password set mid-session): a removed player stays out, the roster\'s x refusing them before any password or proof; let back in, they are no longer seated and the password holds for them; Turn away (the approval code, run for real) takes the seat off; admitPlayer notes a seat, kickPlayer drops it and the session\'s end forgets them all (wired)',
        kOut && kBack && wOut && wired, J([denied(K, 'pK'), denied(K, 'pK2'), wOut, asks.length, wired]));
})());

/* ================= 1.6.4: the GM's own name for a player (Player History's box) ================= */
// Fulllion, 2026-11-22 ("Both, after release"): what the GM calls a player, kept on the record as gmName, read on the GM's machine alone and
// never sent. The gmname, chatwho and gmnamebox slices run for real on a campaign of plain objects, as a host, as a player's app and as a chat pop-out
{
    const gS = between('// [netcheck:gmname-start]', '// [netcheck:gmname-end]', 'gmname');
    const wS = between('// [netcheck:chatwho-start]', '// [netcheck:chatwho-end]', 'chatwho');
    const bS = between('// [netcheck:gmnamebox-start]', '// [netcheck:gmnamebox-end]', 'gmnamebox');
    const mkCampG = () => ({ players: { u_ayla: { name: 'Ayla', gmName: 'Tall\u202e one\n' }, u_bram: { name: 'Bram' }, u_cato: { name: '' } } });
    const mkG = (role, active, camp, win) => {
        const net = { role, active, myId: role === 'host' ? 'u_gm' : 'u_me' }, out = { saves: 0, toasts: [], drawn: [], steps: [] };
        win = win || {};
        const api = new Function('net', 'own', 'validProfileId', 'getActiveCampaign', 'window', 'chatGmSide', 'save', 'toast', 'renderRoster', 'refreshChatRecipients', 'renderChat', 'renderPlayersPanel', '_playersList', 'console', 'setTimeout',
            gS + '\n' + wS + '\n' + bS + '\nreturn { cleanGmName, gmNameOf, playerName, recName, chatWho, chatNamesOut, chatNamesIn, gmNameSet };')(
            net, H.own, H.validProfileId, () => camp, win, () => !(net.active && net.role === 'client'), () => { out.saves++; }, t => out.toasts.push(String(t)),
            () => out.drawn.push('roster'), () => out.drawn.push('to'), () => out.drawn.push('chat'), () => out.drawn.push('panel'), null, { error() { out.drawn.push('error'); } }, f => { out.drawn.push('soon'); f(); });
        return { api, out, net, win };
    };
    const G = mkG('host', true, mkCampG()), A = G.api;
    const cleans = [A.cleanGmName('  Big \u202e Bob\n\t'), A.cleanGmName('x'.repeat(50)).length, A.cleanGmName(5), A.cleanGmName(null), A.cleanGmName('  \u200b '), A.cleanGmName('a\u0000b')];
    const host = [A.playerName('u_ayla', 'Ayla'), A.playerName('u_bram', 'Bram'), A.playerName('u_bram'), A.playerName('u_none'), A.playerName('constructor', 'Zed'), A.playerName('__proto__'), A.playerName('u_cato', ''),
        A.recName({ gmName: '  ', name: 'Nell' }), A.recName({ gmName: 7 }, 'fb'), A.recName(null, 'fb'), A.gmNameOf('u_ayla'), A.gmNameOf('u_bram')];
    const who = [A.chatWho({ id: 'u_ayla', name: 'Ayla' }), A.chatWho({ id: 'u_ayla', name: 'GM', gm: true }), A.chatWho({ id: 'u_bram', name: 'Bram' }), A.chatWho({}), A.chatWho(null), A.chatWho({ id: 'names', name: 'Name' })];
    const namesOut = JSON.parse(j(A.chatNamesOut()));
    // a player's app at the table: the host's campaign carries no records; even a copy that did names nobody by the GM's word
    const P = mkG('client', true, mkCampG()), PA = P.api;
    const player = [PA.playerName('u_ayla', 'Ayla'), PA.gmNameOf('u_ayla'), PA.chatWho({ id: 'u_ayla', name: 'Ayla' }), PA.chatNamesOut()];
    // the GM off the table (Player History of their own campaign): the GM's name stands
    const off = mkG('host', false, mkCampG()).api.playerName('u_ayla', 'Ayla');
    // a chat pop-out of the GM's: only the names its main window sent, each cleaned again; anything else clears them
    const W = mkG('host', false, null, { wpPopout: true }), WA = W.api;
    WA.chatNamesIn({ u_ayla: 'Tall\u202e one', 'bad id!': 'x', u_cato: 5, constructor: 'P', u_dan: '' });
    const pop1 = [WA.chatWho({ id: 'u_ayla', name: 'Ayla' }), WA.chatWho({ id: 'u_cato', name: 'Cato' }), WA.chatWho({ id: 'constructor', name: 'C' }), WA.chatWho({ id: 'u_dan', name: 'Dan' })];
    WA.chatNamesIn([['u_ayla', 'x']]); const pop2 = WA.chatWho({ id: 'u_ayla', name: 'Ayla' });
    WA.chatNamesIn({ u_ayla: 'Again' }); WA.chatNamesIn(null); const pop3 = WA.chatWho({ id: 'u_ayla', name: 'Ayla' });
    check('1.6.4 the GM\'s own name for a player (the gmname and chatwho slices run for real): cleaned to one line of at most 40 with control, bidi-override and zero-width characters out, blank as none; on the GM\'s screen a player is named by it first, then the name given, then their record\'s, then Player, a prototype key never read; a chat line or card names its sender by it, a GM\'s line and the app\'s own keep theirs; the names a GM\'s pop-out is sent are the records that have one; on a player\'s app at the table nothing of it is read and no names go to a pop-out; off the table the GM\'s own campaign still reads it; a pop-out takes only clean names under profile ids from its main window and forgets them on anything else',
        j(cleans) === j(['Big Bob', 40, '', '', '', 'a b']) && j(host) === j(['Tall one', 'Bram', 'Bram', 'Player', 'Zed', 'Player', 'Player', 'Nell', 'fb', 'fb', 'Tall one', ''])
        && j(who) === j(['Tall one', 'GM', 'Bram', 'Player', 'Player', 'Name']) && j(namesOut) === j({ u_ayla: 'Tall one' })
        && j(player) === j(['Ayla', '', 'Ayla', null]) && off === 'Tall one' && j(pop1) === j(['Tall one', 'Cato', 'C', 'Dan']) && pop2 === 'Ayla' && pop3 === 'Ayla',
        j({ cleans, host, who, namesOut, player, off, pop1, pop2, pop3 }));
    // Player History's box (gmNameSet): a name set, cleaned, saved and drawn everywhere at once; the same again changes nothing; blank takes it off;
    // a record not there, a prototype key or no campaign writes nothing; a page editor that fails to draw never stops the rest
    const campB = mkCampG(), B = mkG('host', true, campB), BA = B.api; let pl = 0; B.win.wpPlannerPlayers = () => { pl++; };
    const s1 = BA.gmNameSet(campB, 'u_bram', '  Big\u202e  Bram '), r1 = j(campB.players.u_bram), sv1 = B.out.saves, dr1 = B.out.drawn.slice(), t1 = B.out.toasts.slice();
    const s2 = BA.gmNameSet(campB, 'u_bram', 'Big Bram'), sv2 = B.out.saves;
    B.win.wpPlannerPlayers = () => { throw new Error('page'); };
    const s3 = BA.gmNameSet(campB, 'u_bram', '   '), r3 = j(campB.players.u_bram), sv3 = B.out.saves, dr3 = B.out.drawn.slice(dr1.length), t3 = B.out.toasts[1];
    const bad = [BA.gmNameSet(campB, 'u_none', 'X'), BA.gmNameSet(campB, '__proto__', 'X'), BA.gmNameSet(campB, 'constructor', 'X'), BA.gmNameSet(null, 'u_bram', 'X'), BA.gmNameSet(campB, 5, 'X')];
    check('1.6.4 Player History\'s box (the gmnamebox slice run for real): a name typed is cleaned and kept on the record as gmName beside the player\'s own name, saved once, and the roster, the page editor\'s Seen by, Table Chat\'s To list and lines and the panel are drawn again, the GM told it is theirs alone; the same name again saves nothing; an empty box takes it off; a record not there, a prototype key, a number or no campaign writes nothing; a page editor that throws stops none of the rest',
        s1 === true && r1 === j({ name: 'Bram', gmName: 'Big Bram' }) && sv1 === 1 && j(dr1) === j(['soon', 'roster', 'to', 'chat', 'panel']) && pl === 1 && /^You call Bram "Big Bram" now\. Only you see it\.$/.test(t1[0] || '')
        && s2 === false && sv2 === 1 && s3 === true && r3 === j({ name: 'Bram' }) && sv3 === 2 && j(dr3) === j(['soon', 'roster', 'error', 'to', 'chat', 'panel']) && /^Back to the name Bram gave themselves\.$/.test(t3 || '')
        && bad.every(b => b === false) && B.out.saves === 2 && !H.own(Object.prototype, 'gmName'),
        j({ s1, r1, sv1, dr1, t1, s2, sv2, s3, r3, sv3, dr3, t3, bad }));
    // Merge into keeps the GM's name: the kept record's own, else the one that goes; Same person as carries it to the new id
    const apG = src.slice(src.indexOf('// [netcheck:approval-start]'), src.indexOf('// [netcheck:approval-end]'));
    const FG = new Function('own', 'validProfileId', 'net', 'showConfirm', 'admitPlayer', 'toast', 'getActiveCampaign', 'pendingJoins', 'approvalOpen', 'bannedIds', 'denyJoin', apG + '\nreturn { mergeRecords, takeOver };')(H.own, H.validProfileId, {}, () => {}, () => {}, () => {}, () => null, [], false, {}, () => {});
    const mkM = (kg, og) => ({ players: { u_old: Object.assign({ name: 'Kael (app)' }, og ? { gmName: og } : {}), u_kept: Object.assign({ name: 'Kael (web)' }, kg ? { gmName: kg } : {}) }, chars: {}, items: {} });
    const m1 = mkM('', 'The bard'), m2 = mkM('Kael', 'The bard'), m3 = mkM('', ''), t4 = { players: { u_old: { name: 'Rin', gmName: 'Rinny', key: 'K' } }, chars: {}, items: {} };
    FG.mergeRecords(m1, 'u_old', 'u_kept'); FG.mergeRecords(m2, 'u_old', 'u_kept'); FG.mergeRecords(m3, 'u_old', 'u_kept'); FG.takeOver(t4, 'u_old', 'u_new');
    check('1.6.4 Merge into and Same person as keep the GM\'s own name for the person (mergeRecords and takeOver run for real): the kept record keeps its own, takes the other\'s where it has none, and a record with none on either side gains none; a hand-over carries it to the new id',
        m1.players.u_kept.gmName === 'The bard' && m2.players.u_kept.gmName === 'Kael' && !('gmName' in m3.players.u_kept) && t4.players.u_new.gmName === 'Rinny' && !t4.players.u_old,
        j([m1.players, m2.players, m3.players, t4.players]));
    // where it is read: every GM-side place that names a player asks the one reader, and the box is drawn by the panel
    const nn = src.replace(/\r\n/g, '\n'), pj = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8');
    const wired = [
        nn.includes("var shown = typeof playerName === 'function' ? playerName(p.id, p.name || p.id) : (p.name || p.id), name = escTextRoster(shown);"),
        nn.includes("var gmP = typeof cleanGmName === 'function' ? cleanGmName(p.gmName) : '';") && nn.includes("'<div><b>' + escTextRoster(gmP || p.name || pid) + '</b>' +"),
        nn.includes("'<label class=\"player-gmname-row\">Your name for them <input type=\"text\" class=\"player-gmname\" data-gmname=\"' + escTextRoster(pid) + '\" maxlength=\"40\" value=\"' + escTextRoster(gmP) + '\""),
        nn.includes("who.textContent = m.from.id === net.myId ? 'You' : (typeof chatWho === 'function' ? chatWho(m.from) : (m.from.name || 'Player'));"),
        nn.includes("names: typeof chatNamesOut === 'function' ? chatNamesOut() : null"),
        nn.includes("try { if (typeof n.chatWho === 'function') out += '|' + n.chatWho(r.from); } catch (e) { out += '|?'; }"),
        (pj('dice.js').match(/n && typeof n\.chatWho === 'function' \? n\.chatWho\(rec\.from\) : \(rec\.from\.name \|\| 'Player'\)/g) || []).length === 2,
        ['charlist.js', 'timepanel.js', 'sheets.js'].every(f => pj(f).includes("if (n && typeof n.playerName === 'function') Object.keys(out).forEach(function(pid) { out[pid] = n.playerName(pid, out[pid]); });")),
        nn.includes("    setTimeout(gmNamesMoved, 0);") && nn.includes("if (_playersList) _playersList.addEventListener('focusout', function(e) {\n    var box = e.target && e.target.closest ? e.target.closest('.player-gmname') : null; if (!box || !box.isConnected) return;\n    gmNameSet(getActiveCampaign(), box.dataset.gmname, box.value);"),
        pj('whiteboard.js').includes("name: playsL || (window.wpNet && typeof window.wpNet.playerName === 'function' ? window.wpNet.playerName(p.id, p.name || 'Player') : (p.name || 'Player')),"),
        // the record never ships: the snapshot drops camp.players whole, and nothing on the wire names gmName
        /delete camp\.players;/.test(require('./checkkit').part('netfog.js')) && !/gmName/.test(require('./checkkit').part('netfog.js')),
    ];
    check('1.6.4 the GM\'s own name is read where a player is named on the GM\'s screen (the roster chip with their own name under the pointer, Player History\'s name and box, a chat line, a whisper\'s tag, the pop-out\'s names, a kept card drawn again when it moves, the roll and apply cards, the owner names of the sheets, Characters and the timers, the party strip) and never on the wire (camp.players goes from every snapshot whole)',
        wired.every(Boolean), j(wired));
}

/* ================= 1.6.4: a player's name changed at the table reaches it at once (the player's half) ================= */
// The profileup slice run for real on a player's app of plain objects: what is sent, when, to whom, and never to a host that did not say it takes it
{
    const pS = between('// [netcheck:profileup-start]', '// [netcheck:profileup-end]', 'profileup');
    const mkP = () => {
        const out = { sent: [], timers: [], now: 1e6 }, c = { peer: 'host1', open: true, send: m => out.sent.push(JSON.parse(j(m))) };
        const net = { active: true, role: 'client', syncedPeer: 'host1', conns: [c] };
        let prof = { id: 'u_me', name: 'Ayla', color: '#112233', face: 'default' };
        const tm = { set: (f, ms) => { const t = { f, at: out.now + ms, on: true }; out.timers.push(t); return t; }, clear: t => { if (t) t.on = false; } };
        const run = ms => { out.now += ms; out.timers.filter(t => t.on && t.at <= out.now).forEach(t => { t.on = false; t.f(); }); };
        const api = new Function('net', 'getProfile', 'cleanRosterName', 'safeAvatar', 'sendFailed', 'setTimeout', 'clearTimeout', 'Date',
            pS + '\nreturn { know: profileSetKnow, out: profileOut, note: profileSentNote, soon: profileSoon, send: profileSend, link: profileLink };')(
            net, () => prof, H.cleanRosterName, H.safeAvatar, () => out.sent.push('failed'), tm.set, tm.clear, { now: () => out.now });
        return { api, out, net, c, run, set: p => { prof = Object.assign({}, prof, p); }, prof: () => prof };
    };
    // an older host: its snapshot said nothing, so nothing is ever sent
    const O = mkP(); O.api.note(O.prof()); O.api.know(undefined); O.set({ name: 'Ayla Vale' }); O.api.soon(); O.run(5000); const oldHost = [O.api.send(), O.out.sent.length, O.out.timers.length];
    O.api.know('yes'); const oldTruthy = [O.api.send(), O.out.sent.length];
    // a host that takes it: a change a moment after it is written, once; the same again nothing; the face never; cleaned as the host cleans a hello
    const P = mkP(); P.api.note(P.prof()); P.api.know(true);
    P.api.soon(); P.run(5000); const unchanged = P.out.sent.length;
    P.set({ name: '  Ayla\u202e Vale ', face: 'emoji:x' }); P.api.soon(); P.run(500); const early = P.out.sent.length; P.run(1000); const first = P.out.sent.slice();
    P.api.soon(); P.run(5000); const again = P.out.sent.length;
    P.set({ face: 'pic:wolf' }); P.api.soon(); P.run(5000); const faceOnly = P.out.sent.length;
    // the next change 0.5 s later waits for the gap, then goes; a hostile color and picture never go
    P.set({ color: 'red;x', avatar: 'data:image/png;base64,AA"x' }); const hostile = P.api.send();
    P.run(500); P.set({ name: 'Ayla V.' }); const tooSoon = P.api.send(); const heldN = P.out.sent.length; P.run(2500); const spaced = P.out.sent.slice(1);
    // at most eight a minute: the ninth waits for the minute
    const M = mkP(); M.api.note(M.prof()); M.api.know(true); let nSent = 0;
    for (let i = 0; i < 9; i++) { M.set({ name: 'N' + i }); M.run(2100); M.api.send(); nSent = M.out.sent.length; }
    const ninthHeld = nSent === 8; M.run(60000); const ninthLater = M.out.sent.length === 9 && M.out.sent[8].profile.name === 'N8';
    // not at the table, the GM's own app, a closed link or another host's connection: nothing
    const L = mkP(); L.api.note(L.prof()); L.api.know(true); L.set({ name: 'Zed' });
    L.net.role = 'host'; const asHost = L.api.send(); L.net.role = 'client'; L.c.open = false; const closed = L.api.send(); L.c.open = true; L.net.syncedPeer = 'other'; const other = L.api.send(); L.net.syncedPeer = 'host1'; L.net.active = false; const off = L.api.send();
    L.net.active = true; L.api.know(false); const forgot = L.api.send(); L.api.know(true); const back = L.api.send();
    check('1.6.4 a seated player\'s profile goes to the GM a moment after it changes (the profileup slice run for real): never to a host whose join snapshot did not say profileSet: true (an older host; a word other than true); a change goes once, as what a roster carries of it (its name, color and picture cleaned as the host cleans a hello\'s, with the profile\'s id) and never the token face; nothing goes when nothing moved since the hello or the last send; a second change inside the gap waits for it, then goes; eight a minute at most, the ninth a minute later; off the table, on the GM\'s own app, over a closed link, to another host\'s connection or once the join begins again nothing goes',
        j(oldHost) === j([false, 0, 0]) && j(oldTruthy) === j([false, 0]) && unchanged === 0 && early === 0
        && j(first) === j([{ type: 'profile-set', profile: { name: 'Ayla Vale', color: '#112233', id: 'u_me' } }]) && again === 1 && faceOnly === 1
        && hostile === true && tooSoon === false && heldN === 2 && j(spaced) === j([{ type: 'profile-set', profile: { name: 'Ayla Vale', id: 'u_me' } }, { type: 'profile-set', profile: { name: 'Ayla V.', id: 'u_me' } }])
        && ninthHeld && ninthLater && [asHost, closed, other, off, forgot].every(x => x === false) && back === true && L.out.sent.length === 1,
        j({ oldHost, oldTruthy, unchanged, early, first, again, faceOnly, tooSoon, heldN, spaced, nSent, ninthLater, L: [asHost, closed, other, off, forgot, back] }));
    // where it is wired: the host's snapshot says it, a player's app reads it as true only and forgets it as each join begins, each hello notes what
    // it told, and a write of the profile asks for a send
    const nn = src.replace(/\r\n/g, '\n'), stg = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'settings.js'), 'utf8').replace(/\r\n/g, '\n');
    const wired2 = [nn.includes('whispers: true, profileSet: true, travelLocked'), nn.includes("if (typeof profileSetKnow === 'function') { profileSetKnow(msg.profileSet); profileSoon(); }"),
        /if \(!isRetry && !probe\) \{ _joinSlow = false;[^\n]*\n    if \(typeof profileSetKnow === 'function'\) profileSetKnow\(false\);/.test(nn),
        nn.includes("try { conn.send(helloA); } catch (e) { sendFailed(e); }\n            if (typeof profileSentNote === 'function') profileSentNote(helloA.profile);"),
        nn.includes("if (typeof profileSentNote === 'function') profileSentNote(profile);   // 1.6.4: what the host was last told of this profile\n            conn.send({ type: 'hello', profile: profile,"),
        stg.includes("function meSoon(k) {\n    if (k === 'wp_profile' && typeof window !== 'undefined' && window.wpNet && typeof window.wpNet.profileSoon === 'function') { try { window.wpNet.profileSoon(); } catch (e) {} }")];
    // the GM is told of a new name at most once in 30 s a player; names changed inside that time are told as one when it ends, from the name
    // told last to the name the roster holds then, and not at all where it went back (the proftell slice run for real)
    {
        const tS = between('// [netcheck:proftell-start]', '// [netcheck:proftell-end]', 'proftell');
        const said = [], logs = [], timers = []; let now = 5e6;
        const netT = { active: true, role: 'host', roster: { pA: { id: 'u_a', name: 'Ayla' } } };
        const TT = new Function('net', 'own', 'cleanRosterName', 'gmNameOf', 'toast', 'logEvent', 'setTimeout', 'Date', tS + '\nreturn profileTell;')(
            netT, H.own, H.cleanRosterName, id => id === 'u_a' ? 'The ranger' : '', t => said.push(t), (k, t) => logs.push(t), (f, ms) => { timers.push({ f, ms }); return timers.length; }, { now: () => now });
        TT('u_a', 'Ayla', 'Ayla Vale'); const s1 = said.slice();
        now += 5000; netT.roster.pA.name = 'Ayla V.'; TT('u_a', 'Ayla Vale', 'Ayla V.'); now += 3000; netT.roster.pA.name = 'Ayla Starling'; TT('u_a', 'Ayla V.', 'Ayla Starling');
        const held = [said.length, timers.length, timers[0] && timers[0].ms];
        now += 22000; timers[0].f(); const s2 = said.slice(1);
        now += 1000; netT.roster.pA.name = 'Ayla Q'; TT('u_a', 'Ayla Starling', 'Ayla Q'); now += 1000; netT.roster.pA.name = 'Ayla Starling'; TT('u_a', 'Ayla Q', 'Ayla Starling'); now += 30000; timers[1].f(); const back = said.length;
        now += 31000; netT.roster.pA.name = 'Bo'; TT('u_a', 'Ayla Starling', 'Bo'); const later = said.slice(2);
        check('1.6.4 a new name is told to the GM at most once in 30 s a player (the proftell slice run for real): the first at once with the GM\'s own name for them; two more inside the time are held as one telling, said when it ends from the name told last to the one the roster holds then; a name that went back is not told; after the time a new name is told at once; each telling is a line of the Game Record too',
            j(s1) === j(['Ayla is now called Ayla Vale. You still call them The ranger.']) && j(held) === j([1, 1, 25000]) && j(s2) === j(['Ayla Vale is now called Ayla Starling. You still call them The ranger.'])
            && back === 2 && j(later) === j(['Ayla Starling is now called Bo. You still call them The ranger.']) && logs.length === 3,
            j({ s1, held, s2, back, later, logs }));
    }
    // Fulllion, 2026-11-23 ("Refuse it, tell the GM", then "yes, the known, but able to be swapped if needed easily", "Yes, reserve GM words",
    // "Yes, catch look-alikes"): no one at the table goes by a name someone else there goes by (the nameclash slice run for real)
    {
        const cS = between('// [netcheck:nameclash-start]', '// [netcheck:nameclash-end]', 'nameclash');
        const mkN = () => {
            const W = { said: [], logs: [], notes: [], saves: 0, rosters: 0, now: 7e6, me: { name: 'Gale' } };
            const cn = (peer, open) => ({ peer, open, send: m => W.notes.push(peer + ':' + m.text) });
            W.net = { active: true, role: 'host', conns: [cn('pA', true), cn('pB', true), cn('pC', false), cn('pW', true), cn('pY', true)],
                roster: { pA: { id: 'u_a', name: 'Ayla' }, pB: { id: 'u_b', name: 'Bram  Stone' }, pC: { id: 'u_c', name: 'Cato' }, pY: { id: 'u_ay', name: 'BO' } } };
            W.camp = { players: { u_a: { name: 'Ayla', key: 'k1' }, u_d: { name: 'Dana', key: 'k2' }, u_e: { name: 'Bram Stone', key: 'k3' },
                u_bo: { name: 'Bo', key: 'k4', firstSeen: 100 }, u_ay: { name: 'BO', key: 'k5', firstSeen: 50, nameAt: 5000 }, u_nk: { name: 'bo' } } };
            W.C = new Function('net', 'own', 'validProfileId', 'cleanRosterName', 'getProfile', 'toast', 'logEvent', 'Date', 'getActiveCampaign', '_satIds', 'sendFailed', 'save', 'broadcastRoster',
                cS + '\nreturn { nameKey, nameSame, nameReserved, nameClash, nameTaken, nameOwner, nameFree, clashTell, clashJudge, clashKeptSay, nameWanters, nameGive, nameSetTable, CLASH_WORDS, CLASH_GM_WORDS };')(
                W.net, H.own, H.validProfileId, H.cleanRosterName, () => W.me, t => W.said.push(t), (k, t, o) => W.logs.push([t, o.x]), { now: () => W.now }, () => W.camp, { u_d: 1, u_e: 1, u_a: 1 }, () => {}, () => { W.saves++; }, () => { W.rosters++; });
            return W;
        };
        const A = mkN(), C = A.C;
        const keys = [C.nameKey('K\u0430el') === C.nameKey('Kael'), C.nameKey('\u039aael') === C.nameKey('kael'), C.nameSame('AyIa', 'Ayla'), C.nameSame('B0', 'bo'), C.nameKey('\uff21yla') === C.nameKey('ayla'),
            C.nameKey('Ay\u00adla') === C.nameKey('Ayla'), C.nameKey('\u0420\u0430\u0441') === C.nameKey('Pac'), C.nameKey('Player'), C.nameKey('PLAYER'), C.nameKey('Kael') === C.nameKey('Kaei'), C.nameKey('Bo') === C.nameKey('Bob'),
            C.nameSame('MIA', 'Mia'), C.nameSame('KAI', 'Kai'), C.nameSame('Ian', 'Lan'), C.nameSame('ELI', 'Ell'), C.nameSame('PIayer', 'Player'), C.nameKey('P1ayer')];
        const resv = ['GM', 'g m', 'Game  Master', 'gamemaster', 'G\u0410ME MASTER', '\u0262M', 'Gemma', 'Gm Bob', 'Game Masters'].map(C.nameReserved);
        const hits = [C.nameClash('u_x', '  bram stone '), C.nameClash('u_b', 'BRAM STONE'), C.nameClash('u_x', 'cato'), C.nameClash('u_x', 'GALE'), C.nameClash('u_x', 'player'),
            C.nameClash('u_x', 'Ay\u200bla'), C.nameClash('u_x', 'Ayl\u0430'), C.nameClash('u_x', 'Waiting')].map(h => h ? (h.gm ? 'gm' : h.id) : null);
        check('1.6.4 names are compared by one key (the nameclash slice run for real): look-alike letters of the Cyrillic and Greek alphabets read as the Latin ones they look like, and by a second key as seen, a capital I, a small l and a 1 one mark and 0 an o (so MIA is Mia and AyIa is Ayla, while Lan is not Ian), the forms of one letter made one, characters that show as nothing taken out, case and spaces as one; "Player" has none; GM, Game Master and Gamemaster in any case, spacing or look-alike letters are kept for the GM; a name is in use where another player admitted and connected now, or the GM, goes by it',
            j(keys) === j([true, true, true, true, true, true, true, '', '', false, false, true, true, false, false, false, '']) && j(resv) === j([true, true, true, true, true, false, false, false, false])
            && j(hits) === j(['u_b', null, null, 'gm', null, 'u_a', 'u_a', null]), j({ keys, resv, hits }));
        // the GM's notices, folded as before
        C.clashTell('u_a', 'Ayla', 'Bram Stone'); C.clashTell('u_a', 'Ayla', 'Bram Stone'); const t1 = A.said.length;
        A.now += 3000; C.clashTell('u_x', '', 'ayla'); A.now += 3000; C.clashTell('u_y', '', 'ayla'); A.now += 3000; C.clashTell('u_z', '', 'ayla'); const t2 = A.said.length;
        A.now += 31000; C.clashTell('u_w', '', 'cato'); const t3 = A.said.slice(2);
        A.now += 1000; C.clashTell('u_v', '', 'GM', true, true); const t4 = A.said.slice(3);
        check('1.6.4 the GM is told of a rename at most once in 30 s a player and once in 2 s in all, of tries to join at most once in 30 s in all with how many more came, and always where their own yes is undone, a name kept for the GM said as such',
            t1 === 1 && t2 === 2 && j(t3) === j(['Someone tried to join as cato, which someone at the table already goes by. They were asked to pick another name. 2 more tries like it came before this one.'])
            && j(t4) === j(['Someone tried to join as GM, which is kept for the GM. They were asked to pick another name.']) && A.logs.every(l => l[1] === 'Name already in use'), j(A.said));
        // the name's holder: the record that has held it the longest with a table key. At the gate a claim of it goes on to the key; proven, the
        // holder takes it back and whoever went by it is given a name for now, told why, and wants it back; anyone else is turned away
        const B = mkN(), CB = B.C;
        const own1 = [CB.nameOwner(CB.nameKey('bo')), CB.nameOwner(CB.nameKey('Dana')), CB.nameOwner(CB.nameKey('nobody'))];
        const gate = CB.clashJudge({ id: 'u_bo', name: 'Bo' }, 'pBo', false, 'gate'), gateNk = CB.clashJudge({ id: 'u_nk', name: 'bo' }, 'pNk', false, 'gate');
        const unproven = CB.clashJudge({ id: 'u_bo', name: 'Bo' }, 'pBo', true, '');
        const proven = CB.clashJudge({ id: 'u_bo', name: 'Bo' }, 'pBo', false, 'proven');
        const after = [B.net.roster.pY.name, B.camp.players.u_ay.name, B.camp.players.u_ay.wanted, typeof B.camp.players.u_ay.nameAt === 'number' && B.camp.players.u_ay.nameAt > 5000, B.saves];
        const toldBack = B.said.filter(t => /^Bo is back and keeps their name\./.test(t)), noteBack = B.notes.slice();
        check('1.6.4 a name\'s holder keeps it (Fulllion: "yes, the known"): the record holding it the longest with a table key, whoever reconnects first; at the gate a claim of it goes on to prove the key, a claim by a record with no key is turned away; unproven (a join the GM let in) it is turned away; proven, the holder takes it back: the player who went by it is "Player 2" for now on the roster and the record, told why, wants the name back, and the GM is told',
            j(own1) === j(['u_bo', 'u_d', '']) && gate === '' && gateNk === 'clash' && unproven === 'clash' && proven === ''
            && j(after) === j(['Player 2', 'Player 2', 'BO', true, 1]) && toldBack.length === 1 && j(noteBack) === j(['pY:Bo is back, and this table knows them by that name, so you are Player 2 here for now. Pick another name in Your profile.']),
            j({ own1, gate, gateNk, unproven, proven, after, said: B.said, noteBack }));
        // the GM gives the name back in Player History (nameGive): the record that wants it goes by it, the one that had it is given a name for now
        // and wants it; both told; the roster sent again. Only to a record that wants this very name
        B.notes.length = 0; B.net.roster.pBo = { id: 'u_bo', name: 'Bo' }; B.net.conns.push({ peer: 'pBo', open: true, send: m => B.notes.push('pBo:' + m.text) });
        const wants = CB.nameWanters(B.camp, 'u_bo'), refuse = CB.nameGive(B.camp, 'u_bo', 'u_nk'), gave = CB.nameGive(B.camp, 'u_bo', 'u_ay');
        const swapped = [B.camp.players.u_ay.name, B.camp.players.u_ay.wanted, B.camp.players.u_bo.name, B.camp.players.u_bo.wanted, B.net.roster.pY.name, B.net.roster.pBo.name, B.rosters, CB.nameWanters(B.camp, 'u_ay')];
        check('1.6.4 the GM can swap a name (Fulllion: "able to be swapped if needed easily"): Player History offers to give a record\'s name to each record that wants it; given, that player goes by it on the roster and the record, the one who had it is given a name for now and wants it back, both are told and the roster goes again; a record that does not want the name is given nothing',
            j(wants) === j(['u_ay']) && refuse === '' && gave === 'Player 3' && j(swapped) === j(['Bo', undefined, 'Player 3', 'Bo', 'Bo', 'Player 3', 1, ['u_bo']])
            && B.camp.players.u_ay.tableName === 'Bo' && !('tableName' in B.camp.players.u_bo)
            && j(B.notes) === j(['pY:The GM gave you the name Bo at this table. Your own name stays yours everywhere else.', 'pBo:The GM gave the name Bo to another player, so you are Player 3 here. Pick another name in Your profile.']),
            j({ wants, refuse, gave, swapped, notes: B.notes }));
        // Fulllion, 2026-11-24 ("it should only count for that campaign not their actual profile name"; "any name to anyone the gm desires, if they
        // match 100%, one needs to change"): the GM's Rename\u2026 sets a TABLE NAME, which holds here over every other claim (nameSetTable run for real)
        const T = mkN(), CT = T.C;
        const set1 = CT.nameSetTable(T.camp, 'u_ay', '  Ranger '), at1 = [T.net.roster.pY.name, T.camp.players.u_ay.tableName, T.camp.players.u_ay.name, T.rosters, T.notes.slice()];
        const refusals = [CT.nameSetTable(T.camp, 'u_d', 'AYLA  '), CT.nameSetTable(T.camp, 'u_e', 'ranger'), CT.nameSetTable(T.camp, 'u_d', 'gale'), CT.nameSetTable(T.camp, 'u_d', 'Game  Master'), CT.nameSetTable(T.camp, 'u_zz', 'X'), CT.nameSetTable(T.camp, 'u_ay', 'Ranger')];
        const lookAlike = CT.nameSetTable(T.camp, 'u_d', 'Ayl\u0430');   // a look-alike is the GM's own pick to make
        const owner = CT.nameOwner(CT.nameKey('ranger'));
        // what they go by here, whatever their app says, and they are told so after their snapshot; nobody else may take it, at the table or away
        T.notes.length = 0; const pGate = { id: 'u_ay', name: 'Ayla Q' }, jg = CT.clashJudge(pGate, 'pGate', false, 'gate');   // at the gate the name they typed stands (the GM's question shows it); the table name comes as they are let in
        const pQ = { id: 'u_ay', name: 'Ayla Q' }, jq = CT.clashJudge(pQ, 'pQ', false, 'proven');
        T.net.roster.pQ = { id: 'u_ay', name: 'Ranger' }; const said = []; CT.clashKeptSay({ peer: 'pQ', send: m => said.push(m.text) });
        T.net.conns = T.net.conns.filter(c => c.peer !== 'pY'); delete T.net.roster.pY; delete T.net.roster.pQ;
        const away = [CT.clashJudge({ id: 'u_s', name: 'RANGER' }, 'pS'), (CT.nameTaken('u_s', 'R\u0430nger') || {}).table === true, CT.nameFree('u_x')];
        const off = CT.nameSetTable(T.camp, 'u_ay', '   '), offAt = [T.camp.players.u_ay.tableName, T.camp.players.u_ay.name], offAgain = CT.nameSetTable(T.camp, 'u_ay', '');
        check('1.6.4 a table name (Fulllion: for that campaign alone): the GM sets any name, kept on the record as tableName and on the roster, the player told; refused only where it is exactly another player\'s name here (case and spacing aside) or another record\'s table name, or the GM\'s own, or a word kept for the GM (a look-alike is the GM\'s own pick); it holds the name before any other record; a player with one goes by it here whatever their app says and is told after their snapshot; nobody else may take it, at the table or away, nor by a look-alike; an empty name takes it off',
            j(set1) === j({ ok: true, name: 'Ranger' }) && j(at1) === j(['Ranger', 'Ranger', 'Ranger', 1, ['pY:At this table you go by Ranger now, the name the GM set for you here. Your own name stays yours everywhere else.']])
            && j(refusals) === j([{ why: 'taken', who: 'Ayla' }, { why: 'taken', who: 'Ranger' }, { why: 'taken', who: 'you' }, { why: 'reserved' }, { why: 'none' }, { why: 'same' }])
            && lookAlike.ok === true && owner === 'u_ay' && jg === '' && pGate.name === 'Ayla Q' && jq === '' && pQ.name === 'Ranger'
            && j(said) === j(['At this table you go by Ranger, the name the GM set for you here. Your own name stays yours everywhere else.'])
            && j(away) === j(['table', true, 'Player 2']) && j(off) === j({ ok: true, off: true }) && j(offAt) === j([undefined, 'Ranger']) && j(offAgain) === j({ why: 'same' }),
            j({ set1, at1, refusals, lookAlike, owner, jq, said, away, off, offAt, offAgain }));
        // Fulllion, 2026-11-24: clearing a table name while the player is seated puts their own name back at once: the name their app goes by
        // (appName, from its hello and each change since), judged as a rename is; one not free here leaves them under the name they had, told why
        const U = mkN(), CU = U.C;
        U.net.roster.pA.appName = 'Ayla Own'; CU.nameSetTable(U.camp, 'u_a', 'Ranger'); U.notes.length = 0; U.rosters = 0;
        const back = CU.nameSetTable(U.camp, 'u_a', ''), backAt = [U.net.roster.pA.name, U.camp.players.u_a.name, U.camp.players.u_a.tableName, U.rosters, U.notes.slice()];
        CU.nameSetTable(U.camp, 'u_a', 'Ranger'); U.notes.length = 0; U.net.roster.pA.appName = 'bram stone';
        const blocked = CU.nameSetTable(U.camp, 'u_a', ''), blockedAt = [U.net.roster.pA.name, U.camp.players.u_a.wanted, U.notes.slice()];
        CU.nameSetTable(U.camp, 'u_a', 'Ranger'); U.notes.length = 0; U.net.roster.pA.appName = 'Game Master';
        const gmWord = CU.nameSetTable(U.camp, 'u_a', ''), gmAt = U.net.roster.pA.name;
        check('1.6.4 clearing a table name while the player is seated (Fulllion: their own name back at once): the name their app goes by is put back on the roster and their record and the roster goes again, they are told; one in use here, or kept for the GM, leaves them under the name they had for now, told why (a wish kept for a name in use)',
            j(back) === j({ ok: true, off: true, back: 'Ayla Own' }) && j(backAt) === j(['Ayla Own', 'Ayla Own', undefined, 1, ['pA:The GM took off the name you went by at this table, so you go by your own name, Ayla Own, here again.']])
            && j(blocked) === j({ ok: true, off: true, kept: 'Ranger', own: 'bram stone' }) && j(blockedAt) === j(['Ranger', 'bram stone', ['pA:The GM took off the name you went by at this table. Your own name, bram stone, is not free here, so you go by Ranger for now. Pick another name in Your profile.']])
            && j(gmWord) === j({ ok: true, off: true, kept: 'Ranger', own: 'Game Master' }) && gmAt === 'Ranger', j({ back, backAt, blocked, blockedAt, gmWord }));
        // the review of table names: someone else at the table who goes by a table name is pushed aside only by its holder proven (unproven, the
        // holder is turned away); a table name is never pushed aside, and two the GM picked that look alike both stand; the holder of a table name
        // is found by a name that looks like it; a word kept for the GM, as a table name from a file, is never enforced; a name of no letters is none
        const V = mkN(), CV = V.C;
        V.camp.players.u_a.tableName = 'Ayla';   // u_a (connected as pA) holds Ayla as a table name
        V.camp.players.u_t = { name: 'Tess', key: 'k9', tableName: 'Bram  Stone' };   // u_t holds the name u_b (connected) goes by
        const unprovenT = CV.clashJudge({ id: 'u_t', name: 'Tess' }, 'pT', true, ''), provenT = CV.clashJudge({ id: 'u_t', name: 'Tess' }, 'pT', false, 'proven');
        const pushed = [V.net.roster.pB.name, V.camp.players.u_t.tableName];
        V.camp.players.u_l = { name: 'Lia', key: 'k10', tableName: 'AI' };
        const lookOwner = [CV.nameOwner(CV.nameKey('Al'), 'Al'), CV.nameOwner(CV.nameKey('Al'))];
        V.net.roster.pL = { id: 'u_l', name: 'AI' }; V.net.conns.push({ peer: 'pL', open: true, send() {} });
        const keepTable = [CV.clashJudge({ id: 'u_x2', name: 'Al' }, 'pX', false, 'proven'), V.net.roster.pL.name];
        V.camp.players.u_g = { name: 'Gus', key: 'k11', tableName: 'GM' }; const gProf = { id: 'u_g', name: 'Gus' }, gRes = CV.clashJudge(gProf, 'pG2', false, 'proven');
        const noKey = CV.nameSetTable(V.camp, 'u_d', 'Player');
        check('1.6.4 table names hold (the review): someone at the table who goes by another\'s table name is pushed aside by that holder once proven, and the holder unproven is turned away; a table name is never pushed aside; a table name is found by a name that looks like it; a word kept for the GM as a table name from a file is never enforced; "Player" as a table name is none',
            unprovenT === 'clash' && provenT === '' && j(pushed) === j(['Player 2', 'Bram  Stone']) && j(lookOwner) === j(['u_l', '']) && j(keepTable) === j(['clash', 'AI'])
            && gRes === '' && gProf.name === 'Gus' && j(noKey) === j({ why: 'same' }), j({ unprovenT, provenT, pushed, lookOwner, keepTable, gRes, gProf, noKey }));
        // older records (no nameAt, from before names were judged): one alone is the holder, two leave it to the GM's Give; two that took a name at
        // the same moment go to the one seen last; a name is never given while someone else at the table goes by it; a name for now avoids the one given
        const E = mkN(), CE = E.C;
        Object.assign(E.camp.players, { u_o1: { name: 'Rin', key: 'x1', firstSeen: 1 }, u_o2: { name: 'rin', key: 'x2', firstSeen: 2 }, u_t1: { name: 'Tam', key: 'x3', nameAt: 900, lastSeen: 10 }, u_t2: { name: 'TAM', key: 'x4', nameAt: 900, lastSeen: 20 } });
        const holders = [CE.nameOwner(CE.nameKey('rin')), CE.nameOwner(CE.nameKey('tam')), CE.nameOwner(CE.nameKey('bo'))];
        E.camp.players.u_nk.wanted = 'Bo'; E.camp.players.u_nk.key = 'k6';
        const busy = CE.nameGive(E.camp, 'u_bo', 'u_nk'), untouched = [E.camp.players.u_bo.name, E.camp.players.u_nk.name, E.notes.length], free = CE.nameFree('u_x', 'Player 2');
        check('1.6.4 the holder by age (the review of the holder): a record from before names were judged holds its name where it is the only such record, and where two such records share it the table names no holder (the GM gives it); two that took a name at the same moment go to the one seen last; a name is never given while someone else at the table goes by it, and nothing changes; a name for now is never the name being given',
            j(holders) === j(['', 'u_t2', 'u_bo']) && busy === 'busy' && j(untouched) === j(['Bo', 'bo', 0]) && free === 'Player 3', j({ holders, busy, untouched, free }));
        // a stranger, a name kept for the GM, and players seated here this session (u_d, u_e, u_a) who come back
        const D = mkN(), CD = D.C;
        const pS = { id: 'u_s', name: 'ayla' }, pG = { id: 'u_s2', name: 'Game Master' }, pD = { id: 'u_d', name: 'AYLA' }, pE = { id: 'u_e', name: 'Ayla' }, pF = { id: 'u_d', name: 'Dana' }, pR = { id: 'u_e', name: 'gm' };
        const jd = [CD.clashJudge(pS, 'pS'), CD.clashJudge(pG, 'pG'), CD.clashJudge(pD, 'pD'), pD.name, D.camp.players.u_d.wanted, CD.clashJudge(pE, 'pE'), pE.name, CD.clashJudge(pF, 'pF'), CD.clashJudge(pR, 'pR'), pR.name, D.camp.players.u_s];
        D.net.roster.pD = { id: 'u_d', name: 'Dana' }; D.net.roster.pR = { id: 'u_e', name: 'Player 2' }; const sent = [];
        CD.clashKeptSay({ peer: 'pD', send: m => sent.push(m.text) }); CD.clashKeptSay({ peer: 'pD', send: m => sent.push(m.text) }); CD.clashKeptSay({ peer: 'pR', send: m => sent.push(m.text) });
        check('1.6.4 a joiner under a name in use, or one kept for the GM, is turned away in words of its own; a player seated here this session comes back under their record\'s name, told why once after their snapshot (no wish kept for a join that proved no key); one whose record\'s name is in use too, and who is not its holder proven, comes back under a name for now, never beside the one who goes by it',
            j(jd) === j(['clash', 'reserved', '', 'Dana', null, '', 'Player 2', '', '', 'Player 2', null])
            && j(sent) === j(['Someone at this table already goes by AYLA, so you are Dana here. Pick another name in Your profile.', 'GM and Game Master are kept for the GM, so you are Player 2 here. Pick another name in Your profile.'])
            && CD.CLASH_WORDS === 'Someone at this table already goes by that name. Pick another name, then join again.' && CD.CLASH_GM_WORDS === 'GM and Game Master are kept for the GM. Pick another name, then join again.',
            j({ jd, sent }));
        const nn3 = src.replace(/\r\n/g, '\n');
        const wired3 = [nn3.includes("var clashH = typeof clashJudge === 'function' ? clashJudge(prof, conn.peer, false, 'gate') : '';") && nn3.indexOf('var clashH = ') > nn3.indexOf("if (!pwRight) { pwMiss(); return; }") && nn3.indexOf('var clashH = ') < nn3.indexOf('var keyed0 = '),
            nn3.includes("    var clashA = typeof clashJudge === 'function' ? clashJudge(prof, conn.peer, true, provenKey ? 'proven' : '') : '';") && nn3.indexOf('var clashA = ') < nn3.indexOf('net.roster[conn.peer] = prof;'),
            nn3.indexOf('var clashP = ') > nn3.indexOf("if (!allow('profile-set',") && nn3.indexOf('var clashP = ') < nn3.indexOf('var wasP = cleanRosterName(pcP.name), movN ='),
            nn3.includes("var inP = function() { var clashI = typeof clashJudge === 'function' ? clashJudge(prof, conn.peer, false, 'proven') : '';"),
            nn3.indexOf("clashJudge(next.prof, next.conn.peer, true, '')") > 0 && nn3.indexOf("clashJudge(next.prof, next.conn.peer, true, '')") < nn3.indexOf("mv = campT ? takeOver(campT, pid, next.prof.id, pk.moves())"),
            nn3.includes("    if (snapOk && typeof clashKeptSay === 'function') clashKeptSay(conn);") && nn3.indexOf('clashKeptSay(conn);') > nn3.indexOf('conn.send(snap); snapOk = true;'),
            nn3.includes("if (nameMovedA) { rec.nameAt = Date.now();") && nn3.includes("recP.nameAt = Date.now(); delete recP.wanted;"),
            nn3.includes("    } else if (btn.dataset.rename) {\n        nameRenameAsk(camp, btn.dataset.rename);") && nn3.includes("'<button class=\"tool ghost player-act\" data-rename=\"' + escTextRoster(pid) + '\"")
            && nn3.indexOf("if (recT0 && typeof recT0.tableName === 'string' && (typeof nameKey !== 'function' || (nameKey(recT0.tableName) && !nameReserved(recT0.tableName))) && cleanRosterName(pcP.name) !== nmP) {") > nn3.indexOf("if (!allow('profile-set',") && nn3.indexOf('if (recT0 && typeof recT0.tableName') < nn3.indexOf('var clashP = ')
            && nn3.includes("    } else if (btn.dataset.namegive) {\n        nameGiveAsk(camp, btn.dataset.namefrom, btn.dataset.namegive);")
            && /if \(mv\.kept\) \{[^\n]*\n\s*delete nr\.was;\n\s*delete o\.tableName;/.test(nn3) && nn3.includes("'<button class=\"tool ghost player-act\" data-namegive=\"' + escTextRoster(wid) + '\" data-namefrom=\"' + escTextRoster(pid) + '\"")];
        check('1.6.4 the name is judged where a name comes to the table: at the hello gate after the bans, the version and the password and before the key or the GM is asked; once a key is proven, before an old connection is closed for the new one; before Same person as moves anything; again as a player is let in (proven or not), before the roster takes them; by profile-set after its limit; a seated player back under their old name is told after their snapshot; a record keeps when it took its name; Player History gives a name in one press',
            wired3.every(Boolean), j(wired3));
    }
    check('1.6.4 profile-set is wired: the host\'s join snapshot says profileSet: true; a player\'s app reads it as true only and sends a change made while it waited; every join forgets it, a retry\'s too; each hello notes what it told the host; each write of the profile asks for a send',
        wired2.every(Boolean), j(wired2));
}
T.finish();
