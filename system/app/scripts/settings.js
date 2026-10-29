/* Settings panel: profile (name + table picture), basic table preferences,
   and an Advanced section for defaults and resets. The profile lives in
   localStorage as wp_profile — the same record multiplayer sends on join. */

import { state } from './state.js';
import { toast } from './io.js';
import './profilecore.js';   // 1.6.0: a profile carried to another computer (window.wpProfileCore)

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
   Any image is accepted up to 8MB, then framed (the token creator, framer.js: the part
   they choose; the centre when it is missing) and shrunk to a 96px square (opts.px: a character's 256). The stored data URL is capped at ~100KB (a 96px square is far below
   that in practice), so profiles stay tiny on the wire. */
var AVATAR_PX = 96;
var AVATAR_MAX_INPUT = 8 * 1024 * 1024;
var AVATAR_MAX_STORED = 100 * 1024;

function processAvatar(file, cb, opts) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) { toast('That file is not an image.'); return; }
    if (file.size > AVATAR_MAX_INPUT) { toast('Image is too large — please pick one under 8 MB.'); return; }
    opts = opts || {};
    if (window.wpFrame && window.wpFrame.open) {   // the token creator (owner, 2026-09-27): they choose the part that shows (OK untouched keeps the middle, as below)
        window.wpFrame.open(file, { px: opts.px || AVATAR_PX, as: 'data', max: opts.max || AVATAR_MAX_STORED, title: opts.title || 'Frame your picture', guide: opts.guide || null }, function(res) { if (res && res.data) cb(res.data); });
        return;
    }
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
window.wpProcessAvatar = processAvatar;   // the welcome screen reuses the same crop/shrink pipeline

// the stored profile's picture, checked WHOLE (the same check as net.js safeAvatar): a profile restored from a prefs file never writes markup
function safeAv(v) { return typeof v === 'string' && v.length <= 200000 && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v); }
function renderAvatarPreview() {
    var p = getProfile();
    var def = window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color) : '';   // color-tinted silhouette default (no photo)
    ['setAvatarPreview', 'netJoinAvatar', 'rowMeFace', 'wcProfFace', 'wcAvatarPrev'].forEach(function(id) {   // 1.6.0: your picture in the top row, on the welcome's Your profile and its Join screen
        var el = ui(id);
        if (!el) return;
        el.textContent = ''; var im = document.createElement('img'); im.alt = ''; im.src = safeAv(p.avatar) ? p.avatar : def; el.appendChild(im); el.style.background = '';   // built as a node
    });
    if (window.wpFaces) window.wpFaces.paintRows();   // Onboarding F1b: the token face previews follow the picture and colour
}

/* ---------- panel sync ---------- */
function syncPanel() {
    var p = getProfile();
    var nameIn = ui('setNameInput');
    if (nameIn) nameIn.value = p.name || '';
    var colIn = ui('setColorInput');
    if (colIn) colIn.value = p.color || '#7aa7ff';
    renderAvatarPreview();
    document.querySelectorAll('.set-unit-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.unit === (state.measureUnit || 'imperial'));
    });
    var rlState = ui('setRulersState');
    if (rlState) rlState.textContent = localStorage.getItem('wp_rulers') === 'off' ? 'hidden' : 'shown';
    var zcState = ui('setZoomCtlState'), ppState = ui('setPointerPosState');   // 107: the zoom buttons and the pointer location, each its own switch
    if (zcState) zcState.textContent = viewShown('wp_zoomCtl') ? 'shown' : 'hidden';
    if (ppState) ppState.textContent = viewShown('wp_pointerPos') ? 'shown' : 'hidden';
    syncVttPanel();   // elevation, posture, minimap: per campaign, the default, or the GM's ceiling at a table
    var dcState = ui('setDevConsoleState');
    if (dcState) dcState.textContent = localStorage.getItem('wp_devconsole') === 'on' ? 'on' : 'off';
    var ryState = ui('setRelayState');
    if (ryState) ryState.textContent = localStorage.getItem('wp_relayOnly') !== '1' ? 'off — direct first' : (window.wpNet && window.wpNet.relayActive && window.wpNet.relayActive()) ? 'on — relay only' : 'on, but no relay set — connecting directly';   // the truth: the switch does nothing without a relay on this computer
    var ryBlock = ui('setRelayBlock'); if (ryBlock && localStorage.getItem('wp_relayOnly') === '1') ryBlock.style.display = 'block';   // and the switch is in view whenever it is on (it follows the saves folder; the relay does not)
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
    var ud = ui('setUndoDepth');
    var udn = (function () { var v = parseInt(localStorage.getItem('wp_undoDepth'), 10); return (v >= 10 && v <= 500) ? v : 100; })();
    if (ud) ud.value = udn;
    var udv = ui('setUndoDepthVal');
    if (udv) udv.textContent = udn + ' steps';
}

/* ---------- wiring ---------- */
var _btn = ui('settingsBtn');
if (_btn) _btn.addEventListener('click', function() {
    syncPanel();
    ui('settingsModal').style.display = 'flex';
});
var _close = ui('settingsCloseBtn');
if (_close) _close.addEventListener('click', function() { ui('settingsModal').style.display = 'none'; });
// Open Settings jumped to a specific group + control (used by e.g. the grid menu's opacity button)
window.wpOpenSettings = function(group, anchorId) {
    syncPanel();
    var m = ui('settingsModal'); if (m) m.style.display = 'flex';
    if (group) { var d = document.querySelector('#settingsModal details.set-group[data-group="' + group + '"]'); if (d) d.open = true; }
    if (anchorId) setTimeout(function() { var a = ui(anchorId); if (a) { if (a.scrollIntoView) a.scrollIntoView({ block: 'center' }); if (a.focus) a.focus(); } }, 60);
};

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

var _colIn = ui('setColorInput');
if (_colIn) _colIn.addEventListener('input', function() { var p = getProfile(); p.color = this.value; saveProfile(p); renderAvatarPreview(); });
var _colClear = ui('setColorClearBtn');
if (_colClear) _colClear.addEventListener('click', function() { var p = getProfile(); delete p.color; saveProfile(p); var c = ui('setColorInput'); if (c) c.value = '#7aa7ff'; renderAvatarPreview(); toast('Using an automatic color.'); });

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
if (_netBtn2) _netBtn2.addEventListener('click', function() { renderAvatarPreview(); renderNetVttLine(); });
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

// Imperial or Metric: whiteboard.js wpUnitSet sets the choice and draws again everything that reads it, the measure menu's own buttons and
// every open sheet and HUD among them (the read-only check of 2026-10-17: a switch here left the rulers and the height chips in the old unit).
// It is the one place the choice is set: with no board at hand nothing is switched
document.querySelectorAll('.set-unit-btn').forEach(function(b) {
    b.addEventListener('click', function() {
        var u = this.dataset.unit === 'metric' ? 'metric' : 'imperial';
        if (!window.wpUnitSet) return;
        window.wpUnitSet(u);
        syncPanel();
        toast(u === 'metric' ? 'Metric measurements.' : 'Imperial measurements.');
    });
});

/* Stream window: a second window showing only the play map, as players see it, for screen-sharing */
var _streamBtn = ui('setStreamBtn');
if (_streamBtn) _streamBtn.addEventListener('click', function() {
    var w = window.open(location.origin + '/?stream=1', 'waypointStream', 'width=1280,height=720');
    if (!w) { toast('Could not open the window — allow pop-ups for Waypoint.'); return; }
    toast('Stream window opened. Share that window in Discord/OBS; use its map picker to focus a map.');
});
// [videocheck:streamholdset-start]
// Backlog 34, the Hold switch (the owner, by prompt: "Both, picked each time"): Live, Freeze the picture or Cover with a card, told to the
// stream window over BroadcastChannel and answered when it asks; this window's memory alone, Live again whenever the app starts. Only the
// main window says it (never a stream window or a window of its own)
var _holdMode = '', _holdChan = null;
var _holdMain = (function() { try { var q = new URLSearchParams(location.search); return !q.get('stream') && !q.get('popout'); } catch (e) { return false; } })();
function holdPost() { if (!_holdChan) return; try { _holdChan.postMessage({ type: 'stream-hold', mode: _holdMode }); } catch (e) {} }
function holdSet(m) {
    _holdMode = m === 'freeze' || m === 'cover' ? m : '';
    holdPost();
    return _holdMode;
}
if (_holdMain) { try { _holdChan = new BroadcastChannel('waypoint'); _holdChan.addEventListener('message', function(e) { if (e.data && e.data.type === 'stream-hold-query') holdPost(); }); } catch (e) { _holdChan = null; } }
var _streamHold = ui('setStreamHold');
if (_streamHold && _holdMain) _streamHold.addEventListener('change', function() {
    var m = holdSet(_streamHold.value);
    toast(m === 'freeze' ? 'The stream window holds its picture. Pick Live to let it go.' : m === 'cover' ? 'The stream window shows a cover card. Pick Live to take it off.' : 'The stream window is live again.');
});
// [videocheck:streamholdset-end]
// Stream window plays the table's ambient (wp_streamSound, off by default: it usually shares the GM's speakers).
// The stream window reads the key at load and on the storage event; the ambient itself travels over BroadcastChannel('waypoint').
var _streamSnd = ui('setStreamSoundChk');
if (_streamSnd) {
    try { _streamSnd.checked = localStorage.getItem('wp_streamSound') === 'on'; } catch (e) {}
    _streamSnd.addEventListener('change', function() {
        try { localStorage.setItem('wp_streamSound', _streamSnd.checked ? 'on' : 'off'); } catch (e) {}
        toast(_streamSnd.checked ? 'The stream window plays the table\'s ambient sound.' : 'The stream window is silent.');
    });
}
// Visual effects (1.5.0): reduce motion on this machine (wp_fxReduced), and whether the stream window shows effects (wp_streamFx, on by default).
var _fxRed = ui('setFxReduced');
if (_fxRed) { try { _fxRed.checked = localStorage.getItem('wp_fxReduced') === '1'; } catch (e) {} _fxRed.addEventListener('change', function() { try { localStorage.setItem('wp_fxReduced', _fxRed.checked ? '1' : '0'); } catch (e) {} toast(_fxRed.checked ? 'Reduced motion: shake off, flashes shortened.' : 'Full motion restored.'); }); }
// 1.6.0 (the owner, 2026-10-28, by prompt: "A choice in Settings (Recommended)"): how a piece hidden from players looks on this screen, faded
// (as ever) or invisible, this machine's own (wp_hiddenLook); the body's one word hid-none, which the style sheet reads
// [lookcheck:hiddenlook-start]
function hiddenLookOf(v) { return v === 'none' ? 'none' : 'fade'; }
function hiddenLookApply(v) { try { document.body.classList.toggle('hid-none', hiddenLookOf(v) === 'none'); } catch (e) {} }
// [lookcheck:hiddenlook-end]
var _hidSel = ui('setHiddenLook'), _hid0 = 'fade';
try { _hid0 = hiddenLookOf(localStorage.getItem('wp_hiddenLook')); } catch (e) {}
hiddenLookApply(_hid0);
if (_hidSel) {
    _hidSel.value = _hid0;
    _hidSel.addEventListener('change', function() {
        var hv = hiddenLookOf(_hidSel.value);
        try { localStorage.setItem('wp_hiddenLook', hv); } catch (e) {}
        hiddenLookApply(hv);
        toast(hv === 'none' ? 'Hidden pieces: invisible on your screen until shown to players.' : 'Hidden pieces: faded on your screen.');
    });
}
// The sense captions over tokens (the fog's "Blind · …" line): always, only on hover or for a selected token, or never, on this machine (wp_senseCaps)
var _capSel = ui('setSenseCaps');
if (_capSel) {
    try { var cv0 = localStorage.getItem('wp_senseCaps'); _capSel.value = cv0 === 'hover' || cv0 === 'never' ? cv0 : 'always'; } catch (e) {}
    _capSel.addEventListener('change', function() {
        var cv = _capSel.value === 'hover' || _capSel.value === 'never' ? _capSel.value : 'always';
        try { localStorage.setItem('wp_senseCaps', cv); } catch (e) {}
        if (window.wpFog && window.wpFog.redraw) window.wpFog.redraw();
        toast(cv === 'never' ? 'Sense captions over tokens: never shown on this machine.' : cv === 'hover' ? 'Sense captions over tokens: only on hover or for a selected token.' : 'Sense captions over tokens: always shown.');
    });
}
// 1.5.6, backlog 173: how a time rule's notes reach this player's chat at a table (net.js timeNote reads wp_timeNotes): every time, gathered
// every 10 minutes or every hour, or off
var _tnSel = ui('setTimeNotes');
if (_tnSel) {
    try { var tn0 = localStorage.getItem('wp_timeNotes'); _tnSel.value = tn0 === '10m' || tn0 === '1h' || tn0 === 'off' ? tn0 : 'all'; } catch (e) {}
    _tnSel.addEventListener('change', function() {
        var tv = _tnSel.value === '10m' || _tnSel.value === '1h' || _tnSel.value === 'off' ? _tnSel.value : 'all';
        try { localStorage.setItem('wp_timeNotes', tv); } catch (e) {}
        if (window.wpNet && typeof window.wpNet.timeNotesNow === 'function') window.wpNet.timeNotesNow();
        toast(tv === 'off' ? 'Time rule notes: off on this machine. The rules still run.' : tv === '10m' ? 'Time rule notes: gathered into one every 10 minutes.' : tv === '1h' ? 'Time rule notes: gathered into one every hour.' : 'Time rule notes: every time.');
    });
}
var _streamFx = ui('setStreamFxChk');
if (_streamFx) { try { _streamFx.checked = localStorage.getItem('wp_streamFx') !== '0'; } catch (e) {} _streamFx.addEventListener('change', function() { try { localStorage.setItem('wp_streamFx', _streamFx.checked ? '1' : '0'); } catch (e) {} toast(_streamFx.checked ? 'The stream window shows effects.' : 'The stream window hides effects.'); }); }

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
    var rb = ui('setRelayBlock'), hasRelay = !!(window.wpNet && window.wpNet.turnConfig && window.wpNet.turnConfig()), relayFlag = false;
    try { relayFlag = localStorage.getItem('wp_relayOnly') === '1'; } catch (e) {}
    if (rb) rb.style.display = (hasRelay || relayFlag) ? 'block' : 'none';   // shown with a relay — and whenever the switch is on without one (it follows the saves folder; the relay does not), so it can be seen and switched off
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
    try { localStorage.setItem('wp_relayOnly', '0'); } catch (e) {}   // the mode that depends on the relay goes with it
    saveTurnFields(); syncPanel(); toast('Relay removed \u2014 direct connections only.');
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
// [videocheck:streamgrid-start]
// Backlog 34, the stream window's own grid (the owner, by prompt: "Its own grid strength (Recommended)"): wp_streamGrid, this computer's own,
// read by the stream window alone: As on my screen (the viewer's own strength), Faint or Hidden. Any other word is As on my screen
function streamGridOf(w) { return w === 'faint' || w === 'hidden' ? w : ''; }
function gridOpacityFor(own, streamWord, inStream) {
    var v = (own >= 0.1 && own <= 1) ? own : 1;
    if (!inStream) return v;
    var s = streamGridOf(streamWord);
    return s === 'hidden' ? 0 : s === 'faint' ? Math.min(v, 0.3) : v;
}
// [videocheck:streamgrid-end]
function gridOpacity() {
    var v = NaN, sg = ''; try { v = parseFloat(localStorage.getItem('wp_gridOpacity')); sg = localStorage.getItem('wp_streamGrid') || ''; } catch (e) {}
    return gridOpacityFor(v, sg, !!window.wpStream);
}
function applyGridOpacity() {
    var ov = ui('gridOverlay');
    if (ov) ov.style.opacity = gridOpacity();
}
window.wpApplyGridOpacity = applyGridOpacity;
applyGridOpacity();
window.addEventListener('storage', function(e) { if (e.key === 'wp_streamGrid' || e.key === 'wp_gridOpacity') applyGridOpacity(); });   // backlog 34: the stream window follows a change made in the main window
var _sg = ui('setStreamGrid');
if (_sg) {
    try { _sg.value = streamGridOf(localStorage.getItem('wp_streamGrid')); } catch (e) {}
    _sg.addEventListener('change', function() {
        var w = streamGridOf(_sg.value);
        try { localStorage.setItem('wp_streamGrid', w); } catch (e) {}
        toast(w === 'hidden' ? 'The stream window draws no grid.' : w === 'faint' ? 'The stream window draws a faint grid.' : 'The stream window draws the grid as your screen does.');
    });
}
var _go = ui('setGridOpacity');
if (_go) _go.addEventListener('input', function() {
    var v = Math.max(0.1, Math.min(1, parseInt(this.value, 10) / 100));
    try { localStorage.setItem('wp_gridOpacity', v); } catch (e) {}
    applyGridOpacity();
    var gov = ui('setGridOpacityVal');
    if (gov) gov.textContent = Math.round(v * 100) + '%';
});
var _ud = ui('setUndoDepth');
if (_ud) _ud.addEventListener('input', function() {
    var v = Math.max(10, Math.min(500, Math.round((parseInt(this.value, 10) || 100) / 10) * 10));
    try { localStorage.setItem('wp_undoDepth', v); } catch (e) {}
    var udv = ui('setUndoDepthVal');
    if (udv) udv.textContent = v + ' steps';
});

// [lookcheck:viewswitch-start]
// 107: what stands around a map and can be put away, each by a switch of this computer's own: the coordinate rulers, the zoom buttons and the pointer
// location (the owner, 2026-10-06, of the last two: "optionally hide both independently"). ONE function switches each, whether it is pressed in
// Settings (Table) or ticked in the play map's View menu. A thing is shown unless its key says off. viewSwitch answers what is so now: true shown,
// false hidden, null for a name it does not know
var VIEW_SWITCHES = { rulers: ['wp_rulers', 'Rulers'], zoom: ['wp_zoomCtl', 'Zoom buttons'], pointer: ['wp_pointerPos', 'Pointer location'] };
function viewShown(key) { try { return localStorage.getItem(key) !== 'off'; } catch (e) { return true; } }
function viewSwitchOf(which) { return typeof which === 'string' && Object.prototype.hasOwnProperty.call(VIEW_SWITCHES, which) ? VIEW_SWITCHES[which] : null; }
function viewSwitch(which) {
    var sw = viewSwitchOf(which);
    if (!sw) return null;
    try { localStorage.setItem(sw[0], viewShown(sw[0]) ? 'off' : 'on'); } catch (e) {}
    var shown = viewShown(sw[0]);   // read back: what is said is what is so, also where the store took no write
    if (which === 'rulers') { state.showRulers = shown; if (window.appRender) window.appRender(); }
    else if (window.wpApplyCorner) window.wpApplyCorner();
    syncPanel();
    toast(sw[1] + (shown ? ' shown.' : ' hidden.'));
    return shown;
}
window.wpViewSwitch = viewSwitch;
window.wpViewShown = function(which) { var sw = viewSwitchOf(which); return sw ? viewShown(sw[0]) : null; };
// [lookcheck:viewswitch-end]
[['setRulersBtn', 'rulers'], ['setZoomCtlBtn', 'zoom'], ['setPointerPosBtn', 'pointer']].forEach(function(r) { var b = ui(r[0]); if (b) b.addEventListener('click', function() { viewSwitch(r[1]); }); });

/* ---------- VTT features (vtt.js): per campaign, the default for new campaigns, and a player's view at a table ----------
   Token elevation and posture (the chips and the blast tool's 3D figure) and the minimap. The rows keep their
   1.4.6 ids. Solo or hosting: a row sets the campaign on screen (camp.vtt, saved with it; while hosting the
   change reaches the table at once) and the defaults block below is editable. Waiting for a GM: locked.
   At a table: a row shows the GM's setting and offers "off for me" — kept per table, never the campaign,
   never the player's own defaults; the defaults block and the push button are hidden. Stream window: the
   group is hidden. The 1.4.6 keys wp_elevation / wp_posture are read as a seed by vtt.js and never written again. */
function cap(id) { return id.charAt(0).toUpperCase() + id.slice(1); }
function shortLabel(f) { return cap(f.label.replace('Token ', '')); }
var VTT_SAID = {   // the toast after a campaign row moves: [on, off]
    elevation: ['Elevation on.', 'Elevation off \u2014 chips hidden, the values are kept.'],
    posture: ['Posture on.', 'Posture off \u2014 chips hidden, the values are kept.'],
    minimap: ['Minimap on.', 'Minimap off for this campaign.'],
    sound: ['Sound on.', 'Sound off for this campaign \u2014 the table falls silent.'],
    dice: ['Dice on.', 'Dice off for this campaign \u2014 nobody rolls at the table.'],
    sheets: ['Character sheets on.', 'Character sheets off for this campaign \u2014 the system stays, nothing shows at the table.'],
    fx: ['Visual effects on.', 'Visual effects off for this campaign \u2014 no flashes, weather or bursts at the table.'],
    fog: ['Fog of war on \u2014 the \u{1F32B} fog tool is on the play map.', 'Fog of war off for this campaign \u2014 the whole map shows.'],
    lighting: ['Lighting on \u2014 a fogged map is lit until you place a light source, so every token sees what is in its line of sight.', 'Lighting off for this campaign \u2014 a token sees only as far as its sight, as before.'],
    turning: ['Token facing on \u2014 the turn arrow is back and a facing cone aims itself.', 'Token facing off for this campaign \u2014 no turn arrow; a facing-cone map falls back to all-around.'],
    turns: ['Turn-based combat on \u2014 during a combat, the player whose token has the turn ends it.', 'Turn-based combat off for this campaign \u2014 only your Next turn moves the order on.'],
    video: ['Video on \u2014 the Scene menu has the Video panel.', 'Video off for this campaign \u2014 nothing plays; the videos and their files are kept.']
};
var VTT_ROLE = {   // what a player's "off for me" does, shown under the row at a table
    dice: 'For you it hides the roller and mutes the dice sound; rolls still show in chat.',
    sound: 'For you it silences the table; the GM and the others still hear it.',
    sheets: 'For you it hides sheets and the hover lines; your token still moves.',
    fx: 'For you it hides the effects; the table still sees them.'
};
function vttFeatures() { return (window.wpVtt && window.wpVtt.FEATURES) || []; }
function syncVttPanel() {
    var v = window.wpVtt, grp = document.querySelector('#settingsModal details.set-group[data-group="vtt"]');
    if (!grp) return;
    if (!v) { grp.style.display = 'none'; return; }
    var m = v.mode(), client = m === 'client', awaiting = m === 'awaiting', editable = m === 'solo' || m === 'host';
    grp.style.display = m === 'stream' ? 'none' : '';
    if (m === 'stream') return;
    var camp = state.appState.campaigns[state.appState.activeCampaignId] || null;
    var lockNote = ui('setVttLocked'); if (lockNote) lockNote.style.display = awaiting ? '' : 'none';
    var word = ui('setVttCampWord'), name = ui('setVttCampName');
    if (word) word.textContent = client ? 'This table:' : 'This campaign:';
    if (name) name.textContent = (camp ? (camp.name || 'Unnamed Campaign') : '\u2014') + (client ? ' \u2014 set by the GM' : '');
    var c = client ? (v.ceiling() || {}) : null;
    var master = client ? vttFeatures().some(function(f) { return c[f.id] === true; }) : v.campaignMaster(camp);   // a client infers it: all off is "no VTT features"
    var mRow = ui('setVttMasterRow'), mState = ui('setVttMasterState'), mBtn = ui('setVttMasterBtn');
    if (mRow) mRow.style.display = client ? 'none' : '';
    if (mState) mState.textContent = master ? 'on' : 'off';
    if (mBtn) mBtn.disabled = !editable;
    var offNote = ui('setVttMasterOffNote');
    if (offNote) { offNote.style.display = master ? 'none' : ''; offNote.textContent = client ? 'The GM runs this table without VTT features.' : 'VTT features are off for this campaign \u2014 plain whiteboard. Your per-feature choices are kept.'; }
    var rows = ui('setVttRows'); if (rows) rows.style.display = master ? '' : 'none';
    vttFeatures().forEach(function(f) {
        var row = document.querySelector('.set-vtt-row[data-vtt="' + f.id + '"]'), st = ui('set' + cap(f.id) + 'State'), btn = ui('set' + cap(f.id) + 'Btn');
        if (!row) return;
        var help = row.querySelector('.set-vtt-help'), role = row.querySelector('.set-vtt-role');
        if (client) {
            var gmOn = c[f.id] === true, lo = v.localOff(f.id);
            if (f.noLocal) {   // the GM controls it for the whole table \u2014 no per-player switch
                if (st) st.textContent = gmOn ? 'GM: on' : 'GM: off';
                if (btn) btn.style.display = 'none';
                row.style.opacity = gmOn ? '' : '.55';
                if (help) help.style.display = 'none';
                if (role) { role.style.display = ''; role.textContent = gmOn ? 'The GM runs ' + f.label.toLowerCase() + ' for this table \u2014 there is no per-player switch.' : 'The GM has ' + f.label.toLowerCase() + ' off for this table.'; }
            } else {
            if (btn) btn.style.display = '';
            if (st) st.textContent = gmOn ? (lo ? 'GM: on \u2014 off for you' : 'GM: on') : 'GM: off';
            if (btn) { btn.textContent = lo ? 'Turn back on for me' : 'Turn off for me'; btn.disabled = !gmOn; }
            row.style.opacity = gmOn ? '' : '.55';
            if (help) help.style.display = 'none';
            if (role) { role.style.display = ''; role.textContent = !gmOn ? 'The GM has this off for the table.' : lo ? 'Off for you at this table \u2014 your own settings are unchanged.' : 'On at this table. Switch it off for yourself here; your own settings are unchanged.'; }
            if (role && gmOn && VTT_ROLE[f.id]) role.textContent += ' ' + VTT_ROLE[f.id];
            }
        } else {
            var on = v.campaignOn(f.id, camp);
            var extra = (f.id === 'minimap' && on && localStorage.getItem('wp_minimap') === 'closed') ? ' \u2014 collapsed in the corner' : '';
            if (st) st.textContent = (on ? 'on' : 'off') + extra;
            if (btn) { btn.textContent = 'Toggle ' + shortLabel(f); btn.disabled = !editable; }
            row.style.opacity = '';
            if (help) help.style.display = '';
            if (role) role.style.display = 'none';
        }
    });
    var trM = ui('setTimeRulesMode'); if (trM) { var tv0 = camp && camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules.time : ''; trM.value = tv0 === 'confirm' || tv0 === 'off' ? tv0 : 'auto'; trM.disabled = !editable; }   // item 20 K5b; 159: Run at once is the default
    var flM = ui('setFillMode'); if (flM) { flM.value = camp && camp.turnRules && camp.turnRules.fill === 'gm' ? 'gm' : 'owner'; flM.disabled = !editable; }
    var taM = ui('setTargetAskMode'); if (taM) { taM.value = camp && camp.turnRules && typeof camp.turnRules === 'object' && camp.turnRules.targetAsk === 'off' ? 'off' : 'ask'; taM.disabled = !editable; }   // the owner's ruling of 2026-10-01
    var tmS = ui('setTimersMode'); if (tmS) { tmS.value = camp && camp.turnRules && camp.turnRules.timers === 'gm' ? 'gm' : 'owner'; tmS.disabled = !editable; }   // T5b
    [['setMoveMode', 'move'], ['setOrderMode', 'order'], ['setActsMode', 'acts']].forEach(function(p) { var s = ui(p[0]); if (!s) return; var tv = camp && camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules[p[1]] : ''; s.value = tv === 'warn' || tv === 'off' ? tv : 'refuse'; s.disabled = !editable; });   // T3b
    var wm = ui('setWallsMode'); if (wm) { var tr = camp && camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules.walls : ''; wm.value = tr === 'warn' || tr === 'off' ? tr : 'refuse'; wm.disabled = !editable; }   // turn-based combat T3a (D11): the walls' mode
    var defaults = ui('setVttDefaults'); if (defaults) defaults.style.display = editable ? '' : 'none';
    var g = v.globalVtt();
    var gmState = ui('setVttGlobalMasterState'); if (gmState) gmState.textContent = g.master ? 'on' : 'off';
    vttFeatures().forEach(function(f) { var s = ui('setVttGlobal' + cap(f.id) + 'State'); if (s) s.textContent = g.features[f.id] ? 'on' : 'off'; });
    if (client && !grp.open) grp.open = true;   // so a player does not have to hunt for it; the group listener skips the write while locked
}
vttFeatures().forEach(function(f) {
    var b = ui('set' + cap(f.id) + 'Btn');
    if (b) b.addEventListener('click', function() {
        var v = window.wpVtt; if (!v) return;
        if (v.mode() === 'client') {   // a player's own "off for me" at this table
            var c = v.ceiling(); if (!c || c[f.id] !== true) return;
            var off = !v.localOff(f.id);
            if (!v.setLocal(f.id, off)) return;
            syncPanel();
            toast(shortLabel(f) + (off ? ' off for you at this table \u2014 your own settings are unchanged.' : ' back on for you at this table.'));
            return;
        }
        if (v.locked()) return;
        var on = v.campaignOn(f.id);
        if (!v.setCampaign(f.id, !on)) return;
        syncPanel();
        toast((VTT_SAID[f.id] || [shortLabel(f) + ' on.', shortLabel(f) + ' off.'])[on ? 1 : 0]);
    });
    var gb = ui('setVttGlobal' + cap(f.id) + 'Btn');
    if (gb) gb.addEventListener('click', function() {
        var v = window.wpVtt; if (!v || v.locked()) return;
        var on = v.globalVtt().features[f.id];
        if (!v.setGlobal(f.id, !on)) return;
        syncPanel();
        toast('New campaigns start with ' + shortLabel(f) + (on ? ' off' : ' on') + '. Existing campaigns keep their own.');
    });
});
[['setMoveMode', 'move', ['A player token moves no further than its move on its turn.', 'A player token may go past its move, with a note to them and you.', 'Moves are not counted.']], ['setOrderMode', 'order', ['A player token in the combat moves only on its turn.', 'A player token may move out of turn, with a note to them and you.', 'Tokens move freely out of turn.']], ['setActsMode', 'acts', ['A press past what a turn allows is refused.', 'A press past what a turn allows goes through, with a note to them and you.', 'Actions are not counted.']]].forEach(function(p) {   // turn-based combat T3b
    var sel = ui(p[0]); if (!sel) return;
    sel.addEventListener('change', function() {
        var v = window.wpVtt, camp = state.appState.campaigns[state.appState.activeCampaignId]; if (!camp || (v && v.locked())) { syncPanel(); return; }
        var val = sel.value === 'warn' || sel.value === 'off' ? sel.value : 'refuse', o = {}; o[p[1]] = val;
        camp.turnRules = Object.assign({}, camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules : {}, o);
        if (window.wpSave) window.wpSave(true);
        toast(p[2][val === 'refuse' ? 0 : val === 'warn' ? 1 : 2]);
    });
});
var _timersSel = ui('setTimersMode');   // turn-based combat T5b: who may pause, reset or stop a timed effect's countdown
if (_timersSel) _timersSel.addEventListener('change', function() {
    var v = window.wpVtt, camp = state.appState.campaigns[state.appState.activeCampaignId]; if (!camp || (v && v.locked())) { syncPanel(); return; }
    var val = _timersSel.value === 'gm' ? 'gm' : 'owner';
    camp.turnRules = Object.assign({}, camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules : {}, { timers: val });
    if (window.wpSave) window.wpSave(true);
    toast(val === 'gm' ? 'Only you pause, reset or stop effect timers.' : 'A character\'s player may pause, reset or stop its effect timers too.');
});
var _timeRulesSel = ui('setTimeRulesMode');   // item 20 K5b: auto (absent; the default since 1.5.5, 159) | confirm | off — the time rules' mode, the campaign's
if (_timeRulesSel) _timeRulesSel.addEventListener('change', function() {
    var v = window.wpVtt, camp = state.appState.campaigns[state.appState.activeCampaignId]; if (!camp || (v && v.locked())) { syncPanel(); return; }
    var val = _timeRulesSel.value === 'confirm' || _timeRulesSel.value === 'off' ? _timeRulesSel.value : 'auto', tr = Object.assign({}, camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules : {});
    if (val === 'auto') delete tr.time; else tr.time = val; camp.turnRules = tr;
    if (window.wpSave) window.wpSave(true);
    toast(val === 'auto' ? 'Time rules run at once for players\u2019 characters when time passes.' : val === 'off' ? 'No time rules run.' : 'You say which time rules run when time passes.');
});
var _fillSel = ui('setFillMode');   // item 20 K5b: owner (absent) | gm — whether players fill their own pools
if (_fillSel) _fillSel.addEventListener('change', function() {
    var v = window.wpVtt, camp = state.appState.campaigns[state.appState.activeCampaignId]; if (!camp || (v && v.locked())) { syncPanel(); return; }
    var tr = Object.assign({}, camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules : {}); if (_fillSel.value === 'gm') tr.fill = 'gm'; else delete tr.fill; camp.turnRules = tr;
    if (window.wpSave) window.wpSave(true);
    toast(_fillSel.value === 'gm' ? 'Only you fill pools back to full.' : 'Players may fill their own pools back to full.');
});
var _targetAskSel = ui('setTargetAskMode');   // the owner's ruling of 2026-10-01: ask (absent) | off — whether a player targeting one of the GM's characters offers to start combat there
if (_targetAskSel) _targetAskSel.addEventListener('change', function() {
    var v = window.wpVtt, camp = state.appState.campaigns[state.appState.activeCampaignId]; if (!camp || (v && v.locked())) { syncPanel(); return; }
    var tr = Object.assign({}, camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules : {}); if (_targetAskSel.value === 'off') tr.targetAsk = 'off'; else delete tr.targetAsk; camp.turnRules = tr;
    if (window.wpSave) window.wpSave(true);
    toast(_targetAskSel.value === 'off' ? 'A player targeting one of your characters starts nothing.' : 'A player targeting one of your characters asks you to start combat there.');
});
var _wallsSel = ui('setWallsMode');   // turn-based combat T3a (D11): refuse | warn | off, the campaign's (read by the host at each move)
if (_wallsSel) _wallsSel.addEventListener('change', function() {
    var v = window.wpVtt, camp = state.appState.campaigns[state.appState.activeCampaignId]; if (!camp || (v && v.locked())) { syncPanel(); return; }
    var val = _wallsSel.value === 'warn' || _wallsSel.value === 'off' ? _wallsSel.value : 'refuse';
    camp.turnRules = Object.assign({}, camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules : {}, { walls: val });
    if (window.wpSave) window.wpSave(true);
    toast(val === 'refuse' ? 'Walls stop player tokens.' : val === 'warn' ? 'A player token may cross a wall, with a note to them and you.' : 'Walls do not stop tokens.');
});
var _vttMaster = ui('setVttMasterBtn');
if (_vttMaster) _vttMaster.addEventListener('click', function() {
    var v = window.wpVtt; if (!v || v.locked()) return;
    var on = v.campaignMaster();
    if (!v.setMaster(!on)) return;
    syncPanel();
    toast(on ? 'VTT integration off for this campaign \u2014 plain whiteboard. Your per-feature choices are kept.' : 'VTT integration on for this campaign.');
});
var _vttGlobalMaster = ui('setVttGlobalMasterBtn');
if (_vttGlobalMaster) _vttGlobalMaster.addEventListener('click', function() {
    var v = window.wpVtt; if (!v || v.locked()) return;
    var on = v.globalVtt().master;
    if (!v.setGlobalMaster(!on)) return;
    syncPanel();
    toast('New campaigns start with VTT integration ' + (on ? 'off' : 'on') + '. Existing campaigns keep their own.');
});
// One read-only line in the Multiplayer panel: what the table runs with
function renderNetVttLine() {
    var el = ui('netVttLine'), v = window.wpVtt; if (!el) return;
    var m = v ? v.mode() : 'solo';
    if (m !== 'client' && m !== 'host') { el.style.display = 'none'; return; }
    var flags = m === 'client' ? (v.ceiling() || {}) : v.hostFlags();
    el.textContent = 'VTT at this table' + (m === 'client' ? ' (GM)' : '') + ': ' + vttFeatures().map(function(f) { return shortLabel(f) + ' ' + (flags[f.id] ? 'on' : 'off'); }).join(' \u00b7 ');
    el.style.display = '';
}
// Live refresh: net.js (snapshot, stage, stance), vtt.js (any change), the minimap's own button and campaign switches call it
window.wpSettingsSync = function() { var m = ui('settingsModal'); if (m && m.style.display === 'flex') syncPanel(); renderNetVttLine(); };

// Developer mode (Settings ▸ Advanced, off by default): one switch for the in-app console on ~ (devconsole.js reads the same
// key) and, in the installed app, the developer tools (the shell reads the key from the mirrored settings file and only then
// lets them open). Switching it ON asks first, every time, in the app's own question — never one Enter answers — because
// what it unlocks runs whatever is typed or pasted into it. Nothing a player or a host sends can switch it on. The local
// server reads the same key from that file for the page's policy (shellguard.pagePolicy): only in Developer mode may a page run text as code.
// [servercheck:devmode-start]
var DEV_MODE_WARNING = 'Developer mode opens tools that can change or break your campaigns, your settings and Waypoint itself if they are used incorrectly. Only type or paste something into them when you know what it does — never because someone asked you to. Turn Developer mode on?';
var DEV_MODE_LIVE = 'Leave or end the multiplayer session first.';   // the words the update buttons use
// What a page may run is fixed when the page loads: the local server sends the page's policy with it, in the mode the settings
// file says at that moment (text run as code — what the console does — only in Developer mode). So a switch finishes with a
// reload: an edit still waiting is written, the settings go to the file, and once the file is written Waypoint reloads (a stream
// window too) — on, so the console may run what is typed; off, so nothing may from that moment. Never while a multiplayer
// session is live: a reload would drop the table.
var _dcReloading = false;
function devModeReload() {
    _dcReloading = true;
    try { if (window.wpHistFlush) window.wpHistFlush(); } catch (e) {}
    var go = function() {
        try { new BroadcastChannel('waypoint').postMessage({ type: 'reload' }); } catch (e) {}
        setTimeout(function() { location.reload(); }, 900);
    };
    var sent = null; try { sent = window.wpPrefsPush ? window.wpPrefsPush() : null; } catch (e) { sent = null; }
    if (sent && typeof sent.then === 'function') sent.then(go, go); else go();
}
function setDevMode(on) {
    var want = on ? 'on' : 'off', stored = false;
    try { localStorage.setItem('wp_devconsole', want); stored = localStorage.getItem('wp_devconsole') === want; } catch (e) { stored = false; }
    if (!stored) { toast('Developer mode could not be switched: this setting could not be stored.'); return; }
    if (!on && window.wpDevConsole) window.wpDevConsole.close();   // turning it off: close the console if it is open (the shell closes the developer tools)
    syncPanel();
    try { sessionStorage.setItem('wp_devmodeNote', want); } catch (e) {}   // said again once the page is back
    toast(on ? 'Developer mode is on — Waypoint reloads to finish switching it on.' : 'Developer mode is off — Waypoint reloads to finish switching it off.');
    devModeReload();
}
var _dcBtn = ui('setDevConsoleBtn'), _dcAsking = false;
if (_dcBtn) _dcBtn.addEventListener('click', function() {
    if (_dcReloading) return;   // the page is about to reload: nothing more is switched
    if (window.wpNet && window.wpNet.active) { toast(DEV_MODE_LIVE); return; }
    if (localStorage.getItem('wp_devconsole') === 'on') { setDevMode(false); return; }
    if (_dcAsking) return;   // one question at a time: Enter on the button (still focused behind the question) asks nothing more
    _dcAsking = true;
    import('./dialogs.js').then(function(d) {
        d.showConfirm(DEV_MODE_WARNING, function(yes) {   // No leaves it off, and says nothing
            _dcAsking = false; if (!yes) return;
            if (window.wpNet && window.wpNet.active) { toast(DEV_MODE_LIVE); return; }   // a session began while the question was open
            setDevMode(true);
        }, { noEnter: true });
    }, function() { _dcAsking = false; });
});
// After that reload: what the switch did, said once (the toast before the reload went with the page)
(function() {
    var note = null, now = null;
    try { note = sessionStorage.getItem('wp_devmodeNote'); sessionStorage.removeItem('wp_devmodeNote'); now = localStorage.getItem('wp_devconsole'); } catch (e) { note = null; }
    if (note === 'on' && now === 'on') setTimeout(function() { toast('Developer mode on — press ~ for the console (type /help inside); in the installed app Ctrl+Shift+I opens the developer tools.'); }, 800);
    else if (note === 'off' && now !== 'on') setTimeout(function() { toast('Developer mode off.'); }, 800);
})();
// [servercheck:devmode-end]

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
    var Ws = window.wpWebMode; if (Ws && typeof Ws.joinOnly === 'function' && Ws.joinOnly() === true) return;   // 1.5.5: a website's plan that joins tables alone keeps no save to snapshot, and the list is put away (webmode.js)
    var rows = null;
    try { var r = await fetch('/api/backups', { cache: 'no-store' }); if (r.ok) rows = await r.json(); } catch (e) {}
    if (!Array.isArray(rows)) {
        list.innerHTML = '<div style="color:var(--dim); line-height:1.5;">Listing snapshots from here needs the current core, which comes as the installer. The launch backups are still written to the saves folder under <b>backups</b>. <button class="tool ghost" id="setSnapCoreBtn" style="padding:2px 8px; font-size:11px;">Show the steps</button></div>';
        var cb = ui('setSnapCoreBtn'); if (cb) cb.addEventListener('click', function() { showInstallerSteps(coreInfo()); });
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
// [sinkcheck:snaps-start]
var _snapList = ui('setSnapList');
if (_snapList) _snapList.addEventListener('click', async function(e) {
    var row = e.target.closest && e.target.closest('.snap-row'); if (!row) return;
    var file = row.dataset.file, when = (row.querySelector('.snap-when') || {}).textContent || file;
    var d = await import('./dialogs.js');
    if (e.target.closest('.snap-del')) {
        var aside = /^data-/.test(file) ? ' A launch backup is set aside rather than erased: it moves to backups/removed in your saves folder, where the ten newest are kept in case one is wanted back.' : '';
        d.showConfirm('Delete the snapshot from ' + when + '? Only that copy goes; the save is untouched.' + aside, async function(yes) {
            if (!yes) return;   // Cancel and Escape answer too (with false): only a yes deletes
            try { var r = await fetch('/api/delete-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: file }) }); if (!r.ok) throw new Error(); toast('Snapshot deleted.'); loadSnapshots(); }
            catch (err) { toast('Could not delete that snapshot.'); }
        });
        return;
    }
    if (e.target.closest('.snap-restore')) {
        if (window.wpNet && (window.wpNet.active || window.wpNet.foreign)) { toast('End or leave the session first — a restore replaces the whole save.'); return; }
        d.showConfirm('Restore the save from ' + when + '? Every campaign goes back to how it was then. The save as it is now is snapshotted first, then Waypoint reloads.', async function(yes) {
            if (!yes) return;   // only a yes replaces the save
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
// [sinkcheck:snaps-end]

var _prefs = ui('setResetPrefsBtn');
if (_prefs) _prefs.addEventListener('click', function() {
    // Every wp_* preference goes — except identity/profile (a GM's signing key and the GMs this app knows with it), the version marker and the last host code
    var keep = { wp_profile: 1, wp_hostId: 1, wp_version: 1, wp_lastHost: 1, wp_prefsStamp: 1, wp_gmSign: 1, wp_gmPins: 1, wp_gmRooms: 1 };
    var keys = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('wp_') === 0 && !keep[k]) keys.push(k); } } catch (e) {}
    keys.forEach(function(k) { try { localStorage.removeItem(k); } catch (e) {} });
    if (window.wpPrefsPush) window.wpPrefsPush();   // the saves folder's preferences.json follows
    applyGridOpacity();
    if (window.wpApplyCorner) window.wpApplyCorner();   // 107: the zoom buttons and the pointer location are back at once
    document.documentElement.style.removeProperty('--leftw');
    document.documentElement.style.removeProperty('--rightw');
    if (window.wpVtt) window.wpVtt.changed('reset');   // the VTT default is back to the 1.4.6 keys, then on; campaigns carry their own and are untouched
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
        if (vb) { vb.textContent = 'Waypoint Alpha ' + cur; vb.title = "What's new in Waypoint Alpha " + cur + ' — click to read'; vb.dataset.version = cur; }
        void last;
    }).catch(function() {});
})();

/* ---------- updates ----------
   /api/update-check asks the shell to look at the newest GitHub Release. If the front end alone
   changed, Update Now downloads it, the shell swaps system/app in place and we reload. If the
   release needs a newer shell, the button becomes Get Installer instead. A quiet check runs a
   few seconds after launch; a newer version raises the header Update button and a notice.
   The shell takes an update only when it is signed by the key it carries (updater.js); the page
   hands it nothing to judge by. The shell keeps the app as it was before the last update, and
   says so (hasPrev): Restore the previous version asks it to put that back (/api/update-rollback).
   From 1.5.0 on a release that needs a newer shell is one click too where the shell says this copy
   can take it (canSelfInstall): the shell downloads the installer, checks it, runs it and Waypoint
   reopens; Get Installer and its steps remain for every case where that cannot be done. */
var _upd = { info: null, shellOld: null, shell: null, selfBusy: false, selfFailed: false, selfText: '', failNote: '', failSeen: '' };
var SHELL_WANTED = '1.6.0';   // 1.6.0 adds /api/account (account.js: this install linked to a Waypoint website account, the key kept in saves/account.json); 1.5.9 carries the outside sheet reader's folder (system/app/private) across an update and a restore; 1.5.6 adds the right-click menu of a text box, Cut, Copy, Paste and Select all (shellguard.editMenuTemplate); 1.5.0 added /api/library (the item library's pack files beside the save), serves a file in byte ranges under its media type (servefile.js: a video seeks without being read whole), takes only signed updates, keeps a way back and updates its own core; 1.4.6 added /api/delete-image (Image Library → Delete picture)   // the core this app expects; older cores are walked through the installer. It is the version tools/shellrev.json records as the core's last change: updatercheck holds the two together, and a release's manifest says the same as minShell
var RELEASES_PAGE = 'https://github.com/ImmuneMoon/Waypoint/releases/latest';
function vcmp(x, y) { var p = String(x).split('-')[0].split('.').map(Number), q = String(y).split('-')[0].split('.').map(Number); for (var k = 0; k < 3; k++) { if ((p[k] || 0) !== (q[k] || 0)) return (p[k] || 0) - (q[k] || 0); } return 0; }
// Is the core older than this app wants? The shell says so itself from 1.3.6 on; before that, the
// snapshot route is missing (404), which is just as telling.
function checkShell() {
    return Promise.all([
        fetch('/api/version', { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; }),
        fetch('/api/backups', { cache: 'no-store' }).then(function(r) { return r.status; }).catch(function() { return 0; })
    ]).then(function(v) {
        var shell = v[0] && v[0].shell ? String(v[0].shell) : null;
        _upd.shell = shell;
        _upd.shellOld = (shell && vcmp(shell, SHELL_WANTED) < 0) || v[1] === 404;
        if (_upd.shellOld) coreNudge(true);
        return _upd.shellOld;
    });
}
window.wpCheckShell = checkShell;
function coreInfo() {
    var i = _upd.info || {};
    return { latest: (window.wpAppVersion || i.current || ''), installer: i.installer || i.page || RELEASES_PAGE, core: true };
}
// The header button, the notice bar and Settings all say "core update"; the steps open once per app version on their own
function coreNudge(firstTime) {
    if (!_upd.shellOld) return;
    var i = _upd.info;
    if (i && i.newer) return;   // a newer app comes first; the core nudge returns after it lands
    var b = ui('updateBtn');
    if (b) { b.textContent = '\u2B06\uFE0F Core update'; b.title = "Waypoint's core is older than this app — it needs the installer once. Click to see the steps; nothing downloads until you say so."; b.style.display = 'inline-block'; }
    var bar = ui('updateBanner'), txt = ui('updateBannerText'), go = ui('updateBannerGo');
    if (bar && txt) {
        txt.textContent = "Waypoint's app files are current, but its core needs the installer once — Get Installer shows the steps first.";
        if (go) go.textContent = 'Get Installer';
        var hdr = document.querySelector('header'); if (hdr) bar.style.top = (hdr.getBoundingClientRect().bottom + 8) + 'px';
        bar.style.display = 'flex';
        wcStrip();   // 1.5.5: and the welcome screen's strip with it
    }
    updateUI();
    if (firstTime) {
        var seenKey = 'wp_coreSeen', cur = String(SHELL_WANTED);   // once per required-core bump, not once per app version — otherwise every hot update re-pops the walk-through while the user is deferring the installer
        var seen = null; try { seen = localStorage.getItem(seenKey); } catch (e) {}
        if (seen !== cur) { try { localStorage.setItem(seenKey, cur); } catch (e) {} setTimeout(function() { showInstallerSteps(coreInfo()); }, 800); }
    }
}
// [updatercheck:updates-start]
// A version as plain words, or nothing: what the shell or a release says is never passed on as it came.
function cleanVer(v) { return (typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/.test(v)) ? v : ''; }
// One plain line of what the shell said: no markup, no control characters, 200 characters at most.
function plainLine(s) { return (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/ +/g, ' ').trim().slice(0, 200); }
// A count of bytes as whole megabytes for the words on the page (0: not a size).
function mbOf(n) { return (typeof n === 'number' && isFinite(n) && n > 0) ? Math.max(1, Math.round(n / 1048576)) : 0; }
// An update that changes Waypoint's core: can this copy take it by itself? Only when the shell says so (true, nothing
// else), and not again in a run where that was tried and failed (the walk-through takes over then).
function selfCan(i) { return !!(i && i.newer === true && i.needsInstaller === true && i.canSelfInstall === true && !_upd.selfFailed); }
var INST_TITLE = "This update changes the app's core: download the installer and run it over your copy";
var SELF_TITLE = "This update changes Waypoint's core too: one click downloads it, Waypoint closes, updates itself and opens again";
function updateUI() {
    var st = ui('setUpdateState'), row = ui('setUpdateRow'), now = ui('setUpdateNowBtn'), inst = ui('setUpdateInstallerBtn'), back = ui('setUpdateRestoreBtn');
    var i = _upd.info;
    if (back) {   // the way back shows only when the shell itself says it kept the previous version (true, nothing else) — also when the release list could not be reached
        var has = !!(i && i.hasPrev === true), pv = has ? cleanVer(i.prevVersion) : '';
        back.style.display = has ? 'block' : 'none';
        back.textContent = 'Restore the previous version' + (pv ? ' (' + pv + ')' : '');
    }
    var self = selfCan(i);
    if (inst) { inst.textContent = self ? 'Update' : 'Get Installer'; inst.title = self ? SELF_TITLE : INST_TITLE; }
    if (!st || !row) return;
    if (!i) { st.textContent = ''; row.style.display = 'none'; return; }
    if (i.error) { st.textContent = 'could not check (' + (i.error.length > 40 ? 'offline?' : i.error) + ')'; row.style.display = 'none'; return; }
    if (!i.newer && _upd.shellOld) { st.textContent = 'app ' + (window.wpAppVersion || i.current) + ' — core needs the installer'; row.style.display = 'flex'; if (now) now.style.display = 'none'; if (inst) inst.style.display = 'block'; return; }
    if (!i.newer) { st.textContent = 'up to date (' + i.current + ')'; row.style.display = 'none'; return; }
    st.textContent = _upd.selfText || (i.latest + ' available');
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
        if (!_upd.failNote) { if (i && i.newer) showUpdateBanner(i); else if (_upd.shellOld) coreNudge(false); else hideUpdateBanner(); }
        showFailNote(i);   // a core update that was started and did not finish takes the notice bar
        if (i && i.newer && !quiet) toast('Waypoint Alpha ' + i.latest + ' is available.');
        return i;
    }).catch(function(e) { _upd.info = { error: String(e) }; updateUI(); });
}
var _updChk = ui('setUpdateCheckBtn');
if (_updChk) _updChk.addEventListener('click', function() { checkUpdates(true, false); });
function runHotUpdate() {
    var i = _upd.info; if (!i || !i.canHotUpdate) return;
    if (window.wpNet && window.wpNet.active) { toast('Leave or end the multiplayer session first.'); return; }
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Update Waypoint from Alpha ' + i.current + ' to Alpha ' + i.latest + '? The new version downloads, replaces the app files, and Waypoint reloads. Your campaigns and settings are untouched.', function(yes) {
            if (!yes) return;   // No means no: nothing downloads
            toast('Downloading Waypoint Alpha ' + i.latest + '…');
            var btns = [ui('setUpdateNowBtn'), ui('updateBannerGo'), ui('updateBtn')];
            btns.forEach(function(b) { if (b) b.disabled = true; }); wcStrip();
            fetch('/api/update-apply', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(r) {
                if (!r.ok) throw new Error(r.error || 'update failed');
                toast('Updated to ' + r.version + ' — reloading… If you had a Stream window open, close and reopen it.' + (typeof r.privateNote === 'string' ? ' ' + r.privateNote.slice(0, 200) : ''));   // the shell's own words when the outside sheet reader could not be carried
                try { new BroadcastChannel('waypoint').postMessage({ type: 'reload' }); } catch (e) {}   // a stream window on the new code reloads itself
                setTimeout(function() { location.reload(); }, 900);
            }).catch(function(e) { btns.forEach(function(b) { if (b) b.disabled = false; }); wcStrip(); toast('Update failed: ' + (e.message || e)); });
        });
    });
}
var _updNow = ui('setUpdateNowBtn');
if (_updNow) _updNow.addEventListener('click', runHotUpdate);
// Restore the previous version: the shell puts back the app as it was before the last update (one step), and Waypoint reloads.
// Campaigns live in the saves folder, which no update and no restore touches. The newer release stays on offer afterwards.
function runRestore() {
    var i = _upd.info; if (!i || i.hasPrev !== true) return;
    if (window.wpNet && window.wpNet.active) { toast('Leave or end the multiplayer session first.'); return; }
    var cur = cleanVer(i.current) || cleanVer(String(window.wpAppVersion || '').split('-')[0]), prev = cleanVer(i.prevVersion);
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Go back ' + (cur ? 'from Waypoint Alpha ' + cur + ' ' : '') + 'to ' + (prev ? 'Waypoint Alpha ' + prev : 'the previous version of Waypoint') + '? Your campaigns are not touched. You can update again afterwards.', function(yes) {
            if (!yes) return;
            var b = ui('setUpdateRestoreBtn'); if (b) b.disabled = true;
            fetch('/api/update-rollback', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(r) {
                if (!r || r.ok !== true) throw new Error((r && typeof r.error === 'string' && r.error) || 'nothing was restored');
                var v = cleanVer(r.version);
                toast('Restored ' + (v ? 'Waypoint Alpha ' + v : 'the previous version') + ' — reloading… If you had a Stream window open, close and reopen it.' + (typeof r.privateNote === 'string' ? ' ' + r.privateNote.slice(0, 200) : ''));
                try { new BroadcastChannel('waypoint').postMessage({ type: 'reload' }); } catch (e) {}   // a stream window reloads itself onto the restored code
                setTimeout(function() { location.reload(); }, 900);
            }).catch(function(e) { if (b) b.disabled = false; toast('Could not restore the previous version: ' + String(e && e.message || e).slice(0, 200)); });
        });
    });
}
var _updBack = ui('setUpdateRestoreBtn');
if (_updBack) _updBack.addEventListener('click', runRestore);

/* ---------- an update that changes Waypoint's core, in one click ----------
   Where the shell says this copy can (canSelfInstall): it downloads the installer, checks it against the update key,
   and — once the campaign is saved — starts it and closes Waypoint; the installer opens Waypoint again. The page only
   asks and shows how it stands: it hands the shell nothing to download, nowhere to put it and nothing to run.
   Anything that goes wrong is said in one line and the walk-through (Get Installer, the steps, the browser) takes over. */
function selfButtons(off) { [ui('setUpdateInstallerBtn'), ui('setUpdateNowBtn'), ui('setUpdateRestoreBtn'), ui('setUpdateCheckBtn'), ui('updateBannerGo'), ui('updateBtn')].forEach(function(b) { if (b) b.disabled = off; }); }
// How it stands, as text: beside the Updates heading in Settings and on the header's Update button.
function selfSay(text) {
    _upd.selfText = text;
    var st = ui('setUpdateState'); if (st) st.textContent = text;
    var b = ui('updateBtn'); if (b && text) b.textContent = text;
}
function selfFail(why, i) {
    _upd.selfBusy = false; _upd.selfFailed = true; _upd.selfText = '';
    selfButtons(false); updateUI(); showUpdateButton(i); hideUpdateBanner();
    var line = plainLine(why);
    toast('Waypoint could not update itself' + (line ? ': ' + line : '') + '. Get Installer shows the steps instead.');
    showInstallerSteps(i);
}
// Nothing unsaved may be lost when the app closes. io.js says how a save stands in the save note ("Saving..." until it is
// answered): a save already under way ends first, then the campaign is saved now, and its own answer is waited for.
function savedThen(cb) {
    var note = ui('saveNote');
    var busy = function() { return !!note && /^Saving/.test(String(note.textContent || '')); };
    var wait = function(n, then) { if (!busy()) { then(true); return; } if (n <= 0) { then(false); return; } setTimeout(function() { wait(n - 1, then); }, 150); };
    wait(100, function(quiet) {
        if (!quiet) { cb(false); return; }
        try { if (typeof window.wpSave === 'function') window.wpSave(true); } catch (e) { cb(false); return; }
        wait(100, function(done) { cb(done && !(note && /error/i.test(String(note.textContent || '')))); });
    });
}
function selfInstall(i, to) {
    selfSay('Saving your campaign…');
    savedThen(function(saved) {
        if (!saved) { selfFail('your campaign could not be saved, so nothing was installed', i); return; }
        selfSay('Waypoint is closing to update…'); toast('Waypoint is closing to update…');
        fetch('/api/update-installer-run', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(r) {
            if (!r || r.ok !== true) throw new Error((r && typeof r.error === 'string' && r.error) || 'the installer did not start');
            // still here a minute later: Waypoint did not close, so the update could not go on — the next check says what came of it
            setTimeout(function() { _upd.selfBusy = false; _upd.selfText = ''; selfButtons(false); checkUpdates(true, true); }, 60000);
        }).catch(function(e) { selfFail(e && e.message, i); });
    });
}
function selfPoll(i, to, misses) {
    setTimeout(function() {
        fetch('/api/update-installer-status', { cache: 'no-store' }).then(function(r) { return r.json(); }).then(function(s) {
            var state = s && s.state, got = (s && typeof s.got === 'number' && s.got > 0) ? s.got : 0, total = (s && typeof s.total === 'number' && s.total > 0) ? s.total : 0;
            if (state === 'downloading') { selfSay('Downloading Waypoint Alpha ' + to + '… ' + (total ? Math.min(100, Math.floor(got * 100 / total)) + '%' : mbOf(got) + ' MB')); selfPoll(i, to, 0); }
            else if (state === 'verifying') { selfSay('Checking the download…'); selfPoll(i, to, 0); }
            else if (state === 'ready') selfInstall(i, to);
            else selfFail(state === 'failed' ? ((s && typeof s.error === 'string' && s.error) || 'the download failed') : 'the download stopped', i);
        }, function() { if (misses >= 2) selfFail('Waypoint stopped answering', i); else selfPoll(i, to, misses + 1); })
        .catch(function(e) { selfFail(e && e.message, i); });
    }, 1000);
}
function runSelfUpdate() {
    var i = _upd.info; if (!selfCan(i) || _upd.selfBusy) return;
    if (window.wpNet && window.wpNet.active) { toast('Leave or end the multiplayer session first.'); return; }
    var from = cleanVer(i.current) || cleanVer(String(window.wpAppVersion || '').split('-')[0]), to = cleanVer(i.latest), mb = mbOf(i.installerSize);
    if (!to) { selfFail('the release names no plain version', i); return; }
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Update Waypoint' + (from ? ' from Alpha ' + from : '') + ' to Alpha ' + to + "? This one updates Waypoint's core too: the new version downloads" + (mb ? ' (about ' + mb + ' MB)' : '') + ', Waypoint closes, updates itself and opens again. Your campaigns and settings are untouched.', function(yes) {
            if (!yes || _upd.selfBusy) return;   // No means no: nothing downloads
            _upd.selfBusy = true; selfButtons(true); hideUpdateBanner();
            selfSay('Downloading Waypoint Alpha ' + to + '…'); toast('Downloading Waypoint Alpha ' + to + '…');
            fetch('/api/update-installer', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(r) {
                if (!r || r.ok !== true) throw new Error((r && typeof r.error === 'string' && r.error) || 'the download did not start');
                selfPoll(i, to, 0);
            }).catch(function(e) { selfFail(e && e.message, i); });
        });
    });
}

/* ---------- the update notice and the header Update button ----------
   A check that finds a newer version does two things: the header grows a gold Update button
   that stays until the update is actually applied, and a notice bar appears once under the
   header (Later just hides the bar for this run). Update runs the one-click update — of the app
   files, or of the core too where this copy can install it by itself — and otherwise shows the
   steps for the installer. */
var _bannerSeen = null;   // version the notice has already been shown for, this run
function showUpdateButton(i) {
    var b = ui('updateBtn'); if (!b) return;
    if (!i || !i.newer) { b.style.display = 'none'; return; }
    b.textContent = '⬆️ Update to ' + i.latest;
    b.title = 'Waypoint Alpha ' + i.latest + ' is available' + (i.canHotUpdate ? ' — click to update in place (a few seconds, saves and settings kept)' : selfCan(i) ? " — click to update: this one updates Waypoint's core too (it downloads, Waypoint closes, updates itself and opens again; saves and settings kept)" : ' — this one comes as an installer; click to see the steps (nothing downloads until you say so)');
    b.style.display = 'inline-block';
}
function showUpdateBanner(i) {
    var bar = ui('updateBanner'); if (!bar || !i || !i.newer) return;
    if (_bannerSeen === i.latest) return;
    _bannerSeen = i.latest;
    var one = !!(i.canHotUpdate || selfCan(i));
    var txt = ui('updateBannerText');
    if (txt) txt.textContent = 'Waypoint Alpha ' + i.latest + ' is available' + (one ? ' — one click to update.' : ' — this one comes as an installer; Update shows the steps first.');
    var go = ui('updateBannerGo'); if (go) go.textContent = one ? 'Update' : 'Get Installer';
    var hdr = document.querySelector('header'); if (hdr) bar.style.top = (hdr.getBoundingClientRect().bottom + 8) + 'px';
    bar.style.display = 'flex';
    wcStrip();
}
function hideUpdateBanner() { var bar = ui('updateBanner'); if (bar) bar.style.display = 'none'; wcStrip(); }
// A core update that was started and did not finish (the shell kept a mark of it, and its core is still the older one):
// said once per run in the notice bar, with both ways on from here and a way to put the notice away.
function showFailNote(i) {
    var v = i ? cleanVer(i.installFailed) : ''; if (!v || _upd.failSeen === v) return;
    var bar = ui('updateBanner'), txt = ui('updateBannerText'); if (!bar || !txt) return;
    _upd.failSeen = v; _upd.failNote = v;
    txt.textContent = 'The update to ' + v + ' did not finish. Try Update again, or use Get Installer.';
    var go = ui('updateBannerGo'), notes = ui('updateBannerNotes'), later = ui('updateBannerLater');
    if (go) go.textContent = 'Update'; if (notes) notes.textContent = 'Get Installer'; if (later) later.textContent = 'Dismiss';
    var hdr = document.querySelector('header'); if (hdr) bar.style.top = (hdr.getBoundingClientRect().bottom + 8) + 'px';
    bar.style.display = 'flex';
    wcStrip();
}
// The notice is answered (either way on, or put away): the bar's buttons are their usual selves again and the shell forgets the mark.
function endFailNote() {
    var v = _upd.failNote; if (!v) return '';
    _upd.failNote = '';
    var notes = ui('updateBannerNotes'), later = ui('updateBannerLater');
    if (notes) notes.textContent = 'Notes'; if (later) later.textContent = 'Later';
    hideUpdateBanner();
    try { fetch('/api/update-installer-dismiss', { method: 'POST' }).catch(function() {}); } catch (e) {}
    return v;
}
function failSteps(v) { var i = _upd.info || {}; showInstallerSteps({ latest: v, installer: i.installer || i.page || RELEASES_PAGE }); }
var _bGo = ui('updateBannerGo');
if (_bGo) _bGo.addEventListener('click', function() {
    var i = _upd.info;
    if (_upd.failNote) { var v = endFailNote(); if (selfCan(i)) runSelfUpdate(); else if (i && i.canHotUpdate) runHotUpdate(); else failSteps(v); return; }
    if (!(i && i.newer) && _upd.shellOld) { hideUpdateBanner(); showInstallerSteps(coreInfo()); return; }
    if (!i) return;
    if (i.canHotUpdate) runHotUpdate();
    else if (selfCan(i)) runSelfUpdate();
    else { hideUpdateBanner(); var b = ui('setUpdateInstallerBtn'); if (b) b.click(); }
});
var _hdrUpd = ui('updateBtn');
if (_hdrUpd) _hdrUpd.addEventListener('click', function() { if (!_upd.failNote) hideUpdateBanner(); if (_bGo) _bGo.click(); });
var _bNotes = ui('updateBannerNotes');
if (_bNotes) _bNotes.addEventListener('click', function() {
    if (_upd.failNote) { failSteps(endFailNote()); return; }
    var n = ui('setUpdateNotesBtn'); if (n) n.click();
});
var _bLater = ui('updateBannerLater');
if (_bLater) _bLater.addEventListener('click', function() {
    if (_upd.failNote) { endFailNote(); return; }
    hideUpdateBanner();
    toast('The Update button stays in the top bar until you update.');
});
/* ---------- the same notice on the welcome screen (1.5.5; the owner, 2026-10-24, by prompt: "A strip above the cards") ----------
   The welcome screen covers the app at launch, so the notice bar is said again in a strip above its cards (#wcUpdate). The bar stays the one
   source: each of its shows and hides ends in wcStrip, which shows the strip exactly while the bar shows, with the bar's words set as text, and
   each button of the strip presses the bar's own, so every way on is the bar's code. Update and Notes first put the welcome aside as Enter
   Waypoint does (its own button), so that all the update says next is in sight: its question, its progress on the top row's button and in
   Settings, its notices, the release notes and the installer's steps. Later keeps the welcome, and the one notice the bar's Later says is
   lifted over it (style.css #toast.show.wc-over); the focus then goes to the welcome's main view, so Tab goes on through its cards and a held
   Enter presses none. A button of the strip is off while the bar's is (runHotUpdate turns the bar's Update off as it downloads and calls
   wcStrip each time), and a press of it then does nothing; the strip is no live region of its own, since the bar's says the same words. */
function wcStrip() {
    var bar = ui('updateBanner'), s = ui('wcUpdate'); if (!bar || !s) return;
    var d = bar.style.display;
    s.style.display = d && d !== 'none' ? 'flex' : 'none';
    [['updateBannerText', 'wcUpdateText'], ['updateBannerGo', 'wcUpdateGo'], ['updateBannerNotes', 'wcUpdateNotes'], ['updateBannerLater', 'wcUpdateLater']].forEach(function(p, k) {
        var a = ui(p[0]), b = ui(p[1]); if (!a || !b) return;
        b.textContent = a.textContent;
        if (k) b.disabled = a.disabled === true;
    });
}
function wcStripPress(id) {
    var w = ui('welcomeScreen'), enter = ui('wcEnterBtn'), b = ui(id);
    if (!b || b.disabled === true) return;
    if (w && w.style.display && w.style.display !== 'none' && enter) enter.click();
    b.click();
}
function wcStripLater() {
    var says = !_upd.failNote;   // the bar's Later says where the Update button stays; as Dismiss it says nothing
    var b = ui('updateBannerLater'); if (b) b.click();
    var t = ui('toast'); if (says && t && t.classList && typeof t.classList.add === 'function') t.classList.add('wc-over');   // io.js's toast sets its classes anew at the next notice and takes them off after 3 s
    var w = ui('welcomeScreen'), m = ui('wcMain');
    if (w && w.style.display && w.style.display !== 'none' && m && typeof m.focus === 'function') { if (typeof m.setAttribute === 'function') m.setAttribute('tabindex', '-1'); m.focus(); }
}
var _wcGo = ui('wcUpdateGo'); if (_wcGo) _wcGo.addEventListener('click', function() { wcStripPress('updateBannerGo'); });
var _wcNotes = ui('wcUpdateNotes'); if (_wcNotes) _wcNotes.addEventListener('click', function() { wcStripPress('updateBannerNotes'); });
var _wcLater = ui('wcUpdateLater'); if (_wcLater) _wcLater.addEventListener('click', wcStripLater);
// An update that changes the app's core and cannot install itself here. Before anything downloads, say so
// and spell out the steps; the download starts only when the person presses Continue.
function showInstallerSteps(i) {
    var m = ui('installerModal'), v = ui('installerVersion'); if (!m) return;
    i = i || {};
    if (v) v.textContent = i.latest ? 'Waypoint Alpha ' + i.latest : 'This update';
    var n = ui('installerIntroNormal'), c = ui('installerIntroCore'), t = ui('installerTitle');
    if (n) n.style.display = i.core ? 'none' : '';
    if (c) c.style.display = i.core ? '' : 'none';
    if (t) t.textContent = i.core ? "Waypoint's core needs the installer" : 'This update needs the installer';
    m.dataset.url = i.installer || i.page || '';
    m.style.display = 'flex';
}
window.wpShowInstallerSteps = showInstallerSteps;
var _updInst = ui('setUpdateInstallerBtn');
if (_updInst) _updInst.addEventListener('click', function() { var i = _upd.info; if (i && i.newer) { if (selfCan(i)) runSelfUpdate(); else showInstallerSteps(i); } else if (_upd.shellOld) showInstallerSteps(coreInfo()); });
(function() {
    var m = ui('installerModal'); if (!m) return;
    var go = ui('installerGoBtn'), later = ui('installerLaterBtn'), close = ui('installerCloseBtn');
    function hide() { m.style.display = 'none'; }
    if (later) later.addEventListener('click', function() { hide(); toast('No download started. The Update button stays in the top bar until you install it.'); });
    if (close) close.addEventListener('click', hide);
    if (go) go.addEventListener('click', function() {
        var target = m.dataset.url; if (!target) { hide(); return; }
        fetch('/api/open-external', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }) })
            .then(function(r) { if (!r.ok) throw new Error(); hide(); toast('Downloading in your browser. When it finishes: close Waypoint, run the Waypoint_Setup.exe you just downloaded (never one from anywhere else), and open Waypoint again.'); })
            .catch(function() { hide(); toast('Open this in a browser: ' + target); });
    });
})();
// [updatercheck:updates-end]
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
setTimeout(function() {
    var Wu = window.wpWebMode;   // 1.5.5: on a website the deploy is the update: no check is asked there, and the Updates part is put away (webmode.js)
    (Wu && Wu.ready && typeof Wu.ready.then === 'function' ? Wu.ready : Promise.resolve(null)).then(function(k) {
        if (k && k.mode !== 'full') return;
        checkUpdates(false, true).then(function() { checkShell(); });   // quiet launch check (cached 15 min by the shell), then: is the core older than this app?
    });
}, 5000);

var _verBtn = ui('setVersionBtn');
if (_verBtn) _verBtn.addEventListener('click', function() { if (window.wpShowWhatsNew) window.wpShowWhatsNew(this.dataset.version || ''); });

/* ---------- a profile carried to another computer (1.6.0; the owner, 2026-10-29, by prompt: "Both", a file and a code) ----------
   profilecore.js shapes, cleans and merges; this wires Settings' four buttons. Opening a profile replaces who this install joins tables as
   (wp_profile and wp_tableKeys) and joins what it knows of GMs; the id it hosts under stays (net.js hostId, seeded first so it is never made
   from the new profile). Never during a table, and asked first with the buttons alone. Every step logs as "profile v1" (structure only). */
// [settings:profcarry-start]
var PROF_STORES = ['wp_profile', 'wp_tableKeys', 'wp_gmPins', 'wp_gmRooms'];
function profStores() { var s = {}; PROF_STORES.forEach(function(k) { try { s[k] = localStorage.getItem(k); } catch (e) { s[k] = null; } }); return s; }
function profRules() { var n = window.wpNet; return { avatarOk: n && n.safeAvatar, faceClean: n && n.cleanFace }; }
function profStep(step, o) { if (typeof window.wpStepLog === 'function') window.wpStepLog('profile v1', step, o); }
function profBusy() { var n = window.wpNet; if (n && (n.active || n.foreign)) { toast('Leave the table first: your profile changes only between tables.'); return true; } return false; }
function profPack() { var PC = window.wpProfileCore; return PC ? PC.packOf(profStores(), profRules(), Date.now()) : null; }
function profOpen(pack, how) {
    var PC = window.wpProfileCore; if (!PC || !pack) { toast('That is not a Waypoint profile.'); profStep('refused', { how: how }); return; }
    if (profBusy()) { profStep('busy', { how: how }); return; }
    var mine = profPack(), same = !!mine && mine.profile.id === pack.profile.id;
    var words = 'Open the profile of ' + PC.packWords(pack) + '? From now on you join tables as them. ' + (same ? 'It is the profile you have here: its tables are brought up to date.' : mine ? 'The profile here now, ' + PC.packWords(mine) + ', is replaced: save it first if you may want it back.' : '') + ' Your own table, if you host one, stays as it is.';
    import('./dialogs.js').then(function(d) {
        d.showConfirm(words, function(yes) {
            if (yes !== true) { profStep('cancelled', { how: how }); return; }
            if (profBusy()) return;
            if (window.wpNet && typeof window.wpNet.hostId === 'function') window.wpNet.hostId();   // the host id is made from the profile here, never the new one
            var w = PC.openWrites(profStores(), pack); if (!w) { toast('That profile could not be opened.'); profStep('failed', { how: how, at: 'writes' }); return; }
            try { Object.keys(w).forEach(function(k) { localStorage.setItem(k, w[k]); }); }
            catch (e) { toast('That profile could not be kept on this computer.'); profStep('failed', { how: how, at: 'store' }); return; }
            if (window.wpPrefsPush) window.wpPrefsPush();   // the saves folder's preferences.json follows
            if (typeof syncPanel === 'function') syncPanel();
            if (window.wpFaces && window.wpFaces.paintRows) window.wpFaces.paintRows();
            toast('You now join tables as ' + (pack.profile.name || 'that player') + '.');
            profStep('opened', { how: how, same: same, tables: Object.keys(pack.tableKeys).length });
        }, { noEnter: true, yes: 'Open it' });
    });
}
function profWire() {
    var save = ui('setProfSaveBtn'), open = ui('setProfOpenBtn'), file = ui('setProfFile'), copy = ui('setProfCopyBtn'), paste = ui('setProfPasteBtn');
    if (save) save.addEventListener('click', function() {
        var PC = window.wpProfileCore, pack = profPack(); if (!PC || !pack) { toast('There is no profile here to save yet.'); profStep('save-none', {}); return; }
        var nm = String(pack.profile.name || 'player').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 40) || 'player';
        try {
            var url = URL.createObjectURL(new Blob([PC.fileText(pack)], { type: 'application/json' })), a = document.createElement('a');
            a.href = url; a.download = 'Waypoint profile - ' + nm + '.json'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            toast('Profile saved. Keep the file private: it lets someone join as you.');
            profStep('saved', { tables: Object.keys(pack.tableKeys).length });
        } catch (e) { toast('The profile could not be saved.'); profStep('failed', { at: 'save' }); }
    });
    if (open && file) {
        open.addEventListener('click', function() { if (profBusy()) return; file.value = ''; file.click(); });
        file.addEventListener('change', function() {
            var f = file.files && file.files[0]; if (!f) return;
            if (f.size > 400000) { toast('That file is too large to be a Waypoint profile.'); profStep('refused', { how: 'file', at: 'size' }); return; }
            f.text().then(function(t) { profOpen(window.wpProfileCore ? window.wpProfileCore.fromFile(t, profRules()) : null, 'file'); }, function() { toast('That file could not be read.'); profStep('failed', { how: 'file', at: 'read' }); });
        });
    }
    if (copy) copy.addEventListener('click', function() {
        var PC = window.wpProfileCore, pack = profPack(); if (!PC || !pack) { toast('There is no profile here to copy yet.'); return; }
        var code = PC.codeOf(pack);
        var byHand = function() {   // where this computer refuses the clipboard, the code is shown selected for Ctrl+C
            profStep('shown', { len: code.length });
            import('./dialogs.js').then(function(d) { d.showPrompt('Copy this profile code with Ctrl+C. Keep it private: it lets someone join as you.', code, function() {}); });
        };
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') { byHand(); return; }
        navigator.clipboard.writeText(code).then(function() { toast('Profile code copied. Keep it private: it lets someone join as you.'); profStep('copied', { tables: Object.keys(pack.tableKeys).length, len: code.length }); }, byHand);
    });
    if (paste) paste.addEventListener('click', function() {
        if (profBusy()) return;
        import('./dialogs.js').then(function(d) {
            d.showPrompt('Paste the profile code copied on your other computer', '', function(text) {
                if (text === null || text === undefined || String(text).trim() === '') return;
                profOpen(window.wpProfileCore ? window.wpProfileCore.fromCode(String(text), profRules()) : null, 'code');
            });
        });
    });
}
profWire();
// [settings:profcarry-end]
// [settings:account-start]
// 1.6.0: this computer linked to a Waypoint website account (the owner, 2026-10-29: "we can go further and link it to the website profiles if
// the user wishes"). The page asks only its own server (/api/account/*, system/resources/app/account.js), which alone talks to the site and
// keeps the key. What the account keeps is the profile pack's four stores, never wp_hostId. On linking the account is read first and then
// decided on, before any sync (an early sync merges this computer's table keys and makes the account count as played): an account that has
// played nowhere adopts this computer's player; one that has takes over a computer that has played nowhere; where both have, you are asked.
// After that every change of the four is sent, and at launch a newer copy on the account is taken, only between tables
var ACCT = { linked: false, poll: null, url: '', timer: null };
function acctStep(step, o) { if (typeof window.wpStepLog === 'function') window.wpStepLog('account v1', step, o); }
function acctApi(method, p, body) {
    var o = { method: method }; if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(p, o).then(function(r) { return r.json().then(function(j) { return { status: r.status, json: j && typeof j === 'object' ? j : {} }; }, function() { return { status: r.status, json: {} }; }); }, function() { return { status: 0, json: {} }; });
}
function acctSig() { var s = profStores(); return PROF_STORES.map(function(k) { return typeof s[k] === 'string' ? s[k].length + ':' + s[k].slice(-24) : '-'; }).join('|'); }
function acctPrefs() { var s = profStores(), out = {}; PROF_STORES.forEach(function(k) { if (typeof s[k] === 'string') out[k] = s[k]; }); return { updated: Date.now(), prefs: out }; }
function acctPlayed() { try { var t = JSON.parse(localStorage.getItem('wp_tableKeys') || 'null'); return !!t && typeof t === 'object' && !Array.isArray(t) && Object.keys(t).length > 0; } catch (e) { return false; } }
function acctMark(updated) { try { localStorage.setItem('wp_acctStamp', String(updated || Date.now())); localStorage.setItem('wp_acctSig', acctSig()); } catch (e) {} }
function acctDraw(st) {
    var line = ui('setAcctLine'), code = ui('setAcctCode'), ct = ui('setAcctCodeText'), link = ui('setAcctLinkBtn'), open = ui('setAcctOpenBtn'), stop = ui('setAcctStopBtn'), un = ui('setAcctUnlinkBtn'); if (!line) return;
    var waiting = !!(st && st.code), linked = !!(st && st.linked);
    line.textContent = waiting ? 'Sign in on the page that opened, and check that it shows this code. This computer is linked once you say yes there.'
        : linked ? (st.offline ? 'Linked to your account. The website cannot be reached just now: your profile is sent when it can be.' : 'Linked to ' + (st.email || 'your account') + '. Your profile follows this account to every computer you link.')
        : st && st.err ? 'The website cannot be reached just now. Try again later.' : 'Link this computer to your account on the Waypoint website, and your profile follows you to every computer you link.';
    if (code) code.hidden = !waiting; if (ct) ct.textContent = waiting ? st.code : '';
    if (link) link.hidden = waiting || linked; if (open) open.hidden = !waiting; if (stop) stop.hidden = !waiting; if (un) un.hidden = !linked;
}
function acctRefresh() {
    return acctApi('GET', '/api/account').then(function(r) {
        var j = r.status === 200 ? r.json : { err: true }; ACCT.linked = j.linked === true;
        if (!ACCT.poll && j.linked !== true && j.pending && typeof j.pending.userCode === 'string' && typeof j.pending.url === 'string') { ACCT.url = j.pending.url; acctDraw({ code: j.pending.userCode }); acctStep('resumed', {}); acctPoll(5); return j; }   // a wait this page did not begin (a reload, another window) is taken up again
        if (!ACCT.poll) acctDraw(j); return j;
    });
}
function acctStopPoll() { if (ACCT.poll) clearTimeout(ACCT.poll); ACCT.poll = null; }
// The account's copy over this computer's: the profile pack's own rules (the profile replaced, the table keys, pins and rooms joined)
function acctTake(how, given) {   // given: the account's copy already in hand (adopt's answer), else it is asked for
    return (given ? Promise.resolve({ status: 200, json: given }) : acctApi('GET', '/api/account/prefs')).then(function(r) {
        var PC = window.wpProfileCore, pack = r.status === 200 && PC && r.json.prefs ? PC.packOf(r.json.prefs, profRules(), Date.now()) : null;
        if (!pack) { acctStep('take-failed', { how: how, status: r.status }); return false; }
        if (window.wpNet && typeof window.wpNet.hostId === 'function') window.wpNet.hostId();   // the host id stays this computer's own
        var w = PC.openWrites(profStores(), pack); if (!w) { acctStep('take-failed', { how: how, at: 'writes' }); return false; }
        try { Object.keys(w).forEach(function(k) { localStorage.setItem(k, w[k]); }); } catch (e) { acctStep('take-failed', { how: how, at: 'store' }); return false; }
        acctMark(r.json.updated); if (window.wpPrefsPush) window.wpPrefsPush();
        if (typeof syncPanel === 'function') syncPanel(); if (window.wpFaces && window.wpFaces.paintRows) window.wpFaces.paintRows();
        acctStep('taken', { how: how, tables: Object.keys(pack.tableKeys).length }); return true;
    });
}
function acctSync(why) {
    if (!ACCT.linked) return Promise.resolve(false);
    return acctApi('POST', '/api/account/prefs', acctPrefs()).then(function(r) { if (r.status === 200) { acctMark(); acctStep('sent', { why: why }); return true; } if (r.json.gone || r.json.error === 'unlinked') { ACCT.linked = false; acctRefresh(); } acctStep('send-failed', { why: why, status: r.status }); return false; });
}
function acctSoon() { if (!ACCT.linked) return; if (ACCT.timer) clearTimeout(ACCT.timer); ACCT.timer = setTimeout(function() { ACCT.timer = null; if (acctSig() !== (localStorage.getItem('wp_acctSig') || '')) acctSync('change'); }, 2000); }
function acctUnlink(why) { acctStopPoll(); return acctApi('DELETE', '/api/account').then(function() { ACCT.linked = false; acctStep('unlinked', { why: why }); return acctRefresh(); }); }
// Once the key is here: the account read first, then decided on, and only then the first sync
function acctDecide() {
    return acctApi('GET', '/api/account').then(function(r) {
        var a = r.status === 200 ? r.json : {}; if (a.linked !== true || a.offline) { acctStep('decide-failed', { status: r.status }); toast('Linked, but the website cannot be reached just now. Open Settings again later.'); return acctRefresh(); }
        ACCT.linked = true; var mine = acctPlayed();
        var take = function() { return acctTake('link').then(function(ok) { if (!ok) { toast('Your account\u2019s player could not be read. Try again later.'); return acctUnlink('take-failed'); } toast('Linked. You now join tables as your account\u2019s player.'); return acctSync('link').then(acctRefresh); }); };
        var both = function() {
            if (!mine) return take();
            import('./dialogs.js').then(function(d) {
                d.showConfirm('Your account and this computer have each played at tables. Use your account\u2019s player? Tables that knew this computer ask the GM once. Or keep this computer\u2019s player, and this computer is not linked.', function(yes) {
                    if (yes === true) { acctStep('asked', { pick: 'account' }); take(); }
                    else { acctStep('asked', { pick: 'keep' }); toast('This computer keeps its own player and is not linked.'); acctUnlink('kept'); }
                }, { noEnter: true, yes: 'Use my account\u2019s player', alt: 'Keep this computer\u2019s player' });
            });
        };
        if (a.played === true) return both();
        return acctApi('POST', '/api/account/adopt', acctPrefs()).then(function(ad) {
            if (ad.status === 200) { acctStep('adopted', {}); return acctTake('adopt', ad.json).then(function() { toast('Linked. Your account now holds the player you are here.'); return acctRefresh(); }); }   // what the site added (a colour) is taken too
            if (ad.status === 409) return both();
            acctStep('adopt-failed', { status: ad.status }); toast('Linked, but your player could not be sent. Try again later.'); return acctRefresh();
        });
    });
}
function acctPoll(interval) {
    ACCT.poll = setTimeout(function() {
        acctApi('POST', '/api/account/poll').then(function(r) {
            var s = r.json.state; if (!ACCT.poll) return;
            if (s === 'approved') { ACCT.poll = null; acctStep('approved', {}); acctDecide(); return; }
            if (s === 'denied' || s === 'expired' || s === 'none') { ACCT.poll = null; toast(s === 'denied' ? 'The website was told not to link this computer.' : 'The code ran out. Press Link to my account again.'); acctStep(s, {}); acctRefresh(); return; }
            acctPoll(interval);
        });
    }, Math.max(5, interval || 5) * 1000);
}
function acctOpenPage() { if (ACCT.url) { try { window.open(ACCT.url, '_blank', 'noopener'); } catch (e) {} } }
function acctLink() {
    if (profBusy()) return;
    var name = ''; try { var p = JSON.parse(localStorage.getItem('wp_profile') || 'null'); name = p && typeof p.name === 'string' ? p.name : ''; } catch (e) {}
    acctApi('POST', '/api/account/link', { name: (name ? name + '\u2019s ' : '') + 'Waypoint' }).then(function(r) {
        if (r.status !== 200 || typeof r.json.userCode !== 'string' || typeof r.json.url !== 'string') { toast(r.status === 429 ? 'Wait a few minutes before you try to link again.' : 'The website cannot be reached just now. Try again later.'); acctStep('start-failed', { status: r.status }); return; }
        ACCT.url = r.json.url; acctStopPoll(); acctDraw({ code: r.json.userCode }); acctOpenPage(); acctStep('started', {});
        acctPoll(r.json.interval);
    });
}
// At launch: a newer copy on the account is taken (between tables only); else this computer's, if it changed since the last sync, is sent
function acctLaunch() {
    if (window.wpStream || /[?&]popout=/.test(location.search) || (window.wpWebMode && window.wpWebMode.joinOnly && window.wpWebMode.joinOnly())) return;
    acctRefresh().then(function(a) {
        if (!a || a.linked !== true || a.offline) return;
        var stamp = parseInt(localStorage.getItem('wp_acctStamp') || '0', 10) || 0;
        acctApi('GET', '/api/account/prefs').then(function(r) {
            var n = window.wpNet, atTable = !!(n && (n.active || n.foreign));
            if (r.status === 200 && (r.json.updated || 0) > stamp && !atTable) { acctTake('launch'); return; }
            if (acctSig() !== (localStorage.getItem('wp_acctSig') || '')) acctSync('launch');
        });
    });
}
function acctWire() {
    var link = ui('setAcctLinkBtn'), open = ui('setAcctOpenBtn'), stop = ui('setAcctStopBtn'), un = ui('setAcctUnlinkBtn');
    if (link) link.addEventListener('click', acctLink);
    if (open) open.addEventListener('click', acctOpenPage);
    if (stop) stop.addEventListener('click', function() { acctStopPoll(); acctStep('stopped', {}); acctRefresh(); });
    if (un) un.addEventListener('click', function() {
        import('./dialogs.js').then(function(d) { d.showConfirm('Unlink this computer from your account? Your profile here stays as it is, and the account keeps its own copy.', function(yes) { if (yes === true) acctUnlink('asked'); }, { yes: 'Unlink' }); });
    });
    try {   // a change of who you are at a table goes to the account, a moment after it settles
        var SP = Storage.prototype, set0 = SP.setItem, want = {}; PROF_STORES.forEach(function(k) { want[k] = 1; });
        SP.setItem = function(k, v) { set0.call(this, k, v); if (this === localStorage && want[k] === 1) acctSoon(); };
    } catch (e) {}
    acctLaunch();
}
acctWire();
// [settings:account-end]
// [settings:profilewin-start]
// 1.6.0: the Profile window (the owner, 2026-10-29: "there should probably be a dedicated profile section in waypoint thats easy to get to", and
// by prompt "welcome screen and also in the top row" and "Yes, a short list"). The controls of who you are moved out of Settings' first group
// into #profileModal with their ids and their handlers above unchanged; Settings keeps one row that opens it. It opens from your picture in
// the top row (#rowMeBtn, which never folds: "Stays, like Settings"), from the welcome's Your profile, from that row and from the quick jump.
// Your picture there and on the welcome is the one the roster draws (renderAvatarPreview), and follows every change of who you are. Below the
// profile, the GMs whose tables know you, read from this computer alone (profilecore tablesOf, with the Journal's names) and drawn as text;
// a key is never shown and nothing is sent. Every step logs as "profile v1" (structure only)
function profWinShown() { var m = ui('profileModal'); return !!m && m.style.display === 'flex'; }
function profFields() {   // the window's fields as the profile holds them; a name being typed is left as it is
    var p = getProfile(), n = ui('setNameInput'), c = ui('setColorInput');
    if (n && document.activeElement !== n) n.value = p.name || '';
    if (c) c.value = p.color || '#7aa7ff';
    renderAvatarPreview();
}
// [sinkcheck:proftables-start]
function profWhen(at) { try { return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
var _profTurn = 0;
function profTablesDraw(why) {
    var box = ui('profTables'), PC = window.wpProfileCore; if (!box || !PC || typeof PC.tablesOf !== 'function') return [];
    var st = {}; ['wp_tableKeys', 'wp_tablesSeen'].forEach(function(k) { try { st[k] = localStorage.getItem(k); } catch (e) { st[k] = null; } });
    var draw = function(names) {
        var rows = PC.tablesOf(st, names);
        while (box.firstChild) box.removeChild(box.firstChild);
        if (!rows.length) { var none = document.createElement('div'); none.className = 'prof-none'; none.textContent = 'No GM\u2019s table knows you yet. When a GM lets you in, their table is listed here.'; box.appendChild(none); return rows; }
        rows.forEach(function(r) {   // every name a text node: a GM's name and their campaign's come from their table
            var row = document.createElement('div'), who = document.createElement('div'), nm = document.createElement('span');
            row.className = 'prof-table'; who.className = 'prof-table-who';
            nm.className = 'prof-table-gm' + (r.gm ? '' : ' unknown'); nm.textContent = r.gm || 'A GM whose name this computer does not know';
            who.appendChild(nm);
            if (r.campaign) { var cp = document.createElement('small'); cp.textContent = r.campaign; who.appendChild(cp); }
            row.appendChild(who);
            if (r.at) { var when = document.createElement('span'); when.className = 'prof-table-when'; when.textContent = 'last joined ' + profWhen(r.at); row.appendChild(when); }
            box.appendChild(row);
        });
        return rows;
    };
    var turn = ++_profTurn, rows = draw(null), count = function(list) { return { n: list.length, named: list.filter(function(r) { return !!r.gm; }).length, dated: list.filter(function(r) { return r.at > 0; }).length }; };
    profStep('tables', Object.assign({ why: why || 'open' }, count(rows)));
    var nameless = rows.some(function(r) { return !r.gm || !r.campaign; });
    if (nameless && typeof window.wpJournalGms === 'function') {   // a name the record has not: the Journal's, then drawn again
        var ids = []; try { var k = JSON.parse(st.wp_tableKeys || 'null'); if (k && typeof k === 'object' && !Array.isArray(k)) ids = Object.keys(k); } catch (e) {}
        Promise.resolve(window.wpJournalGms(ids)).then(function(names) {
            if (turn !== _profTurn || !profWinShown()) return;
            var again = draw(names); profStep('tables-named', count(again));
        }, function() { profStep('tables-named-failed', {}); });
    }
    return rows;
}
// [sinkcheck:proftables-end]
function profWinOpen(from) {
    var m = ui('profileModal'); if (!m) return false;
    profFields(); m.style.display = 'flex'; profTablesDraw('open');
    profStep('window-open', { from: typeof from === 'string' ? from : 'other' });
    return true;
}
function profWinClose() { var m = ui('profileModal'); if (m) m.style.display = 'none'; }
// Your picture follows every change of who you are, from wherever it is written (this window, the welcome's Join screen, the Multiplayer
// window's name, a profile opened from a file or a code, the account), a moment after it settles; the list follows the tables
var _meSoon = null;
// The welcome's Join screen keeps its own name and colour boxes, filled as the welcome opens and saved by each of its buttons (main.js
// saveWcProfile): they follow the profile too, or a change made in this window over the welcome went back at Enter Waypoint (found live)
function wcFields() {
    var p = getProfile(), n = ui('wcNameInput'), c = ui('wcColorInput');
    if (n && document.activeElement !== n) n.value = p.name || '';
    if (c && document.activeElement !== c) c.value = p.color || '#7aa7ff';
}
function meSoon(k) {
    if (_meSoon) return;
    _meSoon = setTimeout(function() { _meSoon = null; renderAvatarPreview(); if (k === 'wp_profile') wcFields(); if (profWinShown()) { profFields(); if (k !== 'wp_profile') profTablesDraw('change'); } }, 0);
}
function profWinWire() {
    var me = ui('rowMeBtn'), wc = ui('wcProfileBtn'), row = ui('setProfileOpenBtn'), close = ui('profileCloseBtn');
    if (me) me.addEventListener('click', function() { profWinOpen('row'); });
    if (wc) wc.addEventListener('click', function() { profWinOpen('welcome'); });
    if (row) row.addEventListener('click', function() { profWinOpen('settings'); });
    if (close) close.addEventListener('click', function() { profWinClose(); profStep('window-close', {}); });
    try {
        var SP = Storage.prototype, set1 = SP.setItem, want = { wp_profile: 1, wp_tableKeys: 1, wp_tablesSeen: 1 };
        SP.setItem = function(k, v) { set1.call(this, k, v); if (this === localStorage && want[k] === 1) meSoon(k); };
    } catch (e) {}
    try { window.addEventListener('storage', function(e) { if (e && e.key && { wp_profile: 1, wp_tableKeys: 1, wp_tablesSeen: 1 }[e.key] === 1) meSoon(e.key); }); } catch (e) {}   // another window of this app
    window.wpOpenProfile = profWinOpen;
    renderAvatarPreview();   // your picture in the top row and on the welcome from the start
}
profWinWire();
// [settings:profilewin-end]

var _ident = ui('setResetIdentityBtn');
if (_ident) _ident.addEventListener('click', function() {
    if (window.wpNet && window.wpNet.active) { toast('Leave the multiplayer session first.'); return; }
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Reset your multiplayer identity? Tokens a GM assigned to you will no longer recognize you until reassigned. If you host, your table becomes a new GM\u2019s to your players\u2019 apps: you let each of them in again, and at a room code they have joined before they are asked once whether to trust it.', function(yes) {
            if (!yes) return;   // only on Yes: Cancel keeps the identity, and with it the key your players know your table by
            var p = getProfile();
            var np = { id: 'u_' + Math.random().toString(36).slice(2, 10), name: p.name || '' };
            if (p.avatar) np.avatar = p.avatar;
            saveProfile(np);
            try { localStorage.setItem('wp_hostId', np.id); } catch (e) {}   // 1.6.0: a new identity is a new GM too: the host id follows
            if (window.wpNet) window.wpNet.myId = np.id;
            if (window.wpNet && window.wpNet.gmSignReset) window.wpNet.gmSignReset(); else { try { localStorage.removeItem('wp_gmSign'); } catch (e) {} }   // a new identity is a new GM: the next table hosted is signed with a new key
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
        setTimeout(function() { if (window.wpRenderRulers) window.wpRenderRulers(); if (window.renderMinimap) window.renderMinimap(); }, 30);   // canvases redraw in the new colors
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
            if (window.wpVtt && window.wpVtt.locked()) return;   // the VTT group is forced open at a table: not a choice to remember
            var st = {}; groups.forEach(function(g) { st[g.dataset.group] = g.open; });
            try { localStorage.setItem('wp_setGroups', JSON.stringify(st)); } catch (e) {}
        });
    });
})();
