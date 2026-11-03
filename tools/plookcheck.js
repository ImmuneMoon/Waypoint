// plookcheck — a personal look (backlog 35's last part; the owner, 2026-11-03, by prompt on scratch/mockups/personal-look.html: "name, roll
// cards, and sheet text", set by "player, or GM, both can clear the other's changes", and "Yes, a VTT feature, on"). systemcore's cleaner and
// what each copy of a character keeps, plook.js's one reader run on stand-ins, the host's branch for a player's change run for real, a token's
// copy, and the sheet's look line. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i + a.length, j) : ''; }
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const S = await imp('scripts/systemcore.js'), T = await imp('scripts/textfmt.js');
    // ---- the cleaner
    const cp = S.cleanPlook;
    check('a look keeps a font of Waypoint’s own under the list’s spelling and a colour as six hex digits in lower case; anything else of either is no key, and a look with neither is none',
        J(cp({ font: 'cinzel', color: '#ABCDEF' })) === J({ font: 'Cinzel', color: '#abcdef' }) && J(cp({ font: 'Cinzel', color: '#abc' })) === J({ font: 'Cinzel' }) && J(cp({ color: '#00ff00', font: 'Arial' })) === J({ color: '#00ff00' })
        && cp({ font: 'Arial' }) === null && cp({ color: 'red' }) === null && cp({}) === null && cp(null) === null && cp('Cinzel') === null && cp(['Cinzel']) === null
        && cp({ font: 'Comic Sans MS', color: 'url(x)' }) === null && cp({ font: '"Cinzel"; color: red' }) === null && cp({ font: { toString: () => 'Cinzel' } }) === null
        && J(cp({ font: '  Lora  ' })) === J({ font: 'Lora' }) && cp({ color: '#abcdef0' }) === null, J([cp({ font: 'cinzel', color: '#ABCDEF' }), cp({ font: '  Lora  ' })]));
    check('every font of the list is taken, under its own spelling, and no generic family is', T.FONTS.every(f => cp({ font: f[0].toUpperCase() }) && cp({ font: f[0].toUpperCase() }).font === f[0]) && cp({ font: 'serif' }) === null && cp({ font: 'sans-serif' }) === null);
    // ---- what each copy keeps
    const sys = S.emptySystem(); sys.fields = [{ id: 'f_t', key: 'Name2', label: 'Nick', kind: 'text', vis: 'all', hover: true }];
    const ch = { id: 'c_k', name: 'Kessa', ownerId: 'u_a', npc: false, values: { f_t: 'K' }, plook: { font: 'Cinzel', color: '#C0FFEE' } };
    const host = S.cleanChar(ch, sys, { state: 'host' }), ownC = S.charFor(ch, sys, 'u_a'), mate = S.charFor(ch, sys, 'u_b');
    const ownR = S.cleanChar(ownC, sys, { state: 'owner' }), mateR = S.cleanChar(mate, sys, { state: 'owner' });
    check('the character keeps its look on the host, on its owner’s copy and on a teammate’s hover copy, each cleaned, since everyone who sees the name sees the look',
        J(host.plook) === J({ font: 'Cinzel', color: '#c0ffee' }) && J(ownC.plook) === J({ font: 'Cinzel', color: '#c0ffee' }) && mate && mate.partial === true && J(mate.plook) === J({ font: 'Cinzel', color: '#c0ffee' })
        && J(ownR.plook) === J(ownC.plook) && J(mateR.plook) === J(mate.plook), J([host.plook, ownC && ownC.plook, mate && mate.plook]));
    const plain = S.cleanChar({ id: 'c_p', name: 'P', ownerId: 'u_a', npc: false, values: {}, plook: { font: 'Arial', color: 'blue' } }, sys, { state: 'host' });
    check('a look that cleans to nothing leaves no key, so a character with none is as before', !('plook' in plain) && !('plook' in S.charFor({ id: 'c_q', name: 'Q', ownerId: 'u_a', npc: false, values: {} }, sys, 'u_b')));
    check('systemcore publishes the cleaner on the window as it exports it', typeof window.wpSystemCore === 'object' && window.wpSystemCore.cleanPlook === S.cleanPlook);
    // ---- plook.js: the one reader, run with its import replaced by a stand-in
    const plS = read('scripts/plook.js');
    const mkP = (camp, vttOn) => {
        const w = { wpSystemCore: { cleanPlook: S.cleanPlook }, wpTextFmt: { fontCss: T.fontCss }, wpVtt: { on: id => id === 'plook' ? vttOn : true } };
        const body = plS.replace(/^import [^\n]*\n/m, '').replace(/^if \(typeof window[^\n]*\n/m, '').replace(/^export [^\n]*\n?/m, '');
        return new Function('window', 'getActiveCampaign', body + '\nreturn { ofChar, ofTok, ofCharId, dress, sig, on };')(w, () => camp);
    };
    const campA = { chars: { c_k: { id: 'c_k', plook: { font: 'Lora', color: '#112233' } } } };
    const P1 = mkP(campA, true), P0 = mkP(campA, false), Pn = mkP(null, true);
    check('ofChar reads a character’s look cleaned, and none while Personal looks is off on this screen', J(P1.ofChar(campA.chars.c_k)) === J({ font: 'Lora', color: '#112233' }) && P0.ofChar(campA.chars.c_k) === null && P1.ofChar(null) === null && P1.ofChar({ plook: { font: 'Arial' } }) === null);
    check('ofTok reads a token’s character where this app holds it, else the look the host sent on the token; never a waiting token or a piece that is no character',
        J(P1.ofTok({ isChar: true, charId: 'c_k', pl: { color: '#ffffff' } })) === J({ font: 'Lora', color: '#112233' }) && J(Pn.ofTok({ isChar: true, charId: 'c_k', pl: { color: '#FFFFFF', font: 'x' } })) === J({ color: '#ffffff' })
        && P1.ofTok({ isChar: true, waiting: true, charId: 'c_k' }) === null && P1.ofTok({ isChar: false, charId: 'c_k' }) === null && P0.ofTok({ isChar: true, charId: 'c_k' }) === null && P1.ofTok({ isChar: true, charId: '__proto__', pl: { color: '#000000' } }) !== undefined);
    const el = { style: { fontFamily: 'X', color: 'Y' } }; P1.dress(el, { font: 'Cinzel', color: '#ABCDEF' }); const a1 = J(el.style); P1.dress(el, null); const a2 = J(el.style); P1.dress(el, { font: 'Arial; color: red', color: 'red' }); const a3 = J(el.style);
    check('dress sets an element’s font through fontCss and its colour as the cleaned colour, and clears both for none or for a look that does not clean',
        a1 === J({ fontFamily: '"Cinzel", serif', color: '#abcdef' }) && a2 === J({ fontFamily: '', color: '' }) && a3 === J({ fontFamily: '', color: '' }) && P1.dress(null, {}) === null, J([a1, a2, a3]));
    check('sig names a look for a redraw’s comparison, the same for the same look whatever its spelling', P1.sig({ font: 'cinzel', color: '#ABCDEF' }) === P1.sig({ font: 'Cinzel', color: '#abcdef' }) && P1.sig(null) === '' && P1.sig({ font: 'Lora' }) !== P1.sig({ font: 'Cinzel' }));
    // ---- the host's branch for a player's change, run for real
    const net = read('scripts/net.js'), br = between(net, '// [netcheck:charplook-start]', '// [netcheck:charplook-end]');
    const runB = (o, msg) => {
        const out = { answer: [], saves: 0, synced: [], moved: [], changed: [] }, camp = o.camp || { chars: { c_k: { id: 'c_k', name: 'Kessa', ownerId: 'u_a', npc: false, values: {} }, c_n: { id: 'c_n', name: 'Npc', npc: true, values: {} }, c_o: { id: 'c_o', name: 'O', ownerId: 'u_b', npc: false, values: {} } } };
        const conn = { peer: 'p1', send: m => out.answer.push(m) }, netO = { roster: { p1: { id: 'u_a', name: 'Ann' } }, paused: !!o.paused, syncChar: id => out.synced.push(id) };
        const fn = new Function('msg', 'conn', 'net', 'own', 'getActiveCampaign', 'peerPaused', 'SC', 'allow', 'saveRemoteSoon', 'plMoved', 'sendFailed', 'window', br);
        fn(Object.assign({ type: 'char-plook', rid: 'r1' }, msg), conn, netO, (x, k) => Object.prototype.hasOwnProperty.call(x, k), () => camp, () => !!o.peerPaused, () => S, () => o.slow !== true, () => { out.saves++; }, id => out.moved.push(id), () => {}, { wpSheets: { charChanged: id => out.changed.push(id) } });
        out.camp = camp; return out;
    };
    const b1 = runB({}, { charId: 'c_k', look: { font: 'cinzel', color: '#ABCDEF' } }), b2 = runB({}, { charId: 'c_k', look: null });
    check('a player sets the look of their own character: stored cleaned, saved, sent whole to the table, the maps with its tokens looked at again, and answered ok; null clears it',
        J(b1.camp.chars.c_k.plook) === J({ font: 'Cinzel', color: '#abcdef' }) && b1.saves === 1 && J(b1.synced) === J(['c_k']) && J(b1.moved) === J(['c_k']) && J(b1.changed) === J(['c_k']) && J(b1.answer) === J([{ ok: true, type: 'char-plook-ans', rid: 'r1' }])
        && !('plook' in b2.camp.chars.c_k) && b2.saves === 1 && J(b2.answer) === J([{ ok: true, type: 'char-plook-ans', rid: 'r1' }]), J([b1, b2]));
    const ref = (why, o, msg) => { const r = runB(o, msg); return J(r.answer) === J([{ reason: why, type: 'char-plook-ans', rid: 'r1' }]) && r.saves === 0 && r.synced.length === 0 && !('plook' in r.camp.chars.c_k); };
    check('refused and answered why, nothing changed: another player’s character or an NPC (owner), one that is not there (missing), a look that does not clean (plook), a paused table or player (paused), the rate (slow); a malformed request id or a stranger is answered nothing',
        ref('owner', {}, { charId: 'c_o', look: { font: 'Lora' } }) && ref('owner', {}, { charId: 'c_n', look: { font: 'Lora' } }) && ref('missing', {}, { charId: 'c_9', look: { font: 'Lora' } }) && ref('missing', {}, { charId: 'constructor', look: { font: 'Lora' } })
        && ref('plook', {}, { charId: 'c_k', look: { font: 'Arial' } }) && ref('plook', {}, { charId: 'c_k', look: 'Cinzel' }) && ref('paused', { paused: true }, { charId: 'c_k', look: { font: 'Lora' } }) && ref('paused', { peerPaused: true }, { charId: 'c_k', look: { font: 'Lora' } })
        && ref('slow', { slow: true }, { charId: 'c_k', look: { font: 'Lora' } }) && runB({}, { rid: 'r 1', charId: 'c_k', look: { font: 'Lora' } }).answer.length === 0);
    // ---- the wire: a token's copy carries its character's look, a player's app cleans it again, a change is looked at where the effects are
    check('a token’s copy carries its character’s look (pl), worked out afresh each time; a player’s app cleans a host’s again; a change of a character looks at its tokens with the bars, from the one funnel the three character funnels call',
        net.includes("if (w.pl !== undefined) delete w.pl; var plW = w.isChar && !w.waiting && typeof plOf === 'function' ? plOf(w) : null; if (plW) w.pl = plW;")
        && net.includes("if (w.pl !== undefined) { var plH = typeof SC === 'function' && SC() && typeof SC().cleanPlook === 'function' ? SC().cleanPlook(w.pl) : null; if (plH) w.pl = plH; else delete w.pl; }")
        && /function fxbMoved\(id\) \{\n    if \(typeof barsMoved === 'function'\) barsMoved\(id\);[^\n]*\n    if \(typeof plMoved === 'function'\) plMoved\(id\);/.test(net)
        && net.includes("net.charLook = function(charId, look, done)") && net.includes("msg.type === 'char-plook-ans'") && net.includes("plook: 'That look cannot be used.'"));
    // ---- the sheet's look line and the feature
    const sh = read('scripts/sheets.js'), bar = between(sh, '// [plookcheck:bar-start]', '// [plookcheck:bar-end]'), ix = read('index.html'), vt = read('scripts/vtt.js');
    check('the sheet draws a look line under its head for its player and for the GM, made of elements and text, the fonts by the list’s own names; its own name, the head’s and the HUD’s are drawn in the look',
        bar.length > 500 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(bar) && bar.includes("n.charLook(c.id, lk,") && bar.includes("if (gm) { if (lk) c.plook = lk; else delete c.plook;") && bar.includes("V.on('plook') === false")
        && sh.includes("var plB = ui('sheetPlook');") && sh.includes("head.textContent = c.name; if (window.wpPlook) window.wpPlook.dress(head, window.wpPlook.ofChar(c));") && sh.includes("if (window.wpPlook) window.wpPlook.dress(v.name, window.wpPlook.ofChar(c));")
        && ix.includes('<div id="sheetPlook" class="sheet-plook" style="display:none;"></div><div id="sheetBudgets"') && ix.includes('<script type="module" src="scripts/plook.js"></script>'));
    check('Personal looks is a VTT feature, on by default, that a player may switch off for themselves', /\{ id: 'plook', label: 'Personal looks', legacyKey: null \}/.test(vt) && !/id: 'plook'[^\n]*noLocal/.test(vt) && !/id: 'plook'[^\n]*def:/.test(vt));
    const st = read('scripts/settings.js');
    check('Settings, VTT features has its row for this campaign and for the default of new ones, named as the rows are found (set + Plook), with its words when it moves and for a player’s own switch',
        ix.includes('<div class="set-vtt-row" data-vtt="plook"') && ix.includes('id="setPlookState"') && ix.includes('id="setPlookBtn"') && ix.includes('id="setVttGlobalPlookState"') && ix.includes('id="setVttGlobalPlookBtn"')
        && /\n    plook: \['Personal looks on/.test(st) && /\n    plook: 'For you it draws every name plain/.test(st));
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exitCode = 1; summed = true; });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished its checks'); process.exitCode = 1; } });
