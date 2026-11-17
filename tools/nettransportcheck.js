/* nettransportcheck.js: the transport under the wire's own gates, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 4, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: asset requests (the picture limiter, a refusal answered), security R2 cluster C
   (the asset gate serving only what a connection was sent), the transport T1 to T7 (the room code, a room id taken, relay-only, the
   transport guard, backpressure, the signalling gate, the key proof bound to the channel), security R2 cluster K (the player's side
   against a hostile host), and voice chat's two words. 1.6.4 adds the plan's relay (the website's relay for a host on a Waypoint plan) just after
   T3, since it shares T3's relay slice.
   It reads the joined net.js through srcjoin, as netcheck did, and takes the gate's harness from tools/checkkit.js (netGate).
   Run: node tools/nettransportcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, tryBetween, fnSrc, lineOf } = kit.netSlices('nettransportcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { storage, H, ownKeySrc, siSrc } = kit.netHarness('nettransportcheck');
// the admission gate's harness netcheck kept at its top, the very code (checkkit netGate)
const { gateSrc, queueSrc, hmacRef, HT, runGate, harness } = kit.netGate('nettransportcheck');
const j = JSON.stringify;

/* ================= asset requests ================= */
check('asset-req: the picture limiter has NO per-request spacing (a map\'s pictures arrive in one burst) and answers a refusal', /allow\('asset', \{ perMs: 0, burst: \d+, windowMs: \d+, table: \d+ \}, conn\.peer\)\) \{ answerAsset\(conn, msg\.path, 'busy'\); return; \}/.test(src));
check('asset-req: a missing or over-cap picture is answered, never dropped silently', /answerAsset\(conn, msg\.path, 'missing'\)/.test(src) && /answerAsset\(conn, msg\.path, 'too-big'\)/.test(src));
check('asset arrival (client): a refused picture clears its pending flag and retries on busy, settles on missing', /msg\.error === 'busy' && tries <= 40/.test(src) && /assetCache\[msg\.path\] = ASSET_PLACEHOLDER/.test(src));
// security R2, cluster C (2026-10-01): the asset gate serves a connection only a picture or sound the host sent it a reference to, never a Journal or
// video file, and reads no file past the cap — the real gate, recorder and handler sliced and run against stub connections and a stub local server
pendingChecks.push((async () => {
    let api = null, aqErr = '';
    const tick = ms => new Promise(r => setTimeout(r, ms || 40));
    const mkWorld = (o) => {
        o = o || {};
        const w = { fetched: [], reads: 0, cancels: 0 };
        const files = o.files || {};   // decoded path -> { len, body, stated, throws }: stated false = an older shell streaming a file without its Content-Length
        const fetch = reqPath => {
            w.fetched.push(reqPath); let dec; try { dec = decodeURIComponent(reqPath); } catch (e) { dec = reqPath; }
            const f = files[dec]; if (!f) return Promise.resolve({ ok: false });
            const body = f.body || new Uint8Array(f.len || 0);
            return Promise.resolve({ ok: true, headers: { get: h => (h === 'content-length' && f.stated !== false) ? String(f.len !== undefined ? f.len : body.byteLength) : null }, body: { cancel: () => { w.cancels++; } },
                arrayBuffer: () => { w.reads++; if (f.throws) throw new Error('read whole'); return Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)); } });
        };
        const net = { active: true, role: 'host', conns: [], stream: false };
        try {
            const aqSrc = between('// [netcheck:assetreq-start]', '// [netcheck:assetreq-end]', 'assetreq');
            w.api = new Function('net', 'location', 'sendFailed', 'allow', 'fetch', 'setTimeout', aqSrc + '\nreturn { assetPathOk, handleAssetRequest, assetNoteSends, assetRefsOf: function(p) { return assetRefs[p] || null; } };')(net, { origin: 'http://localhost:3999' }, e => { throw e; }, o.allow || (() => true), fetch, setTimeout);
        } catch (e) { aqErr = String(e && e.message || e); w.api = null; }
        w.conn = peer => { const c = { peer, open: true, sent: [], send: m => { packCheck(m); c.sent.push(JSON.parse(j(m, (k, v) => ArrayBuffer.isView(v) ? '<' + v.byteLength + ' bytes>' : v))); } }; if (w.api) w.api.assetNoteSends(c); return c; };
        w.ask = async (c, p) => { if (!w.api) return ['no slice: ' + aqErr]; const n = c.sent.length; w.api.handleAssetRequest({ type: 'asset-req', path: p }, c); await tick(); return c.sent.slice(n).map(m => m.type === 'asset' ? (m.error ? 'refused:' + m.error : 'asset:' + m.mime + ':' + m.data) : m.type === 'asset-part' ? 'part:' + m.i + '/' + m.n : m.type); };
        return w;
    };
    const PIC = '/saves/images/m1/ab12cd34_tower.png', PIC2 = '/saves/images/m1/zz99zz99_since_hidden.png', SND = '/saves/images/audio/c1/x1y2z3w4_rain.mp3';
    const ODD = "/saves/images/m1/Bor'Thain — token (v2).png", ODD_ENC = "/saves/images/m1/Bor'Thain%20%E2%80%94%20token%20(v2).png", AMP = '/saves/images/m1/a&b (1).png', NUM = '/saves/images/m1/num.png';
    const JOURNAL = '/saves/images/journal/journals.json', VIDEO = '/saves/images/video/c1/ab12cd34_clip.mp4', BIGPIC = '/saves/images/other/ab12cd34_big.png', BIGSND = '/saves/images/audio/c1/ab12cd34_big.mp3';
    const NOLEN = '/saves/images/m1/ab12cd34_nolen.png', NOLENBIG = '/saves/images/m1/ab12cd34_nolenbig.png';
    const files = {};
    files[PIC] = { len: 5 }; files[PIC2] = { len: 5 }; files[SND] = { body: new Uint8Array(300 * 1024) }; files[ODD] = { len: 3 }; files[AMP] = { len: 3 }; files[NUM] = { len: 4 };
    files[JOURNAL] = { len: 9 }; files[VIDEO] = { len: 9 }; files[BIGPIC] = { len: 40 * 1024 * 1024, throws: true }; files[BIGSND] = { len: 40 * 1024 * 1024, throws: true };
    files[NOLEN] = { len: 5, stated: false }; files[NOLENBIG] = { body: new Uint8Array(26 * 1024 * 1024 + 1), stated: false };
    const W = mkWorld({ files }); const A = W.conn('pA'), B = W.conn('pB');
    const before = await W.ask(A, PIC), fetchedBefore = W.fetched.length;
    A.send({ type: 'item', campId: 'c1', itemId: 'm1', item: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', type: 'image', src: PIC }, { id: 'tx', type: 'text', text: '<p>see <img src="/saves/images/m1/a&amp;b (1).png" alt="x"> here, and <img src=\'/saves/images/m1/n&#117;&#x6D;.png\'></p>' }] } });
    const after = await W.ask(A, PIC), other = await W.ask(B, PIC), embedded = await W.ask(A, AMP), pasted = await W.ask(A, NUM);
    check('asset gate (assetreq, run for real): a picture is served to a connection only after the host sent it a reference — before, the request fetches nothing and is answered missing (the player\'s app settles on its placeholder); after a map copy naming the item\'s src, served whole as asset; a picture a text item carries in its img tag, as the player\'s app reads it (the entity decoded; a pasted tag\'s single quotes and numeric entities too), served too; another connection that was sent nothing is still refused',
        j(before) === j(['refused:missing']) && fetchedBefore === 0 && j(after) === j(['asset:image/png:<5 bytes>']) && j(other) === j(['refused:missing']) && j(embedded) === j(['asset:image/png:<3 bytes>']) && j(pasted) === j(['asset:image/png:<4 bytes>']) && j(W.fetched.map(decodeURIComponent)) === j([PIC, AMP, NUM]), j([before, after, other, embedded, pasted, W.fetched, aqErr]));   // fetched in its canonical (percent-encoded) form
    A.send({ type: 'chars', chars: { c1: { id: 'c1', name: 'Ror', portrait: ODD } } });
    const raw = await W.ask(A, ODD), enc = await W.ask(A, ODD_ENC), cased = await W.ask(A, ODD.replace('/m1/', '/M1/'));
    check('asset gate (assetreq): a reference is matched on the decoded canonical path — a character\'s portrait sent raw is served asked for raw or percent-encoded, and a different spelling of its folder (a case the file system might not tell apart) is refused',
        j(raw) === j(['asset:image/png:<3 bytes>']) && j(enc) === j(['asset:image/png:<3 bytes>']) && j(cased) === j(['refused:missing']), j([raw, enc, cased]));
    A.send({ type: 'chat', from: 'Zed', text: PIC2 });
    A.send({ type: 'chars', chars: { c2: { id: 'c2', name: PIC2, values: { notes: PIC2, rows: [{ label: PIC2 }] } } } });
    A.send({ type: 'roster', roster: [{ id: 'u_z', name: PIC2 }] });
    A.send({ type: 'asset', path: PIC2, error: 'missing' });
    A.send({ type: 'asset-part', path: PIC2, i: 0, n: 1, data: new Uint8Array(1) });
    const fetchedEcho = W.fetched.length, echoed = await W.ask(A, PIC2);
    check('asset gate (assetreq): a path that reaches a player only as text — a chat line, a character\'s name or a value, a roster name — or as the host\'s own answer to an earlier request of theirs (asset, asset-part) is no reference: still refused, nothing fetched',
        j(echoed) === j(['refused:missing']) && W.fetched.length === fetchedEcho && (W.api ? W.api.assetRefsOf('pA')[PIC2] === undefined : false), j([echoed, W.api && Object.keys(W.api.assetRefsOf('pA') || {})]));
    A.send({ type: 'sounds', list: [{ id: 's1', path: JOURNAL }, { id: 's2', path: VIDEO }, { id: 's3', path: SND }] });
    const jr = await W.ask(A, JOURNAL), vd = await W.ask(A, VIDEO), fetchedJV = W.fetched.length, snd = await W.ask(A, SND);
    check('asset gate (assetreq): the Journal folder (this machine\'s private shares and notes) and the video library are refused by the gate even when a message named them — nothing fetched, nothing answered — while a sound of the list is served in parts',
        j(jr) === j([]) && j(vd) === j([]) && fetchedJV === fetchedEcho && j(snd) === j(['part:0/2', 'part:1/2']), j([jr, vd, snd, W.fetched]));
    // map builder B3: a piece's picture fill is a reference as a piece's src is (a world of its own, so the counts above and below stand as they were)
    {
        const FILL = '/saves/images/m1/ab12cd34_stone floor.png', FILLJ = '/saves/images/journal/ab12cd34_page.png', FILLV = '/saves/images/Video/ab12cd34_frame.png', FILL2 = '/saves/images/m1/ab12cd34_moss.png', filesF = {};
        filesF[FILL] = { len: 6 }; filesF[FILLJ] = { len: 6 }; filesF[FILLV] = { len: 6 }; filesF[FILL2] = { len: 7 };
        const WF = mkWorld({ files: filesF }), FA = WF.conn('pA'), FB = WF.conn('pB');
        const fillBefore = await WF.ask(FA, FILL), fetchedF0 = WF.fetched.length;
        FA.send({ type: 'item', campId: 'c1', itemId: 'm3', item: { id: 'm3', type: 'map', whiteboard: [{ id: 'f1', type: 'rect', texSrc: FILL, texTile: 2 }, { id: 'f2', type: 'rect', texSrc: FILLJ }, { id: 'f3', type: 'path', tip: 'fill', texSrc: FILLV }, { id: 'f4', type: 'rect', texTile: FILL2, name: FILL2, texture: FILL2 }] } });
        const fillAfter = await WF.ask(FA, FILL), fillEnc = await WF.ask(FA, FILL.replace(' ', '%20')), fillOther = await WF.ask(FB, FILL), fetchedF1 = WF.fetched.length, fillJ = await WF.ask(FA, FILLJ), fillV = await WF.ask(FA, FILLV), fillText = await WF.ask(FA, FILL2), fetchedF2 = WF.fetched.length;
        check('asset gate (assetreq), map builder B3: a piece\'s picture fill is a reference as its src is: refused before the map that names it under texSrc was sent, served after, asked for raw or percent-encoded, and still refused to a connection that was sent nothing; a fill that names the Journal\'s or the video library\'s folder is refused by the gate whatever was sent, and a path that stands under the piece\'s repeat, its name or its pattern is no reference; texSrc is one of the gate\'s six keys',
            j(fillBefore) === j(['refused:missing']) && fetchedF0 === 0 && j(fillAfter) === j(['asset:image/png:<6 bytes>']) && j(fillEnc) === j(['asset:image/png:<6 bytes>']) && j(fillOther) === j(['refused:missing']) && fetchedF1 === 2 && j(fillJ) === j([]) && j(fillV) === j([]) && j(fillText) === j(['refused:missing']) && fetchedF2 === fetchedF1
            && src.includes('ASSET_KEYS.src = ASSET_KEYS.image = ASSET_KEYS.portrait = ASSET_KEYS.bgImage = ASSET_KEYS.path = ASSET_KEYS.texSrc = ASSET_KEYS.pic = 1;') && (src.match(/ASSET_KEYS\.[A-Za-z]+ = /g) || []).length === 7 /* 1.6.2 (backlog 42): pic, an item's and a row's own picture (moved on purpose) */, j([fillBefore, fillAfter, fillEnc, fillOther, fillJ, fillV, fillText, WF.fetched, aqErr]));
    }
    A.send({ type: 'item', item: { id: 'm2', type: 'map', whiteboard: [{ id: 'b1', src: BIGPIC }, { id: 'b2', src: NOLEN }, { id: 'b3', src: NOLENBIG }] } });
    A.send({ type: 'music', music: { songs: [{ id: 'g1', path: BIGSND }] } });
    const reads0 = W.reads, cancels0 = W.cancels;
    const bigPic = await W.ask(A, BIGPIC), bigSnd = await W.ask(A, BIGSND), readsBig = W.reads - reads0, cancelsBig = W.cancels - cancels0;
    const noLen = await W.ask(A, NOLEN), noLenBig = await W.ask(A, NOLENBIG);
    check('asset gate (assetreq): a file whose stated length is past the cap — a picture or a sound — is answered too-big from its Content-Length, its body canceled and never read; a shell that states no length (1.4.9 streams a file without one) is read and judged by its bytes as before: a small one served, one past the cap refused',
        j(bigPic) === j(['refused:too-big']) && j(bigSnd) === j(['refused:too-big']) && readsBig === 0 && cancelsBig === 2 && j(noLen) === j(['asset:image/png:<5 bytes>']) && j(noLenBig) === j(['refused:too-big']) && W.reads - reads0 === 2, j([bigPic, bigSnd, readsBig, cancelsBig, noLen, noLenBig]));
    const Wb = mkWorld({ files, allow: () => false }); const Ab = Wb.conn('pA'); Ab.send({ type: 'item', item: { whiteboard: [{ id: 't', src: PIC }] } });
    const busy = await Wb.ask(Ab, PIC);
    check('asset gate (assetreq): the rate limit still answers busy before anything is looked up or fetched', j(busy) === j(['refused:busy']) && Wb.fetched.length === 0, j([busy, Wb.fetched]));
    check('asset gate (assetreq): wired — the host wraps each accepted connection\'s send before it is listened to, forgets the record with the connection and at a new table, and asset-req is a host-only branch',
        /_connMeta\[conn\.peer\] = \{ openedAt: Date\.now\(\), hellos: 0 \};\s*assetNoteSends\(conn\);[^\n]*\n\s*wireConn\(conn\);/.test(src) && /delete assetInflight\[conn\.peer\]; delete assetRefs\[conn\.peer\];/.test(src)
        && /assetInflight = \{\}; assetRefs = Object\.create\(null\);/.test(src) && /msg\.type === 'asset-req' && net\.role === 'host'/.test(src));
    {   // 1.6.2 security (the leftover of backlog 24): the asset gate forgets a picture that only a piece no longer sent carries
        const J = JSON.stringify, FCa = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/'));
        const P = n => '/saves/images/m1/' + n + '.png', timers = [], fetched = [];
        const net = { active: true, role: 'host', conns: [], stream: false }, winA = { wpFogCore: FCa }; let camp = null;
        const fetchS = u => { fetched.push(String(u)); return Promise.resolve({ ok: true, headers: { get: h => h === 'content-length' ? '5' : null }, body: { cancel() {} }, arrayBuffer: () => Promise.resolve(new Uint8Array(5).buffer) }); };
        // mk(clock): the slices read the time through a Date of their own where one is handed in, so a test that moves the clock moves it for these
        // slices alone. The whole process's Date.now was once moved 31 s ahead across this block's awaits, and the security S block's waits, which
        // run meanwhile and end on the real clock, were then judged before their verdict was in on a slow machine (the review of 2026-11-11)
        const mk = clock => new Function('net', 'location', 'sendFailed', 'allow', 'fetch', 'setTimeout', 'getActiveCampaign', 'window', 'console', 'Date',
            between('// [netcheck:assetreq-start]', '// [netcheck:assetreq-end]', 'assetreq') + '\n' + between('// [netcheck:assethide-start]', '// [netcheck:assethide-end]', 'assethide') + '\n' + siSrc()
            + '\nreturn { assetNoteSends, handleAssetRequest, assetHidePlan, assetHideSweep, assetHideSoon, refs: function(p) { return Object.keys(assetRefs[p] || {}).sort(); } };')(net, { origin: 'http://localhost:3999' }, e => { throw e; }, () => true, fetchS, (fn, ms) => { timers.push([fn, ms]); return timers.length; }, () => camp, winA, console, clock || Date);
        let touched = 0; const idle = mk(), none = idle.assetHidePlan({ get items() { touched++; return {}; } });
        const api = mk(), conn = peer => { const c = { peer, open: true, sent: [], send: m => { c.sent.push(m); } }; api.assetNoteSends(c); return c; };
        const tok = (id, src) => ({ id, type: 'image', isChar: true, x: 0, y: 0, w: 60, h: 52, src });
        const door = { id: 'd1', type: 'rect', x: 100, y: 0, w: 50, h: 50, blocksSight: true, sightType: 'door', color: '#553311', texSrc: P('door') };
        const wb = [tok('tA', P('shown')), tok('tH', P('hid')), tok('g1', P('gob')), tok('g2', P('gob')), tok('tK', P('plan')), tok('tN', P('npc')), tok('tP', P('pc')), tok('tPg', P('page')), tok('tGr', P('grp')), door, { id: 'n1', type: 'text', gmNoteFor: 'tA', src: P('note') }];
        camp = { id: 'c1', items: { m1: { id: 'm1', type: 'map', meta: {}, whiteboard: wb, rooms: [] }, pl: { id: 'pl', type: 'planner', blocks: [{ type: 'image', src: P('plan') }] }, pg: { id: 'pg', type: 'page', blocks: [{ type: 'image', src: P('page') }] } },
            chars: { c_npc: { id: 'c_npc', npc: true, portrait: P('npc') }, c_pc: { id: 'c_pc', ownerId: 'u_ava', portrait: P('pc') } }, groups: [{ pieces: [{ src: P('grp') }] }], system: { objects: [{ src: P('grp') }] } };
        const A = conn('pA'), B = conn('pB'), all = { type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: wb.filter(w => !w.gmNoteFor).map(w => JSON.parse(J(w))) } };
        A.send(all); B.send(all); A.send({ type: 'chars', chars: { c_pc: { id: 'c_pc', portrait: P('pc') } } }); A.send({ type: 'item', item: { type: 'page', blocks: [{ type: 'image', src: P('page') }] } });
        const before = api.refs('pA'), plan0 = api.assetHidePlan(camp);
        ['tH', 'g1', 'tK', 'tN', 'tP', 'tPg', 'tGr'].forEach(id => { wb.find(w => w.id === id).hidden = true; }); door.secret = true;
        const plan = api.assetHidePlan(camp).sort(), held = api.refs('pA').length;
        api.assetHideSoon(); api.assetHideSoon(); const armed = timers.length, wait = timers[0] && timers[0][1]; timers[0][0](); api.assetHideSoon(); const armedAgain = timers.length;
        const afterA = api.refs('pA'), afterB = api.refs('pB');
        const ask = async (c, pth) => { const n = c.sent.length, f0 = fetched.length; api.handleAssetRequest({ type: 'asset-req', path: pth }, c); await new Promise(r => setTimeout(r, 40)); return c.sent.slice(n).map(m => m.type === 'asset' ? (m.error ? 'refused:' + m.error : 'asset') : m.type).join() + '|' + (fetched.length - f0); };
        const askHid = await ask(A, P('hid')), askGob = await ask(A, P('gob')), askDoor = await ask(B, P('door'));
        wb.find(w => w.id === 'tH').hidden = false; A.send({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: [JSON.parse(J(wb.find(w => w.id === 'tH')))] } }); const swept2 = api.assetHideSweep(), askShown = await ask(A, P('hid'));
        net.role = 'client'; const cliSweep = api.assetHideSweep(); const tN0 = timers.length; api.assetHideSoon(); const cliArm = timers.length - tN0; net.role = 'host';
        const gone = [P('door'), P('grp'), P('hid'), P('npc'), P('plan')];
        check('security (1.6.2, the leftover of backlog 24): the asset gate forgets a picture that only a piece no longer sent carries. While every piece is shown nothing is forgotten; once pieces are hidden and a door made secret, the paths only they carry go from every connection (a hidden token, a secret door\'s own picture, and a hidden token whose picture is otherwise only in a planner, an NPC\'s sheet or the GM\'s groups and map objects), while a path a shown piece, a page or a player\'s character still carries is kept; a forgotten picture is answered as not there with nothing fetched, a kept one is served, and one shown again is served again; one timer of 400 ms a batch of maps; nothing is walked while no connection was sent anything; a player\'s app sweeps nothing',
            J(none) === '[]' && touched === 0 && before.length === 9 && J(plan0) === '[]' && held === 9 && J(plan) === J(gone) && armed === 1 && wait === 400 && armedAgain === 2
            && J(afterA) === J([P('gob'), P('page'), P('pc'), P('shown')]) && J(afterB) === J([P('gob'), P('page'), P('pc'), P('shown')])
            && askHid === 'refused:missing|0' && askGob === 'asset|1' && askDoor === 'refused:missing|0' && swept2 === 0 && askShown === 'asset|1' && cliSweep === 0 && cliArm === 0, J([none, touched, before, plan0, plan, armed, wait, afterA, afterB, askHid, askGob, askDoor, swept2, askShown, cliSweep, cliArm]));
        {   // the review of 2026-11-10: only what a player is really sent keeps a path askable, and the sweep costs next to nothing while a path is still shown
            const DRa = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'docrender.js')).split(String.fromCharCode(92)).join('/'));
            winA.wpDocRender = DRa.default && DRa.default.cleanDoc ? DRa.default : DRa;   // the real page cleaner behind the real sanitizeItem
            let ahead = 0; const clockA = { now: () => Date.now() + ahead };   // the slices' own clock: never the process's
            try {
            const api2 = mk(clockA), c2 = peer => { const c = { peer, open: true, sent: [], send: m => { c.sent.push(m); } }; api2.assetNoteSends(c); return c; };
            const names = ['control', 'ogre', 'spy', 'ambush', 'assassin', 'gmpage', 'pcorig', 'song', 'look', 'fighter', 'page2'], wb2 = names.map((n, i) => tok('t' + i, P(n)));
            wb2.push(Object.assign(tok('tF', P('face')), { frame: { src: P('orig') }, sheet: { portrait: P('orig') } }), tok('tO', P('orig')));   // a shown token's kept original and attached sheet are the GM's
            let metaReads2 = 0;
            camp = { id: 'c1', items: { m1: { id: 'm1', type: 'map', meta: { setups: [{ pieces: [{ src: P('ambush') }] }] }, whiteboard: wb2, rooms: [] }, m2: { id: 'm2', type: 'map', whiteboard: [], rooms: [], get meta() { metaReads2++; return {}; } },
                    d1: { id: 'd1', type: 'doc', meta: { title: 'Secret', players: false }, blocks: [{ id: 'b1', type: 'image', src: P('gmpage') }] }, d2: { id: 'd2', type: 'doc', meta: { title: 'Open' }, blocks: [{ id: 'b1', type: 'image', src: P('page2') }] } },
                chars: { c_pc: { id: 'c_pc', ownerId: 'u_ava', portrait: P('face'), frame: { src: P('pcorig') } } },
                cast: [{ src: P('ogre') }], handouts: [{ image: P('spy') }], fights: { list: { f_1: { rows: [{ src: P('assassin') }] } } }, music: { tracks: [{ path: P('song') }] }, docStyle: { bgImage: P('look') }, pictures: [{ path: P('control') }], videos: [{ path: P('control') }] };
            net.combats = { f_1: { mapId: 'm1', rows: [{ id: 'r1', name: 'Duelist', tokId: 't9', src: P('fighter') }] } };   // a running fight: its row goes to every player who saw it, also once its token is hidden
            const docKept = !!api2 && !!winA.wpDocRender.cleanDoc(camp.items.d2), A2 = c2('pA'); A2.send({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: wb2.map(w => ({ id: w.id, type: w.type, src: w.src })) } });
            const held2 = api2.refs('pA').length; names.forEach((n, i) => { wb2[i].hidden = true; }); wb2[wb2.length - 1].hidden = true;
            const plan2 = api2.assetHidePlan(camp).sort(), swept2b = api2.assetHideSweep(), left2 = api2.refs('pA'), reads1 = metaReads2;   // the sweep forgets what is gone: only the path a page still carries is a candidate from here on
            const planAgain = api2.assetHidePlan(camp).sort(), reads2 = metaReads2; ahead = 31000; const planLater = api2.assetHidePlan(camp).sort(), reads3 = metaReads2;
            const ask2 = async pth => { const n = A2.sent.length, f0 = fetched.length; api2.handleAssetRequest({ type: 'asset-req', path: pth }, A2); await new Promise(r => setTimeout(r, 40)); return A2.sent.slice(n).map(m => m.type === 'asset' ? (m.error ? 'refused:' + m.error : 'asset') : m.type).join() + '|' + (fetched.length - f0); };
            const asks2 = []; for (const n of ['ogre', 'spy', 'ambush', 'assassin', 'gmpage', 'orig', 'pcorig', 'fighter', 'page2', 'face']) asks2.push(n + ' ' + await ask2(P(n)));
            delete net.combats;
            // the cost: a path a shown piece still carries is found among the pieces, and no item is copied for it
            const api3 = mk(), A3 = (() => { const c = { peer: 'pA', open: true, sent: [], send: m => { c.sent.push(m); } }; api3.assetNoteSends(c); return c; })(); let metaReads = 0;
            const g1 = tok('g1', P('gob')), g2 = tok('g2', P('gob'));
            camp = { id: 'c1', items: { m1: { id: 'm1', type: 'map', meta: {}, whiteboard: [g1, g2], rooms: [] }, m2: { id: 'm2', type: 'map', whiteboard: [], rooms: [], get meta() { metaReads++; return {}; } } } };
            A3.send({ type: 'item', item: { type: 'map', whiteboard: [{ id: 'g1', src: P('gob') }] } }); g1.hidden = true;
            const planKept = api3.assetHidePlan(camp), readsKept = metaReads; g2.hidden = true;
            const planGone = api3.assetHidePlan(camp), readsGone = metaReads; api3.assetHideSweep(); const readsSwept = metaReads, planAfter = api3.assetHidePlan(camp), readsAfter = metaReads;
            const hideSrc = between('// [netcheck:assethide-start]', '// [netcheck:assethide-end]', 'assethide');
            const GONE = ['ambush', 'assassin', 'control', 'gmpage', 'ogre', 'orig', 'pcorig', 'spy'].map(P);
            check('security (the review of 2026-11-10): a hidden piece\'s picture is forgotten though the campaign\'s cast, a handout, a map\'s saved set-up, the saved copy of a fight, the picture and video libraries or a page players may not read (the real page cleaner) still hold its path, since none of those reaches a player as a path (a token dropped from the cast kept its picture askable for good), and so is a path only a shown token\'s kept original or attached sheet, or the kept original of a player\'s portrait, holds; a path a running fight\'s row, a page players may read, the music or the look of the pages carries is kept, and a shown token\'s own picture is still served; a path a shown piece still carries is found among the pieces with no item copied; what the items\' own copies carry is remembered for half a minute, so that pass is not made again at every map that goes out; a path nothing carries is walked for once and is then no candidate again; the sweep never calls wireWbItem, which would record what each token was last sent with',
                docKept && held2 === 13 && J(plan2) === J(GONE) && J(planAgain) === '[]' && reads1 > 0 && reads2 === reads1 && J(planLater) === '[]' && reads3 > reads2 && swept2b === 8 && J(left2) === J(['face', 'fighter', 'look', 'page2', 'song'].map(P))
                && J(asks2) === J(['ogre refused:missing|0', 'spy refused:missing|0', 'ambush refused:missing|0', 'assassin refused:missing|0', 'gmpage refused:missing|0', 'orig refused:missing|0', 'pcorig refused:missing|0', 'fighter asset|1', 'page2 asset|1', 'face asset|1'])
                && J(planKept) === '[]' && readsKept === 0 && J(planGone) === J([P('gob')]) && readsGone > 0 && J(planAfter) === '[]' && readsAfter === readsSwept
                && !/wireWbItem\(/.test(hideSrc) && hideSrc.includes("ASSET_KEEP_MS = 30000, ASSET_SENT_KEYS = { system: 1, docStyle: 1, sounds: 1, music: 1 }"), J([docKept, held2, plan2, planAgain, reads1, reads2, reads3, swept2b, left2, asks2, planKept, readsKept, planGone, readsGone, readsSwept, planAfter, readsAfter]));
            } finally { delete winA.wpDocRender; delete net.combats; }
        }
        check('security (1.6.2), the wiring: both funnels a map goes out by ask the sweep after the hidden drawings are noted, each through typeof',
            src.includes("    if (it.type === 'map' && typeof assetHideSoon === 'function') assetHideSoon();   // security: a picture only a piece no longer sent carries is forgotten once the map has gone out") && src.includes("    if (it.type === 'map' && typeof assetHideSoon === 'function') assetHideSoon();   // security: as sendItem"), '');
    }
})());
// the transport (2026-10-01, the outside audit's cluster T): what stands between a table and whoever knows its room code, below the wire's own gates —
// the room code itself, a room id registered by someone else, relay-only that says what it does, the connection library's decoding and reassembly
// before admission, what the host queues for a peer that does not read, the signaling path into the library, and the key proof bound to the
// encrypted channel. Each slice is the real code; the connection library is not in the repository, so a stand-in written from its 1.5.2 source
// (entry points, chunk reassembly, the offer handling) carries the checks — and where its bundled file is found the real one runs them too.
pendingChecks.push((async () => {
    const J = JSON.stringify, sl = name => tryBetween('// [netcheck:' + name + '-start]', '// [netcheck:' + name + '-end]');
    const noThrow = fn => { try { fn(); return ''; } catch (e) { return String(e && e.message); } };
    const rd = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
    const noCm = s => String(s || '').replace(/\/\/[^\n]*/g, '');
    const lineOfT = start => { const i = src.indexOf(start); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); };
    const html = rd('system/app/index.html'), settingsSrc = rd('system/app/scripts/settings.js'), tipsSrc = rd('system/app/scripts/tips.js'), mainSrc = rd('system/app/scripts/main.js');

    /* ---- T1 (TRANSPORT-9): the room code ---- */
    {
        const rcSrc = sl('roomcode'); let r = {}, err = 'no slice';
        if (rcSrc) err = noThrow(() => {
            const mk = (cryptoStub, mathStub) => new Function('net', 'crypto', 'Math', rcSrc + '\nreturn { makeCode: makeCode, showCode: showCode, typedCode: typedCode, CODE_LEN: CODE_LEN };')({}, cryptoStub, mathStub);
            const noRandom = Object.create(Math); noRandom.random = () => { throw new Error('Math.random was called'); };
            let calls = 0; const api = mk({ getRandomValues: a => { calls++; return globalThis.crypto.getRandomValues(a); } }, noRandom);
            const codes = []; for (let i = 0; i < 2000; i++) codes.push(api.makeCode());
            const tally = {}; codes.join('').split('').forEach(ch => { tally[ch] = (tally[ch] || 0) + 1; });
            const feed = [248, 249, 250, 251, 252, 253, 254, 255, 0, 30, 31, 61, 247, 255, 62, 1, 2, 3, 4, 5]; let at = 0;
            const fed = mk({ getRandomValues: a => { for (let k = 0; k < a.length; k++) a[k] = at < feed.length ? feed[at++] : 7; return a; } }, noRandom).makeCode();
            const CH = 'abcdefghjkmnpqrstuvwxyz23456789';
            r = { len: api.CODE_LEN, calls, shape: codes.every(c => /^[a-hjkmnp-z2-9]{10}$/.test(c)), distinct: new Set(codes).size, letters: Object.keys(tally).length, spread: Object.keys(tally).every(k => tally[k] > 400 && tally[k] < 950),
                fed, want: [0, 30, 31, 61, 247, 62, 1, 2, 3, 4].map(b => CH[b % 31]).join(''), room: new Function(lineOfT('function roomPeerId(code, gen) {') + '\nreturn roomPeerId;')()(codes[0]) === 'waypoint-' + codes[0],
                show: [api.showCode('abcdefghjk'), api.showCode('ABCDE23456'), api.showCode('abc234'), api.showCode(''), api.showCode(null)],
                typed: ['ABCDE-FGHJK', 'abcde fghjk', '  AbCdE – fGhJk\t', 'ABCDE‑FGHJK', 'abcdefghjk', 'AB2 3CD', 'ab23cd', null, undefined, 7].map(v => api.typedCode(v)) };
        });
        check('transport T1 (the room code, makeCode run for real): ten characters drawn from crypto.getRandomValues and never from Math.random (which throws here) — 2,000 codes all of the 31-letter alphabet in lower case, no two alike, every letter in use about as often as another; a byte of 248 or more is thrown away and the next taken, so the letters are exactly those of the bytes kept; the room id is waypoint-<code>',
            err === '' && r.len === 10 && r.calls >= 1 && r.shape === true && r.distinct === 2000 && r.letters === 31 && r.spread === true && r.fed === r.want && r.room === true && !/Math\.random/.test(noCm(rcSrc)), J([err, r.len, r.calls, r.shape, r.distinct, r.letters, r.spread, r.fed, r.want, r.room]));
        check('transport T1 (shown and typed): a ten-character code is shown and copied in two groups, XXXXX-XXXXX, and an older six-character one as it is; what is typed or pasted loses its hyphen (of any kind) and spaces and its capitals, so both groupings dial the same room, and a six-character code dials as typed',
            err === '' && J(r.show) === J(['ABCDE-FGHJK', 'ABCDE-23456', 'ABC234', '', '']) && J(r.typed) === J(['abcdefghjk', 'abcdefghjk', 'abcdefghjk', 'abcdefghjk', 'abcdefghjk', 'ab23cd', 'ab23cd', '', '', '7']), J([err, r.show, r.typed]));
        check('transport T1 (wired, and said): the Multiplayer panel\'s Join box and the join itself read the code through typedCode, the welcome screen\'s Join through it too; the code on screen, in the status line, the session log and the Copy button through showCode; the tooltip, Help and the placeholders speak of ten characters in two groups',
            /var code = typedCode\(ui\('netCodeInput'\)\.value\);/.test(src) && /function joinSession\(code, name, isRetry, probe\) \{\n[^\n]*\n\s*code = typedCode\(code\);/.test(src) && /codeEl\.textContent = showCode\(code\);/.test(src) && /navigator\.clipboard\.writeText\(showCode\(net\.code\)\)/.test(src)
            && /'Connecting to ' \+ showCode\(code\)/.test(src) && !/code\.toUpperCase\(\)/.test(noCm(src)) && /wpNet\.typedCode\(/.test(mainSrc) && !/six-character/.test(tipsSrc) && /XXXXX-XXXXX/.test(tipsSrc)
            && !/AB12CD/.test(html) && (html.match(/AB2CD-EF3GH/g) || []).length >= 2 && /id="wcJoinCode" placeholder="e\.g\. AB2CD-EF3GH"/.test(html) && /with or without the hyphen/.test(html));
        // the live test, 2026-10-30: Enter joins, and a joining player's tooltip is theirs
        const jeS = mainSrc.slice(mainSrc.indexOf('// [netcheck:joinenter-start]'), mainSrc.indexOf('// [netcheck:joinenter-end]')), jeP = new Function(jeS + '\nreturn pressOnEnter;')();
        const jeI = () => { const on = {}; return { on, addEventListener: (t, f) => { on[t] = f; } }; }, jeB = { disabled: false, n: 0, click() { this.n++; } }, jeIn = jeI(); let jeSt = 0; const jeK = (key, c) => ({ key, isComposing: !!c, preventDefault() {}, stopPropagation() { jeSt++; } });
        jeP(jeIn, jeB); jeP(null, jeB); jeP(jeI(), null); jeIn.on.keydown(jeK('a')); jeIn.on.keydown(jeK('Enter', true)); const je0 = jeB.n; jeIn.on.keydown(jeK('Enter')); const je1 = jeB.n; jeB.disabled = true; jeIn.on.keydown(jeK('Enter'));
        const ttS = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'tooltips.js'), 'utf8');
        check('the live test, 2026-10-30: a label marked data-tip-up has its tip above it, however tall it is, so the tip leaves the next box clear; hosting brings the room code and the words under it into view',
            /var big = !el\.dataset\.tipUp && /.test(ttS) && /if \(y \+ th > vh - 6 \|\| el\.dataset\.tipUp\) y =/.test(ttS) && /hiEl\.scrollIntoView\(\{ block: 'start' \}\)/.test(src));
        check('the live test, 2026-10-30, Enter in a join box (pressOnEnter, run for real): it presses the button once, never for another key, while composing or while the button is held back; both join forms\' code and password boxes are wired; the Room code tooltip on the join page is a player\'s words and stands above the box, the GM\'s words on the GM\'s own code',
            je0 === 0 && je1 === 1 && jeB.n === 1 && jeSt === 1 && /\['wcJoinCode', 'wcJoinPass'\]\.forEach\(function\(id\) \{ pressOnEnter\(document\.getElementById\(id\), joinGo\); \}\);/.test(mainSrc) && /\['netCodeInput', 'netJoinPassInput'\]\.forEach/.test(mainSrc)
            && /'room code': 'The code your GM sent you\./.test(tipsSrc) && !/Send this to your players/.test(tipsSrc) && /<label class="wc-field" data-tip-up="1"><span>Room code<\/span>/.test(html) && /title="Send this to your players\.[^"]*">Room code<\/div>/.test(html), J([je0, je1, jeB.n, jeSt]));
        // The review of multiplayer chat (1.6.3): while a join is still under way the Multiplayer window's Join button is off, and a press handed
        // to a disabled button does nothing, so the welcome's Join stood at Connecting for good. The welcome's Join handler, cut from main.js and
        // run for real: it asks wpNet.joinLocked first and says why in its own status line, its button left on
        const mN = mainSrc.replace(/\r\n/g, '\n'), wgA = mN.indexOf("      if (joinGo) joinGo.addEventListener('click', function() {"), wgE = wgA < 0 ? -1 : mN.indexOf('\n      });', wgA), wgS = wgA < 0 || wgE < 0 ? '' : mN.slice(wgA, wgE + 10);
        const runWg = locked => {
            const els = { wcJoinStatus: { textContent: '', className: '' }, wcJoinCode: { value: 'ABCDE-FGHJK' }, wcNameInput: { value: 'Ayla', focus() {} }, netCodeInput: { value: '' }, netNameInput: { value: '' }, netJoinPassInput: { value: '' }, wcJoinPass: { value: '' }, netJoinBtn: { n: 0, click() { this.n++; } } };
            let hd = null; const joinGo = { disabled: false, addEventListener: (t, f) => { hd = f; } }, wpNet = { joinLocked: () => locked, typedCode: c => c.replace(/[-\s]/g, '').toLowerCase() };
            new Function('document', 'window', 'saveWcProfile', 'joinGo', wgS)({ getElementById: id => els[id] || null }, { wpNet }, () => {}, joinGo);
            if (hd) hd();
            return [els.netJoinBtn.n, joinGo.disabled, els.wcJoinStatus.textContent, els.wcJoinStatus.className, wpNet.fromWelcome === true];
        };
        const wgL = wgS ? runWg(true) : [], wgF = wgS ? runWg(false) : [];
        check('the review of multiplayer chat (the welcome\'s Join handler, run for real): while Waypoint is still trying to reach a table the welcome\'s Join hands nothing on, says why in its own line, and stays on; with no join under way it hands the join to the Multiplayer window\'s Join as before; net.js publishes joinLocked',
            J(wgL) === J([0, false, 'Waypoint is still trying to reach a table. Wait for that to end, then press Join again.', 'wc-join-status err', false]) && J(wgF) === J([1, true, 'Connecting\u2026', 'wc-join-status', true])
            && src.includes('net.joinLocked = joinLocked;'), J([wgL, wgF]));
    }

    /* ---- 1.6.3 (the improvement week's review of multiplayer, finding 14): the Host part says which server its room code is on ---- */
    {
        const rcW = sl('roomcode'), sgW = sl('signal');
        const W14 = rcW && sgW ? new Function('window', 'localStorage', 'fetch', 'net', 'crypto', rcW + '\n' + sgW + '\nreturn { codeWhereWords, codeOwn };')(undefined, { getItem: () => null }, () => Promise.reject(new Error('no')), {}, globalThis.crypto) : null;
        const ownW = W14 ? W14.codeWhereWords('wpabcdefghjk') : '', pubW = W14 ? W14.codeWhereWords('abcdefghjk') : '';
        const htmlW = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.3 finding 14 (the signal slice, run for real): the Host part says under the room code which server it is on, in plain words: a WP code on Waypoint\'s own server, which a browser\'s player can find, and any other on the public server, with what to tick for players who join from a browser; the line stands under the code and is filled as the table opens; Settings and Help tell the GM to tick Own signaling server when any player joins from a browser, and nothing tells them to leave it off',
            !!W14 && ownW === 'This code is on Waypoint\u2019s own server. Players can join it from Waypoint or from a browser.' && pubW === 'This code is on the public server. A player joining from a browser cannot find it. For them, tick Own signaling server in Settings, under Multiplayer, and host again.'
            && /id="netCopyBtn"[^\n]*\n\s*<\/div>\n\s*<div id="netCodeWhere" class="set-line"><\/div>/.test(htmlW) && /var whereEl = ui\('netCodeWhere'\); if \(whereEl && typeof codeWhereWords === 'function'\) whereEl\.textContent = codeWhereWords\(code\);/.test(src)
            && htmlW.includes('<small>Waypoint&rsquo;s own server for finding tables. Tick it if any player joins from a browser.</small>') && htmlW.includes('Tick it if any of your players join from a browser. The website finds tables only on Waypoint&rsquo;s own server.')
            && !/Leave it off until you are told/.test(htmlW) && !/Off until it is set up/.test(htmlW), J([ownW, pubW]));
    }

    /* ---- 1.6.2 (backlog 220): the app's own signaling server, built dark ---- */
    {
        const sgSrc = sl('signal'), rlSrc = sl('relay'), hp2 = sl('hostpeer'), store = {}, ls = { getItem: k => (k in store ? store[k] : null) };
        const mk = (answer, web, fetchFn) => { const w = { wpWebMode: { answer: Promise.resolve(answer), web: () => web } }; return new Function('window', 'localStorage', 'fetch', 'net', sgSrc + '\nreturn { signalHost, signalOn, signalWeb, hostToken, miss: signalMiss, plan: SIGNAL_PLAN, tok: function() { return _hostTok; } };')(w, ls, fetchFn || (() => Promise.reject(new Error('no'))), {}); };
        const resp = (status, body) => () => Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) });
        const off = mk(null, false), webOn = mk({ web: { plan: 'gm', can: ['join', 'host'], signal: { host: 'signal.waypointvtt.com' } } }, true, resp(200, { token: 'wph1.abc.def', expires: 1 })), webOther = mk({ web: { signal: { host: 'evil.example.com' } } }, true);
        await Promise.resolve(); await Promise.resolve();
        const o0 = { config: { iceServers: [] } }, r = {};
        r.off = [off.signalHost(), off.signalOn(o0) === o0, off.signalWeb()];
        r.web = [webOn.signalHost(), JSON.stringify(webOn.signalOn(o0)), JSON.stringify(webOn.signalOn(o0, 'wph1.abc.def')), webOn.signalWeb()];
        r.other = [webOther.signalHost()]; r.miss = [off.miss(), /Own signaling server/.test(webOn.miss())];
        store.wp_signalOwn = '1'; r.pref = [off.signalHost(), off.signalWeb()]; delete store.wp_signalOwn;
        r.tok = await webOn.hostToken(); r.plan = await mk(null, true, resp(403, { error: 'plan' })).hostToken(); r.bad = await mk(null, true, resp(200, { token: '<script>' })).hostToken(); r.down = await mk(null, true).hostToken(); r.err = await mk(null, true, resp(500, {})).hostToken();
        const N = src;
        check('1.6.2 (backlog 220) the app\'s own signaling server, built dark (net.js signal sliced and run for real): off by default every Peer gets the options it always had; the play host\'s web.signal naming signal.waypointvtt.com, or this computer\'s Own signaling server ticked, turns it on for a host and a joiner alike, any other host named is nothing; it merges the server, port 443, path /, secure and key waypoint, a host\'s token its key, the ICE config kept; a browser asks the site for a host token, a 403 being the plan\'s answer, and anything else that is no token none; startHosting asks for one before a Peer is made and makes no Peer without one, a refused key ends the try in plain words and takes no next generation, and the hourly drop is said only where re-registering takes longer than a few seconds; a room not found while it is on says the GM may be on the public server and needs the tick (the coordinator, 2026-11-10)',
            J(r.off) === J(['', true, false]) && r.web[0] === 'signal.waypointvtt.com' && r.web[1] === J({ host: 'signal.waypointvtt.com', port: 443, path: '/', secure: true, key: 'waypoint', config: { iceServers: [] } }) && JSON.parse(r.web[2]).key === 'wph1.abc.def' && r.web[3] === true
            && J(r.other) === J(['']) && J(r.pref) === J(['signal.waypointvtt.com', false]) && J(r.tok) === J({ token: 'wph1.abc.def' }) && J(r.plan) === J({ plan: true }) && r.bad === null && r.down === null && r.err === null
            && /return typeof signalOn === 'function' \? signalOn\(o, key, own\) : o;/.test(rlSrc) /* 1.6.3 (backlog 241): a marked code's join names the own server, moved on purpose */ && N.includes("if (typeof signalWeb === 'function' && signalWeb() && !_hostTok) {") && N.includes("_hostTok = r.token; try { startHosting(forceFresh); } finally { _hostTok = null; }")
            && /type === 'invalid-key' && !opened\) \{[^\n]*closing = true;[^\n]*return; \}/.test(hp2) && /sayDrop\(codeLine\(\) \+ ' \\u2014 the link that lets new players find you dropped;/.test(hp2) && webOn.plan === 'This plan joins tables. Hosting in the browser needs a GM plan.'
            && J(r.miss) === J(['', true]) && N.includes("var missJ = err.type === 'peer-unavailable' && typeof signalMiss === 'function' ? signalMiss(code) : '';") && N.includes("var missF = typeof signalMiss === 'function' ? signalMiss(code) : ''") && N.includes("setStatus(missF ? (baseF || 'No table answered at that code.') + missF :") /* 1.6.3 (finding 10): signalMiss's answer stands in place of the relay advice, which only a table that answered and never connected gets, moved on purpose */ /* 1.6.3 (backlog 241): handed the code, moved on purpose */,
            J(r));
    }

    /* ---- 1.6.3 (backlog 241; the owner, by prompt: "the room code" carries a mark): a desktop player joins a table hosted from a browser ----
       A table on Waypoint's own signaling server has a room code that begins with WP. The roomcode, relay and signal slices are run together for
       real, then the lines of startHosting that choose the code and the line of joinSession that makes the Peer, each sliced from net.js. */
    {
        const rcSrc = sl('roomcode'), rlSrc = sl('relay'), sgSrc = sl('signal'), store = {}, ls = { getItem: k => (k in store ? store[k] : null) };
        const pick = (from, to) => { const i = src.indexOf(from), j = i < 0 ? -1 : src.indexOf(to, i); return i < 0 || j < 0 ? '' : src.slice(i, src.indexOf('\n', j)); };
        const hostLines = pick('    var ownSig = typeof signalHost', '    var code = resumed ||'), joinLine = pick('    var peer = new Peer(peerOpts(undefined', '    var peer = new Peer(peerOpts(undefined');
        // the review of 241: a reconnect (scheduleReconnect) and a reload's rejoin (the rejoin slice) dial again through joinSession; here joinSession
        // is the join line itself, so the Peer each one makes is read
        const rjSrc = sl('rejoin'), schedSrc = (() => { const i = src.indexOf('function scheduleReconnect() {'); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 2); })();
        const toasts = [];
        let r = {}, err = 'no slice';
        if (rcSrc && rlSrc && sgSrc && hostLines && joinLine && rjSrc && schedSrc) err = noThrow(() => {
            // one world: the three slices, a Peer that keeps the options it was made with, a website's answer or none, and the code chooser and the join line
            const mk = answer => new Function('window', 'localStorage', 'fetch', 'net', 'toast', 'crypto', 'setTimeout', [rcSrc, rlSrc, sgSrc,
                'function Peer(a, b) { this.opts = b === undefined ? a : b; this.id = b === undefined ? null : a; }',
                'function host(forceFresh, remembered) { var recentHostCode = function() { return remembered; };', hostLines, 'return code; }',
                'function join(code) { code = typedCode(code);', joinLine, 'return peer.opts; }',
                'var RECONNECT_TRIES = 30, reconn = { tries: 0, timer: null, code: null, name: null, pending: false, gen: 0 }, dialed = [];',
                'function giveUpAndRestore() {} function setIndicator() {} function setStatus() {}',
                'function joinSession(code, name, isRetry, probe) { dialed.push(join(code)); }',
                rjSrc, schedSrc,
                'function reconnect(code) { reconn.code = code; reconn.tries = 0; scheduleReconnect(); return dialed[dialed.length - 1]; }',
                'function rejoin(code) { rejoinArm(code, "Ayla"); return rejoinKeep() ? dialed[dialed.length - 1] : null; }',
                'return { host: host, join: join, codeOwn: codeOwn, showCode: showCode, typedCode: typedCode, makeCode: makeCode, miss: signalMiss, mark: CODE_MARK, typo: codeTypo, reconnect: reconnect, rejoin: rejoin };'].join('\n'))({ wpWebMode: { answer: Promise.resolve(answer), web: () => !!answer } }, ls, () => Promise.reject(new Error('no')), {}, t => toasts.push(String(t)), globalThis.crypto, f => f());
            const off = mk(null), M = 'wpabcdefghjk';
            r.own = [M, 'WP-ABCDE-FGHJK', ' wp abcde – fghjk ', 'Wp‑ABCDE‑FGHJK'].map(c => off.codeOwn(c));
            r.not = ['abcdefghjk', 'wpabcdefghj', 'wpabcdefghjkm', 'wpabcdefghjl', 'wpab23', 'xyabcdefghjk', '', null, undefined, 7, {}].map(c => off.codeOwn(c));
            r.show = [off.showCode(M), off.showCode('WP-ABCDE-FGHJK'), off.showCode('abcdefghjk'), off.showCode('wpabcdefghj')];
            r.typed = off.typedCode('WP-ABCDE-FGHJK'); r.room = new Function(lineOfT('function roomPeerId(code, gen) {') + '\nreturn roomPeerId;')()(r.typed);
            r.oldLen = [r.typed.length !== 10, r.typed.length !== 6];
            // the host: off, a usual code; the tick on, a marked one; a code remembered from the other server is not taken up again
            const hOff = off.host(false, null); store.wp_signalOwn = '1'; const hOn = off.host(false, null), hKeep = off.host(false, M), hDrop = off.host(false, 'abcdefghjk'), hFresh = off.host(true, M); delete store.wp_signalOwn;
            const hBack = off.host(false, 'abcdefghjk'), hNot = off.host(false, M);
            r.host = [/^[a-hjkmnp-z2-9]{10}$/.test(hOff), off.codeOwn(hOn), hKeep === M, off.codeOwn(hDrop) && hDrop !== 'abcdefghjk', off.codeOwn(hFresh) && hFresh !== M, hBack === 'abcdefghjk', /^[a-hjkmnp-z2-9]{10}$/.test(hNot)];
            // the join: a marked code on the own server whatever the tick says, with its own key; a usual code as today
            const jM = off.join('WP-ABCDE-FGHJK'), jU = off.join('ABCDE-FGHJK'); store.wp_signalOwn = '1'; const jUon = off.join('abcdefghjk'), jMon = off.join(M); delete store.wp_signalOwn;
            r.join = [jM.host, jM.port, jM.path, jM.secure, jM.key, !!jM.config, 'host' in jU, jUon.host, jMon.host];
            // a room not found: no advice of the public server for a marked code, the advice as before for a usual one while the own server is on
            store.wp_signalOwn = '1'; r.miss = [off.miss(M), /Own signaling server/.test(off.miss('abcdefghjk')), /begins with WP/.test(off.miss('abcdefghjk'))]; delete store.wp_signalOwn;
            r.missOff = [off.miss(M), off.miss('abcdefghjk')];
            // the review of 241: a code remembered from the other server is dropped and the GM is told the code is new
            const tw = (fresh, remembered) => { const n = toasts.length; off.host(fresh, remembered); return toasts.slice(n); };
            store.wp_signalOwn = '1'; r.said = [tw(false, M), tw(false, 'abcdefghjk'), tw(true, M), tw(false, null)]; delete store.wp_signalOwn;
            r.said.push(tw(false, M), tw(false, 'abcdefghjk'));
            // the review of 241: a WP code mistyped with a character no code has is said as such, with the tick on or off, never as the tick's advice
            r.typo = ['WP-ABCD0-FGHJK', 'wpabcdefghjl', 'Wp-ABCDE-FGHJ1', M, 'WP-ABCDE-FGHJK', 'abcdefghjk', 'wpabcdefgh', 'wpabcdefghjkm', 'wp abcde-fghj!', '', null, 7].map(c => off.typo(c));
            const tm = off.miss('WP-ABCD0-FGHJK'); store.wp_signalOwn = '1'; const tmOn = off.miss('wp-abcdo-fghjk'); delete store.wp_signalOwn;
            r.typoMiss = [/never use: i, l, o, 0 or 1/.test(tm), tm === tmOn, /Own signaling server/.test(tm + tmOn), /relay/i.test(tm)];
            // the review of 241: a reconnect, a reload's rejoin and the code a reload keeps, with a marked code and the tick off, all dial the own server
            const rc = off.reconnect('wpabcdefghjk'), rj = off.rejoin('wpabcdefghjk'), rjU = off.rejoin('abcdefghjk'), kept = off.join(JSON.parse(JSON.stringify({ code: 'wpabcdefghjk', name: 'Ayla' })).code);
            r.again = [rc && rc.host, rj && rj.host, rjU && 'host' in rjU, kept.host];
            r.web = mk({ web: { signal: { host: 'signal.waypointvtt.com' } } });
        });
        if (r.web) { await Promise.resolve(); await Promise.resolve(); r.webHost = r.web.codeOwn(r.web.host(false, null)); r.webJoin = r.web.join('abcdefghjk').host; delete r.web; }
        check('1.6.3 (backlog 241) the room code carries a mark (the roomcode, relay and signal slices run for real): a code begins with WP where it is for Waypoint\'s own signaling server, read as typed or pasted with its hyphens and spaces, in any case, and only as the two letters and a whole code of the alphabet, so a usual code, a shorter or longer one, a letter the alphabet lacks, an older six-character code and anything that is no code never reads as marked; it is shown and copied as WP-XXXXX-XXXXX, and its room id is waypoint- and the whole code, so the key proof is over the same room on both sides; its typed form is never a usual code\'s length, so an older app dials a room that is not there',
            err === '' && J(r.own) === J([true, true, true, true]) && r.not.every(v => v === false) && J(r.show) === J(['WP-ABCDE-FGHJK', 'WP-ABCDE-FGHJK', 'ABCDE-FGHJK', 'WPABCDEFGHJ']) && r.typed === 'wpabcdefghjk' && r.room === 'waypoint-wpabcdefghjk' && J(r.oldLen) === J([true, true]), J([err, r.own, r.not, r.show, r.typed, r.room]));
        check('1.6.3 (backlog 241) a host on the own server gives a marked code (startHosting\'s lines run for real): the tick off, a usual code; the tick on, or a website that names the own server, a marked one; a remembered code is taken up again only from the server it was made on, so a GM who switched never hands players a code that dials where the table is not; Host anew makes a new code',
            err === '' && J(r.host) === J([true, true, true, true, true, true, true]) && r.webHost === true && /var code = resumed \|\| \(ownSig \? CODE_MARK : ''\) \+ makeCode\(\);/.test(hostLines), J([err, r.host, r.webHost]));
        check('1.6.3 (backlog 241) a marked code is joined on the own server for that join alone (joinSession\'s line run for real): whatever this computer\'s tick says, the Peer names signal.waypointvtt.com on port 443, path /, secure, key waypoint, the ICE config kept; a usual code joins as today, on the public server with the tick off and on the own server with it on or on a website; a room not found with a marked code adds no advice of the public server, and the advice for a usual code says the new code begins with WP',
            err === '' && J(r.join) === J(['signal.waypointvtt.com', 443, '/', true, 'waypoint', true, false, 'signal.waypointvtt.com', 'signal.waypointvtt.com']) && r.webJoin === 'signal.waypointvtt.com' && J(r.miss) === J(['', true, true]) && J(r.missOff) === J(['', '']), J([err, r.join, r.webJoin, r.miss, r.missOff]));
        check('1.6.3 (the review of backlog 241) a code remembered for a crash resume that is dropped because the GM switched servers is said (startHosting\'s lines run for real): the tick on with a remembered usual code, and the tick off with a remembered marked one, each say the last room code could not be resumed and the players need the new one, in the words of the path where a room id is taken; a code kept, a fresh host and no remembered code say nothing',
            err === '' && J(r.said) === J([[], ['Your last room code could not be resumed. Starting with a new code. Players will need the new one.'], [], [], ['Your last room code could not be resumed. Starting with a new code. Players will need the new one.'], []])
            && src.includes("if (resumed) toast('Your last room code could not be resumed. Starting with a new code. Players will need the new one.');"), J([err, r.said]));
        check('1.6.3 (the review of backlog 241) a code typed as if it carried the mark but holding a character no code has (i, l, o, 0 or 1) is told apart (codeTypo, the roomcode and signal slices run for real): a misread or mistyped WP code in any case or spacing is one, a real marked code, a usual code, a shorter or longer one, a character that is no letter or digit and anything that is no code are not; a room not found with such a code says it holds a character Waypoint never uses, with the tick on or off alike, and names neither the tick nor a relay; both places a room is not found hand signalMiss the code, and its answer stands in place of the relay advice',
            err === '' && J(r.typo) === J([true, true, true, false, false, false, false, false, false, false, false, false]) && J(r.typoMiss) === J([true, true, false, false])
            && src.includes("var missF = typeof signalMiss === 'function' ? signalMiss(code) : ''") && src.includes("setStatus(missF ? (baseF || 'No table answered at that code.') + missF :") /* 1.6.3 (finding 10): signalMiss's answer stands in place of the relay advice, which only a table that answered and never connected gets, moved on purpose */, J([err, r.typo, r.typoMiss]));
        check('1.6.3 (the review of backlog 241) every way a join is made again keeps the mark\'s route (the rejoin slice and scheduleReconnect run for real, joinSession\'s Peer line behind them): with the tick off, an automatic reconnect with a marked code in reconn.code, a reload\'s rejoin that goes on as a reconnect, and the code a reload keeps in wp_rejoin each make the Peer on signal.waypointvtt.com, and a usual code\'s rejoin names no server; each of them, and a retry through the room generations, goes back through joinSession with the code as stored (reconn.code is net.code, wp_rejoin holds net.code, the reload and the generations call joinSession), and net.js makes exactly two Peers, the host\'s and joinSession\'s, so a new one has to come through peerOpts',
            err === '' && J(r.again) === J(['signal.waypointvtt.com', 'signal.waypointvtt.com', false, 'signal.waypointvtt.com'])
            && (src.match(/new Peer\(/g) || []).length === 2 && src.includes('            reconn.code = net.code;') && /var rjM = \{ code: net\.code, /.test(src) && src.includes('                joinSession(j.code, j.name);')
            && src.includes('if (typeof rejoinArm === \'function\') rejoinArm(j.code, j.name);') && (src.match(/joinSession\(code, name, false, probe \+ 1\)/g) || []).length === 2 && src.includes('reconn.timer = setTimeout(function() { joinSession(reconn.code, reconn.name, true); }'), J([err, r.again]));
        const html241 = rd('system/app/index.html'), lk241 = rd('tools/lookcheck.js');
        check('1.6.3 (the review of backlog 241) every place that says what a room code looks like names a marked one too: the Join box\'s tooltip says ten characters as XXXXX-XXXXX or WP-XXXXX-XXXXX on the Waypoint server, the host\'s Help tip and the player\'s join steps give WP-AB2CD-EF3GH, the crash tip says the code is new where Own signaling server was switched in between, and the Own signaling server tip says where any other code is looked for, a browser included; lookcheck\'s pin of the tooltip moved with it',
            tipsSrc.includes("    netCodeInput: 'The room code your GM gave you: ten characters shown as XXXXX-XXXXX, or WP-XXXXX-XXXXX for a table on the Waypoint server. Type or paste it with or without the hyphens.',") && lk241.includes('or WP-XXXXX-XXXXX for a table on the Waypoint server. Type or paste it with or without the hyphens.\',") === 1')
            && html241.includes('like <b>AB2CD-EF3GH</b>. A table on Waypoint&rsquo;s own server has <b>WP</b> in front, like <b>WP-AB2CD-EF3GH</b>.') && html241.includes('A code looks like <b>AB2CD-EF3GH</b>, or <b>WP-AB2CD-EF3GH</b> for a table on Waypoint&rsquo;s own server, such as one hosted in a browser.')
            && html241.includes('You get the same room code back, unless you switched <b>Own signaling server</b> on or off in between: then the code is new.') && html241.includes('Any other code is looked for on the server Waypoint uses for you: the public one, unless this tick is on or you play in a browser.</div>') && !html241.includes('the server the tick names'));
        check('1.6.3 (backlog 241) said plainly: Help says a table on the own server, as every table hosted in a browser is, has a code that begins with WP and is joined there whatever the tick says; the Join box\'s line and the tick\'s tooltip say it; the key proof, the signaling gate and the page policy are untouched (the own server is the one already named)',
            /has a room code that begins with <b>WP<\/b>, like <b>WP-AB2CD-EF3GH<\/b>\. Waypoint joins such a code through its own server whatever the tick says/.test(html241) && /A code that begins with WP is found on the Waypoint server\.<\/div>/.test(html241)
            && /A table you host then has a room code that begins with WP, and a player joins such a code there whatever their own tick says\./.test(html241) && /sigGate\(peer, false, roomPeerId\(code, gen\)\);/.test(src) && / A code that begins with WP is found on the Waypoint server\.'\]/.test(lk241));
    }

    /* ---- T2 (TRANSPORT-2): a room id taken by someone else never ends a live table ---- */
    {
        const hpSrc = sl('hostpeer');
        const mkPeer = () => { const p = { h: {}, destroyed: false, reconnects: 0, destroys: 0, on(ev, fn) { (p.h[ev] = p.h[ev] || []).push(fn); }, emit(ev, a) { (p.h[ev] || []).slice().forEach(f => f(a)); }, destroy() { p.destroys++; p.emit('disconnected'); p.destroyed = true; }, reconnect() { p.reconnects++; } }; return p; };
        const mkHost = o => {
            o = o || {}; const w = { status: [], toasts: [], logs: [], timers: [], hosted: [], forgot: 0, hb: 0, remembered: 0, saves: 0, threw: '' };
            const net = { peer: null, active: false, role: 'host', conns: [], roster: Object.create(null), code: 'abcde23456', _hostGen: o.gen || 0, applyingRemote: false }, peer = mkPeer(); net.peer = peer; w.net = net; w.peer = peer; w.meta = Object.create(null);
            const names = ['console', 'net', 'peer', 'code', 'gen', 'resumed', 'setStatus', 'showCode', 'rememberHostCode', 'toast', 'logEvent', 'startHeartbeat', 'ui', 'syncSessionButtons', 'renderRoster', 'getActiveCampaign', 'SC', 'save', 'connShapeOk', 'wireGuard', 'unadmittedRoom', '_connMeta', 'assetNoteSends', 'wireConn', 'setTimeout', 'ROOM_GENS', 'startHosting', 'forgetHostCode', 'Date', 'fightsBack'];
            const vals = [{ warn() {} }, net, peer, 'abcde23456', o.gen || 0, o.resumed ? 'abcde23456' : null, s => w.status.push(s), c => 'SHOWN:' + c, () => { w.remembered++; }, t => w.toasts.push(t), (k, t) => w.logs.push(k + '|' + t), () => { w.hb++; }, () => ({ style: {}, textContent: '' }), () => {}, () => {}, () => null, () => null, () => { w.saves++; },
                o.shape || (() => true), o.guard || (() => true), () => true, w.meta, () => {}, c => { w.wired = (w.wired || 0) + 1; }, (fn, ms) => { w.timers.push({ fn, ms }); return w.timers.length; }, 4, fresh => w.hosted.push(fresh), () => { w.forgot++; }, Date, () => { w.backs = (w.backs || 0) + 1; }];
            try { new Function(...names, (sl('networds') || '') + '\n' + hpSrc)(...vals); } catch (e) { w.threw = String(e && e.message); }   // 1.6.3 (finding 10): with the plain words a failed hosting says
            w.fire = () => { const t = w.timers.splice(0); t.forEach(x => x.fn()); return t.map(x => x.ms); };
            w.conn = id => ({ peer: id, open: true, serialization: 'binary', on() {}, close() { this.open = false; }, send() {} });
            return w;
        };
        let a = {}, b = {}, c = {}, d = {}, err = 'no slice';
        if (hpSrc) err = noThrow(() => {
            // (1) taken after open keeps the table
            const A = mkHost(); A.peer.emit('open'); const c1 = A.conn('p1'), c2 = A.conn('p2'); A.peer.emit('connection', c1); A.peer.emit('connection', c2);
            const t0 = A.toasts.length, hb0 = A.hb;
            for (let i = 0; i < 3; i++) { A.peer.emit('error', { type: 'unavailable-id' }); A.peer.emit('disconnected'); A.fire(); }
            a = { threw: A.threw, destroys: A.peer.destroys, open: [c1.open, c2.open], conns: A.net.conns.length, code: A.net.code, same: A.net.peer === A.peer, hosted: A.hosted.length, told: A.toasts.slice(t0).filter(t => /in use somewhere else/.test(t)).length, toastsMore: A.toasts.length - t0, status: A.status[A.status.length - 1], active: A.net.active, logged: A.logs.filter(t => /in use elsewhere/.test(t)).length };
            A.peer.emit('open'); A.fire();
            a.back = { status: A.status[A.status.length - 1], again: A.toasts.filter(t => /yours again/.test(t)).length, started: A.toasts.filter(t => /Hosting started/.test(t)).length, hb: A.hb - hb0, startedLog: A.logs.filter(t => /Session started/.test(t)).length, kinds: A.logs.map(t => t.split('|')[0] + (/in use elsewhere/.test(t) ? ':taken' : /free again/.test(t) ? ':free' : '')) };
            A.peer.emit('open'); a.back2 = A.toasts.filter(t => /yours again/.test(t)).length;
            // (2) the re-registration backs off
            const B = mkHost(); B.peer.emit('open'); const seq = [];
            B.peer.emit('disconnected'); seq.push([B.peer.reconnects, B.timers.length]);            // at once
            B.peer.emit('disconnected'); seq.push([B.peer.reconnects, B.timers.map(t => t.ms)]);     // from a timer
            B.peer.emit('disconnected'); seq.push([B.peer.reconnects, B.timers.length]);            // one try waiting: no second timer
            const waits = [B.timers[0].ms]; B.fire(); seq.push(B.peer.reconnects);
            for (let i = 0; i < 7; i++) { B.peer.emit('disconnected'); waits.push(B.timers[0].ms); B.fire(); }
            const after = B.peer.reconnects; B.peer.emit('open'); B.peer.emit('disconnected'); const reset = [B.peer.reconnects - after, B.timers.length];
            B.peer.emit('disconnected'); B.net.peer = { other: true }; const before = B.peer.reconnects; B.fire(); B.peer.emit('disconnected'); const letGo = [B.peer.reconnects - before, B.timers.length];
            const B2 = mkHost(); B2.peer.emit('open'); B2.net.active = false; B2.peer.emit('disconnected'); const ended = [B2.peer.reconnects, B2.timers.length];
            const B3 = mkHost(); B3.peer.emit('disconnected'); const neverOpen = [B3.peer.reconnects, B3.timers.length];
            b = { threw: B.threw, seq, waits, reset, letGo, ended, neverOpen };
            // (3) a registration that never opened: as before
            const C1 = mkHost({ resumed: true, gen: 0 }); C1.peer.emit('error', { type: 'unavailable-id' }); const c1t = C1.timers.map(t => t.ms); C1.fire();
            const C2 = mkHost(); C2.peer.emit('error', { type: 'unavailable-id' }); const c2t = C2.timers.map(t => t.ms); C2.fire();
            const C3 = mkHost({ resumed: true, gen: 3 }); C3.peer.emit('error', { type: 'unavailable-id' }); C3.fire();
            c = { one: [C1.peer.destroys, C1.peer.reconnects, C1.net._hostGen, c1t, C1.hosted, C1.forgot, C1.toasts.length], two: [C2.peer.destroys, C2.peer.reconnects, c2t, C2.hosted, C2.forgot, C2.toasts], three: [C3.peer.destroys, C3.peer.reconnects, C3.hosted, C3.forgot, C3.toasts.length, /could not be resumed/.test(C3.toasts[0] || '')] };
            // (4) other errors: before the table opened the status says so; once open the room code stays in the status line
            const D = mkHost(); D.peer.emit('error', { type: 'network' }); const pre = D.status[D.status.length - 1];
            D.peer.emit('open'); const live = D.status[D.status.length - 1]; D.peer.emit('error', { type: 'webrtc' }); D.peer.emit('error', { type: 'peer-unavailable' }); const kept = D.status[D.status.length - 1];
            D.peer.emit('error', { type: 'network' }); const net2 = D.status[D.status.length - 1];
            d = { pre, live, kept, net2 };
            // 1.6.2 (the review of the click test's fixes): a table that fails before it opens gives a held fight back on this machine (fightsBack), once; the invalid-key refusal too; an error once it is open asks nothing more, and a held id taking the next generation leaves it to that try
            const E1 = mkHost(); E1.peer.emit('error', { type: 'network' }); const E2 = mkHost(); E2.peer.emit('error', { type: 'invalid-key' });
            const E3 = mkHost(); E3.peer.emit('open'); const e3o = E3.backs || 0; E3.peer.emit('error', { type: 'network' }); E3.peer.emit('error', { type: 'invalid-key' });
            const E4 = mkHost({ resumed: true, gen: 0 }); E4.peer.emit('error', { type: 'unavailable-id' });
            d.backs = [E1.backs || 0, E1.status[E1.status.length - 1], E2.backs || 0, E2.peer.destroys, e3o, (E3.backs || 0) - e3o, E4.backs || 0];
        });
        check('transport T2 (the host\'s peer wiring, run for real): once the table has opened, an "id is taken" from the signaling service — however often it repeats — destroys nothing: both players\' connections stay open and listed, the code, the room and the peer are the same, no new hosting is started, and the GM is told once (a toast, the status line, a table line in the session log — never a session line, which the log reads as the end of the session); when the id comes back the status line shows the code again and says so once, with no second "Hosting started", heartbeat or log line',
            err === '' && a.threw === '' && a.destroys === 0 && J(a.open) === J([true, true]) && a.conns === 2 && a.code === 'abcde23456' && a.same === true && a.hosted === 0 && a.told === 1 && a.toastsMore === 1 && /in use somewhere else/.test(a.status) && a.active === true && a.logged === 1
            && a.back && a.back.status === 'Hosting — room code: SHOWN:abcde23456' && a.back.again === 1 && a.back.started === 1 && a.back.hb === 0 && a.back.startedLog === 1 && a.back2 === 1 && J(a.back.kinds) === J(['session', 'table:taken', 'table:free']), J([err, a]));
        check('transport T2 (the re-registration backs off): the first lost link asks for the id again at once; each one after that from a timer — 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s at most — never two tries waiting, starting over once the id is held again; a peer the table has let go of, a table that ended and one that never opened ask for nothing',
            err === '' && b.threw === '' && J(b.seq) === J([[1, 0], [1, [1000]], [1, 1], 2]) && J(b.waits) === J([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]) && J(b.reset) === J([1, 0]) && J(b.letGo) === J([0, 0]) && J(b.ended) === J([0, 0]) && J(b.neverOpen) === J([0, 0]), J([err, b]));
        check('transport T2 (a registration that never opened, as before): a resumed code whose generation is held takes the next generation of the same code; a fresh code that is held, or a resumed one with no generation left, takes a new code (the old one forgotten, the GM told); the peer is destroyed once and never asked to register again on its way down',
            err === '' && J(c.one) === J([1, 0, 1, [200], [false], 0, 0]) && J(c.two) === J([1, 0, [300], [true], 1, ['Code collision. Trying another code.']]) && J(c.three) === J([1, 0, [true], 1, 1, true]), J([err, c]));
        check('transport T2 (the status line of a live table): an error before the table opened is said as before; once it is open the room code stays in the status line — a stranger\'s bad dial changes nothing on the GM\'s screen, and a dropped signaling link is said beside the code',
            err === '' && d.pre === 'Waypoint could not reach the server that finds tables, so no room code was made. Check your internet and try again.' /* 1.6.3 (finding 10): plain words, moved on purpose */ && d.live === 'Hosting — room code: SHOWN:abcde23456' && d.kept === d.live && d.net2.indexOf(d.live) === 0 && /reconnecting/.test(d.net2), J([err, d]));
        check('1.6.2 a table that fails before it opens gives a held fight back (the host\'s peer wiring, run for real with a recorder in fightsBack\'s place): a network error before the open asks fightsBack once and still says Host error; the website\'s invalid-key refusal asks it once as it destroys the peer; once the table is open its own open asked it and no later error asks again; a held id taking the next generation asks nothing, that try holding the fight',
            err === '' && J(d.backs) === J([1, 'Waypoint could not reach the server that finds tables, so no room code was made. Check your internet and try again.', 1, 1, 1, 0, 0]) /* 1.6.3 (finding 10): plain words, moved on purpose */, J([err, d.backs]));
        // 1.6.3 (the improvement week's review of multiplayer, findings 7 and 10): every failed join or hosting says what happened in plain words, never
        // the connection library's own error type, and the advice about a relay server comes only where a table answered and never connected
        const nwSrc = sl('networds');
        const NW = nwSrc ? new Function('console', nwSrc + '\nreturn { joinErrWords, hostErrWords, noRouteWords, netErrLog };')({ warn: () => {} }) : null;
        const types = ['peer-unavailable', 'network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'browser-incompatible', 'invalid-id', 'ssl-unavailable', 'webrtc', 'unavailable-id', 'something-new', undefined];
        const jw = NW ? types.map(t => NW.joinErrWords(t)) : [], hw = NW ? types.map(t => NW.hostErrWords(t)) : [];
        const plain = s => typeof s === 'string' && /\.$/.test(s) && !/[()\[\];]|ICE|NAT|peer-|socket|webrtc|undefined/.test(s);
        const nr = NW ? [NW.noRouteWords(true), NW.noRouteWords(false)] : [];
        check('1.6.3 findings 7 and 10 (the networds slice, run for real): a code that finds no table says so and asks the player to check it with their GM; a server that cannot be reached says so, for a join and for hosting; every other type has plain words of its own or a plain fallback, never the library\'s own word, a bracket, ICE or NAT; a connection that never opened to a table that answered names the relay setting in Settings, under Multiplayer, in plain words',
            !!NW && jw[0] === 'No table is open at that code. Check the code with your GM. Their table may not be open yet.' && jw[1] === 'Waypoint could not reach the server that finds tables. Check your internet and try again.' && jw.slice(1, 6).every(s => s === jw[1])
            && /no room code was made/.test(hw[1]) && hw.slice(1, 6).every(s => s === hw[1]) && jw.concat(hw).every(plain) && jw[11] === 'Waypoint could not join the table. Try again in a moment.' && hw[11] === 'Hosting could not start. Try again in a moment.'
            && nr.every(s => plain(s) && /relay server in Settings, under Multiplayer\. Then join again\.$/.test(s)) && /^Your network and the GM\u2019s could not connect\./.test(nr[0]) && /^Waypoint found the GM\u2019s table/.test(nr[1])
            && /netErrLog\('join', err\.type\);[^\n]*\n\s*var slowJ = [^\n]*\n\s*var wordsJ = slowJ \? [^\n]*: missJ \? 'No table answered at that code\.' \+ missJ : joinErrWords\(err\.type\);\n\s*setStatus\(wordsJ\);/.test(src.replace(/\r\n/g, '\n'))   /* the review of multiplayer chat: a code where some generation answered and never connected says the relay words, moved on purpose */
            && /joinFailed\(noRouteWords\(false\)\);/.test(src) && /joinFailed\(noRouteWords\(true\)\);/.test(src) && !/Connection error: ' \+ err\.type/.test(src) && !/\(ICE ' \+ s/.test(src) && !/carrier-grade NAT and the table needs/.test(src),
            J({ jw, hw, nr }));
        // The review of multiplayer chat (1.6.3): a first join walks every room generation of the code (a table resumed after a crash lives under
        // one of them). The connection library reports a generation nobody holds as an error of the type peer-unavailable; that error used to
        // end the join at once, so a resumed table at generation 1 was never reached and a table that answered and never connected was told
        // "No table is open". joinSession and its error handler run for real here, with a stand-in connection library and a clock of the test's own
        {
            const jsSrc = (() => { const t = src.replace(/\r\n/g, '\n'), i = t.indexOf('var JOIN_ATTEMPT_MS = 7000;'), e = t.indexOf('\nfunction leaveSession(silent) {', i); return i < 0 || e < 0 ? '' : t.slice(i, e); })();
            const nwJ = sl('networds');
            const mkJ = () => {
                const w = { peers: [], timers: [], status: [], toasts: [], threw: '' };
                function Peer() { const p = { h: {}, destroyed: 0, conns: [], on(ev, fn) { (p.h[ev] = p.h[ev] || []).push(fn); }, emit(ev, a) { (p.h[ev] || []).slice().forEach(f => f(a)); }, destroy() { p.destroyed++; }, connect(id) { const c = { peer: id, open: false, h: {}, on(ev, fn) { (c.h[ev] = c.h[ev] || []).push(fn); }, emit(ev, a) { (c.h[ev] || []).slice().forEach(f => f(a)); }, send() {} }; p.conns.push(c); return c; } }; w.peers.push(p); return p; }
                const net = { active: false, role: null, peer: null, conns: [], code: null, fromWelcome: false };
                const reconn = { pending: false, gen: 0, tries: 0 };
                const scope = { net, reconn, Peer, ROOM_GENS: 4, peerLibMissing: () => false, typedCode: c => String(c).toLowerCase(), cancelReconnect() {}, rejoinDone() {}, ringReset() {}, leaveSession() {}, joinTrustReset() {},
                    setProfileName: n => ({ id: 'u_me', name: n }), getProfile: () => ({ id: 'u_me', name: 'Ayla' }), peerOpts: () => ({}), codeOwn: () => false, netPaneSync() {}, renderRoster() {}, syncSessionButtons() {},
                    setStatus: s => w.status.push(String(s)), showCode: c => c, relayWarn() {}, genNotRefused: (c, g) => g, retryGen: () => 0, roomPeerId: (c, g) => 'waypoint-' + c + (g ? '-r' + g : ''), sigGate() {}, newKey: () => 'k',
                    setTimeout: (fn, ms) => { w.timers.push({ fn, ms }); return w.timers.length; }, clearTimeout: id => { if (w.timers[id - 1]) w.timers[id - 1].off = true; }, setIndicator() {}, _joinTrust: { refused: null }, rejoinKeep: () => false,
                    HOST_LATE: '', SNAP_REFUSED: '', signalMiss: () => '', toast: t => w.toasts.push(String(t)), ui: () => null, load() {}, window: {}, snapAsk() {}, scheduleReconnect() {}, APP_VERSION: '1', hostWait() {}, startHeartbeat() {}, wireConn() {}, console: { warn() {} } };
                try { w.api = new Function('scope', 'with (scope) { ' + nwJ + '\n' + jsSrc + '\n return { joinSession: joinSession }; }')(scope); } catch (e) { w.threw = String(e && e.message); }
                w.net = net;
                w.last = () => w.peers[w.peers.length - 1];
                w.dialed = () => { const p = w.last(); p.emit('open'); return p.conns[0] ? p.conns[0].peer : ''; };   // the newest peer registers and dials its generation
                w.gone = () => { w.last().emit('error', { type: 'peer-unavailable' }); };   // that generation is not there
                w.slow = () => { const t = w.timers.filter(x => !x.off && x.ms === 7000).pop(); if (t) { t.off = true; t.fn(); } };   // its seven seconds pass with no answer
                return w;
            };
            let jr = {}, jerr = 'no slice';
            if (jsSrc && nwJ) jerr = noThrow(() => {
                // (a) generation 0 is not there: the join dials generation 1 at once, says nothing, and reaches the resumed table there
                const A = mkJ(); A.api.joinSession('abcdefghjk', 'Ayla'); const a0 = A.dialed(); A.gone(); const a1 = A.dialed();
                jr.a = [A.threw, a0, a1, A.peers.length, A.peers[0].destroyed > 0, A.status.length, A.toasts.length, A.net.peer === A.peers[1]];
                // (b) generation 0 answers nothing in its seven seconds and generations 1 to 3 are not there: the relay words, never "No table"
                const B = mkJ(); B.api.joinSession('abcdefghjk', 'Ayla'); const bd = [B.dialed()]; B.slow(); for (let g = 1; g < 4; g++) { bd.push(B.dialed()); B.gone(); }
                jr.b = [B.threw, bd, B.status.slice(-1)[0], B.toasts.slice(-1)[0], B.net.peer];
                // (c) no generation is there: no table at that code, said once, at the end of the walk
                const C = mkJ(); C.api.joinSession('abcdefghjk', 'Ayla'); const cd = []; for (let g = 0; g < 4; g++) { cd.push(C.dialed()); C.gone(); }
                jr.c = [C.threw, cd, C.status.slice(1), C.toasts, C.net.peer];
                // (d) a fresh join after a walk that met a silent generation starts clean: all four not there now is no table
                B.api.joinSession('abcdefghjk', 'Ayla'); for (let g = 0; g < 4; g++) { B.dialed(); B.gone(); }
                jr.d = B.status.slice(-1)[0];
            });
            const NO_T = 'No table is open at that code. Check the code with your GM. Their table may not be open yet.';
            check('the review of multiplayer chat (joinSession and its error handler run for real): a first join whose generation 0 is not there dials generation 1 at once, saying nothing and showing no notice, so a table resumed after a crash at generation 1 is reached; a walk on which one generation answered nothing in its seven seconds and the rest were not there ends with the relay words, never "No table is open"; a walk on which no generation is there says no table at that code once, at the end; a new join forgets the walk before it',
                jerr === '' && jr.a && jr.a[0] === '' && jr.a[1] === 'waypoint-abcdefghjk' && jr.a[2] === 'waypoint-abcdefghjk-r1' && jr.a[3] === 2 && jr.a[4] === true && jr.a[5] === 1 && jr.a[6] === 0 && jr.a[7] === true
                && J(jr.b[1]) === J(['waypoint-abcdefghjk', 'waypoint-abcdefghjk-r1', 'waypoint-abcdefghjk-r2', 'waypoint-abcdefghjk-r3']) && /^Waypoint found the GM’s table but could not connect to it\. .*relay server in Settings, under Multiplayer/.test(jr.b[2]) && jr.b[3] === jr.b[2] && jr.b[4] === null
                && J(jr.c[1]) === J(['waypoint-abcdefghjk', 'waypoint-abcdefghjk-r1', 'waypoint-abcdefghjk-r2', 'waypoint-abcdefghjk-r3']) && J(jr.c[2]) === J([NO_T]) && J(jr.c[3]) === J([NO_T]) && jr.c[4] === null
                && jr.d === NO_T, J([jerr, jr]));
        }
        check('transport T2 (teardown): leaveSession lets go of the peer before it destroys it, so the "disconnected" a peer says on its way down never registers it again',
            /var peerL = net\.peer; net\.peer = null; if \(peerL\) \{ try \{ peerL\.destroy\(\); \} catch \(e\) \{\} \}/.test(src) && !/if \(net\.peer\) \{ try \{ net\.peer\.destroy\(\); \} catch \(e\) \{\} \}\n/.test(src));
    }

    /* ---- T3 (TRANSPORT-8): relay-only says what it does ---- */
    {
        const rlSrc = sl('relay'); let r = {}, err = 'no slice';
        if (rlSrc) err = noThrow(() => {
            const run = st => { const toasts = [], ls = { getItem: k => (k in st ? st[k] : null) }; const api = new Function('localStorage', 'net', 'toast', rlSrc + '\nreturn { peerOpts: peerOpts, relayActive: relayActive, relayNote: relayNote, relayWarn: relayWarn, netActive: net.relayActive };')(ls, {}, t => toasts.push(t));
                const cfg = api.peerOpts().config; api.relayWarn(); return { active: api.relayActive(), same: api.netActive === api.relayActive, policy: cfg.iceTransportPolicy, urls: cfg.iceServers.map(s => [].concat(s.urls).join('+')), note: api.relayNote(), toasts }; };
            r.onNone = run({ wp_relayOnly: '1' }); r.onBad = run({ wp_relayOnly: '1', turn_urls: 'relay.example.org:3478' });
            r.onSet = run({ wp_relayOnly: '1', turn_urls: 'turn:relay.example.org:3478', turn_user: 'u', turn_pass: 'p' }); r.offSet = run({ wp_relayOnly: '0', turn_urls: 'turns:relay.example.org:5349' }); r.off = run({});
        });
        const direct = x => x && x.active === false && x.policy === undefined && J(x.urls) === J(['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']);
        check('transport T3 (relay-only, run for real): switched on with no relay on this computer — none set, or an address that is no relay\'s — the connection is an ordinary direct one and the app SAYS so: the status note names the missing relay and never reads "relay-only connections", and a notice tells you once per host or join',
            err === '' && direct(r.onNone) && direct(r.onBad) && [r.onNone, r.onBad].every(x => !/relay-only connections/.test(x.note) && /no relay server is set on this computer: connecting directly/.test(x.note) && x.toasts.length === 1 && /no relay server is set on this computer/.test(x.toasts[0]) && x.same === true), J([err, r.onNone, r.onBad]));
        check('transport T3 (relay-only, run for real): switched on with a relay set, the relay is the ONLY server named — no public address lookup beside it — and the only kind of path allowed, the note reads "relay-only connections" and nothing is warned; switched off, direct first with the relay as a fallback, as before',
            err === '' && r.onSet.active === true && r.onSet.policy === 'relay' && J(r.onSet.urls) === J(['turn:relay.example.org:3478']) && r.onSet.note === ' (relay-only connections)' && r.onSet.toasts.length === 0
            && r.offSet.active === false && r.offSet.policy === undefined && J(r.offSet.urls) === J(['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'turns:relay.example.org:5349']) && r.offSet.note === '' && r.offSet.toasts.length === 0 && r.off.note === '' && r.off.toasts.length === 0, J([err, r.onSet, r.offSet, r.off]));
        const outside = rlSrc ? noCm(src.replace(rlSrc, '')) : 'relayOnly(';
        check('transport T3 (wired): one judge everywhere — the host\'s status line reads relayNote and warns, a join the player began warns, the video cap reads relayActive, and the raw switch is read nowhere outside the relay slice; Settings shows the switch whenever it is on (so one that came with the saves folder can be seen and switched off), says "on, but no relay set", and removing the relay switches it off',
            !!rlSrc && !/relayOnly\(/.test(outside) && /'Starting host\.\.\.'\) \+ relayNote\(\)\);\n\s*relayWarn\(\);/.test(src) && /setStatus\('Connecting to ' \+ showCode\(code\) \+ '\.\.\.'\); relayWarn\(\); \}/.test(src) && /only = relayActive\(\);/.test(src)
            && /try \{ localStorage\.setItem\('wp_relayOnly', '0'\); \} catch \(e\) \{\}[^\n]*\n\s*saveTurnFields\(\); syncPanel\(\);/.test(settingsSrc) && /on, but no relay set/.test(settingsSrc) && /wpNet\.relayActive\(\)/.test(settingsSrc) && /rb\.style\.display = \(hasRelay \|\| relayFlag\) \? 'block' : 'none';/.test(settingsSrc) && /if \(ryBlock && localStorage\.getItem\('wp_relayOnly'\) === '1'\) ryBlock\.style\.display = 'block';/.test(settingsSrc));
    }

    /* ---- 1.6.4: the plan's relay, the host's ask and its precedence (the siterelay and relay slices run for real together) ---- */
    {
        const srSrc = sl('siterelay'), rlSrc = sl('relay'); let r = {}, err = 'no slice';
        const CRED = 'Cred+/=Secret99', T0 = 5e12;
        const site1 = { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: CRED };
        // one page: the two slices with stand-ins for the browser's parts; fetch answers from a table and writes every call down
        const mkP = o => {
            o = o || {}; const w = { store: Object.assign({}, o.store || {}), calls: [], timers: [], logs: [], toasts: [], clock: T0, said: 0 };
            const ls = { getItem: k => (k in w.store ? w.store[k] : null), setItem: (k, v) => { w.store[k] = String(v); } };
            const win = { wpStepLog: (v, s, f) => w.logs.push(v + '|' + s + '|' + JSON.stringify(f)), wpWebMode: o.web ? { web: () => true } : { web: () => false }, wpSiteRelaySync: () => { w.said++; } };
            const fetchF = (url, opt) => { w.calls.push({ url, opt }); const a = typeof w.answer === 'function' ? w.answer(url) : w.answer; if (a === 'never') return new Promise(() => {}); if (!a) return Promise.reject(new Error('down')); return Promise.resolve({ status: a.status, json: () => (a.json === undefined ? Promise.reject(new Error('no json')) : Promise.resolve(a.json)) }); };
            const st = (fn, ms) => { w.timers.push({ fn, ms }); return w.timers.length; }, ct = () => {};
            const DateS = class extends Date {}; DateS.now = () => w.clock;   // the page's clock is the suite's, a date still a date
            const net = { peer: null };
            w.api = new Function('window', 'fetch', 'localStorage', 'location', 'setTimeout', 'clearTimeout', 'Date', 'net', 'toast', srSrc + rlSrc
                + '\nreturn { ask: siteRelayAsk, servers: siteRelayServers, hosting: siteRelayHosting, words: siteRelayWords, peerOpts: peerOpts, relayActive: relayActive, relayServers: relayServers, apply: siteRelayApply, arm: siteRelayArm, refresh: siteRelayRefresh, clean: cleanSiteRelay, urlOk: siteRelayUrlOk, usage: cleanSiteRelayUsage, held: function() { return _siteRelay; }, why: function() { return _siteRelayWhy; }, WAIT: SITE_RELAY_WAIT };')
                (win, fetchF, ls, { hostname: o.host || 'localhost' }, st, ct, DateS, net, t => w.toasts.push(t));
            Object.assign(w, w.api); w.net = net; w.fire = () => { const t = w.timers.splice(0); t.forEach(x => x.fn()); return t.map(x => x.ms); };
            return w;
        };
        const set = (extra) => ({ status: 200, json: Object.assign({ iceServers: [site1], expires: T0 + 12 * 3600000, usage: { used: 41e9, allowance: 50e9, warning: true, over: false, resets: Date.UTC(2026, 11, 1) } }, extra || {}) });
        const ice = cfg => cfg.iceServers.map(s => [].concat(s.urls).join('+'));
        if (srSrc && rlSrc) err = await (async () => { try {
            // (1) a desktop: its own server asked, the set used only while hosting, as STUN and the plan's relay; relay-only with the plan's alone
            const P = mkP(); P.answer = set();
            const a1 = await P.ask(), c1 = P.calls[0];
            r.desk = { a1, url: c1.url, method: c1.opt.method, cred: 'credentials' in c1.opt, body: 'body' in c1.opt, before: P.servers(), beforeIce: ice(P.peerOpts().config) };
            P.hosting(true);
            r.desk.hostIce = ice(P.peerOpts().config); r.desk.cred2 = P.peerOpts().config.iceServers[2].credential; r.desk.active = P.relayActive();
            P.store.wp_relayOnly = '1'; r.desk.only = [P.peerOpts().config.iceTransportPolicy, ice(P.peerOpts().config), P.relayActive()]; delete P.store.wp_relayOnly;
            P.hosting(false); r.desk.after = [P.servers(), ice(P.peerOpts().config)];
            // (2) the GM's own relay wins: the site is never asked, and a set already held is not used beside it
            const O = mkP({ store: { turn_urls: 'turn:own.example.net:3478', turn_user: 'me', turn_pass: 'pw' } }); O.answer = set();
            const aO = await O.ask(); O.hosting(true);
            const Q = mkP(); Q.answer = set(); await Q.ask(); Q.hosting(true); Q.store.turn_urls = 'turns:own.example.net:5349';
            r.own = { aO, calls: O.calls.length, ice: ice(O.peerOpts().config), heldIce: ice(Q.peerOpts().config), words: Q.words() };
            // (3) a browser: the play host itself, its play cookie, same origin
            const W = mkP({ web: true, host: 'play.waypointvtt.com' }); W.answer = set(); await W.ask();
            r.web = { url: W.calls[0].url, opt: W.calls[0].opt };
            // (4) a hostile set dropped whole or in part; a loopback relay only from a loopback test site
            const hostile = [{ urls: ['turn:evil.example:3478', 'stun:turn.cloudflare.com', 'turn:turn.cloudflare.com:53', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }, { urls: ['turn:turn.cloudflare.com'], username: '', credential: 'c' }, { urls: ['turn:turn.cloudflare.com'], username: 'u\n', credential: 'c' }, { urls: ['turn:turn.cloudflare.com'], username: 'u', credential: 'x'.repeat(513) }, null, 'turn:turn.cloudflare.com'];
            const H = mkP(); H.answer = { status: 200, json: { iceServers: hostile, expires: T0 + 3600000 } }; await H.ask(); H.hosting(true);
            const loop = { iceServers: [{ urls: ['turn:127.0.0.1:3478?transport=udp'], username: 'waypoint-dev', credential: 'waypoint-dev' }], expires: T0 + 3600000 };
            const L1 = mkP(); L1.answer = { status: 200, json: loop }; const l1 = await L1.ask();
            const L2 = mkP(); L2.answer = { status: 200, json: Object.assign({ test: true }, loop) }; const l2 = await L2.ask();
            const L3 = mkP({ web: true, host: 'play.waypointvtt.com' }); L3.answer = { status: 200, json: Object.assign({ test: true }, loop) }; const l3 = await L3.ask();
            const L4 = mkP({ web: true, host: 'localhost' }); L4.answer = { status: 200, json: loop }; const l4 = await L4.ask();
            const X1 = mkP(); X1.answer = { status: 200, json: { iceServers: [site1], expires: T0 - 5 } }; const x1 = await X1.ask();
            const X2 = mkP(); X2.answer = { status: 200, json: { iceServers: 'turn:turn.cloudflare.com', expires: T0 + 3600000 } }; const x2 = await X2.ask();
            r.hostile = { ice: ice(H.peerOpts().config), l: [l1, l2, l3, l4], x: [x1, x2], heldX: [X1.held(), X2.held()] };
            // (5) every refusal, by its word; the held set kept only through too many asks or a busy site
            const why = async (ans, held) => { const Z = mkP(); if (held) { Z.answer = set(); await Z.ask(); Z.clock += 7 * 3600000; } Z.answer = ans; const a = await Z.ask(); return { a, kept: !!Z.held(), words: Z.words() }; };
            r.no = {
                u401: await why({ status: 401, json: { error: 'unlinked' } }, true), u409: await why({ status: 409, json: { error: 'unlinked' } }),
                plan: await why({ status: 403, json: { error: 'plan' } }, true), allow: await why({ status: 403, json: { error: 'allowance', usage: { used: 51e9, allowance: 50e9, warning: false, over: true, resets: Date.UTC(2026, 11, 1) } } }, true),
                off: await why({ status: 404, json: null }, true), slow: await why({ status: 429, json: {} }, true), busy: await why({ status: 503, json: { error: 'unavailable' } }, true), down: await why(null, true), bad: await why({ status: 200 }, false)
            };
            // (6) never more than SITE_RELAY_WAIT: a site that never answers is no relay once the wait is up, and hosting goes on
            const N = mkP(); N.answer = 'never'; let nDone = null; N.ask().then(a => { nDone = a; }); await Promise.resolve(); const waits = N.timers.map(t => t.ms); N.fire(); for (let i = 0; i < 5; i++) await Promise.resolve();
            r.wait = { waits, nDone, held: N.held() };
            // (7) a set with more than half its life left is used again with no ask; past half the site is asked; two asks at once ask once
            const R = mkP(); R.answer = set(); await R.ask(); R.clock += 5 * 3600000; const r2 = await R.ask(); const n2 = R.calls.length; R.clock += 2 * 3600000; await R.ask(); const n3 = R.calls.length;
            const R2 = mkP(); R2.answer = set(); const pa = R2.ask(), pb = R2.ask(); await pa; await pb;
            r.reuse = { r2, n2, n3, once: R2.calls.length, same: pa === pb };
            // (8) the refresh: armed at half life; it asks again and the host's peer takes the new set for the connections after
            const F = mkP(); F.answer = set(); await F.ask(); F.hosting(true); const peer = { options: { config: { iceServers: [] } } }; F.net.peer = peer; F.timers.length = 0; F.arm(peer);
            const armed = F.timers.map(t => t.ms); F.clock += 6 * 3600000 + 1; F.answer = set({ iceServers: [{ urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'u2', credential: 'c2' }], expires: F.clock + 12 * 3600000 }); F.fire(); for (let i = 0; i < 6; i++) await Promise.resolve();
            r.refresh = { armed, calls: F.calls.length, ice: ice(peer.options.config), rearmed: F.timers.filter(t => t.ms !== F.WAIT).map(t => t.ms) };
            F.hosting(false); r.refresh.cleared = F.servers();
            const E = mkP(); E.answer = set(); E.hosting(true); const pE = {}; E.net.peer = pE; E.refresh(pE); E.refresh(pE, true); r.refresh.none = E.calls.length;   // no set held: a new player's connection asks the site nothing
            // (9) nothing of a credential in a log line, words for Settings
            r.logs = [P.logs, H.logs, F.logs].flat(); r.cred = r.logs.some(l => l.includes(CRED) || l.includes('cloudflare'));
            r.words = { on: P.words(), said: P.said };
            // (10) the page's rules are account.js's: the same addresses pass and the same usage reads alike
            const Acct = require(require('path').join(__dirname, '..', 'system', 'resources', 'app', 'account.js'));
            const urls = ['turn:turn.cloudflare.com', 'turns:turn.cloudflare.com:443?transport=tcp', 'TURN:TURN.CLOUDFLARE.COM:3478?transport=UDP', 'turn:waypointvtt.com', 'turn:x.waypointvtt.com:1', 'turn:evilwaypointvtt.com', 'turn:waypointvtt.com.evil', 'stun:turn.cloudflare.com', 'turn:turn.cloudflare.com:53', 'turn:turn.cloudflare.com:65536', 'turn:turn.cloudflare.com:0', 'turn:u@turn.cloudflare.com', 'turn:turn.cloudflare.com/p', 'turn:turn.cloudflare.com?transport=x', 'turn:127.0.0.1', 'turn:localhost:3478', 'turn:[::1]:3478', '', 5, null, 'turn:' + 'a'.repeat(260)];
            r.same = [true, false].every(t => urls.every(u => Acct.relayUrlOk(u, t) === P.urlOk(u, t))) && J(Acct.cleanIceServers(hostile, false)) === J(P.clean(hostile, false))
                && [{ used: 1, allowance: 2, warning: true, over: 'x', resets: 9 }, { used: -1 }, null, [], { used: 1e19, allowance: 1 }].every(u => J(Acct.cleanRelayUsage(u)) === J(P.usage(u)));
            return '';
        } catch (e) { return String(e && e.stack); } })();
        const STUN2 = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'], SITE = ['turn:turn.cloudflare.com:3478?transport=udp+turns:turn.cloudflare.com:443?transport=tcp'];
        const d = r.desk || {}, o2 = r.own || {}, h = r.hostile || {}, n = r.no || {}, wt = r.wait || {}, ru = r.reuse || {}, rf = r.refresh || {};
        check('1.6.4 the plan\'s relay on a desktop (net.js siterelay and relay sliced and run for real): the host asks its own server (POST /api/account/relay, no body, no cookie); the set is used only while this machine hosts, after STUN as a relay is, its credential as given; Firewall-friendly connections then names the plan\'s relay alone and is active; once hosting ends, the plan\'s relay is no one\'s',
            err === '' && J(d.a1) === J({ ok: true }) && d.url === '/api/account/relay' && d.method === 'POST' && d.cred === false && d.body === false && d.before === null && J(d.beforeIce) === J(STUN2)
            && J(d.hostIce) === J(STUN2.concat(SITE)) && d.cred2 === CRED && d.active === false && J(d.only) === J(['relay', SITE, true]) && d.after[0] === null && J(d.after[1]) === J(STUN2), J([err, d]));
        check('1.6.4 the GM\'s own relay wins: with one set the site is never asked and only it is used, and a plan\'s set already held stands aside the moment one is set, Settings saying so',
            err === '' && J(o2.aO) === J({ why: 'own' }) && o2.calls === 0 && J(o2.ice) === J(STUN2.concat(['turn:own.example.net:3478'])) && J(o2.heldIce) === J(STUN2.concat(['turns:own.example.net:5349'])) && /Your own relay server above is used/.test(o2.words), J([err, o2]));
        check('1.6.4 a browser host asks the play host itself, POST /api/relay with its play cookie on the same origin',
            err === '' && r.web && r.web.url === '/api/relay' && r.web.opt.method === 'POST' && r.web.opt.credentials === 'same-origin', J([err, r.web]));
        check('1.6.4 a hostile set is checked again on the page whatever the server said: only turn: and turns: on the relay service\'s host or the site\'s domain, no port 53, no STUN entry, a username and a credential as short printable text, or the server goes; a loopback relay only where a desktop\'s own server says it came from a test site or a browser\'s page is itself on a loopback name; a set out of date or a list that is no list is no relay',
            err === '' && J(h.ice) === J(STUN2.concat(['turns:turn.cloudflare.com:443?transport=tcp'])) && J(h.l.map(x => x.ok === true ? 'ok' : x.why)) === J(['busy', 'ok', 'busy', 'ok']) && J(h.x) === J([{ why: 'busy' }, { why: 'busy' }]) && J(h.heldX) === J([null, null]), J([err, h]));
        check('1.6.4 every answer that is no relay hosts as before, said by its own word: 401 and the own server\'s 409 not linked, 403 the plan, 403 allowance the month used up, 404 the switch off (said nothing of), 429 too many, 503 and an unreachable site busy, a 200 with no body busy; the plan, the allowance, the link and the switch let a held set go, too many asks and a busy site keep one still in its life; Settings says each in one plain sentence',
            err === '' && n.u401 && n.u401.a.why === 'unlinked' && !n.u401.kept && /not linked to a Waypoint account/.test(n.u401.words) && n.u409.a.why === 'unlinked'
            && n.plan.a.why === 'plan' && !n.plan.kept && /your plan does not include one/.test(n.plan.words) && n.allow.a.why === 'allowance' && !n.allow.kept && /used up\. It starts again on December 1\. Players who can connect directly still join\./.test(n.allow.words)
            && n.off.a.why === 'off' && !n.off.kept && n.off.words === '' && n.slow.a.why === 'slow' && n.slow.kept && n.busy.a.why === 'busy' && n.busy.kept && /website was busy/.test(n.busy.words) && n.down.a.why === 'busy' && n.down.kept && n.bad.a.why === 'busy', J([err, n]));
        check('1.6.4 hosting never waits on the site more than SITE_RELAY_WAIT (4 s): a site that never answers is no relay once it is up',
            err === '' && J(wt.waits) === J([4000]) && wt.nDone && wt.nDone.why === 'busy' && wt.held === null, J([err, wt]));
        check('1.6.4 a set with more than half its life left is used again with no ask, past half the site is asked, and two asks at once are one',
            err === '' && J(ru.r2) === J({ ok: true, held: true }) && ru.n2 === 1 && ru.n3 === 2 && ru.once === 1 && ru.same === true, J([err, ru]));
        check('1.6.4 the refresh: armed at half the set\'s life, it asks again and puts the new set into the host peer\'s own options for every connection made after, then arms again; hosting ending lets it go; with no set held a new player\'s connection asks the site nothing',
            err === '' && J(rf.armed) === J([6 * 3600000]) && rf.calls === 2 && J(rf.ice) === J(STUN2.concat(['turns:turn.cloudflare.com:443?transport=tcp'])) && rf.rearmed.length === 1 && rf.rearmed[0] >= 6 * 3600000 - 1000 && rf.cleared === null && rf.none === 0, J([err, rf]));
        check('1.6.4 the step log (relay v1) says where it asked, how many servers came and why there was none, and never a credential or an address; Settings is told after each answer, and its line reads the month\'s use against the allowance, the warning near it and when it starts again',
            err === '' && r.cred === false && r.logs.some(l => l.startsWith('relay v1|ask|{"where":"desktop"}')) && r.logs.some(l => /^relay v1\|got\|\{"servers":1,/.test(l)) && r.words.said >= 1
            && /^Your plan\u2019s relay carries this table/.test(r.words.on) && r.words.on.includes('41 GB used of 50 GB.') && r.words.on.includes('It starts again on December 1.') && /used most of this month/.test(r.words.on), J([err, r.logs, r.words]));
        check('1.6.4 the page\'s rules are account.js\'s own: the same addresses pass and fail, the same hostile set cleans alike and the same usage reads alike',
            err === '' && r.same === true, J([err, r.same]));
        const outsideSR = srSrc ? noCm(src.replace(srSrc, '')) : 'siteRelayAsk(';
        const shSR = fnSrc('function startHosting(forceFresh) {', '\n    peer.on(\'open\'', 'startHosting'), lvSR = fnSrc('function leaveSession(silent) {', '\n}\n', 'leaveSession'), jsSR = fnSrc('function joinSession(code, name, isRetry, probe) {', '\n}\n', 'joinSession');
        check('1.6.4 (wired): only the host asks, in startHosting before any Peer is made and after a browser\'s host token, and as its peer takes a new connection; a player never asks (joinSession names nothing of it); hosting is marked before the Peer is made and let go in leaveSession; the refresh is armed after the gate goes on; no credential is kept in storage (the slice names neither localStorage nor sessionStorage); the Test button tests whichever relay is in use; Settings shows the line',
            !!srSrc && !/siteRelayAsk\(/.test(outsideSR.replace(/if \(!_siteRelayGo && typeof siteRelayAsk === 'function' && !siteRelayOwn\(\)\) \{[^]*?siteRelayAsk\(\)\.then\(/, '')) && shSR.indexOf('siteRelayAsk().then(') > 0 && shSR.indexOf('siteRelayAsk().then(') < shSR.indexOf('new Peer(') && shSR.indexOf('signalWeb()') < shSR.indexOf('siteRelayAsk().then(')
            && /siteRelayHosting\(true\);[^\n]*\n\s*gmSignArm\(\);/.test(shSR) && /sigGate\(peer, true, roomPeerId\(code, gen\)\);[^\n]*\n\s*if \(typeof siteRelayArm === 'function'\) siteRelayArm\(peer\);/.test(shSR)
            && /net\.conns\.push\(conn\);\n\s*if \(typeof siteRelayRefresh === 'function'\) siteRelayRefresh\(peer\);/.test(src) && /siteRelayHosting\(false\)/.test(lvSR) && !/siteRelay/.test(jsSR)
            && !/localStorage|sessionStorage/.test(noCm((srSrc || 'localStorage').replace(/\/\*[\s\S]*?\*\//g, ''))) && /var t = relayServers\(\);/.test(src) && /new RTCPeerConnection\(\{ iceServers: t, iceTransportPolicy: 'relay' \}\)/.test(src)
            && /window\.wpSiteRelaySync = siteRelaySync;/.test(settingsSrc) && /id="setSiteRelay"/.test(html) && /id="helpPlanRelay"/.test(html), J([!!srSrc, shSR.length, jsSR.length]));
    }

    /* ---- T4 (TRANSPORT-5): the transport guard ---- */
    // the wire format the connection library's packer writes (BinaryPack), written here independently
    const tp = v => {
        const out = [], u16 = n => out.push((n >>> 8) & 255, n & 255), u32 = n => out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
        const bytes = b => { for (let k = 0; k < b.length; k++) out.push(b[k]); };
        const str = s => { const b = Buffer.from(s, 'utf8'); if (b.length <= 15) out.push(0xb0 + b.length); else if (b.length <= 65535) { out.push(0xd8); u16(b.length); } else { out.push(0xd9); u32(b.length); } bytes(b); };
        const raw = b => { if (b.length <= 15) out.push(0xa0 + b.length); else if (b.length <= 65535) { out.push(0xda); u16(b.length); } else { out.push(0xdb); u32(b.length); } bytes(b); };
        const int = e => { if (e >= -32 && e <= 127) out.push(e & 255); else if (e >= 0 && e <= 255) out.push(0xcc, e); else if (e >= -128 && e <= 127) out.push(0xd0, e & 255); else if (e >= 0 && e <= 65535) { out.push(0xcd); u16(e); } else if (e >= -32768 && e <= 32767) { out.push(0xd1); u16(e & 65535); }
            else if (e >= 0 && e <= 4294967295) { out.push(0xce); u32(e); } else if (e >= -2147483648 && e <= 2147483647) { out.push(0xd2); u32(e >>> 0); } else { out.push(e >= 0 ? 0xcf : 0xd3); u32(Math.floor(Math.abs(e) / 4294967296)); u32(Math.abs(e) % 4294967296); } };
        const go = x => {
            if (typeof x === 'string') str(x);
            else if (typeof x === 'number') { if (Math.floor(x) === x) int(x); else { out.push(0xcb); const b = Buffer.alloc(8); b.writeDoubleBE(x); bytes(b); } }
            else if (typeof x === 'boolean') out.push(x ? 0xc3 : 0xc2);
            else if (x === undefined || x === null) out.push(0xc0);
            else if (Array.isArray(x)) { if (x.length <= 15) out.push(0x90 + x.length); else if (x.length <= 65535) { out.push(0xdc); u16(x.length); } else { out.push(0xdd); u32(x.length); } x.forEach(go); }
            else if (x instanceof ArrayBuffer) raw(new Uint8Array(x));
            else if (ArrayBuffer.isView(x)) raw(new Uint8Array(x.buffer, x.byteOffset, x.byteLength));
            else { const ks = Object.keys(x); if (ks.length <= 15) out.push(0x80 + ks.length); else if (ks.length <= 65535) { out.push(0xde); u16(ks.length); } else { out.push(0xdf); u32(ks.length); } ks.forEach(k => { str(k); go(x[k]); }); }
        };
        go(v); return new Uint8Array(out).buffer;
    };
    // … and its decoder, as the library's own reads (a count is believed, a byte past the end reads as 0, a length past the end throws); a step limit keeps a runaway decode from hanging the suite
    const tu = data => {
        const u = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength); let i = 0, steps = 0;
        const need = k => { if (i + k > u.length) throw new Error('BinaryPackFailure'); }, num = k => { need(k); let v = 0; for (let q = 0; q < k; q++) v = v * 256 + u[i++]; return v; };
        const rawOf = k => { need(k); const b = u.slice(i, i + k); i += k; return b.buffer; }, strOf = k => { need(k); const s = Buffer.from(u.buffer, u.byteOffset + i, k).toString('utf8'); i += k; return s; };
        const arrOf = k => { const a = []; for (let q = 0; q < k; q++) a[q] = go(); return a; }, mapOf = k => { const m = {}; for (let q = 0; q < k; q++) { const key = go(); m[key] = go(); } return m; };
        const go = () => {
            if (++steps > 3e6) throw new Error('RUNAWAY');
            const t = (u[i++] | 0) & 255;
            if (t < 0x80) return t; if (t >= 0xe0) return t - 256;
            if (t <= 0x8f) return mapOf(t & 15); if (t <= 0x9f) return arrOf(t & 15); if (t <= 0xaf) return rawOf(t & 15); if (t <= 0xbf) return strOf(t & 15);
            switch (t) {
                case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
                case 0xca: num(4); return 0; case 0xcb: { need(8); const dv = Buffer.from(u.buffer, u.byteOffset + i, 8).readDoubleBE(0); i += 8; return dv; }
                case 0xcc: return num(1); case 0xcd: return num(2); case 0xce: return num(4); case 0xcf: return num(8);
                case 0xd0: { const x = num(1); return x < 128 ? x : x - 256; } case 0xd1: { const x = num(2); return x < 32768 ? x : x - 65536; } case 0xd2: { const x = num(4); return x < 2147483648 ? x : x - 4294967296; } case 0xd3: return -num(8);
                case 0xd8: return strOf(num(2)); case 0xd9: return strOf(num(4)); case 0xda: return rawOf(num(2)); case 0xdb: return rawOf(num(4));
                case 0xdc: return arrOf(num(2)); case 0xdd: return arrOf(num(4)); case 0xde: return mapOf(num(2)); case 0xdf: return mapOf(num(4));
            }
            return undefined;
        };
        return go();
    };
    const MTU = 16300, piecesOf = (buf, id) => { const u = new Uint8Array(buf), total = Math.ceil(u.length / MTU), out = []; for (let k = 0; k < total; k++) out.push(tp({ __peerData: id, n: k, data: u.slice(k * MTU, (k + 1) * MTU), total })); return out; };
    const B = (...xs) => { const out = []; xs.forEach(x => { if (typeof x === 'number') out.push(x); else if (typeof x === 'string') Buffer.from(x, 'latin1').forEach(y => out.push(y)); else x.forEach(y => out.push(y)); }); return new Uint8Array(out).buffer; };
    const trSrc = sl('transport');
    const mkT = (role, roster) => {   // the transport slice on a net of its own
        const net = { role, roster: roster || Object.create(null) }; let api = null, threw = '';
        try { api = new Function('net', 'own', trSrc + '\nreturn { packShapeOk: packShapeOk, wireGuard: wireGuard, connShapeOk: connShapeOk, RAW_MAX: RAW_MAX, PIECES_PRE: PIECES_PRE, BYTES_PRE: BYTES_PRE, PIECES_HOST: PIECES_HOST, PIECES_CLIENT: PIECES_CLIENT, CHUNK_OPEN: CHUNK_OPEN };')(net, H.own); } catch (e) { threw = String(e && e.message); }
        return { net, api, threw };
    };
    // a stand-in for the library's binary data connection (its 1.5.2 source: the entry point, the chunk reassembly, close emptying the pieces)
    const mkC = peer => {
        const c = { peer, open: true, serialization: 'binary', _chunkedData: {}, h: {}, got: [], closed: 0, innerCalls: 0 };
        c.on = (ev, fn) => { (c.h[ev] = c.h[ev] || []).push(fn); }; c.emit = (ev, x) => (c.h[ev] || []).forEach(f => f(x)); c.send = () => {};
        c.close = () => { if (!c.open) return; c.open = false; c.closed++; c._chunkedData = {}; c.emit('close'); };
        c._handleDataMessage = function(ev) { c.innerCalls++; const t = tu(ev.data), n = t.__peerData; if (n) { if (n.type === 'close') { this.close(); return; } this._handleChunk(t); return; } this.emit('data', t); };
        c._handleChunk = function(e) { const id = e.__peerData, g = this._chunkedData[id] || { data: [], count: 0, total: e.total }; g.data[e.n] = new Uint8Array(e.data); g.count++; this._chunkedData[id] = g;
            if (g.total === g.count) { delete this._chunkedData[id]; let len = 0; for (const p of g.data) len += p.byteLength; const all = new Uint8Array(len); let at = 0; for (const p of g.data) { all.set(p, at); at += p.byteLength; } this._handleDataMessage({ data: all }); } };
        c.on('data', m => c.got.push(m));
        c.deliver = buf => c._handleDataMessage({ data: buf });   // as the library's own listener calls it: through the instance
        return c;
    };
    {
        const T = trSrc ? mkT('host') : null, ok = T && T.api ? T.api.packShapeOk : null;
        const AV = 'data:image/png;base64,' + 'A'.repeat(199000);
        const helloMsg = { type: 'hello', profile: { id: 'u_kay', name: 'Kay — éè 😀', color: '#12ab34', avatar: AV, face: 'default' }, password: '', version: '1.5.0', fp: ['sha-256 AA', 'sha-256 BB'], proof: 'f'.repeat(64) };
        const honest = [{ type: 'hb' }, { type: 'hello', profile: { id: 'u_a', name: 'A' }, password: 'pw', version: '1.5.0' }, {}, { type: 'x', a: [1, -1, 127, 128, 255, 256, -32, -33, -129, 65535, 65536, -32769, 4294967295, 4294967296, -2147483649, 1.5, -0.25], b: [true, false, null], c: { d: { e: [[], {}, ''] } }, s: 'x'.repeat(70000), big: new Array(70).fill('k') },
            { type: 'asset-part', path: '/saves/images/audio/c/x.mp3', i: 0, n: 2, data: new Uint8Array(40000) }, { type: 'asset', data: new Uint8Array(0).buffer, many: Object.fromEntries(new Array(20).fill(0).map((x, k) => ['k' + k, k])) }];
        let deep = { v: 1 }; for (let k = 0; k < 62; k++) deep = { a: deep }; const deepOk = { type: 'd', a: deep };   // 64 levels of containers in all
        let deeper = { v: 1 }; for (let k = 0; k < 63; k++) deeper = { a: deeper }; const deepBad = { type: 'd', a: deeper };   // 65
        const r = {};
        if (ok) {
            r.honest = honest.map(m => ok(tp(m))).concat(piecesOf(tp(helloMsg), 7).map(p => ok(p))).every(x => x === true) && ok(tp(helloMsg)) === true && ok(new Uint8Array(tp({ type: 'hb' }))) === true && ok(tp(deepOk)) === true;
            const t0 = Date.now();
            r.counts = [B(0x81, 0xb1, 'a', 0xdd, 0xff, 0xff, 0xff, 0xff), B(0x81, 0xb1, 'a', 0xdc, 0xff, 0xff), B(0xdf, 0xff, 0xff, 0xff, 0xff), B(0xde, 0x00, 0x03, 0xb1, 'a', 1), B(0x81, 0xb1, 'a', 0x93, 1, 2), B(0x82, 0xb1, 'a', 1), B(0x81, 0xb1, 'a', 0x9f, 1, 2, 3)].map(ok);
            r.lengths = [B(0x81, 0xb1, 'a', 0xd9, 0xff, 0xff, 0xff, 0xff, 'x'), B(0x81, 0xb1, 'a', 0xd8, 0x00, 0x05, 'abcd'), B(0x81, 0xb1, 'a', 0xdb, 0x00, 0x00, 0x01, 0x00, 'x'), B(0x81, 0xb1, 'a', 0xa5, 'abcd'), B(0x81, 0xb5, 'abcd', 1), B(0x81, 0xb1, 'a', 0xcd, 1), B(0x81, 0xb1, 'a', 0xcb, 1, 2, 3, 4, 5, 6, 7), B(0x81, 0xb1, 'a', 0xcc), B(0x81, 0xb1, 'a', 0xd8, 0x00), B(0x81, 0xb1, 'a')].map(ok);
            r.ms = Date.now() - t0;
            r.depth = [ok(tp(deepBad)), ok(tp(deepOk))];
            r.top = [tp([1, 2]), tp('hello'), tp(null), tp(5), tp(true), B(0xa1, 'x'), new ArrayBuffer(0)].map(ok).concat([ok(null), ok('x'), ok({ byteLength: 4 }), ok([0x80])]);
            r.keys = [B(0x81, 0xb9, '__proto__', 0x80), B(0x81, 0xd8, 0x00, 0x09, '__proto__', 1), B(0x81, 0xb1, 'a', 0x81, 0xb9, '__proto__', 0x81, 0xb1, 'x', 1),
                B(0x81, 0xba, 0xc1, 0x1f, '_proto__', 1), B(0x81, 0xbb, 0xc1, 0x9f, 0xc1, 0x5f, 'proto__', 1), B(0x81, 0xbb, 0xe0, 0x01, 0x1f, '_proto__', 1),      // "_" written in two bytes and in three: read as "_" all the same
                B(0x81, 0x91, 0xb9, '__proto__', 1), B(0x81, 0x05, 1), B(0x81, 0xc0, 1), B(0x81, 0x80, 1), B(0x81, 0xa1, 'k', 1)].map(ok);
            r.keysOk = [B(0x81, 0xba, '__proto__x', 1), B(0x81, 0xb8, '_proto__', 1), B(0x82, 0xbb, 'constructor', 1, 0xb9, 'prototype', 2), B(0x81, 0xb1, 'a', 0xb9, '__proto__')].map(ok);   // a longer or shorter key, other names, and "__proto__" as a VALUE
            r.rest = [B(0x81, 0xb1, 'a', 1, 0), B(0x80, 0x80), B(0x81, 0xb1, 'a', 0xc1), B(0x81, 0xb1, 'a', 0xc4), B(0x81, 0xb1, 'a', 0xd4), B(0x81, 0xb1, 'a', 0xc9)].map(ok);
        }
        check('transport T4 (packShapeOk, run for real): every packet the library\'s packer makes for the app\'s own messages passes — a heartbeat, a hello, an empty message, numbers of every size and sign, long texts, lists and maps past sixteen entries, bytes, 64 levels of nesting, and each piece of a hello with a picture — as a buffer or a view of one',
            !!ok && r.honest === true, J([T && T.threw, r.honest]));
        check('transport T4 (packShapeOk): a count or a length the bytes cannot hold is refused — a list of four thousand million entries in eight bytes, a map of as many, a text, bytes or a number running past the end — in no time at all, without anything being made of it; 65 levels of nesting are refused',
            !!ok && r.counts.every(x => x === false) && r.lengths.every(x => x === false) && r.ms < 200 && J(r.depth) === J([false, true]), J([r.counts, r.lengths, r.ms, r.depth]));
        check('transport T4 (packShapeOk): a message is a map — a list, a text, a number, nothing, bytes, an empty buffer and anything that is no buffer are refused; a map\'s key is a text and never "__proto__", however its bytes are written (two- and three-byte forms the library\'s decoder reads as the same name), at any depth — a key that is a list, a number, nothing, a map or bytes is refused; "__proto__" as a value, a longer or shorter key and other names pass; bytes after the end and types the packer never writes are refused',
            !!ok && r.top.every(x => x === false) && r.keys.every(x => x === false) && r.keysOk.every(x => x === true) && r.rest.every(x => x === false), J([r.top, r.keys, r.keysOk, r.rest]));
    }
    {
        const run = (role, roster, fn) => { const T = mkT(role, roster); if (!T.api) return { threw: T.threw || 'no slice' }; const c = mkC('pX'); const out = { c, T, installed: T.api.wireGuard(c), threw: '' }; out.threw = noThrow(() => fn(c, T, out)); return out; };
        const HB = tp({ type: 'hb' }), r = {};
        const pad = n => tp({ type: 'pad', s: 'x'.repeat(n) });
        if (trSrc) {
            const seatedRoster = () => { const ro = Object.create(null); ro.pX = { id: 'u_x', name: 'X' }; return ro; };
            r.plain = run('host', null, c => { c.deliver(HB); c.deliver(tp({ type: 'hello', profile: { id: 'u_a' } })); });
            r.big = run('host', seatedRoster(), (c, T, o) => { const p = pad(T.api.RAW_MAX); o.size = [p.byteLength > T.api.RAW_MAX, T.api.packShapeOk(p)]; c.deliver(p); c.deliver(HB); });   // well formed, and a few bytes past the size
            r.edge = run('host', seatedRoster(), (c, T) => { c.deliver(pad(T.api.RAW_MAX - 20)); });
            r.notBytes = ['text', new Uint8Array(tp({ type: 'hb' })), null, { byteLength: 3 }, 7].map(x => { const o = run('host', seatedRoster(), c => { c.deliver(x); }); return [o.threw, o.c.closed, o.c.got.length, o.c.innerCalls]; });
            r.shape = run('host', seatedRoster(), c => { c.deliver(B(0x81, 0xb1, 'a', 0xdd, 0xff, 0xff, 0xff, 0xff)); c.deliver(HB); });
            r.throws = (() => { const T = mkT('host', seatedRoster()); const c = mkC('pX'); c._handleDataMessage = function() { c.innerCalls++; throw new Error('decode failed'); }; T.api.wireGuard(c); const e = noThrow(() => { c.deliver(HB); c.deliver(HB); }); return [e, c.closed, c.got.length, c.innerCalls]; })();
            const first = (id, total, extra) => tp(Object.assign({ __peerData: id, n: 0, data: new Uint8Array(10), total }, extra || {}));
            r.groups = run('host', seatedRoster(), (c, T, o) => { c.deliver(first(1, 5)); c.deliver(first(2, 5)); o.two = [c.closed, Object.keys(c._chunkedData).length]; c.deliver(first(3, 5)); });
            r.totalPre = [32, 33].map(t => { const o = run('host', null, c => { c.deliver(first(1, t)); }); return o.c.closed; });
            r.totalHost = [4096, 4097].map(t => { const o = run('host', seatedRoster(), c => { c.deliver(first(1, t)); }); return o.c.closed; });
            r.totalClient = [8192, 8193].map(t => { const o = run('client', null, c => { c.deliver(first(1, t)); }); return o.c.closed; });
            r.totalBad = [0, -1, 2.5, '5', null, 1e12].map(t => { const o = run('host', seatedRoster(), c => { c.deliver(first(1, t)); }); return [o.threw, o.c.closed]; });
            r.past = run('host', seatedRoster(), c => { c.deliver(tp({ __peerData: 1, n: 9, data: new Uint8Array(4), total: 3 })); });   // a piece numbered past the total
            r.sum = run('host', null, (c, T, o) => { for (let k = 0; k < 20; k++) c.deliver(tp({ __peerData: 1, n: k, data: new Uint8Array(4), total: 32 })); o.mid = c.closed; for (let k = 0; k < 20 && c.open; k++) c.deliver(tp({ __peerData: 2, n: k, data: new Uint8Array(4), total: 32 })); o.held = c.open ? -1 : 0; });   // two messages under way: their pieces counted together (32 before admission)
            r.budget = run('host', null, (c, T, o) => { let k = 0; const p = pad(16000); for (; k < 200 && c.open; k++) c.deliver(p); o.sent = k; o.bytes = p.byteLength; c.deliver(HB); });
            r.budgetSeated = run('host', seatedRoster(), (c, T, o) => { const p = pad(16000); for (let k = 0; k < 200 && c.open; k++) c.deliver(p); });
            const AV = 'data:image/png;base64,' + 'B'.repeat(199000), hello = { type: 'hello', profile: { id: 'u_kay', name: 'Kay', avatar: AV }, password: '', version: '1.5.0' };
            r.hello = run('host', null, (c, T, o) => { const ps = piecesOf(tp(hello), 1); o.pieces = ps.length; ps.forEach(p => c.deliver(p)); c.deliver(HB); });
            r.closeWord = run('host', seatedRoster(), c => { c.deliver(tp({ __peerData: { type: 'close' } })); });
            const inPieces = bad => run('host', seatedRoster(), c => { const u = new Uint8Array(bad), h = Math.ceil(u.length / 2); c.deliver(tp({ __peerData: 9, n: 0, data: u.slice(0, h), total: 2 })); c.deliver(tp({ __peerData: 9, n: 1, data: u.slice(h), total: 2 })); c.deliver(HB); });   // honest pieces, a hostile whole
            r.inside = [B(0x81, 0xb9, '__proto__', 0x81, 0xb1, 'x', 1), B(0x81, 0xb1, 'a', 0xdd, 0xff, 0xff, 0xff, 0xff), B(0x93, 1, 2, 3)].map(bad => { const o = inPieces(bad); return [o.threw, o.c.closed, o.c.got.length, o.c.innerCalls]; });
            r.insideOk = (() => { const o = inPieces(tp({ type: 'chat', text: 'hello there' })); return [o.threw, o.c.closed, o.c.got.map(m => m.type)]; })();
            r.client = run('client', null, (c, T, o) => { c.deliver(tp({ type: 'snapshot', gmId: 'u_gm' })); c.deliver(B(0x81, 0xb9, '__proto__', 0x80)); c.deliver(HB); });
            r.twice = run('host', seatedRoster(), (c, T, o) => { o.again = T.api.wireGuard(c); c.deliver(HB); });
            const T0 = mkT('host'); r.noClass = T0.api ? [T0.api.wireGuard({ peer: 'p', open: true, on() {}, close() {} }), T0.api.wireGuard({ peer: 'p', _handleDataMessage() {} }), T0.api.wireGuard(null), T0.api.wireGuard({ peer: 'p', _handleDataMessage() {}, _chunkedData: 5 })] : null;
            const S = T0.api ? T0.api.connShapeOk : null, okC = mkC('p');
            r.shapeOf = S ? [S(okC), S(new Object('stranger')), S(Object.assign(mkC('p'), { serialization: 'json' })), S(Object.assign(mkC('p'), { serialization: 'raw' })), S(Object.assign(mkC('p'), { peer: 5 })), S(Object.assign(mkC('p'), { peer: '' })), S(Object.assign(mkC('p'), { peer: 'x'.repeat(129) })), S(Object.assign(mkC('p'), { on: null })), S(null), S('conn'), S({})] : null;
        }
        const closedQuietly = o => o && o.threw === '' && o.c.closed === 1 && o.c.got.length === 0;
        check('transport T4 (the guard on a connection, run for real on a stand-in for the library\'s connection): honest messages reach the app; a raw message past the size the library ever sends closes the connection and nothing of it — or after it — is read; one just under the size passes; a message that is not bytes (a text, a typed view, nothing) closes it without the library being called; a packet whose count the bytes cannot hold closes it before anything decodes it',
            !!trSrc && r.plain.installed === true && r.plain.threw === '' && r.plain.c.closed === 0 && J(r.plain.c.got.map(m => m.type)) === J(['hb', 'hello']) && closedQuietly(r.big) && r.big.c.innerCalls === 0 && J(r.big.size) === J([true, true]) && r.edge.c.closed === 0 && r.edge.c.got.length === 1
            && r.notBytes.every(x => J(x) === J(['', 1, 0, 0])) && closedQuietly(r.shape) && r.shape.c.innerCalls === 0, J([r.plain && [r.plain.threw, r.plain.installed, r.plain.c.closed, r.plain.c.got.length], r.big && [r.big.threw, r.big.c.closed, r.big.c.innerCalls], r.edge && r.edge.c.closed, r.notBytes, r.shape && [r.shape.threw, r.shape.c.closed, r.shape.c.innerCalls]]));
        check('transport T4 (the guard): whatever the library\'s own decoding throws closes the connection and never leaves the listener (nothing reaches the page\'s error banner), and nothing more is handed to it; the library\'s own "close" word still closes',
            !!trSrc && J(r.throws) === J(['', 1, 0, 1]) && r.closeWord.threw === '' && r.closeWord.c.closed === 1, J([r.throws, r.closeWord && [r.closeWord.threw, r.closeWord.c.closed]]));
        check('transport T4 (the guard, pieces of large messages): two large messages may be under way at once, a third closes the connection; before admission a message is at most 32 pieces and the pieces of every message under way are counted together; an admitted player\'s is at most 4,096 pieces (about 66 MB) and a host\'s at most 8,192 (about 133 MB); a total that is no whole number of at least one, or a piece numbered past the total, closes it; a large message put back together is judged for its shape as any other — honest pieces that add up to a key naming the prototype, a count the bytes cannot hold or a list are closed on before the whole is decoded',
            !!trSrc && r.inside.every(x => J(x) === J(['', 1, 0, 2])) && J(r.insideOk) === J(['', 0, ['chat', 'hb']]) && r.groups.threw === '' && J(r.groups.two) === J([0, 2]) && r.groups.c.closed === 1 && J(r.totalPre) === J([0, 1]) && J(r.totalHost) === J([0, 1]) && J(r.totalClient) === J([0, 1]) && r.totalBad.every(x => J(x) === J(['', 1])) && closedQuietly(r.past) && r.sum.threw === '' && r.sum.mid === 0 && r.sum.c.closed === 1,
            J([r.groups && [r.groups.threw, r.groups.two, r.groups.c.closed], r.totalPre, r.totalHost, r.totalClient, r.totalBad, r.past && r.past.c.closed, r.sum && [r.sum.threw, r.sum.mid, r.sum.c.closed]]));
        check('transport T4 (the guard, before admission): a connection the GM has not admitted is read one megabyte in all — past it the connection is closed and the message that crossed the line never reaches handleMessage — while an admitted player\'s is not counted; a hello with a 200,000-character picture, sent in the library\'s own pieces, arrives whole and once',
            !!trSrc && r.budget.threw === '' && r.budget.c.closed === 1 && r.budget.sent === Math.floor(1048576 / r.budget.bytes) + 1 && r.budget.c.got.length === r.budget.sent - 1 && r.budgetSeated.c.closed === 0 && r.budgetSeated.c.got.length === 200
            && r.hello.threw === '' && r.hello.c.closed === 0 && r.hello.pieces === 13 && r.hello.c.got.length === 2 && r.hello.c.got[0].type === 'hello' && r.hello.c.got[0].profile.avatar.length === 199022 && r.hello.c.got[1].type === 'hb' && Object.keys(r.hello.c._chunkedData).length === 0,
            J([r.budget && [r.budget.threw, r.budget.c.closed, r.budget.sent, r.budget.bytes, r.budget.c.got.length], r.budgetSeated && [r.budgetSeated.c.closed, r.budgetSeated.c.got.length], r.hello && [r.hello.threw, r.hello.c.closed, r.hello.pieces, r.hello.c.got.length]]));
        check('transport T4 (the guard, a player\'s side): the same for the host a player\'s app dialed — its messages reach the app, a packet naming the prototype closes the connection and nothing after it is read; the guard is put on once (a second call wraps nothing more), and refuses a connection that is not of the library\'s class (no entry point, no pieces table); a connection the app may wire is the library\'s own in the binary encoding, with a plain peer id — anything else is not',
            !!trSrc && r.client.threw === '' && r.client.c.closed === 1 && J(r.client.c.got.map(m => m.type)) === J(['snapshot']) && r.twice.again === true && r.twice.c.got.length === 1 && r.twice.c.innerCalls === 1 && J(r.noClass) === J([false, false, false, false])
            && J(r.shapeOf) === J([true, false, false, false, false, false, false, false, false, false, false]), J([r.client && [r.client.threw, r.client.c.closed, r.client.c.got.length], r.twice && [r.twice.again, r.twice.c.got.length, r.twice.c.innerCalls], r.noClass, r.shapeOf]));
        const wcA = src.indexOf('function wireConn(conn) {'), wcS = wcA >= 0 ? src.slice(wcA, src.indexOf("conn.on('close', function() {", wcA)) : '';
        check('transport T4 (wired): wireConn listens to no connection without the guard — it refuses and closes one it cannot guard before any state or close handler is attached; the host\'s handler refuses a connection that is not the library\'s binary one, or cannot be guarded, before it is listed; nothing else wires a connection',
            /if \(!wireGuard\(conn\)\) \{[^\n]*try \{ conn\.close\(\); \} catch \(e\) \{\} return false; \}[^\n]*\n\s*conn\.on\('iceStateChanged'/.test(wcS) && (noCm(src).match(/wireConn\(conn\)/g) || []).length === 3
            && /peer\.on\('connection', function\(conn\) \{\s*if \(!connShapeOk\(conn\) \|\| !wireGuard\(conn\) \|\| !unadmittedRoom\(conn\)\) \{ try \{ conn\.close\(\); \} catch \(e\) \{\} return; \}[^\n]*\n\s*net\.conns\.push\(conn\);/.test(src));
    }
    /* ---- 1.6.3 (the multiplayer review, finding 3): every piece the guard passes on a seated connection is a sign of life. A join snapshot or a
       large picture that takes longer than the heartbeat's 20 s to arrive in pieces no longer reads as a lost GM (the transport slice, run for
       real with a noteSeen of the suite's own) ---- */
    {
        const seen = [], order = [];
        const mkTs = (role, roster) => { const net = { role, roster: roster || Object.create(null) }; return new Function('net', 'own', 'noteSeen', trSrc + '\nreturn { wireGuard: wireGuard };')(net, H.own, peer => { seen.push(peer); order.push('seen'); }); };
        const big = tp({ type: 'snapshot', s: 'x'.repeat(16300 * 5) }), parts = piecesOf(big, 11);
        const run = (role, roster) => { seen.length = 0; order.length = 0; const T = mkTs(role, roster), c = mkC('pX'); c.on('data', m => order.push('msg:' + m.type)); T.wireGuard(c); const each = []; parts.forEach(pc => { c.deliver(pc); each.push(seen.length); }); return { each, got: c.got.map(m => m.type), closed: c.closed, order: order.slice() }; };
        const seatedR = () => { const ro = Object.create(null); ro.pX = { id: 'u_x', name: 'X' }; return ro; };
        const host = run('host', seatedR()), waiting = run('host', null), client = run('client', null);
        const hold = (() => { seen.length = 0; order.length = 0; const T = mkTs('host', seatedR()), c = mkC('pX'); c.on('data', m => order.push('msg:' + m.type)); T.wireGuard(c); c.deliver(tp({ type: 'hold', ms: 5000 })); return order.join(); })();
        check('1.6.3 (the multiplayer review, finding 3) the guard on a connection, run for real: each piece of a large message that passes it on a seated connection counts as a sign of life (noteSeen), one piece at a time, before the message is whole, on the GM\'s side for an admitted player and on a player\'s side for the host; a connection the GM has not admitted counts nothing here; a piece is counted before it is read, so a hold word inside it still sets its wait after',
            parts.length === 6 && J(host.each) === J([1, 2, 3, 4, 5, 6]) && J(host.got) === J(['snapshot']) && host.closed === 0 && J(client.each) === J([1, 2, 3, 4, 5, 6]) && J(client.got) === J(['snapshot']) && J(waiting.each) === J([0, 0, 0, 0, 0, 0]) && hold === 'seen,msg:hold',
            J({ host, waiting, client, hold }));
        check('1.6.3 (finding 3, wired): the guard counts a piece before it hands it on, only while it is not a nested whole and only on a seated connection, and asks noteSeen through typeof',
            /if \(!nested && seated && typeof noteSeen === 'function'\) noteSeen\(conn\.peer\);\r?\n\s*depth\+\+;/.test(trSrc));
    }
    // where the library's own file is in the repository (or named by WP_PEERJS), the same guard runs on its real connection class
    {
        const findPeer = () => { if (process.env.WP_PEERJS && fs.existsSync(process.env.WP_PEERJS)) return process.env.WP_PEERJS; const root = path.join(__dirname, '..', 'system', 'app'), stack = [root]; let n = 0;
            while (stack.length && n < 5000) { const d = stack.pop(); let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) {} for (const e of ents) { n++; const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') stack.push(p); } else if (/^peerjs(\.min)?\.js$/i.test(e.name)) return p; } }
            return null; };
        const pjPath = findPeer();
        if (pjPath && trSrc) {
            let r = {}, err = '';
            err = noThrow(() => {
                const vm = require('vm');
                class FakeWS { constructor() { this.readyState = 0; } send() {} close() {} }
                class FakePC { constructor() { this.iceConnectionState = 'new'; this.signalingState = 'stable'; } createDataChannel() { return new EventTarget(); } addEventListener() {} close() {} setRemoteDescription() { return new Promise(() => {}); } createOffer() { return new Promise(() => {}); } createAnswer() { return new Promise(() => {}); } setLocalDescription() { return new Promise(() => {}); } addIceCandidate() { return Promise.resolve(); } addTransceiver() {} getSenders() { return []; } }
                const win = { navigator: { userAgent: 'Mozilla/5.0 Chrome/128.0.0.0', platform: 'Win32', mediaDevices: {} }, WebSocket: FakeWS, RTCPeerConnection: FakePC, RTCSessionDescription: function(x) { return x; }, RTCIceCandidate: function(x) { return x; }, setTimeout, clearTimeout, setInterval, clearInterval, console: { log() {}, warn() {}, error() {} },
                    TextEncoder, TextDecoder, Blob, fetch: () => new Promise(() => {}), location: { protocol: 'https:', hostname: 'localhost' }, document: {}, EventTarget, MessageEvent };
                win.window = win; win.self = win; win.globalThis = win;
                const ctx = vm.createContext(win), inVm = o => vm.runInContext('(' + JSON.stringify(o) + ')', ctx), piece = (id, total) => vm.runInContext('({ __peerData: ' + id + ', n: 0, data: new Uint8Array(8).buffer, total: ' + total + ' })', ctx);   // the library's packer knows only objects of its own context: what it packs is made there
                vm.runInContext(fs.readFileSync(pjPath, 'utf8'), ctx, { filename: 'peerjs.js' });
                const Peer = win.Peer; const peer = new Peer('wp-netcheck', { config: { iceServers: [] } });
                const util = win.peerjs.util, same = u => { const b = new Uint8Array(u.byteLength); b.set(new Uint8Array(u)); return b.buffer; };   // a buffer of this realm, as the page's own channel hands one over
                r.halves = (() => { const HI = String.fromCharCode(0xd83d), LO = String.fromCharCode(0xde00), BOM = String.fromCharCode(0xfeff); return ['ab' + HI + 'cd', 'ab' + LO + 'cd', LO + HI, HI, 'x' + HI + HI + LO, HI + LO + LO, 'plain words', BOM + 'x' + HI, 'caf' + String.fromCharCode(0xe9) + ' ' + String.fromCharCode(0x20ac)].map(t => { const back = util.unpack(same(util.pack(t))); return [t, typeof back === 'string' ? back : null]; }); })();   // item 35: a text cut inside a character of two code units, through the library's own packer and unpacker
                const mkReal = (role, roster) => { const T = mkT(role, roster); const c = new peer._serializers.binary('stranger', peer, { connectionId: 'dc_t' + Math.random(), _payload: { sdp: { type: 'offer', sdp: '' }, type: 'data', serialization: 'binary' }, serialization: 'binary', reliable: true });
                    const dc = new EventTarget(); c._initializeDataChannel(dc); dc.onopen(); const got = []; let closed = 0; c.on('data', m => got.push(m)); c.on('close', () => { closed++; }); c.on('error', () => {});
                    return { T, c, got, closed: () => closed, shape: T.api.connShapeOk(c), installed: T.api.wireGuard(c), send: buf => dc.dispatchEvent(new MessageEvent('message', { data: buf })) }; };
                const AV = 'data:image/png;base64,' + 'C'.repeat(199000), hello = { type: 'hello', profile: { id: 'u_kay', name: 'Kay é', avatar: AV }, password: '', version: '1.5.0' };
                const packed = same(util.pack(inVm(hello))), pieces = util.chunk(util.pack(inVm(hello))).map(p => same(util.pack(p))), hbR = () => same(util.pack(inVm({ type: 'hb' })));
                r.packerAgrees = Buffer.from(packed).equals(Buffer.from(tp(hello))) && pieces.length === 13;
                const A = mkReal('host'); pieces.forEach(p => A.send(p)); A.send(hbR());
                r.honest = [A.shape, A.installed, A.closed(), A.got.length, A.got[0] && A.got[0].type, A.got[0] && A.got[0].profile.avatar === AV, A.got[1] && A.got[1].type, Object.keys(A.c._chunkedData).length];
                const Bc = mkReal('host'); const eb = noThrow(() => { Bc.send(B(0x81, 0xb1, 'a', 0xdd, 0xff, 0xff, 0xff, 0xff)); Bc.send(hbR()); }); r.count = [eb, Bc.closed(), Bc.got.length];
                const Cc = mkReal('host'); const ec = noThrow(() => { Cc.send(B(0x81, 0xb9, '__proto__', 0x81, 0xb1, 'x', 1)); }); r.proto = [ec, Cc.closed(), Cc.got.length];
                const Dc = mkReal('host'); const ed = noThrow(() => { for (let k = 1; k <= 3; k++) Dc.send(same(util.pack(piece(k, 4)))); }); r.groups = [ed, Dc.closed()];
                const Ec = mkReal('host'); const ee = noThrow(() => { Ec.send(same(util.pack(inVm({ type: 'pad', s: 'x'.repeat(Ec.T.api.RAW_MAX) })))); Ec.send(hbR()); }); const Gc = mkReal('host'); const eg = noThrow(() => { Gc.send('text'); }); r.big = [ee, Ec.closed(), Ec.got.length, eg, Gc.closed(), Gc.got.length];
                const Fc = mkReal('client'); const ef = noThrow(() => { Fc.send(same(util.pack(inVm({ type: 'snapshot', gmId: 'u_gm' })))); Fc.send(same(util.pack(piece(1, 8193)))); }); r.client = [ef, Fc.closed(), Fc.got.length];
                const sgS = sl('siggate'), sp = new Peer('wp-netcheck-sig', { config: { iceServers: [] } }); let made = 0; sp.on('connection', () => { made++; }); sp.on('error', () => {});
                const offR = (from, id, ser) => inVm({ type: 'OFFER', src: from, payload: { sdp: { type: 'offer', sdp: 'v=0\r\n' }, type: 'data', connectionId: id, label: id, serialization: ser, reliable: true } });
                if (sgS) { const on = new Function('Date', 'console', sgS + '\nreturn sigGate;')(Date, { warn() {} })(sp, true, 'wp-netcheck-sig');
                    const es = noThrow(() => { for (let k = 0; k < 500; k++) sp._handleMessage(inVm({ type: 'CANDIDATE', src: 's', payload: { connectionId: 'dc_' + k, candidate: {} } })); sp._handleMessage(offR('s', 'dc_bad', 'constructor')); sp._handleMessage(offR('s', 'dc_bad2', 'json')); sp._handleMessage(offR('kay', 'dc_kay', 'binary')); sp._handleMessage(inVm({ type: 'CANDIDATE', src: 'kay', payload: { connectionId: 'dc_kay', candidate: { candidate: 'x' } } })); });
                    const kc = sp.getConnection('kay', 'dc_kay'); r.sig = [on, es, sp._lostMessages.size, made, !!kc && kc.serialization === 'binary' && sp.getConnection('s', 'dc_bad') === null && sp.getConnection('s', 'dc_bad2') === null]; }
                try { peer.destroy(); sp.destroy(); } catch (e) {}
            });
            const LKw = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'lookcore.js')).split(String.fromCharCode(92)).join('/')), RC = String.fromCharCode(0xfffd), hv = Array.isArray(r.halves) ? r.halves : [];
            check('item 35, a text cut inside a character through the bundled connection library\'s OWN packer and unpacker (' + path.basename(pjPath) + ', run for real in a vm): half a character with no other half arrives as the replacement character, one code unit for one, so the text keeps its length; a whole pair, plain words, accented letters and a byte-order mark at the start arrive as they were; and every one of them signs alike before and after, so a look made for the text on one end is the text\'s on the other',
                hv.length === 9 && hv.every(h => typeof h[1] === 'string' && h[1].length === h[0].length && LKw.textSig(h[1]) === LKw.textSig(h[0])) && hv[0][1] === 'ab' + RC + 'cd' && hv[1][1] === 'ab' + RC + 'cd' && hv[2][1] === RC + RC && hv[3][1] === RC && hv[4][1] === 'x' + RC + hv[4][0].slice(2) && hv[5][1] === hv[5][0].slice(0, 2) + RC && hv[6][1] === 'plain words' && hv[7][1].charCodeAt(0) === 0xfeff && hv[7][1].length === 3 && hv[8][1] === hv[8][0], j(hv.map(h => [h[0].length, h[1] === null ? null : h[1].length, h[1] === null ? null : Array.from(h[1]).map(c => c.codePointAt(0).toString(16))])));
            check('transport T4 (the real connection library, ' + path.basename(pjPath) + '): its own packer writes the format this suite writes; on its own data connection class the guard goes on, a hello in thirteen of its pieces arrives whole and once, and a count the bytes cannot hold, a key naming the prototype, a third large message under way, an oversized or non-binary message and (a player\'s side) a message past the host\'s ceiling each close the connection with nothing thrown out of the listener and nothing handed to the app; on its own peer the signaling gate goes on — five hundred candidates for connections nobody holds are not kept, an offer naming another connection class is dropped without a throw, and a Waypoint\'s offer builds its connection',
                err === '' && r.packerAgrees === true && J(r.honest) === J([true, true, 0, 2, 'hello', true, 'hb', 0]) && J(r.count) === J(['', 1, 0]) && J(r.proto) === J(['', 1, 0]) && J(r.groups) === J(['', 1]) && J(r.big) === J(['', 1, 0, '', 1, 0]) && J(r.client) === J(['', 1, 1]) && J(r.sig) === J([true, '', 0, 1, true]), J([err, r]));
        }
    }

    /* ---- T5 (TRANSPORT-6): backpressure ---- */
    {
        const aqSrc = sl('assetreq'), blSrc = sl('backlog'), tick = ms => new Promise(res => setTimeout(res, ms || 30));
        const mkW = () => {
            const w = { fetched: 0, files: {}, threw: '', onFetch: null };
            const fetch = reqPath => { w.fetched++; let dec; try { dec = decodeURIComponent(reqPath); } catch (e) { dec = reqPath; } const f = w.files[dec]; if (!f) return Promise.resolve({ ok: false }); if (w.onFetch) w.onFetch(dec);
                return Promise.resolve({ ok: true, headers: { get: h => (h === 'content-length' ? String(f.byteLength) : null) }, body: { cancel() {} }, arrayBuffer: () => Promise.resolve(f.buffer.slice(0)) }); };
            try { w.api = new Function('net', 'location', 'sendFailed', 'allow', 'fetch', 'setTimeout', 'Date', aqSrc + '\nreturn { handleAssetRequest: handleAssetRequest, assetNoteSends: assetNoteSends, connBacklog: typeof connBacklog === "function" ? connBacklog : null, ASSET_BACKLOG: typeof ASSET_BACKLOG === "number" ? ASSET_BACKLOG : null };')({ active: true, role: 'host', conns: [], stream: false }, { origin: 'http://localhost:3999' }, e => { throw e; }, () => true, fetch, setTimeout, Date); }
            catch (e) { w.threw = String(e && e.message); w.api = null; }
            w.conn = peer => { const c = { peer, open: true, bufferSize: 0, sent: [], send: m => { packCheck(m); c.sent.push(m.type === 'asset' ? (m.error ? 'refused:' + m.error : 'asset') : m.type === 'asset-part' ? 'part' + m.i + '/' + m.n : m.type); } }; if (w.api) w.api.assetNoteSends(c); return c; };
            return w;
        };
        const W = aqSrc ? mkW() : null, r = {};
        if (W && W.api) {
            const PIC = '/saves/images/m1/pic.png', PIC2 = '/saves/images/m1/pic2.png', SND = '/saves/images/audio/c1/song.mp3', SND2 = '/saves/images/audio/c1/song2.mp3';
            W.files[PIC] = new Uint8Array(64); W.files[PIC2] = new Uint8Array(64); W.files[SND] = new Uint8Array(300 * 1024); W.files[SND2] = new Uint8Array(1000);
            const A = W.conn('pA'); A.send({ type: 'item', item: { whiteboard: [{ id: 'a', src: PIC }, { id: 'b', src: PIC2 }] } }); A.send({ type: 'sounds', list: [{ id: 's', path: SND }, { id: 's2', path: SND2 }] }); const n0 = A.sent.length;
            const cb = W.api.connBacklog; r.backlogOf = cb ? [cb({ bufferSize: 0 }), cb({ bufferSize: 12 }), cb({}), cb({ bufferSize: 'x' }), cb({ bufferSize: -4 }), cb(null), cb({ bufferSize: '7' })] : null; r.cap = W.api.ASSET_BACKLOG;
            A.bufferSize = 2049; W.api.handleAssetRequest({ type: 'asset-req', path: PIC }, A); await tick(); r.before = [A.sent.slice(n0), W.fetched];
            A.bufferSize = 2048; W.api.handleAssetRequest({ type: 'asset-req', path: PIC }, A); await tick(); r.atCap = [A.sent.slice(n0 + 1), W.fetched];
            A.bufferSize = 0; const n1 = A.sent.length; W.onFetch = () => { A.bufferSize = 5000; }; W.api.handleAssetRequest({ type: 'asset-req', path: PIC2 }, A); await tick(); W.onFetch = null; r.during = [A.sent.slice(n1), W.fetched];
            A.bufferSize = 1; const n2 = A.sent.length; W.api.handleAssetRequest({ type: 'asset-req', path: SND }, A); await tick(120); r.held = A.sent.slice(n2);
            W.api.handleAssetRequest({ type: 'asset-req', path: SND2 }, A); await tick(); r.second = A.sent.slice(n2);   // one sound in flight: the second is answered busy
            A.bufferSize = 0; await tick(160); r.sent = A.sent.slice(n2);
            const n3 = A.sent.length; W.api.handleAssetRequest({ type: 'asset-req', path: SND2 }, A); await tick(60); r.next = A.sent.slice(n3);
        }
        check('transport T5 (the asset gate, run for real on a connection with a queue): a picture asked for while the library holds more than 2,048 messages for that connection is answered busy and nothing is fetched or read; at 2,048 it is served; one whose queue passes the line while the file is being read is answered busy and its bytes are not sent',
            !!W && W.threw === '' && J(r.backlogOf) === J([0, 12, 0, 0, 0, 0, 7]) && r.cap === 2048 && J(r.before) === J([['refused:busy'], 0]) && J(r.atCap) === J([['asset'], 1]) && J(r.during) === J([['refused:busy'], 2]), J([W && W.threw, r.backlogOf, r.cap, r.before, r.atCap, r.during]));
        check('transport T5 (a sound\'s parts): while anything is queued for the connection no part of a sound is sent — it waits, still the one in flight; once the queue is empty its parts go out in order, and the next sound is taken',
            !!W && J(r.held) === J([]) && J(r.second) === J(['refused:busy']) && J(r.sent) === J(['refused:busy', 'part0/2', 'part1/2']) && J(r.next) === J(['part0/1']), J([r.held, r.second, r.sent, r.next]));
        let hb = null, hbErr = 'no slice';
        if (blSrc && W && W.api && W.api.connBacklog) hbErr = noThrow(() => {
            const hbSrc = fnSrc('function hbTick() {', '\n// Where each player was last seen', 'hbTick'), toasts = [], now = Date.now();
            const mk = (peer, q) => { const c = { peer, open: true, bufferSize: q, sent: [], closed: 0, send: m => c.sent.push(m), close: () => { c.open = false; c.closed++; } }; return c; };
            const far = mk('pFar', 8193), edge = mk('pEdge', 8192), fine = mk('pFine', 0), waiting = mk('pWait', 9000);
            const net = { active: true, role: 'host', conns: [far, edge, fine, waiting], roster: Object.create(null) }; net.roster.pFar = { id: 'u_f', name: 'Farah' }; net.roster.pEdge = { id: 'u_e', name: 'Ed' }; net.roster.pFine = { id: 'u_o', name: 'Ola' };
            new Function('net', 'own', 'toast', 'connBacklog', 'setIndicator', 'lastSeen', 'HB_DEAD', 'HB_STALE', 'renderRoster', 'sendFailed', 'holdUntil', blSrc + '\n' + hbSrc + '\nreturn hbTick();')(net, H.own, t => toasts.push(t), W.api.connBacklog, () => {}, { pFar: now, pEdge: now, pFine: now, pWait: now }, 20000, 8000, () => {}, () => {}, {});
            const second = () => new Function('net', 'own', 'toast', 'connBacklog', blSrc + '\nreturn backlogSweep();')(Object.assign({}, net, { role: 'client' }), H.own, t => toasts.push('client:' + t), W.api.connBacklog);
            const edgeBefore = edge.closed; edge.bufferSize = 9000; second();
            hb = { closed: [far.closed, edge.closed, fine.closed, waiting.closed], toasts, hbs: [fine.sent.length, edge.sent.length], edgeBefore };
        });
        check('transport T5 (the hard stop, hbTick and backlogSweep run for real): at a heartbeat a connection the library holds more than 8,192 messages for is closed once — the GM told by name for an admitted player, silently for one still waiting — while one at 8,192 and one with nothing queued are kept and still hear the heartbeat; a player\'s app sweeps nothing',
            hbErr === '' && J(hb.closed) === J([1, 0, 0, 1]) && hb.toasts.length === 1 && /^Farah is not keeping up/.test(hb.toasts[0]) && J(hb.hbs) === J([1, 1]) && hb.edgeBefore === 0, J([hbErr, hb]));
        const aq = aqSrc || '', pumpAt = aq.indexOf('(function pump() {'), pumpS = pumpAt >= 0 ? aq.slice(pumpAt, aq.indexOf('})();', pumpAt)) : '', picS = aq.slice(aq.lastIndexOf('if (connBacklog(conn) > ASSET_BACKLOG) { answerAsset(conn, msg.path, \'busy\'); return; }', aq.lastIndexOf('fetch(reqPath)')));
        check('transport T5 (source): the pump tests the queue before it sends a part; the picture branch tests it before the fetch and again before the send; the heartbeat runs the sweep; a player\'s app asks a busy host again for some two and a half minutes (up to forty times, four seconds apart at most) before it settles on the placeholder',
            pumpS.indexOf('connBacklog(conn) > 0') > 0 && pumpS.indexOf('connBacklog(conn) > 0') < pumpS.indexOf('conn.send(') && /if \(connBacklog\(conn\) > ASSET_BACKLOG\) \{ answerAsset\(conn, msg\.path, 'busy'\); return; \}[^\n]*\n\s*fetch\(reqPath\)/.test(aq) && /if \(connBacklog\(conn\) > ASSET_BACKLOG\) \{ answerAsset\(conn, msg\.path, 'busy'\); return; \}[^\n]*\n\s*try \{ conn\.send\(\{ type: 'asset', path: msg\.path, mime:/.test(aq)
            && /if \(typeof backlogSweep === 'function'\) backlogSweep\(\);/.test(fnSrc('function hbTick() {', '\n// Where each player was last seen', 'hbTick')) && /msg\.error === 'busy' && tries <= 40\) setTimeout\(function\(\) \{ if \(!assetCache\[msg\.path\]\) net\.assetSrc\(msg\.path\); \}, Math\.min\(800 \* tries, 4000\)\);/.test(src), J([pumpS.length, picS.length]));
    }

    /* ---- T6 (TRANSPORT-7): the signaling gate ---- */
    {
        const sgSrc = sl('siggate'), r = {}; let err = 'no slice';
        // a stand-in for the library's peer: its 1.5.2 offer and default cases (the connection's class taken from the offer's own word; anything for a connection it does not hold kept)
        const mkP = () => { const p = { built: 0, conns: new Map(), _lostMessages: new Map(), emitted: [], inner: 0, handled: [] };
            class DC { constructor(peerId, prov, o) { p.built++; this.peer = peerId; this.connectionId = o.connectionId; this.serialization = 'binary'; this.peerConnection = {}; this.open = false; } handleMessage(m) { p.handled.push(m.type + ':' + this.connectionId); } close() {} on() {} send() {} }
            p._serializers = { raw: DC, json: DC, binary: DC, 'binary-utf8': DC, default: DC };
            p.getConnection = (src, id) => { const l = p.conns.get(src); if (!l) return null; for (const c of l) if (c.connectionId === id) return c; return null; };
            p._handleMessage = function(e) { p.inner++; const t = e.type, n = e.payload, s = e.src;
                switch (t) { case 'OPEN': p.emitted.push('open'); break; case 'ID-TAKEN': p.emitted.push('taken'); break; case 'ERROR': p.emitted.push('error'); break; case 'INVALID-KEY': p.emitted.push('badkey'); break; case 'LEAVE': p.emitted.push('leave:' + s); break; case 'EXPIRE': p.emitted.push('expire:' + s); break;
                    case 'OFFER': { const id = n.connectionId; if (n.type === 'media') { p.built++; p.emitted.push('call'); } else if (n.type === 'data') { const c = new p._serializers[n.serialization](s, p, { connectionId: id }); if (!p.conns.has(s)) p.conns.set(s, []); p.conns.get(s).push(c); p.emitted.push('connection'); } break; }
                    default: { if (!n) return; const id = n.connectionId, c = p.getConnection(s, id); if (c && c.peerConnection) c.handleMessage(e); else if (id) { if (!p._lostMessages.has(id)) p._lostMessages.set(id, []); p._lostMessages.get(id).push(e); } } } };
            return p; };
        const offer = (src, id, o) => ({ type: 'OFFER', src, dst: 'waypoint-room', payload: Object.assign({ sdp: { type: 'offer', sdp: 'v=0\r\n' }, type: 'data', connectionId: id, label: id, reliable: true, serialization: 'binary' }, o || {}) });
        if (sgSrc) err = noThrow(() => {
            const mkG = (isHost, room) => { const clock = { now: 1e6 }, warns = []; const p = mkP(); const api = new Function('Date', 'console', sgSrc + '\nreturn { sigGate: sigGate, sigOk: sigOk, SIG_OFFERS: SIG_OFFERS, SIG_OFFERS_MS: SIG_OFFERS_MS };')({ now: () => clock.now }, { warn: (...a) => warns.push(a.length) }); const on = api.sigGate(p, isHost, room); return { p, api, on, clock, warns, say: m => noThrow(() => p._handleMessage(m)) }; };
            // (1) nothing kept for a connection nobody holds
            const A = mkG(true, 'waypoint-room'); let e1 = '';
            for (let k = 0; k < 1000; k++) { e1 += A.say({ type: 'CANDIDATE', src: 'stranger', payload: { connectionId: 'dc_none' + (k % 7), candidate: { candidate: 'x'.repeat(2000) } } }); e1 += A.say({ type: 'ANSWER', src: 'stranger', payload: { connectionId: 'dc_none' + k, sdp: { type: 'answer', sdp: 'v=0' } } }); }
            r.kept = [A.on, e1, A.p.inner, A.p._lostMessages.size, A.p.built];
            // (2) bad offers dropped quietly
            const Bg = mkG(true, 'waypoint-room'), bad = [offer('s', 'c1', { serialization: 'constructor' }), offer('s', 'c2', { serialization: 'toString' }), offer('s', 'c3', { serialization: '__proto__' }), offer('s', 'c4', { serialization: 'nope' }), offer('s', 'c5', { serialization: 'raw' }), offer('s', 'c6', { serialization: 'json' }), offer('s', 'c6b', { serialization: 'binary-utf8' }),
                { type: 'OFFER', src: 's' }, { type: 'OFFER', src: 's', payload: 'x' }, offer('s', 5), offer('s', ''), offer('s', 'x'.repeat(65)), offer('s', 'c7', { type: 'media' }), offer('s', 'c8', { sdp: 'v=0' }), offer('s', 'c9', { sdp: null }), offer('s', 'c10', { sdp: { type: 'answer', sdp: 'v=0' } }), offer('s', 'c11', { sdp: { type: 'offer', sdp: 'x'.repeat(20001) } }), offer('s', 'c11b', { sdp: { type: 'offer', sdp: '' } }),
                offer(undefined, 'c12'), offer(7, 'c13'), offer('', 'c14'), offer('y'.repeat(129), 'c15'), null, 'OFFER', 7, { type: 'NOPE', src: 's', payload: { connectionId: 'c' } }, { type: 'HEARTBEAT' }, { src: 's' }];
            let e2 = ''; bad.forEach(m => { e2 += Bg.say(m); }); r.bad = [e2, Bg.p.inner, Bg.p.built, Bg.p.emitted.length];
            // (3) the arrival window
            const Cg = mkG(true, 'waypoint-room'); for (let k = 0; k < 25; k++) { Cg.clock.now += 300; Cg.say(offer('s' + k, 'dc_' + k)); } const inWin = Cg.p.built; Cg.clock.now += 2600; Cg.say(offer('late', 'dc_late')); const stillFull = Cg.p.built; Cg.clock.now += 400; Cg.say(offer('later', 'dc_later'));
            r.window = [Cg.api.SIG_OFFERS, Cg.api.SIG_OFFERS_MS, inWin, stillFull, Cg.p.built];
            // (4) the honest path
            const Dg = mkG(true, 'waypoint-room'); Dg.say(offer('kay', 'dc_kay')); Dg.say({ type: 'CANDIDATE', src: 'kay', payload: { connectionId: 'dc_kay', candidate: {} } }); Dg.say({ type: 'CANDIDATE', src: 'mallory', payload: { connectionId: 'dc_kay', candidate: {} } }); Dg.say(offer('kay', 'dc_kay')); Dg.say({ type: 'ANSWER', src: 'kay', payload: { connectionId: 'dc_kay', sdp: {} } });
            Dg.say({ type: 'OPEN' }); Dg.say({ type: 'ID-TAKEN' }); Dg.say({ type: 'ERROR', payload: { msg: 'x' } }); Dg.say({ type: 'OPEN', src: 'mallory' }); Dg.say({ type: 'ID-TAKEN', src: 'mallory' }); Dg.say({ type: 'LEAVE', src: 'kay' }); Dg.say({ type: 'EXPIRE', src: 'mallory' });
            r.honest = [Dg.p.built, Dg.p.handled, Dg.p.emitted, Dg.p._lostMessages.size];
            // (5) what the library throws stays inside
            const thrower = mkP(); thrower._handleMessage = () => { throw new Error('inside the library'); }; const tApi = new Function('Date', 'console', sgSrc + '\nreturn sigGate;')(Date, { warn() {} }); tApi(thrower, true, 'r');
            r.contained = noThrow(() => thrower._handleMessage({ type: 'OPEN' }));
            const getThrows = mkP(); getThrows.getConnection = () => { throw new Error('boom'); }; tApi(getThrows, true, 'r'); r.failClosed = [noThrow(() => getThrows._handleMessage(offer('s', 'c'))), getThrows.inner];
            r.noLib = [tApi({}, true, 'r'), tApi({ _handleMessage() {} }, true, 'r'), tApi(null, true, 'r')];
            // (6) a player's peer
            const Fg = mkG(false, 'waypoint-room'); Fg.p.conns.set('waypoint-room', [{ connectionId: 'dc_mine', peerConnection: {}, handleMessage(m) { Fg.p.handled.push(m.type); } }]);
            Fg.p.conns.set('stranger', [{ connectionId: 'dc_theirs', peerConnection: {}, handleMessage(m) { Fg.p.handled.push('STRAY:' + m.type); } }]);   // a connection held under another sender: still not the room this app dialed
            Fg.say({ type: 'ANSWER', src: 'stranger', payload: { connectionId: 'dc_theirs', sdp: {} } }); Fg.say({ type: 'CANDIDATE', src: 'stranger', payload: { connectionId: 'dc_theirs' } });
            Fg.say(offer('stranger', 'dc_x')); Fg.say(offer('waypoint-room', 'dc_y')); Fg.say({ type: 'ANSWER', src: 'stranger', payload: { connectionId: 'dc_mine', sdp: {} } }); Fg.say({ type: 'CANDIDATE', src: 'stranger', payload: { connectionId: 'dc_mine' } }); Fg.say({ type: 'ANSWER', src: 'waypoint-room', payload: { connectionId: 'dc_other', sdp: {} } });
            Fg.say({ type: 'LEAVE', src: 'stranger' }); Fg.say({ type: 'EXPIRE', src: 'stranger' }); const quiet = [Fg.p.inner, Fg.p.built, Fg.p._lostMessages.size];
            Fg.say({ type: 'ANSWER', src: 'waypoint-room', payload: { connectionId: 'dc_mine', sdp: {} } }); Fg.say({ type: 'CANDIDATE', src: 'waypoint-room', payload: { connectionId: 'dc_mine' } }); Fg.say({ type: 'EXPIRE', src: 'waypoint-room' }); Fg.say({ type: 'LEAVE', src: 'waypoint-room' }); Fg.say({ type: 'OPEN' });
            r.client = [quiet, Fg.p.handled, Fg.p.emitted];
        });
        check('transport T6 (the signaling gate, run for real on a stand-in for the library\'s peer): two thousand answers and candidates for connections the host does not hold never reach the library — nothing is kept, nothing built; an offer naming another connection class (a prototype\'s name, raw, json), a call, a malformed or oversized session description, a missing, empty, non-text or over-long connection id or sender, and a message of no known kind are dropped without a throw, the library not called',
            err === '' && J(r.kept) === J([true, '', 0, 0, 0]) && J(r.bad) === J(['', 0, 0, 0]), J([err, r.kept, r.bad]));
        check('transport T6 (the arrival window): of 25 honest offers inside ten seconds exactly 20 build a connection — the rest are dropped before anything exists — and once the oldest has left the window the next is taken',
            err === '' && J(r.window) === J([20, 10000, 20, 20, 21]), J([err, r.window]));
        check('transport T6 (the honest path): a Waypoint\'s offer reaches the library and its connection is built; its candidate reaches that connection, the same candidate from another sender does not; a second offer for a connection already held, and an answer on a host, are dropped; the service\'s own words pass only with no sender on them; "leave" passes, "expire" never on a host',
            err === '' && J(r.honest) === J([1, ['CANDIDATE:dc_kay'], ['connection', 'open', 'taken', 'error', 'leave:kay'], 0]), J([err, r.honest]));
        check('transport T6 (contained, and failing closed): a throw inside the library does not leave the wrapper; a judge that throws lets nothing through; a peer without the library\'s entry points is not wrapped (the handler\'s own checks and the transport guard still stand)',
            err === '' && r.contained === '' && J(r.failClosed) === J(['', 0]) && J(r.noLib) === J([false, false, false]), J([err, r.contained, r.failClosed, r.noLib]));
        check('transport T6 (a player\'s peer): every offer is dropped; an answer, a candidate, "leave" and "expire" pass only from the room this app dialed, and an answer or candidate only for the connection it holds — from anyone else, or for another connection, nothing reaches the library and nothing is kept',
            err === '' && J(r.client) === J([[0, 0, 0], ['ANSWER', 'CANDIDATE'], ['expire:waypoint-room', 'leave:waypoint-room', 'open']]), J([err, r.client]));
        // the host's handler, run for real with the real shape check
        let hd = null, hdErr = 'no slice';
        const hpSrc = sl('hostpeer');
        if (hpSrc && trSrc) hdErr = noThrow(() => {
            const T = mkT('host'), net = T.net; net.peer = { h: {}, on(ev, fn) { this.h[ev] = fn; } }; net.conns = []; net.active = true; const meta = Object.create(null), wired = [];
            const names = ['console', 'net', 'peer', 'code', 'gen', 'resumed', 'setStatus', 'showCode', 'rememberHostCode', 'toast', 'logEvent', 'startHeartbeat', 'ui', 'syncSessionButtons', 'renderRoster', 'getActiveCampaign', 'SC', 'save', 'connShapeOk', 'wireGuard', 'unadmittedRoom', '_connMeta', 'assetNoteSends', 'wireConn', 'setTimeout', 'ROOM_GENS', 'startHosting', 'forgetHostCode', 'Date'];
            new Function(...names, hpSrc)({ warn() {} }, net, net.peer, 'abcde23456', 0, null, () => {}, c => c, () => {}, () => {}, () => {}, () => {}, () => ({ style: {} }), () => {}, () => {}, () => null, () => null, () => {}, T.api.connShapeOk, T.api.wireGuard, () => true, meta, () => {}, c => wired.push(c.peer), () => 0, 4, () => {}, () => {}, Date);
            const good = mkC('kay'), json = Object.assign(mkC('jay'), { serialization: 'json' }), noClass = { peer: 'ray', open: true, serialization: 'binary', on() {}, send() {}, close() { this.shut = true; } };
            const e = noThrow(() => { net.peer.h.connection(new Object('stranger')); net.peer.h.connection(json); net.peer.h.connection(noClass); net.peer.h.connection(null); net.peer.h.connection(good); });
            hd = { e, listed: net.conns.map(c => c.peer), meta: Object.keys(meta), wired, jsonClosed: json.closed, noClassShut: noClass.shut === true, guarded: good._wpGuard === true };
        });
        check('transport T6 (the host\'s handler, run for real with the real shape check and guard): a thing that is no connection (what the library builds from a prototype\'s name), a connection in another encoding and one whose transport cannot be guarded are closed and never listed, recorded or wired — nothing throws; the library\'s own binary connection is listed, recorded, guarded and wired',
            hdErr === '' && hd.e === '' && J(hd.listed) === J(['kay']) && J(hd.meta) === J(['kay']) && J(hd.wired) === J(['kay']) && hd.jsonClosed === 1 && hd.noClassShut === true && hd.guarded === true, J([hdErr, hd]));
        check('transport T6 (wired): the gate goes on the host\'s peer as soon as it is made, before anything is listened to, and on a player\'s peer for the room and generation it dials',
            /var peer = new Peer\(roomPeerId\(code, gen\), peerOpts\(_hostTok \|\| undefined\)\);[^\n]*\n\s*sigGate\(peer, true, roomPeerId\(code, gen\)\);/.test(src)   /* 1.6.2 (backlog 220): a browser's host token as its key, moved on purpose */ && /\n    var gen = isRetry \? [^\n]*\n\s*sigGate\(peer, false, roomPeerId\(code, gen\)\);/.test(src));
    }

    /* ---- T7 (TRANSPORT-4, SERVER-9, FILESYSTEM-12): the key proof bound to the encrypted channel ---- */
    {
        const j = J, KB = 'b'.repeat(32), sdp = (...fps) => ({ type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n' + fps.map(f => 'a=fingerprint:sha-256 ' + f + '\r\n').join('') + 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' });
        const pcOf = (mine, theirs) => ({ localDescription: sdp(mine), remoteDescription: sdp(theirs) });
        const FH = 'AA:01', FC = 'CC:03', FM1 = 'EE:05', FM2 = 'EE:06', P = f => 'sha-256 ' + f;
        const r = {};
        r.helpers = !!(HT.dtlsPrint && HT.chanPrints && HT.saidPrints) && [
            H.authData('n1', 'waypoint-ab', 'P', 'H') === 'wp-auth|n1|waypoint-ab|P|H',
            HT.dtlsPrint({ sdp: 'v=0\r\na=fingerprint:sha-256 ab:cd:ef\r\nm=application\r\n' }) === 'sha-256 AB:CD:EF',
            HT.dtlsPrint({ sdp: 'v=0\nm=application\na=fingerprint:SHA-256 AB:CD\n' }) === 'sha-256 AB:CD',
            HT.dtlsPrint({ sdp: 'a=fingerprint:sha-256 BB:02\r\nm=x\r\na=fingerprint:sha-256 aa:01\r\na=fingerprint:sha-256 bb:02\r\n' }) === 'sha-256 AA:01,sha-256 BB:02',
            HT.dtlsPrint({ sdp: 'v=0\r\nm=application\r\n' }) === '' && HT.dtlsPrint(null) === '' && HT.dtlsPrint({ sdp: 7 }) === '' && HT.dtlsPrint({}) === '' && HT.dtlsPrint({ sdp: 'x a=fingerprint:sha-256 AB\r\n' }) === '' && HT.dtlsPrint({ sdp: 'a=fingerprint:sha-256 zz\r\n' }) === '',
            j(HT.chanPrints({ peerConnection: pcOf('aa:01', 'CC:03') })) === j({ mine: 'sha-256 AA:01', theirs: 'sha-256 CC:03' }),
            HT.chanPrints({}) === null && HT.chanPrints(null) === null && HT.chanPrints({ peerConnection: { localDescription: sdp('AA:01'), remoteDescription: sdp() } }) === null && HT.chanPrints({ peerConnection: { localDescription: null, remoteDescription: sdp('AA:01') } }) === null && HT.chanPrints({ get peerConnection() { throw new Error('gone'); } }) === null,
            j(HT.saidPrints(['a', 'b'])) === j(['a', 'b']) && [null, 'ab', ['a'], ['a', 'b', 'c'], ['a', 7], ['', 'b'], ['a', ''], ['x'.repeat(401), 'b'], { 0: 'a', 1: 'b', length: 2 }].every(v => HT.saidPrints(v) === null)
        ].every(Boolean);
        // the middle, end to end: Alice hosts waypoint-alice and knows Bob; Bob's app dials waypoint-alice but its connection ends at a third party, which holds its own connection to Alice and passes her challenge and his answer along
        const mkA = () => harness({ players: { u_bob: { name: 'Bob', key: KB } }, roomPeer: 'waypoint-alice' });
        const mkB = (peer, pc) => { const hc = harness({ role: 'client' }); storage.clear(); H.rememberTableKey('u_alice', KB); const cc = hc.conn(peer, pc); return { h: hc, c: cc, hellos: () => hc.sent.filter(s => s.m.type === 'hello').map(s => s.m) }; };
        const relay = async (edit) => {
            const A = mkA(), mAtA = A.conn('m-peer', pcOf(FH, FM1)); A.hello(mAtA, { id: 'u_bob', name: 'Bob' }); await A.settle(); const nA = A.lastSent('m-peer', 'auth').m.nonce;
            const Bb = mkB('waypoint-alice', pcOf(FC, FM2)); runGate(Bb.h.env, { type: 'auth', gmId: 'u_alice', nonce: nA }, Bb.c); await Bb.h.settle(); const said = Bb.hellos()[0] || {};
            const fwd = { proof: said.proof, fp: said.fp }; if (edit) edit(fwd);
            A.hello(mAtA, { id: 'u_bob', name: 'Bob' }, fwd); await A.settle();
            return { adm: A.admitted.length, q: A.env.pendingJoins.map(x => x.why), said, keySent: j(Bb.h.sent).indexOf(KB) >= 0, den: A.sent.filter(s => s.peer === 'm-peer' && s.m.type === 'denied').map(s => s.m.reason), told: A.unbound.slice(), closed: A.closed.slice(), confirms: A.confirms.length, key: A.camp.players.u_bob.key === KB, waits: A.sent.filter(s => s.m.type === 'wait').length };
        };
        r.passed = await relay(); r.rewritten = await relay(f => { f.fp = [P(FM1), P(FH)]; }); r.stripped = await relay(f => { delete f.fp; });
        // the direct channel
        const A2 = mkA(), bAtA = A2.conn('bob-peer', pcOf(FH, FC)); A2.hello(bAtA, { id: 'u_bob', name: 'Bob' }); await A2.settle(); const nA2 = A2.lastSent('bob-peer', 'auth').m.nonce;
        const B2 = mkB('waypoint-alice', pcOf(FC, FH)); runGate(B2.h.env, { type: 'auth', gmId: 'u_alice', nonce: nA2 }, B2.c); await B2.h.settle(); const said2 = B2.hellos()[0] || {};
        A2.hello(bAtA, { id: 'u_bob', name: 'Bob' }, { proof: said2.proof, fp: said2.fp }); await A2.settle();
        r.direct = { adm: A2.admitted.length, key: A2.admitted[0] && A2.admitted[0].key === KB, q: A2.env.pendingJoins.length, fp: said2.fp, proof: said2.proof === hmacRef(KB, 'wp-auth|' + nA2 + '|waypoint-alice|' + P(FC) + '|' + P(FH)) };
        // fail closed, both sides
        const N = H.newKey();
        const noPc = mkB('waypoint-alice', null); runGate(noPc.h.env, { type: 'auth', gmId: 'u_alice', nonce: N }, noPc.c); await noPc.h.settle();
        const noFp = mkB('waypoint-alice', { localDescription: sdp(), remoteDescription: sdp(FH) }); runGate(noFp.h.env, { type: 'auth', gmId: 'u_alice', nonce: N }, noFp.c); await noFp.h.settle();
        r.clientClosed = [noPc.hellos(), noFp.hellos()].map(s => s.length === 1 && !('proof' in s[0]) && !('fp' in s[0]) && j(s).indexOf(KB) < 0);
        const hostBlind = async (mk) => { const A = mkA(), c = A.conn('x-peer', null); A.hello(c, { id: 'u_bob', name: 'Bob' }); await A.settle(); const n = A.lastSent('x-peer', 'auth').m.nonce; A.hello(c, { id: 'u_bob', name: 'Bob' }, mk(n)); await A.settle(); r.blindQuiet = (r.blindQuiet !== false) && A.unbound.length === 0 && !A.sent.some(s => s.m.type === 'denied'); return [A.admitted.length, A.env.pendingJoins.map(x => x.why)]; };
        r.hostBlind = [await hostBlind(n => ({ proof: hmacRef(KB, 'wp-auth|' + n + '|waypoint-alice|' + P(FC) + '|' + P(FH)), fp: [P(FC), P(FH)] })), await hostBlind(n => ({ proof: hmacRef(KB, 'wp-auth|' + n + '|waypoint-alice') })), await hostBlind(n => ({ proof: hmacRef(KB, 'wp-auth|' + n + '|waypoint-alice||') }))];
        const wrongKey = await (async () => { const A = mkA(), c = A.conn('y-peer', pcOf(FH, FC)); A.hello(c, { id: 'u_bob', name: 'Bob' }); await A.settle(); const n = A.lastSent('y-peer', 'auth').m.nonce; A.hello(c, { id: 'u_bob', name: 'Bob' }, { proof: hmacRef('x'.repeat(32), 'wp-auth|' + n + '|waypoint-alice|' + P(FC) + '|' + P(FH)), fp: [P(FC), P(FH)] }); await A.settle(); return [A.admitted.length, A.env.pendingJoins.map(x => x.why)]; })();
        const oldForm = await (async () => { const A = mkA(), c = A.conn('z-peer', pcOf(FH, FC)); A.hello(c, { id: 'u_bob', name: 'Bob' }); await A.settle(); const n = A.lastSent('z-peer', 'auth').m.nonce; A.hello(c, { id: 'u_bob', name: 'Bob' }, { proof: hmacRef(KB, 'wp-auth|' + n + '|waypoint-alice') }); await A.settle(); return [A.admitted.length, A.env.pendingJoins.map(x => x.why)]; })();
        r.other = [wrongKey, oldForm];
        check('transport T7 (the helpers, run for real): the proof\'s text names the nonce, the room and the two fingerprints, the player\'s then the host\'s; a description\'s fingerprints are read from every line, session or media level, the hash named in lower case and the hex in upper, each once and in order — none for a description that has none, is missing or is no text; a connection\'s pair is this side\'s and the other\'s, or nothing when either cannot be read; a stated pair is two short texts or nothing',
            r.helpers === true, j([r.helpers, H.authData('n1', 'waypoint-ab', 'P', 'H')]));
        check('transport T7 (someone between, end to end on both sides\' real code): Bob dials Alice\'s own room id, but each leg of his connection ends at a third party with its own certificates, which passes her challenge and his answer along unchanged — Alice\'s host admits nobody and asks nobody: the right key, proven over another connection than the one that reached her app, is REFUSED (the owner\'s ruling of 2026-10-01) — the join denied in words of the app\'s own that say nothing a third party could use, the connection closed, no place in line, no question, no new key, and the GM told once, by the player\'s id; with the stated pair rewritten to match her side, or left out, the proof no longer verifies and the GM is asked as for a name without its key; the key itself never left Bob\'s machine',
            r.passed.adm === 0 && j(r.passed.q) === j([]) && j(r.passed.den) === j(['This table could not check your connection. Try joining again.']) && j(r.passed.told) === j(['u_bob']) && j(r.passed.closed) === j(['m-peer']) && r.passed.confirms === 0 && r.passed.key === true && r.passed.waits === 0
            && r.rewritten.adm === 0 && j(r.rewritten.q) === j(['nokey']) && r.rewritten.told.length === 0 && r.rewritten.den.length === 0 && r.stripped.adm === 0 && j(r.stripped.q) === j(['nokey']) && r.stripped.told.length === 0 && [r.passed, r.rewritten, r.stripped].every(x => x.keySent === false && typeof x.said.proof === 'string' && j(x.said.fp) === j([P(FC), P(FM2)])), j([r.passed, r.rewritten, r.stripped]));
        check('transport T7 (the direct channel): each side reading the other\'s certificate as the other reads its own, the player\'s answer — a proof over the nonce, the room dialed and the two fingerprints, with the pair stated beside it — goes straight in, the key kept, nobody asked',
            r.direct.adm === 1 && r.direct.key === true && r.direct.q === 0 && j(r.direct.fp) === j([P(FC), P(FH)]) && r.direct.proof === true, j(r.direct));
        check('transport T7 (fail closed): a player\'s app that cannot read its connection\'s fingerprints sends a plain hello — no proof, no pair, never the key; a host that cannot read its own connection admits nobody on a proof and refuses nobody for it either — a right key over a stated pair, and a proof in the form from before the binding, are each put to the GM exactly as a name without its key (a technical hiccup never locks the table: no denial, no notice); a wrong key over the right pair, or the old form on a readable connection, is a name without its key',
            j(r.clientClosed) === j([true, true]) && j(r.hostBlind) === j([[0, ['nokey']], [0, ['nokey']], [0, ['nokey']]]) && r.blindQuiet === true && j(r.other) === j([[0, ['nokey']], [0, ['nokey']]]), j([r.clientClosed, r.hostBlind, r.blindQuiet, r.other]));
        // the GM's words
        const apSrc = sl('approval'); let asks = null, apErr = 'no slice';
        if (apSrc) apErr = noThrow(() => {
            const ask = why => { const out = []; const env = { approvalOpen: false, pendingJoins: [{ conn: { open: true }, prof: { id: 'u_bob', name: 'Bob' }, why }], getActiveCampaign: () => null, own: H.own, bannedIds: {}, denyJoin: () => {}, showConfirm: t => out.push(t), net: { active: true, role: 'host' }, admitPlayer: () => {}, toast: () => {} };
                new Function(...Object.keys(env), apSrc + '\nprocessNextApproval();')(...Object.keys(env).map(k => env[k])); return out[0]; };
            asks = [ask('nokey'), ask('')];
        });
        // the GM's notice, run for real on the suite's own clock
        const ubSrc = sl('unbound'); let ub = null, ubErr = 'no slice';
        if (ubSrc) ubErr = noThrow(() => {
            const clock = { t: 1000000 }, toasts = [], logs = [];
            const U = new Function('own', 'toast', 'logEvent', 'Date', ubSrc + '\nreturn { unboundNotice: unboundNotice, said: function() { return _unboundSaid; }, quiet: UNBOUND_QUIET_MS, max: UNBOUND_IDS_MAX };')(H.own, t => toasts.push(String(t)), (k, t) => logs.push([k, String(t)]), { now: () => clock.t });
            const bob = { id: 'u_bob', name: 'Bob' }, first = U.unboundNotice(bob);
            for (let i = 0; i < 4; i++) { clock.t += 10000; U.unboundNotice(bob); }   // four more inside the minute
            const inside = toasts.length; U.unboundNotice({ id: 'u_cal', name: 'Cal' }); const other = toasts.length;   // another player: their own notice
            clock.t += 20001; U.unboundNotice(bob); const after = toasts.slice();   // past the minute: said again, the four counted
            clock.t += 60001; U.unboundNotice(bob); const plain = toasts[toasts.length - 1];   // none in between: no count
            clock.t += 60001; U.unboundNotice(bob); clock.t += 1; U.unboundNotice(bob); clock.t += 60001; U.unboundNotice(bob); const one = toasts[toasts.length - 1];
            const nBefore = toasts.length; for (let i = 0; i < 260; i++) U.unboundNotice({ id: 'u_x' + i, name: 'X' + i });
            ub = { first, inside, other, after, plain, one, kinds: logs.map(l => l[0]).filter((k, i, a) => a.indexOf(k) === i), same: logs.every((l, i) => l[1] === toasts[i]), ids: Object.keys(U.said()).length, proto: Object.getPrototypeOf(U.said()), flood: toasts.length - nBefore, quiet: U.quiet, max: U.max, noName: (U.unboundNotice({ id: 'u_nn' }), toasts[toasts.length - 1]) };
        });
        const UB_SAID = ' was turned away: their app holds this table’s key, but its answer was made over a different connection than the one that reached you. Nothing for you to answer — if it keeps happening, check with them another way.';
        check('transport T7 (the GM\'s notice, run for real on the suite\'s clock): a join refused for a right key over another connection is said to the GM as a toast and a Game Record "table" line naming the player — never a dialog (the notice has no way to raise one) — at most once a minute per player id, the tries in between counted into the next notice ("4 more tries since the last notice", "1 more try"), another player\'s on its own clock; the records are few (200 ids, the oldest forgotten) and prototype-free',
            ubErr === '' && !!ub && ub.first === true && ub.inside === 1 && ub.other === 2 && ub.after.length === 3 && ub.after[0] === 'Bob' + UB_SAID && ub.after[1] === 'Cal' + UB_SAID && ub.after[2] === 'Bob' + UB_SAID + ' (4 more tries since the last notice)' && ub.plain === 'Bob' + UB_SAID && ub.one === 'Bob' + UB_SAID + ' (1 more try since the last notice)'
            && j(ub.kinds) === j(['table']) && ub.same === true && ub.ids === 200 && ub.proto === null && ub.flood === 260 && ub.quiet === 60000 && ub.max === 200 && ub.noName === 'A player' + UB_SAID && !/showConfirm/.test(ubSrc || 'showConfirm'), j([ubErr, ub]));
        check('transport T7 (the GM\'s question): there are two questions and no third — the routine "a name this table already knows, but without its table key" and a stranger\'s plain one; the question for a right key over another connection is gone with its reason (that join is refused, not asked)',
            apErr === '' && asks[0] === '"Bob" wants to join your table — a name this table already knows, but without its table key (a fresh install, or someone else using that name). Let them in?' && asks[1] === '"Bob" wants to join your table. Let them in?'
            && !/unbound/.test(apSrc || 'unbound') && !/'unbound'/.test(gateSrc) && !/'unbound'/.test(queueSrc) && !/did not match this connection/.test(src), j([apErr, asks]));
        check('transport T7 (wired): the gate reads the fingerprints of the connection being judged and admits only when the key is right AND the pair the proof covers is the pair this side reads; a right key with both ends readable and differing is denied and the GM told — no queue, no admission; anything else is asked as a name without its key; the notice records go with the session; the player\'s answer is made over its own connection\'s pair, and with none readable no proof is sent',
            /var ch0 = chanPrints\(conn\), fp0 = saidPrints\(msg\.fp\) \|\| \(ch0 \? \[ch0\.theirs, ch0\.mine\] : null\);/.test(gateSrc)
            /* 1.6.3 (the multiplayer review, finding 17), moved on purpose: the right key over this very connection also lets an old connection of the same player step aside, and anything less while that old one is live is refused */
            /* 1.6.3 (a password set mid-session), moved on purpose: the admission is one function, inP, run at once or, for a seated player who proved the key with no password, once the host's proof and the snapshot's signature are ready; such a player's failed proof is refused as a wrong password (pwMiss) */
            && /var inP = function\(\) \{ if \(liveDupOf\(conn, prof\.id\) && dupDrop\(conn, prof\.id\)\)[^\n]*admitPlayer\(conn, prof, key0\); \};[\s\S]*?\n\s*else if \(keyOk0 && bound0\) inP\(\);[^\n]*\n\s*else if \(pwSat\) pwMiss\(\);[^\n]*\n\s*else if \(dupV\) \{ denyJoin\(conn, 'That player identity is already at the table\.'\); return; \}[^\n]*\n\s*else if \(keyOk0 && ch0\) \{ denyJoin\(conn, 'This table could not check your connection\. Try joining again\.'\); unboundNotice\(prof\); \}[^\n]*\n\s*else queueJoin\(conn, prof, 'nokey'\);/.test(gateSrc)
            && /bannedIds = \{\}; pendingJoins = \[\]; approvalOpen = false; _unboundSaid = Object\.create\(null\);/.test(src)
            && /if \(keyA && nonceA && chA\) hmacHex\(keyA, authData\(nonceA, conn\.peer, chA\.mine, chA\.theirs\)\)\.then\(sayA\); else sayA\(null\);/.test(gateSrc) && (gateSrc.match(/admitPlayer\(/g) || []).length === 1);
    }
})());
// R2 security, cluster K (2026-10-01): the PLAYER's side against a hostile host — what the fuzz harness (tools/fuzzcheck.js) still found at
// 8941d21. A player's app: ends its session only on the dialed host's word (g12); keeps a host's geometry only as finite numbers (g13); drops a
// message whole past the app's own sizes and depth, and an item of a kind it does not hold (g14); keeps every table keyed by a wire value
// prototype-free (g16); renders a chat flood once (g17). Each run on the real code, sliced
pendingChecks.push((async () => {
    const J = JSON.stringify, bwK = n => tryBetween('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]') || '';
    const fnK = (start, end) => { const i = src.indexOf(start); if (i < 0) return ''; const k = src.indexOf(end, i + 1); return k < 0 ? '' : src.slice(i, k) + end; };
    const protoNow = () => Object.getOwnPropertyNames(Object.prototype).sort().join() + '|' + Object.getOwnPropertyNames(Array.prototype).sort().join();
    const PROTO0 = protoNow();
    const noThrow = f => { try { f(); return ''; } catch (e) { return e.constructor.name + ': ' + e.message; } };
    // (g16) the sound-transfer table (assetWaiters) and its two readers, run for real: a path such as "__proto__" or "constructor" is no waiter —
    // nothing thrown, nothing written on a prototype, nothing kept; a part's bytes are typed; an honest transfer still lands as a Blob
    {
        const assetSrc = [lineOf('function own('), lineOf('var assetCache = Object.create(null);'), lineOf('var assetPending = Object.create(null);'), lineOf('var assetRenderTimer = null;'), lineOf('var assetWaiters = '), lineOf('var ASSET_PART = '), lineOf('function isAudioPath('), fnK('function assetMime(path) {', '\n}\n'), lineOf('var ASSET_PLACEHOLDER = '), lineOf('var _assetRetries = '),
            fnK('net.fetchAsset = function(path, size) {', '\n};\n'), fnK('function handleAssetPart(msg) {', '\n}\n'), fnK('function handleAssetArrival(msg) {', '\n}\n'),
            'return { part: handleAssetPart, arrival: handleAssetArrival, waiters: function() { return assetWaiters; }, cache: function() { return assetCache; }, pending: function() { return assetPending; } };'].join('\n');
        const mkA = () => { const A = { sent: [], timers: [], renders: 0, events: 0, blobs: [], revoked: [] }; const conn = { peer: 'h', open: true, send(m) { packCheck(m); A.sent.push(m); } };
            const net = { active: true, role: 'client', stream: false, conns: [conn], assetSrc: () => {} };
            A.err = noThrow(() => { A.api = new Function('net', 'setTimeout', 'clearTimeout', 'document', 'state', 'render', 'URL', 'Blob', 'CustomEvent', 'btoa', assetSrc)(net, (fn, ms) => { A.timers.push({ fn, ms }); return A.timers.length; }, id => { const t = A.timers[id - 1]; if (t) t.fn = null; }, { dispatchEvent() { A.events++; } }, { viewMode: 'visual' }, () => { A.renders++; }, { createObjectURL: b => { A.blobs.push(b); return 'blob:x' + A.blobs.length; }, revokeObjectURL(u) { A.revoked.push(u); } }, globalThis.Blob, function() {}, globalThis.btoa); });
            A.net = net; return A; };
        const A = mkA(); const errs = [];
        const KEYS = ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf'];
        if (!A.err) KEYS.forEach(k => {
            errs.push(noThrow(() => A.api.part({ type: 'asset-part', path: k, i: 0, n: 1, data: {} })), noThrow(() => A.api.part({ type: 'asset-part', path: k, i: 0, n: 1, data: new Uint8Array([1]).buffer })));
            errs.push(noThrow(() => A.api.arrival({ type: 'asset', path: k, mime: 'text/html', data: new Uint8Array([60, 115]).buffer })), noThrow(() => A.api.arrival({ type: 'asset', path: k, error: 'busy' })));
        });
        const proto1 = protoNow(), kept1 = A.err ? -1 : Object.keys(A.api.waiters()).length + Object.keys(A.api.cache()).length;
        errs.push(noThrow(() => A.api.part({ type: 'asset-part', path: '/saves/images/audio/never.mp3', i: 0, n: 1, data: new Uint8Array([1]).buffer })));   // never asked for: dropped
        check('security K g16 (assets, client): an asset-part or an asset naming a path such as "__proto__", "constructor" or "hasOwnProperty" is no waiter and no picture — nothing thrown, nothing written on Object.prototype or Array.prototype, nothing kept; a part for a sound never asked for is dropped',
            !A.err && errs.every(e => e === '') && proto1 === PROTO0 && kept1 === 0 && Object.keys(A.api.waiters()).length === 0, J([A.err, errs.filter(Boolean), proto1 === PROTO0, kept1]));
        // an honest transfer: asked through net.fetchAsset, answered in parts (a view and a buffer), a part whose bytes are no bytes ignored, the Blob the sum
        let got = null, failed = null; const P = '/saves/images/audio/s.mp3';
        if (!A.err) { const pr = A.net.fetchAsset(P, 10); pr.then(b => { got = b; }, e => { failed = e.message; });
            const asked = A.sent.length === 1 && A.sent[0].type === 'asset-req' && A.sent[0].path === P;
            A.api.part({ type: 'asset-part', path: P, i: 1, n: 2, data: [1, 2, 3] }); A.api.part({ type: 'asset-part', path: P, i: 1, n: 2, data: { byteLength: 3, length: 3 } }); A.api.part({ type: 'asset-part', path: P, i: 1, n: 2, data: 'abc' });
            const stillWaiting = Object.keys(A.api.waiters()).length === 1;
            A.api.part({ type: 'asset-part', path: P, i: 0, n: 2, data: new Uint8Array([1, 2]) }); A.api.part({ type: 'asset-part', path: P, i: 1, n: 2, data: new Uint8Array([3]).buffer });
            await new Promise(r => setImmediate(r));
            check('security K g16 (assets, client): an honest sound transfer still lands — one request, parts as a typed-array view or a buffer summed into a Blob of their bytes, the waiter gone; a part whose data is an array, a plain object or a string is ignored and the transfer waits on',
                asked && stillWaiting && !failed && !!got && got.size === 3 && Object.keys(A.api.waiters()).length === 0, J([asked, stillWaiting, failed, got && got.size]));
        }
        // the outside audit of 2026-10-01 (cluster V): a picture from the host becomes an address of this app's own origin — its type is the
        // app's own word (by the path it asked for), its bytes are bytes, and an SVG (which can carry script) is never a blob of this origin
        {
            const B = mkA(), script = () => new Uint8Array([60, 115, 99, 114, 105, 112, 116, 62]).buffer;   // "<script>"
            const land = (p, mime, data) => { if (B.err) return [B.err]; B.api.pending()[p] = true; const n = B.blobs.length, ev = B.events; const err = noThrow(() => B.api.arrival({ type: 'asset', path: p, mime: mime, data: data === undefined ? script() : data }));
                return [err, B.blobs.length === n + 1 ? B.blobs[n].type : 'no blob', B.api.cache()[p], Object.prototype.hasOwnProperty.call(B.api.pending(), p), B.events - ev]; };
            const lied = [land('/saves/images/m/a.png', 'text/html'), land('/saves/images/m/b.png', 'application/xhtml+xml'), land('/saves/images/m/c.png', ['text/html']), land('/saves/images/m/d.png', { toString: 0 }), land('/saves/images/m/e.png', 'TEXT/HTML; charset=utf-8'), land('/saves/images/m/f.png', 'image/svg+xml')];
            const jpgLied = land('/saves/images/m/g.jpg', 'image/svg+xml'), other = [land('/saves/images/m/h.webp'), land('/saves/images/m/i.html', 'text/html'), land('/saves/images/m/noext', 'text/html')];
            check('cluster V (assets, client): a picture\'s blob takes its type from the path this app asked for, never from the host\'s word — a .png the host calls a page, an XHTML page, an SVG, a list or a value that cannot be read as text is an image/png blob all the same (nothing thrown, nothing left pending), a .jpg is image/jpeg; a path with no picture type of the app\'s own is a plain octet stream, never a page and never an empty type; the arrival\'s code no longer reads the host\'s type at all',
                !B.err && lied.every(r => r[0] === '' && r[1] === 'image/png' && /^blob:x\d+$/.test(r[2]) && r[3] === false && r[4] === 1) && jpgLied[1] === 'image/jpeg' && other.every(r => r[0] === '' && r[1] === 'application/octet-stream' && r[3] === false)
                && !/msg\.mime/.test(fnK('function handleAssetArrival(msg) {', '\n}\n')), J([B.err, lied.map(r => r.slice(0, 2)), jpgLied.slice(0, 2), other.map(r => r.slice(0, 2))]));
            const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script><text>—</text></svg>', 'utf8'), svg = land('/saves/images/m/art.svg', 'image/svg+xml', new Uint8Array(svgBytes)), svgUp = land('/saves/images/m/ART2.SVG', undefined, new Uint8Array(svgBytes).buffer);
            const view = new Uint8Array(svgBytes.length + 6); view.set(svgBytes, 3); const svgView = land('/saves/images/m/part.svg', undefined, new Uint8Array(view.buffer, 3, svgBytes.length));   // a view into a longer buffer: only its own bytes
            const decode = u => (typeof u === 'string' && u.indexOf('data:image/svg+xml;base64,') === 0 ? Buffer.from(u.slice(26), 'base64').equals(svgBytes) : false);
            const svgBig = land('/saves/images/m/big.svg', 'image/svg+xml', new Uint8Array(2 * 1024 * 1024 + 1)), svgAt = land('/saves/images/m/at.svg', undefined, new Uint8Array(2 * 1024 * 1024));
            check('cluster V (assets, client): an SVG from the host never becomes a blob of this app\'s origin — it is kept as a data address of its own bytes (an array or a view into a longer buffer alike), which draws the same in a picture or a background and is no page of the app\'s if ever opened as one; an SVG past 2 MB settles on the placeholder; the picture is no longer pending and the page is told once',
                [svg, svgUp, svgView].every(r => r[0] === '' && r[1] === 'no blob' && decode(r[2]) && r[3] === false && r[4] === 1) && svgBig[1] === 'no blob' && /^data:image\/gif;base64,/.test(svgBig[2] || '') && svgBig[3] === false && svgAt[1] === 'no blob' && /^data:image\/svg\+xml;base64,/.test(svgAt[2] || ''), J([svg.slice(0, 2), (svg[2] || '').slice(0, 40), svgUp.slice(0, 2), svgView.slice(0, 2), decode(svgView[2]), svgBig.slice(0, 2), (svgBig[2] || '').slice(0, 30), svgAt[1]]));
            const notBytes = [land('/saves/images/m/n1.png', 'image/png', { byteLength: 3 }), land('/saves/images/m/n2.png', 'image/png', [1, 2, 3]), land('/saves/images/m/n3.png', 'image/png', 'abc'), land('/saves/images/m/n4.png', 'image/png', { byteLength: 3, length: 3, 0: 1 })];
            const honest = [land('/saves/images/m/p.png', undefined, new Uint8Array([1, 2, 3])), land('/saves/images/m/q.JPG', 'image/jpeg', new Uint8Array([1, 2]).buffer), land('/saves/images/m/r.gif', 'image/gif', new Uint8Array([1]))];
            const again = land('/saves/images/m/p.png', undefined, new Uint8Array([4, 5]));
            check('cluster V (assets, client): a picture\'s data is bytes or it is nothing — an object that only claims a length, an array or a text is not kept and the picture no longer waits; an honest picture still lands as before: a blob address cached, typed by its extension, the page told once, and one sent a second time takes the first one\'s place (its address let go)',
                notBytes.every(r => r[0] === '' && r[1] === 'no blob' && r[2] === undefined && r[3] === false) && honest.every(r => r[0] === '' && /^blob:x\d+$/.test(r[2]) && r[3] === false && r[4] === 1) && honest[0][1] === 'image/png' && honest[1][1] === 'image/jpeg' && honest[2][1] === 'image/gif'
                && again[1] === 'image/png' && again[2] !== honest[0][2] && B.revoked.indexOf(honest[0][2]) >= 0, J([notBytes.map(r => r.slice(0, 4)), honest.map(r => r.slice(0, 3)), again.slice(0, 3), B.revoked]));
        }
        // the queued-edit table (_charPending), keyed by a request id the host echoes: prototype-free and read by own key; a host naming "__proto__" or "constructor" settles nothing and reaches no sheet
        const pendSrc = bwK('pending'); const calls = [];
        const runPend = (rid) => { const api = new Function('_charPending', '_charHost', 'getActiveCampaign', 'window', 'toast', 'SC', 'net', pendSrc + '\nreturn charPendingDone;')({}, Object.create(null), () => ({ chars: {} }), { wpSheets: { editResult: (r) => calls.push('edit:' + r), charChanged: r => calls.push('changed:' + r) } }, t => calls.push('toast:' + t), () => null, {}); return noThrow(() => api(rid, false, 'slow', 'm')) + noThrow(() => api(rid, true, '', 'm')); };
        const pendErr = ['__proto__', 'constructor', 'hasOwnProperty', 'toString'].map(runPend).join('');
        check('security K g16 (client): the queued-edit table is prototype-free and read by own key — a char-ack or char-deny whose request id is "__proto__" or "constructor" settles nothing and reaches no sheet; the sound-transfer table is prototype-free and reset so; both pinned',
            pendSrc !== '' && pendErr === '' && calls.length === 0 && /var p = Object\.prototype\.hasOwnProperty\.call\(_charPending, rid\) \? _charPending\[rid\] : null; if \(!p\) return;/.test(pendSrc)
            && /if \(typeof msg\.rid !== 'string' \|\| !Object\.prototype\.hasOwnProperty\.call\(_charPending, msg\.rid\)\) return; var rsH = SC2\.cleanDenyReason\(msg\.reason\), msH = SC2\.cleanItemMsg\(msg\.msg\);[^\n]*charPendingDone\(msg\.rid/.test(src)
            && (src.match(/_charPending = Object\.create\(null\)/g) || []).length === 2 && !/_charPending = \{\}/.test(src)
            && /^var assetWaiters = Object\.create\(null\);/m.test(src) && /assetWaiters = Object\.create\(null\); assetPending = Object\.create\(null\);/.test(src) && !/assetWaiters = \{\}/.test(src), J([pendErr, calls]));
    }
    // (g13b) text style in more places (1.5.4): a text box's font as a host names it. A player's app keeps one of Waypoint's own fonts under the
    // list's spelling, or a plain family name, and nothing else; with no cleaner on hand it keeps none
    {
        const TFn = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'textfmt.js')).split(String.fromCharCode(92)).join('/'));
        const mk = win => new Function('window', 'cleanWaitingItem', 'sanitizeRichText', 'cleanHostLight', 'cleanHostTokSenses', 'cleanHostFxb', lineOf('function cleanHostWbItem(w) {') + '\nreturn cleanHostWbItem;')(win, H.cleanWaitingItem, t => t, () => {}, () => {}, () => {});
        const cwF = mk({ wpTextFmt: TFn }), cwNone = mk({}), cwOld = mk({ wpTextFmt: { FONTS: TFn.FONTS } });
        const f = (cw, font, type) => { const o = cw({ id: 't', type: type || 'text', text: 'x', font }); return 'font' in o ? o.font : 'none'; };
        const BAD = ['x"; background:url(//evil.example/x)', 'Arial, Georgia', "A'", 'a;b', 'url(x)', '<b>', '', ' ', 7, true, null, {}, ['Cinzel'], { toString() { return 'Cinzel'; } }, 'A'.repeat(61)];
        check('text style (client): a text box\'s font from the host is kept only as the cleaner keeps it: one of Waypoint\'s own under the list\'s spelling, or a plain family name as it is; a declaration, a second family, a quote, an address, an empty name, a number, an object or a name past the cap is dropped, on a piece of any kind; a box with no font gains none; with no cleaner on hand (none, or a textfmt from before the list) no font is kept at all',
            f(cwF, 'Cinzel') === 'Cinzel' && f(cwF, ' cinzel ') === 'Cinzel' && f(cwF, 'Georgia') === 'Georgia' && f(cwF, 'Times New Roman') === 'Times New Roman' && BAD.every(v => f(cwF, v) === 'none') && f(cwF, 'x"; color:red', 'rect') === 'none' && f(cwF, 'Lora', 'rect') === 'Lora'
            && !('font' in cwF({ id: 't', type: 'text', text: 'x' })) && f(cwNone, 'Cinzel') === 'none' && f(cwNone, 'Georgia') === 'none' && f(cwOld, 'Cinzel') === 'none', J([BAD.map(v => f(cwF, v)), f(cwNone, 'Cinzel'), f(cwOld, 'Cinzel')]));
        check('text style (client, the source): the font is cleaned in the one function every piece a host sends goes through, by textfmt.js cleanFont alone, and deleted when that gives nothing',
            /if \(w\.type === 'text'\) w\.text = sanitizeRichText\(w\.text\); if \(w\.font !== undefined\) \{ var TFf = window\.wpTextFmt, fn = TFf && TFf\.cleanFont \? TFf\.cleanFont\(w\.font\) : undefined; if \(fn\) w\.font = fn; else delete w\.font; \}/.test(lineOf('function cleanHostWbItem(w) {')));
    }
    // (g13c) the words of a text box as a player's app and an import keep them (the real sanitizeRichText on a stand-in for the page's own parser, with the
    // real safeStyle and richFont): the color and the size the Content editor's bar gives a selection survive as written, and a font named inside the words
    // follows the rule of the box's own font
    {
        const TFw = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'textfmt.js')).split(String.fromCharCode(92)).join('/'));
        const richSrc = ['var RICH_TAGS = ', 'var RICH_DROP = ', 'var RICH_STYLE = ', 'function richFont(v, asName) {', 'function safeStyle(css) {', 'function safeRichHref(h) {', 'function safeRichSrc(s) {', 'function escAttr(s) {'].map(lineOf).join('\n')
            + '\n' + src.slice(src.indexOf('function sanitizeRichText(html) {'), src.indexOf('net.sanitizeRichText = sanitizeRichText;'));
        const Tn = s => ({ nodeType: 3, nodeValue: s }), El = (tag, attrs, kids) => ({ nodeType: 1, tagName: tag.toUpperCase(), childNodes: kids || [], getAttribute: k => (attrs && Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null) });
        let tree = [];
        const mkRich = win => new Function('window', 'DOMParser', richSrc + '\nreturn { safeStyle: safeStyle, richFont: richFont, sanitizeRichText: sanitizeRichText };')(win, function() { this.parseFromString = () => ({ body: El('body', {}, tree) }); });
        const Rw = mkRich({ wpTextFmt: TFw }), R0 = mkRich({}), Rold = mkRich({ wpTextFmt: { FONTS: TFw.FONTS } });
        const walk = (R, kids) => { tree = kids; return R.sanitizeRichText('x'); };
        const sizes = TFw.SIZES.map(k => Rw.safeStyle('font-size: ' + TFw.SIZE_EM[k] + ';'));
        check('text style (a text box\'s words, the real safeStyle): the color and each size step the bar writes are kept as written; a web address, an expression and a property that is none of the look\'s are dropped',
            Rw.safeStyle('color: rgb(217, 83, 79);') === 'color:rgb(217, 83, 79)' && Rw.safeStyle('color:#d9534f') === 'color:#d9534f' && J(sizes) === J(TFw.SIZES.map(k => 'font-size:' + TFw.SIZE_EM[k])) && sizes.length === 4
            && Rw.safeStyle('color: url(x)') === '' && Rw.safeStyle('color: expression(1)') === '' && Rw.safeStyle('position: fixed') === '' && Rw.safeStyle('background-image: none') === '' && Rw.safeStyle('color: red; position: fixed; font-size: 1.2em') === 'color:red;font-size:1.2em', J([Rw.safeStyle('color: rgb(217, 83, 79);'), sizes]));
        const wideIn = ['font-family: inherit', 'font-family: INITIAL', 'font-family: unset', 'font-family: revert', 'font-family: revert-layer', 'font-family: "inherit", serif'];
        const famIn = ['font-family: Cinzel', 'font-family: "IM Fell English"', "font-family: 'lora', serif", 'font-family: Papyrus', 'font-family: Arial, Helvetica, sans-serif', 'font-family: serif', 'font-family: Ar(ial', "font-family: 'a\\b'", 'font-family: ', 'font-family: x y-z_9'];
        const famOut = ['font-family:"Cinzel", serif', 'font-family:"IM Fell English", serif', 'font-family:"Lora", serif', 'font-family:"Papyrus"', 'font-family:"Arial"', 'font-family:serif', '', '', '', 'font-family:"x y-z_9"'];
        check('text style (a text box\'s words): a font named inside the words follows the rule of the box\'s own font: the first family named, as fontCss writes it (one of Waypoint\'s own with its generic family, a plain family name quoted, a generic family as its keyword); a stack is cut to its first family, a bracket names nothing, and a word CSS reads as an instruction (inherit and its kind) names nothing, so the words keep the box\'s own font; with no cleaner at hand (none, or a textfmt from before the list) no font is kept, while a color and a size still are',
            J(famIn.map(Rw.safeStyle)) === J(famOut) && wideIn.every(s => Rw.safeStyle(s) === '') && Rw.safeStyle('color: red; font-family: inherit') === 'color:red' && Rw.richFont('inherit', true) === '' && famIn.every(s => R0.safeStyle(s) === '' && Rold.safeStyle(s) === '') && R0.safeStyle('color: red; font-family: Cinzel; font-size: 1.2em') === 'color:red;font-size:1.2em'
            && Rw.richFont('cinzel', true) === 'Cinzel' && Rw.richFont('Comic Sans MS', true) === 'Comic Sans MS' && Rw.richFont('Arial, Helvetica', true) === 'Arial' && Rw.richFont('a;b', true) === '' && R0.richFont('Cinzel', true) === '' && R0.richFont('Cinzel') === '', J([famIn.map(Rw.safeStyle), famIn.map(R0.safeStyle)]));
        const words = walk(Rw, [El('b', {}, [El('span', { style: 'color: rgb(217, 83, 79);' }, [El('span', { style: 'font-size: 1.2em;' }, [Tn('Eldara')])]), Tn(' Realm')]), Tn(' <b>"x"</b> & more')]);
        const fam = walk(Rw, [El('span', { style: 'font-family: Papyrus, fantasy; color: red' }, [Tn('a')]), El('font', { face: 'cinzel', color: '#ff0000', size: '3' }, [Tn('b')]), El('font', { face: 'Arial, Helvetica' }, [Tn('c')]), El('font', { face: 'x"y' }, [Tn('d')]), El('span', { style: 'font-family: url(//evil.example/f.ttf)' }, [Tn('e')])]);
        const fam0 = walk(R0, [El('span', { style: 'font-family: Cinzel; color: red' }, [Tn('a')]), El('font', { face: 'Cinzel', color: '#ff0000' }, [Tn('b')])]);
        const drop = walk(Rw, [El('script', {}, [Tn('alert(1)')]), El('span', { style: 'color: red', onclick: 'x()' }, [Tn('k')]), El('center', {}, [Tn('m')])]);
        check('text style (a text box\'s words, the real sanitizeRichText on a parser of the suite\'s own): the markup the bar leaves on a selection comes through whole, a color inside bold with a size inside it, the words escaped as text; a font inside the words is written by the same rule in a style and in a font element (a stack cut to its first family, a name with a quote dropped with its attribute, a web address dropped); with no cleaner the words keep their color and lose every font; a script goes with its content, a handler attribute is never written, an unknown wrapper keeps its words',
            words === '<b><span style="color:rgb(217, 83, 79)"><span style="font-size:1.2em">Eldara</span></span> Realm</b> &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; more'
            && fam === '<span style="font-family:&quot;Papyrus&quot;;color:red">a</span><font color="#ff0000" size="3" face="Cinzel">b</font><font face="Arial">c</font><font>d</font><span>e</span>'
            && fam0 === '<span style="color:red">a</span><font color="#ff0000">b</font>' && drop === '<span style="color:red">k</span>m', J([words, fam, fam0, drop]));
    }
    // (g13) geometry a host sends — a whole map's or a delta's pieces (cleanHostWbItem) and a live move (handlePos, the client branch): finite
    // numbers within bounds, or nothing
    {
        const cw = new Function('window', 'cleanWaitingItem', 'sanitizeRichText', 'cleanHostLight', 'cleanHostTokSenses', 'cleanHostFxb', lineOf('function cleanHostWbItem(w) {') + '\nreturn cleanHostWbItem;')({}, H.cleanWaitingItem, t => t, () => {}, () => {}, () => {});
        const g = o => cw(Object.assign({ id: 't', type: 'circle' }, o));
        const bad = g({ x: 'calc(1px)', y: { a: 1 }, w: NaN, h: Infinity, rot: 'NaNdeg', front: [] }), nul = g({ x: null, y: '300', rot: true, front: -Infinity });
        const far = g({ x: 1e300, y: -1e300, w: 1e300, h: -5, rot: 1e300, front: -1e300 }), ok = g({ x: 100.5, y: -200, w: 60, h: 52, rot: 45, front: 90 }), none = g({});
        const gone = o => ['x', 'y', 'w', 'h', 'rot', 'front'].every(k => !(k in o));
        check('security K g13 (client): a piece from the host keeps its place, size, turn and facing only as finite numbers — a string, an object, null, true, NaN or an infinity is dropped from it (the renderer\'s defaults apply, as for a piece that never had one); a finite number past the board is clamped (±1e7 a place or a size, ±1e6 a turn or a facing); honest numbers exactly; none made up',
            gone(bad) && gone(nul) && far.x === 1e7 && far.y === -1e7 && far.w === 1e7 && far.h === -5 && far.rot === 1e6 && far.front === -1e6 && J(ok) === J({ id: 't', type: 'circle', x: 100.5, y: -200, w: 60, h: 52, rot: 45, front: 90 }) && gone(none) && none.id === 't', J([bad, nul, far, ok, none]));
        const posSrc = ownKeySrc + bwK('pos');
        const mkP = () => { const P = { dom: [], turned: [] }; const tok = { id: 'tB', type: 'circle', isChar: true, ownerId: 'u_b', x: 100, y: 200, rot: 10, front: 20 };
            const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'mA', items: { mA: { id: 'mA', type: 'map', whiteboard: [tok] } } } } } };
            const net = { role: 'client', foreign: true, syncedPeer: 'h', myId: 'u_a', paused: false, roster: {} };
            P.err = noThrow(() => { P.api = new Function('net', 'state', 'applyPosToDom', 'window', 'getActiveCampaign', posSrc + '\nreturn handlePos;')(net, state, m => P.dom.push(J(m)), { wpSheets: { tokenTurned: (id, fin) => P.turned.push(id + ':' + fin) } }, () => state.appState.campaigns.k); });
            P.tok = tok; P.at = () => [tok.x, tok.y, tok.rot, tok.front]; P.pos = (o, peer) => P.api(Object.assign({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tB' }, o), { peer: peer || 'h' }); return P; };
        const P1 = mkP(); if (!P1.err) { P1.pos({ x: 'calc(1px)', y: { a: 1 }, rot: 'NaNdeg', front: [] }); P1.pos({ x: null, y: '300', rot: true, front: -Infinity }); P1.pos({ x: NaN, y: Infinity, rot: {}, front: 'x' }); P1.pos({ x: 300, y: 400, rot: 0, front: 0 }, 'h-stale'); P1.pos({ x: 300, y: 400, rot: 0, front: 0 }, 'waypoint-other'); }
        const P2 = mkP(); if (!P2.err) { P2.pos({ x: 1e300, y: -1e300, rot: 1e300, front: -1e300, final: true }); }
        const P3 = mkP(); if (!P3.err) { P3.pos({ x: 300, y: 400 }); P3.pos({ x: 310.5, y: 410, rot: 90, front: 180, final: true }); }
        const P4 = mkP(); if (!P4.err) { P4.pos({ x: '7', y: 5 }); P4.pos({ x: 8, y: null, rot: 'NaNdeg', front: 45 }); }   // field by field: what is a number lands, the rest stays
        const P5 = mkP(); if (!P5.err) { delete P5.tok.rot; delete P5.tok.front; P5.pos({ x: 1, y: 2, rot: 'x', front: {} }); }   // a token that never had a turn: given a garbage one it reads 0 (a number), never the text
        check('security K g13 (client): a live move from the host lands field by field, only as finite numbers — a string, an object, null, a numeric string, NaN or an infinity leaves that field as the token has it (nothing changed, nothing drawn, the dial not told); a finite number past the board is clamped; from a connection other than the synced host nothing; honest moves land on the copy and the screen alike (a move that names no turn keeps the token\'s), the facing dial told; a token with no turn given a garbage one reads 0',
            !P1.err && J(P1.at()) === J([100, 200, 10, 20]) && P1.dom.length === 0 && P1.turned.length === 0
            && J(P2.at()) === J([1e7, -1e7, 1e6, -1e6]) && J(P2.dom) === J([J({ type: 'pos', campId: 'k', itemId: 'mA', wbId: 'tB', x: 1e7, y: -1e7, rot: 1e6, front: -1e6, final: true })])
            && J(P3.at()) === J([310.5, 410, 90, 180]) && J(P3.dom.map(d => JSON.parse(d)).map(d => [d.x, d.y, d.rot, d.front, d.final])) === J([[300, 400, 10, 20, false], [310.5, 410, 90, 180, true]]) && J(P3.turned) === J(['tB:false', 'tB:true'])
            && J(P4.at()) === J([8, 5, 10, 45]) && J(P4.dom.map(d => JSON.parse(d)).map(d => [d.x, d.y, d.rot, d.front])) === J([[100, 5, 10, 20], [8, 5, 10, 45]])
            && J(P5.at()) === J([1, 2, 0, 0]) && J(P5.dom.map(d => JSON.parse(d)).map(d => [d.x, d.y, d.rot, d.front])) === J([[1, 2, 0, 0]]),
            J([P1.err, P1.at(), P1.dom, P2.at(), P2.dom, P3.at(), P3.dom, P3.turned, P4.at(), P4.dom, P5.at(), P5.dom]));
    }
    // (g14) the shape of a host's message, judged before any branch reads it (wireShapeOk): strings of at most 400,000 characters, nothing nested
    // past 64 levels, bytes not walked; and an item of a kind a player's copy does not hold is not stored (applyItem)
    {
        const wsSrc = bwK('wireshape'); let ok = null; const wsErr = noThrow(() => { ok = new Function(wsSrc + '\nreturn wireShapeOk;')(); });
        const nest = n => { let o = { a: 1 }; for (let i = 0; i < n; i++) o = { a: o }; return o; };
        const honest = { type: 'snapshot', appState: { campaigns: { c1: { items: { m: { whiteboard: [{ id: 't', pts: [[1, 2], [3, 4]], text: 'x'.repeat(200000), src: 'd'.repeat(300000) }] } } } } } };
        const r = ok ? {
            honest: ok(honest), edge: ok({ type: 'x', s: 'y'.repeat(400000) }), over: ok({ type: 'x', s: 'y'.repeat(400001) }), deepIn: ok({ type: 'x', a: [{ b: { c: 'z'.repeat(400001) } }] }),
            typeBig: ok({ type: 'q'.repeat(400001) }), nest64: ok(nest(63)), nest65: ok(nest(64)), nest2000: ok(nest(2000)), nestArr: ok((() => { let a = [1]; for (let i = 0; i < 70; i++) a = [a]; return { type: 'x', a }; })()),
            bytes: ok({ type: 'asset', data: new Uint8Array(600000) }), buffer: ok({ type: 'asset-part', data: new Uint8Array(600000).buffer }), plain: ok({ type: 'hb' }), nul: ok(null), num: ok(5)
        } : null;
        check('security K g14 (client): wireShapeOk — a host\'s message with a string past 400,000 characters anywhere (a key\'s value, an array\'s, the type) or an object nested past 64 levels is refused; a snapshot with a 200,000-character text and a 300,000-character picture, a string of exactly 400,000, 64 levels, half a megabyte of bytes (not walked) and a bare message pass',
            !wsErr && !!r && r.honest === true && r.edge === true && r.over === false && r.deepIn === false && r.typeBig === false && r.nest64 === true && r.nest65 === false && r.nest2000 === false && r.nestArr === false && r.bytes === true && r.buffer === true && r.plain === true && r.nul === true && r.num === true, J([wsErr, r]));
        check('security K g14 (client, wired): every message a player\'s app takes is judged by wireShapeOk first, at the head of handleMessage, before any branch; the two caps as stated',
            /function handleMessage\(msg, conn\) \{\n\s*if \(!msg \|\| !msg\.type\) return;\n\s*if \(net\.role === 'client' && !wireShapeOk\(msg\)\) return;/.test(src) && /var WIRE_STR_MAX = 400000, WIRE_DEPTH_MAX = 64;/.test(wsSrc) && (src.match(/wireShapeOk\(/g) || []).length === 2);
        {   // 1.6.2: a formula may be 10,000 characters (systemcore LIMITS.formula, dicecore's expr the same), so a roll and a system that carry the longest pass the wire's shape, far under its string cap
            const fu = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/'), SCw = await import(fu('systemcore.js')), DCw = await import(fu('dicecore.js'));
            const longF = '1d20 + ' + '1 + '.repeat(Math.floor((SCw.LIMITS.formula - 8) / 4)) + '1', okW = ok || (() => null);
            const rec = { type: 'roll', id: 'r_long', from: { id: 'u_a', name: 'Pat', gm: false }, expr: longF, draws: [7], v: 1, ts: 1 }, sysMsg = { type: 'snapshot', appState: { campaigns: { k: { system: { fields: Array.from({ length: 40 }, (_, i) => ({ id: 'f_' + i, kind: 'formula', formula: longF.replace('1d20', 'A') })) } } } } };
            check('1.6.2 the wire carries a formula at its length: a table roll of LIMITS.expr characters (the same figure as LIMITS.formula, 10,000) passes dicecore\'s cleanExpr and the client\'s wireShapeOk, as does a system of forty such formulas; the string cap stands forty times above it',
                SCw.LIMITS.formula === 10000 && DCw.LIMITS.expr === SCw.LIMITS.formula && longF.length <= SCw.LIMITS.formula && longF.length > SCw.LIMITS.formula - 4 && !!DCw.cleanExpr(longF) && okW(rec) === true && okW(sysMsg) === true && 400000 >= SCw.LIMITS.formula * 40, J([SCw.LIMITS.formula, DCw.LIMITS.expr, longF.length, okW(rec), okW(sysMsg)]));
        }
        const aiSrc = ownKeySrc + require('./checkkit').cut('netfog.js', 'function applyItem(msg) {', '\n}\n') + '\n}\n';
        const mkI = () => { const I = { renders: 0 }; const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: 'mA', items: { mA: { id: 'mA', type: 'map', whiteboard: [] } } } } } };
            I.run = msg => noThrow(() => new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'updateSidebarNav', 'cleanHostMap', 'msg', aiSrc + '\nreturn applyItem(msg);')({ applyingRemote: false }, state, { wpDocRender: { cleanDoc: d => (d && d.type === 'doc' ? { id: d.id, type: 'doc', meta: { title: 'P' }, blocks: [] } : null) }, wpFog: { invalidateVision() {}, redraw() {} } }, () => state.appState.campaigns.k, () => { I.renders++; }, () => {}, m => m, msg)); I.items = () => state.appState.campaigns.k.items; return I; };
        const I = mkI(); const ie = ['planner', 'zzz', 'circle', 'map ', 'MAP', '', 7, null, undefined].map(t => I.run({ type: 'item', campId: 'k', itemId: 'i_' + String(t), item: { id: 'i_x', type: t, meta: { title: 'P' }, content: 'secret' } })).join('');
        const ie2 = I.run({ type: 'item', campId: 'k', itemId: 'mB', item: { id: 'mB', type: 'map', whiteboard: [], meta: { title: 'B' } } }) + I.run({ type: 'item', campId: 'k', itemId: 'dD', item: { id: 'dD', type: 'doc', blocks: [{ id: 'b', type: 'text', content: '<b>x</b>' }] } });
        check('security K g14 (client): an item of a kind a player\'s copy does not hold — a planner, an unknown or misspelt type, none — is not stored (it used to be kept as sent); a map and a page still land, the page as the cleaner rebuilt it',
            ie === '' && ie2 === '' && J(Object.keys(I.items()).sort()) === J(['dD', 'mA', 'mB']) && I.items().mB.meta.title === 'B' && J(I.items().dD) === J({ id: 'dD', type: 'doc', meta: { title: 'P' }, blocks: [] }), J([ie, ie2, Object.keys(I.items())]));
    }
    // (g12) the end of a session: the dialed host's word, once
    {
        const endSrc = bwK('end');
        const mkE = () => { const E = { status: [], toasts: [], dice: 0, modal: { style: {} } }; const conn = { peer: 'h', open: true }; const net = { role: 'client', leaving: false, conns: [conn] };
            E.run = c => noThrow(() => new Function('net', 'conn', 'msg', 'diceSessionReset', 'setStatus', 'ui', 'toast', endSrc)(net, c, { type: 'end' }, () => { E.dice++; }, s => E.status.push(s), () => E.modal, t => E.toasts.push(t))); E.net = net; E.conn = conn; return E; };
        const E1 = mkE(); const e1 = E1.run({ peer: 'h-stale', open: true }) + E1.run({ peer: 'waypoint-other', open: true }); const stale = { status: E1.status.length, toasts: E1.toasts.length, dice: E1.dice, leaving: E1.net.leaving, modal: E1.modal.style.display };
        const e2 = E1.run(E1.conn) + E1.run(E1.conn) + E1.run(E1.conn); const own1 = { status: E1.status.slice(), toasts: E1.toasts.slice(), dice: E1.dice, leaving: E1.net.leaving, modal: E1.modal.style.display };
        check('security K g12 (client): an "end" ends the session only from the host this app dialed (its first connection), once — from a stale connection kept wired after a reconnect, or from another host, nothing: no status, no toast, the table kept; from the dialed host the one teardown as before (the chat and rolls reset, the status line, the join dialog, one toast), and a repeat does nothing more',
            endSrc !== '' && e1 === '' && e2 === '' && J(stale) === J({ status: 0, toasts: 0, dice: 0, leaving: false, modal: undefined })
            && J(own1) === J({ status: ['Session ended by the GM.'], toasts: ['The GM ended the session. Restoring your own campaign.'], dice: 1, leaving: true, modal: 'flex' }), J([e1, e2, stale, own1]));
    }
    // (g17) a flood of chat lines from the host is drawn once: pushChat schedules one render (renderChatSoon), the log stays at 200
    {
        const pcSrc = ['var chatLog = [], chatUnread = 0, _chatRollOpened = false, _chatRenderTimer = null;', fnK('function pushChat(m) {', '\n}\n'), lineOf('function renderChatSoon() {'), 'return { push: pushChat, log: function() { return chatLog; }, soon: typeof renderChatSoon === "function" ? renderChatSoon : null };'].join('\n');
        const C = { renders: 0, timers: [], toasts: 0 }; let capi = null;
        const cErr = noThrow(() => { capi = new Function('ui', 'renderChat', 'refreshChatRecipients', 'armChatDismiss', 'net', 'toast', 'applyLine', 'dueLine', 'window', 'setTimeout', 'clearTimeout', pcSrc)(() => ({ style: { display: 'none' } }), () => { C.renders++; }, () => {}, () => {}, { myId: 'u_me' }, () => { C.toasts++; }, () => '', () => '', {}, (fn, ms) => { C.timers.push({ fn, ms }); return C.timers.length; }, id => { const t = C.timers[id - 1]; if (t) t.fn = null; }); });
        const fire = () => { const due = C.timers.filter(t => t.fn); due.forEach(t => { const f = t.fn; t.fn = null; f(); }); return due.length; };
        let during = -1, fired1 = 0, after1 = -1, fired2 = 0, after2 = -1, pending = -1;
        if (!cErr) { for (let i = 0; i < 500; i++) capi.push({ type: 'chat', scope: 'global', from: { id: 'u_x', name: 'X' }, text: 'hi ' + i, ts: i }); during = C.renders; pending = C.timers.filter(t => t.fn).length; fired1 = fire(); after1 = C.renders; capi.push({ type: 'chat', scope: 'global', from: { id: 'u_x', name: 'X' }, text: 'more', ts: 501 }); fired2 = fire(); after2 = C.renders; }
        check('security K g17 (client): 500 chat lines pushed in one burst draw the panel once — pushChat schedules one render (renderChatSoon, a short timer) instead of redrawing every line, the log kept at its last 200 lines; the next line after the draw schedules one more; pushChat itself calls renderChat no longer',
            !cErr && during === 0 && pending === 1 && fired1 === 1 && after1 === 1 && fired2 === 1 && after2 === 2 && capi.log().length === 200 && capi.log()[199].text === 'more' && C.toasts === 501
            && /\n    renderChatSoon\(\);[^\n]*\n    if \(m\.roll && window\.wpDice\) window\.wpDice\.landed\(m\);/.test(fnK('function pushChat(m) {', '\n}\n')) && !/\n    renderChat\(\);/.test(fnK('function pushChat(m) {', '\n}\n')), J([cErr, during, pending, fired1, after1, fired2, after2, capi && capi.log().length, C.toasts]));
    }
    // 1.6.3 (the improvement week's review of sheets and rolls, finding 16): Table Chat stays where its reader scrolled to. renderChat and chatNewShow,
    // sliced and run for real on a log of plain objects (each line 50 px, the window 200): at the end it sticks to the end; scrolled up, its place is
    // kept and New messages comes up; a line of this machine's own takes it to the end; reaching the end by hand or pressing the button puts it away
    {
        const rcSrc = fnK('function renderChat() {', '\n}\n'), cnSrc = fnK('function chatNewShow(log, on) {', '\n}\n');
        const els = {}, mkEl = tag => { const e = { tag, style: {}, kids: [], listeners: {}, addEventListener(k, f) { this.listeners[k] = f; } }; return e; };
        const parent = { insertBefore(n) { if (n.id) els[n.id] = n; } };
        const log = { kids: [], parentNode: parent, shown: true, get clientHeight() { return this.shown ? 200 : 0; }, scrollTop: 0, listeners: {}, addEventListener(k, f) { this.listeners[k] = f; }, get firstChild() { return this.kids[0] || null; }, get scrollHeight() { return this.shown ? this.kids.length * 50 : 0; }, set textContent(v) { this.kids = []; }, appendChild(f) { this.kids = this.kids.concat(f.kids); } };
        const doc = { createDocumentFragment: () => ({ kids: [], appendChild(n) { this.kids.push(n); } }), getElementById: id => els[id] || null, createElement: mkEl };
        let R = null, rErr = null;
        try { R = new Function('ui', 'cardLookNow', 'paintCardLook', 'chatEnv', 'chatOuter', 'chatEntryNode', 'window', 'document', 'net', 'broadcastChatSync', 'var chatLog = [], chatUnread = 0, _chatNodes = null, _cardLook = null, _cardSig = \'\', _chatPopAsked = false, _chatLastDrawn = null, _chatToEnd = false;\n' + rcSrc + '\n' + cnSrc + '\nreturn { draw: renderChat, log: function() { return chatLog; }, toEnd: function() { _chatToEnd = true; } };')(
            k => (k === 'chatLog' ? log : null), () => null, () => {}, () => '', () => '', m => ({ m }), { wpPopout: false }, doc, { myId: 'u_me' }, () => {}); } catch (e) { rErr = e; }
        const say = (who, n) => { for (let i = 0; i < (n || 1); i++) R.log().push({ type: 'chat', from: { id: who, name: who }, text: 'x', ts: i }); R.draw(); };
        let s1 = -1, s2 = -1, chip2 = '', s3 = -1, chip3 = '', s4 = -1, chip4 = '', s5 = -1, chip5 = '';
        if (R) {
            say('u_x', 10); s1 = log.scrollTop;                                                     // 500 px of lines: at the end (a log of plain objects does not hold scrollTop to its room)
            log.scrollTop = 100; say('u_x'); s2 = log.scrollTop; chip2 = els.chatNewBtn ? els.chatNewBtn.style.display : 'none';   // scrolled up: kept, the button up
            log.scrollTop = log.scrollHeight - 200; log.listeners.scroll(); chip3 = els.chatNewBtn.style.display; say('u_x'); s3 = log.scrollTop;   // back at the end by hand: the button goes, and the next line sticks
            log.scrollTop = 50; say('u_me'); s4 = log.scrollTop; chip4 = els.chatNewBtn.style.display;   // up again, and a line of its own: to the end
            log.scrollTop = 0; say('u_x'); els.chatNewBtn.listeners.click(); s5 = log.scrollTop; chip5 = els.chatNewBtn.style.display;   // the button takes it down
        }
        check('1.6.3 (finding 16) Table Chat keeps its reader\'s place: a log at its end sticks to the end, one scrolled up stays where it was with New messages up, a line of this machine\'s own and the button take it to the end, and reaching the end by hand puts the button away',
            !rErr && rcSrc !== '' && cnSrc !== '' && s1 === 500 && s2 === 100 && chip2 === '' && chip3 === 'none' && s3 === 600 && s4 === 650 && chip4 === 'none' && s5 === 700 && chip5 === 'none', J([rErr && String(rErr), s1, s2, chip2, chip3, s3, s4, chip4, s5, chip5]));
        // the review of words: a panel put away has no layout (height 0). Lines that come while it is put away are drawn there, the browser forgets its
        // scroll, and when the panel is opened again (the chat button, a roll raising it, back on screen: each sets _chatToEnd) the newest line is in
        // view. Shown again with no such word, a line that came while it was away still counts as fresh, so New messages comes up
        let h1 = -1, hc1 = '', h2 = -1, hc2 = '';
        if (R) {
            log.shown = false; log.scrollTop = 0; say('u_x', 3); log.shown = true; R.toEnd(); R.draw(); h1 = log.scrollTop; hc1 = els.chatNewBtn.style.display;   // opened: at the end
            log.shown = false; log.scrollTop = 0; say('u_x', 2); log.shown = true; R.draw(); h2 = log.scrollTop; hc2 = els.chatNewBtn.style.display;   // shown with no word: kept, the button up
        }
        const nsrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8');
        check('the review of words: Table Chat opened, raised by a roll or back on screen shows its newest line, lines that came while it was put away do not count as drawn, and a draw while it has no layout takes up no wish to go to the end',
            !rErr && h1 === 850 && hc1 === 'none' && h2 === 0 && hc2 === ''
            && /if \(opening\) \{ chatUnread = 0; refreshChatRecipients\(\); _chatToEnd = true; renderChat\(\);/.test(nsrc)
            && /addEventListener\('wpfloatback', function\(\) \{ chatUnread = 0; _chatToEnd = true; renderChat\(\); \}\)/.test(nsrc)
            && /panel\.style\.display = 'flex'; chatUnread = 0; refreshChatRecipients\(\); closed = false; _chatToEnd = true;/.test(nsrc), J([h1, hc1, h2, hc2]));
    }
})());
// Voice chat (1.5.9, pull request #1 by Hydragal): net.js routes two words to voice.js and reads nothing else of them. The two branches, sliced
// by their markers (voice, voiceup) and run for real behind the real admission gate (runGate): a player's app hears the GM's word ('voice')
// only from the synced host, after the snapshot, never in the stream window; the host hears a player's word ('voice-up') only from an
// admitted connection, the gate at handleMessage's head having closed a stranger's before any branch; with no voice module neither throws.
// voice.js itself (the hub, the player's link, the caps) is run on stub peer connections in tools/voicecheck.js
{
    const VJ = v => JSON.stringify(v);
    const vS = between('// [netcheck:voice-start]', '// [netcheck:voice-end]', 'voice'), vuS = between('// [netcheck:voiceup-start]', '// [netcheck:voiceup-end]', 'voiceup');
    const vDispatch = new Function('net', 'window', 'msg', 'conn', "if (msg.type === 'voice' && net.role === 'client') {\n" + vS + "\n} else if (msg.type === 'voice-up' && net.role === 'host') {\n" + vuS + "\n}\nreturn 'ran';");
    const vRec = () => { const r = { host: [], player: [] }; r.win = { wpVoice: { fromHost: m => r.host.push(m.act), fromPlayer: (m, c) => r.player.push([m.act, c.peer]) } }; return r; };
    const OFFER = { type: 'voice', act: 'offer', id: '0123456789abcdef', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
    const cli = o => Object.assign({ role: 'client', foreign: true, syncedPeer: 'gm-peer', stream: false }, o || {});
    const hearC = (netO, peer, noMod) => { const r = vRec(); try { vDispatch(netO, noMod ? {} : r.win, Object.assign({}, OFFER), { peer }); } catch (e) { return 'threw'; } return r.host.length; };
    const cl = [hearC(cli(), 'gm-peer'), hearC(cli({ foreign: false }), 'gm-peer'), hearC(cli({ syncedPeer: null }), 'gm-peer'), hearC(cli(), 'evil-peer'), hearC(cli({ stream: true }), 'gm-peer'), hearC(cli({ role: 'host' }), 'gm-peer'), hearC(cli(), 'gm-peer', true)];
    // the host: the real gate first, then the branch
    const hostFire = (admit, msg, noMod) => { const h = harness(), c = h.conn('peerV'), r = vRec(); if (admit) h.env.net.roster.peerV = { id: 'u_v', name: 'Vee' };
        const g = runGate(h.env, Object.assign({}, msg), c); let out = 'gated'; if (g === 'ran') { try { out = vDispatch(h.env.net, noMod ? {} : r.win, Object.assign({}, msg), c) || 'returned'; } catch (e) { out = 'threw'; } }
        return [g || 'closed', out, r.player, h.closed.slice()]; };
    const JOIN = { type: 'voice-up', act: 'join' };
    const ho = [hostFire(true, JOIN), hostFire(false, JOIN), hostFire(true, JOIN, true), hostFire(true, OFFER), hostFire(true, { type: 'voice-up', act: 'answer', id: '0123456789abcdef', sdp: 'v=0\r\n' })];
    check('voice chat (1.5.9, pull request #1; the voice and voiceup branches run for real behind the real admission gate): a player\'s app hands the GM\'s word to voice.js only from the synced host, after the snapshot, never in the stream window, and never as a host; another peer\'s word, one before the snapshot and one in the stream window reach nothing; the host hands a player\'s word to voice.js with the connection it came on, only from an admitted connection: a stranger\'s is closed by the gate before any branch reads it; a host that receives a player\'s own word for the other way has no branch for it; with no voice module neither side throws',
        VJ(cl) === VJ([1, 0, 0, 0, 0, 0, 0]) && VJ(ho) === VJ([['ran', 'ran', [['join', 'peerV']], []], ['closed', 'gated', [], ['peerV']], ['ran', 'returned', [], []], ['ran', 'ran', [], []], ['ran', 'ran', [['answer', 'peerV']], []]]), VJ([cl, ho]));
    check('voice chat (source): the client branch reads nothing of the message but hands it on, the host branch likewise with its connection; the host\'s close of a connection takes its voice link, a table\'s end on either side closes every voice link, the snapshot asks voice.js to come back into voice after a reconnect, and voice.js takes the table\'s own ICE servers and relay rule from net.rtcConfig, which is the peer\'s own config',
        /^\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer \|\| net\.stream \|\| !window\.wpVoice\) return;\n\s*window\.wpVoice\.fromHost\(msg\);\s*$/.test(vS)
        && /^\s*\/\/[^\n]*\n\s*if \(!window\.wpVoice\) return;\n\s*window\.wpVoice\.fromPlayer\(msg, conn\);\s*$/.test(vuS)
        && /\} else if \(msg\.type === 'voice' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:voice-start\]/.test(src) && /\} else if \(msg\.type === 'voice-up' && net\.role === 'host'\) \{\n\s*\/\/ \[netcheck:voiceup-start\]/.test(src)
        && (src.match(/msg\.type === 'voice(-up)?'/g) || []).length === 2
        && src.includes("if (net.role === 'host' && window.wpVoice) { try { window.wpVoice.connGone(conn.peer); } catch (e) {} }") && (src.match(/window\.wpVoice\.tableLeft\(\)/g) || []).length === 2
        && (src.match(/window\.wpVoice\.tableReady\(\)/g) || []).length === 1 && src.includes('net.rtcConfig = function() { return peerOpts().config; };'), VJ([vS.length, vuS.length]));
}

T.finish();
