/* A map's places (1.6.3; a player's idea at the owner's game of 2026-11-15, the owner by prompt: "a list on the map thats interactable you can
   link to location pins, that reveal as the character sees the pin and it shows the name of the place with it"; the list stands "both" as a
   box at the map's edge and as a legend piece the GM lays on the map; a spot is a place by "A Place tick on any piece"; pressing a line finds
   the pin and shows where it leads; a player sees "Only places they have seen").

   placecore.js is the pure half and the one judge of what a place is (placeOf). This module draws:
   - the Places here box (#placesPanel, a floating box: floats.js FLOAT_IDS, sheets.js Z_BOXES, esckey.js ESC_LAST), opened by the top row's
     #placesBtn beside the map tabs, which shows on the play map alone;
   - a legend piece (type 'maplegend'), drawn on every screen by whiteboard.js's draw through legendDraw, each screen drawing the lines its
     own viewer may see;
   - a place pin (type 'mappin'), a small marker the GM lays from Add, ticked Place at once (pinDraw);
   - the Place tick and Place name box of a piece's Properties (fieldHtml, fieldWire, asked by inspector.js), the GM's alone.
   What a player's list holds is worked out on the player's own app from what it holds (fog.js placeSeen: what their tokens see now and what
   their screen remembers), so nothing new is sent. The GM's list shows every place and marks one no player's token has been seen to see
   on this computer while its box or a legend was up this session (that mark is only this screen's memory: it starts over at a reload, and it never
   reads a player's remembered ground, which only their own app holds). The stream window draws a legend as the party sees. Everything is drawn with elements and text nodes:
   a place's name is the GM's words and may come from a file. Steps log as places v1. */

import { getActiveCampaign, getActiveMap } from './models.js';
import { state } from './state.js';
import { save, toast } from './io.js';
import * as PC from './placecore.js';

var FIND_MS = 1600;   // how long a found pin stays lit (as the turn strip's own find)
var _pl = { card: '', sig: '', seen: Object.create(null), lit: null, litT: null, tick: null, memo: null, memoDrop: false };

// One step to the app's log (steplog.js): a step's name and counts, never a place's name
function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('places v1', s, f || {}); } catch (e) {} }
// An element by tag with a class and, where given, its words as a text node
function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.appendChild(doc.createTextNode(String(text))); return e; }
// Markup-safe text for the one place this module writes markup: the Properties field, which inspector.js lays as html
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// [placescheck:who-start]
// Who this screen draws for: 'stream' in the stream window, 'player' on a player's app (its link up or between attempts), else 'gm'
function whoOf(n, stream) { if (stream) return 'stream'; return n && (n.foreign || (n.active && n.role === 'client')) ? 'player' : 'gm'; }
// [placescheck:who-end]
function who() { return whoOf(window.wpNet, !!window.wpStream); }
// The GM's own screen of their own campaign, as boxes.js judges it: never a player's app, someone else's table or the stream window
function gmMay() { return who() === 'gm' && (typeof window.wpCanPersistLocal !== 'function' || window.wpCanPersistLocal() !== false); }
// A map's title on this screen, as placecore asks for a teleporter's default name (a player's app holds every map's title as a stub)
function titleOf(mapId) { var c = getActiveCampaign(), m = c && c.items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(c.items, mapId) ? c.items[mapId] : null; return m && m.meta && typeof m.meta.title === 'string' ? m.meta.title : ''; }
function ctx() { return { titleOf: titleOf }; }
// The play map is on screen
function viewOn() { var m = getActiveMap(); return !!m && m.type === 'map' && state.viewMode === 'visual'; }

// [placescheck:lines-start]
// The lines one screen draws for a map: placecore's places in reading order, numbered, judged for the viewer. seenOf(map, list) answers one
// true or false a place (fog.js placeSeen). A player and the stream window keep only the places their viewer has seen (placesSeenOnly fails
// closed: a judge that gives no answer of the right length keeps none). The GM keeps every place, and each one no player's token has been
// seen to see on this computer is marked (mark: true); store remembers, by map and piece, the places the GM's screen has found seen
// A player's and the stream window's list is judged whole and only then cut at LIST_MAX (placesOn with no cut), so a crowded map never hides
// places they have seen behind 200 they have not; the GM's is cut first, as it lists every place anyway
function linesFor(PCx, map, viewer, seenOf, store, cx) {
    var list = PCx.placesOn(map, cx, viewer === 'gm' ? undefined : Infinity), seen = typeof seenOf === 'function' ? seenOf(map, list) : list.map(function() { return true; });
    if (viewer !== 'gm') return PCx.placeLines(PCx.placesSeenOnly(list, seen).slice(0, PCx.LIST_MAX));
    var lines = PCx.placeLines(list);
    lines.forEach(function(l, i) { var k = (map && map.id) + '|' + l.id; if (Array.isArray(seen) && seen[i] === true && store) store[k] = 1; if (!(store && store[k] === 1)) l.mark = true; });
    return lines;
}
// [placescheck:lines-end]
// The lines for the map on screen, by fog.js's own reader where it is there (with no fog module there is no fog, so every place is seen).
// Worked out ONCE for a pass: every legend, every pin's label and the box ask it at each redraw and each slow look, and each working-out runs
// the fog's whole judgement of what is seen (fog.js placeSeen, revealedTiers), so the answer is kept for the map, its list of pieces and the
// viewer until the code running now is done (a microtask lets it go). A change made later, in another event, is always worked out afresh
function linesNow(map) {
    var w = who(), wb = map && Array.isArray(map.whiteboard) ? map.whiteboard : null, m = _pl.memo;
    if (m && m.map === map && m.wb === wb && m.n === (wb ? wb.length : 0) && m.who === w) return m.lines;
    var F = window.wpFog, seenOf = F && typeof F.placeSeen === 'function' ? function(mp, l) { return F.placeSeen(mp, l); } : null;
    var lines = linesFor(PC, map, w, seenOf, _pl.seen, ctx());
    _pl.memo = { map: map, wb: wb, n: wb ? wb.length : 0, who: w, lines: lines };
    if (!_pl.memoDrop) { _pl.memoDrop = true; Promise.resolve().then(function() { _pl.memo = null; _pl.memoDrop = false; }); }
    return lines;
}

// [placescheck:draw-start]
var LEGEND_INK = '#2b2418', LEGEND_INK_LIGHT = '#f1ead8';   // a legend's words on a light plate, and on a dark one
// The box's list, built into body with elements and text nodes alone. lines: placeLines' lines; card: the place whose card is open (a
// teleporter's), with cardOf(line) answering { title, closed, gm } for it; doc the page. A press is read by the box's own listener (data-id)
function listInto(body, lines, card, cardOf, viewer, doc) {
    while (body.firstChild) body.removeChild(body.firstChild);
    if (!lines.length) {
        body.appendChild(el(doc, 'div', 'places-empty muted', viewer === 'gm' ? 'No places on this map yet. Tick Place in a piece\u2019s Properties, or add a Place pin from Add.' : 'No places here that you have seen yet.'));
        return 0;
    }
    var ol = el(doc, 'ol', 'places-list');
    lines.forEach(function(l) {
        var li = el(doc, 'li', 'places-li'), b = el(doc, 'button', 'places-line' + (l.mark ? ' unseen' : '') + (card === l.id ? ' on' : ''));
        b.type = 'button'; b.dataset.id = l.id; b.title = l.to ? 'Find it on the map and see where it leads' : 'Find it on the map';
        b.appendChild(el(doc, 'span', 'places-n', l.n + '.')); b.appendChild(el(doc, 'span', 'places-name', l.name));
        if (l.to) { var t = el(doc, 'span', 'places-to', '\u2192'); t.setAttribute('aria-label', 'leads to another map'); b.appendChild(t); }
        if (l.mark) { var u = el(doc, 'span', 'places-unseen wib wi-unseen'); u.title = 'No player\u2019s token has seen it while your list or a legend was up. This starts over when you reload.'; u.setAttribute('aria-label', 'not seen by a player yet'); b.appendChild(u); }
        li.appendChild(b);
        if (card === l.id && l.to && typeof cardOf === 'function') li.appendChild(cardInto(doc, cardOf(l)));
        ol.appendChild(li);
    });
    body.appendChild(ol);
    return lines.length;
}
// A teleporter's card: where it leads (the destination map's title, as text), whether it is closed for now, and a slot for a small picture of
// that map (filled later by thumbInto). c: { title, closed, gm, to }
function cardInto(doc, c) {
    var card = el(doc, 'div', 'places-card');
    var top = el(doc, 'div', 'places-card-to'); top.appendChild(el(doc, 'span', 'muted', 'Leads to ')); top.appendChild(el(doc, 'b', '', c && c.title ? c.title : 'Another map')); card.appendChild(top);
    if (c && c.closed) card.appendChild(el(doc, 'div', 'places-card-closed', c.gm ? 'Closed to players for now.' : 'Closed for now.'));
    var slot = el(doc, 'span', 'places-card-pic'); slot.dataset.map = c && typeof c.to === 'string' ? c.to : ''; card.appendChild(slot);
    return card;
}
// A legend's own box: a title and the numbered lines, each a button that finds its place. ink: the words' color for the plate it is on
function legendInto(box, title, lines, ink, doc) {
    while (box.firstChild) box.removeChild(box.firstChild);
    box.style.color = ink;
    box.appendChild(el(doc, 'div', 'lg-title', title));
    if (!lines.length) { box.appendChild(el(doc, 'div', 'lg-empty', 'No places yet.')); return 0; }
    var ol = el(doc, 'ol', 'lg-list');
    lines.forEach(function(l) {
        var li = el(doc, 'li', 'lg-li'), b = el(doc, 'button', 'lg-line' + (l.mark ? ' unseen' : ''));
        b.type = 'button'; b.dataset.id = l.id; b.title = l.to ? 'Find it on the map and see where it leads' : 'Find it on the map';
        b.appendChild(el(doc, 'span', 'lg-n', String(l.n))); b.appendChild(el(doc, 'span', 'lg-name', l.name));
        if (l.to) b.appendChild(el(doc, 'span', 'lg-to', '\u2192'));
        li.appendChild(b); ol.appendChild(li);
    });
    box.appendChild(ol);
    return lines.length;
}
// The words' color for a plate of a hex color: dark words on a light plate, light words on a dark one; a color that is no hex reads as light
function inkFor(color) {
    var m = typeof color === 'string' ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim()) : null; if (!m) return LEGEND_INK;
    var h = m[1].length === 3 ? m[1].split('').map(function(c) { return c + c; }).join('') : m[1];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? LEGEND_INK_LIGHT : LEGEND_INK;
}
// [placescheck:draw-end]

// The piece a line names on the map on screen, or null
function pieceOf(map, id) { if (!map || !Array.isArray(map.whiteboard) || typeof id !== 'string') return null; for (var i = 0; i < map.whiteboard.length; i++) { var w = map.whiteboard[i]; if (w && w.id === id) return w; } return null; }
// A teleporter's card as this screen may show it: the title of the map it leads to and whether players may travel through it now (its own
// lock, the destination map locked for players, or this map locked for players, which closes it both ways: net.js travelBar's rules)
function cardOfLine(l) {
    var map = getActiveMap(), w = pieceOf(map, l.id), c = getActiveCampaign(), dest = c && c.items && Object.prototype.hasOwnProperty.call(c.items, l.to) ? c.items[l.to] : null;
    var closed = !!(w && w.portalLock === true) || !!(dest && dest.meta && dest.meta.playerLock) || !!(map && map.meta && map.meta.playerLock);
    return { title: titleOf(l.to), closed: closed, gm: who() === 'gm', to: l.to };
}
// The card's small picture of the destination map: mapshot.js draws it from what this screen holds (a player's own picture only of a map
// they have seen, its seenPic). Put in as an image whose address is that drawing as a PNG and nothing else, while its slot is still on the page
function thumbInto(body) {
    var MS = window.wpMapShot, slot = body && body.querySelector ? body.querySelector('.places-card-pic') : null; if (!MS || typeof MS.thumb !== 'function' || !slot || !slot.dataset.map) return;
    var put = function(url) { if (!slot.isConnected || slot.firstChild || typeof url !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+\/]+={0,2}$/.test(url)) return; var im = document.createElement('img'); im.alt = ''; im.src = url; slot.appendChild(im); slot.classList.add('on'); };
    try { var now = MS.thumb(slot.dataset.map, put); if (now) put(now); } catch (e) {}
}

// ---- the box ----
// The Places here box in the page (#placesPanel), or null where the page has none
function P() { return document.getElementById('placesPanel'); }
// Whether the box is up: it is put away by an inline display of none, as every floating box of floats.js is
function shown() { var p = P(); return !!p && p.style.display !== 'none'; }
// Draws the box again where what it says changed; the focus stays on the line that had it. What it says includes the open teleporter card's
// own words (the destination map's title, whether the way is closed for now, the map it leads to), worked out before the comparison, so a
// lock or a rename the GM makes while the card is open shows at the next slow look and not only when the box is opened again
function draw(force) {
    var p = P(), body = document.getElementById('placesBody'), map = getActiveMap(); if (!p || !body || !shown()) return;
    if (!viewOn()) { close(); return; }
    var lines = linesNow(map);
    if (_pl.card && !lines.some(function(l) { return l.id === _pl.card && l.to; })) _pl.card = '';
    var cl = _pl.card ? lines.filter(function(l) { return l.id === _pl.card; })[0] : null, cw = cl ? cardOfLine(cl) : null;
    var sig = PC.placesSig(lines, [map && map.id, _pl.card, who(), cw ? cw.title : '', cw ? (cw.closed ? 1 : 0) : '', cw ? cw.to : ''].join('|'));
    var tt = document.getElementById('placesTitle'); if (tt) { var t = 'Places here'; if (tt.textContent !== t) tt.textContent = t; }
    if (!force && sig === _pl.sig) return;
    var a = document.activeElement, keep = a && body.contains(a) && a.dataset ? a.dataset.id : '';
    _pl.sig = sig;
    listInto(body, lines, _pl.card, function() { return cw; }, who(), document);
    if (_pl.card) thumbInto(body);
    if (keep) { var b = body.querySelector('.places-line[data-id="' + (window.CSS && CSS.escape ? CSS.escape(keep) : keep) + '"]'); if (b) b.focus(); }
}
// Opens the box (the top row's #placesBtn through toggle, and press for a teleporter's card): never in the stream window or off the play map.
// It is revealed through floats.js, so it shows on the view it was opened on, and drawn at once. Answers whether it opened
function open() {
    var p = P(); if (!p || who() === 'stream' || !viewOn()) return false;
    p.style.display = ''; if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    draw(true); step('open', { n: document.querySelectorAll('#placesBody .places-line').length, who: who() }); return true;
}
// Puts the box away (its own close, toggle, Escape through esckey.js ESC_LAST pressing #placesClose, and draw when the play map leaves the
// screen), with the open card shut and the signature forgotten, so the next open draws it whole
function close() { var p = P(); _pl.card = ''; if (!p || p.style.display === 'none') return; p.style.display = 'none'; _pl.sig = ''; step('close'); }
// The top row's map pin: opens the box, or puts it away where it is up
function toggle() { if (shown()) close(); else open(); }

// ---- a press on a line, in the box or on a legend ----
// Brings this screen's view to the piece and lights it for a moment (the board's own find light, wb-find-lit). Nothing is sent or stored
// beyond the view itself, which the board keeps as it keeps a pan by hand
function find(id) {
    var map = getActiveMap(), w = pieceOf(map, id), wrap = document.getElementById('whiteboardWrap'); if (!w || !wrap || state.viewMode !== 'visual') return false;
    var z = typeof state.zoomLevel === 'number' && state.zoomLevel > 0 ? state.zoomLevel : 1, wd = Number(w.w), ht = Number(w.h);
    var x = w.x + (isFinite(wd) && wd > 0 ? wd : 40) / 2, y = w.y + (isFinite(ht) && ht > 0 ? ht : 40) / 2;
    wrap.scrollLeft = Math.max(0, Math.round(x * z - wrap.clientWidth / 2)); wrap.scrollTop = Math.max(0, Math.round(y * z - wrap.clientHeight / 2));
    if (_pl.lit) { _pl.lit.classList.remove('wb-find-lit'); _pl.lit = null; } if (_pl.litT) { clearTimeout(_pl.litT); _pl.litT = null; }
    var e = state.wbEls && Object.prototype.hasOwnProperty.call(state.wbEls, id) ? state.wbEls[id] : null;
    if (e && e.classList) { e.classList.add('wb-find-lit'); _pl.lit = e; _pl.litT = setTimeout(function() { if (_pl.lit === e) { e.classList.remove('wb-find-lit'); _pl.lit = null; } _pl.litT = null; }, FIND_MS); }
    return true;
}
// A press: find the place, and for a teleporter open its card in the box (a second press in the box closes it). A place the screen no longer
// lists (the map moved on under the press) does nothing
function press(id, fromLegend) {
    var map = getActiveMap(), lines = map ? linesNow(map) : [], l = lines.filter(function(x) { return x.id === id; })[0]; if (!l) return false;
    find(id);
    if (l.to) { _pl.card = (_pl.card === id && !fromLegend) ? '' : id; if (!shown()) open(); else draw(true); }
    else if (_pl.card) { _pl.card = ''; draw(true); }
    step('press', { to: !!l.to, legend: !!fromLegend, who: who() });
    return true;
}

// ---- the pieces, drawn by whiteboard.js ----
// A legend: its title (the piece's own name, else the map's title) and the lines this screen's viewer may see, inside a box of its own so
// that whatever else the board puts in the piece stays. Drawn again only where what it says changed
function legendDraw(pe, item, map) {
    if (!pe || !item) return;
    var box = pe.querySelector(':scope > .lg-box');
    if (!box) {
        box = document.createElement('div'); box.className = 'lg-box'; pe.appendChild(box);
        box.addEventListener('pointerdown', function(e) { if (e.target.closest && e.target.closest('.lg-line')) e.stopPropagation(); });   // a line is a button: the piece's own drag never begins on it
        box.addEventListener('mousedown', function(e) { if (e.target.closest && e.target.closest('.lg-line')) e.stopPropagation(); });
        box.addEventListener('click', function(e) { var b = e.target.closest && e.target.closest('.lg-line'); if (!b) return; e.stopPropagation(); press(String(b.dataset.id || ''), true); });
        box.addEventListener('dblclick', function(e) { if (e.target.closest && e.target.closest('.lg-line')) e.stopPropagation(); });
    }
    var lines = map ? linesNow(map) : [], title = PC.cleanPlaceName(item.name) || PC.cleanPlaceName(map && map.meta ? map.meta.title : '') || 'Places';
    var ink = inkFor(item.color), w = Number(item.w), fs = Math.max(10, Math.min(28, Math.round((isFinite(w) && w > 0 ? w : 220) / 16)));
    var sig = PC.placesSig(lines, title + '|' + ink + '|' + fs + '|' + who());
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig; box.style.fontSize = fs + 'px';
    legendInto(box, title, lines, ink, document);
}
// A place pin: the map pin on a round plate in the pin's color, and the place's name under it while it is a place. The piece's own box draws
// nothing (its color is the pin's). The name hangs below the pin, outside its box and so outside the cell the fog judges, so on a player's app
// and in the stream window it is drawn only where the screen's own list holds the place (linesNow, the same judge as Places here and every
// legend): a pin at the edge of a fogged cell, or of the play area, never shows its name in ground the player does see. The GM always sees it
function pinDraw(pe, item, map) {
    if (!pe || !item) return;
    pe.style.background = 'transparent';
    var g = pe.querySelector(':scope > .mp-glyph'); if (!g) { g = document.createElement('span'); g.className = 'mp-glyph wi-marker'; g.setAttribute('aria-hidden', 'true'); pe.insertBefore(g, pe.firstChild); }
    var col = typeof item.color === 'string' && /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\))$/i.test(item.color.trim()) ? item.color.trim() : 'var(--gold)';
    if (g.style.getPropertyValue('--pin') !== col) g.style.setProperty('--pin', col);
    var p = map ? PC.placeOf(item, map, ctx()) : null, nm = p ? p.name : '', lab = pe.querySelector(':scope > .mp-name');
    if (nm && who() !== 'gm' && !linesNow(map).some(function(l) { return l.id === item.id; })) nm = '';
    if (nm) { if (!lab) { lab = document.createElement('span'); lab.className = 'mp-name'; pe.appendChild(lab); } if (lab.textContent !== nm) lab.textContent = nm; }
    else if (lab) lab.remove();
}

// ---- Properties, the GM's ----
// The Place tick and the Place name box, for a piece that may be a place (a hidden one too: it is listed once shown). The name's box shows the
// name the place has with none typed, greyed. Fixed words; the piece's own name through esc
function fieldHtml(w) {
    var map = getActiveMap(); if (!gmMay() || !map || !PC.placeKindOk(w, true)) return '';
    var on = PC.placeTicked(w, map), auto = PC.placeAuto(w, map), def = PC.placeDefault(w, map, ctx()), nm = PC.cleanPlaceName(w.placeName);
    var says = auto ? (PC.destOf(w, map) ? 'It leads to another map, so it is a place unless you untick it.' : 'It names a room, so it is a place unless you untick it.') : 'The map\u2019s list of places names it.';
    return '<div class="field check-row"><input type="checkbox" id="wbPlace" ' + (on ? 'checked' : '') + '> <label for="wbPlace" title="List it in Places here and on a legend. A player sees it once their token has seen it."><i class="wib wi-marker"></i> Place</label></div>'
        + (on ? '<div class="field"><label for="wbPlaceName">Place name</label><input type="text" id="wbPlaceName" maxlength="' + PC.NAME_MAX + '" value="' + esc(nm) + '" placeholder="' + esc(def) + '"></div>' : '')
        + '<div class="muted places-field-line">' + esc(w.hidden && on ? 'It is hidden, so no list names it until you show it.' : says) + '</div>';
}
// The tick: a piece that is a place with no tick (a room's pin, a teleporter) keeps place: false when unticked and loses the key when ticked
// again; any other piece the other way round. The name: kept as placecore cleans it, none where the box is left empty. One save each
function fieldWire(w) {
    var t = document.getElementById('wbPlace'), n = document.getElementById('wbPlaceName');
    if (t) t.addEventListener('change', function() {   // sync(true) after each: every legend says the change at once
        var map = getActiveMap(); if (!gmMay() || !map) return; var auto = PC.placeAuto(w, map);
        if (t.checked) { if (auto) delete w.place; else w.place = true; } else { if (auto) w.place = false; else delete w.place; }
        save(); step('tick', { on: t.checked, auto: auto }); if (typeof window.appRender === 'function') window.appRender(); sync(true);
    });
    if (n) n.addEventListener('change', function() {
        if (!gmMay()) return; var v = PC.cleanPlaceName(n.value);
        if (v) w.placeName = v; else delete w.placeName;
        save(); step('name', { set: !!v }); if (typeof window.appRender === 'function') window.appRender(); sync(true);
    });
}

// ---- Add: a place pin and a legend, the GM's ----
// Add's Place pin (#addPlacePinBtn): arms the board's placement (whiteboard.js wpArmPlacement) for a 40 px mappin already ticked Place;
// whiteboard.js wpPlaceCommit lays it at the next click and then asks placed, below
function addPin() {
    if (!gmMay() || typeof window.wpArmPlacement !== 'function') return;
    window.wpArmPlacement('mappin', { w: 40, h: 40, color: '#e0a54f', name: 'Place pin', place: true }, 'place pin'); step('add', { kind: 'pin' });
}
// Add's Legend (#addLegendBtn): arms a placement of a 240 by 200 maplegend that may be dragged to its size (wpPlace.sized), drawn by legendDraw
function addLegend() {
    if (!gmMay() || typeof window.wpArmPlacement !== 'function') return;
    window.wpArmPlacement('maplegend', { w: 240, h: 200, color: '#efe4c8', name: '' }, 'legend'); if (window.wpPlace) window.wpPlace.sized = true; step('add', { kind: 'legend' });
}
// Called by the board once a placed piece has landed: a pin opens Properties with its Place name ready to type
function placed(type, id) {
    if (type !== 'mappin' || !gmMay()) return;
    if (typeof window.wpOpenRightPanel === 'function') window.wpOpenRightPanel();
    setTimeout(function() { var n = document.getElementById('wbPlaceName'); if (n && state.selWbId === id) n.focus(); }, 60);
    toast('Name the place in Properties. A player sees it in Places here once their token has seen it.');
}

// ---- following the app ----
// The top row's button shows on the play map (never in the stream window) and the box follows the map on screen. A legend is drawn by the board
// at every redraw (whiteboard.js asks legendDraw); with legends true (the slow look below) every legend on the board is drawn again too, where
// what its viewer may see changed with no redraw (a token's sight, the fog)
function sync(legends) {
    var b = document.getElementById('placesBtn'), on = viewOn() && who() !== 'stream';
    if (b) { var d = on ? '' : 'none'; if (b.style.display !== d) b.style.display = d; b.classList.toggle('on', on && shown()); b.setAttribute('aria-expanded', on && shown() ? 'true' : 'false'); }
    if (shown()) { if (!on) close(); else draw(); }
    var map = getActiveMap(); if (legends !== true || !map || !Array.isArray(map.whiteboard) || !state.wbEls) return;
    var gm = who() === 'gm';   // a pin's name follows what is seen on a player's app and in the stream window only (pinDraw)
    map.whiteboard.forEach(function(w) {
        if (!w || !Object.prototype.hasOwnProperty.call(state.wbEls, w.id)) return;
        if (w.type === 'maplegend') legendDraw(state.wbEls[w.id], w, map); else if (w.type === 'mappin' && !gm) pinDraw(state.wbEls[w.id], w, map);
    });
}
// Whether the board holds something the slow look must draw again: a legend on every screen, a place pin on a player's app or in the stream window
function boardNeeds(map) { var gm = who() === 'gm'; return !!map && Array.isArray(map.whiteboard) && map.whiteboard.some(function(w) { return w && (w.type === 'maplegend' || (!gm && w.type === 'mappin')); }); }
// What each viewer may see moves with the fog, which redraws without asking anyone: a slow look while the box, a legend or a player's pin is up
function tick() { if (document.hidden) return; var map = getActiveMap(); if (shown() || boardNeeds(map)) sync(true); }
// Wires the page once it is loaded: the box's close, the top row's button, Add's two rows, a press on a line of the box, and the box's head,
// which drags it (as the container window's does). It also starts the slow look (tick, every 1.5 s), which is never stopped: it runs in every
// window that loads index.html, the stream window and a window of its own included, and does nothing there unless the play map is on screen
// with the box, a legend or a pin to draw
function wire() {
    var c = document.getElementById('placesClose'); if (c) c.addEventListener('click', close);
    var b = document.getElementById('placesBtn'); if (b) b.addEventListener('click', toggle);
    var ap = document.getElementById('addPlacePinBtn'); if (ap) ap.addEventListener('click', addPin);
    var al = document.getElementById('addLegendBtn'); if (al) al.addEventListener('click', addLegend);
    var body = document.getElementById('placesBody'); if (body) body.addEventListener('click', function(e) { var l = e.target.closest && e.target.closest('.places-line'); if (l) press(String(l.dataset.id || ''), false); });
    var p = P(), head = document.getElementById('placesHead'), drag = null; if (p && head) {   // the box moves by its head, as the container window does
        head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
        head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; p.dataset.placed = '1'; });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev) { head.addEventListener(ev, function() { drag = null; }); });
    }
    if (!_pl.tick) _pl.tick = setInterval(tick, 1500);
}
if (typeof window !== 'undefined') {
    window.wpPlaces = { open: open, close: close, toggle: toggle, sync: sync, shown: shown, press: press, find: find, legendDraw: legendDraw, pinDraw: pinDraw, fieldHtml: fieldHtml, fieldWire: fieldWire, placed: placed, lines: function() { var m = getActiveMap(); return m ? linesNow(m) : []; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
