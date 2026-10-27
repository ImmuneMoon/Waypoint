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
// Who closed it, in words: the names of the players who closed the scene themselves, each once, at most three and then how many more
function sceneShut(names) {
    var a = (Array.isArray(names) ? names : []).filter(function(n, i, all) { return typeof n === 'string' && n && all.indexOf(n) === i; });
    if (!a.length) return '';
    var said = a.slice(0, 3).join(', ') + (a.length > 3 ? ' and ' + (a.length - 3) + ' more' : '');
    return said + (a.length === 1 ? ' closed it.' : ' have closed it.');
}
// What the stream window is told: the scene up, only while it shows to everyone (the table's own screen never shows what some players were
// shown alone), as the picture's own path, its title and its caption; else none
function sceneStage(n) {
    if (!n || typeof n !== 'object' || n.pids || typeof n.src !== 'string' || !n.src) return null;
    return { src: n.src, title: String(n.title || '').slice(0, SCENE_TITLE), caption: String(n.caption || '').slice(0, SCENE_CAP) };
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
    if (_now && (!hosting() || !camp || camp.id !== _now.camp)) { _now = null; stagePost(); }
    return _now;
}
// The stream window (a window of this computer's own) is told the scene up as it changes, and answers its own question when it opens
var _chan = null; try { if (!window.wpStream) _chan = new BroadcastChannel('waypoint'); } catch (e) { _chan = null; }
var _staged = '';
function stagePost(force) {
    if (!_chan || window.wpStream) return;   // the stream window loads this module too: it only listens
    var st = sceneStage(_now), sig = JSON.stringify(st);
    if (!force && sig === _staged) return;
    _staged = sig; try { _chan.postMessage({ type: 'scene-stage', scene: st }); } catch (e) {}
}
if (_chan) _chan.addEventListener('message', function(e) { if (e.data && e.data.type === 'scene-stage-query') { now(); stagePost(true); } });
// A player closed the scene themselves (net.js's host branch tells this): their name is kept for the pill and the box
function seen(pid, name, hid) {
    var n = now(); if (!n || hid !== n.hid || typeof name !== 'string') return false;
    if (n.shut.indexOf(name) < 0) n.shut.push(name.slice(0, 60));
    log('closedby', { n: n.shut.length }); drawNow(); pillsSync(); return true;
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
    ui('sceneNowWho').textContent = 'Showing to ' + sceneWho(n.pids, sceneAudience(net && net.roster)) + (n.hold ? '. It stays up until you close it.' : '.') + (sceneShut(n.shut) ? ' ' + sceneShut(n.shut) : '');
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
    _now = { camp: camp ? camp.id : '', hid: hid, src: _box.src, caption: f.caption, title: f.title || (typeof window.wpHandoutName === 'function' ? window.wpHandoutName(_box.src) : ''), pids: pids, hold: f.hold, keep: f.keep, shut: [] };
    stagePost();
    log('show', { to: pids ? pids.length : aud.length, hold: f.hold, kept: f.keep });
    close(); pillsSync();
}
function again() { var n = now(); if (!n) return; n.shut = []; net.revealHandout(n.hid, n.pids, { scene: true, hold: n.hold, keep: n.keep }); log('again', {}); close(); pillsSync(); }
function end() { var n = now(); if (!n) return; var told = net.sceneClose(n.hid, n.pids); _now = null; stagePost(); toast('Closed "' + (n.title || 'the scene') + '" for ' + (told === 1 ? '1 player.' : told + ' players.')); close(); pillsSync(); }
// [scenecheck:readpic-start]
// A picture where a planner or a page is read on the GM's own screen (the planner's own view, the page panel over the map): a right-click
// offers Show as a scene... in a one-row menu. Only a picture of the campaign's own, by the path it was drawn from; never in a window of its
// own or the stream window, never on a player's app
var READ_PLACES = '#plannerPreview, #docPanelBody';
function readPicSrc(img) {
    if (!img || img.tagName !== 'IMG' || !img.closest || !img.closest(READ_PLACES)) return '';
    var raw = img.getAttribute('src') || '', p = ''; try { p = decodeURI(raw); } catch (e) { return ''; }
    return /^\/saves\/images\//.test(p) && picRef(p) === p ? p : '';
}
function readMenuHide() { var mm = ui('sceneMenu'); if (mm && mm.style.display !== 'none') { mm.style.display = 'none'; mm.dataset.src = ''; } }
function readMenuAt(src, x, y) {
    var mm = ui('sceneMenu'); if (!mm) return false;
    mm.dataset.src = src; mm.style.display = 'flex';
    var w = mm.offsetWidth || 200, h = mm.offsetHeight || 40;
    mm.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px'; mm.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
    return true;
}
// [scenecheck:readpic-end]

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
    if (!window.wpStream && !document.body.classList.contains('popout-mode')) {
        document.addEventListener('contextmenu', function(e) {
            if (!mine()) return;
            var src = readPicSrc(e.target); if (!src) return;
            e.preventDefault(); e.stopPropagation(); readMenuAt(src, e.clientX, e.clientY);
        }, true);
        document.addEventListener('pointerdown', function(e) { if (!(e.target && e.target.closest && e.target.closest('#sceneMenu'))) readMenuHide(); }, true);
        window.addEventListener('blur', readMenuHide); document.addEventListener('scroll', readMenuHide, true);
        var rm = ui('sceneMenu');
        if (rm) rm.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return; var src = rm.dataset.src; readMenuHide(); if (src) open(src); });
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpScene = { open: open, seen: seen, menuHide: readMenuHide, now: function() { var n = now(); return n ? { title: n.title, who: sceneWho(n.pids, sceneAudience(net && net.roster)), hold: n.hold, shut: sceneShut(n.shut) } : null; } };
