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
const timers = [], opened = [];
const api = new Function('window', 'setTimeout', 'MutationObserver', cut('core', 'wire') + '\nreturn { chipFind, chipReach, chipCopy, chipsDraw, chipGo, chipBack, chipMenus, chipStand, CHIP_KEY, CHIP_TAB_IDS };')({ wpOpenHelp: p => opened.push(p) }, (f, ms) => { timers.push([f, ms]); return timers.length; }, undefined);
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
    const imp = mk('button', { id: 'importBtn', cls: 'rm-row', text: 'Import' }), saveAs = mk('button', { id: 'saveAsBtn', cls: 'rm-row', text: 'Export As' }), pic = mk('button', { id: 'exportMapPicBtn', cls: 'menu-item', text: 'Save Map as Picture' });
    const kinds = mk('div', { id: 'saveAsMenu', style: { display: 'none' } }, [pic]), menu = mk('div', { id: 'moreMenu', cls: 'row-menu', hidden: true }, [imp, saveAs, kinds]);
    more.onclick = () => { menu.hidden = false; }; saveAs.onclick = () => { kinds.style.display = 'block'; };
    const gm = mk('button', { id: 'gmOnly', cls: 'gm-only', text: 'Snapshot' }), fold = mk('button', { id: 'soundInd', cls: 'row-fold', attrs: { title: 'Sound effects.' } });
    const trayBtn = mk('button', { id: 'rowTrayBtn', attrs: { 'aria-controls': 'rowTray' } }), stand = mk('button', { attrs: { 'data-press': 'soundInd' }, text: 'Sound effects' }), tray = mk('div', { id: 'rowTray', cls: 'row-menu', hidden: true }, [stand]);
    trayBtn.onclick = () => { tray.hidden = false; };
    const header = mk('header', {}, [more, menu, gm, fold, trayBtn, tray]);
    const help = mk('div', { id: 'helpModal', style: { display: 'flex' } }, [mk('div', { cls: 'help-body' }, [mk('div', { cls: 'help-pane', data: { pane: 'start' }, style: { display: 'block' } }, [mk('b', { attrs: { 'data-ctl': '#exportMapPicBtn' }, text: 'Save Map as Picture' }), mk('b', { attrs: { 'data-ctl': '#moreMenuBtn' }, text: 'More' }), mk('b', { attrs: { 'data-ctl': '#gmOnly' }, text: 'Snapshot' })])])]);
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
// ---- every mark Help carries names a control the page has
const html = read('index.html'), marks = [...html.matchAll(/<b data-ctl="([^"]+)">/g)].map(m => m[1]);
const bad = marks.filter(k => { if (!api.CHIP_KEY.test(k)) return true; if (k[0] === '#') return html.split('id="' + k.slice(1) + '"').length !== 2; if (k.indexOf('sys-tab:') === 0) return !html.includes('<button data-tab="' + k.slice(8) + '"'); const p = k.split(':'), tid = Object.keys(api.CHIP_TAB_IDS).find(x => api.CHIP_TAB_IDS[x] === p[1]); if (!tid) return true; const at = html.indexOf('id="' + tid + '"'), end = html.indexOf('<div id="sys', at + 10); return at < 0 || html.slice(at, end > 0 ? end : undefined).indexOf(p[2]) < 0; });
check('every mark Help carries is a key of the chips’ own form, and names a button or a tab the page has: the System editor’s 25 first', marks.length >= 25 && bad.length === 0, J([marks.length, bad]));
const sheets = html.slice(html.indexOf('data-pane="sheets"'), html.indexOf('data-pane="keys"'));
check('the marks are on the names of what you press, and a bold that means something else in its sentence is left plain', !/<b data-ctl="[^"]+">Undo<\/b>/.test(html) && /The rules of a fight are on the <b data-ctl="sys-tab:combat">Combat<\/b> tab/.test(sheets) && /<b data-ctl="#sysSaveBtn">Save<\/b> in the editor keeps your changes/.test(sheets) && /with the <b>Calendar<\/b> on/.test(sheets));
// ---- the wiring, the styles, the words
const css = read('style.css'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt'), ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'checks.yml'), 'utf8');
check('the page loads the module, which listens to Help and draws its chips as it opens', html.includes('<script type="module" src="scripts/helpchips.js"></script>') && src.includes("new MutationObserver(function() { if (help.style.display !== 'none') { chipsDraw(doc);") && src.includes('window.wpHelpChips ='));
check('a chip has its frame and its gold edge on hover, its copy takes no press, the light and Back to Help their styles, and Help stands over the window a chip opened', css.includes('.help-chip { display: inline-flex;') && css.includes('.help-chip:hover { border-color: var(--gold); }') && css.includes('.help-chip-in > * { pointer-events: none;') && css.includes('.help-found {') && css.includes('.help-back { position: fixed;') && css.includes('#helpModal.help-over { z-index: 100002 !important; }'));
check('Help says what a chip does, both notes say it, and CI runs this suite', html.includes('<p>A button Help names is drawn as it looks in the app. Press it, and Help steps aside and shows you that button') && wn.includes("- Help draws the System editor's buttons and tabs as they look in the app.") && wa.includes("- Help draws the System editor's buttons and tabs as they look in the app.") && ci.includes('run: node tools/helpchipcheck.js'));
console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
