/* A scene: a picture shown big to the table (backlog 181).
   The owner, 2026-10-24: "present scenes to every player as a pop-up image Rather than placing them on the map and having to drag the players
   over to them". The picks of 2026-10-27, by prompt on the mock-up sheet: the player sees "A window", a bigger handout window with the map
   behind it; each player closes it, the GM has Close for everyone and Show it again, and a tick keeps it up until the GM closes it; Show as a
   scene... is offered on a picture or token on the map, in the Image Library, on a picture handout and on a planner's picture; the drawing is
   the picture under a spotlight.
   A scene is a handout: it is saved as one (handouts.js wpHandoutFor) and sent as one (net.js revealHandout with the scene's keys), so a
   player's Journal keeps it unless the GM unticks Keep it in their Journals. This module is the GM's box and the scene that is up, which
   is this machine's memory alone. The pill in the top row says it while it is up (pills.js). */
import { net } from './net.js';
import { getActiveCampaign } from './models.js';
import { toast } from './io.js';
import { picRef } from './safecore.js';

// [scenecheck:core-start]
var SCENE_TITLE = 120, SCENE_CAP = 4000;
// The players a scene can go to: those connected now with an id, each once, by name
function sceneAudience(ros) {
    var seen = {}, out = [];
    Object.keys(ros && typeof ros === 'object' ? ros : {}).forEach(function(k) {
        var p = ros[k]; if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || seen[p.id]) return;
        seen[p.id] = 1; out.push({ id: p.id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : 'A player' });
    });
    return out.sort(function(a, b) { return a.name.localeCompare(b.name); });
}
// Who a scene goes to, as the box's chips say it: null for everyone, else the ticked players who are still there. Ticking none is everyone
function scenePids(picked, aud) {
    var ids = (Array.isArray(aud) ? aud : []).map(function(p) { return p.id; });
    var on = (Array.isArray(picked) ? picked : []).filter(function(id, i, a) { return ids.indexOf(id) >= 0 && a.indexOf(id) === i; });
    return on.length && on.length < ids.length ? on : null;
}
// Who it is showing to, in words
function sceneWho(pids, aud) {
    if (!pids) return 'everyone';
    var names = (Array.isArray(aud) ? aud : []).filter(function(p) { return pids.indexOf(p.id) >= 0; }).map(function(p) { return p.name; });
    return names.length ? names.join(', ') : 'nobody connected';
}
// What the box's form gives, cleaned
function sceneForm(f) {
    var o = f && typeof f === 'object' ? f : {};
    return { title: String(typeof o.title === 'string' ? o.title : '').trim().slice(0, SCENE_TITLE), caption: String(typeof o.caption === 'string' ? o.caption : '').slice(0, SCENE_CAP),
        hold: o.hold === true, keep: o.keep !== false };
}
// [scenecheck:core-end]

var ui = function(id) { return document.getElementById(id); };
var log = function(step, facts) { if (typeof window.wpStepLog === 'function') window.wpStepLog('scene v1', step, facts); };
var _box = { src: '', hid: '', picked: [] };   // what the box was opened for
var _now = null;                               // the scene up: { camp, hid, title, pids, hold, keep }

function hosting() { return !!(net && net.active && net.role === 'host'); }
function mine() { return !(net && ((net.active && net.role === 'client') || net.foreign)); }
// The scene up, while this machine hosts the campaign it was shown in; else none, and none is kept
function now() {
    var camp = getActiveCampaign();
    if (_now && (!hosting() || !camp || camp.id !== _now.camp)) _now = null;
    return _now;
}
function pillsSync() { if (window.wpPills && typeof window.wpPills.sync === 'function') window.wpPills.sync(); }

function drawChips() {
    var box = ui('sceneWhoSeg'); if (!box) return;
    var aud = sceneAudience(net && net.roster);
    _box.picked = _box.picked.filter(function(id) { return aud.some(function(p) { return p.id === id; }); });
    while (box.firstChild) box.removeChild(box.firstChild);
    var chip = function(label, id, on) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'gen-chip' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.dataset.who = id; b.textContent = label; box.appendChild(b);
    };
    chip('Everyone', '*', !_box.picked.length);
    aud.forEach(function(p) { chip(p.name, p.id, _box.picked.indexOf(p.id) >= 0); });
}
function drawNow() {
    var n = now(), part = ui('sceneNow'); if (!part) return;
    part.hidden = !n;
    if (!n) return;
    ui('sceneNowTitle').textContent = n.title || 'Scene';
    ui('sceneNowWho').textContent = 'Showing to ' + sceneWho(n.pids, sceneAudience(net && net.roster)) + (n.hold ? '. It stays up until you close it.' : '.');
}
function drawSays() {
    var says = ui('sceneSays'), go = ui('sceneGo'); if (!says || !go) return;
    var aud = sceneAudience(net && net.roster), why = !hosting() ? 'Host a table to show a scene. Players see it only while they are at your table.' : !aud.length ? 'Nobody is connected yet.' : '';
    says.textContent = why || (now() ? 'Showing this replaces the scene that is up.' : '');
    go.disabled = !!why;
}
// Opens the box. src: a picture of the campaign (no picture: the box shows only the scene that is up). o: { title, caption, hid }
function open(src, o) {
    if (!mine()) return;
    var m = ui('sceneModal'); if (!m) return;
    var p = picRef(src), opt = o && typeof o === 'object' ? o : {};
    _box.src = p ? src : ''; _box.hid = typeof opt.hid === 'string' ? opt.hid : '';
    var form = ui('sceneForm'); if (form) form.hidden = !p;
    var head = ui('sceneHead'), hs = head && head.querySelector('span'); if (hs) hs.textContent = p ? 'Show a scene' : 'The scene that is up';
    if (p) {
        var img = ui('scenePic'); if (img) img.src = /^(data:|blob:)/.test(p) ? p : encodeURI(p);
        var nm = typeof window.wpHandoutName === 'function' ? window.wpHandoutName(src) : '';
        ui('sceneFile').textContent = nm;
        ui('sceneTitleIn').value = String(typeof opt.title === 'string' && opt.title ? opt.title : nm).slice(0, SCENE_TITLE);
        ui('sceneCapIn').value = String(typeof opt.caption === 'string' ? opt.caption : '').slice(0, SCENE_CAP);
        ui('sceneKeep').checked = true; ui('sceneHold').checked = false;
        drawChips(); drawSays();
    }
    drawNow();
    m.style.display = 'flex';
    log('open', { pic: !!p, up: !!now() });
    setTimeout(function() { var t = p ? ui('sceneTitleIn') : ui('sceneEnd'); if (t && !t.hidden) { try { t.focus(); if (p) t.select(); } catch (e) {} } }, 0);
}
function close() { var m = ui('sceneModal'); if (m) m.style.display = 'none'; }
function show() {
    if (!hosting() || !_box.src) { drawSays(); return; }
    var f = sceneForm({ title: ui('sceneTitleIn').value, caption: ui('sceneCapIn').value, hold: ui('sceneHold').checked, keep: ui('sceneKeep').checked });
    var aud = sceneAudience(net.roster), pids = scenePids(_box.picked, aud);
    if (!aud.length) { drawSays(); return; }
    var hid = typeof window.wpHandoutFor === 'function' ? window.wpHandoutFor(_box.src, f.title, f.caption, _box.hid) : '';
    if (!hid) { toast('That picture cannot be shown.'); log('fail', { at: 'handout' }); return; }
    var old = now(); if (old) net.sceneClose(old.hid, old.pids);   // a new scene takes the place of the one up, on every screen that had it
    net.revealHandout(hid, pids, { scene: true, hold: f.hold, keep: f.keep });
    var camp = getActiveCampaign();
    _now = { camp: camp ? camp.id : '', hid: hid, title: f.title || (typeof window.wpHandoutName === 'function' ? window.wpHandoutName(_box.src) : ''), pids: pids, hold: f.hold, keep: f.keep };
    log('show', { to: pids ? pids.length : aud.length, hold: f.hold, kept: f.keep });
    close(); pillsSync();
}
function again() { var n = now(); if (!n) return; net.revealHandout(n.hid, n.pids, { scene: true, hold: n.hold, keep: n.keep }); log('again', {}); close(); }
function end() { var n = now(); if (!n) return; var told = net.sceneClose(n.hid, n.pids); _now = null; toast('Closed "' + (n.title || 'the scene') + '" for ' + (told === 1 ? '1 player.' : told + ' players.')); close(); pillsSync(); }

function wire() {
    var m = ui('sceneModal'); if (!m) return;
    m.addEventListener('keydown', function(e) { if (e.key !== 'Escape') e.stopPropagation(); });   // the page's own keys never act on what is typed here
    m.addEventListener('paste', function(e) { e.stopPropagation(); });                           // nor its paste, which lays a copied piece on the map
    ui('sceneWhoSeg').addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-who]') : null; if (!b) return;
        var id = b.dataset.who;
        if (id === '*') _box.picked = [];
        else { var i = _box.picked.indexOf(id); if (i >= 0) _box.picked.splice(i, 1); else _box.picked.push(id); }
        if (_box.picked.length && _box.picked.length >= sceneAudience(net.roster).length) _box.picked = [];   // every player ticked is everyone
        drawChips();
    });
    ui('sceneGo').addEventListener('click', show);
    ui('sceneCancel').addEventListener('click', close);
    ui('sceneCloseBtn').addEventListener('click', close);
    ui('sceneAgain').addEventListener('click', again);
    ui('sceneEnd').addEventListener('click', end);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpScene = { open: open, now: function() { var n = now(); return n ? { title: n.title, who: sceneWho(n.pids, sceneAudience(net && net.roster)), hold: n.hold } : null; } };
