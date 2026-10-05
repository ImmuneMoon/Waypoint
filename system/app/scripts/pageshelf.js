/* Pages in a session (1.5.4, backlog 125).
   The owner, 2026-10-05: "the planners need a better way to be organized, its difficult finding the right on in session from the tree.
   the tree is good for organizing and using in prep, but doesnt hold up under session use", and "I like the planners having popouts but
   there needs to be a better system in place for finding everything you need and quickly making it available in a popout, and/or new
   window". By prompt: a plain click or Enter on the play map opens a page OVER THE MAP, Ctrl opens a window of its own, Alt the page
   itself to edit. And: "i dont want to lose being able to open planners in individual separate windows".

   This module is the one place that says where a page opens (pageWay) and the one place that opens it (openPage). Quick-jump and the
   play map's Next scene row ask it; nothing here draws markup. A page is a planner or a handbook page of the campaign on screen. */

import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save } from './io.js';
import { updateSidebarNav } from './sidebar.js';

// [shelfcheck:way-start]
// Where a page opens: 'panel' (over the map), 'window' (a window of its own) or 'go' (the page itself, where it is edited).
// On the play map a plain click or Enter opens it over the map, so the map stays. On any other view it goes to the page, as it always did.
// Ctrl (or the Mac's command key) asks for a window, Alt for the page itself and Shift for the panel, on every view.
function pageWay(view, ev) {
    var e = ev || {};
    if (e.ctrlKey || e.metaKey) return 'window';
    if (e.altKey) return 'go';
    if (e.shiftKey) return 'panel';
    return view === 'play' ? 'panel' : 'go';
}
// A page of a campaign by its own id: a planner or a handbook page, and nothing a prototype holds
function pageOf(camp, id) {
    var it = camp && camp.items && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null;
    return it && (it.type === 'planner' || it.type === 'doc') ? it : null;
}
// [shelfcheck:way-end]

function viewNow() { var fl = window.wpFloats; return fl && fl.view ? fl.view() : ''; }

// [shelfcheck:open-start]
// Opens a page of the campaign on screen the way that was asked for, and says how it opened: 'window', 'panel', 'go', 'reader', or ''
// when there is no such page. A window that cannot be opened falls back to the panel, and a panel that is not there to the page itself.
function openPage(id, way) {
    var camp = getActiveCampaign(), it = pageOf(camp, id); if (!it) return '';
    var n = window.wpNet, dp = window.wpDocPanel;
    if (n && n.foreign) {   // at someone else's table a page is read, never edited, and a planner is never there
        if (it.type === 'doc' && typeof window.wpOpenDoc === 'function') { window.wpOpenDoc(id); return 'reader'; }
        return '';
    }
    if (way === 'window') { if (dp && typeof dp.popOut === 'function' && dp.popOut(id)) return 'window'; way = 'panel'; }
    if (way === 'panel' && dp && typeof dp.open === 'function') { dp.open(id); return 'panel'; }
    camp.activeItemId = id; state.selId = null; state.selWbId = null; state.linkStart = null;
    updateSidebarNav(); if (window.appRender) window.appRender(); save(true);
    return 'go';
}
// [shelfcheck:open-end]

window.wpPageShelf = { way: pageWay, wayNow: function(ev) { return pageWay(viewNow(), ev); }, open: openPage };
