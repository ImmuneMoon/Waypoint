/* netpiececheck.js: pieces on the wire and what a session sends, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 6, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: threat marks from a player (5h fold 3) and a player's live move (Onboarding F0),
   the F0 sweep (fog on is true alone), sanitizeItem and wireWbItem on a map's pieces (fold M2: a map's places, walls that always block and
   a portal's reach, text style, merged headings and cells, links and a diagram's link, conditions C1, token bars, one item's rule on its way
   to a player), what the join snapshot and the stream window hold (a GM-only stat, a session is one campaign, a list placed once a category,
   the video library, the pages pinned for the session, hidden pieces, R2 #14's party view, a GM-only page and the pages nested under it),
   the table's follow and the summons, the GM's ping, the lock rules on a drag and on threat marks, a portal crossing, targeting, a trap
   tile, needItem (R2 cluster A), a token a drop makes, travel through a door (R2 cluster H), a portal's own lock, an NPC walked through a
   hidden portal, a door request naming a hidden door, Forget, a traveller landing where they can walk to (1.5.9), and, last, the follow
   ruling (1.5.4) and the stage while the GM is on a planner (1.5.6), which ran in netcheck's closing block.
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netpiececheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc } = kit.netSlices('netpiececheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, ownKeySrc, siSrc, mkConn } = kit.netHarness('netpiececheck');
const j = JSON.stringify;

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
        !('fxb' in a4a) && J(a4mv) === J(['k:m1']) && J(a4b.fxb) === J([{ n: 'Unconscious', i: 'X', t: 'debuff' }]) && J(a4mv2) === J([]) && /\(S\.tokenEffectsPass \|\| S\.tokenEffects\)\(camp\.system, camp\.chars\[w\.charId\], false, window\.wpFormula, window\.wpSheets && typeof window\.wpSheets\.keptKey === 'function' \? window\.wpSheets\.keptKey\(camp\.system, camp\.chars\[w\.charId\], camp, ''\) : undefined\)/.test(fxS) && /function fxbMoved\(id\) \{\n(?:[^\n]*\n){3}    var SF = SC\(\); if \(SF && typeof SF\.tokenEffectsForget === 'function'\) SF\.tokenEffectsForget\(\);/.test(fxS), J([a4a, a4mv, a4b, a4mv2]));
    check('conditions C1 (source): the three funnels every character change leaves by look for moved effects — syncChars for every character, syncChar and syncCharDelta for the one that changed',
        /net\.syncChars = function\(\) \{[^\n]*\n[^\n]*\n[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(null\);/.test(src) && /net\.syncChar = function\(id\) \{[^\n]*\n[^\n]*\n[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(id\);/.test(src)
        && /net\.syncCharDelta = function\(id, values\) \{[^\n]*\n[^\n]*\n[^\n]*\n    if \(typeof fxbMoved === 'function'\) fxbMoved\(id\);/.test(src));
    {   // the review of the speed fold: the list kept ACROSS passes on the host, end to end. fxbOf hands tokenEffectsPass the real content key (sheets.js
        // keptKey, sliced and run for real with the real outsideKey), so a list is kept from one pass to the next; a change made in place in the same task
        // (the same values object, the same stamp, as a host branch writes one) followed by fxbMoved still sends the new list, since fxbMoved lets the
        // content keys made this pass go (sheets.js keptForget) before it looks; nothing changed sends nothing, in the same task and in the next pass
        const shK = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const hlK = shK.slice(shK.indexOf('function hoverLinesForToken(w, camp'), shK.indexOf('/* ---------- the facing dial'));
        const campK = { id: 'k', system: sysA4, chars: { c_a: { id: 'c_a', name: 'A', updated: 5, values: { f_hp: 3 } } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tA', isChar: true, charId: 'c_a', x: 0, y: 0, w: 50, h: 50 }] } } }, sentK = [];
        const SK = new Function('featureOn', 'F', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'hoverLines', 'withRound', 'tokenCtx', 'tokenFlags', 'combatOn', 'withRange', 'rangeFor', 'window', hlK + '\nreturn { keptKey: keptKey, keptForget: keptForget };')(
            () => true, () => Fx4, () => campK, c => c.system, (id, c) => (c.chars[id] || null), () => false, Sx.hoverLines, Sx.withRound, Sx.tokenCtx, () => ({}), () => null, Sx.withRange, () => null, { wpSystemCore: Sx, wpLibrary: { state: () => 1, size: () => 0 } });
        const apiK = new Function('net', 'getActiveCampaign', 'SC', 'own', 'window', "'use strict';\n" + fxS + '\nreturn { sanitizeItem: sanitizeItem, fxbMoved: fxbMoved };')({ role: 'host', active: true, sendItem: (cid, mid) => sentK.push(cid + ':' + mid) }, () => campK, () => Sx, H.own, { wpFormula: Fx4, wpSheets: SK });
        const tickK = () => Promise.resolve();
        Sx.tokenEffectsForget(true); const kA = tokOf(apiK.sanitizeItem(campK.items.m1), 'tA');
        campK.chars.c_a.values.f_hp = 0; apiK.fxbMoved('c_a'); const kMv1 = sentK.splice(0); const kB = tokOf(apiK.sanitizeItem(campK.items.m1), 'tA');
        apiK.fxbMoved('c_a'); const kMv2 = sentK.splice(0); await tickK(); apiK.fxbMoved('c_a'); const kMv3 = sentK.splice(0);
        campK.chars.c_a.values.f_hp = 4; apiK.fxbMoved('c_a'); const kMv4 = sentK.splice(0); const kC = tokOf(apiK.sanitizeItem(campK.items.m1), 'tA');
        const keyed = typeof SK.keptKey(sysA4, campK.chars.c_a, campK, '') === 'string';
        check('the review of the speed fold: the effects list kept across passes on the host (fxbOf with the real sheets.js keptKey, run for real): a sheet changed in place in the same task (same values object, same stamp) still sends its new list at fxbMoved, which lets the content keys of the pass go first; nothing changed sends nothing in the same task and in the next pass; a change back sends again',
            keyed && !('fxb' in kA) && J(kMv1) === J(['k:m1']) && J(kB.fxb) === J([{ n: 'Unconscious', i: 'X', t: 'debuff' }]) && J(kMv2) === J([]) && J(kMv3) === J([]) && J(kMv4) === J(['k:m1']) && !('fxb' in kC)
                && /function fxPassForget\(\) \{[^\n]*window\.wpSheets\.keptForget\(\);/.test(fxS) && /SF\.tokenEffectsForget\(\); if \(window\.wpSheets && typeof window\.wpSheets\.keptForget === 'function'\) window\.wpSheets\.keptForget\(\);/.test(fxS),
            J([keyed, kA, kMv1, kB, kMv2, kMv3, kMv4, kC]));
    }
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
    /* ---- 1.6.3 (the improvement week's pages review, finding 18; Fulllion, 2026-11-21: "an option to reveal certain parts and not others if
       the gm desires", and "Also per player"): a page's block kept back from players reaches only the players it names, on every way a page
       goes out. Run on the real docrender, sanitizeItem, sanitizeAppState, net.sendItem, net.broadcastItemFiltered and unkeepLinks ---- */
    pendingChecks.push((async () => { try {
        const urlK = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const DRk = await import(urlK('docrender.js')), win = { wpDocRender: DRk }, J2 = JSON.stringify;
        const pgK = { id: 'pk', type: 'doc', meta: { title: 'Rules' }, blocks: [
            { id: 'b_open', type: 'text', content: '<p>Open words</p>' },
            { id: 'b_gm', type: 'callout', content: '<p>GM SECRET words</p>', hide: true },
            { id: 'b_mira', type: 'h2', title: 'MIRA ONLY title', cols: 1, hide: true, see: ['u_mira', 'u_gone'] },
            { id: 'b_link', type: 'text', content: '<p><a href="#wp:page:pk:b_gm">see</a> and <a href="#wp:page:pk:b_open">here</a></p>' }] };
        const pgPlain = { id: 'pp', type: 'doc', meta: { title: 'Plain' }, blocks: [{ id: 'b1', type: 'text', content: '<p><a href="#wp:page:pk:b_mira">over there</a></p>' }] };
        const campK = { id: 'k', name: 'K', activeItemId: 'm', players: { u_mira: { name: 'Mira' }, u_kael: { name: 'Kael' } }, items: { m: { id: 'm', type: 'map', meta: { title: 'M' }, whiteboard: [], rooms: [], links: [] }, pk: pgK, pp: pgPlain } };
        const lineK = name => { const a = src.indexOf('function ' + name + '('); return src.slice(a, src.indexOf('\n', a)); };
        const extra = ['docHidHere', 'docPerReader', 'unkeepLinks'].map(lineK).join('\n') + '\n';
        const saSrcK = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + extra + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
        const [SAk, SIk, PRk, ULk] = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', 'getActiveCampaign', "'use strict';\n" + saSrcK + '\nreturn [sanitizeAppState, sanitizeItem, docPerReader, unkeepLinks];')(H.own, win, () => ({}), () => ({}), v => v, it => it, it => it, () => campK);
        const ids = d => d ? d.blocks.map(b => b.id).join() : 'none', marks = d => J2(d).indexOf('"hide"') >= 0 || J2(d).indexOf('"see"') >= 0;
        const st = { activeCampaignId: 'k', campaigns: { k: campK } };
        const snapM = SAk(st, 'u_mira', null).campaigns.k.items.pk, snapK = SAk(st, 'u_kael', null).campaigns.k.items.pk, strm = SAk(st).campaigns.k.items.pk;
        const R = { mira: ids(snapM), kael: ids(snapK), stream: ids(strm), anyR: ids(SIk(pgK, '*any')), alone: ids(SIk(pgK)), linkK: snapK.blocks.find(b => b.id === 'b_link').content, plain: SIk(pgPlain, 'u_mira').blocks[0].content, perPk: PRk(pgK), perPp: PRk(pgPlain) };
        check('1.6.3 (finding 18) a page block kept back from players reaches only the players it names: the join snapshot gives Mira the block she is named in and not the GM-only one, Kael neither, the stream window neither, and none of their copies holds a mark, a kept block\'s words, title or id',
            R.mira === 'b_open,b_mira,b_link' && R.kael === 'b_open,b_link' && R.stream === 'b_open,b_link' && R.anyR === 'b_open,b_mira,b_link' && R.alone === 'b_open,b_link'
            && ![snapM, snapK, strm].some(marks) && J2(snapK).indexOf('SECRET') < 0 && J2(snapK).indexOf('MIRA') < 0 && J2(snapK).indexOf('b_gm') < 0 && J2(snapK).indexOf('b_mira') < 0 && J2(strm).indexOf('b_mira') < 0 && J2(snapM).indexOf('u_gone') < 0 && J2(snapM).indexOf('SECRET') < 0, J2(R));
        check('1.6.3 (finding 18) a link or a mention that leads to a kept block keeps only its page, in the page itself and in another page, and a link to a block players read keeps its part; a page with a kept block goes to each reader apart (docPerReader), a page with none does not',
            R.linkK.indexOf('#wp:page:pk"') >= 0 && R.linkK.indexOf('#wp:page:pk:b_open') >= 0 && R.linkK.indexOf('b_gm') < 0 && R.plain.indexOf('#wp:page:pk"') >= 0 && R.plain.indexOf('b_mira') < 0
            && R.perPk === true && R.perPp === false && J2(ULk([{ s: 0, e: 3, h: '#wp:@:page:pk:b_gm' }, { s: 4, e: 6, h: '#wp:@:page:pk:b_open' }])) === J2([{ s: 0, e: 3, h: '#wp:@:page:pk' }, { s: 4, e: 6, h: '#wp:@:page:pk:b_open' }]), J2(R));
        // net.sendItem and net.broadcastItemFiltered, run for real: each admitted connection its own copy, whole, and no shared baseline kept
        const siA = src.indexOf('net.sendItem = function('), siZ = src.indexOf('// Host: broadcast one whole map/item to the table');
        const bfA = siZ, bfZ = src.indexOf('// Host: an item leaves every admitted player');
        const lastSent = { pk: { stale: true } };
        const netK = { conns: [mkConn('pm'), mkConn('pkl'), mkConn('pw')], roster: { pm: { id: 'u_mira' }, pkl: { id: 'u_kael' } } };
        const stK = { appState: st };
        const fnK = new Function('net', 'state', 'own', 'sanitizeItem', 'docPerReader', 'sendFailed', '_lastSent', 'mapFogged', 'itemDelta', 'broadcast', 'window', "'use strict';\n" + src.slice(siA, bfZ) + '\nreturn net;');
        fnK(netK, stK, H.own, SIk, PRk, () => {}, lastSent, () => false, () => { throw new Error('no shared delta for a page with a kept block'); }, () => { throw new Error('no broadcast'); }, win);
        netK.sendItem('k', 'pk');
        const gotS = netK.conns.map(c => c.sent.map(m => m.type + ':' + ids(m.item)).join('|'));
        netK.conns.forEach(c => { c.sent.length = 0; });
        netK.broadcastItemFiltered('k', 'pk');
        const gotB = netK.conns.map(c => c.sent.map(m => m.type + ':' + ids(m.item)).join('|'));
        netK.conns.forEach(c => { c.sent.length = 0; }); netK.sendItem('k', 'pk', netK.conns[1]);
        const gotO = netK.conns.map(c => c.sent.length).join();
        check('1.6.3 (finding 18) net.sendItem and net.broadcastItemFiltered, run for real: a page with a kept block goes to each admitted connection as its own reader\'s copy, whole, never to one not admitted, and no shared baseline is kept; one connection asked for gets its own copy alone',
            J2(gotS) === J2(['item:b_open,b_mira,b_link', 'item:b_open,b_link', '']) && J2(gotB) === J2(gotS) && gotO === '0,1,0' && !Object.prototype.hasOwnProperty.call(lastSent, 'pk'), J2({ gotS, gotB, gotO }));
    } catch (e) { check('1.6.3 (finding 18) the kept block checks ran', false, String(e && e.stack || e)); } })());
// From netcheck.js's closing block, where these two ran after every pending check (they lean on none of them):
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

T.finish();
