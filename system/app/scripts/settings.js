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
(function versionNotes() {
    fetch('/api/version').then(function(r) { return r.json(); }).then(function(v) {
        var cur = v && v.version;
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
   few seconds after launch and only ever shows a toast. */
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
        _upd.info = i; updateUI();
        if (i && i.newer && !quiet) toast('Waypoint ' + i.latest + ' is available.');
        if (i && i.newer && quiet) toast('Waypoint ' + i.latest + ' is available — Settings ▸ Check for Updates.');
        return i;
    }).catch(function(e) { _upd.info = { error: String(e) }; updateUI(); });
}
var _updChk = ui('setUpdateCheckBtn');
if (_updChk) _updChk.addEventListener('click', function() { checkUpdates(true, false); });
var _updNow = ui('setUpdateNowBtn');
if (_updNow) _updNow.addEventListener('click', function() {
    var i = _upd.info; if (!i || !i.canHotUpdate) return;
    if (window.wpNet && window.wpNet.active) { toast('Leave or end the multiplayer session first.'); return; }
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Update Waypoint from ' + i.current + ' to ' + i.latest + '? The new version downloads (a couple of MB), replaces the app files, and Waypoint reloads. Your campaigns and settings are untouched.', function() {
            toast('Downloading Waypoint ' + i.latest + '…');
            _updNow.disabled = true;
            fetch('/api/update-apply', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(r) {
                if (!r.ok) throw new Error(r.error || 'update failed');
                toast('Updated to ' + r.version + ' — reloading…');
                setTimeout(function() { location.reload(); }, 900);
            }).catch(function(e) { _updNow.disabled = false; toast('Update failed: ' + (e.message || e)); });
        });
    });
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
