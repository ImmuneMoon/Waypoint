/* The top row's map tabs (1.5.4, backlog 107, step R2).
   The owner passed the mock-up of the slim row "as drawn". Of its tabs it says: your pinned maps first, then the last ones you opened; the
   map in front is the lighter chip, with its breadcrumb inside so that each parent is one press away; an eye and a number mark a map your
   players are on; the plus opens quick-jump; the Maps list in the left panel stays as it is.

   Nothing here is stored. The pinned maps are the campaign's own list (pinned from the play map's right-click menu, as before), the last
   maps opened are this computer's list, which the left panel keeps, and who is on a map is what the host's roster says now. A tab is a
   button made of elements with text: a map's name can come from a file, and a player's name comes from the wire.

   The tab in front is in the page: it holds the breadcrumb the row always had, which main.js still fills. The other tabs are made here. A
   player's app has no tabs: it holds only the map it is on, and its row says that map's name where it always did. */
import { getActiveCampaign } from './models.js';
import { navigateToMap } from './sidebar.js';

// [lookcheck:maptabs-start]
var TAB_PINS = 8, TAB_RECENT = 5, TAB_NAMES = 6;   // at most eight pinned maps and five of the last opened, and six names in a tooltip
var PIN_D = 'M8.5 3.5h7M10 3.5v5l-3.2 4.5h10.4L14 8.5v-5M12 13v7.5';   // a push pin, the drawing the owner passed on the sheet of thirteen
var EYE_D = 'M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';   // the eye of the fog's Reveal brush: one drawing wherever it is used
function tabMap(camp, id) {   // a map of the campaign by its own id, or nothing: never a name the list only inherits
    return typeof id === 'string' && !!camp && !!camp.items && Object.prototype.hasOwnProperty.call(camp.items, id) && !!camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
}
function tabTitle(m) { var t = m && m.meta && typeof m.meta.title === 'string' ? m.meta.title.trim() : ''; return t || 'Untitled'; }
function tabIds(v) { return Array.isArray(v) ? v.filter(function(x) { return typeof x === 'string'; }) : []; }
// The tabs of a campaign. recent: the maps last opened, the newest first. hereOf(id): the names of the players who are on that map now.
// Answers the tab in front (the map on screen, or none while a page is) and the others: the pinned maps in their order, then the last
// ones opened. A map has one tab.
function tabsModel(camp, recent, hereOf) {
    var seen = Object.create(null), out = { front: null, tabs: [] };
    var pins = tabIds(camp && camp.pinnedMaps).filter(function(id) { return !!tabMap(camp, id); });
    function one(id) {
        var m = tabMap(camp, id); if (!m || seen[id] === true) return null; seen[id] = true;
        var who = typeof hereOf === 'function' ? hereOf(id) : null;
        return { id: id, title: tabTitle(m), pinned: pins.indexOf(id) >= 0, who: Array.isArray(who) ? who.filter(function(n) { return typeof n === 'string' && n !== ''; }) : [] };
    }
    if (camp) out.front = one(camp.activeItemId);
    var np = 0, nr = 0;
    pins.forEach(function(id) { if (np < TAB_PINS) { var t = one(id); if (t) { out.tabs.push(t); np++; } } });
    tabIds(recent).forEach(function(id) { if (nr < TAB_RECENT) { var t = one(id); if (t) { out.tabs.push(t); nr++; } } });
    return out;
}
// What a tab says when it is pointed at: where a press goes, that it is pinned, and who is there
function tabTip(t, front) {
    var s = (front === true ? '' : 'Go to ') + t.title, n = t.who.length;
    if (t.pinned) s += '. Pinned';
    if (n) s += '. ' + (n === 1 ? '1 player is here: ' : n + ' players are here: ') + t.who.slice(0, TAB_NAMES).join(', ') + (n > TAB_NAMES ? ' and ' + (n - TAB_NAMES) + ' more' : '');
    return s + '.';
}
function tabIco(doc, d, cls) {
    var NS = 'http://www.w3.org/2000/svg', s = doc.createElementNS(NS, 'svg'), p = doc.createElementNS(NS, 'path');
    s.setAttribute('class', 'ico ' + cls); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.appendChild(p); return s;
}
function tabBtn(doc, t) {   // a pin where it is pinned, its name, and an eye with a count where players are on it
    var b = doc.createElement('button'), n = doc.createElement('span'); b.type = 'button'; b.className = 'map-tab'; b.setAttribute('data-id', t.id); b.title = tabTip(t, false);
    if (t.pinned) b.appendChild(tabIco(doc, PIN_D, 'mt-pin'));
    n.className = 'mt-name'; n.textContent = t.title; b.appendChild(n);
    if (t.who.length) { var c = doc.createElement('small'); c.textContent = String(t.who.length); b.appendChild(tabIco(doc, EYE_D, 'mt-eye')); b.appendChild(c); }
    return b;
}
var _tabSig = null;   // the tabs as they were last made: a redraw that changes nothing makes nothing, so a tab keeps the focus it has
// crumbUp: the breadcrumb is shown, and says the name of the map in front itself
function tabsDraw(doc, model, crumbUp) {
    var list = doc.getElementById('mapTabList'), front = doc.getElementById('mapTabFront'); if (!list || !front) return false;
    var f = model.front, name = doc.getElementById('mapTabName'), pin = doc.getElementById('mapTabPin'), here = doc.getElementById('mapTabHere'), n = doc.getElementById('mapTabHereN');
    front.hidden = !f;
    if (f) {
        front.title = tabTip(f, true);
        if (name) { name.textContent = f.title; name.hidden = crumbUp === true; }
        if (pin) pin.hidden = !f.pinned;
        if (here) here.hidden = !f.who.length;
        if (n) n.textContent = f.who.length ? String(f.who.length) : '';
    }
    var sig = JSON.stringify(model.tabs);
    if (sig !== _tabSig) { _tabSig = sig; while (list.firstChild) list.removeChild(list.firstChild); model.tabs.forEach(function(t) { list.appendChild(tabBtn(doc, t)); }); }
    return true;
}
// Who is on a map now, by name: the host's own roster, and nobody on a player's app or away from a table
function tabsHere(net, id) {
    if (!net || (net.active && net.role === 'client') || net.foreign || typeof net.playersOnMap !== 'function') return [];
    var ps = net.playersOnMap(id); return (Array.isArray(ps) ? ps : []).filter(function(p) { return !!p && p.connected === true; }).map(function(p) { return typeof p.name === 'string' ? p.name : ''; });
}
function tabsRecent(store, camp) {   // this computer's list of the maps last opened, which the left panel keeps
    try { var v = JSON.parse(store.getItem('wp_recent_' + camp.id) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
// [lookcheck:maptabs-end]

function tabsClip() { var list = document.getElementById('mapTabList'); if (list) list.classList.toggle('clip', list.scrollWidth > list.clientWidth + 1); }   // a list too long for the row fades out at its end
function tabsSync() {
    var camp = getActiveCampaign(), bc = document.getElementById('mapBreadcrumb'); if (!camp) return;
    var model = tabsModel(camp, tabsRecent(localStorage, camp), function(id) { return tabsHere(window.wpNet, id); });
    tabsDraw(document, model, !!bc && bc.style.display === 'flex'); tabsClip();
}
function wire() {
    var list = document.getElementById('mapTabList'), add = document.getElementById('mapTabAdd');
    if (list) list.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('.map-tab') : null, id = b ? b.getAttribute('data-id') : null; if (id && tabMap(getActiveCampaign(), id)) navigateToMap(id); });
    if (add) add.addEventListener('click', function() { if (window.wpCmdkOpen) window.wpCmdkOpen(); });
    window.addEventListener('resize', tabsClip);
    tabsSync();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpMapTabs = { sync: tabsSync };
