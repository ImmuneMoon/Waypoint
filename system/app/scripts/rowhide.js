/* The top row, hidden (1.5.4, backlog 107, the last step of the slim row).
   The owner, of the top of the window: "one slim row, with the option of hiding it". The passed mock-up: hidden, the row leaves a small tab
   at the top edge. And of what stays, by prompt: "Tabs and pills", so that a pause or an unread line of chat is never missed.

   The small arrow at the row's right end hides the row, and the tab at the top edge shows it again. Hidden, nothing is taken out of the
   page: the style sheet lifts the row off the layout by the one word row-hidden on the body, so the map has the whole window, and leaves
   in sight what says something: the map tabs, the pills with the clock, a player's video, Review and Update, and the chat button while a
   line is unread. Every control keeps its id and its handler, and the tour's card shows the row whole, since a step may point into it.
   Whether the row is hidden is this computer's own (wp_rowHidden).

   What stays in sight keeps clear of what stands at the top of a map (the owner, 2026-10-08, with pictures: "things need better vertical
   spacing", "the bar also blocks the ruler along the top and slightly to the left side"): the bar floats under the top ruler and past the
   left one, the tab stands in the corner where the two rulers meet, and the style sheet moves the minimap, the zoom box and the party strip
   down by the bar's height. This module tells the style sheet where the map's area begins (--mainleft). */

// [lookcheck:rowhide-start]
function hideRead(store) { try { return store.getItem('wp_rowHidden') === '1'; } catch (e) { return false; } }
function hideKeep(store, on) { try { if (on === true) store.setItem('wp_rowHidden', '1'); else store.removeItem('wp_rowHidden'); return true; } catch (e) { return false; } }
// The choice, written to the page: the body's one word, the tab shown only while the row is hidden, and the arrow saying which it is
function hideApply(doc, on) {
    var hid = on === true, tab = doc.getElementById('rowShowTab'), btn = doc.getElementById('rowHideBtn');
    doc.body.classList.toggle('row-hidden', hid);
    if (tab) tab.hidden = !hid;
    if (btn) btn.setAttribute('aria-pressed', hid ? 'true' : 'false');
    return hid;
}
// A press on the arrow or on the tab. on: hidden from now. w: the window, whose other modules are told: a menu of the row is put away
// with it, and the toolbar is fitted to the room the map has now. Answers what is so
function hideSet(doc, store, w, on) {
    var hid = hideApply(doc, on === true); hideKeep(store, hid);
    if (w.wpTopRow && typeof w.wpTopRow.close === 'function') w.wpTopRow.close();
    if (typeof w.wpFitBar === 'function') w.wpFitBar();
    var to = doc.getElementById(hid ? 'rowShowTab' : 'rowHideBtn'); if (to && typeof to.focus === 'function') to.focus();   // the focus goes to the control that undoes it
    return hid;
}
// Where the map's area begins, told to the style sheet as --mainleft. The tab that shows a hidden row stands in that area's top left corner and
// the row's bar beside it, whatever stands to their left: the rail, a docked panel with its grip, or nothing at all on a player's app that has
// nothing to read. Answers the number written, or null when there is nothing sound to write (the style sheet then keeps the rail's width)
function mainLeft(doc) {
    var m = doc.getElementById('main'), r = (m && typeof m.getBoundingClientRect === 'function') ? m.getBoundingClientRect() : null;
    var x = (r && typeof r.left === 'number') ? Math.round(r.left) : NaN;
    return (x >= 0 && x <= 4000) ? x : null;
}
function mainLeftApply(doc) {
    var x = mainLeft(doc); if (x === null) return null;
    doc.documentElement.style.setProperty('--mainleft', x + 'px');
    return x;
}
// [lookcheck:rowhide-end]

function wire() {
    var btn = document.getElementById('rowHideBtn'), tab = document.getElementById('rowShowTab');
    if (btn) btn.addEventListener('click', function() { hideSet(document, localStorage, window, true); });
    if (tab) tab.addEventListener('click', function() { hideSet(document, localStorage, window, false); });
    hideApply(document, hideRead(localStorage));
    mainLeftApply(document);
    var area = document.getElementById('main');
    if (area && typeof ResizeObserver === 'function') new ResizeObserver(function() { mainLeftApply(document); }).observe(area);   // the area changes size when the left panel is folded, opened, docked or dragged wider; main.js render() asks fit() too, since one redraw can move both of its edges
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpRowHide = { set: function(on) { return hideSet(document, localStorage, window, on === true); }, hidden: function() { return document.body.classList.contains('row-hidden'); }, fit: function() { return mainLeftApply(document); } };
