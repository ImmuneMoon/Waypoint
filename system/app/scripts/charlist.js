/* The left panel's Characters section (1.5.4, backlog 56).
   The owner, 2026-10-10: "we still havent added a character sheets section for the left bar?" and then "lets do it before the map builder is
   finished". Picked by prompt on the sheet: it stands "Under Maps", lists "Players first, NPCs folded", wears the rail icon "A. One figure",
   and a right-click offers "Those, and Delete": Sheet, HUD, Find on the map, Delete sheet.

   The section lists the campaign's characters (camp.chars, the sheets themselves, never the tokens). For the GM: the characters players
   play, each with its player's name, then the NPCs under one fold. On a player's app: the characters that are their own and whole, and
   nobody else's. A click opens the sheet. Nothing is stored for the list: it is drawn from the campaign each time it changed, with
   createElement and text nodes only, since a character's name and a player's name come from a file or from the table. What a row does is
   the sheet module's to do and to judge (openSheet, openHud, askDeleteSheet): this module only asks. */
import { getActiveCampaign, getActiveMap } from './models.js';
import { state } from './state.js';
import { showPrompt } from './dialogs.js';
import { toast } from './io.js';
import { navigateToMap, updateSidebarNav } from './sidebar.js';

// [lookcheck:charlist-start]
var CHAR_NAME = 80, CHAR_ID = /^c_[A-Za-z0-9_]{1,24}$/;   // a name's length in a row (a sheet keeps a longer one); a sheet's id as the system core keeps one (systemcore CHAR_ID)
function charText(v, n) { return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n); }
// The section's rows from a campaign's characters. chars: camp.chars, read by its own keys. names: player id -> name. me: '' for the GM, a
// player's own id on their app. A copy held only for its hover (partial) is nobody's row. The GM: the characters players play, then the
// NPCs, each list by name. A player: the characters that are theirs, and no NPC
function charRowsOf(chars, names, me) {
    var out = { players: [], npcs: [] }, own = typeof me === 'string' && me ? me : '', nm = names && typeof names === 'object' ? names : {};
    if (!chars || typeof chars !== 'object') return out;
    Object.keys(chars).forEach(function(id) {
        var c = chars[id]; if (!CHAR_ID.test(id) || !c || typeof c !== 'object' || c.partial || c.id !== id) return;   // a sheet under its own plain id: what the sheet module opens by
        if (own && c.ownerId !== own) return;
        var owner = typeof c.ownerId === 'string' ? c.ownerId : '';
        var row = { id: id, name: (charText(c.name, CHAR_NAME) || 'Unnamed') + (c.making === 1 ? ' (being made)' : ''), who: '' };
        if (!own && !c.npc) row.who = owner ? (Object.prototype.hasOwnProperty.call(nm, owner) && charText(nm[owner], 40)) || 'a player' : 'no player';
        (c.npc && !own ? out.npcs : out.players).push(row);
    });
    var by = function(a, b) { return a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); };
    out.players.sort(by); out.npcs.sort(by);
    return out;
}
// The list, drawn: elements made by name and text nodes, never markup. gm: the Players label and the NPCs' fold; open: whether that fold is
// open. An empty list says how a sheet is made. Answers the number of characters it holds
function charDraw(doc, box, model, gm, open) {
    while (box.firstChild) box.removeChild(box.firstChild);
    var el = function(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.appendChild(doc.createTextNode(text)); return e; };
    var rowOf = function(r) {
        var d = el('div', 'sidebar-item ch-row'); d.dataset.char = r.id; d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0');
        d.appendChild(el('span', 'si-title', r.name)); if (r.who) d.appendChild(el('small', 'ch-who', r.who));
        return d;
    };
    var n = model.players.length + model.npcs.length;
    if (!n) { if (gm) box.appendChild(el('div', 'nav-empty', 'No characters yet. Press + above to make a sheet, or right-click a token.')); return 0; }
    if (gm && model.players.length) box.appendChild(el('div', 'ch-sub', 'Players'));
    model.players.forEach(function(r) { box.appendChild(rowOf(r)); });
    if (gm && model.npcs.length) {
        var f = el('button', 'ch-fold', (open ? '\u25be ' : '\u25b8 ') + 'NPCs, ' + model.npcs.length); f.type = 'button'; f.setAttribute('aria-expanded', open ? 'true' : 'false');
        box.appendChild(f);
        var list = el('div', 'ch-npcs'); list.hidden = !open;
        model.npcs.forEach(function(r) { list.appendChild(rowOf(r)); });
        box.appendChild(list);
    }
    return n;
}
// What was drawn, as a text: the list is drawn again only when this changed
function charSig(model, gm, open) { return JSON.stringify([gm ? 1 : 0, open ? 1 : 0, model.players.map(function(r) { return [r.id, r.name, r.who]; }), model.npcs.map(function(r) { return [r.id, r.name]; })]); }
// A character's token to go to: on the map on screen before any other, a shown one before one the GM hid; hidden ones only for the GM (all).
// items: camp.items. Answers { map, tok } or null
function charTokenOf(items, charId, activeId, all) {
    var best = null, rank = -1;
    if (!items || typeof items !== 'object' || typeof charId !== 'string' || !charId) return null;
    Object.keys(items).forEach(function(mid) {
        var m = items[mid]; if (!m || m.type !== 'map' || !Array.isArray(m.whiteboard)) return;
        m.whiteboard.forEach(function(w) {
            if (!w || typeof w !== 'object' || !w.isChar || w.waiting || w.charId !== charId || typeof w.id !== 'string') return;
            if (w.hidden && !all) return;
            var r = (m.id === activeId ? 2 : 0) + (w.hidden ? 0 : 1);
            if (r > rank) { rank = r; best = { map: m, tok: w }; }
        });
    });
    return best;
}
// The rows of a character's menu, as the owner picked them: Sheet, HUD where the sheet has one, Find on the map, Delete sheet
function charMenuRows(hud, del) {
    var rows = [{ act: 'sheet', text: 'Sheet\u2026' }];
    if (hud) rows.push({ act: 'hud', text: 'HUD\u2026' });
    rows.push({ rule: true }, { act: 'find', text: 'Find on the map' });
    if (del) rows.push({ rule: true }, { act: 'delete', text: 'Delete sheet\u2026', red: true });
    return rows;
}
function charNpcsRead(store) { try { return store.getItem('wp_charNpcs') === '1'; } catch (e) { return false; } }
function charNpcsKeep(store, open) { try { if (open === true) store.setItem('wp_charNpcs', '1'); else store.removeItem('wp_charNpcs'); return true; } catch (e) { return false; } }
// [lookcheck:charlist-end]

var _sig = null, _open = charNpcsRead(localStorage), _menu = null;
function sheets() { return window.wpSheets || null; }
function foreign() { var n = window.wpNet; return !!(n && (n.foreign || (n.active && n.role === 'client'))); }   // someone else's table on this screen, its link up or between attempts
function namesOf(camp) {
    var out = Object.create(null), n = window.wpNet;
    if (camp && camp.players && typeof camp.players === 'object') Object.keys(camp.players).forEach(function(pid) { var p = camp.players[pid]; if (p && typeof p === 'object') out[pid] = p.name || pid; });
    if (n && n.roster && typeof n.roster === 'object') Object.keys(n.roster).forEach(function(k) { var p = n.roster[k]; if (p && p.id) out[p.id] = p.name || p.id; });
    return out;
}
// The section as the campaign has it now. Put away, with its icon on the rail, where there is nothing to list for this screen: the stream
// window, Character sheets switched off, a player with no character of their own. Answers the number of characters listed
function sync() {
    var box = document.getElementById('charNavList'), sec = box && box.closest ? box.closest('.sidebar-section') : null, rb = document.getElementById('railCharacters'); if (!box || !sec) return 0;
    var camp = getActiveCampaign(), S = sheets(), client = foreign(), n = window.wpNet, me = client ? String((n && n.myId) || '\u0000') : '';
    var on = !!camp && !!S && !window.wpStream && (!window.wpVtt || !!window.wpVtt.on('sheets'));
    var model = on ? charRowsOf(camp.chars, namesOf(camp), me) : { players: [], npcs: [] }, count = model.players.length + model.npcs.length, show = on && (!client || count > 0);
    sec.hidden = !show; if (rb) rb.hidden = !show;
    var sig = show ? charSig(model, !client, _open) : '';
    if (sig !== _sig) { _sig = sig; if (show) charDraw(document, box, model, !client, _open); else while (box.firstChild) box.removeChild(box.firstChild); }
    return show ? count : 0;
}
function openOf(id) { var S = sheets(); if (!S || !S.canOpen || !S.canOpen(id)) { toast('That sheet cannot be opened here.'); return; } S.openSheet(id); }
function findOf(id) {
    var camp = getActiveCampaign(), S = sheets(), c = camp && S ? S.charById(id, camp) : null; if (!c) return;
    var hit = charTokenOf(camp.items, id, camp.activeItemId, !foreign());
    if (!hit) { toast(charText(c.name, CHAR_NAME) + ' has no token on a map.'); return; }
    if (!hit.tok.hidden && window.wpFocusCharacter) { window.wpFocusCharacter('i:' + hit.tok.id); return; }
    // a token the GM hid: the party's own finder passes over it, so the GM is taken there by hand
    hit.map.meta = hit.map.meta || {};
    hit.map.meta.lastWbX = hit.tok.x + (hit.tok.w || 60) / 2; hit.map.meta.lastWbY = hit.tok.y + (hit.tok.h || 52) / 2;
    if (camp.activeItemId !== hit.map.id) navigateToMap(hit.map.id);
    state.viewMode = 'visual'; state.selWbIds = [hit.tok.id]; state.selWbId = hit.tok.id;
    if (window.appRender) window.appRender();
    if (window.appRestoreCamera) window.appRestoreCamera();
    toast('Found ' + charText(c.name, CHAR_NAME) + '. Its token is hidden from players.');
}
function menuAway() { if (_menu) _menu.style.display = 'none'; }
function menuFor(id, x, y) {
    var S = sheets(), camp = getActiveCampaign(), c = camp && S ? S.charById(id, camp) : null; if (!c) return;
    if (!_menu) {
        _menu = document.createElement('div'); _menu.id = 'charMenu'; _menu.className = 'context-menu char-menu'; _menu.setAttribute('role', 'menu'); _menu.style.display = 'none';
        document.body.appendChild(_menu);
        _menu.addEventListener('click', function(e) {
            var b = e.target && e.target.closest ? e.target.closest('[data-act]') : null; if (!b) return;
            var act = b.dataset.act, cid = _menu.dataset.char; menuAway();
            var S2 = sheets(); if (!S2 || !cid) return;
            if (act === 'sheet') openOf(cid);
            else if (act === 'hud') { if (S2.hudFor(cid)) S2.openHud(cid); }
            else if (act === 'find') findOf(cid);
            else if (act === 'delete') { if (S2.askDeleteSheet) S2.askDeleteSheet(cid); }
        });
    }
    while (_menu.firstChild) _menu.removeChild(_menu.firstChild);
    _menu.dataset.char = id;
    var client = foreign(), del = client ? !!(c.ownerId && window.wpNet && c.ownerId === window.wpNet.myId && !c.partial) : !!(window.wpCanPersistLocal && window.wpCanPersistLocal());
    charMenuRows(!!(S.hudFor && S.hudFor(id)), del).forEach(function(r) {
        var d = document.createElement(r.rule ? 'div' : 'button');
        if (r.rule) d.className = 'menu-divider'; else { d.type = 'button'; if (r.red) d.className = 'danger'; d.dataset.act = r.act; d.setAttribute('role', 'menuitem'); d.appendChild(document.createTextNode(r.text)); }
        _menu.appendChild(d);
    });
    _menu.style.display = 'flex';
    if (window.wpClampMenu) window.wpClampMenu(_menu, x, y); else { _menu.style.left = x + 'px'; _menu.style.top = y + 'px'; }
}
function wire() {
    var box = document.getElementById('charNavList'); if (!box) return;
    var rowAt = function(t) { return t && t.closest ? t.closest('.ch-row') : null; };
    box.addEventListener('click', function(e) {
        var f = e.target && e.target.closest ? e.target.closest('.ch-fold') : null;
        if (f) { _open = !_open; charNpcsKeep(localStorage, _open); sync(); return; }
        var r = rowAt(e.target); if (r && r.dataset.char) openOf(r.dataset.char);
    });
    box.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var r = rowAt(e.target); if (!r || !r.dataset.char) return;
        e.preventDefault(); e.stopPropagation(); openOf(r.dataset.char);
    });
    box.addEventListener('contextmenu', function(e) {
        var r = rowAt(e.target); if (!r || !r.dataset.char) return;
        e.preventDefault(); e.stopPropagation(); menuFor(r.dataset.char, e.clientX, e.clientY);
    });
    document.addEventListener('pointerdown', function(e) { if (_menu && _menu.style.display !== 'none' && !(e.target && e.target.closest && e.target.closest('#charMenu'))) menuAway(); }, true);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') menuAway(); });
    var plus = document.getElementById('newCharBtn');
    if (plus) plus.addEventListener('click', function(e) {
        e.stopPropagation();
        var S = sheets(); if (!S || !S.addCharacter || foreign() || !(window.wpCanPersistLocal && window.wpCanPersistLocal())) return;
        showPrompt('Name the character', 'New character', function(name) {
            if (name === null) return;
            var c = S.addCharacter(String(name || '').trim() || 'New character'); if (!c) return;
            sync(); if (S.canOpen(c.id)) S.openSheet(c.id);
        });
    });
    updateSidebarNav();   // the panel judges once more what it holds for this screen, the section among it (sidebar.js asks sync)
}
window.wpCharList = { sync: sync };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
