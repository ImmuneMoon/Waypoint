/* netmediacheck.js: light, time and video on the wire, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 4, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: lighting L4 (the Sight unit of the fog defaults, an item's light cleaned again by
   a client, the system's light rules in the players' view), lighting L5 (a player's own light: tok-light and its answers), the
   campaign's clock on the wire (item 20 K2) and its dated notes (K3), and a video shown live to the table (item 21 V2).
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netmediacheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc } = kit.netSlices('netmediacheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, ownKeySrc, siSrc, mkConn } = kit.netHarness('netmediacheck');
const j = JSON.stringify;
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
    check('Lighting: the campaign\'s fog defaults carry the Sight unit to players only when it is feet, meters or cells, after the sight field; yards (no unit), a unit the app does not know, a prototype key or anything not text never travels',
        j(unitsOk) === j(['ft', 'm', 'cells'].map(u => j({ type: 'campFog', campId: 'k_1', fog: { fields: { sight: 'f_sight', sightUnit: u }, defaults: { sight: 6 } } })))
        && junkU.every(s => s === j({ type: 'campFog', campId: 'k_1', fog: { fields: { sight: 'f_sight' }, defaults: { sight: 6 } } }))
        && j(hostL({ id: 'k_1', fog: { fields: { sightUnit: 'cells' } } }).net.campFogMessage().fog) === j({ fields: { sightUnit: 'cells' }, defaults: { sight: 0 } }), j([unitsOk, junkU]));
    const rmOf = (d) => hostL({ id: 'k_1', fog: { defaults: Object.assign({ sight: 2 }, d) } }).net.campFogMessage().fog.defaults;
    check('senses S4b and S6: the campaign\'s fog defaults carry "Marks in a fight" only as On your own turn and "Players remember what they have seen" only as false (the tick taken away: on is the default); anything else never travels',
        j(rmOf({ marks: 'turn', remember: false })) === j({ sight: 2, marks: 'turn', remember: false }) && [{ marks: 'move' }, { marks: true }, { remember: 'yes' }, { remember: 1 }, { remember: 0 }, { marks: 'TURN', remember: true }].every(d => j(rmOf(d)) === j({ sight: 2 })), j(rmOf({ marks: 'turn', remember: false })));
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
    check('Lighting: a client cleans the Sight unit its host sends again — feet, meters or cells are kept, anything else is dropped (the unit it had goes with it) and nothing but the known keys comes in — then works the fog out afresh and redraws; another peer changes nothing',
        j(c1) === j([{ fields: { sight: 'f_sight', sightUnit: 'ft' }, defaults: { sight: 9 } }, ['inv', 'draw']]) && j(c2) === j([{ fields: { sight: 'f_sight' }, defaults: { sight: 9 } }, ['inv', 'draw']]) && j(c3) === j([{ fields: { sightUnit: 'cells' }, defaults: { sight: 9 } }, ['inv', 'draw']])
        && j(c4) === j([{ fields: {}, defaults: { sight: 9 } }, ['inv', 'draw']]) && j(c6) === j(c4) && j(c5) === j([{ defaults: { sight: 2 }, fields: { sightUnit: 'm' } }, []]), j([c1, c2, c3, c4, c5, c6]));
    {   // 1.6.3 (the owner, 2026-11-18, by prompt: "A setting"): how dark players' fog is travels with the campaign fog defaults, cleaned by the
        // host as it sends (campFogMessage) and again by a player's app as it takes them (the client's campFog branch); solid is no key
        const dkSend = [90, 84.6, 10, 100, 120, 'dark', null].map(v => rmOf({ dark: v }).dark);
        const mkD = v => ({ type: 'campFog', campId: 'k_1', fog: { defaults: { sight: 9, dark: v } } }), dkTake = [92, 70, 99.7, '80', { valueOf: () => 85 }, -Infinity].map(v => runL(mkD(v), 'host1')[0].defaults.dark);
        const dkEvil = runL(mkD(85), 'evil')[0].defaults.dark;
        const campDk = { id: 'k_1', fog: { defaults: { sight: 6 } } }, hD = hostL(campDk); hD.net.syncCampFog(); campDk.fog.defaults.dark = 88; hD.net.syncCampFog(); hD.net.syncCampFog();
        check('1.6.3 how dark players\' fog is: the host sends the campaign\'s "dark" with the fog defaults only as a whole percent from 80 to 99 (below 80 held to 80; 100 or more and anything that is no number, solid, no key); a change of it alone goes to admitted players once; a player\'s app cleans what its host sends again by the same rule, and another peer\'s word changes nothing',
            j(dkSend) === j([90, 85, 80, undefined, undefined, undefined, undefined]) && j(dkTake) === j([92, 80, undefined, undefined, undefined, undefined]) && dkEvil === undefined
            && hD.sent.a.length === 2 && hD.sent.a[1].fog.defaults.dark === 88 && hD.sent.a[0].fog.defaults.dark === undefined && hD.sent.w.length === 0, j([dkSend, dkTake, dkEvil, hD.sent.a]));
    }

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
    check('Lighting: a client cleans an item\'s light its host sends again (run for real) — the radii clamped, dim at least bright, off only when true, a unit only of feet, meters or cells, the name cut to 60 characters with its control characters made spaces and kept as plain text, nothing else carried; a light of nonsense leaves a token and reads 0 and 0 on a light source',
        j(lights) === j([{ bright: 20, dim: 40, off: true, unit: 'ft', name: 'Torch' }, { bright: 3, dim: 3, name: badClean }, 'none', { bright: 0, dim: 0 }, { bright: 1000, dim: 1000, unit: 'cells' }, 'none', 'none', 'none', 'none', { bright: 0, dim: 0 }, { bright: 0, dim: 2, unit: 'm', name: '<script>' }])
        && badClean.length === 60 && got[1].light.name.length === 60 && !ctrlRe.test(got[1].light.name) && got[10].text === 'T:9' && got[0].isChar === true && got[0].x === 5, j(lights));
    const plain = { id: 't4', type: 'image', x: 1, y: 2 }, plainOut = CL.cleanHostWbItem(plain), waitOut = CL.cleanHostWbItem(items()[6]);
    check('Lighting: an item without a light is untouched by the client\'s cleaner (the same item, no light key appears) and a waiting token still carries no light, whatever the host sent with it',
        plainOut === plain && j(plain) === j({ id: 't4', type: 'image', x: 1, y: 2 }) && !ownK(plain, 'light') && j(waitOut) === j(H.cleanWaitingItem(items()[6])) && !ownK(waitOut, 'light') && waitOut.waiting === 1 && !/Lamp/.test(j(waitOut))
        && CL.cleanHostWbItem({ id: 7, light: { bright: 1, dim: 1 } }) === null && CL.cleanHostWbItem(null) === null, j([plainOut, waitOut]));
    const noCore = [CN, CO].map(C => items().map(w => C.cleanHostWbItem(w)).map(w => (ownK(w, 'light') ? w.light : 'none')));
    check('Lighting: with no light cleaner on hand a client takes no light at all from its host — a good one, a hostile one and a light source\'s alike are removed, never kept as they came',
        j(noCore) === j([Array(11).fill('none'), Array(11).fill('none')]), j(noCore));
    const nfCl = [CL, CN, CO].map(C => ownK(C.cleanHostWbItem({ id: 'nf', type: 'rect', nullFx: 'e_void', nulls: ['sn_a'] }), 'nullFx')), nfCm = CL.cleanHostMap({ id: 'm1', type: 'map', whiteboard: [{ id: 'nf', type: 'rect', nullFx: 'e_void' }] });
    check('a null area\'s effect (1.6.0): a player\'s app takes the key from no host, with or without a cleaner at hand, on a piece and in a whole map',
        j(nfCl) === j([false, false, false]) && !/nullFx/.test(j(nfCm)), j([nfCl, nfCm]));
    const htGot = [2, 2.345, 1e9, '3', -1, { v: 1 }, null].map((h, i) => CL.cleanHostWbItem({ id: 'hh' + i, type: 'rect', height: h })).map(w => (ownK(w, 'height') ? w.height : 'none')), htNo = CN.cleanHostWbItem({ id: 'hq', type: 'rect', height: 2 });
    check('item 19 H1: a client cleans a piece\'s height its host sends again (run for real) — yards above 0 to the hundredth, at most 10,000; text, a number not above 0, an object or nothing none; with no cleaner on hand none',
        j(htGot) === j([2, 2.35, 10000, 'none', 'none', 'none', 'none']) && !ownK(htNo, 'height'), j(htGot));
    const txVals = ['bricks', 'grass', 'Bricks', 'url(x)', '__proto__', 1, {}], txIn = () => txVals.map((t, i) => ({ id: 'tx' + i, type: 'rect', x: 1, y: 2, texture: t })), txOf = ws => ws.map(w => (ownK(w, 'texture') ? w.texture : 'none'));
    const txGot = txOf(txIn().map(w => CL.cleanHostWbItem(w))), txNo = [CN, CO].map(C => txOf(txIn().map(w => C.cleanHostWbItem(w)))), txMap = CL.cleanHostMap({ id: 'm1', type: 'map', whiteboard: txIn() }), txPlain = { id: 'tp', type: 'rect', x: 1 }; CL.cleanHostWbItem(txPlain);
    check('map builder B1: a client cleans a piece\'s texture its host sends again (the one-line cleanHostWbItem, run for real with the real fogcore) — of seven values the two names bricks and grass are kept, another case, an address, a prototype\'s name, a number and an object dropped; a whole map alike through cleanHostMap; none at all without the cleaner on hand (no fogcore, or one without cleanTexture); a piece without one gains none; the one-liner\'s prefix still as pinned and its texture clause in it once',
        j(txGot) === j(['bricks', 'grass', 'none', 'none', 'none', 'none', 'none']) && j(txNo) === j([Array(7).fill('none'), Array(7).fill('none')]) && j(txOf(txMap.whiteboard)) === j(txGot) && txMap.whiteboard.length === 7 && !ownK(txPlain, 'texture')
        && /function cleanHostWbItem\(w\) \{ if \(!w \|\| typeof w !== 'object' \|\| typeof w\.id !== 'string'\) return null; if \(w\.waiting\) return cleanWaitingItem\(w\);/.test(src)
        && src.split("if (w.texture !== undefined) { var FCx = window.wpFogCore, tx = FCx && FCx.cleanTexture ? FCx.cleanTexture(w.texture) : null; if (tx) w.texture = tx; else delete w.texture; } if (w.ground !== undefined) {").length === 2 && lineL('function cleanHostWbItem(w) {').split('w.texture').length === 5, j([txGot, txNo, txOf(txMap.whiteboard)]));
    // fold B7: the four land patterns of a world map as a host names them (the owner, 2026-10-11, by prompt: "The four (Recommended)": Forest, Mountains, Sand, Snow)
    const landVals = ['forest', 'mountains', 'sand', 'snow', 'Forest', 'MOUNTAINS', 'Sand', 'SNOW'], landIn = () => landVals.map((t, i) => ({ id: 'ld' + i, type: i % 2 ? 'hexagon' : 'rect', x: 1, y: 2, w: 50, h: 50, texture: t, name: 'Land' }));
    const landKept = txOf(landIn().map(w => CL.cleanHostWbItem(w))), landNo = [CN, CO].map(C => txOf(landIn().map(w => C.cleanHostWbItem(w)))), landMap = CL.cleanHostMap({ id: 'm1', type: 'map', whiteboard: landIn() });
    const landSame = landIn().slice(0, 4).map(w => { const was = j(w), o = CL.cleanHostWbItem(w); return o === w && j(o) === was; });
    check('fold B7: a client keeps the four land patterns of a world map its host names (cleanHostWbItem, run for real with the real fogcore). A piece that wears forest, mountains, sand or snow keeps that pattern and is left as it came. Another case of each name is dropped. A whole map alike through cleanHostMap. None is kept without the cleaner on hand',
        j(landKept) === j(['forest', 'mountains', 'sand', 'snow', 'none', 'none', 'none', 'none']) && j(landNo) === j([Array(8).fill('none'), Array(8).fill('none')]) && j(txOf(landMap.whiteboard)) === j(landKept) && landMap.whiteboard.length === 8 && j(landSame) === j([true, true, true, true]),
        j([landKept, landNo, txOf(landMap.whiteboard), landSame]));
    // map builder B3: a piece's picture fill (texSrc, texTile) as a host names it
    const psVals = [['/saves/images/m1/floor.png', 2], ['/saves/images/m1/stone floor.jpg', 'whole'], ['/saves/images/m1/floor.png', 3], ['/saves/images/m1/floor.png', undefined], ['http://x.test/a.png', 1], ['//x.test/saves/images/a.png', 2], ['data:image/png;base64,AA', 1], ['/saves/images/journal/a.png', 1], ['/saves/images/../data.png', 4], ['/saves/images/a%2e.png', 1], ['/api/data.png', 1], [5, 1], [{ a: 1 }, 2], [undefined, 4], [null, 'whole']];
    const psIn = () => psVals.map((v, i) => { const w = { id: 'ps' + i, type: 'rect', x: 1, y: 2 }; if (v[0] !== undefined) w.texSrc = v[0]; if (v[1] !== undefined) w.texTile = v[1]; return w; }), psOf = ws => ws.map(w => [ownK(w, 'texSrc') ? w.texSrc : 'none', ownK(w, 'texTile') ? w.texTile : 'none']);
    const psGot = psOf(psIn().map(w => CL.cleanHostWbItem(w))), psNo = [CN, CO].map(C => psOf(psIn().map(w => C.cleanHostWbItem(w)))), psMap = CL.cleanHostMap({ id: 'm1', type: 'map', whiteboard: psIn() }), psPlain = { id: 'pp', type: 'rect', x: 1 }, psBoth = CL.cleanHostWbItem({ id: 'pb', type: 'rect', texture: 'bricks', texSrc: '/saves/images/m1/floor.png', texTile: 4 });
    const psHalf = hostSide({ wpFogCore: { cleanTexSrc: FCx.cleanTexSrc } }).cleanHostWbItem({ id: 'ph', type: 'rect', texSrc: '/saves/images/m1/floor.png', texTile: 4 });
    check('map builder B3: a client cleans a piece\'s picture fill its host sends again (cleanHostWbItem, run for real with the real fogcore): the path only as a plain picture path under /saves/images/, and the repeat only as 1, 2, 4 or whole and only beside a path that was kept; a web address, an inline picture, the Journal\'s folder, a path that walks, a percent sign, a path elsewhere, a number or an object leave neither key; a whole map alike through cleanHostMap; none at all without the cleaner on hand, and no repeat with the path\'s cleaner alone; a piece without one gains none, and a pattern beside a picture stays',
        j(psGot) === j([['/saves/images/m1/floor.png', 2], ['/saves/images/m1/stone floor.jpg', 'whole'], ['/saves/images/m1/floor.png', 'none'], ['/saves/images/m1/floor.png', 'none']].concat(Array(11).fill(['none', 'none']))) && j(psNo) === j([Array(15).fill(['none', 'none']), Array(15).fill(['none', 'none'])]) && j(psOf(psMap.whiteboard)) === j(psGot) && psMap.whiteboard.length === 15
        && CL.cleanHostWbItem(psPlain) === psPlain && !ownK(psPlain, 'texSrc') && !ownK(psPlain, 'texTile') && psBoth.texture === 'bricks' && psBoth.texSrc === '/saves/images/m1/floor.png' && psBoth.texTile === 4 && psHalf.texSrc === '/saves/images/m1/floor.png' && !ownK(psHalf, 'texTile')
        && lineL('function cleanHostWbItem(w) {').split('w.texSrc').length === 5 && lineL('function cleanHostWbItem(w) {').split('w.texTile').length === 5 && lineL('function cleanHostWbItem(w) {').split("typeof FCq.cleanTexSrc === 'function'").length === 2, j([psGot, psNo, psHalf]));
    const grGot = [3, -2.346, 1e9, -1e9, 0, '3', { v: 1 }, null].map((g, i) => CL.cleanHostWbItem({ id: 'gg' + i, type: 'rect', ground: g })).map(w => (ownK(w, 'ground') ? w.ground : 'none')), grNo = [CN, CO].map(C => C.cleanHostWbItem({ id: 'gq', type: 'rect', ground: 2 })), grPlain = { id: 'gp', type: 'rect', x: 1 };
    check('item 19b H5: a client cleans a piece\'s ground height its host sends again (run for real) — yards from -1000 to 1000 to the hundredth, below 0 for a pit; 0, text, an object or nothing none; with no cleaner on hand none; a piece without one is the same piece, no key added',
        j(grGot) === j([3, -2.35, 1000, -1000, 'none', 'none', 'none', 'none']) && grNo.every(w => !ownK(w, 'ground')) && CL.cleanHostWbItem(grPlain) === grPlain && !ownK(grPlain, 'ground'), j([grGot, grNo]));
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
    const manyS = base(); manyS.combat = { light: { presets: Array.from({ length: 260 }, (x, i) => ({ name: 'P' + i, bright: 1, dim: 2 })) } }; const manyV = Sx.cleanSystem(manyS, { F: Fx, gmView: false });
    check('Lighting: the system\'s light rules reach players in the players\' view (the real cleaner) — the names of dim light and darkness and the presets as short plain text with control characters made spaces, radii clamped, dim at least bright, a unit only of feet, meters or cells, the pick mark only when true, at most 240 presets, last in the combat rules; they pack for the wire and a client cleaning them again gets exactly what the host sent; a system with none, or with nonsense, carries none',
        !!viewH && j(viewH.combat.light) === j(wantL) && longClean.length === 60 && packedL === true && j(viewC) === j(viewH) && j(viewC.combat.light) === j(wantL) && Object.keys(viewH.combat).pop() === 'light'
        && !!bareV && !ownK(bareV.combat, 'light') && junkV.every(Boolean) && manyV.combat.light.presets.length === 240 && manyV.combat.light.presets[239].name === 'P239' && j(Sx.cleanSystem(JSON.parse(j(manyV)), { F: Fx, gmView: false, libCats: {} })) === j(manyV)
        && Sx.lightName(viewC, 1) === 'Dim light <b>x</b>' && Sx.lightName(viewC, 0) === longClean && Sx.lightName(viewC, 2) === '' && j(Sx.lightPresets(viewC)) === j(wantL.presets), j([viewH && viewH.combat, packedL, junkV]));

    // (d) a player's copy of a lit map
    const siA = src.indexOf('function sanitizeItem(');
    const siL = new Function('window', siSrc() + '\nreturn sanitizeItem;')({});
    const torch = { bright: 20, dim: 40, unit: 'ft', name: 'Torch' }, lamp = { bright: 2, dim: 4, off: true, unit: 'cells', name: 'Street lamp' };
    const mapS = { id: 'm1', type: 'map', rooms: [], links: [], fog: { on: true, mode: 'auto' }, whiteboard: [
        { id: 'w1', type: 'image', isChar: true, x: 1, y: 2, w: 3, h: 4, light: torch }, { id: 'w2', type: 'light', x: 5, y: 6, w: 7, h: 8, light: lamp }, { id: 'w3', type: 'image', sheet: { a: 1 }, gmInfo: 'secret', frame: { src: 'a' }, light: torch },
        { id: 'w4', type: 'image', hidden: true, x: 1, y: 2, w: 3, h: 4, light: { bright: 9, dim: 9, unit: 'm', name: 'Secret lantern' } }, { id: 'w5', type: 'light', hidden: true, x: 1, y: 2, w: 3, h: 4, light: { bright: 1, dim: 2, name: 'Secret glow' } }, { id: 'w6', type: 'rect', x: 0 }] };
    const before = j(mapS), outS = siL(mapS); let packedS = true; try { packCheck(outS); } catch (e) { packedS = e.message; }
    check('Lighting: a player\'s copy of a map keeps a visible item\'s light with its unit and name (sanitizeItem, run for real: a token\'s, a light source\'s, one on a token whose GM prep is stripped) and the light of a hidden item never travels — a hidden token or light source is not in the copy at all, its light and its name nowhere; the host\'s own map is unchanged',
        siA > 0 && outS.whiteboard.length === 4 && j(outS.whiteboard[0].light) === j(torch) && j(outS.whiteboard[1].light) === j(lamp) && outS.whiteboard[1].type === 'light' && j(outS.whiteboard[2].light) === j(torch) && !ownK(outS.whiteboard[2], 'sheet') && !ownK(outS.whiteboard[2], 'gmInfo') && !ownK(outS.whiteboard[2], 'frame')
        && j(outS.whiteboard.map(w => w.id)) === j(['w1', 'w2', 'w3', 'w6']) && !/Secret|"unit":"m"|"hidden"/.test(j(outS)) && !ownK(outS.whiteboard[3], 'light') && packedS === true && j(mapS) === before
        && j(CL.cleanHostWbItem(JSON.parse(j(outS.whiteboard[0]))).light) === j(torch) && j(CL.cleanHostMap(JSON.parse(j(outS))).whiteboard.map(w => w.light || 0)) === j([torch, lamp, torch, 0]), j(outS.whiteboard));
})());
// Lighting L5 (a player's own light) on the wire: the host's tok-light (the [netcheck:toklight] slice, run for real with the real fogcore and
// systemcore), the player's sender and its answers (LIGHT_WHY), and no other door in: the patch gate takes no light, a hidden token is not there to a player at all
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
        const tok = Object.assign({ id: 'wt', isChar: true, charName: 'Pax', ownerId: 'u_a', type: 'image', x: 0, y: 0, w: 60, h: 52, light: JSON.parse(j(torch)) }, o.tok || {});
        if (tok.light === undefined) delete tok.light;
        const tok2 = { id: 'wt', isChar: true, charName: 'Pax', ownerId: 'u_a', type: 'image', x: 9, y: 9, w: 60, h: 52, light: JSON.parse(j(lamp)) };
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
        done(swOff, torch, torchOff, 'Pat put out the light of their token (Pax)') && done(swOn, torchOff, torch, 'Pat lit Torch on their token (Pax)') && done(swBare, { bright: 3, dim: 3, off: true }, { bright: 3, dim: 3 }, 'Pat lit the light of their token (Pax)')
        && j(swOff.budgets.map(b => [typeof b.perMs, typeof b.burst, b.perMs > 0, b.burst >= 1])) === j([['number', 'number', true, true]]), j([swOff, swOn, swBare]));
    const hostile = { bright: 999, dim: 999, unit: 'cells', light: { bright: 500, dim: 500, unit: 'm', name: 'Mine' }, off: true, radius: 77, pick: true, html: '<img src=x onerror=alert(1)>', lightLock: false, locked: false, ownerId: 'u_a', charName: '<b>x</b>' };
    const swX = tl({ msg: Object.assign({}, hostile, { on: false, off: false }) }), swXon = tl({ tok: { light: JSON.parse(j(torchOff)) }, msg: Object.assign({}, hostile, { on: true }) });
    const onWords = ['false', 0, null, '', 'off', NaN, {}, []].map(v => [tl({ msg: { on: v } }), tl({ tok: { light: JSON.parse(j(torchOff)) }, msg: { on: v } })]), onGone = tl({ tok: { light: JSON.parse(j(torchOff)) }, drop: ['on'] });
    check('a player\'s own light (host): a switch takes nothing but on or off from the message — radii, a unit, a whole light, an off mark, a lock or a name for the token sent with it change nothing, and only the word false puts a light out (anything else lights it)',
        done(swX, torch, torchOff, 'Pat put out the light of their token (Pax)') && done(swXon, torchOff, torch, 'Pat lit Torch on their token (Pax)') && j(Object.keys(swX.tok).sort()) === j(['charName', 'h', 'id', 'isChar', 'light', 'ownerId', 'type', 'w', 'x', 'y']) && swX.tok.charName === 'Pax'
        && onWords.every(p => still(p[0]) && done(p[1], torchOff, torch, 'Pat lit Torch on their token (Pax)')) && done(onGone, torchOff, torch, 'Pat lit Torch on their token (Pax)'), j([swX, swXon]));

    // a pick
    const pkC = tl({ msg: { preset: 0, name: 'Candle' } }), pkG = tl({ msg: { preset: 2, name: 'Glow' } }), pkS = tl({ msg: { preset: 4, name: 'Sun' } }), pkOff = tl({ msg: { preset: 0, name: 'Candle', on: false } }), pkNew = tl({ tok: { light: undefined }, msg: { preset: 0, name: 'Candle' } });
    const pkX = tl({ msg: Object.assign({}, hostile, { preset: 0, name: 'Candle', on: true }) }), pkList = tl({ msg: { preset: 0, name: 'Candle' } });
    check('a player\'s own light (host): a pick copies the preset at that place of the host\'s own list by value — its radii, unit and name, a preset without a unit leaving none of the old light\'s — and takes nothing else from the message; a pick sent with on false gives the preset switched off; a token that had no light gets one',
        done(pkC, torch, candle, 'Pat lit Candle on their token (Pax)') && done(pkG, torch, glow, 'Pat lit Glow on their token (Pax)') && done(pkS, torch, sun, 'Pat lit Sun on their token (Pax)') && !ownK(pkS.light, 'unit') && done(pkOff, torch, candleOff, 'Pat put out the light of their token (Pax)')
        && done(pkNew, null, candle, 'Pat lit Candle on their token (Pax)') && j(pkNew.counted) === j(['m1']) && done(pkX, torch, candle, 'Pat lit Candle on their token (Pax)') && j(Object.keys(pkX.light)) === j(['bright', 'dim', 'unit', 'name'])
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
        [{ tok: { locked: true } }, 'locked'], [{ tok: { hidden: true } }, 'missing'], [{ peer: 'pB', tok: { hidden: true } }, 'missing'], [{ tok: { hidden: 1, locked: true, lightLock: true } }, 'missing'], [{ tok: { gmNoteFor: 'u_a' } }, 'missing'], [{ tok: { locked: true, lightLock: true } }, 'locked'], [{ tok: { hidden: true }, msg: { preset: 0, name: 'Candle' } }, 'missing'],
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
    check('a player\'s own light (host): each gate refuses with its own reason and nothing is written, saved, sent, toasted or logged — a paused table or player (paused), a map that is no own key of the campaign, a page, a prototype name or not text, a token that is not there (missing), another player\'s token, one with no owner, an item that is no character, a waiting token (tokowner), a locked one (locked), a hidden one — theirs or another\'s, a GM note too — as one that is not there (missing: hidden pieces), a light the GM locked (lightlock), no fog core or no system core (off), a place out of range, negative, fractional, not a number or a prototype name, a preset not ticked for players, a name that is not that preset\'s or names a prototype key (preset), a switch on a token with no light (nolight), a new light at the map\'s cap (cap), the rate by its own budget (slow); the gates are asked in that order',
        wrong.length === 0 && cases.length > 80, wrong);
    const quiet = [tl({ msg: { rid: 'l 1' } }), tl({ msg: { rid: '' } }), tl({ msg: { rid: 7 } }), tl({ msg: { rid: 'x'.repeat(25) } }), tl({ msg: { rid: '<img>' } }), tl({ drop: ['rid'] }), tl({ msg: { rid: ['l1'] } }),
        tl({ peer: 'pZ' }), tl({ peer: 'constructor' }), tl({ peer: '__proto__' }), tl({ peer: 'hasOwnProperty' }), tl({ peer: 'pZ', paused: true }), tl({ peer: 'pZ', msg: { on: false } })];
    check('a player\'s own light (host): a request whose id is malformed and a peer who is not admitted (a prototype name is no player) get no answer at all, and nothing changes',
        quiet.every(r => r.answer.length === 0 && r.ev.length === 0 && r.after === r.before && r.allowed.length === 0 && r.threw === ''), j(quiet));

    // the lock is the word true only; the cap is for a new light only
    const lk = [tl({ tok: { lightLock: 'yes' }, msg: { on: false } }), tl({ tok: { lightLock: 1 }, msg: { on: false } }), tl({ tok: { lightLock: false }, msg: { on: false } }), tl({ tok: { lightLock: 'true' }, msg: { on: false } })];
    const capOld = tl({ count: 200, msg: { preset: 0, name: 'Candle' } }), capSw = tl({ count: 1e9, msg: { on: false } }), capUnder = tl({ tok: { light: undefined }, count: 199, msg: { preset: 0, name: 'Candle' } }), capNone = tl({ tok: { light: undefined }, count: 1e9, msg: { preset: 0, name: 'Candle' }, win: w => { delete w.wpFog; } });
    check('a player\'s own light (host): only a light lock that is true locks a light; the map\'s cap of ' + FCx.LIMITS.lights + ' light sources stops a new light only — a token that already carries a light may switch it or take another preset at the cap, and one light under the cap a new light is taken',
        lk.every(r => done(r, torch, torchOff, 'Pat put out the light of their token (Pax)')) && done(capOld, torch, candle, 'Pat lit Candle on their token (Pax)') && capOld.counted.length === 0 && done(capSw, torch, torchOff, 'Pat put out the light of their token (Pax)')
        && done(capUnder, null, candle, 'Pat lit Candle on their token (Pax)') && j(capUnder.counted) === j(['m1']) && FCx.LIMITS.lights === 200
        && j(capNone.answer) === okAns && j(capNone.light) === j(candle) && j(capNone.ev) === j(['flush:null', 'save:true:true:' + j(candle), 'send:k:m1:false', 'render', 'ans', 'toast', 'log']), j([lk, capOld, capSw, capUnder, capNone]));

    // the order of effects, the map sent, the GM's words
    const away = tl({ active: 'm2', msg: { on: false } }), other = tl({ msg: { mapId: 'm2', on: false } }), otherOn = tl({ active: 'm2', msg: { mapId: 'm2', preset: 4, name: 'Sun' } }), lampOff = Object.assign({}, { bright: 2, dim: 4, off: true }, { unit: 'cells', name: 'Lamp' });
    const wasOn = tl({ was: true, msg: { on: false } }), noFlush = tl({ msg: { on: false }, win: w => { delete w.wpHistFlush; } });
    check('a player\'s own light (host): the GM\'s pending edit is flushed to the history before the light is written, the vision is worked out afresh before the map goes out, the save runs as a remote change and the mark is back to what it was before the map is sent; the map sent is the message\'s map whichever map the GM is on, and only the GM\'s own open map is drawn again',
        done(swOff, torch, torchOff, 'Pat put out the light of their token (Pax)') && done(away, torch, torchOff, 'Pat put out the light of their token (Pax)', { away: true }) && done(other, lamp, lampOff, 'Pat put out the light of their token (Pax)', { map: 'm2', away: true }) && j(other.tok.light) === j(torch)
        && done(otherOn, lamp, sun, 'Pat lit Sun on their token (Pax)', { map: 'm2' }) && j(otherOn.tok.light) === j(torch)
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
            new Function('net', 'state', 'sanitizeItem', 'mapFogged', 'broadcast', '_lastSent', 'fogCopyFor', 'sendFailed', ownKeySrc + bfSrc)(netB, { appState: { campaigns: { k: { id: 'k', items: { m1: map } } } } }, it => JSON.parse(JSON.stringify(it)), () => fogged, (m, x) => sent.push(['all', m.type, m.itemId, x]), last, (clean) => Object.assign({ tag: 'mine' }, clean), e => { throw e; });
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
        done(gateless, torch, candle, 'Pat lit Candle on their token (Pax)') && !/wpVtt|campaignOn|\.fog\b|lighting/.test(tlS.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/\/\/[^\n]*/g, '')) && !ownK(JSON.parse(gateless.before), 'fog'), j(gateless));
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
    const patchSrc = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js'), cleanersSrc = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
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
    check('a player\'s own light: a player\'s copy of a map (sanitizeItem, run for real) carries a visible token\'s light lock with its light — their menu reads it, also on a token whose GM prep is stripped — and a client keeps both; a hidden token is not in the copy, so neither is its light or its lock; the host\'s own map is unchanged',
        siA > 0 && outS.whiteboard.length === 3 && outS.whiteboard[0].lightLock === true && j(outS.whiteboard[0].light) === j(torch) && !ownK(outS.whiteboard[1], 'lightLock') && j(outS.whiteboard[1].light) === j(candleOff)
        && outS.whiteboard[2].lightLock === true && !ownK(outS.whiteboard[2], 'gmInfo') && !ownK(outS.whiteboard[2], 'sheet') && j(outS.whiteboard.map(w => w.id)) === j(['w1', 'w2', 'w3'])
        && !/Secret/.test(j(outS)) && (j(outS).match(/lightLock/g) || []).length === 2 && packedS === true && j(mapS) === beforeS
        && gotC[0].lightLock === true && j(gotC[0].light) === j(torch) && j(gotC[1].light) === j(candleOff) && gotC[2].lightLock === true && gotC.length === 3, j(outS.whiteboard));
})());
// Item 20 K2: the campaign's clock on the wire — the host's sync (sliced by its clocksync markers), the join snapshot (the real
// sanitizeAppState), a player's branch (clockmsg) and a combat round moving it (the real combatStep), each run for real
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const CCx = await import(url('calendarcore.js')), ownK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const syncK = between('// [netcheck:clocksync-start]', '// [netcheck:clocksync-end]', 'clocksync'), rcvK = between('// [netcheck:clockmsg-start]', '// [netcheck:clockmsg-end]', 'clockmsg');
    const vttK = { campaignOn: (id, camp) => id === 'calendar' && !!camp && !!camp.vtt && camp.vtt.cal === true };
    const hostK = camp => { const sent = { a: [], w: [] };
        const net = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sent.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sent.w.push(m) }, { peer: 'pC', open: false, send: m => sent.w.push(m) }], roster: { pA: { id: 'u_a' }, pC: { id: 'u_c' } } };
        const clockOut = new Function('net', 'getActiveCampaign', 'own', 'sendFailed', 'window', syncK + '\nreturn clockOut;')(net, () => camp, ownK, e => { throw e; }, { wpCalendarCore: CCx, wpVtt: vttK });
        return { net, sent, clockOut }; };
    const campK = { id: 'k_1', vtt: { cal: true }, clock: { t: 3600.7, hide: false, junk: '<b>' } }, hK = hostK(campK), stepK = [], snapK = () => stepK.push(hK.sent.a.length);
    hK.net.syncClock(); snapK(); hK.net.syncClock(); snapK();
    campK.clock.t = 7200; hK.net.syncClock(); snapK();
    campK.clock.hide = true; hK.net.syncClock(); snapK();
    campK.clock.t = 9000; hK.net.syncClock(); snapK();
    campK.clock.hide = false; hK.net.syncClock(); snapK();
    campK.vtt.cal = false; hK.net.syncClock(); snapK();
    hK.net.role = 'client'; campK.vtt.cal = true; hK.net.syncClock(); snapK(); hK.net.role = 'host'; hK.net.active = false; campK.clock.t = 1; hK.net.syncClock(); snapK();
    check('item 20 K2 the campaign\'s clock on the wire (net.syncClock, sliced by its clocksync markers, run for real): a change goes to admitted open players once (a waiting peer and a closed connection get nothing) as its time alone in whole seconds, never the hide flag or anything else; while the GM keeps the date from players or the Calendar is off the message carries null, once; a client or a host off a table sends nothing; every host save calls it after the fog defaults, the snapshot sets its signature and a new table forgets it; no host branch reads a clock',
        j(stepK) === j([1, 1, 2, 3, 3, 4, 5, 5, 5]) && hK.sent.w.length === 0 && j(hK.sent.a) === j([{ type: 'clock', campId: 'k_1', clock: { t: 3600 } }, { type: 'clock', campId: 'k_1', clock: { t: 7200 } }, { type: 'clock', campId: 'k_1', clock: null }, { type: 'clock', campId: 'k_1', clock: { t: 9000 } }, { type: 'clock', campId: 'k_1', clock: null }])
        && /net\.syncCampFog\(\);[^\n]*\n\s*net\.syncClock\(\);/.test(src) && src.includes("var ckm = net.clockMessage(); if (ckm) net._lastClockSig = ckm.campId + '\\n' + JSON.stringify(ckm.clock) + (ckm.date ? JSON.stringify(ckm.date) : '');") && /net\._lastNewPlayersSig = null;[^\n]*\n\s*net\._lastClockSig = null;/.test(src) && !/msg\.type === 'clock' && net\.role === 'host'/.test(src), j([stepK, hK.sent.a]));
    const outK = [hostK({ id: 'a', vtt: { cal: true } }).clockOut({ id: 'a', vtt: { cal: true } }), hostK({}).clockOut({ id: 'b', vtt: { cal: true }, clock: 'x' }), hostK({}).clockOut({ id: 'c', vtt: { cal: true }, clock: { t: -4 } }), hostK({}).clockOut({ id: 'd', vtt: { cal: true }, clock: { t: 1e20 } }), hostK({}).clockOut({ id: 'e', clock: { t: 5 } }), hostK({}).clockOut(null)];
    check('item 20 K2 what a player may be sent of a clock (clockOut): day 1 when there is none yet, the time cleaned (below 0 is 0, past the limit the limit), nothing with the Calendar off or no campaign',
        j(outK) === j([{ t: 0 }, { t: 0 }, { t: 0 }, { t: 1e15 }, null, null]), j(outK));
    // the join snapshot: the real sanitizeAppState, with and without the clock's rule beside it
    const saSrcK = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem(')) + '\n' + siSrc() + '\n' + fnSrc('function sanitizeAppState(', '\nfunction fogNow()', 'sanitizeAppState', 'netfog.js');
    const clockOutSrc = syncK.slice(syncK.indexOf('function clockOut('), syncK.indexOf('\n', syncK.indexOf('function clockOut(')));
    const SAk = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + clockOutSrc + '\n' + saSrcK + '\nreturn sanitizeAppState;')(H.own, { wpCalendarCore: CCx, wpVtt: vttK }, () => ({}), () => ({}), v => v, it => it, it => it);
    const SA0 = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrcK + '\nreturn sanitizeAppState;')(H.own, { wpCalendarCore: CCx, wpVtt: vttK }, () => ({}), () => ({}), v => v, it => it, it => it);
    const gmK = (clock, cal) => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', vtt: { cal: cal !== false }, clock: clock, activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', whiteboard: [] } } }, k2: { id: 'k2', name: 'Other', vtt: { cal: true }, clock: { t: 99 }, activeItemId: 'm2', items: { m2: { id: 'm2', type: 'map', whiteboard: [] } } } } });
    const snK = [SAk(gmK({ t: 500.5, hide: false, notes: 'x' }), 'u_p'), SAk(gmK({ t: 500, hide: true }), 'u_p'), SAk(gmK({ t: 500 }, false), 'u_p'), SAk(gmK(undefined), 'u_p'), SA0(gmK({ t: 500 }), 'u_p'), SAk(gmK({ t: 500 }))].map(s => s.campaigns.k1 ? (ownK(s.campaigns.k1, 'clock') ? s.campaigns.k1.clock : 'none') : 'no campaign');
    const keptK = gmK({ t: 500, hide: true }); SAk(keptK, 'u_p');
    check('item 20 K2 the join snapshot (the real sanitizeAppState, run for real) carries the hosted campaign\'s clock as its time alone while players may see it; none while the GM keeps the date from players or the Calendar is off, day 1 with no clock yet; without the clock\'s rule beside it none at all (it fails closed); the stream window alike; the GM\'s own state left as it was',
        j(snK) === j([{ t: 500 }, 'none', 'none', { t: 0 }, 'none', { t: 500 }]) && j(keptK.campaigns.k1.clock) === j({ t: 500, hide: true }) && keptK.campaigns.k2.clock.t === 99
        && require('./checkkit').part('netfog.js').includes("var ckS = camp.id === c.activeCampaignId && typeof clockOut === 'function' ? clockOut(camp) : null; if (ckS) { camp.clock = ckS; delete camp.dateFig; } else { delete camp.clock;"), j(snK));
    // a player's app: the host's clock message
    const runK = (msg, peer, o) => { o = o || {}; const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', clock: { t: 42 } }, k_2: { id: 'k_2' } } } }, calls = [];
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', rcvK)(Object.assign({ role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, o.net || {}), { peer }, msg, st, id => (ownK(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpCalendarCore: CCx, wpCalendar: { refresh: () => calls.push('refresh') } });
        return [ownK(st.appState.campaigns.k_1, 'clock') ? st.appState.campaigns.k_1.clock : 'none', calls.length, st.appState.campaigns.k_2]; };
    const rK = [runK({ type: 'clock', campId: 'k_1', clock: { t: 99.9, hide: true, junk: 1 } }, 'host1'), runK({ type: 'clock', campId: 'k_1', clock: null }, 'host1'), runK({ type: 'clock', campId: 'k_1', clock: { t: -3 } }, 'host1'), runK({ type: 'clock', campId: 'k_1', clock: { t: 1e20 } }, 'host1'), runK({ type: 'clock', campId: 'k_1', clock: 'x' }, 'host1')];
    const rNo = [runK({ type: 'clock', campId: 'k_1', clock: { t: 7 } }, 'other'), runK({ type: 'clock', campId: 'k_2', clock: { t: 7 } }, 'host1'), runK({ type: 'clock', campId: '__proto__', clock: { t: 7 } }, 'host1'), runK({ type: 'clock', campId: 5, clock: { t: 7 } }, 'host1'), runK({ type: 'clock', campId: 'k_1', clock: { t: 7 } }, 'host1', { net: { stream: true } }), runK({ type: 'clock', campId: 'k_1', clock: { t: 7 } }, 'host1', { net: { foreign: false } })];
    check('item 20 K2 a player\'s app takes the clock (the clockmsg branch, run for real) from the synced host only, for the campaign on screen only, cleaned again as its time alone (never a hide or anything else; below 0 is 0, past the limit the limit), and redraws the chip; null or a clock that is no object takes it away; another peer, another campaign, a prototype\'s name, the stream window or a player not at the table changes nothing',
        j(rK) === j([[{ t: 99 }, 1, { id: 'k_2' }], ['none', 1, { id: 'k_2' }], [{ t: 0 }, 1, { id: 'k_2' }], [{ t: 1e15 }, 1, { id: 'k_2' }], ['none', 1, { id: 'k_2' }]]) && rNo.every(r => j(r) === j([{ t: 42 }, 0, { id: 'k_2' }])), j([rK, rNo]));
    // 1.5.4, the running clock: the GM's hold and speed are the host's own
    const campRk = { id: 'k_r', vtt: { cal: true }, clock: { t: 600, hold: true, rate: 60 } }, hRk = hostK(campRk); hRk.net.syncClock(); const sentRk = j(hRk.sent.a); delete campRk.clock.hold; campRk.clock.rate = 5; hRk.net.syncClock(); const sentRk2 = hRk.sent.a.length;
    const snRk = SAk(gmK({ t: 500, hold: true, rate: 10 }), 'u_p').campaigns.k1.clock, rRk = runK({ type: 'clock', campId: 'k_1', clock: { t: 77, hold: true, rate: 60 } }, 'host1');
    check('the running clock on the wire (1.5.4): the GM\'s hold and speed are the host\'s own \u2014 the clock message and the join snapshot carry the time alone, and a change of either sends nothing \u2014 and a player\'s app keeps neither from a host that sends them',
        sentRk === j([{ type: 'clock', campId: 'k_r', clock: { t: 600 } }]) && sentRk2 === 1 && j(snRk) === j({ t: 500 }) && j(rRk[0]) === j({ t: 77 }), j([sentRk, sentRk2, snRk, rRk]));
    // 152 fold 4b: the Rules run switch on each NPC (camp.clock.rulesOff) is the GM's own: set by calendar.js's real setRulesRun, saved, and in no message
    // a player is sent: a save's sync, the clock message, the join snapshot and the stream window carry the time and the notes players may see alone
    {
        const SxR = await import(url('systemcore.js'));
        const calR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'calendar.js'), 'utf8').replace(/\r\n/g, '\n'), cutR = (a, b) => { const i = calR.indexOf(a), k = calR.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('netcheck: calendar.js slice ' + a); return calR.slice(i, k); };
        const notesR = [{ id: 'n_bbbbbbbb', day: 0, text: 'Market day', vis: 'all' }, { id: 'n_cccccccc', day: 1, text: 'Unit 7 wakes', vis: 'gm' }];
        const campR = { id: 'k_1', vtt: { cal: true }, clock: { t: 600, notes: notesR }, chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a' }, c_unit7: { id: 'c_unit7', name: 'Unit 7', npc: true } } }, sysR = { rolls: [{ id: 'r_tick', label: 'Tick', apply: [], every: { n: 1, u: 'hour' } }] };
        const hR = hostK(campR), outR = { saves: 0, toasts: [], log: [] }; hR.net.logEvent = (k, t) => outR.log.push([k, t]);
        let calApi = null, rerr = '';
        try {
            calApi = new Function('document', 'window', 'getActiveCampaign', 'save', 'saveView', 'toast', 'roundSecs', 'cleanCalendar', 'cleanClock', 'cleanAcc', 'ruleFires', 'livedSpans', 'freshAcc', 'tCmp', 'tSpanMs', 'dateOf', 'timeOf', 'periodDays', 'dayLength', 'fmtDate', 'fmtWhen', 'fmtSpan', 'CAL_LIMITS', 'net', 'sysNow',
                "'use strict';\n" + cutR('// [sinkcheck:calendarwin-start]', '// [sinkcheck:calendarwin-end]') + cutR('function openWin()', '(function wire()') + '\nreturn { setRulesRun: setRulesRun, rulesRun: rulesRun };')(
                { getElementById: () => null }, { wpVtt: { on: () => true, campaignOn: vttK.campaignOn } }, () => campR, () => { outR.saves++; hR.net.syncClock(); }, () => {}, t => outR.toasts.push(t), SxR.roundSecs, CCx.cleanCalendar, CCx.cleanClock, CCx.cleanAcc, CCx.ruleFires, CCx.livedSpans, CCx.freshAcc, CCx.tCmp, CCx.tSpanMs, CCx.dateOf, CCx.timeOf, CCx.periodDays, CCx.dayLength, CCx.fmtDate, CCx.fmtWhen, CCx.fmtSpan, CCx.CAL_LIMITS, () => hR.net, () => sysR);
        } catch (e) { rerr = String(e && e.stack || e); }
        hR.net.syncClock(); const beforeR = j(hR.sent.a);   // the table told of the clock as it stands
        let offR = null, keptR = null, afterOffR = null, msgR = null, snapR = null, streamR = null, onR = null, goneR = null;
        try {
            offR = calApi.setRulesRun('c_unit7', false); keptR = j(campR.clock.rulesOff || null); afterOffR = j(hR.sent.a); msgR = j(hR.net.clockMessage());
            snapR = j(SAk(gmK(JSON.parse(j(campR.clock))), 'u_a').campaigns.k1.clock); streamR = j(SAk(gmK(JSON.parse(j(campR.clock)))).campaigns.k1.clock);
            onR = calApi.setRulesRun('c_unit7', true); goneR = 'rulesOff' in campR.clock;
        } catch (e) { rerr = rerr || String(e && e.stack || e); }
        const SEEN = { t: 600, notes: [{ id: 'n_bbbbbbbb', day: 0, text: 'Market day' }] };
        check('152 fold 4b the Rules run switch on each NPC is the GM\'s own (calendar.js setRulesRun, net.syncClock, clockOut and the join snapshot\'s sanitizeAppState, each run for real): switched off it is saved in camp.clock.rulesOff and the save tells the table nothing new; the clock message carries the time and the notes players may see and no NPC\'s switch, and so do the join snapshot and the stream window; switched on again it leaves no key and sends nothing',
            !rerr && offR === true && keptR === j(['c_unit7']) && outR.saves === 2 && beforeR === j([{ type: 'clock', campId: 'k_1', clock: SEEN }]) && afterOffR === beforeR && j(hR.sent.a) === beforeR
            && msgR === j({ type: 'clock', campId: 'k_1', clock: SEEN }) && snapR === j(SEEN) && streamR === j(SEEN) && !/rulesOff|c_unit7/.test(beforeR + msgR + snapR + streamR + j(hR.sent.w)) && onR === true && goneR === false,
            rerr || j([offR, keptR, beforeR, afterOffR, msgR, snapR, streamR, onR, goneR]));
    }
    // a round of a fight: the real combatStep, over stubs, with the calendar watched. 152 fold 4 (moved on purpose): a round no longer tells the clock its
    // rounds; each fight keeps its own time (at), and the coordinator hands the clock the floor of the least time of the fights (calendar.js second)
    const SxK = await import(url('systemcore.js')), csK = fnSrc('net.combatStep = function', '// [netcheck:turnhold-start]', 'combatStep', 'netfight.js');
    const mkK = (turn, nRows, withCal) => { const calls = [], camp = { id: 'k', clock: { t: 7200 }, system: { combat: { turn: { secs: 1 } } }, items: {}, chars: {} }, net = { role: 'host', combats: { m1: { mapId: 'm1', round: 1, turn: turn, rows: Array.from({ length: nRows }, (_, i) => ({ id: 'r' + i, name: 'R' + i, tokId: null, init: 0, src: null })) } } };
        const win = withCal ? { wpCalendarCore: CCx, wpCalendar: { ownTime: g => { calls.push(['own', g.length]); return false; }, second: (s, back, last) => calls.push([s, back, last]) } } : {};
        const names = ['net', 'own', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', 'window', 'getActiveCampaign', 'SC'], args = [net, H.own, () => {}, () => {}, () => 'Hall', () => {}, () => {}, () => {}, () => {}, win, () => camp, () => SxK];
        new Function(...names, "'use strict';\n" + csK + '\n' + ordersSrc).apply(null, args); return { net, calls }; };
    const K1 = mkK(1, 2, true); [1, 1, -1, -1, -1, -1].forEach(d => K1.net.combatStep('m1', d));
    const K2 = mkK(0, 1, true); [1, 1, 1, -1].forEach(d => K2.net.combatStep('m1', d));
    const K3 = mkK(1, 2, false); let k3ok = true; try { K3.net.combatStep('m1', 1); } catch (e) { k3ok = false; }
    const K4 = mkK(1, 2, true); K4.net.role = 'client'; K4.net.combatStep('m1', 1);
    check('item 20 K2 a round of a fight moves the clock (the real combatStep, run for real; 152 fold 4, moved on purpose): each new round adds the round\'s length to the fight\'s own time and the clock is handed the floor of the least time of the fights, a step back past a round\'s first turn takes it back as a correction; a step within a round or back at the very first turn hands it nothing; without the calendar at hand the fight steps as before; a player\'s app steps nothing; the clock\'s old hooks are gone',
        j(K1.calls) === j([[7201, false, false], [7200, true, false]]) && j(K1.net.combats.m1.at) === j({ s: 7200, ms: 0 }) && j(K2.calls) === j([[7201, false, false], [7202, false, false], [7203, false, false], [7202, true, false]]) && j(K2.net.combats.m1.at) === j({ s: 7202, ms: 0 })
        && k3ok && K3.net.combats.m1.round === 2 && !('at' in K3.net.combats.m1) && j(K4.calls) === j([])
        && !/clockRounds|clockFightEnd/.test(src), j([K1.calls, K2.calls, K4.calls]));
    check('item 20 K2 the Game Record reads the clock\'s lines as Background', /time: 'bg'/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'reccore.js'), 'utf8')));
})());
// Item 20 K3: a clock's dated notes on the wire — only those players may see, as text; a player's app keeps them as text again
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const CCx = await import(url('calendarcore.js')), ownK = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const syncN = between('// [netcheck:clocksync-start]', '// [netcheck:clocksync-end]', 'clocksync'), rcvN = between('// [netcheck:clockmsg-start]', '// [netcheck:clockmsg-end]', 'clockmsg');
    const vttN = { campaignOn: (id, camp) => id === 'calendar' && !!camp && !!camp.vtt && camp.vtt.cal === true };
    const campN = { id: 'k_1', vtt: { cal: true }, clock: { t: 60, notes: [{ id: 'n_aaaaaaaa', day: 3, text: 'Secret plan', vis: 'gm' }, { id: 'n_bbbbbbbb', day: 2, text: 'Market day', vis: 'all' }, { id: 'n_cccccccc', day: 9, text: 'Festival', vis: 'all', extra: '<b>' }, { id: 'n_dddddddd', day: 4, text: 'GM only' }] } }, sentN = [];
    const netN = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentN.push(JSON.parse(JSON.stringify(m))); } }], roster: { pA: { id: 'u_a' } } };
    const clockOutN = new Function('net', 'getActiveCampaign', 'own', 'sendFailed', 'window', syncN + '\nreturn clockOut;')(netN, () => campN, ownK, e => { throw e; }, { wpCalendarCore: CCx, wpVtt: vttN });
    netN.syncClock(); const n1 = sentN.slice(); campN.clock.notes[0].text = 'Secret plan changed'; netN.syncClock(); const n2 = sentN.length; campN.clock.notes[3].vis = 'all'; netN.syncClock(); const n3 = sentN.slice(-1)[0];
    campN.clock.hide = true; const hid = clockOutN(campN);
    check('item 20 K3 a clock\'s notes on the wire (net.syncClock and clockOut, run for real): only the notes players may see, as their id, day and text in day order, never a GM-only one, never its vis or anything else; a change to a GM-only note sends nothing, one shown to players sends the notes again; nothing at all while the date is kept from players',
        j(n1) === j([{ type: 'clock', campId: 'k_1', clock: { t: 60, notes: [{ id: 'n_bbbbbbbb', day: 2, text: 'Market day' }, { id: 'n_cccccccc', day: 9, text: 'Festival' }] } }]) && n2 === 1 && !/Secret|GM only/.test(j(n1))
        && j(n3.clock.notes.map(n => n.id)) === j(['n_bbbbbbbb', 'n_dddddddd', 'n_cccccccc']) && !('vis' in n3.clock.notes[0]) && hid === null, j([n1, n3]));
    const runN = msg => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', clock: { t: 1 } } } } };
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', rcvN)({ role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, { peer: 'host1' }, msg, st, id => (ownK(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpCalendarCore: CCx, wpCalendar: { refresh: () => {} } });
        return st.appState.campaigns.k_1.clock; };
    const rN = runN({ type: 'clock', campId: 'k_1', clock: { t: 90, notes: [{ id: 'n_bbbbbbbb', day: 2, text: 'Market\u0000 day', vis: 'gm', x: 1 }, { id: 'bad', day: 1, text: 'x' }, { id: 'n_cccccccc', day: 'x', text: 'y' }, { id: 'n_dddddddd', day: 1, text: '<img src=x onerror=alert(1)>', vis: 'all' }] } });
    const rN2 = runN({ type: 'clock', campId: 'k_1', clock: { t: 90, notes: 'x' } });
    check('item 20 K3 a player\'s app keeps the notes a host sends (the clockmsg branch, run for real) as cleaned text in day order — an id of the pattern, a whole day, its text one line — never a vis or anything else; notes that are no list are none',
        j(rN) === j({ t: 90, notes: [{ id: 'n_dddddddd', day: 1, text: '<img src=x onerror=alert(1)>' }, { id: 'n_bbbbbbbb', day: 2, text: 'Market day' }] }) && j(rN2) === j({ t: 90 }), j([rN, rN2]));
    const campE = { id: 'k_1', vtt: { cal: true }, clock: { t: 60, cal: 1, notes: [{ id: 'n_eeeeeeee', day: 5, text: 'Fair', vis: 'all', yearly: true }], eras: [{ id: 'e_aaaaaaaa', name: 'Secret age', from: 1, color: '#112233' }, { id: 'e_bbbbbbbb', name: 'Age of Ash', from: 2, to: 9, color: '#AABBCC', vis: 'all' }] } };
    const oE = clockOutN(campE), rE = runN({ type: 'clock', campId: 'k_1', clock: Object.assign({}, oE, { eras: oE.eras.concat([{ id: 'e_cccccccc', name: 'Hostile', from: 1, color: 'url(x)', vis: 'all', x: 1 }]) }) });
    check('166 b a yearly note and the eras players may see on the wire (clockOut and the clockmsg branch, run for real): the note keeps yearly; only an era shown to players is sent, as its id, name, years and color, never its vis; a player\'s app keeps them cleaned again (a color that is no #rrggbb the gold, no vis, nothing else) and the calendar the top row shows',
        j(oE) === j({ t: 60, notes: [{ id: 'n_eeeeeeee', day: 5, text: 'Fair', yearly: true }], eras: [{ id: 'e_bbbbbbbb', name: 'Age of Ash', from: 2, to: 9, color: '#aabbcc' }], cal: 1 }) && !/Secret/.test(j(oE))
        && j(rE) === j({ t: 60, notes: [{ id: 'n_eeeeeeee', day: 5, text: 'Fair', yearly: true }], eras: [{ id: 'e_bbbbbbbb', name: 'Age of Ash', from: 2, to: 9, color: '#aabbcc' }, { id: 'e_cccccccc', name: 'Hostile', from: 1, color: '#c9a227' }], cal: 1 }), j([oE, rE]));
})());
// Item 21 V2: a video shown live to the table — the link is agreed over the table's own data connection (an offer, an answer, candidates as
// messages); the host's slices and the player's run for real on a stubbed RTCPeerConnection, the real RateLimit and the real videocore
pendingChecks.push((async () => {
    const urlV = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const VCv = await import(urlV('videocore.js')), DCv = await import(urlV('dicecore.js'));
    const candS = between('// [netcheck:videocand-start]', '// [netcheck:videocand-end]', 'videocand'), hostS = between('// [netcheck:videohost-start]', '// [netcheck:videohost-end]', 'videohost');
    const cliS = between('// [netcheck:videoclient-start]', '// [netcheck:videoclient-end]', 'videoclient'), msgS = between('// [netcheck:videomsg-start]', '// [netcheck:videomsg-end]', 'videomsg'), upS = between('// [netcheck:videoup-start]', '// [netcheck:videoup-end]', 'videoup');
    const tick = () => new Promise(r => setTimeout(r, 0));
    const HEX16 = /^[0-9a-f]{16}$/;
    const OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendonly\r\n';
    const ANSWER = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=recvonly\r\n';
    const CAND = { candidate: 'candidate:842163049 1 udp 1677729535 203.0.113.7 51234 typ srflx raddr 0.0.0.0 rport 0', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'x', evil: '<b>' };
    const STOP = '[{"type":"video","act":"stop"}]';
    // a peer connection that records what is done to it (its statistics only where a world gives some)
    const mkRtc = world => function PC(cfg) {
        const pc = this; pc.cfg = cfg; pc.trans = []; pc.cands = []; pc.closed = false; pc.connectionState = 'new'; pc.localDescription = null; pc.remote = null; pc.setP = [];
        pc.addTransceiver = (t, o) => { pc.trans.push(t.kind + ':' + o.direction + ':' + (o.streams && o.streams.length)); };
        pc.createOffer = () => Promise.resolve({ type: 'offer', sdp: OFFER });
        pc.createAnswer = () => Promise.resolve({ type: 'answer', sdp: ANSWER });
        pc.setLocalDescription = d => { pc.localDescription = d; return Promise.resolve(); };
        pc.setRemoteDescription = d => { if (world.failRemote) return Promise.reject(new Error('no')); pc.remote = d; return Promise.resolve(); };
        pc.addIceCandidate = c => { pc.cands.push(c); return Promise.resolve(); };
        pc.getSenders = () => [{ track: { kind: 'audio' } }, { track: { kind: 'video' }, getParameters: () => ({ encodings: [{ active: true }] }), setParameters: p => { pc.setP.push(JSON.parse(JSON.stringify(p.encodings[0]))); return Promise.resolve(); } }];
        if (world.stats) pc.getStats = () => (world.stats === 'fail' ? Promise.reject(new Error('no')) : Promise.resolve(new Map(world.stats.map(r => [r.id, r]))));
        pc.close = () => { pc.closed = true; pc.connectionState = 'closed'; };
        pc.state = s => { pc.connectionState = s; if (pc.onconnectionstatechange) pc.onconnectionstatechange(); };
        world.pcs.push(pc);
    };
    const mkTimers = () => { const list = []; return { list, set: (fn, ms) => { const t = { fn, ms, on: true }; list.push(t); return t; }, clear: t => { if (t) t.on = false; }, fire: ms => list.filter(t => t.on && t.ms === ms).forEach(t => { t.on = false; t.fn(); }) }; };
    const mkStream = tracks => ({ tracks, getTracks() { return this.tracks; }, getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); } });
    const liveStream = () => mkStream([{ kind: 'audio', readyState: 'live' }, { kind: 'video', readyState: 'live' }, { kind: 'video', readyState: 'ended' }]);
    const sj = o => j(Object.keys(o).sort().map(k => [k, o[k]]));   // a map's entries in key order
    const packs = list => { try { list.forEach(packCheck); return true; } catch (e) { return false; } };

    /* ---- the candidate and the description as they may travel ---- */
    const cand = new Function(candS + '\nreturn { videoCand, videoSdp, VIDEO_ID };')();
    const badCands = [null, 'x', [], {}, { candidate: 5, sdpMid: '0' }, { candidate: '', sdpMid: '0' }, { candidate: 'a=candidate:1', sdpMid: '0' }, { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host\r\na=evil', sdpMid: '0' }, { candidate: 'candidate:' + 'x'.repeat(600), sdpMid: '0' }, { candidate: CAND.candidate }, { candidate: CAND.candidate, sdpMid: 'a b' }, { candidate: CAND.candidate, sdpMid: 5, sdpMLineIndex: -1 }, { candidate: CAND.candidate, sdpMLineIndex: 9 }, { candidate: CAND.candidate, sdpMLineIndex: 1.5 }, { candidate: CAND.candidate, sdpMLineIndex: '0' }];
    check('item 21 V2 a candidate as it travels (videoCand, run for real): its line (one line, up to 600 characters, starting candidate:) and the media line it belongs to (a short id, or a place 0 to 8), nothing else riding along; anything else is none; a description is a text of at most 20,000 characters that starts as one does; a link id is 16 of 0-9 and a-f',
        j(cand.videoCand(CAND)) === j({ candidate: CAND.candidate, sdpMid: '0', sdpMLineIndex: 0 }) && j(cand.videoCand({ candidate: CAND.candidate, sdpMLineIndex: 1 })) === j({ candidate: CAND.candidate, sdpMLineIndex: 1 }) && badCands.every(c => cand.videoCand(c) === null)
        && cand.videoCand({ candidate: 'candidate:' + 'x'.repeat(590), sdpMid: '0' }) !== null
        && cand.videoSdp(OFFER) === OFFER && [null, 5, {}, '', ' v=0', 'x', 'v=0' + 'x'.repeat(20000)].every(s => cand.videoSdp(s) === null) && cand.videoSdp('v=0' + 'x'.repeat(19997)) !== null
        && cand.VIDEO_ID.test('0123456789abcdef') && !['0123456789abcde', '0123456789abcdef0', '0123456789ABCDEF', '__proto__', ''].some(s => cand.VIDEO_ID.test(s)), j(badCands.map(cand.videoCand)));

    /* ---- the host ---- */
    const mkHost = o => {
        o = o || {};
        const world = { pcs: [], told: 0, log: [], failed: [], clock: 1000, relay: !!o.relay, stats: o.stats }, tm = mkTimers();
        const conns = [mkConn('pA'), mkConn('pA2'), mkConn('pB'), mkConn('pWait'), mkConn('constructor'), mkConn('pShut', false), mkConn('pC')];
        const net = { active: o.active !== false, role: o.role || 'host', conns, roster: { pA: { id: 'u_a', name: 'Ann' }, pA2: { id: 'u_a', name: 'Ann' }, pB: { id: 'u_b', name: 'Bo\u0000b' }, pShut: { id: 'u_s', name: 'Shut' }, pC: { id: 'u_c', name: 'Cy' } } };
        const win = { wpVideoCore: o.noCore ? undefined : VCv, wpDiceCore: o.noLimit ? {} : DCv, wpVideo: { audienceChanged: () => { world.told++; } } };
        const api = new Function('net', 'own', 'window', 'validProfileId', 'cleanRosterName', 'logEvent', 'sendFailed', 'peerOpts', 'newKey', 'relayActive', 'RTCPeerConnection', 'setTimeout', 'clearTimeout', 'Date',
            candS + hostS + '\nreturn { videoLink: videoLink, videoHang: videoHang, videoUp: videoUp, vid: function() { return _vid; } };')(
            net, H.own, win, H.validProfileId, H.cleanRosterName, (k, t) => world.log.push([k, t]), e => world.failed.push(e.message), () => ({ config: { iceServers: [{ urls: 'stun:x' }] } }), H.newKey, () => world.relay, o.noRtc ? undefined : mkRtc(world), tm.set, tm.clear, { now: () => world.clock });
        const conn = p => conns.find(c => c.peer === p), vids = p => conn(p).sent.filter(m => m.type === 'video');
        return { net, world, tm, api, conn, vids, got: () => conns.filter(c => c.sent.some(m => m.type === 'video')).map(c => c.peer).join() };
    };
    const A = mkHost(), whoA = A.net.videoShow(liveStream(), 'The\u0007 reveal <b>', null, 1920, 1080); await tick(); await tick();
    const vA = A.api.vid(), offB = A.vids('pB')[0], offA2 = A.vids('pA2')[0];
    vA.links.pB.pc.onicecandidate({ candidate: CAND }); vA.links.pB.pc.onicecandidate({ candidate: null }); vA.links.pB.pc.onicecandidate({ candidate: { candidate: 'evil', sdpMid: '0' } }); vA.links.pB.pc.onicecandidate(null);
    const hostIce = j(A.vids('pB').slice(1));
    check('item 21 V2 a showing to everyone (net.videoShow, run for real): one link a player, on their newest connection (an older connection\'s link is closed), to every admitted, open connection\'s player — never a peer waiting for the Allow, a prototype-key peer or a closed connection; each link a connection of its own from the table\'s own ICE settings, sending only (the live tracks, never an ended one), its offer a message on that player\'s connection: the link\'s id, the name cleaned, the description',
        !!whoA && A.got() === 'pA2,pB,pC' && Object.keys(vA.links).sort().join() === 'pA2,pB,pC' && sj(vA.of) === j([['u_a', 'pA2'], ['u_b', 'pB'], ['u_c', 'pC']]) && A.world.pcs.length === 4 && A.world.pcs[0].closed === true && A.world.pcs.slice(1).every(p => !p.closed)
        && A.world.pcs.every(p => j(p.cfg) === j({ iceServers: [{ urls: 'stun:x' }] }) && j(p.trans) === j(['audio:sendonly:1', 'video:sendonly:1']))
        && j(Object.keys(offB).sort()) === j(['act', 'id', 'name', 'sdp', 'type']) && offB.act === 'offer' && HEX16.test(offB.id) && offB.id !== offA2.id && offB.name === 'The reveal <b>' && offB.sdp === OFFER && A.vids('pB').length === 2
        && j(whoA) === j({ live: true, all: true, names: [], waiting: ['Ann', 'Bob', 'Cy'] }) && j(A.world.log) === j([['table', 'Video "The reveal <b>" shown to everyone']]) && packs(A.conn('pB').sent)
        && hostIce === j([{ act: 'ice', cand: { candidate: CAND.candidate, sdpMid: '0', sdpMLineIndex: 0 }, type: 'video', id: offB.id }]),   // the host's own candidates: cleaned, with the link's id, none for no candidate
        j([A.got(), Object.keys(vA.links), A.world.pcs.map(p => p.closed), offB, whoA, A.world.log]));
    // who is watching: a link up; the cap; each change told; a failure at once; the watchdog for a link never agreed
    const pcB = vA.links.pB.pc, pcC = vA.links.pC.pc, told0 = A.world.told, tmB = vA.links.pB.timer;
    pcB.state('connecting'); pcB.state('connected'); pcB.state('connected');
    const up1 = A.net.videoAudience(), told1 = A.world.told - told0, capB = j(pcB.setP), watchB = [!!tmB && tmB.on === false, vA.links.pB.timer];
    pcB.state('disconnected'); const up2 = A.net.videoAudience(), toldDown = A.world.told - told0; pcB.state('connected'); const toldUp2 = A.world.told - told0;
    pcC.state('failed'); const up3 = A.net.videoAudience(), failedNow = j([pcC.closed, H.own(A.api.vid().links, 'pC'), H.own(A.api.vid().of, 'u_c'), A.world.told - told0]);
    A.tm.fire(20000); const up4 = A.net.videoAudience(), linksAfter = Object.keys(A.api.vid().links).join(), toldIdle = A.world.told - told0;
    check('item 21 V2 who a showing reaches (net.videoAudience): a player is named as watching only while a link of theirs is up, the rest of the connected audience as waiting, one name a profile, cleaned; the panel is told each time a link comes up, drops, comes back, fails or is given up; a link that fails is closed and forgotten at once (before any watchdog), one never agreed after 20 s, and one that came up is done with its watchdog',
        j(up1) === j({ live: true, all: true, names: ['Bob'], waiting: ['Ann', 'Cy'] }) && told1 === 1 && j(watchB) === j([true, null]) && j(up2.names) === '[]' && toldDown === 2 && toldUp2 === 3 && j(up3) === j({ live: true, all: true, names: ['Bob'], waiting: ['Ann', 'Cy'] }) && failedNow === j([true, false, false, 4])
        && linksAfter === 'pB' && A.world.pcs[1].closed === true && toldIdle === 5 && pcB.closed === false && j(up4) === j({ live: true, all: true, names: ['Bob'], waiting: ['Ann', 'Cy'] }), j([up1, told1, watchB, up2, toldDown, toldUp2, up3, failedNow, up4, linksAfter, toldIdle]));
    const Wd = mkHost(); Wd.net.videoShow(liveStream(), 'x', ['u_b'], 1, 1); await tick();
    const pcWd = Wd.api.vid().links.pB.pc; pcWd.state('connected'); pcWd.state('disconnected'); Wd.tm.fire(20000); const blip = [pcWd.closed, H.own(Wd.api.vid().links, 'pB'), j(Wd.net.videoAudience().waiting)]; pcWd.state('connected');
    check('item 21 V2 a link that came up and is only interrupted when the 20 s pass is not closed by the watchdog: it comes back by itself', j(blip) === j([false, true, '["Bob"]']) && j(Wd.net.videoAudience().names) === j(['Bob']), j(blip));
    const R1 = mkHost({ relay: true }); R1.net.videoShow(liveStream(), 'x', ['u_b'], 3840, 2160); await tick(); R1.api.vid().links.pB.pc.state('connected');
    const N1 = mkHost(); N1.net.videoShow(liveStream(), 'x', ['u_b'], 'wide', NaN); await tick(); N1.api.vid().links.pB.pc.state('connected');
    check('item 21 V2 what each viewer is sent at most, set when their link comes up (videocore\'s sendCap on the picture sender): the long side down to 1280, 30 frames, 2.5 Mbit/s; 1 Mbit/s on a relay-only table; a size that is no number scales nothing',
        capB === j([{ active: true, maxBitrate: 2500000, maxFramerate: 30, scaleResolutionDownBy: 1.5 }]) && j(R1.api.vid().links.pB.pc.setP) === j([{ active: true, maxBitrate: 1000000, maxFramerate: 30, scaleResolutionDownBy: 3 }])
        && j(N1.api.vid().links.pB.pc.setP) === j([{ active: true, maxBitrate: 2500000, maxFramerate: 30, scaleResolutionDownBy: 1 }]) && N1.api.vid().w === 0 && N1.api.vid().h === 0, j([capB, R1.api.vid().links.pB.pc.setP, N1.api.vid().links.pB.pc.setP]));
    // a link that found its way only through the relay (the connection's own statistics)
    const capOf = async stats => { const s = mkHost({ stats }); s.net.videoShow(liveStream(), 'x', ['u_b'], 1920, 1080); await tick(); s.api.vid().links.pB.pc.state('connected'); await tick(); await tick(); return s.api.vid().links.pB.pc.setP.map(e => e.maxBitrate).join(); };
    const pair = (extra, cand2) => [Object.assign({ id: 'P1', type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'L1' }, extra), Object.assign({ id: 'L1', type: 'local-candidate', candidateType: 'relay' }, cand2)];
    const capRelay = await capOf(pair()), capHost = await capOf(pair({}, { candidateType: 'host' })), capUnnom = await capOf(pair({ nominated: false })), capUnsucc = await capOf(pair({ state: 'in-progress' })), capFail = await capOf('fail');
    const capOther = await capOf(pair({ localCandidateId: 'L2' }).concat([{ id: 'L2', type: 'local-candidate', candidateType: 'srflx' }]));
    check('item 21 V2 on a table that is not relay-only, a viewer whose link found its way only through the relay is lowered to 1 Mbit/s once that shows (the nominated, succeeded pair\'s own local candidate a relay); a direct link, a pair not chosen, a relay candidate the link does not use, or statistics that cannot be read leave the cap as it is',
        capRelay === '2500000,1000000' && capHost === '2500000' && capUnnom === '2500000' && capUnsucc === '2500000' && capFail === '2500000' && capOther === '2500000', j([capRelay, capHost, capUnnom, capUnsucc, capFail, capOther]));
    // a showing whose picture has ended links nobody
    const E1 = mkHost(), sE = liveStream(); E1.net.videoShow(sE, 'x', null, 1, 1); await tick();
    const nE = E1.world.pcs.length, pcE = E1.api.vid().links.pB.pc; sE.tracks[1].readyState = 'ended';
    const endE = [E1.api.videoLink(E1.conn('pB')), (E1.api.videoUp({ type: 'video-up', act: 'ask' }, E1.conn('pB')), E1.world.pcs.length - nE), pcE.closed];
    check('item 21 V2 a showing whose picture has ended links nobody, by an admit or by an ask, and leaves the link already held alone', j(endE) === j([false, 0, false]), j(endE));
    // chosen players; what is no showing
    const C1 = mkHost(), whoC = C1.net.videoShow(liveStream(), 'Secret', ['u_b', 'u_b', 'bad id!', 5, '__proto__'], 640, 360); await tick();
    const keepC = C1.api.vid(), none = [C1.net.videoShow(liveStream(), 'x', [], 1, 1), C1.net.videoShow(liveStream(), 'x', ['bad id!'], 1, 1), C1.net.videoShow(liveStream(), 'x', 'u_b', 1, 1), C1.net.videoShow(mkStream([{ kind: 'audio', readyState: 'live' }]), 'x', null, 1, 1), C1.net.videoShow(mkStream([{ kind: 'video', readyState: 'ended' }]), 'x', null, 1, 1), C1.net.videoShow(null, 'x', null, 1, 1), C1.net.videoShow({}, 'x', null, 1, 1)];
    const nots = [{ role: 'client' }, { active: false }, { noCore: true }].map(o => { const s = mkHost(o); return [s.net.videoShow(liveStream(), 'x', null, 1, 1), s.got(), s.world.pcs.length]; });
    const noRtc = mkHost({ noRtc: true }), whoN = noRtc.net.videoShow(liveStream(), 'x', null, 1, 1);
    const C64 = mkHost(); C64.net.videoShow(liveStream(), 'x', Array.from({ length: 70 }, (_, i) => 'u_n' + i), 1, 1);
    check('item 21 V2 a showing to chosen players reaches only them (a profile id once, cleaned, 64 at most); an audience of nobody, one that is no list, a stream with no live picture, a player\'s machine, no table or no core shows nothing and leaves a showing under way as it is; a machine with no peer connections shows to nobody',
        j(whoC) === j({ live: true, all: false, names: [], waiting: ['Bob'] }) && j(keepC.to) === j(['u_b']) && C1.got() === 'pB' && none.every(x => x === null) && C1.api.vid() === keepC && C1.world.pcs.length === 1 && C64.api.vid().to.length === 64 && C64.api.vid().to[63] === 'u_n63'
        && j(C1.world.log) === j([['table', 'Video "Secret" shown to Bob']]) && j(nots) === j([[null, '', 0], [null, '', 0], [null, '', 0]]) && j(whoN) === j({ live: true, all: true, names: [], waiting: ['Ann', 'Bob', 'Cy'] }) && noRtc.got() === '' && noRtc.world.pcs.length === 0, j([whoC, none, nots, whoN, C64.api.vid().to.length]));
    // a latecomer, a closed connection, a kick's hang
    const L = mkHost(); L.net.videoShow(liveStream(), 'x', ['u_a', 'u_d'], 1, 1); await tick();
    const lateIn = (() => { const c = mkConn('pD'); L.net.conns.push(c); L.net.roster.pD = { id: 'u_d', name: 'Dee' }; return [L.api.videoLink(c), c]; })(); await tick();
    const lateOut = L.api.videoLink(L.conn('pB')), lateWait = L.api.videoLink(L.conn('pWait')), lateShut = L.api.videoLink(L.conn('pShut'));
    const pcA2 = L.api.vid().links.pA2.pc; L.api.videoLink(L.conn('pA')); await tick();   // the older connection of Ann takes the link (its ask)
    const moved = [pcA2.closed, sj(L.api.vid().of), Object.keys(L.api.vid().links).sort().join()];
    L.api.videoHang('pA2'); const stillA = sj(L.api.vid().of);   // hanging a key that no longer holds the link leaves the player's link alone
    const tmA = L.api.vid().links.pA.timer; L.api.videoHang('pA'); const goneA = [sj(L.api.vid().of), Object.keys(L.api.vid().links).join(), L.api.vid().links.pA === undefined, tmA.on];
    check('item 21 V2 a latecomer of the audience is linked when admitted, and nobody else (not the audience\'s, waiting, closed); a player\'s link moves to the connection that asks (the other\'s is closed), and closing a connection takes only the link it holds, its watchdog with it',
        lateIn[0] === true && lateIn[1].sent.length === 1 && lateIn[1].sent[0].act === 'offer' && lateOut === false && lateWait === false && lateShut === false && L.vids('pB').length === 0
        && j(moved) === j([true, '[["u_a","pA"],["u_d","pD"]]', 'pA,pD']) && stillA === '[["u_a","pA"],["u_d","pD"]]' && j(goneA) === j(['[["u_d","pD"]]', 'pD', true, false]), j([lateIn[0], lateOut, moved, stillA, goneA]));
    // stop
    const S = mkHost(); S.net.videoShow(liveStream(), 'x', ['u_a', 'u_c'], 1, 1); await tick(); S.net.conns.forEach(c => { c.sent.length = 0; });
    const pcsS = S.world.pcs.slice(), stop1 = S.net.videoStop(), stop2 = S.net.videoStop();
    const S2 = mkHost(); S2.net.videoShow(liveStream(), 'x', null, 1, 1); await tick(); S2.net.conns.forEach(c => { c.sent.length = 0; }); S2.net.videoStop();
    const stopAll = S2.net.conns.filter(c => c.sent.length).map(c => c.peer + ':' + j(c.sent)).join(' ');
    check('item 21 V2 a stop (net.videoStop): every link closed, the showing gone, and the stop\'s one word to every admitted, open connection of the audience (a player\'s older connection too, one whose link failed too) and to nobody else; a second stop does nothing; a player\'s machine sends none',
        stop1 === true && stop2 === false && S.api.vid() === null && pcsS.every(p => p.closed) && j(S.net.conns.map(c => c.peer + ':' + j(c.sent))) === j(['pA:' + STOP, 'pA2:' + STOP, 'pB:[]', 'pWait:[]', 'constructor:[]', 'pShut:[]', 'pC:' + STOP])
        && j(S.net.videoAudience()) === j({ live: false, all: true, names: [], waiting: [] }) && S.tm.list.every(t => !t.on)
        && stopAll === ['pA', 'pA2', 'pB', 'pC'].map(p => p + ':' + STOP).join(' '), j([stop1, stop2, S.net.conns.map(c => c.sent.length), stopAll]));   // a showing to everyone: every admitted, open connection, never a waiting, prototype-key or closed one
    // a player's word: video-up
    const U = mkHost(); U.net.videoShow(liveStream(), 'x', ['u_a', 'u_b'], 1, 1); await tick();
    const lnB = U.api.vid().links.pB, idB = lnB.id, pcUB = lnB.pc, lnA2 = U.api.vid().links.pA2, idA2 = lnA2.id, pcUA2 = lnA2.pc, up = (p, m) => { U.api.videoUp(Object.assign({ type: 'video-up' }, m), U.conn(p)); };
    up('pB', { act: 'ice', id: idB, cand: CAND });   // before the answer: not taken
    up('pB', { act: 'answer', id: 'f'.repeat(16), sdp: ANSWER }); up('pB', { act: 'answer', id: idB, sdp: 'x' }); up('pB', { act: 'answer', id: idB, sdp: 5 }); up('pB', { act: 'answer', sdp: ANSWER }); up('pB', { act: 'answer', id: [idB], sdp: ANSWER });
    // another connection's answer for a link it does not hold: Ann's older connection, another player, a player outside the audience
    up('pA', { act: 'answer', id: idA2, sdp: ANSWER }); up('pB', { act: 'answer', id: idA2, sdp: ANSWER }); up('pC', { act: 'answer', id: idB, sdp: ANSWER }); up('pA2', { act: 'answer', id: idB, sdp: ANSWER });
    const early = [pcUB.remote, pcUB.cands.length, lnB.answered, pcUA2.remote, lnA2.answered];
    up('pA2', { act: 'answer', id: idA2, sdp: ANSWER });
    up('pB', { act: 'answer', id: idB, sdp: ANSWER, evil: 1 }); up('pB', { act: 'answer', id: idB, sdp: 'v=0 second' });
    up('pB', { act: 'ice', id: idB, cand: CAND }); up('pB', { act: 'ice', id: idB, cand: { candidate: 'evil', sdpMid: '0' } }); up('pB', { act: 'ice', id: 'f'.repeat(16), cand: CAND });
    ['pA', 'pB', 'pC'].forEach(p => { up(p, { act: 'ice', id: idA2, cand: CAND }); up(p, { act: 'bye', id: idA2 }); });
    ['pA', 'pA2', 'pC'].forEach(p => { up(p, { act: 'ice', id: idB, cand: CAND }); up(p, { act: 'bye', id: idB }); });
    const foreign = [pcUA2.cands.length, pcUB.cands.length, pcUA2.closed, pcUB.closed, U.api.vid().links.pA2 === lnA2, U.api.vid().links.pB === lnB];
    for (let i = 0; i < 80; i++) up('pB', { act: 'ice', id: idB, cand: CAND });
    const X = mkHost(); X.net.videoShow(liveStream(), 'x', ['u_b'], 1, 1); await tick();
    const lnX = X.api.vid().links.pB; X.net.roster.pB = { id: 'u_x', name: 'X' };   // a link held by a connection whose player is no longer the audience's
    ['answer', 'ice', 'bye'].forEach(a => X.api.videoUp({ type: 'video-up', act: a, id: lnX.id, sdp: ANSWER, cand: CAND }, X.conn('pB')));
    check('item 21 V2 a player\'s answer and candidates (videoUp, run for real): only for the link their own connection holds, named by its id; one answer (a text that starts as a description does), then at most 60 candidates, each cleaned to its line and its media line; none before the answer; an answer, a candidate or a bye from another connection (the same player\'s older one, another player\'s, one outside the audience) naming a link it does not hold changes nothing; nor does any word of a player who is not the audience\'s',
        j(early) === j([null, 0, false, null, false]) && j(pcUB.remote) === j({ type: 'answer', sdp: ANSWER }) && j(pcUA2.remote) === j({ type: 'answer', sdp: ANSWER }) && j(foreign) === j([0, 1, false, false, true, true])
        && pcUB.cands.length === 60 && pcUB.cands.every(c => j(c) === j({ candidate: CAND.candidate, sdpMid: '0', sdpMLineIndex: 0 })) && j([lnX.pc.remote, lnX.answered, lnX.pc.closed]) === j([null, false, false]), j([early, foreign, pcUB.cands.length, [lnX.pc.remote, lnX.answered, lnX.pc.closed]]));
    // asks: limited per profile on the world's clock
    const askOnce = p => { const before = U.world.pcs.length; up(p, { act: 'ask', id: 'ignored', sdp: 'ignored' }); return U.world.pcs.length - before; };
    const a1 = askOnce('pB'), newB = U.api.vid().links.pB; await tick();
    const a2 = askOnce('pB'); U.world.clock += 1499; const a3 = askOnce('pB'); U.world.clock += 1; const a4 = askOnce('pB');
    U.world.clock += 1500; const a5 = askOnce('pA'); U.world.clock += 100; const a6 = askOnce('pA2');   // one count for a profile's two connections
    U.world.clock += 1500; const a7 = askOnce('pB'); U.world.clock += 1500; const a8 = askOnce('pB'); U.world.clock += 1500; const a9 = askOnce('pB');   // the fourth in a minute, then none
    const aOut = askOnce('pC'), aWait = (() => { const b = U.world.pcs.length; U.api.videoUp({ type: 'video-up', act: 'ask' }, U.conn('pWait')); return U.world.pcs.length - b; })();
    // a new showing stops the one under way first
    const oldPcsU = U.world.pcs.filter(p => !p.closed), oldTmU = U.tm.list.filter(t => t.on), oldVidU = U.api.vid(); U.net.conns.forEach(c => { c.sent.length = 0; });
    U.net.videoShow(liveStream(), 'next', ['u_b'], 1, 1); await tick();
    const swapU = [oldPcsU.length >= 2 && oldPcsU.every(p => p.closed), oldTmU.length >= 2 && oldTmU.every(t => !t.on), Object.keys(oldVidU.links).length, j(U.conn('pA').sent), j(U.conn('pA2').sent), U.conn('pB').sent.map(m => m.act).join(), U.conn('pC').sent.length, j(U.net.videoAudience().waiting)];
    U.world.clock += 1; const aNew = askOnce('pB');
    check('item 21 V2 a player\'s ask to be linked again (videoUp): a new link with a new id on the asking connection, the old one closed; limited per player, 1.5 s apart and 4 a minute, a player\'s several connections sharing one count; none for a player outside the audience or a waiting peer; nothing is read from the message but its act. A new showing stops the one under way first (its links closed, its watchdogs cleared, the stop to its whole audience before the new offer) and starts a new count of asks',
        j([a1, a2, a3, a4]) === j([1, 0, 0, 1]) && pcUB.closed === true && HEX16.test(newB.id) && newB.id !== idB && j([a5, a6]) === j([1, 0]) && j([a7, a8, a9]) === j([1, 1, 0]) && aOut === 0 && aWait === 0 && aNew === 1
        && j(swapU) === j([true, true, 0, STOP, STOP, 'stop,offer', 0, '["Bob"]']), j([a1, a2, a3, a4, a5, a6, a7, a8, a9, aOut, aWait, aNew, swapU]));
    // bye; an answer the connection cannot take; no limiter; no showing
    const B = mkHost(); B.net.videoShow(liveStream(), 'x', null, 1, 1); await tick();
    const idBB = B.api.vid().links.pB.id, pcBB = B.api.vid().links.pB.pc, toldB = B.world.told;
    B.api.videoUp({ type: 'video-up', act: 'bye', id: 'f'.repeat(16) }, B.conn('pB')); const byeWrong = pcBB.closed;
    B.api.videoUp({ type: 'video-up', act: 'bye', id: idBB }, B.conn('pB')); const byeRight = [pcBB.closed, H.own(B.api.vid().links, 'pB'), B.world.told - toldB, B.net.videoAudience().waiting];
    B.world.failRemote = true; const pcBC = B.api.vid().links.pC.pc; B.api.videoUp({ type: 'video-up', act: 'answer', id: B.api.vid().links.pC.id, sdp: ANSWER }, B.conn('pC')); await tick(); await tick();
    const NL = mkHost({ noLimit: true }); NL.net.videoShow(liveStream(), 'x', null, 1, 1); await tick(); const nlBefore = NL.world.pcs.length; NL.api.videoUp({ type: 'video-up', act: 'ask' }, NL.conn('pB'));
    const Z = mkHost(); ['ask', 'bye', 'answer', 'ice'].forEach(a => Z.api.videoUp({ type: 'video-up', act: a, id: idBB, sdp: ANSWER, cand: CAND }, Z.conn('pB')));
    check('item 21 V2 a player\'s bye (their own Video is off): their link goes at once and the panel is told, only by the link\'s own id; an answer the connection refuses closes that link; with no limiter an ask is refused, never let through; with no showing nothing is done',
        byeWrong === false && j(byeRight) === j([true, false, 1, ['Ann', 'Bob', 'Cy']]) && pcBC.closed === true && !H.own(B.api.vid().links, 'pC') && NL.world.pcs.length === nlBefore && Z.world.pcs.length === 0 && Z.got() === '', j([byeWrong, byeRight, pcBC.closed, NL.world.pcs.length - nlBefore]));
    check('item 21 V2 the host\'s one branch (videoup, source) hands a video-up to videoUp and reads nothing itself; an admitted player in the audience is linked right behind their snapshot; a closed connection and a removed player lose their link at once; the table\'s end stops the showing while the table still hears it; neither side takes a media call',
        /^\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*videoUp\(msg, conn\);\s*$/.test(upS) && /\} else if \(msg\.type === 'video-up' && net\.role === 'host'\) \{\n\s*\/\/ \[netcheck:videoup-start\]/.test(src)
        && /if \(snapOk && typeof videoLink === 'function'\) videoLink\(conn\);[^\n]*\n    broadcastRoster\(\);\n\}/.test(src)
        && /if \(net\.role === 'host' && typeof videoHang === 'function'\) \{ videoHang\(conn\.peer\); videoTold\(\); \}/.test(src) && /if \(typeof videoHang === 'function'\) \{ keys\.forEach\(videoHang\); videoTold\(\); \}/.test(src)
        && /window\.wpVideo\.tableLeft\(\); \} catch \(e\) \{\} \}[^\n]*\n    net\.videoStop\(\); videoOver\(\);\n    if \(window\.wpVoice\) \{ try \{ window\.wpVoice\.tableLeft\(\); \} catch \(e\) \{\} \}[^\n]*\n    var peerL = net\.peer; net\.peer = null; if \(peerL\) \{ try \{ peerL\.destroy\(\); \}/.test(src) && /videoOver\(\); if \(window\.wpVideo && window\.wpVideo\.tableLeft\) window\.wpVideo\.tableLeft\(\);/.test(src)
        && (src.match(/peer\.on\('call', function\(call\) \{ try \{ call\.close\(\); \} catch \(e\) \{\} \}\);/g) || []).length === 2 && !/\.answer\(|peer\.call\(/.test(src));

    /* ---- the player ---- */
    const mkCli = o => {
        o = o || {};
        const world = { pcs: [], streams: [], got: [], lost: 0, stopped: 0, failed: [], allowOk: true, videoOn: o.videoOn !== false, clock: 100000 }, tm = mkTimers();
        const c0 = mkConn('host1');
        const net = { active: true, role: 'client', stream: !!o.streamWin, foreign: o.foreign !== false, syncedPeer: o.synced === false ? null : 'host1', conns: [c0] };
        const win = { wpVideoCore: VCv, wpVtt: { on: id => id === 'video' && world.videoOn }, wpVideo: { onStream: (s, n) => world.got.push([s, n]), onLost: () => { world.lost++; }, onStop: () => { world.stopped++; } } };
        const MS = function() { this.tracks = []; this.addTrack = t => this.tracks.push(t); world.streams.push(this); };
        const clockD = { now: () => world.clock };
        // the offer limiter: a switch, or the host file's own allow() with the real RateLimit on this world's clock
        const allowFn = o.realAllow ? new Function('window', 'Date', lineOf('var _lim = Object.create(null);') + '\n' + lineOf('function allow(') + '\nreturn allow;')({ wpDiceCore: DCv }, clockD) : () => world.allowOk;
        const api = new Function('net', 'window', 'sendFailed', 'peerOpts', 'allow', 'RTCPeerConnection', 'MediaStream', 'setTimeout', 'clearTimeout', 'Date',
            candS + cliS + '\nreturn { videoMsg: videoMsg, videoOver: videoOver, videoAsk: videoAsk, inn: function() { return _vidIn; }, branch: function(msg, conn) { ' + msgS + ' } };')(
            net, win, e => world.failed.push(e.message), () => ({ config: { iceServers: [{ urls: 'stun:y' }] } }), allowFn, o.noRtc ? undefined : mkRtc(world), MS, tm.set, tm.clear, clockD);
        return { net, world, tm, api, c0, ups: () => c0.sent.filter(m => m.type === 'video-up'), asks: () => c0.sent.filter(m => m.type === 'video-up' && m.act === 'ask').length };
    };
    const ID1 = '0123456789abcdef', ID2 = 'fedcba9876543210', hid = i => i.toString(16).padStart(16, '0');
    const offerTo = (s, id) => { s.api.videoMsg({ type: 'video', act: 'offer', id: id, name: 'x', sdp: OFFER }); };
    const RESET = '{"id":null,"pc":null,"ice":0,"live":false,"offered":false,"asks":0,"askedAt":0,"timer":null}';
    const P = mkCli(); P.api.videoMsg({ type: 'video', act: 'offer', id: ID1, name: 'The\u0000 <b>reveal</b>', sdp: OFFER, evil: 1 }); await tick(); await tick(); await tick();
    const pcP = P.world.pcs[0], ansP = P.ups()[0];
    pcP.onicecandidate({ candidate: CAND }); pcP.onicecandidate({ candidate: null }); pcP.onicecandidate({ candidate: { candidate: 'evil', sdpMid: '0' } });
    P.api.videoMsg({ type: 'video', act: 'ice', id: ID1, cand: CAND }); P.api.videoMsg({ type: 'video', act: 'ice', id: ID2, cand: CAND }); P.api.videoMsg({ type: 'video', act: 'ice', id: ID1, cand: { candidate: 'x' } });
    const iceOne = pcP.cands.length;
    for (let i = 0; i < 80; i++) P.api.videoMsg({ type: 'video', act: 'ice', id: ID1, cand: CAND });
    const trA = { kind: 'audio' }, trV = { kind: 'video' }, oldTrackP = pcP.ontrack; pcP.ontrack({ track: trA }); pcP.ontrack({ track: trV });
    check('item 21 V2 a player takes their GM\'s offer (videoMsg, run for real): a connection of its own from this app\'s own ICE settings, the offer set, an answer sent back on the table\'s connection with the link\'s id — its sound line asking for stereo — and nothing else; this side\'s candidates follow, cleaned; the GM\'s candidates are taken only for the link held, cleaned, 60 at most',
        P.world.pcs.length === 1 && j(pcP.cfg) === j({ iceServers: [{ urls: 'stun:y' }] }) && j(pcP.remote) === j({ type: 'offer', sdp: OFFER }) && j(Object.keys(ansP).sort()) === j(['act', 'id', 'sdp', 'type']) && ansP.act === 'answer' && ansP.id === ID1 && ansP.sdp === VCv.stereoSdp(ANSWER) && /a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;maxaveragebitrate=128000\r\n/.test(ansP.sdp)
        && j(P.ups().slice(1)) === j([{ act: 'ice', id: ID1, cand: { candidate: CAND.candidate, sdpMid: '0', sdpMLineIndex: 0 }, type: 'video-up' }]) && iceOne === 1 && pcP.cands.length === 60 && pcP.cands.every(c => j(c) === j({ candidate: CAND.candidate, sdpMid: '0', sdpMLineIndex: 0 })) && pcP.trans.length === 0 && packs(P.c0.sent), j([P.ups(), iceOne, pcP.cands.length]));
    check('item 21 V2 the picture and its sound reach the panel as one stream, handed over at each track (the same stream twice), with the name cleaned again (shown as text)',
        P.world.got.length === 2 && P.world.got[0][0] === P.world.got[1][0] && P.world.streams.length === 1 && j(P.world.streams[0].tracks) === j([trA, trV]) && P.world.got[0][1] === 'The <b>reveal</b>' && P.api.inn().live === true && P.api.inn().id === ID1, j(P.world.got.map(g => g[1])));
    // a second offer; a track from the replaced link; a stop
    P.api.videoMsg({ type: 'video', act: 'offer', id: ID2, name: 'Two', sdp: OFFER }); await tick(); await tick(); await tick();
    const pcP2 = P.world.pcs[1]; oldTrackP({ track: { kind: 'video' } }); pcP.state('failed');   // the first link's own handler, kept from before it was closed
    const afterSecond = [pcP.closed, pcP2.closed, P.world.got.length, P.world.lost, P.api.inn().id, P.ups().filter(m => m.act === 'answer').map(m => m.id).join()];
    P.api.videoMsg({ type: 'video', act: 'stop', id: 'whatever' });
    const afterStop = [pcP2.closed, P.world.stopped, j(P.api.inn())]; pcP2.state('failed');
    // a stop while an ask is waiting: its timer goes too
    const K = mkCli(); offerTo(K, ID1); await tick(); await tick(); K.world.pcs[0].state('failed'); const kPending = K.tm.list.filter(t => t.on).length; K.api.videoMsg({ type: 'video', act: 'stop' });
    check('item 21 V2 one link at a time: a second offer closes the first (whose tracks and whose failure are no longer heard); the GM\'s stop closes the link, closes the panel and keeps nothing of the showing — an ask that was waiting is called off, and a failure after it asks for nothing',
        j(afterSecond) === j([true, false, 2, 0, ID2, ID1 + ',' + ID2]) && j(afterStop) === j([true, 1, RESET]) && P.world.lost === 0 && kPending === 1 && K.tm.list.length === 1 && K.tm.list.every(t => !t.on) && j(K.api.inn()) === RESET && K.asks() === 0, j([afterSecond, afterStop, P.world.lost, kPending, K.tm.list.map(t => t.on)]));
    // what is no offer; Video off; an app that can take none
    const Q = mkCli(); [{ act: 'offer', id: 'short', sdp: OFFER }, { act: 'offer', id: ID1.toUpperCase(), sdp: OFFER }, { act: 'offer', id: ID1, sdp: 'x' }, { act: 'offer', id: ID1 }, { act: 'offer', sdp: OFFER }, { act: 'nope', id: ID1, sdp: OFFER }, { id: ID1, sdp: OFFER }, { act: 'ice', id: ID1, cand: CAND }].forEach(m => Q.api.videoMsg(Object.assign({ type: 'video' }, m))); await tick();
    const O = mkCli({ videoOn: false }); offerTo(O, ID1); await tick();
    const BYE1 = '[{"act":"bye","id":"' + ID1 + '","type":"video-up"}]';
    const offNow = [O.world.pcs.length, j(O.ups()), O.api.inn().offered, O.api.inn().live]; O.net.videoWake(); const wakeOff = O.ups().length;
    O.world.videoOn = true; O.net.videoWake(); O.net.videoWake(); const wakeOn = [O.asks(), O.api.inn().offered];
    O.world.clock += 1999; O.net.videoWake(); const wakeSoon = O.asks(); O.world.clock += 1; O.net.videoWake(); const wakeAgain = [O.asks(), O.api.inn().offered];   // the first ask was refused by the GM's limit: asked again
    offerTo(O, ID2); await tick(); await tick(); O.world.clock += 5000; O.net.videoWake(); const wakeTaken = [O.world.pcs.length, O.asks(), O.api.inn().offered];
    const NR = mkCli({ noRtc: true }); offerTo(NR, ID1); await tick();
    check('item 21 V2 what is no offer (an id that is not a link\'s, no description, another act, a candidate with no link) makes no connection and says nothing; with Video off here the offer is not taken and the GM is told (bye, by the link\'s id); switching Video on asks for it — once, then again only 2 s later, until the offer is taken (an ask the GM\'s limit refused is not the end); an app that can take no video at all says bye and asks for nothing',
        Q.world.pcs.length === 0 && Q.c0.sent.length === 0 && j(offNow) === j([0, BYE1, true, false]) && wakeOff === 1 && j(wakeOn) === j([1, true]) && wakeSoon === 1 && j(wakeAgain) === j([2, true]) && j(wakeTaken) === j([1, 2, false])
        && j(NR.ups()) === BYE1 && NR.api.inn().offered === false && NR.tm.list.length === 0 && NR.world.pcs.length === 0, j([Q.world.pcs.length, offNow, wakeOff, wakeOn, wakeSoon, wakeAgain, wakeTaken, NR.ups()]));
    // a host that offers without end: the app's own limiter (the real allow() and RateLimit, on this world's clock)
    const F = mkCli(); F.world.allowOk = false; offerTo(F, ID1); offerTo(F, ID2); await tick();
    const refusedF = [F.world.pcs.length, F.api.inn().offered, F.c0.sent.length, F.tm.list.filter(t => t.on).map(t => t.ms).join()]; F.tm.fire(2000);
    const RL = mkCli({ realAllow: true }); offerTo(RL, hid(1)); RL.world.clock += 299; offerTo(RL, hid(2)); const rlClose = [RL.world.pcs.length, RL.api.inn().offered];
    RL.world.clock += 5000; RL.tm.fire(2000); RL.net.videoWake(); const rlStands = RL.asks();   // the first link still stands: nothing is asked while it does
    const RM = mkCli({ realAllow: true }); for (let i = 0; i < 25; i++) { offerTo(RM, hid(100 + i)); RM.world.clock += 300; }
    const rmMinute = RM.world.pcs.length; RM.world.clock += 60000; offerTo(RM, hid(200)); const rmLater = RM.world.pcs.length;
    check('item 21 V2 a host that offers without end is not followed (the app\'s own limiter, run for real): offers less than 300 ms apart or past 20 in a minute make no connection, whatever link id each names; one the limit caught is remembered and asked for again 2 s later (one timer, however many were refused); a minute later offers are taken again',
        j(refusedF) === j([0, true, 0, '2000']) && F.asks() === 1 && j(rlClose) === j([1, true]) && rlStands === 0 && rmMinute === 20 && rmLater === 21, j([refusedF, F.asks(), rlClose, rlStands, rmMinute, rmLater]));
    // the picture lost with no stop: ask again, three times at most running; a link that comes up starts the count again
    const W = mkCli(); offerTo(W, ID1); await tick(); await tick(); W.world.pcs[0].ontrack({ track: { kind: 'video' } });
    W.world.pcs[0].state('disconnected'); const notYet = W.world.lost; W.world.pcs[0].state('failed');
    const lost1 = [W.world.lost, W.world.pcs[0].closed, W.tm.list.filter(t => t.on).map(t => t.ms).join(), W.api.inn().live]; W.tm.fire(2000);
    const asks1 = W.asks();
    for (let i = 0; i < 5; i++) { offerTo(W, hid(300 + i)); await tick(); await tick(); const pcI = W.world.pcs[W.world.pcs.length - 1]; pcI.ontrack({ track: { kind: 'video' } }); pcI.state('failed'); W.tm.fire(2000); }   // as a browser does: the tracks arrive with the offer, long before the link is up
    const asksAll = W.asks(), capped = [W.api.inn().asks, W.tm.list.filter(t => t.on).length];
    offerTo(W, hid(400)); await tick(); await tick(); const pcW = W.world.pcs[W.world.pcs.length - 1]; pcW.state('connected'); const again = [W.api.inn().asks]; pcW.state('failed'); W.tm.fire(2000); again.push(W.api.inn().asks, W.asks());
    check('item 21 V2 the picture lost with no stop from the GM (the link failed, not merely interrupted): the panel is told and the GM is asked again 2 s later, at most 3 times running — tracks arriving with each new offer do not start the count again, a link that comes up does',
        notYet === 0 && j(lost1) === j([1, true, '2000', true]) && asks1 === 1 && asksAll === 3 && j(capped) === j([3, 0]) && j(again) === j([0, 1, 4]), j([notYet, lost1, asks1, asksAll, capped, again]));
    // Video switched off while it plays, or while the picture is lost
    const D = mkCli(); offerTo(D, ID1); await tick(); await tick(); D.net.videoDrop();
    const dropped = [D.world.pcs[0].closed, j(D.ups().filter(m => m.act !== 'answer')), D.api.inn().offered, D.world.lost]; D.net.videoDrop();
    const La = mkCli(); offerTo(La, ID1); await tick(); await tick(); La.world.pcs[0].state('failed'); La.world.videoOn = false; La.net.videoDrop();
    const lostDrop = [La.api.inn().offered, j(La.ups().filter(m => m.act !== 'answer'))];
    const Lb = mkCli(); offerTo(Lb, ID1); await tick(); await tick(); Lb.world.pcs[0].state('failed'); Lb.world.videoOn = false; Lb.tm.fire(2000);   // no panel to drop: the waiting ask finds Video off
    const lostTimer = [Lb.api.inn().offered, Lb.asks(), Lb.api.inn().asks]; Lb.world.videoOn = true; Lb.net.videoWake(); Lb.net.videoWake();
    const Ln = mkCli(); Ln.net.videoDrop();   // nothing is being shown: nothing to remember
    check('item 21 V2 Video switched off here while it plays closes the link, tells the GM once and remembers to ask when it is on again; switched off while the picture is lost (no link to close) it is remembered all the same — by the drop, and by the waiting ask that finds Video off — and switching it on asks; with no showing there is nothing to remember',
        j(dropped) === j([true, BYE1, true, 0]) && D.ups().filter(m => m.act === 'bye').length === 1 && j(lostDrop) === j([true, '[]']) && j(lostTimer) === j([true, 0, 1]) && Lb.asks() === 1 && Lb.api.inn().offered === true && Ln.api.inn().offered === false && Ln.c0.sent.length === 0, j([dropped, lostDrop, lostTimer, Lb.asks()]));
    // who may be told, and whose word is heard (the branch, run for real)
    const hear = (o, msg, peer) => { const s = mkCli(o); s.api.branch(Object.assign({ type: 'video' }, msg), peer ? { peer: peer } : s.c0); return s; };
    const offerM = { act: 'offer', id: ID1, name: 'x', sdp: OFFER };
    const hOk = hear({}, offerM), hStream = hear({ streamWin: true }, offerM), hEarly = hear({ foreign: false, synced: false }, offerM), hOther = hear({}, offerM, 'evil9'), hEarlyStop = hear({ foreign: false, synced: false }, { act: 'stop' });
    const hMid = hear({ foreign: false }, offerM);   // the host known, its campaign not yet in
    await tick(); await tick();
    const earlyThen = [hEarly.api.inn().offered]; hEarly.api.branch({ type: 'video', act: 'stop' }, { peer: 'evil9' }); earlyThen.push(hEarly.api.inn().offered); hEarly.api.branch({ type: 'video', act: 'ice', id: ID1, cand: CAND }, hEarly.c0); earlyThen.push(hEarly.api.inn().offered); hEarly.api.branch({ type: 'video', act: 'stop' }, hEarly.c0); earlyThen.push(hEarly.api.inn().offered);
    const sayNo = [mkCli({ synced: false }), mkCli({ foreign: false }), mkCli({ streamWin: true }), (() => { const s = mkCli(); s.c0.open = false; return s; })(), (() => { const s = mkCli(); s.net.conns = []; return s; })(), (() => { const s = mkCli(); s.net.role = 'host'; return s; })(), (() => { const s = mkCli({ videoOn: false }); return s; })()].map(s => [s.api.videoAsk(), s.c0.sent.length]);
    check('item 21 V2 a player hears a video\'s word only from the synced host, after the snapshot, never in the stream window (the videomsg branch, run for real): an offer from their own GM that comes before the snapshot is remembered, to be asked for once it is in, and that GM\'s stop (no other peer\'s, no other word) forgets it; another peer\'s offer is nothing; and a player asks only their synced GM, over an open connection, with Video on',
        hOk.world.pcs.length === 1 && hStream.world.pcs.length === 0 && hStream.api.inn().offered === false && hMid.world.pcs.length === 0 && hMid.api.inn().offered === true && hEarly.world.pcs.length === 0 && j(earlyThen) === j([true, true, true, false]) && hOther.world.pcs.length === 0 && hOther.api.inn().offered === false && hEarlyStop.world.stopped === 0 && hEarlyStop.api.inn().offered === false
        && sayNo.every(x => x[0] === false && x[1] === 0) && mkCli().api.videoAsk() === true && /net\.videoWake\(\);[^\n]*\n        if \(window\.wpVoice\) \{ try \{ window\.wpVoice\.tableReady\(\); \} catch \(e\) \{\} \}[^\n]*\n    \} else if \(msg\.type === 'item'\)/.test(src), j([hOk.world.pcs.length, earlyThen, sayNo]));
})());

T.finish();
