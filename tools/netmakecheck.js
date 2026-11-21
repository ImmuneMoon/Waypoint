/* netmakecheck.js: a character and a token coming to the table, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 5, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: the waiting token (Onboarding F1a), faces (F1b), a character's own picture
   (F1c), a character a player makes (F3a: char-make, char-name, char-done), grid-shaped incoming tokens (the waiting token and Just a
   token), the token creator (a token's kept original never leaving the host, and a player's framed picture: tok-pic), and a file that
   fills a character in the making (F4, charfill).
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netmakecheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, ordersSrc } = kit.netSlices('netmakecheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, siSrc } = kit.netHarness('netmakecheck');
const j = JSON.stringify;
// Onboarding F1a: the waiting token — the client's cleaner, and the host's section run for real with the real systemcore (one per player per
// campaign, moved not copied, gone once they have a token, the GM's Remove, the grace after a leave, the end of the session), the rules'
// push and a client's take of it, the free spot, and the hooks on the paths that end a player's stay
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js'));
    const good = H.cleanWaitingItem({ id: 'wbq1', type: 'image', waiting: 1, ownerId: 'u_a', name: 'Ana\u202e<b>', color: '#112233', x: 1e9, y: 5, w: 60, h: 52, src: 'https://evil/x.png', isChar: true, charId: 'c_1', face: 'x', sheet: {}, gmInfo: 'secret', hidden: true, layer: 'front' });
    check('F1a cleanWaitingItem (client): a waiting token from the host is rebuilt from its own fields only — its grid shape (a hexagon or a square; anything else a circle), its owner, a clean name, a hex color, bounded geometry, hidden only when true; a picture, a character link, a sheet or GM info never come through',
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
    check('F1a placeWaiting: the first makes one waiting token (a circle with their clean name and color, at the spawn spot) and tells the GM once (a toast and a Game Record "char" line); on another map it MOVES there under a fresh id (never two items with one id on a map: a stroke planted with its id cannot collide; the old map loses it, both maps reported); on its own map nothing changes',
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
        /if \(\(lw\.isChar \|\| lw\.waiting\) && typeof moveRefused === 'function'\) \{[\s\S]{0,1400}?\n\s*if \(lw\.waiting\) \{ if \(lw\.x !== w\.x/.test(require('./checkkit').part('netfog.js')) && /var wMaps = settleWaiting\(camp, pid, map, src\.op, landRoomId, opts\.near/.test(src) && /wMaps\.indexOf\(myActive\.activeItemId\) >= 0\)\) render\(\);/.test(src)
        && /function waitingChanged\(camp, maps\) \{\n\s*if \(!maps \|\| !maps\.length\) return;\n\s*if \(window\.wpHistFlush\) window\.wpHistFlush\(\);/.test(src.replace(/\r\n/g, '\n')) && /if \(key\) net\.kickPlayer\(key\);\n\s*dropWaitingFor\(pid\);/.test(src.replace(/\r\n/g, '\n')) && /if \(net\.active && net\.role !== 'host'\) \{ refreshNewPlayersBox\(\); return; \}/.test(require('./checkkit').part('netfog.js')));
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
        && /if \(w\.hidden \|\| !\(w\.isChar \|\| w\.waiting\) \|\|/.test(src) && /if \(lw\.waiting\) \{ if \(lw\.x !== w\.x \|\| lw\.y !== w\.y\) \{ lw\.x = w\.x; lw\.y = w\.y; changed = true; \} return; \}/.test(require('./checkkit').part('netfog.js')));
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
    check('F1b faceView: a bundled picture is the app\'s own asset (square art); an emoji is text; their picture only when it passes whole; the default (or a face the rule refuses) is the silhouette on their color, and "default" wins over a picture',
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
    const expAt = src.indexOf('net.FACE_PICS = FACE_PICS.slice()'), helpEnd = src.indexOf('// [netcheck:helpers-end]'), picsAt = src.indexOf('var FACE_PICS = [');   // net.js's own list (systemcore.js's copy stands in cleancore.js)
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
        // 1.6.3 (the multiplayer review, finding 15), moved on purpose: a player's reconnect holds the board as a pause does, so each gate below reads net.reconnecting beside the pause and the hold
        && /net\.sendMyLook = function\(\) \{\n\s*if \(!net\.active \|\| net\.role !== 'client' \|\| net\.paused \|\| net\.selfPaused \|\| net\.selfHeld \|\| net\.reconnecting \|\| !net\.syncedPeer/.test(src.replace(/\r\n/g, '\n')), j([lOk, lClr, lBad, lPause, lRate]));
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
        check('F1c char-pic (host, run for real): the owner\'s face or uploaded picture reaches applyCharFace as a plan (\'photo\' reads the picture on their roster entry), replacing its picture; the answer, the GM\'s toast and the Game Record line wait until it is saved, and one that could not be saved is answered so, told to no one; another\'s character, an NPC, a paused table or player, sheets off, a missing character, a face the rule refuses, a picture that fails the whole-string check (with a good face too) or a flood (per player and table-wide) is refused and answered why; a stranger or a bad rid gets nothing',
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
    const scF = require('./checkkit').part('cleancore.js');   // systemcore.js's face rule stands in its part cleancore.js, read by name
    const faceRule = s => { const a = s.indexOf('var FACE_PICS = ['), b = s.indexOf('function cleanFace(v) {'), e = s.indexOf('\n}\n', b); return a < 0 || b < 0 || e < 0 ? null : s.slice(a, s.indexOf('\n', a)) + '\n' + s.slice(b, e + 2); };   // read on cleancore.js's text (scF) and on net.js's (ps)
    check('F1c the face rule is one rule: systemcore.js (a character\'s face, on load and from the wire) carries net.js cleanFace and its picture list word for word',
        faceRule(scF) !== null && faceRule(scF) === faceRule(ps));
}
// Onboarding F3a: a character a player makes — the host's char-make / char-name / char-done (the [netcheck:charmake|charname|chardone] slices,
// run for real with the real systemcore), the player's answers and the GM's verdict (charmakeans, charreview), who hears of one in the making
// (syncChar, syncCharGone, sendCharTo, charReview, sliced), and the refusals of a character not yet in play
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const lineOf = (k, file) => { const t = typeof file === 'string' ? require('./checkkit').part(file) : src, i = t.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return t.slice(i, t.indexOf('\n', i)); };   // file: a part of net.js, read by its own name
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
    const m1 = table().run(mkSrc, { type: 'char-make', rid: 'k1', name: ' Pax\u202e  the\u200b Bold ' }), id1 = m1.answer[0] && m1.answer[0].charId, c1 = m1.camp.chars[id1];
    check('F3a char-make (host, run for real): an admitted player starts one — in the making and made by them (theirs, no values, no picture), its name cleaned (bidi and zero-width out, spaces collapsed), saved, sent to them alone, the GM told (toast and log), answered with its id',
        /^c_[a-z0-9]+$/.test(id1 || '') && j(m1.answer) === j([{ ok: true, charId: id1, type: 'char-make-ans', rid: 'k1' }]) && c1 && c1.making === 1 && c1.made === 1 && c1.ownerId === 'u_a' && c1.name === 'Pax the Bold' && c1.npc === false && c1.portrait === '' && j(c1.values) === '{}'
        && j(m1.sentTo) === j([['u_a', id1]]) && m1.saves === 1 && j(m1.toasts) === j(['Pat is making a character (Pax the Bold).']) && j(m1.logs) === j([['char', 'Pat is making a character (Pax the Bold)']]) && j(m1.allowed) === j(['charmake']), j([m1.answer, c1, m1.sentTo, m1.toasts]));
    const mBlank = table().run(mkSrc, { type: 'char-make', rid: 'k1', name: '\u200b ' }), mNum = table().run(mkSrc, { type: 'char-make', rid: 'k1', name: 7 });
    m1.run(mkSrc, { type: 'char-make', rid: 'k2', name: 'Another' });
    const mAgainSlow = table({ slow: 'charmakeagain', chars: { c_q: { id: 'c_q', name: 'Q', ownerId: 'u_a', npc: false, making: 1, made: 1, values: {} } } }).run(mkSrc, { type: 'char-make', rid: 'k2', name: 'Again' });
    check('F3a char-make: a blank or non-text name takes their table name; asking again while making gives the same one (sent again, no second; a light rate bucket of its own, never a real make\'s)',
        mBlank.camp.chars[mBlank.answer[0].charId].name === 'Pat' && mNum.camp.chars[mNum.answer[0].charId].name === 'Pat' && mine(m1).length === 1 && m1.answer[1].charId === id1 && m1.answer[1].ok === true && m1.sentTo.length === 2 && j(m1.allowed) === j(['charmake', 'charmakeagain']) && m1.camp.chars[id1].name === 'Pax the Bold'
        && j(mAgainSlow.answer) === j([{ reason: 'slow', type: 'char-make-ans', rid: 'k2' }]) && mAgainSlow.sentTo.length === 0 && mine(mAgainSlow).length === 1, j([m1.answer, m1.allowed, mAgainSlow.answer]));
    const busyChars = {}; for (let i = 0; i < 12; i++) busyChars['c_m' + i] = { id: 'c_m' + i, name: 'M' + i, ownerId: 'u_x' + i, npc: false, making: 1, values: {} };
    const eleven = Object.assign({}, busyChars); delete eleven.c_m11;
    const refused = (t, why) => j(t.answer) === j([{ reason: why, type: 'char-make-ans', rid: 'k1' }]) && mine(t).length === (t.had || 0) && t.saves === 0 && t.toasts.length === 0 && t.sentTo.length === 0;
    const mk = o => table(o).run(mkSrc, { type: 'char-make', rid: 'k1', name: 'Pax' });
    const have = mk({ chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } } }); have.had = 1;
    const busy = mk({ chars: busyChars }), notBusy = mk({ chars: eleven });
    check('F3a char-make refused and answered why, nothing made: they play a character already (have); a dozen being made at the table (busy; eleven is fine); making not open (the GM\'s invite or off, sheets off, no system: closed); a paused table or player (paused); the rate (slow, after the other gates)',
        refused(have, 'have') && refused(busy, 'busy') && notBusy.answer[0].ok === true && ['invite', 'off'].every(r => refused(mk({ rules: { create: r } }), 'closed')) && refused(mk({ sheetsOff: true }), 'closed') && refused(mk({ noSys: true }), 'closed')
        && refused(mk({ paused: true }), 'paused') && refused(mk({ peerPaused: true }), 'paused') && refused(mk({ slow: 'charmake' }), 'slow') && have.allowed.length === 0 && busy.allowed.length === 0, j([have.answer, busy.answer]));
    const silent = t => t.answer.length === 0 && mine(t).length === 0 && t.saves === 0;
    check('F3a char-make: a malformed request id or a peer not admitted (or named like a prototype key) gets no answer and makes nothing',
        silent(table().run(mkSrc, { type: 'char-make', rid: 'k 1', name: 'Pax' })) && silent(table().run(mkSrc, { type: 'char-make', name: 'Pax' })) && silent(table({ from: 'pZ' }).run(mkSrc, { type: 'char-make', rid: 'k1', name: 'Pax' })) && silent(table({ from: '__proto__' }).run(mkSrc, { type: 'char-make', rid: 'k1', name: 'Pax' })));
    // char-name
    const mkC = { c_m: { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, made: 1, values: {} }, c_f: { id: 'c_f', name: 'Fin', ownerId: 'u_a', npc: false, values: {} }, c_o: { id: 'c_o', name: 'Oth', ownerId: 'u_b', npc: false, making: 1, values: {} } };
    const nm = (o, msg) => table(Object.assign({ chars: mkC }, o)).run(nmSrc, Object.assign({ type: 'char-name', rid: 'n1', charId: 'c_m', name: ' Nova\u0007 ' }, msg || {}));
    const n1 = nm(), nRef = (why, o, msg) => { const t = nm(o, msg); return j(t.answer) === j([{ reason: why, type: 'char-name-ans', rid: 'n1' }]) && t.camp.chars.c_m.name === 'Pax' && t.camp.chars.c_f.name === 'Fin' && t.saves === 0 && t.sentTo.length === 0; };
    check('F3a char-name (host, run for real; owner: only while in the making): the owner renames their character in the making (cleaned), saved and sent to them alone; a finished one (notmaking), another\'s (owner), one gone or a prototype id (missing), a name that cleans to nothing (bad), paused, the rate: refused, unchanged',
        j(n1.answer) === j([{ ok: true, type: 'char-name-ans', rid: 'n1' }]) && n1.camp.chars.c_m.name === 'Nova' && j(n1.sentTo) === j([['u_a', 'c_m']]) && n1.saves === 1 && j(n1.allowed) === j(['charname'])
        && nRef('notmaking', {}, { charId: 'c_f' }) && nRef('owner', {}, { charId: 'c_o' }) && nRef('missing', {}, { charId: 'c_9' }) && nRef('missing', {}, { charId: '__proto__' }) && nRef('bad', {}, { name: '\u200b\u202e' }) && nRef('bad', {}, { name: 12 })
        && nRef('paused', { paused: true }) && nRef('slow', { slow: 'charname' }), j(n1));
    // char-done
    const dn = (o, msg) => table(Object.assign({ chars: mkC }, o)).run(dnSrc, Object.assign({ type: 'char-done', rid: 'd1', charId: 'c_m' }, msg || {}));
    const onlyMk = { c_m: mkC.c_m, c_o: mkC.c_o }, d1 = dn({ chars: onlyMk }), dGive = dn({ chars: Object.assign({}, onlyMk, { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } }) }), dClash = dn({ chars: Object.assign({}, onlyMk, { c_v: { id: 'c_v', name: ' pax', ownerId: 'u_b', npc: false, values: {} } }) });
    check('F3a char-done (host, run for real): one in the making goes live — out of the making, marked for the GM\'s review, given to its owner in play with their face copied (a GM give meanwhile keeps theirs in play: owner, 2026-09-27) — as a remote change (not a GM undo step, the history flushed first, the flag restored); the GM told (toast, log); answered ok',
        j(d1.answer) === j([{ ok: true, type: 'char-done-ans', rid: 'd1' }]) && d1.camp.chars.c_m.making === undefined && d1.camp.chars.c_m.review === 1 && d1.camp.chars.c_m.made === 1 && j(d1.gives) === j([['u_a', 'c_m', j({ play: true, pic: true }), undefined, 1, true]])
        && d1.net.applyingRemote === false && d1.flushed === 1 && j(d1.toasts) === j(['Pat finished making Pax. Review it on its sheet.']) && j(d1.logs) === j([['char', 'Pat finished making Pax']]) && j(d1.allowed) === j(['chardone'])
        && dGive.gives.length === 1 && dGive.gives[0][2] === j({ play: false, pic: true }) && j(dGive.answer) === j([{ ok: true, kept: true, type: 'char-done-ans', rid: 'd1' }]) && /^Pat finished making Pax \(the name is also another character\u2019s\)\. Review it on its sheet\.$/.test(dClash.toasts[0] || ''), j([d1, dGive.gives, dClash.toasts]));
    const d2 = dn({ chars: Object.assign({}, mkC, { c_f: { id: 'c_f', name: 'Fin', ownerId: 'u_a', npc: false, unlocked: 1, values: {} } }) }, { charId: 'c_f' });
    check('F3a char-done on an unlocked character: it locks again, marked for review, saved and synced (as a remote change), no give; the GM told',
        j(d2.answer) === j([{ ok: true, type: 'char-done-ans', rid: 'd1' }]) && d2.camp.chars.c_f.unlocked === undefined && d2.camp.chars.c_f.review === 1 && d2.saves === 1 && j(d2.synced) === j([['c_f', true]]) && d2.gives.length === 0 && d2.toasts[0] === 'Pat finished the sheet of Fin. Review it on its sheet.', j(d2));
    const dRef = (why, o, msg) => { const t = dn(o, msg); return j(t.answer) === j([{ reason: why, type: 'char-done-ans', rid: 'd1' }]) && t.gives.length === 0 && t.synced.length === 0 && t.saves === 0 && t.toasts.length === 0 && t.camp.chars.c_m.making === 1 && t.camp.chars.c_m.review === undefined; };
    check('F3a char-done refused and answered why, nothing changed: a finished, locked character (notmaking), another\'s or an NPC (owner), one gone (missing), paused, the rate (slow); a malformed request id is dropped',
        dRef('notmaking', {}, { charId: 'c_f' }) && dRef('owner', {}, { charId: 'c_o' }) && dRef('owner', { chars: Object.assign({}, mkC, { c_n: { id: 'c_n', name: 'N', ownerId: 'u_a', npc: true, making: 1, values: {} } }) }, { charId: 'c_n' }) && dRef('missing', {}, { charId: 'c_9' }) && dRef('missing', {}, { charId: 'constructor' })
        && dRef('paused', { paused: true }) && dRef('paused', { peerPaused: true }) && dRef('slow', { slow: 'chardone' }) && dn({}, { rid: 'd 1' }).answer.length === 0);
    // the player's side: the answers, the GM's verdict
    const mkWhy = lineOf('var MK_WHY = {') + '\n' + lineOf('var TOK_WHY = {') + '\n' + lineOf('var LIGHT_WHY = {') + '\n' + lineOf('var ASK_WHY = {'), ansSrc = between('// [netcheck:charmakeans-start]', '// [netcheck:charmakeans-end]', 'charmakeans');
    const mkAns = (msg, kind) => { const got = [], pend = { k1: { kind, done: a => got.push(a), timer: 1 } }; let cleared = 0; new Function('msg', '_mkPending', 'clearTimeout', mkWhy + '\n' + ansSrc)(msg, pend, () => { cleared++; }); return { got, left: Object.keys(pend).length, cleared }; };
    const aOk = mkAns({ rid: 'k1', ok: true, charId: 'c_ab12' }), aBadId = mkAns({ rid: 'k1', ok: true, charId: '<img>' }), aHave = mkAns({ rid: 'k1', reason: 'have' }), aProto = ['__proto__', 'constructor', 'toString', 'nope', 5].map(r => mkAns({ rid: 'k1', reason: r }).got[0].error), aNo = mkAns({ rid: 'k9', ok: true }), aProtoRid = mkAns({ rid: '__proto__', ok: true }), aKept = mkAns({ rid: 'k1', ok: true, kept: true }), aKeptStr = mkAns({ rid: 'k1', ok: true, kept: 'yes' });
    check('F3a char-make / char-name / char-done answers (player, run for real): ok with a well-formed id only (else none), a reason of ours in words, a prototype-named or unknown reason a plain refusal; an answer to no question of ours does nothing',
        j(aOk.got) === j([{ ok: true, charId: 'c_ab12' }]) && aOk.left === 0 && aOk.cleared === 1 && j(aBadId.got) === j([{ ok: true, charId: null }]) && aHave.got[0].error === 'You already play a character here.' && aProto.every(e => e === 'The GM could not do that.')
        && aNo.got.length === 0 && aNo.left === 1 && aProtoRid.got.length === 0 && j(aKept.got) === j([{ ok: true, charId: null, kept: true }]) && j(aKeptStr.got) === j([{ ok: true, charId: null }]) && /\} else if \(\(msg\.type === 'char-ask-ans' \|\| msg\.type === 'char-make-ans' \|\| msg\.type === 'char-name-ans' \|\| msg\.type === 'char-plook-ans' \|\| msg\.type === 'char-done-ans' \|\| msg\.type === 'char-delete-ans' \|\| msg\.type === 'char-token-ans' \|\| msg\.type === 'tok-pic-ans' \|\| msg\.type === 'tok-light-ans'\) && net\.role === 'client'\) \{[^\n]*\n\s*\/\/ \[netcheck:charmakeans-start\]/.test(src), j([aOk, aBadId, aHave, aProto]));
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
        j(review({ outcome: 'back', name: 'Pax\u202e', note: ' Fix\u0000 your   ST ' })) === j(['Your GM sent back Pax to fill in (press Edit sheet, then Done when it is finished): Fix your ST']) && j(review({ outcome: 'removed', name: 'Pax' })) === j(['Your GM removed Pax.']) && j(review({ outcome: 'locked', name: 5 })) === j(['Your GM closed your character again: you change only the fields that are always yours.'])
        && review({ outcome: 'back', name: 'V', note: 'x'.repeat(900) })[0].length === 'Your GM sent back V to fill in (press Edit sheet, then Done when it is finished): '.length + 300
        && ['__proto__', 'toString', 'nuke', 1].every(oc => review({ outcome: oc, name: 'V' }).length === 0) && review({ outcome: 'back', name: 'V' }, { peer: 'x' }).length === 0 && review({ outcome: 'back', name: 'V' }, { stream: true }).length === 0 && review({ outcome: 'back', name: 'V' }, { foreign: false }).length === 0);
    // who hears of it (host)
    const scA = src.indexOf('net.syncChar = function(id)'), scB = src.indexOf('net.syncCharDelta = function'), sgA = src.indexOf('net.syncCharGone = function'), sgB = src.indexOf('// A player\'s edit of their own sheet');
    const hostSend = () => {
        const got = [], camp = { id: 'k', chars: { c_m: { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, made: 1, values: {} }, c_f: { id: 'c_f', name: 'Fin', ownerId: 'u_a', npc: false, review: 1, made: 1, values: {} } } };
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
            Object.assign({ type: 'char-token', rid: 't1', name: ' Pax\u202e ' }, o.msg || {}), conn, netJ, () => Sx, win, () => false, () => camp, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), H.own, () => !o.sheetsOff,
            k => { out.allowed.push(k); return o.slow !== k; }, cleanCharName, H.cleanRosterName, H.charFacePlan, () => ({ x: 900, y: 800 }), (c, pid) => { const gone = []; Object.keys(c.items).forEach(id => { const m = c.items[id]; const b = m.whiteboard.length; m.whiteboard = m.whiteboard.filter(w => !(w.waiting && w.ownerId === pid)); if (m.whiteboard.length !== b) gone.push(id); }); return gone; }, (c, maps) => out.changed.push(maps));
        return out;
    };
    const j1 = jt(), id1J = j1.answer[0] && j1.answer[0].charId, c1J = j1.camp.chars[id1J];
    check('F3b char-token with sheets on (host, run for real): an empty character of theirs — made, unlocked, marked for the GM\'s review, its name cleaned — given in play at once with their face copied, as a remote change; the GM told; answered with its id',
        c1J && c1J.name === 'Pax' && c1J.ownerId === 'u_a' && c1J.made === 1 && c1J.unlocked === 1 && c1J.review === 1 && c1J.making === undefined && j(c1J.values) === '{}' && j(j1.gives) === j([['u_a', id1J, j({ play: true, pic: true }), 1, 1, 1, true]])
        && j(j1.answer) === j([{ ok: true, charId: id1J, type: 'char-token-ans', rid: 't1' }]) && j1.toasts[0] === 'Pat took just a token (Pax). Review it on its sheet.' && j(j1.logs) === j([['char', 'Pat took just a token (Pax)']]) && j(j1.allowed) === j(['chartoken']), j(j1));
    const jRef = (o, why) => { const r = jt(o); return j(r.answer) === j([{ reason: why, type: 'char-token-ans', rid: 't1' }]) && r.gives.length === 0 && r.changed.length === 0 && Object.keys(r.camp.chars).length === Object.keys(JSON.parse(JSON.stringify(o.chars || {}))).length + 1; };
    check('F3b char-token refused (sheets on): only where making is live (invite, off: closed); while they make one (making); while they play one (have); paused; the rate (slow)',
        jRef({ rules: { create: 'invite' } }, 'closed') && jRef({ rules: { create: 'off' } }, 'closed') && jRef({ chars: { c_m: { id: 'c_m', name: 'M', ownerId: 'u_a', making: 1, values: {} } } }, 'making') && jRef({ chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } } }, 'have')
        && jRef({ paused: true }, 'paused') && jRef({ slow: 'chartoken' }, 'slow') && jt({ msg: { rid: 't 1' } }).answer.length === 0);
    const j2 = jt({ sheetsOff: true, wait: true, wait2: true }), t2 = j2.camp.items.m1.whiteboard[0], j3 = jt({ noSys: true, rules: { token: 'off' } }), t3 = j3.camp.items.m1.whiteboard[0], j4 = jt({ sheetsOff: true, wait: true, waitFace: 'photo', face: 'photo', avatar: 'data:image/png;base64,iVBORw0KGgo=' }), j5 = jt({ sheetsOff: true, wait: true, wait2: true, loc: 'm2' });
    check('F3b char-token without sheets (or a system): their waiting token on the map they stand on becomes a plain token of theirs where it stands (same id; their name, color and face), bound by its name (marked as their own choice); any other waiting token of theirs goes; with no waiting token one is made at the landing spot; a photo face is saved onto it after; nothing of a character',
        t2 && t2.id === 'wq1' && t2.waiting === undefined && t2.isChar === true && t2.charName === 'Pax' && t2.ownerId === 'u_a' && t2.face === '\u{1F409}' && t2.color === '#123456' && t2.x === 100 && j2.camp.players.u_a.charName === 'Pax' && j2.camp.players.u_a.charMade === 'Pax' && j(j2.allowed) === j(['chartoken']) && j2.camp.items.m2.whiteboard.length === 0
        && j(j2.changed) === j([['m1', 'm2']]) && j(j2.answer) === j([{ ok: true, type: 'char-token-ans', rid: 't1' }]) && Object.keys(j2.camp.chars).length === 1 && j2.gives.length === 0 && j2.toasts[0] === 'Pat took just a token (Pax).'
        && t3 && /^wb[a-z0-9]+$/.test(t3.id) && t3.x === 900 && t3.y === 800 && t3.isChar && j3.seated === 1 && j3.gives.length === 0
        && j4.camp.items.m1.whiteboard[0].face === undefined && j(j4.faces) === j([['m1', 'wq1', 'picture']])
        && j5.camp.items.m2.whiteboard.length === 1 && j5.camp.items.m2.whiteboard[0].id === 'wq2' && j5.camp.items.m2.whiteboard[0].isChar === true && j5.camp.items.m1.whiteboard.length === 0 && j(j5.changed) === j([['m2', 'm1']]), j([t2, j2.changed, t3, j4.faces, j5.changed]));
    check('F3b char-token refused without sheets: a token of their own or a character of theirs already (have), no map to stand on (nomap), the rate (slow); where making is off it is still offered',
        jRef({ sheetsOff: true, tok: true }, 'have') && jRef({ sheetsOff: true, wait: true, chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } } }, 'have') && jRef({ sheetsOff: true, loc: null }, 'nomap') && jRef({ sheetsOff: true, doc: true, loc: 'd1' }, 'nomap') && jRef({ sheetsOff: true, slow: 'chartoken' }, 'slow') && jt({ sheetsOff: true, rules: { create: 'off' } }).answer[0].ok === true);
    const dInv = dn({ chars: Object.assign({}, { c_m: Object.assign({}, mkC.c_m, { invited: 1 }), c_o: mkC.c_o }, { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a', npc: false, values: {} } }) });
    check('F3b char-done on one the GM asked for: it goes into play even while they play another (a replacement), and the mark goes',
        dInv.gives.length === 1 && dInv.gives[0][2] === j({ play: true, pic: true }) && dInv.camp.chars.c_m.invited === undefined && j(dInv.answer) === j([{ ok: true, type: 'char-done-ans', rid: 'd1' }]), j(dInv));
    const invH = hostSend(); invH.net.charReview('u_a', 'c_m', 'Pax', 'invited', ''); const invSent = invH.got.splice(0);
    check('F3b the GM\'s invite reaches its player (host: invited is a known outcome) and reads "asked you to make a character … open it from your card"',
        j(invSent.map(g => [g[0], g[1].outcome])) === j([['pA', 'invited'], ['pA2', 'invited']]) && j(review({ outcome: 'invited', name: 'Pax' })) === j(['Your GM asked you to make a character: Pax \u2014 open it from your card.']));
    const fgS = between('// [netcheck:forget-start]', '// [netcheck:forget-end]', 'forget');
    const fg = answer => { const camp = { id: 'c1', players: { u_a: { name: 'Ana' } }, chars: { c_m: { id: 'c_m', ownerId: 'u_a', making: 1 }, c_k: { id: 'c_k', ownerId: 'u_a' }, c_o: { id: 'c_o', ownerId: 'u_b', making: 1 } } }, asked = [], gone = [];
        const netF = { role: 'host', roster: {}, forgotten: Object.create(null), syncCharGone: (id, only) => gone.push([id, only]) };
        new Function('net', 'own', 'showConfirm', 'getActiveCampaign', 'save', 'toast', 'renderPlayersPanel', 'approvedIds', 'SC', 'removeWaiting', 'waitingChanged', fgS + '\nreturn forgetPlayer;')(netF, H.own, (m, cb) => { asked.push(m); cb(answer); }, () => camp, () => {}, () => {}, () => {}, {}, () => ({ playableChars: () => [] }), () => [], () => {})(camp, 'u_a');
        return { asked, gone, chars: Object.keys(camp.chars) }; };
    const fgY = fg(true), fgN = fg(false);
    check('F3b Forget: the confirm says the character they are still making goes too; on yes it goes (from them alone), their finished ones and another player\'s stay; Cancel keeps it',
        /The character they are still making goes too\./.test(fgY.asked[0]) && j(fgY.gone) === j([['c_m', 'u_a']]) && j(fgY.chars) === j(['c_k', 'c_o']) && j(fgN.chars) === j(['c_m', 'c_k', 'c_o']) && fgN.gone.length === 0, j([fgY, fgN]));
    // the rules for making (camp.newPlayers create / fromFile): kept by the GM's waiting-token box, carried on the wire only where they differ, taken by a player
    const snpSrc = (() => { const p = require('./checkkit').part('netfog.js'), i = p.indexOf('function setNewPlayers('); return p.slice(i, p.indexOf('\n}\n', i) + 2); })();   // in netfog.js, a part of net.js
    const rnpSrc = (() => { const p = require('./checkkit').part('netfog.js'), i = p.indexOf('function refreshNewPlayersBox('); return p.slice(i, p.indexOf('\n}\n', i) + 2); })().replace(/\r\n/g, '\n');   // in netfog.js, a part of net.js
    const tickOf = (np, o) => { o = o || {}; const els = { netWaitingSelect: { value: '' }, netWaitingSight: { checked: false }, netMakeSelect: { value: '' }, netMakeFile: { checked: null, disabled: null } }; const camp = { id: 'k' }; if (np) camp.newPlayers = np;
        new Function('net', 'ui', 'SC', 'getActiveCampaign', rnpSrc + '\nreturn refreshNewPlayersBox;')({ active: !!o.client, role: o.client ? 'client' : 'host' }, id => els[id] || null, () => Sx, () => camp)(); return els.netMakeFile; };
    check('Onboarding F4 the "may start it from a file" tick shows the table\'s rule (on unless it is off), is disabled where making is off, and is read-only at someone else\'s table',
        tickOf(null).checked === true && tickOf(null).disabled === false && tickOf({ fromFile: false }).checked === false && tickOf({ create: 'off' }).disabled === true && tickOf({ create: 'invite' }).disabled === false && tickOf(null, { client: true }).disabled === true);
    const hMF = (p => p.slice(p.indexOf("var _makeFile = ui('netMakeFile');"), p.indexOf('\nvar _makeSel')))(require('./checkkit').part('netfog.js')), gotMF = []; let lMF = null;
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
    const apS = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), rqS = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), thI = src.indexOf("} else if (msg.type === 'throw-req' && net.role === 'host') {"), thS = src.slice(thI, src.indexOf('\n    } else if', thI + 10));
    check('F3a a character in the making is not at the table yet: an apply (making), a roll from it (char) and a throw from it are refused on the host; the deny word survives the client\'s cleaner (1.6.3, moved on purpose: a roll from it is let through only where the system\'s Rolls while making allows it, mkQ)',
        /if \(chA\.making === 1\) \{ denyA\('making'\); return; \}/.test(apS)
        && /srcQ\.ownerId !== pidQ && !\(typeof handsTo === 'function' && handsTo\(srcQ, pidQ\)\)\)\)\) \|\| \(srcQ\.making === 1 && !mkQ\) \|\| !SQ \|\| !campQ\.system\) \{ denyQ\('char'\); return; \}/.test(rqS) && thI > 0 && /chT\.ownerId !== profT\.id \|\| chT\.making === 1\) return;/.test(thS) && Sx.cleanDenyReason('making') === 'making');
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
            { type: 'char-token', rid: 't1', name: 'Pax' }, { peer: 'pA', send() {} }, netJ, () => Sx, { wpSeatCell: (it, m) => { seats.push([m.id, it.type]); return false; }, wpSheets: {} }, () => false, () => camp, e => { throw e; }, () => {}, () => {}, H.own, () => false,
            () => true, cleanCharName, H.cleanRosterName, H.charFacePlan, (map, lr, near, w, h) => { spots.push([map.id, w, h]); return { x: 900, y: 800 }; }, () => [], () => {});
        return { tok: camp.items[mapId].whiteboard.find(w => w.ownerId === 'u_a'), spots, seats };
    };
    const jH = jtG('mh'), jS = jtG('ms'), jO = jtG('mo'), jW = jtG('mh', { type: 'hexagon', w: 60, h: 52 }), jOld = jtG('ms', { type: 'circle', w: 60, h: 52, x: 100, y: 200 });
    check('grid shape: Just a token without sheets comes in in the cell shape of the map they stand on — a new one a hexagon 60x52 on hex, a square 50x50 on a square grid (the free spot asked for that size), a circle with no grid; their hexagon waiting token stays a hexagon; a circle waiting token left from before becomes a square on a square map (its center kept, seated)',
        jH.tok.type === 'hexagon' && jH.tok.w === 60 && jS.tok.type === 'rect' && jS.tok.w === 50 && jS.tok.h === 50 && j(jS.spots) === j([['ms', 50, 50]]) && jO.tok.type === 'circle' && jO.tok.w === 60 && j(jO.spots) === j([['mo', 60, 52]])
        && jW.tok.type === 'hexagon' && jW.tok.id === 'wq' && jW.seats.length === 0 && jOld.tok.type === 'rect' && jOld.tok.w === 50 && jOld.tok.x === 105 && jOld.tok.y === 201 && j(jOld.seats) === j([['ms', 'rect']]), j([jH.tok, jS.tok, jO.tok, jW.tok, jOld.tok, jOld.seats]));
    const fsS = fnSrc('function freeSpotNear(', '\nfunction ', 'freeSpotNear');
    const FSG = new Function('window', fsS + '\nreturn freeSpotNear;')({});
    const sqMap = { id: 'q', meta: { gridType: 'square' }, whiteboard: [{ id: 'o', isChar: true, x: 100, y: 200, w: 50, h: 50 }] };
    const blk = []; for (let i = 0; i < 5; i++) for (let k = 2; k < 7; k++) blk.push({ id: 'b' + i + '_' + k, isChar: true, x: i * 50, y: k * 50, w: 50, h: 50 });
    const f4 = FSG({ id: 'q4', meta: { gridType: 'square' }, whiteboard: blk }, 120, 230, 50, 50, null, null), f5 = FSG({ id: 'q5', meta: { gridType: 'square' }, whiteboard: [] }, 310, 290, 100, 100, null, null);
    const f1 = FSG(sqMap, 120, 230, 50, 50, null, null), f2 = FSG({ id: 'q2', meta: { gridType: 'square' }, whiteboard: [] }, 137, 241, 50, 50, null, null), f3 = FSG({ id: 'q3', meta: {}, whiteboard: [] }, 137, 241, 50, 50, null, null);
    check('grid shape: the free spot on a square grid is a whole cell (a 50x50 lands on the lattice) and a neighboring cell (no cell skipped: past a taken 5x5 block the nearest free ring) is found when that one is taken; a sized-up token\'s corner lands on the lattice; with no grid nothing is rounded',
        j(f2) === j({ x: 100, y: 200 }) && f1.x % 50 === 0 && f1.y % 50 === 0 && Math.max(Math.abs(f1.x - 100), Math.abs(f1.y - 200)) === 50 && j(f3) === j({ x: 112, y: 216 })
        && f4.x % 50 === 0 && f4.y % 50 === 0 && Math.max(Math.abs(f4.x - 100), Math.abs(f4.y - 200)) === 150 && j(f5) === j({ x: 250, y: 250 }), j([f1, f2, f3, f4, f5]));
})());
{   // the token creator (fold 2): a token's kept original never leaves the host (sanitizeItem, run for real)
    const siA = src.indexOf('function sanitizeItem(');
    const siF = new Function('window', siSrc() + '\nreturn sanitizeItem;')({});
    const frK = { src: '/saves/images/lib/a.png', x: 1, y: 2, s: 3, of: '/saves/images/portraits/token-w1-k1.png' };
    const mapF = { id: 'm1', type: 'map', rooms: [], links: [], whiteboard: [{ id: 'w1', type: 'image', isChar: true, src: frK.of, frame: frK, gmInfo: 'secret', sheet: { a: 1 } }, { id: 'w2', type: 'image', src: '/saves/images/x.png', frame: { src: 'a' } }, { id: 'w3', hidden: true, type: 'image', frame: { src: 'b' }, x: 1, y: 2, w: 3, h: 4 }, { id: 'w4', type: 'rect', x: 0 }] };
    const outF = siF(mapF);
    check('token creator: a token\'s kept original (frame) never reaches a player — sanitizeItem (run for real) strips it with the attached sheet and the GM note from every token (a hidden one is not sent at all); the rest of the token travels; the GM\'s own map keeps it',
        siA > 0 && outF.whiteboard.length === 3 && outF.whiteboard.every(w => !('frame' in w) && !('gmInfo' in w) && !('sheet' in w)) && outF.whiteboard[0].src === frK.of && outF.whiteboard[0].isChar === true && outF.whiteboard[2].x === 0
        && j(outF.whiteboard.map(w => w.id)) === j(['w1', 'w2', 'w4']) && mapF.whiteboard.length === 4 && j(mapF.whiteboard[0].frame) === j(frK) && !!mapF.whiteboard[1].frame, j(outF.whiteboard));
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
    const shPF = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), pfSrc = shPF.slice(shPF.indexOf('function playerFinder('), shPF.indexOf('// net.js hooks: a character arrived, changed or went'));
    const realFinder = win => new Function('window', pfSrc + '\nreturn playerFinder;')(win);
    const entL = { i_jump: { id: 'i_jump', name: 'Jumping', key: 'Jumping', category: 'Skill', notes: 'Leap.', stats: { attr: 1, diff: 0 } }, i_axe: { id: 'i_axe', name: 'Axe Throwing', key: 'AxeThrowing', category: 'Skill', stats: { attr: 1, diff: 1 } }, i_secret: { id: 'i_secret', name: 'Secret Art', key: 'SecretArt', category: 'Skill', notes: 'GM ONLY LORE', stats: { attr: 2, diff: 2 } } };
    const plCopy = e => { const c = JSON.parse(JSON.stringify(e)); delete c.notes; return c; };
    const libFake = { state: () => 'ready', entry: id => entL[id] || null, entriesOf: id => id === 'p_pub' ? [entL.i_jump, entL.i_axe] : id === 'p_gm' ? [entL.i_secret] : [],
        playerIndexOf: id => id === 'p_pub' ? { byId: { i_jump: plCopy(entL.i_jump), i_axe: plCopy(entL.i_axe) } } : null, playerEntry: id => id === 'i_jump' || id === 'i_axe' ? plCopy(entL[id]) : null };
    const dossier = { name: 'Pax', attributes: { strength: { value: 13 }, dexterity: { value: 14 } }, skills: [{ name: 'Climbing', level: '12', relativeLevel: 'DX/Average' }, { name: 'Pottery', level: '11', relativeLevel: 'IQ/Easy' }] };
    const run = (o) => {
        o = o || {}; const sys = sysF(o.gmDx, o.iq), ch = Object.assign({ id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: { f_st: 10, f_sk: [{ id: 'w_old', defId: 'i_climb', qty: 1, lvl: 3 }] } }, o.ch || {});
        const camp = { id: 'k', system: sys, chars: { c_m: ch } }; if (o.newPlayers) camp.newPlayers = o.newPlayers; if (o.lib) camp.library = { dir: 'l_x', packs: [{ id: 'p_pub', rev: 1 }].concat(o.noGm ? [] : [{ id: 'p_gm', rev: 1, vis: 'gm' }]) };
        const out = { answer: [], sent: [], toasts: [], logs: [], saves: 0, allowed: [], lims: [], changed: [], at: o.at || {}, camp, ch };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netF = { active: true, role: 'host', paused: false, conns: [], roster: { pA: { id: 'u_a', name: 'Pat' } }, sendCharTo: (pid, id) => out.sent.push([pid, id]), syncCharDelta() { out.delta = true; } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpLibrary: o.lib ? libFake : { state: () => (o.loading ? 'loading' : 'ready') }, wpSheets: { gmFinder: () => () => [], charChanged: id => out.changed.push(id), uploadsChanged() {}, playerSystem: viewOf, charFromJson: SXp.charFromJson } };
        win.wpSheets.playerFinder = realFinder(win);
        if (o.lib) Sx.setLibraryFind(libFake.entry);
        try {
            new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'toast', 'logEvent', '_uploadAt', 'UPLOAD_GAP_MS', 'sheetsOnFor', 'allow', upSrc)(
                Object.assign({ type: 'char-upload', rid: 'e1', charId: 'c_m', sheet: dossier }, o.msg || {}), conn, netF, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), out.at, 10000, () => o.sheetsOff !== true, (k, lim, peer) => { out.allowed.push(k); out.lims.push([k, lim, peer]); return o.slow !== k; });
        } finally { if (o.lib) Sx.setLibraryFind(null); }
        return out;
    };
    const pv = Sx.charForView({ id: 'c_s', name: 'Pax', ownerId: 'u_a', npc: false, values: { f_st: 15, f_sk: [{ id: 'w_a', defId: 'i_climb', qty: 1, lvl: 7 }] } }, viewOf({ system: sysF(false) }));
    const cfile = SXp.charToJson(viewOf({ system: sysF(false) }), pv, null, { exported: 'x', picture: 'data:image/png;base64,' + 'A'.repeat(50) });
    const R3 = run({ msg: { sheet: cfile } });
    check('Onboarding F4 (host): a character file (the player\'s own download) fills a character in the making the same way (its picture is never on the wire); on a character in play it goes for the GM\'s review (moved on purpose in 1.6.0); a sheet file no reader here takes is answered unread',
        j(R3.answer) === j([{ n: 0, auto: 2, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && R3.ch.values.f_st === 15 && (R3.ch.values.f_sk || []).length === 1 && R3.ch.values.f_sk[0].lvl === 7
        && (run({ ch: { making: undefined, unlocked: 1 }, msg: { sheet: cfile } }).answer[0] || {}).reason === undefined && j(run({ ch: { making: undefined, unlocked: 1 } }).answer) === j([{ reason: 'unread', type: 'char-upload-ans', rid: 'e1' }]), j(R3.answer));
    // item 35, fold 1c: a character file with looks fills a character in the making, and the host stores the looks with the values
    const LKf = await import(url('lookcore.js'));
    const sysT = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_name', key: 'Name', label: 'Name', kind: 'text' }, { id: 'f_bio', key: 'Bio', label: 'Bio', kind: 'notes' }, { id: 'f_secret', key: 'Secret', label: 'Secret', kind: 'text', vis: 'gm' }] }, { F: Fx, gmView: true }), plT = viewOf({ system: sysT });
    const NAMEf = 'Bren the Bold', BIOf = 'Line one\nline two', ruleT = id => Sx.lookRule(Sx.fieldById(sysT, id)), recT = (id, fmt, text) => LKf.makeRec(fmt, '', text, ruleT(id));
    const BOLDf = recT('f_name', { spans: [{ s: 0, e: 4, b: true }] }, NAMEf), BIGf = recT('f_bio', { spans: [{ s: 5, e: 8, size: 'large' }] }, BIOf), OLDf = recT('f_name', { i: true }, 'Old words');
    const srcT = more => Object.assign({ id: 'c_s', name: 'Pax', ownerId: 'u_a', npc: false, values: { f_name: NAMEf, f_bio: BIOf, f_secret: 'hidden' } }, more);
    const fileT = (more, gmCopy) => SXp.charToJson(gmCopy ? sysT : plT, gmCopy ? Sx.cleanChar(srcT(more), sysT, { state: 'host' }) : Sx.charForView(srcT(more), plT), null, gmCopy ? { exported: 'x', gm: true } : { exported: 'x' });
    const runT = (file, chMore) => {
        const ch = Object.assign({ id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: {} }, chMore || {}), camp = { id: 'k', system: sysT, chars: { c_m: ch } }, out = { answer: [], sent: [], ch };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netF = { active: true, role: 'host', paused: false, conns: [], roster: { pA: { id: 'u_a', name: 'Pat' } }, cleanCharName: v => typeof v === 'string' ? v.trim().slice(0, 60) : '', sendCharTo: (pid, id) => { out.nm = ch.name; out.sent.push([pid, id, ch.looks === undefined ? null : j(ch.looks)]); }, syncCharDelta() {} };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpLibrary: { state: () => 'ready' }, wpSheets: { gmFinder: () => () => [], charChanged() {}, uploadsChanged() {}, playerSystem: viewOf, charFromJson: SXp.charFromJson } };
        win.wpSheets.playerFinder = realFinder(win);
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'toast', 'logEvent', '_uploadAt', 'UPLOAD_GAP_MS', 'sheetsOnFor', 'allow', upSrc)(
            { type: 'char-upload', rid: 'e1', charId: 'c_m', sheet: JSON.parse(j(file)) }, conn, netF, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, () => {}, () => {}, {}, 10000, () => true, () => true);
        return out;
    };
    const LOOKSf = { f_name: BOLDf, f_bio: BIGf }, Lf1 = runT(fileT({ looks: LOOKSf })), Lf0 = runT(fileT()), LfG = runT(fileT({ looks: { f_name: BOLDf, f_bio: BIGf, f_secret: recT('f_secret', { b: true }, 'hidden') } }, true));
    const LfOld = runT(fileT(), { values: { f_name: 'Old words' }, looks: { f_name: OLDf } }), LfKeep = runT(fileT(), { values: { f_name: NAMEf }, looks: { f_name: BOLDf } });
    const hostF = JSON.parse(j(fileT())); hostF.looks = { f_name: { fmt: { spans: [{ s: 0, e: 4, b: true, size: 'large' }] }, sig: LKf.textSig(NAMEf) }, f_bio: { fmt: { b: true }, sig: LKf.textSig('Other words') }, f_secret: BOLDf, f_zzz: BOLDf }; const LfHost = runT(hostF);
    const junkF = JSON.parse(j(fileT())); junkF.looks = [BOLDf]; const LfJunk = runT(junkF);
    const nmFile = JSON.parse(j(fileT())); nmFile.name = 'Rook Vale'; const nmNone = JSON.parse(j(fileT())); nmNone.name = ''; const LfNamed = runT(nmFile, { name: 'Test Player' }), LfBare = runT(nmNone, { name: 'Test Player' });
    check('1.6.0 a file names the character it fills (found by the round test: the sheet\'s title bar kept the player\'s own name), and a file with no name leaves the name as it was', LfNamed.nm === 'Rook Vale' && LfBare.nm === 'Test Player', j([LfNamed.nm, LfBare.nm]));
    check('item 35, fold 1c (host, the charfill branch run for real with the real core and the real file reader): a character file with looks fills a character in the making, and the host stores the looks with the values, each cleaned against the value as kept by its field\'s own rule, before the owner is sent their copy; the answer is counts only and the same with or without looks; a file with none leaves the character with no looks key, and ends the look of a text it changed while a text written again as it stood keeps its look; the GM\'s own copy of a file, read on the players\' view, gives no GM-only text and no look for one; a file\'s look for other words, for a GM-only field or for a field that is not there leaves none, a size is dropped from a one-line text, and looks that are a list leave none; the new line stands by itself after the values are stored',
        j(Lf1.ch.looks) === j(LOOKSf) && j(Lf1.sent) === j([['u_a', 'c_m', j(LOOKSf)]]) && j(Lf1.answer) === j([{ n: 0, auto: 2, left: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(Lf0.answer) === j(Lf1.answer) && !('looks' in Lf0.ch) && j(Lf0.ch.values) === j(Lf1.ch.values) && j(Lf0.sent) === j([['u_a', 'c_m', null]])
        && j(LfG.answer) === j(Lf1.answer) && j(LfG.ch.looks) === j(LOOKSf) && !('f_secret' in LfG.ch.values)
        && !('looks' in LfOld.ch) && LfOld.ch.values.f_name === NAMEf && j(LfKeep.ch.looks) === j({ f_name: BOLDf })
        && j(LfHost.ch.looks) === j({ f_name: BOLDf }) && j(LfHost.answer) === j(Lf1.answer) && !('looks' in LfJunk.ch) && j(LfJunk.answer) === j(Lf1.answer)
        && /\n            chU\.values = rF\.values; chU\.updated = nowU;\n            if \(rF\.looks\) chU\.looks = rF\.looks; else delete chU\.looks;[^\n]*\n            if \(net\.sendCharTo\) net\.sendCharTo\(profU\.id, qu\.charId\);/.test(upSrc),
        j([Lf1.ch.looks, Lf1.answer, Lf0.answer, LfG.ch.looks, LfOld.ch.looks, LfKeep.ch.looks, LfHost.ch.looks, LfJunk.ch.looks]));
    const sigF = { format: 'waypoint-character', v: 1, name: 'Pax', system: { sig: SXp.systemSig(viewOf({ system: sysF(false, true) })), fields: { f_st: { key: 'IQ', kind: 'number' }, f_x: { key: 'DX', kind: 'number' }, f_y: { key: 'Skills', kind: 'item-list' } } },
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
    // the GM's own finder of entries by name (sheets.js gmFinder, run for real): the host hands it to a reader that proposes an upload's rows. The system's
    // items come first; an entry of a GM-only pack goes out only as a GM-only copy, whether or not the library can hand one out (back from the bridge's own suite)
    const gfA = shPF.indexOf('function gmFinder(camp, sys) {'), gfB = gfA >= 0 ? shPF.indexOf('\n}\n', gfA) : -1, gfSrc = gfA >= 0 && gfB > gfA ? shPF.slice(gfA, gfB + 3) : '';
    const gmFind = lb => new Function('window', gfSrc + '\nreturn gmFinder;')({ wpLibrary: lb });
    const pubE = { id: 'i_pk', name: 'Poise', category: 'Trait', vis: 'all', notes: 'Balanced.' }, gmE = { id: 'i_sn', name: 'Steel Nerve', category: 'Trait', vis: 'all', notes: 'Unbending.' }, packsG = [{ id: 'p_gm', vis: 'gm' }, { id: 'p_all', vis: 'all' }];
    const libFor = { entriesOf: pid => (pid === 'p_all' ? [pubE] : pid === 'p_gm' ? [gmE] : []), entryFor: id => (id === 'i_sn' ? Object.assign({}, gmE, { vis: 'gm', notes: 'Unbending (GM copy).' }) : id === 'i_pk' ? pubE : null) };
    const libNo = { entriesOf: libFor.entriesOf }, libNull = Object.assign({}, libNo, { entryFor: () => null }), sysGf = { items: [{ id: 'i_sn2', name: 'Steel Nerve', category: 'Trait' }] };
    const findBy = lb => { const f = gmFind(lb)({ library: { packs: packsG } }, sysGf); return { sn: f(' steel nerve '), pk: f('Poise'), none: f('Nope'), proto: f('__proto__') }; };
    const gfW = findBy(libFor), gfNo = findBy(libNo), gfNull = findBy(libNull), gfBare = gmFind(undefined)({ library: { packs: packsG } }, sysGf)('Steel Nerve').map(e => e.id);
    check('the GM\'s own finder of entries by name (sheets.js gmFinder, run for real), which the host hands a sheet reader: the system\'s own items first, then the library\'s packs in their order; an entry of a pack players may see as it is; an entry of a GM-only pack only as a GM-only copy, the one the library hands out where it can, else a copy marked GM-only, with the pack\'s own entry never changed; a name nothing holds and a prototype\'s name find nothing; with no library the system\'s items alone',
        gfSrc.length > 0 && [gfW, gfNo, gfNull].every(g => j(g.sn.map(e => [e.id, e.vis || null])) === j([['i_sn2', null], ['i_sn', 'gm']]) && g.sn[1] !== gmE && g.pk.length === 1 && g.pk[0] === pubE && j(g.none) === '[]' && j(g.proto) === '[]')
        && gfW.sn[1].notes === 'Unbending (GM copy).' && gfNo.sn[1].notes === 'Unbending.' && gfNull.sn[1].notes === 'Unbending.' && gmE.vis === 'all' && j(gfBare) === j(['i_sn2']), j([gfW, gfNo, gfNull, gfBare]));
    const why = (o, reason) => { const r = run(o); return j(r.answer) === j([{ reason, type: 'char-upload-ans', rid: 'e1' }]) && r.ch.values.f_st === 10 && r.saves === 0 && r.toasts.length === 0 && r.sent.length === 0; };
    check('Onboarding F4 (host): refused, nothing changed — where the table does not let players start from a file (the tick off; making off; sheets off for the campaign), while the library still loads (wait), past the rate (slow), a file the GM cannot read (another version, or a sheet file no reader here takes: unread); allowed when making is only on invitation',
        why({ newPlayers: { fromFile: false } }, 'nofile') && why({ newPlayers: { create: 'off' } }, 'nofile') && why({ sheetsOff: true }, 'nofile') && why({ loading: true }, 'wait') && why({ slow: 'charfill' }, 'slow') && run({ newPlayers: { create: 'invite' }, msg: { sheet: cfile } }).answer[0].auto === 2
        && why({ msg: { sheet: Object.assign({}, cfile, { v: 99 }) } }, 'unread') && why({}, 'unread'));
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
        const tok = Object.assign({ id: 'wt', isChar: true, charName: 'Pax', ownerId: 'u_a', type: 'circle', x: 0, y: 0, w: 60, h: 52 }, o.tok || {});
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
        await why({ tok: { locked: true } }, 'locked'), await why({ tok: { hidden: true } }, 'missing'), await why({ peer: 'pB', tok: { hidden: true } }, 'missing'), await why({ tok: { hidden: 1, locked: true } }, 'missing'), await why({ tok: { gmNoteFor: 'u_a' } }, 'missing'), await why({ msg: { wbId: 'nope' } }, 'missing'), await why({ msg: { mapId: 'd1' } }, 'missing'), await why({ msg: { mapId: '__proto__' } }, 'missing'), await why({ board: {} }, 'missing'), await why({ board: null }, 'missing'),
        await why({ msg: { img: 'data:image/svg+xml;base64,PHN2Zz4=' } }, 'bad'), await why({ msg: { img: 'https://evil/x.png' } }, 'bad'), await why({ msg: { img: 'data:image/png;base64,' + 'A'.repeat(200001) } }, 'bad'),
        await why({ paused: true }, 'paused'), await why({ peerPaused: true }, 'paused'), await why({ slow: 'charpic' }, 'slow'), await why({ noSheets: true }, 'off')];
    const unnamed = await tp({ tok: { charName: '' } }), failed = await tp({ fail: true }), badRid = await tp({ msg: { rid: 'p 1' } }), stranger = await tp({ peer: 'pZ' });
    check('token creator: tok-pic (host, run for real) — a player\'s framed picture for their OWN plain token is saved over its picture (applyTokenFace, replace) and answered ok, the GM told; refused and answered why, nothing saved: another\'s token, a character\'s token (its picture goes through char-pic), a waiting token (even one marked a character) or no token at all (tokowner), locked (locked), a token or map that is not there, not a map or a board that is not a list, and — hidden pieces — a hidden token, theirs or another\'s, or a GM note, as one that is not there (missing), a picture that is not a whole safe picture — SVG, a web address, past 200,000 characters (bad), paused, the rate — one budget with char-pic, every picture saved on the GM\'s disk counted together (slow), no sheets module (off); a token with no name is "their token" to the GM; a failed save answers failed; a malformed request id or a peer not admitted: no answer',
        j(ok.answer) === j([{ ok: true, type: 'tok-pic-ans', rid: 'p1' }]) && j(ok.faces) === j([['m1', 'wt', 'picture', true, true]]) && j(ok.toasts) === j(['Pat changed the picture of their token (Pax).']) && j(ok.logs) === j([['char', 'Pat changed the picture of their token (Pax)']]) && j(ok.allowed) === j(['charpic'])
        && j(unnamed.toasts) === j(['Pat changed the picture of their token (their token).']) && refusals.every(Boolean) && j(failed.answer) === j([{ reason: 'failed', type: 'tok-pic-ans', rid: 'p1' }]) && failed.toasts.length === 0 && badRid.answer.length === 0 && stranger.answer.length === 0 && stranger.faces.length === 0, j([ok, refusals]));
    const ps = src.replace(/\r\n/g, '\n'), mkA = ps.indexOf('var _mkPending = {};'), mkB = ps.indexOf('// Onboarding F1b: a player\'s changed face reaches the host');
    const sendTP = (img, o) => { o = o || {}; const sent = []; const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', paused: false, selfPaused: false, myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) }] };
        const pend = new Function('net', 'safeAvatar', 'cleanCharName', 'setTimeout', 'clearTimeout', ps.slice(mkA, mkB) + '\nreturn _mkPending;')(netC, H.safeAvatar, v => String(v), () => 0, () => {}); return { r: netC.tokPic(o.map || 'm1', o.wb || 'wt', img, () => {}), sent, kinds: Object.keys(pend).map(k => pend[k].kind) }; };
    const sOk = sendTP(PIC), sBad = sendTP('https://evil/x.png');
    check('token creator: the player\'s tok-pic sender — only a whole safe picture travels, as { type, rid, mapId, wbId, img }; anything else is refused before it is sent; it remembers what it asked (its answer read in a token\'s words)',
        mkA > 0 && mkB > mkA && sOk.r.ok === true && sOk.sent.length === 1 && j(Object.keys(sOk.sent[0]).sort()) === j(['img', 'mapId', 'rid', 'type', 'wbId']) && sOk.sent[0].type === 'tok-pic' && j(sOk.kinds) === j(['tok-pic']) && sBad.r.error === 'That picture cannot be used.' && sBad.sent.length === 0 && sBad.kinds.length === 0, j([sOk, sBad.r]));
})());

T.finish();
