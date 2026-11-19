/* Offline check of the host-side wire gates in system/app/scripts/net.js — the code a hostile peer talks to.
   The REAL code is sliced out of net.js by its [netcheck:…] markers (never copied), so a rewrite that loosens a
   gate fails here. Covers: the admission gate (an unadmitted or prototype-keyed peer is closed, heartbeats keep a
   waiting peer alive only for a while), the hello handshake (identity validation, the table-key proof + challenge,
   bans before version/password, the password lockout, the hello storm), the join queue (one place per connection,
   bounded), broadcast() (admitted peers only on the host), and chat (the sender is the roster's, never the claim).
   An area's tests leave this suite with their area (docs/REFACTOR_SPLIT_PLAN.md, 2026-11-18): attacks and defenses on the host are in
   attackcheck.js, and the defense folds (a landed attack, the answers, an attack sent on) in landcheck.js; what time does at a table
   (timed effects, a time rules summary, each fight's own time) in nettimecheck.js, linked sheets (a crew's press, char-link, linkTell, crew in a vehicle's turn) in linkcheck.js, trading on the wire in tradecheck.js, a fogged
   map on the wire (a player's copy following what their tokens see, an open drag judged where it began and the catch-up when a move lands,
   map possession, the patch gate and the delta between two copies) in netfogcheck.js, and the fights on the host (the range to a target, a called shot, initiative, End turn, a step back,
   fights by their own ids, who holds whom) in netfightcheck.js. And with "Finishing the test split", step 4 (2026-11-19): who comes to a
   table (the helpers, the admission gate, hello and the table key, kick and ban, the join queue, broadcast, chat, the roster, security J
   and S, Player History, the host id) in netjoincheck.js, the transport under the wire (asset requests and the asset gate, transport T1
   to T7, security K, voice) in nettransportcheck.js, light, the clock and video on the wire in netmediacheck.js, and what a session keeps
   in step (doc theming, the top bar, the fog defaults, the library, security E and F, the Multiplayer panel, trackers, sounds, 206,
   mentions) in netsessioncheck.js; the admission gate's harness that stood here is tools/checkkit.js netGate. And with step 5: a
   character on the wire (char-edit, char-ask, char-item and the lists, U2, 126 and 126b, loads and chambers, char-style, char-damage) in
   netcharcheck.js, rolls and apply actions on the host (roll-req, char-apply, roll switches, Specialties, a burst, fold 2) in
   netrollcheck.js, what a roll's card carries and applies (the bell, R3, a Then on a critical, a hidden figure, a damage mark,
   fragmentation, owed F5b) in netapplycheck.js, a character and a token coming to the table (Onboarding F1 to F4, the token creator) in
   netmakecheck.js, the round hook, walls and the move limit, a turn's actions, the combat roster and named holds in netfightcheck.js,
   the heartbeat and the hold in netjoincheck.js, and the VTT ceiling and the library's manifest in netsessioncheck.js.
   Run: node tools/netcheck.js */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');

let partSlices = null;   // tools/checkkit.js netSlices, made the first time a slice names a part of net.js
function between(a, b, label, file) {
    if (file) return (partSlices || (partSlices = require('./checkkit').netSlices('netcheck'))).between(a, b, label, file);   // a part of net.js (netattack.js, nethold.js), read by its own name
    const i = src.indexOf(a), j = src.indexOf(b);
    if (i < 0 || j < 0 || j <= i) throw new Error('netcheck: marker ' + label + ' not found in net.js');
    if (src.indexOf(a, i + 1) >= 0 || src.indexOf(b, j + 1) >= 0) throw new Error('netcheck: marker ' + label + ' is not unique');
    return src.slice(i + a.length, j);
}
// the harness pieces this suite shares with the suites that came out of it with area 9 (tools/checkkit.js netHarness, the very code that stood here)
const { H, ownKeySrc, siSrc, mkConn } = require('./checkkit').netHarness('netcheck');
// the orders slice every reader of a fight asks (tools/checkkit.js netSlices, read from netfight.js by its own name)
const { ordersSrc } = require('./checkkit').netSlices('netcheck');
// the broadcast slice (netfog.js, a part of net.js), from the admission gate's harness that stood here (tools/checkkit.js netGate)
const { broadcastSrc } = require('./checkkit').netGate('netcheck');
const j = JSON.stringify;

let pass = 0, fail = 0;
const { packCheck } = require('./checkkit');   // PeerJS's BinaryPack refusals, run on every send of a harness (tools/checkkit.js says why; the suites that came out of this one share it)
const pendingChecks = [];   // checks that finish asynchronously, awaited before the summary
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } }

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
    check('session end (F0): leaving a table resets net.role, the code and the last stage (a trailing comment had swallowed them since 92352e2)', /net\.active = false; net\.role = null; net\.code = null; net\.roomPeer = null; net\.lastStage = null;   \/\//.test(src) && !/\/\/[^\n]*net\.role = null;/.test(src));
    check('throw-req (F0): a throw needs a shown token of THAT character on the map (a kept character has none of its own)', /w\.ownerId === profT\.id && w\.charId === msg\.charId; \}\)\) return;/.test(src));
    check('client (F0): a character copy that is no longer ours drops its queued edits BEFORE they are replayed (both the snapshot and a single copy)', /if \(outC\[id\]\.partial \|\| outC\[id\]\.ownerId !== net\.myId\) dropP\(id\); \}\);[^\n]*\n\s*campC\.chars = outC; Object\.keys\(outC\)\.forEach\(reapplyPending\);/.test(src) && /if \(c1\.partial \|\| c1\.ownerId !== net\.myId\) dropP\(c1\.id\); campC\.chars\[c1\.id\] = c1; noteHostCopy\(c1\.id, c1\.values\); reapplyPending\(c1\.id\);/.test(src));
    check('arrival (F0): ensurePlayerToken, Bring and the GM\'s walk through a portal all use the one resolver and the one chooser (no "first owned wins" demotion left)',
        (src.match(/S\.tokenSourceFor\(camp, /g) || []).length === 3 && (src.match(/ownedTokenPlan\(camp, \{ keep: /g) || []).length === 3 && !/slice\(1\)\.forEach\(function\(w\) \{ delete w\.ownerId; \}\)/.test(src));
}

/* ================= F0 sweep: gaps found beside the binding fold, each on the real code ================= */
const lineOf = (k, file) => { if (typeof file === 'string') return (partSlices || (partSlices = require('./checkkit').netSlices('netcheck'))).lineOf(k, file);   /* a part of net.js, read by its own name */ const i = src.indexOf(k); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); };
const fnSrc = (start, end, label, file) => { if (file) return (partSlices || (partSlices = require('./checkkit').netSlices('netcheck'))).fnSrc(start, end, label, file);   /* a part of net.js (netattack.js, nethold.js), read by its own name */ const i = src.indexOf(start), k = src.indexOf(end, i + 1); if (i < 0 || k < 0) throw new Error('netcheck: ' + label + ' not found in net.js'); return src.slice(i, k); };
/* ================= fog on is true alone (found during senses S0, (a)): net.js reads a map's fog as fog.js does ================= */
{
    const fgSrc = fnSrc('function anyFog(', '\n}\n', 'anyFog', 'netfog.js') + '\n}\n' + lineOf('function mapFogged(');
    const FG = new Function('window', "'use strict';\n" + fgSrc + '\nreturn { anyFog: anyFog, mapFogged: mapFogged };')({ wpFog: {}, wpVtt: { on: () => true } });
    const ons = [true, 'yes', 1, {}, [], 'true', false, null, undefined];
    const fgGot = ons.map(v => [FG.mapFogged({ type: 'map', fog: { on: v } }), FG.anyFog({ items: { m: { type: 'map', fog: { on: v } } } })]);
    const srcNC = src.replace(/\/\/[^\n]*/g, ''), reads = srcNC.match(/fog\.on\b[^\n]{0,9}/g) || [];
    check('fog on is true alone in net.js, as fog.js cleans it: a map whose fog.on is "yes", 1, an object or anything but true is unfogged for the sends and for the join as it is for the fog (never per-player once and shared after); every read of fog.on in net.js compares it to true',
        JSON.stringify(fgGot) === JSON.stringify(ons.map(v => [v === true, v === true])) && reads.length === 5 && reads.every(r => /^fog\.on === true/.test(r)), JSON.stringify([fgGot, reads]));
}
// fold M2: sanitizeItem as it runs, with the two it calls: wireNum (above it) and wireWbItem (right after it): siSrc, from checkkit.netHarness at the top
// 1.6.2 (the owner, 2026-11-13: "lets lock proportions when resizing by default"): Lock proportions is on unless a piece carries lockRatio: false,
// so the false has to reach the table and come back as it left: the real wireWbItem and the real cleanHostWbItem carry it, and true and absent alike
{
    const [, wireL] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({});
    const chA = src.indexOf('function cleanHostWbItem(w) {'), chB = src.indexOf('\n', chA), cleanL = new Function('window', '"use strict";\n' + src.slice(chA, chB) + '\nreturn cleanHostWbItem;')({});
    const pic = k => Object.assign({ id: 'wbL', type: 'image', x: 10, y: 20, w: 100, h: 50, src: 'p.png' }, k), lr = o => o && Object.prototype.hasOwnProperty.call(o, 'lockRatio') ? o.lockRatio : 'absent';
    const got = [{ lockRatio: false }, { lockRatio: true }, {}].map(k => [lr(wireL(pic(k), false)), lr(cleanL(pic(k)))]);
    check('1.6.2 Lock proportions on by default: a piece freed with lockRatio: false goes to the table and is cleaned on a player’s side with its false kept, and a locked one (true or no key) as it was, so a player’s copy reads the shape the GM set (net.js wireWbItem and cleanHostWbItem, run for real)',
        JSON.stringify(got) === JSON.stringify([[false, false], [true, true], ['absent', 'absent']]), JSON.stringify(got));
}
// 1.6.3, a map's places (placecore.js; the owner, by prompt: "A Place tick on any piece", "Only places they have seen"): a place's tick and its
// name go to the table with a shown piece and only as their cleaners keep them; a hidden piece is not sent at all; a secret door's copy and a
// plain wall carry neither, so no key tells a wall apart; a door that leads somewhere and that the GM unticked keeps its false; a player's app
// cleans what a host sends again; and a player's map copy sets neither, on the GM's piece or a drawing of their own (the real wireWbItem,
// cleanHostWbItem, playerStroke and patch gate, with the real fogcore and placecore)
pendingChecks.push((async () => {
    const T = '1.6.3 places on the wire: a shown piece carries its Place tick and name cleaned, a hidden piece nothing, a secret door\'s copy and a plain wall neither (the wall the same as one never ticked), a door that leads somewhere keeps an untick, no name goes with no core; a player\'s app cleans a host\'s again; a player\'s map copy sets neither on the GM\'s piece or a drawing of their own';
    try {
        const urlP = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const FCp = await import(urlP('fogcore.js')), PCp = await import(urlP('placecore.js'));
        const [, wireP] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpFogCore: FCp, wpPlaceCore: PCp });
        const [, wireN] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({});
        const chA = src.indexOf('function cleanHostWbItem(w) {'), chB = src.indexOf('\n', chA), chS = src.slice(chA, chB);
        const cleanP = new Function('window', '"use strict";\n' + chS + '\nreturn cleanHostWbItem;')({ wpPlaceCore: PCp, wpFogCore: FCp }), cleanN = new Function('window', '"use strict";\n' + chS + '\nreturn cleanHostWbItem;')({});
        const R = k => Object.assign({ id: 'p1', type: 'rect', x: 10, y: 20, w: 40, h: 40, color: '#334455', name: 'Crate' }, k), has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
        const shownP = wireP(R({ place: true, placeName: '  The   Inn\n' }), false), oddP = wireP(R({ place: 'yes', placeName: 7 }), false), hidP = wireP(R({ place: true, placeName: 'Secret Lair', hidden: true }), false);
        const door = { id: 'd1', type: 'rect', x: 0, y: 0, w: 50, h: 50, color: '#3f3b47', blocksSight: true, sightType: 'door', targetMapId: 'm2' }, doorOut = wireP(Object.assign({}, door, { place: false }), false);
        const sec = { id: 's1', type: 'rect', x: 0, y: 0, w: 50, h: 50, color: '#3f3b47', blocksSight: true, sightType: 'door', secret: true, place: true, placeName: 'Hidden Vault' }, secP = wireP(sec, false), secN = wireN(Object.assign({}, sec), false);
        const wall = { id: 'w1', type: 'rect', x: 0, y: 0, w: 50, h: 50, color: '#3f3b47', blocksSight: true, sightType: 'wall' }, wallT = wireP(Object.assign({}, wall, { place: true, placeName: 'Old Wall' }), false), wallU = wireP(Object.assign({}, wall), false);
        const noCore = wireN(R({ place: true, placeName: 'The Inn' }), false);
        const okWire = shownP && shownP.place === true && shownP.placeName === 'The Inn' && !has(oddP, 'place') && !has(oddP, 'placeName') && hidP === null && doorOut.place === false
            && !has(secP, 'place') && !has(secP, 'placeName') && !/Hidden Vault/.test(j(secP)) && !has(secN, 'place') && !has(secN, 'placeName') && !has(wallT, 'place') && !has(wallT, 'placeName') && j(wallT) === j(wallU)
            && noCore.place === true && !has(noCore, 'placeName');
        const cH = cleanP(R({ place: 'yes', placeName: 'A'.repeat(90) + '\u0007' })), cH2 = cleanP(R({ place: false, placeName: { x: 1 } })), cN = cleanN(R({ place: true, placeName: 'The Inn' }));
        const okClient = !has(cH, 'place') && cH.placeName === 'A'.repeat(60) && cH2.place === false && !has(cH2, 'placeName') && cN.place === true && !has(cN, 'placeName');
        const psP = new Function('"use strict";\n' + fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\nreturn playerStroke;')();
        const st = psP({ id: 'dr1', type: 'path', ownerId: 'u_p', pts: [[0, 0], [5, 5]], x: 1, y: 1, w: 5, h: 5, place: true, placeName: 'Mine' }, 'u_p');
        const patchSrcP = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js'), cleanersP = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')), psSrcP = fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js') + '\n}\n';
        const S = (id, extra) => Object.assign({ id, type: 'path', byPlayer: true, ownerId: 'u_p', x: 5, y: 5, w: 10, h: 10, baseW: 10, baseH: 10, z: 35, pts: [[0, 0], [4, 4]], color: '#e9e9f0', strokeWidth: 3 }, extra);
        const camps = { c1: { id: 'c1', items: { m1: { type: 'map', whiteboard: [R({ id: 'pl', place: true, placeName: 'Inn' }), R({ id: 'gate', nodeId: 'r1' }), S('mine')], rooms: [{ id: 'r1', name: 'Gate' }] } } } };
        const msg = { campId: 'c1', itemId: 'm1', item: { whiteboard: [S('mine', { place: true, placeName: 'My Spot' }), R({ id: 'pl', place: false, placeName: 'Renamed' }), R({ id: 'gate', place: false }), S('new1', { place: true, placeName: 'Fresh' })] } };
        let gate = 'ran'; try { new Function('state', 'window', 'msg', 'prof', 'out', cleanersP + ownKeySrc + psSrcP + patchSrcP + '\nreturn applyClientItemFiltered(msg, prof, out);')({ appState: { campaigns: camps } }, { wpVtt: { campaignOn: () => true }, wpFogCore: FCp, wpPlaceCore: PCp }, msg, { id: 'u_p', name: 'P' }, {}); } catch (e) { gate = String(e); }
        const wbA = camps.c1.items.m1.whiteboard, byA = id => wbA.find(w => w.id === id);
        const okPatch = gate === 'ran' && byA('pl').place === true && byA('pl').placeName === 'Inn' && !has(byA('gate'), 'place') && !wbA.some(w => w.ownerId === 'u_p' && (has(w, 'place') || has(w, 'placeName'))) && st && !has(st, 'place') && !has(st, 'placeName');
        check(T, okWire && okClient && okPatch, j([okWire, okClient, okPatch, gate, shownP, oddP, doorOut, secP, wallT, cH, cH2, wbA.map(w => [w.id, w.place, w.placeName])]).slice(0, 900));
    } catch (e) { check(T, false, String(e && e.stack || e)); }
})());
// 1.6.3 (the owner's rulings of 2026-11-17, findings 2 and 8 of the improvement week's review), run for real with the real fogcore:
// (2) a player travels through a portal only from beside it ("Next to it"): travelBar's third rule, by fogcore portalBeside, the door's own rule
// (doorBeside), after the two locks; a far request is refused with the word far, which the player's app says in fixed words. (8) whether players
// see a trigger zone is a tick on the zone ("should be optional"): a zone ticked off (zoneHidden, fogcore zoneHid) is never sent nor its place
// relayed, its message still comes up for a player's token that goes in, a zone hidden by the Hidden tick stays off, and every zone fires by its
// own shape (fogcore zoneHolds), never its box
pendingChecks.push((async () => {
    const T2 = '1.6.3 portal travel from beside it (finding 2): travelBar, with the real fogcore, lets a player through only where a shown token of theirs (a character or a waiting one) stands on the portal or next to it by the door\'s own rule (one square cell, corners included; one hex; 40 px on a map with no lattice), the locks answering first; another player\'s token, a hidden token or none is no reach, and the far word is the reason; with no core the box rule still holds; the player is told in fixed words';
    const T8 = '1.6.3 trigger zones (finding 8): a zone with Players see this zone unticked is never sent (wireWbItem) nor its place relayed (broadcastPos), with the real fogcore and with none; a zone that leads to a map or hangs on a room, and any other piece, goes out with the tick taken off; a player\'s app keeps no tick a host names; the host says the zone\'s message to the token that goes in, a hidden zone stays off, and a round, diamond or hex zone never fires in its corners, nor speaks again for a token that began inside its shape';
    try {
        const urlZ = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const FCz = await import(urlZ('fogcore.js'));
        // (2) travelBar with the real core
        const barSrcZ = between('// [netcheck:travelbar-start]', '// [netcheck:travelbar-end]', 'travelbar');
        const barZ = win => new Function('window', barSrcZ + '\nreturn travelBar;')(win);
        const tbC = barZ({ wpFogCore: FCz }), tbN = barZ({});
        const po = { id: 'po', type: 'rect', targetMapId: 'm2', x: 0, y: 0, w: 50, h: 50 };
        const tok = (x, y, k) => Object.assign({ id: 't', isChar: true, ownerId: 'u_p', x, y, w: 50, h: 50 }, k || {});
        const sq = toks => ({ id: 'm1', meta: { gridType: 'square' }, whiteboard: toks }), off = toks => ({ id: 'm1', meta: { gridType: 'off' }, whiteboard: toks });
        const reason = (bar, p, m) => { const r = bar({ id: 'u_p' }, p, m, { id: 'm2' }); return r ? r.reason : null; };
        const sqGot = [reason(tbC, po, sq([tok(0, 0)])), reason(tbC, po, sq([tok(50, 0)])), reason(tbC, po, sq([tok(50, 50)])), reason(tbC, po, sq([tok(100, 0)])), reason(tbC, po, sq([tok(50, 0, { ownerId: 'u_q' })])),
            reason(tbC, po, sq([tok(50, 0, { hidden: true })])), reason(tbC, po, sq([tok(50, 0, { isChar: false, waiting: true })])), reason(tbC, po, sq([])), reason(tbC, po, sq([tok(900, 900), tok(50, 0)])),
            reason(tbC, Object.assign({}, po, { portalLock: true }), sq([tok(900, 900)])), reason(tbC, po, { id: 'm1', meta: { gridType: 'square', playerLock: true }, whiteboard: [tok(900, 900)] })];
        const offGot = [reason(tbC, po, off([tok(90, 0)])), reason(tbC, po, off([tok(91, 0)])), reason(tbN, po, sq([tok(90, 0)])), reason(tbN, po, sq([tok(91, 0)])), reason(tbN, po, sq([tok(Infinity, 0)]))];
        // the hex lattice: portalBeside answers as doorBeside does, token for token
        const hexG = FCz.gridFor('hex', null, null), hexPo = { id: 'ph', type: 'hexagon', targetMapId: 'm2', x: 300, y: 300, w: 60, h: 52 };
        let hexSame = true, hexN = 0, hexY = 0; for (let x = 150; x <= 450; x += 15) for (let y = 150; y <= 450; y += 13) { const t = tok(x, y, { w: 60, h: 52 }), a = FCz.portalBeside(t, hexPo, hexG), b = FCz.doorBeside(t, hexPo, hexG); if (a !== b) hexSame = false; if (a) hexY++; else hexN++; }
        const tdI = src.indexOf("} else if (msg.type === 'travelDenied' && net.role === 'client') {"), tdCli = src.slice(tdI, src.indexOf("} else if (msg.type === 'travel' && net.role === 'host') {", tdI));
        const sayF = msg => { const out = []; new Function('msg', 'conn', 'net', 'fromHost', 'toast', 'if (false) {\n' + tdCli + '\n}')(Object.assign({ type: 'travelDenied' }, msg), { peer: 'h' }, { role: 'client' }, () => true, t => out.push(t)); return out; };
        const FARW = 'Move your token next to it first. Then double-click it to go through.';
        const ok2 = j(sqGot) === j([null, null, null, 'far', 'far', 'far', null, 'far', null, 'portal', 'here']) && j(offGot) === j([null, 'far', null, 'far', 'far']) && hexSame && hexN > 0 && hexY > 0
            && j(sayF({ reason: 'far' })) === j([FARW]) && j(sayF({ reason: 'far', map: '<b>x</b>' })) === j([FARW]) && (src.match(/function portalReach\(/g) || []).length === 1 && (src.match(/portalReach\(/g) || []).length === 3;
        check(T2, ok2, j([sqGot, offGot, hexSame, hexN, hexY, sayF({ reason: 'far' })]));
        // (8) the wire
        const [, wireC] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpFogCore: FCz });
        const [, wireN] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({});
        const chA = src.indexOf('function cleanHostWbItem(w) {'), chB = src.indexOf('\n', chA), cleanZ = new Function('window', '"use strict";\n' + src.slice(chA, chB) + '\nreturn cleanHostWbItem;')({ wpFogCore: FCz });
        const Z = k => Object.assign({ id: 'z', type: 'trigger', x: 0, y: 0, w: 100, h: 100, color: 'transparent', eventMessage: 'A click.' }, k), has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
        const wz = [wireC(Z({ zoneHidden: true }), false), wireN(Z({ zoneHidden: true }), false), wireC(Z({ zoneHidden: true, hidden: true }), false), wireC(Z({ zoneHidden: true, targetMapId: 'm2' }), false), wireC(Z({ zoneHidden: true, nodeId: 'r1' }), false),
            wireC(Z({ zoneHidden: 'yes' }), false), wireC(Z({}), false), wireC({ id: 'r', type: 'rect', x: 0, y: 0, w: 10, h: 10, zoneHidden: true }, false), wireC(Z({ zoneHidden: true, mine: { f: 'x' } }), false)];
        const okWire = wz[0] === null && wz[1] === null && wz[2] === null && !!wz[3] && !has(wz[3], 'zoneHidden') && !!wz[4] && !has(wz[4], 'zoneHidden') && !!wz[5] && !has(wz[5], 'zoneHidden') && !!wz[6] && !has(wz[6], 'eventMessage')
            && !!wz[7] && !has(wz[7], 'zoneHidden') && !!wz[8] && !has(wz[8], 'zoneHidden');   // a mine is no message zone: the tick counts for nothing on it (a mine is kept home by its own Hidden)
        const okClean = !has(cleanZ(Z({ zoneHidden: true })), 'zoneHidden') && !has(cleanZ({ id: 'r', type: 'rect', zoneHidden: true }), 'zoneHidden');
        const bpS = fnSrc('function broadcastPos(', '\n}\n', 'broadcastPos') + '\n}\n';
        const bpRun = (w, win) => { const sent = []; new Function('net', 'mapFogged', 'broadcast', 'mapHeld', 'own', 'window', bpS + '\nreturn broadcastPos;')({ conns: [] }, () => false, m => sent.push(m), null, () => true, win)({ type: 'pos', x: 1, y: 1 }, null, {}, null, w); return sent.length; };
        const okPos = bpRun(Z({ zoneHidden: true }), { wpFogCore: FCz }) === 0 && bpRun(Z({ zoneHidden: true }), {}) === 0 && bpRun(Z({ zoneHidden: true, targetMapId: 'm2' }), { wpFogCore: FCz }) === 1 && bpRun(Z({}), { wpFogCore: FCz }) === 1 && bpRun(Z({ hidden: true }), {}) === 0;
        // (8) triggerFire, by shape, with the real core
        const tfS = fnSrc('function triggerFire(', '\n}\n', 'triggerFire') + '\n}\n';
        const fire = (zones, at, from, win) => { const sent = []; const tf = new Function('window', 'sendFailed', tfS + '\nreturn triggerFire;')(win === undefined ? { wpFogCore: FCz } : win, e => { throw e; });
            tf({ send: m => sent.push(m.text) }, { whiteboard: zones }, { id: 't', x: at[0] - 25, y: at[1] - 25, w: 50, h: 50 }, from ? { x: from[0] - 25, y: from[1] - 25 } : null); return sent; };
        const C = k => Z(Object.assign({ shape: 'circle', eventMessage: 'Round.' }, k)), D = k => Z(Object.assign({ shape: 'diamond', eventMessage: 'Diamond.' }, k)), H = k => Z(Object.assign({ shape: 'hexagon', eventMessage: 'Hex.', w: 120, h: 104 }, k));
        const tfGot = [fire([C()], [50, 50]), fire([C()], [6, 6]), fire([C()], [6, 6], null, {}), fire([D()], [12, 12]), fire([D()], [50, 30]), fire([H()], [8, 8]), fire([H()], [60, 52]),
            fire([C({ zoneHidden: true })], [50, 50]), fire([C({ zoneHidden: true, hidden: true })], [50, 50]), fire([C()], [50, 50], [6, 6]), fire([C()], [50, 50], [45, 45]),
            fire([C({ rot: 45 }), Z({ x: 200, eventMessage: 'Box.' })], [50, 50]), fire([Z({ eventMessage: 'Box.' })], [3, 3])];
        const okFire = j(tfGot) === j([['Round.'], [], ['Round.'], [], ['Diamond.'], [], ['Hex.'], ['Round.'], [], ['Round.'], [], ['Round.'], ['Box.']]);
        // the GM's controls and the words
        const rdZ = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'), inspZ = rdZ('system/app/scripts/inspector.js'), wbZ = rdZ('system/app/scripts/whiteboard.js'), idxZ = rdZ('system/app/index.html'), cssZ = rdZ('system/app/style.css');
        const okUi = inspZ.includes('if (!w.targetMapId && !w.nodeId && !w.mine) html += \'<div class="field check-row"><input type="checkbox" id="wbZoneSeen" \' + (w.zoneHidden === true ? \'\' : \'checked\') + \'> <label for="wbZoneSeen">Players see this zone</label></div>')
            && inspZ.includes("if (wbZoneSeen) wbZoneSeen.addEventListener('change', function() { if (this.checked) delete w.zoneHidden; else w.zoneHidden = true; save(); render(); });")
            && wbZ.includes("el.classList.toggle('wb-zone-gm', !clientView && zoneHidMe(item));") && cssZ.includes('.wb-item.trigger.wb-zone-gm { border-color: var(--steel) !important; border-style: dotted !important; }')
            && /Untick <b>Players see this zone<\/b> in its Properties to keep it off the players' maps\. Its message still comes up when their token goes in\. A zone you mark Hidden is turned off\./.test(idxZ)
            && /<li><b>Doors &amp; stairs:<\/b> stand your token next to a portal marker and double-click it to travel through on your own\./.test(idxZ);
        check(T8, okWire && okClean && okPos && okFire && okUi, j([okWire, okClean, okPos, okFire, okUi, wz, tfGot]).slice(0, 1500));
    } catch (e) { check(T2, false, String(e && e.stack || e)); }
})());
// 1.6.3, the review of findings 2 and 8's fold, run for real with the real fogcore, portalUnder and fog.js moveBlocked:
// (1) a token on the portal, as a drop is judged (portalUnder: its middle in the portal's box, or a third of it over the box), always reaches it, so a
// drop in the middle of a filled-region portal or on a box corner of a long diagonal line travels on a lattice and gridless, as before the fold;
// (2) next to it is no reach where a wall line or a closed door stands between the token and the portal (the reason wall, said in fixed words),
// an open door and the walls rule set to Off or Warn letting it through, a portal that is itself a door never walled off; (4) a locked token gives no
// reach, a waiting one does, and a player's own app asks the same rule (net.portalReach), so its double-click promises Traveling exactly where the
// host lets it through; (3) the GM's own drop says a zone's message as the host's triggerFire does: never a Hidden zone or a mine, never again for a
// token that began inside it, by the zone's own shape
pendingChecks.push((async () => {
    const T = '1.6.3 the review of the play batch: a drop on a filled-region or diagonal-line portal travels (portalUnder first); a wall or a closed door between a token and the portal beside it refuses with the word wall (Refuse only; an open door, Off and Warn pass; a door portal is never walled off); a locked token gives no reach, a waiting one does, and the player\'s app asks the host\'s rule; the GM\'s drop never says a Hidden zone, a mine, or a zone the token began in; a zone made a portal, a room\'s link or a mine loses its Players see this zone tick';
    try {
        const urlR = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const FCr = await import(urlR('fogcore.js')), Sr = await import(urlR('systemcore.js'));
        const J = JSON.stringify;
        const camp = { id: 'k', items: {}, chars: {}, players: {}, turnRules: {} };
        const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
        const fogV = fogT.slice(fogT.indexOf('function core() {'), fogT.indexOf('/* ---------- the overlay'));
        const winF = { wpFogCore: FCr, wpSystemCore: Sr, wpVtt: { on: () => true, campaignOn: () => true, mode: () => 'host' } };
        const fog = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogV + '\nreturn { moveBlocked: moveBlocked };')(winF, { getElementById: () => null }, () => null, () => camp, { appState: { campaigns: { k: camp } } });
        const barS = between('// [netcheck:travelbar-start]', '// [netcheck:travelbar-end]', 'travelbar');
        const puS = fnSrc('function portalUnder(item, map) {', '\n}\n', 'portalUnder') + '\n}\n';
        const mmS = fnSrc('function moveMode(camp, k) {', '\n', 'moveMode');
        const nprA = src.indexOf('net.portalReach = function(portal, map) {'), nprS = src.slice(nprA, src.indexOf('\n', nprA));
        const mk = (win, withPU) => new Function('window', 'getActiveCampaign', 'net', barS + '\n' + (withPU ? puS : '') + '\n' + mmS + '\n' + nprS + '\nreturn { travelBar: travelBar, portalReach: portalReach, net: net };')(win, () => camp, { myId: 'u_p' });
        const H = mk({ wpFogCore: FCr, wpFog: fog }, true), H0 = mk({ wpFogCore: FCr, wpFog: fog }, false), Hn = mk({}, true);
        let n = 0; const M = (grid, wb, more) => { const m = Object.assign({ id: 'mr' + (++n), type: 'map', meta: { title: 'T', gridType: grid, updated: n }, rooms: [], whiteboard: wb }, more || {}); camp.items[m.id] = m; return m; };
        const tok = (x, y, k) => Object.assign({ id: 't' + x + '_' + y, type: 'image', isChar: true, ownerId: 'u_p', x, y, w: 50, h: 50 }, k || {});
        const why = (h, p, m) => { const r = h.travelBar({ id: 'u_p' }, p, m, { id: 'm2' }); return r ? r.reason : null; };
        // (1) a filled region and a diagonal line, each 500 px across
        const region = { id: 'pf', type: 'path', tip: 'fill', x: 0, y: 0, w: 500, h: 500, baseW: 500, baseH: 500, pts: [[0, 0], [500, 0], [500, 500], [0, 500]], targetMapId: 'm2' };
        const diag = { id: 'pd', type: 'path', x: 0, y: 0, w: 500, h: 500, baseW: 500, baseH: 500, pts: [[0, 0], [500, 500]], strokeWidth: 3, targetMapId: 'm2' };
        const d1 = [why(H, region, M('square', [region, tok(225, 225)])), why(H, region, M('off', [region, tok(225, 225)])), why(H, diag, M('square', [diag, tok(450, 0)])), why(H, diag, M('off', [diag, tok(450, 0)])),
            why(H0, region, M('square', [region, tok(225, 225)])), why(H0, diag, M('off', [diag, tok(450, 0)])), why(Hn, region, M('square', [region, tok(225, 225)]))];
        const ok1 = J(d1) === J([null, null, null, null, 'far', 'far', null]);
        // (2) a wall line and a door line along x = 550, between the portal's cell (10, 10) and the cells right of it
        const po = { id: 'po', type: 'rect', x: 500, y: 500, w: 50, h: 50, targetMapId: 'm2' };
        const line = k => Object.assign({ id: 'wl', type: 'path', x: 550, y: 450, w: 0, h: 150, pts: [[0, 0], [0, 150]], blocksSight: true, sightType: 'wall' }, k || {});
        const at = (wb, more) => M('square', [po].concat(wb), more);
        const rule = (mode, f) => { camp.turnRules = mode ? { walls: mode } : {}; try { return f(); } finally { camp.turnRules = {}; } };
        const d2 = [why(H, po, at([tok(550, 500)])), why(H, po, at([line(), tok(550, 500)])), why(H, po, at([line(), tok(550, 450)])), why(H, po, at([line(), tok(450, 500)])),
            why(H, po, at([line({ sightType: 'door' }), tok(550, 500)])), why(H, po, at([line({ sightType: 'door', doorOpen: true }), tok(550, 500)])),
            rule('off', () => why(H, po, at([line(), tok(550, 500)]))), rule('warn', () => why(H, po, at([line(), tok(550, 500)]))), rule('refuse', () => why(H, po, at([line(), tok(550, 500)]))),
            why(H, Object.assign({}, po, { blocksSight: true, sightType: 'door' }), at([line(), tok(550, 500)])), why(H, po, at([line(), tok(550, 500), tok(450, 500)])), why(H, po, M('off', [po, line(), tok(570, 500)])),
            why(Hn, po, at([line(), tok(550, 500)])), why(H, po, at([line({ hidden: true }), tok(550, 500)]))];
        const ok2 = J(d2) === J([null, 'wall', 'wall', null, 'wall', null, null, null, 'wall', null, null, null, null, null]);
        // (4) a locked token, a waiting one, and the player's own app
        const d4 = [why(H, po, at([tok(450, 500, { locked: true })])), why(H, po, at([tok(450, 500, { isChar: false, waiting: true, locked: true })])), why(H, po, at([tok(450, 500, { isChar: false, waiting: true })])), why(H, po, at([tok(500, 500, { locked: true })])),
            H.net.portalReach(po, at([tok(450, 500, { isChar: false, waiting: true })])), H.net.portalReach(po, at([tok(900, 900)])), H.net.portalReach(po, at([line(), tok(550, 500)])), H.net.portalReach(po, at([tok(450, 500, { ownerId: 'u_q' })]))];
        const ok4 = J(d4) === J(['far', 'far', null, 'far', true, false, false, false]);
        const tdI = src.indexOf("} else if (msg.type === 'travelDenied' && net.role === 'client') {"), tdCli = src.slice(tdI, src.indexOf("} else if (msg.type === 'travel' && net.role === 'host') {", tdI));
        const said = []; new Function('msg', 'conn', 'net', 'fromHost', 'toast', 'if (false) {\n' + tdCli + '\n}')({ type: 'travelDenied', reason: 'wall' }, { peer: 'h' }, { role: 'client' }, () => true, t => said.push(t));
        const wbR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
        const okSay = J(said) === J(['A wall is in the way. Walk your token to it first.']) && /function portalNearMine\(am, portal\) \{\n\s*var n = window\.wpNet; if \(!n \|\| typeof n\.portalReach !== 'function' \|\| !am \|\| !portal\) return true;\n\s*return n\.portalReach\(portal, am\);\n\s*\}/.test(wbR);
        // (3) the GM's own drop (datamap.js gmZoneSay), with the real core and with none
        const dmR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'datamap.js'), 'utf8').replace(/\r\n/g, '\n');
        const gzS = dmR.slice(dmR.indexOf('// [netcheck:gmzone-start]'), dmR.indexOf('// [netcheck:gmzone-end]'));
        const gz = win => new Function('window', gzS + '\nreturn gmZoneSay;')(win);
        const GZ = gz({ wpFogCore: FCr }), GZ0 = gz({});
        const Zr = k => Object.assign({ id: 'z', type: 'trigger', x: 0, y: 0, w: 100, h: 100, eventMessage: 'Box.' }, k || {});
        const tk = (cx, cy) => ({ id: 'tk', isChar: true, x: cx - 25, y: cy - 25, w: 50, h: 50 }), from = (cx, cy) => ({ x: cx - 25, y: cy - 25 });
        const d3 = [GZ({ whiteboard: [Zr()] }, tk(50, 50), null), GZ({ whiteboard: [Zr({ hidden: true })] }, tk(50, 50), null), GZ({ whiteboard: [Zr({ mine: { f: 'x' } })] }, tk(50, 50), null),
            GZ({ whiteboard: [Zr()] }, tk(50, 50), from(40, 40)), GZ({ whiteboard: [Zr()] }, tk(50, 50), from(300, 300)), GZ({ whiteboard: [Zr({ shape: 'circle', eventMessage: 'Round.' })] }, tk(6, 6), null),
            GZ0({ whiteboard: [Zr({ shape: 'circle', eventMessage: 'Round.' })] }, tk(6, 6), null), GZ({ whiteboard: [Zr({ hidden: true }), Zr({ id: 'z2', eventMessage: 'Second.' })] }, tk(50, 50), null),
            GZ({ whiteboard: [Zr({ zoneHidden: true })] }, tk(50, 50), null), GZ({ whiteboard: [Zr({ eventMessage: '' }), Zr({ id: 'z2', eventMessage: 'Second.' })] }, tk(50, 50), null), GZ(null, tk(50, 50), null)];
        const ok3 = J(d3) === J(['Box.', '', '', '', 'Box.', '', 'Round.', 'Second.', 'Box.', '', '']);
        // (5) a zone that becomes a portal, a room's link or a mine loses its Players see this zone tick (inspector.js zoneTidy), so clearing the
        // portal again never brings the zone back off the players' maps unseen; asked by the Link Node and Portal to Map setters
        const inR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, '\n');
        const ztA = inR.indexOf('  function zoneTidy(w) {'), zt = new Function(inR.slice(ztA, inR.indexOf('\n', ztA)) + '\nreturn zoneTidy;')();
        const tidy = w => { zt(w); return 'zoneHidden' in w; };
        const d5 = [tidy(Zr({ zoneHidden: true, targetMapId: 'm2' })), tidy(Zr({ zoneHidden: true, nodeId: 'r1' })), tidy(Zr({ zoneHidden: true, mine: {} })), tidy(Zr({ zoneHidden: true })), tidy(Zr({ zoneHidden: true, targetMapId: null }))];
        const ok5 = J(d5) === J([false, false, false, true, true]) && (() => { try { zt(null); return true; } catch (e) { return false; } })()
            && inR.includes('w.nodeId = this.value || null; portalLockTidy(w, activeMap); zoneTidy(w); save(); render();') && /portalLockTidy\(w, activeMap\);   \/\/ no longer a portal: its lock goes with it\n\s*zoneTidy\(w\);/.test(inR);
        check(T, ok1 && ok2 && ok4 && okSay && ok3 && ok5, J([d1, d2, d4, said, d3, d5]));
    } catch (e) { check(T, false, String(e && e.stack || e)); }
})());
// text style (1.5.0): a page's formats on the wire — the look of a title, a table cell or a flowchart label, stored beside its text. The host's real
// sanitizeItem sends them cleaned (docrender cleanDoc -> textfmt cleanFmt); a player's real applyItem cleans what a host sends again before it is stored
pendingChecks.push((async () => {
    const T = 'text style (wire): a page a host sends carries its plain fields\' formats cleaned against their texts (the title of a table among them), a GM-only page and a planner still never leave; a player\'s app cleans a page a hostile host sends again before storing it — a color that is none, a span outside the text, a key that is not a format\'s and a format on a field that is not there are gone, what is valid stays and draws';
    try {
        const urlW = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRw = await import(urlW('docrender.js')), RED = '#d9534f', GREEN = '#5cb87a', Jw = JSON.stringify;
        const [siW] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpDocRender: DRw });
        const page = players => ({ id: 'dS', type: 'doc', meta: { title: 'Rules', players }, blocks: [
            { id: 'b1', type: 'h1', title: 'Rules', sub: 'v1', fmt: { title: { color: '#D9534F', evil: 1, spans: [{ s: 0, e: 2, b: true, onclick: 'x' }, { s: 3, e: 99, color: 'url(//evil.example/c)' }] }, sub: { size: '99em' }, nope: { b: true } } },
            { id: 'b2', type: 'table', title: 'T', fmt: { title: { b: true, evil: 1 }, sub: { b: true } }, cols: ['A', 'B'], colFmt: [null, { i: true }, { b: true }], rows: [{ col1: 'x', col2: 'yy', fmt: { col2: { spans: [{ s: 0, e: 1, color: GREEN }] }, col1: { color: 'red' } } }] },
            { id: 'b3', type: 'flowchart', nodes: [{ id: 'n1', text: 'buy milk', fmt: { color: RED, spans: [{ s: 4, e: 40, color: GREEN }] } }, { id: 'n2', text: 'x', fmt: 'bold' }], edges: [{ from: 'n1', to: 'n2', text: 'go', fmt: { b: true, style: 'x' } }] }
        ] });
        const sent = siW(page(true)), want = Jw([
            { type: 'h1', id: 'b1', title: 'Rules', sub: 'v1', fmt: { title: { color: RED, spans: [{ s: 0, e: 2, b: true }] } } },
            { type: 'table', id: 'b2', title: 'T', cols: ['A', 'B'], rows: [['x', 'yy']], fmt: { title: { b: true } }, colFmt: [null, { i: true }], rowFmt: [[null, { spans: [{ s: 0, e: 1, color: GREEN }] }]] },
            { type: 'flowchart', id: 'b3', dir: 'TD', space: 'normal', zoom: 1, nodes: [{ id: 'n1', text: 'buy milk', shape: 'rect', color: 'neutral', fmt: { color: RED, spans: [{ s: 4, e: 8, color: GREEN }] } }, { id: 'n2', text: 'x', shape: 'rect', color: 'neutral' }], edges: [{ from: 'n1', to: 'n2', text: 'go', style: 'solid', fmt: { b: true } }] }
        ]);
        const hostOk = !!sent && Jw(sent.blocks) === want && siW(page(false)) === null && siW({ id: 'p', type: 'planner', blocks: page(true).blocks }) === null;
        // the player's side: the real applyItem, a host that sends the page raw
        const aiP = require('./checkkit').part('netfog.js'), ai = aiP.indexOf('function applyItem(msg) {'), ak = aiP.indexOf('\n}\n', ai);   // applyItem stands in netfog.js, a part of net.js
        const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'mA', items: { mA: { id: 'mA', type: 'map', whiteboard: [] } } } } } };
        new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanHostMap', 'msg', ownKeySrc + aiP.slice(ai, ak) + '\n}\nreturn applyItem(msg);')({ applyingRemote: false }, state, { wpDocRender: DRw, wpFog: { invalidateVision() {}, redraw() {} } }, () => state.appState.campaigns.k, () => {}, () => {}, m => m, { type: 'item', campId: 'k', itemId: 'dS', item: page(true) });
        const got = state.appState.campaigns.k.items.dS, html = got ? DRw.renderDoc(got, { mermaid: false }) : '';
        const clientOk = ai > 0 && ak > ai && !!got && Jw(got.blocks) === want && html.indexOf('<h1><span style="color:#d9534f;font-weight:bold;">Ru</span><span style="color:#d9534f;">les</span><span class="sub">v1</span></h1>') > 0 && html.indexOf('<td>x</td><td><span style="color:#5cb87a;">y</span>y</td>') > 0 && html.indexOf('<h3><span style="font-weight:bold;">T</span></h3>') > 0 && html.indexOf('evil.example') < 0;
        check(T, hostOk && clientOk, Jw([hostOk, clientOk, sent && sent.blocks, got && got.blocks]).slice(0, 1200));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// 1.6.2, merged headings (the owner, 2026-11-14, by prompt: "Waypoint merges headings"): a heading under another's merge goes to players blank, with
// no look, as a cell under a merge does; the GM's own page keeps it; a player's app re-cleans a hostile host's headMerge by docrender.js headJoin
pendingChecks.push((async () => {
    const T = '1.6.2 merged headings on the wire: a heading under another\'s merge goes to players blank and with no look, the merge goes with it as headJoin reads it, the GM\'s own page keeps every word, and a player\'s app re-cleans a hostile host\'s merge to nothing or to the table';
    try {
        const urlH = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRh = await import(urlH('docrender.js')), Jh = JSON.stringify;
        const [siH] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpDocRender: DRh });
        const gm = { id: 'dH', type: 'doc', meta: { title: 'Coins' }, blocks: [{ id: 'b1', type: 'table', cols: ['Coin', 'Aurodium Weight', 'secretHead', 'Value'], colFmt: [null, null, { b: true }], headMerge: { col2: 2 }, rows: [['Lot', '1 lb', '0.45 kg', '10']] }] };
        const before = Jh(gm), out = siH(gm), b = out && out.blocks[0];
        const host = DRh.cleanDoc({ type: 'doc', id: 'x', meta: { title: 'x' }, blocks: [{ type: 'table', cols: ['a', 'b', 'c'], headMerge: { col1: 99, col3: '"><img src=x>', toString: 2 }, rows: [] }, { type: 'table', cols: ['a'], headMerge: 'col1', rows: [] }] }, { keepHidden: true });
        const ok = !!b && Jh(b.cols) === Jh(['Coin', 'Aurodium Weight', '', 'Value']) && Jh(b.headMerge) === Jh({ col2: 2 }) && !(Array.isArray(b.colFmt) && b.colFmt[2]) && Jh(gm) === before && !Jh(out).includes('secretHead')
            && Jh(host.blocks[0].headMerge) === Jh({ col1: 3 }) && !('headMerge' in host.blocks[1]);
        check(T, ok, Jh([b, host.blocks.map(x => x.headMerge)]).slice(0, 900));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// 1.6.2, merged cells (the review of 7f77d4ed): words a merge hides from the GM never reach a player. The host's real sanitizeItem blanks a cell
// under a merge and every cell of a full-width row but its first, with its look, on the copy that goes out; the GM's own page keeps them
pendingChecks.push((async () => {
    const T = '1.6.2 merged cells on the wire: a cell under a merge and the other cells of a full-width row go to players blank (and with no look), so their search never finds words they cannot see; the GM\'s own page keeps every word, and a row with nothing merged goes as it was';
    try {
        const urlM = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRm = await import(urlM('docrender.js')), Jm = JSON.stringify;
        const [siM] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpDocRender: DRm });
        const gm = { id: 'dM', type: 'doc', meta: { title: 'Armory' }, blocks: [{ id: 'b1', type: 'table', cols: ['Name', 'Cost', 'Weight'], rows: [
            { col1: 'Armor', col2: 'secretA', col3: 'secretB', full: true }, { col1: 'Plate', col2: '12', col3: 'hiddenW', merge: { col2: 2 }, fmt: { col3: { b: true } } }, { col1: 'Mail', col2: '8', col3: '20' }] }] };
        const before = Jm(gm), out = siM(gm), b = out && out.blocks[0];
        const ok = !!b && Jm(b.rows) === Jm([['Armor', '', ''], ['Plate', '12', ''], ['Mail', '8', '20']]) && Jm(b.rowMerge) === Jm(['full', [1, 2, 0]]) && !('rowFmt' in b && b.rowFmt.some(r => r && r[2]))
            && Jm(gm) === before && !Jm(out).includes('secretA') && !Jm(out).includes('hiddenW');
        check(T, ok, Jm(b));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// text style, a size on a part, underline, strike and a link (the owner, 2026-10-02): a link is a web address by the page sanitiser's own rule (textfmt.js cleanLink). The host's
// real sanitizeItem and a player's real applyItem, on a page whose formats hold links that are not allowed
pendingChecks.push((async () => {
    const T = 'text style (wire, a link): a link that is not allowed — javascript:, data:, a control character, white space inside, a protocol-relative one, an over-long one, one that is no string — in a page\'s formats is dropped by the host before the page leaves, and again by a player\'s app before a page a hostile host sends is stored; the text and the rest of its look stay, the one allowed link beside it is kept, a flowchart label keeps none, and what the player\'s app draws holds no link but that one';
    try {
        const urlW = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRw = await import(urlW('docrender.js')), OK = 'https://ok.example/p?a=1&b=2', Jw = JSON.stringify;
        const [siW] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpDocRender: DRw });
        const BADL = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'https://a.example/' + String.fromCharCode(0), 'https://a.example/' + String.fromCharCode(10) + 'x', 'https://a b', '//evil.example/x', 'https://' + 'a'.repeat(2000), 7, { href: OK }];
        const page = v => ({ id: 'dL', type: 'doc', meta: { title: 'Rules', players: true }, blocks: [
            { id: 'b1', type: 'h1', title: 'Rules', sub: 'v1', fmt: { title: { link: v, u: true, spans: [{ s: 0, e: 2, size: 'large', link: OK }] }, sub: { link: v, size: '99em' } } },
            { id: 'b2', type: 'table', title: 'T', fmt: { title: { link: v } }, cols: ['A', 'B'], colFmt: [{ link: v }, { st: true, link: v }], rows: [{ col1: 'x', col2: 'yy', fmt: { col2: { spans: [{ s: 0, e: 1, link: v, size: 'huge' }] }, col1: { link: v } } }] },
            { id: 'b3', type: 'flowchart', nodes: [{ id: 'n1', text: 'buy milk', fmt: { link: OK, spans: [{ s: 0, e: 3, u: true, link: v }] } }], edges: [{ from: 'n1', to: 'n1', text: 'go', fmt: { link: v } }] }
        ] });
        const want = Jw([
            { type: 'h1', id: 'b1', title: 'Rules', sub: 'v1', fmt: { title: { u: true, spans: [{ s: 0, e: 2, size: 'large', link: OK }] } } },
            { type: 'table', id: 'b2', title: 'T', cols: ['A', 'B'], rows: [['x', 'yy']], colFmt: [null, { st: true }], rowFmt: [[null, { spans: [{ s: 0, e: 1, size: 'huge' }] }]] },
            { type: 'flowchart', id: 'b3', dir: 'TD', space: 'normal', zoom: 1, nodes: [{ id: 'n1', text: 'buy milk', shape: 'rect', color: 'neutral', fmt: { spans: [{ s: 0, e: 3, u: true }] } }], edges: [{ from: 'n1', to: 'n1', text: 'go', style: 'solid' }] }
        ]);
        const aiP = require('./checkkit').part('netfog.js'), ai = aiP.indexOf('function applyItem(msg) {'), ak = aiP.indexOf('\n}\n', ai);   // applyItem stands in netfog.js, a part of net.js
        const A = '<a href="https://ok.example/p?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">';
        const bad = BADL.filter(v => {
            const sent = siW(page(v)), hostOk = !!sent && Jw(sent.blocks) === want;
            const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'mA', items: { mA: { id: 'mA', type: 'map', whiteboard: [] } } } } } };
            new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanHostMap', 'msg', ownKeySrc + aiP.slice(ai, ak) + '\n}\nreturn applyItem(msg);')({ applyingRemote: false }, state, { wpDocRender: DRw, wpFog: { invalidateVision() {}, redraw() {} } }, () => state.appState.campaigns.k, () => {}, () => {}, m => m, { type: 'item', campId: 'k', itemId: 'dL', item: page(v) });
            const got = state.appState.campaigns.k.items.dL, html = got ? DRw.renderDoc(got, { mermaid: false }) : '';
            const clientOk = ai > 0 && ak > ai && !!got && Jw(got.blocks) === want && (html.match(/<a\b/g) || []).length === 1 && html.indexOf('<h1>' + A + '<span style="text-decoration:underline;font-size:1.2em;">Ru</span></a><span style="text-decoration:underline;">les</span><span class="sub">v1</span></h1>') > 0
                && html.indexOf('<th>A</th><th><span style="text-decoration:line-through;">B</span></th>') > 0 && html.indexOf('<td>x</td><td><span style="font-size:1.728em;">y</span>y</td>') > 0 && !/javascript|vbscript|data:text|evil\.example|99em/i.test(html) && !/href|https?:/.test(DRw.compileFlowchart(got.blocks[2]));
            return !(hostOk && clientOk);
        });
        const keptAll = siW(page(OK));
        check(T, bad.length === 0 && !!keptAll && Jw(keptAll.blocks[0].fmt) === Jw({ title: { u: true, link: OK, spans: [{ s: 0, e: 2, size: 'large' }] }, sub: { link: OK } }) && Jw(keptAll.blocks[1].colFmt) === Jw([{ link: OK }, { st: true, link: OK }]) && Jw(keptAll.blocks[2].nodes[0].fmt) === Jw({ spans: [{ s: 0, e: 3, u: true }] }) && !('fmt' in keptAll.blocks[2].edges[0]), Jw([bad, keptAll && keptAll.blocks]).slice(0, 1200));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// a diagram's link (the owner, 2026-10-02): a flowchart node may carry a link, and a diagram block's link statements reach the diagram library
// as ONE canonical line (docrender.js). The host's real sanitizeItem and a player's real applyItem, on a page whose node links and link lines are hostile
pendingChecks.push((async () => {
    const T = 'a diagram\'s link (wire): a page a host sends carries a flowchart node\'s link only by the one rule — a script or data: address, a protocol-relative one, one that tries to end the statement, one with a space, one that is no string, one the diagram library would not read back as written are dropped while the node stays, an arrow\'s is never kept — and a diagram block\'s link statements only as canonical lines (a flowchart\'s, a class diagram\'s; a Gantt chart keeps none; a callback, a call, a tooltip, a target, a list of ids, an id every object carries are gone); a player\'s app cleans a page a hostile host sends the same way before it is stored, and what it draws hands the diagram library those lines and no other click statement; 10,000 link lines come in as canonical lines only, within the page\'s size';
    try {
        const urlW = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRw = await import(urlW('docrender.js')), OKL = 'https://ok.example/a?b=1&c=2#f', Jw = JSON.stringify;
        const [siW] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpDocRender: DRw });
        const BADL = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', '//evil.example/x', '/saves/data.json', 'https://ok.example/"\nclick a call alert(1)', 'https://ok.example/" onclick="alert(1)', 'https://a b', 'https://ok.example/<b>', 'https://ok.example/#a;b', 'https://ok.example/%%{init}%%', 'https://ok.example/?a=&#104;', 'https://' + 'a'.repeat(2000), 7, { href: OKL }, [OKL]];
        const page = v => ({ id: 'dD', type: 'doc', meta: { title: 'Rules', players: true }, blocks: [
            { id: 'b1', type: 'flowchart', nodes: [{ id: 'a', text: 'A', link: '  ' + OKL + ' ' }, { id: 'b', text: 'B', link: v }], edges: [{ from: 'a', to: 'b', text: 'go', link: OKL }] },
            { id: 'b2', type: 'diagram', content: ['graph TD', 'A-->B', 'click A "' + OKL + '" "tip <img src=x onerror=alert(1)>" _top', 'click B call alert(1)', 'click B href "javascript:alert(1)"', 'click B href "data:text/html,x"', 'click A,B "' + OKL + '"', 'click __proto__ "' + OKL + '"', 'click B "//evil.example/x"', 'callback B "f"'].join('\n') },
            { id: 'b3', type: 'diagram', content: ['classDiagram', 'class S', 'link S "' + OKL + '" "tip"', 'callback S "f"', 'click S call f()'].join('\n') },
            { id: 'b4', type: 'diagram', content: ['gantt', 'section S', 'T :A, 2024-01-01, 1d', 'click A href "' + OKL + '"'].join('\n') }
        ] });
        const want = Jw([
            { type: 'flowchart', id: 'b1', dir: 'TD', space: 'normal', zoom: 1, nodes: [{ id: 'a', text: 'A', shape: 'rect', color: 'neutral', link: OKL }, { id: 'b', text: 'B', shape: 'rect', color: 'neutral' }], edges: [{ from: 'a', to: 'b', text: 'go', style: 'solid' }] },
            { type: 'diagram', id: 'b2', content: 'graph TD\nA-->B\nclick A href "' + OKL + '"' },
            { type: 'diagram', id: 'b3', content: 'classDiagram\nclass S\nclick S href "' + OKL + '"' },
            { type: 'diagram', id: 'b4', content: 'gantt\nsection S\nT :A, 2024-01-01, 1d' }
        ]);
        const aiP = require('./checkkit').part('netfog.js'), ai = aiP.indexOf('function applyItem(msg) {'), ak = aiP.indexOf('\n}\n', ai);   // applyItem stands in netfog.js, a part of net.js
        const apply = item => { const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'mA', items: { mA: { id: 'mA', type: 'map', whiteboard: [] } } } } } };
            new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanHostMap', 'msg', ownKeySrc + aiP.slice(ai, ak) + '\n}\nreturn applyItem(msg);')({ applyingRemote: false }, state, { wpDocRender: DRw, wpFog: { invalidateVision() {}, redraw() {} } }, () => state.appState.campaigns.k, () => {}, () => {}, m => m, { type: 'item', campId: 'k', itemId: item.id, item: item });
            return state.appState.campaigns.k.items[item.id]; };
        const bad = BADL.filter(v => {
            const sent = siW(page(v)), hostOk = !!sent && Jw(sent.blocks) === want;
            const got = apply(page(v)), html = got ? DRw.renderDoc(got, {}) : '';
            const clientOk = ai > 0 && ak > ai && !!got && Jw(got.blocks) === want && (html.match(/click [A-Za-z]+ href &quot;https:\/\/ok\.example\/a\?b=1&amp;c=2#f&quot;/g) || []).length === 3 && (html.match(/\bclick\b/g) || []).length === 3 && !/javascript|vbscript|data:text|evil\.example|onerror|onclick|call |callback|_top|__proto__/i.test(html);
            return !(hostOk && clientOk);
        });
        const both = siW(page('https://second.example/x')), many = { id: 'dM', type: 'doc', meta: { title: 'M', players: true }, blocks: [{ id: 'm1', type: 'diagram', content: 'graph TD\nA-->B\n' + Array.from({ length: 10000 }, (x, i) => i % 2 ? 'click N' + i + ' "https://ok.example/' + i + '" "tip"' : 'click N' + i + ' call f' + i + '()').join('\n') }] };
        const manyS = siW(many), manyG = apply(many), linesOf = it => it ? it.blocks[0].content.split('\n') : [], lineOk = it => { const l = linesOf(it); return l.length > 500 && l[0] === 'graph TD' && l[1] === 'A-->B' && l.slice(2).every(x => !!DRw.readLinkLine(x)) && it.blocks[0].content.length <= 65536; };
        check(T, bad.length === 0 && !!both && both.blocks[0].nodes[1].link === 'https://second.example/x' && !('link' in both.blocks[0].edges[0]) && lineOk(manyS) && lineOk(manyG) && Jw(manyG.blocks) === Jw(manyS.blocks), Jw([bad.slice(0, 2), both && both.blocks[0], linesOf(manyS).length]).slice(0, 1200));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// conditions C1: a character token's effects on the wire — the real sanitizeItem and wireWbItem with fxbOf and fxbMoved, sliced and run
pendingChecks.push((async () => {
    const Sx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).split(String.fromCharCode(92)).join('/'));
    const J = JSON.stringify;
    const fxA = src.indexOf('// Conditions C1 (docs/CONDITIONS_PLAN.md): the effects the table sees'), fxB = src.indexOf('/* ---------- fog of war (1.5.0 FV2): per-recipient creature drop');
    const fxS = siSrc() + '\n' + (fxA > 0 && fxB > fxA ? src.slice(fxA, fxB) : '');
    const sysF = { v: 1, name: 'F', fields: [{ id: 'f_fx', key: 'Effects', label: 'Effects', kind: 'effects', vis: 'all' }], rolls: [], effects: [{ id: 'e_pub', name: 'Blessed', icon: 'icon:bolt', tone: 'buff', vis: 'all', mods: [] }, { id: 'e_gm', name: 'Cursed', icon: 'X', tone: 'debuff', vis: 'gm', mods: [] }] };
    const mkF = role => {
        const sent = [], camp = { id: 'k', system: sysF, chars: { c_a: { id: 'c_a', name: 'A', values: { f_fx: [{ id: 'r1', ref: 'e_pub', on: true }, { id: 'r2', ref: 'e_gm', on: true }] } }, c_b: { id: 'c_b', name: 'B', values: {} }, c_c: { id: 'c_c', name: 'C', values: {} } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tA', isChar: true, charId: 'c_a', x: 0, y: 0, w: 50, h: 50 }, { id: 'box', type: 'rect', x: 0, y: 0, w: 50, h: 50, fxb: [{ n: 'Odd' }] }, { id: 'plate', type: 'rect', charId: 'c_a', x: 0, y: 0, w: 50, h: 50 }] }, m2: { id: 'm2', type: 'map', whiteboard: [{ id: 'tB', isChar: true, charId: 'c_b', x: 0, y: 0, w: 50, h: 50, fxb: [{ n: '<b>Forged</b>', i: 'x', t: 'buff' }] }] },
                m3: { id: 'm3', type: 'map', whiteboard: [{ id: 'tA2', isChar: true, charId: 'c_a', x: 0, y: 0, w: 50, h: 50, hidden: true }] }, m4: { id: 'm4', type: 'map', whiteboard: [{ id: 'tC', isChar: true, charId: 'c_c', x: 0, y: 0, w: 50, h: 50 }] } } };
        const net = { role, active: true, sendItem: (cid, mid) => sent.push(cid + ':' + mid) };
        const api = new Function('net', 'getActiveCampaign', 'SC', 'own', 'window', "'use strict';\n" + fxS + '\nreturn { sanitizeItem: sanitizeItem, wireWbItem: wireWbItem, fxbMoved: fxbMoved };')(net, () => camp, () => Sx, H.own, {});
        return { camp, net, api, sent };
    };
    const F1 = mkF('host'), c1 = F1.api.sanitizeItem(F1.camp.items.m1), c2 = F1.api.sanitizeItem(F1.camp.items.m2), c3 = F1.api.sanitizeItem(F1.camp.items.m3), alone = F1.api.wireWbItem(F1.camp.items.m1.whiteboard[0], false);
    const tokOf = (m, id) => m.whiteboard.find(w => w.id === id), hostKept = JSON.stringify(F1.camp.items);
    const cl = mkF('client'), cc1 = cl.api.sanitizeItem(cl.camp.items.m1);
    check('conditions C1 (host, run for real): a character token\'s copy carries the effects the table sees (fxb: name, icon, tone), never a GM-only one, whole or sent alone; a token whose character has none and any other piece carry none (even one naming the character), a stray fxb on the host\'s map never travels; a hidden token is not in the copy at all; the host\'s own map is left as it was; worked out on a host alone',
        J(tokOf(c1, 'tA').fxb) === J([{ n: 'Blessed', i: 'icon:bolt', t: 'buff' }]) && !/Cursed/.test(J(c1)) && J(alone.fxb) === J(tokOf(c1, 'tA').fxb) && !('fxb' in tokOf(c1, 'box')) && !('fxb' in tokOf(c1, 'plate')) && !('fxb' in tokOf(c2, 'tB'))
        && tokOf(c3, 'tA2') === undefined && c3.whiteboard.length === 0 && F1.api.wireWbItem(F1.camp.items.m3.whiteboard[0], false) === null && !/"fxb":\[\{"n":"Blessed/.test(hostKept) && /Odd/.test(hostKept) && !('fxb' in tokOf(cc1, 'tA')), J([tokOf(c1, 'tA'), tokOf(c2, 'tB'), tokOf(c3, 'tA2')]));
    F1.camp.chars.c_a.values.f_fx[0].on = false; F1.api.fxbMoved('c_a'); const mv1 = F1.sent.slice(); F1.sent.length = 0;
    F1.api.fxbMoved('c_a'); const mv2 = F1.sent.slice(); F1.sent.length = 0;
    F1.camp.chars.c_b.values.f_fx = [{ id: 'r3', ref: 'e_pub', on: true }]; F1.api.fxbMoved(null); const mv3 = F1.sent.slice(); F1.sent.length = 0;
    F1.camp.chars.c_c.values.f_fx = [{ id: 'r4', ref: 'e_pub', on: true }]; F1.api.fxbMoved('c_c'); const mv4 = F1.sent.slice(); F1.sent.length = 0;
    F1.camp.chars.c_a.values.f_fx[1].on = false; F1.api.fxbMoved('c_a'); const mv5 = F1.sent.slice(); F1.sent.length = 0;
    F1.camp.chars.c_a.values.f_fx[0].on = true; F1.api.fxbMoved('constructor'); F1.api.fxbMoved(5); const mv6 = F1.sent.slice(); F1.net.active = false; F1.api.fxbMoved('c_a'); const mv7 = F1.sent.slice();
    const cl2 = mkF('client'); cl2.api.sanitizeItem(cl2.camp.items.m1); cl2.camp.chars.c_a.values.f_fx[0].on = false; cl2.api.fxbMoved('c_a');
    check('conditions C1 (host, run for real): a character whose list moved since a copy was made sends every map holding a shown token of theirs again (a hidden one\'s map not), once; nothing moved sends nothing; every character looked at together alike; one no copy has carried yet, a GM-only effect\'s change the table never sees, a name that is no character of theirs, a session not running or a player\'s app send nothing',
        J(mv1) === J(['k:m1']) && J(mv2) === J([]) && J(mv3) === J(['k:m2']) && J(mv4) === J([]) && J(mv5) === J([]) && J(mv6) === J([]) && J(mv7) === J([]) && J(cl2.sent) === J([]), J([mv1, mv2, mv3, mv4, mv5, mv6, mv7]));
    // C2: a token with no sheet, its own effects
    const F2 = mkF('host'); F2.camp.items.m5 = { id: 'm5', type: 'map', whiteboard: [{ id: 'orc', isChar: true, x: 0, y: 0, w: 50, h: 50, fx: [{ id: 'x_1', ref: 'e_pub' }, { id: 'x_2', ref: 'e_gm' }, { id: 'x_3', name: 'Hexed', icon: '', tone: 'debuff' }] }, { id: 'tA3', isChar: true, charId: 'c_a', x: 0, y: 0, w: 50, h: 50, fx: [{ id: 'x_9', name: 'Ignored', icon: '', tone: '' }] }] };
    const c5 = F2.api.sanitizeItem(F2.camp.items.m5), orcC = tokOf(c5, 'orc'), tA3C = tokOf(c5, 'tA3');
    F2.camp.system = Object.assign({}, sysF, { effects: [Object.assign({}, sysF.effects[0], { vis: 'gm' }), sysF.effects[1]] }); F2.api.fxbMoved(null); const mvT1 = F2.sent.slice(); F2.sent.length = 0; F2.api.fxbMoved(null); const mvT2 = F2.sent.slice(); F2.sent.length = 0;
    F2.camp.items.m5.whiteboard[0].fx.push({ id: 'x_4', name: 'Late', icon: '', tone: '' }); F2.api.fxbMoved('c_a'); const mvT3 = F2.sent.slice();
    check('conditions C2 (host, run for real): a token with no sheet shows the table its own effects (fxb from its rows: a library one by its definition, never a GM-only one; one made on the spot as written) and never its rows (fx); a character token shows its character\'s, never rows of its own; a change of the system that changes a token\'s list sends its map once, nothing moved sends nothing, and one character\'s change never looks at tokens with no sheet',
        J(orcC.fxb) === J([{ n: 'Blessed', i: 'icon:bolt', t: 'buff' }, { n: 'Hexed', i: '', t: 'debuff' }]) && !('fx' in orcC) && !/Cursed|e_gm|x_2/.test(J(c5)) && J(tA3C.fxb) === J([{ n: 'Blessed', i: 'icon:bolt', t: 'buff' }]) && !('fx' in tA3C) && !/Ignored/.test(J(c5))
        && J(mvT1) === J(['k:m1', 'k:m5']) && J(mvT2) === J([]) && J(mvT3) === J([]), J([orcC, tA3C, mvT1, mvT2, mvT3]));
    // C4: a character token's automatic effects, worked out on the host from its character's own values
    const Fx4 = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'formula.js')).split(String.fromCharCode(92)).join('/')), sysA4 = Sx.cleanSystem({ v: 1, name: 'A', fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all' }, { id: 'f_hp', key: 'HP', kind: 'number', vis: 'all' }], rolls: [], effects: [{ id: 'e_down', name: 'Unconscious', icon: 'X', tone: 'debuff', auto: 'HP <= 0', mods: [] }] }, { F: Fx4, gmView: true });
    const campA4 = { id: 'k', system: sysA4, chars: { c_a: { id: 'c_a', name: 'A', values: { f_hp: 3 } } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tA', isChar: true, charId: 'c_a', x: 0, y: 0, w: 50, h: 50 }] } } }, sentA4 = [];
    const apiA4 = new Function('net', 'getActiveCampaign', 'SC', 'own', 'window', "'use strict';\n" + fxS + '\nreturn { sanitizeItem: sanitizeItem, fxbMoved: fxbMoved };')({ role: 'host', active: true, sendItem: (cid, mid) => sentA4.push(cid + ':' + mid) }, () => campA4, () => Sx, H.own, { wpFormula: Fx4 });
    const a4a = tokOf(apiA4.sanitizeItem(campA4.items.m1), 'tA'); campA4.chars.c_a.values.f_hp = 0; apiA4.fxbMoved('c_a'); const a4mv = sentA4.slice(); const a4b = tokOf(apiA4.sanitizeItem(campA4.items.m1), 'tA'); sentA4.length = 0; apiA4.fxbMoved('c_a'); const a4mv2 = sentA4.slice();
    check('conditions C4 (host, run for real): a character token shows the table its automatic effects on, worked out on the host from its character\'s own values — none while the formula is false; a change that turns one on sends its map once, and nothing moves nothing',
        !('fxb' in a4a) && J(a4mv) === J(['k:m1']) && J(a4b.fxb) === J([{ n: 'Unconscious', i: 'X', t: 'debuff' }]) && J(a4mv2) === J([]) && /\(S\.tokenEffectsPass \|\| S\.tokenEffects\)\(camp\.system, camp\.chars\[w\.charId\], false, window\.wpFormula\)/.test(fxS) && /function fxbMoved\(id\) \{\n(?:[^\n]*\n){3}    var SF = SC\(\); if \(SF && typeof SF\.tokenEffectsForget === 'function'\) SF\.tokenEffectsForget\(\);/.test(fxS), J([a4a, a4mv, a4b, a4mv2]));
    check('conditions C1 (source): the three funnels every character change leaves by look for moved effects — syncChars for every character, syncChar and syncCharDelta for the one that changed',
        /net\.syncChars = function\(\) \{[^\n]*\n[^\n]*\n[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(null\);/.test(src) && /net\.syncChar = function\(id\) \{[^\n]*\n[^\n]*\n[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(id\);/.test(src)
        && /net\.syncCharDelta = function\(id, values\) \{[^\n]*\n[^\n]*\n[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(id\);/.test(src));
    {   // 1.6.3 (the review of the game's fixes): the effects kept for one pass (systemcore tokenEffectsPass) are let go on the FIRST line of each host
        // funnel (fxPassForget, run for real from the slice), before sensesMoved, the bars, the look or the loot may send a map: a list kept earlier in
        // the same task, before the sheet changed in place (same object, same values object, same stamp), would otherwise ride on that copy
        const campP = { id: 'k', system: sysA4, chars: { c_a: { id: 'c_a', name: 'A', values: { f_hp: 3 } } }, items: {} };
        const apiP = new Function('net', 'getActiveCampaign', 'SC', 'own', 'window', "'use strict';\n" + fxS + '\nreturn { fxPassForget: fxPassForget };')({ role: 'host', active: true, sendItem: () => {} }, () => campP, () => Sx, H.own, { wpFormula: Fx4 });
        Sx.tokenEffectsForget(); const pBefore = Sx.tokenEffectsPass(sysA4, campP.chars.c_a, false, Fx4); campP.chars.c_a.values.f_hp = 0;
        const pStale = Sx.tokenEffectsPass(sysA4, campP.chars.c_a, false, Fx4); apiP.fxPassForget(); const pFresh = Sx.tokenEffectsPass(sysA4, campP.chars.c_a, false, Fx4);
        const pHeads = ['net\\.syncChars = function\\(\\) \\{', 'net\\.syncChar = function\\(id\\) \\{', 'net\\.syncCharDelta = function\\(id, values\\) \\{'].map(h => new RegExp(h + " if \\(typeof fxPassForget === 'function'\\) fxPassForget\\(\\);").test(src));
        check('1.6.3 the effects kept for one pass are let go where a change enters the host: fxPassForget (run for real) makes the next ask work the list out from the sheet as it is now, where a list kept before an in-place change is still handed back without it; and it is the first thing syncChars, syncChar and syncCharDelta do, before sensesMoved',
            pBefore.length === 0 && pStale === pBefore && J(pFresh.map(e => e.n)) === J(['Unconscious']) && pHeads.every(Boolean), J([pBefore, pStale, pFresh, pHeads]));
    }
})());
// backlog 28, token bars on the wire: the real sanitizeItem and wireWbItem with barsOf, barsMoved and tokBarsTell (the slice fxb's checks run), and
// a player's side (cleanHostBars, ownBarsTake, net.ownBars), sliced and run for real
pendingChecks.push((async () => {
    const T = 'backlog 28 token bars (run for real)';
    try {
        const Sx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).split(String.fromCharCode(92)).join('/'));
        const Fx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'formula.js')).split(String.fromCharCode(92)).join('/'));
        const J = JSON.stringify;
        const fxA = src.indexOf('// Conditions C1 (docs/CONDITIONS_PLAN.md): the effects the table sees'), fxB = src.indexOf('/* ---------- fog of war (1.5.0 FV2): per-recipient creature drop');
        const bS = siSrc() + '\n' + (fxA > 0 && fxB > fxA ? src.slice(fxA, fxB) : '');
        const sysB = Sx.cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', vis: 'all', maxFormula: '10' }, { id: 'f_fp', key: 'FP', label: 'FP', kind: 'resource', vis: 'all', maxFormula: '5' }, { id: 'f_sec', key: 'Sec', kind: 'number', vis: 'gm' },
            { id: 'f_mp', key: 'MP', label: 'MP', kind: 'resource', vis: 'all', maxFormula: 'Sec' }, { id: 'f_gp', key: 'GP', label: 'GP', kind: 'resource', vis: 'gm', maxFormula: '3' }], rolls: [], combat: { bars: [{ f: 'f_hp', show: 'all', color: '#ff0000' }, { f: 'f_fp', show: 'owner', color: '#00ff00' }] } }, { F: Fx, gmView: true });
        const mk = role => {
            const sent = [], sends = [], timers = [];
            const camp = { id: 'k', system: sysB, chars: { c_a: { id: 'c_a', name: 'A', ownerId: 'p1', values: { f_hp: { cur: 7 }, f_fp: { cur: 2 }, f_sec: 8, f_mp: { cur: 4 }, f_gp: { cur: 1 } } }, c_n: { id: 'c_n', name: 'N', npc: true, values: { f_hp: { cur: 3 } } } },
                items: { m1: { id: 'm1', type: 'map', whiteboard: [
                    { id: 'tA', isChar: true, charId: 'c_a', ownerId: 'p1', x: 0, y: 0, w: 50, h: 50 }, { id: 'tN', isChar: true, charId: 'c_n', x: 0, y: 0, w: 50, h: 50 },
                    { id: 'tP', isChar: true, x: 0, y: 0, w: 50, h: 50, bars: [{ n: 'Morale', cur: 3, max: 6, show: 'all' }, { n: 'Secret', cur: 1, max: 2, show: 'gm' }] },
                    { id: 'tO', isChar: true, charId: 'c_a', ownerId: 'p1', x: 0, y: 0, w: 50, h: 50, bars: [{ f: 'f_mp', show: 'all' }, { f: 'f_gp', show: 'owner' }] },
                    { id: 'tQ', isChar: true, ownerId: 'p1', x: 0, y: 0, w: 50, h: 50, bars: [{ n: 'Grit', cur: 2, max: 4, show: 'owner' }, null] },
                    { id: 'box', type: 'rect', x: 0, y: 0, w: 50, h: 50, bars: [{ n: 'Odd', cur: 1, max: 1, show: 'all' }], tbr: [{ s: 0, v: 1, m: 1 }] }, { id: 'plain', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] },
                    m3: { id: 'm3', type: 'map', whiteboard: [{ id: 'tH', isChar: true, charId: 'c_a', ownerId: 'p1', hidden: true, x: 0, y: 0, w: 50, h: 50, bars: [{ n: 'Hid', cur: 1, max: 1, show: 'all' }] }] } } };
            const conns = [{ peer: 'k1', open: true, send: m => { packCheck(m); sends.push(['k1', JSON.parse(J(m))]); } }, { peer: 'k2', open: true, send: m => sends.push(['k2', JSON.parse(J(m))]) }, { peer: 'k3', open: false, send: m => sends.push(['k3', m]) }];
            const net = { role, active: true, sendItem: (cid, mid) => sent.push(cid + ':' + mid), conns, roster: { k1: { id: 'p1' }, k2: { id: 'p2' }, k3: { id: 'p1' } } };
            const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) } };
            const held = { k1: { m1: 1, m3: 1 }, k2: { m1: 1 }, k3: { m1: 1 } };
            const api = new Function('net', 'getActiveCampaign', 'SC', 'own', 'window', 'fxLib', 'itemLib', 'quickHash', 'mapHeldOf', 'sendFailed', 'setTimeout', "'use strict';\n" + bS + '\nreturn { sanitizeItem: sanitizeItem, wireWbItem: wireWbItem, barsOf: barsOf, barsMoved: barsMoved, tokBarsTell: tokBarsTell, tokBarsSoon: tokBarsSoon };')(
                net, () => camp, () => Sx, H.own, win, () => ({}), () => ({}), s => s.length + ':' + s, c => held[c.peer] || {}, () => {}, fn => { timers.push(fn); return 1; });
            return { camp, net, api, sent, sends, timers, held };
        };
        const tokOf = (m, id) => m.whiteboard.find(w => w.id === id);
        const B1 = mk('host'), c1 = B1.api.sanitizeItem(B1.camp.items.m1), c3 = B1.api.sanitizeItem(B1.camp.items.m3), alone = B1.api.wireWbItem(B1.camp.items.m1.whiteboard[0], false), kept = J(B1.camp.items);
        const cl = mk('client'), cc1 = cl.api.sanitizeItem(cl.camp.items.m1);
        check(T + ': a token\'s copy carries the bars everyone is shown (tbr: slot, now, most, label, color), worked out in the players\' view: a character token the system\'s, an NPC\'s too, a token with no sheet its own numbers; never a bar shown to its owner or the GM alone, never a pool that is GM-only or whose most reads a GM-only value, never a token\'s own list (bars) nor a stray tbr on a piece that is no token; a hidden token is not in the copy at all; the host\'s map is left as it was; worked out on a host alone',
            J(tokOf(c1, 'tA').tbr) === J([{ s: 0, v: 7, m: 10, n: 'HP', c: '#ff0000' }]) && J(alone.tbr) === J(tokOf(c1, 'tA').tbr) && J(tokOf(c1, 'tN').tbr) === J([{ s: 0, v: 3, m: 10, n: 'HP', c: '#ff0000' }])
            && J(tokOf(c1, 'tP').tbr) === J([{ s: 0, v: 3, m: 6, n: 'Morale', c: '#d9534f' }]) && !('tbr' in tokOf(c1, 'tO')) && !('tbr' in tokOf(c1, 'tQ')) && !('tbr' in tokOf(c1, 'box')) && !('bars' in tokOf(c1, 'box'))
            && !c1.whiteboard.some(w => 'bars' in w) && !/Secret|Grit|f_mp|f_gp|"MP"|"GP"|"FP"/.test(J(c1)) && tokOf(c3, 'tH') === undefined && B1.api.wireWbItem(B1.camp.items.m3.whiteboard[0], false) === null
            && /Secret/.test(kept) && /Grit/.test(kept) && !/"tbr":\[\{"s":0,"v":7/.test(kept) && !cc1.whiteboard.some(w => 'tbr' in w || 'bars' in w) && J(tokOf(c1, 'plain')) === J({ id: 'plain', type: 'rect', x: 0, y: 0, w: 50, h: 50 }),
            J([tokOf(c1, 'tA'), tokOf(c1, 'tN'), tokOf(c1, 'tP'), tokOf(c1, 'tO'), tokOf(c1, 'tQ'), tokOf(c1, 'box')]));
        B1.api.tokBarsTell(); const t1 = B1.sends.slice(); B1.sends.length = 0;
        B1.api.tokBarsTell(); const t2 = B1.sends.slice(); B1.sends.length = 0;
        B1.camp.chars.c_a.values.f_fp = { cur: 1 }; B1.api.tokBarsTell(); const t3 = B1.sends.slice(); B1.sends.length = 0;
        B1.camp.items.m1.whiteboard[0].hidden = true; B1.camp.items.m1.whiteboard[4].hidden = true; B1.api.tokBarsTell(); const t4 = B1.sends.slice(); B1.sends.length = 0;
        B1.api.tokBarsTell(); const t5 = B1.sends.slice(); B1.sends.length = 0;
        B1.camp.items.m1.whiteboard[0].hidden = false; B1.held.k1 = { m3: 1 }; B1.api.tokBarsTell(); const t6 = B1.sends.slice(); B1.sends.length = 0;
        const cl2 = mk('client'); cl2.api.tokBarsTell(); const B0 = mk('host'); B0.net.active = false; B0.api.tokBarsTell();
        check(T + ': the bars a token\'s owner alone is shown go to that player\'s connections alone (tokBars: the map, a token of theirs, its figures), one message a map they hold whole and only when it changed; a GM-only pool is never among them; a hidden token sends nothing, and {} clears what was sent once; a map no longer held, a closed connection, another player, a player\'s app and a session not running send nothing',
            J(t1) === J([['k1', { type: 'tokBars', campId: 'k', itemId: 'm1', bars: { tA: [{ s: 1, v: 2, m: 5, n: 'FP', c: '#00ff00' }], tQ: [{ s: 0, v: 2, m: 4, n: 'Grit', c: '#d9534f' }] } }]]) && J(t2) === J([])
            && J(t3) === J([['k1', { type: 'tokBars', campId: 'k', itemId: 'm1', bars: { tA: [{ s: 1, v: 1, m: 5, n: 'FP', c: '#00ff00' }], tQ: [{ s: 0, v: 2, m: 4, n: 'Grit', c: '#d9534f' }] } }]])
            && J(t4) === J([['k1', { type: 'tokBars', campId: 'k', itemId: 'm1', bars: {} }]]) && J(t5) === J([]) && J(t6) === J([]) && J(cl2.sends) === J([]) && J(B0.sends) === J([]) && !/GP|Secret|Hid/.test(J(t1.concat(t3))),
            J([t1, t2, t3, t4, t5, t6]));
        const B2 = mk('host'); B2.api.sanitizeItem(B2.camp.items.m1);
        B2.camp.chars.c_a.values.f_hp = { cur: 5 }; B2.api.barsMoved('c_a'); const mv1 = B2.sent.slice(); B2.sent.length = 0;
        B2.api.barsMoved('c_a'); const mv2 = B2.sent.slice(); B2.sent.length = 0;
        B2.camp.chars.c_a.values.f_fp = { cur: 0 }; B2.camp.chars.c_a.values.f_gp = { cur: 0 }; B2.api.barsMoved('c_a'); const mv3 = B2.sent.slice(); B2.sent.length = 0;
        B2.camp.items.m1.whiteboard[2].bars[0].cur = 1; B2.api.barsMoved('c_a'); const mv4 = B2.sent.slice(); B2.api.barsMoved(null); const mv5 = B2.sent.slice(); B2.sent.length = 0;
        B2.camp.chars.c_n.values.f_hp = { cur: 1 }; B2.api.barsMoved('constructor'); B2.api.barsMoved(5); const mv6 = B2.sent.slice(); B2.net.active = false; B2.api.barsMoved(null); const mv7 = B2.sent.slice();
        const timersN = B2.timers.length; B2.net.active = true; B2.api.tokBarsSoon(); B2.api.tokBarsSoon(); const timersN2 = B2.timers.length;
        const cl3 = mk('client'); cl3.api.sanitizeItem(cl3.camp.items.m1); cl3.camp.chars.c_a.values.f_hp = { cur: 1 }; cl3.api.barsMoved('c_a');
        check(T + ': a change that moves the bars everyone is shown sends the map holding the token again, once; one only its owner or the GM sees sends no map (the owner\'s message is looked at, once a moment); a token\'s own numbers move with every token looked at; a name that is no character, a session not running and a player\'s app send nothing',
            J(mv1) === J(['k:m1']) && J(mv2) === J([]) && J(mv3) === J([]) && J(mv4) === J([]) && J(mv5) === J(['k:m1']) && J(mv6) === J([]) && J(mv7) === J([]) && timersN === 1 && timersN2 === 1 && J(cl3.sent) === J([]) && cl3.timers.length === 0,
            J([mv1, mv2, mv3, mv4, mv5, mv6, mv7, timersN, timersN2]));
        // a player's side: everyone's bars cleaned again on the token, their own kept beside the map
        const cA = src.indexOf("// Backlog 28: a token's bars everyone is shown, as the host sent them"), cB = src.indexOf("// Lighting L4: an item's light as the host sent it");
        const cS = cA > 0 && cB > cA ? src.slice(cA, cB) : '';
        const ccamp = { id: 'k', items: { m1: { id: 'm1', type: 'map', whiteboard: [] } } }, cnet = {}, cwin = { wpSystemCore: Sx };
        const capi = new Function('net', 'window', 'campOf', 'own', 'fogDiffId', "'use strict';\n" + cS + '\nreturn { cleanHostBars: cleanHostBars, ownBarsTake: ownBarsTake, ownBarsReset: ownBarsReset };')(cnet, cwin, id => id === 'k' ? ccamp : null, H.own, v => typeof v === 'string' && v.length > 0 && v.length <= 256);
        const hw = { id: 't', isChar: true, tbr: [{ s: 0, v: 1, m: 2, n: '<i>x', c: '#ABCDEF', g: 1 }, { s: 0, v: 9, m: 9 }, { s: 1, v: 'x', m: 1 }], bars: [{ n: 'Secret', cur: 1, max: 1 }] }; capi.cleanHostBars(hw);
        const hr = { id: 'r', type: 'rect', tbr: [{ s: 0, v: 1, m: 1 }], bars: [] }; capi.cleanHostBars(hr); const hwt = { id: 'w', isChar: true, waiting: true, tbr: [{ s: 0, v: 1, m: 1 }] }; capi.cleanHostBars(hwt);
        const noS = new Function('net', 'window', 'campOf', 'own', 'fogDiffId', "'use strict';\n" + cS + '\nreturn { cleanHostBars: cleanHostBars };')({}, {}, () => null, H.own, () => true), hn = { id: 'n', isChar: true, tbr: [{ s: 0, v: 1, m: 1 }] }; noS.cleanHostBars(hn);
        const many = {}; for (let i = 0; i < 250; i++) many['t' + i] = [{ s: 0, v: i, m: 300 }];
        capi.ownBarsTake('k', 'm1', Object.assign(JSON.parse('{"__proto__":[{"s":0,"v":1,"m":1}]}'), { tA: [{ s: 1, v: 2, m: 5, n: 'FP', c: '#00ff00', g: 1 }], ['x'.repeat(300)]: [{ s: 0, v: 1, m: 1 }], tB: 'x' }));
        const o1 = [cnet.ownBars('m1', 'tA'), cnet.ownBars('m1', '__proto__'), cnet.ownBars('m1', 'tB'), cnet.ownBars('m1', 'x'.repeat(300)), cnet.ownBars('m1', 'nope'), cnet.ownBars(5, 'tA')];
        capi.ownBarsTake('k', 'm9', { tA: [{ s: 0, v: 1, m: 1 }] }); const o2 = cnet.ownBars('m9', 'tA');
        capi.ownBarsTake('k', 'm1', many); const o3 = Object.keys(many).filter(id => cnet.ownBars('m1', id).length).length;
        capi.ownBarsTake('k', 'm1', {}); const o4 = cnet.ownBars('m1', 't0'); capi.ownBarsTake('k', 'm1', { tA: [{ s: 0, v: 1, m: 1 }] }); capi.ownBarsReset(); const o5 = cnet.ownBars('m1', 'tA');
        check(T + ': a player\'s app cleans the bars everyone is shown again on a token (the first per slot, numbers, a plain label, a #rrggbb color, never a GM mark), never on a piece that is no token or a waiting token, never with no cleaner, and never keeps a token\'s own list; their own bars are kept beside a map of the campaign by token id, in a map of no prototype where a prototype\'s name is only a name (no id past 256, at most 200 a map), {} or a new session clears them',
            J(hw) === J({ id: 't', isChar: true, tbr: [{ s: 0, v: 1, m: 2, n: '<i>x', c: '#abcdef' }] }) && J(hr) === J({ id: 'r', type: 'rect' }) && J(hwt) === J({ id: 'w', isChar: true, waiting: true }) && J(hn) === J({ id: 'n', isChar: true })
            && J(o1) === J([[{ s: 1, v: 2, m: 5, n: 'FP', c: '#00ff00' }], [{ s: 0, v: 1, m: 1, n: 'Bar 1', c: '#d9534f' }], [], [], [], []]) && J(Object.keys(Object.prototype)) === J([]) && ({}).s === undefined && J(o2) === J([]) && o3 === 200 && J(o4) === J([]) && J(o5) === J([]), J([hw, hr, o1, o2, o3, o4, o5]));
        check(T + ' (source): a player hears tokBars from the synced host alone, never in the stream window, for the hosted campaign; a whole map\'s items clean tbr; a new session forgets their own bars; every change of a character looks at the bars as it looks at the effects (fxbMoved, which the three funnels call); a map given whole, sent or sent filtered looks at the owners\' bars; a connection forgotten forgets what it was sent',
            /\} else if \(msg\.type === 'tokBars' && net\.role === 'client'\) \{\n[^\n]*\n[^\n]*\n[^\n]*\n        if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer \|\| net\.stream\) return;\n        if \(typeof msg\.campId !== 'string' \|\| msg\.campId !== state\.appState\.activeCampaignId \|\| !validKey\(msg\.itemId\)\) return;\n        ownBarsTake\(msg\.campId, msg\.itemId, msg\.bars\);/.test(src)
            && src.includes('if (w.fxb !== undefined) cleanHostFxb(w); if (w.tbr !== undefined || w.bars !== undefined) cleanHostBars(w);') && src.includes('function charSessionReset() { if (typeof ownBarsReset === \'function\') ownBarsReset();')
            && src.includes("function fxbMoved(id) {\n    if (typeof barsMoved === 'function') barsMoved(id);") && (src.match(/fxbMoved\((?:null|id)\);/g) || []).length === 3
            && require('./checkkit').part('netfog.js').includes("function mapHeldNote(conn, mapId) { if (!conn || typeof conn.peer !== 'string' || typeof mapId !== 'string') return; if (typeof tokBarsSoon === 'function') tokBarsSoon();") && (src.match(/if \(it\.type === 'map' && typeof tokBarsSoon === 'function'\) tokBarsSoon\(\);/g) || []).length === 2
            && require('./checkkit').part('netfog.js').includes("if (typeof _barSent === 'object' && _barSent) delete _barSent[peer];"));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
/* ================= 1.6.0 a GM-only stat: the real sanitizeAppState, for a player and for the stream window ================= */
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const saSrcC = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const win = { wpSystemCore: Sx, wpFormula: Fx, wpLibrary: { catsFor: () => ({ show: [], hide: [] }) } };
    const SAc = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrcC + '\nreturn sanitizeAppState;')(H.own, win, () => ({}), () => ({}), v => v, it => it, it => it);
    const sys = () => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], sheet: { sections: [] }, fields: [{ id: 'f_l', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Skill', label: 'Skill' }, { key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Use', formula: '3d6 <= Row.Skill', fumbleAt: '18 - Row.Flaw' }] } }], items: [{ id: 'i_a', name: 'Pebbles', stats: { Skill: 9, Flaw: 2 } }], combat: { checks: 'fixed' } }, { F: Fx, gmView: true });
    const gm = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: null, items: {}, system: sys(), chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_p', npc: false, values: { f_l: [{ id: 'w_a', defId: 'i_a', qty: 1, ov: { stats: { Flaw: 5 }, held: ['Flaw'] } }] } } } } } });
    const kept = gm(), forP = SAc(kept, 'u_p'), forS = SAc(gm()), row = forP.campaigns.k1.chars ? forP.campaigns.k1.chars.c_1 : null;
    check('1.6.0 a GM-only stat in the join snapshot and the stream window (the real sanitizeAppState with the real core): nothing of it in the system, an entry, a roll\'s range or a character\'s row, the row still there with the stats they may read; the GM\'s own save keeps it',
        !/flaw/i.test(j(forP)) && !/flaw/i.test(j(forS)) && /Skill/.test(j(forP.campaigns.k1.system)) && /flaw/i.test(j(kept)) && (!row || !!row.values.f_l), j(forP).slice(0, 500));
})());

/* ================= a session is one campaign (owner's answer 2026-09-29, found during senses S0 (b)): the real sanitizeAppState copies only the hosted campaign ================= */
{
    const saSrc = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const SA = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrc + '\nreturn sanitizeAppState;')(H.own, {}, () => ({}), () => ({}), v => v, (it) => it, (it) => it);
    const map = id => ({ id, type: 'map', meta: { title: id }, rooms: [], links: [], whiteboard: [{ id: 'orc_' + id, type: 'image', isChar: true, x: 1, y: 1, w: 50, h: 50 }] });
    const gm = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', items: { m1: map('m1') } }, k2: { id: 'k2', name: 'Secret game', activeItemId: 'm2', items: { m2: map('m2'), p2: { id: 'p2', type: 'planner', blocks: [] } } } } });
    const forP = SA(gm(), 'u_p'), forStream = SA(gm()), odd = SA(Object.assign(gm(), { activeCampaignId: 'constructor' })), none = SA(Object.assign(gm(), { activeCampaignId: 'k9' }));
    const kept = gm(); SA(kept, 'u_p');
    check('a session is one campaign: the join snapshot and the stream window carry the hosted campaign alone — never the GM\'s other games, their names, maps or planners; an active campaign that is no campaign of theirs (a prototype\'s name, one gone) carries none; the GM\'s own state is left as it was',
        JSON.stringify(Object.keys(forP.campaigns)) === '["k1"]' && forP.campaigns.k1.items.m1.whiteboard.length === 1 && JSON.stringify(Object.keys(forStream.campaigns)) === '["k1"]' && !/Secret game|orc_m2|p2/.test(JSON.stringify(forP)) && forP._schema === 2
        && JSON.stringify(odd.campaigns) === '{}' && JSON.stringify(none.campaigns) === '{}' && JSON.stringify(Object.keys(kept.campaigns)) === '["k1","k2"]', JSON.stringify([Object.keys(forP.campaigns), Object.keys(forStream.campaigns), odd.campaigns, none.campaigns]));
    {   // 1.6.2 sounds on actions: the list is the GM's alone
        const lineS = gm(); lineS.campaigns.k1.soundOn = [{ ev: { k: 'roll', r: 'r_shot' }, snd: 's_bang', n: 'Attack', sn: 'Bang' }];
        const forS = SA(lineS, 'u_p'), forSt = SA(lineS);
        check('1.6.2 sounds on actions: nothing of the list is in the join snapshot or the stream window (the real sanitizeAppState), for the GM\'s own campaign it stays', !/soundOn|r_shot|s_bang|Bang/.test(JSON.stringify(forS)) && !/soundOn|r_shot|s_bang/.test(JSON.stringify(forSt)) && lineS.campaigns.k1.soundOn.length === 1);
    }
    // 1.6.0 backlog 34: the Image Library's tags are the GM's own. The shared store and the hosted campaign's (its tags, the pictures they are on,
    // a shelf and its saved filters) are in no join snapshot and no stream window's copy, and the GM's own state keeps them
    const tg = () => { const s = gm(); s.imageCats = { list: ['SharedTagQ'], by: { '/saves/images/m1/a.png': ['SharedTagQ'] }, shelf: { SharedTagQ: true } };
        s.campaigns.k1.imageCats = { list: ['VillainTagQ'], by: { '/saves/images/m1/b.png': ['VillainTagQ'] }, shelf: {}, filters: [{ name: 'SavedFilterQ', tags: ['VillainTagQ'], match: 'all', words: 'docksQ' }] }; return s; };
    const tgP = JSON.stringify(SA(tg(), 'u_p')), tgS = JSON.stringify(SA(tg())), tgKept = tg(); SA(tgKept, 'u_p');
    check('backlog 34 the Image Library tags never leave (the real sanitizeAppState): no tag, no picture it is on, no shelf and no saved filter in a player\'s snapshot or the stream window\'s, of the shared store or the hosted campaign\'s; the GM\'s own state keeps both',
        ![tgP, tgS].some(t => /imageCats|SharedTagQ|VillainTagQ|SavedFilterQ|docksQ/.test(t)) && !!tgKept.imageCats && tgKept.campaigns.k1.imageCats.filters.length === 1, [tgP.slice(0, 300)]);
    // 1.6.2 (backlog 227; the owner, by prompt): a tag's private mark lives in its store and leaves with nothing; a character ticked Template is the GM's
    // alone, so neither it nor its tick is in a player's snapshot or the stream window's copy
    const tp = () => { const s = tg(); s.imageCats.priv = { SharedTagQ: true }; s.campaigns.k1.imageCats.priv = { VillainTagQ: true };
        s.campaigns.k1.chars = Object.assign({}, s.campaigns.k1.chars || {}, { c_tplq: { id: 'c_tplq', name: 'TemplateGuardQ', ownerId: '', template: true, values: {} } }); return s; };
    const tpP = JSON.stringify(SA(tp(), 'u_p')), tpS = JSON.stringify(SA(tp())), tpKept = tp(); SA(tpKept, 'u_p');
    check('1.6.2 Export all on the wire (the real sanitizeAppState): no private mark of the shared store or the hosted campaign\'s, no template and no Template tick in a player\'s snapshot or the stream window\'s; the GM\'s own state keeps them',
        ![tpP, tpS].some(t => /priv|imageCats|TemplateGuardQ|c_tplq|"template"/.test(t)) && tpKept.campaigns.k1.imageCats.priv.VillainTagQ === true && tpKept.campaigns.k1.chars.c_tplq.template === true, [tpP.slice(0, 300)]);
}
// 1.5.5, a list placed once a category (the review of that fold): a placement's categories in the join snapshot and the stream window are judged as a
// list's own are (Stage 6 F4b), so a category only GM-only things carry never reaches a player — the real sanitizeAppState with the real systemcore
pendingChecks.push((async () => {
    const T = '1.5.5 a list placed once a category on the wire (the real sanitizeAppState with the real systemcore, the formula engine and the library\'s word, catsFor): the join snapshot and the stream window carry a placement\'s categories as the players\' view judges a list\'s own, so one a GM-only item carries and one the library calls GM-only are nowhere in either, a placement left with none goes, and one a library entry players may see carries stays; a player\'s app cleaning it again keeps it byte for byte; the GM\'s own system is left as it was';
    try {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const saSrcC = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
        const win = { wpSystemCore: Sx, wpFormula: Fx, wpLibrary: { catsFor: () => ({ show: ['Charms'], hide: ['Smuggled Relics'] }) } };
        const SAc = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrcC + '\nreturn sanitizeAppState;')(H.own, win, () => ({}), () => ({}), v => v, it => it, it => it);
        const sys = () => ({ v: 1, name: 'Docks kit', rolls: [], items: [{ id: 'i_blade', name: 'Blade', category: 'Weapons' }, { id: 'i_coat', name: 'Coat', category: 'Armor' }, { id: 'i_gem', name: 'Gem', category: 'Hidden Stash', vis: 'gm' }],
            fields: [{ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list' }],
            sheet: { sections: [{ id: 's_a', title: 'Arms', fields: [{ id: 'f_gear', w: 'row', cats: ['Weapons'] }] }, { id: 's_b', title: 'Wear', fields: [{ id: 'f_gear', w: 'row', cats: ['Armor', 'Hidden Stash'] }] },
                { id: 's_c', title: 'Loot', fields: [{ id: 'f_gear', w: 'row', cats: ['Smuggled Relics'] }] }, { id: 's_d', title: 'Kit', fields: [{ id: 'f_gear', w: 'row', cats: ['Charms'] }] }] } });
        const gm = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: null, items: {}, system: sys() } } });
        const kept = gm(), forP = SAc(kept, 'u_p'), forS = SAc(gm());
        const pv = forP.campaigns.k1.system, cli = Sx.cleanSystem(JSON.parse(j(pv)), { F: Fx, gmView: false, libCats: {}, needShown: true });
        const lay = s => s.sheet.sections.map(x => [x.id, x.fields.map(p => p.id + (p.cats ? ':' + p.cats.join('+') : ''))]);
        check(T, !!pv && j(lay(pv)) === j([['s_a', ['f_gear:Weapons']], ['s_b', ['f_gear:Armor']], ['s_c', []], ['s_d', ['f_gear:Charms']]]) && j(lay(forS.campaigns.k1.system)) === j(lay(pv))
            && !/Hidden Stash|Smuggled Relics/.test(j([forP, forS])) && j(cli.sheet) === j(pv.sheet) && j(kept.campaigns.k1.system) === j(sys()), j([pv && lay(pv), cli && lay(cli)]));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// item 21 V1: the campaign's video library is the GM's alone — the real sanitizeAppState leaves it out of the join snapshot and the stream window
{
    const saSrcV = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const SAv = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrcV + '\nreturn sanitizeAppState;')(H.own, {}, () => ({}), () => ({}), v => v, (it) => it, (it) => it);
    const vids = () => [{ id: 'v_abcdefgh', name: 'The reveal', path: '/saves/images/video/k1/aaaa_reveal.mp4', size: 123456, dur: 42 }];
    const gmV = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: null, items: {}, videos: vids() } } });
    const forPv = SAv(gmV(), 'u_p'), forSv = SAv(gmV()), keptV = gmV(); SAv(keptV, 'u_p');
    check('item 21 V1 the video library never leaves the host: the join snapshot and the stream window carry no videos key, no name and no path of one; the GM\'s own campaign keeps its library; net.js names camp.videos nowhere but where it strips it (no message carries it)',
        !('videos' in forPv.campaigns.k1) && !('videos' in forSv.campaigns.k1) && !/The reveal|reveal\.mp4|v_abcdefgh/.test(JSON.stringify([forPv, forSv])) && JSON.stringify(keptV.campaigns.k1.videos) === JSON.stringify(vids())
        && /        delete camp\.uploads;[^\n]*\n        delete camp\.videos;/.test(require('./checkkit').part('netfog.js')) && require('./checkkit').familyCount('net.js', /\.videos\b/) === 1, JSON.stringify(forPv.campaigns.k1));   // .videos stands once in net.js and its parts: in the line that strips it
}
// backlog 125 (pageshelf.js): the pages pinned for the session name planners, which are the GM's alone — the real sanitizeAppState leaves the list (and the pinned maps) out of the join snapshot and the stream window
{
    const saSrcS = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const SAs = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrcS + '\nreturn sanitizeAppState;')(H.own, {}, () => ({}), () => ({}), v => v, (it) => it, (it) => it);
    const gmS = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', fights: { on: 'f_aaaaaaa1', list: { f_aaaaaaa1: { mapId: 'm1', rows: [] } } }, pinnedMaps: ['m1'], pinnedPages: ['plan_secret_twist', 'doc_rules'],
        items: { m1: { id: 'm1', type: 'map', meta: { title: 'm1', scenePage: 'plan_secret_twist' }, rooms: [], links: [], whiteboard: [{ id: 'pin1', type: 'image', x: 1, y: 1, w: 50, h: 50, page: 'plan_secret_twist', pageAt: 'sec_secret_twist' }, { id: 'pin2', type: 'rect', x: 9, y: 9, w: 50, h: 50, page: 'doc_rules' }, { id: 'tokN', type: 'image', isChar: true, x: 5, y: 5, w: 50, h: 50, page: 'plan_secret_twist' }] }, plan_secret_twist: { id: 'plan_secret_twist', type: 'planner', meta: { title: 'The twist' }, blocks: [] }, doc_rules: { id: 'doc_rules', type: 'doc', meta: { title: 'Rules' }, blocks: [] } } } } });
    const forPs = SAs(gmS(), 'u_p'), forSs = SAs(gmS()), keptS = gmS(); SAs(keptS, 'u_p');
    check('backlog 125 the pages pinned for the session never leave the host: the join snapshot and the stream window carry no pinnedPages key and no pinnedMaps key, and the id of a pinned planner is nowhere in either; the GM\'s own campaign keeps both lists; net.js names camp.pinnedPages nowhere but where it strips it (no message carries it)',
        !('fights' in forPs.campaigns.k1) && !('fights' in forSs.campaigns.k1) && !('pinnedPages' in forPs.campaigns.k1) && !('pinnedPages' in forSs.campaigns.k1) && !('pinnedMaps' in forPs.campaigns.k1) && !('pinnedMaps' in forSs.campaigns.k1) && !/plan_secret_twist|The twist/.test(JSON.stringify([forPs, forSs]))
        && JSON.stringify(keptS.campaigns.k1.pinnedPages) === '["plan_secret_twist","doc_rules"]' && JSON.stringify(keptS.campaigns.k1.pinnedMaps) === '["m1"]'
        && /        delete camp\.pinnedMaps;\n        delete camp\.pinnedPages;/.test(require('./checkkit').part('netfog.js')) && require('./checkkit').familyCount('net.js', /pinnedPages/) === 1, JSON.stringify(forPs.campaigns.k1).slice(0, 300));   // pinnedPages stands once in net.js and its parts: in the line that strips it
    // 1.5.4 (gencore.js): the seed and settings a dungeon was generated from are kept on its map for the GM alone, to make it again
    {
    const gmG = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Keep', gridType: 'hex', gen: { seed: 'secret-4471-fox', w: 30, h: 20, rooms: 'some', corr: 'winding', doors: 'most' } }, rooms: [], links: [], whiteboard: [{ id: 'f1', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] }, m2: { id: 'm2', type: 'map', meta: { title: 'Plain' }, rooms: [], links: [], whiteboard: [] }, m3: { id: 'm3', type: 'map', rooms: [], links: [], whiteboard: [] } } } } });
    const forPg = SAs(gmG(), 'u_p'), forSg = SAs(gmG()), keptG = gmG(); SAs(keptG, 'u_p');
    const hmG = src.indexOf('function cleanHostMap(m) {'), hmGz = src.indexOf('\n}\n', hmG) + 2, CHM = new Function('window', 'cleanHostWbItem', 'ownCellKeysOf', 'ownTokIdsOf', 'safeColor', '"use strict";\n' + src.slice(hmG, hmGz) + '\nreturn cleanHostMap;')({}, w => w, () => ({}), () => ({}), () => true);
    const fromHost = CHM({ id: 'm1', type: 'map', meta: { title: 'Keep', gridType: 'hex', gen: { seed: 'a-hosts-word', w: 30, h: 20 } }, rooms: [], links: [], whiteboard: [] }), noMeta = CHM({ id: 'm9', type: 'map', whiteboard: [] }), oddMeta = CHM({ id: 'm8', type: 'map', meta: 'x', whiteboard: [] });
    // a map's GM-only meta keys are ONE list, written out in each of the two places that strip them (cleanHostMap, sanitizeItem; the second reading of
    // fold B7): each holds it once, the two are the same list, and with both lines gone nothing else of net.js names a key of it, in any spelling
    const GM_META_RE = /^    if \(m\.meta && typeof m\.meta === 'object'\) \[([^\]\n]*)\]\.forEach\(function\(k\) \{ if \(m\.meta\[k\] !== undefined\) delete m\.meta\[k\]; \}\);[^\n]*$/gm;
    const gmMetaAt = s => Array.from(s.matchAll(new RegExp(GM_META_RE.source, 'gm')), x => x[1]);
    const gmMetaHm = gmMetaAt(fnSrc('function cleanHostMap(m) {', '\n}\n', 'cleanHostMap')), gmMetaSi = gmMetaAt(fnSrc('function sanitizeItem(', '\n}\n', 'sanitizeItem')), gmMetaAll = gmMetaAt(src);
    const netNoList = src.replace(new RegExp(GM_META_RE.source + '\n', 'gm'), ''), gmMetaGone = src.split('\n').length - netNoList.split('\n').length;
    const gmMetaOne = key => gmMetaHm.length === 1 && gmMetaSi.length === 1 && gmMetaAll.length === 2 && gmMetaHm[0] === gmMetaSi[0] && gmMetaHm[0].split(',').map(s => s.trim()).indexOf("'" + key + "'") >= 0 && gmMetaGone === 2
        && !new RegExp('meta\\s*\\.\\s*' + key + '\\b|meta\\s*\\[\\s*[\'"`]' + key + '[\'"`]\\s*\\]|[\'"`]' + key + '[\'"`]').test(netNoList);
    const gmMetaSaid = () => [gmMetaHm, gmMetaSi, gmMetaAll.length, gmMetaGone];
    check('map builder: the seed and settings a dungeon was generated from never leave the host: the join snapshot and the stream window carry the map with its title and its grid and with no gen key, and the seed is nowhere in either; the GM\'s own map keeps them; a map with no such key, and one with no meta at all, is sent as it was; a player\'s app keeps none a host names, and leaves the rest of the map\'s meta as it came; net.js names the key only in those two places, in ONE list written the same in both',
        forPg.campaigns.k1.items.m1.meta.title === 'Keep' && forPg.campaigns.k1.items.m1.meta.gridType === 'hex' && !('gen' in forPg.campaigns.k1.items.m1.meta) && !('gen' in forSg.campaigns.k1.items.m1.meta) && !/secret-4471-fox/.test(JSON.stringify([forPg, forSg]))
        && keptG.campaigns.k1.items.m1.meta.gen.seed === 'secret-4471-fox' && JSON.stringify(forPg.campaigns.k1.items.m2.meta) === '{"title":"Plain"}' && !('meta' in forPg.campaigns.k1.items.m3) && forPg.campaigns.k1.items.m1.whiteboard.length === 1
        && JSON.stringify(fromHost.meta) === '{"title":"Keep","gridType":"hex"}' && !('meta' in noMeta) && oddMeta.meta === 'x'
        && gmMetaOne('gen'), JSON.stringify([forPg.campaigns.k1.items.m1.meta, fromHost.meta, gmMetaSaid(), forPg.campaigns.k1.items.m2, forPg.campaigns.k1.items.m3, noMeta, oddMeta]));
    // 1.5.4 (citycore.js): the seed and settings a city was generated from are held to the same rule
    const gmC = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Port', gridType: 'square', city: { seed: 'secret-9-owl', size: 'town', wall: 'gates', water: 'river', roofs: 'mixed', fields: true }, gen: { seed: 'secret-dungeon', w: 30, h: 20, rooms: 'some', corr: 'winding', doors: 'most' } }, rooms: [], links: [], whiteboard: [{ id: 'f1', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] }, m2: { id: 'm2', type: 'map', meta: { title: 'Plain' }, rooms: [], links: [], whiteboard: [] } } } } });
    const forPc = SAs(gmC(), 'u_p'), forSc = SAs(gmC()), keptC = gmC(); SAs(keptC, 'u_p');
    const fromHostC = CHM({ id: 'm1', type: 'map', meta: { title: 'Port', gridType: 'square', city: { seed: 'a-hosts-word', size: 'city' }, gen: { seed: 'another-word' } }, rooms: [], links: [], whiteboard: [] });
    check('map builder: the seed and settings a city was generated from never leave the host either: the join snapshot and the stream window carry the map with its title and its grid and with no city key, the dungeon\'s gone beside it, and neither seed is anywhere in either; the GM\'s own map keeps them; a player\'s app keeps none a host names and leaves the rest of the map\'s meta as it came; net.js names the key only in those two places, in ONE list written the same in both',
        forPc.campaigns.k1.items.m1.meta.title === 'Port' && forPc.campaigns.k1.items.m1.meta.gridType === 'square' && !('city' in forPc.campaigns.k1.items.m1.meta) && !('city' in forSc.campaigns.k1.items.m1.meta) && !('gen' in forPc.campaigns.k1.items.m1.meta) && !/secret-9-owl|secret-dungeon/.test(JSON.stringify([forPc, forSc]))
        && keptC.campaigns.k1.items.m1.meta.city.seed === 'secret-9-owl' && keptC.campaigns.k1.items.m1.meta.gen.seed === 'secret-dungeon' && JSON.stringify(forPc.campaigns.k1.items.m2.meta) === '{"title":"Plain"}' && forPc.campaigns.k1.items.m1.whiteboard.length === 1
        && JSON.stringify(fromHostC.meta) === '{"title":"Port","gridType":"square"}' && gmMetaOne('city'),
        JSON.stringify([forPc.campaigns.k1.items.m1.meta, forSc.campaigns.k1.items.m1.meta, fromHostC.meta, gmMetaSaid()]));
    const adG = fnSrc('function applyItemDelta(msg) {', '\n}\n', 'applyItemDelta', 'netfog.js') + '\n}\n', campG = { id: 'c1', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Keep' }, whiteboard: [], rooms: [] } } };
    new Function('state', 'net', 'window', 'broadcast', 'cleanHostMap', 'actOver', 'ackIn', 'getActiveCampaign', 'render', 'updateSidebarNav', 'msg', ownKeySrc + adG + '\napplyItemDelta(msg);')({ appState: { campaigns: { c1: campG } } }, { applyingRemote: false }, {}, () => {}, CHM, () => {}, () => 0, () => campG, () => {}, () => {},
        { type: 'itemDelta', campId: 'c1', itemId: 'm1', meta: { title: 'Keep 2', gridType: 'square', gen: { seed: 'by-delta', w: 9999 } }, whiteboard: { set: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }], del: [] } });
    const stubG = new Function(fnSrc('function mapStub(map) {', '\n}\n', 'mapStub', 'netfog.js') + '\n}\nreturn mapStub;')()({ id: 'm1', type: 'map', meta: { title: 'Keep', playerLock: true, parentId: 'm0', sortIndex: 3, gridType: 'hex', gen: { seed: 'secret-4471-fox', w: 30, h: 20 } }, whiteboard: [{ id: 'f1' }] });
    const qhG = new Function(fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\nreturn quickHash;')(), idG = lineOf('function uniqueIds(', 'netfog.js') + '\n' + fnSrc('function itemDelta(itemId, clean) {', '\nfunction applyItemDelta(', 'itemDelta', 'netfog.js');
    const sent1 = new Function(siSrc() + '\nreturn sanitizeItem;')()(gmG().campaigns.k1.items.m1), again = gmG().campaigns.k1.items.m1; again.meta.gen = { seed: 'another-seed', w: 44, h: 55, rooms: 'few', corr: 'straight', doors: 'none' };
    const sent2 = new Function(siSrc() + '\nreturn sanitizeItem;')()(again), onlySeed = new Function('_lastSent', 'quickHash', 'cleanMap', idG + '\nreturn itemDelta("m1", cleanMap);')({ m1: sent1 }, qhG, sent2);
    check('map builder: the seed stays off the wire on the other paths too (the review of the fold): a delta that names it leaves none on a player\'s copy, since the map is cleaned after the delta\'s meta is taken, while the rest of that meta and the delta\'s pieces are kept; the stub of a map that keeps a seed is its name, its lock and its place and nothing else; and a map whose only change is its seed, as after a second Generate or an Undo, gives no delta at all, so nothing is sent again',
        JSON.stringify(campG.items.m1.meta) === '{"title":"Keep 2","gridType":"square"}' && campG.items.m1.whiteboard.length === 1 && JSON.stringify(stubG) === JSON.stringify({ type: 'map', id: 'm1', stub: true, meta: { title: 'Keep', playerLock: true, parentId: 'm0', sortIndex: 3 }, whiteboard: [], rooms: [], links: [], cats: {} })
        && !/gen|secret/.test(JSON.stringify(stubG)) && onlySeed === false && JSON.stringify(sent1) === JSON.stringify(sent2), JSON.stringify([campG.items.m1.meta, stubG.meta, onlySeed]));
    // 1.5.4 (worldcore.js, fold B7): the seed and settings a world was generated from are held to the same rule, on every path a map takes
    const gmW = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Realm', gridType: 'off', world: { seed: 'secret-7-elm', land: 'continent', size: 'large', mountains: 'many', forests: 'some', rivers: 'few', climate: 'cold', towns: 'names' }, city: { seed: 'secret-9-owl', size: 'town', wall: 'gates', water: 'river', roofs: 'mixed', fields: true }, gen: { seed: 'secret-dungeon', w: 30, h: 20, rooms: 'some', corr: 'winding', doors: 'most' } }, rooms: [], links: [], whiteboard: [{ id: 'f1', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] }, m2: { id: 'm2', type: 'map', meta: { title: 'Plain' }, rooms: [], links: [], whiteboard: [] } } } } });
    const forPw = SAs(gmW(), 'u_p'), forSw = SAs(gmW()), keptW = gmW(); SAs(keptW, 'u_p');
    const hostW = v => JSON.stringify(CHM({ id: 'm1', type: 'map', meta: { title: 'Realm', gridType: 'off', world: v }, rooms: [], links: [], whiteboard: [] }).meta), hostWs = [{ seed: 'a-hosts-word', land: 'island' }, 'a-hosts-word', 7, true, null, ['a-hosts-word'], 0, ''].map(hostW);
    const campW = { id: 'c1', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Realm' }, whiteboard: [], rooms: [] } } };
    new Function('state', 'net', 'window', 'broadcast', 'cleanHostMap', 'actOver', 'ackIn', 'getActiveCampaign', 'render', 'updateSidebarNav', 'msg', ownKeySrc + adG + '\napplyItemDelta(msg);')({ appState: { campaigns: { c1: campW } } }, { applyingRemote: false }, {}, () => {}, CHM, () => {}, () => 0, () => campW, () => {}, () => {},
        { type: 'itemDelta', campId: 'c1', itemId: 'm1', meta: { title: 'Realm 2', gridType: 'off', world: { seed: 'by-delta', land: 'islands' } }, whiteboard: { set: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }], del: [] } });
    const stubW = new Function(fnSrc('function mapStub(map) {', '\n}\n', 'mapStub', 'netfog.js') + '\n}\nreturn mapStub;')()({ id: 'm1', type: 'map', meta: { title: 'Realm', playerLock: true, parentId: 'm0', sortIndex: 3, gridType: 'off', world: { seed: 'secret-7-elm', land: 'continent' } }, whiteboard: [{ id: 'f1' }] });
    const sentW1 = new Function(siSrc() + '\nreturn sanitizeItem;')()(gmW().campaigns.k1.items.m1), againW = gmW().campaigns.k1.items.m1; againW.meta.world = { seed: 'another-seed', land: 'islands', size: 'small', mountains: 'none', forests: 'many', rivers: 'none', climate: 'dry', towns: 'none' };
    const sentW2 = new Function(siSrc() + '\nreturn sanitizeItem;')()(againW), onlySeedW = new Function('_lastSent', 'quickHash', 'cleanMap', idG + '\nreturn itemDelta("m1", cleanMap);')({ m1: sentW1 }, qhG, sentW2), srcW = gmW().campaigns.k1.items.m1; new Function(siSrc() + '\nreturn sanitizeItem;')()(srcW);
    check('map builder: the seed and settings a WORLD was generated from never leave the host either (fold B7): the join snapshot and the stream window carry the map with its title and its grid and with no world key, the city\'s and the dungeon\'s gone beside it, and none of the three seeds is anywhere in either; the GM\'s own map keeps all three, and a map handed to the sender is not changed by the send; a map with no such key is sent as it was; a player\'s app keeps none a host names, whatever stands there, a bag of settings, a text, a number, a truth value, nothing, a list, zero or an empty text, and leaves the rest of the map\'s meta as it came; a delta that names it leaves none on a player\'s copy while the rest of that meta and the delta\'s pieces are kept; the stub of a map that keeps a world\'s seed is its name, its lock and its place and nothing else; a map whose only change is its world\'s seed, as after a second Generate or an Undo, gives no delta at all; and net.js names the key only in those two places, in ONE list written the same in both',
        forPw.campaigns.k1.items.m1.meta.title === 'Realm' && forPw.campaigns.k1.items.m1.meta.gridType === 'off' && JSON.stringify(Object.keys(forPw.campaigns.k1.items.m1.meta)) === '["title","gridType"]' && JSON.stringify(Object.keys(forSw.campaigns.k1.items.m1.meta)) === '["title","gridType"]' && !/secret-7-elm|secret-9-owl|secret-dungeon|"world"|"city"|"gen"/.test(JSON.stringify([forPw, forSw]))
        && keptW.campaigns.k1.items.m1.meta.world.seed === 'secret-7-elm' && keptW.campaigns.k1.items.m1.meta.city.seed === 'secret-9-owl' && keptW.campaigns.k1.items.m1.meta.gen.seed === 'secret-dungeon' && srcW.meta.world.seed === 'secret-7-elm' && JSON.stringify(forPw.campaigns.k1.items.m2.meta) === '{"title":"Plain"}' && forPw.campaigns.k1.items.m1.whiteboard.length === 1
        && hostWs.length === 8 && hostWs.every(m => m === '{"title":"Realm","gridType":"off"}') && JSON.stringify(campW.items.m1.meta) === '{"title":"Realm 2","gridType":"off"}' && campW.items.m1.whiteboard.length === 1
        && JSON.stringify(stubW) === JSON.stringify({ type: 'map', id: 'm1', stub: true, meta: { title: 'Realm', playerLock: true, parentId: 'm0', sortIndex: 3 }, whiteboard: [], rooms: [], links: [], cats: {} }) && !/world|secret/.test(JSON.stringify(stubW))
        && !/world|secret/.test(JSON.stringify(sentW1)) && onlySeedW === false && JSON.stringify(sentW1) === JSON.stringify(sentW2)
        && gmMetaOne('world'),
        JSON.stringify([forPw.campaigns.k1.items.m1.meta, forSw.campaigns.k1.items.m1.meta, hostWs, campW.items.m1.meta, stubW.meta, onlySeedW, gmMetaSaid()]));
    const siOne = new Function(siSrc() + '\nreturn sanitizeItem;')(), oneMap = () => ({ id: 'm1', type: 'map', meta: { title: 'One', gen: { seed: 's-gen' }, city: { seed: 's-city' }, world: { seed: 's-world' }, env: { temp: -30 }, envCells: { '1,1': { temp: 45 } }, scenePage: 'p_secret_scene', keep: 'kept' }, rooms: [], links: [], whiteboard: [] });
    const oneSent = siOne(oneMap()), oneHost = CHM(oneMap()), oneGm = oneMap(); siOne(oneGm);
    check('map builder: a map\'s GM-only meta keys are ONE list (the second reading of fold B7): cleanHostMap and sanitizeItem each hold it once, written the same, and it names exactly the dungeon\'s, the city\'s and the world\'s keys; run for real, the host\'s send and a player\'s app each take every key of the list off a map\'s meta and leave a meta key that is no such key as it came, and the send leaves the GM\'s own map as it was; and with the two lines gone nothing else of net.js names a key of the list',
        gmMetaHm.length === 1 && gmMetaSi.length === 1 && gmMetaHm[0] === gmMetaSi[0] && gmMetaHm[0] === "'gen', 'city', 'world', 'env', 'envCells', 'scenePage', 'setups', 'tags', 'fxEffect', 'opensOn'" && gmMetaAll.length === 2 && gmMetaGone === 2 && ['gen', 'city', 'world', 'env', 'envCells', 'scenePage', 'setups', 'tags', 'fxEffect', 'opensOn'].every(gmMetaOne)   /* 1.6.2 (backlog 221): and the view a map opens on (moved on purpose); backlog 31: and a map's set-ups (moved on purpose);  1.6.0: and the map environment's two keys (moved on purpose); 1.6.0: and a map's scene page (backlog 26, moved on purpose) */
        && JSON.stringify(oneSent.meta) === '{"title":"One","keep":"kept"}' && JSON.stringify(oneHost.meta) === '{"title":"One","keep":"kept"}' && JSON.stringify(oneGm.meta) === JSON.stringify(oneMap().meta), JSON.stringify([gmMetaSaid(), oneSent.meta, oneHost.meta]));
    }
    // The camera is each screen's own (the review of backlog 26, 2026-10-16, finding 1): Find on the map from a fight, and the Characters
    // section's Find, set the GM's remembered camera exactly on a hidden token, and the camera rode every map to every player and the stream
    // window. The real sanitizeItem, sanitizeAppState, itemDelta, cleanHostMap, applyItem, applyItemDelta and applyStage, with the helpers
    {
        const camSrc = fnSrc('// The camera (the review of backlog 26', '\nfunction cleanHostMap(m) {', 'the camera helpers') + '\n';
        const chmSrc = fnSrc('function cleanHostMap(m) {', '\n}\n', 'cleanHostMap') + '\n}\n';
        const CM = new Function('window', 'cleanHostWbItem', 'ownCellKeysOf', 'ownTokIdsOf', 'safeColor', '"use strict";\n' + camSrc + chmSrc + '\nreturn { cleanHostMap: cleanHostMap, camOf: camOf, camHold: camHold, camLand: camLand, camMine: camMine, camGiven: camGiven, CAM_KEYS: CAM_KEYS };')({}, w => w, () => ({}), () => ({}), () => true);
        const siC = new Function(siSrc() + '\nreturn sanitizeItem;')(), JC = JSON.stringify;
        const AMB = { id: 'amb', type: 'image', isChar: true, hidden: true, x: 12345, y: 6789, w: 60, h: 52 }, FOUND = { lastWbX: 12375, lastWbY: 6815, lastWbZoom: 1.5 };   // the GM found the hidden ambusher: the view's middle on its center
        const camMap = cam => ({ id: 'm1', type: 'map', meta: Object.assign({ title: 'Cave', gridType: 'hex', lastX: 222, lastY: 333, lastZoom: 0.5 }, cam || FOUND), rooms: [], links: [], whiteboard: [{ id: 'wall', type: 'rect', x: 0, y: 0, w: 50, h: 50 }, JSON.parse(JC(AMB))] });
        const camRe = /"last(Wb)?(X|Y|Zoom)"|12375|6815/;
        // the host: a whole map, the join snapshot and the stream window, and a delta
        const gmM = camMap(), sentC = siC(gmM), snapC = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', items: { m1: camMap() } } } });
        const forPc2 = SAs(snapC(), 'u_p'), forSc2 = SAs(snapC());
        const qhC = new Function(fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\nreturn quickHash;')(), idC = lineOf('function uniqueIds(', 'netfog.js') + '\n' + fnSrc('function itemDelta(itemId, clean) {', '\nfunction applyItemDelta(', 'itemDelta', 'netfog.js');
        const camOnly = new Function('_lastSent', 'quickHash', 'cleanMap', idC + '\nreturn itemDelta("m1", cleanMap);')({ m1: siC(camMap({ lastWbX: 15000, lastWbY: 15000, lastWbZoom: 1 })) }, qhC, sentC);
        const delKeys = ((/\n    if \(m\.meta && typeof m\.meta === 'object'\) \{((?: delete m\.meta\.[A-Za-z]+;)+) \}   \/\/ the camera/.exec(fnSrc('function sanitizeItem(', '\n}\n', 'sanitizeItem')) || [])[1] || '').match(/[A-Za-z]+(?=;)/g) || [];
        check('the camera never leaves the host (the review of Find on the map from a fight): the GM\'s remembered view of a map, which Find puts exactly on a hidden token, is on no whole map, no join snapshot and no stream window\'s copy, and its numbers are nowhere in them, for the play map and the data map alike; the GM\'s own map keeps it; a map whose only change is the camera gives no delta, so a pan or a find sends nothing at all; sanitizeItem deletes exactly the six keys of the one list',
            JC(Object.keys(sentC.meta)) === '["title","gridType"]' && !camRe.test(JC(sentC)) && sentC.whiteboard.length === 1 && JC(gmM.meta) === JC(camMap().meta)
            && !camRe.test(JC(forPc2)) && !camRe.test(JC(forSc2)) && forPc2.campaigns.k1.items.m1.meta.title === 'Cave' && forSc2.campaigns.k1.items.m1.meta.gridType === 'hex'
            && camOnly === false && JC(delKeys) === JC(CM.CAM_KEYS) && JC(CM.CAM_KEYS) === JC(['lastX', 'lastY', 'lastZoom', 'lastWbX', 'lastWbY', 'lastWbZoom']),
            JC([sentC.meta, forPc2.campaigns.k1.items.m1.meta, forSc2.campaigns.k1.items.m1.meta, camOnly && camOnly.meta, delKeys]));
        // a player's app: none a host names, its own kept across a whole map and a delta
        const hostCam = Object.assign({ lastX: 9, lastY: 8, lastZoom: 3 }, FOUND), fromHostCm = CM.cleanHostMap({ id: 'm1', type: 'map', meta: Object.assign({ title: 'Cave' }, hostCam), whiteboard: [] });
        const OWN = { lastWbX: 100, lastWbY: 200, lastWbZoom: 2 };
        const stC = () => ({ appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', meta: Object.assign({ title: 'Cave', lastY: 'x' }, OWN), whiteboard: [], rooms: [] } } } } } });
        const aiC = fnSrc('function applyItem(msg) {', '\n}\n', 'applyItem', 'netfog.js') + '\n}\n', adC = fnSrc('function applyItemDelta(msg) {', '\n}\n', 'applyItemDelta', 'netfog.js') + '\n}\n';
        const runAi = (st, msg) => new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanHostMap', 'camOf', 'camHold', 'msg', ownKeySrc + aiC + '\napplyItem(msg);')({ applyingRemote: false }, st, { wpFog: { invalidateVision() {}, redraw() {} } }, () => st.appState.campaigns.k, () => {}, () => {}, CM.cleanHostMap, CM.camOf, CM.camHold, msg);
        const runAd = (st, msg) => new Function('state', 'net', 'window', 'broadcast', 'cleanHostMap', 'actOver', 'ackIn', 'getActiveCampaign', 'render', 'updateSidebarNav', 'camOf', 'camHold', 'msg', ownKeySrc + adC + '\napplyItemDelta(msg);')(st, { applyingRemote: false }, {}, () => {}, CM.cleanHostMap, () => {}, () => 0, () => st.appState.campaigns.k, () => {}, () => {}, CM.camOf, CM.camHold, msg);
        const camOfM = m => { const o = {}; ['lastX', 'lastY', 'lastZoom', 'lastWbX', 'lastWbY', 'lastWbZoom'].forEach(k => { if (m && m.meta && k in m.meta) o[k] = m.meta[k]; }); return o; };
        const sA = stC(); runAi(sA, { type: 'item', campId: 'k', itemId: 'm1', item: { id: 'm1', type: 'map', meta: Object.assign({ title: 'Cave 2' }, hostCam), whiteboard: [] } });
        runAi(sA, { type: 'item', campId: 'k', itemId: 'm2', item: { id: 'm2', type: 'map', meta: Object.assign({ title: 'Yard' }, hostCam), whiteboard: [] } });
        const sD = stC(); runAd(sD, { type: 'itemDelta', campId: 'k', itemId: 'm1', meta: Object.assign({ title: 'Cave 3' }, hostCam), whiteboard: { set: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }], del: [] } });
        const sE = stC(); runAd(sE, { type: 'itemDelta', campId: 'k', itemId: 'm1', whiteboard: { set: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }], del: [] } });
        const mA = sA.appState.campaigns.k.items.m1, mA2 = sA.appState.campaigns.k.items.m2, mD = sD.appState.campaigns.k.items.m1, mE = sE.appState.campaigns.k.items.m1;
        const camOfOdd = [CM.camOf({ meta: { lastX: 'x', lastY: NaN, lastZoom: Infinity, lastWbX: 5, lastWbY: -7.5, lastWbZoom: null, title: 3 } }), CM.camOf(null), CM.camOf({ meta: 'x' }), CM.camOf(Object.assign(Object.create({ lastWbX: 1 }), { meta: Object.create({ lastWbY: 2 }) }))];
        const camHoldOdd = [CM.camHold({ meta: { title: 'T', lastWbX: 1, lastX: 2 } }, { lastWbX: 'x', lastWbY: NaN, lastZoom: 4, other: 9 }).meta, CM.camHold({ meta: { lastWbZoom: 3 } }, null).meta, CM.camHold(null, { lastWbX: 1 }), JC(CM.camHold({ meta: 'x' }, { lastWbX: 1 }))];
        check('the camera on a player\'s app: a map from a host, older or hostile, keeps none of the camera it names; a whole map and a delta with or without meta keep the camera this app had for that map, a number alone, and none it did not have; the rest of the meta and the pieces are taken as they come',
            JC(camOfOdd) === JC([{ lastWbX: 5, lastWbY: -7.5 }, {}, {}, {}]) && JC(camHoldOdd) === JC([{ title: 'T', lastZoom: 4 }, {}, null, '{"meta":"x"}'])
            && JC(fromHostCm.meta) === '{"title":"Cave"}'
            && mA.meta.title === 'Cave 2' && JC(camOfM(mA)) === JC(OWN) && JC(camOfM(mA2)) === '{}' && mA2.meta.title === 'Yard'
            && mD.meta.title === 'Cave 3' && JC(camOfM(mD)) === JC(OWN) && mD.whiteboard.length === 1 && mE.meta.title === 'Cave' && JC(camOfM(mE)) === JC(OWN) && mE.whiteboard.length === 1,
            JC([fromHostCm.meta, mA.meta, mA2.meta, mD.meta, mE.meta]));
        // where a map opens on a player's app and in the stream window: the real applyStage with camLand
        const asC = fnSrc('function applyStage(stage) {', '\n}\n', 'applyStage', 'netfog.js') + '\n}\n';
        const TOKC = () => [{ id: 't_q', isChar: true, ownerId: 'u_q', x: 300, y: 400, w: 60, h: 52 }, { id: 't_w', waiting: 1, ownerId: 'u_p', x: 50, y: 60, w: 60, h: 52 }, { id: 't_p', isChar: true, ownerId: 'u_p', x: 1000, y: 2000, w: 120, h: 100 }, { id: 't_n', isChar: true, x: 7, y: 7 }];
        const stage = (o) => {
            const map = { id: 'm1', type: 'map', meta: Object.assign({ title: 'Cave' }, o.cam || {}), rooms: o.room ? [{ id: 'r1' }] : [], whiteboard: o.toks || TOKC() };
            const st = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'm0', items: { m1: map } } } }, viewMode: 'data' }, restored = [];
            const net = { role: o.role, myId: o.myId === undefined ? 'u_p' : o.myId, _snapshotting: true, applyingRemote: false };
            new Function('net', 'state', 'window', 'landingPoint', 'updateCampaignSelect', 'updateSidebarNav', 'render', 'camLand', 'stage', ownKeySrc + asC + '\napplyStage(stage);')(
                net, st, { wpStream: o.stream, appRestoreCamera: () => restored.push(JC(camOfM(map))) }, () => ({ wbX: 500, wbY: 600 }), () => {}, () => {}, () => {}, o.noLand ? undefined : CM.camLand, { campId: 'k', itemId: 'm1', landRoomId: o.room ? 'r1' : undefined });
            return [map.meta.lastWbX === undefined ? null : map.meta.lastWbX, map.meta.lastWbY === undefined ? null : map.meta.lastWbY, restored.length, st.appState.campaigns.k.activeItemId];
        };
        const lands = [stage({ role: 'client' }), stage({ role: 'client', toks: TOKC().filter(w => w.id !== 't_p') }), stage({ role: 'client', cam: OWN }), stage({ role: 'client', room: true }), stage({ stream: true }),
            stage({ role: 'host' }), stage({ role: 'client', toks: TOKC().filter(w => w.ownerId !== 'u_p') }), stage({ role: 'client', toks: TOKC().map(w => Object.assign(w, w.ownerId === 'u_p' ? { hidden: true } : {})) }),
            stage({ role: 'client', myId: '' }), stage({ role: 'client', cam: { lastWbX: 'x', lastWbY: 5 } }), stage({ role: 'client', noLand: true })];
        const gMap = (extra) => ({ type: 'map', meta: { lastWbX: 9, lastWbY: 9, lastWbZoom: 2 }, whiteboard: [{ id: 'npc', isChar: true, ownerId: '', x: 1, y: 1 }, Object.assign({ id: 'mine', isChar: true, ownerId: 'u_p', x: 100, y: 200, w: 60, h: 52 }, extra || {})] });
        const gOk = (() => { const m = gMap(), p = CM.camGiven(m, 'u_p', []); return !!p && p.x === 130 && p.y === 226 && m.meta.lastWbX === 130 && m.meta.lastWbY === 226 && m.meta.lastWbZoom === 2; })();
        const gKeep = (() => { const m = gMap(); return CM.camGiven(m, 'u_p', ['old']) === null && CM.camGiven(m, 'u_p', null) === null && CM.camGiven(gMap({ hidden: true }), 'u_p', []) === null && CM.camGiven(gMap({ isChar: false }), 'u_p', []) === null && CM.camGiven(gMap({ x: 'a' }), 'u_p', []) === null && CM.camGiven(gMap(), '', []) === null && m.meta.lastWbX === 9; })();
        const gMine = JC(CM.camMine(gMap(), 'u_p')) === '["mine"]' && JC(CM.camMine(gMap({ hidden: true }), 'u_p')) === '[]' && JC(CM.camMine(null, 'u_p')) === '[]' && JC(CM.camMine({ type: 'map', whiteboard: 'x' }, 'u_p')) === '[]';
        check('a character token given to a player on the map on screen, where they held none, is where their view goes (camGiven); a token they already held, a hidden one or none leaves it', gOk && gKeep && gMine && (src.match(/camGiven\(/g) || []).length === 3 && require('./checkkit').part('netfog.js').includes('var mineWas = camWas && typeof camMine === \'function\' ? camMine(camp.items[msg.itemId], net.myId) : null;') && require('./checkkit').part('netfog.js').includes('var mineWas = camWas && typeof camMine === \'function\' ? camMine(it, net.myId) : null;'), JC([gOk, gKeep, gMine]));
        const landFn = CM.camLand, landOdd = [landFn(null, 'u_p'), landFn({ type: 'map', whiteboard: 'x' }, 'u_p'), landFn({ type: 'planner', whiteboard: TOKC() }, 'u_p'), landFn({ type: 'map', whiteboard: [{ isChar: true, ownerId: 'u_p', x: '10', y: 5 }] }, 'u_p')];
        check('the camera when a map opens (applyStage, run for real): on a player\'s app a map it holds no view of opens on the player\'s own character token there, else on their waiting token, else at the map\'s home as before; a view of its own and a landing room\'s point are kept; the stream window opens on a player\'s token; the GM\'s own screen is never moved this way; another player\'s token, a token with no owner, a hidden one, a player with no id and a place that is no number are no landing',
            JC(lands) === JC([[1060, 2050, 1, 'm1'], [80, 86, 1, 'm1'], [100, 200, 1, 'm1'], [500, 600, 1, 'm1'], [330, 426, 1, 'm1'], [null, null, 1, 'm1'], [null, null, 1, 'm1'], [null, null, 1, 'm1'], [null, null, 1, 'm1'], [1060, 2050, 1, 'm1'], [null, null, 1, 'm1']])
            && JC(landOdd) === JC([null, null, null, null]),
            JC([lands, landOdd]));
        const FIX_CAM = "- A player's screen no longer opens where you last looked at a map.\n  A find or a pan of yours stays on your screen, and a map a player\n  arrives on opens on their own token there.\n";
        const fixUnder = t => { const a = t.indexOf('\nFixes\n', t.indexOf('\nWAYPOINT 1.5.4')), z = t.indexOf('\nWAYPOINT 1.5.3', a), at = t.indexOf(FIX_CAM); return a > 0 && z > a && at > a && at < z && t.slice(a + 1, at).indexOf('\n\n') < 0 && t.split(FIX_CAM).length === 2; };
        check('the camera said: both release notes carry the line under 1.5.4\'s Fixes, and Help still tells the GM that a find moves no one else\'s screen, which is now so',
            ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fixUnder(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n')))
            && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').includes('Your screen moves to it and marks it for a moment. Nobody else&rsquo;s screen moves.'));
    }
    const wbP = forPs.campaigns.k1.items.m1.whiteboard, wbS = forSs.campaigns.k1.items.m1.whiteboard, wbK = keptS.campaigns.k1.items.m1.whiteboard;
    check('backlog 125 a pin never leaves the host: a piece that opens a page reaches a player and the stream window as the piece alone, without its page key, whether it names a planner or a handbook page, on a picture, a shape or a token; the GM\'s own map keeps every link; the one rule a piece is sent by deletes the key, and a player\'s app deletes it again',
        wbP.length === 3 && wbS.length === 3 && wbP.concat(wbS).every(w => !('page' in w)) && JSON.stringify(wbP.map(w => w.id)) === '["pin1","pin2","tokN"]' && JSON.stringify(wbK.map(w => w.page)) === '["plan_secret_twist","doc_rules","plan_secret_twist"]'
        && fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem').includes('    if (w.page !== undefined) delete w.page;') && src.includes("if (w.page !== undefined) delete w.page; if (w.fogHand !== undefined && w.fogHand !== 'hide' && w.fogHand !== 'show') delete w.fogHand;")
        && !/\.page\b/.test(fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js')), JSON.stringify([wbP, wbK.map(w => w.page)]).slice(0, 300));
    check('1.6.0, backlog 32: the part of a page a pin names (pageAt) never leaves the host either: the join snapshot and the stream window carry the piece with neither key, and the part\'s id is nowhere in either; the GM\'s own map keeps it; the one rule a piece is sent by deletes it beside the page, a player\'s app deletes it again, and a player\'s own drawing never names it. Backlog 26: a map\'s scene page is in neither copy and the GM\'s map keeps it',
        wbP.concat(wbS).every(w => !('pageAt' in w)) && !/sec_secret_twist/.test(JSON.stringify([forPs, forSs])) && wbK[0].pageAt === 'sec_secret_twist'
        && !('scenePage' in forPs.campaigns.k1.items.m1.meta) && !('scenePage' in forSs.campaigns.k1.items.m1.meta) && keptS.campaigns.k1.items.m1.meta.scenePage === 'plan_secret_twist'
        && fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem').includes("    if (w.page !== undefined) delete w.page;   // 1.5.4 (pageshelf.js): a pin, the page a piece opens, is the GM's own link and names a planner: never on the wire\n    if (w.pageAt !== undefined) delete w.pageAt;")
        && src.includes('if (w.pageAt !== undefined) delete w.pageAt; if (w.page !== undefined) delete w.page; if (w.fogHand') && !/pageAt/.test(fnSrc('function playerStroke(', '\n}\n', 'playerStroke', 'netfog.js')), JSON.stringify([wbP, wbS]).slice(0, 300));
}
// hidden pieces (owner, 2026-10-01: players see nothing where something is hidden): the join snapshot and the stream window, by the real sanitizeAppState
{
    const saSrcH = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const SAh = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrcH + '\nreturn sanitizeAppState;')(H.own, {}, () => ({}), () => ({}), v => v, (it) => it, (it) => it);
    const gmH = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', rooms: [], links: [], whiteboard: [{ id: 'seen', type: 'rect', x: 1, y: 2, w: 3, h: 4 },
        { id: 'lurker', type: 'image', isChar: true, charName: 'Lurker', hidden: true, x: 777, y: 888, w: 60, h: 52 }, { id: 'trapdoor', type: 'rect', hidden: true, trap: true, targetMapId: 'm2', x: 555, y: 666, w: 50, h: 50 }] } } } } });
    const forPh = SAh(gmH(), 'u_p'), forSh = SAh(gmH()), keptH = gmH(); SAh(keptH, 'u_p');
    check('hidden pieces: the join snapshot and the stream window hold nothing of a hidden token or a hidden trap tile — no id, no box, no place, no mark that something is hidden; the GM\'s own campaign keeps both',
        [forPh, forSh].every(s => JSON.stringify(s.campaigns.k1.items.m1.whiteboard.map(w => w.id)) === '["seen"]' && !/lurker|Lurker|trapdoor|777|888|555|666|"hidden"|"trap"/.test(JSON.stringify(s)))
        && keptH.campaigns.k1.items.m1.whiteboard.length === 3 && keptH.campaigns.k1.items.m1.whiteboard[1].hidden === true, JSON.stringify(forPh.campaigns.k1.items.m1.whiteboard));
}
// R2 #14 (the owner's ruling of 2026-10-01: the stream window "should be a combined view of the players, each of them being represented from a
// 3rd party perspective"): the stream window's copy of a fogged map is the PARTY VIEW, by the real sanitizeAppState, fogPartyCopy, fog.js's vision
// half and fogcore — the creatures no player's own token sees dropped, every player's token kept, and the cells the players' tokens see together
// riding on the copy (fogParty) for the window's fog to draw; never the GM's whole map, never one player's own view, never an NPC's eyes
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCp = await import(url('fogcore.js'));
    const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const fogA = fogT.indexOf('function core() {'), fogB = fogT.indexOf('/* ---------- the overlay');
    const fogSrc = fogT.slice(fogA, fogB);
    const saSrcP = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + between('// [netcheck:foglit-start]', '// [netcheck:foglit-end]', 'foglit', 'netfog.js') + '\n' + lineOf('function mapFogged(') + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const mkSA = (feats, noFog, stance) => {   // stance: the host's stance module, where a case reads the ground
        const win = { wpFogCore: FCp, wpVtt: { on: k => feats[k] !== false, campaignOn: k => feats[k] !== false, mode: () => 'stream' } }; if (stance) win.wpStance = stance;
        let fog = null;
        try { fog = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogSrc + '\nreturn { fogDropIds: fogDropIds, fogLitFor: fogLitFor, fogMarksFor: fogMarksFor, fogOffFor: fogOffFor, sightSigFor: sightSigFor, invalidateSeen: invalidateSeen, PARTY: typeof PARTY === "string" ? PARTY : null, fogPartyCells: typeof fogPartyCells === "function" ? fogPartyCells : null };')(win, { getElementById: () => null }, () => null, () => null, { appState: {} }); } catch (e) { fog = { err: e.message }; }
        if (!noFog) win.wpFog = fog;
        const SA = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', "'use strict';\n" + saSrcP + '\nreturn sanitizeAppState;')(H.own, win, () => ({}), () => ({}), v => v);
        return { SA, fog };
    };
    const T = (id, owner, c, r, more) => Object.assign({ id, type: 'image', isChar: true, charName: id, x: c * 50, y: r * 50, w: 50, h: 50, rot: 0, front: 0 }, owner ? { ownerId: owner } : {}, more || {});
    const M = (id, fog, wb, meta) => ({ id, type: 'map', meta: Object.assign({ title: id, gridType: 'square', cellValue: 5, cellUnit: 'ft', updated: 1 }, meta || {}), rooms: [], links: [], fog: Object.assign({ on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } }, fog || {}), whiteboard: wb });
    // mF: 5 ft squares, Sight 30 ft = 6 cells, the map dark. Ana's token at (2,2) sees the goblin at (5,2); a wall down column 7 hides the ogre at (8,2) though it
    // is in reach; the orc at (20,2) is out of reach and its own eyes see the second orc at (22,2) — the GM's '*' union would keep both; Bo's token at (30,30)
    // sees the second goblin; Cy's waiting token at (40,40) is no viewer (the campaign gives a waiting token no sight) but is a player's; a crate is no creature
    const mkState = () => ({ activeCampaignId: 'k', campaigns: { k: { id: 'k', name: 'K', activeItemId: 'mF', fog: { fields: { sightUnit: 'ft' }, defaults: { sight: 30 } }, items: {
        mF: M('mF', null, [T('tA', 'u_a', 2, 2), T('gob', '', 5, 2), { id: 'wall', type: 'rect', x: 350, y: 0, w: 50, h: 600, blocksSight: true }, T('ogre', '', 8, 2), T('orc', '', 20, 2), T('orc2', '', 22, 2), T('tB', 'u_b', 30, 30), T('gob2', '', 31, 30), { id: 'crate', type: 'rect', x: 1000, y: 1000, w: 50, h: 50 }, T('lurk', '', 3, 3, { hidden: true }), { id: 'wt', type: 'image', waiting: 1, ownerId: 'u_c', x: 2000, y: 2000, w: 50, h: 50 }]),
        mU: M('mU', { on: false }, [T('tA9', 'u_a', 2, 2), T('orc5', '', 15, 2)]),
        mR: M('mR', { mode: 'reveal' }, [T('tA5', 'u_a', 2, 2), T('orcR', '', 15, 2)]),
        mV: M('mV', { mode: 'cover' }, [T('tA6', 'u_a', 2, 2), T('orcV', '', 15, 2), { id: 'wtV', type: 'image', waiting: 1, ownerId: 'u_b', x: 800, y: 800, w: 50, h: 50 }]),
        mG: M('mG', null, [T('tA7', 'u_a', 2, 2), T('orcG', '', 15, 2)], { gridType: 'off' }) } } } });
    const body = () => {
    const ids = m => (m && m.whiteboard ? m.whiteboard.map(w => w.id).join('+') : '-');
    const cellsOf = m => (m && m.fogParty && Array.isArray(m.fogParty.list) ? m.fogParty.list.map(e => e.c + ',' + e.r + ':' + e.t).sort() : null);
    const { SA, fog } = mkSA({ fog: true, lighting: true });
    const st = mkState(), stream = SA(st), sm = stream.campaigns.k.items, sF = sm.mF;
    const party = cellsOf(sF) || [], has = k => party.some(x => x.startsWith(k + ':'));
    const gotStream = { mF: ids(sF), mU: ids(sm.mU), mR: ids(sm.mR), mV: ids(sm.mV), mG: ids(sm.mG), pF: !!sF.fogParty, pU: 'fogParty' in sm.mU, pR: j(sm.mR.fogParty), pV: j(sm.mV.fogParty), pG: 'fogParty' in sm.mG, n: party.length, tiers: party.every(x => /:2$/.test(x)),
        seen: [has('2,2'), has('5,2'), has('30,30'), has('31,30')], unseen: [has('8,2'), has('20,2'), has('22,2'), has('40,40')], gmKept: st.campaigns.k.items.mF.whiteboard.length, gmParty: 'fogParty' in st.campaigns.k.items.mF };
    check('R2 #14 the stream window\'s copy (the real sanitizeAppState with no recipient, fogPartyCopy, fog.js and fogcore) is the party view: on a fogged map the creatures none of the players\' own tokens sees are gone — one out of reach, one behind a wall though in reach, one only an NPC\'s eyes see — and the ones Ana\'s or Bo\'s token sees stay, every player\'s token stays (Cy\'s waiting one too), a crate stays, a hidden one is gone as ever; the cells the players\' tokens see together ride on the copy (fogParty, each cell with its tier) — their own cells and the goblins\' among them, never the ogre\'s, the orcs\' or the waiting token\'s; a map with fog off, or gridless, is whole with no fogParty; Reveal all says all; Cover all keeps the players\' tokens alone and says no cell is seen; the GM\'s own campaign is left as it was',
        !fog.err && fog.PARTY === '*players' && j(gotStream) === j({ mF: 'tA+gob+wall+tB+gob2+crate+wt', mU: 'tA9+orc5', mR: 'tA5+orcR', mV: 'tA6+wtV', mG: 'tA7+orcG', pF: true, pU: false, pR: j({ all: true }), pV: j({ list: [] }), pG: false, n: party.length, tiers: true,
            seen: [true, true, true, true], unseen: [false, false, false, false], gmKept: 11, gmParty: false }) && party.length > 100 && party.length < 400, j([fog.err, fog.PARTY, gotStream]));
    // a player's copy as before (fogCopyFor): their own sight alone, and never a word of the party's cells; the fog feature off, or no fog module at all
    const forA = SA(mkState(), 'u_a').campaigns.k.items, offSA = mkSA({ fog: false, lighting: true }).SA(mkState()).campaigns.k.items, none = mkSA({ fog: true, lighting: true }, true).SA(mkState()).campaigns.k.items;
    const gotA = { mF: ids(forA.mF), mV: ids(forA.mV), party: /fogParty/.test(j(forA)) }, gotOff = { mF: ids(offSA.mF), party: /fogParty/.test(j(offSA)) }, gotNone = { mF: ids(none.mF), mU: ids(none.mU), mV: ids(none.mV), pF: j(none.mF.fogParty), pU: 'fogParty' in none.mU };
    check('R2 #14 a player\'s own copy is as it was — Ana\'s keeps what her tokens see (Bo\'s token, his goblin and Cy\'s waiting token gone) and carries no fogParty on any map; with the fog feature off the stream window is sent every map whole and no fogParty; with no fog module at all the stream copy fails closed — every creature that is no player\'s is gone from a fogged map and no cell is said seen, an unfogged map whole',
        j(gotA) === j({ mF: 'tA+gob+wall+crate', mV: 'tA6', party: false }) && j(gotOff) === j({ mF: 'tA+gob+wall+ogre+orc+orc2+tB+gob2+crate+wt', party: false }) && j(gotNone) === j({ mF: 'tA+wall+tB+crate+wt', mU: 'tA9+orc5', mV: 'tA6+wtV', pF: j({ list: [] }), pU: false }), j([gotA, gotOff, gotNone]));
    // map builder (the second reading of fold B7): the seed and settings a generated map keeps are on no copy of a fogged map: not on a player's own copy
    // (fogCopyFor, which is handed the host's own map beside the clean one) and not on the stream window's party copy (fogPartyCopy)
    const seededSt = () => { const s = mkState(), m = s.campaigns.k.items.mF; m.meta.gen = { seed: 'sec-gen-1', w: 30, h: 20 }; m.meta.city = { seed: 'sec-city-2', size: 'town' }; m.meta.world = { seed: 'sec-world-3', land: 'island' }; return s; };
    const sdA = SA(seededSt(), 'u_a').campaigns.k.items.mF, sdS = SA(seededSt()).campaigns.k.items.mF, sdG = seededSt(); SA(sdG, 'u_a'); SA(sdG);
    const sdKeys = m => Object.keys(m.meta || {}).join(), sdNone = m => !/sec-gen-1|sec-city-2|sec-world-3|"gen"|"city"|"world"/.test(j(m)), sdGm = sdG.campaigns.k.items.mF.meta;
    check('map builder: a fogged map\'s copies keep no seed (the second reading of fold B7; the real sanitizeAppState with the real fogCopyFor and fogPartyCopy, fog.js and fogcore): a player\'s own copy, made for her from the host\'s own map with a creature she cannot see dropped, and the stream window\'s party copy, which carries the cells the players see, each hold the map\'s meta as the plain map has it, with no gen, city or world key and none of the three seeds anywhere; the GM\'s own map keeps all three',
        ids(sdA) === 'tA+gob+wall+crate' && ids(sdS) === 'tA+gob+wall+tB+gob2+crate+wt' && !!sdS.fogParty && Array.isArray(sdS.fogParty.list) && sdS.fogParty.list.length > 100 && sdKeys(sdA) === 'title,gridType,cellValue,cellUnit,updated' && sdKeys(sdS) === sdKeys(sdA) && sdNone(sdA) && sdNone(sdS)
        && sdGm.gen.seed === 'sec-gen-1' && sdGm.city.seed === 'sec-city-2' && sdGm.world.seed === 'sec-world-3', j([ids(sdA), ids(sdS), sdA.meta, sdS.meta, !!sdS.fogParty]));
    // a hidden ground piece counts for nothing the stream window is sent either (the party's view): the real tokenElevation as the host's stance module, the
    // true 3D sightline, an orc on a 3-yard ledge behind a 1-yard low wall, the ledge hidden and then shown
    const wbS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const stS = (() => { try { return new Function('window', 'stanceOn', 'fmtElev', 'lenUnit', '"use strict";\n' + wbS.slice(wbS.indexOf('// [fogcheck:ground-start]'), wbS.indexOf('// [fogcheck:ground-end]')) + '\nreturn { tokenElevation: tokenElevation };')({ wpFogCore: FCp }, () => true, String, () => 'yd'); } catch (e) { return null; } })();
    const hgState = hid => ({ activeCampaignId: 'k', campaigns: { k: { id: 'k', name: 'K', activeItemId: 'mH', system: { combat: { height: { line3d: true } } }, fog: { fields: { sightUnit: 'ft' }, defaults: { sight: 60 } }, items: {
        mH: M('mH', null, [T('tA', 'u_a', 2, 2), T('orcH', '', 6, 2), { id: 'low', type: 'rect', x: 200, y: 100, w: 50, h: 50, blocksSight: true, height: 1 }, Object.assign({ id: 'ledge', type: 'rect', x: 300, y: 100, w: 50, h: 50, ground: 3 }, hid ? { hidden: true } : {})]) } } } });
    const hgStream = hid => { const m = mkSA({ fog: true, lighting: true }, false, stS).SA(hgState(hid)).campaigns.k.items.mH; return [ids(m), (cellsOf(m) || []).some(x => x.startsWith('6,2:')), /ground/.test(j(m))]; };
    const hgS = { hid: hgStream(true), shown: hgStream(false) };
    check('a hidden ground piece counts for nothing the stream window is sent (the real sanitizeAppState with no recipient, fogPartyCopy, fog.js and the real tokenElevation): under the true 3D sightline a creature on a hidden 3-yard ledge behind a low wall is gone from the party\'s copy, its cell not among the cells the players\' tokens see, the ledge and its ground nowhere on the copy; on the same ledge shown the creature and its cell are there',
        !!stS && j(hgS) === j({ hid: ['tA+low', false, false], shown: ['tA+orcH+low+ledge', true, true] }), j(hgS));
    const sj = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'stream.js'), 'utf8').replace(/\r\n/g, '\n'), ioj = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
    check('R2 #14 wired: the stream window alone calls sanitizeAppState with no recipient (stream.js each tick, io.js at its load), and sanitizeAppState hands a map of the hosted campaign to fogPartyCopy exactly there, to fogCopyFor for a player; fogPartyCopy is published to the window nowhere (never a message)',
        /var clean = net\.sanitizeAppState\(data\);/.test(sj) && /if \(window\.wpStream && window\.wpNet && window\.wpNet\.sanitizeAppState\) state\.appState = window\.wpNet\.sanitizeAppState\(state\.appState\);/.test(ioj)
        && /if \(it\.type === 'map' && recipientId && camp\.id === c\.activeCampaignId\) it = fogCopyFor\(it, \(s\.campaigns && s\.campaigns\[camp\.id\]\) \|\| camp, orig, recipientId\);[^\n]*\n\s*else if \(it\.type === 'map' && !recipientId && camp\.id === c\.activeCampaignId\) it = fogPartyCopy\(it, \(s\.campaigns && s\.campaigns\[camp\.id\]\) \|\| camp, orig\);/.test(require('./checkkit').part('netfog.js'))
        && require('./checkkit').familyCount('net.js', /fogPartyCopy\(/g) === 2);
    };
    try { body(); } catch (e) { check('R2 #14 the stream window\'s party view (the case ran to its end)', false, e.message); }
})());
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
    const trSrc = fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel');
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
// targeting (the owner's ruling of 2026-10-01): the host's target branch — the pointer as before, the offer to start combat for one of the GM's
// characters once per character per session, none with the campaign's switch off (and the offer still owed once it is on again), none for a
// hidden token, a player's, no character, a map with a fight or no map; the offer answered by its buttons alone (noEnter)
{
    const taSrc = between('// [netcheck:targetask-start]', '// [netcheck:targetask-end]', 'targetask');
    const runTa = (msg, o) => { o = o || {}; const out = { applied: [], bcast: 0, asks: [], opened: [], threw: '' }, asked = o.asked || {};
        const camp = { id: 'k', turnRules: o.rules === undefined ? {} : o.rules, items: { m1: { id: 'm1', type: 'map', meta: { title: 'Keep' }, whiteboard: [{ id: 'orc', isChar: true, charName: 'Orc' }, { id: 'ghost', isChar: true, charName: 'Ghost', hidden: true }, { id: 'pc', isChar: true, charName: 'Bo', ownerId: 'u_b' }, { id: 'box', type: 'rect' }, null] }, d1: { id: 'd1', type: 'doc', whiteboard: [{ id: 'orc', isChar: true }] } } };
        const net = { role: 'host', roster: { pA: { id: 'u_a', name: 'Ana' }, pT: { id: 'tk:orc', name: 'Mal' }, pU: { id: 'u.tk:orc', name: 'Una' } }, combats: o.combats || {} };   // 1.5.5: pT's own id begins with tk:, pU's holds it further in
        try {
            new Function('msg', 'conn', 'net', 'allow', 'applyTarget', 'broadcastTargets', 'combatAsked', 'combatAskOpen', 'getActiveCampaign', 'showConfirm', 'mapTitleOf', 'window', 'own', ordersSrc + '\n' + taSrc)(
                Object.assign({ type: 'target', id: 'orc', mapId: 'm1' }, msg || {}), { peer: o.peer || 'pA' }, net, () => !o.slow, (pid, name, t) => out.applied.push([pid, name, t]), () => { out.bcast++; }, asked, Object.create(null), () => (o.noCamp ? null : camp),
                (title, cb, opts) => { out.asks.push([title, opts]); if (o.yes !== undefined) cb(o.yes); }, id => 'Keep', { wpOpenCombat: (mid, oo) => out.opened.push([mid, oo]) }, H.own);
        } catch (e) { out.threw = e.message; }
        out.asked = Object.keys(asked); return out; };
    const t1 = runTa({}, { yes: true }), t2 = runTa({}, { asked: { 'm1|orc': true } }), tOff = runTa({}, { rules: { targetAsk: 'off' } }), tOn = runTa({}, { rules: { targetAsk: 'ask' } }), tJunk = runTa({}, { rules: 'off' });
    const tHid = runTa({ id: 'ghost' }), tPc = runTa({ id: 'pc' }), tBox = runTa({ id: 'box' }), tFight = runTa({}, { combats: { f_aaaaaaaa: { id: 'f_aaaaaaaa', mapId: 'm1', rows: [] } } }), tClear = runTa({ id: null }), tDoc = runTa({ mapId: 'd1' }), tProto = runTa({ mapId: '__proto__' }), tNone = runTa({ id: 'nope' });
    const tNo = runTa({}, { yes: false }), tSlow = runTa({}, { slow: true }), tStranger = runTa({}, { peer: 'pZ' }), tLong = runTa({ id: 'x'.repeat(81) }), tNoCamp = runTa({}, { noCamp: true });
    const ptr = [['u_a', 'Ana', { id: 'orc', mapId: 'm1' }]], quiet = r => r.applied.length === 1 && r.applied[0][0] === 'u_a' && !!r.applied[0][2] && r.bcast === 1 && r.asks.length === 0 && r.opened.length === 0 && r.threw === '';
    check('targeting (host, the target branch run for real): a player\'s pointer at one of the GM\'s characters is applied and sent as before and the GM is asked once to start combat there, the question answered by its buttons alone (noEnter) — Yes opens the roster with that character pre-ticked for that player, No opens nothing; asked once per character per session',
        j(t1.applied) === j(ptr) && t1.bcast === 1 && j(t1.asks) === j([['Ana is targeting Orc on Keep. Start combat there?', { noEnter: true, noEscape: true }]]) && j(t1.opened) === j([['m1', { pre: ['orc'], owner: 'u_a' }]]) && j(t1.asked) === j(['m1|orc'])
        && j(tNo.asks.length) === '1' && tNo.opened.length === 0 && quiet(t2) && j(t2.asked) === j(['m1|orc']), j([t1, tNo, t2]));
    check('targeting (host): with the campaign\'s switch off (turnRules.targetAsk "off") the pointer still goes out but nothing is asked and nothing is marked asked (switched on again, the offer is still owed); any other value asks; a hidden token, a player\'s token, a piece that is no character, nothing of that id, a map with a fight running, a page, a map that is none (a prototype name too), a cleared pointer or no campaign ask nothing and throw nothing; the rate limit, a stranger and an id past 80 characters apply nothing',
        quiet(tOff) && j(tOff.asked) === '[]' && tOn.asks.length === 1 && tJunk.asks.length === 1 && [tHid, tPc, tBox, tNone, tFight, tDoc, tProto].every(quiet) && j(tClear.applied) === j([['u_a', 'Ana', null]]) && tClear.bcast === 1 && tClear.asks.length === 0
        && j(tNoCamp.applied) === j(ptr) && tNoCamp.asks.length === 0 && tNoCamp.threw === '' && [tSlow, tStranger, tLong].every(r => r.applied.length === 0 && r.bcast === 0 && r.asks.length === 0), j([tOff, tHid, tFight, tProto, tNoCamp, tSlow, tLong]));
    // 1.5.5 (the release trace, F5): a profile id may hold a colon, and a pointer kept under a key that begins with tk: is drawn from the GM's token of that
    // id. A player whose own id begins with tk: sets no pointer, clears none and is sent nothing; one whose id holds it further in targets as before
    const tTk = runTa({}, { peer: 'pT', yes: true }), tTkClr = runTa({ id: null }, { peer: 'pT' }), tTkIn = runTa({}, { peer: 'pU' });
    check('1.5.5 (the release trace, F5) the host\'s target branch (run for real): a player whose own profile id begins with tk:, the key of one of the GM\'s characters\' pointers, sets no pointer and clears none, nothing is sent and nothing is asked; a player whose id holds tk: further in targets as before',
        [tTk, tTkClr].every(r => r.applied.length === 0 && r.bcast === 0 && r.asks.length === 0 && r.opened.length === 0 && r.threw === '') && j(tTkIn.applied) === j([['u.tk:orc', 'Una', { id: 'orc', mapId: 'm1' }]]) && tTkIn.bcast === 1, j([tTk, tTkClr, tTkIn]));
    // the confirm itself (dialogs.js showConfirm, run for real on a page of plain objects): Enter answers an ordinary question and never one marked noEnter; Escape and the buttons as ever; a queued question keeps its mark
    const dlgT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dialogs.js'), 'utf8').replace(/\r\n/g, '\n'), dlgSrc = dlgT.slice(dlgT.indexOf('  var _confirmQueue = [];'), dlgT.indexOf('  // One-button variant of showConfirm'));
    const mkDlg = () => { const els = {}, keys = [], el = id => (els[id] = els[id] || { style: { display: 'none' }, textContent: '', onclick: null }); ['customConfirm', 'customConfirmTitle', 'customConfirmOk', 'customConfirmCancel'].forEach(el);
        const doc = { getElementById: id => els[id] || null, addEventListener: (k, h) => { if (k === 'keydown') keys.push(h); }, removeEventListener: (k, h) => { const i = keys.indexOf(h); if (i >= 0) keys.splice(i, 1); } };
        const sc = new Function('document', 'setTimeout', dlgSrc + '\nreturn showConfirm;')(doc, fn => fn());
        return { sc, els, keys, press: k => keys.slice().forEach(h => h({ key: k })), open: () => els.customConfirm.style.display === 'flex', title: () => els.customConfirmTitle.textContent }; };
    const dA = mkDlg(), aA = []; dA.sc('Plain?', v => aA.push(v)); const aOpen = dA.open(); dA.press('Enter'); const aAfter = [aA.slice(), dA.open(), dA.keys.length];
    const dB = mkDlg(), aB = []; dB.sc('Start combat?', v => aB.push(v), { noEnter: true }); dB.press('Enter'); const bEnter = [aB.slice(), dB.open(), dB.keys.length]; dB.press('Escape'); const bEsc = [aB.slice(), dB.open(), dB.keys.length];
    const dC = mkDlg(), aC = []; dC.sc('Start combat?', v => aC.push(v), { noEnter: true }); dC.els.customConfirmOk.onclick(); const cOk = [aC.slice(), dC.open()];
    const dD = mkDlg(), aD = []; dD.sc('First?', v => aD.push(['first', v])); dD.sc('Second?', v => aD.push(['second', v]), { noEnter: true }); dD.press('Enter'); const dMid = [aD.slice(), dD.title()]; dD.press('Enter'); const dEnd = [aD.slice(), dD.open()]; dD.press('Escape'); const dEsc = [aD.slice(), dD.open()];
    const dE = mkDlg(), aE = []; dE.sc('Odd?', v => aE.push(v), { noEnter: 'yes' }); dE.press('Enter'); const eOdd = [aE.slice(), dE.open()];
    check('targeting (dialogs.js showConfirm, run for real): Enter answers an ordinary question Yes and closes it (its key handler gone); a question marked noEnter is left open by Enter and answered by Escape (No) or its Yes button; a question queued behind another keeps its mark — the first answered by Enter brings the second, which Enter leaves open; a mark that is not true is no mark',
        aOpen && j(aAfter) === j([[true], false, 0]) && j(bEnter) === j([[], true, 1]) && j(bEsc) === j([[false], false, 0]) && j(cOk) === j([[true], false])
        && j(dMid) === j([[['first', true]], 'Second?']) && j(dEnd) === j([[['first', true]], true]) && j(dEsc) === j([[['first', true], ['second', false]], false]) && j(eOdd) === j([[true], false]), j([aAfter, bEnter, bEsc, cOk, dMid, dEnd, dEsc, eOdd]));
    // The owed review, 2026-10-09 (backlog 137). (c) A join request was a question Enter answered and Escape refused, so a key typed for
    // something else let a stranger in, or turned a player away for the session: its buttons alone answer it now (noEnter and the new
    // noEscape). (d) The naming prompt and a question were two layers, so both could be up and one Enter or Escape answered both: they are
    // one layer, a key typed into the prompt goes no further, and whichever is asked while the other is up waits its turn.
    // the fourteenth review: a key held down answers nothing, and the next press of it answers as ever; and while a question is up, Enter presses
    // nothing behind it, a press of one of the question's own buttons from the keyboard left alone
    { const mkQ = (where, opts) => { const els = {}, keys = [], el = id => (els[id] = els[id] || { style: { display: 'none' }, textContent: '', onclick: null }); ['customConfirm', 'customConfirmTitle', 'customConfirmOk', 'customConfirmCancel'].forEach(el);
          const inner = { blur() {} }; els.customConfirm.contains = x => x === inner;
          const doc = { getElementById: id => els[id] || null, addEventListener: (k, h) => { if (k === 'keydown') keys.push(h); }, removeEventListener: (k, h) => { const i = keys.indexOf(h); if (i >= 0) keys.splice(i, 1); }, activeElement: where === 'own' ? inner : where === 'behind' ? {} : null };
          const got = []; new Function('document', 'setTimeout', dlgSrc + '\nreturn showConfirm;')(doc, fn => fn())('Q?', v => got.push(v), opts);
          return (k, rep) => { let pd = false; keys.slice().forEach(h => h(rep === 'bare' ? { key: k } : { key: k, repeat: rep === true, preventDefault() { pd = true; } })); return [pd, got.slice(), els.customConfirm.style.display === 'flex']; }; };
      const qB = mkQ('behind'), heldQ = [qB('Enter', true), qB('Escape', true), qB('Enter')], qE = mkQ('behind'), escQ = [qE('Escape')], qO = mkQ('own'), ownQ = [qO('Enter', true), qO('Enter')], qN = mkQ('none'), noneQ = [qN('Enter', 'bare')], qG = mkQ('behind', { noEnter: true }), graveQ = [qG('Enter'), qG('Escape')];
      check('a question and its keys (dialogs.js showConfirm, run for real): Enter or Escape repeating from a press made before the question came up answers nothing and leaves it open, and the next press answers it; while a question is up Enter presses nothing behind it, whether it answers, repeats or may not answer, so the button that raised the question is not pressed again; Escape is never held back; a press of one of the question\'s own buttons from the keyboard is left to that button; an event with nothing to hold back answers as ever',
          j(heldQ) === j([[true, [], true], [false, [], true], [true, [true], false]]) && j(escQ) === j([[false, [false], false]]) && j(ownQ) === j([[false, [], true], [false, [true], false]]) && j(noneQ) === j([[false, [true], false]]) && j(graveQ) === j([[true, [], true], [false, [false], false]]),
          j([heldQ, escQ, ownQ, noneQ, graveQ])); }
    // dialogs.js showPrompt and showConfirm, run for real on a page of plain objects, with timers the test runs itself
    {
        const dlgAll = dlgT.slice(dlgT.indexOf('  function showPrompt(title, defaultText, callback, opts) {'), dlgT.indexOf('  // One-button variant of showConfirm'));
        const mkLay = () => { const els = {}, keys = [], timers = [], el = id => (els[id] = els[id] || { id, style: { display: 'none' }, textContent: '', value: '', onclick: null, onkeydown: null, focus() { els._focus = id; }, select() {} });
            ['customConfirm', 'customConfirmTitle', 'customConfirmOk', 'customConfirmCancel', 'customPrompt', 'customPromptTitle', 'customPromptInput', 'customPromptOk', 'customPromptCancel'].forEach(el);
            const doc = { getElementById: id => els[id] || null, addEventListener: (k, h) => { if (k === 'keydown') keys.push(h); }, removeEventListener: (k, h) => { const i = keys.indexOf(h); if (i >= 0) keys.splice(i, 1); } };
            const api = new Function('document', 'setTimeout', dlgAll + '\nreturn { sc: showConfirm, sp: showPrompt };')(doc, fn => { timers.push(fn); });
            // a key typed into the prompt's box: the box's own handler first, then the page's, unless the box stopped it there
            const typeKey = k => { let stopped = false, prevented = false; const ev = { key: k, stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } }; if (els.customPromptInput.onkeydown) els.customPromptInput.onkeydown(ev); if (!stopped) keys.slice().forEach(h => h(ev)); return [stopped, prevented]; };
            return { api, els, keys, typeKey, doc, run: () => { let n = 0; while (timers.length && n++ < 50) timers.shift()(); }, pageKey: k => keys.slice().forEach(h => h({ key: k })), qUp: () => els.customConfirm.style.display === 'flex', pUp: () => els.customPrompt.style.display === 'flex', qTitle: () => els.customConfirmTitle.textContent, pTitle: () => els.customPromptTitle.textContent }; };
        // a prompt up, then a question: the question waits, and Enter typed into the prompt answers the prompt alone
        const L1 = mkLay(), a1 = []; L1.api.sp('Name?', 'My New Campaign', v => a1.push(['p', v])); L1.api.sc('Discard?', v => a1.push(['q', v])); const l1a = [L1.pUp(), L1.qUp(), L1.keys.length]; L1.els.customPromptInput.value = 'X';
        const k1 = L1.typeKey('Enter'), l1b = [a1.slice(), L1.pUp(), L1.qUp()]; L1.run(); const l1c = [L1.qUp(), L1.qTitle(), a1.length];
        // a question up, then a prompt: the prompt waits; Escape typed into the prompt, once it is up, cancels the prompt alone
        const L2 = mkLay(), a2 = []; L2.api.sc('End combat?', v => a2.push(['q', v])); L2.api.sp('Name?', '', v => a2.push(['p', v])); const l2a = [L2.qUp(), L2.pUp()]; L2.pageKey('Enter'); const l2b = [a2.slice(), L2.qUp(), L2.pUp()]; L2.run();
        const l2c = [L2.pUp(), L2.pTitle(), L2.els._focus]; L2.api.sc('Later?', v => a2.push(['q2', v])); const l2q = L2.qUp(), k2 = L2.typeKey('Escape'), l2d = [a2.slice(), L2.pUp(), L2.qUp()]; L2.run(); const l2e = [L2.qUp(), L2.qTitle()];
        // a second prompt does not replace the first; questions come before a waiting prompt
        const L3 = mkLay(), a3 = []; L3.api.sp('A?', '', v => a3.push(['a', v])); L3.api.sp('B?', '', v => a3.push(['b', v])); const l3a = L3.pTitle(); L3.els.customPromptOk.onclick(); L3.run(); const l3b = [a3.slice(), L3.pTitle(), L3.pUp()];
        const L4 = mkLay(), a4 = []; L4.api.sc('Q1?', v => a4.push(['q1', v])); L4.api.sp('P?', '', v => a4.push(['p', v])); L4.api.sc('Q2?', v => a4.push(['q2', v])); L4.els.customConfirmOk.onclick(); L4.run(); const l4a = [L4.qUp(), L4.qTitle(), L4.pUp()];
        L4.els.customConfirmCancel.onclick(); L4.run(); const l4b = [L4.qUp(), L4.pUp(), L4.pTitle(), a4.slice()];
        // a question answered by a callback that asks another: the waiting one keeps its place behind it
        const L5 = mkLay(), a5 = []; L5.api.sc('First?', v => { a5.push('first'); L5.api.sc('Follow-up?', () => a5.push('follow')); }); L5.api.sc('Waiting?', () => a5.push('waiting')); L5.api.sc('Later?', () => a5.push('later')); L5.els.customConfirmOk.onclick(); const l5a = L5.qTitle(); L5.run(); const l5b = L5.qTitle(); L5.els.customConfirmOk.onclick(); L5.run(); const l5c = [L5.qTitle(), a5.slice()]; L5.els.customConfirmOk.onclick(); L5.run(); const l5d = [L5.qTitle(), a5.slice()];
        // the join question's marks: neither Enter nor Escape answers it, its buttons do; a mark that is not true is no mark
        const L6 = mkLay(), a6 = []; L6.api.sc('Join?', v => a6.push(v), { noEnter: true, noEscape: true }); L6.pageKey('Enter'); L6.pageKey('Escape'); const l6a = [a6.slice(), L6.qUp()]; L6.els.customConfirmCancel.onclick(); const l6b = [a6.slice(), L6.qUp(), L6.keys.length];
        const L7 = mkLay(), a7 = []; L7.api.sc('Odd?', v => a7.push(v), { noEscape: 'yes' }); L7.pageKey('Escape'); const l7 = [a7.slice(), L7.qUp()];
        // The review of the fold's own fixes, 2026-10-09: a click on OK or Cancel leaves the focus on that button, the answer raises the next join
        // request in the same breath, and Enter or the space bar then pressed the button again. A question whose keys must not answer it takes
        // the focus off its own buttons as it comes up; an ordinary question, and a focus elsewhere on the page, are left alone
        const L8 = mkLay(), a8 = [], blurs = []; L8.els.customConfirm.contains = n => n === L8.els.customConfirmOk || n === L8.els.customConfirmCancel;
        ['customConfirmOk', 'customConfirmCancel'].forEach(id => { L8.els[id].blur = () => { blurs.push(id); if (L8.doc.activeElement === L8.els[id]) L8.doc.activeElement = null; }; });
        L8.api.sc('Join A?', v => { a8.push(v); L8.api.sc('Join B?', w => a8.push(w), { noEnter: true, noEscape: true }); }, { noEnter: true, noEscape: true }); const l8a = blurs.length;
        L8.doc.activeElement = L8.els.customConfirmOk; L8.els.customConfirmOk.onclick({ detail: 1 }); const l8b = [L8.qTitle(), L8.doc.activeElement === null, blurs.slice(), a8.slice()];
        L8.doc.activeElement = L8.els.customConfirmCancel; L8.els.customConfirmCancel.onclick(); L8.api.sc('Start combat?', () => {}, { noEnter: true }); const l8c = [L8.doc.activeElement === null, blurs.slice()];
        const L9 = mkLay(), b9 = [], elsewhere = { blur() { b9.push('elsewhere'); } }; L9.els.customConfirm.contains = n => n === L9.els.customConfirmOk; L9.els.customConfirmOk.blur = () => { b9.push('ok'); };
        L9.doc.activeElement = L9.els.customConfirmOk; L9.api.sc('Plain?', () => {}); const l9a = b9.length; L9.els.customConfirmOk.onclick({ detail: 1 }); L9.doc.activeElement = elsewhere; L9.api.sc('Marked?', () => {}, { noEnter: true, noEscape: true }); const l9b = b9.slice();
        check('a question and the naming prompt are one layer (the owed review of 2026-10-09; dialogs.js showPrompt and showConfirm, run for real): a question asked while the prompt is up waits, and Enter typed into the prompt answers the prompt alone, going no further, after which the question comes up unanswered; a prompt asked while a question is up waits, and Escape typed into it cancels the prompt alone, a question asked meanwhile waiting behind it; a second prompt waits for the first and never replaces it; questions come up before a waiting prompt; a question whose answer asks another keeps the waiting ones behind it, in the order they were asked; a question marked noEnter and noEscape is left up by both keys and answered by its buttons, a mark that is not true is no mark; and a question with either mark takes the focus off its own buttons as it comes up, so the button a first join request was answered with is not pressed again by Enter or the space bar for the second, while an ordinary question and a focus elsewhere on the page are left as they are',
            j(l1a) === j([true, false, 0]) && j(k1) === j([true, true]) && j(l1b) === j([[['p', 'X']], false, false]) && j(l1c) === j([true, 'Discard?', 1])
            && j(l2a) === j([true, false]) && j(l2b) === j([[['q', true]], false, false]) && j(l2c) === j([true, 'Name?', 'customPromptInput']) && l2q === false && j(k2) === j([true, false]) && j(l2d) === j([[['q', true], ['p', null]], false, false]) && j(l2e) === j([true, 'Later?'])
            && l3a === 'A?' && j(l3b) === j([[['a', '']], 'B?', true]) && j(l4a) === j([true, 'Q2?', false]) && j(l4b) === j([false, true, 'P?', [['q1', true], ['q2', false]]])
            && l5a === 'Follow-up?' && l5b === 'Follow-up?' && j(l5c) === j(['Waiting?', ['first', 'follow']]) && j(l5d) === j(['Later?', ['first', 'follow', 'waiting']])
            && j(l6a) === j([[], true]) && j(l6b) === j([[false], false, 0]) && j(l7) === j([[false], false])
            && l8a === 0 && j(l8b) === j(['Join B?', true, ['customConfirmOk'], [true]]) && j(l8c) === j([true, ['customConfirmOk', 'customConfirmCancel']]) && l9a === 0 && j(l9b) === j([]),
            j([l1a, k1, l1b, l1c, l2a, l2b, l2c, l2q, k2, l2d, l2e, l3a, l3b, l4a, l4b, l5a, l5b, l5c, l6a, l6b, l7]));
    }
    // the Settings row, Help, the tour and the integration guide
    const idxT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n'), setT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'settings.js'), 'utf8').replace(/\r\n/g, '\n'), guideT = fs.readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').replace(/\r\n/g, '\n');
    const turnsRow = (idxT.match(/<div class="set-vtt-row set-sw-row" data-vtt="turns"[\s\S]*?<div class="set-vtt-role"/) || [''])[0];
    check('targeting (source): the Turn-based combat row in Settings offers "A player targets one of my characters" as a GM-only select #setTargetAskMode (Ask me to start combat | Do nothing) and says the feature is on by default; settings.js fills it from camp.turnRules.targetAsk (off, else ask) and writes "off" or deletes the key, saving and saying; Help\'s Targeting line says right-click or T, never a plain click, and the Combat line names the offer, its buttons and the switch; the guide lists targetAsk, never sent to players; the host sends no targetAsk on the wire',
        /<label class="gm-only set-move-mode"[^\n]*><span class="set-name">A player targets one of my characters<small>On a map with no fight running, you can be asked whether to start one there\.<\/small><\/span> <select id="setTargetAskMode" class="map-select"[^\n]*><option value="ask">Ask me to start combat<\/option><option value="off">Do nothing<\/option><\/select><\/label>/.test(turnsRow) && /On by default\./.test(turnsRow) && !/<div class="set-vtt-help"[^\n]*Off by default/.test(idxT)
        && /var taM = ui\('setTargetAskMode'\); if \(taM\) \{ taM\.value = camp && camp\.turnRules && typeof camp\.turnRules === 'object' && camp\.turnRules\.targetAsk === 'off' \? 'off' : 'ask'; taM\.disabled = !editable; \}/.test(setT)
        && /if \(_targetAskSel\.value === 'off'\) tr\.targetAsk = 'off'; else delete tr\.targetAsk; camp\.turnRules = tr;\n\s*if \(window\.wpSave\) window\.wpSave\(true\);\n\s*toast\(/.test(setT)
        && /<li><b>Targeting:<\/b> right-click a character token that isn't yours &#9656; <b>Target<\/b> to mark it as your target\. Pressing <b>T<\/b> while pointing at it does the same\.[\s\S]{0,400}?<li>A plain click targets nothing[\s\S]{0,200}?<b>Clear target<\/b>[^\n]*<b>Esc<\/b>/.test(idxT)
        && /When a player targets one of your characters on a map with no fight running, you are asked whether to start combat there, once per character per session\. Click <b>Yes<\/b>: Enter does not answer it\. <b>A player targets one of my characters<\/b> in Settings/.test(idxT)
        && /"targetAsk" \("off"; absent: ask\) — whether a player targeting one of the GM's characters on a map with no fight running asks the GM to start combat there \(never sent to players\)/.test(guideT) && !/targetAsk/.test(src.slice(src.indexOf('net.turnRulesMessage = function()'), src.indexOf('\n', src.indexOf('net.turnRulesMessage = function()')))),
        j([turnsRow.length, /On by default\./.test(turnsRow)]));
}
// hidden pieces: a trap tile (a hidden portal ticked Trap) fires when a player's token is dropped on it — the host judges the drop on its own
// map, so players need nothing of the tile — and never by naming it in a travel request; a hidden portal that is no trap is inert both ways
{
    const tvSrc = between('// [netcheck:travelmsg-start]', '// [netcheck:travelmsg-end]', 'travelmsg');
    const runTv = (via, portalOver, o) => {
        const from = { id: 'm1', type: 'map', whiteboard: [Object.assign({ id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }, portalOver)] }, calls = [];
        new Function('msg', 'conn', 'net', 'peerPaused', 'allow', 'getActiveCampaign', 'hostTravel', tvSrc)({ type: 'travel', viaItemId: via }, { peer: 'pA' }, { paused: !!(o && o.paused), roster: { pA: { id: 'u_p', location: 'm1' } } }, () => false, () => !(o && o.limited), () => ({ id: 'c1', activeItemId: 'm1', items: { m1: from } }), (c, t, p) => { calls.push(p ? p.id : null); });
        return calls;
    };
    check('hidden pieces (travel, host): a travel request naming a visible portal is passed on; one naming a hidden portal — a trap tile or not — moves nobody, however the id was learned; one naming nothing on the map is passed on as nothing (and refused there); a paused table and the rate limit still stop it first',
        j(runTv('po', {})) === j(['po']) && j(runTv('po', { hidden: true, trap: true })) === '[]' && j(runTv('po', { hidden: true })) === '[]' && j(runTv('po', { hidden: 1, trap: true })) === '[]' && j(runTv('nope', {})) === j([null])
        && j(runTv('po', {}, { paused: true })) === '[]' && j(runTv('po', {}, { limited: true })) === '[]', j([runTv('po', {}), runTv('po', { hidden: true, trap: true }), runTv('nope', {})]));
    const trSrcD = fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel');
    const puSrc = fnSrc('function portalUnder(item, map) {', '\n}\n', 'portalUnder') + '\n}\n', tdSrc = fnSrc('net.tokenDropped = function(item, map, gmHand) {', '\n};\n', 'tokenDropped') + '\n};\n';
    const runDropX = (portalOver, at, o) => {   // o: travelLocked, playerLock (the destination closed to players), paused (this player)
        o = o || {};
        const tok = { id: 'tok', isChar: true, ownerId: 'u_p', x: at[0], y: at[1], w: 60, h: 52 }, toasts = [];
        const from = { id: 'm1', type: 'map', meta: { title: 'Here' }, rooms: [], whiteboard: [tok, Object.assign({ id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }, portalOver)] };
        const camp = { id: 'c1', items: { m1: from, m2: { id: 'm2', type: 'map', meta: Object.assign({ title: 'There' }, o.playerLock ? { playerLock: true } : {}), rooms: [], whiteboard: [] } } };
        const conn = mkConn('pA'), netD = { active: true, role: 'host', paused: false, travelLocked: !!o.travelLocked, roster: { pA: { id: 'u_p', name: 'P', location: 'm1' } }, conns: [conn], broadcastItemFiltered: () => {} };
        let ret;
        try {
            ret = new Function('getActiveCampaign', 'net', '_travelDenyLast', 'sendFailed', 'findLandingRoom', 'landingPoint', 'freeSpotNear', 'stepOffPortal', 'renderRoster', 'broadcastRoster', 'ensurePlayerToken', 'save', 'toast', 'logEvent', 'window', 'npcTravel', 'offlinePlayerTravel', 'pausedById', 'item', 'map',
                ownKeySrc + trSrcD + '\n' + puSrc + '\n' + tdSrc + '\nreturn net.tokenDropped(item, map);')(
                () => camp, netD, {}, () => {}, () => null, () => null, () => ({ x: 0, y: 0 }), () => {}, () => {}, () => {}, () => {}, () => {}, t => toasts.push(t), () => {}, {}, () => 'npc', () => 'offline', () => !!o.paused, tok, from);
        } catch (e) { ret = 'threw: ' + e.message; }
        return { ret, loc: netD.roster.pA.location, sent: conn.sent.map(m => m.type + (m.reason ? ':' + m.reason + ':' + m.map : '')), toasts };
    };
    const runDrop = (portalOver, at) => { const r = runDropX(portalOver, at); return [r.ret, r.loc, r.sent.length]; };
    const puOnly = new Function(puSrc + '\nreturn portalUnder;')(), tokP = { id: 'tok', x: 0, y: 0, w: 60, h: 52 }, mapP = over => ({ whiteboard: [tokP, Object.assign({ id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }, over)], rooms: [] });
    check('hidden pieces (a drop, host — the real net.tokenDropped, portalUnder and hostTravel): a player\'s token dropped on a hidden trap tile still travels (the host\'s own map holds the tile); dropped on a hidden portal that is no trap, or beside the tile, it stays; a visible portal as ever; the portal under a token (which the GM\'s own walk-throughs read too) is never a hidden one that is no trap',
        puOnly(tokP, mapP({ hidden: true })) === null && puOnly(tokP, mapP({ hidden: true, trap: true })).id === 'po' && puOnly(tokP, mapP({})).id === 'po'
        && j(runDrop({ hidden: true, trap: true }, [0, 0])) === j([true, 'm2', 1]) && j(runDrop({ hidden: true }, [0, 0])) === j([false, 'm1', 0]) && j(runDrop({ hidden: true, trap: true }, [500, 500])) === j([false, 'm1', 0]) && j(runDrop({}, [0, 0])) === j([true, 'm2', 1]) && j(runDrop({ hidden: 1, trap: true }, [0, 0])) === j([true, 'm2', 1]),
        j([runDrop({ hidden: true, trap: true }, [0, 0]), runDrop({ hidden: true }, [0, 0]), runDrop({ hidden: true, trap: true }, [500, 500]), runDrop({}, [0, 0])]));
    // hidden pieces: a trap tile that cannot fire tells its player nothing — a denial would give its place (and its destination's name) away
    const dLock = runDropX({ hidden: true, trap: true }, [0, 0], { travelLocked: true }), dClosed = runDropX({ hidden: true, trap: true }, [0, 0], { playerLock: true }), dPaused = runDropX({ hidden: true, trap: true }, [0, 0], { paused: true });
    const vLock = runDropX({}, [0, 0], { travelLocked: true }), vClosed = runDropX({}, [0, 0], { playerLock: true }), dBeside = runDropX({ hidden: true, trap: true }, [500, 500], { travelLocked: true });
    check('hidden pieces (a drop on a trap tile that cannot fire — the real net.tokenDropped, portalUnder and hostTravel): with travel locked, or the destination closed to players, a player\'s drop on a hidden trap tile moves nobody and sends that player nothing — no denial, no map name — while the GM is told what happened; a visible portal in the same two states still gets its one travelDenied (the closed one naming the map) and the GM no toast; a paused player\'s drop does nothing either way; a drop beside the tile nothing',
        j([dLock.ret, dLock.loc, dLock.sent]) === j([false, 'm1', []]) && j(dLock.toasts) === j(['P stepped on a hidden trap tile, but travel is locked: nothing happened, and they were told nothing.'])
        && j([dClosed.ret, dClosed.loc, dClosed.sent]) === j([false, 'm1', []]) && j(dClosed.toasts) === j(['P stepped on a hidden trap tile to There, which is closed to players: nothing happened, and they were told nothing.'])
        && j([dPaused.ret, dPaused.loc, dPaused.sent, dPaused.toasts]) === j([false, 'm1', [], []]) && j([dBeside.ret, dBeside.sent, dBeside.toasts]) === j([false, [], []])
        && j([vLock.ret, vLock.loc, vLock.sent, vLock.toasts]) === j([false, 'm1', ['travelDenied'], []]) && j([vClosed.ret, vClosed.loc, vClosed.sent, vClosed.toasts]) === j([false, 'm1', ['travelDenied:closed:There'], []]),
        j([dLock, dClosed, dPaused, dBeside, vLock, vClosed]));
}
// R2 security (cluster A, #5): the host's needItem branch and net.sendItem look the campaign and the item up by their own keys alone
{
    const niSrc = between('// [netcheck:needitem-start]', '// [netcheck:needitem-end]', 'needitem');
    const sendSrc = (() => { const i = src.indexOf('net.sendItem = function('), e = src.indexOf('\n};\n', i); return src.slice(i, e + 4); })();
    const runNeed = (itemId, campId) => {
        const conn = { peer: 'pA', open: true, sent: [], send(m) { packCheck(m); this.sent.push(m); } }, camp = { id: 'k', items: JSON.parse('{"mA":{"type":"map","id":"mA","whiteboard":[]}}') };
        const net = { role: 'host', roster: { pA: { id: 'u_a' } }, conns: [conn] }, state = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
        let threw = '';
        try {
            new Function('msg', 'conn', 'net', 'state', 'getActiveCampaign', 'allow', 'window', 'withAck', 'hidNote', 'fogForgetMap', 'itemDelta', '_lastSent', 'ackSend', 'broadcast', 'sendFailed',
                ownKeySrc + siSrc() + '\n' + lineOf('function mapFogged(') + '\n' + sendSrc + '\n' + niSrc)(
                { type: 'needItem', campId: campId || 'k', itemId }, conn, net, state, () => camp, () => true, { wpVtt: { on: () => true } }, m => m, () => {}, () => {}, () => null, {}, () => {}, () => {}, e => { threw = e.message; });
        } catch (e) { threw = 'threw: ' + e.message; }
        return { sent: conn.sent.map(m => [m.type, m.itemId, m.item && typeof m.item]), threw };
    };
    const protoN = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '', 5, null].map(id => runNeed(id));
    const okN = runNeed('mA'), otherC = runNeed('mA', 'k9'), missing = runNeed('mB');
    check('security (needItem, host — the real branch and net.sendItem): a map asked for by a prototype\'s key, an empty id, a number or null is looked up by its own key alone and sends nothing — never a prototype object as a map, never a function the wire cannot carry; the hosted campaign\'s own map goes to the asker once; another campaign\'s or a map that is not there sends nothing',
        protoN.every(r => r.sent.length === 0 && r.threw === '') && j(okN.sent) === j([['item', 'mA', 'object']]) && okN.threw === '' && otherC.sent.length === 0 && otherC.threw === '' && missing.sent.length === 0 && missing.threw === '', j([protoN, okN, otherC, missing]));
    check('security (source): net.sendItem and net.broadcastItemFiltered read the campaign and the item by their own keys, and the needItem branch refuses an id that is no key before the rate limit',
        /net\.sendItem = function\([^\n]*\n\s*var camp = own\(state\.appState\.campaigns, campId\) \? state\.appState\.campaigns\[campId\] : null, it = camp && own\(camp\.items, itemId\) \? camp\.items\[itemId\] : null; if \(!it\) return;/.test(src)
        && /net\.broadcastItemFiltered = function\([^\n]*\n\s*var camp = own\(state\.appState\.campaigns, campId\) \? state\.appState\.campaigns\[campId\] : null, it = camp && own\(camp\.items, itemId\) \? camp\.items\[itemId\] : null; if \(!it\) return;/.test(src)
        && /var campN = getActiveCampaign\(\); if \(!campN \|\| msg\.campId !== campN\.id \|\| !validKey\(msg\.itemId\) \|\| !own\(campN\.items, msg\.itemId\)\) return;[^\n]*\n\s*if \(!allow\('need'/.test(niSrc));
}
// found live, 2026-10-30: a token a drop makes for a character has its owner. A player's drop on a portal, and the GM's of a player who is away: the real
// net.tokenDropped, hostTravel, ensurePlayerToken, tokenFromChar, offlinePlayerTravel and npcTravel with the real resolver and chooser
pendingChecks.push((async () => {
    const T = 'a drop gives the token its owner (the real net.tokenDropped, hostTravel, ensurePlayerToken, offlinePlayerTravel and npcTravel with the real chooser): a player\'s drop through a door makes their character\'s token on the far map theirs, or takes an unowned one there; the GM\'s drop of a player who is away does the same; a character with no player, and an NPC, stay with none; and the two ways a token could come out with nobody\'s name on it have the player\'s: one made new from the character, and one copied from an unowned token of it, which is what a dropped token used to be';
    try {
        const Sx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).split(String.fromCharCode(92)).join('/'));
        const body = (a, b, l) => fnSrc(a, b, l) + b;
        const code = ownKeySrc + fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel') + '\n' + body('function freeSpotNear(', '\n}\n', 'freeSpotNear') + body('function stepOffPortal(', '\n}\n', 'stepOffPortal') + body('function portalUnder(item, map) {', '\n}\n', 'portalUnder')
            + body('function tokenFromChar(ch, pid) {', '\n}\n', 'tokenFromChar') + body('function spawnSpot(', '\n}\n', 'spawnSpot') + body('function ensurePlayerToken(pid, mapId, landRoomId, opts) {', '\n}\n', 'ensurePlayerToken') + body('function offlinePlayerTravel(item, map) {', '\n}\n', 'offlinePlayerTravel') + body('function npcTravel(item, map) {', '\n}\n', 'npcTravel') + body('net.tokenDropped = function(item, map, gmHand) {', '\n};\n', 'tokenDropped');
        const run = (o) => {   // o: owner (the dragged token's), charOwner (the character's), npc, away (the player is not at the table), there (the far map's tokens), arrive (no drop: they arrive on the far map; 'none': with no token of it anywhere)
            const tok = Object.assign({ id: 'tok', isChar: true, charId: 'c_p', charName: 'Ann', x: 0, y: 0, w: 60, h: 52 }, o.owner ? { ownerId: o.owner } : {});
            const from = { id: 'm1', type: 'map', meta: { title: 'Here', gridType: 'square' }, rooms: [], whiteboard: [tok, { id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }] }, dest = { id: 'm2', type: 'map', meta: { title: 'There' }, rooms: [], whiteboard: o.there || [] };
            const camp = { id: 'c1', activeItemId: 'm1', chars: { c_p: { id: 'c_p', name: 'Ann', ownerId: o.charOwner === undefined ? 'u_p' : o.charOwner, npc: !!o.npc, values: {}, made: 1 } }, players: { u_p: { name: 'P', charId: 'c_p' } }, items: { m1: from, m2: dest } };
            if (o.arrive === 'none') from.whiteboard.shift();
            const conn = mkConn('pA'), net = { active: true, role: 'host', paused: false, travelLocked: false, roster: o.away ? {} : { pA: { id: 'u_p', name: 'P', location: 'm1', color: '#112233' } }, conns: [conn], broadcastItemFiltered() {} };
            const ret = new Function('net', 'getActiveCampaign', '_travelDenyLast', 'sendFailed', 'findLandingRoom', 'landingPoint', 'renderRoster', 'broadcastRoster', 'save', 'toast', 'logEvent', 'window', 'pausedById', 'SC', 'healBindings', 'sheetsOnFor', 'render', 'settleWaiting', 'cleanFace', 'tok', 'from', 'arrive',
                code + '\nreturn arrive ? ensurePlayerToken(\'u_p\', \'m2\') : net.tokenDropped(tok, from);')(net, () => camp, {}, e => { throw e; }, () => null, () => null, () => {}, () => {}, () => {}, () => {}, () => {}, {}, () => false, () => Sx, () => {}, () => true, () => {}, () => [], () => null, tok, from, !!o.arrive);
            return { ret, far: dest.whiteboard.filter(w => w.isChar).map(w => [w.id === 't_x' ? 't_x' : 'new', w.charId || '', 'ownerId' in w ? w.ownerId : null]) };
        };
        const playerDrop = run({ owner: 'u_p' }), adopted = run({ owner: 'u_p', there: [{ id: 't_x', isChar: true, charId: 'c_p', charName: 'Ann', x: 500, y: 500, w: 60, h: 52 }] }), awayDrop = run({ owner: 'u_p', away: true });
        const noPlayer = run({ charOwner: '' }), npcDrop = run({ charOwner: '', npc: true }), made = run({ arrive: 'none' }), copied = run({ arrive: 'unowned' });
        check(T, j(playerDrop.far) === j([['new', 'c_p', 'u_p']]) && j(adopted.far) === j([['t_x', 'c_p', 'u_p']]) && j(awayDrop.far) === j([['new', 'c_p', 'u_p']]) && j(noPlayer.far) === j([['new', 'c_p', null]]) && j(npcDrop.far) === j([['new', 'c_p', null]]) && j(made.far) === j([['new', 'c_p', 'u_p']]) && j(copied.far) === j([['new', 'c_p', 'u_p']]) && [playerDrop, adopted, awayDrop, noPlayer, npcDrop, made, copied].every(r => r.ret === true),
            j([playerDrop, adopted, awayDrop, noPlayer, npcDrop, made, copied]));
    } catch (e) { check(T, false, 'threw: ' + (e && e.stack || e)); }
})());
// R2 security (cluster H, #4): a player's travel through a door — the real travel branch run with the real hostTravel, stepOffPortal, freeSpotNear,
// portalUnder, turnCombatOf and moveMode: the token the GM locked, or one a Refuse-order fight holds off its turn, keeps its player on the map;
// a travel by double-click moves no token that is not on the portal; a drop on the portal still steps off
{
    const tvSrc = between('// [netcheck:travelmsg-start]', '// [netcheck:travelmsg-end]', 'travelmsg');
    const trSrcT = fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel');
    const fsSrc = fnSrc('function freeSpotNear(', '\n}\n', 'freeSpotNear') + '\n}\n', soSrc = fnSrc('function stepOffPortal(', '\n}\n', 'stepOffPortal') + '\n}\n', puSrcT = fnSrc('function portalUnder(item, map) {', '\n}\n', 'portalUnder') + '\n}\n';
    const tcSrc = fnSrc('function turnCombatOf(', '\n}\n', 'turnCombatOf') + '\n}\n' + lineOf('function moveMode(') + '\n' + ordersSrc + '\n';
    const tdSrcT = fnSrc('net.tokenDropped = function(item, map, gmHand) {', '\n};\n', 'tokenDropped') + '\n};\n';
    const runTravel = (o) => {   // o: at (the token's place), locked, combat ('mine' | 'theirs': whose turn), order (the campaign's rule), turns (the feature), drop (through net.tokenDropped instead of the message)
        o = o || {};
        const tok = Object.assign({ id: 'tok', isChar: true, ownerId: 'u_p', charId: 'c_p', x: o.at ? o.at[0] : 2000, y: o.at ? o.at[1] : 2000, w: 60, h: 52 }, o.locked ? { locked: true } : {});
        const from = { id: 'm1', type: 'map', meta: { title: 'Here', gridType: 'square' }, rooms: [], whiteboard: [tok, { id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }] };
        const camp = { id: 'c1', activeItemId: 'm1', turnRules: o.order ? { order: o.order } : {}, items: { m1: from, m2: { id: 'm2', type: 'map', meta: { title: 'There' }, rooms: [], whiteboard: [] } } };
        const conn = mkConn('pA'), bcast = [], toasts = [], notes = [];
        const net = { active: true, role: 'host', paused: false, travelLocked: false, roster: { pA: { id: 'u_p', name: 'P', location: 'm1' } }, conns: [conn], broadcastItemFiltered: (c, i) => bcast.push(i),
            combats: o.combat ? { m1: { mapId: 'm1', round: 1, turn: o.combat === 'mine' ? 0 : 1, rows: [{ id: 'r_p', tokId: 'tok' }, { id: 'r_o', tokId: 'orc' }] } } : {} };
        const win = { wpVtt: { on: k => (k === 'turns' ? o.turns !== false : true) } };
        let ret = null;
        try {
            ret = new Function('msg', 'conn', 'net', 'peerPaused', 'allow', 'getActiveCampaign', 'turnNote', '_travelDenyLast', 'sendFailed', 'findLandingRoom', 'landingPoint', 'renderRoster', 'broadcastRoster', 'ensurePlayerToken', 'save', 'toast', 'logEvent', 'window', 'npcTravel', 'offlinePlayerTravel', 'pausedById', 'drop',
                ownKeySrc + trSrcT + '\n' + fsSrc + soSrc + puSrcT + tcSrc + tdSrcT + '\nif (drop) return net.tokenDropped(drop, getActiveCampaign().items.m1);\n' + tvSrc + '\nreturn "ran";')(
                { type: 'travel', viaItemId: 'po' }, conn, net, () => false, () => true, () => camp, (c, t) => notes.push(t), {}, e => { throw e; }, () => null, () => null, () => {}, () => {}, () => {}, () => {}, t => toasts.push(t), () => {}, win, () => 'npc', () => 'offline', () => false, o.drop ? tok : null);
        } catch (e) { ret = 'threw: ' + e.message; }
        return { ret, loc: net.roster.pA.location, at: [tok.x, tok.y], staged: conn.sent.filter(m => m.type === 'stage').length, notes, bcast, den: conn.sent.filter(m => m.type === 'travelDenied').map(m => m.reason) };
    };
    const far = [2000, 2000];
    const lockedT = runTravel({ locked: true }), lockedOn = runTravel({ locked: true, at: [0, 0] });
    const BES = [70, 0];   // 1.6.3 (finding 2): a token 10 px beside the door, which may travel by double-click (no core here: the box rule, 40 px)
    const offTurn = runTravel({ combat: 'theirs' }), offWarn = runTravel({ combat: 'theirs', order: 'warn', at: BES }), offOff = runTravel({ combat: 'theirs', order: 'off', at: BES }), myTurn = runTravel({ combat: 'mine', at: BES }), noFeat = runTravel({ combat: 'theirs', turns: false, at: BES });
    const plain = runTravel({}), beside = runTravel({ at: BES }), onPortal = runTravel({ at: [0, 0] }), dropped = runTravel({ at: [0, 0], drop: true }), droppedOff = runTravel({ at: [500, 500], drop: true });
    check('security (travel, host — the real branch with the real hostTravel): a player whose token on this map the GM locked is kept on the map — no travel, the token where it was, one line saying why — whether the token stands on the door or far from it; so is one whose token a running turn-based fight holds off its turn under the Refuse rule; with the rule Warn or Off, on their own turn, or with turn-based combat off, they travel as before',
        j([lockedT.staged, lockedT.loc, lockedT.at, lockedT.notes]) === j([0, 'm1', far, ['The GM has locked your token: you cannot leave this map.']]) && j([lockedOn.staged, lockedOn.loc, lockedOn.at]) === j([0, 'm1', [0, 0]])
        && j([offTurn.staged, offTurn.loc, offTurn.at, offTurn.notes]) === j([0, 'm1', far, ['It is not your turn: you cannot leave this map yet.']])
        && [offWarn, offOff, myTurn, noFeat].every(r => r.staged === 1 && r.loc === 'm2' && r.notes.length === 0), j([lockedT, lockedOn, offTurn, offWarn, offOff, myTurn, noFeat]));
    check('security (travel, host): 1.6.3 (the owner, 2026-11-17: "Next to it"): a travel by double-click from far across the map is refused with the word far and moves nothing; from beside the door it goes through and moves no token — the token stays exactly where it is and the map is not sent again for it; a token standing on the door steps off it as ever, by the message and by a drop on it (the real net.tokenDropped), the map going out once; a drop beside the door travels nobody',
        j([plain.staged, plain.loc, plain.at, plain.bcast, plain.den]) === j([0, 'm1', far, [], ['far']]) && j([beside.staged, beside.loc, beside.at, beside.bcast, beside.den]) === j([1, 'm2', BES, [], []]) && onPortal.staged === 1 && onPortal.loc === 'm2' && j(onPortal.at) !== j([0, 0]) && j(onPortal.bcast) === j(['m1'])
        && dropped.ret === true && dropped.loc === 'm2' && j(dropped.at) !== j([0, 0]) && j(dropped.bcast) === j(['m1']) && j([droppedOff.ret, droppedOff.loc, droppedOff.at]) === j([false, 'm1', [500, 500]]), j([plain, beside, onPortal, dropped, droppedOff]));
}
// a portal's own lock (the owner, 2026-10-03: "if the map is locked they shouldnt be able to. maybe add the ability to lock a portal from the play
// map if we dont have one too"): the host is the judge. The real travel branch, net.tokenDropped, portalUnder, stepOffPortal, freeSpotNear and
// hostTravel with travelBar (it rides in hostTravel's own slice), one module on one clock: a player's request and a player's drop through a
// locked portal are refused with a reason of their own, at most once in 4 s per player and portal; only true locks; Lock travel between maps,
// a closed destination and the branch's own checks answer first; a hidden trap tile that is locked tells its player nothing and the GM what
// happened; the GM's own hand, npcTravel, offlinePlayerTravel and the stage pass it
{
    const tvSrcL = between('// [netcheck:travelmsg-start]', '// [netcheck:travelmsg-end]', 'travelmsg');
    const trSrcL = fnSrc('function hostTravel(conn, traveler, portal, fromMap, gmHand) {', '\n// The portal item under a token\'s center', 'hostTravel');
    const barSrcL = between('// [netcheck:travelbar-start]', '// [netcheck:travelbar-end]', 'travelbar');
    const fsL = fnSrc('function freeSpotNear(', '\n}\n', 'freeSpotNear') + '\n}\n', soL = fnSrc('function stepOffPortal(', '\n}\n', 'stepOffPortal') + '\n}\n', puL = fnSrc('function portalUnder(item, map) {', '\n}\n', 'portalUnder') + '\n}\n';
    const tcL = fnSrc('function turnCombatOf(', '\n}\n', 'turnCombatOf') + '\n}\n' + lineOf('function moveMode(') + '\n' + ordersSrc + '\n';
    const tdL = fnSrc('net.tokenDropped = function(item, map, gmHand) {', '\n};\n', 'tokenDropped') + '\n};\n';
    const npL = fnSrc('function npcTravel(item, map) {', '\n// [netcheck:pos-start]', 'npcTravel'), ofL = fnSrc('function offlinePlayerTravel(item, map) {', '\n// An NPC token dropped on a portal', 'offlinePlayerTravel');
    const DENY = j({ type: 'travelDenied', reason: 'portal' }), TRAP = 'P stepped on a hidden trap tile that is locked for players: nothing happened, and they were told nothing.';
    const mkL = o => {   // o: at (the token's place), portal (over the locked portal 'po'), travelLocked, playerLock (the destination closed), tokLocked, combat ('theirs')
        o = o || {};
        const clock = { t: 5000000 }, toasts = [], notes = [], bcast = [];
        const tok = Object.assign({ id: 'tok', isChar: true, ownerId: 'u_p', charId: 'c_p', x: o.at ? o.at[0] : 2000, y: o.at ? o.at[1] : 2000, w: 60, h: 52 }, o.tokLocked ? { locked: true } : {});
        const po = Object.assign({ id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52, portalLock: true }, o.portal || {});
        const from = { id: 'm1', type: 'map', meta: { title: 'Here', gridType: 'square' }, rooms: [{ id: 'r1', name: 'Gate', targetMapId: 'm2' }],
            whiteboard: [tok, { id: 'tokq', isChar: true, ownerId: 'u_q', x: 3000, y: 3000, w: 60, h: 52 }, { id: 'orc', isChar: true, x: 4000, y: 4000, w: 60, h: 52 }, po,
                { id: 'po2', targetMapId: 'm2', x: 1000, y: 0, w: 60, h: 52, portalLock: true }, { id: 'poN', nodeId: 'r1', x: 1000, y: 1000, w: 60, h: 52, portalLock: true }, { id: 'open', targetMapId: 'm2', x: 0, y: 1000, w: 60, h: 52 }] };
        const camp = { id: 'c1', activeItemId: 'm1', turnRules: {}, items: { m1: from, m2: { id: 'm2', type: 'map', meta: Object.assign({ title: 'There' }, o.playerLock ? { playerLock: true } : {}), rooms: [], whiteboard: [] } } };
        const cA = mkConn('pA'), cB = mkConn('pB');
        const net = { active: true, role: 'host', paused: false, travelLocked: !!o.travelLocked, roster: { pA: { id: 'u_p', name: 'P', location: 'm1' }, pB: { id: 'u_q', name: 'Q', location: 'm1' } }, conns: [cA, cB], broadcastItemFiltered: (c, i) => bcast.push(i),
            combats: o.combat ? { m1: { mapId: 'm1', round: 1, turn: 1, rows: [{ id: 'r_p', tokId: 'tok' }, { id: 'r_o', tokId: 'orc' }] } } : {} };
        const api = new Function('net', 'peerPaused', 'allow', 'getActiveCampaign', 'turnNote', '_travelDenyLast', 'sendFailed', 'findLandingRoom', 'landingPoint', 'renderRoster', 'broadcastRoster', 'ensurePlayerToken', 'save', 'toast', 'logEvent', 'window', 'npcTravel', 'offlinePlayerTravel', 'pausedById', 'Date',
            ownKeySrc + trSrcL + '\n' + fsL + soL + puL + tcL + tdL + '\nreturn { travel: function(msg, conn) {\n' + tvSrcL + '\n}, drop: function(item, map, gm) { return arguments.length > 2 ? net.tokenDropped(item, map, gm) : net.tokenDropped(item, map); }, direct: hostTravel, bar: travelBar };')(
            net, () => false, () => true, () => camp, (c, t) => notes.push(t), {}, e => { throw e; }, () => null, () => null, () => {}, () => {}, () => {}, () => {}, t => toasts.push(t), () => {}, { wpVtt: { on: () => true } }, () => 'npc', () => 'offline', () => false, { now: () => clock.t });
        const W = { api, net, camp, from, tok, po, cA, cB, toasts, notes, bcast, clock };
        W.ask = (via, c) => { api.travel({ type: 'travel', viaItemId: via || 'po' }, c || cA); return W; };
        W.den = c => (c || cA).sent.filter(m => m.type === 'travelDenied').map(m => j(m));
        W.staged = c => (c || cA).sent.filter(m => m.type === 'stage').length;
        W.loc = () => net.roster.pA.location;
        W.at = () => [tok.x, tok.y];
        return W;
    };
    // (1) a travel request through a locked portal
    const A = mkL(); A.ask(); const a1 = [A.loc(), A.cA.sent.map(m => j(m)), A.toasts.length, A.notes.length, A.at(), A.bcast.length];
    A.clock.t += 3999; A.ask(); const a2 = A.cA.sent.length;                 // within 4 s of the first: nothing more
    A.ask('po2'); const a3 = A.den();                                          // another locked portal: its own word, at once
    A.ask('po', A.cB); const a4 = [A.den(A.cB), A.net.roster.pB.location];    // another player: their own, at once
    A.clock.t += 2; A.ask(); const a5 = A.den();                              // 4001 ms after the first: said again
    A.ask('poN'); const a6 = [A.den().length, A.loc(), A.staged()];           // a portal by the room it is linked to
    check('portal lock (travel, host — the real branch with the real hostTravel and travelBar): a player\'s travel request through a portal the GM locked is refused — nobody moves, no token moves, no map is sent, the GM is told nothing — and that player is sent one travelDenied whose reason is "portal" and nothing else (no map name, no portal id); again within 4 s nothing more is sent, after 4 s it is said again; another locked portal and another player each get their own word at once; a portal locked through the room it is linked to refuses alike',
        j(a1) === j(['m1', [DENY], 0, 0, [2000, 2000], 0]) && a2 === 1 && j(a3) === j([DENY, DENY]) && j(a4) === j([[DENY], 'm1']) && j(a5) === j([DENY, DENY, DENY]) && j(a6) === j([4, 'm1', 0]), j([a1, a2, a3, a4, a5, a6]));
    // (2) a drop on it, as the pos gate calls net.tokenDropped (two arguments)
    const D = mkL({ at: [0, 0] }); const dRet = D.api.drop(D.tok, D.from), d1 = [dRet, D.loc(), D.cA.sent.map(m => j(m)), D.at(), D.toasts.length, D.bcast.length]; D.api.drop(D.tok, D.from); const d2 = D.cA.sent.length;
    const S = mkL({ at: [0, 0] }); S.ask(); S.api.drop(S.tok, S.from); const s1 = S.cA.sent.length; S.clock.t += 4001; S.api.drop(S.tok, S.from); const s2 = S.den().length;
    check('portal lock (a drop, host — the real net.tokenDropped, portalUnder and hostTravel): a player\'s token dropped on a locked portal travels nobody — the token rests where it was dropped (it does not step off), the map is not sent again — and its player is told the same one word; a second drop at once says nothing more; a request and a drop on the same portal share the one word in 4 s, and a drop after that is told again',
        j(d1) === j([false, 'm1', [DENY], [0, 0], 0, 0]) && d2 === 1 && s1 === 1 && s2 === 2, j([d1, d2, s1, s2]));
    // (3) only true locks; an unlocked portal as before
    const notLocks = [undefined, false, 'yes', 1, 'true', {}, [], null].map(v => { const W = mkL({ portal: { portalLock: v }, at: [70, 0] }).ask(); return [W.loc(), W.staged(), W.den().length]; });   // 1.6.3 (finding 2): asked from beside the portal
    const noKey = (() => { const W = mkL({ at: [70, 1000] }).ask('open'); return [W.loc(), W.staged(), W.den().length]; })(), dropOpen = (() => { const W = mkL({ at: [0, 1000] }); return [W.api.drop(W.tok, W.from), W.loc(), W.staged(), j(W.at()) !== j([0, 1000]), W.bcast]; })();
    check('portal lock (host): only true locks — a portal whose flag is false, a word, a number, an object, a list, null or absent lets its player through exactly as before (their location moved, one stage word, no denial), by a request and by a drop (the token steps off the door, the map sent once)',
        notLocks.every(r => j(r) === j(['m2', 1, 0])) && j(noKey) === j(['m2', 1, 0]) && j(dropOpen) === j([true, 'm2', 1, true, ['m1']]), j([notLocks, noKey, dropOpen]));
    // (4) a hidden trap tile that is locked
    const H1 = mkL({ at: [0, 0], portal: { hidden: true, trap: true } }), h1 = [H1.api.drop(H1.tok, H1.from), H1.loc(), H1.cA.sent.length, H1.toasts.slice()];
    const H2 = mkL({ at: [0, 0], portal: { hidden: true, trap: true } }).ask(), h2 = [H2.loc(), H2.cA.sent.length, H2.toasts.length];
    const H3 = mkL({ at: [0, 0], portal: { hidden: true, trap: true, portalLock: false } }), h3 = [H3.api.drop(H3.tok, H3.from), H3.loc(), H3.toasts.filter(t => /trap tile/.test(t)).length];
    const H4 = mkL({ at: [0, 0], portal: { hidden: true } }), h4 = [H4.api.drop(H4.tok, H4.from), H4.cA.sent.length, H4.toasts.length];
    check('portal lock (a hidden trap tile, host): a player\'s drop on a hidden trap tile the GM locked fires nothing and sends that player nothing — no denial, nothing that gives the tile away — while the GM is told what happened in one toast; naming it in a travel request does nothing at all, as for any hidden portal; the same tile unlocked still fires; a hidden locked portal that is no trap stays inert and silent',
        j(h1) === j([false, 'm1', 0, [TRAP]]) && j(h2) === j(['m1', 0, 0]) && j(h3) === j([true, 'm2', 0]) && j(h4) === j([false, 0, 0]), j([h1, h2, h3, h4]));
    // (5) the order: what answered before answers first
    const oT = mkL({ travelLocked: true }).ask(), oC = mkL({ playerLock: true }).ask();
    const oTq = mkL({ at: [0, 0], travelLocked: true, portal: { hidden: true, trap: true } }), oCq = mkL({ at: [0, 0], playerLock: true, portal: { hidden: true, trap: true } }); oTq.api.drop(oTq.tok, oTq.from); oCq.api.drop(oCq.tok, oCq.from);
    const oK = mkL({ tokLocked: true }).ask(), oF = mkL({ combat: 'theirs' }).ask();
    const oNowhere = [{ targetMapId: 'nope' }, { targetMapId: 'm1' }, { targetMapId: '__proto__' }].map(p => { const W = mkL({ portal: p }).ask(); return [W.loc(), W.cA.sent.length, W.toasts.length]; });
    const iT = trSrcL.indexOf('    if (net.travelLocked) {'), iC = trSrcL.indexOf('    if (destLockM.meta && destLockM.meta.playerLock) {'), iB = trSrcL.indexOf('    var barT = gmHand === true ? null : travelBar(traveler, portal, fromMap, destLockM);'), iGo = trSrcL.indexOf('    traveler.location = pRoom.targetMapId;');
    check('portal lock (the order, host): a locked portal answers last — with Lock travel between maps on its player gets that lock\'s word (a travelDenied with no reason), with its destination closed to players the closed word naming the map, and a hidden locked trap tile gives the GM those locks\' own toasts; a token the GM locked and a turn that is not theirs keep their player on the map with their own line before any portal is asked; a locked portal that leads nowhere, to its own map or to a prototype\'s name moves nobody and says nothing, as an unlocked one; in hostTravel the three refusals stand in that order, all before anything is moved',
        j(oT.cA.sent.map(m => j(m))) === j([j({ type: 'travelDenied' })]) && j(oC.cA.sent.map(m => j(m))) === j([j({ type: 'travelDenied', reason: 'closed', map: 'There' })])
        && j(oTq.toasts) === j(['P stepped on a hidden trap tile, but travel is locked: nothing happened, and they were told nothing.']) && j(oCq.toasts) === j(['P stepped on a hidden trap tile to There, which is closed to players: nothing happened, and they were told nothing.']) && oTq.cA.sent.length === 0 && oCq.cA.sent.length === 0
        && j([oK.notes, oK.cA.sent.length, oK.loc()]) === j([['The GM has locked your token: you cannot leave this map.'], 0, 'm1']) && j([oF.notes, oF.cA.sent.length, oF.loc()]) === j([['It is not your turn: you cannot leave this map yet.'], 0, 'm1'])
        && oNowhere.every(r => j(r) === j(['m1', 0, 0])) && iT > 0 && iC > iT && iB > iC && iGo > iB, j([oT.cA.sent, oC.cA.sent, oTq.toasts, oCq.toasts, oK.notes, oF.notes, oNowhere, [iT, iC, iB, iGo]]));
    // (6) the GM's own hand: the board's own drop of a connected player's token (net.tokenDropped's third argument, true only)
    const G1 = mkL({ at: [0, 0] }), g1 = [G1.api.drop(G1.tok, G1.from, true), G1.loc(), G1.staged(), G1.den().length, j(G1.at()) !== j([0, 0]), G1.po.portalLock];
    const gNot = ['yes', 1, {}, 'true', false, undefined, null, []].map(v => { const W = mkL({ at: [0, 0] }); return [W.api.drop(W.tok, W.from, v), W.loc(), W.den().length]; });
    const gDirect = ['yes', 1, {}, undefined].map(v => { const W = mkL(); return [W.api.direct(W.cA, W.net.roster.pA, W.po, W.from, v), W.loc()]; }), gDirectT = (() => { const W = mkL(); return [W.api.direct(W.cA, W.net.roster.pA, W.po, W.from, true), W.loc()]; })();
    const G2 = mkL({ at: [0, 0], travelLocked: true }), g2 = [G2.api.drop(G2.tok, G2.from, true), G2.loc(), G2.cA.sent.map(m => j(m))], G3 = mkL({ at: [0, 0], playerLock: true }), g3 = [G3.api.drop(G3.tok, G3.from, true), G3.loc(), G3.cA.sent.map(m => j(m))];
    const G4 = mkL({ at: [0, 0], portal: { hidden: true, trap: true } }), g4 = [G4.api.drop(G4.tok, G4.from, true), G4.loc(), G4.toasts.filter(t => /trap tile/.test(t)).length];
    const dmT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'datamap.js'), 'utf8').replace(/\r\n/g, '\n');
    const callsOf = f => (fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'latin1').match(/tokenDropped\([^)]*\)/g) || []);
    const allCalls = fs.readdirSync(path.join(__dirname, '..', 'system', 'app', 'scripts')).filter(f => /\.js$/.test(f)).reduce((a, f) => a.concat(callsOf(f).map(c => f + ':' + c)), []).sort();
    check('portal lock (the GM\'s own hand, host): the GM dropping a connected player\'s token on a locked portal sends that player through — their location moved, one stage word, no denial, the token stepped off, the portal still locked — because net.tokenDropped was told it is the GM\'s hand; only true says so (a word, a number, an object, false or nothing is judged as a player\'s drop, by net.tokenDropped and by hostTravel itself); the two older locks still stop the GM\'s drop as before; a hidden locked trap tile fires for the GM\'s hand with no toast',
        j(g1) === j([true, 'm2', 1, 0, true, true]) && gNot.every(r => j(r) === j([false, 'm1', 1])) && gDirect.every(r => j(r) === j([false, 'm1'])) && j(gDirectT) === j([true, 'm2'])
        && j(g2) === j([false, 'm1', [j({ type: 'travelDenied' })]]) && j(g3) === j([false, 'm1', [j({ type: 'travelDenied', reason: 'closed', map: 'There' })]]) && j(g4) === j([true, 'm2', 0]), j([g1, gNot, gDirect, gDirectT, g2, g3, g4]));
    check('portal lock (the GM\'s own hand, source): the word that it is the GM\'s hand is given in one place, the board\'s own drag on this machine (datamap.js), and by no message — the pos gate calls net.tokenDropped with a player\'s token and its map alone, the travel branch calls hostTravel with four arguments, and net.tokenDropped hands hostTravel true only for true',
        j(allCalls) === j(['datamap.js:tokenDropped(item, am, true)', 'net.js:tokenDropped(w, map)']) && /var traveled = !!\(window\.wpNet && window\.wpNet\.tokenDropped && window\.wpNet\.tokenDropped\(item, am, true\)\);/.test(dmT)
        && /\n            net\.tokenDropped\(w, map\);   \/\/ landed on a portal\? the player travels\n/.test(src) && tvSrcL.includes('        hostTravel(conn, traveler, portal, fromMap);\n') && src.includes('    return hostTravel(conn, net.roster[peerId], portal, map, gmHand === true);\n')
        && (src.match(/hostTravel\(/g) || []).length === 3, j(allCalls));
    // (7) the GM's other hands, run for real with a locked portal under the token: an NPC walked through, an absent player's token walked through
    const runGm = (kind, lock) => {
        const tokG = kind === 'npc' ? { id: 'npc1', type: 'image', isChar: true, charName: 'Lurker', x: 0, y: 0, w: 60, h: 52 } : { id: 'pc1', type: 'image', isChar: true, charName: 'Ayla', ownerId: 'u_away', x: 0, y: 0, w: 60, h: 52 };
        const fromG = { id: 'm1', type: 'map', meta: { title: 'Here' }, rooms: [], whiteboard: [tokG, Object.assign({ id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }, lock ? { portalLock: true } : {})] };
        const destG = { id: 'm2', type: 'map', meta: { title: 'There' }, rooms: [], whiteboard: [] }, campG = { id: 'c1', items: { m1: fromG, m2: destG }, players: {} }, toastsG = [];
        const netG = { active: kind === 'npc', role: 'host', paused: false, travelLocked: false, roster: {}, conns: [], broadcastItemFiltered: () => {} };
        let ret;
        try {
            ret = new Function('getActiveCampaign', 'net', 'sendFailed', 'findLandingRoom', 'landingPoint', 'freeSpotNear', 'save', 'toast', 'window', 'SC', 'pausedById', 'sheetsOnFor', 'tokenFromChar', 'hostTravel', 'item', 'map',
                ownKeySrc + soL + puL + tdL + ofL + '\n' + npL + '\nreturn net.tokenDropped(item, map, true);')(() => campG, netG, () => {}, () => null, () => null, () => ({ x: 100, y: 100 }), () => {}, t => toastsG.push(t), {}, () => null, () => false, () => false, () => null, () => { throw new Error('hostTravel asked'); }, tokG, fromG);
        } catch (e) { ret = 'threw: ' + e.message; }
        return [ret, destG.whiteboard.map(w => w.charName), toastsG.length, fromG.whiteboard[1].portalLock === true];
    };
    const stSrcL = between('// [netcheck:stage-start]', '// [netcheck:stage-end]', 'stage');
    const runStage = () => { const c = mkConn('pA'), made = [], netS = { roster: { pA: { id: 'u_p', name: 'P', location: 'm1', detached: true } }, conns: [c] };
        const apiS = new Function('net', 'own', 'ensurePlayerToken', 'sendFailed', stSrcL + '\nreturn { summonConn: summonConn, followConns: followConns };')(netS, H.own, (pid, mid) => made.push([pid, mid]), () => {});
        const p = apiS.summonConn(c, { campId: 'c1', itemId: 'm2' }); netS.roster.pA.detached = false; const moved = apiS.followConns({ campId: 'c1', itemId: 'm3' });
        return [p && p.location === 'm3', c.sent.map(m => m.type + ':' + (m.stage && m.stage.itemId) + ':' + (m.personal === true)), made, moved]; };
    const wholeN = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, e); };
    const gmSrc = [stSrcL, npL, ofL, wholeN('net.summonPlayer = function('), wholeN('net.summonPlayerById = function('), wholeN('net.summonPlayerToMap = function('), wholeN('net.summonAllToMap = function('), wholeN('net.bringPlayerHere = function(')].join('\n');
    check('portal lock (the GM\'s own actions, run for real): an NPC the GM drops on a locked portal walks through (npcTravel) and an absent player\'s token the GM drops on one is walked through (offlinePlayerTravel) exactly as on an unlocked one — a token placed on the far map, the GM\'s toast, the portal still locked, hostTravel never asked; a summon and the table\'s follow put a player on a map through the stage alone (stageConn, run for real), which reads no portal; none of them, nor Bring, names the lock, the judge or the GM\'s-hand word',
        j(runGm('npc', true)) === j([true, ['Lurker'], 1, true]) && j(runGm('npc', false)) === j([true, ['Lurker'], 1, false]) && j(runGm('away', true)) === j([true, ['Ayla'], 1, true]) && j(runGm('away', false)) === j([true, ['Ayla'], 1, false])
        && j(runStage()) === j([true, ['stage:m2:true', 'stage:m3:false'], [['u_p', 'm2'], ['u_p', 'm3']], 1]) && !/portalLock|travelBar|gmHand/.test(gmSrc), j([runGm('npc', true), runGm('away', true), runStage()]));
    // (8) the seam: one function, one caller
    // 1.6.3 (finding 2): a token of the player's stands beside the portal (no core in this run: the box rule), so only the locks answer here
    const BTOK = () => [{ id: 'tb', isChar: true, ownerId: 'u_p', x: 70, y: 0, w: 60, h: 52 }], BMAP = m => Object.assign({ whiteboard: BTOK() }, m), BPO = p => p && typeof p === 'object' ? Object.assign({ x: 0, y: 0, w: 60, h: 52 }, p) : p;
    const barOf = (p, m) => new Function(barSrcL + '\nreturn travelBar;')()({ id: 'u_p' }, BPO(p), BMAP(m || { id: 'm1', meta: {} }), { id: 'm2' }), HEREB = j({ reason: 'here', gm: 'on a map that is locked for players' }), LM = { id: 'm1', meta: { playerLock: true } };
    // Where net.js names the flag, place by place: the player's cleaner (asked, compared, deleted: three), the host's rule for a piece on its way
    // out (the same three, and since the third review of fold B5 one delete more, on a plain wall, which leads nowhere) and the judge (once).
    // That one delete more is why the count moved from seven to eight: a lock left on a wall by a way through that is gone is not sent
    const plCount = t => (t.match(/\.portalLock/g) || []).length, wireSrcL = fnSrc('function wireWbItem(', '\n}\n', 'wireWbItem'), plSaid = [plCount(src), plCount(lineOf('function cleanHostWbItem(w) {')), plCount(wireSrcL), plCount(barSrcL), (src.match(/delete w\.portalLock/g) || []).length];
    const plWall = wireSrcL.includes('    if (w.portalLock !== undefined && w.portalLock !== true) delete w.portalLock;') && (wireSrcL.match(/delete w\.portalLock/g) || []).length === 2;   // the rule that sends it only as true, and one delete more. Which piece that delete reaches is held by a run of the real code: 'portal lock (host, the wire, a wall)'
    check('portal lock (the seam, travelBar run for real): the one function that answers whether a player may travel through a portal now — null for a portal that is not locked (a word, a number or nothing is no lock; no portal at all), the map the player stands on being locked for players answering first with its own reason whatever the portal says (closed both ways; a map with no lock, no meta or a lock taken off answers nothing), else the reason the denial carries and what the GM is told of a trap tile; it is defined once and asked in one place, hostTravel; the flag is named by nothing else in net.js but the two wire cleaners. The judge reads it once. The player\'s cleaner keeps it only as true. The host\'s rule for a piece on its way out sends it only as true, and takes it off a plain wall, a wall that leads to no map and hangs on no room: eight mentions in all, three of them deletes',
        barOf({ id: 'po', portalLock: true }) !== null && j(barOf({ id: 'po', portalLock: true })) === j({ reason: 'portal', gm: 'that is locked for players' }) && [{ id: 'po' }, { id: 'po', portalLock: 'yes' }, { id: 'po', portalLock: 1 }, { id: 'po', portalLock: false }].every(p => barOf(p) === null)
        && j(barOf({ id: 'po' }, LM)) === HEREB && j(barOf({ id: 'po', portalLock: true }, LM)) === HEREB && j(barOf(null, LM)) === HEREB && [{ id: 'm1' }, { id: 'm1', meta: {} }, { id: 'm1', meta: { playerLock: false } }, { id: 'm1', meta: { playerLock: 0 } }].every(m => barOf({ id: 'po' }, m) === null)
        && (src.match(/travelBar\(/g) || []).length === 2 && (src.match(/function travelBar\(traveler, portal, fromMap, destMap\) \{/g) || []).length === 1 && j(plSaid) === j([8, 3, 4, 1, 3]) && plWall, j([plSaid, plWall, barOf({ id: 'po', portalLock: true }), (src.match(/travelBar\(/g) || []).length]));
    // (9) the player's words
    const tdI = src.indexOf("} else if (msg.type === 'travelDenied' && net.role === 'client') {"), tdCli = src.slice(tdI, src.indexOf("} else if (msg.type === 'travel' && net.role === 'host') {", tdI));
    const sayD = (msg, host) => { const out = []; new Function('msg', 'conn', 'net', 'fromHost', 'toast', 'if (false) {\n' + tdCli + '\n}')(Object.assign({ type: 'travelDenied' }, msg), { peer: 'h' }, { role: 'client' }, () => host !== false, t => out.push(t)); return out; };
    const LOCKED = 'That way is locked. The GM will unlock it when the time comes.', ALLT = 'Travel between maps is locked right now. The GM will open it when the time comes.', HOSTILE = '<img src=x onerror=alert(1)>';
    check('portal lock (client, the travelDenied branch run for real): the reason "portal" is said in fixed words of the app\'s own — nothing of the message in them, whatever else a host puts beside the reason; the closed map\'s words and the travel lock\'s are as before, and any other reason (a list, an object, another word) reads as the travel lock\'s; from anyone but the synced host nothing is said',
        tdI > 0 && j(sayD({ reason: 'portal' })) === j([LOCKED]) && j(sayD({ reason: 'portal', map: HOSTILE, text: HOSTILE, portal: HOSTILE })) === j([LOCKED]) && j(sayD({ reason: 'closed', map: 'Cellar' })) === j(["Cellar isn't open yet. The GM will let you through when it's time."])
        && j(sayD({})) === j([ALLT]) && [['portal'], { portal: 1 }, 'Portal', 'portal ', 'zzz', 1, true].every(r => j(sayD({ reason: r })) === j([ALLT])) && j(sayD({ reason: 'portal' }, false)) === '[]', j([sayD({ reason: 'portal' }), sayD({}), sayD({ reason: ['portal'] })]));
    // (9b) a locked map is closed both ways (the owner, 2026-10-03, by prompt): no player leaves a map locked for players through a portal
    const HERE = j({ type: 'travelDenied', reason: 'here' }), HEREW = 'This map is locked. Nobody leaves it until the GM opens it.', TRAPH = 'P stepped on a hidden trap tile on a map that is locked for players: nothing happened, and they were told nothing.';
    const mkH = o => { const W = mkL(Object.assign({ portal: { portalLock: false } }, o || {})); W.from.meta.playerLock = true; return W; };
    const L1 = mkH({ at: [70, 0] }).ask(), l1 = [L1.loc(), L1.cA.sent.map(m => j(m)), L1.toasts.length, L1.notes.length, L1.staged(), L1.at(), L1.bcast.length];   // 1.6.3 (finding 2): from beside the portal, so that the lock taken off lets them through
    L1.clock.t += 3999; L1.ask(); const l3 = L1.cA.sent.length; L1.ask('open'); const l4 = L1.den();   // the same portal within 4 s: nothing more; another portal of the map: its own word
    delete L1.from.meta.playerLock; L1.ask(); const l5 = [L1.loc(), L1.staged()];                       // unlocked: through at once
    const L2 = mkH({ at: [0, 0] }), l2 = [L2.api.drop(L2.tok, L2.from), L2.loc(), L2.den(), L2.at(), L2.bcast.length];
    const L6 = mkL(); L6.from.meta.playerLock = true; L6.ask(); const l6a = L6.den(); delete L6.from.meta.playerLock; L6.ask(); const l6b = L6.den();   // the map and the portal both locked: the map's word; the map unlocked, the portal's own word at once — the two reasons share no 4 s window
    const L7 = mkH({ at: [0, 0] }), l7 = [L7.api.drop(L7.tok, L7.from, true), L7.loc(), L7.staged(), L7.den().length];   // the GM's own hand
    const L8 = mkH({ at: [0, 0], portal: { hidden: true, trap: true, portalLock: false } }), l8 = [L8.api.drop(L8.tok, L8.from), L8.loc(), L8.cA.sent.length, L8.toasts.slice()];
    const L9a = mkH({ travelLocked: true }).ask(), L9b = mkH({ playerLock: true }).ask(), L9c = mkH({ tokLocked: true }).ask();
    const notHere = [false, 0, '', null, 'none'].map(v => { const W = mkL({ portal: { portalLock: false }, at: [70, 0] }); if (v !== 'none') W.from.meta.playerLock = v; W.ask(); return [W.loc(), W.den().length]; });
    const npH = (() => { const W = mkH({ at: [0, 0] }); return [W.api.direct(W.cA, W.net.roster.pA, W.po, W.from, true), W.loc()]; })();
    check('a locked map is closed both ways (the owner, 2026-10-03; host — the real travel branch, net.tokenDropped, hostTravel and travelBar): a player on a map locked for players is refused at every portal of it, by a travel request and by a drop — nobody moves, no token moves, nothing is sent but one travelDenied whose reason is "here" and nothing else, the GM told nothing; again within 4 s nothing more, another portal its own word; the lock taken off, they travel at once. A map and a portal both locked: the map answers first, and with the map unlocked the portal\'s own word comes at once (the two reasons share no window). The GM\'s own hand passes; a hidden trap tile on a locked map tells its player nothing and the GM in one toast; Lock travel between maps, a closed destination and a locked token answer before it; a lock that is false, 0, empty, null or absent holds nobody',
        j(l1) === j(['m1', [HERE], 0, 0, 0, [70, 0], 0]) && l3 === 1 && j(l4) === j([HERE, HERE]) && j(l5) === j(['m2', 1]) && j(l2) === j([false, 'm1', [HERE], [0, 0], 0])
        && j(l6a) === j([HERE]) && j(l6b) === j([HERE, DENY]) && j(l7) === j([true, 'm2', 1, 0]) && j(npH) === j([true, 'm2']) && j(l8) === j([false, 'm1', 0, [TRAPH]])
        && j(L9a.cA.sent.map(m => j(m))) === j([j({ type: 'travelDenied' })]) && j(L9b.cA.sent.map(m => j(m))) === j([j({ type: 'travelDenied', reason: 'closed', map: 'There' })]) && j([L9c.notes, L9c.cA.sent.length]) === j([['The GM has locked your token: you cannot leave this map.'], 0])
        && notHere.every(r => j(r) === j(['m2', 0])), j([l1, l2, l3, l4, l5, l6a, l6b, l7, npH, l8, L9a.cA.sent, L9b.cA.sent, L9c.notes, notHere]));
    check('a locked map (client, the travelDenied branch run for real): the reason "here" is said in fixed words of the app\'s own, nothing of the message in them; from anyone but the synced host nothing is said',
        j(sayD({ reason: 'here' })) === j([HEREW]) && j(sayD({ reason: 'here', map: HOSTILE, text: HOSTILE })) === j([HEREW]) && j(sayD({ reason: 'here' }, false)) === '[]' && ['Here', 'here ', ['here']].every(r => j(sayD({ reason: r })) === j([ALLT])), j([sayD({ reason: 'here' })]));
    // (9c) a hidden trap tile that cannot fire tells the GM at most once in 4 s per player and tile, under each lock (a token resting on one sends a
    // final for every turn in place)
    const tq = W => { const n0 = W.toasts.length; W.api.drop(W.tok, W.from); const n1 = W.toasts.length; W.clock.t += 4001; W.api.drop(W.tok, W.from); return [n0, n1, W.toasts.length, W.cA.sent.length]; };
    const tqGot = [tq(H1), tq(oTq), tq(oCq), tq(L8)], srcHT = trSrcL;
    const T2 = mkL({ at: [0, 0], portal: { hidden: true, trap: true } }); Object.assign(T2.from.whiteboard.find(w => w.id === 'po2'), { hidden: true, trap: true });
    T2.api.drop(T2.tok, T2.from); T2.tok.x = 1000; T2.tok.y = 0; T2.api.drop(T2.tok, T2.from); const t2a = T2.toasts.length; T2.api.drop(T2.tok, T2.from); const t2 = [t2a, T2.toasts.length, T2.cA.sent.length];   // another tile: its own toast at once; that tile again: nothing
    check('a hidden trap tile that cannot fire (host): the GM is told once, and not again for a drop within 4 s — under the tile\'s own lock, Lock travel between maps, a closed destination and a locked map alike — and again after 4 s; another tile is told of at once (the spacing is per player and tile); its player is never told; every such toast goes through the one spaced helper',
        tqGot.every(r => j(r) === j([1, 1, 2, 0])) && j(t2) === j([2, 2, 0]) && (srcHT.match(/if \(quiet\) trapToast\(traveler, portal, /g) || []).length === 3 && !/if \(quiet\) toast\(/.test(srcHT) && /function trapToast\(traveler, portal, text\) \{/.test(srcHT), j(tqGot));
    // (10) Help, the tour and the integration guide
    const rdL = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'), idxL = rdL('system/app/index.html'), tutL = rdL('system/app/scripts/tutorial.js'), guideL = rdL('CAMPAIGN_INTEGRATION.md'), helpL = idxL.slice(idxL.indexOf('id="helpModal"'));
    check('portal lock (Help and the guide): Help names the three locks side by side and says what each does — a map closed to arriving players, all travel, one portal — with where a portal\'s lock is set (the play map\'s right-click menu, or its Properties), what players see and are told, and that it stops neither a summon, Bring nor the GM\'s own drop; the trap tile\'s line names the tile\'s own lock; the player\'s Doors and stairs line says what the small lock means; the guide lists portalLock (true only, with a shown portal, never stopping the GM); the menu, the tick and the button are worded as Help words them',
        /<li><b>Three locks on travel\.<\/b> Each stops players at a different place\. None of the three stops a summon, Bring or the table following your map, and your own characters walk through any portal\./.test(helpL) && /<li><b>Lock for players<\/b> on a map closes that map both ways\. Right-click the map in the Maps list to set it\. Every portal into it refuses players, who are told the map isn&rsquo;t open yet\. No player who is on it leaves it through a portal: they are told <i>This map is locked<\/i>\.<\/li>/.test(helpL) && /<li><b>Lock travel between maps<\/b>, in the Multiplayer panel, stops all travel by players, on every map, until you allow it again\.<\/li>/.test(helpL) && /<li><b>Locked for players<\/b> on a portal locks that one portal\. Right-click the portal on the play map &#9656; <b>Lock portal for players<\/b>, or tick <b>Locked for players<\/b> in its Properties\.[^\n]*until you pick <b>Unlock portal<\/b>\. Every other way off the map stays as it was\.<\/li>/.test(helpL) && /<li>You and your players see a small <i class="wib wi-lock"><\/i> beside a locked portal&rsquo;s marker, and its hover says it is locked\. A player who tries is told <i>That way is locked<\/i>\.<\/li>/.test(helpL) && /<li>Your own hand passes a portal&rsquo;s lock, and a locked map&rsquo;s hold on the players in it\. Dropping a player&rsquo;s token on a portal you locked, or on any portal of a locked map, sends them through\. A closed destination and Lock travel between maps still stop that drop\.<\/li>/.test(helpL) && /<li>A portal&rsquo;s lock is the piece&rsquo;s own: where two pieces lead through the same room, lock each\.<\/li>/.test(helpL)
        && /A <b>locked destination map<\/b>, locked travel or the tile&rsquo;s own lock still stops it, silently: the player is told nothing, and you are told\./.test(helpL) && /<li><b>Doors &amp; stairs:<\/b>[^\n]*A portal with a small <i class="wib wi-lock"><\/i> beside its marker is locked by your GM: it lets you through once they unlock it\.<\/li>/.test(helpL)
        && /<li>The GM can send a player through by dropping that player's token there\.<\/li>\s*<li>A portal you locked for players still lets your own drop through\.<\/li>/.test(helpL) && /<li><b>Split party:<\/b> a player can double-click a door or stairs portal to move to that map alone\. Their token must stand on it or next to it first, with no wall or closed door between\. That fails where you locked that portal, the map it leads to, the map they are on or all travel: see <b>Three locks on travel<\/b>\./.test(helpL)
        && /may carry `portalLock: true` \(1\.5\.1, the GM's \*\*Locked for players\*\*; only `true` counts, any other value is dropped on import\): no player travels through it, by double-click or by dropping their token on it, until the GM unlocks it\. It travels to players with a shown portal, so their board shows a small lock on it, and never with a hidden one\. It never stops the GM: a summon, Bring, an NPC walked through and the GM's own drop of a player's token all pass\. On an item that is no portal the key does nothing\. A map's own `meta\.playerLock: true` \(the GM's \*\*Lock for players\*\* in the Maps list\) closes that map both ways \(1\.5\.0\): no player travels to it, and no player who is on it leaves it through a portal; the GM's summon, Bring and own drop still move them\./.test(guideL)
        && /si-lock" title="Locked for players — closed both ways until you unlock it: no player travels here, and no player who is here leaves through a portal \(your summon and Bring still move them\)\. A player who is not here holds only its name/.test(rdL('system/app/scripts/sidebar.js')) && /id="ctxLockItem"[^\n]*title="A locked map is closed both ways: players cannot travel to it — portals, warps and room links into it are refused — and players who are on it cannot leave it through a portal\. You can still summon or bring them\./.test(idxL)
        && /id="ctxLockItem"[^\n]*><i class="wib wi-lock"><\/i> Lock for players<\/div>/.test(idxL) && /id="netTravelLockBtn"[^\n]*><i class="wib wi-unlock"><\/i> Lock travel between maps<\/button>/.test(idxL) /* 1.6.2, backlog 230: the padlock shows how travel stands, open until it is locked, moved on purpose */
        && /'<i class="wib wi-door"><\/i> Lock portal for players' : '<i class="wib wi-door"><\/i> Unlock portal'/.test(rdL('system/app/scripts/whiteboard.js')) && /<label for="wbPortalLock"><i class="wib wi-lock"><\/i> Locked for players<\/label>/.test(rdL('system/app/scripts/inspector.js')), j([helpL.indexOf('Three locks on travel'), tutL.indexOf('there are three locks'), guideL.indexOf('portalLock')]));
}
// hidden pieces: an NPC the GM walks through a portal hidden arrives hidden (npcTravel, run for real with the real sanitizeItem): players see nothing of it on either map
{
    const npSrc = fnSrc('function npcTravel(item, map) {', '\n// [netcheck:pos-start]', 'npcTravel'), puSrcN = fnSrc('function portalUnder(item, map) {', '\n}\n', 'portalUnder') + '\n}\n', tdSrcN = fnSrc('net.tokenDropped = function(item, map, gmHand) {', '\n};\n', 'tokenDropped') + '\n};\n';
    const fxA2 = src.indexOf('// Conditions C1 (docs/CONDITIONS_PLAN.md): the effects the table sees'), fxB2 = src.indexOf('/* ---------- fog of war (1.5.0 FV2): per-recipient creature drop');
    const runNpc = o => {   // the GM's NPC (no owner) dropped on a visible portal to m2; o.hidden: it is hidden; o.there: m2 already holds a left-behind copy of its name, hidden
        const npc = Object.assign({ id: 'npc1', type: 'image', isChar: true, charName: 'Lurker', gmInfo: 'secret', x: 0, y: 0, w: 60, h: 52 }, o.hidden ? { hidden: true } : {});
        const from = { id: 'm1', type: 'map', meta: { title: 'Here' }, rooms: [], whiteboard: [npc, { id: 'po', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }] };
        const dest = { id: 'm2', type: 'map', meta: { title: 'There' }, rooms: [], whiteboard: o.there ? [{ id: 'old', type: 'image', isChar: true, charName: 'Lurker', hidden: true, x: 500, y: 500, w: 60, h: 52 }] : [] };
        const camp = { id: 'c1', items: { m1: from, m2: dest } }, toasts = [], sentMaps = [];
        const netN = { active: true, role: 'host', paused: false, roster: {}, conns: [], broadcastItemFiltered: (c, m) => sentMaps.push(m) };
        const ret = new Function('getActiveCampaign', 'net', 'sendFailed', 'findLandingRoom', 'landingPoint', 'freeSpotNear', 'stepOffPortal', 'save', 'toast', 'window', 'SC', 'offlinePlayerTravel', 'pausedById', 'item', 'map',
            ownKeySrc + puSrcN + '\n' + tdSrcN + '\n' + npSrc + '\nreturn net.tokenDropped(item, map);')(() => camp, netN, () => {}, () => null, () => null, () => ({ x: 100, y: 100 }), () => {}, () => {}, t => toasts.push(t), {}, () => null, () => 'offline', () => false, npc, from);
        const SI = new Function('net', 'getActiveCampaign', 'SC', 'own', 'window', "'use strict';\n" + siSrc() + '\n' + src.slice(fxA2, fxB2) + '\nreturn sanitizeItem;')(netN, () => camp, () => null, H.own, {});
        const wire = [SI(from), SI(dest)];
        return { ret, there: dest.whiteboard.map(w => w.charName + ':' + (w.hidden === true)), here: npc.hidden === true, wire: wire.map(m => m.whiteboard.map(w => w.id)), raw: j(wire), toasts, sentMaps };
    };
    const nH = runNpc({ hidden: true }), nV = runNpc({}), nHT = runNpc({ hidden: true, there: true }), nVT = runNpc({ there: true });
    check('hidden pieces (npcTravel, run for real): a hidden NPC the GM drops on a portal arrives on the far map as a hidden copy and the one left behind stays hidden — neither map\'s copy for players holds either (no id, no name, no GM note); a shown NPC arrives shown as ever; where the far map already holds a hidden copy of its name, a hidden NPC walking through leaves it hidden and a shown one shows it; the toast says which',
        j([nH.ret, nH.there, nH.here, nH.wire]) === j([true, ['Lurker:true'], true, [['po'], []]]) && !/Lurker|npc1|secret|hidden/.test(nH.raw) && j(nH.toasts) === j(['Lurker goes through to There. A token is placed there, hidden as this one was; the one here is hidden from players.']) && j(nH.sentMaps) === j(['m1', 'm2'])
        && j([nV.ret, nV.there, nV.here]) === j([true, ['Lurker:false'], true]) && nV.wire[1].length === 1 && /Lurker/.test(nV.raw) && j(nV.toasts) === j(['Lurker goes through to There. A token is placed there; the one here is hidden from players.'])
        && j([nHT.ret, nHT.there, nHT.wire]) === j([true, ['Lurker:true'], [['po'], []]]) && j(nHT.toasts) === j(['Lurker goes through to There. The token there stays hidden; the one here is hidden from players.'])
        && j([nVT.ret, nVT.there, nVT.wire[1]]) === j([true, ['Lurker:false'], ['old']]) && j(nVT.toasts) === j(['Lurker goes through to There. The token there is shown; the one here is hidden from players.']), j([nH, nV, nHT, nVT]));
}
// hidden pieces: a player's door request naming a hidden door (an id their app remembers) answers nothing and opens nothing; a visible door beside their token opens (the real branch and fogcore)
pendingChecks.push((async () => {
    const FCd = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/'));
    const drSrc = between('// [netcheck:doorreq-start]', '// [netcheck:doorreq-end]', 'doorreq'), moveModeD = new Function(lineOf('function moveMode(') + '\nreturn moveMode;')();   // the real walls rule reader
    const runDoor = (doorOver, o) => {
        o = o || {};
        const door = Object.assign({ id: 'dr', type: 'rect', blocksSight: true, sightType: 'door', x: 50, y: 50, w: 50, h: 50 }, doorOver), tok = Object.assign({ id: 'tk', isChar: true, ownerId: 'u_p', x: 100, y: 50, w: 50, h: 50 }, o.tok || {});
        const map = { id: 'm1', type: 'map', meta: o.meta || { gridType: 'square' }, fog: { on: true }, whiteboard: [door, tok] }, out = { sent: [], saves: 0, redraws: 0 };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.sent.push(JSON.parse(j(m))); } };
        const netD = { role: 'host', active: true, paused: false, roster: { pA: { id: 'u_p', location: 'm1' } } };
        new Function('msg', 'conn', 'net', 'peerPaused', 'window', '_doorLimit', 'sendFailed', 'getActiveCampaign', 'getActiveMap', 'save', 'toast', 'moveMode', drSrc)(
            { type: 'door-req', mapId: 'm1', itemId: o.itemId || 'dr' }, conn, netD, () => false, { wpVtt: { on: k => !(o.fogOff && k === 'fog') }, wpDiceCore: null, wpFogCore: FCd, wpFog: { redraw: () => { out.redraws++; } } }, null, e => { throw e; }, () => ({ id: 'c1', turnRules: o.rules, items: { m1: map } }), () => map, () => { out.saves++; }, () => {}, moveModeD);
        return { open: door.doorOpen === true, sent: out.sent.map(m => m.type + ':' + m.reason), saves: out.saves };
    };
    check('hidden pieces (door-req, run for real with the real fogcore): a player\'s request naming a visible door next to their token opens it (saved, nothing sent); one naming a hidden door — locked or not, hidden as true or as 1 — opens nothing, saves nothing and answers nothing, like one naming nothing on the map; a visible locked door still answers locked',
        j(runDoor({})) === j({ open: true, sent: [], saves: 1 }) && j(runDoor({ hidden: true })) === j({ open: false, sent: [], saves: 0 }) && j(runDoor({ hidden: true, doorLock: true })) === j({ open: false, sent: [], saves: 0 }) && j(runDoor({ hidden: 1 })) === j({ open: false, sent: [], saves: 0 })
        && j(runDoor({}, { itemId: 'nope' })) === j({ open: false, sent: [], saves: 0 }) && j(runDoor({ doorLock: true })) === j({ open: false, sent: ['door-deny:locked'], saves: 0 }), j([runDoor({}), runDoor({ hidden: true }), runDoor({ doorLock: true })]));
    // 1.5.9 (the owner's game of 2026-10-25): a player's door works on the map the player stands on, whichever map the GM's screen shows. The
    // branch used to drop every request for a map that was not the GM's active one ("only the GM's current map"): that pin is moved on purpose.
    // A map the GM is not viewing is judged on that map, toggled there, saved, and sent to its holders through net.sendItem (per recipient,
    // possession-held, as any change to that map); the GM's own overlay is drawn again only where that map is on screen
    const runAway = (o) => {
        o = o || {};
        const door = { id: 'dr', type: 'rect', blocksSight: true, sightType: 'door', x: 50, y: 50, w: 50, h: 50 }, tok = { id: 'tk', isChar: true, ownerId: 'u_p', x: o.far ? 400 : 100, y: 50, w: 50, h: 50 };
        const m2 = { id: 'm2', type: 'map', meta: { gridType: 'square' }, fog: { on: true }, whiteboard: [door, tok] }, m1 = { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: [] };
        const out = { sent: [], saves: 0, redraws: 0, items: [], seen: [] };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.sent.push(JSON.parse(j(m))); } };
        const netD = { role: 'host', active: true, paused: false, roster: { pA: { id: 'u_p', location: o.at || 'm2' } }, sendItem: (c, i) => out.items.push(c + '/' + i) };
        const items = Object.create(null); items.m1 = m1; items.m2 = m2; if (o.stub) m2.stub = true;
        new Function('msg', 'conn', 'net', 'peerPaused', 'window', '_doorLimit', 'sendFailed', 'getActiveCampaign', 'getActiveMap', 'save', 'toast', 'moveMode', drSrc)(
            { type: 'door-req', mapId: o.mapId || 'm2', itemId: 'dr' }, conn, netD, () => false, { wpVtt: { on: () => true }, wpDiceCore: null, wpFogCore: FCd, wpFog: { redraw: () => { out.redraws++; }, invalidateSeen: id => out.seen.push(id) } }, null, e => { throw e; }, () => ({ id: 'c1', items }), () => (o.viewing === 'm2' ? m2 : m1), () => { out.saves++; }, () => {}, moveModeD);
        return { open: door.doorOpen === true, sent: out.sent.map(m => m.type + ':' + m.reason), saves: out.saves, redraws: out.redraws, items: out.items, seen: out.seen };
    };
    const aw = { away: runAway(), here: runAway({ viewing: 'm2' }), notOn: runAway({ at: 'm1' }), far: runAway({ far: true }), none: runAway({ mapId: 'm9' }), proto: runAway({ mapId: '__proto__' }), page: runAway({ mapId: 'constructor' }), stub: runAway({ stub: true }) };
    const nothing = j({ open: false, sent: [], saves: 0, redraws: 0, items: [], seen: [] });
    check('1.5.9 door-req on a map the GM is not viewing (run for real with the real fogcore): a player standing on map m2 opens the door beside their token while the GM looks at m1 — saved once, sent to that map\'s holders through net.sendItem (vision judged afresh by the save, as for the map on screen), the GM\'s overlay not drawn; on m2 itself the door opens as before with the overlay drawn and nothing extra sent; a player not on that map, or too far from the door, is answered far as before; a map that is not there, a prototype\'s name and a stub answer nothing',
        j(aw.away) === j({ open: true, sent: [], saves: 1, redraws: 0, items: ['c1/m2'], seen: [] }) && j(aw.here) === j({ open: true, sent: [], saves: 1, redraws: 1, items: [], seen: [] })
        && j(aw.notOn) === j({ open: false, sent: ['door-deny:far'], saves: 0, redraws: 0, items: [], seen: [] }) && j(aw.far) === j({ open: false, sent: ['door-deny:far'], saves: 0, redraws: 0, items: [], seen: [] })
        && j(aw.none) === nothing && j(aw.proto) === nothing && j(aw.page) === nothing && j(aw.stub) === nothing
        && !drSrc.includes('only the GM\'s current map'), j(aw));
    // see-through barriers (1.5.1): a barrier's door is a door to the same request — the piece carries barrier and no blocksSight
    const runBar = (over, o) => runDoor(Object.assign({ blocksSight: undefined, barrier: true }, over), o), quietD = j({ open: false, sent: [], saves: 0 });
    const lineGate = { type: 'path', x: 50, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, pts: [[0, 0], [0, 50]] };
    check('barriers (door-req, run for real with the real fogcore): a player\'s request naming a see-through barrier\'s door next to their token opens it (saved, nothing sent) and closes an open one; a locked one answers locked and stays shut; a hidden one — locked or not — answers nothing, like none; too far answers far; a line gate is found on the cells its line passes; a barrier that is no door, one flagged by anything but true, and a piece with a door type and neither flag are no door at all',
        j(runBar({})) === j({ open: true, sent: [], saves: 1 }) && j(runBar({ doorOpen: true })) === j({ open: false, sent: [], saves: 1 }) && j(runBar({ doorLock: true })) === j({ open: false, sent: ['door-deny:locked'], saves: 0 })
        && j(runBar({ hidden: true })) === quietD && j(runBar({ hidden: true, doorLock: true })) === quietD && j(runBar({ x: 300 })) === j({ open: false, sent: ['door-deny:far'], saves: 0 }) && j(runBar(lineGate)) === j({ open: true, sent: [], saves: 1 })
        && j(runBar({ sightType: 'wall' })) === quietD && j(runBar({ sightType: undefined })) === quietD && j(runBar({ barrier: 1 })) === quietD && j(runBar({ barrier: 'true' })) === quietD && j(runDoor({ blocksSight: undefined })) === quietD && j(runDoor({ blocksSight: 1 })) === quietD,
        j([runBar({}), runBar({ doorOpen: true }), runBar({ doorLock: true }), runBar({ hidden: true }), runBar({ x: 300 }), runBar(lineGate), runBar({ barrier: 1 })]));
    // the Fog of war feature off (found by review, 2026-10-03): the walls rule reads no feature, so a wall's door and a barrier's still stop a token; the
    // request used to be dropped unanswered. It is dropped only where a door decides nothing: the feature off AND the walls rule Off
    const openD = j({ open: true, sent: [], saves: 1 }), offD = [runDoor({}, { fogOff: true }), runDoor({}, { fogOff: true, rules: { walls: 'warn' } }), runBar({}, { fogOff: true }), runDoor({}, { fogOff: true, rules: { walls: 'refuse' } }), runDoor({}, { fogOff: true, rules: 'off' })];
    const offNo = [runDoor({}, { fogOff: true, rules: { walls: 'off' } }), runBar({}, { fogOff: true, rules: { walls: 'off' } }), runDoor({ doorLock: true }, { fogOff: true, rules: { walls: 'off' } })], offAns = [runDoor({ doorLock: true }, { fogOff: true }), runDoor({ x: 300 }, { fogOff: true })];
    check('door-req with the Fog of war feature off (run for real with the real moveMode): a wall\'s door and a barrier\'s still stop a token then, so a player\'s request is answered — the door opens under the walls rule Refuse (the default, and whatever is no rule) and under Warn, a locked one answers locked and one too far answers far; only with the walls rule Off as well does a door decide nothing, and the request is dropped unanswered, locked or not; with the feature on the walls rule changes nothing',
        offD.every(r => j(r) === openD) && offNo.every(r => j(r) === quietD) && j(offAns) === j([{ open: false, sent: ['door-deny:locked'], saves: 0 }, { open: false, sent: ['door-deny:far'], saves: 0 }])
        && j(runDoor({}, { rules: { walls: 'off' } })) === openD && j(runBar({}, { rules: { walls: 'off' } })) === openD, j([offD, offNo, offAns, runDoor({}, { rules: { walls: 'off' } })]));
    const farD = j({ open: false, sent: ['door-deny:far'], saves: 0 }), stand = [runDoor({}, { tok: { isChar: undefined, waiting: true } }), runBar({}, { tok: { isChar: undefined, waiting: true } })], notStand = [runDoor({}, { tok: { ownerId: 'u_x' } }), runDoor({}, { tok: { hidden: true } }), runDoor({}, { tok: { isChar: undefined } }), runDoor({}, { tok: { isChar: undefined, waiting: true, hidden: true } }), runDoor({}, { tok: { isChar: undefined, waiting: true, ownerId: 'u_x' } })];
    check('door-req: a waiting token next to a door opens it as a character\'s token does (the same walls stop it); another player\'s token, a hidden one of theirs and a piece of theirs that is no token do not count as standing next to it, waiting or not',
        stand.every(r => j(r) === openD) && notStand.every(r => j(r) === farD), j([stand, notStand]));
    // 1.6.3 (the improvement week's review, finding 14): a door is beside a token where the board lights it up for its player (fogcore doorGap within
    // DOOR_NEAR), on a map with no grid too, where the request was dropped with no word; and on a grid a token two or three cells wide beside a door
    // is beside it by any cell of its footprint, where its middle cell alone answered far
    const gridless = { gridType: 'off' }, hexM = { gridType: 'hex' }, lockedD = j({ open: false, sent: ['door-deny:locked'], saves: 0 });
    const noGrid = [runDoor({}, { meta: gridless }), runDoor({}, { meta: gridless, tok: { x: 130 } }), runDoor({}, { meta: gridless, tok: { x: 141 } }), runDoor({ doorLock: true }, { meta: gridless }), runBar(lineGate, { meta: gridless, tok: { x: 60 } })].map(r => j(r));
    const big = [runDoor({}, { tok: { x: 100, y: 0, w: 100, h: 100 } }), runDoor({}, { tok: { x: 100, y: 50, w: 150, h: 150 } }), runDoor({}, { tok: { x: 0, y: 100, w: 100, h: 100 } }), runDoor({}, { tok: { x: 200, y: 50, w: 100, h: 100 } }), runDoor({}, { meta: hexM, tok: { x: 100, y: 0, w: 120, h: 104 } })].map(r => j(r));
    check('1.6.3 door-req (run for real with the real fogcore): on a map with no grid a door beside a token of theirs opens and one too far is answered far, where both were dropped with no word; a locked one answers locked there, a line gate beside it opens; on a grid a token two or three cells wide beside a door (on its right, below it, on a hex grid) opens it, where its middle cell two cells off was answered far; one whose nearest edge stands two cells from the door is still far',
        j(noGrid) === j([openD, openD, farD, lockedD, openD]) && j(big) === j([openD, openD, openD, farD, openD]), j([noGrid, big]));
    // 1.6.3 (the review of finding 14's fix): on a lattice the host judges by cells alone (fogcore doorBeside), never by a flat 40 px reach. A
    // hexagon door at q2 r2 and a 60 by 52 token two hexes off (q4 r2, q4 r1, q0 r3) stand 30 px apart, and opened the door; on a map whose own
    // cell is 20 px a token two or three cells off stands 20 or 40 px away, and opened it too. All are far now; the token one hex or one cell off
    // still opens it. And the host and the board's cue agree token for token (the board lights a door by the same doorBeside)
    const hexDoor = { type: 'hexagon', x: 75, y: 130, w: 60, h: 52 }, own20 = { gridType: 'square', cell: { size: 20 } }, d20 = { x: 100, y: 100, w: 20, h: 20 };
    const lat = [runDoor(hexDoor, { meta: hexM, tok: { x: 165, y: 182, w: 60, h: 52 } }), runDoor(hexDoor, { meta: hexM, tok: { x: 165, y: 130, w: 60, h: 52 } }), runDoor(hexDoor, { meta: hexM, tok: { x: -15, y: 130, w: 60, h: 52 } }),
        runDoor(hexDoor, { meta: hexM, tok: { x: 120, y: 156, w: 60, h: 52 } }), runDoor(d20, { meta: own20, tok: { x: 140, y: 100, w: 20, h: 20 } }), runDoor(d20, { meta: own20, tok: { x: 160, y: 100, w: 20, h: 20 } }), runDoor(d20, { meta: own20, tok: { x: 120, y: 100, w: 20, h: 20 } })].map(r => j(r));
    const gH = FCd.gridFor('hex'), hexD = Object.assign({ blocksSight: true, sightType: 'door' }, hexDoor);
    check('1.6.3 door-req on a lattice (run for real with the real fogcore): a 60 by 52 token two hexes from a hexagon door, 30 px off it, is far, and so is a token two or three cells off on a map whose own cell is 20 px (20 and 40 px off); a token one hex or one cell off opens the door; fogcore doorBeside, the board cue\'s rule, says the same of each',
        j(lat) === j([farD, farD, farD, openD, farD, farD, openD]) && typeof FCd.doorBeside === 'function' && FCd.doorBeside({ x: 165, y: 182, w: 60, h: 52 }, hexD, gH) === false && FCd.doorBeside({ x: 120, y: 156, w: 60, h: 52 }, hexD, gH) === true
        && FCd.doorGap({ x: 165, y: 182, w: 60, h: 52 }, hexD) <= FCd.DOOR_NEAR, j(lat));
})());
// Forget: asked first, and whole — a player at the table plays on, but nothing brings their record back until the GM's next Allow
{
    const fgSrc = between('// [netcheck:forget-start]', '// [netcheck:forget-end]', 'forget');
    const slSrc = fnSrc('function syncLastMaps() {', '\n// Who is on a given map', 'syncLastMaps');
    const run = (answer, fid, opts) => {
        opts = opts || {};
        const camp = { id: 'c1', players: { u_a: { name: 'Ana', key: 'k1', lastMap: 'm0' }, u_b: { name: 'Bo', key: 'k2' } } };
        const net = { role: 'host', roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' } }, forgotten: Object.create(null) };
        const out = { asked: [], toasts: [], saved: 0, redraws: 0, camp, net, waitRemoved: [], waitChanged: [] };
        const env = [net, H.own, (m, cb) => { out.asked.push(m); cb(answer); }, () => (opts.switched ? { id: 'c2' } : camp), () => { out.saved++; }, m => out.toasts.push(m), () => { out.redraws++; }, {}, () => ({ playableChars: (c, pid) => pid === 'u_a' ? [{ id: 'c_1' }] : [] }), (c, pid) => { out.waitRemoved.push(pid); return ['m1']; }, (c, maps) => { out.waitChanged.push(maps); }];
        const fns = new Function('net', 'own', 'showConfirm', 'getActiveCampaign', 'save', 'toast', 'renderPlayersPanel', 'approvedIds', 'SC', 'removeWaiting', 'waitingChanged', fgSrc + '\n' + slSrc + '\nreturn { forgetPlayer, syncLastMaps };')(...env);
        fns.forgetPlayer(camp, fid);
        fns.syncLastMaps();
        return out;
    };
    const yes = run(true, 'u_a'), no = run(false, 'u_a');
    check('forget (host): asked first, naming them and saying they stay at the table; on yes the record goes for good — the roster sync that runs on every redraw no longer re-creates it while they play on (Cancel keeps it)',
        yes.asked.length === 1 && /Forget Ana\?/.test(yes.asked[0]) && /stay at the table/.test(yes.asked[0]) && !('u_a' in yes.camp.players) && yes.net.forgotten.u_a === true && yes.saved === 1 && yes.redraws === 1
        && yes.camp.players.u_b.lastMap === 'm1', j([yes.asked, yes.camp.players]));
    check('forget (F1a): a Forget takes the player\'s waiting token too (Cancel leaves it)', j(yes.waitRemoved) === j(['u_a']) && j(yes.waitChanged) === j([['m1']]) && no.waitRemoved.length === 0 && no.waitChanged.length === 0, j([yes.waitRemoved, no.waitRemoved]));
    const gone = run(true, 'u_a', { switched: true }), proto = run(true, 'constructor'), stranger = run(true, 'u_zz');
    check('forget (host): Cancel keeps them (and the sync still records where they are); an answer after a campaign switch changes nothing; a prototype-key or unknown id asks nothing',
        no.camp.players.u_a.key === 'k1' && no.camp.players.u_a.lastMap === 'm1' && !no.net.forgotten.u_a && no.saved === 0 && gone.camp.players.u_a.key === 'k1' && gone.saved === 0
        && proto.asked.length === 0 && stranger.asked.length === 0 && proto.saved === 0, j([no.camp.players, gone.camp.players, proto.asked]));
    check('forget (host): the Players panel\'s Forget goes through forgetPlayer, and only the GM\'s next Allow (admitPlayer) ends a forget, before the record is written again',
        /\} else if \(btn\.dataset\.forget\) \{\s*forgetPlayer\(camp, btn\.dataset\.forget\);\s*return;/.test(src) && /delete net\.forgotten\[prof\.id\];[^\n]*\n\s*var rec = camp\.players\[prof\.id\] = /.test(src) && /net\.forgotten = Object\.create\(null\);/.test(src)
        && /if \(!p \|\| !p\.id \|\| !p\.location \|\| net\.forgotten\[p\.id\]\) return;/.test(src));
}

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
// 1.5.9 (the owner, at the table, 2026-10-25: "sometimes players land outside of a wall and cant get in the play area when teleporting"): an
// arrival spot is one the token could walk to. The real freeSpotNear, stepOffPortal and spawnSpot over the real vision half of fog.js
// (arrivalOk, moveBlocked, moveSetFor, fogMask) and fogcore: beside a wall on a square and on a hex map the token lands on the portal's side and
// never in a wall's cell, a full ring with nothing but spots beyond a wall lands it on the portal itself, a play area is kept to, a secret door
// is a wall and an open door is not; with no walls and no play area every spot is the very spot the code gives without the fog module. Then a
// token copied for its player keeps no lock and no group (the real ensurePlayerToken), the GM is told once which token passed to them and why
// (the real passNote over the real systemcore chooser), and a player's move of a token of their own character that the GM holds is answered by
// one note in 10 s (the real notMineNote)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FCx = await import(url('fogcore.js')), Sx = await import(url('systemcore.js'));
    const fogT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const fogV = fogT.slice(fogT.indexOf('function core() {'), fogT.indexOf('/* ---------- the overlay'));
    const J = JSON.stringify;
    const camp = { id: 'k', items: {}, chars: {}, players: {} };
    const win = { wpFogCore: FCx, wpSystemCore: Sx, wpVtt: { on: () => true, campaignOn: () => true, mode: () => 'host' } };
    const fog = new Function('window', 'document', 'getActiveMap', 'getActiveCampaign', 'state', "'use strict';\n" + fogV + '\nreturn { arrivalOk: arrivalOk, moveBlocked: moveBlocked };')(win, { getElementById: () => null }, () => null, () => camp, { appState: { campaigns: { k: camp } } });
    const fsS = fnSrc('function freeSpotNear(', '\nfunction ', 'freeSpotNear'), soS = fnSrc('function stepOffPortal(', '\nfunction ', 'stepOffPortal'), ssS = fnSrc('function spawnSpot(', '\n/* Host: player P', 'spawnSpot');
    const mk = (w, lp) => new Function('window', 'landingPoint', fsS + '\n' + soS + '\n' + ssS + '\nreturn { freeSpotNear: freeSpotNear, stepOffPortal: stepOffPortal, spawnSpot: spawnSpot };')(w, lp || (() => null));
    const withFog = mk({ wpFog: fog }), noFog = mk({});
    let n = 0; const M = (grid, wb) => { const m = { id: 'mt' + (++n), type: 'map', meta: { title: 'T', gridType: grid, updated: n }, rooms: [], whiteboard: wb }; camp.items[m.id] = m; return m; };
    const tokAt = (c, r) => ({ id: 'o' + c + '_' + r, isChar: true, x: c * 50, y: r * 50, w: 50, h: 50 });
    const portal = { id: 'pt', type: 'rect', x: 500, y: 500, w: 50, h: 50, targetMapId: 'mX' };
    const wallCol = { id: 'wl', type: 'rect', x: 550, y: 0, w: 50, h: 1500, blocksSight: true };   // the column of cells 11 beside the portal (cell 10)
    const crowd = []; for (let c = 8; c <= 10; c++) for (let r = 8; r <= 12; r++) if (!(c === 10 && r === 10)) crowd.push(tokAt(c, r));   // every cell on the portal's side within two rings
    const mSq = M('square', [portal, wallCol].concat(crowd));
    const aSq = withFog.freeSpotNear(mSq, 525, 525, 50, 50, null, portal), bSq = noFog.freeSpotNear(mSq, 525, 525, 50, 50, null, portal);
    const sideOk = p => p.x + 25 < 550 && !fog.moveBlocked(mSq, { w: 50, h: 50 }, 500, 500, p.x, p.y);
    check('1.5.9 arrival: beside a wall on a square map the token lands on the portal\'s side, the nearest free cell there (two rings of tokens on that side, a wall\'s column of cells on the other), never in a wall\'s cell nor beyond the wall, where the spot without the judge was in the wall',
        J(aSq) === J({ x: 350, y: 350 }) && sideOk(aSq) && J(bSq) === J({ x: 550, y: 450 }), J([aSq, bSq]));
    // a hex map: a band of wall wide enough that every spot on its side is in it or beyond it
    const pH = { id: 'ph', type: 'rect', x: 1000, y: 1000, w: 60, h: 52, targetMapId: 'mX' }, cxH = 1030, cyH = 1026, stH = 68;
    const bandH = { id: 'bh', type: 'rect', x: cxH + 40, y: 0, w: 260, h: 3000, blocksSight: true };
    const crowdH = []; [[-1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].forEach(([dx, dy], i) => crowdH.push({ id: 'h' + i, isChar: true, x: cxH - 30 + dx * stH, y: cyH - 26 + dy * stH, w: 60, h: 52 }));
    const mHx = M('hex', [pH, bandH].concat(crowdH));
    const aH = withFog.freeSpotNear(mHx, cxH, cyH, 60, 52, null, pH), bH = noFog.freeSpotNear(mHx, cxH, cyH, 60, 52, null, pH);
    check('1.5.9 arrival: beside a wall on a hex map the token lands on the portal\'s side (the nearest spots there taken), where the spot without the judge was in the wall',
        aH.x + 30 < cxH + 40 && !fog.moveBlocked(mHx, { w: 60, h: 52 }, cxH - 30, cyH - 26, aH.x, aH.y) && bH.x + 30 > cxH + 40 && J(aH) === J({ x: cxH - 30 - 2 * stH, y: cyH - 26 - 2 * stH }), J([aH, bH]));
    // a full ring: the eight cells round the portal taken, walls round them, nothing but spots beyond a wall
    const ring = []; for (let c = 9; c <= 11; c++) for (let r = 9; r <= 11; r++) if (!(c === 10 && r === 10)) ring.push(tokAt(c, r));
    const walls = [{ id: 'wn', type: 'rect', x: 400, y: 400, w: 250, h: 50, blocksSight: true }, { id: 'ws', type: 'rect', x: 400, y: 600, w: 250, h: 50, blocksSight: true }, { id: 'ww', type: 'rect', x: 400, y: 450, w: 50, h: 150, blocksSight: true }, { id: 'we', type: 'rect', x: 600, y: 450, w: 50, h: 150, blocksSight: true }];
    const mRing = M('square', [portal].concat(walls, ring)), aR = withFog.freeSpotNear(mRing, 525, 525, 50, 50, null, portal), bR = noFog.freeSpotNear(mRing, 525, 525, 50, 50, null, portal);
    check('1.5.9 arrival: a full ring round the portal with nothing past it but spots beyond a wall lands the token on the portal itself (it can walk off it), where the spot without the judge was beyond the wall',
        J(aR) === J({ x: 500, y: 500 }) && !(bR.x === 500 && bR.y === 500), J([aR, bR]));
    // a spot in a wall's cell is refused: the cell right below the portal is a wall's, the others round it free
    const mCell = M('square', [portal, { id: 'wc', type: 'rect', x: 500, y: 550, w: 50, h: 50, blocksSight: true }]);
    const cellA = withFog.freeSpotNear(mCell, 525, 575, 50, 50, null, portal, { x: 525, y: 525 }), cellB = noFog.freeSpotNear(mCell, 525, 575, 50, 50, null, portal, { x: 525, y: 525 });
    check('1.5.9 arrival: a spot in a wall\'s cell is refused (the very cell asked for is a wall\'s), the nearest free cell beside it taken, where the spot without the judge was the wall\'s cell',
        J(cellB) === J({ x: 500, y: 550 }) && J(cellA) === J({ x: 450, y: 500 }), J([cellA, cellB]));
    // a play area: the cells 8 to 10 across, 8 to 12 down; the two cells above the portal taken, the one beyond the area's edge refused
    const area = { id: 'pa', type: 'rect', x: 400, y: 400, w: 150, h: 250, fogged: true };
    const mPA = M('square', [area, portal, tokAt(9, 9), tokAt(10, 9)]), aP = withFog.freeSpotNear(mPA, 525, 525, 50, 50, null, portal), bP = noFog.freeSpotNear(mPA, 525, 525, 50, 50, null, portal);
    const hiddenArea = M('square', [Object.assign({}, area, { hidden: true }), portal, tokAt(9, 9), tokAt(10, 9)]), aPh = withFog.freeSpotNear(hiddenArea, 525, 525, 50, 50, null, portal);
    check('1.5.9 arrival: a map\'s play area is kept to (a spot outside it refused, the nearest inside taken); a hidden play area marks none',
        J(bP) === J({ x: 550, y: 450 }) && J(aP) === J({ x: 450, y: 500 }) && J(aPh) === J(bP), J([aP, bP, aPh]));
    // a secret door is a wall, an open door is not, a hidden wall is none
    const door = o => ({ id: 'dr', type: 'rect', x: 500, y: 550, w: 50, h: 50, blocksSight: true, sightType: 'door', doorOpen: true, ...o });
    const dOpen = withFog.freeSpotNear(M('square', [portal, door({})]), 525, 575, 50, 50, null, portal, { x: 525, y: 525 });
    const dSecret = withFog.freeSpotNear(M('square', [portal, door({ secret: true })]), 525, 575, 50, 50, null, portal, { x: 525, y: 525 });
    const dHid = withFog.freeSpotNear(M('square', [portal, { id: 'wh', type: 'rect', x: 500, y: 550, w: 50, h: 50, blocksSight: true, hidden: true }]), 525, 575, 50, 50, null, portal, { x: 525, y: 525 });
    check('1.5.9 arrival: a secret door is a wall (its cell refused, open or not), an open door is not and a hidden wall is none (their cells taken)',
        J(dOpen) === J({ x: 500, y: 550 }) && J(dSecret) === J({ x: 450, y: 500 }) && J(dHid) === J({ x: 500, y: 550 }), J([dOpen, dSecret, dHid]));
    // stepOffPortal: a wall row right below the portal; the token left behind steps off on the portal's side, walked from the portal itself
    const rowS = { id: 'rs', type: 'rect', x: 0, y: 550, w: 1500, h: 50, blocksSight: true };
    const mSO = M('square', [portal, rowS]), leftA = { id: 'lt', isChar: true, x: 500, y: 500, w: 50, h: 50 }, leftB = Object.assign({}, leftA);
    withFog.stepOffPortal(leftA, portal, mSO); noFog.stepOffPortal(leftB, portal, mSO);
    const mSO2 = M('square', [portal, { id: 'rr', type: 'rect', x: 0, y: 550, w: 1500, h: 400, blocksSight: true }]), leftC = { id: 'lc', isChar: true, x: 500, y: 500, w: 50, h: 50 };
    withFog.stepOffPortal(leftC, portal, mSO2);
    check('1.5.9 arrival: stepOffPortal walks from the portal it stands on: with a wall row just below, the token steps off beside the portal on its side, where without the judge it stood in the wall; a wall the whole way below still finds the portal\'s side',
        J([leftB.x, leftB.y]) === J([500, 550]) && leftA.y + 25 < 550 && !fog.moveBlocked(mSO, { w: 50, h: 50 }, 500, 500, leftA.x, leftA.y) && leftC.y + 25 < 550, J([leftA, leftB, leftC]));
    // spawnSpot: the landing room's item is the portal inside the ring of walls; a spot beside a token given is walked from it
    const lp = () => ({ wbX: 525, wbY: 525, wbItemId: 'pt' }), spawnF = mk({ wpFog: fog }, lp), spawnN = mk({}, lp);
    const mSp = M('square', [portal].concat(walls, ring)); mSp.rooms = [{ id: 'room1' }];
    const sA = spawnF.spawnSpot(mSp, 'room1', null, 50, 50, null), sB = spawnN.spawnSpot(mSp, 'room1', null, 50, 50, null);
    const mNear = M('square', [rowS, tokAt(10, 10), tokAt(9, 9), tokAt(10, 9), tokAt(11, 9), tokAt(9, 10), tokAt(11, 10)]);
    const sNear = spawnF.spawnSpot(mNear, null, { x: 525, y: 525 }, 50, 50, null), sNearB = spawnN.spawnSpot(mNear, null, { x: 525, y: 525 }, 50, 50, null);
    check('1.5.9 arrival: spawnSpot alike: a landing room ringed by tokens and walls lands the token on its own spot, and one placed beside a token never crosses the wall below it',
        J(sA) === J({ x: 500, y: 500 }) && !(sB.x === 500 && sB.y === 500) && J(sNear) === J({ x: 400, y: 400 }) && J(sNearB) === J({ x: 450, y: 550 }), J([sA, sB, sNear, sNearB]));
    // no walls and no play area: every spot the very one the code gives without the fog module (seeded, on a square, a hex and no grid)
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const diffs = []; let runs = 0;
    ['square', 'hex', 'off'].forEach(g => { for (let t = 0; t < 60; t++) {
        const wb = []; const k = Math.floor(rnd() * 40); for (let i = 0; i < k; i++) wb.push({ id: 'r' + i, isChar: rnd() < 0.8, waiting: rnd() < 0.1 ? 1 : undefined, x: Math.round(rnd() * 800), y: Math.round(rnd() * 800), w: 50 + Math.round(rnd() * 20), h: 50 });
        if (rnd() < 0.5) wb.push({ id: 'deco', type: 'rect', x: 100, y: 100, w: 300, h: 300 });   // a piece that blocks nothing
        const pp = rnd() < 0.7 ? { id: 'pp', type: 'rect', x: 300, y: 300, w: 60, h: 52 } : null, m = M(g, wb.concat(pp ? [pp] : []));
        const cx = 300 + Math.round(rnd() * 200), cy = 300 + Math.round(rnd() * 200), w = 50 + Math.round(rnd() * 30), h = 50;
        const a = withFog.freeSpotNear(m, cx, cy, w, h, null, pp), b = noFog.freeSpotNear(m, cx, cy, w, h, null, pp); runs++;
        if (J(a) !== J(b)) diffs.push([g, t, a, b]);
    } });
    check('1.5.9 arrival: on a map with no wall, no barrier and no play area every spot is the very spot the code gives without the fog module, byte for byte (180 seeded maps on a square grid, a hex grid and none)',
        runs === 180 && diffs.length === 0, J(diffs.slice(0, 3)));
    check('1.5.9 arrival: the judge is fog.js arrivalOk, published on window.wpFog beside moveBlocked, which freeSpotNear asks through typeof; stepOffPortal walks from the portal\'s center',
        /moveBlocked: moveBlocked, arrivalOk: arrivalOk,/.test(fogT) && /\nfunction arrivalOk\(map, w, fx, fy, tx, ty\) \{\n    if \(!map \|\| map\.type !== 'map'\) return true;\n    if \(moveBlocked\(map, w, fx, fy, tx, ty\)\) return false;/.test(fogT)
        && /window\.wpFog && typeof window\.wpFog\.arrivalOk === 'function'/.test(fsS) && /freeSpotNear\(map, cx, cy, w, h, item\.id, portal, \{ x: portal\.x \+ \(portal\.w \|\| 0\) \/ 2, y: portal\.y \+ \(portal\.h \|\| 0\) \/ 2 \}\);/.test(soS));
    // a token copied for its player keeps no lock and no group: the real ensurePlayerToken with a clone from another map
    const epS = fnSrc('function ensurePlayerToken(', '\n// [netcheck:passnote-start]', 'ensurePlayerToken');
    const pnS = src.slice(src.indexOf('// [netcheck:passnote-start]'), src.indexOf('// [netcheck:passnote-end]'));
    const runEnsure = () => {
        const toasts = [], logs = [], src0 = { id: 'tk1', isChar: true, charId: 'c_k', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50, locked: true, groupId: 'g1', threats: ['x'] };
        const ca = { id: 'k2', items: { mFrom: { id: 'mFrom', type: 'map', meta: {}, whiteboard: [src0] }, mTo: { id: 'mTo', type: 'map', meta: { title: 'The Inn' }, whiteboard: [] } }, chars: { c_k: { id: 'c_k', name: 'Kael', ownerId: 'u_a' } }, players: { u_a: { name: 'Ana', charId: 'c_k' } } };
        const S = { tokenSourceFor: () => ({ op: 'clone', tok: src0, charId: 'c_k' }), ownedTokenPlan: () => [], applyOwnerOps() {}, waitingTokensOf: () => [] };
        const api = new Function('net', 'getActiveCampaign', 'SC', 'own', 'healBindings', 'sheetsOnFor', 'tokenFromChar', 'spawnSpot', 'toast', 'logEvent', 'settleWaiting', 'save', 'render', 'window', epS + '\n' + pnS + '\nreturn ensurePlayerToken;')(
            { role: 'host', broadcastItemFiltered() {} }, () => ca, () => S, (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), () => {}, () => true, () => null, () => ({ x: 100, y: 100 }), t => toasts.push(t), (k, t) => logs.push(t), () => [], () => {}, () => {}, {});
        api('u_a', 'mTo', null);
        return { made: ca.items.mTo.whiteboard[0], src0: src0, toasts: toasts };
    };
    const ens = runEnsure();
    check('1.5.9 arrival: a token copied for its player on arrival (the real ensurePlayerToken, a copy from another map) keeps no lock, no group and no threat marks, while the token it was copied from keeps its own; the GM\'s walk through a portal drops the same two',
        !!ens.made && !('locked' in ens.made) && !('groupId' in ens.made) && !('threats' in ens.made) && ens.made.ownerId === 'u_a' && ens.src0.locked === true && ens.src0.groupId === 'g1'
        && /delete mine\.threats;[^\n]*\n\s*delete mine\.hidden;\n\s*delete mine\.locked; delete mine\.groupId;/.test(src) && /nw = JSON\.parse\(JSON\.stringify\(src\.tok\)\); delete nw\.threats; delete nw\.hidden; delete nw\.locked; delete nw\.groupId;/.test(src), J(ens));
    // the GM is told which token passed to them, and why: the real chooser over a player with two characters, one kept, one in the making, a second copy
    const toastsP = [], logsP = [];
    const PN = new Function('SC', 'toast', 'logEvent', pnS + '\nreturn passNote;')(() => Sx, t => toastsP.push(t), (k, t) => logsP.push([k, t]));
    const T2 = (id, charId, owner, more) => Object.assign({ id: id, type: 'image', isChar: true, charId: charId, charName: id, x: 0, y: 0, w: 50, h: 50 }, owner ? { ownerId: owner } : {}, more || {});
    const cP = { id: 'k3', items: { mI: { id: 'mI', type: 'map', meta: { title: 'The Inn' }, whiteboard: [T2('tKael', 'c_kael', 'u_a'), T2('tMira', 'c_mira', 'u_a'), T2('tMira2', 'c_mira', 'u_a'), T2('tNew', 'c_new', 'u_a')] } },
        chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a' }, c_mira: { id: 'c_mira', name: 'Mira', ownerId: 'u_a' }, c_new: { id: 'c_new', name: 'Pebbles', ownerId: 'u_a', making: 1 } }, players: { u_a: { name: 'Ana', charId: 'c_mira' } } };
    const opsP = Sx.ownedTokenPlan(cP, { keep: 'tMira', mapId: 'mI' }); Sx.applyOwnerOps(cP, opsP);
    const said = PN(cP, cP.items.mI, opsP), again = PN(cP, cP.items.mI, Sx.ownedTokenPlan(cP, { keep: 'tMira', mapId: 'mI' }));
    check('1.5.9 arrival: a token that passes to the GM is said once, in one notice naming each token and why (a kept character, one still being made, a second copy), logged; once passed nothing passes again and nothing is said',
        said === 'Kael\u2019s token passed to you: the character is kept, as its player plays another. Pebbles\u2019s token passed to you: the character is still being made. Mira\u2019s token passed to you: it is a second copy on this map. On The Inn. Still linked to the character.'
        && J(toastsP) === J([said]) && J(logsP) === J([['char', said]]) && again === '' && toastsP.length === 1
        && /if \(typeof passNote === 'function'\) passNote\(camp, map, ops\);/.test(src) && /S\.applyOwnerOps\(camp, opsO\); if \(typeof passNote === 'function'\) passNote\(camp, dest, opsO\);/.test(src), J([said, toastsP, logsP, opsP]));
    // a player's move of a token the GM holds: one note in 10 s, only of a token of a character of their own
    const posS = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos');
    const nmA = posS.indexOf('var _notMineAt'), nmS = posS.slice(nmA, posS.indexOf('\n}\n', nmA) + 3), tnS = posS.slice(posS.indexOf('function turnNote('), posS.indexOf('\n}\n', posS.indexOf('function turnNote(')) + 3);
    let clock = 1000000; const sent = [];
    const NM = new Function('Date', 'sendFailed', tnS + nmS + '\nreturn notMineNote;')({ now: () => clock }, () => {});
    const conn = { send: m => sent.push(m) }, prA = { id: 'u_a' }, campN = { chars: { c_kael: { id: 'c_kael', ownerId: 'u_a' }, c_n: { id: 'c_n', npc: true }, c_b: { id: 'c_b', ownerId: 'u_b' } } };
    NM(conn, prA, campN, { charId: 'c_kael' }); NM(conn, prA, campN, { charId: 'c_kael' }); clock += 9999; NM(conn, prA, campN, { charId: 'c_kael' });
    const one = sent.length; clock += 1; NM(conn, prA, campN, { charId: 'c_kael' }); const two = sent.length;
    clock += 20000; NM(conn, prA, campN, { charId: 'c_n' }); NM(conn, prA, campN, { charId: 'c_b' }); NM(conn, prA, campN, { charId: '__proto__' }); NM(conn, prA, campN, {});
    check('1.5.9 arrival: a player who moves a token of their own character that the GM holds is told once in the app\'s own fixed words, again only after 10 s, and never of an NPC\'s token, another player\'s or one with no character; the pos gate asks it for a shown character token with no owner alone',
        one === 1 && two === 2 && sent.length === 2 && J(sent[0]) === J({ type: 'turn-note', text: 'That token is the GM\'s to move now.' })
        && /if \(!pr \|\| w\.ownerId !== pr\.id\) \{ if \(pr && !w\.ownerId && w\.isChar && !w\.hidden\) notMineNote\(conn, pr, camp, w\); return; \}/.test(posS), J(sent));
})());
// fold M2: one item's rule on its way to a player (wireWbItem), lifted out of sanitizeItem so one item can later be sent alone; a whole
// map's copy comes out byte for byte as it did before
{
    const [siNew, wwi] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({});
    const wireNumF = new Function((require('./checkkit').part('netfog.js').match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0] + '\nreturn wireNum;')();
    // sanitizeItem's rule written out a second time, to compare against (as it stood before fold M2, a35b807, with the one change since: a
    // hidden piece is left out whole where it used to be a position-only box)
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
            m.whiteboard = (m.whiteboard || []).filter(function(w) { return !w.gmNoteFor && !w.hidden; }).map(function(w) {
                if (w.sheet || w.gmInfo || w.frame) { w = JSON.parse(JSON.stringify(w)); delete w.sheet; delete w.gmInfo; delete w.frame; }
                return w;
            });
            // 1.6.3 (the owner, 2026-11-15: "Yes, send only what shows"; moved on purpose): only the rooms a piece sent names, with no Expected here list, and the links between them
            var named = Object.create(null); m.whiteboard.forEach(function(w) { if (w && typeof w.nodeId === 'string' && w.nodeId) named[w.nodeId] = true; });
            m.rooms = (m.rooms || []).filter(function(r) { return !!r && typeof r.id === 'string' && named[r.id] === true; });
            m.rooms.forEach(function(r) { delete r.characters; });
            m.links = m.links.filter(function(lk) { return Array.isArray(lk) && named[lk[0]] === true && named[lk[1]] === true; });
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
    {   // 1.6.3 (the owner, 2026-11-15, by prompt: "Yes, send only what shows"): a player is sent only the rooms a piece they are sent names
        const mR = () => ({ id: 'mr', type: 'map', rooms: [{ id: 'shown', name: 'Plaza', image: '/saves/images/p.png', characters: [{ id: 'c1', name: 'Vorn', portrait: '/saves/images/v.png' }] }, { id: 'hid', name: 'Hideout' }, { id: 'prep', name: 'Lodging' }, { id: 'sec', name: 'Vault' }, { id: 'note', name: 'Note room' }, { id: 'two', name: 'Market' }],
            links: [['shown', 'two'], ['shown', 'prep', 'route', { label: 'Alley', notes: 'x' }], ['hid', 'two'], ['two', 'sec']],
            whiteboard: [{ id: 'p1', type: 'trigger', nodeId: 'shown', x: 1, y: 1, w: 60, h: 52 }, { id: 'p2', type: 'trigger', nodeId: 'hid', hidden: true, x: 1, y: 1 }, { id: 'p3', type: 'rect', nodeId: 'note', gmNoteFor: 'note', x: 1, y: 1 },
                { id: 'p4', type: 'rect', nodeId: 'two', x: 5, y: 5, w: 10, h: 10 }, { id: 'p5', type: 'rect', nodeId: 'two', x: 9, y: 9, w: 10, h: 10 }, { id: 'p6', type: 'rect', nodeId: 7, x: 1, y: 1 }] });
        const outR = siNew(mR()), gmR = mR(), keptR = JSON.stringify(gmR); siNew(gmR); const bare = siNew({ id: 'mb', type: 'map', rooms: [{ id: 'a' }, { id: 7 }], links: [['a', 'a'], 'junk'] });
        check('1.6.3 a player is sent only the rooms a piece they are sent names (net.js sanitizeItem, run for real; the owner, 2026-11-15, by prompt: "Yes, send only what shows"): a room a shown pin names goes, with its name and picture and without its Expected here list; a room whose only pin is hidden, one only a GM note card names, a room the GM has not placed and a pin whose nodeId is no text keep their rooms home; two pins of one room send it once; a link goes only between two rooms that go, its notes off as before; the GM\u2019s own map is left as it was; a map with no pins sends no room and no link',
            JSON.stringify(outR.rooms) === JSON.stringify([{ id: 'shown', name: 'Plaza', image: '/saves/images/p.png' }, { id: 'two', name: 'Market' }]) && JSON.stringify(outR.links) === JSON.stringify([['shown', 'two']])
            && JSON.stringify(gmR) === keptR && JSON.stringify(bare.rooms) === '[]' && JSON.stringify(bare.links) === '[]', JSON.stringify([outR.rooms, outR.links, bare]));
    }
    const same = fixtures.map(fx => { const a = fx(), b = fx(), before = JSON.stringify(a); const n = siNew(a), o = siOld(b); return [JSON.stringify(n) === JSON.stringify(o), JSON.stringify(a) === before, JSON.stringify(n).slice(0, 60)]; });
    const img = fixtures[5](), m1out = siNew(fixtures[0]());
    check('fold M2: sanitizeItem (run for real) with its per-item rule in wireWbItem gives, byte for byte, the copy the rule written out beside it gives (a hidden token, a hidden shape and one hidden by a 1 left out whole, a GM-note card, a hidden one, sheet, GM note and kept original, 1e20, a text box, a waiting token, a light, falsy GM prep, a stray entry; a map with nothing, a planner, a page, a picture) and never touches the host\'s own map',
        same.every(s => s[0] && s[1]) && siNew(img) === img && m1out.whiteboard.length === 13 && !m1out.whiteboard.some(w => w && (w.id === 'w2' || w.id === 'w9' || w.id === 'w10' || w.hidden)) && !/the key|hidden secret/.test(JSON.stringify(m1out)) && m1out.whiteboard.find(w => w && w.id === 'v0').front === 30 && m1out.whiteboard.find(w => w && w.id === 'v1').front === 60 && !/secret|GM note|"sheet":\{|"frame":\{/.test(JSON.stringify(m1out)),
        JSON.stringify(same));
    const note = { id: 'n', type: 'rect', gmNoteFor: 'r1', x: 1 }, hid = { id: 'h', type: 'image', hidden: true, x: 1e20, y: 2, w: 3, h: 4, rot: Infinity, front: 45, layer: 'bg', sheet: { a: 1 }, light: torchM };
    const hidBefore = JSON.stringify(hid), stubF = wwi(hid, false), stubT = wwi(JSON.parse(JSON.stringify(hid), wireNumF), true);
    const hid1 = { id: 'h1', type: 'rect', hidden: 1, x: 1, y: 2 }, notHid = [{ id: 'v', type: 'rect', hidden: false, x: 1 }, { id: 'v', type: 'rect', hidden: 0, x: 1 }, { id: 'v', type: 'rect', hidden: '', x: 1 }];
    const tok = { id: 't', type: 'image', isChar: true, x: 1e20, y: 1, sheet: { hp: 3 }, gmInfo: 'g', frame: { src: 'k' }, light: torchM }, tokBefore = JSON.stringify(tok), tokF = wwi(tok, false);
    const plain = { id: 'p', type: 'rect', x: 1, y: 2 }, prep = { id: 'q', type: 'image', x: 1, sheet: { a: 1 }, gmInfo: 'g', frame: { src: 'k' } }, prepT = wwi(prep, true);
    const vis = { id: 'v', type: 'image', isChar: true, x: 1e20, light: torchM }, visBefore = JSON.stringify(vis), visF = wwi(vis, false);
    const oneEach = [{ id: 'g', gmInfo: 'g' }, { id: 's', sheet: { a: 1 } }, { id: 'f', frame: { src: 'k' } }], oneF = oneEach.map(w => wwi(w, false)), oneT = oneEach.map(w => wwi(JSON.parse(JSON.stringify(w)), true));
    check('hidden pieces: wireWbItem (run for real) gives null for a GM-note card and for a hidden item — no id, no box, nothing of it — whether it was cloned already or not, hidden by true or by any truthy mark; a piece whose mark is false, 0 or empty is sent as ever; the host\'s own item is left as it was',
        wwi(note, false) === null && wwi(note, true) === null && stubF === null && stubT === null && wwi(hid1, false) === null && wwi(JSON.parse(JSON.stringify(hid1)), true) === null
        && notHid.every(w => { const o = wwi(w, false); return !!o && o.id === 'v' && o.x === 1; }) && JSON.stringify(hid) === hidBefore,
        JSON.stringify([stubF, stubT]));
    check('fold M2: wireWbItem on an item sent alone (cloned = false) copies and bounds it first and never touches the host\'s own item; on sanitizeItem\'s own clone (cloned = true) it works in place: a plain item is the same object, GM prep is deleted from it with no second clone',
        tokF !== tok && JSON.stringify(tok) === tokBefore && tokF.x === 1e15 && !('sheet' in tokF) && !('gmInfo' in tokF) && !('frame' in tokF) && JSON.stringify(tokF.light) === JSON.stringify(torchM) && tokF.isChar === true
        && wwi(plain, true) === plain && JSON.stringify(plain) === JSON.stringify({ id: 'p', type: 'rect', x: 1, y: 2 }) && prepT === prep && JSON.stringify(prep) === JSON.stringify({ id: 'q', type: 'image', x: 1 })
        && visF !== vis && visF.x === 1e15 && JSON.stringify(vis) === visBefore && visF.light !== vis.light && JSON.stringify(visF.light) === JSON.stringify(torchM)
        && oneF.concat(oneT).every(w => !('gmInfo' in w) && !('sheet' in w) && !('frame' in w)) && oneEach.every(w => Object.keys(w).length === 2),
        JSON.stringify([tokF, prepT, visF, oneF, oneT]));
    const siAt = src.indexOf('function sanitizeItem('), siEnd = src.indexOf('\n}\n', siAt) + 3, wwAt = src.indexOf('function wireWbItem(');
    const gap = src.slice(siEnd, wwAt).split('\n').filter(Boolean), siBody = src.slice(siAt, siEnd);
    check('fold M2: wireWbItem sits directly after sanitizeItem (comments only between), which calls it once on its own clone, and no box for a hidden piece is written anywhere in net.js',
        wwAt > siEnd && gap.every(l => /^\/\/ /.test(l)) && (siBody.match(/wireWbItem\(w, true\)/g) || []).length === 1 && !/gmNoteFor|hidden: true/.test(siBody)
        && (src.match(/function wireWbItem\(/g) || []).length === 1 && (src.match(/type: 'rect', hidden: true/g) || []).length === 0 && /function wireWbItem\(w, cloned\) \{\n    if \(w\.gmNoteFor \|\| w\.hidden\) return null;\n/.test(src),
        JSON.stringify(gap));
    // map builder B1: a piece's texture rides to the table only as a name of the app's own list (the host's own cleaner, fogcore's, on its way out);
    // a hidden textured piece gives nothing
    pendingChecks.push((async () => {
        const urlT = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const FCtx = await import(urlT('fogcore.js')), [, wwiT] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpFogCore: FCtx });
        const texWall = { id: 'tw', type: 'rect', x: 100, y: 50, w: 50, h: 50, texture: 'bricks', blocksSight: true, sightType: 'wall', cover: 'yes', terrain: 2, color: '#3f3b47', layer: 'back-mid', name: 'Wall' }, texBefore = JSON.stringify(texWall), texOut = wwiT(texWall, false), texIn = wwiT(JSON.parse(texBefore), true);
        const texPoly = wwiT({ id: 'tp', type: 'path', tip: 'fill', texture: 'grass', x: 0, y: 0, w: 100, h: 100, pts: [[0, 0], [100, 0], [100, 100]] }, false), texHid = wwiT({ id: 'th', type: 'rect', hidden: true, texture: 'grass', blocksSight: true }, false), texHidT = wwiT({ id: 'th2', type: 'hexagon', hidden: 1, texture: 'grass' }, true);
        const texOdd = ['bricks', 'Bricks', 'url(x)', '__proto__', 1, { a: 1 }, 'x'.repeat(300000)], texLeft = wire => texOdd.map((t, i) => { const own = { id: 'to' + i, type: 'rect', x: 1, texture: t }, a = wire(own, false), b = wire(JSON.parse(JSON.stringify(own)), true); return [a && Object.prototype.hasOwnProperty.call(a, 'texture') ? a.texture : 'none', b && Object.prototype.hasOwnProperty.call(b, 'texture') ? b.texture : 'none', own.texture === t]; });
        const texGone = Array(7).fill(0).map(() => ['none', 'none', true]), texKeptW = [['bricks', 'bricks', true]].concat(texGone.slice(1)), texPlainW = wwiT({ id: 'pl', type: 'rect', x: 1 }, false);
        const [, wwiNoFn] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpFogCore: {} }), wwBody = src.slice(wwAt, src.indexOf('\n}\n', wwAt));
        check('map builder B1: wireWbItem (run for real) carries a visible piece\'s texture to the table with its blocksSight, sightType, cover and terrain — whether sent alone or on a map\'s clone, a filled region\'s too — and only as a name of the app\'s own list: of bricks, another case, an address, a prototype\'s name, a number, an object and a text of 300,000 characters only bricks leaves, alone and on a clone, and none at all leaves without the cleaner (no fogcore on the window, or one with no cleanTexture); a piece without one gains none; a hidden textured piece gives nothing (no id, no texture), by true or by any truthy mark; the host\'s own piece untouched',
            !!texOut && texOut.texture === 'bricks' && texOut.blocksSight === true && texOut.sightType === 'wall' && texOut.cover === 'yes' && texOut.terrain === 2 && texOut.color === '#3f3b47' && JSON.stringify(texWall) === texBefore && texIn.texture === 'bricks' && texIn.blocksSight === true && texPoly.texture === 'grass' && texPoly.tip === 'fill'
            && JSON.stringify(texLeft(wwiT)) === JSON.stringify(texKeptW) && JSON.stringify(texLeft(wwi)) === JSON.stringify(texGone) && JSON.stringify(texLeft(wwiNoFn)) === JSON.stringify(texGone) && !!texPlainW && !Object.prototype.hasOwnProperty.call(texPlainW, 'texture')
            && texHid === null && texHidT === null && wwBody.split('w.texture').length === 5 && wwBody.split("typeof window !== 'undefined' && window.wpFogCore").length === 2 && /delete w\.fx;/.test(wwBody) && /delete w\.sheet; delete w\.gmInfo; delete w\.frame;/.test(wwBody), JSON.stringify([texOut, texIn, texPoly, texHid, texHidT, texLeft(wwiT).map(r => [String(r[0]).slice(0, 12), String(r[1]).slice(0, 12), r[2]])]));
        // 1.6.2 (backlog 57): a piece's kind of terrain on its way out, the same rule
        const tkOdd = [{ terrain: 3, terrainKind: 'mud' }, { terrain: 3, terrainKind: '<b>x' }, { terrainKind: 'mud' }, { terrain: 1, terrainKind: 'mud' }, { terrain: 3, terrainKind: 7 }, { terrain: 3, terrainKind: 'a'.repeat(300000) }, { terrain: 3 }], tkLeft = wire => tkOdd.map((t, i) => { const own = Object.assign({ id: 'tk' + i, type: 'rect', x: 1 }, t), before = JSON.stringify(own).length, a = wire(own, false), b = wire(JSON.parse(JSON.stringify(own)), true); return [a && Object.prototype.hasOwnProperty.call(a, 'terrainKind') ? a.terrainKind : 'none', b && Object.prototype.hasOwnProperty.call(b, 'terrainKind') ? b.terrainKind : 'none', JSON.stringify(own).length === before]; });
        const tkHid = wwiT({ id: 'tkh', type: 'rect', hidden: true, terrain: 3, terrainKind: 'mud' }, false);
        check('1.6.2 kinds of terrain on the wire (backlog 57; wireWbItem run for real): a shown piece\'s kind leaves only as a short name and only beside a cost of 2 or more, sent alone or on a map\'s clone; markup, a number, a name of 300,000 characters, a kind beside no cost or a cost of 1 leave as nothing; none leaves without the cleaner; a hidden piece gives nothing; the host\'s own piece untouched',
            JSON.stringify(tkLeft(wwiT)) === JSON.stringify([['mud', 'mud', true], ['none', 'none', true], ['none', 'none', true], ['none', 'none', true], ['none', 'none', true], ['none', 'none', true], ['none', 'none', true]])
            && tkLeft(wwiNoFn).every(x => x[0] === 'none' && x[1] === 'none') && tkLeft(wwi).every(x => x[0] === 'none' && x[1] === 'none') && tkHid === null, JSON.stringify(tkLeft(wwiT)));
        // fold B7: the four land patterns of a world map on their way out, as any name of the list. A row of landLeft: the pattern that left alone and on a
        // clone, the piece's name and kind kept, the host's own piece untouched, and a copy handed back
        const LANDW = ['forest', 'mountains', 'sand', 'snow'], landPc = (n, i) => Object.assign({ id: 'lw' + i, x: 100, y: 50, w: 50, h: 50, texture: n, color: '#35532d', layer: 'back', name: 'Land' }, i % 2 ? { type: 'path', tip: 'fill', pts: [[0, 0], [50, 0], [50, 50]] } : { type: 'rect' });
        const landT = o => (o && Object.prototype.hasOwnProperty.call(o, 'texture') ? o.texture : 'none');
        const landLeft = wire => LANDW.concat(['Forest', 'MOUNTAINS', 'Sand', 'SNOW']).map((n, i) => { const own = landPc(n, i), was = JSON.stringify(own), a = wire(own, false), b = wire(JSON.parse(was), true); return [landT(a), landT(b), !!a && !!b && a.name === 'Land' && b.name === 'Land' && a.type === own.type, JSON.stringify(own) === was, !!a && a !== own]; });
        const landWall = LANDW.map((n, i) => { const o = wwiT(Object.assign(landPc(n, i), { blocksSight: true, sightType: 'wall' }), false); return [landT(o), !!o && o.blocksSight, !!o && Object.prototype.hasOwnProperty.call(o, 'name')]; });
        const landHid = LANDW.map((n, i) => [wwiT(Object.assign(landPc(n, i), { hidden: true }), false), wwiT(Object.assign(landPc(n, i), { gmNoteFor: 't1' }), true)]), landRow = (a, b) => [a, b, true, true, true];
        check('fold B7: wireWbItem (run for real) carries the four land patterns of a world map. A shown piece that wears forest, mountains, sand or snow leaves with that pattern, alone and on a map\'s clone, a box and a filled region alike, with its name and its kind. Another case of each name leaves with no pattern. A wall that wears one leaves with the pattern and without its name. None leaves without the cleaner on hand. A hidden piece and a GM note give nothing. The host\'s own piece is untouched',
            JSON.stringify(landLeft(wwiT)) === JSON.stringify(LANDW.map(n => landRow(n, n)).concat([0, 1, 2, 3].map(() => landRow('none', 'none')))) && JSON.stringify(landLeft(wwi)) === JSON.stringify(Array(8).fill(0).map(() => landRow('none', 'none'))) && JSON.stringify(landLeft(wwiNoFn)) === JSON.stringify(landLeft(wwi))
            && JSON.stringify(landWall) === JSON.stringify(LANDW.map(n => [n, true, false])) && JSON.stringify(landHid) === JSON.stringify(LANDW.map(() => [null, null])), JSON.stringify([landLeft(wwiT), landLeft(wwi), landLeft(wwiNoFn), landWall, landHid]));
        // map builder B3: a piece's picture fill on its way out — its path and its repeat through the host's own cleaners, a hidden piece's never
        const PICW = '/saves/images/m1/stone floor.png', picW = { id: 'pw', type: 'rect', x: 100, y: 50, w: 50, h: 50, texSrc: PICW, texTile: 2, color: '#3f3b47' }, picBefore = JSON.stringify(picW), picOut = wwiT(picW, false), picIn = wwiT(JSON.parse(picBefore), true);
        const picHid = wwiT({ id: 'ph', type: 'rect', hidden: true, texSrc: '/saves/images/m1/secret.png', texTile: 1 }, false), picHid2 = wwiT({ id: 'ph2', type: 'path', tip: 'fill', hidden: 1, texSrc: '/saves/images/m1/secret.png' }, true), picNote = wwiT({ id: 'pn', type: 'rect', gmNoteFor: 'x', texSrc: '/saves/images/m1/secret.png' }, false);
        const picOdd = [['/saves/images/m1/a.png', 4], ['/saves/images/m1/a.png', 3], ['/saves/images/m1/a.png', '2'], ['http://x.test/a.png', 1], ['data:image/png;base64,' + 'A'.repeat(300000), 1], ['/saves/images/journal/a.png', 1], ['/saves/images/video/a.png', 1], ['/saves/images/../data.png', 1], ['/saves/images/a.png?x', 1], [5, 2], [{ a: 1 }, 'whole'], [undefined, 4]];
        const picLeft = wire => picOdd.map((v, i) => { const own = { id: 'po' + i, type: 'rect', x: 1 }; if (v[0] !== undefined) own.texSrc = v[0]; own.texTile = v[1]; const was = JSON.stringify(own), a = wire(own, false), b = wire(JSON.parse(was), true), of = o => [o && Object.prototype.hasOwnProperty.call(o, 'texSrc') ? o.texSrc : 'none', o && Object.prototype.hasOwnProperty.call(o, 'texTile') ? o.texTile : 'none']; return [of(a), of(b), JSON.stringify(own) === was]; });
        const NN = ['none', 'none'], picGone = Array(12).fill(0).map(() => [NN, NN, true]), picKept = [[['/saves/images/m1/a.png', 4], ['/saves/images/m1/a.png', 4], true], [['/saves/images/m1/a.png', 'none'], ['/saves/images/m1/a.png', 'none'], true], [['/saves/images/m1/a.png', 'none'], ['/saves/images/m1/a.png', 'none'], true]].concat(picGone.slice(3));
        const [, wwiHalf] = new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')({ wpFogCore: { cleanTexSrc: FCtx.cleanTexSrc } }), picHalf = wwiHalf({ id: 'pq', type: 'rect', texSrc: PICW, texTile: 2 }, false);
        check('map builder B3: wireWbItem (run for real) carries a visible piece\'s picture fill to the table, alone or on a map\'s clone, and only as its cleaners keep it: the path a plain picture path under /saves/images/, the repeat 1, 2, 4 or whole and only beside a path that left; a repeat of 3 or as text leaves the path alone, and a web address, an inline picture of 300,000 characters, the Journal\'s or the video library\'s folder, a path that walks, a query, a number, an object or a repeat with no path leave neither key; none at all leaves without the cleaner (no fogcore on the window, or one without it), and no repeat with the path\'s cleaner alone; a hidden piece and a GM note give nothing; the host\'s own piece untouched',
            !!picOut && picOut.texSrc === PICW && picOut.texTile === 2 && picOut.color === '#3f3b47' && JSON.stringify(picW) === picBefore && picIn.texSrc === PICW && picIn.texTile === 2
            && JSON.stringify(picLeft(wwiT)) === JSON.stringify(picKept) && JSON.stringify(picLeft(wwi)) === JSON.stringify(picGone) && JSON.stringify(picLeft(wwiNoFn)) === JSON.stringify(picGone) && !!picHalf && picHalf.texSrc === PICW && !Object.prototype.hasOwnProperty.call(picHalf, 'texTile')
            && picHid === null && picHid2 === null && picNote === null && wwBody.split('w.texSrc').length === 5 && wwBody.split('w.texTile').length === 5 && !Object.prototype.hasOwnProperty.call(texPlainW, 'texSrc') && !Object.prototype.hasOwnProperty.call(texPlainW, 'texTile'),
            JSON.stringify([picOut, picIn, picHid, picHid2, picNote, picLeft(wwiT).map(r => [String(r[0][0]).slice(0, 30), r[0][1], String(r[1][0]).slice(0, 30), r[1][1], r[2]]), picHalf]));
    })());
    // secrets (R2 #19): a trigger zone's message is GM prep until a token lands in it — never on a copy of the map (the host says it then: triggerFire)
    const trig = { id: 'z1', type: 'trigger', name: 'Ambush point', eventMessage: 'Reveal the three hidden tokens', x: 1, y: 2, w: 100, h: 100 }, trigBefore = JSON.stringify(trig);
    const trigF = wwi(trig, false), trigT = wwi(JSON.parse(JSON.stringify(trig)), true);
    const trigMap = siNew({ id: 'mz', type: 'map', whiteboard: [JSON.parse(JSON.stringify(trig)), { id: 'z2', type: 'trigger', hidden: true, eventMessage: 'secret zone', x: 1, y: 1 }, { id: 'r', type: 'rect', x: 1, y: 1, eventMessage: 'not a trigger' }] });
    check('secrets: wireWbItem (run for real) sends a trigger zone without its message — the zone itself, its name and its box as ever — on a whole map\'s copy and as an item sent alone; a message on a piece of any other kind goes too; a hidden zone not at all; the host\'s own zone keeps its message',
        !!trigF && !('eventMessage' in trigF) && trigF.name === 'Ambush point' && trigF.x === 1 && trigF.w === 100 && trigF.type === 'trigger' && !!trigT && !('eventMessage' in trigT) && JSON.stringify(trig) === trigBefore
        && trigMap.whiteboard.length === 2 && !/Reveal|secret zone|not a trigger|eventMessage/.test(JSON.stringify(trigMap)) && trigMap.whiteboard[0].id === 'z1' && trigMap.whiteboard[1].id === 'r', JSON.stringify([trigF, trigT, trigMap]));
}
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
/* ================= fold B5: a secret door (the map builder, part one) =================
   The owner, 2026-10-10, by prompt: players see "The wall's look" where a secret door stands until it is found, and it is found by "A row, and
   opening it". To the players a secret door is WALL. The host's one rule for a piece on its way out (wireWbItem, through fogcore secretSeen)
   sends it as a wall in the look named for it; the three keys (secret, seenColor, seenTexture) are the GM's and never travel, on any piece; a
   player's app drops them whatever a host sends; a door request naming one is answered as a wall's is. The second review: a plain wall
   leaves the host with NO name, and so does the copy, so a wall and a secret door made the same way and seen in its look differ by id and
   place alone (Build names a piece by its material whatever look was picked, so no table of names by look could match the walls beside a
   secret door). The third review: a plain wall leaves in ONE shape. No name, no group, nothing of a door or of a way through, typed wall,
   and a hex color of six digits in lower case. So a wall as a campaign file writes one (Blocks sight alone, in whatever case), a room's
   walls grouped with its door, and a wall that was once a door or a way through read as the copy beside them does. That holds for a wall
   and a door made the SAME WAY, which is what the sweep in (2c) pairs: the copy keeps the door's other keys, such as its layer, so a door
   made by one tool among walls made by another may still differ by such a key. Some walls have no twin at all, and the suite says so where it holds
   them. A wall that wears a picture. A wall whose color is neither a hex color of six digits nor the word transparent (a theme color,
   a hex of three or of eight digits, a clear color spelled otherwise than the word), or that has no color at all: a secret door is
   seen in a hex color of six digits or, since round two of Match a wall, as the very word transparent, and in nothing else, and a copy
   always has a color. So a see-through wall whose color IS the word has its twin, while one whose clear color a file spelled another
   way (rgba(0, 0, 0, 0)) STILL DIFFERS ON THE WIRE by that text, matched or not: the press answers the word, and the wall leaves as
   written. A wall linked to a room. A wall drawn as a line that wears a pattern or a picture (only a file can give a line one: a copy
   drawn as a line wears no pattern). And a secret door drawn as a line beside wall lines of another width or opacity: a limit ONLY
   UNTIL Match is pressed on it, since the copy keeps the door's own until then.
   Match a wall (the owner, 2026-10-12, by prompt: "The door is then seen with the color, width and opacity of the wall line it meets. Your
   own screen still shows the door as you drew it."). Properties' Match press names the look of the wall line that a door drawn as a line
   meets: seenColor, and three keys of their own, seenWidth, seenOpacity and seenTip, which are the GM's and never travel either. The copy
   then leaves at that width, opacity and nib, and a plain wall drawn as a line leaves in ONE reading (its width as a number, an opacity
   only under 1, a nib of the three), so a wall line from a file and the copy matched to it read alike. Part (2e) holds the match, part
   (3) a player's app, part (6e) the one-module world.
   Round two of Match a wall (what three reviewers of the first build confirmed), held in parts (2f) and (6f) and in the checks above
   them that learned it:
   - NO PLAIN WALL CARRIES A LOCK TO PLAYERS. The board draws a locked piece at 85% on every screen, so a locked wall beside a secret
     door that is not locked, or the other way round, showed. A plain wall and a secret door's copy leave with no locked key. A door that
     is no secret, a wall that leads somewhere, a picture, a text box, a token and a piece that blocks nothing keep theirs. The host's
     own map keeps every lock, so the patch gate still refuses a player's change to a drawing the GM locked.
   - WITH NO FOG CORE AT HAND a matched secret door drawn as a line is still sent in its matched look: the fallback in net.js reads the
     color, the width, the opacity and the nib named, by the tests the core's cleaners make. A box door's fallback is as it was.
   - A SEE-THROUGH WALL GIVES A SEE-THROUGH DOOR: the look named may be the very word transparent, and the press answers it for a wall
     whose color draws nothing.
   - THE WIDTH AS DRAWN: the board stretches a line's stroke with its box, so the press names a width for the door's COPY, in the door's
     own box, and on the wire the two widths may then differ by design. (Which width, round three says: below.)
   Round three of Match a wall (what round two's reviewers and test writers confirmed), held in parts (2e), (2f) and (6f), in a part (6g)
   of its own, and in the patch gate's own checks far above (49 (c), where the gate and playerStroke are run for real). Its rules for
   WHICH wall answers, for the WIDTH and for a CLEAR color were replaced by round four's, below. These three stand as it left them:
   - A half of a line's drawn width is held to 100 px (it was 50).
   - THE PATCH GATE: a player's own drawing that is a wall or a see-through barrier AND locked is answered with the map whole when
     their copy redraws it or leaves it out, since their copy of a wall no longer says locked. A locked drawing that is no wall is
     answered with nothing, as before.
   - A PLAYER'S LINE KEEPS ITS NIB: playerStroke keeps tip as the word square or the word flat, and as nothing else. Never the Fill tip.
   Round four of Match a wall (what round three's two reviewers confirmed), held in part (2f), in part (6g) and in 49 (c). Round five,
   below, kept its seven ranks and changed what feeds them, the directions its width is read along, its clear color and one case of
   its redraw: read each line below with round five's beside it.
   - WHICH WALL ANSWERS. Two lines TOUCH where the gap between them is no more than half of each line's drawn width and 4 px (it was a
     pixel), and are NEAR within those halves and 12 px. Seven ranks. (1) A LOOK that reaches BOTH of the door's ends: 2 for an end a
     wall of that look touches, 1 for one it is near, added, and ONLY where the look reaches both (round three added them whatever
     was reached, so a door that carries on from its own wall and butts on another was handed to the wall it butts on). An end is
     reached from the end point to the wall's stroke, within the wall's half and 4 px or 12 px, and never by a wall that passes the
     door's middle about as near as it passes that end, unless the door lies ON the wall (its two ends and its middle within the
     wall's half and a pixel). A door whose two ends lie within 12 px of each other has no two ends. Walls of one look are those DRAWN
     alike: the color in lower case, the numbers to a thousandth. (2) A wall that is not ASIDE before one that is: aside is a wall
     that runs beside the door, or that crosses its middle clear of both ends. (3) A wall that runs the door's way, within 30
     degrees, 30 included, before one across it: a run is read over 40 px of LINE, cutting inside a long stretch, the wall's on either
     side of the meeting place where that side has half a run of line. (4) A wall the door touches before one it is only near. (5) A
     wall whose own end lies at one of the door's ends before one that passes. (6) The nearer. (7) The first in the map's list. Part
     (2f) keeps round three's twenty scenarios with the answers round four gives, the flipped ones named, and holds each rank in a
     table of round four's own by a pair of walls that the next rank would answer otherwise, each number from both sides.
   - THE WIDTH. A round or a square nib: the copy is drawn as thick as the wall IS drawn where they meet, the wall's width times its
     pen's factor along the WALL'S OWN run there over the door's along the door's run (round three read both along the door's run).
     The flat nib is still read along the door's run on both; where the wall's ribbon there is under a pixel, or the two factors
     differ by more than twice, the copy takes the SQUARE nib at the ribbon's thickness, a pixel at the least. Two lines never resized
     nor turned still give the wall's own number bit for bit, but for a flat wall whose ribbon along the door is under a pixel.
   - A CLEAR COLOR, a box and a line apart: a blank beside the word transparent makes it no color, so a LINE is stroked in ink
     and is not clear, and a BOX gets no fill at all and IS clear again. With no core at hand the fallback reads the plain word
     alone, for a box and a line alike: a limit the suite states where it holds it.
   - THE PATCH GATE'S REDRAW: a redraw that names no nib leaves the host's line round (its square or flat tip is deleted), as its
     drawer's screen shows. A copy that changes only the nib is still no redraw, and a tip of fill is never deleted.
   Round five of Match a wall (what round four's two verifiers and its suites' agents confirmed; the last round before the commit), held
   in part (2f), in the seeded pieces of part (2) and in 49 (c). Every answer it turned is marked FLIPPED where it is held, with what
   round four gave:
   - AN END IN THE STROKE IS REACHED. An end of the door that lies within the wall's half and ONE pixel is reached whatever the door's
     middle does (round four asked the middle too): a door that bows off an uncut wall between its ends, a straight door over a wall
     that bows away under its middle (the wall of a round room), a door that a wall covers from its middle to one end.
   - NOT ASIDE WHERE THE STROKES OVERLAP. A wall is not aside where the door's two ends and its middle all lie within the wall's half
     PLUS the door's half: a wall beside a door within the two halves runs the door's way and answers before a wall across one end
     (round four put it last). Beyond that overlap a wall beside the door is aside, as before.
   - A RING BY ITS LENGTH. A door has two ends unless they lie within the lesser of 12 px and HALF ITS OWN LENGTH of each other, so a
     straight door of 8 or 12 px across a narrow corridor is matched to the corridor again.
   - HALF RUNS. A wall's run is also read over half a run, 20 px, on either side of its stretch: an ell whose last leg onto the door
     is 13 px or more runs the door's way, drawn by hand or with points at its corners alone (round four: 26 px by hand, 20 with
     corner points, one shape with two answers, which that round's suite reported).
   - THE PAIR THAT SPEAKS for a wall is the most alike of the pairs within 4 PX of its nearest gap (round four: within a pixel
     squared), so a wall whose corner lies a few pixels before the door speaks by the leg the door carries on from.
   - THE WIDTH is read along each line AS DRAWN where the two meet: a stretch of 20 px or more by its own direction, a shorter one by
     its run, the door's as the wall's (round four read the door always by its run, and the wall by the run most like the door's).
   - A CLEAR COLOR is read as the board's own rule for a color reads the very text. A text that rule takes is clear as the word in
     any case, a hex color whose alpha is 0, or a lower-case rgba / hsla of four parts whose last is 0. A text it refuses (a blank
     beside the color, RGBA in capitals, an empty text, 41 characters) is clear only on a RECTANGLE or a CIRCLE, which then get no
     fill; a line and a filled region are drawn in ink, a hexagon and a diamond on their own ground, and none of those is clear.
   - THE PATCH GATE'S REDRAW never makes a filled region a line: a nib named for a host piece whose tip is fill is not taken.
   DECIDED in round five, each weighed against measured rates, and held here as it is (no check asserts the opposite): the END credit
   asks the end point within the wall's half and ONE pixel, so a door drawn over an uncut wall whose ends lie farther off, with walls
   of another look at both its ends, is answered by those walls; beyond the overlap of the two strokes a wall beside the door is
   aside; two walls tied on every rank and the gap are decided by the map's list; a matched copy beside the pieces of a wall that was
   resized and then cut is drawn alike and is not their twin number for number (each in its own box, as part (2f) (iv) holds of every
   resized pair); and with no fog core at hand the wire's fallback reads the plain word transparent alone.
   What netcheck sees of the press itself: that a wall line a door touches is met, a see-through barrier among them; the reach by the
   drawn widths and the nib, and its cap; that the wall's own color, opacity and nib are what is answered, and the width as drawn
   where the two meet; and which of several walls answers, rank by rank (part (2f)). What it CANNOT see: what else is no
   wall line to the press (a door, a token, a hidden line, a filled region); the tie-breaks among pairs of stretches that are equally
   alike (the nearer, then the door's earliest stretch); that each stretch's runs are read once and kept; the bound on the work, what a
   tidying of the list of pairs costs, the list too long to be judged, and the answer { over: true };
   how thick Properties says a matched door is drawn (fogcore seenDrawn, inspector.js); the board's own drag on a player's app
   (datamap.js, where a press is handed on three times at the most, and where the two hand-overs that pick the topmost piece take one
   at any level since round five); a door's cut of a resized wall (whiteboard.js doorCut, whose pieces keep the wall's own stretch
   since round four), the eraser's flush, which keeps that stretch too since round five, and Merge Drawings, which reads a resized
   line's points at their place: none of these reaches the wire's code; the nib among what the GM's undo keeps of
   a line its player redrew (io.js, cleanupcheck's); and the upper bound of a seen width where the core is at hand (the wire bounds
   every number at
   1e15 before any rule reads it; the fallback's own bound is seen, on a piece handed over as a clone). And as with every copy, what
   secretSeen leaves at home is covered by the wire's own deletes: a copy that still carried one of the three keys, a lock, or a solid
   opacity of 1, would lose it on its way out. Those are fogcheck's.
   What the one shape COVERS: the look on a player's screen, and every key and value of the piece. What it does NOT cover: the piece's
   place in the map's list, and the floor on both sides of it. A generated dungeon lists its floors, then its walls, then its doors, and a
   door has floor on both sides, so a copy may still be told by where it stands. That is not a key of the piece and no check here asks it.
   What netcheck CANNOT see: whether fogcore secretSeen itself leaves at home the copy's name, group, open or locked word, landing room,
   trap mark, portal's icon, portal's lock and Lock in place. A copy is always a plain wall, and the wire rule takes each of those off a plain wall before
   anything leaves. So every such expectation of a copy in this suite would pass with a secretSeen that kept one (and the same keys in the
   no-core fallback's own list are covered by that same block). fogcheck holds secretSeen itself, in its own checks on it ('B5 what leaves
   with the copy' and 'B5 the copy the players hold' among them): read no "no name" and no "no group" expected below as covering fogcore.
   What this suite does see of secretSeen: the type (a copy still typed door is no plain wall), the way to another map and the link to a
   room (likewise), the door's own pattern and picture, and the look. Each run for real with the real
   fogcore: the rule alone and on a whole map, its fallback with no core at hand, a player's cleaners, the door request branch, the asset
   gate, and the one-module world (the real sanitizeAppState, sendItem, itemDelta, fogCatchUp and patch gate over the real fog.js, with a
   real player page per connection) */
pendingChecks.push((async () => {
    const urlS = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FC = await import(urlS('fogcore.js')), Sx = await import(urlS('systemcore.js')), Fx = await import(urlS('formula.js'));
    const J = v => JSON.stringify(v), ownK = (o, k) => Object.prototype.hasOwnProperty.call(o, k), copyOf = o => JSON.parse(J(o));
    const flat = o => (o && typeof o === 'object' ? J(Object.keys(o).sort().map(k => [k, o[k]])) : String(o));   // a piece as its own keys in order, each with its value: equal only where no key is missing and none is extra
    const KEYS3 = ['secret', 'seenColor', 'seenTexture'], has3 = o => (o && typeof o === 'object' ? KEYS3.filter(k => ownK(o, k)) : ['no piece']);
    // Match a wall (the owner, 2026-10-12, by prompt): a secret door drawn as a line may be seen at the width, the opacity and the nib of the wall
    // line it meets. Three more keys of the GM's, which never travel either, on any piece. KEYS3 stays the tick and the two keys of fold B5
    const KEYSW = ['seenWidth', 'seenOpacity', 'seenTip'], KEYS6 = KEYS3.concat(KEYSW), has6 = o => (o && typeof o === 'object' ? KEYS6.filter(k => ownK(o, k)) : ['no piece']);
    const less = (o, ks) => { const c = copyOf(o); ks.forEach(k => { delete c[k]; }); return c; };
    // Match a wall: the press as inspector.js setItemSeen(w, 'match') makes it. The real secretMatch reads the wall line the door meets among the
    // map's pieces; then each of the three keys is set or taken off by what its cleaner answers, and the color is named only where it is
    // one a secret door can be seen in. The door's own color, width, opacity and nib are not touched. Null where no wall line meets the door.
    // Round two: where there are too many wall lines to tell which one the door meets the answer is { over: true }, and nothing is set
    const matchAs = (door, pieces) => { const hit = FC.secretMatch(door, pieces); if (!hit) return null; if (hit.over === true) return hit;
        const mW = FC.cleanSeenWidth(hit.width), mO = FC.cleanSeenOpacity(hit.opacity), mT = FC.cleanSeenTip(hit.tip), mC = FC.cleanSeenColor(hit.color);
        if (mW === null || mW === undefined) delete door.seenWidth; else door.seenWidth = mW;
        if (mO === null || mO === undefined) delete door.seenOpacity; else door.seenOpacity = mO;
        if (mT === null || mT === undefined) delete door.seenTip; else door.seenTip = mT;
        if (mC) door.seenColor = mC;
        return hit; };
    const GEOK = ['id', 'x', 'y', 'w', 'h', 'baseW', 'baseH', 'pts'], noGeo = o => (o ? J(less(o, GEOK)) : 'nothing');   // a piece as text, but for its id and its geometry: a door and the wall it meets stand at two places
    const SIXWORDS = /"secret"|seenColor|seenTexture|seenWidth|seenOpacity|seenTip/;   // the six keys by name, in a text of what was sent
    // The parts on Match a wall run beside checks that wait on real timers (a sound's parts go out 15 ms apart and are waited for 160 ms). So
    // none of those parts holds the loop for long: each gives it back between its stretches, and the due timers of the other checks run
    const breathe = () => new Promise(r => setTimeout(r, 0));
    // A wall's key whose value is false or null says only that a control was once used on it: the suite's own reading of what leaves without them
    const isOff = v => v === false || v === null, hasOff = o => !!o && Object.keys(o).some(k => isOff(o[k])), noOff = o => { const c = copyOf(o); Object.keys(c).forEach(k => { if (isOff(c[k])) delete c[k]; }); return c; };
    // The second and third reviews of fold B5: a plain wall leaves the host in ONE shape. The suite's own reading of that rule, written out here
    // and never net.js's. First, every reason a piece is NO plain wall and so leaves with what it carries. A piece that blocks sight, by any
    // value that reads as true, or that is a see-through barrier by the word true, is a plain wall. It is none where it is typed a door, is a
    // token or a waiting token, leads to another map, hangs on a room's node, or is a picture or a text box. A piece that blocks nothing is
    // none either ('free')
    const nameWhy = p => { const why = []; if (!p.blocksSight && p.barrier !== true) why.push('free'); if (p.sightType === 'door') why.push('door'); if (p.isChar) why.push('token'); if (p.waiting) why.push('waiting'); if (p.targetMapId) why.push('portal'); if (p.nodeId) why.push('node'); if (p.type === 'image') why.push('picture'); if (p.type === 'text') why.push('text'); return why; };
    // Then the shape. A plain wall carries no name, no group, nothing of a door (open, locked) and nothing of a way through (a landing room, a
    // trap mark, a portal's icon, a portal's lock, nor a way to a map or a link to a room, which a plain wall can hold only as a value that reads as
    // false: null, false, an empty text or a 0). It is typed wall, whatever it was typed or not typed. Its color stands in lower case where
    // it is a hex color of six digits, and as written otherwise: a short hex, a hex with an alpha, a color word and a theme's color stay.
    // Round two of Match a wall: it carries no Lock in place of the GM's either (locked). The board draws a locked piece at 85% on every screen,
    // so a locked wall beside a secret door that is not locked, or the other way round, showed. A door that is no secret, a wall that leads
    // somewhere, a picture, a text box, a token and a piece that blocks nothing keep their lock, as they keep the rest
    const WALL_GOES = ['name', 'groupId', 'doorOpen', 'doorLock', 'targetRoomId', 'trap', 'portalIcon', 'portalLock', 'targetMapId', 'nodeId', 'locked'], HEXDIG = '0123456789abcdefABCDEF';
    const hex6 = c => typeof c === 'string' && c.length === 7 && c.charAt(0) === '#' && c.slice(1).split('').every(ch => HEXDIG.indexOf(ch) >= 0);
    const plainWall = p => nameWhy(p).length === 0;
    // Match a wall: a plain wall DRAWN AS A LINE leaves with the width, the opacity and the nib it is drawn with. The suite's own reading of
    // that, written out here and never net.js's nor fogcore's. A line is a stroke of the pen under any nib: only a filled region is none.
    // Its width is the number stored, or the number a text begins with, where that is above 0 (never more than 1e15), and 3 otherwise. Its
    // opacity is such a number where it is under 1 (never under 0), and otherwise the line is solid, which is written as NO opacity key. Its
    // nib is square or flat where it says so, and round otherwise. So a wall line from a file, with a width that is a text, an opacity of 1
    // or no nib named, leaves as the wall line the pen makes, and as the copy of a secret door matched to it
    const isLineP = p => !!p && p.type === 'path' && p.tip !== 'fill', numRead = v => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN);
    const drawnW = v => { const n = numRead(v); return Number.isFinite(n) && n > 0 ? (n > 1e15 ? 1e15 : n) : 3; };
    const drawnO = v => { const n = numRead(v); return Number.isFinite(n) && n < 1 ? (n < 0 ? 0 : n) : 1; };
    const drawnT = v => (v === 'square' ? 'square' : v === 'flat' ? 'flat' : 'round');
    const lineShape = o => { if (!isLineP(o)) return o; o.strokeWidth = drawnW(o.strokeWidth); const op = drawnO(o.opacity); if (op < 1) o.opacity = op; else delete o.opacity; o.tip = drawnT(o.tip); return o; };   // in place: a line as it is drawn
    const wallShape = p => { const o = less(p, WALL_GOES); o.sightType = 'wall'; if (hex6(o.color)) o.color = o.color.toLowerCase(); return lineShape(o); };   // a copy of the piece, in a plain wall's one shape
    const asSent = p => { const o = less(p, KEYS6); return plainWall(p) ? wallShape(o) : o; };   // a piece that is no secret door, as it leaves: without the six keys, and a plain wall in its one shape
    // Match a wall: the look named for a secret door, by the suite's own reading of what counts (never fogcore's cleaners and never net.js's
    // tests). A seen color counts where it is a hex color of six digits, read in lower case, or (round two) the very word transparent, as a
    // door matched to a see-through wall holds it. A seen width counts where it is a number above 0, at most 1e15; a seen opacity where it is a
    // number from 0 to 1; a seen nib where it is round, square or flat. Anything else names nothing
    const seenC = v => (hex6(v) ? v.toLowerCase() : v === 'transparent' ? 'transparent' : null);
    const seenW = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e15 ? v : null), seenO = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null), seenT = v => (v === 'round' || v === 'square' || v === 'flat' ? v : null);
    // Round five of Match a wall: a color that DRAWS NOTHING, by the suite's own reading, written as a walk over the text and never as the source's patterns. FIRST what the board's own rule for a color TAKES
    // (safecore.js cssColor, which every fill and every stroke of the board passes through): a text of 40 characters at the most that is a # and 3 to 8 hex digits; or rgb, rgba, hsl or hsla in LOWER case, an
    // opening bracket, one or more of digits, dots, commas, blanks and percent signs, and a closing bracket; or 1 to 20 letters; or var(-- then one or more of letters, digits, underscores and hyphens, and a
    // closing bracket. Anything else that rule REFUSES: a blank beside the color, RGBA in capitals, an empty text, 41 characters. To the board such a text is no color at all
    const allOf = (s, ok) => s.length > 0 && s.split('').every(ok), isDigit = ch => ch >= '0' && ch <= '9', isLetter = ch => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'), isBlank = ch => ch.trim() === '', isHexDig = ch => HEXDIG.indexOf(ch) >= 0;
    const fnBody = (c, names) => { const n = names.filter(k => c.indexOf(k + '(') === 0)[0]; return n !== undefined && c.charAt(c.length - 1) === ')' ? c.slice(n.length + 1, -1) : null; };   // what stands between the brackets, where the text is one of those names, an opening bracket, anything at all, and a closing bracket
    const boardTakes = c => { if (typeof c !== 'string' || c.length > 40) return false;
        if (c.charAt(0) === '#') return c.length >= 4 && c.length <= 9 && allOf(c.slice(1), isHexDig);
        const body = fnBody(c, ['rgba', 'hsla', 'rgb', 'hsl']); if (body !== null) return allOf(body, ch => isDigit(ch) || ch === '.' || ch === ',' || ch === '%' || isBlank(ch));
        if (c.indexOf('var(--') === 0) return c.charAt(c.length - 1) === ')' && allOf(c.slice(6, -1), ch => isDigit(ch) || isLetter(ch) || ch === '_' || ch === '-');
        return c.length <= 20 && allOf(c, isLetter); };
    // THEN which text the rule takes draws nothing: the word transparent in any case; a hex color of four digits whose last is 0, or of eight whose last two are; or rgba( or hsla( with exactly FOUR parts
    // between its commas, the first three each of digits, dots, blanks and percent signs, the fourth a 0, or a 0, a dot and zeros, with blanks around it or none. So rgba(255, 0, 0), plain red, does not
    const clearForm = c => { if (c.toLowerCase() === 'transparent') return true;
        if (c.charAt(0) === '#') return (c.length === 5 && c.charAt(4) === '0') || (c.length === 9 && c.slice(7) === '00');
        const body = fnBody(c, ['rgba', 'hsla']), parts = body === null ? [] : body.split(','), last = parts.length === 4 ? parts[3].trim() : '';
        return parts.length === 4 && parts.slice(0, 3).every(p => allOf(p, ch => isDigit(ch) || ch === '.' || ch === '%' || isBlank(ch))) && (last === '0' || (last.indexOf('0.') === 0 && allOf(last.slice(2), ch => ch === '0'))); };
    // LAST, a text the rule refuses: a RECTANGLE and a CIRCLE then get no fill at all, so they draw nothing. A line and a filled region are drawn in ink, and a hexagon and a diamond show their own ground:
    // none of those four is clear. What is no text at all (no color key, null, a number) is clear for no piece
    const drawsNothing = (c, type) => typeof c === 'string' && (boardTakes(c) ? clearForm(c) : (type === 'rect' || type === 'circle'));
    // The fallback (round two): a secret door as it leaves with NO fogcore at hand, by the suite's own reading. It is a wall with nothing of a
    // door, of a way through or of a look of its own, and no Lock in place. A BOX leaves in the Wall material's color, or see-through where its
    // own color is the plain word transparent, and nothing named for it is read. A door drawn as a LINE leaves in the look Match set for it,
    // so that a matched door is sent alike with no core: the color named where it counts, else the Wall material's (or see-through, as a
    // box), and the width, the opacity and the nib named, each where it counts, over the door's own. A seen opacity of 1 is a solid line: no
    // opacity key. And the copy is a plain wall, so a line leaves as it is drawn (lineShape)
    const FB_GOES = ['doorOpen', 'doorLock', 'groupId', 'name', 'texture', 'texSrc', 'texTile', 'targetMapId', 'targetRoomId', 'nodeId', 'trap', 'portalIcon', 'portalLock', 'locked'], WALLC0 = '#3f3b47';
    const fallbackOf = p => { const o = less(p, KEYS6.concat(FB_GOES)), own = p.color === 'transparent' ? 'transparent' : WALLC0; o.sightType = 'wall';
        if (!isLineP(p)) { o.color = own; return o; }
        const c = seenC(p.seenColor), sw = seenW(p.seenWidth), so = seenO(p.seenOpacity), st = seenT(p.seenTip);
        o.color = c !== null ? c : own; if (sw !== null) o.strokeWidth = sw; if (so !== null) o.opacity = so; if (st !== null) o.tip = st;
        return lineShape(o); };
    const mkWire = win => new Function('window', '"use strict";\n' + siSrc() + '\nreturn [sanitizeItem, wireWbItem];')(win);
    const [siS, wwiS] = mkWire({ wpFogCore: FC });

    // ---- (1) the host's one rule (wireWbItem), with the real fogcore ----
    // A door as Build lays one, then opened, locked and grouped by the GM, wearing a pattern and a picture of its own, ticked Secret
    const PIC = '/saves/images/k/vault door.png', OAK = '#6b4a2a', WALLC = '#3f3b47', BOX = { type: 'rect', x: 100, y: 50, w: 50, h: 50 };
    const D = (id, over) => Object.assign({ id }, BOX, { blocksSight: true, sightType: 'door', secret: true, doorOpen: true, doorLock: true, groupId: 'g_vault', texture: 'planks', color: OAK, texSrc: PIC, texTile: 2, layer: 'back-mid', cover: 'yes', height: 3 }, over || {});
    const wallOf = (id, more) => Object.assign({ id }, BOX, { blocksSight: true, sightType: 'wall', layer: 'back-mid', cover: 'yes', height: 3 }, more || {});
    const LINE = { type: 'path', tip: 'square', strokeWidth: 6, x: 200, y: 50, w: 6, h: 50, baseW: 6, baseH: 50, pts: [[0, 0], [0, 50]], layer: 'back-mid' };   // a door drawn as a line (the pen's Wall line)
    const GATE = { type: 'rect', x: 300, y: 50, w: 50, h: 50, barrier: true, blastStop: true };   // a see-through barrier, ticked Stops blasts
    const TRI = [[0, 0], [50, 0], [50, 50]];
    const secretCases = [   // [the host's piece, what leaves]
        [D('sdA', { name: 'Door', seenColor: '#2B2B33', seenTexture: 'stone' }), wallOf('sdA', { color: '#2b2b33', texture: 'stone' })],   // the look the GM named, the color lower-cased; the copy has no name, whatever the door is called
        [D('sdB', { name: 'SENTINEL_VAULT' }), wallOf('sdB', { color: WALLC, texture: 'bricks' })],   // no look named: the Wall material's look, and no name with it
        [D('sdC'), wallOf('sdC', { color: WALLC, texture: 'bricks' })],   // a door with no name: the copy has none either
        [D('sdD', { name: 'Door', seenColor: '#445566', seenTexture: '' }), wallOf('sdD', { color: '#445566' })],   // Plain color: no pattern at all
        [D('sdE', { seenColor: 'url(//x.test/c)', seenTexture: 'Bricks' }), wallOf('sdE', { color: WALLC, texture: 'bricks' })],   // a look a save held that is no color and no name of the list
        [D('sdF', { seenColor: 7, seenTexture: { a: 1 } }), wallOf('sdF', { color: WALLC, texture: 'bricks' })],
        [D('sdG', { type: 'hexagon' }), wallOf('sdG', { type: 'hexagon', color: WALLC, texture: 'bricks' })],
        [Object.assign({ id: 'sdH' }, GATE, { sightType: 'door', color: 'transparent', secret: true, doorOpen: true, doorLock: true, name: 'SENTINEL_FORCE_GATE' }), Object.assign({ id: 'sdH' }, GATE, { sightType: 'wall', color: 'transparent' })],   // a see-through barrier's door stays clear, and it has no name, as no copy has
        [Object.assign({ id: 'sdI' }, GATE, { sightType: 'door', color: 'transparent', secret: true, seenColor: '#102030' }), Object.assign({ id: 'sdI' }, GATE, { sightType: 'wall', color: '#102030', texture: 'bricks' })],   // ... until the GM names a color
        [Object.assign({ id: 'sdJ' }, GATE, { sightType: 'door', color: '#335577', texture: 'ripples', secret: true, doorOpen: true }), Object.assign({ id: 'sdJ' }, GATE, { sightType: 'wall', color: WALLC, texture: 'bricks' })],   // a barrier's door with a look of its own
        [Object.assign({ id: 'sdK' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, name: 'Door', texture: 'planks', secret: true, doorLock: true, seenTexture: 'stone' }), Object.assign({ id: 'sdK' }, LINE, { blocksSight: true, sightType: 'wall', color: WALLC })],   // a line wears a color alone, and no name
        [Object.assign({ id: 'sdL' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, doorOpen: true, seenColor: '#A0B0C0' }), Object.assign({ id: 'sdL' }, LINE, { blocksSight: true, sightType: 'wall', color: '#a0b0c0' })],
        [Object.assign({ id: 'sdM' }, LINE, { tip: 'fill', pts: TRI, blocksSight: true, sightType: 'door', color: OAK, secret: true }), Object.assign({ id: 'sdM' }, LINE, { tip: 'fill', pts: TRI, blocksSight: true, sightType: 'wall', color: WALLC, texture: 'bricks' })],   // a filled region is no line
        [D('sdN', { targetMapId: 'mB', targetRoomId: 'room_treasury', portalIcon: 'Door', portalLock: true, trap: true, nodeId: 'r1' }), wallOf('sdN', { color: WALLC, texture: 'bricks' })],   // a secret door that is also a portal: no way through on the players' copy, and no landing room
        [Object.assign({ id: 'sdO' }, GATE, { sightType: 'door', color: 'transparent', secret: true, seenTexture: 'grass' }), Object.assign({ id: 'sdO' }, GATE, { sightType: 'wall', color: WALLC, texture: 'grass' })],   // a pattern named on a see-through door: the Wall's color under it
        [Object.assign({ id: 'sdS' }, GATE, { sightType: 'door', color: 'rgba(0, 0, 0, 0)', secret: true, seenTexture: '' }), Object.assign({ id: 'sdS' }, GATE, { sightType: 'wall', color: 'transparent' })],   // see-through by another spelling, Plain color named: still clear
        [Object.assign({ id: 'sdQ' }, LINE, { tip: 'flat', blocksSight: true, sightType: 'door', color: OAK, secret: true, seenTexture: 'stone' }), Object.assign({ id: 'sdQ' }, LINE, { tip: 'flat', blocksSight: true, sightType: 'wall', color: WALLC })],   // the third review of fold B5: the flat nib draws a line too. The color alone, though a pattern was named for it
        [Object.assign({ id: 'sdQ2' }, LINE, { tip: 'flat', blocksSight: true, sightType: 'door', color: OAK, secret: true }), Object.assign({ id: 'sdQ2' }, LINE, { tip: 'flat', blocksSight: true, sightType: 'wall', color: WALLC })],   // ... and with no look named: the Wall material's color, and no bricks with it
        [Object.assign({ id: 'sdQ3' }, LINE, { tip: 'round', blocksSight: true, sightType: 'door', color: OAK, texture: 'planks', secret: true, seenColor: '#E9E9F0', seenTexture: 'bricks' }), Object.assign({ id: 'sdQ3' }, LINE, { tip: 'round', blocksSight: true, sightType: 'wall', color: '#e9e9f0' })],   // the round nib alike: the color named for it and no pattern
        // the second reader of the third review: a see-through secret door drawn as a LINE with a pattern named for it. A line wears no pattern, so the name ends nothing: it stays clear, flat nib and round
        [Object.assign({ id: 'sdQ4' }, LINE, { tip: 'flat', barrier: true, sightType: 'door', color: 'transparent', secret: true, seenTexture: 'stone' }), Object.assign({ id: 'sdQ4' }, LINE, { tip: 'flat', barrier: true, sightType: 'wall', color: 'transparent' })],
        [Object.assign({ id: 'sdQ5' }, LINE, { tip: 'round', barrier: true, sightType: 'door', color: 'transparent', secret: true, seenTexture: 'stone' }), Object.assign({ id: 'sdQ5' }, LINE, { tip: 'round', barrier: true, sightType: 'wall', color: 'transparent' })],
        [D('sdT', { name: 'SENTINEL_VAULT', seenColor: '#4A4753', seenTexture: 'stone' }), wallOf('sdT', { color: '#4a4753', texture: 'stone' })],   // the second review of fold B5: the City wall's own look, and no name. No table gives a copy a name any more
        [D('sdU', { seenColor: '#a8552f', seenTexture: 'pantiles' }), wallOf('sdU', { color: '#a8552f', texture: 'pantiles' })],   // a building's look under pantiles, as the city generator lays one: no name
        [D('sdX', { name: 'Door', seenColor: '#4a4753', seenTexture: 'bricks' }), wallOf('sdX', { color: '#4a4753', texture: 'bricks' })],   // the City wall's color over another pattern: no name, as under every look
        [Object.assign({ id: 'sdV' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, seenColor: '#4a4753' }), Object.assign({ id: 'sdV' }, LINE, { blocksSight: true, sightType: 'wall', color: '#4a4753' })],   // a line in the City wall's color: no name
        [Object.assign({ id: 'sdW' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, name: 'Door', secret: true, seenColor: '#7a3f33' }), Object.assign({ id: 'sdW' }, LINE, { blocksSight: true, sightType: 'wall', color: '#7a3f33' })],   // a line in a roof's color, the door named Door: no name
        // fold B7: a look that names one of the four land patterns of a world map is worn as any other, and a door's own land pattern stays at home
        [D('sdY1', { seenColor: '#2F5D3A', seenTexture: 'forest' }), wallOf('sdY1', { color: '#2f5d3a', texture: 'forest' })],
        [D('sdY2', { type: 'hexagon', texture: 'sand', seenTexture: 'mountains' }), wallOf('sdY2', { type: 'hexagon', color: WALLC, texture: 'mountains' })],   // its own pattern is sand: seen as mountains
        [Object.assign({ id: 'sdY3' }, GATE, { sightType: 'door', color: 'transparent', secret: true, seenTexture: 'sand' }), Object.assign({ id: 'sdY3' }, GATE, { sightType: 'wall', color: WALLC, texture: 'sand' })],   // named on a see-through door: the Wall's color under it
        [Object.assign({ id: 'sdY4' }, LINE, { tip: 'fill', pts: TRI, blocksSight: true, sightType: 'door', color: OAK, secret: true, seenColor: '#E8EEF2', seenTexture: 'snow' }), Object.assign({ id: 'sdY4' }, LINE, { tip: 'fill', pts: TRI, blocksSight: true, sightType: 'wall', color: '#e8eef2', texture: 'snow' })],   // a filled region wears it
        [Object.assign({ id: 'sdY5' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, seenTexture: 'snow' }), Object.assign({ id: 'sdY5' }, LINE, { blocksSight: true, sightType: 'wall', color: WALLC })],   // a line wears a color alone
        [D('sdY6', { texture: 'forest', seenTexture: 'Forest' }), wallOf('sdY6', { color: WALLC, texture: 'bricks' })],   // another case names nothing, and its own forest stays at home
        [D('sdY7', { texture: 'snow' }), wallOf('sdY7', { color: WALLC, texture: 'bricks' })],   // no look named: its own snow stays at home
        [D('sdY8', { texture: 'sand', seenColor: '#445566', seenTexture: '' }), wallOf('sdY8', { color: '#445566' })],   // seen as a plain color: no pattern at all, and its own sand stays at home
        // Match a wall, round two. A look named as the word transparent, which a door matched to a see-through wall holds: nothing is drawn, as
        // for that wall. On a box with no pattern named, with Plain color named, and on a line, whatever pattern is named for it. A pattern
        // named with it on a box is worn, over nothing. Another case of the word, and the word with a space, name nothing
        [D('sdZ1', { seenColor: 'transparent' }), wallOf('sdZ1', { color: 'transparent' })],   // an oak door with planks and a picture of its own, seen as nothing drawn: no bricks under it
        [D('sdZ2', { seenColor: 'transparent', seenTexture: '' }), wallOf('sdZ2', { color: 'transparent' })],
        [D('sdZ3', { seenColor: 'transparent', seenTexture: 'stone' }), wallOf('sdZ3', { color: 'transparent', texture: 'stone' })],   // a pattern named with it: worn, and the color still the word
        [Object.assign({ id: 'sdZ4' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, seenColor: 'transparent', seenTexture: 'stone' }), Object.assign({ id: 'sdZ4' }, LINE, { blocksSight: true, sightType: 'wall', color: 'transparent' })],   // a line: no pattern, so it is clear
        [D('sdZ5', { seenColor: 'Transparent' }), wallOf('sdZ5', { color: WALLC, texture: 'bricks' })],   // another case of the word names nothing
        [Object.assign({ id: 'sdZ6' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, seenColor: ' transparent' }), Object.assign({ id: 'sdZ6' }, LINE, { blocksSight: true, sightType: 'wall', color: WALLC })],   // nor does the word behind a space
        // ... and the GM's Lock in place on a secret door: the copy has none, as no plain wall has, on a box and on a line
        [D('sdZ7', { locked: true }), wallOf('sdZ7', { color: WALLC, texture: 'bricks' })],
        [Object.assign({ id: 'sdZ8' }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, locked: true, seenColor: '#A0B0C0' }), Object.assign({ id: 'sdZ8' }, LINE, { blocksSight: true, sightType: 'wall', color: '#a0b0c0' })]
    ];
    const leave = (wire, piece) => { const was = J(piece), alone = wire(piece, false), onClone = wire(copyOf(piece), true); return { alone, onClone, kept: J(piece) === was && alone !== piece }; };
    const SECRET_WORDS = /secret|seenColor|seenTexture|doorOpen|doorLock|groupId|g_vault|texSrc|texTile|vault door|6b4a2a|335577|planks|ripples|SENTINEL|"Door"|"door"|"name"|"Wall"|City wall|Building/;
    const secGot = secretCases.map(c => leave(wwiS, c[0]));
    check('map builder B5, a secret door on its way out (wireWbItem, run for real with the real fogcore): a door ticked Secret leaves as a WALL, sent alone or on a map\'s clone, exactly the wall and nothing more: its type reads wall, it wears the color and pattern the GM named for it (the color lower-cased, Plain color as no pattern) or the Wall material\'s where none or none that cleans is named, and it carries no tick, no named look, no open or locked word, no group, no pattern, color or picture of its own and no name at all: whatever the door is called, and whether the look is the Wall material\'s, the City wall\'s, a Building\'s under its roof or any other, on a box and on a line alike; a look that names forest, mountains, sand or snow, the four land patterns of fold B7, is worn as any pattern is, another case of one names nothing, and a door\'s own land pattern never leaves; a see-through barrier\'s door stays clear until a color is named for it, a door drawn as a line wears a color and never a pattern, whatever nib of the pen drew it, the flat one too, so a see-through door drawn as a line stays clear though a pattern is named for it, while a filled region and a hexagon wear both; a look named as the very word transparent, which a door matched to a see-through wall holds, leaves as nothing drawn, on a box with no bricks under it and on a line, while a pattern named with it on a box is worn over nothing, and another case of the word or the word behind a space names nothing; a secret door locked in place leaves with no locked key, on a box and on a line; the host\'s own piece is left exactly as it was',
        secretCases.every((c, i) => flat(secGot[i].alone) === flat(c[1]) && flat(secGot[i].onClone) === flat(c[1]) && secGot[i].kept) && !SECRET_WORDS.test(J(secGot.map(g => [g.alone, g.onClone]))) && secGot.every(g => !!g.alone && !!g.onClone && !ownK(g.alone, 'name') && !ownK(g.onClone, 'name')) && secretCases.filter(c => ownK(c[0], 'name')).length === 8
        && secretCases.filter(c => c[0].locked === true).length === 2 && secGot.every(g => !ownK(g.alone, 'locked') && !ownK(g.onClone, 'locked')) && secretCases.filter(c => c[0].seenColor === 'transparent' && c[1].color === 'transparent').length === 4 && secretCases.filter(c => c[1].color === 'transparent' && ownK(c[1], 'texture')).length === 1,
        J(secretCases.map((c, i) => [c[0].id, flat(secGot[i].alone) === flat(c[1]), flat(secGot[i].onClone) === flat(c[1]), secGot[i].kept]).filter(r => !(r[1] && r[2] && r[3])).concat([secGot[0].alone])));
    const STRAY = { seenColor: '#112233', seenTexture: 'grass' };
    const notSecret = [less(D('ndA', Object.assign({ name: 'Door' }, STRAY)), ['secret'])]   // a door that was found: the look named for it is still on the host's piece
        .concat([1, 'true', 'yes', {}, [], false, null, 0].map((v, i) => D('ndS' + i, Object.assign({ secret: v, name: 'Door' }, STRAY))))   // a tick that is not the word true
        .concat([
            Object.assign({ id: 'ndW' }, BOX, { blocksSight: true, sightType: 'wall', secret: true, color: WALLC, texture: 'bricks', name: 'Wall' }, STRAY),   // a wall
            Object.assign({ id: 'ndV' }, BOX, { blocksSight: true, secret: true, color: WALLC }),   // a wall with no type named
            Object.assign({ id: 'ndP' }, BOX, { secret: true, seenTexture: '', name: 'Rug', color: '#aa0000' }),   // a plain piece
            Object.assign({ id: 'ndT' }, BOX, { sightType: 'door', secret: true, doorOpen: true }),   // a door's type on a piece that blocks nothing
            Object.assign({ id: 'ndU' }, BOX, { blocksSight: 1, sightType: 'door', secret: true, doorOpen: true }, STRAY),   // a flag that is not true
            Object.assign({ id: 'ndI', type: 'image', src: '/saves/images/k/gate.png', x: 1, y: 2, w: 50, h: 50, blocksSight: true, sightType: 'door', secret: true, doorOpen: true }, STRAY),   // a picture piece: its picture is the door
            Object.assign({ id: 'ndC', type: 'image', isChar: true, charName: 'Mimic', x: 1, y: 2, w: 50, h: 50, blocksSight: true, sightType: 'door', secret: true }, STRAY),   // a token
            Object.assign({ id: 'ndQ', type: 'circle', waiting: 1, ownerId: 'u_a', x: 1, y: 2, w: 50, h: 50, blocksSight: true, sightType: 'door', secret: true })   // a waiting token
        ]);
    const nsGot = notSecret.map(p => leave(wwiS, p)), nsWant = notSecret.map(p => flat(asSent(p))), nsAt = id => notSecret.findIndex(p => p.id === id);
    check('map builder B5 (wireWbItem, run for real): only a door ticked by the word true is sent as a wall. A door that is not secret but still holds the look once named for it, and one whose tick is 1, a text, an object, a list, false, null or 0, leave as the doors they are, open, locked, grouped, in their own color, pattern, picture and name. A wall ticked Secret leaves as the wall it is, in a plain wall\'s one shape: without its name and typed wall. A wall with no type named leaves typed wall too. A plain piece under its own name, a door\'s type on a piece that blocks nothing or whose flag is not true, a picture piece, a token and a waiting token ticked Secret leave as they are. Not one of them carries the tick or either key of the look, alone or on a clone, and the host\'s own piece is untouched',
        notSecret.every((p, i) => flat(nsGot[i].alone) === nsWant[i] && flat(nsGot[i].onClone) === nsWant[i] && nsGot[i].kept && has3(nsGot[i].alone).length === 0 && has3(nsGot[i].onClone).length === 0)
        && nsGot.slice(0, 9).every(g => g.alone.sightType === 'door' && g.alone.doorOpen === true && g.alone.doorLock === true && g.alone.groupId === 'g_vault' && g.alone.color === OAK && g.alone.texture === 'planks' && g.alone.texSrc === PIC && g.alone.texTile === 2 && g.alone.name === 'Door')
        && notSecret[nsAt('ndW')].name === 'Wall' && !ownK(nsGot[nsAt('ndW')].alone, 'name') && !ownK(nsGot[nsAt('ndW')].onClone, 'name') && nsGot[nsAt('ndP')].alone.name === 'Rug' && nsGot[nsAt('ndP')].onClone.name === 'Rug'
        && !ownK(notSecret[nsAt('ndV')], 'sightType') && ['ndW', 'ndV'].every(id => nsGot[nsAt(id)].alone.sightType === 'wall' && nsGot[nsAt(id)].onClone.sightType === 'wall')
        && ['ndT', 'ndU'].every(id => nsGot[nsAt(id)].alone.sightType === 'door' && nsGot[nsAt(id)].alone.doorOpen === true && nsGot[nsAt(id)].onClone.doorOpen === true),
        J(notSecret.map((p, i) => [p.id, flat(nsGot[i].alone) === nsWant[i], flat(nsGot[i].onClone) === nsWant[i], nsGot[i].kept, nsGot[i].alone]).filter(r => !(r[1] && r[2] && r[3])).concat([nsGot[0].alone])));
    const hidGot = [wwiS(D('hdA', { hidden: true }), false), wwiS(copyOf(D('hdB', { hidden: true })), true), wwiS(D('hdC', { hidden: 1 }), false), wwiS(D('hdD', { gmNoteFor: 'r1' }), false)];
    const mapS = () => ({ id: 'mS', type: 'map', meta: { title: 'Cellar' }, rooms: [], links: [], whiteboard: secretCases.map(c => copyOf(c[0])).concat([copyOf(notSecret[0]), D('hdE', { hidden: true, name: 'SENTINEL_HIDDEN' })]) });
    const hostS = mapS(), wasS = J(hostS), outS = siS(hostS);
    check('map builder B5 (wireWbItem and sanitizeItem, run for real): a hidden secret door gives nothing at all, alone or on a clone, hidden by true or by any truthy mark, and so does a GM note card ticked Secret; a whole map\'s copy holds each secret door as its wall in the host\'s own order, the found door as the door it is and the hidden one not at all, with no tick and no key of the look anywhere in it; the host\'s own map is left exactly as it was',
        J(hidGot) === J([null, null, null, null]) && J(outS.whiteboard.map(flat)) === J(secretCases.map(c => flat(c[1])).concat([nsWant[0]])) && J(hostS) === wasS && !/"secret"|seenColor|seenTexture|SENTINEL|hdE/.test(J(outS)),
        J([hidGot, outS.whiteboard.map(w => w.id + ':' + w.sightType)]));

    // ---- (2) the fallback: no fogcore at hand, or one that knows no secret door ----
    const [siN, wwiN] = mkWire({}), [, wwiO] = mkWire({ wpFogCore: {} }), [, wwiH] = mkWire({ wpFogCore: { cleanTexture: FC.cleanTexture, cleanTexSrc: FC.cleanTexSrc, cleanTexTile: FC.cleanTexTile } });   // wwiH: the pattern's and the picture's cleaners at hand, so only the fallback's own list keeps the door's look at home
    const bare = fallbackOf;   // the fallback's own rule, by the suite's reading at the top of this part: a box with no look named read, only the plain word see-through; a line in the look Match set for it
    // ... and what that reading must give for the cases above, said outright, so that the reading itself is held: [the door, its color with no core]
    const FB_COLORS = [['sdA', WALLC], ['sdD', WALLC], ['sdH', 'transparent'], ['sdI', 'transparent'], ['sdO', 'transparent'], ['sdK', WALLC], ['sdL', '#a0b0c0'], ['sdQ3', '#e9e9f0'], ['sdQ4', 'transparent'], ['sdV', '#4a4753'], ['sdW', '#7a3f33'], ['sdY5', WALLC], ['sdM', WALLC], ['sdY4', WALLC],
        ['sdZ1', WALLC], ['sdZ3', WALLC], ['sdZ4', 'transparent'], ['sdZ5', WALLC], ['sdZ6', WALLC], ['sdZ7', WALLC], ['sdZ8', '#a0b0c0']];
    const fbGot = [wwiN, wwiO, wwiH].map(wire => secretCases.map(c => leave(wire, c[0]))), fbPlain = [wwiN, wwiO, wwiH].map(wire => notSecret.map(p => leave(wire, p)));
    const mapN = siN(mapS());
    const fbColGot = [wwiN, wwiO, wwiH].map((wire, n) => FB_COLORS.map(r => { const at = secretCases.findIndex(c => c[0].id === r[0]), g = at >= 0 ? fbGot[n][at] : null; return [r[0], g && g.alone ? g.alone.color : 'no such case', g && g.onClone ? g.onClone.color : 'no such case']; }));
    check('map builder B5, the fallback (wireWbItem, run for real with no fogcore on the window, with one that knows no secret door, and with one that holds only the pattern\'s and the picture\'s cleaners): a secret door still leaves as a wall, with no open or locked word, no group, no name, no Lock in place, no way through and no pattern or picture of its own, a wall\'s door, a see-through barrier\'s and a line alike, alone or on a clone, the host\'s own piece untouched. A box leaves in the Wall material\'s color #3f3b47 (one that is see-through by the plain word left so), whatever color and pattern are named for it, the word transparent among them. Round two of Match a wall: a door drawn as a line leaves in the color named for it where that is a hex color of six digits, in lower case, or the very word transparent, so that a matched door is sent alike with no core, and otherwise in the Wall material\'s color, or see-through where its own color is the plain word; a filled region is no line. And no piece of any kind leaves with the tick or with any key of the look, on a whole map either, where each secret door stands as that same wall',
        fbGot.every(per => per.every((g, i) => flat(g.alone) === flat(bare(secretCases[i][0])) && flat(g.onClone) === flat(bare(secretCases[i][0])) && g.kept)) && !SECRET_WORDS.test(J(fbGot.map(per => per.map(g => [g.alone, g.onClone]))))
        && fbColGot.every(per => J(per) === J(FB_COLORS.map(r => [r[0], r[1], r[1]]))) && FB_COLORS.length === 21
        && fbPlain.every(per => per.every(g => has6(g.alone).length === 0 && has6(g.onClone).length === 0 && g.kept)) && mapN.whiteboard.length === secretCases.length + 1 && mapN.whiteboard.every(w => has6(w).length === 0) && J(mapN.whiteboard.slice(0, secretCases.length).map(flat)) === J(secretCases.map(c => flat(bare(c[0]))))
        && mapN.whiteboard.slice(0, secretCases.length).every(w => w.sightType === 'wall' && !ownK(w, 'doorOpen') && !ownK(w, 'name') && !ownK(w, 'targetMapId') && !ownK(w, 'targetRoomId') && !ownK(w, 'portalLock') && !ownK(w, 'locked') && !ownK(w, 'texture')),
        J([fbColGot[0].filter((r, i) => r[1] !== FB_COLORS[i][1] || r[2] !== FB_COLORS[i][1]), secretCases.map((c, i) => [c[0].id, flat(fbGot[0][i].alone) === flat(bare(c[0])), fbGot[0][i].alone]).filter(r => !r[1]).slice(0, 2), fbGot[2][0], fbGot[0][7], fbPlain[0][0].alone]));
    check('map builder B5, the fallback leaves every other piece as the piece it is: with the pattern\'s and the picture\'s cleaners at hand a found door, a door whose tick is not the word true, a wall and a plain piece leave exactly as they do with the whole core, less the three keys; with no core at all a found door is still a door, open, locked, grouped and in its own color and name; and a plain wall leaves in its one shape with no core at all, with an empty one and with those cleaners alone: the wall named Wall without its name, and the wall with no type named typed wall',
        notSecret.slice(0, -3).every((p, i) => flat(fbPlain[2][i].alone) === nsWant[i] && flat(fbPlain[2][i].onClone) === nsWant[i]) && [0, 1].every(n => ['sightType', 'doorOpen', 'doorLock', 'groupId', 'name', 'color'].every(k => fbPlain[n][0].alone[k] === notSecret[0][k]))
        && [0, 1, 2].every(n => { const g = fbPlain[n][nsAt('ndW')], v = fbPlain[n][nsAt('ndV')]; return !!g.alone && !!g.onClone && g.alone.sightType === 'wall' && !ownK(g.alone, 'name') && !ownK(g.onClone, 'name') && !!v.alone && !!v.onClone && v.alone.sightType === 'wall' && v.onClone.sightType === 'wall'; }),
        J([[0, 1, 2].map(n => [fbPlain[n][nsAt('ndW')].alone, fbPlain[n][nsAt('ndV')].alone]), fbPlain[2][0].alone, fbPlain[0][0].alone]));

    // 4,500 seeded pieces of every kind, each judged by the suite's own reading of the rule (written out here, never fogcore's and never
    // net.js's): which piece is a secret door, the look it wears, what is left of it, and (the second and third reviews) which piece is a
    // plain wall and the one shape it leaves in
    {
        let seedS = 20261010; const rnd = n => { seedS = (Math.imul(seedS, 1103515245) + 12345) >>> 0; return Math.floor((seedS >>> 8) / 16777216 * n); }, pick = list => list[rnd(list.length)];
        const GOODPIC = '/saves/images/k/p.png', put = (o, k, list) => { const v = pick(list); if (v !== undefined) o[k] = v; };
        // Match a wall (2026-10-12): a second seeded sequence of its own, so that the sequence above stands. From it a piece of ANY kind takes a
        // width, an opacity and a nib as the pen, a control or a campaign file may leave them: a number, a text that begins with a number, a text
        // that does not, a 0, a negative, a truth value, a list, an object, null, or no key. And the three seen keys, as a Match press sets them
        // and as a file may hold them. A number past 1e15 is not among them: the wire bounds every number before any rule reads it
        let seedM = 20261012; const rndM = n => { seedM = (Math.imul(seedM, 1664525) + 1013904223) >>> 0; return Math.floor((seedM >>> 8) / 16777216 * n); }, pickM = list => list[rndM(list.length)], putM = (o, k, list) => { const v = pickM(list); if (v !== undefined) o[k] = v; };
        const ODDW = [undefined, undefined, undefined, 3, 6, 6, 0.5, 2.25, 1e15, '8', '4.5px', ' 7 ', '.5', '1e300', '0x10', '', 'wide', '0', '-3', 0, -2, null, true, [5], { n: 5 }];
        const ODDO = [undefined, undefined, undefined, undefined, 1, 1, 0.5, 0.55, 0, 0.999, 1.5, -1, '0.4', '1', ' .25', '1e-3', '2', '-0.5', 'faint', '', null, true, [0.5]];
        const ODDT = [undefined, 'Round', 'SQUARE', ' flat', 'butt', '', null, 5];
        const SEENW = [undefined, undefined, undefined, undefined, undefined, 5, 9, 0.5, 2.25, 12, 1e15, 0, -3, '6', null, true, [4]];
        const SEENO = [undefined, undefined, undefined, undefined, undefined, 0.55, 0.3, 0, 1, 1, 0.999, 1.01, -0.1, '0.5', null, true];
        const SEENT = [undefined, undefined, undefined, undefined, undefined, 'round', 'square', 'flat', 'Round', 'fill', '', 5, null, 'butt'];
        const LINEK = ['strokeWidth', 'opacity', 'tip'];
        const gen = i => {
            const p = { id: 'g' + i, x: rnd(40) * 50, y: rnd(40) * 50, w: 50, h: 50 };
            put(p, 'type', ['rect', 'rect', 'rect', 'hexagon', 'circle', 'diamond', 'path', 'path', 'image', 'text']); if (p.type === 'path') { p.pts = [[0, 0], [0, 50]]; put(p, 'tip', ['square', 'fill', 'round', undefined]); }
            put(p, 'blocksSight', [true, true, true, 1, false, undefined]); put(p, 'barrier', [undefined, undefined, undefined, true, 1]); put(p, 'sightType', ['door', 'door', 'door', 'wall', undefined]); put(p, 'secret', [true, true, true, 1, 'true', false, null, undefined]);
            if (!rnd(12)) p.isChar = true; if (!rnd(15)) p.waiting = 1; if (!rnd(15)) p.hidden = true; if (!rnd(20)) p.gmNoteFor = 'r1';
            put(p, 'doorOpen', [true, undefined]); put(p, 'doorLock', [true, undefined]); put(p, 'groupId', ['g_one', undefined]); put(p, 'name', ['Door', 'Vault', 'Wall', '', undefined]);
            put(p, 'color', [OAK, 'transparent', 'transparent', WALLC, '#ABCDEF', undefined]); put(p, 'texture', ['planks', 'bricks', 'Planks', 'url(x)', undefined, undefined]); put(p, 'texSrc', [GOODPIC, 'http://x.test/p.png', undefined, undefined]); put(p, 'texTile', [1, 2, 'whole', 3, undefined]);
            put(p, 'seenColor', ['#2B2B33', '#abc', 'red', 7, undefined, undefined, '#4A4753', '#a8552f']); put(p, 'seenTexture', ['stone', '', 'Stone', 9, undefined, undefined, 'pantiles']);
            if (!rnd(5)) p.targetMapId = 'mB'; if (!rnd(7)) p.portalLock = true; if (!rnd(9)) p.nodeId = 'r1';
            if (!rnd(4)) p.targetRoomId = 'room_' + rnd(3); if (!rnd(5)) p.fill = pick([true, 1, 'x']);   // the review of fold B5: a landing room, and a fill mark on any kind of piece
            // the traces of controls once used, by the piece's number so that the seeded sequence above stands: Is Character unticked, a lock taken off, a link to a room taken away, a door shut again
            if (i % 5 === 1 && !ownK(p, 'isChar')) p.isChar = false; if (i % 4 === 3) p.locked = false; if (i % 7 === 2 && !ownK(p, 'nodeId')) p.nodeId = null; if (i % 6 === 4 && !ownK(p, 'doorOpen')) p.doorOpen = false;
            // the third review of fold B5, by the piece's number too: what a campaign file, or a control once used, leaves on a piece. A line drawn with
            // the pen's flat nib; a type that is another word than wall or door; a trap mark; a portal's icon; and a color that is no hex color of six
            // digits and holds a capital letter: a short hex, a color word, a color as a function, a hex with an alpha
            if (p.type === 'path' && i % 3 === 0) p.tip = 'flat'; if (i % 11 === 5 && p.sightType !== 'door') p.sightType = ['Door', 'window', 'WALL'][i % 3]; if (i % 9 === 4) p.trap = true; if (i % 8 === 6) p.portalIcon = 'Gate';
            if (i % 13 === 7) p.color = ['#ABC', 'DarkRed', 'RGB(140, 123, 90)', '#AABBCCDD'][Math.floor(i / 13) % 4];
            // Round five of Match a wall, by the piece's number too, so that both seeded sequences stand: on one piece in eleven a color that the board's own rule REFUSES (a blank before the word, RGBA in
            // capitals, an empty text, a color with a blank before it), or one that it takes and that draws nothing by another spelling than the plain word
            if (i % 11 === 4) p.color = [' transparent', 'RGBA(0, 0, 0, 0)', '', ' #ff0000', 'rgba(0, 0, 0, 0)', '#0000', 'Transparent'][Math.floor(i / 11) % 7];
            // Match a wall, round two, by the piece's number too, so that both seeded sequences stand. The GM's Lock in place on one piece in four,
            // of any kind: a plain wall and a secret door's copy leave without it, and every other piece keeps it. And on one piece in ten the look
            // named as the very word transparent, which a door matched to a see-through wall holds
            if (i % 4 === 1) p.locked = true; if (i % 10 === 3) p.seenColor = 'transparent';
            // Match a wall, from the second sequence: the width and the opacity of any piece, an odd nib on one line in three (never on a flat one, so
            // the count of flat nibs above stands, and never on or off a filled region), a nib on a piece that is no drawing, and the seen keys
            putM(p, 'strokeWidth', ODDW); putM(p, 'opacity', ODDO);
            if (p.type === 'path' && p.tip !== 'fill' && p.tip !== 'flat') { if (!rndM(3)) { const t = pickM(ODDT); if (t === undefined) delete p.tip; else p.tip = t; } } else if (p.type !== 'path' && !rndM(6)) p.tip = pickM(['square', 'flat', 'butt']);
            if (!rndM(3)) { p.seenWidth = pickM([5, 9, 0.5, 2.25, 12, 3]); p.seenOpacity = pickM([1, 1, 1, 0.55, 0.3, 0]); p.seenTip = pickM(['round', 'square', 'flat']); }   // as a Match press sets them: all three at once, each as its cleaner keeps it
            else { putM(p, 'seenWidth', SEENW); putM(p, 'seenOpacity', SEENO); putM(p, 'seenTip', SEENT); }   // as a file may hold them: any of the three, or none, as anything at all
            return p;
        };
        const NAMES16 = ['flagstones', 'bricks', 'cobbles', 'planks', 'stone', 'hatching', 'ripples', 'grass', 'shingles', 'pantiles', 'slates', 'thatch', 'forest', 'mountains', 'sand', 'snow'];   // the app's own sixteen names, written out: the first eight, the four roof patterns of fold B6 and the four land patterns of fold B7
        const isSecret = p => p.secret === true && (p.blocksSight === true || p.barrier === true) && p.sightType === 'door' && ['rect', 'hexagon', 'circle', 'diamond', 'path'].indexOf(p.type) >= 0 && !p.isChar && !p.waiting && !p.gmNoteFor;
        const isLine = p => p.type === 'path' && p.tip !== 'fill';   // the third review of fold B5: a line is a stroke of any nib, the flat one too. Only a filled region is none
        // Round two: the color named may be the very word transparent (seenC). Then nothing is drawn, as for the see-through wall the door was
        // matched to, unless a pattern is named with it, which only a piece that is no line wears: the pattern then stands over nothing
        // Round five: the door's OWN color draws nothing by the reading at the top of this part (drawsNothing). The plain word, another spelling of a clear color that the board's rule takes, and, on a
        // rectangle or a circle alone, any text that rule refuses (the seeded pieces hold RGB( in capitals, a blank before the word, RGBA in capitals, an empty text and a color with a blank before it)
        const lookOf = p => {
            const col = seenC(p.seenColor), line = isLine(p), pat = NAMES16.indexOf(p.seenTexture) >= 0 && !line;   // pat: a pattern named for it that it wears
            const clear = col === 'transparent' ? !pat : (drawsNothing(p.color, p.type) && NAMES16.indexOf(p.texture) < 0 && p.texSrc !== GOODPIC && !col && !pat);   // clear by the look named, or while the door itself draws nothing and neither a color nor a pattern is named
            return { color: col || (clear ? 'transparent' : WALLC), texture: line ? '' : p.seenTexture === '' ? '' : pat ? p.seenTexture : (clear ? '' : 'bricks') };
        };
        // The looks that are a material's own: color, pattern, and whether its walls are drawn as lines too. Once each gave the copy that
        // material's name. The table of names is gone, so a copy has no name under any of them, and the tallies say such looks were tried
        const MATLOOK = [[WALLC, 'bricks', 1], ['#4a4753', 'stone', 1], ['#7a3f33', 'shingles', 0], ['#a8552f', 'pantiles', 0], ['#4b5563', 'slates', 0], ['#b59a55', 'thatch', 0]];
        const matOf = (p, lk) => { const line = isLine(p); return MATLOOK.findIndex(t => t[0] === lk.color && (line ? t[2] === 1 : t[1] === lk.texture)); };   // 0: the Wall material's look; 1 to 5: a town's; -1: no material's
        // Match a wall: the width, the opacity and the nib a secret door drawn as a line was matched to. A seen width counts where it is a number
        // above 0, at most 1e15; a seen opacity where it is a number from 0 to 1; a seen nib where it is round, square or flat. Each stands in
        // place of the door's own, on a LINE only: on any other kind of piece the three count for nothing. A seen opacity of 1 is a solid line,
        // so the copy then has no opacity key, whatever the door's own. And the copy is a plain wall, so it leaves as it is drawn (lineShape),
        // matched or not
        // (seenW, seenO and seenT, the suite's own reading of what counts, stand at the top of this part.) Round two: the copy has no Lock in place
        const DOOR_GOES = ['doorOpen', 'doorLock', 'groupId', 'texSrc', 'texTile', 'name', 'texture', 'targetMapId', 'targetRoomId', 'nodeId', 'trap', 'portalIcon', 'portalLock', 'locked'];
        const wantOf = p => { const o = less(p, KEYS6.concat(DOOR_GOES)), lk = lookOf(p); o.sightType = 'wall'; o.color = lk.color; if (lk.texture) o.texture = lk.texture;
            if (isLine(p)) { const sw = seenW(p.seenWidth), so = seenO(p.seenOpacity), st = seenT(p.seenTip); if (sw !== null) o.strokeWidth = sw; if (so !== null) o.opacity = so; if (st !== null) o.tip = st; lineShape(o); }
            return noOff(o); };   // no name at all, under any look, and no key that is false or null
        // With no fogcore at hand (round two): the fallback's own rule, by the suite's reading at the top of this part (fallbackOf). A box is a bare
        // wall in the Wall material's color, or left see-through, and nothing named for it is read. A line leaves in the look Match set for it
        const bareOf = p => noOff(fallbackOf(p));
        const asLine = p => Object.assign(copyOf(p), { type: 'path' }, p.tip === 'fill' ? { tip: 'round' } : {}), wouldMove = p => J(lineShape(asLine(p))) !== J(asLine(p));   // the line rule would change this piece's width, opacity or nib, were it a wall line
        const asHeld = (p, k) => J(blocks(p) && isOff(p[k]) ? undefined : p[k]);   // a width, an opacity or a nib exactly as stored (a wall, a door and a barrier leave with no key that is false or null)
        const sortedK = o => { const k = Object.keys(o); return J(k) === J(k.slice().sort()); }, blocks = o => !!o && (!!o.blocksSight || o.barrier === true);
        // The fallback again, said outright of what left with no core, part by part, beside the whole-piece comparison (round two). A box: the
        // Wall material's color, or see-through by the plain word, and its own width, opacity and nib exactly as stored. A line: the color
        // named where it counts, and the width, the opacity and the nib named, each where it counts, over the door's own as drawn
        const fbOdd = (p, f) => { if (!f) return true; const own = p.color === 'transparent' ? 'transparent' : WALLC;
            if (!isLine(p)) return f.color !== own || LINEK.some(k => J(f[k]) !== asHeld(p, k));
            const c = seenC(p.seenColor), sw = seenW(p.seenWidth), so = seenO(p.seenOpacity), st = seenT(p.seenTip);
            return f.color !== (c !== null ? c : own) || typeof f.strokeWidth !== 'number' || f.strokeWidth !== (sw !== null ? sw : drawnW(p.strokeWidth)) || (ownK(f, 'opacity') && !(typeof f.opacity === 'number' && f.opacity < 1)) || (ownK(f, 'opacity') ? f.opacity : 1) !== (so !== null ? so : drawnO(p.opacity)) || f.tip !== (st !== null ? st : drawnT(p.tip)); };
        // Any other piece, as the reading says it leaves, over the values the generator writes. Without the three keys. Its pattern only as a name
        // of the sixteen, its picture only as the one good path, and the repeat only beside that picture and only as 1, 2, 4 or whole (bare: with
        // no cleaner at hand neither a pattern nor a picture leaves). A plain wall in its one shape. And a wall, a door or a barrier with no key
        // whose value is false or null. The source is not asked for any of it
        const sentOf = (p, bare) => { let o = less(p, KEYS6);
            if (bare || NAMES16.indexOf(o.texture) < 0) delete o.texture;
            if (bare || o.texSrc !== GOODPIC) { delete o.texSrc; delete o.texTile; } else if ([1, 2, 4, 'whole'].indexOf(o.texTile) < 0) delete o.texTile;
            if (plainWall(p)) o = wallShape(o);
            return blocks(p) ? noOff(o) : o; };
        // A piece that is no secret door, by the reading at the top of this part (nameWhy): it leaves with its name, unchanged, exactly where it has one and the reading gives a reason to keep it
        const nameBad = (p, o) => { const keep = ownK(p, 'name') && nameWhy(p).length > 0; return !o || ownK(o, 'name') !== keep || (keep && o.name !== p.name); };
        const capital = c => typeof c === 'string' && c !== c.toLowerCase();
        const tally = { pieces: 0, gone: 0, secret: 0, lines: 0, flat: 0, clear: 0, named: 0, plain: 0, walled: 0, towned: 0, called: 0, filled: 0, sorted: 0, asMade: 0, off: 0, offKept: 0, unnamed: 0, byOne: 0, barOnly: 0, barWord: 0, kept: { free: 0, door: 0, token: 0, waiting: 0, portal: 0, node: 0, picture: 0, text: 0 },
            shape: { walls: 0, typed: 0, reworded: 0, upper: 0, asWritten: 0, group: 0, open: 0, lock: 0, room: 0, trap: 0, icon: 0, plock: 0 }, held: { upper: 0, word: 0, keys: 0 },
            line: { walls: 0, wText: 0, wNone: 0, wBad: 0, wCap: 0, oOne: 0, oUnder: 0, oText: 0, oZero: 0, tOdd: 0, tNone: 0, fills: 0, boxes: 0 }, lineKept: { free: 0, door: 0, token: 0, waiting: 0, portal: 0, node: 0 },
            seen: { doors: 0, w: 0, o: 0, solid: 0, t: 0, all: 0, none: 0, noLine: 0, stray: 0, clear: 0, pat: 0, clearLine: 0 },
            lock: { walls: 0, secret: 0, kept: { free: 0, door: 0, token: 0, waiting: 0, portal: 0, node: 0, picture: 0, text: 0 } },
            bare: { boxes: 0, named: 0, lines: 0, col: 0, clear: 0, w: 0, o: 0, solid: 0, t: 0, odd: 0 },
            own: { refused: 0, box: 0, boxWorn: 0, kept: 0, line: 0, spelled: 0, word: 0, noCore: 0 } }, bad = [];
        for (let i = 0; i < 4500; i++) {
            const p = gen(i), was = J(p), a = wwiS(p, false), b = wwiS(copyOf(p), true);
            tally.pieces++;
            if (p.hidden || p.gmNoteFor) { tally.gone++; if (a !== null || b !== null) bad.push([i, 'a hidden piece left', p]); continue; }
            if (J(p) !== was) bad.push([i, 'the host\'s piece changed', p]);
            if (isSecret(p)) {
                const lk = lookOf(p), w = flat(wantOf(p)), mat = matOf(p, lk); tally.secret++; if (isLine(p)) tally.lines++; if (lk.color === 'transparent') tally.clear++; else if (lk.color !== WALLC) tally.named++;
                if (mat === 0) tally.walled++; else if (mat > 0) tally.towned++; if (p.name) tally.called++; if (p.fill) tally.filled++;
                if (flat(a) !== w || flat(b) !== w) bad.push([i, 'a secret door', p, a]);
                if (!a || !b || ownK(a, 'name') || ownK(b, 'name')) bad.push([i, 'a secret door that left with a name', p, a]);
                if (p.type === 'path' && p.tip === 'flat') { tally.flat++; if (!a || !b || ownK(a, 'texture') || ownK(b, 'texture')) bad.push([i, 'a secret door drawn with the flat nib that left in a pattern', p, a]); }
                // Round two. A look named as the word transparent: nothing drawn, with no bricks under it, and a pattern only where one is named for a
                // piece that is no line. And the GM's Lock in place is never on a copy
                if (seenC(p.seenColor) === 'transparent') { tally.seen.clear++; if (lk.texture) tally.seen.pat++; if (isLine(p)) tally.seen.clearLine++;
                    [a, b].forEach(o => { if (!o || o.color !== 'transparent' || (ownK(o, 'texture') ? o.texture : '') !== (isLine(p) || NAMES16.indexOf(p.seenTexture) < 0 ? '' : p.seenTexture)) bad.push([i, 'a secret door seen as nothing drawn that left in a color, or in a pattern nobody named for it', p, o]); }); }
                if (p.locked === true) { tally.lock.secret++; [a, b].forEach(o => { if (!o || ownK(o, 'locked')) bad.push([i, 'a secret door whose copy left locked in place', p, o]); }); }
                // Round five. The door's OWN color, said outright beside the whole-piece comparison. bare: the door has no pattern and no picture of its own, and nothing is named for it that it wears. A text
                // the board's rule refuses leaves a bare rectangle or circle as nothing drawn, and a bare line, hexagon, diamond or filled region in the Wall material's color. With no fogcore only the plain word is clear
                if (typeof p.color === 'string') { const OW = tally.own, box = p.type === 'rect' || p.type === 'circle', bareD = NAMES16.indexOf(p.texture) < 0 && p.texSrc !== GOODPIC && seenC(p.seenColor) === null && (isLine(p) || NAMES16.indexOf(p.seenTexture) < 0), f = wwiN(p, false);
                    if (!boardTakes(p.color)) { OW.refused++;
                        if (bareD && box) { OW.box++; [a, b].forEach(o => { if (!o || o.color !== 'transparent' || ownK(o, 'texture')) bad.push([i, 'a rectangle or a circle whose own color the board refuses, with nothing named for it, that did not leave clear', p, o]); }); }
                        else if (box) { OW.boxWorn++; [a, b].forEach(o => { if (!o || (o.color === 'transparent' && seenC(p.seenColor) !== 'transparent')) bad.push([i, 'a rectangle or a circle with a pattern, a picture or a look named that left clear by a color the board refuses', p, o]); }); }
                        else if (bareD) { if (isLine(p)) OW.line++; else OW.kept++; [a, b].forEach(o => { if (!o || o.color !== WALLC) bad.push([i, 'a line, a hexagon, a diamond or a filled region whose own color the board refuses that did not leave in the Wall material\'s color', p, o]); }); } }
                    else if (p.color === 'transparent') { if (bareD) OW.word++; }
                    else if (clearForm(p.color) && bareD) { OW.spelled++; [a, b].forEach(o => { if (!o || o.color !== 'transparent') bad.push([i, 'a door whose own color draws nothing by another spelling that did not leave clear', p, o]); }); }
                    if (p.color !== 'transparent' && seenC(p.seenColor) !== 'transparent') { OW.noCore++; if (!f || f.color === 'transparent') bad.push([i, 'with no fogcore a door left clear by a color that is not the plain word', p, f]); } }
                // Match a wall. A secret door drawn as a line leaves at the width, the opacity and the nib it was matched to, each where one was set
                // that counts, and at its own as drawn otherwise. One that is no line leaves with its own, exactly as stored, whatever is named for it
                if (isLine(p)) { const sw = seenW(p.seenWidth), so = seenO(p.seenOpacity), st = seenT(p.seenTip), SN = tally.seen; SN.doors++; if (sw !== null) SN.w++; if (so !== null) { SN.o++; if (so === 1 && drawnO(p.opacity) < 1) SN.solid++; } if (st !== null) SN.t++; if (sw !== null && so !== null && st !== null) SN.all++; if (sw === null && so === null && st === null) SN.none++;
                    [a, b].forEach(o => { if (!o || typeof o.strokeWidth !== 'number' || o.strokeWidth !== (sw !== null ? sw : drawnW(p.strokeWidth)) || (ownK(o, 'opacity') ? !(typeof o.opacity === 'number' && o.opacity < 1) : false) || (ownK(o, 'opacity') ? o.opacity : 1) !== (so !== null ? so : drawnO(p.opacity)) || o.tip !== (st !== null ? st : drawnT(p.tip))) bad.push([i, 'a secret door drawn as a line that left at another width, opacity or nib than the one named for it, or its own as drawn', p, o]); });
                } else if (KEYSW.some(k => ownK(p, k))) { tally.seen.noLine++; [a, b].forEach(o => { if (!o || LINEK.some(k => J(o[k]) !== asHeld(p, k))) bad.push([i, 'a secret door that is no line and took a width, an opacity or a nib named for it', p, o]); }); }
            } else {
                const w = flat(wwiS(less(p, KEYS6), false)), why = nameWhy(p), mine = flat(sentOf(p)), SH = tally.shape, HD = tally.held; tally.plain++;   // any other piece: what the same piece without the six keys leaves as
                if (KEYSW.some(k => ownK(p, k))) tally.seen.stray++;
                if (flat(a) !== w || flat(b) !== w || has6(a).length || has6(b).length) bad.push([i, 'another piece', p, a]);
                if (flat(a) !== mine || flat(b) !== mine) bad.push([i, 'a piece that left against the reading', p, a, sentOf(p)]);
                if (nameBad(p, a) || nameBad(p, b)) bad.push([i, 'a name that left or stayed against the reading', p, a, why]);
                if (!why.length) {   // a plain wall. The tallies say that each part of its one shape was reached, and each part is asked of what left
                    if (p.locked === true) { tally.lock.walls++; [a, b].forEach(o => { if (!o || ownK(o, 'locked')) bad.push([i, 'a plain wall that left locked in place', p, o]); }); }   // round two: no plain wall carries the GM's lock to players
                    SH.walls++; if (!ownK(p, 'sightType')) SH.typed++; else if (p.sightType !== 'wall') SH.reworded++; if (hex6(p.color) && capital(p.color)) SH.upper++; else if (capital(p.color)) SH.asWritten++;
                    if (ownK(p, 'groupId')) SH.group++; if (p.doorOpen === true) SH.open++; if (ownK(p, 'doorLock')) SH.lock++; if (ownK(p, 'targetRoomId')) SH.room++; if (ownK(p, 'trap')) SH.trap++; if (ownK(p, 'portalIcon')) SH.icon++; if (ownK(p, 'portalLock')) SH.plock++;
                    [a, b].forEach(o => { if (!o || o.sightType !== 'wall' || WALL_GOES.some(k => ownK(o, k)) || (ownK(p, 'color') ? o.color !== (hex6(p.color) ? p.color.toLowerCase() : p.color) : ownK(o, 'color'))) bad.push([i, 'a plain wall that left in a shape of its own', p, o]); });
                    // Match a wall: a plain wall drawn as a line leaves as it is drawn. The tallies say which odd values were reached. A plain wall
                    // that is no line (a box, a filled region) keeps its width, its opacity and its nib exactly as stored
                    if (isLine(p)) { const LN = tally.line; LN.walls++; if (typeof p.strokeWidth === 'string') LN.wText++; if (!ownK(p, 'strokeWidth')) LN.wNone++; if (ownK(p, 'strokeWidth') && p.strokeWidth !== 3 && drawnW(p.strokeWidth) === 3) LN.wBad++; if (p.strokeWidth === '1e300') LN.wCap++;
                        if (p.opacity === 1 || p.opacity === '1') LN.oOne++; if (drawnO(p.opacity) < 1) LN.oUnder++; if (typeof p.opacity === 'string') LN.oText++; if (p.opacity !== 0 && drawnO(p.opacity) === 0) LN.oZero++; if (ownK(p, 'tip') && drawnT(p.tip) !== p.tip) LN.tOdd++; if (!ownK(p, 'tip')) LN.tNone++;
                        [a, b].forEach(o => { if (!o || typeof o.strokeWidth !== 'number' || o.strokeWidth !== drawnW(p.strokeWidth) || (ownK(o, 'opacity') ? !(typeof o.opacity === 'number' && o.opacity < 1 && o.opacity === drawnO(p.opacity)) : drawnO(p.opacity) !== 1) || o.tip !== drawnT(p.tip)) bad.push([i, 'a wall line that left at another width, opacity or nib than it is drawn with', p, o]); });
                    } else { if (wouldMove(p)) { if (p.type === 'path') tally.line.fills++; else tally.line.boxes++; } [a, b].forEach(o => { if (!o || LINEK.some(k => J(o[k]) !== asHeld(p, k))) bad.push([i, 'a plain wall that is no line and lost its width, opacity or nib as stored', p, o]); }); }
                } else {   // any other piece keeps what a plain wall loses. Counted where it blocks, so that its reason alone spares it
                    // Match a wall: its width, its opacity and its nib too, exactly as stored. Counted for a line the rule would change, under its one reason
                    if (isLine(p) && wouldMove(p) && why.length === 1 && ownK(tally.lineKept, why[0])) tally.lineKept[why[0]]++;
                    // round two: and the GM's Lock in place, which only a plain wall loses. Counted under its reason where that is the piece's ONE reason
                    if (p.locked === true) { if (why.length === 1 && ownK(tally.lock.kept, why[0])) tally.lock.kept[why[0]]++; [a, b].forEach(o => { if (!o || o.locked !== true) bad.push([i, 'a piece that is no plain wall and lost the GM\'s Lock in place', p, o]); }); }
                    [a, b].forEach(o => { if (!o || LINEK.some(k => J(o[k]) !== asHeld(p, k))) bad.push([i, 'a piece that is no plain wall and left at another width, opacity or nib than it holds', p, o]); });
                    if (blocks(p) && hex6(p.color) && capital(p.color)) HD.upper++; if (blocks(p) && ownK(p, 'sightType') && p.sightType !== 'wall' && p.sightType !== 'door') HD.word++; if (blocks(p) && WALL_GOES.slice(1).some(k => ownK(p, k) && !isOff(p[k]))) HD.keys++;
                    [a, b].forEach(o => { if (!o || (ownK(p, 'sightType') ? o.sightType !== p.sightType : ownK(o, 'sightType')) || (ownK(p, 'color') && o.color !== p.color) || WALL_GOES.slice(1).some(k => ownK(p, k) && !(blocks(p) && isOff(p[k])) && o[k] !== p[k])) bad.push([i, 'a piece that is no plain wall and lost what it carried', p, o]); });
                }
                // The tallies of the name rule. A plain wall that had a name: by a flag that is 1 and no barrier, or by the barrier's word alone. A piece
                // that kept its name is counted under its reason only where that is its ONE reason: there that part of the rule alone keeps the name
                if (ownK(p, 'name') && !why.length) { tally.unnamed++; if (p.blocksSight === 1 && p.barrier !== true) tally.byOne++; if (!p.blocksSight) tally.barOnly++; }
                else if (ownK(p, 'name') && why.length === 1) { tally.kept[why[0]]++; if (why[0] === 'free' && p.barrier === 1) tally.barWord++; }
            }
            [a, b].forEach(o => { if (blocks(o)) { tally.sorted++; if (hasOff(p)) tally.off++; if (hasOff(o)) bad.push([i, 'a wall that left with a key that is false or null', p, o]); if (!sortedK(o)) bad.push([i, 'a wall whose keys are in an order of their own', p, Object.keys(o)]); } else { if (hasOff(o)) tally.offKept++; tally.asMade++; if (J(Object.keys(o)) !== J(Object.keys(p).filter(k => ownK(o, k)))) bad.push([i, 'a plain piece whose keys moved', p, Object.keys(o)]); } });   // a wall, a door, a barrier: one order; any other piece: its own
            [wwiN, wwiH].forEach((wire, n) => { const f = wire(p, false); if (has6(f).length || (blocks(f) && hasOff(f)) || (isSecret(p) && (f.sightType !== 'wall' || FB_GOES.some(k => ownK(f, k)) || flat(f) !== flat(bareOf(p)) || fbOdd(p, f))) || (!isSecret(p) && (nameBad(p, f) || flat(f) !== flat(sentOf(p, n === 0))))) bad.push([i, 'the fallback', p, f]); else if (n === 0 && isSecret(p)) { const BR = tally.bare;   // the tallies of the fallback: what was named for a secret door, what of it counted, and what was passed over
                    if (!isLine(p)) { BR.boxes++; if (KEYS6.slice(1).some(k => ownK(p, k))) BR.named++; }
                    else { const c = seenC(p.seenColor), sw = seenW(p.seenWidth), so = seenO(p.seenOpacity), st = seenT(p.seenTip); BR.lines++; if (c === 'transparent') BR.clear++; else if (c !== null) BR.col++; if (sw !== null) BR.w++; if (so !== null) { BR.o++; if (so === 1 && drawnO(p.opacity) < 1) BR.solid++; } if (st !== null) BR.t++;
                        if ((ownK(p, 'seenColor') && c === null) || (ownK(p, 'seenWidth') && sw === null) || (ownK(p, 'seenOpacity') && so === null) || (ownK(p, 'seenTip') && st === null)) BR.odd++; } } });   // the plain wall's shape needs no core: the fallback is held to the same reading, with no pattern and no picture where no cleaner is at hand. Match a wall, round two: with no core a secret door that is a box is a bare wall with nothing named for it read, and one drawn as a line leaves in the look Match set for it, each of the color, the width, the opacity and the nib where it counts
        }
        const K = tally.kept, SH = tally.shape, HD = tally.held, LN = tally.line, LK = tally.lineKept, SN = tally.seen, LO = tally.lock, BR = tally.bare, OW = tally.own;
        check('map builder B5 (wireWbItem, run for real on 4,500 seeded pieces of every kind, each judged by a reading of the rule written out in the suite, which never asks the source): a hidden piece and a GM note card give nothing. A door ticked by the word true, whether a wall\'s door or a see-through barrier\'s, and never a picture piece, a text box, a token or a waiting token, leaves as exactly the wall the reading gives: with no way through and no landing room, in the look named for it, the Wall material\'s, or clear, whatever fill it carries, and with no name at all, whatever the door is called and whether its look is the Wall material\'s, a town material\'s or any other. One drawn as a line leaves with no pattern, under the flat nib too. A plain wall is a piece that blocks sight, by the word true or by any value that reads as true, or is a see-through barrier by the word true, and is no door, no token, no waiting token, no picture and no text box, leads to no other map and hangs on no room\'s node. It leaves in one shape: no name, no group, no open or locked word, no landing room, no trap mark, no portal\'s icon and no portal\'s lock, typed wall whether it had no type or another word, its color in lower case where it is a hex color of six digits and as written where it is a short hex, a hex with an alpha, a color word or a color as a function. A door, a wall that leads to another map, a wall on a room\'s node, a picture, a text box, a token, a waiting token and a piece that blocks nothing each keep their name and all of that, unchanged. A wall, a door and a barrier leave with their keys in one order and with no key whose value is false or null, the trace of a control once used, while every other piece leaves with its own keys in its own order, such a key among them. Round five of Match a wall, with a color laid on one piece in eleven that the board\'s own rule for a color refuses, or that draws nothing by another spelling than the plain word: a secret door with no pattern and no picture of its own and nothing named for it is clear where its OWN color draws nothing, by the suite\'s reading of that rule. A text the rule refuses (a blank before the word, RGBA or RGB in capitals, an empty text, a color with a blank before it) leaves a rectangle and a circle clear, and a line, a hexagon, a diamond and a filled region in the Wall material\'s color; with a pattern, a picture or a look of its own named, no rectangle is clear by such a color; another spelling the rule takes leaves every kind clear; and with no fogcore nothing is clear but by the plain word. Every other piece leaves exactly as the same piece without the six keys does (the tick, the two keys of the look and the three that Match sets), and exactly as the reading says. The host\'s piece is never touched. With no fogcore, or one without the rule, no piece carries any of the six keys, every secret door that is a box is a bare wall in #3f3b47, or left see-through, with nothing named for it read, and every other piece leaves by the same reading, with no pattern and no picture where no cleaner is at hand. Round two of Match a wall, with a lock and a look laid on by the piece\'s number: the GM\'s Lock in place, on one piece in four, leaves on no plain wall and on no secret door\'s copy, with the core or with none, while a door that is no secret, a wall that leads to another map, a wall on a room\'s node, a picture, a text box, a token, a waiting token and a piece that blocks nothing each keep it. A look named as the very word transparent, on one piece in ten, leaves a secret door as nothing drawn, with no bricks under it, and with a pattern only where one is named for a piece that is no line. Match a wall, with the pieces\' widths, opacities, nibs and seen keys drawn from a second seeded sequence: a plain wall drawn as a line, under any nib of the pen, leaves at the width, the opacity and the nib it is drawn with. Its width leaves as a number: the number stored or the number a text begins with, 3 where that is no number above 0 (no key, a text that is no number, a 0, a negative, null, a truth value, a list, an object), and 1e15 for a text that reads as more. Its opacity leaves only where it is under 1, as a number and never under 0: an opacity of 1, a text that reads as 1 or more and anything that is no number leave no opacity key. Its nib leaves as square or flat where it says so and as round otherwise, where none is named too. A plain wall that is a box or a filled region keeps its width, opacity and nib exactly as stored, and so do a door, a wall that leads to another map, a wall on a room\'s node, a token, a waiting token and a piece that blocks nothing, each counted for a line the rule would change. A secret door drawn as a line leaves at the width, the opacity and the nib named for it, each where it is one its cleaner keeps, a seen opacity of 1 as no opacity key whatever the door\'s own, and at its own as drawn where none is named. On a secret door that is no line the three count for nothing: it leaves with its own as stored. With no fogcore a secret door drawn as a line leaves in the look Match set for it, read as the core\'s cleaners read it: in the color named where that is a hex color of six digits or the word transparent, at the width named where that is a number above 0 and at most 1e15, at the opacity named where that is a number from 0 to 1, with 1 as no opacity key, and with the nib named where that is round, square or flat. A text, a 0, a negative, a number out of bounds, a nib the app does not know and a color that is no such color are passed over, and the door\'s own stays, as drawn',
            bad.length === 0 && tally.pieces === 4500 && tally.secret >= 250 && tally.lines >= 40 && tally.flat >= 20 && tally.clear >= 20 && tally.named >= 40 && tally.gone >= 250 && tally.plain >= 2000 && tally.walled >= 60 && tally.towned >= 4 && tally.called >= 100 && tally.filled >= 30 && tally.sorted >= 3000 && tally.asMade >= 1500 && tally.off >= 1500 && tally.offKept >= 300
            && tally.unnamed >= 250 && tally.byOne >= 50 && tally.barOnly >= 18 && tally.barWord >= 18 && K.free >= 90 && K.door >= 250 && K.token >= 20 && K.waiting >= 16 && K.portal >= 60 && K.node >= 25 && K.picture >= 30 && K.text >= 30
            && SH.walls >= 400 && SH.typed >= 180 && SH.reworded >= 28 && SH.upper >= 60 && SH.asWritten >= 28 && SH.group >= 190 && SH.open >= 190 && SH.lock >= 190 && SH.room >= 100 && SH.trap >= 40 && SH.icon >= 45 && SH.plock >= 40 && HD.upper >= 230 && HD.word >= 38 && HD.keys >= 1400
            && LN.walls >= 100 && LN.wText >= 45 && LN.wNone >= 8 && LN.wBad >= 45 && LN.wCap >= 3 && LN.oOne >= 9 && LN.oUnder >= 25 && LN.oText >= 35 && LN.oZero >= 7 && LN.tOdd >= 20 && LN.tNone >= 15 && LN.fills >= 20 && LN.boxes >= 350
            && LK.free >= 40 && LK.door >= 100 && LK.token >= 6 && LK.waiting >= 4 && LK.portal >= 35 && LK.node >= 8
            && SN.doors === tally.lines && SN.w >= 30 && SN.o >= 30 && SN.solid >= 3 && SN.t >= 22 && SN.all >= 16 && SN.none >= 12 && SN.noLine >= 220 && SN.stray >= 3000 && SN.clear >= 25 && SN.pat >= 5 && SN.clearLine >= 6
            && LO.walls >= 100 && LO.secret >= 60 && LO.kept.free >= 40 && LO.kept.door >= 100 && LO.kept.token >= 8 && LO.kept.waiting >= 6 && LO.kept.portal >= 30 && LO.kept.node >= 13 && LO.kept.picture >= 12 && LO.kept.text >= 12
            && BR.boxes >= 200 && BR.named >= 200 && BR.lines === tally.lines && BR.col >= 18 && BR.clear >= 6 && BR.w === SN.w && BR.o === SN.o && BR.solid === SN.solid && BR.t === SN.t && BR.odd >= 30
            && OW.refused >= 20 && OW.box >= 2 && OW.boxWorn >= 6 && OW.line >= 1 && OW.spelled >= 1 && OW.word >= 15 && OW.noCore >= 120,   // round five: few of these 4,500 are doors whose own color alone decides, so the 1,500 pieces below are made for it
            J([bad.slice(0, 2), tally]));   // the counts say that the seeded pieces reach each branch of the rule, each reason of the name rule by itself, and each part of a plain wall's one shape
        // Fold B7: 900 more seeded pieces that name a land pattern of a world map, judged by the same reading. The names are laid on by the piece's number, so
        // the seeded sequence stands: two pieces in three name one for the look (every fifth of all in another case), and two in three wear one of their own
        const LANDN = ['forest', 'mountains', 'sand', 'snow'], isLand = t => LANDN.indexOf(t) >= 0, landTal = { pieces: 0, gone: 0, secret: 0, worn: 0, colored: 0, cased: 0, lines: 0, own: 0, plain: 0, kept: 0, bare: 0 }, landBad = [];
        for (let i = 4500; i < 5400; i++) {
            const p = gen(i), n = LANDN[i % 4];
            if (i % 3 !== 2) p.seenTexture = i % 5 === 0 ? n.toUpperCase() : n; if (i % 3 !== 0) p.texture = LANDN[(i + 1) % 4];
            const was = J(p), a = wwiS(p, false), b = wwiS(copyOf(p), true), f = wwiN(p, false);
            landTal.pieces++;
            if (p.hidden || p.gmNoteFor) { landTal.gone++; if (a !== null || b !== null || f !== null) landBad.push([i, 'a hidden piece left', p]); continue; }
            if (J(p) !== was) landBad.push([i, 'the host\'s piece changed', p]);
            if (!f || ownK(f, 'texture')) landBad.push([i, 'a pattern left with no core at hand', p, f]); else landTal.bare++;
            if (isSecret(p)) {
                const lk = lookOf(p), w = flat(wantOf(p)), line = isLine(p); landTal.secret++;
                if (isLand(lk.texture)) { landTal.worn++; if (lk.color !== WALLC) landTal.colored++; } if (line) landTal.lines++; if (ownK(p, 'seenTexture') && typeof p.seenTexture === 'string' && isLand(p.seenTexture.toLowerCase()) && !isLand(p.seenTexture)) landTal.cased++; if (isLand(p.texture) && lk.texture !== p.texture) landTal.own++;
                if (flat(a) !== w || flat(b) !== w) landBad.push([i, 'a secret door', p, a]);
                if (!a || !b || (line && (ownK(a, 'texture') || ownK(b, 'texture'))) || (isLand(a.texture) && a.texture !== p.seenTexture)) landBad.push([i, 'a secret door in a pattern nobody named for it', p, a]);
            } else {
                const w = flat(wwiS(less(p, KEYS6), false)), mine = flat(sentOf(p)); landTal.plain++;   // any other piece: what the same piece without the six keys leaves as, and what the reading says
                if (flat(a) !== w || flat(b) !== w || has6(a).length || has6(b).length) landBad.push([i, 'another piece', p, a]);
                if (flat(a) !== mine || flat(b) !== mine || flat(f) !== flat(sentOf(p, true))) landBad.push([i, 'a piece that left against the reading', p, a, sentOf(p)]);   // with no core at hand: the same, less its pattern and its picture
                if (isLand(p.texture)) { if (!a || !b || a.texture !== p.texture || b.texture !== p.texture) landBad.push([i, 'a land pattern that did not leave with its piece', p, a]); else landTal.kept++; }
            }
        }
        check('fold B7 on the wire (wireWbItem, run for real on 900 more seeded pieces of every kind that name a land pattern of a world map, each judged by the reading written out in the suite, whose list of names is the sixteen): a hidden piece and a GM note card give nothing. A secret door seen in forest, mountains, sand or snow leaves as exactly the wall the reading gives, in that pattern, under the Wall material\'s color or the color named. A door drawn as a line leaves with no pattern, under the flat nib too. Another case of a name names nothing. The door\'s own land pattern never leaves in place of the look. Every other piece leaves as the same piece without the six keys does and as the reading says, a plain wall in its one shape (one drawn as a line at the width, the opacity and the nib it is drawn with), and one that wears a land pattern leaves with it. With no fogcore at hand no pattern leaves at all. The host\'s piece is never touched',
            landBad.length === 0 && landTal.pieces === 900 && LANDN.every(n => NAMES16.indexOf(n) >= 12) && NAMES16.length === 16 && J(NAMES16) === J(Array.from(FC.TEXTURES).slice(0, 16))
            && landTal.gone >= 60 && landTal.secret >= 55 && landTal.worn >= 20 && landTal.colored >= 10 && landTal.cased >= 7 && landTal.lines >= 12 && landTal.own >= 35 && landTal.plain >= 600 && landTal.kept >= 400 && landTal.bare === landTal.pieces - landTal.gone,
            J([landBad.slice(0, 2), landTal]));   // the counts say that the land patterns reach each branch of the reading
        // Round five of Match a wall: 1,500 more seeded pieces, each with an OWN color laid on by its number: seven texts the board's own rule refuses, five it takes that draw nothing (the plain word among
        // them) and four it takes that draw. Two in three have no pattern, no picture and no look named, so that the door's own color alone decides, every other one is made a door ticked Secret (a
        // token, a picture and a text box among them still are none), and one path in four a filled region. Judged whole by the same reading, with the core and with none; and what a bare door's own
        // color does is said outright, by the list the color stands in and never by the reading
        const OWN_REF = [' transparent', 'transparent ', 'RGBA(0, 0, 0, 0)', '', ' #ff0000', 'RGB(140, 123, 90)', ' '], OWN_GLASS = ['rgba(0, 0, 0, 0)', '#0000', 'Transparent', '#12345600', 'transparent'], OWN_DRAWS = ['rgba(255, 0, 0)', '#0001', 'DarkRed', 'var(--ink)'];
        const OWNCOLS = OWN_REF.concat(OWN_GLASS, OWN_DRAWS), kinds0 = () => ({ rect: 0, circle: 0, hexagon: 0, diamond: 0, region: 0, line: 0 });
        const ownTal = { pieces: 0, gone: 0, secret: 0, plain: 0, bare: 0, worn: 0, refGlass: kinds0(), refDrawn: kinds0(), glass: kinds0(), drawn: kinds0(), noCoreGlass: 0, noCoreDrawn: 0 }, ownBadS = [];
        for (let i = 5400; i < 6900; i++) {
            const p = gen(i); p.color = OWNCOLS[i % OWNCOLS.length];
            if (i % 3 !== 0) ['texture', 'texSrc', 'texTile', 'seenColor', 'seenTexture'].forEach(k => { delete p[k]; });
            if (i % 2) { p.secret = true; p.sightType = 'door'; p.blocksSight = true; }
            if (p.type === 'path' && i % 4 === 1) p.tip = 'fill';   // ... and one path in four a filled region, so that regions are reached as often as the other kinds
            const was = J(p), a = wwiS(p, false), b = wwiS(copyOf(p), true), f = wwiN(p, false);
            ownTal.pieces++;
            if (p.hidden || p.gmNoteFor) { ownTal.gone++; if (a !== null || b !== null || f !== null) ownBadS.push([i, 'a hidden piece left', p]); continue; }
            if (J(p) !== was) ownBadS.push([i, 'the host\'s piece changed', p]);
            if (isSecret(p)) {
                const w = flat(wantOf(p)), kind = isLine(p) ? 'line' : p.type === 'path' ? 'region' : p.type, refused = OWN_REF.indexOf(p.color) >= 0, box = kind === 'rect' || kind === 'circle'; ownTal.secret++;
                const bareD = NAMES16.indexOf(p.texture) < 0 && p.texSrc !== GOODPIC && seenC(p.seenColor) === null && (isLine(p) || NAMES16.indexOf(p.seenTexture) < 0);   // no pattern and no picture of its own, and nothing named for it that it wears
                if (flat(a) !== w || flat(b) !== w) ownBadS.push([i, 'a secret door', p, a]);
                if (flat(f) !== flat(bareOf(p))) ownBadS.push([i, 'a secret door with no fogcore at hand', p, f]);
                if (refused !== !boardTakes(p.color) || (OWN_GLASS.indexOf(p.color) >= 0) !== (boardTakes(p.color) && clearForm(p.color))) ownBadS.push([i, 'the reading places this color in another list than it stands in', p.color]);
                if (!bareD) { ownTal.worn++; if (refused && seenC(p.seenColor) !== 'transparent' && (!a || a.color === 'transparent')) ownBadS.push([i, 'a door with a pattern, a picture or a look of its own named that left clear by a color the board refuses', p, a]); }
                else { const want = refused ? box : OWN_GLASS.indexOf(p.color) >= 0, clear = !!a && !!b && a.color === 'transparent' && b.color === 'transparent', fClear = !!f && f.color === 'transparent'; ownTal.bare++;
                    ownTal[refused ? (clear ? 'refGlass' : 'refDrawn') : (clear ? 'glass' : 'drawn')][kind]++; ownTal[fClear ? 'noCoreGlass' : 'noCoreDrawn']++;
                    if (clear !== want || (clear ? ownK(a, 'texture') : a.color !== WALLC)) ownBadS.push([i, 'a bare door whose own color was read otherwise than its list says', p, a]);
                    if (fClear !== (p.color === 'transparent') || (!fClear && (f.color !== WALLC || ownK(f, 'texture')))) ownBadS.push([i, 'with no fogcore a bare door was clear by another color than the plain word, or not clear by it', p, f]); }
            } else {
                const w = flat(wwiS(less(p, KEYS6), false)), mine = flat(sentOf(p)); ownTal.plain++;   // any other piece keeps its color as written, whatever the text (a plain wall its hex color of six digits in lower case, and none of these is one)
                if (flat(a) !== w || flat(b) !== w || has6(a).length || has6(b).length) ownBadS.push([i, 'another piece', p, a]);
                if (flat(a) !== mine || flat(b) !== mine || flat(f) !== flat(sentOf(p, true))) ownBadS.push([i, 'a piece that left against the reading', p, a, sentOf(p)]);
                if (!a || a.color !== p.color) ownBadS.push([i, 'a piece that is no secret door and did not keep its color as written', p, a]);
            }
        }
        const RG = ownTal.refGlass, RDn = ownTal.refDrawn, OG = ownTal.glass, OD = ownTal.drawn, KIND6 = ['rect', 'circle', 'hexagon', 'diamond', 'region', 'line'];
        check('Match a wall, round five, a secret door\'s own color on the wire (wireWbItem, run for real on 1,500 more seeded pieces of every kind, with the real fogcore and with none): each piece carries a color laid on by its number, one of seven texts the board\'s own rule for a color refuses (a blank before the word transparent or after it, RGBA and RGB in capitals, an empty text, a blank, a color with a blank before it), of five it takes that draw nothing (the plain word, the word with a capital, rgba(0, 0, 0, 0), and a hex color of four and of eight digits whose alpha is 0) or of four it takes that draw. Every piece leaves exactly as the reading written out in the suite says, alone and on a clone, and with no fogcore as the fallback\'s reading says. Said outright of every secret door with no pattern and no picture of its own and nothing named for it, by the list its color stands in: a text the rule refuses leaves a RECTANGLE and a CIRCLE as nothing drawn, with no pattern, and a HEXAGON, a DIAMOND, a FILLED REGION and a LINE in the Wall material\'s color, never clear; a text it takes that draws nothing leaves every kind clear; one that draws leaves every kind in the Wall material\'s color. A door with a pattern, a picture or a look of its own named is never clear by a color the rule refuses. With no fogcore at hand a bare door is clear by the plain word alone, and otherwise leaves in the Wall material\'s color with no pattern. The suite\'s reading places every one of the sixteen colors in the list it stands in. A piece that is no secret door keeps its color as written, whatever the text. The host\'s piece is never touched',
            ownBadS.length === 0 && ownTal.pieces === 1500 && OWNCOLS.length === 16 && ownTal.gone >= 120 && ownTal.secret >= 350 && ownTal.plain >= 580 && ownTal.bare >= 250 && ownTal.worn >= 90
            && RG.rect >= 30 && RG.circle >= 14 && RG.hexagon === 0 && RG.diamond === 0 && RG.region === 0 && RG.line === 0 && RDn.rect === 0 && RDn.circle === 0 && RDn.hexagon >= 13 && RDn.diamond >= 9 && RDn.region >= 12 && RDn.line >= 11
            && KIND6.every(k => OG[k] >= 6 && OD[k] >= 6) && ownTal.noCoreGlass >= 20 && ownTal.noCoreDrawn >= 230,
            J([ownBadS.slice(0, 2), ownTal]));   // the counts say that each kind of piece was reached under a refused color, a clear one and a drawn one
    }

    // ---- (2b) what the first round of tests found, fixed: a way through, the order of the copy's keys, an own __proto__ key ----
    const puS = win => new Function('window', fnSrc('function portalUnder(item, map) {', '\n}\n', 'portalUnder') + '\n}\nreturn portalUnder;')(win);
    const tokS = { id: 'tok', x: 0, y: 0, w: 60, h: 52 }, mapPU = over => ({ whiteboard: [tokS, Object.assign({ id: 'po', type: 'rect', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }, over)], rooms: [] });
    const DOORP = { blocksSight: true, sightType: 'door' }, withP = more => Object.assign({}, DOORP, more), underOf = (win, over) => { const r = puS(win)(tokS, mapPU(over)); return r ? r.id : null; };
    const tvS = between('// [netcheck:travelmsg-start]', '// [netcheck:travelmsg-end]', 'travelmsg');
    const travelS = (win, over) => { const from = { id: 'm1', type: 'map', whiteboard: [Object.assign({ id: 'po', type: 'rect', targetMapId: 'm2', x: 0, y: 0, w: 60, h: 52 }, over)] }, calls = [];
        new Function('window', 'msg', 'conn', 'net', 'peerPaused', 'allow', 'getActiveCampaign', 'hostTravel', tvS)(win, { type: 'travel', viaItemId: 'po' }, { peer: 'pA' }, { paused: false, roster: { pA: { id: 'u_p', location: 'm1' } } }, () => false, () => true, () => ({ id: 'c1', activeItemId: 'm1', items: { m1: from } }), (c, t, p) => { calls.push(p ? p.id : null); });
        return calls; };
    const WINS = [{ wpFogCore: FC }, {}, undefined];
    // the review of fold B5: what a travel request is ANSWERED, for a wall, a secret door, a secret door that is a portal, a hidden trap tile, an id that names nothing, an open portal,
    // and (the second review) a hidden portal that is no trap and a hidden piece that is no portal, a hidden token
    const mmT = new Function(lineOf('function moveMode(') + '\nreturn moveMode;')(), TV_IDS = ['wl', 'sd', 'sp', 'hp', 'nope', 'op', 'hq', 'ht'], tvMap = { ids: [] };
    const travelT = (win, via, o) => { const sent = [], calls = [];
        const from = { id: 'm1', type: 'map', whiteboard: [{ id: 'wl', type: 'rect', x: 0, y: 0, w: 50, h: 50, blocksSight: true, sightType: 'wall' }, Object.assign({ id: 'sd', type: 'rect', x: 50, y: 0, w: 50, h: 50 }, DOORP, { secret: true }), Object.assign({ id: 'sp', type: 'rect', x: 100, y: 0, w: 50, h: 50, targetMapId: 'm2' }, DOORP, { secret: true }),
            { id: 'hp', type: 'rect', x: 150, y: 0, w: 50, h: 50, targetMapId: 'm2', hidden: true, trap: true }, { id: 'op', type: 'rect', x: 200, y: 0, w: 50, h: 50, targetMapId: 'm2' }, { id: 'hq', type: 'rect', x: 250, y: 0, w: 50, h: 50, targetMapId: 'm2', hidden: true }, { id: 'ht', type: 'image', isChar: true, charName: 'Lurker', hidden: true, x: 350, y: 0, w: 50, h: 50 },
            Object.assign({ id: 'tk', type: 'image', isChar: true, ownerId: 'u_p', x: 300, y: 0, w: 50, h: 50 }, o.locked ? { locked: true } : {})] };
        tvMap.ids = from.whiteboard.map(w => w.id);
        new Function('window', 'msg', 'conn', 'net', 'peerPaused', 'allow', 'getActiveCampaign', 'hostTravel', 'turnNote', 'turnCombatOf', 'moveMode', tvS)(win, { type: 'travel', viaItemId: via }, { peer: 'pA' }, { paused: false, roster: { pA: { id: 'u_p', location: 'm1' } } }, () => false, () => true,
            () => ({ id: 'c1', activeItemId: 'm1', items: { m1: from }, turnRules: o.rules }), (c, t, p) => { calls.push(p ? p.id : null); }, (c, text) => { sent.push(text); }, () => (o.fight ? { rows: [{ tokId: 'someone_else' }], turn: 0 } : null), mmT);
        return { sent, calls }; };
    const LOCKED_SAID = 'The GM has locked your token: you cannot leave this map.', TURN_SAID = 'It is not your turn: you cannot leave this map yet.';
    const tvAll = o => WINS.slice(0, 2).map(w => TV_IDS.map(id => travelT(w, id, o))), tvLocked = tvAll({ locked: true }), tvTurn = tvAll({ fight: true }), tvWarn = tvAll({ fight: true, rules: { order: 'warn' } }), tvFree = tvAll({});
    check('map builder B5, what a travel request is answered (the real travel branch, run with a recorder in the note\'s place and the real moveMode, with the fogcore and with none): while the player\'s own token is locked, and while a fight holds it off its turn under Refuse, a request naming a wall, a secret door, a secret door that is a portal, a hidden trap tile, a hidden portal that is no trap, a hidden token, nothing at all or an open portal gets the very same one note and moves nobody, so silence never marks what is hidden; with a free token, and off turn under Warn, none of them is told anything, the open portal alone takes them through, and neither a secret door nor any hidden piece, portal or not, is handed to the traveler\'s move',
        [tvLocked, tvTurn].every((per, n) => per.every(row => row.every(r => J(r) === J({ sent: [n ? TURN_SAID : LOCKED_SAID], calls: [] }))))
        && [tvWarn, tvFree].every(per => per.every(row => row.every(r => r.sent.length === 0) && J(row.map(r => r.calls)) === J([['wl'], [], [], [], [null], ['op'], [], []]))) && TV_IDS.length === 8 && tvLocked[0].length === 8 && tvTurn[1].length === 8
        && J(tvMap.ids.filter(id => id !== 'tk').sort()) === J(TV_IDS.filter(id => id !== 'nope').sort()),   // every piece of the map but the traveler's own token is asked about
        J([tvLocked[0].map(r => r.sent.length), tvTurn[0].map(r => r.sent.length), tvFree[0].map(r => r.calls), tvWarn[1].map(r => r.calls)]));
    check('map builder B5, a hidden trap tile that still carries the Secret tick (the real portalUnder, with the fogcore, with no core and with no window): a hidden piece is no wall to anyone, so the tile still catches a drop, as it does with no tick; hidden and no trap it catches nothing, tick or not; and shown, the secret door that is a portal still lets nobody through',
        WINS.every(w => underOf(w, withP({ hidden: true, trap: true, secret: true })) === 'po' && underOf(w, withP({ hidden: true, trap: true })) === 'po' && underOf(w, withP({ hidden: true, secret: true })) === null && underOf(w, withP({ hidden: true })) === null && underOf(w, withP({ secret: true })) === null && underOf(w, withP({ trap: true, secret: true })) === null),
        J(WINS.map(w => [underOf(w, withP({ hidden: true, trap: true, secret: true })), underOf(w, withP({ hidden: true, secret: true })), underOf(w, withP({ trap: true, secret: true }))])));
    check('map builder B5, a secret door that is also a portal (the real portalUnder and the real travel branch, run with the real fogcore, with no core and with no window): a token dropped on it goes through nothing and a travel request naming it moves nobody, as for a hidden portal; the same door once found takes them through; a hidden trap tile still catches a drop; a tick that is not the word true stops nothing; with the core a tick on a portal that is no door stops nothing, and with no core the raw tick alone decides',
        WINS.every(w => underOf(w, withP({ secret: true })) === null && J(travelS(w, withP({ secret: true }))) === '[]' && underOf(w, DOORP) === 'po' && J(travelS(w, DOORP)) === J(['po']) && underOf(w, { hidden: true, trap: true }) === 'po' && underOf(w, withP({ secret: 'yes' })) === 'po' && J(travelS(w, withP({ secret: 1 }))) === J(['po']))
        && underOf(WINS[0], { secret: true }) === 'po' && J(travelS(WINS[0], { secret: true })) === J(['po']) && underOf(WINS[1], { secret: true }) === null && J(travelS(WINS[2], { secret: true })) === '[]',
        J(WINS.map(w => [underOf(w, withP({ secret: true })), travelS(w, withP({ secret: true })), underOf(w, DOORP), underOf(w, { secret: true })])));
    const fbKinds = [{ id: 'fi', type: 'image', src: '/saves/images/k/gate.png', x: 1, y: 2, w: 50, h: 50, blocksSight: true, sightType: 'door', secret: true, color: '#abcdef', name: 'Gate' }, { id: 'ft', type: 'text', text: 'Beware', x: 1, y: 2, w: 50, h: 50, blocksSight: true, sightType: 'door', secret: true, color: '#abcdef' },
        { id: 'fc', type: 'circle', isChar: true, charName: 'Mimic', x: 1, y: 2, w: 50, h: 50, blocksSight: true, sightType: 'door', secret: true, color: '#abcdef' }];
    const fbKindGot = [wwiN, wwiO].map(wire => fbKinds.map(p => wire(p, false)));
    check('map builder B5, the fallback and a piece that may not be a secret door (wireWbItem, run for real with no fogcore at hand and with one that knows no secret door): a picture, a text box and a token that carry a door\'s flags and the tick leave as the pieces they are, in their own color and still typed a door, without the three keys',
        fbKindGot.every(per => per.every(g => !!g && g.color === '#abcdef' && g.sightType === 'door' && has3(g).length === 0)) && fbKindGot[0][0].src === '/saves/images/k/gate.png' && fbKindGot[0][0].name === 'Gate' && fbKindGot[0][2].isChar === true,
        J(fbKindGot[0]));
    const protoDoor = JSON.parse('{"id":"pd","type":"rect","x":0,"y":0,"w":50,"h":50,"blocksSight":true,"sightType":"door","secret":true,"__proto__":{"doorOpen":true,"evil":1}}'), protoOut = wwiS(protoDoor, false);
    const sameJ = [D('ko', { name: 'Door' }), less(D('ko', { name: 'Door' }), ['texture']), D('ko', { name: 'Vault', texture: 'grass' }), less(D('ko', { name: 'Door' }), ['texSrc', 'texTile', 'doorLock', 'groupId', 'doorOpen']), D('ko', { name: 'Door', color: '#123456', groupId: 'g_other' }), D('ko'), D('ko', { name: '' }), D('ko', { name: 'Door', targetMapId: 'm2', targetRoomId: 'room_a' }), D('ko', { targetMapId: 'm3', targetRoomId: 'room_b', portalIcon: 'Stairs', nodeId: 'r9' })].map(p => J(wwiS(p, false)));
    // The third review of fold B5 (wire V4): the copy follows the door's own look in ONE case, a see-through door. A door that draws nothing and
    // has no pattern and no picture of its own leaves clear. Give that door a color, a pattern or a picture of its own and its copy is a wall
    // in the Wall material's look. The nine doors above are all opaque, so their list could never show it. Each is listed here, and those
    // copies are held to DIFFER: a name, a lock, a group and a way through change nothing on the copy, and a look changes nothing while the
    // door is not see-through
    const CLEARD = { id: 'kc', type: 'rect', x: 0, y: 0, w: 50, h: 50, color: 'transparent', blocksSight: true, sightType: 'door', secret: true };
    const clearDoors = [CLEARD, Object.assign({}, CLEARD, { name: 'Glass', doorLock: true, groupId: 'g_x', doorOpen: true }), Object.assign({}, CLEARD, { color: 'rgba(0, 0, 0, 0)' }), Object.assign({}, CLEARD, { color: '#884422' }), Object.assign({}, CLEARD, { texture: 'planks' }), Object.assign({}, CLEARD, { texSrc: PIC, texTile: 1 })];
    const clearJ = clearDoors.map(p => J(wwiS(p, false))), CLEARW = '{"blocksSight":true,"color":"transparent","h":50,"id":"kc","sightType":"wall","type":"rect","w":50,"x":0,"y":0}', BRICKW = '{"blocksSight":true,"color":"#3f3b47","h":50,"id":"kc","sightType":"wall","texture":"bricks","type":"rect","w":50,"x":0,"y":0}';
    const clearWant = [CLEARW, CLEARW, CLEARW, BRICKW, BRICKW, BRICKW];   // the see-through door, the same under another name, lock and group, and under another spelling of a clear color; then with a color, a pattern and a picture of its own
    check('map builder B5, what a change to the door behind the wall sends (wireWbItem, run for real): the wall a secret door leaves as is the very same text, key for key and in the same order, whether the door has a pattern of its own, another or none, a picture or none, a lock, a group, another color, another name or none, a way through to another map or another landing room there. So on a map with no fog a save after a change to the door\'s name, lock, group or way through sends the table nothing. A fogged map is sent whole to each player on it at every save, whatever changed, and the copy in it is that same text. The door\'s own look changes the copy in one case, a see-through door: a door that draws nothing and has no pattern or picture of its own leaves clear, under any name, lock or group and under another spelling of a clear color, while the same door with a color, a pattern or a picture of its own leaves as a wall in the Wall material\'s look. Those copies differ, and they are listed here as differing. The text holds no name at all; its keys stand in the one order every wall\'s do; an own key named __proto__ never becomes the copy\'s prototype, and nothing it held is read from the copy',
        sameJ.every(s => s === sameJ[0]) && sameJ.length === 9 && sameJ[0] === '{"blocksSight":true,"color":"#3f3b47","cover":"yes","h":50,"height":3,"id":"ko","layer":"back-mid","sightType":"wall","texture":"bricks","type":"rect","w":50,"x":100,"y":50}' && !/"name"|Vault|"Door"/.test(sameJ.join('')) && !/room_|"m2"|"m3"|Stairs|r9/.test(sameJ.join(''))
        && clearJ.length === 6 && clearJ.every((s, i) => s === clearWant[i]) && CLEARW !== BRICKW && clearJ[0] !== clearJ[3] && !/Glass|g_x|doorLock|doorOpen|884422|planks|vault door|texSrc/.test(clearJ.join(''))
        && !!protoOut && Object.getPrototypeOf(protoOut) === Object.prototype && protoOut.doorOpen === undefined && protoOut.evil === undefined && protoOut.sightType === 'wall' && !/evil|doorOpen/.test(J(protoOut)),
        J([sameJ.map(s => s === sameJ[0]), clearJ.map((s, i) => (s === clearWant[i] ? 'as wanted' : s)), sameJ[0], protoOut]));
    // the review of fold B5: the order of a wall's keys says nothing of how the wall was made
    const CELLK = { id: 'kc', type: 'rect', x: 100, y: 50, w: 50, h: 50, baseW: 50, baseH: 50, z: 5, color: '#556677', fill: true, layer: 'back' }, RECK = { id: 'kc', type: 'rect', x: 0, y: 0, w: 50, h: 50 };
    const madeWalls = [   // [a wall made outside Build, the same piece made a door, ticked Secret and seen in that wall's look]
        [Object.assign({}, CELLK, { texture: 'stone', blocksSight: true, sightType: 'wall' }), Object.assign({}, CELLK, { blocksSight: true, sightType: 'door', texture: 'stone', secret: true, seenColor: '#556677', seenTexture: 'stone' })],   // the Fill tool's cell: its pattern first, then Blocks sight
        [Object.assign({}, RECK, { color: '#556677', texture: 'stone', blocksSight: true, sightType: 'wall' }), Object.assign({}, RECK, { blocksSight: true, sightType: 'door', color: '#aa0000', secret: true, seenTexture: 'stone', seenColor: '#556677' })],   // a rectangle with no name
        [Object.assign({}, RECK, { color: WALLC, texture: 'bricks', name: 'Wall', blocksSight: true, sightType: 'wall' }), Object.assign({}, RECK, { name: 'Hidden way', blocksSight: true, sightType: 'door', secret: true, color: OAK, texture: 'planks' })],   // its pattern before its name
        [Object.assign({}, RECK, { sightType: 'wall', blocksSight: true, texture: 'stone', color: '#4a4753', name: 'City wall' }), Object.assign({}, RECK, { blocksSight: true, sightType: 'door', secret: true, seenColor: '#4a4753', seenTexture: 'stone' })],   // a city wall, and a door with no name
        [Object.assign({}, RECK, { barrier: true, color: 'transparent', sightType: 'wall' }), Object.assign({}, RECK, { sightType: 'door', color: 'transparent', doorLock: true, barrier: true, secret: true })],   // a see-through barrier
        // the third review of fold B5 (wire V1): a wall as a campaign FILE writes one, Blocks sight alone, with no type named and its hex color in
        // upper case, beside the same piece typed a door, ticked Secret and seen in that color with Plain color; and a see-through barrier likewise
        [Object.assign({}, RECK, { color: '#8C7B5A', blocksSight: true }), Object.assign({}, RECK, { color: '#8C7B5A', blocksSight: true, sightType: 'door', secret: true, seenColor: '#8C7B5A', seenTexture: '' })],
        [Object.assign({}, RECK, { barrier: true, color: 'transparent' }), Object.assign({}, RECK, { barrier: true, color: 'transparent', sightType: 'door', secret: true })],
        // the fifth round (change C): a wall as a file with ONE schema for every piece writes it, each key there and empty where it has nothing to say
        [Object.assign({}, RECK, { color: '#8c7b5a', blocksSight: true, targetMapId: '', nodeId: '' }), Object.assign({}, RECK, { color: '#8c7b5a', blocksSight: true, targetMapId: '', nodeId: '', sightType: 'door', secret: true, seenColor: '#8c7b5a', seenTexture: '' })]
    ];
    // ---- the walls that have NO twin, each pinned so that the words of the heading stay true: the wall leaves as written, and the nearest secret
    // door's copy differs from it by that one thing and the id alone
    const NONE = '(no key)', diffOf = (a, b) => (a && b ? Object.keys(a).concat(Object.keys(b)).filter((k, i, all) => k !== 'id' && all.indexOf(k) === i && (ownK(a, k) !== ownK(b, k) || J(a[k]) !== J(b[k]))).sort().map(k => [k, ownK(a, k) ? a[k] : NONE, ownK(b, k) ? b[k] : NONE]) : 'nothing left');
    const PENW = { type: 'path', x: 200, y: 50, w: 9, h: 50, baseW: 9, baseH: 50, z: 10, pts: [[0, 0], [0, 50]], tip: 'round' };   // a stroke as the pen writes one: strokeWidth, and opacity only under 1
    // Round two of Match a wall. A see-through wall drawn as a line whose clear color a file spelled rgba(0, 0, 0, 0), and a Door line that lies
    // on it, ticked Secret and MATCHED to it by the real press (matchAs). The press answers the word transparent, the one clear form a secret
    // door is seen in, so the copy leaves in that word while the wall leaves as written. Matched in width, opacity and nib, the two still
    // differ by the color's text. (A see-through wall whose color IS the word has its twin: part (2e).)
    const RGBAW = Object.assign({ id: 'nwF' }, PENW, { color: 'rgba(0, 0, 0, 0)', strokeWidth: 5, opacity: 0.55, barrier: true }), RGBAD = Object.assign({ id: 'ndF2' }, PENW, { color: OAK, strokeWidth: 9, opacity: 0.8, tip: 'square', barrier: true, sightType: 'door', secret: true }), rgbaHit = matchAs(RGBAD, [RGBAW, RGBAD]);
    const noTwin = [   // [what it is, the wall, the nearest secret door, how the wall and the copy differ: key, the wall's, the copy's]
        ['a see-through barrier whose clear color is spelled another way', Object.assign({ id: 'nwA' }, RECK, { barrier: true, color: 'rgba(0, 0, 0, 0)' }), Object.assign({ id: 'ndA2' }, RECK, { barrier: true, color: 'rgba(0, 0, 0, 0)', sightType: 'door', secret: true }), [['color', 'rgba(0, 0, 0, 0)', 'transparent']]],
        ['a wall drawn as a line, flat nib, that wears a pattern from a file', Object.assign({ id: 'nwB' }, LINE, { tip: 'flat', color: WALLC, texture: 'bricks', blocksSight: true }), Object.assign({ id: 'ndB2' }, LINE, { tip: 'flat', color: WALLC, texture: 'bricks', blocksSight: true, sightType: 'door', secret: true, seenColor: WALLC, seenTexture: 'bricks' }), [['texture', 'bricks', NONE]]],
        ['the same with the round nib', Object.assign({ id: 'nwC' }, LINE, { tip: 'round', color: WALLC, texture: 'bricks', blocksSight: true }), Object.assign({ id: 'ndC2' }, LINE, { tip: 'round', color: WALLC, texture: 'bricks', blocksSight: true, sightType: 'door', secret: true, seenColor: WALLC, seenTexture: 'bricks' }), [['texture', 'bricks', NONE]]],
        ['a wall with no color', Object.assign({ id: 'nwD' }, RECK, { blocksSight: true }), Object.assign({ id: 'ndD2' }, RECK, { blocksSight: true, sightType: 'door', secret: true, seenTexture: '' }), [['color', NONE, WALLC]]],
        ['a Door line 9 px wide at opacity 0.8 seen in the color of a Wall line 5 px wide at opacity 0.55', Object.assign({ id: 'nwE' }, PENW, { color: '#3a4a5a', strokeWidth: 5, opacity: 0.55, blocksSight: true }), Object.assign({ id: 'ndE2' }, PENW, { color: OAK, strokeWidth: 9, opacity: 0.8, blocksSight: true, sightType: 'door', secret: true, seenColor: '#3a4a5a' }), [['opacity', 0.55, 0.8], ['strokeWidth', 5, 9]]],   // a limit only until Match is pressed: part (2e) presses it on this very pair
        ['a see-through wall drawn as a line whose clear color is spelled another way, and a Door line matched to it', RGBAW, RGBAD, [['color', 'rgba(0, 0, 0, 0)', 'transparent']]]
    ];
    const noTwinWas = J(noTwin), noTwinGot = noTwin.map(r => { const w = [wwiS(r[1], false), wwiS(copyOf(r[1]), true)], d = [wwiS(r[2], false), wwiS(copyOf(r[2]), true)]; return [r[0], w.every(o => flat(o) === flat(noOff(wallShape(r[1])))), d.every(o => !!o && o.sightType === 'wall' && has6(o).length === 0), J(diffOf(w[0], d[0])) === J(r[3]) && J(diffOf(w[1], d[1])) === J(r[3]), diffOf(w[0], d[0])]; });
    const noTwinMap = siS({ id: 'mT', type: 'map', whiteboard: noTwin.map(r => copyOf(r[1])).concat(noTwin.map(r => copyOf(r[2]))) }).whiteboard, noTwinOnMap = noTwin.map((r, i) => J(diffOf(noTwinMap[i], noTwinMap[noTwin.length + i])) === J(r[3]));
    check('map builder B5, the walls that have no twin (wireWbItem and sanitizeItem, run for real with the real fogcore): three things a wall may carry that no secret door\'s copy can follow, one of them on a matched line too, and one thing a copy keeps of its own door only until Match is pressed, each held as a limit so that the words that list them stay true. A see-through barrier whose clear color a file spelled rgba(0, 0, 0, 0) leaves in that text, and the same piece made a secret door leaves with the word transparent. A wall drawn as a line that carries a pattern from a file leaves with it, flat nib and round, and its secret twin seen in that very color and pattern leaves with no pattern, as every copy drawn as a line does. A wall with no color leaves with none, and its secret twin seen in a plain color leaves in the Wall material\'s color. A Door line 9 px wide at opacity 0.8, ticked Secret and seen in the color of a Wall line 5 px wide at opacity 0.55, leaves with its own width and opacity, until Match is pressed on it: part (2e) presses it on this very pair. Round two of Match a wall: a see-through wall drawn as a line whose clear color a file spelled rgba(0, 0, 0, 0), and a Door line lying on it that the real press matched to it. The press answers the word transparent, the one clear form a secret door is seen in, so the copy leaves in that word and the wall as written: matched in width, opacity and nib, the two still differ by the color\'s text (a see-through wall whose color is the word itself has its twin). Each wall leaves as written, in a plain wall\'s one shape; each copy leaves typed wall with none of the six keys; and wall and copy differ by that one thing and their id alone, sent alone, on a clone and on a whole map. The host\'s own pieces are untouched',
        noTwin.length === 6 && noTwinGot.every(g => g[1] && g[2] && g[3]) && noTwinOnMap.every(Boolean) && noTwinMap.length === 12 && J(noTwin) === noTwinWas
        && !!rgbaHit && J(rgbaHit) === J({ color: 'transparent', width: 5, opacity: 0.55, tip: 'round' }) && J([RGBAD.seenColor, RGBAD.seenWidth, RGBAD.seenOpacity, RGBAD.seenTip, RGBAD.color, RGBAD.strokeWidth, RGBAD.tip]) === J(['transparent', 5, 0.55, 'round', OAK, 9, 'square']) && FC.cleanSeenColor('rgba(0, 0, 0, 0)') === null,
        J([noTwinGot.filter(g => !(g[1] && g[2] && g[3])), noTwinOnMap]));
    const madeGot = madeWalls.map(pr => pr.map(p => [J(wwiS(p, false)), J(wwiS(copyOf(p), true))])), keysSorted = s => { const k = Object.keys(JSON.parse(s)); return J(k) === J(k.slice().sort()); };
    const FILEWALL = '{"blocksSight":true,"color":"#8c7b5a","h":50,"id":"kc","sightType":"wall","type":"rect","w":50,"x":0,"y":0}', FILEBAR = '{"barrier":true,"color":"transparent","h":50,"id":"kc","sightType":"wall","type":"rect","w":50,"x":0,"y":0}';   // the file's wall and the file's barrier as they leave: typed wall, the hex color in lower case
    const plainOrd = [{ id: 'pl', type: 'rect', y: 0, x: 0, w: 5, h: 5, z: 1, color: '#ffffff' }, { type: 'image', id: 'tk', isChar: true, z: 3, y: 0, x: 0, w: 5, h: 5 }, { id: 'ob', x: 0, type: 'rect', y: 0, w: 5, h: 5, blocksSight: false }].map(p => J(Object.keys(wwiS(p, false))) === J(Object.keys(p)));
    const protoWall = wwiS(JSON.parse('{"id":"pw","type":"rect","x":0,"y":0,"w":5,"h":5,"blocksSight":true,"__proto__":{"evil":1}}'), false), mapOrd = siS({ id: 'mO', type: 'map', whiteboard: madeWalls.map((pr, i) => Object.assign(copyOf(pr[0]), { id: 'w' + i })).concat(madeWalls.map((pr, i) => Object.assign(copyOf(pr[1]), { id: 's' + i }))) });
    check('map builder B5, the order of a wall\'s keys (wireWbItem and sanitizeItem, run for real): a wall, a door and a see-through barrier leave with their keys in ONE order, sorted, alone and on a map\'s clone. So a wall made outside Build and the same piece made a secret door in that wall\'s look leave as the very same text, with no name in it: the Fill tool\'s cell with its pattern set before Blocks sight, a rectangle with no name, one whose pattern was set before its name, a city wall, a see-through barrier, and a wall and a see-through barrier as a campaign file writes them, with no type named and a hex color in upper case, and a wall as a file with one schema for every piece writes it, its way to a map and its link to a room there as empty texts. The file\'s wall leaves typed wall with its color in lower case, and the file\'s barrier typed wall. The one-schema wall and its twin leave with neither empty key. On a whole map each wall and its twin differ by their id alone; a piece that blocks nothing keeps the order it was made in; and an own key named __proto__ on a wall never becomes the copy\'s prototype',
        madeGot.every(g => g[0][0] === g[1][0] && g[0][1] === g[1][1] && g[0][0] === g[0][1] && keysSorted(g[0][0]) && !/"name"/.test(g[0][0])) && madeWalls.length === 8 && madeGot[5][0][0] === FILEWALL && madeGot[6][0][0] === FILEBAR && madeGot[7][0][0] === FILEWALL && madeWalls[7].every(p => p.targetMapId === '' && p.nodeId === '') && !/targetMapId|nodeId/.test(madeGot[7].join('')) && !ownK(madeWalls[5][0], 'sightType') && !ownK(madeWalls[6][0], 'sightType')
        && madeWalls.filter(pr => ownK(pr[0], 'name')).length === 2 && plainOrd.every(Boolean)
        && madeWalls.every((pr, i) => { const a = mapOrd.whiteboard.find(w => w.id === 'w' + i), b = mapOrd.whiteboard.find(w => w.id === 's' + i); return !!a && !!b && J(Object.assign({}, a, { id: 0 })) === J(Object.assign({}, b, { id: 0 })); })
        && Object.getPrototypeOf(protoWall) === Object.prototype && protoWall.evil === undefined && J(Object.keys(protoWall)) === J(['blocksSight', 'h', 'id', 'sightType', 'type', 'w', 'x', 'y']),
        J([madeGot.map((g, i) => [i, g[0][0], g[1][0]]).filter(r => r[1] !== r[2]).slice(0, 2), madeGot.map(g => g[0][0] === g[1][0]), madeGot[5][0][0], madeGot[6][0][0], plainOrd, Object.keys(protoWall)]));

    // ---- (2c) the second and third reviews of fold B5: a plain wall leaves in one shape, with no name, and so does a secret door's copy ----
    // Build names a piece by its MATERIAL whatever color and pattern the GM picked, the city generator by its own, and a wall made by hand has no
    // name. So no table could give a copy the name the walls beside it carry, and the one wall whose name differed was the secret door. Now
    // neither has a name on the wire: a wall and a secret door made the same way and seen in its look differ by id and place alone. (The copy
    // keeps every other key of the door's own, its layer and its width among them, so the pairs below are made by one tool each)
    {
        // Who leaves as it is, and who leaves in a plain wall's one shape (the second review: the name; the third: the whole shape). Each keeper is
        // spared by ONE part of the rule, so that part alone is what the case tries. The losers stand at the edges of the rule's own words too: a
        // key the rule reads that is THERE and reads as false, a name that is no text, a type that is not the word door, and the keys a wall
        // commonly carries, none of which spares it
        const NBOX = { x: 100, y: 50, w: 50, h: 50 }, SIGHT = { blocksSight: true, sightType: 'wall' }, nm = (id, type, more) => Object.assign({ id, type, name: 'N_' + id }, NBOX, more || {});
        const NLINE = { x: 200, y: 50, w: 6, h: 50, baseW: 6, baseH: 50, pts: [[0, 0], [0, 50]], tip: 'square', strokeWidth: 6 };
        // What a plain wall never leaves with, all of it on one piece: a group, an open and a locked word, a landing room, a trap mark, a portal's icon
        // and lock, and a hex color in upper case. A keeper that carries it leaves with every bit of it
        // Round two of Match a wall: and the GM's Lock in place (locked), which no plain wall leaves with either
        const CARRY = { groupId: 'g_room', doorOpen: true, doorLock: true, targetRoomId: 'room_k', trap: true, portalIcon: 'Gate', portalLock: true, locked: true, color: '#8C7B5A' };
        const keepers = [
            nm('kDoor', 'rect', { blocksSight: true, sightType: 'door' }),   // a door
            nm('kOpen', 'rect', { blocksSight: true, sightType: 'door', doorOpen: true }),   // an open door
            nm('kBarDoor', 'rect', { barrier: true, sightType: 'door', color: 'transparent' }),   // a see-through barrier's door
            nm('kPortal', 'rect', Object.assign({ targetMapId: 'mB' }, SIGHT)),   // a wall that leads to another map
            nm('kNode', 'rect', Object.assign({ nodeId: 'r1' }, SIGHT)),   // a wall that hangs on a room's node
            nm('kPic', 'image', Object.assign({ src: '/saves/images/k/gate.png' }, SIGHT)),   // a picture that blocks sight
            nm('kText', 'text', Object.assign({ text: 'Beware' }, SIGHT)),   // a text box that blocks sight
            nm('kTok', 'circle', Object.assign({ isChar: true, charName: 'Golem' }, SIGHT)),   // a token that blocks sight (of a plain shape, so no other part of the rule holds its name)
            nm('kWait', 'circle', Object.assign({ waiting: 1, ownerId: 'u_a' }, SIGHT)),   // a waiting token
            nm('kTok1', 'circle', Object.assign({ isChar: 1, charName: 'Golem' }, SIGHT)),   // a token by a mark that reads as true and is not the word true
            nm('kFloor', 'rect', { color: '#5a5663', layer: 'back' }),   // a floor piece: it blocks nothing
            nm('kOff', 'rect', { blocksSight: false, sightType: 'wall' }),   // Blocks sight unticked
            nm('kBar1', 'rect', { barrier: 1 }),   // a barrier flag that is not the word true makes no barrier
            nm('kTraces', 'rect', { isChar: false, nodeId: null, locked: false, doorOpen: false }),   // a piece that blocks nothing keeps every key as made, the false and the null ones too
            // round two of Match a wall: the GM's Lock in place stays on a piece that is no plain wall. These four carry nothing else that a wall loses
            nm('kLockDoor', 'rect', { blocksSight: true, sightType: 'door', locked: true }),   // a door that is no secret, locked in place
            nm('kLockPortal', 'rect', Object.assign({ targetMapId: 'mB', locked: true }, SIGHT)),   // a wall that leads to another map
            nm('kLockTok', 'circle', Object.assign({ isChar: true, charName: 'Golem', locked: true }, SIGHT)),   // a token that blocks sight: frozen for its player by that very key
            nm('kLockFloor', 'rect', { color: '#5a5663', layer: 'back', locked: true }),   // a floor piece
            // the third review of fold B5: one piece for each part of the rule again, each carrying all of the above, under a type of its own or under none
            nm('hDoor', 'rect', Object.assign({ blocksSight: true, sightType: 'door' }, CARRY)),   // a door: open, locked and grouped with its room
            nm('hBarDoor', 'rect', Object.assign({ barrier: true, sightType: 'door' }, CARRY)),   // a see-through barrier's door
            nm('hPortal', 'rect', Object.assign({ blocksSight: true, targetMapId: 'mB' }, CARRY)),   // a wall that leads to another map, locked for players, with no type named: it leaves with none
            nm('hNode', 'rect', Object.assign({ blocksSight: true, sightType: 'window', nodeId: 'r1' }, CARRY)),   // a wall on a room's node, typed by a word of a file's own
            nm('hPic', 'image', Object.assign({ src: '/saves/images/k/gate.png', blocksSight: true }, CARRY)),   // a picture that blocks sight
            nm('hText', 'text', Object.assign({ text: 'Beware', blocksSight: true, sightType: 'Door' }, CARRY)),   // a text box that blocks sight
            nm('hTok', 'circle', Object.assign({ isChar: true, charName: 'Golem', blocksSight: true }, CARRY)),   // a token that blocks sight
            nm('hWait', 'circle', Object.assign({ waiting: 1, ownerId: 'u_a', barrier: true, sightType: 'window' }, CARRY)),   // a waiting token flagged a barrier
            nm('hFloor', 'rect', Object.assign({ layer: 'back', sightType: 'window' }, CARRY))   // a piece that blocks nothing
        ];
        const losers = [
            nm('lWall', 'rect', SIGHT),   // a wall
            nm('lOne', 'rect', { blocksSight: 1, sightType: 'wall' }),   // a wall whose Blocks sight is 1
            nm('lYes', 'rect', { blocksSight: 'yes', sightType: 'wall' }),   // ... or a text
            nm('lBare', 'rect', { blocksSight: true }),   // a wall with no type named: it leaves typed wall
            nm('lBar', 'rect', { barrier: true, color: 'transparent' }),   // a see-through barrier, with no type named either
            nm('lBarW', 'rect', { barrier: true, sightType: 'wall', blastStop: true }),   // ... one typed a wall and ticked Stops blasts
            nm('lHex', 'hexagon', SIGHT), nm('lDia', 'diamond', SIGHT), nm('lCir', 'circle', SIGHT),   // the other box shapes
            Object.assign(nm('lLine', 'path', SIGHT), NLINE),   // a wall drawn as a line
            Object.assign(nm('lFill', 'path', SIGHT), NLINE, { tip: 'fill', pts: TRI }),   // a filled region
            Object.assign(nm('lNone', 'rect', SIGHT), { name: '' }),   // a name that is an empty text goes too: no key is left
            Object.assign(nm('lNull', 'rect', SIGHT), { name: null }), Object.assign(nm('lNum', 'rect', SIGHT), { name: 0 }),   // and a name that is no text: null, a number
            nm('lUnlinked', 'rect', Object.assign({ nodeId: null }, SIGHT)),   // a wall unlinked from its room: Properties leaves nodeId null there
            nm('lNoWay', 'rect', Object.assign({ targetMapId: '' }, SIGHT)),   // a way through that names no map
            nm('lZeroMap', 'rect', Object.assign({ targetMapId: 0 }, SIGHT)),   // and one that holds a 0 for it, as a one-schema file may
            nm('lWasTok', 'rect', Object.assign({ isChar: false }, SIGHT)),   // Is Character unticked: Properties leaves isChar false there
            nm('lNoWait', 'rect', Object.assign({ waiting: 0 }, SIGHT)),   // a waiting mark that reads as false
            nm('lOdd', 'rect', { blocksSight: true, sightType: 'Door' }),   // a type a file may hold that is not the word door: no door to the fog, so a wall, and it leaves typed wall
            nm('lFull', 'rect', Object.assign({ locked: true, height: 3, cover: 'yes', terrain: 2, trap: true, groupId: 'g1', layer: 'back-mid', z: 10, opacity: 0.5, rot: 90, fogHand: 'show' }, SIGHT)),   // a wall with the keys a wall commonly carries: it keeps them all but the trap mark and the group (no pattern or picture: the wires with no core drop those)
            Object.assign(nm('lDrawn', 'path', SIGHT), NLINE, { ownerId: 'u_a', byPlayer: true }),   // a player's drawing the GM made a wall
            // the third review of fold B5: each thing a plain wall never leaves with, one wall for each; the types and the colors a file may write; then all of it on a barrier and on a line
            nm('lGroup', 'rect', Object.assign({ groupId: 'g_room' }, SIGHT)),   // a wall grouped with its room, door and all
            nm('lOpen', 'rect', Object.assign({ doorOpen: true }, SIGHT)),   // a wall that was once an open door
            nm('lLock', 'rect', Object.assign({ doorLock: true }, SIGHT)),   // ... or a locked one
            nm('lRoom', 'rect', Object.assign({ targetRoomId: 'room_k' }, SIGHT)),   // a landing room, and no map to land on
            nm('lTrap', 'rect', Object.assign({ trap: true }, SIGHT)),   // the trap mark of a way through that is gone
            nm('lIcon', 'rect', Object.assign({ portalIcon: 'Gate' }, SIGHT)),   // ... its icon
            nm('lPLock', 'rect', Object.assign({ portalLock: true }, SIGHT)),   // ... and its lock
            nm('lWindow', 'rect', { blocksSight: true, sightType: 'window' }),   // a type of a file's own
            nm('lUpper', 'rect', Object.assign({ color: '#8C7B5A' }, SIGHT)),   // a hex color of six digits in upper case: it leaves in lower case
            nm('lMixed', 'rect', Object.assign({ color: '#8c7B5a' }, SIGHT)),   // ... in mixed case
            nm('lShort', 'rect', Object.assign({ color: '#ABC' }, SIGHT)),   // a short hex leaves as written
            nm('lHex8', 'rect', Object.assign({ color: '#AABBCCDD' }, SIGHT)),   // ... and a hex with an alpha
            nm('lWord', 'rect', Object.assign({ color: 'DarkRed' }, SIGHT)),   // a color word
            nm('lFunc', 'rect', Object.assign({ color: 'RGB(140, 123, 90)' }, SIGHT)),   // a color as a function
            nm('lTheme', 'rect', Object.assign({ color: 'var(--panel2)' }, SIGHT)),   // a theme's color, the Shapes tool's own default
            nm('lBarAll', 'rect', Object.assign({ barrier: true }, CARRY)),   // a see-through barrier that carries all of it, with no type named
            Object.assign(nm('lLineAll', 'path', Object.assign({ blocksSight: 1 }, CARRY)), NLINE),   // a wall drawn as a line, by a flag that is 1, that carries all of it
            // the second reader of the third review: a key that is THERE and reads as false, as a file with one schema for every piece writes it. An
            // empty text and a 0 are no false and no null, so only the plain wall block itself takes them off
            nm('lEmptyGroup', 'rect', Object.assign({ groupId: '' }, SIGHT)), nm('lZeroOpen', 'rect', Object.assign({ doorOpen: 0 }, SIGHT)), nm('lZeroLock', 'rect', Object.assign({ doorLock: 0 }, SIGHT)),
            nm('lEmptyRoom', 'rect', Object.assign({ targetRoomId: '' }, SIGHT)), nm('lZeroTrap', 'rect', Object.assign({ trap: 0 }, SIGHT)), nm('lEmptyIcon', 'rect', Object.assign({ portalIcon: '' }, SIGHT)),
            nm('lEmptyNode', 'rect', Object.assign({ nodeId: '' }, SIGHT)), nm('lZeroNode', 'rect', Object.assign({ nodeId: 0 }, SIGHT)),   // a link to a room that names none: a plain wall, and the key goes
            nm('lTypeNum', 'rect', { blocksSight: true, sightType: 1 }), nm('lTypeObj', 'rect', { blocksSight: true, sightType: { a: 1 } }),   // a type that is no text at all: it leaves typed wall
            nm('lColList', 'rect', Object.assign({ color: ['#8C7B5A'] }, SIGHT)),   // a color that is a list: no text, so it is left as it is, and the send does not throw
            nm('lColLead', 'rect', Object.assign({ color: 'x#AABBCC' }, SIGHT)),   // a hex color behind another letter is no hex color: as written
            nm('lColNoHex', 'rect', Object.assign({ color: '#GGHHII' }, SIGHT)),   // six letters that are no hex digits: as written
            // round two of Match a wall: the GM's Lock in place. A wall locked in place leaves with no locked key, a box, a line and a see-through
            // barrier alike, and so does one whose key is there as a 0, as a file with one schema for every piece may write it
            nm('lLocked', 'rect', Object.assign({ locked: true }, SIGHT)), Object.assign(nm('lLockLine', 'path', Object.assign({ locked: true }, SIGHT)), NLINE), nm('lLockBar', 'rect', { barrier: true, locked: true, color: 'transparent' }), nm('lLockZero', 'rect', Object.assign({ locked: 0 }, SIGHT))
        ];
        // a send that throws is a piece that left wrongly, said in the check's own detail (a color that is a list, were its guard gone)
        const leaveT = (wire, piece) => { try { return leave(wire, piece); } catch (e) { return { alone: null, onClone: null, kept: false, threw: String(e && e.message) }; } };
        const wiresN = [wwiS, wwiN, wwiO], kGot = wiresN.map(wire => keepers.map(p => leave(wire, p))), lGot = wiresN.map(wire => losers.map(p => leaveT(wire, p)));
        const lWant = p => noOff(wallShape(p));   // the suite's own reading of what a plain wall leaves as: its one shape, and no key that is false or null
        const kOk = (g, p) => !!g.alone && !!g.onClone && flat(g.alone) === flat(p) && flat(g.onClone) === flat(p) && g.alone.name === p.name && g.onClone.name === p.name && g.kept;
        const lOk = (g, p) => !!g.alone && !!g.onClone && !hasOff(g.alone) && !hasOff(g.onClone) && flat(g.alone) === flat(lWant(p)) && flat(g.onClone) === flat(lWant(p)) && !WALL_GOES.some(k => ownK(g.alone, k) || ownK(g.onClone, k)) && g.alone.sightType === 'wall' && g.onClone.sightType === 'wall' && g.kept && ownK(p, 'name') && plainWall(p);
        const nameHost = { id: 'mN', type: 'map', meta: { title: 'Names' }, rooms: [], links: [], whiteboard: keepers.concat(losers).map(copyOf) }, nameWas = J(nameHost), nameOut = (() => { try { return siS(nameHost); } catch (e) { return { whiteboard: [], threw: String(e && e.message) }; } })();
        const nameGot = nameOut.whiteboard.map(flat), nameWant = keepers.map(flat).concat(losers.map(p => flat(lWant(p))));   // the whole map: each keeper as it is, each loser in the one shape
        const whyK = keepers.map(p => nameWhy(p)), whyL = losers.map(p => nameWhy(p));
        // The edges of the rule's own words (the second reader's findings), held to what the title says of them: a value that is present and
        // reads as false is no reason to keep a name, a mark that reads as true and is not the word true is one, a name goes whatever it is, a
        // text or not, and no other key a wall commonly carries spares it
        const nmOf = (list, id) => list.find(p => p.id === id) || {}, FULLK = ['locked', 'height', 'cover', 'terrain', 'trap', 'groupId', 'layer', 'z', 'rot', 'fogHand'];
        const edgeGot = [nmOf(keepers, 'kTok1').isChar, losers.filter(p => typeof p.name !== 'string' || !p.name).map(p => [p.id, p.name]),
            [['lUnlinked', 'nodeId'], ['lNoWay', 'targetMapId'], ['lWasTok', 'isChar'], ['lNoWait', 'waiting'], ['lOdd', 'sightType']].map(r => [r[0], ownK(nmOf(losers, r[0]), r[1]), nmOf(losers, r[0])[r[1]]]),
            FULLK.filter(k => !nmOf(losers, 'lFull')[k]), nmOf(losers, 'lFull').opacity < 1, [nmOf(losers, 'lDrawn').type, nmOf(losers, 'lDrawn').ownerId, nmOf(losers, 'lDrawn').byPlayer]];
        const edgeOk = J(edgeGot) === J([1, [['lNone', ''], ['lNull', null], ['lNum', 0]], [['lUnlinked', true, null], ['lNoWay', true, ''], ['lWasTok', true, false], ['lNoWait', true, 0], ['lOdd', true, 'Door']], [], true, ['path', 'u_a', true]]);
        // The third review, said of what left with the real fogcore, part by part, so that a part of the shape that fails is named in the detail:
        // each thing a plain wall never leaves with (it was on the host's piece, it is not on what left); the type before and after; the color
        // before and after; what the wall with a wall's common keys still has; and each of the nine keepers that carry all of it
        const lAt = id => lGot[0][losers.findIndex(p => p.id === id)].alone || {}, kAt = id => kGot[0][keepers.findIndex(p => p.id === id)].alone || {};
        const goneGot = [['lGroup', 'groupId'], ['lOpen', 'doorOpen'], ['lLock', 'doorLock'], ['lRoom', 'targetRoomId'], ['lTrap', 'trap'], ['lIcon', 'portalIcon'], ['lPLock', 'portalLock'], ['lWall', 'name'], ['lLocked', 'locked'], ['lLockLine', 'locked'], ['lLockBar', 'locked'], ['lFull', 'locked']].map(r => [r[0], r[1], ownK(nmOf(losers, r[0]), r[1]), ownK(lAt(r[0]), r[1])]);
        const emptyGot = [['lEmptyGroup', 'groupId'], ['lZeroOpen', 'doorOpen'], ['lZeroLock', 'doorLock'], ['lEmptyRoom', 'targetRoomId'], ['lZeroTrap', 'trap'], ['lEmptyIcon', 'portalIcon'], ['lNoWay', 'targetMapId'], ['lZeroMap', 'targetMapId'], ['lEmptyNode', 'nodeId'], ['lZeroNode', 'nodeId'], ['lLockZero', 'locked']].map(r => [r[0], r[1], ownK(nmOf(losers, r[0]), r[1]) ? nmOf(losers, r[0])[r[1]] : 'no key', ownK(lAt(r[0]), r[1])]);
        // round two: the GM's Lock in place, with the real fogcore, with none and with an empty one. It stays on each piece that is no plain wall
        // and carries it (the nine that carry all of it and the four that carry it alone), and it leaves on no plain wall
        const lockKeep = keepers.filter(p => p.locked === true), lockLose = losers.filter(p => p.locked === true);
        const lockGot = [lockKeep.map(p => [p.id, wiresN.map((wire, n) => { const g = kGot[n][keepers.indexOf(p)]; return !!g.alone && !!g.onClone && g.alone.locked === true && g.onClone.locked === true; })]).filter(r => !r[1].every(Boolean)),
            losers.map((p, i) => [p.id, wiresN.map((wire, n) => { const g = lGot[n][i]; return !!g.alone && !!g.onClone && !ownK(g.alone, 'locked') && !ownK(g.onClone, 'locked'); })]).filter(r => !r[1].every(Boolean))];
        const typeGot = ['lWall', 'lBare', 'lBar', 'lOdd', 'lWindow', 'lBarAll', 'lLineAll', 'lTypeNum', 'lTypeObj'].map(id => [id, ownK(nmOf(losers, id), 'sightType') ? nmOf(losers, id).sightType : null, lAt(id).sightType]);
        const colGot = ['lUpper', 'lMixed', 'lBarAll', 'lLineAll', 'lShort', 'lHex8', 'lWord', 'lFunc', 'lTheme', 'lBar', 'lColList', 'lColLead', 'lColNoHex'].map(id => [id, nmOf(losers, id).color, lAt(id).color]);
        const colWant = [['lUpper', '#8C7B5A', '#8c7b5a'], ['lMixed', '#8c7B5a', '#8c7b5a'], ['lBarAll', '#8C7B5A', '#8c7b5a'], ['lLineAll', '#8C7B5A', '#8c7b5a'], ['lShort', '#ABC', '#ABC'], ['lHex8', '#AABBCCDD', '#AABBCCDD'], ['lWord', 'DarkRed', 'DarkRed'], ['lFunc', 'RGB(140, 123, 90)', 'RGB(140, 123, 90)'], ['lTheme', 'var(--panel2)', 'var(--panel2)'], ['lBar', 'transparent', 'transparent'], ['lColList', ['#8C7B5A'], ['#8C7B5A']], ['lColLead', 'x#AABBCC', 'x#AABBCC'], ['lColNoHex', '#GGHHII', '#GGHHII']];   // [the wall, its color on the host, its color as it leaves]
        const fullGot = [FULLK.filter(k => ownK(lAt('lFull'), k)), ownK(lAt('lFull'), 'opacity'), Object.keys(CARRY).filter(k => ownK(lAt('lBarAll'), k) || ownK(lAt('lLineAll'), k))];
        const heavy = keepers.filter(p => p.id.charAt(0) === 'h'), heavyGot = heavy.map(p => [p.id, Object.keys(CARRY).filter(k => kAt(p.id)[k] !== CARRY[k]), ownK(p, 'sightType') ? p.sightType : null, ownK(kAt(p.id), 'sightType') ? kAt(p.id).sightType : null]);
        const shapeSay = {
            'each thing a plain wall never leaves with is gone': J(goneGot) === J([['lGroup', 'groupId', true, false], ['lOpen', 'doorOpen', true, false], ['lLock', 'doorLock', true, false], ['lRoom', 'targetRoomId', true, false], ['lTrap', 'trap', true, false], ['lIcon', 'portalIcon', true, false], ['lPLock', 'portalLock', true, false], ['lWall', 'name', true, false], ['lLocked', 'locked', true, false], ['lLockLine', 'locked', true, false], ['lLockBar', 'locked', true, false], ['lFull', 'locked', true, false]]),
            'the GM\'s Lock in place stays on each piece that is no plain wall, and leaves on no plain wall, with the core or with none': lockKeep.length === 13 && lockLose.length === 6 && lockGot[0].length === 0 && lockGot[1].length === 0,
            'a key that is there as an empty text or a 0 is gone too': J(emptyGot) === J([['lEmptyGroup', 'groupId', '', false], ['lZeroOpen', 'doorOpen', 0, false], ['lZeroLock', 'doorLock', 0, false], ['lEmptyRoom', 'targetRoomId', '', false], ['lZeroTrap', 'trap', 0, false], ['lEmptyIcon', 'portalIcon', '', false], ['lNoWay', 'targetMapId', '', false], ['lZeroMap', 'targetMapId', 0, false], ['lEmptyNode', 'nodeId', '', false], ['lZeroNode', 'nodeId', 0, false], ['lLockZero', 'locked', 0, false]]),
            'a plain wall leaves typed wall': J(typeGot) === J([['lWall', 'wall', 'wall'], ['lBare', null, 'wall'], ['lBar', null, 'wall'], ['lOdd', 'Door', 'wall'], ['lWindow', 'window', 'wall'], ['lBarAll', null, 'wall'], ['lLineAll', null, 'wall'], ['lTypeNum', 1, 'wall'], ['lTypeObj', { a: 1 }, 'wall']]),
            'a hex color of six digits leaves in lower case and any other color as written': J(colGot) === J(colWant),
            'the wall with a wall\'s common keys keeps them but its lock, its trap mark and its group, and what carries all of it loses all of it but the color': J(fullGot) === J([['height', 'cover', 'terrain', 'layer', 'z', 'rot', 'fogHand'], true, ['color']]),
            'each keeper that carries all of it leaves with all of it, under its own type or none': heavy.length === 9 && J(heavyGot) === J([['hDoor', [], 'door', 'door'], ['hBarDoor', [], 'door', 'door'], ['hPortal', [], null, null], ['hNode', [], 'window', 'window'], ['hPic', [], null, null], ['hText', [], 'Door', 'Door'], ['hTok', [], null, null], ['hWait', [], 'window', 'window'], ['hFloor', [], 'window', 'window']])
        }, shapeNo = Object.keys(shapeSay).filter(k => !shapeSay[k]);
        // A pair made the same way, each with the traces of controls once used on it: a wall and a secret door seen in its look differ by id alone
        const TRACES = { isChar: false, locked: false, nodeId: null }, DTRACES = { isChar: false, locked: false, nodeId: null, doorLock: false, doorOpen: false };
        const trW = (id, more) => Object.assign({ id, type: 'rect', color: WALLC, texture: 'bricks' }, NBOX, SIGHT, more), trD = (id, more) => Object.assign({ id, type: 'rect', color: OAK, texture: 'planks', blocksSight: true, sightType: 'door', secret: true }, NBOX, more);
        const trPairs = [[trW('t1'), trD('t1', DTRACES)], [trW('t2', TRACES), trD('t2')], [trW('t3', TRACES), trD('t3', DTRACES)], [trW('t4', { locked: false }), trD('t4', { nodeId: null })],
            [trW('t5', { locked: true }), trD('t5')], [trW('t6'), trD('t6', { locked: true })], [trW('t7', { locked: true }), trD('t7', Object.assign({}, DTRACES, { locked: true, doorLock: true }))]];   // round two: the GM's Lock in place on the wall alone, on the secret door alone, and on both
        const trGot = trPairs.map(pr => pr.map(p => [J(wwiS(p, false)), J(wwiS(copyOf(p), true))])), trBad = trGot.map((g, i) => [i, g[0][0] === g[1][0] && g[0][1] === g[1][1] && g[0][0] === g[0][1] && !/false|null/.test(g[0][0]), g[0][0], g[1][0]]).filter(r => !r[1]);
        const offGot = [['lUnlinked', 'nodeId'], ['lWasTok', 'isChar'], ['lNoWay', 'targetMapId'], ['lNoWait', 'waiting']].map(r => [r[0], lGot[0][losers.findIndex(p => p.id === r[0])].alone]).map((r, i) => [r[0], ownK(r[1], ['nodeId', 'isChar', 'targetMapId', 'waiting'][i])]);
        const nameFails = [], WIREN = ['the real fogcore', 'no fogcore', 'an empty fogcore'];   // each piece that left wrongly, with what left, first in the detail
        wiresN.forEach((wire, n) => { keepers.forEach((p, i) => { if (!kOk(kGot[n][i], p)) nameFails.push([WIREN[n], 'should leave as it is', p.id, kGot[n][i].alone, kGot[n][i].onClone, kGot[n][i].kept]); });
            losers.forEach((p, i) => { if (!lOk(lGot[n][i], p)) nameFails.push([WIREN[n], 'should leave in a plain wall\'s one shape', p.id, lGot[n][i].alone, lGot[n][i].onClone, lGot[n][i].kept]); }); });
        check('map builder B5, a plain wall leaves in one shape and every other piece as it is (wireWbItem and sanitizeItem, run for real with the real fogcore, with none and with an empty one). A plain wall leaves the host with no name, no group, no open or locked word, no landing room, no trap mark, no portal\'s icon and no portal\'s lock, and with no way to a map and no link to a room, keys it can hold only as a value that reads as false: null, false, an empty text or a 0. Each of those keys goes whatever it holds, an empty text and a 0 too. It leaves typed wall, whether it had no type, the word wall, another word that is not door, such as Door or window, or a type that is no text, a number or an object. Its color leaves in lower case where it is a hex color of six digits, written in upper or in mixed case. A short hex, a hex with an alpha, a color word, a color as a function, a theme\'s color and the word transparent leave as written, and so do a color that is a list, a hex color behind another letter and six letters that are no hex digits. Held of fifty-six walls: a wall; a wall whose Blocks sight is 1 or a text; a wall with no type named; a see-through barrier; one typed a wall and ticked Stops blasts; a hexagon, a diamond and a circle that are walls; a wall drawn as a line; a filled region; a wall whose name is an empty text, null or the number 0; a wall unlinked from its room, whose nodeId is null; a wall whose way to another map is an empty text, and one where it is a 0; a wall whose Is Character was unticked, which leaves isChar false; a wall whose waiting mark is 0; a wall whose type is a word that is not door; a wall that has a height, cover, terrain, a layer, an order, an opacity under 1, a turn and a fog mark, all of which it keeps, and the GM\'s Lock in place, a trap mark and a group, which it loses; a player\'s drawing made a wall; one wall for each thing a plain wall never leaves with; walls in each kind of color; a see-through barrier and a line that carry all of it; six walls that carry a group, an open or a locked word, a landing room, a trap mark or a portal\'s icon as an empty text or a 0; two whose link to a room is an empty text or a 0; two whose type is a number or an object; three whose color is a list, a hex color behind another letter, or no hex digits; and, round two of Match a wall, a wall, a wall drawn as a line and a see-through barrier that the GM locked in place, and a wall whose locked key is a 0. No plain wall leaves with a locked key: the board draws a locked piece fainter on every screen, so the lock told a wall from a secret door beside it. A door, an open door, a see-through barrier\'s door, a wall that leads to another map, a wall on a room\'s node, a picture, a text box, a token marked by the word true, a token marked by 1 and a waiting token that block sight, a floor piece, a piece with Blocks sight unticked and one whose barrier flag is not the word true each leave under their own name with nothing else changed. A door that is no secret, a wall that leads to another map, a token and a floor piece that the GM locked in place leave locked, as they are. So do nine more, one for each part of the rule, that carry a group, an open and a locked word, a landing room, a trap mark, a portal\'s icon and lock, the GM\'s Lock in place and a hex color in upper case: each leaves with every one of them, under its own type or under none. A piece that blocks nothing and carries keys that are false or null keeps its name and every one of them. By the suite\'s own reading each of those twenty-seven is spared by one part of the rule alone, and all eight parts are tried. Alone, on a clone and on a whole map alike; the host\'s own piece is never changed by a send. And a wall leaves with no key whose value is false or null: the unlinked wall leaves with no nodeId key and the wall once a character with no isChar key, while a waiting mark of 0 is a value and stays (the empty way to a map goes by the shape itself); so a wall and a secret door seen in its look, each with the traces of a lock taken off, Is Character unticked, a link taken away or a door shut again, leave as the same text but for id, seven pairs, three of them with the GM\'s Lock in place on the wall alone, on the secret door alone and on both',
            nameFails.length === 0 && keepers.length === 27 && losers.length === 56 && edgeOk && shapeNo.length === 0 && trPairs.length === 7 && trBad.length === 0 && trGot.every(g => !/locked/.test(g[0][0] + g[1][0])) && J(offGot) === J([['lUnlinked', false], ['lWasTok', false], ['lNoWay', false], ['lNoWait', true]])
            && whyK.every(w => w.length === 1) && J(whyK.map(w => w[0]).filter((r, i, all) => all.indexOf(r) === i).sort()) === J(['door', 'free', 'node', 'picture', 'portal', 'text', 'token', 'waiting']) && J(heavy.map(p => nameWhy(p)[0]).sort()) === J(['door', 'door', 'free', 'node', 'picture', 'portal', 'text', 'token', 'waiting']) && whyL.every(w => w.length === 0)
            && J(nameGot) === J(nameWant) && J(nameHost) === nameWas && nameOut.whiteboard.length === 83 && nameOut.whiteboard.filter(w => w.locked === true).map(w => w.id).join() === lockKeep.map(p => p.id).join() && !nameOut.whiteboard.some(w => w.locked !== true && ownK(w, 'locked') && w.id !== 'kTraces'),
            J([shapeNo, shapeNo.length ? [goneGot.filter(r => r[3]), emptyGot.filter(r => r[3]), typeGot.filter(r => r[2] !== 'wall'), colGot.filter((r, i) => J(r) !== J(colWant[i])), fullGot, heavyGot.filter(r => r[1].length || r[2] !== r[3]), lockGot] : [], trBad.slice(0, 2), offGot, nameFails.slice(0, 3), nameFails.length, nameGot.map((r, i) => [r, nameWant[i]]).filter(r => r[0] !== r[1]).slice(0, 2), edgeOk ? 'the edge cases are as the title says' : edgeGot, [keepers.length, losers.length, nameOut.whiteboard.length], whyK.map((w, i) => [keepers[i].id, w]).filter(r => r[1].length !== 1), whyL.map((w, i) => [losers[i].id, w]).filter(r => r[1].length)]));

        // The point of the fix: over every color and pattern Build's options offer, a wall and a secret door seen in that wall's look. Each pair
        // is made by ONE tool: the copy keeps the door's other keys (its layer, its width), so the two differ by id and place alone where they
        // were made the same way, and that is what is held here. A wall that wears a picture has no twin, since a copy never carries one: it
        // is tried by itself after the pairs. The pieces are made by the app's own code: the real buildcore, the Build tool's buildMaterial,
        // buildProps, buildLay and buildWallItem and the city dialog's cityPiece and cityItems (whiteboard.js, sliced), and the pen's own preset
        // (datamap.js, its penpreset slice)
        const BCn = await import(urlS('buildcore.js')), CCn = await import(urlS('citycore.js'));
        const rdN = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', f), 'utf8').replace(/\r\n/g, '\n'), wbN = rdN('scripts/whiteboard.js'), dmN = rdN('scripts/datamap.js'), ixN = rdN('index.html');
        const onceN = (text, head) => { const i = text.indexOf(head); if (i < 0 || text.indexOf(head, i + 1) >= 0) throw new Error('netcheck: ' + head + ' not found once'); return i; };
        // the Build tool's functions are wbbuild.js's and the city dialog's wbgen.js's: each is cut from the part that holds it, read by name
        const wbBN = require('./checkkit').part('wbbuild.js'), wbGN = require('./checkkit').part('wbgen.js');
        const wbFn = (head, t) => { const i = onceN(t, head), e = t.indexOf('\n}\n', i); if (e < 0) throw new Error('netcheck: the end of ' + head + ' not found'); return t.slice(i, e + 3); };
        const wbLine = (head, t) => { const i = onceN(t, head); return t.slice(i, t.indexOf('\n', i)); };
        let uidN = 0; const stB = { mat: 'floor', shape: 'rect', tex: 'flagstones', pic: '', tile: 1, color: '#5a5663', terrain: 0, corridorW: 1, walls: false };   // the Build tool's own state, as it starts
        const Bt = new Function('buildCore', '_build', 'uid', 'newOpacityProps', 'toast', 'save', 'render', 'window',
            [wbLine('var BUILD_MAX = ', wbBN), wbLine('var CITY_GRIDS = ', wbGN), wbLine('function buildWet(id) {', wbBN), wbFn('function buildMaterial(mat) {', wbBN), wbFn('function buildProps() {', wbBN), wbLine('function buildWallItem(L, pre) {', wbBN), wbFn('function buildLay(map, boxes, props, more, walls) {', wbBN), wbFn('function cityPiece(g, props) {', wbGN), wbFn('function cityItems(pc, theme, furn) {', wbGN),
                'return { buildMaterial: buildMaterial, buildProps: buildProps, buildLay: buildLay, cityItems: cityItems };'].join('\n'))(() => BCn, stB, () => 'n' + (++uidN), () => ({}), () => {}, () => {}, () => {}, {});
        const penSrc = dmN.slice(onceN(dmN, '// [buildcheck:penpreset-start]'), onceN(dmN, '// [buildcheck:penpreset-end]'));
        const penArmed = require('./checkkit').part('wbbuild.js').includes('window.wpPenPreset = BC.penPreset(_build.mat, { color: _build.color });');   // what buildArm hands the pen: stroke() below hands it the same
        // A piece Build lays: the material picked (which brings its own color and pattern), then a color and a row of the Texture list, then the lay.
        // With pic, the list's last row is picked: one of the campaign's pictures as the fill, at a repeat of 2 cells (the material took any earlier one off)
        const lay = (mat, color, tex, box, pic) => { if (!Bt.buildMaterial(mat)) return null; if (color !== undefined) stB.color = color; if (tex !== undefined) stB.tex = tex; if (pic) { stB.pic = pic; stB.tile = 2; }
            const map = { whiteboard: [] }; Bt.buildLay(map, [box], Bt.buildProps()); stB.pic = ''; stB.tile = 1; return map.whiteboard.length === 1 ? map.whiteboard[0] : null; };
        // A Wall line or a Door line: the pen's own stroke, then Build's preset laid on it by the pen's own code
        const stroke = (mat, color, geo) => { if (!Bt.buildMaterial(mat)) return null; if (color !== undefined) stB.color = color;
            const item = { id: 'wb' + (++uidN), type: 'path', x: geo.x, y: geo.y, w: geo.w, h: geo.h, baseW: geo.baseW, baseH: geo.baseH, z: 10, pts: geo.pts, color: 'var(--ink)', strokeWidth: 3, tip: 'round' };
            new Function('window', 'item', penSrc)({ wpPenPreset: BCn.penPreset(stB.mat === 'door' ? 'door' : 'wall', { color: stB.color }), wpCanPersistLocal: () => true }, item); return item; };
        // Ticked Secret as Properties does it (setItemSecret, then setItemSeen for the color and for the pattern): shut, and the look as its cleaners keep it
        const tick = (door, color, tex) => { if (!door) return null; door.secret = true; delete door.doorOpen; if (color !== undefined) { const c = FC.cleanSeenColor(color); if (c) door.seenColor = c; } if (tex !== undefined) { const t = FC.cleanSeenTexture(tex); if (t !== null) door.seenTexture = t; } return door; };
        const SWATCH = (ixN.slice(onceN(ixN, '<div class="draw-menu-row" id="buildColorRow">'), onceN(ixN, 'id="buildColorInput"')).match(/class="draw-swatch build-sw" data-color="#[0-9a-f]{6}"/g) || []).map(s => s.slice(-8, -1));   // the swatches of Build's options, as the page has them
        const COLORS = SWATCH.concat(['#a1b2c3']), TEXS = BCn.TEXTURES.slice(0, 16).concat(['']);   // and one custom color, as the color box gives one; the Texture list's rows: the patterns, and Plain color
        const MATS = BCn.MATERIAL_IDS.slice(0, 10).filter(id => BCn.MATERIALS[id].blocksSight === true && BCn.MATERIALS[id].sightType === 'wall');   // the materials that are walls
        const LGEO = BCn.wallLine([[200, 50], [200, 100]]), BOXES = [{ type: 'rect', x: 300, y: 100, w: 50, h: 50 }, { type: 'circle', x: 300, y: 100, w: 100, h: 100 }, { type: 'hexagon', x: 300, y: 104, w: 60, h: 52 }, BCn.polyItem([[300, 100], [400, 100], [400, 200]])];   // what Build lays: a box, a circle, a hex cell, a filled region
        const DOORPIC = '/saves/images/k/oak door.png', WALLPIC = '/saves/images/k/stonework.png';   // two of the campaign's own pictures, as the Image Library lists one
        const pairs = [], LANDB = ['forest', 'mountains', 'sand', 'snow'];   // fold B7: the four land patterns, rows of the Texture list like any other
        MATS.forEach(mat => COLORS.forEach((color, ci) => TEXS.forEach((tex, ti) => {
            const box = BOXES[pairs.length % BOXES.length], wall = lay(mat, color, tex, copyOf(box));
            const door = tick(lay('door', COLORS[(ci + 3) % COLORS.length], TEXS[(ti + 5) % TEXS.length], copyOf(box), pairs.length % 3 === 0 ? DOORPIC : ''), color, tex);   // a Build Door in a look of its own, never the wall's, every third one wearing a picture of its own, seen in the wall's
            pairs.push({ label: mat + ' ' + color + ' ' + (tex || 'plain') + ' ' + box.type, group: 'block', shape: box.type, wall, door, color, tex, named: BCn.MATERIALS[mat].name });
        })));
        COLORS.forEach((color, ci) => { pairs.push({ label: 'line ' + color, group: 'line', wall: stroke('wall', color, copyOf(LGEO)), door: tick(stroke('door', COLORS[(ci + 3) % COLORS.length], copyOf(LGEO)), color), color, tex: '', named: 'Wall' }); });   // a line has no Seen pattern
        pairs.push({ label: 'a Wall in its own look, no look named', group: 'own', wall: lay('wall', undefined, undefined, copyOf(BOXES[0])), door: tick(lay('door', undefined, undefined, copyOf(BOXES[0]))), color: WALLC, tex: 'bricks', named: 'Wall' });
        pairs.push({ label: 'a Wall line in its own look, no look named', group: 'own', wall: stroke('wall', undefined, copyOf(LGEO)), door: tick(stroke('door', undefined, copyOf(LGEO))), color: WALLC, tex: '', named: 'Wall' });
        // What the city generator lays, dressed by the city dialog's own cityItems: a Building under each roof in that roof's color (a box in a
        // village, a region in a town), a City wall block, a City wall line and a tower
        const CW = BCn.MATERIALS.citywall, cityPc = { grounds: [], buildings: CCn.ROOF_NAMES.map((roof, i) => ({ geo: copyOf(BOXES[i % 2 ? 3 : 0]), roof, color: CCn.ROOF_COLOR[roof] })), walls: [{ geo: copyOf(BOXES[0]), line: false }, { geo: copyOf(LGEO), line: true }], towers: [{ geo: copyOf(BOXES[1]) }] };
        const cityLaid = Bt.cityItems(cityPc), cityLook = cityPc.buildings.map(b => [b.geo, b.color, b.roof, 'Building']).concat([[cityPc.walls[0].geo, CW.color, CW.texture, CW.name], [cityPc.walls[1].geo, CW.color, '', CW.name], [cityPc.towers[0].geo, CW.color, CW.texture, CW.name]]);
        cityLaid.forEach((wall, i) => { const g = cityLook[i] || [BOXES[0], '', '', ''], line = wall.type === 'path' && wall.tip !== 'fill'; let door;
            if (line) { door = stroke('door', undefined, copyOf(g[0])); door.strokeWidth = wall.strokeWidth; tick(door, g[1]); }   // a Door line made as wide as the city's wall line, since a line's width is seen
            else door = tick(lay('door', undefined, undefined, copyOf(g[0])), g[1], g[2]);
            pairs.push({ label: 'city ' + g[3] + ' ' + (g[2] || 'line') + ' ' + wall.type, group: 'city', wall, door, color: g[1], tex: g[2], named: g[3] }); });
        // A rectangle made a wall by hand in Properties, with no name, and the same rectangle made a door, opened, named, ticked Secret and seen in that wall's look
        const HAND = { type: 'rect', x: 700, y: 300, w: 120, h: 40, z: 10 };
        pairs.push({ label: 'a wall made by hand, with no name', group: 'hand', wall: Object.assign({ id: 'hw' }, HAND, { color: '#556677', blocksSight: true, sightType: 'wall' }), door: tick(Object.assign({ id: 'hd' }, HAND, { color: '#884422', name: 'Hidden way', blocksSight: true, sightType: 'door', doorOpen: true }), '#556677', ''), color: '#556677', tex: '', named: undefined });
        // The third review of fold B5. Walls as a campaign FILE writes them: the piece Build lays with its type taken off and its hex color written
        // in upper case, as a tool that follows the integration guide writes a wall (Blocks sight alone), beside a Build Door seen in that color
        // and pattern. For each material that is a wall and each row of the Texture list, and three Wall lines
        const asFile = wall => { if (!wall) return null; const f = copyOf(wall); delete f.sightType; if (typeof f.color === 'string') f.color = f.color.toUpperCase(); return f; };
        MATS.forEach((mat, mi) => TEXS.forEach((tex, ti) => { const color = COLORS[(mi * 5 + ti) % COLORS.length], box = BOXES[(mi + ti) % BOXES.length];
            pairs.push({ label: 'file ' + mat + ' ' + color + ' ' + (tex || 'plain') + ' ' + box.type, group: 'file', file: true, wall: asFile(lay(mat, color, tex, copyOf(box))), door: tick(lay('door', undefined, undefined, copyOf(box)), color, tex), color, tex, named: BCn.MATERIALS[mat].name }); }));
        COLORS.slice(0, 3).forEach(color => { pairs.push({ label: 'file line ' + color, group: 'file', file: true, wall: asFile(stroke('wall', color, copyOf(LGEO))), door: tick(stroke('door', undefined, copyOf(LGEO)), color), color, tex: '', named: 'Wall' }); });
        // A room's wall and its door grouped together, as the menu's Group does it: one groupId on the wall and on the secret door behind it. Every
        // fourth block pair again, under ids of its own, with the group on both
        pairs.filter((pr, i) => pr.group === 'block' && i % 4 === 0).forEach((pr, i) => { if (!pr.wall || !pr.door) return; const wall = Object.assign(copyOf(pr.wall), { id: 'gw' + i, groupId: 'group_' + (1760000000000 + i) }), door = Object.assign(copyOf(pr.door), { id: 'gd' + i, groupId: wall.groupId });
            pairs.push({ label: 'grouped ' + pr.label, group: 'grouped', wall, door, color: pr.color, tex: pr.tex, named: pr.named }); });
        const eqId = o => (o ? J(Object.assign({}, o, { id: 0 })) : 'nothing'), hostWasN = J(pairs.map(pr => [pr.wall, pr.door]));
        const pairGot = pairs.map(pr => { if (!pr.wall || !pr.door) return { same: false, bare: false, worn: false, made: false, a: null, b: null };
            const a = wwiS(pr.wall, false), b = wwiS(pr.door, false), a2 = wwiS(copyOf(pr.wall), true), b2 = wwiS(copyOf(pr.door), true);
            return { a, b, same: !!a && !!b && !!a2 && !!b2 && eqId(a) === eqId(b) && eqId(a2) === eqId(b2) && eqId(a) === eqId(a2) && a.id !== b.id && J(a) !== J(b),   // the same text once the ids are made equal, alone and on a clone
                bare: !!a && !!b && !ownK(a, 'name') && !ownK(b, 'name'),   // neither holds a name
                worn: !!a && a.color === pr.color && (pr.tex ? a.texture === pr.tex : !ownK(a, 'texture')) && a.sightType === 'wall' && a.blocksSight === true,   // the wall leaves in the look it was laid in
                made: pr.wall.name === pr.named && (pr.file ? !ownK(pr.wall, 'sightType') : pr.wall.sightType === 'wall') && pr.door.sightType === 'door' && pr.door.secret === true && pr.door.id !== pr.wall.id && ['x', 'y', 'w', 'h', 'type'].every(k => pr.door[k] === pr.wall[k]) }; });   // the host's wall has its maker's name, and the door stands at the same place
        const bigHost = { id: 'mBig', type: 'map', meta: { title: 'Town' }, rooms: [], links: [], whiteboard: pairs.map((pr, i) => Object.assign(copyOf(pr.wall), { id: 'w' + i })).concat(pairs.map((pr, i) => Object.assign(copyOf(pr.door), { id: 's' + i }))) }, bigWas = J(bigHost), bigOut = siS(bigHost);
        const bigOk = bigOut.whiteboard.length === pairs.length * 2 && pairs.every((pr, i) => { const a = bigOut.whiteboard[i], b = bigOut.whiteboard[pairs.length + i]; return !!a && !!b && a.id === 'w' + i && b.id === 's' + i && eqId(a) === eqId(b); }) && J(bigHost) === bigWas && !/"name"|"secret"|seenColor|seenTexture|"door"|doorOpen|Hidden way|groupId|group_1760/.test(J(bigOut.whiteboard));
        const groups = {}, shapes = {}; pairs.forEach(pr => { groups[pr.group] = (groups[pr.group] || 0) + 1; if (pr.shape) shapes[pr.shape] = (shapes[pr.shape] || 0) + 1; });
        const pairBad = pairGot.map((g, i) => [pairs[i].label, g.same, g.bare, g.worn, g.made, g.a, g.b]).filter(r => !(r[1] && r[2] && r[3] && r[4]));
        // No picture among what the sweep sends: a third of its block Doors wear one of their own, and no copy carries it
        const doorPics = pairs.filter(pr => pr.door && pr.door.texSrc === DOORPIC && pr.door.texTile === 2 && !ownK(pr.door, 'texture')).length;
        const sentPics = pairGot.map((g, i) => [pairs[i].label, g.a, g.b]).filter(r => [r[1], r[2]].some(o => !o || ownK(o, 'texSrc') || ownK(o, 'texTile'))).concat(/texSrc|texTile|oak door/.test(J(bigOut.whiteboard)) ? [['the whole map holds a picture']] : []);
        // A wall that wears a picture. Build's Texture list has more rows than its patterns: A picture, and the picked picture's own row. Such a
        // wall has no twin, since a copy never carries a picture. It leaves with its picture and with no name, as every plain wall does. The
        // nearest copy there is, a secret Door seen in that wall's color with Plain color, differs from it by the picture and the id alone
        const picWall = lay('wall', undefined, undefined, copyOf(BOXES[0]), WALLPIC), picDoor = tick(lay('door', undefined, undefined, copyOf(BOXES[0]), WALLPIC));
        const picNear = tick(lay('door', undefined, undefined, copyOf(BOXES[0]), WALLPIC), picWall ? picWall.color : undefined, ''), picLaid = [picWall, picDoor, picNear], picWas = J(picLaid);
        const picOut = picLaid.map(p => (p ? [wwiS(p, false), wwiS(copyOf(p), true)] : [null, null])), picA = picOut[0][0], picB = picOut[1][0], picC = picOut[2][0];
        const picMap = siS({ id: 'mPic', type: 'map', meta: { title: 'Pictures' }, rooms: [], links: [], whiteboard: picLaid.filter(Boolean).map(copyOf) }).whiteboard;
        const picSay = {
            'the pieces as Build laid them': picLaid.every(Boolean) && FC.cleanTexSrc(WALLPIC) === WALLPIC && picWall.texSrc === WALLPIC && picWall.texTile === 2 && !ownK(picWall, 'texture') && picWall.name === 'Wall' && picWall.sightType === 'wall'
                && [picDoor, picNear].every(d => d.texSrc === WALLPIC && d.texTile === 2 && d.name === 'Door' && d.sightType === 'door' && d.secret === true),
            'the wall leaves with its picture and no name': !!picA && !!picWall && picA.texSrc === WALLPIC && picA.texTile === 2 && !ownK(picA, 'texture') && !ownK(picA, 'name') && flat(picA) === flat(less(picWall, ['name'])) && flat(picOut[0][1]) === flat(picA),
            'the copy carries no picture': [picOut[1], picOut[2]].every(pr => pr.every(o => !!o && !ownK(o, 'texSrc') && !ownK(o, 'texTile') && !ownK(o, 'name') && o.sightType === 'wall')) && !!picB && picB.color === WALLC && picB.texture === 'bricks' && flat(picOut[1][1]) === flat(picB),
            'no twin, and the nearest copy differs by the picture alone': !!picA && !!picB && !!picC && eqId(picA) !== eqId(picB) && eqId(picA) !== eqId(picC) && eqId(less(picA, ['texSrc', 'texTile'])) === eqId(picC) && flat(picOut[2][1]) === flat(picC),
            'on a whole map alike': picMap.length === 3 && [picA, picB, picC].every((o, i) => !!o && flat(picMap[i]) === flat(o)),
            'the host\'s pieces are left as they were': J(picLaid) === picWas
        }, picNo = Object.keys(picSay).filter(k => !picSay[k]);
        const fileUp = pairs.filter(pr => pr.file && pr.wall && pr.wall.color === pr.color.toUpperCase() && pr.wall.color !== pr.color && !ownK(pr.wall, 'sightType')).length;   // the file pairs whose wall really stands in upper case on the host, with no type
        // The third review of fold B5: a wall whose color is no hex color of six digits. A short hex, a color word, and the Shapes tool's own
        // default, a theme's color. Seen as takes a hex color of six digits and nothing else (fogcore cleanSeenColor), so no secret door can be
        // seen in that very text. And the wire does not rewrite such a color: a theme's color is another color on a player's light theme, and
        // no rule of the app's turns a word into one hex. So such a wall has no twin. What the suite holds of it: the wall leaves in its color
        // exactly as written, and the nearest copy there is, a secret door seen in the same color written out in six digits, differs from it
        // by the color's text and the id alone. That one difference stands, and it is said here rather than hidden
        const ODD = [['#abc', '#aabbcc'], ['#ABC', '#aabbcc'], ['DarkRed', '#8b0000'], ['var(--panel2)', '#262633']];
        const oddGot = ODD.map((c, i) => { const wall = Object.assign({ id: 'ow' + i }, HAND, { color: c[0], blocksSight: true, sightType: 'wall' }), door = tick(Object.assign({ id: 'od' + i }, HAND, { color: '#884422', name: 'Hidden way', blocksSight: true, sightType: 'door', doorOpen: true }), c[1], ''), a = wwiS(wall, false), b = wwiS(door, false);
            return [c[0], !!a && a.color, !!b && b.color, !!a && !!b && eqId(a) !== eqId(b) && eqId(less(a, ['color'])) === eqId(less(b, ['color'])), FC.cleanSeenColor(c[0])]; });
        check('map builder B5, a wall and a secret door seen in that wall\'s look, over every color and pattern Build\'s options offer (the real buildcore, the Build tool\'s own buildMaterial, buildProps and buildLay, the pen\'s own preset code and the city dialog\'s cityItems, each run for real, then the real wireWbItem and sanitizeItem): the two leave the host as the same piece but for the id. Each pair is made by one tool, so the two are made the same way: the copy keeps the door\'s other keys, such as its layer. For each material that is a wall (Wall, Building, City wall), each of the ten swatch colors of Build\'s options and one custom color, and each pattern row of its Texture list (the sixteen patterns, the four land patterns of fold B7 its last four, and Plain color): the piece Build lays, a box, a circle, a hex cell or a filled region, beside a Build Door at the same place, in another look of its own, every third one wearing a picture of its own, ticked Secret and seen in that color and pattern. A Wall line in each color beside a Door line ticked Secret and seen in that color. A Wall and a Wall line in the material\'s own look beside a secret Door with no look named. What the city generator lays, a Building under each roof in that roof\'s color, a City wall block, a City wall line 8 px wide and a tower, beside a Build Door of the same shape and width. A rectangle made a wall by hand, with no name, beside the same rectangle made a secret door. Walls as a campaign file writes them: for each material and each pattern row the piece Build lays, and three Wall lines, with the type taken off and the hex color written in upper case, beside a Build Door seen in that color and pattern. Grouped pairs: every fourth block pair again with one groupId on the wall and on the door, as the menu\'s Group gives a room and its door. Sent alone, on a clone and on one whole map, the two texts are equal once the ids are made equal. Neither holds a name or a group, though on the host each wall that Build or the city generator made has its maker\'s name and each Build Door is named Door. Each wall leaves in the look it was laid in, a file\'s upper-case color in lower case. No send changes a piece of the host\'s. 777 pairs, and nothing sent of them holds a picture. A wall that wears a picture has no twin: a copy never carries one. A Wall that Build laid with one of the campaign\'s pictures leaves with the picture\'s path and its repeat, with no pattern and no name. A Build Door laid with that picture and ticked Secret leaves as a wall in the Wall material\'s look, with no picture. The same Door seen in the wall\'s color with Plain color differs from that wall by the picture and the id alone. A wall whose color is no hex color of six digits has no twin either: Seen as names a hex color of six digits and nothing else, and the wire leaves any other color as written. A wall in a short hex, in a color word or in a theme\'s color leaves in that very text, and a secret door seen in the same color written out in six digits differs from it by the color\'s text and the id alone',
            pairBad.length === 0 && pairs.length === 777 && J(groups) === J({ block: 561, line: 11, own: 2, city: 7, hand: 1, file: 54, grouped: 141 }) && J(shapes) === J({ rect: 141, circle: 140, hexagon: 140, path: 140 })
            && SWATCH.length === 10 && SWATCH.every((c, i) => SWATCH.indexOf(c) === i) && TEXS.length === 17 && J(TEXS.slice(8, 12)) === J(['shingles', 'pantiles', 'slates', 'thatch']) && J(TEXS.slice(12)) === J(['forest', 'mountains', 'sand', 'snow', '']) && LANDB.every(n => pairs.filter(pr => pr.group === 'block' && pr.tex === n).length === 33 && pairs.filter(pr => pr.group === 'block' && pr.door && pr.door.texture === n).length >= 1) && J(BCn.TEXTURES) === J(FC.TEXTURES) && J(MATS) === J(['wall', 'building', 'citywall']) && penArmed
            && cityLaid.length === 7 && cityLaid[5].type === 'path' && cityLaid[5].strokeWidth === 8 && J(CCn.ROOF_NAMES.map((r, i) => cityLaid[i].texture + ' ' + cityLaid[i].color)) === J(['shingles #7a3f33', 'pantiles #a8552f', 'slates #4b5563', 'thatch #b59a55'])
            && pairs.filter(pr => pr.door && pr.door.name === 'Door').length === 776 && J(pairs.map(pr => [pr.wall, pr.door])) === hostWasN && bigOk
            && fileUp === 54 && pairs.filter(pr => pr.group === 'grouped').every(pr => /^group_\d+$/.test(pr.wall.groupId) && pr.wall.groupId === pr.door.groupId)
            && doorPics === 234 && sentPics.length === 0 && picNo.length === 0 && J(oddGot) === J(ODD.map(c => [c[0], c[0], c[1], true, null])),
            J([pairBad.slice(0, 2), sentPics.slice(0, 2), picNo, picNo.length ? [picA, picB, picC] : [], oddGot, [pairs.length, doorPics, sentPics.length, fileUp], groups, shapes, SWATCH, MATS, penArmed, cityLaid.length, bigOk]));

        // ---- (2d) the third review of fold B5 (wire V1, V2, V3 and V5): each second reader's failing input, as a case of its own ----
        // V1. A wall as a campaign file writes one: Blocks sight alone, with no type named, its hex color in upper case. Beside it the same piece
        // typed a door, ticked Secret and seen in that color with Plain color. Once the copy was the one wall there with a sightType key, and
        // with its color in lower case
        const FWALL = { type: 'rect', x: 0, y: 0, w: 50, h: 50, color: '#8C7B5A', blocksSight: true };
        const fileWall = Object.assign({ id: 'fw' }, FWALL), fileDoor = Object.assign({ id: 'fd' }, FWALL, { sightType: 'door', secret: true, seenColor: '#8C7B5A', seenTexture: '' }), fileWas = J([fileWall, fileDoor]);
        const V1TEXT = id => '{"blocksSight":true,"color":"#8c7b5a","h":50,"id":"' + id + '","sightType":"wall","type":"rect","w":50,"x":0,"y":0}';
        const v1Got = { wall: [wwiS, wwiN, wwiO].map(wire => [J(wire(fileWall, false)), J(wire(copyOf(fileWall), true))]), door: [J(wwiS(fileDoor, false)), J(wwiS(copyOf(fileDoor), true))], map: siS({ id: 'mV1', type: 'map', whiteboard: [copyOf(fileWall), copyOf(fileDoor)] }).whiteboard.map(J) };
        // ... and on a player's app. The second reader saw the difference survive the player's own cleaner (cleanHostWbItem, the real one, sliced
        // as part (3) below slices it): the two sent pieces are run through it, and what the app keeps of each is the same text still
        const pageV1 = new Function('window', 'cleanWaitingItem', 'sanitizeRichText', 'safeColor', '"use strict";\n' + lineOf('function cleanHostWbItem(w) {') + '\n' + lineOf('function cleanHostLight(w) {') + '\nreturn cleanHostWbItem;')({ wpFogCore: FC }, H.cleanWaitingItem, t => t, v => v);
        v1Got.page = [fileWall, fileDoor].map(p => J(pageV1(wwiS(p, false))));
        check('map builder B5, a wall as a campaign file writes one (the third review; wireWbItem and sanitizeItem, run for real). A wall written as the integration guide says, Blocks sight alone with no type named, and its hex color in upper case, leaves typed wall with its color in lower case, with the real fogcore, with none and with an empty one. The same piece typed a door, ticked Secret and seen in that color with Plain color leaves as the very same text but for its id, alone, on a clone and on a whole map, and a player\'s app keeps the two as that same text (the real cleanHostWbItem). So in a campaign made by a script the secret door is not the one wall with a type, nor the one whose color is in lower case. The host\'s two pieces are left as the file wrote them',
            v1Got.wall.every(pr => pr[0] === V1TEXT('fw') && pr[1] === V1TEXT('fw')) && v1Got.door[0] === V1TEXT('fd') && v1Got.door[1] === V1TEXT('fd') && J(v1Got.map) === J([V1TEXT('fw'), V1TEXT('fd')]) && J(v1Got.page) === J([V1TEXT('fw'), V1TEXT('fd')]) && J([fileWall, fileDoor]) === fileWas && !ownK(fileWall, 'sightType') && fileWall.color === '#8C7B5A',
            J([v1Got, V1TEXT('fw')]));
        // V2. A room: four walls and a door as Build lays them, grouped as the menu's Group does it (one groupId on all five), the door ticked
        // Secret. Once the copy was the one wall of the room with no group. Sent through sanitizeItem, as a whole map is
        const roomAt = [[300, 100], [350, 100], [400, 100], [300, 150]], roomWalls = roomAt.map(xy => lay('wall', undefined, undefined, { type: 'rect', x: xy[0], y: xy[1], w: 50, h: 50 })), roomDoor = tick(lay('door', undefined, undefined, { type: 'rect', x: 400, y: 150, w: 50, h: 50 }));
        const ROOMG = 'group_1760000000000', roomOf = grouped => { const five = roomWalls.concat([roomDoor]).map(p => (p ? copyOf(p) : { id: 'no piece' })); if (grouped) five.forEach(p => { p.groupId = ROOMG; }); return { id: 'mRoom', type: 'map', meta: { title: 'Room' }, rooms: [], links: [], whiteboard: five }; };
        const noPlace = o => J(Object.assign({}, o, { id: 0, x: 0, y: 0 })), roomHost = roomOf(true), roomWas = J(roomHost), roomOut = siS(roomHost).whiteboard, roomFree = siS(roomOf(false)).whiteboard;
        const v2Say = {
            'the room as Build laid it, grouped': roomWalls.every(w => !!w && w.name === 'Wall' && w.sightType === 'wall') && !!roomDoor && roomDoor.name === 'Door' && roomDoor.sightType === 'door' && roomDoor.secret === true && roomHost.whiteboard.length === 5 && roomHost.whiteboard.every(p => p.groupId === ROOMG),
            'the five differ by id and place alone': roomOut.length === 5 && roomOut.every(o => noPlace(o) === noPlace(roomOut[0])) && roomOut.map(o => o.id).filter((id, i, all) => all.indexOf(id) === i).length === 5 && roomOut.map(o => o.x + ',' + o.y).filter((at, i, all) => all.indexOf(at) === i).length === 5,
            'no group, no name and no door is sent': !/groupId|group_1760|"name"|"door"|"secret"/.test(J(roomOut)) && roomOut.every(o => o.sightType === 'wall' && o.blocksSight === true),
            'the same room with no group leaves as the very same texts': J(roomFree) === J(roomOut),
            'the host\'s room keeps its group': J(roomHost) === roomWas
        }, v2No = Object.keys(v2Say).filter(k => !v2Say[k]);
        check('map builder B5, a room grouped with its secret door (the third review; the real buildcore and the Build tool\'s own lay, then the real sanitizeItem): four walls and a door as Build lays them, given one groupId as the menu\'s Group gives a selection, the door ticked Secret. On the players\' copy of the map the five differ by id and place alone: no wall carries the group, so the secret door is not the one wall of its room without one. No group, no name and no door is in what is sent. The same room with no group leaves as the very same texts. The host\'s room keeps its group',
            v2No.length === 0, J([v2No, roomOut.map(o => [o.id, o.groupId === undefined ? 'no group' : o.groupId, o.sightType, o.name === undefined ? 'no name' : o.name])]));
        // V3. A wall and a door drawn with each nib of the pen, the stroke as the pen stores one. The wall is made a wall in Properties. The door is
        // typed a door, ticked Secret and seen in the wall's color. Once the flat nib's copy wore bricks by default, where no line that is a wall
        // wears a pattern (Properties offers no Texture list for a line). A filled region is no line and still wears one
        const NIBS = ['round', 'square', 'flat'], penStroke = (id, tip, more) => Object.assign({ id, type: 'path', x: 200, y: 50, w: 6, h: 50, baseW: 6, baseH: 50, z: 10, pts: [[0, 0], [0, 50]], color: '#E9E9F0', strokeWidth: 6, tip }, more);
        const nibGot = NIBS.concat(['fill']).map(tip => { const wall = penStroke('nw_' + tip, tip, { blocksSight: true, sightType: 'wall' }), seen = tick(penStroke('nd_' + tip, tip, { color: '#7b5a3a', blocksSight: true, sightType: 'door', doorOpen: true }), '#E9E9F0'), bare = tick(penStroke('nb_' + tip, tip, { color: '#7b5a3a', blocksSight: true, sightType: 'door' }));
            const a = wwiS(wall, false), b = wwiS(seen, false), c = wwiS(bare, false), a2 = wwiS(copyOf(wall), true), b2 = wwiS(copyOf(seen), true);
            return [tip, !!a && !!b && eqId(a) === eqId(b) && eqId(a2) === eqId(b2) && a.id !== b.id, !!a && a.color, !!b && b.color, !!b && ownK(b, 'texture') ? b.texture : 'no pattern', !!c && c.color, !!c && ownK(c, 'texture') ? c.texture : 'no pattern', !!a && a.tip]; });
        check('map builder B5, each nib of the pen (the third review; wireWbItem, run for real with the real fogcore): a stroke of the round, the square and the flat nib made a wall, beside the same stroke typed a door, ticked Secret and seen in the wall\'s color. The two leave as the same text but for the id, alone and on a clone, the wall\'s upper-case color in lower case on both, and neither wears a pattern. The same door with no look named leaves in the Wall material\'s color and with no pattern, under the flat nib as under the others. A filled region is no line: its secret door with no look named leaves in the Wall material\'s bricks, and one seen in a color alone wears them too, so it is no twin of a plain filled wall',
            J(nibGot) === J([['round', true, '#e9e9f0', '#e9e9f0', 'no pattern', WALLC, 'no pattern', 'round'], ['square', true, '#e9e9f0', '#e9e9f0', 'no pattern', WALLC, 'no pattern', 'square'], ['flat', true, '#e9e9f0', '#e9e9f0', 'no pattern', WALLC, 'no pattern', 'flat'], ['fill', false, '#e9e9f0', '#e9e9f0', 'bricks', WALLC, 'bricks', 'fill']]),
            J(nibGot));
        // V5. The integration guide's sentence on a secret door, as a tool's author reads it. Each key it lists as the way through is one the
        // copy really leaves without (the secret door sdN above carries all six)
        const guideN = fs.readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').replace(/\r\n/g, '\n'), gA = guideN.indexOf('may be a secret door (1.5.4)'), gZ = gA < 0 ? -1 : guideN.indexOf('The six keys (`secret` and the five `seen` keys) are the GM\'s and are never sent.', gA), guideS = gA >= 0 && gZ > gA ? guideN.slice(gA, gZ) : '';
        const WAYK = ['targetMapId', 'targetRoomId', 'nodeId', 'trap', 'portalIcon', 'portalLock'], sdNAt = secretCases.findIndex(c => c[0].id === 'sdN');
        // Round two of Match a wall: what the sentence now says, each part held to what the real wire sent of the cases of part (1) and of one
        // wall line as a file may write it, locked in place, its width a text with its unit, its opacity 1, no nib named and its color in upper case
        const outOfG = id => { const at = secretCases.findIndex(c => c[0].id === id); return at >= 0 && secGot[at].alone ? secGot[at].alone : { 'no such case': id }; }, hostOfG = id => (secretCases.find(c => c[0].id === id) || [{}])[0];
        const gLine = wwiS(Object.assign({ id: 'gvL' }, less(LINE, ['tip']), { blocksSight: true, strokeWidth: '4.5px', opacity: 1, locked: true, color: '#AABBCC' }), false) || {};
        const v5Say = {
            'the sentence is there once': gA >= 0 && guideN.indexOf('may be a secret door (1.5.4)', gA + 1) < 0 && gZ > gA,
            'it lists every key of the way through that the copy leaves without': guideS.includes('no way through of its own (`targetMapId`, `targetRoomId`, `nodeId`, `trap`, `portalIcon`, `portalLock`)') && sdNAt >= 0 && WAYK.every(k => ownK(secretCases[sdNAt][0], k) && !ownK(secGot[sdNAt].alone, k) && !ownK(secGot[sdNAt].onClone, k)),
            'it says the copy has no name, and what no plain wall is sent with, a locked mark among it': guideS.includes(' and no name (no plain wall is sent with a name, a group, a `locked` mark, or a key whose value is `false` or `null`, and each is sent with `sightType: "wall"` and a hex color in lower case; a wall drawn as a `path` is also sent with `strokeWidth` as a number, `opacity` only below 1 and `tip` as `"round"`, `"square"` or `"flat"`)')
                && hostOfG('sdZ7').locked === true && hostOfG('sdZ8').locked === true && !ownK(outOfG('sdZ7'), 'locked') && !ownK(outOfG('sdZ8'), 'locked') && outOfG('sdZ7').sightType === 'wall'
                && J([gLine.strokeWidth, ownK(gLine, 'opacity'), gLine.tip, ownK(gLine, 'locked'), gLine.sightType, gLine.color, ownK(gLine, 'name')]) === J([4.5, false, 'round', false, 'wall', '#aabbcc', false]),
            'it does not say that the name reads Wall': !/name that reads|"Wall"/.test(guideS),
            'it says the look named may be the word transparent, for nothing drawn': guideS.includes(', in the Wall material\'s look or in the one `seenColor` (`"#rrggbb"`, or `"transparent"` for nothing drawn) and `seenTexture` (a texture name, or `""` for a plain color) name;')
                && hostOfG('sdZ1').seenColor === 'transparent' && outOfG('sdZ1').color === 'transparent' && !ownK(outOfG('sdZ1'), 'texture') && outOfG('sdZ4').color === 'transparent',
            'it says a line takes no pattern, and no longer that it takes the color alone': guideS.includes(' a door drawn as a line takes no pattern, and a see-through door stays clear until a look is named.') && !/takes the color alone/.test(guideS)
                && ['sdK', 'sdQ', 'sdQ3', 'sdZ4'].every(id => typeof hostOfG(id).seenTexture === 'string' && hostOfG(id).seenTexture !== '' && outOfG(id).type === 'path' && !ownK(outOfG(id), 'texture')),
            'it names the three keys Match sets with their bounds, and says they are dropped on any other piece': guideS.includes(' A secret door drawn as a `path` that is no filled region may also carry `seenWidth` (a number above 0: the copy\'s own stroke width, in the door\'s own box), `seenOpacity` (0 to 1, where 1 is solid) and `seenTip` (`"round"`, `"square"` or `"flat"`), which Properties\' Match the wall it meets sets from the wall line the door touches; on any other piece they are dropped.'),
            'it ends by saying that all six keys are never sent, as none is': gZ > gA && guideN.slice(gZ, gZ + 90).indexOf('The six keys (`secret` and the five `seen` keys) are the GM\'s and are never sent.') === 0 && !/The three keys are the GM/.test(guideN) && secGot.every(g => has6(g.alone).length === 0 && has6(g.onClone).length === 0) && has6(gLine).length === 0
        }, v5No = Object.keys(v5Say).filter(k => !v5Say[k]);
        check('map builder B5, the integration guide on a secret door (the third review, and round two of Match a wall): the sentence a tool\'s author reads says that players are sent a wall with no door type, no doorOpen, no doorLock, no group, no picture fill and no way through of its own, and it lists that way through whole, the landing room targetRoomId among its six keys, each of which the real copy leaves without. It says the copy has no name, that no plain wall is sent with a name, a group, a locked mark or a key whose value is false or null, that each is sent typed wall with a hex color in lower case, and that a wall drawn as a path is sent with its strokeWidth as a number, an opacity only below 1 and a tip of the three: the real wire sends a secret door locked in place, on a box and on a line, with no locked key, and a wall line as a file may write one, locked, its width a text with its unit, its opacity 1 and no nib named, as 4.5 px, with no opacity, the round nib and no locked key. It does not say that the name reads Wall. It says that the look named may be the word transparent, for nothing drawn, as the real copy then leaves, with no bricks under it. It says that a door drawn as a line takes no pattern, and no longer that it takes the color alone. It names the three keys Match sets with their bounds and says that they are dropped on any other piece. And it ends by saying that all six keys are the GM\'s and are never sent, as none is on anything the real wire sent of those cases',
            v5No.length === 0, J([v5No, guideS.slice(0, 700)]));

        // ---- (2e) Match a wall (the owner, 2026-10-12, by prompt): a secret door drawn as a line, seen as the wall line it meets ----
        // Each wall line below is made one way, and beside it stands a door line made the SAME way (the copy keeps the door's other keys) and drawn
        // in a look of its own: another color, another width, another nib, and an opacity where the wall is solid, or none where the wall has
        // one. The door begins where the wall ends. It is ticked Secret, every other one is given the wall's color as Seen as gave it before
        // there was a Match, and then Match is pressed (matchAs, above). A row: what it is, the wall, what the wall is DRAWN with by the suite's
        // own reading (its width, its opacity, where 1 is solid, and its nib), and for Build's the door as Build makes one
        await breathe();
        const WGEO = { x: 200, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, pts: [[0, 0], [0, 50]] }, DGEO = { x: 200, y: 100, w: 10, h: 40, baseW: 10, baseH: 40, pts: [[0, 0], [0, 40]] };   // as the pen stores a stroke: its box 10 px at least, its points from the box's corner
        const LINEKEYS = ['strokeWidth', 'opacity', 'tip'];
        const penBy = (id, look, flags) => Object.assign({ id, type: 'path' }, copyOf(WGEO), { z: 10 }, look, flags || { blocksSight: true, sightType: 'wall' });   // the pen's own stroke (its color, its width, its nib, and an opacity only under 1), then made a wall in Properties
        const fileBy = (id, look) => Object.assign({ id, type: 'path' }, copyOf(WGEO), look);   // a wall line as a campaign file may write one: no order named, and whatever the tool wrote for the rest
        const buildDoor = () => { const d = stroke('door', OAK, BCn.wallLine([[200, 100], [200, 150]])); if (d) { d.strokeWidth = 12; d.opacity = 0.7; d.tip = 'round'; } return d; };   // Build's Door line, then widened, faded and given the round nib in Properties
        const MWALLS = [
            ['the pen by hand, round nib', penBy('mw0', { color: '#3a4a5a', strokeWidth: 5, tip: 'round' }), [5, 1, 'round']],
            ['the pen by hand, square nib', penBy('mw1', { color: '#3a4a5a', strokeWidth: 12, tip: 'square' }), [12, 1, 'square']],
            ['the pen by hand, flat nib', penBy('mw2', { color: '#3a4a5a', strokeWidth: 2, tip: 'flat' }), [2, 1, 'flat']],
            ['the pen by hand at an opacity under 1', penBy('mw3', { color: '#3a4a5a', strokeWidth: 5, tip: 'round', opacity: 0.55 }), [5, 0.55, 'round']],
            ['the pen by hand, square nib, at an opacity under 1, its color in upper case', penBy('mw4', { color: '#3A4A5A', strokeWidth: 9, tip: 'square', opacity: 0.25 }), [9, 0.25, 'square']],
            ['a see-through barrier drawn with the pen', penBy('mw5', { color: '#3a4a5a', strokeWidth: 5, tip: 'flat' }, { barrier: true, sightType: 'wall' }), [5, 1, 'flat']],
            ['Build\'s Wall line (the real penPreset, laid by the pen\'s own code)', stroke('wall', '#4a4753', BCn.wallLine([[200, 50], [200, 100]])), [6, 1, 'square'], buildDoor],
            ['a file: a width that is a text', fileBy('mw7', { color: '#3A4A5A', strokeWidth: '5', tip: 'round', blocksSight: true }), [5, 1, 'round']],
            ['a file: a width as a text with its unit', fileBy('mw8', { color: '#3A4A5A', strokeWidth: '4.5px', tip: 'square', blocksSight: true }), [4.5, 1, 'square']],
            ['a file: an opacity of 1 as a key', fileBy('mw9', { color: '#3a4a5a', strokeWidth: 5, opacity: 1, tip: 'square', blocksSight: true }), [5, 1, 'square']],
            ['a file: an opacity that is a text', fileBy('mw10', { color: '#3a4a5a', strokeWidth: 5, opacity: '0.55', tip: 'round', blocksSight: true }), [5, 0.55, 'round']],
            ['a file: an opacity that is the text 1', fileBy('mw11', { color: '#3a4a5a', strokeWidth: 5, opacity: '1', tip: 'flat', blocksSight: true }), [5, 1, 'flat']],
            ['a file: no nib named', fileBy('mw12', { color: '#3a4a5a', strokeWidth: 5, blocksSight: true }), [5, 1, 'round']],
            ['a file: no width', fileBy('mw13', { color: '#3a4a5a', tip: 'square', blocksSight: true }), [3, 1, 'square']],
            ['a file: a nib the app does not know', fileBy('mw14', { color: '#3a4a5a', strokeWidth: 5, tip: 'butt', blocksSight: true }), [5, 1, 'round']],
            ['a file: a width of 0 and an opacity under 0', fileBy('mw15', { color: '#3a4a5a', strokeWidth: 0, opacity: -0.5, tip: 'flat', blocksSight: true }), [3, 0, 'flat']],
            ['a file: a width and an opacity that are no numbers', fileBy('mw16', { color: '#3a4a5a', strokeWidth: 'wide', opacity: 'faint', blocksSight: true, sightType: 'wall' }), [3, 1, 'round']],
            ['a file: a see-through barrier with nothing but its flag, its color and its points', fileBy('mw17', { color: '#3A4A5A', barrier: true }), [3, 1, 'round']],
            ['a file: a width past any a wall has', fileBy('mw18', { color: '#3a4a5a', strokeWidth: '1e300', tip: 'round', blocksSight: true }), [1e15, 1, 'round']],
            // round two: a see-through wall drawn as a line, its color the very word transparent. The press answers that word, and the door is seen as nothing drawn
            ['a see-through barrier drawn with the pen in the clear color', penBy('mw19', { color: 'transparent', strokeWidth: 5, tip: 'round' }, { barrier: true, sightType: 'wall' }), [5, 1, 'round']],
            ['a wall that blocks sight and draws nothing, at an opacity under 1, flat nib', penBy('mw20', { color: 'transparent', strokeWidth: 7, tip: 'flat', opacity: 0.4 }), [7, 0.4, 'flat']],
            ['a file: a see-through barrier in the clear color with a width that is a text and no nib', fileBy('mw21', { color: 'transparent', strokeWidth: '6', barrier: true }), [6, 1, 'round']]
        ];
        const doorOf = (wall, drawn, id) => { const d = Object.assign(less(wall, ['strokeWidth', 'opacity', 'tip', 'sightType']), copyOf(DGEO), { id, color: OAK, strokeWidth: drawn[0] === 9 ? 4 : 9, tip: drawn[2] === 'round' ? 'square' : 'round', sightType: 'door' }); if (drawn[1] === 1) d.opacity = 0.8; return d; };
        const mGot = MWALLS.map((row, i) => { const wall = row[1], drawn = row[2], door = tick(row[3] ? row[3]() : (wall ? doorOf(wall, drawn, 'md' + i) : null), i % 2 && wall ? wall.color : undefined); if (!wall || !door) return { label: row[0], ok: false, why: ['a piece was not made'] };
            const own = J(less(door, KEYS6)), wallWas = J(wall), b0 = wwiS(door, false), hit = matchAs(door, [wall, door]), doorWas = J(door), low = String(wall.color).toLowerCase();
            const a = wwiS(wall, false), b = wwiS(door, false), a2 = wwiS(copyOf(wall), true), b2 = wwiS(copyOf(door), true), onMap = siS({ id: 'mM', type: 'map', meta: { title: 'Match' }, rooms: [], links: [], whiteboard: [copyOf(wall), copyOf(door)] }).whiteboard;
            const say = {
                'the wall is met and read as it is drawn': !!hit && hit.width === drawn[0] && hit.opacity === drawn[1] && hit.tip === drawn[2] && hit.color === low,
                'the keys are set as the cleaners keep them': door.seenWidth === drawn[0] && door.seenOpacity === drawn[1] && door.seenTip === drawn[2] && door.seenColor === low,
                'the door itself is as it was drawn': J(less(door, KEYS6)) === own && door.color === OAK && door.sightType === 'door' && door.secret === true,
                'the door is drawn otherwise than the wall': drawnW(door.strokeWidth) !== drawn[0] && drawnT(door.tip) !== drawn[2] && drawnO(door.opacity) !== drawn[1],
                'before the press the copy was no twin': !!a && !!b0 && noGeo(a) !== noGeo(b0) && b0.sightType === 'wall',
                'the same text but for id and geometry, alone': !!a && !!b && noGeo(a) === noGeo(b) && a.id !== b.id && a.y !== b.y,
                'on a clone': !!a && !!b && !!a2 && !!b2 && noGeo(a2) === noGeo(b2) && J(a2) === J(a) && J(b2) === J(b),
                'on a whole map': onMap.length === 2 && J(onMap[0]) === J(a) && J(onMap[1]) === J(b),
                'the wall leaves as it is drawn': !!a && typeof a.strokeWidth === 'number' && a.strokeWidth === drawn[0] && (drawn[1] < 1 ? a.opacity === drawn[1] : !ownK(a, 'opacity')) && a.tip === drawn[2] && a.sightType === 'wall' && a.color === low,
                'nothing of the door\'s own look leaves': !!b && !/6b4a2a/i.test(J([b, b2, onMap])) && has6(b).length === 0 && has6(b2).length === 0 && !SIXWORDS.test(J([a, b, a2, b2, onMap])) && !/"door"|"name"/.test(J([a, b, a2, b2, onMap])),
                'no send changed the host\'s pieces': J(wall) === wallWas && J(door) === doorWas
            }, why = Object.keys(say).filter(k => !say[k]);
            return { label: row[0], ok: why.length === 0, why, a, b }; });
        const mBad = mGot.filter(g => !g.ok).map(g => [g.label, g.why, g.a, g.b]);
        // What a Match press cannot follow: a wall line in a color that is no hex color of six digits, such as the pen's own default, a theme's
        // color. The width, the opacity and the nib are matched, and the color named so far stands (inspector.js says so in words of its own)
        const inkWall = penBy('mwInk', { color: 'var(--ink)', strokeWidth: 5, tip: 'round', opacity: 0.55 }), inkDoor = tick(doorOf(inkWall, [5, 0.55, 'round'], 'mdInk')), inkHit = matchAs(inkDoor, [inkWall, inkDoor]);
        const inkA = wwiS(inkWall, false), inkB = wwiS(inkDoor, false), inkDiff = inkA && inkB ? diffOf(less(inkA, GEOK), less(inkB, GEOK)) : 'nothing left';
        // ... and a see-through barrier drawn as a line in the clear color, met by a see-through door drawn the same way. Round two: the press
        // answers the word transparent and names it on the door, so with the width and the nib matched the two are twins, and they stay twins
        // when the door's own color is changed afterwards (before round two the press answered no color, and the door was clear by its own)
        const clearWall = penBy('mwC', { color: 'transparent', strokeWidth: 5, tip: 'round' }, { barrier: true, sightType: 'wall' }), clearDoor = tick(Object.assign(doorOf(clearWall, [5, 1, 'round'], 'mdC'), { color: 'transparent' })), clearHit = matchAs(clearDoor, [clearWall, clearDoor]);
        const clearA = wwiS(clearWall, false), clearB = wwiS(clearDoor, false), clearLater = wwiS(Object.assign(copyOf(clearDoor), { color: OAK }), false) || {};
        const clearOk = !!clearHit && clearHit.color === 'transparent' && clearDoor.seenColor === 'transparent' && clearDoor.color === 'transparent' && clearDoor.seenWidth === 5 && clearDoor.seenOpacity === 1 && clearDoor.seenTip === 'round' && clearDoor.strokeWidth === 9 && !!clearA && !!clearB && noGeo(clearA) === noGeo(clearB) && clearB.color === 'transparent' && clearB.strokeWidth === 5 && clearB.barrier === true
            && noGeo(clearLater) === noGeo(clearA) && clearLater.color === 'transparent' && !/6b4a2a/i.test(J(clearLater));
        // The pair fold B5 held as a limit (the fifth of the walls that have no twin): a Door line 9 px wide at opacity 0.8, seen in the color of a
        // Wall line 5 px wide at opacity 0.55. With Match pressed the two differ by their id alone
        const oldWall = copyOf(noTwin[4][1]), oldDoor = copyOf(noTwin[4][2]), oldHit = matchAs(oldDoor, [oldWall, oldDoor]), oldDiff = diffOf(wwiS(oldWall, false), wwiS(oldDoor, false));
        // A door line that holds no width, no opacity and no nib of its own, as a file may write one, matched to a wall the pen drew 7 px wide at
        // opacity 0.4 with the square nib: the copy takes all three as keys the door never had
        const bareWall = penBy('mwB', { color: '#3a4a5a', strokeWidth: 7, tip: 'square', opacity: 0.4 }), bareDoor = tick(Object.assign({ id: 'mdB', type: 'path' }, copyOf(DGEO), { z: 10, color: OAK, blocksSight: true, sightType: 'door' })), bareHit = matchAs(bareDoor, [bareWall, bareDoor]);
        const bareA = wwiS(bareWall, false), bareB = wwiS(bareDoor, false), bareB2 = wwiS(copyOf(bareDoor), true);
        const bareOk = !!bareHit && LINEKEYS.every(k => !ownK(bareDoor, k)) && !!bareA && !!bareB && !!bareB2 && noGeo(bareA) === noGeo(bareB) && J(bareB) === J(bareB2) && bareB.strokeWidth === 7 && bareB.opacity === 0.4 && bareB.tip === 'square' && bareB.color === '#3a4a5a';
        // A door drawn by hand ends a few pixels off its wall. Round two: the reach is 12 px between the two lines AS DRAWN, so half of each
        // line's drawn width is added. A door 9 px wide and a wall 5 px wide meet up to 12 + 4.5 + 2.5 = 19 px apart, point to point: a door that
        // begins 19 px past the wall's end still meets it, and one that begins 20 px past it meets no wall: the press finds nothing, names
        // nothing, and the copy leaves at the door's own width, opacity and nib
        const gapWall = penBy('mwG', { color: '#3a4a5a', strokeWidth: 5, tip: 'round', opacity: 0.55 }), gapDoor = px => Object.assign(tick(doorOf(gapWall, [5, 0.55, 'round'], 'mdG' + px)), { y: 100 + px });
        const nearDoor = gapDoor(19), nearHit = matchAs(nearDoor, [gapWall, nearDoor]), farDoor = gapDoor(20), farWas = J(farDoor), farHit = matchAs(farDoor, [gapWall, farDoor]), gapA = wwiS(gapWall, false), nearB = wwiS(nearDoor, false), farB = wwiS(farDoor, false) || {};
        const gapOk = !!nearHit && !!gapA && !!nearB && noGeo(gapA) === noGeo(nearB) && nearB.y === 119 && nearDoor.strokeWidth === 9 && gapWall.strokeWidth === 5 && farHit === null && J(farDoor) === farWas && has6(farDoor).join() === 'secret' && noGeo(gapA) !== noGeo(farB) && J([farB.strokeWidth, ownK(farB, 'opacity'), farB.tip, farB.color]) === J([9, false, 'square', WALLC]);
        // ... and half a line's width counts only up to a cap (fogcore MATCH.cap). Round three raised it from 50 px to 100. A wall 150 px wide
        // reaches 75 px past its points, so the same door meets it up to 12 + 4.5 + 75 = 91.5 px off. A wall 200 px wide reaches 100 px: 116.5.
        // A wall 300 px wide reaches no farther than that: 116 px off it is matched, to a width of 300, and 117 px off it is not. And the door's
        // own half is held to the cap too: a door 300 px wide meets a wall 5 px wide up to 12 + 100 + 2.5 = 114.5 px off
        const fatAt = (wide, px, doorWide) => { const wall = penBy('mwFat', { color: '#3a4a5a', strokeWidth: wide, tip: 'round' }), door = Object.assign(tick(doorOf(wall, [wide, 1, 'round'], 'mdFat' + px)), { y: 100 + px }); if (doorWide) door.strokeWidth = doorWide;
            const hit = matchAs(door, [wall, door]), a = wwiS(wall, false), b = wwiS(door, false) || {};
            return hit ? (!!a && noGeo(a) === noGeo(b) && b.y === 100 + px && door.strokeWidth === (doorWide || 9) && hit.width === wide ? b.strokeWidth : ['met, and no twin', hit, a, b]) : (has6(door).join() === 'secret' ? null : ['not met, yet a key was set', door]); };
        const fatGot = [fatAt(150, 91), fatAt(150, 92), fatAt(200, 116), fatAt(200, 117), fatAt(300, 116), fatAt(300, 117), fatAt(5, 114, 300), fatAt(5, 115, 300)], fatOk = J(fatGot) === J([150, null, 200, null, 300, null, 5, null]);
        check('Match a wall, a matched secret door and the wall line it meets (wireWbItem and sanitizeItem, run for real with the real fogcore; the press made as inspector.js makes it, with the real secretMatch, the three cleaners and cleanSeenColor). A door drawn as a line in a look of its own, another color, another width, another nib and another opacity, begins where a wall line ends. Ticked Secret it leaves as a wall that is no twin of that wall line. Once Match is pressed it leaves as the very text the wall line leaves as, but for its id and its geometry, sent alone, on a clone and on a whole map, and the door on the host is still the door as it was drawn. Held over every way a wall line is made, twenty-two of them: the pen by hand with the round, the square and the flat nib; the pen at an opacity under 1; a color written in upper case; a see-through barrier drawn with the pen; Build\'s Wall line through the real penPreset, beside Build\'s own Door line widened and faded in Properties; and a wall as a campaign file may write one: a width that is a text, a width as a text with its unit, an opacity of 1 as a key, an opacity that is a text, an opacity that is the text 1, no nib named, no width, a nib the app does not know, a width of 0 with an opacity under 0, a width and an opacity that are no numbers, a see-through barrier with nothing but its flag, its color and its points, and a width past any a wall has; and, round two, three see-through wall lines whose color is the very word transparent: a see-through barrier drawn with the pen, a wall that blocks sight and draws nothing at an opacity under 1, and a file\'s see-through barrier with a width that is a text and no nib. For those the press answers that word, and the door\'s copy leaves as nothing drawn, the wall\'s twin. Each wall leaves as it is drawn: its width as a number, 3 where it holds none, an opacity only where it is under 1, and a nib of the three. Nothing sent holds the door\'s own color, a door type, a name or any of the six keys, and no send changes a piece of the host\'s. What a press cannot follow: a wall line in the pen\'s default color, a theme\'s color, is matched in width, opacity and nib and differs from the copy by the color alone, since a secret door is seen in a hex color of six digits or in the word transparent, and in no other. A see-through barrier drawn as a line in the clear color, met by a see-through door drawn the same way: the press answers the word transparent and names it on the door, so matched in width and nib the door is that barrier\'s twin, and stays its twin when the door\'s own color is changed afterwards. A door line that holds no width, no opacity and no nib of its own, as a file may write one, takes all three from the wall it is matched to and leaves as that wall\'s twin too. The reach is 12 px between the two lines as they are drawn, so half of each line\'s width is added: a door 9 px wide that begins 19 px past the end of a wall 5 px wide, as one drawn by hand may, is still matched and leaves as the twin, while one that begins 20 px past it meets no wall: the press names nothing on it and its copy leaves at the door\'s own width and nib, in the Wall material\'s color. Half a width counts up to 100 px a line, since round three: a wall 150 px wide is met 91 px off and not 92, a wall 200 px wide 116 px off and not 117, and a wall 300 px wide no farther, 116 px off and not 117; a door 300 px wide meets a wall 5 px wide 114 px off and not 115. Each copy leaves at its wall\'s own width. And the pair fold B5 held as a limit, a Door line 9 px wide at opacity 0.8 seen in the color of a Wall line 5 px wide at opacity 0.55, which differ by width and opacity until the press, differ by nothing but the id after it',
            mBad.length === 0 && MWALLS.length === 22 && mGot.length === 22 && MWALLS.filter(r => r[1] && r[1].color === 'transparent').length === 3 && fatOk && penArmed && !!inkHit && inkHit.color === null && !ownK(inkDoor, 'seenColor') && inkDoor.seenWidth === 5 && inkDoor.seenOpacity === 0.55 && inkDoor.seenTip === 'round' && J(inkDiff) === J([['color', 'var(--ink)', WALLC]])
            && !!oldHit && J(oldDiff) === '[]' && J(noTwinGot[4][4]) === J([['opacity', 0.55, 0.8], ['strokeWidth', 5, 9]]) && bareOk && gapOk && clearOk,
            J([mBad.slice(0, 2), inkDiff, oldDiff, noTwinGot[4][4], bareOk ? 'the door with no look of its own is the wall\'s twin' : [bareHit, bareA, bareB], gapOk ? 'the doors 19 and 20 px off are as the title says' : [nearHit, nearB, farHit, farB], clearOk ? 'the clear pair is as the title says' : [clearHit, clearA, clearB, clearLater], fatOk ? 'half a width counts up to 100 px a line, as the title says' : fatGot]));
        // The bounds of the three, as the wire shows them. A secret door drawn as a line 9 px wide at opacity 0.8 with the flat nib, given one seen
        // key at a time: [its width, its opacity or the word solid, its nib] as it leaves, alone and on a clone alike
        const BD = more => Object.assign({ id: 'bd', type: 'path' }, copyOf(DGEO), { z: 10, color: OAK, strokeWidth: 9, opacity: 0.8, tip: 'flat', blocksSight: true, sightType: 'door', secret: true }, more);
        const bdOf = more => { const o = wwiS(BD(more), false) || {}, o2 = wwiS(copyOf(BD(more)), true) || {}; return J(o) === J(o2) && has6(o).length === 0 ? [o.strokeWidth, ownK(o, 'opacity') ? o.opacity : 'solid', o.tip] : ['alone and on a clone it left as two things, or with a key']; };
        const bdGot = {
            none: bdOf({}),
            width: [5, 0.5, 2.25, 1e15, 0, -3, '6', null, true, [4], {}].map(v => bdOf({ seenWidth: v })[0]),
            opacity: [0.55, 0, 1, 0.999, 1.01, -0.1, '0.5', null, true, [0.5]].map(v => bdOf({ seenOpacity: v })[1]),
            tip: ['round', 'square', 'flat', 'Round', 'fill', '', 5, null, ['round']].map(v => bdOf({ seenTip: v })[2]),
            one: [bdOf({ seenWidth: 5 }), bdOf({ seenOpacity: 1 }), bdOf({ seenOpacity: 0.3 }), bdOf({ seenTip: 'round' })],   // each alone leaves the other two as the door's own
            all: bdOf({ seenWidth: 5, seenOpacity: 0.3, seenTip: 'round' }),
            region: bdOf({ tip: 'fill', pts: TRI, seenWidth: 5, seenOpacity: 0.3, seenTip: 'round' }),   // a filled region is no line: its own, as stored
            text: bdOf({ strokeWidth: '9', opacity: '0.8', tip: 'Flat' }),   // the door's own as a file may write them, with nothing named: the copy is a plain wall, so it leaves as it is drawn
            big: [(wwiS(BD({ seenWidth: 1e300 }), false) || {}).strokeWidth, ((siS({ id: 'mBD', type: 'map', meta: { title: 'Big' }, rooms: [], links: [], whiteboard: [BD({ seenWidth: 1e300 })] }).whiteboard || [])[0] || {}).strokeWidth]   // the wire bounds every number at 1e15 before any rule reads it
        };
        check('Match a wall, the bounds of the three as the wire shows them (wireWbItem and sanitizeItem, run for real with the real fogcore): a secret door drawn as a line 9 px wide at opacity 0.8 with the flat nib. With nothing named it leaves at its own. A seen width counts where it is a number above 0, up to 1e15: 5, 0.5, 2.25 and 1e15 are the copy\'s width, while 0, a negative, a text, null, a truth value, a list and an object count for nothing and the copy keeps the door\'s 9. A seen opacity counts where it is a number from 0 to 1: 0.55, 0 and 0.999 are the copy\'s opacity and 1 leaves it solid, with no opacity key, while 1.01, a negative, a text, null, a truth value and a list count for nothing and the copy keeps the door\'s 0.8. A seen nib counts where it is round, square or flat, while another case, the word fill, an empty text, a number, null and a list count for nothing and the copy keeps the door\'s flat nib. Each of the three alone leaves the other two as the door\'s own, and all three together are the copy\'s look. On a filled region that is a secret door the three count for nothing and its own leave as stored. A door whose own width and opacity are texts and whose nib is in another case, with nothing named, leaves as it is drawn: 9 px, opacity 0.8, round nib, since its copy is a plain wall. And a seen width past 1e15 reaches no rule as it is: the wire bounds every number first, so it leaves as 1e15, sent alone and on a whole map',
            J(bdGot) === J({ none: [9, 0.8, 'flat'], width: [5, 0.5, 2.25, 1e15, 9, 9, 9, 9, 9, 9, 9], opacity: [0.55, 0, 'solid', 0.999, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], tip: ['round', 'square', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat'],
                one: [[5, 0.8, 'flat'], [9, 'solid', 'flat'], [9, 0.3, 'flat'], [9, 0.8, 'round']], all: [5, 0.3, 'round'], region: [9, 0.8, 'fill'], text: [9, 0.8, 'round'], big: [1e15, 1e15] }),
            J(bdGot));

        // None of the six keys is in anything sent. Pieces of every kind, each carrying all six, each key as a value its cleaner keeps and one told
        // from every other value on the piece. Then each key ALONE on a piece, as that value and as 0, an empty text, null and false
        await breathe();
        const SIXV = { secret: true, seenColor: '#1A2B3C', seenTexture: 'thatch', seenWidth: 7.125, seenOpacity: 0.4375, seenTip: 'flat' }, SIXVAL = /7\.125|0\.4375|1a2b3c|thatch|"flat"/i;
        const KB = { x: 100, y: 50, w: 50, h: 50, color: '#445566' }, KP = { type: 'path', x: 200, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, pts: [[0, 0], [0, 50]], color: '#445566', strokeWidth: 4, tip: 'round' };
        const KINDS = [
            ['a floor piece', Object.assign({ type: 'rect' }, KB)], ['a wall', Object.assign({ type: 'rect', blocksSight: true, sightType: 'wall' }, KB)], ['a door', Object.assign({ type: 'rect', blocksSight: true, sightType: 'door' }, KB)], ['an open door', Object.assign({ type: 'rect', blocksSight: true, sightType: 'door', doorOpen: true }, KB)],
            ['a see-through barrier', Object.assign({ type: 'rect', barrier: true }, KB)], ['a see-through barrier\'s door', Object.assign({ type: 'rect', barrier: true, sightType: 'door' }, KB)],
            ['a hexagon that is a wall', Object.assign({ type: 'hexagon', blocksSight: true, sightType: 'wall' }, KB)], ['a circle', Object.assign({ type: 'circle' }, KB)], ['a diamond that is a door', Object.assign({ type: 'diamond', blocksSight: true, sightType: 'door' }, KB)],
            ['a drawing', Object.assign({}, KP)], ['a player\'s drawing', Object.assign({ ownerId: 'u_a', byPlayer: true }, KP)], ['a wall line', Object.assign({ blocksSight: true, sightType: 'wall' }, KP)], ['a door line', Object.assign({ blocksSight: true, sightType: 'door' }, KP)], ['a see-through barrier\'s door line', Object.assign({ barrier: true, sightType: 'door' }, KP)],
            ['a wall line that leads to another map', Object.assign({ blocksSight: true, sightType: 'wall', targetMapId: 'mB' }, KP)], ['a filled region', Object.assign({}, KP, { tip: 'fill', pts: TRI })], ['a filled region that is a door', Object.assign({ blocksSight: true, sightType: 'door' }, KP, { tip: 'fill', pts: TRI })],
            ['a picture', Object.assign({ type: 'image', src: '/saves/images/k/gate.png' }, KB)], ['a picture that is a door', Object.assign({ type: 'image', src: '/saves/images/k/gate.png', blocksSight: true, sightType: 'door' }, KB)], ['a text box', Object.assign({ type: 'text', text: 'Beware' }, KB)],
            ['a token', Object.assign({ type: 'image', isChar: true, charName: 'Mimic' }, KB)], ['a token drawn as a line that blocks sight', Object.assign({ isChar: true, charName: 'Wisp', blocksSight: true, sightType: 'door' }, KP)], ['a waiting token', Object.assign({ type: 'circle', waiting: 1, ownerId: 'u_a' }, KB)], ['a portal', Object.assign({ type: 'rect', targetMapId: 'mB' }, KB)]
        ];
        const secretBy = p => p.secret === true && (p.blocksSight === true || p.barrier === true) && p.sightType === 'door' && ['rect', 'hexagon', 'circle', 'diamond', 'path'].indexOf(p.type) >= 0 && !p.isChar && !p.waiting;   // the suite's own reading of which piece is a secret door
        const sixAll = KINDS.map((k, i) => Object.assign({ id: 'k6_' + i }, copyOf(k[1]), SIXV)), sixAlone = [];
        [0, 9, 11, 12, 20].forEach(at => Object.keys(SIXV).forEach((key, m) => [SIXV[key], 0, '', null, false].forEach((v, e) => { const p = Object.assign({ id: 'k1_' + at + '_' + m + '_' + e }, copyOf(KINDS[at][1])); p[key] = v; sixAlone.push(p); })));   // on a floor piece, a drawing, a wall line, a door line and a token
        const WIRES6 = [['the real fogcore', wwiS], ['no fogcore', wwiN], ['an empty fogcore', wwiO], ['the pattern\'s and the picture\'s cleaners alone', wwiH]], six = { bad: [], sent: 0, secret: 0, lines: 0, bare: 0, bareLines: 0 };
        for (const wr of WIRES6) { const core = wr[1] === wwiS; await breathe();
            sixAll.concat(sixAlone).forEach(p => { const was = J(p), outs = [wr[1](p, false), wr[1](copyOf(p), true)], sec = secretBy(p), line = isLineP(p), all = p.id.indexOf('k6_') === 0, text = J(outs), o = outs[0];
                const no = why => { six.bad.push([wr[0], p.id, why, o]); };
                if (J(p) !== was) no('the host\'s piece changed');
                if (!outs[0] || !outs[1]) { no('nothing left'); return; }
                six.sent++;
                if (has6(outs[0]).length || has6(outs[1]).length || SIXWORDS.test(text)) no('a key left');
                if (flat(outs[0]) !== flat(outs[1])) no('alone and on a clone it left as two things');
                if (!sec) { if (flat(o) !== flat(wr[1](less(p, KEYS6), false))) no('it left otherwise than the same piece without the keys does'); if (all && SIXVAL.test(text)) no('a value named for it left'); return; }
                six.secret++;
                if (o.sightType !== 'wall' || ownK(o, 'doorOpen')) no('a secret door left as a door');
                if (!all) return;
                if (!core && line) { six.bareLines++; if (o.strokeWidth !== 7.125 || o.opacity !== 0.4375 || o.tip !== 'flat' || o.color !== '#1a2b3c' || ownK(o, 'texture') || /thatch/.test(text) || flat(o) !== flat(wwiS(p, false))) no('with no core at hand a secret door drawn as a line left otherwise than as it was matched, or otherwise than with the core'); }   // round two: a matched line is sent alike with no core
                else if (!core) { six.bare++; if (SIXVAL.test(text) || o.color !== WALLC || J(LINEKEYS.map(k => o[k])) !== J(LINEKEYS.map(k => p[k]))) no('with no core at hand something named for a secret door that is no line left, or its own width, opacity and nib did not'); }
                else if (line) { six.lines++; if (o.strokeWidth !== 7.125 || o.opacity !== 0.4375 || o.tip !== 'flat' || o.color !== '#1a2b3c' || ownK(o, 'texture')) no('a secret door drawn as a line left otherwise than as it was matched'); }
                else if (o.color !== '#1a2b3c' || o.texture !== 'thatch' || /7\.125|0\.4375|"flat"/.test(text) || J(LINEKEYS.map(k => o[k])) !== J(LINEKEYS.map(k => p[k]))) no('a secret door that is no line took a width, an opacity or a nib named for it');
            }); }
        await breathe();
        const sixHost = { id: 'm6', type: 'map', meta: { title: 'Six' }, rooms: [], links: [], whiteboard: sixAll.concat(sixAlone).map(copyOf) }, sixWas = J(sixHost), sixMaps = [siS(sixHost), siN(sixHost)];
        const sixLine = i => secretBy(sixAll[i]) && isLineP(sixAll[i]);   // round two: with no core a secret door drawn as a line is the one piece that leaves with values named for it, and on a whole map it is the very piece the core sends
        const sixMapOk = sixMaps.every(m => m.whiteboard.length === sixHost.whiteboard.length && !SIXWORDS.test(J(m)) && m.whiteboard.every(w => has6(w).length === 0)) && J(sixHost) === sixWas && !SIXVAL.test(J(sixMaps[1].whiteboard.slice(0, sixAll.length).filter((w, i) => !sixLine(i))))
            && sixAll.filter((p, i) => sixLine(i)).length === 2 && sixAll.every((p, i) => !sixLine(i) || (flat(sixMaps[1].whiteboard[i]) === flat(sixMaps[0].whiteboard[i]) && sixMaps[1].whiteboard[i].strokeWidth === 7.125 && sixMaps[1].whiteboard[i].color === '#1a2b3c'));
        check('Match a wall, none of the six keys in anything sent (wireWbItem and sanitizeItem, run for real with the real fogcore, with no fogcore on the window, with an empty one, and with only the pattern\'s and the picture\'s cleaners at hand): the tick, the color and the pattern named for a secret door, and the width, the opacity and the nib a Match press sets, leave on no piece of any kind, sent alone, on a clone or on a whole map. Held of twenty-four kinds of piece that each carry all six: a floor piece, a wall, a door, an open door, a see-through barrier and its door, a hexagon, a circle and a diamond, a drawing, a player\'s drawing, a wall line, a door line, a see-through barrier\'s door line, a wall line that leads to another map, a filled region, a filled region that is a door, a picture, a picture that is a door, a text box, a token, a token drawn as a line that blocks sight, a waiting token and a portal. And of each key alone on a floor piece, a drawing, a wall line, a door line and a token, as a value its cleaner keeps and as 0, an empty text, null and false. A piece that is no secret door leaves exactly as the same piece without the keys does, and nothing sent of it holds a value that was named. With the real fogcore a secret door drawn as a line leaves at the width, the opacity and the nib named for it, in the color named and with no pattern, while a secret door that is a box or a filled region leaves in the color and the pattern named and with its own width, opacity and nib as stored. With no fogcore at hand a secret door is still sent as a wall. One that is a box or a filled region leaves in the Wall material\'s color, and nothing named for it is read or sent. Round two: one drawn as a line leaves in the look Match set for it, the color, the width, the opacity and the nib named and never the pattern, exactly as it leaves with the core, sent alone, on a clone and on a whole map. The host\'s own pieces are never changed',
            six.bad.length === 0 && sixAll.length === 24 && sixAlone.length === 150 && six.sent === 4 * 174 && six.secret === 4 * 8 && six.lines === 2 && six.bare === 3 * 5 && six.bareLines === 3 * 2 && sixAll.filter(secretBy).length === 7 && sixAll.filter(p => secretBy(p) && isLineP(p)).length === 2 && sixAlone.filter(secretBy).length === 1 && sixMapOk,
            J([six.bad.slice(0, 3), [six.sent, six.secret, six.lines, six.bare, six.bareLines], sixMapOk]));

        // The reading of a wall line's width, opacity and nib is written out in net.js, so that a wall is sent alike with no core at hand. It is held
        // here to fogcore's lineWidth, lineOpacity and lineTip, which a matched copy is made from, and both to the suite's own (drawnW, drawnO,
        // drawnT), over 4,000 seeded wall lines: numbers of every size and sign, texts that begin with a number and texts that do not, and what is
        // no number and no text at all
        {
            let seedL = 20261013; const rndL = n => { seedL = (Math.imul(seedL, 1103515245) + 12345) >>> 0; return Math.floor((seedL >>> 8) / 16777216 * n); }, pickL = list => list[rndL(list.length)];
            const numL = () => { const k = rndL(10); return k === 0 ? rndL(40) : k === 1 ? rndL(4000) / 100 : k === 2 ? -rndL(900) / 10 : k === 3 ? rndL(1000) / 1000 : k === 4 ? 1 + rndL(100) / 1000 : k === 5 ? Math.pow(10, rndL(40) - 20) : k === 6 ? -Math.pow(10, rndL(30) - 10) : pickL([0, 1, 3, 1e15, 1e15 + 2, 1e16, 1e300, -1e300, 5e-324, 0.9999999999999999, 1.0000000000000002, -0.000001, NaN, Infinity, -Infinity]); };
            const textL = n => pickL([String(n), ' ' + n, n + 'px', n + ' ', '+' + n, n + 'e2', n + ',5', n + '%', 'x' + n, '$' + n]);
            const ODDL = [null, true, false, '', ' ', 'wide', 'NaN', 'Infinity', '-Infinity', '1e400', '-1e400', '0x10', '.5', '5.', '-.5', '1e-7', '1e15', '1e16', '0', '1', '1.0', '00.5', [5], ['5'], [], { n: 5 }, {}];
            const valL = () => { const k = rndL(8); return k === 0 ? undefined : k <= 3 ? numL() : k <= 5 ? textL(numL()) : pickL(ODDL); };
            const TIPL = ['round', 'square', 'flat', 'round', 'square', 'flat', undefined, null, '', 'Round', 'FLAT', ' square', 'butt', 'fills', 5, true, ['square'], { tip: 'flat' }];
            const lineBad = [], LT = { n: 0, wNum: 0, wText: 0, wThree: 0, wCap: 0, oKept: 0, oZero: 0, oSolid: 0, oText: 0, round: 0, square: 0, flat: 0, tOdd: 0 };
            for (let i = 0; i < 4000; i++) {
                const p = Object.assign({ id: 'L' + i, type: 'path', x: 0, y: 0, w: 10, h: 50, pts: [[0, 0], [0, 50]] }, pickL([{ blocksSight: true }, { blocksSight: true, sightType: 'wall' }, { blocksSight: 1 }, { barrier: true }])), sw = valL(), op = valL(), tp = pickL(TIPL);
                if (sw !== undefined) p.strokeWidth = sw; if (op !== undefined) p.opacity = op; if (tp !== undefined) p.tip = tp;
                const fw = FC.lineWidth(p), fo = FC.lineOpacity(p), ft = FC.lineTip(p); LT.n++;
                [wwiS, wwiN].forEach((wire, n) => [wire(p, false), wire(copyOf(p), true)].forEach(o => { if (!o || typeof o.strokeWidth !== 'number' || o.strokeWidth !== fw || (ownK(o, 'opacity') ? !(typeof o.opacity === 'number' && o.opacity < 1 && o.opacity === fo) : fo !== 1) || o.tip !== ft) lineBad.push([i, n ? 'no fogcore' : 'the real fogcore', p, o, [fw, fo, ft]]); }));
                if (drawnW(p.strokeWidth) !== fw || drawnO(p.opacity) !== fo || drawnT(p.tip) !== ft) lineBad.push([i, 'the suite\'s own reading', p, [drawnW(p.strokeWidth), drawnO(p.opacity), drawnT(p.tip)], [fw, fo, ft]]);
                if (typeof sw === 'number' && fw === sw) LT.wNum++; if (typeof sw === 'string' && fw !== 3) LT.wText++; if (fw === 3 && sw !== 3 && sw !== undefined) LT.wThree++; if (fw === 1e15) LT.wCap++;
                if (fo > 0 && fo < 1) LT.oKept++; if (fo === 0) LT.oZero++; if (fo === 1 && op !== undefined) LT.oSolid++; if (typeof op === 'string' && fo < 1) LT.oText++; LT[ft]++; if (ft === 'round' && tp !== undefined && tp !== 'round') LT.tOdd++;
                if (i % 200 === 199) await breathe();
            }
            check('Match a wall, the reading written out in net.js and fogcore\'s own (wireWbItem, run for real on 4,000 seeded wall lines, with the real fogcore and with none, alone and on a clone): a plain wall drawn as a line leaves at exactly the width fogcore\'s lineWidth gives, as a number, at exactly the opacity lineOpacity gives, with no opacity key where that is 1, and with exactly the nib lineTip gives. So the wall a player holds and the copy of a secret door matched to it are made from one reading, with a core at hand or not. The suite\'s own reading gives the same three for every one of them. The seeded values are numbers of every size and sign, among them 0, 1, a number just under and just over 1, 1e15, a number past it, the smallest number there is and what is no number; texts that begin with a number, with a space, a sign, a unit, an exponent or a comma after it, and texts that do not; and null, a truth value, a list, an object and no key at all. The nibs are the three, each of them in another case or with a space, a word the app does not know, a number, a list, an object and none',
                lineBad.length === 0 && LT.n === 4000 && LT.wNum >= 800 && LT.wText >= 650 && LT.wThree >= 1400 && LT.wCap >= 200 && LT.oKept >= 450 && LT.oZero >= 550 && LT.oSolid >= 1900 && LT.oText >= 450 && LT.round >= 2600 && LT.square >= 380 && LT.flat >= 380 && LT.tOdd >= 2000 && LT.round + LT.square + LT.flat === 4000,
                J([lineBad.slice(0, 2), LT]));
        }

        // What the rule for a plain wall drawn as a line does NOT touch. Each piece below is a line the rule would rewrite were it a plain wall, and
        // is spared by one part of the rule; then four that are plain walls and no lines. Each under four looks a wall line would lose
        await breathe();
        const ODDS = [{ strokeWidth: '8', opacity: 1, tip: 'butt' }, { strokeWidth: 0, opacity: '0.4' }, { opacity: 2, tip: 'Round' }, { strokeWidth: '4.5px', opacity: -1, tip: 'flat' }], SPB = { type: 'path', x: 200, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, pts: [[0, 0], [0, 50]], color: '#445566' };
        const SPARED = [
            ['a door drawn as a line', { blocksSight: true, sightType: 'door' }, 'door'], ['an open door drawn as a line', { blocksSight: true, sightType: 'door', doorOpen: true }, 'door'], ['a see-through barrier\'s door drawn as a line', { barrier: true, sightType: 'door' }, 'door'],
            ['a found door that still holds the look once matched for it', { blocksSight: true, sightType: 'door', seenColor: '#112233', seenWidth: 5, seenOpacity: 0.5, seenTip: 'square' }, 'door'],
            ['a wall line that leads to another map', { blocksSight: true, sightType: 'wall', targetMapId: 'mB' }, 'portal'], ['a wall line on a room\'s node', { blocksSight: true, nodeId: 'r1' }, 'node'],
            ['a token drawn as a line that blocks sight', { blocksSight: true, isChar: true, charName: 'Wisp' }, 'token'], ['a waiting token drawn as a line', { blocksSight: true, waiting: 1, ownerId: 'u_a' }, 'waiting'],
            ['a line that blocks nothing', {}, 'free'], ['a line whose Blocks sight is unticked', { blocksSight: false, sightType: 'wall' }, 'free'], ['a line whose barrier flag is not the word true', { barrier: 1 }, 'free'], ['a player\'s drawing', { ownerId: 'u_a', byPlayer: true }, 'free'],
            ['a filled region that is a wall', { blocksSight: true, sightType: 'wall', tip: 'fill', pts: TRI }, ''], ['a filled region that is a see-through barrier', { barrier: true, tip: 'fill', pts: TRI }, ''],
            ['a box that is a wall', { type: 'rect', blocksSight: true, sightType: 'wall' }, ''], ['a circle that is a see-through barrier', { type: 'circle', barrier: true }, '']
        ];
        const spGot = []; SPARED.forEach((k, i) => ODDS.forEach((odd, n) => { const p = Object.assign({ id: 'sp' + i + '_' + n }, SPB, odd, k[1]), was = J(p), outs = [wwiS, wwiN, wwiO].reduce((all, wire) => all.concat([wire(p, false), wire(copyOf(p), true)]), []);
            spGot.push([k[0], n, outs.length === 6 && outs.every(o => !!o && has6(o).length === 0 && LINEKEYS.every(key => ownK(o, key) === ownK(p, key) && J(o[key]) === J(p[key]))) && J(p) === was && J(nameWhy(p)) === J(k[2] ? [k[2]] : []) && (k[2] ? isLineP(p) : !isLineP(p)), p, outs[0]]); }));
        const spMap = siS({ id: 'mSp', type: 'map', meta: { title: 'Spared' }, rooms: [], links: [], whiteboard: spGot.map(g => copyOf(g[3])) }).whiteboard, spMapOk = spMap.length === spGot.length && spMap.every((o, i) => LINEKEYS.every(key => ownK(o, key) === ownK(spGot[i][3], key) && J(o[key]) === J(spGot[i][3][key])));
        const spCtl = [wwiS, wwiN, wwiO].map(wire => ODDS.map((odd, n) => { const o = wire(Object.assign({ id: 'ctl' + n }, SPB, odd, { blocksSight: true }), false) || {}; return [o.strokeWidth, ownK(o, 'opacity') ? o.opacity : 'no key', o.tip]; }));
        check('Match a wall, what the rule for a wall line does not touch (wireWbItem and sanitizeItem, run for real with the real fogcore, with none and with an empty one): the width, the opacity and the nib of a piece that is no plain wall drawn as a line leave exactly as stored, each key there or not as on the host. Held under four looks a wall line would lose (a width that is a text, an opacity of 1, a nib the app does not know; a width of 0 with an opacity that is a text and no nib; an opacity of 2 and a nib in another case with no width; a width with its unit, an opacity under 0 and the flat nib), of sixteen pieces. Twelve are lines, each spared by one part of the rule by the suite\'s own reading: a door drawn as a line, an open one, a see-through barrier\'s door, a found door that still holds the look once matched for it, which leaves at its own and without the keys; a wall line that leads to another map; a wall line on a room\'s node; a token and a waiting token drawn as a line that block sight; a line that blocks nothing, one whose Blocks sight is unticked, one whose barrier flag is not the word true, and a player\'s drawing. Four are plain walls that are no lines: a filled region that is a wall, one that is a see-through barrier, a box that is a wall and a circle that is a see-through barrier. Alone, on a clone and on a whole map; the host\'s piece is never changed. And the very same four looks on a line that IS a plain wall leave rewritten, with a core at hand or not: 8 px solid with the round nib, 3 px at opacity 0.4 with the round nib, 3 px solid with the round nib, and 4.5 px at opacity 0 with the flat nib',
            spGot.length === 64 && spGot.every(g => g[2]) && spMapOk && SPARED.length === 16 && J(SPARED.map(k => k[2]).filter((r, i, all) => r && all.indexOf(r) === i).sort()) === J(['door', 'free', 'node', 'portal', 'token', 'waiting'])
            && spCtl.every(per => J(per) === J([[8, 'no key', 'round'], [3, 0.4, 'round'], [3, 'no key', 'round'], [4.5, 0, 'flat']])),
            J([spGot.filter(g => !g[2]).map(g => [g[0], g[1], g[4]]).slice(0, 3), spMapOk, spCtl[1]]));

        // ---- (2f) Match a wall, round two (2026-10-12): what three reviewers of the first build confirmed, as the wire shows it ----
        // (i) NO PLAIN WALL CARRIES A LOCK TO PLAYERS. The board draws a locked piece at 85% on every screen, so a locked wall beside a secret
        // door that is not locked, or the other way round, showed. A plain wall and a secret door's copy leave with no locked key, whatever the
        // key holds, and exactly as the same piece with no lock leaves. Every other piece keeps its lock, and leaves otherwise as it would without
        await breathe();
        const LKB = { x: 100, y: 50, w: 50, h: 50, color: '#445566' }, LKP = { type: 'path', x: 200, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, z: 10, pts: [[0, 0], [0, 50]], color: '#445566', strokeWidth: 4, tip: 'round' };
        const LOCK_GOES = [   // a plain wall or a secret door: [what it is, the piece]
            ['a wall', Object.assign({ type: 'rect', blocksSight: true, sightType: 'wall' }, LKB)], ['a wall with no type named', Object.assign({ type: 'rect', blocksSight: true }, LKB)], ['a hexagon that is a wall', Object.assign({ type: 'hexagon', blocksSight: true, sightType: 'wall' }, LKB)],
            ['a see-through barrier', Object.assign({ type: 'rect', barrier: true }, LKB, { color: 'transparent' })], ['a wall line', Object.assign({ blocksSight: true, sightType: 'wall' }, LKP)], ['a see-through barrier drawn as a line', Object.assign({ barrier: true }, LKP)],
            ['a filled region that is a wall', Object.assign({ blocksSight: true, sightType: 'wall' }, LKP, { tip: 'fill', pts: TRI })], ['a player\'s drawing the GM made a wall', Object.assign({ blocksSight: true, sightType: 'wall', ownerId: 'u_a', byPlayer: true }, LKP)],
            ['a secret door', Object.assign({ type: 'rect', blocksSight: true, sightType: 'door', secret: true }, LKB)], ['a secret door drawn as a line', Object.assign({ blocksSight: true, sightType: 'door', secret: true }, LKP)],
            ['a see-through barrier\'s secret door', Object.assign({ type: 'rect', barrier: true, sightType: 'door', secret: true }, LKB)], ['a secret door that is also a portal', Object.assign({ type: 'rect', blocksSight: true, sightType: 'door', secret: true, targetMapId: 'mB' }, LKB)]
        ];
        const LOCK_STAYS = [   // any other piece
            ['a door that is no secret', Object.assign({ type: 'rect', blocksSight: true, sightType: 'door' }, LKB)], ['an open door', Object.assign({ type: 'rect', blocksSight: true, sightType: 'door', doorOpen: true }, LKB)], ['a door drawn as a line', Object.assign({ blocksSight: true, sightType: 'door' }, LKP)],
            ['a see-through barrier\'s door', Object.assign({ type: 'rect', barrier: true, sightType: 'door' }, LKB)], ['a found door that still holds the look once matched for it', Object.assign({ blocksSight: true, sightType: 'door', seenColor: '#112233', seenWidth: 5, seenOpacity: 0.5, seenTip: 'square' }, LKP)],
            ['a wall that leads to another map', Object.assign({ type: 'rect', blocksSight: true, sightType: 'wall', targetMapId: 'mB' }, LKB)], ['a wall line that leads to another map', Object.assign({ blocksSight: true, sightType: 'wall', targetMapId: 'mB' }, LKP)], ['a wall on a room\'s node', Object.assign({ type: 'rect', blocksSight: true, nodeId: 'r1' }, LKB)],
            ['a picture that blocks sight', Object.assign({ type: 'image', src: '/saves/images/k/gate.png', blocksSight: true }, LKB)], ['a text box that blocks sight', Object.assign({ type: 'text', text: 'Beware', blocksSight: true }, LKB)],
            ['a token', Object.assign({ type: 'image', isChar: true, charName: 'Mimic' }, LKB)], ['a token that blocks sight', Object.assign({ type: 'circle', isChar: true, charName: 'Golem', blocksSight: true, sightType: 'wall' }, LKB)], ['a waiting token', Object.assign({ type: 'circle', waiting: 1, ownerId: 'u_a' }, LKB)],
            ['a floor piece', Object.assign({ type: 'rect' }, LKB)], ['a drawing', Object.assign({}, LKP)], ['a player\'s drawing', Object.assign({ ownerId: 'u_a', byPlayer: true }, LKP)], ['a piece whose Blocks sight is unticked', Object.assign({ type: 'rect', blocksSight: false, sightType: 'wall' }, LKB)], ['a portal that blocks nothing', Object.assign({ type: 'rect', targetMapId: 'mB' }, LKB)]
        ];
        const WIRESL = [['the real fogcore', wwiS, siS], ['no fogcore', wwiN, siN], ['an empty fogcore', wwiO, null], ['the pattern\'s and the picture\'s cleaners alone', wwiH, null]], LOCKV = [true, 1, 'yes', 0, '', { a: 1 }];   // a lock as the app writes it, and as a file may
        const lockBad = [], lockTal = { goes: 0, stays: 0, maps: 0 };
        WIRESL.forEach(wr => {
            LOCK_GOES.forEach((k, i) => LOCKV.forEach((v, n) => { const p = Object.assign({ id: 'lg' + i + '_' + n }, copyOf(k[1]), { locked: v }), was = J(p), outs = [wr[1](p, false), wr[1](copyOf(p), true)], free = wr[1](less(p, ['locked']), false); lockTal.goes++;
                if (J(p) !== was) lockBad.push([wr[0], k[0], 'the host\'s piece changed']);
                outs.forEach(o => { if (!o || ownK(o, 'locked') || o.sightType !== 'wall' || flat(o) !== flat(free) || /locked/.test(J(o))) lockBad.push([wr[0], k[0], v, 'it left with its lock, or otherwise than the same piece with no lock leaves', o]); }); }));
            LOCK_STAYS.forEach((k, i) => { const p = Object.assign({ id: 'ls' + i }, copyOf(k[1]), { locked: true }), was = J(p), outs = [wr[1](p, false), wr[1](copyOf(p), true)], free = wr[1](less(p, ['locked']), false); lockTal.stays++;
                if (J(p) !== was) lockBad.push([wr[0], k[0], 'the host\'s piece changed']);
                outs.forEach(o => { if (!o || o.locked !== true || flat(less(o, ['locked'])) !== flat(free)) lockBad.push([wr[0], k[0], 'it lost its lock, or left otherwise than the same piece with no lock leaves', o]); }); });
            if (wr[2]) { const host = { id: 'mLk', type: 'map', meta: { title: 'Locks' }, rooms: [], links: [], whiteboard: LOCK_GOES.map((k, i) => Object.assign({ id: 'lg' + i }, copyOf(k[1]), { locked: true })).concat(LOCK_STAYS.map((k, i) => Object.assign({ id: 'ls' + i }, copyOf(k[1]), { locked: true }))) }, was = J(host), out = wr[2](host).whiteboard; lockTal.maps++;
                if (J(host) !== was || !host.whiteboard.every(w => w.locked === true) || out.length !== LOCK_GOES.length + LOCK_STAYS.length || out.filter(o => ownK(o, 'locked')).map(o => o.id).join() !== LOCK_STAYS.map((k, i) => 'ls' + i).join() || out.some(o => ownK(o, 'locked') && o.locked !== true)) lockBad.push([wr[0], 'the whole map', out.filter(o => ownK(o, 'locked')).map(o => o.id)]); }
        });
        // A wall line and the secret door that meets it, matched by the real press: the wall locked, the door locked, both, or neither. Each pair
        // leaves as the same text but for id and geometry, and as the very same two texts whichever of the two is locked, with the core or with none
        const lockPair = (wl, dl) => { const wall = penBy('lkW', { color: '#3A4A5A', strokeWidth: 5, tip: 'round', opacity: 0.55 }), door = tick(doorOf(wall, [5, 0.55, 'round'], 'lkD')); if (wl) wall.locked = true; if (dl) door.locked = true; return { wall, door, hit: matchAs(door, [wall, door]) }; };
        const lockPairs = [[true, false], [false, true], [true, true], [false, false]].map(f => lockPair(f[0], f[1])), lockPairWas = J(lockPairs);
        const pairTexts = WIRESL.map(wr => lockPairs.map(pr => { const a = wr[1](pr.wall, false), b = wr[1](pr.door, false), a2 = wr[1](copyOf(pr.wall), true), b2 = wr[1](copyOf(pr.door), true), m = wr[2] ? wr[2]({ id: 'mLp', type: 'map', meta: { title: 'Pair' }, rooms: [], links: [], whiteboard: [copyOf(pr.wall), copyOf(pr.door)] }).whiteboard : [a, b];
            return a && b && a2 && b2 && m.length === 2 && J(a) === J(a2) && J(b) === J(b2) && J(m[0]) === J(a) && J(m[1]) === J(b) && noGeo(a) === noGeo(b) && a.id !== b.id && a.y !== b.y && !/locked/.test(J([a, b])) ? J(a) + J(b) : 'no twin: ' + J([a, b]); }));
        const pairSame = pairTexts.every(per => per.every(t => t === pairTexts[0][0])) && pairTexts[0][0].indexOf('no twin') !== 0 && /"strokeWidth":5,"tip":"round"/.test(pairTexts[0][0]) && /"opacity":0\.55/.test(pairTexts[0][0]);
        const pairHost = lockPairs.map(pr => [pr.wall.locked === true, pr.door.locked === true, !!pr.hit, pr.door.secret === true, pr.door.strokeWidth]);
        const stayWhy = LOCK_STAYS.reduce((all, k) => all.concat(nameWhy(k[1]).filter(r => all.indexOf(r) < 0)), []).sort();
        check('Match a wall, round two, no plain wall carries a lock to players (wireWbItem and sanitizeItem, run for real with the real fogcore, with none, with an empty one and with the pattern\'s and the picture\'s cleaners alone). The board draws a locked piece fainter on every screen, so a wall locked in place beside a secret door that is not, or the other way round, told the two apart. A plain wall leaves with no locked key, sent alone, on a clone and on a whole map: a wall, a wall with no type named, a hexagon that is a wall, a see-through barrier, a wall line, a see-through barrier drawn as a line, a filled region that is a wall and a player\'s drawing the GM made a wall. A secret door\'s copy leaves with none either: a box, a line, a see-through barrier\'s and one that is also a portal. Each of the twelve under a lock that is the word true, a 1, a text, a 0, an empty text and an object, and each leaves exactly as the same piece with no lock leaves. Every other piece keeps its lock, and leaves otherwise as it would without: a door that is no secret, an open door, a door drawn as a line, a see-through barrier\'s door, a found door that still holds the look once matched for it, a wall and a wall line that lead to another map, a wall on a room\'s node, a picture and a text box that block sight, a token, a token that blocks sight, a waiting token, a floor piece, a drawing, a player\'s drawing, a piece whose Blocks sight is unticked and a portal that blocks nothing: eighteen, with every reason of the suite\'s own reading among them. On a whole map of all thirty, each locked, the eighteen are the ones that still say so. And a wall line with the secret door that meets it, matched by the real press: with the wall locked, with the door locked, with both and with neither, the pair leaves as the same text but for id and geometry, and as the very same two texts whichever is locked, with the core or with none. The host\'s own pieces keep their locks: no send changes them',
            lockBad.length === 0 && LOCK_GOES.length === 12 && LOCK_STAYS.length === 18 && lockTal.goes === 4 * 12 * 6 && lockTal.stays === 4 * 18 && lockTal.maps === 2 && LOCK_GOES.every(k => plainWall(k[1]) !== secretBy(Object.assign({}, k[1]))) && LOCK_GOES.filter(k => secretBy(k[1])).length === 4 && LOCK_STAYS.every(k => !plainWall(k[1]) && !secretBy(k[1]))
            && J(stayWhy) === J(['door', 'free', 'node', 'picture', 'portal', 'text', 'token', 'waiting']) && pairSame && J(lockPairs) === lockPairWas && J(pairHost) === J([[true, false, true, true, 9], [false, true, true, true, 9], [true, true, true, true, 9], [false, false, true, true, 9]]),
            J([lockBad.slice(0, 3), lockTal, stayWhy, pairSame ? 'the pairs are as the title says' : pairTexts.map(per => per.map(t => t.slice(0, 400))), pairHost]));

        // (ii) WITH NO FOG CORE AT HAND a matched secret door drawn as a line is still sent in its matched look. net.js's fallback lays the color,
        // the width, the opacity and the nib named over the door's own, by the tests the core's cleaners make. Held three ways: every wall line of
        // part (2e) with a door matched to it, sent with no core; each seen key alone, as a value that counts and as one that does not, with the
        // expected look written out; and (iii) below, seeded doors, where the wire with no core, the wire with the core and the suite's own reading agree
        await breathe();
        const WIRESN = [['no fogcore', wwiN], ['an empty fogcore', wwiO], ['the pattern\'s and the picture\'s cleaners alone', wwiH]];
        const fbRows = MWALLS.map((row, i) => { if (!row[1]) return [row[0], 'the wall was not made']; const wall = copyOf(row[1]), door = tick(row[3] ? row[3]() : doorOf(wall, row[2], 'mf' + i), i % 2 ? wall.color : undefined); if (!door) return [row[0], 'the door was not made'];
            const hit = matchAs(door, [wall, door]), was = J([wall, door]), aS = wwiS(wall, false), bS = wwiS(door, false), onMapN = siN({ id: 'mFb', type: 'map', meta: { title: 'Fallback' }, rooms: [], links: [], whiteboard: [copyOf(wall), copyOf(door)] }).whiteboard;
            const off = WIRESN.filter(wr => { const a = wr[1](wall, false), b = wr[1](door, false), a2 = wr[1](copyOf(wall), true), b2 = wr[1](copyOf(door), true);
                return !(a && b && a2 && b2 && noGeo(a) === noGeo(b) && a.id !== b.id && a.y !== b.y && J(a) === J(a2) && J(b) === J(b2) && J(a) === J(aS) && J(b) === J(bS) && has6(b).length === 0 && b.sightType === 'wall'
                    && typeof b.strokeWidth === 'number' && b.strokeWidth === row[2][0] && (row[2][1] < 1 ? b.opacity === row[2][1] : !ownK(b, 'opacity')) && b.tip === row[2][2] && b.color === String(wall.color).toLowerCase() && !/6b4a2a/i.test(J(b))); }).map(wr => wr[0]);
            return [row[0], !hit ? 'no wall was met' : off.length ? off : onMapN.length !== 2 || J(onMapN[0]) !== J(aS) || J(onMapN[1]) !== J(bS) ? 'on a whole map' : J([wall, door]) !== was ? 'the host\'s pieces changed' : '']; }).filter(r => r[1] !== '');
        // Each seen key alone on a door drawn as a line 9 px wide at opacity 0.8 with the flat nib, in a color of its own: [the value, what leaves]
        const FBD = more => Object.assign({ id: 'fbd', type: 'path' }, copyOf(DGEO), { z: 10, color: OAK, strokeWidth: 9, opacity: 0.8, tip: 'flat', blocksSight: true, sightType: 'door', secret: true }, more);
        const lookAs = o => [o.color, o.strokeWidth, ownK(o, 'opacity') ? o.opacity : 'solid', o.tip];
        // ... sent alone, which bounds and copies it first, and handed over as a clone already: the two must agree
        const fbLook = (wire, more) => { try { const o = wire(FBD(more), false), o2 = wire(FBD(more), true); return o && o2 && J(o) === J(o2) && has6(o).length === 0 && o.sightType === 'wall' && !ownK(o, 'texture') && !ownK(o, 'locked') ? lookAs(o) : ['alone and as a clone it left as two things, with a key, or as no wall', o, o2]; } catch (e) { return ['the send threw', String(e && e.message)]; } };
        // ... and handed over as a clone only: no bound is laid on its numbers first, so a number past 1e15 and what is no number at all reach the rule itself
        const fbRaw = (wire, more) => { try { const o = wire(FBD(more), true); return o && has6(o).length === 0 && o.sightType === 'wall' ? lookAs(o) : ['it left with a key, or as no wall', o]; } catch (e) { return ['the send threw', String(e && e.message)]; } };
        const FB_W = [[5, 5], [0.5, 0.5], [2.25, 2.25], [1e15, 1e15], [0, 9], [-3, 9], ['6', 9], ['5px', 9], ['', 9], [null, 9], [true, 9], [[4], 9], [{ n: 4 }, 9]], FB_W_RAW = [[1e15 + 2, 9], [1e300, 9], [Infinity, 9], [-Infinity, 9], [NaN, 9], [1e15, 1e15], [5, 5]];
        const FB_O = [[0.55, 0.55], [0, 0], [0.999, 0.999], [1, 'solid'], [1.01, 0.8], [2, 0.8], [-0.1, 0.8], ['0.5', 0.8], ['', 0.8], [null, 0.8], [true, 0.8], [false, 0.8], [[0.5], 0.8]], FB_O_RAW = [[NaN, 0.8], [Infinity, 0.8], [-Infinity, 0.8], [1.0000000000000002, 0.8], [-5e-324, 0.8], [0.3, 0.3], [1, 'solid']];
        const FB_T = [['round', 'round'], ['square', 'square'], ['flat', 'flat'], ['Round', 'flat'], ['SQUARE', 'flat'], [' round', 'flat'], ['fill', 'flat'], ['butt', 'flat'], ['', 'flat'], [5, 'flat'], [null, 'flat'], [true, 'flat'], [['round'], 'flat']];
        const FB_C = [['#A0B0C0', '#a0b0c0'], ['#a0b0c0', '#a0b0c0'], ['#1A2b3C', '#1a2b3c'], ['transparent', 'transparent'], ['<img src=x onerror=alert(1)>', WALLC], ['#abc', WALLC], ['#AABBCCDD', WALLC], ['#GGHHII', WALLC], ['x#A0B0C0', WALLC], ['#A0B0C0 ', WALLC], ['#A0B0C0\n', WALLC], ['red', WALLC],
            ['Transparent', WALLC], ['TRANSPARENT', WALLC], [' transparent', WALLC], ['rgba(0, 0, 0, 0)', WALLC], ['url(//x.test/c)', WALLC], ['', WALLC], [7, WALLC], [null, WALLC], [true, WALLC], [['#a0b0c0'], WALLC], [{ a: 1 }, WALLC]];
        const fbOne = (key, list, at, raw) => WIRESN.concat([['the real fogcore', wwiS]]).map(wr => list.map(r => { const more = {}; more[key] = r[0]; const got = (raw ? fbRaw : fbLook)(wr[1], more), want = [WALLC, 9, 0.8, 'flat']; want[at] = r[1]; return J(got) === J(want) ? '' : [wr[0], key, String(r[0]), got]; }).filter(Boolean));
        const fbKeys = [fbOne('seenColor', FB_C, 0), fbOne('seenWidth', FB_W, 1), fbOne('seenWidth', FB_W_RAW, 1, true), fbOne('seenOpacity', FB_O, 2), fbOne('seenOpacity', FB_O_RAW, 2, true), fbOne('seenTip', FB_T, 3)], fbKeyBad = fbKeys.reduce((all, per) => all.concat(per.reduce((a, l) => a.concat(l), [])), []);
        const fbMore = WIRESN.map(wr => ({
            none: fbLook(wr[1], {}), all: fbLook(wr[1], { seenColor: '#A0B0C0', seenWidth: 5, seenOpacity: 0.3, seenTip: 'round', seenTexture: 'stone' }),
            bare: fbLook(wr[1], { strokeWidth: undefined, opacity: undefined, tip: undefined, seenWidth: 7, seenOpacity: 0.4, seenTip: 'square' }),   // a door that holds no width, opacity or nib of its own takes all three as keys it never had
            texts: fbLook(wr[1], { strokeWidth: '9', opacity: '0.8', tip: 'Flat' }),   // the door's own as a file may write them, nothing named: the copy is a plain wall, so it leaves as it is drawn
            clear: [fbLook(wr[1], { color: 'transparent' })[0], fbLook(wr[1], { color: 'transparent', seenColor: 'red' })[0], fbLook(wr[1], { color: 'transparent', seenColor: '#A0B0C0' })[0], fbLook(wr[1], { color: 'rgba(0, 0, 0, 0)' })[0], fbLook(wr[1], { color: 'rgba(0, 0, 0, 0)', seenColor: 'transparent' })[0]],
            region: fbLook(wr[1], { tip: 'fill', pts: TRI, seenColor: '#A0B0C0', seenWidth: 5, seenOpacity: 0.3, seenTip: 'round' }) }));   // a filled region is no line: the box's rule
        const FB_MORE = { none: [WALLC, 9, 0.8, 'flat'], all: ['#a0b0c0', 5, 0.3, 'round'], bare: [WALLC, 7, 0.4, 'square'], texts: [WALLC, 9, 0.8, 'round'], clear: ['transparent', 'transparent', '#a0b0c0', WALLC, 'transparent'], region: [WALLC, 9, 0.8, 'fill'] };
        // A box door's fallback is as it was: nothing named for it is read. A box, a hexagon, a circle, a diamond and a filled region, each with a
        // pattern, a name, a lock and odd line keys of its own, and all five keys of a look named for it
        const FBBOX = [['rect', {}], ['hexagon', {}], ['circle', {}], ['diamond', {}], ['path', { tip: 'fill', pts: TRI, baseW: 50, baseH: 50 }]].map((k, i) => Object.assign({ id: 'fbb' + i, type: k[0], x: 0, y: 0, w: 50, h: 50, color: OAK, texture: 'planks', strokeWidth: 4, opacity: 0.6, tip: 'butt', name: 'Door', doorLock: true, locked: true, blocksSight: true, sightType: 'door', secret: true, seenColor: '#A0B0C0', seenTexture: 'stone', seenWidth: 7.125, seenOpacity: 0.4375, seenTip: 'round' }, k[1]));
        const boxLook = (wire, p) => { const o = wire(p, false) || {}, o2 = wire(copyOf(p), true) || {}; return J(o) === J(o2) ? [o.sightType, o.color, ownK(o, 'texture'), o.strokeWidth, o.opacity, o.tip, Object.keys(o).filter(k => ['name', 'doorLock', 'locked'].concat(KEYS6).indexOf(k) >= 0)] : ['alone and on a clone it left as two things']; };
        const fbBoxGot = WIRESN.map(wr => FBBOX.map(p => boxLook(wr[1], p)).concat([boxLook(wr[1], Object.assign(copyOf(FBBOX[0]), { color: 'transparent' })), boxLook(wr[1], Object.assign(copyOf(FBBOX[0]), { seenColor: 'transparent' }))]));
        const FB_BOX = FBBOX.map(p => ['wall', WALLC, false, 4, 0.6, p.tip, []]).concat([['wall', 'transparent', false, 4, 0.6, 'butt', []], ['wall', WALLC, false, 4, 0.6, 'butt', []]]);
        check('Match a wall, round two, the fallback and a matched door (wireWbItem and sanitizeItem, run for real with no fogcore on the window, with an empty one and with the pattern\'s and the picture\'s cleaners alone, each beside the real fogcore): with no core at hand a secret door drawn as a line is still sent in the look Match set for it. For each of the twenty-two ways a wall line is made, a door in a look of its own is matched to it by the real press: with no core the two leave as the same text but for id and geometry, alone, on a clone and on a whole map, the copy at the wall\'s width as a number, its opacity only under 1, its nib and its color in lower case or as the word transparent, and both leave as the very texts they leave as with the core. Each seen key alone, on a door 9 px wide at opacity 0.8 with the flat nib. A color counts as a hex color of six digits, read in lower case, or as the very word transparent; markup, a short hex, a hex with an alpha, six letters that are no hex digits, a hex color behind another letter, before a space or before a line break, a color word, another case of the word transparent or the word behind a space, a clear color as a function, an address, an empty text, a number, null, a truth value, a list and an object are passed over, the send does not throw, and the copy leaves in the Wall material\'s color. A width counts as a number above 0 and at most 1e15; a 0, a negative, a text, a text with its unit, null, a truth value, a list and an object are passed over and the door\'s 9 stays, and so are a number just past 1e15, 1e300, an infinite one and what is no number, handed over where no bound is laid on them first. An opacity counts as a number from 0 to 1, with 1 as no opacity key; a number over 1, a negative, the smallest negative there is, a text, null, a truth value, a list, an infinite one and what is no number are passed over and the door\'s 0.8 stays. A nib counts as round, square or flat; another case, a space before it, the word fill, a word the app does not know, an empty text, a number, null, a truth value and a list are passed over and the door\'s flat nib stays. The core gives the very same answer to each. All of them together are the copy\'s look, and the pattern named is never worn. A door that holds no width, opacity or nib of its own takes all three named as keys it never had. A door whose own are texts, with nothing named, leaves as it is drawn. A see-through door, by the plain word, stays clear with nothing named or with a color that does not count, takes a color that does, and one that is clear by another spelling leaves in the Wall material\'s color, or clear once the word transparent is named for it. A filled region is no line. And a box door\'s fallback is as it was: a box, a hexagon, a circle, a diamond and a filled region with all five keys of a look named leave in the Wall material\'s color, or see-through by their own plain word, with no pattern, no name, no lock and none of the keys, and with their own width, opacity and nib exactly as stored',
            fbRows.length === 0 && MWALLS.length === 22 && fbKeyBad.length === 0 && fbKeys.every(per => per.length === 4) && fbMore.every(m => J(m) === J(FB_MORE)) && fbMore.length === 3 && fbBoxGot.every(per => J(per) === J(FB_BOX)) && FBBOX.length === 5 && FB_C.length === 23 && FB_W.length + FB_W_RAW.length === 20 && FB_O.length + FB_O_RAW.length === 20 && FB_T.length === 13,
            J([fbRows.slice(0, 3), fbKeyBad.slice(0, 4), fbMore.map(m => (J(m) === J(FB_MORE) ? 'as the title says' : m)), fbBoxGot.map(per => (J(per) === J(FB_BOX) ? 'as the title says' : per))]));

        // (iii) The fallback over seeded doors. A secret door drawn as a line, its own color, width, opacity and nib and the look named for it
        // drawn from a seeded sequence of its own: numbers of every size and sign, texts, and what is neither. Sent with no core, with an empty
        // one and with the real one, handed over as a clone (so that every value reaches the rule as it is) and sent alone (bounded and copied
        // first). All agree with each other and with the suite's own reading (fallbackOf). And the suite's own tests of what counts are held to
        // fogcore's four cleaners over the same values
        {
            let seedF = 20261014; const rndF = n => { seedF = (Math.imul(seedF, 1103515245) + 12345) >>> 0; return Math.floor((seedF >>> 8) / 16777216 * n); }, pickF = list => list[rndF(list.length)];
            const numF = () => { const k = rndF(8); return k === 0 ? rndF(40) : k === 1 ? rndF(4000) / 100 : k === 2 ? -rndF(900) / 10 : k === 3 ? rndF(1000) / 1000 : k === 4 ? 1 + rndF(100) / 1000 : k === 5 ? Math.pow(10, rndF(40) - 20) : pickF([0, 1, 3, 1e15, 1e15 + 2, 1e16, 1e300, -1e300, 5e-324, 0.9999999999999999, 1.0000000000000002, -0.000001, NaN, Infinity, -Infinity]); };
            const ODDF = [null, true, false, '', ' ', 'wide', '5', '0.5', '1', 'round', [5], [], { n: 5 }], valF = () => { const k = rndF(10); return k === 0 ? undefined : k <= 6 ? numF() : pickF(ODDF); };
            const TIPF = ['round', 'square', 'flat', 'round', 'square', 'flat', undefined, undefined, null, '', 'Round', 'FLAT', ' square', 'butt', 'fill', 5, true, ['square']], OWNTIP = TIPF.filter(t => t !== 'fill');   // the door's own nib is never the Fill tip: that is a filled region, and no line
            const COLF = ['#A0B0C0', '#a0b0c0', '#1A2b3C', 'transparent', 'transparent', undefined, undefined, null, 7, '#abc', '#AABBCCDD', 'red', 'Transparent', ' transparent', 'rgba(0, 0, 0, 0)', '<b>', ['#a0b0c0'], { a: 1 }];
            const OWNCOL = [OAK, OAK, '#ABCDEF', 'transparent', undefined, 'var(--ink)', 'DarkRed'];   // never a clear color by another spelling, nor a pattern of its own: there alone the core reads more than the fallback does
            const capN = (k, v) => (typeof v === 'number' && (v > 1e15 || v < -1e15) ? (v > 0 ? 1e15 : -1e15) : v);   // the wire's bound on a number, written out: laid on a piece that is sent alone, before any rule reads it
            const same = (a, b) => a === b, eqBad = [], ET = { n: 0, w: 0, wOdd: 0, wBig: 0, o: 0, solid: 0, oOdd: 0, t: 0, tOdd: 0, hex: 0, clear: 0, cOdd: 0, none: 0, nan: 0, locked: 0 };
            for (let i = 0; i < 3000; i++) {
                const p = Object.assign({ id: 'F' + i, type: 'path', x: 0, y: 0, w: 10, h: 50, pts: [[0, 0], [0, 50]] }, pickF([{ blocksSight: true }, { barrier: true }, { blocksSight: true, barrier: true }]), { sightType: 'door', secret: true }), set = (k, v) => { if (v !== undefined) p[k] = v; };
                set('color', pickF(OWNCOL)); set('strokeWidth', valF()); set('opacity', valF()); set('tip', pickF(OWNTIP));
                set('seenColor', pickF(COLF)); set('seenWidth', valF()); set('seenOpacity', valF()); set('seenTip', pickF(TIPF)); if (!rndF(4)) p.seenTexture = pickF(['stone', '', 'Stone', 9]); if (!rndF(5)) { p.locked = true; ET.locked++; }
                const sent = JSON.parse(JSON.stringify(p), capN), wantRaw = flat(noOff(fallbackOf(p))), wantSent = flat(noOff(fallbackOf(sent))), raw = () => Object.assign({}, p);
                const c = seenC(p.seenColor), sw = seenW(p.seenWidth), so = seenO(p.seenOpacity), st = seenT(p.seenTip); ET.n++;
                let oS, oN, oO, sS, sN; try { oS = wwiS(raw(), true); oN = wwiN(raw(), true); oO = wwiO(raw(), true); sS = wwiS(p, false); sN = wwiN(p, false); } catch (e) { eqBad.push([i, 'a send threw: ' + String(e && e.message), p]); continue; }
                if (flat(oN) !== wantRaw || flat(oO) !== wantRaw || flat(oS) !== wantRaw) eqBad.push([i, 'handed over as a clone: with no core, with the core and by the reading it is not one thing', p, oN, oS]);
                if (flat(sN) !== wantSent || flat(sS) !== wantSent) eqBad.push([i, 'sent alone: with no core, with the core and by the reading it is not one thing', p, sN, sS]);
                if (!same(c, FC.cleanSeenColor(p.seenColor)) || !same(sw, FC.cleanSeenWidth(p.seenWidth)) || !same(so, FC.cleanSeenOpacity(p.seenOpacity)) || !same(st, FC.cleanSeenTip(p.seenTip))) eqBad.push([i, 'the suite\'s own test of what counts and fogcore\'s cleaner', p]);
                if (sw !== null) ET.w++; else if (ownK(p, 'seenWidth')) ET.wOdd++; if (so !== null) { ET.o++; if (so === 1) ET.solid++; } else if (ownK(p, 'seenOpacity')) ET.oOdd++; if (st !== null) ET.t++; else if (ownK(p, 'seenTip')) ET.tOdd++;
                if (c === 'transparent') ET.clear++; else if (c !== null) ET.hex++; else if (ownK(p, 'seenColor')) ET.cOdd++; if (c === null && sw === null && so === null && st === null) ET.none++;
                if ([p.seenWidth, p.seenOpacity].some(v => typeof v === 'number' && !Number.isFinite(v))) ET.nan++;
                // a seen width past 1e15: passed over where it reaches the rule as it is, and 1e15 where the wire bounded it first
                if (typeof p.seenWidth === 'number' && Number.isFinite(p.seenWidth) && p.seenWidth > 1e15) { ET.wBig++; if (!oN || oN.strokeWidth !== drawnW(p.strokeWidth) || !sN || sN.strokeWidth !== 1e15) eqBad.push([i, 'a seen width past 1e15', p, oN, sN]); }
                if (i % 200 === 199) await breathe();
            }
            check('Match a wall, round two, the fallback over seeded doors (wireWbItem, run for real on 3,000 seeded secret doors drawn as a line, with no fogcore, with an empty one and with the real one): the door\'s own color, width, opacity and nib and the look named for it are drawn from a seeded sequence: numbers of every size and sign, among them 0, 1, a number just under and just over 1, 1e15, numbers past it, what is no number and the infinite ones; texts, a truth value, null, a list and an object; nibs in another case, with a space, of no kind, and the word fill; and colors that are a hex color of six digits in any case, the word transparent, another case of it, a short hex, a hex with an alpha, a color word, a clear color as a function, markup, a number, null, a list and an object. Handed over as a clone, where every value reaches the rule as it is, and sent alone, where the wire bounds and copies it first, the copy with no core is exactly the copy with the core, and both are exactly what the suite\'s own reading gives: the color named where it counts, else the Wall material\'s or the door\'s own plain word transparent; the width, the opacity and the nib named, each where it counts, over the door\'s own as drawn; an opacity of 1 as no key; no lock; none of the six keys. A seen width past 1e15 is passed over where it reaches the rule as it is, and is 1e15 where the wire bounded it first. The suite\'s own tests of what counts give what fogcore\'s cleanSeenColor, cleanSeenWidth, cleanSeenOpacity and cleanSeenTip give for every value',
                eqBad.length === 0 && ET.n === 3000 && ET.w >= 1000 && ET.wOdd >= 1000 && ET.wBig >= 70 && ET.o >= 350 && ET.solid >= 30 && ET.oOdd >= 1700 && ET.t >= 750 && ET.tOdd >= 1200 && ET.hex >= 350 && ET.clear >= 220 && ET.cOdd >= 1400 && ET.none >= 500 && ET.nan >= 120 && ET.locked >= 450,
                J([eqBad.slice(0, 2), ET]));
        }

        // (iv) THE WIDTH AS DRAWN, as round four has it. The board draws a pen line in its own box (baseW by baseH) stretched to w by h, and its
        // pen is stretched with it: a line resized to twice its width across is drawn twice as thick. Round two named the width at which the
        // copy is as thick as the wall is along the WALL'S run. Round three named the width at which the copy is drawn as the wall's own pen
        // WOULD draw along the DOOR'S run, and a reviewer measured that in a browser at twice, or a third of, what the wall shows wherever a
        // wall stretched one way meets a door at an angle. Round four, for a round or a square nib: the copy is drawn as thick as the wall IS
        // drawn where the two meet, since the eye has only that to compare with. That is the wall's width times its pen's factor along the
        // WALL'S OWN run there (the leg of the wall that meets the door), over the door's box's factor along the door's run. The flat nib is a
        // ribbon, as thick as the way it runs makes it, so it is still read along the DOOR'S run on both: how thick the wall's own nib would
        // draw there. Where that ribbon is under a pixel, or the door's own box would need a nib more than twice or under half as wide, the
        // copy takes the SQUARE nib at the ribbon's thickness, a pixel at the least. On the wire the two widths may differ, by design, each in
        // its own box. What is held instead, by the suite's own reading and by fogcore's lineFactor: the copy's width times how thick its pen
        // draws along the door's run equals the wall's width times how thick its pen draws along the wall's own run (round and square) or
        // along the door's run (flat). penThick() is the suite's reading, from the piece's own box, turn and nib, never fogcore's. A round or
        // a square nib is a stroke: a stroke of width t along a unit direction v of the BOX, scaled by sx and sy, is drawn
        // t * sx * sy / |(sx * vx, sy * vy)| thick, and v is the run brought into the box. The flat nib is a ribbon: the board moves every
        // point of the line by 0.70711 of half the width, across and down alike (whiteboard.js buildStrokePath, pinned below), so the nib lies
        // from corner to corner of a square of the box, is stretched with the box, and the ribbon is as thick as the stretched nib is long
        // ACROSS the run
        await breathe();
        const penThick = (o, run, nib) => { const bw = o.baseW > 0 ? o.baseW : o.w, bh = o.baseH > 0 ? o.baseH : o.h, sx = o.w / bw, sy = o.h / bh, t = -(o.rot || 0) * Math.PI / 180, dx = run[2] - run[0], dy = run[3] - run[1];
            const rx = dx * Math.cos(t) - dy * Math.sin(t), ry = dx * Math.sin(t) + dy * Math.cos(t), len = Math.hypot(rx, ry), ux = rx / len, uy = ry / len;   // the run, turned back into the box as it lies before its turn
            if (nib === 'flat') return Math.abs(ux * (0.70711 * o.strokeWidth * sy) - uy * (0.70711 * o.strokeWidth * sx));   // the nib as stretched, (0.70711 t sx, 0.70711 t sy), measured across the run
            const vl = Math.hypot(ux / sx, uy / sy), vx = ux / sx / vl, vy = uy / sy / vl; return o.strokeWidth * sx * sy / Math.hypot(sx * vx, sy * vy); };
        const flatNibPinned = wbN.includes("var _w2 = w / 2, _ox = 0.70711 * _w2, _oy = 0.70711 * _w2;") && wbN.includes("var _top = pts.map(function(q){ return (q[0] + _ox) + ' ' + (q[1] + _oy); });") && wbN.includes("var _bot = pts.map(function(q){ return (q[0] - _ox) + ' ' + (q[1] - _oy); }).reverse();");
        const nearN = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
        const RW = more => Object.assign({ id: 'rw', type: 'path', x: 200, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, z: 10, pts: [[0, 0], [0, 50]], color: '#3a4a5a', strokeWidth: 5, tip: 'round', blocksSight: true, sightType: 'wall' }, more);   // a wall line 5 px wide, from (200, 50) down to (200, 100)
        const RD = more => Object.assign({ id: 'rd', type: 'path', x: 200, y: 100, w: 10, h: 40, baseW: 10, baseH: 40, z: 10, pts: [[0, 0], [0, 40]], color: OAK, strokeWidth: 9, tip: 'square', opacity: 0.8, blocksSight: true, sightType: 'door', secret: true }, more);   // a door line 9 px wide that begins where that wall ends
        const ACROSS = { w: 40, h: 10, baseW: 40, baseH: 10, pts: [[40, 0], [0, 0]] };   // a door that runs to the left from its first point
        const turned = RW({ w: 30, rot: 90 }), turnedSeg = FC.pathSegs(turned)[0] || [0, 0, 0, 0], CORNER = { w: 80, h: 50, baseW: 40, baseH: 50, pts: [[0, 0], [40, 0], [40, 50]] };
        const leaning = RW({ w: 30, rot: 30 }), leaningSeg = FC.pathSegs(leaning)[0] || [0, 0, 0, 0];   // turned by an angle that is no quarter: there the way the run is turned back into its box matters
        const atEnd = (wall, door) => { const ws = FC.pathSegs(wall), e = ws[ws.length - 1] || [0, 0, 0, 0], s = FC.pathSegs(door)[0] || [0, 0, 0, 0]; door.x += e[2] - s[0]; door.y += e[3] - s[1]; return door; };   // the door moved so that its first point lies on the wall's last
        const FLATW = RW({ tip: 'flat' }), FLAT30 = RW({ tip: 'flat', rot: 30 }), DIAG = { w: 40, h: 40, baseW: 40, baseH: 40, pts: [[0, 0], [40, 40]] };   // DIAG: a door that runs down and to the right alike, which is the way the flat nib of its own box lies
        const DOWN = [0, 0, 0, 1], RIGHT = [0, 0, 1, 0], LEFT = [0, 0, -1, 0];   // a run on the board, as a stretch from the origin: only its direction counts
        const SIDEWAYS = { w: 40, h: 10, baseW: 40, baseH: 10, pts: [[0, 0], [40, 0]] };   // a door that runs to the right from its first point
        const SIZED = [   // [what it is, the wall, the door, the width the press must name, how thick the copy is then drawn along the door's run, the nib of the copy where it is not the wall's, the WALL'S OWN run where the two meet (a round or a square nib; a flat wall is read along the door's run, and names none)]
            ['a wall resized to twice its width across', RW({ w: 20 }), RD(), 10, 10, '', DOWN],
            ['a door resized to three times its width across', RW(), RD({ w: 30 }), 5 / 3, 5, '', DOWN],
            ['both resized, each its own way', RW({ w: 15, h: 100 }), RD({ y: 150, w: 5 }), 15, 7.5, '', DOWN],
            ['a wall and a door resized along their length alone', RW({ h: 100 }), RD({ y: 150, h: 80 }), 5, 5, '', DOWN],
            ['a slanted wall stretched one way, the door straight down from its end', RW({ w: 60, h: 40, baseW: 30, baseH: 40, pts: [[0, 0], [30, 40]] }), RD({ x: 260, y: 90 }), 10 / Math.sqrt(2.08), 10 / Math.sqrt(2.08), '', [0, 0, 60, 40]],   // FLIPPED: round three named 10, as that pen would draw straight down. The wall is drawn 10 / sqrt(2.08) px thick along its own slanted run, and so is the copy now
            ['a wall resized to three times its width across and then turned a quarter', turned, RD(Object.assign({ x: turnedSeg[2] - 40, y: turnedSeg[3] }, ACROSS)), 15, 15, '', LEFT],
            ['the same wall turned by 30 degrees, the door across', leaning, RD(Object.assign({ x: leaningSeg[2] - 40, y: leaningSeg[3] }, ACROSS)), 15, 15, '', [0, 0, -1, Math.sqrt(3)]],   // FLIPPED: round three named 5 * sqrt(3), as that pen would draw along the door. The wall is drawn 15 px thick, and so is the copy now. Turned by 30 degrees, a line that ran straight down runs one to the left for every root of three down
            ['a wall with a corner, resized across: the door at the end of its second stretch', RW(CORNER), RD({ x: 280, y: 100 }), 10, 10, '', DOWN],
            ['the same wall, the door at the start of its first stretch', RW(CORNER), RD(Object.assign({ x: 160, y: 50 }, ACROSS)), 5, 5, '', RIGHT],
            ['the same wall, a door that begins at its corner and runs on the way its second stretch runs', RW(CORNER), RD({ x: 280, y: 10, pts: [[0, 40], [0, 0]] }), 10, 10, '', DOWN],
            ['the same wall drawn from its other end, the door at its corner', RW(Object.assign({}, CORNER, { pts: [[40, 50], [40, 0], [0, 0]] })), RD({ x: 280, y: 10, pts: [[0, 40], [0, 0]] }), 10, 10, '', DOWN],
            // round four: the leg of the wall that meets the door is the one that counts, whichever way the door then goes
            ['the same wall, a door that goes ACROSS from the end of its second stretch', RW(CORNER), RD(Object.assign({ x: 280, y: 100 }, SIDEWAYS)), 10, 10, '', DOWN],   // round three would name 5, as that pen draws across: the second stretch is drawn 10 px thick
            ['the same wall, a door that goes straight DOWN from the start of its first stretch', RW(CORNER), RD({ x: 200, y: 50 }), 5, 5, '', RIGHT],   // round three would name 10, as that pen draws straight down: the first stretch is drawn 5 px thick
            ['a wall with a corner, resized across, whose second stretch is 20 px long: the door at its end', RW({ w: 80, h: 20, baseW: 40, baseH: 20, pts: [[0, 0], [40, 0], [40, 20]] }), RD({ x: 280, y: 70 }), 10, 10, '', DOWN],   // the leg that meets the door is read by itself where it is half a run long: 10, as that leg is drawn. Read around its corner, 10 px of the first stretch with it, the run would lean and the width come out 9.22
            ['a wall resized along its length alone, the door across its end', RW({ h: 100 }), RD(Object.assign({ x: 160, y: 150 }, ACROSS)), 5, 5, '', DOWN],   // round three would name 10: a wall made twice as long is no thicker for it (the reviewer's 6.03 px against 12.03)
            // the nib. A square nib is a stroke as the round one is. The flat nib is a ribbon, read along the door's run on both
            ['a wall drawn with the square nib, resized to twice its width across', RW({ tip: 'square', w: 20 }), RD({ tip: 'round' }), 10, 10, '', DOWN],
            ['a wall drawn with the flat nib, resized to twice its width across', RW({ tip: 'flat', w: 20 }), RD(), 10, 10 * 0.70711],   // the door's own box needs a nib exactly twice as wide: still the flat nib
            ['a wall drawn with the flat nib, resized to two and a half times its width across', RW({ tip: 'flat', w: 25 }), RD(), 5 * 0.70711 * 2.5, 5 * 0.70711 * 2.5, 'square'],   // round four: more than twice as wide a nib. The square nib at the thickness of the wall's ribbon
            ['a wall drawn with the flat nib, the door resized to three times its width across', RW({ tip: 'flat' }), RD({ w: 30 }), 5 * 0.70711 / 3, 5 * 0.70711, 'square'],   // FLIPPED: round three named five thirds of a pixel with the flat nib. A nib a third as wide is under half: the square nib, drawn as thick as the wall's ribbon in a box three times as wide
            ['a wall drawn with the flat nib, the door resized to twice its width across', RW({ tip: 'flat' }), RD({ w: 20 }), 2.5, 5 * 0.70711],   // exactly half as wide a nib: still the flat nib
            ['a wall drawn with the flat nib, the door turned by 45 degrees', FLATW, atEnd(FLATW, RD({ rot: 45 })), 5 * Math.SQRT2, 5 * 0.70711 * Math.SQRT2],
            ['a wall drawn with the flat nib and turned by 30 degrees, the door straight down from its end', FLAT30, atEnd(FLAT30, RD()), 5 * 0.70711 * (Math.sqrt(3) - 1) / 2, 5 * 0.70711 * (Math.sqrt(3) - 1) / 2, 'square'],   // FLIPPED: round three named 1.83 px with the flat nib. Turned clockwise, the wall's nib lies 75 degrees off the board's own across, so its ribbon straight down is 5 * 0.70711 * 1.41421 * cos 75 thick, 1.29 px: a nib 0.37 times as wide is under half, so the square nib at that thickness
            ['a wall drawn with the flat nib and resized to twice its width across, the door along the nib of its own box', RW({ tip: 'flat', w: 20 }), RD(DIAG), 5 * 0.70711 * Math.SQRT1_2, 5 * 0.70711 * Math.SQRT1_2, 'square'],
            ['the same wall, the door a hair off the nib of its own box, 40 px across and 41 down', RW({ tip: 'flat', w: 20 }), RD({ w: 40, h: 41, baseW: 40, baseH: 41, pts: [[0, 0], [40, 41]] }), 5 * 0.70711 * 42 / Math.hypot(40, 41), 5 * 0.70711 * 42 / Math.hypot(40, 41), 'square']   // the wall's stretched nib is 0.70711 * 5 * (2, 1): across that run it measures 0.70711 * 5 * (2 * 41 - 40) / the run's length
        ];
        // ROUND FIVE: the width is read along each line AS IT IS DRAWN where the two meet. A stretch of half a run, 20 px, or more is read by its own direction, since the board draws every stretch by itself;
        // a shorter one, a pen's step, by its run. Round four read the door always by its run over 40 px, and the wall by the run that was most like the door's. And the leg of the wall that speaks is the most
        // alike of those within 4 px of the nearest (part (v)). Every width below was worked out by hand before the source was asked (scratch/handoff-tools/mw5/netcheck-probe2.mjs printed no difference), and what
        // round four named was read once from a kept copy of round four's fogcore (netcheck-probe3.mjs). A row's eighth place, where it has one: the DOOR's direction where that is not its first stretch's own
        const SIZED5 = [
            ['a wall that turns 5 px before the door and leans away, resized to twice its width across: the upright leg the door carries on from speaks', RW({ w: 60, h: 75, baseW: 30, baseH: 75, pts: [[0, 0], [0, 45], [30, 75]] }), RD(), 10, 10, '', DOWN],   // FLIPPED: round four heard the leaning leg, which passes the door's end nearer (4.47 px against 5), and named 6.32, as that leg is drawn
            ['a wall with a corner, resized across, whose second stretch is 30 px long: a door that goes ACROSS from its end', RW({ w: 80, h: 30, baseW: 40, baseH: 30, pts: [[0, 0], [40, 0], [40, 30]] }), RD(Object.assign({ x: 280, y: 80 }, SIDEWAYS)), 10, 10, '', DOWN],   // FLIPPED: round four read that stretch with 10 px of the arm before it, the run most like the door's, and named 9.62. A stretch of 30 px is drawn by itself, 10 px thick
            ['a door with a corner 30 px below its start, resized to three times its width across', RW(), RD({ w: 90, h: 30, baseW: 30, baseH: 30, pts: [[0, 0], [0, 30], [30, 30]] }), 5 / 3, 5, '', DOWN],   // FLIPPED: round four read the door's first stretch with 5 px of the next, and named 1.687
            ['the same door with its corner 20 px below its start: half a run is read by itself', RW(), RD({ w: 90, h: 20, baseW: 30, baseH: 20, pts: [[0, 0], [0, 20], [30, 20]] }), 5 / 3, 5, '', DOWN],   // FLIPPED: round four named 1.838
            ['the same door with its corner 19 px below its start: a stretch under half a run is read by its run', RW(), RD({ w: 90, h: 19, baseW: 30, baseH: 19, pts: [[0, 0], [0, 19], [30, 19]] }), 5 / (3 * Math.hypot(10.5 / 3, 19) / Math.hypot(10.5, 19)), 5, '', DOWN, [0, 0, 10.5, 19]],   // as in round four: 19 px down and what lacks to 40, shared before and after, so 10.5 px of the next stretch. A stroke along (10.5, 19) in a box three times as wide across is drawn 3 * |(3.5, 19)| / |(10.5, 19)| times its width
            ['a wall drawn with the flat nib, resized to twice its width across: a door with a corner 30 px below its start', RW({ tip: 'flat', w: 20 }), RD({ w: 30, h: 30, baseW: 30, baseH: 30, pts: [[0, 0], [0, 30], [30, 30]] }), 10, 10 * 0.70711],   // FLIPPED: read straight down the door's own first stretch the two nibs differ by exactly twice, and the flat nib is kept. Round four read 5 px of the next stretch with it, found more than twice, and named the square nib at 6.39
            ['a wall that comes down and steps 10 px sideways onto the door, resized to twice its width across: a step under half a run is read by its run', RW({ x: 190, y: 40, w: 10, h: 60, baseW: 5, baseH: 60, pts: [[0, 0], [0, 60], [5, 60]] }), RD(), 10 * Math.hypot(5, 30) / Math.hypot(10, 30), 10 * Math.hypot(5, 30) / Math.hypot(10, 30), '', [0, 0, 10, 30]],   // as in round four: the last 40 px of the wall, 30 down and 10 across. By the step's own direction, across, it would be 5
            ['the same wall with a step of 20 px: half a run is read by itself', RW({ x: 180, y: 40, w: 20, h: 60, baseW: 10, baseH: 60, pts: [[0, 0], [0, 60], [10, 60]] }), RD(), 5, 5, '', RIGHT],   // FLIPPED: a line that runs across is no thicker for a box twice as wide across. Round four read the step with 20 px of the leg before it and named 7.91
            ['a wall drawn with the flat nib: a door with a corner 30 px below its start, resized to three times its width across', RW({ tip: 'flat' }), RD({ w: 90, h: 30, baseW: 30, baseH: 30, pts: [[0, 0], [0, 30], [30, 30]] }), 5 * 0.70711 / 3, 5 * 0.70711, 'square']   // FLIPPED: straight down the door's own first stretch the wall's ribbon is 3.54 px thick and the door's own nib three times as wide, under half: the square nib at that thickness, a third of it in a box three times as wide. Round four read the ribbon along 5 px of the next stretch too, 2.91 px, and named 0.98
        ];
        const noGeoW = (o, nibToo) => (o ? J(less(o, GEOK.concat(['rot', 'strokeWidth'], nibToo ? ['tip'] : []))) : 'nothing');   // a piece as text but for its id, its geometry, its turn and its stroke width (and its nib, where the press changed it)
        const sizedGot = SIZED.concat(SIZED5).map(row => { const wall = row[1], door = row[2], nib = row[5] || wall.tip, hit = matchAs(door, [wall, door]), was = J([wall, door]), a = wwiS(wall, false) || {}, b = wwiS(door, false) || {}, aN = wwiN(wall, false), bN = wwiN(door, false), run = row[7] || FC.pathSegs(door)[0] || [0, 0, 0, 1];
            const wallRun = wall.tip === 'flat' ? run : row[6];   // where the wall's own pen is read: along its own run where the two meet, and for the flat nib along the door's
            const say = {
                'the press names the width at which the copy is drawn as thick as the wall is drawn where the two meet, and the nib': !!hit && nearN(hit.width, row[3]) && nearN(door.seenWidth, row[3]) && hit.tip === nib && door.seenTip === nib && door.strokeWidth === 9,
                'each leaves at its own number and nib, in its own box': a.strokeWidth === 5 && a.tip === wall.tip && b.strokeWidth === door.seenWidth && typeof b.strokeWidth === 'number' && b.tip === nib,
                'the row names the wall\'s own run for a round or a square nib, and none for the flat one': Array.isArray(wallRun) && (wall.tip === 'flat') === (row[6] === undefined),
                'by the suite\'s own reading the copy is drawn along the door\'s run as thick as the wall is drawn (along its own run where they meet; a flat wall, as its ribbon is along the door\'s run)': nearN(penThick(a, wallRun || run, a.tip), row[4]) && nearN(penThick(b, run, b.tip), row[4]),
                'by fogcore\'s lineFactor the same: the two widths, each times its pen\'s factor, are equal, and are that thickness': nearN(a.strokeWidth * FC.lineFactor(a, wallRun || run, a.tip), b.strokeWidth * FC.lineFactor(b, run, b.tip)) && nearN(b.strokeWidth * FC.lineFactor(b, run, b.tip), row[4]),
                'but for the width, and the nib where the press changed it, the two are the same text': noGeoW(a, !!row[5]) === noGeoW(b, !!row[5]) && (!!row[5] || a.tip === b.tip) && a.id !== b.id && b.sightType === 'wall' && has6(b).length === 0 && !/6b4a2a/i.test(J(b)),
                'with no core at hand they leave as the same two texts': J(aN) === J(a) && J(bN) === J(b),
                'no send changed the host\'s pieces': J([wall, door]) === was
            }, why = Object.keys(say).filter(k => !say[k]);
            return [row[0], why, why.length ? [hit, a, b] : [a.strokeWidth, b.strokeWidth]]; });
        const sizedBad = sizedGot.filter(g => g[1].length), sizedWidths = sizedGot.map(g => g[2]);
        // where rounds three and four part: the slanted wall is drawn 10 / sqrt(2.08) px thick along its OWN run, and its pen would draw 10 px thick straight down, the way the door goes
        const slantDown = penThick(wwiS(SIZED[4][1], false) || { pts: [] }, DOWN, 'round'), slantOwn = penThick(wwiS(SIZED[4][1], false) || { pts: [] }, [0, 0, 60, 40], 'round');
        // where rounds four and five part, first row: the wall's leaning leg, which passes the door's end nearer, is drawn 20 over the root of 10 px thick, 6.32, and its upright leg 10
        const leanThick = penThick(wwiS(SIZED5[0][1], false) || { pts: [] }, [0, 0, 60, 30], 'round');
        // A ratio that is 1 but for rounding is exactly 1. A wall drawn with the flat nib and turned half a turn or a quarter, and a door turned
        // half a turn, none of them resized: the two pens draw alike along the door's run, yet the two factors are worked out by another road
        // and may differ in their last digit. The press names the wall's own 5 to the last digit all the same
        const exactAt = (wallMore, doorMore) => { const wall = RW(Object.assign({ tip: 'flat' }, wallMore)), door = atEnd(wall, RD(doorMore)), hit = matchAs(door, [wall, door]), b = wwiS(door, false) || {}, run = FC.pathSegs(door)[0] || [0, 0, 0, 1];
            return [hit ? hit.width : 'no wall was met', b.strokeWidth, b.tip, FC.lineFactor(wall, run, 'flat') !== FC.lineFactor(door, run, 'flat')]; };
        const exactGot = [exactAt({ rot: 180 }, {}), exactAt({}, { rot: 180 }), exactAt({ rot: 90 }, {})];
        // The reach follows the DRAWN width too: half of each line's width as its pen draws it along its own run. A wall 5 px wide resized to
        // twice its width across is drawn 10 px thick, so a door 9 px wide meets it up to 12 + 4.5 + 5 = 21.5 px off, where the same wall as drawn
        // is met up to 19 px off. A door resized to three times its width across is drawn 27 px thick: it meets a plain wall up to 12 + 13.5 +
        // 2.5 = 28 px off. The nib: a flat nib 9 px wide draws a line straight down 9 * 0.70711 px thick, so a door with the flat
        // nib meets the plain wall up to 12 + 3.18 + 2.5 = 17.68 px off, and a wall 5 px wide with the flat nib is met up to 12 + 4.5 + 1.77 =
        // 18.27 px off. And a wall stretched to twice its LENGTH is no thicker for it: it is met 19 px off and not 20, though the widest reach
        // any stretch of it could have, by the larger of its two scales, would be 21.5.
        // Round four: the wall's half is read along the WALL'S OWN run where the two meet, as its width is. So the wall drawn 10 px thick is
        // met 21 px off and not 22 by a door that goes ACROSS from beside its end too, where round three, which read the wall's pen along the
        // door's run, met it 19 px off and no farther. The width named there is the wall's 10
        const reachAt = (wallMore, doorMore, px) => { const w = RW(wallMore), d = RD(Object.assign({}, doorMore, { y: 100 + px })), hit = matchAs(d, [w, d]); return hit ? Math.round(hit.width * 1000) / 1000 : null; };
        const reachSide = px => { const w = RW({ w: 20 }), d = RD(Object.assign({ x: 200 + px, y: 100 }, SIDEWAYS)), hit = matchAs(d, [w, d]); return hit ? Math.round(hit.width * 1000) / 1000 : null; };   // the door begins px to the right of the wall's last point and runs on to the right
        // A line that was never resized nor turned: the press names the wall's own number to the last digit, whatever angle the two meet at,
        // so the two leave as the same text but for id and geometry (a copy 4.999999999999999 px wide beside walls 5 px wide would be told
        // apart by that number alone). Slanted walls and slanted doors, each as drawn, the door beginning where its wall ends and running
        // another way, once for each nib. Round four's one exception: the flat nib where the wall's ribbon along the door's run would be UNDER
        // A PIXEL. The ribbon of a wall never resized nor turned is 0.70711 of its width times |dx - dy| over the length of the run (dx, dy),
        // since its nib lies down and to the right alike: for a wall 5 px wide that is under a pixel along the first door's run and the
        // fifth's (30 across and 40 down: 0.71 px), the sixth's (along the nib itself: nothing at all) and the seventh's (a hair off it:
        // 0.06 px). Round three sent the copy as its wall's twin there, flat nib and all, and a reviewer measured the browser painting no
        // door at all. Now the copy takes the SQUARE nib, 1 px wide: no twin of its wall, by width and nib, and drawn
        const SLANT = [[[10, 50], [30, 40]], [[30, 40], [13, 29]], [[7, 24], [3, 40]], [[20, 30], [13, 29]], [[13, 29], [30, 40]], [[10, 50], [40, 40]], [[10, 50], [40, 41]]];   // [the wall's run across and down, the door's]; the last two doors run along the flat nib, and a hair off it
        const NIBS3 = ['round', 'square', 'flat'], ribbonOf = d => 5 * 0.70711 * Math.abs(d[1][0] - d[1][1]) / Math.hypot(d[1][0], d[1][1]), SLIVER = SLANT.map(d => ribbonOf(d) < 1);
        const slantGot = NIBS3.map(nib => SLANT.map((d, i) => { const wall = RW({ id: 'sw' + i, tip: nib, w: d[0][0], h: d[0][1], baseW: d[0][0], baseH: d[0][1], pts: [[0, 0], d[0]] }), door = RD({ id: 'sd' + i, tip: nib === 'round' ? 'square' : 'round', x: 200 + d[0][0], y: 50 + d[0][1], w: d[1][0], h: d[1][1], baseW: d[1][0], baseH: d[1][1], pts: [[0, 0], d[1]] });
            const hit = matchAs(door, [wall, door]), a = wwiS(wall, false) || {}, b = wwiS(door, false) || {}, bN = wwiN(door, false) || {}, run = FC.pathSegs(door)[0] || [0, 0, 0, 1];
            return [hit ? hit.width : 'no wall was met', hit ? hit.tip : '', door.seenWidth, a.strokeWidth, b.strokeWidth, bN.strokeWidth, b.tip, noGeo(a) === noGeo(b), noGeoW(a, true) === noGeoW(b, true), nearN(penThick(a, run, a.tip), penThick(b, run, b.tip)), penThick(a, run, a.tip) < 1, nearN(penThick(b, run, b.tip), 1)]; }));
        // [the width answered, the nib answered, the width named, the wall's width on the wire, the copy's, the copy's with no core, the copy's nib, twins, twins but for width and nib, both pens draw equally thick along the door's run, the wall's pen draws under a pixel there, the copy is drawn 1 px thick there]
        const slantWant = (nib, i) => (nib === 'flat' && SLIVER[i] ? [1, 'square', 1, 5, 1, 1, 'square', false, true, false, true, true] : [5, nib, 5, 5, 5, 5, nib, true, true, true, false, false]);
        const slantBad = slantGot.map((per, n) => per.map((g, i) => [i, g]).filter(p => J(p[1]) !== J(slantWant(NIBS3[n], p[0]))));
        const reachGot = [reachAt({}, {}, 19), reachAt({}, {}, 20), reachAt({ w: 20 }, {}, 21), reachAt({ w: 20 }, {}, 22), reachAt({}, { w: 30 }, 28), reachAt({}, { w: 30 }, 29),
            reachAt({}, { tip: 'flat' }, 17), reachAt({}, { tip: 'flat' }, 18), reachAt({ tip: 'flat' }, {}, 18), reachAt({ tip: 'flat' }, {}, 19), reachAt({ y: 0, h: 100 }, {}, 19), reachAt({ y: 0, h: 100 }, {}, 20), reachSide(21), reachSide(22)];
        check('Match a wall, rounds four and five, the width as drawn (the real secretMatch and cleaners as the press uses them, then wireWbItem, run for real with the real fogcore and with none): the board stretches a pen line\'s stroke with its box, so a resized line is drawn thicker or thinner than its number says. For a wall drawn with the round or the square nib the press names the width at which the door\'s copy, in the door\'s own box, is drawn as thick as the wall IS drawn where the two meet, along the leg of the wall that meets the door, where round three named the width the wall\'s pen would draw along the door\'s run. On the wire the wall leaves at its own number and the copy at the number named, so the two widths may differ, by design, and but for the width the two are the same text. What is equal is the copy\'s width times how thick its pen draws along the door\'s run and the wall\'s width times how thick its pen draws along the wall\'s own run: by the suite\'s own reading, from each sent piece\'s own box, turn and nib, and by fogcore\'s lineFactor, which give the same. Held of a wall resized to twice its width across (5 px on the wire, the copy 10); a door resized to three times its width across (the copy five thirds of a pixel, drawn 5); both resized, each its own way (5 and 15, both drawn 7.5 px); a wall and a door resized along their length alone, which changes no thickness (5 and 5); a wall resized across and then turned a quarter with the door along it (15); a wall with a corner resized across, named 10 for a door at the end of its second stretch and for one at its corner, drawn from either end, and 5 for a door across the start of its first. FLIPPED against round three, each to what the wall shows: a slanted wall stretched one way with a door straight down from its end, where the copy is named 6.93, the wall\'s thickness along its own slanted run, and not the 10 px that pen would draw straight down; the wall turned by 30 degrees with the door across, named 15 and not 5 times the root of 3. And three that round three would have named otherwise: a door that goes across from the end of the cornered wall\'s second stretch (10, as that stretch is drawn, not 5), a door that goes straight down from the start of its first (5, not 10), and a door across the end of a wall made twice as long, which is no thicker for it (5, not 10). The leg of the wall that meets the door is read by itself where it is half a run long: a cornered wall whose second stretch is only 20 px long is still named 10 for a door at its end. The nib: a wall drawn with the square nib is a stroke as the round one is (10); the flat nib is a ribbon laid along the diagonal of the line\'s own box and is read along the door\'s run on both, so a flat wall resized to twice its width across is matched by a copy 10 px wide with the flat nib, drawn 7.07 px thick straight down, a nib exactly twice as wide being the most the flat nib is kept for; resized to two and a half times, the copy takes the SQUARE nib at the ribbon\'s 8.84 px; a flat wall as drawn is matched in a door twice as wide across by a flat copy 2.5 px wide, a nib exactly half as wide being the least, and in a door three times as wide across, FLIPPED, by a square copy 1.18 px wide, drawn 3.54 px thick as the wall\'s ribbon is; by a flat copy 7.07 px wide in a door turned by 45 degrees, whose own nib is turned with it; and a flat wall turned by 30 degrees, whose nib is turned with it, FLIPPED, by a square copy 1.29 px wide in a door straight down from its end. Where the door runs along the flat nib of its own box, or a hair off it (40 px across and 41 down), no width makes a ribbon there: the copy takes the square nib at the thickness of the wall\'s ribbon, 2.5 px and 2.59 px, and differs from its wall by width and nib. The door\'s own 9 px never leaves, no send changes a piece of the host\'s, and with no core at hand each pair leaves as the same two texts. A ratio that is 1 but for rounding is exactly 1: a flat wall turned half a turn or a quarter, and a door turned half a turn, give the wall\'s own 5 to the last digit. Two lines never resized nor turned give the wall\'s own number bit for bit whatever angle they meet at: for seven slanted walls, each with a slanted door that runs another way, once with each of the three nibs, the press names 5 and the nib, and the two leave as the same text but for id and geometry, with round four\'s one exception: a flat wall whose ribbon along the door\'s run would be under a pixel, which is so for four of the seven doors (0.71 px, twice; nothing at all along the nib itself; 0.06 px a hair off it). There the copy takes the square nib 1 px wide, is drawn 1 px thick, and is its wall\'s twin but for width and nib, where round three sent a flat twin that painted next to nothing. The reach follows the drawn width too: the wall as drawn is met 19 px off and not 20, the wall drawn 10 px thick is met 21 px off and not 22, and a door drawn 27 px thick meets a plain wall 28 px off and not 29; a door with the flat nib meets it 17 px off and not 18, a wall with the flat nib is met 18 px off and not 19, and a wall stretched to twice its length, no thicker for it, 19 px off and not 20; and, round four, the wall drawn 10 px thick is met 21 px off and not 22 by a door that goes across from beside its end, at the wall\'s 10, since the wall\'s half is read along its own run. ROUND FIVE reads each line AS IT IS DRAWN where the two meet: a stretch of 20 px, half a run, or more by its own direction, a shorter one by its run, the door\'s as the wall\'s; and the leg of the wall that speaks is the most alike of those within 4 px of the nearest. Nine rows, seven of them FLIPPED against round four. A wall that turns 5 px before the door and leans away, resized to twice its width across, is named 10, as the upright leg the door carries on from is drawn, and not the 6.32 of the leaning leg that passes nearer. A cornered wall resized across whose second stretch is 30 px long is named 10 for a door that goes across from its end, not 9.62. A door with a corner 30 px below its start, resized to three times its width across, is named five thirds of a pixel, not 1.687, and with its corner 20 px below alike, not 1.838; with its corner 19 px below, its first stretch is read by its run, 19 px down and 10.5 px of the next, and named 1.873, as in round four. A flat wall resized to twice its width across, met by a door with a corner 30 px below its start, keeps the flat nib at 10, the two nibs differing by exactly twice straight down the door\'s own stretch, where round four named the square nib at 6.39. A wall that steps 10 px sideways onto the door, resized to twice its width across, is read by its run, 30 px down and 10 across, and named 9.62, as in round four; with a step of 20 px it is read by that step and named 5, not 7.91, a line that runs across being no thicker for a box twice as wide across. And a flat wall as drawn, met by that door with its corner 30 px below its start and three times as wide across, is matched by a square copy 1.18 px wide, the wall\'s ribbon straight down the door\'s own stretch, where round four named 0.98. The board\'s own flat nib is pinned: every point moved by 0.70711 of half the width, across and down alike',
            sizedBad.length === 0 && SIZED.length === 24 && J(sizedWidths.map(w => w.map(n => Math.round(n * 1000) / 1000))) === J([[5, 10], [5, 1.667], [5, 15], [5, 5], [5, 6.934], [5, 15], [5, 15], [5, 10], [5, 5], [5, 10], [5, 10], [5, 10], [5, 5], [5, 10], [5, 5], [5, 10], [5, 10], [5, 8.839], [5, 1.179], [5, 2.5], [5, 7.071], [5, 1.294], [5, 2.5], [5, 2.592], [5, 10], [5, 10], [5, 1.667], [5, 1.667], [5, 1.873], [5, 10], [5, 9.618], [5, 5], [5, 1.179]]) && SIZED5.length === 9 && nearN(leanThick, 20 / Math.sqrt(10))
            && nearN(slantOwn, 10 / Math.sqrt(2.08)) && nearN(slantDown, 10) && J(reachGot) === J([5, null, 10, null, 1.667, null, 5, null, 5, null, 5, null, 10, null]) && flatNibPinned
            && Math.abs(leaningSeg[2] - leaningSeg[0]) > 20 && Math.abs(leaningSeg[3] - leaningSeg[1]) > 40 && nearN((leaningSeg[0] - leaningSeg[2]) * Math.sqrt(3), leaningSeg[3] - leaningSeg[1]) && Math.abs(turnedSeg[3] - turnedSeg[1]) < 1e-9 && turnedSeg[2] < turnedSeg[0]
            && exactGot.every(g => g[0] === 5 && g[1] === 5 && g[2] === 'flat') && exactGot.some(g => g[3] === true)
            && SLANT.length === 7 && J(SLIVER) === J([true, false, false, false, true, true, true]) && slantGot.length === 3 && slantGot.every(per => per.length === 7) && slantBad.every(per => per.length === 0),
            J([sizedBad.slice(0, 2), sizedWidths, slantOwn, slantDown, reachGot, exactGot, slantBad.map(per => per.slice(0, 2)), flatNibPinned]));

        // (v) WHICH WALL, as round four has it. Two lines TOUCH where the gap between them is no more than half of each line's drawn width and
        // 4 px (round three: a pixel), and are NEAR where it is no more than those halves and 12 px. Of the walls that are near, in this order.
        // (1) A LOOK that reaches BOTH of the door's ENDS: for each end 2 where a wall of that look touches the END POINT, 1 where one is near
        // it, the two added, and ONLY where the look reaches both ends. Round three added them whatever was reached, so a door that carries on
        // from its own wall and butts on another was handed to the wall it butts on. An end is judged from the end point to the wall's stroke
        // alone: the wall's half and 4 px, or the wall's half and 12 px. A wall reaches no end where it passes the door's MIDDLE about as near
        // as it passes that end, unless the door lies ON it: its two ends and its middle all within the wall's half and ONE pixel. A door whose
        // two ends lie within 12 px of each other has no two ends. Walls of one look are those DRAWN alike: the color in lower case, and the
        // width, the opacity and both scales to a thousandth. (2) A wall that is not ASIDE before one that is: aside is a wall that runs BESIDE
        // the door (it passes both ends and the middle at about one distance) or that passes its MIDDLE clear of both ends (it crosses the
        // door). (3) A wall that runs the door's own way before one across it: the same way is a cosine of 0.86 at the least, which is within
        // 30 degrees, 30 included. (4) A wall the door touches before one it is only near. (5) A wall whose OWN first or last point lies at one
        // of the door's ends before one that passes. (6) The nearer. (7) The first in the map's list. On the wire that is the look the copy
        // leaves in: it is the twin of every wall of the look that answered, and of no other wall here.
        // A door from (200, 100) down to (200, 150), 9 px wide, so its half is 4.5. Looks: a thin inner one (3 px at opacity 0.6), a thick
        // outer one (12 px, square nib), a middling one (7 px), a thin gray one (3 px), a fat one (20 px) and a hairline (1 px). Every scenario
        // is run again with each wall drawn from its other end.
        // FIRST, round three's twenty scenarios, kept as they were, with the answers round four gives. Six of them FLIPPED, each named in
        // FLIPPED3 with what round three answered. THEN round four's own table, where each rank is held by a pair that the next rank would
        // answer otherwise, and each of its numbers from both sides
        // ROUND FIVE (2026-10-12, the last round) keeps the seven ranks and changes what feeds them. An END that lies IN the wall's stroke,
        // within its half and a pixel, is reached whatever the door's middle does. A wall is not ASIDE where the two strokes overlap at
        // the door's two ends and at its middle (the wall's half and the DOOR's). A door has two ends unless they lie within the lesser of
        // 12 px and HALF ITS OWN LENGTH of each other. A wall's run is also read over HALF a run, 20 px, on either side of its stretch.
        // And the pair of stretches that speaks for a wall is the most alike of the pairs within 4 PX of its nearest gap. None of the
        // twenty turned. Round four's own table has five groups that did, and round five has rows of its own after it: each row that
        // turned is named in FLIPPED4 with what round four answered, and is held to differ from that
        await breathe();
        const penAt = (id, pts, look) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), w = Math.max(10, Math.max.apply(null, xs) - x), h = Math.max(10, Math.max.apply(null, ys) - y);   // a line through points of the board as the pen stores one: its box from its least corner, 10 px each way at the least, never resized
            return Object.assign({ id, type: 'path', x, y, w, h, baseW: w, baseH: h, z: 10, pts: pts.map(p => [p[0] - x, p[1] - y]), strokeWidth: 5, tip: 'round', blocksSight: true, sightType: 'wall' }, look); };
        const LX = { color: '#3a4a5a', strokeWidth: 3, opacity: 0.6 }, LY = { color: '#111111', strokeWidth: 12, tip: 'square' }, LZ = { color: '#777777', strokeWidth: 7 }, LTHIN = { color: '#444444', strokeWidth: 3 }, LFAT = { color: '#3a4a5a', strokeWidth: 20 }, L1 = { color: '#555555', strokeWidth: 1 }, LC = { color: '#aabbcc', strokeWidth: 12, tip: 'square' };
        const INNER = ['#3a4a5a', 3, 0.6, 'round'], OUTER = ['#111111', 12, 1, 'square'], ABOVE = ['#777777', 7, 1, 'round'], FAT = ['#3a4a5a', 20, 1, 'round'], THIN = ['#444444', 3, 1, 'round'], HAIR = ['#555555', 1, 1, 'round'], LETTERS = ['#aabbcc', 12, 1, 'square'];
        const DOORLOOK = { color: OAK, strokeWidth: 9, tip: 'square', opacity: 0.8, sightType: 'door', secret: true };
        const wDoor = () => penAt('wd', [[200, 100], [200, 150]], DOORLOOK);
        const wDoor2 = () => penAt('wd', [[200, 100], [200, 125], [200, 150]], DOORLOOK);   // the same door drawn in two stretches: its ends are its first point and its last
        const flip = w => Object.assign(copyOf(w), { pts: copyOf(w.pts).reverse() });   // the same line drawn from its other end
        const lookAsText = w => J([String(w.color).toLowerCase(), drawnW(w.strokeWidth), drawnO(w.opacity), drawnT(w.tip)]);   // a wall's look by the suite's own reading of how a line is drawn
        // [the look the press answered, the copy is the twin of every wall of that look here and of no other wall, with no core it leaves as the same text, with every wall drawn from its other end the answer is the same]
        const whichRun0 = (walls, mkDoor) => { const door = (mkDoor || wDoor)(), hit = matchAs(door, walls.concat([door])), b = wwiS(door, false), bN = wwiN(door, false), got = hit ? [hit.color, hit.width, hit.opacity, hit.tip] : null;
            const twins = walls.filter(w => { const a = wwiS(w, false); return !!a && !!b && noGeo(a) === noGeo(b); }), d2 = (mkDoor || wDoor)(), hit2 = FC.secretMatch(d2, walls.map(flip).concat([d2]));
            return [got, !!hit && twins.length > 0 && twins.every(w => lookAsText(w) === J(got)) && walls.every(w => lookAsText(w) !== J(got) || twins.indexOf(w) >= 0), !!b && J(b) === J(bN), !!hit2 && J([hit2.color, hit2.width, hit2.opacity, hit2.tip]) === J(got)]; };
        const whichRun = (walls, mkDoor) => { try { return whichRun0(walls, mkDoor); } catch (e) { return ['the press threw: ' + String(e && e.message), false, false, false]; } };   // round five: a press that throws is a row that fails, and the checks after it still run
        const yTop = () => penAt('yt', [[100, 100], [300, 100]], LY), yBot = more => Object.assign(penAt('yb', [[100, 150], [300, 150]], LY), more), yMid = () => penAt('ym', [[100, 125], [300, 125]], LY);   // the outer look ACROSS the door: at its top end, at its bottom end, through its middle
        const xAbove = (g, look) => penAt('xu', [[200, 50 - g], [200, 100 - g]], look || LX), xBelow = (g, look, up) => penAt('xd', up ? [[200, 250 + g], [200, 150 + g]] : [[200, 150 + g], [200, 250 + g]], look || LX);   // a wall that runs the door's way, g px short of its top end, or of its bottom end
        const zAbove = g => penAt('zu', [[200, 50 - g], [200, 100 - g]], LZ), zBeside = off => penAt('zb', [[200 + off, 100], [200 + off, 150]], LZ);   // the middling look: above the door, or right beside it along its whole length
        const both = (a, b, mkDoor) => [whichRun(a.concat(b), mkDoor), whichRun(b.concat(a), mkDoor)];
        // a wall drawn by hand, in small steps. hookHand comes straight down to the door's level 6 px to its left and steps sideways onto its top end:
        // its last stretches run ACROSS, and over 40 px of line it runs the door's way. ellHand comes in from the left 24 px above the door and
        // turns down onto its top end in steps of 4 px: over 40 px of line it runs 24 down and 16 across, which is 33.7 degrees off the door's way, while over its last 20 px, half a run, it runs straight down (round five reads the half run too)
        const hookHand = (() => { const pts = []; for (let y = 50; y <= 100; y += 2) pts.push([194, y]); for (let x = 195; x <= 200; x++) pts.push([x, 100]); return penAt('hk', pts, LZ); })();
        const ellHand = (() => { const pts = []; for (let x = 100; x <= 200; x += 4) pts.push([x, 76]); for (let y = 80; y <= 100; y += 4) pts.push([200, y]); return penAt('el', pts, LZ); })();
        const slanted = deg => { const r = deg * Math.PI / 180; return penAt('an', [[200 - 80 * Math.sin(r), 100 - 80 * Math.cos(r)], [200, 100]], LZ); };   // a wall that comes down onto the door's top end, deg degrees off the door's own way
        const whichGot = {
            along: [whichRun([yTop(), xBelow(0)]), whichRun([xBelow(0), yTop()]), whichRun([yTop(), xBelow(0, LX, true)])],   // each touches one end, so the ends say nothing: the one that runs the door's way
            endTouch: both([yTop()], [zAbove(5)]),   // FLIPPED. One wall touches the top end across it, one runs the door's way and ends 5 px short of that end: neither look reaches both ends, and 5 px short is a touch now. The wall that runs the door's way
            endTouch2: both([zAbove(5)], [xBelow(0)]),   // each reaches one end and runs the door's way, each touches and ends there: the nearer
            gap: both([xAbove(10), xBelow(10)], [yMid()]),   // a door in a gap of its wall, each piece 10 px short, and a wall across its middle: the look that reaches both ends
            oneEnd: both([xAbove(10)], [yMid()]),   // one such piece reaches one end, which says nothing: it answers all the same, since the wall across the door's middle is aside
            endTie: both([yTop()], [xAbove(10), xBelow(10)]),   // FLIPPED. The two pieces reach both ends, the wall across the top end reaches one: the pieces
            endTie2: both([yBot()], [xAbove(10), xBelow(10)]),   // FLIPPED, at the door's other end alike
            endNear: [whichRun([yMid(), xAbove(13), xBelow(13)]), whichRun([yMid(), xAbove(14), xBelow(14)]), whichRun([yMid(), xAbove(22, LFAT), xBelow(22, LFAT)]), whichRun([yMid(), xAbove(23, LFAT), xBelow(23, LFAT)])],   // FLIPPED, its second and its fourth: a piece 14 px short reaches no end and is still near the door, and the wall across the middle is aside, so the pieces answer there too. (Round four's own table holds the 13 and the 14 against a wall that is not aside.)
            corridor: both([yTop(), yBot()], [zAbove(0)]),   // a door across a corridor, both ends touched by one look, and a wall that runs the door's way from one end
            twoStretch: [whichRun([yTop(), yBot(), zAbove(0)], wDoor2), whichRun([zAbove(0), yBot(), yTop()], wDoor2)],   // the same corridor and a door drawn in two stretches
            looks: [{ color: '#222222' }, { strokeWidth: 11 }, { opacity: 0.9 }, { tip: 'round' }, { w: 400 }, { h: 20 }].map(more => whichRun([yTop(), yBot(more), zAbove(0)])),   // the far side of the corridor in another look: neither look reaches both ends
            sameLook: [{ strokeWidth: '12' }, { opacity: 1 }, { tip: 'square', name: 'North wall', locked: true }].map(more => whichRun([yTop(), yBot(more), zAbove(0)])),   // ... and in the same look, written otherwise
            beside: [whichRun([yTop(), yBot(), zBeside(7)]), whichRun([zBeside(7), yTop(), yBot()]), whichRun([yTop(), yBot(), zBeside(5)]), whichRun([yTop(), yBot(), zBeside(4)])],   // a wall right beside the door reaches no end: it passes the middle as near as it passes each end. 4 px off, within its half of 3.5 and a pixel, the door lies ON it, and then it reaches both
            touch: both([yMid()], [penAt('zf', [[215, 100], [215, 150]], LTHIN)]),   // FLIPPED. A wall across the door's middle, which the door touches, and one beside it 15 px off, only near. Both are aside, and running the door's way now comes before touching: the one beside it
            alongNear: both([zAbove(11)], [penAt('ta', [[100, 90], [300, 90]], LTHIN)]),   // one that runs the door's way before one across it, though the one across is nearer (both touch the door now, by the 4 px)
            nearer: both([zAbove(11)], [xBelow(10)]),   // both run the door's way, touch it and end at an end of it: the nearer
            first: [whichRun([zAbove(0), xBelow(0)]), whichRun([xBelow(0), zAbove(0)])],   // alike in all of it: the first in the map's list
            hand: [whichRun([yTop(), hookHand]), whichRun([yTop(), ellHand])],   // each answers before the wall across, which is listed first: the hook since it runs the door's way over 40 px of line, the ell since its last 24 px come straight down, so that over half a run it runs the door's way too (round five; in round four it did not, and answered only since its own last point lies at the door's end)
            angle: [whichRun([yTop(), slanted(29)]), whichRun([yTop(), slanted(30)]), whichRun([slanted(30), yTop()])],   // FLIPPED, its second: 30 degrees off is the door's way now, and the slanted wall ends at the door's end besides
            alone: [whichRun([yTop()]), whichRun([zAbove(5)])]
        };
        const asWanted = look => [look, true, true, true];
        const whichWant = { along: [asWanted(INNER), asWanted(INNER), asWanted(INNER)], endTouch: [asWanted(ABOVE), asWanted(ABOVE)], endTouch2: [asWanted(INNER), asWanted(INNER)], gap: [asWanted(INNER), asWanted(INNER)], oneEnd: [asWanted(INNER), asWanted(INNER)], endTie: [asWanted(INNER), asWanted(INNER)], endTie2: [asWanted(INNER), asWanted(INNER)],
            endNear: [asWanted(INNER), asWanted(INNER), asWanted(FAT), asWanted(FAT)], corridor: [asWanted(OUTER), asWanted(OUTER)], twoStretch: [asWanted(OUTER), asWanted(OUTER)], looks: [asWanted(ABOVE), asWanted(ABOVE), asWanted(ABOVE), asWanted(ABOVE), asWanted(ABOVE), asWanted(ABOVE)], sameLook: [asWanted(OUTER), asWanted(OUTER), asWanted(OUTER)],
            beside: [asWanted(OUTER), asWanted(OUTER), asWanted(OUTER), asWanted(ABOVE)], touch: [asWanted(THIN), asWanted(THIN)], alongNear: [asWanted(ABOVE), asWanted(ABOVE)], nearer: [asWanted(INNER), asWanted(INNER)], first: [asWanted(ABOVE), asWanted(INNER)],
            hand: [asWanted(ABOVE), asWanted(ABOVE)], angle: [asWanted(ABOVE), asWanted(ABOVE), asWanted(ABOVE)], alone: [asWanted(OUTER), asWanted(ABOVE)] };
        // what round three answered where round four answers otherwise, as round three's own check held it: [the scenario, its place, round three's look]
        const FLIPPED3 = [['endTouch', 0, OUTER], ['endTouch', 1, OUTER], ['endTie', 0, OUTER], ['endTie', 1, OUTER], ['endTie2', 0, OUTER], ['endTie2', 1, OUTER], ['endNear', 1, OUTER], ['endNear', 3, OUTER], ['touch', 0, OUTER], ['touch', 1, OUTER], ['angle', 1, OUTER]];
        const whichBad = Object.keys(whichWant).filter(k => J(whichGot[k]) !== J(whichWant[k])), flippedBad = FLIPPED3.filter(f => !whichWant[f[0]] || !whichWant[f[0]][f[1]] || J(whichWant[f[0]][f[1]][0]) === J(f[2]) || J((whichGot[f[0]][f[1]] || [])[0]) === J(f[2]));
        check('Match a wall, round four, round three\'s twenty scenarios of which wall a door is matched to, as the wire shows them now (the real secretMatch and cleaners as the press uses them, then wireWbItem, run for real with the real fogcore and with none). The copy leaves as the twin of every wall of the look that answered and of no other wall, with the core and with none, and every answer is the same with each wall drawn from its other end. Six of the twenty FLIPPED in round four, at eleven places, and round five turned none of the twenty. A wall that touches the door\'s top end, across it, no longer answers before a wall that runs the door\'s way and ends 5 px short of that end: neither look reaches both ends, so the ends say nothing, and the wall that runs the door\'s way answers, in either order. A door in a gap of its wall, each piece 10 px short of an end, against a wall across one of its ends, top or bottom: the pieces reach both ends and answer, where round three had the two looks tie and gave it to the wall the door touches. Pieces 14 px short, or 23 px short for a wall 20 px wide, reach no end, yet they are still near the door and the wall across its middle is aside: they answer where round three answered the wall across the middle. A wall across the door\'s middle and one beside it 15 px off: both are aside, and the one beside it, which runs the door\'s way, answers before the one the door touches. And a wall 30 degrees off the door\'s way runs its way now, 30 included, so it answers before a wall across the same end that is listed first. Unchanged: a wall that runs the door\'s way from one end before one across the other; a door in a gap of its wall before a wall across its middle, with both pieces or with one; a door across a corridor matched to the corridor\'s walls and not to a wall that runs the door\'s way from one end, also for a door drawn in two stretches; with the far side of the corridor in another color, another width, another opacity, another nib, or resized along or across, the wall that runs the door\'s way; with the far side in the same look written otherwise, a width as text, an opacity of 1 as a key, or under a name and a lock, the corridor; a wall right beside the door 7 or 5 px off reaches no end, so the corridor answers, and 4 px off the door lies on it, it reaches both and answers; of a wall that runs the door\'s way and one across it, the first; of two that run its way, the nearer; of two alike in all of it, the first in the map\'s list; a wall drawn by hand that steps sideways onto the door\'s end, and one that turns down onto it, each before a wall across that end which is listed first; and a wall alone still answers',
            whichBad.length === 0 && Object.keys(whichGot).length === 20 && J(Object.keys(whichGot)) === J(Object.keys(whichWant)) && FLIPPED3.length === 11 && flippedBad.length === 0,
            J([whichBad.map(k => [k, whichGot[k]]), flippedBad]));

        // Round four's own table. D12 is the wall most scenarios are weighed against: the thin inner look, running the door's way from 12 px
        // below its bottom end. It is near the door and does not touch it (12 is more than its half of 1.5, the door's 4.5 and 4), it runs the
        // door's way, and its own end lies at the door's end (12 is within 1.5 and 12): it reaches one end alone, which says nothing. So a wall
        // at the door's TOP end that touches the door and ends there answers before D12 exactly where it runs the door's way, and after it
        // where it does not: that tells which runs count as the door's way
        // Round five turned five of its groups (onIt, halfOn, besideLast, runs, legs) and adds nine of its own (chord, inStroke, overlap,
        // overlapAll, stub, ringLen, band, armEnd, shortRun). Every answer was worked out by hand before the source was asked
        // (scratch/handoff-tools/mw5/netcheck-probe1.mjs and -probe6.mjs printed no difference), and what round four answered for each row
        // that turned was worked out the same way and then read once from a kept copy of round four's fogcore (netcheck-probe3.mjs, -probe6.mjs)
        await breathe();
        const yTopAt = g => penAt('yt', [[100, 100 - g], [300, 100 - g]], LY), yBotAt = g => penAt('yb', [[100, 150 + g], [300, 150 + g]], LY), crossAt = t => penAt('yc', [[100, 100 + t], [300, 100 + t]], LY);   // the outer look across: g px above the top end, g px below the bottom end, or through the door t px below its top end
        const taAt = y => penAt('ta', [[100, y], [300, y]], LTHIN), D12 = () => xBelow(12), hairAbove = g => penAt('o1', [[200, 50 - g], [200, 100 - g]], L1);
        const ringDoor = () => penAt('wd', [[200, 100], [250, 100], [250, 150], [200, 150], [200, 100]], DOORLOOK);   // a door that closes on itself: a square ring that ends where it began
        const shoeDoor = gap => () => penAt('wd', [[200, 100], [250, 100], [250, 100 + gap], [200, 100 + gap]], DOORLOOK);   // a horseshoe: out, down by gap px, and back, so its two ends lie gap px apart
        const seamWall = () => penAt('sm', [[150, 50], [200, 100]], LY), farSide = () => penAt('fs', [[250, 110], [250, 140]], LZ), topSide = () => penAt('ts', [[215, 100], [245, 100]], LZ), postWall = () => penAt('pw', [[200, 50], [200, 160]], LY);
        const uncut = () => penAt('un', [[200, 20], [200, 230]], LZ);   // a wall the door was drawn over, never cut: the door lies on it
        const bowDoor = () => penAt('wd', [[200, 100], [210, 125], [200, 150]], DOORLOOK), shortDoor = () => penAt('wd', [[200, 100], [200, 130]], DOORLOOK);   // a door that bows 10 px to the right between the same two ends; and a door 30 px long, whose middle lies 15 px from each end
        const zBelow = g => penAt('zd', [[200, 150 + g], [200, 250 + g]], LZ), halfLow = () => penAt('hl', [[200, 125], [200, 250]], LZ), halfHigh = () => penAt('hh', [[200, 0], [200, 125]], LZ);   // the middling look below the door; and over the door from its middle down, or from its middle up
        const sideWall = () => penAt('sw', [[100, 106], [186.25, 106]], LZ), endAcrossLow = g => penAt('eb', [[100, 150], [200 - g, 150]], LZ);   // in from the left, ending 13.75 px to the left of the door and 6 px below its top end; and across at the bottom end's level, ending g px to its left
        const stubAcross = () => penAt('sb', [[100, 88], [200, 88]], LTHIN), endAcross = g => penAt('ea', [[100, 100], [200 - g, 100]], LZ);   // across, ending 12 px above the door's top end; across at the top end's own level, ending g px to its left
        const cTop = () => penAt('ct', [[100, 100], [300, 100]], LC), cBot = more => Object.assign(penAt('cb', [[100, 150], [300, 150]], LC), more);   // a corridor in a color that has letters
        // an ell drawn by hand: in from the left, then down onto the door's top end in steps of 1 px. Over 40 px of line its run is leg down and 40 less leg across
        const ell1 = leg => { const pts = []; for (let x = 100; x <= 200; x += 4) pts.push([x, 100 - leg]); for (let y = 100 - leg + 1; y <= 100; y++) pts.push([200, y]); return penAt('e1', pts, LZ); };
        const ellCorner = leg => penAt('ec', [[100, 100 - leg], [200, 100 - leg], [200, 100]], LZ);   // the same ell with points at its corners alone, as a file, a generator or Build's Wall line lays one: its last stretch is its whole leg
        const cornerHand = (() => { const pts = []; for (let y = 50; y <= 100; y += 2) pts.push([200, y]); for (let x = 202; x <= 260; x += 2) pts.push([x, 100]); return penAt('ch', pts, LZ); })();   // drawn by hand: down onto the door's top end, and on to the right from there. It turns its corner right at the meeting place
        // round five's own pieces. The door is 9 px wide, so its half is 4.5; the middling look is 7 px wide, so its half is 3.5: an end is IN that wall's stroke within 4.5 px, and the two strokes overlap within 8 px
        const halfLowAt = off => penAt('hl', [[200 + off, 125], [200 + off, 250]], LZ), halfHighAt = off => penAt('hh', [[200 + off, 0], [200 + off, 125]], LZ);   // the middling look along the door's lower half, off px to the right of the door's own line; and along its upper half
        const bowWall = bow => penAt('bw', [[200, 60], [200, 100], [200 + bow, 125], [200, 150], [200, 190]], LZ);   // a wall that passes through both of the door's ends and bows bow px away under its middle: the wall of a round room, the door its chord. Its bowed legs pass the door's middle 250 * bow / the leg's length off: 9.28 px for a bow of 10, 12.86 for one of 15
        const bowAwayDoor = () => penAt('wd', [[200, 100], [196, 125], [200, 150]], DOORLOOK);   // a door that bows 4 px to the LEFT between the same two ends
        const slantLow = () => penAt('sl', [[211, 90], [204, 160]], LZ), slantHigh = () => penAt('sh', [[204, 90], [211, 160]], LZ);   // beside the door on a slant: 9.95 px from its top end, 7.46 from its middle and 4.98 from its bottom end (700, 525 and 350 over the wall's length of 70.36); and the same the other way up
        const veeDoor = apex => () => penAt('wd', [[200, 100], apex, [200, 2 * apex[1] - 100]], DOORLOOK);   // a door bent like a V on its side: out to its apex and back, its two ends one above the other
        const stubDoor = len => () => penAt('wd', [[200, 100], [200, 100 + len]], DOORLOOK), yAt = y => penAt('yb', [[100, y], [300, y]], LY), lineBeside = () => penAt('zs', [[208, 50], [208, 200]], LTHIN);   // a straight door len px long; the outer look across at any height; and a thin line 8 px beside the door's own line
        const yWall = c => penAt('yw', [[200, 20], [200, 100 - c], [260, 160 - c]], LZ);   // a wall that comes down the door's own line, turns c px before the door's top end and leans away at 45 degrees: the leaning leg passes that end c over the root of 2 px off, nearer than the upright leg's c
        const shortWall = len => penAt('sw', [[200, 100 - len], [200, 100]], LZ);   // a wall len px long that runs the door's way onto its top end
        const lowStub = () => penAt('ls', [[100, 150], [200, 150]], LY);   // the outer look across at the bottom end's level, ending AT the door's bottom end: it touches the door and its own end lies there
        const which4Got = {
            // (1) the ends, only where one look reaches both
            gapNear: both([xAbove(11), xBelow(11)], [slanted(20)]),   // a door in a gap of its wall, each piece 11 px short: near both ends, touching neither (11 is more than 1.5, 4.5 and 4). Against a wall that comes onto the top end 20 degrees off the door's way, which touches the door, runs its way and ends there: the look that reaches both ends
            oneEnd: both([xAbove(11)], [slanted(20)]),   // one such piece reaches one end, and that says nothing: the wall that touches the door answers
            tJoint: both([zAbove(5)], [yBot()]).concat(both([zAbove(11)], [yBot()]), both([zAbove(13)], [yBot()]), both([zAbove(20)], [yBot()]), both([zAbove(21)], [yBot()])),   // the review's first finding: a door that carries on from its own wall, which ends 5, 11, 13 or 20 px short of it, and butts on another wall across its far end. Its own wall answers at each, and 21 px short it is no longer near the door (20 is its half of 3.5, the door's 4.5 and 12)
            endTouchPx: [whichRun([yTop(), yBot(), xAbove(5), xBelow(5)]), whichRun([yTop(), yBot(), xAbove(5), xBelow(6)]), whichRun([yTop(), yBot(), xAbove(6), xBelow(5)])],   // an end is TOUCHED within the wall's half and 4 px, 5.5 for the thin look: pieces 5 px short touch both ends, tie with the corridor at four, and answer since they run the door's way. With one piece 6 px short they score three, and the corridor answers
            endNearPx: [whichRun([yTopAt(18), yBotAt(18), xAbove(13), xBelow(13)]), whichRun([yTopAt(18), yBotAt(18), xAbove(14), xBelow(13)]), whichRun([yTopAt(18), yBotAt(18), xAbove(13), xBelow(14)]), whichRun([yTopAt(18), yBotAt(18), xAbove(22, LFAT), xBelow(22, LFAT)]), whichRun([yTopAt(18), yBotAt(18), xAbove(23, LFAT), xBelow(22, LFAT)]),
                whichRun([yTopAt(18), yBotAt(18), zAbove(0)]), whichRun([yTopAt(18), yBotAt(19), zAbove(0)]), whichRun([yTopAt(19), yBotAt(18), zAbove(0)])],   // an end is NEAR within the wall's half and 12 px. The corridor's walls 18 px off each end are near both (6 and 12). Pieces 13 px short are near both too (1.5 and 12) and answer; with either 14 px short they reach one end, and the corridor answers. The fat look alike at 22 and 23 (10 and 12). And the corridor's own walls: 19 px off either end, the corridor reaches one, and the wall that runs the door's way answers
            lookNums: [{ strokeWidth: 12.0004 }, { strokeWidth: 12.0006 }, { opacity: 0.9996 }, { opacity: 0.9994 }, { w: 200.05 }, { w: 200.2 }, { h: 10.004 }, { h: 10.006 }].map(more => whichRun([yTop(), yBot(more), zAbove(0)])),   // a look's numbers to a thousandth: the far side of the corridor at a width, an opacity or a scale that rounds to the near side's is the same look, and one that does not is another (a wall 200 px long made 200.05 is scaled by 1.00025, made 200.2 by 1.001)
            lookCase: [whichRun([cTop(), cBot({ color: '#AABBCC' }), zAbove(0)]), whichRun([cTop(), cBot({ color: '#AaBbCc' }), zAbove(0)]), whichRun([cTop(), cBot({ color: '#aabbcd' }), zAbove(0)])],   // ... and its color in lower case: a file's capitals are the same look, another color is not
            ring: both([seamWall()], [farSide()], ringDoor),   // a door that closes on itself has no two ends: a wall that touches its seam does not reach both, and the wall that lies along its far side answers
            shoe: [whichRun([postWall(), topSide()], shoeDoor(12)), whichRun([topSide(), postWall()], shoeDoor(12)), whichRun([postWall(), topSide()], shoeDoor(13)), whichRun([topSide(), postWall()], shoeDoor(13))],   // two ends are two places where they lie MORE than 12 px apart. A horseshoe whose ends are 12 px apart, a post through both ends, and a wall along its first side: the wall along it. With the ends 13 px apart the post reaches both ends and answers
            onIt: [whichRun([yTop(), yBot(), uncut()]), whichRun([uncut(), yTop(), yBot()]), whichRun([yTop(), yBot(), uncut()], bowDoor), whichRun([uncut(), yTop(), yBot()], bowDoor)],   // a door drawn over an uncut wall lies ON it: that wall reaches both ends and runs the door's way, so it answers before the corridor. FLIPPED, its third and fourth: a door that bows 10 px off that wall between its two ends still has both ends IN the wall's stroke, and round five asks no more than that: the wall reaches both, ties with the corridor at four, and answers since it runs the door's way. (Round four asked the middle too, 10 px off, and gave the corridor.)
            halfOn: [whichRun([yTop(), yBot(), zAbove(0), halfLow()]), whichRun([yTop(), yBot(), zBelow(0), halfHigh()])],   // FLIPPED, both. A wall that covers the door from its middle down passes the middle as near as the bottom end, yet the bottom end lies IN its stroke and is reached all the same. With a wall of its look at the top end that look reaches both ends, ties with the corridor and answers, since both its walls run the door's way; and the same from the middle up. (Round four: the end was not reached, and the corridor answered.)
            besideEnds: [whichRun([yTop(), yBot(), zBeside(7), zBelow(0)]), whichRun([yTop(), yBot(), zBeside(7), zAbove(0)])],   // a wall beside the door reaches NEITHER end, each by itself: with a wall of its look that touches the bottom end, or the top end, that look still reaches one end alone, and the corridor answers
            pastReach: [whichRun([xAbove(0), sideWall(), zBelow(0)]), whichRun([zBelow(0), sideWall(), xAbove(0)])],   // a wall passes the middle only where its gap to the middle is within the widest reach, 20 px for the middling look: a wall that comes in from the left and ends 15 px from the top end and 23.5 px from the middle is near that end, and with a wall of its look at the bottom end the look reaches both, and answers before a wall that touches the top end and is listed first
            // (2) a wall that is not aside before one that is
            besideLast: both([zBeside(7)], [yTop()]).concat(both([zAbove(5)], [penAt('z8', [[208, 100], [208, 150]], LTHIN)])),   // FLIPPED, its first pair. A wall right beside the door 7 px off reaches neither end, but its stroke and the door's overlap (7 is within 3.5 and 4.5) at both ends and at the middle, so it is not aside: it runs the door's way and answers before a wall across the door's top end, which reaches one end alone. (Round four put it last, and the review found a door drawn over an uncut wall a few pixels off its line handed to a wall that butts on one of its ends.) Its second pair stands: a door that carries on from its wall is not handed to a line 8 px beside it, 3 px wide, since 8 is more than 1.5 and 4.5 and that line is aside
            crossLast: both([yMid()], [taAt(88)]).concat(both([crossAt(18.4)], [taAt(88)]), both([crossAt(18.6)], [taAt(88)]), both([crossAt(31.4)], [taAt(88)]), both([crossAt(31.6)], [taAt(88)])),   // a wall the door crosses at its middle comes after a wall 12 px above its top end that is only near. A crossing is aside where it lies 12 px nearer the middle than either end: the door's ends are 25 px from its middle, so from 18.5 px below the top end to 18.5 px above the bottom one. 18.4 px below the top is not aside and answers, 18.6 is; 31.4 is, 31.6 is not
            shortCross: both([crossAt(12)], [taAt(88)], shortDoor).concat(both([crossAt(11)], [taAt(88)], shortDoor), both([crossAt(18)], [taAt(88)], shortDoor), both([crossAt(19)], [taAt(88)], shortDoor)),   // the 12 px are half the way from an end to the middle where that is less: a door 30 px long has 7.5. A crossing 12 px below its top end lies 3 px from its middle, and is aside (12 is 3 and 7.5 at the least); 11 px below is not (11 is less than 4 and 7.5). From the bottom end alike: 18 px below the top is aside, 19 is not
            // (3) the door's way before across, (4) a touch before near, (5) an end at the door's end before one that passes, (6) the nearer
            alongFirst: both([zAbove(13)], [yTop()]),   // runs the door's way and is only near (13 is more than 3.5, 4.5 and 4), before across and touching
            touchFirst: both([yTop()], [stubAcross()]),   // both across: the one the door touches, which passes its end, before one that is only near and ends at it
            endsAtFirst: both([yTop()], [endAcross(5)]).concat(both([taAt(88)], [endAcross(15)]), both([taAt(88)], [endAcross(16)]), both([yBot()], [endAcrossLow(5)])),   // both across, both touched: the one whose own end lies 5 px from the door's end before the one that passes it, though that one is nearer. An end lies AT the door's end within the wall's half and 12 px, 15.5 for the middling look: 15 px off it does, and answers before a nearer wall that passes; 16 px off it does not, and the nearer answers. And at the door's bottom end alike
            touchPx: both([zAbove(12)], [xBelow(11)]).concat(both([zAbove(13)], [xBelow(11)]), both([xBelow(10)], [hairAbove(9.5)]), both([xBelow(11)], [hairAbove(9.5)])),   // two lines TOUCH within their halves and 4 px. The middling look 12 px short touches (3.5, 4.5 and 4) and answers before a nearer wall 11 px short that does not (1.5, 4.5 and 4 are 10); 13 px short it does not touch either, and the nearer answers. The thin look 10 px short touches and answers before a hairline 9.5 px short that does not (0.5, 4.5 and 4 are 9); 11 px short it does not, and the nearer hairline answers
            // (3) which runs are the door's way
            degrees: both([slanted(29)], [D12()]).concat(both([slanted(30)], [D12()]), both([slanted(31)], [D12()])),   // 29 and 30 degrees off are the door's way (the cosine of 30 degrees is 0.866), 31 is not (0.857)
            runs: both([hookHand], [D12()]).concat(both([ell1(26)], [D12()]), both([ell1(25)], [D12()]), both([ell1(13)], [D12()]), both([ell1(12)], [D12()]), both([cornerHand], [D12()])),   // a run is read over 40 px of LINE, and since round five over HALF a run too, 20 px, on either side of the wall's stretch, the most alike counting. The hook, whose last 6 px step sideways, runs the door's way. An ell drawn by hand whose last 26 px come down runs it. FLIPPED: so does one whose last 25 px do, or only its last 13: over its last 20 px it runs 13 down and 7 across, a cosine of 0.88. With 12 down and 8 across, 0.83: not. (Round four read 40 px alone: 25 down and 15 across, 0.857, was not the door's way.) And a wall that turns its corner right at the door's end is read on either side of the meeting place: the leg that runs the door's way counts
            legs: both([ellCorner(50)], [D12()]).concat(both([ellCorner(20)], [D12()]), both([ellCorner(19)], [D12()]), both([ellCorner(13)], [D12()]), both([ellCorner(12)], [D12()]), both([ellCorner(3)], [D12()])),   // the same ell with points at its corners alone. A leg of one 50 px cell is its own run, and so is one of 20 px, half a run. FLIPPED: a last leg of 19 px, or of 13, runs the door's way too, read with what lacks to 20 px of the arm before it (1 across and 19 down; 7 across and 13 down), exactly as the ell drawn by hand is; one of 12 px does not (8 across and 12 down); and one of 3 px says nothing of the way the wall runs. (Round four: 19 px was read with 21 px of the arm, 48 degrees off.)
            // ---- round five's own rows ----
            chord: both([yTop(), yBot()], [bowWall(10)]).concat(both([yTop(), yBot()], [bowWall(15)])),   // AN END IN THE STROKE IS REACHED, the other way round: a straight door whose two ends lie on a wall that bows away under its middle, as the wall of a round room does. FLIPPED, its first pair: bowed 10 px, the wall passes the door's middle 9.3 px off, which is about as near as it passes the ends (within the margin of 12), and round four denied it both ends. Both lie in its stroke: it reaches both, ties with the corridor and answers, since its upright legs run the door's way. Bowed 15 px it passes the middle 12.9 px off, and round four gave it the ends too
            inStroke: [4, 4.5, 5].reduce((all, off) => all.concat([whichRun([yTop(), yBot(), zAbove(0), halfLowAt(off)]), whichRun([yTop(), yBot(), zBelow(0), halfHighAt(off)])]), []),   // IN the stroke is within the wall's half and ONE pixel, 4.5 px for the middling look, held from both sides for either end: the wall along the door's lower half, or its upper half, 4 or 4.5 px to the side of the door's own line still reaches the end beside it (FLIPPED: round four denied it), and 5 px to the side it passes the middle as near as that end and does not: its look reaches one end alone and the corridor answers
            overlap: both([zBeside(8)], [yTop()]).concat(both([zBeside(8.5)], [yTop()]), both([zBeside(9)], [yTop()])),   // NOT ASIDE WHERE THE STROKES OVERLAP, from both sides: the two halves are 3.5 and 4.5, so 8 px beside the door the wall is still not aside and answers (FLIPPED), and 8.5 or 9 px beside it is aside, as any wall beside the door was in round four, and the wall across the top end answers
            overlapAll: both([zBeside(6)], [yTop()], bowAwayDoor).concat(both([slantLow()], [yTop()]), both([slantHigh()], [yBot()])),   // ... and the strokes must overlap at the door's two ends AND at its middle. A wall 6 px beside the ends of a door that bows 4 px away from it lies 10 px off the door's middle; a wall on a slant lies 9.95 px off the top end though 4.98 off the bottom one and 7.46 off the middle; and the same the other way up. Each is aside, and the wall across an end answers
            stub: both([yTop(), yAt(108)], [lineBeside()], stubDoor(8)).concat(both([yTop(), yAt(112)], [lineBeside()], stubDoor(12)), both([yTop(), yAt(113)], [lineBeside()], stubDoor(13))),   // A RING BY ITS LENGTH. A straight door 8 px long, or 12, across a narrow corridor, with a thin line 8 px beside it: its ends lie 8 or 12 px apart, more than half its length, so it has two ends, the corridor reaches both and answers. FLIPPED, both: round four took every door whose ends lie within 12 px for a ring, so the ends said nothing, nothing was aside, and the line beside the door answered since it runs the door's way. 13 px long, the corridor in both rounds
            ringLen: both([zAbove(0)], [postWall()], veeDoor([210, 105])).concat(both([zAbove(0)], [postWall()], veeDoor([209, 106]))),   // ... and a bent door. A V whose ends lie 10 px apart is 22.36 px long: 10 is within half of that, so it is a ring, its ends say nothing, and a post that passes through both does not answer by them: the wall that ends at its first end does, by rank five. FLIPPED, the second pair: a V whose ends lie 12 px apart is 21.63 px long, and 12 is more than half of that: two ends, and the post that reaches both answers. (Round four: within 12 px, a ring.)
            band: both([yWall(5)], [D12()]).concat(both([yWall(13)], [D12()]), both([yWall(14)], [D12()])),   // THE PAIR THAT SPEAKS is the most alike of the pairs within 4 PX of the wall's nearest gap. The wall turns 5 px before the door: its leaning leg passes the door's end 3.54 px off, its upright leg 5. FLIPPED: 5 is within 4 px of 3.54, the upright leg speaks, the wall runs the door's way and answers before D12. (Round four heard only the pairs within a pixel SQUARED of the nearest: the leaning leg, 45 degrees off.) From both sides: turned 13 px before the door (13 against 9.19) the upright leg still speaks (FLIPPED); 14 px before (14 against 9.90) it does not, and D12 answers
            armEnd: both([ell1(16)], [lowStub()]).concat(both([ell1(24)], [lowStub()])),   // the review's own shape for the half run: an ell drawn by hand whose last 16 or 24 px run into the door's top end, and a wall of another look that ends at the door's bottom end at a right angle. Both touch, each has its own end at an end of the door, neither look reaches both ends. The ell runs the door's way over its last 20 px and answers in either order of the list. FLIPPED where the ell is listed SECOND: in round four neither ran the door's way, the two were tied on every rank and on the gap, and the map's list decided
            shortRun: both([shortWall(15)], [D12()])   // a wall shorter than half a run has no side that counts: it is read around its one stretch, runs the door's way, and answers
        };
        const which4Want = { gapNear: [INNER, INNER], oneEnd: [ABOVE, ABOVE], tJoint: [ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, OUTER, OUTER], endTouchPx: [INNER, OUTER, OUTER], endNearPx: [INNER, OUTER, OUTER, FAT, OUTER, OUTER, ABOVE, ABOVE],
            lookNums: [OUTER, ABOVE, OUTER, ABOVE, OUTER, ABOVE, OUTER, ABOVE], lookCase: [LETTERS, LETTERS, ABOVE], ring: [ABOVE, ABOVE], shoe: [ABOVE, ABOVE, OUTER, OUTER], onIt: [ABOVE, ABOVE, ABOVE, ABOVE], halfOn: [ABOVE, ABOVE], besideEnds: [OUTER, OUTER], pastReach: [ABOVE, ABOVE],
            besideLast: [ABOVE, ABOVE, ABOVE, ABOVE], crossLast: [THIN, THIN, OUTER, OUTER, THIN, THIN, THIN, THIN, OUTER, OUTER], shortCross: [THIN, THIN, OUTER, OUTER, THIN, THIN, OUTER, OUTER],
            alongFirst: [ABOVE, ABOVE], touchFirst: [OUTER, OUTER], endsAtFirst: [ABOVE, ABOVE, ABOVE, ABOVE, THIN, THIN, ABOVE, ABOVE], touchPx: [ABOVE, ABOVE, INNER, INNER, INNER, INNER, HAIR, HAIR],
            degrees: [ABOVE, ABOVE, ABOVE, ABOVE, INNER, INNER], runs: [ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, INNER, INNER, ABOVE, ABOVE], legs: [ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, ABOVE, INNER, INNER, INNER, INNER],
            chord: [ABOVE, ABOVE, ABOVE, ABOVE], inStroke: [ABOVE, ABOVE, ABOVE, ABOVE, OUTER, OUTER], overlap: [ABOVE, ABOVE, OUTER, OUTER, OUTER, OUTER], overlapAll: [OUTER, OUTER, OUTER, OUTER, OUTER, OUTER], stub: [OUTER, OUTER, OUTER, OUTER, OUTER, OUTER], ringLen: [ABOVE, ABOVE, OUTER, OUTER],
            band: [ABOVE, ABOVE, ABOVE, ABOVE, INNER, INNER], armEnd: [ABOVE, ABOVE, ABOVE, ABOVE], shortRun: [ABOVE, ABOVE] };
        const which4Bad = Object.keys(which4Want).filter(k => J(which4Got[k]) !== J(which4Want[k].map(asWanted))), which4Count = Object.keys(which4Got).reduce((n, k) => n + which4Got[k].length, 0);
        // what round four answered where round five answers otherwise: [the group, its place, round four's look]. For round four's own groups, as its own check held them; for round five's own rows, as round four's rule gives them
        const FLIPPED4 = [['onIt', 2, OUTER], ['onIt', 3, OUTER], ['halfOn', 0, OUTER], ['halfOn', 1, OUTER], ['besideLast', 0, OUTER], ['besideLast', 1, OUTER], ['runs', 4, INNER], ['runs', 5, INNER], ['runs', 6, INNER], ['runs', 7, INNER], ['legs', 4, INNER], ['legs', 5, INNER], ['legs', 6, INNER], ['legs', 7, INNER],
            ['chord', 0, OUTER], ['chord', 1, OUTER], ['inStroke', 0, OUTER], ['inStroke', 1, OUTER], ['inStroke', 2, OUTER], ['inStroke', 3, OUTER], ['overlap', 0, OUTER], ['overlap', 1, OUTER], ['stub', 0, THIN], ['stub', 1, THIN], ['stub', 2, THIN], ['stub', 3, THIN], ['ringLen', 2, ABOVE], ['ringLen', 3, ABOVE], ['band', 0, INNER], ['band', 1, INNER], ['band', 2, INNER], ['band', 3, INNER], ['armEnd', 1, OUTER], ['armEnd', 3, OUTER]];
        const flipped4Bad = FLIPPED4.filter(f => !which4Want[f[0]] || !which4Want[f[0]][f[1]] || J(which4Want[f[0]][f[1]]) === J(f[2]) || J(((which4Got[f[0]] || [])[f[1]] || [])[0]) === J(f[2]));
        // ONE SHAPE, ONE ANSWER. Round four's suite reported an ell that answered by how many points it has: its last leg ran the door's way from 26 px drawn by hand, and from 20 px with points at its corners alone. With the half run both are read alike. For every
        // last leg from 6 to 30 px, the ell drawn by hand and the same ell with corner points, each weighed against D12 in both orders: the door's way from 13 px on, and not below, for both
        const shapeGot = []; for (let leg = 6; leg <= 30; leg++) shapeGot.push([leg, both([ell1(leg)], [D12()]), both([ellCorner(leg)], [D12()])]);
        const shapeBad = shapeGot.filter(g => J(g[1].concat(g[2])) !== J([0, 1, 2, 3].map(() => asWanted(g[0] >= 13 ? ABOVE : INNER))));
        check('Match a wall, round five, which wall a door is matched to, rank by rank, as the wire shows it (the real secretMatch and cleaners as the press uses them, then wireWbItem, run for real with the real fogcore and with none). In each of 168 runs, and of 100 more over the ells, the copy leaves as the twin of every wall of the look that answered and of no other wall, with the core and with none, the answer is the same with each wall drawn from its other end, and the press throws nothing. Round four\'s table stands but where a row is marked FLIPPED, thirty-four of them, each held to differ from what round four answered. FIRST the ends, and only where one look reaches both. A door in a gap of its wall, each piece 11 px short of an end, near both and touching neither, is matched to that wall and not to a wall that comes onto its top end 20 degrees off its way, which touches it, runs its way and ends there; one such piece alone reaches one end, which says nothing, and the wall that touches the door answers. A door that carries on from its own wall and butts on another across its far end is matched to its own wall, whether that wall ends 5, 11, 13 or 20 px short of it; 21 px short the wall is no longer near, and the other answers. An end is touched within the wall\'s half and 4 px: pieces of a wall 3 px wide that end 5 px short of both ends tie with the walls of a corridor that touch both, and answer since they run the door\'s way; with either piece 6 px short the corridor answers. An end is near within the wall\'s half and 12 px: against a corridor whose walls stand 18 px off both ends, pieces 13 px short of both answer, and with either 14 px short the corridor does; a wall 20 px wide alike at 22 and 23; and with either wall of the corridor 19 px off, the wall that runs the door\'s way from its top end answers. Walls of one look are those drawn alike, each number to a thousandth and the color in lower case: the far side of a corridor 12.0004 px wide, at opacity 0.9996, or scaled by 1.00025 or 1.0004 is the near side\'s look, and at 12.0006, 0.9994, 1.001 or 1.0006 another; a file\'s capitals in a hex color are the same look, and another color is not. A door that closes on itself has no two ends: a wall that touches its seam does not answer before the wall that lies along its far side. A horseshoe door whose ends are 12 px apart is matched to the wall along its first side, and one whose ends are 13 px apart to the post that passes through both. ROUND FIVE, A RING BY ITS LENGTH: a door has two ends unless they lie within the lesser of 12 px and half its own length of each other. FLIPPED: a straight door 8 px long, or 12, across a narrow corridor, with a thin line 8 px beside it, has two ends and is matched to the corridor, where round four took it for a ring and gave it to the line; 13 px long alike, in both rounds. A door bent like a V whose ends lie 10 px apart, within half its 22.4 px, is a ring: a post through both its ends does not answer by them, and the wall that ends at its first end does; FLIPPED, one whose ends lie 12 px apart, more than half its 21.6 px, has two, and the post answers. A door drawn over an uncut wall lies on it, and that wall reaches both its ends and answers before a corridor\'s walls. ROUND FIVE, AN END THAT LIES IN THE WALL\'S STROKE, within its half and a pixel, IS REACHED WHATEVER THE DOOR\'S MIDDLE DOES. FLIPPED: a door that bows 10 px off that wall between its ends is matched to it all the same; so is a straight door over a wall that bows 10 px away under its middle, the wall of a round room (bowed 15 px, in both rounds); and a wall that covers the door only from its middle down, or from its middle up, reaches the end that lies on it, so that with a wall of its look at the other end that look reaches both and answers before the corridor. The pixel from both sides: such a wall 4 or 4.5 px to the side of the door\'s own line reaches that end, its half being 3.5, and 5 px to the side it does not, and the corridor answers. A wall right beside the door reaches neither end, each by itself: with a wall of its look at one end, top or bottom, that look still reaches one end alone, and the corridor answers. And a wall passes the middle only within the widest reach: one that comes in from the side and ends 15 px from the top end and 23.5 px from the middle is near that end, and with a wall of its look at the bottom end that look reaches both and answers. SECOND a wall that is not aside. ROUND FIVE, A WALL IS NOT ASIDE WHERE THE TWO STROKES OVERLAP at the door\'s two ends and at its middle, within the wall\'s half and the door\'s. FLIPPED: a wall right beside the door 7 px off, 7 px wide beside a door 9 px wide, runs the door\'s way and answers before a wall across the door\'s top end, where round four put it last; 8 px off, the two halves together, alike; 8.5 and 9 px off the strokes no longer overlap, the wall is aside, and the wall across the end answers. The strokes must overlap at all three places: a wall 6 px beside the ends of a door that bows 4 px away from it, a wall on a slant from 5 px off the bottom end to 10 px off the top, and one slanted the other way are aside. A door that carries on from its wall is not handed to a line 8 px beside it, 3 px wide; and a wall that the door crosses at its middle comes after a wall 12 px above its top end that is only near. A crossing is aside from 18.5 px below the top end to 18.5 px above the bottom end of this door, and not at 18.4 or at 31.6; on a door 30 px long, where the margin is half the way from an end to the middle, 7.5 px, a crossing 12 px from either end is aside and one 11 px from it is not. THIRD a wall that runs the door\'s way before one across it, though the one across touches and it is only near. FOURTH a wall the door touches before one it is only near, though that one ends at the door\'s end: two lines touch within their halves and 4 px, held from both sides for a wall 7 px wide (12 px and not 13) and for one 3 px wide (10 px and not 11), each against a nearer wall that does not touch. FIFTH a wall whose own end lies at the door\'s end, top or bottom, before one that passes it, though that one is nearer: within the wall\'s half and 12 px, 15 px off and not 16. Then the nearer. And which runs are the door\'s way, each weighed against a wall that runs the door\'s way from 12 px below it: a wall 29 or 30 degrees off the door\'s way runs its way, and one 31 degrees off does not. A run is read over 40 px of line and, ROUND FIVE, A WALL\'S RUN ALSO OVER HALF A RUN, 20 px, on either side of its stretch, the most alike counting: a wall drawn by hand that steps sideways onto the door\'s end over its last 6 px runs the door\'s way; an ell drawn by hand runs it where its last 26 px come down and, FLIPPED, where its last 25 do, or only its last 13 (13 down and 7 across over 20 px, a cosine of 0.88), and not where its last 12 do (0.83); and a wall that turns its corner right at the door\'s end is read by the leg that runs the door\'s way. With points at its corners alone the same ell answers the same: a last leg of one 50 px cell and one of 20 px run the door\'s way, FLIPPED so do one of 19 px and one of 13, one of 12 does not, and one of 3 px says nothing of the way the wall runs. ONE SHAPE, ONE ANSWER: for every last leg from 6 to 30 px the ell drawn by hand and the ell with corner points answer alike, the door\'s way from 13 px on, where round four parted them (26 px by hand, 20 with corner points). The review\'s own shape: an ell drawn by hand whose last 16 or 24 px run into the door\'s top end, against a wall of another look that ends at the door\'s bottom end at a right angle, answers in either order of the map\'s list, FLIPPED where the ell is listed second, since round four found the two tied on every rank and the gap and let the list decide. A wall only 15 px long, shorter than half a run, is read around its one stretch and runs the door\'s way. ROUND FIVE, THE PAIR THAT SPEAKS for a wall is the most alike of the pairs within 4 px of its nearest gap. FLIPPED: a wall that comes down the door\'s own line, turns 5 px before the door and leans away at 45 degrees passes the door\'s end nearer by its leaning leg, 3.5 px, than by its upright one, 5 px; the upright leg speaks, the wall runs the door\'s way and answers before the wall 12 px below the door, where round four heard the leaning leg alone. From both sides: turned 13 px before the door (13 px against 9.2) the upright leg still speaks, and 14 px before (14 against 9.9) it does not, and the wall below answers. DECIDED in round five and held as they are, never the opposite: an end is on a wall within the wall\'s half and ONE pixel, so a door drawn over an uncut wall farther off than that, with a corridor of another look at both its ends, is answered by the corridor (the twenty hold it at 5 and 7 px); beyond the overlap of the two strokes a wall beside the door is aside; and walls tied on every rank and the gap are decided by the map\'s list',
            which4Bad.length === 0 && Object.keys(which4Got).length === 32 && J(Object.keys(which4Got)) === J(Object.keys(which4Want)) && which4Count === 168 && FLIPPED4.length === 34 && flipped4Bad.length === 0 && shapeGot.length === 25 && shapeBad.length === 0,
            J([which4Bad.map(k => [k, which4Got[k]]), flipped4Bad, shapeBad.slice(0, 3)]));

        // (vi) A CLEAR COLOR, AS THE BOARD'S OWN RULE READS THE VERY TEXT (round five). The press answers the word transparent for a wall
        // whose color draws nothing, and a secret door whose OWN color draws nothing, with nothing named for it, stays clear. Round two read
        // a blank beside the word as clear, and any rgba or hsla whose LAST part is 0, such as rgba(255,0,0), which is plain red. Round three
        // read neither as clear, for any piece. Round four told a LINE from every other piece where the text has blanks around it, and read
        // the text without its blanks for those. Round five asks the board's own rule for a color (safecore.js cssColor; the suite's reading
        // of it, boardTakes, clearForm and drawsNothing, stands at the top of this part). A text that rule TAKES is clear where it is the word
        // in any case, a hex color whose alpha is 0, or a LOWER-case rgba / hsla of four parts whose last is 0. A text it REFUSES is no
        // color at all to the board: a RECTANGLE and a CIRCLE then get no fill and draw nothing, so they are clear, whatever the text; a
        // LINE and a FILLED REGION are drawn in ink, and a HEXAGON and a DIAMOND show their own ground, so those four are not (round four
        // sent a hexagon, a diamond and a region as nothing drawn where the GM's board shows a piece, and a rectangle whose refused color
        // is no clear one without its blanks as a brick box where the board shows nothing). The press reads a wall LINE's color, so a
        // refused text is never clear there.
        // Three lists, each text placed by hand (scratch/handoff-tools/mw5/netcheck-probe4.mjs printed no difference), with the suite's
        // reading and the board's own rule held to them
        await breathe();
        const SCr = await import(urlS('safecore.js')), boardSays = c => typeof c === 'string' && SCr.cssColor(c, null) === c;   // the board's own rule, asked whether it takes the very text
        const LONG40 = 'rgba(0,0,0,' + ' '.repeat(27) + '0)', LONG41 = 'rgba(0,0,0,' + ' '.repeat(28) + '0)';   // a clear color of exactly 40 characters, the most the rule takes, and the same of 41
        const REFUSED = [' transparent ', 'transparent ', ' transparent', 'transparent\n', '\ttransparent', ' rgba(0, 0, 0, 0) ', ' #0000', '#12345600 ', 'RGBA(0, 0, 0, 0)', 'RGBA( 1, 2, 3, 0 )', 'Rgba(0,0,0,0)', 'HSLA(0, 0%, 0%, 0)', '', ' ', ' #ff0000 ', ' red', 'RGB(140, 123, 90)', LONG41,
            'transparenttransparent', '#12', '#123456789', '#0g00', 'transparent;', 'trans parent', 'rgba(0,0,0,0)x', 'rgba(0,0,0,-0)', 'rgba(0 0 0 / 0)', 'var(--ink) ', 'var(ink)', 'url(#x)'];
        const TAKEN_CLEAR = ['Transparent', 'TRANSPARENT', 'tRaNsPaReNt', 'rgba(0, 0, 0, 0)', 'rgba(255,0,0,0)', 'rgba(255, 0, 0, 0.0)', 'rgba( 1, 2, 3, 0 )', 'rgba(0%,0%,0%,0.000)', 'hsla(0, 0%, 0%, 0)', '#0000', '#ABC0', '#12345600', '#abcDEF00', LONG40];
        const TAKEN_DRAWN = ['rgba(255,0,0)', 'rgba(255, 0, 0)', 'rgba(0,0,0)', 'hsla(0, 0%, 0%)', 'rgba(0,0)', 'rgba(0)', 'rgba(1,2,3,4,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,1)', 'rgba(0,0,0,00)', 'rgba(0,0,0,0.)', 'rgba(0,0,0,.0)', 'rgba(0,0,0,0%)', 'rgb(0, 0, 0, 0)', 'hsl(0, 0%, 0%, 0)',
            '#0001', '#12345601', '#00000', '#000', '#0000000', 'rgb(1, 2, 3)', 'var(--ink)', 'DarkRed', 'red', '#ABC', 'transparen', 'transparentt'];
        const NOTEXT = [undefined, null, 7, true, ['transparent']];   // no color key, and a color that is no text
        const listsHeld = [REFUSED.filter(c => boardTakes(c) || boardSays(c)), TAKEN_CLEAR.concat(['transparent']).filter(c => !(boardTakes(c) && boardSays(c) && clearForm(c))), TAKEN_DRAWN.filter(c => !(boardTakes(c) && boardSays(c) && !clearForm(c)))];   // each list, less what the reading or the board's rule would place elsewhere: three empty lists
        // THE PRESS, on a wall LINE: [the color answered, the color named on the door, the wall's color on the wire, the copy's, its width, its opacity, its nib, with no core the same text, on a clone the same text, the door's own color]
        const clearRun = (c, named) => { const wall = RW({ id: 'cw', color: c, opacity: 0.55 }), door = RD({ id: 'cd' }); if (named) door.seenColor = named; const hit = matchAs(door, [wall, door]), a = wwiS(wall, false) || {}, b = wwiS(door, false) || {}, bN = wwiN(door, false) || {};
            return [hit ? hit.color : 'no wall was met', ownK(door, 'seenColor') ? door.seenColor : NONE, a.color, b.color, b.strokeWidth, ownK(b, 'opacity') ? b.opacity : 'solid', b.tip, J(b) === J(bN), J(b) === J(wwiS(copyOf(door), true)), door.color]; };
        const NOT_PRESS = REFUSED.concat(TAKEN_DRAWN), IS_PRESS = ['transparent'].concat(TAKEN_CLEAR);
        const notClearBad = NOT_PRESS.filter(c => J(clearRun(c)) !== J([null, NONE, c, WALLC, 5, 0.55, 'round', true, true, OAK]) || J(clearRun(c, '#112233')) !== J([null, '#112233', c, '#112233', 5, 0.55, 'round', true, true, OAK]));
        const isClearBad = IS_PRESS.filter(c => J(clearRun(c)) !== J(['transparent', 'transparent', c, 'transparent', 5, 0.55, 'round', true, true, OAK]) || J(clearRun(c, '#112233')) !== J(['transparent', 'transparent', c, 'transparent', 5, 0.55, 'round', true, true, OAK]));
        // A SECRET DOOR'S OWN COLOR, with nothing named for it, for each of six kinds of piece: a line, a rectangle, a circle, a hexagon, a diamond and a filled region (which is no line).
        // [as it leaves with the core, as it leaves with none], each as [its color, its pattern], sent alone and handed over as a clone alike.
        // THE FALLBACK, STATED, and decided so in round five: with no core at hand net.js reads the plain word transparent alone as clear, for every kind of piece. The app never runs
        // without its fog core, and a wall is the safe thing to send where nothing can be judged
        const KINDS6 = ['line', 'rect', 'circle', 'hexagon', 'diamond', 'region'], DOORF = { blocksSight: true, sightType: 'door', secret: true };
        const ownDoor = (kind, c, more) => { const o = kind === 'line' ? RD({ id: 'oc' }) : kind === 'region' ? Object.assign({ id: 'og' }, LINE, { tip: 'fill', pts: TRI }, DOORF) : Object.assign({ id: 'ob', type: kind, x: 0, y: 0, w: 50, h: 50 }, DOORF); if (c === undefined) delete o.color; else o.color = c; return Object.assign(o, more); };
        const ownLook = (kind, c, more) => [wwiS, wwiN].map(wire => { const o = wire(ownDoor(kind, c, more), false) || {}, o2 = wire(ownDoor(kind, c, more), true) || {}; return J(o) === J(o2) && has6(o).length === 0 && o.sightType === 'wall' ? [o.color, ownK(o, 'texture') ? o.texture : NONE] : ['alone and as a clone it left as two things, with a key, or as no wall']; });
        const DRAWN = [WALLC, NONE], BRICK = [WALLC, 'bricks'], GLASS = ['transparent', NONE];   // a line in the Wall material's color (a line wears no pattern, and the fallback names none for any piece); a piece in the Wall material's look; and nothing drawn
        // said outright, list by list: what each kind of piece leaves as, [with the core, with none]
        const SAID = {
            refused: { line: [DRAWN, DRAWN], rect: [GLASS, DRAWN], circle: [GLASS, DRAWN], hexagon: [BRICK, DRAWN], diamond: [BRICK, DRAWN], region: [BRICK, DRAWN] },
            spelled: { line: [GLASS, DRAWN], rect: [GLASS, DRAWN], circle: [GLASS, DRAWN], hexagon: [GLASS, DRAWN], diamond: [GLASS, DRAWN], region: [GLASS, DRAWN] },
            draws: { line: [DRAWN, DRAWN], rect: [BRICK, DRAWN], circle: [BRICK, DRAWN], hexagon: [BRICK, DRAWN], diamond: [BRICK, DRAWN], region: [BRICK, DRAWN] },
            word: { line: [GLASS, GLASS], rect: [GLASS, GLASS], circle: [GLASS, GLASS], hexagon: [GLASS, GLASS], diamond: [GLASS, GLASS], region: [GLASS, GLASS] } };
        const ownBadOf = (list, said) => list.reduce((all, c) => all.concat(KINDS6.filter(k => J(ownLook(k, c)) !== J(said[k])).map(k => [String(c), k, ownLook(k, c)])), []);
        const ownBad = ownBadOf(REFUSED, SAID.refused).concat(ownBadOf(TAKEN_CLEAR, SAID.spelled), ownBadOf(TAKEN_DRAWN.concat(NOTEXT), SAID.draws), ownBadOf(['transparent'], SAID.word));
        // ... and by the suite's reading, which gives the same for every text and kind
        const readWant = (k, c) => [drawsNothing(c, k === 'line' || k === 'region' ? 'path' : k) ? GLASS : k === 'line' ? DRAWN : BRICK, c === 'transparent' ? GLASS : DRAWN];
        const readBad = REFUSED.concat(TAKEN_CLEAR, TAKEN_DRAWN, NOTEXT, ['transparent']).reduce((all, c) => all.concat(KINDS6.filter(k => J(ownLook(k, c)) !== J(readWant(k, c))).map(k => [String(c), k])), []);
        // Where round five answers otherwise than round four did, each held to differ: [the text, the kind, what round four's copy was with the core]. (Read once from a kept copy of round four's fogcore: netcheck-probe4.mjs)
        const FLIPPEDC = [[' transparent ', 'region', GLASS], [' transparent ', 'hexagon', GLASS], [' transparent ', 'diamond', GLASS], [' #0000', 'region', GLASS], [' red', 'rect', BRICK], ['', 'rect', BRICK], ['RGB(140, 123, 90)', 'circle', BRICK], [' #ff0000 ', 'circle', BRICK], ['RGBA(0, 0, 0, 0)', 'line', GLASS], ['RGBA(0, 0, 0, 0)', 'hexagon', GLASS]];
        const flippedCBad = FLIPPEDC.filter(f => J(ownLook(f[1], f[0])[0]) === J(f[2]));
        // A refused color makes a rectangle or a circle clear only while the door has no pattern and no picture of its own and nothing is named for it, as the plain word does (part (1)): with a pattern or a
        // picture of its own the Wall material's look; with a color named, that color over bricks; with a pattern named, the Wall material's color under it; and with Plain color named, still clear
        const WORN = [[{ texture: 'planks' }, BRICK], [{ texSrc: PIC, texTile: 1 }, BRICK], [{ seenColor: '#112233' }, ['#112233', 'bricks']], [{ seenTexture: 'stone' }, [WALLC, 'stone']], [{ seenTexture: '' }, GLASS]];
        const wornBad = [' transparent', '', 'RGBA(0, 0, 0, 0)'].reduce((all, c) => all.concat(['rect', 'circle'].reduce((per, k) => per.concat(WORN.filter(r => J(ownLook(k, c, r[0])[0]) !== J(r[1])).map(r => [c, k, r[0], ownLook(k, c, r[0])[0]])), [])), []);
        // ... and over 2,500 seeded texts made of the pieces a color is written with. The reading takes exactly the texts the board's own rule takes; and the wire leaves a secret door of each kind
        // clear exactly where the reading says its own color draws nothing, with no core only for the plain word
        let seedC = 20261015; const rndC = n => { seedC = (Math.imul(seedC, 1103515245) + 12345) >>> 0; return Math.floor((seedC >>> 8) / 16777216 * n); }, pickC = list => list[rndC(list.length)];
        const PARTC = ['0', '0', '0', '255', '0.0', '0.00', '0.5', '1', '0%', '50%', ' 0', '0 ', ' 0 ', '.0', '0.', '00', '', ' '], PADC = ['', '', '', '', '', '', '', '', '', '', '', '', ' ', '\t', '\n', ';', 'x'], HEXC = '0123456789abcdefABCDEFg'.split('');
        const textC = () => { const k = rndC(8); let t;
            if (k === 0) t = pickC(['transparent', 'transparent', 'Transparent', 'TRANSPARENT', 'transparen', 'red', 'DarkRed', 'a'.repeat(1 + rndC(24))]);
            else if (k <= 2) { const n = 2 + rndC(8); t = '#'; for (let i = 0; i < n; i++) t += i >= n - 2 && rndC(3) ? '0' : pickC(HEXC); }
            else if (k <= 5) { const n = 2 + rndC(4), parts = []; for (let i = 0; i < n; i++) parts.push(i === n - 1 && rndC(2) ? pickC(['0', '0', ' 0 ', '0.0', '0.000']) : pickC(PARTC)); t = pickC(['rgba', 'rgba', 'rgba', 'hsla', 'hsla', 'rgb', 'hsl', 'RGBA', 'Rgba', 'HSLA']) + '(' + parts.join(pickC([',', ',', ',', ', '])) + ')'; }
            else if (k === 6) t = 'var(--' + pickC(['ink', 'wall-1', 'a_b', '', 'x y']) + ')';
            else t = 'rgba(0,0,0,' + ' '.repeat(20 + rndC(12)) + '0)';   // 33 to 44 characters: both sides of the 40 the rule takes
            return pickC(PADC) + t + pickC(PADC); };
        const seedTal = { n: 0, taken: 0, refused: 0, form: 0, long: 0, word: 0, glass: { line: 0, rect: 0, circle: 0, hexagon: 0, diamond: 0, region: 0 } }, seedBad = [];
        for (let i = 0; i < 2500; i++) { const c = textC(), takes = boardTakes(c); seedTal.n++; if (takes) { seedTal.taken++; if (clearForm(c)) seedTal.form++; } else seedTal.refused++; if (c.length > 40) seedTal.long++; if (c === 'transparent') seedTal.word++;
            if (takes !== boardSays(c)) seedBad.push([c, 'the reading and the board\'s own rule part', takes]);
            KINDS6.forEach(k => { const got = ownLook(k, c), want = readWant(k, c); if (J(want[0]) === J(GLASS)) seedTal.glass[k]++; if (J(got) !== J(want)) seedBad.push([c, k, got]); });
            if (i % 250 === 249) await breathe(); }
        const SG = seedTal.glass;
        // A rectangle that is clear by a refused color is the twin of a see-through wall box whose color is the plain word, and of no wall whose color a file wrote with the blanks: that wall leaves
        // with its color as written, so on the wire the two still differ by that text, though both draw nothing. A limit the suite's heading names (a clear color spelled otherwise than the word)
        const glassWall = c => ({ id: 'gw', type: 'rect', x: 0, y: 0, w: 50, h: 50, color: c, blocksSight: true, sightType: 'wall' }), glassDoor = wwiS({ id: 'ob', type: 'rect', x: 0, y: 0, w: 50, h: 50, color: ' transparent ', blocksSight: true, sightType: 'door', secret: true }, false);
        const glassTwin = [noGeo(glassDoor) === noGeo(wwiS(glassWall('transparent'), false)), noGeo(glassDoor) === noGeo(wwiS(glassWall(' transparent '), false)), (wwiS(glassWall(' transparent '), false) || {}).color];
        check('Match a wall, round five, a clear color as the board\'s own rule reads the very text (the real secretMatch and cleaners as the press uses them, then wireWbItem, run for real with the real fogcore and with none). Three lists of texts, each placed by hand, with the suite\'s reading and the board\'s own rule (safecore cssColor) held to them. Thirty that the rule REFUSES: the word transparent with a blank before it, after it or both, with a line break or a tab; another clear spelling with a blank beside it; RGBA, Rgba or HSLA with a capital; an empty text and a blank; a color with a blank beside it that is no clear one; RGB in capitals; a clear color of 41 characters; 22 letters; a hex color of two or of nine digits or with a letter that is no hex digit; a semicolon after the word, a blank inside it, a letter after the bracket, a minus sign, a slash; var( followed by a blank or with no two hyphens; an address. Fourteen that it takes and that draw NOTHING: the word in any case, a lower-case rgba or hsla of four parts whose last is 0, 0.0 or 0.000, with blanks inside or percent signs, a hex color of four or of eight digits whose alpha is 0, its letters in either case, and a clear color of exactly 40 characters. Twenty-seven that it takes and that DRAW: an rgba or hsla of fewer or more than four parts, rgba(255,0,0) among them; an alpha of 0.5 or 1; a hex color whose alpha is not 0, or of three, five or seven digits; a color as rgb(; a theme\'s color; a color word; the word less a letter or with one more. THE PRESS reads a wall LINE: for every refused text and every text that draws it answers no color and names none on the door, so the copy leaves in the Wall material\'s color, or in the color named for the door before the press, never as nothing drawn, with its width, opacity and nib matched to the wall and the wall itself in its color as written; for the plain word and each of the fourteen it answers the word transparent, names it on the door over a color named before, and the copy leaves as nothing drawn; with no core at hand each copy leaves as the same text. FLIPPED against round four: RGBA( 1, 2, 3, 0 ) in capitals, which the board refuses and strokes in ink, is no longer matched as clear. A SECRET DOOR\'S OWN COLOR, with nothing named for it, for six kinds of piece, sent alone and as a clone, with the core and with none. A refused text leaves a RECTANGLE and a CIRCLE CLEAR, with no pattern, since the board gives them no fill at all, whether or not the text is a clear color without its blanks (FLIPPED for a red with a blank before it, an empty text and RGB in capitals, where round four sent the Wall material\'s look); it leaves a door drawn as a LINE in the Wall material\'s color, and a HEXAGON, a DIAMOND and a FILLED REGION in that color under its bricks (FLIPPED where the text is a clear color without its blanks or in capitals: round four sent nothing drawn, where the board shows a hexagon and a diamond on their own ground and a region in ink; and a line in RGBA in capitals, which round four read as clear). A text the rule takes that draws nothing leaves all six clear. A text it takes that draws, and a color that is no text at all (no key, null, a number, a truth value, a list that holds the word), leave the line in the Wall material\'s color and the other five in its bricks. The plain word leaves all six clear. A refused color clears a rectangle or a circle only while the door has no pattern and no picture of its own and nothing is named for it: with either of its own it leaves in the Wall material\'s look, with a color named in that color over bricks, with a pattern named in the Wall material\'s color under it, and with Plain color named still clear. THE FALLBACK, stated as it is and decided so: with no core at hand only the plain word is read as clear, for every kind of piece, and every other text leaves in the Wall material\'s color with no pattern. LIMITS, stated and not hidden: an alpha written 00, 0. or .0 or as 0%, and rgb( or hsl( with a fourth part of 0, are not read as clear, though a browser may draw nothing for some of them; the players are then sent a wall where the GM may see none. The suite\'s reading gives what the lists say for every text and kind. And over 2,500 seeded texts made of the pieces a color is written with (the word and its neighbors, runs of letters, hex colors of two to nine digits, the four names with and without a capital and two to five parts of every form, var(, a clear color of 33 to 44 characters, and a blank, a tab, a line break, a semicolon or a letter before or after): the reading takes exactly the texts the board\'s own rule takes, and the wire leaves a secret door of each of the six kinds clear exactly where the reading says its own color draws nothing, and with no core only for the plain word. A rectangle that is clear by a refused color is the twin of a see-through wall box whose color is the plain word; a wall whose color was written with the blanks leaves with them, and so has no twin',
            listsHeld.every(l => l.length === 0) && REFUSED.length === 30 && TAKEN_CLEAR.length === 14 && TAKEN_DRAWN.length === 27 && LONG40.length === 40 && LONG41.length === 41 && notClearBad.length === 0 && isClearBad.length === 0 && ownBad.length === 0 && readBad.length === 0 && FLIPPEDC.length === 10 && flippedCBad.length === 0 && wornBad.length === 0
            && seedBad.length === 0 && seedTal.n === 2500 && seedTal.taken >= 700 && seedTal.refused >= 1300 && seedTal.form >= 200 && seedTal.long >= 80 && seedTal.word >= 25 && SG.rect === SG.circle && SG.hexagon === SG.diamond && SG.hexagon === SG.region && SG.hexagon === SG.line && SG.rect === seedTal.refused + seedTal.form && SG.line === seedTal.form
            && J(glassTwin) === J([true, false, ' transparent ']),
            J([listsHeld, notClearBad.map(c => [c, clearRun(c), clearRun(c, '#112233')]).slice(0, 3), isClearBad.map(c => [c, clearRun(c)]).slice(0, 3), ownBad.slice(0, 4), readBad.slice(0, 4), flippedCBad, wornBad.slice(0, 4), seedBad.slice(0, 4), seedTal, glassTwin]));
    }

    // ---- (3) a player's app: whatever a host sends, none of the three keys is kept ----
    const lineU = k => { const i = src.indexOf(k); if (i < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, src.indexOf('\n', i)); };
    const hmA = src.indexOf('function cleanHostMap(m) {'), hmB = src.indexOf('\n}\n', hmA) + 2;
    const hostSide = win => new Function('window', 'cleanWaitingItem', 'sanitizeRichText', 'safeColor', '"use strict";\n' + lineU('function cleanHostWbItem(w) {') + '\n' + lineU('function cleanHostLight(w) {') + '\n' + src.slice(hmA, hmB) + '\nreturn { cleanHostWbItem, cleanHostMap };')(win, H.cleanWaitingItem, t => 'T:' + String(t).length, v => (v === '#123456' ? v : ''));
    const hostile = () => [
        D('hsA', Object.assign({ name: 'Door' }, STRAY)),   // a secret door sent raw, as no honest host sends one
        Object.assign({ id: 'hsB' }, BOX, { blocksSight: true, sightType: 'wall', secret: true, name: 'Wall' }),
        Object.assign({ id: 'hsC' }, BOX, { secret: 'yes', seenColor: 'url(//x.test/c)', seenTexture: '<img src=x onerror=alert(1)>' }),
        Object.assign({ id: 'hsD' }, BOX, { secret: { a: 1 }, seenColor: 7, seenTexture: ['bricks'] }),
        Object.assign({ id: 'hsE' }, BOX, { secret: false }), Object.assign({ id: 'hsF' }, BOX, { seenColor: null }), Object.assign({ id: 'hsG' }, BOX, { seenTexture: '' }),
        Object.assign({ id: 'hsH', type: 'image', isChar: true, ownerId: 'u_me', x: 1, y: 2, secret: true }, STRAY),
        Object.assign({ id: 'hsI' }, LINE, { blocksSight: true, sightType: 'door', secret: true, seenTexture: 'stone' }),
        { id: 'hsJ', type: 'text', text: '<b>hi</b>', x: 1, y: 2, secret: true, seenColor: '#112233' }
    ];
    const hsWant = hostile().map(p => { const o = less(p, KEYS3); if (o.type === 'text') o.text = 'T:' + String(o.text).length; return flat(o); });
    const cleaned = [{ wpFogCore: FC }, {}, { wpFogCore: {} }].map(win => { const C = hostSide(win), ins = hostile(), outs = ins.map(w => C.cleanHostWbItem(w)), map = C.cleanHostMap({ id: 'mH', type: 'map', whiteboard: hostile() }); return { same: outs.every((o, i) => o === ins[i]), outs, map }; });
    const wantFor = n => (n === 0 ? hsWant : hostile().map(p => { const o = less(p, KEYS3.concat(['texture', 'texSrc', 'texTile', 'height'])); if (o.type === 'text') o.text = 'T:' + String(o.text).length; return flat(o); }));   // with no cleaner on hand a pattern, a picture and a height do not come in either
    const plainS = Object.assign({ id: 'hsP' }, BOX, { blocksSight: true, sightType: 'door', doorOpen: true }), plainWas = J(plainS), plainOut = hostSide({ wpFogCore: FC }).cleanHostWbItem(plainS);
    const waitOut = hostSide({ wpFogCore: FC }).cleanHostWbItem(Object.assign({ id: 'hsW', waiting: 1, ownerId: 'u_a', type: 'circle', x: 1, y: 2, secret: true }, STRAY));
    check('map builder B5, a player\'s app (cleanHostWbItem and a whole map through cleanHostMap, run for real): whatever a host sends, the tick and both keys of the look are dropped and the piece is kept, the same piece with everything else on it as it was: a secret door sent raw, a wall, a plain piece, a token of the player\'s own, a line and a text box, the keys as true, a text, an address, markup, a number, a list, an object, false, null or an empty text, with the real fogcore, with none and with an empty one; a piece that carries none of them is the same piece with no key added, and a waiting token comes in without them',
        cleaned.every((c, n) => c.same && J(c.outs.map(flat)) === J(wantFor(n)) && J(c.map.whiteboard.map(flat)) === J(wantFor(n)) && c.map.whiteboard.length === 10 && c.outs.every(o => has3(o).length === 0) && !/"secret"|seenColor|seenTexture/.test(J([c.outs, c.map])))
        && cleaned[0].outs[0].sightType === 'door' && cleaned[0].outs[0].doorOpen === true && cleaned[0].outs[0].texture === 'planks' && plainOut === plainS && J(plainS) === plainWas && !!waitOut && waitOut.waiting === 1 && has3(waitOut).length === 0,
        J([cleaned.map((c, n) => [c.same, J(c.outs.map(flat)) === J(wantFor(n)), J(c.map.whiteboard.map(flat)) === J(wantFor(n))]), cleaned[0].outs[0], waitOut]));
    // Match a wall: the width, the opacity and the nib a Match press names are the GM's too, so a player's app drops them whatever a host sends,
    // with the tick and the two keys of the look. The three as values their cleaners keep, as texts, as an object, a list and markup, as 0 and
    // an empty text, as null, as false, and as a number past every bound: all three on a piece, and each ALONE on a piece
    const SEENV = [[7.125, 0.4375, 'flat'], ['9', '0.5', 'Round'], [{ a: 1 }, [0.5], '<img src=x onerror=alert(1)>'], [0, 0, ''], [null, null, null], [false, false, false], [1e300, -5, 'fill']];
    const hostileM = () => SEENV.map((v, i) => Object.assign({ id: 'hmD' + i }, LINE, { blocksSight: true, sightType: 'door', color: OAK, secret: true, seenColor: '#112233', seenWidth: v[0], seenOpacity: v[1], seenTip: v[2] }))   // a matched secret door sent raw, as no honest host sends one
        .concat(SEENV.map((v, i) => Object.assign({ id: 'hmW' + i }, LINE, { blocksSight: true, sightType: 'wall', seenWidth: v[0], seenOpacity: v[1], seenTip: v[2] })))   // a wall line
        .concat(SEENV.map((v, i) => Object.assign({ id: 'hmP' + i }, BOX, { name: 'Rug', seenWidth: v[0], seenOpacity: v[1], seenTip: v[2] })))   // a plain piece
        .concat([{ id: 'hmT', type: 'image', isChar: true, ownerId: 'u_me', x: 1, y: 2, seenWidth: 5, seenOpacity: 0.5, seenTip: 'square' }, { id: 'hmX', type: 'text', text: '<b>hi</b>', x: 1, y: 2, seenWidth: 5, seenOpacity: 0.5, seenTip: 'square' }])   // a token of the player's own, and a text box
        .concat(KEYSW.reduce((all, k, n) => all.concat([5, '5', 0, '', null, false].map((v, i) => { const p = Object.assign({ id: 'hm1_' + n + '_' + i }, i % 2 ? LINE : BOX, i % 2 ? { blocksSight: true, sightType: 'wall' } : {}); p[k] = v; return p; })), []));   // each key alone, on a box and on a wall line
    const hmWant = hostileM().map(p => { const o = less(p, KEYS6); if (o.type === 'text') o.text = 'T:' + String(o.text).length; return flat(o); });
    const cleanedM = [{ wpFogCore: FC }, {}, { wpFogCore: {} }].map(win => { const C = hostSide(win), ins = hostileM(), outs = ins.map(w => C.cleanHostWbItem(w)), map = C.cleanHostMap({ id: 'mHM', type: 'map', whiteboard: hostileM() }); return { same: outs.every((o, i) => o === ins[i]), outs, map }; });
    const waitM = hostSide({ wpFogCore: FC }).cleanHostWbItem({ id: 'hmQ', waiting: 1, ownerId: 'u_a', type: 'circle', x: 1, y: 2, seenWidth: 5, seenOpacity: 0.5, seenTip: 'flat' });
    check('Match a wall, a player\'s app (cleanHostWbItem and a whole map through cleanHostMap, run for real): whatever a host sends, the width, the opacity and the nib named for a secret door are dropped, with the tick and the two keys of the look, and the piece is kept, the same piece with everything else on it as it was, its own width and nib among it. Held of a matched secret door sent raw, of a wall line and of a plain piece, each with the three keys as values their cleaners keep, as texts, as an object, a list and markup, as 0 and an empty text, as null, as false and as a number past every bound; of a token of the player\'s own and a text box; and of each of the three ALONE on a box and on a wall line, as a number, a text, 0, an empty text, null and false. With the real fogcore, with none and with an empty one, alone and on a whole map. A waiting token comes in without them',
        cleanedM.every(c => c.same && J(c.outs.map(flat)) === J(hmWant) && J(c.map.whiteboard.map(flat)) === J(hmWant) && c.map.whiteboard.length === 41 && c.outs.every(o => has6(o).length === 0) && c.map.whiteboard.every(o => has6(o).length === 0) && !SIXWORDS.test(J([c.outs, c.map])))
        && hostileM().length === 41 && hostileM().every(p => KEYSW.some(k => ownK(p, k))) && KEYSW.every(k => hostileM().filter(p => has6(p).length === 1 && ownK(p, k)).length === 6)
        && cleanedM[0].outs[0].sightType === 'door' && cleanedM[0].outs[0].strokeWidth === 6 && cleanedM[0].outs[0].tip === 'square' && cleanedM[0].outs[0].color === OAK && !!waitM && waitM.waiting === 1 && has6(waitM).length === 0,
        J([cleanedM.map(c => [c.same, J(c.outs.map(flat)) === J(hmWant), J(c.map.whiteboard.map(flat)) === J(hmWant), c.outs.map((o, i) => [hostileM()[i].id, has6(o)]).filter(r => r[1].length)]), waitM]));

    // ---- (4) the door request branch: a secret door answers as the wall the players hold there would ----
    const drSrc = between('// [netcheck:doorreq-start]', '// [netcheck:doorreq-end]', 'doorreq'), moveModeS = new Function(lineOf('function moveMode(') + '\nreturn moveMode;')();
    const runDoor = (doorOver, o) => {
        o = o || {};
        const door = Object.assign({ id: 'dr', type: 'rect', blocksSight: true, sightType: 'door', x: 50, y: 50, w: 50, h: 50 }, doorOver), was = J(door);
        const tok = { id: 'tk', isChar: true, ownerId: 'u_p', x: 100, y: 50, w: 50, h: 50 };
        const map = { id: 'm1', type: 'map', meta: { gridType: 'square' }, fog: { on: true }, whiteboard: [door, tok] }, out = { sent: [], saves: 0, redraws: 0 };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.sent.push(copyOf(m)); } };
        const netD = { role: 'host', active: true, paused: false, roster: { pA: { id: 'u_p', location: o.at || 'm1' } } };
        new Function('msg', 'conn', 'net', 'peerPaused', 'window', '_doorLimit', 'sendFailed', 'getActiveCampaign', 'getActiveMap', 'save', 'toast', 'moveMode', drSrc)(
            { type: 'door-req', mapId: 'm1', itemId: 'dr' }, conn, netD, () => false, { wpVtt: { on: () => true }, wpDiceCore: null, wpFogCore: ownK(o, 'core') ? o.core : FC, wpFog: { redraw: () => { out.redraws++; } } }, null, e => { throw e; }, () => ({ id: 'c1', items: { m1: map } }), () => map, () => { out.saves++; }, () => {}, moveModeS);
        return J({ open: door.doorOpen === true, same: J(door) === was, sent: out.sent.map(m => m.type + ':' + m.reason), saves: out.saves, redraws: out.redraws });
    };
    const QUIET = J({ open: false, same: true, sent: [], saves: 0, redraws: 0 }), OPENED = J({ open: true, same: false, sent: [], saves: 1, redraws: 1 }), said = why => J({ open: false, same: true, sent: ['door-deny:' + why], saves: 0, redraws: 0 });
    const lineGate = { type: 'path', x: 50, y: 50, w: 10, h: 50, baseW: 10, baseH: 50, pts: [[0, 0], [0, 50]] }, barGate = { blocksSight: false, barrier: true };
    const dr = { plain: runDoor({}), secret: runDoor({ secret: true }), locked: runDoor({ doorLock: true }), secretLocked: runDoor({ secret: true, doorLock: true }), far: runDoor({ x: 300 }), secretFar: runDoor({ secret: true, x: 300 }),
        secretOpen: runDoor({ secret: true, doorOpen: true }), bar: runDoor(barGate), secretBar: runDoor(Object.assign({ secret: true }, barGate)), secretBarLocked: runDoor(Object.assign({ secret: true, doorLock: true }, barGate)),
        line: runDoor(lineGate), secretLine: runDoor(Object.assign({ secret: true }, lineGate)), notTrue: [1, 'true', 'yes', {}].map(v => runDoor({ secret: v })) };
    check('map builder B5, the door request (the doorreq slice, run for real with the real fogcore): a player\'s request naming a shut secret door next to their token answers nothing and changes nothing (the door stays shut, no message, no save, no redraw), where the very same door without the tick opens; a locked one answers nothing where the same door without the tick answers locked, and one too far answers nothing where the same door answers far, so no answer says that a door stands there; a see-through barrier\'s secret door and one drawn as a line alike; a secret door the host\'s piece calls open is left as it is; a tick that is not the word true is no secret door, and that door opens',
        dr.plain === OPENED && dr.secret === QUIET && dr.locked === said('locked') && dr.secretLocked === QUIET && dr.far === said('far') && dr.secretFar === QUIET && dr.secretOpen === J({ open: true, same: true, sent: [], saves: 0, redraws: 0 })
        && dr.bar === OPENED && dr.secretBar === QUIET && dr.secretBarLocked === QUIET && dr.line === OPENED && dr.secretLine === QUIET && dr.notTrue.every(r => r === OPENED), J(dr));
    // the same request, the piece once a secret door and once the wall the players hold: the two answers are the same in every situation
    const spots = [[{}, {}], [{ x: 300 }, {}], [{ doorLock: true }, {}], [{ doorOpen: true }, {}], [{ doorLock: true, x: 300 }, {}], [{}, { at: 'm2' }], [{ doorLock: true }, { at: 'm2' }]];
    const twins = spots.map(s => [runDoor(Object.assign({ secret: true }, s[0]), s[1]), runDoor(Object.assign({ sightType: 'wall' }, s[0]), s[1])]);
    const oldCore = Object.assign({}, FC); delete oldCore.secretOn;
    const noCore = { secretLocked: runDoor({ secret: true, doorLock: true }, { core: null }), locked: runDoor({ doorLock: true }, { core: null }), secret: runDoor({ secret: true }, { core: null }),
        oldSecret: runDoor({ secret: true }, { core: oldCore }), oldPlain: runDoor({}, { core: oldCore }), oldSecretLocked: runDoor({ secret: true, doorLock: true }, { core: oldCore }), oldLocked: runDoor({ doorLock: true }, { core: oldCore }) };
    check('map builder B5, the door request: a request naming a secret door is answered exactly as one naming a wall at its place is, next to the token, too far, locked, open on the host, and from a player who is on another map; and with no fogcore at hand, or one that knows no secret door, the raw tick still stops it: a locked secret door answers nothing where the same door without the tick answers locked, and a shut one stays shut where the same door without the tick opens',
        twins.every(t => t[0] === t[1]) && twins.slice(0, 5).every(t => t[0] === QUIET || t[0] === J({ open: true, same: true, sent: [], saves: 0, redraws: 0 })) && twins[5][0] === said('far')
        && noCore.secretLocked === QUIET && noCore.locked === said('locked') && noCore.secret === QUIET && noCore.oldSecret === QUIET && noCore.oldPlain === OPENED && noCore.oldSecretLocked === QUIET && noCore.oldLocked === said('locked') && typeof oldCore.isDoor === 'function' && oldCore.secretOn === undefined,
        J([twins, noCore]));
    const srcNC = src.replace(/\/\/[^\n]*/g, '');
    const seenSaid = (srcNC.match(/seen(?:Color|Texture)/g) || []).length, seenAsked = (srcNC.match(/w\.seen(?:Color|Texture) !== undefined|delete w\.seen(?:Color|Texture)/g) || []).length;
    // Round two of Match a wall: with no core at hand the host's fallback reads the look Match set for a door drawn as a line, by the tests the
    // core's cleaners make. fbSrc is that one branch, from its own else to the deletes after it. Each mention of a seen key there is listed by
    // what it is for, and counted once in the branch and once in all of net.js: so no seen key is read anywhere else
    const fbA = src.indexOf("        else if (w.secret === true && (w.blocksSight === true || w.barrier === true) && w.sightType === 'door'"), fbZ = fbA < 0 ? -1 : src.indexOf('        delete w.secret; delete w.seenColor; delete w.seenTexture;', fbA), fbSrc = fbA >= 0 && fbZ > fbA ? src.slice(fbA, fbZ).replace(/\/\/[^\n]*/g, '') : '';
    const fbCount = list => list.map(t => [srcNC.split(t).length - 1, fbSrc.split(t).length - 1]), onceEach = n => Array.from({ length: n }, () => [1, 1]);
    const FB_COLOR_READS = ["typeof w.seenColor === 'string'", '.test(w.seenColor)', 'w.color = w.seenColor.toLowerCase();', "w.seenColor === 'transparent'"], fbColorN = fbCount(FB_COLOR_READS);
    check('map builder B5 (wired): net.js writes none of the three keys anywhere, so no message of a player\'s can set one. It names the two keys of the look twelve times. Eight are the question and the delete: each key once in the question and once among the deletes of the host\'s one rule for a piece on its way out, and once each way in a player\'s own cleaner. Four more (round two of Match a wall) read the color named, all four inside the host\'s fallback for a secret door with no core at hand, where a door drawn as a line is sent in the color Match named for it: the test that it is a text, the test that it is a hex color of six digits, its copy in lower case to the wall\'s color, and the test for the very word transparent. The pattern named is never read: its four mentions are the two questions and the two deletes. Wherever the core is at hand the look is fogcore\'s to read; and secretSeen is asked in one place, the host\'s one rule for a piece on its way out',
        !/\.(?:secret|seenColor|seenTexture)\s*=(?!=)/.test(srcNC) && seenSaid === 12 && seenAsked === 8 && J(fbColorN) === J(onceEach(4)) && (srcNC.match(/seenColor/g) || []).length === 8 && (srcNC.match(/seenTexture/g) || []).length === 4 && fbSrc.length > 400 && !/seenTexture/.test(fbSrc)
        && srcNC.split('.secretSeen(').length === 2 && src.slice(src.indexOf('function wireWbItem('), src.indexOf('\n}\n', src.indexOf('function wireWbItem('))).split('.secretSeen(').length === 2,
        J([seenSaid, seenAsked, fbColorN, fbSrc.length, srcNC.split('.secretSeen(').length - 1]));
    // Match a wall: the three keys it sets, held as the two keys of the look are. net.js asks whether one is there and deletes it, and that is all
    const seenSaidM = (srcNC.match(/seen(?:Width|Opacity|Tip)/g) || []).length, seenAskedM = (srcNC.match(/w\.seen(?:Width|Opacity|Tip) !== undefined|delete w\.seen(?:Width|Opacity|Tip)/g) || []).length;
    const wireSrcM = src.slice(src.indexOf('function wireWbItem('), src.indexOf('\n}\n', src.indexOf('function wireWbItem('))).replace(/\/\/[^\n]*/g, ''), hostSrcM = lineU('function cleanHostWbItem(w) {').replace(/\/\/[^\n]*/g, '');
    const countM = (text, k) => [text.split('w.' + k + ' !== undefined').length - 1, text.split('delete w.' + k + ';').length - 1];
    const FB_LINE_READS = [["typeof w.seenWidth === 'number'", 'isFinite(w.seenWidth)', 'w.seenWidth > 0', 'w.seenWidth <= 1e15)', 'w.strokeWidth = w.seenWidth;'],
        ["typeof w.seenOpacity === 'number'", 'isFinite(w.seenOpacity)', 'w.seenOpacity >= 0', 'w.seenOpacity <= 1)', 'if (w.seenOpacity < 1)', 'w.opacity = w.seenOpacity;'],
        ["w.seenTip === 'round'", "w.seenTip === 'square'", "w.seenTip === 'flat'", 'w.tip = w.seenTip;']], fbLineN = FB_LINE_READS.map(fbCount);
    check('Match a wall (wired): net.js writes none of the three keys a Match press sets, so no message of a player\'s can set one. It names them twenty-seven times. Twelve are the question and the delete: each key once in the question and once among the deletes of the host\'s one rule for a piece on its way out, and once each way in a player\'s own cleaner. Fifteen (round two) are the host\'s fallback for a secret door drawn as a line with no core at hand, which reads the look Match set by the tests the core\'s cleaners make, and all fifteen stand inside that one branch. For the width, five: the test that it is a number, that it is finite, that it is above 0 and that it is at most 1e15, and its copy to the stroke width. For the opacity, six: the test that it is a number, that it is finite, that it is at least 0 and that it is at most 1, the test for under 1 that decides between an opacity key and none, and its copy to the opacity. For the nib, four: the three words it may be, and its copy to the nib. That branch stands under the question whether fogcore\'s secretSeen is at hand, as its else, and its reading of a line stands inside the test for a stroke that is no filled region. net.js asks no cleaner of the three and never fogcore\'s secretMatch, secretLook, lineFactor, lineScale or seenDrawn, which read the GM\'s own map: the press is Properties\' alone',
        !/\.(?:seenWidth|seenOpacity|seenTip)\s*=(?!=)/.test(srcNC) && seenSaidM === 27 && seenAskedM === 12 && KEYSW.every(k => J(countM(wireSrcM, k)) === '[1,1]' && J(countM(hostSrcM, k)) === '[1,1]') && J(fbLineN) === J([onceEach(5), onceEach(6), onceEach(4)])
        && (fbSrc.match(/seen(?:Width|Opacity|Tip)/g) || []).length === 15 && /^        else if \(w\.secret === true && [^\n]*\n            if \(w\.type === 'path' && w\.tip !== 'fill'\) \{/.test(fbSrc)
        && wireSrcM.split("if (FCs && typeof FCs.secretSeen === 'function') w = FCs.secretSeen(w);\n        else if (w.secret === true && ").length === 2 && !/secretMatch|cleanSeenWidth|cleanSeenOpacity|cleanSeenTip|secretLook|lineFactor|lineScale|seenDrawn/.test(srcNC),
        J([seenSaidM, seenAskedM, KEYSW.map(k => [countM(wireSrcM, k), countM(hostSrcM, k)]), fbLineN, (fbSrc.match(/seen(?:Width|Opacity|Tip)/g) || []).length]));

    // ---- (5) the asset gate: a secret door's own picture is no reference until the door is found ----
    {
        const tick = ms => new Promise(r => setTimeout(r, ms || 40)), FLOORPIC = '/saves/images/k/stone floor.png';
        const mkGate = files => {
            const w = { fetched: [] }, netG = { active: true, role: 'host', conns: [], stream: false };
            const fetchG = reqPath => { w.fetched.push(reqPath); let dec; try { dec = decodeURIComponent(reqPath); } catch (e) { dec = reqPath; } const f = files[dec]; if (!f) return Promise.resolve({ ok: false }); const body = new Uint8Array(f.len);
                return Promise.resolve({ ok: true, headers: { get: h => (h === 'content-length' ? String(f.len) : null) }, body: { cancel() {} }, arrayBuffer: () => Promise.resolve(body.buffer) }); };
            w.api = new Function('net', 'location', 'sendFailed', 'allow', 'fetch', 'setTimeout', between('// [netcheck:assetreq-start]', '// [netcheck:assetreq-end]', 'assetreq') + '\nreturn { handleAssetRequest, assetNoteSends };')(netG, { origin: 'http://localhost:3999' }, e => { throw e; }, () => true, fetchG, setTimeout);
            w.conn = peer => { const c = { peer, open: true, sent: [], send: m => { packCheck(m); c.sent.push(JSON.parse(j(m, (k, v) => (ArrayBuffer.isView(v) ? '<' + v.byteLength + ' bytes>' : v)))); } }; w.api.assetNoteSends(c); return c; };
            w.ask = async (c, p) => { const n = c.sent.length; w.api.handleAssetRequest({ type: 'asset-req', path: p }, c); await tick(); return c.sent.slice(n).map(m => (m.type === 'asset' ? (m.error ? 'refused:' + m.error : 'asset:' + m.mime + ':' + m.data) : m.type)); };
            return w;
        };
        const gateRun = async wireMap => {
            const files = {}; files[PIC] = { len: 5 }; files[FLOORPIC] = { len: 6 };
            const G = mkGate(files), GA = G.conn('pA'), hostG = { id: 'mG', type: 'map', whiteboard: [D('sdP', { name: 'Door' }), { id: 'fl', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: FLOORPIC, texTile: 1 }] };
            GA.send({ type: 'item', campId: 'k', itemId: 'mG', item: wireMap(hostG) });
            const floor = await G.ask(GA, FLOORPIC), shut = await G.ask(GA, PIC), shutEnc = await G.ask(GA, PIC.replace(' ', '%20')), fetchedShut = G.fetched.map(decodeURIComponent);
            const found = FC.secretReveal(hostG.whiteboard[0]); GA.send({ type: 'item', campId: 'k', itemId: 'mG', item: wireMap(hostG) });
            return { floor, shut, shutEnc, fetchedShut, found, after: await G.ask(GA, PIC) };
        };
        const [siHalf] = mkWire({ wpFogCore: { cleanTexSrc: FC.cleanTexSrc, cleanTexTile: FC.cleanTexTile } });   // the picture's cleaners and no secretSeen: the fallback's own list
        const gS = await gateRun(siS), gH = await gateRun(siHalf), gWant = J({ floor: ['asset:image/png:<6 bytes>'], shut: ['refused:missing'], shutEnc: ['refused:missing'], fetchedShut: [FLOORPIC], found: true, after: ['asset:image/png:<5 bytes>'] });
        check('map builder B5, the asset gate (assetreq, run for real on a map copy the host\'s real sanitizeItem made): the picture a secret door wears is no reference for a connection that was sent the map, so a request for it, raw or percent-encoded, is answered missing and nothing is fetched, while the floor\'s picture on the same map is served; once the door is found and the map sent again, its picture is served; and the same with the fallback, where only the picture\'s cleaners are at hand',
            J(gS) === gWant && J(gH) === gWant, J([gS, gH]));
    }

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
    /* ---- 1.5.6: a GM-only page keeps every page nested under it from players (found at a test join on 2026-10-24: 55 old pages under a GM-only folder reached a player) ---- */
    pendingChecks.push((async () => { try {
        const urlW = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRh = await import(urlW('docrender.js')), win = { wpDocRender: DRh }, J2 = JSON.stringify;
        const pg = (id, players, parentId) => ({ id, type: 'doc', meta: Object.assign({ title: id }, players === false ? { players: false } : {}, parentId ? { parentId } : {}), blocks: [{ id: 'b1', type: 'text', content: '<p>' + id + '</p>' }] });
        const camp = { id: 'k', name: 'K', activeItemId: 'm', items: { m: { id: 'm', type: 'map', meta: { title: 'M' }, whiteboard: [], rooms: [], links: [] }, f: pg('f', false), c: pg('c', true, 'f'), g: pg('g', true, 'c'), p: pg('p', true) } };
        const saSrcH = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
        const [SAh, SIh] = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', 'getActiveCampaign', "'use strict';\n" + saSrcH + '\nreturn [sanitizeAppState, sanitizeItem];')(H.own, win, () => ({}), () => ({}), v => v, it => it, it => it, () => camp);
        const snap = SAh({ activeCampaignId: 'k', campaigns: { k: camp } }, 'u_a', null), keys = Object.keys(snap.campaigns.k.items).sort().join(), stream = Object.keys(SAh({ activeCampaignId: 'k', campaigns: { k: camp } }).campaigns.k.items).sort().join();
        const one = { c: SIh(camp.items.c), g: SIh(camp.items.g), p: !!SIh(camp.items.p), f: SIh(camp.items.f) };
        check('1.5.6 the real sanitizeAppState and sanitizeItem with the real docrender: a page nested under a GM-only page is in no join snapshot and no stream window, at any depth, and is never sent alone; a page under no GM-only page is, as before',
            keys === 'm,p' && stream === 'm,p' && one.c === null && one.g === null && one.f === null && one.p === true, J2({ keys, stream, one }));
        const psA = src.indexOf('var _pagesShown = null'), psZ = src.indexOf('net.itemGone = function(campId, itemId, title) {');
        const sent = [], netP = { active: true, role: 'host', itemGone: (c, id) => sent.push('gone:' + id), broadcastItemFiltered: (c, id) => sent.push('send:' + id) };
        const pagesSync = new Function('net', 'getActiveCampaign', 'own', 'window', "'use strict';\n" + src.slice(psA, psZ) + '\nreturn pagesSync;')(netP, () => camp, H.own, win);
        const step = fn => { sent.length = 0; fn(); pagesSync(); return sent.slice().sort().join(); };
        const seed = (() => { sent.length = 0; pagesSync(true); return sent.join(); })();
        const S = { seed, none: step(() => {}), open: step(() => { camp.items.f.meta.players = true; }), close: step(() => { camp.items.f.meta.players = false; }), moveIn: step(() => { camp.items.p.meta.parentId = 'g'; }),
            moveOut: step(() => { camp.items.p.meta.parentId = null; }), made: step(() => { camp.items.n = pg('n', true); }), madeHid: step(() => { camp.items.h = pg('h', true, 'f'); }), deleted: step(() => { delete camp.items.p; }) };
        netP.role = 'client'; const client = step(() => { camp.items.f.meta.players = true; }); netP.role = 'host';
        check('1.5.6 pagesSync, run for real at each save: noted with nothing sent as a table opens; a GM-only page turned back on sends it and every page under it, turned GM only takes all of them from every player; a page moved under a GM-only page is taken, moved out sent again; a new page is sent, one made under a GM-only page is not; a deleted page has its own word; a player\'s app sends nothing',
            S.seed === '' && S.none === '' && S.open === 'send:c,send:f,send:g' && S.close === 'gone:c,gone:f,gone:g' && S.moveIn === 'gone:p' && S.moveOut === 'send:p' && S.made === 'send:n' && S.madeHid === '' && S.deleted === '' && client === '', J2(S));
        const ixH = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'), wn = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'));
        check('1.5.6 the hidden parent is wired and said: the save asks pagesSync after the clock and before the item, the table\'s open notes it with nothing sent, the page switch in the tree and in the editor take nothing away themselves; Help and both release notes say it',
            /net\.syncClock\(\);[^\n]*\n\s*if \(typeof pagesSync === 'function'\) pagesSync\(\);[^\n]*\n\s*if \(patch\) net\.sendItem/.test(src.replace(/\r\n/g, '\n')) && src.includes("if (typeof pagesSync === 'function') pagesSync(true);")
            && !fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'planner.js'), 'utf8').includes('itemGone(campD.id, am.id)') && !fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dialogs.js'), 'utf8').includes('itemGone(camp.id, it.id)')
            && ixH.includes('The pages nested under it are GM only too, whatever their own switch says.') && ixH.includes('removes it, and the pages under it, from every player at once. Moving a page under a GM-only page does the same.')
            && wn.every(t => { const a = t.indexOf('WAYPOINT 1.5.6'), b = t.indexOf('WAYPOINT 1.5.5'), k = t.indexOf('Handbook\n- A page set GM only now keeps every page nested under it from your\n'); return a >= 0 && k > a && k < b; }));
    } catch (e) { check('1.5.6 the hidden parent checks ran', false, String(e && e.stack || e)); } })());
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
pendingChecks.push((async () => {
    const j = JSON.stringify;
    {   // found by hand, 2026-10-31: a name asked of a core through typeof fails in silence, and a suite that imports the module cannot see it missing from what the page is given
        const scr = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
        const pub = (f, win) => { const t = scr(f), i = t.indexOf('var API = '), e = t.indexOf('window.' + win + ' = API'); return new Set([...t.slice(i, e).matchAll(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1])); };
        const sys = pub('systemcore.js', 'wpSystemCore'), dic = pub('dicecore.js', 'wpDiceCore'), netT = scr('net.js');
        const asked = (getter, win) => { const vars = new Set(); for (const m of netT.matchAll(new RegExp('\\b([A-Za-z_$][\\w$]*)\\s*=\\s*(?:' + getter + '\\(\\)|window\\.' + win + '\\b)(?!\\.)', 'g'))) vars.add(m[1]); return vars; };
        const NOT_CORE = new Set(['St.tokenElevation', 'St.tokenGround', 'D.waits', 'DL.label', 'cmd.expr', 'cmd.cmd']);   // the same letters, in other functions, naming the stance module, the dice roller, the limits and a parsed command
        const missing = (vars, keys) => { const out = new Set(); vars.forEach(v => { for (const m of netT.matchAll(new RegExp('(?<![\\w$.])' + v.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)', 'g'))) if (!keys.has(m[1]) && !NOT_CORE.has(v + '.' + m[1])) out.add(v + '.' + m[1]); }); return [...out]; };
        const noS = missing(asked('SC', 'wpSystemCore'), sys), noD = missing(asked('DC', 'wpDiceCore'), dic);
        check('every name net.js asks of the system core and the dice core is one the core publishes on the window (listRollRef and rowKeptFrom were not, so a resist card never offered a list\'s roll)', sys.has('listRollRef') && sys.has('rowKeptFrom') && asked('SC', 'wpSystemCore').size > 3 && !noS.length && !noD.length, j([noS, noD]));
    }
})());
// The async checks land before the summary. A pending check may push another while it runs, so the wait goes round again until no
// new one was added, as checkkit's suite().finish() does (the review of step 4 of "Finishing the test split", 2026-11-19: none of the
// four indented pushes runs inside async code today, but a check that landed after a single Promise.all would print after the summary).
(async () => { let seen = -1; while (seen !== pendingChecks.length) { seen = pendingChecks.length; await Promise.all(pendingChecks); } })().then(() => {
    /* ---- 1.5.4: the follow ruling (the owner, 2026-10-04): nobody follows the GM around unless the table is set to ---- */
    {
        const NL = '\n', landSrc = (p => p.slice(p.indexOf('// [netcheck:landing-start]'), p.indexOf('// [netcheck:landing-end]')))(require('./checkkit').part('netfog.js'));
        const stSrcF = src.slice(src.indexOf('// [netcheck:stage-start]'), src.indexOf('// [netcheck:stage-end]'));
        const wholeF = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, e) + '\n};'; };
        const campF = () => ({ id: 'c1', items: { m1: { id: 'm1', type: 'map', meta: { title: 'One' } }, m2: { id: 'm2', type: 'map', meta: { title: 'Two' } }, m3: { id: 'm3', type: 'map', meta: { title: 'Locked', playerLock: true } }, p1: { id: 'p1', type: 'planner' } }, players: { u_old: { lastMap: 'm2' }, u_gone: { lastMap: 'm9' }, u_lock: { lastMap: 'm3' } } });
        const land = (mode, fallback, pid, over) => { const camp = campF(), net = Object.assign({ stageMode: mode, stageFallback: fallback, stagePicked: {}, active: true, role: 'host' }, over || {});
            const api = new Function('net', 'getActiveCampaign', 'currentStage', "'use strict';" + NL + landSrc + NL + 'return { landingFor, defaultStageMode, hasLastLocations };')(net, () => camp, () => ({ campId: 'c1', itemId: 'm1' }));
            return { api, net, camp, out: api.landingFor({ id: pid }) }; };
        const L = { back: land('last', null, 'u_old').out, fresh: land('last', null, 'u_new').out, gone: land('last', null, 'u_gone').out, locked: land('last', null, 'u_lock').out, parked: land('last', 'm2', 'u_new').out, badFb: land('last', 'p1', 'u_new').out, follow: land(null, null, 'u_old').out };
        check('the follow ruling (landingFor, run for real): under Player\'s last location a returning player lands on their own last map, a first-timer on the map the GM is on (or the map New players start at names) — and every one of them stays put there: none is attached to the GM\'s browsing (a first-timer under Follow me was, and followed from map to map); a last map that is gone or locked for players counts as none; under Follow me a joiner lands with the GM and follows, as ever',
            j(L.back) === j({ stage: { campId: 'c1', itemId: 'm2' }, detached: true }) && j(L.fresh) === j({ stage: { campId: 'c1', itemId: 'm1' }, detached: true }) && j(L.gone) === j(L.fresh) && j(L.locked) === j(L.fresh)
            && j(L.parked) === j({ stage: { campId: 'c1', itemId: 'm2' }, detached: true }) && j(L.badFb) === j(L.fresh) && j(L.follow) === j({ stage: { campId: 'c1', itemId: 'm1' }, detached: false }), j(L));
        const dflt = (camp, picked, hosting) => { const net = { stageMode: 'x', stageFallback: 'x', stagePicked: picked || {}, active: !!hosting, role: 'host' };
            new Function('net', 'getActiveCampaign', 'currentStage', "'use strict';" + NL + landSrc + NL + 'return defaultStageMode;')(net, () => camp, () => null)(camp); return [net.stageMode, net.stageFallback]; };
        const D = [dflt({ id: 'c_new', items: {}, players: {} }), dflt(campF()), dflt(campF(), { c1: { mode: null, fallback: 'm2' } }), dflt(campF(), {}, true), dflt(null)];
        check('the follow ruling: Player\'s last location is the mode a table starts in, for a campaign that has never had a player too (it began on Follow me, and every joiner followed the GM from map to map); what the GM picked for a campaign this session stands; a table already hosting keeps its mode',
            j(D) === j([['last', null], ['last', null], [null, 'm2'], ['x', 'x'], ['x', 'x']]), j(D));
        const mkC = peer => ({ peer, open: true, sent: [], send(m) { this.sent.push(m); } });
        const stage = mode => { const c = mkC('pA'), net = { stageMode: mode, roster: { pA: { id: 'u_p', location: 'm1', detached: true } }, conns: [c] };
            const api = new Function('net', 'own', 'ensurePlayerToken', 'sendFailed', stSrcF + NL + 'return { summonConn, followConns };')(net, H.own, () => {}, () => {});
            api.summonConn(c, { campId: 'c1', itemId: 'm2' }); const after = net.roster.pA.detached, at = net.roster.pA.location, moved = api.followConns({ campId: 'c1', itemId: 'm3' });
            return [after, at, moved, net.roster.pA.location, c.sent.map(m => m.type + ':' + m.stage.itemId + ':' + (m.personal === true))]; };
        const S = [stage('last'), stage(null)];
        check('the follow ruling (stageConn and followConns, run for real): under Player\'s last location a summon moves the player once and they stay where they were brought — the GM opening another map moves nobody (a summoned player was attached, and followed from then on: "multiple players at different points arbitrarily followed me"); under Follow me a summon ends a detour and the table\'s follow moves them, as ever',
            j(S[0]) === j([true, 'm2', 0, 'm2', ['stage:m2:true']]) && j(S[1]) === j([false, 'm2', 1, 'm3', ['stage:m2:true', 'stage:m3:false']]), j(S));
        const all = mode => { const conns = [mkC('pA'), mkC('pB')], toasts = [], camp = campF(); let sel = 0;
            const net = { active: true, role: 'host', stageMode: mode, stageOverride: null, stageFallback: null, stagePicked: {}, conns, roster: { pA: { id: 'u_a', location: 'm1', detached: true }, pB: { id: 'u_b', location: 'm1', detached: mode === 'last' } } };
            new Function('net', 'own', 'ensurePlayerToken', 'sendFailed', 'getActiveCampaign', 'toast', 'refreshStageSelect', 'renderRoster', 'broadcastRoster', stSrcF + NL + wholeF('net.summonAllToMap = function(') + NL + 'return net.summonAllToMap;')(net, H.own, () => {}, () => {}, () => camp, t => toasts.push(t), () => { sel++; }, () => {}, () => {})('m2');
            return [net.stageMode, net.stageOverride, j(net.stagePicked), Object.values(net.roster).map(p => p.location + ':' + p.detached).join(), conns.map(c => c.sent.length).join(), toasts[0], sel]; };
        const A = [all('last'), all(null)];
        check('the follow ruling (net.summonAllToMap, run for real): under Player\'s last location Summon everyone here brings every player to that map once and leaves the table as it was set — no pin, nobody attached; under Follow me or a pin it pins the table there and everyone follows, as ever',
            j(A[0]) === j(['last', null, '{}', 'm2:true,m2:true', '1,1', 'Everyone summoned to Two.', 0]) && j(A[1]) === j([null, 'm2', j({ c1: { mode: null, fallback: null } }), 'm2:false,m2:false', '1,1', 'Everyone summoned to Two; table pinned here.', 1]), j(A));
        const ixF = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8');
        check('the follow ruling is wired and said: the choice is always offered; the GM is told once when players stayed behind and how to bring them; Help and the two tooltips say who moves when',
            require('./checkkit').part('netfog.js').includes("    var lastOpt = '<option value=\"last\">Player\\'s last location</option>';") && !/hasLastLocations\(camp\) \|\| net\.stageMode === 'last'\) \?/.test(src)
            && src.includes("if (!moved && net.stageMode === 'last' && !_stayHintShown && net.conns.some(function(c) { var pS = own(net.roster, c.peer) ? net.roster[c.peer] : null; return !!pS && pS.location !== s2.itemId; })) {")
            && ixF.includes('<b>Player\'s last location</b> is the default. Each player comes back to the map they were last on and stays put until they travel or you summon them.') && ixF.includes('nobody is moved because you open another map')
            && ixF.includes("'Player's last location' (the default) sends each player back to the map they were last on") && ixF.includes("'Follow me' puts them on the map you are on when they join, once: they do not follow you afterwards")
);
    }
    /* ---- 1.5.6: the stage while the GM is on a planner (found live on 2026-10-24: a website player joined to no map) ---- */
    {
        const NL = '\n', csSrc = (p => p.slice(p.indexOf('// [netcheck:curstage-start]'), p.indexOf('// [netcheck:curstage-end]')))(require('./checkkit').part('netfog.js'));
        const landSrcC = (p => p.slice(p.indexOf('// [netcheck:landing-start]'), p.indexOf('// [netcheck:landing-end]')))(require('./checkkit').part('netfog.js'));
        const campC = act => ({ id: 'c1', activeItemId: act, items: { m1: { id: 'm1', type: 'map', meta: { title: 'One' } }, m2: { id: 'm2', type: 'map', meta: { title: 'Two' } }, p1: { id: 'p1', type: 'planner' }, d1: { id: 'd1', type: 'doc' } }, players: {} });
        const storeOf = v => ({ getItem: k => (k === 'wp_recent_c1' ? v : null) });
        const run = (act, recent, over, pid, store) => { const camp = campC(act), net = Object.assign({ stageMode: 'last', stageFallback: null, stagePicked: {}, stageOverride: null, lastMapStageObj: null, active: true, role: 'host' }, over || {});
            const api = new Function('net', 'getActiveCampaign', 'own', 'localStorage', "'use strict';" + NL + csSrc + NL + landSrcC + NL + 'return { currentStage, recentMapOf, landingFor };')(net, () => camp, H.own, store || storeOf(recent === undefined ? null : JSON.stringify(recent)));
            const st = api.currentStage(), land = pid ? api.landingFor({ id: pid }) : null; return { st, land, kept: net.lastMapStageObj }; };
        const throwing = { getItem() { throw new Error('no storage'); } };
        const C = {
            planner: run('p1', ['p1', 'm9', 'd1', 'm2', 'm1']),
            none: run('p1', undefined),
            onMap: run('m1', ['m2']),
            kept: run('p1', ['m2'], { lastMapStageObj: { campId: 'c1', itemId: 'm1' } }),
            junk: [run('p1', { m2: 1 }), run('p1', 'm2'), run('p1', [1, null, {}]), run('p1', null, null, null, throwing), run('p1', null, null, null, storeOf('{not json'))],
            landNew: run('p1', ['m2'], null, 'u_new'),
            pinned: run('p1', ['m2'], { stageOverride: 'm1' }),
        };
        check('1.5.6, the stage with the GM on a planner (currentStage and recentMapOf, run for real with the landing): with no map the table\'s yet, a new player lands on the map this computer last had open in the campaign (the first of the recent list that is still a map), never on a planner, a page or a map that is gone, and nothing is recorded for it; with none listed, or storage that cannot be read or holds no list, no stage as before; the map on screen is the stage and is kept; a map the table already had stays its stage; a pinned map still wins',
            j(C.planner.st) === j({ campId: 'c1', itemId: 'm2' }) && C.planner.kept === null && C.none.st === null
            && j(C.onMap.st) === j({ campId: 'c1', itemId: 'm1' }) && j(C.onMap.kept) === j({ campId: 'c1', itemId: 'm1' })
            && j(C.kept.st) === j({ campId: 'c1', itemId: 'm1' }) && C.junk.every(r => r.st === null)
            && j(C.landNew.land) === j({ stage: { campId: 'c1', itemId: 'm2' }, detached: true }) && j(C.pinned.st) === j({ campId: 'c1', itemId: 'm1' }), j(C));
        const openAt = src.indexOf('        opened = true;\n        net.active = true;\n        if (typeof currentStage === \'function\') currentStage();');
        check('1.5.6: the map on screen as hosting begins is noted as the table\'s (currentStage asked in the peer\'s first open, once the table is active), and the Multiplayer window\'s Follow me names the map a new player would land on while the GM is on a planner',
            openAt > 0 && openAt < src.indexOf("toast(resumed ? 'Hosting resumed")
            && require('./checkkit').part('netfog.js').includes("    var stF = (it && it.type === 'map') ? null : currentStage();")
            && require('./checkkit').part('netfog.js').includes(": (stF && stF.campId === camp.id && camp.items[stF.itemId] && camp.items[stF.itemId].meta && camp.items[stF.itemId].meta.title) || 'your current map';"));
    }
    /* ---- 1.5.4: a player deletes an extra sheet of their own (char-delete) ---- */
    {
        const NL = '\n', delSrc = src.slice(src.indexOf('// [netcheck:chardelete-start]'), src.indexOf('// [netcheck:chardelete-end]'));
        const runX = o => { o = o || {};
            const camp = { id: 'k', chars: { c_play: { id: 'c_play', name: 'Ror', ownerId: 'u_a', npc: false }, c_mk: { id: 'c_mk', name: 'Ror', ownerId: 'u_a', npc: false, making: 1 }, c_kept: { id: 'c_kept', name: 'Old', ownerId: 'u_a', npc: false }, c_b: { id: 'c_b', name: 'Bea', ownerId: 'u_b', npc: false }, c_npc: { id: 'c_npc', name: 'N', npc: true, ownerId: 'u_a' } },
                items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', charId: 'c_kept' }, { id: 't2', charId: 'c_play' }] }, m2: { id: 'm2', type: 'map', whiteboard: [null, { id: 't3', charId: 'c_mk' }] }, m3: { id: 'm3', type: 'map', whiteboard: [{ id: 't4', charId: 'c_kept' }] }, pg: { id: 'pg', type: 'doc', whiteboard: [{ id: 't5', charId: 'c_kept' }] }, gone: null, bare: { id: 'bare', type: 'map' } } };
            const out = { ans: [], deleted: [], toasts: [], flushed: 0, allowed: [], remote: [], maps: [] };
            const conn = { peer: o.from || 'pA', send: m => out.ans.push(JSON.parse(JSON.stringify(m))) };
            const net = { role: 'host', paused: !!o.paused, applyingRemote: o.remoteWas === true, roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } } };
            if (!o.noSend) net.broadcastItemFiltered = (cid, mid) => { out.maps.push([cid, mid, net.applyingRemote, out.deleted.length, out.toasts.length]); };
            const win = { wpSheets: o.noSheets ? null : { deleteCharacter: id => { out.deleted.push([id, out.flushed]); out.remote.push(net.applyingRemote); if (o.boom) throw new Error('boom'); delete camp.chars[id]; } }, wpHistFlush: () => { out.flushed++; } };
            try { new Function('msg', 'conn', 'net', 'own', 'getActiveCampaign', 'SC', 'window', 'peerPaused', 'allow', 'toast', 'sendFailed', 'cleanCharName', "'use strict';" + NL + delSrc)(
                o.msg, conn, net, H.own, () => camp, () => (o.noCore ? null : { activeCharOf: (c, pid) => ({ id: o.active || (pid === 'u_a' ? 'c_play' : 'c_b') }) }), win, () => !!o.peerPaused, (k, lim, peer) => { out.allowed.push([k, peer]); return o.slow !== true; }, t => out.toasts.push(t), () => {}, n => String(n || '').slice(0, 40)); } catch (e) { out.threw = String(e && e.message); }
            out.after = net.applyingRemote; return out; };
        const mX = (id, rid) => ({ type: 'char-delete', rid: rid === undefined ? 'r1' : rid, charId: id }), why = o => (o.ans[0] ? o.ans[0].reason || (o.ans[0].ok ? 'ok' : '?') : 'silent');
        const mk = runX({ msg: mX('c_mk') }), kept = runX({ msg: mX('c_kept') }), play = runX({ msg: mX('c_play') }), mkOnly = runX({ msg: mX('c_mk'), active: 'c_mk' });
        const nestX = runX({ msg: mX('c_kept'), remoteWas: true }), boomX = runX({ msg: mX('c_kept'), boom: true }), noSendX = runX({ msg: mX('c_kept'), noSend: true });   // the owed review, 2026-10-09: the delete runs as a change from the table
        check('a player deletes an extra sheet of their own (the host\'s char-delete, sliced by its chardelete markers and run for real): one still being made, or one they do not play, is deleted by the host\'s own delete after the GM\'s pending edit is flushed, the GM is told whose and which, with no promise of a way back since a sheet is not in the undo history, and the player is answered; the delete runs as a change from the table, so the unlinking of its tokens is no step of the GM\'s undo, and that mark is put back as it was, after a delete that throws too; each map that held a token of the sheet, and no other item, is sent to the table once the delete is done, since a save marked so sends no map by itself; the one they play is refused and stays, while one still being made goes even where it counts as the one in play',
            j(mk.deleted) === j([['c_mk', 1]]) && j(mk.ans) === j([{ ok: true, type: 'char-delete-ans', rid: 'r1' }]) && j(mk.toasts) === j(['Pat deleted their sheet Ror (it was still being made).']) && j(mk.allowed) === j([['chardel', 'pA']])
            && j(kept.deleted) === j([['c_kept', 1]]) && j(kept.toasts) === j(['Pat deleted their sheet Old.']) && j(mk.remote) === j([true]) && mk.after === false && j(nestX.remote) === j([true]) && nestX.after === true && boomX.threw === 'boom' && boomX.after === false && boomX.toasts.length === 0 && boomX.ans.length === 0 && !/Undo brings/.test(delSrc)
            && j(kept.maps) === j([['k', 'm1', false, 1, 0], ['k', 'm3', false, 1, 0]]) && j(mk.maps) === j([['k', 'm2', false, 1, 0]]) && j(nestX.maps) === j([['k', 'm1', true, 1, 0], ['k', 'm3', true, 1, 0]]) && play.maps.length === 0 && boomX.maps.length === 0 && why(noSendX) === 'ok' && noSendX.deleted.length === 1 && why(play) === 'inplay' && play.deleted.length === 0 && play.toasts.length === 0 && play.allowed.length === 0 && j(mkOnly.deleted) === j([['c_mk', 1]]) && why(mkOnly) === 'ok', j([mk, kept, play, mkOnly]));
        const refs = { other: runX({ msg: mX('c_b') }), npc: runX({ msg: mX('c_npc') }), gone: runX({ msg: mX('c_zz') }), proto: runX({ msg: mX('__proto__') }), ctor: runX({ msg: mX('constructor') }), notText: runX({ msg: mX({ toString: () => 'c_mk' }) }),
            paused: runX({ msg: mX('c_mk'), paused: true }), pPaused: runX({ msg: mX('c_mk'), peerPaused: true }), off: runX({ msg: mX('c_mk'), noSheets: true }), noCore: runX({ msg: mX('c_mk'), noCore: true }), slow: runX({ msg: mX('c_mk'), slow: true }),
            badRid: runX({ msg: mX('c_mk', 'bad rid!') }), noRid: runX({ msg: mX('c_mk', 7) }), stranger: runX({ msg: mX('c_mk'), from: 'pZ' }), another: runX({ msg: mX('c_mk'), from: 'pB' }) };
        const whys = Object.keys(refs).map(k => k + ':' + why(refs[k]));
        check('char-delete refuses everything else and deletes nothing: another player\'s sheet and an NPC\'s (owner), one that is not there or named by a prototype\'s key or by a value that is no text (missing), a paused table or player, sheets off, a request past the rate; a request with no usable id of its own and one from a connection that is not admitted are not answered at all',
            j(whys) === j(['other:owner', 'npc:owner', 'gone:missing', 'proto:missing', 'ctor:missing', 'notText:missing', 'paused:paused', 'pPaused:paused', 'off:off', 'noCore:missing', 'slow:slow', 'badRid:silent', 'noRid:silent', 'stranger:silent', 'another:owner'])
            && Object.keys(refs).every(k => refs[k].deleted.length === 0 && refs[k].toasts.length === 0 && refs[k].flushed === 0 && refs[k].maps.length === 0), j(whys));
        check('char-delete on the player\'s side: one request through the same sender as the other character requests, its answer taken with theirs, the refusal for the character in play in the app\'s own words',
            src.includes("net.charDelete = function(charId, done) { return mkSend('char-delete', { charId: String(charId) }, done); };") && src.includes("msg.type === 'char-done-ans' || msg.type === 'char-delete-ans' || msg.type === 'char-token-ans'")
            && src.includes("inplay: 'That is the character you play: only your GM can delete it.'") && src.split("msg.type === 'char-delete'").length === 2);
    }
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
            snapAt > 0 && require('./checkkit').familyCount('net.js', 'snapItems(') === 2 && /\n        delete cS\.players;[^\n]*\n        snapItems\(cS\);[^\n]*\n        var actS = cS\.items && cS\.items\[cS\.activeItemId\];/.test(snapBody) && !/Object\.keys\(cS\.items \|\| \{\}\)\.forEach/.test(snapBody));
    }
    {   // 1.5.7: a damage roll's type rides on its card, worked out where the roll is made: the GM's own roll and a player's on the host, each from the roll's entry through systemcore dmgTypeOf, never from the roller's word
        const dIdx = src.indexOf('if ((entR && entR.dmg === true) || o.dmg === true) rec.dmg = 1;'), qIdx = src.indexOf('if (actQ && actQ.dmg === true) recQ.dmg = 1;');
        const dLine = src.slice(dIdx, src.indexOf('\n', src.indexOf('\n', dIdx) + 1)), qLine = src.slice(qIdx, src.indexOf('\n', src.indexOf('\n', qIdx) + 1));
        check('1.5.7 a damage card names its damage type: on the GM\'s own roll (net.diceRoll) and on a player\'s (the roll-req branch, on the host) the type is worked out from the roll\'s entry by systemcore dmgTypeOf with the row\'s own names, only for a damage roll, and nothing of the request names it',
            dIdx > 0 && qIdx > 0 && /rec\.dmg === 1 && entR && SR && typeof SR\.dmgTypeOf === 'function'[^\n]*SR\.dmgTypeOf\(campR\.system, entR, varsR, F\); if \(dtR\) rec\.dtype = dtR;/.test(dLine)
            && /recQ\.dmg === 1 && [^\n]*SQ\.dmgTypeOf\(campQ\.system, actQ, varsQ, Fq\); if \(dtQ\) recQ\.dtype = dtQ;/.test(qLine) && !/dtype/.test(src.slice(src.indexOf('net.diceRoll = function'), src.indexOf('var campR = getActiveCampaign(), SR = SC()'))));
    }
    {   // 1.5.8 (book handoff 90 Part B): what changed the values a roll reads rides on its card, worked out where the roll is made, from the names the roll read and the resolver it was made with (systemcore rollMods), never from the roller's word
        const flat = src.split('\r\n').join('\n');
        check('1.5.8 a roll\'s card carries what changed the values it read: on the GM\'s own roll and on a player\'s on the host, after the names are recorded, through systemcore rollMods with the very resolver the roll was made with; nothing else writes it',
            /if \(nmR\.length\) rec\.names = nmR; \}\n    if \(rec\.names && SR && typeof SR\.rollMods === 'function' && typeof varsR === 'function'\) \{ var mdR = SR\.rollMods\(varsR, rec\.names\); if \(mdR\) rec\.mods = mdR; \}/.test(flat)
            && /if \(nmQ\.length\) recQ\.names = nmQ; \}\n\s*if \(recQ\.names && typeof SQ !== 'undefined' && SQ && typeof SQ\.rollMods === 'function' && typeof varsQ === 'function'\) \{ var mdQ = SQ\.rollMods\(varsQ, recQ\.names\); if \(mdQ\) recQ\.mods = mdQ; \}/.test(flat)
            && (flat.match(/\.mods = md[RQ];/g) || []).length === 2);
    }
    {   // 1.6.0 (the owner: "Row removed, with Undo"): rows a player's press used up — the host keeps each for its Undo and tells that connection first
        const rgS = between('// [netcheck:rowgone-start]', '// [netcheck:rowgone-end]', 'rowgone'), sent = [], logs = [], grace = {}, conn = { send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const api = new Function('net', '_rowGrace', 'window', 'sendFailed', rgS + '\nreturn { rowGoneTell: rowGoneTell, fxNow: fxNow };')(
            { charInCombat: id => id === 'c_in' }, grace, { wpSystemCore: { LIMITS: { undoGraceMs: 9000 } }, wpStepLog: (a, s, f) => logs.push([a, s, f]) }, e => { throw e; });
        const ch = { id: 'c_a', values: { f_kit: [{ id: 'w_2', qty: 1 }] } }, t0 = Date.now();
        const n1 = api.rowGoneTell('c_a', ch, [{ f: 'f_kit', r: 'w_1', row: { id: 'w_1', qty: 1 }, at: 0 }, { f: 'f_kit', r: 'w_9' }, null], conn), g = grace['c_a|f_kit|w_1|gone'];
        const n0 = [api.rowGoneTell('c_a', ch, [], conn), api.rowGoneTell('c_a', ch, null, conn), api.rowGoneTell('c_a', null, [{ f: 'f_kit', r: 'w_1', row: {} }], conn)];
        const fx = [api.fxNow('c_in', null), api.fxNow('c_a', { ch: { id: 'c_in' } }), api.fxNow('c_a', null)];
        check('1.6.0 a used-up row\'s Undo on the host (rowGoneTell, run for real): the row is kept as the sheet\'s minus keeps one (the row as it was, its place, the list as the press left it, the window), the connection is told the row by list and id only, before the change lands, and the step is logged; nothing for no row, no character or a row with nothing kept; fxNow hands the host\'s clock and whether each character is in a fight',
            n1 === 1 && !!g && j(g.row) === j({ id: 'w_1', qty: 1 }) && g.at === 0 && g.after === j([{ id: 'w_2', qty: 1 }]) && g.until >= t0 + 9000 && g.added === 0 && Object.keys(grace).length === 1
            && j(sent) === j([{ type: 'row-gone', charId: 'c_a', items: [{ f: 'f_kit', r: 'w_1' }] }]) && j(logs) === j([['rowgone v1', 'host-kept', { n: 1 }]]) && j(n0) === j([0, 0, 0])
            && fx[0].inCombat === true && fx[0].onInCombat === false && fx[1].inCombat === false && fx[1].onInCombat === true && fx[2].inCombat === false && typeof fx[2].now === 'number', j([n1, g, sent, logs, fx]));
        const flatR = src;
        check('1.6.0 the wiring of a used-up row\'s Undo (source): char-apply tells the presser after its ack and before its delta; a player\'s roll whose Then used a row up the same, before its delta; the GM\'s own roll hands it to the sheet once stored; the three hand applyAct the clock an effect starts by; a player\'s app takes row-gone from the synced host only, cleaned, and hands each row to the sheet; an apply card\'s line may say an effect on or off, here and on the bare copy',
            /try \{ conn\.send\(\{ type: 'char-ack', rid: qa\.rid \}\); \} catch \(e\) \{ sendFailed\(e\); \}\n        if \(resA\.gone && typeof rowGoneTell === 'function'\) rowGoneTell\(qa\.charId, chA, resA\.gone, conn\);[^\n]*\n        if \(ownA\) \{ net\.syncCharDelta/.test(flatR)
            && flatR.includes("saveRemoteSoon(); if (taQ.gone && !(typeof pressQ !== 'undefined' && pressQ) && typeof rowGoneTell === 'function') rowGoneTell(q.charId, chQ, taQ.gone, conn); net.syncCharDelta(q.charId, taQ.values);")
            && flatR.includes("window.wpSheets.goneLocal(chR.id, taR.gone); }, 0);") && (flatR.match(/typeof fxNow === 'function' \? fxNow\(/g) || []).length === 5 /* 1.6.2: and the host's run of a Then's hidden steps, thenGmRun, and a waiting Then the GM applies, toGmApply (HR1) (moved on purpose) */
            && flatR.includes("if (msg.type === 'row-gone') { var rgC = typeof SC2.cleanRowGone === 'function' ? SC2.cleanRowGone(msg) : null; if (!rgC) return;") && /msg\.type === 'char-deny' \|\| msg\.type === 'row-gone'\) && net\.role === 'client'\) \{\n        \/\/ \[netcheck:charin-start\]\n[^\n]*\n        if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer/.test(flatR)
            && flatR.includes("if (l.fx === 1 || l.fx === 0) { var oF = { n: String(l.n).slice(0, 60), fx: l.fx }; if (typeof l.roll === 'string' && l.roll) oF.roll = l.roll.slice(0, 60); return oF; }") /* 1.6.0 (a builder audit): an effect's line keeps the words of which time was kept (moved on purpose) */ && require('./checkkit').part('netfight.js').includes("lines: rec.lines.map(function(l, i) { if (l.fx === 1 || l.fx === 0) return { n: l.n, fx: l.fx };"));
    }
    check('1.6.0 On.<name> on the host (source): a player\'s press and a player\'s roll read the one it is used on through THEIR view of the system (no GM-only field of the other reaches a formula of theirs), the GM\'s own roll through the system; each in that token\'s own context',
        src.includes("varsA = Sa.withOnSelf(varsA, !onA, onA ? Sa.makeResolver(viewA, onA.ch, Fa,") && src.includes("varsQ = SQ.withOnSelf(varsQ, !onQ, onQ && viewQ ? SQ.makeResolver(viewQ, onQ.ch, Fq,") && src.includes("varsR = SR.withOnSelf(varsR, !onR, onR ? SR.makeResolver(campR.system, onR.ch, F,"));
    {   // 1.6.0, found by hand on a live table
        const flat = src.split('\r\n').join('\n'), cutN = (a, b) => { const i = flat.indexOf(a), k = flat.indexOf(b, i); if (i < 0 || k < 0) throw new Error('slice ' + a); return flat.slice(i, k); };
        const farS = cutN('function fightFar(c, pr, was, loc) {', 'function combatsSendTo(c, was) {'), said = [], blasts = [];
        const camp = { items: { m1: { meta: { title: 'Upper Deck' }, whiteboard: [{ id: 't1', charId: 'c1' }, { id: 't2', charId: 'c2' }] } }, chars: { c1: { ownerId: 'p1' }, c2: { ownerId: 'p2' } } };
        const nF = { combats: { f1: { rows: [{ tokId: 't1' }] } }, broadcastBlast: (w, m, ch, only) => blasts.push([w.x, m, ch, only && only.peer]) };
        const winF = { wpBlastsShown: m => (m === 'm1' ? [{ wire: { x: 7 }, charId: 'c9' }] : []) };
        const far = new Function('net', 'getActiveCampaign', 'fightsOn', 'sendFailed', 'window', farS + '\nreturn { fightFar: fightFar, blastsSendTo: blastsSendTo };')(nF, () => camp, m => (m === 'm1' ? ['f1'] : []), () => {}, winF), cF = { peer: 'pc', send: m => said.push(m) };
        far.fightFar(cF, { id: 'p1' }, 'm1', 'm2'); far.fightFar(cF, { id: 'p2' }, 'm1', 'm2'); far.fightFar(cF, { id: 'p1' }, 'm1', 'm1'); far.fightFar(cF, { id: 'p1' }, undefined, 'm2'); far.fightFar(cF, { id: 'p1' }, 'gone', 'm2');
        check('a player who leaves a map with their token still in its fight is told, by the map\'s name (fightFar, run for real): nobody else, nobody who stayed, no word for a first landing or a map that is gone',
            said.length === 1 && said[0].type === 'fightfar' && said[0].title === 'Upper Deck', JSON.stringify(said));
        far.blastsSendTo(cF, 'm1'); far.blastsSendTo(cF, 'm2'); far.blastsSendTo(cF, 7);
        check('one who comes to a map is told what the table was told stands there, alone (blastsSendTo, run for real): as it was sent, with its thrower so that an unseen NPC stays unnamed, and nothing for a map with none',
            JSON.stringify(blasts) === JSON.stringify([[7, 'm1', 'c9', 'pc']]) && flat.includes('if ((!only || c === only) && c.open && net.roster[c.peer] && net.roster[c.peer].location === mapId)'), JSON.stringify(blasts));
        const brS = cutN("    } else if (msg.type === 'fightfar' && net.role === 'client') {", "    } else if (msg.type === 'trigmsg' && net.role === 'client') {").replace('    } else if', 'if') + '}', toasts = [];
        const runB = (m, n, c) => new Function('msg', 'net', 'conn', 'toast', brS)(m, n, c, t => toasts.push(t));
        const okN = { role: 'client', foreign: true, syncedPeer: 'h', stream: false };
        runB({ type: 'fightfar', title: 'Deck' }, okN, { peer: 'h' }); runB({ type: 'fightfar', title: 'Deck' }, okN, { peer: 'x' }); runB({ type: 'fightfar', title: 7 }, okN, { peer: 'h' }); runB({ type: 'fightfar', title: 'Deck' }, Object.assign({}, okN, { stream: true }), { peer: 'h' });
        check('a player\'s app says the word from the synced host alone, as text, never in the stream window', JSON.stringify(toasts) === JSON.stringify(['You are still in the fight on Deck.']), JSON.stringify(toasts));
        const wasS = cutN('var _fightWas = Object.create(null);', 'function fightSet(fid, combat) {'), nW = {}; const wasF = new Function('net', wasS + '\nreturn _fightWas;')(nW); wasF.f1 = Object.create(null); wasF.f1.t1 = { init: 9, rolled: true };
        check('the host remembers what a token held when it left a fight (net.fightWas): by fight and token, nothing else answered, and the stored rows are noted as a roster edit drops them',
            nW.fightWas('f1', 't1').init === 9 && nW.fightWas('f1', 'zz') === null && nW.fightWas('f9', 't1') === null && require('./checkkit').part('netfight.js').includes('wn[r.tokId] = { init: r.init, rolled: r.rolled === 1 };'));
        check('a join the player began closes the Multiplayer window; a reconnect leaves it as it stands', flat.includes("if (conn.wpRetry !== true) { var nmJ = ui('netModal'); if (nmJ) nmJ.style.display = 'none'; }"));
    }
    {   // 1.6.2 (the owner, by prompt: "Yes, build it"): a roll that draws a card as its die (net.js drawForRoll, run for real with the real deck core)
        const NL6 = String.fromCharCode(10), dk6 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'deckcore.js'), 'utf8').split(String.fromCharCode(13)).join('').split(NL6).filter(l => !/^(import|export) /.test(l)).join(NL6), K6 = new Function('cleanTexSrc', 'window', dk6 + NL6 + 'return API;')(() => '', {});
        const a6 = src.indexOf('// [netcheck:drawfirst-start]'), b6 = src.indexOf('// [netcheck:drawfirst-end]'); let saved6 = 0, told6 = 0;
        const own6 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
        const mk6 = () => new Function('window', 'own', 'saveRemoteSoon', 'net', src.slice(a6, b6) + '\nreturn drawForRoll;')({ wpDeckCore: K6.default || K6, wpFormula: null }, own6, () => { saved6++; }, { decksTell: () => { told6++; } });
        const deck6 = { key: 'D1', label: 'Fate', after: 'discard', stats: [{ key: 'Value', label: 'Value' }], cards: [{ name: 'Ace', vals: { Value: 14 } }, { name: 'Two', vals: { Value: 2 } }] };
        const camp6 = { system: { decks: [deck6] } }, dr = mk6();
        const d1 = dr(camp6, 'D1'), lastName = camp6.piles && camp6.piles.D1 ? deck6.cards[camp6.piles.D1.last].name : '';
        const kept = JSON.stringify(camp6.piles.D1); d1.undo(); const undone = !camp6.piles || !own6(camp6.piles, 'D1');
        const d2 = dr(camp6, 'D1'), n2 = d2.done();
        const gmDeck = { system: { decks: [Object.assign({}, deck6, { vis: 'gm' })] } }, d3 = dr(gmDeck, 'D1'), n3 = d3.done();
        const empty = dr({ system: { decks: [Object.assign({}, deck6, { after: 'gone' })] }, piles: { D1: { draw: [], disc: [], out: [0, 1], last: 1 } } }, 'D1'), gone = dr(camp6, 'D9');
        check('1.6.2 a roll that draws a card as its die: the host draws one card before the roll is worked out, so the pile\'s last is that card; undo puts the pile back as it was; done keeps it, saves, tells the table and names the card, none for a deck the GM alone knows; a deck that is gone and one with nothing left refuse in words',
            !!d1.name && d1.name === lastName && kept.length > 0 && undone && deck6.cards.some(c => c.name === n2) && saved6 === 2 && told6 === 2 && n3 === '' && /Nothing is left to draw from Fate/.test(empty.error || '') && /not here/.test(gone.error || ''), JSON.stringify([d1.name, lastName, n2, n3, empty, gone, saved6, told6]));
        const deck7 = { key: 'D1', label: 'Bag', after: 'discard', stats: [{ key: 'Value', label: 'Value' }], cards: [{ name: 'Ruby', vals: { Value: 3 } }, { name: 'Jet', vals: { Value: 7 } }, { name: 'Opal', vals: { Value: 5 } }] }, camp7 = { system: { decks: [deck7] } }, d7 = dr(camp7, 'D1', 3), n7 = d7.done();
        const camp8 = { system: { decks: [deck7] } }, d8 = dr(camp8, 'D1', 40);
        check('1.6.2 a roll that draws several at once: the host draws as many as it says, keeps them all as the last draw, and the roll\'s card names each; a count past 20 draws one', n7.split(', ').sort().join() === 'Jet,Opal,Ruby' && camp7.piles.D1.got.length === 3 && camp8.piles.D1.got.length === 1 && d8.name.indexOf(',') < 0, JSON.stringify([n7, camp7.piles.D1, camp8.piles.D1]));
        const flat6 = src;
        check('1.6.2 both paths draw first and put the card back on any refusal: a player\'s roll through denyQ, the GM\'s own through each early return; the card stays only once nothing refused it, and the roll\'s card names it',
            flat6.includes("var cardQ = null, denyQ = function(reason, r) { if (cardQ && cardQ.undo) { cardQ.undo(); cardQ = null; }") && flat6.includes("cardQ = actQ && typeof actQ.drawFirst === 'string' && typeof drawForRoll === 'function' ? drawForRoll(campQ, actQ.drawFirst, actQ.drawN) : null;")
            && flat6.includes("var cardNQ = cardQ && cardQ.done ? cardQ.done() : ''; cardQ = null;") && flat6.includes('if (cardNQ) recQ.card = cardNQ;') && flat6.includes("var cardR = entR && typeof entR.drawFirst === 'string' && typeof drawForRoll === 'function' ? drawForRoll(campR, entR.drawFirst, entR.drawN) : null;")
            && flat6.includes("var cardNR = cardR && cardR.done ? cardR.done() : '';") && flat6.includes('if (cardNR) rec.card = cardNR;') && flat6.split('return cardR && cardR.undo && cardR.undo(), {').length === 7, '');
    }
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
});
