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
var _floatUse = new WeakMap(), _floatTick = 0;   // a box -> when it was last used: pressed, given the focus, come up or asked for (1.5.4)

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
// A box was used: pressed, given the focus, come up or asked for. Escape closes Table Chat, the notepad, Sound or Music only while one of
// them is the box last used (the owner, 2026-10-17, by prompt: "Yes, when on top (Recommended)"), and from outside the box last used of
// those it closes (esckey.js)
function floatUse(el) { if (el && typeof el === 'object') _floatUse.set(el, ++_floatTick); }
// The box last used, of the boxes that show; null where none of them was used
function floatLast() {
    var best = null, bt = 0;
    floatBoxes().forEach(function(el) { var t = _floatUse.get(el) || 0; if (t > bt && floatShown(el)) { best = el; bt = t; } });
    return best;
}
// The box a press or a focus lands in, or null
function floatIn(t) { var bs = floatBoxes(); for (var i = 0; t && i < bs.length; i++) if (typeof bs[i].contains === 'function' && bs[i].contains(t)) return bs[i]; return null; }
// A box was seen to come up or to go down: one that comes up shows on the view on screen, one that goes down forgets its views
function floatNote(el, view) {
    if (!el || !el.classList) return;
    var up = floatUp(el), was = _floatWas.get(el) === true;
    if (up && !was) { if (view) _floatOn.set(el, floatFirst(view)); else _floatOn.delete(el); floatBack(el, false); floatUse(el); }
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
    _floatWas.set(el, floatUp(el)); floatUse(el);
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

// [floatcheck:spot-start]
// Where a box opens (the owner, 2026-10-17, by prompt: "open clear, and im moved past a toolbar, the toolbar stays on top"). A box that comes
// up at its own default place stands where it leaves clear the map's tool bar, the column at the map's edge (View, Grid and Snap), the data
// map's bar, the turn strip, the party strip and the left rail, as near its default as it can, and with no more height than is clear below
// it. A box the user moved, or one a module placed itself (a stored place, a page opened beside the sheet), keeps its place.
var SPOT_KEEP = ['wbFloatingToolbar', 'wbEdgeTools', 'dataFloatingToolbar', 'combatStrip', 'partyStrip', 'leftRail'];
var SPOT_GAP = 8, SPOT_MIN = 200;
// want: the box at its default place, { l, t, w, h }, h being the height it may grow to. keep: the rectangles to leave clear, { l, t, r, b }.
// area: where a box may stand, { l, t, r, b } (the window under the top row). up: the box may stand higher than its default (one that
// stands on its bottom edge, or one opened in the middle); otherwise it only moves down or aside. Answers { l, t, h }, h being the height
// clear below t and at most want.h, or null where no place is clear. A place with more room wins, and of two alike the nearer one
function spotFor(want, keep, area, up) {
    var num = function(v) { return typeof v === 'number' && isFinite(v); };
    if (!want || !area || ![want.l, want.t, want.w, want.h, area.l, area.t, area.r, area.b].every(num) || !(want.w > 0) || !(want.h > 0)) return null;
    var G = SPOT_GAP, w = want.w, h = Math.min(want.h, area.b - area.t - 2 * G); if (!(h > 0)) return null;
    var ks = (Array.isArray(keep) ? keep : []).filter(function(k) { return !!k && [k.l, k.t, k.r, k.b].every(num) && k.r > k.l && k.b > k.t; })
        .map(function(k) { return { l: k.l - G, t: k.t - G, r: k.r + G, b: k.b + G }; });
    var lo = area.l + G, hi = Math.max(lo, area.r - G - w), top = up === true ? area.t + G : Math.max(area.t, want.t), bottom = area.b - G, least = Math.min(h, SPOT_MIN);
    var xs = [want.l], ys = [want.t];
    ks.forEach(function(k) { xs.push(k.l - w, k.r); ys.push(k.b, k.t - h); });
    var best = null;
    xs.forEach(function(x0) {
        var x = Math.min(hi, Math.max(lo, x0));
        ys.forEach(function(y0) {
            var y = Math.max(top, Math.min(bottom - least, y0)), room = bottom - y, ok = true;
            ks.forEach(function(k) {
                if (!ok || !(k.l < x + w && x < k.r) || k.b <= y) return;   // not across the box, or above it
                if (k.t <= y) ok = false; else room = Math.min(room, k.t - y);   // the box's top would stand in it; or it ends above it
            });
            var fit = Math.min(h, room); if (!ok || fit < least) return;
            var score = fit - (Math.abs(x - want.l) + Math.abs(y - want.t)) / 4;
            if (!best || score > best.s) best = { l: x, t: y, h: fit, s: score };
        });
    });
    return best ? { l: Math.round(best.l), t: Math.round(best.t), h: Math.floor(best.h) } : null;
}
// [floatcheck:spot-end]

// [floatcheck:spotpage-start]
// A box's own place, as its inline style holds it: a module that places a box (a stored place, a drag) writes its left and top
var SPOT_PARTS = ['left', 'top', 'right', 'bottom'], SPOT_MOVED = 'wpfloatmoved';
var _spotHome = new WeakMap(), _spotMine = new WeakMap(), _spotWas = new WeakMap();   // a box -> its place as the page has it; -> the place this gave it; -> whether it was up
function spotAt(el) { return SPOT_PARTS.map(function(k) { return el.style[k] || ''; }).join('|'); }
function spotShape(el) { return spotAt(el) + '|' + (el.style.width || '') + '|' + (el.style.height || ''); }
function spotRect(el) { var r = el && !el.hidden && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null; return r && r.width > 0 && r.height > 0 ? r : null; }
// What a box leaves clear, as it stands on the page now: each of SPOT_KEEP that shows
function spotKeep() { return SPOT_KEEP.map(function(id) { var r = spotRect(document.getElementById(id)); return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }).filter(Boolean); }
// Where a box may stand: the window, under the top row (which, hidden, floats at the window's top)
function spotArea() {
    var hd = typeof document.querySelector === 'function' ? spotRect(document.querySelector('header')) : null;
    return { l: 0, t: hd ? Math.max(0, hd.bottom) : 0, r: window.innerWidth, b: window.innerHeight };
}
// For a module that places a box itself (a HUD, a player's page reader): the clear place nearest want, or null
function spotFind(want, up) { return spotFor(want, spotKeep(), spotArea(), up === true); }
// A box of the list put clear, where it stands at its own default place or where this put it last. Its default is read with the place
// this gave it taken off. A box that stands on its bottom edge (Table Chat) keeps standing on it, and one that would be taller than the
// room left is held to it (its max-height), unless the user gave it a size. Answers whether it was moved
function spotPlace(el) {
    if (!el || !el.style || !floatUp(el) || floatAway(el) || typeof el.getBoundingClientRect !== 'function') return false;
    var home = _spotHome.get(el), mine = _spotMine.get(el), s = el.style, at = spotAt(el); if (!home) return false;
    if (at !== home.at && !(mine && at === mine.at)) { _spotMine.delete(el); return false; }
    SPOT_PARTS.forEach(function(k, i) { s[k] = home.parts[i]; }); if (mine && s.maxHeight === mine.cap) s.maxHeight = home.max;
    var r = spotRect(el), low = home.parts[3] !== '', sized = !!s.height; if (!r) { _spotMine.delete(el); return false; }
    var mx = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(el).maxHeight) : NaN, h = sized ? r.height : Math.max(r.height, isFinite(mx) ? mx : 0);
    var p = spotFind({ l: r.left, t: low ? r.bottom - h : r.top, w: r.width, h: h }, low);
    if (p) {
        s.right = Math.max(0, Math.round(window.innerWidth - p.l - r.width)) + 'px';
        if (low) s.bottom = Math.max(0, Math.round(window.innerHeight - p.t - p.h)) + 'px'; else s.top = p.t + 'px';
        if (!sized && p.h < h) s.maxHeight = p.h + 'px';
    }
    _spotMine.set(el, { at: spotAt(el), shape: spotShape(el), cap: s.maxHeight });
    if (p && typeof el.dispatchEvent === 'function' && typeof CustomEvent === 'function') { try { el.dispatchEvent(new CustomEvent(SPOT_MOVED)); } catch (e) {} }   // the dice roller finds its place against Table Chat again
    return !!p;
}
// A style change of a box: one that came up is put clear; one the user moved or sized since it was put clear is theirs, and loses the
// height it was held to. Nothing is measured for a box dragged about
function spotSeen(el) {
    if (!el || !el.style || !_spotHome.has(el)) return;
    var up = floatUp(el), was = _spotWas.get(el) === true, mine = _spotMine.get(el); _spotWas.set(el, up);
    if (mine && spotShape(el) !== mine.shape) { if (el.style.maxHeight === mine.cap) el.style.maxHeight = _spotHome.get(el).max; _spotMine.delete(el); }
    if (up && !was) spotPlace(el);
}
function spotWatch() {
    if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return;
    var els = FLOAT_IDS.filter(function(id) { return !Object.prototype.hasOwnProperty.call(FLOAT_WITH, id); }).map(function(id) { return document.getElementById(id); }).filter(Boolean);
    els.forEach(function(el) { _spotHome.set(el, { at: spotAt(el), parts: SPOT_PARTS.map(function(k) { return el.style[k] || ''; }), max: el.style.maxHeight || '' }); _spotWas.set(el, floatUp(el)); });
    var mo = new MutationObserver(function(recs) { recs.forEach(function(r) { spotSeen(r.target); }); });
    els.forEach(function(el) {
        mo.observe(el, { attributes: true, attributeFilter: ['style'] });
        if (typeof el.addEventListener === 'function') el.addEventListener(FLOAT_BACK, function() { spotPlace(el); });   // one that came up while put away, back on screen
    });
    var due = false;   // the window changed size: every box this put clear is put clear again, once a frame
    if (typeof window.addEventListener === 'function') window.addEventListener('resize', function() {
        if (due) return; due = true;
        var go = function() { due = false; els.forEach(function(el) { if (_spotMine.has(el)) spotPlace(el); }); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else setTimeout(go, 16);
    });
}
// [floatcheck:spotpage-end]

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
    if (typeof document.addEventListener === 'function') ['pointerdown', 'focusin'].forEach(function(type) { document.addEventListener(type, function(e) { var b = floatIn(e && e.target); if (b) floatUse(b); }, true); });   // a box pressed or given the focus is the box last used
}
// [floatcheck:watch-end]

// boxes(): every floating box, which a press is told by (backlog 143: whiteboard.js barPress puts a tool bar's open menu back under the box pressed)
// spot(want, up): the clear place for a box a module places itself (sheets.js placeHud, handbook.js readerPlace)
// last(): the box last used, of those that show (esckey.js: Escape closes Table Chat, the notepad, Sound or Music while one of them is it)
window.wpFloats = { sync: floatSync, reveal: floatReveal, leave: floatLeave, away: floatAway, shown: floatShown, view: floatNow, boxes: floatBoxes, spot: spotFind, last: floatLast };
watch();
spotWatch();
