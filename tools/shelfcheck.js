/* Offline check of pages in a session (system/app/scripts/pageshelf.js, 1.5.4, backlog 125).
   The owner, 2026-10-05: a planner is hard to find from the tree in a session; a plain click or Enter on the play map opens a page over
   the map, Ctrl a window of its own, Alt the page itself; and a planner must always open in a separate window of its own.
   The module's slices and quick-jump's rule (main.js) are run for real on plain objects; the wiring is pinned by its text. No browser.
   Usage: node tools/shelfcheck.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', 'system', 'app'), root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 900) : ''); } }
const sliceOf = (src, n) => { const a = src.indexOf('// [shelfcheck:' + n + '-start]'), z = src.indexOf('// [shelfcheck:' + n + '-end]'); if (a < 0 || z < a) throw new Error('shelfcheck: the ' + n + ' slice is not marked'); return src.slice(a, z); };
const count = (s, f) => s.split(f).length - 1;

const ps = read('scripts/pageshelf.js'), mainS = read('scripts/main.js'), wb = read('scripts/whiteboard.js'), ix = read('index.html'), css = read('style.css');
const waySrc = sliceOf(ps, 'way'), openSrc = sliceOf(ps, 'open');
const W = new Function(waySrc + '\nreturn { way: pageWay, pageOf: pageOf };')();

/* ---------- where a page opens ---------- */
{
    const none = {}, ctrl = { ctrlKey: true }, cmd = { metaKey: true }, alt = { altKey: true }, shift = { shiftKey: true };
    const row = v => [W.way(v, none), W.way(v, ctrl), W.way(v, cmd), W.way(v, alt), W.way(v, shift), W.way(v, null), W.way(v)];
    check('on the play map a plain click or Enter opens a page over the map; Ctrl, or the command key, a window of its own; Alt the page itself; Shift the panel',
        J(row('play')) === J(['panel', 'window', 'window', 'go', 'panel', 'panel', 'panel']), J(row('play')));
    check('on any other view a plain click or Enter goes to the page, as it always did, and the keys ask for the same three things: the data map, a page, and where no view is on screen',
        ['data', 'page', '', undefined, 'anything'].every(v => J(row(v)) === J(['go', 'window', 'window', 'go', 'panel', 'go', 'go'])), J(['data', 'page', ''].map(row)));
    check('the keys are read in one order: Ctrl before Alt before Shift, so Ctrl with anything is a window and Alt with Shift is the page itself',
        W.way('play', { ctrlKey: true, altKey: true, shiftKey: true }) === 'window' && W.way('page', { ctrlKey: true, altKey: true }) === 'window' && W.way('play', { altKey: true, shiftKey: true }) === 'go' && W.way('data', { metaKey: true, shiftKey: true }) === 'window');
    const proto = Object.create({ inherited: { type: 'planner' } }); proto.p1 = { type: 'planner' }; proto.d1 = { type: 'doc' }; proto.m1 = { type: 'map' }; proto.x = null;
    proto['7'] = { type: 'doc' }; proto['undefined'] = { type: 'planner' };   // a list that holds such keys: a number or nothing still names no page
    const camp = { items: proto };
    check('a page is a planner or a handbook page of the campaign, found by its own id: a map is none, an id the list only inherits is none, and an id that is no text is none',
        W.pageOf(camp, 'p1') === proto.p1 && W.pageOf(camp, 'd1') === proto.d1 && W.pageOf(camp, 'm1') === null && W.pageOf(camp, 'x') === null && W.pageOf(camp, 'inherited') === null && W.pageOf(camp, 'toString') === null && W.pageOf(camp, '__proto__') === null
        && W.pageOf(camp, 7) === null && W.pageOf(camp, undefined) === null && W.pageOf(null, 'p1') === null && W.pageOf({}, 'p1') === null);
}

/* ---------- opening it ---------- */
{
    // o: way, id, foreign (someone else's table), noPanel / noPop (the page panel or its window is not there), popFails
    const run = o => {
        const R = { opened: [], popped: [], read: [], nav: 0, drawn: 0, saved: [] };
        const camp = { activeItemId: 'm1', items: { p1: { type: 'planner' }, d1: { type: 'doc' }, m1: { type: 'map' } } }, state = { selId: 'r1', selWbId: 'w1', linkStart: 'r2' };
        const dp = o.noPanel ? undefined : { open: id => { R.opened.push(id); } }; if (dp && !o.noPop) dp.popOut = id => { R.popped.push(id); return !o.popFails; };
        const win = { wpDocPanel: dp, wpNet: o.foreign ? { foreign: true } : { foreign: false }, wpOpenDoc: id => { R.read.push(id); }, appRender: () => { R.drawn++; } };
        const openPage = new Function('window', 'state', 'getActiveCampaign', 'updateSidebarNav', 'save', waySrc + '\n' + openSrc + '\nreturn openPage;')(win, state, () => camp, () => { R.nav++; }, quiet => { R.saved.push(quiet); });
        const how = openPage(o.id === undefined ? 'p1' : o.id, o.way);
        return { how, opened: R.opened, popped: R.popped, read: R.read, nav: R.nav, drawn: R.drawn, saved: R.saved, active: camp.activeItemId, sel: [state.selId, state.selWbId, state.linkStart] };
    };
    const kept = r => r.active === 'm1' && r.nav === 0 && r.drawn === 0 && r.saved.length === 0 && J(r.sel) === J(['r1', 'w1', 'r2']);
    const win = run({ way: 'window' }), pan = run({ way: 'panel' }), go = run({ way: 'go' }), doc = run({ way: 'window', id: 'd1' });
    check('a window of its own is opened through the page panel\'s own pop-out, for that page alone, so every planner and every handbook page has its window; the map stays on screen and nothing is saved',
        win.how === 'window' && J(win.popped) === J(['p1']) && win.opened.length === 0 && kept(win) && doc.how === 'window' && J(doc.popped) === J(['d1']) && kept(doc), J([win, doc]));
    check('over the map, the page opens in the panel and the map stays on screen: the open item, the selection and the save are left as they were',
        pan.how === 'panel' && J(pan.opened) === J(['p1']) && pan.popped.length === 0 && kept(pan), J(pan));
    check('the page itself becomes the item on screen: the selection is cleared, the tree and the screen are drawn again and the campaign is saved, as a click in the tree does',
        go.how === 'go' && go.active === 'p1' && J(go.sel) === J([null, null, null]) && go.nav === 1 && go.drawn === 1 && J(go.saved) === J([true]) && go.opened.length === 0 && go.popped.length === 0, J(go));
    const fb1 = run({ way: 'window', popFails: true }), fb2 = run({ way: 'window', noPop: true }), fb3 = run({ way: 'panel', noPanel: true }), fb4 = run({ way: 'window', noPanel: true }), odd = run({ way: 'somewhere' });
    check('a window that cannot be opened falls back to the panel, and a panel that is not there to the page itself; a way that is none of the three is the page itself',
        fb1.how === 'panel' && J(fb1.opened) === J(['p1']) && kept(fb1) && fb2.how === 'panel' && J(fb2.opened) === J(['p1']) && fb3.how === 'go' && fb3.active === 'p1' && fb4.how === 'go' && fb4.active === 'p1' && odd.how === 'go' && odd.active === 'p1', J([fb1.how, fb2.how, fb3.how, fb4.how, odd.how]));
    const none = [run({ way: 'panel', id: 'm1' }), run({ way: 'go', id: 'nope' }), run({ way: 'window', id: 'toString' }), run({ way: 'go', id: 5 })];
    check('what is no page of the campaign on screen opens nothing, whatever way is asked: a map, an id that is not there, a name a prototype holds, a number',
        none.every(r => r.how === '' && kept(r) && r.opened.length === 0 && r.popped.length === 0 && r.read.length === 0), J(none.map(r => r.how)));
    const fDoc = ['window', 'panel', 'go'].map(w => run({ way: w, id: 'd1', foreign: true })), fPlan = ['window', 'panel', 'go'].map(w => run({ way: w, id: 'p1', foreign: true }));
    check('at someone else\'s table a handbook page is read in the reader whatever way is asked, never opened to edit and never in a window, and a planner is not opened at all',
        fDoc.every(r => r.how === 'reader' && J(r.read) === J(['d1']) && kept(r) && r.opened.length === 0 && r.popped.length === 0) && fPlan.every(r => r.how === '' && kept(r) && r.read.length === 0 && r.opened.length === 0 && r.popped.length === 0), J([fDoc.map(r => r.how), fPlan.map(r => r.how)]));
    check('the module publishes the rule, the rule for the view on screen, the opener and the shelf\'s few calls, and wires the shelf once; the view is asked of the one place that knows it (floats.js), and nothing in the module draws markup or opens a window by itself',
        /\nwindow\.wpPageShelf = \{ way: pageWay, wayNow: function\(ev\) \{ return pageWay\(viewNow\(\), ev\); \}, open: openPage, isPinned: isPinned, pinLabel: pinLabel, pin: pinPage, opened: pageOpened, noteActive: noteActive, close: shelfClose \};\nshelfWire\(\);\n$/.test(ps)
        && /\nfunction viewNow\(\) \{ var fl = window\.wpFloats; return fl && fl\.view \? fl\.view\(\) : ''; \}\n/.test(ps)
        && /\nfunction pageOpened\(id\) \{ recentNote\(id\); panelSync\(\); \}\n/.test(ps) && /\n    var camp = getActiveCampaign\(\); if \(camp && pageOf\(camp, camp\.activeItemId\)\) recentNote\(camp\.activeItemId\);\n    if \(shelfIsOpen\(\) && viewNow\(\) !== 'play'\) shelfClose\(\);/.test(ps)
        && /\nfunction shelfClose\(\) \{ var m = shelfMenu\(\); if \(m && m\.classList\.contains\('show'\)\) \{ m\.classList\.remove\('show'\); m\.textContent = ''; \} \}/.test(ps)
        && /\n    shelfDraw\(menu, shelfModel\(camp, map && map\.type === 'map' \? map\.id : '', camp && typeof camp\.id === 'string' \? recentRead\(camp\) : \[\]\)\);\n/.test(ps)
        && !/innerHTML|insertAdjacentHTML|window\.open\(|eval\(|new Function/.test(ps) && J(ps.match(/^import [^\n]*$/gm)) === J(["import { state } from './state.js';", "import { getActiveCampaign, getActiveMap } from './models.js';", "import { save, toast } from './io.js';", "import { updateSidebarNav } from './sidebar.js';"]), J(ps.match(/^import [^\n]*$/gm)));
}

/* ---------- the session shelf: what it holds ---------- */
const shelfSrc = sliceOf(ps, 'shelf');
const S = new Function(waySrc + '\n' + shelfSrc + '\nreturn { SHELF: SHELF, shelfText: shelfText, pageTitle: pageTitle, pinnedOf: pinnedOf, pinToggle: pinToggle, recentClean: recentClean, recentAdd: recentAdd, mapChain: mapChain, pagesFor: pagesFor, natCmp: natCmp, shelfModel: shelfModel };')();
// A campaign: a bar in a city in a world, two planners that play in the bar (one of them marked Next), one for the city, and loose pages
const mkCamp = () => ({ id: 'c1', items: {
    m_world: { type: 'map', meta: { title: 'World' } },
    m_city: { type: 'map', meta: { title: 'City', parentId: 'm_world' } },
    m_bar: { type: 'map', meta: { title: 'The Bar', parentId: 'm_city' } },
    p_bar: { type: 'planner', meta: { title: '3.10 The Bar' }, blocks: [{ type: 'h1' }, null, { type: 'node', title: 'The <b>back</b>  room', linkMapId: 'm_bar' }, { type: 'node', title: 'The cellar', linkMapId: 'm_bar', linkRoomId: 'r1' }] },
    p_fight: { type: 'planner', meta: { title: '3.20 Bar fight', status: 'next' }, blocks: [{ type: 'node', title: '3.20 Bar fight', linkMapId: 'm_bar' }] },
    p_city: { type: 'planner', meta: { title: 'City streets' }, blocks: [{ type: 'node', title: 'Market', linkMapId: 'm_city' }] },
    p_table: { type: 'planner', meta: { title: 'Table only' }, blocks: [{ type: 'node', mode: 'table', title: 'x', linkMapId: 'm_bar' }] },
    p_free: { type: 'planner', meta: { title: 'Loose notes' }, blocks: [{ type: 'callout', linkMapId: 'm_bar' }, 'm_bar', 7] },   // a block that is no node names the map: it plays nowhere
    d_rules: { type: 'doc', meta: { title: 'House rules' }, blocks: [{ type: 'node', title: 'x', linkMapId: 'm_bar' }] } } });   // and a handbook page is no planner
{
    const camp = mkCamp(); camp.pinnedPages = ['p_free', 'd_rules', 'p_free', 'nope', 5, null, 'm_bar', 'toString', {}, ['p_bar']];
    const shapes = [{}, 'p_free', undefined, null, 7, { 0: 'p_free', length: 1 }].map(v => { const c = mkCamp(); c.pinnedPages = v; return S.pinnedOf(c).length; });
    const many = mkCamp(), ids = []; for (let i = 0; i < 30; i++) { many.items['p' + i] = { type: 'planner', meta: { title: 'P' + i }, blocks: [] }; ids.push('p' + i); } many.pinnedPages = ids;
    const far = mkCamp(); far.pinnedPages = new Array(450).fill('nope').concat(['p_free']); const near = mkCamp(); near.pinnedPages = new Array(390).fill('nope').concat(['p_free']);
    check('the pinned pages are read as data: ids of planners and handbook pages that are there, each once, in their order; a map, a name a prototype holds, a number, a list inside the list and an id that is gone count for nothing; a list of another shape is no list; 24 at most, and only the first 400 entries are read',
        J(S.pinnedOf(camp)) === J(['p_free', 'd_rules']) && J(shapes) === J([0, 0, 0, 0, 0, 0]) && S.pinnedOf(many).length === 24 && J(S.pinnedOf(many).slice(0, 3)) === J(['p0', 'p1', 'p2']) && S.SHELF.pins === 24 && S.pinnedOf(far).length === 0 && J(S.pinnedOf(near)) === J(['p_free']) && S.pinnedOf(null).length === 0,
        J([S.pinnedOf(camp), shapes, S.pinnedOf(many).length, S.pinnedOf(far), S.pinnedOf(near)]));
    const c2 = mkCamp(); c2.pinnedPages = ['gone', 'p_free'];
    const t1 = S.pinToggle(c2, 'd_rules'), l1 = J(c2.pinnedPages), t2 = S.pinToggle(c2, 'p_free'), l2 = J(c2.pinnedPages), t3 = S.pinToggle(c2, 'd_rules'), has = 'pinnedPages' in c2;
    const t4 = [S.pinToggle(c2, 'm_bar'), S.pinToggle(c2, 'nope'), S.pinToggle(c2, 'toString'), S.pinToggle(c2, 5), S.pinToggle(null, 'p_free')], untouched = !('pinnedPages' in c2);
    const full = S.pinToggle(many, 'p29'), fullList = J(many.pinnedPages) === J(ids), offFull = S.pinToggle(many, 'p3'), nowFits = S.pinToggle(many, 'p29');
    check('a pin is set and taken off by one call that says what it did; the list it writes is the clean one, so an id that is gone goes with it, and an empty list leaves no key; what is no page is not pinned and nothing is written; a twenty-fifth pin is refused until one is taken off',
        t1 === 'pinned' && l1 === J(['p_free', 'd_rules']) && t2 === 'unpinned' && l2 === J(['d_rules']) && t3 === 'unpinned' && has === false && J(t4) === J(['', '', '', '', '']) && untouched
        && full === 'full' && fullList && offFull === 'unpinned' && nowFits === 'pinned' && many.pinnedPages.length === 24 && many.pinnedPages[23] === 'p29', J([t1, l1, t2, l2, t3, has, t4, full, fullList, offFull, nowFits]));
    const rc = mkCamp(), raw = ['d_rules', 'p_free', 'd_rules', 'm_bar', 'nope', 3, null, 'constructor'];
    const nine = mkCamp(), nineIds = []; for (let i = 0; i < 12; i++) { nine.items['q' + i] = { type: 'doc', meta: { title: 'Q' + i } }; nineIds.push('q' + i); }
    check('the last pages opened are read as data too, 8 at most; a page opened goes to the front and stands once; what is no page changes nothing',
        J(S.recentClean(rc, raw)) === J(['d_rules', 'p_free']) && [{}, 'p_free', null, undefined, 4].every(v => S.recentClean(rc, v).length === 0) && S.recentClean(nine, nineIds).length === 8 && S.SHELF.recent === 8
        && J(S.recentAdd(rc, raw, 'p_free')) === J(['p_free', 'd_rules']) && J(S.recentAdd(rc, raw, 'p_bar')) === J(['p_bar', 'd_rules', 'p_free']) && J(S.recentAdd(rc, raw, 'm_bar')) === J(['d_rules', 'p_free']) && J(S.recentAdd(rc, 'junk', 'p_bar')) === J(['p_bar'])
        && J(S.recentAdd(nine, nineIds, 'q11')) === J(['q11', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6']), J([S.recentClean(rc, raw), S.recentAdd(rc, raw, 'p_bar'), S.recentAdd(nine, nineIds, 'q11')]));
}
{
    const camp = mkCamp();
    const loop = mkCamp(); loop.items.m_world.meta.parentId = 'm_bar'; const odd = mkCamp(); odd.items.m_bar.meta.parentId = 'p_free'; const proto = mkCamp(); proto.items.m_bar.meta.parentId = 'constructor';
    // a list whose prototype holds a map, and a planner that links to it: what a list only inherits is no map of the campaign
    const ghost = mkCamp(); ghost.items = Object.assign(Object.create({ m_ghost: { type: 'map', meta: { title: 'Ghost' } } }), ghost.items); ghost.items.p_free.blocks = [{ type: 'node', title: 'n', linkMapId: 'm_ghost' }]; ghost.items.m_bar.meta.parentId = 'm_ghost';
    check('a map is followed up through the maps it is nested in, nearest first, by the ids they are kept under; a nest that bites its own tail ends, a parent that is no map or a name a prototype holds ends it, and what is no map has no chain',
        J(S.mapChain(camp, 'm_bar')) === J(['m_bar', 'm_city', 'm_world']) && J(S.mapChain(camp, 'm_world')) === J(['m_world']) && J(S.mapChain(loop, 'm_bar')) === J(['m_bar', 'm_city', 'm_world']) && J(S.mapChain(odd, 'm_bar')) === J(['m_bar']) && J(S.mapChain(proto, 'm_bar')) === J(['m_bar'])
        && S.mapChain(camp, 'p_free').length === 0 && S.mapChain(camp, 'nope').length === 0 && S.mapChain(camp, 'toString').length === 0 && S.mapChain(null, 'm_bar').length === 0
        && S.mapChain(ghost, 'm_ghost').length === 0 && J(S.mapChain(ghost, 'm_bar')) === J(['m_bar']) && S.pagesFor(ghost, 'm_ghost').length === 0 && S.shelfModel(ghost, 'm_ghost', []).where.length === 0, J([S.mapChain(camp, 'm_bar'), S.mapChain(loop, 'm_bar'), S.mapChain(odd, 'm_bar'), S.mapChain(ghost, 'm_ghost'), S.mapChain(ghost, 'm_bar')]));
    const bar = S.pagesFor(camp, 'm_bar'), city = S.pagesFor(camp, 'm_city');
    check('the planners that play on a map are read from their own nodes: a planner counts when one of its nodes links to that map, once, with the name of its first such node as plain text and how many link there; a node drawn as a plain table shows no link and counts for none; a map nothing links to, a planner and an id that is not there have none',
        J(bar) === J([{ id: 'p_bar', node: 'The back room', n: 2 }, { id: 'p_fight', node: '3.20 Bar fight', n: 1 }]) && J(city) === J([{ id: 'p_city', node: 'Market', n: 1 }]) && S.pagesFor(camp, 'm_world').length === 0
        && S.pagesFor(camp, 'p_bar').length === 0 && S.pagesFor(camp, 'nope').length === 0 && S.pagesFor(null, 'm_bar').length === 0, J([bar, city]));
    const order = ['3.10 The Bar', '3.2 Bar fight', 'city', 'City streets', '3', '3.2', 'Alpha 12', 'alpha 2'].sort(S.natCmp);
    check('names stand in the order a reader expects: 3.2 before 3.10, a shorter name before the longer one it begins, and capitals left aside',
        J(order) === J(['3', '3.2', '3.2 Bar fight', '3.10 The Bar', 'alpha 2', 'Alpha 12', 'city', 'City streets']) && S.natCmp('a', 'A') === 0 && S.natCmp('b', 'a') === 1 && S.natCmp('a', 'b') === -1, J(order));
    check('a name is one line of plain text: a planner\'s title as it stands, marks and all, since a title is text; a node\'s name without its typed markup; a page with no title by its kind; 120 characters at most',
        S.shelfText('  The <b>back</b>\n room ') === 'The back room' && S.shelfText(null) === '' && S.shelfText('x'.repeat(200)).length === 120 && S.shelfText('abcdef', 3) === 'abc' && S.pageTitle({ type: 'planner', meta: {} }) === 'Planner' && S.pageTitle({ type: 'doc' }) === 'Page' && S.pageTitle({ type: 'map', meta: { title: '' } }) === 'Map'
        && S.pageTitle({ type: 'doc', meta: { title: ' Rules \n of  play ' } }) === 'Rules of play' && S.pageTitle({ type: 'planner', meta: { title: '<b>x</b> <3' } }) === '<b>x</b> <3' && S.pageTitle({ type: 'planner', meta: { title: 'y'.repeat(300) } }).length === 120 && S.pageTitle({ type: 'planner', meta: { title: 7 } }) === '7');
}
{
    const camp = mkCamp(); camp.pinnedPages = ['p_free', 'p_fight'];
    const m = S.shelfModel(camp, 'm_bar', ['d_rules', 'p_bar', 'p_free']);
    const ids = l => l.map(r => r.id);
    check('the shelf on a map: the planners that play here first, the one marked Next in front, then those of the maps it is nested in; then Next scene, the pinned pages and the last ones opened; a page stands once, in the first place it belongs, and its row says whether it is pinned and whether it is Next',
        m.where.length === 2 && m.where[0].here === true && m.where[0].title === 'The Bar' && J(ids(m.where[0].rows)) === J(['p_fight', 'p_bar']) && m.where[1].here === false && m.where[1].title === 'City' && J(ids(m.where[1].rows)) === J(['p_city'])
        && m.next.length === 0 && J(ids(m.pinned)) === J(['p_free']) && J(ids(m.recent)) === J(['d_rules'])
        && J(m.where[0].rows[0]) === J({ id: 'p_fight', title: '3.20 Bar fight', kind: 'planner', sub: '', pinned: true, next: true }) && J(m.where[0].rows[1]) === J({ id: 'p_bar', title: '3.10 The Bar', kind: 'planner', sub: 'The back room +1', pinned: false, next: false })
        && m.where[1].rows[0].sub === 'Market' && J(m.recent[0]) === J({ id: 'd_rules', title: 'House rules', kind: 'doc', sub: '', pinned: false, next: false }) && m.pinned[0].pinned === true, J(m));
    const off = S.shelfModel(camp, '', ['d_rules', 'p_bar']), city = S.shelfModel(camp, 'm_city', []), none = S.shelfModel(null, 'm_bar', []), bare = S.shelfModel({ id: 'x', items: {} }, 'm', null);
    check('with no map on screen the shelf starts at Next scene; on the city it lists the city\'s planner as here and nothing of the bar nested in it; a campaign that is not there gives an empty shelf',
        off.where.length === 0 && J(ids(off.next)) === J(['p_fight']) && J(ids(off.pinned)) === J(['p_free']) && J(ids(off.recent)) === J(['d_rules', 'p_bar']) && off.next[0].next === true && off.next[0].pinned === true
        && city.where.length === 1 && city.where[0].here === true && J(ids(city.where[0].rows)) === J(['p_city']) && J(ids(city.next)) === J(['p_fight'])
        && J(none) === J({ where: [], next: [], pinned: [], recent: [] }) && J(bare) === J({ where: [], next: [], pinned: [], recent: [] }), J([off, city]));
    const big = mkCamp(); for (let i = 0; i < 12; i++) big.items['b' + i] = { type: 'planner', meta: { title: 'Bar ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_bar' }] };
    for (let i = 0; i < 6; i++) big.items['c' + i] = { type: 'planner', meta: { title: 'City ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_city' }] };
    const bm = S.shelfModel(big, 'm_bar', []);
    const few = mkCamp(); for (let i = 0; i < 8; i++) few.items['b' + i] = { type: 'planner', meta: { title: 'Bar ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_bar' }] };
    for (let i = 0; i < 6; i++) few.items['c' + i] = { type: 'planner', meta: { title: 'City ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_city' }] };
    const fm = S.shelfModel(few, 'm_bar', []);
    check('the maps take 12 rows of the shelf at most, the map on screen first: of fourteen planners that play here twelve are listed and none is left for the maps around it; with ten here, two rows are left for the map it is nested in',
        S.SHELF.here === 12 && bm.where.length === 1 && bm.where[0].rows.length === 12 && bm.where[0].rows[0].id === 'p_fight' && S.shelfModel(big, 'm_city', []).where[0].rows.length === 7
        && fm.where.length === 2 && fm.where[0].rows.length === 10 && fm.where[1].title === 'City' && fm.where[1].rows.length === 2, J(bm.where.map(g => [g.title, g.rows.length])));
}

/* ---------- the shelf drawn: elements and text nodes only ---------- */
const { makeDom } = require('./boxdom.js');
const drawSrc = sliceOf(ps, 'draw');
{
    const dom = makeDom(), D = new Function('document', drawSrc + '\nreturn { draw: shelfDraw, row: shelfRow };')(dom.document), menu = dom.document.createElement('div');
    const camp = mkCamp(); camp.pinnedPages = ['p_free', 'p_fight']; camp.items.p_free.meta.title = '<img src=x onerror=alert(1)> & "quotes"';
    let threw = ''; try { D.draw(menu, S.shelfModel(camp, 'm_bar', ['d_rules'])); } catch (e) { threw = e.message; }
    const kids = menu.children, cls = kids.map(k => k.className), heads = kids.filter(k => k.className === 'ps-head').map(k => k.textContent), rows = kids.filter(k => k.className === 'ps-row');
    const names = rows.map(r => r.children[0].children[1].textContent), parts = rows.map(r => r.children.map(c => c.tagName + '.' + c.className).join(' '));
    const hostile = rows.find(r => r.dataset.id === 'p_free'), tags = hostile.all().map(e => e.tagName).join(' ');
    check('the shelf is drawn with elements and text nodes on a page that refuses markup: a heading for each place, a row for each page with its name, a window button and its pin; the planner marked Next wears its mark where it stands; a hostile title is text and makes no element',
        threw === '' && J(heads) === J(['Here: The Bar', 'Around: City', 'Pinned', 'Recent']) && J(names) === J(['▶ 3.20 Bar fight', '3.10 The Bar', 'City streets', '<img src=x onerror=alert(1)> & "quotes"', 'House rules'])
        && parts.every(p => p === 'BUTTON.ps-open BUTTON.ps-win BUTTON.ps-pin' || p === 'BUTTON.ps-open BUTTON.ps-win BUTTON.ps-pin on') && tags === 'BUTTON SPAN SPAN BUTTON BUTTON' && J(rows.map(r => r.dataset.id)) === J(['p_fight', 'p_bar', 'p_city', 'p_free', 'd_rules']), J([threw, heads, names, parts, tags]));
    const pinOf = id => rows.find(r => r.dataset.id === id).children[2], openOf = id => rows.find(r => r.dataset.id === id).children[0];
    check('a row says what it is: a pin that is set is lit and says so to a screen reader, one that is not is not; a planner and a handbook page wear different marks; a planner here shows the node it plays at; every button is a button and says what a press does',
        pinOf('p_fight').className === 'ps-pin on' && pinOf('p_fight').attrs['aria-pressed'] === 'true' && pinOf('p_bar').className === 'ps-pin' && pinOf('p_bar').attrs['aria-pressed'] === 'false' && /unpin/.test(pinOf('p_fight').title) && pinOf('p_bar').title === 'Pin for the session'
        && openOf('p_bar').children[0].textContent === '📑' && openOf('d_rules').children[0].textContent === '📖' && openOf('p_bar').children[2].className === 'ps-sub' && openOf('p_bar').children[2].textContent === 'The back room +1' && openOf('p_fight').children.length === 2
        && rows.every(r => r.children.every(b => b.type === 'button' && b.title.length > 10)) && openOf('p_bar').title === 'Open over the map. Ctrl+click opens a new window. Alt+click opens the page itself.');
    const foot = kids[kids.length - 2], note = kids[kids.length - 1];
    check('under the rows: Find a page, with its key, and one line that says what a click does',
        foot.className === 'ps-foot' && foot.children[0].className === 'ps-find' && foot.children[0].textContent === 'Find a page…' && foot.children[1].textContent === 'Ctrl+K' && note.className === 'ps-note' && note.textContent === 'A click opens a page over the map. Ctrl+click opens a new window. Alt+click opens the page itself.' && cls.indexOf('ps-empty') < 0);
    const m2 = S.shelfModel(camp, '', []); D.draw(menu, m2); const again = menu.children.filter(k => k.className === 'ps-row').map(r => r.children[0].children[1].textContent), heads2 = menu.children.filter(k => k.className === 'ps-head').map(k => k.textContent);
    D.draw(menu, S.shelfModel({ id: 'e', items: {} }, '', [])); const empty = menu.children.map(k => k.className);
    check('drawn again it holds only the new rows; under its own heading the planner marked Next wears no second mark; a shelf with nothing on it says how to put a page there and still offers Find a page',
        J(heads2) === J(['Next scene', 'Pinned']) && J(again) === J(['3.20 Bar fight', '<img src=x onerror=alert(1)> & "quotes"']) && J(empty) === J(['ps-empty', 'ps-foot', 'ps-note']) && /^No pages here yet\. Pin a planner or a handbook page from its right-click menu in the left panel, or find one below\.$/.test(menu.children[0].textContent), J([heads2, again, empty]));
}

/* ---------- recent pages on this computer ---------- */
{
    const src = waySrc + '\n' + shelfSrc + '\n' + sliceOf(ps, 'recent');
    const run = o => { const store = Object.assign({}, o.store || {}), writes = [], camp = o.camp === undefined ? mkCamp() : o.camp;
        const ls = { getItem: k => { if (o.readThrows) throw new Error('no'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem: (k, v) => { if (o.writeThrows) throw new Error('full'); store[k] = v; writes.push(k); } };
        const win = o.noGate ? {} : { wpCanPersistLocal: () => o.allowed !== false };
        const api = new Function('window', 'localStorage', 'getActiveCampaign', src + '\nreturn { note: recentNote, read: recentRead, key: recentKey };')(win, ls, () => camp);
        let res; try { res = (o.ids || []).map(id => api.note(id)); } catch (e) { res = 'threw ' + e.message; }
        return { res, store, writes, read: camp && camp.id ? api.read(camp) : null }; };
    const a = run({ ids: ['p_free', 'd_rules', 'd_rules', 'p_free'] });
    check('a page that is opened is kept as one of this computer\'s last pages for that campaign, in front; opened again while it is in front, nothing is written',
        J(a.res) === J([true, true, false, true]) && J(a.writes) === J(['wp_recentp_c1', 'wp_recentp_c1', 'wp_recentp_c1']) && a.store.wp_recentp_c1 === J(['p_free', 'd_rules']) && J(a.read) === J(['p_free', 'd_rules']), J(a));
    const gate = run({ ids: ['p_free'], allowed: false }), noGate = run({ ids: ['p_free'], noGate: true }), notPage = run({ ids: ['m_bar', 'nope', 'toString', 4] }), noId = run({ ids: ['p_free'], camp: Object.assign(mkCamp(), { id: 9 }) }), noCamp = run({ ids: ['p_free'], camp: null });
    check('nothing is kept where this computer may not keep it: at someone else\'s table, or where the app\'s own word on that is missing; what is no page, a campaign with no id and no campaign keep nothing',
        [gate, noGate, notPage, noId, noCamp].every(r => r.writes.length === 0 && (r.res === undefined || r.res.every(x => x === false))), J([gate.res, noGate.res, notPage.res, noId.res, noCamp.res]));
    const bad = run({ ids: ['p_free'], store: { wp_recentp_c1: '{not json' } }), full = run({ ids: ['p_free'], writeThrows: true }), blind = run({ ids: ['p_free'], readThrows: true });
    check('what was kept is read as data: a record that is no list starts over, a store that cannot be written or read throws nothing',
        J(bad.res) === J([true]) && bad.store.wp_recentp_c1 === J(['p_free']) && J(full.res) === J([false]) && typeof blind.res !== 'string', J([bad, full.res, blind.res]));
}

/* ---------- pins, and the pin on the page panel's head ---------- */
{
    const src = waySrc + '\n' + shelfSrc + '\n' + sliceOf(ps, 'pins');
    const run = o => { const dom = makeDom(), head = dom.mk('button', '', null, 'docPanelPin'); dom.document.body.appendChild(head);
        const R = { saved: [], toasts: [], drawn: 0 }, camp = o.camp || mkCamp();
        const api = new Function('window', 'document', 'getActiveCampaign', 'save', 'toast', 'shelfIsOpen', 'shelfRender', src + '\nreturn { isPinned: isPinned, pinLabel: pinLabel, panelSync: panelSync, pin: pinPage };')(
            { wpDocPanel: o.noPanel ? undefined : { openId: () => o.open || '' } }, o.noHead ? { getElementById: () => null } : dom.document, () => o.noCamp ? null : camp, q => { R.saved.push(q); }, t => { R.toasts.push(t); }, () => !!o.shelfOpen, () => { R.drawn++; });
        return { api, R, camp, head }; };
    const A = run({ open: 'p_free', shelfOpen: true }), did = A.api.pin('p_free'), s1 = [A.head.className, A.head.attrs['aria-pressed'], A.head.title], l1 = J(A.camp.pinnedPages), lab1 = A.api.pinLabel('p_free');
    const undo = A.api.pin('p_free'), s2 = [A.head.className, A.head.attrs['aria-pressed'], A.head.title], lab2 = A.api.pinLabel('p_free');
    check('pinning a page saves the campaign quietly, says so, lights the pin on the page panel\'s head when that page is the one in the panel, and draws an open shelf again; taking the pin off does the same the other way',
        did === 'pinned' && l1 === J(['p_free']) && J(s1) === J(['on', 'true', 'Pinned for the session: it is on the Pages shelf of the play map. Press to unpin.']) && lab1 === '📌 Unpin from the session'
        && undo === 'unpinned' && !('pinnedPages' in A.camp) && J(s2) === J(['', 'false', 'Pin this page for the session: it goes on the Pages shelf of the play map']) && lab2 === '📌 Pin for the session'
        && J(A.R.saved) === J([true, true]) && J(A.R.toasts) === J(['Pinned. It is on the Pages shelf of the play map now.', 'Unpinned.']) && A.R.drawn === 2, J([did, l1, s1, undo, s2, A.R]));
    const other = run({ open: 'd_rules' }); other.api.pin('p_free'); const o1 = other.head.className, drawnClosed = other.R.drawn;
    const fullC = mkCamp(), ids = []; for (let i = 0; i < 24; i++) { fullC.items['p' + i] = { type: 'planner', meta: {} }; ids.push('p' + i); } fullC.pinnedPages = ids;
    const F = run({ camp: fullC, open: 'p_free' }), full = F.api.pin('p_free'), none = run({}), no = [none.api.pin('m_bar'), none.api.pin('nope'), none.api.pin(null)];
    const bare = run({ noHead: true, noPanel: true }), bareDid = bare.api.pin('p_free'), lost = run({ noCamp: true });
    check('the head\'s pin follows the page in the panel, not the page that was pinned; a shelf that is closed is not drawn; a twenty-fifth pin is refused in words and nothing is saved; what is no page does nothing; with no panel on the page a pin is still set',
        o1 === '' && drawnClosed === 0 && full === 'full' && F.R.saved.length === 0 && J(F.R.toasts) === J(['The shelf holds 24 pinned pages. Unpin one first.']) && J(no) === J(['', '', '']) && none.R.saved.length === 0 && none.R.toasts.length === 0
        && bareDid === 'pinned' && J(bare.R.saved) === J([true]) && lost.api.isPinned('p_free') === false && lost.api.pin('p_free') === '', J([o1, drawnClosed, full, F.R, no, bareDid]));
}

/* ---------- the shelf's button, its rows and the two other pins ---------- */
{
    const wireSrc = sliceOf(ps, 'wire');
    const mk = o => { const dom = makeDom(), doc = dom.document, R = { opened: [], pinned: [], drawn: 0, closed: 0, cmdk: 0, focused: 0 };
        const tb = dom.mk('div', 'floating-toolbar'), btn = dom.mk('button', 'wb-tool-btn', null, 'pagesBtn'), menu = dom.mk('div', 'shape-menu page-shelf', null, 'pagesMenu'), board = dom.mk('div', '', null, 'whiteboard');
        const cm = dom.mk('div', '', { id: 'p_bar' }, 'sidebarContextMenu'), pinRow = dom.mk('div', 'menu-item', null, 'ctxPinPage'), head = dom.mk('button', '', null, 'docPanelPin'); cm.style.display = 'block'; cm.appendChild(pinRow);
        [tb, board, cm, head].forEach(e => doc.body.appendChild(e)); tb.appendChild(btn); tb.appendChild(menu); btn.focus = () => { R.focused++; };
        const D = new Function('document', drawSrc + '\nreturn shelfDraw;')(doc), camp = mkCamp(); camp.pinnedPages = ['p_free'];
        const shelfIsOpen = () => menu.classList.contains('show'), shelfClose = () => { if (shelfIsOpen()) { menu.classList.remove('show'); menu.textContent = ''; R.closed++; } }, shelfRender = () => { R.drawn++; D(menu, S.shelfModel(camp, 'm_bar', [])); };
        new Function('document', 'window', 'shelfMenu', 'shelfIsOpen', 'shelfClose', 'shelfRender', 'pinPage', 'openPage', 'pageWay', 'viewNow', wireSrc + '\nshelfWire();')(
            o && o.bare ? { getElementById: () => null, addEventListener: () => { throw new Error('wired with nothing to wire'); } } : doc, { wpCmdkOpen: () => { R.cmdk++; }, wpDocPanel: { openId: () => (o && o.open) || '' } }, () => menu, shelfIsOpen, shelfClose, shelfRender,
            id => { R.pinned.push(id); if (shelfIsOpen()) shelfRender(); }, (id, way) => { R.opened.push(id + ':' + way); }, W.way, () => (o && o.view) || 'play');
        const rowOf = id => menu.children.find(k => k.className === 'ps-row' && k.dataset.id === id);
        return { dom, R, btn, menu, board, cm, pinRow, head, rowOf, open: shelfIsOpen }; };
    const A = mk(); A.dom.fire(A.btn, 'click'); const up = [A.open(), A.R.drawn, A.menu.children.length > 3]; A.dom.fire(A.btn, 'click'); const down = [A.open(), A.menu.children.length];
    check('the Pages button draws the shelf and shows it; pressed again it puts the shelf away, rows and all',
        J(up) === J([true, 1, true]) && J(down) === J([false, 0]), J([up, down]));
    const press = (part, extra, o) => { const X = mk(o); X.dom.fire(X.btn, 'click'); const row = X.rowOf('p_bar'), el = part === 'open' ? row.children[0] : part === 'name' ? row.children[0].children[1] : part === 'win' ? row.children[1] : row.children[2]; const e = X.dom.fire(el, 'click', extra || {}); return [X.R.opened.join(), X.R.pinned.join(), X.open(), e.stopped]; };
    check('a press on a row\'s name opens the page by the one rule, with the keys held, and puts the shelf away: over the map, Ctrl a window, Alt the page itself; a press on the text inside the button counts as the button; off the play map the same press goes to the page',
        J(press('open')) === J(['p_bar:panel', '', false, true]) && J(press('open', { ctrlKey: true })) === J(['p_bar:window', '', false, true]) && J(press('open', { altKey: true })) === J(['p_bar:go', '', false, true]) && J(press('name')) === J(['p_bar:panel', '', false, true])
        && J(press('open', {}, { view: 'data' })) === J(['p_bar:go', '', false, true]) && J(press('open', { shiftKey: true }, { view: 'page' })) === J(['p_bar:panel', '', false, true]), J([press('open'), press('open', { ctrlKey: true }), press('name')]));
    check('a row\'s window button opens that page in a window of its own whatever keys are held, and its pin sets or takes off the pin while the shelf stays open, drawn again under the pointer without reading as a press outside it',
        J(press('win')) === J(['p_bar:window', '', false, true]) && J(press('win', { altKey: true })) === J(['p_bar:window', '', false, true]) && J(press('pin')) === J(['', 'p_bar', true, true]), J([press('win'), press('pin')]));
    const B = mk(); B.dom.fire(B.btn, 'click'); const find = B.menu.children.find(k => k.className === 'ps-foot').children[0]; B.dom.fire(find, 'click'); const f1 = [B.open(), B.R.cmdk, B.R.opened.length];
    B.dom.fire(B.btn, 'click'); B.dom.fire(B.menu.children[0], 'click'); const headPress = [B.open(), B.R.opened.length, B.R.pinned.length];
    B.dom.fire(B.board, 'click'); const outside = B.open(); B.dom.fire(B.btn, 'click'); const esc = B.dom.fire(B.rowOf('p_bar').children[0], 'keydown', { key: 'Escape' }); const e1 = [B.open(), B.R.focused, esc.stopped];
    B.dom.fire(B.btn, 'click'); const other = B.dom.fire(B.rowOf('p_bar').children[0], 'keydown', { key: 'Enter' }); const e2 = [B.open(), other.stopped]; B.dom.fire(B.board, 'click'); B.dom.fire(B.board, 'click');
    check('Find a page puts the shelf away and opens quick-jump; a press on a heading does nothing; a press anywhere else on the page puts the shelf away, and so does Esc, which hands the focus back to the button and goes no further; another key is left alone',
        J(f1) === J([false, 1, 0]) && J(headPress) === J([true, 0, 0]) && outside === false && J(e1) === J([false, 1, true]) && J(e2) === J([true, false]) && B.open() === false, J([f1, headPress, outside, e1, e2]));
    const C = mk({ open: 'd_rules' }); C.dom.fire(C.pinRow, 'click'); const tree = [C.R.pinned.join(), C.cm.style.display]; C.dom.fire(C.head, 'click'); const hd = C.R.pinned.join();
    const N = mk({}); N.dom.fire(N.head, 'click'); N.cm.dataset.id = ''; N.dom.fire(N.pinRow, 'click'); let bareThrew = ''; try { mk({ bare: true }); } catch (e) { bareThrew = e.message; }
    check('the two other pins ask the same call: the row in the tree\'s right-click menu pins the page the menu was opened on and puts the menu away, and the pin on the page panel\'s head pins the page in the panel; with no page there is nothing to pin, and a page with none of these parts wires nothing',
        J(tree) === J(['p_bar', 'none']) && hd === 'p_bar,d_rules' && N.R.pinned.length === 0 && bareThrew === '', J([tree, hd, N.R.pinned, bareThrew]));
}

/* ---------- never on the wire, swept with the recent maps ---------- */
{
    const netS = read('scripts/net.js'), cu = read('scripts/cleanup.js'), sb = read('scripts/sidebar.js'), dp = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'utf8');
    check('the pinned pages name planners, which are the GM\'s alone: the key is deleted from every copy of a campaign that is sent, beside the pinned maps, and it is one of the keys that mark a campaign as this machine\'s own (netcheck runs the real sender)',
        count(netS, '        delete camp.pinnedMaps;\n        delete camp.pinnedPages;') === 1 && count(netS, 'pinnedPages') === 1 && /var STRIPPED = \[[^\]]*'pinnedMaps', 'pinnedPages', 'sessionLog'/.test(cu));
    const sweepSrc = (cu.match(/\nfunction isObj\(v\) \{[^\n]*\}\n/) || [''])[0] + (cu.match(/\nfunction campaignsOf\(s\) \{[^\n]*\}\n/) || [''])[0] + cu.slice(cu.indexOf('function sweepRecents(appState) {'), cu.indexOf('function cleanupInfo()'));
    const store = { wp_recent_c1: '[]', wp_recent_gone: '[]', wp_recentp_c1: '[]', wp_recentp_gone: '[]', wp_recentp_: '[]', wp_recents: 'x', wp_other: '1', cleanup_ledger: '{}' }, removed = [];
    const ls = { get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i], removeItem: k => { removed.push(k); delete store[k]; } };
    const n = new Function('localStorage', sweepSrc + '\nreturn sweepRecents;')(ls)({ campaigns: { c1: {} } });
    check('the recent pages of a campaign that is no longer in the save go with its recent maps, at every load: a joined table\'s ids never stay; the keys of a campaign that is there, and every other key, are left',
        n === 3 && J(removed.sort()) === J(['wp_recent_gone', 'wp_recentp_', 'wp_recentp_gone']) && J(Object.keys(store).sort()) === J(['cleanup_ledger', 'wp_other', 'wp_recent_c1', 'wp_recentp_c1', 'wp_recents']), J([n, removed, Object.keys(store)]));
    check('the hooks: the tree says which page is on screen each time it is drawn and words its pin row for the page its menu was opened on; the page panel says when a page is opened in it or in a window of its own',
        count(sb, "      if (window.wpPageShelf && window.wpPageShelf.noteActive) window.wpPageShelf.noteActive();") === 1 && sb.indexOf('window.wpPageShelf.noteActive();') < sb.indexOf("mNav.innerHTML = mapQuickHtml(camp)")
        && count(sb, "var pinRowS = document.getElementById('ctxPinPage'); if (pinRowS && it && window.wpPageShelf && window.wpPageShelf.pinLabel) pinRowS.textContent = window.wpPageShelf.pinLabel(it.id);") === 1
        && count(dp, "    clearSearch(); draw(true);\n    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);") === 1
        && count(dp, "'wpPopout_' + id, 'width=820,height=1000');\n    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);") === 1 && count(dp, 'wpPageShelf') === 6 && !dp.includes('\r') && count(dp, '\0') === 3);
    check('the page: the Pages button and its shelf sit on the play map\'s toolbar in a part of it that is the GM\'s alone, the shelf empty until it is drawn; the tree\'s menu has the pin where Open over the map is; the page panel\'s head has its pin before the window button',
        /<div style="position:relative; display:inline-block;" class="gm-only">\n\s*<button class="wb-tool-btn" id="pagesBtn" title="[^"<>]+">&#128209;<\/button>\n\s*<div class="shape-menu page-shelf" id="pagesMenu"><\/div>\n\s*<\/div>/.test(ix)
        && />&#10697; Open in a new window<\/div>\n    <div class="menu-item ctx-docwin-only" id="ctxPinPage" style="padding:8px 16px; cursor:pointer;" title="[^"<>]+">&#128204; Pin for the session<\/div>/.test(ix)
        && /<span class="docpanel-title" id="docPanelTitle">Document<\/span><button class="tool ghost notepad-btn" id="docPanelPin" aria-pressed="false" title="[^"<>]+">&#128204;<\/button><button class="tool ghost notepad-btn" id="docPanelPop"/.test(ix)
        && ['pagesBtn', 'pagesMenu', 'ctxPinPage', 'docPanelPin'].every(id => count(ix, 'id="' + id + '"') === 1) && /\n\s*\.floating-toolbar \.shape-menu\.page-shelf \{ flex-direction: column; [^\n]*overflow-y: auto;/.test(css) && /\n\s*\.page-shelf \.ps-pin\.on, #docPanelPin\.on \{ filter: none; opacity: 1; \}/.test(css));
}

/* ---------- quick-jump (main.js) ---------- */
{
    const src = sliceOf(mainS, 'cmdkway');
    const mk = (view, shelf) => new Function('window', 'state', src + '\nreturn { way: cmdkWay, hint: cmdkHint };')(
        { wpPageShelf: shelf === false ? undefined : { wayNow: ev => W.way(view, ev) } }, { appState: { activeCampaignId: 'c1' } });
    const page = { kind: 'planner', campId: 'c1', itemId: 'p1' }, doc = { kind: 'doc', campId: 'c1', itemId: 'd1' }, map = { kind: 'map', campId: 'c1', itemId: 'm1' }, room = { kind: 'room', campId: 'c1', itemId: 'm1', roomId: 'r1' }, far = { kind: 'planner', campId: 'c2', itemId: 'p9' };
    const play = mk('play'), data = mk('data'), pg = mk('page'), bare = mk('play', false);
    check('quick-jump goes to a map, a room and a page of another campaign, whatever keys are held: only a planner or a handbook page of the campaign on screen is opened by the rule',
        [map, room, far].every(en => [null, { ctrlKey: true }, { altKey: true }, { shiftKey: true }].every(ev => play.way(en, ev) === 'go' && data.way(en, ev) === 'go')) && play.way(null, null) === 'go' && play.way(undefined) === 'go' && bare.way(page, null) === 'go' && bare.way(page, { ctrlKey: true }) === 'go');
    check('a planner or a handbook page picked in quick-jump opens by the one rule: on the play map over the map, with Ctrl in a window of its own, with Alt as the page itself; on another view as the page itself, with Shift in a panel there',
        [page, doc].every(en => play.way(en, null) === 'panel' && play.way(en, { ctrlKey: true }) === 'window' && play.way(en, { altKey: true }) === 'go' && data.way(en, null) === 'go' && data.way(en, { shiftKey: true }) === 'panel' && pg.way(en, { ctrlKey: true }) === 'window' && pg.way(en, {}) === 'go'));
    const hints = [play.hint(page), play.hint(doc), data.hint(page), pg.hint(doc), play.hint(map), data.hint(room), play.hint(far), play.hint(null), bare.hint(page)];
    check('the line under the list says what Enter will do for the row in front, in plain words: over the map on the play map, the page elsewhere, and gone to for a map, a room or another campaign\'s page',
        J(hints) === J(['Enter opens it over the map. Ctrl+Enter opens a new window. Alt+Enter opens the page itself.', 'Enter opens it over the map. Ctrl+Enter opens a new window. Alt+Enter opens the page itself.',
            'Enter opens the page. Shift+Enter opens it in a panel here. Ctrl+Enter opens a new window.', 'Enter opens the page. Shift+Enter opens it in a panel here. Ctrl+Enter opens a new window.', 'Enter goes there.', 'Enter goes there.', 'Enter goes there.', '', 'Enter goes there.']), J(hints));
    const go = mainS.slice(mainS.indexOf('    function cmdkGo(en, ev) {'), mainS.indexOf('    function cmdkGoNow(en) {'));
    check('quick-jump asks the rule before it leaves the map: a page that opens over the map or in a window is handed to the one opener and nothing else runs, and only the page itself goes on to the old path, which still asks before another campaign replaces a hosted one',
        /^    function cmdkGo\(en, ev\) \{\n        if \(!en\) return;\n        cmdkClose\(\);\n        var way = cmdkWay\(en, ev\);\n        if \(way !== 'go'\) \{ window\.wpPageShelf\.open\(en\.itemId, way\); return; \}[^\n]*\n/.test(go) && /wpConfirmCampaignSwitch\(function\(\) \{ cmdkGoNow\(en\); \}\); return; \}\n        cmdkGoNow\(en\);\n    \}\n/.test(go), go.slice(0, 300));
    check('the keys and the pointer hand their event on, so the keys held count: Enter, a click on a row; the row under the pointer is the row in front, and the line follows the row as the list is drawn, as the arrows move and as the pointer moves',
        count(mainS, "if (e.key === 'Enter') { e.preventDefault(); cmdkGo(_cmdkShown[_cmdkIdx], e); return; }") === 1 && count(mainS, "if (row) cmdkGo(_cmdkShown[+row.dataset.i], e);") === 1
        && count(mainS, "list.addEventListener('mousemove', function(e) { var row = e.target.closest('.cmdk-row'); if (row) cmdkFront(+row.dataset.i); });") === 1
        && /function cmdkFront\(i\) \{ if \(i === _cmdkIdx \|\| !_cmdkShown\[i\]\) return; _cmdkIdx = i; [^\n]*classList\.toggle\('active', k === _cmdkIdx\); \}\); cmdkHintSync\(\); \}/.test(mainS)
        && /function cmdkHintSync\(\) \{ var h = document\.getElementById\('cmdkHint'\); if \(h\) h\.textContent = cmdkHint\(_cmdkShown\[_cmdkIdx\]\); \}/.test(mainS)
        && /: '<div class="cmdk-empty">No matches\.<\/div>';\n        cmdkHintSync\(\);\n    \}/.test(mainS) && /if \(act\) act\.scrollIntoView\(\{ block: 'nearest' \}\);\n                cmdkHintSync\(\);/.test(mainS) && count(mainS, 'cmdkGo(') === 3);
    check('the page has the line under the list, drawn as text, hidden while it is empty; the module is loaded once, after floats.js, whose view it asks',
        count(ix, '<div id="cmdkList" style="max-height:46vh; overflow-y:auto;"></div>\n        <div id="cmdkHint" class="cmdk-hint" role="status"></div>') === 1 && /\n\s*\.cmdk-hint:empty \{ display: none; \}/.test(css) && /\n\s*\.cmdk-hint \{ padding: 7px 16px; /.test(css)
        && count(ix, 'scripts/pageshelf.js') === 1 && ix.includes('<script type="module" src="scripts/floats.js"></script>\n<script type="module" src="scripts/pageshelf.js"></script>\n'));
}

/* ---------- the play map's Next scene row ---------- */
{
    check('Next scene, on the play map\'s right-click menu, opens by the same rule and decides nothing itself: a plain click over the map, Ctrl a window, Alt the planner; its tooltip says so',
        count(wb, "else if (act === 'scene') { if (window.wpPageShelf) window.wpPageShelf.open(it.dataset.id, window.wpPageShelf.wayNow(ce)); }") === 1 && !/act === 'scene'\) \{[^\n]*activeItemId/.test(wb)
        && count(wb, 'title="The planner marked Next. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the planner itself.">&#9654; Next scene: ') === 1 && /it\.addEventListener\('click', function\(ce\) \{/.test(wb));
}

/* ---------- said ---------- */
{
    const wn = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')].map(t => t.replace(/\r\n/g, '\n'));
    const NOTE = "- Quick-jump keeps you on the play map. Press Ctrl+K and pick a\n  planner or a handbook page: Enter opens it over the map, Ctrl+Enter\n  opens it in a window of its own, and Alt+Enter opens the page itself\n  to edit. A map or a room is still gone to. A click works the same\n  way, and the line under the list says what Enter will do. Next\n  scene, on the play map's right-click menu, opens over the map too.\n";
    const start = ix.slice(ix.indexOf('<div class="help-pane" data-pane="start">'), ix.indexOf('<div class="help-pane" data-pane="tutorial"')), plan = ix.slice(ix.indexOf('<div class="help-pane" data-pane="planners"'), ix.indexOf('<div class="help-pane" data-pane="handbook"'));
    check('Help says it, in Getting Started under Getting around fast: what quick-jump finds, that a map or a room is gone to, what Enter, Ctrl+Enter and Alt+Enter do with a page on the play map, what Enter and Shift+Enter do elsewhere, and that a click works as Enter does',
        start.includes('<li><kbd>Ctrl + K</kbd> opens quick-jump. Type any map, planner, room or handbook name and hit Enter. A word from a <b>page&rsquo;s text</b> works too: quick-jump searches page content and shows a snippet.\n')
        && start.includes('<li>A map or a room is gone to.</li>')
        && start.includes('<li>On the play map a planner or a handbook page opens <b>over the map</b>, so the map stays on screen. <kbd>Ctrl + Enter</kbd> opens it in a window of its own. <kbd>Alt + Enter</kbd> opens the page itself, to edit.</li>')
        && start.includes('<li>On any other view Enter opens the page itself. <kbd>Shift + Enter</kbd> opens it in a panel where you are.</li>')
        && start.includes('<li>A click works as Enter does, with the same keys held. The line under the list says what Enter will do.</li>'));
    const NOTE2 = "- A Pages button on the play map's toolbar keeps the right pages one\n  click away in a session. Here lists the planners that play on the\n  map on screen, read from the map links your planners' nodes already\n  have, and Around those of the maps it is nested in. Then come Next\n  scene, the pages you pinned and the last ones you opened. A click\n  opens a page over the map, Ctrl+click or the row's window button\n  opens it in a window of its own, and Alt+click opens the page\n  itself. Pin a page from its right-click menu in the left panel, from\n  the pin in the page panel's head or from its row. Players never get\n  the list.\n";
    check('Help says the shelf, in the Planners part under In a session: the Pages button; Here and Around and what makes a planner play on a map; Next scene; Pinned, the three places a pin is set and how many; Recent; what a click, Ctrl+click and Alt+click do; Find a page; and that players never get the list. Both release notes carry it, alike',
        plan.includes('<h4>In a session</h4>\n') && plan.includes('<li>The tree is for prep. In a session the <b>Pages</b> button on the play map&rsquo;s toolbar keeps the right pages one click away.\n')
        && plan.includes('<li><b>Here</b> lists the planners that play on the map on screen. A planner plays on a map when one of its nodes has that map as its <b>Map</b>. <b>Around</b> lists the planners of the maps this one is nested in.</li>')
        && plan.includes('<li><b>Next scene</b> is the planner marked Next.</li>')
        && plan.includes('<li><b>Pinned</b> holds the pages you pinned for the session. Pin a page from its right-click menu in the left panel, from the pin in the page panel&rsquo;s head, or from its row on the shelf. You can pin 24 pages.</li>')
        && plan.includes('<li><b>Recent</b> holds the last pages you opened on this computer.</li>')
        && plan.includes('<li>A click on a row opens the page over the map. <kbd>Ctrl</kbd>+click opens it in a window of its own, and so does the row&rsquo;s window button. <kbd>Alt</kbd>+click opens the page itself, to edit.</li>')
        && plan.includes('<li><b>Find a page</b> opens quick-jump.</li>') && plan.includes('<li>The shelf is yours alone. Players never get the list of pinned pages.</li>') && count(ix, '<h4>In a session</h4>') === 1 && wn.every(t => count(t, NOTE2) === 1));
    check('Help\'s Planners part says a click on Next scene opens it over the map; both release notes carry the line, alike; the suite is one of those CI runs',
        plan.includes('the play map&rsquo;s right-click menu then offers it as <b>&#9654; Next scene</b>. A click there opens it over the map. <b>Played</b> and <b>Skipped</b> mark a scene done.</li>')
        && wn.every(t => count(t, NOTE) === 1) && fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').replace(/\r\n/g, '\n').includes('        if: ${{ !cancelled() }}\n        run: node tools/shelfcheck.js\n'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
