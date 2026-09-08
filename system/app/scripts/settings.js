/* Settings panel: profile (name + table picture), basic table preferences,
   and an Advanced section for defaults and resets. The profile lives in
   localStorage as wp_profile — the same record multiplayer sends on join. */

import { state } from './state.js';
import { toast } from './io.js';

function ui(id) { return document.getElementById(id); }

/* ---------- profile helpers (same wp_profile record net.js uses) ---------- */
function getProfile() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('wp_profile') || 'null'); } catch (e) {}
    if (!p || !p.id) p = { id: 'u_' + Math.random().toString(36).slice(2, 10), name: '' };
    return p;
}
function saveProfile(p) {
    try { localStorage.setItem('wp_profile', JSON.stringify(p)); } catch (e) {
        toast('Could not save profile — picture may be too large.');
    }
}

/* ---------- avatar processing ----------
   Any image is accepted up to 8MB, then center-cropped and shrunk to a 96px
   square. The stored data URL is capped at ~100KB (a 96px square is far below
   that in practice), so profiles stay tiny on the wire. */
var AVATAR_PX = 96;
var AVATAR_MAX_INPUT = 8 * 1024 * 1024;
var AVATAR_MAX_STORED = 100 * 1024;

function processAvatar(file, cb) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) { toast('That file is not an image.'); return; }
    if (file.size > AVATAR_MAX_INPUT) { toast('Image is too large — please pick one under 8 MB.'); return; }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
        URL.revokeObjectURL(url);
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) { toast('Could not read that image.'); return; }
        var sx = (img.naturalWidth - side) / 2;
        var sy = (img.naturalHeight - side) / 2;
        var cv = document.createElement('canvas');
        cv.width = AVATAR_PX; cv.height = AVATAR_PX;
        cv.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
        var data = cv.toDataURL('image/png');
        if (data.length > AVATAR_MAX_STORED) data = cv.toDataURL('image/jpeg', 0.85);
        if (data.length > AVATAR_MAX_STORED) { toast('Could not shrink that image enough — try a simpler one.'); return; }
        cb(data);
    };
    img.onerror = function() { URL.revokeObjectURL(url); toast('Could not read that image.'); };
    img.src = url;
}

function renderAvatarPreview() {
    var p = getProfile();
    var initials = (p.name || '?').trim().split(/\s+/).map(function(s) { return s[0]; }).join('').slice(0, 2).toUpperCase() || '?';
    ['setAvatarPreview', 'netJoinAvatar'].forEach(function(id) {
        var el = ui(id);
        if (!el) return;
        if (p.avatar) el.innerHTML = '<img src="' + p.avatar + '" alt="">';
        else el.textContent = initials;
    });
}

/* ---------- panel sync ---------- */
function syncPanel() {
    var p = getProfile();
    var nameIn = ui('setNameInput');
    if (nameIn) nameIn.value = p.name || '';
    renderAvatarPreview();
    document.querySelectorAll('.set-unit-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.unit === (state.measureUnit || 'imperial'));
    });
    var mmState = ui('setMinimapState');
    if (mmState) mmState.textContent = localStorage.getItem('wp_minimap') === 'closed' ? 'hidden' : 'shown';
    var rlState = ui('setRulersState');
    if (rlState) rlState.textContent = localStorage.getItem('wp_rulers') === 'off' ? 'hidden' : 'shown';
    var ryState = ui('setRelayState');
    if (ryState) ryState.textContent = localStorage.getItem('wp_relayOnly') === '1' ? 'on — relay only' : 'off — direct first';
    var go = ui('setGridOpacity');
    var gpct = Math.round(gridOpacity() * 100);
    if (go) go.value = gpct;
    var gov = ui('setGridOpacityVal');
    if (gov) gov.textContent = gpct + '%';
    var op = ui('setOpacity');
    var pct = Math.round((state.newOpacity != null ? state.newOpacity : 1) * 100);
    if (op) op.value = pct;
    var opv = ui('setOpacityVal');
    if (opv) opv.textContent = pct + '%';
}

/* ---------- wiring ---------- */
var _btn = ui('settingsBtn');
if (_btn) _btn.addEventListener('click', function() {
    syncPanel();
    ui('settingsModal').style.display = 'flex';
});
var _close = ui('settingsCloseBtn');
if (_close) _close.addEventListener('click', function() { ui('settingsModal').style.display = 'none'; });

var _nameIn = ui('setNameInput');
if (_nameIn) _nameIn.addEventListener('change', function() {
    var p = getProfile();
    p.name = this.value.trim().slice(0, 40);
    saveProfile(p);
    var netName = ui('netNameInput');
    if (netName) netName.value = p.name;
    renderAvatarPreview();
    toast('Name saved.');
});

var _avBtn = ui('setAvatarBtn');
if (_avBtn) _avBtn.addEventListener('click', function() { ui('setAvatarFile').click(); });
var _avFile = ui('setAvatarFile');
if (_avFile) _avFile.addEventListener('change', function() {
    var f = this.files[0];
    this.value = '';
    processAvatar(f, function(data) {
        var p = getProfile();
        p.avatar = data;
        saveProfile(p);
        renderAvatarPreview();
        toast('Picture saved — it shows at the next table you join or host.');
    });
});
// The join panel's little avatar opens the same picker, and both previews
// refresh whenever the multiplayer modal opens.
var _joinAv = ui('netJoinAvatar');
if (_joinAv) _joinAv.addEventListener('click', function() { ui('setAvatarFile').click(); });
var _netBtn2 = ui('netBtn');
if (_netBtn2) _netBtn2.addEventListener('click', renderAvatarPreview);
var _setAvPrev = ui('setAvatarPreview');
if (_setAvPrev) _setAvPrev.addEventListener('click', function() { ui('setAvatarFile').click(); });

var _avClear = ui('setAvatarClearBtn');
if (_avClear) _avClear.addEventListener('click', function() {
    var p = getProfile();
    delete p.avatar;
    saveProfile(p);
    renderAvatarPreview();
    toast('Picture removed.');
});

document.querySelectorAll('.set-unit-btn').forEach(function(b) {
    b.addEventListener('click', function() {
        state.measureUnit = this.dataset.unit;
        try { localStorage.setItem('wp_measureUnit', state.measureUnit); } catch (e) {}
        syncPanel();
        // keep the measure menu's own buttons in agreement
        document.querySelectorAll('#measureUnitRow .draw-style-btn').forEach(function(mb) {
            mb.classList.toggle('active', mb.dataset.unit === state.measureUnit);
        });
        toast(this.dataset.unit === 'metric' ? 'Metric measurements.' : 'Imperial measurements.');
    });
});

var _mmBtn = ui('setMinimapBtn');
if (_mmBtn) _mmBtn.addEventListener('click', function() {
    var tog = ui('minimapToggle');
    if (tog) tog.click();
    else localStorage.setItem('wp_minimap', localStorage.getItem('wp_minimap') === 'closed' ? 'open' : 'closed');
    syncPanel();
});

/* Stream window: a second window showing only the play map, as players see it, for screen-sharing */
var _streamBtn = ui('setStreamBtn');
if (_streamBtn) _streamBtn.addEventListener('click', function() {
    var w = window.open(location.origin + '/?stream=1', 'waypointStream', 'width=1280,height=720');
    if (!w) { toast('Could not open the window — allow pop-ups for Waypoint.'); return; }
    toast('Stream window opened. Share that window in Discord/OBS; use its map picker to focus a map.');
});

/* Relay server (TURN): the GM's own relay for players who cannot connect directly.
   turn_* keys deliberately sit outside the wp_ prefix so they never mirror into preferences.json. */
function loadTurnFields() {
    var u = ui('setTurnUrls'), n = ui('setTurnUser'), p = ui('setTurnPass');
    try {
        if (u) u.value = localStorage.getItem('turn_urls') || '';
        if (n) n.value = localStorage.getItem('turn_user') || '';
        if (p) p.value = localStorage.getItem('turn_pass') || '';
    } catch (e) {}
    var st = ui('setTurnState');
    if (st) st.textContent = (window.wpNet && window.wpNet.turnConfig && window.wpNet.turnConfig()) ? 'configured' : 'none \u2014 direct connections only';
    var rb = ui('setRelayBlock');
    if (rb) rb.style.display = (window.wpNet && window.wpNet.turnConfig && window.wpNet.turnConfig()) ? 'block' : 'none';
}
function saveTurnFields() {
    var u = ui('setTurnUrls'), n = ui('setTurnUser'), p = ui('setTurnPass');
    try {
        localStorage.setItem('turn_urls', u ? u.value.trim() : '');
        localStorage.setItem('turn_user', n ? n.value.trim() : '');
        localStorage.setItem('turn_pass', p ? p.value : '');
    } catch (e) {}
    loadTurnFields();
}
['setTurnUrls', 'setTurnUser', 'setTurnPass'].forEach(function(id) {
    var el = ui(id); if (!el) return;
    el.addEventListener('change', function() { saveTurnFields(); if (window.wpNet && window.wpNet.active) toast('Relay saved \u2014 applies the next time you host or join.'); });
    el.addEventListener('keydown', function(e) { e.stopPropagation(); });
});
var _turnTest = ui('setTurnTestBtn');
if (_turnTest) _turnTest.addEventListener('click', function() {
    saveTurnFields();
    var st = ui('setTurnState'); if (st) st.textContent = 'testing\u2026';
    _turnTest.disabled = true;
    window.wpNet.testRelay().then(function(r) {
        _turnTest.disabled = false;
        if (st) st.textContent = r.ok ? 'working \u2713' : 'not working';
        toast(r.ok ? 'Relay works: ' + r.detail : r.detail);
    });
});
var _turnHelp = ui('setTurnHelpLink');
if (_turnHelp) _turnHelp.addEventListener('click', function(e) {
    e.preventDefault();
    var sm = ui('settingsModal'); if (sm) sm.style.display = 'none';
    if (window.wpOpenHelp) window.wpOpenHelp('mp-gm', 'helpRelay');
});
var _turnClear = ui('setTurnClearBtn');
if (_turnClear) _turnClear.addEventListener('click', function() {
    ['setTurnUrls', 'setTurnUser', 'setTurnPass'].forEach(function(id) { var el = ui(id); if (el) el.value = ''; });
    saveTurnFields(); toast('Relay removed \u2014 direct connections only.');
});
loadTurnFields();

/* Relay-only connections: a per-machine preference read by net.js when a Peer is created */
var _relayBtn = ui('setRelayBtn');
if (_relayBtn) _relayBtn.addEventListener('click', function() {
    var on = localStorage.getItem('wp_relayOnly') === '1';
    localStorage.setItem('wp_relayOnly', on ? '0' : '1');
    syncPanel();
    if (window.wpNet && window.wpNet.active) toast(on ? 'Relay-only off — applies the next time you host or join.' : 'Relay-only on — applies the next time you host or join.');
    else toast(on ? 'Connections go direct first again.' : 'All multiplayer traffic will go through the relay.');
});

/* Grid opacity is a viewer preference: stored locally, never sent to the table */
function gridOpacity() {
    var v = parseFloat(localStorage.getItem('wp_gridOpacity'));
    return (v >= 0.1 && v <= 1) ? v : 1;
}
function applyGridOpacity() {
    var ov = ui('gridOverlay');
    if (ov) ov.style.opacity = gridOpacity();
}
window.wpApplyGridOpacity = applyGridOpacity;
applyGridOpacity();
var _go = ui('setGridOpacity');
if (_go) _go.addEventListener('input', function() {
    var v = Math.max(0.1, Math.min(1, parseInt(this.value, 10) / 100));
    try { localStorage.setItem('wp_gridOpacity', v); } catch (e) {}
    applyGridOpacity();
    var gov = ui('setGridOpacityVal');
    if (gov) gov.textContent = Math.round(v * 100) + '%';
});

var _rlBtn = ui('setRulersBtn');
if (_rlBtn) _rlBtn.addEventListener('click', function() {
    var off = localStorage.getItem('wp_rulers') === 'off';
    try { localStorage.setItem('wp_rulers', off ? 'on' : 'off'); } catch (e) {}
    state.showRulers = off;
    if (window.appRender) window.appRender();
    syncPanel();
    toast(off ? 'Rulers shown.' : 'Rulers hidden.');
});

var _op = ui('setOpacity');
if (_op) _op.addEventListener('input', function() {
    state.newOpacity = Math.max(0.1, Math.min(1, parseInt(this.value, 10) / 100));
    try { localStorage.setItem('wp_newOpacity', state.newOpacity); } catch (e) {}
    var opv = ui('setOpacityVal');
    if (opv) opv.textContent = Math.round(state.newOpacity * 100) + '%';
    // mirror the toolbar sliders
    document.querySelectorAll('.new-opacity-slider').forEach(function(s) { s.value = Math.round(state.newOpacity * 100); });
    var a = ui('shapeOpacityVal'), b = ui('drawOpacityVal');
    if (a) a.textContent = Math.round(state.newOpacity * 100) + '%';
    if (b) b.textContent = Math.round(state.newOpacity * 100) + '%';
});

var _layout = ui('setResetLayoutBtn');
if (_layout) _layout.addEventListener('click', function() {
    localStorage.removeItem('wp_leftw');
    localStorage.removeItem('wp_rightw');
    document.documentElement.style.removeProperty('--leftw');
    document.documentElement.style.removeProperty('--rightw');
    toast('Panel layout reset.');
});

/* ---------- snapshots (Settings ▸ Advanced) ---------- */
function fmtBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
function snapLabel(b) { return /before-restore/.test(b.file) ? 'before a restore' : b.kept ? 'taken by hand' : 'at launch'; }
async function loadSnapshots() {
    var list = ui('setSnapList'); if (!list) return;
    var rows = null;
    try { var r = await fetch('/api/backups', { cache: 'no-store' }); if (r.ok) rows = await r.json(); } catch (e) {}
    if (!Array.isArray(rows)) {
        list.innerHTML = '<div style="color:var(--dim); line-height:1.5;">Listing snapshots from here needs the current installer (Settings &#9656; Updates). The launch backups are still written to the saves folder under <b>backups</b>.</div>';
        var nb = ui('setSnapNowBtn'); if (nb) nb.disabled = true;
        return;
    }
    if (!rows.length) { list.innerHTML = '<div style="color:var(--dim);">No snapshots yet — one is taken at every launch.</div>'; return; }
    list.innerHTML = rows.map(function(b) {
        return '<div class="snap-row" data-file="' + esc(b.file) + '"><span class="snap-when">' + esc(new Date(b.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) + '</span><span class="snap-kind">' + snapLabel(b) + '</span><span class="snap-size">' + fmtBytes(b.size) + '</span>'
            + '<button class="tool ghost snap-restore" title="Replace the save with this copy and reload (the save as it is now is snapshotted first)">Restore</button>'
            + '<button class="tool ghost danger snap-del" title="Delete this snapshot">&times;</button></div>';
    }).join('');
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
var _snapGroup = document.querySelector('.set-group[data-group="advanced"]');
if (_snapGroup) _snapGroup.addEventListener('toggle', function() { if (_snapGroup.open) loadSnapshots(); });
var _snapNow = ui('setSnapNowBtn');
if (_snapNow) _snapNow.addEventListener('click', async function() {
    try {
        var r = await fetch('/api/backup-now', { method: 'POST' });
        if (r.status === 404) { var jx = await r.json().catch(function() { return {}; }); toast(jx.error === 'no save yet' ? 'Nothing saved yet to snapshot.' : 'Snapshots need the current installer — see Updates.'); return; }
        if (!r.ok) throw new Error();
        toast('Snapshot taken. It stays until you delete it.');
        loadSnapshots();
    } catch (e) { toast('Snapshot failed.'); }
});
var _snapList = ui('setSnapList');
if (_snapList) _snapList.addEventListener('click', async function(e) {
    var row = e.target.closest && e.target.closest('.snap-row'); if (!row) return;
    var file = row.dataset.file, when = (row.querySelector('.snap-when') || {}).textContent || file;
    var d = await import('./dialogs.js');
    if (e.target.closest('.snap-del')) {
        d.showConfirm('Delete the snapshot from ' + when + '? Only that copy goes; the save is untouched.', async function() {
            try { var r = await fetch('/api/delete-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: file }) }); if (!r.ok) throw new Error(); toast('Snapshot deleted.'); loadSnapshots(); }
            catch (err) { toast('Could not delete that snapshot.'); }
        });
        return;
    }
    if (e.target.closest('.snap-restore')) {
        if (window.wpNet && window.wpNet.active) { toast('End or leave the session first — a restore replaces the whole save.'); return; }
        d.showConfirm('Restore the save from ' + when + '? Every campaign goes back to how it was then. The save as it is now is snapshotted first, then Waypoint reloads.', async function() {
            try {
                var r = await fetch('/api/restore-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: file }) });
                if (!r.ok) throw new Error();
                window.__wpNoSave = true;   // nothing in memory may overwrite the restored file
                toast('Restored — reloading.');
                setTimeout(function() { location.reload(); }, 400);
            } catch (err) { toast('Restore failed — the save was not changed.'); }
        });
    }
});

var _prefs = ui('setResetPrefsBtn');
if (_prefs) _prefs.addEventListener('click', function() {
    // Every wp_* preference goes — except identity/profile, the version marker and the last host code
    var keep = { wp_profile: 1, wp_version: 1, wp_lastHost: 1, wp_prefsStamp: 1 };
    var keys = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('wp_') === 0 && !keep[k]) keys.push(k); } } catch (e) {}
    keys.forEach(function(k) { try { localStorage.removeItem(k); } catch (e) {} });
    if (window.wpPrefsPush) window.wpPrefsPush();   // the saves folder's preferences.json follows
    applyGridOpacity();
    document.documentElement.style.removeProperty('--leftw');
    document.documentElement.style.removeProperty('--rightw');
    toast('Preferences reset — restart Waypoint to apply everything.');
});

renderAvatarPreview();   // the join panel's avatar shows from first open

// First launch after an update: pop the release notes once. A fresh install
// just records its version quietly; the same version never re-prompts.
function appVersionPromise() {   // the newer of the shell's version and the app folder's (a hot update moves only the latter)
    if (window.wpVersionReady) return window.wpVersionReady;
    var cmp = function(x, y) { var p = String(x).split('-')[0].split('.').map(Number), q = String(y).split('-')[0].split('.').map(Number); for (var k = 0; k < 3; k++) { if ((p[k] || 0) !== (q[k] || 0)) return (p[k] || 0) - (q[k] || 0); } return 0; };
    return Promise.all([
        fetch('/api/version').then(function(r) { return r.json(); }).catch(function() { return null; }),
        fetch('version.json', { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; }),
    ]).then(function(vs) {
        var a = vs[0] && vs[0].version ? String(vs[0].version) : null, b = vs[1] && vs[1].version ? String(vs[1].version) : null;
        return (a && b) ? (cmp(b, a) > 0 ? b : a) : (a || b);
    });
}
(function versionNotes() {
    appVersionPromise().then(function(cur) {
        if (!cur) return;
        var last = null;
        try { last = localStorage.getItem('wp_version'); } catch (e) {}
        try { localStorage.setItem('wp_version', cur); } catch (e) {}
        // The notes are never pushed at you: the version number in Settings (and in About) opens them on click.
        var vb = ui('setVersionBtn');
        if (vb) { vb.textContent = 'Waypoint ' + cur; vb.title = "What's new in " + cur + ' — click to read'; vb.dataset.version = cur; }
        void last;
    }).catch(function() {});
})();

/* ---------- updates ----------
   /api/update-check asks the shell to look at the newest GitHub Release. If the front end alone
   changed, Update Now downloads it, the shell swaps system/app in place and we reload. If the
   release needs a newer shell, the button becomes Get Installer instead. A quiet check runs a
   few seconds after launch; a newer version raises the header Update button and a notice. */
var _upd = { info: null };
function updateUI() {
    var st = ui('setUpdateState'), row = ui('setUpdateRow'), now = ui('setUpdateNowBtn'), inst = ui('setUpdateInstallerBtn');
    var i = _upd.info;
    if (!st || !row) return;
    if (!i) { st.textContent = ''; row.style.display = 'none'; return; }
    if (i.error) { st.textContent = 'could not check (' + (i.error.length > 40 ? 'offline?' : i.error) + ')'; row.style.display = 'none'; return; }
    if (!i.newer) { st.textContent = 'up to date (' + i.current + ')'; row.style.display = 'none'; return; }
    st.textContent = i.latest + ' available';
    row.style.display = 'flex';
    if (now) now.style.display = i.canHotUpdate ? 'block' : 'none';
    if (inst) inst.style.display = i.needsInstaller ? 'block' : 'none';
}
function checkUpdates(force, quiet) {
    var st = ui('setUpdateState'); if (st && !quiet) st.textContent = 'checking…';
    return fetch('/api/update-check' + (force ? '?force=1' : ''), { cache: 'no-store' }).then(function(r) { return r.json(); }).then(function(i) {
        // An old shell reports its own version even after a hot update; the app folder knows better.
        if (i && i.latest && window.wpAppVersion && !i.error) {
            var mine = String(window.wpAppVersion).split('-')[0];
            var vc = function(x, y) { var p = x.split('.').map(Number), q = y.split('.').map(Number); for (var k = 0; k < 3; k++) { if ((p[k] || 0) !== (q[k] || 0)) return (p[k] || 0) - (q[k] || 0); } return 0; };
            if (vc(mine, i.latest) >= 0) { i.newer = false; i.canHotUpdate = false; i.needsInstaller = false; }
            if (vc(mine, String(i.current || '0')) > 0) i.current = mine;
        }
        _upd.info = i; updateUI();
        showUpdateButton(i);
        if (i && i.newer) showUpdateBanner(i); else hideUpdateBanner();
        if (i && i.newer && !quiet) toast('Waypoint ' + i.latest + ' is available.');
        return i;
    }).catch(function(e) { _upd.info = { error: String(e) }; updateUI(); });
}
var _updChk = ui('setUpdateCheckBtn');
if (_updChk) _updChk.addEventListener('click', function() { checkUpdates(true, false); });
function runHotUpdate() {
    var i = _upd.info; if (!i || !i.canHotUpdate) return;
    if (window.wpNet && window.wpNet.active) { toast('Leave or end the multiplayer session first.'); return; }
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Update Waypoint from ' + i.current + ' to ' + i.latest + '? The new version downloads (a couple of MB), replaces the app files, and Waypoint reloads. Your campaigns and settings are untouched.', function() {
            toast('Downloading Waypoint ' + i.latest + '…');
            var btns = [ui('setUpdateNowBtn'), ui('updateBannerGo'), ui('updateBtn')];
            btns.forEach(function(b) { if (b) b.disabled = true; });
            fetch('/api/update-apply', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(r) {
                if (!r.ok) throw new Error(r.error || 'update failed');
                toast('Updated to ' + r.version + ' — reloading…');
                setTimeout(function() { location.reload(); }, 900);
            }).catch(function(e) { btns.forEach(function(b) { if (b) b.disabled = false; }); toast('Update failed: ' + (e.message || e)); });
        });
    });
}
var _updNow = ui('setUpdateNowBtn');
if (_updNow) _updNow.addEventListener('click', runHotUpdate);

/* ---------- the update notice and the header Update button ----------
   A check that finds a newer version does two things: the header grows a gold Update button
   that stays until the update is actually applied, and a notice bar appears once under the
   header (Later just hides the bar for this run). Update runs the one-click update, or fetches
   the installer when the release changed the app's core. */
var _bannerSeen = null;   // version the notice has already been shown for, this run
function showUpdateButton(i) {
    var b = ui('updateBtn'); if (!b) return;
    if (!i || !i.newer) { b.style.display = 'none'; return; }
    b.textContent = '⬆️ Update to ' + i.latest;
    b.title = 'Waypoint ' + i.latest + ' is available' + (i.canHotUpdate ? ' — click to update in place (a few seconds, saves and settings kept)' : ' — click to get the installer');
    b.style.display = 'inline-block';
}
function showUpdateBanner(i) {
    var bar = ui('updateBanner'); if (!bar || !i || !i.newer) return;
    if (_bannerSeen === i.latest) return;
    _bannerSeen = i.latest;
    var txt = ui('updateBannerText');
    if (txt) txt.textContent = 'Waypoint ' + i.latest + ' is available' + (i.canHotUpdate ? ' — one click to update.' : ' — this one needs the installer.');
    var go = ui('updateBannerGo'); if (go) go.textContent = i.canHotUpdate ? 'Update' : 'Get Installer';
    var hdr = document.querySelector('header'); if (hdr) bar.style.top = (hdr.getBoundingClientRect().bottom + 8) + 'px';
    bar.style.display = 'flex';
}
function hideUpdateBanner() { var bar = ui('updateBanner'); if (bar) bar.style.display = 'none'; }
var _bGo = ui('updateBannerGo');
if (_bGo) _bGo.addEventListener('click', function() {
    var i = _upd.info; if (!i) return;
    if (i.canHotUpdate) runHotUpdate();
    else { hideUpdateBanner(); var b = ui('setUpdateInstallerBtn'); if (b) b.click(); }
});
var _hdrUpd = ui('updateBtn');
if (_hdrUpd) _hdrUpd.addEventListener('click', function() { hideUpdateBanner(); if (_bGo) _bGo.click(); });
var _bNotes = ui('updateBannerNotes');
if (_bNotes) _bNotes.addEventListener('click', function() { var n = ui('setUpdateNotesBtn'); if (n) n.click(); });
var _bLater = ui('updateBannerLater');
if (_bLater) _bLater.addEventListener('click', function() {
    hideUpdateBanner();
    toast('The Update button stays in the top bar until you update.');
});
var _updInst = ui('setUpdateInstallerBtn');
if (_updInst) _updInst.addEventListener('click', function() {
    var i = _upd.info; if (!i) return;
    var target = i.installer || i.page;
    fetch('/api/open-external', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }) })
        .then(function(r) { if (!r.ok) throw new Error(); toast('Opening the download in your browser. Run the installer over this copy; saves and settings are kept.'); })
        .catch(function() { toast('Open this in a browser: ' + target); });
});
var _updNotes = ui('setUpdateNotesBtn');
if (_updNotes) _updNotes.addEventListener('click', function() {
    var i = _upd.info; if (!i) return;
    var body = document.getElementById('legalBody'), title = document.getElementById('legalTitle');
    if (!body || !title) return;
    title.textContent = "What's New — Waypoint " + i.latest;
    body.style.textAlign = 'center';
    body.textContent = i.notes || 'No notes for this release.';
    document.getElementById('legalModal').style.display = 'flex';
});
window.wpCheckUpdates = checkUpdates;
setTimeout(function() { checkUpdates(false, true); }, 5000);   // quiet launch check (cached 15 min by the shell)

var _verBtn = ui('setVersionBtn');
if (_verBtn) _verBtn.addEventListener('click', function() { if (window.wpShowWhatsNew) window.wpShowWhatsNew(this.dataset.version || ''); });

var _ident = ui('setResetIdentityBtn');
if (_ident) _ident.addEventListener('click', function() {
    if (window.wpNet && window.wpNet.active) { toast('Leave the multiplayer session first.'); return; }
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Reset your multiplayer identity? Tokens a GM assigned to you will no longer recognize you until reassigned.', function() {
            var p = getProfile();
            var np = { id: 'u_' + Math.random().toString(36).slice(2, 10), name: p.name || '' };
            if (p.avatar) np.avatar = p.avatar;
            saveProfile(np);
            if (window.wpNet) window.wpNet.myId = np.id;
            toast('New identity generated.');
        });
    });
});

// Journal: the page each campaign opens to (All / From the GM / My notes)
(function() {
    var sel = document.getElementById('setJournalPage'); if (!sel) return;
    try { var v = localStorage.getItem('wp_journalPage'); sel.value = v === 'gm' || v === 'mine' ? v : 'all'; } catch (e) {}
    sel.addEventListener('change', function() { try { localStorage.setItem('wp_journalPage', sel.value); } catch (e) {} });
})();

// Journal: which section the Sent page opens to (All / The GM / the last one picked)
(function() {
    var sel = document.getElementById('setSentOpens'); if (!sel) return;
    try { var v = localStorage.getItem('wp_sentOpens'); sel.value = v === 'gm' || v === 'remember' ? v : 'all'; } catch (e) {}
    sel.addEventListener('change', function() { try { localStorage.setItem('wp_sentOpens', sel.value); } catch (e) {} });
})();

// Journal: which From section the Inbox opens to
(function() {
    var sel = document.getElementById('setInboxOpens'); if (!sel) return;
    try { var v = localStorage.getItem('wp_inboxOpens'); sel.value = v === 'gm' || v === 'remember' ? v : 'all'; } catch (e) {}
    sel.addEventListener('change', function() { try { localStorage.setItem('wp_inboxOpens', sel.value); } catch (e) {} });
})();

// Journal: what the Journal page shows first, and whether an arriving handout opens at once
(function() {
    var sel = document.getElementById('setJournalShow');
    if (sel) {
        try { var v = localStorage.getItem('wp_journalShow'); sel.value = v === 'mine' || v === 'inbox' || v === 'sent' ? v : ''; } catch (e) {}
        sel.addEventListener('change', function() { try { localStorage.setItem('wp_journalShow', sel.value); } catch (e) {} });
    }
    var arr = document.getElementById('setHandoutArrive');
    if (arr) {
        try { arr.value = localStorage.getItem('wp_handoutArrive') === 'quiet' ? 'quiet' : 'open'; } catch (e) {}
        arr.addEventListener('change', function() { try { localStorage.setItem('wp_handoutArrive', arr.value); } catch (e) {} });
    }
})();

// Appearance: a sun / moon switch — dark (default) or light, applied at once and kept for next time
(function() {
    var sw = document.getElementById('setThemeBtn'), lbl = document.getElementById('setThemeLabel'); if (!sw) return;
    function paint() {
        var light = document.documentElement.getAttribute('data-theme') === 'light';
        sw.setAttribute('aria-checked', light ? 'false' : 'true');   // knob sits under the moon when dark
    }
    paint();
    sw.addEventListener('click', function() {
        var light = document.documentElement.getAttribute('data-theme') !== 'light';
        if (light) document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('wp_theme', light ? 'light' : 'dark'); } catch (e) {}
        paint();
    });
})();

// Settings groups: remember which are open
(function() {
    var groups = document.querySelectorAll('#settingsModal details.set-group'); if (!groups.length) return;
    var saved = null; try { saved = JSON.parse(localStorage.getItem('wp_setGroups') || 'null'); } catch (e) {}
    groups.forEach(function(d) {
        if (saved && typeof saved[d.dataset.group] === 'boolean') d.open = saved[d.dataset.group];
        d.addEventListener('toggle', function() {
            var st = {}; groups.forEach(function(g) { st[g.dataset.group] = g.open; });
            try { localStorage.setItem('wp_setGroups', JSON.stringify(st)); } catch (e) {}
        });
    });
})();
