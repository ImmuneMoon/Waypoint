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
import { getActiveCampaign, findLandingRoom, landingPoint, getActiveMap } from './models.js';
import { save, toast, load } from './io.js';
import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';
import { showConfirm } from './dialogs.js';

/* ---------- version gate ----------
   The join handshake carries the player's app version. A host turns away anyone
   older than itself (or anyone who sends no version — every build before 1.1.2)
   with a plain "update Waypoint" message, so a table never runs mixed versions. */
var APP_VERSION = null;
var newerSeen = {};   // player versions newer than ours that the GM has already been told about this session
// The shell's /api/version (older shells report only their own package.json) and the app folder's
// own version.json: the newer wins. After a hot update on an old shell only version.json moved.
window.wpVersionReady = Promise.all([
    fetch('/api/version').then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetch('version.json', { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; }),
]).then(function(vs) {
    var a = vs[0] && vs[0].version ? String(vs[0].version) : null;
    var b = vs[1] && vs[1].version ? String(vs[1].version) : null;
    APP_VERSION = (a && b) ? (versionCmp(b, a) > 0 ? b : a) : (a || b);
    window.wpAppVersion = APP_VERSION;
    document.dispatchEvent(new CustomEvent('wp-version', { detail: APP_VERSION }));
    return APP_VERSION;
});
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
    paused: false,       // GM froze the WHOLE table: no token moves, no travel (chat stays open)
    pausedPlayers: {},   // host: profileId -> true, players frozen individually (composes with the table pause)
    selfPaused: false,   // client: the GM froze ME specifically (distinct from the table pause)
    foreign: false       // the campaign in memory came from a host: it must never reach this machine's disk
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
// Merge a patch into the local profile, keeping the id stable and validating each field the same
// way the host does on the wire (so what we store is always safe to send). Designed to grow: a
// future website account can adopt this shape without a migration.
function setProfile(patch) {
    var p = getProfile();
    if (patch && typeof patch === 'object') {
        if (typeof patch.name === 'string') p.name = patch.name.slice(0, 40);
        if (typeof patch.color === 'string') { if (/^#[0-9a-fA-F]{6}$/.test(patch.color)) p.color = patch.color; else if (patch.color === '') delete p.color; }
        if (typeof patch.avatar === 'string') { if (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(patch.avatar) && patch.avatar.length <= 200000) p.avatar = patch.avatar; else if (patch.avatar === '') delete p.avatar; }
    }
    try { localStorage.setItem('wp_profile', JSON.stringify(p)); } catch (e) {}
    return p;
}
function setProfileName(name) { return setProfile({ name: String(name == null ? '' : name) }); }
net.getProfile = getProfile; net.setProfile = setProfile; net.setProfileName = setProfileName;   // for the Settings + welcome profile editor
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
var HB_EVERY = 4000, HB_STALE = 8000, HB_DEAD = 20000;   // silence → "not responding" at 8 s, dropped at 20 s
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
// Where each player was last seen, for presence after they leave. Host: from the campaign record
// (kept in step with the roster); client: from the last roster broadcast.
net.away = {};
function awayMap() {
    if (net.role !== 'host') return net.away || {};
    var camp = getActiveCampaign(), out = {};
    if (camp && camp.players) Object.keys(camp.players).forEach(function(pid) { if (camp.players[pid] && camp.players[pid].lastMap) out[pid] = camp.players[pid].lastMap; });
    return out;
}
function syncLastMaps() {
    if (net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    camp.players = camp.players || {};
    Object.values(net.roster).forEach(function(p) {
        if (!p || !p.id || !p.location) return;
        camp.players[p.id] = camp.players[p.id] || { name: p.name || p.id };
        camp.players[p.id].lastMap = p.location;
    });
}
// Who is on a given map — for the Maps sidebar presence dots. Connected players (live) plus
// registered players last seen there (persisted after they leave). GM-side only: camp.players is
// stripped for players, and net.roster is the host's. Each: { id, name, avatar, connected, hue }.
net.playersOnMap = function(mapId) {
    if (!mapId) return [];
    var out = [], seen = {};
    Object.values(net.roster || {}).forEach(function(p) {
        if (p && p.id && p.location === mapId) { out.push({ id: p.id, name: p.name || p.id, avatar: p.avatar, connected: true, hue: playerHue(p.id), color: p.color || null }); seen[p.id] = 1; }
    });
    var camp = getActiveCampaign();
    if (camp && camp.players) Object.keys(camp.players).forEach(function(pid) {
        var rec = camp.players[pid];
        if (rec && !seen[pid] && rec.lastMap === mapId) out.push({ id: pid, name: rec.name || pid, avatar: null, connected: false, hue: playerHue(pid), color: rec.color || null });
    });
    return out;
};
function renderRoster() {
    syncLastMaps();
    updateSidebarNav();   // keep the Maps sidebar presence dots in step with the roster
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
                    : '<img class="roster-avatar" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color || ('hsl(' + playerHue(p.id) + ',55%,60%)')) : '') + '" alt="">';   // no photo → the color-tinted silhouette default
                var peerKey = Object.keys(net.roster).find(function(k) { return net.roster[k] === p; });
                var kick = net.role === 'host'
                    ? '<button class="roster-summon" data-summon="' + peerKey + '" title="Summon this player to the map you are on">&#128227;</button>' +
                      '<button class="roster-kick" data-kick="' + peerKey + '" title="Remove this player (they stay out for the rest of the session)">&times;</button>'
                    : '';
                var staleMark = p.stale ? '<span class="roster-stale-mark" title="Not responding — will be dropped if silence continues">&#9203;</span>' : '';
                return '<span class="roster-chip' + (p.stale ? ' roster-stale' : '') + '"' + jump + '>' + face +
                    '<span>' + name + '</span>' + staleMark + sub + kick + '</span>';
            }).join('');
        }
    }
    if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();   // the party strip mirrors who is connected
    var badge = ui('netBtn');
    if (badge) badge.classList.toggle('net-live', net.active);
    // Spectator chrome stays while a host's campaign is on screen, connected or not (net.foreign)
    document.body.classList.toggle('net-client', (net.active && net.role === 'client') || !!net.foreign);
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
    var summonBtn = e.target.closest('[data-summon]');
    if (summonBtn && net.role === 'host') {
        e.stopPropagation();
        net.summonPlayer(summonBtn.dataset.summon);
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
// Token stance from a player: a finite elevation in yards, a posture from the seven
var POSTURE_SET = { standing: 1, crouching: 1, sitting: 1, kneeling: 1, crawling: 1, 'lying-prone': 1, 'lying-face-up': 1 };
var POSTURE_OLD = { prone: 'lying-prone', supine: 'lying-face-up' };   // 1.4.6 pre-release ids, still read
function cleanElevation(v) { v = Math.round(Number(v) * 10) / 10; return isFinite(v) ? Math.max(-999, Math.min(999, v)) : 0; }
function cleanPosture(v) { v = String(v || 'standing').toLowerCase(); v = POSTURE_OLD[v] || v; return POSTURE_SET[v] ? v : 'standing'; }
function sanitizeItem(item) {
    if (!item) return item;
    if (item.type === 'planner') return null;
    if (item.type === 'doc') return window.wpDocRender ? window.wpDocRender.cleanDoc(item) : null;   // GM-only pages and unknown block types never leave the host; without the renderer, no page at all
    if (item.type !== 'map') return item;
    var m = JSON.parse(JSON.stringify(item));
    // fog of war (1.5.0 FV2): map.fog travels so a player's client can paint its own-vision overlay; the host
    // separately DROPS the creatures a recipient cannot see (fogFilterClean, per recipient) before each send.
    (m.rooms || []).forEach(function(r) {
        delete r.notes;
        delete r.handoutId;
        (r.characters || []).forEach(function(c) { delete c.info; delete c.ref; });
    });
    // link labels are visible; link notes are GM prep
    m.links = (m.links || []).map(function(lk) {
        if (!(lk[3] && typeof lk[3] === 'object')) return lk;
        var keep = lk.slice(0, 3); if (lk[3].label) keep.push({ label: lk[3].label }); return keep;
    });
    m.whiteboard = (m.whiteboard || []).filter(function(w) { return !w.gmNoteFor; }).map(function(w) {
        if (!w.hidden) {
            // attached character sheets are GM bookkeeping (and heavy) — never on the wire
            if (w.sheet || w.gmInfo) { w = JSON.parse(JSON.stringify(w)); delete w.sheet; delete w.gmInfo; }   // attached sheets AND the per-token GM note/dialogue are GM prep — never on the wire
            return w;
        }
        return { id: w.id, type: 'rect', hidden: true, x: w.x, y: w.y, w: w.w, h: w.h, rot: w.rot || 0, layer: w.layer, locked: true };
    });
    return m;
}
/* ---------- fog of war (1.5.0 FV2): per-recipient creature drop ----------
   window.wpFog.fogDropIds(recipientId, camp, map) → the ids of character tokens the recipient cannot see, or null
   (no fog / drop nothing). sanitizeItem clones the heavy map ONCE; fogFilterClean makes a cheap shallow copy with a
   filtered whiteboard per peer (never re-cloning images — §11R-5). AND with the existing hidden stub: an unseen token
   is dropped whether it was full or a hidden stub, matched by id. */
function fogDrop(camp, map, recipientId) { return (window.wpFog && recipientId && camp && map) ? window.wpFog.fogDropIds(recipientId, camp, map) : null; }
function fogFilterClean(clean, dropSet) {
    if (!dropSet || !clean || clean.type !== 'map' || !Array.isArray(clean.whiteboard)) return clean;
    var kept = clean.whiteboard.filter(function(w) { return !dropSet[w.id]; });
    if (kept.length === clean.whiteboard.length) return clean;
    var copy = {}; for (var k in clean) copy[k] = clean[k]; copy.whiteboard = kept; return copy;
}
// Is any map in the hosted campaign fogged? While false, every per-recipient loop below stays on the old single-broadcast path.
function anyFog(camp) {
    if (!window.wpFog || !window.wpVtt || !window.wpVtt.on('fog') || !camp || !camp.items) return false;
    return Object.keys(camp.items).some(function(id) { var it = camp.items[id]; return !!(it && it.type === 'map' && it.fog && it.fog.on); });
}
function sanitizeAppState(s, recipientId) {   // recipientId: the player this copy is for (characters are per recipient); absent = nobody's (the stream window)
    var c = JSON.parse(JSON.stringify(s));
    delete c.imageCats;   // the GM's picture-library categories
    delete c._foreign; delete c._cleanup; delete c._picsV;   // origin marker, cleanup notes and the picture-category migration marker stay on this machine
    Object.values(c.campaigns || {}).forEach(function(camp) {
        delete camp._foreign; delete camp._keptByUser;
        // GM bookkeeping: the player registry, history, and ban list never ship
        delete camp.players;
        delete camp.bannedPlayers;
        delete camp.handouts;
        delete camp.handoutReveals;
        delete camp.handoutLog;
        delete camp.cast;
        delete camp.pinnedMaps;
        delete camp.sessionLog;
        delete camp.pictures; delete camp.imageCats;   // the picture library's per-campaign bookkeeping (1.5.0)
        delete camp.sounds;   // the sound index (1.5.0): the hosted campaign's playable list goes as its own message, validated on arrival
        if (window.wpDocRender && window.wpDocRender.cleanDocStyle) { var _cds = window.wpDocRender.cleanDocStyle(camp.docStyle); if (_cds) camp.docStyle = _cds; else delete camp.docStyle; }   // the campaign's document appearance travels (validated: fonts from the list, hex colors) so a player's Handbook matches; the client re-validates at render too
        if (camp.id === c.activeCampaignId && camp.system && window.wpSystemCore && window.wpFormula) {   // character sheets (1.5.0): the hosted campaign's system travels as the players' view, GM-only fields gone
            var psys = window.wpSystemCore.cleanSystem(camp.system, { F: window.wpFormula, gmView: false }); if (psys) camp.system = psys; else delete camp.system;
        } else delete camp.system;
        if (camp.id === c.activeCampaignId && recipientId && camp.chars && camp.system && window.wpSystemCore) {   // characters (1.5.0): this recipient's own in full, other PCs' hover fields, NPCs never
            var outCh = {}; Object.keys(camp.chars).forEach(function(id) { var v = window.wpSystemCore.charFor(camp.chars[id], camp.system, recipientId); if (v) outCh[id] = v; }); camp.chars = outCh;
        } else delete camp.chars;
        // fog of war (1.5.0 FV2): the sight-field mapping + default travel for the hosted campaign, so a client resolves
        // its own sight the same way the host does (character sheets already travel per recipient above)
        if (camp.id === c.activeCampaignId && window.wpFogCore) camp.fog = window.wpFogCore.cleanCampFog(camp.fog);
        else delete camp.fog;
        Object.keys(camp.items).forEach(function(id) {
            var orig = camp.items[id];
            if (orig && orig.type === 'doc' && camp.id !== c.activeCampaignId) { delete camp.items[id]; return; }   // a session is one campaign: only the hosted campaign's pages travel
            var it = sanitizeItem(orig);
            if (it === null) { delete camp.items[id]; return; }
            if (it.type === 'map' && recipientId && camp.id === c.activeCampaignId) it = fogFilterClean(it, fogDrop(camp, orig, recipientId));   // drop the creatures this player cannot see
            camp.items[id] = it;
        });
        // a client's active item is always a map: the host's own open page or planner is not its business, and a
        // join before the GM viewed any map (stage null) lands on a map too — a page must never open the editor there
        var actS = camp.items[camp.activeItemId];
        if (!actS || actS.type !== 'map') camp.activeItemId = Object.keys(camp.items).find(function(id) { return camp.items[id].type === 'map'; }) || null;
    });
    return c;
}

/* ---------- stage (which campaign/map the table is on) ---------- */
// The GM can pin the table to a specific map ("Players arrive at" in the Host
// panel); otherwise the stage follows whatever map the GM is viewing.
net.stageOverride = null;
// "Player's last location": each player comes back to the map they were last on and arrives
// detached (a split-party start); a first-timer lands on the fallback ("New players start at",
// '' = follow the GM). The mode is offered once the campaign has somewhere to send a player back
// to, and is the default there until the GM picks otherwise for that campaign. All of it is
// session-scoped, like stageOverride.
net.stageMode = null;        // 'last', or null for the stage select's other choices
net.stageFallback = null;    // map id, or null for Follow me
net.stagePicked = {};        // campaign id -> { mode, fallback } the GM chose for it this session

// The map this player was last on in the hosted campaign, if it still exists and is open to
// players: a map the GM has locked counts as gone, like a deleted one, so the player lands on the
// fallback instead of behind the lock. The host reads only its own record here — never a
// location the client claims.
function playerLastMap(camp, pid) {
    var rec = camp && camp.players && pid ? camp.players[pid] : null;
    var it = rec && rec.lastMap ? camp.items[rec.lastMap] : null;
    return it && it.type === 'map' && !(it.meta && it.meta.playerLock) ? it.id : null;
}
function hasLastLocations(camp) {
    return !!(camp && camp.players && Object.keys(camp.players).some(function(pid) { return playerLastMap(camp, pid); }));
}
// Resolves the mode for the campaign on screen before a session: what the GM chose for it, else
// "Player's last location" when the campaign has one. Every campaign switch passes through here
// (the panel re-renders on any of them), so another campaign's mode never lingers and the GM's
// own choice per campaign comes back. Mid-session the mode changes only by the GM's hand.
function defaultStageMode(camp) {
    if (!camp || (net.active && net.role === 'host')) return;
    var pick = net.stagePicked[camp.id];
    net.stageMode = pick ? pick.mode : (hasLastLocations(camp) ? 'last' : null);
    net.stageFallback = pick ? pick.fallback : null;
}
// Where a joining player lands: under "Player's last location" their own last map, else the
// fallback map — detached either way — and otherwise the GM's stage, following as usual.
function landingFor(prof) {
    var camp = getActiveCampaign();
    if (net.stageMode === 'last' && camp) {
        var own = playerLastMap(camp, prof.id);
        if (own) return { stage: { campId: camp.id, itemId: own }, detached: true };
        var fb = net.stageFallback ? camp.items[net.stageFallback] : null;
        if (fb && fb.type === 'map') return { stage: { campId: camp.id, itemId: fb.id }, detached: true };
    }
    return { stage: currentStage(), detached: false };
}

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
    var mapOpts = maps.map(function(m) { return '<option value="' + m.id + '">' + escText((m.meta && m.meta.title) || m.id) + '</option>'; }).join('');
    defaultStageMode(camp);
    // the mode in force stays listed even if the last map it relied on has since been deleted
    var lastOpt = (hasLastLocations(camp) || net.stageMode === 'last') ? '<option value="last">Player\'s last location</option>' : '';
    sel.innerHTML = lastOpt + '<option value="">Follow me — ' + escText(followTitle) + '</option>' + mapOpts;
    sel.value = net.stageMode === 'last' ? 'last' : (net.stageOverride && camp.items[net.stageOverride]) ? net.stageOverride : '';
    // "New players start at" shows only under "Player's last location"
    var fbRow = ui('netStageFallbackRow'), fbSel = ui('netStageFallbackSelect');
    if (fbRow) fbRow.style.display = net.stageMode === 'last' ? '' : 'none';
    if (fbSel && net.stageMode === 'last') {
        fbSel.innerHTML = '<option value="">Follow me — ' + escText(followTitle) + '</option>' + mapOpts;
        fbSel.value = (net.stageFallback && camp.items[net.stageFallback]) ? net.stageFallback : '';
    }
}

var _campSel = ui('netCampSelect');
if (_campSel) _campSel.addEventListener('change', function() {
    var pick = this.value;
    if (!state.appState.campaigns[pick] || pick === state.appState.activeCampaignId) return;
    // While hosting this is a campaign switch like any other: the session ends first (guardCampaignSwitch asks)
    net.guardCampaignSwitch(function() {
        state.appState.activeCampaignId = pick;
        net.stageOverride = null;   // the pinned map belonged to the previous campaign
        net.stageMode = null; net.stageFallback = null;   // so did the mode and the fallback; refreshStageSelect defaults them for this one
        net.applyingRemote = false;
        save();
        updateCampaignSelect();
        updateSidebarNav();
        render();
        if (window.appRestoreCamera) window.appRestoreCamera();
        refreshStageSelect();
        var c = getActiveCampaign();
        if (c) toast('Players will join ' + c.name + '.');
    }, refreshStageSelect);
});

var _stageSel = ui('netStageSelect');
if (_stageSel) _stageSel.addEventListener('change', function() {
    var camp = getActiveCampaign();
    var wasLast = net.stageMode === 'last';
    net.stageMode = this.value === 'last' ? 'last' : null;
    net.stageOverride = (this.value && this.value !== 'last') ? this.value : null;
    if (camp) net.stagePicked[camp.id] = { mode: net.stageMode, fallback: net.stageFallback };   // the GM chose: no more defaulting for this campaign
    refreshStageSelect();   // the fallback row appears or goes
    var hosting = net.active && net.role === 'host';
    if (net.stageMode === 'last') {
        if (hosting) {
            // connected players keep their place: the GM's browsing no longer moves them
            Object.values(net.roster).forEach(function(p) { if (p) p.detached = true; });
            renderRoster();
            broadcastRoster();
            toast('Players stay where they are; Summon All gathers them.');
        } else toast('Players will come back to the map they were last on.');
        return;
    }
    var target = net.stageOverride && camp ? camp.items[net.stageOverride] : null;
    if (hosting) {
        if (wasLast) {   // back with the GM: everyone follows again and the stage change below moves them
            Object.values(net.roster).forEach(function(p) { if (p) p.detached = false; });
            net.lastStage = null;
        }
        net.onLocalSave();   // stage key changed → followers are moved and tokens ensured
        toast(target ? 'Table pinned to ' + ((target.meta && target.meta.title) || net.stageOverride) + '.' : 'Table follows your map again.');
    } else if (target) {
        toast('Players will arrive at ' + ((target.meta && target.meta.title) || net.stageOverride) + '.');
    }
});
var _stageFbSel = ui('netStageFallbackSelect');
if (_stageFbSel) _stageFbSel.addEventListener('change', function() {
    net.stageFallback = this.value || null;
    var campF = getActiveCampaign();
    if (campF) net.stagePicked[campF.id] = { mode: net.stageMode, fallback: net.stageFallback };   // kept with the mode, per campaign
    var fbMap = net.stageFallback && campF ? campF.items[net.stageFallback] : null;
    toast(fbMap ? 'New players will start on ' + ((fbMap.meta && fbMap.meta.title) || net.stageFallback) + '.' : 'New players will follow you.');
});
function applyStage(stage) {
    if (!stage || !state.appState.campaigns[stage.campId]) return;
    var prevCampId = state.appState.activeCampaignId;
    net.applyingRemote = true;
    state.appState.activeCampaignId = stage.campId;
    var camp = state.appState.campaigns[stage.campId];
    if (camp.items[stage.itemId] && camp.items[stage.itemId].type === 'map') camp.activeItemId = stage.itemId;   // only ever a map
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
    // The host moved the table onto another campaign: for the player that is a new table (its own ceiling
    // entry, its own per-table choices, the join notice if it was never seen)
    if (prevCampId !== stage.campId && !net._snapshotting && window.wpVtt) window.wpVtt.tableChanged(prevCampId);
    if (!net._snapshotting && window.wpSettingsSync) window.wpSettingsSync();
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
    var incoming = msg.item;
    if (incoming && incoming.type === 'doc') { incoming = window.wpDocRender ? window.wpDocRender.cleanDoc(incoming, { keepHidden: true }) : null; if (!incoming) return; }   // a page is normalised before it is stored (a hostile host can send shapes, not just markup)
    if (!incoming || typeof incoming !== 'object') return;
    net.applyingRemote = true;
    camp.items[msg.itemId] = incoming;
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId && incoming.type === 'map') render();
    updateSidebarNav();
    if (incoming.type === 'doc') { try { if (window.wpDocReaderRefresh) window.wpDocReaderRefresh(msg.campId, msg.itemId); } catch (e) {} }   // never let the reader wedge applyingRemote
    if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }   // a received map may change sight-blockers (doors/walls) — recompute occlusion
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
    var sentIds = {};
    var ownStrokes = 0;
    msg.item.whiteboard.forEach(function(w) {
        if (!w || typeof w.id !== 'string') return;
        sentIds[w.id] = true;
        var lw = liveById[w.id];
        if (!lw) {
            // New item: only a drawing signed with this player's id, in a sane shape
            var stroke = playerStroke(w, profile.id);
            if (stroke && ownStrokes++ < 400) { liveItem.whiteboard.push(stroke); changed = true; }
            return;
        }
        if (lw.ownerId !== profile.id) return;   // ownership is judged on the HOST's copy
        if (lw.type === 'path' && lw.byPlayer) {
            var re = playerStroke(w, profile.id);
            if (re && JSON.stringify(re.pts) !== JSON.stringify(lw.pts) || (re && (re.x !== lw.x || re.y !== lw.y))) { Object.assign(lw, re); changed = true; }
            return;
        }
        if (lw.x !== w.x || lw.y !== w.y || (lw.rot || 0) !== (w.rot || 0) || (lw.front || 0) !== (w.front || 0)) {
            lw.x = w.x; lw.y = w.y; lw.rot = w.rot || 0; lw.front = w.front || 0;
            changed = true;
        }
        // Stance (elevation in yards, posture): the owner may set them on their own token — while the
        // patched campaign has that feature on. Off (or VTT integration off) keeps the host's value: the
        // compare below is a no-op for that field, nothing is deleted, nothing accepted. Never strip outbound.
        var _v = window.wpVtt;
        var evOn = !_v || _v.campaignOn('elevation', camp), poOn = !_v || _v.campaignOn('posture', camp);
        var elevC = evOn ? cleanElevation(w.elevation) : cleanElevation(lw.elevation),
            postC = poOn ? cleanPosture(w.posture) : cleanPosture(lw.posture);
        if ((lw.elevation || 0) !== elevC || (lw.posture || 'standing') !== postC) {
            if (elevC) lw.elevation = elevC; else delete lw.elevation;
            if (postC !== 'standing') lw.posture = postC; else delete lw.posture;
            changed = true;
        }
    });
    // A player's own drawing missing from their copy was erased by them
    var before = liveItem.whiteboard.length;
    liveItem.whiteboard = liveItem.whiteboard.filter(function(w) { return !(w.type === 'path' && w.byPlayer && w.ownerId === profile.id && !sentIds[w.id]); });
    if (liveItem.whiteboard.length !== before) changed = true;
    return changed;
}

// A drawing a player may hand the host: a freehand path signed with their id, whitelisted fields only.
function playerStroke(w, pid) {
    if (!w || w.type !== 'path' || w.ownerId !== pid || !Array.isArray(w.pts)) return null;
    if (w.pts.length < 2 || w.pts.length > 4000) return null;
    var num = function(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; };
    var pts = [];
    for (var i = 0; i < w.pts.length; i++) { var p = w.pts[i]; if (!Array.isArray(p) || p.length < 2) return null; pts.push([num(p[0], 0), num(p[1], 0)]); }
    var color = (typeof w.color === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i.test(w.color)) ? w.color : '#e9e9f0';
    var out = { id: w.id, type: 'path', x: num(w.x, 0), y: num(w.y, 0), w: Math.max(1, num(w.w, 10)), h: Math.max(1, num(w.h, 10)),
                baseW: Math.max(1, num(w.baseW, num(w.w, 10))), baseH: Math.max(1, num(w.baseH, num(w.h, 10))), z: 35, pts: pts,
                color: color, strokeWidth: Math.min(40, Math.max(1, num(w.strokeWidth, 3))), ownerId: pid, byPlayer: true };
    if (typeof w.opacity === 'number' && w.opacity >= 0 && w.opacity <= 1) out.opacity = w.opacity;
    return out;
}

function applySnapshot(msg) {
    net.applyingRemote = true;
    // Origin marker: this state came from someone else's table. Lives in the appState so it rides
    // through every copy; a marked state is never written to disk and never installed by undo.
    var mark = { at: Date.now(), gm: msg.gmId || null };
    msg.appState._foreign = mark;
    Object.values(msg.appState.campaigns || {}).forEach(function (c) { c._foreign = mark; });
    state.appState = msg.appState;
    net.foreign = true;   // cleared only when load() brings this machine's own campaign back
    // handbook pages are normalised before anything renders them, and the active item is a map (never a page: guard 1 client-side)
    Object.values(state.appState.campaigns || {}).forEach(function(cS) {
        Object.keys(cS.items || {}).forEach(function(id) {
            var itS = cS.items[id];
            if (itS && itS.type === 'doc') { var cd = window.wpDocRender ? window.wpDocRender.cleanDoc(itS, { keepHidden: true }) : null; if (cd) cS.items[id] = cd; else delete cS.items[id]; }
        });
        var actS = cS.items && cS.items[cS.activeItemId];
        if (!actS || actS.type !== 'map') cS.activeItemId = Object.keys(cS.items || {}).find(function(id) { return cS.items[id].type === 'map'; }) || null;
    });
    try { if (window.wpDocForeign) window.wpDocForeign(true); } catch (e) {}   // the reader's mermaid runs strict from here
    net.snapshotGen++;
    if (window.wpResetHistory) window.wpResetHistory();   // the pre-join state must never be re-installed while foreign
    net.applyingRemote = false;
    setPausedLocal(!!msg.paused);   // late joiners inherit a paused table
    setSelfPausedLocal(!!msg.pausedSelf);   // ...and a personal pause the GM set before they (re)joined
    setTravelLockLocal(!!msg.travelLocked);
    net.stance = cleanStance(msg.stance);
    net.sounds = null; net.soundNow = null; if (window.wpSound) window.wpSound.onSnapshot();   // the snapshot is the authority: the 'sounds' message that follows re-arms the table's sound
    if (window.wpFx) window.wpFx.onSnapshot();   // visual effects: a fresh snapshot clears any stale effect
    if (window.wpSystemCore) Object.values(state.appState.campaigns || {}).forEach(function(cs) {   // characters (1.5.0): what arrived is re-cleaned against the system that came with it
        if (!cs || !cs.chars || typeof cs.chars !== 'object') return;
        if (!cs.system) { delete cs.chars; return; }
        var cleanCh = {}; Object.keys(cs.chars).forEach(function(id) { var cc = window.wpSystemCore.cleanChar(cs.chars[id], cs.system); if (cc && cc.id === id) { cc.partial = cs.chars[id].partial === true; cleanCh[id] = cc; } }); cs.chars = cleanCh;
    });
    charSessionReset();
    net.stanceCamps = cleanStanceCamps(msg.stanceCamps);   // null from an older host: msg.stance governs every campaign
    net.targets = cleanTargets(msg.targets);
    net.combats = cleanCombats(msg.combats);
    if (window.wpRenderCombatStrip) setTimeout(function() { window.wpRenderCombatStrip(); }, 0);
    if (msg.notepad && typeof msg.notepad === 'object') applyNotepad(msg.notepad);
    if (window.wpFog) window.wpFog.invalidateVision();   // a fresh snapshot may carry a changed camp.fog (sight/vision/empty-map default); bust the mask + vision caches so the client recomputes, not reuses a stale mask
    net._snapshotting = true;   // the stage inside a snapshot is the join itself, not a table change
    try {
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
    } finally {
        net._snapshotting = false;   // a stage that throws must not leave every later stage looking like part of the join
    }
    if (window.wpSettingsSync) window.wpSettingsSync();
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
/* ---------- per-change sync (host → players) ----------
   Instead of the whole map item on every save, the host sends only what changed since the last
   thing it sent for that item: play-map items and rooms added / changed / removed (matched by id,
   compared by a quick hash), and links / meta / categories only when they differ. The snapshot at
   join is always the full state, so a delta is at worst a superset of what a player is missing; a
   player who somehow lacks the item asks for the full copy (needItem). Whole-item sends remain the
   fallback whenever a delta would not be smaller. Players → host keeps the whole-item message: the
   host filters it field by field anyway. */
var _lastSent = {};   // itemId → the sanitized item as last broadcast by this host
function uniqueIds(list) { var seen = {}; return Array.isArray(list) && list.every(function(x) { if (!x || typeof x.id !== 'string' || !x.id || seen[x.id]) return false; seen[x.id] = 1; return true; }); }
function itemDelta(itemId, clean) {
    var base = _lastSent[itemId];
    if (!base || clean.type !== base.type || (clean.type !== 'map' && clean.type !== 'doc')) return null;      // no baseline: send whole
    if (clean.type === 'doc' && !(uniqueIds(clean.blocks) && uniqueIds(base.blocks))) return null;             // block deltas key on ids
    var d = { type: 'itemDelta', itemId: itemId }, any = false;
    function coll(key) {
        var was = {}, now = {}, set = [], del = [], added = false;
        (base[key] || []).forEach(function(x) { was[x.id] = quickHash(JSON.stringify(x)); });
        (clean[key] || []).forEach(function(x) { var h = quickHash(JSON.stringify(x)); now[x.id] = 1; if (was[x.id] !== h) { set.push(x); if (was[x.id] === undefined) added = true; } });
        Object.keys(was).forEach(function(id) { if (!now[id]) del.push(id); });
        var seq = (clean[key] || []).map(function(x) { return x.id; });
        var reordered = seq.join('\n') !== (base[key] || []).map(function(x) { return x.id; }).join('\n');   // a pure re-order (an undo, a z-order move) travels too
        if (set.length || del.length || reordered) {
            d[key] = { set: set, del: del };
            if (added || del.length || reordered) d[key].order = seq;   // list order matters for stacking
            any = true;
        }
    }
    if (clean.type === 'doc') coll('blocks'); else { coll('whiteboard'); coll('rooms'); }
    ['links', 'meta', 'cats'].forEach(function(k) { if (JSON.stringify(clean[k]) !== JSON.stringify(base[k])) { d[k] = clean[k]; any = true; } });
    var known = { type: 1, id: 1, whiteboard: 1, rooms: 1, links: 1, meta: 1, cats: 1, blocks: 1 };
    var other = Object.keys(clean).concat(Object.keys(base)).some(function(k) { return !known[k] && JSON.stringify(clean[k]) !== JSON.stringify(base[k]); });
    if (other) return null;                                                     // an unusual key changed: send whole
    return any ? d : false;                                                     // false = nothing changed at all
}
function applyItemDelta(msg) {
    var camp = state.appState.campaigns[msg.campId]; if (!camp) return;
    var it = camp.items[msg.itemId];
    if (!it) { broadcast({ type: 'needItem', campId: msg.campId, itemId: msg.itemId }, null); return; }   // never had it: ask for the whole thing
    net.applyingRemote = true;
    (it.type === 'doc' ? ['blocks'] : ['whiteboard', 'rooms']).forEach(function(key) {   // a page has blocks, a map has the rest — a delta never adds the other kind
        var ch = msg[key]; if (!ch) return;
        var list = it[key] = it[key] || [];
        var at = {}; list.forEach(function(x, i) { at[x.id] = i; });
        (ch.del || []).forEach(function(id) { if (at[id] !== undefined) list[at[id]] = null; });
        (ch.set || []).forEach(function(x) { if (at[x.id] !== undefined && list[at[x.id]]) list[at[x.id]] = x; else list.push(x); });
        it[key] = list.filter(Boolean);
        if (ch.order) { var pos = {}; ch.order.forEach(function(id, i) { pos[id] = i; }); it[key].sort(function(a, b) { return (pos[a.id] === undefined ? 1e9 : pos[a.id]) - (pos[b.id] === undefined ? 1e9 : pos[b.id]); }); }
    });
    ['links', 'meta', 'cats'].forEach(function(k) { if (msg[k] !== undefined) it[k] = msg[k]; });
    if (it.type === 'doc') {   // re-normalised after every delta, then the reader (if it shows this page) follows
        var cd = window.wpDocRender ? window.wpDocRender.cleanDoc(it, { keepHidden: true }) : null;
        if (cd) camp.items[msg.itemId] = cd; else delete camp.items[msg.itemId];
        try { if (window.wpDocReaderRefresh) window.wpDocReaderRefresh(msg.campId, msg.itemId); } catch (e) {}
    }
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId && it.type === 'map') render();
    updateSidebarNav();
    if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }   // a delta may change sight-blockers (doors/walls) — recompute occlusion
    net.applyingRemote = false;
}
// Host: send one map item to the table — as a delta when one exists and is smaller, else whole.
function mapFogged(it) { return !!(it && it.type === 'map' && it.fog && it.fog.on && window.wpVtt && window.wpVtt.on('fog')); }
net.sendItem = function(campId, itemId, onlyConn) {
    var camp = state.appState.campaigns[campId], it = camp && camp.items[itemId]; if (!it) return;
    var clean = sanitizeItem(it); if (!clean) return;
    // fog of war (1.5.0 FV2): a fogged map is sent per recipient — the heavy map is cloned once (sanitizeItem), then a
    // cheap shallow copy drops each player's unseen creatures. No shared delta while fog is on (baselines differ per peer).
    if (mapFogged(it)) {
        delete _lastSent[itemId];                                                     // leaving the shared-delta path: the next non-fog send is whole
        var sendOne = function(conn) {
            var pr = net.roster[conn.peer]; if (!pr || !conn.open) return;
            var out = fogFilterClean(clean, fogDrop(camp, it, pr.id));
            try { conn.send({ type: 'item', campId: campId, itemId: itemId, item: out }); } catch (e) {}
        };
        if (onlyConn) sendOne(onlyConn); else net.conns.forEach(sendOne);
        return;
    }
    var full = { type: 'item', campId: campId, itemId: itemId, item: clean };
    if (onlyConn) { try { onlyConn.send(full); } catch (e) {} return; }              // one player asked for the whole thing
    var d = itemDelta(itemId, clean);
    if (d === false) return;                                                          // unchanged since the last send
    var msg = full;
    if (d) { d.campId = campId; if (JSON.stringify(d).length < JSON.stringify(full).length * 0.9) msg = d; }
    broadcast(msg, null);
    _lastSent[itemId] = JSON.parse(JSON.stringify(clean));
};
// Host: broadcast one whole map/item to the table, fog-filtered per recipient when it is a fogged map. Used by the many
// one-off sends (travel, summon, bring, push) that always send whole; a fogged map never leaks a creature through them.
net.broadcastItemFiltered = function(campId, itemId) {
    var camp = state.appState.campaigns[campId], it = camp && camp.items[itemId]; if (!it) return;
    var clean = sanitizeItem(it); if (!clean) return;
    if (!mapFogged(it)) { broadcast({ type: 'item', campId: campId, itemId: itemId, item: clean }, null); return; }
    net.conns.forEach(function(conn) {
        var pr = net.roster[conn.peer]; if (!pr || !conn.open) return;
        var out = fogFilterClean(clean, fogDrop(camp, it, pr.id));
        try { conn.send({ type: 'item', campId: campId, itemId: itemId, item: out }); } catch (e) {}
    });
};
// Host: an item leaves every admitted player's copy — a deleted map or planner, a page turned GM-only.
// The send baseline goes too, so the next send after off→on is whole. Never through broadcast(): admitted only.
net.itemGone = function(campId, itemId) {
    delete _lastSent[itemId];
    if (!(net.active && net.role === 'host')) return;
    var msg = { type: 'itemGone', campId: campId, itemId: itemId };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
};
net._itemDelta = itemDelta; net._applyItemDelta = applyItemDelta; net._handleMessage = handleMessage;   // sandbox testing hooks

net.onLocalSave = function() {
    if (!net.active || net.applyingRemote) return;
    if (window.wpFog) window.wpFog.invalidateVision();   // fog: a save may have moved tokens or changed fog — recompute vision on the next send
    var patch = activeItemPatch();
    if (net.role === 'host') {
        net.syncStance();   // before the item: a changed ceiling reaches players ahead of the map it applies to
        net.syncSounds();   // the sound index changed with this save? the list follows the same way
        net.syncSystem();   // and the system (character sheets), the same way
        if (patch) net.sendItem(patch.campId, patch.itemId);
        patch = null;
    }
    if (patch) {
        var hs = quickHash(JSON.stringify(patch.item));
        if (_lastPatchHash[patch.itemId] === hs) patch = null;
        else _lastPatchHash[patch.itemId] = hs;
    }
    if (patch) broadcast(patch, null);
    if (net.role === 'host') { scheduleStageFollow(); var amH = getActiveMap(); if (amH && amH.type === 'map') checkRoomHandouts(amH); }
};

/* The table follows the GM's map, but only once they have stayed on it for a moment:
   a quick detour to another map (to fetch a stray token, check a note) no longer drags
   the whole party along and back. Pinning a map in the Host panel bypasses this entirely. */
var STAGE_GRACE_MS = 3000;
var _stageTimer = null, _stageHintShown = false;
function scheduleStageFollow() {
    var stage = currentStage();
    var key = stage ? stage.campId + '/' + stage.itemId : '';
    if (!key || key === net.lastStage) return;
    if (_stageTimer) clearTimeout(_stageTimer);
    _stageTimer = setTimeout(function() {
        _stageTimer = null;
        if (!net.active || net.role !== 'host') return;
        var s2 = currentStage();
        var k2 = s2 ? s2.campId + '/' + s2.itemId : '';
        if (!k2 || k2 === net.lastStage) return;
        net.lastStage = k2;
        net.syncStance();   // a campaign switch that has not saved yet: the ceiling travels before the stage
        var moved = 0;
        // only players still following the GM are moved; detached wanderers stay put
        net.conns.forEach(function(c) {
            var p = net.roster[c.peer];
            if (p && p.detached) return;
            if (p) { p.location = s2.itemId; ensurePlayerToken(p.id, s2.itemId); moved++; }
            if (c.open) { try { c.send({ type: 'stage', stage: s2 }); } catch (e) {} }
            if (c.open && net.sendFxArrival) net.sendFxArrival(c, s2.itemId);
        });
        renderRoster();
        broadcastRoster();
        if (moved && !net.stageOverride && !_stageHintShown) {
            _stageHintShown = true;
            toast('The table followed you here (' + moved + ' player' + (moved > 1 ? 's' : '') + '). To browse maps without moving them, pin a map under Players arrive at.');
        }
    }, STAGE_GRACE_MS);
}

/* ---------- table pause ---------- */
// Applies the pause state locally (banner, dimming, button label). Only the
// host's toggle broadcasts; clients receive it via 'pause' messages/snapshot.
// Banner + buttons for BOTH the table pause and a personal (per-player) pause. A client can be
// frozen by either; the table message wins when both are on. The two table-pause buttons
// (#netPauseBtn in the panel, #sessionPauseBtn in the header) stay in step here.
function refreshPauseUi() {
    var isClient = net.role === 'client';
    var frozenMe = (net.paused || net.selfPaused) && isClient;
    var banner = ui('pauseBanner');
    if (banner) {
        banner.style.display = frozenMe ? 'block' : 'none';
        if (frozenMe) banner.textContent = net.paused
            ? '⏸️ The GM paused the table — chat is still open.'
            : '⏸️ The GM paused you — chat is still open.';
    }
    document.body.classList.toggle('net-paused', (net.paused || (net.selfPaused && isClient)) && net.active);
    var btn = ui('netPauseBtn');
    if (btn) { btn.innerHTML = net.paused ? '&#9654;&#65039; Resume the Table' : '&#9208;&#65039; Pause the Table'; btn.classList.toggle('paused', net.paused); }
    var sb = ui('sessionPauseBtn');
    if (sb) { sb.innerHTML = net.paused ? '&#9654;&#65039;' : '&#9208;&#65039;'; sb.title = net.paused ? 'Resume the table' : 'Pause the table (freeze everyone)'; sb.classList.toggle('paused', net.paused); }
}
function setPausedLocal(on) {
    net.paused = !!on;
    refreshPauseUi();
}
// client: set/clear my personal pause (from a 'pausePlayer' message or the join snapshot)
function setSelfPausedLocal(on) {
    net.selfPaused = !!on;
    refreshPauseUi();
}
// host: is this player individually paused? (composes with the table pause)
function pausedById(pid) { return !!(pid && net.pausedPlayers && net.pausedPlayers[pid]); }
function peerPaused(peer) { var p = net.roster[peer]; return !!(p && pausedById(p.id)); }
// host: freeze/thaw one player individually. Enforced host-side at every move/travel/edit gate; the
// player is told so they see a banner and stop trying. Composes with the whole-table pause.
net.pausePlayer = function(playerId, on) {
    if (!net.active || net.role !== 'host' || !playerId) return;
    net.pausedPlayers = net.pausedPlayers || {};
    if (on) net.pausedPlayers[playerId] = true; else delete net.pausedPlayers[playerId];
    var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === playerId; });
    var c = key && net.conns.find(function(x) { return x.peer === key; });
    if (c && c.open) { try { c.send({ type: 'pausePlayer', on: !!on }); } catch (e) {} }
    var nm = (key && net.roster[key] && net.roster[key].name) || 'Player';
    renderRoster();
    if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();   // mark/unmark the paused player's party-strip chip
    toast(on ? nm + ' is paused.' : nm + ' is live again.');
    logEvent('table', (on ? 'Paused ' : 'Resumed ') + nm);
};
net.isPlayerPaused = function(playerId) { return pausedById(playerId); };

/* ---------- VTT feature ceiling (Settings ▸ VTT features, per campaign) ---------- */
// The hosted campaign's VTT features (elevation, posture, minimap — vtt.js) are the most a
// player sees: sent with the snapshot (stance + stanceCamps) and again as a 'stance' message
// whenever they change. Clients keep them in session memory only — net.stance (the hosted
// campaign's flags, the 1.4.6 shape) and net.stanceCamps (one entry per campaign, so a host
// campaign switch is right even for a player the stage has not moved yet). Both live exactly as
// long as net.foreign does: load() nulls them when the player's own campaign comes back.
net.stance = null;
net.stanceCamps = null;
net.gmId = '';               // the host's profile id, from the snapshot: keys the player's per-table choices
net.syncedPeer = null;       // the connection the snapshot came from: the only peer whose 'stance' counts
net.snapshotGen = 0;         // bumped by every snapshot and every load(): a load that a snapshot overtook must not undo it
net.sounds = null;           // the table's playable sounds (a client, from the host's 'sounds' message): transport memory, null until it arrives
net.soundNow = null;         // the ambient the host reported playing, by id
net.stanceFlags = function() {
    if (window.wpVtt) return window.wpVtt.hostFlags();
    var f = { elevation: true, posture: true }; try { f.elevation = localStorage.getItem('wp_elevation') !== 'off'; f.posture = localStorage.getItem('wp_posture') !== 'off'; } catch (e) {} return f;   // vtt.js absent: the 1.4.6 keys
};
// A key absent from an older host's payload means ON — never coerce a newer feature to off
function cleanStance(s) { return window.wpVtt ? window.wpVtt.cleanFlags(s) : { elevation: !!(s && s.elevation), posture: !!(s && s.posture) }; }
function cleanStanceCamps(m) { return window.wpVtt ? window.wpVtt.cleanStanceCamps(m) : null; }
// Admitted players only: the ceiling names every campaign in the save
net.broadcastStance = function() {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign();
    var msg = { type: 'stance', flags: net.stanceFlags(), campId: camp ? camp.id : '', camps: window.wpVtt ? window.wpVtt.hostCamps() : null };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
};
// The one place the ceiling is re-sent from: every path that changes the hosted campaign or its settings
// reaches save() → onLocalSave, and the stage timer covers a switch that has not saved yet. A signature
// over the hosted campaign id and every campaign's flags keeps it quiet when nothing moved.
net._lastStanceSig = null;
net.syncStance = function() {
    if (!net.active || net.role !== 'host' || !window.wpVtt) return;
    var s = window.wpVtt.hostSig();
    if (s === net._lastStanceSig) return;
    net._lastStanceSig = s;
    net.broadcastStance();
    if (window.wpSettingsSync) window.wpSettingsSync();
};
// The hosted campaign's sounds reach the table as a list (uploads by path, bundled defaults by id, what is playing
// now): to one peer at admit, to every admitted peer on a save that changed the index, and straight from the
// library (hiding a default never passes through save()). Never broadcast(): admitted peers only. The signature
// covers the list, not the master or the playing loop — those travel as cues, and a late joiner reads them at admit.
net._lastSoundSig = null;
function soundSig(msg) { return quickHash(JSON.stringify({ c: msg.campId, l: msg.list })); }
net.soundsMessage = function() { return window.wpSound && window.wpSound.listMessage ? window.wpSound.listMessage() : null; };
net.syncSounds = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.soundsMessage(); if (!msg) return;
    var s = soundSig(msg);
    if (!force && s === net._lastSoundSig) return;
    net._lastSoundSig = s;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
};
// A cue for the table: start a loop, fire a one-shot, stop, or a volume. Ids only; the path is the entry's own on
// the player's side (a player fetches nothing a cue names).
net.sendSound = function(cue) {
    if (!net.active || net.role !== 'host' || !cue || typeof cue.act !== 'string') return;
    var msg = { type: 'sound', act: cue.act };
    if (cue.id !== undefined) msg.id = cue.id;
    if (cue.gain !== undefined) msg.gain = cue.gain;
    if (cue.fade !== undefined) msg.fade = cue.fade;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
};
// Visual effects (1.5.0, S3): a short-lived effect to the players ON THAT MAP (a stop reaches everyone); the host
// makes every effect, a player never triggers one on anyone. The renderer and the presets live in fx.js / fxcore.js.
net.sendFx = function(fx) {
    if (!net.active || net.role !== 'host' || !fx || !window.wpFxCore) return;
    var clean = window.wpFxCore.cleanFx(fx); if (!clean) return;
    var msg = {}; for (var k in clean) if (Object.prototype.hasOwnProperty.call(clean, k)) msg[k] = clean[k]; msg.type = 'fx';
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        if (clean.kind !== 'stop' && net.roster[c.peer].location !== clean.mapId) return;   // same-map reach; a stop clears everyone
        try { c.send(msg); } catch (e) {}
    });
};
net.sendFxArrival = function(conn, mapId) {   // a peer landing on a map gets its running weather / held wash
    if (!net.active || net.role !== 'host' || !conn || !conn.open || !mapId || !window.wpFx) return;
    window.wpFx.runningSet(mapId).forEach(function(m) { try { conn.send(m); } catch (e) {} });
};
// A blast thrown from a character sheet, shown to the players ON THAT MAP (item library, 1.5.0). Host only; no GM-only data.
net.broadcastBlast = function(blast, mapId) {
    if (!net.active || net.role !== 'host' || !blast) return;
    var b = { x: Number(blast.x), y: Number(blast.y), ft: Number(blast.ft), elev: Number(blast.elev) || 0, name: typeof blast.name === 'string' ? blast.name.slice(0, 60) : '', by: typeof blast.by === 'string' ? blast.by.slice(0, 60) : '' };
    if (!isFinite(b.x) || !isFinite(b.y) || !(b.ft > 0)) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var msg = { type: 'blast', campId: camp.id, mapId: mapId, blast: b };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && net.roster[c.peer].location === mapId) { try { c.send(msg); } catch (e) {} } });
};
net.broadcastBlastClear = function(mapId) {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    var msg = { type: 'blastClear', campId: camp.id, mapId: mapId };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
};
// The hosted campaign's system (character sheets) reaches the table as the players' view — GM-only fields and rolls
// gone, formulas that named them blanked — in the snapshot and on every save or editor Save that changed it (a
// signature over the clean view). Admitted peers only; null when the campaign has no system.
net._lastSystemSig = null;
net.systemMessage = function() { var camp = getActiveCampaign(); if (!camp || !window.wpSheets) return null; return { type: 'system', campId: camp.id, system: window.wpSheets.playerSystem(camp) }; };
net.syncSystem = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.systemMessage(); if (!msg) return;
    var s = quickHash(JSON.stringify(msg.system));
    if (!force && s === net._lastSystemSig) return;
    net._lastSystemSig = s;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
    net.syncChars();   // values keyed by field ids the peers now know
};
// ---------- characters (character sheets, 1.5.0): per-recipient copies, deltas, a player's edits ----------
// A player holds their own character in full (minus GM-only fields), other PCs' hover fields only, no NPCs. Every
// payload is built per peer from a fresh view; nothing a client says about a character is applied unchecked.
var charLimit = null, _doorLimit = null, _charPending = {}, _charSlowSaid = {};
function SC() { return window.wpSystemCore || null; }
function peerProfileId(c) { var p = net.roster[c.peer]; return p && p.id ? p.id : null; }
function charViewFor(charId, recipientId) {   // the copy one peer may hold, or null
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !camp.chars || !camp.chars[charId] || !window.wpSheets) return null;
    var view = window.wpSheets.playerSystem(camp); if (!view) return null;
    return S.charFor(camp.chars[charId], view, recipientId);
}
function charSessionReset() { Object.keys(_charPending).forEach(function(k) { clearTimeout(_charPending[k].timer); }); _charPending = {}; _charSlowSaid = {}; if (charLimit) charLimit.reset(); }
net.syncChars = function() {   // every character, per peer (after the system changed)
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        var pid = peerProfileId(c), outC = {};
        Object.keys(camp.chars || {}).forEach(function(id) { var v = charViewFor(id, pid); if (v) outC[id] = v; });
        try { c.send({ type: 'chars', campId: camp.id, chars: outC }); } catch (e) {}
    });
};
net.syncChar = function(id) {   // one character whole (renamed, reassigned, portrait) or gone for a peer that may not see it
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        var v = charViewFor(id, peerProfileId(c));
        try { c.send(v ? { type: 'char', campId: camp.id, char: v } : { type: 'charGone', campId: camp.id, id: id }); } catch (e) {}
    });
};
net.syncCharDelta = function(id, values) {   // changed values, filtered to what each peer may see (null = reverted to the default)
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !camp.chars || !camp.chars[id] || !window.wpSheets) return;
    var view = window.wpSheets.playerSystem(camp); if (!view) return;
    var src = camp.chars[id], probe = { id: id, name: src.name, ownerId: src.ownerId, npc: src.npc, values: {} };
    Object.keys(values).forEach(function(f) { probe.values[f] = 0; });
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        var allowed = S.charFor(probe, view, peerProfileId(c)); if (!allowed) return;
        var sub = {}, any = false;
        Object.keys(values).forEach(function(f) { if (allowed.values[f] !== undefined) { sub[f] = values[f]; any = true; } });
        if (any) { try { c.send({ type: 'charDelta', campId: camp.id, id: id, values: sub }); } catch (e) {} }
    });
};
net.syncCharGone = function(id) { if (!net.active || net.role !== 'host') return; var camp = getActiveCampaign(); if (!camp) return; net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send({ type: 'charGone', campId: camp.id, id: id }); } catch (e) {} } }); };
// A player's edit of their own sheet: applied here at once, judged on the host, undone on a refusal or silence
net.charEdit = function(charId, fieldId, value) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = camp.chars && camp.chars[charId]; if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };   // another PC's hover copy is never edited, not even optimistically
    if (!camp.system) return { error: 'No system at this table.' };
    var res = S.applyEdit(camp.system, c, fieldId, value, window.wpFormula, { player: true });
    if (!res.ok) return { error: res.reason === 'field' ? 'That field cannot be edited.' : 'That value is not allowed.' };
    var rid = 'e' + Math.random().toString(36).slice(2, 10);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, fieldId) ? JSON.parse(JSON.stringify(c.values[fieldId])) : undefined;
    c.values = c.values || {}; c.values[fieldId] = res.value;
    _charPending[rid] = { charId: charId, fieldId: fieldId, value: res.value, prev: prev, timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };
    try { net.conns[0].send({ type: 'char-edit', rid: rid, charId: charId, fieldId: fieldId, value: res.value }); } catch (e) { charPendingDone(rid, false, 'value'); return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// A player's inventory op on their own character (item-list): a per-entry add/remove/setQty, applied optimistically, judged on the host.
net.charItem = function(charId, fieldId, op, defId, qty) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = camp.chars && camp.chars[charId]; if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    if (!camp.system) return { error: 'No system at this table.' };
    var res = S.applyItemOp(camp.system, c, fieldId, op, defId, qty, { player: true });
    if (!res.ok) return { error: res.reason === 'field' ? 'That list cannot be edited.' : res.reason === 'missing' ? 'That item is gone.' : 'That change is not allowed.' };
    var rid = 'e' + Math.random().toString(36).slice(2, 10);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, fieldId) ? JSON.parse(JSON.stringify(c.values[fieldId])) : undefined;
    c.values = c.values || {}; c.values[fieldId] = res.value;
    _charPending[rid] = { charId: charId, fieldId: fieldId, value: res.value, prev: prev, timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };
    try { net.conns[0].send({ type: 'char-item', rid: rid, charId: charId, fieldId: fieldId, op: op, defId: defId, qty: qty }); } catch (e) { charPendingDone(rid, false, 'value'); return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// A player throws an item from their sheet: the host validates ownership + the carried item and places/shares the blast
// (the thrower sees nothing until the host's broadcast returns — no optimistic placement, the host is the authority).
net.throwReq = function(charId, itemId, x, y, mapId) {
    if (!net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'throw-req', charId: charId, itemId: itemId, x: Number(x), y: Number(y), mapId: mapId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
// A player requests opening/closing a door their token is next to; the host validates and resyncs (no optimistic change).
net.doorReq = function(mapId, itemId) {
    if (!net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'door-req', mapId: mapId, itemId: itemId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
function charPendingDone(rid, ok, reason) {
    var p = _charPending[rid]; if (!p) return; clearTimeout(p.timer); delete _charPending[rid];
    if (!ok) { var camp = getActiveCampaign(), c = camp && camp.chars && camp.chars[p.charId]; if (c) { c.values = c.values || {}; if (p.prev === undefined) delete c.values[p.fieldId]; else c.values[p.fieldId] = p.prev; } }
    if (window.wpSheets) { if (ok) window.wpSheets.charChanged(p.charId); else window.wpSheets.editResult(rid, false, reason); }
}
function reapplyPending(charId) { var camp = getActiveCampaign(), c = camp && camp.chars && camp.chars[charId]; if (!c) return; Object.keys(_charPending).forEach(function(rid) { var p = _charPending[rid]; if (p.charId === charId) { c.values = c.values || {}; c.values[p.fieldId] = p.value; } }); }
// A session is exactly one campaign. Anything that would put another campaign on screen while hosting
// asks first, and on yes ends the session for everyone before going ahead; Cancel and Esc do nothing.
// onCancel lets a picker put its selection back.
net.guardCampaignSwitch = function(fn, onCancel) {
    if (!(net.active && net.role === 'host')) { fn(); return; }
    showConfirm('Switching campaigns ends the session — everyone at the table is disconnected. End the session and switch?', function(yes) {
        if (!yes) { if (onCancel) onCancel(); return; }
        leaveSession(false);
        var nm = ui('netModal'); if (nm) nm.style.display = 'none';
        fn();
    });
};
window.wpConfirmCampaignSwitch = net.guardCampaignSwitch;

// Travel lock: no map crossings for players while it is on; everything else stays live
// Session log: what happened at the table, on the campaign (GM data). Saved with the next save.
function logEvent(kind, text) {
    if (net.role === 'client') return;
    var camp = getActiveCampaign(); if (!camp) return;
    camp.sessionLog = camp.sessionLog || [];
    camp.sessionLog.push({ at: Date.now(), kind: kind, text: String(text || '').slice(0, 400) });
    if (camp.sessionLog.length > 3000) camp.sessionLog.splice(0, camp.sessionLog.length - 3000);
}
net.travelLocked = false;
function setTravelLockLocal(on) {
    net.travelLocked = !!on;
    var btn = ui('netTravelLockBtn');
    if (btn) { btn.innerHTML = net.travelLocked ? '&#128275; Allow Travel Between Maps' : '&#128274; Lock Travel Between Maps'; btn.classList.toggle('paused', net.travelLocked); }
    var hint = ui('travelLockBanner');
    if (hint) hint.style.display = (net.travelLocked && net.role === 'client' && net.active) ? 'block' : 'none';
}
var _travelLockBtn = ui('netTravelLockBtn');
if (_travelLockBtn) _travelLockBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    setTravelLockLocal(!net.travelLocked);
    broadcast({ type: 'travelLock', on: net.travelLocked }, null);
    toast(net.travelLocked ? 'Travel locked — players stay on their maps. The table is still live.' : 'Travel allowed again.');
    logEvent('table', net.travelLocked ? 'Travel between maps locked' : 'Travel between maps allowed');
});
var _travelDenyLast = {};
var _pauseBtn = ui('netPauseBtn');
if (_pauseBtn) _pauseBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    setPausedLocal(!net.paused);
    broadcast({ type: 'pause', on: net.paused }, null);
    toast(net.paused ? 'Table paused — players are frozen (chat stays open).' : 'Table resumed.');
    logEvent('table', net.paused ? 'Table paused' : 'Table resumed');
});
// The header pause button (host-only, both views) drives the same table toggle as #netPauseBtn.
var _sessPauseBtn = ui('sessionPauseBtn');
if (_sessPauseBtn) _sessPauseBtn.addEventListener('click', function() { if (net.active && net.role === 'host' && _pauseBtn) _pauseBtn.click(); });

/* ---------- live position streaming ----------
   Drags send tiny {type:'pos'} messages (throttled) so remote tokens glide
   instead of jumping at drag end. The final message persists on the host. */
var _posLast = 0;

// Fog of war (1.5.0 FV2): a token's live position reaches a player only when they own the token or can see its cell.
// Non-fog maps take the plain single broadcast (byte-identical to before). canSeePoint uses a cached revealed set that is
// stable during a drag (the recipient's own tokens are still), so this stays cheap; a creature entering vision is fully
// revealed on the drag's stop (sendItem), not mid-drag.
function broadcastPos(msg, exceptConn, camp, map, w) {
    if (!map || !mapFogged(map)) { broadcast(msg, exceptConn); return; }
    var cx = (msg.x || 0) + ((w && w.w) || 60) / 2, cy = (msg.y || 0) + ((w && w.h) || 52) / 2;
    net.conns.forEach(function(c) {
        if (c === exceptConn || !c.open) return;
        var pr = net.roster[c.peer]; if (!pr) return;
        if ((w && w.ownerId === pr.id) || (window.wpFog && window.wpFog.canSeePoint(pr.id, camp, map, cx, cy))) { try { c.send(msg); } catch (e) {} }
    });
}
net.streamPos = function(wItem, final) {
    if (!net.active || !wItem) return;
    if ((net.paused || net.selfPaused) && net.role === 'client') return;
    var camp = getActiveCampaign();
    if (!camp) return;
    var now = Date.now();
    if (!final && now - _posLast < 45) return;
    _posLast = now;
    var msg = { type: 'pos', campId: camp.id, itemId: camp.activeItemId, wbId: wItem.id, x: wItem.x, y: wItem.y, rot: wItem.rot || 0, front: wItem.front || 0, final: !!final };
    if (net.role === 'host') broadcastPos(msg, null, camp, camp.items[camp.activeItemId], wItem);
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
    if (net.travelLocked) {
        var k = traveler.id || 'x', now = Date.now();
        if (conn && now - (_travelDenyLast[k] || 0) > 4000) { _travelDenyLast[k] = now; try { conn.send({ type: 'travelDenied' }); } catch (e) {} }
        return false;
    }
    if ((portal.hidden && !portal.trap) || !(portal.nodeId || portal.targetMapId)) return false;   // a hidden decorative portal stays inert; a hidden TRAP still fires (playerLock below still applies)
    // The item's own portal target, else its linked room's
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (fromMap.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !pRoom.targetMapId || !tCamp.items[pRoom.targetMapId]) return false;
    var destLockM = tCamp.items[pRoom.targetMapId];
    if (destLockM.meta && destLockM.meta.playerLock) {   // closed to players until the GM opens it (summon and bring still work)
        var kL = (traveler.id || 'x') + '|' + pRoom.targetMapId, nowL = Date.now();
        if (conn && nowL - (_travelDenyLast[kL] || 0) > 4000) { _travelDenyLast[kL] = nowL; try { conn.send({ type: 'travelDenied', reason: 'closed', map: String((destLockM.meta || {}).title || '').slice(0, 120) }); } catch (e) {} }
        return false;
    }
    var destMap = tCamp.items[pRoom.targetMapId];
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, destMap);
    if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before either map is written for the player
    traveler.location = pRoom.targetMapId;
    traveler.detached = true;
    renderRoster();
    var left = (fromMap.whiteboard || []).find(function(w) { return w.isChar && w.ownerId === traveler.id; });
    if (left) { stepOffPortal(left, portal, fromMap); net.broadcastItemFiltered(tCamp.id, fromMap.id); }
    if (left) { net.applyingRemote = true; save(true); net.applyingRemote = false; }   // the step-off reaches disk now, not on the GM's next save
    ensurePlayerToken(traveler.id, pRoom.targetMapId, landRoom && landRoom.id);
    // a token already on the destination stays where the GM left it, unless it is still on the landing node
    var landPtD = landRoom && landingPoint(destMap, landRoom), nodeEl = landPtD && landPtD.wbItemId ? (destMap.whiteboard || []).find(function(o) { return o.id === landPtD.wbItemId; }) : null;
    var mineD = nodeEl && (destMap.whiteboard || []).find(function(w) { return w.isChar && w.ownerId === traveler.id; });
    if (mineD && mineD.x < nodeEl.x + (nodeEl.w || 0) && mineD.x + (mineD.w || 60) > nodeEl.x && mineD.y < nodeEl.y + (nodeEl.h || 0) && mineD.y + (mineD.h || 52) > nodeEl.y) {
        var spotD = freeSpotNear(destMap, landPtD.wbX, landPtD.wbY, mineD.w || 60, mineD.h || 52, mineD.id, nodeEl);
        mineD.x = spotD.x; mineD.y = spotD.y;
        if (window.wpSeatHex) window.wpSeatHex(mineD, destMap);
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        net.broadcastItemFiltered(tCamp.id, destMap.id);
    }
    if (window.wpHistBarrier) window.wpHistBarrier([fromMap.id, destMap.id]);   // a move between two maps: neither side can be undone past it
    broadcastRoster();
    if (conn) { try { conn.send({ type: 'stage', personal: true, stage: { campId: tCamp.id, itemId: pRoom.targetMapId, landRoomId: landRoom ? landRoom.id : null } }); } catch (e) {} }
    var destTitle = (tCamp.items[pRoom.targetMapId].meta || {}).title || pRoom.targetMapId;
    toast((traveler.name || 'A player') + ' traveled to ' + destTitle + '.');
    logEvent('travel', (traveler.name || 'A player') + ' traveled to ' + destTitle + (pRoom && pRoom.name ? ' via ' + pRoom.name : ''));
    return true;
}

// The portal item under a token's center, if any (visible, room-linked, warp target set)
// A free top-left for a w×h token near (cx, cy): spiral outwards until it overlaps no other
// character token (and, when given, stays off the portal's footprint).
function freeSpotNear(map, cx, cy, w, h, avoidId, portal) {
    var others = (map.whiteboard || []).filter(function(o) { return o.isChar && o.id !== avoidId; });
    function seated(x, y) {   // where a token placed at (x, y) ends up after hex seating on this map
        if (!window.wpSeatHex) return { x: x, y: y };
        var tmp = { x: x, y: y, w: w, h: h, isChar: true };
        window.wpSeatHex(tmp, map);
        return { x: tmp.x, y: tmp.y };
    }
    function clashes(x, y) {
        if (portal && x < portal.x + (portal.w || 0) && x + w > portal.x && y < portal.y + (portal.h || 0) && y + h > portal.y) return true;
        return others.some(function(o) { return x < o.x + (o.w || 0) && x + w > o.x && y < o.y + (o.h || 0) && y + h > o.y; });
    }
    var step = Math.max(w, h) + 8, x0 = cx - w / 2, y0 = cy - h / 2, tried = {};
    var first = seated(x0, y0);
    if (!clashes(first.x, first.y)) return first;
    for (var ring = 1; ring <= 8; ring++) {
        for (var dy = -ring; dy <= ring; dy++) for (var dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            var p = seated(x0 + dx * step, y0 + dy * step), k = Math.round(p.x) + ',' + Math.round(p.y);
            if (tried[k]) continue; tried[k] = true;
            if (!clashes(p.x, p.y)) return p;
        }
    }
    return first;
}
// The token left behind steps off the portal so the next crossing is not blocked
function stepOffPortal(item, portal, map) {
    if (!item || !portal || !map) return;
    var w = item.w || 60, h = item.h || 52;
    var cx = portal.x + (portal.w || 0) / 2, cy = portal.y + (portal.h || 0) + h / 2 + 12;   // just below the portal
    var p = freeSpotNear(map, cx, cy, w, h, item.id, portal);
    item.x = p.x; item.y = p.y;
    if (window.wpSeatHex) window.wpSeatHex(item, map);
}
function portalUnder(item, map) {
    if (!item || !map || !map.whiteboard) return null;
    var cx = item.x + (item.w || 0) / 2, cy = item.y + (item.h || 0) / 2, iw = item.w || 60, ih = item.h || 52;
    var best = null, bestArea = Infinity;
    map.whiteboard.forEach(function(o) {
        if (o.id === item.id || !(o.nodeId || o.targetMapId) || (o.hidden && !o.trap)) return;   // a hidden TRAP portal still catches a token that lands on it
        var ow = o.w || 0, oh = o.h || 0;
        // resting on the portal: the token's centre inside it, or at least a third of the token overlapping it
        // (hex seating can park the centre a few pixels outside a tile that is not hex-aligned)
        var inside = !(cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh);
        var ovW = Math.min(item.x + iw, o.x + ow) - Math.max(item.x, o.x), ovH = Math.min(item.y + ih, o.y + oh) - Math.max(item.y, o.y);
        var frac = (ovW > 0 && ovH > 0) ? (ovW * ovH) / (iw * ih) : 0;
        if (!inside && frac < 0.34) return;
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
    if (!item || !item.isChar || !map) return false;
    if (!item.ownerId) return npcTravel(item, map);                                   // an NPC: the GM's own token, moves through
    var atTable = net.active && net.role === 'host' && Object.keys(net.roster).some(function(k) { return net.roster[k] && net.roster[k].id === item.ownerId; });
    if (!atTable) return offlinePlayerTravel(item, map);                             // between sessions, or the player is not connected: the GM walks their character through
    if (net.paused || pausedById(item.ownerId)) return false;
    var portal = portalUnder(item, map);
    if (!portal) return false;
    var peerId = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === item.ownerId; });
    if (!peerId) return false;
    var conn = net.conns.find(function(c) { return c.peer === peerId; });
    return hostTravel(conn, net.roster[peerId], portal, map);
};

// The GM walks a player's character through a portal without that player at the table: their
// copy on the destination map is placed (or nudged off the landing node), the source steps off.
function offlinePlayerTravel(item, map) {
    if (net.active && net.role === 'client') return false;
    var portal = portalUnder(item, map); if (!portal) return false;
    var camp = getActiveCampaign(); if (!camp) return false;
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (map.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !pRoom.targetMapId || !camp.items[pRoom.targetMapId]) return false;
    var dest = camp.items[pRoom.targetMapId]; if (dest.type !== 'map' || dest === map) return false;
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, dest), landPt = landRoom && landingPoint(dest, landRoom);
    var sx = (landPt && landPt.wbX != null) ? landPt.wbX : ((dest.meta || {}).homeX || 15000);
    var sy = (landPt && landPt.wbY != null) ? landPt.wbY : ((dest.meta || {}).homeY || 15000);
    var nodeEl = landPt && landPt.wbItemId ? (dest.whiteboard || []).find(function(o) { return o.id === landPt.wbItemId; }) : null;
    if (window.wpHistFlush) window.wpHistFlush();   // pending GM typing becomes its own step before the two maps are written
    dest.whiteboard = dest.whiteboard || [];
    var mineAll = dest.whiteboard.filter(function(w) { return w.isChar && w.ownerId === item.ownerId; });
    if (mineAll.length > 1) mineAll.slice(1).forEach(function(w) { delete w.ownerId; });   // one owned token per map, like ensurePlayerToken / bringPlayerHere
    var mine = mineAll[0] || null, placed = false;
    if (!mine) {
        mine = JSON.parse(JSON.stringify(item));
        mine.id = 'wb' + Math.random().toString(36).slice(2, 10);
        delete mine.hidden;
        var spot = freeSpotNear(dest, sx, sy, mine.w || 60, mine.h || 52, null, nodeEl);
        mine.x = spot.x; mine.y = spot.y;
        dest.whiteboard.push(mine); placed = true;
    } else if (nodeEl && mine.x < nodeEl.x + (nodeEl.w || 0) && mine.x + (mine.w || 60) > nodeEl.x && mine.y < nodeEl.y + (nodeEl.h || 0) && mine.y + (mine.h || 52) > nodeEl.y) {
        var spot2 = freeSpotNear(dest, sx, sy, mine.w || 60, mine.h || 52, mine.id, nodeEl);
        mine.x = spot2.x; mine.y = spot2.y;
    }
    stepOffPortal(item, portal, map);
    if (window.wpHistBarrier) window.wpHistBarrier([map.id, dest.id]);   // a move between two maps: neither side can be undone past it
    net.applyingRemote = true; save(true); net.applyingRemote = false;
    if (net.active && net.role === 'host') [map, dest].forEach(function(m) { net.broadcastItemFiltered(camp.id, m.id); });
    if (window.appRender) window.appRender();
    var who = (camp.players || {})[item.ownerId], nm = item.charName || (who && who.name) || 'The character';
    toast(nm + ' goes through to ' + ((dest.meta || {}).title || 'the next map') + (placed ? ' — their token waits there.' : ' — their token there stays where it was.'));
    return true;
}
// An NPC token dropped on a portal moves to the destination map (it has no per-map copies)
function npcTravel(item, map) {
    if (net.active && net.role === 'client') return false;
    var portal = portalUnder(item, map); if (!portal) return false;
    var camp = getActiveCampaign(); if (!camp) return false;
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (map.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !pRoom.targetMapId || !camp.items[pRoom.targetMapId]) return false;
    var dest = camp.items[pRoom.targetMapId]; if (dest.type !== 'map' || dest === map) return false;
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, dest), landPt = landRoom && landingPoint(dest, landRoom);
    var sx = (landPt && landPt.wbX != null) ? landPt.wbX : ((dest.meta || {}).homeX || 15000);
    var sy = (landPt && landPt.wbY != null) ? landPt.wbY : ((dest.meta || {}).homeY || 15000);
    var nodeEl = landPt && landPt.wbItemId ? (dest.whiteboard || []).find(function(o) { return o.id === landPt.wbItemId; }) : null;
    if (window.wpHistFlush) window.wpHistFlush();   // pending GM typing becomes its own step before the two maps are written
    dest.whiteboard = dest.whiteboard || [];
    var key = item.charName || '';
    var there = key ? dest.whiteboard.find(function(w) { return w.isChar && !w.ownerId && w.charName === key; }) : null, placed = false;
    if (!there) {
        there = JSON.parse(JSON.stringify(item));
        there.id = 'wb' + Math.random().toString(36).slice(2, 10);
        delete there.hidden;
        var spot = freeSpotNear(dest, sx, sy, there.w || 60, there.h || 52, null, nodeEl);
        there.x = spot.x; there.y = spot.y;
        dest.whiteboard.push(there); placed = true;
    } else {
        delete there.hidden;   // the character is there now: players may see it
        if (nodeEl && there.x < nodeEl.x + (nodeEl.w || 0) && there.x + (there.w || 60) > nodeEl.x && there.y < nodeEl.y + (nodeEl.h || 0) && there.y + (there.h || 52) > nodeEl.y) {
            var spot2 = freeSpotNear(dest, sx, sy, there.w || 60, there.h || 52, there.id, nodeEl);
            there.x = spot2.x; there.y = spot2.y;
        }
    }
    // the token left behind stays in its room, off the portal, out of the players' sight
    stepOffPortal(item, portal, map);
    item.hidden = true;
    if (window.wpHistBarrier) window.wpHistBarrier([map.id, dest.id]);   // a move between two maps: neither side can be undone past it
    net.applyingRemote = true; save(true); net.applyingRemote = false;
    if (net.active && net.role === 'host') [map, dest].forEach(function(m) { net.broadcastItemFiltered(camp.id, m.id); });
    if (window.appRender) window.appRender();
    toast((key || 'The character') + ' goes through to ' + ((dest.meta || {}).title || 'the next map') + (placed ? ' — a token is placed there' : ' — the token there is shown') + '; the one here is hidden from players.');
    return true;
}
function handlePos(msg, conn) {
    var camp = state.appState.campaigns[msg.campId];
    var map = camp && camp.items[msg.itemId];
    if (!map || map.type !== 'map') return;
    var w = (map.whiteboard || []).find(function(x) { return x.id === msg.wbId; });
    if (!w) return;
    if (net.role === 'host') {
        if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): client motion is dropped
        var pr = net.roster[conn.peer];
        if (!pr || w.ownerId !== pr.id) return;   // same ownership rule as full patches
        if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before the player's move lands
        w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;
        if (msg.final) setTimeout(function() { checkRoomHandouts(map); }, 50);
        // Host is the authority on cells: seat the token here too, in case the
        // player's copy didn't (grid state not yet applied on their side)
        if (msg.final && window.wpSeatHex && window.wpSeatHex(w, map)) { msg = Object.assign({}, msg, { x: w.x, y: w.y }); }
        applyPosToDom(msg);
        broadcastPos(msg, conn, camp, map, w);
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
    if (net.paused || net.selfPaused) { toast(net.selfPaused && !net.paused ? 'The GM has paused you.' : 'The table is paused.'); return; }
    try { net.conns[0].send({ type: 'travel', viaItemId: viaItemId }); } catch (e) {}
};

function broadcastRoster() { broadcast({ type: 'roster', roster: net.roster, away: awayMap() }, null); }

// Is this player currently on the given map? (self is always present to itself)
net.refreshUi = function() {               // own campaign is back: spectator class, party strip, badge, and the host picker lists only own campaigns
    renderRoster();
    if (!net.active) refreshStageSelect();
    syncSessionButtons();
};
net.sanitizeAppState = sanitizeAppState;   // the stream window shows exactly what players may see
net.applyStage = applyStage;
/* ---------- targeting ----------
   net.targets: playerId -> { id, mapId, name }. Clients send { type:'target' }; the host keeps
   the table's map of targets and broadcasts { type:'targets' } to everyone after each change,
   and hands the current map to late joiners in the snapshot. A target is a pointer, nothing
   more: it never changes the token it points at. */
net.targets = {};
/* ---------- table notepad ----------
   A disposable pad the GM opens for the table: everyone sees it live, anyone can save it to their
   Journal, and it is gone when the GM puts it away or the session ends. Never saved with the campaign. */
net.notepad = { on: false, text: '' };
var notepadTimer = null;
function notepadMsg() {
    var camp = getActiveCampaign() || {};
    return { type: 'notepad', on: !!net.notepad.on, text: String(net.notepad.text || '').slice(0, 20000), campId: camp.id || '', gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM' };
}
function renderNotepad() {
    var p = ui('notepadPanel'), ta = ui('notepadText'); if (!p || !ta) return;
    var on = net.active && net.notepad.on;
    p.style.display = on ? 'flex' : 'none';
    if (!on) return;
    var host = net.role === 'host';
    ta.readOnly = !host;
    ta.placeholder = host ? 'Notes for the whole table — everyone sees this as you type. Gone when you put it away or the session ends; anyone can save it to their Journal.' : 'The GM has not written anything yet.';
    if (document.activeElement !== ta && ta.value !== net.notepad.text) ta.value = net.notepad.text || '';
    var close = ui('notepadCloseBtn'); if (close) close.style.display = host ? '' : 'none';
    var clr = ui('notepadClearBtn'); if (clr) clr.style.display = host ? '' : 'none';
    var who = ui('notepadWho'); if (who) who.textContent = host ? 'everyone at the table sees this' : 'written by ' + (net.notepad.gm || 'the GM');
}
window.wpRenderNotepad = renderNotepad;
net.notepadToggle = function() {
    if (net.role !== 'host') return;
    if (net.notepad.on) {
        var has = String(net.notepad.text || '').trim();
        showConfirm('Put the table notepad away? ' + (has ? 'Its text goes for everyone who has not saved it to their Journal.' : 'It is empty.'), function(yes) {
            if (!yes) return;
            net.notepad = { on: false, text: '' };
            broadcast(notepadMsg(), null); renderNotepad(); toast('Notepad put away.');
            logEvent('table', 'Table notepad put away');
        });
    } else {
        net.notepad.on = true;
        broadcast(notepadMsg(), null); renderNotepad(); toast('Table notepad open — everyone sees it.');
        logEvent('table', 'Table notepad opened');
        var ta = ui('notepadText'); if (ta) setTimeout(function() { ta.focus(); }, 50);
    }
};
net.notepadInput = function(text) {
    if (net.role !== 'host' || !net.notepad.on) return;
    net.notepad.text = String(text || '').slice(0, 20000);
    clearTimeout(notepadTimer);
    notepadTimer = setTimeout(function() { broadcast(notepadMsg(), null); }, 250);
};
(function() {
    var ta = ui('notepadText'), close = ui('notepadCloseBtn'), saveB = ui('notepadSaveBtn'), minB = ui('notepadMinBtn'), p = ui('notepadPanel'), head = ui('notepadHead');
    if (!ta) return;
    ta.addEventListener('input', function() { net.notepadInput(ta.value); });
    ta.addEventListener('keydown', function(e) { e.stopPropagation(); });
    if (close) close.addEventListener('click', function() { net.notepadToggle(); });
    var clearB = ui('notepadClearBtn');
    if (clearB) clearB.addEventListener('click', function() {
        if (net.role !== 'host' || !net.notepad.on) return;
        if (!String(net.notepad.text || ta.value || '').trim()) { toast('The notepad is already empty.'); return; }
        showConfirm('Clear the table notepad? The text goes for everyone who has not saved it to their Journal. The notepad stays open.', function(yes) {
            if (!yes) return;
            clearTimeout(notepadTimer);
            net.notepad.text = ''; ta.value = '';
            broadcast(notepadMsg(), null); renderNotepad(); toast('Notepad cleared.');
            logEvent('table', 'Table notepad cleared');
        });
    });
    if (minB) minB.addEventListener('click', function() { p.classList.toggle('min'); minB.textContent = p.classList.contains('min') ? '\u25B4' : '\u25BE'; });
    if (saveB) saveB.addEventListener('click', function() {
        var text = net.role === 'host' ? ta.value : (net.notepad.text || '');
        if (!String(text).trim()) { toast('Nothing on the notepad yet.'); return; }
        var meta = net.role === 'host' ? notepadMsg() : net.notepad;
        if (window.wpJournalAddNote) window.wpJournalAddNote(meta, 'Table notes — ' + new Date().toLocaleDateString(), text);
    });
    var pb = ui('netNotepadBtn'); if (pb) pb.addEventListener('click', function() {
        if (!(net.active && net.role === 'host')) { toast('Host a session first — the notepad is for the table.'); return; }
        ui('netModal').style.display = 'none'; net.notepadToggle();
    });
    // drag the pad around by its header (position kept for this session only)
    if (head && p) {
        var d = null;
        head.addEventListener('pointerdown', function(e) {
            if (e.target.closest('button')) return;
            var r = p.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); e.preventDefault();
        });
        head.addEventListener('pointermove', function(e) { if (!d) return; p.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - d.dx)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy)) + 'px'; p.style.right = 'auto'; });
        head.addEventListener('pointerup', function() { d = null; });
        head.addEventListener('pointercancel', function() { d = null; });
    }
})();

/* ---------- combat / turn order ----------
   One combat per map: net.combats[mapId] = { mapId, round, turn, rows: [{ id, name, tokId, init, src }] }.
   The host owns it; clients get it in the snapshot and in 'combats' messages. Ends with the session. */
net.combats = {};
var combatAsked = {};   // mapId|tokId -> true: the "start combat?" question for a targeted NPC is asked once per session
function cleanCombats(c) {
    var out = {}; if (!c || typeof c !== 'object') return out;
    Object.keys(c).slice(0, 40).forEach(function(mapId) {
        var k = c[mapId]; if (!k || typeof k !== 'object' || !Array.isArray(k.rows)) return;
        var rows = k.rows.slice(0, 60).map(function(r) {
            return r && typeof r === 'object' ? { id: String(r.id || '').slice(0, 40), name: String(r.name || '').slice(0, 60), tokId: r.tokId ? String(r.tokId).slice(0, 80) : null, init: Number(r.init) || 0, src: typeof r.src === 'string' && r.src.length <= 400 ? r.src : null } : null;
        }).filter(Boolean);
        if (!rows.length) return;
        out[String(mapId).slice(0, 80)] = { mapId: String(mapId).slice(0, 80), round: Math.max(1, Math.min(9999, Number(k.round) || 1)), turn: Math.max(0, Math.min(rows.length - 1, Number(k.turn) || 0)), rows: rows };
    });
    return out;
}
function applyNotepad(m) {
    var was = net.notepad.on;
    net.notepad = { on: !!m.on, text: String(m.text || '').slice(0, 20000), campId: String(m.campId || '').slice(0, 80), gmId: String(m.gmId || '').slice(0, 80), campaign: String(m.campaign || '').slice(0, 120), gm: String(m.gm || 'GM').slice(0, 60) };
    if (net.notepad.on && !was) toast('The GM opened a table notepad — you can save it to your Journal any time.');
    else if (!net.notepad.on && was) toast('The GM put the table notepad away.');
    renderNotepad();
}
/* Fog of war (1.5.0 FV2): the combat roster and the target pointers name tokens, so a player must not learn an
   unseen creature through them. On a fogged map a combat row for a token they cannot see is REDACTED (name "Hidden",
   tokId dropped) — the order, count and turn index stay intact; a target pointer at an unseen token is dropped. Non-fog
   tables keep the single broadcast. */
function combatsFor(recipientId) {
    var camp = getActiveCampaign(); if (!anyFog(camp)) return net.combats;
    var out = {};
    Object.keys(net.combats || {}).forEach(function(mapId) {
        var cmb = net.combats[mapId], map = camp && camp.items[mapId];
        if (!map || map.type !== 'map' || !(map.fog && map.fog.on)) { out[mapId] = cmb; return; }
        var drop = fogDrop(camp, map, recipientId) || {};
        out[mapId] = { round: cmb.round, turn: cmb.turn, rows: (cmb.rows || []).map(function(r) { return (r.tokId && drop[r.tokId]) ? { id: r.id, name: 'Hidden', tokId: null, init: r.init, src: r.src } : r; }) };
    });
    return out;
}
function targetsFor(recipientId) {
    var camp = getActiveCampaign(); if (!anyFog(camp)) return net.targets;
    var out = {};
    Object.keys(net.targets || {}).forEach(function(pid) {
        var t = net.targets[pid], map = camp && t && camp.items[t.mapId];
        if (!map || map.type !== 'map' || !(map.fog && map.fog.on)) { out[pid] = t; return; }
        var drop = fogDrop(camp, map, recipientId) || {};
        if (!(t.id && drop[t.id])) out[pid] = t;
    });
    return out;
}
function broadcastCombats() {
    var camp = getActiveCampaign();
    if (!anyFog(camp)) { broadcast({ type: 'combats', combats: net.combats }, null); return; }
    net.conns.forEach(function(c) { var pr = net.roster[c.peer]; if (!pr || !c.open) return; try { c.send({ type: 'combats', combats: combatsFor(pr.id) }); } catch (e) {} });
}
function broadcastTargets() {
    var camp = getActiveCampaign();
    if (!anyFog(camp)) { broadcast({ type: 'targets', targets: net.targets }, null); return; }
    net.conns.forEach(function(c) { var pr = net.roster[c.peer]; if (!pr || !c.open) return; try { c.send({ type: 'targets', targets: targetsFor(pr.id) }); } catch (e) {} });
}
function combatRefresh() { render(); if (window.wpRenderCombatStrip) window.wpRenderCombatStrip(); }
function mapTitleOf(mapId) { var camp = getActiveCampaign(); var m = camp && camp.items[mapId]; return (m && m.meta && m.meta.title) || mapId; }
net.combatFor = function(mapId) { return net.active && net.combats[mapId] || null; };
// host: put a combat on a map (or take it off with null)
net.combatSet = function(mapId, combat) {
    if (net.role !== 'host') return;
    var had = net.combats[mapId];
    if (combat) {
        combat.mapId = mapId;
        net.combats[mapId] = cleanCombats({ m: combat }).m; net.combats[mapId].mapId = mapId;
        if (!had) logEvent('table', 'Combat started on ' + mapTitleOf(mapId) + ': ' + combat.rows.map(function(r) { return r.name; }).join(', '));
        toast(had ? 'Combat roster updated.' : 'Combat started on ' + mapTitleOf(mapId) + ' — ' + (combat.rows[combat.turn] || combat.rows[0]).name + ' goes first.');
    } else {
        if (had) { logEvent('table', 'Combat ended on ' + mapTitleOf(mapId) + ' after ' + had.round + ' round' + (had.round === 1 ? '' : 's')); toast('Combat ended on ' + mapTitleOf(mapId) + '.'); }
        delete net.combats[mapId];
    }
    broadcastCombats(); combatRefresh();
};
net.combatStep = function(mapId, dir) {
    if (net.role !== 'host') return;
    var c = net.combats[mapId]; if (!c || !c.rows.length) return;
    var t = c.turn + (dir < 0 ? -1 : 1);
    if (t >= c.rows.length) { t = 0; c.round += 1; }
    else if (t < 0) { if (c.round > 1) { c.round -= 1; t = c.rows.length - 1; } else t = 0; }
    c.turn = t;
    toast((c.rows[t].name || 'Someone') + "'s turn" + (t === 0 && dir > 0 ? ' — round ' + c.round : '') + '.');
    broadcastCombats(); combatRefresh();
};
net.combatEnd = function(mapId) {
    if (net.role !== 'host' || !net.combats[mapId]) return;
    var c = net.combats[mapId];
    showConfirm('End combat on ' + mapTitleOf(mapId) + '? Round ' + c.round + ', ' + c.rows.length + ' in the order. The ring and the turn strip go for everyone.', function(yes) { if (yes) net.combatSet(mapId, null); });
};
function targetersOf(itemId, mapId) {
    return Object.keys(net.targets).filter(function(pid) { var t = net.targets[pid]; return t && t.id === itemId && t.mapId === mapId; })
        .map(function(pid) { return { id: pid, name: net.targets[pid].name || 'Player', hue: playerHue(pid) }; });
}
net.targetersOf = targetersOf;
function cleanTargets(raw) {
    var out = {};
    if (raw && typeof raw === 'object') Object.keys(raw).slice(0, 64).forEach(function(pid) {
        var t = raw[pid];
        if (t && typeof t.id === 'string' && t.id.length <= 80 && typeof t.mapId === 'string' && t.mapId.length <= 80 && typeof pid === 'string' && pid.length <= 80) {
            out[pid] = { id: t.id, mapId: t.mapId, name: String(t.name || 'Player').slice(0, 40) };
        }
    });
    return out;
}
function applyTarget(pid, name, t) {
    if (t) net.targets[pid] = { id: t.id, mapId: t.mapId, name: name }; else delete net.targets[pid];
    render();
}
// Toggle my own target (client or host). itemName is only for the toast.
net.setTarget = function(itemId, mapId, itemName) {
    if (!net.active) return;
    var me = net.myId, cur = net.targets[me];
    var next = (cur && cur.id === itemId) ? null : { id: itemId, mapId: mapId };
    if (net.role === 'client') {
        var c0 = net.conns[0];
        if (c0 && c0.open) { try { c0.send({ type: 'target', id: next ? itemId : null, mapId: mapId }); } catch (e) {} }
        applyTarget(me, getProfile().name, next);   // show it at once; the host's broadcast confirms
    } else if (net.role === 'host') {
        applyTarget(me, getProfile().name || 'GM', next);
        broadcastTargets();
    }
    toast(next ? 'Targeting ' + (itemName || 'that token') + '. Click it again (or press Esc) to clear.' : 'Target cleared.');
};
net.clearMyTarget = function() { var t = net.targets[net.myId]; if (t) net.setTarget(t.id, t.mapId); };
/* ---------- handouts (host) ----------
   revealHandout(hid, playerIds|null): resize the picture, send it to those players (all connected
   when null), record it on camp.handoutReveals so late joiners and reconnects get it too. A room
   with r.handoutId reveals itself to a player whose token comes to rest inside it. */
// A player shares a journal entry: the host relays it (to one player, everyone, or the GM itself)
net.shareEntry = function(payload) {
    if (net.active && net.role === 'host') {
        if (!net.conns.some(function(c) { return c.open && net.roster[c.peer]; })) { toast('Nobody is connected to share with.'); return false; }
        return relayShare(Object.assign({ type: 'share' }, payload), null, { id: net.myId, name: getProfile().name || 'GM' }) !== false;
    }
    if (!net.active || net.role !== 'client' || !net.conns[0] || !net.conns[0].open) { toast('Join a session first.'); return false; }
    try { net.conns[0].send(Object.assign({ type: 'share' }, payload)); return true; } catch (e) { toast('Could not send that.'); return false; }
};
function relayShare(msg, conn, sender) {
    var sp = sender || (conn && net.roster[conn.peer]); if (!sp) return false;
    var en = msg.entry; if (!en || typeof en !== 'object') return;
    var kind = en.kind === 'image' ? 'image' : 'text';
    var to = msg.to === '*' || msg.to === 'gm' ? msg.to : (typeof msg.to === 'string' && msg.to.length <= 80 ? msg.to : null);
    if (!to) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var out = {
        type: 'handout', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM',
        id: 'sh_' + String(sp.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) + '_' + String(en.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30),
        title: String(en.title || '').slice(0, 120), caption: String(en.caption || '').slice(0, 4000),
        sharedBy: String(sp.name || 'A player').slice(0, 60), sharedById: sp.id, sharedNotes: String(en.notes || '').slice(0, 20000),
        tags: Array.isArray(en.tags) ? en.tags.slice(0, 8).map(function(t) { return String(t).slice(0, 24); }) : []
    };
    if (kind === 'text') { out.kind = 'text'; out.text = String(en.text || '').slice(0, 60000); }
    else {
        if (!(en.data && en.data.byteLength !== undefined) || en.data.byteLength > 6 * 1024 * 1024) return;
        out.mime = ({ 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 })[en.mime] ? en.mime : 'image/jpeg'; out.data = en.data;
    }
    var names = [];
    if (to === 'gm') { if (window.wpJournalReceive) window.wpJournalReceive(out); names.push('you'); }
    else net.conns.forEach(function(c) {
        var p = net.roster[c.peer];
        if (!c.open || !p || (conn && c === conn)) return;
        if (to !== '*' && p.id !== to) return;
        try { c.send(out); names.push(p.name || 'a player'); } catch (e) {}
    });
    if (names.length) toast((sp.name || 'A player') + ' shared "' + (out.title || 'a note') + '" with ' + names.join(', ') + '.');
    if (names.length) logEvent('share', (sp.name || 'A player') + ' shared "' + (out.title || 'a note') + '" with ' + names.join(', '));
}
net.revealHandout = function(hid, pids) {
    if (!net.active || net.role !== 'host') { toast('Host a session first.'); return; }
    var camp = getActiveCampaign(); var h = camp && camp.handouts && camp.handouts[hid];
    if (!h || !window.wpHandoutPayload) return;
    var targets = net.conns.filter(function(c) { var p = net.roster[c.peer]; return c.open && p && (!pids || pids.indexOf(p.id) >= 0); });
    if (!targets.length) { toast('Nobody to show it to right now.'); return; }
    window.wpHandoutPayload(h).then(function(pl) {
        targets.forEach(function(c) {
            var p = net.roster[c.peer];
            try { c.send(pl.kind === 'text'
                ? { type: 'handout', kind: 'text', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', text: pl.text, tags: (h.tags || []).slice(0, 8) }
                : { type: 'handout', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', mime: pl.mime, data: pl.data, tags: (h.tags || []).slice(0, 8) }); } catch (e) {}
            camp.handoutReveals = camp.handoutReveals || {};
            camp.handoutReveals[p.id] = camp.handoutReveals[p.id] || {};
            camp.handoutReveals[p.id][h.id] = Date.now();
            camp.handoutLog = (camp.handoutLog || []).concat([{ hid: h.id, pid: p.id, name: p.name || '', at: Date.now() }]).slice(-2000);   // history: survives a re-queue
        });
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        document.dispatchEvent(new CustomEvent('wp-handout-revealed'));
        toast('"' + (h.title || 'Handout') + '" shown to ' + targets.map(function(c) { return net.roster[c.peer].name || 'a player'; }).join(', ') + '.');
        logEvent('handout', '"' + (h.title || 'Handout') + '" shown to ' + targets.map(function(c) { return net.roster[c.peer].name || 'a player'; }).join(', '));
    }).catch(function() { toast('Could not prepare that picture.'); });
};
// Everything already revealed to this player, sent again (their journal keeps one copy per handout)
function sendMissedHandouts(conn, prof) {
    var camp = getActiveCampaign(); if (!camp) return;
    // Handouts marked for everyone on join (autoOnJoin) OR assigned to this specific player
    // (h.giveTo{pid}) that this player has not had yet — camp.giveTo is per-campaign, so it never
    // reaches a player in a different campaign.
    Object.values(camp.handouts || {}).forEach(function(h, i) {
        if (!h.autoOnJoin && !(h.giveTo && h.giveTo[prof.id])) return;
        if (camp.handoutReveals && camp.handoutReveals[prof.id] && camp.handoutReveals[prof.id][h.id]) return;
        setTimeout(function() { if (conn.open) net.revealHandout(h.id, [prof.id]); }, 3000 + i * 600);
    });
    if (!camp.handoutReveals || !camp.handoutReveals[prof.id]) return;
    Object.keys(camp.handoutReveals[prof.id]).forEach(function(hid, i) {
        var h = camp.handouts && camp.handouts[hid]; if (!h || !window.wpHandoutPayload) return;
        setTimeout(function() {
            window.wpHandoutPayload(h).then(function(pl) {
                if (!conn.open) return;
                try { conn.send(pl.kind === 'text'
                    ? { type: 'handout', kind: 'text', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', text: pl.text, replay: true, tags: (h.tags || []).slice(0, 8) }
                    : { type: 'handout', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', mime: pl.mime, data: pl.data, replay: true, tags: (h.tags || []).slice(0, 8) }); } catch (e) {}
            }).catch(function() {});
        }, 1500 + i * 400);
    });
}
// The room a token is standing in (its centre inside a floor item linked to a room)
function roomUnder(item, map) {
    if (!item || !map || !map.whiteboard) return null;
    var cx = item.x + (item.w || 0) / 2, cy = item.y + (item.h || 0) / 2, best = null, bestArea = Infinity;
    map.whiteboard.forEach(function(o) {
        if (o.id === item.id || !o.nodeId) return;
        var ow = o.w || 0, oh = o.h || 0;
        if (cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh) return;
        if (ow * oh < bestArea) { bestArea = ow * oh; best = o; }
    });
    if (!best) return null;
    return (map.rooms || []).find(function(r) { return r.id === best.nodeId; }) || null;
}
// Host: any player's token now resting in a room that carries a handout they haven't seen
function checkRoomHandouts(map) {
    if (!net.active || net.role !== 'host' || !map || map.type !== 'map') return;
    var camp = getActiveCampaign(); if (!camp || !camp.handouts) return;
    (map.whiteboard || []).forEach(function(w) {
        if (!w.isChar || !w.ownerId) return;
        var r = roomUnder(w, map); if (!r || !r.handoutId || !camp.handouts[r.handoutId]) return;
        var seen = camp.handoutReveals && camp.handoutReveals[w.ownerId] && camp.handoutReveals[w.ownerId][r.handoutId];
        if (seen) return;
        if (!Object.values(net.roster).some(function(p) { return p && p.id === w.ownerId; })) return;   // only to someone connected
        net.revealHandout(r.handoutId, [w.ownerId]);
    });
}
net.checkRoomHandouts = checkRoomHandouts;
net.isPresent = function(ownerId, mapId) {
    if (!net.active || net.stream) return true;                    // solo, or the stream window: everything shows
    if (net.role === 'client' && ownerId === net.myId) return true;
    var live = Object.values(net.roster).find(function(p) { return p && p.id === ownerId; });
    if (live) return live.location === mapId;
    return awayMap()[ownerId] === mapId;                            // left the table: their character stays where they were, nowhere else
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
    if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before a token is spawned or adopted for the player
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
                var spot = freeSpotNear(map, sx, sy, nw.w || 60, nw.h || 52, null, landPt && landPt.wbItemId ? (map.whiteboard || []).find(function(o) { return o.id === landPt.wbItemId; }) : null);
                nw.x = spot.x; nw.y = spot.y;
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
        net.broadcastItemFiltered(camp.id, mapId);
        var myActive = getActiveCampaign();
        if (myActive && myActive.activeItemId === mapId) render();
    }
    return changed;
}

/* ---------- join gate: password, session bans, GM approval ---------- */
var bannedIds = {};        // profile id -> true, for this session only
var pendingJoins = [];     // [{conn, prof}] awaiting the GM's Allow/Deny
var approvalOpen = false;
var approvedIds = {};      // profile id -> true: the GM said yes, but that connection was already gone — next attempt goes straight in

function denyJoin(conn, reason) {
    try { conn.send({ type: 'denied', reason: reason }); } catch (e) {}
    setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
}

function admitPlayer(conn, prof) {
    if (!conn.open) return;
    var land = landingFor(prof);   // their own last map or the fallback under "Player's last location", else the GM's stage
    prof.location = land.stage ? land.stage.itemId : null;
    prof.detached = land.detached;
    net.roster[conn.peer] = prof;
    renderRoster();
    toast((prof.name || 'A player') + ' joined.');
    logEvent('player', (prof.name || 'A player') + ' joined');
    // remember this player on the campaign so token ownership can outlive the session
    setTimeout(function() { sendMissedHandouts(conn, prof); }, 2500);
    setTimeout(function() {   // the table's recent conversation, so a latecomer is not lost
        var recent = chatLog.filter(function(m) { return m.scope !== 'whisper'; }).slice(-60).map(function(m) { return m.roll ? { from: m.from, text: '', scope: m.scope, ts: m.ts, roll: m.roll } : m; });
        if (recent.length && conn.open) { try { conn.send({ type: 'chat-history', log: recent }); } catch (e) {} }
    }, 1200);
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
    // a follow still in its grace window moves everyone once it fires; marking the stage seen now would cancel it
    if (!_stageTimer) net.lastStage = stage ? stage.campId + '/' + stage.itemId : null;
    if (land.stage) ensurePlayerToken(prof.id, land.stage.itemId);   // before the snapshot so it's included
    if (window.wpFog) window.wpFog.invalidateVision();   // fog: this admit may follow token moves; compute a fresh per-recipient view
    try { conn.send({ type: 'snapshot', gmId: getProfile().id, appState: sanitizeAppState(state.appState, prof.id), stage: land.stage, paused: net.paused, pausedSelf: !!(net.pausedPlayers && net.pausedPlayers[prof.id]), travelLocked: net.travelLocked, stance: net.stanceFlags(), stanceCamps: window.wpVtt ? window.wpVtt.hostCamps() : null, targets: targetsFor(prof.id), combats: combatsFor(prof.id), notepad: notepadMsg() }); } catch (e) {}
    if (window.wpVtt) net._lastStanceSig = window.wpVtt.hostSig();   // the snapshot carried the ceiling: no re-send on the next save
    var sm = net.soundsMessage(); if (sm) { try { conn.send(sm); } catch (e) {} net._lastSoundSig = soundSig(sm); }   // the hosted campaign's sounds, to this peer only
    var sysm = net.systemMessage(); if (sysm) net._lastSystemSig = quickHash(JSON.stringify(sysm.system));   // the snapshot carried the system: no re-send on the next save
    if (land.stage && net.sendFxArrival) net.sendFxArrival(conn, land.stage.itemId);   // the running weather / held wash of the map they land on
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
            if (next.conn.open) admitPlayer(next.conn, next.prof);
            else { approvedIds[next.prof.id] = true; toast((next.prof.name || 'That player') + ' had already dropped — they go straight in when they try again.'); }
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
        if (msg.type === 'hb') { noteSeen(conn.peer); return; }   // a waiting player's heartbeat: keeps them from being dropped while the GM decides
        try { conn.close(); } catch (e) {}
        return;
    }
    noteSeen(conn.peer);
    if (msg.type === 'hb') return;   // heartbeat: its arrival is the whole message
    if (msg.type === 'hello' && net.role === 'host') {
        if (net.roster[conn.peer]) return;   // already admitted: a repeat hello is ignored
        if (msg.profile && typeof msg.profile !== 'object') return;
        var prof = msg.profile || { id: conn.peer, name: 'Player' };
        if (prof.id === net.myId) { denyJoin(conn, 'That player identity is the GM\'s own.'); return; }   // a claimed GM id would render as "You" on the GM's screen
        var dupC = net.conns.find(function(c) { return c !== conn && c.open && net.roster[c.peer] && net.roster[c.peer].id === prof.id && Date.now() - (lastSeen[c.peer] || 0) < HB_STALE; });
        if (dupC) { denyJoin(conn, 'That player identity is already at the table.'); return; }   // a live duplicate would read and edit that player's sheet; a dropped one (silent past 8 s) may come back
        // Peer-supplied avatar: accept only a small image data URL, else drop it
        if (prof.avatar && !(typeof prof.avatar === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(prof.avatar) && prof.avatar.length <= 200000)) {
            delete prof.avatar;
        }
        prof.name = (typeof prof.name === 'string' && prof.name.trim()) ? prof.name.slice(0, 40) : 'Player';   // cap a peer-supplied name
        if (prof.color && !/^#[0-9a-fA-F]{6}$/.test(prof.color)) delete prof.color;                            // a chosen roster color, hex only
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
        var returning = (camp0 && camp0.players && camp0.players[prof.id]) || approvedIds[prof.id];
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
        net.syncedPeer = conn.peer;   // from now on only this host's 'stance' counts (a table-hop or a waiting join hears others)
        net.gmId = String(msg.gmId || (msg.notepad && msg.notepad.gmId) || '').slice(0, 80);   // kept apart from the notepad, which leaveSession resets
        applySnapshot(msg);   // after gmId: the settings refresh inside it keys this table's off-list by campaign + GM
        syncSessionButtons();
        setStatus('Connected — campaign synced from host.');
        toast('Campaign synced from host.');
        if (window.wpVtt) window.wpVtt.joined();   // seed this table's off-list and queue the join notice
    } else if (msg.type === 'item') {
        if (net.role === 'host') {
            if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): client edits are dropped
            var profile = net.roster[conn.peer];
            if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before the player's patch lands
            var changed = applyClientItemFiltered(msg, profile);
            if (changed) {
                setTimeout(function() { checkRoomHandouts(state.appState.campaigns[msg.campId].items[msg.itemId]); }, 50);
                var myActive = getActiveCampaign();
                if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId) render();
                net.applyingRemote = true; save(true); net.applyingRemote = false;
                net.sendItem(msg.campId, msg.itemId);   // the filtered result goes back out as a delta
            }
        } else {
            applyItem(msg);
        }
    } else if (msg.type === 'itemDelta' && net.role === 'client') {
        applyItemDelta(msg);
    } else if (msg.type === 'itemGone' && net.role === 'client') {
        if (conn.peer !== net.syncedPeer) return;   // only the synced host may take things away
        var campG = state.appState.campaigns[msg.campId];
        if (campG && campG.items && campG.items[msg.itemId]) {
            net.applyingRemote = true;
            delete campG.items[msg.itemId];
            if (campG.activeItemId === msg.itemId) { campG.activeItemId = Object.keys(campG.items).find(function(id) { return campG.items[id].type === 'map'; }) || null; state.selId = null; state.selWbId = null; state.selWbIds = []; }
            try { if (window.wpDocGone) window.wpDocGone(msg.campId, msg.itemId); } catch (e) {}
            updateSidebarNav(); render();
            net.applyingRemote = false;
        }
    } else if (msg.type === 'needItem' && net.role === 'host') {
        net.sendItem(msg.campId, msg.itemId, conn);
    } else if (msg.type === 'stage' && net.role === 'client') {
        applyStage(msg.stage);
        toast(msg.personal ? 'You arrive.' : 'The GM moved the table to a new map.');
    } else if (msg.type === 'pause' && net.role === 'client') {
        setPausedLocal(!!msg.on);
        toast(msg.on ? 'The GM paused the table.' : 'The table is live again.');
    } else if (msg.type === 'pausePlayer' && net.role === 'client') {
        setSelfPausedLocal(!!msg.on);
        render();   // refresh my own token affordances (turn handles etc.) now that I'm frozen/thawed
        toast(msg.on ? 'The GM paused you.' : 'You are live again.');
    } else if (msg.type === 'stance' && net.role === 'client') {
        if (!net.foreign || conn.peer !== net.syncedPeer) return;   // before the snapshot, or from a host other than the synced one: nothing to apply
        var prevStance = net.stance;
        net.stance = cleanStance(msg.flags);
        net.stanceCamps = cleanStanceCamps(msg.camps);
        render();
        if (window.wpVtt) window.wpVtt.ceilingChanged(prevStance, typeof msg.campId === 'string' ? msg.campId.slice(0, 160) : '');
        if (window.wpSettingsSync) window.wpSettingsSync();
    } else if (msg.type === 'travelLock' && net.role === 'client') {
        setTravelLockLocal(!!msg.on);
        toast(msg.on ? 'The GM has locked travel between maps for now.' : 'Travel between maps is open again.');
    } else if (msg.type === 'travelDenied' && net.role === 'client') {
        if (msg.reason === 'closed') toast((msg.map ? String(msg.map).slice(0, 120) : 'That map') + " isn't open yet — the GM will let you through when it's time.");
        else toast('Travel between maps is locked right now — the GM will open it when the time comes.');
    } else if (msg.type === 'travel' && net.role === 'host') {
        if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): no travel
        var traveler = net.roster[conn.peer];
        var tCamp = getActiveCampaign();
        if (!traveler || !tCamp) return;
        var fromMap = tCamp.items[traveler.location || tCamp.activeItemId];
        if (!fromMap || fromMap.type !== 'map') return;
        var portal = (fromMap.whiteboard || []).find(function(w) { return w.id === msg.viaItemId; });
        hostTravel(conn, traveler, portal, fromMap);
    } else if (msg.type === 'target' && net.role === 'host') {
        var tp = net.roster[conn.peer]; if (!tp) return;
        var okId = msg.id === null || (typeof msg.id === 'string' && msg.id.length <= 80);
        if (!okId || typeof msg.mapId !== 'string' || msg.mapId.length > 80) return;
        applyTarget(tp.id, tp.name || 'Player', msg.id ? { id: msg.id, mapId: msg.mapId } : null);
        broadcastTargets();
        // a player squaring up to an NPC: offer to start combat there (once per NPC per session)
        if (msg.id && !net.combats[msg.mapId] && !combatAsked[msg.mapId + '|' + msg.id]) {
            var campT = getActiveCampaign(), mapT = campT && campT.items[msg.mapId];
            var tokT = mapT && (mapT.whiteboard || []).find(function(w) { return w.id === msg.id; });
            if (tokT && tokT.isChar && !tokT.ownerId && !tokT.hidden) {
                combatAsked[msg.mapId + '|' + msg.id] = true;
                showConfirm((tp.name || 'A player') + ' is targeting ' + (tokT.charName || tokT.name || 'a character') + ' on ' + mapTitleOf(msg.mapId) + '. Start combat there?', function(yes) {
                    if (yes && window.wpOpenCombat) window.wpOpenCombat(msg.mapId, { pre: [msg.id], owner: tp.id });
                });
            }
        }
    } else if (msg.type === 'share' && net.role === 'host') {
        relayShare(msg, conn);
    } else if (msg.type === 'handout' && net.role === 'client') {
        if (window.wpJournalReceive) window.wpJournalReceive(msg);
    } else if (msg.type === 'notepad' && net.role === 'client') {
        applyNotepad(msg);
    } else if (msg.type === 'combats' && net.role === 'client') {
        var before = net.combats, after = cleanCombats(msg.combats);
        net.combats = after;
        var camC = getActiveCampaign(), mineC = camC && after[camC.activeItemId], mineB = camC && before[camC.activeItemId];
        if (mineC && (!mineB || mineB.turn !== mineC.turn || mineB.round !== mineC.round)) toast((mineB ? '' : 'Combat! ') + (mineC.rows[mineC.turn] || {}).name + "'s turn" + (mineC.round > 1 && mineC.turn === 0 ? ' — round ' + mineC.round : '') + '.');
        else if (mineB && !mineC) toast('Combat is over.');
        combatRefresh();
    } else if (msg.type === 'targets' && net.role === 'client') {
        net.targets = cleanTargets(msg.targets);
        render();
    } else if (msg.type === 'pos') {
        handlePos(msg, conn);
    } else if (msg.type === 'end' && net.role === 'client') {
        net.leaving = true;   // deliberate teardown from the GM: no auto-reconnect
        diceSessionReset(true);   // the table is over: its chat and rolls go with it (the teardown below is the silent path)
        setStatus('Session ended by the GM.');
        var nm = ui('netModal');
        if (nm) nm.style.display = 'flex';
        toast('The GM ended the session — restoring your own campaign.');
    } else if ((msg.type === 'chars' || msg.type === 'char' || msg.type === 'charDelta' || msg.type === 'charGone' || msg.type === 'char-ack' || msg.type === 'char-deny') && net.role === 'client') {
        // characters from the synced host only (character sheets, 1.5.0): copies are replaced, never merged; every value re-cleaned against the system on hand
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSystemCore) return;
        var SC2 = window.wpSystemCore;
        if (msg.type === 'char-ack' || msg.type === 'char-deny') { if (typeof msg.rid !== 'string' || !_charPending[msg.rid]) return; charPendingDone(msg.rid, msg.type === 'char-ack', SC2.cleanDenyReason(msg.reason)); return; }
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campC = state.appState.campaigns[msg.campId]; if (!campC || !campC.system) return;   // the system always comes first
        var sysC = campC.system;
        if (msg.type === 'chars') {
            var outC = {};
            if (msg.chars && typeof msg.chars === 'object') Object.keys(msg.chars).forEach(function(id) { var cc = SC2.cleanChar(msg.chars[id], sysC); if (cc && cc.id === id) { cc.partial = msg.chars[id].partial === true; outC[id] = cc; } });
            campC.chars = outC; Object.keys(outC).forEach(reapplyPending);
            if (window.wpSheets) window.wpSheets.charChanged(null);
            return;
        }
        campC.chars = campC.chars || {};
        if (msg.type === 'charGone') {
            if (typeof msg.id !== 'string' || !campC.chars[msg.id]) return;
            delete campC.chars[msg.id];
            Object.keys(_charPending).forEach(function(rid) { if (_charPending[rid].charId === msg.id) { clearTimeout(_charPending[rid].timer); delete _charPending[rid]; } });
            if (window.wpSheets) window.wpSheets.charGone(msg.id);
            return;
        }
        if (msg.type === 'char') { var c1 = SC2.cleanChar(msg.char, sysC); if (!c1) return; c1.partial = !!(msg.char && msg.char.partial === true); campC.chars[c1.id] = c1; reapplyPending(c1.id); if (window.wpSheets) window.wpSheets.charChanged(c1.id); return; }
        if (typeof msg.id !== 'string' || !campC.chars[msg.id] || !msg.values || typeof msg.values !== 'object') return;
        var tgt = campC.chars[msg.id]; tgt.values = tgt.values || {};
        Object.keys(msg.values).forEach(function(fid) { var f = SC2.fieldById(sysC, fid); if (!f) return; if (msg.values[fid] === null) { delete tgt.values[fid]; return; } var v = SC2.cleanValue(f, msg.values[fid], null); if (v !== undefined) tgt.values[fid] = v; });
        reapplyPending(msg.id);
        if (window.wpSheets) window.wpSheets.charChanged(msg.id);
    } else if (msg.type === 'char-edit' && net.role === 'host') {
        // a player's value for their own character: shape, rate, feature, ownership, then the field's own rules; every refusal answered
        var Se = SC(), Fe = window.wpFormula; if (!Se || !Fe) return;
        var q = Se.cleanCharEdit(msg); if (!q) return;
        var denyE = function(reason) { try { conn.send({ type: 'char-deny', rid: q.rid, reason: reason }); } catch (e) {} };
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Se.LIMITS.editsPerWindow, windowMs: Se.LIMITS.editWindowMs, table: 400 });
        var limE = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;
        if (limE !== true) { var skE = conn.peer + '|slow'; if (!_charSlowSaid[skE] || Date.now() - _charSlowSaid[skE] > Se.LIMITS.editWindowMs) { _charSlowSaid[skE] = Date.now(); denyE('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyE('off'); return; }
        var campE = getActiveCampaign(), chE = campE && campE.chars && campE.chars[q.charId];
        if (!campE || !campE.system || !chE) { denyE('missing'); return; }
        var profE = net.roster[conn.peer]; if (chE.npc || !chE.ownerId || !profE || chE.ownerId !== profE.id) { denyE('owner'); return; }
        var resE = Se.applyEdit(campE.system, chE, q.fieldId, q.value, Fe, { player: true });
        if (!resE.ok) { denyE(resE.reason); return; }
        chE.values = chE.values || {}; chE.values[q.fieldId] = resE.value; chE.updated = Date.now();
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        try { conn.send({ type: 'char-ack', rid: q.rid }); } catch (e) {}
        var dE = {}; dE[q.fieldId] = resE.value; net.syncCharDelta(q.charId, dE);
        if (window.wpSheets) window.wpSheets.charChanged(q.charId);
    } else if (msg.type === 'char-item' && net.role === 'host') {
        // a player's inventory op on their own character (item-list): same gates as char-edit, then applyItemOp reads the def from the system
        var Si = SC(), Fi = window.wpFormula; if (!Si || !Fi) return;
        var qi = Si.cleanCharItem(msg); if (!qi) return;
        var denyI = function(reason) { try { conn.send({ type: 'char-deny', rid: qi.rid, reason: reason }); } catch (e) {} };
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Si.LIMITS.editsPerWindow, windowMs: Si.LIMITS.editWindowMs, table: 400 });
        var limI = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;
        if (limI !== true) { var skI = conn.peer + '|slow'; if (!_charSlowSaid[skI] || Date.now() - _charSlowSaid[skI] > Si.LIMITS.editWindowMs) { _charSlowSaid[skI] = Date.now(); denyI('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyI('off'); return; }
        var campI = getActiveCampaign(), chI = campI && campI.chars && campI.chars[qi.charId];
        if (!campI || !campI.system || !chI) { denyI('missing'); return; }
        var profI = net.roster[conn.peer]; if (chI.npc || !chI.ownerId || !profI || chI.ownerId !== profI.id) { denyI('owner'); return; }
        var resI = Si.applyItemOp(campI.system, chI, qi.fieldId, qi.op, qi.defId, qi.qty, { player: true });
        if (!resI.ok) { denyI(resI.reason); return; }
        chI.values = chI.values || {}; chI.values[qi.fieldId] = resI.value; chI.updated = Date.now();
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        try { conn.send({ type: 'char-ack', rid: qi.rid }); } catch (e) {}
        var dI = {}; dI[qi.fieldId] = resI.value; net.syncCharDelta(qi.charId, dI);
        if (window.wpSheets) window.wpSheets.charChanged(qi.charId);
    } else if (msg.type === 'throw-req' && net.role === 'host') {
        // a player throws an item from their sheet: ownership + carried-item + area read from the system, then place & share on the GM's current map
        var St = SC(); if (!St || !window.wpPlaceThrownBlast) return;
        if (typeof msg.charId !== 'string' || typeof msg.itemId !== 'string' || typeof msg.mapId !== 'string') return;
        if (window.wpVtt && !window.wpVtt.on('sheets')) return;
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: St.LIMITS.editsPerWindow, windowMs: St.LIMITS.editWindowMs, table: 400 });
        if (charLimit && charLimit.allow(conn.peer, Date.now()) !== true) return;
        var campT = getActiveCampaign(); if (!campT || !campT.system) return;
        var amT = getActiveMap(); if (!amT || amT.id !== msg.mapId) return;   // throws land on the GM's current map (where the player is)
        var chT = campT.chars && campT.chars[msg.charId], profT = net.roster[conn.peer];
        if (!chT || chT.npc || !chT.ownerId || !profT || chT.ownerId !== profT.id) return;
        var defT = St.itemDef(campT.system, msg.itemId); if (!defT || defT.vis === 'gm' || !defT.area) return;
        var carries = false; (campT.system.fields || []).forEach(function(f) { if (f.kind === 'item-list') { var v = chT.values && chT.values[f.id]; if (Array.isArray(v) && v.some(function(en) { return en.defId === msg.itemId; })) carries = true; } });
        if (!carries) return;
        if (campT.system.combat && campT.system.combat.blastRoller === 'gm') return;   // who-rolls = 'gm': only the GM throws
        var xT = Math.max(0, Math.min(30000, Number(msg.x))), yT = Math.max(0, Math.min(30000, Number(msg.y)));
        if (!isFinite(xT) || !isFinite(yT)) return;
        window.wpPlaceThrownBlast({ x: xT, y: yT, ft: defT.area.ft, name: defT.area.name || defT.name, by: chT.name, charId: msg.charId, damage: defT.damage || '' });
    } else if (msg.type === 'door-req' && net.role === 'host') {
        // a player opens/closes a door a token of theirs is adjacent to; validated on the host's OWN copy, then resynced to all
        if (typeof msg.mapId !== 'string' || typeof msg.itemId !== 'string') return;
        if (net.paused || peerPaused(conn.peer)) return;                              // frozen table (or this player is paused): no board mutation
        if (window.wpVtt && !window.wpVtt.on('fog')) return;                           // fog off -> doors are meaningless
        if (!_doorLimit && window.wpDiceCore) _doorLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: 3, windowMs: 3000, table: 200 });
        if (_doorLimit && _doorLimit.allow(conn.peer, Date.now()) !== true) return;    // a toggle triggers a per-recipient resend, so keep it tight; silent drop
        var denyDR = function(reason) { try { conn.send({ type: 'door-deny', reason: reason }); } catch (e) {} };
        var campDR = getActiveCampaign(); if (!campDR) return;
        var amDR = getActiveMap(); if (!amDR || amDR.id !== msg.mapId) return;         // only the GM's current map
        var profDR = net.roster[conn.peer]; if (!profDR) return;
        var doorEl = (amDR.whiteboard || []).find(function(w) { return w && w.id === msg.itemId; });
        if (!doorEl || doorEl.blocksSight !== true || doorEl.sightType !== 'door' || doorEl.hidden) return;   // not a visible door
        if (doorEl.doorLock) { denyDR('locked'); return; }                            // GM-locked against players
        var Cdr = window.wpFogCore; if (!Cdr) return;
        var gridDR = Cdr.gridFor((amDR.meta && amDR.meta.gridType) || 'off', amDR.fog && amDR.fog.cell); if (!gridDR) return;   // gridless: can't judge adjacency -> ignore
        var dCellsR = (doorEl.fill ? [Cdr.cellOf(doorEl.x + (doorEl.w || 0) / 2, doorEl.y + (doorEl.h || 0) / 2, gridDR)]
            : doorEl.type === 'hexagon' ? Cdr.cellsUnderHex(doorEl.x, doorEl.y, doorEl.w || 0, doorEl.h || 0, gridDR)
            : doorEl.type === 'circle' ? Cdr.cellsUnderCircle(doorEl.x, doorEl.y, doorEl.w || 0, doorEl.h || 0, gridDR)
            : doorEl.type === 'diamond' ? Cdr.cellsUnderDiamond(doorEl.x, doorEl.y, doorEl.w || 0, doorEl.h || 0, gridDR)
            : Cdr.cellsUnderRect(doorEl.x, doorEl.y, doorEl.w || 0, doorEl.h || 0, gridDR));
        var adjacentR = (amDR.whiteboard || []).some(function(w) {
            if (!w || !w.isChar || w.hidden || w.ownerId !== profDR.id) return false;
            var tc = Cdr.cellOf(w.x + (w.w || 60) / 2, w.y + (w.h || 52) / 2, gridDR);
            return dCellsR.some(function(dc) { return gridDR.type === 'square' ? (Math.max(Math.abs((dc.c || 0) - (tc.c || 0)), Math.abs((dc.r || 0) - (tc.r || 0))) <= 1) : (Cdr.hexDist(dc, tc) <= 1); });
        });
        if (!adjacentR) { denyDR('far'); return; }
        doorEl.doorOpen = !doorEl.doorOpen;
        save(true);                                                                   // host save -> onLocalSave: invalidateVision + resend the map fog-filtered per recipient
        if (window.wpFog) window.wpFog.redraw();                                       // refresh the GM's own overlay
    } else if (msg.type === 'door-deny' && net.role === 'client') {
        toast(msg.reason === 'locked' ? 'The GM has that door locked.' : msg.reason === 'far' ? 'Move a token next to that door to open it.' : 'Cannot open that door right now.');
    } else if (msg.type === 'system' && net.role === 'client') {
        // the hosted campaign's system as the players' view (character sheets, 1.5.0), re-cleaned here; null = the campaign has none
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSystemCore || !window.wpFormula) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campS = state.appState.campaigns[msg.campId]; if (!campS) return;
        if (msg.system === null) delete campS.system;
        else { var csys = window.wpSystemCore.cleanSystem(msg.system, { F: window.wpFormula, gmView: false }); if (csys) campS.system = csys; }
        if (window.wpSheetsSync) window.wpSheetsSync();
    } else if ((msg.type === 'sounds' || msg.type === 'sound') && net.role === 'client') {
        // the hosted campaign's sound list and its cues: only from the synced host, only after the snapshot, validated in sound.js.
        // A host has no branch for these: a player never triggers a sound on anyone.
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSound) return;
        if (msg.type === 'sounds') { if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return; window.wpSound.onList(msg); }
        else window.wpSound.onCue(msg);
    } else if (msg.type === 'fx' && net.role === 'client') {
        // a visual effect from the synced host only, after the snapshot, never in the stream window; re-cleaned here.
        // A host has no branch: a player never triggers an effect on anyone.
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpFxCore || !window.wpFx) return;
        var cfx = window.wpFxCore.cleanFx(msg); if (cfx) window.wpFx.receive(cfx);
    } else if (msg.type === 'blast' && net.role === 'client') {
        // a thrown blast's shared template from the synced host, for the player's current map (item library, 1.5.0)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpRenderSharedBlast || !msg.blast) return;
        var amB = getActiveMap(); if (amB && msg.mapId === amB.id) window.wpRenderSharedBlast(msg.blast);
    } else if (msg.type === 'blastClear' && net.role === 'client') {
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpClearSharedBlasts) return;
        window.wpClearSharedBlasts();
    } else if (msg.type === 'roll-req' && net.role === 'host') {
        // a player's roll: validated, rate-limited, rolled HERE with the host's dice, sent as a record (from = the roster entry, never the client's claim)
        var Dq = DC(), Fq = window.wpFormula; if (!Dq || !Fq) return;
        var q = Dq.cleanRollReq(msg); if (!q) { var ridBad = Dq.cleanRid(msg); if (ridBad) { try { conn.send({ type: 'roll-deny', rid: ridBad, reason: 'error', message: 'That roll could not be read.' }); } catch (e) {} } return; }
        var denyQ = function(reason, r) { var d = { type: 'roll-deny', rid: q.rid, reason: reason }; if (r) { d.message = r.error.message; d.pos = r.error.pos; d.len = r.error.len; } try { conn.send(d); } catch (e) {} };
        if (!diceLimit) diceLimit = Dq.RateLimit(Dq.LIMITS);
        var lim = diceLimit.allow(conn.peer, Date.now());
        if (lim !== true) { var sk = conn.peer + '|' + lim; if (!_diceSlowSaid[sk] || Date.now() - _diceSlowSaid[sk] > Dq.LIMITS.windowMs) { _diceSlowSaid[sk] = Date.now(); denyQ(lim); } return; }   // one 'slow' per window, then silence
        if (window.wpVtt && !window.wpVtt.on('dice')) { denyQ('off'); return; }
        var chQ = null, varsQ = null, SQ = SC();
        if (q.charId) {   // the player's own character, resolved through the view they hold: a GM-only name is unknown there, a nulled formula an error, as on their sheet
            var campQ = getActiveCampaign(), pidQ = peerProfileId(conn), srcQ = campQ && campQ.chars && campQ.chars[q.charId];
            if (!srcQ || srcQ.npc || !srcQ.ownerId || !pidQ || srcQ.ownerId !== pidQ || !SQ || !campQ.system) { denyQ('char'); return; }
            var viewQ = window.wpSheets ? window.wpSheets.playerSystem(campQ) : null, chvQ = viewQ ? SQ.charFor(srcQ, viewQ, pidQ) : null;
            if (!viewQ || !chvQ) { denyQ('char'); return; }
            chQ = srcQ; varsQ = SQ.makeResolver(viewQ, chvQ, Fq);
        }
        if (Fq.names(q.expr).length && !varsQ) { denyQ('names'); return; }
        var resQ = Fq.evaluate(q.expr, varsQ ? { vars: varsQ } : {});
        if (!resQ.ok) { denyQ('error', resQ); return; }
        var whyQ = Dq.checkTableRoll(resQ); if (whyQ) { denyQ(whyQ); return; }
        var recQ = { type: 'roll', id: Dq.uid(), from: diceFrom(net.roster[conn.peer], false), expr: q.expr, draws: resQ.draws, v: Fq.VERSION, ts: Date.now(), rid: q.rid };
        if (resQ.breakdown && resQ.breakdown.names && resQ.breakdown.names.length) { var nmQ = Dq.cleanNames(resQ.breakdown.names); if (!nmQ) { denyQ('error'); return; } if (nmQ.length) recQ.names = nmQ; }
        if (q.label) recQ.label = q.label;
        if (chQ) recQ.as = String(chQ.name || '').slice(0, Dq.LIMITS.label);
        if (q.priv) { recQ.priv = 'gm'; try { conn.send(recQ); } catch (e) {} pushRoll(recQ, resQ, 'whisper'); }
        else { sendTable(recQ, null); pushRoll(recQ, resQ, 'global'); }
        logEvent('dice', Dq.cardText(recQ, resQ, Fq, { maxChars: Dq.LIMITS.logChars }));
    } else if ((msg.type === 'roll' || msg.type === 'roll-deny') && net.role === 'client') {
        // a record or a refusal from the synced host only, after the snapshot; a host never takes a 'roll' from a client (no host branch)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        var Dr = DC(), Fr = window.wpFormula; if (!Dr || !Fr) return;
        if (msg.type === 'roll-deny') {
            if (!_dicePending) return;
            var dn = Dr.cleanDeny(msg, _dicePending.expr.length); if (!dn || dn.rid !== _dicePending.rid) return;
            var pend = _dicePending; clearTimeout(pend.timer); _dicePending = null;
            if (window.wpDice) window.wpDice.onDeny(dn, pend.expr);
            return;
        }
        var rc = Dr.cleanRoll(msg); if (!rc) return;
        if (_dicePending && rc.rid === _dicePending.rid) { clearTimeout(_dicePending.timer); _dicePending = null; if (window.wpDice) window.wpDice.onRolled(rc); }
        var rp = Dr.replay(rc, Fr, Fr.VERSION);
        pushRoll(rc, rp.ok ? rp.result : null, rc.priv || rc.to ? 'whisper' : 'global', { bad: rp.ok ? null : rp.reason });
    } else if (msg.type === 'asset-req' && net.role === 'host') {
        handleAssetRequest(msg, conn);
    } else if (msg.type === 'asset-part' && net.role === 'client') {
        handleAssetPart(msg);
    } else if (msg.type === 'asset' && net.role === 'client') {
        handleAssetArrival(msg);
    } else if (msg.type === 'chat') {
        if (net.role === 'host') {
            // player comments are table-wide: relay to everyone else (typed, capped, on the host's clock so late joiners sort them with the rolls)
            if (typeof msg.text !== 'string' || !msg.from || typeof msg.from !== 'object') return;
            msg.text = msg.text.slice(0, 2000); msg.ts = Date.now(); delete msg.roll;
            pushChat(msg);
            broadcast(msg, conn);
            if (msg.scope !== 'whisper') logEvent('chat', ((msg.from && msg.from.name) || 'Player') + ': ' + String(msg.text || '').slice(0, 300));
        } else {
            pushChat(msg);
        }
    } else if (msg.type === 'chat-history' && net.role === 'client') {
        var histD = window.wpDiceCore, histF = window.wpFormula;
        var hist = Array.isArray(msg.log) ? msg.log.filter(function(m) { return m && m.from && (typeof m.text === 'string' || m.roll); }).slice(-60) : [];
        var have = {}; chatLog.forEach(function(m) { have[m.roll ? 'r|' + m.roll.id : (m.ts || 0) + '|' + (m.from && m.from.id) + '|' + m.text] = true; });
        var added = 0;
        hist.forEach(function(m) {
            if (m.roll) {   // a roll entry: the record is validated and replayed exactly like a live one
                if (!histD || !histF) return;
                var hr = histD.cleanRoll(m.roll); if (!hr || hr.priv || hr.to || have['r|' + hr.id]) return;
                have['r|' + hr.id] = true;
                var hp = histD.replay(hr, histF, histF.VERSION);
                chatLog.push({ from: hr.from, text: '', scope: 'global', ts: hr.ts, roll: hr, res: hp.ok ? hp.result : null, rollBad: hp.ok ? null : hp.reason }); added++;
                return;
            }
            var k = (m.ts || 0) + '|' + m.from.id + '|' + m.text;
            if (!have[k]) { have[k] = true; chatLog.push({ from: { id: String(m.from.id || ''), name: String(m.from.name || '').slice(0, 60), gm: !!m.from.gm }, text: String(m.text).slice(0, 2000), scope: 'global', ts: m.ts || Date.now() }); added++; }
        });
        chatLog.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
        while (chatLog.length > 200) chatLog.shift();
        if (added) { renderChat(); var cp = ui('chatPanel'); if (!cp || cp.style.display === 'none') { chatUnread += added; var cb = ui('chatBadge'); if (cb) { cb.textContent = chatUnread; cb.style.display = 'block'; } } }
    } else if (msg.type === 'roster' && net.role === 'client') {   // the host owns the roster; a player's copy never replaces it
        net.roster = msg.roster || {};
        net.away = msg.away || {};
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
    if (reconn.tries === 1) toast('Connection lost — reconnecting… (keeps trying for a few minutes)');
    reconn.timer = setTimeout(function() { joinSession(reconn.code, reconn.name, true); }, reconn.tries === 1 ? 1200 : 2500);
}

function wireConn(conn) {
    conn.on('data', function(d) { handleMessage(d, conn); });
    // The transport knows first: when the other side vanishes (app closed, cable pulled, Wi-Fi
    // gone) ICE goes 'disconnected' within seconds and 'failed' soon after, long before the
    // channel's own close event. Show it at once; treat 'failed' as the drop it is.
    conn.on('iceStateChanged', function(st) {
        if (!net.active || !conn.open) return;
        if (st === 'disconnected') {
            if (net.role === 'client') { setIndicator('warn', 'link to the GM interrupted'); setStatus('Link to the GM interrupted — waiting for it to recover…'); }
            else { var pd = net.roster[conn.peer]; if (pd && !pd.stale) { pd.stale = true; renderRoster(); } }
        } else if (st === 'failed' || st === 'closed') {
            if (net.role === 'client') { setIndicator('bad', 'lost the GM — reconnecting'); }
            try { conn.close(); } catch (e) {}   // the close handler drops them (host) or starts the reconnect loop (client)
        } else if (st === 'connected' || st === 'completed') {
            if (net.role === 'client') setIndicator('ok', 'connected to the GM');
            else { var pc = net.roster[conn.peer]; if (pc && pc.stale) { delete pc.stale; renderRoster(); } }
        }
    });
    conn.on('close', function() {
        net.conns = net.conns.filter(function(c) { return c !== conn; });
        delete assetInflight[conn.peer];
        if (diceLimit) diceLimit.forget(conn.peer);
        if (charLimit) charLimit.forget(conn.peer);
        var p = net.roster[conn.peer];
        delete net.roster[conn.peer];
        renderRoster();
        if (net.role === 'host') {
            if (p) toast((p.name || 'A player') + ' left' + (p.location ? ' — their character stays on ' + (((getActiveCampaign() || {}).items || {})[p.location] || { meta: {} }).meta.title + '.' : '.'));
            if (p) logEvent('player', (p.name || 'A player') + ' left' + (p.location ? ' (on ' + ((((getActiveCampaign() || {}).items || {})[p.location] || { meta: {} }).meta.title || p.location) + ')' : ''));
            if (p && net.targets[p.id]) { delete net.targets[p.id]; render(); broadcast({ type: 'targets', targets: net.targets }, null); }
            net.applyingRemote = true; save(true); net.applyingRemote = false;   // lastMap persists
            broadcastRoster();
            render();
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
/* ICE servers. STUN finds each side's public address; a direct path then works for most
   home networks. Players behind carrier-grade NAT (many mobile and some fibre providers,
   common outside the US/EU) can only connect through a relay (TURN). The free public relay
   Waypoint once used has shut down, so the GM configures their own in Settings ▸ Relay server
   (stored under turn_* keys, which stay on this machine — never mirrored to the saves folder).
   One side with a relay is enough: the host's relayed address is reachable from anywhere. */
var STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];
function turnConfig() {
    var urls = [], user = '', pass = '';
    try {
        urls = String(localStorage.getItem('turn_urls') || '').split(/[\s,]+/).filter(function(u) { return /^turns?:/i.test(u); });
        user = localStorage.getItem('turn_user') || ''; pass = localStorage.getItem('turn_pass') || '';
    } catch (e) {}
    if (!urls.length) return null;
    return { urls: urls, username: user, credential: pass };
}
net.turnConfig = turnConfig;
function iceServers() {
    var t = turnConfig();
    return t ? STUN_SERVERS.concat([t]) : STUN_SERVERS.slice();
}
// Settings ▸ Firewall-friendly connections (wp_relayOnly): force every path through the relay.
// A direct connection attempt probes many ports in a burst, which some firewalls (Avira, Norton,
// some routers) flag as a port scan and block for minutes — dropping the player mid-join.
// With relay-only ICE the only traffic the firewall sees is one relay endpoint.
function relayOnly() { try { return localStorage.getItem('wp_relayOnly') === '1'; } catch (e) { return false; } }
function peerOpts() {
    var cfg = { iceServers: iceServers() };
    if (relayOnly() && turnConfig()) cfg.iceTransportPolicy = 'relay';   // relay-only means nothing without a relay
    return { config: cfg };
}
/* Try the configured relay: gather with relay-only ICE and see whether a relay candidate
   arrives. Resolves { ok, detail }. Used by the Test button in Settings. */
net.testRelay = function() {
    var t = turnConfig();
    if (!t) return Promise.resolve({ ok: false, detail: 'No relay configured.' });
    return new Promise(function(resolve) {
        var pc, done = false, errs = [];
        var finish = function(ok, detail) { if (done) return; done = true; try { pc.close(); } catch (e) {} resolve({ ok: ok, detail: detail }); };
        try { pc = new RTCPeerConnection({ iceServers: [t], iceTransportPolicy: 'relay' }); }
        catch (e) { return resolve({ ok: false, detail: 'Bad relay settings: ' + (e.message || e) }); }
        pc.createDataChannel('probe');
        pc.onicecandidate = function(e) { if (e.candidate && e.candidate.type === 'relay') finish(true, 'Relay answered (' + e.candidate.protocol + ' ' + e.candidate.address + ').'); };
        pc.onicecandidateerror = function(e) { errs.push((e.errorCode || '') + ' ' + (e.errorText || '')); };
        pc.onicegatheringstatechange = function() { if (pc.iceGatheringState === 'complete') finish(false, errs.length ? 'Relay refused: ' + errs[errs.length - 1].trim() : 'No answer from the relay.'); };
        pc.createOffer().then(function(o) { return pc.setLocalDescription(o); }).catch(function(e) { finish(false, String(e.message || e)); });
        setTimeout(function() { finish(false, errs.length ? 'Relay refused: ' + errs[errs.length - 1].trim() : 'No answer from the relay (10 s). Check the address, port and credentials.'); }, 10000);
    });
};

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

/* A room's id on the signaling server is waypoint-<code>, or waypoint-<code>-r<n> after a crash:
   the dead session's registration can linger for minutes, so a resuming GM takes the next
   generation of the SAME code at once, and players try each generation in turn. */
var ROOM_GENS = 4;
function roomPeerId(code, gen) { return 'waypoint-' + String(code).toLowerCase() + (gen ? '-r' + gen : ''); }
net._hostGen = 0;
function startHosting(forceFresh) {
    _lastSent = {};   // a new table starts from the snapshot, not from anything sent before
    diceSessionReset(true);   // and from an empty chat: the last table's lines never reach the next one
    if (typeof Peer === 'undefined') { toast('Multiplayer needs an internet connection.'); return; }
    if (forceFresh) net._hostGen = 0;
    cancelReconnect();   // a pending retry would otherwise tear the new host down and rejoin the old table
    if (net.foreign) {
        // the campaign on screen is a GM's: hand it back before anything can be hosted from it
        leaveSession(true);
        setStatus('Restoring your own campaign…');
        toast('That was the GM\'s campaign — restoring your own. Press Host again in a moment.');
        load();
        return;
    }
    leaveSession(true);
    defaultStageMode(getActiveCampaign());   // hosting without opening the panel first still starts on the default
    var resumed = !forceFresh ? recentHostCode() : null;
    var code = resumed || makeCode();
    var gen = resumed ? net._hostGen : 0;
    var peer = new Peer(roomPeerId(code, gen), peerOpts());
    net.peer = peer; net.role = 'host'; net.code = code;
    net._lastStanceSig = null;   // the first save after hosting starts sends the ceiling
    net._lastSoundSig = null;    // and the sound list
    net._lastSystemSig = null;   // and the system
    setStatus((resumed ? 'Resuming host with your last room code...' : 'Starting host...') + (relayOnly() ? ' (relay-only connections)' : ''));
    peer.on('open', function() {
        net.active = true;
        net._hostGen = gen;   // a later crash resumes under the generation after this one
        startHeartbeat();
        rememberHostCode(code);
        setStatus('Hosting — room code: ' + code.toUpperCase());
        var codeEl = ui('netCode');
        if (codeEl) codeEl.textContent = code.toUpperCase();
        ui('netHostInfo').style.display = 'block';
        syncSessionButtons();
        renderRoster();
        toast(resumed ? 'Hosting resumed with the same room code — players can rejoin as before.' : 'Hosting started. Share the room code.');
        logEvent('session', (resumed ? 'Session resumed' : 'Session started') + ' — room ' + String(code).toUpperCase());
        net.applyingRemote = true; save(true); net.applyingRemote = false;
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
            try { peer.destroy(); } catch (e) {}
            if (resumed && gen + 1 < ROOM_GENS) {
                // The crashed session still holds this generation: take the next one, same code.
                net._hostGen = gen + 1;
                setTimeout(function() { startHosting(false); }, 200);
                return;
            }
            forgetHostCode();
            if (resumed) toast('Your last room code could not be resumed — starting with a new code. Players will need the new one.');
            else toast('Code collision — trying another code.');
            setTimeout(function() { startHosting(true); }, 300);
            return;
        }
        setStatus('Host error: ' + err.type);
    });
}

var JOIN_ATTEMPT_MS = 7000;   // per generation; a dead generation's registration answers nothing
function joinSession(code, name, isRetry, probe) {
    if (typeof Peer === 'undefined') { toast('Multiplayer needs an internet connection.'); return; }
    probe = probe || 0;                       // which generation this attempt targets
    if (!isRetry && !probe) cancelReconnect();
    leaveSession(true);
    var profile = setProfileName(name || getProfile().name || 'Player');
    net.myId = profile.id;
    var peer = new Peer(peerOpts());
    net.peer = peer; net.role = 'client'; net.code = code;
    if (isRetry) {
        // Still at the GM's table as far as the player is concerned: the GM's campaign is on
        // screen, so the spectator rules (no sidebars, no editing, no planners) must hold
        // through every retry, not lapse between attempts.
        net.active = true;
        renderRoster(); syncSessionButtons();
    }
    if (!isRetry && !probe) setStatus('Connecting to ' + code.toUpperCase() + '...');
    var gen = isRetry ? (reconn.tries % ROOM_GENS) : probe;
    peer.on('open', function() {
        var conn = peer.connect(roomPeerId(code, gen), { reliable: true });
        net.conns = [conn];
        // Nothing within a few seconds: this generation is dead or unreachable. A first join
        // moves on to the next generation (a resumed room lives under one), then gives up with
        // a clear message — that is what a player behind carrier-grade NAT sees when the GM
        // has no relay. A reconnect attempt just schedules the next one.
        var joinTimer = setTimeout(function() {
            if (conn.open || net.peer !== peer) return;
            try { peer.destroy(); } catch (e) {}
            if (reconn.pending) { scheduleReconnect(); return; }
            if (probe + 1 < ROOM_GENS) { joinSession(code, name, false, probe + 1); return; }
            joinFailed('No route to the GM\'s table.');
        }, JOIN_ATTEMPT_MS);
        conn.on('iceStateChanged', function(s) { if ((s === 'failed' || s === 'closed') && !conn.open && net.peer === peer && !reconn.pending) joinFailed('Your network and the GM\'s could not reach each other (ICE ' + s + ').'); });
        conn.on('open', function() { clearTimeout(joinTimer); });
        function joinFailed(why) {
            clearTimeout(joinTimer);
            try { peer.destroy(); } catch (e) {}
            net.peer = null; net.conns = []; net.active = false; net.role = null; net.code = null;
            setIndicator(null);
            setStatus(why + ' This usually means your connection is behind carrier-grade NAT and the table needs a relay server: ask the GM to set one under Settings \u25B8 Relay server, then try again.');
            toast('Could not reach the GM\'s table \u2014 see the Multiplayer panel.');
            var nmJ = ui('netModal'); if (nmJ) nmJ.style.display = 'flex';
            if (net.foreign && !window.wpStream) load();   // a previous table is still on screen: bring the own campaign back
        }
        conn.on('open', function() {
            var wasRetry = reconn.pending;
            cancelReconnect();
            net.active = true;
            var pwIn = ui('netJoinPassInput');
            conn.send({ type: 'hello', profile: profile, password: pwIn ? pwIn.value.trim() : '', version: APP_VERSION });   // before the first heartbeat: the host admits nothing that speaks first
            startHeartbeat();
            renderRoster();
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
        // Only when the join itself failed: a signalling hiccup mid-game also lands here, with the table still live
        if (!net.active && net.foreign && !window.wpStream) load();   // a previous table is still on screen: bring the own campaign back
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
    diceSessionReset(!silent);   // a deliberate leave or end clears the chat panel too; a retry keeps it
    // do not null net.stance / net.stanceCamps / net.gmId here — joinSession calls leaveSession(true) on every retry,
    // and the GM's campaign stays on screen until load() brings the player's own back; load() is the one clear point
    net.syncedPeer = null;
    net.sounds = null; net.soundNow = null;   // transport memory, unlike the ceiling: the next table sends its own list
    resetAssetTransfers();                    // in-flight sound requests and their waiters die with the connection
    if (window.wpSound) window.wpSound.tableLeft(wasClient);
    if (window.wpFx) window.wpFx.tableLeft();
    net.targets = {};
    net.combats = {}; combatAsked = {};
    net.notepad = { on: false, text: '' }; setTimeout(renderNotepad, 0);
    if (window.wpRenderCombatStrip) setTimeout(function() { window.wpRenderCombatStrip(); }, 0);
    stopHeartbeat();
    if (!silent) setIndicator(null);
    setPausedLocal(false);
    setTravelLockLocal(false);
    net.pausedPlayers = {}; setSelfPausedLocal(false);   // per-player pauses are per-session, like the table pause and travel lock
    bannedIds = {}; pendingJoins = []; approvalOpen = false;   // bans and pending approvals are per-session
    var hi = ui('netHostInfo');
    if (hi) hi.style.display = 'none';
    renderRoster();
    if (!silent) {
        net.stageOverride = null;
        net.stageMode = null; net.stageFallback = null; net.stagePicked = {};   // the next session starts from the defaults again
        setStatus('Not in a session.');
        toast(wasClient ? 'Left the session — restoring your own campaign.' : wasHost ? 'Session ended for everyone — the room code is retired.' : 'Left the session.');
        if (wasHost) { logEvent('session', 'Session ended'); net.applyingRemote = true; save(true); net.applyingRemote = false; }
        if ((wasClient || net.foreign) && !window.wpStream) load();   // foreign without a live link (a failed re-join) still leaves this way
    }
    syncSessionButtons();
}

/* ---------- asset sync: clients pull images from the host over the data channel ---------- */
var assetCache = {};    // path -> blob URL (pictures, pulled on render)
var assetPending = {};  // path -> true
var assetRenderTimer = null;
var assetWaiters = {};  // path -> { promise, resolve, reject, timer, parts, n, bytes }: sounds, pulled by net.fetchAsset and answered in parts
var assetInflight = {}; // host: peer -> path, one sound transfer at a time per peer
var ASSET_PART = 256 * 1024, AUDIO_CAP = 4 * 1024 * 1024, ASSET_WAIT = 45000;
function isAudioPath(p) { return typeof p === 'string' && p.indexOf('/saves/images/audio/') === 0; }

function assetMime(path) {
    var ext = (path.split('.').pop() || '').toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', webm: 'audio/webm' }[ext] || 'application/octet-stream';
}

// Resolve an image path for display. Host/solo: the path itself.
// Client in a session: cached blob URL, requesting it from the host if new.
net.assetSrc = function(path) {
    if (!path || !net.active || net.role !== 'client' || net.stream) return path;   // the stream window reads images straight from the local server
    if (/^(data:|blob:)/.test(path)) return path;   // already self-contained
    if (!/^\/?saves\//.test(path)) return path;     // shipped with the app (assets/…): every install has it
    if (assetCache[path]) return assetCache[path];
    if (!assetPending[path] && net.conns[0] && net.conns[0].open) {
        assetPending[path] = true;
        try { net.conns[0].send({ type: 'asset-req', path: path }); } catch (e) {}
    }
    // transparent 1px placeholder until the bytes arrive
    return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
};

function answerAsset(conn, path, error) { try { conn.send({ type: 'asset', path: path, error: error }); } catch (e) {} }
function handleAssetRequest(msg, conn) {
    // Serve only campaign images and sounds, never arbitrary paths
    if (typeof msg.path !== 'string' || msg.path.length > 400 || msg.path.indexOf('/saves/images/') !== 0 || msg.path.indexOf('..') !== -1) return;
    if (isAudioPath(msg.path)) {
        // a sound: one in flight per peer, a 4 MB cap, 256 KB parts so the heartbeats never queue behind a whole file, every refusal answered
        if (assetInflight[conn.peer]) { answerAsset(conn, msg.path, 'busy'); return; }
        assetInflight[conn.peer] = msg.path;
        var done = function() { if (assetInflight[conn.peer] === msg.path) delete assetInflight[conn.peer]; };
        fetch(encodeURI(msg.path)).then(function(r) { return r.ok ? r.arrayBuffer() : null; }).then(function(buf) {
            if (!conn.open) { done(); return; }
            if (!buf) { answerAsset(conn, msg.path, 'missing'); done(); return; }
            if (buf.byteLength > AUDIO_CAP) { answerAsset(conn, msg.path, 'too-big'); done(); return; }
            var n = Math.max(1, Math.ceil(buf.byteLength / ASSET_PART)), i = 0;
            (function pump() {
                if (!conn.open) { done(); return; }
                var end = Math.min(buf.byteLength, (i + 1) * ASSET_PART);
                try { conn.send({ type: 'asset-part', path: msg.path, i: i, n: n, data: new Uint8Array(buf.slice(i * ASSET_PART, end)) }); }
                catch (e) { answerAsset(conn, msg.path, 'busy'); done(); return; }
                i++;
                if (i < n) setTimeout(pump, 15); else done();
            })();
        }).catch(function() { answerAsset(conn, msg.path, 'missing'); done(); });
        return;
    }
    fetch(msg.path).then(function(r) { return r.ok ? r.arrayBuffer() : null; }).then(function(buf) {
        if (!buf || !conn.open) return;
        try { conn.send({ type: 'asset', path: msg.path, mime: assetMime(msg.path), data: new Uint8Array(buf) }); } catch (e) {}
    }).catch(function() {});
}

// A sound file from the host, for sound.js: one request, answered in parts (or with an error) and reassembled here.
// sound.js serialises its requests; the host allows one in flight per peer anyway. Rejects: offline, bad path, too-big, busy, missing, timeout, left.
net.fetchAsset = function(path, size) {
    if (!net.active || net.role !== 'client' || net.stream) return Promise.reject(new Error('offline'));
    if (!isAudioPath(path) || path.indexOf('..') !== -1 || path.length > 400) return Promise.reject(new Error('bad path'));
    if (Number(size) > AUDIO_CAP) return Promise.reject(new Error('too-big'));
    if (assetWaiters[path]) return assetWaiters[path].promise;
    var w = { parts: [], n: 0, bytes: 0 };
    w.promise = new Promise(function(resolve, reject) {
        w.resolve = resolve; w.reject = reject;
        var c = net.conns[0];
        if (!c || !c.open) { reject(new Error('offline')); return; }
        w.timer = setTimeout(function() { if (assetWaiters[path] === w) delete assetWaiters[path]; reject(new Error('timeout')); }, ASSET_WAIT);
        assetWaiters[path] = w;
        try { c.send({ type: 'asset-req', path: path }); } catch (e) { clearTimeout(w.timer); delete assetWaiters[path]; reject(new Error('busy')); }
    });
    return w.promise;
};
function handleAssetPart(msg) {
    var w = typeof msg.path === 'string' ? assetWaiters[msg.path] : null; if (!w) return;   // unsolicited: dropped, nothing kept
    var i = msg.i | 0, n = msg.n | 0, data = msg.data;
    if (!data || n < 1 || n > 64 || i < 0 || i >= n || (w.n && w.n !== n)) return;
    var len = data.byteLength || data.length || 0; if (!len) return;
    w.n = n; if (!w.parts[i]) w.bytes += len;
    if (w.bytes > AUDIO_CAP) { clearTimeout(w.timer); delete assetWaiters[msg.path]; w.reject(new Error('too-big')); return; }
    w.parts[i] = data;
    for (var k = 0; k < n; k++) if (!w.parts[k]) return;
    clearTimeout(w.timer); delete assetWaiters[msg.path];
    try { w.resolve(new Blob(w.parts, { type: assetMime(msg.path) })); } catch (e) { w.reject(e); }
}
function resetAssetTransfers() {
    Object.keys(assetWaiters).forEach(function(p) { var w = assetWaiters[p]; clearTimeout(w.timer); try { w.reject(new Error('left')); } catch (e) {} });
    assetWaiters = {}; assetPending = {}; assetInflight = {};
}

function handleAssetArrival(msg) {
    if (typeof msg.path === 'string' && assetWaiters[msg.path]) { var w = assetWaiters[msg.path]; clearTimeout(w.timer); delete assetWaiters[msg.path]; w.reject(new Error(typeof msg.error === 'string' ? msg.error.slice(0, 40) : 'failed')); return; }   // the only 'asset' answer to a sound request is a refusal (the bytes come as asset-part)
    if (!msg.path || !msg.data || !assetPending[msg.path]) return;   // unsolicited: never cached
    try {
        var blob = new Blob([msg.data], { type: msg.mime || assetMime(msg.path) });
        assetCache[msg.path] = URL.createObjectURL(blob);
    } catch (e) { return; }
    delete assetPending[msg.path];
    try { document.dispatchEvent(new CustomEvent('wp-asset', { detail: { path: msg.path } })); } catch (e) {}   // the handbook reader patches its pictures in place
    clearTimeout(assetRenderTimer);
    assetRenderTimer = setTimeout(function() { if (state.viewMode === 'visual') render(); }, 150);
}

/* ---------- dice: rolls at the table (dicecore.js validates and replays; dice.js draws the card) ----------
   The host makes every roll: a player sends { roll-req, rid, expr, priv? }, the host evaluates once and sends the
   record { roll, id, from, expr, draws, v, ts, priv?, to?, rid? } to the admitted peers (or to one), and every
   machine replays expr + draws through its own engine. Nothing rendered travels; nothing a client says is trusted. */
var diceLimit = null, _dicePending = null, _diceSlowSaid = {};
function DC() { return window.wpDiceCore || null; }
function sendTable(msg, exceptConn) {   // admitted peers only: broadcast() would reach a peer still waiting for the GM's Allow
    net.conns.forEach(function(c) { if (c !== exceptConn && c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) {} } });
}
function diceFrom(prof, gm) { return { id: String((prof && prof.id) || 'x').slice(0, 60), name: String((prof && prof.name) || (gm ? 'GM' : 'Player')).slice(0, 60), gm: !!gm }; }
function pushRoll(rec, res, scope, opts) {
    pushChat({ from: rec.from, text: '', scope: scope, ts: rec.ts, roll: rec, res: res, rollBad: res ? null : ((opts && opts.bad) || 'error'), toName: opts && opts.toName ? opts.toName : '' });
}
function diceSessionReset(clearChat) {
    if (_dicePending) { clearTimeout(_dicePending.timer); _dicePending = null; }
    if (diceLimit) diceLimit.reset();
    _diceSlowSaid = {};
    charSessionReset();
    if (clearChat) { chatLog = []; chatUnread = 0; renderChat(); }   // the table that is over keeps its chat and its rolls to itself
}
// Roll from here: a client asks the host; a host or a solo GM rolls at once. Returns { ok } or { error, pos?, len? }.
net.diceRoll = function(expr, o) {
    o = o || {}; var D = DC(), F = window.wpFormula;
    if (!D || !F) return { error: 'Dice are not available.' };
    if (net.stream) return { error: 'Not from the stream window.' };
    if (window.wpVtt && !window.wpVtt.on('dice')) return { error: D.denyText('off') };
    expr = D.cleanExpr(expr); if (!expr) return { error: 'Type a formula, for example 2d6 + 3 (up to ' + D.LIMITS.expr + ' characters).' };
    if (F.names(expr).length && !o.charId) return { error: D.denyText('names') };   // names come from a character's sheet (1.5.0)
    if (net.active && net.role === 'client') {
        if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open) return { error: 'Not at the table yet.' };
        if (_dicePending) return { error: 'Waiting for the GM to roll the last one.' };
        var rid = 'q' + Math.random().toString(36).slice(2, 10), req = { type: 'roll-req', rid: rid, expr: expr };
        if (o.priv) req.priv = 'gm';
        if (o.charId) req.charId = o.charId;
        if (o.label) req.label = String(o.label).slice(0, D.LIMITS.label);
        _dicePending = { rid: rid, expr: expr, timer: setTimeout(function() { _dicePending = null; if (window.wpDice) window.wpDice.onDeny({ reason: 'error', message: 'No answer from the GM. Their Waypoint may not have dice yet.', pos: 0, len: 0 }, expr); }, D.LIMITS.timeoutMs) };
        try { net.conns[0].send(req); } catch (e) { clearTimeout(_dicePending.timer); _dicePending = null; return { error: 'Could not reach the GM.' }; }
        return { ok: true, pending: true };
    }
    var campR = getActiveCampaign(), SR = SC(), chR = null, varsR = null;   // a character makes its sheet's names available (character sheets, 1.5.0)
    if (o.charId) { chR = campR && campR.chars && campR.chars[o.charId]; if (!chR || !campR.system || !SR) return { error: D.denyText('char') }; varsR = SR.makeResolver(campR.system, chR, F); }
    var res = F.evaluate(expr, varsR ? { vars: varsR } : {});
    if (!res.ok) return { error: res.error.message, pos: res.error.pos, len: res.error.len };
    var why = D.checkTableRoll(res); if (why) return { error: D.denyText(why) };
    var rec = { type: 'roll', id: D.uid(), from: diceFrom(getProfile(), true), expr: expr, draws: res.draws, v: F.VERSION, ts: Date.now() };
    if (res.breakdown && res.breakdown.names && res.breakdown.names.length) { var nmR = D.cleanNames(res.breakdown.names); if (!nmR) return { error: 'That roll could not be recorded.' }; if (nmR.length) rec.names = nmR; }
    if (o.label) rec.label = String(o.label).slice(0, D.LIMITS.label);
    if (chR) rec.as = String(chR.name || '').slice(0, D.LIMITS.label);
    var hosting = net.active && net.role === 'host', toName = '';
    if (o.priv) rec.priv = 'gm';
    else if (hosting && rec.names && SR && SR.gmOnlyNames(campR.system, rec.names).length) { rec.priv = 'gm'; toast('Kept private: that roll uses a GM-only value (' + SR.gmOnlyNames(campR.system, rec.names).join(', ') + ').'); }   // a public roll never carries a GM-only value
    else if (hosting) {
        var toKey = ui('chatTo') ? ui('chatTo').value : '';   // a whisper target makes the roll private to that player
        var target = toKey ? net.conns.find(function(c) { return c.peer === toKey; }) : null;
        if (target && target.open && net.roster[toKey]) { rec.to = toKey; toName = net.roster[toKey].name || 'a player'; try { target.send(rec); } catch (e) {} }
    }
    var scope = rec.priv || rec.to ? 'whisper' : 'global';
    if (hosting && scope === 'global') sendTable(rec, null);
    pushRoll(rec, res, scope, { toName: toName });
    logEvent('dice', D.cardText(rec, res, F, { maxChars: D.LIMITS.logChars, toName: toName }));
    return { ok: true, value: res.value, priv: !!rec.priv };
};

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
function chatEntryNode(m) {   // one text entry, built from nodes: nothing from the wire is ever parsed as HTML
    var whisper = m.scope === 'whisper', wrap = document.createElement('div');
    wrap.style.cssText = whisper ? 'margin-bottom:7px; border-left:2px solid var(--violet); padding-left:7px; font-style:italic;' : 'margin-bottom:7px;';
    var who = document.createElement('b'); who.style.color = playerColor(m.from); who.textContent = m.from.id === net.myId ? 'You' : (m.from.name || 'Player'); wrap.appendChild(who);
    if (m.from.gm) { var g = document.createElement('span'); g.className = 'chat-gm'; g.textContent = 'GM'; wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(g); }
    if (whisper) { var t = document.createElement('span'); t.className = 'chat-tag'; t.textContent = 'whisper'; wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(t); }
    var tm = document.createElement('span'); tm.className = 'chat-time'; tm.textContent = chatTime(m.ts); wrap.appendChild(tm);
    wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode(String(m.text || '')));
    return wrap;
}
function renderChat() {
    var log = ui('chatLog');
    if (!log) return;
    var frag = document.createDocumentFragment();
    chatLog.forEach(function(m) {
        var node = null;
        try { node = m.roll ? (window.wpDice ? window.wpDice.renderCard(m) : null) : chatEntryNode(m); } catch (e) { node = null; }   // one bad entry never blanks the panel
        if (node) frag.appendChild(node);
    });
    log.textContent = ''; log.appendChild(frag);
    log.scrollTop = log.scrollHeight;
    var badge = ui('chatBadge');
    if (badge) {
        badge.style.display = chatUnread > 0 ? 'block' : 'none';
        badge.textContent = chatUnread;
    }
}
// A roll opens Table Chat if it was closed; that auto-open dismisses itself after a few seconds (a fresh roll extends
// it). If the chat was already open, or the user opens/touches it, it stays — cancelChatDismiss() clears the flag.
var _chatRollOpened = false, _chatDismissTimer = null;
function cancelChatDismiss() { if (_chatDismissTimer) { clearTimeout(_chatDismissTimer); _chatDismissTimer = null; } _chatRollOpened = false; }
function armChatDismiss() {
    if (_chatDismissTimer) clearTimeout(_chatDismissTimer);
    _chatDismissTimer = setTimeout(function() {
        _chatDismissTimer = null;
        if (!_chatRollOpened) return;
        var p = ui('chatPanel');
        if (p && p.style.display !== 'none') { p.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel(); }
        _chatRollOpened = false;
    }, 6000);
}
function pushChat(m) {
    chatLog.push(m);
    if (chatLog.length > 200) chatLog.shift();
    var panel = ui('chatPanel');
    var closed = !panel || panel.style.display === 'none';
    if (m.roll && panel && closed) {   // a roll always surfaces Table Chat so everyone sees the result (no toast needed then)
        panel.style.display = 'flex'; chatUnread = 0; refreshChatRecipients(); closed = false;
        _chatRollOpened = true;
    }
    if (m.roll && _chatRollOpened) armChatDismiss();   // dismiss the roll-opened chat after a few seconds; a fresh roll re-arms it
    if (closed) {
        if (m.from.id !== net.myId) {
            chatUnread++;
            var line = m.roll ? (window.wpDice ? window.wpDice.line(m) : 'a roll') : (m.from.gm ? 'GM' : (m.from.name || 'Player')) + (m.scope === 'whisper' ? ' (private): ' : ': ') + m.text.slice(0, 60);
            toast(String(line).slice(0, 120));
        }
    }
    renderChat();
    if (m.roll && window.wpDice) window.wpDice.landed(m);   // this machine's own dice cue, if wanted
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
    var cmd = DC() ? DC().parseCommand(text) : null;   // /roll, /r, /gmroll, /gr work with or without a session
    if (cmd) { input.value = ''; var rr = window.wpDice ? window.wpDice.roll(cmd.expr, { priv: cmd.cmd === 'gmroll', source: 'chat' }) : net.diceRoll(cmd.expr, { priv: cmd.cmd === 'gmroll' }); if (rr.error) toast(rr.error); return; }
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
    if (net.role === 'host' && msg.scope !== 'whisper') logEvent('chat', 'GM: ' + String(msg.text || '').slice(0, 300));
}

var _chatBtn = ui('chatBtn');
if (_chatBtn) _chatBtn.addEventListener('click', function() {
    cancelChatDismiss();   // the user is driving the chat now — no auto-dismiss
    var panel = ui('chatPanel');
    var opening = panel.style.display === 'none';
    panel.style.display = opening ? 'flex' : 'none';
    if (opening) { chatUnread = 0; refreshChatRecipients(); renderChat(); var i = ui('chatInput'); if (i) i.focus(); }
});
// touching the chat or the dice roller cancels the roll auto-dismiss (the player is reading / rolling)
['chatPanel', 'dicePanel'].forEach(function(id) { var p = ui(id); if (p) { p.addEventListener('pointerdown', cancelChatDismiss); p.addEventListener('focusin', cancelChatDismiss); } });
var _chatClose = ui('chatCloseBtn');
if (_chatClose) _chatClose.addEventListener('click', function() { cancelChatDismiss(); ui('chatPanel').style.display = 'none'; });
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
            '<img class="roster-avatar" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color || ('hsl(' + playerHue(pid) + ',55%,60%)')) : '') + '" alt="">' +   // no photo → the color-tinted silhouette default (the name shows beside it)
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
// Required identity: a name must be set (typed here or saved in Settings) before hosting or joining,
// so every player is known by a stable name at the table.
function ensureNamed() {
    var el = ui('netNameInput');
    var typed = (el && el.value || '').trim();
    if (typed) { setProfileName(typed); return true; }
    if ((getProfile().name || '').trim()) return true;
    toast('Enter your name first — that is how players know you at the table.');
    if (el && el.offsetParent !== null) el.focus();
    else if (window.wpOpenSettings) window.wpOpenSettings('profile', 'setNameInput');
    return false;
}
var _hostBtn = ui('netHostBtn');
if (_hostBtn) _hostBtn.addEventListener('click', function() { if (!ensureNamed()) return; startHosting(false); });   // (passing the event made every host "force fresh": the old code was never resumed)
var _joinBtn = ui('netJoinBtn');
if (_joinBtn) _joinBtn.addEventListener('click', function() {
    var code = (ui('netCodeInput').value || '').trim();
    if (code.length < 4) { toast('Enter the room code.'); return; }
    if (!ensureNamed()) return;
    joinSession(code, (ui('netNameInput').value || '').trim());
});
var _leaveBtn = ui('netLeaveBtn');
if (_leaveBtn) _leaveBtn.addEventListener('click', function() { net.leaveSessionConfirm(); });

/* ---------- Refresh: reload without losing the session ---------- */
var _refreshBtn = ui('refreshBtn');
if (_refreshBtn) _refreshBtn.addEventListener('click', function() {
    try {
        if (net.active && net.role === 'client') sessionStorage.setItem('wp_rejoin', JSON.stringify({ code: net.code, name: getProfile().name || '', pass: (ui('netJoinPassInput') || {}).value || '' }));
        else if (net.active && net.role === 'host') sessionStorage.setItem('wp_rehost', '1');
    } catch (e) {}
    location.reload();
});
// after a refresh: straight back to where you were
setTimeout(function() {
    var rj = null, rh = null;
    try { rj = sessionStorage.getItem('wp_rejoin'); rh = sessionStorage.getItem('wp_rehost'); sessionStorage.removeItem('wp_rejoin'); sessionStorage.removeItem('wp_rehost'); } catch (e) {}
    if (rj) {
        try {
            var j = JSON.parse(rj);
            if (j && j.code) {
                var ci = ui('netCodeInput'), ni = ui('netNameInput'), pi = ui('netJoinPassInput');
                if (ci) ci.value = j.code; if (ni && j.name) ni.value = j.name; if (pi) pi.value = j.pass || '';
                toast('Refreshed — rejoining the table…');
                joinSession(j.code, j.name);
            }
        } catch (e) {}
    } else if (rh) {
        toast('Refreshed — resuming your table with the same room code…');
        startHosting(false);
    }
}, 1200);
/* The GM gets one clear "End Session for Everyone" (the host's Leave was the same
   teardown, but its label read like a player's exit). Players keep Leave Session. */
function syncSessionButtons() {
    var cbtn = ui('chatBtn');
    var diceOn = !!(window.wpVtt && window.wpVtt.on('dice'));
    if (cbtn) { cbtn.classList.toggle('needs-session', !net.active && !diceOn); cbtn.dataset.tip = net.active ? 'Table chat and dice' : diceOn ? 'Table chat and dice — chat needs a session; dice roll here anyway' : 'Table chat — needs a session (host or join one first)'; cbtn.removeAttribute('title'); }
    var hosting = !!(net.active && net.role === 'host');
    var endB = ui('netEndBtn'), leaveB = ui('netLeaveBtn');
    if (endB) endB.style.display = hosting ? 'block' : 'none';
    if (leaveB) leaveB.style.display = hosting ? 'none' : 'block';
    var pauseHdr = ui('sessionPauseBtn');
    if (pauseHdr) pauseHdr.style.display = hosting ? '' : 'none';   // the header pause button is a host-only session control
    refreshPauseUi();   // keep its label in step whenever the session buttons resync
}
var _endBtn = ui('netEndBtn');
if (_endBtn) _endBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') { syncSessionButtons(); return; }
    var n = net.conns.length;
    import('./dialogs.js').then(function(d) {
        d.showConfirm('End the session for everyone?' + (n ? ' ' + n + ' player' + (n === 1 ? '' : 's') + ' will be told the session ended and returned to their own campaigns.' : '') + ' The room code is retired.', function(yes) {
            if (!yes) return;   // Cancel and Esc keep the table running
            leaveSession(false);
            ui('netModal').style.display = 'none';
        });
    });
});
syncSessionButtons();
// Bring one connection's player to the GM's current map (the table's stage).
function summonConn(c, stage) {
    var p = net.roster[c.peer];
    if (p) { p.detached = false; p.location = stage.itemId; ensurePlayerToken(p.id, stage.itemId); }
    if (c.open) { try { c.send({ type: 'stage', stage: stage, personal: true }); } catch (e) {} }
    if (c.open && net.sendFxArrival) net.sendFxArrival(c, stage.itemId);
    return p;
}
net.summonPlayer = function(peerKey) {
    if (!net.active || net.role !== 'host') return;
    var stage = currentStage();
    var c = net.conns.find(function(x) { return x.peer === peerKey; });
    if (!stage || !c) return;
    var p = summonConn(c, stage);
    renderRoster();
    broadcastRoster();
    toast((p && p.name ? p.name : 'Player') + ' summoned to your map.');
};
net.summonPlayerById = function(playerId) {
    var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === playerId; });
    if (!key) { toast('That player is not connected right now.'); return false; }
    net.summonPlayer(key);
    return true;
};
net.summonAll = function() { var b = ui('netSummonBtn'); if (b) b.click(); };
// The map players currently arrive on / follow to (pinned override, else the GM's map). Lets the
// party menu tell "the table's map" apart from "the map I'm looking at" when they differ.
net.stagedMapId = function() { var s = currentStage(); return s ? s.itemId : null; };
// Summon ONE connected player to a specific map (the one the GM is viewing), leaving the table's
// pinned map and everyone else untouched — a "scout ahead" move.
net.summonPlayerToMap = function(playerId, mapId) {
    if (!net.active || net.role !== 'host') return false;
    var camp = getActiveCampaign();
    if (!camp || !camp.items[mapId] || camp.items[mapId].type !== 'map') { toast('Open a play map first.'); return false; }
    var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === playerId; });
    if (!key) { toast('That player is not connected right now.'); return false; }
    var c = net.conns.find(function(x) { return x.peer === key; });
    if (!c) return false;
    var p = summonConn(c, { campId: camp.id, itemId: mapId });
    renderRoster();
    broadcastRoster();
    toast((p && p.name ? p.name : 'Player') + ' summoned to ' + ((camp.items[mapId].meta && camp.items[mapId].meta.title) || 'this map') + '.');
    return true;
};
// Summon EVERYONE to a specific map and re-pin the table there, so the follow model stays coherent
// (the whole table is now on this map — late joiners and Follow-me should land here too).
net.summonAllToMap = function(mapId) {
    if (!net.active || net.role !== 'host') return false;
    var camp = getActiveCampaign();
    if (!camp || !camp.items[mapId] || camp.items[mapId].type !== 'map') { toast('Open a play map first.'); return false; }
    net.stageMode = null;
    net.stageOverride = mapId;                                              // pin the table to this map
    net.stagePicked[camp.id] = { mode: null, fallback: net.stageFallback }; // the GM chose; stop defaulting
    Object.values(net.roster).forEach(function(p) { if (p) p.detached = false; });   // everyone follows again
    refreshStageSelect();
    var stage = { campId: camp.id, itemId: mapId };
    net.conns.forEach(function(c) { summonConn(c, stage); });
    renderRoster();
    broadcastRoster();
    toast('Everyone summoned to ' + ((camp.items[mapId].meta && camp.items[mapId].meta.title) || 'this map') + '; table pinned here.');
    return true;
};
// Host: send the players a fresh copy of these maps (after a lock change, say)
net.pushItems = function(ids) {
    if (!(net.active && net.role === 'host')) return;
    var camp = getActiveCampaign(); if (!camp) return;
    (ids || []).forEach(function(id) { if (camp.items[id]) net.broadcastItemFiltered(camp.id, id); });
};
net.logEvent = logEvent;
net.syncSessionButtons = syncSessionButtons;
(function() {
    var b = ui('netCombatBtn'); if (!b) return;
    b.addEventListener('click', function() {
        if (!(net.active && net.role === 'host')) { toast('Host a session first — combat runs at the table.'); return; }
        var camp = getActiveCampaign(), am = camp && camp.items[camp.activeItemId];
        if (!am || am.type !== 'map') { toast('Open the play map the fight is on first.'); return; }
        ui('netModal').style.display = 'none';
        if (window.wpOpenCombat) window.wpOpenCombat(am.id, {});
    });
})();
// Session Log window
var _logKinds = { session: 'Session', player: 'Players', handout: 'Handouts', travel: 'Travel', share: 'Shares', chat: 'Chat', dice: 'Dice', table: 'Table' };
function fmtLogTime(ts) { var d = new Date(ts); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
net.openSessionLog = function() {
    var m = ui('sessionLogModal'), list = ui('sessionLogList'), sel = ui('sessionLogKind'); if (!m || !list) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var kind = sel ? sel.value : '';
    var log = (camp.sessionLog || []).filter(function(e) { return !kind || e.kind === kind || e.kind === 'session'; });
    if (!log.length) { list.innerHTML = '<div style="color:var(--dim); padding:12px; line-height:1.5;">Nothing logged yet. Host a session and the table\'s events — joins, handouts, crossings, chat, shares — are written here as they happen.</div>'; }
    else {
        // grouped by session, newest session first; inside a session the newest line is at the top
        var groups = [], cur = null;
        log.forEach(function(e) {
            if (e.kind === 'session' && /started|resumed/.test(e.text)) { cur = { head: e, rows: [] }; groups.push(cur); return; }
            if (!cur) { cur = { head: null, rows: [] }; groups.push(cur); }
            cur.rows.push(e);
        });
        function hm(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        var html = '';
        groups.slice().reverse().forEach(function(g) {
            var ended = g.rows.filter(function(e) { return e.kind === 'session'; }).pop();
            var when = g.head ? new Date(g.head.at).toLocaleDateString() + ' ' + hm(g.head.at) : (g.rows[0] ? new Date(g.rows[0].at).toLocaleDateString() : '');
            html += '<div class="log-session">' + escText(when) + ' · ' + escText(g.head ? g.head.text : 'Between sessions') + (ended ? ' <span class="log-ended">→ ended ' + escText(hm(ended.at)) + '</span>' : '') + '</div>';
            g.rows.slice().reverse().forEach(function(e) {
                if (e.kind === 'session') return;
                html += '<div class="log-row"><span class="log-time">' + escText(hm(e.at)) + '</span><span class="log-kind k-' + escText(e.kind) + '">' + escText(_logKinds[e.kind] || e.kind) + '</span><span class="log-text">' + escText(e.text) + '</span></div>';
            });
        });
        list.innerHTML = html;
    }
    m.style.display = 'flex';
};
(function() {
    var sel = ui('sessionLogKind'); if (sel) sel.addEventListener('change', function() { net.openSessionLog(); });
    var close = ui('sessionLogClose'); if (close) close.addEventListener('click', function() { ui('sessionLogModal').style.display = 'none'; });
    var open = ui('netLogBtn'); if (open) open.addEventListener('click', function() { net.openSessionLog(); });
    var saveB = ui('sessionLogSave'); if (saveB) saveB.addEventListener('click', function() {
        var camp = getActiveCampaign(); if (!camp) return;
        var lines = (camp.sessionLog || []).map(function(e) { return fmtLogTime(e.at) + '  [' + (_logKinds[e.kind] || e.kind) + ']  ' + e.text; });
        var blob = new Blob([(camp.name || 'Campaign') + ' — session log\n\n' + lines.join('\n') + '\n'], { type: 'text/plain' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (camp.name || 'campaign').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-session-log.txt';
        document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        toast('Session log saved as text.');
    });
    var clearB = ui('sessionLogClear'); if (clearB) clearB.addEventListener('click', function() {
        var camp = getActiveCampaign(); if (!camp || !(camp.sessionLog || []).length) return;
        (function() { showConfirm('Clear the session log for ' + (camp.name || 'this campaign') + '? ' + camp.sessionLog.length + ' lines go. Save it as text first if you want to keep it.', function(yes) { if (!yes) return; camp.sessionLog = []; save(true); net.openSessionLog(); }); })();
    });
})();
net.togglePause = function() { var b = ui('netPauseBtn'); if (b) b.click(); };
net.toggleTravelLock = function() { var b = ui('netTravelLockBtn'); if (b) b.click(); };
net.endSession = function() { var b = ui('netEndBtn'); if (b) b.click(); };   // asks first, like the panel
if (!net.leaveSession) net.leaveSession = leaveSession;
// Leave, with a confirm (panel button and the play-map menu both use this)
net.leaveSessionConfirm = function() {
    if (!net.active && !net.foreign) return;
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Leave the session? Your own campaign comes back on screen. You can rejoin with the same room code.', function(yes) {
            if (!yes) return;   // Cancel and Esc stay at the table
            leaveSession(false);
            var nm = ui('netModal'); if (nm) nm.style.display = 'none';
        });
    });
};
// Between sessions (or for a player who is not connected): move that player's token to a point on
// the active map, taking it off whichever map it was on. Connected players are summoned instead.
net.bringPlayerHere = function(pid, wbX, wbY) {
    if (net.active && net.role === 'host' && Object.keys(net.roster).some(function(k) { return net.roster[k] && net.roster[k].id === pid; })) return net.summonPlayerById(pid);
    var camp = getActiveCampaign(); var map = camp && getActiveMap();
    if (!camp || !map || map.type !== 'map') { toast('Open a play map first.'); return false; }
    var pl = (camp.players || {})[pid] || {}, name = pl.name || 'that player';
    map.whiteboard = map.whiteboard || [];
    var here = map.whiteboard.filter(function(w) { return w.isChar && w.ownerId === pid; });
    var tok = here[0] || null, copied = false;
    if (here.length > 1) here.slice(1).forEach(function(w) { delete w.ownerId; });   // one owned token per map
    if (!tok) {
        var src = null;
        Object.values(camp.items).some(function(it) {
            if (it.type !== 'map' || it === map) return false;
            var w = (it.whiteboard || []).find(function(x) { return x.isChar && x.ownerId === pid; });
            if (w) { src = w; return true; }
            return false;
        });
        if (!src && pl.charName) {
            var loose = map.whiteboard.find(function(x) { return x.isChar && !x.ownerId && x.charName === pl.charName; });
            if (loose) { loose.ownerId = pid; tok = loose; }
            else Object.values(camp.items).some(function(it) {
                if (it.type !== 'map') return false;
                var w = (it.whiteboard || []).find(function(x) { return x.isChar && !x.ownerId && x.charName === pl.charName; });
                if (w) { src = w; return true; }
                return false;
            });
        }
        if (!tok && src) {
            tok = JSON.parse(JSON.stringify(src));
            tok.id = 'wb' + Math.random().toString(36).slice(2, 10);
            tok.ownerId = pid;
            map.whiteboard.push(tok); copied = true;
        }
    }
    if (!tok) { toast('No token for ' + name + ' yet — one appears when they first join with a character.'); return false; }
    tok.x = wbX - (tok.w || 60) / 2; tok.y = wbY - (tok.h || 52) / 2;
    delete tok.hidden;
    if (window.wpSeatHex) window.wpSeatHex(tok, map);
    save(true);
    if (window.appRender) window.appRender();
    if (net.active && net.role === 'host') net.broadcastItemFiltered(camp.id, map.id);
    toast(name + (copied ? ' placed on ' : ' moved here on ') + ((map.meta || {}).title || 'this map') + '.');
    return true;
};net.isConnected = function(playerId) { return Object.values(net.roster).some(function(p) { return p && p.id === playerId; }); };
var _summonBtn = ui('netSummonBtn');
if (_summonBtn) _summonBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    var stage = currentStage();
    if (!stage) return;
    net.conns.forEach(function(c) { summonConn(c, stage); });
    renderRoster();
    broadcastRoster();
    toast('All players summoned to your map.');
});
var _copyBtn = ui('netCopyBtn');
if (_copyBtn) _copyBtn.addEventListener('click', function() {
    if (net.code && navigator.clipboard) { navigator.clipboard.writeText(net.code.toUpperCase()); toast('Room code copied.'); }
});

export { net };
