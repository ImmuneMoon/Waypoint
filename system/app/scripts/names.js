/* The name button (1.6.2, backlog 147; the owner, 2026-11-06, by prompt: "Lists, else a maker (Recommended)", and where it stands: "Naming a
   character", "Naming a map or page", "On a planner card", "As a command"). A press opens a small menu: the system's name lists of that kind,
   then the maker's own styles. A pick fills the field it stands by, or the box that asked for a name, or puts the name in this computer's
   chat. The menu is made of elements and text nodes; a list's name and its names come from a system file, so none is ever markup */
'use strict';
import { nameFrom, namesFor, makeName, STYLES, STYLE_KEYS } from './namecore.js';
import { getActiveCampaign } from './models.js';
// [namecheck:menu-start]
// the rows of the menu for a kind: each list of the system that serves it, then the maker's styles that do
function menuRows(lists, kind) {
    var out = [];
    namesFor(lists, kind).forEach(function(l) { out.push({ text: 'From ' + l.label, key: l.key }); });
    STYLE_KEYS.forEach(function(k) { var s = STYLES[k]; if (kind === 'any' || s.kind === kind) out.push({ text: 'Made up: ' + s.label, style: k }); });
    return out;
}
function listsNow() { var camp = getActiveCampaign(), sys = camp && camp.system; return sys && Array.isArray(sys.names) ? sys.names : []; }
var _menu = null, _done = null;
function menuEl(doc) {
    if (_menu && doc.body.contains(_menu)) return _menu;
    _menu = doc.createElement('div'); _menu.id = 'nameMenu'; _menu.className = 'shape-menu name-menu'; _menu.setAttribute('role', 'menu'); _menu.style.display = 'none';
    _menu.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !_menu.contains(b)) return;
        e.stopPropagation(); var row = b._row, kind = _menu.dataset.kind || 'person', fn = _done; close();
        var n = row && row.style ? makeName(Math.random, row.style, kind) : nameFrom(Math.random, listsNow(), kind, row ? row.key : '');
        if (typeof fn === 'function' && n) fn(n);
    });
    doc.body.appendChild(_menu);
    return _menu;
}
// open the menu under an element, for a kind ('person', 'place' or 'any'); done(name) is called with the name picked
function open(anchor, kind, done, doc) {
    doc = doc || document;
    var m = menuEl(doc), rows = menuRows(listsNow(), kind === 'place' ? 'place' : kind === 'any' ? 'any' : 'person');
    m.textContent = ''; m.dataset.kind = kind === 'place' || kind === 'any' ? kind : 'person'; _done = done;
    rows.forEach(function(r) { var b = doc.createElement('button'); b.type = 'button'; b.className = 'wb-tool-btn party-menu-item'; b.setAttribute('role', 'menuitem'); b.textContent = r.text; b.title = r.style ? 'A name made by Waypoint, ' + STYLES[r.style].label.toLowerCase() + ' sounding' : 'A name from this list'; b._row = r; m.appendChild(b); });
    m.style.display = 'flex';
    var r0 = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 20, bottom: 60 }, w = m.offsetWidth || 200, h = m.offsetHeight || 200, vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    var x = Math.max(8, Math.min(r0.left, vw - w - 8)), y = r0.bottom + 4 + h > vh - 8 ? Math.max(8, (r0.top || r0.bottom) - h - 4) : r0.bottom + 4;
    m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(y) + 'px';
    var first = m.querySelector('button'); if (first && first.focus) first.focus();
    return rows.length;
}
function close() { if (_menu) _menu.style.display = 'none'; _done = null; }
function isOpen() { return !!_menu && _menu.style.display !== 'none'; }
// a button that stands by a name field: a pick fills the field and says so as the field's own input and change
function button(kind, field, doc) {
    doc = doc || document;
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'tool ghost name-btn'; b.textContent = 'Name'; b.title = kind === 'place' ? 'Make a name for this place' : 'Make a name';
    b.addEventListener('click', function(e) {
        e.stopPropagation(); e.preventDefault();
        if (isOpen()) { close(); return; }
        open(b, kind, function(n) { if (!field) return; field.value = n; ['input', 'change'].forEach(function(t) { field.dispatchEvent(new Event(t, { bubbles: true })); }); if (field.focus) field.focus(); }, doc);
    });
    return b;
}
// a name put in this computer's chat: the command and the dice roller's button
function toChat(kind, anchor) {
    var n = window.wpNet;
    return open(anchor || null, kind || 'person', function(name) { if (n && typeof n.nameLine === 'function') n.nameLine(name); }) > 0;
}
// [namecheck:menu-end]
if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', function(e) { if (isOpen() && !(e.target && e.target.closest && (e.target.closest('#nameMenu') || e.target.closest('.name-btn') || e.target.closest('#customPromptName') || e.target.closest('#diceNameBtn')))) close(); }, true);
    document.addEventListener('keydown', function(e) {
        if (!isOpen()) return;
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { var bs = Array.prototype.slice.call(_menu.querySelectorAll('button')), i = bs.indexOf(document.activeElement); if (!bs.length) return; e.preventDefault(); e.stopPropagation(); var j = i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length; bs[j].focus(); }
    }, true);
    var dn = document.getElementById('diceNameBtn'); if (dn) dn.addEventListener('click', function(e) { e.stopPropagation(); if (isOpen()) close(); else toChat('any', dn); });
}
window.wpNames = { open: open, close: close, isOpen: isOpen, button: button, toChat: toChat, menuRows: menuRows };
