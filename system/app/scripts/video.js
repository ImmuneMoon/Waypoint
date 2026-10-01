/* Campaign videos (1.5.0, backlog item 21) — the DOM half: the GM's Video panel, opened from the Scene menu (🎬 ▸ Video). It
   holds the campaign's video library (add videos from this computer, rename, delete) and a player to watch one on this screen,
   in a panel moved by its head, resized from its corner and put full screen. The files live in the saves folder under
   images/video/<campaign>/; the library (camp.videos) is the GM's alone. While hosting, Show to players sends the video on the
   stage live to the table (V2): the picture and its sound over a connection of its own from the host (net.js), to everyone or
   the players ticked; the GM plays, pauses and seeks for all, and it closes on their screens when it ends or is stopped. A player sees it
   in this same panel in its watch mode (no library, no controls but their own sound, full screen and close), reopened from a
   chip in the header while it plays. The pure half (the cleaner, the paths, the words) is videocore.js. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { showConfirm } from './dialogs.js';
import { esc } from './safecore.js';
import { safeId, isVideoPath, videoSrc, cleanName, cleanVideo, cleanVideos, diskName, nameOf, newId, fmtSize, fmtDur, sumLine } from './videocore.js';

var ui = function(id) { return document.getElementById(id); };
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('video') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function netOf() { return window.wpNet || null; }
function hosting() { var n = netOf(); return !!(n && n.active && n.role === 'host'); }

var panelOpen = false, showing = null, uploading = null, lastSig = '';
var live = null;                      // V2: the showing to the table — { id, cap: the captured stream }
var aud = { all: true, pids: {} };    // who the next showing goes to: everyone, or the ticked profiles (keys '$' + profile id)
var loop = false;                     // the stage's Loop tick
var tableSig = '';
var watch = null;                     // V2, a player's side: the GM's video — { name, open, lost, forced }

/* ---------- the campaign's library (camp.videos: read cleaned, written back cleaned) ---------- */
function lib(camp) { camp = camp || getActiveCampaign(); return camp ? cleanVideos(camp.videos) : []; }
function libW(camp) { camp = camp || getActiveCampaign(); if (!camp) return null; camp.videos = cleanVideos(camp.videos); return camp.videos; }

// [sinkcheck:videopanel-start]
// What the panel's body shows, as markup: every name and number through esc, every id as a data attribute through esc
function metaOf(v) { return [v.dur ? fmtDur(v.dur) : '', fmtSize(v.size), v.w && v.h ? v.w + '×' + v.h : ''].filter(Boolean).join(' · '); }
function rowsHtml(list, activeId) {
    return list.map(function(v) {
        return '<div class="vid-row' + (v.id === activeId ? ' active' : '') + '" data-id="' + esc(v.id) + '">'
            + '<button class="tool ghost vid-show" title="Watch it here">&#9654;</button>'
            + '<input class="vid-name" value="' + esc(v.name) + '" maxlength="60" aria-label="Name" title="Rename it: players see this name when it plays">'
            + '<span class="vid-meta">' + esc(metaOf(v)) + '</span>'
            + '<button class="tool ghost vid-del" title="Delete the video (and its file from your saves folder)">&#128465;</button></div>';
    }).join('');
}
function bodyHtml(on, list, activeId, up) {
    if (!on) return '<div class="snd-none">Video is off for this campaign — switch it on in &#9881; Settings &#9656; VTT features.</div>';
    return '<div class="vid-top"><button class="tool vid-add" title="Add video files from your computer: MP4 (H.264) or WebM play everywhere; M4V, OGV and MOV when this app can play them. A file stays in your saves folder, whatever its size">&#8853; Add videos&hellip;</button>'
        + '<span class="vid-up" aria-live="polite">' + (up ? esc('Adding ' + up.name + ' — ' + up.pct + '%') : '') + '</span></div>'
        + (list.length ? '<div class="vid-rows">' + rowsHtml(list, activeId) + '</div><div class="vid-foot">' + esc(sumLine(list)) + '</div>' : '<div class="snd-none">No videos in this campaign yet.</div>');
}
// [sinkcheck:videopanel-end]

// [videocheck:players-start]
// The players connected now, one row per profile, for the Show to ticks: [{ id, name }]
function tablePlayers(n) {
    var seen = {}, out = [];
    if (!n || !n.active || n.role !== 'host' || !n.roster) return out;
    Object.keys(n.roster).forEach(function(peer) {
        var p = n.roster[peer];
        if (!p || typeof p.id !== 'string' || !p.id || seen['$' + p.id]) return;
        seen['$' + p.id] = 1; out.push({ id: p.id, name: typeof p.name === 'string' && p.name ? p.name : 'Player' });
    });
    return out;
}
// The profiles a showing goes to: null for everyone, else the ticked ones among the players connected (none ticked: an empty list, nothing to show)
function audienceOf(a, players) {
    if (!a || a.all !== false) return null;
    return players.filter(function(p) { return !!a.pids && a.pids['$' + p.id] === true; }).map(function(p) { return p.id; });
}
// What a showing's line says: who is being sent it now, and who of its audience is not (still connecting, their own Video off, no route)
function liveWords(all, names, waiting) {
    names = names || []; waiting = waiting || [];
    var head = all ? 'Showing to everyone' : 'Showing to the players you ticked';
    if (!names.length && !waiting.length) return head + (all ? ' (nobody is connected yet)' : ' (none of them is connected)');
    return head + (names.length ? ': ' + names.join(', ') : '') + (waiting.length ? '. Waiting for: ' + waiting.join(', ') : '');
}
// [videocheck:players-end]

// [sinkcheck:videotable-start]
// The stage's table row, as markup — who the video is shown to, and the buttons: every name through esc, every id a data attribute through esc
function tableHtml(m) {   // m: { host, live, loop, all, players: [{ id, name, on }], words }
    var loopTick = '<label class="vid-tick" title="Play it round and round until you stop it (a mood clip). Without it, a video that reaches its end closes on the players&rsquo; screens by itself"><input type="checkbox" class="vid-loop"' + (m.loop ? ' checked' : '') + '> Loop</label>';
    if (!m.host) return '<div class="vid-table"><span class="vid-note">Host a table (&#127760;) to show this video to your players.</span>' + loopTick + '</div>';
    if (m.live) return '<div class="vid-table"><button class="tool vid-stop" title="Stop showing it: it closes on the players&rsquo; screens">&#9632; Stop showing</button><span class="vid-live-line" role="status">&#9679; ' + esc(m.words) + '</span>' + loopTick + '</div>';
    var ticks = '<label class="vid-tick"><input type="checkbox" class="vid-all"' + (m.all ? ' checked' : '') + '> Everyone</label>'
        + m.players.map(function(p) { return '<label class="vid-tick"><input type="checkbox" class="vid-who" data-pid="' + esc(p.id) + '"' + (m.all ? ' disabled checked' : p.on ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('');
    return '<div class="vid-table"><button class="tool vid-go" title="Show this video live to the players ticked here: they see and hear what plays in your panel — you play, pause and seek for everyone">&#128225; Show to players</button><span class="vid-aud" role="group" aria-label="Show to">' + ticks + '</span>' + loopTick + '</div>';
}
// [sinkcheck:videotable-end]

/* ---------- the panel ---------- */
function sigOf(camp, on, list) { return (camp ? camp.id : '') + '|' + (on ? 1 : 0) + '|' + JSON.stringify(list) + '|' + showing + '|' + (uploading ? 1 : 0); }
function render(force) {
    var p = ui('videoPanel'); if (!p) return;
    if (watch) { renderWatch(); return; }   // a player's side: the GM's video has the panel
    var camp = getActiveCampaign();
    if (!panelOpen || !camp || !canWrite()) { if (p.style.display !== 'none') { p.style.display = 'none'; hideVideo(); } lastSig = ''; return; }
    var on = featureOn(), list = lib(camp);
    if (showing && (!on || !list.some(function(v) { return v.id === showing; }))) hideVideo();   // switched off, or its entry went
    var sig = sigOf(camp, on, list);
    if (p.style.display === 'none') p.style.display = 'flex';
    renderTable(force);
    if (!force && sig === lastSig) return;   // a render with nothing new keeps the body (a name being typed keeps its caret)
    lastSig = sig;
    ui('videoBody').innerHTML = bodyHtml(on, list, showing, uploading);
    p.classList.toggle('vid-staged', !!showing);   // the picture takes the room; with none shown the list does
    var full = ui('videoFullBtn'); if (full) full.disabled = !showing;
}
function tableModel() {
    var n = netOf(), who = live && n && n.videoAudience ? n.videoAudience() : null;
    return { host: hosting(), live: !!live, loop: loop, all: live ? !!(who && who.all) : aud.all !== false,
        players: live ? [] : tablePlayers(n).map(function(p) { return { id: p.id, name: p.name, on: aud.pids['$' + p.id] === true }; }),
        words: live ? liveWords(!!(who && who.all), who ? who.names : [], who ? who.waiting : []) : '' };
}
// The stage's table row: drawn only when what it shows changed (a tick being pressed keeps its place)
function renderTable(force) {
    var box = ui('videoTable'), p = ui('videoPanel'); if (!box || !p) return;
    if (!showing || watch) { if (box.style.display !== 'none') { box.style.display = 'none'; box.textContent = ''; } tableSig = ''; p.classList.remove('vid-live'); return; }
    var m = tableModel(), sig = JSON.stringify(m);
    if (box.style.display === 'none') box.style.display = '';
    p.classList.toggle('vid-live', !!live);
    if (!force && sig === tableSig) return;
    var act = document.activeElement, cl = act && box.contains(act) ? act.classList : null, pid = cl && cl.contains('vid-who') ? String(act.dataset.pid || '') : null;
    var back = !cl ? '' : (cl.contains('vid-go') || cl.contains('vid-stop')) ? '.vid-go, .vid-stop' : cl.contains('vid-all') ? '.vid-all' : cl.contains('vid-loop') ? '.vid-loop' : '';
    tableSig = sig; box.innerHTML = tableHtml(m);
    var again = pid !== null ? Array.prototype.find.call(box.querySelectorAll('.vid-who'), function(x) { return x.dataset.pid === pid; }) : back ? box.querySelector(back) : null;
    if (again && !again.disabled) again.focus();
}
function openPanel() {
    if (!canWrite()) { toast('Not while you\'re at someone else\'s table.'); return; }
    panelOpen = true; placePanel(); render(true);
    var b = ui('videoBtn'); if (b) b.classList.add('active');
}
function closePanel() {
    panelOpen = false; hideVideo(); render(true);
    var b = ui('videoBtn'); if (b) b.classList.remove('active');
}
function placePanel() {
    var p = ui('videoPanel'); if (!p) return;
    try {
        var pos = JSON.parse(pref('wp_videoPanel', 'null'));
        if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 120, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 60, pos.y)) + 'px'; p.style.right = 'auto'; }
        if (pos && isFinite(pos.w) && isFinite(pos.h)) { p.style.width = clampW(pos.w) + 'px'; p.style.height = clampH(pos.h) + 'px'; }
    } catch (e) {}
}
// [videocheck:clamp-start]
function clampW(w) { return Math.round(Math.max(300, Math.min(window.innerWidth - 8, w))); }
function clampH(h) { return Math.round(Math.max(200, Math.min(window.innerHeight - 8, h))); }
// [videocheck:clamp-end]
function remember() { var p = ui('videoPanel'), r = p.getBoundingClientRect(), o = { x: Math.round(r.left), y: Math.round(r.top) }; if (p.style.height) { o.w = Math.round(r.width); o.h = Math.round(r.height); } setPref('wp_videoPanel', JSON.stringify(o)); }

/* ---------- watching one here ---------- */
function showVideo(v) {
    var el = ui('videoEl'), stage = ui('videoStage'), src = v ? videoSrc(v.path) : ''; if (!el || !stage) return;
    if (!src) { toast('That video has no file this app can open.'); return; }
    if (live && live.id !== v.id) stopShowing('No longer showing to players: press Show to players for this one.');   // another video on the stage never goes out by itself
    showing = v.id; stage.style.display = '';
    ui('videoCaption').textContent = v.name;
    if (el.getAttribute('src') !== src) el.src = src;
    el.loop = loop;
    render(true);
}
function hideVideo() {
    var el = ui('videoEl'), stage = ui('videoStage');
    stopShowing();   // what leaves the stage leaves the players' screens
    showing = null;
    if (el) { try { el.pause(); } catch (e) {} if (el.hasAttribute('src')) { el.removeAttribute('src'); try { el.load(); } catch (e) {} } }
    if (watch) return;   // a player's side: the stage is the GM's video's
    if (stage) stage.style.display = 'none';
    var fs = document.fullscreenElement;
    if (fs && stage && (fs === stage || stage.contains(fs))) document.exitFullscreen().catch(function() {});
    setMax(false);
}
// Full screen for the picture; where the window refuses it or never answers (a host that grants no full screen), the panel fills
// the app's window instead
function hasPicture() { return !!(showing || (watch && watch.open)); }
function setMax(on) { var p = ui('videoPanel'); if (p) p.classList.toggle('vid-max', !!on); }
function toggleFull() {
    var stage = ui('videoStage'), p = ui('videoPanel'); if (!stage || !p || !hasPicture()) return;
    if (p.classList.contains('vid-max')) { setMax(false); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(function() {}); return; }
    if (!stage.requestFullscreen || document.fullscreenEnabled === false) { setMax(true); return; }
    var settled = false;
    stage.requestFullscreen().then(function() { settled = true; }, function() { settled = true; setMax(true); });
    setTimeout(function() { if (!settled && !document.fullscreenElement && hasPicture()) setMax(true); }, 1200);
}
function leaveFull() {
    var stage = ui('videoStage'), fs = document.fullscreenElement;
    if (fs && stage && (fs === stage || stage.contains(fs))) document.exitFullscreen().catch(function() {});
    setMax(false);
}

/* ---------- showing it to the table (V2): the stage, live ---------- */
function stopTracks(cap) { if (cap && cap.getTracks) cap.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} }); }
function startShowing() {
    var n = netOf(), el = ui('videoEl'), v = showing ? lib().find(function(x) { return x.id === showing; }) : null;
    if (!v || !el || live || !canWrite() || !featureOn()) return;
    if (!hosting() || !n.videoShow) { toast('Host a table first: then your players can be shown it.'); renderTable(true); return; }
    if (typeof el.captureStream !== 'function') { toast('This app cannot show a video to players from here.'); return; }
    if (el.error) { toast('This file cannot be played, so it cannot be shown.'); return; }
    if (el.readyState < 1) { toast('The video is still loading — try again in a moment.'); return; }
    if (el.ended) { try { el.currentTime = 0; } catch (e) {} }   // at its end there is nothing to send: back to the start
    var pids = audienceOf(aud, tablePlayers(n));
    if (pids && !pids.length) { toast('Tick at least one player, or Everyone.'); return; }
    var cap = null; try { cap = el.captureStream(); } catch (e) { cap = null; }
    if (!cap || !cap.getVideoTracks().length) { stopTracks(cap); toast('This video cannot be shown from here yet — press play once, then Show to players.'); return; }
    var who = n.videoShow(cap, v.name, pids, el.videoWidth, el.videoHeight);
    if (!who) { stopTracks(cap); toast('It could not be shown: is the table still up?'); return; }
    live = { id: v.id, cap: cap };
    renderTable(true);
    streamPost(); streamTicking(true);
    toast('Showing "' + v.name + '" to ' + (pids ? (who.names.concat(who.waiting).join(', ') || 'the players you ticked') : 'everyone') + ': what plays here plays for them.');
}
function stopShowing(why) {
    if (!live) return;
    var l = live, n = netOf(); live = null;
    if (n && n.videoStop) n.videoStop();
    stopTracks(l.cap);
    renderTable(true);
    streamTicking(false); streamPost();
    if (why) toast(why);
}
// [videocheck:streamstage-start]
// The stream window (the GM's second window, screen-shared to a spectator): it is told what is being shown to players over
// BroadcastChannel('waypoint') and plays the same file itself from the local server — the picture at the GM's position, never the capture.
// Posted when a showing starts or stops, when the GM plays, pauses or seeks, and once a second while it plays; the stream window asks on load.
// Only a GM's main window posts (never a player's app, never the stream window); nothing is sent while nothing is shown to players
var streamChan = null; try { streamChan = new BroadcastChannel('waypoint'); } catch (e) {}
function stageMsg(v, el, isLive) {
    var on = !!(v && el && isLive);
    return { type: 'video-stage', now: on ? { id: v.id, name: v.name, path: v.path, pos: Math.round((Number(el.currentTime) || 0) * 10) / 10, playing: !el.paused && !el.ended, loop: el.loop === true, live: true } : null };
}
function streamPost() {
    if (!streamChan || window.wpStream || !canWrite()) return;
    var el = ui('videoEl'), v = showing ? lib().find(function(x) { return x.id === showing; }) : null;
    try { streamChan.postMessage(stageMsg(v, el, !!live)); } catch (e) {}
}
var _streamTick = null;
function streamTicking(on) { if (on && !_streamTick) _streamTick = setInterval(streamPost, 1000); else if (!on && _streamTick) { clearInterval(_streamTick); _streamTick = null; } }
// [videocheck:streamstage-end]
function audienceChanged() { if (panelOpen && showing && !watch) renderTable(false); }   // net.js: a call came or went

/* ---------- a player's side (V2): the GM's video in this panel, live ---------- */
// [videocheck:watch-start]
function volNow() { var v = parseInt(pref('wp_videoVol', '100'), 10); return isFinite(v) ? Math.max(0, Math.min(100, v)) : 100; }
function mutedNow() { return pref('wp_videoMuted', '0') === '1'; }
function applySound() { var vl = ui('videoLive'); if (!vl) return; vl.volume = volNow() / 100; vl.muted = mutedNow() || !!(watch && watch.forced); }
function playLive() {
    var vl = ui('videoLive'); if (!vl || !watch || !watch.open || !vl.srcObject) return;
    var p = null; try { p = vl.play(); } catch (e) {}
    if (p && p.catch) p.catch(function(err) {   // a window that plays no sound unasked (and only that refusal): it starts silent and says so
        if (!err || err.name !== 'NotAllowedError' || !watch || vl.muted) return;
        watch.forced = true; applySound(); renderWatch();
        var q = null; try { q = vl.play(); } catch (e) {} if (q && q.catch) q.catch(function() {});
    });
}
// net.js hands over the GM's picture and sound as one stream (once per track: the same stream twice) and its name, cleaned there and again here, shown as text
function onStream(stream, name) {
    var n = netOf(), vl = ui('videoLive'); if (!vl || !stream || !n || n.role !== 'client' || window.wpStream || !featureOn()) return;
    var fresh = !watch;
    if (fresh) { watch = { name: 'Video', open: true, lost: false, forced: false }; placePanel(); }
    watch.name = cleanName(name, 'Video'); watch.lost = false;
    if (vl.srcObject !== stream) vl.srcObject = stream;
    applySound(); renderWatch(); playLive();
}
function onLost() { if (!watch) return; watch.lost = true; renderWatch(); }
function closeWatch() {
    var p = ui('videoPanel'), vl = ui('videoLive'), stage = ui('videoStage');
    if (!watch) return;
    watch = null;
    if (vl) { try { vl.pause(); } catch (e) {} vl.srcObject = null; }
    leaveFull();
    if (stage) stage.style.display = 'none';
    if (p) p.style.display = 'none';
    lastSig = ''; renderWatch();
}
function setWatchOpen(on) {
    var vl = ui('videoLive'); if (!watch) return;
    watch.open = !!on;
    if (!watch.open) { leaveFull(); if (vl) { try { vl.pause(); } catch (e) {} } }   // closed: silent too, until it is opened again
    else placePanel();
    renderWatch(); playLive();
}
function renderWatch() {
    var p = ui('videoPanel'), chip = ui('videoChip'), stage = ui('videoStage'); if (!p) return;
    p.classList.toggle('vid-watch', !!watch);
    if (chip) {
        chip.style.display = watch ? '' : 'none'; chip.classList.toggle('active', !!(watch && watch.open));
        var ct = chip.querySelector('.vchip-txt'); if (ct) ct.textContent = watch ? watch.name : '';
        chip.setAttribute('aria-pressed', watch && watch.open ? 'true' : 'false');
    }
    if (!watch) return;
    p.classList.remove('vid-staged', 'vid-live');
    p.style.display = watch.open ? 'flex' : 'none';
    if (stage) stage.style.display = '';
    ui('videoCaption').textContent = watch.lost ? 'The picture stopped coming — waiting for the GM’s video…' : watch.name;
    var quiet = mutedNow() || watch.forced, mb = ui('videoMuteBtn'), vr = ui('videoVol'), note = ui('videoWatchNote'), full = ui('videoFullBtn');
    if (mb) { mb.textContent = quiet ? '🔇' : '🔊'; mb.setAttribute('aria-pressed', quiet ? 'true' : 'false'); mb.title = quiet ? 'Its sound is off on this screen: press to hear it' : 'Its sound is on: press to mute it on this screen'; }
    if (vr && document.activeElement !== vr) vr.value = String(volNow());
    if (note) note.textContent = watch.lost ? 'The picture stopped coming — waiting for the GM’s video…' : watch.forced ? 'Its sound is off until you press the speaker.' : '';   // the bar shows in full screen too, where the caption does not
    if (full) full.disabled = !watch.open;
}
// [videocheck:watch-end]
function tableLeft() {   // net.js: the table ended or was left — a showing stops, a player's panel closes
    stopShowing();
    closeWatch();
    if (panelOpen) renderTable(true);
}

/* ---------- adding videos: checked by this app's own player first, then written to the saves folder with a progress line ---------- */
function probe(file) {
    return new Promise(function(resolve) {
        var url = URL.createObjectURL(file), v = document.createElement('video'), done = false;
        var fin = function(r) { if (done) return; done = true; try { v.removeAttribute('src'); v.load(); } catch (e) {} URL.revokeObjectURL(url); resolve(r); };
        v.preload = 'metadata'; v.muted = true;
        v.addEventListener('loadedmetadata', function() { fin({ ok: v.videoWidth > 0 && v.videoHeight > 0, pic: v.videoWidth > 0, dur: v.duration, w: v.videoWidth, h: v.videoHeight }); });
        v.addEventListener('error', function() { fin({ ok: false, pic: true }); });
        setTimeout(function() { fin({ ok: false, pic: true }); }, 15000);
        v.src = url;
    });
}
function putFile(folder, name, file, onPct) {
    return new Promise(function(resolve, reject) {
        var x = new XMLHttpRequest();
        x.open('POST', '/api/upload?mapId=' + encodeURIComponent(folder) + '&filename=' + encodeURIComponent(name));
        x.upload.onprogress = function(e) { if (e.lengthComputable && e.total > 0) onPct(Math.min(100, Math.floor(e.loaded / e.total * 100))); };
        x.onload = function() { var d = null; try { d = JSON.parse(x.responseText); } catch (e) {} if (x.status === 200 && d && isVideoPath(d.url)) resolve(d.url); else reject(new Error('the saves folder refused it')); };
        x.onerror = function() { reject(new Error('the upload failed')); };
        x.send(file);
    });
}
function addFiles(files) {
    var camp = getActiveCampaign(); if (!camp || !canWrite() || !featureOn() || uploading) return;
    var folder = 'video/' + safeId(camp.id), queue = Array.prototype.slice.call(files || []), added = 0, refused = [];
    if (!safeId(camp.id)) return;
    var next = function() {
        if (!queue.length) {
            uploading = null; render(true);
            toast((added ? added + ' video' + (added === 1 ? '' : 's') + ' added.' : 'Nothing added.') + (refused.length ? ' Refused: ' + refused.join('; ') : ''));
            return;
        }
        var f = queue.shift(), disk = diskName(f.name), list = libW(camp);
        if (!disk) { refused.push(f.name + ' (not a video file: MP4, WebM, M4V, OGV or MOV)'); return next(); }
        if (list.length >= 100) { refused.push(f.name + ' (the campaign already has 100 videos)'); return next(); }
        uploading = { name: nameOf(f.name), pct: 0 }; render(true);
        probe(f).then(function(pr) {
            if (!pr.ok) { refused.push(f.name + (pr.pic ? ' (this app cannot play it: MP4 with H.264, or WebM, plays everywhere)' : ' (no picture: for sound, use Music)')); return next(); }
            return putFile(folder, disk, f, function(pct) { if (!uploading) return; uploading.pct = pct; var s = document.querySelector('#videoBody .vid-up'); if (s) s.textContent = 'Adding ' + uploading.name + ' — ' + pct + '%'; }).then(function(url) {
                var cur = libW(camp), taken = {}; cur.forEach(function(v) { taken[v.id] = 1; });
                var entry = cleanVideo({ id: newId(Math.random, taken), name: nameOf(f.name), path: url, size: f.size, dur: pr.dur, w: pr.w, h: pr.h });
                if (!entry) { refused.push(f.name + ' (its file name could not be kept)'); return next(); }
                cur.push(entry); added++; save(true); next();
            });
        }).catch(function(err) { refused.push(f.name + ' (' + (err && err.message || 'failed') + ')'); next(); });
    };
    next();
}

/* ---------- renaming and deleting ---------- */
function renameVideo(id, value) {
    var camp = getActiveCampaign(), list = libW(camp); if (!list) return null;
    var v = list.find(function(x) { return x.id === id; }); if (!v) return null;
    var name = cleanName(value, v.name); if (name === v.name) return name;
    v.name = name; save(true);
    if (showing === id) ui('videoCaption').textContent = name;
    return name;
}
// [videocheck:ours-start]
// A file is deleted only when it sits in this campaign's own folder and no other campaign's library names it; otherwise the entry alone goes
function fileIsOnlyOurs(camp, path) {
    if (path.indexOf('/saves/images/video/' + safeId(camp.id) + '/') !== 0) return false;
    return !Object.values((state.appState && state.appState.campaigns) || {}).some(function(c) { return c && c !== camp && Array.isArray(c.videos) && c.videos.some(function(o) { return o && o.path === path; }); });
}
// [videocheck:ours-end]
function deleteVideo(id) {
    var camp = getActiveCampaign(), list = libW(camp); if (!list) return;
    var v = list.find(function(x) { return x.id === id; }); if (!v) return;
    var ours = fileIsOnlyOurs(camp, v.path);
    showConfirm(ours ? 'Delete "' + v.name + '" and its file from your saves folder? This cannot be undone.' : 'Take "' + v.name + '" out of this campaign? Its file stays: another campaign uses it.', function(yes) {
        if (!yes) return;
        var cur = libW(camp), i = cur.findIndex(function(x) { return x.id === id; }); if (i < 0) return;
        if (showing === id) hideVideo();
        cur.splice(i, 1); save(true); render(true);
        if (!ours) { toast('Taken out of this campaign.'); return; }
        fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: v.path }) })
            .then(function(r) { toast(r.ok ? 'Deleted ' + v.name + '.' : 'The entry is gone; the file could not be deleted.'); })
            .catch(function() { toast('The entry is gone; the file could not be deleted.'); });
    });
}

/* ---------- wiring ---------- */
(function wire() {
    var p = ui('videoPanel'), head = ui('videoHead'); if (!p || !head) return;
    var btn = ui('videoBtn'); if (btn) btn.addEventListener('click', function() { if (panelOpen) closePanel(); else openPanel(); });
    ui('videoCloseBtn').addEventListener('click', function() { if (watch) setWatchOpen(false); else closePanel(); });
    ui('videoFullBtn').addEventListener('click', toggleFull);
    var fileIn = ui('videoFile');
    fileIn.addEventListener('change', function() { addFiles(fileIn.files); fileIn.value = ''; });
    var body = ui('videoBody');
    body.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('button'); if (!b) return;
        if (b.classList.contains('vid-add')) { if (uploading) return; fileIn.value = ''; fileIn.click(); return; }
        var row = b.closest('.vid-row'); if (!row) return;
        var v = lib().find(function(x) { return x.id === row.dataset.id; }); if (!v) return;
        if (b.classList.contains('vid-show')) { if (showing === v.id) { hideVideo(); render(true); } else showVideo(v); }
        else if (b.classList.contains('vid-del')) deleteVideo(v.id);
    });
    body.addEventListener('change', function(e) {
        var t = e.target; if (!t.classList || !t.classList.contains('vid-name')) return;
        var row = t.closest('.vid-row'); if (!row) return;
        var name = renameVideo(row.dataset.id, t.value); if (name !== null) t.value = name;
    });
    body.addEventListener('keydown', function(e) { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('vid-name')) e.target.blur(); });
    var el = ui('videoEl');
    el.addEventListener('error', function() {
        if (!showing || !el.getAttribute('src')) return;
        ui('videoCaption').textContent = 'This file cannot be played here: it is missing from your saves folder, or in a format this app cannot play.';
        stopShowing('The video could not be played: no longer showing to players.');
    });
    el.addEventListener('ended', function() { stopShowing('The video ended: it closed on the players’ screens.'); });   // with Loop it never ends
    ['play', 'pause', 'seeked'].forEach(function(k) { el.addEventListener(k, function() { if (live) streamPost(); }); });   // the stream window follows the GM's hand
    if (streamChan && !window.wpStream) streamChan.addEventListener('message', function(e) { if (e.data && e.data.type === 'video-stage-query') streamPost(); });   // a stream window opened mid-showing asks
    // the stage's table row (V2): who it is shown to, Show and Stop, Loop
    var table = ui('videoTable');
    if (table) {
        table.addEventListener('click', function(e) {
            var b = e.target.closest && e.target.closest('button'); if (!b) return;
            if (b.classList.contains('vid-go')) startShowing();
            else if (b.classList.contains('vid-stop')) stopShowing('No longer showing to players.');
        });
        table.addEventListener('change', function(e) {
            var t = e.target; if (!t.classList) return;
            if (t.classList.contains('vid-loop')) { loop = !!t.checked; el.loop = loop; }
            else if (t.classList.contains('vid-all')) aud.all = !!t.checked;
            else if (t.classList.contains('vid-who') && typeof t.dataset.pid === 'string') aud.pids['$' + t.dataset.pid] = !!t.checked;
            else return;
            renderTable(false);
        });
    }
    // a player's side (V2): their own sound, and the chip that reopens it
    var mb = ui('videoMuteBtn'), vr = ui('videoVol'), chip = ui('videoChip');
    if (mb) mb.addEventListener('click', function() {
        if (!watch) return;
        if (watch.forced) { watch.forced = false; setPref('wp_videoMuted', '0'); } else setPref('wp_videoMuted', mutedNow() ? '0' : '1');
        applySound(); renderWatch(); playLive();
    });
    if (vr) vr.addEventListener('input', function() { var v = parseInt(vr.value, 10); setPref('wp_videoVol', isFinite(v) ? Math.max(0, Math.min(100, v)) : 100); applySound(); });
    if (chip) chip.addEventListener('click', function() { if (watch) setWatchOpen(!watch.open); });
    setInterval(function() {   // the table changes without a render: who is connected, a table that went
        if (live && !hosting()) stopShowing('The table is no longer up: the video is no longer shown.');
        if (panelOpen && showing && !watch) renderTable(false);
    }, 2000);
    // drag by the head (the buttons excepted); the place is remembered
    var drag = null;
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button') || p.classList.contains('vid-max')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - drag.dx)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - drag.dy)) + 'px'; p.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; remember(); });
    head.addEventListener('lostpointercapture', function() { if (drag) { drag = null; remember(); } });
    // resize from the corner; a double-click puts back the size it opens at
    var grip = ui('videoResize'), rs = null;
    grip.addEventListener('pointerdown', function(e) { var r = p.getBoundingClientRect(); rs = { x: e.clientX, y: e.clientY, w: r.width, h: r.height }; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener('pointermove', function(e) { if (!rs) return; p.style.width = clampW(rs.w + e.clientX - rs.x) + 'px'; p.style.height = clampH(rs.h + e.clientY - rs.y) + 'px'; });
    grip.addEventListener('pointerup', function() { if (!rs) return; rs = null; remember(); });
    grip.addEventListener('lostpointercapture', function() { if (rs) { rs = null; remember(); } });
    grip.addEventListener('dblclick', function() { p.style.width = ''; p.style.height = ''; remember(); });
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || !(panelOpen || (watch && watch.open)) || document.fullscreenElement) return;
        if (p.classList.contains('vid-max')) { e.stopPropagation(); setMax(false); return; }   // Esc steps back from filling the window first
        if (p.contains(document.activeElement)) { if (watch) setWatchOpen(false); else closePanel(); }
    }, true);
})();

// main.js render() calls this: a campaign switch, a feature switched, a load — the panel follows (and hides at someone else's table).
// A player's side: Video switched off here closes the GM's video (and its call); switched on again, a showing refused before is asked for
function refresh() {
    var n = netOf();
    if (watch) {
        if (!featureOn() || !n || !n.active || n.role !== 'client') { if (n && n.videoDrop) n.videoDrop(); closeWatch(); }
        else { renderWatch(); return; }
    }
    if (n && n.active && n.role === 'client' && n.videoWake && featureOn()) n.videoWake();
    if (panelOpen || (ui('videoPanel') && ui('videoPanel').style.display !== 'none')) render(false);
}

window.wpVideo = { refresh: refresh, open: openPanel, close: function() { if (!watch) closePanel(); }, addFiles: addFiles, isOpen: function() { return panelOpen; },
    onStream: onStream, onLost: onLost, onStop: closeWatch, tableLeft: tableLeft, audienceChanged: audienceChanged,
    isLive: function() { return !!live; }, isWatching: function() { return !!watch; } };
