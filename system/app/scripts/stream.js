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

const on = new URLSearchParams(location.search).get('stream') === '1';
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
        var html = '<option value="">\u2014 no one \u2014</option>';
        list.forEach(function(c) { html += '<option value="' + esc(c.key) + '"' + (c.key === charFocus ? ' selected' : '') + '>' + (c.name + ' (' + c.map + ')').replace(/[<>&]/g, '') + '</option>'; });
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
    var bar = document.getElementById('streamBar'), sel = document.getElementById('streamFocus'), hideBtn = document.getElementById('streamHideBtn');
    if (bar) bar.style.display = 'flex';
    var lastKey = '';

    function refreshSelect(camp) {
        if (!sel) return;
        var maps = Object.values(camp.items).filter(function(i) { return i.type === 'map'; });
        var sig = maps.map(function(m) { return m.id + ':' + (m.meta && m.meta.title || ''); }).join('|') + '#' + focus;
        if (sel.dataset.sig === sig) return;
        sel.dataset.sig = sig;
        var html = '<option value="">Follow the GM (current map)</option>';
        maps.sort(function(a, b) { return String(a.meta && a.meta.title || '').localeCompare(String(b.meta && b.meta.title || '')); });
        maps.forEach(function(m) { html += '<option value="' + esc(m.id) + '"' + (m.id === focus ? ' selected' : '') + '>' + String(m.meta && m.meta.title || m.id).replace(/[<>&]/g, '') + '</option>'; });
        sel.innerHTML = html;
    }
    if (sel) sel.addEventListener('change', function() { focus = sel.value; charFocus = ''; lastCam = ''; try { localStorage.setItem('wp_streamFocus', focus); localStorage.setItem('wp_streamChar', ''); } catch (e) {} tick(); });
    if (hideBtn && bar) hideBtn.addEventListener('click', function() { bar.classList.add('hidden'); });
    document.addEventListener('mousemove', function(e) { if (bar && bar.classList.contains('hidden') && e.clientX < 60 && e.clientY < 60) bar.classList.remove('hidden'); });

    async function tick() {
        var data;
        try { data = await (await fetch('/api/data', { cache: 'no-store' })).json(); } catch (e) { return; }
        if (!data || !data.campaigns || !Object.keys(data.campaigns).length) return;
        var seenBy = Object.create(null); Object.keys(data.campaigns).forEach(function(id) { seenBy[id] = lastSeen(data.campaigns[id]); });
        var clean = net.sanitizeAppState(data);
        var campId = clean.activeCampaignId && clean.campaigns[clean.activeCampaignId] ? clean.activeCampaignId : Object.keys(clean.campaigns)[0];
        var camp = clean.campaigns[campId];
        var gmItem = camp.items[camp.activeItemId];
        net.streamWhere = seenBy[campId] || Object.create(null);
        var loc = charFocus && charFocus.charAt(0) === 'o' ? (window.wpCharNow ? window.wpCharNow(camp, charFocus).loc : locateCharacter(camp, charFocus)) : null;   // R2 #14: a player's character alone is followed, on the map that player is on
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
            else if (window.appRender) window.appRender();
        }
        refreshSelect(camp);
        refreshCharSelect(camp);
    }
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
            svChan.addEventListener('message', function(e) { var d = e.data; if (d && d.type === 'video-stage') streamVideoApply(d, svEl, svBox, svCap, window.wpVideoCore, svSoundOn()); });
            svChan.postMessage({ type: 'video-stage-query' });
            window.addEventListener('storage', function(e) { if (e.key === 'wp_streamSound') svEl.muted = !svSoundOn(); });
        } catch (e) {}
    }
}
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
