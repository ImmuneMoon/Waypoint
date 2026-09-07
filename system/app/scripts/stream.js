/* Stream window — Waypoint opened with ?stream=1.
   A second window that shows only the play map, exactly as players see it: GM notes and
   dossiers stripped, hidden items as placeholders, no toolbars. It reads the saves folder
   through the same local server every second and redraws, so it mirrors the table as the
   GM plays. Meant to be screen-shared (Discord, OBS) to someone watching without the app.
   "Showing" in the corner follows the GM's current map or pins one until changed. */
import { state } from './state.js';
import { net } from './net.js';
import { characterList, locateCharacter } from './models.js';

const on = new URLSearchParams(location.search).get('stream') === '1';
if (on) {
    window.wpStream = true;
    document.body.classList.add('stream-mode', 'net-client');
    document.title = 'Waypoint \u2014 Stream';
    // Borrow the player-side rules: nothing editable, nothing saved, hidden things hidden.
    net.active = true; net.role = 'client'; net.foreign = true; net.stream = true; net.myId = 'stream';
    window.isPanMode = true;   // left-drag pans the view
    var focus = '', charFocus = '';
    try { focus = localStorage.getItem('wp_streamFocus') || ''; charFocus = localStorage.getItem('wp_streamChar') || ''; } catch (e) {}
    var charSel = document.getElementById('streamChar');
    var FOCUS_ZOOM = 1.5;
    var lastCam = '';   // "mapId:x:y" the view was last centred on, so a still token is not re-centred every tick

    function refreshCharSelect(camp) {
        if (!charSel) return;
        var list = characterList(camp, false);
        var sig = list.map(function(c) { return c.key + ':' + c.name + '@' + c.map; }).join('|') + '#' + charFocus;
        if (charSel.dataset.sig === sig) return;
        charSel.dataset.sig = sig;
        var html = '<option value="">\u2014 no one \u2014</option>';
        list.forEach(function(c) { html += '<option value="' + c.key + '"' + (c.key === charFocus ? ' selected' : '') + '>' + (c.name + ' (' + c.map + ')').replace(/[<>&]/g, '') + '</option>'; });
        charSel.innerHTML = html;
        if (sel) { sel.disabled = !!charFocus; sel.title = charFocus ? 'The map follows the focused character; clear "Focus on" to pick a map' : 'Follow the GM\'s current map, or focus one map until you change it'; }
    }
    function setCharFocus(key) { charFocus = key || ''; lastCam = ''; try { localStorage.setItem('wp_streamChar', charFocus); } catch (e) {} tick(); }
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
        maps.forEach(function(m) { html += '<option value="' + m.id + '"' + (m.id === focus ? ' selected' : '') + '>' + String(m.meta && m.meta.title || m.id).replace(/[<>&]/g, '') + '</option>'; });
        sel.innerHTML = html;
    }
    if (sel) sel.addEventListener('change', function() { focus = sel.value; charFocus = ''; lastCam = ''; try { localStorage.setItem('wp_streamFocus', focus); localStorage.setItem('wp_streamChar', ''); } catch (e) {} tick(); });
    if (hideBtn && bar) hideBtn.addEventListener('click', function() { bar.classList.add('hidden'); });
    document.addEventListener('mousemove', function(e) { if (bar && bar.classList.contains('hidden') && e.clientX < 60 && e.clientY < 60) bar.classList.remove('hidden'); });

    async function tick() {
        var data;
        try { data = await (await fetch('/api/data', { cache: 'no-store' })).json(); } catch (e) { return; }
        if (!data || !data.campaigns || !Object.keys(data.campaigns).length) return;
        var clean = net.sanitizeAppState(data);
        var campId = clean.activeCampaignId && clean.campaigns[clean.activeCampaignId] ? clean.activeCampaignId : Object.keys(clean.campaigns)[0];
        var camp = clean.campaigns[campId];
        var gmItem = camp.items[camp.activeItemId];
        var loc = charFocus ? locateCharacter(camp, charFocus) : null;
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
}
