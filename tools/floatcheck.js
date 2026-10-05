/* Offline check of the floating boxes and the views they show on (system/app/scripts/floats.js, 1.5.4).
   The owner, 2026-10-05: boxes from the play map never show over a planner, a handbook page or the data map; they come back as they
   were left; only a window of its own stays. The module's core and its watcher are sliced by their markers and run for real on a page
   of plain objects, and so is every place another module asks it: Table Chat (net.js), the dice roller (dice.js), the table notepad,
   the page panel's Esc key (docpanel.js). The rest of the wiring is pinned by its text. No browser.
   Usage: node tools/floatcheck.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', 'system', 'app'), root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 900) : ''); } }
const sliceOf = (src, suite, n) => { const a = src.indexOf('// [' + suite + ':' + n + '-start]'), z = src.indexOf('// [' + suite + ':' + n + '-end]'); if (a < 0 || z < a) throw new Error('floatcheck: the ' + n + ' slice is not marked'); return src.slice(a, z); };
const fnK = (src, head, tail) => { const a = src.indexOf(head); if (a < 0) throw new Error('floatcheck: not found: ' + head.slice(0, 60)); const z = src.indexOf(tail, a); if (z < 0) throw new Error('floatcheck: no end for: ' + head.slice(0, 60)); return src.slice(a, z + tail.length); };
const lineOf = (src, head) => fnK(src, head, '\n');
const count = (s, f) => s.split(f).length - 1;

const fl = read('scripts/floats.js'), coreSrc = sliceOf(fl, 'floatcheck', 'core'), watchSrc = sliceOf(fl, 'floatcheck', 'watch');

/* ---------- a page of plain objects ---------- */
// An element: an inline display that counts every write, a class list, what it holds, the events it was sent
function mkEl(id, display) {
    const cls = new Set(), el = { id: id || '', nodeType: 1, kids: [], writes: 0, blurred: 0, ev: [], on: {} };
    let disp = display;
    el.style = {}; Object.defineProperty(el.style, 'display', { get: () => disp, set: v => { disp = v; el.writes++; }, enumerable: true });
    el.classList = { add: c => { cls.add(c); }, remove: c => { cls.delete(c); }, contains: c => cls.has(c) };
    el.classes = () => [...cls];
    el.contains = x => x === el || el.kids.includes(x);
    el.addEventListener = (t, f) => { (el.on[t] = el.on[t] || []).push(f); };
    el.dispatchEvent = e => { el.ev.push(e.type); (el.on[e.type] || []).forEach(f => f(e)); return true; };
    el.blur = () => { el.blurred++; };
    return el;
}
class MO { constructor(cb) { MO.last = this; this.cb = cb; this.seen = []; } observe(t, o) { this.seen.push([t, o]); } }
function world() {
    const els = {}, layer = { id: 'hudLayer', children: [] }, doc = { activeElement: null, getElementById: id => id === 'hudLayer' ? layer : (els[id] || null) };
    const win = {}, st = { viewMode: 'visual' }, W = { asked: 0, item: { type: 'map' } };
    class CE { constructor(t) { this.type = t; } }
    const api = new Function('window', 'document', 'state', 'getActiveMap', 'isDocLike', 'CustomEvent', 'MutationObserver', coreSrc + '\n' + watchSrc
        + '\nreturn { view: floatView, now: floatNow, up: floatUp, away: floatAway, shown: floatShown, note: floatNote, sync: floatSync, reveal: floatReveal, leave: floatLeave, watch: watch, IDS: FLOAT_IDS, WITH: FLOAT_WITH, AWAY: FLOAT_AWAY, BACK: FLOAT_BACK, LAYER: FLOAT_LAYER };')(
        win, doc, st, () => { W.asked++; return W.item; }, it => !!it && (it.type === 'planner' || it.type === 'doc'), CE, MO);
    api.IDS.forEach(id => { els[id] = mkEl(id, 'none'); });
    Object.assign(W, { api, els, layer, doc, win, st,
        // the view on screen changes as render() does it: the state first, then one sync
        go(v) { if (v === '') W.item = null; else if (v === 'page') W.item = { type: 'planner' }; else { W.item = { type: 'map' }; st.viewMode = v === 'play' ? 'visual' : 'data'; } return api.sync(); },
        // a module shows or hides its box (its inline display), and the page's observer notes it
        up(id) { const e = typeof id === 'string' ? els[id] : id; e.style.display = 'flex'; api.note(e, api.now()); return e; },
        down(id) { const e = typeof id === 'string' ? els[id] : id; e.style.display = 'none'; api.note(e, api.now()); return e; },
        hud() { const h = mkEl('', ''); layer.children.push(h); api.note(h, api.now()); return h; },
        is(id) { const e = typeof id === 'string' ? els[id] : id; return !api.up(e) ? 'down' : api.away(e) ? 'away' : 'shown'; },
        all() { return api.IDS.map(id => W.is(id)); } });
    return W;
}
const VIEWS = ['play', 'data', 'page'];

/* ---------- the views ---------- */
{
    const W = world(), a = W.api, map = { type: 'map' };
    check('a view is told from the open item and the map\'s face: the play map, the data map, or a page (a planner or a handbook page, whatever face its map was last on); with nothing open there is none',
        a.view(map, 'visual', false) === 'play' && a.view(map, 'data', false) === 'data' && a.view(map, 'anything else', false) === 'data' && a.view({ type: 'planner' }, 'visual', true) === 'page' && a.view({ type: 'doc' }, 'data', true) === 'page'
        && a.view(null, 'visual', false) === '' && a.view(undefined, 'data', true) === '', J([a.view(map, 'visual', false), a.view(map, 'data', false), a.view({}, 'visual', true), a.view(null, 'visual', false)]));
    W.go('play'); const p = a.now(); W.go('data'); const d = a.now(); W.go('page'); const g = a.now(); W.go(''); const none = a.now();
    W.go('play'); W.win.wpPopout = true; const pop = a.now(); W.win.wpPopout = false; W.win.wpStream = true; const str = a.now(); W.win.wpStream = false;
    check('the view on screen is read from the app\'s own state each time it is asked; a window of its own (a pop-out, the stream window) has none, so nothing is ever put away there',
        p === 'play' && d === 'data' && g === 'page' && none === '' && pop === '' && str === '' && a.now() === 'play', J([p, d, g, none, pop, str]));
}

/* ---------- the owner's rule ---------- */
{
    const W = world(), a = W.api; W.go('play');
    a.IDS.forEach(id => W.up(id)); const h = W.hud();
    const w0 = a.IDS.map(id => W.els[id].writes), onPlay = W.all().concat(W.is(h));
    const backD = W.go('data'), onData = W.all().concat(W.is(h));
    const backG = W.go('page'), onPage = W.all().concat(W.is(h));
    const classes = W.els.sheetPanel.classes();
    const backP = W.go('play'), again = W.all().concat(W.is(h));
    const w1 = a.IDS.map(id => W.els[id].writes), told = a.IDS.map(id => J(W.els[id].ev)).concat(J(h.ev));
    check('boxes that came up on the play map show there, and on the data map and on a page every one is put away: the sheet panel, the page panel, Sound, Music, Video, Effects, the notepad, Table Chat, the dice roller and a HUD',
        onPlay.every(s => s === 'shown') && onData.every(s => s === 'away') && onPage.every(s => s === 'away') && backD === 0 && backG === 0 && a.IDS.length === 9 && J(a.IDS) === J(['sheetPanel', 'docPanel', 'soundPanel', 'musicPanel', 'videoPanel', 'fxPanel', 'notepadPanel', 'chatPanel', 'dicePanel']),
        J([onPlay, onData, onPage, backD, backG]));
    check('nothing is closed: a box is put away with the one class wp-away and its own display is never written, so its module still holds it open and it keeps its place',
        J(classes) === J(['wp-away']) && a.AWAY === 'wp-away' && J(w0) === J(w1) && w0.every(n => n === 1), J([classes, w0, w1]));
    check('back on the play map every box shows as it was left: the class is gone, each box is told once that it is back (wpfloatback), and the count of boxes that came back is returned',
        again.every(s => s === 'shown') && backP === 10 && told.every(t => t === J(['wpfloatback'])) && a.BACK === 'wpfloatback' && W.go('play') === 0, J([again, backP, told]));
}
{
    const W = world(), a = W.api; W.go('play'); W.up('sheetPanel'); W.go('data');
    const before = W.is('sheetPanel'), ret = a.reveal(W.els.sheetPanel), here = W.is('sheetPanel');
    W.go('play'); const play = W.is('sheetPanel'); W.go('page'); const page = W.is('sheetPanel'); W.go('data'); const data = W.is('sheetPanel');
    W.go('page'); a.reveal(W.els.sheetPanel); const page2 = W.is('sheetPanel'); W.go('data'); const data2 = W.is('sheetPanel'); W.go('play'); const play2 = W.is('sheetPanel');
    check('a box asked for on another view (reveal) shows there from then on and on the play map, and still not on a view it was never asked for on; asked for on both it shows on all three',
        before === 'away' && ret === 'data' && here === 'shown' && play === 'shown' && page === 'away' && data === 'shown' && page2 === 'shown' && data2 === 'shown' && play2 === 'shown', J([before, ret, here, play, page, data, page2, data2, play2]));
    W.down('sheetPanel'); const downCls = W.els.sheetPanel.classes(); W.go('play'); W.up('sheetPanel'); W.go('data'); const after = W.is('sheetPanel'); W.go('page'); const after2 = W.is('sheetPanel');
    check('a box that goes down forgets where it was asked for: closed and opened again on the play map, it is put away on the data map and on a page once more',
        J(downCls) === '[]' && after === 'away' && after2 === 'away', J([downCls, after, after2]));
}
{
    const W = world(); W.go('data'); W.up('videoPanel'); const d = W.is('videoPanel'); W.go('play'); const p = W.is('videoPanel'); W.go('page'); const g = W.is('videoPanel'); W.go('data'); const d2 = W.is('videoPanel');
    check('a box that comes up by itself on another view shows there: it came up on the data map, so it shows on the data map and on the play map, and is put away on a page',
        d === 'shown' && p === 'shown' && g === 'away' && d2 === 'shown', J([d, p, g, d2]));
    // unseen by the observer: the display was set and nobody noted it
    const U = world(); U.go('page'); U.els.fxPanel.style.display = 'flex'; U.api.sync(); const u1 = U.is('fxPanel'); U.go('data'); const u2 = U.is('fxPanel'); U.go('play'); const u3 = U.is('fxPanel'); U.go('page'); const u4 = U.is('fxPanel');
    // came up while no view was on screen
    const N = world(); N.go(''); N.up('chatPanel'); const n0 = N.is('chatPanel'); N.go('data'); const n1 = N.is('chatPanel'); N.go('page'); const n2 = N.is('chatPanel'); N.go('data'); const n3 = N.is('chatPanel');
    check('a box nobody saw come up, or one that came up while no view was on screen, takes the first view it is met on: it shows there and on the play map',
        u1 === 'shown' && u2 === 'away' && u3 === 'shown' && u4 === 'shown' && n0 === 'shown' && n1 === 'shown' && n2 === 'away' && n3 === 'shown', J([u1, u2, u3, u4, n0, n1, n2, n3]));
}
{
    const W = world(), a = W.api; W.go('play'); a.IDS.forEach(id => W.up(id));
    const st0 = J(W.all()); W.go('');
    const none = W.api.sync(), st1 = J(W.all());
    W.item = { type: 'planner' }; W.win.wpPopout = true; const pop = a.sync(), st2 = J(W.all()); W.win.wpPopout = false; W.win.wpStream = true; const str = a.sync(), st3 = J(W.all()); W.win.wpStream = false;
    const realPage = a.sync(), st4 = W.all(); W.go('data'); W.go(''); const st5 = W.all(), none2 = a.sync();
    check('with no view on screen nothing moves: no item open, a pop-out and the stream window (each with a planner open in it) leave every box that shows showing and every box that is put away put away, and the count is 0',
        none === 0 && pop === 0 && str === 0 && JSON.parse(st0).every(s => s === 'shown') && st0 === st1 && st1 === st2 && st2 === st3 && realPage === 0 && st4.every(s => s === 'away') && st5.every(s => s === 'away') && none2 === 0, J([none, pop, str, st0 === st3, realPage, st4, st5]));
}
{
    const W = world(), a = W.api; W.go('play'); const h1 = W.hud(); W.go('data'); const h2 = W.hud();
    const onData = [W.is(h1), W.is(h2)]; W.go('page'); const onPage = [W.is(h1), W.is(h2)]; W.go('play'); const onPlay = [W.is(h1), W.is(h2)];
    W.go('page'); const r = a.reveal(h1); const asked = [W.is(h1), W.is(h2)];
    W.layer.children.splice(0, 1); const gone = W.go('data');   // closed: a HUD is taken out of its layer
    check('each HUD in the layer is a box of its own: one opened on the play map is put away elsewhere, one opened on the data map shows there and on the play map, one asked for on a page shows there, and one that was closed is simply gone',
        J(onData) === J(['away', 'shown']) && J(onPage) === J(['away', 'away']) && J(onPlay) === J(['shown', 'shown']) && r === 'page' && J(asked) === J(['shown', 'away']) && gone === 1 && W.is(h2) === 'shown' && a.LAYER === 'hudLayer', J([onData, onPage, onPlay, r, asked, gone]));
}
{
    const W = world(); W.go('play'); const sheet = W.up('sheetPanel'), chat = W.up('chatPanel');
    const field = { blurred: 0, blur() { this.blurred++; } }; sheet.kids.push(field); W.doc.activeElement = field;
    W.go('page'); const b1 = field.blurred;
    W.go('play'); const other = { blurred: 0, blur() { this.blurred++; } }; W.doc.activeElement = other; W.go('data');
    W.go('play'); W.doc.activeElement = field; W.go('play'); const stay = field.blurred;
    check('nothing is typed into a box that is not shown: the focus is taken out of a box as it is put away (which also lets a field commit what was typed), and a focus anywhere else, or in a box that stays, is left alone',
        b1 === 1 && other.blurred === 0 && stay === 1 && chat.blurred === 0, J([b1, other.blurred, stay]));
}

/* ---------- the dice roller goes where Table Chat goes ---------- */
{
    const W = world(), a = W.api; W.go('play'); const chat = W.up('chatPanel'), dice = W.up('dicePanel'); W.go('page');
    const both0 = [W.is(chat), W.is(dice)]; chat.ev.length = 0; dice.ev.length = 0;
    const lent = a.reveal(chat), both1 = [W.is(chat), W.is(dice)], told = [J(chat.ev), J(dice.ev)];
    W.go('data'); const both2 = [W.is(chat), W.is(dice)]; W.go('page'); const both3 = [W.is(chat), W.is(dice)];
    check('the dice roller goes with Table Chat while the chat is up: the chat asked for on a page brings the roller back with it, both told, and both are put away on the data map',
        J(a.WITH) === J({ dicePanel: 'chatPanel' }) && J(both0) === J(['away', 'away']) && lent === 'page' && J(both1) === J(['shown', 'shown']) && J(told) === J([J(['wpfloatback']), J(['wpfloatback'])]) && J(both2) === J(['away', 'away']) && J(both3) === J(['shown', 'shown']), J([both0, lent, both1, told, both2, both3]));
    // the roller opened beside a chat that shows here takes the chat's views; alone (the chat popped out, so down) it goes by its own
    // (as its module does it: the display is set and reveal is called at once, before the page's observer has a word)
    const D = world(); D.go('play'); const c2 = D.up('chatPanel'); D.go('data'); D.api.reveal(c2); const d2 = D.els.dicePanel; d2.style.display = 'flex'; D.api.reveal(d2); const s1 = [D.is(c2), D.is(d2)];
    D.go('page'); const s2 = [D.is(c2), D.is(d2)]; D.go('data'); D.down(c2); D.api.sync(); const s3 = D.is(d2); D.go('page'); const s4 = D.is(d2); D.go('play'); const s5 = D.is(d2);
    check('the roller opened beside a chat that shows on the data map shows there too; left up alone, with the chat down, it shows by its own views',
        J(s1) === J(['shown', 'shown']) && J(s2) === J(['away', 'away']) && s3 === 'shown' && s4 === 'away' && s5 === 'shown', J([s1, s2, s3, s4, s5]));
}

/* ---------- borrowed for a view, and given back ---------- */
{
    const W = world(), a = W.api; W.go('play'); const chat = W.up('chatPanel');
    const onPlay = a.reveal(chat); W.go('page'); const lent = a.reveal(chat), again = a.reveal(chat), s1 = W.is(chat);
    const back = a.leave(chat, 'page'), s2 = W.is(chat); W.go('play'); const s3 = W.is(chat); W.go('page'); const s4 = W.is(chat);
    const closed = world(); closed.go('page'); const none = closed.api.reveal(closed.els.chatPanel); closed.up('chatPanel'); const sc = closed.is('chatPanel');
    check('reveal says when a box was only borrowed: it answers with the view when the box was up and put away until then, and with nothing on the play map, for a box already shown or for one that was down',
        onPlay === '' && lent === 'page' && again === '' && s1 === 'shown' && none === '' && sc === 'shown', J([onPlay, lent, again, s1, none, sc]));
    check('leave gives a borrowed box back: it is put away on that view again and shows on the play map as before; a view it was never on, or a word that is no view, changes nothing',
        back === 0 && s2 === 'away' && s3 === 'shown' && s4 === 'away' && a.leave(chat, 'data') === 0 && a.leave(chat, null) === 0 && a.leave(null, 'page') === 0 && W.is(chat) === 'away', J([back, s2, s3, s4]));
}
{
    const W = world(), a = W.api; W.go('play'); const m = W.up('musicPanel'); W.go('data'); const away = W.is(m);
    m.style.display = 'none'; const stale = m.classes(); a.note(m, a.now()); const noted = m.classes();
    W.up('soundPanel'); W.go('play'); W.go('page'); W.els.soundPanel.style.display = 'none'; a.sync(); const swept = W.els.soundPanel.classes();
    const odd = [a.up(null), a.up({}), a.up({ style: {} }), a.away(null), a.away({}), a.shown(null), a.reveal(null), a.reveal({}), a.note(null, 'play'), a.note({}, 'play')];
    check('a box that is down never carries the class: one closed while it was put away loses it when that is noted, and at the next look if nobody noted it; an odd thing in place of a box is not a box and throws nothing',
        away === 'away' && J(stale) === J(['wp-away']) && J(noted) === '[]' && J(swept) === '[]' && J(odd) === J([false, false, true, false, false, false, '', '', undefined, undefined]), J([away, stale, noted, swept, odd]));
}

/* ---------- the watcher ---------- */
{
    const W = world(), a = W.api; W.go('play'); MO.last = null; a.watch(); const mo = MO.last;
    const seen = mo.seen.map(s => (s[0].id || '?') + ':' + J(s[1]));
    const want = a.IDS.map(id => id + ':' + J({ attributes: true, attributeFilter: ['style'] })).concat('hudLayer:' + J({ childList: true }));
    check('the page is watched for a box coming up or going down by its own module\'s hand: the inline style of each box, and the children of the HUD layer; nothing else',
        J(seen) === J(want), J(seen));
    // a box dragged about changes its style on every move and its display not at all: the view is not even asked
    const sheet = W.els.sheetPanel; sheet.style.display = 'flex'; mo.cb([{ type: 'attributes', target: sheet }]); const first = W.is(sheet);
    W.go('data'); const n0 = W.asked; for (let i = 0; i < 50; i++) mo.cb([{ type: 'attributes', target: sheet }]); const dragged = W.asked - n0, still = W.is(sheet);
    const hud = mkEl('', ''); W.layer.children.push(hud); mo.cb([{ type: 'childList', addedNodes: [{ nodeType: 3 }, hud] }]); const hudOn = W.is(hud); W.go('page'); const hudPage = W.is(hud); W.go('data');
    sheet.style.display = 'none'; mo.cb([{ type: 'attributes', target: sheet }]); const downCls = J(sheet.classes()); sheet.style.display = 'flex'; mo.cb([{ type: 'attributes', target: sheet }]); const upAgain = W.is(sheet);
    check('what the watcher sees: a box that comes up belongs to the view on screen then (a sheet opened on the play map is away on the data map, opened again on the data map it shows there), a HUD added to the layer alike, a text node is no box, and a box dragged about asks nothing',
        first === 'shown' && dragged === 0 && still === 'away' && hudOn === 'shown' && hudPage === 'away' && downCls === '[]' && upAgain === 'shown', J([first, dragged, still, hudOn, hudPage, downCls, upAgain]));
    check('the module publishes its six calls and starts its watcher; it imports only the app\'s state and the two readers of the open item, and nothing in it writes a box\'s own display',
        /\nwindow\.wpFloats = \{ sync: floatSync, reveal: floatReveal, leave: floatLeave, away: floatAway, shown: floatShown, view: floatNow \};\nwatch\(\);\n$/.test(fl)
        && J((fl.match(/^import [^\n]*$/gm) || [])) === J(["import { state } from './state.js';", "import { getActiveMap, isDocLike } from './models.js';"]) && !/\.style\.display\s*=[^=]/.test(fl) && !/innerHTML|eval\(|new Function/.test(fl), J(fl.match(/^import [^\n]*$/gm)));
}

/* ---------- the page, the stylesheet, the view switch ---------- */
const ix = read('index.html'), css = read('style.css'), mainS = read('scripts/main.js');
{
    const ids = world().api.IDS, tags = ids.map(id => (ix.match(new RegExp('<div id="' + id + '"[^>]*>')) || [''])[0]);
    check('every box is hidden by an inline display in the page, which is how the module tells up from down; the HUD layer is there, and a HUD made from its template carries no display of its own',
        tags.every(t => /style="display:none;/.test(t)) && ids.every(id => count(ix, 'id="' + id + '"') === 1) && count(ix, '<div id="hudLayer"></div>') === 1 && /<template id="hudTpl"><div class="hud-panel" role="dialog" aria-label="HUD">/.test(ix), J(tags.map(t => t.slice(0, 60))));
    const rules = css.match(/[^\n{}]*\.wp-away[^{]*\{[^}]*\}/g) || [];
    check('the stylesheet has one rule for a box that is put away, and it wins over the box\'s own inline display',
        rules.length === 1 && /^\s*\.wp-away \{ display: none !important; \}$/.test(rules[0]) && count(css, 'wp-away') === 1, J(rules));
    const scripts = ix.match(/<script type="module" src="scripts\/[a-z]+\.js"><\/script>/g) || [], names = scripts.map(s => s.replace(/^.*scripts\/|\.js.*$/g, ''));
    check('the page loads the module once, right after main.js (whose imports it shares, so no module\'s order moves) and before the modules that ask it',
        count(ix, 'scripts/floats.js') === 1 && names.indexOf('floats') === names.indexOf('main') + 1 && names.indexOf('floats') < names.indexOf('net') && names.indexOf('floats') < names.indexOf('dice') && names.indexOf('floats') < names.indexOf('sheets') && names.indexOf('floats') < names.indexOf('docpanel'), J(names.slice(0, 12)));
    const r0 = mainS.indexOf('export function render() {'), wrap = mainS.indexOf("document.getElementById('plannerWrap').style.display = isPlanner ? 'flex' : 'none';", r0), sync = mainS.indexOf('if (window.wpFloats) window.wpFloats.sync();', r0), crumb = mainS.indexOf('// Breadcrumb trail for nested maps', r0);
    const early = mainS.slice(r0, sync);
    check('the view switch tells the module once, in render(): after the three wrappers are switched (so the view it reads is the one drawn) and before anything of the view is drawn; the only ways out of render() before it are the ones with no map to show',
        r0 > 0 && wrap > r0 && sync > wrap && crumb > sync && count(mainS, 'window.wpFloats.sync()') === 1 && count(mainS, 'wpFloats') === 2 && count(early, 'return;') === 2 && count(early, 'if(!activeMap) return;') === 1 && count(early, 'if (!activeMap) return;') === 1,
        J([r0 > 0, wrap > r0, sync > wrap, crumb > sync, count(early, 'return;')]));
}

/* ---------- Table Chat (net.js) ---------- */
const net = read('scripts/net.js');
const chatParts = [(net.match(/\nfunction chatHidden\(p\) \{[^\n]*\}\n/) || [''])[0], lineOf(net, 'var _chatRollOpened = false, _chatDismissTimer = null;'), lineOf(net, 'function cancelChatDismiss() {'), sliceOf(net, 'floatcheck', 'chatback'),
    fnK(net, 'function armChatDismiss() {', '\n}\n'), fnK(net, 'function pushChat(m) {', '\n}\n'), fnK(net, "if (_chatBtn) _chatBtn.addEventListener('click', function() {\n", '\n});\n'), lineOf(net, "var _chatBackEl = ui('chatPanel');")];
// A chat panel as its module sees it. o: the view on screen, the panel's inline display, whether it is put away, floats: false for a page without the module
function chatWorld(o) {
    const C = { toasts: [], timers: [], reveals: 0, leaves: [], rendered: 0, soon: 0, diceClosed: 0, recips: 0, landed: 0, focused: 0, away: !!o.away, view: o.view, btn: null, on: {} };
    const panel = { id: 'chatPanel', style: { display: o.display }, addEventListener: (t, f) => { C.on[t] = f; } };
    const floats = o.floats === false ? undefined : { view: () => C.view, away: p => p === panel && C.away,
        reveal: p => { C.reveals++; const lent = C.away && panel.style.display !== 'none' && C.view && C.view !== 'play' ? C.view : ''; C.away = false; return lent; },
        leave: (p, v) => { C.leaves.push(v); if (v === C.view) C.away = true; } };
    const win = { wpFloats: floats, wpDice: { line: m => 'ROLL by ' + m.from.name, landed: () => { C.landed++; }, closePanel: () => { C.diceClosed++; } } };
    const ui = id => id === 'chatPanel' ? panel : id === 'chatInput' ? { focus: () => { C.focused++; } } : null;
    const api = new Function('ui', 'renderChat', 'renderChatSoon', 'refreshChatRecipients', 'net', 'toast', 'applyLine', 'dueLine', 'window', 'setTimeout', 'clearTimeout', '_chatBtn',
        'var chatLog = [], chatUnread = 0;\n' + chatParts.join('\n') + '\nreturn { push: pushChat, hidden: chatHidden, back: chatGiveBack, cancel: cancelChatDismiss, arm: armChatDismiss, opened: function(v) { if (arguments.length) _chatRollOpened = v; return _chatRollOpened; }, unread: function(v) { if (arguments.length) chatUnread = v; return chatUnread; } };')(
        ui, () => { C.rendered++; }, () => { C.soon++; }, () => { C.recips++; }, { myId: 'u_me' }, t => { C.toasts.push(t); }, () => 'APPLY', () => 'DUE', win,
        (fn, ms) => { C.timers.push({ fn, ms }); return C.timers.length; }, id => { const t = C.timers[id - 1]; if (t) t.fn = null; }, { addEventListener: (t, f) => { C.btn = f; } });
    C.api = api; C.panel = panel;
    C.fire = () => { const live = C.timers.filter(t => t.fn); live.forEach(t => { const f = t.fn; t.fn = null; f(); }); return live.map(t => t.ms); };
    C.is = () => panel.style.display === 'none' ? 'closed' : C.away ? 'away' : 'shown';
    return C;
}
const roll = id => ({ roll: { total: 7 }, from: { id: id, name: id === 'u_me' ? 'Me' : 'Kara' }, text: '', scope: 'global' });
const said = id => ({ from: { id: id, name: 'Kara' }, text: 'hello there', scope: 'global' });
const due = theirs => ({ due: { theirs: theirs }, from: { id: 'u_gm', name: 'GM', gm: true }, text: '', scope: 'global' });
{
    const C = chatWorld({ view: 'page', display: 'flex', away: true }), a = C.api;
    const noFl = chatWorld({ view: 'page', display: 'flex', away: true, floats: false }).api;
    check('Table Chat counts as closed when it is put away: closed, or up and put away on this view, it is hidden; shown it is not; without the module only its own display is asked',
        a.hidden(null) === true && a.hidden({ style: { display: 'none' } }) === true && a.hidden(C.panel) === true && (C.away = false, a.hidden(C.panel)) === false && noFl.hidden({ style: { display: 'flex' } }) === false && noFl.hidden({ style: { display: 'none' } }) === true);
    a.opened('page'); const y = a.back(C.panel), lv = J(C.leaves); a.opened(true); const n1 = a.back(C.panel); a.opened(false); const n2 = a.back(C.panel); a.opened('page'); const n3 = a.back(null);
    noFl.opened('page'); const n4 = noFl.back(C.panel);
    check('a chat a roll borrowed is given back to the view it was borrowed for, and only then: one a roll opened from closed, one nobody borrowed, no panel and a page without the module give nothing back',
        y === true && lv === J(['page']) && n1 === false && n2 === false && n3 === false && n4 === false && C.leaves.length === 1, J([y, lv, n1, n2, n3, n4]));
}
{
    // who raises Table Chat, by the view on screen, with the chat closed
    const run = (view, msg, o) => { const C = chatWorld(Object.assign({ view: view, display: 'none' }, o || {})); C.api.push(msg); return { is: C.is(), unread: C.api.unread(), toasts: C.toasts.length, opened: C.api.opened(), armed: C.timers.filter(t => t.fn).map(t => t.ms), reveals: C.reveals, soon: C.soon, landed: C.landed, C: C }; };
    const rose = r => r.is === 'shown' && r.unread === 0 && r.toasts === 0 && r.opened === true && J(r.armed) === J([6000]);
    const kept = r => r.is === 'closed' && r.unread === 1 && r.toasts === 1 && r.opened === false && r.armed.length === 0 && r.reveals === 0;
    const play = ['play', ''].map(v => [run(v, roll('u_me')), run(v, roll('u_her'))]), bare = [run('page', roll('u_me'), { floats: false }), run('page', roll('u_her'), { floats: false })];
    check('on the play map a roll raises Table Chat as it always did, yours or someone else\'s, and the chat goes away again by itself after six seconds; so it does where no view is on screen and on a page without the module',
        play.every(p => p.every(rose)) && bare.every(rose) && play[0][1].C.toasts.length === 0 && play.every(p => p.every(r => r.soon === 1 && r.landed === 1)), J(play.map(p => p.map(r => [r.is, r.unread, r.toasts, r.opened, r.armed]))));
    const off = ['page', 'data'].map(v => ({ mine: run(v, roll('u_me')), hers: run(v, roll('u_her')) }));
    check('on a planner, a handbook page or the data map someone else\'s roll does not raise the chat: it stays closed, the roll is a notice in the roller\'s own words and a count on the chat button, and no timer is set; your own roll raises it where you are',
        off.every(o => rose(o.mine) && o.mine.reveals === 1 && kept(o.hers) && o.hers.C.toasts[0] === 'ROLL by Kara' && o.hers.soon === 1 && o.hers.landed === 1), J(off.map(o => [o.mine.is, o.mine.opened, o.hers.is, o.hers.unread, o.hers.C.toasts])));
    const dMine = run('page', due(false)), dTheirs = run('page', due(true)), talk = run('page', said('u_her')), mineTalk = run('page', said('u_me'));
    check('a reminder that is yours to press raises the chat on any view and is never put away by a timer; one that is someone else\'s, and a line someone says, are a notice and a count as before; a line of your own is neither',
        dMine.is === 'shown' && dMine.opened === true && dMine.armed.length === 0 && dTheirs.is === 'closed' && dTheirs.unread === 1 && dTheirs.C.toasts[0] === 'DUE' && talk.is === 'closed' && talk.unread === 1 && talk.C.toasts[0] === 'Kara: hello there' && mineTalk.unread === 0 && mineTalk.toasts === 0,
        J([dMine.is, dMine.armed, dTheirs.is, dTheirs.C.toasts, talk.C.toasts, mineTalk.unread]));
}
{
    // the chat is up on the play map and put away here
    const hers = chatWorld({ view: 'page', display: 'flex', away: true }); hers.api.push(roll('u_her'));
    const mine = chatWorld({ view: 'page', display: 'flex', away: true }); mine.api.push(roll('u_me'));
    const m0 = [mine.is(), mine.api.opened(), mine.reveals, J(mine.timers.map(t => t.ms))], fired = mine.fire(), m1 = [mine.is(), mine.panel.style.display, J(mine.leaves), mine.diceClosed, mine.api.opened()];
    check('a chat that is up on the play map and put away on a page stays put away for someone else\'s roll, with the notice and the count; your own roll borrows it for the page, and when its six seconds are over it is given back, not closed: on the play map it is as it was left',
        hers.is() === 'away' && hers.api.unread() === 1 && hers.toasts.length === 1 && hers.reveals === 0 && hers.timers.length === 0
        && J(m0) === J(['shown', 'page', 1, '[6000]']) && J(fired) === J([6000]) && J(m1) === J(['away', 'flex', J(['page']), 0, false]), J([hers.is(), hers.api.unread(), m0, fired, m1]));
    // a second roll while it is borrowed sets the six seconds again and borrows nothing more; touching the chat keeps it here
    const again = chatWorld({ view: 'data', display: 'flex', away: true }); again.api.push(roll('u_me')); again.api.push(roll('u_her')); const a0 = [again.reveals, again.timers.filter(t => t.fn).length, again.timers.length, again.api.unread(), again.toasts.length];
    again.api.cancel(); const a1 = [again.fire().length, again.is(), again.api.opened(), J(again.leaves)];
    check('while the chat is borrowed a further roll only sets its six seconds again; touching the chat keeps it on this view: nothing is given back and nothing closes',
        J(a0) === J([1, 1, 2, 0, 0]) && J(a1) === J([0, 'shown', false, '[]']), J([a0, a1]));
    // opened from closed by a roll: the timer closes it, and the roller with it, as before
    const plain = chatWorld({ view: 'play', display: 'none' }); plain.api.push(roll('u_her')); plain.fire(); const p1 = [plain.is(), plain.diceClosed, plain.api.opened(), J(plain.leaves)];
    check('a chat a roll opened from closed is closed again when its six seconds are over, and the dice roller with it, as before',
        J(p1) === J(['closed', 1, false, '[]']), J(p1));
}
{
    // the chat button in the header
    const press = o => { const C = chatWorld(o); if (o.opened !== undefined) C.api.opened(o.opened); C.api.unread(3); C.btn(); return [C.is(), C.reveals, C.api.unread(), C.rendered, C.recips, C.focused, J(C.leaves), C.api.opened()]; };
    const closed = press({ view: 'page', display: 'none' }), away = press({ view: 'data', display: 'flex', away: true }), shown = press({ view: 'page', display: 'flex' }), onPlay = press({ view: 'play', display: 'flex' });
    const lent = press({ view: 'page', display: 'flex', opened: 'page' }), bare0 = press({ view: 'page', display: 'none', floats: false }), bare1 = press({ view: 'page', display: 'flex', floats: false });
    check('the chat button is never dead: on a chat that is closed, or up and put away on this view, it brings the chat up here, asked for on this view, with nothing unread and the box to type in; on a chat that shows it closes it',
        J(closed) === J(['shown', 1, 0, 1, 1, 1, '[]', false]) && J(away) === J(['shown', 1, 0, 1, 1, 1, '[]', false]) && J(shown) === J(['closed', 0, 3, 0, 0, 0, '[]', false]) && J(onPlay) === J(['closed', 0, 3, 0, 0, 0, '[]', false])
        && J(bare0) === J(['shown', 0, 0, 1, 1, 1, '[]', false]) && J(bare1) === J(['closed', 0, 3, 0, 0, 0, '[]', false]), J([closed, away, shown, onPlay, bare0, bare1]));
    check('pressed while a roll has the chat borrowed for this view, the button gives it back and does not close it, so on the play map it is still as it was left',
        J(lent) === J(['away', 0, 3, 0, 0, 0, J(['page']), false]), J(lent));
    const B = chatWorld({ view: 'play', display: 'flex' }); B.api.unread(4); const has = typeof B.on.wpfloatback === 'function'; if (has) B.on.wpfloatback();
    check('the chat back on screen after being put away shows what came meanwhile: nothing is left unread and it is drawn again, which puts its newest line in view',
        has && B.api.unread() === 0 && B.rendered === 1 && count(net, "addEventListener('wpfloatback'") === 1, J([has, B.api.unread(), B.rendered]));
    check('the other ways the chat is asked for go by the same word: its own opener (a dock back from its window, the dice roller, the tour) and the count when a table\'s history arrives treat a chat that is put away as closed',
        count(net, "var cp = ui('chatPanel'); if (cp && chatHidden(cp)) { var cb = ui('chatBtn'); if (cb) cb.click(); else cp.style.display = 'flex'; }") === 2
        && count(net, "if (!cp || cp.style.display === 'none' || (window.wpFloats && window.wpFloats.away(cp))) { chatUnread += added;") === 1 && count(net, "cp.style.display === 'none') { var cb = ui('chatBtn')") === 0);
}

/* ---------- the table notepad (net.js) ---------- */
{
    const src = fnK(net, 'net.notepadToggle = function() {', '\n};\n');
    const run = o => { const R = { asked: 0, sent: 0, drawn: 0, reveals: 0, toasts: 0 }, panel = { id: 'notepadPanel' };
        const n = { role: o.role || 'host', notepad: { on: o.on, text: o.text || '' } };
        const win = { wpFloats: o.floats === false ? undefined : { away: p => p === panel && !!o.away, reveal: () => { R.reveals++; } } };
        new Function('net', 'ui', 'window', 'showConfirm', 'broadcast', 'notepadMsg', 'renderNotepad', 'toast', 'logEvent', 'setTimeout', src + '\nnet.notepadToggle();')(
            n, id => id === 'notepadPanel' ? panel : null, win, () => { R.asked++; }, () => { R.sent++; }, () => ({}), () => { R.drawn++; }, () => { R.toasts++; }, () => {}, () => {});
        return [n.notepad.on, R.asked, R.sent, R.drawn, R.reveals]; };
    const away = run({ on: true, away: true }), shown = run({ on: true }), off = run({ on: false }), bare = run({ on: true, away: true, floats: false }), player = run({ on: true, away: true, role: 'client' });
    check('the table notepad asked for while it is up on another view shows here: nobody is asked to put it away and nothing is sent; one that shows is asked about as before, one that is off opens for everyone, and a player\'s app does nothing',
        J(away) === J([true, 0, 0, 0, 1]) && J(shown) === J([true, 1, 0, 0, 0]) && J(off) === J([true, 0, 1, 1, 0]) && J(bare) === J([true, 1, 0, 0, 0]) && J(player) === J([true, 0, 0, 0, 0]), J([away, shown, off, bare, player]));
}

/* ---------- the dice roller (dice.js) ---------- */
const dice = read('scripts/dice.js');
{
    const src = lineOf(dice, 'function panelOpen() {') + sliceOf(dice, 'floatcheck', 'dice');
    const mk = o => { const p = { id: 'dicePanel', style: { display: o.dice } }, c = { id: 'chatPanel', style: { display: o.chat }, getBoundingClientRect: () => ({ right: 1480, top: 662 }) };
        const win = { innerWidth: 1500, innerHeight: 900, wpFloats: o.floats === false ? undefined : { away: e => (e === p && !!o.diceAway) || (e === c && !!o.chatAway) } };
        const a = new Function('ui', 'window', src + '\nreturn { open: panelOpen, shown: panelShown, away: awayNow, place: placePanel };')(id => id === 'dicePanel' ? p : id === 'chatPanel' ? c : null, win);
        a.place(); return { open: a.open(), shown: a.shown(), at: [p.style.right, p.style.bottom], awayNull: a.away(null), awayC: a.away(c) }; };
    const up = mk({ dice: 'flex', chat: 'flex' }), put = mk({ dice: 'flex', chat: 'flex', diceAway: true, chatAway: true }), shut = mk({ dice: 'none', chat: 'none' }), noChat = mk({ dice: 'flex', chat: 'none' }), bare = mk({ dice: 'flex', chat: 'flex', floats: false });
    check('the dice roller tells up from shown: put away with its view it is up and not shown, so what keeps it in step with the table still runs and its button, its key and its place do not act on it',
        up.open && up.shown && put.open && !put.shown && !shut.open && !shut.shown && up.awayNull === false && put.awayC === true && bare.open && bare.shown && bare.awayC === false, J([up, put, shut, bare]));
    check('the roller is placed against Table Chat only when the chat shows; with the chat closed, or put away where it has no place on screen to measure, the roller takes its own corner',
        J(up.at) === J(['20px', '246px']) && J(put.at) === J(['20px', '90px']) && J(noChat.at) === J(['20px', '90px']) && J(bare.at) === J(['20px', '246px']), J([up.at, put.at, noChat.at, bare.at]));
    check('the roller\'s wiring goes by what shows: its button opens a roller that is put away rather than closing it unseen, the Esc key and a resize leave it alone, and back on screen it is placed again; opening it brings up a chat that is closed or put away, and says it was asked for here',
        count(dice, "b.addEventListener('click', function() { if (panelShown()) closePanel(); else openPanel(); });") === 1
        && count(dice, "document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && panelShown()) closePanel(); }, true);") === 1
        && count(dice, "window.addEventListener('resize', function() { if (panelShown()) placePanel(); });") === 1
        && count(dice, "p.addEventListener('wpfloatback', function() { if (panelShown()) placePanel(); });") === 1
        && count(dice, "if (c && c.style.display === 'none') closePanel(); else if (panelShown()) placePanel(); }, 0); });") === 1
        && count(dice, "var c = ui('chatPanel'); if (c && (c.style.display === 'none' || awayNow(c))) { var cb = ui('chatBtn'); if (cb) cb.click(); }") === 1
        && count(dice, "p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p);") === 1 && !/if \(panelOpen\(\)\) (closePanel|placePanel)\(\)|&& panelOpen\(\)\) closePanel\(\)/.test(dice));
}

/* ---------- the sheet, the HUD, Music, the page panel, the tour ---------- */
{
    const sh = read('scripts/sheets.js'), mu = read('scripts/music.js'), dp = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'utf8'), tu = read('scripts/tutorial.js');
    const openSheet = fnK(sh, 'function openSheet(charId) {', '\n}\n'), openHud = fnK(sh, 'function openHud(charId, opts) {', '\n}\n');
    check('a sheet and a HUD that are opened say they were asked for here, so one opened from a list on the data map shows there; the HUD asks through typeof, as its slice needs',
        /\n    p\.style\.display = 'flex'; if \(window\.wpFloats\) window\.wpFloats\.reveal\(p\);[^\n]*\n    placeSheet\(\); raisePanel\(p\); renderSheet\(\);\n\}\n$/.test(openSheet)
        && /\n    if \(typeof window !== 'undefined' && window\.wpFloats\) window\.wpFloats\.reveal\(v\.panel\);[^\n]*\n    raisePanel\(v\.panel\); renderHud\(charId\);\n/.test(openHud) && count(sh, 'wpFloats.reveal(') === 2);
    check('the Music panel is asked for from any view by the pill in the header: opening it says so, and the toolbar\'s Music button opens a panel that is put away rather than closing it unseen',
        count(mu, "var p = ui('musicPanel'); if (!p) return; p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p); try {") === 1
        && count(mu, "b.addEventListener('click', function() { if (panelOpen() && !(window.wpFloats && window.wpFloats.away(ui('musicPanel')))) closePanel(); else openPanel(); });") === 1 && /open\.addEventListener\('click', function\(\) \{ closePill\(\); openPanel\(\); \}\);/.test(mu));
    // the page panel: its opener, and its Esc key run for real
    const escSrc = fnK(dp, "    document.addEventListener('keydown', function(e) {\n        if (e.key !== 'Escape' || !openId", '\n    });\n');
    const esc = o => { const R = { closed: 0 }, panel = { id: 'docPanel' }, body = {}; let H = null;
        const doc = { body: body, activeElement: o.focus === 'body' ? body : o.focus === 'none' ? null : o.focus === 'in' ? { id: 'x', closest: s => s === '#docPanel' ? panel : null } : o.focus === 'find' ? { id: 'docPanelSearchInput', closest: () => panel } : { id: 'other', closest: () => null }, addEventListener: (t, f) => { H = f; } };
        new Function('document', 'window', 'ui', 'openId', 'close', escSrc)(doc, { wpFloats: o.floats === false ? undefined : { away: p => p === panel && !!o.away } }, id => id === 'docPanel' ? panel : null, o.openId === undefined ? 'doc_1' : o.openId, () => { R.closed++; });
        H({ key: o.key || 'Escape' }); return R.closed; };
    const escs = [esc({ focus: 'body', away: true }), esc({ focus: 'none', away: true }), esc({ focus: 'body' }), esc({ focus: 'none' }), esc({ focus: 'in' }), esc({ focus: 'other' }), esc({ focus: 'find' }), esc({ focus: 'body', openId: '' }), esc({ focus: 'body', key: 'Enter' }), esc({ focus: 'body', away: true, floats: false })];
    check('the Esc key never closes a page panel that is put away: on a planner with the focus nowhere it stays open and comes back as it was left; one that shows closes as before, and never from a field elsewhere or its own Find box',
        J(escs) === J([0, 0, 1, 1, 1, 0, 0, 0, 0, 1]) && count(dp, "    p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p); place();") === 1 && count(dp, 'wpFloats') === 4 && !dp.includes('\r') && count(dp, '\0') === 3, J(escs));
    const step = fnK(tu, "{ target: '#diceBtn', title: 'Dice',", '} },');
    check('the tour\'s Dice step opens Table Chat through the chat\'s own opener, so a chat that is put away with another view comes up for the step',
        /before: function\(\) \{ if \(window\.wpChat && window\.wpChat\.openPanel\) window\.wpChat\.openPanel\(\); \} \},$/.test(step) && !/chatBtn/.test(step), step.slice(-140));
}

/* ---------- said ---------- */
{
    const wn = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')].map(t => t.replace(/\r\n/g, '\n'));
    const NOTE = "- Floating boxes stay with the play map. A sheet, a HUD, the page\n  panel, Table Chat, the table notepad and the Sound, Music, Video and\n  Visual effects panels are put away while you look at a planner, a\n  handbook page or the data map. Nothing is closed, and back on the\n  play map they are as you left them. A box you ask for on another\n  view shows there too. A window of its own always stays.\n"
        + "- On a planner, a handbook page or the data map, someone else's roll\n  no longer opens Table Chat over what you read. You get a notice, and\n  a count on the chat button. Your own roll opens the chat where you\n  are for a few seconds.\n";
    const start = ix.slice(ix.indexOf('<div class="help-pane" data-pane="start">'), ix.indexOf('<div class="help-pane" data-pane="tutorial"'));
    check('Help says it, in Getting Started under Getting around fast: floating boxes stay with the play map, are put away elsewhere with nothing closed and come back as left; which boxes; a box asked for on another view; who raises Table Chat; a window of its own stays',
        start.includes('<li><b>Floating boxes</b> stay with the play map. On the data map, a planner or a handbook page they are put away. Nothing is closed: music plays on and a sheet keeps its place. Back on the play map they are as you left them.\n')
        && start.includes('<li>The boxes are a character sheet, a HUD, the page panel, Table Chat with its dice roller and the table notepad. The Sound, Music, Visual effects and Video panels are boxes too.</li>')
        && start.includes('<li>A box you ask for on another view shows there too, until you close it. Open a sheet from the <b>Characters</b> tab on the data map and it shows there and on the play map.</li>')
        && start.includes('<li>Someone else&rsquo;s roll opens Table Chat by itself only on the play map. On another view you get a notice, and a count on the chat button. Your own roll opens the chat where you are for a few seconds.</li>')
        && start.includes('<li>A window of its own always stays where you put it: a sheet, a page or the chat you popped out, and the stream window.</li>') && count(ix, '<b>Floating boxes</b>') === 1);
    check('both release notes carry the two lines, alike, and the suite is one of those CI runs',
        wn.every(t => count(t, NOTE) === 1) && fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').replace(/\r\n/g, '\n').includes('        if: ${{ !cancelled() }}\n        run: node tools/floatcheck.js\n'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
