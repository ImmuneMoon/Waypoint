/* Floating boxes stay off the views they were not opened on (1.5.4).
   The owner, 2026-10-05: "any pop out boxes that are not their own separate windows from the play map shouldnt show when im looking in
   the planners, datamap, or anywhere else when switching from the play map", and by prompt: they "come back as left", and "the only
   things that should stay are any popups that have been made into their own windows outside of waypoint".

   The boxes: the sheet panel, every HUD, the page panel, Sound, Music, Video, Effects, the table notepad, Table Chat and its dice roller.
   The views: the play map, the data map, and a page (a planner or a handbook page in its editor).
   The rule: on the play map every box that is up shows, as it always did. On another view a box shows only if it was asked for there
   (its button, a sheet opened from a list) or came up there. Everywhere else it is put away with one class (display: none), and nothing
   is closed: what plays goes on playing, a video shown to the table goes on, a sheet keeps its place and its scroll. Back on the play
   map it is as it was left. A box that goes down forgets where it was asked for.

   A module that opens a box says so with reveal(), and a toggle asks shown(), so no button is ever dead on a box that is put away.
   Nothing here does anything in a window of its own (a pop-out, the stream window): view() is '' there. */

import { state } from './state.js';
import { getActiveMap, isDocLike } from './models.js';

// [floatcheck:core-start]
var FLOAT_IDS = ['sheetPanel', 'docPanel', 'soundPanel', 'musicPanel', 'videoPanel', 'fxPanel', 'notepadPanel', 'chatPanel', 'dicePanel'];
var FLOAT_LAYER = 'hudLayer', FLOAT_AWAY = 'wp-away', FLOAT_BACK = 'wpfloatback';
var FLOAT_WITH = { dicePanel: 'chatPanel' };   // the dice roller goes where Table Chat goes, while the chat is up
var _floatOn = new WeakMap(), _floatWas = new WeakMap();   // a box -> the views besides the play map it shows on (a Set); a box -> whether it was up when last looked at

// Which view is on screen: 'play', 'data' or 'page'; '' when there is none to speak of (no map or page open, or a window of its own)
function floatView(item, mode, docLike) { return !item ? '' : docLike ? 'page' : mode === 'visual' ? 'play' : 'data'; }
function floatNow() {
    if (typeof window === 'undefined' || window.wpPopout || window.wpStream) return '';
    var it = getActiveMap(); return floatView(it, state.viewMode, !!(it && isDocLike(it)));
}
// A box is up when its own module shows it (its inline display), whatever is done to it here
function floatUp(el) { return !!el && !!el.style && el.style.display !== 'none'; }
function floatAway(el) { return !!(el && el.classList && el.classList.contains(FLOAT_AWAY)); }
function floatShown(el) { return floatUp(el) && !floatAway(el); }
function floatBoxes() {
    var out = [];
    FLOAT_IDS.forEach(function(id) { var el = document.getElementById(id); if (el) out.push(el); });
    var layer = document.getElementById(FLOAT_LAYER), kids = layer && layer.children ? layer.children : [];
    for (var i = 0; i < kids.length; i++) out.push(kids[i]);
    return out;
}
// The box whose views a box shows on: its own, or those of the box it goes with while that one is up
function floatLead(el) {
    var id = el && typeof el.id === 'string' && Object.prototype.hasOwnProperty.call(FLOAT_WITH, el.id) ? FLOAT_WITH[el.id] : '';
    var lead = id ? document.getElementById(id) : null;
    return lead && floatUp(lead) ? lead : el;
}
function floatFirst(view) { var s = new Set(); if (view && view !== 'play') s.add(view); return s; }
// Does a box show on this view? On the play map every box does. On another view only one that was asked for there
function floatFits(el, view) { if (view === 'play') return true; var on = _floatOn.get(floatLead(el)); return !!(on && on.has(view)); }
// A box that was put away shows again. It is told, so that one placed against another (the dice roller against Table Chat) finds its place
function floatBack(el, tell) {
    if (!floatAway(el)) return false;
    el.classList.remove(FLOAT_AWAY);
    if (tell && typeof el.dispatchEvent === 'function' && typeof CustomEvent === 'function') { try { el.dispatchEvent(new CustomEvent(FLOAT_BACK)); } catch (e) {} }
    return true;
}
// A box was seen to come up or to go down: one that comes up shows on the view on screen, one that goes down forgets its views
function floatNote(el, view) {
    if (!el || !el.classList) return;
    var up = floatUp(el), was = _floatWas.get(el) === true;
    if (up && !was) { if (view) _floatOn.set(el, floatFirst(view)); else _floatOn.delete(el); floatBack(el, false); }
    else if (!up && was) { _floatOn.delete(el); el.classList.remove(FLOAT_AWAY); }
    _floatWas.set(el, up);
}
// The view changed, or may have: every box that is up shows where it fits and is put away elsewhere. Returns how many came back.
function floatSync() {
    var view = floatNow(); if (!view) return 0;
    var back = 0, act = document.activeElement;
    floatBoxes().forEach(function(el) {
        if (!floatUp(el)) { if (_floatWas.get(el) === true) floatNote(el, view); return; }   // it went down and nobody noted it
        if (_floatWas.get(el) !== true) floatNote(el, view);            // it came up unseen: it came up here
        if (!_floatOn.has(el)) _floatOn.set(el, floatFirst(view));      // it came up while no view was on screen: this is its first
        var fits = floatFits(el, view), had = floatAway(el);
        if (!fits && !had) {
            if (act && act !== el && typeof el.contains === 'function' && el.contains(act) && typeof act.blur === 'function') act.blur();   // nothing is typed into a box that is not shown
            el.classList.add(FLOAT_AWAY);
        } else if (fits && had && floatBack(el, true)) back++;
    });
    return back;
}
// A box was asked for here and now (its button, a sheet opened from a list): it shows on this view from now on. Returns the view when the
// box was up and put away until this call, so that a caller who only borrows it (Table Chat raised by a roll) can give it back with leave()
function floatReveal(el) {
    if (!el || !el.classList) return '';
    var view = floatNow(), lead = floatLead(el), lent = floatUp(el) && floatAway(el) && !!view && view !== 'play';
    var on = _floatOn.get(lead);
    if (!on) { if (view) _floatOn.set(lead, floatFirst(view)); } else if (view && view !== 'play') on.add(view);
    if (lead !== el && view && !_floatOn.has(el)) _floatOn.set(el, floatFirst(view));
    _floatWas.set(el, floatUp(el));
    floatBack(el, true);
    FLOAT_IDS.forEach(function(id) {   // what goes with it comes back with it
        if (!Object.prototype.hasOwnProperty.call(FLOAT_WITH, id) || FLOAT_WITH[id] !== el.id) return;
        var f = document.getElementById(id); if (f && floatUp(f) && floatFits(f, view || 'play')) floatBack(f, true);
    });
    return lent ? view : '';
}
// A box borrowed by a view is given back: it no longer shows there (on the play map it always does)
function floatLeave(el, view) {
    var on = el ? _floatOn.get(floatLead(el)) : null;
    if (on && typeof view === 'string') on.delete(view);
    return floatSync();
}
// [floatcheck:core-end]

// [floatcheck:watch-start]
// A box comes up and goes down by its own module's hand (its inline display; a HUD is added to its layer): seen here, with no hook in
// the module. Only reveal() and shown() are asked of a module, where a box that is put away would otherwise make a button dead
function watch() {
    if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
    var mo = new MutationObserver(function(recs) {
        var view = null;   // asked for only when a box really came up or went down (a box dragged about changes its style on every move)
        var note = function(el) { if (!el || el.nodeType !== 1 || floatUp(el) === (_floatWas.get(el) === true)) return; if (view === null) view = floatNow(); floatNote(el, view); };
        recs.forEach(function(r) {
            if (r.type === 'attributes') note(r.target);
            else if (r.addedNodes) for (var i = 0; i < r.addedNodes.length; i++) note(r.addedNodes[i]);
        });
    });
    FLOAT_IDS.forEach(function(id) { var el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['style'] }); });
    var layer = document.getElementById(FLOAT_LAYER); if (layer) mo.observe(layer, { childList: true });
}
// [floatcheck:watch-end]

window.wpFloats = { sync: floatSync, reveal: floatReveal, leave: floatLeave, away: floatAway, shown: floatShown, view: floatNow };
watch();
