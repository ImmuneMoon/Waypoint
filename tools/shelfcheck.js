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
    check('the module publishes the rule, the rule for the view on screen and the opener; the view is asked of the one place that knows it (floats.js), and nothing in the module draws markup or opens a window by itself',
        /\nwindow\.wpPageShelf = \{ way: pageWay, wayNow: function\(ev\) \{ return pageWay\(viewNow\(\), ev\); \}, open: openPage \};\n$/.test(ps) && /\nfunction viewNow\(\) \{ var fl = window\.wpFloats; return fl && fl\.view \? fl\.view\(\) : ''; \}\n/.test(ps)
        && !/innerHTML|window\.open\(|eval\(|new Function/.test(ps) && J(ps.match(/^import [^\n]*$/gm)) === J(["import { state } from './state.js';", "import { getActiveCampaign } from './models.js';", "import { save } from './io.js';", "import { updateSidebarNav } from './sidebar.js';"]), J(ps.match(/^import [^\n]*$/gm)));
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
    check('Help\'s Planners part says a click on Next scene opens it over the map; both release notes carry the line, alike; the suite is one of those CI runs',
        plan.includes('the play map&rsquo;s right-click menu then offers it as <b>&#9654; Next scene</b>. A click there opens it over the map. <b>Played</b> and <b>Skipped</b> mark a scene done.</li>')
        && wn.every(t => count(t, NOTE) === 1) && fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').replace(/\r\n/g, '\n').includes('        if: ${{ !cancelled() }}\n        run: node tools/shelfcheck.js\n'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
