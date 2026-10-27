/* Offline check of a scene (backlog 181; the owner, 2026-10-27, by prompt on the mock-up sheet: the player sees "A window", each player closes
   it while the GM has Close for everyone and Show it again and may keep it up until they close it, Show as a scene... in four places, and
   the picture under a spotlight). A scene is a picture handout shown big. The GM's box (scene.js) is sliced by its [scenecheck:core-*]
   markers; the player's side (handouts.js) by its [scenecheck:in-*] and [scenecheck:look-*] markers and run on a page of plain objects;
   the wire (net.js) by its [netcheck:scenekeys-*] and [netcheck:sceneclose-*] markers; the pill (pills.js) by its [lookcheck:pills-*]
   markers. The page, the four entry points, Escape, Help and both release notes are pinned. No browser, no network.
   Usage: node tools/scenecheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const read = f => fs.readFileSync(path.join(app, f), 'latin1').replace(/\r\n/g, NL);
const readU = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const readRoot = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 1500) : '')); } }
function slice(src, tag) {
    const a = src.indexOf('// [' + tag + '-start]'), b = src.indexOf('// [' + tag + '-end]');
    if (a < 0 || b < a) throw new Error('no slice ' + tag);
    return src.slice(src.indexOf(NL, a) + 1, b);
}
const count = (s, t) => s.split(t).length - 1;

const sceneJs = readU('scripts/scene.js'), hoJs = readU('scripts/handouts.js'), netJs = read('scripts/net.js'), pillsJs = readU('scripts/pills.js');
const ix = readU('index.html'), css = readU('style.css'), wb = readU('scripts/whiteboard.js'), pl = readU('scripts/planner.js'), esc = readU('scripts/esckey.js');
const SPOT = 'M5 9.5h14v10H5zM5 17l4-3.5 3 2.5 2-1.5 5 3.5M12 2.5v3.5M7 4l1.5 2.5M17 4l-1.5 2.5';

/* ================= the GM's box: who it goes to ================= */
{
    let T = null, err = '';
    try { T = new Function(slice(sceneJs, 'scenecheck:core') + '\nreturn { sceneAudience, scenePids, sceneWho, sceneForm };')(); } catch (e) { err = String(e); }
    let r = '';
    if (T) {
        const ros = { a: { id: 'u_2', name: 'Mara' }, b: { id: 'u_1', name: ' Kael ' }, c: null, d: { name: 'no id' }, e: { id: 'u_2', name: 'Mara again' }, f: { id: 'u_3', name: '' }, g: { id: 7, name: 'x' } };
        const aud = T.sceneAudience(ros);
        r = j([aud, T.sceneAudience(null), T.sceneAudience(JSON.parse('{"__proto__":{"id":"u_9","name":"P"}}')),
            T.scenePids([], aud), T.scenePids(['u_1'], aud), T.scenePids(['u_1', 'u_1', 'u_9'], aud), T.scenePids(['u_1', 'u_2', 'u_3'], aud), T.scenePids('u_1', aud), T.scenePids(['u_9'], aud),
            T.sceneWho(null, aud), T.sceneWho(['u_1', 'u_3'], aud), T.sceneWho(['u_9'], aud),
            T.sceneForm({ title: '  The Gate  ', caption: 'c'.repeat(5000), hold: true, keep: false }).caption.length, T.sceneForm({ title: 'x'.repeat(200), hold: 'yes', keep: 0 }), T.sceneForm(null)]);
    }
    check('the box (scene.js, run for real): the players a scene can go to are those connected with an id, each once, by name, a blank name "A player"; ticking none, or every one, is everyone; a pick keeps only players still there, each once; who it shows to in words; the form cleaned, a title trimmed and cut to 120 and a caption to 4000, hold only as true and keep unless false',
        !err && r === j([[{ id: 'u_3', name: 'A player' }, { id: 'u_1', name: 'Kael' }, { id: 'u_2', name: 'Mara' }], [], [{ id: 'u_9', name: 'P' }],
            null, ['u_1'], ['u_1'], null, null, null,
            'everyone', 'A player, Kael', 'nobody connected',
            4000, { title: 'x'.repeat(120), caption: '', hold: false, keep: true }, { title: '', caption: '', hold: false, keep: true }]), err || r);
}

/* ================= the player's side: what a message says, and the window ================= */
{
    let T = null, err = '';
    const page = {}, mk = id => { const cls = new Set(); const el = { id, style: { display: 'none' }, dataset: {}, hidden: false, classList: { toggle: (c, v) => { if (v) cls.add(c); else cls.delete(c); }, contains: c => cls.has(c) }, cls }; page[id] = el; return el; };
    const m = mk('handoutModal'), x = mk('handoutCloseBtn'), revoked = [], logged = [];
    const doc = { getElementById: id => page[id] || null };
    try {
        T = new Function('document', 'window', 'URL', 'Blob', 'showHandout', 'safeId', 'ui', 'setInterval', 'clearInterval',
            slice(hoJs, 'scenecheck:in') + slice(hoJs, 'scenecheck:look') + '\nreturn { sceneIn, sceneBegin, sceneLive, sceneEnd, sceneLook, sceneClosed, sceneShow, viewerShut, sceneBlob };')(
            doc, { wpStepLog: (a, s, f) => logged.push(a + ' ' + s + ' ' + j(f)), wpNet: null }, { createObjectURL: () => 'blob:x1', revokeObjectURL: u => revoked.push(u) }, function Blob(p, o) { this.o = o; },
            h => { m.style.display = 'flex'; T.sceneLook(m, h); }, s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), id => page[id] || null, () => 1, () => {});
    } catch (e) { err = String(e); }
    let r = '';
    if (T) {
        const I = T.sceneIn;
        r = j([I({ scene: true }), I({ scene: true, hold: true, nokeep: true }), I({ scene: 'yes', hold: true }), I({ scene: true, hold: 1, nokeep: 'yes' }),
            I({ scene: true, kind: 'text', hold: true }), I({ scene: true, sharedBy: 'Mara', hold: true }), I({ scene: true, replay: true }), I(null), I('x')]);
    }
    check('what a handout says of a scene (handouts.js sceneIn, run for real): a scene only as true and only on the GM\'s own picture (never a text, a page a player shared or a reconnect\'s quiet replay), held only as true, kept unless nokeep is true; anything else a plain handout, kept',
        !err && r === j([{ scene: true, hold: false, keep: true }, { scene: true, hold: true, keep: false }, { scene: false, hold: false, keep: true }, { scene: true, hold: false, keep: true },
            { scene: false, hold: false, keep: true }, { scene: false, hold: false, keep: true }, { scene: false, hold: false, keep: true }, { scene: false, hold: false, keep: true }, { scene: false, hold: false, keep: true }]), err || r);
    let w = '';
    if (T) {
        const g1 = T.sceneBegin('h1'), g2 = T.sceneBegin('h1'), live = [T.sceneLive('h1', g1), T.sceneLive('h1', g2)];
        T.sceneShow({ title: 'Gate', scene: true, hold: true, sceneId: 'h1', src: '/saves/images/g.png' });
        const held = [m.style.display, m.cls.has('handout-scene'), m.dataset.scene, m.dataset.hold, x.hidden];
        const closedOther = T.sceneClosed('h2'), stillUp = m.style.display;
        const closed = T.sceneClosed('h1'), after = [m.style.display, m.cls.has('handout-scene'), m.dataset.scene, m.dataset.hold, x.hidden, T.sceneLive('h1', g2)];
        const g3 = T.sceneBegin('h3'), early = T.sceneClosed('h3'), lateLive = T.sceneLive('h3', g3);   // a close before the picture is shown: it never comes up
        T.sceneShow({ title: 'Plain', scene: true, sceneId: 'h4', src: T.sceneBlob(new Uint8Array(1), 'image/png') });
        const plainHold = [m.dataset.hold, x.hidden];
        T.sceneLook(m, { title: 'A handout', src: '/saves/images/journal/a.png' });   // another picture takes the scene's place: the memory of the one not kept goes
        const other = [m.cls.has('handout-scene'), m.dataset.scene, revoked];
        w = j([live, held, closedOther, stillUp, closed, after, early, lateLive, plainHold, other, T.sceneClosed('<b>'), logged.length]);
    }
    check('the window (handouts.js sceneLook, sceneClosed and sceneShow, run for real on a page of plain objects): a scene wears handout-scene and names its id; one held up hides the close; the GM\'s close puts away the scene it names and no other, and lets the window be drawn as before; a close that lands while the picture is still on its way keeps it from ever coming up, as does a newer showing of the same scene; one not held keeps its close; another picture taking its place lets go of the memory a scene not kept was shown from; each scene shown is a line of the step log',
        !err && w === j([[false, true], ['flex', true, 'h1', '1', true], false, 'flex', true, ['none', false, '', '', false, false], false, false, ['', false], [false, '', ['blob:x1']], false, 2]), err || w);
    check('a scene held up takes no Escape and no press of the close (the close\'s own handler refuses while held, and Escape presses that button), Add notes is not offered on it, and it closes by itself once this app is no longer at the GM\'s table (pinned)',
        hoJs.includes("if (_hClose) _hClose.addEventListener('click', function() { var m = ui('handoutModal'); if (m.dataset.hold === '1') return; var sid = m.dataset.scene || ''; viewerShut(m); if (sid && window.wpNet && typeof window.wpNet.sceneShut === 'function') window.wpNet.sceneShut(sid); });")
        && hoJs.includes("ui('handoutFresh').style.display = h.fresh && !h.hold ? 'flex' : 'none';") && hoJs.includes("if (!(n && n.active && n.foreign)) { viewerShut(m); clearInterval(_sceneTimer); _sceneTimer = null; }")
        && count(esc, "['handoutModal', 'handoutCloseBtn']") === 1);
    check('a scene always opens, whatever the player set for handouts; one kept is saved as any handout and opens with its Journal entry; one not kept is shown from memory and writes nothing (pinned)',
        hoJs.includes("if (sc.scene) { if (sceneLive(id, sg)) sceneShow({ title: title, caption: caption, src: src, fresh: true, entry: { campId: campId, id: shownId }, from: cameFrom(msg), scene: true, hold: sc.hold, sceneId: id }); return; }")
        && hoJs.includes("    if (sc.scene && !sc.keep) {   // a scene the GM keeps out of the Journals: shown from this machine's memory alone, nothing written\n        if (!sceneLive(id, sg)) return;\n        sceneShow({ title: title, caption: caption, src: sceneBlob(bytes, mime), scene: true, hold: sc.hold, sceneId: id, from: cameFrom(msg) });\n        return;\n    }")
        && hoJs.indexOf('var kind = picKind(bytes); if (!kind) return;') < hoJs.indexOf('if (sc.scene && !sc.keep)'));
}

/* ================= the wire ================= */
{
    let K = null, err = '';
    try { K = new Function(slice(netJs, 'netcheck:scenekeys') + '\nreturn sceneKeys;')(); } catch (e) { err = String(e); }
    const r = K ? j([K({ scene: true }), K({ scene: true, hold: true, keep: false }), K({ scene: true, hold: 'yes', keep: 0 }), K({ scene: true }, 'text'), K({ hold: true }), K(null), K({ scene: 1 })]) : '';
    check('a scene\'s keys on a handout (net.js sceneKeys, run for real): scene, then hold only as true and nokeep only where keep is false; none for a text handout or without the scene\'s word',
        !err && r === j([{ scene: true }, { scene: true, hold: true, nokeep: true }, { scene: true }, null, null, null, null]), err || r);
    check('the host sends them on the picture handout, records no reveal for a scene kept out of the Journals (so nothing comes back on a reconnect), says it was shown as a scene, and logs the step (pinned)',
        netJs.includes("net.revealHandout = function(hid, pids, o) {") && netJs.includes("var sk = sceneKeys(o, h.kind);")
        && netJs.includes("tags: (h.tags || []).slice(0, 8) }, sk || {})); } catch (e) { sendFailed(e, 'handout'); return; }   // refused: not recorded as shown\n            if (sk && sk.nokeep) return;")
        && netJs.includes("shown' + (sk ? ' as a scene' : '') + ' to '") && netJs.includes("window.wpStepLog('scene v1', 'shown',"));
    // the client's branch for the GM's close, run with stubs
    let br = '';
    try {
        const body = slice(netJs, 'netcheck:sceneclose');
        const run = (st) => { const got = []; new Function('net', 'conn', 'msg', 'state', 'window', body)(st.net, st.conn, st.msg, { appState: { activeCampaignId: 'c1' } }, { wpSceneClosed: id => got.push(id) }); return got; };
        const ok = { net: { foreign: true, syncedPeer: 'P', stream: false, gmId: 'g1' }, conn: { peer: 'P' }, msg: { type: 'scene-close', campId: 'c1', gmId: 'g1', id: 'h1' } };
        const but = (o, m) => ({ net: Object.assign({}, ok.net, o || {}), conn: ok.conn, msg: Object.assign({}, ok.msg, m || {}) });
        br = j([run(ok), run(Object.assign({}, ok, { conn: { peer: 'Q' } })), run(but({ foreign: false })), run(but({ stream: true })), run(but({ gmId: '' })), run(but(null, { campId: 'c2' })), run(but(null, { gmId: 'g2' })),
            run(but(null, { id: 7 })), run(but(null, { id: 'x'.repeat(81) }))]);
    } catch (e) { br = String(e); }
    check('a player\'s app takes the GM\'s close (the client\'s scene-close branch, run for real) only from the synced host after its snapshot, never in the stream window, only for the table played (its campaign and its GM) and only an id of text, 80 at most; the host has no branch for it',
        br === j([['h1'], [], [], [], [], [], [], [], []]) && !/msg\.type === 'scene-close' && net\.role === 'host'/.test(netJs), br);
    check('Close for everyone (net.sceneClose) tells each connected player of the audience the scene\'s id with the campaign and the GM, on the host alone, and logs the step (pinned)',
        netJs.includes("net.sceneClose = function(hid, pids) {\n    if (!net.active || net.role !== 'host' || typeof hid !== 'string' || !hid) return 0;")
        && netJs.includes("try { c.send({ type: 'scene-close', campId: camp.id, gmId: getProfile().id, id: hid }); n++; } catch (e) { sendFailed(e, 'scene'); }"));
}

/* ================= the pill ================= */
{
    let T = null, err = '';
    try { T = new Function(slice(pillsJs, 'lookcheck:pills') + '\nreturn { pillsModel, pillsState, pillPress, PILLS };')(); } catch (e) { err = String(e); }
    let r = '';
    if (T) {
        const M = st => { const m = T.pillsModel(st); return m.scenePill ? m.scenePill.text + '|' + m.scenePill.tip : null; };
        const opened = [];
        r = j([M({ gm: true, hosting: true, scene: { title: 'The Sunken Gate', who: 'everyone' } }), M({ gm: true, hosting: true, scene: { title: '', who: '', hold: true } }), M({ gm: true, hosting: false, scene: { title: 'x' } }),
            M({ gm: false, hosting: true, scene: { title: 'x' } }), M({ gm: true, hosting: true, scene: 'x' }),
            T.pillsState({ wpNet: { active: true, role: 'host', roster: {} }, wpScene: { now: () => ({ title: 'G' }) } }, null, 'data', null).scene, T.pillsState({ wpScene: { now: () => ({ title: 'G' }) } }, null, 'data', null).scene,
            T.pillPress('scenePill', { getElementById: () => null }, { wpScene: { open: a => opened.push(a === undefined) } }, null), T.pillPress('scenePill', { getElementById: () => null }, {}, null), opened, T.PILLS.indexOf('scenePill') === T.PILLS.indexOf('trialPill') - 1]);
    }
    check('the Scene pill (pills.js, run for real): while hosting a scene that is up, on the GM\'s screen alone, it says Scene and its title, a blank title "a picture", and in its tooltip to whom and whether it stays up; its state comes from scene.js; a press opens the box with no picture, so it shows Show it again and Close for everyone; it stands before Trial run',
        !err && r === j(['Scene · The Sunken Gate|Showing The Sunken Gate to everyone. Press to show it again or close it for everyone.', 'Scene · a picture|Showing a picture to the table. It stays up until you close it. Press to show it again or close it for everyone.', null, null, null,
            { title: 'G' }, null, 'scene', '', [true], true]), err || r);
}

/* ================= the page ================= */
check('the box as the page has it: a dialog of the generators\' look with the spotlight drawing, its close, the part for the scene that is up (Show it again, Close for everyone), and the form (the picture, Title, Caption, Show to, Keep it in their Journals ticked, Stays up until I close it unticked, a line that says why Show is off, Cancel and Show); the pill with the same drawing; scene.js loaded after handouts.js; Escape presses its close',
    count(ix, '<div id="sceneModal" class="gen-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="sceneHead">') === 1 && count(ix, SPOT) >= 3
    && ['sceneCloseBtn', 'sceneNow', 'sceneAgain', 'sceneEnd', 'sceneForm', 'scenePic', 'sceneTitleIn', 'sceneCapIn', 'sceneWhoSeg', 'sceneKeep', 'sceneHold', 'sceneSays', 'sceneCancel', 'sceneGo', 'scenePill', 'imgLibPreviewScene'].every(id => count(ix, 'id="' + id + '"') === 1)
    && ix.includes('<input type="checkbox" id="sceneKeep" checked> Keep it in their Journals') && ix.includes('<input type="checkbox" id="sceneHold"> Stays up until I close it')
    && count(ix, '<script type="module" src="scripts/handouts.js"></script>\n<script type="module" src="scripts/scene.js"></script>\n') === 1
    && count(esc, "['sceneModal', 'sceneCloseBtn']") === 1);
check('the box draws names as text (the chips made by createElement with textContent, the title, the file\'s name and who it shows to set as text), keeps the page\'s own keys and paste from what is typed in it, and Show is off where no table is hosted or nobody is connected (pinned)',
    !/innerHTML/.test(sceneJs) && sceneJs.includes("b.dataset.who = id; b.textContent = label; box.appendChild(b);") && sceneJs.includes("m.addEventListener('keydown', function(e) { if (e.key !== 'Escape') e.stopPropagation(); });")
    && sceneJs.includes("var aud = sceneAudience(net && net.roster), why = !hosting() ? 'Host a table to show a scene. Players see it only while they are at your table.' : !aud.length ? 'Nobody is connected yet.' : '';"));
check('the four places that offer it: the map\'s right-click menu for one picture or token (its own picture, else its character\'s portrait, never a web address, an inline picture or a waiting token), the Image Library\'s right-click menu and its preview (never a cast face or while it picks for another tool), a picture handout\'s Show as a scene, and a planner\'s picture block; the menu\'s drawing takes no press of its own',
    wb.includes("if (isWb && selectedIds.length === 1 && sceneSrcOf(firstItem) && window.wpScene) html += '<div class=\"menu-item cm-scene-show\"") && wb.includes("} else if (action.includes('cm-scene-show')) {")
    && wb.includes("if (!w || typeof w !== 'object' || w.type !== 'image' || w.waiting) return '';") && wb.includes("if (act === 'scene') { if (!menu.dataset.multi && window.wpScene) window.wpScene.open(src); return; }")
    && wb.includes("if (src && !pv.dataset.cid && window.wpScene) window.wpScene.open(src);") && wb.includes("if (scBtnC) scBtnC.style.display = 'none';")
    && hoJs.includes("else if (b.dataset.act === 'scene') { if (window.wpScene && h.kind !== 'text') window.wpScene.open(h.src, { title: h.title, caption: h.caption, hid: h.id }); }")
    && pl.includes("'<button class=\"tool ghost b-img-scene\" data-idx=\"'") && css.includes('#contextMenu .menu-item .ico { pointer-events: none;')
    && !/cm-(del|back|vis|lock|group|sheet|frame)/.test('cm-scene-show'));
check('the handout a scene is saved as (handouts.js wpHandoutFor): the one named, else this campaign\'s picture handout of that picture, else a new one, with the title and caption typed; never for a picture that is no picture of the app\'s own (pinned)',
    hoJs.includes("var camp = getActiveCampaign(), p = picRef(src); if (!camp || !p) return '';") && hoJs.includes("if (!h) h = Object.keys(hs).map(function(k) { return hs[k]; }).find(function(x) { return x && x.kind !== 'text' && x.src === src; }) || null;"));
{
    const help = ix.slice(ix.indexOf('<li><b>Scenes:</b>'), ix.indexOf('<li><b>Party strip:</b>'));
    const notes = [readRoot('WHATSNEW.txt'), readU('assets/whatsnew.txt')];
    check('Help has a Scenes entry beside Handouts with the spotlight drawing: where it is offered, hosting a table, Keep it in their Journals, Stays up until I close it, the Scene pill with Show it again and Close for everyone, and that the stream window does not show it; both release notes say it',
        help.length > 200 && help.includes(SPOT) && help.includes('<b>Show as a scene…</b>') && help.includes('<b>Keep it in their Journals</b>') && help.includes('<b>Stays up until I close it</b>')
        && help.includes('<b>Show it again</b>') && help.includes('<b>Close for everyone</b>') && help.includes('It also says who has closed it.') && help.includes('The stream window shows a scene you show to everyone, until you close it.') && help.includes('or a picture in a planner or a page you are reading.')
        && notes.every(n => n.includes('Scenes\n- Show as a scene... puts a picture big on your players\' screens, with no') && n.includes('Close for everyone, and says who has closed it.') && n.includes('- A scene shown to everyone shows in the stream window too.')));
}

/* ================= the three gaps: who closed it, the stream window, a picture where a page is read ================= */
{
    let T = null, err = '';
    try { T = new Function('picRef', slice(sceneJs, 'scenecheck:core') + slice(sceneJs, 'scenecheck:readpic') + '\nreturn { sceneShut, sceneStage, readPicSrc };')(v => (typeof v === 'string' && !/^[a-z]+:/i.test(v) ? v : '')); } catch (e) { err = String(e); }
    let r = '';
    if (T) {
        const img = (src, inRead) => ({ tagName: 'IMG', getAttribute: () => src, closest: s => (inRead && s === '#plannerPreview, #docPanelBody' ? {} : null) });
        r = j([T.sceneShut([]), T.sceneShut(['Pat']), T.sceneShut(['Pat', 'Pat', 'Kael']), T.sceneShut(['A', 'B', 'C', 'D', 'E']), T.sceneShut([7, '', null]), T.sceneShut('Pat'),
            T.sceneStage({ src: '/saves/images/g.png', title: 'Gate', caption: 'c', pids: null }), T.sceneStage({ src: '/saves/images/g.png', title: 'Gate', pids: ['u_1'] }), T.sceneStage(null), T.sceneStage({ src: '', pids: null }), T.sceneStage({ src: '/saves/images/g.png', title: 'x'.repeat(200), pids: null }).title.length,
            T.readPicSrc(img('/saves/images/a%20b.png', true)), T.readPicSrc(img('/saves/images/a.png', false)), T.readPicSrc(img('https://x.test/a.png', true)), T.readPicSrc(img('/saves/sounds/a.png', true)), T.readPicSrc(img('%E0%A4%A', true)), T.readPicSrc({ tagName: 'DIV', closest: () => ({}), getAttribute: () => '/saves/images/a.png' }), T.readPicSrc(null)]);
    }
    check('who closed it (sceneShut), what the stream window is told (sceneStage) and a picture where a page is read (readPicSrc), scene.js run for real: the names of those who closed it, each once, three and then how many more; the stream window is told a scene only while it shows to everyone, as its path, title and caption, cut; a right-click offers it only on a picture in the planner\'s own view or the page panel, and only a picture of the campaign\'s own, decoded as it was drawn',
        !err && r === j(['', 'Pat closed it.', 'Pat, Kael have closed it.', 'A, B, C and 2 more have closed it.', '', '',
            { src: '/saves/images/g.png', title: 'Gate', caption: 'c' }, null, null, null, 120,
            '/saves/images/a b.png', '', '', '', '', '', '']), err || r);
    let st = '';
    try {
        const A = new Function(slice(read('scripts/stream.js'), 'scenecheck:stream') + '\nreturn streamSceneApply;')();
        const mk = () => { const at = {}; return { style: { display: 'none' }, textContent: '', setAttribute: (k, v) => { at[k] = v; }, removeAttribute: k => { delete at[k]; }, at }; };
        const box = mk(), img = mk(), t = mk(), c = mk();
        const run = d => { const ok = A(d, box, img, t, c); return [ok, box.style.display, img.at.src || '', t.textContent, c.textContent]; };
        st = j([run({ scene: { src: '/saves/images/a b.png', title: '<b>Gate</b>', caption: 'Up' } }), run({ scene: null }), run({ scene: { src: '/saves/images/../data.json', title: 'x' } }), run({ scene: { src: 'https://x.test/a.png' } }), run({ scene: { src: '/saves/images/a.png', title: 7 } }), run(null)]);
    } catch (e) { st = String(e); }
    check('the stream window (stream.js streamSceneApply, run for real on a page of plain objects): a scene the main window says is shown to everyone stands over the map with its title and caption as text; none, a path that walks out, a web address or anything that is no scene takes it down; what is no text is no words',
        st === j([[true, '', '/saves/images/a%20b.png', '<b>Gate</b>', 'Up'], [false, 'none', '', '', ''], [false, 'none', '', '', ''], [false, 'none', '', '', ''], [true, '', '/saves/images/a.png', '', ''], [false, 'none', '', '', '']]), st);
    let hb = '';
    try {
        const body = slice(netJs, 'netcheck:sceneclosed');
        const run = (ros, msg, ok) => { const got = []; new Function('net', 'conn', 'msg', 'allow', 'window', body)({ roster: ros }, { peer: 'P' }, msg, () => ok !== false, { wpScene: { seen: (id, name, hid) => got.push([id, name, hid]) } }); return got; };
        hb = j([run({ P: { id: 'u_1', name: 'Pat' } }, { id: 'h1' }), run({}, { id: 'h1' }), run({ P: { id: 'u_1', name: 'Pat' } }, { id: 7 }), run({ P: { id: 'u_1', name: 'Pat' } }, { id: 'x'.repeat(81) }), run({ P: { id: 'u_1', name: 'Pat' } }, { id: 'h1' }, false), run({ P: { id: 'u_1' } }, { id: 'h1' })]);
    } catch (e) { hb = String(e); }
    check('the host\'s scene-closed branch (net.js, run for real): an admitted player\'s word that they closed a scene goes to scene.js by their id and name with the scene\'s id; nothing from a connection that is not admitted, an id that is no text or longer than 80, or past the limiter; a nameless player is A player',
        hb === j([[['u_1', 'Pat', 'h1']], [], [], [], [], [['u_1', 'A player', 'h1']]]), hb);
    check('a player\'s app says so only for a scene it closed by its own press, only at a table it has joined, and only the scene\'s id; the pill and the box say it; a press of Show it again forgets who closed it (pinned)',
        netJs.includes("net.sceneShut = function(id) {\n    if (!net.active || net.role !== 'client' || !net.foreign || typeof id !== 'string' || !id || id.length > 80) return false;")
        && netJs.includes("try { c.send({ type: 'scene-closed', id: id }); return true; } catch (e) { return false; }")
        && pillsJs.includes("(typeof st.scene.shut === 'string' && st.scene.shut ? ' ' + st.scene.shut : '')") && sceneJs.includes('function again() { var n = now(); if (!n) return; n.shut = [];')
        && sceneJs.includes("if (!_chan || window.wpStream) return;") && count(esc, "'charMenu', 'sceneMenu']") === 1 && count(ix, '<div id="sceneMenu" class="shape-menu" role="menu"') === 1 && count(ix, '<div id="streamScene" style="display:none;">') === 1);
}
console.log(NL + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
