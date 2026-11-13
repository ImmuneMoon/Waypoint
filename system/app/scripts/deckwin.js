// deckwin.js: the left panel's Decks section and its window (1.6.2, backlog 210 d, fold 4; the owner, by prompt: "The left panel, as a section", and of a campaign's own decks, "a GM can add a house game, or a custom deck for one story, without editing the system"). A system's decks and a campaign's stand together, and a campaign's are built by the one editor. Drawing by hand goes through the host: a GM's press there at once, a player's by net.deckDo, judged as any message is. Elements and text nodes alone
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { cleanDecks, cleanPile, pileCounts } from './deckcore.js';
import { edit } from './deckui.js';
var CAMP_KEY = /^C[0-9]+$/, _sig = null, _at = '', _build = false;
function net() { return window.wpNet || null; }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.title = tip; return b; }
function atTable() { var n = net(); return !!n && n.active === true && n.role === 'client' && n.foreign === true; }
function gmHand() { if (atTable() || (net() && net().stream)) return false; return !(typeof window.wpCanPersistLocal === 'function' && window.wpCanPersistLocal() !== true); }
function decksOf(camp) { if (!camp) return []; var sysL = camp.system && Array.isArray(camp.system.decks) ? camp.system.decks : []; return sysL.map(function(d) { return { d: d, own: false }; }).concat(cleanDecks(camp.decks, true, CAMP_KEY).map(function(d) { return { d: d, own: true }; })); }
function countsOf(camp, d) { if (camp.pileN && Object.prototype.hasOwnProperty.call(camp.pileN, d.key)) return camp.pileN[d.key]; var p = camp.piles && Object.prototype.hasOwnProperty.call(camp.piles, d.key) ? cleanPile(camp.piles[d.key], d) : null; return pileCounts(p, d); }
function saysLeft(c) { return c.left + ' left' + (c.disc ? ', ' + c.disc + ' discarded' : ''); }
function handsFor(camp) {   // where a card may go: the hands this screen may reach
    var out = [], S = window.wpSystemCore, me = net() ? net().myId : '', gm = gmHand(), fields = camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : [];
    fields.forEach(function(f) { if (!f || f.kind !== 'item-list' || !f.list || !f.list.hand) return; Object.keys(camp.chars || {}).forEach(function(id) { var c = camp.chars[id]; if (!c || c.partial || c.making === 1) return; if (gm ? false : c.ownerId !== me) return; out.push([id + '|' + f.id, (c.name || 'A character') + ': ' + (f.label || 'A hand')]); }); if (gm) Object.keys(camp.chars || {}).forEach(function(id) { var c = camp.chars[id]; if (c && !c.partial && c.making !== 1) out.push([id + '|' + f.id, (c.name || 'A character') + ': ' + (f.label || 'A hand')]); }); });
    return out;
}
function drawRow(p, camp, it) {
    var d = it.d, gm = gmHand(), n = net(), row = el('div', 'dk-head'); if (!gm && d.open !== true) { p.appendChild(el('div', 'dk-count', 'Only the GM draws from this by hand.')); return; }
    var cnt = el('input', 'field dk-drawn'); cnt.type = 'number'; cnt.min = '1'; cnt.max = '20'; cnt.value = '1'; cnt.title = 'How many to draw';
    var to = el('select', 'field dk-to'), o0 = el('option', '', 'To the table'); o0.value = ''; to.appendChild(o0); handsFor(camp).forEach(function(h) { var o = el('option', '', h[1]); o.value = h[0]; to.appendChild(o); }); to.title = 'Where what is drawn goes';
    var go = btn('tool dk-draw', 'Draw', 'Draw from this'); go.addEventListener('click', function() { if (!n || typeof n.deckDo !== 'function') return; var bits = to.value ? to.value.split('|') : null, why = n.deckDo(d.key, 'draw', { n: Math.max(1, Math.min(20, Math.floor(Number(cnt.value) || 1))), charId: bits ? bits[0] : '', to: bits ? bits[1] : '' }); if (why) toast(why); });
    var cnL = countsOf(camp, d); if (cnL && cnL.left === 0) { go.disabled = true; go.title = gm ? (cnL.disc ? 'Nothing left to draw. Shuffle the discard in, or Start again' : 'Nothing left to draw. Start again puts back what no hand holds') : 'Nothing left to draw'; }   // the viewing of 2026-11-09: grayed with its reason, not a notice after the press
    row.appendChild(cnt); row.appendChild(to); row.appendChild(go); p.appendChild(row);
    if (gm) { var r2 = el('div', 'dk-head'), sh = btn('tool ghost sys-btn dk-shuffle', 'Shuffle the discard in', 'What was discarded goes back in'), re = btn('tool ghost sys-btn dk-reset', 'Start again', 'Everything but what hands hold goes back in'); if (cnL && !cnL.disc) { sh.disabled = true; sh.title = 'Nothing is discarded'; } sh.addEventListener('click', function() { var w = n && n.deckDo ? n.deckDo(d.key, 'shuffle', {}) : null; if (w) toast(w); }); re.addEventListener('click', function() { var w = n && n.deckDo ? n.deckDo(d.key, 'reset', {}) : null; if (w) toast(w); }); r2.appendChild(sh); r2.appendChild(re); p.appendChild(r2); }
}
function panelDraw() {
    var p = document.getElementById('deckBody'), camp = getActiveCampaign(), list = decksOf(camp), gm = gmHand(); if (!p) return; p.textContent = '';
    var it = list.filter(function(x) { return x.d.key === _at; })[0] || list[0] || null; if (it) _at = it.d.key;
    if (list.length > 1) { var sel = el('select', 'field dk-pick'); list.forEach(function(x) { var o = el('option', '', (x.d.label || 'A deck') + (x.own ? ' (this campaign)' : '')); o.value = x.d.key; sel.appendChild(o); }); sel.value = _at; sel.addEventListener('change', function() { _at = sel.value; _build = false; panelDraw(); }); p.appendChild(sel); }
    if (it) { if (list.length === 1) p.appendChild(el('div', 'dk-title', it.d.label || 'A deck')); p.appendChild(el('div', 'dk-count', (it.d.word || 'Deck') + ': ' + saysLeft(countsOf(camp, it.d)))); drawRow(p, camp, it); if (gm && !it.own) p.appendChild(el('div', 'dk-count', 'This one comes with the system. Change it in the System editor.')); }
    if (gm) {
        var b = btn('tool ghost sys-btn dk-build', _build ? 'Done' : 'Make a deck for this campaign', 'A deck or bag for this campaign alone. A roll cannot name one, so that no rule breaks when you remove it'); b.addEventListener('click', function() { _build = !_build; panelDraw(); }); p.appendChild(b);
        if (_build) { var host = el('div', 'dk-build-box'); p.appendChild(host); edit(host, { head: 'This campaign’s decks', note: 'Built like a system’s, and yours to change at any time.', prefix: 'C', list: function() { return Array.isArray(camp.decks) ? camp.decks : null; }, set: function(l) { if (l && l.length) camp.decks = l; else delete camp.decks; }, changed: function() { save(); var n = net(); if (n && typeof n.decksTell === 'function') n.decksTell(camp); sync(); } }); }
    } else if (!it) p.appendChild(el('div', 'dk-count', 'No decks here yet.'));
}
function open(key) { var el0 = document.getElementById('deckPanel'); if (!el0) return; if (typeof key === 'string') _at = key; el0.style.display = 'flex'; panelDraw(); if (window.wpFloats && window.wpFloats.reveal) window.wpFloats.reveal(el0); }
function close() { var el0 = document.getElementById('deckPanel'); if (el0) el0.style.display = 'none'; _build = false; }
function sync() {
    var box = document.getElementById('deckNavList'), sec = box && box.closest ? box.closest('.sidebar-section') : null, rb = document.getElementById('railDecks'), camp = getActiveCampaign(); if (!box) return;
    var list = decksOf(camp), gm = gmHand(), off = !!(net() && net().stream) || (!list.length && !gm); if (sec) sec.hidden = off; if (rb) rb.hidden = off;
    var sig = JSON.stringify(list.map(function(x) { return [x.d.key, x.d.label, countsOf(camp, x.d)]; }));
    if (sig !== _sig) { _sig = sig; box.textContent = ''; list.forEach(function(x) { var r = btn('ch-row dk-row', '', 'Open this'); r.appendChild(el('span', 'dk-rowname', x.d.label || 'A deck')); r.appendChild(el('span', 'dk-count', saysLeft(countsOf(camp, x.d)))); r.addEventListener('click', function() { open(x.d.key); }); box.appendChild(r); }); }
    var p = document.getElementById('deckPanel'); if (p && p.style.display !== 'none' && !_build) panelDraw();
}
function wire() {
    var add = document.getElementById('newDeckBtn'); if (add) add.addEventListener('click', function() { _build = true; open(); });
    var cl = document.getElementById('deckCloseBtn'); if (cl) cl.addEventListener('click', close);
    var head = document.getElementById('deckHead'), p = document.getElementById('deckPanel'); if (head && p) { var drag = null; head.addEventListener('pointerdown', function(e) { if (e.target && e.target.closest && e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; }); document.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = Math.max(0, e.clientX - drag.x) + 'px'; p.style.top = Math.max(0, e.clientY - drag.y) + 'px'; }); document.addEventListener('pointerup', function() { drag = null; }); }
    sync();
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
if (typeof window !== 'undefined') window.wpDeckWin = { sync: sync, open: open, close: close };
export { sync, open, close, handsFor };
