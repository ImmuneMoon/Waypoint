/* Drawings to show (1.6.2). The owner, 2026-10-31: "if a gm is using them for drawing on a map to create the environment, fog should work normally, but
   if they need to use it to visually demonstrate something, fog shouldnt cover it. and just turning fog off isnt a good solution. same for if a player
   want to draw something that goes on the map (gm approval only) or also visually demonstrate something"; and by prompt: a pick on the pen "AND a tick on
   each drawing to change it later", "To show, map by ask (Recommended)" for a player, and of how long one stays "there can be options for each of these
   needs".

   A drawing to show stands over the fog on every screen of its map, and the ground under it stays hidden. fogcore holds the rule (showOk, showOn,
   cleanShowFor, keepShow, showToMap), fog.js draws it, net.js carries it and judges a player's ask, and this module is the rest: the pen's choices, kept
   for this computer; how long a drawing stays; Clear drawings to show; a player's ask and the bell's answer. A player's pen draws To show alone: the
   host stamps it so whatever their copy says (net.js strokeShow), and a drawing goes on the map by the GM's word alone, as the GM's piece from then on.

   How long: Until erased needs nothing. Fades on its own and Until the fight or scene ends are watched by the machine that owns the campaign, which takes
   a drawing off the map, outside the GM's undo, and tells the table. A fading drawing's time is each screen's own, from when that screen first saw it,
   since nothing of it is stored or sent; the owner's clock decides when it goes. Until the fight or scene ends: it goes when the last fight on its map
   ends, when the GM closes a scene for everyone with no fight on the map on screen, or once nobody is on its map any more (the GM's screen is elsewhere, no
   player stands there and no fight runs there). Only the maps that hold such a drawing are looked at, each tick. */
import { state } from './state.js';
import { getActiveCampaign, getActiveMap } from './models.js';
import { save, toast } from './io.js';

// [drawshowcheck:core-start]
var FADE_MS = 60000, FADE_TAIL_MS = 6000, FADE_LEAST = 0.15, ASK_MOST = 60, REACH = 8, SEEN_KEEP_MS = 600000, TICK_MS = 500;
var STAY_WORDS = Object.freeze(['erased', 'fade', 'scene']);
var LINE_MAP = 'Part of the map. Fog covers it as it covers the ground.', LINE_SHOW = 'Everyone on this map sees it over the fog. The ground under it stays hidden.';
function ownKey(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function stayOf(v) { return STAY_WORDS.indexOf(v) >= 0 ? v : 'erased'; }
function segNear(px, py, ax, ay, bx, by, r) {
    var dx = bx - ax, dy = by - ay, q = dx * dx + dy * dy, t = q > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / q)) : 0, ex = ax + t * dx - px, ey = ay + t * dy - py;
    return ex * ex + ey * ey <= r * r;
}
// Is a board point within r of a pen line, drawn stretched to its box as the board draws it (a player's drawing is never turned)
function lineNear(w, x, y, r) {
    if (!w || !Array.isArray(w.pts) || !w.pts.length) return false;
    var sx = (Number(w.w) || 0) / (Number(w.baseW) || Number(w.w) || 1), sy = (Number(w.h) || 0) / (Number(w.baseH) || Number(w.h) || 1), ox = Number(w.x) || 0, oy = Number(w.y) || 0;
    if (w.pts.length === 1) return segNear(x, y, ox + w.pts[0][0] * sx, oy + w.pts[0][1] * sy, ox + w.pts[0][0] * sx, oy + w.pts[0][1] * sy, r);
    for (var i = 0; i + 1 < w.pts.length; i++) if (segNear(x, y, ox + w.pts[i][0] * sx, oy + w.pts[i][1] * sy, ox + w.pts[i + 1][0] * sx, oy + w.pts[i + 1][1] * sy, r)) return true;
    return false;
}
function askWords(name, n, title) { return name + ' asks to put ' + (n === 1 ? 'a drawing' : n + ' drawings') + ' on the map ' + title + '.'; }

// D: { camp(), map(), FC(), client(), foreign(), hostKnows(), owns(), myId(), preset(), get(k), set(k, v), now(), every(fn, ms), el(id), fadeEls(), fightOn(mapId), playerOn(mapId),
//      save(now), render(), write(camp, mapId), dropped(mapId, ids), unselect(ids), toast(words), wait(key, words, kind, arg), done(key), ask(mapId, ids), tell(pid, words), log(step, facts) }
function make(D) {
    var R = { pick: 'map', stay: 'erased', maps: Object.create(null), camp: null, seen: Object.create(null), asks: Object.create(null) };
    function load() {
        try { R.pick = D.get('wp_penShow') === 'show' ? 'show' : 'map'; R.stay = stayOf(D.get('wp_penStay')); } catch (e) { R.pick = 'map'; R.stay = 'erased'; }
    }
    function keep() { try { D.set('wp_penShow', R.pick); D.set('wp_penStay', R.stay); } catch (e) {} }
    // Would the pen's next stroke be a drawing to show. A player's always is, at a host that knows the mark; a line of the Build tool never is
    function penOn() {
        if (D.preset() || D.foreign()) return false;
        if (D.client()) return D.hostKnows() === true;
        return R.pick === 'show';
    }
    function seenAt(id) { if (!R.seen[id]) R.seen[id] = D.now(); return R.seen[id]; }
    function touch(mapId) { if (mapId === undefined) { var on = D.map(); mapId = on ? on.id : ''; } if (typeof mapId === 'string' && mapId) R.maps[mapId] = 1; }   // no map named: the one on screen
    function stamp(item, map) {
        var FC = D.FC(); if (!penOn() || !FC || !FC.showOk(item)) return false;
        item.toShow = true; if (R.stay !== 'erased') item.showFor = R.stay;
        seenAt(item.id); if (map) touch(map.id);
        return true;
    }
    // How far a drawing that fades on its own has gone on this screen: 1 until its last few seconds, then down to a faint line until it is taken away
    function fadeOf(w) {
        if (!w || w.showFor !== 'fade' || typeof w.id !== 'string') return 1;
        var left = FADE_MS - (D.now() - seenAt(w.id));
        return left >= FADE_TAIL_MS ? 1 : Math.max(FADE_LEAST, left / FADE_TAIL_MS);
    }
    function paintFades() {
        var map = D.map(), FC = D.FC(), els = D.fadeEls(); if (!map || !FC || !els.length || !Array.isArray(map.whiteboard)) return 0;
        var by = Object.create(null), n = 0;
        map.whiteboard.forEach(function(w) { if (w && w.showFor === 'fade') by[w.id] = w; });
        for (var i = 0; i < els.length; i++) { var w = by[els[i].dataset.id]; if (!w) continue; els[i].style.opacity = String((typeof FC.lineOpacity === 'function' ? FC.lineOpacity(w) : 1) * fadeOf(w)); n++; }
        return n;
    }
    function drop(camp, map, ids) {
        var set = Object.create(null); ids.forEach(function(id) { set[id] = 1; });
        map.whiteboard = map.whiteboard.filter(function(w) { return !(w && set[w.id]); });
        D.dropped(map.id, ids);
        D.unselect(ids);
        return ids.length;
    }
    // A scene holds on while a fight runs on the map, the GM's screen is on it or a player stands on it
    function held(camp, mapId) { return camp.activeItemId === mapId || !!D.fightOn(mapId) || !!D.playerOn(mapId); }
    function walk(camp) {
        R.camp = camp; R.maps = Object.create(null);
        Object.keys(camp.items || {}).forEach(function(id) { var m = camp.items[id]; if (m && m.type === 'map' && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { return !!w && w.toShow === true; })) R.maps[id] = 1; });
    }
    function tick() {
        var camp = D.camp(), now = D.now(); if (!camp) return 0;
        paintFades();
        Object.keys(R.seen).forEach(function(id) { if (now - R.seen[id] > SEEN_KEEP_MS) delete R.seen[id]; });
        if (!D.owns()) return 0;
        if (R.camp !== camp) walk(camp);
        var FC = D.FC(), went = 0; if (!FC) return 0;
        Object.keys(R.maps).forEach(function(mapId) {
            var map = ownKey(camp.items, mapId) ? camp.items[mapId] : null, ids = [], over = null;
            if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard)) { delete R.maps[mapId]; return; }
            map.whiteboard.forEach(function(w) {
                if (!FC.showOn(w)) return;
                if (w.showFor === 'fade') { if (now - seenAt(w.id) >= FADE_MS) ids.push(w.id); }
                else if (w.showFor === 'scene') { if (over === null) over = !held(camp, mapId); if (over) ids.push(w.id); }
            });
            if (ids.length) { went += drop(camp, map, ids); D.write(camp, mapId); D.log('gone', { n: ids.length }); }
        });
        return went;
    }
    // A fight or a scene over: the drawings of that map that stay until then go, unless a fight still runs there. mapId: that map, or the map on screen
    function sceneOver(mapId) {
        var camp = D.camp(), FC = D.FC(); if (!camp || !FC || !D.owns()) return 0;
        var id = typeof mapId === 'string' && mapId ? mapId : camp.activeItemId, map = ownKey(camp.items, id) ? camp.items[id] : null;
        if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard) || D.fightOn(id)) return 0;
        var ids = map.whiteboard.filter(function(w) { return FC.showOn(w) && w.showFor === 'scene'; }).map(function(w) { return w.id; });
        if (!ids.length) return 0;
        var n = drop(camp, map, ids); D.write(camp, id); D.log('scene-over', { n: n });
        return n;
    }
    // Clear drawings to show, on the map on screen. A player clears their own, the GM every one of them. The GM's press is a step of their undo, as a delete is
    function clear() {
        var camp = D.camp(), map = D.map(); if (!camp || !map || !Array.isArray(map.whiteboard)) return 0;
        var mine = D.client(), me = D.myId();
        if (!mine && !D.owns()) return 0;
        var ids = map.whiteboard.filter(function(w) { return !!w && w.toShow === true && (!mine || (w.ownerId === me && w.byPlayer === true && !w.locked)); }).map(function(w) { return w.id; });
        if (!ids.length) { D.toast('No drawings to show on this map.'); return 0; }
        if (mine) { var set = Object.create(null); ids.forEach(function(id) { set[id] = 1; }); map.whiteboard = map.whiteboard.filter(function(w) { return !(w && set[w.id]); }); D.unselect(ids); D.save(true); }
        else { drop(camp, map, ids); D.save(); }
        D.render(); D.log('clear', { n: ids.length, by: mine ? 'player' : 'gm' });
        D.toast(ids.length === 1 ? 'Drawing to show cleared.' : ids.length + ' drawings to show cleared.');
        return ids.length;
    }
    // The GM's tick on the selected drawings. Unticked, a drawing is a map drawing and the GM's
    function setShow(items, on, map) {
        var FC = D.FC(), n = 0; if (!FC) return 0;
        (Array.isArray(items) ? items : []).forEach(function(w) {
            if (!FC.showOk(w)) return;
            if (on) { w.toShow = true; if (R.stay !== 'erased') { if (!w.showFor) w.showFor = R.stay; } } else FC.showToMap(w);
            n++;
        });
        if (on && map) touch(map.id);
        D.log('tick', { n: n, on: on === true });
        return n;
    }
    // A drawing of a player's own, to show, on their screen
    function mine(w, me, FC) { return !!w && w.ownerId === me && w.byPlayer === true && !w.locked && FC.showOn(w); }
    function mineAt(x, y) {
        var map = D.map(), FC = D.FC(), me = D.myId(); if (!D.client() || D.hostKnows() !== true || !map || !FC || !Array.isArray(map.whiteboard) || !isFinite(x) || !isFinite(y)) return null;
        for (var i = map.whiteboard.length - 1; i >= 0; i--) { var w = map.whiteboard[i]; if (mine(w, me, FC) && lineNear(w, x, y, Math.max(REACH, (Number(w.strokeWidth) || 3) / 2 + 4))) return w; }
        return null;
    }
    function ask(ids) {
        var map = D.map(), FC = D.FC(), me = D.myId(); if (!D.client() || D.hostKnows() !== true || !map || !FC || !Array.isArray(map.whiteboard)) return 0;
        var want = map.whiteboard.filter(function(w) { return mine(w, me, FC) && (!Array.isArray(ids) || ids.indexOf(w.id) >= 0); }).slice(0, ASK_MOST).map(function(w) { return w.id; });
        if (!want.length) { D.toast('You have no drawings to show on this map.'); return 0; }
        if (!D.ask(map.id, want)) return 0;
        D.toast('Your GM has been asked.'); D.log('ask', { n: want.length });
        return want.length;
    }
    // The GM's side of an ask, which net.js has judged. One item a player and map: a newer ask joins the one that waits
    function asked(q) {
        var camp = D.camp(); if (!camp || !q || !ownKey(camp.items, q.mapId)) return false;
        var key = 'showask:' + q.pid + ':' + q.mapId, was = R.asks[key], ids = was ? was.ids.slice() : [];
        q.ids.forEach(function(id) { if (ids.indexOf(id) < 0 && ids.length < ASK_MOST) ids.push(id); });
        var mt = camp.items[q.mapId].meta, arg = R.asks[key] = { key: key, pid: q.pid, name: q.name, mapId: q.mapId, ids: ids }, words = askWords(q.name, ids.length, String((mt && mt.title) || 'with no name'));
        D.wait(key, words, 'showask', arg); D.toast(words); D.log('asked', { n: ids.length });
        return true;
    }
    function askLeft(arg) {
        var camp = D.camp(), FC = D.FC(), map = camp && arg && ownKey(camp.items, arg.mapId) ? camp.items[arg.mapId] : null; if (!map || !FC || !Array.isArray(map.whiteboard)) return [];
        return map.whiteboard.filter(function(w) { return !!w && arg.ids.indexOf(w.id) >= 0 && w.ownerId === arg.pid && w.byPlayer === true && FC.showOn(w); });
    }
    function askStill(arg) { return askLeft(arg).length > 0; }
    // The GM's answer. A yes makes each drawing that still stands a map drawing, outside the GM's undo as a change at the table is; either way its player is told
    function answer(arg, yes) {
        var camp = D.camp(), FC = D.FC(), left = askLeft(arg); if (!camp || !FC || !arg) return 0;
        delete R.asks[arg.key]; D.done(arg.key);
        if (!left.length) return 0;
        if (yes === true) { left.forEach(function(w) { FC.showToMap(w); }); D.write(camp, arg.mapId); }
        D.tell(arg.pid, yes === true ? 'Your GM put your drawing on the map. It is the GM\'s now.' : 'Your GM kept your drawing as one to show.');
        D.log('answered', { n: left.length, yes: yes === true });
        return left.length;
    }
    function pick(v) { R.pick = v === 'show' ? 'show' : 'map'; keep(); sync(); D.log('pick', { to: R.pick }); return R.pick; }
    function stayPick(v) { R.stay = stayOf(v); keep(); sync(); return R.stay; }
    // The pen's options as they stand. A player's are To show alone, and a player at a host that does not know the mark has none
    function sync() {
        var box = D.el('drawShowBox'); if (!box) return false;
        var client = D.client(), offer = !D.foreign() && (!client || D.hostKnows() === true), on = client || R.pick === 'show';
        box.hidden = !offer; if (!offer) return false;
        var mapB = D.el('drawOnMapBtn'), showB = D.el('drawToShowBtn'), line = D.el('drawShowLine'), part = D.el('drawShowPart'), rows = D.el('drawShowFor'), askB = D.el('drawShowAsk');
        if (mapB) mapB.classList.toggle('active', !on);
        if (showB) showB.classList.toggle('active', on);
        if (line) line.textContent = on ? LINE_SHOW : LINE_MAP;
        if (part) part.hidden = !on;
        if (askB) askB.hidden = !client;
        if (rows && rows.children) Array.prototype.forEach.call(rows.children, function(b) { b.classList.toggle('active', stayOf(b.dataset.showfor) === R.stay); });
        return true;
    }
    load();
    return { penOn: penOn, stamp: stamp, fadeOf: fadeOf, touch: touch, tick: tick, sceneOver: sceneOver, clear: clear, setShow: setShow, mineAt: mineAt, ask: ask, asked: asked, askStill: askStill, answer: answer, pick: pick, stayPick: stayPick, sync: sync, state: R };
}
// [drawshowcheck:core-end]

// [drawshowcheck:page-start]
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var dsNet = function() { return window.wpNet || null; };
    var dsApi = make({
        camp: function() { return getActiveCampaign(); }, map: function() { return getActiveMap(); }, FC: function() { return window.wpFogCore || null; },
        client: function() { var n = dsNet(); return !!(n && n.active && n.role === 'client'); },
        foreign: function() { var n = dsNet(); return !!(n && n.foreign && !(n.active && n.role === 'client')); },
        hostKnows: function() { var n = dsNet(); return !!(n && typeof n.showKnown === 'function' && n.showKnown() === true); },
        owns: function() { return typeof window.wpCanPersistLocal === 'function' && window.wpCanPersistLocal() === true && !window.wpStream && !window.wpPopout; },
        myId: function() { var n = dsNet(); return n ? n.myId : null; }, preset: function() { return !!window.wpPenPreset; },
        get: function(k) { return localStorage.getItem(k); }, set: function(k, v) { localStorage.setItem(k, v); },
        now: function() { return Date.now(); }, every: function(fn, ms) { return setInterval(fn, ms); }, el: function(id) { return document.getElementById(id); },
        fadeEls: function() { return document.querySelectorAll('#whiteboardWrap .wb-item.wb-fade'); },
        fightOn: function(mapId) { var n = dsNet(); return n && typeof n.combatFor === 'function' ? n.combatFor(mapId) : null; },
        playerOn: function(mapId) { var n = dsNet(); return !!(n && n.active && n.roster && Object.keys(n.roster).some(function(k) { return !!n.roster[k] && n.roster[k].location === mapId; })); },
        save: function(now) { save(now === true); }, render: function() { if (window.appRender) window.appRender(); },
        write: function(camp, mapId) {   // what the table did not press: no step of the GM's undo, and the table told at once
            var n = dsNet(); if (n) n.applyingRemote = true;
            try { save(true); } finally { if (n) n.applyingRemote = false; }
            if (n && n.active && n.role === 'host' && typeof n.sendItem === 'function') n.sendItem(camp.id, mapId);
            if (camp.activeItemId === mapId && window.appRender) window.appRender();
        },
        dropped: function(mapId, ids) { var n = dsNet(); if (n && typeof n.showDropped === 'function') n.showDropped(mapId, ids); },
        unselect: function(ids) { if (Array.isArray(state.selWbIds)) state.selWbIds = state.selWbIds.filter(function(id) { return ids.indexOf(id) < 0; }); if (ids.indexOf(state.selWbId) >= 0) state.selWbId = null; },
        toast: function(w) { toast(w); },
        wait: function(key, words, kind, arg) { if (window.wpNotices) window.wpNotices.wait(key, words, kind, arg); }, done: function(key) { if (window.wpNotices) window.wpNotices.done(key); },
        ask: function(mapId, ids) { var n = dsNet(); return !!(n && typeof n.showAsk === 'function' && n.showAsk(mapId, ids)); },
        tell: function(pid, words) { var n = dsNet(); if (n && typeof n.showTell === 'function') n.showTell(pid, words); },
        log: function(step, facts) { if (window.wpStepLog) window.wpStepLog('drawshow v1', step, facts); },
    });
    window.wpDrawShow = dsApi;
    var nkS2 = window.wpNoticeKinds = window.wpNoticeKinds || {};
    nkS2.showask = { label: 'Put on the map', altLabel: 'No', only: true, stay: true, tip: 'It becomes a drawing of the map, and yours, under the fog as the ground is', altTip: 'It stays a drawing to show', still: dsApi.askStill, run: function(a) { dsApi.answer(a, true); }, alt: function(a) { dsApi.answer(a, false); } };
    var dsWire = function(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener('click', function(e) { e.stopPropagation(); fn(this); }); };
    dsWire('drawOnMapBtn', function() { dsApi.pick('map'); }); dsWire('drawToShowBtn', function() { dsApi.pick('show'); });
    dsWire('drawShowClear', function() { dsApi.clear(); }); dsWire('drawShowAsk', function() { dsApi.ask(null); });
    var dsFor = document.getElementById('drawShowFor');
    if (dsFor) dsFor.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('[data-showfor]') : null; if (!b) return; e.stopPropagation(); dsApi.stayPick(b.dataset.showfor); });
    var dsSaid = false;
    setInterval(function() { try { dsApi.tick(); } catch (e) { if (!dsSaid && window.wpStepLog) { dsSaid = true; window.wpStepLog('drawshow v1', 'tick-failed', {}); } } }, TICK_MS);
}
// [drawshowcheck:page-end]
export { make };
