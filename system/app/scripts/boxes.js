/* Containers (1.6.2, backlog 42, fold 1: the GM's side; the owner, 2026-11-12, by prompt after a drawn sheet: "A. Any piece, by a tick" and
   "A. Tiles, like a crate"). The container window: what a container on the play map holds, as tiles of the item's icon and count, its name
   under it, what the item says on hover. The GM adds an item from the system's items or the library, changes a count and takes one out. Every
   change goes through boxcore boxOp (systemcore applyRowOp on a stand-in sheet), so a list's own rules and caps hold, and is one save. The
   GM's alone: never on a player's app, at someone else's table or in the stream window, and nothing of it is sent. Steps log as boxes v1. */

import { getActiveCampaign, getActiveMap } from './models.js';
import { state } from './state.js';
import { save, toast, toastAction } from './io.js';
import * as BC from './boxcore.js';
import { applyRowOp, glyphPath, uid, cleanPic, tradeApply, rowIdOf } from './systemcore.js';
import { picRef } from './safecore.js';
import * as F from './formula.js';
import { showPrompt } from './dialogs.js';
import { gridFor, squareGrid, cellOf, cellCenter, cellKey } from './fogcore.js';   // 1.6.4: the cell a pile lies in

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
        if (typeof pileRoom === 'function') pileRoom(camp); var id = BC.newBoxId(Math.random, camp.boxes); if (!id) return 'This campaign holds as many containers as it can.';
        if (Object.keys(camp.boxes).length >= BC.BOX_MAX) return 'This campaign holds as many containers as it can.';
        camp.boxes[id] = { id: id, values: {} }; w.box = id; save(); step('holds', { on: true }); if (typeof window.appRender === 'function') window.appRender();
        return 'It holds items now. Open contents to put some in.';
    }
    var b = boxOf(camp, w), n = b ? BC.boxCount(sysOf(camp), b) : 0;
    var drop = function() { if (b) delete camp.boxes[w.box]; delete w.box; delete w.pile; save(); step('holds', { on: false, n: n }); if (_box.pieceId === w.id) close(); if (typeof window.appRender === 'function') window.appRender(); };
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
    if (pc) { var src = n && typeof n.assetSrc === 'function' ? n.assetSrc(pc) : pc; if (src === pc) src = picRef(pc); if (src) { var im = document.createElement('img'); im.className = 'box-pic'; im.alt = ''; im.dataset.pic = pc; im.dataset.icon = typeof t.icon === 'string' ? t.icon : ''; im.dataset.nm = typeof t.name === 'string' ? t.name : ''; im.addEventListener('error', function() { picGone(im); }); im.src = src; if (window.wpSheets && typeof window.wpSheets.picPeek === 'function') window.wpSheets.picPeek(im); box.appendChild(im); return; } }   // its own picture: the campaign's, through the host on a player's app
    var g = typeof t.icon === 'string' && /^icon:/.test(t.icon) ? glyphPath(t.icon) : '';
    if (g && /^(solid|regular|brands)\/[a-z0-9-]{1,40}$/.test(g)) { var s = el('span', 'box-glyph wp-glyph'), u = 'url("/assets/icons/fa/' + g + '.svg")'; s.setAttribute('aria-hidden', 'true'); s.style.webkitMaskImage = u; s.style.maskImage = u; box.appendChild(s); return; }   // 1.6.2 (the review of the item card): a bundled icon is a file, drawn as the sheet draws one
    box.appendChild(el('span', 'box-ch', t.icon ? t.icon : (t.name || '?').charAt(0).toUpperCase()));
}
// The selected item as a small card (the owner, 2026-11-12, by prompt: "B. A small card for the item"): its picture large, its name and
// list beside it, the count's stepper at the right, and the actions in a row at its foot. Answers { bar, step, acts }
// The control of a counter that had the focus as it changed: its typed box, else the button pressed (1.6.2, the sweep of backlog 225)
function stepAt(btn) { var a = typeof document !== 'undefined' ? document.activeElement : null; return a && a.classList && a.classList.contains('box-qin') ? '.box-qin' : btn; }
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
    b.values = r.values;
    if (pileSync(camp, getActiveMap(), w) === 'gone') { save(); step(what, { pile: 'gone' }); close(); toast('The pile is empty now, so it is gone from the map.'); if (typeof window.appRender === 'function') window.appRender(); return; }   // 1.6.4: a pile emptied goes
    save(); step(what, {}); draw(); if (typeof window.appRender === 'function') window.appRender(); refocus(back);
}
// A row's own picture, the GM's: through boxcore boxPic, one save
function setPic(fid, rowId, path) {
    var camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w); if (!gmMay() || !b) { close(); return; }
    var r = BC.boxPic(sysOf(camp), b, fid, rowId, path); if (!r.ok) { toast(r.reason === 'pic' ? 'Pick one of this campaign\u2019s own pictures.' : 'That is no longer in it.'); return; }
    b.values = r.values; pileSync(camp, getActiveMap(), w); save(); step(path ? 'pic' : 'nopic', {}); draw(); if (typeof window.appRender === 'function') window.appRender(); refocus(['.box-picbtn']);
}
// Fold 2b (the owner, 2026-11-12: "A. Open for everyone", "A. Yes, a key you name"): the lock, the GM's. Locked, a player next to it sees
// only its rolls and, where they carry it, its key; a pass or the key opens it for everyone, and Locked comes unticked here
function setLock(patchL, back) {
    var camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w); if (!gmMay() || !b) { close(); return; }
    var lk = BC.cleanLock(Object.assign({}, b.lock || {}, patchL), sysOf(camp)); if (lk) b.lock = lk; else delete b.lock;
    save(); step('lock', { on: !!(lk && lk.on), rolls: lk && lk.rolls ? lk.rolls.length : 0, key: !!(lk && lk.key) }); draw(); refocus(back);
}
// 1.6.4 (Fulllion, 2026-11-23: "there should be differen types of locked containers, those players can see the contents of but cant interact
// unless unlocked, and those where they cant"): What players see while locked. Solid (a chest, a safe): only that it is locked. See-through (a
// display case, a cage): what is inside, as tiles and counts, with nothing to take or put until it is opened
function seeInto(lk) {
    var wrap = el('label', 'box-seewrap'), sv = el('select', 'box-see'); sv.title = 'What players next to it see while it is locked';
    [['', 'Solid'], ['thru', 'See-through']].forEach(function(o) { var op = el('option', '', o[1]); op.value = o[0]; sv.appendChild(op); }); sv.value = lk && lk.see === 'thru' ? 'thru' : '';
    if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(sv);
    sv.addEventListener('change', function() { setLock({ see: sv.value === 'thru' ? 'thru' : '' }, ['.box-see']); });
    wrap.appendChild(el('span', 'box-lockcap', 'Players see')); wrap.appendChild(sv); return wrap;
}
// 1.6.4 (the addendum: "in containers the gm allows, like unlocked ones"): the GM's tick, Players may put in, on by default for a container with no
// lock, off for one with a lock. A locked one takes nothing from a player until it is opened, whatever the tick says
function putTickInto(body, b) {
    var lb = el('label', 'box-puttick'), cb = el('input', 'box-puton'); cb.type = 'checkbox'; cb.checked = BC.boxPutTick(b);
    lb.title = 'Players next to it may put things of their own in. While it is locked, nothing goes in until it is opened.';
    cb.addEventListener('change', function() { var c2 = getActiveCampaign(), w2 = piece(), b2 = boxOf(c2, w2); if (!gmMay() || !b2) return; b2.put = cb.checked; save(); step('put-tick', { on: cb.checked }); draw(); refocus(['.box-puton']); });
    lb.appendChild(cb); lb.appendChild(el('span', '', 'Players may put in')); body.appendChild(lb);
}
function keyLabel(camp, sys, id) {
    var it = (Array.isArray(sys.items) ? sys.items : []).filter(function(x) { return x && x.id === id; })[0]; if (it) return it.name || 'Key';
    var LB = window.wpLibrary, e = LB && typeof LB.entryFor === 'function' ? LB.entryFor(id) : null; return e && typeof e.name === 'string' && e.name ? e.name : 'A library entry';
}
function lockInto(body, camp, b, sys) {
    var lk = b.lock || {}, box = el('div', 'box-lock'), head = el('label', 'box-locktick'), cb = el('input', 'box-lockon'); cb.type = 'checkbox'; cb.checked = lk.on === true;
    cb.addEventListener('change', function() { setLock({ on: cb.checked }, ['.box-lockon']); });
    head.appendChild(cb); head.appendChild(el('span', 'wib ' + (lk.on === true ? 'wi-padlock' : 'wi-unlock') + ' box-lockic')); head.appendChild(el('span', '', lk.on === true ? 'Locked' : 'Lock'));
    var top = el('div', 'box-lockhead'); top.appendChild(head); top.appendChild(seeInto(lk)); box.appendChild(top);   // 1.6.4: beside Lock, what players see while it is locked
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
// 1.6.4: the map and piece that hold a box, or null
function boxPieceAt(camp, boxId) { var hit = null; Object.keys(camp.items || {}).some(function(k) { var m = camp.items[k]; return !!m && m.type === 'map' && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { if (w && w.box === boxId) { hit = { map: m, w: w }; return true; } return false; }); }); return hit; }
// 1.6.4: a pile whose last thing was taken, laid again where it lay so a take of it can go back (its map still there)
function pileRelay(camp, b) {
    var a = b && b.at, m = a && camp.items && Object.prototype.hasOwnProperty.call(camp.items, a.map) ? camp.items[a.map] : null; if (!m || m.type !== 'map' || m.stub === true) return null;
    if (!Array.isArray(m.whiteboard)) m.whiteboard = [];
    var here = pileHere(camp, m, pileSpot(m, { x: a.x, y: a.y, w: a.s, h: a.s })), hb = here ? boxOf(camp, here) : null; if (here && hb) return { map: m, w: here, into: hb };   // the review: one pile a cell, so it goes back into the pile lying there
    var w = { id: uid('wb'), type: 'image', src: '', x: a.x, y: a.y, w: a.s, h: a.s, color: 'transparent', layer: 'back-mid', name: 'Pile', box: b.id }; m.whiteboard.push(w);
    return { map: m, w: w, relaid: true };
}
// A take put back: the trade's own rule from the character to the container, as much as they still hold, one save; the take leaves the list
function putBack(boxId, takeId) {
    var camp = getActiveCampaign(); if (!gmMay() || !camp || !camp.boxes || !Object.prototype.hasOwnProperty.call(camp.boxes, boxId)) return;
    var b = camp.boxes[boxId], sys = sysOf(camp), rec = (Array.isArray(b.taken) ? b.taken : []).filter(function(r) { return r.id === takeId; })[0]; if (!rec) { toast('That take is no longer listed.'); return; }
    var at = boxPieceAt(camp, boxId); if (!at && BC.boxIsPile(b)) at = pileRelay(camp, b);   // 1.6.4: a pile emptied by takes is laid again where it lay
    if (!at) { toast('That container is no longer on a map, so nothing can go back into it.'); return; }   // the review: a deleted piece's store goes at the next load
    var relaid = at.relaid === true;
    var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, rec.ch) ? camp.chars[rec.ch] : null, plan = ch ? BC.putBackPlan(sys, ch, rec) : { lines: [], gone: rec.lines.length, held: 0 };
    var drop = function() { b.taken = b.taken.filter(function(r) { return r.id !== takeId; }); if (!b.taken.length) delete b.taken; };
    if (!plan.lines.length) { drop(); if (relaid) pileSync(camp, at.map, at.w); save(); step('putback', { moved: 0, held: plan.held }); toast(!ch ? 'That character is gone.' : plan.held ? 'What is left of it is kept on ' + (ch.name || 'that sheet') + ', or holds parts of their own, so it stays.' : 'Nothing of it is on ' + (ch.name || 'that sheet') + ' any more.'); redrawGm(); return; }
    var tb = at.into || b, res = tradeApply(sys, ch, BC.boxChar(tb), plan.lines, [], 'gm', 'gm', {}); if (!res || !res.ok) { if (relaid) pileSync(camp, at.map, at.w); toast((res && res.msg) || 'It cannot go back.'); step('putback-refused', {}); return; }
    ch.values = ch.values || {}; Object.keys(res.valuesA).forEach(function(k) { ch.values[k] = res.valuesA[k]; }); ch.updated = Date.now();
    var v = Object.assign({}, tb.values || {}); Object.keys(res.valuesB).forEach(function(k) { if (Array.isArray(res.valuesB[k]) && res.valuesB[k].length) v[k] = res.valuesB[k]; else delete v[k]; }); tb.values = v;
    drop(); if (tb !== b && !b.taken && !BC.boxesNamed(camp.items)[b.id]) delete camp.boxes[b.id];   // its record spent, the box that held it goes
    pileSync(camp, at.map, at.w); save(); pileTell(camp, at.map);
    var n = window.wpNet, words = res.linesA.join(', ') || 'it', name = boxName(camp, boxId);
    if (n && n.active && n.role === 'host' && typeof n.syncCharDelta === 'function' && Object.keys(res.valuesA).length) n.syncCharDelta(ch.id, res.valuesA);
    if (window.wpSheets && typeof window.wpSheets.charChanged === 'function') window.wpSheets.charChanged(ch.id);
    if (b.tell !== false && n && typeof n.showTell === 'function' && typeof ch.ownerId === 'string' && ch.ownerId) n.showTell(ch.ownerId, 'The GM put ' + words + ' back in ' + name + '.');
    toast('Put ' + words + ' back in ' + name + (plan.gone || plan.held ? '. Some of it is no longer on ' + (ch.name || 'that sheet') + ', or stays with them.' : '.')); step('putback', { moved: plan.lines.length, gone: plan.gone, held: plan.held, told: b.tell !== false });
    redrawGm(); if (typeof window.appRender === 'function') window.appRender();
}
// 1.6.4: a change of a pile's piece on a map the GM is not looking at reaches the players who hold that map (a save sends the map on screen)
function pileTell(camp, map) { var n = window.wpNet, on = getActiveMap(); if (n && n.active && n.role === 'host' && typeof n.sendItem === 'function' && map && (!on || on.id !== map.id)) { try { n.sendItem(camp.id, map.id); } catch (e) {} } }
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
    if (BC.boxIsPile(b)) body.appendChild(el('div', 'muted box-say box-pilesay', 'Dropped here. Anyone next to it may take from it or put things in. Emptied, it goes.'));   // 1.6.4: a pile is never locked
    else { lockInto(body, camp, b, sys); putTickInto(body, b); }   // fold 2b; 1.6.4 Players may put in
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
            var U = (typeof window !== 'undefined' && window.wpUi && window.wpUi.step ? window.wpUi : null);   // 1.6.2: the app's own counter, its figure typed (the owner: "any slider, or increment control should allow the typing of values")
            if (U) { var su = U.step({ value: sel.qty, min: 1, label: 'How many', lessTip: 'One fewer', moreTip: 'One more', lessCls: 'box-less', moreCls: 'box-more', valCls: 'box-qin', truth: function() { return sel.qty; }, set: function(n) { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: n }, n < sel.qty ? 'less' : 'more', [stepAt(n < sel.qty ? '.box-less' : '.box-more'), '.box-less', '.box-more']); } }); card.step.parentNode.replaceChild(su, card.step); card.step = su; }
            else {
            var mi = el('button', 'tool ghost box-less', '−'); mi.type = 'button'; mi.title = 'One fewer'; mi.setAttribute('aria-label', 'One fewer');
            mi.disabled = sel.qty <= 1; mi.addEventListener('click', function() { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: sel.qty - 1 }, 'less', ['.box-less', '.box-more']); });
            var pl = el('button', 'tool ghost box-more', '+'); pl.type = 'button'; pl.title = 'One more'; pl.setAttribute('aria-label', 'One more');
            pl.addEventListener('click', function() { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: sel.qty + 1 }, 'more', ['.box-more']); });
            card.step.appendChild(mi); card.step.appendChild(el('span', 'box-q', sel.qty)); card.step.appendChild(pl);
            }
        } else card.step.remove();
        var pk = el('button', 'tool ghost box-picbtn', 'Picture'); pk.type = 'button'; pk.title = 'A picture for this item in this container. The item keeps it when it is taken.';
        pk.addEventListener('click', function() { if (!window.wpPickImage) { toast('The Image Library is not available here.'); return; } window.wpPickImage(function(src) { if (typeof src !== 'string') return; setPic(sel.fid, sel.rowId, src); }); });
        // The two picture buttons as one joined pair (the owner, 2026-11-12, of A's layout). 1.6.4: the frame is the app's shared .ui-seg (Fulllion, 2026-11-25:
        // "Join the button rows"); box-seg stays as a name for it
        var seg = el('span', 'ui-seg box-seg'); seg.appendChild(pk); card.acts.appendChild(seg);
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
    // 1.6.4 window bar: kept below the strip the desktop app draws at the window's top (wpWinBarH, 0 in a browser)
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = Math.max(e.clientY - drag.dy, (window.wpWinBarH && window.wpWinBarH()) || -1e9) + 'px'; p.style.right = 'auto'; });
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
// 1.6.4 (Fulllion, 2026-11-23): a See-through container's mark lists what it holds on hover. Resting on the mark asks the host, at most every three
// seconds, and the host answers only where this player can see that spot; the answer is the mark's tip for a minute, and the tip on screen now
var _peekAnswers = Object.create(null);
var PEEK_KEEP_MS = 60000, PEEK_ASK_GAP_MS = 3000, PEEK_TILES_SAID = 12;   // how long an answer stands as the tip, how often a mark may ask, how many items its words name
function peekTip(id) { var answer = typeof id === 'string' && Object.prototype.hasOwnProperty.call(_peekAnswers, id) ? _peekAnswers[id] : null; return answer && answer.words && Date.now() - answer.at < PEEK_KEEP_MS ? answer.words : ''; }
function peek(id) {
    var n = window.wpNet, map = getActiveMap(); if (!n || typeof n.boxAsk !== 'function' || !map || typeof id !== 'string' || window.wpStream) return;
    var answer = Object.prototype.hasOwnProperty.call(_peekAnswers, id) ? _peekAnswers[id] : (_peekAnswers[id] = { at: 0, asked: 0, words: '' }); if (Date.now() - answer.asked < PEEK_ASK_GAP_MS) return; answer.asked = Date.now();
    n.boxAsk('peek', map.id, id, {}); step('peek', {});
}
function peekGot(msg) {
    var tiles = cleanTiles(msg.tiles), words = tiles.length ? 'Locked. Inside: ' + tiles.slice(0, PEEK_TILES_SAID).map(function(t) { return t.name + (t.qty > 1 ? ' \u00d7' + t.qty : ''); }).join(', ') + (tiles.length > PEEK_TILES_SAID ? ', and more' : '') + '.' : 'Locked. It is empty inside.';
    var answer = Object.prototype.hasOwnProperty.call(_peekAnswers, msg.itemId) ? _peekAnswers[msg.itemId] : (_peekAnswers[msg.itemId] = { asked: 0 }); answer.at = Date.now(); answer.words = words;
    document.querySelectorAll('#whiteboard .wb-box').forEach(function(markEl) { if (markEl.dataset.id !== msg.itemId) return; markEl.dataset.tip = words; markEl.setAttribute('aria-label', words); var tipOnScreen = document.getElementById('wpTip'); if (tipOnScreen && tipOnScreen.style.display === 'block' && markEl.matches(':hover')) tipOnScreen.textContent = words; });   // found by comparing, never a selector built from an id
}
function view(msg) {
    var p = P(), map = getActiveMap(); if (!p || !msg || typeof msg.itemId !== 'string' || typeof msg.mapId !== 'string' || !map || map.id !== msg.mapId) return;
    if (msg.peek === true) { peekGot(msg); return; }   // 1.6.4: what a See-through container holds, for its mark's tip; never the window
    var shown = p.style.display !== 'none', same = shown && _box.player && _box.pieceId === msg.itemId, tok = _ask && _ask.itemId === msg.itemId ? _ask.tok : (same ? _box.tok : null); if (!tok) return;   // only an ask that waits or the window open on it (the review)
    if (msg.gone === true) { if (same) { _box.player = false; p.style.display = 'none'; _box = { mapId: null, pieceId: null, sel: null, list: null }; } _ask = null; return; }   // the host closed it: nothing to tell it back
    _ask = null; var want = same ? _box.want : null;
    _box = { player: true, mapId: msg.mapId, pieceId: msg.itemId, tok: tok, sel: same ? _box.sel : null, qty: same ? _box.qty : 1, list: null, tiles: cleanTiles(msg.tiles), locked: cleanLocked(msg.locked), name: typeof msg.name === 'string' ? msg.name.slice(0, 120) : '', put: msg.put === true, pile: msg.pile === true, putSel: same ? _box.putSel : null, putQty: same ? _box.putQty : 1 };   // 1.6.4: put, whether they may put in; pile, a dropped pile
    if (!_box.tiles.some(function(t) { return t.rowId === _box.sel; })) { _box.sel = null; _box.qty = 1; }
    var was = p.style.display !== 'none'; p.style.display = ''; if (!was && window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    var f = document.activeElement, cls = f && p.contains(f) && f.className ? '.' + String(f.className).split(' ')[0] : null;
    drawPlayer(); if (cls) refocus([cls, '.box-try', '.box-usekey', '.box-tile', '.box-all']);
    var go = _box.locked && _box.locked.go; if (go && go === want) { var tk = lockTok(), sh = window.wpSheets, n = window.wpNet; if (tk && typeof tk.charId === 'string' && sh && typeof sh.runDue === 'function' && sh.runDue(tk.charId, go) === false && n && typeof n.boxAsk === 'function') n.boxAsk('untry', _box.mapId, _box.pieceId, { tok: _box.tok }); }
}
// Fold 2b: locked, the host sends its rolls and the key the character carries, as plain words; a press of a roll names it to the host and
// then makes that roll from the character's own sheet, which the host judges as any roll; the key asks the host to open it
function cleanLocked(raw) {   // 1.6.4: see, See-through: its tiles shown and nothing taken
    if (!raw || typeof raw !== 'object') return null; var cut = function(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : ''; };
    var rolls = (Array.isArray(raw.rolls) ? raw.rolls.slice(0, 12) : []).filter(function(r) { return r && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.id); }).slice(0, 3).map(function(r) { return { id: r.id, label: cut(r.label, 60) || 'Roll' }; });
    var out = { rolls: rolls }; var k = cut(raw.key, 80); if (k) out.key = k; if (raw.held === true) out.held = true; if (raw.see === true) out.see = true; if (typeof raw.go === 'string' && rolls.some(function(r) { return r.id === raw.go; })) out.go = raw.go; return out;
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
    if (lk.rolls.length && ch) wrap.appendChild(el('div', 'box-lockwho', (ch.name || 'Your character') + ' rolls. ' + (lk.see ? 'You can see inside, and nothing comes out until it opens.' : 'Nothing in it shows until it opens.')));
    body.appendChild(wrap);
}
function take(more) { var n = window.wpNet; if (!_box.player || !n || typeof n.boxAsk !== 'function') return; var r = n.boxAsk('take', _box.mapId, _box.pieceId, Object.assign({ tok: _box.tok }, more)); if (r && r.error) toast(r.error); step('take', { all: !!more.all }); }
function drawPlayer() {
    var p = P(); if (!p) return; var nm = document.getElementById('boxName'); if (nm) nm.textContent = _box.name || 'Container';
    var body = document.getElementById('boxBody'); if (!body) return; while (body.firstChild) body.removeChild(body.firstChild);
    if (_box.locked) { lockedInto(body); if (_box.locked.see) seenInto(body, _box.tiles || []); return; }   // fold 2b; 1.6.4 See-through: what is inside, as tiles to look at
    var tiles = _box.tiles || [];
    if (!tiles.length) { body.appendChild(el('div', 'muted box-say', 'It is empty.')); if (_box.put) putBar(body); return; }
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
            var Uq = (typeof window !== 'undefined' && window.wpUi && window.wpUi.step ? window.wpUi : null);
            if (Uq) { var sq = Uq.step({ value: q, min: 1, max: sel.qty, label: 'How many to take', lessTip: 'Take fewer', moreTip: 'Take more', lessCls: 'box-less', moreCls: 'box-more', valCls: 'box-qin', set: function(n) { var k = stepAt(n < q ? '.box-less' : '.box-more'); _box.qty = n; drawPlayer(); refocus([k, '.box-more', '.box-less']); } }); card.step.parentNode.replaceChild(sq, card.step); card.step = sq; }
            else {
            var mi = el('button', 'tool ghost box-less', '\u2212'); mi.type = 'button'; mi.title = 'Take fewer'; mi.setAttribute('aria-label', 'Take fewer'); mi.disabled = q <= 1; mi.addEventListener('click', function() { _box.qty = q - 1; drawPlayer(); refocus(['.box-less', '.box-more']); });
            var pl = el('button', 'tool ghost box-more', '+'); pl.type = 'button'; pl.title = 'Take more'; pl.setAttribute('aria-label', 'Take more'); pl.disabled = q >= sel.qty; pl.addEventListener('click', function() { _box.qty = q + 1; drawPlayer(); refocus(['.box-more', '.box-less']); });
            card.step.appendChild(mi); card.step.appendChild(el('span', 'box-q', q)); card.step.appendChild(pl);
            }
        } else card.step.remove();
        var tk = el('button', 'tool box-take', 'Take'); tk.type = 'button'; tk.title = 'Put it in your own sheet'; tk.addEventListener('click', function() { if (card.step && typeof card.step.flush === 'function') card.step.flush(); take({ fid: sel.fid, rowId: sel.rowId, qty: Math.max(1, Math.min(sel.qty, _box.qty | 0 || q)) }); });   // 1.6.3 (the review of sheets and rolls, finding 4): a count typed and not yet handed on counts (flush), read as the counter left it
        card.acts.appendChild(el('span', 'box-gap')); card.acts.appendChild(tk); body.appendChild(bar);
    }
    var all = el('button', 'tool box-all', 'Take all'); all.type = 'button'; all.title = 'Put everything in it in your own sheet'; all.addEventListener('click', function() { take({ all: true }); });
    var foot = el('div', 'box-add'); foot.appendChild(all); body.appendChild(foot);
    if (_box.put) putBar(body);   // 1.6.4 Put in
}
// 1.6.4: a See-through container, locked: its tiles and counts, each with what it says on hover, and nothing to press
function seenInto(body, tiles) {
    if (!tiles.length) { body.appendChild(el('div', 'muted box-say', 'It is empty.')); return; }
    var grid = el('div', 'box-grid box-seen'); grid.setAttribute('role', 'list');
    tiles.forEach(function(t) { var d = el('div', 'box-tile box-look'); d.setAttribute('role', 'listitem'); d.tabIndex = 0; d.title = tipOf(t); d.setAttribute('aria-label', t.name + (t.qty > 1 ? ', ' + t.qty : '')); var ic = el('span', 'box-ic'); iconInto(ic, t); d.appendChild(ic); if (t.qty > 1) d.appendChild(el('span', 'box-n', t.qty)); d.appendChild(el('span', 'box-nm', t.name)); grid.appendChild(d); });
    body.appendChild(grid);
}
// 1.6.4 Put in (the addendum: "players need to be able to place in containers too along with gms"): a row of the character it was opened with,
// or a count of it, put in from their own sheet. The rows offered are the ones the trade would let them give; the host judges it again
function putBar(body) {
    var camp = getActiveCampaign(), tk = lockTok(), sys = sysOf(camp), S = window.wpSystemCore, n = window.wpNet, ch = tk && camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, tk.charId) ? camp.chars[tk.charId] : null;
    var wrap = el('div', 'box-putbar'), mine = sys ? BC.boxLists(sys).filter(function(f) { return f.edit === 'owner'; }).map(function(f) { return f.id; }) : [];
    var rows = ch && S && typeof S.tradeOfferable === 'function' ? S.tradeOfferable(sys, ch, 'player').filter(function(o) { return !o.no && mine.indexOf(o.fid) >= 0; }) : [], key = function(o) { return o.fid + '|' + o.rowId; };
    wrap.appendChild(el('span', 'box-lockcap', 'Put in'));
    if (!rows.length) { wrap.appendChild(el('span', 'muted box-putnone', 'Nothing of ' + ((ch && ch.name) || 'yours') + ' can go in.')); body.appendChild(wrap); return; }
    if (!rows.some(function(o) { return key(o) === _box.putSel; })) { _box.putSel = key(rows[0]); _box.putQty = rows[0].qty; }
    var cur = rows.filter(function(o) { return key(o) === _box.putSel; })[0], q = Math.max(1, Math.min(cur.qty, _box.putQty | 0 || cur.qty)); _box.putQty = q;
    var sel = el('select', 'box-putsel'); sel.title = 'Something of your own to put in';
    rows.forEach(function(o) { var op = el('option', '', o.name + (o.qty > 1 ? ' ×' + o.qty : '')); op.value = key(o); sel.appendChild(op); }); sel.value = _box.putSel;
    if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(sel);
    sel.addEventListener('change', function() { _box.putSel = sel.value; var o = rows.filter(function(x) { return key(x) === sel.value; })[0]; _box.putQty = o ? o.qty : 1; drawPlayer(); refocus(['.box-putsel']); });
    wrap.appendChild(sel);
    var stp = null, U = window.wpUi && window.wpUi.step ? window.wpUi : null;
    if (cur.qty > 1 && U) { stp = U.step({ value: q, min: 1, max: cur.qty, label: 'How many to put in', lessTip: 'Put in fewer', moreTip: 'Put in more', lessCls: 'box-pless', moreCls: 'box-pmore', valCls: 'box-pqin', set: function(k) { _box.putQty = k; drawPlayer(); refocus(['.box-pqin', '.box-pmore', '.box-pless']); } }); wrap.appendChild(stp); }
    var go = el('button', 'tool box-put', 'Put in'); go.type = 'button'; go.title = 'Move it from your own sheet into this';
    go.addEventListener('click', function() { if (stp && typeof stp.flush === 'function') stp.flush(); if (!_box.player || !n || typeof n.boxAsk !== 'function') return; var r = n.boxAsk('put', _box.mapId, _box.pieceId, { tok: _box.tok, fid: cur.fid, rowId: cur.rowId, qty: Math.max(1, Math.min(cur.qty, _box.putQty | 0 || 1)) }); if (r && r.error) toast(r.error); step('put-ask', {}); });
    wrap.appendChild(go); body.appendChild(wrap);
}
// [boxcheck:player-end]
// [boxcheck:drop-start]
// 1.6.4 (Fulllion, 2026-11-23, by prompt): Drop here. A row of a sheet, or a count of it, leaves the sheet and lands at its token's cell as a
// PILE: a container the drop makes, holding exactly what was dropped. One pile a cell: a drop where a pile lies joins it. The pile wears the
// first thing in it (its picture, else its icon) with a count when there is more than one. Anyone next to it takes from it as from any
// container, and a pile emptied goes. The move runs on the machine that owns the campaign (the GM's own hand here, a player's through the
// host's drop branch in net.js), through boxcore moveIn, one save. These run on the host alone: nothing of a box leaves it
function pileGrid(map) { var gt = map && map.meta ? map.meta.gridType : null; return gridFor(gt === 'square' || gt === 'hex' ? gt : 'off', null, map && map.meta ? map.meta.cell : null) || squareGrid(50); }   // a map with no grid and no cell of its own: a 50 px square, as a gridless board reads one
// Where a pile at a token lies: the cell under the token's middle, a square of three fifths of a cell at its center
function pileSpot(map, tok) {
    var g = pileGrid(map), c = cellOf((tok.x || 0) + (tok.w || 0) / 2, (tok.y || 0) + (tok.h || 0) / 2, g), mid = cellCenter(c, g), s = Math.max(12, Math.round((g.type === 'square' ? g.size : g.h) * 0.6));
    return { key: cellKey(c, g), x: Math.round(mid.x - s / 2), y: Math.round(mid.y - s / 2), s: s };
}
// The pile already lying in that cell, shown (a pile the GM hid is passed over, so a drop is never hidden from its dropper)
function pileHere(camp, map, spot) {
    var g = pileGrid(map); return (Array.isArray(map.whiteboard) ? map.whiteboard : []).filter(function(w) { var b = w && !w.hidden ? boxOf(camp, w) : null; return !!b && BC.boxIsPile(b) && BC.boxPieceOk(w) && cellKey(cellOf((w.x || 0) + (w.w || 0) / 2, (w.y || 0) + (w.h || 0) / 2, g), g) === spot.key; })[0] || null;
}
// A pile's piece follows what it holds: its face, its picture and its name, and where it lies (so Put back can lay it again). Emptied, the
// piece goes; its box stays while a take of it is listed, for Put back, until the next load tidies it. Answers 'gone', 'kept' or ''
function pileSync(camp, map, w) {
    var b = boxOf(camp, w); if (!b || !BC.boxIsPile(b) || !map || !Array.isArray(map.whiteboard)) return '';
    var face = BC.pileFace(sysOf(camp), b); b.at = { map: map.id, x: w.x || 0, y: w.y || 0, s: Math.max(4, Math.min(2000, w.w || 30)) };   // where it lay last, even as it goes (the review)
    if (!face) { var i = map.whiteboard.indexOf(w); if (i >= 0) map.whiteboard.splice(i, 1); if (!(Array.isArray(b.taken) && b.taken.length)) delete camp.boxes[b.id]; return 'gone'; }
    w.pile = { n: face.n, k: face.k }; if (face.icon && !face.pic) w.pile.icon = face.icon; w.src = face.pic || ''; w.name = face.k > 1 ? face.name + ' and more' : face.name;
    return 'kept';
}
// The drop: what moves (boxcore moveIn, all or none), then the pile it lands in, found or made. Changes the campaign in memory; the caller saves
// and tells the table. Answers { ok, lines, valuesA, w, made } or { ok: false, msg }
function dropInto(camp, map, tok, ch, fid, rowId, qty, who) {
    if (!camp || !map || map.type !== 'map' || !tok || !ch) return { ok: false, msg: 'That character has no token on this map.' };
    var spot = pileSpot(map, tok), w = pileHere(camp, map, spot), box = w ? boxOf(camp, w) : null, id = box ? box.id : null;
    if (!box) { pileRoom(camp); var have = camp.boxes && typeof camp.boxes === 'object' ? camp.boxes : Object.create(null); if (Object.keys(have).length >= BC.BOX_MAX) return { ok: false, msg: 'This campaign holds as many containers as it can.' }; id = BC.newBoxId(Math.random, have); if (!id) return { ok: false, msg: 'This campaign holds as many containers as it can.' }; box = { id: id, values: {}, pile: true }; }
    var r = BC.moveIn(sysOf(camp), ch, box, fid, rowId, qty, who, F); if (!r.ok) return { ok: false, msg: r.msg || 'That cannot be dropped now.' };
    ch.values = ch.values || {}; Object.keys(r.valuesA).forEach(function(k) { ch.values[k] = r.valuesA[k]; }); ch.updated = Date.now();
    var made = false;
    if (!w) {
        camp.boxes = camp.boxes && typeof camp.boxes === 'object' ? camp.boxes : Object.create(null); camp.boxes[id] = box;
        if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
        w = { id: uid('wb'), type: 'image', src: '', x: spot.x, y: spot.y, w: spot.s, h: spot.s, color: 'transparent', layer: 'back-mid', name: 'Pile', box: id }; map.whiteboard.push(w); made = true;   // under the tokens: it lies at their feet
    }
    box.values = r.values; pileSync(camp, map, w);
    return { ok: true, lines: r.lines, valuesA: r.valuesA, w: w, made: made };
}
// The review: an emptied pile keeps its box for Put back until the next load, so a full store lets the oldest such box go (one no piece names) to make
// room, rather than refuse a drop or a container
function pileRoom(camp) {
    var st = camp && camp.boxes && typeof camp.boxes === 'object' ? camp.boxes : null; if (!st || Object.keys(st).length < BC.BOX_MAX) return;
    var named = BC.boxesNamed(camp.items), old = null; Object.keys(st).forEach(function(id) { var b = st[id]; if (named[id] || !BC.boxIsPile(b)) return; var t = Array.isArray(b.taken) && b.taken[0] ? b.taken[0].at || 0 : 0; if (!old || t < old.t) old = { id: id, t: t }; });
    if (old) delete st[old.id];
}
// [boxcheck:drop-end]
// The token a character drops at: on the map on screen, the selected one of theirs, else the first. A player's: shown and their own
function dropTok(map, charId, player) {
    var sel = state && Array.isArray(state.selWbIds) ? state.selWbIds : [], mine = (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).filter(function(x) { return x && x.isChar && !x.waiting && x.charId === charId && !(player && x.hidden); });
    return mine.filter(function(x) { return sel.indexOf(x.id) >= 0; })[0] || mine[0] || null;
}
// Whether a row shows Drop here: an item of a list a container may hold, on a character with a token on the map on screen. The GM's for any
// sheet; a player's for a sheet of their own (or shared with them) on a list they change. The host judges it again
function dropOk(c, f, entry) {
    var camp = getActiveCampaign(), map = getActiveMap(), sys = sysOf(camp), n = window.wpNet; if (!c || !f || !entry || entry.hid === 1 || !camp || !map || !sys || window.wpStream) return false;
    if (!BC.boxLists(sys).some(function(x) { return x.id === f.id; })) return false;
    if (c.making === 1 || c.making === true || c.partial) return false;
    if (gmMay()) return !!dropTok(map, c.id, false);
    if (!n || !n.active || n.role !== 'client' || n.stream || typeof n.dropAsk !== 'function' || f.edit !== 'owner') return false;
    if (!(c.ownerId === n.myId || c.shared === 1)) return false;
    return !!dropTok(map, c.id, true);
}
// Drop here, pressed: one row drops at once, a stack asks how many (all of it by default). No are-you-sure: Put back and a pick-up undo it
function drop(c, f, entry) {
    var rid = entry ? rowIdOf(entry) : '', q = Math.max(1, Math.floor(Number(entry && entry.qty)) || 1), noQ = !!(f && f.list && f.list.noQty); if (typeof rid !== 'string') return;
    if (q <= 1 || noQ) { dropGo(c.id, f.id, rid, 1); return; }
    showPrompt('Drop how many? From 1 to ' + q + '.', String(q), function(v) {
        if (v === null || v === undefined) return; var k = Number(String(v).trim());
        if (!(k >= 1) || k !== Math.floor(k) || k > q) { toast('Drop a whole number from 1 to ' + q + '.'); return; }
        dropGo(c.id, f.id, rid, k);
    });
}
function dropGo(charId, fid, rowId, qty) {
    var camp = getActiveCampaign(), map = getActiveMap(), n = window.wpNet; if (!camp || !map) return;
    if (!gmMay()) {   // a player's: the host judges it and answers in words
        var tp = dropTok(map, charId, true); if (!tp || !n || typeof n.dropAsk !== 'function') { toast('You need a token of this character on this map.'); return; }
        var rp = n.dropAsk(map.id, tp.id, fid, rowId, qty); if (rp && rp.error) toast(rp.error); step('drop-ask', {}); return;
    }
    var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null, tk = dropTok(map, charId, false);
    if (!ch || !tk) { toast('That character has no token on this map.'); return; }
    var r = dropInto(camp, map, tk, ch, fid, rowId, qty, 'gm'); if (!r.ok) { toast(r.msg); step('drop-refused', {}); return; }
    save();
    if (n && n.active && n.role === 'host' && typeof n.syncCharDelta === 'function' && Object.keys(r.valuesA).length) n.syncCharDelta(ch.id, r.valuesA);
    if (window.wpSheets && typeof window.wpSheets.charChanged === 'function') window.wpSheets.charChanged(ch.id);
    toast((ch.name || 'They') + ' dropped ' + (r.lines.join(', ') || 'it') + '. A pick-up or Put back undoes it.'); step('drop', { made: r.made, gm: true });
    redrawGm(); if (typeof window.appRender === 'function') window.appRender();
}
// The face a pile wears on the map: what lies on top (its picture is the piece's own, drawn as any picture; else its icon here) and a count
// badge for more than one. Drawn by the board from the piece alone, so the GM and a player draw it alike, and nothing of the box is read
function pileFace(node, item) {
    var pf = item && item.pile && typeof item.pile === 'object' ? BC.cleanPileFace(item.pile) : null, ic = node.querySelector(':scope > .wb-pile-ic'), bd = node.querySelector(':scope > .wb-pile-n');
    node.classList.toggle('wb-pile', !!pf);
    if (!pf) { if (ic) ic.remove(); if (bd) bd.remove(); return; }
    var want = item.src ? '' : (pf.icon || '?'); if (ic && ic.dataset.icon !== want) { ic.remove(); ic = null; }
    if (want && !ic) { ic = el('span', 'wb-pile-ic'); ic.dataset.icon = want; iconInto(ic, { icon: /^icon:/.test(want) || want !== '?' ? want : '', name: item.name || '?' }); node.appendChild(ic); }
    var nw = String(pf.n > 999 ? '999+' : pf.n);   // Fulllion, 2026-11-23: the count peeks out beside the token over the pile, so a pile is never hidden; a press on it opens the pile as its mark does
    if (!bd) { bd = el('button', 'wb-pile-n'); bd.type = 'button'; ['pointerdown', 'mousedown', 'dblclick'].forEach(function(ev) { bd.addEventListener(ev, function(e) { e.stopPropagation(); }); }); bd.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); var id = bd.dataset.id; if (!id || window.wpStream) return; if (gmMay()) open(id); else ask(id); }); node.appendChild(bd); }
    var bw = (pf.k > 1 ? pf.n + ' things lie here' : pf.n > 1 ? pf.n + ' lie here' : 'Something lies here') + '. Press to open it.'; if (bd.dataset.id !== item.id) bd.dataset.id = item.id; if (bd.textContent !== nw) bd.textContent = nw; if (bd.dataset.tip !== bw) { bd.dataset.tip = bw; bd.setAttribute('aria-label', bw); }
}
// A copy of a container (Duplicate, a paste) gets a container of its own with a copy of what it holds, or none where the store is full: two
// pieces never share one (the review)
function copyFor(it) {
    var camp = getActiveCampaign(); if (!it || typeof it !== 'object' || it.box === undefined) return;
    var src = boxOf(camp, it); delete it.box; if (!src || !gmMay() || !camp.boxes || Object.keys(camp.boxes).length >= BC.BOX_MAX) return;
    var id = BC.newBoxId(Math.random, camp.boxes); if (!id) return;
    camp.boxes[id] = { id: id, values: JSON.parse(JSON.stringify(src.values || {})) }; if (BC.boxIsPile(src)) camp.boxes[id].pile = true; it.box = id; step('copy', {});
}
function has(w) { return !!boxOf(getActiveCampaign(), w); }
// The window follows the app: a piece gone, another map or another campaign closes it; otherwise its name follows the piece's
function sync() { var p = P(); if (!p || p.style.display === 'none') return; if (_box.player) { var mp = getActiveMap(), n = window.wpNet; if (!mp || mp.id !== _box.mapId || !n || !n.active || n.role !== 'client') close(); return; } if (!piece() || !boxOf(getActiveCampaign(), piece()) || !gmMay()) { close(); return; } var nm = document.getElementById('boxName'), w = piece(); if (nm) nm.textContent = (typeof w.name === 'string' && w.name) ? w.name : 'Container'; }   // never drawn again under a press: only its own changes draw it
if (typeof window !== 'undefined') {
    window.wpBoxes = { open: open, close: close, sync: sync, holds: holds, pieceOk: boxPieceOk, gmMay: gmMay, has: has, copyFor: copyFor, ask: ask, steal: steal, stealGo: stealGo, stealOn: stealOn, view: view, bodyHas: bodyHas, bodyOpen: bodyOpen, tookNote: tookNote, putBack: putBack, peek: peek, peekTip: peekTip, dropOk: dropOk, drop: drop, dropInto: dropInto, pileSync: pileSync, pileFace: pileFace, pileTell: pileTell, redraw: function() { var p = P(); if (p && p.style.display !== 'none' && !_box.player) draw(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
export { open, close, sync, holds, boxPieceOk };
