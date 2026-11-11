/* Stream window — Waypoint opened with ?stream=1.
   A second window that shows only the play map, from the party's standpoint (R2 #14, the owner's ruling of 2026-10-01: "a combined view of
   the players, each of them being represented from a 3rd party perspective"): on a fogged map the fog is what the players' own tokens see
   together and the creatures none of them sees are left out (net.js sanitizeAppState with no recipient, fog.js PARTY), never one player's own
   view and never the GM's whole map; GM notes and dossiers stripped, hidden items left out, no toolbars. It reads the saves folder
   through the same local server every second and redraws, so it mirrors the table as the
   GM plays. Meant to be screen-shared (Discord, OBS) to someone watching without the app.
   "Showing" in the corner follows the GM's current map or pins one until changed. */
import { state } from './state.js';
import { net } from './net.js';
import { characterList, locateCharacter } from './models.js';
import { esc } from './safecore.js';

// [netcheck:streamweb-start]
// 1.5.5: the stream window is the GM's. A website's plan that joins tables alone opens none (webmode.js), and the page is the join page: a website's
// page knows it is one from the start. Where only the site's answer can say it (the dev server's test switch), a stream window already open asks
// for nothing once it has
function streamWebJoin() { var W = typeof window !== 'undefined' ? window.wpWebMode : null; return !!(W && typeof W.joinOnly === 'function' && (W.joinOnly() === true || (typeof W.has === 'function' && W.web() === true && W.has('host') === false))); }   // 1.6.2: nor a GM's page whose plan does not host
// [netcheck:streamweb-end]
// [videocheck:streamidle-start]
// 1.6.2 (the owner, 2026-11-10: "the stream map could have a feature where if the gm isnt interacting with it, it could pick a PC at random after a
// idle timeframe and follow them", "with a setting to turn that on an off", "and have it deliberately pick someone the GM chooses ahead of time
// additionally as an option"; by prompt, idle is "when not in the map in the GM screen, whether thats in a handbook, or planner, or datamap, etc", the
// wait is picked from a list, it moves on "unless set to one character", and the setting lives in the stream window's corner). The main window says
// which view the GM is on over BroadcastChannel ('gm-view': play, data, page or none; gmViewWire), and the stream window, with Focus on set to No one,
// follows a player's character once the GM has been off the play map for the wait: the one chosen, else in a fight the player's character whose
// turn it is, else one at random, moving on to another after the same wait. Back on the play map the stream shows what it showed, where it was.
// Another window's word is read as one of three names and anything else is the play map's, so with no word nothing is ever followed
var IDLE_SECS = [15, 30, 60, 120, 300];
function gmViewOf(v) { return v === 'data' || v === 'page' || v === 'play' ? v : ''; }
function idleCfg(mode, secs) { return { mode: mode === 'rand' ? 'rand' : typeof mode === 'string' && mode.slice(0, 2) === 'o:' && mode.length > 2 && mode.length <= 90 ? mode : '', secs: IDLE_SECS.indexOf(Number(secs)) >= 0 ? Number(secs) : 30 }; }
function idleStep(st, now, view, keys, cfg, rnd, turn) {
    st = st && typeof st === 'object' ? st : {};
    if (!cfg || !cfg.mode || !(view === 'data' || view === 'page') || !Array.isArray(keys)) return { since: 0, key: '', at: 0 };
    var since = st.since > 0 ? st.since : now, wait = cfg.secs * 1000;
    if (now - since < wait || !keys.length) return { since: since, key: '', at: 0 };
    var hold = function(k) { return { since: since, key: k, at: st.key === k && st.at > 0 ? st.at : now }; };
    if (cfg.mode !== 'rand' && keys.indexOf(cfg.mode) >= 0) return hold(cfg.mode);   // the one the GM chose, for as long as it is there
    if (typeof turn === 'string' && turn && keys.indexOf(turn) >= 0) return hold(turn);   // in a fight, the player's character whose turn it is
    if (st.key && keys.indexOf(st.key) >= 0 && now - st.at < wait) return { since: since, key: st.key, at: st.at };
    var pool = keys.length > 1 ? keys.filter(function(k) { return k !== st.key; }) : keys, i = Math.floor((typeof rnd === 'function' ? rnd() : 0) * pool.length); if (!(i >= 0 && i < pool.length)) i = 0;
    return { since: since, key: pool[i], at: now };
}
// The player's character whose turn it is, from the GM's own save: the fight played first, then the others, a token that carries a player's id and
// is not hidden. '' where no fight has one on turn
function idleTurnKey(raw) {
    var fs0 = raw && raw.fights && typeof raw.fights === 'object' ? raw.fights : null, fl = fs0 && fs0.list && typeof fs0.list === 'object' && !Array.isArray(fs0.list) ? fs0.list : null, items = raw && raw.items && typeof raw.items === 'object' ? raw.items : null;
    if (!fl || !items) return '';
    var ids = Object.keys(fl), at = typeof fs0.on === 'string' ? ids.indexOf(fs0.on) : -1; if (at > 0) { ids.splice(at, 1); ids.unshift(fs0.on); }
    for (var i = 0; i < ids.length && i < 50; i++) {
        var f = fl[ids[i]]; if (!f || typeof f !== 'object' || !Array.isArray(f.rows) || typeof f.mapId !== 'string') continue;
        var r = typeof f.turn === 'number' && Math.floor(f.turn) === f.turn && f.turn >= 0 ? f.rows[f.turn] : null, m = Object.prototype.hasOwnProperty.call(items, f.mapId) ? items[f.mapId] : null;
        var tok = r && typeof r.tokId === 'string' && m && Array.isArray(m.whiteboard) ? m.whiteboard.filter(function(w) { return !!w && w.id === r.tokId && w.isChar && !w.hidden; })[0] : null;
        if (tok && typeof tok.ownerId === 'string' && tok.ownerId) return 'o:' + tok.ownerId;
    }
    return '';
}
// The main window's half: it says its view when it changes, and when a stream window asks
function gmViewWire(w, Chan, every) {
    if (!w || typeof Chan !== 'function' || typeof every !== 'function') return null;
    var ch; try { ch = new Chan('waypoint'); } catch (e) { return null; }
    var last = null, now = function() { var F = w.wpFloats; return gmViewOf(F && typeof F.view === 'function' ? F.view() : ''); };
    var post = function(force) { var v = now(); if (!force && v === last) return v; last = v; try { ch.postMessage({ type: 'gm-view', view: v }); } catch (e) {} return v; };
    ch.addEventListener('message', function(e) { if (e && e.data && e.data.type === 'gm-view-query') post(true); });
    every(function() { post(false); }, 1000); post(false);
    return post;
}
// [videocheck:streamidle-end]
const on = new URLSearchParams(location.search).get('stream') === '1' && !streamWebJoin();
if (!on && !new URLSearchParams(location.search).get('popout') && typeof BroadcastChannel === 'function') gmViewWire(window, BroadcastChannel, setInterval);   // the main window alone: a window of its own has no view to say
if (on) {
    window.wpStream = true;
    document.body.classList.add('stream-mode', 'net-client');
    document.title = 'Waypoint \u2014 Stream';
    // Borrow the player-side rules: nothing editable, nothing saved, hidden things hidden.
    net.active = true; net.role = 'client'; net.foreign = true; net.stream = true; net.myId = 'stream';
    window.isPanMode = true;   // left-drag pans the view
    var focus = '', charFocus = '';
    // Where each player was last seen, from the GM's own save: the party view holds no player records (sanitizeAppState takes them out), so the
    // table of player id to map id is read before it and handed to net.whereIs. Nothing of it is drawn or sent.
    function lastSeen(raw) { var out = Object.create(null), ps = raw && raw.players; if (ps && typeof ps === 'object' && !Array.isArray(ps)) Object.keys(ps).forEach(function(pid) { var r = ps[pid]; if (r && typeof r === 'object' && typeof r.lastMap === 'string' && r.lastMap) out[pid] = r.lastMap; }); return out; }
    function whoOf(camp) { return function(pid) { return window.wpPlayerNow ? window.wpPlayerNow(camp, pid) : null; }; }
    // [videocheck:streamchar-start]
    // R2 #14: the "Focus on" menu names the players' characters alone (characterList owned-only: a token that carries a player's id), never an NPC
    // on a fogged map; a focus — kept from before or picked — is only ever one of theirs ('o:' and a name), anything else is no one
    var ownKey = function(k) { return typeof k === 'string' && k.slice(0, 2) === 'o:' && k.length > 2 ? k : ''; };
    function refreshCharSelect(camp) {
        if (!charSel) return;
        var list = characterList(camp, true, null, whoOf(camp));   // each player's chip is the token on the map they are on
        var sig = list.map(function(c) { return c.key + ':' + c.name + '@' + c.map; }).join('|') + '#' + charFocus;
        if (charSel.dataset.sig === sig) return;
        charSel.dataset.sig = sig;
        var html = '<option value="">No one</option>';
        list.forEach(function(c) { html += '<option value="' + esc(c.key) + '"' + (c.key === charFocus ? ' selected' : '') + '>' + (c.name + ', on ' + c.map).replace(/[<>&]/g, '') + '</option>'; });
        charSel.innerHTML = html;
        if (sel) { sel.disabled = !!charFocus; sel.title = charFocus ? 'The map follows the focused character; clear "Focus on" to pick a map' : 'Follow the GM\'s current map, or focus one map until you change it'; }
    }
    // [videocheck:streamchar-end]
    try { focus = localStorage.getItem('wp_streamFocus') || ''; charFocus = ownKey(localStorage.getItem('wp_streamChar')); } catch (e) {}
    var charSel = document.getElementById('streamChar');
    var FOCUS_ZOOM = 1.5;
    var lastCam = '';   // "mapId:x:y" the view was last centred on, so a still token is not re-centred every tick
    function setCharFocus(key) { charFocus = ownKey(key); lastCam = ''; try { localStorage.setItem('wp_streamChar', charFocus); } catch (e) {} tick(); }
    if (charSel) charSel.addEventListener('change', function() { setCharFocus(charSel.value); });
    window.wpStreamFocusChar = setCharFocus;   // the party strip's click lands here in the stream window
    // 1.6.2, the idle follow: its setting and wait are this computer's, set in this window's corner
    var idleMode = '', idleSecs = 30, idleSt = { since: 0, key: '', at: 0 }, gmView = '', idleBack = null, idleWas = '';
    try { var icf = idleCfg(localStorage.getItem('wp_streamIdle'), localStorage.getItem('wp_streamIdleSecs')); idleMode = icf.mode; idleSecs = icf.secs; } catch (e) {}
    var idleSel = document.getElementById('streamIdle'), idleSecSel = document.getElementById('streamIdleSecs'), idleNow = document.getElementById('streamIdleNow');
    function idleSet(mode, secs) { var c = idleCfg(mode, secs); idleMode = c.mode; idleSecs = c.secs; idleSt = { since: 0, key: '', at: 0 }; try { localStorage.setItem('wp_streamIdle', idleMode); localStorage.setItem('wp_streamIdleSecs', String(idleSecs)); } catch (e) {} if (idleSel) idleSel.dataset.sig = ''; tick(); }
    function refreshIdle(list, following) {
        if (!idleSel || !idleSecSel) return;
        var sig = list.map(function(c) { return c.key + ':' + c.name; }).join('|') + '#' + idleMode + '#' + idleSecs;
        if (idleSel.dataset.sig !== sig) {
            idleSel.dataset.sig = sig; idleSel.textContent = '';
            var opt = function(into, v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; into.appendChild(o); };
            opt(idleSel, '', 'Stay as it is'); opt(idleSel, 'rand', 'Follow someone at random');
            list.forEach(function(c) { opt(idleSel, c.key, 'Follow ' + c.name); });
            if (idleMode && idleMode !== 'rand' && !list.some(function(c) { return c.key === idleMode; })) opt(idleSel, idleMode, 'Follow the one you chose, who is not on a map now');
            idleSel.value = idleMode;
            idleSecSel.textContent = ''; [[15, 'after 15 seconds'], [30, 'after 30 seconds'], [60, 'after 1 minute'], [120, 'after 2 minutes'], [300, 'after 5 minutes']].forEach(function(p) { opt(idleSecSel, String(p[0]), p[1]); });
            idleSecSel.value = String(idleSecs); idleSecSel.disabled = !idleMode;
        }
        if (idleNow) { var who = following ? list.filter(function(c) { return c.key === following; })[0] : null, tx = who ? 'Following ' + who.name : ''; if (idleNow.textContent !== tx) idleNow.textContent = tx; idleNow.hidden = !tx; }
    }
    if (idleSel) idleSel.addEventListener('change', function() { idleSet(idleSel.value, idleSecs); });
    if (idleSecSel) idleSecSel.addEventListener('change', function() { idleSet(idleMode, idleSecSel.value); });
    var bar = document.getElementById('streamBar'), sel = document.getElementById('streamFocus'), hideBtn = document.getElementById('streamHideBtn');
    if (bar) bar.style.display = 'flex';
    var lastKey = '';
    // [videocheck:streamhold-start]
    // Backlog 34, the Hold switch (the owner, by prompt: "Both, picked each time"): the main window's Settings says Live, Freeze or Cover over
    // BroadcastChannel ('stream-hold'). Freeze keeps the picture as it stands: no read of the table, no effect, scene or video comes through, and
    // letting go asks for all of it again. Cover lays a card over the window, the campaign's name and Back soon, as text. Another window's
    // word: only the two names count, anything else is Live
    var held = '', campName = '';
    function holdOf(m) { return m === 'freeze' || m === 'cover' ? m : ''; }
    function holdApply(m, doc, again) {
        var was = held; held = holdOf(m);
        var cov = doc.getElementById('streamCover'), nm = doc.getElementById('streamCoverName');
        if (nm) nm.textContent = campName || 'Waypoint';
        if (cov) cov.style.display = held === 'cover' ? 'flex' : 'none';
        if (was === 'freeze' && held !== 'freeze' && typeof again === 'function') again();
        return held;
    }
    window.wpStreamHeld = function() { return held === 'freeze'; };
    // [videocheck:streamhold-end]

    function refreshSelect(camp) {
        if (!sel) return;
        var maps = Object.values(camp.items).filter(function(i) { return i.type === 'map'; });
        var sig = maps.map(function(m) { return m.id + ':' + (m.meta && m.meta.title || ''); }).join('|') + '#' + focus;
        if (sel.dataset.sig === sig) return;
        sel.dataset.sig = sig;
        var html = '<option value="">The map the GM is on</option>';
        maps.sort(function(a, b) { return String(a.meta && a.meta.title || '').localeCompare(String(b.meta && b.meta.title || '')); });
        maps.forEach(function(m) { html += '<option value="' + esc(m.id) + '"' + (m.id === focus ? ' selected' : '') + '>' + String(m.meta && m.meta.title || m.id).replace(/[<>&]/g, '') + '</option>'; });
        sel.innerHTML = html;
    }
    if (sel) sel.addEventListener('change', function() { focus = sel.value; charFocus = ''; lastCam = ''; try { localStorage.setItem('wp_streamFocus', focus); localStorage.setItem('wp_streamChar', ''); } catch (e) {} tick(); });
    if (hideBtn && bar) hideBtn.addEventListener('click', function() { bar.classList.add('hidden'); });
    document.addEventListener('mousemove', function(e) { if (bar && bar.classList.contains('hidden') && e.clientX < 60 && e.clientY < 60) bar.classList.remove('hidden'); });

    async function tick() {
        if (streamWebJoin()) return;   // 1.5.5: nothing is asked of a website that joins tables alone
        if (typeof held !== 'undefined' && held === 'freeze') return;   // backlog 34: a frozen picture reads nothing of the table
        var data;
        try { data = await (await fetch('/api/data', { cache: 'no-store' })).json(); } catch (e) { return; }
        if (!data || !data.campaigns || !Object.keys(data.campaigns).length) return;
        var seenBy = Object.create(null); Object.keys(data.campaigns).forEach(function(id) { seenBy[id] = lastSeen(data.campaigns[id]); });
        var rawTk = data.activeCampaignId && data.campaigns[data.activeCampaignId] ? data.campaigns[data.activeCampaignId] : null;   // backlog 29: the trackers, read before the copy for players drops them
        var clean = net.sanitizeAppState(data);
        var campId = clean.activeCampaignId && clean.campaigns[clean.activeCampaignId] ? clean.activeCampaignId : Object.keys(clean.campaigns)[0];
        var camp = clean.campaigns[campId];
        campName = String(camp && camp.name || '').slice(0, 80);   // backlog 34: the name a cover card shows, as text
        var gmItem = camp.items[camp.activeItemId];
        net.streamWhere = seenBy[campId] || Object.create(null);
        var pcs = characterList(camp, true, null, whoOf(camp));
        idleSt = charFocus ? { since: 0, key: '', at: 0 } : idleStep(idleSt, Date.now(), gmView, pcs.map(function(c) { return c.key; }), idleCfg(idleMode, idleSecs), Math.random, idleTurnKey(rawTk && rawTk.id === campId ? rawTk : null));   // 1.6.2: with Focus on set to No one, whom the idle follow is on
        var followKey = charFocus || ownKey(idleSt.key), idleEnded = !!idleWas && !idleSt.key;
        if (!idleWas && idleSt.key) { var bm = lastKey.split('/')[1], bi = bm && state.appState.campaigns && state.appState.campaigns[campId] && state.appState.campaigns[campId].items ? state.appState.campaigns[campId].items[bm] : null; idleBack = bi && bi.meta ? { map: bm, x: bi.meta.lastWbX, y: bi.meta.lastWbY, z: bi.meta.lastWbZoom } : null; }   // where this window stood before it began to follow
        idleWas = idleSt.key;
        var loc = followKey && followKey.charAt(0) === 'o' ? (window.wpCharNow ? window.wpCharNow(camp, followKey).loc : locateCharacter(camp, followKey)) : null;   // R2 #14: a player's character alone is followed, on the map that player is on
        var want = loc ? loc.map.id
                 : (focus && camp.items[focus] && camp.items[focus].type === 'map') ? focus
                 : (gmItem && gmItem.type === 'map') ? camp.activeItemId
                 : (lastKey.split('/')[1] && camp.items[lastKey.split('/')[1]]) ? lastKey.split('/')[1]
                 : (Object.values(camp.items).find(function(i) { return i.type === 'map'; }) || {}).id;
        if (!want) return;
        // Keep this window's own camera on the map it is showing
        var prevCamp = state.appState.campaigns && state.appState.campaigns[campId];
        var prev = prevCamp && prevCamp.items && prevCamp.items[want];
        if (prev && prev.meta && camp.items[want].meta) {
            ['lastWbX', 'lastWbY', 'lastWbZoom'].forEach(function(k) { if (prev.meta[k] != null) camp.items[want].meta[k] = prev.meta[k]; });
        }
        var camBack = false;   // 1.6.2: the idle follow is over: this window's camera goes back where it stood
        if (idleEnded) { lastCam = ''; if (idleBack && idleBack.map === want && camp.items[want].meta && idleBack.x != null && idleBack.y != null) { camp.items[want].meta.lastWbX = idleBack.x; camp.items[want].meta.lastWbY = idleBack.y; if (idleBack.z != null) camp.items[want].meta.lastWbZoom = idleBack.z; camBack = true; } idleBack = null; }
        var key = campId + '/' + want;
        net.applyingRemote = true;
        clean.activeCampaignId = campId;
        camp.activeItemId = want;
        state.appState = clean;
        state.viewMode = 'visual';
        state.selId = null; state.selWbId = null; state.selWbIds = [];
        net.applyingRemote = false;
        if (loc) {
            // Centre on the character at the focus zoom; only move when they (or the map) moved
            var cx = loc.tok.x + (loc.tok.w || 60) / 2, cy = loc.tok.y + (loc.tok.h || 52) / 2;
            var camKey = want + ':' + Math.round(cx) + ':' + Math.round(cy);
            var m = camp.items[want]; m.meta = m.meta || {};
            if (camKey !== lastCam) { m.meta.lastWbX = cx; m.meta.lastWbY = cy; m.meta.lastWbZoom = FOCUS_ZOOM; }
            if (key !== lastKey) { lastKey = key; net.applyStage({ campId: campId, itemId: want }); }
            else { if (window.appRender) window.appRender(); if (camKey !== lastCam && window.appRestoreCamera) window.appRestoreCamera(); }
            lastCam = camKey;
        } else {
            if (key !== lastKey) { lastKey = key; net.applyStage({ campId: campId, itemId: want }); }
            else { if (window.appRender) window.appRender(); if (camBack && window.appRestoreCamera) window.appRestoreCamera(); }
        }
        refreshSelect(camp);
        refreshCharSelect(camp);
        refreshIdle(pcs, idleSt.key);
        streamTrackers(rawTk && rawTk.id === campId ? rawTk : null, want, Date.now());
        var sfW = document.getElementById('streamFight'), sfT = streamFightWords(rawTk && rawTk.id === campId ? rawTk : null, want, camp.items[want]);   // 1.6.2 (the owner: "Round, turn and names")
        if (sfW) { if (sfW.textContent !== sfT) sfW.textContent = sfT; sfW.hidden = !sfT; }
        streamNames(document, document.getElementById('whiteboard'), camp.items[want]);
    }
    try {
        var hChan = new BroadcastChannel('waypoint');
        hChan.addEventListener('message', function(e) { if (e.data && e.data.type === 'stream-hold') holdApply(e.data.mode, document, function() { tick(); try { hChan.postMessage({ type: 'video-stage-query' }); hChan.postMessage({ type: 'scene-stage-query' }); } catch (er) {} }); });
        hChan.addEventListener('message', function(e) { if (e.data && e.data.type === 'gm-view') gmView = gmViewOf(e.data.view); });   // 1.6.2: which view the GM is on, for the idle follow
        hChan.postMessage({ type: 'stream-hold-query' }); hChan.postMessage({ type: 'gm-view-query' });
    } catch (e) {}
    setTimeout(tick, 400);
    setInterval(tick, 1000);
    // The GM's video shown to players (item 21 V2): the main window says what is on its stage over BroadcastChannel (video.js streamPost);
    // this window plays the same file from the local server over the map, within a second of the GM's position — muted unless Settings'
    // "Stream window plays the table's sound" is on. The message is another window's data: the path through videocore's videoSrc, the name
    // as a text node, numbers only as numbers
    var svEl = document.getElementById('streamVideoEl'), svBox = document.getElementById('streamVideo'), svCap = document.getElementById('streamVideoCap');
    var svSoundOn = function() { try { return localStorage.getItem('wp_streamSound') === 'on'; } catch (e) { return false; } };
    if (svEl && svBox && svCap) {
        try {
            var svChan = new BroadcastChannel('waypoint');
            svChan.addEventListener('message', function(e) { var d = e.data; if (d && d.type === 'video-stage' && !(window.wpStreamHeld && window.wpStreamHeld())) streamVideoApply(d, svEl, svBox, svCap, window.wpVideoCore, svSoundOn()); });
            svChan.postMessage({ type: 'video-stage-query' });
            var ssBox = document.getElementById('streamScene'), ssImg = document.getElementById('streamSceneImg'), ssT = document.getElementById('streamSceneTitle'), ssC = document.getElementById('streamSceneCap');
            if (ssBox && ssImg && ssT && ssC) { svChan.addEventListener('message', function(e) { var d = e.data; if (d && d.type === 'scene-stage' && !(window.wpStreamHeld && window.wpStreamHeld())) streamSceneApply(d, ssBox, ssImg, ssT, ssC); }); svChan.postMessage({ type: 'scene-stage-query' }); }
            window.addEventListener('storage', function(e) { if (e.key === 'wp_streamSound') svEl.muted = !svSoundOn(); });
        } catch (e) {}
    }
}
// [lookcheck:streamfight-start]
// 1.6.2 (the owner, by prompt: "Round, turn and names (Recommended)"): the fight on the map shown, as words for the bar. raw: the campaign as
// saved (its fights are the host's own and the party's copy holds none); map: the party's copy of the map, so a turn is named only where
// the party can see that token (a hidden one, or one no player's token sees, is not in the copy). The fight played on that map, else the first
function streamFightWords(raw, mapId, map) {
    var fs0 = raw && raw.fights && typeof raw.fights === 'object' ? raw.fights : null, fl = fs0 && fs0.list && typeof fs0.list === 'object' && !Array.isArray(fs0.list) ? fs0.list : null;
    if (!fl || typeof mapId !== 'string' || !mapId) return '';
    var ids = Object.keys(fl).filter(function(k) { var f = fl[k]; return !!f && typeof f === 'object' && f.mapId === mapId && Array.isArray(f.rows) && f.rows.length > 0; }); if (!ids.length) return '';
    var f = fl[ids.indexOf(fs0.on) >= 0 ? fs0.on : ids[0]], rd = typeof f.round === 'number' && isFinite(f.round) && f.round >= 1 ? Math.floor(f.round) : 1;
    var r = typeof f.turn === 'number' && Math.floor(f.turn) === f.turn && f.turn >= 0 ? f.rows[f.turn] : null, wb = map && Array.isArray(map.whiteboard) ? map.whiteboard : [];
    var tok = r && typeof r.tokId === 'string' ? wb.filter(function(w) { return !!w && w.id === r.tokId && !w.hidden; })[0] : null, nm = tok ? streamTokName(tok) : '';
    return 'Round ' + Math.min(rd, 9999) + (nm ? ' \u00b7 ' + nm + '\u2019s turn' : '');
}
function streamTokName(w) { return String(w && (w.charName || w.name) || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 40); }
// The tokens' names under them, in a layer of the board's own (the board draws no name on a token): one label a character token of the party's
// copy, as text, placed at the token's foot; drawn again only where it changed
function streamNames(doc, board, map) {
    if (!doc || !board) return 0;
    var layer = doc.getElementById('streamNames'); if (!layer) { layer = doc.createElement('div'); layer.id = 'streamNames'; board.appendChild(layer); }
    var wb = map && Array.isArray(map.whiteboard) ? map.whiteboard : [], list = wb.filter(function(w) { return !!w && w.isChar && !w.waiting && !w.hidden && typeof w.x === 'number' && typeof w.y === 'number' && isFinite(w.x) && isFinite(w.y) && streamTokName(w) !== ''; });
    var sig = JSON.stringify(list.map(function(w) { return [w.id, streamTokName(w), Math.round(w.x + (w.w || 60) / 2), Math.round(w.y + (w.h || 52))]; }));
    if (layer.getAttribute('data-sig') === sig) return list.length;
    layer.setAttribute('data-sig', sig); while (layer.firstChild) layer.removeChild(layer.firstChild);
    list.forEach(function(w) { var d = doc.createElement('div'); d.className = 'stream-name'; d.appendChild(doc.createTextNode(streamTokName(w))); d.style.left = Math.round(w.x + (w.w || 60) / 2) + 'px'; d.style.top = Math.round(w.y + (w.h || 52) + 3) + 'px'; layer.appendChild(d); });
    return list.length;
}
// [lookcheck:streamfight-end]
// [trackcheck:stream-start]
// Backlog 29: the stream window shows the table trackers shown to the table, on every map and on the map it shows, as a player is sent them
// (trackcore wireFor, cleaned again as a player's copy). A GM-only tracker never: this window is the party's view
function streamTrackers(camp, mapId, now) {
    var TK = typeof window !== 'undefined' ? window.wpTrackCore : null, T = typeof window !== 'undefined' ? window.wpTrackers : null; if (!TK || !T || typeof T.receive !== 'function') return null;
    var V = window.wpVtt; if (camp && V && typeof V.campaignOn === 'function' && V.campaignOn('trackers', camp) === false) camp = null;   // Table trackers switched off: none
    var ck = camp && camp.clock && typeof camp.clock.t === 'number' && isFinite(camp.clock.t) ? camp.clock.t : 0;
    var list = camp ? TK.cleanTrackers(TK.wireFor(TK.cleanTrackers(camp.trackers), mapId, now, ck), { wire: true }) : [];
    var sig = JSON.stringify(TK.wireSig(TK.cleanTrackers(camp ? camp.trackers : null), mapId, now, ck));
    if (sig === streamTrackers.sig) return list; streamTrackers.sig = sig;
    T.receive(list, now); return list;
}
// [trackcheck:stream-end]
// [scenecheck:stream-start]
// Backlog 181: a scene shown to everyone, as the main window says it over BroadcastChannel (scene.js stagePost). Another window's data: the
// picture only as a path of the campaign's own pictures, the title and the caption as text; anything else takes the scene down
function streamSceneApply(d, box, img, ttl, cap) {
    var sc = d && typeof d === 'object' && d.scene && typeof d.scene === 'object' ? d.scene : null;
    var p = sc && typeof sc.src === 'string' && /^\/saves\/images\//.test(sc.src) && !/[\x00-\x1f\\]|\.\./.test(sc.src) && sc.src.length <= 400 ? sc.src : '';
    if (!p) { box.style.display = 'none'; img.removeAttribute('src'); ttl.textContent = ''; cap.textContent = ''; return false; }
    img.setAttribute('src', encodeURI(p));
    ttl.textContent = typeof sc.title === 'string' ? sc.title.slice(0, 120) : '';
    cap.textContent = typeof sc.caption === 'string' ? sc.caption.slice(0, 4000) : '';
    box.style.display = ''; return true;
}
// [scenecheck:stream-end]
// [videocheck:streamwatch-start]
// What the stream window does with the main window's word on its stage: a video shown to players is played here from its own path (videoSrc:
// an uploaded video's path, encoded, or nothing), at the GM's position when this window has drifted more than 1.5 s from it, playing or
// paused as the GM has it, looping as the GM has it; anything else — nothing shown, no live showing, a path that is no uploaded video's — takes
// the picture down. The name is a text node. Returns true while a video is up
function streamVideoApply(d, el, box, cap, VC, soundOn) {
    var now = d && typeof d === 'object' && d.now && typeof d.now === 'object' ? d.now : null;
    var src = now && now.live === true && VC && typeof VC.videoSrc === 'function' ? VC.videoSrc(now.path) : '';
    if (!src) {
        if (el.getAttribute('src')) { try { el.pause(); } catch (e) {} el.removeAttribute('src'); try { el.load(); } catch (e) {} }
        box.style.display = 'none'; cap.textContent = '';
        return false;
    }
    if (el.getAttribute('src') !== src) el.src = src;
    box.style.display = ''; cap.textContent = VC.cleanName(now.name, 'Video');
    el.loop = now.loop === true; el.muted = !soundOn;
    var pos = typeof now.pos === 'number' && isFinite(now.pos) && now.pos >= 0 ? now.pos : 0;
    if (Math.abs((Number(el.currentTime) || 0) - pos) > 1.5) { try { el.currentTime = pos; } catch (e) {} }
    if (now.playing === true) { if (el.paused) { var p = null; try { p = el.play(); } catch (e) {} if (p && typeof p.catch === 'function') p.catch(function() {}); } }
    else if (!el.paused) { try { el.pause(); } catch (e) {} }
    return true;
}
// [videocheck:streamwatch-end]
if (on) {
    // A hot update in the main window reloads this one too, so it never runs old code
    try { new BroadcastChannel('waypoint').onmessage = function(e) { if (e.data && e.data.type === 'reload') location.reload(); }; } catch (e) {}
}
