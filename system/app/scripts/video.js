/* Campaign videos (1.5.0, backlog item 21) — the DOM half: the GM's Video panel, opened from the Scene menu (🎬 ▸ Video). It
   holds the campaign's video library (add videos from this computer, rename, delete) and a player to watch one on this screen,
   in a panel moved by its head, resized from its corner and put full screen. The files live in the saves folder under
   images/video/<campaign>/; the library (camp.videos) is the GM's alone. V2 streams the playing video live to the table.
   The pure half (the cleaner, the paths, the words) is videocore.js. */
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

var panelOpen = false, showing = null, uploading = null, lastSig = '';

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

/* ---------- the panel ---------- */
function sigOf(camp, on, list) { return (camp ? camp.id : '') + '|' + (on ? 1 : 0) + '|' + JSON.stringify(list) + '|' + showing + '|' + (uploading ? 1 : 0); }
function render(force) {
    var p = ui('videoPanel'); if (!p) return;
    var camp = getActiveCampaign();
    if (!panelOpen || !camp || !canWrite()) { if (p.style.display !== 'none') { p.style.display = 'none'; hideVideo(); } lastSig = ''; return; }
    var on = featureOn(), list = lib(camp);
    if (showing && (!on || !list.some(function(v) { return v.id === showing; }))) hideVideo();   // switched off, or its entry went
    var sig = sigOf(camp, on, list);
    if (p.style.display === 'none') p.style.display = 'flex';
    if (!force && sig === lastSig) return;   // a render with nothing new keeps the body (a name being typed keeps its caret)
    lastSig = sig;
    ui('videoBody').innerHTML = bodyHtml(on, list, showing, uploading);
    p.classList.toggle('vid-staged', !!showing);   // the picture takes the room; with none shown the list does
    var full = ui('videoFullBtn'); if (full) full.disabled = !showing;
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
    showing = v.id; stage.style.display = '';
    ui('videoCaption').textContent = v.name;
    if (el.getAttribute('src') !== src) el.src = src;
    render(true);
}
function hideVideo() {
    var el = ui('videoEl'), stage = ui('videoStage');
    showing = null;
    if (el) { try { el.pause(); } catch (e) {} if (el.hasAttribute('src')) { el.removeAttribute('src'); try { el.load(); } catch (e) {} } }
    if (stage) stage.style.display = 'none';
    var fs = document.fullscreenElement;
    if (fs && stage && (fs === stage || stage.contains(fs))) document.exitFullscreen().catch(function() {});
    setMax(false);
}
// Full screen for the picture; where the window refuses it or never answers (a host that grants no full screen), the panel fills
// the app's window instead
function setMax(on) { var p = ui('videoPanel'); if (p) p.classList.toggle('vid-max', !!on); }
function toggleFull() {
    var stage = ui('videoStage'), p = ui('videoPanel'); if (!stage || !p || !showing) return;
    if (p.classList.contains('vid-max')) { setMax(false); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(function() {}); return; }
    if (!stage.requestFullscreen || document.fullscreenEnabled === false) { setMax(true); return; }
    var settled = false;
    stage.requestFullscreen().then(function() { settled = true; }, function() { settled = true; setMax(true); });
    setTimeout(function() { if (!settled && !document.fullscreenElement && showing) setMax(true); }, 1200);
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
    ui('videoCloseBtn').addEventListener('click', closePanel);
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
    el.addEventListener('error', function() { if (showing && el.getAttribute('src')) ui('videoCaption').textContent = 'This file cannot be played here: it is missing from your saves folder, or in a format this app cannot play.'; });
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
        if (e.key !== 'Escape' || !panelOpen || document.fullscreenElement) return;
        if (p.classList.contains('vid-max')) { e.stopPropagation(); setMax(false); return; }   // Esc steps back from filling the window first
        if (p.contains(document.activeElement)) closePanel();
    }, true);
})();

// main.js render() calls this: a campaign switch, a feature switched, a load — the panel follows (and hides at someone else's table)
function refresh() { if (panelOpen || (ui('videoPanel') && ui('videoPanel').style.display !== 'none')) render(false); }

window.wpVideo = { refresh: refresh, open: openPanel, close: closePanel, addFiles: addFiles, isOpen: function() { return panelOpen; } };
