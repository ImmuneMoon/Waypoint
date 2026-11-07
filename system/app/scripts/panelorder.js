/* The left panel's own order of sections (1.6.2, backlog 56's other half). The owner, 2026-10-10: "give the user the ability to customize the
   order of these sections with drag & drop, or right click", and 2026-11-07, by prompt, where it is kept: "Each campaign".

   A campaign keeps its order as camp.panelOrder, the sections' names in the order chosen, read only through orderOf, which keeps the names
   it knows, each once, and adds any it lacks in the usual order, so a section added in a later release still shows. It never leaves this
   machine (net.js sanitizeAppState deletes it, cleanup.js lists it). Someone else's table and a window of its own show the usual order and
   change nothing. The panel's sections and the rail's icons are moved in the page to stand in that order (apply), so Tab goes through them
   as they are seen; nothing else of them changes, their ids and handlers among them. A section moves by a drag of its title, or by the
   right-click on its title, which already holds the section's actions: Move section up, Move section down, and Usual order. */
import { getActiveCampaign } from './models.js';

// [lookcheck:panelorder-start]
var PANEL_SECS = ['handbook', 'planners', 'maps', 'characters', 'decks'];   // the usual order, as the page writes the sections (data-section)
// The order a campaign's panelOrder gives: its known names, each once, then the rest in the usual order. Never throws
function orderOf(raw) {
    var out = [];
    if (Array.isArray(raw)) for (var i = 0; i < raw.length && i < 32; i++) { var k = raw[i]; if (typeof k === 'string' && PANEL_SECS.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k); }
    for (var j = 0; j < PANEL_SECS.length; j++) if (out.indexOf(PANEL_SECS[j]) < 0) out.push(PANEL_SECS[j]);
    return out;
}
// The order with key moved one place toward the top (dir -1) or the bottom (dir 1) among the sections shown. shown: the names that show,
// or nothing for all. A section that is hidden is passed over, so a press always moves the section past one you can see
function orderStep(order, key, dir, shown) {
    var o = orderOf(order), at = o.indexOf(key); if (at < 0 || (dir !== 1 && dir !== -1)) return o;
    var see = Array.isArray(shown) ? shown : o, i = at + dir;
    while (i >= 0 && i < o.length && see.indexOf(o[i]) < 0) i += dir;
    if (i < 0 || i >= o.length) return o;
    o.splice(at, 1); o.splice(i, 0, key);
    return o;
}
// The order with key set just before `before` (a name), or last where before names nothing
function orderPut(order, key, before) {
    var o = orderOf(order); if (o.indexOf(key) < 0 || key === before) return o;
    o.splice(o.indexOf(key), 1);
    var b = o.indexOf(before); if (b < 0) o.push(key); else o.splice(b, 0, key);
    return o;
}
// What a campaign stores: nothing where the order is the usual one, so a campaign that was never reordered keeps no key
function orderKept(o) { var c = orderOf(o); return c.join() === PANEL_SECS.join() ? null : c; }
// [lookcheck:panelorder-end]

function el(id) { return document.getElementById(id); }
function sectionOf(key) { var t = document.querySelector('#campaignSidebar .section-title[data-section="' + key + '"]'); return t ? t.closest('.sidebar-section') : null; }
function railOf(key) { return document.querySelector('#leftRail .rail-btn[data-rail="' + key + '"]'); }
function shownKeys() { return PANEL_SECS.filter(function(k) { var s = sectionOf(k); return !!s && !s.hidden && getComputedStyle(s).display !== 'none'; }); }
// Whether this screen may keep an order: the GM's own campaign or a player's own, never someone else's table or a window of its own
function mayKeep() {
    if (window.wpStream || window.wpPopout) return false;
    return typeof window.wpCanPersistLocal === 'function' ? window.wpCanPersistLocal() === true : false;
}
function current() { var c = getActiveCampaign(); return mayKeep() && c ? orderOf(c.panelOrder) : PANEL_SECS.slice(); }
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('panelorder v1', step, facts || {}); } catch (e) {} }
// The panel's sections and the rail's icons put in the campaign's order, each moved only where it is not already in its place
function apply() {
    var o = current(), bar = el('campaignSidebar'), rail = el('leftRail'), search = el('railSearch');
    if (bar) { var prev = null; o.forEach(function(k) { var s = sectionOf(k); if (!s || s.parentNode !== bar) return; var want = prev ? prev.nextSibling : bar.firstElementChild; if (s !== want) bar.insertBefore(s, want); prev = s; }); }
    if (rail && search && search.parentNode === rail) o.forEach(function(k) { var b = railOf(k); if (b && b.parentNode === rail && b.nextSibling !== search) rail.insertBefore(b, search); });
    return o;
}
function keep(o, how) {
    var c = getActiveCampaign(); if (!c || !mayKeep()) return false;
    var k = orderKept(o);
    if (k) c.panelOrder = k; else delete c.panelOrder;
    if (window.wpSave) window.wpSave(true);
    apply(); log(how, { order: (k || PANEL_SECS).join('.') });
    return true;
}
function move(key, dir) { return keep(orderStep(current(), key, dir, shownKeys()), dir < 0 ? 'up' : 'down'); }
function put(key, before) { return keep(orderPut(current(), key, before), 'drag'); }
function reset() { return keep(PANEL_SECS.slice(), 'usual'); }

// The right-click on a section's title: its actions, and under them the rows that move it. A section with no actions gets a menu of its own
function rowsFor(head, key) {
    var acts = head.querySelector('.section-actions');
    if (!acts) { acts = document.createElement('div'); acts.className = 'section-actions'; head.appendChild(acts); }
    if (acts.querySelector('.sec-order')) return;
    var box = document.createElement('div'); box.className = 'sec-order';
    [['up', '↑ Move section up', 'Moves this section above the one before it, in this campaign'], ['down', '↓ Move section down', 'Moves this section below the one after it, in this campaign'], ['usual', 'Usual order', 'Puts every section back in the usual order, in this campaign']].forEach(function(r) {
        var b = document.createElement('div'); b.className = 'menu-item sec-order-row'; b.dataset.order = r[0]; b.textContent = r[1]; b.title = r[2]; b.setAttribute('role', 'button');
        b.addEventListener('click', function() { if (r[0] === 'usual') reset(); else move(key, r[0] === 'up' ? -1 : 1); });
        box.appendChild(b);
    });
    acts.appendChild(box);
}
function sync() {
    var ok = mayKeep();
    document.querySelectorAll('#campaignSidebar .sec-order').forEach(function(b) { b.hidden = !ok; });
    document.querySelectorAll('#campaignSidebar .sidebar-section > h3').forEach(function(h) { h.draggable = ok; });
    apply();
}
// A drag of a section's title: the section it is dropped on takes it before or after it, by the half of that section the pointer is over
var _drag = null;
function dropMark(sec, where) { document.querySelectorAll('#campaignSidebar .sec-drop-before, #campaignSidebar .sec-drop-after').forEach(function(s) { s.classList.remove('sec-drop-before', 'sec-drop-after'); }); if (sec) sec.classList.add(where === 'after' ? 'sec-drop-after' : 'sec-drop-before'); }
function wire() {
    PANEL_SECS.forEach(function(key) {
        var sec = sectionOf(key), head = sec ? sec.querySelector('h3') : null; if (!head) return;
        rowsFor(head, key);
        head.addEventListener('dragstart', function(e) { if (!mayKeep()) { e.preventDefault(); return; } _drag = key; sec.classList.add('sec-dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'section:' + key); } catch (x) {} });
        head.addEventListener('dragend', function() { _drag = null; sec.classList.remove('sec-dragging'); dropMark(null); });
        sec.addEventListener('dragover', function(e) {
            if (!_drag || _drag === key) return;
            e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
            var r = sec.getBoundingClientRect(); dropMark(sec, e.clientY > r.top + r.height / 2 ? 'after' : 'before');
        });
        sec.addEventListener('drop', function(e) {
            if (!_drag || _drag === key) return;
            e.preventDefault();
            var r = sec.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2, o = current(), at = o.indexOf(key);
            put(_drag, after ? (o[at + 1] === _drag ? o[at + 2] : o[at + 1]) || '' : key);
            dropMark(null);
        });
    });
    sync();
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpPanelOrder = { apply: apply, sync: sync, move: move, put: put, reset: reset, orderOf: orderOf, SECS: PANEL_SECS };
export { PANEL_SECS, orderOf, orderStep, orderPut, orderKept };
