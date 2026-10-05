/* The page's own navigation, wherever a planner or a page is read (1.5.4).
   The owner, 2026-10-05, by prompt: an outline of the page to jump by — "Yes, behind a button" — "Everywhere a page is read".
   An Outline button opens the list of the page's headings as a menu; a click on one brings that heading into view. Nothing is added to
   the page itself. The places: the planner's own preview (#plannerPreview), the panel over the map (#docPanelBody), a player's reader
   (#docReaderBody) and a page in a window of its own (#popoutBody; that window's bar is built by popout.js, so its button is made here).
   A heading is what a drawn block opens with: a page's h1 / h2 / h3, the title of a planner's node, the title of a table.
   Everything the menu shows is a heading's own text, put into a text node: never markup. */

// [pagecheck:outline-start]
function navHas(el, c) { return (' ' + (el && typeof el.className === 'string' ? el.className : '') + ' ').indexOf(' ' + c + ' ') >= 0; }
function navFirstEl(n) { for (var i = 0; n && n.childNodes && i < n.childNodes.length; i++) if (n.childNodes[i].nodeType === 1) return n.childNodes[i]; return null; }
// the drawn blocks of a page, in order: every .pv-blk under root, wherever it sits (a section's columns nest them); never one inside another
function navBlocks(root) {
    var out = [];
    (function walk(n) { for (var i = 0; n && n.childNodes && i < n.childNodes.length; i++) { var k = n.childNodes[i]; if (k.nodeType !== 1) continue; if (navHas(k, 'pv-blk')) out.push(k); else walk(k); } })(root);
    return out;
}
// the heading a drawn block opens with: { level, el }, or null. A node's or a table's title counts as a third-level heading (both renderers
// draw a titled table and a planner's node in a box of class node, its title first)
function navHead(blk) {
    var k = navFirstEl(blk); if (!k) return null;
    var t = k.nodeName;
    if (t === 'H1' || t === 'H2' || t === 'H3') return { level: +t.charAt(1), el: k };
    if (t === 'DIV' && navHas(k, 'node')) { var h = navFirstEl(k); if (h && h.nodeName === 'H3') return { level: 3, el: h }; }
    return null;
}
// a heading's own words: its text without its subtitle (.sub) and without a node's tag (.tag), white space folded, 120 characters at most
function navText(el) {
    var s = '';
    (function walk(n) { for (var i = 0; n && n.childNodes && i < n.childNodes.length; i++) { var k = n.childNodes[i]; if (k.nodeType === 3) s += k.nodeValue; else if (k.nodeType === 1 && !navHas(k, 'sub') && !navHas(k, 'tag')) walk(k); } })(el);
    return Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, 120).join('');
}
// [{ level, text, bi, el }]: bi is the block's own number (its data-blk), by which a row finds its heading again after the page was drawn again
function navOutline(root) {
    var out = [];
    navBlocks(root).forEach(function(b) {
        var h = navHead(b); if (!h) return;
        var text = navText(h.el), bi = b.dataset && typeof b.dataset.blk === 'string' ? b.dataset.blk : '';
        if (text && bi) out.push({ level: h.level, text: text, bi: bi, el: h.el });
    });
    return out;
}
// [pagecheck:outline-end]

// [pagecheck:menu-start]
var NAV_PLACES = [['plannerOutlineBtn', 'plannerPreview'], ['docPanelOutline', 'docPanelBody'], ['docReaderOutline', 'docReaderBody'], ['popoutOutline', 'popoutBody']];
var _navMenu = null, _navFrom = null, _navRoot = null;   // the menu (made at the first press), the button it is open from, and the page it lists
function navMenuEl() {
    if (_navMenu) return _navMenu;
    var m = document.createElement('div'); m.id = 'pageNavMenu'; m.setAttribute('role', 'menu'); m.style.display = 'none';
    (document.getElementById('popoutWrap') || document.body).appendChild(m);   // a window of its own hides everything outside its own wrap
    m.addEventListener('click', function(e) {
        var row = e.target && e.target.closest ? e.target.closest('.pagenav-row') : null; if (!row) return;
        var root = _navRoot, bi = row.dataset.blk; navClose(false);
        var now = root ? navOutline(root).filter(function(h) { return h.bi === bi; })[0] : null; if (!now) return;   // read again: the page may have been drawn again since
        try { now.el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (err) {}
        now.el.classList.add('pagenav-hit'); setTimeout(function() { now.el.classList.remove('pagenav-hit'); }, 1300);
    });
    m.addEventListener('keydown', function(e) {
        var rows = Array.prototype.slice.call(m.querySelectorAll('.pagenav-row')), at = rows.indexOf(document.activeElement), to = -1;
        if (e.key === 'ArrowDown') to = at < 0 || at === rows.length - 1 ? 0 : at + 1;
        else if (e.key === 'ArrowUp') to = at <= 0 ? rows.length - 1 : at - 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = rows.length - 1;
        if (to < 0 || !rows[to]) return;
        e.preventDefault(); rows[to].focus();
    });
    return (_navMenu = m);
}
function navIsOpen() { return !!(_navMenu && _navMenu.style.display !== 'none'); }
function navClose(refocus) {
    if (!navIsOpen()) return;
    _navMenu.style.display = 'none';
    var b = _navFrom; _navFrom = null; _navRoot = null;
    if (b) { b.setAttribute('aria-expanded', 'false'); if (refocus) b.focus(); }
}
// the rows: a button each, its class by the heading's level, its words a text node
function navFill(m, list) {
    while (m.firstChild) m.removeChild(m.firstChild);
    if (!list.length) { var none = document.createElement('div'); none.className = 'pagenav-none'; none.appendChild(document.createTextNode('This page has no headings.')); m.appendChild(none); return; }
    list.forEach(function(h) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pagenav-row pagenav-lv' + h.level; b.dataset.blk = h.bi; b.setAttribute('role', 'menuitem');
        b.appendChild(document.createTextNode(h.text)); m.appendChild(b);
    });
}
function navOpen(btn, root, byKey) {
    var m = navMenuEl(); navFill(m, navOutline(root));
    _navFrom = btn; _navRoot = root; btn.setAttribute('aria-expanded', 'true');
    m.style.left = '0px'; m.style.top = '0px'; m.style.display = 'block';
    var r = btn.getBoundingClientRect(), vw = window.innerWidth || 0, vh = window.innerHeight || 0, w = m.offsetWidth || 0, h = m.offsetHeight || 0;
    var x = Math.max(6, Math.min(r.left, vw - w - 6)), y = r.bottom + 4;
    if (y + h > vh - 6) y = Math.max(6, vh - h - 6);   // no room under the button: as low as it fits
    m.style.left = x + 'px'; m.style.top = y + 'px';
    if (byKey) { var first = m.querySelector('.pagenav-row'); if (first) first.focus(); }
}
function navToggle(btn, root, byKey) {
    if (_navFrom === btn && navIsOpen()) { navClose(true); return; }
    navClose(false); navOpen(btn, root, byKey);
}
function navWire() {
    var spec = new URLSearchParams(location.search).get('popout') || '', bar = document.getElementById('popoutBar');
    if (bar && spec.indexOf('doc:') === 0) {   // a page in a window of its own: its bar has no Outline button of its own
        var pb = document.createElement('button'); pb.id = 'popoutOutline'; pb.type = 'button'; pb.title = 'Outline: the headings of this page. Click one to jump to it.';
        pb.appendChild(document.createTextNode('Outline')); bar.insertBefore(pb, document.getElementById('popoutDock'));
    }
    NAV_PLACES.forEach(function(p) {
        var btn = document.getElementById(p[0]), root = document.getElementById(p[1]); if (!btn || !root) return;
        btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', function(e) { navToggle(btn, root, e.detail === 0); });   // detail 0: pressed by the keyboard
    });
    document.addEventListener('pointerdown', function(e) {
        if (!navIsOpen()) return;
        var t = e.target;
        if (t && t.closest && (t.closest('#pageNavMenu') || (_navFrom && _navFrom.contains(t)))) return;
        navClose(false);
    }, true);
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || !navIsOpen()) return;
        e.preventDefault(); e.stopPropagation(); navClose(true);
    }, true);
}
// [pagecheck:menu-end]

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    navWire();
    window.wpPageNav = { outline: navOutline, close: function() { navClose(false); }, isOpen: navIsOpen };
}
