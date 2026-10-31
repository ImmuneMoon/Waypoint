/* Pages in a session (1.5.4, backlog 125).
   The owner, 2026-10-05: "the planners need a better way to be organized, its difficult finding the right on in session from the tree.
   the tree is good for organizing and using in prep, but doesnt hold up under session use", and "I like the planners having popouts but
   there needs to be a better system in place for finding everything you need and quickly making it available in a popout, and/or new
   window". By prompt: a plain click or Enter on the play map opens a page OVER THE MAP, Ctrl opens a window of its own, Alt the page
   itself to edit; a session shelf on the play map; the pages for the map on screen. And: "i dont want to lose being able to open
   planners in individual separate windows".

   This module is the one place that says where a page opens (pageWay) and the one place that opens it (openPage). Quick-jump, the play
   map's Next scene row and the shelf ask it. A page is a planner or a handbook page of the campaign on screen.

   The shelf is the Pages button on the play map's toolbar. It lists the planners that play on the map on screen (a planner's node links
   to a map: that link is read, nothing is set up twice), the planner marked Next, the pages pinned for the session and the last ones
   opened. Pinned pages are the campaign's own (camp.pinnedPages) and never leave this machine: net.js strips the key from every copy it
   sends. Recent pages are this computer's (wp_recentp_<campaign>), as recent maps are. Everything the shelf draws is an element or a
   text node made here: a title from a campaign file never reaches markup. */

import { state } from './state.js';
import { getActiveCampaign, getActiveMap } from './models.js';
import { save, toast } from './io.js';
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

// [shelfcheck:shelf-start]
var SHELF = { pins: 24, recent: 8, here: 12, read: 400 };
function mapOf(camp, id) {
    var it = camp && camp.items && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null;
    return it && it.type === 'map' ? it : null;
}
// A name as one line of plain text. A title is text already and is shown as it stands; a node's name may hold typed markup, which is left out
function shelfLine(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 120); }
function shelfText(s, max) { return shelfLine(String(s == null ? '' : s).replace(/<[^>]*>/g, ''), max); }
function pageTitle(it) { return shelfLine(it && it.meta ? it.meta.title : '') || (it && it.type === 'doc' ? 'Page' : it && it.type === 'map' ? 'Map' : 'Planner'); }
// The pages pinned for the session as the campaign holds them: ids of pages that are there, each once, in their order, 24 at most
function pinnedOf(camp) {
    var out = [], seen = Object.create(null), src = camp && Array.isArray(camp.pinnedPages) ? camp.pinnedPages : [];
    for (var i = 0; i < src.length && i < SHELF.read && out.length < SHELF.pins; i++) { var id = src[i]; if (typeof id !== 'string' || seen[id] || !pageOf(camp, id)) continue; seen[id] = 1; out.push(id); }
    return out;
}
// Pin a page or take its pin off. Says what it did: 'pinned', 'unpinned', 'full' (24 are pinned already) or '' (no such page)
function pinToggle(camp, id) {
    if (!pageOf(camp, id)) return '';
    var list = pinnedOf(camp), at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1); else if (list.length >= SHELF.pins) return 'full'; else list.push(id);
    if (list.length) camp.pinnedPages = list; else delete camp.pinnedPages;
    return at >= 0 ? 'unpinned' : 'pinned';
}
// The last pages opened, as this computer kept them: read as data, so only ids of pages that are there count, each once, 8 at most
function recentClean(camp, raw) {
    var out = [], seen = Object.create(null), src = Array.isArray(raw) ? raw : [];
    for (var i = 0; i < src.length && i < SHELF.read && out.length < SHELF.recent; i++) { var id = src[i]; if (typeof id !== 'string' || seen[id] || !pageOf(camp, id)) continue; seen[id] = 1; out.push(id); }
    return out;
}
function recentAdd(camp, raw, id) {
    var list = recentClean(camp, raw); if (!pageOf(camp, id)) return list;
    return [id].concat(list.filter(function(x) { return x !== id; })).slice(0, SHELF.recent);
}
// A map and the maps it is nested in, nearest first, by the ids they are kept under
function mapChain(camp, mapId) {
    var out = [], id = mapId, cur = mapOf(camp, id);
    while (cur && out.length < 50 && out.indexOf(id) < 0) { out.push(id); id = cur.meta ? cur.meta.parentId : null; cur = mapOf(camp, id); }
    return out;
}
// The planners that play on a map: each planner one of whose nodes links to it (the link its own Open map line follows; a node drawn as
// a plain table shows no link and counts for none). One row a planner, with the name of its first such node and, where that node's block
// id is a sound one (LAND_AT, the landing's own rule), that id: the row opens the planner at that node (1.5.4, PLANNER_ORG_DESIGN 4.1)
var LAND_AT = /^[A-Za-z0-9_-]{1,64}$/;
function pagesFor(camp, mapId) {
    var out = []; if (!mapOf(camp, mapId)) return out;
    Object.keys(camp.items).forEach(function(id) {
        var it = camp.items[id]; if (!it || it.type !== 'planner' || !Array.isArray(it.blocks)) return;
        var n = 0, first = '', at = '';
        for (var i = 0; i < it.blocks.length && i < 4000; i++) { var b = it.blocks[i]; if (b && b.type === 'node' && b.mode !== 'table' && b.linkMapId === mapId) { if (!n) { first = shelfText(b.title, 80); at = typeof b.id === 'string' && LAND_AT.test(b.id) ? b.id : ''; } n++; } }
        if (n) { var r = { id: id, node: first, n: n }; if (at) r.at = at; out.push(r); }
    });
    return out;
}
// Names in the order a reader expects: 3.2 before 3.10, case left aside
function natCmp(a, b) {
    var x = String(a).toLowerCase().match(/\d+|\D+/g) || [], y = String(b).toLowerCase().match(/\d+|\D+/g) || [];
    for (var i = 0; i < x.length && i < y.length; i++) {
        var p = x[i], q = y[i], dn = /^\d/.test(p) && /^\d/.test(q);
        if (dn) { var d = parseInt(p, 10) - parseInt(q, 10); if (d) return d < 0 ? -1 : 1; }
        else if (p !== q) return p < q ? -1 : 1;
    }
    return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}
/* Pins on the map (the owner by prompt: "Pins on the map", as map notes and pins do in other VTTs). A piece of the play
   map may open a page: its own key, page, holds the id of a planner or a handbook page of the same campaign. The link is the GM's alone:
   net.js sends no piece with it (wireWbItem deletes the key) and a player's app keeps none (cleanHostWbItem); an import keeps it only as a
   plain id (cleanup.js). It is read only here: a link to a page that is gone, or to what is no page, is no link. */
var PIN_ID = /^[A-Za-z0-9_.:-]{1,80}$/, PIN_KINDS = { image: 1, rect: 1, circle: 1, hexagon: 1, diamond: 1 };
// Which pieces may carry one: a picture (a token is one) or a plain shape; never a waiting token or a GM note card. A text box, a pen
// line, a trigger zone and a light source carry none
function mapPinMay(w) { return !!w && typeof w === 'object' && typeof w.id === 'string' && PIN_KINDS[w.type] === 1 && !w.waiting && !w.gmNoteFor; }
// The page a piece opens, or null
function mapPinOf(camp, w) { return mapPinMay(w) && typeof w.page === 'string' && PIN_ID.test(w.page) ? pageOf(camp, w.page) : null; }
// Set a piece's page, or take it off (an id that names no page takes it off). Says what it did: 'set', 'cleared' or '' (nothing changed)
function mapPinPut(camp, w, id) {
    if (!w || typeof w !== 'object') return '';
    if (mapPinMay(w) && typeof id === 'string' && PIN_ID.test(id) && pageOf(camp, id)) { if (w.page === id) return ''; w.page = id; if (w.pageAt !== undefined) delete w.pageAt; return 'set'; }   // 1.6.0: another page, and the part of the old one goes
    if (w.page === undefined) return '';
    delete w.page; if (w.pageAt !== undefined) delete w.pageAt; return 'cleared';
}
// The pages a pin may name, for a list: planners first, then handbook pages, each by its name
function mapPinChoices(camp) {
    var out = []; if (!camp || !camp.items) return out;
    Object.keys(camp.items).forEach(function(id) { var it = PIN_ID.test(id) ? pageOf(camp, id) : null; if (it) out.push({ id: id, title: pageTitle(it), kind: it.type }); });
    return out.sort(function(a, b) { return (a.kind === b.kind ? 0 : a.kind === 'planner' ? -1 : 1) || natCmp(a.title, b.title); });
}
// The pages pinned to pieces of a map, each once, in the pieces' order
function mapPinsOn(camp, mapId) {
    var map = mapOf(camp, mapId), out = [], seen = Object.create(null);
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (mapPinOf(camp, w) && !seen[w.page]) { seen[w.page] = 1; out.push(w.page); } });
    return out;
}
/* 1.6.0, a map's scene page (backlog 26; the owner, 2026-10-29, by prompt: "Map's Properties, key P (Recommended)"). A map's Properties
   names one planner or handbook page of the same campaign, kept on the map as meta.scenePage, and P on the play map opens it by the one
   rule. It is the GM's alone: net.js takes the key off every map it sends and a player's app keeps none a host names (its two lists of a
   map's GM-only meta keys); an import keeps it only as a short plain id (cleanup.js). It is read only here: a page that is gone, or what is
   no page, is no scene page. */
function scenePageOf(camp, map) {
    var meta = map && typeof map === 'object' && map.type === 'map' && map.meta && typeof map.meta === 'object' ? map.meta : null;
    return meta && typeof meta.scenePage === 'string' && PIN_ID.test(meta.scenePage) ? pageOf(camp, meta.scenePage) : null;
}
// Set a map's scene page, or take it off (an id that names no page takes it off). Says what it did: 'set', 'cleared' or '' (nothing changed)
function scenePagePut(camp, map, id) {
    if (!map || typeof map !== 'object' || map.type !== 'map') return '';
    var meta = map.meta && typeof map.meta === 'object' ? map.meta : null;
    if (typeof id === 'string' && PIN_ID.test(id) && pageOf(camp, id)) { if (meta && meta.scenePage === id) return ''; if (!meta) meta = map.meta = {}; meta.scenePage = id; return 'set'; }
    if (!meta || meta.scenePage === undefined) return '';
    delete meta.scenePage; return 'cleared';
}
// What the shelf shows, in order: the planners of the map on screen (and the pages pinned to its pieces) and those of the maps it is nested
// in, the planner marked Next, the pinned pages, the last ones opened. A page stands once, in the first place it belongs; its row says
// whether it is pinned and whether it is Next
function shelfModel(camp, mapId, recentRaw) {
    var m = { where: [], next: [], pinned: [], recent: [] }; if (!camp || !camp.items) return m;
    var seen = Object.create(null), take = function(id) { if (seen[id]) return false; seen[id] = 1; return true; };
    var pins = pinnedOf(camp), pinned = Object.create(null); pins.forEach(function(id) { pinned[id] = 1; });
    var nextId = Object.keys(camp.items).filter(function(id) { var it = camp.items[id]; return !!it && it.type === 'planner' && !!it.meta && it.meta.status === 'next'; })[0] || '';
    var row = function(id, sub, at) { var it = camp.items[id], o = { id: id, title: pageTitle(it), kind: it.type, sub: sub || '', pinned: !!pinned[id], next: id === nextId }; if (at) o.at = at; return o; };   // at: the node a planner of this map opens at (Here and Around)
    var room = SHELF.here;
    mapChain(camp, mapId).forEach(function(mid, k) {
        if (room <= 0) return;
        var rows = pagesFor(camp, mid).filter(function(r) { return !seen[r.id]; }).map(function(r) { return row(r.id, r.node && r.node !== pageTitle(camp.items[r.id]) ? r.node + (r.n > 1 ? ' +' + (r.n - 1) : '') : '', r.at); });
        if (k === 0) mapPinsOn(camp, mid).forEach(function(id) { if (!seen[id] && !rows.some(function(r) { return r.id === id; })) rows.push(row(id, 'pinned on this map')); });   // a page a piece of this map opens belongs here too
        var scene = k === 0 && scenePageOf(camp, mapOf(camp, mid)) ? camp.items[mid].meta.scenePage : '';
        if (scene && !seen[scene] && !rows.some(function(r) { return r.id === scene; })) rows.push(row(scene, 'the scene page of this map'));   // 1.6.0: and the map's scene page, which P opens
        rows.sort(function(a, b) { return (a.next ? 0 : 1) - (b.next ? 0 : 1) || natCmp(a.title, b.title); });
        rows = rows.slice(0, room); rows.forEach(function(r) { seen[r.id] = 1; });   // the owed review, 2026-10-09: a row is seen once it is KEPT. Marked before the cut, a page past the limit stood nowhere on the shelf, pinned or not
        if (rows.length) { m.where.push({ map: mid, title: pageTitle(camp.items[mid]), here: k === 0, rows: rows }); room -= rows.length; }
    });
    if (nextId && take(nextId)) m.next.push(row(nextId));
    pins.forEach(function(id) { if (take(id)) m.pinned.push(row(id)); });
    recentClean(camp, recentRaw).forEach(function(id) { if (take(id)) m.recent.push(row(id)); });
    return m;
}
// [shelfcheck:shelf-end]

// [shelfcheck:draw-start]
// The shelf's rows, made of elements and text nodes only. A row: the page (a click opens it by the rule), a window of its own, its pin
function shelfEl(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function shelfRow(r, marked) {   // marked: the planner marked Next wears its mark, wherever it stands but under Next scene itself
    var row = shelfEl('div', 'ps-row'); row.dataset.id = r.id;
    if (typeof r.at === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.at)) row.dataset.at = r.at;   // the node the row opens at: a block id, and nothing else, reaches the attribute
    var open = shelfEl('button', 'ps-open'); open.type = 'button';
    open.title = 'Open over the map. Ctrl+click opens a new window. Alt+click opens the page itself.';
    open.appendChild(shelfEl('span', 'ps-ico wib wi-' + (r.kind === 'doc' ? 'book' : 'page')));
    open.appendChild(shelfEl('span', 'ps-name', (r.next && marked ? '▶ ' : '') + r.title));
    if (r.sub) open.appendChild(shelfEl('span', 'ps-sub', r.sub));
    var win = shelfEl('button', 'ps-win wib wi-dup'); win.type = 'button'; win.title = 'Open in a window of its own';
    var pin = shelfEl('button', 'ps-pin wib wi-pin' + (r.pinned ? ' on' : '')); pin.type = 'button';
    pin.title = r.pinned ? 'Pinned for the session. Press to unpin.' : 'Pin for the session'; pin.setAttribute('aria-pressed', r.pinned ? 'true' : 'false');
    row.appendChild(open); row.appendChild(win); row.appendChild(pin);
    return row;
}
function shelfDraw(menu, m) {
    menu.textContent = '';
    var any = false, sec = function(label, rows, marked) { if (!rows.length) return; any = true; menu.appendChild(shelfEl('div', 'ps-head', label)); rows.forEach(function(r) { menu.appendChild(shelfRow(r, marked)); }); };
    m.where.forEach(function(g) { sec((g.here ? 'Here: ' : 'Around: ') + g.title, g.rows, true); });
    sec('Next scene', m.next, false); sec('Pinned', m.pinned, true); sec('Recent', m.recent, true);
    if (!any) menu.appendChild(shelfEl('div', 'ps-empty', 'No pages here yet. Pin a planner or a handbook page from its right-click menu in the left panel, or find one below.'));
    var foot = shelfEl('div', 'ps-foot'), find = shelfEl('button', 'ps-find', 'Find a page…'); find.type = 'button';
    foot.appendChild(find); foot.appendChild(shelfEl('span', 'ps-key', 'Ctrl+K')); menu.appendChild(foot);
    menu.appendChild(shelfEl('div', 'ps-note', 'A click opens a page over the map. Ctrl+click opens a new window. Alt+click opens the page itself.'));
}
// [shelfcheck:draw-end]

function viewNow() { var fl = window.wpFloats; return fl && fl.view ? fl.view() : ''; }

/* ---------- recent pages: this computer's, a campaign at a time ---------- */
// [shelfcheck:recent-start]
function recentKey(camp) { return 'wp_recentp_' + camp.id; }
function recentRead(camp) { try { return JSON.parse(localStorage.getItem(recentKey(camp)) || '[]'); } catch (e) { return []; } }
function recentNote(id) {
    var camp = getActiveCampaign(); if (!camp || typeof camp.id !== 'string' || !pageOf(camp, id)) return false;
    if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return false;   // another table's ids never reach this computer's settings
    try {
        var was = recentRead(camp), now = recentAdd(camp, was, id);
        if (JSON.stringify(was) === JSON.stringify(now)) return false;   // it is in front already: nothing is written
        localStorage.setItem(recentKey(camp), JSON.stringify(now)); return true;
    } catch (e) { return false; }
}
// [shelfcheck:recent-end]

// [shelfcheck:open-start]
// The landing a caller hands in: { at } a block of the page, { q } a search text (1.5.4, PLANNER_ORG_DESIGN 4.1). It is cleaned once, by the
// one cleaner (pagenav.js landOf), and what does not clean, or no cleaner, is no landing
function landClean(land) {
    var pn = window.wpPageNav; if (land == null || !pn || typeof pn.landOf !== 'function') return null;
    try { return pn.landOf(land) || null; } catch (e) { return null; }
}
// Opens a page of the campaign on screen the way that was asked for, and says how it opened: 'window', 'panel', 'go', 'reader', or ''
// when there is no such page. A window that cannot be opened falls back to the panel, and a panel that is not there to the page itself.
// A landing goes with every way, the fallbacks too; with none, each way is asked exactly as before
function openPage(id, way, land) {
    var camp = getActiveCampaign(), it = pageOf(camp, id); if (!it) return '';
    var n = window.wpNet, dp = window.wpDocPanel, to = landClean(land);
    if (n && n.foreign) {   // at someone else's table a page is read, never edited, and a planner is never there
        if (it.type === 'doc' && typeof window.wpOpenDoc === 'function') { if (to) window.wpOpenDoc(id, to); else window.wpOpenDoc(id); return 'reader'; }
        return '';
    }
    if (way === 'window') { if (dp && typeof dp.popOut === 'function' && (to ? dp.popOut(id, to) : dp.popOut(id))) return 'window'; way = 'panel'; }
    if (way === 'panel' && dp && typeof dp.open === 'function') { if (to) dp.open(id, to); else dp.open(id); return 'panel'; }
    camp.activeItemId = id; state.selId = null; state.selWbId = null; state.linkStart = null;
    updateSidebarNav(); if (window.appRender) window.appRender(); save(true);
    if (to && typeof window.wpPlannerLand === 'function') window.wpPlannerLand(id, to);   // the page itself lands once it is drawn (planner.js)
    return 'go';
}
// [shelfcheck:open-end]

// [shelfcheck:pagelink-start]
// 1.5.6: a link from one page to another, or to a section of it (textfmt.js pageLink: #wp:page:<id>, #wp:page:<id>:<block id>). linkgate.js
// decides the press and hands it here. The parts a link may land at are a page's title, its headings, its scene nodes and its titled tables.
var LINK_SECS = { h1: 1, h2: 1, h3: 1, node: 1, table: 1 }, LINK_ID = /^[A-Za-z0-9_-]{1,80}$/, LINK_MAX = 2000;
var LINK_GONE = 'That page is not in this campaign.', LINK_HID = 'That page has not been shared with you.';
function linkSecs(it) {
    var out = []; if (!it || !Array.isArray(it.blocks)) return out;
    for (var i = 0; i < it.blocks.length && i < SHELF.read * 10 && out.length < 300; i++) {
        var b = it.blocks[i]; if (!b || typeof b !== 'object' || !LINK_SECS[b.type] || typeof b.id !== 'string' || !LAND_AT.test(b.id)) continue;
        var t = shelfText(b.title, 80); if (t) out.push({ at: b.id, title: t });
    }
    return out;
}
// Every page of the campaign and each of its sections, as { addr, label }: the pages by name, each page's sections after it in their order
function linkChoices(camp) {
    var out = []; if (!camp || !camp.items || typeof camp.items !== 'object') return out;
    var ids = Object.keys(camp.items).filter(function(id) { return LINK_ID.test(id) && !!pageOf(camp, id); });
    ids.sort(function(a, b) { return natCmp(pageTitle(camp.items[a]), pageTitle(camp.items[b])); });
    ids.forEach(function(id) {
        var it = camp.items[id], t = pageTitle(it);
        out.push({ addr: '#wp:page:' + id, label: t });
        linkSecs(it).forEach(function(s) { if (s.title === t) return; out.push({ addr: '#wp:page:' + id + ':' + s.at, label: t + ' \u203a ' + s.title, sec: s.title }); });
    });
    return out.slice(0, LINK_MAX);
}
// What a page link names, in words: the page, and the section where it names one this page still has; '' where the page is not here
function linkWords(camp, id, at) {
    var it = pageOf(camp, id); if (!it) return '';
    var t = pageTitle(it), s = at ? linkSecs(it).filter(function(x) { return x.at === at; })[0] : null;
    return s ? t + ' \u203a ' + s.title : t;
}
// A press on a page link: opened by openPage's own ways, at its section where it names one; a page that is not here is said
function linkGo(id, at, way) {
    var camp = getActiveCampaign(), n = window.wpNet, gone = n && n.foreign ? LINK_HID : LINK_GONE;
    if (typeof id !== 'string' || !pageOf(camp, id)) { toast(gone); return ''; }
    var r = openPage(id, way, typeof at === 'string' && LAND_AT.test(at) ? { at: at } : null);
    if (!r) toast(gone);
    return r;
}
/* 1.6.0, a pin to one part of its page (backlog 32; the owner, 2026-10-29, by prompt). A pin may name one part of its page: the piece's own
   key pageAt, the block id of a heading, a scene node or a titled table of that page (the parts a page link may land at, linkSecs). It is
   the GM's as the pin is: net.js sends no piece with it and a player's app keeps none; an import keeps it only as a short plain id. A part
   that is gone, or a pin with no page, names none, and the pin opens at the top of its page as before */
function mapPinAtOf(camp, w) {
    var it = mapPinOf(camp, w); if (!it || typeof w.pageAt !== 'string' || !LAND_AT.test(w.pageAt)) return null;
    return linkSecs(it).filter(function(s) { return s.at === w.pageAt; })[0] || null;
}
// Set the part a pin names, or take it off (a part its page does not have takes it off). Says what it did: 'set', 'cleared' or ''
function mapPinAtPut(camp, w, at) {
    if (!w || typeof w !== 'object') return '';
    var it = mapPinOf(camp, w);
    if (it && typeof at === 'string' && LAND_AT.test(at) && linkSecs(it).some(function(s) { return s.at === at; })) { if (w.pageAt === at) return ''; w.pageAt = at; return 'set'; }
    if (w.pageAt === undefined) return '';
    delete w.pageAt; return 'cleared';
}
// [shelfcheck:pagelink-end]

// [shelfcheck:peek-start]
/* 1.6.0, the hover preview of a pin (backlog 32; the owner, 2026-10-29, by prompt): the first lines of its page, from the part the pin names
   or from the top, as plain text. A block's words are read from its own fields and markup is left out; a diagram's source, a raw block,
   code, a picture and a divider are passed over, and so is a line that only says again the name the tooltip already says. What this gives
   is put on the page only as text: the app's tooltip writes it with textContent */
var PEEK = { lines: 4, chars: 320, line: 120, read: 400 }, PEEK_SKIP = { diagram: 1, mermaid: 1, flowchart: 1, raw: 1, html: 1, code: 1, image: 1, divider: 1 };
var PEEK_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function peekPlain(s) {
    if (typeof s !== 'string' || !s) return '';
    var t = s.slice(0, 4000).replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '');
    t = t.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, function(m, b) {
        if (b[0] !== '#') return Object.prototype.hasOwnProperty.call(PEEK_ENT, b.toLowerCase()) ? PEEK_ENT[b.toLowerCase()] : m;
        var cp = b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10);
        return cp > 31 && cp < 0x110000 && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '';
    });
    return t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ');
}
// The first lines of a page, from the block whose id is at (or from the top), each a line of plain text; names: lines left out where they
// only say a name again
function peekLines(it, at, names) {
    var out = [], used = 0, blocks = it && Array.isArray(it.blocks) ? it.blocks : [], from = 0, skip = Object.create(null);
    (Array.isArray(names) ? names : []).forEach(function(n) { if (typeof n === 'string' && n) skip[n] = 1; });
    if (typeof at === 'string' && LAND_AT.test(at)) for (var k = 0; k < blocks.length && k < PEEK.read * 10; k++) { var bk = blocks[k]; if (bk && typeof bk === 'object' && bk.id === at) { from = k; break; } }
    for (var i = from; i < blocks.length && i < from + PEEK.read && out.length < PEEK.lines; i++) {
        var b = blocks[i]; if (!b || typeof b !== 'object' || PEEK_SKIP[b.type] === 1) continue;
        ['title', 'sub', 'content', 'text', 'caption', 'must'].forEach(function(key) {
            if (out.length >= PEEK.lines || used >= PEEK.chars || !Object.prototype.hasOwnProperty.call(b, key)) return;
            peekPlain(b[key]).split('\n').forEach(function(raw) {
                var line = raw.replace(/\s+/g, ' ').trim(); if (!line || skip[line] === 1 || out.length >= PEEK.lines || used >= PEEK.chars) return;
                var cut = Array.from(line); if (cut.length > PEEK.line) line = cut.slice(0, PEEK.line - 1).join('').trim() + '\u2026';
                if (used + line.length > PEEK.chars) line = Array.from(line).slice(0, Math.max(1, PEEK.chars - used - 1)).join('').trim() + '\u2026';
                out.push(line); used += line.length;
            });
        });
    }
    return out;
}
// [shelfcheck:peek-end]

/* ---------- pins ---------- */
// [shelfcheck:pins-start]
function isPinned(id) { var camp = getActiveCampaign(); return !!camp && pinnedOf(camp).indexOf(id) >= 0; }
function pinLabel(id) { return isPinned(id) ? 'Unpin from the session' : 'Pin for the session'; }
// The pin on the page panel's head follows the page in the panel
function panelSync() {
    var b = document.getElementById('docPanelPin'), dp = window.wpDocPanel, id = dp && dp.openId ? dp.openId() : '';
    if (!b) return;
    var on = !!id && isPinned(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Pinned for the session: it is on the Pages shelf of the play map. Press to unpin.' : 'Pin this page for the session: it goes on the Pages shelf of the play map';
}
function pinPage(id) {
    var camp = getActiveCampaign(), did = pinToggle(camp, id); if (!did) return '';
    if (did === 'full') { toast('The shelf holds ' + SHELF.pins + ' pinned pages. Unpin one first.'); return did; }
    save(true); panelSync(); if (shelfIsOpen()) shelfRender();
    toast(did === 'pinned' ? 'Pinned. It is on the Pages shelf of the play map now.' : 'Unpinned.');
    return did;
}
// [shelfcheck:pins-end]

/* ---------- pins on the map: what the board and Properties ask ---------- */
// [shelfcheck:mappin-start]
// Whose screen sees and sets pins: the GM's own. Never a player's app, the stream window or a window of its own
function mapPinGm() { var n = window.wpNet; return !(window.wpStream || window.wpPopout || (n && (n.foreign || (n.active && n.role === 'client')))); }
// The page a piece opens, for the board: its id and its name, or null
function mapPin(w) {
    var camp = mapPinGm() ? getActiveCampaign() : null, it = camp ? mapPinOf(camp, w) : null; if (!it) return null;
    var r = { id: w.page, title: pageTitle(it) }, s = w.pageAt !== undefined ? mapPinAtOf(camp, w) : null;   // 1.6.0: and the part it names, where it names one its page has
    if (s) { r.at = s.at; r.sec = s.title; }
    return r;
}
// What Properties shows for a piece: the page it opens now and the pages on offer, or null where there is nothing to show
function mapPinField(w) {
    var camp = mapPinGm() ? getActiveCampaign() : null; if (!camp || !mapPinMay(w)) return null; var it = mapPinOf(camp, w), f = { cur: it ? w.page : '', choices: mapPinChoices(camp) };
    if (it) { var s = w.pageAt !== undefined ? mapPinAtOf(camp, w) : null; f.at = s ? s.at : ''; f.secs = linkSecs(it); }   // 1.6.0: the part the pin names, and the parts its page has
    return f;
}
function mapPinSet(w, id) { return mapPinGm() ? mapPinPut(getActiveCampaign(), w, id) : ''; }
function mapPinAtSet(w, at) { return mapPinGm() ? mapPinAtPut(getActiveCampaign(), w, at) : ''; }
// 1.6.0: the first lines of a pin's page, from the part it names, as one plain text: '' where the page is not there or this is not the GM's
// screen. Read when the pointer comes to rest on the mark, so it is the page as it stands then
function mapPinPeek(id, at) {
    var camp = mapPinGm() ? getActiveCampaign() : null, it = camp && typeof id === 'string' && PIN_ID.test(id) ? pageOf(camp, id) : null; if (!it) return '';
    var sec = typeof at === 'string' && LAND_AT.test(at) ? linkSecs(it).filter(function(s) { return s.at === at; })[0] : null;
    return peekLines(it, sec ? sec.at : '', [pageTitle(it), sec ? sec.title : '']).join('\n');
}
// [shelfcheck:mappin-end]

/* ---------- a map's scene page: what Properties asks, and P on the play map ---------- */
// [shelfcheck:scene-start]
// What a map's Properties shows: its scene page now and the pages on offer, or null where there is nothing to show (not the GM's screen)
function scenePageField(map) { var camp = mapPinGm() ? getActiveCampaign() : null; if (!camp || !map || typeof map !== 'object' || map.type !== 'map') return null; return { cur: scenePageOf(camp, map) ? map.meta.scenePage : '', choices: mapPinChoices(camp) }; }
function scenePageSet(map, id) { return mapPinGm() ? scenePagePut(getActiveCampaign(), map, id) : ''; }
// The scene page of the map on screen, for the map's right-click menu: its id and its name, or null
function scenePageNow() { var camp = mapPinGm() ? getActiveCampaign() : null, map = camp ? getActiveMap() : null, it = camp && map ? scenePageOf(camp, map) : null; return it ? { id: map.meta.scenePage, title: pageTitle(it) } : null; }
var SCENE_NONE = 'This map has no scene page yet. With nothing selected, open Properties at the right edge and pick one under Scene page.';
// The scene page of the map on screen opened by the one rule: commands.js's Scene page runs it (its key, Shift+P, the owner's ruling of
// 2026-10-29: "Pen keeps P"; any key of your own in Settings, Keys; and the quick jump). Says how it opened (openPage's answer), 'none'
// where the map names no page, or '' where it is not this screen's to open
function sceneOpen(ev) {
    if (!mapPinGm() || viewNow() !== 'play') return '';
    var camp = getActiveCampaign(), map = getActiveMap(), it = camp && map ? scenePageOf(camp, map) : null;
    if (!it) { toast(SCENE_NONE); return 'none'; }
    return openPage(map.meta.scenePage, pageWay('play', ev));
}
// [shelfcheck:scene-end]

/* ---------- the shelf on the play map's toolbar ---------- */
function shelfMenu() { return document.getElementById('pagesMenu'); }
function shelfIsOpen() { var m = shelfMenu(); return !!(m && m.classList.contains('show')); }
function shelfClose() { var m = shelfMenu(); if (m && m.classList.contains('show')) { m.classList.remove('show'); m.textContent = ''; } }   // its rows go with it: nothing unseen is left to tab into
function shelfRender() {
    var menu = shelfMenu(), camp = getActiveCampaign(), map = getActiveMap(); if (!menu) return;
    shelfDraw(menu, shelfModel(camp, map && map.type === 'map' ? map.id : '', camp && typeof camp.id === 'string' ? recentRead(camp) : []));
}
// A page was opened in the panel or in a window of its own (docpanel.js says so), or is the item on screen (the tree says so)
function pageOpened(id) { recentNote(id); panelSync(); }
function noteActive() {
    var camp = getActiveCampaign(); if (camp && pageOf(camp, camp.activeItemId)) recentNote(camp.activeItemId);
    if (shelfIsOpen() && viewNow() !== 'play') shelfClose();   // the shelf belongs to the play map's toolbar: it is not left open behind another view
}

// [shelfcheck:wire-start]
// 1.5.4: the shelf stands centred on its button, and in a narrow window it ran past the window's edge (found live: 46 px past it at 1000 px,
// the rows' pins cut off). Shown, it is moved back inside, 8 px clear of either edge, and again as the window changes size, once the tool
// bar has been fitted to the new size (whiteboard.js fitBar, which a resize observer runs before the next task)
function shelfFit(m) {
    if (!m || !m.style || typeof m.getBoundingClientRect !== 'function') return;
    m.style.marginLeft = '';
    var W = window.innerWidth; if (!(W > 0)) return;
    var r = m.getBoundingClientRect(), dx = 0;
    if (r.right > W - 8) dx = W - 8 - r.right;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (dx) m.style.marginLeft = (dx < 0 ? Math.floor(dx) : Math.ceil(dx)) + 'px';
}
function shelfWire() {
    var btn = document.getElementById('pagesBtn'), menu = shelfMenu();
    if (btn && menu) {
        btn.addEventListener('click', function() { if (shelfIsOpen()) shelfClose(); else { shelfRender(); menu.classList.add('show'); shelfFit(menu); } });
        menu.addEventListener('click', function(e) {
            e.stopPropagation();   // a row redrawn under the click must not read as a click outside the menu
            var t = e.target, at = function(sel) { return t && t.closest ? t.closest(sel) : null; }, row = at('.ps-row'), id = row ? row.dataset.id : '';
            var land = row && row.dataset.at ? { at: row.dataset.at } : null;   // a row of Here or Around opens at its node, by either press
            if (at('.ps-find')) { shelfClose(); if (window.wpCmdkOpen) window.wpCmdkOpen(); return; }
            if (!id) return;
            if (at('.ps-pin')) { pinPage(id); return; }
            if (at('.ps-win')) { shelfClose(); openPage(id, 'window', land); return; }
            if (at('.ps-open')) { shelfClose(); openPage(id, pageWay(viewNow(), e), land); }
        });
        menu.addEventListener('keydown', function(e) { if (e.key === 'Escape') { e.stopPropagation(); shelfClose(); if (btn.focus) btn.focus(); } });
        document.addEventListener('click', function(e) { var t = e.target; if (shelfIsOpen() && !(t && t.closest && (t.closest('#pagesMenu') || t.closest('#pagesBtn')))) shelfClose(); });
        if (typeof window.addEventListener === 'function') window.addEventListener('resize', function() { setTimeout(function() { if (shelfIsOpen()) shelfFit(menu); }, 0); });
    }
    var treeRow = document.getElementById('ctxPinPage');
    if (treeRow) treeRow.addEventListener('click', function() { var cm = document.getElementById('sidebarContextMenu'), id = cm ? cm.dataset.id : ''; if (cm) cm.style.display = 'none'; if (id) pinPage(id); });
    var headPin = document.getElementById('docPanelPin');
    if (headPin) headPin.addEventListener('click', function() { var dp = window.wpDocPanel, id = dp && dp.openId ? dp.openId() : ''; if (id) pinPage(id); });
}
// [shelfcheck:wire-end]

window.wpPageShelf = { way: pageWay, wayNow: function(ev) { return pageWay(viewNow(), ev); }, open: openPage, isPinned: isPinned, pinLabel: pinLabel, pin: pinPage, opened: pageOpened, noteActive: noteActive, close: shelfClose, mapPin: mapPin, mapPinField: mapPinField, mapPinSet: mapPinSet,
    linkGo: linkGo, linkChoices: function() { return linkChoices(getActiveCampaign()); }, linkWords: function(id, at) { return linkWords(getActiveCampaign(), id, at); } };
shelfWire();
// 1.6.0, a map's scene page: what Properties, the map's right-click menu and the Scene page command (commands.js) ask
window.wpPageShelf.scenePageField = scenePageField; window.wpPageShelf.scenePageSet = scenePageSet; window.wpPageShelf.sceneOpen = sceneOpen; window.wpPageShelf.scenePage = scenePageNow;
// 1.6.0, a pin to one part of its page
window.wpPageShelf.mapPinAtSet = mapPinAtSet;
// 1.6.0, the hover preview of a pin
window.wpPageShelf.mapPinPeek = mapPinPeek;
