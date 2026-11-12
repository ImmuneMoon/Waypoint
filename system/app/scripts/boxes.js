/* Containers (1.6.2, backlog 42, fold 1: the GM's side; the owner, 2026-11-12, by prompt after a drawn sheet: "A. Any piece, by a tick" and
   "A. Tiles, like a crate"). The container window: what a container on the play map holds, as tiles of the item's icon and count, its name
   under it, what the item says on hover. The GM adds an item from the system's items or the library, changes a count and takes one out. Every
   change goes through boxcore boxOp (systemcore applyRowOp on a stand-in sheet), so a list's own rules and caps hold, and is one save. The
   GM's alone: never on a player's app, at someone else's table or in the stream window, and nothing of it is sent. Steps log as boxes v1. */

import { getActiveCampaign, getActiveMap } from './models.js';
import { state } from './state.js';
import { save, toast, toastAction } from './io.js';
import * as BC from './boxcore.js';
import { applyRowOp, glyphPath, uid, cleanPic, tradeApply } from './systemcore.js';
import { picRef } from './safecore.js';
import * as F from './formula.js';

var _box = { mapId: null, pieceId: null, sel: null, list: null };
function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('boxes v1', s, f || {}); } catch (e) {} }
function P() { return document.getElementById('boxPanel'); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
// [boxcheck:gm-start]
// The GM's own screen of their own campaign: never a player's app, someone else's table or the stream window
function gmMay() { var n = window.wpNet; return !window.wpStream && !(n && (n.foreign || (n.active && n.role === 'client'))) && (typeof window.wpCanPersistLocal !== 'function' || window.wpCanPersistLocal() !== false); }
// A piece that may hold items is the core's to say (boxcore boxPieceOk)
function boxPieceOk(w) { return BC.boxPieceOk(w); }
function sysOf(camp) { return camp && camp.system && typeof camp.system === 'object' ? camp.system : null; }
function boxOf(camp, w) { return camp && w && typeof w.box === 'string' && camp.boxes && Object.prototype.hasOwnProperty.call(camp.boxes, w.box) ? camp.boxes[w.box] : null; }
// Holds items, ticked or not, on a piece of the map on screen. Unticked with items in it, it asks first. Answers what to say
function holds(w, on, ask) {
    var camp = getActiveCampaign(), map = getActiveMap(); if (!gmMay() || !camp || !map || !boxPieceOk(w)) return '';
    if (on) {
        if (boxOf(camp, w)) return '';
        camp.boxes = camp.boxes && typeof camp.boxes === 'object' ? camp.boxes : Object.create(null);
        var id = BC.newBoxId(Math.random, camp.boxes); if (!id) return 'This campaign holds as many containers as it can.';
        if (Object.keys(camp.boxes).length >= BC.BOX_MAX) return 'This campaign holds as many containers as it can.';
        camp.boxes[id] = { id: id, values: {} }; w.box = id; save(); step('holds', { on: true }); if (typeof window.appRender === 'function') window.appRender();
        return 'It holds items now. Open contents to put some in.';
    }
    var b = boxOf(camp, w), n = b ? BC.boxCount(sysOf(camp), b) : 0;
    var drop = function() { if (b) delete camp.boxes[w.box]; delete w.box; save(); step('holds', { on: false, n: n }); if (_box.pieceId === w.id) close(); if (typeof window.appRender === 'function') window.appRender(); };
    if (n > 0 && ask) { ask('It holds ' + n + ' item' + (n === 1 ? '' : 's') + '. Take them out with it? They cannot be put back.', function(ok) { if (ok) drop(); else if (typeof window.appRender === 'function') window.appRender(); }); return ''; }
    drop(); return '';
}
// [boxcheck:gm-end]
// The piece the window shows, found again by id on the map it was opened on
function piece() { var camp = getActiveCampaign(), map = getActiveMap(); if (!camp || !map || map.id !== _box.mapId || !Array.isArray(map.whiteboard)) return null; for (var i = 0; i < map.whiteboard.length; i++) { var w = map.whiteboard[i]; if (w && w.id === _box.pieceId) return w; } return null; }
function open(pieceId) {
    var camp = getActiveCampaign(), map = getActiveMap(), p = P(); if (!gmMay() || !camp || !map || !p) return false;
    var w = (map.whiteboard || []).find(function(x) { return x && x.id === pieceId; }); if (!w || !boxOf(camp, w)) return false;
    _box = { mapId: map.id, pieceId: pieceId, sel: null, list: null };
    p.style.display = ''; if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    draw(); step('open', { n: BC.boxCount(sysOf(camp), boxOf(camp, w)) }); return true;
}
function close() { var p = P(); _ask = null; if (!p || p.style.display === 'none') return; if (_box.player && window.wpNet && typeof window.wpNet.boxAsk === 'function') window.wpNet.boxAsk('close', _box.mapId, _box.pieceId, {}); p.style.display = 'none'; _box = { mapId: null, pieceId: null, sel: null, list: null }; step('close'); }
// The item's icon: one of the app's own glyphs, or the item's own characters, or the first letter of its name
function iconInto(box, t) {
    var pc = cleanPic(t.pic), n = window.wpNet; if (pc && n && typeof n.assetMissing === 'function' && n.assetMissing(pc)) pc = '';   // a picture that is not there: its icon, quietly
    if (pc) { var src = n && typeof n.assetSrc === 'function' ? n.assetSrc(pc) : pc; if (src === pc) src = picRef(pc); if (src) { var im = document.createElement('img'); im.className = 'box-pic'; im.alt = ''; im.dataset.pic = pc; im.dataset.icon = typeof t.icon === 'string' ? t.icon : ''; im.dataset.nm = typeof t.name === 'string' ? t.name : ''; im.addEventListener('error', function() { picGone(im); }); im.src = src; box.appendChild(im); return; } }   // its own picture: the campaign's, through the host on a player's app
    var g = typeof t.icon === 'string' && /^icon:/.test(t.icon) ? glyphPath(t.icon) : '';
    if (g) { var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), pa = document.createElementNS(NS, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'box-glyph'); s.setAttribute('aria-hidden', 'true'); pa.setAttribute('d', g); s.appendChild(pa); box.appendChild(s); return; }
    box.appendChild(el('span', 'box-ch', t.icon ? t.icon : (t.name || '?').charAt(0).toUpperCase()));
}
// The selected item as a small card (the owner, 2026-11-12, by prompt: "B. A small card for the item"): its picture large, its name and
// list beside it, the count's stepper at the right, and the actions in a row at its foot. Answers { bar, step, acts }
function selCard(t) {
    var bar = el('div', 'box-sel'), top = el('div', 'box-card'), ic = el('span', 'box-ic box-big'), who = el('div', 'box-who');
    iconInto(ic, t); who.appendChild(el('b', '', t.name)); if (t.list) who.appendChild(el('small', '', t.list));
    var step = el('span', 'box-step'), acts = el('div', 'box-acts');
    top.appendChild(ic); top.appendChild(who); top.appendChild(step); bar.appendChild(top); bar.appendChild(acts);
    return { bar: bar, step: step, acts: acts };
}
// A picture that is not there (a file left behind, or one the host does not have): the item's icon in its place, with no error
function picGone(im) { var box = im.parentNode; if (!box) return; var t = { icon: im.dataset.icon || '', name: im.dataset.nm || '' }; im.remove(); if (!box.querySelector('.box-glyph, .box-ch, .box-pic')) iconInto(box, t); }
document.addEventListener('wp-asset', function(e) {   // a tile's picture still on its way on a player's app (the review): put in place as it arrives, or its icon where it is missing
    var p = e.detail && e.detail.path, n = window.wpNet; if (!p || !n || typeof n.assetSrc !== 'function') return;
    document.querySelectorAll('#boxBody img.box-pic[data-pic]').forEach(function(im) { if (im.dataset.pic !== p) return; if (e.detail.missing === true) picGone(im); else im.src = n.assetSrc(p); });
});
// Fold 3: a lootable body on the GM's screen (the judge is boxcore's): its mark opens its sheet, where Never looted is ticked
function bodyHas(item) { var camp = getActiveCampaign(), ch = camp && camp.chars && item && typeof item.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, item.charId) ? camp.chars[item.charId] : null; return !!(gmMay() && item && item.isChar && !item.waiting && ch && BC.bodyLootable(sysOf(camp), ch, F)); }
function bodyOpen(itemId) { var map = getActiveMap(), w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === itemId; }) : null; if (!w || !bodyHas(w) || !window.wpSheets || typeof window.wpSheets.openSheet !== 'function') return false; window.wpSheets.openSheet(w.charId); step('body-open', {}); return true; }
function tipOf(t) { return t.name + (t.qty > 1 ? ' ×' + t.qty : '') + (t.list ? '\n' + t.list : '') + (t.notes ? '\n' + t.notes.slice(0, 300) : ''); }
function change(fid, q, what, back) {
    var camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w); if (!gmMay() || !b) { close(); return; }
    var r = BC.boxOp(sysOf(camp), b, fid, q, F, applyRowOp);
    if (!r.ok) { toast(r.reason === 'full' ? 'That list holds as many rows as it can.' : r.reason === 'gm' ? 'A container holds only what players may see, since they will take it.' : 'That cannot be put in this container.'); step('change-refused', { what: what, reason: r.reason }); return; }
    b.values = r.values; save(); step(what, {}); draw(); if (typeof window.appRender === 'function') window.appRender(); refocus(back);
}
// A row's own picture, the GM's: through boxcore boxPic, one save
function setPic(fid, rowId, path) {
    var camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w); if (!gmMay() || !b) { close(); return; }
    var r = BC.boxPic(sysOf(camp), b, fid, rowId, path); if (!r.ok) { toast(r.reason === 'pic' ? 'Pick one of this campaign\u2019s own pictures.' : 'That is no longer in it.'); return; }
    b.values = r.values; save(); step(path ? 'pic' : 'nopic', {}); draw(); if (typeof window.appRender === 'function') window.appRender(); refocus(['.box-picbtn']);
}
// Fold 2b (the owner, 2026-11-12: "A. Open for everyone", "A. Yes, a key you name"): the lock, the GM's. Locked, a player next to it sees
// only its rolls and, where they carry it, its key; a pass or the key opens it for everyone, and Locked comes unticked here
function setLock(patchL, back) {
    var camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w); if (!gmMay() || !b) { close(); return; }
    var lk = BC.cleanLock(Object.assign({}, b.lock || {}, patchL), sysOf(camp)); if (lk) b.lock = lk; else delete b.lock;
    save(); step('lock', { on: !!(lk && lk.on), rolls: lk && lk.rolls ? lk.rolls.length : 0, key: !!(lk && lk.key) }); draw(); refocus(back);
}
function keyLabel(camp, sys, id) {
    var it = (Array.isArray(sys.items) ? sys.items : []).filter(function(x) { return x && x.id === id; })[0]; if (it) return it.name || 'Key';
    var LB = window.wpLibrary, e = LB && typeof LB.entryFor === 'function' ? LB.entryFor(id) : null; return e && typeof e.name === 'string' && e.name ? e.name : 'A library entry';
}
function lockInto(body, camp, b, sys) {
    var lk = b.lock || {}, box = el('div', 'box-lock'), head = el('label', 'box-locktick'), cb = el('input', 'box-lockon'); cb.type = 'checkbox'; cb.checked = lk.on === true;
    cb.addEventListener('change', function() { setLock({ on: cb.checked }, ['.box-lockon']); });
    head.appendChild(cb); head.appendChild(el('span', 'wib ' + (lk.on === true ? 'wi-padlock' : 'wi-unlock') + ' box-lockic')); head.appendChild(el('span', '', lk.on === true ? 'Locked' : 'Lock')); box.appendChild(head);
    if (lk.on !== true) { body.appendChild(box); return; }
    var rolls = (Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return BC.lockRollOk(r); }), chosen = Array.isArray(lk.rolls) ? lk.rolls : [];
    var l1 = el('div', 'box-lockline'); l1.appendChild(el('span', 'box-lockcap', 'Opens with'));
    chosen.forEach(function(id) { var r = rolls.filter(function(x) { return x.id === id; })[0]; if (!r) return; var c = el('span', 'box-chip', String(r.label || 'Roll').split('{')[0].trim() || 'Roll'), x = el('button', 'box-chipx', '\u00d7'); x.type = 'button'; x.title = 'Not with this roll'; x.setAttribute('aria-label', 'Not with ' + (r.label || 'this roll')); x.addEventListener('click', function() { setLock({ rolls: chosen.filter(function(y) { return y !== id; }) }, ['.box-rollsel', '.box-lockon']); }); c.appendChild(x); l1.appendChild(c); });
    var left = rolls.filter(function(r) { return chosen.indexOf(r.id) < 0; });
    if (chosen.length < BC.LOCK_ROLLS && left.length) { var rs = el('select', 'box-rollsel'); rs.title = 'A roll of your system that opens it on a pass'; var o0 = el('option', '', '+ Roll'); o0.value = ''; rs.appendChild(o0); left.forEach(function(r) { var o = el('option', '', String(r.label || 'Roll').split('{')[0].trim() || 'Roll'); o.value = r.id; rs.appendChild(o); }); if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(rs); rs.addEventListener('change', function() { if (rs.value) setLock({ rolls: chosen.concat([rs.value]) }, ['.box-rollsel']); }); l1.appendChild(rs); }
    if (!rolls.length) l1.appendChild(el('span', 'muted box-locknote', 'Your system has no rolls yet.'));
    box.appendChild(l1);
    var l2 = el('div', 'box-lockline'); l2.appendChild(el('span', 'box-lockcap', 'Key'));
    if (lk.key) { var kc = el('span', 'box-chip', keyLabel(camp, sys, lk.key)), kx = el('button', 'box-chipx', '\u00d7'); kx.type = 'button'; kx.title = 'No key'; kx.setAttribute('aria-label', 'No key'); kx.addEventListener('click', function() { setLock({ key: '' }, ['.box-keysel', '.box-lockon']); }); kc.appendChild(kx); l2.appendChild(kc); }
    else {
        var items = (Array.isArray(sys.items) ? sys.items : []).filter(function(it) { return it && typeof it.id === 'string'; }).sort(function(a, z) { return String(a.name).localeCompare(String(z.name)); });
        if (items.length) { var ks = el('select', 'box-keysel'); ks.title = 'An item that opens it with no roll, for whoever carries it'; var k0 = el('option', '', 'No key'); k0.value = ''; ks.appendChild(k0); items.forEach(function(it) { var o = el('option', '', it.name || 'Item'); o.value = it.id; ks.appendChild(o); }); if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(ks); ks.addEventListener('change', function() { if (ks.value) setLock({ key: ks.value }, ['.box-keysel', '.box-lockon']); }); l2.appendChild(ks); }
        var LB = window.wpLibrary, LP = window.wpLibPicker;
        if (LB && LP && typeof LB.size === 'function' && LB.size() > 0 && camp.library) { var kl = el('button', 'tool ghost box-keylib', 'From the library'); kl.type = 'button'; kl.title = 'A library entry as its key'; kl.addEventListener('click', function() { LP.open({ anchor: kl, title: 'Its key', gm: true, noQty: true, source: { packs: function() { return (camp.library && camp.library.packs) || []; }, entries: function(pid) { return LB.entriesOf(pid); } }, onAdd: function(ids) { if (getActiveCampaign() !== camp || !ids || !ids[0]) return; setLock({ key: ids[0] }, ['.box-keylib', '.box-lockon']); } }); }); l2.appendChild(kl); }
        if (!items.length && !(LB && LB.size && LB.size() > 0)) l2.appendChild(el('span', 'muted box-locknote', 'No items to pick.'));
    }
    box.appendChild(l2);
    box.appendChild(el('div', 'muted box-locknote', chosen.length || lk.key ? 'A pass, or the key, opens it for everyone. A failure runs that roll\u2019s own Then and Calls for.' : 'Pick a roll or a key, or only you can open it.'));
    body.appendChild(box);
}
// Fold 2c (the owner, 2026-11-12: "A. Window and notice"): the takes it remembers, each with Put back, and Tell the player, on unless the GM
// unticks it for this container ("optional between the two for the GM, on by default")
function agoWords(at) { if (!at) return ''; var m = Math.floor((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; }
function takeWords(r) { return r.lines.map(function(l) { return l.name + (l.qty > 1 ? ' \u00d7' + l.qty : ''); }).join(', '); }
function takenInto(body, camp, b) {
    var list = Array.isArray(b.taken) ? b.taken : []; if (!list.length) return;
    var box = el('div', 'box-taken'), head = el('div', 'box-takenhead'); head.appendChild(el('b', '', 'Taken'));
    var tl = el('label', 'box-telltick'), tc = el('input', 'box-tell'); tc.type = 'checkbox'; tc.checked = b.tell !== false; tl.title = 'Tell the player when you put something back'; tl.appendChild(tc); tl.appendChild(el('span', '', 'Tell the player'));
    tc.addEventListener('change', function() { var c2 = getActiveCampaign(), w2 = piece(), b2 = boxOf(c2, w2); if (!gmMay() || !b2) return; if (tc.checked) delete b2.tell; else b2.tell = false; save(); step('tell', { on: tc.checked }); });
    head.appendChild(tl); box.appendChild(head);
    list.forEach(function(r) {
        var ln = el('div', 'box-takenln'), wd = el('span', 'box-takenwd', r.by + ' took ' + takeWords(r)); if (r.at) wd.appendChild(el('small', '', ' \u00b7 ' + agoWords(r.at)));
        var pb = el('button', 'tool ghost box-putback', 'Put back'); pb.type = 'button'; pb.dataset.take = r.id; pb.title = 'Move it from ' + r.by + '\u2019s sheet back into this container, as much as they still hold';
        pb.addEventListener('click', function() { putBack(b.id, r.id); });
        ln.appendChild(wd); ln.appendChild(pb); box.appendChild(ln);
    });
    body.appendChild(box);
}
// A take put back: the trade's own rule from the character to the container, as much as they still hold, one save; the take leaves the list
function putBack(boxId, takeId) {
    var camp = getActiveCampaign(); if (!gmMay() || !camp || !camp.boxes || !Object.prototype.hasOwnProperty.call(camp.boxes, boxId)) return;
    if (!BC.boxesNamed(camp.items)[boxId]) { toast('That container is no longer on a map, so nothing can go back into it.'); return; }   // the review: a deleted piece's store goes at the next load
    var b = camp.boxes[boxId], sys = sysOf(camp), rec = (Array.isArray(b.taken) ? b.taken : []).filter(function(r) { return r.id === takeId; })[0]; if (!rec) { toast('That take is no longer listed.'); return; }
    var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, rec.ch) ? camp.chars[rec.ch] : null, plan = ch ? BC.putBackPlan(sys, ch, rec) : { lines: [], gone: rec.lines.length, held: 0 };
    var drop = function() { b.taken = b.taken.filter(function(r) { return r.id !== takeId; }); if (!b.taken.length) delete b.taken; };
    if (!plan.lines.length) { drop(); save(); step('putback', { moved: 0, held: plan.held }); toast(!ch ? 'That character is gone.' : plan.held ? 'What is left of it is kept on ' + (ch.name || 'that sheet') + ', or holds parts of their own, so it stays.' : 'Nothing of it is on ' + (ch.name || 'that sheet') + ' any more.'); redrawGm(); return; }
    var res = tradeApply(sys, ch, BC.boxChar(b), plan.lines, [], 'gm', 'gm', {}); if (!res || !res.ok) { toast((res && res.msg) || 'It cannot go back.'); step('putback-refused', {}); return; }
    ch.values = ch.values || {}; Object.keys(res.valuesA).forEach(function(k) { ch.values[k] = res.valuesA[k]; }); ch.updated = Date.now();
    var v = Object.assign({}, b.values || {}); Object.keys(res.valuesB).forEach(function(k) { if (Array.isArray(res.valuesB[k]) && res.valuesB[k].length) v[k] = res.valuesB[k]; else delete v[k]; }); b.values = v;
    drop(); save();
    var n = window.wpNet, words = res.linesA.join(', ') || 'it', name = boxName(camp, boxId);
    if (n && n.active && n.role === 'host' && typeof n.syncCharDelta === 'function' && Object.keys(res.valuesA).length) n.syncCharDelta(ch.id, res.valuesA);
    if (window.wpSheets && typeof window.wpSheets.charChanged === 'function') window.wpSheets.charChanged(ch.id);
    if (b.tell !== false && n && typeof n.showTell === 'function' && typeof ch.ownerId === 'string' && ch.ownerId) n.showTell(ch.ownerId, 'The GM put ' + words + ' back in ' + name + '.');
    toast('Put ' + words + ' back in ' + name + (plan.gone || plan.held ? '. Some of it is no longer on ' + (ch.name || 'that sheet') + ', or stays with them.' : '.')); step('putback', { moved: plan.lines.length, gone: plan.gone, held: plan.held, told: b.tell !== false });
    redrawGm(); if (typeof window.appRender === 'function') window.appRender();
}
function boxName(camp, boxId) { var found = ''; Object.keys(camp.items || {}).some(function(k) { var m = camp.items[k]; return m && m.type === 'map' && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { if (w && w.box === boxId) { found = typeof w.name === 'string' && w.name ? w.name : ''; return true; } return false; }); }); return found || 'the container'; }
function redrawGm() { var p = P(); if (p && p.style.display !== 'none' && !_box.player) { draw(); refocus(['.box-putback', '.box-tile', '.box-item']); } }
// The notice of a take, on the GM's machine, with Put back while it shows
function tookNote(boxId, takeId, said) { toastAction(said, 'Put back', function() { putBack(boxId, takeId); }); }   // the host's branch draws the window again, with no focus moved (the review)
// The window is drawn anew at a change: the focus goes back to the control pressed, or the first of those named that is there (the review rule of 1.6.2)
function refocus(list) { (Array.isArray(list) ? list : []).some(function(s) { var n = document.querySelector('#boxBody ' + s); if (n && !n.disabled && n.focus) { n.focus(); return true; } return false; }); }
function draw() {
    if (_box.player) { drawPlayer(); return; }   // fold 2: a player's view of a container, as the host sends it
    var p = P(), camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w), sys = sysOf(camp); if (!p) return;
    if (!b || !gmMay()) { close(); return; }
    var nm = document.getElementById('boxName'); if (nm) nm.textContent = (typeof w.name === 'string' && w.name) ? w.name : 'Container';
    var body = document.getElementById('boxBody'); if (!body) return; while (body.firstChild) body.removeChild(body.firstChild);
    var tiles = BC.boxTiles(sys, b), lists = BC.boxLists(sys);
    if (!lists.length) { body.appendChild(el('div', 'muted box-say', 'Your system has no list ticked Tradable that players see, so a container has nowhere to keep things. Tick Tradable on a list in the System editor.')); return; }
    lockInto(body, camp, b, sys);   // fold 2b
    var grid = el('div', 'box-grid'); grid.setAttribute('role', 'list');
    tiles.forEach(function(t) {
        var b2 = el('button', 'box-tile' + (_box.sel === t.rowId ? ' on' : '')); b2.type = 'button'; b2.dataset.row = t.rowId; b2.setAttribute('role', 'listitem');
        b2.title = tipOf(t); b2.setAttribute('aria-label', t.name + (t.qty > 1 ? ', ' + t.qty : ''));
        var ic = el('span', 'box-ic'); iconInto(ic, t); b2.appendChild(ic);
        if (t.qty > 1) b2.appendChild(el('span', 'box-n', t.qty));
        b2.appendChild(el('span', 'box-nm', t.name));
        b2.addEventListener('click', function() { _box.sel = _box.sel === t.rowId ? null : t.rowId; draw(); var n = [].slice.call(document.querySelectorAll('#boxBody .box-tile')).filter(function(x) { return x.dataset.row === t.rowId; })[0]; if (n) n.focus(); });
        grid.appendChild(b2);
    });
    if (!tiles.length) body.appendChild(el('div', 'muted box-say', 'Nothing in it yet.')); else body.appendChild(grid);
    var sel = tiles.filter(function(t) { return t.rowId === _box.sel; })[0];
    if (sel) { var selRow = ((b.values && b.values[sel.fid]) || []).filter(function(x) { return x && x.id === sel.rowId; })[0]; sel.own = !!(selRow && cleanPic(selRow.pic)); }
    if (sel) {
        var card = selCard(sel), bar = card.bar;
        var spec = lists.filter(function(f) { return f.id === sel.fid; })[0], noQty = !!(spec && spec.list && spec.list.noQty);
        if (!noQty) {
            var mi = el('button', 'tool ghost box-less', '−'); mi.type = 'button'; mi.title = 'One fewer'; mi.setAttribute('aria-label', 'One fewer');
            mi.disabled = sel.qty <= 1; mi.addEventListener('click', function() { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: sel.qty - 1 }, 'less', ['.box-less', '.box-more']); });
            var pl = el('button', 'tool ghost box-more', '+'); pl.type = 'button'; pl.title = 'One more'; pl.setAttribute('aria-label', 'One more');
            pl.addEventListener('click', function() { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: sel.qty + 1 }, 'more', ['.box-more']); });
            card.step.appendChild(mi); card.step.appendChild(el('span', 'box-q', sel.qty)); card.step.appendChild(pl);
        } else card.step.remove();
        var pk = el('button', 'tool ghost box-picbtn', 'Picture'); pk.type = 'button'; pk.title = 'A picture for this item in this container. The item keeps it when it is taken.';
        pk.addEventListener('click', function() { if (!window.wpPickImage) { toast('The Image Library is not available here.'); return; } window.wpPickImage(function(src) { if (typeof src !== 'string') return; setPic(sel.fid, sel.rowId, src); }); });
        var seg = el('span', 'box-seg'); seg.appendChild(pk); card.acts.appendChild(seg);   // the two picture buttons as one joined pair (the owner, 2026-11-12, of A's layout)
        if (sel.own) { var np = el('button', 'tool ghost box-nopic', 'Item\u2019s picture'); np.type = 'button'; np.title = 'Take this picture off, and show the item\u2019s own again'; np.addEventListener('click', function() { setPic(sel.fid, sel.rowId, ''); }); seg.appendChild(np); }
        var rm = el('button', 'tool ghost danger box-rm', 'Take out'); rm.type = 'button'; rm.title = 'Take this item out of the container';
        rm.addEventListener('click', function() { _box.sel = null; change(sel.fid, { op: 'remove', rowId: sel.rowId }, 'remove', ['.box-tile', '.box-item', '.box-lib']); });
        card.acts.appendChild(el('span', 'box-gap')); card.acts.appendChild(rm); body.appendChild(bar);
    }
    takenInto(body, camp, b);   // fold 2c
    // Add: the system's items players may see, and the library where it holds any
    var add = el('div', 'box-add'), fsel = null;
    if (!lists.some(function(f) { return f.id === _box.list; })) _box.list = lists[0].id;   // the list picked stays picked across a redraw (the review)
    if (lists.length > 1) { fsel = el('select', 'box-list'); fsel.title = 'The list an item goes into'; lists.forEach(function(f) { var o = el('option', '', f.label || f.key || 'Items'); o.value = f.id; fsel.appendChild(o); }); fsel.value = _box.list; fsel.addEventListener('change', function() { _box.list = fsel.value; draw(); refocus(['.box-list']); }); add.appendChild(fsel); }
    var listId = function() { return _box.list; };
    var lf = lists.filter(function(f) { return f.id === _box.list; })[0], lcats = lf && lf.list && Array.isArray(lf.list.cats) ? lf.list.cats.map(function(c) { return String(c).toLowerCase(); }) : [];
    var items = (Array.isArray(sys.items) ? sys.items : []).filter(function(it) { return it && it.vis !== 'gm' && typeof it.id === 'string' && (!lcats.length || lcats.indexOf(String(it.category || '').toLowerCase()) >= 0); }).sort(function(a, z) { return String(a.name).localeCompare(String(z.name)); });   // the items the list takes, by its own categories (the review)
    if (items.length) {
        var isel = el('select', 'box-item'); isel.title = 'Put an item from your system in';
        var o0 = el('option', '', '+ Add an item'); o0.value = ''; isel.appendChild(o0);
        items.forEach(function(it) { var o = el('option', '', it.name || 'Item'); o.value = it.id; isel.appendChild(o); });
        if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(isel);   // a key step on a closed list opens it, never adds
        isel.addEventListener('change', function() { var v = isel.value; if (!v) return; isel.value = ''; change(listId(), { op: 'add', defId: v, rowId: uid('w_'), qty: 1 }, 'add', ['.box-item']); });
        add.appendChild(isel);
    }
    var LB = window.wpLibrary, LP = window.wpLibPicker;
    if (LB && LP && typeof LB.size === 'function' && LB.size() > 0 && camp.library) {
        var lb = el('button', 'tool ghost box-lib', 'From the library'); lb.type = 'button'; lb.title = 'Put an entry of your library in';
        lb.addEventListener('click', function() {
            var fid = listId(), f = lists.filter(function(x) { return x.id === fid; })[0];
            LP.open({ anchor: lb, title: 'Put in ' + ((w && w.name) || 'the container'), cats: f && f.list && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null, noQty: !!(f && f.list && f.list.noQty), gm: true,
                source: { packs: function() { return (camp.library && camp.library.packs) || []; }, entries: function(pid) { return LB.entriesOf(pid); } },
                onAdd: function(ids, qty) { if (getActiveCampaign() !== camp) return; ids.forEach(function(id) { change(fid, { op: 'add', defId: id, rowId: uid('w_'), qty: qty || 1 }, 'add-lib', ['.box-lib', '.box-item']); }); } });
        });
        add.appendChild(lb);
    }
    if (add.firstChild) body.appendChild(add);
}
function wire() {
    var c = document.getElementById('boxClose'); if (c) c.addEventListener('click', close);
    var p = P(), head = document.getElementById('boxHead'), drag = null; if (!p || !head) return;
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev) { head.addEventListener(ev, function() { drag = null; }); });   // a drag ends however the pointer is let go
}
// [boxcheck:player-start]
// Fold 2 (the owner, 2026-11-12: "A. Next to it, a roll if locked", "A. Tiles, like a crate"): a player opens a container by its mark. The press
// names the token of theirs it is opened with (the selected one, else the one of theirs nearest the container) and asks the host, which
// judges every step and sends what the container holds as tiles; nothing of it is kept on the player's app beyond the window
var _ask = null;
function tokFor(map, w) {
    var n = window.wpNet, me = n && n.myId ? n.myId : null, sel = state && Array.isArray(state.selWbIds) ? state.selWbIds : [];
    var camp = getActiveCampaign(), chars = camp && camp.chars ? camp.chars : {}, ours = function(x) { if (!me || x.ownerId === me) return true; var c = Object.prototype.hasOwnProperty.call(chars, x.charId) ? chars[x.charId] : null; return !!c && c.shared === 1; };   // a sheet shared with them too (the review)
    var mine = (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).filter(function(x) { return x && x.isChar && !x.waiting && !x.hidden && typeof x.charId === 'string' && ours(x); });
    var picked = mine.filter(function(x) { return sel.indexOf(x.id) >= 0; })[0]; if (picked) return picked;
    var cx = (w.x || 0) + (w.w || 0) / 2, cy = (w.y || 0) + (w.h || 0) / 2, best = null, bd = Infinity;
    mine.forEach(function(x) { var d = Math.hypot((x.x || 0) + (x.w || 0) / 2 - cx, (x.y || 0) + (x.h || 0) / 2 - cy); if (d < bd) { bd = d; best = x; } });
    return best;
}
function ask(itemId) {
    var map = getActiveMap(), n = window.wpNet; if (!map || !n || typeof n.boxAsk !== 'function') return;
    var w = (map.whiteboard || []).find(function(x) { return x && x.id === itemId; }); if (!w) return;
    var tok = tokFor(map, w); if (!tok) { toast('You need a token of your own on this map to open it.'); return; }
    _ask = { mapId: map.id, itemId: itemId, tok: tok.id };
    var r = n.boxAsk('open', map.id, itemId, { tok: tok.id }); if (r && r.error) toast(r.error); step('ask', {});
}
// Fold 3b: pickpocketing, from an NPC's right-click menu where the system names a Pickpocket roll. The host answers with that roll, made from
// the character's own sheet (the host aims it at the NPC); what it finds comes as this window with one row
function stealOn() { var camp = getActiveCampaign(), n = window.wpNet, s = camp && camp.system && camp.system.combat ? camp.system.combat.steal : null; return typeof s === 'string' && !!s && !!n && n.active && n.role === 'client' && !n.stream; }
function steal(itemId) {
    var map = getActiveMap(), n = window.wpNet; if (!map || !n || typeof n.boxAsk !== 'function') return;
    var w = (map.whiteboard || []).find(function(x) { return x && x.id === itemId; }); if (!w) return;
    var tok = tokFor(map, w); if (!tok) { toast('You need a token of your own on this map, next to it.'); return; }
    _ask = { mapId: map.id, itemId: itemId, tok: tok.id };
    var r = n.boxAsk('steal', map.id, itemId, { tok: tok.id }); if (r && r.error) toast(r.error); step('steal-ask', {});
}
var STEAL_SAYS = { lost: 'You lost sight of them.', missed: 'You came away with nothing.', wait: 'Now they may notice. Their roll comes first.', caught: 'They noticed you.', empty: 'You found nothing to take.' };
function stealGo(msg) {
    if (!msg || typeof msg.itemId !== 'string' || typeof msg.mapId !== 'string') return;
    if (typeof msg.say === 'string') { if (Object.prototype.hasOwnProperty.call(STEAL_SAYS, msg.say)) toast(STEAL_SAYS[msg.say]); if (msg.say !== 'wait' && _ask && _ask.itemId === msg.itemId) _ask = null; step('steal-' + (Object.prototype.hasOwnProperty.call(STEAL_SAYS, msg.say) ? msg.say : 'said'), {}); return; }
    if (!_ask || _ask.itemId !== msg.itemId || typeof msg.go !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(msg.go)) return;
    var map = getActiveMap(), tk = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === _ask.tok; }) : null, sh = window.wpSheets, n = window.wpNet;
    if (!tk || typeof tk.charId !== 'string' || !sh || typeof sh.runDue !== 'function') { if (n && typeof n.boxAsk === 'function') n.boxAsk('untry', msg.mapId, msg.itemId, { tok: _ask.tok }); _ask = null; return; }   // the review of fold 3b: a try that cannot be rolled is let go
    if (sh.runDue(tk.charId, msg.go) === false && n && typeof n.boxAsk === 'function') { n.boxAsk('untry', msg.mapId, msg.itemId, { tok: _ask.tok }); _ask = null; }
}
// The host's view, cleaned again: tiles of plain words and numbers, 400 at most
function cleanTiles(raw) {
    var cut = function(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : ''; };
    return (Array.isArray(raw) ? raw.slice(0, 400) : []).map(function(x) { if (!x || typeof x !== 'object' || typeof x.rowId !== 'string' || typeof x.fid !== 'string') return null; var q = Math.floor(Number(x.qty)); return { fid: cut(x.fid, 40), rowId: cut(x.rowId, 40), name: cut(x.name, 240) || 'Item', qty: q >= 1 && q <= 1e6 ? q : 1, icon: cut(x.icon, 40), notes: cut(x.notes, 600), list: cut(x.list, 60), pic: cleanPic(x.pic) }; }).filter(Boolean);
}
function view(msg) {
    var p = P(), map = getActiveMap(); if (!p || !msg || typeof msg.itemId !== 'string' || typeof msg.mapId !== 'string' || !map || map.id !== msg.mapId) return;
    var shown = p.style.display !== 'none', same = shown && _box.player && _box.pieceId === msg.itemId, tok = _ask && _ask.itemId === msg.itemId ? _ask.tok : (same ? _box.tok : null); if (!tok) return;   // only an ask that waits or the window open on it (the review)
    if (msg.gone === true) { if (same) { _box.player = false; p.style.display = 'none'; _box = { mapId: null, pieceId: null, sel: null, list: null }; } _ask = null; return; }   // the host closed it: nothing to tell it back
    _ask = null; var want = same ? _box.want : null;
    _box = { player: true, mapId: msg.mapId, pieceId: msg.itemId, tok: tok, sel: same ? _box.sel : null, qty: same ? _box.qty : 1, list: null, tiles: cleanTiles(msg.tiles), locked: cleanLocked(msg.locked), name: typeof msg.name === 'string' ? msg.name.slice(0, 120) : '' };
    if (!_box.tiles.some(function(t) { return t.rowId === _box.sel; })) { _box.sel = null; _box.qty = 1; }
    var was = p.style.display !== 'none'; p.style.display = ''; if (!was && window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    var f = document.activeElement, cls = f && p.contains(f) && f.className ? '.' + String(f.className).split(' ')[0] : null;
    drawPlayer(); if (cls) refocus([cls, '.box-try', '.box-usekey', '.box-tile', '.box-all']);
    var go = _box.locked && _box.locked.go; if (go && go === want) { var tk = lockTok(), sh = window.wpSheets, n = window.wpNet; if (tk && typeof tk.charId === 'string' && sh && typeof sh.runDue === 'function' && sh.runDue(tk.charId, go) === false && n && typeof n.boxAsk === 'function') n.boxAsk('untry', _box.mapId, _box.pieceId, { tok: _box.tok }); }
}
// Fold 2b: locked, the host sends its rolls and the key the character carries, as plain words; a press of a roll names it to the host and
// then makes that roll from the character's own sheet, which the host judges as any roll; the key asks the host to open it
function cleanLocked(raw) {
    if (!raw || typeof raw !== 'object') return null; var cut = function(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : ''; };
    var rolls = (Array.isArray(raw.rolls) ? raw.rolls.slice(0, 12) : []).filter(function(r) { return r && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.id); }).slice(0, 3).map(function(r) { return { id: r.id, label: cut(r.label, 60) || 'Roll' }; });
    var out = { rolls: rolls }; var k = cut(raw.key, 80); if (k) out.key = k; if (raw.held === true) out.held = true; if (typeof raw.go === 'string' && rolls.some(function(r) { return r.id === raw.go; })) out.go = raw.go; return out;
}
function lockTok() { var map = getActiveMap(); return map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === _box.tok; }) : null; }
function tryRoll(id) {
    var n = window.wpNet, tk = lockTok(), sh = window.wpSheets; if (!_box.player || !n || typeof n.boxAsk !== 'function' || !tk || typeof tk.charId !== 'string') return;
    var r = n.boxAsk('try', _box.mapId, _box.pieceId, { tok: _box.tok, roll: id }); if (r && r.error) { toast(r.error); return; }
    _box.want = id; step('lock-try', {});   // the roll is made once the host says go (the review): a container opened meanwhile costs no roll
}
function useKey() { var n = window.wpNet; if (!_box.player || !n || typeof n.boxAsk !== 'function') return; var r = n.boxAsk('key', _box.mapId, _box.pieceId, { tok: _box.tok }); if (r && r.error) toast(r.error); step('lock-key', {}); }
function lockedInto(body) {
    var lk = _box.locked, wrap = el('div', 'box-lockbox'), camp = getActiveCampaign(), tk = lockTok(), ch = tk && camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, tk.charId) ? camp.chars[tk.charId] : null;
    wrap.appendChild(el('span', 'wib wi-padlock box-lockbig'));
    wrap.appendChild(el('div', 'box-lockwd', lk.held ? 'It holds.' : 'It\u2019s locked.'));
    var btns = el('div', 'box-lockbtns');
    lk.rolls.forEach(function(r) { var b = el('button', 'tool box-try', r.label); b.type = 'button'; b.dataset.roll = r.id; b.title = 'Roll ' + r.label + ' to open it'; b.addEventListener('click', function() { tryRoll(r.id); }); btns.appendChild(b); });
    if (lk.key) { var kb = el('button', 'tool box-usekey', 'Use ' + lk.key); kb.type = 'button'; kb.title = 'Open it with the ' + lk.key + ' you carry'; kb.addEventListener('click', useKey); btns.appendChild(kb); }
    if (btns.firstChild) wrap.appendChild(btns); else wrap.appendChild(el('div', 'muted box-say', 'Only the GM can open it.'));
    if (lk.rolls.length && ch) wrap.appendChild(el('div', 'box-lockwho', (ch.name || 'Your character') + ' rolls. Nothing in it shows until it opens.'));
    body.appendChild(wrap);
}
function take(more) { var n = window.wpNet; if (!_box.player || !n || typeof n.boxAsk !== 'function') return; var r = n.boxAsk('take', _box.mapId, _box.pieceId, Object.assign({ tok: _box.tok }, more)); if (r && r.error) toast(r.error); step('take', { all: !!more.all }); }
function drawPlayer() {
    var p = P(); if (!p) return; var nm = document.getElementById('boxName'); if (nm) nm.textContent = _box.name || 'Container';
    var body = document.getElementById('boxBody'); if (!body) return; while (body.firstChild) body.removeChild(body.firstChild);
    if (_box.locked) { lockedInto(body); return; }   // fold 2b
    var tiles = _box.tiles || [];
    if (!tiles.length) { body.appendChild(el('div', 'muted box-say', 'It is empty.')); return; }
    var grid = el('div', 'box-grid'); grid.setAttribute('role', 'list');
    tiles.forEach(function(t) {
        var b2 = el('button', 'box-tile' + (_box.sel === t.rowId ? ' on' : '')); b2.type = 'button'; b2.dataset.row = t.rowId; b2.setAttribute('role', 'listitem');
        b2.title = tipOf(t); b2.setAttribute('aria-label', t.name + (t.qty > 1 ? ', ' + t.qty : ''));
        var ic = el('span', 'box-ic'); iconInto(ic, t); b2.appendChild(ic); if (t.qty > 1) b2.appendChild(el('span', 'box-n', t.qty)); b2.appendChild(el('span', 'box-nm', t.name));
        b2.addEventListener('click', function() { _box.sel = _box.sel === t.rowId ? null : t.rowId; _box.qty = t.qty; drawPlayer(); var n = [].slice.call(document.querySelectorAll('#boxBody .box-tile')).filter(function(x) { return x.dataset.row === t.rowId; })[0]; if (n) n.focus(); });   // found by comparing, never a selector built from a row id
        grid.appendChild(b2);
    });
    body.appendChild(grid);
    var sel = tiles.filter(function(t) { return t.rowId === _box.sel; })[0];
    if (sel) {
        var card = selCard(sel), bar = card.bar; var q = Math.max(1, Math.min(sel.qty, _box.qty | 0 || 1)); _box.qty = q;
        if (sel.qty > 1) {
            var mi = el('button', 'tool ghost box-less', '\u2212'); mi.type = 'button'; mi.title = 'Take fewer'; mi.setAttribute('aria-label', 'Take fewer'); mi.disabled = q <= 1; mi.addEventListener('click', function() { _box.qty = q - 1; drawPlayer(); refocus(['.box-less', '.box-more']); });
            var pl = el('button', 'tool ghost box-more', '+'); pl.type = 'button'; pl.title = 'Take more'; pl.setAttribute('aria-label', 'Take more'); pl.disabled = q >= sel.qty; pl.addEventListener('click', function() { _box.qty = q + 1; drawPlayer(); refocus(['.box-more', '.box-less']); });
            card.step.appendChild(mi); card.step.appendChild(el('span', 'box-q', q)); card.step.appendChild(pl);
        } else card.step.remove();
        var tk = el('button', 'tool box-take', 'Take'); tk.type = 'button'; tk.title = 'Put it in your own sheet'; tk.addEventListener('click', function() { take({ fid: sel.fid, rowId: sel.rowId, qty: q }); });
        card.acts.appendChild(el('span', 'box-gap')); card.acts.appendChild(tk); body.appendChild(bar);
    }
    var all = el('button', 'tool box-all', 'Take all'); all.type = 'button'; all.title = 'Put everything in it in your own sheet'; all.addEventListener('click', function() { take({ all: true }); });
    var foot = el('div', 'box-add'); foot.appendChild(all); body.appendChild(foot);
}
// [boxcheck:player-end]
// A copy of a container (Duplicate, a paste) gets a container of its own with a copy of what it holds, or none where the store is full: two
// pieces never share one (the review)
function copyFor(it) {
    var camp = getActiveCampaign(); if (!it || typeof it !== 'object' || it.box === undefined) return;
    var src = boxOf(camp, it); delete it.box; if (!src || !gmMay() || !camp.boxes || Object.keys(camp.boxes).length >= BC.BOX_MAX) return;
    var id = BC.newBoxId(Math.random, camp.boxes); if (!id) return;
    camp.boxes[id] = { id: id, values: JSON.parse(JSON.stringify(src.values || {})) }; it.box = id; step('copy', {});
}
function has(w) { return !!boxOf(getActiveCampaign(), w); }
// The window follows the app: a piece gone, another map or another campaign closes it; otherwise its name follows the piece's
function sync() { var p = P(); if (!p || p.style.display === 'none') return; if (_box.player) { var mp = getActiveMap(), n = window.wpNet; if (!mp || mp.id !== _box.mapId || !n || !n.active || n.role !== 'client') close(); return; } if (!piece() || !boxOf(getActiveCampaign(), piece()) || !gmMay()) { close(); return; } var nm = document.getElementById('boxName'), w = piece(); if (nm) nm.textContent = (typeof w.name === 'string' && w.name) ? w.name : 'Container'; }   // never drawn again under a press: only its own changes draw it
if (typeof window !== 'undefined') {
    window.wpBoxes = { open: open, close: close, sync: sync, holds: holds, pieceOk: boxPieceOk, gmMay: gmMay, has: has, copyFor: copyFor, ask: ask, steal: steal, stealGo: stealGo, stealOn: stealOn, view: view, bodyHas: bodyHas, bodyOpen: bodyOpen, tookNote: tookNote, putBack: putBack, redraw: function() { var p = P(); if (p && p.style.display !== 'none' && !_box.player) draw(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
export { open, close, sync, holds, boxPieceOk };
