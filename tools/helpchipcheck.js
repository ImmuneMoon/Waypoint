// helpchipcheck — Help shows the real buttons (1.6.2, backlog 142; the owner, 2026-10-16: "A chip that finds it", "Every button and menu row";
// 2026-11-04: a control in a closed window "Open it and light it up", one this screen does not have "Drawn, says why", "The System editor first").
// helpchips.js sliced by its helpchipcheck markers and run for real on a small page of plain objects of the suite's own (it copies a control whole,
// which tools/boxdom.js refuses); every mark Help carries held to a control the page has; the script, the styles, Help's words, both notes and CI.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 700))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
// ---- a small page: elements with ids, classes, data, attributes, a style, listeners and clicks; selectors of tags, #ids, .classes and [attr] / [attr="v"],
// joined by spaces as descendants, and a comma between two selectors
function El(tag, o) {
    o = o || {}; this.tagName = tag.toUpperCase(); this.id = o.id || ''; this.className = o.cls || ''; this.dataset = Object.assign({}, o.data || {}); this.attrs = Object.assign({}, o.attrs || {});
    this.style = Object.assign({}, o.style || {}); this.hidden = !!o.hidden; this.kids = []; this.parentNode = null; this.text = o.text || ''; this.on = {}; this.clicks = 0; this.onclick = o.onclick || null; this.scrolled = 0;
    const self = this; this.classList = { contains: c => self.className.split(/\s+/).indexOf(c) >= 0, add: c => { if (!self.classList.contains(c)) self.className = (self.className + ' ' + c).trim(); }, remove: c => { self.className = self.className.split(/\s+/).filter(x => x && x !== c).join(' '); }, toggle: (c, on) => { if (on) self.classList.add(c); else self.classList.remove(c); } };
}
El.prototype.appendChild = function(c) { if (c.parentNode) c.parentNode.kids.splice(c.parentNode.kids.indexOf(c), 1); c.parentNode = this; this.kids.push(c); return c; };
Object.defineProperty(El.prototype, 'textContent', { get() { return this.kids.length ? this.kids.map(k => k.textContent).join('') : this.text; }, set(v) { this.kids.forEach(k => { k.parentNode = null; }); this.kids = []; this.text = String(v); } });
Object.defineProperty(El.prototype, 'children', { get() { return this.kids; } });
Object.defineProperty(El.prototype, 'offsetParent', { get() { for (let n = this; n; n = n.parentNode) if (n.style && n.style.display === 'none') return null; return {}; } });
El.prototype.setAttribute = function(k, v) { if (k === 'id') this.id = String(v); else this.attrs[k] = String(v); };
El.prototype.getAttribute = function(k) { return k === 'id' ? (this.id || null) : Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : (k.indexOf('data-') === 0 && this.dataset[k.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] !== undefined ? this.dataset[k.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] : null); };
El.prototype.removeAttribute = function(k) { if (k === 'id') this.id = ''; else if (k === 'title') { delete this.attrs.title; } else if (k === 'disabled') { delete this.attrs.disabled; } else if (k === 'data-tip') delete this.dataset.tip; else delete this.attrs[k]; };
El.prototype.all = function() { return [this].concat(...this.kids.map(k => k.all())); };
El.prototype.contains = function(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; };
El.prototype.cloneNode = function() { const c = new El(this.tagName, { id: this.id, cls: this.className, data: this.dataset, attrs: this.attrs, style: this.style, text: this.text }); this.kids.forEach(k => c.appendChild(k.cloneNode(true))); return c; };
El.prototype.addEventListener = function(t, f) { (this.on[t] = this.on[t] || []).push(f); };
El.prototype.click = function() { this.clicks++; if (this.onclick) this.onclick(); };
El.prototype.scrollIntoView = function() { this.scrolled++; };
const one = (el, s) => { const m = /^([a-z]*)((?:[#.][\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i.exec(s); if (!m) throw new Error('selector ' + s); if (m[1] && el.tagName !== m[1].toUpperCase()) return false; return (m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || []).every(p => { if (p[0] === '#') return el.id === p.slice(1); if (p[0] === '.') return el.classList.contains(p.slice(1)); const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(p); const v = el.getAttribute(a[1]); return a[2] === undefined ? v !== null && v !== undefined : v === a[2]; }); };
const matches = (el, sel, top) => { const parts = sel.trim().split(/\s+/); if (!one(el, parts[parts.length - 1])) return false; let n = el.parentNode; for (let i = parts.length - 2; i >= 0; i--) { while (n && n !== top.parentNode && !one(n, parts[i])) n = n.parentNode; if (!n || n === top.parentNode) return false; n = n.parentNode; } return true; };
El.prototype.querySelectorAll = function(sel) { const ss = sel.split(','); return this.all().slice(1).filter(e => ss.some(s => matches(e, s, this))); };
El.prototype.querySelector = function(sel) { return this.querySelectorAll(sel)[0] || null; };
El.prototype.closest = function(sel) { for (let n = this; n; n = n.parentNode) if (n.tagName && one(n, sel)) return n; return null; };
const mk = (tag, o, kids) => { const e = new El(tag, o); (kids || []).forEach(k => e.appendChild(k)); return e; };
function page(opts) {
    opts = opts || {};
    const sys = mk('div', { id: 'systemModal', style: { display: 'none' } }, [
        mk('div', { cls: 'sys-tabs' }, ['fields', 'rules', 'chars'].map(t => mk('button', { data: { tab: t }, cls: t === 'fields' ? 'active' : '', text: { fields: 'Fields', rules: 'Rules', chars: 'Characters' }[t], attrs: { title: 'A tab' } }))),
        mk('div', { id: 'sysFields', cls: 'sys-tab' }, [mk('div', { cls: 'sys-toolbar' }, [mk('button', { id: 'sysAddField', cls: 'tool', text: '+ Field', attrs: { title: 'Add a field' } }), mk('button', { cls: 'tool ghost sys-key-btn', text: 'What the ticks mean' })])]),
        mk('div', { id: 'sysRules', cls: 'sys-tab', style: { display: 'none' } }, [mk('button', { cls: 'tool', id: 'sysInner', data: { tip: 'x' } }, [mk('i', { id: 'deep', cls: 'wib wi-cog' }), mk('span', { text: 'Inner' })])]),
        mk('button', { id: 'sysSaveBtn', cls: 'tool', text: 'Save', attrs: { disabled: '' } })]);
    const opener = mk('button', { id: 'systemBtn', style: { display: opts.gm === false ? 'none' : '' } });
    opener.onclick = () => { sys.style.display = 'flex'; };
    sys.querySelectorAll('.sys-tabs button').forEach(b => { b.onclick = () => { sys.querySelectorAll('.sys-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });
    const pane = mk('div', { cls: 'help-pane', data: { pane: 'sheets' }, style: { display: 'block' } }, [
        mk('b', { attrs: { 'data-ctl': 'sys-tab:rules' }, text: 'Rules' }), mk('b', { attrs: { 'data-ctl': '#sysSaveBtn' }, text: 'Save' }), mk('b', { attrs: { 'data-ctl': 'sys:fields:sys-key-btn' }, text: 'What the ticks mean' }),
        mk('b', { attrs: { 'data-ctl': '#gone' }, text: 'Gone' }), mk('b', { attrs: { 'data-ctl': '#sysInner' }, text: 'Inner' })]);
    const helpBody = mk('div', { cls: 'help-body' }, [pane]); helpBody.scrollTop = 120;
    const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [helpBody]);
    const body = mk('body', {}, [opener, sys, help]);
    const doc = { body, getElementById: id => body.all().find(n => n.id === id) || null, querySelectorAll: s => body.querySelectorAll(s), querySelector: s => body.querySelector(s), createElement: t => new El(t) };
    return { doc, sys, help, pane, opener };
}
const src = read('scripts/helpchips.js'), cut = (a, b) => src.slice(src.indexOf('// [helpchipcheck:' + a + '-start]'), src.indexOf('// [helpchipcheck:' + b + '-end]'));
const timers = [], opened = [], winA = { wpOpenHelp: p => opened.push(p) };
const api = new Function('window', 'setTimeout', 'MutationObserver', cut('core', 'wire') + '\nreturn { chipFind, chipReach, chipCopy, chipsDraw, chipGo, chipBack, chipMenus, chipStand, chipsName, chipWords, chipBarOpener, chipShut, CHIP_NAMES, CHIP_KEY, CHIP_TAB_IDS, chipIn, chipReachIn, chipStandIn, CHIP_STANDS, CHIP_WINDOWS };')(winA, (f, ms) => { timers.push([f, ms]); return timers.length; }, undefined);
// ---- the core
const P = page(), d = P.doc;
const fTab = api.chipFind(d, 'sys-tab:rules'), fSave = api.chipFind(d, '#sysSaveBtn'), fKey = api.chipFind(d, 'sys:fields:sys-key-btn');
check('a key names a tab of the System editor, a control by its id, or the first control of a class inside a tab, and the window that holds it',
    fTab && fTab.el.dataset.tab === 'rules' && fTab.win === 'systemModal' && fSave && fSave.el.id === 'sysSaveBtn' && fSave.win === 'systemModal' && fKey && fKey.el.classList.contains('sys-key-btn') && fKey.win === 'systemModal');
check('a key that is no key, or names nothing in the page, finds nothing', ['#gone', 'sys-tab:nope', 'sys:nope:x', '#1x', 'javascript:x', '#a b', 'sys:fields:Bad', '', 5, null].every(k => api.chipFind(d, k) === null) && !api.CHIP_KEY.test('sys-tab:rules ') && api.CHIP_KEY.test('sys:fields:sys-key-btn'));
check('a control in a window this screen can open is in reach; on a player’s screen, where the System editor’s button is put away, it is the GM’s', api.chipReach(d, fTab) === '' && api.chipReach(page({ gm: false }).doc, api.chipFind(page({ gm: false }).doc, '#sysSaveBtn')) === 'The GM’s' && api.chipReach(d, null) === 'Not on this screen');
const cp = api.chipCopy(d, P.doc.getElementById('sysInner')), cpb = cp.kids[0];
check('a chip’s copy is the control as it looks, made inert: no id, tooltip, disabled mark or id inside it, no focus of its own, hidden from a screen reader, inside the classes of the control’s parent',
    cp.classList.contains('help-chip-in') && cp.classList.contains('sys-tab') && cpb.tagName === 'BUTTON' && cpb.id === '' && cpb.dataset.tip === undefined && cpb.getAttribute('tabindex') === '-1' && cpb.getAttribute('aria-hidden') === 'true' && cpb.kids[0].id === '' && cpb.kids[0].classList.contains('wi-cog') && cpb.textContent === 'Inner'
    && api.chipCopy(d, d.getElementById('sysSaveBtn')).kids[0].getAttribute('disabled') === null);
// ---- drawn as Help opens
const n = api.chipsDraw(d), chips = P.help.querySelectorAll('.help-chip');
check('Help draws a chip for each mark whose control is in the page, and leaves the bold words where it is not', n === 4 && chips.length === 4 && P.pane.kids[3].textContent === 'Gone' && P.pane.kids[3].querySelector('.help-chip') === null && chips[0].getAttribute('role') === 'button' && chips[0].getAttribute('tabindex') === '0' && chips[0].dataset.tip === 'Show me Rules.' && chips[0].getAttribute('aria-label') === 'Rules', J(chips.map(c => [c.dataset.ctl, c.dataset.tip])));
check('drawn again, a chip is made again in place, never a second one', api.chipsDraw(d) === 4 && P.help.querySelectorAll('.help-chip').length === 4 && P.pane.kids[0].kids.length === 1);
const G = page({ gm: false }); api.chipsDraw(G.doc); const gc = G.help.querySelectorAll('.help-chip');
check('on a player’s screen the chip is drawn greyed, takes no focus and says why', gc.length === 4 && gc.every(c => c.classList.contains('help-chip-off') && c.getAttribute('tabindex') === '-1' && c.getAttribute('aria-disabled') === 'true') && gc[1].dataset.tip === 'Save. The GM’s.');
// ---- pressed
const go1 = api.chipGo(d, 'sys-tab:rules');
check('pressed, Help steps aside, the window opens by its own button, the tab is pressed, the control is brought into view and lit, and Back to Help is shown',
    go1 === true && P.help.style.display === 'none' && P.opener.clicks === 1 && P.sys.style.display === 'flex' && fTab.el.classList.contains('active') && fTab.el.scrolled === 1 && fTab.el.classList.contains('help-found') && d.getElementById('helpBackBtn') && d.getElementById('helpBackBtn').hidden === false && timers.some(t => t[1] === 2000));
timers.filter(t => t[1] === 2000).forEach(t => t[0]());
check('the light goes out after two seconds', !fTab.el.classList.contains('help-found'));
const P2 = page(), d2 = P2.doc; const inner = d2.getElementById('sysInner'); api.chipGo(d2, '#sysInner');
const rulesTab = P2.sys.querySelectorAll('.sys-tabs button').find(b => b.dataset.tab === 'rules');
check('a control inside a tab opens that tab first', rulesTab.classList.contains('active') && inner.classList.contains('help-found'));
api.chipGo(d2, '#sysSaveBtn');
check('a window already open is not opened again', P2.opener.clicks === 1);
check('a chip this screen cannot reach does nothing when pressed', api.chipGo(G.doc, '#sysSaveBtn') === false && G.help.style.display === 'flex');
api.chipBack(d);
check('Back to Help opens Help again on the part it was left on, over the window the chip opened, and goes away', J(opened) === J(['sheets']) && P.help.classList.contains('help-over') && d.getElementById('helpBackBtn').hidden === true);
// ---- fold 2: the top row and its menus
function rowPage(opts) {
    opts = opts || {};
    const more = mk('button', { id: 'moreMenuBtn', attrs: { 'aria-controls': 'moreMenu', title: 'More. Export As, Import.' } }, [mk('i', { cls: 'wib wi-dots' })]);
    const imp = mk('button', { id: 'importBtn', cls: 'rm-row', text: 'Import' }), saveAs = mk('button', { id: 'saveAsBtn', cls: 'rm-row', text: 'Export As' }), pic = mk('button', { id: 'exportMapPicBtn', cls: 'menu-item', text: 'Save map as picture' });
    const kinds = mk('div', { id: 'saveAsMenu', style: { display: 'none' } }, [pic]), menu = mk('div', { id: 'moreMenu', cls: 'row-menu', hidden: true }, [imp, saveAs, kinds]);
    more.onclick = () => { menu.hidden = false; }; saveAs.onclick = () => { kinds.style.display = 'block'; };
    const gm = mk('button', { id: 'gmOnly', cls: 'gm-only', text: 'Snapshot' }), fold = mk('button', { id: 'soundInd', cls: 'row-fold', attrs: { title: 'Sound effects.' } });
    const trayBtn = mk('button', { id: 'rowTrayBtn', attrs: { 'aria-controls': 'rowTray' } }), stand = mk('button', { attrs: { 'data-press': 'soundInd' }, text: 'Sound effects' }), tray = mk('div', { id: 'rowTray', cls: 'row-menu', hidden: true }, [stand]);
    trayBtn.onclick = () => { tray.hidden = false; };
    const header = mk('header', {}, [more, menu, gm, fold, trayBtn, tray]);
    const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'start' }, style: { display: 'block' } }, [mk('b', { attrs: { 'data-ctl': '#exportMapPicBtn' }, text: 'Save map as picture' }), mk('b', { attrs: { 'data-ctl': '#moreMenuBtn' }, text: 'More' }), mk('b', { attrs: { 'data-ctl': '#gmOnly' }, text: 'Snapshot' })])])]);
    const body = mk('body', { cls: opts.player ? 'net-client' : '' }, [header, help]);
    return { doc: { body, getElementById: id => body.all().find(n => n.id === id) || null, querySelectorAll: s => body.querySelectorAll(s), querySelector: s => body.querySelector(s), createElement: tg => new El(tg) }, more, menu, kinds, pic, saveAs, gm, fold, stand, tray, trayBtn, help };
}
{
    const T = rowPage(), ch = api.chipMenus(T.doc, T.pic);
    check('fold 2: a control in a menu of the row is reached through every menu that holds it, outermost first, each by the button that opens it; one the row folded into the tray stands there by its own button',
        ch.length === 2 && ch[0].box === T.menu && ch[0].open === T.more && ch[1].box === T.kinds && ch[1].open === T.saveAs && api.chipStand(T.doc, T.fold) === T.stand && api.chipStand(T.doc, T.pic) === T.pic && api.chipMenus(T.doc, T.stand)[0].open === T.trayBtn);
    timers.length = 0; const g = api.chipGo(T.doc, '#exportMapPicBtn'); const before = T.menu.hidden === true && T.kinds.style.display === 'none'; timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('pressed, Help steps aside and, a moment after, More and then Export As\u2019s list are opened and the control is brought into view and lit; Back to Help is shown',
        g === true && before && T.help.style.display === 'none' && T.menu.hidden === false && T.kinds.style.display === 'block' && T.pic.classList.contains('help-found') && T.pic.scrolled === 1 && T.doc.getElementById('helpBackBtn').hidden === false);
    timers.length = 0; api.chipGo(T.doc, '#soundInd'); timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('a control the row folded away is shown by opening the tray and lighting its button there', T.tray.hidden === false && T.stand.classList.contains('help-found') && !T.fold.classList.contains('help-found'));
    const n2 = api.chipsDraw(T.doc), cs = T.help.querySelectorAll('.help-chip');
    check('a chip says itself in Help\u2019s own words, the menu row\u2019s other words left out; a control of the GM\u2019s is in reach for the GM', n2 === 3 && cs[1].dataset.tip === 'Show me More.' && !cs[2].classList.contains('help-chip-off'), JSON.stringify(cs.map(c => c.dataset.tip)));
    const Tp = rowPage({ player: true }); api.chipsDraw(Tp.doc); const cp = Tp.help.querySelectorAll('.help-chip');
    check('on a player\u2019s app a control of the GM\u2019s is drawn greyed and says so', cp[2].classList.contains('help-chip-off') && cp[2].dataset.tip === 'Snapshot. The GM\u2019s.' && !cp[0].classList.contains('help-chip-off'), JSON.stringify(cp.map(c => c.dataset.tip)));
}
{
    const W = rowPage(); W.saveAs.appendChild(mk('span', { text: '13 kinds' })); W.help.querySelectorAll('b')[0].textContent = 'Restore points\u2026'; W.help.querySelectorAll('b')[0].setAttribute('data-ctl', '#saveAsBtn');
    api.chipsDraw(W.doc); api.chipsDraw(W.doc); const cw = W.help.querySelectorAll('.help-chip');
    check('drawn twice, a chip still says Help\u2019s own words, with no stop doubled', cw[0].dataset.tip === 'Show me Restore points.' && cw[0].getAttribute('aria-label') === 'Restore points', JSON.stringify(cw.map(c => c.dataset.tip)));
    const cssW = read('style.css');
    check('a menu row copied into a chip keeps the menu\u2019s look', cssW.includes('.help-chip-in > .menu-item, .help-chip-in > .rm-row { display: inline-flex !important;'));
}
// ---- fold 3: Settings, your profile and Multiplayer, windows with no tabs
{
    const det = mk('details', { cls: 'set-group' }, [mk('summary', { text: 'Advanced' }), mk('button', { id: 'setKeysResetBtn', cls: 'tool ghost', text: 'Restore default keys' })]); det.open = false;
    const set = mk('div', { id: 'settingsModal', style: { display: 'none' } }, [det]), setOp = mk('button', { id: 'settingsBtn' }); setOp.onclick = () => { set.style.display = 'flex'; };
    const joinBtn = mk('button', { id: 'netJoinBtn', cls: 'tool', text: 'Join' }), paneJ = mk('div', { id: 'netPaneJoin', style: { display: 'none' } }, [joinBtn]), paneBtn = mk('button', { id: 'netPaneJoinBtn', attrs: { 'aria-controls': 'netPaneJoin' }, text: 'Join a table' });
    paneBtn.onclick = () => { paneJ.style.display = 'block'; };
    const pause = mk('button', { id: 'netPauseBtn', cls: 'tool', text: 'Pause the table' }), info = mk('div', { id: 'netHostInfo', style: { display: 'none' } }, [pause]), paneH = mk('div', { id: 'netPaneHost', style: { display: 'none' } }, [info]);
    const net = mk('div', { id: 'netModal', style: { display: 'none' } }, [paneBtn, paneJ, paneH]), netOp = mk('button', { id: 'netBtn' }); netOp.onclick = () => { net.style.display = 'flex'; };
    const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'start' }, style: { display: 'block' } }, [mk('b', { attrs: { 'data-ctl': '#setKeysResetBtn' }, text: 'Restore default keys' }), mk('b', { attrs: { 'data-ctl': '#netJoinBtn' }, text: 'Join' }), mk('b', { attrs: { 'data-ctl': '#netPauseBtn' }, text: 'Pause the table' }), mk('button', { cls: 'tool', attrs: { 'aria-controls': 'netPaneJoin' }, text: 'a copy' })])])]);
    const body = mk('body', {}, [help, setOp, set, netOp, net]), doc = { body, getElementById: id => body.all().find(n => n.id === id) || null, querySelectorAll: s => body.querySelectorAll(s), querySelector: s => body.querySelector(s), createElement: tg => new El(tg) };
    const fK = api.chipFind(doc, '#setKeysResetBtn'), fJ = api.chipFind(doc, '#netJoinBtn'), fP = api.chipFind(doc, '#netPauseBtn');
    check('fold 3: a control of Settings or Multiplayer names its window; one in a part a button of the window opens is in reach, and one in a part shown only at times says when', fK.win === 'settingsModal' && fJ.win === 'netModal' && api.chipReach(doc, fK) === '' && api.chipReach(doc, fJ) === '' && api.chipReach(doc, fP) === 'While you host', J([fK.win, fJ.win, api.chipReach(doc, fP)]));
    api.chipsDraw(doc); const cs3 = help.querySelectorAll('.help-chip');
    check('a chip of a control shown only at times is drawn greyed and says why', cs3[2].classList.contains('help-chip-off') && cs3[2].dataset.tip === 'Pause the table. While you host.' && !cs3[0].classList.contains('help-chip-off'), J(cs3.map(c => c.dataset.tip)));
    timers.length = 0; const gK = api.chipGo(doc, '#setKeysResetBtn'); const openNow = set.style.display === 'flex' && det.open === false; timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('pressed, Settings opens at once, and a moment after its group unfolds and the control is brought into view and lit', gK === true && openNow && det.open === true && fK.el.classList.contains('help-found') && fK.el.scrolled === 1);
    timers.length = 0; const gJ = api.chipGo(doc, '#netJoinBtn'); timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('in Multiplayer the part that holds it is opened by its own button, never a copy of it that stands in Help before the window, and the control lit', gJ === true && net.style.display === 'flex' && paneJ.style.display === 'block' && joinBtn.classList.contains('help-found') && paneBtn.clicks === 1);
    const cpy = api.chipCopy(doc, paneBtn).kids[0];
    check('a copy of a button that opens a part names no part', cpy.getAttribute('aria-controls') == null && cpy.getAttribute('aria-expanded') == null, J(cpy.attrs));
    check('a control shown only at times is not pressed open', api.chipGo(doc, '#netPauseBtn') === false);
}
// ---- every mark Help carries names a control the page has
const html = read('index.html'), marks = [...html.matchAll(/<b data-ctl="([^"]+)">/g)].map(m => m[1]);
const bad = marks.filter(k => { if (!api.CHIP_KEY.test(k)) return true; if (k[0] === '#') return html.split('id="' + k.slice(1) + '"').length !== 2; if (k.indexOf('sys-tab:') === 0) return !html.includes('<button data-tab="' + k.slice(8) + '"'); const p = k.split(':'), tid = Object.keys(api.CHIP_TAB_IDS).find(x => api.CHIP_TAB_IDS[x] === p[1]); if (!tid) return true; const at = html.indexOf('id="' + tid + '"'), end = html.indexOf('<div id="sys', at + 10); return at < 0 || html.slice(at, end > 0 ? end : undefined).indexOf(p[2]) < 0; });
check('every mark Help carries is a key of the chips’ own form, and names a button or a tab the page has: the System editor’s 25 first', marks.length >= 25 && bad.length === 0, J([marks.length, bad]));
{   // fold 4: a row of a tool's options on the map's toolbars, opened by the tool's own small arrow, and what a chip says where the toolbar or its row does not show
    const mkBar = (o) => {
        const tool = mk('button', { id: 'fogModeBtn', cls: 'wb-tool-btn', style: o.toolOff ? { display: 'none' } : {} }), chev = mk('button', { id: 'fogOptBtn', cls: 'wb-tool-btn tool-chev' });
        const fold = mk('button', { id: 'fogFoldLight', cls: 'menu-fold', attrs: { 'aria-controls': 'fogLightVision' } }), body = mk('div', { id: 'fogLightVision', cls: 'menu-fold-body', hidden: true }, [mk('button', { id: 'fogLightPlace', cls: 'draw-style-btn', text: 'Light source' })]);
        const ask = mk('button', { id: 'drawShowAsk', cls: 'draw-style-btn', text: 'Ask to put them on the map', hidden: true });
        const menu = mk('div', { id: 'fogMenu', cls: 'shape-menu draw-menu' }, [mk('button', { id: 'fogRevealAll', cls: 'draw-style-btn', text: 'Reveal all' }), fold, body, ask]);
        const pair = mk('div', { cls: 'tool-pair' + (o.gm ? ' gm-only' : '') }, [tool, chev, menu]), pair2 = mk('div', { cls: 'tool-pair' }, [mk('button', { id: 'wbCenterBtn', cls: 'wb-tool-btn' }), mk('div', { id: 'wbCenterMenu', cls: 'shape-menu' }, [mk('button', { id: 'wbFitBtn', cls: 'wb-tool-btn view-row', text: 'Fit to content' })])]);
        const bar = mk('div', { id: 'wbFloatingToolbar', cls: 'floating-toolbar', style: o.barOff ? { display: 'none' } : {} }, [pair, pair2]);
        chev.onclick = () => { menu.classList.add('show'); }; fold.onclick = () => { body.hidden = false; };
        const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'whiteboard' }, style: { display: 'block' } }, [])])]);
        const bodyE = mk('body', { cls: o.player ? 'net-client' : '' }, [bar, help]);
        return { doc: { body: bodyE, getElementById: id => bodyE.all().find(n => n.id === id) || null, querySelectorAll: q => bodyE.querySelectorAll(q), querySelector: q => bodyE.querySelector(q), createElement: t => new El(t) }, menu, chev, body, help };
    };
    const B = mkBar({}), fR = api.chipFind(B.doc, '#fogRevealAll'), fL = api.chipFind(B.doc, '#fogLightPlace');
    check('a tool\u2019s options open by the small arrow beside the tool, and a menu that only opens by its button by that button; a menu of the toolbar is shut until it shows',
        api.chipBarOpener(B.menu) === B.chev && api.chipBarOpener(B.doc.getElementById('wbCenterMenu')) === B.doc.getElementById('wbCenterBtn') && api.chipBarOpener(B.body) === null && api.chipShut(B.menu) === true && (B.menu.classList.add('show'), api.chipShut(B.menu)) === false);
    B.menu.classList.remove('show');
    check('a row inside a fold of the options is reached through the arrow and then the fold, outermost first', J(api.chipMenus(B.doc, fL.el).map(m => m.open.id)) === J(['fogOptBtn', 'fogFoldLight']) && fR.win === null && api.chipReach(B.doc, fR) === '' && api.chipReach(B.doc, fL) === '');
    timers.length = 0; const gB = api.chipGo(B.doc, '#fogLightPlace'); timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('pressed, Help steps aside, the options open by their arrow and the fold by its button, and the row is lit', gB === true && B.help.style.display === 'none' && B.menu.classList.contains('show') && B.body.hidden === false && fL.el.classList.contains('help-found') && fL.el.scrolled === 1);
    const says = (o, k) => api.chipReach(mkBar(o).doc, api.chipFind(mkBar(o).doc, k));
    check('a row the options fill as they open greys no chip: only a part named as shown at times does', (() => { const C = mkBar({}), row = mk('div', { id: 'fogLightRow', style: { display: 'none' } }); const lp = C.doc.getElementById('fogLightPlace'); C.body.appendChild(row); row.appendChild(lp); return api.chipReach(C.doc, api.chipFind(C.doc, '#fogLightPlace')); })() === '');
    check('a chip says why where it cannot reach: the toolbar on another view, a GM\u2019s tool on a player\u2019s app, a tool that does not show, and a row shown only at times',
        says({ barOff: true }, '#fogRevealAll') === 'On the play map' && says({ gm: true, player: true }, '#fogRevealAll') === 'The GM\u2019s' && says({ toolOff: true }, '#fogRevealAll') === '' && says({}, '#drawShowAsk') === 'On a player\u2019s screen'
        && (() => { const C = mkBar({}); C.chev.style.display = 'none'; return api.chipReach(C.doc, api.chipFind(C.doc, '#fogRevealAll')); })() === 'Not on this screen', J([says({ barOff: true }, '#fogRevealAll'), says({ gm: true, player: true }, '#fogRevealAll'), says({ toolOff: true }, '#fogRevealAll'), says({}, '#drawShowAsk')]));
}
{   // fold 5: a button inside a window the map or the campaign opens, by that window's own button; the combat roster only at a table you host
    const mkW = (o) => {
        const lib = mk('div', { id: 'libraryModal', style: { display: 'none' } }, [mk('button', { id: 'libNewPack', cls: 'tool', text: '+ Pack' })]), libB = mk('button', { id: 'libraryCampBtn', cls: 'rm-row' });
        const cm = mk('div', { id: 'combatModal', style: { display: 'none' } }, [mk('button', { id: 'combatRollAllBtn', cls: 'tool', text: 'Roll all' })]), cmB = mk('button', { id: 'netCombatBtn' });
        libB.onclick = () => { lib.style.display = 'flex'; }; cmB.onclick = () => { cm.style.display = 'flex'; };
        const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'sheets' }, style: { display: 'block' } }, [])])]);
        const bodyE = mk('body', { cls: o.player ? 'net-client' : '' }, [mk('div', { cls: 'gm-only' }, [libB]), cmB, lib, cm, help]);
        return { doc: { body: bodyE, getElementById: id => bodyE.all().find(n => n.id === id) || null, querySelectorAll: q => bodyE.querySelectorAll(q), querySelector: q => bodyE.querySelector(q), createElement: t => new El(t) }, lib, cm, help };
    };
    const W = mkW({}), fP = api.chipFind(W.doc, '#libNewPack'), fA = api.chipFind(W.doc, '#combatRollAllBtn');
    winA.wpNet = null; const offA = api.chipReach(W.doc, fA); winA.wpNet = { active: true, role: 'host' }; const onA = api.chipReach(W.doc, fA);
    check('a button of the Library window and the combat roster is found in its window; the roster says While you host until you host, and the Library is the GM\u2019s on a player\u2019s app',
        fP.win === 'libraryModal' && fA.win === 'combatModal' && api.chipReach(W.doc, fP) === '' && offA === 'While you host' && onA === '' && api.chipReach(mkW({ player: true }).doc, api.chipFind(mkW({ player: true }).doc, '#libNewPack')) === 'The GM\u2019s', J([offA, onA]));
    timers.length = 0; const gW = api.chipGo(W.doc, '#libNewPack'); timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('pressed, Help steps aside, the Library window opens by its own button and its button is lit', gW === true && W.help.style.display === 'none' && W.lib.style.display === 'flex' && fP.el.classList.contains('help-found'));
    winA.wpNet = null;
}
{   // fold 6: a sheet's head, which no one button opens: lit where a sheet is open, and a button the open sheet does not show says so
    const panel = mk('div', { id: 'sheetPanel', style: { display: 'none' } }, [mk('button', { id: 'sheetEdit', cls: 'notepad-btn', text: 'Edit sheet' }), mk('button', { id: 'sheetDone', cls: 'notepad-btn', text: 'Done', style: { display: 'none' } })]);
    const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'sheets' }, style: { display: 'block' } }, [])])]);
    const bodyE = mk('body', {}, [panel, help]), D6 = { body: bodyE, getElementById: id => bodyE.all().find(n => n.id === id) || null, querySelectorAll: q => bodyE.querySelectorAll(q), querySelector: q => bodyE.querySelector(q), createElement: t => new El(t) };
    const fE = api.chipFind(D6, '#sheetEdit'), shut = api.chipReach(D6, fE); panel.style.display = 'flex'; const open = api.chipReach(D6, fE), done = api.chipReach(D6, api.chipFind(D6, '#sheetDone'));
    timers.length = 0; const g6 = api.chipGo(D6, '#sheetEdit'); timers.filter(x => x[1] === 0).forEach(x => x[0]());
    check('a sheet\u2019s head button says With a sheet open until one is, is lit in the sheet that is open, and one that sheet does not show says so', fE.win === 'sheetPanel' && shut === 'With a sheet open' && open === '' && done === 'Not shown now' && g6 === true && fE.el.classList.contains('help-found'), J([shut, open, done]));
}
{   // fold 7: a control a window's script builds, reached by an in: key: drawn as a stand-in until the window is drawn, then as itself; judged by its window
    const mk7 = o => {
        const cal = mk('div', { id: 'calendarModal', style: { display: 'none' } }, [mk('div', { id: 'calendarBody' })]);
        const chip = mk('button', { id: 'clockChip', style: { display: o.calOff ? 'none' : '' } }); chip.onclick = () => { cal.style.display = 'flex'; if (!o.never) cal.kids[0].appendChild(mk('button', { cls: 'tool ghost cal-set', text: 'Set the clock' })); };
        const snd = mk('div', { id: 'soundPanel', style: { display: 'none' } }, []);
        const bar = mk('div', { id: 'wbFloatingToolbar', cls: 'floating-toolbar', style: { display: o.dataView ? 'none' : '' } }, [mk('div', { cls: 'tool-pair gm-only' }, [mk('button', { id: 'soundBtn' })])]);
        const pad = mk('div', { id: 'notepadPanel', style: { display: o.pad ? '' : 'none' } }, [mk('button', { id: 'notepadSaveBtn', text: 'Save to my Journal' })]);
        const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'grids' }, style: { display: 'block' } }, [mk('b', { attrs: { 'data-ctl': 'in:calendarModal.cal-set' }, text: 'Set the clock' }), mk('b', { attrs: { 'data-ctl': 'in:soundPanel.snd-mute' }, text: 'Mute mine' }), mk('b', { attrs: { 'data-ctl': 'in:calendarModal.nothing' }, text: 'Nothing' })])])]);
        const bodyE = mk('body', { cls: o.player ? 'net-client' : '' }, [chip, cal, bar, snd, pad, help]);
        return { cal, help, snd, doc: { body: bodyE, getElementById: id => bodyE.all().find(n => n.id === id) || null, querySelectorAll: q => bodyE.querySelectorAll(q), querySelector: q => bodyE.querySelector(q), createElement: t => new El(t) } };
    };
    const G = mk7({}), k = 'in:calendarModal.cal-set';
    check('an in: key names a window of the page and a class, and nothing else', J(api.chipIn(k)) === J({ win: 'calendarModal', cls: 'cal-set' }) && api.CHIP_KEY.test(k) && !api.chipIn('in:cal.x y') && !api.chipIn('in:calendarModal.Cal') && !api.chipIn('#x') && api.chipIn(null) === null);
    const n0 = api.chipsDraw(G.doc), c0 = G.help.querySelectorAll('.help-chip'), btn0 = c0[0] && c0[0].querySelector('button'), tick0 = c0[1] && c0[1].querySelector('input');
    check('before its window is drawn, a chip stands in: a button of the control\u2019s classes with Help\u2019s words, a tick for a tick, inert; a class no stand-in names stays plain',
        n0 === 2 && !!btn0 && btn0.className === 'tool ghost' && btn0.textContent === 'Set the clock' && btn0.getAttribute('tabindex') === '-1' && !!tick0 && tick0.type === 'checkbox' && c0[0].dataset.tip === 'Show me Set the clock.' && G.help.querySelectorAll('b')[2].textContent === 'Nothing', J([n0, btn0 && btn0.className]));
    timers.length = 0; const g7 = api.chipGo(G.doc, k);
    const runT = () => { for (let i = 0; i < 40; i++) { const j = timers.findIndex(t => t[1] < 2000); if (j < 0) break; timers.splice(j, 1)[0][0](); } };   // the light's own 2 s timer is left alone
    runT(); const lit = G.cal.querySelector('.cal-set');
    check('pressed, Help steps aside, the Calendar opens by its own chip, and the control its script drew is lit', g7 === true && G.help.style.display === 'none' && G.cal.style.display === 'flex' && !!lit && lit.classList.contains('help-found') && lit.scrolled === 1);
    G.help.style.display = 'flex'; api.chipsDraw(G.doc); const c1 = G.help.querySelectorAll('.help-chip')[0];
    check('once drawn, the chip copies the control itself', !!c1.querySelector('button.cal-set') && !c1.querySelector('button.cal-set').id);
    const Nv = mk7({ never: true }); timers.length = 0; api.chipGo(Nv.doc, k); runT();
    check('a control its window never draws is looked for a while and then let be, with nothing lit and nothing thrown', Nv.cal.style.display === 'flex' && !timers.some(t => t[1] < 2000));
    const rOff = api.chipReachIn(mk7({ calOff: true }).doc, k), rPl = api.chipReachIn(mk7({ player: true }).doc, k), rHide = api.chipReachIn(mk7({}).doc, 'in:calendarModal.cal-hideme'), rHideP = api.chipReachIn(mk7({ player: true }).doc, 'in:calendarModal.cal-hideme');
    const rSnd = api.chipReachIn(mk7({}).doc, 'in:soundPanel.snd-mute'), rSndD = api.chipReachIn(mk7({ dataView: true }).doc, 'in:soundPanel.snd-mute'), rSndP = api.chipReachIn(mk7({ player: true }).doc, 'in:soundPanel.snd-mute'), rNo = api.chipReachIn(mk7({}).doc, 'in:nowhere.x');
    check('a chip says why: With the Calendar on, The GM\u2019s for Set the clock on a player\u2019s app, On a player\u2019s screen for Hide the clock for me on the GM\u2019s, On the play map for a panel the map\u2019s toolbar opens, The GM\u2019s for one only the GM opens, Not on this screen for a window that is not there',
        rOff === 'With the Calendar on' && rPl === 'The GM\u2019s' && rHide === 'On a player\u2019s screen' && rHideP === '' && rSnd === '' && rSndD === 'On the play map' && rSndP === 'The GM\u2019s' && rNo === 'Not on this screen', J([rOff, rPl, rHide, rHideP, rSnd, rSndD, rSndP, rNo]));
    const fPad = api.chipFind(mk7({}).doc, '#notepadSaveBtn'), fPadU = api.chipFind(mk7({ pad: true }).doc, '#notepadSaveBtn');
    check('the table notepad\u2019s buttons say While the table notepad is up until it is', fPad.win === 'notepadPanel' && api.chipReach(mk7({}).doc, fPad) === 'While the table notepad is up' && api.chipReach(mk7({ pad: true }).doc, fPadU) === '');
    const Np = mk7({}), selN = mk('div', { cls: 'cal-pick' }); Np.cal.appendChild(selN); Np.doc.getElementById('clockChip').onclick = () => { Np.cal.style.display = 'flex'; };
    timers.length = 0; api.chipGo(Np.doc, k); runT();
    check('a control its window shows only after a pick lights the row that says so in its place', selN.classList.contains('help-found'));
    const tk = mk('label', { cls: 'journal-all' }, [mk('input', { id: 'journalAll' }), mk('span', { text: ' Every journal' })]), jm = mk('div', { id: 'journalModal', style: { display: 'none' } }, [tk]);
    const hj = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'mp-player' }, style: { display: 'block' } }, [mk('b', { attrs: { 'data-ctl': '#journalAll' }, text: 'Every journal' })])])]);
    const bj = mk('body', {}, [mk('button', { id: 'journalBtn' }), jm, hj]), DJ = { body: bj, getElementById: id => bj.all().find(n => n.id === id) || null, querySelectorAll: q => bj.querySelectorAll(q), querySelector: q => bj.querySelector(q), createElement: t => new El(t) };
    api.chipsDraw(DJ); const cj = hj.querySelector('.help-chip');
    check('a tick is drawn with its words: its label, copied', !!cj && !!cj.querySelector('label') && cj.querySelector('label').textContent === ' Every journal' && !cj.querySelector('input').id);
    check('a stand-in draws the control\u2019s look by its classes and Help\u2019s words, as text', (() => { const w = api.chipStandIn(G.doc, 'in:videoPanel.vid-add', '<b>Add videos</b>'); return w.className === 'help-chip-in' && w.kids[0].className === 'tool' && w.kids[0].textContent === '<b>Add videos</b>' && w.kids[0].getAttribute('aria-hidden') === 'true'; })());
}
{   // fold 8: the Image Library, the Sound Library (opened by Sound's own Library button) and the Time rules panel (which no button opens)
    const runT8 = () => { for (let i = 0; i < 60; i++) { const j = timers.findIndex(t => t[1] < 2000); if (j < 0) break; timers.splice(j, 1)[0][0](); } };
    const mk8 = o => {
        o = o || {};
        const up = mk('button', { id: 'soundLibUpload', text: 'Add sounds\u2026' }), lib = mk('div', { id: 'soundLibModal', style: { display: 'none' } }, [mk('div', { cls: 'snd-lib-head' }, [up])]);
        const sp = mk('div', { id: 'soundPanel', style: { display: 'none' } }, []), libBtn = () => mk('button', { data: { act: 'lib' }, text: 'Library\u2026', onclick: () => { lib.style.display = 'flex'; } });
        if (o.drawn) sp.appendChild(libBtn());
        const sb = mk('button', { id: 'soundBtn' }); sb.onclick = () => { sp.style.display = sp.style.display === 'none' ? 'flex' : 'none'; if (!sp.querySelector('[data-act="lib"]')) sp.appendChild(libBtn()); };
        const prev = mk('div', { id: 'imgLibPreview', style: { display: 'none' } }, [mk('button', { id: 'imgLibPreviewAdd', text: 'Add to map' })]);
        const il = mk('div', { id: 'imgLibModal', style: { display: 'none' } }, [mk('button', { id: 'imgLibSelectBtn', text: 'Select' }), prev]);
        const tp = mk('div', { id: 'timePanel', style: { display: 'none' } }, []);
        const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'whiteboard' }, style: { display: 'block' } }, [mk('b', { text: 'Add sounds' })])])]);
        const bodyE = mk('body', { cls: o.player ? 'net-client' : '' }, [mk('div', { cls: 'tool-pair gm-only' }, [sb]), mk('button', { id: 'imgLibBtn' }), sp, lib, il, tp, help]);
        return { sp, sb, lib, up, il, tp, help, doc: { body: bodyE, getElementById: id => bodyE.all().find(n => n.id === id) || null, querySelectorAll: q => bodyE.querySelectorAll(q), querySelector: q => bodyE.querySelector(q), createElement: tg => new El(tg) } };
    };
    const S1 = mk8(); timers.length = 0; const g1 = api.chipGo(S1.doc, '#soundLibUpload'); runT8();
    check('fold 8: Add sounds opens Sound first where its Library button is not drawn yet, then the Sound Library, and lights the control', g1 === true && S1.sb.clicks === 1 && S1.lib.style.display === 'flex' && S1.up.classList.contains('help-found'), J([g1, S1.sb.clicks, S1.lib.style.display]));
    const S2 = mk8({ drawn: true }); timers.length = 0; api.chipGo(S2.doc, '#soundLibUpload'); runT8();
    check('... and where Sound\u2019s Library button is drawn, presses it alone, so a Sound panel that is up is not closed', S2.sb.clicks === 0 && S2.lib.style.display === 'flex' && S2.up.classList.contains('help-found'));
    const I8 = mk8(), fPv = api.chipFind(I8.doc, '#imgLibPreviewAdd'), fSel = api.chipFind(I8.doc, '#imgLibSelectBtn');
    check('... a button of the Image Library is in reach, Add to map says With a picture picked, and each says The GM\u2019s on a player\u2019s app',
        fSel.win === 'imgLibModal' && api.chipReach(I8.doc, fSel) === '' && api.chipReach(I8.doc, fPv) === 'With a picture picked' && api.chipReach(mk8({ player: true }).doc, api.chipFind(mk8({ player: true }).doc, '#imgLibSelectBtn')) === 'The GM\u2019s'
        && api.chipReach(mk8({ player: true }).doc, api.chipFind(mk8({ player: true }).doc, '#soundLibUpload')) === 'The GM\u2019s');
    const T1 = mk8(); let tpOpened = 0; 
    api.CHIP_WINDOWS.timePanel.go = () => { tpOpened++; T1.tp.style.display = 'flex'; T1.tp.appendChild(mk('button', { cls: 'tp-ch-h', text: 'Kael' })); };
    timers.length = 0; const g3 = api.chipGo(T1.doc, 'in:timePanel.tp-mute'); runT8(); const chH = T1.tp.querySelector('.tp-ch-h');
    check('... Mute opens the Time rules panel by its own way, which no button gives, and lights a character where no rule\u2019s fold is open', g3 === true && tpOpened === 1 && !!chH && chH.classList.contains('help-found') && api.chipReachIn(T1.doc, 'in:timePanel.tp-mute') === '' && api.chipReachIn(mk8({ player: true }).doc, 'in:timePanel.tp-mute') === 'The GM\u2019s', J([g3, tpOpened]));
    check('... the Time rules panel\u2019s own way calls the panel\u2019s open, and nothing where it is not there', /timePanel: \{ go: function\(\) \{ var tp = typeof window !== 'undefined' \? window\.wpTimePanel : null; if \(tp && tp\.open\) tp\.open\(\); \}, when: chipGmOnly \}/.test(src));
}
{   // fold 3: the names marked as Help opens, each a bold of its part as Help writes it, naming a control the page has, its one occurrence where it says so
    const paneOf = p => { const i = html.indexOf('class="help-pane" data-pane="' + p + '"') >= 0 ? html.indexOf('class="help-pane" data-pane="' + p + '"') : html.indexOf('data-pane="' + p + '"'); if (i < 0) return ''; const j = html.indexOf('class="help-pane"', i + 20); return html.slice(i, j < 0 ? html.length : j); };
    const words = s => api.chipWords(s.replace(/<[^>]+>/g, '').replace(/&hellip;/g, '').replace(/&rsquo;/g, '\u2019'));
    const scriptsAll = fs.readdirSync(app('scripts')).filter(f => /\.js$/.test(f)).map(f => read('scripts/' + f)).join('\n');
    const inOk = k => { const ip = api.chipIn(k); return !!ip && html.split('id="' + ip.win + '"').length === 2 && Object.prototype.hasOwnProperty.call(api.CHIP_WINDOWS, ip.win) && Object.prototype.hasOwnProperty.call(api.CHIP_STANDS, k) && new RegExp("['\"][a-z -]*\\b" + ip.cls + "\\b[a-z -]*['\"]").test(scriptsAll); };   // fold 7: a window of the page, and a class a script gives a control
    const badN = api.CHIP_NAMES.filter(c => { const p = paneOf(c[0]), n = [...p.matchAll(/<b>([\s\S]*?)<\/b>/g)].filter(m => words(m[1]) === c[1]).length; return !n || (c[3] && n < c[3]) || (api.chipIn(c[2]) ? !inOk(c[2]) : html.split('id="' + c[2].slice(1) + '"').length !== 2) || !api.CHIP_KEY.test(c[2]); });
    check('fold 3 names 43 more in their parts of Help (Settings, your profile, Multiplayer and the top row), fold 4 20 on the map\u2019s toolbars fold 5 7 in the windows the map and the campaign open, fold 6 11 in a sheet\u2019s head and the Game Record, fold 7 11 in the Calendar, Sound, Music, Video, the Journal and the table notepad, and fold 8 5 in the Image Library, the Sound Library and the Time rules panel, each a bold Help writes there and a control the page has or a script builds in its window; Help\u2019s text is left as written', api.CHIP_NAMES.length === 97 && !badN.length && !/data-ctl="#(?:setKeysResetBtn|netJoinBtn|exportMdBtn)"/.test(html), J(badN));
    const pn = mk('div', { cls: 'help-pane', data: { pane: 'mp-gm' } }, [mk('b', { text: 'Start combat' }), mk('b', { text: 'Start combat' }), mk('b', { text: 'Pause the table' }), mk('b', { text: 'Fog of war' })]), hb = mk('div', { id: 'helpModal' }, [pn]);
    const nN = api.chipsName(hb), bsN = pn.querySelectorAll('b').map(b => b.getAttribute('data-ctl') || '');
    check('marked as Help opens: a name of the list in its part, in any case, the one occurrence where the list names it, never twice, and a name not in the list left as it is', nN === 2 && J(bsN) === J(['', '#netCombatBtn', '#netPauseBtn', '']) && api.chipsName(hb) === 0, J([nN, bsN]));
}

const sheets = html.slice(html.indexOf('data-pane="sheets"'), html.indexOf('data-pane="keys"'));
check('the marks are on the names of what you press, and a bold that means something else in its sentence is left plain', !/<b data-ctl="[^"]+">Undo<\/b>/.test(html) && /The rules of a fight are on the <b data-ctl="sys-tab:combat">Combat<\/b> tab/.test(sheets) && /<b data-ctl="#sysSaveBtn">Save<\/b> in the editor keeps your changes/.test(sheets) && /with the <b>Calendar<\/b> on/.test(sheets));
// ---- the wiring, the styles, the words
const css = read('style.css'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt'), ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'checks.yml'), 'utf8');
check('the page loads the module, which listens to Help and draws its chips as it opens', html.includes('<script type="module" src="scripts/helpchips.js"></script>') && src.includes("new MutationObserver(function() { if (help.style.display !== 'none') { chipsDraw(doc);") && src.includes('window.wpHelpChips ='));
check('a chip has its frame and its gold edge on hover, its copy takes no press, the light and Back to Help their styles, and Help stands over the window a chip opened', css.includes('.help-chip { display: inline-flex;') && css.includes('.help-chip:hover { border-color: var(--gold); }') && css.includes('.help-chip-in > * { pointer-events: none;') && css.includes('.help-found {') && css.includes('.help-back { position: fixed;') && css.includes('#helpModal.help-over { z-index: 100002 !important; }'));
check('both notes say the Calendar, Sound, Music, Video, the Journal and the table notepad (fold 7), and the Image Library, the Sound Library and the Time rules panel (fold 8)', [wn, wa].every(t => t.includes("A button of the Calendar, Sound, Music, Video, the Journal\n  or the table notepad opens its window first") && t.includes("button of the Image Library, the Sound Library or the Time rules panel.")));
check('both notes say a sheet\u2019s head and the Game Record (fold 6)', [wn, wa].every(t => t.includes("A button in a sheet's head is lit in the sheet you have open")));
check('both notes say the windows of fold 5', [wn, wa].every(t => t.includes("A button of the Library window, Map objects, the dice\n  roller or the combat roster opens its window first")));
check('both notes say the map\u2019s toolbars (fold 4)', [wn, wa].every(t => t.includes("A row of the map's toolbars, such as Reveal all in\n  the fog menu, opens the tool's options first")));
check('Help says what a chip does, both notes say it, and CI runs this suite', html.includes('<p>A button Help names is drawn as it looks in the app. Press it, and Help steps aside and shows you that button') && wn.includes("- Help draws the System editor's buttons and tabs as they look in the app.") && wa.includes("- Help draws the System editor's buttons and tabs as they look in the app.") && ci.includes('run: node tools/helpchipcheck.js'));
console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
