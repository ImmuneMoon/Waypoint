/* Offline check of the floating boxes and the views they show on (system/app/scripts/floats.js, 1.5.4).
   The owner, 2026-10-05: boxes from the play map never show over a planner, a handbook page or the data map; they come back as they
   were left; only a window of its own stays. The module's core and its watcher are sliced by their markers and run for real on a page
   of plain objects, and so is every place another module asks it: Table Chat (net.js), the dice roller (dice.js), the table notepad,
   the page panel's Esc key (docpanel.js). Escape's router (esckey.js), which closes the one thing on top, is sliced and run for real on
   a page of plain objects too, with the listeners that ask it. The rest of the wiring is pinned by its text. No browser.
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
        + '\nreturn { view: floatView, now: floatNow, up: floatUp, away: floatAway, shown: floatShown, note: floatNote, sync: floatSync, reveal: floatReveal, leave: floatLeave, watch: watch, boxes: floatBoxes, use: floatUse, last: floatLast, within: floatIn, IDS: FLOAT_IDS, WITH: FLOAT_WITH, AWAY: FLOAT_AWAY, BACK: FLOAT_BACK, LAYER: FLOAT_LAYER };')(
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
    check('the module publishes its nine calls and starts its two watchers (boxes, the one list of the floating boxes, which a press on one is told by: backlog 143, whiteboard.js barPress; spot, the clear place for a box a module places itself; last, the box last used, which Escape asks: esckey.js); it imports only the app\'s state and the two readers of the open item, and nothing in it writes a box\'s own display',
        /\nwindow\.wpFloats = \{ sync: floatSync, reveal: floatReveal, leave: floatLeave, away: floatAway, shown: floatShown, view: floatNow, boxes: floatBoxes, spot: spotFind, last: floatLast \};\nwatch\(\);\nspotWatch\(\);\n$/.test(fl)
        && J((fl.match(/^import [^\n]*$/gm) || [])) === J(["import { state } from './state.js';", "import { getActiveMap, isDocLike } from './models.js';"]) && !/\.style\.display\s*=[^=]/.test(fl) && !/innerHTML|eval\(|new Function/.test(fl), J(fl.match(/^import [^\n]*$/gm)));
}

/* ---------- the box last used (Escape asks it: esckey.js) ---------- */
// The owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)": Table Chat, the notepad, Sound and Music close on Escape when one of
// them is the window last used. The core's floatUse, floatLast and floatIn, and the watcher's two listeners, run for real
{
    const W = world(), a = W.api; W.go('play');
    const none = a.last();
    const chat = W.up('chatPanel'), sheet = W.up('sheetPanel'); const l1 = a.last();
    a.reveal(chat); const l2 = a.last();
    W.down('chatPanel'); const l3 = a.last();
    W.up('chatPanel'); const l4 = a.last();
    W.go('data'); const l5 = a.last();   // both put away with the play map: neither shows
    W.go('play'); const h = W.hud(); const l6 = a.last();
    W.layer.children.splice(W.layer.children.indexOf(h), 1); const l7 = a.last();
    a.use(sheet); const l8 = a.last(); a.use(null); a.use('sheetPanel'); const l9 = a.last();
    const inner = { id: 'x' }; chat.kids.push(inner);
    const within = [a.within(inner) === chat, a.within(chat) === chat, a.within({ id: 'y' }), a.within(null)];
    check('the box last used (floats.js last, run for real): of the boxes that show, the one that came up, was asked for, pressed or given the focus last; a box that goes down or is put away with its view is passed over, and comes back as the last used when it comes up again; a HUD alike; nothing is no box; nobody used yet is none',
        none === null && l1 === sheet && l2 === chat && l3 === sheet && l4 === chat && l5 === null && l6 === h && l7 === chat && l8 === sheet && l9 === sheet && J(within) === J([true, true, null, null]),
        J([none, l1, l2, l3, l4, l5, l6, l7, l8, l9].map(e => (e ? e.id || 'hud' : null)).concat([within])));
    // the watcher's listeners: a press or a focus in a box makes it the last used, at the document in the capture phase
    const V = world(); V.go('play'); const on = {}; V.doc.addEventListener = (t, f, cap) => { (on[t] = on[t] || []).push([f, cap]); };
    MO.last = null; V.api.watch();
    const s2 = V.up('sheetPanel'), c2 = V.up('chatPanel'), btn = { id: 'b' }; s2.kids.push(btn);
    const fire = (t, tgt) => (on[t] || []).forEach(([f]) => f({ target: tgt }));
    const w0 = V.api.last(); fire('pointerdown', btn); const w1 = V.api.last(); fire('focusin', c2); const w2 = V.api.last(); fire('pointerdown', { id: 'map' }); const w3 = V.api.last(); fire('focusin', null); const w4 = V.api.last();
    check('a press or a focus in a box makes it the box last used: the watcher listens for both on the document in the capture phase, before a box\'s own controls; a press elsewhere (the map) leaves the box last used as it was',
        J(Object.keys(on).sort()) === J(['focusin', 'pointerdown']) && on.pointerdown.length === 1 && on.focusin.length === 1 && on.pointerdown[0][1] === true && on.focusin[0][1] === true
        && w0 === c2 && w1 === s2 && w2 === c2 && w3 === c2 && w4 === c2, J([Object.keys(on), [w0, w1, w2, w3, w4].map(e => e && e.id)]));
}

/* ---------- the boxes, as a press is told by them (backlog 143) ---------- */
{
    const W = world(), a = W.api, h1 = W.hud(), h2 = W.hud(); delete W.els.videoPanel;
    const got = a.boxes(), want = a.IDS.filter(id => id !== 'videoPanel').map(id => W.els[id]).concat([h1, h2]);
    W.go('data'); const away = a.boxes();
    check('the floating boxes as one list (boxes, published for the map\'s tool bars: a press in one puts an open menu of the tools back under it): every box the module names that the page holds, in its order, then each HUD of the layer, whether it is up, down or put away',
        got.length === want.length && got.every((e, i) => e === want[i]) && away.length === want.length && away.every((e, i) => e === want[i]), J([got.length, want.length]));
}

/* ---------- where a box opens (the owner, 2026-10-17, by prompt: "open clear, and im moved past a toolbar, the toolbar stays on top") ---------- */
// The sweep of 2026-10-17 found it live at 1366 by 850, hosting the Tutorial with a fight on The Inn: a HUD opened over the turn strip, a
// sheet over the toolbar's right end and the View, Grid and Snap column, Table Chat over that column, a player's reader over the rail, the
// toolbar's left half and the strip. The rectangles below are the ones measured there
const spotSrc = sliceOf(fl, 'floatcheck', 'spot'), spotPageSrc = sliceOf(fl, 'floatcheck', 'spotpage');
const SP = new Function(spotSrc + '\nreturn { spotFor: spotFor, KEEP: SPOT_KEEP, GAP: SPOT_GAP, MIN: SPOT_MIN };')();
const RC = (l, t, r, b) => ({ l, t, r, b }), WANT = (l, t, w, h) => ({ l, t, w, h });
const AREA = RC(0, 41, 1366, 850), BAR = RC(247, 768, 1149, 820), EDGE = RC(1275, 624, 1335, 754), STRIP = RC(440, 103, 955, 137), RAIL = RC(0, 41, 34, 850), LIVE = [BAR, EDGE, STRIP, RAIL];
{
    const live = [SP.spotFor(WANT(888, 120, 460, 697), LIVE, AREA, false), SP.spotFor(WANT(448, 70, 470, 710), LIVE, AREA, true), SP.spotFor(WANT(1026, 410, 320, 420), LIVE, AREA, true),
        SP.spotFor(WANT(1028, 140, 320, 229), LIVE, AREA, false), SP.spotFor(WANT(448, 70, 470, 710), [BAR, EDGE, RAIL], AREA, true), SP.spotFor(WANT(888, 120, 460, 697), [], AREA, false)];
    check('where a box opens, on the rectangles measured live (spotFor, run for real): the sheet moves left of the View, Grid and Snap column and under the turn strip, ending above the toolbar; a HUD opened in the middle goes under the strip and ends above the toolbar; Table Chat, which stands on its bottom edge, moves up and left until it is clear of both; the notepad, clear where it is, stays; a HUD with no fight going rises to clear the toolbar whole; with nothing to keep clear a box stays where its style sheet puts it',
        J(live) === J([{ l: 807, t: 145, h: 615 }, { l: 448, t: 145, h: 615 }, { l: 947, t: 340, h: 420 }, { l: 1028, t: 140, h: 229 }, { l: 448, t: 50, h: 710 }, { l: 888, t: 120, h: 697 }]), J(live));
    check('the rule\'s own numbers: what is kept clear (the map\'s toolbar, the column at its edge, the data map\'s toolbar, the turn strip, the party strip and the left rail), a gap of 8 pixels, and no box made shorter than 200 pixels to fit',
        J(SP.KEEP) === J(['wbFloatingToolbar', 'wbEdgeTools', 'dataFloatingToolbar', 'combatStrip', 'partyStrip', 'leftRail']) && SP.GAP === 8 && SP.MIN === 200);
    // seeded layouts: every answer is clear of every rectangle by the gap, inside the area, no taller than the box and no shorter than the
    // least, never higher than its default where it may not move up; and a default place that is clear and whole is kept exactly
    let seed = 20261017; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, ri = n => Math.floor(rnd() * n);
    const G = SP.GAP, bad = [], seen = { kept: 0, moved: 0, none: 0, shorter: 0 };
    for (let i = 0; i < 6000; i++) {
        const Wd = 500 + ri(1500), Ht = 400 + ri(900), area = RC(0, ri(60), Wd, Ht), keep = [];
        for (let k = ri(6); k > 0; k--) { const l = ri(Wd), t = ri(Ht); keep.push(RC(l, t, l + 10 + ri(600), t + 10 + ri(300))); }
        const w = 80 + ri(600), h = 80 + ri(900), want = WANT(ri(Math.max(1, Wd - w)), area.t + ri(400), w, h), up = rnd() < 0.5;
        const p = SP.spotFor(want, keep, area, up), hh = Math.min(h, area.b - area.t - 2 * G), top = up ? area.t + G : Math.max(area.t, want.t), wide = w > area.r - area.l - 2 * G;
        const clear = (x, y, hgt) => !keep.some(k => k.l - G < x + w && x < k.r + G && k.t - G < y + hgt && y < k.b + G);
        const whole = clear(want.l, want.t, hh) && want.l >= area.l + G && want.l + w <= area.r - G && want.t >= top && want.t + hh <= area.b - G;
        if (!p) { seen.none++; if (whole) bad.push('lost ' + i); continue; }
        if (!clear(p.l, p.t, p.h) || p.h > hh || p.h < Math.min(hh, SP.MIN) || p.t < top || p.t + p.h > area.b - G || (!wide && (p.l < area.l + G || p.l + w > area.r - G)) || [p.l, p.t, p.h].some(v => !Number.isInteger(v))) bad.push('bad ' + i);
        if (whole) { seen.kept++; if (p.l !== want.l || p.t !== want.t || p.h !== hh) bad.push('moved ' + i); } else seen.moved++;
        if (p.h < hh) seen.shorter++;
    }
    check('6,000 seeded layouts (spotFor): every place found is clear of every rectangle by the gap, inside the area, never taller than the box nor shorter than the least it is made, never higher than its default where it may not move up, in whole pixels; a default place that is clear and whole is kept exactly, and is always found',
        bad.length === 0 && seen.kept > 300 && seen.moved > 1500 && seen.none > 50 && seen.shorter > 300, J([bad.slice(0, 8), seen]));
    const plain = SP.spotFor(WANT(600, 300, 100, 100), [], AREA);
    const junk = [SP.spotFor(null, LIVE, AREA), SP.spotFor(WANT(NaN, 1, 1, 1), LIVE, AREA), SP.spotFor(WANT(1, 1, 0, 5), LIVE, AREA), SP.spotFor(WANT(1, 1, 5, -5), LIVE, AREA), SP.spotFor(WANT('10', 100, 50, 50), LIVE, AREA),
        SP.spotFor(WANT(10, 100, 50, 50), LIVE, null), SP.spotFor(WANT(10, 100, 50, 50), LIVE, RC(0, 0, 'x', 9)), SP.spotFor(WANT(600, 300, 100, 100), [RC(-100, -100, 5000, 5000)], AREA)];
    const odd = [SP.spotFor(WANT(600, 300, 100, 100), 'no list', AREA), SP.spotFor(WANT(600, 300, 100, 100), [null, 'x', 7, RC(NaN, 0, 5, 5), RC(650, 350, 650, 360), RC(650, 350, 640, 360), RC(650, 360, 660, 350), { l: '1', t: 1, r: 9, b: 9 }], AREA)];   // the rectangles with no size stand inside the box
    check('what is no box, no area or no clear place gives no place (spotFor): a box with no size, a number that is none or a text, an area that is none, a rectangle over everything; a list of rectangles that is none, and a rectangle that is none, has no size or no numbers, is passed over',
        junk.every(v => v === null) && J(plain) === J({ l: 600, t: 300, h: 100 }) && odd.every(v => J(v) === J(plain)), J([junk, odd]));
}
// The page: boxes laid out by a style sheet of plain numbers, the rectangles to keep clear, a recording observer, a frame on demand
function spotPage() {
    const P = { VW: 1366, VH: 850, keep: { wbFloatingToolbar: BAR, wbEdgeTools: EDGE, combatStrip: STRIP, leftRail: RAIL }, frames: [], mos: [], resize: [], header: 41 };
    const px = v => (v === '' || v === undefined ? null : parseFloat(v));
    const box = (id, css, content, inline) => {
        const cls = new Set(), el = { id, nodeType: 1, on: {}, ev: [], rects: 0, css, content };
        el.style = Object.assign({ display: 'none', left: '', top: '', right: '', bottom: '', maxHeight: '', width: '', height: '' }, inline || {});
        el.classList = { add: c => { cls.add(c); }, remove: c => { cls.delete(c); }, contains: c => cls.has(c) };
        el.addEventListener = (t, f) => { (el.on[t] = el.on[t] || []).push(f); };
        el.dispatchEvent = e => { el.ev.push(e.type); (el.on[e.type] || []).forEach(f => f(e)); return true; };
        el.maxH = () => { const m = px(el.style.maxHeight); return m !== null ? m : css.maxH || Infinity; };
        el.getBoundingClientRect = () => {
            el.rects++; if (el.style.display === 'none') return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
            const s = el.style, w = px(s.width) !== null ? px(s.width) : css.width, h = Math.min(px(s.height) !== null ? px(s.height) : el.content, el.maxH());
            const l = px(s.left) !== null ? px(s.left) : P.VW - (px(s.right) !== null ? px(s.right) : css.right) - w;
            const t = px(s.top) !== null ? px(s.top) : (px(s.bottom) !== null ? P.VH - px(s.bottom) - h : css.top);
            return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h };
        };
        return el;
    };
    P.box = { sheetPanel: box('sheetPanel', { right: 18, top: 120, width: 460, maxH: 697 }, 800), docPanel: box('docPanel', { right: 18, top: 120, width: 440, maxH: 731 }, 595),
        soundPanel: box('soundPanel', { right: 18, top: 200, width: 380 }, 300), musicPanel: box('musicPanel', { right: 18, top: 200, width: 340, maxH: 680 }, 300), videoPanel: box('videoPanel', { right: 18, top: 120, width: 460, maxH: 842 }, 300),
        fxPanel: box('fxPanel', { right: 18, top: 120, width: 300 }, 400), notepadPanel: box('notepadPanel', { right: 18, top: 140, width: 320 }, 229),
        chatPanel: box('chatPanel', { width: 320 }, 258, { right: '20px', bottom: '20px', maxHeight: '420px' }), dicePanel: box('dicePanel', { width: 320 }, 300) };
    const keepEl = id => ({ hidden: false, getBoundingClientRect: () => { const r = P.keep[id]; return r ? { left: r.l, top: r.t, right: r.r, bottom: r.b, width: r.r - r.l, height: r.b - r.t } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; } });
    const doc = { getElementById: id => P.box[id] || (SP.KEEP.indexOf(id) >= 0 ? keepEl(id) : null), querySelector: s => (s === 'header' ? { getBoundingClientRect: () => ({ left: 0, top: 0, right: P.VW, bottom: P.header, width: P.VW, height: P.header }) } : null) };
    const win = { get innerWidth() { return P.VW; }, get innerHeight() { return P.VH; }, addEventListener: (t, f) => { if (t === 'resize') P.resize.push(f); } };
    function MOb(cb) { this.cb = cb; this.seen = []; P.mos.push(this); } MOb.prototype.observe = function(t, o) { this.seen.push([t, o]); };
    class CE { constructor(t) { this.type = t; } }
    P.api = new Function('window', 'document', 'state', 'getActiveMap', 'isDocLike', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', coreSrc + '\n' + spotSrc + '\n' + spotPageSrc
        + '\nreturn { spotWatch: spotWatch, spotPlace: spotPlace, spotFind: spotFind, BACK: FLOAT_BACK, MOVED: SPOT_MOVED };')(
        win, doc, { viewMode: 'visual' }, () => ({ type: 'map' }), () => false, CE, MOb, el => ({ maxHeight: el.maxH && isFinite(el.maxH()) ? el.maxH() + 'px' : 'none' }), f => { P.frames.push(f); });
    P.api.spotWatch(); P.mo = P.mos[P.mos.length - 1];
    P.tell = el => P.mo.cb([{ type: 'attributes', target: el }]);   // the page's observer told of a box's style, as a browser tells it
    P.open = (id, also) => { const el = P.box[id]; el.style.display = 'flex'; if (also) also(el); P.tell(el); return el; };
    P.shut = id => { const el = P.box[id]; el.style.display = 'none'; P.tell(el); return el; };
    P.at = el => ['left', 'top', 'right', 'bottom', 'maxHeight', 'width', 'height'].map(k => el.style[k]).join('|');
    return P;
}
{
    const P = spotPage(), B = P.box;
    const watched = P.mo.seen.map(([t, o]) => t.id + ':' + J(o)), want = ['sheetPanel', 'docPanel', 'soundPanel', 'musicPanel', 'videoPanel', 'fxPanel', 'notepadPanel', 'chatPanel'].map(id => id + ':' + J({ attributes: true, attributeFilter: ['style'] }));
    const backs = Object.keys(B).filter(id => (B[id].on[P.api.BACK] || []).length === 1);
    check('the boxes watched for where they open: the inline style of each box but the dice roller, which is placed against Table Chat by its own module; each listens for being back on screen; the window\'s size is listened for once',
        J(watched) === J(want) && J(backs) === J(want.map(s => s.split(':')[0])) && P.resize.length === 1, J([watched, backs, P.resize.length]));
    // the sheet comes up at its default place: put clear, its height held to the room, the move told
    const sh = P.open('sheetPanel'); const s1 = P.at(sh), e1 = J(sh.ev);
    P.shut('sheetPanel'); P.open('sheetPanel'); const s2 = P.at(sh);   // closed and opened again: put clear again, the same
    P.keep.combatStrip = null; P.shut('sheetPanel'); P.open('sheetPanel'); const s2b = P.at(sh); P.keep.combatStrip = STRIP; P.shut('sheetPanel'); P.open('sheetPanel');   // the fight over: back up to its own top, worked out from its default and not from where it was put
    // dragged: the module writes its left and top. It is the user's from then on, and loses the height it was held to
    sh.style.left = '300px'; sh.style.top = '200px'; sh.style.right = 'auto'; P.tell(sh); const s3 = P.at(sh); const n0 = sh.rects;
    for (let i = 0; i < 50; i++) { sh.style.left = (300 + i) + 'px'; P.tell(sh); } const dragged = sh.rects - n0;
    P.shut('sheetPanel'); P.open('sheetPanel'); const s4 = P.at(sh);
    check('a sheet that comes up at its default place is put clear (spotPlace, run for real on a page of plain objects): left of the column and under the strip, standing by its right edge, held to the room above the toolbar, and the move told; closed and opened again it is put clear again; dragged, it is the user\'s: it keeps the place dragged to, loses the height it was held to, and nothing is measured while it is dragged about',
        s1 === '|145px|99px||615px||' && e1 === J(['wpfloatmoved']) && s2 === s1 && s2b === '|120px|99px||640px||' && s3 === '300px|200px|auto||||' && dragged === 0 && s4 === '349px|200px|auto||||', J([s1, e1, s2, s2b, s3, dragged, s4]));
    // a place the module keeps (a stored place, set as it opens), a size the user gave, a box put away as it comes up
    const np = P.open('notepadPanel', el => { el.style.left = '40px'; el.style.top = '300px'; el.style.right = 'auto'; }), n1 = P.at(np);
    const vd = P.open('videoPanel', el => { el.style.width = '460px'; el.style.height = '500px'; }), v1 = P.at(vd);
    const fx = P.box.fxPanel; fx.classList.add('wp-away'); P.open('fxPanel'); const f1 = P.at(fx); fx.classList.remove('wp-away'); fx.dispatchEvent({ type: P.api.BACK }); const f2 = P.at(fx);
    const ch = P.open('chatPanel'), c1 = P.at(ch);
    check('a box a module placed as it opened keeps that place; a box the user sized is put clear and never held to a height; one that comes up put away on this view is put clear when it is back on screen; Table Chat, which stands on its bottom edge, keeps standing on it, put up and left until the toolbar and the column are clear',
        n1 === '40px|300px|auto||||' && v1 === '|145px|99px|||460px|500px' && f1 === '||||||' && f2 === '|120px|18px||||' && c1 === '||99px|90px|420px||' && J(ch.ev) === J(['wpfloatmoved']), J([n1, v1, f1, f2, c1]));
    // the window changes size: every box this put clear is put clear again, once a frame; one the user moved is not
    // (narrower, the toolbar wraps into more rows and the column stands higher, as the style sheet has it)
    P.VW = 1200; P.keep.wbFloatingToolbar = RC(164, 700, 1066, 820); P.keep.wbEdgeTools = RC(1109, 556, 1169, 686); P.keep.combatStrip = RC(357, 103, 872, 137);
    P.resize[0](); P.resize[0](); const queued = P.frames.length; P.frames.splice(0).forEach(f => f());
    const r1 = [P.at(ch), P.at(vd), P.at(fx), P.at(sh), P.at(np)];
    check('the window changes size: once a frame, every box this put clear is put clear again for the new window (Table Chat above a toolbar that now wraps, the video, Effects), and a box the user moved or the module placed is left as it is',
        queued === 1 && J(r1) === J(['||99px|158px|420px||', '|145px|99px|||460px|500px', '|120px|18px||||', '349px|200px|auto||||', '40px|300px|auto||||']), J([queued, r1]));
    // a page where nothing can be measured: nothing written
    const Q = spotPage(), qs = Q.box.soundPanel; qs.getBoundingClientRect = undefined; Q.open('soundPanel');
    const R2 = spotPage(); R2.keep = {}; const m2 = R2.open('musicPanel');
    check('a box that cannot be measured is left where its style sheet puts it; with nothing to keep clear a box is put where it stands, held only to the window\'s foot (Music, whose style sheet lets it reach 80% of the window from 200 pixels down, ran 30 pixels off the window at 850 high)',
        Q.at(qs) === '||||||' && J(qs.ev) === '[]' && R2.at(m2) === '|200px|18px||642px||', J([Q.at(qs), R2.at(m2)]));
}
/* ---------- the HUD's place (sheets.js placeHud) and a player's reader (handbook.js readerPlace) ---------- */
{
    const sheetsSrc = read('scripts/sheets.js'), hudSrc = fnK(sheetsSrc, 'function placeHud(v) {', '\n}\n');
    const run = o => { const asked = [], sized = [], huds = o.huds || {};
        const win = { innerWidth: 1366, innerHeight: 850 }; if (o.floats !== false) win.wpFloats = { spot: (w, up) => { asked.push([w, up]); return SP.spotFor(w, o.keep || LIVE, AREA, up); } };
        const panel = { offsetWidth: 470, offsetHeight: 710, style: {} }, v = { panel };
        new Function('window', 'hudPref', 'huds', 'sizePanel', hudSrc + '\nreturn placeHud;')(win, () => o.pref || {}, huds, (p, w, h) => { sized.push([w, h]); })(v);
        return [panel.style.left, panel.style.top, panel.style.height || '', J(asked), J(sized)]; };
    const first = run({}), kept = run({ pref: { x: 100, y: 200 } }), two = run({ huds: { a: { panel: { getBoundingClientRect: () => ({ left: 448, top: 145 }) } } } }), none = run({ floats: false }), calm = run({ keep: [BAR, EDGE, RAIL] }), size = run({ pref: { w: 500, h: 600 } });
    const W0 = J([[{ l: 448, t: 70, w: 470, h: 710 }, true]]);
    check('a HUD opens in the middle moved clear (placeHud, run for real): under the turn strip and above the toolbar, made as short as the room there; one left somewhere opens there and asks nothing; a second steps down and right off the first and keeps its foot where the room ends; with no module to ask it opens in the middle as before; with no fight it rises to clear the toolbar whole; a size the user gave is the size handed on',
        J(first) === J(['448px', '145px', '615px', W0, '[]']) && J(kept) === J(['100px', '200px', '', '[]', '[]']) && J(two) === J(['472px', '169px', '591px', W0, '[]']) && J(none) === J(['448px', '70px', '', '[]', '[]'])
        && J(calm) === J(['448px', '50px', '', W0, '[]']) && J(size) === J(['433px', '145px', '', J([[{ l: 433, t: 125, w: 500, h: 600 }, true]]), J([[500, 600]])]), J([first, kept, two, none, calm, size]));
    // the reader: a player's page, as the style sheet lays it out (top under the row, or the hidden row's rule; left 0; bottom 0; 760 wide)
    const hb = read('scripts/handbook.js'), rdSrc = sliceOf(hb, 'floatcheck', 'reader');
    const reader = o => { const st = { top: '', left: '', bottom: '', imp: {} }, mos = [], resize = [];
        const style = { get top() { return st.top; }, set top(v) { st.top = v; delete st.imp.top; }, get left() { return st.left; }, set left(v) { st.left = v; }, get bottom() { return st.bottom; }, set bottom(v) { st.bottom = v; },
            setProperty(k, v, p) { st[k] = v; if (p === 'important') st.imp[k] = true; }, removeProperty(k) { st[k] = ''; delete st.imp[k]; } };
        const m = { style, getBoundingClientRect: () => { const t = st.imp.top || !o.hiddenRow ? (parseFloat(st.top) || 0) : 48, b = parseFloat(st.bottom) || 0, l = parseFloat(st.left) || 0; return { left: l, top: t, right: l + 760, bottom: 850 - b, width: 760, height: 850 - b - t }; } };
        const ml = o.mainLeft || 34, els = { docReaderModal: m, main: { getBoundingClientRect: () => ({ left: ml, top: 41, right: 1361, bottom: 850, width: 1361 - ml, height: 809 }) }, combatStrip: { id: 'combatStrip' } };
        const win = { innerWidth: 1366, innerHeight: 850, addEventListener: (t, f) => { if (t === 'resize') resize.push(f); } }; if (o.floats !== false) win.wpFloats = { spot: (w, up) => SP.spotFor(w, o.keep || LIVE, o.area || AREA, up) };
        function MOr(cb) { this.cb = cb; this.seen = []; mos.push(this); } MOr.prototype.observe = function(t, op) { this.seen.push([t.id || t.tag, op]); };
        const doc = { body: { tag: 'body' }, querySelector: s => (s === 'header' ? { getBoundingClientRect: () => ({ bottom: o.hiddenRow ? 48 : 41 }) } : null) };
        const api = new Function('window', 'document', 'ui', 'isOpen', 'MutationObserver', rdSrc + '\nreturn { place: readerPlace, watch: readerWatch };')(win, doc, id => els[id] || null, () => o.open !== false, MOr);
        const out = () => [st.left, st.top + (st.imp.top ? '!' : ''), st.bottom];
        return { api, m, st, out, mos, resize, o }; };
    const A = reader({}); A.api.place(A.m); const a1 = A.out(); A.o.keep = [BAR, EDGE, RAIL]; A.api.place(A.m); const a2 = A.out();   // the strip goes: the reader rises back under the row
    const H = reader({ hiddenRow: true, keep: [BAR, EDGE, RC(440, 90, 955, 124), RAIL], area: RC(0, 48, 1366, 850) }); H.api.place(H.m); const h1 = H.out(); H.o.keep = [BAR, EDGE, RAIL]; H.api.place(H.m); const h2 = H.out();
    const N = reader({ floats: false }); N.st.left = '9px'; N.st.bottom = '9px'; N.api.place(N.m); const n1 = N.out();
    const D = reader({ mainLeft: 245, keep: [BAR, EDGE, STRIP] }); D.api.place(D.m); const d1 = D.out();   // a player whose left panel is docked: the map begins past it, and there is no rail
    check('a player\'s reader opens clear (readerPlace, run for real): from the map\'s own left edge past the rail, ending above the toolbar, and under the turn strip while a fight shows it, its top then held over the style sheet\'s; once the strip is gone it stands under the top row again; with the row hidden the style sheet\'s top is kept unless the strip needs it lower; beside a docked left panel it begins where the map does; with no module to ask it stands as the style sheet has it',
        J(a1) === J(['42px', '145px!', '90px']) && J(a2) === J(['42px', '41px', '90px']) && J(h1) === J(['42px', '132px!', '90px']) && J(h2) === J(['42px', '48px', '90px']) && J(d1) === J(['245px', '145px!', '90px']) && J(n1) === J(['', '41px', '']), J([a1, a2, h1, h2, d1, n1]));
    const Wt = reader({}); Wt.api.watch(); const seen = Wt.mos.map(mo => J(mo.seen)); let placed = 0; Wt.api.place = null;
    const Wc = reader({ open: false }); Wc.api.watch(); Wc.st.left = 'x'; Wc.mos[0].cb([]); Wc.resize[0]();
    const Wo = reader({}); Wo.api.watch(); Wo.mos[0].cb([]); const wo1 = Wo.out(); Wo.st.left = ''; Wo.resize[0](); const wo2 = Wo.out();
    check('the reader is placed again while it is open, and only then: when the window changes size, and when the turn strip\'s style or the page\'s classes change (a fight that starts or ends, the row hidden or shown); it is placed as it opens, once it shows',
        J(seen) === J([J([['combatStrip', { attributes: true, attributeFilter: ['style'] }], ['body', { attributes: true, attributeFilter: ['class'] }]])]) && Wt.resize.length === 1 && Wc.st.left === 'x' && J(wo1) === J(['42px', '145px!', '90px']) && J(wo2) === J(wo1)
        && count(hb, "    m.style.display = 'flex';\n    if (typeof readerPlace === 'function') readerPlace(m);") === 1 && count(hb, '\nreaderWatch();\n') === 1 && hb.indexOf('// [floatcheck:reader-start]') > hb.indexOf('// [shelfcheck:readerland-end]'), J([seen, Wt.resize.length, Wc.st.left, wo1, wo2]));
    const dice = read('scripts/dice.js');
    check('the dice roller finds its place against Table Chat again when the chat is put clear, as it does when the chat comes back on screen',
        count(dice, "    var cp = ui('chatPanel'); if (cp) cp.addEventListener('wpfloatmoved', function() { if (panelShown()) placePanel(); });") === 1 && count(fl, "var SPOT_PARTS = ['left', 'top', 'right', 'bottom'], SPOT_MOVED = 'wpfloatmoved';") === 1);
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
    // Escape puts the pad away on this screen alone (the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)": "the notepad its
    // words"): net.js's padbox and padaway slices run for real on the page of plain objects (tools/boxdom.js), with no text box module, no
    // lookcore and no reader, so the pad shows its words read-only as it does without them
    const { makeDom } = require('./boxdom.js');
    const pbA = net.indexOf('// [netcheck:padbox-start]'), pbZ = net.indexOf('// [netcheck:padbox-end]'), awaySrc = sliceOf(net, 'floatcheck', 'padaway');
    const padW = role => {
        const dom = makeDom(), doc = dom.document, panel = doc.createElement('div'), el = doc.createElement('div'), els = { notepadPanel: panel, notepadText: el }, sent = [];
        panel.appendChild(el); doc.body.appendChild(panel);
        const n = { active: true, role, notepad: { on: true, text: 'Meet at noon.', gm: 'Gina' }, notepadInput: () => {} };
        const api = new Function('net', 'ui', 'window', 'document', 'getActiveCampaign', 'getProfile', 'broadcast', "'use strict';\n" + net.slice(pbA, pbZ) + awaySrc + '\nreturn { renderNotepad, padHid, padAway, padBack };')(
            n, id => els[id] || null, dom.window, doc, () => ({ id: 'c1', name: 'The Camp' }), () => ({ id: 'g1', name: 'Gina' }), m => sent.push(m));
        api.renderNotepad();
        return { n, panel, el, api, sent, at: () => [panel.style.display, el.textContent, api.padHid()] };
    };
    const pl = padW('client'), p0 = pl.at(), pAway = pl.api.padAway(), p1 = pl.at(), words = pl.n.notepad.text;
    pl.api.renderNotepad(); const p2 = pl.at();                                  // the host's word again with the same words (a look changed): it stays away
    pl.n.notepad.text = 'Meet at one.'; pl.api.renderNotepad(); const p3 = pl.at();   // new words: it shows again
    pl.api.padAway(); pl.n.notepad = { on: false, text: '' }; pl.api.renderNotepad(); const p4 = [pl.panel.style.display, pl.el.textContent];
    pl.n.notepad = { on: true, text: 'Meet at one.', gm: 'Gina' }; pl.api.renderNotepad(); const p5 = pl.at();   // put away by the GM, then a new pad with the very words: it shows
    pl.api.padAway(); pl.n.active = false; pl.api.renderNotepad(); pl.n.active = true; pl.api.renderNotepad(); const p6 = pl.at();   // a session that ended forgets it
    const gm = padW('host'), g1 = gm.api.padAway(), gA = gm.at(), g2 = gm.api.padBack(), gB = gm.at(), g3 = gm.api.padBack();
    const shut = padW('client'); shut.n.notepad.on = false; shut.api.renderNotepad(); const o1 = shut.api.padAway(), oA = shut.at();
    // the GM's Table Notepad button and the map's right-click row bring it back with its words and ask nothing (net.notepadToggle, run for real with padBack)
    const back = (hid) => { const R = { asked: 0, sent: 0, reveals: 0, backs: 0 }, panel = { id: 'notepadPanel' }, n = { role: 'host', notepad: { on: true, text: 'Meet at noon.' } };
        new Function('net', 'ui', 'window', 'showConfirm', 'broadcast', 'notepadMsg', 'renderNotepad', 'toast', 'logEvent', 'setTimeout', 'padBack', src + '\nnet.notepadToggle();')(
            n, id => id === 'notepadPanel' ? panel : null, { wpFloats: { away: () => false, reveal: () => { R.reveals++; } } }, () => { R.asked++; }, () => { R.sent++; }, () => ({}), () => {}, () => {}, () => {}, () => {}, () => { R.backs++; return hid; });
        return [n.notepad.on, n.notepad.text, R.asked, R.sent, R.reveals, R.backs]; };
    const nb = [back(true), back(false)];
    const wbN = read('scripts/whiteboard.js');
    check('Escape puts the table notepad away on this screen alone (net.js padAway, padHid and padBack, run for real with the real renderNotepad; the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)"): its words stay and nothing is sent; the host\'s word with the same words leaves it away, new words bring it back, and so do a pad put away and opened again and a session that ends; the GM\'s Table Notepad button and the map\'s right-click row bring it back with its words and ask nothing, and that row says Show while it is away; a pad that is not open is not put away; the router reaches it as net.notepadAway',
        J(p0) === J(['flex', 'Meet at noon.', false]) && pAway === true && J(p1) === J(['none', 'Meet at noon.', true]) && words === 'Meet at noon.' && J(p2) === J(['none', 'Meet at noon.', true]) && J(p3) === J(['flex', 'Meet at one.', false])
        && J(p4) === J(['none', 'Meet at one.']) && J(p5) === J(['flex', 'Meet at one.', false]) && J(p6) === J(['flex', 'Meet at one.', false])
        && g1 === true && J(gA) === J(['none', 'Meet at noon.', true]) && g2 === true && J(gB) === J(['flex', 'Meet at noon.', false]) && g3 === false && o1 === false && J(oA) === J(['none', 'Meet at noon.', false]) && pl.sent.length + gm.sent.length === 0
        && J(nb) === J([[true, 'Meet at noon.', 0, 0, 1, 1], [true, 'Meet at noon.', 1, 0, 0, 1]])
        && count(net, "    var hid = typeof padHid === 'function' && padHid(), on = net.active && net.notepad.on && !hid;") === 1 && count(net, '\nnet.notepadAway = padAway;\nnet.notepadHidden = function() { return padHid(); };') === 1
        && count(wbN, "(n.notepad && n.notepad.on ? (typeof n.notepadHidden === 'function' && n.notepadHidden() ? 'Show Table Notepad' : 'Put Away Table Notepad') : 'Open Table Notepad')") === 1,
        J([p0, pAway, p1, p2, p3, p4, p5, p6, g1, gA, g2, gB, g3, o1, oA, nb]));
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
        && count(dice, "document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && panelShown() && (!window.wpEsc || window.wpEsc.free(e))) closePanel(); }, true);") === 1
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

/* ---------- Escape closes the one thing on top (esckey.js) ---------- */
// The owner, 2026-10-17, by prompt: "Close the top one (Recommended)": each press closes the one thing on top: the right-click menu, then a
// menu, then a window; nothing behind it hears the key; the target pointer and the tool in hand are only cleared when nothing else was open.
// The router is sliced by its esc markers and run for real on a page of plain objects; the listeners that ask it are sliced and run too.
{
    const ek = read('scripts/esckey.js'), escSrc = sliceOf(ek, 'floatcheck', 'esc');
    // A page of plain objects: elements with a parent, classes, an inline display, hidden, a z-index and a place in the page; shown as a
    // browser draws (a .shape-menu only with its show class or a display of its own, nothing inside one that is not drawn)
    const mkPage = () => {
        const all = [], ids = {}; let ord = 0;
        const vis = e => e.style.display !== 'none' && e.hidden !== true && e.gone !== true && (!e.cls.has('shape-menu') || e.cls.has('show') || (e.style.display && e.style.display !== 'none'));
        const drawn = e => { for (let p = e; p; p = p.parent) if (!vis(p)) return false; return true; };
        const one = (e, s) => s.split('.').every((part, i) => i === 0 ? (part === '' || (part[0] === '#' ? e.id === part.slice(1) : e.tag === part.toUpperCase())) : e.cls.has(part))
            && (s[0] !== '#' || e.id === s.slice(1).split('.')[0]);
        const comp = (e, s) => { const m = /^#([A-Za-z0-9_-]+)(.*)$/.exec(s); if (m) return e.id === m[1] && (m[2] === '' || m[2].slice(1).split('.').every(c => e.cls.has(c))); if (s[0] === '.') return s.slice(1).split('.').every(c => e.cls.has(c)); return one(e, s); };
        const match = (e, sel) => sel.split(',').some(part => { const steps = part.trim().split(/\s+/); if (!comp(e, steps[steps.length - 1])) return false; let p = e.parent; for (let i = steps.length - 2; i >= 0; i--) { while (p && !comp(p, steps[i])) p = p.parent; if (!p) return false; p = p.parent; } return true; });
        const mk = (id, o) => {
            o = o || {};
            const e = { id: id || '', tag: (o.tag || 'div').toUpperCase(), type: o.type || '', value: o.value || '', parent: o.in || null, cls: new Set(o.cls || []), hidden: !!o.hidden, z: o.z, ord: ++ord, clicks: 0, blurs: 0, isContentEditable: !!o.ce, attrs: o.attrs || {}, style: { display: o.display === undefined ? '' : o.display } };
            e.tagName = e.tag;
            e.classList = { add: c => e.cls.add(c), remove: c => e.cls.delete(c), contains: c => e.cls.has(c) };
            e.getClientRects = () => (drawn(e) ? [{ width: 10, height: 10 }] : []);
            e.contains = x => { for (let p = x; p; p = p.parent) if (p === e) return true; return false; };
            e.closest = sel => { for (let p = e; p; p = p.parent) if (match(p, sel)) return p; return null; };
            e.compareDocumentPosition = other => (other.ord > e.ord ? 4 : 2);
            e.click = () => { e.clicks++; if (e.onclick) e.onclick(); };
            e.blur = () => { e.blurs++; if (doc.activeElement === e) doc.activeElement = doc.body; };
            e.remove = () => { e.gone = true; };
            all.push(e); if (id) ids[id] = e; return e;
        };
        const doc = { body: null, activeElement: null, getElementById: id => (ids[id] && ids[id].gone !== true ? ids[id] : null),
            querySelectorAll: sel => all.filter(e => e.gone !== true && e !== doc.body && match(e, sel)),
            querySelector: sel => { const m = /^\[aria-controls="([^"]+)"\]$/.exec(sel); return m ? all.find(e => e.attrs['aria-controls'] === m[1]) || null : doc.querySelectorAll(sel)[0] || null; } };
        doc.body = mk('', { tag: 'body' }); doc.activeElement = doc.body;
        const said = [];
        const win = { getComputedStyle: e => ({ zIndex: e.z === undefined ? 'auto' : String(e.z) }),
            wpTopRow: { close: () => { said.push('row'); ['campMenu', 'moreMenu'].forEach(i => { if (ids[i]) ids[i].hidden = true; }); } },
            wpPageShelf: { close: () => { said.push('shelf'); if (ids.pagesMenu) ids.pagesMenu.cls.delete('show'); } },
            wpDice: { closePanel: () => { said.push('dice'); ids.dicePanel.style.display = 'none'; } },
            wpDocPanel: { open: 'doc_1', openId: () => win.wpDocPanel.open, close: () => { said.push('page'); win.wpDocPanel.open = ''; ids.docPanel.style.display = 'none'; } },
            wpLeftRail: { m: 'rail', mode: () => win.wpLeftRail.m, away: () => { said.push('left'); win.wpLeftRail.m = 'rail'; } },
            // Table Chat, the notepad, Sound and Music (the owner, 2026-10-17: "Yes, when on top"): the notepad put away on this screen, Sound and
            // Music by their modules; the box last used as floats.js says it (none unless a check names one)
            wpNet: { notepadAway: () => { said.push('pad'); ids.notepadPanel.style.display = 'none'; return true; } },
            wpSound: { closePanel: () => { said.push('sound'); ids.soundPanel.style.display = 'none'; } },
            wpMusic: { closePanel: () => { said.push('music'); ids.musicPanel.style.display = 'none'; } },
            wpFloats: { used: null, last: () => win.wpFloats.used } };
        const R = new Function('document', 'window', escSrc + '\nreturn { judge: escJudge, down: escDown, back: escBack, free: escFree, field: escField, WINDOWS: ESC_WINDOWS, ASIDE: ESC_ASIDE };')(doc, win);
        // A press: the router at the window going down, the key's own place (inner: a box's own listener), the page's listeners (the map's
        // own uses, which ask free), the router at the window coming back up
        const press = (t, o) => {
            o = o || {};
            const e = { key: o.key || 'Escape', repeat: !!o.repeat, target: t || doc.body, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
            doc.activeElement = t || doc.body;
            R.down(e); const free0 = R.free(e);
            if (!e.stopped && o.inner) o.inner(e);
            const mapUse = !e.stopped && R.free(e);
            if (!e.stopped) R.back(e);
            return { stopped: e.stopped, free: free0, mapUse: mapUse, prevented: e.defaultPrevented };
        };
        const shut = (id, btn) => { const b = mk(btn, { tag: 'button', in: ids[id] }); b.onclick = () => { ids[id].style.display = 'none'; }; return b; };
        return { mk, doc, win, R, said, press, ids, shut };
    };
    // the page as the app has it: the windows with their close buttons, the toolbars, the floating boxes
    const page = o => {
        o = o || {};
        const P = mkPage(), { mk, ids, shut } = P;
        mk('customConfirm', { display: 'none', z: 100010 }); mk('customPrompt', { display: 'none', z: 100010 });
        mk('contextMenu', { display: 'none', z: 90020 }); mk('sidebarContextMenu', { display: 'none' }); mk('charMenu', { display: 'none', cls: ['context-menu'] }); mk('edgeMenu', { display: 'none' });
        mk('helpModal', { display: 'none', z: 99999 }); shut('helpModal', 'helpCloseBtn'); mk('helpSearch', { tag: 'input', type: 'text', in: ids.helpModal });
        mk('settingsModal', { display: 'none', z: 99999 }); shut('settingsModal', 'settingsCloseBtn');
        mk('journalModal', { display: 'none', z: 100000 }); shut('journalModal', 'journalCloseBtn'); mk('journalSearch', { tag: 'input', type: 'text', in: ids.journalModal });
        mk('jNote', { cls: ['ts-box'], ce: true, in: ids.journalModal }); mk('tsBar', { hidden: true, cls: ['ts-bar'], in: ids.journalModal }); mk('tsLink', { tag: 'input', in: ids.tsBar });
        mk('systemModal', { display: 'none', z: 100000 }); shut('systemModal', 'sysClose'); mk('sysName', { tag: 'input', in: ids.systemModal });
        mk('calendarModal', { display: 'none', z: 100000 }); shut('calendarModal', 'calendarClose');
        mk('cmdkModal', { display: 'none', z: 100001 });
        mk('frameModal', { display: 'none' }); mk('genModal', { display: 'none' });
        mk('wbFloatingToolbar', { cls: ['floating-toolbar'] });
        ['wbMoreMenu', 'fogMenu', 'buildMenu', 'pagesMenu', 'drawMenu', 'blastMenu'].forEach(id => mk(id, { cls: ['shape-menu'], in: ids.wbFloatingToolbar }));
        mk('pagesRow', { tag: 'button', in: ids.pagesMenu }); mk('moreRow', { tag: 'button', in: ids.wbMoreMenu }); mk('buildW', { tag: 'input', type: 'number', in: ids.buildMenu });
        mk('buildRow', { tag: 'button', in: ids.buildMenu }); mk('blastDmg', { tag: 'input', type: 'text', in: ids.blastMenu });
        mk('moreMenu', { hidden: true }); mk('moreBtn', { tag: 'button', attrs: { 'aria-controls': 'moreMenu' } }); mk('moreRowExport', { tag: 'button', in: ids.moreMenu });
        mk('campMenu', { hidden: true });
        mk('partyMenu', { cls: ['shape-menu'] }); mk('imgCatMenu', { cls: ['shape-menu'], display: 'none' });
        mk('sheetPanel', { display: 'none', z: 9000 }); mk('sheetBtn', { tag: 'button', in: ids.sheetPanel });
        mk('docPanel', { display: 'none', z: 9000 }); mk('docRow', { tag: 'button', in: ids.docPanel }); mk('docPanelSearchInput', { tag: 'input', in: ids.docPanel });
        mk('dicePanel', { display: 'none', z: 90001 }); mk('diceDie', { tag: 'button', in: ids.dicePanel });
        mk('chatPanel', { display: 'none', z: 90000 }); mk('chatInput', { tag: 'input', in: ids.chatPanel }); mk('chatSend', { tag: 'button', in: ids.chatPanel });
        mk('chatCloseBtn', { tag: 'button', in: ids.chatPanel }).onclick = () => { P.said.push('chat'); ids.chatPanel.style.display = 'none'; };
        mk('musicPanel', { display: 'none', z: 9000 }); mk('musicPlay', { tag: 'button', in: ids.musicPanel });
        mk('videoPanel', { display: 'none', z: 9000 });
        mk('fxPanel', { display: 'none', z: 9000 }); mk('notepadPanel', { display: 'none', z: 9000 }); mk('soundPanel', { display: 'none', z: 9000 });
        mk('padText', { cls: ['ts-box'], ce: true, in: ids.notepadPanel }); mk('soundPlay', { tag: 'button', in: ids.soundPanel });
        mk('hudLayer'); mk('hud1', { cls: ['hud-panel'], in: ids.hudLayer, display: 'none' });
        mk('campaignSidebar', { z: 5001 }); mk('railRow', { tag: 'button', in: ids.campaignSidebar }); mk('sideFind', { tag: 'input', in: ids.campaignSidebar });
        mk('rightName', { tag: 'input', type: 'text' }); mk('toolBtn', { tag: 'button' }); mk('tick', { tag: 'input', type: 'checkbox' });
        mk('whiteboard'); mk('wbText', { cls: ['wb-item', 'text', 'editing'], ce: true, in: ids.whiteboard });
        return P;
    };
    const show = (P, id, d) => { P.ids[id].style.display = d || 'flex'; };

    // 1. the order: a question first (its own rules), then the right-click menu, a menu, the window on top, the box Escape closes from outside
    {
        const P = page(), I = P.ids;
        show(P, 'customConfirm'); show(P, 'contextMenu'); I.wbMoreMenu.cls.add('show'); show(P, 'helpModal'); show(P, 'dicePanel');
        const q = P.press();
        I.customConfirm.style.display = 'none';
        const r1 = P.press(), s1 = [I.contextMenu.style.display, I.wbMoreMenu.cls.has('show'), I.helpModal.style.display, P.said.slice()];
        const r2 = P.press(), s2 = [I.wbMoreMenu.cls.has('show'), I.helpModal.style.display, P.said.slice()];
        const r3 = P.press(), s3 = [I.helpModal.style.display, I.helpCloseBtn.clicks, P.said.slice()];
        const r4 = P.press(), s4 = P.said.slice();
        const r5 = P.press();
        check('Escape closes the one thing on top, a press at a time (esckey.js run for real): a question or a prompt keeps its own rules and the key is free to nothing else; then the map\'s right-click menu, then an open menu of the toolbar, then the window on top by its own close button, then the dice roller; each goes no further than the window; only with nothing open is the key free for the map\'s own uses',
            J([q, r1, s1, r2, s2, r3, s3, r4, s4, r5]) === J([{ stopped: false, free: false, mapUse: false, prevented: false },
                { stopped: true, free: false, mapUse: false, prevented: true }, ['none', true, 'flex', []],
                { stopped: true, free: false, mapUse: false, prevented: true }, [false, 'flex', []],
                { stopped: true, free: false, mapUse: false, prevented: true }, ['none', 1, []],
                { stopped: true, free: false, mapUse: false, prevented: true }, ['dice'],
                { stopped: false, free: true, mapUse: true, prevented: false }]), J([q, r1, s1, r2, s2, r3, s3, r4, s4, r5]));
    }
    // 2. what keeps its own rules, and the right-click menus of the left panel, the Characters and the data map
    {
        const aside = (fn) => { const P = page(); fn(P); const r = P.press(); return [r.stopped, r.free, P.said.length, P.ids.helpCloseBtn.clicks]; };
        const asides = [
            aside(P => { show(P, 'customPrompt'); show(P, 'helpModal'); }),
            aside(P => { P.doc.body.cls.add('tour-on'); show(P, 'helpModal'); }),
            aside(P => { show(P, 'frameModal'); show(P, 'helpModal'); }),
            aside(P => { show(P, 'genModal'); show(P, 'helpModal'); }),
            aside(P => { P.mk('cleanupAskModal', { display: 'flex' }); show(P, 'helpModal'); }),
            aside(P => { P.mk('imgLibPreview', { display: 'flex' }); show(P, 'helpModal'); }),
            aside(P => { show(P, 'videoPanel'); P.ids.videoPanel.cls.add('vid-max'); show(P, 'helpModal'); }),
            aside(P => { P.mk('', { cls: ['face-pop'] }); show(P, 'helpModal'); }),
            aside(P => { P.mk('', { cls: ['rte-symwrap', 'open'] }); show(P, 'helpModal'); }),
            aside(P => { P.mk('pageNavMenu', { display: 'block' }); show(P, 'helpModal'); }),
            aside(P => { P.mk('', { cls: ['sheet-dl-pop'] }); show(P, 'helpModal'); })];
        const right = ['sidebarContextMenu', 'charMenu', 'edgeMenu'].map(id => { const P = page(); show(P, id, 'block'); show(P, 'helpModal'); const r = P.press(); return [id, r.stopped, P.ids[id].style.display, P.ids.helpModal.style.display]; });
        const away = (() => { const P = page(); P.mk('', { cls: ['face-pop'], display: 'none' }); show(P, 'contextMenu'); const r = P.press(); return [r.stopped, P.ids.contextMenu.style.display]; })();
        check('Escape leaves to their own rules a question or a prompt, the tour, the cleanup\'s questions, the token creator, the generators\' dialogs, the Image Library\'s preview, a video filling the window and the menus with keys of their own (a face, a symbol tray, the Outline, the sheet\'s Download): nothing is closed under them and nothing hears the key as free; one put away counts for nothing; the right-click menus of the left panel, the Characters section and the data map go first as the map\'s does',
            asides.every(a => J(a) === J([false, false, 0, 0])) && J(right) === J([['sidebarContextMenu', true, 'none', 'flex'], ['charMenu', true, 'none', 'flex'], ['edgeMenu', true, 'none', 'flex']]) && J(away) === J([true, 'none']), J([asides, right, away]));
    }
    // 3. the windows: the one on top by its z-index, then by its place in the page; a box in it that gives Escape a meaning of its own first
    {
        const P = page(), I = P.ids; show(P, 'helpModal'); show(P, 'journalModal'); show(P, 'settingsModal');
        P.press(); const w1 = [I.journalModal.style.display, I.settingsModal.style.display, I.helpModal.style.display];
        P.press(); const w2 = [I.settingsModal.style.display, I.helpModal.style.display];
        P.press(); const w3 = I.helpModal.style.display;
        // Help's search holding words: its own Escape clears it first; empty, Help closes at once and the focus is taken out
        const H = page(); show(H, 'helpModal'); H.ids.helpSearch.value = 'fog';
        const h1 = H.press(H.ids.helpSearch, { inner: e => { e.stopPropagation(); H.ids.helpSearch.value = ''; } }), h1s = H.ids.helpModal.style.display;
        const h2 = H.press(H.ids.helpSearch), h2s = [H.ids.helpModal.style.display, H.ids.helpSearch.blurs];
        const H2 = page(); show(H2, 'helpModal'); H2.ids.helpSearch.value = 'fog'; const h3 = H2.press(H2.ids.helpSearch), h3s = H2.ids.helpModal.style.display;   // a search that let the key go: Help closes as the key comes back
        // the Journal: a note's text bar goes first, then the Journal; a list that stops every key never keeps it open
        const Jn = page(); show(Jn, 'journalModal'); Jn.ids.tsBar.hidden = false;
        const j1 = Jn.press(Jn.ids.jNote, { inner: e => { e.stopPropagation(); Jn.ids.tsBar.hidden = true; } }), j1s = Jn.ids.journalModal.style.display;
        const j2 = Jn.press(Jn.ids.jNote, { inner: e => e.stopPropagation() }), j2s = [Jn.ids.journalModal.style.display, Jn.ids.jNote.blurs];
        const Jl = page(); show(Jl, 'journalModal'); Jl.ids.tsBar.hidden = false; const j3 = Jl.press(Jl.ids.tsLink, { inner: e => { e.preventDefault(); e.stopPropagation(); } }), j3s = Jl.ids.journalModal.style.display;
        // the System editor closes itself on Escape and its boxes come first: the key goes down to it, and is not closed twice
        const S = page(); show(S, 'systemModal');
        const s1 = S.press(S.ids.sysName, { inner: e => { e.preventDefault(); e.stopPropagation(); S.ids.systemModal.style.display = 'none'; } }), s1s = [S.ids.systemModal.style.display, S.ids.sysClose.clicks];
        const S2 = page(); show(S2, 'systemModal'); const s2 = S2.press(), s2s = [S2.ids.systemModal.style.display, S2.ids.sysClose.clicks];
        const C = page(); show(C, 'cmdkModal'); C.press(); const cmdk = C.ids.cmdkModal.style.display;
        check('the window on top closes by its own close button: the highest z-index first and of two alike the later in the page; a search of Help or the Journal that holds words, and a text box\'s bar, keep their own Escape first and the window closes once they let the key go; a list that stops every key never keeps a window open; the System editor and the Library close themselves and are pressed shut only from outside; quick-jump, which has no close button, is put away; the focus is taken out of what closes',
            J([w1, w2, w3]) === J([['none', 'flex', 'flex'], ['none', 'flex'], 'none'])
            && J([h1, h1s, h2, h2s, h3, h3s]) === J([{ stopped: true, free: false, mapUse: false, prevented: false }, 'flex', { stopped: true, free: false, mapUse: false, prevented: true }, ['none', 1], { stopped: false, free: false, mapUse: false, prevented: true }, 'none'])
            && J([j1, j1s, j2, j2s, j3, j3s]) === J([{ stopped: true, free: false, mapUse: false, prevented: false }, 'flex', { stopped: true, free: false, mapUse: false, prevented: true }, ['none', 1], { stopped: true, free: false, mapUse: false, prevented: true }, 'flex'])
            && J([s1, s1s, s2, s2s, cmdk]) === J([{ stopped: true, free: false, mapUse: false, prevented: true }, ['none', 0], { stopped: true, free: false, mapUse: false, prevented: true }, ['none', 1], 'none']),
            J([w1, w2, w3, h1, h1s, h2, h2s, h3, h3s, j1, j1s, j2, j2s, j3, j3s, s1, s1s, s2, s2s, cmdk]));
    }
    // 4. the menus: a tool's options are a menu like any other (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)"); the
    //    top row's and the Pages shelf's keys stay theirs while the focus is in them, and so do the fields of a tool's options
    {
        const one = (fn, t, inner) => { const P = page(); fn(P); const r = P.press(t ? P.ids[t] : null, inner ? { inner: inner(P) } : {}); return [r.stopped, r.free, P.said.slice(), ['wbMoreMenu', 'fogMenu', 'buildMenu', 'pagesMenu', 'partyMenu'].filter(id => P.ids[id].getClientRects().length).join(','), P.ids.moreMenu.hidden]; };
        const m = [
            one(P => { P.ids.buildMenu.cls.add('show'); }),
            one(P => { P.ids.buildMenu.cls.add('show'); }, 'buildW'),
            one(P => { P.ids.drawMenu.cls.add('show'); P.ids.fogMenu.cls.add('show'); }),
            one(P => { P.ids.pagesMenu.cls.add('show'); }),
            one(P => { P.ids.pagesMenu.cls.add('show'); }, 'pagesRow', P => e => { e.stopPropagation(); P.ids.pagesMenu.cls.delete('show'); }),
            one(P => { P.ids.moreMenu.hidden = false; }),
            one(P => { P.ids.moreMenu.hidden = false; }, 'moreBtn', P => e => { e.preventDefault(); e.stopPropagation(); P.ids.moreMenu.hidden = true; }),
            one(P => { P.ids.moreMenu.hidden = false; }, 'moreRowExport'),
            one(P => { P.ids.partyMenu.cls.add('show'); P.ids.wbMoreMenu.cls.add('show'); }),
            one(P => { P.ids.wbMoreMenu.cls.add('show'); P.ids.wbFloatingToolbar.style.display = 'none'; })];
        const ic = (() => { const P = page(); P.ids.imgCatMenu.style.display = 'flex'; P.ids.imgCatMenu.cls.add('show'); P.press(); return [P.ids.imgCatMenu.style.display, P.ids.imgCatMenu.cls.has('show')]; })();
        const sa = (() => { const P = page(); const a = P.mk('', { cls: ['section-actions', 'show'] }); a.style.left = '12px'; P.press(); return [a.cls.has('show'), a.style.left]; })();
        const cp = (() => { const P = page(); P.mk('selToolbar'); const p = P.mk('', { cls: ['st-color-pop'], in: P.ids.selToolbar }); P.press(); return p.hidden; })();
        const made = ['crumbMoreMenu', 'docAppearanceMenu'].map(id => { const P = page(); const m = P.mk(id, { display: 'flex' }); show(P, 'helpModal'); const r = P.press(); return [r.stopped, m.gone === true, P.ids.helpModal.style.display]; });
        check('a menu: a tool\'s options are a menu of the toolbar like any other, closed by the first Escape and before any window (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)"), and from a field of their own as the key comes back, once the field let it go; any other menu of the toolbar, the fog\'s among them, closes; the Pages shelf by its own close, and by its own keys while the focus is in it; the top row\'s by its own close, and by its own keys from its button; the party\'s menu before the toolbar\'s; a menu on a toolbar that is put away is not open; the library\'s categories, a section\'s actions and a selection\'s colours close as their own press elsewhere does, and the path\'s hidden levels and a page\'s Appearance go before a window',
            J(m) === J([[true, false, [], '', true], [false, false, [], '', true], [true, false, [], '', true], [true, false, ['shelf'], '', true],
                [true, false, [], '', true], [true, false, ['row'], '', true], [true, false, [], '', true], [false, false, ['row'], '', true], [true, false, [], 'wbMoreMenu', true], [false, true, [], '', true]])
            && J([ic, sa, cp]) === J([['none', false], [false, ''], true]) && J(made) === J([[true, true, 'flex'], [true, true, 'flex']]), J([m, ic, sa, cp, made]));
    }
    // 4b. a tool in hand with its options up (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)": the options are the
    //     top thing, so the first Escape closes them and the tool stays in hand; the next Escape puts the tool away)
    {
        const P = page(), I = P.ids; I.buildMenu.cls.add('show');
        const o1 = P.press(), s1 = I.buildMenu.cls.has('show'), o2 = P.press();
        const B = page(); B.ids.buildMenu.cls.add('show'); const b1 = B.press(B.ids.buildRow), bS = B.ids.buildMenu.cls.has('show');   // a button of the options: they close as the key comes back
        const X = page(); X.ids.blastMenu.cls.add('show'); const x1 = X.press(X.ids.blastDmg, { inner: e => { e.preventDefault(); e.stopPropagation(); } }), xS = X.ids.blastMenu.cls.has('show');   // the Radius tool's own box takes its Escape first
        const H = page(); show(H, 'helpModal'); H.ids.drawMenu.cls.add('show'); H.press(); const hS = [H.ids.drawMenu.cls.has('show'), H.ids.helpModal.style.display];
        // options that stood back under a box pressed since (whiteboard.js BAR_BACK): the box that holds the focus goes first, then the options
        const K = page(); K.ids.wbFloatingToolbar.cls.add('tb-back'); K.ids.drawMenu.cls.add('show'); show(K, 'sheetPanel');
        const k1 = K.press(K.ids.sheetBtn, { inner: e => { e.preventDefault(); e.stopPropagation(); K.ids.sheetPanel.style.display = 'none'; K.said.push('sheet'); } }), kS = [K.ids.drawMenu.cls.has('show'), K.said.slice()];
        const k2 = K.press(), kS2 = K.ids.drawMenu.cls.has('show'), k3 = K.press();
        const L = page(); L.ids.wbFloatingToolbar.cls.add('tb-back'); L.ids.drawMenu.cls.add('show'); show(L, 'sheetPanel'); L.press(); const lS = [L.ids.drawMenu.cls.has('show'), L.ids.sheetPanel.style.display];
        const N = page(); N.ids.drawMenu.cls.add('show'); show(N, 'sheetPanel'); N.press(N.ids.sheetBtn); const nS = [N.ids.drawMenu.cls.has('show'), N.ids.sheetPanel.style.display];
        const Q = page(); Q.ids.wbFloatingToolbar.cls.add('tb-back'); Q.ids.drawMenu.cls.add('show'); show(Q, 'chatPanel'); Q.press(Q.ids.chatInput); const qS = [Q.ids.drawMenu.cls.has('show'), Q.said.slice()];   // Table Chat pressed since: the chat goes first
        const CL = { stopped: true, free: false, mapUse: false, prevented: true }, FREE = { stopped: false, free: true, mapUse: true, prevented: false };
        check('a tool in hand with its options up (esckey.js run for real; the owner, 2026-10-17, by prompt: "Close the options first (Recommended)"): the first Escape closes the options and goes no further, so the tool stays in hand, and the next, with nothing open, is free for the map\'s own uses, which put the tool away; from a button of the options they close as the key comes back; a box of their own that takes Escape (the Radius tool\'s) keeps them up; they go before a window; options whose bar stood back under a box pressed since are under the box that holds the focus, which goes first, and close at the next press, as they do when the focus is in no box; a bar that did not stand back keeps its options on top of a box',
            J([o1, s1, o2]) === J([CL, false, FREE]) && J([b1, bS]) === J([{ stopped: false, free: false, mapUse: false, prevented: true }, false]) && J([x1, xS]) === J([{ stopped: true, free: false, mapUse: false, prevented: true }, true])
            && J(hS) === J([false, 'flex']) && J([k1, kS, k2, kS2, k3]) === J([{ stopped: true, free: false, mapUse: false, prevented: true }, [true, ['sheet']], CL, false, FREE]) && J(lS) === J([false, 'flex']) && J(nS) === J([false, 'flex']) && J(qS) === J([true, ['chat']]),
            J([o1, s1, o2, b1, bS, x1, xS, hS, k1, kS, k2, kS2, k3, lS, nS, qS]));
    }
    // 5. a text box on the map, the floating boxes, a field outside them, the left panel opened from its rail
    {
        const T = page(); const t1 = T.press(T.ids.wbText), tS = [T.ids.wbText.blurs];
        const box = (fn, t, inner) => { const P = page(); fn(P); const r = P.press(P.ids[t], inner ? { inner: inner(P) } : {}); return [r.stopped, r.free, r.mapUse, P.said.slice()]; };
        const f = [
            box(P => { show(P, 'sheetPanel'); show(P, 'dicePanel'); }, 'sheetBtn', P => e => { e.preventDefault(); e.stopPropagation(); P.ids.sheetPanel.style.display = 'none'; P.said.push('sheet'); }),
            box(P => { show(P, 'docPanel'); show(P, 'dicePanel'); }, 'docRow'),
            box(P => { show(P, 'docPanel'); }, 'docPanelSearchInput', P => e => e.preventDefault()),
            box(P => { show(P, 'dicePanel'); }, 'diceDie'),
            box(P => { show(P, 'chatPanel'); show(P, 'dicePanel'); }, 'chatInput', P => e => e.stopPropagation()),
            box(P => { show(P, 'chatPanel'); show(P, 'dicePanel'); }, 'chatSend'),
            box(P => { show(P, 'musicPanel'); show(P, 'docPanel'); }, 'musicPlay'),
            box(P => { show(P, 'hud1'); show(P, 'dicePanel'); }, 'hud1', P => e => { e.preventDefault(); e.stopPropagation(); P.said.push('hud'); }),
            box(P => { show(P, 'dicePanel'); show(P, 'docPanel'); }, 'toolBtn'),
            box(P => { show(P, 'docPanel'); }, 'rightName'),
            box(P => { show(P, 'docPanel'); }, 'rightName', P => e => e.preventDefault()),
            box(P => {}, 'rightName'),
            box(P => {}, 'tick'),
            box(P => { P.win.wpLeftRail.m = 'open'; show(P, 'docPanel'); }, 'railRow'),
            box(P => { P.win.wpLeftRail.m = 'open'; }, 'sideFind', P => e => e.stopPropagation()),
            box(P => { P.win.wpLeftRail.m = 'open'; show(P, 'docPanel'); }, 'toolBtn'),
            box(P => { P.win.wpLeftRail.m = 'open'; }, 'toolBtn'),
            box(P => { show(P, 'docPanel'); P.win.wpDocPanel.open = ''; }, 'toolBtn'),
            box(P => { show(P, 'dicePanel'); P.ids.dicePanel.gone = true; }, 'toolBtn'),
            box(P => { show(P, 'musicPanel'); show(P, 'dicePanel'); P.mk('musicFind', { tag: 'input', type: 'search', in: P.ids.musicPanel }); }, 'musicFind'),
            box(P => { show(P, 'docPanel'); }, 'tick'),
            box(P => { show(P, 'docPanel'); }, 'docRow', P => e => { P.win.wpDocPanel.close(); })];
        check('a text box on the map being typed in loses the focus, which keeps its words, and the key goes no further; a floating box that holds the focus keeps its own Escape (the sheet, a HUD) and the page panel and the dice roller are closed as the key comes back if their own listeners let it go, while Table Chat and Music close as a window does when the focus is in them, from a field or a button (the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)"); outside them the box on top of those Escape closes from outside goes, the roller over the page panel, the page panel over the left panel opened from its rail, after a field\'s own Escape; with none of them the key is free, a field\'s and a tick\'s too; the left panel opened from its rail closes from inside it once its own boxes let the key go',
            J([t1, tS]) === J([{ stopped: true, free: false, mapUse: false, prevented: true }, [1]])
            && J(f) === J([[true, false, false, ['sheet']], [false, false, false, ['page']], [false, false, false, []], [false, false, false, ['dice']], [true, false, false, ['chat']], [true, false, false, ['chat']], [true, false, false, ['music']],
                [true, false, false, ['hud']], [true, false, false, ['dice']], [false, false, false, ['page']], [false, false, false, []], [false, true, true, []], [false, true, true, []],
                [false, false, false, ['left']], [true, false, false, []], [true, false, false, ['page']], [true, false, false, ['left']], [false, true, true, []], [false, true, true, []],
                [true, false, false, ['music']], [true, false, false, ['page']], [false, false, false, ['page']]]), J([t1, tS, f]));
    }
    // 5b. Table Chat, the notepad, Sound and Music (the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)": when one of them is the
    //     window last used, Escape closes it like any other window; Chat keeps its messages and the notepad its words)
    {
        const last = (fn, used, t, inner) => { const P = page(); fn(P); P.win.wpFloats.used = used ? P.ids[used] : null; const r = P.press(t ? P.ids[t] : null, inner ? { inner: inner(P) } : {}); return [r.stopped, r.free, r.mapUse, P.said.slice()]; };
        const g = [
            last(P => { show(P, 'chatPanel'); show(P, 'docPanel'); }, 'chatPanel'),   // chat used last: it goes, the page panel stays
            last(P => { show(P, 'chatPanel'); show(P, 'docPanel'); }, 'docPanel'),    // the page panel used last: it goes before the chat
            last(P => { show(P, 'chatPanel'); show(P, 'dicePanel'); }, 'chatPanel'),  // the chat used last goes before the roller on top of it
            last(P => { show(P, 'chatPanel'); show(P, 'docPanel'); show(P, 'sheetPanel'); }, 'sheetPanel'),   // a sheet used last: as before, the page panel and never the chat
            last(P => { show(P, 'chatPanel'); }, null),                                 // the chat not the last used: the key is free, the chat stays
            last(P => { show(P, 'chatPanel'); }, 'sheetPanel'),                         // the box last used is not one Escape closes: free
            last(P => { show(P, 'notepadPanel'); }, 'notepadPanel'),                    // the notepad, put away on this screen
            last(P => { show(P, 'soundPanel'); }, 'soundPanel'),
            last(P => { show(P, 'musicPanel'); show(P, 'docPanel'); }, 'musicPanel'),
            last(P => { show(P, 'chatPanel'); }, 'chatPanel', 'rightName'),             // from a field outside: its own Escape first, then the chat as the key comes back
            last(P => { show(P, 'chatPanel'); }, 'chatPanel', 'rightName', P => e => e.preventDefault()),   // a field that took it keeps the chat
            last(P => { show(P, 'soundPanel'); }, null, 'soundPlay'),                   // the focus in it: it is in use
            last(P => { show(P, 'notepadPanel'); }, null, 'padText'),                   // a player's pad, or the GM's with no bar up
            last(P => { show(P, 'notepadPanel'); P.ids.tsBar.parent = P.ids.notepadPanel; P.ids.tsBar.hidden = false; }, null, 'padText', P => e => { e.stopPropagation(); P.ids.tsBar.hidden = true; }),   // the GM's with its bar up: the bar goes first
            last(P => { show(P, 'notepadPanel'); P.ids.tsBar.parent = P.ids.notepadPanel; }, null, 'padText'),   // and then the pad
            last(P => { show(P, 'soundPanel'); delete P.win.wpSound; }, 'soundPanel'),   // no module to close it: nothing is closed and the key is free
            last(P => { show(P, 'musicPanel'); delete P.win.wpMusic; P.mk('musicFind2', { tag: 'input', type: 'search', in: P.ids.musicPanel }); }, null, 'musicFind2'),   // and its fields keep their keys
            last(P => { show(P, 'chatPanel'); show(P, 'helpModal'); }, 'chatPanel')];   // a window goes first
        const hid = (() => { const P = page(); show(P, 'chatPanel'); show(P, 'docPanel'); P.ids.chatPanel.style.display = 'none'; P.win.wpFloats.used = P.ids.chatPanel; P.press(); return P.said.slice(); })();   // a chat already closed is not the box last used
        check('Table Chat, the table notepad, Sound and Music close on Escape as a window does while one of them is the window last used (esckey.js run for real with floats.js last; the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)"): from outside, the box last used goes where it is one of those Escape closes, the dice roller and the page panel among them, before the box on top; where it is a sheet or no box the rule is as before and the four stay; Chat by its own close button, the notepad on this screen alone, Sound and Music by their modules; with the focus in one of them it is in use and closes, after a text bar\'s own Escape; a field outside keeps its own Escape first; a box with no module to close it is left alone, its fields keeping their keys; a window goes first',
            J(g) === J([[true, false, false, ['chat']], [true, false, false, ['page']], [true, false, false, ['chat']], [true, false, false, ['page']], [false, true, true, []], [false, true, true, []],
                [true, false, false, ['pad']], [true, false, false, ['sound']], [true, false, false, ['music']], [false, false, false, ['chat']], [false, false, false, []], [true, false, false, ['sound']], [true, false, false, ['pad']],
                [true, false, false, []], [true, false, false, ['pad']], [false, true, true, []], [false, false, false, []], [true, false, false, []]]) && J(hid) === J(['page']), J([g, hid]));
    }
    // 6. a key held down, a press another listener took first, a window of its own
    {
        const P = page(); show(P, 'contextMenu'); show(P, 'helpModal');
        const k1 = P.press(null, { up: false }), k2 = P.press(null, { repeat: true, up: false }), kS = [P.ids.helpModal.style.display];
        const k3 = P.press(), kS3 = P.ids.helpModal.style.display;
        const Q = page(); const n1 = Q.press(null, { up: false }), n2 = Q.press(null, { repeat: true });   // free, and its repeats free to nothing
        const X = page(); show(X, 'helpModal'); const xe = { key: 'Escape', target: X.doc.body, defaultPrevented: true, stopPropagation() { this.stopped = true; }, preventDefault() {} }; X.R.down(xe); const x1 = [!!xe.stopped, X.ids.helpModal.style.display, X.R.free(xe)];
        const O = page(); O.win.wpPopout = true; show(O, 'helpModal'); const o1 = O.press(), oS = O.ids.helpModal.style.display;
        const K = page(); show(K, 'helpModal'); const kOther = K.press(null, { key: 'Enter' }), kOS = K.ids.helpModal.style.display;
        const F = page(); const fe = { key: 'Escape', target: F.doc.body, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }; F.R.down(fe); const fOther = F.R.free({ key: 'Escape' }), fSame = F.R.free(fe); fe.preventDefault(); const fAfter = F.R.free(fe);
        check('a key held down closes nothing new: the repeats of a press that closed something are swallowed, and those of a free press are free to nothing; a press another listener took first is left alone; in a window of its own the key is as it always was; another key is not the router\'s; free answers for that very press only, and not once something took it',
            J([k1, k2, kS, k3, kS3, n1, n2, x1, o1, oS, kOther, kOS, fOther, fSame, fAfter]) === J([{ stopped: true, free: false, mapUse: false, prevented: true }, { stopped: true, free: false, mapUse: false, prevented: true }, ['flex'],
                { stopped: true, free: false, mapUse: false, prevented: true }, 'none', { stopped: false, free: true, mapUse: true, prevented: false }, { stopped: false, free: false, mapUse: false, prevented: false }, [false, 'flex', false],
                { stopped: false, free: true, mapUse: true, prevented: false }, 'flex', { stopped: false, free: false, mapUse: false, prevented: false }, 'flex', false, true, false]),
            J([k1, k2, kS, k3, kS3, n1, n2, x1, o1, oS, kOther, kOS, fOther, fSame, fAfter]));
    }
    // 7. the inventory: every window of the page is the router's or keeps its own Escape, each by a close button the page holds once
    {
        const P = page(), wins = P.R.WINDOWS, aside = P.R.ASIDE, modals = (ix.match(/id="[A-Za-z]+Modal"/g) || []).map(s => s.slice(4, -1));
        const missing = modals.filter(id => !wins.some(w => w[0] === id) && aside.indexOf(id) < 0), btns = wins.filter(w => w[1] && count(ix, 'id="' + w[1] + '"') !== 1).map(w => w[1]);
        check('every window of the page closes on Escape or keeps its own Escape: each id ending in Modal is the router\'s, with its own close button there once, or one that hears Escape first itself (' + modals.length + ' windows)',
            modals.length >= 34 && missing.length === 0 && btns.length === 0 && wins.every(w => modals.indexOf(w[0]) >= 0) && J(aside.filter(id => /Modal$/.test(id))) === J(['cleanupAskModal', 'cleanupSummaryModal', 'cleanupMissingModal', 'cleanupBackupModal', 'frameModal', 'genModal', 'cityModal', 'worldModal', 'shotModal']), J([missing, btns]));
    }
    // 8. the listeners that ask it, run for real: the dice roller's, the page panel's, the target pointer's, an armed throw's, a placement's,
    //    Build's, the left panel's and the menus' own closers act only on a free Escape, and a module run alone with no router acts as before
    {
        const dice = read('scripts/dice.js'), dp = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'utf8'), wb = read('scripts/whiteboard.js'), lr = read('scripts/leftrail.js'), cl = read('scripts/charlist.js'), sb = read('scripts/sidebar.js');
        const G = '(!window.wpEsc || window.wpEsc.free(e))';
        const freeAs = v => v === undefined ? undefined : { free: () => v };
        // the dice roller's
        const dLine = lineOf(dice, "    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && panelShown()");
        const dRun = v => { let h = null, n = 0; new Function('document', 'window', 'panelShown', 'closePanel', dLine)({ addEventListener: (t, f) => { h = f; } }, { wpEsc: freeAs(v) }, () => true, () => { n++; }); h({ key: 'Escape' }); return n; };
        // the page panel's
        const pSrc = fnK(dp, "    document.addEventListener('keydown', function(e) {\n        if (e.key !== 'Escape' || !openId", '\n    });\n');
        const pRun = v => { let h = null, n = 0; const body = {}; new Function('document', 'window', 'ui', 'openId', 'close', pSrc)({ addEventListener: (t, f) => { h = f; }, body: body, activeElement: body }, { wpEsc: freeAs(v) }, () => ({}), 'doc_1', () => { n++; }); h({ key: 'Escape' }); return n; };
        // the target pointer's
        const tSrc = fnK(wb, "      document.addEventListener('keydown', function(e) {\n          if (e.key === 'Escape') {   // 1.5.4", "\n      });\n");
        const tRun = (v, tgt) => { let h = null, n = 0; const net = { active: true, role: 'client', myId: 'u1', targets: { u1: { id: 'tok' } }, clearMyTarget: () => { n++; } }; new Function('document', 'window', tSrc)({ addEventListener: (t, f) => { h = f; }, querySelector: () => null }, { wpEsc: freeAs(v), wpNet: net }); h({ key: 'Escape', target: tgt || { tagName: 'DIV' } }); return n; };
        // an armed throw or burst
        const bSrc = fnK(wb, "  // Esc cancels an armed throw or FX burst and returns to the arrow", "\n  });\n");
        const bRun = v => { let h = null, n = 0; const W = { wpEsc: freeAs(v), isMeasureMode: true, wpMeasureKind: 'fx' }; new Function('document', 'window', 'var _armedThrow = null, _fxArm = { look: "boom" };\n' + bSrc + '\nreturn function() { return _fxArm; };')({ addEventListener: (t, f) => { h = f; }, body: { classList: { remove() {} } }, getElementById: () => ({ click: () => { n++; } }) }, W); h({ key: 'Escape' }); return [n, W.isMeasureMode]; };
        // a placement's
        const plSrc = fnK(wb, "document.addEventListener('keydown', function(e) {\n    if (e.key === 'Escape' && window.wpPlace", "\n});\n");
        const plRun = v => { let h = null, n = 0; new Function('document', 'window', 'disarmPlacement', 'toast', plSrc)({ addEventListener: (t, f) => { h = f; } }, { wpEsc: freeAs(v), wpPlace: { type: 'text' } }, () => { n++; }, () => {}); h({ key: 'Escape' }); return n; };
        const freeRuns = [dRun(false), dRun(true), dRun(undefined), pRun(false), pRun(true), pRun(undefined), tRun(false), tRun(true), tRun(undefined), tRun(true, { tagName: 'INPUT' }), tRun(true, { tagName: 'DIV', isContentEditable: true }),
            bRun(false), bRun(true), bRun(undefined), plRun(false), plRun(true), plRun(undefined)];
        // with nothing armed, a free Escape puts the tool in hand away (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)": the
        // first Escape closes a tool's options, the next puts the tool away), by Select's own press, never from a field, never Build's (buildKey)
        const tlRun = (v, active, tgt, armed) => { let h = null, n = 0; const W = { wpEsc: freeAs(v) };
            const btn = id => ({ id, classList: { contains: c => c === 'active' && id === active }, click: () => { if (id === 'moveModeBtn') n++; } });
            new Function('document', 'window', 'var _armedThrow = null, _fxArm = ' + (armed ? '{ look: "boom" }' : 'null') + ';\n' + bSrc)({ addEventListener: (t, f) => { h = f; }, body: { classList: { remove() {} } }, getElementById: btn }, W);
            h({ key: 'Escape', target: tgt === undefined ? { tagName: 'DIV' } : tgt }); return n; };
        const toolAway = [tlRun(true, 'drawModeBtn'), tlRun(true, 'eraserModeBtn'), tlRun(true, 'fillModeBtn'), tlRun(true, 'measureModeBtn'), tlRun(true, 'blastModeBtn'), tlRun(true, 'fogModeBtn'), tlRun(true, 'panModeBtn'),
            tlRun(true, 'moveModeBtn'), tlRun(true, 'buildModeBtn'), tlRun(false, 'drawModeBtn'), tlRun(true, 'drawModeBtn', { tagName: 'INPUT' }), tlRun(true, 'drawModeBtn', { tagName: 'DIV', isContentEditable: true }), tlRun(undefined, 'drawModeBtn'), tlRun(true, 'drawModeBtn', null, true)];
        check('with nothing open and nothing armed, Escape puts the tool in hand away (the throw\'s listener, run for real; the owner, 2026-10-17, by prompt: "Close the options first (Recommended)": the first Escape closes the options and the tool stays in hand, the next puts the tool away): the pen, the eraser, the fill, the ruler, the Radius tool, the fog brush and the hand each by Select\'s own press, once; Select itself and Build (its own key) nothing; an Escape that closed something else, or pressed in a field, nothing; with no router as before; an armed throw or burst put down first, by the one press',
            J(toolAway) === J([1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1]), J(toolAway));
        // a burst armed from the effects panel is put down with a sheet's Throw, whenever a tool is taken
        const dtLine = lineOf(wb, '  function disarmThrow() {');
        const dt = (() => { let n = 0; const W = { wpDisarmFxBurst: () => { n++; return true; } }; new Function('window', 'document', 'var _armedThrow = { x: 1 };\n' + dtLine + '\ndisarmThrow(); return _armedThrow;')(W, { body: { classList: { remove() {} } } }); const none = new Function('window', 'document', 'var _armedThrow = null;\n' + dtLine + '\ndisarmThrow(); return 1;')({}, {}); return [n, none]; })();
        check('the map\'s own uses of Escape and every closer of a thing on an Escape it does not own act only on a free press (run for real): the dice roller\'s, the page panel\'s, the target pointer\'s (never from a field, whose key it is), an armed throw\'s or burst\'s and a placement\'s; with no router, as a module run alone, each acts as before; and a burst armed from the effects panel is put down whenever a tool is taken, as a sheet\'s Throw is, so a later Escape never puts away the tool taken since',
            J(freeRuns) === J([0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, [0, true], [1, false], [1, false], 0, 1, 1]) && J(dt) === J([1, 1]), J([freeRuns, dt]));
        check('the closers the router stands in for ask it too, pinned: Build\'s Escape, the left panel\'s (which the router folds by its away), the Characters menu\'s, a section\'s actions, the party\'s menu, the library\'s categories, a selection\'s colours; none of them closes on an Escape that closed something else',
            wb.includes("function buildKey(e) {\n    if (!window.isBuildMode || e.defaultPrevented) return;\n    if (e.key === 'Escape' && window.wpEsc && !window.wpEsc.free(e)) return;")
            && lr.includes("    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && st.mode === 'open' && " + G + ") act({ t: 'away' }); });") && lr.includes(", away: function() { return act({ t: 'away' }); } };\n")
            && cl.includes("if (e.key === 'Escape' && " + G + ") menuAway(); });") && sb.includes("if (e.key === 'Escape' && " + G + ") hideSectionActions(); });")
            && wb.includes("if (e.key === 'Escape' && " + G + ") closePartyMenu(); });") && wb.includes("if (e.key === 'Escape' && " + G + ") hideImgCatMenu(); });") && wb.includes("if (e.key === 'Escape' && pop && !pop.hidden && " + G + ") pop.hidden = true;")
            && count(wb, 'wpEsc') === 14);
    }
    // 9. the page loads it once, before the modules that hear Escape at the window after it (Save Map as Picture, the token creator)
    {
        const names = (ix.match(/<script type="module" src="scripts\/[a-z]+\.js"><\/script>/g) || []).map(s => s.replace(/^.*scripts\/|\.js.*$/g, ''));
        check('the page loads the router once, as a module, after the modules whose own Escape it must stand aside for are wired before it (the generators\' dialogs in whiteboard.js, by main.js) and before the ones it stands aside for after it (the token creator, Save Map as Picture); it publishes free and judge; it writes no markup',
            count(ix, 'scripts/esckey.js') === 1 && names.indexOf('esckey') > names.indexOf('main') && names.indexOf('esckey') < names.indexOf('framer') && names.indexOf('esckey') < names.indexOf('mapshot')
            && ix.includes('<script type="module" src="scripts/syskey.js"></script>\n<script type="module" src="scripts/esckey.js"></script>\n<script type="module" src="scripts/net.js"></script>\n')
            && ek.includes("    window.addEventListener('keydown', escDown, true);\n    window.addEventListener('keydown', escBack);\n    window.wpEsc = { free: escFree, judge:")
            && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(ek) && !/[^\x00-\x7f]/.test(ek));
    }
    // 10. said
    {
        const wn = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')].map(t => t.replace(/\r\n/g, '\n'));
        const N1 = "- Escape closes the one thing on top, one press at a time. A\n  right-click menu goes first, then an open menu, then the window on\n  top. Help, Settings, Multiplayer, the calendar, the Journal, the\n  combat roster and the other windows now close on Escape, and so\n  does the map's right-click menu. Nothing behind it hears the key:\n  your target and the tool in your hand stay as they are until\n  nothing else is open, and the dice roller no longer closes along\n  with what Escape was pressed for.\n"
            + "- A tool's options are an open menu too. The first Escape closes them\n  and the tool stays in your hand. The next Escape puts the tool away.\n"
            + "- Table Chat, the table notepad, Sound and Music close on Escape when\n  one of them is the box you used last. Chat keeps its messages. The\n  notepad keeps its words and goes from your screen only. It comes\n  back when its words change, and the GM brings it back with the\n  Table Notepad button.\n"
            + "- Escape ends typing in a text box on the map and keeps your words.\n- An effects burst you armed and did not place is put down when you\n  take another tool. A later Escape used to put that tool away.\n";
        const N2 = "- The offer to start combat when a player targets one of your\n  characters takes only its buttons. An Escape pressed for something\n  else answered it No, and it was not asked again that session. The\n  question a player is asked when a table answers that is not their\n  GM's takes only its buttons too.\n";
        const start = ix.slice(ix.indexOf('<div class="help-pane" data-pane="start">'), ix.indexOf('<div class="help-pane" data-pane="tutorial"'));
        check('Help says what Escape does, in plain words: under Getting around fast, one thing on top a press, which goes first, a box\'s own Escape, a question that takes only its buttons, a tool\'s options before the tool and Table Chat, the notepad, Sound and Music when used last (the owner\'s answers of 2026-10-17), and what it does with nothing open; in the keys; on a text box of the map; on the target, while nothing else is open; and on the notepad, put away on your own screen with its words; both release notes alike',
            start.includes('<li><b>Escape</b> closes the one thing on top, one press at a time.\n') && start.includes('<li>A right-click menu goes first, then an open menu, then the window on top. Nothing behind it hears the key.</li>')
            && start.includes('<li>A box you type in keeps its own <kbd>Esc</kbd> first. A search that holds words is cleared, and a text bar goes away.</li>') && start.includes('<li>A question waits for its answer. Some questions take only their buttons, so <kbd>Esc</kbd> leaves them up.</li>')
            && start.includes('<li>A tool&rsquo;s options are an open menu too. The first <kbd>Esc</kbd> closes them, and the tool stays in your hand.</li>')
            && start.includes('<li>Table Chat, the notepad, Sound and Music close when one of them is the box you used last. Chat keeps its messages.</li>')
            && ix.includes('<li><kbd>Esc</kbd> puts the notepad away on your own screen when you used it last. Its words stay. It comes back when its words change, and the GM brings it back with <b>Table Notepad</b>.</li>')
            && start.includes('<li>With nothing open, <kbd>Esc</kbd> puts the tool in your hand away, ends a placement and clears your target.</li>') && count(ix, '<b>Escape</b> closes the one thing on top') === 1
            && ix.includes('<li><kbd>Esc</kbd> &nbsp; Close the one thing on top: a right-click menu, then an open menu, then a window. With nothing open, it puts the tool in your hand away and clears your target.</li>')
            && ix.includes('<li><kbd>Esc</kbd> ends typing in a box on the canvas, as a click elsewhere does. Your words are kept.</li>') && ix.includes('press <b>T</b> again, or press <b>Esc</b> while nothing else is open.</li>')
            && wn.every(t => count(t, N1) === 1 && count(t, N2) === 1));
    }
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
    const OPEN_NOTE = "- A sheet, a HUD, the page panel, the notepad, Table Chat and the Sound,\n  Music, Video and Visual effects panels open clear of the toolbar, the\n  View, Grid and Snap buttons at the map's edge and the turn strip. A\n  HUD opened over whose turn it is, and a sheet over the View, Grid and\n  Snap buttons. Where the room is short a box opens shorter. A box you\n  moved still opens where you left it.\n"
        + "- A player's handbook page opens beside the left rail and ends above\n  the toolbar, and in a fight it stands under the turn strip. It\n  covered the rail, half the toolbar and half the strip.\n";
    const pl0 = ix.indexOf('<div class="help-pane" data-pane="mp-player"'), player = pl0 > 0 ? ix.slice(pl0, ix.indexOf('<div class="help-pane"', pl0 + 10)) : '';
    check('where a box opens is said (the owner, 2026-10-17: "open clear"): Help\'s Floating boxes says a box opens clear of the toolbar, the View, Grid and Snap buttons and the turn strip, shorter where the room is short, and that one you moved opens where you left it, and that the toolbar stays over the boxes but for a box pressed while a tool\'s options are up; Help for players says the reader leaves the rail and the toolbar in sight and stands under the strip in a fight; both release notes carry the lines, alike, under 1.5.4',
        start.includes('<li>A box opens clear of the play map&rsquo;s toolbar, the View, Grid and Snap buttons at its edge and the turn strip. Where the room is short it opens shorter. A box you moved opens where you left it.</li>')
        && start.includes('<li>The toolbar stays over the boxes. While a tool&rsquo;s options are up, press a box and it comes over the toolbar and the options. One press on the tool brings them back.</li>')
        && player.includes(' The panel leaves the left rail and the toolbar in sight, and in a fight it stands under the turn strip. ') && wn.every(t => count(t, OPEN_NOTE) === 1 && t.indexOf(OPEN_NOTE) < t.indexOf('WAYPOINT 1.5.3')));
    check('both release notes carry the two lines, alike, and the suite is one of those CI runs',
        wn.every(t => count(t, NOTE) === 1) && fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').replace(/\r\n/g, '\n').includes('        if: ${{ !cancelled() }}\n        run: node tools/floatcheck.js\n'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
