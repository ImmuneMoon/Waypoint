/* Multiplayer: GM-hosted P2P sessions over WebRTC (PeerJS signaling, direct data channels).
   The host's app is the authority — it owns data.json exactly as in solo play.

   Players (clients):
   - arrive at the GM's active map ("stage") and follow the GM's navigation
   - are locked to spectator mode: pan, zoom, measure, and drag ONLY tokens
     whose ownerId matches their profile id (assigned by the GM in the inspector)
   - never write their own disk while connected; edits route to the host
   The host filters every incoming patch: only x/y/rot/front of that player's own
   tokens are applied, then the authoritative item is saved and rebroadcast. */

function render() { if (window.appRender) window.appRender(); }

import { state } from './state.js';
import { getActiveCampaign, findLandingRoom, landingPoint } from './models.js';
import { save, toast, load } from './io.js';
import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';
import { showConfirm } from './dialogs.js';

/* ---------- version gate ----------
   The join handshake carries the player's app version. A host turns away anyone
   older than itself (or anyone who sends no version — every build before 1.1.2)
   with a plain "update Waypoint" message, so a table never runs mixed versions. */
var APP_VERSION = null;
var newerSeen = {};   // player versions newer than ours that the GM has already been told about this session
fetch('/api/version').then(function(r) { return r.json(); }).then(function(v) { APP_VERSION = (v && v.version) ? String(v.version) : null; }).catch(function() {});
function versionCmp(a, b) {   // numeric major.minor.patch; anything after a '-' is ignored
    var pa = String(a || '0').split('-')[0].split('.').map(function(x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '0').split('-')[0].split('.').map(function(x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
}
function updateMessage(theirs, ours) {
    return 'Your Waypoint (' + (theirs || 'older than 1.1.2') + ') is older than the GM\'s (' + ours + '). Update Waypoint, then rejoin: open Settings ▸ Check for Updates and press Update Now (or get the latest Waypoint_Setup.exe from your GM and run it over your copy — saves and settings are kept).';
}

var net = {
    active: false,
    role: null,          // 'host' | 'client'
    myId: null,
    peer: null,
    conns: [],
    roster: {},          // peerKey -> profile
    code: null,
    applyingRemote: false,
    lastStage: null,
    leaving: false,      // true while tearing down on purpose (no auto-reconnect)
    paused: false        // GM froze the table: no token moves, no travel (chat stays open)
};
window.wpNet = net;

/* ---------- profile (local, no accounts) ---------- */
function getProfile() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('wp_profile') || 'null'); } catch (e) {}
    if (!p || !p.id) {
        p = { id: 'u_' + Math.random().toString(36).slice(2, 10), name: '' };
        try { localStorage.setItem('wp_profile', JSON.stringify(p)); } catch (e) {}
    }
    return p;
}
function setProfileName(name) {
    var p = getProfile();
    p.name = name;
    try { localStorage.setItem('wp_profile', JSON.stringify(p)); } catch (e) {}
    return p;
}
net.myId = getProfile().id;

/* ---------- ui helpers ---------- */
function ui(id) { return document.getElementById(id); }
function setStatus(msg) { var el = ui('netStatus'); if (el) el.textContent = msg; }

/* ---------- liveness: heartbeat + the header indicator ----------
   WebRTC can sit on a dead channel for a long time after the other side's
   process dies, so both ends send a tiny 'hb' every few seconds. Silence past
   HB_STALE turns the header dot amber; past HB_DEAD the connection is torn
   down deliberately — a client starts its reconnect loop, a host drops the
   player. The dot is the always-visible truth about the table's health. */
var HB_EVERY = 4000, HB_STALE = 12000, HB_DEAD = 30000;
var hbTimer = null, lastSeen = {}, hostLastSeen = 0;
function noteSeen(peerId) { var now = Date.now(); lastSeen[peerId] = now; if (net.role === 'client') hostLastSeen = now; }
function setIndicator(level, text) {
    var b = ui('netBtn');
    if (!b) return;
    ['net-ok', 'net-warn', 'net-bad'].forEach(function(c) { b.classList.remove(c); });
    if (level) b.classList.add('net-' + level);
    b.title = text ? 'Multiplayer — ' + text : 'Multiplayer — host or join a session';
    net.health = level || null;
}
net.setIndicator = setIndicator;
net._hb = { tick: hbTick, seen: noteSeen, start: startHeartbeat, stop: stopHeartbeat };   // sandbox testing hooks
function startHeartbeat() {
    stopHeartbeat();
    var now = Date.now();
    hostLastSeen = now;
    net.conns.forEach(function(c) { lastSeen[c.peer] = now; });
    hbTimer = setInterval(hbTick, HB_EVERY);
    hbTick();
}
function stopHeartbeat() {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null; lastSeen = {}; hostLastSeen = 0;
}
function hbTick() {
    if (!net.active) { setIndicator(null); return; }
    var now = Date.now();
    if (net.role === 'host') {
        broadcast({ type: 'hb' }, null);
        var stale = 0;
        net.conns.slice().forEach(function(c) {
            if (!lastSeen[c.peer]) lastSeen[c.peer] = now;
            var age = now - lastSeen[c.peer];
            var p = net.roster[c.peer];
            if (age > HB_DEAD) {
                if (p) toast((p.name || 'A player') + ' stopped responding — dropped.');
                try { c.close(); } catch (e) {}   // the close handler removes them from the roster
            } else if (age > HB_STALE) {
                stale++;
                if (p && !p.stale) { p.stale = true; renderRoster(); }
            } else if (p && p.stale) { delete p.stale; renderRoster(); }
        });
        var n = net.conns.length;
        setIndicator(stale ? 'warn' : 'ok', stale ? stale + ' player' + (stale > 1 ? 's' : '') + ' not responding' : 'hosting, ' + n + ' player' + (n === 1 ? '' : 's') + ' connected');
    } else {
        var c0 = net.conns[0];
        if (c0 && c0.open) { try { c0.send({ type: 'hb' }); } catch (e) {} }
        if (!hostLastSeen) hostLastSeen = now;
        var age0 = now - hostLastSeen;
        if (reconn.pending) { setIndicator('warn', 'reconnecting to the GM'); return; }
        if (age0 > HB_DEAD) {
            setIndicator('bad', 'lost the GM — reconnecting');
            setStatus('No response from the GM for ' + Math.round(age0 / 1000) + 's — reconnecting…');
            toast('No response from the GM — reconnecting…');
            hostLastSeen = now;
            try { if (c0) c0.close(); } catch (e) {}   // its close handler starts the reconnect loop
            setTimeout(function() { if (net.active && net.role === 'client' && !reconn.pending) scheduleReconnect(); }, 1500);
        } else if (age0 > HB_STALE) {
            setIndicator('warn', 'GM not responding for ' + Math.round(age0 / 1000) + 's');
            setStatus('Connected, but no word from the GM for ' + Math.round(age0 / 1000) + 's…');
        } else setIndicator('ok', 'connected to the GM');
    }
}
function renderRoster() {
    var el = ui('netRoster');
    if (el) {
        var players = Object.values(net.roster);
        if (!players.length) {
            el.textContent = 'No players connected yet.';
        } else {
            var camp = getActiveCampaign();
            el.innerHTML = players.map(function(p) {
                var name = escTextRoster(p.name || p.id);
                var initials = name.trim().split(/\s+/).map(function(s) { return s[0]; }).join('').slice(0, 2).toUpperCase();
                var it = camp && p.location ? camp.items[p.location] : null;
                var locTitle = it && it.meta && it.meta.title ? it.meta.title : (p.location || '');
                var sub = net.role === 'host' && p.location
                    ? '<span class="roster-loc">' + (p.detached ? '🧭 ' : '👣 ') + escTextRoster(locTitle) + '</span>'
                    : '';
                var jump = net.role === 'host' && p.location ? ' data-jump="' + p.location + '" title="Click to view this player\'s map"' : '';
                var avOk = typeof p.avatar === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(p.avatar) && p.avatar.length <= 200000;
                var face = avOk
                    ? '<img class="roster-avatar" src="' + p.avatar + '" alt="">'
                    : '<span class="roster-dot" style="background:hsl(' + playerHue(p.id) + ',55%,60%);">' + initials + '</span>';
                var kick = net.role === 'host'
                    ? '<button class="roster-kick" data-kick="' + Object.keys(net.roster).find(function(k) { return net.roster[k] === p; }) + '" title="Remove this player (they stay out for the rest of the session)">&times;</button>'
                    : '';
                var staleMark = p.stale ? '<span class="roster-stale-mark" title="Not responding — will be dropped if silence continues">&#9203;</span>' : '';
                return '<span class="roster-chip' + (p.stale ? ' roster-stale' : '') + '"' + jump + '>' + face +
                    '<span>' + name + '</span>' + staleMark + sub + kick + '</span>';
            }).join('');
        }
    }
    var badge = ui('netBtn');
    if (badge) badge.classList.toggle('net-live', net.active);
    document.body.classList.toggle('net-client', net.active && net.role === 'client');
}
function escTextRoster(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
var _rosterEl = ui('netRoster');
if (_rosterEl) _rosterEl.addEventListener('click', function(e) {
    var kickBtn = e.target.closest('[data-kick]');
    if (kickBtn && net.role === 'host') {
        e.stopPropagation();
        net.kickPlayer(kickBtn.dataset.kick);
        return;
    }
    var chip = e.target.closest('[data-jump]');
    if (!chip || net.role !== 'host') return;
    var camp = getActiveCampaign();
    if (!camp || !camp.items[chip.dataset.jump]) return;
    camp.activeItemId = chip.dataset.jump;
    ui('netModal').style.display = 'none';
    save();
    updateSidebarNav();
    render();
    if (window.appRestoreCamera) window.appRestoreCamera();
});

/* ---------- what clients are allowed to receive ---------- */
// Strip GM-only content before anything leaves the host: planners never ship,
// room notes / character dossier info never ship, GM-note cards never ship,
// and hidden whiteboard items are reduced to a position-only stub.
function sanitizeItem(item) {
    if (!item) return item;
    if (item.type === 'planner') return null;
    if (item.type !== 'map') return item;
    var m = JSON.parse(JSON.stringify(item));
    (m.rooms || []).forEach(function(r) {
        delete r.notes;
        (r.characters || []).forEach(function(c) { delete c.info; delete c.ref; });
    });
    m.whiteboard = (m.whiteboard || []).filter(function(w) { return !w.gmNoteFor; }).map(function(w) {
        if (!w.hidden) {
            // attached character sheets are GM bookkeeping (and heavy) — never on the wire
            if (w.sheet) { w = JSON.parse(JSON.stringify(w)); delete w.sheet; }
            return w;
        }
        return { id: w.id, type: 'rect', hidden: true, x: w.x, y: w.y, w: w.w, h: w.h, rot: w.rot || 0, layer: w.layer, locked: true };
    });
    return m;
}
function sanitizeAppState(s) {
    var c = JSON.parse(JSON.stringify(s));
    Object.values(c.campaigns || {}).forEach(function(camp) {
        // GM bookkeeping: the player registry, history, and ban list never ship
        delete camp.players;
        delete camp.bannedPlayers;
        Object.keys(camp.items).forEach(function(id) {
            var it = sanitizeItem(camp.items[id]);
            if (it === null) delete camp.items[id];
            else camp.items[id] = it;
        });
        if (!camp.items[camp.activeItemId]) camp.activeItemId = Object.keys(camp.items)[0] || null;
    });
    return c;
}

/* ---------- stage (which campaign/map the table is on) ---------- */
// The GM can pin the table to a specific map ("Players arrive at" in the Host
// panel); otherwise the stage follows whatever map the GM is viewing.
net.stageOverride = null;

function currentStage() {
    var camp = getActiveCampaign();
    if (!camp) return net.lastMapStageObj || null;
    if (net.stageOverride && camp.items[net.stageOverride] && camp.items[net.stageOverride].type === 'map') {
        return { campId: camp.id, itemId: net.stageOverride };
    }
    var it = camp.items[camp.activeItemId];
    if (it && it.type === 'map') {
        net.lastMapStageObj = { campId: camp.id, itemId: camp.activeItemId };
    }
    // if the GM is on a planner, players stay on the last map
    return net.lastMapStageObj || null;
}

function refreshStageSelect() {
    var cSel = ui('netCampSelect');
    if (cSel) {
        cSel.innerHTML = Object.values(state.appState.campaigns).map(function(c) {
            return '<option value="' + c.id + '">' + escText(c.name || c.id) + '</option>';
        }).join('');
        cSel.value = state.appState.activeCampaignId || '';
    }
    var sel = ui('netStageSelect');
    if (!sel) return;
    var camp = getActiveCampaign();
    if (!camp) { sel.innerHTML = ''; return; }
    var it = camp.items[camp.activeItemId];
    var followTitle = (it && it.type === 'map' && it.meta) ? it.meta.title
        : (net.lastMapStageObj && camp.items[net.lastMapStageObj.itemId] && camp.items[net.lastMapStageObj.itemId].meta.title) || 'your current map';
    var maps = Object.values(camp.items).filter(function(m) { return m.type === 'map'; });
    maps.sort(function(a, b) { return String((a.meta && a.meta.title) || '').localeCompare(String((b.meta && b.meta.title) || '')); });
    sel.innerHTML = '<option value="">Follow me — ' + escText(followTitle) + '</option>' +
        maps.map(function(m) { return '<option value="' + m.id + '">' + escText((m.meta && m.meta.title) || m.id) + '</option>'; }).join('');
    sel.value = (net.stageOverride && camp.items[net.stageOverride]) ? net.stageOverride : '';
}

var _campSel = ui('netCampSelect');
if (_campSel) _campSel.addEventListener('change', function() {
    if (!state.appState.campaigns[this.value]) return;
    state.appState.activeCampaignId = this.value;
    net.stageOverride = null;   // the pinned map belonged to the previous campaign
    net.applyingRemote = false;
    save();
    updateCampaignSelect();
    updateSidebarNav();
    render();
    if (window.appRestoreCamera) window.appRestoreCamera();
    refreshStageSelect();
    var c = getActiveCampaign();
    if (net.active && net.role === 'host') {
        net.onLocalSave();   // move followers onto the new campaign's stage
        toast('Now hosting ' + (c ? c.name : 'campaign') + '.');
    } else if (c) {
        toast('Players will join ' + c.name + '.');
    }
});

var _stageSel = ui('netStageSelect');
if (_stageSel) _stageSel.addEventListener('change', function() {
    net.stageOverride = this.value || null;
    var camp = getActiveCampaign();
    var target = net.stageOverride && camp ? camp.items[net.stageOverride] : null;
    if (net.active && net.role === 'host') {
        net.onLocalSave();   // stage key changed → followers are moved and tokens ensured
        toast(target ? 'Table pinned to ' + ((target.meta && target.meta.title) || net.stageOverride) + '.' : 'Table follows your map again.');
    } else if (target) {
        toast('Players will arrive at ' + ((target.meta && target.meta.title) || net.stageOverride) + '.');
    }
});
function applyStage(stage) {
    if (!stage || !state.appState.campaigns[stage.campId]) return;
    net.applyingRemote = true;
    state.appState.activeCampaignId = stage.campId;
    var camp = state.appState.campaigns[stage.campId];
    if (camp.items[stage.itemId]) camp.activeItemId = stage.itemId;
    state.viewMode = 'visual';
    state.selId = null; state.selWbId = null; state.selWbIds = [];
    // Personal travel names a landing room: open the map looking at it
    if (stage.landRoomId && camp.items[stage.itemId]) {
        var destS = camp.items[stage.itemId];
        var landS = (destS.rooms || []).find(function(r) { return r.id === stage.landRoomId; });
        var ptS = landS && landingPoint(destS, landS);
        if (ptS && ptS.wbX != null) { destS.meta = destS.meta || {}; destS.meta.lastWbX = ptS.wbX; destS.meta.lastWbY = ptS.wbY; }
    }
    updateCampaignSelect();
    updateSidebarNav();
    render();
    if (window.appRestoreCamera) window.appRestoreCamera();
    net.applyingRemote = false;
}

/* ---------- sync ---------- */
function activeItemPatch() {
    var camp = getActiveCampaign();
    if (!camp || !camp.items[camp.activeItemId]) return null;
    return { type: 'item', campId: camp.id, itemId: camp.activeItemId, item: camp.items[camp.activeItemId] };
}

function applyItem(msg) {
    var camp = state.appState.campaigns[msg.campId];
    if (!camp) return;
    net.applyingRemote = true;
    camp.items[msg.itemId] = msg.item;
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId) render();
    updateSidebarNav();
    net.applyingRemote = false;
}

// Host-side validation: from a player's patch, apply ONLY position/rotation of
// whiteboard items owned by that player. Everything else is ignored.
function applyClientItemFiltered(msg, profile) {
    if (!profile) return false;
    var camp = state.appState.campaigns[msg.campId];
    if (!camp) return false;
    var liveItem = camp.items[msg.itemId];
    if (!liveItem || liveItem.type !== 'map' || !msg.item || !Array.isArray(msg.item.whiteboard)) return false;
    var changed = false;
    var liveById = {};
    (liveItem.whiteboard || []).forEach(function(w) { liveById[w.id] = w; });
    msg.item.whiteboard.forEach(function(w) {
        var lw = liveById[w.id];
        if (!lw || lw.ownerId !== profile.id) return;   // ownership is judged on the HOST's copy
        if (lw.x !== w.x || lw.y !== w.y || (lw.rot || 0) !== (w.rot || 0) || (lw.front || 0) !== (w.front || 0)) {
            lw.x = w.x; lw.y = w.y; lw.rot = w.rot || 0; lw.front = w.front || 0;
            changed = true;
        }
    });
    return changed;
}

function applySnapshot(msg) {
    net.applyingRemote = true;
    state.appState = msg.appState;
    net.applyingRemote = false;
    setPausedLocal(!!msg.paused);   // late joiners inherit a paused table
    if (msg.stage) {
        applyStage(msg.stage);
    } else {
        net.applyingRemote = true;
        state.viewMode = 'visual';
        state.selId = null; state.selWbId = null; state.selWbIds = [];
        updateCampaignSelect();
        updateSidebarNav();
        render();
        net.applyingRemote = false;
    }
}

function broadcast(msg, exceptConn) {
    net.conns.forEach(function(c) {
        if (c !== exceptConn && c.open) { try { c.send(msg); } catch (e) {} }
    });
}

// Skip re-sending an item that hasn't actually changed — camera saves fire
// constantly and used to rebroadcast the whole map every time.
var _lastPatchHash = {};
function quickHash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h + ':' + s.length;
}

// Called from io.js on every local save while a session is active.
net.onLocalSave = function() {
    if (!net.active || net.applyingRemote) return;
    var patch = activeItemPatch();
    if (patch && net.role === 'host') {
        var clean = sanitizeItem(patch.item);
        patch = clean ? { type: 'item', campId: patch.campId, itemId: patch.itemId, item: clean } : null;
    }
    if (patch) {
        var hs = quickHash(JSON.stringify(patch.item));
        if (_lastPatchHash[patch.itemId] === hs) patch = null;
        else _lastPatchHash[patch.itemId] = hs;
    }
    if (patch) broadcast(patch, null);
    if (net.role === 'host') {
        var stage = currentStage();
        var key = stage ? stage.campId + '/' + stage.itemId : '';
        if (key && key !== net.lastStage) {
            net.lastStage = key;
            // only players still following the GM are moved; detached wanderers stay put
            net.conns.forEach(function(c) {
                var p = net.roster[c.peer];
                if (p && p.detached) return;
                if (p) { p.location = stage.itemId; ensurePlayerToken(p.id, stage.itemId); }
                if (c.open) { try { c.send({ type: 'stage', stage: stage }); } catch (e) {} }
            });
            renderRoster();
            broadcastRoster();
        }
    }
};

/* ---------- table pause ---------- */
// Applies the pause state locally (banner, dimming, button label). Only the
// host's toggle broadcasts; clients receive it via 'pause' messages/snapshot.
function setPausedLocal(on) {
    net.paused = !!on;
    var banner = ui('pauseBanner');
    if (banner) banner.style.display = (net.paused && net.role === 'client') ? 'block' : 'none';
    document.body.classList.toggle('net-paused', net.paused && net.active);
    var btn = ui('netPauseBtn');
    if (btn) {
        btn.innerHTML = net.paused ? '&#9654;&#65039; Resume the Table' : '&#9208;&#65039; Pause the Table';
        btn.classList.toggle('paused', net.paused);
    }
}

var _pauseBtn = ui('netPauseBtn');
if (_pauseBtn) _pauseBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    setPausedLocal(!net.paused);
    broadcast({ type: 'pause', on: net.paused }, null);
    toast(net.paused ? 'Table paused — players are frozen (chat stays open).' : 'Table resumed.');
});

/* ---------- live position streaming ----------
   Drags send tiny {type:'pos'} messages (throttled) so remote tokens glide
   instead of jumping at drag end. The final message persists on the host. */
var _posLast = 0;

net.streamPos = function(wItem, final) {
    if (!net.active || !wItem) return;
    if (net.paused && net.role === 'client') return;
    var camp = getActiveCampaign();
    if (!camp) return;
    var now = Date.now();
    if (!final && now - _posLast < 45) return;
    _posLast = now;
    var msg = { type: 'pos', campId: camp.id, itemId: camp.activeItemId, wbId: wItem.id, x: wItem.x, y: wItem.y, rot: wItem.rot || 0, front: wItem.front || 0, final: !!final };
    if (net.role === 'host') broadcast(msg, null);
    else if (net.conns[0] && net.conns[0].open) { try { net.conns[0].send(msg); } catch (e) {} }
};

// Fast path: move the DOM node directly, no full re-render per frame.
function applyPosToDom(msg) {
    var camp = getActiveCampaign();
    if (!camp || camp.id !== msg.campId || camp.activeItemId !== msg.itemId || state.viewMode !== 'visual') return;
    var el = state.wbEls && state.wbEls[msg.wbId];
    if (!el) return;
    el.style.left = msg.x + 'px';
    el.style.top = msg.y + 'px';
    el.style.transform = msg.rot ? 'rotate(' + msg.rot + 'deg)' : 'none';
    var fwP = el.querySelector(':scope > .token-front');
    if (fwP) fwP.style.transform = msg.front ? 'rotate(' + msg.front + 'deg)' : '';
}

/* Host: send a player through a portal. Validates that the portal is a visible
   item on their current map, linked to a room with a warp target; then moves
   their location, spawns/adopts their token on the far side, and tells only
   that player to change map. Returns true when the travel happened. */
function hostTravel(conn, traveler, portal, fromMap) {
    var tCamp = getActiveCampaign();
    if (!traveler || !tCamp || !fromMap || !portal) return false;
    if (portal.hidden || !(portal.nodeId || portal.targetMapId)) return false;
    // The item's own portal target, else its linked room's
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (fromMap.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !pRoom.targetMapId || !tCamp.items[pRoom.targetMapId]) return false;
    var destMap = tCamp.items[pRoom.targetMapId];
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, destMap);
    traveler.location = pRoom.targetMapId;
    traveler.detached = true;
    renderRoster();
    ensurePlayerToken(traveler.id, pRoom.targetMapId, landRoom && landRoom.id);
    broadcastRoster();
    if (conn) { try { conn.send({ type: 'stage', personal: true, stage: { campId: tCamp.id, itemId: pRoom.targetMapId, landRoomId: landRoom ? landRoom.id : null } }); } catch (e) {} }
    var destTitle = (tCamp.items[pRoom.targetMapId].meta || {}).title || pRoom.targetMapId;
    toast((traveler.name || 'A player') + ' traveled to ' + destTitle + '.');
    return true;
}

// The portal item under a token's center, if any (visible, room-linked, warp target set)
function portalUnder(item, map) {
    if (!item || !map || !map.whiteboard) return null;
    var cx = item.x + (item.w || 0) / 2, cy = item.y + (item.h || 0) / 2;
    var best = null, bestArea = Infinity;
    map.whiteboard.forEach(function(o) {
        if (o.id === item.id || !(o.nodeId || o.targetMapId) || o.hidden) return;
        var ow = o.w || 0, oh = o.h || 0;
        if (cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh) return;
        if (!o.targetMapId) {
            var room = (map.rooms || []).find(function(r) { return r.id === o.nodeId; });
            if (!room || !room.targetMapId) return;
        }
        if (ow * oh < bestArea) { bestArea = ow * oh; best = o; }
    });
    return best;
}

/* Dropping a player's token onto a portal sends that player through — no
   double-click needed. Called by the host for its own drops (a GM can push a
   player's token through a door) and for player drops arriving over the wire. */
net.tokenDropped = function(item, map) {
    if (!net.active || net.role !== 'host' || net.paused || !item || !item.isChar || !item.ownerId) return false;
    var portal = portalUnder(item, map);
    if (!portal) return false;
    var peerId = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === item.ownerId; });
    if (!peerId) return false;
    var conn = net.conns.find(function(c) { return c.peer === peerId; });
    return hostTravel(conn, net.roster[peerId], portal, map);
};

function handlePos(msg, conn) {
    var camp = state.appState.campaigns[msg.campId];
    var map = camp && camp.items[msg.itemId];
    if (!map || map.type !== 'map') return;
    var w = (map.whiteboard || []).find(function(x) { return x.id === msg.wbId; });
    if (!w) return;
    if (net.role === 'host') {
        if (net.paused) return;                    // frozen table: client motion is dropped
        var pr = net.roster[conn.peer];
        if (!pr || w.ownerId !== pr.id) return;   // same ownership rule as full patches
        w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;
        // Host is the authority on cells: seat the token here too, in case the
        // player's copy didn't (grid state not yet applied on their side)
        if (msg.final && window.wpSeatHex && window.wpSeatHex(w, map)) { msg = Object.assign({}, msg, { x: w.x, y: w.y }); }
        applyPosToDom(msg);
        broadcast(msg, conn);
        if (msg.final) {
            var toRoom = window.wpAutoRoom ? window.wpAutoRoom(w, map) : null;
            if (toRoom) toast((w.charName || 'A character') + ' is now in ' + (toRoom.name || 'a room') + '.');
            net.applyingRemote = true; save(true); net.applyingRemote = false;
            net.tokenDropped(w, map);   // landed on a portal? the player travels
        }
    } else {
        w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;
        applyPosToDom(msg);
    }
}

// Client: ask the host to travel through a portal item on the current map.
net.requestTravel = function(viaItemId) {
    if (!net.active || net.role !== 'client' || !net.conns[0] || !net.conns[0].open) return;
    if (net.paused) { toast('The table is paused.'); return; }
    try { net.conns[0].send({ type: 'travel', viaItemId: viaItemId }); } catch (e) {}
};

function broadcastRoster() { broadcast({ type: 'roster', roster: net.roster }, null); }

// Is this player currently on the given map? (self is always present to itself)
net.isPresent = function(ownerId, mapId) {
    if (!net.active) return true;                                  // solo: everything shows
    if (net.role === 'client' && ownerId === net.myId) return true;
    return Object.values(net.roster).some(function(p) { return p && p.id === ownerId && p.location === mapId; });
};

/* Host: guarantee player P has exactly one controlled token on map M.
   Adopt an unowned token matching their character, else spawn a clone of their
   token from another map at the map's home point. Extra owned tokens on the
   same map are demoted to GM control. */
function ensurePlayerToken(pid, mapId, landRoomId) {
    if (net.role !== 'host') return false;
    var camp = getActiveCampaign();
    if (!camp) return false;
    var map = camp.items[mapId];
    if (!map || map.type !== 'map') return false;
    var pl = (camp.players || {})[pid] || {};
    var changed = false;
    var mine = (map.whiteboard || []).filter(function(w) { return w.isChar && w.ownerId === pid; });
    if (mine.length > 1) {
        mine.slice(1).forEach(function(w) { delete w.ownerId; });
        changed = true;
        toast('Duplicate tokens for ' + (pl.name || pid) + ' demoted to GM control.');
    }
    if (mine.length === 0 && pl.charName) {
        var cand = (map.whiteboard || []).find(function(w) { return w.isChar && !w.ownerId && w.charName === pl.charName; });
        if (cand) {
            cand.ownerId = pid;
            changed = true;
        } else {
            var src = null;
            Object.values(camp.items).some(function(it) {
                if (it.type !== 'map') return false;
                var w = (it.whiteboard || []).find(function(x) { return x.isChar && x.charName === pl.charName; });
                if (w) { src = w; return true; }
                return false;
            });
            if (src) {
                var nw = JSON.parse(JSON.stringify(src));
                nw.id = 'wb' + Math.random().toString(36).slice(2, 10);
                nw.ownerId = pid;
                delete nw.hidden;
                // Spawn on the landing room's whiteboard item when there is one, else at home
                var landR = landRoomId && (map.rooms || []).find(function(r) { return r.id === landRoomId; });
                var landPt = landR && landingPoint(map, landR);
                var sx = (landPt && landPt.wbX != null) ? landPt.wbX : (map.meta.homeX || 15000);
                var sy = (landPt && landPt.wbY != null) ? landPt.wbY : (map.meta.homeY || 15000);
                nw.x = sx - (nw.w || 60) / 2;
                nw.y = sy - (nw.h || 52) / 2;
                if (window.wpSeatHex) window.wpSeatHex(nw, map);
                map.whiteboard = map.whiteboard || [];
                map.whiteboard.push(nw);
                changed = true;
                toast((pl.name || 'Player') + "'s token spawned on " + ((map.meta || {}).title || mapId) + '.');
            }
        }
    }
    if (changed) {
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        var cleanMap = sanitizeItem(map);
        if (cleanMap) broadcast({ type: 'item', campId: camp.id, itemId: mapId, item: cleanMap }, null);
        var myActive = getActiveCampaign();
        if (myActive && myActive.activeItemId === mapId) render();
    }
    return changed;
}

/* ---------- join gate: password, session bans, GM approval ---------- */
var bannedIds = {};        // profile id -> true, for this session only
var pendingJoins = [];     // [{conn, prof}] awaiting the GM's Allow/Deny
var approvalOpen = false;

function denyJoin(conn, reason) {
    try { conn.send({ type: 'denied', reason: reason }); } catch (e) {}
    setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
}

function admitPlayer(conn, prof) {
    if (!conn.open) return;
    var stageNow = currentStage();
    prof.location = stageNow ? stageNow.itemId : null;
    prof.detached = false;
    net.roster[conn.peer] = prof;
    renderRoster();
    toast((prof.name || 'A player') + ' joined.');
    // remember this player on the campaign so token ownership can outlive the session
    var camp = getActiveCampaign();
    if (camp) {
        camp.players = camp.players || {};
        // merge: keep the charName binding and anything else the GM has set
        var rec = camp.players[prof.id] = Object.assign({}, camp.players[prof.id], { name: prof.name || prof.id });
        // player history: recorded per campaign, shown in the Players panel
        rec.firstSeen = rec.firstSeen || Date.now();
        rec.lastSeen = Date.now();
        rec.joinCount = (rec.joinCount || 0) + 1;
        net.applyingRemote = true; save(true); net.applyingRemote = false;
    }
    var stage = currentStage();
    net.lastStage = stage ? stage.campId + '/' + stage.itemId : null;
    if (stage) ensurePlayerToken(prof.id, stage.itemId);   // before the snapshot so it's included
    try { conn.send({ type: 'snapshot', appState: sanitizeAppState(state.appState), stage: stage, paused: net.paused }); } catch (e) {}
    broadcastRoster();
}

function processNextApproval() {
    if (approvalOpen) return;
    var next = pendingJoins.shift();
    if (!next) return;
    if (!next.conn.open) { processNextApproval(); return; }   // gave up waiting
    approvalOpen = true;
    showConfirm('"' + (next.prof.name || 'A player') + '" wants to join your table. Let them in?', function(yes) {
        approvalOpen = false;
        if (!net.active || net.role !== 'host') return;
        if (yes) {
            admitPlayer(next.conn, next.prof);
        } else {
            bannedIds[next.prof.id] = true;   // no re-prompt spam this session
            denyJoin(next.conn, 'The GM declined your request to join.');
            toast((next.prof.name || 'Player') + ' was turned away.');
        }
        processNextApproval();
    });
}

net.kickPlayer = function(peerKey) {
    if (net.role !== 'host') return;
    var conn = net.conns.find(function(c) { return c.peer === peerKey; });
    var p = net.roster[peerKey];
    if (p) bannedIds[p.id] = true;   // kicked players stay out for this session
    if (conn) {
        try { conn.send({ type: 'kicked' }); } catch (e) {}
        setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
    }
    toast((p && p.name ? p.name : 'Player') + ' removed from the session.');
};

/* ---------- message handling ---------- */
function handleMessage(msg, conn) {
    if (!msg || !msg.type) return;
    // Host-side gate: until a connection has been admitted (passed the version check, any
    // password, and the GM's approval) the only thing it may say is 'hello'. Anything else —
    // an old build, a hand-rolled client, a probe — is dropped without a reply and the
    // connection closed. Nothing is ever sent to, or applied from, an unadmitted peer.
    if (net.role === 'host' && msg.type !== 'hello' && !net.roster[conn.peer]) {
        try { conn.close(); } catch (e) {}
        return;
    }
    noteSeen(conn.peer);
    if (msg.type === 'hb') return;   // heartbeat: its arrival is the whole message
    if (msg.type === 'hello' && net.role === 'host') {
        if (net.roster[conn.peer]) return;   // already admitted: a repeat hello is ignored
        if (msg.profile && typeof msg.profile !== 'object') return;
        var prof = msg.profile || { id: conn.peer, name: 'Player' };
        // Peer-supplied avatar: accept only a small image data URL, else drop it
        if (prof.avatar && !(typeof prof.avatar === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(prof.avatar) && prof.avatar.length <= 200000)) {
            delete prof.avatar;
        }
        // Version gate first: an out-of-date player gets the update message, not a password prompt
        if (APP_VERSION) {
            var theirV = (typeof msg.version === 'string') ? msg.version : null;
            if (!theirV || versionCmp(theirV, APP_VERSION) < 0) {
                try { conn.send({ type: 'denied', reason: updateMessage(theirV, APP_VERSION), update: true }); } catch (e) {}
                setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
                toast((prof.name || 'A player') + ' tried to join on Waypoint ' + (theirV || 'older than 1.1.2') + ' — turned away to update.');
                return;
            }
            if (versionCmp(theirV, APP_VERSION) > 0) {
                // The GM is the one behind: let the player in, but tell the GM plainly — once per newer version per session
                if (!newerSeen[theirV]) {
                    newerSeen[theirV] = true;
                    showConfirm((prof.name || 'A player') + ' is joining on Waypoint ' + theirV + ' — newer than your ' + APP_VERSION + '. Your table may not understand everything their build sends. Update your Waypoint when this session is over: Settings ▸ Check for Updates (saves and settings are kept).', function() {});
                }
            }
        }
        if (bannedIds[prof.id]) { denyJoin(conn, 'You were removed from this session.'); return; }
        var campB = getActiveCampaign();
        if (campB && campB.bannedPlayers && campB.bannedPlayers[prof.id]) {
            denyJoin(conn, 'You are banned from this campaign.');
            return;
        }
        var pwEl = ui('netPassInput');
        var pw = pwEl ? pwEl.value.trim() : '';
        if (pw && String(msg.password || '').trim() !== pw) {
            denyJoin(conn, 'Wrong session password.');
            return;
        }
        var camp0 = getActiveCampaign();
        var returning = camp0 && camp0.players && camp0.players[prof.id];
        if (returning) {
            admitPlayer(conn, prof);   // known at this table: straight in
        } else {
            try { conn.send({ type: 'wait' }); } catch (e) {}
            pendingJoins.push({ conn: conn, prof: prof });
            processNextApproval();
        }
    } else if (msg.type === 'wait' && net.role === 'client') {
        setStatus('Connected — waiting for the GM to let you in…');
    } else if ((msg.type === 'denied' || msg.type === 'kicked') && net.role === 'client') {
        net.leaving = true;   // deliberate teardown: no auto-reconnect
        var why = msg.type === 'kicked' ? 'Removed from the session by the GM.' : (msg.reason || 'The GM declined your request.');
        setStatus(why);
        if (msg.update) showConfirm(why, function() {});   // an update prompt is worth a dialog, not just a status line
        toast(why + ' Restoring your own campaign.');
        var nm2 = ui('netModal');
        if (nm2) nm2.style.display = 'flex';
    } else if (msg.type === 'snapshot' && net.role === 'client') {
        applySnapshot(msg);
        syncSessionButtons();
        setStatus('Connected — campaign synced from host.');
        toast('Campaign synced from host.');
    } else if (msg.type === 'item') {
        if (net.role === 'host') {
            if (net.paused) return;   // frozen table: client edits are dropped
            var profile = net.roster[conn.peer];
            var changed = applyClientItemFiltered(msg, profile);
            if (changed) {
                var myActive = getActiveCampaign();
                if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId) render();
                net.applyingRemote = true; save(true); net.applyingRemote = false;
                var cleanItem = sanitizeItem(state.appState.campaigns[msg.campId].items[msg.itemId]);
                if (cleanItem) broadcast({ type: 'item', campId: msg.campId, itemId: msg.itemId, item: cleanItem }, null);
            }
        } else {
            applyItem(msg);
        }
    } else if (msg.type === 'stage' && net.role === 'client') {
        applyStage(msg.stage);
        toast(msg.personal ? 'You arrive.' : 'The GM moved the table to a new map.');
    } else if (msg.type === 'pause' && net.role === 'client') {
        setPausedLocal(!!msg.on);
        toast(msg.on ? 'The GM paused the table.' : 'The table is live again.');
    } else if (msg.type === 'travel' && net.role === 'host') {
        if (net.paused) return;   // frozen table: no travel
        var traveler = net.roster[conn.peer];
        var tCamp = getActiveCampaign();
        if (!traveler || !tCamp) return;
        var fromMap = tCamp.items[traveler.location || tCamp.activeItemId];
        if (!fromMap || fromMap.type !== 'map') return;
        var portal = (fromMap.whiteboard || []).find(function(w) { return w.id === msg.viaItemId; });
        hostTravel(conn, traveler, portal, fromMap);
    } else if (msg.type === 'pos') {
        handlePos(msg, conn);
    } else if (msg.type === 'end' && net.role === 'client') {
        net.leaving = true;   // deliberate teardown from the GM: no auto-reconnect
        setStatus('Session ended by the GM.');
        var nm = ui('netModal');
        if (nm) nm.style.display = 'flex';
        toast('The GM ended the session — restoring your own campaign.');
    } else if (msg.type === 'asset-req' && net.role === 'host') {
        handleAssetRequest(msg, conn);
    } else if (msg.type === 'asset' && net.role === 'client') {
        handleAssetArrival(msg);
    } else if (msg.type === 'chat') {
        if (net.role === 'host') {
            // player comments are table-wide: relay to everyone else
            pushChat(msg);
            broadcast(msg, conn);
        } else {
            pushChat(msg);
        }
    } else if (msg.type === 'roster') {
        net.roster = msg.roster || {};
        renderRoster();
        refreshChatRecipients();
        if (net.role === 'client' && state.viewMode === 'visual') render();  // presence changed → token visibility may change
    }
}

/* ---------- auto-reconnect (client) ----------
   An unexpected drop keeps the room code and retries quietly; only after the
   retries run out (or the GM ends the session) is the local campaign restored. */
var reconn = { tries: 0, timer: null, code: null, name: null, pending: false };

function cancelReconnect() {
    reconn.pending = false; reconn.tries = 0;
    if (reconn.timer) { clearTimeout(reconn.timer); reconn.timer = null; }
}

function giveUpAndRestore(msg) {
    cancelReconnect();
    stopHeartbeat();
    setIndicator(null);
    setPausedLocal(false);
    net.active = false; net.role = null;
    renderRoster();
    setStatus(msg);
    toast(msg + ' Restoring your own campaign.');
    load();
}

// Players keep trying for about two minutes — long enough for a GM whose app
// crashed to relaunch and press Host again (which reuses the same code).
var RECONNECT_TRIES = 30;
function scheduleReconnect() {
    if (reconn.tries >= RECONNECT_TRIES) { giveUpAndRestore('Could not reconnect — the GM may have ended the session.'); return; }
    reconn.pending = true;
    reconn.tries++;
    setIndicator('warn', 'reconnecting to the GM (attempt ' + reconn.tries + ' of ' + RECONNECT_TRIES + ')');
    setStatus('Connection lost — reconnecting (attempt ' + reconn.tries + ' of ' + RECONNECT_TRIES + ')… If the GM restarts Waypoint and hosts again, you will reattach automatically.');
    if (reconn.tries === 1) toast('Connection lost — reconnecting… (keeps trying for ~2 minutes)');
    reconn.timer = setTimeout(function() { joinSession(reconn.code, reconn.name, true); }, reconn.tries === 1 ? 1200 : 4000);
}

function wireConn(conn) {
    conn.on('data', function(d) { handleMessage(d, conn); });
    conn.on('close', function() {
        net.conns = net.conns.filter(function(c) { return c !== conn; });
        var p = net.roster[conn.peer];
        delete net.roster[conn.peer];
        renderRoster();
        if (net.role === 'host') {
            toast((p && p.name ? p.name : 'A player') + ' left.');
            broadcast({ type: 'roster', roster: net.roster }, null);
        } else if (net.leaving) {
            // deliberate teardown: 'end' from the GM (still active) or our own Leave (already torn down)
            var stillActive = net.active;
            net.leaving = false;
            cancelReconnect();
            if (stillActive) {
                if (net.peer) { try { net.peer.destroy(); } catch (e) {} net.peer = null; }
                setPausedLocal(false);
                net.active = false; net.role = null; net.code = null;
                stopHeartbeat(); setIndicator(null);
                renderRoster();
                load();   // the 'end' handler already told the player what happened
            }
        } else if (net.active && net.code) {
            // unexpected drop: keep the session context and retry
            reconn.code = net.code;
            reconn.name = getProfile().name;
            scheduleReconnect();
        }
        // stale close events after a completed teardown are ignored
    });
}

/* ---------- host / join / leave ---------- */
function makeCode() {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    var c = '';
    for (var i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

// Direct peer-to-peer is always tried first (STUN). The TURN entries are a
// relay FALLBACK for strict-NAT networks where no direct path exists — the
// relay carries only DTLS-encrypted WebRTC traffic and can't read any of it.
// Open Relay (metered.ca) is a long-running free public TURN service; dead or
// unreachable entries are simply skipped by ICE.
var ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];
// Settings ▸ Firewall-friendly connections (wp_relayOnly): force every path through the relay.
// A direct connection attempt probes many ports in a burst, which some firewalls (Avira, Norton,
// some routers) flag as a port scan and block for minutes — dropping the player mid-join.
// With relay-only ICE the only traffic the firewall sees is one relay endpoint.
function relayOnly() { try { return localStorage.getItem('wp_relayOnly') === '1'; } catch (e) { return false; } }
function peerOpts() {
    var cfg = { iceServers: ICE_SERVERS };
    if (relayOnly()) cfg.iceTransportPolicy = 'relay';
    return { config: cfg };
}

/* Crash recovery: the last room code is remembered for a while, so a GM whose
   app died mid-session can relaunch, press Host again, and get the SAME code —
   players still in their reconnect loop reattach on their own, and everyone
   else can rejoin with the code they already have. */
var REHOST_WINDOW_MS = 15 * 60 * 1000;
function rememberHostCode(code) {
    try { localStorage.setItem('wp_lastHost', JSON.stringify({ code: code, ts: Date.now() })); } catch (e) {}
}
function forgetHostCode() { try { localStorage.removeItem('wp_lastHost'); } catch (e) {} }
function recentHostCode() {
    try {
        var j = JSON.parse(localStorage.getItem('wp_lastHost') || 'null');
        if (j && j.code && Date.now() - (j.ts || 0) < REHOST_WINDOW_MS) return j.code;
    } catch (e) {}
    return null;
}
net.recentHostCode = recentHostCode;   // sandbox testing hook

function startHosting(forceFresh) {
    if (typeof Peer === 'undefined') { toast('Multiplayer needs an internet connection.'); return; }
    leaveSession(true);
    var resumed = !forceFresh ? recentHostCode() : null;
    var code = resumed || makeCode();
    var peer = new Peer('waypoint-' + code, peerOpts());
    net.peer = peer; net.role = 'host'; net.code = code;
    setStatus((resumed ? 'Resuming host with your last room code...' : 'Starting host...') + (relayOnly() ? ' (relay-only connections)' : ''));
    peer.on('open', function() {
        net.active = true;
        startHeartbeat();
        rememberHostCode(code);
        setStatus('Hosting — room code: ' + code.toUpperCase());
        var codeEl = ui('netCode');
        if (codeEl) codeEl.textContent = code.toUpperCase();
        ui('netHostInfo').style.display = 'block';
        syncSessionButtons();
        renderRoster();
        toast(resumed ? 'Hosting resumed with the same room code — players can rejoin as before.' : 'Hosting started. Share the room code.');
    });
    peer.on('connection', function(conn) {
        net.conns.push(conn);
        wireConn(conn);
    });
    // Signaling-server blips don't touch open data channels; quietly re-register
    // so NEW players can still join after the blip.
    peer.on('disconnected', function() { if (net.active) { try { peer.reconnect(); } catch (e) {} } });
    peer.on('error', function(err) {
        if (err.type === 'unavailable-id') {
            // The old code is still registered (the dead session hasn't timed out
            // on the signaling server yet) or someone else has it: take a fresh one.
            forgetHostCode();
            if (resumed) { toast('Your last room code is still held by the old session — starting with a new code.'); }
            else toast('Code collision — trying another code.');
            try { peer.destroy(); } catch (e) {}
            setTimeout(function() { startHosting(true); }, 300);
            return;
        }
        setStatus('Host error: ' + err.type);
    });
}

function joinSession(code, name, isRetry) {
    if (typeof Peer === 'undefined') { toast('Multiplayer needs an internet connection.'); return; }
    leaveSession(true);
    var profile = setProfileName(name || getProfile().name || 'Player');
    net.myId = profile.id;
    var peer = new Peer(peerOpts());
    net.peer = peer; net.role = 'client'; net.code = code;
    if (!isRetry) setStatus('Connecting to ' + code.toUpperCase() + '...');
    peer.on('open', function() {
        var conn = peer.connect('waypoint-' + code.toLowerCase(), { reliable: true });
        net.conns = [conn];
        conn.on('open', function() {
            var wasRetry = reconn.pending;
            cancelReconnect();
            net.active = true;
            startHeartbeat();
            renderRoster();
            var pwIn = ui('netJoinPassInput');
            conn.send({ type: 'hello', profile: profile, password: pwIn ? pwIn.value.trim() : '', version: APP_VERSION });
            setStatus('Connected — waiting for campaign snapshot...');
            if (wasRetry) toast('Reconnected ✓');
        });
        wireConn(conn);
    });
    peer.on('error', function(err) {
        if (reconn.pending) {
            // a failed retry (host still down, room gone) → keep trying until the budget runs out
            try { peer.destroy(); } catch (e) {}
            scheduleReconnect();
            return;
        }
        setStatus('Connection error: ' + err.type);
        toast('Could not reach that room (' + err.type + ').');
    });
}

function leaveSession(silent) {
    var wasClient = net.active && net.role === 'client';
    var wasHost = net.active && net.role === 'host';
    if (!silent && net.active && net.role === 'host') {
        broadcast({ type: 'end' }, null);   // give players a clean "session ended" instead of a silent drop
        forgetHostCode();                   // a deliberate end retires the code; only a crash keeps it for resume
    }
    if (!silent && wasClient) net.leaving = true;
    if (!silent) cancelReconnect();
    if (net.peer) { try { net.peer.destroy(); } catch (e) {} }
    net.peer = null; net.conns = []; net.roster = {}; net.active = false; net.role = null; net.code = null; net.lastStage = null;
    stopHeartbeat();
    if (!silent) setIndicator(null);
    setPausedLocal(false);
    bannedIds = {}; pendingJoins = []; approvalOpen = false;   // bans and pending approvals are per-session
    var hi = ui('netHostInfo');
    if (hi) hi.style.display = 'none';
    renderRoster();
    if (!silent) {
        net.stageOverride = null;
        setStatus('Not in a session.');
        toast(wasClient ? 'Left the session — restoring your own campaign.' : wasHost ? 'Session ended for everyone — the room code is retired.' : 'Left the session.');
        if (wasClient) load();
    }
    syncSessionButtons();
}

/* ---------- asset sync: clients pull images from the host over the data channel ---------- */
var assetCache = {};    // path -> blob URL
var assetPending = {};  // path -> true
var assetRenderTimer = null;

function assetMime(path) {
    var ext = (path.split('.').pop() || '').toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
}

// Resolve an image path for display. Host/solo: the path itself.
// Client in a session: cached blob URL, requesting it from the host if new.
net.assetSrc = function(path) {
    if (!path || !net.active || net.role !== 'client') return path;
    if (/^(data:|blob:)/.test(path)) return path;   // already self-contained
    if (assetCache[path]) return assetCache[path];
    if (!assetPending[path] && net.conns[0] && net.conns[0].open) {
        assetPending[path] = true;
        try { net.conns[0].send({ type: 'asset-req', path: path }); } catch (e) {}
    }
    // transparent 1px placeholder until the bytes arrive
    return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
};

function handleAssetRequest(msg, conn) {
    // Serve only campaign images, never arbitrary paths
    if (typeof msg.path !== 'string' || msg.path.indexOf('/saves/images/') !== 0 || msg.path.indexOf('..') !== -1) return;
    fetch(msg.path).then(function(r) { return r.ok ? r.arrayBuffer() : null; }).then(function(buf) {
        if (!buf || !conn.open) return;
        try { conn.send({ type: 'asset', path: msg.path, mime: assetMime(msg.path), data: new Uint8Array(buf) }); } catch (e) {}
    }).catch(function() {});
}

function handleAssetArrival(msg) {
    if (!msg.path || !msg.data) return;
    try {
        var blob = new Blob([msg.data], { type: msg.mime || assetMime(msg.path) });
        assetCache[msg.path] = URL.createObjectURL(blob);
    } catch (e) { return; }
    delete assetPending[msg.path];
    clearTimeout(assetRenderTimer);
    assetRenderTimer = setTimeout(function() { if (state.viewMode === 'visual') render(); }, 150);
}

/* ---------- table chat ---------- */
var chatLog = [];   // {from:{id,name}, text, scope:'global'|'whisper', ts}
var chatUnread = 0;

function escText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Stable per-player color from their id
function playerHue(id) {
    var h = 0;
    for (var i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
}
function playerColor(from) {
    if (from.gm) return 'var(--gold)';
    return 'hsl(' + playerHue(from.id) + ', 55%, 68%)';
}
function chatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}
function renderChat() {
    var log = ui('chatLog');
    if (!log) return;
    log.innerHTML = chatLog.map(function(m) {
        var who = m.from.id === net.myId ? 'You' : escText(m.from.name || 'Player');
        var gmBadge = m.from.gm ? ' <span style="background:var(--gold); color:#1a1a22; font-size:9px; padding:0 4px; border-radius:3px; font-weight:700; vertical-align:1px;">GM</span>' : '';
        var whisper = m.scope === 'whisper';
        var wrapStyle = whisper
            ? 'margin-bottom:7px; border-left:2px solid var(--violet); padding-left:7px; font-style:italic;'
            : 'margin-bottom:7px;';
        var tag = whisper ? ' <span style="color:var(--violet); font-size:10px; font-style:normal;">whisper</span>' : '';
        return '<div style="' + wrapStyle + '"><b style="color:' + playerColor(m.from) + ';">' + who + '</b>' + gmBadge + tag +
            ' <span style="color:var(--dim); font-size:10px; float:right;">' + chatTime(m.ts) + '</span><br>' + escText(m.text) + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;
    var badge = ui('chatBadge');
    if (badge) {
        badge.style.display = chatUnread > 0 ? 'block' : 'none';
        badge.textContent = chatUnread;
    }
}
function pushChat(m) {
    chatLog.push(m);
    if (chatLog.length > 200) chatLog.shift();
    var panel = ui('chatPanel');
    if (!panel || panel.style.display === 'none') {
        if (m.from.id !== net.myId) {
            chatUnread++;
            toast((m.from.gm ? 'GM' : (m.from.name || 'Player')) + (m.scope === 'whisper' ? ' (private): ' : ': ') + m.text.slice(0, 60));
        }
    }
    renderChat();
}
function refreshChatRecipients() {
    var sel = ui('chatTo');
    if (!sel) return;
    if (net.role !== 'host') { sel.style.display = 'none'; return; }
    sel.style.display = 'block';
    var cur = sel.value;
    sel.innerHTML = '<option value="">Everyone</option>' + Object.entries(net.roster).map(function(e) {
        return '<option value="' + e[0] + '">Whisper: ' + escText(e[1].name || e[1].id) + '</option>';
    }).join('');
    sel.value = cur;
}
function sendChat() {
    var input = ui('chatInput');
    var text = (input.value || '').trim();
    if (!text) return;
    if (!net.active) { toast('Chat needs an active multiplayer session.'); return; }
    input.value = '';
    var me = getProfile();
    var msg = { type: 'chat', scope: 'global', from: { id: net.myId, name: me.name || (net.role === 'host' ? 'GM' : 'Player'), gm: net.role === 'host' }, text: text, ts: Date.now() };
    if (net.role === 'host') {
        var toKey = ui('chatTo') ? ui('chatTo').value : '';
        if (toKey) {
            msg.scope = 'whisper';
            var target = net.conns.find(function(c) { return c.peer === toKey; });
            if (target && target.open) { try { target.send(msg); } catch (e) {} }
        } else {
            broadcast(msg, null);
        }
    } else {
        broadcast(msg, null); // client's only conn is the host, which relays
    }
    pushChat(msg);
}

var _chatBtn = ui('chatBtn');
if (_chatBtn) _chatBtn.addEventListener('click', function() {
    var panel = ui('chatPanel');
    var opening = panel.style.display === 'none';
    panel.style.display = opening ? 'flex' : 'none';
    if (opening) { chatUnread = 0; refreshChatRecipients(); renderChat(); var i = ui('chatInput'); if (i) i.focus(); }
});
var _chatClose = ui('chatCloseBtn');
if (_chatClose) _chatClose.addEventListener('click', function() { ui('chatPanel').style.display = 'none'; });
var _chatSend = ui('chatSendBtn');
if (_chatSend) _chatSend.addEventListener('click', sendChat);
var _chatInput = ui('chatInput');
if (_chatInput) _chatInput.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Enter') sendChat(); });

/* ---------- player history & ban list ---------- */
function fmtDay(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

function renderPlayersPanel() {
    var list = ui('playersList');
    if (!list) return;
    var camp = getActiveCampaign();
    if (!camp) { list.innerHTML = '<div class="players-empty">No campaign open.</div>'; return; }
    var players = camp.players || {};
    var bans = camp.bannedPlayers || {};
    var online = {};
    Object.values(net.roster).forEach(function(p) { if (p) online[p.id] = true; });

    var html = '';
    var ids = Object.keys(players);
    html += '<div class="players-section">Known players (' + ids.length + ')</div>';
    if (!ids.length) html += '<div class="players-empty">No one has joined this campaign yet.</div>';
    ids.sort(function(a, b) { return (players[b].lastSeen || 0) - (players[a].lastSeen || 0); });
    ids.forEach(function(pid) {
        var p = players[pid];
        var isBanned = !!bans[pid];
        html += '<div class="player-row' + (isBanned ? ' banned' : '') + '">' +
            '<span class="roster-dot" style="background:hsl(' + playerHue(pid) + ',55%,60%);">' + escTextRoster((p.name || '?')[0].toUpperCase()) + '</span>' +
            '<div class="player-info">' +
                '<div><b>' + escTextRoster(p.name || pid) + '</b>' +
                (online[pid] ? ' <span class="player-online">● online</span>' : '') +
                (isBanned ? ' <span class="player-bantag">BANNED</span>' : '') +
                (p.charName ? ' <span class="player-char">as ' + escTextRoster(p.charName) + '</span>' : '') + '</div>' +
                '<div class="player-meta">first ' + fmtDay(p.firstSeen) + ' · last ' + fmtDay(p.lastSeen) + ' · ' + (p.joinCount || 0) + ' join' + ((p.joinCount || 0) === 1 ? '' : 's') + '</div>' +
            '</div>' +
            (isBanned
                ? '<button class="tool ghost player-act" data-unban="' + pid + '">Unban</button>'
                : '<button class="tool ghost player-act" data-ban="' + pid + '">Ban</button>') +
            '<button class="tool ghost player-act" data-forget="' + pid + '" title="Remove from history — they\'ll need approval to join again">Forget</button>' +
            '</div>';
    });

    // bans for players no longer in (or never in) the history
    var strayBans = Object.keys(bans).filter(function(pid) { return !players[pid]; });
    if (strayBans.length) {
        html += '<div class="players-section">Banned (no longer in history)</div>';
        strayBans.forEach(function(pid) {
            html += '<div class="player-row banned">' +
                '<span class="roster-dot" style="background:#555;">✕</span>' +
                '<div class="player-info"><div><b>' + escTextRoster(bans[pid].name || pid) + '</b> <span class="player-bantag">BANNED</span></div>' +
                '<div class="player-meta">banned ' + fmtDay(bans[pid].bannedAt) + '</div></div>' +
                '<button class="tool ghost player-act" data-unban="' + pid + '">Unban</button></div>';
        });
    }
    list.innerHTML = html;
}

var _playersBtn = ui('netPlayersBtn');
if (_playersBtn) _playersBtn.addEventListener('click', function() {
    renderPlayersPanel();
    ui('playersModal').style.display = 'flex';
});
var _playersClose = ui('playersCloseBtn');
if (_playersClose) _playersClose.addEventListener('click', function() { ui('playersModal').style.display = 'none'; });

var _playersList = ui('playersList');
if (_playersList) _playersList.addEventListener('click', function(e) {
    var btn = e.target.closest('.player-act');
    if (!btn) return;
    var camp = getActiveCampaign();
    if (!camp) return;
    if (btn.dataset.ban) {
        var pid = btn.dataset.ban;
        camp.bannedPlayers = camp.bannedPlayers || {};
        camp.bannedPlayers[pid] = { name: (camp.players[pid] || {}).name || pid, bannedAt: Date.now() };
        // if they're at the table right now, they leave with the ban
        if (net.active && net.role === 'host') {
            var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === pid; });
            if (key) net.kickPlayer(key);
        }
        save();
        toast((camp.bannedPlayers[pid].name || 'Player') + ' banned from this campaign.');
    } else if (btn.dataset.unban) {
        var uid2 = btn.dataset.unban;
        var nm3 = (camp.bannedPlayers && camp.bannedPlayers[uid2] && camp.bannedPlayers[uid2].name) || 'Player';
        if (camp.bannedPlayers) delete camp.bannedPlayers[uid2];
        delete bannedIds[uid2];   // an explicit unban lifts the session ban too
        save();
        toast(nm3 + ' unbanned.');
    } else if (btn.dataset.forget) {
        var fid = btn.dataset.forget;
        var nm4 = (camp.players[fid] || {}).name || 'Player';
        delete camp.players[fid];
        save();
        toast(nm4 + ' forgotten — they\'ll need approval to join again.');
    }
    renderPlayersPanel();
});

/* ---------- wire up the modal ---------- */
var _netBtn = ui('netBtn');
if (_netBtn) _netBtn.addEventListener('click', function() {
    var p = getProfile();
    var nameEl = ui('netNameInput');
    if (nameEl && !nameEl.value) nameEl.value = p.name || '';
    refreshStageSelect();
    syncSessionButtons();
    ui('netModal').style.display = 'flex';
});
var _netClose = ui('netCloseBtn');
if (_netClose) _netClose.addEventListener('click', function() { ui('netModal').style.display = 'none'; });
var _hostBtn = ui('netHostBtn');
if (_hostBtn) _hostBtn.addEventListener('click', startHosting);
var _joinBtn = ui('netJoinBtn');
if (_joinBtn) _joinBtn.addEventListener('click', function() {
    var code = (ui('netCodeInput').value || '').trim();
    if (code.length < 4) { toast('Enter the room code.'); return; }
    joinSession(code, (ui('netNameInput').value || '').trim());
});
var _leaveBtn = ui('netLeaveBtn');
if (_leaveBtn) _leaveBtn.addEventListener('click', function() { leaveSession(false); });
/* The GM gets one clear "End Session for Everyone" (the host's Leave was the same
   teardown, but its label read like a player's exit). Players keep Leave Session. */
function syncSessionButtons() {
    var hosting = !!(net.active && net.role === 'host');
    var endB = ui('netEndBtn'), leaveB = ui('netLeaveBtn');
    if (endB) endB.style.display = hosting ? 'block' : 'none';
    if (leaveB) leaveB.style.display = hosting ? 'none' : 'block';
}
var _endBtn = ui('netEndBtn');
if (_endBtn) _endBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') { syncSessionButtons(); return; }
    var n = net.conns.length;
    import('./dialogs.js').then(function(d) {
        d.showConfirm('End the session for everyone?' + (n ? ' ' + n + ' player' + (n === 1 ? '' : 's') + ' will be told the session ended and returned to their own campaigns.' : '') + ' The room code is retired.', function() {
            leaveSession(false);
            ui('netModal').style.display = 'none';
        });
    });
});
syncSessionButtons();
var _summonBtn = ui('netSummonBtn');
if (_summonBtn) _summonBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    var stage = currentStage();
    if (!stage) return;
    net.conns.forEach(function(c) {
        var p = net.roster[c.peer];
        if (p) { p.detached = false; p.location = stage.itemId; ensurePlayerToken(p.id, stage.itemId); }
        if (c.open) { try { c.send({ type: 'stage', stage: stage }); } catch (e) {} }
    });
    renderRoster();
    broadcastRoster();
    toast('All players summoned to your map.');
});
var _copyBtn = ui('netCopyBtn');
if (_copyBtn) _copyBtn.addEventListener('click', function() {
    if (net.code && navigator.clipboard) { navigator.clipboard.writeText(net.code.toUpperCase()); toast('Room code copied.'); }
});

export { net };
