// setupcheck — a map's set-ups (backlog 31; the owner, 2026-11-03, by prompt: "Replace, with Undo. Restore puts the tokens, fog and lights back as
// saved, in one step the GM's Undo takes back; drawings and walls stay. The Restore window shows three ticks (tokens, fog, lights), all on by default",
// and "Map's right-click and tab (Recommended)"). setupcore.js imported and run, a file's set-ups through the real import cleaner, the wire's two
// lists, and the window's wiring. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n'), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const SU = await imp('scripts/setupcore.js'), FC = await imp('scripts/fogcore.js'), CU = await imp('scripts/cleanup.js');
    const map = () => ({ type: 'map', id: 'm1', meta: { title: 'Deck' }, fog: { on: true, mode: 'auto', cell: { grid: 'hex', len: 1 }, vision: { arc: 'all' }, manual: { adds: ['1,1'], cuts: [] } }, whiteboard: [
        { id: 'w_wall', type: 'rect', x: 0, y: 0, w: 50, h: 10, blocksSight: true },
        { id: 'w_pen', type: 'path', x: 5, y: 5, w: 20, h: 20, d: 'M0 0L1 1' },
        { id: 'w_t1', type: 'image', isChar: true, charId: 'c_a', x: 100, y: 100, w: 50, h: 50 },
        { id: 'w_t2', type: 'image', isChar: true, charId: 'c_b', x: 200, y: 100, w: 50, h: 50, light: { bright: 2, dim: 4 } },
        { id: 'w_wait', type: 'image', isChar: true, waiting: true, x: 0, y: 300, w: 50, h: 50 },
        { id: 'w_lamp', type: 'circle', x: 300, y: 300, w: 20, h: 20, light: { bright: 3, dim: 6 } }] });
    const m = map(), s = SU.takeSetup(m, '  Before\u0007 the ambush  ', 1700000000000, 'su_abc');
    check('a set-up keeps the map’s tokens with their own lights, its lights, and its fog’s on, mode, light and painted cells; never a waiting token, a wall or a drawing',
        s.id === 'su_abc' && s.name === 'Before the ambush' && s.at === 1700000000000 && J(s.toks.map(w => w.id)) === J(['w_t1', 'w_t2']) && J(s.lights.map(w => w.id)) === J(['w_lamp'])
        && J(s.fog) === J({ on: true, mode: 'auto', manual: { adds: ['1,1'], cuts: [] } }), J(s));
    m.whiteboard = m.whiteboard.filter(w => w.id !== 'w_t1').map(w => w.id === 'w_t2' ? Object.assign({}, w, { x: 999 }) : w).concat([{ id: 'w_t3', type: 'image', isChar: true, charId: 'c_c', x: 1, y: 1, w: 50, h: 50 }, { id: 'w_pen2', type: 'path', x: 9, y: 9, w: 9, h: 9, d: 'M0 0' }]).filter(w => w.id !== 'w_lamp');
    m.fog.manual = { adds: [], cuts: ['2,2'] }; m.fog.on = false;
    const r = SU.restoreSetup(m, s, { toks: true, fog: true, lights: true }), ids = r.whiteboard.map(w => w.id);
    check('a restore with every tick puts the tokens and lights back as saved, takes off tokens placed since, keeps walls, drawings and a waiting token, and the fog’s grid and sight stay the map’s',
        J(ids) === J(['w_wall', 'w_pen', 'w_wait', 'w_pen2', 'w_t1', 'w_t2', 'w_lamp']) && r.whiteboard.filter(w => w.id === 'w_t2')[0].x === 200 && r.fog.on === true && J(r.fog.manual) === J({ adds: ['1,1'], cuts: [] }) && J(r.fog.cell) === J({ grid: 'hex', len: 1 }) && J(r.fog.vision) === J({ arc: 'all' }), J([ids, r.fog]));
    const r2 = SU.restoreSetup(m, s, { toks: true, fog: false, lights: false });
    check('an unticked part stays as it is now: the fog left as it stands and the lights as they are', r2.fog === null && !r2.whiteboard.some(w => w.id === 'w_lamp') && r2.whiteboard.some(w => w.id === 'w_t1'), J(r2.whiteboard.map(w => w.id)));
    const r3 = SU.restoreSetup(m, s, { toks: false, fog: true, lights: true });
    check('tokens unticked keep the tokens as they stand now', r3.whiteboard.some(w => w.id === 'w_t3') && !r3.whiteboard.some(w => w.id === 'w_t1') && r3.whiteboard.filter(w => w.id === 'w_t2')[0].x === 999);
    const cl = SU.cleanSetups([s, s, { id: 'bad', name: 'x' }, { id: 'su_two', name: '', toks: [{ id: 'a', isChar: false }, { id: 'b', isChar: true }, 'junk'], lights: [{ id: 'l', light: {} }, { id: 'lt', isChar: true, light: {} }], fog: { on: true, mode: 'manual', manual: { adds: ['bad cell'], cuts: [] } } }, 'junk'], FC.cleanFog);
    check('a map’s set-ups as data: an id once by its pattern, a name, a token only a character’s piece and a light only a piece that is no token, the fog through the fog’s own cleaner', cl && cl.length === 2 && cl[1].name === 'Set-up' && J(cl[1].toks.map(w => w.id)) === J(['b']) && J(cl[1].lights.map(w => w.id)) === J(['l']) && cl[1].fog.on === true && cl[1].fog.mode === FC.cleanFog({ mode: 'manual' }).mode && J(cl[1].fog.manual.adds) === J([]) && SU.cleanSetups([], FC.cleanFog) === null && SU.cleanSetups('x') === null, J(cl));
    check('twenty set-ups a map at most, and a new id never one the map holds', SU.cleanSetups(Array.from({ length: 40 }, (x, i) => ({ id: 'su_' + i, name: 'S' + i })), FC.cleanFog).length === SU.SETUP_MAX && /^su_[a-z0-9]{1,16}$/.test(SU.newId([s])) && SU.newId([s]) !== 'su_abc');
    // a file's set-ups through the real import cleaner: each piece cleaned as a piece of a map from a file is
    const ic = { items: { m1: { type: 'map', id: 'm1', meta: { title: 'Deck', setups: [{ id: 'su_f', name: 'From a file', toks: [{ id: 'w_x', type: 'image', isChar: true, charId: 'c_a', x: 1, y: 1, w: 50, h: 50, waiting: true }, { id: 'w_y', type: 'image', isChar: true, charId: 'c_a', x: 1, y: 1, w: 50, h: 50, light: { bright: 'x' } }], lights: [], fog: { on: 1, mode: 'zzz' } }, { id: 'nope' }] }, whiteboard: [] } } };
    CU.cleanImportItems(ic, { FC: FC, SU: SU });
    const fs1 = ic.items.m1.meta.setups;
    check('a file’s set-ups are cleaned by the import’s own piece cleaners: a waiting token never comes in, a token’s light as the app reads one, the fog as a map’s fog', Array.isArray(fs1) && fs1.length === 1 && J(fs1[0].toks.map(w => w.id)) === J(['w_y']) && fs1[0].fog.on === false && fs1[0].fog.mode === 'auto', J(fs1));
    const ic2 = { items: { m1: { type: 'map', id: 'm1', meta: { setups: [{ id: 'su_f', name: 'x' }] }, whiteboard: [] } } }; CU.cleanImportItems(ic2, { FC: FC });
    check('with no cleaner at hand a file’s set-ups are dropped', ic2.items.m1.meta.setups === undefined);
    // encounter groups (fold 2)
    const gToks = [{ id: 'a', isChar: true, charId: 'c_r', x: 100, y: 200, w: 50, h: 50 }, { id: 'b', isChar: true, charId: 'c_v', x: 160, y: 260, w: 50, h: 50 }, { id: 'c', isChar: true, waiting: true, x: 0, y: 0 }, { id: 'd', type: 'rect', x: 0, y: 0 }];
    const g = SU.takeGroup(gToks, ' Raiders ', 5, 'gr_one');
    check('a group keeps the character tokens laid out from its top left corner, never a waiting token or another piece', g && g.name === 'Raiders' && J(g.pieces.map(p => [p.id, p.dx, p.dy, p.x])) === J([['a', 0, 0, undefined], ['b', 60, 60, undefined]]) && SU.takeGroup([{ id: 'x', type: 'rect', x: 0, y: 0 }], 'n', 1, 'gr_x') === null, J(g));
    check('groups as data: an id once, a name, the pieces that are character tokens with a place', J(SU.cleanGroups([g, g, { id: 'nope' }, { id: 'gr_e', pieces: [{ isChar: true }] }]).map(x => x.id)) === J(['gr_one']) && SU.cleanGroups([]) === null);
    check('a fresh sheet is named on from the highest number of its name, and its own name counts as one', SU.nextName('Raider 3', ['Raider 1', 'Raider 9', 'raider 4', 'Raider', 'Ava']) === 'Raider 10' && SU.nextName('Hound', ['Hound']) === 'Hound 2' && SU.nextName('Kael', []) === 'Kael 1');
    check('a drop copies an NPC\u2019s sheet and keeps a player\u2019s character and a Unique NPC on the one sheet', SU.groupSheetWay({ npc: true }) === 'copy' && SU.groupSheetWay({ npc: true, unique: true }) === 'keep' && SU.groupSheetWay({ npc: false, ownerId: 'u_a' }) === 'keep' && SU.groupSheetWay(null) === 'keep');
    const wbS = read('scripts/whiteboard.js'), chS = read('scripts/charlist.js'), shS = read('scripts/sheets.js'), scS = read('scripts/systemcore.js');
    check('the map\u2019s right-click saves a group, the Image Library places it and its x deletes it, an NPC\u2019s menu ticks Unique, the host keeps the tick, and the groups never leave the GM\u2019s machine', wbS.includes("else if (action.includes('cm-encounter-save')) {") && wbS.includes("(showGroups ? groupsLibraryHtml(filter) : '') + (grid.dataset.cast ? castLibraryHtml(filter)") && wbS.includes("if (gcell) { var gidC = gcell.dataset.gid;") && chS.includes("if (unique === true || unique === false) rows.push({ act: 'unique', text: 'Unique', tick: unique });") && shS.includes('function uniqueToggle(id) {') && scS.includes("if (opts && opts.state === 'host' && c.unique === true && out.npc) out.unique = true;") && read('scripts/net.js').includes('delete camp.pinnedPages; delete camp.groups;'));
    // the wire, the window and the words
    const nt = read('scripts/net.js'), su = read('scripts/setups.js'), ix = read('index.html');
    check('a map’s set-ups never leave the GM’s machine: both lists of a map’s GM-only meta keys name them', nt.split("['gen', 'city', 'world', 'env', 'envCells', 'scenePage', 'setups', 'tags']").length === 3);
    check('the window draws with text nodes alone and is the GM’s on the machine that owns the campaign', !/innerHTML|insertAdjacentHTML|outerHTML/.test(su) && su.includes("function suMay() { var n = window.wpNet; return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !(n && n.active && n.role === 'client') && !window.wpStream; }") && su.includes("m.whiteboard = r.whiteboard; if (r.fog) m.fog = r.fog; save();"));
    check('Set-ups... is on the map’s right-click menu, its row in the left panel and a right-click on its tab, and Escape closes the window', ix.includes('id="ctxSetups"') && ix.includes('<div id="setupModal" class="trade-modal setup-modal"') && read('scripts/whiteboard.js').includes("else if (act === 'setups') { var suM = getActiveMap(); if (suM && window.wpSetups) window.wpSetups.open(suM.id); }") && su.includes("tabs.addEventListener('contextmenu'") && read('scripts/esckey.js').includes("['setupModal', 'setupClose']"));
    check('Help, both notes and CI say it', ix.includes('A map keeps <b>set-ups</b>') && readRoot('WHATSNEW.txt').includes('- A map keeps set-ups') && readRoot('WHATSNEW.txt').includes('- Encounter groups:') && ix.includes('Save as an encounter group&hellip;') && read('assets/whatsnew.txt').includes('- A map keeps set-ups') && readRoot('.github/workflows/checks.yml').includes('run: node tools/setupcheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
