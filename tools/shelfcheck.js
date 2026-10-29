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
        /\nwindow\.wpPageShelf = \{ way: pageWay, wayNow: function\(ev\) \{ return pageWay\(viewNow\(\), ev\); \}, open: openPage, isPinned: isPinned, pinLabel: pinLabel, pin: pinPage, opened: pageOpened, noteActive: noteActive, close: shelfClose, mapPin: mapPin, mapPinField: mapPinField, mapPinSet: mapPinSet,\n    linkGo: linkGo, linkChoices: function\(\) \{ return linkChoices\(getActiveCampaign\(\)\); \}, linkWords: function\(id, at\) \{ return linkWords\(getActiveCampaign\(\), id, at\); \} \};\nshelfWire\(\);\n$/.test(ps)
        && /\nfunction viewNow\(\) \{ var fl = window\.wpFloats; return fl && fl\.view \? fl\.view\(\) : ''; \}\n/.test(ps)
        && /\nfunction pageOpened\(id\) \{ recentNote\(id\); panelSync\(\); \}\n/.test(ps) && /\n    var camp = getActiveCampaign\(\); if \(camp && pageOf\(camp, camp\.activeItemId\)\) recentNote\(camp\.activeItemId\);\n    if \(shelfIsOpen\(\) && viewNow\(\) !== 'play'\) shelfClose\(\);/.test(ps)
        && /\nfunction shelfClose\(\) \{ var m = shelfMenu\(\); if \(m && m\.classList\.contains\('show'\)\) \{ m\.classList\.remove\('show'\); m\.textContent = ''; \} \}/.test(ps)
        && /\n    shelfDraw\(menu, shelfModel\(camp, map && map\.type === 'map' \? map\.id : '', camp && typeof camp\.id === 'string' \? recentRead\(camp\) : \[\]\)\);\n/.test(ps)
        && !/innerHTML|insertAdjacentHTML|window\.open\(|eval\(|new Function/.test(ps) && J(ps.match(/^import [^\n]*$/gm)) === J(["import { state } from './state.js';", "import { getActiveCampaign, getActiveMap } from './models.js';", "import { save, toast } from './io.js';", "import { updateSidebarNav } from './sidebar.js';"]), J(ps.match(/^import [^\n]*$/gm)));
}

/* ---------- opening it at a place (1.5.4, PLANNER_ORG_DESIGN 4.1; the owner, 2026-10-16: "Landing now, rest after Sunday") ---------- */
// pagenav.js landOf as the landing's contract says it (builder A writes the real one and pagecheck runs it). A search text that trims to 1 to
// 200 characters is { q }, cut at 200 by code points; else a block id of letters, digits, _ and -, 64 at most, is { at }; anything else none
const landOfStand = v => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const own = k => (Object.prototype.hasOwnProperty.call(v, k) ? v[k] : undefined), q = own('q'), at = own('at');
    if (typeof q === 'string') { const t = q.trim(); if (t) return { q: Array.from(t).slice(0, 200).join('').trim() }; }
    return typeof at === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(at) ? { at: at } : null;
};
const JUNK_LANDS = [null, undefined, 7, 'b_k3', [], {}, { at: 'b k3' }, { at: '<b>' }, { at: 5 }, { at: 'x'.repeat(65) }, { at: '' }, { q: '' }, { q: '   ' }, { q: 7 }, { q: null, at: null }];
// A promise of the suite's own: Promise.resolve hands back a chain whose then and catch run only when the suite settles it, in order, so a
// wait for diagrams is run step by step with no event loop
const syncPromise = () => {
    const chains = [];
    const P = { resolve: () => { const c = []; chains.push(c); const h = { then: f => { c.push(['then', f]); return h; }, catch: f => { c.push(['catch', f]); return h; } }; return h; } };
    const one = (c, fail) => { let err = fail || null; c.forEach(([k, f]) => { if (k === 'then' && !err) { try { f(); } catch (e) { err = e; } } else if (k === 'catch' && err) { try { f(err); err = null; } catch (e) { err = e; } } }); };
    const settle = fail => { chains.splice(0).forEach(c => one(c, fail)); }, first = fail => { const c = chains.shift(); if (c) one(c, fail); };
    return { P, settle, first, waiting: () => chains.length };
};
{
    // o: way, id, land (absent: no third argument), foreign, noPanel / noPop / popFails, noNav (no cleaner), throws (the cleaner throws)
    const run = o => {
        const R = { log: [], open: [], pop: [], read: [], land: [] }, args = a => Array.prototype.slice.call(a);
        const camp = { activeItemId: 'm1', items: { p1: { type: 'planner' }, d1: { type: 'doc' }, m1: { type: 'map' } } }, state = { selId: 'r1', selWbId: 'w1', linkStart: 'r2' };
        const dp = o.noPanel ? undefined : { open: function() { R.log.push('open'); R.open.push(args(arguments)); } };
        if (dp && !o.noPop) dp.popOut = function() { R.log.push('pop'); R.pop.push(args(arguments)); return !o.popFails; };
        const win = { wpDocPanel: dp, wpNet: { foreign: !!o.foreign }, appRender: () => { R.log.push('render'); },
            wpOpenDoc: function() { R.log.push('read'); R.read.push(args(arguments)); }, wpPlannerLand: function() { R.log.push('land'); R.land.push(args(arguments)); } };
        if (!o.noNav) win.wpPageNav = { landOf: o.throws ? () => { throw new Error('no'); } : landOfStand };
        const openPage = new Function('window', 'state', 'getActiveCampaign', 'updateSidebarNav', 'save', waySrc + '\n' + openSrc + '\nreturn openPage;')(win, state, () => camp, () => { R.log.push('nav'); }, () => { R.log.push('save'); });
        const id = o.id || 'p1', how = 'land' in o ? openPage(id, o.way, o.land) : openPage(id, o.way);
        return Object.assign(R, { how: how, active: camp.activeItemId });
    };
    const AT = { at: 'b_k3' }, Q = { q: '  the barkeep  ' };
    const pnS = read('scripts/pagenav.js'), lA = pnS.indexOf('// [pagecheck:land-start]'), lZ = pnS.indexOf('// [pagecheck:land-end]'), realLandOf = lA >= 0 && lZ > lA ? new Function(pnS.slice(lA, lZ) + '\nreturn landOf;')() : null;
    const CORPUS = JUNK_LANDS.concat([AT, Q, { q: ' barkeep ' }, { q: 'barkeep' }, { q: 'x' }, { q: 'ledger' }, { q: '  the barkeep ' }, { at: 'b_c' }, { at: 'b_zz' }, { at: 'b_inh' }, { at: 'b_back' }, { at: 'b_Good-1' }, { at: 'b k' }, { q: '\u00e9'.repeat(250) }, { q: 'a', at: 'b_k3' }, { q: '', at: 'b_k3' }, Object.create({ at: 'b_k3' }), Object.create({ q: 'x' }), ['b_k3']]);
    const disagree = realLandOf ? CORPUS.filter(L => J(realLandOf(L)) !== J(landOfStand(L))) : ['pagenav.js has no land slice'];
    check('the landing\'s cleaner these checks stand in for answers as pagenav.js\'s own landOf does (sliced by its pagecheck land markers), landing for landing, on every landing they hand it: a search text before a block, trimmed and cut at 200 characters, own keys only, no list',
        disagree.length === 0, J(disagree));
    const ways = L => ({ win: run({ way: 'window', land: L }), pan: run({ way: 'panel', land: L }), go: run({ way: 'go', land: L }) });
    const a = ways(AT), q = ways(Q);
    check('a page opens at a place by every way (openPage, run for real, with the landing\'s cleaner as its contract says it): the landing is cleaned once and the clean one is handed on, to the window\'s pop-out, to the panel, and on the page itself to the planner\'s own landing once the page is drawn and saved; a block stays a block, a search text is trimmed; the map stays on screen for the panel and the window',
        [[a, AT], [q, Q]].every(([w, L]) => { const c = landOfStand(L); return w.win.how === 'window' && J(w.win.pop) === J([['p1', c]]) && w.win.open.length === 0 && w.win.land.length === 0 && w.win.active === 'm1'
            && w.pan.how === 'panel' && J(w.pan.open) === J([['p1', c]]) && w.pan.pop.length === 0 && w.pan.land.length === 0 && w.pan.active === 'm1'
            && w.go.how === 'go' && w.go.active === 'p1' && J(w.go.log) === J(['nav', 'render', 'save', 'land']) && J(w.go.land) === J([['p1', c]]) && w.go.open.length === 0 && w.go.pop.length === 0; })
        && a.win.pop[0][1] !== AT && J(q.pan.open[0][1]) === J({ q: 'the barkeep' }), J([a, q]));
    const fb = [run({ way: 'window', land: AT, popFails: true }), run({ way: 'window', land: AT, noPop: true }), run({ way: 'panel', land: AT, noPanel: true }), run({ way: 'window', land: AT, noPanel: true })];
    check('the fallbacks keep the landing: a window that cannot be opened falls back to the panel, which opens at it, and a panel that is not there falls back to the page itself, which lands once it is drawn',
        fb[0].how === 'panel' && J(fb[0].pop) === J([['p1', AT]]) && J(fb[0].open) === J([['p1', AT]]) && J(fb[0].log) === J(['pop', 'open']) && fb[1].how === 'panel' && J(fb[1].open) === J([['p1', AT]])
        && fb[2].how === 'go' && J(fb[2].land) === J([['p1', AT]]) && fb[3].how === 'go' && J(fb[3].land) === J([['p1', AT]]) && J(fb[3].log) === J(['nav', 'render', 'save', 'land']), J(fb));
    const fr = ['window', 'panel', 'go'].map(w => run({ way: w, id: 'd1', land: Q, foreign: true })), frP = run({ way: 'go', id: 'p1', land: Q, foreign: true }), frNone = run({ way: 'panel', id: 'd1', foreign: true });
    check('at someone else\'s table the reader opens a handbook page at the landing whatever way is asked, and a planner still opens nothing; with no landing the reader is handed the page alone',
        fr.every(r => r.how === 'reader' && J(r.read) === J([['d1', { q: 'the barkeep' }]]) && r.open.length + r.pop.length + r.land.length === 0) && frP.how === '' && frP.read.length === 0 && frP.land.length === 0 && J(frNone.read) === J([['d1']]), J([fr, frP, frNone]));
    const plain = ['window', 'panel', 'go'].map(w => run({ way: w })), plainF = run({ way: 'panel', id: 'd1', foreign: true });
    const shape = r => J([r.how, r.log, r.open, r.pop, r.read, r.land, r.active]);
    const junk = JUNK_LANDS.filter(L => ['window', 'panel', 'go'].some((w, i) => shape(run({ way: w, land: L })) !== shape(plain[i])) || shape(run({ way: 'go', id: 'd1', foreign: true, land: L })) !== shape(plainF));
    const noNav = ['window', 'panel', 'go'].every((w, i) => shape(run({ way: w, land: AT, noNav: true })) === shape(plain[i]) && shape(run({ way: w, land: AT, throws: true })) === shape(plain[i]));
    check('with no landing every way is asked exactly as before, with the page alone: the window, the panel and the reader are handed one argument and the page itself lands nowhere; a landing of junk is no landing (a number, a bare id, a list, an id with a space or markup or past 64 characters, an empty or blank search, a search that is no text), and so is every landing where the cleaner is not there or throws',
        J(plain[0].pop) === J([['p1']]) && J(plain[1].open) === J([['p1']]) && J(plain[2].log) === J(['nav', 'render', 'save']) && plain[2].land.length === 0 && J(plainF.read) === J([['d1']]) && junk.length === 0 && noNav, J([plain, plainF, junk]));
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
    // The owed review, 2026-10-09 (backlog 136): a page past the 12-row limit was marked as seen before the cut, so it stood nowhere on the shelf,
    // pinned or not. A row is seen once it is kept
    const cutC = mkCamp(); for (let i = 0; i < 12; i++) cutC.items['b' + i] = { type: 'planner', meta: { title: 'Bar ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_bar' }] };
    cutC.pinnedPages = ['b11', 'b0']; const cm = S.shelfModel(cutC, 'm_bar', ['b10', 'b1', 'b11']);   // fourteen play here: Bar 10 and Bar 11 are past the limit
    const chainC = mkCamp(); for (let i = 0; i < 8; i++) chainC.items['b' + i] = { type: 'planner', meta: { title: 'Bar ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_bar' }] };
    for (let i = 0; i < 6; i++) chainC.items['c' + i] = { type: 'planner', meta: { title: 'City ' + i }, blocks: [{ type: 'node', title: 'n', linkMapId: 'm_city' }] };
    chainC.pinnedPages = ['c5']; const chm = S.shelfModel(chainC, 'm_bar', ['p_city', 'c0']);   // ten here, two rows left for the map around it: City 0 and City 1
    const pinTwice = mkCamp(); pinTwice.items.m_bar.whiteboard = [{ id: 'w1', type: 'rect', page: 'p_bar' }, { id: 'w2', type: 'rect', page: 'd_rules' }, { id: 'w3', type: 'rect', page: 'd_rules' }]; const ptm = S.shelfModel(pinTwice, 'm_bar', []);
    check('a page past the shelf\'s 12 rows (the owed review of 2026-10-09; shelfModel, run for real): the maps still take 12 rows at most, and a page cut there is free for the rest of the shelf, so a pinned one stands under Pinned and one opened lately under Recent, each once; a page that is kept keeps its one place; along the maps a map is nested in, the same; a page that plays here and is pinned to a piece here, or to two pieces, stands once',
        cm.where.length === 1 && cm.where[0].rows.length === 12 && !ids(cm.where[0].rows).includes('b10') && !ids(cm.where[0].rows).includes('b11') && J(ids(cm.pinned)) === J(['b11']) && J(ids(cm.recent)) === J(['b10'])
        && chm.where.length === 2 && chm.where[0].rows.length === 10 && J(ids(chm.where[1].rows)) === J(['c0', 'c1']) && J(ids(chm.pinned)) === J(['c5']) && J(ids(chm.recent)) === J(['p_city'])
        && ptm.where.length === 2 && ptm.where[0].here === true && ids(ptm.where[0].rows).filter(id => id === 'p_bar').length === 1 && ids(ptm.where[0].rows).filter(id => id === 'd_rules').length === 1,
        J([ids(cm.where[0].rows), ids(cm.pinned), ids(cm.recent), chm.where.map(w => ids(w.rows)), ids(chm.pinned), ids(chm.recent), ptm.where.map(w => ids(w.rows))]));
    check('the maps take 12 rows of the shelf at most, the map on screen first: of fourteen planners that play here twelve are listed and none is left for the maps around it; with ten here, two rows are left for the map it is nested in',
        S.SHELF.here === 12 && bm.where.length === 1 && bm.where[0].rows.length === 12 && bm.where[0].rows[0].id === 'p_fight' && S.shelfModel(big, 'm_city', []).where[0].rows.length === 7
        && fm.where.length === 2 && fm.where[0].rows.length === 10 && fm.where[1].title === 'City' && fm.where[1].rows.length === 2, J(bm.where.map(g => [g.title, g.rows.length])));
}

{
    // The Here and Around rows open a planner at the first node that links to their map (1.5.4, PLANNER_ORG_DESIGN 4.1): that node's block id rides on
    // the row as at, only where it is a sound block id. A page a piece of the map is pinned to, Next scene, Pinned and Recent carry none
    const lc = mkCamp();
    lc.items.p_bar.blocks = [{ type: 'h1', id: 'b_h' }, { type: 'node', id: 'b_tbl', mode: 'table', title: 'x', linkMapId: 'm_bar' }, { type: 'node', id: 'b_other', title: 'Elsewhere', linkMapId: 'm_city' }, { type: 'node', id: 'b_back', title: 'The back room', linkMapId: 'm_bar' }, { type: 'node', id: 'b_cellar', title: 'The cellar', linkMapId: 'm_bar' }];
    lc.items.p_fight.blocks = [{ type: 'node', id: 'x" onclick="y', title: '3.20 Bar fight', linkMapId: 'm_bar' }, { type: 'node', id: 'b_late', title: 'Later', linkMapId: 'm_bar' }];
    lc.items.p_city.blocks = [{ type: 'node', id: 'b_market', title: 'Market', linkMapId: 'm_city' }];
    lc.items.p_free.blocks = [{ type: 'node', title: 'No id', linkMapId: 'm_bar' }];
    lc.items.m_bar.whiteboard = [{ id: 'w1', type: 'rect', page: 'd_rules' }];
    lc.pinnedPages = ['p_table'];
    const bar = S.pagesFor(lc, 'm_bar'), city = S.pagesFor(lc, 'm_city');
    const odd = [5, '', 'x'.repeat(65), 'b k', '<b>', null, ['b_1'], { id: 'b_1' }].map(id => { const c = mkCamp(); c.items.p_bar.blocks = [{ type: 'node', id: id, title: 'T', linkMapId: 'm_bar' }]; return S.pagesFor(c, 'm_bar')[0]; });
    check('a planner that plays on a map knows the node it plays at: the block id of its first node that links to that map (a plain table and a node of another map passed over), the same planner a node of its own for each map; where that first node\'s id is no sound block id (markup, a space, past 64 characters, empty, a number, a list, an object) the row opens at the top, never at a later node',
        J(bar) === J([{ id: 'p_bar', node: 'The back room', n: 2, at: 'b_back' }, { id: 'p_fight', node: '3.20 Bar fight', n: 2 }, { id: 'p_free', node: 'No id', n: 1 }])
        && J(city) === J([{ id: 'p_bar', node: 'Elsewhere', n: 1, at: 'b_other' }, { id: 'p_city', node: 'Market', n: 1, at: 'b_market' }]) && odd.every(r => r && r.n === 1 && !('at' in r)), J([bar, city, odd]));
    const m = S.shelfModel(lc, 'm_bar', ['d_rules', 'p_table', 'p_city']), here = m.where[0], around = m.where[1];
    const atOf = rows => rows.map(r => r.id + ':' + ('at' in r ? r.at : '-'));
    const off = S.shelfModel(lc, '', ['p_bar']);
    check('the shelf\'s rows: under Here a planner opens at its node for this map, under Around at its node for the map around it; a page pinned on this map, the planner marked Next under Next scene, a pinned page and a recent one open as before, at the top, even a planner that has a node here',
        J(atOf(here.rows)) === J(['p_fight:-', 'p_bar:b_back', 'd_rules:-', 'p_free:-']) && around.title === 'City' && J(atOf(around.rows)) === J(['p_city:b_market'])
        && J(atOf(m.pinned)) === J(['p_table:-']) && m.recent.length === 0 && J(atOf(off.next)) === J(['p_fight:-']) && J(atOf(off.recent)) === J(['p_bar:-']), J([atOf(here.rows), atOf(around.rows), atOf(m.pinned), atOf(off.next), atOf(off.recent)]));
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

{
    // a row's node rides as data-at, and only a sound block id reaches the attribute: the draw asks again whatever a model hands it
    const dom = makeDom(), D = new Function('document', drawSrc + '\nreturn { row: shelfRow };')(dom.document);
    const base = { id: 'p_bar', title: 'The Bar', kind: 'planner', sub: '', pinned: false, next: false };
    const rowAt = at => { const r = D.row(Object.assign({}, base, at === undefined ? {} : { at: at }), true); return ['at' in r.dataset ? r.dataset.at : '-', r.children.map(c => c.tagName + '.' + c.className).join(' ')]; };
    const good = rowAt('b_back'), none = rowAt(undefined), bad = ['x" onclick="y', '<b>', 'b k', 'x'.repeat(65), '', 7, { toString: () => 'b_x' }, ['b_1']].map(rowAt);
    check('a row drawn for a planner of the map carries its node as data-at, and nothing else of the row changes; a row with none carries none; a block id that is not sound never reaches the attribute, whatever the model says (markup, a space, past 64 characters, empty, a number, an object, a list)',
        good[0] === 'b_back' && good[1] === 'BUTTON.ps-open BUTTON.ps-win BUTTON.ps-pin' && none[0] === '-' && none[1] === good[1] && bad.every(b => b[0] === '-' && b[1] === good[1]), J([good, none, bad]));
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
    const mk = o => { const dom = makeDom(), doc = dom.document, R = { opened: [], lands: [], pinned: [], drawn: 0, closed: 0, cmdk: 0, focused: 0 };
        const tb = dom.mk('div', 'floating-toolbar'), btn = dom.mk('button', 'wb-tool-btn', null, 'pagesBtn'), menu = dom.mk('div', 'shape-menu page-shelf', null, 'pagesMenu'), board = dom.mk('div', '', null, 'whiteboard');
        const cm = dom.mk('div', '', { id: 'p_bar' }, 'sidebarContextMenu'), pinRow = dom.mk('div', 'menu-item', null, 'ctxPinPage'), head = dom.mk('button', '', null, 'docPanelPin'); cm.style.display = 'block'; cm.appendChild(pinRow);
        [tb, board, cm, head].forEach(e => doc.body.appendChild(e)); tb.appendChild(btn); tb.appendChild(menu); btn.focus = () => { R.focused++; };
        const D = new Function('document', drawSrc + '\nreturn shelfDraw;')(doc), camp = (o && o.camp) || mkCamp(); camp.pinnedPages = ['p_free'];
        const shelfIsOpen = () => menu.classList.contains('show'), shelfClose = () => { if (shelfIsOpen()) { menu.classList.remove('show'); menu.textContent = ''; R.closed++; } }, shelfRender = () => { R.drawn++; D(menu, S.shelfModel(camp, 'm_bar', [])); };
        new Function('document', 'window', 'shelfMenu', 'shelfIsOpen', 'shelfClose', 'shelfRender', 'pinPage', 'openPage', 'pageWay', 'viewNow', wireSrc + '\nshelfWire();')(
            o && o.bare ? { getElementById: () => null, addEventListener: () => { throw new Error('wired with nothing to wire'); } } : doc, { wpCmdkOpen: () => { R.cmdk++; }, wpDocPanel: { openId: () => (o && o.open) || '' } }, () => menu, shelfIsOpen, shelfClose, shelfRender,
            id => { R.pinned.push(id); if (shelfIsOpen()) shelfRender(); }, (id, way, land) => { R.opened.push(id + ':' + way); R.lands.push(land === undefined ? 'none' : J(land)); }, W.way, () => (o && o.view) || 'play');
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
    // 1.5.4 (PLANNER_ORG_DESIGN 4.1): a row of Here hands its node to both presses
    const atCamp = () => { const c = mkCamp(); c.items.p_bar.blocks = [{ type: 'node', id: 'b_back', title: 'The back room', linkMapId: 'm_bar' }]; return c; };
    const pressAt = (id, part, extra) => { const X = mk({ camp: atCamp() }); X.dom.fire(X.btn, 'click'); const row = X.rowOf(id), el = part === 'win' ? row.children[1] : part === 'pin' ? row.children[2] : row.children[0]; X.dom.fire(el, 'click', extra || {}); return [X.R.opened.join(), X.R.lands.join(), X.R.pinned.join()]; };
    const AT = J({ at: 'b_back' });
    check('a row of Here opens its planner at its node, by a press with the keys held and by its window button; a row with no node hands no landing on, and its pin opens nothing',
        J(pressAt('p_bar', 'open')) === J(['p_bar:panel', AT, '']) && J(pressAt('p_bar', 'open', { ctrlKey: true })) === J(['p_bar:window', AT, '']) && J(pressAt('p_bar', 'open', { altKey: true })) === J(['p_bar:go', AT, ''])
        && J(pressAt('p_bar', 'win')) === J(['p_bar:window', AT, '']) && J(pressAt('p_free', 'open')) === J(['p_free:panel', 'null', '']) && J(pressAt('p_free', 'win')) === J(['p_free:window', 'null', '']) && J(pressAt('p_bar', 'pin')) === J(['', '', 'p_bar']),
        J([pressAt('p_bar', 'open'), pressAt('p_free', 'open'), pressAt('p_bar', 'pin')]));
}

/* ---------- the shelf keeps inside the window (1.5.4, backlog 144 (b); found live: 46 px past its right edge in a window 1000 px wide) ---------- */
{
    const wireSrc = sliceOf(ps, 'wire');
    // the shelf as a box laid out round its button: centred on it by the style sheet, then moved by its own left margin
    const mkMenu = (left, width) => ({ style: { marginLeft: '' }, getBoundingClientRect() { const l = left + (parseFloat(this.style.marginLeft) || 0); return { left: l, right: l + width, top: 300, bottom: 700, width: width, height: 400 }; } });
    const fitWith = (W, left, width) => { const m = mkMenu(left, width); new Function('window', wireSrc + '\nreturn shelfFit;')({ innerWidth: W })(m); return [m.style.marginLeft, Math.round(m.getBoundingClientRect().left), Math.round(m.getBoundingClientRect().right)]; };
    const fits = [fitWith(1000, 716, 330), fitWith(1000, -40, 330), fitWith(1000, 300, 330), fitWith(1000, 662, 330), fitWith(300, 100, 330), fitWith(0, 716, 330)];
    check('the shelf is moved back inside the window, 8 px clear of each edge: one that runs past the right edge (716 to 1046 in 1000 px, as found live) by its left margin to end 8 px inside it, one past the left edge to begin 8 px inside it, one inside it left where it is, one ending exactly 8 px inside left too; a window narrower than the shelf keeps its left edge in sight; a window whose width cannot be read moves nothing',
        J(fits) === J([['-54px', 662, 992], ['48px', 8, 338], ['', 300, 630], ['', 662, 992], ['-92px', 8, 338], ['', 716, 1046]]), J(fits));
    // the button's press, run for real through shelfWire on a page of plain objects, and the window's change of size
    const dom = makeDom(), doc = dom.document, btn = dom.mk('button', 'wb-tool-btn', null, 'pagesBtn'), menu = dom.mk('div', 'shape-menu page-shelf', null, 'pagesMenu'), ls = {};
    doc.body.appendChild(btn); doc.body.appendChild(menu); menu.getBoundingClientRect = mkMenu(716, 330).getBoundingClientRect; const win = { innerWidth: 1000, addEventListener: (t, f) => { ls[t] = f; } };
    const open = () => menu.classList.contains('show');
    const later = [];   // the window's change of size fits the shelf in a task of its own, after the tool bar is fitted: run here when the test says
    new Function('document', 'window', 'setTimeout', 'shelfMenu', 'shelfIsOpen', 'shelfClose', 'shelfRender', 'pinPage', 'openPage', 'pageWay', 'viewNow', wireSrc + '\nshelfWire();')(doc, win, f => { later.push(f); }, () => menu, open, () => { menu.classList.remove('show'); }, () => {}, () => {}, () => {}, () => 'panel', () => 'play');
    const tasks = () => { const n = later.length; later.splice(0).forEach(f => f()); return n; };
    dom.fire(btn, 'click'); const a1 = [open(), menu.style.marginLeft];
    win.innerWidth = 1400; ls.resize(); const a1b = menu.style.marginLeft, t1 = tasks(), a2 = menu.style.marginLeft; win.innerWidth = 900; ls.resize(); const t2 = tasks(), a3 = menu.style.marginLeft;
    dom.fire(btn, 'click'); win.innerWidth = 1000; ls.resize(); tasks(); const a4 = [open(), menu.style.marginLeft];
    const fitHalf = (() => { const m = mkMenu(716.5, 330); new Function('window', wireSrc + '\nreturn shelfFit;')({ innerWidth: 1000 })(m); return m.getBoundingClientRect().right; })();
    check('the Pages button fits the shelf it shows into the window (run for real), and a change of the window\'s size fits an open shelf again, in a task of its own so that the tool bar is fitted first: back where the style sheet puts it once it fits, moved further in a narrower window, and a shelf that is put away is left alone; a shelf half a pixel over is moved a whole pixel, never left over the edge',
        J(a1) === J([true, '-54px']) && a1b === '-54px' && t1 === 1 && t2 === 1 && a2 === '' && a3 === '-154px' && J(a4) === J([false, '-154px']) && typeof ls.resize === 'function' && fitHalf <= 992, J([a1, a1b, t1, a2, a3, a4, fitHalf]));
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
        && count(dp, "    if (!made) return false;") === 1 && dp.indexOf("    if (!made) return false;") < dp.indexOf("    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);   // 1.5.4 (pageshelf.js): one of the last pages opened\n    return true;\n}\n") && count(dp, "    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);   // 1.5.4 (pageshelf.js): one of the last pages opened\n    return true;\n}\n") === 1 && count(dp, 'wpPageShelf') === 12 && !dp.includes('\r') && count(dp, '\0') === 3);
    check('the page: the Pages button and its shelf sit on the play map\'s toolbar in a part of it that is the GM\'s alone, the shelf empty until it is drawn; the tree\'s menu has the pin where Open over the map is; the page panel\'s head has its pin before the window button',
        /<div style="position:relative; display:inline-block;" class="gm-only">\n\s*<button class="wb-tool-btn" id="pagesBtn" title="[^"<>]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="[^"<>]+"\/><\/svg><\/button>\n\s*<div class="shape-menu page-shelf" id="pagesMenu"><\/div>\n\s*<\/div>/.test(ix)
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
    check('quick-jump asks the rule before it leaves the map: a page that opens over the map or in a window is handed to the one opener, with the row\'s landing (1.5.4), and nothing else runs, and only the page itself goes on to the old path, which still asks before another campaign replaces a hosted one',
        /^    function cmdkGo\(en, ev\) \{\n        if \(!en\) return;\n        cmdkClose\(\);\n        if \(en\.kind === 'cmd' \|\| en\.kind === 'set'\) \{ if \(window\.wpCommands && typeof window\.wpCommands\.go === 'function'\) window\.wpCommands\.go\(en\); return; \}[^\n]*\n        var way = cmdkWay\(en, ev\);\n        if \(way !== 'go'\) \{ window\.wpPageShelf\.open\(en\.itemId, way, cmdkLand\(en\)\); return; \}[^\n]*\n/.test(go) && /wpConfirmCampaignSwitch\(function\(\) \{ cmdkGoNow\(en\); \}\); return; \}\n        cmdkGoNow\(en\);\n    \}\n/.test(go), go.slice(0, 300));
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

{
    // quick-jump opens a row found by a page's words at those words (1.5.4, PLANNER_ORG_DESIGN 4.1): main.js sliced by its cmdkrows, cmdkway and
    // cmdkgo markers and run for real, with the landing's cleaner as its contract says it and stand-ins that record what they are handed
    const wSrc = sliceOf(mainS, 'cmdkway'), rowsSrc = sliceOf(mainS, 'cmdkrows'), goSrc = sliceOf(mainS, 'cmdkgo');
    const ldOf = nav => new Function('window', 'state', wSrc + '\nreturn cmdkLand;')(nav === false ? {} : { wpPageNav: { landOf: nav || landOfStand } }, { appState: { activeCampaignId: 'c1' } });
    const ld = ldOf(), pg = { kind: 'planner', label: 'P', sub: 'Camp', campId: 'c1', itemId: 'p1' }, hit = q => Object.assign({}, pg, { snippet: 'the <mark>barkeep</mark>', q: q });
    check('a quick-jump row found by a page\'s words has a landing, the words typed cleaned by the one cleaner; a row matched by its name has none, nor has a row whose words do not clean, nor any row where the cleaner is not there or throws',
        J(ld(hit(' barkeep '))) === J({ q: 'barkeep' }) && ld(pg) === null && ld(null) === null && ld(undefined) === null && ld({ kind: 'map', campId: 'c1', itemId: 'm1', label: 'M', sub: 'C' }) === null
        && ['', '   ', 7, null, {}, ['x']].every(v => ld(hit(v)) === null) && ldOf(false)(hit('barkeep')) === null && ldOf(() => { throw new Error('x'); })(hit('barkeep')) === null);
    const rowsOf = (q, search) => { const list = { innerHTML: '' }, st = { appState: { campaigns: { c1: { id: 'c1', name: 'Camp', items: {} } } } };
        return new Function('state', 'window', 'document', 'esc', 'cmdkHintSync', "var _cmdkEntries = [{ kind: 'planner', label: 'Barkeep notes', sub: 'Camp', campId: 'c1', itemId: 'p1' }, { kind: 'map', label: 'The Bar', sub: 'Camp', campId: 'c1', itemId: 'm1' }], _cmdkShown = [], _cmdkIdx = 0;\n" + rowsSrc + '\nreturn function(q) { cmdkRender(q); return _cmdkShown; };')(
            st, { wpDocSearch: search }, { getElementById: () => list }, s => String(s), () => {})(q); };
    const search = (raw, c, types) => [{ id: 'p1', type: 'planner', title: 'Barkeep notes', snippet: 's1' }, { id: 'p2', type: 'planner', title: 'Session 3', snippet: 'the <mark>barkeep</mark> knows' }, { id: 'd1', type: 'doc', title: 'Rules', snippet: 's3' }];
    const typed = rowsOf('  barkeep ', search), empty = rowsOf('', search), keys = typed.map(en => en.itemId + ':' + ('q' in en ? en.q : '-') + ':' + ('snippet' in en ? 's' : '-'));
    check('the rows a page\'s words found keep the words typed, trimmed, beside their snippet; a row matched by its name, the same page found by both too, keeps none; with nothing typed no row keeps any',
        J(keys) === J(['p1:-:-', 'p2:barkeep:s', 'd1:barkeep:s']) && empty.length === 2 && empty.every(en => !('q' in en)), J([keys, empty]));
    // cmdkGo and cmdkGoNow: every way cmdkWay gives
    const goRun = (en, ev, o) => { o = o || {};
        const R = { log: [], shelf: [], read: [], land: [] }, args = a => Array.prototype.slice.call(a);
        const st = { viewMode: 'visual', appState: { activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', activeItemId: 'm1', items: { p1: { id: 'p1', type: 'planner', meta: {} }, d1: { id: 'd1', type: 'doc', meta: {} }, m1: { id: 'm1', type: 'map', meta: {}, rooms: [] } } }, c2: { id: 'c2', activeItemId: null, items: { p9: { id: 'p9', type: 'planner', meta: {} } } } } } };
        const win = { wpPageShelf: { wayNow: e => W.way(o.view || 'play', e), open: function() { R.log.push('shelf'); R.shelf.push(args(arguments)); } }, wpPageNav: { landOf: landOfStand }, wpNet: { foreign: !!o.foreign },
            wpOpenDoc: function() { R.log.push('read'); R.read.push(args(arguments)); }, wpPlannerLand: function() { R.log.push('land'); R.land.push(args(arguments)); }, wpConfirmCampaignSwitch: fn => { R.log.push('ask'); fn(); } };
        new Function('window', 'state', 'cmdkClose', 'save', 'updateCampaignSelect', 'updateSidebarNav', 'render', 'restoreCameraPosition', wSrc + '\n' + goSrc + '\nreturn cmdkGo;')(
            win, st, () => { R.log.push('close'); }, () => { R.log.push('save'); }, () => {}, () => {}, () => { R.log.push('render'); }, () => {})(en, ev);
        return Object.assign(R, { active: st.appState.activeCampaignId + '/' + st.appState.campaigns[st.appState.activeCampaignId].activeItemId }); };
    const QB = { q: 'barkeep' }, cr = hit(' barkeep '), dc = Object.assign({}, cr, { kind: 'doc', itemId: 'd1' }), far = { kind: 'planner', label: 'F', sub: 'Other', campId: 'c2', itemId: 'p9', snippet: 's', q: 'barkeep' };
    const p0 = goRun(cr, null), p1 = goRun(cr, { ctrlKey: true }), p2 = goRun(cr, { altKey: true }), p3 = goRun(far, null), n0 = goRun(pg, null), n2 = goRun(pg, { altKey: true });
    check('quick-jump hands a row\'s landing to every way: over the map and in a window through the one opener, the page itself through the planner\'s own landing once it is drawn and saved, and another campaign\'s page after the question that switches campaigns; a row matched by its name hands none on and the page itself lands nowhere',
        J(p0.shelf) === J([['p1', 'panel', QB]]) && J(p0.log) === J(['close', 'shelf']) && J(p1.shelf) === J([['p1', 'window', QB]]) && J(p2.log) === J(['close', 'save', 'render', 'land']) && J(p2.land) === J([['p1', QB]]) && p2.active === 'c1/p1'
        && J(p3.log) === J(['close', 'ask', 'save', 'render', 'land']) && J(p3.land) === J([['p9', QB]]) && p3.active === 'c2/p9' && J(n0.shelf) === J([['p1', 'panel', null]]) && J(n2.log) === J(['close', 'save', 'render']) && n2.land.length === 0,
        J([p0, p1, p2, p3, n0, n2]));
    const f0 = goRun(dc, { altKey: true }, { foreign: true }), f1 = goRun(Object.assign({}, pg, { kind: 'doc', itemId: 'd1' }), { altKey: true }, { foreign: true }), mp = goRun({ kind: 'map', label: 'M', sub: 'C', campId: 'c1', itemId: 'm1', q: 'barkeep', snippet: 's' }, null);
    check('a joined player\'s reader opens a page at the words a page\'s words found, and with the page alone for a row matched by its name; a map is gone to as before and nothing lands on it',
        J(f0.read) === J([['d1', QB]]) && f0.land.length === 0 && J(f1.read) === J([['d1']]) && f1.land.length === 0 && J(mp.log) === J(['close', 'save', 'render']) && mp.land.length === 0 && mp.shelf.length === 0 && mp.active === 'c1/m1', J([f0, f1, mp]));
}
{
    // the left panel's Search Planners and Search Pages (dialogs.js, sliced by its listland markers with the two lists' own handlers, run for real
    // on a page of plain objects): a typed query's result opens at the hit, an empty query's A to Z list as before
    const dlS = read('scripts/dialogs.js'), lsSrc = sliceOf(dlS, 'listland');
    const hA = "  var _el_searchPlannersBtn = document.getElementById('searchPlannersBtn');", hZ = "  var _el_searchMapsBtn = document.getElementById('searchMapsSidebarBtn');", hdlSrc = dlS.slice(dlS.indexOf(hA), dlS.indexOf(hZ));
    const resEl = () => { let html = ''; const btns = []; return { btns, querySelectorAll: () => btns.slice(), get innerHTML() { return html; }, set innerHTML(v) { html = v; btns.length = 0; (v.match(/data-id="[^"]*"/g) || []).forEach(m => { const b = { dataset: { id: m.slice(9, -1) }, fns: [], addEventListener(ev, fn) { if (ev === 'click') this.fns.push(fn); } }; btns.push(b); }); } }; };
    const dlRun = o => {
        const R = { log: [], land: [], read: [] }, els = {}, args = a => Array.prototype.slice.call(a);
        ['searchPlannersBtn', 'searchDocsBtn', 'plannerSearchClose', 'docSearchClose'].forEach(id => { els[id] = { fn: null, addEventListener(ev, fn) { this.fn = fn; } }; });
        ['plannerSearchModal', 'docSearchModal'].forEach(id => { els[id] = { style: {} }; });
        ['plannerSearchInput', 'docSearchInput'].forEach(id => { els[id] = { value: '', focus() {} }; });
        els.plannerSearchResults = resEl(); els.docSearchResults = resEl();
        const camp = { id: 'c1', activeItemId: 'm1', items: { p1: { type: 'planner', meta: { title: 'Bar' } }, p2: { type: 'planner', meta: { title: 'Alley' } }, d1: { type: 'doc', meta: { title: 'Rules' } }, m1: { type: 'map', meta: {} } } }, st = { selId: 'x', selWbId: 'y', linkStart: 'z' };
        const win = { wpDocSearch: (q, c, types) => types[0] === 'planner' ? [{ id: 'p1', title: 'Bar', snippet: 's' }] : [{ id: 'd1', title: 'Rules', snippet: 's' }], wpNet: { foreign: !!o.foreign },
            wpOpenDoc: function() { R.log.push('read'); R.read.push(args(arguments)); }, wpPlannerLand: function() { R.log.push('land'); R.land.push(args(arguments)); } };
        if (!o.noNav) win.wpPageNav = { landOf: landOfStand };
        new Function('document', 'getActiveCampaign', 'esc', 'window', 'state', 'updateSidebarNav', 'render', 'save', 'setTimeout', lsSrc + hdlSrc)(
            { getElementById: id => els[id] || null }, () => camp, s => String(s), win, st, () => { R.log.push('nav'); }, () => { R.log.push('render'); }, () => { R.log.push('save'); }, () => {});
        const k = o.docs ? 'doc' : 'planner', inp = els[k + 'SearchInput'], res = els[k + 'SearchResults'];
        els[o.docs ? 'searchDocsBtn' : 'searchPlannersBtn'].fn(); inp.value = o.q || ''; inp.onkeyup();
        const b = res.btns.find(x => x.dataset.id === o.pick); if (b) b.fns.forEach(fn => fn.call(b));
        return Object.assign(R, { active: camp.activeItemId, sel: J([st.selId, st.selWbId, st.linkStart]), shown: res.btns.map(x => x.dataset.id), modal: els[k + 'SearchModal'].style.display }); };
    const QB = J([{ q: 'barkeep' }]);
    const pT = dlRun({ q: ' barkeep ', pick: 'p1' }), pE = dlRun({ q: '', pick: 'p2' }), pB = dlRun({ q: '   ', pick: 'p2' }), pN = dlRun({ q: 'barkeep', pick: 'p1', noNav: true });
    const dT = dlRun({ docs: true, q: 'barkeep', pick: 'd1' }), dE = dlRun({ docs: true, q: '', pick: 'd1' }), fT = dlRun({ docs: true, q: 'barkeep', pick: 'd1', foreign: true }), fE = dlRun({ docs: true, q: '', pick: 'd1', foreign: true });
    check('Search Planners and Search Pages open a typed query\'s result at the hit: the page itself as a click in the tree opens it, then the planner\'s own landing with the words typed, trimmed; an empty or blank query\'s A to Z list opens as before and lands nowhere, and so does every result where the cleaner is not there',
        J(pT.log) === J(['nav', 'render', 'save', 'land']) && J(pT.land.map(x => x[1])) === QB && pT.land[0][0] === 'p1' && pT.active === 'p1' && pT.sel === J([null, null, null]) && pT.modal === 'none'
        && J(pE.log) === J(['nav', 'render', 'save']) && pE.active === 'p2' && J(pE.shown) === J(['p2', 'p1']) && J(pB.log) === J(['nav', 'render', 'save']) && J(pN.log) === J(['nav', 'render', 'save'])
        && J(dT.log) === J(['nav', 'render', 'save', 'land']) && J(dT.land) === J([['d1', { q: 'barkeep' }]]) && J(dE.log) === J(['nav', 'render', 'save']), J([pT, pE, pB, pN, dT, dE]));
    check('a joined player\'s result of Search Pages opens in the reader at the hit, and with the page alone from the A to Z list; the page itself is never opened there',
        J(fT.read) === J([['d1', { q: 'barkeep' }]]) && J(fT.log) === J(['read']) && fT.active === 'm1' && J(fE.read) === J([['d1']]) && J(fE.log) === J(['read']), J([fT, fE]));
}
{
    // the page itself lands once it is drawn (planner.js, sliced by its plannerland markers and run for real on a page of plain objects, the
    // draw's diagrams run through a promise of the suite's own, the landing's cleaner as its contract says it and pagenav's landing a recorder)
    const pl = read('scripts/planner.js'), plSrc = sliceOf(pl, 'plannerland');
    const plRun = o => { o = o || {};
        const dom = makeDom(), doc = dom.document, R = { land: [], find: [], fc: 0, mm: [], log: [] };
        const pv = dom.mk('div', '', null, 'plannerPreview'), box = dom.mk('input', '', null, 'plannerFind'); doc.body.appendChild(box);
        const wrap = o.hand !== undefined || o.wrap ? dom.mk('div', '', null, 'plannerWrap') : null, fld = dom.mk('input'); if (wrap) { doc.body.appendChild(wrap); wrap.appendChild(fld); wrap.appendChild(pv); } else doc.body.appendChild(pv);   // the planner's wrap holds the editor's fields and the preview
        const page = { id: 'p1', type: 'planner', blocks: [{ id: 'b_a', type: 'h1' }, 'junk', { id: 'b_c', type: 'node' }, { id: 'b_d', type: 'text' }, Object.create({ id: 'b_inh' })] }, other = { id: 'p2', type: 'planner', blocks: [] };
        [0, 2, 3].forEach(i => { const b = dom.mk('div', 'pv-blk', { blk: i }); b.appendChild(doc.createTextNode('block ' + i)); pv.appendChild(b); doc.body.appendChild(dom.mk('div', 'planner-block-edit', { idx: i })); });
        doc.body.appendChild(dom.mk('div', 'planner-block-edit', { idx: 4 }));   // the block whose id the page only inherits has its editor box too
        let active = o.none ? null : page, now = 1000; const sp = syncPromise();
        const win = { mermaid: o.mermaid ? {} : undefined }; if (o.hand) win.wpDocPanel = { hand: o.hand };
        if (o.junk) pv.appendChild(dom.mk('div', 'pv-blk', { blk: '0x2' }));   // a drawn block whose number is no number (Number would read it as 2)
        if (o.preLit) pv.children.find(c => c.dataset.blk === o.preLit).classList.add('pagenav-hit');   // a block lit a moment before (an Outline row)
        const lights = o.lights === undefined ? '3' : o.lights;   // the block a landing at words lights, as pagenav.js lights the block it lands on (none for null)
        if (o.noLand) win.wpPageNav = { landOf: landOfStand };   // a page navigation with no landing of its own
        else if (!o.noNav) win.wpPageNav = { landOf: landOfStand, land: (root, it, land) => { R.log.push('land'); R.land.push([root === pv, it === page, J(land)]); if (!o.landFails && land && land.q && lights !== null) { const b = pv.children.find(c => c.dataset.blk === lights); if (b) b.classList.add('pagenav-hit'); } return !o.landFails; } };
        const findApply = keep => { R.log.push('find'); R.find.push([box.value, keep]); const blk = pv.children.find(c => c.dataset.blk === '3'); blk.appendChild(dom.mk('mark', 'pf-hit pf-cur')); };
        const api = new Function('window', 'document', 'getActiveMap', 'setTimeout', 'Date', 'plannerFindApply', 'mermaid', 'Promise', 'fcPostProcess', 'var plannerFullscreen = ' + !!o.full + ';\n' + plSrc
            + '\nreturn { draw: runPreviewMermaid, land: plannerLand, pending: function() { return _pvLand; } };')(
            win, doc, () => active, dom.setTimeout, { now: () => now }, findApply, { run: arg => { R.mm.push(arg); return {}; } }, sp.P, () => { R.log.push('fc'); R.fc++; });
        const ed = i => doc.querySelectorAll('.planner-block-edit').find(e => e.dataset.idx === String(i)).calls.filter(c => c === 'scrollIntoView').length;
        return { api, R, page, other, ed: () => [0, 2, 3].map(ed), ed4: () => ed(4), set: p => { active = p; }, tick: ms => { now += ms; }, settle: sp.settle, first: sp.first, timers: () => dom.page.timers.length, run: dom.runTimers, box, dom, pv, wrap, fld }; };
    const AT = { at: 'b_c' };
    const A = plRun(); A.api.draw('p1'); const k1 = A.api.land('p1', AT), t1 = A.timers(), before = A.R.land.length; A.run(); const a1 = [J(A.R.land), J(A.ed()), A.api.pending()];
    A.api.draw('p1'); A.run(); A.api.land('p1', null); A.run(); const a2 = [A.R.land.length, A.timers()];
    check('the page itself lands at a block once it is drawn: the landing is kept, then made in a turn of its own after the draw has finished, through pagenav\'s landing on the planner\'s preview with the page drawn there; in the editing view the editor\'s own box for that block is scrolled to as well; it is used once, so a later draw lands nothing, and a landing of junk is none',
        k1 === true && t1 === 1 && before === 0 && a1[0] === J([[true, true, J(AT)]]) && a1[1] === J([0, 1, 0]) && a1[2] === null && J(a2) === J([1, 0]), J([k1, t1, before, a1, a2]));
    const B = plRun({ full: true }); B.api.draw('p1'); B.api.land('p1', AT); B.run(); const C = plRun(); C.api.draw('p1'); C.api.land('p1', { at: 'b_zz' }); C.run(); const C2 = plRun(); C2.api.draw('p1'); C2.api.land('p1', { at: 'b_inh' }); C2.run();
    const Fl = plRun({ landFails: true }); Fl.api.draw('p1'); Fl.api.land('p1', AT); Fl.run();
    check('the reading view shows the preview alone, so only the preview is landed; a block that is not in the page, or whose id the page only inherits, scrolls no editor box, and nor does a landing pagenav could not make',
        B.R.land.length === 1 && J(B.ed()) === J([0, 0, 0]) && C.R.land.length === 1 && J(C.ed()) === J([0, 0, 0]) && C2.R.land.length === 1 && J(C2.ed()) === J([0, 0, 0]) && C2.ed4() === 0 && Fl.R.land.length === 1 && J(Fl.ed()) === J([0, 0, 0]), J([B.ed(), C.ed(), C2.ed(), Fl.ed()]));
    const M = plRun({ mermaid: true }); M.api.draw('p1'); M.api.land('p1', AT); const m1 = [M.timers(), M.R.land.length, J(M.R.mm)]; M.api.draw('p1'); M.first(); const m15 = [M.timers(), M.R.fc]; M.settle(); const m2 = [M.timers(), M.R.fc]; M.run(); const m3 = [M.R.land.length, J(M.R.log)];
    const Fz = plRun({ mermaid: true }); Fz.api.draw('p1'); Fz.api.land('p1', AT); Fz.settle(new Error('the diagram library failed')); Fz.run(); const fz = [Fz.R.land.length, Fz.R.fc];
    const W2 = plRun(); W2.set(W2.page); W2.api.land('p1', AT); const w1 = [W2.timers(), !!W2.api.pending()]; W2.api.draw('p1'); W2.run(); const w2 = W2.R.land.length;
    check('a landing waits for the render it belongs to: for the draw of its page, and for that draw\'s diagrams to be laid out after the diagram library and the pass that follows it, and lands too where the library fails; a draw made meanwhile is the one waited for, and the older one\'s word is passed over, so it lands once and only after the newer draw',
        J(m1) === J([0, 0, J([{ querySelector: '#plannerPreview .mermaid' }])]) && J(m15) === J([0, 1]) && J(m2) === J([1, 2]) && J(m3) === J([1, J(['fc', 'fc', 'land'])]) && J(w1) === J([0, true]) && w2 === 1 && J(fz) === J([1, 0]), J([m1, m15, m2, m3, w1, w2, fz]));
    const X = plRun(); X.set(X.other); X.api.draw('p2'); X.api.land('p1', AT); const x1 = [X.timers(), X.api.pending()]; X.set(X.page); X.api.draw('p1'); X.run();
    const Y = plRun({ mermaid: true }); Y.api.draw('p1'); Y.api.land('p1', AT); Y.set(Y.other); Y.settle(); const y1 = Y.api.pending(); Y.set(Y.page); Y.api.draw('p1'); Y.settle(); Y.run();
    const Z = plRun({ mermaid: true }); Z.api.draw('p1'); Z.api.land('p1', AT); Z.tick(8001); Z.settle(); Z.run();
    const J2 = plRun({ mermaid: true }); J2.api.draw('p1'); J2.api.land('p1', AT); J2.api.land('p1', { at: 'b k' }); J2.settle(); J2.run();
    const N = plRun({ noNav: true }); N.api.draw('p1'); const n1 = N.api.land('p1', AT); N.run(); const E = plRun({ none: true }); E.api.draw('p1'); E.api.land('p1', AT); E.run();
    check('a landing for a page that is not the one on screen is dropped, at once or while it waits, and never made when that page comes back; one that has waited past 8 seconds is dropped; a landing of junk drops one that waited; with no cleaner there is no landing, and with no page on screen none is kept',
        x1[0] === 0 && x1[1] === null && X.R.land.length === 0 && y1 === null && Y.R.land.length === 0 && Z.R.land.length === 0 && J2.R.land.length === 0 && n1 === false && N.R.land.length === 0 && E.R.land.length === 0 && E.api.pending() === null, J([x1, y1, Y.R.land, Z.R.land, J2.R.land]));
    // the review of step 1 (2026-10-16): words land as a block does, through pagenav's landing, which lights the block (the planner's own Find never
    // lit it, nor read a chart's label, and the words it was given stayed in its box, so every later draw of the preview scrolled back to them)
    const Q1 = plRun(); Q1.box.value = 'typed before'; Q1.api.draw('p1'); Q1.api.land('p1', { q: '  the barkeep ' }); Q1.run(); const QF = plRun({ full: true }); QF.api.draw('p1'); QF.api.land('p1', { q: 'barkeep' }); QF.run();
    const QP = plRun({ preLit: '0' }); QP.api.draw('p1'); QP.api.land('p1', { q: 'barkeep' }); QP.run(); const QN = plRun({ lights: null }); QN.api.draw('p1'); QN.api.land('p1', { q: 'barkeep' }); QN.run();
    const QJ = plRun({ junk: true, lights: '0x2' }); QJ.api.draw('p1'); QJ.api.land('p1', { q: 'barkeep' }); QJ.run();
    let nlErr = ''; const NL = plRun({ noLand: true }); NL.api.draw('p1'); const nl = NL.api.land('p1', AT); try { NL.run(); } catch (e) { nlErr = String(e); }
    const T2 = plRun(); T2.api.draw('p1'); T2.api.land('p1', AT); T2.api.land('p1', { q: 'x' }); const t2 = T2.timers(); T2.run();
    check('a search text lands as a block does, through pagenav\'s landing on the preview with the page drawn there (the review of step 1): the planner\'s own Find is never run and its box keeps what it held; in the editing view the editor\'s box of the block the landing lit is scrolled to — the one it lit, not one lit a moment before, and none where it lit none or lit a block whose number is no number —; a page navigation with no landing of its own lands nothing and throws nothing; a second landing before the first is made takes its place, in the one turn already asked for',
        J(Q1.R.land) === J([[true, true, J({ q: 'the barkeep' })]]) && Q1.R.find.length === 0 && Q1.box.value === 'typed before' && J(Q1.ed()) === J([0, 0, 1]) && J(QF.ed()) === J([0, 0, 0]) && QF.R.land.length === 1
        && J(QP.ed()) === J([0, 0, 1]) && J(QN.ed()) === J([0, 0, 0]) && QN.R.land.length === 1 && J(QJ.ed()) === J([0, 0, 0]) && QJ.R.land.length === 1 && nl === true && nlErr === '' && J(NL.ed()) === J([0, 0, 0]) && NL.api.pending() === null
        && t2 === 1 && J(T2.R.land) === J([[true, true, J({ q: 'x' })]]) && T2.R.find.length === 0, J([Q1.R, Q1.ed(), QF.R, QP.ed(), QN.ed(), QJ.ed(), t2, T2.R]));
    // and run whole: planner.js's find and plannerland slices and its renderPlannerPreview, beside pagenav.js's own outline, fold and land slices, on
    // a page of plain objects. The block that holds the words is lit, a chart's label read; the planner's Find box keeps what it held, so a later
    // draw of the preview scrolls nowhere and another planner opens with nothing marked
    // a landing is not made where the reader has moved the page by their own hand since it was asked for (the maintainer's decision, found live:
    // a chart drawn above the landed block moves scrollTop, so a judge by scrollTop would never land): docpanel.js readerHand, run for real on the
    // planner's own wrap, the preview and the editor inside it; judged by their input, never by scrollTop
    const dpH = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'utf8'), handSrc = dpH.slice(dpH.indexOf('// [textcheck:panelhand-start]'), dpH.indexOf('// [textcheck:panelhand-end]'));
    if (handSrc.length < 200) throw new Error('shelfcheck: docpanel.js has no panelhand slice');
    const handOn = o => { const H = new Function(handSrc + '\nreturn readerHand;')(); const P = plRun(Object.assign({ mermaid: true, hand: H }, o)); return P; };
    const hk = [];
    for (const [name, act] of [['none', null], ['wheel', P => P.dom.fire(P.wrap, 'wheel')], ['press', P => P.dom.fire(P.pv, 'pointerdown')], ['key', P => P.dom.fire(P.pv, 'keydown', { key: 'PageDown' })], ['field key', P => P.dom.fire(P.fld, 'keydown', { key: 'ArrowDown' })], ['other key', P => P.dom.fire(P.pv, 'keydown', { key: 'a' })], ['scrollTop', P => { P.pv.scrollTop = 300; P.wrap.scrollTop = 300; }], ['before', 'before']]) {
        const P = handOn(); P.api.draw('p1');
        if (act === 'before') { P.dom.fire(P.wrap, 'wheel'); P.api.land('p1', AT); } else { P.api.land('p1', AT); if (act) act(P); }
        P.settle(); P.run(); hk.push([name, P.R.land.length, P.api.pending()]);
    }
    const NH = plRun({ mermaid: true, hand: null, wrap: true }); NH.api.draw('p1'); NH.api.land('p1', AT); NH.dom.fire(NH.wrap, 'wheel'); NH.settle(); NH.run();
    check('the page itself is not landed where the reader has moved the page by their own hand since the landing was asked for (planner.js pvHand with docpanel.js readerHand, run for real): a wheel on the planner, a press on its preview and a key that scrolls there drop it, and so the landing is not made when its diagrams are laid out; a key typed into a field or any other key does not, nor a change of scrollTop alone, nor anything the reader did before it was asked for; where no watch is published it lands as before',
        J(hk) === J([['none', 1, null], ['wheel', 0, null], ['press', 0, null], ['key', 0, null], ['field key', 1, null], ['other key', 1, null], ['scrollTop', 1, null], ['before', 1, null]]) && NH.R.land.length === 1, J([hk, NH.R.land]));
    const pnW = read('scripts/pagenav.js'), pnCut = n => { const a = pnW.indexOf('// [pagecheck:' + n + '-start]'), z = pnW.indexOf('// [pagecheck:' + n + '-end]'); if (a < 0 || z < a) throw new Error('shelfcheck: pagenav.js has no ' + n + ' slice'); return pnW.slice(a, z); };
    const plCut = (a, z) => { const i = pl.indexOf(a), k = pl.indexOf(z, i); if (i < 0 || k < 0) throw new Error('shelfcheck: planner.js has no ' + a); return pl.slice(i, k); };
    const pfSrc = plCut('// [textcheck:find-start]', '// [textcheck:find-end]'), rppSrc = plCut('  function renderPlannerPreview() {', '  function renderPlannerPreviewCore() {');
    const whole = o => { o = o || {};
        const dom = makeDom(), doc = dom.document;
        dom.Text.prototype.splitText = function(at) { const rest = new dom.Text(this.nodeValue.slice(at)); this.nodeValue = this.nodeValue.slice(0, at); const l = this.parentNode.childNodes; l.splice(l.indexOf(this) + 1, 0, rest); rest.parentNode = this.parentNode; return rest; };
        dom.El.prototype.normalize = function() { for (let i = 0; i < this.childNodes.length; i++) { const n = this.childNodes[i]; if (n.nodeType !== 3) { n.normalize(); continue; } if (!n.nodeValue) { this.childNodes.splice(i--, 1); continue; } const nx = this.childNodes[i + 1]; if (nx && nx.nodeType === 3) { n.nodeValue += nx.nodeValue; this.childNodes.splice(i + 1, 1); i--; } } };
        const pv = dom.mk('div', '', null, 'plannerPreview'), box = dom.mk('input', '', null, 'plannerFind'), cnt = dom.mk('span', '', null, 'plannerFindCount'); [box, cnt, pv].forEach(e => doc.body.appendChild(e));
        const timers = [], st = (fn, ms) => { timers.push({ fn: fn, ms: ms || 0 }); return timers.length; }, store = { data: {}, getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); } };
        const win = { localStorage: store, innerWidth: 1000, innerHeight: 800, addEventListener() {} }, camp = { id: 'c1', activeItemId: 'p1' };
        const nav = new Function('document', 'window', 'location', 'setTimeout', 'URLSearchParams', 'getActiveCampaign', pnCut('outline') + pnCut('fold') + pnCut('land') + '\nreturn { landOf: landOf, land: land, flash: navFlash, foldReveal: foldReveal };')(doc, win, { search: '' }, st, URLSearchParams, () => camp);
        win.wpPageNav = { landOf: nav.landOf, land: nav.land, flash: nav.flash, reveal: el => nav.foldReveal(pv, el, false) };
        let active = null, api = null;
        const part = b => b.chart ? dom.mk('div', 'diagram fc-box', null) : doc.createElement(b.type === 'h2' ? 'h2' : 'p');
        const drawPage = page => { while (pv.firstChild) pv.removeChild(pv.firstChild); const w = dom.mk('div', 'wrap'); pv.appendChild(w);
            page.blocks.forEach((b, i) => { const d = dom.mk('div', 'pv-blk', { blk: String(i) }), p = part(b); d.appendChild(p); w.appendChild(d);
                if (!b.chart) { p.appendChild(doc.createTextNode(b.text)); return; }
                const svg = doc.createElement('svg'), sty = doc.createElement('style'), g = dom.mk('g', 'node'), fo = doc.createElement('foreignObject'), dv = doc.createElement('div'), sp = dom.mk('span', 'nodeLabel'), bb = doc.createElement('b');
                sty.appendChild(doc.createTextNode('.nodeLabel { color: red } the guards')); sp.appendChild(doc.createTextNode(b.chart[0])); bb.appendChild(doc.createTextNode(b.chart[1])); sp.appendChild(bb);
                dv.appendChild(sp); fo.appendChild(dv); g.appendChild(fo); svg.appendChild(sty); svg.appendChild(g); p.appendChild(svg); }); };
        api = new Function('window', 'document', 'getActiveMap', 'setTimeout', 'Date', 'mermaid', 'Promise', 'fcPostProcess', 'renderPlannerPreviewCore', 'var plannerFullscreen = ' + !!o.full + ';\n' + pfSrc + '\n' + plSrc + '\n' + rppSrc
            + '\nreturn { draw: runPreviewMermaid, land: plannerLand, rpp: renderPlannerPreview };')(win, doc, () => active, st, { now: () => 1000 }, undefined, Promise, () => {}, () => { drawPage(active); api.draw(active.id); });
        [0, 1, 2, 3, 4].forEach(i => doc.body.appendChild(dom.mk('div', 'planner-block-edit', { idx: String(i) })));
        const run = () => { for (let g = 0; g < 50; g++) { const i = timers.findIndex(t => t.ms < 1000); if (i < 0) break; timers.splice(i, 1)[0].fn(); } };
        const lit = () => pv.all().filter(e => e.classList.contains('pagenav-hit')).map(e => e.dataset.blk), marks = () => pv.querySelectorAll('mark.pf-hit').length;
        const scrolled = () => pv.all().filter(e => e.calls.indexOf('scrollIntoView') >= 0).map(e => (e.dataset && e.dataset.blk) || e.nodeName), ed = () => doc.querySelectorAll('.planner-block-edit').map(e => e.calls.filter(c => c === 'scrollIntoView').length);
        return { api, box, cnt, run, lit, marks, scrolled, ed, set: p => { active = p; } };
    };
    const WP1 = { id: 'p1', type: 'planner', blocks: [{ id: 'b_a', type: 'h2', text: 'Arrival' }, { id: 'b_b', type: 'p', text: 'The guards wait here.' }, { id: 'b_c', type: 'h2', text: 'The ambush' }, { id: 'b_d', type: 'p', text: 'Bandits ambush the party at the bridge.' }, { id: 'b_e', chart: ['Start ', 'here'] }] };
    const WP2 = { id: 'p2', type: 'planner', blocks: [{ id: 'b_x', type: 'h2', text: 'Another planner' }, { id: 'b_y', type: 'p', text: 'An old ambush site on the hill.' }] };
    const V1 = whole(); V1.set(WP1); V1.api.rpp(); V1.api.land('p1', { q: 'AMBUSH' }); V1.run(); const v1 = [V1.lit(), V1.scrolled(), J(V1.ed()), V1.box.value, V1.cnt.textContent, V1.marks()];
    V1.api.rpp(); V1.api.rpp(); const v1b = [V1.scrolled(), V1.marks(), V1.lit()]; V1.set(WP2); V1.api.rpp(); const v1c = [V1.scrolled(), V1.marks(), V1.box.value];
    const V2 = whole(); V2.set(WP1); V2.api.rpp(); V2.api.land('p1', { q: 'start here' }); V2.run(); const v2 = [V2.lit(), J(V2.ed())];
    const V3 = whole({ full: true }); V3.box.value = 'guards'; V3.set(WP1); V3.api.rpp(); const v3a = V3.marks(); V3.api.land('p1', { q: 'bandits' }); V3.run(); const v3 = [v3a, V3.lit(), V3.box.value, J(V3.ed())];
    const V4 = whole(); V4.set(WP1); V4.api.rpp(); V4.api.land('p1', { at: 'b_d' }); V4.run(); const v4 = [V4.lit(), V4.scrolled(), J(V4.ed())];
    check('the page itself opened at words, run whole on the real code (planner.js\'s Find, its landing and its preview\'s redraw, with pagenav.js\'s own landing; the review of step 1): the first block that holds the words is scrolled to and lit, and the editor\'s box for it in the editing view; nothing is written into the planner\'s Find box and nothing marked, so later draws of the preview scroll nowhere and another planner opens with nothing marked; words a chart holds as its label are found; a Find typed by hand stays as it was; a block lands as before',
        J(v1) === J([['2'], ['2'], J([0, 0, 1, 0, 0]), '', '', 0]) && J(v1b) === J([[], 0, []]) && J(v1c) === J([[], 0, '']) && J(v2) === J([['4'], J([0, 0, 0, 0, 1])])
        && J(v3) === J([1, ['3'], 'guards', J([0, 0, 0, 0, 0])]) && J(v4) === J([['3'], ['3'], J([0, 0, 0, 1, 0])]), J([v1, v1b, v1c, v2, v3, v4]));
    check('the planner draws through the one word and publishes the landing once: both of the preview\'s draws say which page it now holds, and the diagram run ends in that draw\'s word, after the pass that follows it',
        count(pl, '          runPreviewMermaid(activeMap.id);\n          return;\n') === 1 && count(pl, '      preview.innerHTML = plannerPreviewHtml(activeMap, getActiveCampaign());\n      runPreviewMermaid(activeMap.id);\n') === 1 && count(pl, 'runPreviewMermaid(') === 3
        && count(pl, "Promise.resolve(mermaid.run({ querySelector: '#plannerPreview .mermaid' })).then(fcPostProcess).catch(function() {}).then(function() { pvLaidOut(gen); }); } catch(e) { pvLaidOut(gen); }") === 1 && count(pl, 'window.wpPlannerLand = plannerLand;') === 1);
}
{
    // a player's reader lands once the page is drawn (handbook.js, sliced by its readerland markers and run for real on plain objects)
    const hb = read('scripts/handbook.js'), rdSrc = sliceOf(hb, 'readerland');
    const rdRun = o => { o = o || {};
        const R = { land: [], log: [], mm: 0 };
        const body = { innerHTML: '', scrollTop: 40, clientWidth: 500, querySelectorAll: () => (o.diagrams ? [{}] : []), on: {}, addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }, fire(t, e) { (this.on[t] || []).forEach(f => f(Object.assign({ type: t }, e || {}))); } }, other = { innerHTML: '', clientWidth: 500, querySelectorAll: () => (o.diagrams ? [{}] : []) };
        const els = { docReaderModal: { style: { display: 'none' } }, docReaderBody: body, docReaderTitle: { textContent: '' } };
        const camp = { id: 'c1', items: { d1: { type: 'doc', meta: { title: 'Rules' } }, d2: { type: 'doc', meta: { title: 'More' } }, p1: { type: 'planner', meta: {} } } }, name = it => Object.keys(camp.items).find(k => camp.items[k] === it) || '?';
        const sp = syncPromise();
        const win = { mermaid: o.diagrams ? {} : undefined, wpFcPostProcess: () => { R.log.push('fc'); } }; if (o.hand) win.wpDocPanel = { hand: o.hand };
        if (!o.noNav) win.wpPageNav = { landOf: landOfStand, land: (root, it, land) => { R.log.push('land'); R.land.push([root === body, name(it), J(land)]); return true; } };
        const api = new Function('window', 'document', 'ui', 'getActiveCampaign', 'renderDoc', 'srcOf', 'sigOf', 'foreign', 'setMermaidMode', 'mermaid', 'setTimeout', 'Promise', "var openDocId = null, openCampId = null, openSig = '';\n" + rdSrc
            + '\nreturn { open: openDoc, close: closeDoc, page: renderPage, into: renderInto };')(
            win, { querySelector: () => null, body: { classList: { add() {}, remove() {} } } }, id => els[id] || null, () => camp, it => { R.log.push('draw:' + name(it)); return '<div></div>'; }, p => p, () => 'sig', () => false, () => {}, { run: () => { R.mm++; return {}; } }, fn => fn(), sp.P);
        return { api, R, body, other, camp, settle: sp.settle }; };
    const AT = { at: 'b_k3' };
    const A = rdRun(), a0 = A.api.open('d1', AT), a1 = J(A.R.log); A.api.into(A.body, A.camp.items.d1); A.api.open('d1'); const a2 = A.R.land.length;
    const P1 = rdRun(), p0 = P1.api.open('d1', { q: '  the barkeep ' }), Pl = rdRun(), pl0 = Pl.api.open('p1', AT);
    const jk = JUNK_LANDS.map(L => { const X = rdRun(); X.api.open('d1', L); return X.R.land.length; }), nn = rdRun({ noNav: true }); nn.api.open('d1', AT);
    check('the reader opens a page at a landing once it is drawn: pagenav\'s landing on the reader\'s body with the page drawn there, used once, so a refresh or an open with no landing lands nothing; a search text is trimmed; a planner opens nothing; a landing of junk, or no cleaner, lands nothing',
        a0 === true && a1 === J(['draw:d1', 'land']) && J(A.R.land) === J([[true, 'd1', J(AT)]]) && a2 === 1 && p0 === true && J(P1.R.land) === J([[true, 'd1', J({ q: 'the barkeep' })]]) && pl0 === false && Pl.R.land.length === 0
        && jk.every(n => n === 0) && nn.R.land.length === 0, J([a0, a1, A.R.land, P1.R.land, jk]));
    const M = rdRun({ diagrams: true }); M.api.open('d1', AT); const m1 = [M.R.land.length, M.R.mm]; M.api.page(M.other, M.camp.items.d2); M.settle(); const m2 = J(M.R.log);
    const S2 = rdRun({ diagrams: true }); S2.api.open('d1', AT); S2.api.open('d2'); S2.settle(); const S3 = rdRun({ diagrams: true }); S3.api.open('d1', AT); S3.api.open('d2', { q: 'ledger' }); S3.settle();
    const Cl = rdRun({ diagrams: true }); Cl.api.open('d1', AT); Cl.api.close(); Cl.settle();
    check('a reader\'s landing waits for the page\'s diagrams and the pass that follows them, and only the reader\'s latest draw makes it: a page drawn meanwhile elsewhere (a sheet\'s handbook search) neither makes nor drops it; a page opened since drops it, or makes its own landing alone; a closed reader lands nothing',
        J(m1) === J([0, 1]) && m2 === J(['draw:d1', 'draw:d2', 'fc', 'land', 'fc']) && J(M.R.land) === J([[true, 'd1', J(AT)]]) && S2.R.land.length === 0 && J(S3.R.land) === J([[true, 'd2', J({ q: 'ledger' })]]) && Cl.R.land.length === 0, J([m1, m2, S2.R.land, S3.R.land, Cl.R.land]));
    // and a reader's landing likewise (handbook.js rdHand with docpanel.js readerHand, run for real)
    const dpR = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'utf8'), handR = dpR.slice(dpR.indexOf('// [textcheck:panelhand-start]'), dpR.indexOf('// [textcheck:panelhand-end]'));
    const rk = [];
    for (const [name, act] of [['none', null], ['wheel', b => b.fire('wheel')], ['touch', b => b.fire('touchstart')], ['key', b => b.fire('keydown', { key: 'End', target: { nodeName: 'P' } })], ['field key', b => b.fire('keydown', { key: 'End', target: { nodeName: 'INPUT' } })], ['scrollTop', b => { b.scrollTop = 900; }]]) {
        const X = rdRun({ diagrams: true, hand: new Function(handR + '\nreturn readerHand;')() }); X.api.open('d1', AT); if (act) act(X.body); X.settle(); rk.push([name, X.R.land.length]);
    }
    check('a reader\'s landing is not made where the reader has moved the page by their own hand since it was asked for (handbook.js rdHand with docpanel.js readerHand, run for real): a wheel, a touch and a key that scrolls on the reader\'s page drop it, so it is not made once the diagrams are laid out; a key typed into a field does not, nor a change of scrollTop alone',
        J(rk) === J([['none', 1], ['wheel', 0], ['touch', 0], ['key', 0], ['field key', 1], ['scrollTop', 1]]), J(rk));
}

/* ---------- the play map's Next scene row ---------- */
{
    check('Next scene, on the play map\'s right-click menu, opens by the same rule and decides nothing itself: a plain click over the map, Ctrl a window, Alt the planner; its tooltip says so',
        count(wb, "else if (act === 'scene') { if (window.wpPageShelf) window.wpPageShelf.open(it.dataset.id, window.wpPageShelf.wayNow(ce)); }") === 1 && !/act === 'scene'\) \{[^\n]*activeItemId/.test(wb)
        && count(wb, 'title="The planner marked Next. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the planner itself.">&#9654; Next scene: ') === 1 && /it\.addEventListener\('click', function\(ce\) \{/.test(wb));
}

/* ---------- the page panel's tabs (docpanel.js) ---------- */
const dpS = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'utf8');
const dpSlice = n => { const a = dpS.indexOf('// [shelfcheck:' + n + '-start]'), z = dpS.indexOf('// [shelfcheck:' + n + '-end]'); if (a < 0 || z < a) throw new Error('shelfcheck: the ' + n + ' slice of docpanel.js is not marked'); return dpS.slice(a, z); };
const tabsSrc = dpSlice('tabs'), tabdoSrc = dpSlice('tabdo');
{
    const dom = makeDom(), T = new Function('document', tabsSrc + '\nreturn { MAX: TAB_MAX, wth: tabsWith, without: tabsWithout, kept: tabsKept, title: tabTitle, draw: tabsDraw };')(dom.document);
    const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], list = ['a', 'b', 'c'];
    check('a page opened in the panel takes a tab at the end; one that is open already keeps its place; the panel holds eight, and a ninth takes the place of the oldest; the list handed in is never changed',
        J(T.wth([], 'a')) === J(['a']) && J(T.wth(list, 'd')) === J(['a', 'b', 'c', 'd']) && J(T.wth(list, 'b')) === J(['a', 'b', 'c']) && T.wth(list, 'b') !== list && J(list) === J(['a', 'b', 'c']) && T.MAX === 8 && J(T.wth(nine, 'i')) === J(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) && J(T.wth(nine, 'c')) === J(nine));
    check('a tab that closes: when it was in front, the page that took its place comes to the front, or the one before it when it was the last; when another tab closes the one in front stays; the last tab leaves none; a tab that is not there changes nothing',
        J(T.without(list, 'b', 'b')) === J({ tabs: ['a', 'c'], front: 'c' }) && J(T.without(list, 'c', 'c')) === J({ tabs: ['a', 'b'], front: 'b' }) && J(T.without(list, 'a', 'a')) === J({ tabs: ['b', 'c'], front: 'b' }) && J(T.without(list, 'a', 'c')) === J({ tabs: ['b', 'c'], front: 'c' })
        && J(T.without(['a'], 'a', 'a')) === J({ tabs: [], front: '' }) && J(T.without(list, 'z', 'b')) === J({ tabs: ['a', 'b', 'c'], front: 'b' }) && J(T.without(list, 'z', 'z')) === J({ tabs: ['a', 'b', 'c'], front: '' }) && J(T.without(list, 'b', 'gone')) === J({ tabs: ['a', 'c'], front: '' }));
    const camp = mkCamp(), protoC = { items: Object.assign(Object.create({ p_ghost: { type: 'planner', meta: { title: 'Ghost' } } }), camp.items) };
    check('only pages that are still there keep a tab: a page that was deleted, a map, a name the list only inherits and an id that is no text have none; with no campaign there is none',
        J(T.kept(['p_bar', 'gone', 'm_bar', 'd_rules', 'toString', 7, null, 'p_free'], camp)) === J(['p_bar', 'd_rules', 'p_free']) && J(T.kept(['p_ghost', 'p_bar'], protoC)) === J(['p_bar']) && J(T.kept(['p_bar'], null)) === '[]' && J(T.kept(['p_bar'], {})) === '[]');
    check('a tab is named by its page\'s title as text, one line, eighty characters at most; a page with no title by its kind',
        T.title({ type: 'planner', meta: { title: '  The <b>Bar</b>\n scene ' } }) === 'The <b>Bar</b> scene' && T.title({ type: 'doc', meta: {} }) === 'Page' && T.title({ type: 'planner' }) === 'Planner' && T.title({ type: 'doc', meta: { title: 7 } }) === 'Page' && T.title({ type: 'doc', meta: { title: 'x'.repeat(200) } }).length === 80 && T.title(null) === 'Page');
    const strip = dom.document.createElement('div'); strip.style.display = 'none';
    const one = T.draw(strip, ['p_bar'], 'p_bar', camp), oneState = [one, strip.style.display, strip.children.length];
    camp.items.p_free.meta.title = '<img src=x onerror=alert(1)>';
    let threw = ''; let n = 0; try { n = T.draw(strip, ['p_bar', 'p_free', 'd_rules'], 'p_free', camp); } catch (e) { threw = e.message; }
    const tabsEl = strip.children, shape = tabsEl.map(t => t.className + ':' + t.dataset.id + ':' + t.children.map(c => c.tagName + '.' + c.className).join('+')), names = tabsEl.map(t => t.children[0].textContent);
    check('the strip is hidden while one page is open, so the panel looks as it always did; with more it is drawn with elements and text nodes on a page that refuses markup: a tab for each page with its name and a close button, the one in front marked; a hostile title is text',
        J(oneState) === J([0, 'none', 0]) && threw === '' && n === 3 && strip.style.display === 'flex' && J(shape) === J(['docpanel-tab:p_bar:BUTTON.docpanel-tab-name+BUTTON.docpanel-tab-x', 'docpanel-tab on:p_free:BUTTON.docpanel-tab-name+BUTTON.docpanel-tab-x', 'docpanel-tab:d_rules:BUTTON.docpanel-tab-name+BUTTON.docpanel-tab-x'])
        && J(names) === J(['3.10 The Bar', '<img src=x onerror=alert(1)>', 'House rules']) && tabsEl[1].all().length === 2, J([oneState, threw, n, shape, names]));
    check('a tab says what it is: the one in front is pressed, the others are not; the name is also its tooltip, cut names can be read; the close button says which page it closes; drawn again the strip holds only the new tabs',
        J(tabsEl.map(t => t.children[0].attrs['aria-pressed'])) === J(['false', 'true', 'false']) && tabsEl[0].children[0].title === '3.10 The Bar' && tabsEl[0].children[1].title === 'Close this tab' && tabsEl[0].children[1].attrs['aria-label'] === 'Close 3.10 The Bar' && tabsEl[0].children[1].textContent === ''
        && tabsEl.every(t => t.children.every(b => b.type === 'button')) && (T.draw(strip, ['p_bar', 'd_rules'], 'd_rules', camp), strip.children.length) === 2 && (T.draw(strip, ['d_rules'], 'd_rules', camp), strip.children.length) === 0 && strip.style.display === 'none');
}
{
    // the tab functions run for real, beside a draw and a close of the suite's own that record what they are asked
    const mk = () => { const dom = makeDom(), strip = dom.mk('div', '', null, 'docPanelTabs'), body = { scrollTop: 0 }, camp = mkCamp(), R = { drawn: [], closed: 0, told: [], stripDraws: 0 };
        const ui = id => id === 'docPanelTabs' ? strip : id === 'docPanelBody' ? body : null;
        const api = new Function('ui', 'activeCamp', 'window', 'document', 'R', "var openId = '', lastSig = 'old', tabs = [], tabTop = Object.create(null), tabSig = '';\n" + tabsSrc.replace('function tabsDraw(strip, list, front, camp) {', 'function tabsDraw(strip, list, front, camp) { R.stripDraws++;') + '\n' + tabdoSrc
            + "\nfunction draw(force) { R.drawn.push(openId + (force ? '!' : '') + ':' + lastSig); tabsSync(activeCamp()); }\nfunction close() { R.closed++; openId = ''; tabs = []; }\n"
            + "return { keep: tabKeep, sync: tabsSync, front: tabFront, shut: tabClose, get: function() { return { front: openId, tabs: tabs.slice(), top: Object.assign({}, tabTop) }; }, set: function(f, t) { openId = f; tabs = t.slice(); } };")(
            ui, () => camp, { wpPageShelf: { opened: id => { R.told.push(id); } } }, dom.document, R);
        return { api, R, strip, body, camp }; };
    const A = mk(); A.api.set('p_bar', ['p_bar', 'p_free', 'd_rules']); A.body.scrollTop = 320; A.api.front('d_rules'); const a1 = A.api.get(), d1 = A.R.drawn.slice(), t1 = A.R.told.slice();
    A.body.scrollTop = 90; A.api.front('p_bar'); const a2 = A.api.get(); A.api.front('p_bar'); A.api.front('nope'); A.api.front('m_bar'); const a3 = [A.R.drawn.length, A.R.told.length];
    A.api.shut('d_rules'); const a4 = J(A.api.get().top);
    check('a press on a tab brings its page to the front: where the page in front was scrolled to is kept, the page is drawn anew, and the shelf is told so that the head\'s pin follows; a press on the tab in front, or for a page that has no tab, does nothing; a tab that is closed forgets where its page was scrolled to',
        a1.front === 'd_rules' && J(a1.top) === J({ p_bar: 320 }) && J(d1) === J(['d_rules!:']) && J(t1) === J(['d_rules']) && a2.front === 'p_bar' && J(a2.top) === J({ p_bar: 320, d_rules: 90 }) && J(a3) === J([2, 2]) && a4 === J({ p_bar: 320 }), J([a1, d1, t1, a2, a3, a4]));
    const B = mk(); B.api.set('p_free', ['p_bar', 'p_free', 'd_rules']); B.api.sync(B.camp); const before = B.R.stripDraws; B.api.shut('p_bar'); const b1 = B.api.get(), bd1 = [B.R.drawn.length, B.R.told.length, B.R.stripDraws - before];
    B.api.shut('p_free'); const b2 = B.api.get(), bd2 = [J(B.R.drawn), J(B.R.told)]; B.api.shut('d_rules'); const b3 = [B.api.get().front, J(B.api.get().tabs), B.R.closed];
    check('a tab that is closed: one that is not in front only redraws the strip and the page stays; the one in front hands the front to the page beside it, which is drawn and told to the shelf; the last one closes the panel',
        b1.front === 'p_free' && J(b1.tabs) === J(['p_free', 'd_rules']) && J(bd1) === J([0, 0, 1]) && b2.front === 'd_rules' && J(b2.tabs) === J(['d_rules']) && J(bd2) === J([J(['d_rules!:']), J(['d_rules'])]) && J(b3) === J(['', '[]', 1]), J([b1, bd1, b2, bd2, b3]));
    const C = mk(); C.api.set('p_free', ['p_bar', 'p_free', 'd_rules']); delete C.camp.items.p_free; delete C.camp.items.d_rules; C.api.shut('p_free'); const c1 = C.api.get();
    const D = mk(); D.api.set('p_free', ['p_free', 'p_bar']); delete D.camp.items.p_free; delete D.camp.items.p_bar; D.api.shut('p_free'); const d2 = [D.api.get().front, D.R.closed];
    check('a page that was deleted while it had a tab: its tab goes, a tab whose page is gone too is not brought forward, and the panel closes when none is left',
        c1.front === 'p_bar' && J(c1.tabs) === J(['p_bar']) && J(d2) === J(['', 1]), J([c1, d2]));
    const E = mk(); E.api.set('p_bar', ['p_bar', 'p_free']); E.api.sync(E.camp); E.api.sync(E.camp); const e1 = E.R.stripDraws; E.camp.items.p_free.meta.title = 'Renamed'; E.api.sync(E.camp); const e2 = [E.R.stripDraws, E.strip.children[1].children[0].textContent];
    E.api.set('d_rules', ['p_bar', 'p_free']); E.api.sync(E.camp); const e3 = [J(E.api.get().tabs), E.R.stripDraws]; delete E.camp.items.p_bar; E.api.sync(E.camp); const e4 = J(E.api.get().tabs); E.api.sync(null); const e5 = E.R.stripDraws;
    check('the strip is drawn only when its pages, one of their names or the page in front changed, so a redraw of the app costs it nothing; a page shown that has no tab yet gets one; a page that is gone loses its tab; with no campaign nothing is drawn',
        e1 === 1 && J(e2) === J([2, 'Renamed']) && J(e3) === J([J(['p_bar', 'p_free', 'd_rules']), 3]) && e4 === J(['p_free', 'd_rules']) && e5 === 4, J([e1, e2, e3, e4, e5]));
    const F = mk(); F.api.set('', []); F.body.scrollTop = 50; F.api.keep(); F.api.set('p_bar', ['p_bar']); F.api.keep(); const f1 = J(F.api.get().top);
    check('where a page is scrolled to is kept under its own id, and nothing is kept while the panel is closed', f1 === J({ p_bar: 50 }), f1);
    check('the panel\'s own code asks these and nothing else: a page opened takes a tab before it becomes the page in front; a page that is gone has its tab closed; the strip follows each draw; a page drawn again keeps its place and a tab brought forward comes back where it was left; closing the panel closes every tab and empties the strip; the window button closes the tab of the page it sent away; a press, and the middle button, on the strip; the module publishes its tabs',
        count(dpS, "    tabKeep(); tabs = tabsWith(tabsKept(tabs, camp), id);") === 1 && dpS.indexOf("tabKeep(); tabs = tabsWith(tabsKept(tabs, camp), id);") < dpS.indexOf("    openId = id; lastSig = '';\n    var p = ui('docPanel'); if (!p) return;")
        && count(dpS, "    if (!it || (it.type !== 'doc' && it.type !== 'planner')) { tabClose(openId); return; }") === 1 && count(dpS, "    var t = ui('docPanelTitle'); if (t) t.textContent = title;\n    tabsSync(camp);") === 1
        && count(dpS, "    var keep = drawnId === openId ? body.scrollTop : (tabTop[openId] || 0); drawnId = openId;") === 1
        && count(dpS, "function close() { openId = ''; lastSig = ''; tabs = []; tabTop = Object.create(null); tabSig = ''; drawnId = ''; var strip = ui('docPanelTabs'); if (strip) { strip.textContent = ''; strip.style.display = 'none'; } clearMarks();") === 1
        && count(dpS, "        if (openId && popOut(openId)) tabClose(openId);") === 1
        && count(dpS, "strip.addEventListener('click', function(e) { var tab = e.target.closest ? e.target.closest('.docpanel-tab') : null; if (!tab) return; if (e.target.closest('.docpanel-tab-x')) tabClose(tab.dataset.id); else tabFront(tab.dataset.id); });") === 1
        && count(dpS, "strip.addEventListener('auxclick', function(e) { var tab = e.button === 1 && e.target.closest ? e.target.closest('.docpanel-tab') : null; if (tab) { e.preventDefault(); tabClose(tab.dataset.id); } });") === 1
        && count(dpS, "openId: function() { return openId; }, tabs: function() { return tabs.slice(); } };") === 1 && !/innerHTML = [^;]*tab/i.test(dpS));
    check('the page: the strip stands under the panel\'s head, empty and hidden until a second page is open; its close mark is drawn by the style sheet, so the script stays plain ASCII beside its NUL bytes; the head\'s close button says it closes every tab',
        /id="docPanelClose" title="Close the panel and every tab in it \(Esc\)">&times;<\/button><\/div>\n    <div id="docPanelTabs" class="docpanel-tabs" role="toolbar" aria-label="Pages open in this panel" style="display:none;"><\/div>\n    <div id="docPanelSearchRow">/.test(ix)
        && /\n\s*\.docpanel-tab-x::before \{ content: "\\00d7"; \}/.test(css) && /\n\s*\.docpanel-tab\.on \{ background: var\(--panel2\); border-color: var\(--gold\); opacity: 1; \}/.test(css) && /\n\s*\.docpanel-tabs \{ display: flex; [^\n]*overflow-x: auto;/.test(css)
        && !/[^\x00-\x7f]/.test(tabsSrc + tabdoSrc) && !dpS.includes('\r') && count(dpS, '\0') === 3);
}

/* ---------- the page panel's place (docpanel.js, 1.5.4; found live: after a restart it opened in the window's top left corner at its smallest) ---------- */
{
    const placeSrc = dpSlice('place'), spLine = (() => { const i = dpS.indexOf('    function savePos() {'); return i < 0 ? '' : dpS.slice(i, dpS.indexOf('\n', i)); })();
    const PR = new Function(placeSrc + '\nreturn placeRec;')();
    const recs = [PR({ left: 10.4, top: 20.6, width: 440.2, height: 300 }), PR({ left: 0, top: 0, width: 0, height: 0 }), PR({ left: 5, top: 5, width: 300, height: 0 }), PR({ left: 5, top: 5, width: 0, height: 200 }), PR(null)];
    check('a place is kept only from a panel that has a size: one measured while floats.js has the panel put away (a size of 0) is no place, and one with a size is its corner and size in whole pixels',
        J(recs) === J([{ x: 10, y: 21, w: 440, h: 300 }, null, null, null, null]), J(recs));
    // savePos, run for real: the observer of the panel's size calls it whenever the panel's inline display is not none, which a panel put away by a class still is
    const save = rect => { const store = {}; new Function('p', 'localStorage', placeSrc + '\n' + spLine + '\nreturn savePos;')({ getBoundingClientRect: () => rect }, { setItem: (k, v) => { store[k] = v; } })(); return store.wp_docPanel || null; };
    const saved = [save({ left: 0, top: 0, width: 0, height: 0 }), save({ left: 120, top: 80, width: 440, height: 500 })];
    // place, run for real against what the computer kept
    const put = kept => { const p = { style: {} }, win = { innerWidth: 1366, innerHeight: 850 }; new Function('ui', 'localStorage', 'window', placeSrc + '\nplace();')(id => id === 'docPanel' ? p : null, { getItem: k => k === 'wp_docPanel' ? kept : null }, win); return p.style; };
    const placed = [put(J({ x: 0, y: 0, w: 0, h: 0 })), put(J({ x: 300, y: 140, w: 0, h: 0 })), put(J({ x: 300, y: 140, w: 500, h: 0 })), put(J({ x: 300, y: 140, w: 500, h: 420 })), put(J({ x: 300, y: 140 })), put(null), put('7'), put('"x"'), put('{bad')];
    check('the panel opens where it was left, and never at a place measured while it was put away: a record with a size of 0 (the zeros already saved on a computer too) is passed over whole and the panel opens where it opens by default; a record with a size puts it there at that size; an older record with no size puts it there; nothing kept, a number, a text and a record that does not read are passed over; the size observer\'s save keeps no place of a panel that has no size',
        J(placed) === J([{}, {}, {}, { left: '300px', top: '140px', right: 'auto', width: '500px', height: '420px' }, { left: '300px', top: '140px', right: 'auto' }, {}, {}, {}, {}])
        && saved[0] === null && J(JSON.parse(saved[1])) === J({ x: 120, y: 80, w: 440, h: 500 }) && count(dpS, 'savePos();') === 2 && count(dpS, "localStorage.setItem('wp_docPanel'") === 1, J([placed, saved]));
}

/* ---------- the page-text search reads a planner's nodes ---------- */
{
    const fold = dpS.slice(dpS.indexOf('// [textcheck:panelfold-start]'), dpS.indexOf('// [textcheck:panelfold-end]'));
    const srch = dpS.slice(dpS.indexOf('function searchAll(q, camp, types) {'), dpS.indexOf('function renderResults(list) {'));
    const X = new Function('activeCamp', "var openId = '';\n" + fold + '\n' + srch + '\nreturn { blockText: blockText, docText: docText, searchAll: searchAll };')(() => null);
    const node = { type: 'node', title: 'The <b>Seahorse</b>', tag: 'taverna', must: 'find the <i>ledger</i>', cols: ['Action', 7, 'Why'], rows: [{ col1: 'Bribe the barkeep', col2: 'he knows Ysk', col9: 42 }, null, { col1: 'Wait', col3: ['x'] }], linkMapId: 'm_bar' };
    const chart = { type: 'flowchart', nodes: [{ id: 'a', text: 'Arrive at the dock' }, null, { id: 'b', text: 9 }, { id: 'c' }], edges: [{ from: 'a', to: 'b', text: 'if followed' }, { from: 'b', to: 'c' }, 'junk'] };
    check('a planner\'s node is page text: its name, its tag, its Must resolve line, its column headings and every cell of its rows, typed markup left out and anything that is no text passed over; a flowchart\'s labels are page text too, the boxes\' and the arrows\'',
        X.blockText(node) === 'The Seahorse taverna find the ledger Action Why Bribe the barkeep he knows Ysk Wait' && X.blockText(chart) === 'Arrive at the dock if followed' && X.blockText({ type: 'node' }) === '' && X.blockText({ type: 'flowchart' }) === '' && X.blockText({ type: 'node', rows: 'x', cols: 'y', title: 5 }) === '', J([X.blockText(node), X.blockText(chart)]));
    check('what was read before is read as before: a heading, a text, a picture\'s caption, a plain table; a diagram written as source is still skipped',
        X.blockText({ type: 'h1', title: 'Title', sub: 'Sub' }) === 'Title Sub' && X.blockText({ type: 'text', content: '<p>Some <b>bold</b> words</p>' }) === 'Some bold words' && X.blockText({ type: 'image', caption: 'A map', alt: 'alt' }) === 'A map alt'
        && X.blockText({ type: 'table', title: 'T', cols: ['A', 'B'], rows: [['x', 'y'], { cells: ['z'] }] }) === 'T A B x y z' && X.blockText({ type: 'diagram', content: 'graph TD; a-->b' }) === '' && X.blockText(null) === '' && X.blockText({ type: 'unknown' }) === '');
    const camp = { id: 'c', items: { p1: { type: 'planner', meta: { title: 'Session 3' }, blocks: [{ type: 'h1', title: 'Session 3' }, node] }, p2: { type: 'planner', meta: { title: 'Other' }, blocks: [{ type: 'text', content: 'nothing here' }, chart] }, d1: { type: 'doc', meta: { title: 'Rules' }, blocks: [{ type: 'text', content: 'the barkeep rule' }] } } };
    const r1 = X.searchAll('barkeep', camp, ['planner']), r2 = X.searchAll('ledger', camp), r3 = X.searchAll('if followed', camp), r4 = X.searchAll('barkeep', camp);
    check('so a word that stands only in a node\'s table finds its planner, with the word marked in the snippet: in the search of the Planners list, in quick-jump and in the panel, which all ask this one search; a flowchart\'s label finds its page too',
        r1.length === 1 && r1[0].id === 'p1' && /<mark>barkeep<\/mark>/i.test(r1[0].snippet) && r2.length === 1 && r2[0].id === 'p1' && /<mark>ledger<\/mark>/.test(r2[0].snippet) && r3.length === 1 && r3[0].id === 'p2' && J(r4.map(r => r.id).sort()) === J(['d1', 'p1'])
        && count(dpS, "        case 'node': return stripMarkup(") === 1 && count(dpS, "        case 'flowchart': return stripMarkup(") === 1 && /window\.wpDocSearch = function\(q, camp, types\) \{ return searchAll\(q, camp, types\); \};/.test(dpS), J([r1, r2, r3.map(r => r.id), r4.map(r => r.id)]));
}

/* ---------- map pins: a piece of the play map that opens a page ---------- */
{
    const M = new Function(waySrc + '\n' + shelfSrc + '\nreturn { may: mapPinMay, of: mapPinOf, put: mapPinPut, choices: mapPinChoices, on: mapPinsOn, model: shelfModel };')();
    const camp = mkCamp(), pc = (o) => Object.assign({ id: 'w1', type: 'image', x: 0, y: 0, w: 50, h: 50 }, o || {});
    check('a pin may sit on a picture (a token is one) or a plain shape, and on nothing else: not a text box, a pen line, a trigger zone or a light source, not a waiting token or a GM note card, and not what is no piece',
        ['image', 'rect', 'circle', 'hexagon', 'diamond'].every(t => M.may(pc({ type: t }))) && M.may(pc({ isChar: true })) && ['text', 'path', 'trigger', 'light', 'toString', 'constructor', undefined, ''].every(t => !M.may(pc({ type: t })))
        && !M.may(pc({ waiting: true })) && !M.may(pc({ gmNoteFor: 'x' })) && !M.may(pc({ id: 7 })) && !M.may(null) && !M.may('image') && !M.may(undefined));
    check('the page a piece opens is the planner or handbook page its key names, and nothing else is a link: a page that is gone, a map, a name a prototype holds, an id with a space or markup in it or past 80 characters, a number, a list; a piece that may carry none opens none whatever its key says',
        M.of(camp, pc({ page: 'p_bar' })) === camp.items.p_bar && M.of(camp, pc({ type: 'rect', page: 'd_rules' })) === camp.items.d_rules && M.of(camp, pc({ page: 'gone' })) === null && M.of(camp, pc({ page: 'm_bar' })) === null && M.of(camp, pc({ page: 'constructor' })) === null
        && M.of(camp, pc({ page: 'p bar' })) === null && M.of(camp, pc({ page: '<b>' })) === null && M.of(camp, pc({ page: 'x'.repeat(81) })) === null && M.of(camp, pc({ page: 7 })) === null && M.of(camp, pc({ page: ['p_bar'] })) === null && M.of(camp, pc({})) === null
        && M.of(camp, pc({ type: 'text', page: 'p_bar' })) === null && M.of(camp, pc({ waiting: true, page: 'p_bar' })) === null && M.of(null, pc({ page: 'p_bar' })) === null
        && (() => { const o = mkCamp(); o.items['bad id'] = { type: 'planner', meta: { title: 'There, under an id no link may hold' } }; o.items['x'.repeat(81)] = { type: 'doc', meta: {} }; return M.of(o, pc({ page: 'bad id' })) === null && M.of(o, pc({ page: 'x'.repeat(81) })) === null && M.put(o, pc(), 'bad id') === ''; })());
    const a = pc(), r1 = M.put(camp, a, 'p_bar'), v1 = a.page, r2 = M.put(camp, a, 'p_bar'), r3 = M.put(camp, a, 'd_rules'), v3 = a.page, r4 = M.put(camp, a, ''), has4 = 'page' in a, r5 = M.put(camp, a, '');
    const b = pc({ page: 'p_bar' }), r6 = M.put(camp, b, 'gone'), has6 = 'page' in b, t = pc({ type: 'text', page: 'p_bar' }), r7 = M.put(camp, t, 'd_rules'), has7 = 'page' in t, t2 = pc({ type: 'text' }), r8 = M.put(camp, t2, 'p_bar');
    check('a pin is set and taken off by one call that says what it did: set, cleared, or nothing when nothing changed; an id that names no page takes the link off; a piece that may carry none takes none and loses a stale one; what is no piece is left alone',
        r1 === 'set' && v1 === 'p_bar' && r2 === '' && r3 === 'set' && v3 === 'd_rules' && r4 === 'cleared' && has4 === false && r5 === '' && r6 === 'cleared' && has6 === false && r7 === 'cleared' && has7 === false && r8 === '' && !('page' in t2)
        && M.put(camp, null, 'p_bar') === '' && M.put(camp, 'x', 'p_bar') === '' && M.put(camp, pc(), 'm_bar') === '' && M.put(camp, pc(), 'constructor') === '' && M.put(camp, pc(), 5) === '', J([r1, r2, r3, r4, r5, r6, r7, r8]));
    const odd = mkCamp(); odd.items['bad id'] = { type: 'planner', meta: { title: 'Aaa first by name' } }; const ch = M.choices(odd);
    check('the pages a pin may name are every planner and handbook page of the campaign, planners first, each kind in the order a reader expects; a map is not on the list, nor a page whose id could not be kept as a link',
        J(ch.map(c => c.id)) === J(['p_bar', 'p_fight', 'p_city', 'p_free', 'p_table', 'd_rules']) && J(ch.map(c => c.kind)) === J(['planner', 'planner', 'planner', 'planner', 'planner', 'doc']) && ch[0].title === '3.10 The Bar' && ch[5].title === 'House rules' && M.choices(null).length === 0 && M.choices({}).length === 0, J(ch.map(c => c.id + ':' + c.title)));
    const pm = mkCamp(); pm.items.m_bar.whiteboard = [pc({ id: 'a', page: 'd_rules' }), pc({ id: 'b', type: 'rect', page: 'p_free' }), pc({ id: 'c', page: 'd_rules' }), pc({ id: 'd', type: 'text', page: 'p_city' }), pc({ id: 'e', page: 'gone' }), null, 'junk', pc({ id: 'f', hidden: true, page: 'p_city' })];
    pm.items.m_city.whiteboard = [pc({ id: 'g', page: 'p_table' })];
    const on = M.on(pm, 'm_bar'), model = M.model(pm, 'm_bar', []), here = model.where[0], around = model.where[1];
    check('the pages pinned on a map are read from its pieces, each once, in the pieces\' order, a hidden piece\'s too (the shelf is the GM\'s own); the shelf lists them under Here beside the planners that play there, and a pin on a map this one is nested in is not listed for this one',
        J(on) === J(['d_rules', 'p_free', 'p_city']) && M.on(pm, 'm_world').length === 0 && M.on(pm, 'nope').length === 0 && M.on(null, 'm_bar').length === 0
        && here.here === true && J(here.rows.map(r => r.id)) === J(['p_fight', 'p_bar', 'p_city', 'd_rules', 'p_free']) && J(here.rows.slice(2).map(r => r.sub)) === J(['pinned on this map', 'pinned on this map', 'pinned on this map']) && here.rows[3].kind === 'doc'
        && model.where.length === 1 && around === undefined && !J(model).includes('p_table'), J([on, here.rows.map(r => r.id + ':' + r.sub), model.where.length]));
}
{
    // the GM's gate: what the board and Properties ask
    const src = waySrc + '\n' + shelfSrc + '\n' + sliceOf(ps, 'mappin');
    const mk = win => { const camp = mkCamp(); return { camp, api: new Function('window', 'getActiveCampaign', src + '\nreturn { gm: mapPinGm, pin: mapPin, field: mapPinField, set: mapPinSet };')(win, () => camp) }; };
    const piece = () => ({ id: 'w1', type: 'image', page: 'p_bar' });
    const gm = mk({}), host = mk({ wpNet: { active: true, role: 'host', foreign: false } }), idle = mk({ wpNet: { active: false, role: null } });
    const others = [{ wpNet: { active: true, role: 'client' } }, { wpNet: { foreign: true, active: false } }, { wpStream: true }, { wpPopout: true }, { wpStream: true, wpNet: { active: true, role: 'host' } }].map(mk);
    check('pins are the GM\'s alone: on the GM\'s own screen, hosting or not, a piece that opens a page says which, by id and name; on a player\'s app, at someone else\'s table, in the stream window and in a window of its own there is none, nothing to show in Properties and nothing can be set',
        [gm, host, idle].every(w => w.api.gm() === true && J(w.api.pin(piece())) === J({ id: 'p_bar', title: '3.10 The Bar' })) && gm.api.pin({ id: 'w1', type: 'image' }) === null && gm.api.pin({ id: 'w1', type: 'image', page: 'gone' }) === null
        && others.every(w => { const p = piece(); return w.api.gm() === false && w.api.pin(p) === null && w.api.field(p) === null && w.api.set(p, 'd_rules') === '' && w.api.set(p, '') === '' && p.page === 'p_bar'; }));
    const f1 = gm.api.field(piece()), f2 = gm.api.field({ id: 'w1', type: 'rect' }), f3 = gm.api.field({ id: 'w1', type: 'rect', page: 'gone' }), p2 = piece(), s1 = gm.api.set(p2, 'd_rules'), s2 = gm.api.set(p2, '');
    check('Properties is told the page a piece opens now and the pages on offer; a piece with no link, or with one to a page that is gone, shows None; a piece that may carry no pin has no row at all; the setter is the one call and says what it did',
        f1.cur === 'p_bar' && f1.choices.length === 6 && f2.cur === '' && f2.choices.length === 6 && f3.cur === '' && gm.api.field({ id: 'w1', type: 'text', page: 'p_bar' }) === null && gm.api.field(null) === null && s1 === 'set' && s2 === 'cleared' && !('page' in p2), J([f1.cur, f2.cur, f3.cur, s1, s2]));
}
{
    // the board (whiteboard.js): the menu row, the mark, and the mark kept across redraws
    const wbS = sliceOf(wb, 'pagepin'), esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mk = pins => { const dom = makeDom(), R = { opened: [] };
        const win = { wpPageShelf: pins === null ? undefined : { mapPin: w => (w && Object.prototype.hasOwnProperty.call(pins, w.id) ? pins[w.id] : null), open: (id, way) => { R.opened.push(id + ':' + way); }, wayNow: e => W.way('play', e) } };
        const api = new Function('window', 'document', 'esc', wbS + '\nreturn { of: pagePinOf, row: pagePinRow, mark: pagePinMark, sync: pagePinSync };')(win, dom.document, esc);
        const host = () => { const kids = []; return { kids, querySelector: s => (s === ':scope > .wb-pin' ? kids.find(k => k.className === 'wb-pin') || null : null), appendChild: k => { kids.push(k); k.remove = () => { kids.splice(kids.indexOf(k), 1); }; return k; } }; };
        return { dom, R, api, host }; };
    const HOSTILE = '<img src=x onerror=alert(1)> "Bar" & grill';
    const A = mk({ a: { id: 'p_bar', title: HOSTILE }, b: { id: 'd_rules', title: 'Rules' } });
    const row = A.api.row([{ id: 'a' }]), two = A.api.row([{ id: 'a' }, { id: 'b' }]), none = [A.api.row([{ id: 'z' }]), A.api.row([]), A.api.row(null), A.api.row([null, { id: 'a' }]) && A.api.row([null, { id: 'a' }]).id];
    check('the right-click menu of one selected piece that opens a page has an Open page row, the page\'s name escaped in it; several pieces, or a piece with no link, have none; the row carries the page for its press',
        row.id === 'p_bar' && row.html === '<div class="menu-item cm-open-page" title="A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself.">&#128209; Open page: &lt;img src=x onerror=alert(1)&gt; &quot;Bar&quot; &amp; grill</div>'
        && two === null && J(none) === J([null, null, null, 'p_bar']) && mk(null).api.row([{ id: 'a' }]) === null, J([row, two, none]));
    const h = A.host(); A.api.sync(h, { id: 'a' }, false); const m1 = h.kids[0], d1 = m1 ? [m1.tagName, m1.type, m1.className, m1.dataset.page, m1.dataset.name, m1.dataset.tip, m1.attrs['aria-label'], m1.childNodes.length] : null;
    A.api.sync(h, { id: 'a' }, false); const same = h.kids.length === 1 && h.kids[0] === m1;
    check('a piece that opens a page wears a mark: one button at its corner, empty (its sign is the style sheet\'s), carrying the page and, as plain text, its name in a tooltip and a label; drawn again it is the same mark, not a second one',
        !!m1 && J(d1) === J(['BUTTON', 'button', 'wb-pin', 'p_bar', HOSTILE, 'Opens ' + HOSTILE + '. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself.', 'Open ' + HOSTILE, 0]) && same, J(d1));
    const stops = ['pointerdown', 'mousedown', 'dblclick'].map(ev => A.dom.fire(m1, ev).stopped), c1 = A.dom.fire(m1, 'click'), c2 = A.dom.fire(m1, 'click', { ctrlKey: true }), c3 = A.dom.fire(m1, 'click', { altKey: true });
    const ctx = A.dom.fire(m1, 'contextmenu').stopped;
    check('a press on the mark is no press on the piece, so nothing is selected, dragged or opened but the page: the mark stops the press, and a click opens the page by the one rule with the keys held; a right-click goes on to the piece\'s own menu',
        J(stops) === J([true, true, true]) && c1.stopped === true && c1.prevented === true && J(A.R.opened) === J(['p_bar:panel', 'p_bar:window', 'p_bar:go']) && ctx === false, J([stops, A.R.opened, ctx]));
    const pins = { a: { id: 'p_bar', title: 'Old name' } }, B = mk(pins), hb = B.host(); B.api.sync(hb, { id: 'a' }, false); const mark = hb.kids[0];
    pins.a = { id: 'p_bar', title: 'New name' }; B.api.sync(hb, { id: 'a' }, false); const renamed = [hb.kids.length, hb.kids[0] === mark, mark.dataset.name, mark.dataset.tip.slice(0, 15)];
    pins.a = { id: 'd_rules', title: 'Rules' }; B.api.sync(hb, { id: 'a' }, false); const moved = [mark.dataset.page, mark.attrs['aria-label']]; B.dom.fire(mark, 'click'); const after = J(B.R.opened);
    pins.a = { id: 'p_twin', title: 'Rules' }; B.api.sync(hb, { id: 'a' }, false); const twin = [hb.kids.length, hb.kids[0] === mark, mark.dataset.page, mark.dataset.name]; B.dom.fire(mark, 'click'); const afterTwin = J(B.R.opened);
    B.api.sync(hb, { id: 'a' }, true); const hid = hb.kids.length; B.api.sync(hb, { id: 'a' }, false); const back = hb.kids.length; delete pins.a; B.api.sync(hb, { id: 'a' }, false); const gone = hb.kids.length; B.api.sync(hb, { id: 'a' }, false);
    check('the mark follows its piece across redraws: a page renamed or another page picked changes the same mark, a press then opens the page it names now, another page of the very same name too; a piece hidden from this screen wears none, and the mark is taken off when the link is',
        J(renamed) === J([1, true, 'New name', 'Opens New name.']) && J(moved) === J(['d_rules', 'Open Rules']) && after === J(['d_rules:panel']) && J(twin) === J([1, true, 'p_twin', 'Rules']) && afterTwin === J(['d_rules:panel', 'p_twin:panel'])
        && hid === 0 && back === 1 && gone === 0 && hb.kids.length === 0, J([renamed, moved, after, twin, afterTwin, hid, back, gone]));
    check('the board asks these and nothing else: the mark is synced for every piece as the map is drawn, after its effect icons; the row is built from the selection and its press opens by the rule with the keys held; the mark keeps its size at any zoom and is centred on the piece\'s corner, so it takes a corner of a small token and no more',
        count(wb, "          } else if (fxEl) fxEl.remove();\n          pagePinSync(el, item, hideFromMe);") === 1
        && count(wb, "                var ppRow = pagePinRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));") === 1 && count(wb, "                if (ppRow) html += ppRow.html;\n                var drRow = doorRows(") === 1
        && count(wb, "                } else if (action.includes('cm-open-page')) {") === 1 && count(wb, "                    if (ppDo && window.wpPageShelf) window.wpPageShelf.open(ppDo.id, window.wpPageShelf.wayNow(ce));") === 1
        && /\n\s*\.wb-item > \.wb-pin \{ position: absolute; right: -11px; top: -11px; z-index: 6; width: 22px; height: 22px; [^\n]*transform: scale\(var\(--wbz, 1\)\); transform-origin: 50% 50%;/.test(css) && /\n\s*\.wb-item > \.wb-pin::before \{ content: '\\1F4D1'; \}/.test(css) && !/innerHTML/.test(wbS));
}
{
    // Properties (inspector.js): the row and its setter
    const insS = read('scripts/inspector.js'), boxS = sliceOf(insS, 'pagepinbox'), esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mk = o => { const R = { saved: 0, drawn: 0, toasts: [], set: [] };
        const win = { wpPageShelf: o.none ? undefined : { mapPinField: w => o.field || null, mapPinSet: (w, id) => { R.set.push(id); return o.did === undefined ? 'set' : o.did; } } };
        const api = new Function('window', 'esc', 'save', 'render', 'toast', boxS + '\nreturn { html: pagePinFieldHtml, set: setItemPagePin };')(win, esc, () => { R.saved++; }, () => { R.drawn++; }, t => { R.toasts.push(t); });
        return { api, R }; };
    const field = { cur: 'p"2', choices: [{ id: 'p1', title: '<script>alert(1)</script>', kind: 'planner' }, { id: 'p"2', title: 'Bar & "grill"', kind: 'planner' }, { id: 'd1', title: "Rules' page", kind: 'doc' }] };
    const html = mk({ field }).api.html({ id: 'w' });
    check('the Opens page row in Properties lists None, then the planners and the handbook pages in two groups, the page the piece opens picked; a page\'s name and its id are escaped, so a name from a campaign file is text and an id cannot leave its attribute',
        html === '<div class="field"><label for="wbPagePin" title="A click on the mark this piece then wears opens that page over the map. The link is yours alone: players never get it.">&#128209; Opens page</label><select id="wbPagePin"><option value="">None</option>'
            + '<optgroup label="Planners"><option value="p1">&lt;script&gt;alert(1)&lt;/script&gt;</option><option value="p&quot;2" selected>Bar &amp; &quot;grill&quot;</option></optgroup><optgroup label="Handbook"><option value="d1">Rules&#39; page</option></optgroup></select></div>', html);
    const noPl = mk({ field: { cur: '', choices: [{ id: 'd1', title: 'Rules', kind: 'doc' }] } }).api.html({}), empty = mk({ field: { cur: '', choices: [] } }).api.html({});
    check('a campaign with no planner shows no empty group, one with no page at all still offers None; where the module says there is nothing to show, or is not there, the row is not drawn',
        !/Planners/.test(noPl) && /<optgroup label="Handbook"><option value="d1">Rules<\/option><\/optgroup>/.test(noPl) && !/selected/.test(noPl) && /<option value="">None<\/option><\/select>/.test(empty) && !/optgroup/.test(empty) && mk({ field: null }).api.html({}) === '' && mk({ none: true }).api.html({}) === '');
    const S1 = mk({ did: 'set' }); S1.api.set({ id: 'w' }, 'p1'); const S2 = mk({ did: 'cleared' }); S2.api.set({ id: 'w' }, ''); const S3 = mk({ did: '' }); S3.api.set({ id: 'w' }, 'p1'); const S4 = mk({ none: true }); S4.api.set({ id: 'w' }, 'p1');
    check('picking a page saves the campaign, draws the map again and says what happened; a pick that changed nothing, or one made where pins are not this screen\'s, does none of the three',
        J(S1.R) === J({ saved: 1, drawn: 1, toasts: ['This piece opens that page now. The link is yours alone.'], set: ['p1'] }) && J(S2.R) === J({ saved: 1, drawn: 1, toasts: ['This piece opens no page now.'], set: [''] }) && J(S3.R) === J({ saved: 0, drawn: 0, toasts: [], set: ['p1'] }) && J(S4.R) === J({ saved: 0, drawn: 0, toasts: [], set: [] }));
    const cuS = read('scripts/cleanup.js');
    check('Properties draws the row and wires its list; an import keeps a piece\'s link only as a short plain id that no prototype holds (cleanupcheck runs it)',
        count(insS, "              pagePinFieldHtml(w)+   // 1.5.4: a pin, the page this piece opens (the GM's alone)\n") === 1 && count(insS, "            if (_el_wbPagePin) _el_wbPagePin.addEventListener('change', function() { setItemPagePin(w, this.value); });") === 1
        && count(cuS, "            if (w.page !== undefined && !(typeof w.page === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(w.page) && !(w.page in Object.prototype))) delete w.page;") === 1);
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
    const NOTE3 = "- The panel over the map has tabs. Open a second page and both stay\n  open, each on a tab under the panel's head. Click a tab to bring its\n  page to the front, where you left it. The x on a tab closes that\n  page, and so does the middle mouse button. The window button sends\n  the page in front to a window of its own and keeps the other tabs.\n  The panel holds eight pages.\n";
    const FIX3 = "- Searching page text now reads a planner's node tables and a\n  flowchart's labels. A word that stood only in a node's table was\n  found by no search: not quick-jump, not the panel's search, not the\n  search of the Planners list.\n";
    check('Help says the tabs, in the Planners part under In a session: several pages in the panel, a tab each; a click brings a page to the front where it was left; what closes a tab and what the panel\'s own close does; the window button; eight pages. Both release notes carry the tabs and the search fix, alike',
        plan.includes('<li>The panel over the map holds several pages at once. Open a second page and each one gets a <b>tab</b> under the panel&rsquo;s head.\n')
        && plan.includes('<li>Click a tab to bring its page to the front. Each page comes back where you left it.</li>')
        && plan.includes('<li>The &times; on a tab closes that page, and so does the middle mouse button. The panel&rsquo;s own &times; closes every tab.</li>')
        && plan.includes('<li>The window button sends the page in front to a window of its own and closes its tab. The other tabs stay.</li>')
        && plan.includes('<li>The panel holds eight pages. A ninth takes the place of the oldest.</li>') && wn.every(t => count(t, NOTE3) === 1 && count(t, FIX3) === 1));
    const NOTE5 = "- A page you find opens at the place it found. The Pages shelf's\n  Here and Around rows open a planner at its node for that map. A\n  quick-jump row found by a page's words, and a result of Search\n  Planners or Search Pages, open at the words you typed. The page\n  scrolls there, opens the folds around it and lights the spot for a\n  moment. This works over the map, in a window of its own, on the\n  page itself and in a player's reader. A page in a window of its own\n  has a Find box too. Ctrl+F takes you to it.\n";
    const NOTE4 = "- A piece of the play map can open a page. Select a picture, a token\n  or a plain shape and pick the page under Opens page in its\n  Properties. The piece then wears a small mark: a click on it opens\n  the page over the map, and Ctrl+click opens a window of its own.\n  The piece's right-click menu has Open page too, and the Pages shelf\n  lists the page under Here on that map. The link is yours alone:\n  players get the piece without it.\n";
    const guide = fs.readFileSync(path.join(root, 'CAMPAIGN_INTEGRATION.md'), 'utf8').replace(/\r\n/g, '\n');
    check('Help says the map pin, in the Planners part under In a session: what it is and where it is set; the mark and what a click, Ctrl+click and Alt+click on it do; the menu row; the shelf\'s Here; and that players get the piece without its link. Both release notes carry it, alike; the integration guide gives the two keys, their limits and that neither is sent',
        plan.includes('<li>A <b>map pin</b> is a piece of the play map that opens a page. Select a picture, a token or a plain shape and pick the page under <b>Opens page</b> in its Properties.\n')
        && plan.includes('<li>The piece then wears a small mark at its corner. A click on the mark opens the page over the map. <kbd>Ctrl</kbd>+click opens it in a window of its own, and <kbd>Alt</kbd>+click opens the page itself.</li>')
        && plan.includes('<li>The piece&rsquo;s right-click menu has <b>Open page</b> too.</li>') && plan.includes('<li>The Pages shelf lists the page under <b>Here</b> while you are on that map.</li>')
        && plan.includes('<li>A map pin is yours alone. Players get the piece without its link, and they never see the mark.</li>') && wn.every(t => count(t, NOTE4) === 1)
        && guide.includes("may carry `page`, the id of a planner or a handbook page of the same campaign.") && guide.includes("at most 80 characters from `A-Z a-z 0-9 _ . : -`.") && guide.includes("A campaign may carry `pinnedPages`, an array of planner and handbook page ids kept on the GM's Pages shelf, 24 at most. Both keys are GM prep and are never sent to players."));
    check('Help says a page found opens at the place it found (1.5.4, PLANNER_ORG_DESIGN 4.1), in the Planners part under In a session after the shelf: the Here and Around rows, quick-jump\'s rows found by a page\'s words and the two search lists of the left panel; the page scrolled there, its folds opened and the spot lit; over the map, in a window of its own, on the page itself and in a player\'s reader; and the Find box of a window of its own, which Ctrl+F takes you to. Both release notes carry it, alike',
        plan.includes('<li>A page you find opens <b>at the place it found</b>.\n')
        && plan.includes('<li>The shelf&rsquo;s <b>Here</b> and <b>Around</b> rows open a planner at its node for that map.</li>')
        && plan.includes('<li>A quick-jump row found by a page&rsquo;s words opens at those words. So does a result of <b>Search Planners</b> or <b>Search Pages</b> in the left panel.</li>')
        && plan.includes('<li>The page scrolls there, the folds around it open, and the spot is lit for a moment.</li>')
        && plan.includes('<li>This works over the map, in a window of its own, on the page itself and in a player&rsquo;s reader.</li>')
        && plan.includes('<li>A page in a window of its own has a <b>Find</b> box too. <kbd>Ctrl</kbd>+<kbd>F</kbd> takes you to it.</li>')
        && plan.indexOf('<li>The shelf is yours alone.') < plan.indexOf('<li>A page you find opens') && plan.indexOf('<li>A page you find opens') < plan.indexOf('<li>The panel over the map holds several pages at once.')
        && wn.every(t => count(t, NOTE5) === 1));
    check('Help\'s Planners part says a click on Next scene opens it over the map; both release notes carry the line, alike; the suite is one of those CI runs',
        plan.includes('the play map&rsquo;s right-click menu then offers it as <b>&#9654; Next scene</b>. A click there opens it over the map. <b>Played</b> and <b>Skipped</b> mark a scene done.</li>')
        && wn.every(t => count(t, NOTE) === 1) && fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').replace(/\r\n/g, '\n').includes('        if: ${{ !cancelled() }}\n        run: node tools/shelfcheck.js\n'));
}

/* ---------- the CI file ---------- */
{
    // GitHub reads .github/workflows/checks.yml as YAML, and a name there is written plain, with no quotes. A plain name ends at a colon
    // followed by a space, which makes the whole file invalid: every run then fails at once and NO suite runs, with nothing said by any
    // suite. This suite's own step did that for four pushes on 2026-10-05 ("where a page opens: over the map"). A space followed by a #
    // would cut a name short without a word. No YAML reader comes with Node, so the names are held to the rule line by line.
    const yml = fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').replace(/\r\n/g, '\n');
    const nameBad = v => (v.trim() === '' ? 'no name' : /: |:$/.test(v) ? 'a colon that ends the name' : / #/.test(v) ? 'a # that cuts the name short' : /^[\[\]{}>|*&!%@`'"#,?-]/.test(v) ? 'a first character YAML reads as its own' : '');
    const names = yml.split('\n').map((l, i) => { const m = /^\s*(?:- )?name:\s?(.*)$/.exec(l); return m ? { line: i + 1, bad: nameBad(m[1]) } : null; }).filter(Boolean);
    const suites = fs.readdirSync(__dirname).filter(f => /check\.js$/.test(f)).sort();
    const runs = (yml.match(/^ +run: node tools\/\S+$/gm) || []).map(l => l.trim().slice('run: node tools/'.length));
    check('the rule for a name in the CI file, tried on names that break it each way and on names that keep it: the very line that stopped CI (a colon and a space inside it), a colon at the end, a # after a space, a quote or a bracket first, no name; a colon inside a time and a # inside a word are fine',
        nameBad('shelfcheck — pages in a session (where a page opens: over the map, a window of its own, the page itself)') === 'a colon that ends the name' && nameBad('a name that ends with a colon:') === 'a colon that ends the name'
        && nameBad('a name # and a note') === 'a # that cuts the name short' && nameBad('"a quoted name"') === 'a first character YAML reads as its own' && nameBad('[a list]') === 'a first character YAML reads as its own' && nameBad('') === 'no name' && nameBad('   ') === 'no name'
        && nameBad('Test suites (Node ${{ matrix.node }})') === '' && nameBad('doccheck — handbook renderer, sanitizer, Markdown') === '' && nameBad('a run at 10:30 in C#') === '');
    const badNames = names.filter(n => n.bad).map(n => 'line ' + n.line + ': ' + n.bad);
    check('every name in the CI file keeps the rule, the workflow\'s, the job\'s and one for each suite\'s step, so the file is one GitHub can read and the suites run',
        names.length === runs.length + 2 && badNames.length === 0, J([names.length, runs.length, badNames]));
    const missing = suites.filter(s => s !== 'fuzzcheck.js' && count(yml, '        run: node tools/' + s + '\n') !== 1);
    check('CI runs every suite once: each tools/*check.js but fuzzcheck, the diagnostic one, has exactly one step, and every step names a suite that is there',
        missing.length === 0 && runs.every(r => suites.includes(r)) && !runs.includes('fuzzcheck.js') && runs.length === suites.length - 1 && new Set(runs).size === runs.length, J([missing, runs.filter(r => !suites.includes(r))]));
    // the release notifier
    // .github/workflows/notify-website.yml tells the website that a release was published (the owner, 2026-10-23, by prompt: "Add it
    // (Recommended)"). Its secret can write to the website's repository, so what may start it and what it may do are held here: it runs on
    // a published release alone (never pull_request_target, workflow_run, issue_comment or anything a fork can start), its own token has no
    // permission, it checks out no code, it reads the one secret only in its one step, and it sends no payload but the dispatch's type
    const nf = path.join(root, '.github/workflows/notify-website.yml');
    const ny = fs.existsSync(nf) ? fs.readFileSync(nf, 'utf8').replace(/\r\n/g, '\n') : '';
    const nNames = ny.split('\n').map(l => { const m = /^\s*(?:- )?name:\s?(.*)$/.exec(l); return m ? m[1] : null; }).filter(v => v !== null);
    const nOn = (/^on:\n((?:[ #].*\n|\n)*)/m.exec(ny) || ['', ''])[1].split('\n').map(l => l.replace(/#.*$/, '').trimEnd()).filter(Boolean);
    const secrets = ny.match(/secrets\.[A-Za-z_]+/g) || [];
    check('the release notifier runs on a published release alone, with no permission for its own token, no code checked out, the one secret read in its one step and nothing sent but the dispatch\'s type; its names keep the CI file\'s rule',
        ny !== '' && JSON.stringify(nOn) === JSON.stringify(['  release:', '    types: [published]']) && /^permissions: \{\}$/m.test(ny)
        && !/pull_request|workflow_run|issue_comment|workflow_dispatch|push:|schedule:|actions\/checkout|uses:/.test(ny)
        && secrets.length === 1 && secrets[0] === 'secrets.WEBSITE_DISPATCH_TOKEN' && count(ny, 'https://api.github.com/repos/ImmuneMoon/Waypoint-Website/dispatches') === 1
        && count(ny, '-d \'{"event_type":"waypoint-release"}\'') === 1 && nNames.length === 2 && nNames.every(v => nameBad(v) === ''),
        J([nOn, secrets, nNames]));
}

/* ---------- what git keeps out of the repository ---------- */
{
    // docs/ holds local research and the owner's own campaign build in folders of their own, and private/ an outside sheet reader of the owner's own.
    // Neither is ever committed, on any clone: a line of .git/info/exclude is one machine's alone. Both rules are anchored to the repository's root,
    // so that a folder of either name anywhere else in the tree is not ignored by them, and the README's picture in docs/ stays tracked
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
    check('git keeps the owner\'s own material out on every clone: .gitignore ignores every folder under docs/ and the private/ folder, each anchored to the repository\'s root, beside docs\' own Markdown, and no rule ignores every folder named private',
        gi.includes('/docs/*/') && gi.includes('/private/') && gi.includes('docs/*.md') && !gi.includes('private/') && !gi.includes('private') && !gi.includes('docs/') && !gi.includes('/docs/'), J(gi.filter(l => /docs|private/.test(l))));
}


/* ---------- 1.5.6: a link from one page to another, or to a section of it (the pagelink slice, run for real) ---------- */
{
    const toasts = [], opened = [], st = { camp: null, foreign: false, opens: 'go' };
    const PL = new Function('getActiveCampaign', 'openPage', 'toast', 'window', waySrc + sliceOf(ps, 'shelf') + sliceOf(ps, 'pagelink') + '\nreturn { linkChoices: linkChoices, linkWords: linkWords, linkGo: linkGo };')(
        () => st.camp, (id, way, land) => { opened.push([id, way, land]); return st.opens; }, m => toasts.push(m), { get wpNet() { return st.foreign ? { foreign: true } : null; } });
    const items = {
        p_z: { type: 'planner', meta: { title: 'Zed plan' }, blocks: [{ id: 'b_t', type: 'h1', title: 'Zed plan' }, { id: 'b_d', type: 'h2', title: 'Docks' }, { id: 'b_n', type: 'node', title: 'The <b>Inn</b>' }, { id: 'b_x', type: 'text', content: 'words' }, { type: 'h2', title: 'No id' }, { id: 'bad id', type: 'h3', title: 'Bad id' }, { id: 'b_e', type: 'h2', title: '   ' }, { id: 'b_c', type: 'table', title: 'Prices' }] },
        d_a: { type: 'doc', meta: { title: 'Alpha' }, blocks: [{ id: 'b_1', type: 'h2', title: 'Rules' }] },
        m_1: { type: 'map', meta: { title: 'A map' } },
        'x y': { type: 'doc', meta: { title: 'Aardvark' }, blocks: [] }
    };
    st.camp = { items: items };
    const ch = PL.linkChoices(st.camp);
    check('1.5.6 page links: the list holds every page of the campaign by name, and after each page its sections in their order (a heading, a scene node and a titled table, by the block id they carry, a node\'s typed markup left out), never the page\'s own title again, a block with no id or no words, a map, nor an item whose id a link cannot name',
        J(ch) === J([{ addr: '#wp:page:d_a', label: 'Alpha' }, { addr: '#wp:page:d_a:b_1', label: 'Alpha \u203a Rules', sec: 'Rules' }, { addr: '#wp:page:p_z', label: 'Zed plan' }, { addr: '#wp:page:p_z:b_d', label: 'Zed plan \u203a Docks', sec: 'Docks' }, { addr: '#wp:page:p_z:b_n', label: 'Zed plan \u203a The Inn', sec: 'The Inn' }, { addr: '#wp:page:p_z:b_c', label: 'Zed plan \u203a Prices', sec: 'Prices' }])
        && J(PL.linkChoices(null)) === '[]' && J(PL.linkChoices({ items: null })) === '[]', J(ch));
    check('1.5.6 page links: a link is said by its page and its section, by the page alone where the section is gone, and as nothing where the page is not here',
        PL.linkWords(st.camp, 'p_z', 'b_d') === 'Zed plan \u203a Docks' && PL.linkWords(st.camp, 'p_z', '') === 'Zed plan' && PL.linkWords(st.camp, 'p_z', 'b_gone') === 'Zed plan' && PL.linkWords(st.camp, 'nope', 'b_d') === '' && PL.linkWords(st.camp, 'm_1', '') === '' && PL.linkWords(st.camp, 'toString', '') === '');
    const r1 = PL.linkGo('p_z', 'b_d', 'panel'), r2 = PL.linkGo('d_a', '', 'window'), r3 = PL.linkGo('p_z', 'bad id', 'go'), t0 = toasts.length, r4 = PL.linkGo('nope', 'b_d', 'go');
    st.foreign = true; const r5 = PL.linkGo('p_z', 'b_d', 'go'); st.foreign = false; st.opens = ''; const r6 = PL.linkGo('d_a', '', 'go');
    check('1.5.6 page links: a press opens the page by the way asked, at its section where the link names one, through the shelf\'s own opener; a page that is not here opens nothing and is said, at someone else\'s table as not shared with you, and one the opener could not open is said too',
        r1 === 'go' && r2 === 'go' && r3 === 'go' && J(opened.slice(0, 3)) === J([['p_z', 'panel', { at: 'b_d' }], ['d_a', 'window', null], ['p_z', 'go', null]]) && t0 === 0
        && r4 === '' && toasts[0] === 'That page is not in this campaign.' && r5 === 'go' && opened[3][0] === 'p_z' && r6 === '' && toasts[1] === 'That page is not in this campaign.' && toasts.length === 2, J([opened, toasts]));
    st.foreign = true; st.camp = { items: { d_a: items.d_a } }; PL.linkGo('p_z', 'b_d', 'go');
    check('1.5.6 page links: at someone else\'s table a planner the player does not hold is said as not shared with you', toasts[2] === 'That page has not been shared with you.', J(toasts));
    check('1.5.6 page links: the module publishes the press, the list and the words for the campaign on screen',
        ps.includes("    linkGo: linkGo, linkChoices: function() { return linkChoices(getActiveCampaign()); }, linkWords: function(id, at) { return linkWords(getActiveCampaign(), id, at); } };"));
}

/* ---------- the commands (commands.js, 1.6.0, backlog 33): tools and Settings in quick-jump ---------- */
{
    // The owner, 2026-10-29, by prompt: "Tools and settings in it". One list says what each command is; quick-jump lists the commands that
    // can run now and finds Settings' options by name. The module's cmds and setrows slices are run for real on plain objects
    const cm = read('scripts/commands.js'), cmdSrc = sliceOf(cm, 'cmds'), setSrc = sliceOf(cm, 'setrows');
    const mkCmds = o => {
        o = o || {};
        const R = { clicks: [], log: [] }, btn = id => ({ id, disabled: !!(o.off || {})[id], cls: new Set((o.held || []).indexOf(id) >= 0 ? ['active'] : []), get classList() { const s = this.cls; return { contains: c => s.has(c) }; },
            getClientRects: () => ((o.hid || []).indexOf(id) >= 0 ? [] : [{ width: 30, height: 30 }]), click() { if (o.boom === id) throw new Error('boom'); R.clicks.push(id); } });
        const ids = ['moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'buildModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'envModeBtn', 'settingsBtn', 'helpBtn'].filter(id => (o.gone || []).indexOf(id) < 0), els = {};
        ids.forEach(id => { els[id] = btn(id); });
        const st = { viewMode: o.view || 'visual' }, map = o.map === undefined ? { type: 'map' } : o.map;
        const api = new Function('window', 'document', 'state', 'getActiveMap', 'getActiveCampaign', 'navigateToMap', 'localStorage', cmdSrc + '\nreturn { list: COMMANDS, byId: cmdById, run: cmdRun, TOOLS: CMD_TOOLS, WINDOWS: CMD_WINDOWS };')(
            { wpStepLog: (area, step, f) => { R.log.push(area + ' ' + step + ' ' + Object.keys(f || {}).map(k => k + '=' + f[k]).join(' ')); } }, { getElementById: id => els[id] || null }, st, () => map, () => null, () => false, null);
        return Object.assign(api, { R });
    };
    const C = mkCmds(), ids = C.list.map(c => c.id);
    check('one list of commands: each has its own id, a name, what it does as a sentence that ends in a full stop, other words that find it, how it runs, whether it can and what Enter does; the ten tools of the play map in the toolbar\'s order, then the last map, Settings and Help',
        J(ids) === J(['tool.select', 'tool.pan', 'tool.pen', 'tool.eraser', 'tool.fill', 'tool.build', 'tool.ruler', 'tool.radius', 'tool.fog', 'tool.env', 'map.last', 'open.settings', 'open.help']) && new Set(ids).size === ids.length
        && C.list.every(c => typeof c.name === 'string' && c.name && /^[A-Z][^]*\.$/.test(c.does) && c.does.length <= 60 && Array.isArray(c.also) && typeof c.run === 'function' && typeof c.can === 'function' && typeof c.act === 'function' && typeof c.icon === 'string'),
        J(C.list.map(c => [c.id, c.name, c.does])));
    check('a tool command is its toolbar button\'s own press, and each button it names is in the page once, the tools of the play map\'s toolbar that updateWbToolbar knows; each window command names the top row\'s button',
        C.TOOLS.every(t => count(ix, ' id="' + t[2] + '"') === 1) && C.TOOLS.every(t => t[2] === 'fogModeBtn' || wb.includes("'" + t[2] + "'")) && C.WINDOWS.every(w => count(ix, ' id="' + w[2] + '"') === 1)
        && J(C.TOOLS.map(t => t[5])) === J(['keep', '', '', '', '', '', '', '', 'menu', '']));
    const r1 = C.run('tool.pen', 'jump'), r2 = C.run('open.settings', 'key');
    check('a command runs through its button\'s own press, once, and says true; each run is logged with its id and how it was asked for, and nothing else',
        r1 === true && r2 === true && J(C.R.clicks) === J(['drawModeBtn', 'settingsBtn']) && J(C.R.log) === J(['commands v1 run id=tool.pen via=jump', 'commands v1 run id=open.settings via=key']), J([C.R]));
    const D = mkCmds({ view: 'data' }), P = mkCmds({ map: { type: 'planner' } }), N = mkCmds({ map: null }), H = mkCmds({ hid: ['fillModeBtn'] }), O = mkCmds({ off: { drawModeBtn: 1 } }), G = mkCmds({ gone: ['drawModeBtn', 'helpBtn'] }), B = mkCmds({ boom: 'drawModeBtn' });
    const held = [D.run('tool.pen', 'key'), P.run('tool.ruler', 'jump'), N.run('tool.pan', 'jump'), H.run('tool.fill', 'key'), O.run('tool.pen', 'key'), G.run('tool.pen', 'jump'), G.run('open.help', 'jump'), B.run('tool.pen', 'jump'), C.run('tool.nothing', 'key'), C.run('toString', 'key')];
    check('a command that cannot run now presses nothing and says why in plain words: a tool off the play map (the data map, a page, no map), a tool the toolbar does not show here or has switched off, a button this window does not have, a press that fails, a command that is not in the list',
        J(held) === J(['Pen works on the play map.', 'Ruler works on the play map.', 'Pan works on the play map.', 'Fill is not on your toolbar here.', 'Pen is not on your toolbar here.', 'Pen is not in this window.', 'Help is not in this window.', 'Pen did not run.', 'There is no such command.', 'There is no such command.'])
        && [D, P, N, H, O, G].every(X => X.R.clicks.length === 0) && J(D.R.log) === J(['commands v1 run-held id=tool.pen via=key']) && J(B.R.log) === J(['commands v1 run-failed id=tool.pen via=jump']) && C.R.log.slice(-2).every(l => l === 'commands v1 run-unknown via=key'), J(held));
    const A = mkCmds({ held: ['drawModeBtn', 'moveModeBtn'] }), act = id => A.byId(id).act(), can = X => X.list.filter(c => c.can() === true).map(c => c.id);
    check('what Enter does is said for the row in front: a tool not in hand is taken, a tool in hand is put away as a second press of its icon puts it, Select stays in hand, the fog tool opens its menu, a window opens',
        act('tool.pen') === 'Enter puts Pen away.' && act('tool.ruler') === 'Enter takes Ruler.' && act('tool.select') === 'Select is in your hand.' && mkCmds().byId('tool.select').act() === 'Enter takes Select.' && act('tool.fog') === 'Enter opens the fog menu.' && act('open.settings') === 'Enter opens Settings.' && act('open.help') === 'Enter opens Help.');
    check('only what can run now is offered: on the play map every tool and both windows, on the data map or a page the two windows alone, a hidden tool left out',
        can(C).length === 12 && J(can(D)) === J(['open.settings', 'open.help']) && J(can(P)) === J(['open.settings', 'open.help']) && can(H).indexOf('tool.fill') < 0 && can(H).length === 11, J([can(D), can(H)]));
    // Settings' options, on the test page
    const { makeDom } = require('./boxdom.js'), dom = makeDom(), doc = dom.document, el = (tag, o, kids) => { const e = doc.createElement(tag); o = o || {}; if (o.id) e.id = o.id; if (o.cls) e.className = o.cls; Object.keys(o.attrs || {}).forEach(k => e.setAttribute(k, o.attrs[k])); if (o.hidden) e.hidden = true; if (o.none) e.style.display = 'none'; (kids || []).forEach(k => e.appendChild(typeof k === 'string' ? doc.createTextNode(k) : k)); return e; };
    const modal = el('div', { id: 'settingsModal' }, [
        el('details', { cls: 'set-group', attrs: { 'data-group': 'table' } }, [el('summary', {}, ['Table']), el('div', { cls: 'set-group-body' }, [
            el('div', { cls: 'set-field-label' }, ['Grid opacity ', el('span', { id: 'setGridOpacityVal' }, ['100%'])]), el('input', { id: 'setGridOpacity' }),
            el('label', {}, [el('input', { id: 'setFxReduced' }), ' ', el('span', { cls: 'set-name' }, [el('span', {}, ['Reduce motion (this machine)']), el('small', {}, ['Skips screen shake.'])])]),
            el('label', {}, [el('span', { cls: 'set-name' }, ['Effect timers', el('small', {}, ['Who may pause it.'])]), ' ', el('select', { id: 'setTimers' }, [el('option', {}, ['Its player and you'])])]),
            el('label', {}, [el('input', { id: 'setStreamFx' }), ' Stream window plays the table\'s sound (the ambient loop, a voice and more)']),
            el('div', { cls: 'set-field-label' }, ['Grid opacity']),
            el('label', { cls: 'gm-only' }, [el('input', { id: 'gmTick' }), ' A GM tick']),
            el('div', { none: true }, [el('div', { cls: 'set-field-label' }, ['Put away'])]),
            el('button', { cls: 'tool ghost', id: 'setResetBtn' }, ['\u{1F504} Reset Panel Layout']), el('div', { cls: 'set-line tight' }, ['Puts both panels back.']),
            el('button', { cls: 'tool ghost', id: 'setRulersBtn' }, ['Toggle Rulers'])
        ])]),
        el('details', { cls: 'set-group', attrs: { 'data-group': 'gone' }, hidden: true }, [el('summary', {}, ['Hidden group']), el('div', { cls: 'set-field-label' }, ['Inside'])])
    ]);
    doc.body.appendChild(modal);
    const win = { getComputedStyle: e => ({ display: e.style.display === 'none' || (e.className.split(' ').indexOf('gm-only') >= 0) ? 'none' : 'block' }) };
    const S = new Function(setSrc + '\nreturn { rows: setRows, control: setControl, words: setWords };')(), rows = S.rows(doc, win);
    check('Settings\' options are read from the page as it stands: a group by its heading, an option by its own words alone (never the state beside it, its grey line, a list\'s choices, a control\'s words or a leading picture), a long name without what its bracket adds, a button only where its grey line stands under it; one put away (a GM\'s on a player\'s app, a hidden row, a hidden group) is not found, and the same words twice in one place are found once',
        J(rows.map(r => [r.name, r.sub, r.group])) === J([['Table', 'Settings', 'table'], ['Grid opacity', 'Settings \u25b8 Table', 'table'], ['Reduce motion (this machine)', 'Settings \u25b8 Table', 'table'], ['Effect timers', 'Settings \u25b8 Table', 'table'],
            ['Stream window plays the table\'s sound', 'Settings \u25b8 Table', 'table'], ['Reset Panel Layout', 'Settings \u25b8 Table', 'table']]) && S.rows({ getElementById: () => null }, win).length === 0, J(rows.map(r => [r.name, r.sub])));
    check('an option opens at the control it is set with: a name\'s control under it, the box or the list in its label, a button itself, a group by its heading',
        S.control(rows[1].el).id === 'setGridOpacity' && S.control(rows[2].el).id === 'setFxReduced' && S.control(rows[3].el).id === 'setTimers' && S.control(rows[5].el).id === 'setResetBtn' && S.control(rows[0].el).tagName === 'SUMMARY' && S.control(null) === null);
    const rowsC = (q) => { const list = { innerHTML: '' }, st = { appState: { campaigns: {} } }, rSrc = sliceOf(mainS, 'cmdkrows');
        const entries = [{ kind: 'map', label: 'Docks', sub: 'Camp', campId: 'c1', itemId: 'm1' }, { kind: 'cmd', label: 'Ruler', sub: 'Measure a distance.', cmdId: 'tool.ruler', also: ['measure', 'distance'], icon: 'T', key: '' }, { kind: 'cmd', label: 'Pen', sub: 'Draw on the map.', cmdId: 'tool.pen', also: ['draw'], icon: 'T', key: 'P' }, { kind: 'set', label: 'Measurement system', sub: 'Settings \u25b8 Table', setAt: 0, icon: 'S' }];
        const shown = new Function('state', 'window', 'document', 'esc', 'cmdkHintSync', 'var _cmdkEntries = ' + J(entries) + ', _cmdkShown = [], _cmdkIdx = 0;\n' + rSrc + '\nreturn function(q) { cmdkRender(q); return _cmdkShown; };')(st, {}, { getElementById: () => list }, s => String(s).replace(/</g, '&lt;'), () => {})(q);
        return { shown: shown.map(en => en.label), html: list.innerHTML }; };
    const e0 = rowsC(''), e1 = rowsC('meas'), e2 = rowsC('pe');
    check('quick-jump lists the commands after the maps and pages with nothing typed and Settings\' options only once a word is typed; a command is found by its name or its other words (the Ruler by measure); a row shows its own picture and its key where it has one',
        J(e0.shown) === J(['Docks', 'Ruler', 'Pen']) && J(e1.shown) === J(['Measurement system', 'Ruler']) && J(e2.shown) === J(['Pen']) && e2.html.includes('<span>T</span><span>Pen</span>') && e2.html.includes('<kbd class="cmdk-key">P</kbd>') && !e1.html.includes('cmdk-key'), J([e0, e1, e2]));
    const hS = sliceOf(mainS, 'cmdkway'), hint = (en, cmds) => new Function('window', 'state', hS + '\nreturn cmdkHint;')(cmds === false ? {} : { wpCommands: { act: e => 'act:' + e.label } }, { appState: { activeCampaignId: 'c1' } })(en);
    const gS = sliceOf(mainS, 'cmdkgo'), went = [], goC = new Function('window', 'state', 'cmdkClose', hS + '\n' + gS + '\nreturn cmdkGo;')({ wpCommands: { go: en => { went.push(en.label); } }, wpConfirmCampaignSwitch: () => { went.push('asked'); } }, { appState: { activeCampaignId: 'c1', campaigns: {} } }, () => { went.push('close'); });
    goC({ kind: 'cmd', label: 'Pen', cmdId: 'tool.pen' }, null); goC({ kind: 'set', label: 'Grid opacity', setAt: 1 }, { ctrlKey: true });
    check('the line under the list says what Enter does for a command and an option, in the command\'s own words; Enter on a command closes quick-jump and runs it, on an option opens Settings there, and neither asks to switch campaigns',
        hint({ kind: 'cmd', label: 'Pen' }) === 'act:Pen' && hint({ kind: 'set', label: 'Grid' }) === 'act:Grid' && hint({ kind: 'cmd', label: 'Pen' }, false) === '' && J(went) === J(['close', 'Pen', 'close', 'Grid opacity']), J(went));
    check('the page loads the module once, after the modules whose buttons it presses; the module publishes the list, its run, the rows and what Enter does, and logs in the shared words; the style sheet draws a key and the option Settings opened at; quick-jump\'s box says what it finds',
        count(ix, 'scripts/commands.js') === 1 && ix.includes('<script type="module" src="scripts/trade.js"></script>\n<script type="module" src="scripts/keycore.js"></script>\n<script type="module" src="scripts/commands.js"></script>\n') && ix.indexOf('scripts/commands.js') > ix.indexOf('scripts/settings.js')
        && cm.includes("window.wpCommands = { list: COMMANDS, byId: cmdById, run: cmdRun, rows: jumpRows, go: jumpGo, act: jumpAct,") && cm.includes("window.wpStepLog('commands v1', step, facts)")
        && /\n\s*\.cmdk-row \.cmdk-key \{ flex: none;/.test(css) && /\n\s*#settingsModal \.set-found \{ outline: 2px solid var\(--gold\);/.test(css) && ix.includes('placeholder="Jump to a map, a page, a tool or a setting&hellip;  (Esc to close)"'));
    const wn = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')].map(t => t.replace(/\r\n/g, '\n'));
    const start = ix.slice(ix.indexOf('<div class="help-pane" data-pane="start">'), ix.indexOf('<div class="help-pane" data-pane="tutorial"')), keysP = ix.slice(ix.indexOf('<div class="help-pane" data-pane="keys"'), ix.indexOf('<h4 id="helpDevMode">'));
    check('Help says it under Getting around fast, after quick-jump: a tool by its name taken as its icon takes it and put away in hand, an option of Settings opened and lit, Settings and Help, the tools after the maps; the Keyboard part says it too; both release notes carry it, alike, in 1.6.0',
        start.includes('<li><b>Tools and settings</b> are in quick-jump too.\n') && start.includes('<li>Type a tool&rsquo;s name, such as Pen or Ruler, and Enter takes it as its icon does. A tool already in your hand is put away.</li>')
        && start.includes('<li>Type an option of Settings, such as Grid opacity. Enter opens Settings at that option and lights it for a moment.</li>') && start.includes('<li>Settings and Help are in the list too. With nothing typed the tools come after your maps and pages.</li>')
        && start.indexOf('<li><b>Tools and settings</b>') > start.indexOf('<li><kbd>Ctrl + K</kbd> opens quick-jump.') && keysP.includes('<li><kbd>Ctrl + K</kbd> &nbsp; Quick-jump to any map, planner, or room. It finds the map&rsquo;s tools and the options of Settings too.</li>')
        && wn.every(t => count(t, "Quick jump\n- Quick jump finds the map's tools and Settings too. Press Ctrl+K and\n  type a tool's name, such as Pen or Ruler: Enter takes it, as its icon\n") === 1 && t.indexOf('\nQuick jump\n') < t.indexOf('WAYPOINT 1.5.') ));
}

/* ---------- the keys (keycore.js and commands.js, 1.6.0, backlog 33): the last map on one key ---------- */
{
    // The owner, 2026-10-29, by prompt: "Recent maps on one key", its key "Q (Recommended)". keycore.js is pure and run for real; the last
    // map and the key's listener are commands.js's cmds and hotkey slices, run for real on plain objects
    const kc = read('scripts/keycore.js'), cm = read('scripts/commands.js');
    const K = new Function(kc.replace(/^export \{[^}]*\};?\s*$/m, '') + '\nreturn { keyOf, keyClean, keyName, APP_KEYS, keyRefusal, keysClean, keysNow, keyAt };')();
    const ev = (code, o) => Object.assign({ code }, o || {});
    check('a key press is one name: the keys held in the order Ctrl, Alt, Shift, then the key\'s own code, a Mac\'s Command as Ctrl; a held key alone, a press with no code and a code that is no key\'s are no key',
        K.keyOf(ev('KeyQ')) === 'KeyQ' && K.keyOf(ev('KeyP', { shiftKey: true, ctrlKey: true, altKey: true })) === 'Ctrl+Alt+Shift+KeyP' && K.keyOf(ev('KeyP', { metaKey: true })) === 'Ctrl+KeyP' && K.keyOf(ev('Digit2', { shiftKey: true })) === 'Shift+Digit2'
        && ['ShiftLeft', 'ControlRight', 'AltLeft', 'MetaLeft', 'CapsLock', 'Fn', ''].every(c => K.keyOf(ev(c, { shiftKey: true })) === '') && K.keyOf(null) === '' && K.keyOf({}) === '' && K.keyOf(ev('Key Q')) === '' && K.keyOf(ev('<b>')) === '' && K.keyOf(ev(7)) === '');
    check('a key is said as people say it: a letter, a digit, a sign, an arrow, with the keys held first; a stored key that is no key\'s name is no key',
        K.keyName('KeyQ') === 'Q' && K.keyName('Ctrl+Shift+KeyP') === 'Ctrl+Shift+P' && K.keyName('Shift+Digit1') === 'Shift+1' && K.keyName('Backquote') === '\x60' && K.keyName('ArrowLeft') === 'Left' && K.keyName('Numpad4') === 'Num 4' && K.keyName('F7') === 'F7' && K.keyName('Space') === 'Space'
        && ['', 'Shift+ShiftLeft', 'Shift+Ctrl+KeyP', 'Ctrl+', 'KeyQ ', 'Hyper+KeyQ', 'x'.repeat(41), null, 7, {}].every(v => K.keyName(v) === '' && K.keyClean(v) === '') && K.keyName('toString') === 'toString');
    const names = { 'map.last': 'Last map', 'tool.pen': 'Pen' };
    const ref = (k, id, keys, talk) => K.keyRefusal(k, id || 'tool.pen', keys || {}, names, talk === undefined ? 'KeyV' : talk);
    check('a key the app or the window already uses is refused in words that name what it does: quick jump, undo, copy, fit to content, target, panning, nudging, Delete, reload, the developer tools, the View menu; Esc, Enter and Tab with any key held; push to talk\'s own key; another command\'s key, by its name; a key that is no key',
        ref('Ctrl+KeyK') === 'Ctrl+K is already quick jump. Pick another key.' && ref('Ctrl+KeyZ') === 'Ctrl+Z is already Undo. Pick another key.' && ref('Shift+Digit1') === 'Shift+1 is already Fit to content. Pick another key.' && ref('KeyT') === 'T is already Target. Pick another key.'
        && ref('Space') === 'Space is already panning. Pick another key.' && ref('Shift+ArrowUp') === 'Shift+Up is already nudging. Pick another key.' && ref('Backspace') === 'Backspace is already Delete. Pick another key.' && ref('F5') === 'F5 is already Reload. Pick another key.'
        && ref('Ctrl+Shift+KeyI') === 'Ctrl+Shift+I is already the developer tools. Pick another key.' && ref('Alt+KeyV') === 'Alt+V is already the View menu. Pick another key.' && ref('Backquote') === '\x60 is already the developer console. Pick another key.'
        && ['Escape', 'Shift+Escape', 'Ctrl+Escape'].every(k => ref(k) === 'Esc closes what is on top. Pick another key.') && ref('Ctrl+Enter') === 'Ctrl+Enter moves and presses in a window. Pick another key.' && ref('Shift+Tab') === 'Shift+Tab moves and presses in a window. Pick another key.'
        && ref('KeyV') === 'V is already Push to talk. Pick another key.' && ref('KeyB', 'tool.pen', {}, 'KeyB') === 'B is already Push to talk. Pick another key.' && ref('KeyV', 'tool.pen', {}, 'KeyB') === ''
        && ref('KeyQ', 'tool.pen', { 'map.last': 'KeyQ' }) === 'Q is already Last map. Pick another key.' && ref('KeyQ', 'map.last', { 'map.last': 'KeyQ' }) === '' && ref('KeyQ', 'tool.pen', { 'tool.x': 'KeyQ' }) === 'Q is already another command. Pick another key.'
        && ref('Hyper+KeyQ') === 'That key cannot be used. Pick another.' && ref('Key Q') === 'That key cannot be used. Pick another.' && ref('KeyQ') === '' && ref('Ctrl+Alt+KeyK') === '' && ref('Shift+KeyT') === '' && ref('F7') === '');
    const cmds = [{ id: 'map.last', key: 'KeyQ' }, { id: 'tool.pen', key: 'KeyP' }, { id: 'tool.fog', key: '' }, { id: 'tool.bad', key: 'Ctrl+KeyZ' }, { id: 'tool.talk', key: 'KeyV' }];
    check('each command\'s key now: its default where this computer chose none, this computer\'s choice first, a choice of none taken as none, and a default that another key already holds, that the app uses or that is push to talk\'s left off; the key a press runs is found by its name',
        J(K.keysNow(cmds, {}, 'KeyV')) === J({ 'map.last': 'KeyQ', 'tool.pen': 'KeyP', 'tool.fog': '', 'tool.bad': '', 'tool.talk': '' }) && J(K.keysNow(cmds, { 'tool.fog': 'KeyP', 'map.last': '' }, 'KeyB')) === J({ 'map.last': '', 'tool.fog': 'KeyP', 'tool.pen': '', 'tool.bad': '', 'tool.talk': 'KeyV' })
        && K.keyAt({ 'map.last': 'KeyQ' }, 'KeyQ') === 'map.last' && K.keyAt({ 'map.last': 'KeyQ' }, 'KeyW') === '' && K.keyAt({ 'map.last': '' }, '') === '' && K.keyAt(null, 'KeyQ') === '');
    const ids = ['map.last', 'tool.pen'];
    check('this computer\'s choice is read for the commands of the list alone, a key or none each; anything else is no choice and the default stands',
        J(K.keysClean({ 'map.last': 'KeyW', 'tool.pen': '', 'tool.gone': 'KeyX', toString: 'KeyY' }, ids)) === J({ 'map.last': 'KeyW', 'tool.pen': '' }) && J(K.keysClean({ 'map.last': 'Hyper+Q', 'tool.pen': 7 }, ids)) === '{}'
        && ['nope', null, [], 7].every(v => J(K.keysClean(v, ids)) === '{}') && J(K.keysClean(JSON.parse('{"__proto__": {"x": 1}, "map.last": "KeyE"}'), ids)) === J({ 'map.last': 'KeyE' }));
    check('keycore is the pure half it says: no state, no page, it imports nothing, and what it publishes on window is what it exports',
        !/\bimport\b/.test(kc) && !/document\.|localStorage|state\./.test(kc) && kc.includes("if (typeof window !== 'undefined') window.wpKeyCore = { keyOf: keyOf, keyClean: keyClean, keyName: keyName, APP_KEYS: APP_KEYS, keyRefusal: keyRefusal, keysClean: keysClean, keysNow: keysNow, keyAt: keyAt };")
        && kc.includes('export { keyOf, keyClean, keyName, APP_KEYS, keyRefusal, keysClean, keysNow, keyAt };') && count(ix, 'scripts/keycore.js') === 1 && ix.indexOf('scripts/keycore.js') < ix.indexOf('scripts/commands.js'));
    // the last map
    const lastSrc = sliceOf(cm, 'cmds');
    const mkLast = o => {
        o = o || {}; const R = { went: [], log: [] }, store = { getItem: k => (o.lists || {})[k] === undefined ? null : o.lists[k] };
        const camp = o.camp === null ? null : Object.assign({ id: 'c1', activeItemId: 'm2', items: { m1: { type: 'map', meta: { title: 'Town' } }, m2: { type: 'map', meta: { title: 'Tavern' } }, p1: { type: 'planner', meta: {} }, m3: { type: 'map', meta: { title: '  ' } } } }, o.camp || {});
        const api = new Function('window', 'document', 'state', 'getActiveMap', 'getActiveCampaign', 'navigateToMap', 'localStorage', lastSrc + '\nreturn { last: lastMapOf, cmd: cmdById("map.last"), run: cmdRun, ids: COMMANDS.map(function(c) { return c.id; }) };')(
            { wpNet: o.net || null, wpStepLog: (a, s, f) => { R.log.push(s + ' ' + J(f)); } }, { getElementById: () => null }, { viewMode: 'visual' }, () => ({ type: 'map' }), () => camp, id => { R.went.push(id); return o.refuse ? false : true; }, o.noStore ? undefined : store);
        return Object.assign(api, { R, camp, store });
    };
    const L1 = mkLast({ lists: { wp_recent_c1: J(['m2', 'p1', 'gone', 'm1', 'm3']) } });
    const r1 = L1.run('map.last', 'key');
    check('the last map is the newest map of this computer\'s list that is not the one on screen, a page, a map that is gone or an id the list only inherits passed over; Q is its key; a run goes there as a map tab goes there, and says which map Enter goes back to',
        L1.last(L1.camp, L1.store) === 'm1' && r1 === true && J(L1.R.went) === J(['m1']) && L1.cmd.key === 'KeyQ' && L1.cmd.name === 'Last map' && L1.cmd.act() === 'Enter goes back to Town.' && L1.ids.indexOf('map.last') === 10
        && mkLast({ lists: { wp_recent_c1: J(['m2', 'm3']) } }).cmd.act() === 'Enter goes back to the map you were on.' && mkLast({ lists: { wp_recent_c1: J(['m2', 'toString', 'constructor']) } }).last(L1.camp, L1.store) === 'm1' && L1.R.log.indexOf('run {"id":"map.last","via":"key"}') >= 0, J(L1.R));
    const L2 = mkLast({ lists: { wp_recent_c1: J(['m1', 'm2']) }, camp: { activeItemId: 'm1' } }), L3 = mkLast({ lists: { wp_recent_c1: J(['m2']) } }), L4 = mkLast({ lists: { wp_recent_c1: '{"a":1}' } }), L5 = mkLast({ lists: { wp_recent_c1: 'not json' } }), L6 = mkLast({ camp: null }), L7 = mkLast({ lists: { wp_recent_c1: J(['m1']) }, net: { active: true, role: 'client' } }), L8 = mkLast({ lists: { wp_recent_c1: J(['m1']) }, refuse: true }), L9 = mkLast({ noStore: true });
    check('a second press goes back the other way (the list then holds the map left first); with no other map on the list, a list that does not read, no campaign, at someone else\'s table and where the map would not open, nothing is gone to and the words say why',
        L2.last(L2.camp, L2.store) === 'm2' && J([L3.run('map.last', 'key'), L4.run('map.last', 'key'), L5.run('map.last', 'jump'), L6.run('map.last', 'key'), L7.run('map.last', 'key'), L8.run('map.last', 'key'), L9.run('map.last', 'key')]) === J(['There is no map to go back to yet.', 'There is no map to go back to yet.', 'There is no map to go back to yet.', 'No campaign is open.', 'At a table the GM picks the map.', 'Last map did not run.', 'There is no map to go back to yet.'])
        && [L3, L4, L5, L6, L7, L9].every(X => X.R.went.length === 0) && J(L8.R.went) === J(['m1']));
    // the key's listener
    const hkSrc = sliceOf(cm, 'hotkey');
    const mkKey = o => {
        o = o || {}; const R = { ran: [], toasts: [], log: [] }, shown = new Set(o.shown || []), ids = {};
        const el = id => ({ id, getClientRects: () => (shown.has(id) ? [{ width: 1, height: 1 }] : []) });
        ['customConfirm', 'customPrompt', 'welcomeScreen', 'settingsModal', 'cmdkModal', 'helpModal'].forEach(id => { ids[id] = el(id); });
        const doc = { body: { classList: { contains: c => (o.body || []).indexOf(c) >= 0 } }, getElementById: id => ids[id] || null, querySelectorAll: sel => (sel === '[id$="Modal"]' ? Object.values(ids).filter(e => /Modal$/.test(e.id)) : []), querySelector: sel => (sel === '.hk-picking' && o.picking ? {} : null) };
        const win = { wpStream: !!o.stream, wpPopout: !!o.popout };
        const api = new Function('document', 'window', 'COMMANDS', 'keysNow', 'keyOf', 'keyAt', 'cmdRun', 'cmdLog', 'toast', 'localStorage', 'keysClean', hkSrc + '\nkeysLoad();\nreturn { held: hotkeyHeld, down: hotkeyDown, keys: function() { return _keys; } };')(
            doc, win, [{ id: 'map.last', key: 'KeyQ' }, { id: 'tool.pen', key: '' }], K.keysNow, K.keyOf, K.keyAt, (id, via) => { R.ran.push(id + ':' + via); return o.says || true; }, (s, f) => { R.log.push(s + ' ' + J(f)); }, m => { R.toasts.push(m); },
            { getItem: k => (k === 'wp_voice_bind' ? (o.talk || null) : (o.mine || null)), setItem() {}, removeItem() {} }, K.keysClean);
        return Object.assign(api, { R, doc, win });
    };
    const press = (X, code, o) => { const e = Object.assign({ code, key: code, target: { tagName: 'DIV' }, prevented: false, preventDefault() { this.prevented = true; this.defaultPrevented = true; } }, o || {}); X.down(e); return e; };
    const H1 = mkKey(), e1 = press(H1, 'KeyQ'), e2 = press(H1, 'KeyW'), e3 = press(H1, 'KeyQ', { shiftKey: true });
    check('Q runs the last map from the page, once, its default taken by the browser no further; a key no command holds, and Q with Shift held, run nothing and are left alone',
        J(H1.R.ran) === J(['map.last:key']) && e1.prevented && !e2.prevented && !e3.prevented && H1.R.toasts.length === 0, J(H1.R));
    const fields = [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }];
    const cases = [[{}, { target: fields[0] }], [{}, { target: fields[1] }], [{}, { target: fields[2] }], [{}, { target: fields[3] }], [{}, { repeat: true }], [{}, { defaultPrevented: true }], [{ stream: true }, {}], [{ popout: true }, {}], [{ body: ['tour-on'] }, {}], [{ body: ['web-join', 'web-gate'], shown: ['welcomeScreen'] }, {}],
        [{ shown: ['customConfirm'] }, {}], [{ shown: ['customPrompt'] }, {}], [{ shown: ['welcomeScreen'] }, {}], [{ shown: ['settingsModal'] }, {}], [{ shown: ['cmdkModal'] }, {}]];
    const heldW = cases.map(c => { const X = mkKey(c[0]), e = press(X, 'KeyQ', c[1]); return [X.held(X.doc, X.win, Object.assign({ target: { tagName: 'DIV' } }, c[1])), X.R.ran.length, e.prevented]; });
    check('a key never runs a command while you type in a field (told by isContentEditable and the field tags, a text box, a list and a page\'s text alike), while it is held down or a listener took it, in the stream window or a window of its own, while the tour or a website\'s join page is up, behind a question or a prompt, behind the welcome screen or any window of the app\'s',
        J(heldW.map(h => h[0])) === J(['typing', 'typing', 'typing', 'typing', 'repeat', 'taken', 'window', 'window', 'tour', 'welcome', 'asking', 'asking', 'welcome', 'window', 'window']) && heldW.every(h => h[1] === 0 && h[2] === false) && mkKey().held(mkKey().doc, mkKey().win, { target: { tagName: 'BUTTON' } }) === '', J(heldW));
    const H2 = mkKey({ shown: ['settingsModal'] }); press(H2, 'KeyQ'); press(H2, 'KeyQ', { target: fields[0] }); press(H2, 'KeyQ', { repeat: true });
    const H3 = mkKey({ says: 'There is no map to go back to yet.' }); press(H3, 'KeyQ');
    const H4 = mkKey({ talk: 'KeyQ' }), H5 = mkKey({ talk: 'KeyB' }); press(H4, 'KeyQ'); press(H5, 'KeyQ');
    check('a key held back is logged with its command and why, but never for typing or a key held down; a command that cannot run says why; push to talk\'s own key is no command\'s, and Q is free again once push to talk moves off it',
        J(H2.R.log) === J(['key-held {"id":"map.last","why":"window"}']) && H2.R.ran.length === 0 && J(H3.R.toasts) === J(['There is no map to go back to yet.']) && H4.R.ran.length === 0 && J(H4.keys()) === J({ 'map.last': '', 'tool.pen': '' }) && J(H5.R.ran) === J(['map.last:key']), J([H2.R, H4.R]));
    check('the listener is heard at the window as the key comes back up, after every listener of the page; it loads the keys once and logs how many it holds; quick-jump shows a command\'s key by its name',
        cm.includes("window.addEventListener('keydown', hotkeyDown);") && count(cm, "addEventListener('keydown', hotkeyDown") === 1 && cm.includes("cmdLog('keys-load', { n: ") && cm.includes("window.wpCommandKey = function(id) { return keyName(_keys[id] || ''); };") && cm.includes("function keyFor(id) { return typeof window.wpCommandKey === 'function' ? String(window.wpCommandKey(id) || '') : ''; }"));
    const wn = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')].map(t => t.replace(/\r\n/g, '\n'));
    const start = ix.slice(ix.indexOf('<div class="help-pane" data-pane="start">'), ix.indexOf('<div class="help-pane" data-pane="tutorial"')), keysP = ix.slice(ix.indexOf('<div class="help-pane" data-pane="keys"'), ix.indexOf('<h4 id="helpDevMode">'));
    check('Help says the last map under Getting around fast and in the Keyboard part: Q goes back to the map you were on, again goes the other way, never while you type; both release notes carry it, alike',
        start.includes('<li><b>Last map</b>: <kbd>Q</kbd> takes you back to the map you were on before. Press it again to go back the other way.') && keysP.includes('<li><kbd>Q</kbd> &nbsp; Back to the map you were on last. Press it again to go back the other way.</li>')
        && wn.every(t => count(t, "- Q takes you back to the map you were on last. Press it again to go\n  back the other way. Last map is in quick jump too.\n") === 1));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
