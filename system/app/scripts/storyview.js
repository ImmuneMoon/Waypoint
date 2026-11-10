/* The Story view (1.6.2, backlog 166 h; the owner, 2026-11-10, by prompt: "Story view, then timeline", "Planner = arc, cards = beats", "A window
   from the Pages shelf", "Also reorder"). A floating window over the map, the GM's, that lays the campaign out as its story: each planner an arc
   in the left panel's order, a planner nested under another one step in under it, and each arc's scene cards as its beats in the order they
   stand, coloured Played, Tonight or Ahead (cardcore sessionOf). A click opens the planner at that card by the page rule (pageshelf.js), a
   beat's three small buttons set its session (cardcore setSession), and a beat moves inside its planner by a drag or by Alt and an arrow key.
   Nothing new is stored: a beat is the planner's own scene card, and a change is the planner's own change, saved as one step of the GM's undo.
   Drawn with elements and text nodes only. Steps log as story v1. */
import { getActiveCampaign, getMapChildren } from './models.js';
import { save } from './io.js';
import * as CC from './cardcore.js';

// [storycheck:core-start]
var STORY_DEPTH = 6, STORY_PLANNERS = 400, STORY_BEATS = 400;
function storyText(v, n) { return typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 120) : ''; }
// A planner's beats: its scene cards in the order they stand, each { id, title, tag, s } with s its session ('played', 'tonight', 'ahead', '')
function storyBeats(pl) {
    var out = [];
    (Array.isArray(pl && pl.blocks) ? pl.blocks : []).slice(0, 2000).forEach(function(b) {
        if (out.length >= STORY_BEATS || !b || typeof b !== 'object' || b.type !== 'node' || CC.cardKind(b) !== 'scene' || typeof b.id !== 'string' || !b.id) return;
        out.push({ id: b.id, title: storyText(b.title, 120) || 'A scene', tag: storyText(b.tag, 40), s: CC.sessionOf(b) });
    });
    return out;
}
// The story of a campaign: its planners as arcs, [{ id, title, depth, beats }], in the left panel's order, each planner nested under another
// right after its parent and one step deeper (STORY_DEPTH at most, and never twice: a loop a file wrote ends where it closes). kids(parentId)
// hands the planners under a parent in order, null for the top
function storyModel(camp, kids) {
    var out = [], seen = Object.create(null);
    var walk = function(parent, depth) {
        if (depth > STORY_DEPTH) return;
        (kids(parent) || []).forEach(function(pl) {
            if (out.length >= STORY_PLANNERS || !pl || pl.type !== 'planner' || typeof pl.id !== 'string' || seen[pl.id]) return;
            seen[pl.id] = 1; out.push({ id: pl.id, title: storyText(pl.meta && pl.meta.title, 120) || 'A planner', depth: depth, beats: storyBeats(pl) });
            walk(pl.id, depth + 1);
        });
    };
    if (camp && camp.items && typeof kids === 'function') walk(null, 0);
    return out;
}
// How far a story has gone: { played, tonight, ahead, none }, counted over every beat
function storyCount(model) { var c = { played: 0, tonight: 0, ahead: 0, none: 0 }; (model || []).forEach(function(a) { a.beats.forEach(function(b) { c[b.s || 'none']++; }); }); return c; }
// A beat moved inside its planner: the scene card from put just before the scene card to, or just after it, every other block where it stood.
// A new list, or null where either is no scene card of these blocks, they are the same card, or nothing would move
function storyMove(blocks, from, to, after) {
    if (!Array.isArray(blocks) || typeof from !== 'string' || typeof to !== 'string' || from === to) return null;
    var isBeat = function(b) { return !!b && typeof b === 'object' && b.type === 'node' && CC.cardKind(b) === 'scene'; };
    var fi = -1, ti = -1; blocks.forEach(function(b, i) { if (!isBeat(b)) return; if (b.id === from && fi < 0) fi = i; if (b.id === to && ti < 0) ti = i; });
    if (fi < 0 || ti < 0) return null;
    var rest = blocks.slice(0, fi).concat(blocks.slice(fi + 1)), at = rest.indexOf(blocks[ti]) + (after === true ? 1 : 0);
    var out = rest.slice(0, at).concat([blocks[fi]], rest.slice(at));
    return out.every(function(b, i) { return b === blocks[i]; }) ? null : out;
}
// The beat next to one, by a step of -1 or 1 among a planner's beats: its id, or '' at an end
function storyStep(beats, id, d) { var i = (beats || []).map(function(b) { return b.id; }).indexOf(id), j = i + (d < 0 ? -1 : 1); return i < 0 || j < 0 || j >= beats.length ? '' : beats[j].id; }
// [storycheck:core-end]

var SESS = [['played', 'Played'], ['tonight', 'Tonight'], ['ahead', 'Ahead']];
var _sv = { drag: null };
function el(id) { return document.getElementById(id); }
function log(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('story v1', s, f || {}); } catch (e) {} }
function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
// Only the GM's own campaign on this computer: planners never reach a player's app
function storyMay() { var n = window.wpNet; return !!getActiveCampaign() && !(n && (n.foreign || (n.active && n.role === 'client'))) && !window.wpStream && !window.wpPopout; }
function P() { return el('storyPanel'); }
function shown() { var p = P(); return !!p && p.style.display !== 'none'; }
function plannerOf(camp, id) { var it = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null; return it && it.type === 'planner' ? it : null; }
function kidsOf(camp) { return function(parent) { return getMapChildren(camp, parent, 'planner'); }; }
function draw(focusId) {
    var body = el('storyBody'), camp = getActiveCampaign(); if (!body || !camp) return;
    var model = storyModel(camp, kidsOf(camp)), cnt = storyCount(model), sum = el('storySum');
    if (sum) sum.textContent = model.length ? cnt.played + ' played, ' + cnt.tonight + ' tonight, ' + cnt.ahead + ' ahead' + (cnt.none ? ', ' + cnt.none + ' not marked' : '') : '';
    body.textContent = '';
    if (!model.length) { body.appendChild(mk('div', 'sv-empty', 'No planners yet. A planner is an arc here, and its scene cards are its beats.')); return; }
    model.forEach(function(a) {
        var arc = mk('section', 'sv-arc'); arc.dataset.pl = a.id; if (a.depth) arc.style.marginLeft = (a.depth * 16) + 'px';
        var head = mk('button', 'sv-arc-title', a.title); head.type = 'button'; head.dataset.open = a.id; head.title = 'Open ' + a.title; arc.appendChild(head);
        var row = mk('div', 'sv-beats'); row.setAttribute('role', 'list');
        if (!a.beats.length) row.appendChild(mk('div', 'sv-none', 'No scene cards yet'));
        a.beats.forEach(function(b) {
            var bt = mk('div', 'sv-beat sv-' + (b.s || 'none')); bt.setAttribute('role', 'listitem'); bt.dataset.pl = a.id; bt.dataset.b = b.id; bt.draggable = true;
            var name = mk('button', 'sv-beat-name', b.title); name.type = 'button'; name.dataset.open = a.id; name.dataset.at = b.id;
            name.title = 'Open at ' + b.title + '. Drag, or Alt and an arrow key, to move it in its planner.'; bt.appendChild(name);
            if (b.tag) bt.appendChild(mk('span', 'sv-beat-tag', b.tag));
            var ss = mk('span', 'sv-sess'); ss.setAttribute('role', 'group'); ss.setAttribute('aria-label', 'Session');
            SESS.forEach(function(s) { var sb = mk('button', 'sv-s' + (b.s === s[0] ? ' on' : ''), s[1]); sb.type = 'button'; sb.dataset.sess = s[0]; sb.setAttribute('aria-pressed', b.s === s[0] ? 'true' : 'false'); sb.title = b.s === s[0] ? s[1] + '. Press again to take it off.' : 'Mark it ' + s[1]; ss.appendChild(sb); });
            bt.appendChild(ss); row.appendChild(bt);
        });
        arc.appendChild(row); body.appendChild(arc);
    });
    if (focusId) { var f = body.querySelector('.sv-beat[data-b="' + (/^[A-Za-z0-9_-]{1,80}$/.test(focusId) ? focusId : '') + '"] .sv-beat-name'); if (f) try { f.focus(); } catch (e) {} }
}
function changed(camp, pl, step, facts) { pl.meta = pl.meta || {}; pl.meta.updated = Date.now(); save(); if (typeof window.appRender === 'function') window.appRender(); log(step, facts); }   // the app's redraw draws the planner where it is open: the editor, the panel over the map
function setSess(plId, bId, s) {
    var camp = getActiveCampaign(), pl = plannerOf(camp, plId); if (!pl) return;
    var b = (pl.blocks || []).filter(function(x) { return x && x.id === bId && x.type === 'node'; })[0]; if (!b) return;
    CC.setSession(b, CC.sessionOf(b) === s ? '' : s); changed(camp, pl, 'session', { s: CC.sessionOf(b) || 'none' }); draw(bId);
}
function move(plId, from, to, after) {
    var camp = getActiveCampaign(), pl = plannerOf(camp, plId); if (!pl) return false;
    var nb = storyMove(pl.blocks, from, to, after); if (!nb) return false;
    pl.blocks = nb; changed(camp, pl, 'move', { after: after === true }); draw(from); return true;
}
function open() {
    var p = P(); if (!p || !storyMay()) return false;
    p.style.display = 'flex'; if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    draw(); log('open'); return true;
}
function close() { var p = P(); if (!p || p.style.display === 'none') return; p.style.display = 'none'; var b = el('storyBody'); if (b) b.textContent = ''; log('close'); }
function wire() {
    var p = P(), body = el('storyBody'); if (!p || !body) return;
    var c = el('storyClose'); if (c) c.addEventListener('click', close);
    var mb = el('storyCampBtn'); if (mb) mb.addEventListener('click', function() { if (!open() && typeof window.toast === 'function') window.toast('The Story view is the GM’s, on your own campaign.'); });
    body.addEventListener('click', function(e) {
        var t = e.target && e.target.closest ? e.target : null; if (!t) return;
        var s = t.closest('.sv-s'), bt = t.closest('.sv-beat');
        if (s && bt) { setSess(bt.dataset.pl, bt.dataset.b, s.dataset.sess); return; }
        var o = t.closest('[data-open]'); if (!o) return;
        var PS = window.wpPageShelf; if (!PS || typeof PS.open !== 'function') return;
        var at = o.dataset.at || ''; PS.open(o.dataset.open, PS.wayNow ? PS.wayNow(e) : 'panel', at ? { at: at } : undefined); log('jump', { at: !!at });
    });
    body.addEventListener('keydown', function(e) {
        var bt = e.target && e.target.closest ? e.target.closest('.sv-beat') : null; if (!bt || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault(); e.stopPropagation();
        var camp = getActiveCampaign(), pl = plannerOf(camp, bt.dataset.pl); if (!pl) return;
        var d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1, nb = storyStep(storyBeats(pl), bt.dataset.b, d);
        if (nb) move(bt.dataset.pl, bt.dataset.b, nb, d > 0);
    });
    p.addEventListener('keydown', function(e) { if (e.key !== 'Escape') e.stopPropagation(); });   // the page reads keys as its own: Escape is the router's
    body.addEventListener('dragstart', function(e) { var bt = e.target && e.target.closest ? e.target.closest('.sv-beat') : null; if (!bt) return; _sv.drag = { pl: bt.dataset.pl, b: bt.dataset.b }; bt.classList.add('sv-dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); } catch (err) {} });
    var spot = function(e) { var bt = e.target && e.target.closest ? e.target.closest('.sv-beat') : null; if (!bt || !_sv.drag || bt.dataset.pl !== _sv.drag.pl || bt.dataset.b === _sv.drag.b) return null; var r = bt.getBoundingClientRect(); return { bt: bt, after: e.clientX > r.left + r.width / 2 }; };
    var clear = function() { Array.prototype.forEach.call(body.querySelectorAll('.sv-drop-l, .sv-drop-r, .sv-dragging'), function(x) { x.classList.remove('sv-drop-l', 'sv-drop-r', 'sv-dragging'); }); };
    body.addEventListener('dragover', function(e) { var sp = spot(e); Array.prototype.forEach.call(body.querySelectorAll('.sv-drop-l, .sv-drop-r'), function(x) { x.classList.remove('sv-drop-l', 'sv-drop-r'); }); if (!sp) return; e.preventDefault(); sp.bt.classList.add(sp.after ? 'sv-drop-r' : 'sv-drop-l'); });
    body.addEventListener('drop', function(e) { var sp = spot(e), d = _sv.drag; clear(); _sv.drag = null; if (!sp || !d) return; e.preventDefault(); move(d.pl, d.b, sp.bt.dataset.b, sp.after); });
    body.addEventListener('dragend', function() { clear(); _sv.drag = null; });
    var head = el('storyHead'), drag = null; if (head) {
        head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
        head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = Math.max(0, e.clientX - drag.dx) + 'px'; p.style.top = Math.max(0, e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
        head.addEventListener('pointerup', function() { if (drag) { drag = null; try { p.dispatchEvent(new Event('wpfloatmoved')); } catch (e) {} } });
    }
}
if (typeof window !== 'undefined') {
    window.wpStory = { open: open, close: close, shown: shown, may: storyMay, redraw: function() { if (shown()) draw(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
export { storyBeats, storyModel, storyCount, storyMove, storyStep };
