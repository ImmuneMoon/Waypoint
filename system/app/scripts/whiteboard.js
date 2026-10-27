function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



function render() { if(window.appRender) window.appRender(); }



var wbWrap = document.getElementById('whiteboardWrap');

var wb = document.getElementById('whiteboard');

var _lastMeasureMapId = null;

/* ---- token stance: elevation (yards) + posture ----
   Two VTT features (Settings ▸ VTT features, set per campaign — camp.vtt — and on from the
   first launch) decide whether the chips draw and whether the blast template measures in 3D.
   The values stay on the token either way, so switching a feature back on restores them.
   In a session the GM's campaign settings are the ceiling for the player copy: they arrive
   with the snapshot and again whenever the GM flips one, and a player may switch a feature
   off for themselves on top. stanceOn delegates to the one gate, window.wpVtt.on (vtt.js). */
// The postures are the system's own list (systemcore postureList): a system with none has posture switched off (1.6.0, backlog 183 (3)).
// [fogcheck:ground-start]
// Item 19b H5 (the owner's answer of 2026-10-01, "Added": ground height): a token's height is its own elevation — what its player or the GM
// set, "above the ground you stand on" — plus the ground under it: the highest Ground height (item.ground, yards, below 0 for a pit) of the
// map's pieces whose outline covers the centre of the token's cell (fogcore groundAt: the cells the cover readers use). Given the map, every
// reader of a height reads the sum through this one function — the chip and the hover card, cover, the ruler's 3D line, a blast, HeightDiff
// and HeightMod, the fog rules; without a map, the token's own elevation as ever (what the stance rows show and set). shown (true): only the
// pieces players hold, never one the GM hid — for what a host works out for its players (their roll, a thrown blast's height); a player's own
// copy holds no hidden piece, so their app reads the ground from what it has
function tokenElevation(it, map, shown) { var e = Number(it && it.elevation); e = isFinite(e) ? e : 0; return map ? Math.round((e + tokenGround(it, map, shown)) * 100) / 100 : e; }
function tokenGround(it, map, shown) { return it && typeof it === 'object' ? groundAt(map, it.x + (it.w || 60) / 2, it.y + (it.h || 52) / 2, shown) : 0; }   // the ground under a token's centre
function groundAt(map, x, y, shown) {   // the ground under a board point of a map, yards (0: none, no map, no fog core)
    var C = window.wpFogCore; if (!C || !C.groundAt || !C.gridFor || !map || typeof map !== 'object' || !Array.isArray(map.whiteboard)) return 0;
    return C.groundAt(map.whiteboard, x, y, C.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell), shown === true);
}
// ... and its words beside a token's own Elevation, in the viewer's unit: "+3 yd ground" ('' on no ground, or with Token elevation off). A
// number and fixed words; callers escape it
function groundWords(it, map) { var g = stanceOn('elevation') ? tokenGround(it, map) : 0; return g ? fmtElev(g) + ' ' + lenUnit() + ' ground' : ''; }
// [fogcheck:ground-end]
function stanceOn(which) {   // 'elevation' | 'posture'; posture only where the system lists its own (1.6.0)
    if (which === 'posture' && !postureListNow().length) return false;
    var v = window.wpVtt;
    if (v) return v.on(which);
    try { return localStorage.getItem('wp_' + which) !== 'off'; } catch (e) { return true; }   // vtt.js absent: the 1.4.6 keys, on until switched off
}
function setTokenElevation(it, v) { v = Math.round(Number(v) * 10) / 10; if (!isFinite(v) || v === 0) delete it.elevation; else it.elevation = Math.max(-999, Math.min(999, v)); }
function setTokenPosture(it, v) {   // conditions C3: a posture of the system's own list by its id (the first: none stored); with no list, nothing
    var S = window.wpSystemCore; if (!(S && S.postureAt) || !postureListNow().length) return;
    var at = S.postureAt(postureSys(), typeof v === 'string' ? v : ''); if (at.i > 0 && at.p) it.posture = at.p.id; else delete it.posture;
}
// [systemcheck:lenunit-start]
// Item 19 H1 (the owner's words, 2026-09-30: "people should still be able to see the measurement in metric if they have that set as their
// preferred measuring system"): a height or a short length shown and typed in the viewer's own Settings choice, Imperial or Metric — yards or
// metres — and always kept in yards, as a token's elevation is. Plain text: callers escape it
var YD_M = 0.9144;
function metricOn() { return state.measureUnit === 'metric'; }
function lenUnit() { return metricOn() ? 'm' : 'yd'; }
function ydOut(yd) { var v = Number(yd); if (!isFinite(v)) v = 0; return metricOn() ? v * YD_M : v; }   // yards, as the viewer reads them
function ydIn(v) { var n = Number(v); return !isFinite(n) ? NaN : metricOn() ? n / YD_M : n; }   // what the viewer typed, in yards
function fmtLen(yd) { return String(Math.round(ydOut(yd) * 10) / 10) + ' ' + lenUnit(); }
function fmtElev(e) { e = ydOut(e); return (e > 0 ? '+' : e < 0 ? '\u2212' : '') + (Math.round(Math.abs(e) * 10) / 10); }   // signed, in the viewer's unit (the caller adds lenUnit())
// A height box and its step (the read-only check of 2026-10-17: in Metric a step was one metre, 1.1 yd, so a height of whole yards, which is
// what Height clears low cover counts, was lost at the first press). A step is one yard in both, shown as 0.91 m in Metric. A box shows a
// height to a tenth of a yard, or in Metric to the centimetre, so what it shows comes back as the very tenth of a yard it was. A box with
// arrows of its own steps from the figure it shows, so that figure is its step base too (boxHeight). Numbers and plain text
function ydBox(yd) { var v = ydOut(yd); return metricOn() ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10; }
function ydStep() { return metricOn() ? YD_M : 1; }
function stepWords(d) { return (d < 0 ? 'Down' : 'Up') + ' one yard' + (metricOn() ? ' (0.91 m)' : ''); }
function boxHeight(box, yd) { if (!box) return; var s = String(ydBox(yd)); box.step = String(ydStep()); box.defaultValue = s; box.value = s; }
// [systemcheck:lenunit-end]
// [systemcheck:postranged-start]
// A posture's ranged note (1.6.0, backlog 183 (3), the owner by prompt: "A ranged note per posture (Recommended)"): what a foe's RANGED roll
// against a token in it takes, a whole number the system gives each posture of its own list (its Combat card), none by default. Display only,
// no roll reads it: after the distance on a ruler that ends on the token, and a second line under its posture in its chip's tooltip and its
// hover card, while Token posture is on (as the chip is). The chip, the menus and the hover card follow the list. A name or a tag comes from a
// system file or the host: it lands through esc or as text
function postureSys() { return window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null; }
function postureListNow() { var S = window.wpSystemCore; return S && S.postureList ? S.postureList(postureSys()) : []; }
function tokenPostureAt(it) { var S = window.wpSystemCore; return S && S.postureAt ? S.postureAt(postureSys(), it && it.posture) : { i: 0 }; }
function postureRangedOf(p) { var S = window.wpSystemCore; return S && S.postureRangedOf ? S.postureRangedOf(p) : 0; }
function rangedSigned(n) { return n < 0 ? '\u2212' + (-n) : '+' + n; }
function postureRangedLine(p) { var n = postureRangedOf(p); return n ? 'Ranged attacks against this token are at ' + rangedSigned(n) + ' (their roll)' : ''; }
function postureRanged(tok) { if (!(tok && tok.isChar && stanceOn('posture'))) return ''; var at = tokenPostureAt(tok), n = at.i > 0 && at.p ? postureRangedOf(at.p) : 0; return n ? rangedSigned(n) + ' ranged (posture: ' + String(at.p.name || '').toLowerCase() + ')' : ''; }
// [systemcheck:postranged-end]
window.wpStance = { tokenElevation: tokenElevation, tokenGround: tokenGround, groundAt: groundAt, groundWords: groundWords, postures: postureListNow, postureAt: tokenPostureAt, on: stanceOn, setElevation: setTokenElevation, setPosture: setTokenPosture, fmtElev: fmtElev, lenUnit: lenUnit, ydOut: ydOut, ydIn: ydIn, fmtLen: fmtLen, ydBox: ydBox, ydStep: ydStep, stepWords: stepWords, boxHeight: boxHeight };   // item 19 H1: lengths in the viewer's unit; 1.5.4: a height box and its step of one yard

// [fogcheck:stancechips-start]
// A token's stance chips (its Elevation, its posture), drawn into its element. Item 19b H5: the Elevation chip reads the token's height where it
// stands now — its own elevation plus the ground under it — and a token moves with no redraw of the board: its mover's drop, a move that lands
// from the table, a ground piece dragged, resized or re-set under it. The board's redraw and each of those call this one function, so the chip
// never keeps the ground of a place the token has left. It writes only what changed. Its markup: numbers, fixed words, names escaped
function stanceChipsSync(el, item, activeMap) {
    var elevV = item.isChar && stanceOn('elevation') ? tokenElevation(item, activeMap) : 0, elevG = elevV ? groundWords(item, activeMap) : '';   // item 19b H5: its height with the ground it stands on
    var postAt = item.isChar && stanceOn('posture') ? tokenPostureAt(item) : null;   // conditions C3: its place in the list in use (the first: no chip)
    var stanceHtml = '';
    if (elevV) stanceHtml += '<span class="chip elev' + (elevV < 0 ? ' below' : '') + '" title="Elevation ' + fmtElev(elevV) + ' ' + lenUnit() + (elevG ? ' (' + esc(elevG) + ')' : '') + '">' + fmtElev(elevV) + '</span>';
    if (postAt && postAt.i > 0 && postAt.p) stanceHtml += '<span class="chip post" title="' + esc(postAt.p.name) + (postureRangedLine(postAt.p) ? '&#10;' + esc(postureRangedLine(postAt.p)) : '') + '">' + esc(postAt.p.tag) + '</span>';   // its tooltip's second line, the posture's ranged note
    var stanceEl = el.querySelector(':scope > .token-stance');
    if (stanceHtml) {
        if (!stanceEl) { stanceEl = document.createElement('div'); stanceEl.className = 'token-stance'; el.appendChild(stanceEl); }
        if (stanceEl.dataset.sig !== stanceHtml) { stanceEl.dataset.sig = stanceHtml; stanceEl.innerHTML = stanceHtml; }
    } else if (stanceEl) stanceEl.remove();
}
// ... and the chips of every character token on the map on screen, again (window.wpStanceChips): nothing while the data map is on screen, with
// no map, or for a token with no element on the board
function refreshStanceChips() {
    var map = getActiveMap(); if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard) || state.viewMode !== 'visual' || !state.wbEls) return;
    map.whiteboard.forEach(function(w) { if (!w || !w.isChar || typeof w.id !== 'string') return; var el = Object.prototype.hasOwnProperty.call(state.wbEls, w.id) ? state.wbEls[w.id] : null; if (el) stanceChipsSync(el, w, map); });
}
window.wpStanceChips = refreshStanceChips;
// [fogcheck:stancechips-end]

// Context-menu rows for elevation (− / value / +) and posture (select); shared by the GM's
// item menu and the player's own-token menu. Rows carry cm-stance so the menu stays open.
function stanceMenuHtml(it) {
    var eOn = stanceOn('elevation'), pOn = stanceOn('posture');
    if (!eOn && !pOn) return '';
    var ctl = 'padding:2px 4px; background:var(--panel); color:var(--ink); border:1px solid var(--edge); border-radius:4px;';
    var html = '<div class="menu-divider"></div>', gWords = eOn ? groundWords(it, getActiveMap()) : '';   // item 19b H5: the ground it stands on, beside its own Elevation
    if (eOn) html += '<div class="menu-item cm-stance" style="display:flex; align-items:center; gap:6px; cursor:default;"><span class="cm-stance" style="flex:1;">Elevation' + (gWords ? ' <span class="cm-stance stance-ground" style="color:var(--dim); font-size:11px;" title="The ground this token stands on, added to its own elevation">' + esc(gWords) + '</span>' : '') + '</span>'
        + '<button class="cm-stance align-btn stance-elev" data-d="-1" title="' + stepWords(-1) + '">&minus;</button>'
        + '<input class="cm-stance stance-elev-in num-stepped" type="number" step="' + ydStep() + '" value="' + ydBox(tokenElevation(it)) + '" style="width:54px; ' + ctl + '">'
        + '<span class="cm-stance" style="color:var(--dim);">' + lenUnit() + '</span>'
        + '<button class="cm-stance align-btn stance-elev" data-d="1" title="' + stepWords(1) + '">+</button></div>';   // item 19 H1: in the viewer's unit; 1.5.4: a step of one yard in both
    if (pOn) html += '<div class="menu-item cm-stance" style="display:flex; align-items:center; gap:6px; cursor:default;"><span class="cm-stance" style="flex:1;">Posture</span>'
        + '<select class="cm-stance stance-post" style="' + ctl + '">' + postureOptionsHtml(it) + '</select></div>';
    return html;
}
// [sinkcheck:postopts-start]
function postureOptionsHtml(it) { var cur = tokenPostureAt(it).i; return postureListNow().map(function(p, i) { return '<option value="' + esc(p.id) + '"' + (i === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); }   // conditions C3: the list in use, its names escaped
// [sinkcheck:postopts-end]
// [systemcheck:owntok-start]
// Fold M8: a player's gesture follows the live map. A whole copy of the map can land while a drag, a turn or the stance menu is under way and
// replace every object in it: the gesture finds its token again by id each time it writes, and writes it only while the token is still
// theirs to move (the table not paused, theirs, shown, not locked, a character or a waiting token). The GM gets the live item by id
function ownTokenNow(mapId, tokId) {
    var camp = getActiveCampaign(), items = camp && camp.items, n = window.wpNet;
    var map = items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(items, mapId) ? items[mapId] : null;
    if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard) || typeof tokId !== 'string') return null;
    var tok = map.whiteboard.find(function(x) { return !!x && x.id === tokId; }) || null;
    if (!tok || !n || !n.active || n.role !== 'client') return tok;
    if (n.paused || n.selfPaused || tok.ownerId !== n.myId || tok.locked || tok.hidden || !(tok.isChar || tok.waiting)) return null;
    return tok;
}
// a drag's members found again on the live map and set at the pointer's place (where the drag began plus how far it went); the ones that
// are still theirs to move come back
function regrabDrag(md, mapId, dx, dy) {
    var out = [];
    (Array.isArray(md) ? md : []).forEach(function(m) {
        var t = m && m.item ? ownTokenNow(mapId, m.item.id) : null; if (!t) return;
        t.x = m.ox + dx; t.y = m.oy + dy; m.item = t; out.push(m);
    });
    return out;
}
window.wpOwnTokenNow = ownTokenNow; window.wpRegrabDrag = regrabDrag;
// [systemcheck:owntok-end]
function wireStanceMenu(cMenu, items, onChange) {
    items = (items || []).filter(function(t) { return t && t.isChar; });
    if (!items.length) return;
    // fold M8: the rows keep their tokens' ids and find them again at each change; a token gone, or no longer theirs to change, closes the menu
    var am0 = getActiveMap(), mapId = am0 && am0.id, ids = items.map(function(t) { return t.id; });
    function live() { var got = ids.map(function(id) { return ownTokenNow(mapId, id); }); if (got.some(function(t) { return !t; })) { cMenu.style.display = 'none'; return null; } return got; }
    var inp = cMenu.querySelector('.stance-elev-in');
    function setYd(yd) { var ts = live(); if (!ts) return; ts.forEach(function(t) { setTokenElevation(t, yd); }); if (inp) boxHeight(inp, tokenElevation(ts[0])); onChange(); }   // in yards: the menu's tokens at that height, and the box showing it
    function setAll(v) { setYd(ydIn(v)); }   // item 19 H1: v in the viewer's unit
    Array.prototype.forEach.call(cMenu.querySelectorAll('.stance-elev'), function(b) {
        b.addEventListener('click', function(ce) { ce.stopPropagation(); var ts = live(); if (ts) setYd(tokenElevation(ts[0]) + parseInt(b.dataset.d, 10)); });   // 1.5.4: one yard in Metric too, where it was one metre (1.1 yd)
    });
    if (inp) { inp.addEventListener('click', function(ce) { ce.stopPropagation(); }); inp.addEventListener('change', function() { setAll(this.value); }); }
    var sel = cMenu.querySelector('.stance-post');
    if (sel) { sel.addEventListener('click', function(ce) { ce.stopPropagation(); }); sel.addEventListener('change', function() { var v = this.value, ts = live(); if (!ts) return; ts.forEach(function(t) { setTokenPosture(t, v); }); onChange(); }); }
}
// The token creator (owner, 2026-09-27): a player's new picture for their own token — a picture they choose, framed first. A character's token
// changes through its character (char-pic: every token of it), a plain one through tok-pic. Their original is never kept (owner): to change
// it again they pick a picture again
function ownPicOk(tok) {
    var n = window.wpNet; if (!tok || tok.locked || !n || !window.wpProcessAvatar) return false;
    if (tok.charId) { var S = window.wpSheets, c = S && S.charById ? S.charById(tok.charId) : null; return !!(n.charPic && c && !c.partial && !c.npc && S.canOpen && S.canOpen(tok.charId)); }   // what char-pic takes: their own whole character, sheets on for them
    return !!n.tokPic;
}
// The outline a token's framed picture will show (the creator's guide): what the save makes of it — a picture, cut to this map's cell when it
// is one cell (a copy: the token itself is untouched); a sized-up token its own outline; one with none shows the whole square
function tokenGuide(tok, am) {
    var SC = window.wpSystemCore, p = Object.assign({}, tok, { type: 'image', src: 'x' });
    if (SC && SC.shapeStandIn) SC.shapeStandIn(p, am);
    return p.shape === 'hexagon' || p.shape === 'rect' || p.shape === 'circle' ? { shape: p.shape, w: p.w, h: p.h } : { shape: 'rect', w: 1, h: 1 };
}
window.wpTokenGuide = tokenGuide;   // the roster portrait and an outside reader's token import frame against it too
function newOwnPicture(tok) {
    var n = window.wpNet, am = getActiveMap(); if (!ownPicOk(tok) || !am) return;
    var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
    fi.addEventListener('change', function() {
        var f = fi.files && fi.files[0]; if (!f) return;
        var guide = tokenGuide(tok, am);
        window.wpProcessAvatar(f, function(data) {
            var answer = function(a) { toast(a.error || 'Your token\u2019s picture is changed.'); };
            var r = tok.charId ? n.charPic(tok.charId, '', data, answer) : n.tokPic(am.id, tok.id, data, answer);
            if (r && r.error) toast(r.error);
        }, { px: 256, max: 200000, title: 'Frame your token\u2019s picture', guide: guide });
    });
    fi.click();
}
// A player's own token: the one edit menu they get (same permission line as moving it)
function showStanceMenu(e, tok) {
    var cMenu = document.getElementById('contextMenu'); if (!cMenu) return;
    cMenu.onclick = null;   // a machine that hosted earlier in this run still holds the GM's item menu's handler: a player's rows are never its business
    var rows = tok.locked ? (stanceOn('elevation') || stanceOn('posture') ? '<div class="menu-divider"></div><div class="menu-item" style="color:var(--dim); cursor:default;">&#128274; Locked by the GM</div>' : '') : (stanceMenuHtml(tok) || '');   // a locked token is frozen for its player
    var sheetRow = tok.charId && window.wpSheets && window.wpSheets.canOpen(tok.charId) ? '<div class="menu-item cm-sheet-own">&#128203; Sheet&hellip;</div>' : '';
    var hudRow = tok.charId && window.wpSheets && window.wpSheets.hudFor && window.wpSheets.hudFor(tok.charId) ? '<div class="menu-item cm-hud-own">&#12336; HUD&hellip;</div>' : '';   // HUD frame (HF2b)
    var picRow = ownPicOk(tok) ? '<div class="menu-item cm-pic-own">&#128444;&#65039; New picture&hellip;</div>' : '';   // the token creator: their own picture, framed
    var fxRow = window.wpSheets && window.wpSheets.tokenFxModel && window.wpSheets.tokenFxModel(tok) ? '<div class="menu-item cm-fx-own">&#10022; Effects&hellip;</div>' : '';   // conditions C2: where their sheet lets them
    rows += ownLightHtml(tok);   // lighting L5: their own light
    rows += tokenSensesLine(tok);   // senses S3: its senses, read-only
    if (!rows && !sheetRow && !hudRow && !picRow && !fxRow) return;
    cMenu.innerHTML = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + esc(tok.charName || 'Your token') + '</div>' + sheetRow + hudRow + fxRow + picRow + rows.replace('<div class="menu-divider"></div>', '');
    cMenu.style.display = 'flex';
    placeMenu(cMenu, e);
    var ownSheet = cMenu.querySelector('.cm-sheet-own'); if (ownSheet) ownSheet.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; window.wpSheets.openSheet(tok.charId); });
    var ownHud = cMenu.querySelector('.cm-hud-own'); if (ownHud) ownHud.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; window.wpSheets.openHud(tok.charId); });
    var ownPic = cMenu.querySelector('.cm-pic-own'); if (ownPic) ownPic.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; newOwnPicture(tok); });
    var ownFx = cMenu.querySelector('.cm-fx-own'); if (ownFx) ownFx.addEventListener('click', function(ce) { ce.stopPropagation(); showTokenFxMenu(tok); });   // conditions C2
    wireStanceMenu(cMenu, [tok], function() { save(!!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')); render(); });   // fold M8: a player's stance goes to the host at once
    var ownLight = cMenu.querySelector('.own-light');
    if (ownLight) { ownLight.addEventListener('click', function(ce) { ce.stopPropagation(); }); ownLight.addEventListener('change', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; askOwnLight(tok, ownLight.value); }); }
}
// [sinkcheck:ownlight-start]
// Lighting L5 (owner answer 3): a player's own light, on their own token's menu — off, on, or one of the system's presets the GM ticked
// "players may pick". Nothing is written here: the host is asked (net.js tokLight) and its answer is said; the map it sends back is the truth.
// A preset's name is a system file's text and a light's the host's: both through esc. Offered anywhere (owner answer 11), never on a waiting
// or a locked token; a light the GM locked says so
function ownLightPicks() {
    var S = window.wpSystemCore, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, all = S && S.lightPresets && sys ? S.lightPresets(sys) : [], out = [];
    all.forEach(function(p, i) { if (p && p.pick === true) out.push({ i: i, p: p }); });   // each by its place in the whole list: the host reads the same list
    return out;
}
function ownLightHtml(tok) {
    var n = window.wpNet, C = window.wpFogCore; if (!tok || !tok.isChar || tok.waiting || tok.locked || tok.hidden || !n || !n.tokLight || !C || !C.cleanLight) return '';
    var L = C.cleanLight(tok.light), picks = ownLightPicks(); if (!L && !picks.length) return '';
    if (tok.lightLock === true) return '<div class="menu-item" style="color:var(--dim); cursor:default;">&#128274; Light locked by the GM</div>';
    var word = function(u) { return u === 'ft' ? 'ft' : u === 'm' ? 'm' : u === 'cells' ? 'cells' : 'yd'; }, cur = -1;
    if (L && L.name) picks.forEach(function(k) { if (cur < 0 && k.p.name === L.name && k.p.bright === L.bright && k.p.dim === L.dim && word(k.p.unit) === word(L.unit)) cur = k.i; });
    var opts = L ? '<option value="off"' + (L.off ? ' selected' : '') + '>Off</option>' + (cur < 0 ? '<option value="on"' + (L.off ? '' : ' selected') + '>' + (L.name ? esc(L.name) : 'Its light') + '</option>' : '') : '<option value="" selected>No light</option>';
    picks.forEach(function(k) { opts += '<option value="' + k.i + '"' + (L && !L.off && cur === k.i ? ' selected' : '') + '>' + esc(k.p.name) + ' (' + esc(String(Number(k.p.bright) || 0)) + ' / ' + esc(String(Number(k.p.dim) || 0)) + ' ' + word(k.p.unit) + ')</option>'; });
    return '<div class="menu-item cm-stance" style="display:flex; align-items:center; gap:6px; cursor:default;"><span class="cm-stance" style="flex:1;">Light</span><select class="cm-stance own-light" title="Your token&rsquo;s light: off, on, or one of the lights your GM offers" style="max-width:190px; padding:2px 4px; background:var(--panel); color:var(--ink); border:1px solid var(--edge); border-radius:4px;">' + opts + '</select></div>';
}
function askOwnLight(tok, value) {
    var n = window.wpNet, am = getActiveMap(); if (!n || !n.tokLight || !am || !tok || typeof value !== 'string' || value === '') return;
    var o = value === 'off' ? { on: false } : value === 'on' ? { on: true } : null;
    if (!o) { var i = /^(0|[1-9][0-9]{0,2})$/.test(value) ? Number(value) : -1, k = ownLightPicks().filter(function(x) { return x.i === i; })[0]; if (!k) { toast('That light is no longer on offer.'); return; } o = { on: true, preset: k.i, name: k.p.name }; }
    var r = n.tokLight(am.id, tok.id, o, function(a) { toast(a.error || (o.on ? 'Your token\u2019s light is lit.' : 'Your token\u2019s light is out.')); });
    if (r && r.error) toast(r.error);
}
// The GM's token menu: the selected lights switched off (when any of them is on) or on — their radii, unit and name stay
function gmLightToggle(items) {
    var C = window.wpFogCore; if (!C || !C.cleanLight) return null;
    var lit = (items || []).filter(function(it) { return it && !it.waiting && !!C.cleanLight(it.light); }); if (!lit.length) return null;
    var anyOn = lit.some(function(it) { return !C.cleanLight(it.light).off; });
    return { lit: lit, anyOn: anyOn, apply: function() { lit.forEach(function(it) { var L = C.cleanLight(it.light); if (anyOn) L.off = true; else delete L.off; it.light = L; }); return anyOn ? 'off' : 'on'; } };
}
// [sinkcheck:ownlight-end]

// [sinkcheck:senseline-start]
// Senses S3: a character token's senses as one read-only line on its menu (a player's own, and the GM's) — "Blind" when it is, each sense it
// holds with its range, one held but off with why ("off while blind", or off and the switch that turned it off). Worked out by this app from its
// own system, character copy and token: the host sends no word of it. A name or a label is a system file's text: through esc. Absent unless the
// token is blind or holds a sense
var SENSE_LINE_UNIT = { ft: 'ft', m: 'm', cells: 'cells' };
function tokenSensesLine(tok) {
    var F = window.wpFog, S = window.wpSystemCore, camp = getActiveCampaign(), map = getActiveMap(); if (!tok || !tok.isChar || tok.waiting || !F || !camp || !map) return '';
    var ts = F.tokenSenses(tok, map, camp, !tok.ownerId), byId = Object.create(null), words = [];
    F.campSenses(camp).concat(F.campMarkSenses(camp)).forEach(function(s) { byId[s.id] = s; });   // senses S4: the mark senses too
    var said = function(e) { var s = byId[e.id]; return s ? String(s.name) + ' ' + e.n + ' ' + (SENSE_LINE_UNIT[s.unit] || 'yd') : ''; };
    if (ts.blind) words.push('Blind');
    ts.full.concat(ts.marks || []).forEach(function(e) { var t = said(e); if (t) words.push(t); });
    (ts.offs || []).forEach(function(e) {
        var t = said(e), s = byId[e.id]; if (!t) return;
        var f = e.why === 'off' && s.off && S && S.fieldById ? S.fieldById(camp.system, s.off.field) : null;
        words.push(t + (e.why === 'null' ? ': fails here' : ': off' + (e.why === 'blind' ? ' while blind' : f && typeof f.label === 'string' && f.label ? ', ' + f.label : '')));   // senses S7a: a null area
    });
    if (!words.length) return '';
    return '<div class="menu-item cm-senses" style="color:var(--dim); cursor:default; white-space:normal; max-width:280px; font-size:11px;">Senses: ' + esc(words.join(' · ')) + '</div>';
}
// [sinkcheck:senseline-end]

// [sinkcheck:gmframe-start]
// The token creator, the GM's side (owner, 2026-09-27): Frame picture… on a picture token — its kept original (Keep the original: the whole
// picture reopened at the square chosen last, while the token still wears what was framed from it) or the picture it wears (a bundled one
// from its square twin). OK: a character's token changes its character (every token of it); plain tokens, the selected ones still wearing it
function frameSourceOf(tok, camp) {
    if (!tok || tok.type !== 'image' || typeof tok.src !== 'string' || !tok.src) return null;
    var SC = window.wpSystemCore, c = tok.charId && camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, tok.charId) ? camp.chars[tok.charId] : null;
    var worn = function(v) { var f = SC && SC.cleanFrame ? SC.cleanFrame(v) : null; return f && f.of === tok.src ? f : null; }, fr = (c && worn(c.frame)) || worn(tok.frame);   // framed from it and still worn: the character's, else the token's own (framed before it had a character)
    var bm = /^(?:[/]saves[/]images|assets)[/]tutorial[/]([a-z_]{1,40})_hex[.]png$/.exec(tok.src);
    var src = fr ? fr.src : bm ? 'assets/tutorial/' + bm[1] + '_sq.jpg' : tok.src;
    return picRef(src) ? { src: src, start: fr ? { x: fr.x, y: fr.y, s: fr.s } : null } : null;
}
function frameGmPicture(am, ids) {
    var camp = getActiveCampaign(), S = window.wpSheets, first = am && Array.isArray(am.whiteboard) && Array.isArray(ids) ? am.whiteboard.find(function(x) { return x && x.id === ids[0]; }) : null;
    if (!camp || !first || !window.wpFrame || !S || !S.applyTokenFrame || !S.applyCharFrame) return false;
    if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\u2019re at someone else\u2019s table.'); return false; }
    var fs0 = frameSourceOf(first, camp), charId = !first.charId ? '' : camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, first.charId) ? first.charId : null;
    if (!fs0 || charId === null) { toast('That picture cannot be framed.'); return false; }   // a charId that is none of this campaign's characters: never dispatched
    var was = first.src, mapId = am.id;
    var go = function(src, start, canFall) {   // the kept original, else (it is gone) the picture it wears
        return window.wpFrame.open(src, { px: 256, as: 'blob', title: 'Frame the picture', guide: tokenGuide(first, am), start: start, keep: true,
            onError: canFall ? function() { toast('The kept original is gone: framing the picture it wears.'); go(was, null, false); } : null }, function(res) {
            var plan = { blob: res.blob, was: was, frame: res.keep ? { src: src, x: res.rect.x, y: res.rect.y, s: res.rect.s } : null };
            Promise.resolve(charId ? S.applyCharFrame(charId, Object.assign(plan, { scope: 'tokens' })) : S.applyTokenFrame(mapId, ids, plan)).then(function(ok) {
                if (ok) toast('The picture is framed.'); else toast('Nothing was framed (the token changed meanwhile, or the picture was not saved).');
            });
        });
    };
    return go(fs0.src, fs0.start, fs0.src !== was && !!picRef(was));
}
// [sinkcheck:gmframe-end]

// In a session, clients resolve campaign images through the host-fed cache
// A text box with no color of its own: light ink on a dark plate, dark ink on a light one,
// the theme's ink when the plate is missing or nearly clear (so both themes stay readable).
// A color at a given opacity, for the text / background opacity sliders. color-mix keeps any
// CSS color intact (names, var(--ink), rgba); an older engine falls back to a canvas parse.
function withAlpha(c, a) {
    c = cssColor(c);   // a colour from a file could be url(…) or a second property: none
    a = Number(a); if (!isFinite(a) || a >= 1) return c;
    if (!c || c === 'transparent') return c;
    a = Math.max(0, Math.min(1, a));
    try { if (window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)')) return 'color-mix(in srgb, ' + c + ' ' + Math.round(a * 100) + '%, transparent)'; } catch (e) {}
    var probe = c;
    if (/^var\(/.test(c)) { try { probe = getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1).trim()).trim() || c; } catch (e) {} }
    try {
        var cv = withAlpha._cv || (withAlpha._cv = document.createElement('canvas').getContext('2d'));
        cv.fillStyle = '#000'; cv.fillStyle = probe; var s = cv.fillStyle;
        var m = /^#([0-9a-f]{6})$/i.exec(s);
        if (m) return 'rgba(' + parseInt(m[1].slice(0, 2), 16) + ',' + parseInt(m[1].slice(2, 4), 16) + ',' + parseInt(m[1].slice(4, 6), 16) + ',' + a + ')';
        var m2 = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(s);
        if (m2) return 'rgba(' + m2[1] + ',' + m2[2] + ',' + m2[3] + ',' + (a * +m2[4]) + ')';
    } catch (e) {}
    return c;
}
window.wpWithAlpha = withAlpha;
function plateInk(bg) {
    if (!bg || bg === 'transparent') return '';
    var r, g, b, a = 1, m;
    if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(bg).trim()))) {
        var x = m[1].length === 3 ? m[1].split('').map(function(c) { return c + c; }).join('') : m[1];
        r = parseInt(x.slice(0, 2), 16); g = parseInt(x.slice(2, 4), 16); b = parseInt(x.slice(4, 6), 16);
    } else if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(String(bg).trim()))) {
        r = +m[1]; g = +m[2]; b = +m[3]; if (m[4] !== undefined) a = +m[4];
    } else return '';
    if (a < 0.35) return '';
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 128 ? '#f2f2f7' : '#1f1d24';
}
// [sinkcheck:resolveimg-start]
function resolveImg(src) {
    var out = (window.wpNet && window.wpNet.assetSrc) ? window.wpNet.assetSrc(src) : src;
    return out === src ? picRef(src) : out;   // unchanged (the GM, solo or hosting; a bundled asset): the app's own pictures only — a web address from a file never loads
}
// [sinkcheck:resolveimg-end]
// [sinkcheck:picfill-start]
// The map builder (fold B3): a piece's fill may be one of the campaign's own pictures (texSrc, with texTile for the size of one repeat). It is
// read here and nowhere else at the draw: the path through fogcore cleanTexSrc (a plain path under saves/images, never a web address),
// resolved as every picture of the board is (resolveImg: on a player's app the bytes the host sent, asked for once), and handed to buildcore,
// which alone writes it as a css url or an svg attribute. null for a piece that wears none, for a token and for a kind of piece that takes
// no texture
function wbPicFill(item) {
    var FC = window.wpFogCore, BC = window.wpBuildCore;
    if (!item || !FC || !BC || typeof FC.cleanTexSrc !== 'function' || typeof BC.picStyle !== 'function' || item.isChar || item.waiting) return null;
    var box = item.type === 'rect' || item.type === 'circle' || item.type === 'hexagon' || item.type === 'diamond';
    if (!box && !(item.type === 'path' && item.tip === 'fill')) return null;
    var src = FC.cleanTexSrc(item.texSrc); if (!src) return null;
    var url = resolveImg(src); if (typeof url !== 'string' || !url) return null;
    return { src: src, url: url, tile: FC.cleanTexTile(item.texTile) || 1, box: box };
}
// A short text that stands for a resolved address in a key: the address itself when it is short, else its length and both its ends. On a
// player's app an SVG picture's address is the whole picture inline, which may be millions of characters
function wbPicUrlKey(u) { return u.length <= 256 ? u : u.length + '|' + u.slice(0, 64) + u.slice(-64); }
// A filled region's picture: an svg pattern in the path's own defs (buildcore picPattern), built again only when its picture, its tile, its
// place, its size or its colour changes. True when the region wears its picture
function wbPicPath(svg, pathEl, item, bw, bh, col) {
    var pf = wbPicFill(item), BC = window.wpBuildCore; if (!pf || pf.box || !svg || !pathEl) return false;
    var key = 'pic|' + pf.src + '|' + pf.tile + '|' + item.x + '|' + item.y + '|' + (item.w || 0) + '|' + (item.h || 0) + '|' + bw + '|' + bh + '|' + col + '|' + wbPicUrlKey(pf.url), defs = svg.querySelector(':scope > defs');
    if (!defs || svg.dataset.texKey !== key) {
        if (defs) defs.remove();
        var pat = BC.picPattern(document, pf.url, pf.tile, item.x, item.y, item.w || bw, item.h || bh, col, ++_texSerial);
        if (!pat) { delete svg.dataset.texKey; delete svg.dataset.texId; return false; }
        pat.setAttribute('patternTransform', 'scale(' + (bw / (item.w || bw)) + ' ' + (bh / (item.h || bh)) + ')');
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); defs.appendChild(pat); svg.insertBefore(defs, svg.firstChild);
        svg.dataset.texKey = key; svg.dataset.texId = pat.getAttribute('id');
    }
    pathEl.setAttribute('fill', 'url(#' + svg.dataset.texId + ')'); if (pathEl.style.fill) pathEl.style.fill = '';
    return true;
}
// [sinkcheck:picfill-end]
function fixEmbeddedImgs(el) {
    if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return;
    el.querySelectorAll('img').forEach(function(im) {
        var orig = im.dataset.origSrc || im.getAttribute('src');
        if (!orig || orig.indexOf('/saves/images/') !== 0) return;
        im.dataset.origSrc = orig;
        var want = resolveImg(orig);
        if (im.getAttribute('src') !== want) im.setAttribute('src', want);
    });
}

import { state, dom } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, findLandingRoom, characterList, locateCharacter } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt, snapToHex, getSnapCoords } from './datamap.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';

import { cssColor, picRef } from './safecore.js';   // a map from a file: colours that are colours, pictures that are the app's own



  var _texSerial = 0;   // the map builder: one id for each svg pattern a filled region's texture takes (never an item's id)
  function renderWhiteboard() {
      if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
      if (window.wpRenderCombatStrip) window.wpRenderCombatStrip();
      if (window.wpEnvTool && window.wpEnvTool.draw) window.wpEnvTool.draw();   // 1.6.0: the Environment tool's layer, while it is in hand
      if (window.wpFogRedraw) window.wpFogRedraw();   // keep the fog overlay live whenever a fog map is on screen (any tool, during drags)

      var activeMap = getActiveMap();

      if(!activeMap || !activeMap.whiteboard) return;

      // Restore this map's saved grid choice

      var mapGrid = (activeMap.meta && activeMap.meta.gridType) || 'off';

      if (mapGrid !== state.gridType) applyGridType(mapGrid);
      if (typeof cellLabelsSync === 'function') cellLabelsSync();   // backlog 34: the Grid menu's Cell labels and the labels themselves follow the map on screen

      // Placed rulers are per-scene: clear them when the map changes

      if (activeMap.id !== _lastMeasureMapId) {

          _lastMeasureMapId = activeMap.id;
          if (typeof buildPolyEnd === 'function') buildPolyEnd();   // the map builder: a polygon under way was the other map's

          if (typeof clearMeasures === 'function') clearMeasures();
          if (typeof clearBlasts === 'function') clearBlasts();

      }



      var seen = {};

      var selItem = null;

      activeMap.whiteboard.forEach(function(item) {

          seen[item.id] = 1;

          var el = state.wbEls[item.id];
          if (el && el.dataset.type && el.dataset.type !== item.type) {
              // Same id, different kind of item — a player's grey placeholder (a locked rect)
              // becoming the real token when the GM reveals it. Rebuild the box so the new
              // kind's styling applies; otherwise the picture ignores the 'image' sizing rule
              // and draws at its full pixel size inside a rect-styled frame.
              el.classList.remove(el.dataset.type);
              el.classList.add(item.type);
              el.dataset.type = item.type;
              el.innerHTML = '';
              delete el.dataset.ph;
          }
          if(!el) {
              el = document.createElement('div');
              el.className = 'wb-item ' + item.type;
              el.dataset.type = item.type;
              el.dataset.id = item.id;

              wb.appendChild(el);

              state.wbEls[item.id] = el;

              attachDrag(el, 'visual');

              

              if(item.type !== 'text') {

                  // Portal travel: double-click an item linked to a room with a Linked Map

                  el.addEventListener('dblclick', function(e) {

                      e.stopPropagation();

                      var _am = getActiveMap(); if (!_am) return; var wItem = _am.whiteboard.find(x => x.id === item.id);

                      if(!wItem || !(wItem.nodeId || wItem.targetMapId)) return;

                      var r = wItem.nodeId ? getActiveMap().rooms.find(x => x.id === wItem.nodeId) : null;

                      // The item's own portal target wins over its room's
                      if (wItem.targetMapId) r = { targetMapId: wItem.targetMapId };

                      if(r && r.targetMapId) {

                          // Players travel individually through portals (host validates);
                          // the rest of the table stays where it is.

                          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {

                              if (!wItem.hidden) { window.wpNet.requestTravel(wItem.id); if (wItem.portalLock !== true) toast('Traveling...'); }   // a portal locked for players: the request still goes (the host is the judge, and its answer says why), without the promise

                              return;

                          }

                          var srcForLand = (wItem.nodeId && r.id) ? r : { id: null, name: wItem.name, targetRoomId: wItem.targetRoomId };
                          var landW = findLandingRoom(srcForLand, getActiveCampaign().items[r.targetMapId]);
                          if (navigateToMap(r.targetMapId, landW && landW.id)) toast(landW ? 'Traveled to ' + (landW.name || 'the linked room') + '.' : 'Traveled to linked map.');

                      }

                  });

              }

              if(item.type === 'text') {

                  el.addEventListener('dblclick', function(e) {

                      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

                      el.contentEditable = "true"; el.classList.add('editing');

                      el.style.cursor = 'text';

                      el.focus();

                      textStandInPick(el, document, window);   // a box still holding its stand-in words has them all selected, so what is typed takes their place

                  });

                  el.addEventListener('paste', function(e) {   // 1.5.4: plain words only, as the Content editor in Properties pastes them: markup from elsewhere names fonts of the computer it came from

                      if (el.contentEditable !== 'true') return;

                      e.preventDefault();

                      var t = (e.clipboardData || window.clipboardData).getData('text/plain');

                      try { document.execCommand('insertText', false, t); } catch (err) {}

                  });

                  el.addEventListener('blur', function(e) {

                      el.contentEditable = "false"; el.classList.remove('editing');

                      el.style.cursor = 'grab';

                      item.text = el.innerHTML;

                      save(true);

                  });

              }

              

              el.addEventListener('pointerenter', function(e) {

                  var _am = getActiveMap(); if (!_am) return; var wItem = _am.whiteboard.find(x => x.id === item.id);

                  if(!wItem) return;

                  // no info leaks from hidden items on the player side

                  if (wItem.hidden && window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

                  

                  var tt = document.getElementById('wbTooltip');

                  

                  if(wItem.isChar) {

                      var cname = wItem.charName || 'Unnamed Character';

                      var cstats = wItem.charStats || '';
                      var stanceBits = [];
                      if (stanceOn('elevation')) { var hvE = tokenElevation(wItem, _am), hvG = groundWords(wItem, _am); if (hvE || hvG) stanceBits.push('Elevation ' + fmtElev(hvE) + ' ' + lenUnit() + (hvG ? ' (' + esc(hvG) + ')' : '')); }   // item 19b H5: its height, the ground it stands on included (and named)
                      var postAtH = stanceOn('posture') ? tokenPostureAt(wItem) : null; if (postAtH && postAtH.i > 0 && postAtH.p) stanceBits.push(String(postAtH.p.name || ''));   // conditions C3: its posture's name in the list in use (a text node below)
                      var stanceLine = stanceBits.length ? '<div class="rc" style="color:var(--gold); font-size:11px;">' + stanceBits.join(' \u00b7 ') + '</div>' : '';

                      // GM only: the roster entry's notes ride along (players never get `info`)
                      var isClientC = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                      if (!isClientC && wItem.charRef) {
                          var amC = getActiveMap();
                          var entry = null;
                          (amC.rooms || []).some(function(rm) { entry = (rm.characters || []).find(function(c) { return c.id === wItem.charRef; }); return !!entry; });
                          if (entry && entry.info) cstats = (cstats ? cstats + String.fromCharCode(10) : '') + entry.info;
                      }
                      // built from nodes (1.5.0): a portrait, the name, the (capped) stats line, the sheet's hover fields, the stance line
                      var ttRoot = document.createElement('div'); ttRoot.className = 'room'; ttRoot.style.cssText = 'border-left-color:var(--gold); margin:0; pointer-events:none;';
                      var ownerAv = (!wItem.src && wItem.face && window.wpNet && window.wpNet.faceView) ? (window.wpNet.faceView({ face: wItem.face }, cssColor((wItem.color && wItem.color !== 'transparent') ? wItem.color : '#4db3d3')).img || null) : null;   // Onboarding F1c: the character's own face (an emoji face has no picture: the silhouette), never its owner's live profile picture
                      var portrait = wItem.src ? resolveImg(wItem.src) : (ownerAv || (window.wpDefaultAvatar ? window.wpDefaultAvatar((wItem.color && wItem.color !== 'transparent') ? wItem.color : ('hsl(' + wbHashHue(wItem.charName || wItem.id) + ',55%,55%)')) : null));   // character image → owner profile picture → color-tinted silhouette default
                      if (portrait) { var ttImg = document.createElement('img'); ttImg.src = portrait; ttImg.loading = 'lazy'; ttImg.decoding = 'async'; ttImg.style.cssText = 'width:100%; height:90px; object-fit:cover; border-radius:4px; margin-bottom:6px; display:block;'; ttRoot.appendChild(ttImg); }   // fixed height so the card measures the same before/after the image loads (matches the room card)
                      var ttName = document.createElement('div'); ttName.className = 'rn'; ttName.textContent = cname; ttRoot.appendChild(ttName);
                      var ttStats = document.createElement('div'); ttStats.className = 'rc'; ttStats.style.cssText = 'color:var(--ink); font-size:11px; white-space:pre-wrap; text-transform:none; letter-spacing:0;'; ttStats.textContent = cstats.length > 400 ? cstats.slice(0, 400) + '…' : cstats; ttRoot.appendChild(ttStats);   // prose, not a label: no uppercase; capped for the hover peek (full text lives in the roster / Properties)
                      if (!isClientC && wItem.gmInfo) { var gmTxt = String(wItem.gmInfo); var ttGm = document.createElement('div'); ttGm.className = 'rc'; ttGm.style.cssText = 'color:var(--gold); font-size:11px; white-space:pre-wrap; margin-top:4px; border-top:1px solid var(--edge); padding-top:3px; text-transform:none; letter-spacing:0;'; ttGm.textContent = gmTxt.length > 300 ? gmTxt.slice(0, 300) + '…' : gmTxt; ttRoot.appendChild(ttGm); }   // per-token GM note / dialogue (GM only; stripped on the wire), capped
                      var sheetLines = window.wpSheets ? window.wpSheets.hoverLinesForToken(wItem) : [];
                      if (sheetLines.length) { var ttSheet = document.createElement('div'); ttSheet.className = 'rc'; ttSheet.style.cssText = 'color:var(--ink); font-size:11px;'; ttSheet.textContent = sheetLines.join(' · '); ttRoot.appendChild(ttSheet); }
                      if (stanceBits.length) { var ttStance = document.createElement('div'); ttStance.className = 'rc'; ttStance.style.cssText = 'color:var(--gold); font-size:11px;'; ttStance.textContent = stanceBits.join(' · '); ttRoot.appendChild(ttStance); }
                      if (postureRanged(wItem)) { var ttRanged = document.createElement('div'); ttRanged.className = 'rc'; ttRanged.style.cssText = 'color:var(--dim); font-size:11px; text-transform:none; letter-spacing:0;'; ttRanged.textContent = postureRangedLine(tokenPostureAt(wItem).p); ttRoot.appendChild(ttRanged); }   // posture: its ranged note (display only)
                      tt.textContent = ''; tt.appendChild(ttRoot);

                      tt.style.display = 'block';

                      return;

                  }

                  

                  if (wItem.type === 'trigger' && !wItem.nodeId) {
                      // a trigger zone is GM prep: its card shows the name and the message it fires; players get nothing
                      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +
                                     '<div class="rn">' + esc(wItem.name || 'Trigger zone') + '</div>' +
                                     '<div class="rc" style="color:var(--ink); font-size:11px; white-space:pre-wrap; text-transform:none; letter-spacing:0;">' + esc(wItem.eventMessage || 'No event message yet \u2014 write one in Properties.') + '</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px; text-transform:none; letter-spacing:0;">Trigger zone \u00b7 fires when a character token is dropped here</div></div>';
                      tt.style.display = 'block';
                      return;
                  }
                  if (wItem.type === 'text' && !wItem.nodeId) {
                      var plain = (wItem.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                      var wordCount = plain ? plain.split(' ').length : 0;
                      var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--blue); margin:0; pointer-events:none;">' +
                                     '<div class="rn">Text box</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px;">' + wordCount + ' word' + (wordCount === 1 ? '' : 's') +
                                     (wItem.hidden ? ' &middot; hidden from players' : '') + '</div>' +
                                     (isClient ? '' : '<div class="rc" style="color:var(--gold); font-size:11px;">Double-click to edit &middot; color swatch sets the text color</div>') +
                                     '</div>';
                      tt.style.display = 'block';
                      return;
                  }

                  if (!wItem.nodeId && wItem.targetMapId) {
                      // A direct portal: say where it leads
                      var campP = getActiveCampaign();
                      var destP = campP && campP.items[wItem.targetMapId];
                      var isClientP = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                      var lockTipP = portalLockTip(wItem, getActiveMap(), !!isClientP);   // a portal's own lock: said under where it leads
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +
                                     '<div class="rn">' + esc(wItem.name || (wItem.type === 'trigger' ? 'Portal zone' : 'Portal')) + '</div>' +
                                     '<div class="rc" style="color:var(--gold)">&rarr; ' + esc(destP && destP.meta && destP.meta.title || 'another map') + '</div>' +
                                     lockTipP + (lockTipP && isClientP ? '' : '<div class="rc" style="color:var(--dim); font-size:11px;">' + (isClientP ? 'Drop your token here (or double-click) to travel' : 'Double-click to travel · drop a player\'s token here to send them through') + '</div>') +
                                     '</div>';
                      tt.style.display = 'block';
                      return;
                  }

                  if(!wItem.nodeId) return;

                  var r = getActiveMap().rooms.find(x => x.id === wItem.nodeId);

                  if(!r) return;

                  

                  var activeMap = getActiveMap();

                  var defaultCat = Object.keys(activeMap.cats)[0];

                  var c = activeMap.cats[r.cat] || activeMap.cats[defaultCat] || {label:'Unknown',color:'#000'};

                  var badgesHtml = r.characters && r.characters.length > 0 ? '<div class="badge-char">'+r.characters.length+'</div>' : '';

                  

                  var isClientTT = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                  var destTT = r.targetMapId && getActiveCampaign() ? getActiveCampaign().items[r.targetMapId] : null;
                  var destRoomTT = destTT && r.targetRoomId ? (destTT.rooms || []).find(function(x) { return x.id === r.targetRoomId; }) : null;
                  var lockTT = destTT && destTT.meta && destTT.meta.playerLock ? ' \u00b7 \uD83D\uDD12 ' + (isClientTT ? 'closed for now' : 'locked for players') : '';
                  var destLine = destTT ? '<div class="rn" style="color:var(--gold);">\u2192 ' + esc(destTT.meta && destTT.meta.title || r.targetMapId) + (destRoomTT ? ' \u00b7 ' + esc(destRoomTT.name || '') : '') + lockTT + '</div>' : '';
                  var lockTipTT = portalLockTip(wItem, activeMap, !!isClientTT);   // a portal's own lock: a player is told it is locked in place of how to travel
                  var travelHint = r.targetMapId ? destLine + (lockTipTT && isClientTT ? '' : '<div class="rc" style="color:var(--gold)">' + (isClientTT ? 'Drop your token here (or double-click) to travel' : 'Double-click to travel · drop a player\'s token here to send them through') + '</div>') : '';

                  var thumb = r.image ? '<img src="'+esc(resolveImg(r.image))+'" loading="lazy" decoding="async" style="width:100%; height:90px; object-fit:cover; border-radius:4px; margin-bottom:6px; display:block;">' : '';

                  var ccol = /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([\d.,\s%]+\)|[a-zA-Z]{1,20}|var\(--[\w-]+\))$/.test(String(c.color || '')) ? c.color : '#888';   // a category color is a color, never markup (it lands in a style attribute)
                  tt.innerHTML = '<div class="room" style="border-left-color:'+ccol+'; margin:0; pointer-events:none;">' +

                                 thumb +

                                 '<div class="rn">'+esc(r.name||'(unnamed)')+'</div>' +

                                 '<div class="rc" style="color:'+ccol+'">'+esc(c.label)+'</div>' +
                                 (!isClientTT && r.notes ? '<div class="rc" style="color:var(--ink); font-size:11px; white-space:pre-wrap; margin-top:4px; text-transform:none; letter-spacing:0;">' + esc(String(r.notes).slice(0, 320)) + (String(r.notes).length > 320 ? '\u2026' : '') + '</div>' : '') +   // GM only: the room's notes ride the hover card

                                 travelHint + lockTipTT +

                                 '<div class="badges">'+badgesHtml+'</div>' +

                                 '</div>';

                  

                  tt.style.display = 'block';

              });

              

              el.addEventListener('pointermove', function(e) {

                  var tt = document.getElementById('wbTooltip');

                  if (tt.style.display === 'block') {

                      var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

                      tt.style.left = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft + 20) + 'px';   // clear of the pointer (a hand cursor is ~24px)

                      tt.style.top = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop + 28) + 'px';
                      // keep the card inside the board: cap its width+height to the visible board, then flip left/above and clamp when a BOARD edge is near (measured against the board, not the window). The portrait's height is reserved (height:90px) so this measure never goes stale when the image finishes loading.
                      var _card = tt.firstElementChild; if (_card) { _card.style.maxWidth = Math.min(320, wrapBox.width - 16) + 'px'; _card.style.maxHeight = (wrapBox.height - 16) + 'px'; } var ttR = tt.getBoundingClientRect();
                      var _sL = document.getElementById('whiteboardWrap').scrollLeft, _pX = e.clientX - wrapBox.left + _sL; var _cw = ttR.width; var _L = (_pX + 20 + _cw > _sL + wrapBox.width - 8) ? (_pX - _cw - 14) : (_pX + 20); tt.style.left = Math.max(_sL + 8, Math.min(_L, _sL + wrapBox.width - _cw - 8)) + 'px';   // flip near the right edge, then clamp into the VISIBLE content range (account for wrap scroll)
                      var _sT = document.getElementById('whiteboardWrap').scrollTop, _pY = e.clientY - wrapBox.top + _sT; var _ch = ttR.height; var _T = (_pY + 28 + _ch > _sT + wrapBox.height - 8) ? (_pY - _ch - 14) : (_pY + 28); tt.style.top = Math.max(_sT + 8, Math.min(_T, _sT + wrapBox.height - _ch - 8)) + 'px';   // clamp top into the visible board range (flips above the pointer when the bottom edge is near)

                  }

              });

              

              el.addEventListener('pointerleave', function(e) {

                  document.getElementById('wbTooltip').style.display = 'none';

              });

          }

          

          el.style.left = item.x + 'px';

          el.style.top = item.y + 'px';

          el.style.width = item.w + 'px';

          el.style.height = item.h + 'px';

          var z = item.z || 10;

          var layerZ = { 'back': 10, 'back-mid': 15, 'middle': 20, 'front-mid': 25, 'front': 30 };

          if (item.layer && layerZ[item.layer]) z = layerZ[item.layer];
          // Drawings ride above tokens (a GM's arrows and a player's marks must stay readable),
          // and their box passes clicks through — only the stroke itself is clickable (CSS).
          if (item.type === 'path' && !item.layer) z = Math.max(z, 35);

          // Per-item exception: render above the grid overlay (z 15000)
          if (item.aboveGrid) z += 15020;

          el.style.zIndex = z;

          var isHexTrigger = item.type === 'trigger' && item.shape === 'hexagon';

          el.classList.toggle('hex-trigger', isHexTrigger);
          // Triggers come in any shape; clipped shapes get a tint instead of the dashed border
          el.classList.toggle('trigger-circle', item.type === 'trigger' && item.shape === 'circle');
          el.classList.toggle('trigger-diamond', item.type === 'trigger' && item.shape === 'diamond');

          if (isHexTrigger || (item.type === 'trigger' && item.shape === 'diamond')) {

              // A PORTAL (links to another map) shows its destination color, bright, with a bold ring so it
              // reads clearly on a painted battle-map; a plain trigger zone keeps the faint gold tint.
              var _pRoom = item.nodeId ? activeMap.rooms.find(function (x) { return x.id === item.nodeId; }) : null;
              var _isPortal = !!item.targetMapId || !!(_pRoom && _pRoom.targetMapId);

              if (_isPortal) {

                  var _pc = cssColor(item.portalColor) || '#5ac8fa';
                  el.style.background = withAlpha(_pc, 0.55);
                  el.style.boxShadow = 'inset 0 0 0 4px ' + _pc;

              } else {

                  el.style.background = 'rgba(224,165,79,0.3)';
                  el.style.boxShadow = '';

              }

          } else {

              el.style.boxShadow = '';
              el.style[el.dataset.tex ? 'backgroundColor' : 'background'] = (item.type === 'path' || item.type === 'image' || item.type === 'text' || item.type === 'trigger') ? 'transparent' : cssColor(item.color);   // a piece that wears a tile takes its colour alone: the shorthand would wipe the tile and have it written again at every draw

          }

          // [sinkcheck:texstyle-start]
          // The map builder (fold B1): a piece's texture is a name of the app's own list (buildcore.js), drawn over its colour as a repeating tile
          // seated on the board's lattice, so pieces side by side read as one surface. On a box shape that is no token. A filled region's is drawn
          // in its own svg below. Anything else (no name, a name the list lacks, another kind of piece) leaves the piece exactly as it was drawn above
          var picT = typeof wbPicFill === 'function' ? wbPicFill(item) : null, BCt = window.wpBuildCore;   // fold B3: one of the campaign's own pictures comes before any pattern
          // The picture an element already wears is known by a short key kept on it, never by reading its style back: on a player's app an SVG
          // picture's address is the whole picture inline, and a map may hold thousands of cells that wear it. Then only its place can have changed
          var picKey = picT && picT.box ? picT.src + '|' + picT.tile + '|' + wbPicUrlKey(picT.url) : '', picKept = !!picKey && el.dataset.picKey === picKey && !!el.dataset.pic;
          var picBox = picKey && !picKept ? BCt.picStyle(picT.url, picT.tile, item.x, item.y) : null;
          var texN = picBox || picKept ? null : (BCt && BCt.cleanTexture ? BCt.cleanTexture(item.texture) : null);   // an address that is none leaves the pattern the piece also names
          var texBox = picBox || (texN && (item.type === 'rect' || item.type === 'circle' || item.type === 'hexagon' || item.type === 'diamond') && !item.isChar && !item.waiting ? BCt.texStyle(texN, item.x, item.y) : null);
          if (picKept) { var posK = BCt.picPos(item.x, item.y, el.dataset.pic); if (el.style.backgroundPosition !== posK) el.style.backgroundPosition = posK; }
          else if (texBox) {   // each written only where it differs: the tile's address is long, and a map may hold thousands of textured cells
              if (picBox || el.style.backgroundImage !== texBox.image) el.style.backgroundImage = texBox.image;   // a new picture is written, never compared with the old one
              if (el.style.backgroundSize !== texBox.size) el.style.backgroundSize = texBox.size;
              if (el.style.backgroundPosition !== texBox.position) el.style.backgroundPosition = texBox.position;
              if ((el.style.backgroundRepeat || '') !== (texBox.repeat || '')) el.style.backgroundRepeat = texBox.repeat || '';   // a picture stretched over the whole piece does not repeat
              el.dataset.tex = picBox ? 'pic' : texN;
              if (picBox) { el.dataset.pic = picBox.mark; el.dataset.picKey = picKey; } else { if (el.dataset.pic) delete el.dataset.pic; if (el.dataset.picKey) delete el.dataset.picKey; }
          }
          else if (el.dataset.tex) { el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = ''; if (el.style.backgroundRepeat) el.style.backgroundRepeat = ''; delete el.dataset.tex; delete el.dataset.pic; delete el.dataset.picKey; }
          el.classList.toggle('wb-tex', picKept || !!texBox || !!(texN && item.type === 'path' && item.tip === 'fill') || !!(picT && !picT.box));
          // [sinkcheck:texstyle-end]

          // Text boxes: the color swatch is the text color, not a fill; the box
          // has its own background, font, size, and alignment.
          if (item.type === 'text') {
              // Text and background each carry their own opacity (textOpacity / bgOpacity), on top of the whole-item opacity
              var inkT = (item.color && item.color !== 'transparent' && item.color !== 'var(--panel2)') ? item.color : (plateInk(item.bg) || 'var(--ink)');
              el.style.color = withAlpha(inkT, item.textOpacity == null ? 1 : item.textOpacity);
              el.style.background = (item.bg && item.bg !== 'transparent') ? withAlpha(item.bg, item.bgOpacity == null ? 1 : item.bgOpacity) : 'transparent';
              el.style.fontFamily = (window.wpTextFmt && window.wpTextFmt.fontCss) ? window.wpTextFmt.fontCss(item.font) : '';   // 1.5.4: one of Waypoint's own fonts by its name, or the plain family name a box from before holds (textfmt.js cleanFont); anything else is the app's own font
              el.style.fontSize = item.fontSize ? item.fontSize + 'px' : '';
              var al = item.align || 'center';
              el.style.textAlign = al;
              var va = item.valign || 'middle';
              el.style.justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
              el.style.alignItems = 'stretch';
              el.style.borderRadius = (item.bg && item.bg !== 'transparent') ? '4px' : '';
          }

          el.style.transform = item.rot ? 'rotate('+item.rot+'deg)' : 'none';

          el.style.border = (item.type === 'trigger' && !isHexTrigger && item.shape !== 'diamond') ? '3px dashed var(--gold)' : '';

          // Portal marker: the item is a portal itself (targetMapId) or is linked
          // to a room that links to another map

          var portalIcon = '';
          var ICON_GLYPH = {'Stairs Up':'\u{1FA9C}','Stairs Down':'\u{1FA9C}','Door':'\u{1F6AA}','Gate':'⛩️','Cave':'\u{1F987}','Tower':'\u{1F5FC}','Camp':'⛺'};

          if (item.targetMapId) {

              portalIcon = ICON_GLYPH[item.portalIcon] || '\u{1F6AA}';

          } else if (item.nodeId) {

              var pRoom = activeMap.rooms.find(x => x.id === item.nodeId);

              if (pRoom && pRoom.targetMapId) {

                  portalIcon = ICON_GLYPH[pRoom.icon] || '\u{1F6AA}';

              }

          }

          if (portalIcon) { el.dataset.portal = 'true'; el.dataset.portalIcon = portalIcon; }

          else { delete el.dataset.portal; delete el.dataset.portalIcon; }

          el.classList.toggle('gm-note', !!item.gmNoteFor);

          // GM-hidden items: the GM sees them ghosted with an eye badge; a player's app draws a grey cloud box only for the stub an older host (before 1.5.0) still sends — a current host sends nothing of a hidden item

          var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';

          var hideFromMe = !!item.hidden && clientView;

          el.classList.toggle('wb-hidden-gm', !!item.hidden && !clientView);

          el.classList.toggle('wb-trap', !!item.trap && !!el.dataset.portal && !!item.hidden && !clientView);   // GM-only: an armed hidden trap portal
          // [sinkcheck:portalcue-start]
          el.classList.toggle('wb-portal-locked', item.portalLock === true && !!el.dataset.portal && !hideFromMe);   // a portal's own lock: a small lock beside its marker, for the GM and for players alike (style.css)
          // [sinkcheck:portalcue-end]
          // [fogcheck:boardcue-start]
          el.classList.toggle('wb-blocks-sight', !!item.blocksSight && item.sightType !== 'door' && !clientView);
          var barrierIt = item.barrier === true && !item.blocksSight, doorIt = (item.blocksSight === true || barrierIt) && item.sightType === 'door';   // see-through barriers (1.5.1): a piece that stops movement and not sight; a door is a wall's or a barrier's
          el.classList.toggle('wb-barrier', barrierIt && (doorIt || !clientView));   // the GM's cue, as a wall's; a barrier's door is shown to everyone, as any door
          el.classList.toggle('wb-door', doorIt);
          el.classList.toggle('wb-door-open', doorIt && !!item.doorOpen);
          // [fogcheck:boardcue-end]
          // [sinkcheck:doorcue-start]
          el.classList.toggle('wb-door-locked', doorIt === true && item.doorLock === true && !hideFromMe);   // a door the GM locked against players: a small lock beside its door mark, for the GM and for players alike (style.css)
          // [sinkcheck:doorcue-end]
          // [sinkcheck:secretcue-start]
          el.classList.toggle('wb-secret', doorIt === true && !item.hidden && !clientView && !window.wpStream && !!(window.wpFogCore && typeof window.wpFogCore.secretOn === 'function' && window.wpFogCore.secretOn(item)));   // the map builder, a secret door: a dashed edge and the word secret, on the GM's screen alone (the players hold a wall there, with no key that says otherwise)
          // [sinkcheck:secretcue-end]

          el.classList.toggle('wb-hidden-ph', hideFromMe);
          el.classList.toggle('wb-waiting', !!item.waiting && !hideFromMe);   // Onboarding F1a: the dashed ring — never on a hidden stub (an element is reused when an item is hidden)
          if (el.dataset.waitTip && (!item.waiting || hideFromMe)) { delete el.dataset.tip; delete el.dataset.waitTip; }   // nor its tooltip
          var picShape = item.type === 'image' && item.isChar && (item.shape === 'hexagon' || item.shape === 'rect' || item.shape === 'circle') ? item.shape : '';   // grid-shaped tokens: a picture token's outline (its art cut to the cell)
          el.classList.toggle('tok-pic-hexagon', picShape === 'hexagon'); el.classList.toggle('tok-pic-rect', picShape === 'rect'); el.classList.toggle('tok-pic-circle', picShape === 'circle');

          if (hideFromMe && !el.dataset.ph) { el.innerHTML = '<span class="ph-cloud">&#9729;&#65039;</span>'; el.dataset.ph = '1'; }

          if (!hideFromMe && el.dataset.ph) { el.innerHTML = ''; delete el.dataset.ph; }

          // Presence: another player's token only shows where that player actually is.

          var absentOwner = false;

          var presOwner = item.ownerId || keptOwnerOf(item);   // Onboarding F0: a kept character's token shows only where its player is, like their own

          if ((item.isChar || item.waiting) && presOwner && window.wpNet && window.wpNet.active) {   // Onboarding F1a: a waiting token only while its player is here

              absentOwner = item.waiting ? !(presOwner === window.wpNet.myId || Object.values(window.wpNet.roster || {}).some(function(p) { return p && p.id === presOwner; })) : !window.wpNet.isPresent(presOwner, activeMap.id);

          }

          if (clientView) { el.style.display = absentOwner ? 'none' : ''; }

          else { el.style.display = ''; el.classList.toggle('wb-absent', absentOwner); }
          el.classList.toggle('wb-turn', onTurnHere(window.wpNet, activeMap.id, item.id));   // fold 2: on turn in any fight on this map
          if (state.selWbIds && state.selWbIds.includes(item.id) && state.selWbIds.length > 1) { el.style.boxShadow = '0 0 0 2px var(--gold)'; } else { el.style.boxShadow = _isPortal ? ('inset 0 0 0 4px ' + _pc) : 'none'; }   // keep the portal ring when not multi-selected

          

          // Final opacity = the item's own opacity setting combined with the
          // trigger/locked dimming (absence dimming is CSS, .wb-absent !important)
          var itemOp = (item.opacity != null && item.opacity < 1) ? item.opacity : 1;
          var _lnCore = (item.type === 'path' && item.tip !== 'fill' && typeof window !== 'undefined') ? window.wpFogCore : null;   // a pen line's opacity, width and nib are read in ONE place (fogcore), so this board, a player's board, the wire and the map's picture agree for every stored value
          if (_lnCore && typeof _lnCore.lineOpacity === 'function') itemOp = _lnCore.lineOpacity(item);

          if (item.type === 'trigger') {

              el.style.opacity = ((state.selWbIds && state.selWbIds.includes(item.id)) ? 1 : 0.5) * itemOp;

          } else {

              el.style.opacity = (item.locked && !(state.selWbIds && state.selWbIds.includes(item.id)) ? 0.85 : 1) * itemOp;

          }

          

          if(hideFromMe) {

              // placeholder content already set; skip normal content rendering

          } else if(item.type === 'image') {

              if(!el.querySelector('img')) {

                  var img = document.createElement('img');
                  img.decoding = 'async';          // decode off the main thread: a map of many pictures opens sooner
                  img.loading = 'lazy';            // pictures far outside the view load when scrolled to

                  // The frame must be the picture: once the image's real proportions are
                  // known, the box adopts them (width kept) so the resize handle and the
                  // selection outline hug the visible art instead of letterbox space.
                  img.addEventListener('load', function() { fitImageBox(el.dataset.id, img); });

                  el.appendChild(img);

              }

              var wantSrc = resolveImg(item.src);

              var imEl = el.querySelector('img');

              if (imEl.getAttribute('src') !== wantSrc) imEl.src = wantSrc;
              // A player's copy while the picture's bytes are still on their way (or never came): the character's
              // initials stand in, so a token is never an invisible box with a facing wedge and chips floating around it.
              var pendingPic = !!(item.isChar && window.wpNet && window.wpNet.ASSET_PLACEHOLDER && wantSrc === window.wpNet.ASSET_PLACEHOLDER);
              var iniEl = el.querySelector(':scope > .token-initials');
              if (pendingPic) {
                  var iniP = String(item.charName || item.name || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
                  if (!iniEl) { iniEl = document.createElement('span'); iniEl.className = 'token-initials tok-pending'; el.appendChild(iniEl); }
                  if (iniEl.textContent !== iniP) iniEl.textContent = iniP;
              } else if (iniEl && iniEl.classList.contains('tok-pending')) iniEl.remove();

          } else if(item.type === 'text') {

              if(el.contentEditable !== "true") {

                  el.innerHTML = (clientView && window.wpNet && window.wpNet.sanitizeRichText) ? (window.wpNet.sanitizeRichText(item.text) || 'Text...') : (item.text || 'Text...');   // at a table someone else hosts the text is rebuilt (markup kept, nothing that runs): the wire did it once, the render does it again

                  fixEmbeddedImgs(el);

              }

          } else if (item.waiting) {
              // [sinkcheck:waitingface-start]
              // Onboarding F1a: a waiting token — the player's own face read live from the table's roster (a picture that passes safeAvatar,
              // else the silhouette on their colour); it is not a character, so no initials, sheet or hover card
              var wRos = window.wpNet ? Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === item.ownerId; }) : null;
              var wView = window.wpNet && window.wpNet.faceView ? window.wpNet.faceView(wRos || { face: item.face }, cssColor((wRos && wRos.color) || item.color)) : { img: '' };   // Onboarding F1b: their chosen face (net.js faceView: a bundled picture, an emoji, their picture checked whole, or the silhouette)
              if (wView.emoji) {
                  var wEm = el.querySelector(':scope > .wait-emoji');
                  if (!wEm) { el.textContent = ''; wEm = document.createElement('span'); wEm.className = 'wait-emoji'; el.appendChild(wEm); }
                  if (wEm.textContent !== wView.emoji) wEm.textContent = wView.emoji;
              } else {
                  var wImg = el.querySelector(':scope > img.wait-face');
                  if (!wImg) { el.textContent = ''; wImg = document.createElement('img'); wImg.className = 'wait-face'; wImg.alt = ''; wImg.draggable = false; el.appendChild(wImg); }
                  if (wImg.getAttribute('src') !== (wView.img || '')) wImg.src = wView.img || '';
              }
              var wTip = String(item.name || 'Player') + ' \u2014 waiting for a character';
              if (el.dataset.tip !== wTip) el.dataset.tip = wTip;
              el.dataset.waitTip = '1';
              // [sinkcheck:waitingface-end]
          } else if (item.isChar && (item.type === 'circle' || item.type === 'rect' || item.type === 'diamond' || item.type === 'hexagon')) {

              // [sinkcheck:charface-tok-start]
              var cfv = item.face && window.wpNet && window.wpNet.faceView && window.wpNet.cleanFace && window.wpNet.cleanFace(item.face) ? window.wpNet.faceView({ face: item.face }, cssColor(item.color || '#4db3d3')) : null;   // a face the rule refuses: the initials stay   // Onboarding F1c: the character's own face (net.js faceView), in place of initials
              if (cfv && cfv.emoji) { var feS = el.querySelector(':scope > span.token-face'); if (!feS) { el.textContent = ''; feS = document.createElement('span'); feS.className = 'token-initials token-face'; el.appendChild(feS); } if (feS.textContent !== cfv.emoji) feS.textContent = cfv.emoji; el.dataset.ini = 'face'; }   // drawn again whenever it is missing (a rebuilt token) or changed
              else if (cfv && cfv.img) { var fiI = el.querySelector(':scope > img.token-face-img'); if (!fiI) { el.textContent = ''; fiI = document.createElement('img'); fiI.className = 'token-face-img'; fiI.alt = ''; fiI.draggable = false; el.appendChild(fiI); } if (fiI.getAttribute('src') !== cfv.img) fiI.src = cfv.img; el.dataset.ini = 'face'; }   // compared whole: a new colour is a new picture
              // [sinkcheck:charface-tok-end]
              else {
              // Stand-in token: initials until a portrait arrives
              var ini = String(item.charName || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
              if (el.dataset.ini !== ini || !el.querySelector(':scope > .token-initials')) { el.textContent = ''; var iniS = document.createElement('span'); iniS.className = 'token-initials'; iniS.textContent = ini; el.appendChild(iniS); el.dataset.ini = ini; }
              }

          } else if (item.type === 'light') {
              // Lighting (L2): a light source the GM placed — a small marker for the GM (players see its light, never the marker: CSS); dimmed while off
              var lgL = window.wpFogCore && window.wpFogCore.cleanLight ? window.wpFogCore.cleanLight(item.light) : null;
              el.classList.add('wb-light'); el.classList.toggle('off', !lgL || !!lgL.off);
              if (!(state.selWbIds && state.selWbIds.length > 1 && state.selWbIds.includes(item.id))) el.style.boxShadow = '';   // the marker's glow ring is the stylesheet's (an inline none would hide it)
              var lgG = el.querySelector(':scope > .wb-light-glyph');
              if (!lgG) { el.textContent = ''; lgG = document.createElement('span'); lgG.className = 'wb-light-glyph'; lgG.textContent = '\ud83d\udca1'; el.appendChild(lgG); }
              var lgU = lgL && lgL.unit ? lgL.unit : 'yd', lgT = 'Light source' + (lgL && lgL.name ? ' (' + lgL.name + ')' : '') + (lgL ? ': bright ' + lgL.bright + ' ' + lgU + ', dim to ' + lgL.dim + ' ' + lgU + (lgL.off ? ' (off)' : '') : ' (no light set)');
              if (el.dataset.tip !== lgT) el.dataset.tip = lgT;
          } else if(item.type === 'path') {

              if(!el.querySelector('svg')) {

                  el.innerHTML = '<svg width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;"><path /></svg>';

              }

              var svg = el.querySelector('svg');

              var bw = item.baseW || item.w;

              var bh = item.baseH || item.h;

              svg.setAttribute('viewBox', '0 0 ' + bw + ' ' + bh);

              

              var pathEl = svg.querySelector(':scope > path'), _tip = item.tip || 'round', _col = cssColor(item.color) || 'var(--ink)';
              var _lw = item.strokeWidth || 3, _lnDraw = (_tip !== 'fill' && typeof window !== 'undefined') ? window.wpFogCore : null;
              if (_lnDraw && typeof _lnDraw.lineWidth === 'function' && typeof _lnDraw.lineTip === 'function') { _tip = _lnDraw.lineTip(item); _lw = _lnDraw.lineWidth(item); }   // the same one reading for the width and the nib
              var _sp = buildStrokePath(item.pts, _tip, _lw, item.holes);
              pathEl.setAttribute('d', _sp.d);
              if (_sp.fill) {
                  pathEl.setAttribute('fill', _col); pathEl.style.stroke = 'none'; pathEl.removeAttribute('stroke-width');
                  if (_sp.fillRule) pathEl.setAttribute('fill-rule', _sp.fillRule); else pathEl.removeAttribute('fill-rule');
              } else {
                  pathEl.setAttribute('fill', 'none'); pathEl.style.stroke = _col; pathEl.setAttribute('stroke-width', _sp.width);
                  pathEl.setAttribute('stroke-linecap', _sp.linecap); pathEl.setAttribute('stroke-linejoin', _sp.linejoin);
                  pathEl.removeAttribute('fill-rule');
              }
              // [fogcheck:doorline-start]
              if (doorIt && !_sp.fill) pathEl.setAttribute('pathLength', '100'); else pathEl.removeAttribute('pathLength');   // a door line's length counts as 100: the stylesheet draws its two ends alone while it is open
              // [fogcheck:doorline-end]
              // [sinkcheck:texpath-start]
              // The map builder (fold B1): a filled region's texture is an svg pattern in the path's own defs, built by createElementNS only (buildcore
              // texPattern), seated on the board's lattice and scaled back by the box over its base size (the svg's viewBox is stretched to the box). It
              // is built again only when its place, size, name or colour changes. An untextured path keeps no defs and its plain fill
              var picDone = _sp.fill && typeof wbPicPath === 'function' ? wbPicPath(svg, pathEl, item, bw, bh, _col) : false;   // fold B3: a picture fills the region, with a pattern of its own in the same defs
              var BCp = window.wpBuildCore, texP = !picDone && _sp.fill && BCp && BCp.cleanTexture ? BCp.cleanTexture(item.texture) : null, defsP = svg.querySelector(':scope > defs');
              if (texP) {
                  var texKey = texP + '|' + item.x + '|' + item.y + '|' + (item.w || 0) + '|' + (item.h || 0) + '|' + bw + '|' + bh + '|' + _col;
                  if (!defsP || svg.dataset.texKey !== texKey) {
                      if (defsP) defsP.remove();
                      var patP = BCp.texPattern(document, texP, item.x, item.y, _col, ++_texSerial);
                      if (patP) {
                          patP.setAttribute('patternTransform', 'scale(' + (bw / (item.w || bw)) + ' ' + (bh / (item.h || bh)) + ')');
                          defsP = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); defsP.appendChild(patP); svg.insertBefore(defsP, svg.firstChild);
                          svg.dataset.texKey = texKey; svg.dataset.texId = patP.getAttribute('id');
                      } else { delete svg.dataset.texKey; delete svg.dataset.texId; }
                  }
                  if (svg.dataset.texId) { pathEl.setAttribute('fill', 'url(#' + svg.dataset.texId + ')'); if (pathEl.style.fill) pathEl.style.fill = ''; }   // a colour set live on the path would hide the pattern
              } else if (defsP && !picDone) { defsP.remove(); delete svg.dataset.texKey; delete svg.dataset.texId; }
              // [sinkcheck:texpath-end]

          }

          

          

          // [sinkcheck:hexplate-start]
          // Grid-shaped tokens (owner, 2026-09-27): a hexagon token (a character's or a waiting one) is a plate drawn INSIDE its box, never
          // clipped, so the turn ring, selection, target glow and hidden marker still show around it; a waiting one wears a dashed gold ring
          var hexTok = item.type === 'hexagon' && (!!item.isChar || !!item.waiting) && !hideFromMe;
          el.classList.toggle('wb-hextok', hexTok);
          var plateEl = el.querySelector(':scope > svg.tok-plate'), ringEl = el.querySelector(':scope > svg.tok-ring');
          var hexSvg = function(cls) { var sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('class', cls); sv.setAttribute('viewBox', '0 0 60 52'); sv.setAttribute('preserveAspectRatio', 'none'); var pg = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); pg.setAttribute('points', '15,1 45,1 59,26 45,51 15,51 1,26'); sv.appendChild(pg); return sv; };
          if (hexTok) {
              if (!plateEl) { plateEl = hexSvg('tok-plate'); el.insertBefore(plateEl, el.firstChild); }
              var plateFill = cssColor(item.color); if (plateEl.firstChild.style.fill !== plateFill) plateEl.firstChild.style.fill = plateFill;   // a colour the rule refuses: the plate's own
              if (item.waiting) { if (!ringEl) { ringEl = hexSvg('tok-ring'); el.appendChild(ringEl); } }
              else if (ringEl) ringEl.remove();
          } else { if (plateEl) plateEl.remove(); if (ringEl) ringEl.remove(); }
          // [sinkcheck:hexplate-end]
          // Tokens carry a small front-side arrow (which side of the art is "forward")
          var fw = el.querySelector(':scope > .token-front');
          if (item.isChar && stanceOn('turning')) {   // token facing is a per-campaign VTT feature (Settings ▸ VTT features); when off there is no facing wedge
              if (!fw) { fw = document.createElement('div'); fw.className = 'token-front'; fw.innerHTML = '<i></i>'; el.appendChild(fw); }
              // Grids are square or flat-top hex, so the chosen side is always a face:
              // the arrow points straight across it at the neighbouring cell.
              fw.style.transform = item.front ? 'rotate(' + item.front + 'deg)' : '';
              // The arrow itself turns the token (click / drag) when you may move it: the GM's selected token, or a player's own token
              // while it is selected (arrowTurnable)
              fw.classList.toggle('turnable', arrowTurnable(item, window.wpNet, state));
          } else if (fw) fw.remove();
          // Target marks: everyone targeting this token, shown as small copies of their own
          // tokens, centred in a row that wraps into rows and never leaves the token's edges.
          var tgs = (item.isChar && window.wpNet && window.wpNet.active && window.wpNet.targetersOf) ? window.wpNet.targetersOf(item.id, activeMap.id) : [];
          var marksEl = el.querySelector(':scope > .target-marks');
          if (tgs.length) {
              if (!marksEl) { marksEl = document.createElement('div'); marksEl.className = 'target-marks'; el.appendChild(marksEl); }
              var tcov = tgs.map(function(t) { var mt = targeterTok(t.id, activeMap); if (!mt || !window.wpFog || !window.wpFog.coverBetween) return null; return window.wpFog.coverBetween(mt.x + (mt.w || 60) / 2, mt.y + (mt.h || 52) / 2, item.x + (item.w || 60) / 2, item.y + (item.h || 52) / 2, stanceOn('elevation') ? tokenElevation(mt, activeMap) : 0, stanceOn('elevation') ? tokenElevation(item, activeMap) : 0); });   // item 19 H1: their heights, for the system's height rule   // cover follow-ups (owner 2026-09-28): the cover between each targeter's token here and this one, worked out from this viewer's own board
              var tsig = tgs.map(function(t, ti) { return t.id + ':' + (tcov[ti] ? tcov[ti].name : ''); }).join(',');
              var trng = tgs.map(function(t) { var mr = targeterTok(t.id, activeMap); return mr && mr !== item ? rangeSeen(activeMap, tokenCentre(mr), tokenCentre(item), mr, item) : null; });   // range R1: the modifier from each targeter's token here to this one (the same token cover measures from)
              tsig += '|' + trng.map(function(r) { return r ? r.mod + ':' + Math.round(r.dist * 10) + r.unit : ''; }).join(',');
              var thgt = tgs.map(function(t) { var mh = targeterTok(t.id, activeMap); return mh && mh !== item ? heightSeen(mh, item, activeMap) : null; });   // item 19 H2: the height modifier from each targeter's token to this one
              tsig += '|' + thgt.map(function(h) { return h ? h.mod + ':' + h.diff : ''; }).join(',') + '|' + (state.measureUnit || '');
              var tlit = tgs.map(function(t) { var ml = targeterTok(t.id, activeMap); return ml ? lightSeenBy(ml, item, activeMap) : null; });   // lighting L4: the light this token stands in as each targeter's token sees it — on the GM's screen, and on a player's for their own mark alone
              tsig += '|' + tlit.map(function(l) { return l ? l.lv + ':' + l.name : ''; }).join(',');
              if (marksEl.dataset.sig !== tsig) {
                  marksEl.dataset.sig = tsig;
                  var n = tgs.length, side = Math.min(item.w || 60, item.h || 52);
                  // one row of up to 3, two rows to 8, three rows to 15, then as small as it takes
                  var size = n <= 3 ? Math.round(side * 0.34) : n <= 8 ? Math.round(side * 0.26) : n <= 15 ? Math.round(side * 0.2) : Math.round(side * 0.15);
                  marksEl.style.setProperty('--mark', size + 'px');
                  marksEl.title = 'Targeted by ' + tgs.map(function(t) { return t.name; }).join(', ');
                  marksEl.innerHTML = tgs.map(function(t, ti) {
                      var mine = targeterToken(t.id), cv = tcov[ti], tip = esc(t.name + (cv ? ' \u2014 ' + cv.name : ''));
                      var cvHtml = cv ? '<span class="target-cover" title="' + esc(cv.name) + '">' + (TARGET_COVER_GLYPH[cv.name] || '\u25d0') + '</span>' : '';
                      var pair = function(mk) { return cv ? '<span class="target-pair">' + mk + cvHtml + '</span>' : mk; };   // a mark and its cover tag wrap as one
                      var ini = String(t.name).trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase();
                      if (mine && mine.src) return pair('<img class="target-mark" src="' + esc(resolveImg(mine.src)) + '" alt="" title="' + tip + '" style="border-color:hsl(' + t.hue + ',75%,55%);">');
                      return pair('<span class="target-mark target-mark-ini" title="' + tip + '" style="background:hsl(' + t.hue + ',75%,55%);">' + esc(ini) + '</span>');
                  }).map(function(mkH, ti) { return targetRangeHtml(mkH, trng[ti]); }).map(function(mkH, ti) { return targetLightHtml(mkH, tlit[ti]); }).map(function(mkH, ti) { return targetHeightHtml(mkH, thgt[ti]); }).join('');
              }
              el.classList.toggle('targeted-by-me', tgs.some(function(t) { return t.id === window.wpNet.myId; }));
          } else if (marksEl) { marksEl.remove(); el.classList.remove('targeted-by-me'); }
          var capT = tgs.length ? targetLightCaption(tlit) : '';   // lighting L4: the light's name, under the targeted token. The token is marked with it and the fog's overlay draws it (fog.js drawCaptions): over the fog, where a player can read it whatever the cells beneath, and level however the token is turned
          if (capT) { if (el.dataset.lightCap !== capT) el.dataset.lightCap = capT; }
          else if (el.dataset.lightCap !== undefined) delete el.dataset.lightCap;
          // Condition overlay: 'down' = red X over the token, 'dead' = skull + darkened art
          var stv = item.isChar && (item.status === 'down' || item.status === 'dead') ? item.status : '';
          var stEl = el.querySelector(':scope > .token-status');
          if (stv) {
              if (!stEl) { stEl = document.createElement('div'); stEl.className = 'token-status'; el.appendChild(stEl); }
              if (stEl.dataset.s !== stv) { stEl.dataset.s = stv; stEl.innerHTML = stv === 'dead' ? TOKEN_SKULL : TOKEN_X; }
          } else if (stEl) stEl.remove();
          el.classList.toggle('tok-dead', stv === 'dead');
          el.classList.toggle('tok-down', stv === 'down');
          // Stance chips (Settings ▸ VTT features, per campaign): a small row at the bottom of the token,
          // inside its own cell so one-token-per-hex still reads at grid scale.
          stanceChipsSync(el, item, activeMap);   // item 19b H5: its chips, as a move that lands with no redraw asks for them again (wpStanceChips)
          var fxHtml = item.isChar && window.wpSheets && window.wpSheets.tokenFx ? tokenFxHtml(window.wpSheets.tokenFx(item)) : '', fxEl = el.querySelector(':scope > .token-fx');   // conditions C1: its effects
          if (fxHtml) {
              if (!fxEl) { fxEl = document.createElement('div'); fxEl.className = 'token-fx'; el.appendChild(fxEl); }
              if (fxEl.dataset.sig !== fxHtml) { fxEl.dataset.sig = fxHtml; fxEl.innerHTML = fxHtml; }
          } else if (fxEl) fxEl.remove();
          pagePinSync(el, item, hideFromMe);   // 1.5.4 (pageshelf.js): a pin's mark, on the GM's screen alone
          var envT = item.isChar && window.wpSheets && window.wpSheets.tokenEnv ? window.wpSheets.tokenEnv(item) : null, envEl = el.querySelector(':scope > .token-env');   // 1.6.0: the map environment's badge (the owner: "As drawn")
          if (envT) {
              if (!envEl) { envEl = document.createElement('div'); envEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z"/></svg>'; el.appendChild(envEl); }
              envEl.className = 'token-env ' + (envT.band === 'danger' ? 'danger' : 'warn'); envEl.title = envT.text; envEl.setAttribute('aria-label', envT.text);
          } else if (envEl) envEl.remove();
          if (item.id === state.selWbId && (!state.selWbIds || state.selWbIds.length === 1) && !item.locked) {

              el.classList.add('sel');

              if (item.locked) el.classList.add('locked');

              else el.classList.remove('locked');

              selItem = item;

          } else {

              el.classList.remove('sel');

              el.classList.remove('locked');

          }

      });

      

      var rHandle = document.getElementById('globalResizeHandle');

      var rotHandle = document.getElementById('globalRotateHandle');

      positionHandles(activeMap);
      if (window.wpRefreshBlasts) window.wpRefreshBlasts();   // tokens moved: re-check who is in a blast

      

      Object.keys(state.wbEls).forEach(function(id){

          if(!seen[id]) {

              state.wbEls[id].remove(); delete state.wbEls[id];

          }

      });

      updateSelToolbar(activeMap);

  }

  // [fogcheck:doornear-start]
  // 1.5.6, a door lights up as a token comes near (backlog 188; the owner, 2026-10-24: "id like doors to change on hover and indicate when youre
  // actually over them", then "or even detect a token's proximity and auto highlight"): a door within DOOR_NEAR board pixels of a token of yours
  // wears wb-door-near, the look a door under the pointer has. Yours: on a player's app their own character tokens, on the GM's screen the tokens
  // selected; nothing in the stream window. A door is fogcore isDoor; a door drawn as a line is measured to its own strokes, any other to its box
  var DOOR_NEAR = 40;   // a token in the cell beside the door, on squares and on hexagons (a hex cell's edge door stands 34 px off a token seated beside it); a door two cells away is 50 px or more
  function doorGap(box, door, F) {
      var x1 = box.x, y1 = box.y, x2 = box.x + (box.w || 0), y2 = box.y + (box.h || 0);
      var ptGap = function(px, py) { var dx = Math.max(x1 - px, 0, px - x2), dy = Math.max(y1 - py, 0, py - y2); return Math.sqrt(dx * dx + dy * dy); };
      if (door.type === 'path') {
          var segs = F && typeof F.pathSegs === 'function' ? F.pathSegs(door) : [], best = Infinity;
          for (var k = 0; k < segs.length && k < 400 && best > 0; k++) {
              var s = segs[k], len = Math.sqrt((s[2] - s[0]) * (s[2] - s[0]) + (s[3] - s[1]) * (s[3] - s[1])), n = Math.min(500, Math.max(1, Math.ceil(len / 2)));
              for (var i = 0; i <= n && best > 0; i++) { var t = i / n; best = Math.min(best, ptGap(s[0] + (s[2] - s[0]) * t, s[1] + (s[3] - s[1]) * t)); }
          }
          return best;
      }
      var dw = typeof door.w === 'number' && door.w > 0 ? door.w : 0, dh = typeof door.h === 'number' && door.h > 0 ? door.h : 0;
      var gx = Math.max(door.x - x2, 0, x1 - (door.x + dw)), gy = Math.max(door.y - y2, 0, y1 - (door.y + dh));
      return Math.sqrt(gx * gx + gy * gy);
  }
  function doorNearIds(items, mine, F) {   // the ids of the doors within reach of any of the boxes in mine
      var out = []; if (!Array.isArray(items) || !Array.isArray(mine) || !mine.length || !F || typeof F.isDoor !== 'function') return out;
      items.forEach(function(w) {
          if (!w || typeof w.id !== 'string' || typeof w.x !== 'number' || typeof w.y !== 'number' || !isFinite(w.x) || !isFinite(w.y) || !F.isDoor(w)) return;
          if (mine.some(function(b) { return doorGap(b, w, F) <= DOOR_NEAR; })) out.push(w.id);
      });
      return out;
  }
  function doorNearMine(am, sel, n) {   // the boxes of the tokens of yours on this map
      if (window.wpStream || !am || !Array.isArray(am.whiteboard)) return [];
      var player = !!(n && n.active && n.role === 'client'), ids = Array.isArray(sel) ? sel : [];
      return am.whiteboard.filter(function(w) {
          if (!w || !w.isChar || w.waiting || typeof w.x !== 'number' || typeof w.y !== 'number') return false;
          return player ? (!w.hidden && w.ownerId === n.myId) : ids.indexOf(w.id) >= 0;
      }).map(function(w) { return { x: w.x, y: w.y, w: w.w || 0, h: w.h || 0 }; });
  }
  function doorNearSync(am) {
      var board = document.getElementById('whiteboard'); if (!board || !am || am.type !== 'map') return;
      var sel = state.selWbIds || (state.selWbId ? [state.selWbId] : []), near = doorNearIds(am.whiteboard, doorNearMine(am, sel, window.wpNet), window.wpFogCore), on = Object.create(null);
      near.forEach(function(id) { on[id] = 1; });
      board.querySelectorAll('.wb-item.wb-door, .wb-item.wb-door-near').forEach(function(el) { el.classList.toggle('wb-door-near', on[el.dataset.id] === 1 && el.classList.contains('wb-door')); });
  }
  // [fogcheck:doornear-end]

  /* ---------- floating mini-toolbar over the selection ---------- */

  // Lives inside the scaled #whiteboard: native pan/zoom keep it anchored to
  // the selection, and a counter-scale keeps it a constant screen size.
  // Drags, resizes and zooms call wpUpdateSelToolbar per frame so it follows live.
  window.wpUpdateSelToolbar = function() {
      var am = getActiveMap();
      if (am && am.type === 'map') { updateSelToolbar(am); positionHandles(am); }
  };
  window.wpUpdateHandles = function() { var am = getActiveMap(); if (am && am.type === 'map') positionHandles(am); };

  /* The resize (gold) and rotate (blue) dots. Placed from the live item
     geometry every time anything moves — drag, resize, rotate, zoom — and
     counter-scaled by 1/zoom so they stay the same size on screen.
     A multi-selection gets one resize dot on its corner and no rotate dot. */
  function positionHandles(am) {
      var rHandle = document.getElementById('globalResizeHandle');
      var rotHandle = document.getElementById('globalRotateHandle');
      if (!rHandle || !rotHandle) return;
      var z = state.zoomLevel || 1;
      var tf = 'translate(-50%, -50%) scale(' + (1 / z) + ')';
      rHandle.style.transform = tf; rotHandle.style.transform = tf;
      var hide = function() { rHandle.style.display = 'none'; rotHandle.style.display = 'none'; };
      if (!am || am.type !== 'map' || state.viewMode !== 'visual') { hide(); return; }
      var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      var multiSel = state.selWbIds && state.selWbIds.length > 1
          ? state.selWbIds.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(function(x) { return x && !x.locked; })
          : [];
      if (multiSel.length > 1 && !clientView) {
          var mxR = Math.max.apply(null, multiSel.map(function(i) { return i.x + (i.w || 100); }));
          var myB = Math.max.apply(null, multiSel.map(function(i) { return i.y + (i.h || 100); }));
          rHandle.style.display = 'block';
          rHandle.style.left = mxR + 'px'; rHandle.style.top = myB + 'px';
          rotHandle.style.display = 'none';
          return;
      }
      var selItem = (state.selWbId && !(state.selWbIds && state.selWbIds.length > 1)) ? am.whiteboard.find(function(x) { return x.id === state.selWbId; }) : null;
      if (!selItem || selItem.locked) { hide(); return; }
      rHandle.style.display = 'block';
      rotHandle.style.display = (selItem.isChar && !stanceOn('turning')) ? 'none' : 'block';   // a character token only turns when the facing feature is on; shapes/images still rotate
      var rot = selItem.rot || 0;
      var cx = selItem.x + (selItem.w || 100) / 2;
      var cy = selItem.y + (selItem.h || 100) / 2;
      var rx = selItem.x + (selItem.w || 100), ry = selItem.y + (selItem.h || 100);
      var ox = cx, oy = selItem.y - 15 / z;   // the blue dot floats a constant screen distance above
      if (rot) {
          var rad = rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
          var dxR = rx - cx, dyR = ry - cy;
          rx = cx + dxR * cos - dyR * sin; ry = cy + dxR * sin + dyR * cos;
          var dxO = ox - cx, dyO = oy - cy;
          ox = cx + dxO * cos - dyO * sin; oy = cy + dxO * sin + dyO * cos;
      }
      rHandle.style.left = rx + 'px'; rHandle.style.top = ry + 'px';
      rotHandle.style.left = ox + 'px'; rotHandle.style.top = oy + 'px';
  }
  // the sight outline's eye (fog.js setOutline): this machine's own choice, kept from one selection to the next
  function sightPref() { try { return localStorage.getItem('wp_sightOutline') === 'on'; } catch (e) { return false; } }
  function sightSync(id) { var F = window.wpFog; if (F && F.setOutline) F.setOutline(id); }
  function updateSelToolbar(am) {
      try { doorNearSync(am); } catch (e) {}   // 1.5.6: the doors beside a token of yours, again as the selection or a token moves
      var bar = document.getElementById('selToolbar');
      if (!bar) return;
      var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);
      var its = ids.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean);
      if (clientView || state.viewMode !== 'visual' || !its.length || window.isDrawingMode || window.isEraserMode) {
          bar.style.display = 'none';
          sightSync(null);
          return;
      }
      var minX = Math.min.apply(null, its.map(function(i) { return i.x; }));
      var maxR = Math.max.apply(null, its.map(function(i) { return i.x + i.w; }));
      var minY = Math.min.apply(null, its.map(function(i) { return i.y; }));
      var z = state.zoomLevel || 1;
      var anyUnlocked = its.some(function(i) { return !i.locked; });
      var anyVisible = its.some(function(i) { return !i.hidden; });
      // [systemcheck:sheetbtn-start]
      // The sheet button: only for one selected token whose character's sheet this screen may open.
      var shBtn = bar.querySelector('.st-sheet'), shSep = bar.querySelector('.st-sheet-sep'), shOne = its.length === 1 ? its[0] : null;
      var shOk = !!(shOne && typeof shOne.charId === 'string' && shOne.charId && window.wpSheets && window.wpSheets.canOpen && window.wpSheets.canOpen(shOne.charId));
      if (shBtn) shBtn.style.display = shOk ? '' : 'none';
      if (shSep) shSep.style.display = shOk ? '' : 'none';
      // [systemcheck:sheetbtn-end]
      // The eye: the GM's toggle for the sight outline. While it is on, the one selected character token has the area in its line of sight
      // outlined by the fog module; anything else selected, nothing.
      var eyeBtn = bar.querySelector('.st-sight'), eyeOne = its.length === 1 && its[0].isChar && !its[0].waiting ? its[0] : null, eyeCan = !!(eyeOne && window.wpFog && window.wpFog.canOutline && window.wpFog.canOutline()), eyeOn = sightPref();
      if (eyeBtn) { eyeBtn.style.display = eyeCan ? '' : 'none'; eyeBtn.classList.toggle('on', eyeCan && eyeOn); eyeBtn.title = eyeOn ? 'Sight outline is on: the area this token sees is outlined. Press to switch it off' : 'Show what this token sees: an outline around the area in its line of sight'; }
      sightSync(eyeCan && eyeOn ? eyeOne.id : null);
      // Group button: a toggle — lit when the selection IS a group (click ungroups),
      // plain when several ungrouped/mixed items are selected (click groups them),
      // hidden for a single ungrouped item where it can't do anything.
      var grpBtn = bar.querySelector('.st-group');
      if (grpBtn) {
          var gids = its.map(function(i) { return i.groupId; }).filter(Boolean);
          var isGroup = gids.length === its.length && gids.length > 0 && gids.every(function(g) { return g === gids[0]; });
          if (isGroup) {
              grpBtn.style.display = '';
              grpBtn.classList.add('on');
              grpBtn.title = 'Ungroup';
          } else if (its.length > 1) {
              grpBtn.style.display = '';
              grpBtn.classList.remove('on');
              grpBtn.title = 'Group';
          } else {
              grpBtn.style.display = 'none';
          }
      }
      // The padlock shows the item's STATE (closed = locked), not the action
      var lockBtn = bar.querySelector('.st-lock');
      lockBtn.textContent = anyUnlocked ? '🔓' : '🔒';
      lockBtn.classList.toggle('on', !anyUnlocked);
      var doorSel = !!(window.wpFogCore && window.wpFogCore.isDoor && its.some(function(i) { return window.wpFogCore.isDoor(i); }));
      lockBtn.title = (anyUnlocked ? 'Not locked in place: it can be dragged and resized. Click to lock it in place' : 'Locked in place: no drag or resize. Click to unlock') + (doorSel ? '. This is not the lock of the door itself: right-click the door for Lock door for players' : '');
      var visBtn = bar.querySelector('.st-vis');
      visBtn.textContent = anyVisible ? '👁' : '🚫';
      visBtn.classList.toggle('st-hidden', !anyVisible);
      visBtn.title = anyVisible ? 'Visible to players — click to hide from them (GM still sees it dimmed)' : 'HIDDEN from players — click to show it to them';
      // Play-area toggle: only for footprint items (images/shapes, not tokens), and only while the fog feature is on for this campaign
      var fogBtn = bar.querySelector('.st-fog');
      if (fogBtn) {
          var fogEligible = its.every(function(i) { return ['rect', 'hexagon', 'circle', 'diamond', 'image'].indexOf(i.type) >= 0 && !i.isChar; }) && (!window.wpVtt || window.wpVtt.on('fog'));
          fogBtn.style.display = fogEligible ? '' : 'none';
          var allFogged = its.length > 0 && its.every(function(i) { return i.fogged; });
          fogBtn.classList.toggle('on', allFogged);
          fogBtn.title = allFogged ? 'Play area — fog covers this. Click to unmark.' : 'Mark as a play area — with fog on, only marked items are fogged (scenes stay lit)';
      }
      var fitBtn = bar.querySelector('.st-fit');
      if (fitBtn) {
          var gridOn = state.gridType && state.gridType !== 'off';
          fitBtn.style.display = gridOn ? '' : 'none';
          var _fitChanges = gridOn && window.wpFitWouldChange && window.wpFitWouldChange(its);
          fitBtn.disabled = gridOn ? !_fitChanges : false;
          fitBtn.title = !gridOn ? '' : (_fitChanges ? 'Fit to grid cells — size to whole ' + state.gridType + ' cells and seat it' : 'Already aligned to the grid');
      }
      var ratioBtn = bar.querySelector('.st-ratio');
      if (ratioBtn) {
          var allRatio = its.every(function(i) { return i.lockRatio; });
          ratioBtn.classList.toggle('on', allRatio);
          ratioBtn.title = allRatio ? 'Proportions locked — resizing keeps the width/height ratio (click to unlock)' : 'Lock proportions while resizing (or hold Shift while dragging)';
      }
      // Color button: its chip mirrors the selection's color and the kind of
      // thing it colors (text ink, pen, or fill); the palette pops on click.
      var colBtn = bar.querySelector('.st-color');
      var kind = selColorKind(its);
      if (colBtn) {
          colBtn.title = kind === 'text' ? 'Text color' : kind === 'pen' ? 'Pen color' : 'Fill color';
          colBtn.classList.toggle('st-text-color', kind === 'text');
          var chip = colBtn.querySelector('.st-color-chip');
          var cur = its[0] && its[0].color;
          if (chip) chip.style.background = (cur && cur !== 'transparent') ? cur : (kind === 'text' ? 'var(--ink)' : 'transparent');
          if (chip) chip.classList.toggle('none', !cur || cur === 'transparent');
      }
      var pop = bar.querySelector('.st-color-pop');
      if (pop && !pop.hidden) {
          var key = its.map(function(i) { return i.id; }).join(',');
          if (pop.dataset.sel !== key) pop.hidden = true; else renderColorPop(pop, its);
      }
      // The bar lives in the UNSCALED wrap (moved there at startup), so zoom can never change its size:
      // board coords × zoom = wrap coords, and it scrolls with the content like everything else in the wrap.
      bar.style.left = (((minX + maxR) / 2) * z) + 'px';
      bar.style.top = (minY * z) + 'px';
      bar.style.transformOrigin = 'top left';
      bar.style.transform = 'translate(-50%, calc(-100% - 36px))';   // clears the blue rotate dot (15px above the item, ~14px tall)
      bar.style.display = 'flex';
  }

  /* Fit to grid: size the selection to whole cells and seat it. Hex maps —
     tokens and hex shapes become exactly one cell; anything else rounds to
     whole columns/rows of cells and centres on a cell. Square grids — width,
     height and position round to the 50px lattice. */
  function fitItemInPlace(it, g) {
    var ox = it.x, oy = it.y, ow = it.w, oh = it.h;
    if (g === 'hex') {
        if (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon') { it.w = 60; it.h = 52; }
        else {
            var rows = Math.max(1, Math.round((it.h || 100) / 52)), cols = Math.max(1, Math.round(((it.w || 100) - 15) / 45));
            it.w = cols * 45 + 15; it.h = rows * 52;
        }
        if (window.wpSeatHex) window.wpSeatHex(it, null, true);
    } else {
        it.w = Math.max(50, Math.round((it.w || 100) / 50) * 50);
        it.h = Math.max(50, Math.round((it.h || 100) / 50) * 50);
        it.x = Math.round(it.x / 50) * 50; it.y = Math.round(it.y / 50) * 50;
    }
    return Math.abs(it.x - ox) > 0.01 || Math.abs(it.y - oy) > 0.01 || Math.abs(it.w - ow) > 0.01 || Math.abs(it.h - oh) > 0.01;
}
// Would fitToGrid change anything in this selection? Mirror the exact transform on clones; skip locked/path.
function fitWouldChange(its) {
    var g = state.gridType;
    if (!g || g === 'off') return false;
    for (var i = 0; i < its.length; i++) {
        var it = its[i];
        if (!it || it.locked || it.type === 'path') continue;
        var cl = { x: it.x, y: it.y, w: it.w, h: it.h, isChar: it.isChar, waiting: it.waiting, type: it.type, shape: it.shape, src: it.src };
        var moved = fitItemInPlace(cl, g);
        if (moved || (window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(cl, getActiveMap()))) return true;   // it would move or resize, or once fitted take the cell's shape
    }
    return false;
}
function fitToGrid(its) {
    var g = state.gridType;
    if (!g || g === 'off') { toast('Turn on a grid first (square or hex) — the grid button in the toolbar.'); return; }
    var n = 0;
    its.forEach(function(it) {
        if (it.locked || it.type === 'path') return;
        it.gridFit = true;   // remember it's grid-fitted, so it re-seats to the cell CENTRE on every move (not just this one-shot) — a hex move used to leave it ~half a cell off in x
        var fitted = fitItemInPlace(it, g);
        var reshaped = !!(window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(it, getActiveMap()));   // grid-shaped tokens: once fitted, a one-cell token takes the cell's shape too (one press is final)
        if (fitted || reshaped) n++;
    });
    if (n) { save(); render(); toast('Fitted ' + n + ' item' + (n === 1 ? '' : 's') + ' to the ' + g + ' grid.'); }
    else { toast('Already aligned to the grid.'); }
}
// One shared builder so the live draw preview and the committed stroke never drift.
function buildStrokePath(pts, tip, w, holes) {
    tip = tip || 'round'; w = w || 3;
    if (tip === 'fill') {   // a freeform filled region: pts is the closed outline; any holes are punched out with even-odd
        var _fd = 'M ' + pts.map(function(q){ return q[0] + ' ' + q[1]; }).join(' L ') + ' Z';
        if (holes && holes.length) {
            var _anyHole = false;
            holes.forEach(function(h){ if (h && h.length >= 3) { _fd += ' M ' + h.map(function(q){ return q[0] + ' ' + q[1]; }).join(' L ') + ' Z'; _anyHole = true; } });
            if (_anyHole) return { fill: true, d: _fd, fillRule: 'evenodd' };
        }
        return { fill: true, d: _fd };
    }
    if (tip === 'flat') {   // an angled calligraphy nib: a filled ribbon whose width varies with stroke direction
        var _w2 = w / 2, _ox = 0.70711 * _w2, _oy = 0.70711 * _w2;
        var _top = pts.map(function(q){ return (q[0] + _ox) + ' ' + (q[1] + _oy); });
        var _bot = pts.map(function(q){ return (q[0] - _ox) + ' ' + (q[1] - _oy); }).reverse();
        return { fill: true, d: 'M ' + _top.join(' L ') + ' L ' + _bot.join(' L ') + ' Z' };
    }
    return { fill: false, d: 'M ' + pts.map(function(q){ return q[0] + ' ' + q[1]; }).join(' L '),
             width: w, linecap: tip === 'square' ? 'square' : 'round', linejoin: tip === 'square' ? 'miter' : 'round' };
}
window.wpFitWouldChange = fitWouldChange;
window.wpBuildStrokePath = buildStrokePath;
window.wpFitToGrid = fitToGrid;

  /* Duplicate: a full copy of every selected item — every field it carries
     (sheet, stats, portal target, styling, opacity, layer, lock…) rides along.
     Fresh ids; a group is copied as a new group; `ownerId` is dropped so a
     copied player token isn't remote-controlled; hex tokens/shapes land one
     cell to the right and seat, everything else offsets by 25px. The copies
     become the selection. */
  function duplicateWbItems(its) {
      var am = getActiveMap();
      if (!am || am.type !== 'map' || !its.length) return [];
      var gidMap = {}, copies = [];
      its.forEach(function(src) {
          if (!src || src.waiting) return;   // Onboarding F1a: a waiting token is the host's alone, never copied
          var it = JSON.parse(JSON.stringify(src));
          it.id = 'wb' + uid() + Math.random().toString(36).slice(2, 5);
          delete it.ownerId; delete it.charId; delete it.threats;   // a copy is a new creature, not a second token of the character (5h: nor its threat marks)
          if (it.groupId) {
              if (!gidMap[it.groupId]) gidMap[it.groupId] = 'group_' + Date.now() + Math.random().toString(36).slice(2, 6);
              it.groupId = gidMap[it.groupId];
          }
          var hexy = state.gridType === 'hex' && (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon');
          if (hexy) { it.x += 45; it.y += 26; if (window.wpSeatHex) window.wpSeatHex(it, am); }   // the next cell over (flat-top: down-right)
          else { it.x += 25; it.y += 25; }
          am.whiteboard.push(it);
          copies.push(it);
      });
      state.selWbIds = copies.map(function(c) { return c.id; });
      state.selWbId = state.selWbIds[0] || null;
      save(); render();
      toast('Duplicated ' + copies.length + ' item' + (copies.length === 1 ? '' : 's') + '.');
      return copies;
  }
  window.wpDuplicateWb = duplicateWbItems;

  function selColorKind(its) {
      if (its.length && its.every(function(i) { return i.type === 'text'; })) return 'text';
      if (its.length && its.every(function(i) { return i.type === 'path' && i.tip !== 'fill'; })) return 'pen';   // a tip:'fill' region takes the fill palette, not the pen inks
      return 'fill';
  }
  var ST_PEN = { '#e9e9f0': 'White', '#1a1a1a': 'Black', '#d9534f': 'Red', '#e0a54f': 'Gold', '#5cb87a': 'Green', '#4db3d3': 'Blue', '#b98cff': 'Violet' };
  var ST_FILL = { 'var(--panel2)': 'Dark Panel', 'rgba(217, 83, 79, 0.3)': 'Red Tint', 'rgba(92, 184, 122, 0.3)': 'Green Tint', 'rgba(77, 179, 211, 0.3)': 'Blue Tint', 'rgba(224, 165, 79, 0.3)': 'Gold Tint', 'transparent': 'Transparent' };
  function applySelColor(its, v) {
      its.forEach(function(i) {
          i.color = v;
          var el = state.wbEls[i.id];
          if (!el) return;
          if (i.type === 'text') el.style.color = (v && v !== 'transparent') ? v : '';
          else if (i.type === 'path') { var p = el.querySelector('svg > path'), pr = i.tip === 'fill' ? el.querySelector('svg > defs > pattern > rect') : null; if (pr) pr.setAttribute('fill', cssColor(v, 'transparent')); else if (p) { if (i.tip === 'fill') p.style.fill = v; else p.style.stroke = v; } }   // its own path, never a pattern's; a textured region: the colour under its pattern
          else if (i.type !== 'image' && i.type !== 'trigger') el.style.backgroundColor = v;   // the colour alone, so a recolour keeps a piece's texture
      });
  }
  // The palette matches the selection: text and drawings get the pen inks,
  // shapes get the fills plus the inks; everyone gets a custom picker.
  function renderColorPop(pop, its) {
      var kind = selColorKind(its);
      var cur = (its[0] && its[0].color || '').toLowerCase();
      var sets = kind === 'fill' ? [ST_FILL, ST_PEN] : [ST_PEN];
      var html = '<div class="stc-title">' + (kind === 'text' ? 'Text color' : kind === 'pen' ? 'Pen color' : 'Fill color') + '</div><div class="stc-grid">';
      sets.forEach(function(set) {
          Object.keys(set).forEach(function(k) {
              html += '<button class="stc-sw' + (k.toLowerCase() === cur ? ' on' : '') + (k === 'transparent' ? ' clear' : '') + '" data-c="' + k + '" title="' + set[k] + '" style="background:' + k + '"></button>';
          });
      });
      html += '<label class="stc-sw custom" title="Custom color"><input type="color" value="' + (/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#e9e9f0') + '"></label></div>';
      pop.innerHTML = html;
      pop.dataset.sel = its.map(function(i) { return i.id; }).join(',');
      pop.querySelectorAll('.stc-sw[data-c]').forEach(function(b) {
          b.addEventListener('click', function(e) {
              e.stopPropagation();
              applySelColor(selToolbarItems(), this.dataset.c);
              save();
              if (window.appRender) window.appRender();
          });
      });
      var ci = pop.querySelector('input[type="color"]');
      if (ci) {
          ci.addEventListener('input', function() { applySelColor(selToolbarItems(), this.value); });
          ci.addEventListener('change', function() { save(); if (window.appRender) window.appRender(); });
          ['click', 'pointerdown'].forEach(function(ev) { ci.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      }
  }

  function selToolbarItems() {
      var am = getActiveMap();
      if (!am || am.type !== 'map') return [];
      var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);
      return ids.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean);
  }

  (function wireSelToolbar() {
      var bar = document.getElementById('selToolbar');
      if (!bar) return;
      // Keep toolbar interactions from reaching the canvas (pan/box-select/deselect)
      ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach(function(ev) {
          bar.addEventListener(ev, function(e) { e.stopPropagation(); });
      });
      var LAYERS = ['back', 'back-mid', 'middle', 'front-mid', 'front'];
      bar.addEventListener('click', function(e) {
          var btn = e.target.closest('[data-st]');
          if (!btn) return;
          var act = btn.dataset.st;
          var its = selToolbarItems();
          if (!its.length) return;
          if (act === 'sheet') { if (its.length === 1 && its[0].charId && window.wpSheets && window.wpSheets.canOpen(its[0].charId)) window.wpSheets.openSheet(its[0].charId); return; }
          if (act === 'sight') { try { localStorage.setItem('wp_sightOutline', sightPref() ? 'off' : 'on'); } catch (e) {} var amS = getActiveMap(); if (amS) updateSelToolbar(amS); return; }
          if (act === 'color') {
              // Second click on the swatch closes the palette
              var pop = bar.querySelector('.st-color-pop');
              if (!pop) return;
              if (pop.hidden) { renderColorPop(pop, its); pop.hidden = false; }
              else pop.hidden = true;
              return;
          }
          if (act === 'group') {
              var gids2 = its.map(function(i) { return i.groupId; }).filter(Boolean);
              var isGroup2 = gids2.length === its.length && gids2.length > 0 && gids2.every(function(g) { return g === gids2[0]; });
              if (isGroup2) {
                  var g0 = gids2[0];
                  var am2 = getActiveMap();
                  am2.whiteboard.forEach(function(w) { if (w.groupId === g0) delete w.groupId; });
                  import('./io.js').then(function(m) { m.toast('Ungrouped.'); });
              } else if (its.length > 1) {
                  var newGid = 'group_' + Date.now();
                  its.forEach(function(i) { i.groupId = newGid; });
                  import('./io.js').then(function(m) { m.toast('Grouped ' + its.length + ' items.'); });
              } else return;
          } else if (act === 'lock') {
              var lockThem = its.some(function(i) { return !i.locked; });
              its.forEach(function(i) { i.locked = lockThem; });
          } else if (act === 'vis') {
              var hideThem = its.some(function(i) { return !i.hidden; });
              its.forEach(function(i) { i.hidden = hideThem; });
              import('./io.js').then(function(m) { m.toast(hideThem ? 'Hidden from players. You still see it dimmed; they see nothing.' : 'Now visible to players.'); });
          } else if (act === 'dup') {
              duplicateWbItems(its);
              return;   // duplicateWbItems saves and renders itself
          } else if (act === 'fit') {
              fitToGrid(its);
              return;   // fitToGrid saves and renders itself
          } else if (act === 'ratio') {
              var lockThemR = its.some(function(i) { return !i.lockRatio; });
              its.forEach(function(i) { if (lockThemR) i.lockRatio = true; else delete i.lockRatio; });
          } else if (act === 'fog') {
              var markThem = its.some(function(i) { return !i.fogged; });
              its.forEach(function(i) { if (markThem) i.fogged = true; else delete i.fogged; });
              if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
              import('./io.js').then(function(m) { m.toast(markThem ? 'Marked as a play area — with fog on, only marked items are fogged.' : 'No longer a play area.'); });
          } else if (act === 'up' || act === 'down') {
              its.forEach(function(i) {
                  var idx = LAYERS.indexOf(i.layer || 'middle');
                  i.layer = LAYERS[act === 'up' ? Math.min(LAYERS.length - 1, idx + 1) : Math.max(0, idx - 1)];
              });
          } else if (act === 'del') {
              var am = getActiveMap();
              var ids = its.map(function(i) { return i.id; });
              if (window.wpWaitingGone) window.wpWaitingGone(its);   // Onboarding F1a
              am.whiteboard = am.whiteboard.filter(function(x) { return ids.indexOf(x.id) === -1; });
              state.selWbIds = []; state.selWbId = null;
          } else return;
          save();
          if (window.appRender) window.appRender();
      });
      // Clicking anywhere off the toolbar closes the palette
      document.addEventListener('pointerdown', function(e) {
          var pop = bar.querySelector('.st-color-pop');
          if (pop && !pop.hidden && !e.target.closest('#selToolbar')) pop.hidden = true;
      }, true);
      document.addEventListener('keydown', function(e) {
          var pop = bar.querySelector('.st-color-pop');
          if (e.key === 'Escape' && pop && !pop.hidden && (!window.wpEsc || window.wpEsc.free(e))) pop.hidden = true;   // 1.5.4: esckey.js puts it away, one thing a press
      });
  })();



  /* ---------- inspector helpers ---------- */

  // [netcheck:hostgesture-start]
  // Fold M6: the GM's board gesture now open on the hosting machine (a drag that writes items, the resize or rotate handle, a fog-brush stroke):
  // the id of the map it runs on while it runs, null otherwise. The host's catch-up of the players' copies (a later fold) waits for it to end,
  // so nothing is judged from a half-made change; nothing reads it yet. Only a host sets it; every way a gesture ends clears it, and so does
  // the window losing focus
  window.wpHostGesture = null;
  function hostGestureStart() { var n = window.wpNet, m = getActiveMap(); window.wpHostGesture = n && n.active && n.role === 'host' && m && typeof m.id === 'string' ? m.id : null; }
  function hostGestureEnd() { window.wpHostGesture = null; }
  window.wpHostGestureStart = hostGestureStart; window.wpHostGestureEnd = hostGestureEnd;
  window.addEventListener('blur', hostGestureEnd);
  // [netcheck:hostgesture-end]
  function attachResizeHandle() {

      var handle = document.getElementById('globalResizeHandle');

      if(!handle) return;

      var isResizing = false, startX, startY, startW, startH, item;
      // Group resize: every member of the primary's group (or multi-selection)
      // scales with it, anchored at the group's top-left corner.
      var groupMembers = null, gbx = 0, gby = 0, gbw = 1, gbh = 1;

      handle.addEventListener('pointerdown', function(e) {

          if (!state.selWbId || state.viewMode !== 'visual') return;

          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

          item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

          if (!item) return;

          isResizing = true;

          doSmartSnapping.resizeMatch = { w: null, h: null };   // fresh resize: no sticky matches yet

          startX = e.clientX; startY = e.clientY;

          startW = item.w; startH = item.h;

          groupMembers = null;
          var wbAll = getActiveMap().whiteboard;
          var mates = item.groupId
              ? wbAll.filter(function(o) { return o.groupId === item.groupId; })
              : ((state.selWbIds || []).length > 1 && (state.selWbIds || []).indexOf(item.id) !== -1
                  ? wbAll.filter(function(o) { return (state.selWbIds || []).indexOf(o.id) !== -1; }) : []);
          mates = mates.filter(function(o) { return !o.locked; });
          if (mates.length > 1) {
              gbx = Math.min.apply(null, mates.map(function(o) { return o.x; }));
              gby = Math.min.apply(null, mates.map(function(o) { return o.y; }));
              gbw = Math.max(1, Math.max.apply(null, mates.map(function(o) { return o.x + (o.w || 100); })) - gbx);
              gbh = Math.max(1, Math.max.apply(null, mates.map(function(o) { return o.y + (o.h || 100); })) - gby);
              groupMembers = mates.map(function(o) { return { it: o, x0: o.x, y0: o.y, w0: o.w || 100, h0: o.h || 100 }; });
          }

          try { handle.setPointerCapture(e.pointerId); } catch(_) {}

          hostGestureStart();   // fold M6

          e.preventDefault(); e.stopPropagation();

      });
      handle.addEventListener('pointercancel', hostGestureEnd); handle.addEventListener('lostpointercapture', hostGestureEnd);   // fold M6

      handle.addEventListener('pointermove', function(e) {

          if (!isResizing) return;

      var dx = (e.clientX - startX) / state.zoomLevel;
      var dy = (e.clientY - startY) / state.zoomLevel;
      if (groupMembers) {
          // The handle sits on the selection's corner: dragging it scales the
          // whole box from its top-left, every member along with it.
          var gsx = Math.max(0.05, (gbw + dx) / gbw), gsy = Math.max(0.05, (gbh + dy) / gbh);
          if (e.shiftKey || groupMembers.some(function(g) { return g.it.lockRatio; })) { var u = Math.abs(dx) >= Math.abs(dy) ? gsx : gsy; gsx = u; gsy = u; }
          groupMembers.forEach(function(g) {
              g.it.x = gbx + (g.x0 - gbx) * gsx;
              g.it.y = gby + (g.y0 - gby) * gsy;
              g.it.w = Math.max(10, g.w0 * gsx);
              g.it.h = Math.max(10, g.h0 * gsy);
              var gel = state.wbEls[g.it.id];
              if (gel) { gel.style.left = g.it.x + 'px'; gel.style.top = g.it.y + 'px'; gel.style.width = g.it.w + 'px'; gel.style.height = g.it.h + 'px'; }
          });
          if (window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // toolbar + dots follow the box
          return;
      }
      var rot = item.rot || 0;
      if (rot) {
          var rad = -rot * Math.PI / 180;
          var cos = Math.cos(rad), sin = Math.sin(rad);
          var ldx = dx * cos - dy * sin;
          var ldy = dx * sin + dy * cos;
          dx = ldx; dy = ldy;
      }
      item.w = Math.max(10, startW + dx);
      item.h = Math.max(10, startH + dy);
      // Proportional resize: the item's ratio lock, or holding Shift while dragging
      if ((item.lockRatio || e.shiftKey) && startW > 0 && startH > 0) {
          var ratio = startW / startH;
          if (Math.abs(dx) >= Math.abs(dy)) item.h = Math.max(10, item.w / ratio);
          else item.w = Math.max(10, item.h * ratio);
      }



          // Size matching runs even with the ratio locked: whichever axis pauses
          // on a neighbour's size, the other follows the ratio.
          var wBefore = item.w, hBefore = item.h;
          doSmartSnapping(item, true);
          if ((item.lockRatio || e.shiftKey) && startW > 0 && startH > 0) {
              var ratioL = startW / startH;
              if (item.w !== wBefore) item.h = Math.max(10, item.w / ratioL);
              else if (item.h !== hBefore) item.w = Math.max(10, item.h * ratioL);
          }



          var el = state.wbEls[item.id];

          if(el) {

              el.style.width = item.w + 'px';

              el.style.height = item.h + 'px';

          }

          if (window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // toolbar and both dots track the growing box

      });

      handle.addEventListener('pointerup', function(e) {

          if(!isResizing) return;

          isResizing = false;

          hostGestureEnd();   // fold M6

          clearSnaps();

          try { handle.releasePointerCapture(e.pointerId); } catch(e){}

          // a picture or a shape resized to the size of one hex cell seats in that cell, as its drop does (datamap.js wpSeatSized: Snap on, a hex map; one piece, never a group, which keeps its shape)
          if (!groupMembers && window.wpSeatSized && window.wpSeatSized(item)) { var elZ = state.wbEls[item.id]; if (elZ) { elZ.style.left = item.x + 'px'; elZ.style.top = item.y + 'px'; } if (window.wpUpdateSelToolbar) window.wpUpdateSelToolbar(); }
          if (document.querySelector('#whiteboard .wb-item.wb-tex.sel') && typeof renderWhiteboard === 'function') renderWhiteboard();   // the map builder: a resized textured piece is drawn again, its tile seated and its pattern scaled back (a resize ends with no redraw otherwise)
          save();
          refreshStanceChips();   // item 19b H5: a ground piece resized under a token (or away from one) changes its chip with no redraw

      });

  }



  /* Tokens turn in grid steps: a square grid has 4 facings (0, ±90, 180), a
     hex grid has 6 (0, ±60, ±120, 180 — one per face of a flat-top hex, so
     straight up is a facing and tokens never sit tilted).
     Hold Shift for free 15° steps. With no grid, tokens turn freely; applying
     a grid turns every token to its nearest facing (see setGridType). */
  function facingStepFor(gridType, item) {
      if (!item || !item.isChar) return 0;
      if (gridType === 'square') return 90;
      if (gridType === 'hex') return 60;
      return 0;
  }
  // [systemcheck:facingstep-start]
  // 1.5.6 (found 2026-10-24: a player's token rested a little off the grid's angle with the GM's magnet on): a turn steps to the grid's sides
  // by the snap rule a drop follows (datamap.js wpSnapOn: on a player's app at a table the GM's Snap, else this screen's Snap to the grid or
  // to both), never by a player's own magnet alone
  function facingStep(item) {
      var on = typeof window.wpSnapOn === 'function' ? window.wpSnapOn() === true : (!!state.snap && state.snapMode !== 'items');
      if (!on) return 0;
      return facingStepFor(state.gridType, item);
  }
  // [systemcheck:facingstep-end]
  function snapFacing(rot, step, front) {
      // `front` = which side of the art is the token's front (0 top, 90 right…);
      // that side is what turns to face a cell side.
      front = front || 0;
      var off = 0;   // flat-top hex faces sit at 0, ±60, ±120, 180 — straight up is a face
      var r = Math.round((rot + front - off) / step) * step + off - front;
      if (r <= -180) r += 360;
      if (r > 180) r -= 360;
      return r;
  }
  window.wpSnapFacing = function(item, rot) { var s = facingStep(item); return s ? snapFacing(rot, s, item.front || 0) : rot; };
  /* Turn every token on the map to its nearest facing for `gridType`. Returns
     how many changed. */
  function seatFacings(map, gridType) {
      var n = 0;
      if (!map || !map.whiteboard) return 0;
      map.whiteboard.forEach(function(it) {
          var st = facingStepFor(gridType, it);
          if (!st) return;
          var r = snapFacing(it.rot || 0, st, it.front || 0);
          if (r !== (it.rot || 0)) { it.rot = r; n++; }
      });
      return n;
  }
  window.wpSeatFacings = seatFacings;
  /* Turn a token from its own arrow. Click = next facing clockwise (Shift =
     counter-clockwise); drag = point the arrow at the pointer, snapped to the
     grid's facings (Shift = 15° steps). item.faceMode 'arrow' turns only the
     arrow (front) and leaves the art upright; otherwise the art turns with it
     (rot). The arrow's world direction is always rot + front. */
  var TOKEN_X = '<svg viewBox="0 0 100 100"><path d="M20 20 L80 80 M80 20 L20 80" stroke="#111" stroke-width="20" stroke-linecap="round" fill="none"/><path d="M20 20 L80 80 M80 20 L20 80" stroke="#e53935" stroke-width="12" stroke-linecap="round" fill="none"/></svg>';
  var TOKEN_SKULL = '<svg viewBox="0 0 100 100"><path fill="#f4f4f4" stroke="#111" stroke-width="4" stroke-linejoin="round" d="M50 8 C24 8 12 26 12 46 C12 58 18 66 26 70 L26 84 L38 84 L38 76 L46 76 L46 84 L54 84 L54 76 L62 76 L62 84 L74 84 L74 70 C82 66 88 58 88 46 C88 26 76 8 50 8 Z"/><ellipse cx="36" cy="46" rx="9" ry="11" fill="#111"/><ellipse cx="64" cy="46" rx="9" ry="11" fill="#111"/><path d="M45 61 L50 68 L55 61 Z" fill="#111"/></svg>';
  function normDeg(v) { v = Math.round(v) % 360; if (v <= -180) v += 360; if (v > 180) v -= 360; return v; }
  function applyFacing(item, worldDeg, shift) {
      var step = shift ? 15 : facingStep(item);
      var target = step ? snapFacing(worldDeg, step, 0) : Math.round(worldDeg);
      if (item.faceMode === 'arrow') item.front = ((Math.round(target - (item.rot || 0)) % 360) + 360) % 360;
      else item.rot = normDeg(target - (item.front || 0));
  }
  function refreshTokenDom(item) {
      var el = state.wbEls[item.id];
      if (el) {
          el.style.transform = item.rot ? 'rotate(' + item.rot + 'deg)' : 'none';
          var fw = el.querySelector(':scope > .token-front');
          if (fw) fw.style.transform = item.front ? 'rotate(' + item.front + 'deg)' : '';
      }
      var rRange = document.getElementById('wbRot'), rNum = document.getElementById('wbRotNum');
      if (rRange && rNum) { rRange.value = item.rot || 0; rNum.value = item.rot || 0; }
      if (window.wpUpdateHandles) window.wpUpdateHandles();
      if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item);
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(item.id, false);   // 5h Fold 3: a sheet's facing dial follows the arrow as it turns
  }
  window.wpTurnToken = function(item, steps) {   // programmatic / keyboard: +1 = clockwise
      var st = facingStep(item) || (state.gridType === 'hex' ? 60 : 90);
      applyFacing(item, (item.rot || 0) + (item.front || 0) + steps * st, false);
      refreshTokenDom(item);
  };
  /* Stage 5h Fold 3: the character sheet's facing dial. It turns a token on ITS OWN map (the step from that map's grid, never the
     viewer's Snap setting or the grid on screen) under the arrow's rule (a player turns their own token, while not paused; facing on),
     and ends like the arrow's release: a final pos (the host saves it), then save + render. A token on a map off screen (the GM's dial
     following a player elsewhere): save, and the host sends that map whole (a pos always names the map on screen). */
  function tokenOnMap(mapId, tokId, feature) {   // feature: the VTT feature the change needs ('turning' when left out; null = the caller checks its own)
      var camp = getActiveCampaign(), items = camp && camp.items;
      var map = items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(items, mapId) ? items[mapId] : null;
      if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard)) return null;
      var tok = map.whiteboard.find(function(x) { return x && x.id === tokId; });
      if (!tok || !tok.isChar || (feature !== null && window.wpVtt && !window.wpVtt.on(feature || 'turning'))) return null;
      var n = window.wpNet;
      if (n && n.active && n.role === 'client' && (n.paused || n.selfPaused || tok.ownerId !== n.myId || tok.locked)) return null;   // a locked token is frozen for its player (the host refuses it too)
      return { camp: camp, map: map, mapId: mapId, tok: tok, onScreen: camp.activeItemId === mapId };
  }
  function endDialTurn(t) {
      if (t.onScreen) {
          var el = state.wbEls[t.tok.id];
          if (el) { el.style.transform = t.tok.rot ? 'rotate(' + t.tok.rot + 'deg)' : 'none'; var fw = el.querySelector(':scope > .token-front'); if (fw) fw.style.transform = t.tok.front ? 'rotate(' + t.tok.front + 'deg)' : ''; }
          if (state.selWbId === t.tok.id) { var rRange = document.getElementById('wbRot'), rNum = document.getElementById('wbRotNum'); if (rRange && rNum) { rRange.value = t.tok.rot || 0; rNum.value = t.tok.rot || 0; } }
          if (window.wpUpdateHandles) window.wpUpdateHandles();
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(t.tok, true);
      }
      save(); render();
      var n = window.wpNet;
      if (!t.onScreen && n && n.active && n.role === 'host' && n.broadcastItemFiltered) n.broadcastItemFiltered(t.camp.id, t.mapId);
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(t.tok.id, true);
  }
  window.wpSetTokenFacing = function(mapId, tokId, worldDeg) {
      var t = tokenOnMap(mapId, tokId); if (!t || typeof worldDeg !== 'number' || !isFinite(worldDeg)) return false;
      var step = facingStepFor((t.map.meta && t.map.meta.gridType) || 'off', t.tok);
      var target = step ? snapFacing(worldDeg, step, 0) : Math.round(worldDeg);
      if (t.tok.faceMode === 'arrow') t.tok.front = ((Math.round(target - (t.tok.rot || 0)) % 360) + 360) % 360;
      else t.tok.rot = normDeg(target - (t.tok.front || 0));
      endDialTurn(t); return true;
  };
  // Stage 6: the sheet's stance control sets the token's posture / elevation, each only while its feature is on, the way the token's own
  // menu does (a player's goes to the host in their map patch, under the same owner gate); the GM's goes out with the map at once
  window.wpSetTokenStance = function(mapId, tokId, st) {
      var t = tokenOnMap(mapId, tokId, null); if (!t || !st || typeof st !== 'object') return false;
      var did = false;
      if (typeof st.posture === 'string' && stanceOn('posture')) { setTokenPosture(t.tok, st.posture); did = true; }
      if (st.elevation !== undefined && stanceOn('elevation') && isFinite(Number(st.elevation))) { setTokenElevation(t.tok, Number(st.elevation)); did = true; }
      if (!did) return false;
      var n = window.wpNet;
      save(!!(n && n.active && n.role === 'client')); render();   // fold M8: a player's stance goes to the host at once
      if (n && n.active && n.role === 'host') { if (t.onScreen && n.sendItem) n.sendItem(t.camp.id, mapId); else if (!t.onScreen && n.broadcastItemFiltered) n.broadcastItemFiltered(t.camp.id, mapId); }
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(tokId, true);
      return true;
  };
  // Threat marks: a player's go to the host as their own message (a map patch never carries them, so a stale copy cannot undo the
  // GM's); the GM's go out with the map at once
  window.wpSetTokenThreats = function(mapId, tokId, list) {
      var t = tokenOnMap(mapId, tokId), S = window.wpSystemCore; if (!t || !S || !S.cleanThreats) return false;
      var th = S.cleanThreats(list); if (th.length) t.tok.threats = th; else delete t.tok.threats;
      var n = window.wpNet;
      if (n && n.active && n.role === 'client') { if (n.sendThreats) n.sendThreats(t.camp.id, mapId, tokId, th); render(); }
      else {
          save(); render();
          if (n && n.active && n.role === 'host') { if (t.onScreen && n.sendItem) n.sendItem(t.camp.id, mapId); else if (!t.onScreen && n.broadcastItemFiltered) n.broadcastItemFiltered(t.camp.id, mapId); }
      }
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(tokId, true);
      return true;
  };
  // [systemcheck:turnable-start]
  // A token's facing arrow turns it only while that token is selected, on the GM's screen and on a player's (1.5.6; found at the owner's table
  // on 2026-10-24: "characters right next to each other become very difficult to control in their facing. i may mean to click one, and
  // accidentally change the face of another right next to it"). The arrow stands past the token's edge, so a live arrow on every token of a
  // player's took the press meant for the token beside it; an arrow that is not turnable takes no press at all (style.css), and the press goes
  // to what lies under it. A player's own token, not locked, the table not paused for them
  function arrowTurnable(item, net, st) {
      if (!item || !st || st.selWbId !== item.id) return false;
      if (net && net.active && net.role === 'client') return item.ownerId === net.myId && !item.locked && !(net.paused || net.selfPaused);
      return true;
  }
  // [systemcheck:turnable-end]
  function attachArrowTurn() {
      var turning = null;
      function boardPt(e) {
          var wrap = document.getElementById('whiteboardWrap'); var b = wrap.getBoundingClientRect(); var z = state.zoomLevel || 1;
          return { x: (e.clientX - b.left + wrap.scrollLeft) / z, y: (e.clientY - b.top + wrap.scrollTop) / z };
      }
      document.addEventListener('pointerdown', function(e) {
          if (e.button !== 0 || !e.target || !e.target.closest) return;
          var ar = e.target.closest('.token-front.turnable');
          if (!ar) return;
          var el = ar.closest('.wb-item'); if (!el) return;
          var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return;
          var item = am.whiteboard.find(function(x) { return x.id === el.dataset.id; });
          if (!item || !item.isChar) return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && (window.wpNet.paused || window.wpNet.selfPaused || item.ownerId !== window.wpNet.myId || item.locked)) return;
          e.preventDefault(); e.stopPropagation();
          turning = { id: item.id, mapId: am.id, sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey };   // fold M8: by id, found again at each write
      }, true);
      document.addEventListener('pointermove', function(e) {
          if (!turning) return;
          if (!turning.moved && Math.hypot(e.clientX - turning.sx, e.clientY - turning.sy) < 5) return;
          var it = ownTokenNow(turning.mapId, turning.id); if (!it) { turning = null; return; }   // no longer theirs to turn: the turn is over
          turning.moved = true;
          var p = boardPt(e);
          var cx = it.x + (it.w || 60) / 2, cy = it.y + (it.h || 52) / 2;
          var deg = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;   // 0 = up, clockwise
          applyFacing(it, deg, e.shiftKey);
          refreshTokenDom(it);
      });
      document.addEventListener('pointerup', function(e) {
          if (!turning) return;
          var tn = turning, it = ownTokenNow(tn.mapId, tn.id); turning = null;
          if (!it) return;   // fold M8: gone, locked or no longer theirs meanwhile: nothing lands
          if (!tn.moved) window.wpTurnToken(it, tn.shift ? -1 : 1);
          refreshTokenDom(it);
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(it, true, tn.mapId);
          save(); render();
      });
  }
  function attachRotateHandle() {

      var handle = document.getElementById('globalRotateHandle');

      if(!handle) return;

      var isRotating = false, item, startAngle, startRot, cx, cy, rotMapId = null;   // fold M8: the map the turn began on; the item found again by id at each write

      handle.addEventListener('pointerdown', function(e) {

          if (!state.selWbId || state.viewMode !== 'visual') return;

          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { var ownTok = getActiveMap().whiteboard.find(x => x.id === state.selWbId); if (window.wpNet.paused || window.wpNet.selfPaused || !ownTok || !ownTok.isChar || ownTok.ownerId !== window.wpNet.myId || ownTok.locked) return; }   // players may turn their own token (not one the GM locked)

          item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

          if (!item) return;

          isRotating = true; rotMapId = getActiveMap().id;

          cx = item.x + (item.w||100)/2;
          cy = item.y + (item.h||100)/2;

          

          var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

          var mouseX = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft) / state.zoomLevel;

          var mouseY = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop) / state.zoomLevel;

          

          startAngle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;

          startRot = item.rot || 0;

          

          try { handle.setPointerCapture(e.pointerId); } catch(_) {}

          hostGestureStart();   // fold M6

          e.preventDefault(); e.stopPropagation();

      });
      handle.addEventListener('pointercancel', hostGestureEnd); handle.addEventListener('lostpointercapture', hostGestureEnd);   // fold M6

      handle.addEventListener('pointermove', function(e) {

          if (!isRotating) return;

          var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

          var mouseX = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft) / state.zoomLevel;

          var mouseY = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop) / state.zoomLevel;

          

          var currentAngle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;

          var diff = currentAngle - startAngle;

          

          var liveR = ownTokenNow(rotMapId, item.id); if (!liveR) { isRotating = false; hostGestureEnd(); return; }   // fold M8: no longer theirs to turn
          item = liveR;
          var newRot = Math.round(startRot + diff);

          if (e.shiftKey) newRot = Math.round(newRot / 15) * 15; // state.snap to 15 degrees if shift held
          else { var fstep = facingStep(item); if (fstep) newRot = snapFacing(newRot, fstep, item.front || 0); }   // tokens face cell sides

          if (newRot <= -180) newRot += 360;

          if (newRot > 180) newRot -= 360;

          

          item.rot = newRot;
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item);   // remote tables see it turn

          

          var el = state.wbEls[item.id];

          if(el) el.style.transform = 'rotate(' + item.rot + 'deg)';

          

          // update inspector if open

          var rRange = document.getElementById('wbRot');

          var rNum = document.getElementById('wbRotNum');

          if (rRange && rNum) {

              rRange.value = item.rot;

              rNum.value = item.rot;

          }

          if (window.wpUpdateHandles) window.wpUpdateHandles();   // the gold dot swings round with the item

      });

      handle.addEventListener('pointerup', function(e) {

          if(!isRotating) return;

          isRotating = false;

          hostGestureEnd();   // fold M6

          try { handle.releasePointerCapture(e.pointerId); } catch(e){}

          var liveU = ownTokenNow(rotMapId, item.id); if (!liveU) { render(); return; }   // fold M8: nothing lands for a token no longer theirs
          item = liveU;
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item, true, rotMapId);   // final facing
          save(); render();

      });

  }



  // Default opacity for newly created items (shapes, drawings, images) —
  // set from the Opacity sliders in the shape/draw menus, persisted per install.
  state.newOpacity = (function() { var v = parseFloat(localStorage.getItem('wp_newOpacity')); return (v >= 0.1 && v < 1) ? v : 1; })();

  function newOpacityProps() {
      return (state.newOpacity != null && state.newOpacity < 1) ? { opacity: state.newOpacity } : {};
  }
  window.wpNewOpacityProps = newOpacityProps;

  // The shape menu and draw menu each carry an opacity slider; both drive the
  // same new-item default and stay in sync with each other.
  (function() {
      var sliders = Array.prototype.slice.call(document.querySelectorAll('.new-opacity-slider'));
      function syncNewOpacityUI() {
          var pct = Math.round(state.newOpacity * 100);
          sliders.forEach(function(s) { s.value = pct; });
          var a = document.getElementById('shapeOpacityVal');
          var b = document.getElementById('drawOpacityVal');
          if (a) a.textContent = pct + '%';
          if (b) b.textContent = pct + '%';
      }
      sliders.forEach(function(s) {
          s.addEventListener('input', function() {
              state.newOpacity = Math.max(0.1, Math.min(1, parseInt(this.value, 10) / 100));
              localStorage.setItem('wp_newOpacity', state.newOpacity);
              syncNewOpacityUI();
          });
          // Keep clicks on the slider from triggering menu-wide handlers
          s.addEventListener('click', function(e) { e.stopPropagation(); });
      });
      syncNewOpacityUI();
  })();

  function addWbItem(type, props) {

      var cx = (wbWrap.scrollLeft + wbWrap.clientWidth/2) / state.zoomLevel - (props.w||100)/2;

      var cy = (wbWrap.scrollTop + wbWrap.clientHeight/2) / state.zoomLevel - (props.h||100)/2;

      var item = Object.assign({

          id: 'wb'+uid(), type: type,

          x: Math.max(10,Math.round(cx)), y: Math.max(10,Math.round(cy)),

          w: 100, h: 100, z: 10, color: 'var(--panel2)'

      }, newOpacityProps(), props);

      getActiveMap().whiteboard.push(item);

      state.selWbId = item.id;

      save(); render();

  }

  window.isDrawingMode = false;
  window.isEraserMode = false;
  window.isPanMode = false;
  var _el_drawModeBtn = document.getElementById('drawModeBtn');
  var _el_moveModeBtn = document.getElementById('moveModeBtn');
  var _el_panModeBtn = document.getElementById('panModeBtn');
  var _el_eraserModeBtn = document.getElementById('eraserModeBtn');

  // [lookcheck:press-start]
  // 107, the presses (the owner, 2026-10-06, of a tool that has options: "Chevron opens them"): the icon only takes the tool, and the small arrow
  // beside it opens the tool's options, which stay up while they are wanted. Options belong to the tool in hand: another tool taken puts them away.
  var TOOL_OPTS = { drawModeBtn: 'drawMenu', eraserModeBtn: 'eraserMenu', fillModeBtn: 'fillMenu', measureModeBtn: 'measureMenu', blastModeBtn: 'blastMenu', buildModeBtn: 'buildMenu', envModeBtn: 'envMenu' };   // a tool that has options, and the menu that holds them (1.6.0: the Environment tool)
  // What a press does. part: 'icon', or 'chev' for the small arrow. inHand: the tool is the one in hand. open: its options are up. back: they are
  // up, their bar stood back under the floating boxes when the press began and a window that shows covered them (barBehind), and only true says so.
  // It answers what becomes of the tool ('take' it, put it 'away' for the arrow, or '' leave it) and of its options ('open', 'close', 'front' to
  // bring them in front of the boxes, or '' leave them). The arrow over options that stood back brings them in front and closes nothing, so one
  // press brings them back (backlog 143, F2); over options in front of the boxes it closes them. The icon's rule takes no account of where they stand
  function toolPress(part, inHand, open, back) {
      if (part === 'chev') return open ? { tool: '', opts: back === true ? 'front' : 'close' } : { tool: inHand ? '' : 'take', opts: 'open' };
      return inHand ? { tool: 'away', opts: 'close' } : { tool: 'take', opts: '' };
  }
  // Only the tool in hand keeps its options up. updateWbToolbar asks, so a tool taken by a key or by the app itself counts as well as a press
  function toolOptsOnly(activeId) {
      Object.keys(TOOL_OPTS).forEach(function(id) { if (id !== activeId) { var m = document.getElementById(TOOL_OPTS[id]); if (m) m.classList.remove('show'); } });
  }
  // [lookcheck:optsfit-start]
  // A tool's options open upward from the bar, and the style sheet caps them by the window alone (found live, 2026-10-17): in a window 700
  // high Build's ran their top rows under the top row, where no press reaches them. Up, they stop 8 px under the top row, or under its bar
  // while it is hidden, and scroll inside, as the fog menu's do (fog.js fitMenu). The cap is set whether or not they reach so far now, since
  // what they hold grows as a pick shows more rows, and they never take less than 160 px
  function optsFit(menu, doc) {
      if (!menu || !menu.style || typeof menu.getBoundingClientRect !== 'function') return;
      menu.style.maxHeight = '';
      var hd = doc && typeof doc.querySelector === 'function' ? doc.querySelector('header') : null, top = (hd ? hd.getBoundingClientRect().bottom : 0) + 8, r = menu.getBoundingClientRect();
      if (!(r && isFinite(r.bottom) && isFinite(top)) || r.bottom <= 0) return;   // not laid out: the style sheet's cap stands
      menu.style.maxHeight = Math.max(160, Math.floor(r.bottom - top)) + 'px';
  }
  // [lookcheck:optsfit-end]
  // The one wiring of a tool that has options. o: { id: its button, chev: its small arrow, inHand(), take(), sync(): bring its options up to date }
  function wireTool(o) {
      var btn = document.getElementById(o.id), chev = document.getElementById(o.chev), menu = document.getElementById(TOOL_OPTS[o.id]);
      function press(part, e) {
          var open = !!(menu && menu.classList.contains('show'));
          var p = toolPress(part, !!o.inHand(), open, open && typeof barBehind === 'function' && barBehind(menu, e) === true);
          if (p.tool === 'take') o.take();
          if (p.tool === 'away') { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }
          if (menu && p.opts === 'open') { if (o.sync) o.sync(); menu.classList.add('show'); optsFit(menu, document); }
          if (menu && p.opts === 'close') menu.classList.remove('show');
          if (menu && p.opts === 'front' && typeof barFront === 'function') barFront(menu);   // options that stood back come in front, and nothing closes
      }
      if (btn) btn.addEventListener('click', function(e) { e.stopPropagation(); press('icon', e); });
      if (chev) chev.addEventListener('click', function(e) { e.stopPropagation(); press('chev', e); });
      if (menu && typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('resize', function() { if (menu.classList.contains('show')) optsFit(menu, document); });   // up while the window changes: kept clear of the top row
  }
  // A button that only opens a menu (Shapes, Add, Fog, Scene, View, Grid) is a pair too, and the two are one control: its small arrow presses it.
  // A menu that is up while its bar stood back under the floating boxes, where a window that shows covers it, comes in front at one press of such a button or of its arrow, and of
  // Snap's arrow, whose options are its own, and nothing closes (backlog 143, F2). toolPress decides it as it does for a tool's arrow, since a
  // button that only opens a menu is the arrow of a tool always in hand. Heard on the pair in the capture phase, so such a press never reaches
  // the button's own handler, which would close the menu. A tool's own pair is wireTool's, and Snap's icon keeps its own press
  function menuFront(e, menu, chev, btn) {
      var hit = e && e.target && typeof e.target.closest === 'function' ? e.target.closest('button') : null;
      if (!hit || (hit !== chev && hit !== btn)) return false;
      var open = menu.classList.contains('show');
      if (toolPress('chev', true, open, open && typeof barBehind === 'function' && barBehind(menu, e) === true).opts !== 'front') return false;
      e.stopPropagation(); if (typeof barFront === 'function') barFront(menu);
      return true;
  }
  // A button that opens a menu and has no small arrow follows the same rule, heard by menuFront on the box that holds the button and its menu,
  // in the capture phase as a pair is (backlog 143, the review of 2026-10-17): More and Pages on the play map's bar, Link and Center on the data
  // map's. A press that brings nothing forward reaches the button's own handler, as before. A new such button joins this list
  var MENU_BTNS = { wbMoreBtn: 'wbMoreMenu', pagesBtn: 'pagesMenu', linkBtn: 'linkMenu', dataCenterBtn: 'dataCenterMenu' };   // the button, and the menu it opens
  function wireMenuArrows() {
      Array.prototype.forEach.call(document.querySelectorAll('.tool-chev[data-for]'), function(c) {
          c.addEventListener('click', function(e) { e.stopPropagation(); var b = document.getElementById(c.getAttribute('data-for')); if (b) b.click(); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('.tool-pair'), function(pair) {
          var icon = pair.querySelector('.wb-tool-btn'), chev = pair.querySelector('.tool-chev'), menu = pair.querySelector('.shape-menu');
          if (!icon || !chev || !menu || Object.prototype.hasOwnProperty.call(TOOL_OPTS, icon.id)) return;
          var forId = chev.getAttribute('data-for'), btn = forId ? document.getElementById(forId) : null;
          pair.addEventListener('click', function(e) { menuFront(e, menu, chev, btn); }, true);
      });
      Object.keys(MENU_BTNS).forEach(function(id) {
          var btn = document.getElementById(id), menu = document.getElementById(MENU_BTNS[id]), box = btn ? btn.parentElement : null;
          if (box && menu) box.addEventListener('click', function(e) { menuFront(e, menu, null, btn); }, true);
      });
  }
  wireMenuArrows();
  // [lookcheck:press-end]
  function updateWbToolbar(activeId) {
      ['moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'fillModeBtn', 'buildModeBtn', 'envModeBtn'].forEach(id => {
          var el = document.getElementById(id);
          if (el) el.classList.remove('active');
      });
      var el = document.getElementById(activeId);
      if (el) el.classList.add('active');
      // The hand tool pans no matter what it grabs — items are untouchable while it's active
      window.isPanMode = (activeId === 'panModeBtn');
      window.isFogMode = (activeId === 'fogModeBtn');   // fog paints on the board; other modes clear it
      window.isFillMode = (activeId === 'fillModeBtn');   // fill paints cells; other modes clear it
      window.isBuildMode = (activeId === 'buildModeBtn');   // Build lays pieces; other modes clear it
      window.isEnvMode = (activeId === 'envModeBtn');   // 1.6.0: the Environment tool paints a map's readings; other modes clear it
      if (window.wpEnvTool && window.wpEnvTool.draw) window.wpEnvTool.draw();   // its layer shows while it is in hand alone
      if (activeId !== 'buildModeBtn' && typeof buildDown === 'function') buildDown(activeId);   // another tool taken puts down what Build armed (its placement, its pen preset, a polygon under way)
      if (activeId !== 'eraserModeBtn' && window.wpEraserCursorHide) window.wpEraserCursorHide();
      // Per-tool cursors (style.css `body.mode-*`): the class beats every item's own cursor
      ['mode-move', 'mode-pan', 'mode-draw', 'mode-eraser', 'mode-measure', 'mode-blast', 'mode-fog', 'mode-fill', 'mode-build', 'mode-env'].forEach(function(c) { document.body.classList.remove(c); });
      document.body.classList.add('mode-' + String(activeId || 'moveModeBtn').replace('ModeBtn', ''));
      toolOptsOnly(activeId);   // 107: a tool's options belong to the tool in hand
      disarmThrow();   // a tool taken puts an armed sheet Throw down (the owed review, 2026-10-09)
  }

  var _el_drawMenu = document.getElementById('drawMenu');

  function closeDrawMenu() {
      if(_el_drawMenu) _el_drawMenu.classList.remove('show');
  }

  function syncDrawMenu() {
      var indicator = document.getElementById('drawColorIndicator');
      if(indicator) indicator.style.background = state.drawColor;
      var presetMatch = false;
      document.querySelectorAll('#drawColorRow .draw-swatch[data-color]').forEach(function(sw) {
          var on = sw.dataset.color.toLowerCase() === (state.drawColor || '').toLowerCase();
          sw.classList.toggle('active', on);
          if(on) presetMatch = true;
      });
      var customSw = document.querySelector('#drawColorRow .draw-swatch.custom');
      if(customSw) {
          customSw.classList.toggle('active', !presetMatch);
          if(!presetMatch) customSw.style.background = state.drawColor;
          else customSw.style.background = '';
      }
      document.querySelectorAll('#drawSizeRow .draw-size-btn').forEach(function(btn) {
          btn.classList.toggle('active', parseInt(btn.dataset.size) === state.drawStrokeWidth);
      });
      document.querySelectorAll('#drawStyleRow .draw-style-btn').forEach(function(btn) {
          btn.classList.toggle('active', (btn.dataset.straight === 'true') === !!state.drawStraight);
      });
      document.querySelectorAll('#drawTipRow .draw-style-btn').forEach(function(btn) { btn.classList.toggle('active', btn.dataset.nib === (state.drawTip || 'round')); });
  }

  if(_el_moveModeBtn) _el_moveModeBtn.addEventListener('click', function() {
      window.isDrawingMode = false;
      window.isEraserMode = false;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'default';
      updateWbToolbar('moveModeBtn');
      closeDrawMenu();
  });

  if(_el_panModeBtn) _el_panModeBtn.addEventListener('click', function() {
      if (window.isPanMode) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); return; }   // second click on the active tool → back to the arrow
      window.isDrawingMode = false;
      window.isEraserMode = false;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'grab';
      updateWbToolbar('panModeBtn');
      closeDrawMenu();
      var bar = document.getElementById('selToolbar');
      if (bar) bar.style.display = 'none';
  });

  wireTool({ id: 'drawModeBtn', chev: 'drawOptBtn', inHand: function() { return !!window.isDrawingMode && !window.isBuildMode; }, sync: syncDrawMenu, take: function() {
      window.isDrawingMode = true;
      window.isEraserMode = false;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('drawModeBtn');
      state.selWbId = null; render();
  } });

  /* Eraser size (radius, board px) is a local preference; the circle that
     follows the pointer in eraser mode shows exactly what a click will touch. */
  var _el_eraserMenu = document.getElementById('eraserMenu');
  try { var _es = parseInt(localStorage.getItem('wp_eraserSize'), 10); state.eraserSize = (_es >= 2 && _es <= 40) ? _es : 6; } catch (e) { state.eraserSize = 6; }
  try { var _em = localStorage.getItem('wp_eraserMode'); state.eraserMode = (_em === 'segment') ? 'segment' : 'precise'; } catch (e) { state.eraserMode = 'precise'; }
  function syncEraserMenu() {
      var r = document.getElementById('eraserSize'), v = document.getElementById('eraserSizeVal');
      if (r) r.value = state.eraserSize;
      if (v) v.textContent = state.eraserSize + ' px';
      document.querySelectorAll('.eraser-mode-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.emode === state.eraserMode); });
  }
  document.querySelectorAll('.eraser-mode-btn').forEach(function(b) {
      b.addEventListener('click', function(e) {
          e.stopPropagation();
          state.eraserMode = this.dataset.emode === 'segment' ? 'segment' : 'precise';
          try { localStorage.setItem('wp_eraserMode', state.eraserMode); } catch (err) {}
          syncEraserMenu();
          toast(state.eraserMode === 'precise' ? 'Precise eraser: trims strokes exactly to the circle.' : 'Segment eraser: removes whole segments it touches.');
      });
  });
  var _el_eraserSize = document.getElementById('eraserSize');
  if (_el_eraserSize) {
      _el_eraserSize.addEventListener('input', function() {
          state.eraserSize = Math.max(2, Math.min(40, parseInt(this.value, 10) || 6));
          try { localStorage.setItem('wp_eraserSize', state.eraserSize); } catch (e) {}
          syncEraserMenu();
          eraserCursorAt(null, null, true);
      });
      ['pointerdown', 'click'].forEach(function(ev) { _el_eraserMenu && _el_eraserMenu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
  }
  wireTool({ id: 'eraserModeBtn', chev: 'eraserOptBtn', inHand: function() { return !!window.isEraserMode; }, sync: syncEraserMenu, take: function() {
      window.isDrawingMode = false;
      window.isEraserMode = true;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'none';   // the size circle is the cursor
      updateWbToolbar('eraserModeBtn');
      closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  } });

  // The eraser circle lives inside the scaled whiteboard so it tracks zoom.
  var _eraserCursor = null, _eraserLast = null;
  function eraserCursorAt(wx, wy, keep) {
      var wbEl = document.getElementById('whiteboard');
      if (!wbEl) return;
      if (!_eraserCursor) {
          _eraserCursor = document.createElement('div');
          _eraserCursor.id = 'eraserCursor';
          wbEl.appendChild(_eraserCursor);
      } else if (_eraserCursor.parentNode !== wbEl) wbEl.appendChild(_eraserCursor);
      if (wx == null) { if (!keep || !_eraserLast) { _eraserCursor.style.display = 'none'; return; } wx = _eraserLast[0]; wy = _eraserLast[1]; }
      _eraserLast = [wx, wy];
      var r = state.eraserSize || 6;
      _eraserCursor.style.display = window.isEraserMode ? 'block' : 'none';
      _eraserCursor.style.left = (wx - r) + 'px';
      _eraserCursor.style.top = (wy - r) + 'px';
      _eraserCursor.style.width = (r * 2) + 'px';
      _eraserCursor.style.height = (r * 2) + 'px';
      _eraserCursor.style.borderWidth = (1.5 / (state.zoomLevel || 1)) + 'px';
  }
  window.wpEraserCursorHide = function() { if (_eraserCursor) _eraserCursor.style.display = 'none'; };
  if (wbWrap) {
      wbWrap.addEventListener('pointermove', function(e) {
          if (!window.isEraserMode) { if (_eraserCursor && _eraserCursor.style.display !== 'none') _eraserCursor.style.display = 'none'; return; }
          var box = wbWrap.getBoundingClientRect();
          eraserCursorAt((e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel);
      });
      wbWrap.addEventListener('pointerleave', function() { if (_eraserCursor) _eraserCursor.style.display = 'none'; });
  }

  /* ---- image frame fitting ----
     Images draw with object-fit: contain, so a box with the wrong proportions
     leaves invisible margins the handles still measure. On load, a non-token
     image whose box is off by more than 1.5% gets its height corrected once
     (`fit` flag) and proportion lock switched on, unless the GM already chose. */
  function fitImageBox(id, img) {
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
      var am = getActiveMap();
      var it = am && am.type === 'map' && (am.whiteboard || []).find(function(x) { return x.id === id; });
      if (!it || it.type !== 'image' || it.fit || it.isChar || !img.naturalWidth || !img.naturalHeight) return;
      var want = img.naturalWidth / img.naturalHeight;
      var have = (it.w || 100) / (it.h || 100);
      it.fit = true;
      if (Math.abs(have - want) / want > 0.015) {
          it.h = Math.max(10, Math.round((it.w || 100) / want));
          if (it.lockRatio === undefined) it.lockRatio = true;
          save(); render();
      }
  }

  // The token the table assigned to a player: on the current map if they have one here, else
  // wherever it is in the campaign (a player targeting from another map still shows their face).
  // The player of a kept character (its token has no owner: the GM moves it), for presence — never an NPC's or an unassigned character's
  function keptOwnerOf(w) {
      var camp = getActiveCampaign(), cs = camp && camp.chars, c = w && w.charId && cs && Object.prototype.hasOwnProperty.call(cs, w.charId) ? cs[w.charId] : null;
      return c && typeof c === 'object' && !c.npc && typeof c.ownerId === 'string' ? c.ownerId : '';
  }
  var TARGET_COVER_GLYPH = { 'Half cover': '\u00bd', 'Three-quarters cover': '\u00be', 'Total cover': '\u25a0', 'Cover': '\u25d0' };   // cover follow-ups: the tag beside a target mark (the tier's name in its title)
  // The token a targeter acts from on a map: the picture token their mark's face shows (their character's before a pet), else any token of
  // theirs (their character's first). Cover follow-ups: the target mark's cover tag measures from this same token
  function targeterTok(pid, m) {
      if (typeof pid === 'string' && pid.indexOf('tk:') === 0) { var tkId = pid.slice(3); return (m && m.type === 'map' ? (m.whiteboard || []) : []).find(function(w) { return !!w && w.id === tkId && w.isChar; }) || null; }   // 158: one of the GM's characters, by its own token
      var own = (m && m.type === 'map' ? (m.whiteboard || []) : []).filter(function(w) { return w.isChar && w.ownerId === pid; }), pic = function(w) { return w.type === 'image' && w.src; };
      return own.find(function(w) { return pic(w) && w.charId; }) || own.find(pic) || own.find(function(w) { return w.charId; }) || own[0] || null;
  }
  function targeterToken(pid) {
      var camp = getActiveCampaign(); if (!camp) return null;
      var am = getActiveMap();
      var find = function(m) { var w = targeterTok(pid, m); return w && w.type === 'image' && w.src ? w : null; };   // their character before a pet (158: or the GM's character itself)
      var t = find(am);
      if (!t) { var ids = Object.keys(camp.items); for (var i = 0; i < ids.length && !t; i++) t = find(camp.items[ids[i]]); }
      return t ? { src: t.src, name: t.charName || t.name || '' } : null;
  }
  /* ---- party strip ----
     Every player's character as a small token in the corner of the play map. The ones on the
     map you are viewing are highlighted; while hosting, a player who is not connected is dimmed.
     Click one to jump to that character: their map (if different), centred on them at 150%. */
  var FOCUS_ZOOM = 1.5;
  function wbHashHue(s) { var h = 0, t = String(s); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return ((h % 360) + 360) % 360; }   // a stable per-key hue for the no-picture silhouette default
  function renderPartyStrip() {
      if (window.wpJoinCard) window.wpJoinCard.check();   // Onboarding F1a: a player's join card follows their waiting token
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      var camp = getActiveCampaign(), am = getActiveMap();
      if (!camp || !am || am.type !== 'map' || state.viewMode !== 'visual') { strip.innerHTML = ''; strip.dataset.sig = ''; return; }
      var list = characterList(camp, true, am.id, function(pid) { return playerNow(camp, pid); }).map(function(c) { return chipPlace(camp, c); });   // a player's chip is the token on the map they are on
      // [sinkcheck:partyface-start]
      list.forEach(function(c) { if (c.src || !c.face || !window.wpNet || !window.wpNet.faceView || !window.wpNet.cleanFace || !window.wpNet.cleanFace(c.face)) return; var fvT = window.wpNet.faceView({ face: c.face }, cssColor(c.tcolor || '#4db3d3')); if (fvT.emoji) c.emoji = fvT.emoji; else if (fvT.img) { c.src = fvT.img; c.avatar = true; } });   // Onboarding F1c: a character's own face (an emoji, a bundled picture, the default in its token's colour)
      // [sinkcheck:partyface-end]
      var hosting = window.wpNet && window.wpNet.active && window.wpNet.role === 'host';
      var atTable = window.wpNet && window.wpNet.active && (hosting || window.wpNet.role === 'client');   // players see the party too, read-only
      var present = {};
      if (atTable) Object.values(window.wpNet.roster || {}).forEach(function(p) { if (p && p.id) present[p.id] = true; });
      strip.dataset.tip = atTable && !hosting
          ? 'The party — everyone at the table. The highlighted ones are on this map: click to find them, right-click to target.'
          : 'Your players\' characters. Click one to jump to them; right-click for more (summon). The highlighted ones are on this map.';
      // Connected players without a token yet: their table picture, or a chip with their name
      if (atTable) {
          var owned = {}; list.forEach(function(c) { if (c.ownerId) owned[c.ownerId] = true; });
          Object.values(window.wpNet.roster || {}).forEach(function(p) {
              if (!p || !p.id || owned[p.id]) return;
              var avOk = !!(window.wpNet && window.wpNet.safeAvatar && window.wpNet.safeAvatar(p.avatar));   // the whole data URL (net.js)
              var fvP = window.wpNet && window.wpNet.faceView ? window.wpNet.faceView(p, p.color || '#4db3d3') : null;   // the waiting token's colour when they have none   // Onboarding F1b: their chosen face
              var locMap = p.location && camp.items[p.location];
              list.push({ key: 'p:' + p.id, ownerId: p.id, tokId: null, name: p.name || 'Player', src: fvP ? (fvP.img || null) : (avOk ? p.avatar : null), emoji: fvP && fvP.emoji ? fvP.emoji : null, avatar: true, color: p.color || null, waiting: !!(window.wpSystemCore && window.wpSystemCore.waitingTokensOf && window.wpSystemCore.waitingTokensOf(camp, p.id).length),
                          mapId: p.location || null, map: locMap && locMap.meta && locMap.meta.title || 'no map yet', noToken: true });
          });
      }
      // Onboarding F3 (the GM's): by the chip's player — one of theirs waiting for Keep it, one unlocked for them, one they are making (the
      // flagged character may be kept, with no token of its own, while the chip is the token of the one they play: the tip names it)
      if (hosting && camp.chars) list.forEach(function(c) {
          var hit = function(k) { var found = null; if (c.ownerId) Object.keys(camp.chars).some(function(id) { var x = camp.chars[id]; if (x && typeof x === 'object' && !x.npc && x.ownerId === c.ownerId && x[k] === 1) { found = x; return true; } return false; }); return found; };
          var fx = hit('review'), fl = fx ? 'review' : (fx = hit('unlocked')) ? 'unlocked' : (fx = hit('making')) ? 'making' : '';
          c.flag = fl; c.flagName = fx && typeof fx.name === 'string' ? fx.name : '';
      });
      var sig = list.map(function(c) { return c.key + (c.flag ? '~' + c.flag + '~' + c.flagName : '') + (c.waiting ? '~w' : '') + (c.emoji ? '~' + c.emoji : '') + '|' + c.name + '|' + c.mapId + '|' + (c.src ? c.src.length + c.src.slice(-16) : '') + '|' + (atTable ? (present[c.ownerId] ? 1 : 0) : 2) + '|' + (window.wpSheets && c.tokId ? window.wpSheets.hoverLinesForTokenId(camp, c.tokId).join(',') : '') + '|' + (hosting && c.ownerId && window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(c.ownerId) ? 'P' : ''); }).join(';') + '#' + am.id;
      if (strip.dataset.sig === sig) return;
      strip.dataset.sig = sig;
      strip.innerHTML = list.map(function(c) {
          var here = c.mapId === am.id;
          var away = atTable && c.ownerId && !present[c.ownerId];
          var pausedC = hosting && c.ownerId && window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(c.ownerId);
          var cls = 'party-tok' + (here ? ' here' : '') + (away ? ' away' : '') + (pausedC ? ' paused' : '') + (c.waiting ? ' party-waiting' : '') + (c.flag ? ' party-' + c.flag : '');
          var tip = c.name + (here ? ' \u2014 on this map' : ' \u2014 on ' + c.map) + (away ? ' (player not connected)' : '') + (pausedC ? ' \u2014 PAUSED by you' : '') + (c.flag === 'making' ? ' \u2014 making ' + (c.flagName || 'a character') : c.flag === 'review' ? ' \u2014 ' + (c.flagName || 'a character') + ' is new: review it on its sheet' : c.flag === 'unlocked' ? ' \u2014 ' + (c.flagName || 'a character') + ' is unlocked for its player' : '') + (c.noToken ? (c.waiting ? ' \u2014 waiting for a character' : ' \u2014 no token yet') : '') + (atTable && !hosting ? (here ? '. Click to find them.' : '') : '. Click to jump to them.');
          if (window.wpSheets && c.tokId) { var hlT = window.wpSheets.hoverLinesForTokenId(camp, c.tokId); if (hlT.length) tip += String.fromCharCode(10) + hlT.join(' · '); }
          if (c.emoji) return '<span class="' + cls + ' party-face party-emoji" data-key="' + esc(c.key) + '" data-tip="' + esc(tip) + '">' + esc(c.emoji) + '</span>';   // Onboarding F1b: an emoji face (pictographic only, net.js cleanFace)
          if (c.src) return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + esc(c.avatar ? c.src : resolveImg(c.src)) + '" alt="" data-tip="' + esc(tip) + '">';
          var pcol = c.color || ('hsl(' + wbHashHue(c.key) + ',55%,55%)');   // no picture → the color-tinted silhouette default
          return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(pcol) : '') + '" alt="" data-tip="' + esc(tip) + '">';
      }).join('');
  }
  window.wpRenderPartyStrip = renderPartyStrip;
  // Onboarding F1a: a waiting token the GM deletes (any route) stays away for the rest of the session
  window.wpWaitingGone = function(items) { (items || []).forEach(function(x) { if (x && x.waiting && window.wpNet && window.wpNet.noWaiting) window.wpNet.noWaiting(x.ownerId); }); };
  // Onboarding F1a: the join card (index.html #joinCard) — status only for now (text through textContent)
  (function() {
      var had = '', dismissed = false;
      function mine() { var n = window.wpNet, camp = getActiveCampaign(); if (!n || !n.active || n.role !== 'client' || window.wpStream || !camp || !window.wpSystemCore || !window.wpSystemCore.waitingTokensOf) return null; return window.wpSystemCore.waitingTokensOf(camp, n.myId)[0] || null; }
      // Onboarding F3: the character they are making (their own copy), and whether making one is open to them here (the GM's rules)
      function making() { var n = window.wpNet, camp = getActiveCampaign(); if (!n || !n.active || n.role !== 'client' || window.wpStream || !camp || !camp.chars) return null; var id = Object.keys(camp.chars).find(function(k) { var c = camp.chars[k]; return c && c.ownerId === n.myId && !c.partial && c.making === 1; }); return id ? camp.chars[id] : null; }
      function rules() { var camp = getActiveCampaign(), S = window.wpSystemCore; if (!camp || !S || !S.newCharRules) return null; var on = !window.wpVtt || !window.wpVtt.rulesOn || window.wpVtt.rulesOn('sheets') !== false; return S.newCharRules(camp, on); }
      function canMake() { var r = rules(); return !!(r && r.create === 'live' && window.wpSheets && window.wpSheets.startMaking); }
      function canToken() { var r = rules(); return !!(r && r.justToken && window.wpNet && window.wpNet.charToken); }   // Onboarding F3b: Just a token (it follows making; always without sheets)
      function canFile() { var r = rules(); return !!(r && r.create === 'live' && r.fromFile && window.wpSheets && window.wpSheets.startFromFile); }   // Onboarding F4b: start one from a file (where making is open and the table lets them)
      // Onboarding F3: with no waiting token (the GM's rule gives none, or removed theirs) a player who has no character of theirs and no token
      // may still make one; the card then shows by itself only where the rule gives no waiting token (a Remove never brings it back unasked)
      function bare() {
          var n = window.wpNet, camp = getActiveCampaign(); if (!n || !n.active || n.role !== 'client' || window.wpStream || !camp || !(canMake() || canToken())) return false;
          var cs = camp.chars || {}; if (Object.keys(cs).some(function(k) { var c = cs[k]; return c && c.ownerId === n.myId && !c.partial && !c.npc; })) return false;
          return !Object.keys(camp.items || {}).some(function(id) { var m = camp.items[id]; return m && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { return w && w.isChar && w.ownerId === n.myId; }); });
      }
      function bareAuto() { var camp = getActiveCampaign(), S = window.wpSystemCore; return !!(camp && S && S.newPlayerRules && S.newPlayerRules(camp).token === 'off'); }
      function text(t, mk) {
          var st = document.getElementById('joinCardStatus'), camp = getActiveCampaign(), m = t && camp && camp.items[t.mapId], mkOk = !mk && canMake(), jtOk = !mk && canToken();
          if (st) st.textContent = mk ? 'You are making ' + mk.name + ' \u2014 open it to fill it in, then press Done on its sheet.' : (t ? 'You don\u2019t have a character yet. Your token is waiting on ' + ((m && m.meta && m.meta.title) || 'the map') + ' \u2014 move it about; ' : 'You don\u2019t have a character yet \u2014 ') + (mkOk ? (t ? 'make a character' : 'make one') + ', or wait for your GM to give you one.' : jtOk ? 'take a token of your own, or wait for your GM to give you one.' : t ? 'your GM will give you a character.' : 'your GM will give you one.');
          var bm = document.getElementById('joinCardMake'), bo = document.getElementById('joinCardOpen'), bf = document.getElementById('joinCardFaceBtn'), bj = document.getElementById('joinCardToken'), bfl = document.getElementById('joinCardFile');
          if (bm) bm.style.display = mkOk ? '' : 'none';
          if (bfl) bfl.style.display = mkOk && canFile() ? '' : 'none';
          if (bj) bj.style.display = jtOk ? '' : 'none';
          if (bo) { bo.style.display = mk ? '' : 'none'; if (mk) bo.textContent = 'Open ' + mk.name; }
          if (bf) bf.style.display = t ? '' : 'none';   // its face is the waiting token's
      }
      function has() { return !!(mine() || making() || bare()); }
      // Onboarding F3b: Just a token — a name (their table name to start with); they play at once with the face they chose
      function justToken() {
          var n = window.wpNet; if (!n || !n.charToken) return;
          var prof = n.getProfile ? n.getProfile() : {};
          showPrompt('A name for your token', (prof && typeof prof.name === 'string' && prof.name) || '', function(nm) {
              if (nm === null || nm === undefined) return;
              var r = n.charToken(String(nm), function(a) { toast(a.error || (a.charId ? 'You play at once \u2014 its sheet is yours to fill in when you like (press Done when it is finished).' : 'You play at once with your own token.')); });
              if (r && r.error) toast(r.error);
          });
      }
      function show() { var card = document.getElementById('joinCard'), t = mine(), mk = making(); if (!card) return; if (!t && !mk && !bare()) { card.style.display = 'none'; return; } text(t, mk); dismissed = false; card.style.display = ''; }   // their right-click or their chip's menu: always
      function check() {
          var t = mine(), mk = making(), card = document.getElementById('joinCard'); if (!card) return;
          var key = mk ? 'm:' + mk.id : t ? 'w' : bare() ? 'n' : '';
          if (!key) { card.style.display = 'none'; had = ''; dismissed = false; return; }   // nothing waiting, nothing being made, nothing to make: the next one shows the card again
          text(t, mk);   // the map it waits on, the name it is made under, kept current
          if (had !== key) { had = key; dismissed = false; if (key !== 'n' || bareAuto()) card.style.display = ''; }
      }
      window.wpJoinCard = { show: show, check: check, has: has };
      document.addEventListener('click', function(e) {
          var tg = e.target; if (!tg || !tg.closest) return;
          if (tg.closest('#joinCardMake')) { if (window.wpSheets && window.wpSheets.startMaking) window.wpSheets.startMaking(); return; }
          if (tg.closest('#joinCardToken')) { justToken(); return; }
          if (tg.closest('#joinCardFile')) { if (window.wpSheets && window.wpSheets.startFromFile) window.wpSheets.startFromFile(); return; }
          if (tg.closest('#joinCardOpen')) { var mk = making(); if (mk && window.wpSheets && window.wpSheets.openSheet) window.wpSheets.openSheet(mk.id); }
      });
      document.addEventListener('click', function(e) { if (e.target.closest && e.target.closest('#joinCardClose')) { var card = document.getElementById('joinCard'); if (card) card.style.display = 'none'; dismissed = true; } });
  })();
  // Onboarding F1a: a player's waiting token, for their chip ('p:' key) — { map, tok } or null
  function waitingLoc(camp, key) {
      if (typeof key !== 'string' || key.charAt(0) !== 'p' || !window.wpSystemCore || !window.wpSystemCore.waitingTokensOf) return null;
      var t = window.wpSystemCore.waitingTokensOf(camp, key.slice(2))[0];
      return t && camp.items[t.mapId] ? { map: camp.items[t.mapId], tok: t.w } : null;
  }
  // [systemcheck:charnow-start]
  /* Where a character is NOW, for the party's Jump, its chips, their menu and the stream window's follow. A player's character ('o:' key) is on the
     map that player is on: at a table their app's own place, after they left the place they were last seen (net.whereIs). Of their tokens there
     the one of the character they play comes first; the map on screen comes after that map. `sure` says a token of theirs on any other map is
     not where they are: always on a player's app (it draws no such token), on the GM's only while that player is connected (the GM may have
     moved a token since they left), never in the stream window. Anything else, and a player nobody can place, is found as it always was. */
  function playerNow(camp, pid) {
      var n = window.wpNet, S = window.wpSystemCore, w = n && n.whereIs ? n.whereIs(pid) : null, isMap = function(id) { return typeof id === 'string' && !!camp && !!camp.items && Object.prototype.hasOwnProperty.call(camp.items, id) && !!camp.items[id] && camp.items[id].type === 'map'; };
      var client = !!(n && n.active && n.role === 'client' && !n.stream);
      var at = client && pid === n.myId && isMap(camp.activeItemId) ? camp.activeItemId : w && isMap(w.map) ? w.map : null;   // a player's own place is the map on their screen
      var plays = S && S.activeCharOf && camp && camp.chars ? S.activeCharOf(camp, pid).id : null;
      return { map: at, char: typeof plays === 'string' && plays ? plays : null, sure: !!(at && n && n.active && !n.stream && (client || (w && w.live === true))) };
  }
  function charNow(camp, key) {
      if (!camp || typeof key !== 'string' || !key) return { loc: null, left: null, at: null, sure: false };
      var who = key.charAt(0) === 'o' ? playerNow(camp, key.slice(2)) : null;
      var loc = locateCharacter(camp, key, camp.activeItemId, who), left = null;
      if (who && who.sure && loc && loc.map.id !== who.map) { left = loc; loc = null; }   // a token they left behind on another map: its name and its sheet, never their place
      return { loc: loc, left: left, at: who ? who.map : null, sure: !!(who && who.sure) };
  }
  // a chip whose player is on a map with no token of theirs says that map, never the one a token was left on
  function chipPlace(camp, c) {
      var pn = c && c.ownerId ? playerNow(camp, c.ownerId) : null;
      if (pn && pn.sure && c.mapId !== pn.map) { c.mapId = pn.map; c.map = (camp.items[pn.map].meta && camp.items[pn.map].meta.title) || pn.map; }
      return c;
  }
  window.wpPlayerNow = playerNow; window.wpCharNow = charNow;
  // [systemcheck:charnow-end]
  function focusCharacter(key) {
      var camp = getActiveCampaign(); if (!camp) return;
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && !window.wpStream) {
          var amC = getActiveMap(), nowC = charNow(camp, key), locC = nowC.loc || waitingLoc(camp, key);
          if (!locC) {
              var plC = Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === key.slice(2); });
              var atC = nowC.at || (plC && plC.location), whereC = atC && camp.items[atC] ? (camp.items[atC].meta || {}).title : null;
              toast(((nowC.left && (nowC.left.tok.charName || nowC.left.tok.name)) || (plC && plC.name) || 'They') + (whereC ? ' is on ' + whereC + '.' : ' is not on any map right now.'));
              return;
          }
          var nameC = locC.tok.charName || locC.tok.name || 'They';
          if (!amC || locC.map.id !== amC.id) { toast(nameC + ' is on ' + ((locC.map.meta || {}).title || 'another map') + '.'); return; }
          amC.meta = amC.meta || {};
          amC.meta.lastWbX = locC.tok.x + (locC.tok.w || 60) / 2; amC.meta.lastWbY = locC.tok.y + (locC.tok.h || 52) / 2; amC.meta.lastWbZoom = FOCUS_ZOOM;
          render();
          if (window.appRestoreCamera) window.appRestoreCamera();
          toast('Found ' + nameC + '.');
          return;
      }
      var wlG = waitingLoc(camp, key);
      if (key.charAt(0) === 'p' && !wlG) {
          // a player with no token yet: go to the map they are on
          var pl = Object.values((window.wpNet && window.wpNet.roster) || {}).find(function(p) { return p && p.id === key.slice(2); });
          if (!pl || !pl.location || !camp.items[pl.location]) { toast((pl && pl.name || 'That player') + ' has no token and no map yet.'); return; }
          if (camp.activeItemId !== pl.location) { camp.activeItemId = pl.location; updateSidebarNav(); }
          state.viewMode = 'visual'; render();
          if (window.appRestoreCamera) window.appRestoreCamera();
          save();
          toast(pl.name + ' is on this map but has no token yet \u2014 give them one from a character token\'s Properties.');
          return;
      }
      var nowG = wlG ? null : charNow(camp, key), loc = wlG || nowG.loc;
      if (!loc && nowG && nowG.sure) {
          // their player is on a map with no token of theirs to show: that map, never a token they left behind on another
          if (camp.activeItemId !== nowG.at) { camp.activeItemId = nowG.at; updateSidebarNav(); }
          state.viewMode = 'visual'; render();
          if (window.appRestoreCamera) window.appRestoreCamera();
          save();
          toast(((nowG.left && (nowG.left.tok.charName || nowG.left.tok.name)) || 'That player') + ' is on this map, with no token of theirs to show.');
          return;
      }
      if (!loc) { toast('That character is not on any map right now.'); return; }
      if (camp.activeItemId !== loc.map.id) { camp.activeItemId = loc.map.id; updateSidebarNav(); }
      state.viewMode = 'visual';
      loc.map.meta = loc.map.meta || {};
      loc.map.meta.lastWbX = loc.tok.x + (loc.tok.w || 60) / 2;
      loc.map.meta.lastWbY = loc.tok.y + (loc.tok.h || 52) / 2;
      loc.map.meta.lastWbZoom = FOCUS_ZOOM;
      state.selWbId = loc.tok.id; state.selWbIds = [loc.tok.id];
      render();
      if (window.appRestoreCamera) window.appRestoreCamera();
      save();
      toast('Focused on ' + (loc.tok.charName || loc.tok.name || 'the character') + '.');
  }
  window.wpFocusCharacter = focusCharacter;
  (function wirePartyStrip() {
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      strip.addEventListener('click', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok) return;
          if (strip.dataset.justDragged) return;   // that was a drag onto the map, not a click
          e.stopPropagation();
          if (window.wpStream && window.wpStreamFocusChar) { window.wpStreamFocusChar(tok.dataset.key); return; }
          focusCharacter(tok.dataset.key);
      });
      strip.addEventListener('pointerdown', function(e) { e.stopPropagation(); });   // never starts a pan or a selection box
      // Right-click: the character's actions
      // Bring a strip entry to a point on the active map: a player's character (o:/p: keys) through
      // bringPlayerHere, a GM-run character (i: key) by moving its token.
      function bringKeyHere(key, x, y) {
          var kind = key.charAt(0), camp = getActiveCampaign(), am = getActiveMap();
          if (!camp || !am || am.type !== 'map') { toast('Open a play map first.'); return; }
          if (kind === 'o' || kind === 'p') { window.wpNet.bringPlayerHere(key.slice(2), x, y); return; }
          var loc = locateCharacter(camp, key, camp.activeItemId); if (!loc) return;
          var tok = loc.tok;
          if (loc.map !== am) { loc.map.whiteboard = (loc.map.whiteboard || []).filter(function(w) { return w !== tok; }); am.whiteboard = am.whiteboard || []; am.whiteboard.push(tok); if (window.wpSystemCore && window.wpSystemCore.shapeStandIn) window.wpSystemCore.shapeStandIn(tok, am); }   // brought from another map: this map's cell shape
          tok.x = x - (tok.w || 60) / 2; tok.y = y - (tok.h || 52) / 2;
          if (window.wpSeatCell) window.wpSeatCell(tok, am); else if (window.wpSeatHex) window.wpSeatHex(tok, am);
          if (loc.map !== am && window.wpHistBarrier) window.wpHistBarrier([loc.map.id, am.id]);   // a move between two maps: neither side can be undone past it
          import('./io.js').then(function(m) { m.save(true); if (window.appRender) window.appRender(); m.toast((tok.charName || tok.name || 'Character') + (loc.map !== am ? ' brought over.' : ' moved.')); });
      }
      var pDrag = null;   // { key, sx, sy, ghost, moved }
      strip.addEventListener('pointerdown', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok || e.button !== 0) return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
          e.preventDefault();   // no native image drag (it would cancel the pointer sequence)
          pDrag = { key: tok.dataset.key, sx: e.clientX, sy: e.clientY, src: tok.tagName === 'IMG' ? tok.getAttribute('src') : null, label: tok.textContent, emoji: tok.classList.contains('party-emoji'), ghost: null, moved: false };
      });
      document.addEventListener('pointermove', function(e) {
          if (!pDrag) return;
          if (!pDrag.moved && Math.hypot(e.clientX - pDrag.sx, e.clientY - pDrag.sy) < 6) return;
          if (!pDrag.ghost) {
              var g = document.createElement(pDrag.src ? 'img' : 'span');
              if (pDrag.src) g.src = pDrag.src; else g.textContent = pDrag.label;
              g.className = 'party-drag-ghost' + (pDrag.emoji ? ' emoji' : '');   // Onboarding F1b: an emoji face stays readable while dragged
              document.body.appendChild(g); pDrag.ghost = g; pDrag.moved = true;
              document.body.classList.add('party-dragging');
          }
          pDrag.ghost.style.left = (e.clientX - 18) + 'px'; pDrag.ghost.style.top = (e.clientY - 18) + 'px';
      });
      document.addEventListener('pointercancel', function() { if (!pDrag) return; if (pDrag.ghost) pDrag.ghost.remove(); pDrag = null; document.body.classList.remove('party-dragging'); });
      document.addEventListener('pointerup', function(e) {
          if (!pDrag) return;
          var d = pDrag; pDrag = null;
          if (d.ghost) d.ghost.remove();
          document.body.classList.remove('party-dragging');
          if (!d.moved) return;   // a plain click: the click handler jumps
          var wrap = document.getElementById('whiteboardWrap'); if (!wrap) return;
          var wr = wrap.getBoundingClientRect();
          if (e.clientX < wr.left || e.clientX > wr.right || e.clientY < wr.top || e.clientY > wr.bottom) return;
          var z = state.zoomLevel || 1;
          bringKeyHere(d.key, (e.clientX - wr.left + wrap.scrollLeft) / z, (e.clientY - wr.top + wrap.scrollTop) / z);
          strip.dataset.justDragged = '1'; setTimeout(function() { delete strip.dataset.justDragged; }, 300);
      });
      var menu = document.getElementById('partyMenu');
      function closePartyMenu() { if (menu) menu.classList.remove('show'); }
      strip.addEventListener('contextmenu', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok || !menu) return;
          e.preventDefault(); e.stopPropagation();
          openPartyMenu(tok.dataset.key, e.clientX, e.clientY);
      });
      // A chip's menu; the GM's right-click on a player's waiting token opens the same one (Onboarding F1a)
      function openPartyMenu(key, cx, cy) {
          if (!menu) return;
          var cmOld = document.getElementById('contextMenu'); if (cmOld) cmOld.style.display = 'none';   // an item menu left open never sits beside this one
          var camp = getActiveCampaign(); var am = getActiveMap();
          var isPlayerOnly = key.charAt(0) === 'p';
          var nowM = isPlayerOnly ? null : charNow(camp, key), loc = nowM ? nowM.loc || nowM.left : null;   // the token the rows act on: where they are, else one they left behind (its name, its sheet)
          var atM = nowM && nowM.loc ? nowM.loc.map : nowM && nowM.sure ? camp.items[nowM.at] : null;   // the map they are on, when anyone can say
          var ownerId = (key.charAt(0) === 'o' || isPlayerOnly) ? key.slice(2) : null;
          var rosterP = ownerId && window.wpNet && Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === ownerId; });
          var waitN = ownerId && window.wpSystemCore && window.wpSystemCore.waitingTokensOf ? window.wpSystemCore.waitingTokensOf(camp, ownerId)[0] : null;   // Onboarding F1a: a player away inside the grace has only their waiting token's name
          var name = loc ? (loc.tok.charName || loc.tok.name || 'this character') : (rosterP && rosterP.name) || (waitN && waitN.w.name) || 'this player';
          var hosting = window.wpNet && window.wpNet.active && window.wpNet.role === 'host';
          var connected = hosting && ownerId && window.wpNet.isConnected(ownerId);
          var here = !!(atM && am && atM.id === am.id);
          var items = [];
          var whereName = atM ? (atM.meta && atM.meta.title || 'their map') : (rosterP && rosterP.location && camp.items[rosterP.location] && camp.items[rosterP.location].meta && camp.items[rosterP.location].meta.title) || 'their map';
          var isClientM = window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && !window.wpStream;
          if (isClientM && !here) items.push({ act: 'none', label: name + ' \u2014 on ' + whereName, dim: true });
          else items.push({ act: 'jump', label: '\uD83C\uDFAF ' + (isClientM ? 'Find ' : 'Jump to ') + name + (here ? '' : ' (' + whereName + ')') });
          if (hosting && ownerId) {
              var stagedId = window.wpNet.stagedMapId ? window.wpNet.stagedMapId() : null;
              var viewingOther = am && am.type === 'map' && stagedId && stagedId !== am.id;   // GM is looking at a different map than the table's pinned one
              var amTitle = (am && am.meta && am.meta.title) || 'this map';
              var stagedTitle = (stagedId && camp.items[stagedId] && camp.items[stagedId].meta && camp.items[stagedId].meta.title) || null;
              var tableSfx = (viewingOther && stagedTitle) ? ' (' + stagedTitle + ')' : '';
              items.push(connected
                  ? { act: 'summon', label: '\uD83D\uDCE3 Summon ' + name + ' to the table\'s map' + tableSfx }
                  : { act: 'none', label: '\uD83D\uDCE3 Summon ' + name + ' \u2014 not connected', dim: true });
              if (viewingOther && connected) items.push({ act: 'summonHere', label: '\uD83D\uDCE3 Summon ' + name + ' to this map (' + amTitle + ')' });
              items.push({ act: 'summonAll', label: '\uD83D\uDCE3 Summon everyone to the table\'s map' + tableSfx });
              if (viewingOther) items.push({ act: 'summonAllHere', label: '\uD83D\uDCE3 Summon everyone to this map (' + amTitle + ')' });
              var waitT = ownerId && window.wpSystemCore && window.wpSystemCore.waitingTokensOf ? window.wpSystemCore.waitingTokensOf(camp, ownerId)[0] : null;   // Onboarding F1a
              if (waitT) { items.push({ act: 'waitHide', label: (waitT.w.hidden ? '\uD83D\uDC41 Show ' : '\uD83D\uDE48 Hide ') + name + '\u2019s waiting token' }); items.push({ act: 'waitRemove', label: '\u2716 Remove ' + name + '\u2019s waiting token (for this session)' }); }
              if (!window.wpStream && window.wpNet.targets && Object.prototype.hasOwnProperty.call(window.wpNet.targets, ownerId) && window.wpNet.targets[ownerId] && typeof window.wpNet.clearTargetOf === 'function') items.push({ act: 'clearTarget', label: '\u25EF Clear ' + name + '\u2019s target' });   // 1.5.9: the GM takes a player's pointer off (the label through esc, as every row's)
              if (connected) {
                  var pausedP = window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(ownerId);
                  items.push({ act: pausedP ? 'unpausePlayer' : 'pausePlayer', label: (pausedP ? '\u25B6\uFE0F Resume ' : '\u23F8\uFE0F Pause ') + name + ' (just this player)' });
              }
          }
          var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
          if (!isClient && am && am.type === 'map' && !(hosting && connected)) items.push({ act: 'bring', label: '\u27A4 Bring ' + name + ' here (this map)' });
          if (window.wpNet && window.wpNet.active && !hosting && !window.wpStream) items.push({ act: 'target', label: '\u25CE Target ' + name });
          if (loc && loc.tok && window.wpSheets && (!isClient ? true : (loc.tok.charId && window.wpSheets.canOpen(loc.tok.charId)))) items.push({ act: 'sheet', label: String.fromCharCode(55357, 56523) + ' ' + (loc.tok.charId ? 'Sheet\u2026' : 'New character sheet\u2026') });   // character sheets (1.5.0)
          if (loc && loc.tok && loc.tok.charId && window.wpSheets && window.wpSheets.hudFor && window.wpSheets.hudFor(loc.tok.charId)) items.push({ act: 'hud', label: '\u3030 HUD\u2026' });   // HUD frame (HF2b)
          if (!isClient && ownerId && window.wpSheets && window.wpSheets.giveCharacter && camp && camp.system && giveList(camp, ownerId).length) items.push({ act: 'give', label: '\uD83C\uDFAD Give a character\u2026' });   // Onboarding F0: give, switch the one in play, or put its token here
          if (!isClient && window.wpSheets) items.push({ act: 'chars', label: String.fromCharCode(55357, 56421) + ' Characters\u2026' });
          if (!isClient && ownerId && window.wpSheets && window.wpSheets.inviteMaking && camp && camp.system && window.wpSystemCore && window.wpSystemCore.newCharRules && window.wpSystemCore.newCharRules(camp, !window.wpVtt || !window.wpVtt.rulesOn || window.wpVtt.rulesOn('sheets') !== false).create !== 'off' && !Object.keys(camp.chars || {}).some(function(k) { var x = camp.chars[k]; return x && x.ownerId === ownerId && x.making === 1; })) items.push({ act: 'invite', label: '\u270D\uFE0F Let them make a character' });   // Onboarding F3b: the GM's invite (or a replacement for one they play)
          if (isClientM && ownerId && ownerId === window.wpNet.myId && window.wpJoinCard && window.wpJoinCard.has && window.wpJoinCard.has()) items.push({ act: 'joinCard', label: '\uD83D\uDC64 My character\u2026' });   // Onboarding F3: their own card again (a waiting token, one they are making, or one to make)
          fillPartyMenu(items, key);
          menu.classList.add('show');
          window.wpClampMenu(menu, cx, cy);
      }
      window.wpPartyMenuFor = openPartyMenu;
      function fillPartyMenu(items, key) {
          menu.innerHTML = items.map(function(i) {
              return '<button class="wb-tool-btn party-menu-item' + (i.dim ? ' dim' : '') + '" data-act="' + i.act + '" data-key="' + esc(key) + '"' + (i.cid ? ' data-cid="' + esc(i.cid) + '"' : '') + ' style="width:100%; border-radius:0; font-size:12px; height:auto; padding:8px 10px; text-align:left;">' + esc(i.label) + '</button>';
          }).join('');
      }
      // Onboarding F0: what the GM can give a player — their own characters first (the one they play: its token onto their map; a kept one:
      // play it now), then the unassigned ones, then other players' (a reassignment). Never an NPC.
      var _givePic = true;   // Onboarding F1c: a character with no picture takes a copy of its player's face (the GM may untick it)
      function giveList(camp, pid) {
          var S = window.wpSystemCore; if (!S || !S.activeCharOf || !camp || !camp.chars) return [];
          var act = S.activeCharOf(camp, pid).id, names = {}, out = [];
          Object.keys(camp.players || {}).forEach(function(k) { var r = camp.players[k]; if (r && typeof r.name === 'string') names[k] = r.name; });
          var cs = Object.keys(camp.chars).map(function(k) { return camp.chars[k]; }).filter(function(c) { return c && typeof c === 'object' && !c.npc && c.making !== 1; }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
          var live = !!(window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.isConnected && window.wpNet.isConnected(pid));
          cs.forEach(function(c) { if (c.ownerId !== pid) return; if (c.id !== act) out.push({ act: 'giveTo', cid: c.id, label: c.name + ' (theirs, kept) \u2014 play it now' }); else if (live) out.push({ act: 'giveTo', cid: c.id, label: c.name + ' (plays) \u2014 put its token on their map' }); });   // putting it back needs them at the table
          cs.forEach(function(c) { if (!c.ownerId) out.push({ act: 'giveTo', cid: c.id, label: c.name }); });
          cs.forEach(function(c) { if (c.ownerId && c.ownerId !== pid) out.push({ act: 'giveTo', cid: c.id, label: c.name + ' \u2014 from ' + (Object.prototype.hasOwnProperty.call(names, c.ownerId) ? names[c.ownerId] : 'another player'), from: true }); });
          return out;
      }
      if (menu) menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('.party-menu-item'); if (!b) return;
          e.stopPropagation();
          var key = b.dataset.key, act = b.dataset.act;
          if (act === 'givePic') { _givePic = !_givePic; act = 'give'; }   // Onboarding F1c: the toggle keeps the list open
          if (act === 'give') { var campG = getActiveCampaign(), glG = giveList(campG, key.slice(2)); if (glG.length && window.wpNet && window.wpNet.isConnected && window.wpNet.isConnected(key.slice(2))) glG.unshift({ act: 'givePic', label: (_givePic ? '\u2611 ' : '\u2610 ') + 'Use their face for a character with no picture' }); fillPartyMenu(glG.concat([{ act: 'none', label: 'The one you give is the one they play; the one they played before stays theirs (kept).', dim: true }]), key); var rG = menu.getBoundingClientRect(); if (rG.bottom > window.innerHeight - 6) menu.style.top = Math.max(6, window.innerHeight - rG.height - 6) + 'px'; if (rG.right > window.innerWidth - 6) menu.style.left = Math.max(6, window.innerWidth - rG.width - 6) + 'px'; return; }   // the list replaces the menu in place, kept inside the window
          closePartyMenu();
          if (act === 'giveTo') {
              var campT = getActiveCampaign(), pidT = key.slice(2), cidT = b.dataset.cid, chT = campT && campT.chars && Object.prototype.hasOwnProperty.call(campT.chars, cidT) ? campT.chars[cidT] : null;
              if (!chT || !window.wpSheets) return;
              var doGive = function() { if (window.wpSheets.giveCharacter(pidT, cidT, { pic: _givePic })) toast(chT.name + ' given.'); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); };
              if (chT.ownerId && chT.ownerId !== pidT) showConfirm('Give ' + chT.name + ' to this player? Their current player loses it: its sheet closes for them, and its tokens go to the new player.', function(yes) { if (yes) doGive(); });
              else doGive();
              return;
          }
          if (act === 'jump') { if (window.wpStream && window.wpStreamFocusChar) window.wpStreamFocusChar(key); else focusCharacter(key); }
          else if (act === 'summon') { window.wpNet.summonPlayerById(key.slice(2)); }
          else if (act === 'summonHere') { var amH = getActiveMap(); if (amH && amH.type === 'map' && window.wpNet.summonPlayerToMap) window.wpNet.summonPlayerToMap(key.slice(2), amH.id); }
          else if (act === 'summonAll') { window.wpNet.summonAll(); }
          else if (act === 'summonAllHere') { var amA = getActiveMap(); if (amA && amA.type === 'map' && window.wpNet.summonAllToMap) window.wpNet.summonAllToMap(amA.id); }
          else if (act === 'waitHide') { var cWt = getActiveCampaign(), tWt = cWt && window.wpSystemCore && window.wpSystemCore.waitingTokensOf ? window.wpSystemCore.waitingTokensOf(cWt, key.slice(2))[0] : null; if (tWt && window.wpNet.hideWaiting) window.wpNet.hideWaiting(key.slice(2), !tWt.w.hidden); }   // Onboarding F1a
          else if (act === 'waitRemove') { if (window.wpNet.removeWaiting && window.wpNet.removeWaiting(key.slice(2))) toast('Waiting token removed for this session \u2014 Give a character\u2026 still works.'); }
          else if (act === 'clearTarget') { if (window.wpNet.clearTargetOf) window.wpNet.clearTargetOf(key.slice(2)); }   // 1.5.9: the host's alone (clearTargetOf answers nothing elsewhere)
          else if (act === 'pausePlayer') { if (window.wpNet.pausePlayer) window.wpNet.pausePlayer(key.slice(2), true); }
          else if (act === 'unpausePlayer') { if (window.wpNet.pausePlayer) window.wpNet.pausePlayer(key.slice(2), false); }
          else if (act === 'joinCard') { if (window.wpJoinCard) window.wpJoinCard.show(); }
          else if (act === 'invite') { if (window.wpSheets && window.wpSheets.inviteMaking) window.wpSheets.inviteMaking(key.slice(2)); }
          else if (act === 'bring') { var ctrB = viewCentre(); bringKeyHere(key, ctrB.x, ctrB.y); }
          else if (act === 'sheet') { var campS = getActiveCampaign(), nS = charNow(campS, key), locS = nS.loc || nS.left; if (locS && locS.tok && window.wpSheets) { if (!locS.tok.charId && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) window.wpSheets.newFromToken(locS.tok); if (locS.tok.charId) window.wpSheets.openSheet(locS.tok.charId); } }
          else if (act === 'hud') { var campH = getActiveCampaign(), nH = charNow(campH, key), locH = nH.loc || nH.left; if (locH && locH.tok && locH.tok.charId && window.wpSheets && window.wpSheets.openHud) window.wpSheets.openHud(locH.tok.charId); }   // HUD frame (HF2b)
          else if (act === 'chars') { if (window.wpSheets) window.wpSheets.open('chars'); }
          else if (act === 'target') {
              var camp = getActiveCampaign(); var loc = charNow(camp, key).loc;   // where they are: never a token a teammate left behind on this map (a player's app does not draw it)
              var am = getActiveMap();
              if (loc && am && loc.map.id === am.id && loc.tok.ownerId !== window.wpNet.myId) window.wpNet.setTarget(loc.tok.id, am.id, loc.tok.charName || loc.tok.name);
              else toast('You can only target a character on the map you are on.');
          }
      });
      document.addEventListener('pointerdown', function(e) { if (menu && menu.classList.contains('show') && !e.target.closest('#partyMenu')) closePartyMenu(); }, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && (!window.wpEsc || window.wpEsc.free(e))) closePartyMenu(); });   // 1.5.4: esckey.js puts it away, one thing a press
  })();
  /* ---- targeting (players) ----
     The owner's ruling of 2026-10-01: a plain click on a token targets nothing (a look at a token used to target it by mistake). A player
     targets by the token's right-click menu, or with T while pointing at one (showTargetMenu / toggleTarget below); the same again, or Esc,
     clears. A click on a door still asks the host to open or close it. 1.5.9 (the owner's game of 2026-10-25): a token of the player's own that
     stands beside a door overlaps the door's edge, so a press there landed on the token and opened nothing; a press on a token of their own
     with a door under it at that point asks for the door too, while the token's own selection and drag go on exactly as before. */
  function wbIdsAt(x, y) {   // the ids of the board's pieces under a point, topmost first, each once
      var out = [], els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
      for (var i = 0; i < els.length; i++) { var w = els[i] && els[i].closest ? els[i].closest('#whiteboard .wb-item') : null, id = w && w.dataset ? w.dataset.id : ''; if (id && out.indexOf(id) < 0) out.push(id); }
      return out;
  }
  (function wireTargeting() {
      var down = null;
      document.addEventListener('pointerdown', function(e) {
          down = null;
          if (e.button !== 0 || !e.target || !e.target.closest) return;
          if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client') || window.wpStream) return;
          if (window.isDrawingMode || window.isEraserMode || window.isMeasureMode || window.isPanMode || window.isFogMode) return;
          var el = e.target.closest('#whiteboard .wb-item'); if (!el) return;
          var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return;
          var item = am.whiteboard.find(function(x) { return x.id === el.dataset.id; });
          var myId = window.wpNet.myId, idsAt = wbIdsAt;
          // [fogcheck:doorclick-start]
          var doorOf = function(it) { return !!it && (it.blocksSight || it.barrier === true) && it.sightType === 'door' && !it.hidden; };
          if (doorOf(item)) down = { doorId: item.id, mapId: am.id, x: e.clientX, y: e.clientY };   // a client clicks a door (a wall's or a see-through barrier's) to request opening/closing it
          else if (item && (item.isChar || item.waiting) && !item.hidden && !!myId && item.ownerId === myId && typeof idsAt === 'function') {   // 1.5.9: a press on a token of their own: the topmost door under it at that point
              var under = idsAt(e.clientX, e.clientY) || [];
              for (var iU = 0; iU < under.length; iU++) {
                  if (under[iU] === item.id) continue;
                  var dU = (am.whiteboard || []).find(function(x) { return x && x.id === under[iU]; });
                  if (doorOf(dU)) { down = { doorId: dU.id, mapId: am.id, x: e.clientX, y: e.clientY, via: item.id }; break; }
              }
          }
          // [fogcheck:doorclick-end]
      }, true);
      document.addEventListener('pointerup', function(e) {
          if (!down) return;
          var d = down; down = null;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;   // a drag (of your own token underneath), not a click
          var el = e.target && e.target.closest && e.target.closest('#whiteboard .wb-item');
          if (el && (el.dataset.id === d.doorId || (d.via && el.dataset.id === d.via)) && window.wpNet.doorReq) window.wpNet.doorReq(d.mapId, d.doorId);   // door open/close request (host validates adjacency + lock); 1.5.9: or let go on the token of their own that lies over it
      }, true);
      document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {   // 1.5.4 (the owner, 2026-10-17: "Close the top one"): only when nothing else was open, and never from a field, whose key it is
              var tgE = e.target, inField = !!tgE && ((tgE.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(tgE.tagName)) || tgE.isContentEditable === true);
              if ((!window.wpEsc || window.wpEsc.free(e)) && !inField && window.wpNet && window.wpNet.active && (window.wpNet.role === 'client' || window.wpNet.role === 'host') && window.wpNet.targets && window.wpNet.targets[window.wpNet.myId]) window.wpNet.clearMyTarget();
              return;
          }
          if (e.key !== 't' && e.key !== 'T') return;
          if (e.ctrlKey || e.metaKey || e.altKey || !e.target || (e.target.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) || e.target.isContentEditable) return;   // typing, or a shortcut of the browser's
          var hov = document.querySelector('#whiteboard .wb-item:hover'), am = getActiveMap();
          var tok = hov && am && am.type === 'map' && state.viewMode === 'visual' ? (am.whiteboard || []).find(function(x) { return x.id === hov.dataset.id; }) : null;
          if (tok && canTarget(tok)) { e.preventDefault(); toggleTarget(tok, am.id); }
          else if (tok && gmCanTarget(tok)) { e.preventDefault(); gmTarget(tok, am.id); }   // the GM's own pointer
      });
  })();
  // [sinkcheck:targetmenu-start]
  // Targeting (the owner's ruling of 2026-10-01): a player targets a token by its right-click menu — Target, or Clear target when it is their
  // target already — or with T while pointing at one; a plain click targets nothing. Only at a table, as a player (never the stream window),
  // on a shown character token that is not their own and not a waiting one. The token's name is the host's text: through esc. net.setTarget
  // toggles, so the same token again clears
  function canTarget(tok) { var n = window.wpNet; return !!(tok && tok.isChar && !tok.hidden && !tok.waiting && n && n.active && n.role === 'client' && !window.wpStream && tok.ownerId !== n.myId); }
  function targetedByMe(tok) { var n = window.wpNet, t = n && n.targets && n.myId ? n.targets[n.myId] : null; return !!(t && tok && t.id === tok.id); }
  function toggleTarget(tok, mapId) { var n = window.wpNet; if (!canTarget(tok) || !n.setTarget || typeof mapId !== 'string') return false; n.setTarget(tok.id, mapId, tok.charName || tok.name); return true; }
  function showTargetMenu(e, tok, mapId) {
      var cMenu = document.getElementById('contextMenu'); if (!cMenu || !canTarget(tok)) return false;
      cMenu.onclick = null;   // as showStanceMenu: a machine that hosted earlier in this run still holds the GM's item menu's handler
      var mine = targetedByMe(tok);
      cMenu.innerHTML = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + esc(tok.charName || tok.name || 'Token') + '</div>'
          + '<div class="menu-item cm-target" title="' + (mine ? 'Stop targeting it (Esc does too)' : 'Mark it as your target: everyone sees a small copy of your token on it (T while pointing at a token does the same)') + '">' + (mine ? '&#9711; Clear target' : '&#9678; Target') + '</div>';
      cMenu.style.display = 'flex';
      placeMenu(cMenu, e);
      var row = cMenu.querySelector('.cm-target'); if (row) row.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; toggleTarget(tok, mapId); });
      if (typeof tradeRowInto === 'function') tradeRowInto(cMenu, tok);   // 1.5.6 trading: Trade with, for the character they play on this map
      return true;
  }
  // [sinkcheck:targetmenu-end]
  // 1.5.6 trading: a row that asks to trade, made by name with its words as text (trade.js judges who may ask whom)
  function tradeRowInto(cMenu, tok, sel) {
      var T = window.wpTrade, am = typeof getActiveMap === 'function' ? getActiveMap() : null, q = T && T.canAsk ? T.canAsk(tok, am, sel || null) : null; if (!q) return false;
      var r = document.createElement('div'); r.className = 'menu-item cm-trade'; r.title = 'Open a barter window with them: each side puts items and money on the table, and both confirm'; r.textContent = '\u21c4 ' + q.label;
      r.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; T.ask(q.from, q.to); });
      cMenu.appendChild(r); return true;
  }
  // [sinkcheck:portallock-start]
  // A portal's own lock (the owner, 2026-10-03: "maybe add the ability to lock a portal from the play map") on the board: what a hover says of
  // a locked portal, and the GM's menu row. A portal is fogcore isPortal's (its own Portal to Map, or its linked node's); only portalLock true
  // counts. The hover's line is fixed words through esc — to a player that it is locked, to the GM how to unlock it. The row is the GM's alone
  // (never a player's app, never the stream window), on a selection that holds a portal: Lock portal for players while any of them is
  // unlocked, else Unlock portal; its markup holds fixed words only. The host is the judge of a crossing (net.js travelBar)
  function portalLockOn(item, map) { var FC = window.wpFogCore; return !!(item && item.portalLock === true && FC && typeof FC.isPortal === 'function' && FC.isPortal(item, map)); }
  function portalLockTip(item, map, client) {
      if (!portalLockOn(item, map)) return '';
      return '<div class="rc" style="color:var(--gold); font-size:11px;">' + esc(client === true ? '\uD83D\uDD12 Locked \u2014 the GM will unlock it when the time comes' : '\uD83D\uDD12 Locked for players \u2014 right-click it to unlock') + '</div>';
  }
  function portalLockRow(items, map) {
      var n = window.wpNet, FC = window.wpFogCore;
      if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;   // someone else's table on this screen, its link up or between attempts (the owed review, 2026-10-09)
      var ps = (Array.isArray(items) ? items : []).filter(function(w) { return !!(w && FC && typeof FC.isPortal === 'function' && FC.isPortal(w, map)); });
      if (!ps.length) return null;
      var lock = ps.some(function(w) { return w.portalLock !== true; });
      return { lock: lock, items: ps, html: '<div class="menu-item cm-portal-lock" title="' + (lock ? 'No player travels through it until you unlock it: their double-click and a token they drop on it are refused, and where they can see it it wears a small lock. Your own drop of a player&rsquo;s token on it still sends them through.' : 'Players may travel through it again.') + '">' + (lock ? '&#128682; Lock portal for players' : '&#128682; Unlock portal') + '</div>' };
  }
  function portalLockSet(items, map) {
      var row = portalLockRow(items, map); if (!row) return '';
      row.items.forEach(function(w) { if (row.lock) w.portalLock = true; else delete w.portalLock; });
      return row.lock ? 'locked' : 'unlocked';
  }
  // [sinkcheck:portallock-end]
  // [sinkcheck:doorrow-start]
  // A door's own rows on the GM's menu (the owner, 2026-10-04: "it seemed the visible button locked and unlocked the door ... the options need to
  // be more obvious for what something does"): Open door / Close door, and Lock door for players / Unlock door for players. That lock is the one
  // that refuses a player's click on the door (net.js door-req); it is not the piece's Lock in place. A door is fogcore isDoor's (a wall's or a
  // barrier's, set to Door); only doorLock true counts, and the padlock shows how the doors stand. The GM's alone (never a player's app, never
  // the stream window); the markup holds fixed words only.
  function doorRows(items) {
      var n = window.wpNet, FC = window.wpFogCore;
      if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;   // someone else's table on this screen, its link up or between attempts (the owed review, 2026-10-09)
      var ds = (Array.isArray(items) ? items : []).filter(function(w) { return !!(w && FC && typeof FC.isDoor === 'function' && FC.isDoor(w)); });
      if (!ds.length) return null;
      var open = ds.some(function(w) { return !w.doorOpen; }), lock = ds.some(function(w) { return w.doorLock !== true; }), s = ds.length > 1 ? 's' : '';
      return { open: open, lock: lock, items: ds, html:
          '<div class="menu-item cm-door-open" title="' + (open ? 'Open: sight and tokens pass through. A player whose token stands next to an unlocked door can do this by clicking it.' : 'Closed: it blocks as a wall does.') + '">&#128682; ' + (open ? 'Open door' : 'Close door') + s + '</div>'
          + '<div class="menu-item cm-door-lock" title="' + (lock ? 'No player opens or closes it until you unlock it: their click on it is refused, and it wears a small lock. You still open and close it yourself. This is the lock of the door itself, not Lock in place.' : 'Players next to it may open and close it again.') + '">' + (lock ? '&#128275; Lock door' + s + ' for players' : '&#128274; Unlock door' + s + ' for players') + '</div>' };
  }
  function doorRowsDo(items, act) {
      var row = doorRows(items); if (!row) return '';
      if (act === 'open') { row.items.forEach(function(w) { if (row.open) w.doorOpen = true; else delete w.doorOpen; }); return row.open ? 'opened' : 'closed'; }
      if (act === 'lock') { row.items.forEach(function(w) { if (row.lock) w.doorLock = true; else delete w.doorLock; }); return row.lock ? 'locked' : 'unlocked'; }
      return '';
  }
  // [sinkcheck:doorrow-end]
  // [sinkcheck:secretrow-start]
  // A secret door's row on the GM's menu (the map builder, fold B5; the owner, by prompt: found by "A row, and opening it"): Reveal secret
  // door where the selection holds one, else Make secret door where it holds a door that may be one (fogcore secretOk). Revealed, the
  // players see it as a door from now on, shut. Made secret, it is shut first: an open door cannot be secret. The GM's alone (never a
  // player's app, its link up or between attempts, never the stream window), never for a hidden door; the markup holds fixed words only
  function secretRow(items) {
      var n = window.wpNet, FC = window.wpFogCore;
      if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;
      if (!FC || typeof FC.secretOk !== 'function' || typeof FC.secretOn !== 'function' || typeof FC.secretReveal !== 'function') return null;
      var ds = (Array.isArray(items) ? items : []).filter(function(w) { return !!w && !w.hidden && FC.secretOk(w); });
      if (!ds.length) return null;
      var nSec = ds.filter(function(w) { return FC.secretOn(w); }).length, found = nSec > 0, s = (found ? nSec : ds.length) > 1 ? 's' : '';   // the row counts what it will act on: the secret doors for Reveal, every door for Make
      return { reveal: found, items: ds, html: found
          ? '<div class="menu-item cm-secret-show" title="Your players see it as a door from now on. It stays shut until someone opens it.">&#128065; Reveal secret door' + s + '</div>'
          : '<div class="menu-item cm-secret-make" title="Your players see wall here until it is found. The door is shut first, since an open door cannot be secret.">&#128682; Make secret door' + s + '</div>' };
  }
  function secretRowDo(items) {
      var row = secretRow(items), FC = window.wpFogCore; if (!row) return '';
      if (row.reveal) { row.items.forEach(function(w) { FC.secretReveal(w); }); return 'shown'; }
      row.items.forEach(function(w) { w.secret = true; delete w.doorOpen; });
      return 'made';
  }
  // A secret door that was just opened is found: an open door cannot be secret. How many of them the players now see as a door. One that
  // is hidden from players loses its tick too and is no door to them yet: those are counted in tally.hid, so the caller can say it
  function secretOpened(items, tally) {
      var FC = window.wpFogCore, n = 0; if (!FC || typeof FC.secretOn !== 'function' || typeof FC.secretReveal !== 'function') return 0;
      (Array.isArray(items) ? items : []).forEach(function(w) {
          if (!w || !w.doorOpen || !FC.secretOn(w) || !FC.secretReveal(w)) return;
          if (!w.hidden) n++; else if (tally && typeof tally === 'object') tally.hid = (tally.hid || 0) + 1;
      });
      return n;
  }
  // What the menu says of the secret doors it just opened: fixed words, '' where none was one
  function secretOpenedWords(seen, hid) {
      if (seen && hid) return 'Secret doors opened. They are no longer secret. The hidden ones stay hidden from your players.';
      if (hid) return 'Secret door opened. It is no longer secret, and it is still hidden from your players.';
      return seen ? 'Secret door opened. Your players see it as a door now.' : '';
  }
  // [sinkcheck:secretrow-end]
  // [sinkcheck:foghandrow-start]
  // A fog mark on a piece, on the GM's menu (1.5.4; the owner, 2026-10-04: "having a way to fill fog for a whole image would be good too"; by
  // prompt "A mark on the image"): Under fog and Always revealed, each ticked while every piece of the selection that may carry a mark has
  // that one; a ticked row takes the mark off. Only where the selection holds a shown picture, plain shape or painted cell (the kinds fogcore
  // fogHandOf reads; a token, a text, a pen line and a hidden piece never carry one). The GM's alone: never a player's app, never the stream
  // window. The markup holds fixed words only
  function fogHandOk(w) { return !!w && typeof w === 'object' && (!!w.fill || ['image', 'rect', 'circle', 'hexagon', 'diamond'].indexOf(w.type) >= 0) && !w.hidden && !w.isChar && !w.waiting && !w.gmNoteFor; }
  function fogHandRows(items) {
      var n = window.wpNet;
      if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;   // someone else's table on this screen, its link up or between attempts (the owed review, 2026-10-09)
      var ps = (Array.isArray(items) ? items : []).filter(fogHandOk);
      if (!ps.length) return null;
      var hide = ps.every(function(w) { return w.fogHand === 'hide'; }), show = ps.every(function(w) { return w.fogHand === 'show'; });
      return { hide: hide, show: show, items: ps, html:
          '<div class="menu-item cm-fog-hide" title="Every cell under it stays hidden from players, whatever their tokens see, wherever you move it. Pick it again to take the mark off.">' + (hide ? '&#10003; ' : '') + '&#127787; Under fog</div>'
          + '<div class="menu-item cm-fog-show" title="Every cell under it stays shown to players, wherever their tokens are and wherever you move it. Pick it again to take the mark off.">' + (show ? '&#10003; ' : '') + '&#128065; Always revealed</div>' };
  }
  function fogHandSet(items, which) {
      var row = fogHandRows(items); if (!row || (which !== 'hide' && which !== 'show')) return '';
      var off = which === 'hide' ? row.hide : row.show;
      row.items.forEach(function(w) { if (off) delete w.fogHand; else w.fogHand = which; });
      return off ? 'off' : which;
  }
  // [sinkcheck:foghandrow-end]
  /* ---- click-away deselect ----
     Clicking anywhere that isn't the board, the Properties/Elements sidebar,
     the selection toolbar, a menu, or a dialog drops the selection, so the
     floating toolbar never lingers over an item you've moved on from.
     The turn strip keeps it too (found live, 2026-10-17): the redraw this
     makes ran before the press's click, and drew the strip's buttons again
     under the pointer, so the first press on Next, Hold or a name did nothing. */
  // [lookcheck:clickaway-start]
  document.addEventListener('pointerdown', function(e) {
      if (state.viewMode !== 'visual') return;
      if (!state.selWbId && !(state.selWbIds && state.selWbIds.length)) return;
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#whiteboardWrap, #sidebar, #selToolbar, #contextMenu, .floating-toolbar, .shape-menu, .dropdown, .menu-item, [id$="Modal"], #sheetPanel, .hud-panel, #soundPanel, #dicePanel, #cmdkModal, #combatStrip, #docPanel, #musicPanel, #videoPanel, #fxPanel, #notepadPanel, #chatPanel, input, select, textarea, [contenteditable="true"]')) return;   // 1.5.6 (the sweep of 2026-10-17, seen live): every floating box keeps the selection, as the sheet and Sound do
      state.selWbId = null; state.selWbIds = [];
      if (window.appRender) window.appRender();
  }, true);
  // [lookcheck:clickaway-end]

  /* ---- hover tooltip hygiene: it must never outlive the hover ----
     The per-item pointerleave can be missed (element re-rendered under the
     cursor, pointer captured by a drag, view switch), so any pointer activity
     that isn't a hover over a board item hides it. */
  (function wireTooltipHygiene() {
      var tt = document.getElementById('wbTooltip');
      if (!tt) return;
      function hide() { if (tt.style.display !== 'none') tt.style.display = 'none'; }
      document.addEventListener('pointermove', function(e) {
          if (tt.style.display !== 'block') return;
          var over = e.target && e.target.closest && e.target.closest('.wb-item');
          if (!over) hide();
      }, true);
      document.addEventListener('pointerdown', hide, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hide(); });
      window.addEventListener('blur', hide);
      window.wpHideTooltip = hide;
  })();

  /* ---- eraser: delete drawn paths under the pointer ---- */
  var isErasing = false;

  function distToSegSq(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      if (dx === 0 && dy === 0) { dx = px - x1; dy = py - y1; return dx*dx + dy*dy; }
      var t = ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy);
      t = Math.max(0, Math.min(1, t));
      var cx = x1 + t * dx, cy = y1 + t * dy;
      var ddx = px - cx, ddy = py - cy;
      return ddx*ddx + ddy*ddy;
  }

  // [netcheck:erasehold-start]
  // 49 (c) (the owner, by prompt, 2026-10-06: "Lock it for its player"): a drawing of the player's own that the GM made a wall or a
  // see-through barrier is no longer theirs to erase — fogcore strokeHeld, the host's own rule (net.js keeps such a drawing whatever a
  // copy of the map says, and sends the map back). On the GM's machine the eraser takes any line, as ever. The words are fixed
  function eraseHeld(item, asClient) { var FC = window.wpFogCore; return !!(asClient && FC && typeof FC.strokeHeld === 'function' && FC.strokeHeld(item)); }
  function eraseHeldWords(item) { return 'Your GM made that line a ' + (item && item.blocksSight ? 'wall' : 'barrier') + '. It stays until they hand it back.'; }
  // [netcheck:erasehold-end]
  var lastErasePt = null, _heldSaid = false;   // 49 (c): the notice is said once a stroke of the eraser

  // [buildcheck:eraseblock-start]
  // The GM's eraser takes a wall or a door laid as a BLOCK whole (the owner, at the table on 2026-10-25: "id like to be able to more easily
  // erase, or delete a drawn wall"). A block is a box piece, a rectangle, a hexagon, a diamond or a circle, that blocks sight or is a
  // see-through barrier, a door among them, laid by Build or by hand. One the eraser's circle touches goes whole, in either eraser mode, as a
  // painted cell does. Never a locked one, a token, a waiting token, a GM note card, a picture or a text box (they are no box piece), nor a
  // piece with a purpose of its own: a portal by its own key or its node's, a light, a fog mark, a pin to a page, a play area, a null area,
  // a painted cell (its own branch). A hidden one too: the GM sees it. A line is still cut as before, and a player's eraser is unchanged
  var ERASE_BLOCKS = ['rect', 'hexagon', 'diamond', 'circle'];
  function eraseBlockOk(w) {
      return !!w && typeof w === 'object' && ERASE_BLOCKS.indexOf(w.type) >= 0 && (w.blocksSight === true || w.barrier === true)
          && !w.locked && !w.isChar && !w.waiting && !w.gmNoteFor && !w.fill && !w.targetMapId && !w.nodeId && !w.light && !w.fogHand && !w.page && !w.fogged && !w.nulls;
  }
  // whether the eraser's circle (radius r about x, y) touches the block as the board draws it: its box turned about its centre, cut to a
  // hexagon or a diamond as the style sheet cuts it, a circle as the ellipse its box holds
  function eraseBlockHit(w, x, y, r) {
      var num = function(v) { return typeof v === 'number' && isFinite(v); };
      if (!w || !num(w.x) || !num(w.y) || !num(x) || !num(y)) return false;
      var bw = num(w.w) && w.w > 0 ? w.w : 0, bh = num(w.h) && w.h > 0 ? w.h : 0, rr = num(r) && r > 0 ? r : 0, cx = w.x + bw / 2, cy = w.y + bh / 2;
      if (num(w.rot) && w.rot % 360) { var ra = -w.rot * Math.PI / 180, co = Math.cos(ra), si = Math.sin(ra), dx = x - cx, dy = y - cy; x = cx + dx * co - dy * si; y = cy + dx * si + dy * co; }
      if (w.type === 'circle') { var ax = bw / 2 + rr, ay = bh / 2 + rr; if (!(ax > 0 && ay > 0)) return false; var ux = (x - cx) / ax, uy = (y - cy) / ay; return ux * ux + uy * uy <= 1; }
      var poly = w.type === 'hexagon' ? [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]] : w.type === 'diamond' ? [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
      poly = poly.map(function(p) { return [w.x + p[0] * bw, w.y + p[1] * bh]; });
      var inside = false;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) return true;
      for (var k = 0, m = poly.length - 1; k < poly.length; m = k++) {
          var A = poly[m], B = poly[k], ex = B[0] - A[0], ey = B[1] - A[1], L = ex * ex + ey * ey, t = L > 0 ? ((x - A[0]) * ex + (y - A[1]) * ey) / L : 0;
          t = Math.max(0, Math.min(1, t));
          var fx = x - (A[0] + t * ex), fy = y - (A[1] + t * ey);
          if (fx * fx + fy * fy <= rr * rr) return true;
      }
      return false;
  }
  // [buildcheck:eraseblock-end]

  function eraseAt(clientX, clientY) {
      var box = wbWrap.getBoundingClientRect();
      var x = (clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;
      var y = (clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
      // Interpolate from the previous sample so fast swipes don't skip over strokes
      if (lastErasePt) {
          var dist = Math.hypot(x - lastErasePt[0], y - lastErasePt[1]);
          var steps = Math.min(60, Math.max(1, Math.ceil(dist / 6)));
          for (var i = 1; i <= steps; i++) {
              eraseWorldPoint(lastErasePt[0] + (x - lastErasePt[0]) * i / steps,
                              lastErasePt[1] + (y - lastErasePt[1]) * i / steps);
          }
      } else {
          eraseWorldPoint(x, y);
      }
      lastErasePt = [x, y];
  }

  // Erase only the SEGMENTS under the pointer: a touched segment is cut out and
  // its two neighbours keep their endpoints, so a small eraser removes exactly
  // one segment. What remains on either side becomes its own path item.
  function eraseWorldPoint(x, y) {
      var m = getActiveMap();
      if(!m || !m.whiteboard) return;
      var changed = false;
      var out = [];
      var eraserClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      var heldHit = null;   // 49 (c): a line of theirs the GM made a wall or a barrier, touched by this pass and kept
      m.whiteboard.forEach(function(item) {
          var isRegion = (item.type === 'path' && item.tip === 'fill');
          if ((item.fill || isRegion) && !item.locked) {   // a fill cell OR a freeform fill region erases as a whole item
              if (eraserClient) { out.push(item); return; }   // GM-only fills
              var _er = (state.eraserSize || 6);
              if (isRegion) {   // erase the whole region when the eraser is inside it (not in a punched hole), or touches its outline
                  var _rsx = item.w / (item.baseW || item.w || 1), _rsy = item.h / (item.baseH || item.h || 1);
                  var _hx = x, _hy = y;
                  if (item.rot) {   // render rotates the box about its centre; test in that same (un-rotated) frame
                      var _ra = -item.rot * Math.PI / 180, _rcos = Math.cos(_ra), _rsin = Math.sin(_ra);
                      var _rcx = item.x + item.w / 2, _rcy = item.y + item.h / 2, _rdx = x - _rcx, _rdy = y - _rcy;
                      _hx = _rcx + _rdx * _rcos - _rdy * _rsin; _hy = _rcy + _rdx * _rsin + _rdy * _rcos;
                  }
                  var _toAbs = function(p) { return [item.x + p[0] * _rsx, item.y + p[1] * _rsy]; };
                  var _poly = (item.pts || []).map(_toAbs);
                  var _hit = pointInPoly(_hx, _hy, _poly);
                  if (_hit && item.holes) {   // a click inside a punched-out hole is not on the fill
                      for (var _hi = 0; _hi < item.holes.length; _hi++) {
                          if (pointInPoly(_hx, _hy, item.holes[_hi].map(_toAbs))) { _hit = false; break; }
                      }
                  }
                  if (!_hit && _poly.length > 1) {
                      var _erSq = _er * _er;
                      for (var _pi = 0, _pj = _poly.length - 1; _pi < _poly.length; _pj = _pi++) {
                          if (distToSegSq(_hx, _hy, _poly[_pj][0], _poly[_pj][1], _poly[_pi][0], _poly[_pi][1]) <= _erSq) { _hit = true; break; }
                      }
                  }
                  if (_hit) { changed = true; return; }
                  out.push(item); return;
              }
              if (x >= item.x - _er && x <= item.x + item.w + _er && y >= item.y - _er && y <= item.y + item.h + _er) { changed = true; return; }
              out.push(item); return;
          }
          if (!eraserClient && !(window.wpNet && window.wpNet.foreign) && typeof eraseBlockOk === 'function' && eraseBlockOk(item)) {   // the GM's eraser: a wall or a door laid as a block goes whole
              if (eraseBlockHit(item, x, y, state.eraserSize || 6)) { changed = true; return; }
              out.push(item); return;
          }
          if (item.type !== 'path' || !item.pts || item.locked) { out.push(item); return; }
          if (eraserClient && item.ownerId !== window.wpNet.myId) { out.push(item); return; }   // players erase only their own marks
          var sx = item.w / (item.baseW || item.w || 1);
          var sy = item.h / (item.baseH || item.h || 1);
          var reach = (state.eraserSize || 6) + (item.strokeWidth || 3) / 2;
          var reachSq = reach * reach;
          var abs = item.pts.map(function(p) { return [item.x + p[0] * sx, item.y + p[1] * sy]; });
          // a TURNED line (found 2026-10-17): the board turns it about its box's centre, and the eraser cut it where it lay before the turn. The
          // eraser's place is turned back into the line's own frame and the line cut there, as a filled region is; each piece keeps the turn and
          // the stretch, its box moved so that it is drawn where that part of the line was drawn
          var ex = x, ey = y, turn = +item.rot, tc = 1, ts = 0, ocx = item.x + item.w / 2, ocy = item.y + item.h / 2;
          if (turn && isFinite(turn) && isFinite(ocx) && isFinite(ocy)) {
              tc = Math.cos(turn * Math.PI / 180); ts = Math.sin(turn * Math.PI / 180);
              ex = ocx + (x - ocx) * tc + (y - ocy) * ts; ey = ocy - (x - ocx) * ts + (y - ocy) * tc;
          } else turn = 0;
          if (abs.length === 1) {
              var ddx = ex - abs[0][0], ddy = ey - abs[0][1];
              if (ddx*ddx + ddy*ddy <= reachSq) { if (eraseHeld(item, eraserClient)) { heldHit = item; out.push(item); return; } changed = true; return; }
              out.push(item); return;
          }
          var cut = [];
          var any = false;
          for (var i = 0; i + 1 < abs.length; i++) {
              cut[i] = distToSegSq(ex, ey, abs[i][0], abs[i][1], abs[i+1][0], abs[i+1][1]) <= reachSq;
              if (cut[i]) any = true;
          }
          if (!any) { out.push(item); return; }
          if (eraseHeld(item, eraserClient)) { heldHit = item; out.push(item); return; }   // 49 (c): touched, and kept whole
          changed = true;
          // Runs of consecutive intact segments become the surviving pieces
          var run = [];
          if (state.eraserMode !== 'segment') {
              // PRECISE: clip each segment against the circle and keep only the
              // parts outside it, so exactly what the circle passed over is gone.
              for (var s = 0; s + 1 < abs.length; s++) {
                  var A = abs[s], B = abs[s+1];
                  if (!cut[s]) { if (!run.length) run.push(A); run.push(B); continue; }
                  var dxs = B[0] - A[0], dys = B[1] - A[1];
                  var fx = A[0] - ex, fy = A[1] - ey;
                  var qa = dxs*dxs + dys*dys, qb = 2 * (fx*dxs + fy*dys), qc = fx*fx + fy*fy - reachSq;
                  var t0 = 0, t1 = 1;
                  if (qa > 0) {
                      var disc = qb*qb - 4*qa*qc;
                      if (disc < 0) { t0 = 0; t1 = 1; }   // touched by proximity only: treat as inside
                      else { var sq = Math.sqrt(disc); t0 = Math.max(0, (-qb - sq) / (2*qa)); t1 = Math.min(1, (-qb + sq) / (2*qa)); }
                  }
                  if (t0 > 0.001) { if (!run.length) run.push(A); run.push([A[0] + dxs*t0, A[1] + dys*t0]); }
                  flush();
                  if (t1 < 0.999) { run.push([A[0] + dxs*t1, A[1] + dys*t1]); run.push(B); }
              }
              flush();
              return;
          }
          function flush() {
              if (run.length < 2) { run = []; return; }
              var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              run.forEach(function(p) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); });
              var w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
              // what is left keeps the line's own stretch (its box that much smaller, its points in it): a resized line is drawn with its stroke stretched, and a piece laid at its own size would be thinner or thicker than the line was
              var kx = sx > 0 && isFinite(sx) ? sx : 1, ky = sy > 0 && isFinite(sy) ? sy : 1;
              var piece = Object.assign({}, item, {
                  id: 'wb' + uid(),
                  x: minX, y: minY, w: w, h: h, baseW: w / kx, baseH: h / ky,
                  pts: run.map(function(p) { return [(p[0] - minX) / kx, (p[1] - minY) / ky]; })
              });
              if (turn) {   // turned about its own centre, the piece stands where the line drew it: its centre goes where the line's turn takes it
                  var dcx = minX + w / 2 - ocx, dcy = minY + h / 2 - ocy;
                  piece.x = minX - (dcx - (dcx * tc - dcy * ts)); piece.y = minY - (dcy - (dcx * ts + dcy * tc));
              }
              delete piece.groupId;
              out.push(piece);
              run = [];
          }
          for (var j = 0; j + 1 < abs.length; j++) {
              if (cut[j]) flush();   // the run already ends at abs[j]
              else { if (!run.length) run.push(abs[j]); run.push(abs[j+1]); }
          }
          flush();
      });
      if (heldHit && !_heldSaid) { _heldSaid = true; toast(eraseHeldWords(heldHit)); }
      if (changed) {
          m.whiteboard = out;
          if (state.selWbId && !out.some(function(i) { return i.id === state.selWbId; })) { state.selWbId = null; state.selWbIds = []; }
          _erasedAny = true;   // fold M8
          save(); render();
      }
  }
  var _erasedAny = false;

  if(wbWrap) {
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isEraserMode || e.button !== 0) return;
          isErasing = true;
          lastErasePt = null;
          if (_eraserCursor) _eraserCursor.classList.add('pressed');
          eraseAt(e.clientX, e.clientY);
          e.preventDefault();
      });
      wbWrap.addEventListener('pointermove', function(e) {
          if (isErasing && window.isEraserMode) eraseAt(e.clientX, e.clientY);
      });
  }
  document.addEventListener('pointerup', function() {
      isErasing = false; lastErasePt = null; _heldSaid = false; if (_eraserCursor) _eraserCursor.classList.remove('pressed');
      if (_erasedAny && window.wpNet && window.wpNet.active && window.wpNet.role === 'client') save(true);   // fold M8: a player's erasing goes to the host at once
      _erasedAny = false;
  });

  /* ---- measure tool: place unit-aware rulers on the board ---- */

  window.isMeasureMode = false;

  var measures = [];

  var activeMeasure = null;

  var isMeasuring = false;

  try { var _mu = localStorage.getItem('wp_measureUnit'); if (_mu) state.measureUnit = _mu; } catch (e) {}

  function _r1(n) { return Math.round(n * 10) / 10; }

  // Per-map scale: default 1 yd per hex / 5 ft per square, overridable in the
  // measure menu (meta.cellValue + meta.cellUnit) — e.g. 100 yd or 5 mi per cell.

  // [sinkcheck:measure-start]
  function mapMeasureConfig() {

      var m = getActiveMap();

      var meta = (m && m.meta) || {};

      var hex = state.gridType === 'hex';

      return {

          cellPx: hex ? 52 : 50,

          cellName: hex ? 'hex' : 'sq',

          per: (typeof meta.cellValue === 'number' && meta.cellValue > 0) ? meta.cellValue : (hex ? 1 : 5),

          unit: (typeof meta.cellUnit === 'string' && /^(yd|ft|m|km|mi)$/.test(meta.cellUnit)) ? meta.cellUnit : (hex ? 'yd' : 'ft')

      };

  }

  function measureLabel(dist, cellsOv) {   // cellsOv (turn-based combat T1): the cells by the system's diagonal rule, worked out by the caller

      var cfg = mapMeasureConfig();

      var cells = typeof cellsOv === 'number' && isFinite(cellsOv) ? cellsOv : dist / cfg.cellPx;

      var val = cells * cfg.per;

      var unit = cfg.unit;

      var metric = (state.measureUnit === 'metric');

      var toMetric = { yd: ['m', 0.9144], ft: ['m', 0.3048], mi: ['km', 1.609344] };   // the exact definitions (1.5.4): a yard is 0.9144 m and a mile 1.609344 km, as ydPer counts

      var toImperial = { m: ['yd', 1 / 0.9144], km: ['mi', 1 / 1.609344] };

      if (metric && toMetric[unit]) { val *= toMetric[unit][1]; unit = toMetric[unit][0]; }

      else if (!metric && toImperial[unit]) { val *= toImperial[unit][1]; unit = toImperial[unit][0]; }

      return _r1(cells) + ' ' + cfg.cellName + ' · ' + _r1(val) + ' ' + unit;

  }

  // [sinkcheck:measure-end]
  // [sinkcheck:lightlabel-start]
  // Lighting L4 (owner answers 4 and 7): the light a token stands in, by the name its system gives it (Dim light, Darkness, with whatever
  // penalty the name words in), on the ruler between two tokens and at a target mark. Worked out on this screen from its own copy of the
  // map: nothing on the wire. Whose eyes a screen may read through: the GM's any token's; a player's only their own token's (another player's
  // sight is a sheet they do not hold). A name is a system file's text, or the host's on a player's screen: it lands through esc or as a text node
  function litViewer(tok) { var n = window.wpNet; return !!tok && (!(n && (n.foreign || (n.active && n.role === 'client'))) || (typeof n.myId === 'string' && !!n.myId && tok.ownerId === n.myId)); }   // a GM's campaign still on a player's screen after the link went is a player's screen too (io.js wpCanPersistLocal's test); a screen with no id of its own reads through no token
  function lightSeenBy(from, to, map) {   // { lv: 0 dark | 1 dim, name } or null: bright or seen clear, a level the system does not name, not this screen's to read
      var F = window.wpFog, S = window.wpSystemCore; if (!F || !F.lightSeen || !S || !S.lightName || !from || !to || !litViewer(from)) return null;
      var lv = F.lightSeen(from, to, map, getActiveCampaign()); if (lv !== 0 && lv !== 1) return null;
      var name = S.lightName(window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, lv);
      return name ? { lv: lv, name: name } : null;
  }
  function rulerLightText(x, y, l) { return l && l.name ? '<text x="' + x + '" y="' + y + '">' + esc(l.name) + '</text>' : ''; }
  var TARGET_LIGHT_GLYPH = ['\u25cf', '\u263d'];   // dark, dim: the tag at a target mark's upper corner (the level's name in the caption under the token)
  function targetLightHtml(markHtml, l) { return l ? '<span class="target-pair">' + markHtml + '<span class="target-light' + (l.lv === 0 ? ' dark' : '') + '" title="' + esc(l.name) + '">' + TARGET_LIGHT_GLYPH[l.lv === 0 ? 0 : 1] + '</span></span>' : markHtml; }
  function targetLightCaption(list) { var seen = Object.create(null), out = []; (Array.isArray(list) ? list : []).forEach(function(l) { if (l && typeof l.name === 'string' && l.name && !seen[l.name]) { seen[l.name] = 1; out.push(l.name); } }); return out.join(' \u00b7 '); }
  // [sinkcheck:lightlabel-end]
  // [shelfcheck:pagepin-start]
  // A pin (1.5.4, pageshelf.js; the owner by prompt: "Pins on the map"): a piece of the play map that opens a page. The GM's alone: the
  // module says whether this screen sees pins and which page a piece opens. Here are the mark on the piece and the row of its right-click
  // menu. A page's name is text everywhere: escaped in the row, a data value and a tooltip's text on the mark
  function pagePinOf(item) { var PS = window.wpPageShelf; return PS && typeof PS.mapPin === 'function' ? PS.mapPin(item) : null; }
  function pagePinRow(items) {
      var its = (Array.isArray(items) ? items : []).filter(Boolean); if (its.length !== 1) return null;
      var pin = pagePinOf(its[0]); if (!pin) return null;
      return { id: pin.id, html: '<div class="menu-item cm-open-page" title="A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself.">&#128209; Open page: ' + esc(pin.title) + '</div>' };
  }
  // The mark: a small button at the piece's corner. A press on it is no press on the piece: nothing is selected or dragged, and the page opens by the one rule
  function pagePinMark() {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'wb-pin';
      ['pointerdown', 'mousedown', 'dblclick'].forEach(function(ev) { b.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      b.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); var PS = window.wpPageShelf; if (PS && b.dataset.page) PS.open(b.dataset.page, PS.wayNow(e)); });
      return b;
  }
  function pagePinSync(el, item, hidden) {
      var mark = el.querySelector(':scope > .wb-pin'), pin = hidden ? null : pagePinOf(item);
      if (!pin) { if (mark) mark.remove(); return; }
      if (!mark) { mark = pagePinMark(); el.appendChild(mark); }
      if (mark.dataset.page !== pin.id || mark.dataset.name !== pin.title) { mark.dataset.page = pin.id; mark.dataset.name = pin.title; mark.dataset.tip = 'Opens ' + pin.title + '. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the page itself.'; mark.setAttribute('aria-label', 'Open ' + pin.title); }
  }
  // [shelfcheck:pagepin-end]
  // [sinkcheck:tokenfx-start]
  // Conditions C1 (docs/CONDITIONS_PLAN.md): a token's effects as a row of small icons at its top left (6 drawn, then "+N"), ringed by tone, a
  // GM-only one dashed, their names in the row's title. A glyph is a mask whose URL is built only from glyphPath's answer (the fixed table);
  // an emoji or a symbol is escaped text; an effect with no icon shows its name's first letter
  var FX_GLYPH_BASE = '/assets/icons/fa/';
  function tokenFxHtml(list) {
      if (!Array.isArray(list) || !list.length) return '';
      var S = window.wpSystemCore, names = [], h = '', n = 0;
      list.slice(0, 8).forEach(function(e) {
          if (!e || typeof e !== 'object' || typeof e.n !== 'string' || !e.n) return;
          names.push(e.n); n++;
          if (n > 6) return;
          var cls = 'tfx' + (e.t === 'buff' ? ' buff' : e.t === 'debuff' ? ' debuff' : '') + (e.g === 1 ? ' gm' : ''), p = S && S.glyphPath ? S.glyphPath(e.i) : '';
          if (p) h += '<span class="' + cls + '"><i class="wp-glyph" style="-webkit-mask-image:url(&quot;' + FX_GLYPH_BASE + esc(p) + '.svg&quot;);mask-image:url(&quot;' + FX_GLYPH_BASE + esc(p) + '.svg&quot;)"></i></span>';
          else h += '<span class="' + cls + '">' + esc(typeof e.i === 'string' && e.i ? e.i : e.n.charAt(0).toUpperCase()) + '</span>';
      });
      if (!n) return '';
      if (n > 6) h += '<span class="tfx more">+' + (n - 6) + '</span>';
      return '<span class="tfx-row" title="' + esc(names.join(' · ')) + '">' + h + '</span>';
  }
  // [sinkcheck:tokenfx-end]
  // [sinkcheck:tokfxmenu-start]
  // Conditions C2 (docs/CONDITIONS_PLAN.md): a token's Effects menu — the model's rows (wpSheets.tokenFxModel) as menu lines ticked when
  // applied, a GM-only one marked, one applied but switched off saying so; a click adds the library effect or ends the one applied. A token
  // with no sheet (the GM's) gets a line to make one on the spot. Names escaped; an icon drawn as on the token
  function fxIconHtml(i) {
      var S = window.wpSystemCore, p = S && S.glyphPath ? S.glyphPath(i) : '';
      if (p) return '<i class="wp-glyph" style="-webkit-mask-image:url(&quot;' + FX_GLYPH_BASE + esc(p) + '.svg&quot;);mask-image:url(&quot;' + FX_GLYPH_BASE + esc(p) + '.svg&quot;)"></i>';
      return typeof i === 'string' && i ? esc(i) : '';
  }
  function tokenFxMenuHtml(tok, m) {
      var h = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">Effects &mdash; ' + esc(tok.charName || tok.name || 'Token') + '</div>';
      if (!m.rows.length && m.char) h += '<div class="menu-item" style="color:var(--dim); cursor:default;">No effects in the system&rsquo;s library.</div>';
      m.rows.forEach(function(r, k) {
          var inert = r.auto === true && !r.rowId;   // conditions C4: on by its own formula, with no row to end: nothing to click
          h += '<div class="menu-item cm-fx' + (r.on ? ' on' : '') + (inert ? ' auto' : '') + '"' + (inert ? '' : ' data-fi="' + k + '"') + '>' + (r.on ? '&#9745; ' : '&#9744; ') + fxIconHtml(r.icon) + ' ' + esc(r.name) + (r.gm ? ' <span class="cm-fx-tag gm">GM</span>' : '') + (r.auto === true ? ' <span class="cm-fx-tag">auto</span>' : '') + (r.rowId && !r.on ? ' <span class="cm-fx-tag">off</span>' : '') + '</div>';
      });
      if (!m.char) h += '<div class="menu-divider"></div><div class="menu-item cm-fx-new" style="gap:4px; cursor:default;"><input class="field cm-fx-name" maxlength="60" placeholder="New effect&hellip;" style="width:110px;"><select class="field cm-fx-tone"><option value="">Neutral</option><option value="buff">Buff</option><option value="debuff">Debuff</option></select><button class="tool ghost cm-fx-add" type="button">Add</button></div>';
      return h;
  }
  function tokenFxOp(tok, m, q) {
      if (m.char) { if (window.wpSheets && window.wpSheets.tokenFxCharOp) window.wpSheets.tokenFxCharOp(m.char, m.field, q); return; }
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;   // a token with no sheet: its own effects, the GM's
      var FC = window.wpFogCore, rows = (FC && FC.cleanTokFx ? FC.cleanTokFx(tok.fx) : null) || [];
      if (q.op === 'add' && typeof q.ref === 'string' && !rows.some(function(r) { return r.ref === q.ref; })) rows.push({ id: 'x_' + uid(), ref: q.ref });
      else if (q.op === 'remove' && typeof q.rowId === 'string') rows = rows.filter(function(r) { return r.id !== q.rowId; });
      else if (q.op === 'new' && typeof q.name === 'string') rows.push({ id: 'x_' + uid(), name: q.name, icon: '', tone: q.tone });   // cleaned below, as every row is
      var cl = FC && FC.cleanTokFx ? FC.cleanTokFx(rows) : null; if (cl) tok.fx = cl; else delete tok.fx;
      save(); render();
  }
  function showTokenFxMenu(tok) {
      var cMenu = document.getElementById('contextMenu'), S = window.wpSheets; if (!cMenu || !S || !S.tokenFxModel) return;
      var m = S.tokenFxModel(tok); if (!m) { cMenu.style.display = 'none'; return; }
      cMenu.onclick = null;   // its lines answer for themselves: the item menu's handler never sees them
      cMenu.innerHTML = tokenFxMenuHtml(tok, m);
      cMenu.style.display = 'flex';
      placeMenu(cMenu);   // its rows changed while it was up: fitted again where it stands
      var again = function() { setTimeout(function() { if (cMenu.style.display !== 'none') showTokenFxMenu(tok); }, 0); };
      cMenu.querySelectorAll('.cm-fx').forEach(function(line) {
          line.addEventListener('click', function(ce) { ce.stopPropagation(); var r = m.rows[Number(line.dataset.fi)]; if (!r) return; tokenFxOp(tok, m, r.rowId ? { op: 'remove', rowId: r.rowId } : { op: 'add', ref: r.ref }); again(); });
      });
      var nm = cMenu.querySelector('.cm-fx-name'), tn = cMenu.querySelector('.cm-fx-tone'), add = cMenu.querySelector('.cm-fx-add');
      [nm, tn, cMenu.querySelector('.cm-fx-new')].forEach(function(x) { if (x) x.addEventListener('click', function(ce) { ce.stopPropagation(); }); });
      if (add) add.addEventListener('click', function(ce) { ce.stopPropagation(); var v = nm ? nm.value.trim() : ''; if (!v) return; tokenFxOp(tok, m, { op: 'new', name: v, tone: tn ? tn.value : '' }); again(); });
  }
  // [sinkcheck:tokfxmenu-end]
  // [sinkcheck:rangelabel-start]
  // Range penalties R1 (docs/RANGE_PLAN.md): the modifier the system's range rule gives, on every ruler (range is distance alone) and at each
  // target mark, from its targeter's token as its cover is. Between two character tokens it is measured centre to centre, with their elevation
  // when that feature is on, as a roll will read it (R2). Worked out on this screen from its own copy of the map: nothing on the wire. A number
  // and a unit's short name, never a name from a file
  function rangeSeen(map, a, b, tA, tB) {   // { mod, dist, unit } or null: no rule, no map
      var S = window.wpSystemCore, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null; if (!S || !S.rangeOf || !sys || !map) return null;
      var dz = tA && tB && stanceOn('elevation') ? tokenElevation(tB, map) - tokenElevation(tA, map) : 0;   // item 19b H5: each on the ground it stands on
      return S.rangeOf(sys, map, a, b, { F: window.wpFormula, dz: dz });
  }
  function rangeModText(m) { return typeof m !== 'number' || !isFinite(m) ? '' : m < 0 ? '\u2212' + String(-m) : m > 0 ? '+' + String(m) : '0'; }
  var RANGE_UNIT_WORD = { yd: 'yd', ft: 'ft', m: 'm', cells: 'cells' };
  // A target mark's tooltip says the distance in the viewer's own unit (1.5.4, the review of the v1.0.4 merge; docs/V104_PLAN.md gap 2): a rule
  // that counts in yards or feet reads in metres under Metric, and one in metres reads in yards under Imperial, by the exact definitions, as a
  // height does; cells as they are, and with no setting at hand the rule's own unit. Only what is said changes: the modifier is the rule's
  function rangeTitle(rg) {
      var u = Object.prototype.hasOwnProperty.call(RANGE_UNIT_WORD, rg.unit) ? RANGE_UNIT_WORD[rg.unit] : 'yd', d = rg.dist, mo = typeof metricOn === 'function' ? metricOn() : null;
      if (mo === true && (u === 'yd' || u === 'ft')) { d = d * (u === 'yd' ? 0.9144 : 0.3048); u = 'm'; } else if (mo === false && u === 'm') { d = d / 0.9144; u = 'yd'; }
      return 'Range ' + rangeModText(rg.mod) + ' (' + (Math.round(d * 10) / 10) + ' ' + u + ')';
  }
  function rulerRangeText(x, y, rg) { return rg ? '<text x="' + x + '" y="' + y + '">Range ' + esc(rangeModText(rg.mod)) + '</text>' : ''; }
  function targetRangeHtml(markHtml, rg) { return rg && rg.mod !== 0 ? '<span class="target-pair">' + markHtml + '<span class="target-range" title="' + esc(rangeTitle(rg)) + '">' + esc(rangeModText(rg.mod)) + '</span></span>' : markHtml; }
  // [sinkcheck:rangelabel-end]
  // [sinkcheck:heightlabel-start]
  // Item 19 H2 (the owner's answer: shown on the ruler and at a target mark): the system's height modifier between two character tokens — the
  // first's height over the second's, as a roll's HeightMod reads it — on the ruler and at each target mark from its targeter's token. Worked
  // out on this screen; its words a number and the viewer's own unit (yards or metres), never a name from a file
  function heightSeen(tA, tB, map) {   // { mod, diff, unit } or null: no table or formula, no two tokens; map (item 19b H5): each on the ground it stands on there
      var S = window.wpSystemCore, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null; if (!S || !S.heightOf || !sys || !tA || !tB) return null;
      return S.heightOf(sys, tA, tB, { F: window.wpFormula, elev: stanceOn('elevation'), groundOf: map ? function(t) { return tokenGround(t, map); } : null });
  }
  var HEIGHT_YD = { yd: 1, ft: 1 / 3, m: 1.0936133 };
  function heightTitle(hg) { var yd = (typeof hg.diff === 'number' && isFinite(hg.diff) ? hg.diff : 0) * (Object.prototype.hasOwnProperty.call(HEIGHT_YD, hg.unit) ? HEIGHT_YD[hg.unit] : 1); return 'Height ' + rangeModText(hg.mod) + ' (' + (yd ? fmtElev(yd) + ' ' + lenUnit() : 'level') + ')'; }
  function rulerHeightText(x, y, hg) { return hg ? '<text x="' + x + '" y="' + y + '">' + esc(heightTitle(hg)) + '</text>' : ''; }
  function targetHeightHtml(markHtml, hg) { return hg && typeof hg.mod === 'number' && isFinite(hg.mod) && hg.mod !== 0 ? '<span class="target-pair">' + markHtml + '<span class="target-height" title="' + esc(heightTitle(hg)) + '">' + esc(rangeModText(hg.mod)) + '</span></span>' : markHtml; }
  // [sinkcheck:heightlabel-end]
  // Turn-based combat T1 (D8): on a square grid the ruler counts a diagonal as the system says (every diagonal 1 square, or alternating 1-2);
  // null keeps the straight line (no rule, no grid). A hex grid counts the hexes between the two ends' cells, as range, a blast's distances
  // and the 3D line count them (the read-only check of 2026-10-17: the ruler read the straight line over 52 px, so two hexes along a row read
  // 1.7 where the range rule counted 2)
  function diagCells(m) {
      if (state.gridType === 'hex') return hexDist(hexCellOf(m.x1, m.y1), hexCellOf(m.x2, m.y2));
      var sc = window.wpSystemCore, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, dg = sys && sys.combat && sys.combat.turn ? sys.combat.turn.diag : '';
      if (!sc || !sc.gridCells || (dg !== 'one' && dg !== 'alt') || state.gridType !== 'square') return null;
      var px = mapMeasureConfig().cellPx; return sc.gridCells((m.x2 - m.x1) / px, (m.y2 - m.y1) / px, dg);
  }
  // [fogcheck:rulercost-start]
  // Difficult terrain T2: what a move along the ruler costs when it steps into difficult terrain, in the map's cells and unit, counted as a
  // turn's move counts it (fog.js moveCost, the system's diagonal rule); '' when it costs no more than its length, or off a square or hex grid
  function rulerCostText(map, m) {
      var F = window.wpFog, sys = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, dg = sys && sys.combat && sys.combat.turn ? sys.combat.turn.diag : '';
      if (!F || !F.moveCost || !map) return '';
      var mc = F.moveCost(map, m.x1, m.y1, m.x2, m.y2, dg);
      return mc && mc.cost > mc.len + 0.05 ? 'Move cost ' + measureLabel(0, mc.cost) : '';
  }
  // [fogcheck:rulercost-end]
  function renderMeasures() {

      var layer = document.getElementById('measureLayer');

      if (!layer) return;

      var all = activeMeasure ? measures.concat([activeMeasure]) : measures;

      var html = '';

      all.forEach(function(m, idx) {

          var dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);

          var mx = (m.x1 + m.x2) / 2, my = (m.y1 + m.y2) / 2;

          // Each placed ruler is its own clickable group (a fat invisible hit line
          // makes it easy to grab); the one being dragged is inert.
          html += '<g class="measure' + (m === activeMeasure ? ' live' : '') + '" data-i="' + idx + '"><title>Click to remove this ruler</title>';

          html += '<line class="hit" x1="' + m.x1 + '" y1="' + m.y1 + '" x2="' + m.x2 + '" y2="' + m.y2 + '"></line>';

          html += '<line x1="' + m.x1 + '" y1="' + m.y1 + '" x2="' + m.x2 + '" y2="' + m.y2 + '"></line>';

          html += '<circle cx="' + m.x1 + '" cy="' + m.y1 + '" r="4"></circle><circle cx="' + m.x2 + '" cy="' + m.y2 + '" r="4"></circle>';

          // Both ends on distinct character tokens: extra readout lines (3D elevation, and cover from the map's blockers)
          var lab3 = '', labCov = '';
          var amR = getActiveMap();
          var tA = amR && tokenAtPoint(amR, m.x1, m.y1), tB = amR && tokenAtPoint(amR, m.x2, m.y2);
          var bothTok = !!(tA && tB && tA !== tB);
          if (bothTok && stanceOn('elevation') && tokenElevation(tA, amR) !== tokenElevation(tB, amR)) {   // item 19b H5: their heights, the ground each stands on included
              var hY = boardYards(m.x1, m.y1, m.x2, m.y2), vY = tokenElevation(tB, amR) - tokenElevation(tA, amR);
              lab3 = '3D ' + fmtLen(Math.sqrt(hY * hY + vY * vY)) + ' \u00b7 ' + fmtElev(vY) + ' ' + lenUnit();   // item 19 H1: in the viewer's unit
          }
          if (bothTok && window.wpFog && window.wpFog.coverBetween) {
              var cA = tokenCentre(tA), cB = tokenCentre(tB), cv = window.wpFog.coverBetween(cA.x, cA.y, cB.x, cB.y, stanceOn('elevation') ? tokenElevation(tA, amR) : 0, stanceOn('elevation') ? tokenElevation(tB, amR) : 0);   // found live (item 19): from the tokens' own cells, never the cells a snapped ruler's ends happen to fall in   // advisory: Waypoint estimates cover from the map's blockers; the GM makes the call (item 19 H1: from the first end's height to the second's)
              if (cv && cv.name) labCov = 'Cover: ' + cv.name;
          }
          var prR = tB && tB !== tA ? postureRanged(tB) : '';   // posture: its ranged note against the token the ruler ends on, after the distance (display only)
          html += '<text x="' + (mx + 8) + '" y="' + (my - 8) + '"><tspan class="fog-cap">' + measureLabel(dist, diagCells(m)) + '</tspan>' + (prR ? ' \u00b7 ' + esc(prR) : '') + '</text>';   // the length alone is drawn over the fog on a player's screen (fog.js measureCaps)
          var _covY = my + 11;
          if (lab3) { html += '<text x="' + (mx + 8) + '" y="' + _covY + '">' + lab3 + '</text>'; _covY += 19; }
          if (labCov) html += '<text x="' + (mx + 8) + '" y="' + _covY + '">' + labCov + '</text>';
          var litR = bothTok ? lightSeenBy(tA, tB, amR) : null;   // lighting L4: the light the far token stands in, as the near one (where the ruler began) sees it
          if (litR) html += rulerLightText(mx + 8, _covY + (labCov ? 19 : 0), litR);
          var rgR = bothTok ? rangeSeen(amR, tokenCentre(tA), tokenCentre(tB), tA, tB) : rangeSeen(amR, { x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 }, null, null);   // range R1: on every ruler; between two tokens as a roll reads it
          if (rgR) html += rulerRangeText(mx + 8, _covY + (labCov ? 19 : 0) + (litR ? 19 : 0), rgR);
          var mcR = rulerCostText(amR, m);   // difficult terrain T2: what the move costs, when terrain makes it cost more than its length
          if (mcR) html += '<text x="' + (mx + 8) + '" y="' + (_covY + (labCov ? 19 : 0) + (litR ? 19 : 0) + (rgR ? 19 : 0)) + '">' + esc(mcR) + '</text>';
          var hgR = bothTok ? heightSeen(tA, tB, amR) : null;   // item 19 H2: the height modifier between the two tokens, as a roll reads it
          if (hgR) html += rulerHeightText(mx + 8, _covY + (labCov ? 19 : 0) + (litR ? 19 : 0) + (rgR ? 19 : 0) + (mcR ? 19 : 0), hgR);
          html += '</g>';

      });

      layer.innerHTML = html + blastSvg();
      applyBlastHits();

  }

  (function wireMeasureClicks() {
      var layer = document.getElementById('measureLayer');
      if (!layer) return;
      layer.addEventListener('pointerdown', function(e) {
          if (!e.target.closest || window.isPanMode) return;
          var _boom = e.target.closest('.blast-boom');
          if (_boom && e.button === 0) { var _bi = parseInt(_boom.dataset.i, 10); var _bb = blasts[_bi]; if (_bb && window.wpFx) { var _ppy = mapMeasureConfig().cellPx / cellYards(); window.wpFx.blastBoom(_bb.x, _bb.y, blastRadiusYd(_bb) * _ppy); } e.stopPropagation(); e.preventDefault(); return; }
          var aimH = e.target.closest('.blast-aim');
          if (aimH && e.button === 0) {   // a cone's handle: drag it to turn the cone
              var ai = parseInt(aimH.dataset.i, 10);
              if (ai >= 0 && ai < blasts.length && ownCircle(blasts[ai])) { coneAim = { b: blasts[ai], sx: e.clientX, sy: e.clientY, moved: true, fresh: false }; e.preventDefault(); }
              e.stopPropagation(); return;
          }
          var gbd = e.target.closest('g.blast');
          if (gbd && e.button === 0) {   // drag a blast to move it (a plain click does nothing)
              var bi0 = parseInt(gbd.dataset.i, 10);
              if (bi0 >= 0 && bi0 < blasts.length && typeof blasts[bi0].tok !== 'string') { blastDrag = { i: bi0, sx: e.clientX, sy: e.clientY, ox: blasts[bi0].x, oy: blasts[bi0].y, moved: false }; e.preventDefault(); }   // a circle on a token is not dragged: it goes where its token goes
              e.stopPropagation(); return;
          }
          if (e.target.closest('g.measure') || gbd) e.stopPropagation();
      });
      // Right-click a blast to remove it
      layer.addEventListener('contextmenu', function(e) {
          var gbc = e.target.closest && e.target.closest('g.blast'); if (!gbc) return;
          e.preventDefault(); e.stopPropagation();
          var bic = parseInt(gbc.dataset.i, 10);
          if (bic >= 0 && bic < blasts.length) { var goneB = blasts.splice(bic, 1)[0]; if (ownCircle(goneB)) circleRekept(); renderMeasures(); syncBlastMenu(); toast(!ownCircle(goneB) ? 'Blast removed.' : goneB.as === 'ring' ? 'Ring removed.' : goneB.as === 'cone' ? 'Cone removed.' : 'Circle removed.'); }
      });
      document.addEventListener('pointermove', function(e) {
          if (coneAim) { coneTurn(e); return; }
          if (!blastDrag) return;
          var bm = blasts[blastDrag.i]; if (!bm) { blastDrag = null; return; }
          if (!blastDrag.moved && Math.hypot(e.clientX - blastDrag.sx, e.clientY - blastDrag.sy) < 4) return;
          blastDrag.moved = true;
          bm.x = blastDrag.ox + (e.clientX - blastDrag.sx) / state.zoomLevel;
          bm.y = blastDrag.oy + (e.clientY - blastDrag.sy) / state.zoomLevel;
          renderMeasures();
      });
      document.addEventListener('pointerup', function() {
          if (coneAim) { coneLetGo(); return; }
          if (!blastDrag) return;
          var bu = blasts[blastDrag.i], movedU = blastDrag.moved; blastDrag = null;
          if (!bu || !movedU) return;
          seatBlast(bu); renderMeasures(); syncBlastMenu();
      });
      layer.addEventListener('click', function(e) {
          if (e.target.closest && e.target.closest('g.blast')) { e.stopPropagation(); return; }   // blasts: drag moves, right-click removes
          var g = e.target.closest && e.target.closest('g.measure');
          if (!g || g.classList.contains('live')) return;
          var i = parseInt(g.dataset.i, 10);
          if (i >= 0 && i < measures.length) { measures.splice(i, 1); renderMeasures(); toast('Ruler removed.'); }
          e.stopPropagation();
      });
  })();

  function clearMeasures() { measures = []; activeMeasure = null; renderMeasures(); }

  window.appClearMeasures = clearMeasures;

  function measurePoint(e) {

      var box = wbWrap.getBoundingClientRect();

      var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;

      var y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;

      return getSnapCoords(x, y);

  }

  var _el_measureModeBtn = document.getElementById('measureModeBtn');

  var _el_measureMenu = document.getElementById('measureMenu');

  function syncMeasureMenu() {

      document.querySelectorAll('#measureUnitRow .draw-style-btn').forEach(function(b) {

          b.classList.toggle('active', b.dataset.unit === (state.measureUnit || 'imperial'));

      });

      var cfg = mapMeasureConfig();

      var vEl = document.getElementById('measureCellValue');

      var uEl = document.getElementById('measureCellUnit');

      if (vEl && document.activeElement !== vEl) vEl.value = cfg.per;

      if (uEl && document.activeElement !== uEl) uEl.value = cfg.unit;

  }



  // GM: per-map measurement scale, stored on the map so it persists

  ['measureCellValue', 'measureCellUnit'].forEach(function(id) {

      var el = document.getElementById(id);

      if (!el) return;

      el.addEventListener('change', function() {

          var m = getActiveMap();

          if (!m || !m.meta) return;

          var v = parseFloat(document.getElementById('measureCellValue').value);

          if (isFinite(v) && v > 0 && v <= 1e9) m.meta.cellValue = v;   // a sane scale (the wire refuses a whole number past 64 bits)

          m.meta.cellUnit = document.getElementById('measureCellUnit').value;

          save();

          renderMeasures();

          toast('Map scale: 1 cell = ' + (m.meta.cellValue || mapMeasureConfig().per) + ' ' + m.meta.cellUnit + '.');

      });

      el.addEventListener('keydown', function(e) { e.stopPropagation(); });

  });

  wireTool({ id: 'measureModeBtn', chev: 'measureOptBtn', inHand: function() { return !!window.isMeasureMode && window.wpMeasureKind === 'ruler'; }, sync: syncMeasureMenu, take: function() {
      window.wpMeasureKind = 'ruler'; closeBlastMenu();
      window.isMeasureMode = true;
      window.isDrawingMode = false;
      window.isEraserMode = false;
      if(wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('measureModeBtn');
      closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  } });

  // [systemcheck:unitset-start]
  // Imperial or Metric (the read-only check of 2026-10-17: a switch in Settings or in the Measure menu drew again neither the rulers nor the
  // height chips, which went on saying the old unit until something else drew them). One place sets the choice, keeps it for this computer
  // and draws again everything that reads it: the board (the chips, the target marks, Properties), the rulers and the shapes, the Radius
  // tool's boxes, both rows of buttons, and every open sheet and HUD (the Elevation row, a blast's size, a field's measure in metric too and a
  // height's half: sheets.js renderViews). Only the two words are taken. Another window of this computer (a sheet or a page in a window of its
  // own, the stream window) hears the word as a storage event and is drawn again by this same path, storing nothing (heard); a sheet in a
  // window of its own then follows by its signature, which names the setting (sheets.js unitSig). Nothing else sets the choice but the read of
  // it at the start
  function unitSet(u, heard) {
      state.measureUnit = u === 'metric' ? 'metric' : 'imperial';
      if (heard !== true) { try { localStorage.setItem('wp_measureUnit', state.measureUnit); } catch (e) {} }
      document.querySelectorAll('#measureUnitRow .draw-style-btn, .set-unit-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.unit === state.measureUnit); });
      syncMeasureMenu(); render(); renderMeasures(); syncBlastMenu();
      if (window.wpSheets && window.wpSheets.renderSheet) window.wpSheets.renderSheet();
  }
  window.wpUnitSet = unitSet;
  window.addEventListener('storage', function(ev) { if (ev && ev.key === 'wp_measureUnit' && (ev.newValue === 'metric' || ev.newValue === 'imperial') && ev.newValue !== state.measureUnit) unitSet(ev.newValue, true); });   // the word of another window of this computer
  // [systemcheck:unitset-end]
  document.querySelectorAll('#measureUnitRow .draw-style-btn').forEach(function(b) {

      b.addEventListener('click', function() { unitSet(this.dataset.unit); });

  });

  var _el_measureClearBtn = document.getElementById('measureClearBtn');

  if(_el_measureClearBtn) _el_measureClearBtn.addEventListener('click', clearMeasures);

  if (wbWrap) {

      wbWrap.addEventListener('pointerdown', function(e) {

          if (!window.isMeasureMode || e.button !== 0) return;
          if (window.wpMeasureKind === 'blast') { var nb = placeBlast(e); if (nb && nb.as === 'cone') coneAim = { b: nb, sx: e.clientX, sy: e.clientY, moved: false, fresh: true }; e.preventDefault(); return; }   // a cone is aimed while the button is held
          if (window.wpMeasureKind === 'fx') { placeFx(e); e.preventDefault(); return; }

          var p = measurePoint(e);

          activeMeasure = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };

          isMeasuring = true;

          renderMeasures();

          e.preventDefault();

      });

      wbWrap.addEventListener('pointermove', function(e) {

          if (!isMeasuring || !activeMeasure) return;

          var p = measurePoint(e);

          activeMeasure.x2 = p.x; activeMeasure.y2 = p.y;

          renderMeasures();

      });

  }

  document.addEventListener('pointerup', function() {

      if (isMeasuring && activeMeasure) {

          if (Math.hypot(activeMeasure.x2 - activeMeasure.x1, activeMeasure.y2 - activeMeasure.y1) > 2) measures.push(activeMeasure);

          activeMeasure = null;

          renderMeasures();

      }

      isMeasuring = false;

  });

  /* ---- circles on the board: the Radius tool's own, and a thrown blast's area ----
     A sub-mode of Measure (window.wpMeasureKind = 'blast'): click a cell to place a circle.
     The Radius tool is everyone's, to measure with (1.5.4). Its circle keeps a radius in yards
     (b.yd), typed and shown in the ruler's unit on that map, as a radius or as a diameter (b.as).
     A blast thrown from a sheet keeps its item's feet (b.ft, ÷3 → yards) and its name. Every
     token within a circle lights up with its distance printed. Horizontal distance is hex
     distance in yards (one hex = one yard unless the map's scale says otherwise; squares and
     gridless maps fall back to straight pixels); with the Elevation toggle on, the vertical
     difference between the token and the circle's own height joins it straight-line:
     d = sqrt(h² + v²). The tool's circles are local, like rulers — never saved, never sent. */
  window.wpMeasureKind = 'ruler';
  window.isFogMode = false;
  // [systemcheck:radius-start]
  // The Radius tool's own numbers and words (1.5.4; the owner, 2026-10-06: "lets make the explosion tool a radius/ diameter tool instead").
  // A circle keeps its RADIUS in yards, whatever was typed. Its size is typed and said in the ruler's unit on that map (by prompt: "The
  // ruler's units"): the map's own unit, turned by the viewer's Imperial or Metric choice as the ruler's label turns it. as says how the
  // number is read: 'r' from the centre to the edge, 'd' from edge to edge. as is also what is measured (circleKind): beside the two
  // circles, 'ring' (the tokens between an inner distance, inn, and the outer one, yd) and 'cone' (a wedge from the point, yd long, deg
  // degrees wide, turned to dir in radians; 0 points right). A circle may sit on a token (tok: on a shape the token's id, on the shape
  // kept for the next click true): it stands where its token stands and does not count it. The functions down to circlePref are pure.
  // Under them stand the shapes on screen, the size kept, the ruler's unit on the map on screen, whose a shape is and what it holds
  var CIRCLE_MAX_YD = 10000000, CIRCLE_MIN_YD = 0.01;
  function unitKnown(u) { return u === 'ft' || u === 'm' || u === 'km' || u === 'mi' ? u : 'yd'; }   // one of the ruler's five units, yards for anything else
  function ydPer(u) { return u === 'ft' ? 1 / 3 : u === 'm' ? 1 / 0.9144 : u === 'km' ? 1000 / 0.9144 : u === 'mi' ? 1760 : 1; }   // yards in one of them, as unitToYd counts: by the exact definitions, a yard 0.9144 m (the review of the v1.0.4 merge: 1.09361 said a token 184 yd off 168.3 m, where the ruler says 168.2)
  function rulerUnitOf(mapUnit, metric) {   // the unit the ruler's label ends in on a map of that unit
      var u = unitKnown(mapUnit);
      if (metric) return u === 'yd' || u === 'ft' ? 'm' : u === 'mi' ? 'km' : u;
      return u === 'm' ? 'yd' : u === 'km' ? 'mi' : u;
  }
  function circleAs(v) { return v === 'd' ? 'd' : 'r'; }   // how a number is read: a ring's and a cone's are distances from the point, as a radius is
  function circleKind(v) { return v === 'd' || v === 'ring' || v === 'cone' ? v : 'r'; }   // what the tool measures: a circle by its radius or by its diameter, a ring, a cone
  function shapeOf(as) { var k = circleKind(as); return k === 'ring' || k === 'cone' ? k : 'circle'; }   // the shape it is: the Shape row's own word
  function shapeNote(as, tok) { var s = shapeOf(as); return s === 'ring' ? 'A ring. The tokens between its two distances are inside.' : s === 'cone' ? 'A wedge from a point. Press a cell and drag to aim it.' : tok === true ? 'A circle on a token. It moves with its token, and does not count it.' : 'A circle. Every token inside shows its distance.'; }
  function coneDeg(v, was) { var n = typeof v === 'number' || typeof v === 'string' ? Math.round(Number(v)) : NaN; return isFinite(n) && n >= 1 && n <= 360 ? n : (typeof was === 'number' && was >= 1 && was <= 360 ? Math.round(was) : 60); }   // a cone's angle in whole degrees, 1 to 360; what does not read keeps the angle there was
  function lenTrim(v) { v = Number(v); if (!isFinite(v) || !(v > 0)) return 0; return v >= 1 ? Math.round(v * 100) / 100 : Number(v.toPrecision(3)); }   // a size as it is typed: two decimals, three figures under 1
  function circleYd(typed, as, unit, cellYd) {   // the number in the box as a radius in yards; 0: nothing to place. cellYd: the yards one cell of the map holds (circleSnap)
      var n = typeof typed === 'number' || typeof typed === 'string' ? Number(typed) : NaN;
      if (!isFinite(n) || !(n > 0)) return 0;
      var yd = circleSnap(n * ydPer(unitKnown(unit)) / (circleAs(as) === 'd' ? 2 : 1), n, as, unit, cellYd);
      return yd < CIRCLE_MIN_YD ? 0 : Math.min(CIRCLE_MAX_YD, yd);
  }
  // The box shows a size to two decimals (lenTrim), so 3 yd reads 2.74 m, and 2.74 m typed back was 2.9965 yd, short of a token three hexes
  // away (the read-only check of 2026-10-17). A size is taken at the nearest tenth of a cell where the box would show that very number, as a
  // height is kept to a tenth of a yard: 2.74 m on a map of 1 yd cells is 3 yd, 3.05 m on 5 ft squares is 10 ft. A size the box would show
  // otherwise is kept as typed, and so is every size with no cell to go by
  function circleSnap(yd, n, as, unit, cellYd) {
      var c = typeof cellYd === 'number' && isFinite(cellYd) && cellYd > 0 ? cellYd : 0; if (!c) return yd;
      var t = Math.round(yd / c * 10) / 10 * c;
      return t > 0 && circleTyped(t, as, unit) === lenTrim(n) ? t : yd;
  }
  function cellYdNow() { var c = mapMeasureConfig(); return c.per * ydPer(c.unit); }   // the yards one cell of the map on screen holds, as the board counts them (unitToYd)
  function circleTyped(yd, as, unit) { var v = Number(yd); return !isFinite(v) || !(v > 0) ? 0 : lenTrim(v * (circleAs(as) === 'd' ? 2 : 1) / ydPer(unitKnown(unit))); }   // a radius in yards as the number the box shows
  function circleWords(yd, as, unit, inn, deg, say) {   // what a shape is: a fixed word, its numbers, and a unit of the five. say: the number a distance in yards is said as (a thrown blast's, blastNum); else as the box shows it
      var k = circleKind(as), u = unitKnown(unit), n = typeof say === 'function' ? say : function(v, a) { return circleTyped(v, a, unit); };
      if (k === 'ring') return 'Ring ' + n(inn, 'r') + ' to ' + n(yd, 'r') + ' ' + u;
      if (k === 'cone') return 'Cone ' + n(yd, 'r') + ' ' + u + ', ' + coneDeg(deg, 60) + '\u00b0';
      return (k === 'd' ? 'Diameter ' : 'Radius ') + n(yd, k) + ' ' + u;
  }
  // A shape on the map in words, in the ruler's unit on that map (the owner, 2026-10-17, by prompt: "The ruler's unit (Recommended)"): the
  // tool's own by its size, a thrown blast by its name and its radius as the Radius tool says a radius, with a ring's two distances or a
  // cone's angle. The item keeps its feet inside: only what is said follows the ruler. Plain text: the caller escapes it. The label on the map
  // draws the two parts apart, since the size alone is drawn over the fog on a player's screen (fog.js measureCaps): blastName, blastSize
  function blastName(b) { return !ownCircle(b) && b && typeof b.name === 'string' && b.name ? b.name : ''; }   // a thrown blast's name; a shape of the tool's own has none
  // A thrown blast's size is said as the Radius tool says a size, but in metres or kilometres as the sheet says a measure in metric (the review of
  // the v1.0.4 merge: a 3 yd blast read 2.74 m beside a field's "3 yd (2.7 m)" and the website's own "3-yard (2.7 m) radius"): systemcore
  // metricOf, the website's rule, over the figure the same map reads under Imperial (iu: yd, ft or mi, the unit rulerImpNow gives; absent,
  // yards for metres and miles for kilometres), to the decimals that figure shows and one more for a whole one. The tool's own box keeps two
  // decimals (2.74 m), since a size typed as it shows must read back. With no system core at hand, as the box shows a size. Plain text
  function blastNum(yd, unit, iu) {
      var u = unitKnown(unit), S = window.wpSystemCore;
      if ((u === 'm' || u === 'km') && S && typeof S.metricOf === 'function') {
          var i = u === 'km' ? 'mi' : iu === 'ft' ? 'ft' : 'yd', fig = circleTyped(yd, 'r', i), t = fig > 0 ? S.metricOf(i, fig, String(fig)) : '', sp = typeof t === 'string' ? t.indexOf(' ') : -1;
          if (sp > 0) return t.slice(0, sp);
      }
      return String(circleTyped(yd, 'r', u));
  }
  function blastSize(b, unit, iu) {
      if (ownCircle(b)) return circleWords(b.yd, b.as, unit, b.inn, b.deg);
      var k = kindOf(b), r = blastRadiusYd(b), say = function(v) { return blastNum(v, unit, iu); };
      return k === 'ring' && innerYd(b) > 0 ? circleWords(r, 'ring', unit, innerYd(b), 0, say) : k === 'cone' ? circleWords(r, 'cone', unit, 0, b.deg, say) : circleWords(r, 'r', unit, 0, 0, say);
  }
  function blastWords(b, unit, iu) { var n = blastName(b); return (n ? n + ' \u00b7 ' : '') + blastSize(b, unit, iu); }
  function blastLen(ft, unit, iu) { var v = Number(ft); return blastNum(isFinite(v) ? v / 3 : 0, unit, iu) + ' ' + unitKnown(unit); }   // an item's blast radius, kept in feet, in that unit: what the sheet shows beside the item
  function rulerLen(yd, unit) { var v = Number(yd); if (!isFinite(v) || v < 0) v = 0; return String(Math.round(v / ydPer(unitKnown(unit)) * 10) / 10) + ' ' + unitKnown(unit); }   // a measured length, to a tenth as the ruler reads it
  function circleShape(o) {   // a shape's numbers, each within its bounds: { yd, as, inn, deg }. A ring's two distances in either order; where no ring is left, the whole disc
      var as = circleKind(o && o.as), yd = Number(o && o.yd), inn = Number(o && o.inn);
      if (!isFinite(yd) || yd < CIRCLE_MIN_YD) yd = 4;
      if (!isFinite(inn) || inn < CIRCLE_MIN_YD) inn = 0;
      if (as === 'ring' && inn > yd) { var t = inn; inn = yd; yd = t; }
      yd = Math.min(CIRCLE_MAX_YD, yd);
      var out = { yd: yd, as: as, inn: inn < yd ? inn : 0, deg: coneDeg(o && o.deg, 60) };
      if (o && o.tok === true && (as === 'r' || as === 'd')) out.tok = true;   // on a token: a circle's alone, and only as true
      return out;
  }
  function coneHolds(dir, deg, dx, dy) {   // is the point (dx, dy), counted from the cone's own point, within its angle? The point itself is not: a cone goes out from where it starts
      if (!(Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6)) return false;
      var a = Math.atan2(dy, dx) - (isFinite(dir) ? dir : 0); a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(a) <= deg * Math.PI / 360 + 1e-9;
  }
  function svgNum(v) { v = Number(v); return isFinite(v) ? Math.round(Math.max(-1e9, Math.min(1e9, v)) * 100) / 100 : 0; }   // a number for a path, within bounds so it is never written with an exponent: nothing else ever reaches one
  function discPath(x, y, r) { return 'M' + svgNum(x - r) + ' ' + svgNum(y) + 'a' + svgNum(r) + ' ' + svgNum(r) + ' 0 1 0 ' + svgNum(2 * r) + ' 0a' + svgNum(r) + ' ' + svgNum(r) + ' 0 1 0 ' + svgNum(-2 * r) + ' 0z'; }
  function ringPath(x, y, rOut, rIn) { return discPath(x, y, rOut) + (rIn > 0 ? discPath(x, y, rIn) : ''); }   // filled by the even-odd rule: the inner disc is the hole
  function conePath(x, y, r, dir, deg) {   // the wedge: from the point out along one edge, round the arc, and back
      if (deg >= 360) return discPath(x, y, r);
      var h = deg * Math.PI / 360, d = isFinite(dir) ? dir : 0;
      return 'M' + svgNum(x) + ' ' + svgNum(y) + 'L' + svgNum(x + r * Math.cos(d - h)) + ' ' + svgNum(y + r * Math.sin(d - h)) + 'A' + svgNum(r) + ' ' + svgNum(r) + ' 0 ' + (deg > 180 ? 1 : 0) + ' 1 ' + svgNum(x + r * Math.cos(d + h)) + ' ' + svgNum(y + r * Math.sin(d + h)) + 'z';
  }
  function circlePref(stored, oldBlast) {   // the shape kept on this computer (wp_radius); before 1.5.4 the tool kept feet (wp_blast)
      if (stored && typeof stored === 'object' && typeof stored.yd === 'number' && isFinite(stored.yd) && stored.yd >= CIRCLE_MIN_YD) return circleShape(stored);
      if (oldBlast && typeof oldBlast === 'object' && typeof oldBlast.ft === 'number' && isFinite(oldBlast.ft) && oldBlast.ft > 0) return circleShape({ yd: Math.min(3000, oldBlast.ft) / 3, as: 'r' });
      return circleShape({ yd: 4, as: 'r' });
  }
  var blasts = [];
  var BLAST_CAP = 40;   // blasts on screen per map: the oldest go as new ones land (a throw stream from a player never grows this, or every client's render, without bound)
  function pushBlast(b) { blasts.push(b); if (blasts.length > BLAST_CAP) blasts.splice(0, blasts.length - BLAST_CAP); }
  var circleKept = circleShape({ yd: 4, as: 'r' });   // the Radius tool's shape, kept on this computer (wp_radius); a thrown blast takes its feet and its name from the item
  try { circleKept = circlePref(JSON.parse(localStorage.getItem('wp_radius') || 'null'), JSON.parse(localStorage.getItem('wp_blast') || 'null')); } catch (e) {}
  var circleKeptPicked = false;   // the kept shape was picked in the options while no shape of the tool's own was on screen: a circle that comes back with its token does not take its place
  var _circleUnitShown = '';   // the unit the size box was last drawn in
  var circleDir = 0, coneAim = null;   // the way the last cone was turned, and the cone being turned: { b, sx, sy, moved, fresh } (fresh: just placed, not yet said)
  var circleCas = circleKept.as === 'd' ? 'd' : 'r';   // how a circle's number was last read: what Circle goes back to from a ring or a cone
  function rulerUnitNow() { return rulerUnitOf(mapMeasureConfig().unit, state.measureUnit === 'metric'); }   // the unit the ruler reads in on the map on screen
  function rulerImpNow() { return rulerUnitOf(mapMeasureConfig().unit, false); }   // the unit the same map reads in under Imperial: a thrown blast's metres are turned from it (blastNum)
  function ownCircle(b) { return !!b && typeof b.yd === 'number' && b.yd > 0; }   // a circle of the Radius tool's own, never a thrown blast
  // What a shape is, for one of the tool's own and for a blast alike. A blast is a circle unless an explosion gave it a shape (the owner, of
  // whether a cone or a ring should explode too: "A cone and a ring, soon"): a ring keeps its inner distance in feet (shape 'ring', inFt), a
  // cone its angle and its aim (shape 'cone', deg, dir). A shape's own numbers stay in yards (as, inn)
  function kindOf(b) { return ownCircle(b) ? circleKind(b.as) : b && (b.shape === 'ring' || b.shape === 'cone') ? b.shape : 'r'; }
  function innerYd(b) { var v = ownCircle(b) ? Number(b.inn) : Number(b && b.inFt) / 3; return isFinite(v) && v > 0 ? v : 0; }   // a ring's inner distance in yards, 0 where there is none
  function playerScreen() { var n = window.wpNet; return !!(n && (n.foreign || (n.active && n.role === 'client'))); }   // someone else's table on this screen, its link up or gone (litViewer's own test): every blast effect is the GM's
  function tokenOf(map, id) { var t = null; ((map && map.whiteboard) || []).forEach(function(w) { if (w && w.id === id && w.isChar) t = w; }); return t; }   // the character token of that id on this screen's copy of the map
  // A circle on a token stands where its token stands, at the token's height unless its own was set. With its token off this screen's copy of
  // the map (deleted, or out of a player's sight) it is lost: not drawn, holding nothing, until the token is back
  function circleFollow(map) {   // true: a circle was lost or found, so what the options show has changed
      var turned = false;
      blasts.forEach(function(b) {
          if (!ownCircle(b) || typeof b.tok !== 'string') return;
          var t = tokenOf(map, b.tok), was = b.lost === true; if (!t) { b.lost = true; if (!was) turned = true; return; }
          var c = tokenCentre(t); b.x = c.x; b.y = c.y; delete b.lost; if (was) turned = true;
          if (b.autoElev) b.elev = tokenElevation(t, map);
      });
      return turned;
  }
  window.wpCircleFollow = function() { if (blasts.some(function(b) { return typeof b.tok === 'string'; })) renderMeasures(); var amN = getActiveMap(); if (amN && amN.type === 'map') { try { doorNearSync(amN); } catch (e) {} } };   // a token moved with no redraw (a drag under way, a move from the table): a circle on a token goes with it
  function shapeHolds(b, r) {   // is the token of this distance row inside b? A thrown blast and a circle by distance, a ring between its two, a cone within its angle too
      if (b.lost) return false;
      if (typeof b.tok === 'string' && r.tok && r.tok.id === b.tok) return false;   // the token a circle sits on is its centre, not something inside it
      if (typeof b.spare === 'string' && r.tok && r.tok.id === b.spare) return false;   // an explosion set off from such a circle spares that token still
      if (r.d > blastRadiusYd(b) + 1e-9) return false;
      var k = kindOf(b);   // a blast that an exploded ring or cone left has that shape still
      if (k === 'ring') return r.d >= innerYd(b) - 1e-9;
      if (k === 'cone') { var c = tokenCentre(r.tok); return coneHolds(b.dir, b.deg, c.x - b.x, c.y - b.y); }
      return true;
  }
  // [systemcheck:radius-end]
  var _blastHitIds = [];
  var blastDrag = null;   // { i, sx, sy, ox, oy, moved } while a blast is being dragged
  var _armedThrow = null;   // { charId, fieldId, rowId, ft, name, by, damage, gmOnly } while a sheet Throw is armed (one-shot)
  function unitToYd(u) { return { yd: 1, ft: 1 / 3, m: 1 / 0.9144, km: 1000 / 0.9144, mi: 1760 }[u] || 1; }   // by the exact definitions, as ydPer
  function cellYards() { var cfg = mapMeasureConfig(); return cfg.per * unitToYd(cfg.unit); }
  function hexCellOf(x, y) {   // same rounding as datamap.js snapToHex (flat-top, s = 30, 52 px rows)
      var s = 30, h = 52, q = (x - s / 2) / (1.5 * s), r = y / h - q / 2;
      var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
      var dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r));
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
      return { q: rx, r: ry };
  }
  function hexDist(a, b) { var dq = a.q - b.q, dr = a.r - b.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }
  function tokenCentre(t) { return { x: t.x + (t.w || 60) / 2, y: t.y + (t.h || 52) / 2 }; }
  function tokenAtPoint(map, x, y, shown) {   // topmost character token whose box holds the point; shown: never one the GM hid (a reading players get, a thrown blast's height)
      var hit = null;
      (map.whiteboard || []).forEach(function(t) { if (t.isChar && !(shown && t.hidden) && x >= t.x && x <= t.x + (t.w || 60) && y >= t.y && y <= t.y + (t.h || 52)) hit = t; });
      return hit;
  }
  // Horizontal distance in yards between two board points, the way the handbook counts it
  function boardYards(ax, ay, bx, by) {
      if (state.gridType === 'hex') return hexDist(hexCellOf(ax, ay), hexCellOf(bx, by)) * cellYards();
      return Math.hypot(bx - ax, by - ay) / mapMeasureConfig().cellPx * cellYards();
  }
  function blastRadiusYd(b) { return ownCircle(b) ? b.yd : b.ft / 3; }   // the tool's own circle keeps yards; a thrown blast its item's feet
  function blastDistances(b, map) {   // every character token (hidden ones too — the GM is the only viewer)
      var elevOn = stanceOn('elevation');
      return (map.whiteboard || []).filter(function(t) { return t.isChar; }).map(function(t) {
          var c = tokenCentre(t);
          var h = yardsOn(map, b, c);   // 1.5.8: on that map's own grid (a mine may go off on a map that is not on screen)
          var v = elevOn ? tokenElevation(t, map, b.thrown === true) - (b.elev || 0) : 0;   // item 19b H5: on the ground it stands on (a thrown blast, shown to the table, never reads a hidden piece's)
          return { tok: t, h: h, v: v, d: Math.sqrt(h * h + v * v) };
      });
  }
  function blastSvg() {
      var map = getActiveMap(); if (!map) return '';
      var mineH = mineIconsSvg(map); if (!blasts.length) return mineH;   // 1.5.8 explosives: a placed mine's mark at its spot, on the GM's screen
      var pxPerYd = mapMeasureConfig().cellPx / cellYards(), elevOn = stanceOn('elevation'), html = '', ru = rulerUnitNow(), ri = rulerImpNow();
      if (circleFollow(map)) { if (!circleKeptPicked && typeof circleRekept === 'function') circleRekept(); syncBlastMenu(); }   // a circle on a token stands where its token stands now; one lost or found: the options show what is on screen, and the next click places it
      blasts.forEach(function(b, i) {
          if (b.lost) return;   // its token is off this screen's copy of the map
          var rYd = blastRadiusYd(b), rPx = rYd * pxPerYd, own = ownCircle(b);   // the tool's own circle and a thrown blast both read in the ruler's unit (blastSize); a thrown blast keeps its item's feet inside
          var onTok = own && typeof b.tok === 'string';   // on a token: a press at its centre is the token's, so its dot takes none (the style sheet's on-tok)
          html += '<g class="blast' + (own ? ' own' : '') + (onTok ? ' on-tok' : '') + '" data-i="' + i + '"><title>' + (onTok ? 'It moves with its token \u00b7 right-click its edge to remove' : 'Drag to move \u00b7 right-click to remove') + '</title>';
          var kind = kindOf(b), DOT = '<circle class="dot" cx="' + b.x + '" cy="' + b.y + '" r="6"></circle>', GRAB = '<circle class="ring" cx="' + b.x + '" cy="' + b.y + '" r="' + rPx + '"></circle>';
          if (kind === 'cone') html += '<path class="area" d="' + conePath(b.x, b.y, rPx, b.dir, b.deg) + '"></path>' + DOT + (own ? '<circle class="blast-aim" data-i="' + i + '" cx="' + svgNum(b.x + rPx * Math.cos(b.dir || 0)) + '" cy="' + svgNum(b.y + rPx * Math.sin(b.dir || 0)) + '" r="7"><title>Drag to turn the cone</title></circle>' : '');   // a path is numbers only (svgNum); a blast's cone has no handle: it went off as it was aimed
          else if (kind === 'ring' && innerYd(b) > 0) html += '<path class="area" fill-rule="evenodd" d="' + ringPath(b.x, b.y, rPx, innerYd(b) * pxPerYd) + '"></path>' + GRAB + DOT;
          else html += '<circle class="area" cx="' + b.x + '" cy="' + b.y + '" r="' + rPx + '"></circle>' + GRAB + DOT;
          if (b.thrown) html += standInSvg('grenade', b.x, b.y, b.icon);   // 1.5.8 explosives: its icon at the centre of the blast, the item's own or the stand-in
          var lblName = blastName(b) ? esc(blastName(b)) + ' \u00b7 ' : '', lblSize = esc(blastSize(b, ru, ri));   // a shape of the tool's own and a thrown blast alike in the ruler's unit (1.5.4), the words blastWords says
          var lbl = lblName + '<tspan class="fog-cap">' + lblSize + '</tspan>' + (elevOn ? ' \u00b7 at ' + fmtElev(b.elev || 0) + ' ' + lenUnit() : '');   // item 19 H1: a height in the viewer's unit. Its size alone is drawn over the fog on a player's screen (fog.js measureCaps): a name and a height stay on the board
          html += '<text x="' + (b.x + 8) + '" y="' + (kind === 'cone' ? b.y - 12 : b.y - rPx - 8) + '">' + lbl + '</text>';   // a cone's words stand at its point: it has no top
          if (!playerScreen() && kind !== 'cone' && kind !== 'ring') html += '<text class="blast-boom" data-i="' + i + '" x="' + (b.x + 8) + '" y="' + (b.y - rPx - 26) + '">💥 Boom</text>';   // fires a burst everyone sees (1.5.0)
          blastDistances(b, map).forEach(function(r) {
              if (!shapeHolds(b, r)) return;
              var cvB = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, elevOn ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;   // cover follow-ups: the cover each token in range has from the blast's centre (local, advisory); item 19 H1: from the blast's height
              html += '<text class="hit" x="' + (r.tok.x + (r.tok.w || 60) / 2) + '" y="' + (r.tok.y - 5) + '" text-anchor="middle">' + esc(rulerLen(r.d, ru)) + (elevOn && r.v ? ' (' + (r.v > 0 ? '\u2191' : '\u2193') + (Math.round(ydOut(Math.abs(r.v)) * 10) / 10) + ')' : '') + (cvB ? ' \u00b7 ' + esc(cvB.name) : '') + '</text>';
          });
          html += '</g>';
      });
      return html + mineH;
  }
  function applyBlastHits() {   // a token inside a thrown blast is marked as hit, one inside circles of the Radius tool alone as measured
      var map = getActiveMap(), hit = Object.create(null);
      if (map && blasts.length) blasts.forEach(function(b) { var own = ownCircle(b); blastDistances(b, map).forEach(function(r) { if (shapeHolds(b, r) && !(own && hit[r.tok.id])) hit[r.tok.id] = own ? 'circle-hit' : 'blast-hit'; }); });
      _blastHitIds.forEach(function(id) { if (state.wbEls[id]) state.wbEls[id].classList.remove('blast-hit', 'circle-hit'); });
      _blastHitIds = Object.keys(hit);
      _blastHitIds.forEach(function(id) { if (state.wbEls[id]) state.wbEls[id].classList.add(hit[id]); });
  }
  window.wpBlastLen = function(ft) { return blastLen(ft, rulerUnitNow(), rulerImpNow()); };   // the sheet's blast tag, in the ruler's unit on the map on screen
  window.wpRulerUnit = function() { return rulerUnitNow() + '|' + rulerImpNow(); };   // ... and that unit with the one its metres are turned from, so the sheet is drawn again on a map in another unit
  window.wpRefreshBlasts = function() { if (blasts.length || _blastHitIds.length || measures.length) renderMeasures(); };   // and the rulers placed: their words read the tokens they end on (a posture, a height) and the table's switches
  window.wpBlasts = function() { return blasts; };   // sandbox testing hook
  function clearBlasts() { blasts = []; renderMeasures(); syncBlastMenu(); if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlastClear) { var mc = getActiveMap(); window.wpNet.broadcastBlastClear(mc ? mc.id : null); } }
  // Seat a blast in its grid cell; a blast whose height was never edited follows the token standing there
  function seatBlast(b) {
      if (state.gridType === 'hex') { var hc = snapToHex(b.x, b.y, 30, 'center'); b.x = hc.x; b.y = hc.y; }
      else if (state.gridType === 'square') { b.x = Math.floor(b.x / 50) * 50 + 25; b.y = Math.floor(b.y / 50) * 50 + 25; }
      if (b.autoElev) { var mapS = getActiveMap(), under = mapS && tokenAtPoint(mapS, b.x, b.y, b.thrown); b.elev = under ? tokenElevation(under, mapS, b.thrown === true) : groundAt(mapS, b.x, b.y, b.thrown === true); }   // item 19b H5: on the ground there (a thrown blast never reads a hidden piece's)   // hidden pieces: a thrown blast (sent to the table) takes no height from a token the GM hid; the GM's own tool reads them, the GM being its only viewer
  }
  function placeBlast(e) {
      var map = getActiveMap(); if (!map) return;
      var box = wbWrap.getBoundingClientRect();
      var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;
      var y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
      if (_armedThrow) {   // a throw from a character sheet: one-shot, host-authoritative, shared to the map
          var ctx = _armedThrow; _armedThrow = null; document.body.classList.remove('placing');
          if (ctx.launch) { if (typeof launchAt === 'function') launchAt({ x: x, y: y, charId: ctx.charId, fieldId: ctx.fieldId, rowId: ctx.rowId }, map); var mvL = document.getElementById('moveModeBtn'); if (mvL) mvL.click(); return; }   // 1.5.9 Chambers from: the GM's Launch, a round's blast with no throw
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { if (window.wpNet.throwReq) window.wpNet.throwReq(ctx.charId, ctx.fieldId, ctx.rowId, x, y, map.id); }
          else placeThrownBlast({ x: x, y: y, ft: ctx.ft, name: ctx.name, by: ctx.by, charId: ctx.charId, fieldId: ctx.fieldId, rowId: ctx.rowId, damage: ctx.damage, gmOnly: ctx.gmOnly });   // 1.5.8 explosives: the row it is thrown from
          var mvB = document.getElementById('moveModeBtn'); if (mvB) mvB.click();
          return;
      }
      // The Radius tool's own circle lands in a cell, at the height of whoever stands there (a token on a catwalk), else the ground.
      // It is this screen's alone, whoever places it: nothing of it is sent, as nothing of a ruler is
      var b = { x: x, y: y, yd: circleKept.yd, as: circleKept.as, name: '', elev: 0, autoElev: true };
      if (b.as === 'ring') b.inn = circleKept.inn; else if (b.as === 'cone') { b.deg = circleKept.deg; b.dir = circleDir; }
      if (circleKept.tok === true) {   // a circle on a token: the click names the token, and the circle sits on it and nowhere else
          var onT = tokenAtPoint(map, x, y); if (!onT) { toast('Click a token to put the circle on it.'); return; }
          b.tok = onT.id;
      } else seatBlast(b);
      pushBlast(b); circleKeptPicked = false; if (typeof b.tok === 'string') circleFollow(map);
      renderMeasures(); syncBlastMenu();
      if (b.as !== 'cone') circleSaid(b, map);   // a cone is said once its aim is let go
      return b;
  }
  function circleSaid(b, map) {   // the notice for a shape of the tool's own: what it is, where it stands, how many tokens it holds
      var n = blastDistances(b, map).filter(function(r) { return shapeHolds(b, r); }).length;
      toast(circleWords(b.yd, b.as, rulerUnitNow(), b.inn, b.deg) + (stanceOn('elevation') ? ', at ' + fmtElev(b.elev) + ' ' + lenUnit() : '') + '. ' + n + ' token' + (n === 1 ? '' : 's') + ' inside. ' + (typeof b.tok === 'string' ? 'It moves with its token. Right-click its edge to remove.' : b.as === 'cone' ? 'Drag it to move, its handle to turn it, right-click to remove.' : 'Drag it to move, right-click to remove.'));
  }
  // A cone in hand follows the pointer once the pointer has really moved: a plain click leaves it turned as the last one was
  function coneTurn(e) {
      var a = coneAim, b = a && a.b; if (!b || blasts.indexOf(b) < 0) { coneAim = null; return; }
      if (e.buttons === 0) { coneLetGo(); return; }   // the button was let go where no pointerup came, outside the window: the aim ends here
      if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 6) return;
      a.moved = true;
      var box = wbWrap.getBoundingClientRect(), dx = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel - b.x, dy = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel - b.y;
      if (Math.hypot(dx, dy) < 4) return;   // on the point itself there is no way to turn
      b.dir = Math.atan2(dy, dx); renderMeasures();
  }
  function coneLetGo() {
      var a = coneAim; coneAim = null; if (!a || !a.b || blasts.indexOf(a.b) < 0) return;
      circleDir = typeof a.b.dir === 'number' && isFinite(a.b.dir) ? a.b.dir : 0;
      if (a.fresh) { var m = getActiveMap(); if (m) circleSaid(a.b, m); }
      syncBlastMenu();
  }
  // A blast thrown from a character sheet: placed on the host, shown to everyone on the map (never the personal quick-tool). opts: x, y (the
  // point clicked), ft, name, by, charId, fieldId, rowId (the row it is thrown from), damage, gmOnly; and from this machine alone: goOff (a mine
  // going off: no roll, no aim), direct (the token struck directly), dtype, notes, icon. mapIn: the map it goes off on (the map on screen else)
  function placeThrownBlast(opts, mapIn) {
      var map = mapIn || getActiveMap(); if (!map || !opts) return null;
      var pre = typeof throwPrep === 'function' ? throwPrep(opts, map) : null;   // 1.5.8 explosives: its row, its aim, its roll and its scatter (a suite runs this function alone)
      if (pre && pre.stop) { toast(pre.stop); return null; }
      if (pre && pre.mine !== undefined) return pre.mine;
      var amS = getActiveMap(), onScreen = !mapIn || !!(amS && amS.id === map.id), land = pre ? pre.land : { x: opts.x, y: opts.y };   // by its id: the map on screen
      var ft = Math.max(1, Math.min(3000, Math.round(opts.ft || 0))) || 12;
      var b = { x: land.x, y: land.y, ft: ft, name: opts.name || '', elev: (opts.elev !== undefined ? opts.elev : 0), autoElev: opts.elev === undefined, thrown: true, by: opts.by || '' };
      if (pre) {   // 1.5.8: the blast's own id (its card's Apply to all), the damage it rolls, its type, the token struck directly, its notes and its icon
          b.bid = 'b_' + Math.random().toString(36).slice(2, 12); b.dmgExpr = typeof opts.damage === 'string' ? opts.damage : ''; if (pre.direct) b.direct = pre.direct; if (opts.gmOnly) b.gm = true;
          var dty = opts.goOff ? opts.dtype : pre.area && pre.area.type; if (typeof dty === 'string' && dty) b.dtype = dty;
          var nts = opts.goOff ? opts.notes : pre.def && !opts.gmOnly ? pre.def.notes : ''; if (typeof nts === 'string' && nts.trim()) b.notes = nts.trim().slice(0, 800);
          var ico = opts.goOff ? opts.icon : pre.def ? pre.def.icon : ''; if (typeof ico === 'string' && ico) b.icon = ico;
          var adB = opts.goOff ? opts.ad : pre.area && pre.area.ad; if (typeof adB === 'number' && isFinite(adB) && adB > 0) b.ad = adB;
          var fgB = opts.goOff ? opts.frag : pre.area && pre.area.frag; if (typeof fgB === 'string' && fgB) { b.frag = { expr: fgB.slice(0, 1200), by: typeof opts.charId === 'string' ? opts.charId : '', gm: !!opts.gmOnly }; var fgT = opts.goOff ? opts.fragType : pre.area && pre.area.fragType; if (typeof fgT === 'string' && fgT) b.frag.type = fgT; }   // 1.5.9 (es): its fragmentation, rolled as it goes off (the host's memory alone: broadcastBlast names none of it)
          var afB = opts.goOff ? opts.aff : pre.area && pre.area.aff, BCa = window.wpBlastCore, afC = Array.isArray(afB) && BCa && typeof BCa.cleanAffs === 'function' ? BCa.cleanAffs(afB) : null; if (afC) b.aff = afC;   // 1.5.9 (es): its afflictions, rolled by those it reaches as it goes off (the host's memory alone, as its fragmentation)
      }
      if (onScreen) seatBlast(b);
      var thrB = opts.charId ? (map.whiteboard || []).filter(function(w) { return w.charId === opts.charId; }).sort(function(p, q) { return (q.isChar ? 1 : 0) - (p.isChar ? 1 : 0); })[0] : null;   // cover follow-ups (owner, answer 5): the thrower's token on this map
      var seatB = window.wpFog && window.wpFog.blastSeat ? window.wpFog.blastSeat(map, b.x, b.y, thrB ? thrB.x + (thrB.w || 60) / 2 : opts.x, thrB ? thrB.y + (thrB.h || 52) / 2 : opts.y) : null;   // a blast can't go off inside a wall or a closed door: it goes off in front, on the thrower's side
      if (seatB) { b.x = seatB.x; b.y = seatB.y; if (b.autoElev) { var underB = tokenAtPoint(map, b.x, b.y, true); b.elev = underB ? tokenElevation(underB, map, true) : groundAt(map, b.x, b.y, true); } }
      if (onScreen) { pushBlast(b); renderMeasures(); syncBlastMenu(); }
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlast) window.wpNet.broadcastBlast({ x: b.x, y: b.y, ft: b.ft, name: opts.gmOnly ? '' : b.name, elev: b.elev, by: b.by }, map.id);   // a GM-only item's blast reaches players unnamed
      var n = blastDistances(b, map).filter(function(r) { return r.d <= blastRadiusYd(b) + 1e-9; }).length;
      var rw = typeof blastSize === 'function' && typeof rulerUnitNow === 'function' ? blastSize({ ft: b.ft }, rulerUnitNow(), typeof rulerImpNow === 'function' ? rulerImpNow() : '') : 'Radius ' + b.ft + ' ft';   // in the ruler's unit, as its label (1.5.4): in metres as the sheet says a measure
      toast((opts.goOff ? (b.name || 'A mine') + (pre && pre.fuse ? ' lands' : ' goes off') : (b.by ? b.by + ' throws ' : 'Thrown: ') + (b.name || 'a blast')) + ', ' + rw.charAt(0).toLowerCase() + rw.slice(1) + '. ' + n + ' token' + (n === 1 ? '' : 's') + ' in range.' + (pre ? pre.said : '') + (seatB ? ' It went off in front of the wall or door it hit.' : '') + (onScreen ? '' : ' It went off on ' + (map.title || 'another map') + '.'));
      if (pre && pre.area && pre.area.use === true && pre.tr && typeof useOneUp === 'function') useOneUp(getActiveCampaign(), pre.tr);
      if (pre && pre.fuse && typeof fuseSet === 'function') { fuseSet(map, b, opts, n); return b; }   // 1.5.8: it goes off at the start of the next turn
      resolveThrow(b, opts, n, map);
      return b;
  }
  window.wpPlaceThrownBlast = placeThrownBlast;   // net.js calls this on the host after validating a player's throw-req
  // The damage half of a throw (host/solo only): roll the item's damage, and in full-auto apply it to every in-range token as one undoable
  // transaction. blastAuto: full = roll+apply, roll = roll to chat (its card can apply it to all in the blast, once), measure = neither
  function resolveThrow(b, opts, nInRange, mapIn) {
      var camp = getActiveCampaign(), sys = camp && camp.system, fgN = b && b.frag ? (opts && opts.name || 'The blast') : '', afN = b && b.aff ? (opts && opts.name || 'The blast') : ''; if (!sys || !opts || !opts.damage) { if (fgN && sys && opts) toast(fgN + ' has no damage roll, so its fragmentation was not rolled.'); if (afN && sys && opts && typeof applyBlastAffs === 'function') applyBlastAffs(b, mapIn, afN); return; }   // 1.5.9 (es): fragmentation rides on the blast's damage; an affliction does not (one that reaches everyone in the blast is rolled at once)
      var combat = sys.combat || {}, auto = combat.blastAuto || 'full';
      if (auto === 'measure') { if (fgN) toast('Blast automation is Measure only, so the fragmentation of ' + fgN + ' was not rolled.'); if (afN) toast('Blast automation is Measure only, so the afflictions of ' + afN + ' were not rolled.'); return; }
      if (window.wpVtt && !window.wpVtt.on('dice')) { if (fgN) toast('Dice are off, so the fragmentation of ' + fgN + ' was not rolled.'); if (afN) toast('Dice are off, so the afflictions of ' + afN + ' were not rolled.'); return; }
      if (!window.wpDice || !window.wpDice.rollFor) return;
      var dr = window.wpDice.rollFor(opts.charId, opts.damage, (opts.name || 'Blast') + ' damage', { gmOnly: !!opts.gmOnly, dmg: true, blast: b && b.bid });   // a GM-only item's damage stays the GM's; chat cards: a damage card (an item's damage is damage by nature, as on his reference sheets)
      var total = dr && dr.ok && typeof dr.value === 'number' ? dr.value : null;
      if (auto !== 'full' || total === null) { if (fgN && auto === 'roll' && total !== null) toast('The fragmentation of ' + fgN + ' is rolled when you press Apply to all in the blast.'); if (afN && auto === 'roll' && total !== null) toast('The afflictions of ' + afN + ' are rolled when you press Apply to all in the blast.'); return; }
      applyBlastDamage(b, total, combat.hpResource, mapIn);
  }
  var _lastThrowTx = null;
  // [systemcheck:explosives-start]
  // 1.5.8 explosives (the owner, 2026-10-25, by prompt: "Blast damage by the book", "Throw like the site"; and "once it starts using the site
  // throws, it should automatically place an explosive in the area indicated in the throw, following rules on when it automatically detonates
  // and causes damage", "Mines only activate when they are stepped on, as opposed to grenades that automatically detonate once deployed").
  // The host's half: blastcore.js is the pure one. A throw knows what it aims at: the character token clicked, else the point clicked. Where the
  // system's Combat card names a throw's roll (combat.blast.roll) and the item a throw skill, the host rolls it first, with the range to the aim:
  // a success lands on the aim, a miss scatters from it along the line of the throw by the scatter's feet, a critical failure goes off in the
  // thrower's hand. Where the card names how far and how near a thing may be thrown (max, min, in yards), a throw past them is refused in
  // words. A thrown explosive goes off where it lands, at once. An item marked Placed, not thrown (a mine) is laid as a trigger zone hidden
  // from players and goes off only when a character token steps into its trigger radius, or by the GM's own hand; never when it is placed.
  // Going off uses one up where the item says so (its area's use). A blast's damage takes each token's share by the card's falloff
  // (combat.blast.fall) and, where the system has the damage step, sends it through it: DR at the default location (the first row named
  // Torso), the blast's damage type, the pool. With no falloff a blast is what it always was
  function blastRules(sys) { var c = sys && sys.combat && typeof sys.combat === 'object' ? sys.combat : null; return c && c.blast && typeof c.blast === 'object' && !Array.isArray(c.blast) ? c.blast : null; }
  function throwRowOf(camp, opts) {   // the carried row a throw names, on this machine's own copy: { ch, f, row, def } (def: its definition, the GM's view)
      var S = window.wpSystemCore, sys = camp && camp.system; if (!S || !sys || !opts || typeof opts.charId !== 'string' || typeof opts.fieldId !== 'string' || typeof opts.rowId !== 'string') return null;
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, opts.charId) ? camp.chars[opts.charId] : null; if (!ch) return null;
      var f = S.fieldById(sys, opts.fieldId); if (!f || f.kind !== 'item-list') return null;
      var row = (ch.values && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []).filter(function(r) { return r && r.hid !== 1 && S.rowIdOf(r) === opts.rowId; })[0]; if (!row) return null;
      var rd = S.rowDef(sys, row); return rd && rd.def ? { ch: ch, f: f, row: row, def: rd.def } : null;
  }
  function throwerOf(map, charId) { return charId ? (map.whiteboard || []).filter(function(w) { return w && w.charId === charId && !w.waiting; }).sort(function(p, q) { return (q.isChar ? 1 : 0) - (p.isChar ? 1 : 0); })[0] || null : null; }
  function blastBid() { return 'b_' + Math.random().toString(36).slice(2, 12); }
  function yardsOn(map, a, b) {   // yards between two board points on that map: the board's own reading on the map on screen, the map's own grid elsewhere
      var amY = getActiveMap(); if (!map || (amY && amY.id === map.id)) return boardYards(a.x, a.y, b.x, b.y);
      var S = window.wpSystemCore, camp = getActiveCampaign(), d = S && S.rangeDist ? S.rangeDist(camp && camp.system, map, a, b, 'yd') : null;
      return typeof d === 'number' && isFinite(d) ? d : Math.hypot(b.x - a.x, b.y - a.y) / 50;
  }
  function blastFig(text, vars, dice) {   // a formula of the card's, worked out with these names; null where it gives no number
      var F = window.wpFormula; if (!F || typeof text !== 'string' || !text) return null;
      var o = { vars: vars }; if (!dice) o.random = function() { return NaN; };
      var r = F.evaluate(text, o); if (!r || !r.ok) return null;
      var v = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof v === 'number' && isFinite(v) ? v : null;
  }
  function useOneUp(camp, tr) {   // going off (or being placed) uses one up: one less on the thrower's row, the row gone at none, as any row change
      var S = window.wpSystemCore, F = window.wpFormula, sys = camp && camp.system; if (!S || !F || !sys || !tr) return false;
      var q = (tr.row.qty | 0) > 1 ? { op: 'setQty', rowId: S.rowIdOf(tr.row), qty: (tr.row.qty | 0) - 1 } : { op: 'remove', rowId: S.rowIdOf(tr.row) };
      var r = S.applyRowOp(sys, tr.ch, tr.f.id, q, F, {}); if (!r || !r.ok) return false;
      tr.ch.values = tr.ch.values || {}; tr.ch.values[tr.f.id] = r.value; tr.ch.updated = Date.now();
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta) { var d = {}; d[tr.f.id] = r.value; window.wpNet.syncCharDelta(tr.ch.id, d); }
      if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(tr.ch.id);
      return true;
  }
  // The throw's own half, before it lands: its row, its aim, how far it may go, its roll and where a miss scatters to. { stop } where it is not
  // thrown at all (said in words); { mine } for a placed one; else { land, direct, said, tr, area, def }. The host's alone
  function throwPrep(opts, map) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, rules = blastRules(sys), amP = getActiveMap(), onScreen = !!(amP && amP.id === map.id);
      var tr = opts.goOff ? null : throwRowOf(camp, opts), def = tr ? tr.def : null, area = def && def.area && typeof def.area === 'object' ? def.area : null;
      if (area && area.place === true) return { mine: placeMine(opts, tr, map) };   // a mine is placed, never thrown
      var thrB = throwerOf(map, opts.charId), thrC = thrB ? tokenCentre(thrB) : null;
      var aimT = opts.goOff ? null : tokenAtPoint(map, opts.x, opts.y, true), aim = aimT ? tokenCentre(aimT) : { x: opts.x, y: opts.y };   // the aim: the character token clicked, else the point
      var out = { land: { x: aim.x, y: aim.y }, direct: opts.goOff ? (opts.direct || null) : aimT ? aimT.id : null, said: opts.goOff && typeof opts.said === 'string' ? opts.said.slice(0, 400) : '', tr: tr, area: area, def: def };   // 1.5.9 (es): a launched round's miss says where it went
      var fz = (!opts.goOff || opts.fuseOk === true) && rules && rules.fuse === 'turn' && window.wpNet && typeof window.wpNet.combatFor === 'function' ? window.wpNet.combatFor(map.id) : null; if (fz) out.fuse = true;   // a fuse: a fight on its map
      if (opts.goOff || !rules || !thrC || !tr || !S || !F) return out;
      var R = S.makeResolver(sys, tr.ch, F), rowR = R && typeof R.row === 'function' ? R.row(tr.f.id, opts.rowId) : null, dYd = yardsOn(map, thrC, aim);
      var lenW = function(yd) { return typeof rulerLen === 'function' && typeof rulerUnitNow === 'function' ? rulerLen(yd, rulerUnitNow()) : Math.round(yd * 10) / 10 + ' yd'; };
      var mx = rules.max && rowR ? blastFig(rules.max, rowR, false) : null, mn = rules.min && rowR ? blastFig(rules.min, rowR, false) : null;
      if (mx !== null && dYd > mx + 1e-9) return { stop: 'Too far to throw: the aim is ' + lenW(dYd) + ' away, and ' + (opts.name || 'it') + ' can be thrown ' + lenW(Math.max(0, mx)) + ' at most.' };
      if (mn !== null && dYd < mn - 1e-9) return { stop: 'Too near to throw: the aim is ' + lenW(dYd) + ' away, and ' + (opts.name || 'it') + ' must be thrown ' + lenW(Math.max(0, mn)) + ' at least.' };
      if (!rules.roll || typeof def.throwSkill !== 'string' || !def.throwSkill || !window.wpDice || !window.wpDice.rollFor || !BC) return out;
      var expr = rules.roll.replace(/\bThrowSkill\b/gi, '(' + def.throwSkill + ')');
      var rc = S.rangeCtx ? S.rangeCtx(sys, map, thrB, { x: aim.x - 30, y: aim.y - 26, w: 60, h: 52 }, { F: F }) : null;
      var tdr = window.wpDice.rollFor(opts.charId, expr, (opts.name || 'Blast') + ' throw', { gmOnly: !!opts.gmOnly, range: rc ? { mod: rc.mod, dist: rc.dist } : undefined });
      if (!tdr || !tdr.ok) return { stop: 'The throw could not be rolled' + (tdr && tdr.error ? ': ' + tdr.error : '.') };
      var oc = BC.throwOutcome(window.wpNet ? window.wpNet.rollCheck : null);   // the throw's pass, critical and margin, as net.diceRoll read them
      if (oc.kind === 'fumble') {   // it drops at the thrower's feet; where the card's hand rule holds of its dice, it goes off in the hand, a direct hit on the thrower
          var inHand = rules.hand && oc.natural !== null ? blastFig(rules.hand, function(n) { return String(n).toLowerCase() === 'natural' ? oc.natural : undefined; }, false) : null;
          out.land = { x: thrC.x, y: thrC.y }; out.direct = inHand ? thrB.id : null; out.said = inHand ? ' A critical failure: it goes off in the thrower\u2019s hand.' : ' A critical failure: it drops at the thrower\u2019s feet.';
      }
      else if (oc.kind === 'miss') {
          var syd = rules.scatter ? blastFig(rules.scatter, function(n) { var l = String(n).toLowerCase(); return l === 'margin' ? oc.margin : l === 'throwdistance' ? dYd : undefined; }, true) : BC.bookScatterYd(oc.margin, dYd);
          syd = typeof syd === 'number' && isFinite(syd) ? Math.max(0, Math.min(1000, syd)) : BC.bookScatterYd(oc.margin, dYd);
          var nWays = rules.ways === 8 ? 8 : 6, sp = BC.scatterPoint(aim, thrC, syd, Math.floor(Math.random() * nWays), onScreen ? mapMeasureConfig().cellPx / cellYards() : 50, nWays);   // the way rolled as a die of the ways' count
          if (sp) { out.land = { x: Math.max(0, sp.x), y: Math.max(0, sp.y) }; out.direct = null; out.said = ' A miss by ' + oc.margin + ': it lands ' + lenW(syd) + ' ' + sp.words.toLowerCase() + ' of the aim.'; }
      }
      return out;
  }
  function torsoOf(sys, ch) {   // the damage step's default location: the first row of the location list named Torso, else one that holds the word, else the first
      var S = window.wpSystemCore, d = sys && sys.combat && sys.combat.damage, lf = d && d.locs && S ? S.fieldById(sys, d.locs.list) : null; if (!lf) return '';
      var rows = (ch.values && Array.isArray(ch.values[lf.id]) ? ch.values[lf.id] : []).filter(function(r) { return r && r.hid !== 1; }).map(function(r) { var rd = S.rowDef(sys, r); return { id: S.rowIdOf(r), name: rd && rd.def && typeof rd.def.name === 'string' ? rd.def.name : '' }; }).filter(function(x) { return x.id; });
      var hit = rows.filter(function(x) { return /^torso$/i.test(x.name); })[0] || rows.filter(function(x) { return /torso/i.test(x.name); })[0] || rows[0];
      return hit ? hit.id : '';
  }
  // 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): a blast's fragmentation, after its shares and in the same pass. It reaches
  // the Combat card's frag.reach in yards (read with FragDice, the dice it rolls), else the blast's own radius, and never less; who rolls what is
  // blastcore fragTargets: one roll every token shares, or one each under frag.each, and the token struck directly a roll of its own under
  // frag.direct. Only total cover stops it under frag.cover 'total', where a token partly behind cover takes it all; else the system's cover
  // outcomes, as the blast. Each hit is rolled with the thrower's character (a damage card already applied, kept as private as the item) and
  // goes through the damage step where the system has one, at the default location, by the item's fragmentation type, else the card's, else
  // the blast's, with no falloff and the item's armour divisor only under frag.ad; else off the damage resource. write: the pass's own writer,
  // which keeps what each character held first for the Undo. { hit, shielded } or null where the blast carries none
  function fragPass(b, map, camp, sys, hpId, write, mark) {   // mark (1.5.9, afflictions): told who each hit wounded and whom it reached
      var S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, fg = b && b.frag && typeof b.frag === 'object' ? b.frag : null;
      if (!fg || typeof fg.expr !== 'string' || !fg.expr || !S || !F || !BC || typeof BC.fragTargets !== 'function' || !window.wpDice || typeof window.wpDice.rollFor !== 'function') return null;
      var rules = blastRules(sys), fr = rules && rules.frag && typeof rules.frag === 'object' ? rules.frag : {}, dice = BC.diceCount(fg.expr), rad = blastRadiusYd(b);
      var rch = fr.reach ? blastFig(fr.reach, function(n) { return String(n).toLowerCase() === 'fragdice' ? dice : undefined; }, false) : null;
      var reach = typeof rch === 'number' && isFinite(rch) ? Math.max(rad, Math.min(10000, rch)) : rad;
      var dr = blastDistances(b, map).filter(function(r) { return r && r.tok && typeof r.tok.charId === 'string' && !(typeof b.spare === 'string' && r.tok.id === b.spare); }), byId = Object.create(null);
      dr.forEach(function(r) { if (!byId[r.tok.id]) byId[r.tok.id] = r; });
      var who = BC.fragTargets(dr.map(function(r) { return { id: r.tok.id, d: r.d }; }), reach, { direct: typeof b.direct === 'string' ? b.direct : null, own: fr.direct === true, each: fr.each === true });
      var dstep = !!(sys.combat && sys.combat.damage && typeof S.damageStep === 'function'), types = dstep && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [];
      var ty = [fg.type, fr.type, b.dtype].filter(function(t) { return typeof t === 'string' && t; })[0] || '', tyOk = !!(ty && types.some(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === ty.toLowerCase(); }));
      var label = (b.name || 'Blast') + ' fragmentation', shared, rollOne = function() { var r = window.wpDice.rollFor(fg.by, fg.expr, label, { gmOnly: fg.gm === true, dmg: true, used: true }); return r && r.ok && typeof r.value === 'number' && isFinite(r.value) ? r.value : null; };
      var elevOn = stanceOn('elevation'), hit = 0, shielded = 0;
      who.forEach(function(w) {
          var r = byId[w.id], ch = r && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, r.tok.charId) ? camp.chars[r.tok.charId] : null; if (!ch) return;   // own ids only
          var tierF = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, elevOn ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;
          if (fr.cover === 'total' ? !!(tierF && tierF.block) : S.coverOutcome && S.coverOutcome(sys, tierF) === 'none') { shielded++; return; }   // stopped before anything is rolled for it
          var amt = w.own ? rollOne() : (shared === undefined ? (shared = rollOne()) : shared); if (amt === null) return;
          if (fr.cover !== 'total' && S.coverDamage) amt = S.coverDamage(sys, tierF, amt);
          amt = Math.floor(amt); if (!(amt > 0)) return;
          var vals = null, lines = null;
          if (dstep) {
              var q = { amt: amt }, loc = typeof torsoOf === 'function' ? torsoOf(sys, ch) : ''; if (loc) q.loc = loc; if (tyOk) q.type = ty; if (fr.ad === true && typeof b.ad === 'number' && b.ad > 0) q.ad = b.ad;
              var st = S.damageStep(sys, ch, q, F); if (!st || !st.ok) return; vals = st.values; lines = st.lines;
          } else if (hpId) {
              var all = S.resolveAll(sys, ch, F), e = all[hpId]; if (!e) return;
              var res = S.applyEdit(sys, ch, hpId, { cur: (typeof e.value === 'number' ? e.value : 0) - amt }, F, {}); if (!res.ok) return;
              vals = {}; vals[hpId] = res.value;
          } else return;
          write(ch, r.tok.charId, vals); hit++; if (typeof mark === 'function') mark(r.tok.charId, dstep ? !!(st && st.info && st.info.wound > 0) : true, true);
          if (lines && window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, [(fg.gm === true ? 'Fragmentation' : label) + ':'].concat(lines));   // what it did, to the GM and the character's player
      });
      return { hit: hit, shielded: shielded };
  }
  // The pass's one writer: one entry a character for the Undo, holding what it had before the blast first wrote each field, an effects list among
  // them (1.5.9: a blast's fragmentation and its afflictions write too), each change sent to the table and told to the sheet
  function blastWriter(byChar, hits) {
      return function(ch, charId, vals) {
          var h = byChar[charId]; if (!h) { h = byChar[charId] = { charId: charId, prevs: {} }; hits.push(h); }
          Object.keys(vals).forEach(function(fid) { if (!Object.prototype.hasOwnProperty.call(h.prevs, fid)) h.prevs[fid] = ch.values && Object.prototype.hasOwnProperty.call(ch.values, fid) ? JSON.parse(JSON.stringify(ch.values[fid])) : undefined; });
          ch.values = ch.values || {}; Object.keys(vals).forEach(function(fid) { ch.values[fid] = vals[fid]; }); ch.updated = Date.now();
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta && Object.keys(vals).length) window.wpNet.syncCharDelta(charId, vals);
          if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(charId);
      };
  }
  // 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2, its affliction half): a blast's afflictions, after its shares and its fragmentation
  // and in the same pass. Each reaches everyone in the blast's own radius (who all; a character the system's cover outcome shields passed over),
  // else those the blast or its fragmentation wounded, after DR, or under the Combat card's hurt 'share' those any share of it reached (H7). A
  // character its Only where does not hold for is not touched. Each other rolls the Combat card's resist roll as itself, Resist standing for the
  // item's resist target read with its own names (an NPC's card the GM's, a GM-only item's kept the GM's); a failure puts the effect on in the list
  // that holds it, else the system's first effects list (applyEffectOp's add: on again and its timer afresh where it is there), for its Lasts
  // where that is set (rolled as the victim) and else the effect's own time. With no resist roll on the card nothing is rolled, and the GM is told
  // who must resist and against what. Each victim's card goes to the GM and its player, naming neither a GM-only item nor a GM-only effect.
  // hurt: { w, s }, the character ids it wounded and reached, in order. { on, resisted, held } or null where the blast carries none
  function affPass(b, map, camp, sys, write, hurt) {
      var S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, A = b && Array.isArray(b.aff) ? b.aff : null;
      if (!A || !A.length || !S || !F || !BC || typeof BC.affTargets !== 'function' || typeof S.applyEffectOp !== 'function' || !window.wpDice || typeof window.wpDice.rollFor !== 'function') return null;
      var rules = blastRules(sys), rs = rules && typeof rules.resist === 'string' ? rules.resist : '', byShare = !!(rules && rules.hurt === 'share'), hu = hurt && typeof hurt === 'object' ? hurt : { w: [], s: [] };
      var defs = Object.create(null); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') defs[d.id] = d; });
      var fxLists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return f && f.kind === 'effects'; });
      var elevOn = stanceOn('elevation'), inB = null, nm = b.gm === true ? '' : (b.name || ''), out = { on: 0, resisted: 0, held: 0 }, owed = [], gone = 0, odd = 0;
      var inBlast = function() {   // every character in the blast, with whether the system's cover outcome shields it (worked out once)
          if (inB) return inB; inB = [];
          blastDistances(b, map).forEach(function(r) {
              if (!r || !r.tok || typeof r.tok.charId !== 'string' || !shapeHolds(b, r)) return;
              var tier = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, elevOn ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;
              inB.push({ id: r.tok.charId, shielded: !!(S.coverOutcome && S.coverOutcome(sys, tier) === 'none') });
          });
          return inB;
      };
      A.forEach(function(a) {
          if (!a || typeof a.vs !== 'string' || typeof a.fx !== 'string') return;
          var def = Object.prototype.hasOwnProperty.call(defs, a.fx) ? defs[a.fx] : null; if (!def) { gone++; return; }   // an effect the system no longer has
          BC.affTargets(a.who === 'all' ? inBlast() : null, byShare ? hu.s : hu.w, a.who === 'all').forEach(function(cid) {
              var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, cid) ? camp.chars[cid] : null; if (!ch) return;   // own ids only
              var vars = S.makeResolver(sys, ch, F);
              if (typeof a.needs === 'string' && a.needs && !S.rollNeedsOk({ needs: a.needs }, vars, F)) { out.held++; return; }
              if (!rs) { owed.push(String(ch.name || 'A character').slice(0, 60)); return; }
              var rr = window.wpDice.rollFor(cid, rs.replace(/\bResist\b/gi, function() { return '(' + a.vs + ')'; }), nm ? nm + ' resist' : 'Resist', { gmOnly: b.gm === true, priv: ch.npc === true || !ch.ownerId });
              var ck = rr && rr.ok && window.wpNet ? window.wpNet.rollCheck : null; if (!ck || typeof ck.pass !== 'boolean') { odd++; return; }   // a resist roll that is no check puts nothing on
              var bare = (rr.priv === true || b.gm === true) && ch.npc !== true && !!ch.ownerId;   // the review of fold 4: a resist roll kept the GM's (a GM-only item, a GM-only value it read) keeps its figures off its player's card
              var vsW = !bare && typeof ck.total === 'number' && isFinite(ck.total) && typeof ck.target === 'number' && isFinite(ck.target) ? ', ' + ck.total + ' against ' + ck.target : '', head = (nm || 'Affliction') + ':';
              if (ck.pass) { out.resisted++; if (window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, [head, 'Resisted' + vsW + '.']); return; }
              var secs = 0, lw = '';
              if (a.lasts && typeof a.lasts.n === 'string' && typeof S.affLastsSecs === 'function') { var lr = F.evaluate(a.lasts.n, { vars: vars }), ln = lr && lr.ok && typeof lr.value === 'number' && isFinite(lr.value) ? lr.value : 0; if (ln > 0) { secs = S.affLastsSecs(sys, ln, a.lasts.u); if (secs > 0) lw = lastsWords(sys, ln, a.lasts.u); } }   // rolled as the victim
              var fl = fxLists.filter(function(f) { var l = ch.values ? ch.values[f.id] : null; return Array.isArray(l) && l.some(function(x) { return x && x.ref === a.fx; }); })[0] || fxLists[0]; if (!fl) { odd++; return; }
              var res = S.applyEffectOp(sys, ch, fl.id, { op: 'add', rowId: 'x_' + Math.random().toString(36).slice(2, 14), ref: a.fx }, F, { now: Date.now(), inCombat: !!(window.wpNet && typeof window.wpNet.charInCombat === 'function' && window.wpNet.charInCombat(cid)), secs: secs > 0 ? secs : undefined });
              if (!res || !res.ok) { odd++; return; }
              var vals = {}; vals[fl.id] = res.value; if (res.clamp) Object.keys(res.clamp).forEach(function(k) { vals[k] = res.clamp[k]; });
              write(ch, cid, vals); out.on++;
              if (window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, [head, 'Failed to resist' + vsW + '.', (def.vis === 'gm' ? 'An effect' : String(def.name || 'An effect').slice(0, 60)) + ' is on' + (lw ? ' for ' + lw : '') + '.']);   // to the GM and the character's player
          });
      });
      var who = nm || 'The blast';
      if (owed.length) toast(who + ': ' + owed.slice(0, 6).join(', ') + (owed.length > 6 ? ' and ' + (owed.length - 6) + ' more' : '') + ' must resist. The Combat card has no resist roll, so nothing was rolled.');
      if (gone) toast(who + ': the effect an affliction puts on is gone from the system, so it was not rolled.');
      if (odd) toast(who + ': ' + odd + ' resist roll' + (odd === 1 ? '' : 's') + ' could not be judged, so nothing was put on. The resist roll must be a check, such as 3d6 <= Resist.');
      return out;
  }
  function lastsWords(sys, n, u) {   // an affliction's Lasts as words: 4 minutes, 1 turn, 2 watches
      var W = { turns: ['turn', 'turns'], seconds: ['second', 'seconds'], minutes: ['minute', 'minutes'], hours: ['hour', 'hours'], days: ['day', 'days'] }, num = String(Math.round(n * 100) / 100);
      if (Object.prototype.hasOwnProperty.call(W, u)) return num + ' ' + W[u][n === 1 ? 0 : 1];
      var t = sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : [], hit = t.filter(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === String(u).toLowerCase(); })[0];
      return num + ' ' + String(hit && hit.label ? hit.label : u).slice(0, 60);
  }
  function affNote(ap) { return ap ? (ap.on ? ' · ' + ap.on + ' failed to resist' : '') + (ap.resisted ? ' · ' + ap.resisted + ' resisted' : '') : ''; }   // counts only, as the rest of the notice
  // An item with no damage roll: its afflictions alone, rolled as it goes off (one that reaches everyone in the blast; one that reaches those it
  // hurt reaches no one). Measure only and dice off roll nothing and say so
  function applyBlastAffs(b, mapIn, nm) {
      var camp = getActiveCampaign(), sys = camp && camp.system, map = mapIn || getActiveMap(); if (!sys || !map || !b) return null;
      var auto = (sys.combat && sys.combat.blastAuto) || 'full';
      if (auto === 'measure') { toast('Blast automation is Measure only, so the afflictions of ' + nm + ' were not rolled.'); return null; }
      if (window.wpVtt && !window.wpVtt.on('dice')) { toast('Dice are off, so the afflictions of ' + nm + ' were not rolled.'); return null; }
      var byChar = Object.create(null), hits = [], ap = affPass(b, map, camp, sys, blastWriter(byChar, hits), { w: [], s: [] });
      if (ap && ap.on) { _lastThrowTx = { hits: hits }; save(); syncBlastMenu(); toast(nm + ': ' + ap.on + ' failed to resist' + (ap.resisted ? ', ' + ap.resisted + ' resisted' : '') + '. Undo last throw is in the Radius options.'); }
      else if (ap && ap.resisted) toast(nm + ': ' + ap.resisted + ' resisted.');
      return ap;
  }
  function applyBlastDamage(b, total, hpId, mapIn) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, map = mapIn || getActiveMap();
      if (!sys || !S || !F || !map) return;
      var rules = typeof blastRules === 'function' ? blastRules(sys) : null, BC = window.wpBlastCore, fall = rules && rules.fall && BC ? rules.fall : '', step = !!(fall && sys.combat && sys.combat.damage && typeof S.damageStep === 'function');
      var noRes = !hpId && !step; if (noRes) { toast('Full auto is on, but no damage resource is set (System editor ▸ Items ▸ Damage subtracts from).'); if (!(b && b.frag && sys.combat && sys.combat.damage) && !(b && Array.isArray(b.aff) && b.aff.length)) return; }   // 1.5.9 (es): an affliction that reaches everyone in the blast goes on all the same   // the review of fold 3: the GM is told whether or not a fragmentation goes on through the damage step
      var byChar = Object.create(null), hits = [], applied = 0, halved = 0, shielded = 0, spared = 0, dice = fall ? BC.diceCount(b.dmgExpr || '') : 0, types = step && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [];
      var typeOk = !!(b.dtype && types.some(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === String(b.dtype).toLowerCase(); }));
      var hurt = { w: [], s: [] }, mark = function(cid, w, sh) { if (w && hurt.w.indexOf(cid) < 0) hurt.w.push(cid); if (sh && hurt.s.indexOf(cid) < 0) hurt.s.push(cid); };   // 1.5.9 (es): whom the blast and its fragmentation wounded, and whom a share reached, in that order
      var write = blastWriter(byChar, hits);   // one entry a character for the Undo (1.5.9: its fragmentation and its afflictions write too)
      blastDistances(b, map).forEach(function(r) {
          if (!shapeHolds(b, r) || !r.tok.charId) return;   // what a blast holds is asked in one place: its radius, a ring's inner distance, a cone's angle, and the token an explosion spares
          var ch = camp.chars && typeof r.tok.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, r.tok.charId) ? camp.chars[r.tok.charId] : null; if (!ch || noRes) return;   // own ids only: a token from a file naming '__proto__' writes no damage onto a prototype
          var share = total;
          if (fall) { share = BC.fallShare(F, fall, { dmg: total, dist: r.d, dice: dice, direct: !!b.direct && r.tok.id === b.direct, centre: typeof sameCellOn === 'function' && sameCellOn(map, b, tokenCentre(r.tok)) }); if (share === null) return; }   // 1.5.8: the token's share by the card's falloff
          var tierC = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, stanceOn('elevation') ? (b.elev || 0) : 0, stanceOn('elevation') ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null, ocC = S.coverOutcome ? S.coverOutcome(sys, tierC) : 'full', dmgC = S.coverDamage ? S.coverDamage(sys, tierC, share) : share;   // cover follow-ups (owner 2026-09-28): the system's outcome for the cover this token has from the blast (the host's own board)
          if (ocC === 'none' && share > 0) { shielded++; return; }   // shielded: the system's outcome for this grade is none (a half that rounds to 0 took less)
          if (fall && !(dmgC > 0)) { spared++; return; }   // past the falloff's reach: nothing to apply
          var vals = null, lines = null;
          if (step) {   // through the damage step: DR at the default location, the blast's damage type, the pool
              var q = { amt: Math.floor(dmgC) }, loc = typeof torsoOf === 'function' ? torsoOf(sys, ch) : ''; if (loc) q.loc = loc; if (typeOk) q.type = b.dtype; if (typeof b.ad === 'number' && b.ad > 0) q.ad = b.ad;
              var st = S.damageStep(sys, ch, q, F); if (!st || !st.ok) return;
              vals = st.values; lines = st.lines;
          } else {
              var all = S.resolveAll(sys, ch, F), e = all[hpId]; if (!e) return;
              var cur = typeof e.value === 'number' ? e.value : 0;
              var res = S.applyEdit(sys, ch, hpId, { cur: cur - dmgC }, F, {}); if (!res.ok) return;
              vals = {}; vals[hpId] = res.value;
          }
          if (ocC === 'half' && dmgC < share) halved++;
          write(ch, r.tok.charId, vals); mark(r.tok.charId, step ? !!(st && st.info && st.info.wound > 0) : dmgC > 0, dmgC > 0);   // 1.5.9 (es): who it wounded, after DR, and whom a share reached, for its afflictions
          if (lines && window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, (b.name && b.gm !== true ? [b.name + ':'] : []).concat(lines, b.notes ? ['Notes: ' + b.notes] : []));   // what it did, to the GM and the character's player
          applied++;
      });
      var fp = typeof fragPass === 'function' ? fragPass(b, map, camp, sys, hpId, write, mark) : null, ap = typeof affPass === 'function' ? affPass(b, map, camp, sys, write, hurt) : null, fragNote = fp ? (fp.hit ? ' · fragmentation hit ' + fp.hit + ' token' + (fp.hit === 1 ? '' : 's') : '') + (fp.shielded ? ' · ' + fp.shielded + ' shielded from fragmentation' : '') : '';   // 1.5.9 (es)
      var coverNote = (halved ? ' · ' + halved + ' behind cover took less' : '') + (shielded ? ' · ' + shielded + ' shielded by cover' : '') + (spared ? ' · ' + spared + ' too far to be hurt' : '') + fragNote + (ap ? affNote(ap) : '');   // counts only: never a name (a hidden token counts too)
      if (applied || (fp && fp.hit) || (ap && ap.on)) { _lastThrowTx = { hits: hits }; save(); syncBlastMenu(); if (b.notes) toast((b.name || 'The blast') + ': ' + b.notes); toast((!applied ? 'No blast damage' : fall ? 'Blast damage applied to ' + applied + ' token' + (applied === 1 ? '' : 's') + ' by distance' : '−' + total + ' to ' + applied + ' token' + (applied === 1 ? '' : 's')) + coverNote + '. Undo last throw is in the Radius options.'); }
      else if (shielded && !spared) toast('No damage: ' + shielded + ' token' + (shielded === 1 ? '' : 's') + ' shielded by cover.');
      else if (shielded || spared) toast('No damage:' + coverNote.replace(/^ ·/, '') + '.');
      if (ap && !ap.on && ap.resisted && !applied && !(fp && fp.hit) && !shielded && !spared) toast((b.name || 'The blast') + ': ' + ap.resisted + ' resisted.');   // 1.5.9 (es): an affliction resisted by all, and nothing else said
  }
  // The card's Apply to all in the blast (Roll to chat): the blast its damage was rolled for, still on the map on screen
  window.wpBlastApply = function(bid, total) {
      var camp = getActiveCampaign(), sys = camp && camp.system, b = blasts.filter(function(x) { return x && x.bid === bid; })[0];
      if (!b) { toast('That blast is no longer on the map.'); return false; }
      if (typeof total !== 'number' || !isFinite(total)) return false;
      applyBlastDamage(b, total, sys && sys.combat ? sys.combat.hpResource : '');
      return true;
  };
  // Undo the last full-auto throw's damage: restore every field the blast wrote on every character it hurt, host-synced.
  window.wpUndoThrow = function() {
      if (!_lastThrowTx || !_lastThrowTx.hits.length) { toast('Nothing to undo.'); return; }
      var camp = getActiveCampaign(); if (!camp) return;
      _lastThrowTx.hits.forEach(function(h) {
          var ch = camp.chars && typeof h.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, h.charId) ? camp.chars[h.charId] : null; if (!ch) return;
          ch.values = ch.values || {}; var d = {};
          Object.keys(h.prevs || {}).forEach(function(fid) { var pv = h.prevs[fid]; if (pv === undefined) delete ch.values[fid]; else ch.values[fid] = pv; d[fid] = pv === undefined ? null : pv; });
          ch.updated = Date.now();
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta) window.wpNet.syncCharDelta(h.charId, d);
          if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(h.charId);
      });
      var nn = _lastThrowTx.hits.length; _lastThrowTx = null; save(); syncBlastMenu();
      toast('Throw damage undone (' + nn + ' token' + (nn === 1 ? '' : 's') + ').');
  };
  window.wpHasThrowUndo = function() { return !!(_lastThrowTx && _lastThrowTx.hits.length); };
  // A mine: placed where clicked as a trigger zone of its trigger radius, hidden from players (a hidden piece is sent to no one), carrying its
  // blast. Where the card names a throw's roll and the item a throw skill (its placing skill), that roll is made first and a failure sets
  // nothing. It never goes off as it is placed
  function placeMine(opts, tr, map) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, rules = blastRules(sys), def = tr && tr.def, area = def && def.area;
      if (!BC || !def || !area) return null;
      if (rules && rules.roll && typeof def.throwSkill === 'string' && def.throwSkill && window.wpDice && window.wpDice.rollFor) {
          var pr = window.wpDice.rollFor(opts.charId, rules.roll.replace(/\bThrowSkill\b/gi, '(' + def.throwSkill + ')'), (opts.name || 'Mine') + ' placed', { gmOnly: !!opts.gmOnly });
          if (!pr || !pr.ok) { toast('Placing it could not be rolled' + (pr && pr.error ? ': ' + pr.error : '.')); return null; }
          var pck = window.wpNet ? window.wpNet.rollCheck : null;
          if (pck && !pck.pass && pck.crit === 'fumble') {   // the book: a critical failure sets it off in the planter's cell
              var plT = throwerOf(map, opts.charId), plC = plT ? tokenCentre(plT) : { x: opts.x, y: opts.y };
              if (area.use === true) useOneUp(camp, tr);
              return placeThrownBlast({ goOff: true, x: plC.x, y: plC.y, ft: area.ft, name: opts.name || def.name, by: opts.by || '', charId: opts.charId, damage: def.damage || '', gmOnly: !!opts.gmOnly, dtype: area.type, ad: area.ad, notes: opts.gmOnly ? '' : def.notes, icon: def.icon, frag: area.frag, fragType: area.fragType, aff: area.aff }, map);
          }
          var unarmed = !!(pck && !pck.pass);   // the book: a failure leaves it unarmed, and the planter knows
      }
      var mine = BC.cleanMine({ ft: area.ft, name: opts.name || def.name, damage: def.damage || '', type: area.type, ad: area.ad, trig: area.trig, charId: opts.charId, fieldId: opts.fieldId, rowId: opts.rowId, by: opts.by, gmOnly: !!opts.gmOnly, notes: opts.gmOnly ? '' : def.notes, unarmed: typeof unarmed === 'boolean' ? unarmed : false, frag: area.frag, fragType: area.fragType, aff: area.aff });   // 1.5.9 (es): and its fragmentation and afflictions
      if (!mine) return null;
      var amM = getActiveMap(), pxYd = amM && amM.id === map.id ? mapMeasureConfig().cellPx / cellYards() : 50, r = Math.max(10, mine.trig * pxYd);
      var z = { id: 'wb' + uid() + Math.random().toString(36).slice(2, 5), type: 'trigger', shape: 'circle', x: Math.round(opts.x - r), y: Math.round(opts.y - r), w: Math.round(r * 2), h: Math.round(r * 2), color: 'transparent', eventMessage: '', hidden: true, name: (mine.name || 'Mine') + ' (mine)', mine: mine };
      if (typeof def.icon === 'string' && def.icon) z.mineIcon = def.icon.slice(0, 64);
      map.whiteboard = map.whiteboard || []; map.whiteboard.push(z);
      if (area.use === true) useOneUp(camp, tr);
      save(); render();
      toast(mine.unarmed ? (opts.by || 'The character') + ' places ' + (mine.name || 'a mine') + ' but fails to arm it: it lies there unarmed and goes off only from its right-click menu.' : (opts.by ? opts.by + ' places ' : 'Placed: ') + (mine.name || 'a mine') + '. It is hidden from your players and goes off when a character steps into it, or from its right-click menu.');
      return z;
  }
  // A mine goes off: its zone is taken off the map and its blast goes off at the zone's centre, by the same path as a throw
  function mineOff(map, zone, direct) {
      if (!map || !zone || !zone.mine || !Array.isArray(map.whiteboard)) return null;
      var at = map.whiteboard.indexOf(zone); if (at < 0) return null;
      var m = zone.mine, cx = (Number(zone.x) || 0) + (Number(zone.w) || 0) / 2, cy = (Number(zone.y) || 0) + (Number(zone.h) || 0) / 2;
      map.whiteboard.splice(at, 1); save(); render();
      return placeThrownBlast({ goOff: true, x: cx, y: cy, ft: m.ft, name: m.name || 'Mine', by: m.by || '', charId: m.charId, damage: m.damage || '', gmOnly: !!m.gmOnly, direct: direct || null, dtype: m.type, ad: m.ad, notes: m.notes, icon: zone.mineIcon, frag: m.frag, fragType: m.fragType, aff: m.aff }, map);
  }
  // A character token that stepped in (the host's own map: the GM's drag, a player's drop): every mine whose trigger it stands in now and did
  // not stand in where the gesture began goes off, the token struck directly. Never on a player's app or in the stream window
  window.wpMineCheck = function(map, tok, from) {
      var BC = window.wpBlastCore; if (!BC || !map || !tok || !tok.isChar || tok.waiting || window.wpStream) return 0;
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return 0;
      var c = tokenCentre(tok), f0 = from && typeof from === 'object' && isFinite(Number(from.x)) && isFinite(Number(from.y)) ? { x: Number(from.x) + (tok.w || 60) / 2, y: Number(from.y) + (tok.h || 52) / 2 } : null, n = 0;
      var yb = function(a, b2) { return yardsOn(map, a, b2); };
      (map.whiteboard || []).filter(function(w) { return w && w.type === 'trigger' && w.mine && typeof w.mine === 'object' && w.mine.unarmed !== true; }).forEach(function(z) {   // an unarmed mine never goes off by a step
          if (!BC.inTrigger(z, c, yb) || (f0 && BC.inTrigger(z, f0, yb))) return;
          n++; toast((tok.charName || tok.name || 'A character') + ' steps on ' + (z.mine.name || 'a mine') + '.');
          mineOff(map, z, tok.id);
      });
      return n;
  };
  // The fuse (the book, fix log (eo)): a thrown explosive goes off at the start of the next turn of the fight on its map, not at once. It lies
  // there meanwhile, its icon on the map, and the GM is told. Kept in this machine's memory (a fuse outlives no reload)
  var _fused = [];
  function fuseSet(map, b, opts, n) {
      b.fused = true; _fused.push({ mapId: map.id, b: b, opts: opts, n: n });
      if (_fused.length > 64) _fused.splice(0, _fused.length - 64);
      toast((b.name || 'It') + ' lands and goes off at the start of the next turn.');
  }
  window.wpFuseTick = function(mapId) {   // net.js turnStarted, at a turn first reached: every fused explosive on that map goes off
      var camp = getActiveCampaign(), map = camp && camp.items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null; if (!map) return 0;
      var due = _fused.filter(function(f) { return f.mapId === mapId; }); if (!due.length) return 0;
      _fused = _fused.filter(function(f) { return f.mapId !== mapId; });
      due.forEach(function(f) { f.b.fused = false; toast((f.b.name || 'A blast') + ' goes off.'); resolveThrow(f.b, f.opts, f.n, map); });
      renderMeasures(); return due.length;
  };
  // Whether a point stands in the blast's own cell: the same square or hex on a map with a grid, within half a cell on one with none
  function sameCellOn(map, a, b) {
      var S = window.wpSystemCore, g = S && S.mapGridOf ? S.mapGridOf(map) : state.gridType;
      if (g === 'hex') { var ha = hexCellOf(a.x, a.y), hb = hexCellOf(b.x, b.y); return ha.q === hb.q && ha.r === hb.r; }
      if (g === 'square') return Math.floor(a.x / 50) === Math.floor(b.x / 50) && Math.floor(a.y / 50) === Math.floor(b.y / 50);
      return Math.hypot(a.x - b.x, a.y - b.y) < 25;
  }
  // The GM's row on a mine's right-click menu: set it off by hand. The GM's alone, never a player's app or the stream window; fixed words
  function mineRow(items) {
      var n = window.wpNet; if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;
      var ms = (Array.isArray(items) ? items : []).filter(function(w) { return !!w && w.type === 'trigger' && w.mine && typeof w.mine === 'object'; });
      return ms.length ? { items: ms, html: '<div class="menu-item cm-mine-off" title="It goes off at its centre now, as if someone stepped on it.">&#128165; Set off the mine' + (ms.length > 1 ? 's' : '') + '</div>' } : null;
  }
  // The stand-in drawings a thrown explosive and a placed mine wear at their centre (blastcore STAND_INS), else the item's own icon where it is
  // a character (an emoji); a glyph of the bundled set takes the stand-in. Numbers through svgNum, words through esc
  function standInSvg(kind, x, y, icon) {
      var BC = window.wpBlastCore, S = window.wpSystemCore, ic = typeof icon === 'string' && icon && S && S.cleanIcon ? S.cleanIcon(icon) : '';
      if (ic && !/^icon:/.test(ic)) return '<text class="blast-ico-t" x="' + svgNum(x) + '" y="' + svgNum(y) + '" text-anchor="middle" dominant-baseline="central">' + esc(ic) + '</text>';
      var ps = BC && BC.STAND_INS && BC.STAND_INS[kind] ? BC.STAND_INS[kind] : null; if (!ps) return '';
      return '<g class="blast-ico ' + (kind === 'mine' ? 'mine-ico' : 'grenade-ico') + '" transform="translate(' + svgNum(x - 12) + ' ' + svgNum(y - 12) + ')">' + ps.map(function(d) { return '<path d="' + d + '"></path>'; }).join('') + '</g>';
  }
  function mineIconsSvg(map) {   // the GM's own screen: each mine at its spot (a player's copy holds none)
      var nM = window.wpNet; if (!map || window.wpStream || (nM && (nM.foreign || (nM.active && nM.role === 'client')))) return '';   // the GM's screen alone (playerScreen's own test)
      return (map.whiteboard || []).filter(function(w) { return w && w.type === 'trigger' && w.mine && typeof w.mine === 'object'; }).map(function(z) { return standInSvg('mine', (Number(z.x) || 0) + (Number(z.w) || 0) / 2, (Number(z.y) || 0) + (Number(z.h) || 0) / 2, z.mineIcon); }).join('');
  }
  // [systemcheck:explosives-end]
  // [systemcheck:launch-start]
  // 1.5.9 Chambers from (the owner, by prompt on 2026-10-25: "A cell and a round", after a sheet website's grenade launchers): a launched round is
  // no throw. Its blast goes off where it is put, with none of a throw's outcomes: no throw roll, no scatter, no drop at the feet, nothing going
  // off in the hand. It is the round last fired, else the next one (Row.fired), and its damage, type, armour divisor, notes and icon are the
  // round's own. On a hit the host puts it on the roller's target (net.js, wpLaunchHit); the GM's Launch puts it where the GM clicks (wpArmLaunch),
  // as for a round that misses where its item says nothing. 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 1): a round whose item says
  // how it lands on a miss (its area's flight) is put down by the host on a miss too (wpLaunchMiss): one that scatters lands as a missed throw does,
  // a yard a point missed and never more than half the distance fired, by the Combat card's own scatter where it names one; one that flies straight
  // goes on along its line, past the aim, and goes off on the first wall or character in its path, or at its farthest (the launcher list's Flies at
  // most, else the board's edge). One that scatters goes off on a thrown grenade's timing, so it waits for the fuse where the card sets one (the
  // book's fix log (eu), H1). What the book has not ruled yet is the Combat card's to say (combat.blast.launch). The host's alone, never on a
  // player's app
  function launchRowOf(camp, opts) {   // the launcher's row on this machine's own copy and the round it puts down: { ch, f, row, def, area }
      var S = window.wpSystemCore, sys = camp && camp.system; if (!S || !sys || !opts || typeof opts.charId !== 'string' || typeof opts.fieldId !== 'string' || typeof opts.rowId !== 'string') return null;
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, opts.charId) ? camp.chars[opts.charId] : null; if (!ch) return null;
      var f = S.fieldById(sys, opts.fieldId); if (!f || f.kind !== 'item-list' || !f.list || !f.list.chamber) return null;
      var row = (ch.values && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []).filter(function(r) { return r && r.hid !== 1 && S.rowIdOf(r) === opts.rowId; })[0]; if (!row) return null;
      var cp = row.fd && typeof row.fd === 'object' ? row.fd : Array.isArray(row.rd) && row.rd[0] && typeof row.rd[0] === 'object' ? row.rd[0] : null; if (!cp) return null;
      var rd = S.rowDef(sys, cp), def = rd && rd.def; if (!def || !def.area || typeof def.area !== 'object') return null;
      return { ch: ch, f: f, row: row, def: def, area: def.area };
  }
  function launchAt(opts, mapIn) {
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return null;
      var camp = getActiveCampaign(), map = mapIn || getActiveMap(); if (!camp || !map || !opts) return null;
      var x = Number(opts.x), y = Number(opts.y); if (!isFinite(x) || !isFinite(y)) return null;
      var lr = launchRowOf(camp, opts); if (!lr) { toast('Nothing to put down there: no round fired or chambered on that row has a blast.'); return null; }
      var hasD = Object.prototype.hasOwnProperty.call(opts, 'direct'), aimT = hasD ? null : tokenAtPoint(map, x, y, true), aim = aimT ? tokenCentre(aimT) : { x: x, y: y }, d = lr.def, a = lr.area, gm = d.vis === 'gm' || lr.f.vis === 'gm';   // the character token clicked, else the point; 1.5.9 (es): a miss names its own point and whom it strikes
      var dir = hasD ? (typeof opts.direct === 'string' ? opts.direct : null) : aimT ? aimT.id : null, po = { goOff: true, launched: true, x: aim.x, y: aim.y, ft: a.ft, name: a.name || d.name || '', by: lr.ch.name || '', charId: opts.charId, fieldId: lr.f.id, rowId: opts.rowId, damage: d.damage || '', gmOnly: gm, direct: dir, dtype: a.type, ad: a.ad, notes: gm ? '' : d.notes, icon: d.icon, frag: a.frag, fragType: a.fragType, aff: a.aff };   // 1.5.9 (es): the round's own fragmentation and afflictions
      if (typeof opts.said === 'string' && opts.said) po.said = opts.said; if (opts.fuse === true) po.fuseOk = true;
      return placeThrownBlast(po, map);
  }
  window.wpLaunchAt = launchAt;
  window.wpArmLaunch = function(ctx) {   // the sheet's Launch (the GM's): the next click on the map puts the round's blast there
      if (!ctx || typeof ctx !== 'object') return;
      var nm = typeof ctx.name === 'string' ? ctx.name.slice(0, 60) : '';
      _armedThrow = { launch: true, charId: ctx.charId, fieldId: ctx.fieldId, rowId: ctx.rowId, name: nm };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the target or a place on the map for ' + (nm ? 'the ' + nm : 'the blast') + '. Esc cancels.');
  };
  window.wpLaunchHit = function(o) {   // net.js on the host: a hit puts the round it fired on the roller's target, on the target's own map
      var camp = getActiveCampaign(); if (!camp || !o || typeof o.mapId !== 'string' || typeof o.tid !== 'string') return null;
      var map = camp.items && Object.prototype.hasOwnProperty.call(camp.items, o.mapId) ? camp.items[o.mapId] : null; if (!map || !Array.isArray(map.whiteboard)) return null;
      var t = map.whiteboard.filter(function(w) { return w && w.id === o.tid && !w.hidden; })[0]; if (!t) return null;
      var c = tokenCentre(t); return launchAt({ charId: o.charId, fieldId: o.fieldId, rowId: o.rowId, x: c.x, y: c.y }, map);
  };
  var LAUNCH_BOARD = 30000;   // the board's own size, in board pixels (the style sheet's #whiteboard)
  // net.js on the host: a launched round that missed (o: charId, fieldId, rowId, tid and mapId, the roller's target, margin, the verdict's, and crit,
  // 'fumble' for a critical failure). Where its item says nothing of a miss, nothing: the GM places it with Launch, as before
  window.wpLaunchMiss = function(o) {
      var camp = getActiveCampaign(), BC = window.wpBlastCore, S = window.wpSystemCore, F = window.wpFormula; if (!camp || !BC || !o || typeof o !== 'object') return null;
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return null;
      var lr = launchRowOf(camp, o); if (!lr) return null;
      var fl = lr.area.flight; if (fl !== 'scatter' && fl !== 'line') return null;
      var nm = lr.area.name || lr.def.name || 'the round', has = function(ob, k) { return !!ob && Object.prototype.hasOwnProperty.call(ob, k); };
      var map = typeof o.mapId === 'string' && has(camp.items, o.mapId) ? camp.items[o.mapId] : null, wb = map && Array.isArray(map.whiteboard) ? map.whiteboard : [];
      var t = typeof o.tid === 'string' ? wb.filter(function(w) { return w && w.id === o.tid && !w.hidden; })[0] : null;
      var sh = t ? wb.filter(function(w) { return w && w.charId === o.charId && !w.waiting; }).sort(function(p, q) { return (q.isChar ? 1 : 0) - (p.isChar ? 1 : 0); })[0] : null;
      if (!t || !sh) { toast(nm.charAt(0).toUpperCase() + nm.slice(1) + ' missed, with no target and shooter on one map to tell where it went. Place it with Launch on the sheet.'); return null; }
      var bl = camp.system && camp.system.combat && camp.system.combat.blast && typeof camp.system.combat.blast === 'object' ? camp.system.combat.blast : {}, ln = bl.launch && typeof bl.launch === 'object' ? bl.launch : {};
      var sc = tokenCentre(sh), aim = tokenCentre(t), mg = BC.missOf({ kind: 'check', pass: false, margin: o.margin }) || 1, base = { charId: o.charId, fieldId: o.fieldId, rowId: o.rowId };
      var dYd = typeof yardsOn === 'function' ? yardsOn(map, sc, aim) : Math.hypot(aim.x - sc.x, aim.y - sc.y) / 50, dPx = Math.hypot(aim.x - sc.x, aim.y - sc.y), px = dYd > 1e-9 && dPx > 0 ? dPx / dYd : 50;   // board pixels to a yard on that map, as it reads the distance fired
      var lenW = function(yd) { return typeof rulerLen === 'function' && typeof rulerUnitNow === 'function' ? rulerLen(yd, rulerUnitNow()) : Math.round(yd * 10) / 10 + ' yd'; };
      if (o.crit === 'fumble' && ln.fumble === 'none') { toast('A critical failure: ' + nm + ' misfires and goes nowhere. The round is spent.'); return null; }
      if (o.crit === 'fumble' && ln.fumble === 'feet') return launchAt(Object.assign(base, { x: sc.x, y: sc.y, direct: null, said: ' A critical failure: it goes off at the shooter\u2019s feet.', fuse: ln.now !== true && fl === 'scatter' }), map);
      if (fl === 'scatter') {   // as a missed throw: from the aim along the line it was fired on, by the Combat card's scatter (Margin, ThrowDistance: the distance fired), else the book's
          var syd = null;
          if (typeof bl.scatter === 'string' && bl.scatter && F) { var sv = F.evaluate(bl.scatter, { vars: function(n) { var l = String(n).toLowerCase(); return l === 'margin' ? mg : l === 'throwdistance' ? dYd : undefined; } }); syd = sv && sv.ok ? (typeof sv.value === 'boolean' ? (sv.value ? 1 : 0) : sv.value) : null; }
          syd = typeof syd === 'number' && isFinite(syd) ? Math.max(0, Math.min(1000, syd)) : BC.bookScatterYd(mg, dYd);
          var nW = bl.ways === 8 ? 8 : 6, sp = BC.scatterPoint(aim, sc, syd, Math.floor(Math.random() * nW), px, nW); if (!sp) return null;   // the way rolled as a throw's is
          return launchAt(Object.assign(base, { x: Math.max(0, sp.x), y: Math.max(0, sp.y), direct: null, said: ' A miss by ' + mg + ': it lands ' + lenW(syd) + ' ' + sp.words.toLowerCase() + ' of the aim.', fuse: ln.now !== true }), map);   // the review of fold 2: on a thrown grenade's timing unless the card says at once (the book's (eu), H1)
      }
      var rf = lr.f.list && lr.f.list.chamber && typeof lr.f.list.chamber.reach === 'string' ? lr.f.list.chamber.reach : '', reach = null;   // straight on: as far as Flies at most, from the launcher row's own names, else to the board's edge
      if (rf && S && F && typeof S.makeResolver === 'function') { var R = S.makeResolver(camp.system, lr.ch, F), rowR = R && typeof R.row === 'function' ? R.row(lr.f.id, o.rowId) : null, rv = rowR ? F.evaluate(rf, { vars: rowR, random: function() { return NaN; } }) : null; if (rv && rv.ok && typeof rv.value === 'number' && isFinite(rv.value) && rv.value > 0) reach = rv.value; }
      var end = BC.flightEnd(sc, aim, reach !== null ? reach * px : null, LAUNCH_BOARD); if (!end) return null;
      var aimAt = Math.hypot(end.x - sc.x, end.y - sc.y) > 1e-6 ? Math.min(1, dPx / Math.hypot(end.x - sc.x, end.y - sc.y)) : 1;
      var wall = window.wpFog && typeof window.wpFog.flightWall === 'function' ? window.wpFog.flightWall(map, sc, end) : null;
      var boxes = ln.stop === 'walls' ? [] : wb.filter(function(w) { return w && w.isChar && !w.hidden && !w.waiting && w.id !== sh.id && w.id !== t.id; }).map(function(w) { return { id: w.id, x: Number(w.x), y: Number(w.y), w: w.w || 60, h: w.h || 52 }; });
      var hb = BC.firstBox(sc, end, boxes, ln.stop === 'past' ? aimAt : 0);
      if (hb && (!wall || hb.t < wall.at)) { var ht = wb.filter(function(w) { return w && w.id === hb.id; })[0], hc = tokenCentre(ht); return launchAt(Object.assign(base, { x: hc.x, y: hc.y, direct: ln.glance === true ? null : hb.id, said: ' A miss: it flies straight on and strikes a character in its path.' }), map); }
      if (wall) return launchAt(Object.assign(base, { x: wall.x, y: wall.y, direct: null, said: ' A miss: it flies straight on into a wall.' }), map);
      return launchAt(Object.assign(base, { x: end.x, y: end.y, direct: null, said: reach !== null ? ' A miss: it flies straight on and goes off at its farthest.' : ' A miss: it flies straight on to the edge of the map.' }), map);
  };
  // [systemcheck:launch-end]
  // [systemcheck:explode-start]
  // Explode (1.5.4, backlog 128; the owner by prompt: "Yes, type is a word", and of who may: "The GM is the only one who should be able to
  // make any blast effects"). The GM sets off the last shape of the Radius tool as an explosion: a circle, and since 128 (e) a ring or a cone
  // too ("A cone and a ring, soon"), which the blast keeps and the table is shown. A damage, a number or a roll, and a damage
  // type, a word, are typed each time: nothing is ever filled in ("no defaults can be done because a damage type and value is needed"). The
  // circle becomes a blast in its place, shown to the table as a thrown blast is, and the damage follows the system's blast setting
  // (combat.blastAuto: full rolls and applies, roll rolls to chat, measure does neither). The type is named on the roll's card and changes no
  // number. It hits the tokens the circle held and no other: the token a circle sat on is spared (spare), and nothing is moved, so a circle
  // whose centre is in a wall is refused where a throw would go off in front of it. Every refusal is in fixed words. Of the token a circle
  // sat on the owner said, by prompt: "Ask each time". So the boxes hold a tick, Also hits the token at the centre, shown only for a circle
  // on a token and off every time it comes up. Ticked, that one explosion spares nobody
  var EXPLODE_MIN_FT = 1, EXPLODE_MAX_FT = 3000;   // a blast's radius in feet, as placeThrownBlast and a player's app bound it
  function explodeType(v) {   // the damage type as typed: a few plain words on one line, 40 characters at most and never half a character
      if (typeof v !== 'string') return '';
      var out = '';
      Array.from(v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()).some(function(ch) {
          if (ch.length === 1 && ch >= '\ud800' && ch <= '\udfff') return false;   // half a character that came alone: left out
          if (out.length + ch.length > 40) return true;
          out += ch; return false;
      });
      return out.trim();
  }
  function explodeWhere() {   // the circle Explode would set off: { c, ft }, or { why } in fixed words
      if (playerScreen()) return { why: 'Only the GM sets off an explosion.' };
      // the shape the options show: none while a shape picked in the options waits for its click, though a circle that came back with its token
      // may be on screen by then (the review of 2026-10-10: Explode set off a circle whose numbers the options no longer showed)
      var map = getActiveMap(), c = map ? lastEdit() : null;
      if (!c) return { why: map && circleKeptPicked && lastOwn() ? 'The shape you picked is waiting for its click. Place it first: Explode sets off the last shape you placed.' : 'Place a shape first. Explode sets off the last shape you placed.' };
      var ft = c.yd * 3, ru = rulerUnitNow();
      if (ft > EXPLODE_MAX_FT) return { why: 'An explosion is at most ' + rulerLen(EXPLODE_MAX_FT / 3, ru) + ' in radius.' };
      if (ft < EXPLODE_MIN_FT) return { why: 'An explosion is at least ' + rulerLen(EXPLODE_MIN_FT / 3, ru) + ' in radius.' };
      if (window.wpFog && window.wpFog.blastSeat && window.wpFog.blastSeat(map, c.x, c.y, c.x, c.y)) return { why: (shapeOf(c.as) === 'cone' ? 'The point of the cone' : shapeOf(c.as) === 'ring' ? 'The centre of the ring' : 'The centre of the circle') + ' is inside a wall or a closed door. Move it to an open cell first.' };
      return { c: c, ft: ft };
  }
  function explodeAsk(dmg, type) {   // what Explode would set off with what was typed: { c, ft, expr, type }, or { why }
      var q = explodeWhere(); if (q.why) return q;
      var D = window.wpDiceCore, F = window.wpFormula, expr = D && D.cleanExpr ? D.cleanExpr(dmg) : null;
      if (!expr) return { why: 'Type the damage. It is a number or a roll.' };
      var p = F && F.parse ? F.parse(expr) : null;
      if (!p || !p.ok) return { why: 'That damage does not read as a number or a roll.' };
      if (p.names && p.names.length) return { why: 'The damage is a number or a roll. It cannot name a value from a sheet.' };
      var ty = explodeType(type); if (!ty) return { why: 'Type the damage type. It is a word.' };
      return { c: q.c, ft: q.ft, expr: expr, type: ty };
  }
  function explodeCircle(dmg, type, hitFor) {   // true: it went off. hitFor: the very circle whose centre token the GM ticked to be hit, else nothing
      var q = explodeAsk(dmg, type); if (q.why) { toast(q.why); return false; }
      var map = getActiveMap(), camp = getActiveCampaign(), sys = camp && camp.system, combat = (sys && sys.combat) || {};
      var auto = !sys ? 'roll' : combat.blastAuto === 'roll' || combat.blastAuto === 'measure' ? combat.blastAuto : 'full';   // with no character system there is nothing to apply the damage to
      var diceOn = !window.wpVtt || window.wpVtt.on('dice'), rolled = false, total = null;
      if (auto !== 'measure' && diceOn) {   // the roll first: a damage that cannot be rolled sets nothing off
          if (!window.wpDice || !window.wpDice.rollFor) { toast('Dice are not available.'); return false; }
          var dr = window.wpDice.rollFor('', q.expr, 'Explosion, ' + q.type + ' damage', { dmg: true });   // the type is named on the card: it changes no number
          if (!dr || dr.error || !dr.ok) return false;   // the roll said why
          rolled = true; total = typeof dr.value === 'number' && isFinite(dr.value) ? dr.value : null;
      }
      var c = q.c, at = blasts.indexOf(c); if (at < 0) return false;   // the circle went while the roll was made: nothing goes off, and no other shape's place is taken
      var b = { x: c.x, y: c.y, ft: q.ft, name: 'Explosion', elev: typeof c.elev === 'number' && isFinite(c.elev) ? c.elev : 0, autoElev: false, thrown: true, by: '' };
      if (typeof c.tok === 'string' && hitFor !== c) b.spare = c.tok;   // the token the circle sat on was not inside it: the explosion does not hit it, unless the GM ticked that it does, for this very circle
      var sent = { x: b.x, y: b.y, ft: b.ft, name: b.name, elev: b.elev, by: '' };   // shown to the table as a thrown blast is: its place, its size, its height and the fixed word
      if (shapeOf(c.as) === 'ring' && c.inn > 0 && c.inn < c.yd) { b.shape = sent.shape = 'ring'; b.inFt = sent.inFt = c.inn * 3; }   // a ring with no hole is the whole disc
      else if (shapeOf(c.as) === 'cone') { b.shape = sent.shape = 'cone'; b.deg = sent.deg = coneDeg(c.deg, 60); b.dir = sent.dir = typeof c.dir === 'number' && isFinite(c.dir) ? c.dir : 0; }   // and its shape, where it has one
      blasts.splice(at, 1, b);   // the shape becomes the blast, where it stood
      if (typeof circleRekept === 'function') circleRekept();
      renderMeasures(); syncBlastMenu();
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlast) window.wpNet.broadcastBlast(sent, map.id);
      var n = blastDistances(b, map).filter(function(r) { return shapeHolds(b, r); }).length, said = 'Explosion, ' + q.type + '. ' + n + ' token' + (n === 1 ? '' : 's') + ' in range.';
      if (!rolled) { toast(said + (auto === 'measure' ? ' Nothing was rolled. This system\u2019s blasts only measure.' : ' Nothing was rolled. Dice are off.')); return true; }
      if (auto !== 'full') { toast(said); return true; }
      if (total === null) { toast(said + ' The roll gave no number, so no damage was applied.'); return true; }
      toast(said); applyBlastDamage(b, total, combat.hpResource);
      return true;
  }
  // The two boxes under Explode: shown when Explode is pressed, put away when it went off, on Cancel and on a second press. They are emptied
  // every time they are shown or put away, so what was typed for one explosion is never there for the next
  var _el_exBtn = document.getElementById('blastExplodeBtn'), _el_exForm = document.getElementById('blastExplodeForm'), _el_exDmg = document.getElementById('blastDmg'), _el_exType = document.getElementById('blastDmgType');
  var _el_exHitRow = document.getElementById('blastHitCentreRow'), _el_exHit = document.getElementById('blastHitCentre'), _exHitFor = null;   // the tick, and the circle it is being asked for
  // The tick under the two boxes: Also hits the token at the centre. It shows only while the boxes are up and the circle that would go off
  // sits on a token. It is unticked whenever the circle it is asked for changes, so a yes for one circle is never there for another
  function explodeHitRow() {
      if (!_el_exHitRow) return;
      var c = _el_exForm && _el_exForm.style.display !== 'none' && !playerScreen() ? lastEdit() : null;
      if (!c || typeof c.tok !== 'string' || shapeOf(c.as) !== 'circle') c = null;
      if (c !== _exHitFor) { _exHitFor = c; if (_el_exHit) _el_exHit.checked = false; }
      _el_exHitRow.style.display = c ? '' : 'none';
  }
  function explodeForm(show) {
      if (_el_exDmg) _el_exDmg.value = ''; if (_el_exType) _el_exType.value = '';
      if (_el_exForm) _el_exForm.style.display = show ? '' : 'none';
      explodeHitRow();   // put away, the tick is asked for no circle, so it is unticked; it comes up again off, whatever it held
      if (show && _el_exDmg && _el_exDmg.focus) _el_exDmg.focus();
  }
  function explodeGo() {   // refused: the boxes stay as typed, to be put right
      var hitFor = _el_exHit && _el_exHit.checked === true && _el_exHitRow && _el_exHitRow.style.display !== 'none' ? _exHitFor : null;
      if (explodeCircle(_el_exDmg ? _el_exDmg.value : '', _el_exType ? _el_exType.value : '', hitFor)) explodeForm(false);
  }
  if (_el_exBtn) _el_exBtn.addEventListener('click', function() {
      if (_el_exForm && _el_exForm.style.display !== 'none') { explodeForm(false); return; }
      var w = explodeWhere(); if (w.why) { toast(w.why); return; }   // nothing to set off: said before anything is asked
      explodeForm(true);
  });
  var _el_exGo = document.getElementById('blastExplodeGo'), _el_exNo = document.getElementById('blastExplodeNo');
  if (_el_exGo) _el_exGo.addEventListener('click', explodeGo);
  if (_el_exNo) _el_exNo.addEventListener('click', function() { explodeForm(false); });
  if (_el_exDmg) _el_exDmg.addEventListener('keydown', function(e) {   // Enter in the damage box goes on to the type: an explosion is never set off from the first box
      if (e.key === 'Enter') { e.preventDefault(); if (_el_exType && _el_exType.focus) _el_exType.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); explodeForm(false); }
  });
  if (_el_exType) _el_exType.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); explodeGo(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); explodeForm(false); }
  });
  // [systemcheck:explode-end]
  // A sheet Throw button arms a one-shot blast placement (mirrors wpArmFxBurst); the next map click throws it.
  window.wpArmBlast = function(ft, name, ctx) {
      ft = Math.max(1, Math.min(3000, Math.round(ft || 0))); if (!(ft > 0)) return;
      _armedThrow = { charId: ctx && ctx.charId, fieldId: ctx && ctx.fieldId, rowId: ctx && ctx.rowId, ft: ft, name: name || '', by: (ctx && ctx.by) || '', damage: (ctx && ctx.damage) || '', gmOnly: !!(ctx && ctx.gmOnly) };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the map to throw' + (name ? ' the ' + name : '') + '. Esc cancels.');
  };
  // A client's received shared blast (from the host): rendered, never re-broadcast.
  window.wpRenderSharedBlast = function(bl) {
      if (!bl || typeof bl.x !== 'number' || typeof bl.y !== 'number') return;
      var ft = typeof bl.ft === 'number' && isFinite(bl.ft) && bl.ft > 0 ? Math.max(1, Math.min(3000, bl.ft)) : 12;   // the host's number as it is, within a blast's bounds: an explosion set off from a circle is not always a whole number of feet, and a rounded one would hold other tokens than the host's
      var nb = { x: bl.x, y: bl.y, ft: ft, name: typeof bl.name === 'string' ? bl.name.slice(0, 60) : '', elev: typeof bl.elev === 'number' ? bl.elev : 0, autoElev: false, thrown: true, by: typeof bl.by === 'string' ? bl.by.slice(0, 60) : '', shared: true };
      // 128 (e): an exploded ring or cone is shown as that shape. Its numbers are the host's, each checked here: a ring's inner distance inside
      // its radius, a cone's angle a whole number of degrees from 1 to 360 and its aim a finite number. Anything else is a plain circle
      if (bl.shape === 'ring' && typeof bl.inFt === 'number' && isFinite(bl.inFt) && bl.inFt > 0 && bl.inFt < ft) { nb.shape = 'ring'; nb.inFt = bl.inFt; }
      else if (bl.shape === 'cone' && typeof bl.deg === 'number' && typeof bl.dir === 'number' && isFinite(bl.dir) && Math.round(bl.deg) >= 1 && Math.round(bl.deg) <= 360) { nb.shape = 'cone'; nb.deg = Math.round(bl.deg); nb.dir = Math.atan2(Math.sin(bl.dir), Math.cos(bl.dir)); }
      pushBlast(nb);
      renderMeasures();
  };
  window.wpClearSharedBlasts = function() { var had = blasts.some(function(b) { return b.shared; }); blasts = blasts.filter(function(b) { return !b.shared; }); if (had) renderMeasures(); };
  // Visual effects (1.5.0): the ✨ panel arms a burst, a click on the map places it (its own Measure sub-mode)
  var _fxArm = null;
  window.wpArmFxBurst = function(look, rPx) { _fxArm = { look: look, r: Math.max(20, Math.min(6000, Math.round(rPx || 160))) }; window.isMeasureMode = true; window.wpMeasureKind = 'fx'; toast(look === 'ping' ? 'Click the map to ping that spot.' : 'Click the map to place the ' + look + ' burst.'); };
  window.wpFxArmed = function() { return _fxArm && window.isMeasureMode && window.wpMeasureKind === 'fx' ? _fxArm.look : ''; };   // the look the panel armed, while the map still waits for its click
  window.wpDisarmFxBurst = function() { if (!_fxArm) return false; _fxArm = null; if (window.wpMeasureKind === 'fx') { window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; } return true; };   // the panel's second press on an armed button
  function placeFx(e) {
      var map = getActiveMap(); if (!map || !_fxArm) { window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; return; }
      var box = wbWrap.getBoundingClientRect();
      var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;
      var y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
      x = Math.max(0, Math.min(30000, x)); y = Math.max(0, Math.min(30000, y));
      var look = _fxArm.look, r = _fxArm.r; _fxArm = null; window.isMeasureMode = false; window.wpMeasureKind = 'ruler';
      if (window.wpFx) window.wpFx.placeBurst(x, y, look, r);
  }
  // The GM's ping (fold P): Alt+click on the play map pings that cell for whoever the effects panel's Ping row names
  // (everyone on the map unless it names one player). Caught on the way down, ahead of the tokens, the selection box and
  // every tool; a player's Alt+click does what it always did.
  if (wbWrap) {
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!e.altKey || e.button !== 0 || !window.wpFx || !window.wpFx.canPing()) return;
          var box = wbWrap.getBoundingClientRect();
          var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
          if (!(x >= 0 && x <= 30000 && y >= 0 && y <= 30000)) return;
          e.preventDefault(); e.stopImmediatePropagation(); _pingAlt = true;
          window.wpFx.ping(x, y);
      }, true);
      // The Alt released after a ping is the app's: left unhandled, the desktop window would show its hidden menu bar
      var _pingAlt = false;
      document.addEventListener('keyup', function(e) { if (_pingAlt && e.key === 'Alt') { _pingAlt = false; e.preventDefault(); } }, true);
      wbWrap.addEventListener('dblclick', function(e) { if (e.altKey && window.wpFx && window.wpFx.canPing()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);   // two quick pings never open a token's Properties
  }
  // Esc cancels an armed throw or FX burst and returns to the arrow, when nothing else was open (1.5.4: esckey.js). With nothing armed it puts
  // the tool in hand away, back to Select (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)": the first Escape closes
  // a tool's options and the tool stays in hand, and the next puts the tool away). Never from a field, whose key it is; Build is Build's own
  // (buildKey, which drops a polygon under way first), and a placement is the placement's (disarmPlacement)
  var ESC_TOOLS = ['drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'panModeBtn', 'envModeBtn'];
  document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape' || (window.wpEsc && !window.wpEsc.free(e))) return;
      if (_armedThrow || _fxArm) { _armedThrow = null; _fxArm = null; document.body.classList.remove('placing'); window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; var mvE = document.getElementById('moveModeBtn'); if (mvE) mvE.click(); return; }
      var tgT = e.target; if (tgT && ((tgT.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(tgT.tagName)) || tgT.isContentEditable === true)) return;
      var held = ESC_TOOLS.filter(function(id) { var b = document.getElementById(id); return !!b && !!b.classList && b.classList.contains('active'); })[0];
      if (held) { var mvT = document.getElementById('moveModeBtn'); if (mvT) mvT.click(); }
  });
  window.wpMeasure = { config: mapMeasureConfig, cellYards: cellYards, pxToYards: function(px) { var c = cellYards(), ppy = c ? mapMeasureConfig().cellPx / c : 0; return ppy ? Math.round(px / ppy * 10) / 10 : null; } };
  // Fog of war (1.5.0): a play-map mode. fog.js owns the menu and the overlay. The toolbar's button opens and closes the menu and nothing
  // else (1.5.4, the owner's pick "Paint only when asked": leaving the fog tool looked like switching fog off); the brush starts from the
  // menu's Paint fog row, which asks wpEnterFogMode. While window.isFogMode is on a click or drag paints reveal/hide cells, datamap.js
  // suppresses token drag/pan/selection, and right-click paints the opposite of the brush in hand.
  // [fogcheck:fogtool-start]
  var _el_fogModeBtn = document.getElementById('fogModeBtn');
  if (_el_fogModeBtn) _el_fogModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var fm = document.getElementById('fogMenu'); if (!window.wpFog) return;
      if (fm && fm.classList.contains('show')) window.wpFog.closeMenu(); else { closeDrawMenu(); window.wpFog.openMenu(); }
  });
  window.wpEnterFogMode = function() {   // a brush of the fog menu was pressed: the fog tool in hand
      if (window.isFogMode) return;
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('fogModeBtn');
      closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  };
  // [fogcheck:fogtool-end]
  // fog.js calls this when the fog tool is put down: the lit brush pressed again, the map's fog or the feature switched off
  window.wpExitFogMode = function() {
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
      if (wbWrap) wbWrap.style.cursor = 'default';
      updateWbToolbar('moveModeBtn');
  };
  if (wbWrap) {
      var _fogPaintBtn = -1;
      var _fogBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, y: (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel }; };
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isFogMode || (e.button !== 0 && e.button !== 2)) return;
          var pt = _fogBoard(e);
          if (e.button === 0 && window.wpFog && window.wpFog.toggleDoorAt && window.wpFog.toggleDoorAt(pt.x, pt.y)) { _fogPaintBtn = -1; e.preventDefault(); return; }   // clicked a door -> toggled it, do not paint
          _fogPaintBtn = e.button;
          hostGestureStart();   // fold M6: a stroke is open until the pointer comes up
          if (window.wpFog) window.wpFog.strokeStart(pt.x, pt.y, e.button === 2);   // 1.5.4: a stroke of the brush in hand (cells, a box, a whole piece)
          e.preventDefault();
      });
      wbWrap.addEventListener('pointermove', function(e) {
          if (!window.isFogMode || _fogPaintBtn < 0) return;
          var pt = _fogBoard(e); if (window.wpFog) window.wpFog.strokeMove(pt.x, pt.y, _fogPaintBtn === 2);
      });
      wbWrap.addEventListener('contextmenu', function(e) { if (window.isFogMode) e.preventDefault(); });
      document.addEventListener('pointerup', function() { if (_fogPaintBtn >= 0) { hostGestureEnd(); if (window.wpFog && window.wpFog.strokeEnd) window.wpFog.strokeEnd(); } _fogPaintBtn = -1; });   // fold M6: the stroke is over (a dragged box is painted now)
      document.addEventListener('pointercancel', function() { if (_fogPaintBtn >= 0) { hostGestureEnd(); if (window.wpFog && window.wpFog.strokeEnd) window.wpFog.strokeEnd(true); } _fogPaintBtn = -1; });   // taken away by the system: a box half dragged paints nothing
  }
  // 1.6.0, the map environment's tool (docs/MAP_ENVIRONMENT_PLAN.md 11 and 14; envtool.js): the GM's, on the machine that owns the campaign.
  // A press, a drag and the release hand the board's points to the tool, as the fog brush's are; datamap.js keeps the board's own drag away
  wireTool({ id: 'envModeBtn', chev: 'envOptBtn', inHand: function() { return !!window.isEnvMode; }, sync: function() { if (window.wpEnvTool) window.wpEnvTool.sync(); }, take: function() {
      if (!window.wpEnvTool || !window.wpEnvTool.may()) return;
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false; window.isFogMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('envModeBtn'); closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  } });
  if (wbWrap) {
      var _envBtn = -1, _envBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, y: (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel }; };
      wbWrap.addEventListener('pointerdown', function(e) { if (!window.isEnvMode || e.button !== 0 || !window.wpEnvTool) return; var pt = _envBoard(e); _envBtn = 0; window.wpEnvTool.strokeStart(pt.x, pt.y); e.preventDefault(); });
      wbWrap.addEventListener('pointermove', function(e) { if (!window.isEnvMode || _envBtn < 0 || !window.wpEnvTool) return; var pt = _envBoard(e); window.wpEnvTool.strokeMove(pt.x, pt.y); });
      document.addEventListener('pointerup', function() { if (_envBtn >= 0 && window.wpEnvTool) window.wpEnvTool.strokeEnd(); _envBtn = -1; });
      document.addEventListener('pointercancel', function() { if (_envBtn >= 0 && window.wpEnvTool) window.wpEnvTool.strokeEnd(true); _envBtn = -1; });
  }
  // Fill bucket (1.5.0, GM): click or drag grid cells to drop a cell-sized colored shape (hexagon on hex maps,
  // square on square maps) seated in the cell at layer 'back' (below tokens); right-click a cell clears its fill.
  var _el_fillModeBtn = document.getElementById('fillModeBtn'), _el_fillMenu = document.getElementById('fillMenu');
  try { var _fc0 = localStorage.getItem('wp_fillColor'); if (_fc0 && /^#[0-9a-f]{6}$/i.test(_fc0)) state.fillColor = _fc0; } catch (e) {}
  try { state.fillTerrain = Number(localStorage.getItem('wp_fillTerrain')) || 0; } catch (e) { state.fillTerrain = 0; }   // difficult terrain T1: the fill menu's cost (cleaned where it is used), or 0
  var _fci0 = document.getElementById('fillColorInput'); if (_fci0 && /^#[0-9a-f]{6}$/i.test(state.fillColor || '')) _fci0.value = state.fillColor;
  // [fogcheck:fillmenu-start]
  function syncFillMenu() {
      document.querySelectorAll('#fillColorRow .draw-swatch[data-color]').forEach(function(sw) { sw.classList.toggle('active', sw.dataset.color.toLowerCase() === (state.fillColor || '').toLowerCase()); });
      var cs = document.querySelector('#fillColorRow .draw-swatch.custom'); if (cs) { var preset = document.querySelector('#fillColorRow .draw-swatch[data-color].active'); cs.classList.toggle('active', !preset); cs.style.background = preset ? '' : state.fillColor; }
      var _fi = document.getElementById('fillColorIndicator'); if (_fi) _fi.style.background = state.fillColor;
      var _ftc = document.getElementById('fillTerrainChk'), _ftn = document.getElementById('fillTerrainCost');   // difficult terrain T1
      var _FCs = window.wpFogCore, _ftv = _FCs && _FCs.cleanTerrain ? _FCs.cleanTerrain(state.fillTerrain) : null;
      if (_ftc) _ftc.checked = !!_ftv;
      if (_ftn) { if (_ftv) _ftn.value = _ftv; _ftn.disabled = !_ftv; }
  }
  function fillTerrainSet() {   // difficult terrain T1: the fill menu's tick and cost, kept on this machine (the cost, or 0 while unticked)
      var chk = document.getElementById('fillTerrainChk'), box = document.getElementById('fillTerrainCost'), FC = window.wpFogCore;
      var n = (box && FC && FC.cleanTerrain ? FC.cleanTerrain(Number(box.value)) : null) || 2;
      if (box) box.value = n;
      state.fillTerrain = chk && chk.checked ? n : 0;
      try { localStorage.setItem('wp_fillTerrain', String(state.fillTerrain)); } catch (e) {}
      syncFillMenu();
  }
  ['fillTerrainChk', 'fillTerrainCost'].forEach(function(id) { var e0 = document.getElementById(id); if (e0) e0.addEventListener('change', fillTerrainSet); });
  // [fogcheck:fillmenu-end]
  // [sinkcheck:texopts-start]
  // The map builder (fold B1): a Texture list's rows are the app's own names, as option values and text nodes, with Plain color for none.
  // Fold B3 (the owner, 2026-10-10: "The Texture list", "A Tile size list"): its last row is A picture, which opens the Image Library, and a
  // picture in use stands in the list under its file's own name. The two rows' values are fixed words that no texture is named by
  var TEX_PIC = '@pic', TEX_PICK = '@pick';
  var TILE_ROWS = [[1, '1 cell'], [2, '2 cells'], [4, '4 cells'], ['whole', 'Whole piece']];
  // One repeat is 50 px a cell on every map, a square cell's width: on a hex map that is a little less than a cell. A painted cell and a
  // hexagon Build lays are each a piece, so Whole piece shows the picture once in each
  var TILE_LINES = { '1': 'The picture repeats. One tile is as wide as one square cell.', '2': 'The picture repeats. One tile is as wide as two square cells.', '4': 'The picture repeats. One tile is as wide as four square cells.', 'whole': 'The picture is stretched over each piece once. A painted cell or a laid hexagon is a piece of its own.' };
  function texPicOf(v) { var FC = window.wpFogCore; return (FC && typeof FC.cleanTexSrc === 'function' ? FC.cleanTexSrc(v) : null) || ''; }
  // A repeat as a chip, a list or this computer's store names it (a text) or as a piece holds it: 1, 2, 4 or 'whole', and 1 for anything else
  function texTileOf(v) { var FC = window.wpFogCore, n = typeof v === 'string' && /^[124]$/.test(v) ? Number(v) : v; return (FC && typeof FC.cleanTexTile === 'function' ? FC.cleanTexTile(n) : null) || 1; }
  function texOptionsInto(sel, cur, pic) {
      var BC = window.wpBuildCore; if (!sel || !BC || !Array.isArray(BC.TEXTURES)) return;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Plain color'; sel.appendChild(o0);
      BC.TEXTURES.forEach(function(n) { var o = document.createElement('option'); o.value = n; o.textContent = n.charAt(0).toUpperCase() + n.slice(1); sel.appendChild(o); });
      var can = typeof BC.picName === 'function' && !!(window.wpFogCore && typeof window.wpFogCore.cleanTexSrc === 'function'), src = can ? texPicOf(pic) : '';
      if (src) { var op = document.createElement('option'); op.value = TEX_PIC; op.textContent = BC.picName(src); sel.appendChild(op); }
      if (can) { var ok = document.createElement('option'); ok.value = TEX_PICK; ok.textContent = 'A picture\u2026'; sel.appendChild(ok); }
      sel.value = src ? TEX_PIC : (BC.cleanTexture(cur) || '');
  }
  // A Texture list was changed. A name or Plain color is handed on. The picture's own row changes nothing. A picture puts the list back as it
  // was and opens the Image Library, whose pick is handed on only as a path cleanTexSrc keeps. The library says nothing when it is closed
  // with no pick, so nothing waits for one
  function texListPick(value, back, take) {
      if (value === TEX_PIC) { back(); return; }
      if (value !== TEX_PICK) { take({ tex: value }); return; }
      back();
      if (typeof window.wpPickImage !== 'function') { if (typeof toast === 'function') toast('The image library is not available here.'); return; }
      window.wpPickImage(function(src) {
          var s = texPicOf(src);
          if (!s) { if (typeof toast === 'function') toast('That picture cannot be a fill. Its name holds two dots together, a # or a % code, or it lies in the sounds or video folder. Rename or move the file and pick it again.'); return; }
          take({ pic: s });
      });
  }
  // A Texture list's last rows act at a choice, never at a key step. A closed list changes its value at every arrow key and typed letter, and
  // here that would open the Image Library, or take a picture off, on the way past. So such a key opens the list instead, where the arrow
  // keys only move and Enter or a click chooses. Alt+Down, F4 and Space open it as they always did, and Tab and Enter are left alone
  var TEX_STEP_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  function texListStep(e) { return !!e && !e.altKey && !e.ctrlKey && !e.metaKey && typeof e.key === 'string' && (TEX_STEP_KEYS.indexOf(e.key) >= 0 || (e.key.length === 1 && e.key !== ' ')); }
  function texListKeys(sel) {
      if (!sel || typeof sel.addEventListener !== 'function') return;
      sel.addEventListener('keydown', function(e) {
          if (!texListStep(e)) return;
          e.preventDefault();
          if (typeof this.showPicker === 'function') { try { this.showPicker(); } catch (err) {} }
      });
  }
  // The Tile size chips of a menu (buttons that each carry data-tile) and the grey line under them, shown only while a picture is the fill
  function tileRowSync(rowId, lineId, pic, tile, off) {
      var row = document.getElementById(rowId), line = document.getElementById(lineId), on = !!pic && !off, t = String(texTileOf(tile));
      if (row) { row.hidden = !on; Array.prototype.forEach.call(row.querySelectorAll('[data-tile]'), function(b) { var is = b.dataset.tile === t; b.classList.toggle('on', is); b.setAttribute('aria-pressed', is ? 'true' : 'false'); }); }
      if (line) { line.hidden = !on; line.textContent = on ? TILE_LINES[t] : ''; }
  }
  function tileRowWire(rowId, take) {
      var row = document.getElementById(rowId); if (!row) return;
      Array.prototype.forEach.call(row.querySelectorAll('[data-tile]'), function(b) { b.addEventListener('click', function(ev) { ev.stopPropagation(); take(texTileOf(this.dataset.tile)); }); });
  }
  window.wpTexList = { PIC: TEX_PIC, PICK: TEX_PICK, TILES: TILE_ROWS, pick: texListPick, keys: texListKeys, picOf: texPicOf, tileOf: texTileOf };   // Properties' Texture row asks the same rule
  // The fill menu's Texture list and its Tile size: the picks are kept on this computer and read back through the cleaners
  function fillTexSync() { texOptionsInto(document.getElementById('fillTexture'), state.fillTexture, state.fillPic); tileRowSync('fillTileRow', 'fillTileLine', state.fillPic, state.fillTile); }
  function fillTexKeep() { try { localStorage.setItem('wp_fillTexture', state.fillTexture); localStorage.setItem('wp_fillPic', state.fillPic || ''); localStorage.setItem('wp_fillTile', String(state.fillTile || 1)); } catch (e) {} }
  function fillTextureInit() {
      var sel = document.getElementById('fillTexture'), BC = window.wpBuildCore, kept = '', keptPic = '', keptTile = '';
      try { kept = localStorage.getItem('wp_fillTexture') || ''; keptPic = localStorage.getItem('wp_fillPic') || ''; keptTile = localStorage.getItem('wp_fillTile') || ''; } catch (e) {}
      state.fillTexture = (BC && BC.cleanTexture ? BC.cleanTexture(kept) : null) || '';
      state.fillPic = texPicOf(keptPic); state.fillTile = texTileOf(keptTile);
      if (!sel) return;
      fillTexSync();
      sel.addEventListener('change', function() {
          texListPick(this.value, fillTexSync, function(p) {
              var B2 = window.wpBuildCore;
              if (p.pic) state.fillPic = p.pic; else { state.fillPic = ''; state.fillTexture = (B2 && B2.cleanTexture ? B2.cleanTexture(p.tex) : null) || ''; }
              fillTexKeep(); fillTexSync();
          });
      });
      texListKeys(sel);
      tileRowWire('fillTileRow', function(t) { state.fillTile = t; fillTexKeep(); fillTexSync(); });
  }
  // [sinkcheck:texopts-end]
  fillTextureInit();
  wireTool({ id: 'fillModeBtn', chev: 'fillOptBtn', inHand: function() { return !!window.isFillMode; }, sync: syncFillMenu, take: function() {
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false; window.isFogMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('fillModeBtn'); closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  } });
  document.querySelectorAll('#fillColorRow .draw-swatch[data-color]').forEach(function(sw) {
      sw.addEventListener('click', function() { state.fillColor = this.dataset.color; var fi = document.getElementById('fillColorInput'); if (fi) fi.value = this.dataset.color; try { localStorage.setItem('wp_fillColor', state.fillColor); } catch (e) {} syncFillMenu(); });
  });
  var _fillColorInput = document.getElementById('fillColorInput');
  if (_fillColorInput) _fillColorInput.addEventListener('input', function() { state.fillColor = this.value; try { localStorage.setItem('wp_fillColor', state.fillColor); } catch (e) {} syncFillMenu(); });
  syncFillMenu();   // show the loaded fill color on the toolbar button at startup
  var _fillDirty = false;
  // Snap a board point to its grid cell (square 50px, or hex). One source of truth for fill + flood-fill.
  function cellSnap(x, y) {
      var cx, cy, w, h, type;
      if (state.gridType === 'hex') { var hc = snapToHex(x, y, 30, 'center'); cx = hc.x; cy = hc.y; w = 60; h = 52; type = 'hexagon'; }
      else { cx = Math.floor(x / 50) * 50 + 25; cy = Math.floor(y / 50) * 50 + 25; w = 50; h = 50; type = 'rect'; }
      return { cx: cx, cy: cy, w: w, h: h, type: type, px: Math.round(cx - w / 2), py: Math.round(cy - h / 2) };
  }
  // [fogcheck:fillcell-start]
  // Difficult terrain T1: the fill menu's cost on a cell it paints, new or painted over (true when that changed it); 0 leaves a cell's cost as it was
  function fillTerrainTo(item) {
      var FC = window.wpFogCore, t = FC && FC.cleanTerrain ? FC.cleanTerrain(state.fillTerrain) : null;
      if (!t || item.terrain === t) return false;
      item.terrain = t; return true;
  }
  // The map builder: the fill menu's texture on a cell it paints, new or painted over (true when that changed it). A name of the app's own
  // list, Plain color, which takes a texture off, or (fold B3) one of the campaign's own pictures with its repeat, which takes the pattern's
  // place. Whatever the menu says, the cell ends with that and nothing else: a pattern or Plain color takes a picture off
  function fillTextureTo(item) {
      var BC = window.wpBuildCore, FC = window.wpFogCore, pic = FC && typeof FC.cleanTexSrc === 'function' ? FC.cleanTexSrc(state.fillPic) : null, tile = pic ? ((typeof FC.cleanTexTile === 'function' ? FC.cleanTexTile(state.fillTile) : null) || 1) : null;
      var t = pic ? null : (BC && BC.cleanTexture ? BC.cleanTexture(state.fillTexture) : null), ch = false;
      if (t ? item.texture !== t : item.texture !== undefined) { if (t) item.texture = t; else delete item.texture; ch = true; }
      if (pic ? item.texSrc !== pic : item.texSrc !== undefined) { if (pic) item.texSrc = pic; else delete item.texSrc; ch = true; }
      if (tile ? item.texTile !== tile : item.texTile !== undefined) { if (tile) item.texTile = tile; else delete item.texTile; ch = true; }
      return ch;
  }
  function fillCellAt(x, y, remove) {
      var map = getActiveMap(); if (!map) return;
      if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
      var c = cellSnap(x, y), px = c.px, py = c.py;
      var existing = map.whiteboard.find(function(it) { return it && it.fill && Math.abs(it.x - px) < 1 && Math.abs(it.y - py) < 1; });
      if (remove) { if (existing) { map.whiteboard = map.whiteboard.filter(function(it) { return it !== existing; }); _fillDirty = true; render(); } return; }
      if (existing) { var ch = fillTerrainTo(existing); if (fillTextureTo(existing)) ch = true; if (existing.color !== state.fillColor) { existing.color = state.fillColor; ch = true; } if (ch) { _fillDirty = true; render(); } return; }
      var item = Object.assign({ id: 'wb' + uid(), type: c.type, x: px, y: py, w: c.w, h: c.h, baseW: c.w, baseH: c.h, z: 10, color: state.fillColor, fill: true, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      fillTerrainTo(item); fillTextureTo(item); map.whiteboard.push(item); _fillDirty = true; render();
  }
  // Add (or recolor) one fill cell WITHOUT save/render — for batch use by the flood-fill. Returns true if it changed anything.
  function fillCellCore(map, x, y) {
      var c = cellSnap(x, y), px = c.px, py = c.py;
      var existing = map.whiteboard.find(function(it) { return it && it.fill && Math.abs(it.x - px) < 1 && Math.abs(it.y - py) < 1; });
      if (existing) { var ch2 = fillTerrainTo(existing); if (fillTextureTo(existing)) ch2 = true; if (existing.color !== state.fillColor) { existing.color = state.fillColor; ch2 = true; } return ch2; }
      var item2 = Object.assign({ id: 'wb' + uid(), type: c.type, x: px, y: py, w: c.w, h: c.h, baseW: c.w, baseH: c.h, z: 10, color: state.fillColor, fill: true, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      fillTerrainTo(item2); fillTextureTo(item2); map.whiteboard.push(item2);
      return true;
  }
  // [fogcheck:fillcell-end]
  // Ramer–Douglas–Peucker polyline simplification (iterative, no recursion). Keeps endpoints; drops points within eps of a chord.
  function rdpSimplify(points, eps) {
      var n = points.length;
      if (n < 3) return points.slice();
      var keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
      var stack = [[0, n - 1]], epsSq = eps * eps;
      while (stack.length) {
          var seg = stack.pop(), s = seg[0], e = seg[1];
          if (e <= s + 1) continue;
          var ax = points[s][0], ay = points[s][1], bx = points[e][0], by = points[e][1];
          var maxD = -1, idx = -1;
          for (var i = s + 1; i < e; i++) {
              var dd = distToSegSq(points[i][0], points[i][1], ax, ay, bx, by);
              if (dd > maxD) { maxD = dd; idx = i; }
          }
          if (maxD > epsSq && idx > s) { keep[idx] = 1; stack.push([s, idx]); stack.push([idx, e]); }
      }
      var out = [];
      for (var k = 0; k < n; k++) if (keep[k]) out.push(points[k]);
      return out;
  }
  // Point-in-polygon (ray cast) — used to erase a freeform fill region as a whole item.
  function pointInPoly(x, y, poly) {
      var inside = false, n = poly.length;
      for (var i = 0, j = n - 1; i < n; j = i++) {
          var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
  }
  // Moore-neighbour boundary trace (8-connected) from a component's top-left-most pixel. solid(x,y) => in-component.
  // Returns an ordered loop of pixel coords, or null. Bounded by maxSteps against a stray loop.
  function mooreTrace(solid, cw, ch, sx, sy) {
      var nb = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // clockwise from West
      var start = [sx, sy], startB = [sx - 1, sy];   // arrived from the west (empty: sx,sy is first in raster order for its component)
      var p = [sx, sy], b = [sx - 1, sy];
      var contour = [], maxSteps = cw * ch * 4 + 16, steps = 0;
      do {
          var dx = b[0] - p[0], dy = b[1] - p[1], idx = 0;
          for (var i = 0; i < 8; i++) { if (nb[i][0] === dx && nb[i][1] === dy) { idx = i; break; } }
          var found = false, j = 0, nx = 0, ny = 0;
          for (var k = 1; k <= 8; k++) { j = (idx + k) % 8; nx = p[0] + nb[j][0]; ny = p[1] + nb[j][1]; if (solid(nx, ny)) { found = true; break; } }
          if (!found) { contour.push([p[0], p[1]]); break; }   // isolated pixel
          b = [p[0] + nb[(j + 7) % 8][0], p[1] + nb[(j + 7) % 8][1]];
          p = [nx, ny];
          contour.push([p[0], p[1]]);
          steps++;
      } while ((p[0] !== start[0] || p[1] !== start[1] || b[0] !== startB[0] || b[1] !== startB[1]) && steps < maxSteps);
      return contour.length >= 3 ? contour : null;
  }
  // Trace the OUTER boundary of a flooded pixel region into a loop of pixel coords, or null.
  function traceRegionOutline(vis, cw, ch) {
      var sx = -1, sy = -1;
      for (var yy = 0; yy < ch && sy < 0; yy++) { for (var xx = 0; xx < cw; xx++) { if (vis[yy * cw + xx] === 1) { sx = xx; sy = yy; break; } } }
      if (sx < 0) return null;
      return mooreTrace(function(x, y) { return x >= 0 && y >= 0 && x < cw && y < ch && vis[y * cw + x] === 1; }, cw, ch, sx, sy);
  }
  /* Enclosed HOLES in the flooded region: pixels that are neither wall, nor flooded (visited), nor reachable
     from the raster border ("outside"). Returns one boundary loop per hole component (an interior island such
     as a pillar), so the freeform fill can punch them out and match the grid-on cell behaviour. Capped. */
  function traceHoles(vis, isWall, cw, ch) {
      var N = cw * ch, outside = new Uint8Array(N), st = new Int32Array(N), sp = 0;
      var pushOut = function(i) { if (!outside[i] && !isWall(i)) { outside[i] = 1; st[sp++] = i; } };
      for (var x = 0; x < cw; x++) { pushOut(x); pushOut((ch - 1) * cw + x); }
      for (var y = 0; y < ch; y++) { pushOut(y * cw); pushOut(y * cw + cw - 1); }
      while (sp > 0) {
          var oi = st[--sp], ox2 = oi % cw, oy2 = (oi - ox2) / cw;
          if (ox2 > 0) pushOut(oi - 1);
          if (ox2 < cw - 1) pushOut(oi + 1);
          if (oy2 > 0) pushOut(oi - cw);
          if (oy2 < ch - 1) pushOut(oi + cw);
      }
      var mask = new Uint8Array(N), any = false;
      for (var i2 = 0; i2 < N; i2++) { if (!isWall(i2) && vis[i2] !== 1 && !outside[i2]) { mask[i2] = 1; any = true; } }
      if (!any) return [];
      var solid = function(hx, hy) { return hx >= 0 && hy >= 0 && hx < cw && hy < ch && mask[hy * cw + hx] === 1; };
      var loops = [], st2 = new Int32Array(N);
      for (var seed = 0; seed < N && loops.length < 200; seed++) {
          if (mask[seed] !== 1) continue;
          var ssx = seed % cw, ssy = (seed - ssx) / cw;
          var loop = mooreTrace(solid, cw, ch, ssx, ssy);
          if (loop && loop.length >= 3) loops.push(loop);
          var q = 0; st2[q++] = seed; mask[seed] = 2;   // consume this component (4-connected) so it isn't re-traced
          while (q > 0) {
              var k = st2[--q], kx = k % cw, ky = (k - kx) / cw;
              if (kx > 0 && mask[k - 1] === 1) { mask[k - 1] = 2; st2[q++] = k - 1; }
              if (kx < cw - 1 && mask[k + 1] === 1) { mask[k + 1] = 2; st2[q++] = k + 1; }
              if (ky > 0 && mask[k - cw] === 1) { mask[k - cw] = 2; st2[q++] = k - cw; }
              if (ky < ch - 1 && mask[k + cw] === 1) { mask[k + cw] = 2; st2[q++] = k + cw; }
          }
      }
      return loops;
  }
  /* Flood-fill inside drawn lines: rasterize this map's pen strokes into an offscreen canvas as walls,
     flood outward from the click, and — if the flood is fully enclosed (never touches the padded edge) —
     GRID ON: paint every grid cell whose centre lands in the flooded region (grid-aligned);
     GRID OFF: trace the flooded outline into one smooth freeform filled region (a tip:'fill' path).
     Grid-aware per the owner's choice; capped both ways. */
  function floodFillWithin(x, y) {
      var map = getActiveMap(); if (!map) return;
      if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
      var walls = [], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      map.whiteboard.forEach(function(it) {
          if (!it || it.type !== 'path' || !it.pts || !it.pts.length) return;
          var sx = it.w / (it.baseW || it.w || 1), sy = it.h / (it.baseH || it.h || 1);
          var sw = Math.max(2, (it.strokeWidth || 3));
          var abs = it.pts.map(function(p) { return [it.x + p[0] * sx, it.y + p[1] * sy]; });
          abs.forEach(function(p) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
          walls.push({ abs: abs, sw: sw });
      });
      if (!walls.length) { toast('Draw some lines first — flood-fill needs an outline to fill inside.'); return; }
      var PAD = 30;
      minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
      if (x < minX || x > maxX || y < minY || y > maxY) { toast('Click inside your drawn lines to flood-fill.'); return; }
      var wpx = Math.max(1, maxX - minX), hpx = Math.max(1, maxY - minY);
      var S = Math.min(1, Math.sqrt(1500000 / (wpx * hpx)));   // cap the raster at ~1.5M px
      var cw = Math.max(2, Math.round(wpx * S)), ch = Math.max(2, Math.round(hpx * S));
      var cvs = document.createElement('canvas'); cvs.width = cw; cvs.height = ch;
      var g = cvs.getContext('2d', { willReadFrequently: true }); if (!g) { toast('Flood-fill isn\'t available here.'); return; }
      g.setTransform(S, 0, 0, S, -minX * S, -minY * S);
      g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineJoin = 'round'; g.lineCap = 'round';
      var minWall = 1.6 / S;   // keep walls at least ~1.6 device px thick so a downscaled raster can't leak through thin seams
      walls.forEach(function(wl) {
          var lw = Math.max(wl.sw, minWall);
          g.lineWidth = lw; g.beginPath();
          wl.abs.forEach(function(p, i) { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
          if (wl.abs.length === 1) { g.arc(wl.abs[0][0], wl.abs[0][1], lw / 2, 0, 6.2832); g.fill(); }
          else g.stroke();
      });
      var img;
      try { img = g.getImageData(0, 0, cw, ch).data; } catch (e) { toast('Couldn\'t read the drawing to flood-fill.'); return; }
      var sxp = Math.round((x - minX) * S), syp = Math.round((y - minY) * S);
      if (sxp < 0 || sxp >= cw || syp < 0 || syp >= ch) { toast('Click inside your drawn lines to flood-fill.'); return; }
      var wall = function(i) { return img[i * 4 + 3] > 40; };   // any drawn (alpha) pixel is a wall
      var start = syp * cw + sxp;
      if (wall(start)) { toast('Click in an open space, not on a line.'); return; }
      var visited = new Uint8Array(cw * ch), stack = new Int32Array(cw * ch), sp = 0;
      stack[sp++] = start; visited[start] = 1;
      var touchedEdge = false;
      while (sp > 0) {
          var idx = stack[--sp], cxp = idx % cw, cyp = (idx - cxp) / cw;
          if (cxp === 0 || cyp === 0 || cxp === cw - 1 || cyp === ch - 1) touchedEdge = true;
          var l = idx - 1, r = idx + 1, u = idx - cw, d = idx + cw;
          if (cxp > 0 && !visited[l] && !wall(l)) { visited[l] = 1; stack[sp++] = l; }
          if (cxp < cw - 1 && !visited[r] && !wall(r)) { visited[r] = 1; stack[sp++] = r; }
          if (cyp > 0 && !visited[u] && !wall(u)) { visited[u] = 1; stack[sp++] = u; }
          if (cyp < ch - 1 && !visited[d] && !wall(d)) { visited[d] = 1; stack[sp++] = d; }
      }
      if (touchedEdge) { toast('That space isn\'t fully enclosed by your lines — close the gaps and try again.'); return; }
      if (state.gridType === 'hex' || state.gridType === 'square') {
          // GRID ON — fill whole cells whose centre lands in the flooded region (stays aligned with tokens + measurement).
          // Sample the bbox finer than any cell so none is skipped.
          var step = 20, seen = {}, added = 0, CAP = 20000;
          for (var yy = minY; yy <= maxY + step && added < CAP; yy += step) {
              for (var xx = minX; xx <= maxX + step && added < CAP; xx += step) {
                  var c = cellSnap(xx, yy), key = c.px + ',' + c.py;
                  if (seen[key]) continue; seen[key] = 1;
                  var pxc = Math.round((c.cx - minX) * S), pyc = Math.round((c.cy - minY) * S);
                  if (pxc < 0 || pxc >= cw || pyc < 0 || pyc >= ch) continue;
                  if (!visited[pyc * cw + pxc]) continue;   // this cell's centre isn't inside the flooded area
                  if (fillCellCore(map, c.cx, c.cy)) added++;
              }
          }
          if (added) { save(); render(); toast('Filled ' + added + ' cell' + (added === 1 ? '' : 's') + ' inside your lines.'); }
          else { toast('Nothing new to fill there.'); }
          return;
      }
      // GRID OFF — fill the enclosed area as one smooth freeform region: trace the flooded outline into a filled shape.
      var loopPx = traceRegionOutline(visited, cw, ch);
      if (!loopPx || loopPx.length < 3) { toast('Couldn\'t trace that area — try a cleaner outline.'); return; }
      var toBoard = function(p) { return [minX + (p[0] + 0.5) / S, minY + (p[1] + 0.5) / S]; };   // pixel centre → board coords
      var loopBd = loopPx.map(toBoard);
      // Simplify tolerance in board px — but never coarser than ~1/3 the region's own thickness, so a thin channel survives.
      var lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
      loopBd.forEach(function(p) { if (p[0] < lx0) lx0 = p[0]; if (p[0] > lx1) lx1 = p[0]; if (p[1] < ly0) ly0 = p[1]; if (p[1] > ly1) ly1 = p[1]; });
      var thin = Math.min(lx1 - lx0, ly1 - ly0);
      var eps = Math.max(2.5, 1.5 / S);
      if (thin < eps * 3) eps = Math.max(0.4, thin / 3);
      var simp = rdpSimplify(loopBd, eps), epsN = eps;
      while (simp.length > 6000 && epsN < 1e5) { epsN *= 2; simp = rdpSimplify(loopBd, epsN); }   // actually enforce the vertex ceiling
      if (simp.length < 3) { toast('Couldn\'t trace that area — try a cleaner outline.'); return; }
      var ox = Infinity, oy = Infinity, mx = -Infinity, my = -Infinity;
      simp.forEach(function(p) { if (p[0] < ox) ox = p[0]; if (p[0] > mx) mx = p[0]; if (p[1] < oy) oy = p[1]; if (p[1] > my) my = p[1]; });
      var rw = Math.max(10, mx - ox), rh = Math.max(10, my - oy);
      var toLocal = function(p) { return [+(p[0] - ox).toFixed(2), +(p[1] - oy).toFixed(2)]; };
      var local = simp.map(toLocal);
      // Punch interior islands (e.g. a pillar drawn inside the room) out of the fill, matching the grid-on cell behaviour.
      // Keep ONLY holes that lie inside THIS region's outer contour — other enclosed drawings elsewhere on the map are not ours.
      var holes = [];
      traceHoles(visited, wall, cw, ch).forEach(function(hl) {
          var hb = hl.map(toBoard);
          if (!pointInPoly(hb[0][0], hb[0][1], loopBd)) return;
          var hs = rdpSimplify(hb, epsN);
          if (hs.length >= 3) holes.push(hs.map(toLocal));
      });
      var region = Object.assign({ id: 'wb' + uid(), type: 'path', tip: 'fill', x: ox, y: oy, w: rw, h: rh, baseW: rw, baseH: rh,
          z: 10, pts: local, color: state.fillColor, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      if (holes.length) region.holes = holes;
      fillTextureTo(region);   // the fill menu's texture on the freeform area too
      map.whiteboard.push(region);
      save(); render();
      toast('Filled the area inside your lines.');
  }
  if (wbWrap) {
      var _fillPaintBtn = -1;
      var _fillBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, y: (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel }; };
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isFillMode || (e.button !== 0 && e.button !== 2)) return;
          var pt = _fillBoard(e); e.preventDefault();
          var flood = document.getElementById('fillFloodChk');
          if (e.button === 0 && flood && flood.checked) { floodFillWithin(pt.x, pt.y); return; }   // flood is a single-click action (no paint-drag); right-click still erases one cell
          _fillPaintBtn = e.button; fillCellAt(pt.x, pt.y, e.button === 2);
      });
      wbWrap.addEventListener('pointermove', function(e) { if (!window.isFillMode || _fillPaintBtn < 0) return; var pt = _fillBoard(e); fillCellAt(pt.x, pt.y, _fillPaintBtn === 2); });
      wbWrap.addEventListener('contextmenu', function(e) { if (window.isFillMode) e.preventDefault(); });
      document.addEventListener('pointerup', function() { if (_fillPaintBtn >= 0 && _fillDirty) { save(); _fillDirty = false; } _fillPaintBtn = -1; });
  }
  // [systemcheck:radiusopts-start]
  var _el_blastModeBtn = document.getElementById('blastModeBtn');
  var _el_blastMenu = document.getElementById('blastMenu');
  function closeBlastMenu() { if (_el_blastMenu) _el_blastMenu.classList.remove('show'); }
  function lastBlast() { for (var i = blasts.length - 1; i >= 0; i--) if (!blasts[i].lost) return blasts[i]; return null; }   // the last shape or blast on screen: never a circle whose token is off this screen's copy of the map
  // ... and the one the height box reaches: never a shape of the tool's own while a pick waits for its click, since the options show the pick then
  function lastTall() { var b = lastBlast(); return b && circleKeptPicked && ownCircle(b) ? null : b; }
  function syncBlastMenu() {
      if (!_el_blastMenu) return;
      var b = lastTall(), now = circleNow(), ru = rulerUnitNow(); _circleUnitShown = ru;
      var ftIn = document.getElementById('blastFt'); if (ftIn && document.activeElement !== ftIn) ftIn.value = circleTyped(now.yd, now.as, ru);
      var inIn = document.getElementById('blastInner'); if (inIn && document.activeElement !== inIn) inIn.value = circleTyped(now.inn, 'r', ru);
      var dgIn = document.getElementById('blastAngle'); if (dgIn && document.activeElement !== dgIn) dgIn.value = now.deg;
      var unEl = document.getElementById('blastUnit'); if (unEl) unEl.textContent = ru;
      var inW = document.getElementById('blastInnerWrap'); if (inW) inW.style.display = now.as === 'ring' ? '' : 'none';   // a ring's inner distance and a cone's angle show with their own shape only
      var dgW = document.getElementById('blastAngleWrap'); if (dgW) dgW.style.display = now.as === 'cone' ? '' : 'none';
      var shNow = now.tok === true ? 'tok' : shapeOf(now.as);
      document.querySelectorAll('#blastShapeRow .draw-style-btn').forEach(function(x) { x.classList.toggle('active', x.dataset.shape === shNow); });
      var shN = document.getElementById('blastShapeNote'); if (shN) shN.textContent = shapeNote(now.as, now.tok);
      var asRow = document.getElementById('blastAsRow'); if (asRow) asRow.style.display = shNow === 'circle' || shNow === 'tok' ? '' : 'none';   // Radius or Diameter is a circle's question, on a token or not
      document.querySelectorAll('#blastAsRow .draw-style-btn').forEach(function(x) { x.classList.toggle('active', x.dataset.as === now.as); });
      var elIn = document.getElementById('blastElev'); if (elIn && document.activeElement !== elIn) boxHeight(elIn, b ? b.elev || 0 : 0);   // item 19 H1: in the viewer's unit; 1.5.4: its arrows step one yard from the figure it shows
      var elU = document.getElementById('blastElevUnit'); if (elU) elU.textContent = lenUnit();
      var elRow = document.getElementById('blastElevRow'); if (elRow) elRow.style.display = stanceOn('elevation') ? '' : 'none';
      var flat = document.getElementById('blastFlatNote');
      if (flat) {
          flat.style.display = stanceOn('elevation') ? 'none' : '';
          var why = window.wpVtt ? window.wpVtt.whyOff('elevation') : 'own';   // whose setting keeps it flat
          flat.textContent = why === 'gm' ? 'Token elevation is off at this table (the GM\'s setting): flat hex distance.'
              : why === 'local' ? 'Token elevation is off for you at this table (⚙ Settings ▸ VTT features): flat hex distance.'
              : 'Token elevation is off for this campaign (⚙ Settings ▸ VTT features): flat hex distance.';
      }
      var nOwn = blasts.filter(function(x) { return ownCircle(x) && !x.lost; }).length;   // the shapes on screen: a circle whose token is gone is not one
      var which = document.getElementById('blastWhich'); if (which) which.textContent = nOwn && !circleKeptPicked ? 'The numbers are those of the last shape you placed. You have ' + nOwn + ' on this map.' : now.tok === true ? 'Click a token on the map to put a circle on it.' : now.as === 'ring' ? 'Click a cell on the map to place a ring.' : now.as === 'cone' ? 'Press a cell on the map and drag to aim the cone.' : 'Click a cell on the map to place a circle.';
      if (typeof explodeHitRow === 'function') explodeHitRow();   // the Explode boxes ask about the centre token only while the circle that would go off sits on one
  }
  function lastOwn() { for (var i = blasts.length - 1; i >= 0; i--) if (ownCircle(blasts[i]) && !blasts[i].lost) return blasts[i]; return null; }   // the last shape of the tool's own that is on screen
  function lastEdit() { return circleKeptPicked ? null : lastOwn(); }   // the shape the options show and change. None while a shape picked with none on screen waits for its click: a circle that came back with its token since is left as it is, and the options go on showing the pick
  function circleNow() {   // what the options show: the last shape of the tool's own, else the one kept for the next. A number the shape does not carry (a circle has no angle) is the one kept
      var c = lastEdit(); return circleShape(c ? { yd: c.yd, as: c.as, inn: c.as === 'ring' ? c.inn : circleKept.inn, deg: c.as === 'cone' ? c.deg : circleKept.deg, tok: typeof c.tok === 'string' || circleKept.tok === true } : circleKept);   // On a token shows for a circle that sits on one, and for a free circle while the next click is to go onto a token (circleShape keeps the mark for a circle alone)
  }
  // The options: what is measured, the size box, a ring's inner distance, a cone's angle. ch names what changed, each only when it did:
  // { size, as, inner, deg, tok }, as typed (tok: true or false, On a token picked or left). It shapes the last shape of the tool's own
  // and the next one, and is kept on this computer. A thrown blast is its item's size: nothing here changes one
  function setCircle(ch) {
      var ru = rulerUnitNow(), now = circleNow(), kind = ch.as !== undefined ? circleKind(ch.as) : now.as;
      if (_circleUnitShown && _circleUnitShown !== ru) { syncBlastMenu(); return; }   // the unit changed under the boxes: show them as they stand
      var cy = cellYdNow(), yd = ch.size !== undefined ? circleYd(ch.size, kind, ru, cy) : now.yd;
      if (!(yd > 0)) { syncBlastMenu(); return; }   // nothing to read
      circleKept = circleShape({ yd: yd, as: kind, inn: ch.inner !== undefined ? circleYd(ch.inner, 'r', ru, cy) : now.inn, deg: ch.deg !== undefined ? coneDeg(ch.deg, now.deg) : now.deg, tok: ch.tok !== undefined ? ch.tok === true : now.tok });
      try { localStorage.setItem('wp_radius', JSON.stringify(circleKept)); } catch (e) {}
      if (circleKept.as === 'r' || circleKept.as === 'd') circleCas = circleKept.as;
      var c = lastEdit(); if (!c) circleKeptPicked = true;
      if (c) {
          c.yd = circleKept.yd; c.as = circleKept.as; delete c.inn; delete c.deg;
          if (c.as === 'ring') c.inn = circleKept.inn; else if (c.as === 'cone') { c.deg = circleKept.deg; if (typeof c.dir !== 'number' || !isFinite(c.dir)) c.dir = circleDir; }
          if (c.as !== 'cone') delete c.dir;
          if (circleKept.tok !== true && typeof c.tok === 'string') delete c.tok;   // off its token: a shape of its own where it stands
          else if (ch.tok === true && typeof c.tok !== 'string') { var m0 = getActiveMap(), t0 = m0 ? tokenAtPoint(m0, c.x, c.y) : null; if (t0) { c.tok = t0.id; circleFollow(m0); } }   // On a token, picked for a circle already placed: onto the token it stands on, where one is there
          renderMeasures();
      }
      syncBlastMenu();
  }
  // The owed review, 2026-10-09: a Throw armed from a sheet and then left, by taking another tool and not by Esc, stayed armed, and the next
  // click of the Radius tool threw it for real, for the whole table, where its player meant to measure. Taking any tool puts it down
  function disarmThrow() { if (_armedThrow) { _armedThrow = null; document.body.classList.remove('placing'); } if (typeof window !== 'undefined' && window.wpDisarmFxBurst) window.wpDisarmFxBurst(); }   // 1.5.4: a burst armed from the effects panel goes too: left armed, it made a later Escape put away the tool taken since
  // ... and when the last shape of the tool's own goes (set off, or taken off by a right-click), the shape kept for the next click follows
  // what the options then show, an older shape's numbers: a click places what is in sight
  function circleRekept() {
      if (circleKeptPicked || !lastOwn()) return;   // a pick that waits for its click is already the shape kept, and the options show it: a circle that goes meanwhile changes nothing (the review of 2026-10-10: a right-click on one of two circles that came back threw the pick away)
      circleKeptPicked = false; circleKept = circleNow();   // the very shape the options show, On a token included
      if (circleKept.as === 'r' || circleKept.as === 'd') circleCas = circleKept.as;
      try { localStorage.setItem('wp_radius', JSON.stringify(circleKept)); } catch (e) {}
  }
  // While a Throw armed from a sheet is in hand this tool is not, though the mode is its own: its icon TAKES the tool, and so does its small
  // arrow when it opens the options, which puts the Throw down (the review of the fold's own fixes, 2026-10-09: the arrow only opened the
  // options, and the next click threw). The arrow over options that are already up only closes them: nothing there says measure
  wireTool({ id: 'blastModeBtn', chev: 'blastOptBtn', inHand: function() { return !_armedThrow && !!window.isMeasureMode && window.wpMeasureKind === 'blast'; }, sync: syncBlastMenu, take: function() {
      disarmThrow();
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      window.isDrawingMode = false; window.isEraserMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('blastModeBtn');
      closeDrawMenu(); if (_el_measureMenu) _el_measureMenu.classList.remove('show');
      state.selWbId = null; state.selWbIds = []; render();
  } });
  var _el_blastFt = document.getElementById('blastFt');
  if (_el_blastFt) _el_blastFt.addEventListener('change', function() { setCircle({ size: this.value }); });
  var _el_blastInner = document.getElementById('blastInner'), _el_blastAngle = document.getElementById('blastAngle');
  if (_el_blastInner) _el_blastInner.addEventListener('change', function() { setCircle({ inner: this.value }); });
  if (_el_blastAngle) _el_blastAngle.addEventListener('change', function() { setCircle({ deg: this.value }); });
  function circleRead(as, tok) {   // another reading or another shape: the number in the box stays, and is read the new way. tok: On a token picked (true) or another shape (false); a reading leaves it as it is
      var now = circleNow(), n = _el_blastFt ? Number(_el_blastFt.value) : NaN;
      setCircle({ as: as, size: n > 0 ? n : circleTyped(now.yd, now.as, rulerUnitNow()), tok: tok });
  }
  document.querySelectorAll('#blastAsRow .draw-style-btn').forEach(function(x) { x.addEventListener('click', function() { var as = circleAs(this.dataset.as); if (as !== circleNow().as) circleRead(as); }); });
  document.querySelectorAll('#blastShapeRow .draw-style-btn').forEach(function(x) { x.addEventListener('click', function() {
      var sh = this.dataset.shape === 'ring' || this.dataset.shape === 'cone' || this.dataset.shape === 'tok' ? this.dataset.shape : 'circle', now = circleNow(); if (sh === (now.tok === true ? 'tok' : shapeOf(now.as))) return;
      circleRead(sh === 'ring' ? 'ring' : sh === 'cone' ? 'cone' : circleCas, sh === 'tok');
  }); });
  var _el_blastElev = document.getElementById('blastElev');
  if (_el_blastElev) _el_blastElev.addEventListener('input', function() { var b = lastTall(); if (!b) return; var v = ydIn(this.value); b.elev = isFinite(v) ? Math.max(-999, Math.min(999, Math.round(v * 10) / 10)) : 0; b.autoElev = false; renderMeasures(); });   // item 19 H1: typed in the viewer's unit
  if (_el_blastElev) _el_blastElev.addEventListener('change', function() { var b = lastTall(); if (b) boxHeight(this, b.elev || 0); });   // once set, the box shows the height as kept, and steps from there
  var _el_blastClearBtn = document.getElementById('blastClearBtn');
  if (_el_blastClearBtn) _el_blastClearBtn.addEventListener('click', function() {
      if (playerScreen()) { blasts = blasts.filter(function(b) { return !ownCircle(b); }); renderMeasures(); syncBlastMenu(); }   // a player clears the circles they placed: a blast the GM threw is the table's
      else clearBlasts();
  });
  var _el_blastUndoThrow = document.getElementById('blastUndoThrow');
  if (_el_blastUndoThrow) _el_blastUndoThrow.addEventListener('click', function() { if (window.wpUndoThrow) window.wpUndoThrow(); });
  if (_el_blastMenu) ['pointerdown', 'click'].forEach(function(ev) { _el_blastMenu.addEventListener(ev, function(e) { e.stopPropagation(); disarmThrow(); }); });   // a press in the tool's options is a wish to measure: a Throw armed while they were up is put down
  // [systemcheck:radiusopts-end]

  // Pen preferences survive restarts: color, width, freehand/line (wp_drawColor / wp_drawWidth / wp_drawStraight)
  try { var _dc0 = localStorage.getItem('wp_drawColor'); if (_dc0 && /^#[0-9a-f]{6}$/i.test(_dc0)) state.drawColor = _dc0; } catch (e) {}
  try { var _dw0 = parseInt(localStorage.getItem('wp_drawWidth'), 10); if ([2, 3, 6, 10, 16].indexOf(_dw0) !== -1) state.drawStrokeWidth = _dw0; } catch (e) {}
  try { if (localStorage.getItem('wp_drawStraight') !== null) state.drawStraight = localStorage.getItem('wp_drawStraight') === '1'; } catch (e) {}
  try { var _dt0 = localStorage.getItem('wp_drawTip'); if (['round', 'square', 'flat'].indexOf(_dt0) !== -1) state.drawTip = _dt0; } catch (e) {}
  var _dci0 = document.getElementById('drawColorInput'); if (_dci0 && /^#[0-9a-f]{6}$/i.test(state.drawColor || '')) _dci0.value = state.drawColor;
  function saveDrawPrefs() { try { localStorage.setItem('wp_drawColor', state.drawColor); localStorage.setItem('wp_drawWidth', String(state.drawStrokeWidth)); localStorage.setItem('wp_drawStraight', state.drawStraight ? '1' : '0'); localStorage.setItem('wp_drawTip', state.drawTip || 'round'); } catch (e) {} }
  syncDrawMenu();
  document.querySelectorAll('#drawColorRow .draw-swatch[data-color]').forEach(function(sw) {
      sw.addEventListener('click', function() {
          state.drawColor = this.dataset.color;
          saveDrawPrefs();
          var input = document.getElementById('drawColorInput');
          if(input) input.value = this.dataset.color;
          syncDrawMenu();
      });
  });

  var drawColorInput = document.getElementById('drawColorInput');
  if(drawColorInput) drawColorInput.addEventListener('input', function() {
      state.drawColor = this.value;
      saveDrawPrefs();
      syncDrawMenu();
  });

  document.querySelectorAll('#drawSizeRow .draw-size-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
          state.drawStrokeWidth = parseInt(this.dataset.size);
          saveDrawPrefs();
          syncDrawMenu();
      });
  });

  document.querySelectorAll('#drawStyleRow .draw-style-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
          state.drawStraight = this.dataset.straight === 'true';
          saveDrawPrefs();
          syncDrawMenu();
      });
  });
  // [lookcheck:pennib-start]
  // A pen tip's button names its nib in data-nib, never data-tip: tooltips.js moves every title into data-tip at the first hover, so a tip
  // read from there after a hover was the tooltip's words, which every reader of a line takes as round (found live, 2026-10-17). Only a nib
  // the pen knows is taken, as at the launch
  document.querySelectorAll('#drawTipRow .draw-style-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
          var nib = this.dataset.nib; if (['round', 'square', 'flat'].indexOf(nib) === -1) return;
          state.drawTip = nib;
          saveDrawPrefs();
          syncDrawMenu();
      });
  });
  // [lookcheck:pennib-end]

  syncDrawMenu();

  var _el_addImageBtn = document.getElementById('addImageBtn');

if(_el_addImageBtn) _el_addImageBtn.addEventListener('click', () => document.getElementById('imgFileIn').click());

  /* ---------- image library ---------- */

  var _imgLibCache = null;
  /* ---- library scope and categories (1.5.0) ----
     Scope. A picture belongs to a campaign when one of the campaign's items owns the folder it was uploaded
     into (the folder is the uploading item's id) or when the campaign uses it (play-map items, room scenes,
     portraits, handouts, page and planner picture blocks, the cast) or brought it in (camp.pictures).
     tutorial/ is Shared, whatever uses it. A picture nobody owns or uses is Unfiled.
     Categories. Two stores of one shape { list: [names], by: { path: [names] }, shelf: { name: true } }:
     appState.imageCats holds the SHARED categories (every campaign sees them; the tutorial's Default),
     camp.imageCats the campaign's own — GM bookkeeping that never leaves the machine (net.js sanitizeAppState,
     cleanup.js STRIPPED). A name is unique across a campaign's list and the shared list. Readers never
     create a store (an empty shaped store would count as local work for the cleanup classifier). */
  var EMPTY_CATS = Object.freeze({ list: Object.freeze([]), by: Object.freeze({}), shelf: Object.freeze({}) });
  var _imgLibCat = '';          // '' = the whole view, '__bymap', '__none', or a category name
  var _imgLibCatCamp = null;    // the campaign the chip was chosen in: a switch resets it
  var _imgLibScope = 'camp';    // 'camp' | 'shared' | 'unfiled' | 'all'
  var _imgLibPicker = null;     // Import from another campaign…: the source ('<campId>' | 'shared' | 'unfiled'), else null
  var _imgLibStash = null;      // the main view's state while the picker is open
  var _imgIndex = null;         // built per open from the save: { refs: { path: [campIds] }, titles: { itemId: { title, campId, camp } } }
  function fixCats(c) { if (!Array.isArray(c.list)) c.list = []; if (!c.by || typeof c.by !== 'object') c.by = {}; if (!c.shelf || typeof c.shelf !== 'object') c.shelf = {}; return c; }
  function catStoreIn(data, store, create) {   // 'shared' or a campaign id; create only from a writer
      if (!data) return EMPTY_CATS;
      if (store === 'shared') {
          if (!data.imageCats || typeof data.imageCats !== 'object') { if (!create) return EMPTY_CATS; data.imageCats = { list: [], by: {}, shelf: {} }; }
          return fixCats(data.imageCats);
      }
      var camp = data.campaigns && data.campaigns[store]; if (!camp || typeof camp !== 'object') return EMPTY_CATS;
      if (!camp.imageCats || typeof camp.imageCats !== 'object') { if (!create) return EMPTY_CATS; camp.imageCats = { list: [], by: {}, shelf: {} }; }
      return fixCats(camp.imageCats);
  }
  function catStore(store, create) { return catStoreIn(state.appState, store, create); }
  function viewCampId() { if (_imgLibPicker && _imgLibPicker !== 'shared' && _imgLibPicker !== 'unfiled') return _imgLibPicker; var c = getActiveCampaign(); return c ? c.id : null; }
  // the stores a view reads: the viewed campaign's own, then the shared one
  function catStores() { var id = viewCampId(); var out = []; if (id) out.push({ key: id, c: catStore(id) }); out.push({ key: 'shared', c: catStore('shared') }); return out; }
  function catHome(name) { var id = viewCampId(); if (id && catStore(id).list.indexOf(name) >= 0) return id; if (catStore('shared').list.indexOf(name) >= 0) return 'shared'; return null; }
  function catList() { var out = []; catStores().forEach(function(s) { s.c.list.forEach(function(n) { out.push({ name: n, store: s.key }); }); }); return out; }
  function tagsIn(c, path) { var v = c.by[path]; if (!v) return []; return (Array.isArray(v) ? v : [v]).filter(function(n) { return c.list.indexOf(n) >= 0; }); }
  function imgCatsOf(path) { var out = []; catStores().forEach(function(s) { tagsIn(s.c, path).forEach(function(n) { if (out.indexOf(n) < 0) out.push(n); }); }); return out; }
  function imgCatOf(path) { var a = imgCatsOf(path); return a.length ? a.join(', ') : ''; }
  function imgCatHas(path, name) { return imgCatsOf(path).indexOf(name) >= 0; }
  function isShelved(name) { return catStores().some(function(s) { return !!s.c.shelf[name]; }); }
  // A picture's tags, written: each name goes to the store it lives in; an unknown name to the campaign's store
  function imgCatWrite(path, arr) {
      var byStore = {}, home = viewCampId() || 'shared';
      arr.forEach(function(n) { var h = catHome(n) || home; (byStore[h] = byStore[h] || []).push(n); });
      catStores().forEach(function(s) {
          if (byStore[s.key]) catStore(s.key, true).by[path] = byStore[s.key];
          else if (s.c.by[path]) delete s.c.by[path];
      });
  }
  function imgCatsSave() { import('./io.js').then(function(m) { m.save(true); }); }
  // Tag a set of pictures with a category (creating it), optionally on its own shelf; store = 'shared' or a campaign id (the tutorial uses 'shared')
  window.wpImgCatEnsure = function(name, paths, shelf, store) {
      var c = catStore(store || 'shared', true);
      if (c.list.indexOf(name) < 0) c.list.push(name);
      (paths || []).forEach(function(p) { var a = tagsIn(c, p); if (a.indexOf(name) < 0) { a.push(name); c.by[p] = a; } });
      if (shelf) c.shelf[name] = true;
  };
  // Rename a category in one store (list, tags, shelf); a no-op when it does not exist or the new name is taken
  window.wpImgCatRename = function(oldName, newName, store) {
      var c = catStore(store || 'shared'); if (c === EMPTY_CATS || c.list.indexOf(oldName) < 0 || c.list.indexOf(newName) >= 0) return false;
      c.list[c.list.indexOf(oldName)] = newName;
      Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === oldName ? newName : n; }); });
      if (c.shelf[oldName]) { delete c.shelf[oldName]; c.shelf[newName] = true; }
      return true;
  };
  /* ---- the scope index ---- */
  function pathKeys(p) { var out = [p]; try { var d = decodeURIComponent(p); if (d !== p) out.push(d); } catch (e) {} try { var en = encodeURI(p); if (en !== p) out.push(en); } catch (e) {} return out; }
  // Every campaign's item titles (first owner of an id wins) and every path each campaign uses
  function buildImgIndexFor(data) {
      var refs = {}, titles = {};
      var list = function(a) { return Array.isArray(a) ? a : []; };   // a key that holds no list (a planner's stray whiteboard, a file's) is skipped: the load runs this before anything reads the items
      var add = function(key, campId) { if (!key || typeof key !== 'string') return; pathKeys(key).forEach(function(k) { var a = refs[k] = refs[k] || []; if (a.indexOf(campId) < 0) a.push(campId); }); };
      Object.keys((data && data.campaigns) || {}).forEach(function(cid) {
          var camp = data.campaigns[cid]; if (!camp || typeof camp !== 'object') return;
          Object.keys(camp.items || {}).forEach(function(id) {
              var it = camp.items[id]; if (!it || typeof it !== 'object') return;
              if (!titles[id]) titles[id] = { title: (it.meta && it.meta.title) || id, campId: cid, camp: camp.name || cid };
              list(it.whiteboard).forEach(function(w) { if (w) { add(w.src, cid); add(w.texSrc, cid); if (w.frame && typeof w.frame === 'object') add(w.frame.src, cid); } });   // a token's kept original (the token creator) is the campaign's too
              list(it.rooms).forEach(function(r) { if (!r) return; add(r.image, cid); list(r.characters).forEach(function(ch) { if (ch) add(ch.portrait, cid); }); });
              list(it.blocks).forEach(function(b) { if (b) add(b.src, cid); });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (h) add(h.src, cid); });
          Object.values(camp.cast || {}).forEach(function(c) { if (c) add(c.src, cid); });
          Object.values(camp.chars && typeof camp.chars === 'object' ? camp.chars : {}).forEach(function(c) { if (c && typeof c === 'object') { add(c.portrait, cid); if (c.frame && typeof c.frame === 'object') add(c.frame.src, cid); } });   // characters' portraits and kept originals
          (Array.isArray(camp.pictures) ? camp.pictures : []).forEach(function(p) { add(p, cid); });
      });
      return { refs: refs, titles: titles };
  }
  function buildImgIndex() { _imgIndex = buildImgIndexFor(state.appState); return _imgIndex; }
  function folderOf(p) { return String(p || '').replace(/^\/saves\/images\//, '').split('/').slice(0, -1).join('/'); }
  // the campaigns a picture belongs to (folder owner first, then every campaign using it); 'shared' for the tutorial art; [] = Unfiled
  function imgCampsFor(idx, path, folder) {
      if (/^tutorial(\/|$)/.test(folder || '')) return 'shared';
      var out = [], t = idx.titles[folder];
      if (t) out.push(t.campId);
      (idx.refs[path] || []).forEach(function(cid) { if (out.indexOf(cid) < 0) out.push(cid); });
      return out;
  }
  function imgCamps(im) { if (!_imgIndex) buildImgIndex(); return imgCampsFor(_imgIndex, im.path, im.folder); }
  function inScope(im, scope, campId) {
      var c = imgCamps(im);
      if (scope === 'all') return true;
      if (scope === 'shared') return c === 'shared';
      if (scope === 'unfiled') return c !== 'shared' && c.length === 0;
      return c !== 'shared' && !!campId && c.indexOf(campId) >= 0;
  }
  function notJournal(i) { return !/^journal(\/|$)/.test(i.folder || ''); }
  // The pictures of one campaign, for other pickers (the handout picker): list = what /api/list-images answered
  window.wpImgScope = function(list, campId) { buildImgIndex(); return (list || []).filter(function(im) { return notJournal(im) && inScope(im, 'camp', campId); }); };
  function pickerScope() { return _imgLibPicker === 'shared' ? 'shared' : _imgLibPicker === 'unfiled' ? 'unfiled' : 'camp'; }
  function scopedCache() {   // what the current view (the scope, or the picker's source) holds
      var list = (_imgLibCache || []).filter(notJournal);
      if (_imgLibPicker) return list.filter(function(im) { return inScope(im, pickerScope(), _imgLibPicker); });
      var camp = getActiveCampaign();
      return list.filter(function(im) { return inScope(im, _imgLibScope, camp ? camp.id : null); });
  }
  function shelfApplies() { var sc = _imgLibPicker ? pickerScope() : _imgLibScope; return sc === 'camp' || sc === 'all'; }   // Shared and Unfiled show shelved pictures too (owner's rule)
  function folderLabel(folder) {
      if (!_imgIndex) buildImgIndex();
      var t = _imgIndex.titles[folder], camp = getActiveCampaign();
      if (t) return t.campId === (camp && camp.id) ? t.title : t.title + ' (' + t.camp + ')';
      if (folder === 'tutorial') return 'Tutorial art';
      if (!folder || folder === 'unknown' || folder === 'null') return 'no map';
      return folder;
  }
  /* ---- the one-time migration (io.js load repair calls it; a Replace import too): today's app-wide categories
     move whole into the campaign that owns or uses most of each category's pictures; Default and any category
     no campaign claims stay shared. Idempotent by the _picsV marker. Returns true when something moved. ---- */
  window.wpMigratePictures = function(data) {
      if (!data || typeof data !== 'object' || data._picsV >= 1) return false;
      data._picsV = 1;
      if (!data.imageCats || typeof data.imageCats !== 'object') return false;
      var shared = fixCats(data.imageCats), idx = buildImgIndexFor(data), moved = 0;
      var campsOf = {};
      Object.keys(shared.by).forEach(function(p) { campsOf[p] = imgCampsFor(idx, p, folderOf(p)); });
      shared.list.slice().forEach(function(name) {
          if (name === 'Default') return;   // the tutorial's shelf stays shared
          var votes = {};
          Object.keys(shared.by).forEach(function(p) { if (tagsIn(shared, p).indexOf(name) < 0) return; var cs = campsOf[p]; if (cs === 'shared') return; cs.forEach(function(c) { votes[c] = (votes[c] || 0) + 1; }); });
          var best = null; Object.keys(votes).forEach(function(c) { if (!best || votes[c] > votes[best]) best = c; });
          if (!best || !data.campaigns[best]) return;
          var dest = catStoreIn(data, best, true);
          if (dest.list.indexOf(name) < 0) dest.list.push(name);
          if (shared.shelf[name]) { dest.shelf[name] = true; delete shared.shelf[name]; }
          Object.keys(shared.by).forEach(function(p) {
              var arr = tagsIn(shared, p); if (arr.indexOf(name) < 0) return;
              var d = Array.isArray(dest.by[p]) ? dest.by[p] : (dest.by[p] ? [dest.by[p]] : []); if (d.indexOf(name) < 0) d.push(name); dest.by[p] = d;
              var rest = arr.filter(function(n) { return n !== name; }); if (rest.length) shared.by[p] = rest; else delete shared.by[p];
          });
          shared.list = shared.list.filter(function(n) { return n !== name; });
          moved++;
      });
      return moved > 0;
  };
  // A campaign is going (delete, discard, cleanup removal): its categories and tags move to the shared store so
  // the pictures, now Unfiled, keep their tags. A name the shared store already has takes the tags.
  window.wpReleaseCampaignTags = function(camp, data) {
      data = data || state.appState;
      if (!camp || !camp.imageCats || typeof camp.imageCats !== 'object') return false;
      var src = fixCats(camp.imageCats), dst = catStoreIn(data, 'shared', true), any = false;
      src.list.forEach(function(name) { if (dst.list.indexOf(name) < 0) dst.list.push(name); if (src.shelf[name]) dst.shelf[name] = true; });
      Object.keys(src.by).forEach(function(p) { var a = tagsIn(src, p); if (!a.length) return; var d = Array.isArray(dst.by[p]) ? dst.by[p] : (dst.by[p] ? [dst.by[p]] : []); a.forEach(function(n) { if (d.indexOf(n) < 0) d.push(n); }); dst.by[p] = d; any = true; });
      delete camp.imageCats;
      return any;
  };
  // A campaign came back from a safety copy taken before categories moved into campaigns: the copy's
  // app-level tags for pictures this campaign owns or uses become its own (the copy is never changed)
  window.wpAdoptTags = function(camp, sourceCats, data) {
      data = data || state.appState;
      if (!camp || !sourceCats || typeof sourceCats !== 'object' || !data.campaigns || !data.campaigns[camp.id]) return false;
      var src = fixCats(JSON.parse(JSON.stringify(sourceCats))), idx = buildImgIndexFor(data), any = false;
      Object.keys(src.by).forEach(function(p) {
          var cs = imgCampsFor(idx, p, folderOf(p)); if (cs === 'shared' || cs.indexOf(camp.id) < 0) return;
          var names = tagsIn(src, p).filter(function(n) { return n !== 'Default'; }); if (!names.length) return;
          var dest = catStoreIn(data, camp.id, true);
          names.forEach(function(n) { if (dest.list.indexOf(n) < 0) { dest.list.push(n); if (src.shelf[n]) dest.shelf[n] = true; } });
          var d = Array.isArray(dest.by[p]) ? dest.by[p] : []; names.forEach(function(n) { if (d.indexOf(n) < 0) d.push(n); }); dest.by[p] = d; any = true;
      });
      return any;
  };
  // Where a picture is used: play-map items, room scenes, portraits, handouts, page and planner pictures, the
  // cast, and campaigns that brought it in — across every campaign, encoded and plain spellings alike
  // [sinkcheck:catfiles-start]
  // Which of a category's pictures may lose their FILE with it (owner's rule, 2026-09-25): only the category's own. A picture another
  // campaign owns (its folder) or uses keeps its file and only loses the tag, so a category brought in by a file someone else made
  // can never take your other campaigns' pictures with it. store: the category's home ('shared' or a campaign id); owners(path) is
  // imgCampsFor: 'shared' for the tutorial art, else the campaigns that own or use the picture ([] = nobody's).
  function catFilesToDelete(paths, store, owners) {
      var go = [], kept = [];
      paths.forEach(function(p) {
          var c = owners(p);
          var mine = c === 'shared' ? store === 'shared' : Array.isArray(c) && c.every(function(id) { return id === store; });
          (mine ? go : kept).push(p);
      });
      return { go: go, kept: kept };
  }
  // A category's member whose FILE may be offered for deletion with it: a picture the Image Library itself lists — under saves/images,
  // by its extension, in a folder of its own — and never a file of the Journal's, a sound or a video another panel owns, or a path that
  // walks. A category's keys come from a campaign file, and whatever nobody "owns" (catFilesToDelete) would otherwise go.
  function catMemberFile(p) {
      if (typeof p !== 'string' || p.indexOf('/saves/images/') !== 0 || /[\\?#\x00-\x1f]/.test(p)) return false;
      var segs = p.slice(14).split('/');
      if (segs.length < 2 || segs.some(function(s) { return !s || /^[. ]+$/.test(s); })) return false;
      return !/^journal[. ]*$/i.test(segs[0]) && /\.(png|jpe?g|gif|webp|svg)$/i.test(p);
  }
  // [sinkcheck:catfiles-end]
  function imgUsage(src) {
      var n = 0, maps = {}, keys = pathKeys(src);
      var hit = function(v) { return !!v && keys.indexOf(v) >= 0; };
      Object.values(state.appState.campaigns || {}).forEach(function(camp) {
          Object.values(camp.items || {}).forEach(function(it) {
              var name = (it.meta && it.meta.title) || it.id;
              (it.whiteboard || []).forEach(function(w) { if (w && (hit(w.src) || hit(w.texSrc) || (w.frame && typeof w.frame === 'object' && hit(w.frame.src)))) { n++; maps[name] = 1; } });
              (it.rooms || []).forEach(function(r) { if (hit(r.image)) { n++; maps[name] = 1; } (r.characters || []).forEach(function(ch) { if (hit(ch.portrait)) { n++; maps[name] = 1; } }); });
              (it.blocks || []).forEach(function(b) { if (b && hit(b.src)) { n++; maps[name] = 1; } });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (hit(h.src)) { n++; maps['handouts'] = 1; } });
          Object.values(camp.cast || {}).forEach(function(c) { if (hit(c.src)) { n++; maps['the cast of ' + (camp.name || 'a campaign')] = 1; } });
          Object.values(camp.chars && typeof camp.chars === 'object' ? camp.chars : {}).forEach(function(c) { if (c && typeof c === 'object' && (hit(c.portrait) || (c.frame && typeof c.frame === 'object' && hit(c.frame.src)))) { n++; maps['the characters of ' + (camp.name || 'a campaign')] = 1; } });
          if ((Array.isArray(camp.pictures) ? camp.pictures : []).some(hit)) { n++; maps['brought into ' + (camp.name || 'a campaign')] = 1; }
      });
      return { count: n, maps: Object.keys(maps) };
  }
  function scopeChip(val, label, n, title) { return '<button class="journal-from' + (_imgLibScope === val ? ' active' : '') + '" data-scope="' + val + '" title="' + esc(title) + '">' + label + ' <span class="journal-count">' + n + '</span></button>'; }
  function renderImgCats() {
      var row = document.getElementById('imgLibCats'); if (!row) return;
      var camp = getActiveCampaign(), campId = camp ? camp.id : null;
      if (_imgLibCatCamp !== campId) { _imgLibCat = ''; _imgLibCatCamp = campId; }
      var list = scopedCache(), counts = {}, none = 0, shelf = shelfApplies();
      list.forEach(function(im) { var ns = imgCatsOf(im.path); if (ns.length) ns.forEach(function(n) { counts[n] = (counts[n] || 0) + 1; }); else none++; });
      var cats = catList();
      if (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap' && !cats.some(function(c) { return c.name === _imgLibCat; })) _imgLibCat = '';
      var allN = list.filter(function(im) { return !shelf || !imgCatsOf(im.path).some(isShelved); }).length;
      var html = '';
      if (!_imgLibPicker) {   // the scope row: which pictures
          var all = (_imgLibCache || []).filter(notJournal), nCamp = 0, nShared = 0, nUnf = 0;
          all.forEach(function(im) { if (inScope(im, 'camp', campId)) nCamp++; if (inScope(im, 'shared')) nShared++; if (inScope(im, 'unfiled')) nUnf++; });
          html += '<span class="journal-chip-label">Pictures</span>'
              + scopeChip('camp', camp ? esc(camp.name) : 'This campaign', nCamp, 'Pictures uploaded from this campaign\'s maps, planners and pages, used by them, or brought in')
              + scopeChip('shared', 'Shared', nShared, 'Pictures every campaign can use: the tutorial art')
              + scopeChip('unfiled', 'Unfiled', nUnf, 'Pictures whose map, planner or page is gone and that no campaign uses')
              + scopeChip('all', 'All campaigns', all.length, 'Every picture in your saves folder')
              + '<button class="journal-from img-lib-import" data-act="picker" title="Pick pictures from another campaign, Shared or Unfiled and bring them into this one">Import from another campaign\u2026</button>'
              + '<span class="img-scope-break"></span>';
      }
      html += '<span class="journal-chip-label">Show</span>'
          + '<button class="journal-from' + (!_imgLibCat ? ' active' : '') + '" data-cat="">All <span class="journal-count">' + allN + '</span></button>'
          + '<button class="journal-from' + (_imgLibCat === '__bymap' ? ' active' : '') + '" data-cat="__bymap" title="Grouped under the map, planner or page each picture was uploaded from">By map</button>'
          + cats.map(function(c) { return '<button class="journal-from' + (_imgLibCat === c.name ? ' active' : '') + (c.store === 'shared' ? ' img-cat-shared' : '') + '" data-cat="' + esc(c.name) + '" title="' + (c.store === 'shared' ? 'A shared category: every campaign sees it' : 'This campaign\'s category') + '">' + esc(c.name) + (c.store === 'shared' ? '<span class="img-cat-mark" aria-hidden="true">\u25C7</span>' : '') + ' <span class="journal-count">' + (counts[c.name] || 0) + '</span></button>'; }).join('')
          + '<button class="journal-from' + (_imgLibCat === '__none' ? ' active' : '') + '" data-cat="__none">No category <span class="journal-count">' + none + '</span></button>'
          + (_imgLibPicker ? '' : '<button class="journal-from img-cat-new" data-act="new" title="Make a category for this campaign">+ New</button><button class="journal-from img-cat-new" data-act="new-shared" title="Make a category every campaign sees">+ New shared</button>');
      if (!_imgLibPicker && _imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') {
          var home = catHome(_imgLibCat), c = home ? catStore(home) : EMPTY_CATS;
          html += '<div class="img-cat-tools"><button class="journal-from img-cat-tool" data-act="shelf" title="Own shelf: its pictures show under this chip only, not under All">' + (c.shelf[_imgLibCat] ? 'Own shelf: on' : 'Own shelf: off') + '</button>'
              + '<button class="journal-from img-cat-tool" data-act="share" title="' + (home === 'shared' ? 'Make it this campaign\'s own: only this campaign sees it' : 'Make it shared: every campaign sees it') + '">' + (home === 'shared' ? 'Shared \u2192 this campaign\'s' : 'Make shared') + '</button>'
              + '<button class="journal-from img-cat-tool" data-act="rename" title="Rename this category">Rename</button>'
              + '<button class="journal-from img-cat-tool danger" data-act="delete" title="Delete this category (the pictures stay)">Delete category</button></div>';
      }
      row.innerHTML = html;
  }
  // act: 'add' (tag with another), 'move' (drop the current view's category, tag with the chosen one), 'remove'
  function imgCatApply(path, act, name) {
      var cur = imgCatsOf(path), from = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      if (act === 'remove') cur = cur.filter(function(n) { return n !== name; });
      else {
          if (act === 'move' && from) cur = cur.filter(function(n) { return n !== from; });
          if (name && cur.indexOf(name) < 0) cur.push(name);
      }
      imgCatWrite(path, cur);
  }
  function imgCatChange(path, act, name) {   // one path, or the picked set as an array
      var many = Array.isArray(path);
      (many ? path : [path]).forEach(function(p) { imgCatApply(p, act, name); });
      imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      if (many) { toast(path.length + ' picture' + (path.length === 1 ? '' : 's') + (act === 'remove' ? ' taken out of ' : act === 'move' ? ' moved to ' : ' added to ') + '"' + name + '".'); return; }
      var pv = document.getElementById('imgLibPreview');
      if (pv && pv.style.display !== 'none' && pv.dataset.src === path) openImgPreview(path);
  }
  function imgCatAssign(path, name) { imgCatChange(path, 'add', name); }   // kept for older callers
  // A new category in this campaign's store (or the shared one); a name either store already has is refused
  function imgCatNew(cb, shared) {
      showPrompt(shared ? 'New shared category (every campaign sees it):' : 'New category:', '', function(name) {
          name = String(name || '').trim().slice(0, 40); if (!name) return;
          var home = catHome(name);
          if (home) { toast('"' + name + '" already exists' + (home === 'shared' ? ' as a shared category.' : ' in this campaign.')); return; }
          var c = catStore(shared ? 'shared' : (viewCampId() || 'shared'), true);
          c.list.push(name);
          imgCatsSave(); if (cb) cb(name); else renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  // The category menu for one picture. Inside a category view it offers Move (out of this one, into
  // another) and Remove; everywhere it offers Add (a picture can be in several categories).
  function openImgCatMenu(src, x, y) {   // src: one path, or an array (the picked set)
      var menu = document.getElementById('imgCatMenu'); if (!menu) return;
      var many = Array.isArray(src), mine = many ? [] : imgCatsOf(src);
      var from = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      var others = catList().filter(function(c) { return mine.indexOf(c.name) < 0; });
      var opt = function(act) { return others.map(function(c) { return '<button class="wb-tool-btn party-menu-item" data-act="' + act + '" data-cat="' + esc(c.name) + '">' + esc(c.name) + (c.store === 'shared' ? ' \u25C7' : '') + '</button>'; }).join(''); };
      var html = '<div class="party-menu-head">' + (many ? 'Add ' + src.length + ' pictures to' : 'Add to category') + '</div>'
          + opt('add')
          + '<button class="wb-tool-btn party-menu-item" data-act="new-add">+ New category\u2026</button>';
      if (from && (many || mine.indexOf(from) >= 0)) {
          html += '<div class="party-menu-head">Move from ' + esc(from) + ' to</div>'
              + opt('move')
              + '<button class="wb-tool-btn party-menu-item" data-act="new-move">+ New category\u2026</button>'
              + '<button class="wb-tool-btn party-menu-item danger" data-act="remove" data-cat="' + esc(from) + '">Remove from ' + esc(from) + '</button>';
      }   // in All, By map and No category only Add is offered
      menu.dataset.src = many ? '' : src; menu.dataset.multi = many ? '1' : '';
      menu.innerHTML = html;
      menu.style.display = 'flex'; menu.classList.add('show');
      window.wpClampMenu(menu, x, y);
  }
  function hideImgCatMenu() { var m = document.getElementById('imgCatMenu'); if (m) m.classList.remove('show'), m.style.display = 'none'; }
  /* ---- the picker: Import from another campaign… ---- */
  function renderImgSource() {
      var wrap = document.getElementById('imgLibSourceWrap'), sel = document.getElementById('imgLibSource'); if (!wrap || !sel) return;
      if (!_imgLibPicker) { wrap.style.display = 'none'; return; }
      var s = state.appState, me = getActiveCampaign(), all = (_imgLibCache || []).filter(notJournal), opts = [];
      Object.keys((s && s.campaigns) || {}).forEach(function(cid) {
          if (me && cid === me.id) return;
          var n = all.filter(function(im) { return inScope(im, 'camp', cid); }).length;
          opts.push('<option value="' + esc(cid) + '"' + (_imgLibPicker === cid ? ' selected' : '') + '>' + esc(s.campaigns[cid].name || cid) + ' (' + n + ')</option>');
      });
      opts.push('<option value="shared"' + (_imgLibPicker === 'shared' ? ' selected' : '') + '>Shared (' + all.filter(function(im) { return inScope(im, 'shared'); }).length + ')</option>');
      opts.push('<option value="unfiled"' + (_imgLibPicker === 'unfiled' ? ' selected' : '') + '>Unfiled (' + all.filter(function(im) { return inScope(im, 'unfiled'); }).length + ')</option>');
      sel.innerHTML = opts.join('');
      wrap.style.display = 'inline-flex';
  }
  function enterPicker() {
      if (_imgLibPicker) return;
      var s = state.appState, me = getActiveCampaign();
      if (!me) return;
      var first = Object.keys((s && s.campaigns) || {}).filter(function(cid) { return cid !== me.id; })[0] || 'shared';
      var grid = document.getElementById('imgLibGrid'), search = document.getElementById('imgLibSearch');
      _imgLibStash = { scope: _imgLibScope, cat: _imgLibCat, search: search ? search.value : '', sel: _imgLibSel, last: _imgLibLastPick, scroll: grid ? grid.scrollTop : 0 };
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibCat = '';
      if (search) search.value = '';
      closeImgPreview();
      _imgLibPicker = first;
      renderImgLib('');
  }
  function exitPicker(keepSel) {
      if (!_imgLibPicker) return;
      var st = _imgLibStash || {}; _imgLibPicker = null; _imgLibStash = null;
      _imgLibScope = st.scope || 'camp'; _imgLibCat = st.cat || ''; _imgLibSel = keepSel ? {} : (st.sel || {}); _imgLibLastPick = st.last || null;
      var search = document.getElementById('imgLibSearch'); if (search) search.value = st.search || '';
      closeImgPreview();
      renderImgLib(search ? search.value : '');
      var grid = document.getElementById('imgLibGrid'); if (grid) grid.scrollTop = st.scroll || 0;
  }
  // The picked pictures become this campaign's by reference (camp.pictures): no file is copied
  function bringPictures(paths) {
      var camp = getActiveCampaign(); if (!camp || !paths.length) return;
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      camp.pictures = Array.isArray(camp.pictures) ? camp.pictures : [];
      var n = 0; paths.forEach(function(p) { if (camp.pictures.indexOf(p) < 0) { camp.pictures.push(p); n++; } });
      _imgIndex = null;
      exitPicker(true);
      imgCatsSave();
      toast(n + ' picture' + (n === 1 ? '' : 's') + ' brought into ' + (camp.name || 'this campaign') + '. Tag ' + (n === 1 ? 'it' : 'them') + ' here as you like.');
  }
  (function wireImgCats() {
      var row = document.getElementById('imgLibCats'), grid = document.getElementById('imgLibGrid'), menu = document.getElementById('imgCatMenu');
      if (!row || !grid || !menu) return;
      var srcSel = document.getElementById('imgLibSource');
      if (srcSel) srcSel.addEventListener('change', function() { if (!_imgLibPicker) return; _imgLibPicker = this.value; _imgLibSel = {}; _imgLibLastPick = null; _imgLibCat = ''; closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value); });
      row.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var act = b.dataset.act;
          if (act === 'picker') { if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; } enterPicker(); return; }
          if (b.dataset.scope !== undefined) { _imgLibScope = b.dataset.scope; _imgLibSel = {}; _imgLibLastPick = null; renderImgLib(document.getElementById('imgLibSearch').value); return; }
          if (act === 'new' || act === 'new-shared') { imgCatNew(function(name) { _imgLibCat = name; renderImgLib(document.getElementById('imgLibSearch').value); }, act === 'new-shared'); return; }
          if (act === 'shelf') {
              var home = catHome(_imgLibCat); if (!home) return;
              var cs = catStore(home, true); if (cs.shelf[_imgLibCat]) delete cs.shelf[_imgLibCat]; else cs.shelf[_imgLibCat] = true;
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast(cs.shelf[_imgLibCat] ? '"' + _imgLibCat + '" is on its own shelf: its pictures no longer appear under All.' : '"' + _imgLibCat + '" shows under All again.');
              return;
          }
          if (act === 'share') {   // move a category with its tags between the campaign's store and the shared one
              var name = _imgLibCat, from = catHome(name), me = viewCampId(); if (!from || !me) return;
              var to = from === 'shared' ? me : 'shared';
              if (catStore(to).list.indexOf(name) >= 0) { toast('"' + name + '" already exists ' + (to === 'shared' ? 'as a shared category.' : 'in this campaign.')); return; }
              var a = catStore(from, true), z = catStore(to, true);
              z.list.push(name); if (a.shelf[name]) { z.shelf[name] = true; delete a.shelf[name]; }
              Object.keys(a.by).forEach(function(p) { var arr = tagsIn(a, p); if (arr.indexOf(name) < 0) return; var d = Array.isArray(z.by[p]) ? z.by[p] : []; if (d.indexOf(name) < 0) d.push(name); z.by[p] = d; var rest = arr.filter(function(n) { return n !== name; }); if (rest.length) a.by[p] = rest; else delete a.by[p]; });
              a.list = a.list.filter(function(n) { return n !== name; });
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast(to === 'shared' ? '"' + name + '" is shared now: every campaign sees it.' : '"' + name + '" is this campaign\'s own now.');
              return;
          }
          if (act === 'rename') {
              var old = _imgLibCat, homeR = catHome(old); if (!homeR) return;
              var c = catStore(homeR, true);
              showPrompt('Rename category:', old, function(name) {
                  name = String(name || '').trim().slice(0, 40); if (!name || name === old) return;
                  if (catHome(name)) { toast('"' + name + '" already exists.'); return; }
                  var i = c.list.indexOf(old); if (i >= 0) c.list[i] = name;
                  Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === old ? name : n; }); });
                  if (c.shelf[old]) { delete c.shelf[old]; c.shelf[name] = true; }
                  _imgLibCat = name; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              });
              return;
          }
          if (act === 'delete') {
              var del = _imgLibCat, homeD = catHome(del); if (!homeD) return;
              var cc = catStore(homeD, true), n = Object.keys(cc.by).filter(function(p) { return tagsIn(cc, p).indexOf(del) >= 0; }).length;
              showConfirm('Delete the category "' + del + '"? ' + (n ? n + ' picture' + (n === 1 ? ' loses' : 's lose') + ' that tag — nothing is deleted.' : 'It is empty.'), function(yes) {
                  if (!yes) return;
                  var members = Object.keys(cc.by).filter(function(p) { return tagsIn(cc, p).indexOf(del) >= 0 && catMemberFile(p); });
                  cc.list = cc.list.filter(function(x) { return x !== del; }); delete cc.shelf[del];
                  Object.keys(cc.by).forEach(function(p) { var rest = tagsIn(cc, p); if (rest.length) cc.by[p] = rest; else delete cc.by[p]; });
                  _imgLibCat = ''; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                  // Offer to remove the pictures' files as well (the category itself is only a tag) — the category's OWN pictures only:
                  // one another campaign owns or uses keeps its file and just loses the tag (catFilesToDelete)
                  if (members.length) {
                      var idxD = buildImgIndex(), split = catFilesToDelete(members, homeD, function(p) { return imgCampsFor(idxD, p, folderOf(p)); });
                      var files = split.go, keptN = split.kept.length;
                      var keptNote = keptN ? keptN + ' of its pictures ' + (keptN === 1 ? 'keeps its file — it belongs to another campaign or to Shared — and only loses' : 'keep their files — they belong to another campaign or to Shared — and only lose') + ' the tag.' : '';
                      if (!files.length) { toast(keptNote); return; }
                      var used = files.filter(function(p) { return imgUsage(p).count > 0; }).length;
                      showConfirm('Also delete the ' + files.length + ' picture file' + (files.length === 1 ? ' that was' : 's that were') + ' in "' + del + '" from your saves folder? This cannot be undone.' + (used ? '\n\n' + used + ' of them ' + (used === 1 ? 'is' : 'are') + ' still used somewhere (a map, a handout, a page, the cast, or brought into a campaign) and would show as broken there.' : '') + (keptNote ? '\n\n' + keptNote : ''), function(yesFiles) {
                          if (!yesFiles) return;
                          var i = 0, gone = [], oldCore = false;
                          function next() {
                              if (i >= files.length) {
                                  var goneSet = {}; gone.forEach(function(p) { goneSet[p] = 1; });
                                  _imgLibCache = (_imgLibCache || []).filter(function(im) { return !goneSet[im.path]; });
                                  gone.forEach(function(p) { catStores().forEach(function(s) { if (s.c.by[p]) delete s.c.by[p]; }); }); imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                                  toast(oldCore ? 'Deleting pictures needs the 1.4.6 core \u2014 run the installer from Settings \u2192 Updates & about.' : 'Deleted ' + gone.length + ' picture file' + (gone.length === 1 ? '' : 's') + '.' + (keptN ? ' ' + keptNote : ''));
                                  return;
                              }
                              var batch = files.slice(i, i + 4); i += 4;
                              Promise.all(batch.map(function(src) { return fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) { if (r.status === 404 && !r.headers.get('content-type')) oldCore = true; else if (r.ok) gone.push(src); }).catch(function() {}); })).then(next);
                          }
                          next();
                      });
                  }
              });
              return;
          }
          if (b.dataset.cat !== undefined) { _imgLibCat = b.dataset.cat; renderImgLib(document.getElementById('imgLibSearch').value); }
      });
      // right-click a picture: add it to a category (and, inside a category, move it or take it out)
      grid.addEventListener('contextmenu', function(e) {
          var cell = e.target.closest && e.target.closest('.img-lib-cell'); if (!cell || cell.classList.contains('cast-cell') || _imgLibPicker) return;
          e.preventDefault(); e.stopPropagation();
          openImgCatMenu(cell.dataset.src, e.clientX, e.clientY);
      });
      menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          e.stopPropagation();
          var src = menu.dataset.multi ? Object.keys(_imgLibSel) : menu.dataset.src, act = b.dataset.act, cat = b.dataset.cat || ''; hideImgCatMenu();
          if (menu.dataset.multi && !src.length) return;
          if (act === 'new-add' || act === 'new-move') { imgCatNew(function(name) { imgCatChange(src, act === 'new-move' ? 'move' : 'add', name); }); return; }
          if (act === 'add' || act === 'move' || act === 'remove') imgCatChange(src, act, cat);
      });
      document.addEventListener('pointerdown', function(e) { if (menu.style.display !== 'none' && !e.target.closest('#imgCatMenu')) hideImgCatMenu(); }, true);
      var copiesBox = document.getElementById('imgLibCopies');
      if (copiesBox) {
          copiesBox.addEventListener('input', function() { if (copiesBox.value >= 1 && copiesBox.value <= 50) setCastBatch(copiesBox.value); });
          copiesBox.addEventListener('change', function() { copiesBox.value = setCastBatch(copiesBox.value); });
      }
      var selBar = document.getElementById('imgLibSelBar');
      if (selBar) selBar.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var picked = Object.keys(_imgLibSel);
          if (b.dataset.act === 'clear') { _imgLibSel = {}; _castSel = {}; _castLastPick = null; renderImgLib(document.getElementById('imgLibSearch').value); }
          else if (b.dataset.act === 'back') exitPicker(false);
          else if (b.dataset.act === 'bring') bringPictures(picked);
          else if (b.dataset.act === 'add-map') placeImagesBlock(picked);
          else if (b.dataset.act === 'cat') { var r = b.getBoundingClientRect(); openImgCatMenu(picked, r.left, r.top - 4); }
          else if (b.dataset.act === 'add-cast') placeCastPicked();
      });
      document.addEventListener('keydown', function(e) {   // Ctrl+A in the library picks everything in view
          var modal = document.getElementById('imgLibModal'), pv = document.getElementById('imgLibPreview');
          if (!modal || modal.style.display === 'none' || (pv && pv.style.display !== 'none') || (_imgLibPick && !_imgLibPicker)) return;
          if (!(e.ctrlKey || e.metaKey) || (e.key !== 'a' && e.key !== 'A') || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
          e.preventDefault(); e.stopPropagation();
          _imgLibOrder.forEach(function(p) { _imgLibSel[p] = 1; });
          renderImgLib(document.getElementById('imgLibSearch').value);
      }, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && (!window.wpEsc || window.wpEsc.free(e))) hideImgCatMenu(); });   // 1.5.4: esckey.js puts it away, one thing a press
  })();

  function renderImgLib(filter) {
      var grid = document.getElementById('imgLibGrid');
      if (!grid || !_imgLibCache) return;
      if (!_imgIndex) buildImgIndex();
      // players' journals live under images/journal/ — not campaign art, keep them out of the library
      _imgLibCache = _imgLibCache.filter(notJournal);
      // The Campaign Cast shows inside a shelf category (the tutorial's "Default") and nowhere else — and only under THIS campaign's own scope, never the Shared/Unfiled/All-campaigns views (the cast is a per-campaign store with no picture category/scope tags, so a scope chip can't filter it).
      grid.dataset.cast = (!_imgLibPick && !_imgLibPicker && state.viewMode === 'visual' && _imgLibScope === 'camp' && !!(_imgLibCat && isShelved(_imgLibCat))) ? '1' : '';
      if (!grid.dataset.cast) { _castSel = {}; _castLastPick = null; }   // cast roster hidden: drop any cast picks so a stale count can't linger
      var q = (filter || '').toLowerCase();
      renderImgCats(); renderImgSource();
      var shelf = shelfApplies(), byMap = _imgLibCat === '__bymap';
      var byFolder = {};
      scopedCache().forEach(function(im) {
          var label = folderLabel(im.folder), cat = imgCatOf(im.path);
          if (_imgLibCat === '__none' ? cat : (_imgLibCat && !byMap && !imgCatHas(im.path, _imgLibCat))) return;
          if ((!_imgLibCat || byMap) && shelf && imgCatsOf(im.path).some(isShelved)) return;   // shelved pictures show under their own category only
          if (q && im.name.toLowerCase().indexOf(q) === -1 && label.toLowerCase().indexOf(q) === -1 && (cat || '').toLowerCase().indexOf(q) === -1) return;
          var key = byMap ? label : '';
          (byFolder[key] = byFolder[key] || []).push(im);
      });
      var html = ''; _imgLibOrder = [];
      var pickable = !_imgLibPick || _imgLibPicker;
      Object.keys(byFolder).sort().forEach(function(label) {
          if (label) html += '<div style="color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin:12px 0 6px;">' + esc(label) + ' <span style="color:var(--dim);">(' + byFolder[label].length + ')</span></div>';
          html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">';
          byFolder[label].forEach(function(im) {
              var catTag = (!_imgLibCat || _imgLibCat === '__bymap') && imgCatOf(im.path) ? '<span class="img-lib-tag">' + esc(imgCatOf(im.path)) + '</span>' : '';
              _imgLibOrder.push(im.path);
              html += '<div class="img-lib-cell' + (_imgLibSel[im.path] ? ' picked' : '') + '" data-src="' + esc(im.path) + '" title="' + esc(im.name) + (imgCatOf(im.path) ? ' \u00b7 ' + esc(imgCatOf(im.path)) : '') + (_imgLibPicker ? ' \u2014 Ctrl-click to pick it to bring in' : ' \u2014 right-click to add it to a category; Ctrl-click to pick several') + '">' +
                  '<img src="' + encodeURI(im.path) + '" loading="lazy">' + catTag +
                  '<div class="img-lib-name">' + esc(im.name) + '</div>' + (pickable && !_imgLibPicker ? '<button class="tool ghost img-cell-batch" data-src="' + esc(im.path) + '" title="Drop ' + castBatch() + ' cop' + (castBatch() === 1 ? 'y' : 'ies') + ' at the centre of your view">\u00d7' + castBatch() + '</button>' : '') + '</div>';
          });
          html += '</div>';
      });
      var empty = _imgLibPicker ? 'Nothing here to bring in.'
          : _imgLibCat && _imgLibCat !== '__bymap' ? 'Nothing in this category yet \u2014 right-click a picture to add it.'
          : _imgLibScope === 'camp' ? 'Nothing in this campaign yet \u2014 other campaigns\u2019 pictures are under All campaigns, or Import from another campaign\u2026'
          : _imgLibScope === 'shared' ? 'No shared pictures yet \u2014 the Tutorial\u2019s art lands here once it has run.'
          : _imgLibScope === 'unfiled' ? 'Nothing unfiled: every picture belongs to a campaign.'
          : 'No images match.';
      grid.innerHTML = (grid.dataset.cast ? castLibraryHtml(filter) : '') + html || '<div style="color:var(--dim); padding:20px; text-align:center;">' + empty + '</div>';
      renderImgSelBar();
  }
  // Multi-pick: Ctrl-click toggles a picture, Shift-click picks the run from the last one, Ctrl+A picks the view
  var _imgLibSel = {}, _imgLibOrder = [], _imgLibLastPick = null;
  // Campaign Cast picks live in their own bucket (cast = tokens, not images). Selecting one type clears the other, so the single selection bar always shows a single type.
  var _castSel = {}, _castOrder = [], _castLastPick = null;
  function renderImgSelBar() {
      var bar = document.getElementById('imgLibSelBar'); if (!bar) return;
      var n = Object.keys(_imgLibSel).length;
      if (_imgLibPicker === 'shared') {   // shared pictures are already every campaign's: nothing to bring
          bar.innerHTML = '<span style="color:var(--dim);">Shared pictures are available in every campaign already — find them under the Shared chip.</span><button class="tool ghost" data-act="back">← Back</button>';
          bar.style.display = 'flex'; return;
      }
      if (_imgLibPicker) {   // bringing pictures in from another campaign or Unfiled
          var meC = getActiveCampaign();
          bar.innerHTML = '<span style="color:var(--gold);">' + (n ? n + ' picked' : 'Pick pictures to bring in') + '</span>'
              + (n ? '<button class="tool" data-act="bring">Bring ' + n + ' into ' + esc((meC && meC.name) || 'this campaign') + '</button><button class="tool ghost" data-act="clear">Clear</button>' : '')
              + '<button class="tool ghost" data-act="back">\u2190 Back</button>'
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run, Ctrl+A everything shown \u2014 nothing is copied, this campaign remembers them</span>';
          bar.style.display = 'flex'; return;
      }
      var nCast = Object.keys(_castSel).length;
      if (nCast && !_imgLibPick) {   // cast picks own the bar (they clear the picture selection, so only one type is ever non-empty)
          var canC = state.viewMode === 'visual' && getActiveMap() && getActiveMap().type === 'map';
          bar.innerHTML = '<span style="color:var(--gold);">★ ' + nCast + ' cast picked</span>'
              + '<button class="tool" data-act="add-cast"' + (canC ? '' : ' disabled title="Open a play map first"') + '>Add ' + nCast + ' to map</button>'
              + '<button class="tool ghost" data-act="clear">Clear</button>'
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run</span>';
          bar.style.display = 'flex'; return;
      }
      if (!n || _imgLibPick) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
      var canPlace = state.viewMode === 'visual' && getActiveMap() && getActiveMap().type === 'map';
      bar.innerHTML = '<span style="color:var(--gold);">' + n + ' picked</span>'
          + '<button class="tool" data-act="add-map" title="Lay them out in a block at the centre of your view"' + (canPlace ? '' : ' disabled title="Open a play map first"') + '>Add ' + n + ' to map</button>'
          + '<button class="tool ghost" data-act="cat">Add to category\u2026</button>'
          + '<button class="tool ghost" data-act="clear">Clear</button>'
          + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run, Ctrl+A everything shown</span>';
      bar.style.display = 'flex';
  }
  function castCells() { var g = document.getElementById('imgLibGrid'); return g ? Array.prototype.slice.call(g.querySelectorAll('.cast-cell[data-cid]')) : []; }
  function castSelSync() { castCells().forEach(function(c) { c.classList.toggle('picked', !!_castSel[c.dataset.cid]); }); }
  function castSelToggle(cell, e) {
      var id = cell.dataset.cid; if (!id) return;
      _imgLibSel = {}; _imgLibLastPick = null;   // picking cast clears the picture selection (one type at a time)
      Array.prototype.forEach.call(document.querySelectorAll('#imgLibGrid .img-lib-cell[data-src]'), function(c) { c.classList.remove('picked'); });
      if (e.shiftKey && _castLastPick && _castOrder.indexOf(_castLastPick) >= 0 && _castOrder.indexOf(id) >= 0) {
          var a = _castOrder.indexOf(_castLastPick), b = _castOrder.indexOf(id);
          _castOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function(q) { _castSel[q] = 1; });
      } else if (_castSel[id]) delete _castSel[id]; else _castSel[id] = 1;
      _castLastPick = id;
      castSelSync();
      renderImgSelBar();
  }
  function placeCastPicked() {
      var ids = Object.keys(_castSel); if (!ids.length || !castOnMap()) return;
      var ctr = viewCentre();
      ids.forEach(function(id, i) { castPlace(id, ctr.x + (i % 4) * 74, ctr.y + Math.floor(i / 4) * 66, 1); });
      _castSel = {}; _castLastPick = null;
      closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none';
  }
  function imgSelToggle(cell, e) {
      var p = cell.dataset.src; if (!p) return;
      _castSel = {}; _castLastPick = null; castSelSync();   // picking a picture clears the cast selection (one type at a time)
      if (e.shiftKey && _imgLibLastPick && _imgLibOrder.indexOf(_imgLibLastPick) >= 0 && _imgLibOrder.indexOf(p) >= 0) {
          var a = _imgLibOrder.indexOf(_imgLibLastPick), b = _imgLibOrder.indexOf(p);
          _imgLibOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function(q) { _imgLibSel[q] = 1; });
      } else if (_imgLibSel[p]) delete _imgLibSel[p]; else _imgLibSel[p] = 1;
      _imgLibLastPick = p;
      var grid = document.getElementById('imgLibGrid');
      Array.prototype.forEach.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(c) { c.classList.toggle('picked', !!_imgLibSel[c.dataset.src]); });
      renderImgSelBar();
  }
  // Lay the picked pictures out in a block around the centre of the view, then select the lot
  function placeImagesBlock(paths) {
      var am = getActiveMap();
      if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
      if (!paths.length) return;
      var s = paths.length <= 2 ? 300 : 200, gap = 12, cols = Math.ceil(Math.sqrt(paths.length)), rows = Math.ceil(paths.length / cols);
      var ctr = viewCentre(), x0 = ctr.x - (cols * s + (cols - 1) * gap) / 2, y0 = ctr.y - (rows * s + (rows - 1) * gap) / 2;
      am.whiteboard = am.whiteboard || [];
      var ids = [];
      paths.forEach(function(src, i) {
          var it = Object.assign({ id: 'wb' + uid(), type: 'image', x: Math.max(10, Math.round(x0 + (i % cols) * (s + gap))), y: Math.max(10, Math.round(y0 + Math.floor(i / cols) * (s + gap))), w: s, h: s, z: 10, color: 'transparent', src: src }, newOpacityProps());
          am.whiteboard.push(it); ids.push(it.id);
      });
      state.selWbId = ids[0]; state.selWbIds = ids;
      _imgLibSel = {}; _imgLibPicker = null; _imgLibStash = null;
      closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none';
      import('./io.js').then(function(m) { m.save(true); render(); m.toast(ids.length + ' pictures placed in a block \u2014 they are selected, drag to move them together.'); });
  }

  // Import Character (#importCharBtn) is an outside sheet reader's own: its page code shows the row and wires it (it is hidden in the page)

  var _el_sheetViewClose = document.getElementById('sheetViewCloseBtn');
  if (_el_sheetViewClose) _el_sheetViewClose.addEventListener('click', function() {
      document.getElementById('sheetViewModal').style.display = 'none';
  });

  var _imgLibPick = null;   // a callback waiting for a picture (planner image block, a sheet's portrait or look)
  var _imgLibZ = null;      // the library's own stacking order while it is lifted over the caller (the system modal sits above it)
  function imgLibLift(on) {   // a picker opened from a modal (the sheet builder at z 100000) must land ABOVE it, below the app's confirm (100010)
      var m = document.getElementById('imgLibModal'); if (!m) return;
      if (on) { if (_imgLibZ === null) _imgLibZ = m.style.zIndex; m.style.zIndex = '100005'; }
      else if (_imgLibZ !== null) { m.style.zIndex = _imgLibZ; _imgLibZ = null; }
  }
  window.wpPickImage = async function(cb) {
      _imgLibPick = cb;
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibPicker = null; _imgLibStash = null; _imgIndex = null; _imgLibScope = 'camp';
      var copiesEl = document.getElementById('imgLibCopies'); if (copiesEl) copiesEl.value = castBatch();
      imgLibLift(true);
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try { _imgLibCache = await (await fetch('/api/list-images')).json(); } catch (e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  };
  var _el_imgLibBtn = document.getElementById('imgLibBtn');

  if (_el_imgLibBtn) _el_imgLibBtn.addEventListener('click', async function() {
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibPicker = null; _imgLibStash = null; _imgIndex = null; _imgLibScope = 'camp';
      var copiesEl = document.getElementById('imgLibCopies'); if (copiesEl) copiesEl.value = castBatch();
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try {
          _imgLibCache = await (await fetch('/api/list-images')).json();
      } catch(e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  });

  var _el_imgLibClose = document.getElementById('imgLibCloseBtn');

  if (_el_imgLibClose) _el_imgLibClose.addEventListener('click', function() {
      _imgLibPick = null; _imgLibPicker = null; _imgLibStash = null; closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false);
  });

  var _el_imgLibSearch = document.getElementById('imgLibSearch');

  if (_el_imgLibSearch) _el_imgLibSearch.addEventListener('input', function() { renderImgLib(this.value); });

  var _el_imgLibGrid = document.getElementById('imgLibGrid');
  // The copies box beside the Campaign Cast heading
  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('input', function(e) { var b = e.target.closest('.cast-batch'); if (b && b.value >= 1 && b.value <= 50) setCastBatch(b.value); });
  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('change', function(e) { var b = e.target.closest('.cast-batch'); if (b) b.value = setCastBatch(b.value); });

  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('click', function(e) {
      var cell = e.target.closest('.img-lib-cell');
      if (!cell) return;
      if ((!_imgLibPick || _imgLibPicker) && !cell.classList.contains('cast-cell') && (e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); imgSelToggle(cell, e); return; }
      var batchBtn = e.target.closest('.img-cell-batch');
      if (batchBtn) { e.stopPropagation(); var copies = []; for (var ci = 0; ci < castBatch(); ci++) copies.push(batchBtn.dataset.src); placeImagesBlock(copies); return; }
      if (cell.classList.contains('cast-cell')) {
          if (e.target.closest('.cast-cell-five')) { placeCast(cell.dataset.cid, castBatch()); return; }   // the × button still places straight away
          if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); castSelToggle(cell, e); return; }   // Ctrl/Cmd/Shift-click multi-selects (its own bucket)
          openCastPreview(cell.dataset.cid);   // a bare click just LOOKS now (like a picture); placing is the Add / × button
          return;
      }
      openImgPreview(cell.dataset.src);   // a large look first; Add to map (or Use this picture) is a deliberate press
  });
  /* ---- library preview ---- */
  function imgLibEntry(src) { return (_imgLibCache || []).find(function(i) { return i.path === src; }) || null; }
  function openImgPreview(src) {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      var im = imgLibEntry(src);
      var folder = im ? im.folder : '', mapName = folder ? folderLabel(folder) : '';
      document.getElementById('imgLibPreviewImg').src = encodeURI(src);
      document.getElementById('imgLibPreviewName').textContent = im ? im.name : src.split('/').pop();
      var cat = imgCatOf(src);
      document.getElementById('imgLibPreviewMeta').innerHTML = (mapName ? '<div>Map: <b>' + esc(mapName) + '</b></div>' : '') + '<div>Categor' + (imgCatsOf(src).length === 1 ? 'y' : 'ies') + ': <b>' + (cat ? esc(cat) : 'none') + '</b></div>';
      var catBtn = document.getElementById('imgLibPreviewCat'), fromV = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      if (catBtn) { catBtn.innerHTML = fromV ? 'Add / move category\u2026' : 'Add to category\u2026'; catBtn.title = fromV ? 'Add another category, move it out of ' + fromV + ', or take it out' : 'Tag this picture with a category (it can be in several)'; }
      var add = document.getElementById('imgLibPreviewAdd'), delBtn = document.getElementById('imgLibPreviewDel');
      if (_imgLibPicker) { add.textContent = _imgLibPick ? 'Bring in & use' : 'Bring into this campaign'; add.title = 'This campaign remembers the picture (nothing is copied)' + (_imgLibPick ? ' and the block gets it' : ''); }
      else { add.textContent = _imgLibPick ? 'Use this picture' : (castBatch() > 1 ? 'Add \u00d7' + castBatch() + ' to map' : 'Add to map'); add.title = _imgLibPick ? 'Use this picture where you asked for one' : 'Place it on the current play map (the number in Copies)'; }
      if (catBtn) catBtn.style.display = _imgLibPicker ? 'none' : '';
      if (delBtn) delBtn.style.display = _imgLibPicker ? 'none' : '';
      pv.dataset.src = src; delete pv.dataset.cid;   // leaving cast mode: the Add button reads src, not a stale cid
      grid.style.display = 'none'; pv.style.display = 'flex';
      // arrows step through the pictures in the order the grid shows them
      var listN = imgPreviewList(), at = listN.indexOf(src);
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn'), cnt = document.getElementById('imgLibPreviewCount');
      if (prevB) prevB.disabled = at <= 0;
      if (nextB) nextB.disabled = at < 0 || at >= listN.length - 1;
      if (cnt) cnt.textContent = at >= 0 ? (at + 1) + ' / ' + listN.length : '';
  }
  // The pictures currently in the grid (the search / category filter applied), in grid order
  function imgPreviewList() {
      var grid = document.getElementById('imgLibGrid'); if (!grid) return [];
      return Array.prototype.map.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(c) { return c.dataset.src; });
  }
  function imgPreviewStep(dir) {
      var pv = document.getElementById('imgLibPreview'); if (!pv || pv.style.display === 'none') return;
      var list = imgPreviewList(), at = list.indexOf(pv.dataset.src), to = at + dir;
      if (at < 0 || to < 0 || to >= list.length) return;
      openImgPreview(list[to]);
  }
  function closeImgPreview() {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      pv.style.display = 'none'; grid.style.display = '';
      document.getElementById('imgLibPreviewImg').removeAttribute('src');
      delete pv.dataset.cid;
  }
  window.wpCloseImgPreview = closeImgPreview;
  // A cast face opens the same preview panel as a picture, in a cast mode: the portrait (or a colored disc for a
  // circle token), the name and stat line, and an "Add to map" that drops the number in Copies. Placing a cast token
  // is no longer a bare click (that just looks now, like a picture) — it is a deliberate Add / × button press.
  function castOnMap() { var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return false; } return true; }
  function placeCast(cid, count) {
      if (!castOnMap()) return;
      var ctr = viewCentre();
      castPlace(cid, ctr.x, ctr.y, count);
      closeImgPreview();   // reset to the grid so reopening the library doesn't show a stale preview
      document.getElementById('imgLibModal').style.display = 'none';
  }
  function openCastPreview(cid) {
      var camp = getActiveCampaign(), c = camp && castOf(camp)[cid]; if (!c) return;
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      pv.dataset.cid = cid; delete pv.dataset.src;
      document.getElementById('imgLibPreviewImg').src = picRef(c.src) ? encodeURI(picRef(c.src))
          : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="52" fill="' + (cssColor(c.color) || '#4db3d3') + '"/></svg>');
      document.getElementById('imgLibPreviewName').textContent = c.name || 'Character';
      document.getElementById('imgLibPreviewMeta').innerHTML = '<div style="color:var(--gold);">★ Campaign Cast</div>' + (c.charStats ? '<div>' + esc(c.charStats) + '</div>' : '<div style="color:var(--dim);">No stat line</div>');
      var add = document.getElementById('imgLibPreviewAdd');
      add.textContent = castBatch() > 1 ? 'Add ×' + castBatch() + ' to map' : 'Add to map';
      add.title = 'Place ' + (c.name || 'this character') + ' on the current play map (the number in Copies)';
      var catBtn = document.getElementById('imgLibPreviewCat'), delBtn = document.getElementById('imgLibPreviewDel');
      if (catBtn) catBtn.style.display = 'none';
      if (delBtn) delBtn.style.display = 'none';
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn'), cnt = document.getElementById('imgLibPreviewCount');
      if (prevB) prevB.disabled = true;
      if (nextB) nextB.disabled = true;
      if (cnt) cnt.textContent = '';
      grid.style.display = 'none'; pv.style.display = 'flex';
  }
  (function wireImgPreview() {
      var pv = document.getElementById('imgLibPreview'); if (!pv) return;
      document.getElementById('imgLibPreviewBack').addEventListener('click', closeImgPreview);
      // Delete the picture file itself (saves/images only; the shell must have /api/delete-image — 1.4.6 core)
      var delB = document.getElementById('imgLibPreviewDel');
      if (delB) delB.addEventListener('click', function() {
          var src = pv.dataset.src; if (!src || src.indexOf('/saves/images/') !== 0) { toast('Only pictures in your saves folder can be deleted here.'); return; }
          var use = imgUsage(src), name = src.split('/').pop();
          var msg = 'Delete the picture file "' + name + '" from your saves folder? This cannot be undone.' + (use.count ? '\n\nIt is used ' + use.count + ' time' + (use.count === 1 ? '' : 's') + ' (' + use.maps.join(', ') + '); those places will show a broken picture until you give them another.' : '\n\nNothing in your campaigns uses it.');
          showConfirm(msg, function(yes) {
              if (!yes) return;
              fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) {
                  if (r.status === 404 && !r.headers.get('content-type')) throw new Error('old-core');
                  if (!r.ok) throw new Error('failed');
                  return r.json();
              }).then(function() {
                  _imgLibCache = (_imgLibCache || []).filter(function(i) { return i.path !== src; });
                  catStores().forEach(function(s) { if (s.c.by[src]) delete s.c.by[src]; }); imgCatsSave();
                  closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value);
                  toast('Deleted ' + name + '.');
              }).catch(function(e) {
                  toast(e && e.message === 'old-core' ? 'Deleting pictures needs the 1.4.6 core — run the installer from Settings \u2192 Updates & about.' : 'Could not delete that picture.');
              });
          });
      });
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn');
      if (prevB) prevB.addEventListener('click', function() { imgPreviewStep(-1); });
      if (nextB) nextB.addEventListener('click', function() { imgPreviewStep(1); });
      document.addEventListener('keydown', function(e) {
          if (pv.style.display === 'none') return;
          if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
          if (e.key === 'ArrowLeft') { e.preventDefault(); imgPreviewStep(-1); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); imgPreviewStep(1); }
      });
      document.getElementById('imgLibPreviewAdd').addEventListener('click', function() {
          if (pv.dataset.cid) { placeCast(pv.dataset.cid, castBatch()); return; }   // cast mode: Add drops the number in Copies
          var src = pv.dataset.src; if (!src) return;
          if (_imgLibPicker) {   // bring it in; with a block waiting, hand it over as well
              var cbP = _imgLibPick; bringPictures([src]);
              if (cbP) { _imgLibPick = null; closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false); cbP(src); }
              return;
          }
          if (_imgLibPick) { var cb = _imgLibPick; _imgLibPick = null; closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false); cb(src); return; }
          var am = getActiveMap();
          if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
          if (castBatch() > 1) { var many = []; for (var mi = 0; mi < castBatch(); mi++) many.push(src); placeImagesBlock(many); return; }
          addWbItem('image', { w: 300, h: 300, src: src, color: 'transparent' });
          closeImgPreview();
          document.getElementById('imgLibModal').style.display = 'none';
          toast('Image placed.');
      });
      document.getElementById('imgLibPreviewCat').addEventListener('click', function(e) {
          var src = pv.dataset.src; if (!src) return;
          var r = this.getBoundingClientRect();
          openImgCatMenu(src, r.left, r.bottom + 4);
      });
      // Escape steps back from the preview before it would close the library
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && pv.style.display !== 'none') { e.stopPropagation(); closeImgPreview(); } }, true);
  })();

  // One upload for every picture that enters the app from the renderer — the play-map drop, the planner's
  // Upload button and the Markdown importer: resolves to the /saves/images/… URL, rejects on failure.
  function uploadBlob(mapId, name, blob) {
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return Promise.reject(new Error('not while at someone else\'s table'));
      return fetch('/api/upload?mapId=' + encodeURIComponent(mapId) + '&filename=' + encodeURIComponent(name || 'picture.png'), { method: 'POST', body: blob })
          .then(function(res) { return res.json(); }).then(function(d) { if (!d || !d.url) throw new Error('upload failed'); return d.url; });
  }
  window.wpUploadBlob = uploadBlob;
  function uploadImageFile(f, cx, cy) {

      if(!f || !f.type.startsWith('image/')) return;

      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }   // would create saves/images/<GM mapId>/

      toast('Uploading image...');

      uploadBlob(getActiveCampaign().activeItemId, f.name, f)

      .then(url => ({ url: url }))

      .then(data => {

          if (data.url) {

              if (cx !== undefined && cy !== undefined) {

                  var item = Object.assign({ id: 'wb'+uid(), type: 'image', x: cx, y: cy, w: 300, h: 300, z: 10, src: data.url, color: 'transparent' }, newOpacityProps());

                  getActiveMap().whiteboard.push(item);

                  state.selWbId = item.id;

                  save(); render();

              } else {

                  addWbItem('image', {w:300, h:300, src: data.url, color:'transparent'});

              }

              toast('Image added!');

          }

      })

      .catch(err => toast('Error uploading image.'));

  }



  var _el_imgFileIn = document.getElementById('imgFileIn');

if(_el_imgFileIn) _el_imgFileIn.addEventListener('change', function(e) {

      uploadImageFile(e.target.files[0]);

      e.target.value = '';

  });



  var _el_clearWbBtn = document.getElementById('clearWbBtn');

if(_el_clearWbBtn) _el_clearWbBtn.addEventListener('click', function() {

      showConfirm('Clear the entire play map? (This map\'s Undo can bring it back.)', function(yes) {

          if(yes) {

              getActiveMap().whiteboard = [];

              state.selWbId = null;

              save(); render();

          }

      });

  });



  wbWrap.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); });

  wbWrap.addEventListener('drop', function(e) {

      e.preventDefault(); e.stopPropagation();

      if(state.viewMode !== 'visual') return;

      var f = e.dataTransfer.files[0];

      if(f) {

          var cx = (wbWrap.scrollLeft + e.clientX - wbWrap.getBoundingClientRect().left) / state.zoomLevel - 150;

          var cy = (wbWrap.scrollTop + e.clientY - wbWrap.getBoundingClientRect().top) / state.zoomLevel - 150;

          uploadImageFile(f, Math.max(10, Math.round(cx)), Math.max(10, Math.round(cy)));

      }

  });



  /* ---------- Global Tools ---------- */

  var _el_wbCenterBtn = document.getElementById('wbCenterBtn');
  var _el_wbCenterMenu = document.getElementById('wbCenterMenu');
  var _el_wbCenterCanvasBtn = document.getElementById('wbCenterCanvasBtn');
  var _el_wbCenterItemsBtn = document.getElementById('wbCenterItemsBtn');

  if(_el_wbCenterBtn) _el_wbCenterBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if(!m || m.type === 'planner') return;
      var items = (state.viewMode === 'data' ? m.rooms : m.whiteboard) || [];
      var hasItems = items.length > 0;
      if(!hasItems) {
          if(_el_wbCenterItemsBtn) {
              _el_wbCenterItemsBtn.style.opacity = '0.5';
              _el_wbCenterItemsBtn.style.pointerEvents = 'none';
          }
      } else {
          if(_el_wbCenterItemsBtn) {
              _el_wbCenterItemsBtn.style.opacity = '1';
              _el_wbCenterItemsBtn.style.pointerEvents = 'auto';
          }
      }
      var charBtn = document.getElementById('wbCenterCharBtn');
      if (charBtn) {
          var tok = myCharacterToken(m);
          var isClientC = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
          charBtn.style.display = (state.viewMode === 'visual') ? '' : 'none';
          charBtn.style.opacity = tok ? '1' : '0.5';
          charBtn.style.pointerEvents = tok ? 'auto' : 'none';
          charBtn.textContent = isClientC ? 'Center on My Character' : (tok ? 'Center on ' + (tok.charName || 'Character') : 'Center on Character');
      }
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.toggle('show');
  });

  // Players: their own token. GM: the selected character, else their own, else the first one.
  function myCharacterToken(m) {
      var my = null;
      try { my = JSON.parse(localStorage.getItem('wp_profile') || 'null'); } catch (e) {}
      var myId = my && my.id;
      var toks = (m && m.whiteboard || []).filter(function(i) { return i.isChar; });
      var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      if (isClient) return toks.find(function(i) { return i.ownerId === myId && i.charId; }) || toks.find(function(i) { return i.ownerId === myId; }) || null;   // their character before a pet
      return toks.find(function(i) { return i.id === state.selWbId; }) || toks.find(function(i) { return i.ownerId === myId; }) || toks[0] || null;
  }

  var _el_wbCenterCharBtn = document.getElementById('wbCenterCharBtn');
  if (_el_wbCenterCharBtn) _el_wbCenterCharBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if (!m || m.type !== 'map') return;
      var tok = myCharacterToken(m);
      if (!tok) { toast('No character token of yours on this map.'); return; }
      var wrap = document.getElementById('whiteboardWrap');
      wrap.scrollLeft = ((tok.x + (tok.w || 100) / 2) * state.zoomLevel) - wrap.clientWidth / 2;
      wrap.scrollTop = ((tok.y + (tok.h || 100) / 2) * state.zoomLevel) - wrap.clientHeight / 2;
      if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) { state.selWbId = tok.id; state.selWbIds = [tok.id]; render(); }
      if (_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
      toast('Centered on ' + (tok.charName || 'your character') + '.');
  });

  if(_el_wbCenterCanvasBtn) _el_wbCenterCanvasBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
      wrap.scrollLeft = (15000 * state.zoomLevel) - wrap.clientWidth/2;
      wrap.scrollTop = (15000 * state.zoomLevel) - wrap.clientHeight/2;
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
      toast('Camera centered on canvas.');
  });

  if(_el_wbCenterItemsBtn) _el_wbCenterItemsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if(!m || m.type === 'planner') return;
      var items = (state.viewMode === 'data' ? m.rooms : m.whiteboard) || [];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      items.forEach(function(i) {
          if(i.x < minX) minX = i.x;
          if(i.y < minY) minY = i.y;
          if(i.x + (i.w||100) > maxX) maxX = i.x + (i.w||100);
          if(i.y + (i.h||100) > maxY) maxY = i.y + (i.h||100);
      });
      if(minX !== Infinity) {
          var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
          var curCenterX = minX + (maxX - minX)/2;
          var curCenterY = minY + (maxY - minY)/2;
          wrap.scrollLeft = (curCenterX * state.zoomLevel) - wrap.clientWidth/2;
          wrap.scrollTop = (curCenterY * state.zoomLevel) - wrap.clientHeight/2;
          toast('Camera centered on items.');
      }
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
  });

  var _el_wbFitBtn = document.getElementById('wbFitBtn');
  if(_el_wbFitBtn) _el_wbFitBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if(window.wpFitView) window.wpFitView(false);   // frame everything (zoom + pan)
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
  });

  document.addEventListener('click', function(e) {
      if(_el_wbCenterMenu && e.target !== _el_wbCenterBtn && !e.target.closest('#wbCenterMenu')) {
          _el_wbCenterMenu.classList.remove('show');
      }
  });

  var _el_wbUndoBtn = document.getElementById('wbUndoBtn');

if(_el_wbUndoBtn) _el_wbUndoBtn.addEventListener('click', function() {

      undo();

  });

  var _el_wbRedoBtn = document.getElementById('wbRedoBtn');

if(_el_wbRedoBtn) _el_wbRedoBtn.addEventListener('click', function() {

      redo();

  });



  var _el_toggleLeftBtn = document.getElementById('toggleLeftBtn');

if(_el_toggleLeftBtn) _el_toggleLeftBtn.addEventListener('click', function() {

      var sb = document.getElementById('campaignSidebar');

      sb.classList.toggle('collapsed');

      this.textContent = sb.classList.contains('collapsed') ? '▶' : '◀';
      this.dataset.tip = sb.classList.contains('collapsed') ? 'Show the left panel' : 'Hide the left panel'; this.removeAttribute('title');   // what a press does now (tooltips.js reads data-tip: one tooltip, never two)
      if (window.wpLeftRail) window.wpLeftRail.toggled();   // the panel's three states are leftrail.js's: folded it leaves a rail, and on the play map docking it is pinning it

  });



  /* Properties sidebar: closed by default, opens when something is selected (a
     room on the data map, an item on the play map) and closes again when the
     selection clears. A hand toggle (the ▶/◀ button) wins until the selection changes. */
  window.wpSelKey = function() { return state.viewMode === 'data' ? (state.selId ? 'r:' + state.selId : (state.selLink != null ? 'l:' + state.selLink : '')) : (state.selWbId ? 'w:' + state.selWbId : ''); };
  window.wpSyncRightPanel = function() {
      var sb = document.getElementById('sidebar'), btn = document.getElementById('toggleRightBtn');
      if (!sb || !btn || btn.style.display === 'none') return;
      var key = window.wpSelKey();
      if (state.rightManualKey !== undefined && state.rightManualKey !== key) state.rightManualKey = undefined;   // selection moved on: automation resumes
      if (state.rightManualKey !== undefined) return;
      // Properties no longer auto-OPENS on a single click — it opens on DOUBLE-click (wpOpenRightPanel below).
      // A plain click that clears the selection, or moves it to a different item while a double-click panel is open, dismisses that panel.
      if (!key) { if (state.rightAuto || !state.rightEverSynced) { sb.classList.add('collapsed'); state.rightAuto = false; } }
      else if (state.rightAuto && key !== state.rightAutoKey) { sb.classList.add('collapsed'); state.rightAuto = false; }
      state.rightEverSynced = true;
      btn.textContent = sb.classList.contains('collapsed') ? '◀' : '▶';
  };
  window.wpOpenRightPanel = function() {   // double-click a play-map item: deliberately open Properties for the current selection
      var sb = document.getElementById('sidebar'), btn = document.getElementById('toggleRightBtn');
      if (!sb || !btn || btn.style.display === 'none') return;
      sb.classList.remove('collapsed');
      state.rightAuto = true; state.rightAutoKey = window.wpSelKey ? window.wpSelKey() : '';
      state.rightManualKey = undefined; state.rightEverSynced = true;
      btn.textContent = '▶';
  };
  var _el_toggleRightBtn = document.getElementById('toggleRightBtn');

if(_el_toggleRightBtn) _el_toggleRightBtn.addEventListener('click', function() {

      var sb = document.getElementById('sidebar');

      sb.classList.toggle('collapsed');

      this.textContent = sb.classList.contains('collapsed') ? '◀' : '▶';
      // A hand toggle overrides the automatic open/close until the selection changes
      state.rightAuto = false;
      state.rightManualKey = window.wpSelKey ? window.wpSelKey() : '';

      // The button is pinned to the center pane's right edge (CSS right:0),
      // which already tracks the sidebar as it collapses — no inline offset.

      if (state.viewMode === 'data') renderDataMap();

  });



  var _el_helpBtn = document.getElementById('helpBtn');

if(_el_helpBtn) _el_helpBtn.addEventListener('click', function() {

      document.getElementById('helpModal').style.display = 'flex';

  });

  var _el_helpCloseBtn = document.getElementById('helpCloseBtn');

if(_el_helpCloseBtn) _el_helpCloseBtn.addEventListener('click', function() {

      document.getElementById('helpModal').style.display = 'none';

  });

  // Clicking a modal's dark backdrop closes it, routed through its own
  // close/cancel button so any teardown logic runs. A pointerdown check keeps
  // text-selection drags that end on the backdrop from closing the dialog.
  (function() {
      var overlayClose = {
          aboutModal: 'aboutCloseBtn',
          legalModal: 'legalCloseBtn',
          helpModal: 'helpCloseBtn',
          netModal: 'netCloseBtn',
          campSearchModal: 'campSearchClose',
          plannerSearchModal: 'plannerSearchClose',
          mapSearchModal: 'mapSearchClose',
          importChoiceModal: 'importCancelBtn',
          imgLibModal: 'imgLibCloseBtn',
          settingsModal: 'settingsCloseBtn',
          playersModal: 'playersCloseBtn',
          sheetViewModal: 'sheetViewCloseBtn',
          vttNoticeModal: 'vttNoticeKeepBtn',   // the backdrop means "Keep mine"
          vttPushModal: 'vttPushCancelBtn',
          soundLibModal: 'soundLibClose',
          systemModal: 'sysClose'
      };
      Object.keys(overlayClose).forEach(function(oid) {
          var overlay = document.getElementById(oid);
          if (!overlay) return;
          var downOnBackdrop = false;
          overlay.addEventListener('pointerdown', function(e) { downOnBackdrop = (e.target === overlay); });
          overlay.addEventListener('click', function(e) {
              if (e.target !== overlay || !downOnBackdrop) return;
              var btn = document.getElementById(overlayClose[oid]);
              if (btn) btn.click(); else overlay.style.display = 'none';
          });
      });
  })();

  // The shape and grid dropdowns close on outside clicks like the other menus
  document.addEventListener('click', function(e) {
      var sm = document.getElementById('shapeMenu');
      if (sm && sm.classList.contains('show') && !e.target.closest('#shapeMenu') && !e.target.closest('#shapeMenuBtn')) sm.classList.remove('show');
      var gm = document.getElementById('gridMenu');
      if (gm && gm.classList.contains('show') && !e.target.closest('#gridMenu') && !e.target.closest('#wbGridBtn')) gm.classList.remove('show');
      var am = document.getElementById('addMenu');
      if (am && am.classList.contains('show') && !e.target.closest('#addMenu') && !e.target.closest('#addMenuBtn')) am.classList.remove('show');
      var sfx = document.getElementById('sceneFxMenu');
      if (sfx && sfx.classList.contains('show') && !e.target.closest('#sceneFxMenu') && !e.target.closest('#sceneFxBtn')) sfx.classList.remove('show');
  });

  // Open Help on a topic, optionally scrolled to a heading (Settings links here)
  window.wpOpenHelp = function(pane, anchorId) {
      var modal = document.getElementById('helpModal'); if (!modal) return;
      modal.style.display = 'flex';
      var _hs = document.getElementById('helpSearch'), _hr = document.getElementById('helpSearchResults');
      if (_hs) _hs.value = ''; if (_hr) { _hr.style.display = 'none'; _hr.innerHTML = ''; }
      var nav = document.getElementById('helpNav');
      if (nav) nav.querySelectorAll('[data-help]').forEach(function(b) { b.classList.toggle('active', b.dataset.help === pane); });
      document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = (p.dataset.pane === pane) ? 'block' : 'none'; });
      var a = anchorId && document.getElementById(anchorId);
      if (a) setTimeout(function() { a.scrollIntoView({ block: 'start', behavior: 'auto' }); }, 60);
  };
  // Help tutorials — topic rail switches the visible pane
  var _el_helpNav = document.getElementById('helpNav');
  if (_el_helpNav) _el_helpNav.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-help]');
      if (!btn) return;
      _el_helpNav.querySelectorAll('[data-help]').forEach(function(b) { b.classList.toggle('active', b === btn); });
      document.querySelectorAll('#helpModal .help-pane').forEach(function(p) {
          p.style.display = (p.dataset.pane === btn.dataset.help) ? 'block' : 'none';
      });
  });

  // Smart search across every Help pane: type to get ranked matches, click one (or Enter) to jump to it.
  (function wireHelpSearch() {
      var input = document.getElementById('helpSearch');
      var results = document.getElementById('helpSearchResults');
      var nav = document.getElementById('helpNav');
      if (!input || !results || !nav) return;
      var index = null, current = [];

      function esc(s) { return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function paneLabel(id) {
          var b = nav.querySelector('[data-help="' + id + '"]');
          return b ? b.textContent.replace(/^[^A-Za-z0-9]+/, '').trim() : id;   // drop the leading emoji
      }
      // [tutorialcheck:helpsearch-start]
      // An entry's own words. An entry may hold a list of points nested under its lead: the lead is found by its own words and each point by
      // its own, so one match is one result, never the point and again the whole entry around it.
      function helpOwnText(el) {
          var out = '';
          (function walk(n) { for (var c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) out += c.nodeValue; else if (c.nodeType === 1 && c.tagName !== 'UL' && c.tagName !== 'OL') walk(c); } })(el);
          return out;
      }
      // Where a result is: its heading, and for a point nested under an entry that entry's name too (its first bold words, read as the tour
      // reads a Help entry's name: no leading symbol, no closing colon or full stop).
      function helpWhere(heading, lead) {
          var name = String(lead == null ? '' : lead).replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').replace(/[\s:.]+$/, '');
          return name ? heading + ' \u203a ' + name : heading;
      }
      // [tutorialcheck:helpsearch-end]
      function buildIndex() {
          index = [];
          document.querySelectorAll('#helpModal .help-pane').forEach(function(pane) {
              var id = pane.dataset.pane, label = paneLabel(id), heading = label;
              pane.querySelectorAll('h4, p, li, .help-tip').forEach(function(el) {
                  var text = helpOwnText(el).replace(/\s+/g, ' ').trim();
                  if (!text) return;
                  var isH4 = el.tagName === 'H4';
                  if (isH4) heading = text;
                  var up = el.tagName === 'LI' && el.parentElement ? el.parentElement.closest('li') : null, lead = up ? up.querySelector('b') : null;
                  if (lead && lead.closest('li') !== up) lead = null;   // a bold word of one of its points is no name of the entry
                  index.push({ paneId: id, paneLabel: label, heading: heading, where: helpWhere(heading, lead ? lead.textContent : ''), el: el, text: text, lc: text.toLowerCase(), isH4: isH4 });
              });
          });
      }
      // Highlight on the raw text and escape as we build, so matches wrap safely regardless of content.
      function highlight(text, terms) {
          var lc = text.toLowerCase(), ranges = [];
          terms.forEach(function(t) { if (!t) return; var from = 0, i; while ((i = lc.indexOf(t, from)) >= 0) { ranges.push([i, i + t.length]); from = i + t.length; } });
          if (!ranges.length) return esc(text);
          ranges.sort(function(a, b) { return a[0] - b[0]; });
          var merged = [ranges[0].slice()];
          for (var k = 1; k < ranges.length; k++) { var last = merged[merged.length - 1]; if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]); else merged.push(ranges[k].slice()); }
          var out = '', pos = 0;
          merged.forEach(function(r) { out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
          return out + esc(text.slice(pos));
      }
      function snippet(text, terms) {
          var lc = text.toLowerCase(), pos = -1;
          terms.forEach(function(t) { var i = lc.indexOf(t); if (i >= 0 && (pos < 0 || i < pos)) pos = i; });
          if (pos < 0) pos = 0;
          var start = Math.max(0, pos - 40), end = Math.min(text.length, pos + 120);
          return (start > 0 ? '… ' : '') + highlight(text.slice(start, end), terms) + (end < text.length ? ' …' : '');
      }
      function showActivePane() {
          var active = nav.querySelector('[data-help].active');
          var id = active ? active.dataset.help : 'start';
          document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = (p.dataset.pane === id) ? 'block' : 'none'; });
      }
      function headingMatch(e, terms) { var h = e.heading.toLowerCase(); return terms.every(function(t) { return h.indexOf(t) >= 0; }); }
      function run() {
          var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
          if (!terms.length) { results.style.display = 'none'; results.innerHTML = ''; showActivePane(); return; }
          if (!index) buildIndex();
          document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = 'none'; });
          current = index.filter(function(e) { return terms.every(function(t) { return e.lc.indexOf(t) >= 0; }); });
          var phrase = terms.join(' ');   // rank exact-phrase hits, then heading hits, then the rest
          function score(e) {
              return (e.heading.toLowerCase().indexOf(phrase) >= 0 ? 0 : 8) + (headingMatch(e, terms) ? 0 : 4) + (e.lc.indexOf(phrase) >= 0 ? 0 : 2);
          }
          current.sort(function(a, b) { var d = score(a) - score(b); return d !== 0 ? d : a.text.length - b.text.length; });
          var max = 40, shown = current.slice(0, max);
          if (!shown.length) {
              results.innerHTML = '<div class="help-noresult">No help topics match “' + esc(input.value.trim()) + '”. Try fewer or different words.</div>';
          } else {
              results.innerHTML = shown.map(function(e, i) {
                  var body = e.isH4
                      ? '<span class="hr-heading">' + highlight(e.text, terms) + '</span>'
                      : '<span class="hr-heading">' + esc(e.where) + '</span><div class="hr-snip">' + snippet(e.text, terms) + '</div>';
                  return '<div class="help-result" data-i="' + i + '"><span class="hr-pane">' + esc(e.paneLabel) + '</span>' + body + '</div>';
              }).join('') + (current.length > max ? '<div class="help-noresult">Showing the first ' + max + ' of ' + current.length + ' matches — keep typing to narrow.</div>' : '');
          }
          results.style.display = 'block';
          results.scrollTop = 0;
      }
      function openHit(e) {
          input.value = '';
          results.style.display = 'none'; results.innerHTML = '';
          nav.querySelectorAll('[data-help]').forEach(function(b) { b.classList.toggle('active', b.dataset.help === e.paneId); });
          document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = (p.dataset.pane === e.paneId) ? 'block' : 'none'; });
          setTimeout(function() {
              e.el.scrollIntoView({ block: 'center', behavior: 'auto' });
              e.el.classList.remove('help-hit'); void e.el.offsetWidth; e.el.classList.add('help-hit');
              setTimeout(function() { e.el.classList.remove('help-hit'); }, 1800);
          }, 30);
      }
      input.addEventListener('input', run);
      input.addEventListener('keydown', function(ev) {
          if (ev.key === 'Escape' && input.value) { ev.stopPropagation(); input.value = ''; run(); }
          else if (ev.key === 'Enter') { var first = results.querySelector('.help-result'); if (first) first.click(); }
      });
      results.addEventListener('click', function(ev) {
          var row = ev.target.closest('.help-result'); if (!row) return;
          var e = current[parseInt(row.dataset.i, 10)]; if (e) openHit(e);
      });
      // A nav click abandons an active search; opening Help focuses the box.
      nav.addEventListener('click', function() { if (input.value || results.style.display !== 'none') { input.value = ''; results.style.display = 'none'; results.innerHTML = ''; } });
      var helpBtn = document.getElementById('helpBtn');
      if (helpBtn) helpBtn.addEventListener('click', function() { setTimeout(function() { try { input.focus(); input.select(); } catch (e) {} }, 40); });
  })();

  var _el_aboutBtn = document.getElementById('aboutBtn');

if(_el_aboutBtn) _el_aboutBtn.addEventListener('click', function() {

      document.getElementById('aboutModal').style.display = 'flex';

      var vEl = document.getElementById('aboutVersion');
      if (vEl && !vEl.dataset.click) {   // the version number itself opens the release notes
          vEl.dataset.click = '1'; vEl.style.cursor = 'pointer'; vEl.title = "Click to read what's new";
          vEl.addEventListener('click', function() { window.wpShowWhatsNew(vEl.dataset.version || ''); });
      }
      if (vEl && !vEl.dataset.loaded) {
          // The app folder's version wins over the shell's: a one-click update replaces only the app folder
          (window.wpVersionReady || fetch('/api/version').then(function(r) { return r.json(); }).then(function(v) { return v.version; })).then(function(ver) {
              vEl.textContent = 'Waypoint Alpha ' + ver; vEl.dataset.version = String(ver || '');   // 1.5.6: the release's name (backlog 177)
              vEl.dataset.loaded = '1';
          }).catch(function() { vEl.textContent = ''; });
      }

  });

  var _el_aboutCloseBtn = document.getElementById('aboutCloseBtn');

if(_el_aboutCloseBtn) _el_aboutCloseBtn.addEventListener('click', function() {

      document.getElementById('aboutModal').style.display = 'none';

  });

  // Legal viewer (Terms / Privacy) — text served from assets/legal.txt so the
  // About panel always shows the same document that ships as license.txt
  var _legalText = null;
  async function openLegal(which) {
      var body = document.getElementById('legalBody');
      var title = document.getElementById('legalTitle');
      title.textContent = which === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
      body.style.textAlign = 'left';
      document.getElementById('legalModal').style.display = 'flex';
      if (_legalText === null) {
          try {
              var r = await fetch('assets/legal.txt');
              _legalText = r.ok ? await r.text() : '';
          } catch (e) { _legalText = ''; }
      }
      if (!_legalText) { body.textContent = 'The legal document could not be loaded. A copy ships with the app as license.txt in the install folder.'; return; }
      var tIdx = _legalText.indexOf('TERMS OF USE');
      var pIdx = _legalText.indexOf('PRIVACY POLICY');
      var section;
      if (which === 'privacy') {
          section = pIdx >= 0 ? _legalText.slice(pIdx) : _legalText;
      } else {
          section = (tIdx >= 0 && pIdx > tIdx) ? _legalText.slice(tIdx, pIdx) : _legalText;
          section = section.replace(/=+\s*$/, '').replace(/\s+$/, '');
          var cIdx = _legalText.indexOf('CONTACT & BUG REPORTS');
          if (cIdx >= 0) section += '\n\n' + _legalText.slice(cIdx).replace(/^=+\n/gm, '');
      }
      body.textContent = _legalText.split('\n', 2).join('\n') + '\n\n' + section.replace(/^=+\n/gm, '');
      body.scrollTop = 0;
  }
  // "What's New" — shows the release notes in the legal viewer. Also called
  // automatically on the first launch after an update (see settings.js).
  window.wpShowWhatsNew = function(versionLabel) {
      var body = document.getElementById('legalBody');
      var title = document.getElementById('legalTitle');
      if (!body || !title) return;
      title.textContent = "What's New" + (versionLabel ? ' — Waypoint Alpha ' + versionLabel : '');
      body.style.textAlign = 'center';   // release notes read centred; Terms/Privacy switch back to left in openLegal
      body.textContent = 'Loading…';
      document.getElementById('legalModal').style.display = 'flex';
      fetch('assets/whatsnew.txt').then(function(r) { return r.ok ? r.text() : ''; }).then(function(txt) {
          body.textContent = txt || 'No release notes found.';
          body.scrollTop = 0;
      }).catch(function() { body.textContent = 'No release notes found.'; });
  };
  var _el_aboutNotesBtn = document.getElementById('aboutNotesBtn');
  if (_el_aboutNotesBtn) _el_aboutNotesBtn.addEventListener('click', function() {
      var vEl = document.getElementById('aboutVersion');
      window.wpShowWhatsNew(vEl && vEl.dataset.version || '');
  });

  var _el_aboutTermsBtn = document.getElementById('aboutTermsBtn');
  if (_el_aboutTermsBtn) _el_aboutTermsBtn.addEventListener('click', function() { openLegal('terms'); });
  var _el_aboutPrivacyBtn = document.getElementById('aboutPrivacyBtn');
  if (_el_aboutPrivacyBtn) _el_aboutPrivacyBtn.addEventListener('click', function() { openLegal('privacy'); });
  var _el_legalCloseBtn = document.getElementById('legalCloseBtn');
  if (_el_legalCloseBtn) _el_legalCloseBtn.addEventListener('click', function() { document.getElementById('legalModal').style.display = 'none'; });
  var _el_aboutEmailCopy = document.getElementById('aboutEmailCopy');
  if (_el_aboutEmailCopy) _el_aboutEmailCopy.addEventListener('click', function() {
      var email = document.getElementById('aboutEmail').textContent;
      navigator.clipboard.writeText(email).then(function() {
          if (window.appToast) window.appToast('Email copied ✓');
      }, function() {
          if (window.appToast) window.appToast('Copy failed — select the address manually');
      });
  });



window.wpUploadImage = uploadImageFile; // clipboard paste (io.js) places images at the cursor

export {

    renderWhiteboard,

    attachResizeHandle,

    attachRotateHandle,

    addWbItem,

    uploadImageFile

};



var _el_shapeMenuBtn = document.getElementById('shapeMenuBtn');

if(_el_shapeMenuBtn) _el_shapeMenuBtn.addEventListener('click', function() {

    document.getElementById('shapeMenu').classList.toggle('show');

});

// The Add flyout gathers the content tools (text, image, library, import) behind one button.
var _el_addMenuBtn = document.getElementById('addMenuBtn');
if (_el_addMenuBtn) _el_addMenuBtn.addEventListener('click', function() {
    document.getElementById('addMenu').classList.toggle('show');
});
var _addMenuEl = document.getElementById('addMenu');
if (_addMenuEl) _addMenuEl.addEventListener('click', function(e) { if (e.target.closest('button')) this.classList.remove('show'); });

// The Scene flyout gathers the GM ambience tools (sound, visual effects) behind one button.
var _el_sceneFxBtn = document.getElementById('sceneFxBtn');
if (_el_sceneFxBtn) _el_sceneFxBtn.addEventListener('click', function() {
    document.getElementById('sceneFxMenu').classList.toggle('show');
});
var _sceneFxEl = document.getElementById('sceneFxMenu');
if (_sceneFxEl) _sceneFxEl.addEventListener('click', function(e) { if (e.target.closest('button')) this.classList.remove('show'); });

// [lookcheck:bar-start]
// 107, the toolbar's layout (the owner, 2026-10-06: the tools on one bar; View, Grid and Snap in a column at the map's right edge; More, the last
// button, with Clear board; and of the zoom box, "Leave the box as it is"). The bar and the column are the two boxes of the one toolbar.
var _wbTb = document.getElementById('wbFloatingToolbar'), _wbEdge = document.getElementById('wbEdgeTools');
// One toolbar popup at a time, across both boxes: pressing any tool button closes every other button's open menu, so a flyout only shows while its
// own button is the one in hand. Capture phase, ahead of each button's own toggle, and it never closes the menu the click landed in (a row) or opens on.
function wbOneMenu(e) {
    var btn = e.target.closest('.wb-tool-btn');
    if (!btn) return;
    var insideMenu = btn.closest('.shape-menu');
    var wrap = btn.closest('div');
    var own = (wrap && wrap !== _wbTb && wrap !== _wbEdge) ? wrap.querySelector('.shape-menu') : null;
    [_wbTb, _wbEdge].forEach(function(box) { if (box) box.querySelectorAll('.shape-menu.show').forEach(function(m) { if (m !== own && m !== insideMenu) m.classList.remove('show'); }); });
}
[_wbTb, _wbEdge].forEach(function(box) { if (box) box.addEventListener('click', wbOneMenu, true); });
// A menu of the map's tools rises over the floating boxes as it opens, and steps back under them when one is pressed (backlog 143; the owner,
// 2026-10-16, by prompt: "Rise, then step back (Recommended)": "A menu or a tool's options open over the windows. When you press a window, that
// window comes back over the tool's options, like windows on a desktop"). style.css raises a .floating-toolbar while a menu of it is open (the
// play map's bar, the column at its edge, the data map's bar). A press on a floating box gives the bars BAR_BACK, which puts one with an open
// menu back under the boxes, its menu still open. The boxes are floats.js's own list (wpFloats.boxes: the sheet, a HUD, the page panel, Sound,
// Music, Video, Effects, the notepad, Table Chat and the dice roller) and the dice roller's pop, which stands apart on the page. A focus that
// arrives in one, by a key or a script, does the same (barFocus). A press on a
// bar, its open menu among it, takes BAR_BACK off that bar, and so does a menu of it that opens, by a press, a key or the tour. Taken in the
// capture phase, so a box that stops its own presses still counts. Nothing here opens or closes a menu: one that closes at a press elsewhere
// still does, by its own listener. The same on every screen
var BAR_BACK = 'tb-back';
var _barWas = null;   // the bar the last press of the pointer found stood back, which barPress brings forward at once: the click that press ends in asks it (barBehind)
var _barSaw = null;   // the windows that showed at that pointerdown, as barShowing gives them: that click asks whether one covered its open menu then
// The bar that holds el, or null
function barOf(el) { return el && typeof el.closest === 'function' ? el.closest('.floating-toolbar') : null; }
function barWindow(t) {
    if (t.closest('.dice-modpop')) return true;
    var F = window.wpFloats, bs = F && typeof F.boxes === 'function' ? F.boxes() : [];
    return bs.some(function(b) { return b === t || (typeof b.contains === 'function' && b.contains(t)); });
}
// Every bar takes BAR_BACK: one with an open menu goes back under the boxes, its menu still open
function barStep() { Array.prototype.forEach.call(document.querySelectorAll('.floating-toolbar'), function(b) { b.classList.add(BAR_BACK); }); }
function barPress(e) {
    var t = e && e.target, held = barOf(t); _barWas = held && held.classList.contains(BAR_BACK) ? held : null;
    _barSaw = _barWas ? barShowing() : null;   // the windows as they stand at this press, before one goes at it (the dice roller's pop does)
    if (!t || typeof t.closest !== 'function') return;
    var bar = t.closest('.floating-toolbar');
    if (bar) { bar.classList.remove(BAR_BACK); return; }
    if (barWindow(t)) barStep();
}
// A focus that arrives in a floating box steps the bars back as a press on one does (backlog 143, the review of 2026-10-17: Tab into a window
// left a tool's options over it): the same boxes and the dice roller's pop, the focus moved by a key or by a script that focuses a field of
// one. A focus anywhere else, in a bar or a menu of it among them, leaves every bar as it stands
function barFocus(e) {
    var t = e && e.target;
    if (t && typeof t.closest === 'function' && barWindow(t)) barStep();
}
// A menu that opens: its class gains show. One drawn again while it is up is no opening, which its class before the change tells
function barOpened(recs) {
    recs.forEach(function(r) {
        var m = r.target, bar = m && m.classList && m.classList.contains('shape-menu') && m.classList.contains('show') && !/(^|\s)show(\s|$)/.test(r.oldValue || '') ? m.closest('.floating-toolbar') : null;
        if (bar) bar.classList.remove(BAR_BACK);
    });
}
// The rectangle el is drawn in, as { l, t, w, h }, or null where it has none: a box that is not laid out, or a page with no layout to measure
function barRect(el) {
    var r = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    return r && +r.width > 0 && +r.height > 0 ? { l: +r.left, t: +r.top, w: +r.width, h: +r.height } : null;
}
// The windows that show, as their rectangles (one with none as null): a box of floats.js's own list that is up, not hidden and not put away
// for this view (wp-away), and the dice roller's pop, which stands apart on the page
function barShowing() {
    var F = window.wpFloats, got = F && typeof F.boxes === 'function' ? F.boxes() : null, bs = got ? Array.prototype.slice.call(got) : [];
    if (typeof document.querySelectorAll === 'function') Array.prototype.forEach.call(document.querySelectorAll('.dice-modpop'), function(p) { bs.push(p); });
    return bs.filter(function(b) { return !!b && !(b.style && b.style.display === 'none') && !b.hidden && !(b.classList && b.classList.contains('wp-away')); }).map(barRect);
}
// Whether a window seen (barShowing's rectangles) covers el, an open menu. Where nothing can be measured (el and every window with no
// rectangle, as on a page of plain objects) it cannot be told, and the answer is yes, so the bar's own word stands
function barCovered(el, seen) {
    var m = barRect(el), rs = (seen || []).filter(Boolean);
    if (!m && !rs.length) return true;
    return !!m && rs.some(function(r) { return r.l < m.l + m.w && m.l < r.l + r.w && r.t < m.t + m.h && m.t < r.t + r.h; });
}
// Whether el, an open menu of a bar, is behind a window as the press e begins (backlog 143, F2): its bar stood back under the boxes AND a
// window that shows covers it (the review of 2026-10-17: where none covers the options, standing back changes nothing to be seen, and one
// press of the arrow closes them as ever). A click of the pointer asks what its own pointerdown found, the bar (_barWas) and the windows as
// they stood (_barSaw), since barPress has brought the bar forward by then and the dice roller's pop goes at that pointerdown; a press by a
// key or by a script, whose click counts no clicks, and a press from outside the bar ask the bar and the windows as they stand. A tool's
// arrow (wireTool) and the pairs wireMenuArrows guards ask it for toolPress, and barFront asks it
function barBehind(el, e) {
    var bar = barOf(el); if (!bar) return false;
    var ptr = !!e && e.detail > 0 && _barWas === bar;
    if (!ptr && !bar.classList.contains(BAR_BACK)) return false;
    return barCovered(el, ptr ? _barSaw : barShowing());
}
// Brings the bar that holds el in front of the boxes again where barBehind says el is behind a window, and answers whether it did. Nothing
// is opened or closed
function barFront(el) {
    var bar = barOf(el); if (!bar || !barBehind(el)) return false;
    bar.classList.remove(BAR_BACK); return true;
}
window.wpBarFront = barFront;
document.addEventListener('pointerdown', barPress, true);
document.addEventListener('focusin', barFocus, true);
if (typeof MutationObserver === 'function') { var _barMo = new MutationObserver(barOpened); Array.prototype.forEach.call(document.querySelectorAll('.floating-toolbar'), function(b) { _barMo.observe(b, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true }); }); }
// More, the last button of the bar: its menu holds Clear board. A press on a row puts the menu away, and so does a press anywhere else
var _el_wbMoreBtn = document.getElementById('wbMoreBtn'), _el_wbMoreMenu = document.getElementById('wbMoreMenu');
if (_el_wbMoreBtn && _el_wbMoreMenu) {
    _el_wbMoreBtn.addEventListener('click', function() { _el_wbMoreMenu.classList.toggle('show'); });
    _el_wbMoreMenu.addEventListener('click', function(e) { if (e.target.closest('button')) _el_wbMoreMenu.classList.remove('show'); });
    document.addEventListener('click', function(e) { if (_el_wbMoreMenu.classList.contains('show') && !e.target.closest('#wbMoreMenu') && !e.target.closest('#wbMoreBtn')) _el_wbMoreMenu.classList.remove('show'); });
}
// The View menu's Show group: the rulers, the zoom buttons and the pointer location, each ticked while it is shown. A row presses the very switch
// Settings has (settings.js viewSwitch), so one place switches each. The menu stays open: several can be ticked in one visit
var VIEW_TICKS = [['wbRulersBtn', 'rulers'], ['wbZoomCtlBtn', 'zoom'], ['wbPointerPosBtn', 'pointer']];   // a row of the View menu, and the switch it ticks
function syncViewTicks() {
    VIEW_TICKS.forEach(function(r) {
        var b = document.getElementById(r[0]); if (!b) return;
        var on = !(typeof window.wpViewShown === 'function' && window.wpViewShown(r[1]) === false);   // shown unless its switch says hidden
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
}
VIEW_TICKS.forEach(function(r) { var b = document.getElementById(r[0]); if (b) b.addEventListener('click', function() { if (typeof window.wpViewSwitch === 'function') window.wpViewSwitch(r[1]); syncViewTicks(); }); });
var _viewBtn = document.getElementById('wbCenterBtn'); if (_viewBtn) _viewBtn.addEventListener('click', syncViewTicks);   // Settings may have switched one since
syncViewTicks();
// The bar never runs off the map. Where it is wider than the room it has, it tightens (smaller buttons, less air between them); where that is still
// too wide, it wraps onto a second row. Nothing folds away: every tool keeps its own button and its own menu at any width
function barFit(wide, tight, room) { return wide <= room ? '' : (tight <= room ? 'tight' : 'wrap'); }
// Where a wrapped bar breaks. A group (the buttons between two separators) is never split: the bar takes the fewest rows that fit the room, and of
// the ways to fill that many rows the one whose widest row is narrowest, so the rows come out even. widths: each group's width. gap: what a
// separator adds between two groups of one row. Answers { cuts: the groups a row ends with, width: the widest row }, or null where a group alone is
// wider than the room (the bar then wraps wherever it must)
function barBreaks(widths, gap, room) {
    var n = Array.isArray(widths) ? widths.length : 0, best = null;
    if (!n || n > 12 || !(room > 0) || !(gap >= 0) || widths.some(function(w) { return !(w > 0); })) return null;   // a group wider than the room fits no row below: nothing is answered for it either
    var rowW = function(a, z) { var s = 0; for (var i = a; i <= z; i++) s += widths[i] + (i > a ? gap : 0); return s; };
    var pick = function(start, left, cuts, worst) {
        if (left === 1) { var last = rowW(start, n - 1), all = Math.max(worst, last); if (last <= room && (!best || all < best.width)) best = { cuts: cuts, width: all }; return; }
        for (var end = start; end <= n - left; end++) { var w = rowW(start, end); if (w > room) break; pick(end + 1, left - 1, cuts.concat([end]), Math.max(worst, w)); }
    };
    for (var rows = 1; rows <= n && !best; rows++) pick(0, rows, [], 0);   // the fewest rows first
    return best;
}
// The bar as it stands in one row: its groups, the separators between them, what a separator adds, and what the bar's own skin adds around a row.
// Only what shows is counted (a player's bar has fewer buttons and no separators: one group)
function barGroups(bar) {
    var groups = [], seps = [], cur = null, gap = 0;
    Array.prototype.forEach.call(bar.children, function(k) {
        if (!(k.offsetWidth > 0)) return;
        if (k.classList.contains('wb-tool-sep')) { if (cur) { seps.push(k); cur = null; } return; }   // one that leads the bar or follows another parts nothing
        if (!cur) { cur = { a: k.offsetLeft, z: 0 }; groups.push(cur); }
        cur.z = k.offsetLeft + k.offsetWidth;
    });
    if (!groups.length) return null;
    for (var i = 1; i < groups.length; i++) gap = Math.max(gap, groups[i].a - groups[i - 1].z);
    return { widths: groups.map(function(g) { return g.z - g.a; }), seps: seps.slice(0, groups.length - 1), gap: gap, chrome: bar.offsetWidth - (groups[groups.length - 1].z - groups[0].a) };
}
function fitBar() {
    if (!_wbTb || !_wbTb.parentElement || _wbTb.style.display === 'none') return;
    var room = _wbTb.parentElement.clientWidth - 24; if (!(room > 0)) return;
    _wbTb.classList.remove('tb-tight'); _wbTb.classList.remove('tb-wrap'); _wbTb.style.width = '';
    Array.prototype.forEach.call(_wbTb.children, function(k) { k.classList.remove('tb-brk'); });
    var wide = _wbTb.offsetWidth; if (barFit(wide, 0, room) === '') return;
    _wbTb.classList.add('tb-tight');
    if (barFit(wide, _wbTb.offsetWidth, room) !== 'wrap') return;
    var g = barGroups(_wbTb), br = g ? barBreaks(g.widths, g.gap, room - g.chrome) : null;   // measured while the tight bar is still one row
    _wbTb.classList.add('tb-wrap');
    if (br) { br.cuts.forEach(function(c) { g.seps[c].classList.add('tb-brk'); }); _wbTb.style.width = (br.width + g.chrome + 2) + 'px'; }   // a row ends at its separator, and the bar is as wide as its widest row
}
window.wpFitBar = fitBar;
if (_wbTb && _wbTb.parentElement && typeof ResizeObserver === 'function') new ResizeObserver(function() { fitBar(); }).observe(_wbTb.parentElement);
// [lookcheck:bar-end]

// Picking a shape arms placement: the next click on the board drops it there
// (default size), and a drag draws the exact box it should fill. Esc cancels.
window.wpPlace = null;
// Lighting (L2): the effects panel's Light source — placed like a shape (click, or drag to size it), lighting the fog bright to 5 yd and dim to
// 10 yd until its Properties say otherwise. Refused past the map's light-source cap
window.wpArmLight = function() {
    var map = getActiveMap(), C = window.wpFogCore; if (!map || !C) return;
    if (window.wpFog && window.wpFog.lightCount && window.wpFog.lightCount(map) >= C.LIMITS.lights) { toast('This map already has the most light sources it can hold (' + C.LIMITS.lights + ').'); return; }
    armPlacement('light', { w: 40, h: 40, color: 'transparent', name: 'Light source', light: { bright: 5, dim: 10 } }, 'light source');
};
function armPlacement(type, props, label) {
    // Placement is a mode of its own: leave draw / erase / measure / pan first
    var mv = document.getElementById('moveModeBtn');
    if (mv && (!mv.classList.contains('active') || window.isMeasureMode)) mv.click();   // a sheet Throw armed while Select is in hand leaves the bar on Select and the map measuring: Select is pressed all the same, which puts the Throw down (the review of 2026-10-09: the click meant to place a shape threw it)
    window.wpPlace = { type: type, props: props };
    document.getElementById('shapeMenu').classList.remove('show');
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    // The tool that armed placement stays lit until the shape lands or Esc
    ['shapeTextBtn', 'shapeMenuBtn'].forEach(function(id) { var b = document.getElementById(id); if (b) b.classList.toggle('active', id === (type === 'text' ? 'shapeTextBtn' : 'shapeMenuBtn')); });
    toast(type === 'text' ? 'Click the board to place a text box (drag to size it), or click an existing text box to edit it. Esc cancels.' : 'Click the board to place the ' + label + ', or drag to size it. Esc cancels.');
}
function disarmPlacement() {
    window.wpPlace = null;
    if (wbWrap) wbWrap.style.cursor = '';
    document.body.classList.remove('placing');
    ['shapeTextBtn', 'shapeMenuBtn'].forEach(function(id) { var b = document.getElementById(id); if (b) b.classList.remove('active'); });
}
// New-shape sizing: "free" = default size on click, exact box on drag (any shape,
// hexagons included); "cell" = every shape arrives the size of one grid cell
// and seats into it. Local preference.
function shapeSizeMode() {
    try { return localStorage.getItem('wp_shapeSize') === 'cell' ? 'cell' : 'free'; } catch (e) { return 'free'; }
}
function syncShapeSizeButtons() {
    var mode = shapeSizeMode();
    document.querySelectorAll('.shape-size-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.shapesize === mode); });
}
document.querySelectorAll('.shape-size-btn').forEach(function(b) {
    b.addEventListener('click', function(e) {
        e.stopPropagation();
        try { localStorage.setItem('wp_shapeSize', this.dataset.shapesize); } catch (err) {}
        syncShapeSizeButtons();
        toast(this.dataset.shapesize === 'cell' ? 'New shapes arrive one grid cell in size.' : 'New shapes are free-sized — click for the default, drag for an exact box.');
    });
});
syncShapeSizeButtons();

// [lookcheck:textstandin-start]
// 144 (c): a new text box holds these words until something is typed in it. Entered while it still holds them (the box placed, a double-click,
// the text tool), the box has them all selected, so what is typed takes their place: the caret stood before them, and typing went in front
var TEXT_STANDIN = 'Double click to edit text';
function textStandInPick(el, doc, win) {
    if (!el || String(el.textContent == null ? '' : el.textContent).trim() !== TEXT_STANDIN) return false;
    try { var rg = doc.createRange(); rg.selectNodeContents(el); var sl = win.getSelection(); sl.removeAllRanges(); sl.addRange(rg); return true; } catch (e) { return false; }
}
// [lookcheck:textstandin-end]
// The text tool on an existing text box edits it in place (datamap.js hit-tests the click)
window.wpPlaceDisarm = disarmPlacement;
window.wpEditTextBox = function(id) {
    if (!state.wbEls[id]) return false;
    state.selWbId = id; state.selWbIds = [id]; render();
    var el = state.wbEls[id]; if (!el) return false;
    el.contentEditable = 'true'; el.classList.add('editing'); el.style.cursor = 'text'; el.focus();
    if (textStandInPick(el, document, window)) return true;   // the stand-in words, selected whole
    try { var rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (e) {}   // caret at the end
    return true;
};
window.wpPlaceCommit = function(px, py, pw, ph, sx, sy) {
    var P = window.wpPlace;
    disarmPlacement();
    if (!P) return;
    if (P.build) { wpBuildCommit(P, px, py, pw, ph, sx, sy); return; }   // the map builder: a built piece lands by its own rules (on the lattice, a hexagon a cell) and Build stays in hand
    var props = Object.assign({}, P.props);
    var dragged = pw > 12 && ph > 12;
    var type = P.type;
    var isHexItem = (type === 'hexagon' || props.shape === 'hexagon');
    var cell = shapeSizeMode() === 'cell' && type !== 'text';
    var hexGrid = state.gridType === 'hex';
    if (cell) { props.w = hexGrid ? 60 : 50; props.h = hexGrid ? 52 : 50; }
    else if (dragged) { props.w = Math.round(pw); props.h = Math.round(ph); }
    var x = (dragged && !cell) ? px : sx - (props.w || 100) / 2;
    var y = (dragged && !cell) ? py : sy - (props.h || 100) / 2;
    addWbItemAt(type, props, x, y);
    if (cell) {
        // Cell-sized shapes always seat into a cell, whether or not Snap is on
        var ci = getActiveMap().whiteboard.find(function(i) { return i.id === state.selWbId; });
        if (ci && hexGrid) {
            var hc = snapToHex(ci.x + ci.w / 2, ci.y + ci.h / 2, 30, 'center');
            ci.x = hc.x - ci.w / 2; ci.y = hc.y - ci.h / 2; save(); render();
        } else if (ci && state.gridType === 'square') {
            ci.x = Math.round(ci.x / 50) * 50; ci.y = Math.round(ci.y / 50) * 50; save(); render();
        }
    } else if (isHexItem && hexGrid && !dragged) snapNewHexItem();
    if (type === 'trigger') toast(isHexItem ? 'Hex trigger added — it fills one grid cell; write its Event Message in Properties.' : 'Trigger zone added — write its Event Message in the Properties panel.');
    if (type === 'text') {
        var el = state.wbEls[state.selWbId];
        if (el && el.classList.contains('text')) { try { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); } catch(_) {} }
    }
};
function addWbItemAt(type, props, x, y) {
    var item = Object.assign({
        id: 'wb'+uid(), type: type,
        x: Math.max(10, Math.round(x)), y: Math.max(10, Math.round(y)),
        w: 100, h: 100, z: 10, color: 'var(--panel2)'
    }, newOpacityProps(), props);
    getActiveMap().whiteboard.push(item);
    state.selWbId = item.id; state.selWbIds = [];
    save(); render();
}
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && window.wpPlace && !window.wpPlace.build && (!window.wpEsc || window.wpEsc.free(e))) { disarmPlacement(); toast('Placement cancelled.'); }   // a placement that is Build's own is Build's to end (buildKey)
});
// [buildcheck:buildtool-start]
// The map builder (fold B1c, backlog 23): the Build tool, the GM's alone. A tool with options, wired like every other (wireTool): its icon
// takes it, its small arrow opens its options, and it stays in hand until Esc or another tool. A built piece is an ordinary board item with
// today's keys (buildcore pieceProps) and one more, texture. On a square grid it lands on the lattice whatever Snap says, on a hex grid one
// hexagon a cell, and with no grid as Snap says. A Wall line is drawn by the pen under Build's preset (window.wpPenPreset): Build stays the
// tool in hand while the pen's own code draws the line. The options are the sheet the owner passed on 2026-10-10: materials by name, a row
// each, the shapes as one row of chips, then Texture and Color, and only for Water its Difficult terrain tick, only for a Corridor its width.
var BUILD_MAX = 6000;   // a map's copy holds this many pieces for players (net.js): a gesture past it lays nothing more
var BUILD_SHAPES = ['rect', 'circle', 'poly', 'corridor', 'line'];
var BUILD_LINES = { floor: 'Flagstones. Tokens walk on it.', wall: 'Blocks sight and gives cover.', door: 'A wall that opens. Players can open it.', water: 'Difficult terrain, counted double.', rubble: 'Gives cover. Tokens can cross it.', wood: 'Planks.', grass: '', street: 'Cobbles. Tokens walk on it.', building: 'A roof. Blocks sight and stops tokens.', citywall: 'Stone. Blocks sight and stops tokens.' };
var BUILD_SHAPE_LINES = { rect: 'Click a cell, or drag an area.', circle: 'Click a cell, or drag an area. The circle fills its box.', poly: 'Click each corner. Click the first again to close it.', corridor: 'Drag along it.', line: 'Draw along the grid lines. The line is the wall.' };
var _build = { mat: 'floor', shape: 'rect', tex: 'flagstones', pic: '', tile: 1, color: '#5a5663', terrain: 0, corridorW: 1, walls: false, poly: null, polyEl: null, pen: false, loaded: false };
function buildCore() { return window.wpBuildCore || null; }
function buildGrid() { var C = window.wpFogCore; if (!C) return null; return state.gridType === 'hex' ? C.hexGrid(30, 52) : state.gridType === 'square' ? C.squareGrid(50) : null; }   // the lattice the fill tool's cellSnap reads
function buildHex6(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null; }
function buildMay() { return !playerScreen() && !!(window.wpCanPersistLocal && window.wpCanPersistLocal()); }   // the GM's own campaign on the GM's own screen
function buildHere() { var m = getActiveMap(); return !!m && m.type === 'map' && state.viewMode === 'visual'; }   // the play map is on screen: Build lays on a map and on nothing else
function buildMapKey() { var c = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null, m = getActiveMap(); return (c && c.id ? c.id : '') + '|' + (m && m.id ? m.id : ''); }
function buildAsking() { var q = document.getElementById('customConfirm'), p = document.getElementById('customPrompt'), lib = document.getElementById('imgLibModal'); return !!((q && q.style.display === 'flex') || (p && p.style.display === 'flex') || (lib && lib.style.display === 'flex')); }   // a question or a prompt of the app's own is up, or the Image Library, which Build's own Texture list opens
// A polygon under way belongs to the map it was begun on. With another map on screen it is dropped: its corners are that map's. A look at the
// same map's data map loses nothing: Build's keys and its commit ask the view themselves (buildHere)
function buildPolyHere() {
    if (!_build.poly) return true;
    if (_build.polyMap === buildMapKey()) return true;
    buildPolyEnd();
    return false;
}
// A dragged box on a hex grid: the press cell, the cells whose centre the box holds, the release cell, each once and 400 at most
function buildHexBox(BC, C, grid, px, py, pw, ph, sx, sy, mx, my) {
    var box = BC.hexCellsInBox(grid, px, py, pw, ph, 400), list = [C.cellOf(sx, sy, grid)].concat(box && box.cells ? box.cells : [], [C.cellOf(mx, my, grid)]), seen = Object.create(null), out = [];
    for (var i = 0; i < list.length; i++) { var k = C.cellKey(list[i], grid); if (seen[k]) continue; seen[k] = 1; out.push(list[i]); }
    return { cells: out.slice(0, 400), more: !!(box && box.more) || out.length > 400 };
}
function buildLoad() {   // the options' last choices, kept on this computer, each read back through its own cleaner
    var BC = buildCore(), FC = window.wpFogCore; if (!BC || _build.loaded) return;
    _build.loaded = true;
    try {
        var v = JSON.parse(localStorage.getItem('wp_build') || 'null'); if (!v || typeof v !== 'object') return;
        var mat = BC.cleanMaterial(v.mat), M = mat ? BC.MATERIALS[mat] : null; if (!M) return;
        _build.mat = mat; _build.shape = BUILD_SHAPES.indexOf(v.shape) >= 0 ? v.shape : 'rect';
        if (_build.shape === 'line' && mat !== 'wall' && mat !== 'door') _build.shape = 'rect';
        _build.tex = v.tex === '' ? '' : (BC.cleanTexture(v.tex) || M.texture); _build.color = buildHex6(v.color) || M.color;
        _build.pic = (FC && typeof FC.cleanTexSrc === 'function' ? FC.cleanTexSrc(v.pic) : null) || ''; _build.tile = (FC && typeof FC.cleanTexTile === 'function' ? FC.cleanTexTile(v.tile) : null) || 1;   // fold B3: a picture as the fill, and its repeat
        _build.terrain = mat === 'water' ? ((FC && FC.cleanTerrain ? FC.cleanTerrain(v.terrain) : null) || 0) : 0; _build.corridorW = v.corridorW === 2 ? 2 : 1; _build.walls = v.walls === true;
    } catch (e) {}
}
function buildSave() { try { var kept = { mat: _build.mat, shape: _build.shape, tex: _build.tex, color: _build.color, terrain: _build.terrain, corridorW: _build.corridorW }; if (_build.walls === true) kept.walls = true; if (_build.pic) { kept.pic = _build.pic; kept.tile = _build.tile; } localStorage.setItem('wp_build', JSON.stringify(kept)); } catch (e) {} }   // With walls is kept only while it is ticked, a picture and its repeat only while one is the fill
function buildMaterial(mat) {   // a material brings its own texture, colour and terrain; a Wall or a Door is a thin line by default (the owner's answer of 2026-10-01)
    var BC = buildCore(), id = BC ? BC.cleanMaterial(mat) : null, M = id ? BC.MATERIALS[id] : null; if (!M) return false;
    _build.mat = id; _build.tex = M.texture; _build.pic = ''; _build.color = M.color; _build.terrain = M.terrain || 0;   // its own pattern takes a picture's place
    _build.shape = (id === 'wall' || id === 'door') ? 'line' : (_build.shape === 'line' ? 'rect' : _build.shape);
    return true;
}
function buildShape(shape) {   // a Wall line is a wall's or a door's: picked with another material in hand, it takes Wall
    if (BUILD_SHAPES.indexOf(shape) < 0) return false;
    if (shape === 'line' && _build.mat !== 'wall' && _build.mat !== 'door') { if (!buildMaterial('wall')) return false; }
    _build.shape = shape;
    return true;
}
function buildProps() {   // the props of the piece about to be laid (buildcore pieceProps: a fresh bag by whitelist, never a type, a place or a flag of another kind)
    var BC = buildCore(); if (!BC) return null;
    return BC.pieceProps(_build.mat, { texture: _build.tex, texSrc: _build.pic || undefined, texTile: _build.tile, color: _build.color, terrain: _build.mat === 'water' ? (_build.terrain || 0) : undefined });
}
// Arm the board for the next piece: for a Wall line the pen under Build's preset, for every other shape a placement that is Build's own
// (never armPlacement, which takes Select and speaks). Build is still the tool in hand either way
function buildArm() {
    var BC = buildCore(); if (!BC || !window.isBuildMode) return false;
    if (_build.shape !== 'poly') buildPolyEnd();
    if (_build.shape === 'line') {
        if (window.wpPlace) disarmPlacement();
        window.wpPenPreset = BC.penPreset(_build.mat === 'door' ? 'door' : 'wall', { color: _build.color });
        window.isDrawingMode = true; _build.pen = true;
        if (wbWrap) wbWrap.style.cursor = 'crosshair';
        return !!window.wpPenPreset;
    }
    window.wpPenPreset = null;
    if (_build.pen) { _build.pen = false; window.isDrawingMode = false; }
    var props = buildProps(); if (!props) return false;
    var rec = { mat: _build.mat, shape: _build.shape, corridorW: _build.corridorW }; if (_build.walls === true && _build.shape === 'corridor') rec.walls = true;   // a corridor laid With walls
    window.wpPlace = { type: 'build', props: props, build: rec };
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    return true;
}
// Another tool is in hand (updateWbToolbar asks): what Build armed is put down. The pen keeps drawing only where the pen itself was taken
function buildDown(activeId) {
    window.wpPenPreset = null; buildPolyEnd();
    if (_build.pen) { _build.pen = false; if (activeId !== 'drawModeBtn') window.isDrawingMode = false; }
    if (window.wpPlace && window.wpPlace.build) disarmPlacement();
}
function buildTake() {
    if (!buildMay() || !buildCore()) return;
    buildLoad();
    window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
    if (window.wpPlace) disarmPlacement();
    updateWbToolbar('buildModeBtn'); closeDrawMenu();
    state.selWbId = null; state.selWbIds = []; render();
    buildArm();
}
// The options from the choices. The material rows are made once, by name: a swatch of the material's own tile, its name, one grey line
function buildSync() {
    var BC = buildCore(), FC = window.wpFogCore; if (!BC) return;
    buildLoad();
    var box = document.getElementById('buildMatRows');
    if (box && !box.firstChild) BC.MATERIAL_IDS.forEach(function(id) {
        var M = BC.MATERIALS[id], b = document.createElement('button'); b.type = 'button'; b.className = 'wb-tool-btn menu-row build-mat'; b.dataset.buildmat = id; b.title = M.name;
        var ic = document.createElement('span'), sw = document.createElement('span'), ts = BC.texStyle(M.texture, 0, 0);
        ic.className = 'mr-ico'; sw.className = 'build-tile'; sw.style.backgroundColor = M.color; if (ts) { sw.style.backgroundImage = ts.image; sw.style.backgroundSize = ts.size; }
        ic.appendChild(sw); b.appendChild(ic);
        var tx = document.createElement('span'); tx.className = 'mr-txt'; tx.appendChild(document.createTextNode(M.name));
        if (BUILD_LINES[id]) { var sm = document.createElement('small'); sm.textContent = BUILD_LINES[id]; tx.appendChild(sm); }
        b.appendChild(tx);
        b.addEventListener('click', function(ev) { ev.stopPropagation(); buildPick(function() { return buildMaterial(id); }); });
        box.appendChild(b);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#buildMatRows .build-mat'), function(b) { b.classList.toggle('on', b.dataset.buildmat === _build.mat); });
    Array.prototype.forEach.call(document.querySelectorAll('#buildShapeRow .build-shape-btn'), function(b) { b.classList.toggle('active', b.dataset.buildshape === _build.shape); });
    var ln = document.getElementById('buildShapeLine'); if (ln) ln.textContent = BUILD_SHAPE_LINES[_build.shape] || '';
    var ts2 = document.getElementById('buildTexture'); if (ts2) { texOptionsInto(ts2, _build.tex, _build.pic); ts2.disabled = _build.shape === 'line'; }   // a line is a stroke: it wears no texture
    if (typeof tileRowSync === 'function') tileRowSync('buildTileRow', 'buildTileLine', _build.pic, _build.tile, _build.shape === 'line');   // fold B3: the Tile size chips, while a picture is the fill
    var hit = false;
    Array.prototype.forEach.call(document.querySelectorAll('#buildColorRow .build-sw'), function(sw2) { var on = String(sw2.dataset.color || '').toLowerCase() === String(_build.color || '').toLowerCase(); if (on) hit = true; sw2.classList.toggle('active', on); });
    var cs = document.querySelector('#buildColorRow .draw-swatch.custom'); if (cs) { cs.classList.toggle('active', !hit); cs.style.background = hit ? '' : (buildHex6(_build.color) || ''); }
    var ci = document.getElementById('buildColorInput'); if (ci && buildHex6(_build.color)) ci.value = _build.color;
    var tr = document.getElementById('buildTerrainRow'), tc = document.getElementById('buildTerrainChk'), tn = document.getElementById('buildTerrainCost'), tv = FC && FC.cleanTerrain ? FC.cleanTerrain(_build.terrain) : null;
    if (tr) tr.hidden = _build.mat !== 'water';
    if (tc) tc.checked = !!tv;
    if (tn) { if (tv) tn.value = tv; tn.disabled = !tv; }
    var cr = document.getElementById('buildCorridorRow'), cw = document.getElementById('buildCorridorW');
    if (cr) cr.hidden = _build.shape !== 'corridor';
    if (cw) cw.value = String(_build.corridorW);
    var cwl = document.getElementById('buildCorridorWalls'), cln = document.getElementById('buildCorridorLine');
    if (cwl) cwl.checked = _build.walls === true;
    if (cln) cln.hidden = _build.shape !== 'corridor';
}
function buildPick(change) {   // a choice in the options: kept, shown, and the board armed for it while Build is in hand
    if (change() === false) return;
    buildSave(); buildSync();
    if (window.isBuildMode) buildArm();
}
// Laying: wpPlaceCommit hands a built piece here. The lattice maths is buildcore's (snapBox, hexCellsInBox, hexCellBox, corridor, snapVertex,
// polyItem, seatedAt), so a later generator lays pieces through the very same functions
function wpBuildCommit(P, px, py, pw, ph, sx, sy) {
    var B = P.build, BC = buildCore(), C = window.wpFogCore, map = getActiveMap();
    if (!B || !window.isBuildMode) return;
    var ae = document.activeElement; if (ae && ae.closest && ae.closest('#buildMenu') && ae.blur) ae.blur();   // the pointer is back on the map, and the board keeps a click from moving the focus: the options' fields give the keys back
    if (window.wpPlace && window.wpPlace.build) { P = window.wpPlace; B = P.build; }   // a box left half typed took its change at that blur and armed again: this lay is made with what the options now say
    if (!BC || !C || !map || !buildMay() || !buildHere()) { var mvB = document.getElementById('moveModeBtn'); if (mvB) mvB.click(); return; }   // Build cannot lay here (someone else's table, a page): the tool is put away, never left lit and dead
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
    var grid = buildGrid(), dragged = pw > 12 || ph > 12, thin = dragged && Math.min(pw, ph) <= 12,   // either way past 12 px is a drag; thin: along one row or one column
         mx = Math.max(0, Math.abs(sx - px) < 0.5 ? px + pw : px), my = Math.max(0, Math.abs(sy - py) < 0.5 ? py + ph : py),   // the release, held to the board: nothing is laid past its top or left edge
         x0 = Math.min(sx, mx), y0 = Math.min(sy, my), dw = Math.abs(mx - sx), dh = Math.abs(my - sy);
    if (B.shape === 'poly') { buildPolyAdd(sx, sy, grid); buildArm(); return; }
    var boxes = [], more = false;
    if (grid && grid.type === 'hex') {   // cell by cell (the owner's answer): one hexagon a cell, so the area is exact
        var hc = (B.shape === 'corridor' || thin) ? BC.corridor(grid, sx, sy, mx, my, B.shape === 'corridor' ? B.corridorW : 1) : dragged ? buildHexBox(BC, C, grid, x0, y0, dw, dh, sx, sy, mx, my) : { cells: [C.cellOf(sx, sy, grid)], more: false };   // a thin drag is the cells its line passes
        if (hc && hc.cells) { more = hc.more === true; hc.cells.forEach(function(c) { var hb = BC.hexCellBox(grid, c); if (hb) boxes.push(Object.assign({ type: 'hexagon' }, hb)); }); }
    } else if (grid) {   // the square lattice: a click one cell, a drag the cells it covers, a corridor a strip of whole cells
        var bx = B.shape === 'corridor' ? BC.corridor(grid, sx, sy, mx, my, B.corridorW) : BC.snapBox(grid, sx, sy, mx, my, dragged);
        if (bx) { if (bx.x < 0) { bx.w += bx.x; bx.x = 0; } if (bx.y < 0) { bx.h += bx.y; bx.y = 0; } }   // a two-wide corridor begun in the first row or column: only what is on the board
        if (bx && bx.w > 0 && bx.h > 0) boxes.push(Object.assign({ type: B.shape === 'circle' ? 'circle' : 'rect' }, bx));
    } else {   // no grid: a free box, on the 50 px dots while Snap is on, as the plain shapes seat
        var snap = !!(window.wpSnapOn && window.wpSnapOn()), r50 = function(v) { return snap ? Math.round(v / 50) * 50 : Math.round(v); };
        var free = (pw > 12 && ph > 12) || Math.max(pw, ph) >= 50;   // with no cells to land on, a slip of the hand during a click is still a click, as the plain shapes read it; a long thin drag is a strip
        var fb = B.shape === 'corridor' ? (Math.abs(mx - sx) >= Math.abs(my - sy) ? { x: Math.min(sx, mx), y: sy - 25, w: Math.abs(mx - sx), h: 50 } : { x: sx - 25, y: Math.min(sy, my), w: 50, h: Math.abs(my - sy) })
            : free ? { x: x0, y: y0, w: dw, h: dh } : { x: sx - 50, y: sy - 50, w: 100, h: 100 };
        boxes.push({ type: B.shape === 'circle' ? 'circle' : 'rect', x: Math.max(0, r50(fb.x)), y: Math.max(0, r50(fb.y)), w: Math.max(snap ? 50 : 10, r50(fb.w)), h: Math.max(snap ? 50 : 10, r50(fb.h)) });
    }
    var wallsToo = [];   // a corridor laid With walls (the owner: "Open ends"): a wall line along each long side, in the same save as its floor
    if (B.shape === 'corridor' && B.walls === true && boxes.length) {
        var preW = BC.penPreset('wall', {}), wl = [];
        if (grid) { var cwr = BC.corridorWalls(grid, sx, sy, mx, my, B.corridorW, { doors: map.whiteboard, have: map.whiteboard }); wl = cwr && !cwr.over ? (grid.type === 'hex' ? cwr.lines : cwr.lines.filter(function(L) { return L.x >= 0 && L.y >= 0; })) : []; }   // a square strip is cut to the board, and its walls with it; a hex corridor's cells are laid whole, so its walls are too
        else { var fbx = boxes[0], lvl = Math.abs(mx - sx) >= Math.abs(my - sy); wl = (lvl ? [[[fbx.x, fbx.y], [fbx.x + fbx.w, fbx.y]], [[fbx.x, fbx.y + fbx.h], [fbx.x + fbx.w, fbx.y + fbx.h]]] : [[[fbx.x, fbx.y], [fbx.x, fbx.y + fbx.h]], [[fbx.x + fbx.w, fbx.y], [fbx.x + fbx.w, fbx.y + fbx.h]]]).map(function(p2) { return BC.wallLine(p2); }).filter(Boolean); }
        if (preW) wallsToo = wl.map(function(L) { return buildWallItem(L, preW); });
    }
    buildLay(map, boxes, P.props, more, wallsToo);
    buildArm();
}
// One wall line as the item the pen's Wall line makes: a path with the line's box and points, then the preset's keys
function buildWallItem(L, pre) { return Object.assign({ id: 'wb' + uid(), type: 'path', x: L.x, y: L.y, w: L.w, h: L.h, baseW: L.baseW, baseH: L.baseH, z: 10, pts: L.pts }, newOpacityProps(), pre); }
// A door laid on a wall line cuts its doorway (the map builder, fold B5; the owner, 2026-10-10, by prompt: "The door cuts its doorway"). The
// wall lines the new door line lies along are cut where it lies (buildcore cutWalls), in the save that lays the door, so ONE Undo takes the
// door and the cut back together. A piece of a cut wall is the wall itself with new geometry and a new id: every other key of it stays (its
// colour, width, name, layer, height, cover), and it leaves its group, as a piece the eraser cuts does. All or none within what a map
// holds. Only on a map with a grid, where the pen rides the lattice: a free-hand stroke on a map with none could lie along a wall by
// accident. The GM's own campaign alone. Answers how many walls were cut
function doorCut(map, door) {
    var BC = window.wpBuildCore;
    if (!BC || typeof BC.cutWalls !== 'function' || !map || !Array.isArray(map.whiteboard) || !door || !buildMay() || !buildGrid()) return 0;
    var res = BC.cutWalls(map.whiteboard, door); if (!res || !res.n) return 0;
    var more = 0, at = {}, gone = {}, out = [];
    res.cuts.forEach(function(c) { more += c.lines.length - 1; at[c.at] = c; });
    if (map.whiteboard.length + more + 1 > BUILD_MAX) { toast('The wall under the door is not cut: this map holds too many pieces. Delete the wall there by hand.'); return 0; }
    map.whiteboard.forEach(function(w, i) {
        var c = at[i]; if (!c) { out.push(w); return; }
        gone[w.id] = 1;
        c.lines.forEach(function(L) {
            var p = Object.assign({}, w, { id: 'wb' + uid(), x: L.x, y: L.y, w: L.w, h: L.h, baseW: L.baseW, baseH: L.baseH, pts: L.pts }); delete p.groupId; delete p.rot;
            // a wall that was resized is drawn in its own box stretched, stroke and nib with it: a piece keeps that very stretch (its own box that much smaller, its points in it), so every stretch of it is drawn exactly as it was, whatever the nib and whatever corners it has. Its width stays the wall's own
            var FCc = window.wpFogCore, scW = FCc && typeof FCc.lineScale === 'function' ? FCc.lineScale(w) : null;
            if (scW && (scW[0] !== 1 || scW[1] !== 1) && Array.isArray(L.pts)) {
                var bwP = L.w / scW[0], bhP = L.h / scW[1];
                if (isFinite(bwP) && bwP > 0 && isFinite(bhP) && bhP > 0) { p.baseW = bwP; p.baseH = bhP; p.pts = L.pts.map(function(q) { return [q[0] / scW[0], q[1] / scW[1]]; }); }
            }
            out.push(p);
        });
    });
    map.whiteboard.length = 0; for (var k = 0; k < out.length; k++) map.whiteboard.push(out[k]);   // the same list, so whoever holds it holds the cut
    if (state.selWbId && gone[state.selWbId]) state.selWbId = null;   // a selected wall that is gone is no selection
    if (Array.isArray(state.selWbIds)) state.selWbIds = state.selWbIds.filter(function(id) { return !gone[id]; });
    toast(res.n === 1 ? 'The wall under the door is cut. One Undo takes the door and the cut back.' : 'The walls under the door are cut. One Undo takes the door and the cuts back.');
    return res.n;
}
window.wpDoorCut = doorCut;
// The boxes as pieces, ONE save for the gesture. A cell that already holds a plain piece of that shape takes the new props instead of a second
// piece (buildcore seatedAt: never a locked or turned piece, nor one with a purpose of its own)
function buildLay(map, boxes, props, more, walls) {
    var BC = buildCore(); if (!BC || !props) return;
    if (!boxes.length) { toast('Nothing to lay there.'); return; }
    var room = BUILD_MAX - map.whiteboard.length, laid = 0, wall = false, full = false, keys = ['color', 'layer', 'name', 'texture', 'texSrc', 'texTile', 'blocksSight', 'sightType', 'cover', 'terrain', 'secret', 'seenColor', 'seenTexture', 'seenWidth', 'seenOpacity', 'seenTip'];   // a piece laid again in place wears the new material and nothing of the old: a picture it wore goes with its pattern
    for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i], item = Object.assign({ id: 'wb' + uid(), type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, z: 10 }, newOpacityProps(), props);
        if (b.pts) { item.pts = b.pts; item.baseW = b.baseW; item.baseH = b.baseH; item.tip = 'fill'; }
        var at = b.pts ? -1 : BC.seatedAt(map.whiteboard, item);
        if (at >= 0) {
            var old = map.whiteboard[at], wasWall = old.blocksSight === true;
            keys.forEach(function(k) { if (props[k] !== undefined) old[k] = props[k]; else delete old[k]; });
            if (props.sightType !== 'door') { delete old.doorOpen; delete old.doorLock; }
            delete old.fill;   // a piece Build laid is no painted cell: the Fill tool leaves it alone
            if (wasWall || old.blocksSight) wall = true;
            laid++; continue;
        }
        if (room <= 0) { full = true; break; }
        room--; map.whiteboard.push(item); laid++; if (item.blocksSight) wall = true;
    }
    if (walls && walls.length) {   // a corridor's walls, all or none (a floor that found no room leaves none for them either)
        if (map.whiteboard.length + walls.length <= BUILD_MAX) { walls.forEach(function(wi) { map.whiteboard.push(wi); }); wall = true; } else full = true;
    }
    if (full) toast('This map holds as many pieces as it can carry to players, ' + BUILD_MAX + '. Nothing more was laid.');
    if (!laid) return;
    save(); render();
    if (wall && window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    if (more) toast('A drag lays at most 400 cells at a time. Drag again for the rest.');
}
// The polygon: each click a corner on the lattice (a square grid's crossings, a hex grid's corners, the 50 px dots or the point itself with no
// grid, as Snap says), a rubber band to the pointer, closed by a click on the first corner or by Enter. One filled region with the piece's props
function buildPolyAdd(sx, sy, grid) {
    var BC = buildCore(); if (!BC) return;
    var v = BC.snapVertex(grid, sx, sy, !!(window.wpSnapOn && window.wpSnapOn())); if (!v) return;
    buildPolyHere();   // corners begun on another map are dropped: this click starts anew
    if (!_build.poly) { _build.poly = []; _build.polyMap = buildMapKey(); }
    var P0 = _build.poly[0];
    if (P0 && Math.hypot(v.x - P0.x, v.y - P0.y) < 20) {   // a click on the first corner closes the shape, once it has three
        if (_build.poly.length >= 3) buildPolyClose(); else if (_build.poly.length > 1) toast('A polygon needs at least three corners.');
        return;
    }
    if (_build.poly.length >= 500) { toast('A polygon takes at most 500 corners.'); return; }
    var last = _build.poly[_build.poly.length - 1]; if (last && last.x === v.x && last.y === v.y) return;
    _build.poly.push(v); buildPolyDraw(null);
}
function buildPolyClose() {
    if (!buildPolyHere() || !buildHere()) { buildPolyEnd(); return; }
    var BC = buildCore(), map = getActiveMap(), verts = _build.poly || [];
    if (!BC || !map || verts.length < 3) { toast('A polygon needs at least three corners.'); return; }
    var it = BC.polyItem(verts.map(function(p) { return [p.x, p.y]; }));
    buildPolyEnd();
    if (!it) { toast('That shape covers nothing. Its corners lie in a line.'); return; }
    var props = buildProps(); if (!props || !buildMay()) return;
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
    buildLay(map, [{ type: 'path', x: it.x, y: it.y, w: it.w, h: it.h, pts: it.pts, baseW: it.baseW, baseH: it.baseH }], props, false);
}
function buildPolyDraw(cur) {   // the rubber band over the board: numbers only into attributes, every element made by name
    var verts = _build.poly || []; if (!verts.length) return;
    var el = _build.polyEl, NS = 'http://www.w3.org/2000/svg';
    if (!el) { el = document.createElement('div'); el.className = 'wb-build-poly'; el.appendChild(document.createElementNS(NS, 'svg')); if (wb) wb.appendChild(el); _build.polyEl = el; }
    var svg = el.firstChild; svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var pts = verts.map(function(p) { return Number(p.x) + ',' + Number(p.y); }); if (cur) pts.push(Number(cur.x) + ',' + Number(cur.y));
    var line = document.createElementNS(NS, 'polyline'); line.setAttribute('points', pts.join(' ')); line.setAttribute('class', 'wb-build-band'); svg.appendChild(line);
    verts.forEach(function(p, i) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', String(Number(p.x))); c.setAttribute('cy', String(Number(p.y))); c.setAttribute('r', i === 0 ? '7' : '4'); c.setAttribute('class', i === 0 ? 'wb-build-first' : 'wb-build-dot'); svg.appendChild(c); });
}
function buildPolyEnd() { _build.poly = null; _build.polyMap = null; if (_build.polyEl) { _build.polyEl.remove(); _build.polyEl = null; } }
// The keys while Build is in hand: Enter closes a polygon of three corners or more, Esc drops a polygon under way, else puts the tool away
function buildKey(e) {
    if (!window.isBuildMode || e.defaultPrevented) return;
    if (e.key === 'Escape' && window.wpEsc && !window.wpEsc.free(e)) return;   // 1.5.4: an Escape that closed something else (a window, a menu) is not Build's
    var t = e.target, typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable === true), own = typing && !!(t.closest && t.closest('#buildMenu'));
    if ((typing && !(own && e.key === 'Escape')) || buildAsking() || !buildHere()) return;   // a field's own keys, a question of the app's, another view: none of them Build's. Esc in a field of Build's own options still is
    if (e.key === 'Enter' && _build.poly && _build.poly.length >= 3 && buildPolyHere()) { e.preventDefault(); buildPolyClose(); buildArm(); }
    else if (e.key === 'Escape') {
        if (_build.poly && _build.poly.length && buildPolyHere()) { buildPolyEnd(); toast('Polygon dropped. Build is still in hand.'); }   // one that was another map's goes without a word
        else { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }
    }
}
function buildMove(e) {   // the rubber band follows the pointer to the corner the next click would take
    var BC = buildCore(); if (!BC || !_build.poly || !_build.poly.length || !wbWrap || !buildPolyHere()) return;
    var r = wbWrap.getBoundingClientRect(), z = state.zoomLevel || 1, x = (e.clientX - r.left + wbWrap.scrollLeft) / z, y = (e.clientY - r.top + wbWrap.scrollTop) / z;
    buildPolyDraw(BC.snapVertex(buildGrid(), x, y, !!(window.wpSnapOn && window.wpSnapOn())));
}
function buildWire() {   // the options' own controls, each once
    Array.prototype.forEach.call(document.querySelectorAll('#buildShapeRow .build-shape-btn'), function(b) { b.addEventListener('click', function(ev) { ev.stopPropagation(); var s = this.dataset.buildshape; buildPick(function() { return buildShape(s); }); }); });
    var tx = document.getElementById('buildTexture'); if (tx) tx.addEventListener('change', function() {
        var BC = buildCore(), v = this.value, name = function(t) { buildPick(function() { _build.pic = ''; _build.tex = t === '' ? '' : ((BC && BC.cleanTexture(t)) || _build.tex); }); };
        if (typeof texListPick !== 'function') { name(v); return; }
        texListPick(v, buildSync, function(p) { if (p.pic) buildPick(function() { _build.pic = p.pic; }); else name(p.tex); });   // fold B3: A picture opens the Image Library, and its pick is the fill
    });
    if (tx && typeof texListKeys === 'function') texListKeys(tx);
    if (typeof tileRowWire === 'function') tileRowWire('buildTileRow', function(t) { buildPick(function() { _build.tile = t; }); });
    Array.prototype.forEach.call(document.querySelectorAll('#buildColorRow .build-sw'), function(sw) { sw.addEventListener('click', function(ev) { ev.stopPropagation(); var c = buildHex6(this.dataset.color); buildPick(function() { if (!c) return false; _build.color = c; }); }); });
    var ci = document.getElementById('buildColorInput'); if (ci) ci.addEventListener('input', function() { var c = buildHex6(this.value); buildPick(function() { if (!c) return false; _build.color = c; }); });
    ['buildTerrainChk', 'buildTerrainCost'].forEach(function(id) { var e0 = document.getElementById(id); if (e0) e0.addEventListener('change', function() {
        var FC = window.wpFogCore, chk = document.getElementById('buildTerrainChk'), bx = document.getElementById('buildTerrainCost'), n = (bx && FC && FC.cleanTerrain ? FC.cleanTerrain(Number(bx.value)) : null) || 2;
        buildPick(function() { if (_build.mat !== 'water') return false; _build.terrain = chk && chk.checked ? n : 0; });
    }); });
    var cw = document.getElementById('buildCorridorW'); if (cw) cw.addEventListener('change', function() { var two = this.value === '2'; buildPick(function() { _build.corridorW = two ? 2 : 1; }); });
    var cwl = document.getElementById('buildCorridorWalls'); if (cwl) cwl.addEventListener('change', function() { var on = !!this.checked; buildPick(function() { _build.walls = on; }); });
    if (wbWrap) wbWrap.addEventListener('pointermove', buildMove);
    document.addEventListener('keydown', buildKey);
    wireTool({ id: 'buildModeBtn', chev: 'buildOptBtn', inHand: function() { return !!window.isBuildMode; }, sync: buildSync, take: buildTake });
}
// [buildcheck:buildtool-end]
buildWire();
// [buildcheck:wallsrow-start]
// Walls around selection (the map builder, fold B2b; the owner, 2026-10-10, by prompt: "Walls first", on the "Right-click menu"). One row on the
// GM's menu of a selection that holds floor pieces (buildcore floorOk). It lays ordinary Wall lines, the very items the Build tool's Wall line
// draws, along the outer edge of the cells the floors cover together (buildcore outlineWalls). Nothing is derived live: each line is a piece of
// its own afterwards. The row is the GM's alone, on the machine that owns the campaign (buildMay), never in the stream window; its markup holds
// fixed words and the Wall line's own drawing, and nothing of a piece
var WALLS_ROW = '<div class="menu-item cm-walls" title="Thin wall lines along the outer edge of the selected floors together. Where two of them touch there is no wall between them, and a doorway that holds a door stays open. Each line is an ordinary piece afterwards, and one Undo takes them all back.">'
    + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 18.5V8.5h13M3.5 18.5h4M18.5 6.5v4"/></svg><span>Walls around selection<small>Lays wall lines along the outer edge.</small></span></div>';
function wallsRow(items) {
    var BC = buildCore();
    if (!BC || typeof BC.outlineWalls !== 'function' || window.wpStream || !buildMay()) return null;
    var fl = (Array.isArray(items) ? items : []).filter(function(w) { return BC.floorOk(w); });
    return fl.length ? { items: fl, html: WALLS_ROW } : null;
}
// The walls laid on the map, all or none; what to say of it. A map with no grid takes the 50 px lattice Build seats its pieces on
function wallsLay(map, items) {
    var row = wallsRow(items), BC = buildCore(), FC = window.wpFogCore;
    if (!row || !FC || !map || map.type !== 'map' || !Array.isArray(map.whiteboard)) return '';
    var res = BC.outlineWalls(row.items, buildGrid() || FC.squareGrid(50), { doors: map.whiteboard, have: map.whiteboard }), pre = BC.penPreset('wall', {});
    if (res.over) return 'Those floors cover too much ground for walls at once. Select fewer pieces.';
    if (!res.lines.length || !pre) return res.had ? 'Those walls are already there.' : 'There is nothing to wall there.';
    if (map.whiteboard.length + res.lines.length > BUILD_MAX) return 'This map holds as many pieces as it can carry to players, ' + BUILD_MAX + '. No wall was laid.';
    res.lines.forEach(function(L) { map.whiteboard.push(buildWallItem(L, pre)); });
    return (res.lines.length === 1 ? 'One wall line laid.' : res.lines.length + ' wall lines laid.') + (res.doorsOver === true ? ' Some door lines were not read. Check the doorways.' : '');
}
// [buildcheck:wallsrow-end]
// [buildcheck:gendialog-start]
// The dungeon made for you (the map builder, fold B2; the owner's answers of 2026-10-10 on the two sheets: the dialog "As drawn", the
// Build it on row with "A new map picks its grid", "Taken to that map" afterwards, the command in "Build's options"). The last row of
// Build's options opens one dialog. Its settings go to the pure half (gencore.js), which answers geometry, and what is laid is ORDINARY
// pieces: floors with the Floor material's own props, wall lines and door lines as the pen's presets make them. Nothing on the map is
// changed and nothing is derived live. It is laid in one save, so one Undo takes it back. The seed and settings are kept on the map
// (meta.gen) for the GM alone, to make it again: net.js never sends them and an import cleans them. The dialog is the GM's (buildMay) and
// its markup is fixed words in the page: a map's name reaches the list as an option's text, never as markup
var GEN_LINES = { here: 'Its top left corner goes where the middle of your screen is. Nothing on the map is changed.', other: 'It lands in the middle of that map as you last saw it. You are taken there once it is made.', fresh: 'A new map is made for it. You are taken there once it is made.', none: 'This campaign has no other map.' };
var GEN_WHERE = ['here', 'other', 'fresh'];
var _gen = { where: 'here', maps: '' };
function genCore() { return window.wpGenCore || null; }
function genEl(id) { return document.getElementById(id); }
function genText(v, n) { return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n); }
function genShown() { var m = genEl('genModal'); return !!m && m.style.display === 'flex'; }
// The lattice a dungeon is laid on: a map's own hex or square grid, and the 50 px lattice Build seats its pieces on where it has none
function genKind(map) { var g = map && map.meta && typeof map.meta === 'object' ? map.meta.gridType : null; return g === 'hex' ? 'hex' : 'square'; }
function genGridFor(kind) { var C = window.wpFogCore; return !C ? null : kind === 'hex' ? C.hexGrid(30, 52) : C.squareGrid(50); }
// The campaign's maps other than the one on screen, by name: [{ id, title }]
function genMaps(camp, hereId) {
    var out = []; if (!camp || !camp.items || typeof camp.items !== 'object') return out;
    Object.keys(camp.items).forEach(function(id) {
        var it = camp.items[id]; if (!it || typeof it !== 'object' || it.type !== 'map' || it.id !== id || id === hereId) return;
        out.push({ id: id, title: genText(it.meta && typeof it.meta === 'object' ? it.meta.title : '', 80) || 'Untitled' });
    });
    out.sort(function(a, b) { return a.title.localeCompare(b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return out;
}
// Where a dungeon's top left corner goes: the middle of the view (`mid`, the screen's own, for the map on screen), else the middle of the
// map as it was last seen, else its home, moved so that the whole dungeon and a cell to spare stay on the board
function genCorner(map, mid, grid, cols, rows) {
    var meta = map && map.meta && typeof map.meta === 'object' ? map.meta : {}, num = function(v) { return typeof v === 'number' && isFinite(v); };
    var x = mid && num(mid.x) ? mid.x : num(meta.lastWbX) ? meta.lastWbX : num(meta.homeX) ? meta.homeX : 15000, y = mid && num(mid.y) ? mid.y : num(meta.lastWbY) ? meta.lastWbY : num(meta.homeY) ? meta.homeY : 15000;
    var hex = grid.type === 'hex', w = hex ? (cols + 1) * 1.5 * grid.s + grid.s : (cols + 1) * grid.size, h = hex ? (rows + 2) * grid.h : (rows + 1) * grid.size;
    return { x: Math.max(0, Math.min(30000 - w, x)), y: Math.max(0, Math.min(30000 - h, y)) };
}
function genCountWords(n, held) { return 'This would lay ' + n + ' pieces. The map holds ' + BUILD_MAX + '.' + (held + n > BUILD_MAX ? ' It has ' + held + ' already, so this does not fit.' : ''); }
function genNewSeed() { var GC = genCore(); return GC ? GC.seedOf(Math.floor(Math.random() * 320000)) : '0000-fox'; }
// The form as the generator's settings, and the settings into the form
function genForm() {
    var GC = genCore(); if (!GC) return null;
    var val = function(id) { var e = genEl(id); return e ? String(e.value) : ''; }, num = function(id, d) { var s = val(id).trim(), v = Number(s); return s !== '' && isFinite(v) ? v : d; };
    return GC.cleanGen({ seed: val('genSeed').trim(), w: num('genW', GC.SIZE.w), h: num('genH', GC.SIZE.h), rooms: val('genRooms'), corr: val('genCorr'), doors: val('genDoors') });
}
// The two Size boxes written as the sizes that will be used (10 to 60, whole). True when a box read otherwise: what was laid would not
// have been what the box showed
function genSizes() {
    var o = genForm(), w = genEl('genW'), h = genEl('genH'), moved = false; if (!o) return false;
    if (w && String(w.value) !== String(o.w)) { w.value = String(o.w); moved = true; }
    if (h && String(h.value) !== String(o.h)) { h.value = String(o.h); moved = true; }
    return moved;
}
function genFill(o) {
    var set = function(id, v) { var e = genEl(id); if (e) e.value = String(v); };
    set('genSeed', o.seed); set('genW', o.w); set('genH', o.h); set('genRooms', o.rooms); set('genCorr', o.corr); set('genDoors', o.doors);
}
// What Generate would do now: { ok, say } and, where it can be laid, { map (null for a new one), fresh, kind, opts, pieces }
function genPlan() {
    var GC = genCore(), BC = buildCore(), camp = getActiveCampaign(), here = getActiveMap(), no = { ok: false, say: 'A dungeon cannot be built here.' };
    if (!GC || !BC || !camp || !camp.items || !here || here.type !== 'map' || !buildMay() || !buildHere()) return no;
    var seedBox = genEl('genSeed'), typed = seedBox ? String(seedBox.value).trim() : '', opts = genForm();
    if (!opts || opts.seed !== typed) return { ok: false, say: 'A seed is letters, digits and hyphens, 24 at most.' };
    var where = GEN_WHERE.indexOf(_gen.where) >= 0 ? _gen.where : 'here', map = here, fresh = where === 'fresh', kind;
    if (where === 'other') {
        var sel = genEl('genMap'), id = sel ? String(sel.value) : '';
        map = id && id !== here.id && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
        if (!map) return { ok: false, say: GEN_LINES.none };
    }
    if (fresh) { var gs = genEl('genGrid'); kind = gs && gs.value === 'hex' ? 'hex' : 'square'; map = null; } else kind = genKind(map);
    var grid = genGridFor(kind); if (!grid) return no;
    var dg = GC.genDungeon(opts), at = genCorner(map, where === 'here' ? viewCentre() : null, grid, dg.cols, dg.rows), pc = GC.dungeonPieces(dg, grid, at.x, at.y);
    if (!pc.floors.length || !pc.walls.length) return { ok: false, say: 'That dungeon could not be laid out. Try another seed.' };
    var held = map && Array.isArray(map.whiteboard) ? map.whiteboard.length : 0;
    if (held + pc.count > BUILD_MAX) return { ok: false, say: genCountWords(pc.count, held) };
    return { ok: true, say: genCountWords(pc.count, held), map: map, fresh: fresh, kind: kind, opts: opts, pieces: pc };
}
// The dungeon's pieces as ordinary items: the very items the Build tool lays for a Floor and draws for a Wall line and a Door line
function genItems(pc) {
    var BC = buildCore(), fp = BC ? BC.pieceProps('floor', {}) : null, wp = BC ? BC.penPreset('wall', {}) : null, dp = BC ? BC.penPreset('door', {}) : null, out = [];
    if (!fp || !wp || !dp) return out;
    pc.floors.forEach(function(b) { out.push(Object.assign({ id: 'wb' + uid(), type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, z: 10 }, newOpacityProps(), fp)); });
    pc.walls.forEach(function(L) { out.push(buildWallItem(L, wp)); });
    pc.doors.forEach(function(L) { out.push(buildWallItem(L, dp)); });
    return out;
}
// The other maps as the list's options, made again only when the list changed, so a pick stands: elements with text, never markup
function genMapsFill() {
    var sel = genEl('genMap'), camp = getActiveCampaign(), here = getActiveMap(); if (!sel) return 0;
    var list = genMaps(camp, here ? here.id : ''), sig = JSON.stringify(list);
    if (sig === _gen.maps) return list.length;
    var was = String(sel.value || '');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    list.forEach(function(m) { var o = document.createElement('option'); o.value = m.id; o.appendChild(document.createTextNode(m.title)); sel.appendChild(o); });
    sel.value = list.some(function(m) { return m.id === was; }) ? was : (list[0] ? list[0].id : '');
    _gen.maps = sig;
    return list.length;
}
// The dialog as it stands: the chip in use, the row its choice needs, the line that says where it lands, the count, and Generate put out
// of use with the reason in sight where the dungeon cannot be laid
function genSync() {
    if (!genShown()) return;
    var where = GEN_WHERE.indexOf(_gen.where) >= 0 ? _gen.where : 'here';
    Array.prototype.forEach.call(document.querySelectorAll('#genWhere .gen-chip'), function(b) { var on = b.dataset.where === where; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var mr = genEl('genMapRow'), nr = genEl('genNameRow'), ln = genEl('genWhereLine'), ct = genEl('genCount'), go = genEl('genGo');
    if (mr) mr.hidden = where !== 'other';
    if (nr) nr.hidden = where !== 'fresh';
    var others = where === 'other' ? genMapsFill() : 1;
    if (ln) ln.textContent = where === 'other' && !others ? GEN_LINES.none : GEN_LINES[where];
    var plan = genPlan();
    if (ct) ct.textContent = plan.say;
    if (go) go.disabled = !plan.ok;
}
function genShow() {
    var m = genEl('genModal'), GC = genCore(), here = getActiveMap(); if (!m || !GC || !buildCore() || !buildMay() || !buildHere() || !here) return false;
    var kept = here.meta && typeof here.meta === 'object' && here.meta.gen && typeof here.meta.gen === 'object' ? GC.cleanGen(here.meta.gen) : null;
    if (kept) genFill(kept); else { var sb = genEl('genSeed'); if (sb) sb.value = genNewSeed(); }   // a map that keeps its dungeon's seed shows it, to make it again; else a new seed each time
    var nm = genEl('genName'); if (nm) nm.value = 'Dungeon';
    _gen.where = 'here'; _gen.maps = '';
    m.style.display = 'flex';
    genSync();
    var first = document.querySelector('#genWhere .gen-chip.on'); if (first && first.focus) first.focus();
    return true;
}
function genHide() { var m = genEl('genModal'); if (!m || m.style.display === 'none') return; m.style.display = 'none'; var b = genEl('buildGenBtn'); if (b && b.focus) b.focus(); }
// Before a dialog lays its pieces the run of typing in its own field ends: the app's history folds a save into the step before it while a
// text field's run is open on that map, and what is laid must be a step of its own, which one Undo takes back alone. In the usual flow
// the row takes the focus as the dialog goes; this holds where it cannot
function genUnfocus(modalId) { var m = genEl(modalId), a = document.activeElement; if (m && a && a !== document.body && typeof a.blur === 'function' && typeof m.contains === 'function' && m.contains(a)) a.blur(); }
// What Tab walks through, in the dialog's own order: never a row that is put away nor a control that is out of use
function genStops() {
    var out = Array.prototype.slice.call(document.querySelectorAll('#genWhere .gen-chip'));
    ['genMap', 'genName', 'genGrid', 'genW', 'genH', 'genRooms', 'genCorr', 'genDoors', 'genSeed', 'genSeedNew', 'genCancel', 'genGo'].forEach(function(id) {
        var e = genEl(id), row = id === 'genMap' ? genEl('genMapRow') : id === 'genName' || id === 'genGrid' ? genEl('genNameRow') : null;
        if (e && !e.disabled && !(row && row.hidden)) out.push(e);
    });
    return out;
}
// Tab goes round inside the dialog: past its last control to its first, and back. True when the focus was moved
function genTab(target, back) {
    var st = genStops(), at = st.indexOf(target); if (!st.length) return false;
    var to = back ? (at <= 0 ? st[st.length - 1] : null) : (at < 0 || at === st.length - 1 ? st[0] : null);
    if (!to || !to.focus) return false;
    to.focus(); return true;
}
// Generate: the dungeon laid as the dialog's count said. The GM is taken to the map first, on its play map: that draws and saves it as
// it stands, a new map empty, which is the state one Undo goes back to. Then the pieces are laid there in ONE save, so one Undo takes the
// dungeon back, and a new map stays
function genGo() {
    if (!genShown()) return false;   // only from the dialog as it stands: a second press finds it put away
    if (genSizes()) { genSync(); return false; }   // a size that was not as it will be used is shown first, with its count: the next press lays it
    var plan = genPlan(); if (!plan.ok) { genSync(); return false; }
    var camp = getActiveCampaign(), here = getActiveMap(), map = plan.map, nmBox = genEl('genName'), items = genItems(plan.pieces);
    if (!items.length) { toast('That dungeon could not be laid. Nothing was changed.'); return false; }
    if (plan.fresh) {
        map = createNewMap(getUniqueItemTitle(genText(nmBox ? nmBox.value : '', 80) || 'Dungeon', null));
        map.meta.gridType = plan.kind;
        camp.items[map.id] = map;
    }
    if (!map.meta || typeof map.meta !== 'object') map.meta = {};
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];   // before the map is drawn: a map from a file may have none
    genUnfocus('genModal'); genHide();
    if (map === here) save(true);
    else {
        map.meta.lastView = 'visual';
        if (!navigateToMap(map.id)) { if (plan.fresh) delete camp.items[map.id]; toast('That map could not be opened. Nothing was changed.'); return false; }
    }
    if (map.whiteboard.length + items.length > BUILD_MAX) { toast('That dungeon could not be laid. Nothing was changed.'); return false; }
    items.forEach(function(it) { map.whiteboard.push(it); });
    map.meta.gen = plan.opts;   // the GM's own, to make it again: never sent (net.js sanitizeItem), cleaned from a file (cleanup.js)
    save(true); render();
    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    toast('Dungeon laid, ' + items.length + ' pieces. One Undo takes it back.');
    return true;
}
function genWire() {
    var m = genEl('genModal'), row = genEl('buildGenBtn'); if (!m) return;
    if (row) row.addEventListener('click', function(ev) { ev.stopPropagation(); genShow(); });
    // the dialog hands the focus back to this row when it is put away: a key still held from the press that put it away presses nothing here
    if (row) row.addEventListener('keydown', function(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } });   // a held Escape would be Build's own next, and put the tool away
    Array.prototype.forEach.call(document.querySelectorAll('#genWhere .gen-chip'), function(b) { b.addEventListener('click', function() { var w = this.dataset.where; if (GEN_WHERE.indexOf(w) < 0) return; _gen.where = w; genSync(); }); });
    ['genMap', 'genGrid', 'genRooms', 'genCorr', 'genDoors'].forEach(function(id) { var e = genEl(id); if (e) e.addEventListener('change', genSync); });
    ['genW', 'genH'].forEach(function(id) { var e = genEl(id); if (!e) return; e.addEventListener('input', genSync); e.addEventListener('change', function() { genSizes(); genSync(); }); });   // a size left outside its bounds reads as the size that will be used
    var sb = genEl('genSeed'); if (sb) sb.addEventListener('input', genSync);
    var nw = genEl('genSeedNew'); if (nw) nw.addEventListener('click', function() { var s = genEl('genSeed'); if (s) s.value = genNewSeed(); genSync(); });
    var no = genEl('genCancel'); if (no) no.addEventListener('click', genHide);
    var go = genEl('genGo'); if (go) go.addEventListener('click', function() { genGo(); });
    // Escape is heard FIRST, at the window, and goes no further: a box of the page's own closes on Escape in a listener of the document's
    // (the dice roller), and one key must not put two boxes away. Never while a question or a prompt of the app's own is up over the dialog
    // The press that put the dialog away is the dialog's for as long as it is held: its repeats come after the dialog is down, and the
    // document's own listeners would hear them before the row does. Any new press, and Escape let go, end that
    var escHeld = false;
    if (typeof window.addEventListener === 'function') window.addEventListener('keydown', function(e) {
        if (e.repeat !== true) escHeld = false;
        else if (escHeld && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
        if (e.key !== 'Escape' || !genShown() || buildAsking()) return;
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
        e.preventDefault();
        if (e.repeat !== true) { genHide(); escHeld = true; }
    }, true);
    if (typeof window.addEventListener === 'function') window.addEventListener('keyup', function(e) { if (e.key === 'Escape') escHeld = false; }, true);
    // every key pressed in the dialog stays in it: the page reads keys as its own (Build's Esc and Enter, a token's arrows, Delete)
    m.addEventListener('keydown', function(e) {
        if (buildAsking()) return;   // a question or a prompt of the app's own, raised over the dialog, has every key: the focus may still rest in here
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); genHide(); }
        else if (e.key === 'Enter' && e.target && /^INPUT$/.test(e.target.tagName || '')) { e.preventDefault(); genGo(); }
        else if (e.key === 'Tab' && genTab(e.target, e.shiftKey === true)) e.preventDefault();
    });
    // A key pressed while the dialog is up with the focus outside it (after a press on its backdrop) is the dialog's too: the page would
    // read it as its own behind the dialog, undo the map or put Build away. Escape puts the dialog away, Tab brings the focus back in, and
    // any other key does nothing. Heard first (capture), and never while a question or a prompt of the app's own is up over the dialog
    document.addEventListener('keydown', function(e) {
        if (!genShown() || buildAsking() || (e.target && typeof m.contains === 'function' && m.contains(e.target))) return;
        e.stopPropagation(); e.preventDefault();
        if (e.key === 'Escape') genHide();
        else if (e.key === 'Tab') genTab(null, e.shiftKey === true);
    }, true);
    // A paste is the page's to read too (it lays a copied piece or a picture on the map behind): never while the dialog is up, but for a
    // field of the dialog's own, which takes its paste as any field does
    document.addEventListener('paste', function(e) {
        if (!genShown() || buildAsking()) return;
        var t = e.target; if (t && typeof m.contains === 'function' && m.contains(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName || '')) return;
        e.preventDefault(); e.stopPropagation();
    }, true);
}
// [buildcheck:gendialog-end]
genWire();
// [buildcheck:citydialog-start]
// The city made for you (the map builder, fold B6; the owner's answers of 2026-10-11 on the city sheet: a city map is for "Both, by a Size
// list", a building is "A block", the dialog "As drawn"; and on the row's sheet: the row's drawing "B. Wall and gate", a new map's grid
// "You pick in the dialog"). The row under Generate a dungeon opens one dialog. Its settings go to the pure half (citycore.js), which
// answers geometry, and what is laid is ORDINARY pieces, each dressed with a material's own props: a field as Grass, a street as Street,
// water as Water, a bridge as Wood floor, a house as Building under its own roof, a wall and a tower as City wall, and a town's wall as
// the pen's Wall line in the City wall's colour. Nothing on the map is changed and nothing is derived live. It is laid in one save, so
// one Undo takes it back. The seed and settings are kept on the map (meta.city) for the GM alone, to make it again: net.js never sends
// them and an import cleans them. The dialog is the GM's (buildMay) and its markup is fixed words in the page: a map's name reaches the
// list as an option's text, never as markup. It leans on the dungeon dialog's helpers (genEl, genText, genMaps, genCountWords, genNewSeed)
var CITY_LINES = { here: 'Its middle goes where the middle of your screen is. Nothing on the map is changed.', other: 'It lands in the middle of that map as you last saw it. You are taken there once it is made.', fresh: 'A new map is made for it. You are taken there once it is made.', none: 'This campaign has no other map.' };
var CITY_GRIDS = ['off', 'square', 'hex'], CITY_NAMES = { village: 'Village', town: 'Town', city: 'City' }, CITY_MATS = { field: 'grass', street: 'street', water: 'water', bridge: 'wood' }, CITY_WALL_PX = 8;
var _city = { where: 'here', maps: '', grid: '', named: false };
function cityCore() { return window.wpCityCore || null; }
function cityShown() { var m = genEl('cityModal'); return !!m && m.style.display === 'flex'; }
function cityWord(size) { return Object.prototype.hasOwnProperty.call(CITY_NAMES, size) ? CITY_NAMES[size] : CITY_NAMES.town; }
// The grid a new map starts with until the GM picks one in the dialog: square cells for a village, which is laid on them, and none for a
// town or a city, which are an overview
function cityGridFor(size) { return size === 'village' ? 'square' : 'off'; }
// The form as the generator's settings, and the settings into the form
function cityForm() {
    var CC = cityCore(); if (!CC) return null;
    var val = function(id) { var e = genEl(id); return e ? String(e.value) : ''; }, fl = genEl('cityFields');
    return CC.cleanCity({ seed: val('citySeed').trim(), size: val('citySize'), wall: val('cityWall'), water: val('cityWater'), roofs: val('cityRoofs'), fields: !fl || fl.checked !== false });
}
function cityFill(o) {
    var set = function(id, v) { var e = genEl(id); if (e) e.value = String(v); }, fl = genEl('cityFields');
    set('citySeed', o.seed); set('citySize', o.size); set('cityWall', o.wall); set('cityWater', o.water); set('cityRoofs', o.roofs); if (fl) fl.checked = o.fields !== false;
}
// Where a city's top left corner goes, so that its MIDDLE is the middle of the view (`mid`, the screen's own, for the map on screen), else
// of the map as it was last seen, else of its home. The whole city stays on the board, and a village sits on its lattice of cells
function cityCorner(map, mid, w, h, cell) {
    var meta = map && map.meta && typeof map.meta === 'object' ? map.meta : {}, num = function(v) { return typeof v === 'number' && isFinite(v); };
    var cx = mid && num(mid.x) ? mid.x : num(meta.lastWbX) ? meta.lastWbX : num(meta.homeX) ? meta.homeX : 15000, cy = mid && num(mid.y) ? mid.y : num(meta.lastWbY) ? meta.lastWbY : num(meta.homeY) ? meta.homeY : 15000;
    var fit = function(c, size) { var at = Math.max(0, Math.min(30000 - size, c - size / 2)); return cell > 0 ? Math.round(at / cell) * cell : Math.round(at); };
    return { x: fit(cx, w), y: fit(cy, h) };
}
// What Generate would do now: { ok, say } and, where it can be laid, { map (null for a new one), fresh, grid, opts, pieces }
function cityPlan() {
    var CC = cityCore(), BC = buildCore(), camp = getActiveCampaign(), here = getActiveMap(), no = { ok: false, say: 'A city cannot be built here.' };
    if (!CC || !BC || !camp || !camp.items || !here || here.type !== 'map' || !buildMay() || !buildHere()) return no;
    var seedBox = genEl('citySeed'), typed = seedBox ? String(seedBox.value).trim() : '', opts = cityForm();
    if (!opts || opts.seed !== typed) return { ok: false, say: 'A seed is letters, digits and hyphens, 24 at most.' };
    var where = GEN_WHERE.indexOf(_city.where) >= 0 ? _city.where : 'here', map = here, fresh = where === 'fresh', grid = '';
    if (where === 'other') {
        var sel = genEl('cityMap'), id = sel ? String(sel.value) : '';
        map = id && id !== here.id && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
        if (!map) return { ok: false, say: CITY_LINES.none };
    }
    if (fresh) { var gs = genEl('cityGrid'), g = gs ? String(gs.value) : ''; grid = CITY_GRIDS.indexOf(g) >= 0 ? g : cityGridFor(opts.size); map = null; }
    var plan = CC.genCity(opts), cells = plan.kind === 'cells', w = cells ? plan.cols * CC.CELL : plan.w, h = cells ? plan.rows * CC.CELL : plan.h;
    var at = cityCorner(map, where === 'here' ? viewCentre() : null, w, h, cells ? CC.CELL : 0), pc = CC.cityPieces(plan, at.x, at.y);
    if (!pc.count || !pc.buildings.length) return { ok: false, say: 'That city could not be laid out. Try another seed.' };
    var held = map && Array.isArray(map.whiteboard) ? map.whiteboard.length : 0;
    if (held + pc.count > BUILD_MAX) return { ok: false, say: genCountWords(pc.count, held) };
    return { ok: true, say: genCountWords(pc.count, held), map: map, fresh: fresh, grid: grid, opts: opts, pieces: pc };
}
// One piece as the item the Build tool lays for its shape: a box, a circle, or a filled region with its points
function cityPiece(g, props) {
    var it = Object.assign({ id: 'wb' + uid(), type: g.type, x: g.x, y: g.y, w: g.w, h: g.h, z: 10 }, newOpacityProps(), props);
    if (g.pts) { it.pts = g.pts; it.baseW = g.baseW; it.baseH = g.baseH; it.tip = 'fill'; }
    return it;
}
// The city's pieces as ordinary items, in the order they are laid: each wears the props of its material, a house its own roof and that
// roof's colour, and a town's wall is the pen's Wall line under the City wall's name and colour
function cityItems(pc) {
    var BC = buildCore(), out = [], grounds = {}; if (!BC || !pc) return out;
    var cw = BC.pieceProps('citywall', {}), pen = BC.penPreset('wall', {}), ok = !!cw && !!pen;
    Object.keys(CITY_MATS).forEach(function(k) { grounds[k] = BC.pieceProps(CITY_MATS[k], {}); if (!grounds[k]) ok = false; });
    if (!ok) return out;
    var line = Object.assign({}, pen, { name: cw.name, color: cw.color, strokeWidth: CITY_WALL_PX });
    pc.grounds.forEach(function(g) { if (Object.prototype.hasOwnProperty.call(grounds, g.kind)) out.push(cityPiece(g.geo, grounds[g.kind])); });
    pc.buildings.forEach(function(b) { var p = BC.pieceProps('building', { texture: b.roof, color: b.color }); if (p) out.push(cityPiece(b.geo, p)); });
    pc.walls.forEach(function(wl) { out.push(wl.line ? buildWallItem(wl.geo, line) : cityPiece(wl.geo, cw)); });
    pc.towers.forEach(function(t) { out.push(cityPiece(t.geo, cw)); });
    return out;
}
// The other maps as the list's options, made again only when the list changed, so a pick stands: elements with text, never markup
function cityMapsFill() {
    var sel = genEl('cityMap'), camp = getActiveCampaign(), here = getActiveMap(); if (!sel) return 0;
    var list = genMaps(camp, here ? here.id : ''), sig = JSON.stringify(list);
    if (sig === _city.maps) return list.length;
    var was = String(sel.value || '');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    list.forEach(function(m) { var o = document.createElement('option'); o.value = m.id; o.appendChild(document.createTextNode(m.title)); sel.appendChild(o); });
    sel.value = list.some(function(m) { return m.id === was; }) ? was : (list[0] ? list[0].id : '');
    _city.maps = sig;
    return list.length;
}
// The dialog as it stands: the chip in use, the row its choice needs, the line that says where it lands, the count, and Generate put out
// of use with the reason in sight where the city cannot be laid. A new map's grid and name follow the Size until the GM sets them
function citySync() {
    if (!cityShown()) return;
    var where = GEN_WHERE.indexOf(_city.where) >= 0 ? _city.where : 'here', o = cityForm();
    Array.prototype.forEach.call(document.querySelectorAll('#cityWhere .gen-chip'), function(b) { var on = b.dataset.where === where; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var mr = genEl('cityMapRow'), nr = genEl('cityNameRow'), ln = genEl('cityWhereLine'), ct = genEl('cityCount'), go = genEl('cityGo'), gs = genEl('cityGrid'), nm = genEl('cityName');
    if (mr) mr.hidden = where !== 'other';
    if (nr) nr.hidden = where !== 'fresh';
    if (o && gs && !_city.grid) gs.value = cityGridFor(o.size);
    if (o && nm && !_city.named) nm.value = cityWord(o.size);
    var others = where === 'other' ? cityMapsFill() : 1;
    if (ln) ln.textContent = where === 'other' && !others ? CITY_LINES.none : CITY_LINES[where];
    var plan = cityPlan();
    if (ct) ct.textContent = plan.say;
    if (go) go.disabled = !plan.ok;
}
function cityShow() {
    var m = genEl('cityModal'), CC = cityCore(), here = getActiveMap(); if (!m || !CC || !buildCore() || !buildMay() || !buildHere() || !here) return false;
    var kept = here.meta && typeof here.meta === 'object' && here.meta.city && typeof here.meta.city === 'object' && !Array.isArray(here.meta.city) ? CC.cleanCity(here.meta.city) : null;
    if (kept) cityFill(kept); else { var sb = genEl('citySeed'); if (sb) sb.value = genNewSeed(); }   // a map that keeps its city's seed shows it, to make it again; else a new seed each time
    _city.where = 'here'; _city.maps = ''; _city.grid = ''; _city.named = false;
    m.style.display = 'flex';
    citySync();
    var first = document.querySelector('#cityWhere .gen-chip.on'); if (first && first.focus) first.focus();
    return true;
}
function cityHide() { var m = genEl('cityModal'); if (!m || m.style.display === 'none') return; m.style.display = 'none'; var b = genEl('buildCityBtn'); if (b && b.focus) b.focus(); }
// What Tab walks through, in the dialog's own order: never a row that is put away nor a control that is out of use
function cityStops() {
    var out = Array.prototype.slice.call(document.querySelectorAll('#cityWhere .gen-chip'));
    ['cityMap', 'cityName', 'cityGrid', 'citySeed', 'citySeedNew', 'citySize', 'cityWall', 'cityWater', 'cityRoofs', 'cityFields', 'cityCancel', 'cityGo'].forEach(function(id) {
        var e = genEl(id), row = id === 'cityMap' ? genEl('cityMapRow') : id === 'cityName' || id === 'cityGrid' ? genEl('cityNameRow') : null;
        if (e && !e.disabled && !(row && row.hidden)) out.push(e);
    });
    return out;
}
// Tab goes round inside the dialog: past its last control to its first, and back. True when the focus was moved
function cityTab(target, back) {
    var st = cityStops(), at = st.indexOf(target); if (!st.length) return false;
    var to = back ? (at <= 0 ? st[st.length - 1] : null) : (at < 0 || at === st.length - 1 ? st[0] : null);
    if (!to || !to.focus) return false;
    to.focus(); return true;
}
// Generate: the city laid as the dialog's count said. The GM is taken to the map first, on its play map: that draws and saves it as it
// stands, a new map empty, which is the state one Undo goes back to. Then the pieces are laid there in ONE save, so one Undo takes the
// city back, and a new map stays
function cityGo() {
    if (!cityShown()) return false;   // only from the dialog as it stands: a second press finds it put away
    var plan = cityPlan(); if (!plan.ok) { citySync(); return false; }
    var camp = getActiveCampaign(), here = getActiveMap(), map = plan.map, nmBox = genEl('cityName'), items = cityItems(plan.pieces), word = cityWord(plan.opts.size);
    if (!items.length) { toast('That city could not be laid. Nothing was changed.'); return false; }
    if (plan.fresh) {
        map = createNewMap(getUniqueItemTitle(genText(nmBox ? nmBox.value : '', 80) || word, null));
        map.meta.gridType = plan.grid;
        camp.items[map.id] = map;
    }
    if (!map.meta || typeof map.meta !== 'object') map.meta = {};
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];   // before the map is drawn: a map from a file may have none
    genUnfocus('cityModal'); cityHide();
    if (map === here) save(true);
    else {
        map.meta.lastView = 'visual';
        if (!navigateToMap(map.id)) { if (plan.fresh) delete camp.items[map.id]; toast('That map could not be opened. Nothing was changed.'); return false; }
    }
    if (map.whiteboard.length + items.length > BUILD_MAX) { toast('That city could not be laid. Nothing was changed.'); return false; }
    items.forEach(function(it) { map.whiteboard.push(it); });
    map.meta.city = plan.opts;   // the GM's own, to make it again: never sent (net.js sanitizeItem), cleaned from a file (cleanup.js)
    save(true); render();
    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    toast(word + ' laid, ' + items.length + ' pieces. One Undo takes it back.');
    return true;
}
function cityWire() {
    var m = genEl('cityModal'), row = genEl('buildCityBtn'); if (!m) return;
    if (row) row.addEventListener('click', function(ev) { ev.stopPropagation(); cityShow(); });
    // the dialog hands the focus back to this row when it is put away: a key still held from the press that put it away presses nothing here
    if (row) row.addEventListener('keydown', function(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } });   // a held Escape would be Build's own next, and put the tool away
    Array.prototype.forEach.call(document.querySelectorAll('#cityWhere .gen-chip'), function(b) { b.addEventListener('click', function() { var w = this.dataset.where; if (GEN_WHERE.indexOf(w) < 0) return; _city.where = w; citySync(); }); });
    ['cityMap', 'citySize', 'cityWall', 'cityWater', 'cityRoofs', 'cityFields'].forEach(function(id) { var e = genEl(id); if (e) e.addEventListener('change', citySync); });
    // a grid or a name the GM set for the new map stands, whatever Size is picked afterwards
    var gs = genEl('cityGrid'); if (gs) gs.addEventListener('change', function() { var g = String(this.value); _city.grid = CITY_GRIDS.indexOf(g) >= 0 ? g : ''; citySync(); });
    var nm = genEl('cityName'); if (nm) nm.addEventListener('input', function() { _city.named = true; });
    var sb = genEl('citySeed'); if (sb) sb.addEventListener('input', citySync);
    var nw = genEl('citySeedNew'); if (nw) nw.addEventListener('click', function() { var s = genEl('citySeed'); if (s) s.value = genNewSeed(); citySync(); });
    var no = genEl('cityCancel'); if (no) no.addEventListener('click', cityHide);
    var go = genEl('cityGo'); if (go) go.addEventListener('click', function() { cityGo(); });
    // Escape is heard FIRST, at the window, and goes no further: a box of the page's own closes on Escape in a listener of the document's
    // (the dice roller), and one key must not put two boxes away. Never while a question or a prompt of the app's own is up over the dialog
    // The press that put the dialog away is the dialog's for as long as it is held: its repeats come after the dialog is down, and the
    // document's own listeners would hear them before the row does. Any new press, and Escape let go, end that
    var escHeld = false;
    if (typeof window.addEventListener === 'function') window.addEventListener('keydown', function(e) {
        if (e.repeat !== true) escHeld = false;
        else if (escHeld && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
        if (e.key !== 'Escape' || !cityShown() || buildAsking()) return;
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
        e.preventDefault();
        if (e.repeat !== true) { cityHide(); escHeld = true; }
    }, true);
    if (typeof window.addEventListener === 'function') window.addEventListener('keyup', function(e) { if (e.key === 'Escape') escHeld = false; }, true);
    // every key pressed in the dialog stays in it: the page reads keys as its own (Build's Esc and Enter, a token's arrows, Delete)
    m.addEventListener('keydown', function(e) {
        if (buildAsking()) return;   // a question or a prompt of the app's own, raised over the dialog, has every key: the focus may still rest in here
        e.stopPropagation();
        var t = e.target, box = !!t && /^INPUT$/.test(t.tagName || '');
        if (e.key === 'Escape') { e.preventDefault(); cityHide(); }
        else if (e.key === 'Enter' && box && t.type === 'checkbox') { e.preventDefault(); if (e.repeat !== true && !t.disabled && typeof t.click === 'function') t.click(); }   // Enter ticks a tick that has the focus, as it does on the page
        else if (e.key === 'Enter' && box) { e.preventDefault(); cityGo(); }
        else if (e.key === 'Tab' && cityTab(t, e.shiftKey === true)) e.preventDefault();
    });
    // A key pressed while the dialog is up with the focus outside it (after a press on its backdrop) is the dialog's too: the page would
    // read it as its own behind the dialog, undo the map or put Build away. Escape puts the dialog away, Tab brings the focus back in, and
    // any other key does nothing. Heard first (capture), and never while a question or a prompt of the app's own is up over the dialog
    document.addEventListener('keydown', function(e) {
        if (!cityShown() || buildAsking() || (e.target && typeof m.contains === 'function' && m.contains(e.target))) return;
        e.stopPropagation(); e.preventDefault();
        if (e.key === 'Escape') cityHide();
        else if (e.key === 'Tab') cityTab(null, e.shiftKey === true);
    }, true);
    // A paste is the page's to read too (it lays a copied piece or a picture on the map behind): never while the dialog is up, but for a
    // text field of the dialog's own, which takes its paste as any field does
    document.addEventListener('paste', function(e) {
        if (!cityShown() || buildAsking()) return;
        var t = e.target; if (t && typeof m.contains === 'function' && m.contains(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName || '') && t.type !== 'checkbox') return;
        e.preventDefault(); e.stopPropagation();
    }, true);
}
// [buildcheck:citydialog-end]
cityWire();
// [buildcheck:worlddialog-start]
// The world made for you (the map builder, fold B7; the owner's answers of 2026-10-11 on the world sheet: the land patterns "The four",
// a generated world "C. A Land list", towns "optional when generating" as "A list, None first", the row's drawing "A. Peaks", and the
// dialog as the sheet drew it). The row under Generate a city opens one dialog. Its settings go to the pure half (worldcore.js), which
// answers geometry, and what is laid is ORDINARY pieces: the sea as one box, each stretch of land as one filled region in its own colour
// and pattern, a river as a line in the water's colour, a town as a small square and its name as a text box the GM can change. Nothing
// blocks sight or stops a token: a world map is for pointing and travelling. No piece already on the map is changed, but a world laid on a
// map that holds pieces covers them (its sea is one box on the back layer, laid after them), which its line says. Nothing is derived live.
// It is laid in one save, so one Undo takes it back. The seed and settings are kept on the map (meta.world) for the GM alone, to make it
// again: net.js never sends them and an import cleans them. The dialog is the GM's (buildMay) and its markup is fixed words in the page:
// a map's name reaches the list as an option's text, never as markup. It leans on the dungeon's and the city's helpers (genEl, genText,
// genMaps, genCountWords, genNewSeed, cityCorner, cityPiece)
var WORLD_LINES = { here: 'Its middle goes where the middle of your screen is. It covers what is there, and one Undo takes it back.', other: 'It lands in the middle of that map as you last saw it and covers what is there. You are taken there once it is made.', fresh: 'A new map is made for it. You are taken there once it is made.', none: 'This campaign has no other map.' };
var WORLD_GRIDS = ['off', 'square', 'hex'], WORLD_NAMES = { sea: 'Sea', land: 'Land', forest: 'Forest', sand: 'Sand', snow: 'Snow', mountains: 'Mountains', river: 'River', town: 'Town' }, WORLD_RIVER_PX = 9;
// a town's name: light words on a dark plate that lets the land show through, so that it reads on forest, on sand and on snow alike.
// It hugs the side its mark is on: the generator says left, or right where the name stands on the mark's left at the board's edge
var WORLD_LABEL = Object.freeze({ color: '#f0ead6', bg: '#16161d', bgOpacity: 0.6, fontSize: 18, layer: 'middle' });
var _world = { where: 'fresh', maps: '' };
function worldCore() { return window.wpWorldCore || null; }
function worldShown() { var m = genEl('worldModal'); return !!m && m.style.display === 'flex'; }
// The form as the generator's settings, and the settings into the form
function worldForm() {
    var WC = worldCore(); if (!WC) return null;
    var val = function(id) { var e = genEl(id); return e ? String(e.value) : ''; };
    return WC.cleanWorld({ seed: val('worldSeed').trim(), land: val('worldLand'), size: val('worldSize'), mountains: val('worldMountains'), forests: val('worldForests'), rivers: val('worldRivers'), climate: val('worldClimate'), towns: val('worldTowns') });
}
function worldFill(o) {
    var set = function(id, v) { var e = genEl(id); if (e) e.value = String(v); };
    set('worldSeed', o.seed); set('worldLand', o.land); set('worldSize', o.size); set('worldMountains', o.mountains); set('worldForests', o.forests); set('worldRivers', o.rivers); set('worldClimate', o.climate); set('worldTowns', o.towns);
}
// What Generate would do now: { ok, say } and, where it can be laid, { map (null for a new one), fresh, grid, opts, pieces }. The world's
// MIDDLE goes to the middle of the view, as a city's does, at whole pixels: a world is an overview and sits on no lattice
function worldPlan() {
    var WC = worldCore(), BC = buildCore(), camp = getActiveCampaign(), here = getActiveMap(), no = { ok: false, say: 'A world cannot be built here.' };
    if (!WC || !BC || !camp || !camp.items || !here || here.type !== 'map' || !buildMay() || !buildHere()) return no;
    var seedBox = genEl('worldSeed'), typed = seedBox ? String(seedBox.value).trim() : '', opts = worldForm();
    if (!opts || opts.seed !== typed) return { ok: false, say: 'A seed is letters, digits and hyphens, 24 at most.' };
    var where = GEN_WHERE.indexOf(_world.where) >= 0 ? _world.where : 'fresh', map = here, fresh = where === 'fresh', grid = '';
    if (where === 'other') {
        var sel = genEl('worldMap'), id = sel ? String(sel.value) : '';
        map = id && id !== here.id && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
        if (!map) return { ok: false, say: WORLD_LINES.none };
    }
    if (fresh) { var gs = genEl('worldGrid'), g = gs ? String(gs.value) : ''; grid = WORLD_GRIDS.indexOf(g) >= 0 ? g : 'off'; map = null; }
    var plan = WC.genWorld(opts), at = cityCorner(map, where === 'here' ? viewCentre() : null, plan.w, plan.h, 0), pc = WC.worldPieces(plan, at.x, at.y), items = worldItems(pc);
    if (items.length < 2) return { ok: false, say: 'That world could not be laid out. Try another seed.' };
    var held = map && Array.isArray(map.whiteboard) ? map.whiteboard.length : 0;
    if (held + items.length > BUILD_MAX) return { ok: false, say: genCountWords(items.length, held) };
    return { ok: true, say: genCountWords(items.length, held), map: map, fresh: fresh, grid: grid, opts: opts, items: items };
}
// The world's pieces as ordinary items, in the order they are laid. Each is made here from the generator's own colours and patterns,
// asked again: the kind only as a text of the list, a colour only as six hex digits, a pattern only as a name of the list, a town's name
// only as letters, every number of a piece's box a sound one (worldBox), a river's and a region's points sound ones (worldLine), and a
// stretch of land a filled region and nothing else. A piece that fails is passed over whole. Nothing carries a key that blocks sight,
// stops a token or costs movement. A world is laid at FULL opacity whatever the GM's New item opacity says: its layers are made to cover
// each other (plain land lies under every other kind), so a see-through one would show the layer beneath it
function worldNum(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 200000; }
function worldBox(g) { return worldNum(g.x) && worldNum(g.y) && worldNum(g.w) && worldNum(g.h) && g.w > 0 && g.h > 0 ? { x: g.x, y: g.y, w: g.w, h: g.h } : null; }
function worldLine(g) {
    var b = worldBox(g); if (!b || !Array.isArray(g.pts) || g.pts.length < 2 || g.pts.length > 2000 || !worldNum(g.baseW) || !worldNum(g.baseH) || !(g.baseW > 0) || !(g.baseH > 0)) return null;
    var pts = []; for (var i = 0; i < g.pts.length; i++) { var q = g.pts[i]; if (!Array.isArray(q) || !worldNum(q[0]) || !worldNum(q[1])) return null; pts.push([q[0], q[1]]); }
    b.baseW = g.baseW; b.baseH = g.baseH; b.pts = pts; return b;
}
function worldItems(pc) {
    var BC = buildCore(), out = []; if (!BC || !pc || !Array.isArray(pc.pieces)) return out;
    var lay = function(it) { delete it.opacity; out.push(it); };
    pc.pieces.forEach(function(p) {
        var g = p && typeof p === 'object' ? p.geo : null; if (!g || typeof g !== 'object' || typeof p.kind !== 'string') return;
        var b = worldBox(g); if (!b) return;
        if (p.kind === 'name') { if (typeof p.text === 'string' && /^[A-Za-z]{1,24}$/.test(p.text)) out.push(Object.assign({ id: 'wb' + uid(), type: 'text', x: b.x, y: b.y, w: b.w, h: b.h, z: 10 }, WORLD_LABEL, { text: p.text, align: p.align === 'right' ? 'right' : 'left' })); return; }
        if (!Object.prototype.hasOwnProperty.call(WORLD_NAMES, p.kind) || typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/.test(p.color)) return;
        var props = { color: p.color, layer: 'back', name: WORLD_NAMES[p.kind] }, tex = typeof BC.cleanTexture === 'function' ? BC.cleanTexture(p.texture) : null; if (tex) props.texture = tex;
        if (p.kind === 'river') { var rl = worldLine(g); if (rl) lay(buildWallItem(rl, { color: p.color, layer: 'back', name: WORLD_NAMES.river, strokeWidth: WORLD_RIVER_PX, tip: 'round' })); return; }
        if (p.kind === 'town') { lay(cityPiece({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }, { color: p.color, layer: 'back-mid', name: WORLD_NAMES.town })); return; }
        if (p.kind === 'sea') { lay(cityPiece({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }, props)); return; }
        var rg = g.type === 'path' ? worldLine(g) : null; if (!rg) return;   // a stretch of land: a filled region, its geometry taken value by value
        lay(cityPiece({ type: 'path', x: rg.x, y: rg.y, w: rg.w, h: rg.h, pts: rg.pts, baseW: rg.baseW, baseH: rg.baseH }, props));
    });
    return out;
}
// The other maps as the list's options, made again only when the list changed, so a pick stands: elements with text, never markup
function worldMapsFill() {
    var sel = genEl('worldMap'), camp = getActiveCampaign(), here = getActiveMap(); if (!sel) return 0;
    var list = genMaps(camp, here ? here.id : ''), sig = JSON.stringify(list);
    if (sig === _world.maps) return list.length;
    var was = String(sel.value || '');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    list.forEach(function(m) { var o = document.createElement('option'); o.value = m.id; o.appendChild(document.createTextNode(m.title)); sel.appendChild(o); });
    sel.value = list.some(function(m) { return m.id === was; }) ? was : (list[0] ? list[0].id : '');
    _world.maps = sig;
    return list.length;
}
// The dialog as it stands: the chip in use, the row its choice needs, the line that says where it lands, the count, and Generate put out
// of use with the reason in sight where the world cannot be laid
function worldSync() {
    if (!worldShown()) return;
    var where = GEN_WHERE.indexOf(_world.where) >= 0 ? _world.where : 'fresh';
    Array.prototype.forEach.call(document.querySelectorAll('#worldWhere .gen-chip'), function(b) { var on = b.dataset.where === where; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var mr = genEl('worldMapRow'), nr = genEl('worldNameRow'), ln = genEl('worldWhereLine'), ct = genEl('worldCount'), go = genEl('worldGo');
    if (mr) mr.hidden = where !== 'other';
    if (nr) nr.hidden = where !== 'fresh';
    var others = where === 'other' ? worldMapsFill() : 1;
    if (ln) ln.textContent = where === 'other' && !others ? WORLD_LINES.none : WORLD_LINES[where];
    var plan = worldPlan();
    if (ct) ct.textContent = plan.say;
    if (go) go.disabled = !plan.ok;
}
// It comes up on A new map, as the sheet drew it: a world wants a map of its own. On a map that keeps its world's seed it comes up on
// This map with that seed and those settings, to make it again
function worldShow() {
    var m = genEl('worldModal'), WC = worldCore(), here = getActiveMap(); if (!m || !WC || !buildCore() || !buildMay() || !buildHere() || !here) return false;
    var kept = here.meta && typeof here.meta === 'object' && here.meta.world && typeof here.meta.world === 'object' && !Array.isArray(here.meta.world) ? WC.cleanWorld(here.meta.world) : null;
    if (kept) worldFill(kept); else { var sb = genEl('worldSeed'); if (sb) sb.value = genNewSeed(); }
    _world.where = kept ? 'here' : 'fresh'; _world.maps = '';
    var nm = genEl('worldName'), gs = genEl('worldGrid'); if (nm) nm.value = 'World'; if (gs) gs.value = 'off';
    m.style.display = 'flex';
    worldSync();
    var first = document.querySelector('#worldWhere .gen-chip.on'); if (first && first.focus) first.focus();
    return true;
}
function worldHide() { var m = genEl('worldModal'); if (!m || m.style.display === 'none') return; m.style.display = 'none'; var b = genEl('buildWorldBtn'); if (b && b.focus) b.focus(); }
// What Tab walks through, in the dialog's own order: never a row that is put away nor a control that is out of use
function worldStops() {
    var out = Array.prototype.slice.call(document.querySelectorAll('#worldWhere .gen-chip'));
    ['worldMap', 'worldName', 'worldGrid', 'worldSeed', 'worldSeedNew', 'worldLand', 'worldSize', 'worldMountains', 'worldForests', 'worldRivers', 'worldClimate', 'worldTowns', 'worldCancel', 'worldGo'].forEach(function(id) {
        var e = genEl(id), row = id === 'worldMap' ? genEl('worldMapRow') : id === 'worldName' || id === 'worldGrid' ? genEl('worldNameRow') : null;
        if (e && !e.disabled && !(row && row.hidden)) out.push(e);
    });
    return out;
}
// Tab goes round inside the dialog: past its last control to its first, and back. True when the focus was moved
function worldTab(target, back) {
    var st = worldStops(), at = st.indexOf(target); if (!st.length) return false;
    var to = back ? (at <= 0 ? st[st.length - 1] : null) : (at < 0 || at === st.length - 1 ? st[0] : null);
    if (!to || !to.focus) return false;
    to.focus(); return true;
}
// Generate: the world laid as the dialog's count said. The GM is taken to the map first, on its play map: that draws and saves it as it
// stands, a new map empty, which is the state one Undo goes back to. Then the pieces are laid there in ONE save, so one Undo takes the
// world back, and a new map stays
function worldGo() {
    if (!worldShown()) return false;   // only from the dialog as it stands: a second press finds it put away
    var plan = worldPlan(); if (!plan.ok) { worldSync(); return false; }
    var camp = getActiveCampaign(), here = getActiveMap(), map = plan.map, nmBox = genEl('worldName'), items = plan.items;
    if (plan.fresh) {
        map = createNewMap(getUniqueItemTitle(genText(nmBox ? nmBox.value : '', 80) || 'World', null));
        map.meta.gridType = plan.grid;
        camp.items[map.id] = map;
    }
    if (!map.meta || typeof map.meta !== 'object') map.meta = {};
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];   // before the map is drawn: a map from a file may have none
    genUnfocus('worldModal'); worldHide();
    if (map === here) save(true);
    else {
        map.meta.lastView = 'visual';
        if (!navigateToMap(map.id)) { if (plan.fresh) delete camp.items[map.id]; toast('That map could not be opened. Nothing was changed.'); return false; }
    }
    if (map.whiteboard.length + items.length > BUILD_MAX) { toast('That world could not be laid. Nothing was changed.'); return false; }
    items.forEach(function(it) { map.whiteboard.push(it); });
    map.meta.world = plan.opts;   // the GM's own, to make it again: never sent (net.js sanitizeItem), cleaned from a file (cleanup.js)
    save(true); render();
    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    toast('World laid, ' + items.length + ' pieces. One Undo takes it back.');
    return true;
}
function worldWire() {
    var m = genEl('worldModal'), row = genEl('buildWorldBtn'); if (!m) return;
    if (row) row.addEventListener('click', function(ev) { ev.stopPropagation(); worldShow(); });
    // the dialog hands the focus back to this row when it is put away: a key still held from the press that put it away presses nothing here
    if (row) row.addEventListener('keydown', function(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } });   // a held Escape would be Build's own next, and put the tool away
    Array.prototype.forEach.call(document.querySelectorAll('#worldWhere .gen-chip'), function(b) { b.addEventListener('click', function() { var w = this.dataset.where; if (GEN_WHERE.indexOf(w) < 0) return; _world.where = w; worldSync(); }); });
    ['worldMap', 'worldLand', 'worldSize', 'worldMountains', 'worldForests', 'worldRivers', 'worldClimate', 'worldTowns'].forEach(function(id) { var e = genEl(id); if (e) e.addEventListener('change', worldSync); });
    var sb = genEl('worldSeed'); if (sb) sb.addEventListener('input', worldSync);
    var nw = genEl('worldSeedNew'); if (nw) nw.addEventListener('click', function() { var s = genEl('worldSeed'); if (s) s.value = genNewSeed(); worldSync(); });
    var no = genEl('worldCancel'); if (no) no.addEventListener('click', worldHide);
    var go = genEl('worldGo'); if (go) go.addEventListener('click', function() { worldGo(); });
    // Escape is heard FIRST, at the window, and goes no further, and the press that put the dialog away is the dialog's for as long as it
    // is held, as in the dungeon's and the city's dialogs. Never while a question or a prompt of the app's own is up over the dialog
    var escHeld = false;
    if (typeof window.addEventListener === 'function') window.addEventListener('keydown', function(e) {
        if (e.repeat !== true) escHeld = false;
        else if (escHeld && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
        if (e.key !== 'Escape' || !worldShown() || buildAsking()) return;
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
        e.preventDefault();
        if (e.repeat !== true) { worldHide(); escHeld = true; }
    }, true);
    if (typeof window.addEventListener === 'function') window.addEventListener('keyup', function(e) { if (e.key === 'Escape') escHeld = false; }, true);
    // every key pressed in the dialog stays in it: the page reads keys as its own (Build's Esc and Enter, a token's arrows, Delete)
    m.addEventListener('keydown', function(e) {
        if (buildAsking()) return;   // a question or a prompt of the app's own, raised over the dialog, has every key: the focus may still rest in here
        e.stopPropagation();
        var t = e.target, box = !!t && /^INPUT$/.test(t.tagName || '');
        if (e.key === 'Escape') { e.preventDefault(); worldHide(); }
        else if (e.key === 'Enter' && box) { e.preventDefault(); worldGo(); }
        else if (e.key === 'Tab' && worldTab(t, e.shiftKey === true)) e.preventDefault();
    });
    // A key pressed while the dialog is up with the focus outside it (after a press on its backdrop) is the dialog's too. Escape puts the
    // dialog away, Tab brings the focus back in, and any other key does nothing. Heard first (capture), never under a question of the app's own
    document.addEventListener('keydown', function(e) {
        if (!worldShown() || buildAsking() || (e.target && typeof m.contains === 'function' && m.contains(e.target))) return;
        e.stopPropagation(); e.preventDefault();
        if (e.key === 'Escape') worldHide();
        else if (e.key === 'Tab') worldTab(null, e.shiftKey === true);
    }, true);
    // A paste is the page's to read too (it lays a copied piece or a picture on the map behind): never while the dialog is up, but for a
    // text field of the dialog's own, which takes its paste as any field does
    document.addEventListener('paste', function(e) {
        if (!worldShown() || buildAsking()) return;
        var t = e.target; if (t && typeof m.contains === 'function' && m.contains(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName || '') && t.type !== 'checkbox') return;
        e.preventDefault(); e.stopPropagation();
    }, true);
}
// [buildcheck:worlddialog-end]
worldWire();

var _el_shapeTextBtn = document.getElementById('shapeTextBtn');

if(_el_shapeTextBtn) _el_shapeTextBtn.addEventListener('click', function() {

    armPlacement('text', {w:200, h:60, color:'transparent', text:TEXT_STANDIN}, 'text box');

});

var _el_shapeRectBtn = document.getElementById('shapeRectBtn');

if(_el_shapeRectBtn) _el_shapeRectBtn.addEventListener('click', function() {

    armPlacement('rect', {w:150, h:100}, 'rectangle');

});

var _el_shapeCircBtn = document.getElementById('shapeCircBtn');

if(_el_shapeCircBtn) _el_shapeCircBtn.addEventListener('click', function() {

    armPlacement('circle', {w:120, h:120, borderRadius:'50%'}, 'circle');

});

var _el_shapeDiaBtn = document.getElementById('shapeDiaBtn');

if(_el_shapeDiaBtn) _el_shapeDiaBtn.addEventListener('click', function() {

    armPlacement('diamond', {w:100, h:100}, 'diamond');

});

var _el_shapeTriggerBtn = document.getElementById('shapeTriggerBtn');

if(_el_shapeTriggerBtn) _el_shapeTriggerBtn.addEventListener('click', function() {

    // The trigger's shape follows the grid: hex cells get hex zones, square
    // grids get square zones; no grid gets a plain rectangle. Change it later
    // in Properties → Trigger Shape.
    if (state.gridType === 'hex') armPlacement('trigger', {shape: 'hexagon', w: 120, h: 104, color: 'transparent', eventMessage: ''}, 'hex trigger zone');
    else if (state.gridType === 'square') armPlacement('trigger', {shape: 'rect', w: 100, h: 100, color: 'transparent', eventMessage: ''}, 'square trigger zone');
    else armPlacement('trigger', {w:200, h:200, color:'transparent', eventMessage:''}, 'trigger zone');

});

// After creating a hex-shaped item, pull it onto the nearest hex cell (if hex grid + snap active)

function snapNewHexItem() {

    if (!(state.snap && state.gridType === 'hex' && state.selWbId)) return;

    var item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

    if (!item) return;

    var hc = snapToHex(item.x + item.w/2, item.y + item.h/2, 30, 'center');

    item.x = hc.x - item.w/2; item.y = hc.y - item.h/2;

    save(); render();

}
window.wpSnapNewHexItem = snapNewHexItem;

var _el_shapeHexBtn = document.getElementById('shapeHexBtn');

if(_el_shapeHexBtn) _el_shapeHexBtn.addEventListener('click', function() {

    armPlacement('hexagon', {w: 120, h: 104}, 'hexagon');

});

var _el_shapeHexTriggerBtn = document.getElementById('shapeHexTriggerBtn');

if(_el_shapeHexTriggerBtn) _el_shapeHexTriggerBtn.addEventListener('click', function() {

    armPlacement('trigger', {shape: 'hexagon', w: 120, h: 104, color: 'transparent', eventMessage: ''}, 'hex trigger');

});

  // Flat-top hex tile (a flat side faces up): 90x52 covers two half-offset columns

  // 1.5.7: the lattice's seven edges a tile, and the copies of them from the eight tiles around it that come within a stroke's reach of this one,
  // each edge once (an edge is the same edge drawn from either end), as path data of whole numbers
  function hexTilePaths() {
      var base = [[30, 26, 0, 26], [30, 26, 45, 0], [30, 26, 45, 52], [75, 0, 45, 0], [75, 0, 90, 26], [75, 52, 45, 52], [75, 52, 90, 26]], seen = {}, out = '';
      for (var dx = -90; dx <= 90; dx += 90) for (var dy = -52; dy <= 52; dy += 52) base.forEach(function(e) {
          var a = [e[0] + dx, e[1] + dy], b = [e[2] + dx, e[3] + dy];
          if (Math.max(a[0], b[0]) < -4 || Math.min(a[0], b[0]) > 94 || Math.max(a[1], b[1]) < -4 || Math.min(a[1], b[1]) > 56) return;   // nowhere near this tile
          var k = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? a.concat(b).join(',') : b.concat(a).join(','); if (seen[k]) return; seen[k] = 1;
          out += "<path d='M " + a[0] + ' ' + a[1] + ' L ' + b[0] + ' ' + b[1] + "'/>";
      });
      return out;
  }
  function hexBgCss(alpha) {

      // Dual-stroke: a dark line with a light line offset beside it reads on any backdrop

      // 90×52 whole-pixel tile (see snapToHex): fractional tiles drift in Chrome
      var paths = hexTilePaths();   // 1.5.7: the edges of the tile and of its neighbours that reach into it, once each

      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='90' height='52' viewBox='0 0 90 52'>" +

          "<g stroke='rgba(0,0,0," + alpha + ")' stroke-width='3' fill='none'>" + paths + "</g>" +

          "<g stroke='rgba(255,255,255," + alpha + ")' stroke-width='1.2' fill='none'>" + paths + "</g></svg>";

      return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';

  }



  // The grid lives on an overlay inside the (scaled) whiteboard, so it pans and

  // zooms with the content, always layered above the items.

  function applyGridType(type) {

      var overlay = document.getElementById('gridOverlay');

      if(!overlay) return;

      // Text items lift above the grid (see .grid-active CSS) so labels stay legible
      var wbEl = document.getElementById('whiteboard');

      if (wbEl) wbEl.classList.toggle('grid-active', type === 'square' || type === 'hex');

      // Grids always draw over the content — every line is a dark stroke with a
      // light stroke offset 1px beside it, so cells read over bright art, dark
      // art, and anything mid-tone, even while images move underneath.

      var alpha = 0.55;

      // Viewer's own grid strength (Settings ▸ Table); local only, never synced
      if (window.wpApplyGridOpacity) window.wpApplyGridOpacity();

      if (type === 'square') {

          // Centered outline stroke: 3px dark halo under a 1px light core, both
          // symmetric around the true cell boundary.

          overlay.style.backgroundImage =

              'linear-gradient(rgba(0,0,0,' + alpha + ') 3px, transparent 3px), linear-gradient(90deg, rgba(0,0,0,' + alpha + ') 3px, transparent 3px), ' +

              'linear-gradient(rgba(255,255,255,' + alpha + ') 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,' + alpha + ') 1px, transparent 1px)';

          overlay.style.backgroundSize = '50px 50px';

          overlay.style.backgroundPosition = '0 -1.5px, -1.5px 0, 0 -0.5px, -0.5px 0';

          overlay.style.display = 'block';

      } else if (type === 'hex') {

          overlay.style.backgroundImage = hexBgCss(alpha);

          overlay.style.backgroundSize = '90px 52px';

          overlay.style.backgroundPosition = '0 0';

          overlay.style.display = 'block';

      } else {

          type = 'off';

          overlay.style.display = 'none';

      }

      overlay.style.zIndex = 15000;

      // Hide the default dot texture while a grid is active

      var wbEl = document.getElementById('whiteboard');

      if (wbEl) wbEl.style.backgroundImage = (type === 'off') ? '' : 'none';

      state.gridType = type;

      var gb = document.getElementById('wbGridBtn');

      if (gb) gb.classList.toggle('active', type !== 'off');

      [['gridOffBtn', 'off'], ['gridSqBtn', 'square'], ['gridHexBtn', 'hex']].forEach(function(g) { var r = document.getElementById(g[0]); if (r) r.classList.toggle('on', g[1] === type); });   // 107, menus by name: the row of the grid in use is marked

  }

  function setGridType(type) {

      applyGridType(type);

      var m = getActiveMap();

      if (m && m.meta) {
          m.meta.gridType = state.gridType;
          var turned = seatFacings(m, state.gridType);   // tokens turn to the nearest cell-side facing
          if (turned) toast(turned + (turned === 1 ? ' token turned' : ' tokens turned') + ' to face the ' + state.gridType + ' grid.');
          save();
      }

      document.getElementById('gridMenu').classList.remove('show');

  }






  // [buildcheck:celllabels-start]
  /* Cell labels (1.5.4, backlog 34; the owner picked "Small table extras": "hex cell labels at a set opacity"). On a hex map the GM may
     have each cell show its name: a column letter, A for the column at the board's left edge, then B, and after Z, AA; and a row number,
     1 for the first whole cell at the column's top. Odd columns stand half a cell lower, so their row 1 is too. The choice is kept with
     the map as ONE number, map.meta.cellLabels, how strongly the labels show, from 0.1 to 1. None, or anything that is no such number,
     is off: it is read only through cellLabelsOf, on the GM's screen and on a player's, whatever a file or a host holds. Everyone at the
     table sees the labels, as everyone sees the grid, and the stream window shows them where it shows the grid.
     They are drawn on one canvas the size of the map's view (#cellLabels, under the fog as the grid is), only the cells in view, only
     while the hex grid is on and a label is large enough to read, and drawn again only when the view, the map or the number changed. So
     a large map costs no more than a small one, and a map with them off costs one look at a number. */
  var CELL_LABEL_FONT = 10, CELL_LABEL_MIN_PX = 5, CELL_LABEL_MAX = 6000;   // a label's size on the board; below 5 screen pixels none is drawn; at most this many at once
  var _cellLab = { key: '', last: 0.5 };
  // A map's number as the labels read it: 0 for off, else from 0.1 to 1 in steps of 0.05
  function cellLabelsOf(v) {
      if (typeof v !== 'number' || !isFinite(v) || v <= 0) return 0;
      return Math.round(Math.max(0.1, Math.min(1, v)) * 20) / 20;
  }
  // A column's letters: 0 is A, 25 is Z, 26 is AA. '' for anything that is no column
  function hexColName(c) {
      if (typeof c !== 'number' || !(c >= 0) || c !== Math.floor(c) || c > 100000) return '';
      var s = '';
      for (var n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
      return s;
  }
  // The labels for a box of the board (in its own pixels): [{ x, y, t }], x and y the top middle of a label and t its words. Cell centres are
  // datamap.js snapToHex's own: x = 45q + 15, y = 52r in an even column and 52r + 26 in an odd one. A cell has a label where its column is on
  // the board and its middle below the board's top edge, and the label is listed where its own box (40 wide, from 22 to 12 above the cell's
  // middle) meets the box asked for. null where the box is none, or spans more columns or would hold more labels than max
  function hexLabelCells(x0, y0, x1, y1, max) {
      var num = function(v) { return typeof v === 'number' && isFinite(v); };
      if (!num(x0) || !num(y0) || !num(x1) || !num(y1) || !(x1 >= x0) || !(y1 >= y0) || !num(max) || !(max > 0)) return null;
      var qa = Math.max(0, Math.ceil((x0 - 35) / 45)), qb = Math.floor((x1 + 5) / 45);
      if (qb - qa + 1 > max) return null;
      var spans = [], total = 0, q, k;
      for (q = qa; q <= qb; q++) {
          var off = q % 2 ? 26 : 0, ka = Math.max(off ? 0 : 1, Math.ceil((y0 + 12 - off) / 52)), kb = Math.floor((y1 + 22 - off) / 52);
          if (kb < ka) continue;
          total += kb - ka + 1; if (total > max) return null;
          spans.push([q, off, ka, kb]);
      }
      var out = [];
      spans.forEach(function(sp) {
          var col = hexColName(sp[0]), x = 45 * sp[0] + 15;
          for (k = sp[2]; k <= sp[3]; k++) out.push({ x: x, y: 52 * k + sp[1] - 22, t: col + (sp[1] ? k + 1 : k) });
      });
      return out;
  }
  // Draws this screen's labels, or puts the canvas away. true: labels stand on screen
  function drawCellLabels() {
      var cv = document.getElementById('cellLabels'); if (!cv || typeof cv.getContext !== 'function') return false;
      var m = getActiveMap(), wrap = document.getElementById('whiteboardWrap'), z = state.zoomLevel || 1;
      var a = m && m.type === 'map' && m.meta ? cellLabelsOf(m.meta.cellLabels) : 0, W = wrap ? wrap.clientWidth : 0, H = wrap ? wrap.clientHeight : 0;
      var cells = a > 0 && state.viewMode === 'visual' && state.gridType === 'hex' && W > 0 && H > 0 && CELL_LABEL_FONT * z >= CELL_LABEL_MIN_PX
          ? hexLabelCells(wrap.scrollLeft / z, wrap.scrollTop / z, (wrap.scrollLeft + W) / z, (wrap.scrollTop + H) / z, CELL_LABEL_MAX) : null;
      if (!cells) { if (_cellLab.key !== 'off') { cv.style.display = 'none'; _cellLab.key = 'off'; } return false; }
      var d = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1)), key = [m.id, a, z, wrap.scrollLeft, wrap.scrollTop, W, H, d].join('|');
      if (key === _cellLab.key) return true;
      _cellLab.key = key;
      var pw = Math.round(W * d), ph = Math.round(H * d);
      if (cv.width !== pw) cv.width = pw;
      if (cv.height !== ph) cv.height = ph;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      var ctx = cv.getContext('2d'); if (!ctx) return false;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, pw, ph);
      ctx.setTransform(d * z, 0, 0, d * z, -wrap.scrollLeft * d, -wrap.scrollTop * d);   // the board's own pixels, as the rulers read the view
      ctx.globalAlpha = a; ctx.font = '600 ' + CELL_LABEL_FONT + 'px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.fillStyle = '#ffffff';   // a dark edge under light words, as the grid's lines: they read on any ground
      for (var i = 0; i < cells.length; i++) { ctx.strokeText(cells[i].t, cells[i].x, cells[i].y); ctx.fillText(cells[i].t, cells[i].x, cells[i].y); }
      cv.style.display = 'block';
      return true;
  }
  function cellLabelsMay() { return typeof buildMay === 'function' && buildMay(); }   // the GM's own campaign on the machine that owns it, as the map builder asks: never on someone else's table
  // The Grid menu says how the map on screen stands, and the labels follow it
  function cellLabelsSync() {
      var m = getActiveMap(), a = m && m.type === 'map' && m.meta ? cellLabelsOf(m.meta.cellLabels) : 0, pct = Math.round((a || cellLabelsOf(_cellLab.last) || 0.5) * 100);
      var row = document.getElementById('gridLabelsBtn'), sl = document.getElementById('gridLabelsOpacity'), val = document.getElementById('gridLabelsVal');
      if (row) { row.classList.toggle('on', a > 0); row.setAttribute('aria-pressed', a > 0 ? 'true' : 'false'); }
      if (sl) { sl.value = String(pct); sl.disabled = !(a > 0); }
      if (val) val.textContent = pct + '%';
      return drawCellLabels();
  }
  // Cell labels in the Grid menu: on at the last strength used, or off. One save, so one Undo takes it back
  function cellLabelsToggle() {
      var m = getActiveMap(); if (!m || m.type !== 'map' || !m.meta || !cellLabelsMay()) return false;
      var a = cellLabelsOf(m.meta.cellLabels);
      if (a > 0) { _cellLab.last = a; delete m.meta.cellLabels; }
      else m.meta.cellLabels = cellLabelsOf(_cellLab.last) || 0.5;
      save(); cellLabelsSync();
      if (!(a > 0) && state.gridType !== 'hex') toast('Cell labels show on a hex grid. Pick Hex in this menu to see them.');
      return true;
  }
  // Label opacity: the labels follow the slider as it moves, and the map is saved once it is let go. Only while they are on
  function cellLabelsSlide(v, keep) {
      var m = getActiveMap(), a = cellLabelsOf(parseInt(v, 10) / 100);
      if (!m || m.type !== 'map' || !m.meta || !cellLabelsMay() || !(cellLabelsOf(m.meta.cellLabels) > 0) || !(a > 0)) return false;
      _cellLab.last = a; m.meta.cellLabels = a;
      var val = document.getElementById('gridLabelsVal'); if (val) val.textContent = Math.round(a * 100) + '%';
      drawCellLabels();
      if (keep === true) save();
      return true;
  }
  function cellLabelsWire() {
      var row = document.getElementById('gridLabelsBtn'), sl = document.getElementById('gridLabelsOpacity'), wrap = document.getElementById('whiteboardWrap');
      if (row) row.addEventListener('click', function() { cellLabelsToggle(); });
      if (sl) { sl.addEventListener('input', function() { cellLabelsSlide(sl.value, false); }); sl.addEventListener('change', function() { cellLabelsSlide(sl.value, true); }); }
      if (wrap && typeof ResizeObserver === 'function') new ResizeObserver(function() { drawCellLabels(); }).observe(wrap);   // the view grew or shrank: a panel folded, the window resized
      window.wpCellLabels = drawCellLabels;   // main.js renderRulers asks it at every scroll and zoom, as the rulers follow the view
  }
  // [buildcheck:celllabels-end]
  cellLabelsWire();

  var _el_wbGridBtn = document.getElementById('wbGridBtn');

  if(_el_wbGridBtn) _el_wbGridBtn.addEventListener('click', function() {

      document.getElementById('gridMenu').classList.toggle('show');

  });

  var _el_gridOffBtn = document.getElementById('gridOffBtn');
    if(_el_gridOffBtn) _el_gridOffBtn.addEventListener('click', function() { setGridType('off'); });

    var _el_gridSqBtn = document.getElementById('gridSqBtn');
    if(_el_gridSqBtn) _el_gridSqBtn.addEventListener('click', function() { setGridType('square'); });

    var _el_gridHexBtn = document.getElementById('gridHexBtn');
    if(_el_gridHexBtn) _el_gridHexBtn.addEventListener('click', function() { setGridType('hex'); });

    var _el_gridOpacityBtn = document.getElementById('gridOpacityBtn');
    if(_el_gridOpacityBtn) _el_gridOpacityBtn.addEventListener('click', function() { var gm = document.getElementById('gridMenu'); if (gm) gm.classList.remove('show'); if (window.wpOpenSettings) window.wpOpenSettings('table', 'setGridOpacity'); });

var _el_wbSnapBtn = document.getElementById('wbSnapBtn');
if(_el_wbSnapBtn) {
    // Snap preference survives restarts
    try { state.snap = localStorage.getItem('wp_snap') === '1'; } catch(e) {}
    _el_wbSnapBtn.classList.toggle('active', !!state.snap);
    var _dataSnapBtn = document.getElementById('snapBtn');
    if (_dataSnapBtn) _dataSnapBtn.classList.toggle('active', !!state.snap);
    /* Snap has a MODE: what a dragged item aligns to while Snap is on.
         grid  — cells only (drops seat to the lattice; no magnetism to neighbours)
         items — neighbours only (edges glue/align; drops stay where the magnet left them)
         both  — the old behaviour (magnet first, grid takes open-space drops)
       Local preference (wp_snapMode). Size-matching on resize is separate and always on. */
    try { var _sm = localStorage.getItem('wp_snapMode'); state.snapMode = (_sm === 'items' || _sm === 'both') ? _sm : 'grid'; } catch(e) { state.snapMode = 'grid'; }
    var _el_snapMenu = document.getElementById('snapMenu');
    function syncSnapMenu() {
        document.querySelectorAll('.snap-mode-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === state.snapMode); });
        var off = document.getElementById('snapOffBtn');
        if (off) off.textContent = state.snap ? '\u23FB Turn snapping off' : '\u23FB Turn snapping on';
        _el_wbSnapBtn.classList.toggle('active', !!state.snap);
        var ds = document.getElementById('snapBtn');
        if (ds) ds.classList.toggle('active', !!state.snap);
        _el_wbSnapBtn.title = state.snap
            ? 'Snap is on, aligning to ' + ({ grid: 'grid cells', items: 'other items', both: 'grid cells and other items' })[state.snapMode] + '. Press to turn it off.'
            : 'Snap is off. Press to turn it on.';
    }
    function setSnap(on) {
        state.snap = !!on;
        try { localStorage.setItem('wp_snap', state.snap ? '1' : '0'); } catch(e) {}
        syncSnapMenu();
        if (window.wpNet && window.wpNet.syncSnap) window.wpNet.syncSnap();   // the snap rule: a host's Snap is the table's
    }
    // 107, the presses: the icon switches snapping, and the small arrow beside it opens what it snaps to
    _el_wbSnapBtn.addEventListener('click', function(e) { e.stopPropagation(); setSnap(!state.snap); toast(state.snap ? 'Snapping on.' : 'Snapping off.'); });
    var _el_snapOptBtn = document.getElementById('snapOptBtn');
    if (_el_snapOptBtn) _el_snapOptBtn.addEventListener('click', function(e) { e.stopPropagation(); if (_el_snapMenu) { syncSnapMenu(); _el_snapMenu.classList.toggle('show'); } });
    document.querySelectorAll('.snap-mode-btn').forEach(function(b) {
        b.addEventListener('click', function(e) {
            e.stopPropagation();
            state.snapMode = this.dataset.mode;
            try { localStorage.setItem('wp_snapMode', state.snapMode); } catch(err) {}
            if (!state.snap) setSnap(true);
            syncSnapMenu();
            if (window.wpNet && window.wpNet.syncSnap) window.wpNet.syncSnap();   // Items only is no grid seat for the table either
            toast(({ grid: 'Snapping to grid cells only.', items: 'Snapping to other items only.', both: 'Snapping to the grid and to other items.' })[state.snapMode]);
        });
    });
    var _snapOff = document.getElementById('snapOffBtn');
    if (_snapOff) _snapOff.addEventListener('click', function(e) { e.stopPropagation(); setSnap(!state.snap); if (!state.snap && _el_snapMenu) _el_snapMenu.classList.remove('show'); toast(state.snap ? 'Snapping on.' : 'Snapping off.'); });
    if (_el_snapMenu) ['pointerdown', 'click'].forEach(function(ev) { _el_snapMenu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
    document.addEventListener('click', function(e) {
        if (_el_snapMenu && _el_snapMenu.classList.contains('show') && !e.target.closest('#snapMenu') && !e.target.closest('#snapOptBtn')) _el_snapMenu.classList.remove('show');
    });
    syncSnapMenu();
}

// Initialize global handles
attachResizeHandle();
attachRotateHandle();
attachArrowTurn();
// Selection toolbar: out of the scaled #whiteboard, into the wrap, so it keeps one screen size at every zoom
(function() { var bar = document.getElementById('selToolbar'), wrap = document.getElementById('whiteboardWrap'); if (bar && wrap && bar.parentElement !== wrap) wrap.appendChild(bar); })();

// Context Menu
/* ---------- Campaign Cast: saved characters, dropped as copies ---------- */
function castOf(camp) { camp.cast = camp.cast || {}; return camp.cast; }
function castSave(items) {
    var camp = getActiveCampaign(); if (!camp) return;
    var cast = castOf(camp), n = 0;
    items.forEach(function(it) {
        if (!it || !(it.isChar || it.charName)) return;   // only character tokens belong in the cast
        var cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        cast[cid] = { id: cid, name: it.charName || 'Character', kind: it.type || 'image', src: it.src || '', w: it.w || 60, h: it.h || 52, color: it.color || 'transparent', charStats: it.charStats || '', shape: it.shape || '', savedAt: Date.now() };
        if (it.charId) cast[cid].charId = it.charId;   // the cast entry remembers the character (a single drop shares its sheet)
        n++;
    });
    if (!n) { import('./io.js').then(function(m) { m.toast('Select a character token to save.'); }); return; }
    import('./io.js').then(function(m) { m.save(true); m.toast(n === 1 ? 'Saved to the campaign cast.' : n + ' saved to the campaign cast.'); });
}
window.wpCastSaveCharacter = function(c) {
    var camp = getActiveCampaign(); if (!camp || !c) return false;
    var cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    castOf(camp)[cid] = { id: cid, name: c.name || 'Character', kind: c.portrait ? 'image' : 'circle', src: c.portrait || '', w: 60, h: 52, color: c.portrait ? 'transparent' : '#4db3d3', charStats: '', shape: '', savedAt: Date.now() };
    import('./io.js').then(function(m) { m.save(true); m.toast((c.name || 'Character') + ' saved to the campaign cast.'); });
    return true;
};
function castPlace(cid, x, y, count) {
    var camp = getActiveCampaign(), am = getActiveMap();
    if (!camp || !am || am.type !== 'map') return;
    var c = castOf(camp)[cid]; if (!c) return;
    am.whiteboard = am.whiteboard || [];
    count = Math.max(1, count || 1);
    var cols = Math.ceil(Math.sqrt(count)), gap = 10;
    for (var i = 0; i < count; i++) {
        var col = i % cols, row = Math.floor(i / cols);
        var it = { id: 'wb' + Math.random().toString(36).slice(2, 10), type: c.kind || (c.src ? 'image' : 'circle'), x: x - c.w / 2 + col * (c.w + gap), y: y - c.h / 2 + row * (c.h + gap), w: c.w, h: c.h, z: 10, color: c.color, isChar: true, charName: count > 1 ? c.name + ' ' + (i + 1) : c.name, name: count > 1 ? c.name + ' ' + (i + 1) : c.name, charStats: c.charStats, layer: 'front' };
        if (c.src) it.src = c.src;
        if (c.shape) it.shape = c.shape;
        if (c.charId && count === 1) it.charId = c.charId;   // one copy of a character shares its sheet; several are separate mooks
        if (window.wpSystemCore && window.wpSystemCore.shapeStandIn) window.wpSystemCore.shapeStandIn(it, am);   // grid-shaped tokens: this map's cell shape
        if (window.wpSeatCell) window.wpSeatCell(it, am); else if (window.wpSeatHex) window.wpSeatHex(it, am);
        am.whiteboard.push(it);
    }
    import('./io.js').then(function(m) { m.save(true); if (window.appRender) window.appRender(); m.toast(count === 1 ? c.name + ' placed.' : count + ' × ' + c.name + ' placed.'); });
}
// Cast cells at the top of the image library (new-token flow)
function castLibraryHtml(filter) {
    var camp = getActiveCampaign(); if (!camp) return '';
    var q = (filter || '').toLowerCase();
    var list = Object.values(castOf(camp)).filter(function(c) { return !q || String(c.name || '').toLowerCase().indexOf(q) >= 0; }).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    _castOrder = list.map(function(c) { return c.id; });   // the shown order, for Shift-click runs
    if (!list.length) return q ? '' : '<div class="img-lib-folder cast-head" style="color:var(--gold);"><span>&#9733; Campaign Cast</span><span class="cast-head-note">\u2014 empty. Right-click a character token on a play map and choose Save to Campaign Cast; it will show here for quick re-use</span></div>';
    return '<div class="img-lib-folder cast-head" style="color:var(--gold);"><span>&#9733; Campaign Cast</span><span class="cast-head-note">\u2014 click a face for a closer look; Ctrl-click to pick several; its \u00d7 button drops the number in Copies straight onto the map</span></div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">' + list.map(function(c) { return '<div class="img-lib-cell cast-cell' + (_castSel[c.id] ? ' picked' : '') + '" data-cid="' + esc(c.id) + '" title="' + esc(c.name) + (c.charStats ? ' — ' + esc(c.charStats) : '') + ' — click for a closer look; Ctrl-click to pick several">' + (picRef(c.src) ? '<img src="' + encodeURI(picRef(c.src)) + '" loading="lazy" alt="">' : '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--gold); font-size:24px;">&#9733;</div>') + '<div class="img-lib-name">&#9733; ' + esc(c.name) + '</div><button class="tool ghost cast-cell-five" data-cid="' + esc(c.id) + '" title="Drop ' + castBatch() + ' copies">&times;' + castBatch() + '</button></div>'; }).join('') + '</div>'
        + '<div class="img-lib-folder" style="margin-top:8px;">Pictures</div>';
}
function viewCentre() {
    var wrap = document.getElementById('whiteboardWrap'), z = state.zoomLevel || 1;
    if (!wrap) return { x: 15000, y: 15000 };
    return { x: (wrap.scrollLeft + wrap.clientWidth / 2) / z, y: (wrap.scrollTop + wrap.clientHeight / 2) / z };
}
// How many copies the ×N buttons drop (cast flyout and the library's cast cells); remembered per install
function castBatch() { var n = 1; try { n = parseInt(localStorage.getItem('wp_castBatch') || '1', 10); } catch (e) {} return (n >= 1 && n <= 50) ? n : 1; }
function setCastBatch(v) {
    var n = parseInt(v, 10); if (!(n >= 1 && n <= 50)) return castBatch();
    try { localStorage.setItem('wp_castBatch', String(n)); } catch (e) {}
    Array.prototype.forEach.call(document.querySelectorAll('.cm-cast-five, .cast-cell-five, .img-cell-batch'), function(b) { b.textContent = '\u00d7' + n; b.title = 'Drop ' + n + ' cop' + (n === 1 ? 'y' : 'ies') + (b.classList.contains('cm-cast-five') ? ' here' : ' at the centre of your view'); });
    Array.prototype.forEach.call(document.querySelectorAll('.cast-batch, .cm-batch'), function(i) { if (i.value !== String(n)) i.value = n; });
    var addBtn = document.getElementById('imgLibPreviewAdd'), pvEl = document.getElementById('imgLibPreview');
    if (addBtn && pvEl && pvEl.style.display !== 'none' && !_imgLibPick) addBtn.textContent = n > 1 ? 'Add \u00d7' + n + ' to map' : 'Add to map';
    return n;
}
function castMenuHtml(camp) {
    var list = Object.values(castOf(camp)).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    // One row; the members live in a flyout so the rest of the menu keeps its size whatever the cast holds
    if (!list.length) return '<div class="menu-item cm-session" data-act="cast-manage" title="Right-click a character token and choose Save to Campaign Cast to fill it">&#9733; Campaign Cast <span style="color:var(--dim); font-size:11px;">— empty</span></div>';
    var html = '<div class="menu-item cm-cast-open" title="Click a member to place a copy here, ×5 for five"><span>&#9733; Campaign Cast</span><span style="color:var(--dim); font-size:11px;">' + list.length + '</span><span style="margin-left:auto; color:var(--dim);">&#8250;</span><div class="cm-sub">';
    html += '<div class="cm-sub-head">' + (list.length > 8 ? '<input type="text" class="cm-filter" placeholder="Filter the cast\u2026">' : '<span style="flex:1; color:var(--dim); font-size:11px;">One copy per click</span>')
          + '<label class="cm-batch-wrap" title="How many copies the \u00d7 button drops (1\u201350)">\u00d7<input type="number" class="cm-batch" min="1" max="50" value="' + castBatch() + '"></label></div>';
    list.forEach(function(c) {
        html += '<div class="menu-item cm-session cm-cast-row" data-act="cast" data-cid="' + esc(c.id) + '" data-name="' + esc((c.name || '').toLowerCase()) + '" style="display:flex; align-items:center; gap:8px;">'
              + (picRef(c.src) ? '<img src="' + esc(picRef(c.src)) + '" alt="" style="width:20px; height:20px; object-fit:cover; border-radius:4px;">' : '&#9733;')
              + '<span style="flex:1;">' + esc(c.name) + '</span>'
              + '<button class="tool ghost cm-cast-five" data-cid="' + esc(c.id) + '" title="Drop ' + castBatch() + ' copies here" style="padding:1px 7px; font-size:10.5px;">&times;' + castBatch() + '</button></div>';
    });
    html += '<div class="menu-divider"></div><div class="menu-item cm-session" data-act="cast-manage">&#9998; Manage Cast…</div></div></div>';
    return html;
}
/* ---------- combat: roster panel (GM) and the turn strip (everyone) ---------- */
var combatDraft = null;   // { mapId, fid, rows:[{id,name,tokId,init,src,on,busy}], running }: fid, the fight it edits (fold 2), null for a new one
function fightsHere(mapId) { var n = window.wpNet; return n && typeof n.fightsOn === 'function' ? n.fightsOn(mapId) : []; }   // fold 2: the fights on a map, in the order begun
// [lookcheck:onturn-start]
// Fold 2's review: the board's ring on a token whose turn it is, in any fight on that map, while a table is up
function onTurnHere(n, mapId, tokId) {
    if (!n || !n.active || typeof n.fightsOn !== 'function' || typeof tokId !== 'string' || !tokId) return false;
    return n.fightsOn(mapId).some(function(f) { var c = n.combats && n.combats[f], r = c && Array.isArray(c.rows) ? c.rows[c.turn] : null; return !!(r && r.tokId === tokId); });
}
// [lookcheck:onturn-end]
function combatRowsFor(mapId, opts) {
    var camp = getActiveCampaign(), map = camp && camp.items[mapId]; if (!map) return [];
    var n = window.wpNet, fidR = opts && typeof opts.fid === 'string' ? opts.fid : null, running = fidR && n.combats && Object.prototype.hasOwnProperty.call(n.combats, fidR) ? n.combats[fidR] : null;
    var elsewhere = Object.create(null); fightsHere(mapId).forEach(function(f) { if (f !== fidR) (n.combats[f].rows || []).forEach(function(r) { if (r && typeof r.tokId === 'string') elsewhere[r.tokId] = 1; }); });   // fold 2: a token is in one fight at a time
    var byTok = {}; (running ? running.rows : []).forEach(function(r) { if (r.tokId) byTok[r.tokId] = r; });
    // live target pairs on this map: whoever is targeting (their own token) and whoever they target
    var pair = {}; ((opts && opts.pre) || []).forEach(function(id) { pair[id] = 'targeted'; });
    Object.keys((n && n.targets) || {}).forEach(function(pid) {
        var t = n.targets[pid]; if (!t || t.mapId !== mapId) return;
        pair[t.id] = 'targeted';
        var mine = (map.whiteboard || []).find(function(w) { return w.isChar && !w.hidden && w.ownerId === pid; });
        if (mine) pair[mine.id] = pair[mine.id] || 'targeting';
    });
    var rows = (map.whiteboard || []).filter(function(w) { return w.isChar && !w.hidden; }).map(function(w) {
        var was = byTok[w.id], busy = !was && elsewhere[w.id] === 1;
        var on = !busy && (!!was || !!pair[w.id]);   // only a running combat's rows and the tokens in a target pair start ticked; never a token in another fight (fold 2)
        return { id: was ? was.id : 'r' + w.id, name: w.charName || w.name || 'Unnamed', tokId: w.id, init: was ? was.init : 0, rolled: !!(was && was.rolled === 1), tb: was && Array.isArray(was.tb) ? was.tb.slice() : undefined, src: w.src || null, on: on, busy: busy, party: !!w.ownerId, targeted: pair[w.id] || '', charId: w.charId || null };
    });
    // custom rows of a running combat (no token) stay
    (running ? running.rows : []).forEach(function(r) { if (!r.tokId) rows.push({ id: r.id, name: r.name, tokId: null, init: r.init, rolled: r.rolled === 1, tb: Array.isArray(r.tb) ? r.tb.slice() : undefined, src: null, on: true, custom: true }); });
    if (running) {   // keep the running order first, newcomers after
        var order = {}; running.rows.forEach(function(r, i) { order[r.id] = i; });
        rows.sort(function(a, b) { var x = order[a.id] !== undefined ? order[a.id] : 999 + rows.indexOf(a), y = order[b.id] !== undefined ? order[b.id] : 999 + rows.indexOf(b); return x - y; });
    } else rows.sort(function(a, b) { return (b.targeted ? 1 : 0) - (a.targeted ? 1 : 0) || (b.party ? 1 : 0) - (a.party ? 1 : 0) || a.name.localeCompare(b.name); });
    return rows;
}
function combatSortByInit(rows) {   // high to low, ties keep their place (initiative O1: the core's one rule, shared with the host's re-sort)
    var S = window.wpSystemCore; if (S && S.orderByInit) return S.orderByInit(rows, window.wpSheets && window.wpSheets.initTieNow ? window.wpSheets.initTieNow() : null);   // initiative O2: the system's tie steps
    return rows.map(function(r, i) { return { r: r, i: i }; }).sort(function(a, b) { return (b.r.init - a.r.init) || (a.i - b.i); }).map(function(x) { return x.r; });
}
function renderCombatModal() {
    var m = document.getElementById('combatModal'), list = document.getElementById('combatRows'); if (!m || !list || !combatDraft) return;
    var camp = getActiveCampaign(), map = camp && camp.items[combatDraft.mapId];
    var mapNm = map && map.meta && map.meta.title || combatDraft.mapId, fidsM = fightsHere(combatDraft.mapId), atM = combatDraft.fid ? fidsM.indexOf(combatDraft.fid) : -1;
    document.getElementById('combatMapName').textContent = mapNm + (atM >= 0 && fidsM.length > 1 ? ', fight ' + (atM + 1) + ' of ' + fidsM.length : (!combatDraft.fid && fidsM.length ? ', another fight' : ''));   // fold 2: which fight on the map
    var running = combatDraft.running, findHere = findWho(window.wpNet, !!window.wpStream), amHere = getActiveMap();   // backlog 26: a name finds its token on this screen
    document.getElementById('combatStartBtn').textContent = running ? 'Update Combat' : 'Start Combat';
    var rallB = document.getElementById('combatRollAllBtn'); if (rallB) rallB.style.display = window.wpSheets && window.wpSheets.hasInitRoll() ? '' : 'none';   // initiative O1: only with an initiative roll in the system
    list.innerHTML = combatDraft.rows.map(function(r, i) {
        return '<div class="combat-row' + (r.on ? '' : ' off') + '" draggable="true" data-i="' + i + '">'
            + '<span class="combat-grip" title="Drag to reorder">&#8942;</span>'
            + '<input type="checkbox" class="combat-on"' + (r.on ? ' checked' : '') + (r.busy ? ' disabled title="In another fight on this map: a token is in one fight at a time"' : ' title="In the fight"') + '>'
            + (r.src ? '<img class="combat-face" src="' + esc(resolveImg(r.src)) + '" alt="">' : '<span class="combat-face combat-face-empty">' + (r.custom ? '&#10022;' : '&#9733;') + '</span>')
            + '<span class="combat-name">' + findName(r.name, r.tokId, !!findOf(combatDraft.mapId, r.tokId, findHere, amHere, state.viewMode)) + (r.party ? ' <span class="combat-tag">party</span>' : '') + (r.targeted ? ' <span class="combat-tag" style="color:var(--gold); border-color:var(--gold);">' + r.targeted + '</span>' : '') + (r.custom ? ' <span class="combat-tag">custom</span>' : '') + (r.busy ? ' <span class="combat-tag">in another fight on ' + esc(mapNm) + '</span>' : '') + '</span>'
            + (r.charId && window.wpSheets && window.wpSheets.hasInitRoll() ? '<button class="tool ghost combat-roll" title="Roll initiative from the character sheet: a table roll, or yours alone when it reads a GM-only value. Players see the order, never the number" aria-label="Roll initiative">' + (window.wpDieIcons && typeof window.wpDieIcons.dieSvg === 'function' ? window.wpDieIcons.dieSvg('d6') : '&#127922;') + '</button>' : '')
            + '<input type="number" class="combat-init field" value="' + (r.init || 0) + '" title="Initiative — higher goes first">'
            + '<button class="tool ghost combat-up" title="Move up">&#9650;</button><button class="tool ghost combat-down" title="Move down">&#9660;</button>'
            + (r.custom ? '<button class="tool ghost danger combat-del" title="Remove this row">&times;</button>' : '')
            + '</div>';
    }).join('') || '<div style="color:var(--dim); padding:8px;">No character tokens on this map. Add a custom row below, or place tokens first.</div>';
    m.style.display = 'flex';
}
function openCombatModal(mapId, opts) {   // opts.fid: that fight's roster; opts.fresh: a new fight beside those on the map (fold 2); else the strip's fight there, or a new one
    var n = window.wpNet; if (!(n && n.active && n.role === 'host')) { toast('Combat runs at the table — host a session first.'); return; }
    opts = opts || {};
    var fid = opts.fresh === true ? null : (typeof opts.fid === 'string' && fightsHere(mapId).indexOf(opts.fid) >= 0 ? opts.fid : stripFightId(mapId));
    combatDraft = { mapId: mapId, fid: fid, rows: combatRowsFor(mapId, Object.assign({}, opts, { fid: fid })), running: !!fid };
    renderCombatModal();
}
window.wpOpenCombat = openCombatModal;
(function wireCombatModal() {
    var m = document.getElementById('combatModal'), list = document.getElementById('combatRows'); if (!m || !list) return;
    function rowOf(e) { var r = e.target.closest && e.target.closest('.combat-row'); return r ? +r.dataset.i : -1; }
    list.addEventListener('change', function(e) {
        var i = rowOf(e); if (i < 0) return;
        if (e.target.classList.contains('combat-on')) { combatDraft.rows[i].on = e.target.checked && !combatDraft.rows[i].busy; renderCombatModal(); }   // fold 2: never a token in another fight
        if (e.target.classList.contains('combat-init')) { combatDraft.rows[i].init = Number(e.target.value) || 0; combatDraft.rows[i].rolled = true; delete combatDraft.rows[i].tb; combatDraft.rows = combatSortByInit(combatDraft.rows); renderCombatModal(); }   // initiative O1: a number given is its number (a player's roll no longer changes it)
    });
    list.addEventListener('keydown', function(e) { e.stopPropagation(); });
    m.addEventListener('pointerdown', function() { rosterUnpeek(m); });   // backlog 26: a press on the roster while it is faded for a find brings it back at once
    list.addEventListener('click', function(e) {
        var i = rowOf(e); if (i < 0) return;
        var rows = combatDraft.rows;
        if (e.target.closest('.combat-up') && i > 0) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); renderCombatModal(); }
        else if (e.target.closest('.combat-down') && i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); renderCombatModal(); }
        else if (e.target.closest('.combat-roll')) { var rr = window.wpSheets && rows[i].charId ? window.wpSheets.rollInit(rows[i].charId, { priv: combatRollPriv(combatDraft.mapId, rows[i].tokId) }) : null; if (rr && rr.error) toast(rr.error); else if (rr && typeof rr.value === 'number') { rows[i].init = rr.value; rows[i].rolled = true; delete rows[i].tb; combatDraft.rows = combatSortByInit(rows); renderCombatModal(); } }
        else if (e.target.closest('.combat-del')) { rows.splice(i, 1); renderCombatModal(); }
        else if (e.target.closest('.combat-find')) { if (combatFind(combatDraft.mapId, String(e.target.closest('.combat-find').dataset.tok || ''))) rosterPeek(m, FIND_MS + 200); }   // backlog 26: the token found on this screen, the roster faded while its ring shows
    });
    var dragI = -1;
    list.addEventListener('dragstart', function(e) { dragI = rowOf(e); if (dragI < 0) { e.preventDefault(); return; } e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragI)); } catch (err) {} });
    list.addEventListener('dragover', function(e) { if (dragI < 0) return; e.preventDefault(); var r = e.target.closest && e.target.closest('.combat-row'); list.querySelectorAll('.combat-row').forEach(function(x) { x.classList.toggle('drop-before', x === r); }); });
    list.addEventListener('drop', function(e) {
        e.preventDefault(); var j = rowOf(e); if (dragI < 0 || j < 0 || j === dragI) { dragI = -1; renderCombatModal(); return; }
        var rows = combatDraft.rows, mv = rows.splice(dragI, 1)[0]; rows.splice(j, 0, mv); dragI = -1; renderCombatModal();
    });
    list.addEventListener('dragend', function() { dragI = -1; list.querySelectorAll('.drop-before').forEach(function(x) { x.classList.remove('drop-before'); }); });
    // [systemcheck:rollall-start]
    // Initiative O1: Roll all — the system's initiative roll for every ticked row with a character that has no number yet (the reference VTT's Roll All);
    // a row rolled or given a number keeps it. One refusal (no roll, dice off) is said once and stops the rest
    // Secrets (R2): an initiative card names its creature, so one some player at the table would read as Hidden in their turn order (the host's one
    // judge, net.tokUnseen: hidden, or dropped by their fogged copy and never seen in this fight) rolls in private — the roster's per-row Roll too
    function combatRollPriv(mapId, tokId) {
        var n = window.wpNet; return !!(typeof tokId === 'string' && n && typeof n.tokUnseen === 'function' && n.tokUnseen(mapId, tokId));
    }
    function combatRollAll(draft) {
        var n = 0, held = [], heldW = ''; if (!draft || !window.wpSheets || !window.wpSheets.rollInit) return n;
        for (var k = 0; k < draft.rows.length; k++) {
            var r = draft.rows[k]; if (!r || !r.on || !r.charId || r.rolled) continue;
            var rr = window.wpSheets.rollInit(r.charId, { priv: combatRollPriv(draft.mapId, r.tokId) }); if (rr && rr.held) { held.push(r.name || 'A character'); heldW = heldW || rr.error || ''; continue; } if (rr && rr.error) { toast(rr.error); break; }   // held (1.5.4): what its initiative roll needs is not met, it is passed over
            if (rr && typeof rr.value === 'number') { r.init = rr.value; r.rolled = true; delete r.tb; n++; }
        }
        draft.rows = combatSortByInit(draft.rows);
        if (held.length) toast(held.join(', ') + (held.length === 1 ? ' was' : ' were') + ' passed over. ' + heldW);
        return n;
    }
    // [systemcheck:rollall-end]
    var rollAllBtn = document.getElementById('combatRollAllBtn');
    if (rollAllBtn) rollAllBtn.addEventListener('click', function() { if (!combatDraft) return; var nR = combatRollAll(combatDraft); if (!nR && !combatDraft.rows.some(function(r) { return r && r.on && r.charId && !r.rolled; })) toast('Every ticked character has its initiative already.'); renderCombatModal(); });   // 1.5.4: never said while a row was passed over or a roll refused
    var addBtn = document.getElementById('combatAddBtn'), addName = document.getElementById('combatAddName');
    function addCustom() {
        var name = (addName.value || '').trim(); if (!name) { addName.focus(); return; }
        combatDraft.rows.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.slice(0, 60), tokId: null, init: 0, src: null, on: true, custom: true });
        addName.value = ''; renderCombatModal();
    }
    if (addBtn) addBtn.addEventListener('click', addCustom);
    if (addName) addName.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Enter') addCustom(); });
    document.getElementById('combatCancelBtn').addEventListener('click', function() { m.style.display = 'none'; combatDraft = null; });
    document.getElementById('combatCloseBtn').addEventListener('click', function() { m.style.display = 'none'; combatDraft = null; });
    document.getElementById('combatStartBtn').addEventListener('click', function() {
        var n = window.wpNet; if (!combatDraft || !n) return;
        var rows = combatDraft.rows.filter(function(r) { return r.on && !r.busy; }).map(function(r) { var o = { id: r.id, name: r.name, tokId: r.tokId, init: r.init, src: r.src }; if (r.rolled) o.rolled = 1; if (Array.isArray(r.tb)) o.tb = r.tb; return o; });   // initiative O1: whether a row has its number
        if (!rows.length) { toast('Tick at least one combatant.'); return; }
        var was = combatDraft.fid && n.combats && Object.prototype.hasOwnProperty.call(n.combats, combatDraft.fid) ? n.combats[combatDraft.fid] : null;   // fold 2: the fight this roster edits, by its id
        var turn = 0, round = 1;
        if (was) { round = was.round; var curId = (was.rows[was.turn] || {}).id; var at = rows.findIndex(function(r) { return r.id === curId; }); turn = at >= 0 ? at : 0; }
        var midS = combatDraft.mapId, fidS = n.fightSet(was ? combatDraft.fid : null, { mapId: midS, round: round, turn: turn, rows: rows });
        if (!was && typeof fidS === 'string' && typeof stripShow === 'function') { stripShow(midS, fidS); if (typeof renderCombatStrip === 'function') renderCombatStrip(); }   // fold 2: a fight started here is the one this screen's strip shows
        m.style.display = 'none'; combatDraft = null;
    });
})();
// [lookcheck:stripfight-start]
// Fold 2 (backlog 152): a map may hold two fights. The strip shows one: the one picked here with its switch, else the one that holds this screen's own
// token, else the one the GM plays, else the first begun. The switch ("1 of 2") is this screen's own and changes nothing at the table
var _stripPick = Object.create(null);   // mapId -> the fight the strip shows there, as its switch left it
function stripFightId(mapId) {
    var n = window.wpNet, ids = fightsHere(mapId); if (!ids.length) return null;
    var pick = _stripPick[mapId]; if (typeof pick === 'string' && ids.indexOf(pick) >= 0) return pick;
    var camp = getActiveCampaign(), map = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, mine = Object.create(null);
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (w && w.isChar && w.ownerId && w.ownerId === n.myId && typeof w.id === 'string') mine[w.id] = 1; });
    var hit = ids.filter(function(f) { return (n.combats[f].rows || []).some(function(r) { return !!r && typeof r.tokId === 'string' && mine[r.tokId] === 1; }); })[0];
    if (hit) return hit;
    if (n.role === 'host' && ids.indexOf(n.fightOn) >= 0) return n.fightOn;
    return ids[0];
}
function stripSwitch(mapId) { var ids = fightsHere(mapId); if (ids.length < 2) return null; var next = ids[(ids.indexOf(stripFightId(mapId)) + 1) % ids.length]; _stripPick[mapId] = next; return next; }   // the next fight on that map, on this screen alone
function stripShow(mapId, fid) { var ids = typeof mapId === 'string' ? fightsHere(mapId) : []; if (typeof fid === 'string' && ids.indexOf(fid) >= 0) _stripPick[mapId] = fid; }   // a fight this screen just started is the one its strip shows
window.wpStripFight = function(mapId) { var n = window.wpNet, f = typeof mapId === 'string' ? stripFightId(mapId) : null; return f && n && n.combats ? n.combats[f] : null; };   // the pill and the menus say the fight the strip shows
// [lookcheck:stripfight-end]
// 1.5.7: the turn's move as the strip says it, "Moved 2 of 5 hexes (5 yd)": the host's own record on the GM's screen, the copy the host sends a player
// for their own token on turn; nothing where the turn has no limit
function turnMoveOf(n, fid, c, tokId) {
    if (!n || !c) return null; var cur = c.rows && c.rows[c.turn]; if (!cur || (tokId && cur.tokId !== tokId)) return null;
    if (n.role === 'host') { var st = n.turnMove && Object.prototype.hasOwnProperty.call(n.turnMove, fid) ? n.turnMove[fid] : null; return st && typeof st.allow === 'number' && st.rowId === cur.id ? { m: st.moved, a: st.allow } : null; }
    return c.mv && typeof c.mv.m === 'number' && typeof c.mv.a === 'number' ? { m: c.mv.m, a: c.mv.a } : null;
}
function stripMoveHtml(n, fid, c, map) {
    var mv = turnMoveOf(n, fid, c, null); if (!mv || !n.cellsText) return '';
    var over = mv.m > mv.a + 0.05, r = Math.round(mv.m * 10) / 10;
    return '<span class="combat-strip-move' + (over ? ' over' : '') + '" data-tip="How far the token on turn has moved, of its move this turn">Moved ' + esc(String(r)) + ' of ' + esc(n.cellsText(mv.a, map)) + '</span>';
}
// 1.5.7: a player's drag of their token on turn says live how far it goes and what would be left, beside the pointer (the GM's own drags count against no move, so the GM has the strip alone); nothing for any other drag
var _moveTipEl = null;
window.wpMoveTip = function(item, mapId, ox, oy, cx, cy) {
    var n = window.wpNet, hide = function() { if (_moveTipEl) _moveTipEl.style.display = 'none'; };
    if (!item || !n || !n.active || n.role !== 'client' || !item.isChar || !window.wpFog || !window.wpFog.moveCells || !n.cellsText) return hide();
    var am = getActiveMap(); if (!am || am.id !== mapId || !n.combats) return hide();
    var mv = null; Object.keys(n.combats).some(function(fid) { var c = n.combats[fid]; if (!c || c.mapId !== mapId) return false; mv = turnMoveOf(n, fid, c, item.id); return !!mv; });
    if (!mv) return hide();
    var camp = getActiveCampaign(), dg = camp && camp.system && camp.system.combat && camp.system.combat.turn ? camp.system.combat.turn.diag : '';
    var d = 0; try { d = window.wpFog.moveCells(am, item, ox, oy, item.x, item.y, dg, {}) || 0; } catch (e) { d = 0; }
    var left = mv.a - mv.m - d, r = Math.round(d * 10) / 10;
    if (!_moveTipEl) { _moveTipEl = document.createElement('div'); _moveTipEl.id = 'moveTip'; _moveTipEl.className = 'move-tip'; document.body.appendChild(_moveTipEl); }
    _moveTipEl.textContent = '+' + n.cellsText(r, am) + ' · ' + (left >= -0.05 ? n.cellsText(Math.max(0, left), am) + ' left' : n.cellsText(-left, am) + ' past your move');
    _moveTipEl.classList.toggle('over', left < -0.05);
    _moveTipEl.style.left = Math.round(cx + 18) + 'px'; _moveTipEl.style.top = Math.round(cy + 18) + 'px'; _moveTipEl.style.display = 'block';
};
function renderCombatStrip() {
    if (typeof window !== 'undefined' && window.wpPills) window.wpPills.sync();   // the top row's Round pill (pills.js) says the same fight
    var strip = document.getElementById('combatStrip'); if (!strip) return;
    var n = window.wpNet, am = getActiveMap();
    var fidS = n && n.active && am && am.type === 'map' && state.viewMode === 'visual' ? stripFightId(am.id) : null, c = fidS ? n.combats[fidS] : null;
    if (!c) { strip.innerHTML = ''; strip.wpDrawn = ''; strip.style.display = 'none'; return; }
    var idsS = fightsHere(am.id), atS = idsS.indexOf(fidS);
    var cur = c.rows[c.turn] || {}, nxt = c.rows[(c.turn + 1) % c.rows.length] || {};
    var host = n.role === 'host', mine = !host && n.myTurnTok ? n.myTurnTok() : null;   // turn-based combat T2: the player on turn ends it here
    if (mine && mine.fid && mine.fid !== fidS) mine = null;   // fold 2: on the strip of the fight they are on turn in
    strip.style.display = 'flex';
    var who = findWho(n, !!window.wpStream), nameOf = function(r) { return findName(r.name || '', r.tokId, !!findOf(am.id, r.tokId, who, am, state.viewMode)); };   // backlog 26: a name that finds its token on this screen is a button
    var myTokIds = {}; if (!host && am && Array.isArray(am.whiteboard)) am.whiteboard.forEach(function(w) { if (w && w.isChar && w.ownerId && w.ownerId === n.myId && typeof w.id === 'string') myTokIds[w.id] = 1; });   // initiative O3: whose held rows a player may act from
    var heldH = c.rows.map(function(r, i) { return r && r.held === 1 && i !== c.turn ? '<span class="combat-strip-held" data-tip="Holding their turn: Act puts them right after whoever is acting">held ' + nameOf(r) + '</span>' + (host || (typeof r.tokId === 'string' && myTokIds[r.tokId] === 1) ? '<button class="combat-strip-btn" data-act="act" data-row="' + esc(r.id) + '" title="Act now: right after whoever is acting">Act</button>' : '') : ''; }).join('');
    // drawn again only when it changed (found live, 2026-10-17): a redraw between a press and its click took the button pressed off the page, so
    // the press did nothing. What was written last is kept on the strip, since a hover moves each title into data-tip and the page's markup changes
    var html = (idsS.length > 1 ? '<button class="combat-strip-btn combat-strip-switch" data-act="switch" title="' + idsS.length + ' fights run on this map: show the next one. This changes nothing for anyone else">' + (atS + 1) + ' of ' + idsS.length + '</button>' : '')
        + '<span class="combat-strip-round" title="Round">&#9876; R' + c.round + '</span>'
        + (c.side === 'pc' || c.side === 'rest' ? '<span class="combat-strip-side" title="Side initiative: this round&rsquo;s sides roll put this side first">' + (c.side === 'pc' ? 'players first' : 'the rest first') + '</span>' : '')
        + (host ? '<button class="combat-strip-btn" data-act="prev" title="Previous turn">&#9664;</button>' : '')
        + '<span class="combat-strip-cur" data-tip="Whose turn it is">' + (cur.src ? '<img src="' + esc(resolveImg(cur.src)) + '" alt="">' : '') + nameOf(cur) + '</span>'
        + (typeof stripMoveHtml === 'function' ? stripMoveHtml(n, fidS, c, am) : '')   // 1.5.7: the turn's move, asked through typeof for the suites that slice the strip alone
        + '<span class="combat-strip-next" data-tip="Up next">next ' + nameOf(nxt) + '</span>'
        + (mine ? '<button class="combat-strip-btn combat-strip-endturn" data-act="endturn" title="End your turn: play moves on to the next in the order">End turn</button>' : '')
        + (host || mine ? '<button class="combat-strip-btn" data-act="hold" title="Hold this turn: play moves on, and Act later this round puts them right after whoever is acting (a hold not used by the round&rsquo;s end is lost)">Hold</button>' : '') + heldH
        + (host ? '<button class="combat-strip-btn" data-act="next" title="Next turn">&#9654;</button><button class="combat-strip-btn" data-act="edit" title="Combat roster">&#9998;</button><button class="combat-strip-btn danger" data-act="end" title="End combat">&times;</button>' : '');
    if (strip.wpDrawn !== html) { strip.innerHTML = html; strip.wpDrawn = html; }
}
window.wpRenderCombatStrip = renderCombatStrip;
(function wireCombatStrip() {
    var strip = document.getElementById('combatStrip'); if (!strip) return;
    strip.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    strip.addEventListener('click', function(e) {
        var fb = e.target.closest && e.target.closest('.combat-find');
        if (fb) { e.stopPropagation(); var amF = getActiveMap(); if (amF) combatFind(amF.id, String(fb.dataset.tok || '')); return; }   // backlog 26: a name finds its token on this screen
        var b = e.target.closest && e.target.closest('.combat-strip-btn'); if (!b) return;
        e.stopPropagation();
        var n = window.wpNet, am = getActiveMap();
        if (b.dataset.act === 'switch') { if (am && stripSwitch(am.id)) renderCombatStrip(); return; }   // fold 2: the next fight on this map, on this screen alone
        if (b.dataset.act === 'endturn') { var rt = n && n.turnEnd ? n.turnEnd() : null; if (rt && rt.error) toast(rt.error); return; }   // turn-based combat T2
        if (n && n.role !== 'host' && (b.dataset.act === 'hold' || b.dataset.act === 'act')) { var rh = b.dataset.act === 'hold' ? (n.turnHold ? n.turnHold() : null) : (n.turnAct ? n.turnAct(String(b.dataset.row || '')) : null); if (rh && rh.error) toast(rh.error); return; }   // initiative O3: a player's own hold or act
        if (!(n && n.role === 'host' && am)) return;
        var fidB = stripFightId(am.id); if (!fidB) return;   // fold 2: the fight the strip shows, by its id
        if (b.dataset.act === 'next') n.fightStep(fidB, 1);
        else if (b.dataset.act === 'prev') n.fightStep(fidB, -1);
        else if (b.dataset.act === 'edit') openCombatModal(am.id, { fid: fidB });
        else if (b.dataset.act === 'end') n.fightEnd(fidB);
        else if (b.dataset.act === 'hold') n.fightHold(fidB);   // initiative O3
        else if (b.dataset.act === 'act') n.fightAct(fidB, String(b.dataset.row || ''));
    });
})();
// [lookcheck:combatfind-start]
/* Find on the map from a fight (1.5.4, backlog 26; the owner picked "Find on map from the turn strip": "a press on a name in the turn strip or
   the roster pans the map to that token and pings it. The Characters section already has Find on the map; this adds it where you run a
   fight."). A press on a name there did nothing before, so the name itself is the button. It moves THIS screen alone: the pan is the board's
   own scroll, which the scroll handler keeps as a view as it keeps a pan by hand (io.js saveView: nothing stamped, recorded or sent), and the
   ring is fx.js's own ping drawn here through its receiver (wpFx.receive), never through play, which sends. The GM finds any token of the
   fight on the map on screen, hidden or not; a player only a token their own copy of the map holds, which never holds a hidden one. A row
   with no token, a row a player reads as Hidden, a token this screen's copy does not hold and every name in the stream window stay plain
   text. The strip is drawn again at every redraw, so a name's tip is data-tip, never a title the browser would show beside it, and so is
   the tip of the part of the strip that holds the name: the browser shows an element's title for whatever inside it has none. */
var FIND_MS = 1600;   // as long as the GM's own ping shows (fx.js PING_MS)
// Who may find here: 'gm' on the GM's own screen at a table, 'player' on a player's app, '' in the stream window or away from a table
function findWho(n, stream) { if (stream === true || !n || n.active !== true || n.stream) return ''; return n.role === 'host' ? 'gm' : n.role === 'client' ? 'player' : ''; }
// The token a name finds on this screen's copy of a map, or null. gm: the GM's own screen, where a hidden token is found too
function findTok(map, tokId, gm) {
    if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard) || typeof tokId !== 'string' || !tokId) return null;
    for (var i = 0; i < map.whiteboard.length; i++) {
        var w = map.whiteboard[i]; if (!w || typeof w !== 'object' || w.id !== tokId) continue;
        if (typeof w.x !== 'number' || typeof w.y !== 'number' || !isFinite(w.x) || !isFinite(w.y)) return null;
        return w.hidden && gm !== true ? null : w;
    }
    return null;
}
// The token a fight's row finds here: only on the map on screen, shown as the play map, and only for whoever may find
function findOf(mapId, tokId, who, am, view) { return (who === 'gm' || who === 'player') && !!am && am.id === mapId && view === 'visual' ? findTok(am, tokId, who === 'gm') : null; }
// A name as the strip and the roster write it: a button where it finds a token here, else the plain name. Everything through esc
function findName(name, tokId, ok) {
    var t = esc(String(name || ''));
    if (ok !== true || typeof tokId !== 'string' || !tokId) return t;
    var tip = esc('Find ' + (String(name || '') || 'this token') + ' on the map');
    return '<button type="button" class="combat-find" data-tok="' + esc(tokId) + '" data-tip="' + tip + '" aria-label="' + tip + '">' + t + '</button>';
}
// The scroll that puts the token's middle in the middle of a view vw by vh at zoom z, with that middle on the board
function findScroll(tok, z, vw, vh) {
    var zz = typeof z === 'number' && isFinite(z) && z > 0 ? z : 1, w = Number(tok.w), h = Number(tok.h);
    var x = tok.x + (isFinite(w) && w > 0 ? w : 60) / 2, y = tok.y + (isFinite(h) && h > 0 ? h : 52) / 2;
    return { x: x, y: y, left: Math.max(0, Math.round(x * zz - (Number(vw) || 0) / 2)), top: Math.max(0, Math.round(y * zz - (Number(vh) || 0) / 2)) };
}
// fx.js's ping round that token: as far out as its larger side, never less than 40
function findPing(mapId, at, tok) { var w = Number(tok.w), h = Number(tok.h); return { kind: 'burst', look: 'ping', mapId: mapId, x: at.x, y: at.y, r: Math.round(Math.max(isFinite(w) ? w : 0, isFinite(h) ? h : 0, 40)), ms: FIND_MS }; }
// The press: this screen is moved to the token, which is marked. Answers 'ring' (fx.js's ping drawn here), 'pulse' (Visual effects off: the
// token's own pulse), 'pan' (moved, nothing to mark) or '' (nothing done; where the token is no longer here, said)
function combatFind(mapId, tokId) {
    var who = findWho(window.wpNet, !!window.wpStream); if (!who) return '';
    var am = getActiveMap(), tok = findOf(mapId, tokId, who, am, state.viewMode);
    if (!tok) { toast(who === 'gm' ? 'That token is no longer on this map.' : 'That token is not in sight now.'); return ''; }
    var wrap = document.getElementById('whiteboardWrap'); if (!wrap) return '';
    var at = findScroll(tok, state.zoomLevel, wrap.clientWidth, wrap.clientHeight);
    wrap.scrollLeft = at.left; wrap.scrollTop = at.top;
    var C = window.wpFxCore, F = window.wpFx, on = !window.wpVtt || !!window.wpVtt.on('fx');
    var p = on && C && typeof C.cleanFx === 'function' && F && typeof F.receive === 'function' ? C.cleanFx(findPing(am.id, at, tok)) : null;
    if (p) { F.receive(p); return 'ring'; }
    var el = state.wbEls && Object.prototype.hasOwnProperty.call(state.wbEls, tok.id) ? state.wbEls[tok.id] : null;
    if (!el || !el.classList) return 'pan';
    el.classList.remove('fx-pulse'); void el.offsetWidth; el.classList.add('fx-pulse');
    el.addEventListener('animationend', function done() { el.classList.remove('fx-pulse'); el.removeEventListener('animationend', done); });
    return 'pulse';
}
// The roster lies over the map: a find from it fades it while the ring shows, so the map shows under it. A press on it, or the time, brings
// it back
var _peekT = null;
function rosterUnpeek(m) { if (_peekT) { clearTimeout(_peekT); _peekT = null; } if (m && m.classList) m.classList.remove('combat-peek'); }
function rosterPeek(m, ms) { if (!m || !m.classList) return; rosterUnpeek(m); m.classList.add('combat-peek'); _peekT = setTimeout(function() { _peekT = null; m.classList.remove('combat-peek'); }, ms); }
// [lookcheck:combatfind-end]
function openCastModal() {
    var m = document.getElementById('castModal'), list = document.getElementById('castList'); if (!m || !list) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var entries = Object.values(castOf(camp)).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    list.innerHTML = entries.length ? entries.map(function(c) {
        return '<div class="cast-row" data-cid="' + esc(c.id) + '">' + (picRef(c.src) ? '<img src="' + esc(picRef(c.src)) + '" alt="">' : '<div class="cast-thumb-empty">&#9733;</div>')
             + '<div style="flex:1; min-width:0;"><input class="field cast-name" value="' + esc(c.name) + '" placeholder="Name"><input class="field cast-stats" value="' + esc(c.charStats || '') + '" placeholder="Line under the name (optional)" style="margin-top:4px; font-size:12px;"></div>'
             + '<button class="tool ghost danger cast-del" title="Remove from the cast (tokens already placed stay)">&times;</button></div>';
    }).join('') : '<div style="color:var(--dim); padding:12px; line-height:1.5;">Nothing saved yet. Right-click a character token on a play map and choose <b>Save to Campaign Cast</b>; then right-click empty space to drop copies.</div>';
    m.style.display = 'flex';
}
var _castList = document.getElementById('castList');
if (_castList) {
    _castList.addEventListener('input', function(e) {
        var row = e.target.closest('.cast-row'); if (!row) return;
        var camp = getActiveCampaign(); var c = camp && castOf(camp)[row.dataset.cid]; if (!c) return;
        if (e.target.classList.contains('cast-name')) c.name = e.target.value.slice(0, 80);
        if (e.target.classList.contains('cast-stats')) c.charStats = e.target.value.slice(0, 200);
        import('./io.js').then(function(m) { m.save(false); });
    });
    _castList.addEventListener('click', function(e) {
        var del = e.target.closest('.cast-del'); if (!del) return;
        var row = del.closest('.cast-row'); var camp = getActiveCampaign(); if (!camp) return;
        delete castOf(camp)[row.dataset.cid];
        import('./io.js').then(function(m) { m.save(true); });
        openCastModal();
    });
    _castList.addEventListener('keydown', function(e) { e.stopPropagation(); });
}
var _castClose = document.getElementById('castCloseBtn');
if (_castClose) _castClose.addEventListener('click', function() { document.getElementById('castModal').style.display = 'none'; });

// Session menu on empty play-map space (only while a session is running)
// Place the context menu under the pointer, in the window's own coordinates (position: fixed). It used to be placed inside the
// board's box, which cuts whatever reaches past its edges: a tall menu opened low on the screen lost its first rows under the header.
// [systemcheck:placemenu-start]
function placeMenu(cMenu, e) {
    // A menu taller than the window (a character token's has twenty rows): compact rows first, and when that is not enough its own height
    // limit and scroll — never rows off screen. Judged afresh each time the menu is placed; called with no event (its rows changed while it
    // was up) it is fitted again where it stands.
    var room = window.innerHeight - 12;
    cMenu.style.position = 'fixed';
    cMenu.classList.remove('compact', 'tall'); cMenu.style.maxHeight = '';
    if (cMenu.offsetHeight > room) cMenu.classList.add('compact');
    if (cMenu.offsetHeight > room) { cMenu.classList.add('tall'); cMenu.style.maxHeight = room + 'px'; }
    if (!cMenu._wheelKept) { cMenu._wheelKept = true; cMenu.addEventListener('wheel', function(we) { if (cMenu.classList.contains('tall')) we.stopPropagation(); }, { passive: true }); }   // scrolling a tall menu never zooms the board under it
    var x = e ? e.clientX : parseFloat(cMenu.style.left) || 0, y = e ? e.clientY : parseFloat(cMenu.style.top) || 0;
    cMenu.style.left = x + 'px'; cMenu.style.top = y + 'px';
    // keep it on screen
    var r = cMenu.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) cMenu.style.left = Math.max(6, x - (r.right - window.innerWidth + 6)) + 'px';
    if (r.bottom > window.innerHeight - 6) cMenu.style.top = Math.max(6, y - (r.bottom - window.innerHeight + 6)) + 'px';
}
// [systemcheck:placemenu-end]
// The table menu: Campaign Cast, Players ("Bring here"), Session actions. Returns the html and a
// wire() for its items, so it can stand alone (empty space) or hang under an item menu.
function tableMenuParts(e, role) {
    var n = window.wpNet, camp = getActiveCampaign(), html = '';
    var wrap = document.getElementById('whiteboardWrap'), b = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 }, z = state.zoomLevel || 1;
    var pt = { x: (e.clientX - b.left + (wrap ? wrap.scrollLeft : 0)) / z, y: (e.clientY - b.top + (wrap ? wrap.scrollTop : 0)) / z };
    var players = camp && camp.players ? Object.keys(camp.players).map(function(id) { return { id: id, name: camp.players[id].name || id }; }).sort(function(a, c) { return a.name.localeCompare(c.name); }).slice(0, 12) : [];
    function head(label) { return '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + label + '</div>'; }
    function bringItems() { return players.map(function(p) { return '<div class="menu-item cm-session" data-act="bring" data-pid="' + esc(p.id) + '">&#10148; Bring ' + esc(p.name) + ' here</div>'; }).join(''); }
    if (role === 'client') {
        html += head('Session') + '<div class="menu-item cm-session" data-act="leave" style="color:var(--danger)">Leave Session</div>';
    } else {
        var nextScene = camp ? Object.values(camp.items).find(function(it) { return it.type === 'planner' && it.meta && it.meta.status === 'next'; }) : null;
        if (nextScene) html += '<div class="menu-item cm-session" data-act="scene" data-id="' + esc(nextScene.id) + '" title="The planner marked Next. A click opens it over the map. Ctrl+click opens a new window. Alt+click opens the planner itself.">&#9654; Next scene: ' + esc(nextScene.meta.title || 'planner') + '</div><div class="menu-divider"></div>';
        var amPin = getActiveMap(), isPinned = !!(camp && amPin && Array.isArray(camp.pinnedMaps) && camp.pinnedMaps.indexOf(amPin.id) >= 0);
        if (amPin && amPin.type === 'map') html += '<div class="menu-item cm-session" data-act="pin" title="Pinned maps sit at the top of the Maps list">&#128204; ' + (isPinned ? 'Unpin this map' : 'Pin this map') + '</div>';
        if (role !== 'host') html += '<div class="menu-item cm-session" data-act="log">&#128220; Session Log\u2026</div>';
        html += '<div class="menu-divider"></div>';
        html += castMenuHtml(camp);
        if (role === 'host') {
            html += '<div class="menu-divider"></div>' + head('Session');
            var amM = getActiveMap(), combatM = amM && typeof window.wpStripFight === 'function' ? window.wpStripFight(amM.id) : null;   // fold 2: the fight the strip shows
            if (combatM) {
                var curM = combatM.rows[combatM.turn] || {};
                html += '<div class="menu-item cm-session" data-act="combat-next" title="Round ' + combatM.round + ' — ' + esc(curM.name || '') + ' is up">&#9876; Next Turn</div>';
                html += '<div class="menu-item cm-session" data-act="combat-prev">&#9194; Previous Turn</div>';
                html += '<div class="menu-item cm-session" data-act="combat-edit">&#9998; Combat Roster\u2026</div>';
                html += '<div class="menu-item cm-session" data-act="combat-end" style="color:var(--danger)">End Combat</div>';
                html += '<div class="menu-item cm-session" data-act="combat-new" title="Another fight on this map, with its own order and rounds. A token is in one fight at a time">&#9876; Start another fight here\u2026</div>';
            } else html += '<div class="menu-item cm-session" data-act="combat" title="Pick who is in the fight, give initiative, run the turns">&#9876; Start Combat\u2026</div>';
            html += '<div class="menu-item cm-session" data-act="notepad">&#128221; ' + (n.notepad && n.notepad.on ? (typeof n.notepadHidden === 'function' && n.notepadHidden() ? 'Show Table Notepad' : 'Put Away Table Notepad') : 'Open Table Notepad') + '</div>';
            html += '<div class="menu-divider"></div>';
            html += '<div class="menu-item cm-session" data-act="summon">&#128227; Summon Everyone Here</div>';
            html += '<div class="menu-item cm-session" data-act="travel">' + (n.travelLocked ? '&#128275; Allow Travel Between Maps' : '&#128274; Lock Travel Between Maps') + '</div>';
            html += '<div class="menu-item cm-session" data-act="pause">' + (n.paused ? '&#9654;&#65039; Resume the Table' : '&#9208;&#65039; Pause the Table') + '</div>';
            html += '<div class="menu-item cm-session" data-act="log">&#128220; Session Log\u2026</div>';
            html += '<div class="menu-item cm-session" data-act="end" style="color:var(--danger)">End Session for Everyone</div>';
        }
    }
    function wire(cMenu) {
        // The cast flyout: opens on hover or click, flips to the left / slides up when it would leave the window
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-cast-open'), function(row) {
            var sub = row.querySelector('.cm-sub');
            function fit() {
                if (!sub) return;
                sub.classList.remove('flip'); sub.style.top = '';
                var r = sub.getBoundingClientRect();
                if (r.right > window.innerWidth - 6) sub.classList.add('flip');
                if (r.bottom > window.innerHeight - 6) sub.style.top = (-(r.bottom - window.innerHeight + 8)) + 'px';
            }
            row.addEventListener('mouseenter', fit);
            row.addEventListener('click', function(ce) { ce.stopPropagation(); row.classList.toggle('open'); fit(); });
            var filter = row.querySelector('.cm-filter');
            if (filter) {
                filter.addEventListener('click', function(ce) { ce.stopPropagation(); });
                filter.addEventListener('keydown', function(ce) { ce.stopPropagation(); });
                filter.addEventListener('input', function() {
                    var q = filter.value.trim().toLowerCase();
                    Array.prototype.forEach.call(sub.querySelectorAll('.cm-cast-row'), function(r2) { r2.style.display = (!q || (r2.dataset.name || '').indexOf(q) >= 0) ? '' : 'none'; });
                });
            }
            var headEl = row.querySelector('.cm-sub-head');
            if (headEl) headEl.addEventListener('click', function(ce) { ce.stopPropagation(); });
            var batch = row.querySelector('.cm-batch');
            if (batch) {
                batch.addEventListener('keydown', function(ce) { ce.stopPropagation(); });
                batch.addEventListener('input', function() { if (batch.value >= 1 && batch.value <= 50) setCastBatch(batch.value); });
                batch.addEventListener('change', function() { batch.value = setCastBatch(batch.value); });
            }
        });
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-cast-five'), function(b5) {
            b5.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; castPlace(b5.dataset.cid, pt.x, pt.y, castBatch()); });
        });
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-session'), function(it) {
            it.addEventListener('click', function(ce) {
                ce.stopPropagation();
                cMenu.style.display = 'none';
                var act = it.dataset.act;
                if (act === 'summon') n.summonAll();
                else if (act === 'cast') castPlace(it.dataset.cid, pt.x, pt.y, 1);
                else if (act === 'cast-manage') openCastModal();
                else if (act === 'log') n.openSessionLog();
                else if (act === 'notepad') n.notepadToggle();
                else if (act === 'combat' || act === 'combat-edit') { var amX = getActiveMap(); if (amX) openCombatModal(amX.id, {}); }
                else if (act === 'combat-new') { var amW = getActiveMap(); if (amW) openCombatModal(amW.id, { fresh: true }); }   // fold 2: another fight beside the one on this map
                else if (act === 'combat-next') { var amN = getActiveMap(), fN = amN ? stripFightId(amN.id) : null; if (fN) n.fightStep(fN, 1); }
                else if (act === 'combat-prev') { var amP = getActiveMap(), fP = amP ? stripFightId(amP.id) : null; if (fP) n.fightStep(fP, -1); }
                else if (act === 'combat-end') { var amE = getActiveMap(), fE = amE ? stripFightId(amE.id) : null; if (fE) n.fightEnd(fE); }
                else if (act === 'pin') {
                    var campP = getActiveCampaign(), amP = getActiveMap(); if (!campP || !amP) return;
                    campP.pinnedMaps = (Array.isArray(campP.pinnedMaps) ? campP.pinnedMaps : []).filter(function(id) { return campP.items[id]; });
                    var atP = campP.pinnedMaps.indexOf(amP.id);
                    if (atP >= 0) campP.pinnedMaps.splice(atP, 1); else campP.pinnedMaps.push(amP.id);
                    import('./io.js').then(function(m) { m.save(true); m.toast(atP >= 0 ? 'Unpinned.' : 'Pinned — it sits at the top of the Maps list now.'); });
                    import('./sidebar.js').then(function(m) { m.updateSidebarNav(); });
                }
                else if (act === 'scene') { if (window.wpPageShelf) window.wpPageShelf.open(it.dataset.id, window.wpPageShelf.wayNow(ce)); }   // 1.5.4 (pageshelf.js): over the map by a plain click, as every page asked for from the play map
                else if (act === 'bring') n.bringPlayerHere(it.dataset.pid, pt.x, pt.y);
                else if (act === 'travel') n.toggleTravelLock();
                else if (act === 'pause') n.togglePause();
                else if (act === 'end') n.endSession();
                else if (act === 'leave') n.leaveSessionConfirm();
            });
        });
    }
    return { html: html, wire: wire };
}
// [systemcheck:gmfight-start]
// The GM's own rows on a character token's menu at a hosted table (the owner, 2026-10-04: "theres no way for me to target a player as an NPC
// and start combat, or join combat"): Target (the GM's one pointer, which an NPC's rolls read the range by and which ticks its token when a
// fight starts), Start combat with the tokens picked, and for a fight already running on this map Add to the fight / Remove from the fight.
// Fixed words only: nothing of a token is written into the menu.
function gmFightModel(map, items, sel) {   // sel (158): the one token the GM has selected, which can target the token under the pointer
    var n = window.wpNet; if (!n || !n.active || n.role !== 'host' || window.wpStream || !map || !Array.isArray(items)) return null;
    var toks = items.filter(function(w) { return !!(w && w.isChar && !w.waiting); }); if (!toks.length) return null;
    var ids = typeof n.fightsOn === 'function' ? n.fightsOn(map.id) : [], inIds = Object.create(null);   // fold 2: every fight on this map; a token is in one at most
    ids.forEach(function(f) { var c = n.combats[f]; if (c && Array.isArray(c.rows)) c.rows.forEach(function(r) { if (r && typeof r.tokId === 'string') inIds[r.tokId] = f; }); });
    var one = toks.length === 1 && items.length === 1 && !toks[0].hidden ? toks[0] : null, t = n.targets && n.myId ? n.targets[n.myId] : null;
    var as = one && sel && typeof sel === 'object' && sel.isChar && !sel.waiting && sel.id !== one.id && (map.whiteboard || []).indexOf(sel) >= 0 ? sel : null, ta = as && n.targets ? n.targets['tk:' + as.id] : null;   // 158: Target as the selected character
    var clears = one && n.targets && typeof n.clearTargetOf === 'function' ? Object.keys(n.targets).filter(function(k) { var p = n.targets[k]; return k !== n.myId && !!p && typeof p === 'object' && p.id === one.id && p.mapId === map.id; }).slice(0, 12).map(function(k) { return { pid: k, name: String(n.targets[k].name || 'Player').slice(0, 40) }; }) : [];   // 1.5.9: each pointer someone else holds at it, which the GM may clear
    return { toks: toks, running: ids.length > 0, fights: ids, add: toks.filter(function(w) { return typeof inIds[w.id] !== 'string' && !w.hidden; }), drop: toks.filter(function(w) { return typeof inIds[w.id] === 'string'; }), target: one, mine: !!(one && t && t.id === one.id && t.mapId === map.id), as: as, asMine: !!(as && ta && ta.id === one.id && ta.mapId === map.id), clears: clears };
}
function gmEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }   // 158: a character's name, the one word of a token this menu writes
function gmFightHtml(m) {
    if (!m) return '';
    var h = '';
    if (m.target && m.as) { var asN = gmEsc(String(m.as.charName || m.as.name || 'your character').slice(0, 40)); h += '<div class="menu-item cm-gm-fight" data-fight="targetas" title="' + (m.asMine ? 'Stop ' + asN + ' targeting it' : asN + ' targets it: its rolls read the range from its own token, and the facing rules know where the attack comes from') + '">' + (m.asMine ? '&#9711; ' + asN + ' stops targeting' : '&#9678; Target as ' + asN) + '</div>'; }
    if (m.target) h += '<div class="menu-item cm-gm-fight" data-fight="target" title="' + (m.mine ? 'Stop targeting it (Esc does too)' : 'Point at it as the GM: your NPCs&rsquo; rolls read the range to it, and it is ticked when you start a fight (T while pointing at a token does the same)') + '">' + (m.mine ? '&#9711; Clear target' : '&#9678; Target') + '</div>';
    if (m.target && Array.isArray(m.clears)) m.clears.forEach(function(c, i) { var cN = gmEsc(c.name); h += '<div class="menu-item cm-gm-fight" data-fight="clear:' + i + '" title="Take ' + cN + '&rsquo;s target pointer off this token. Everyone at the table sees it go">&#9711; Clear ' + cN + '&rsquo;s target</div>'; });   // 1.5.9: the row says the pointer by its place in the model, never by its key
    if (!m.running) h += '<div class="menu-item cm-gm-fight" data-fight="start" title="Open the roster with ' + (m.toks.length === 1 ? 'this token' : 'these tokens') + ' ticked, and whoever is targeted">&#9876; Start combat&hellip;</div>';
    else {
        var two = Array.isArray(m.fights) && m.fights.length > 1;
        if (m.add.length) h += '<div class="menu-item cm-gm-fight" data-fight="add" title="' + (two ? 'Into one of the fights running on this map: you pick which. It goes at the end of the order' : 'Into the fight running on this map, at the end of the order') + ' (its initiative is given or rolled in the roster)">&#9876; Add to the fight</div>';
        if (m.drop.length) h += '<div class="menu-item cm-gm-fight" data-fight="drop" title="Out of the fight it is in on this map">&#9876; Remove from the fight</div>';
        if (m.add.length) h += '<div class="menu-item cm-gm-fight" data-fight="new" title="Another fight on this map, with ' + (m.add.length === 1 ? 'this token' : 'these tokens') + ' ticked: its own order and rounds">&#9876; Start another fight&hellip;</div>';   // fold 2
    }
    return h;
}
function gmFightDo(map, m, act) {
    var n = window.wpNet; if (!m || !n || !map) return false;
    if (act === 'target') { if (!m.target || !n.setTarget) return false; n.setTarget(m.target.id, map.id, m.target.charName || m.target.name); return true; }
    if (act === 'targetas') { if (!m.target || !m.as || !n.setTargetAs) return false; return n.setTargetAs(m.as, m.target.id, map.id, m.target.charName || m.target.name) === true; }
    if (typeof act === 'string' && /^clear:\d{1,2}$/.test(act)) { var cl = Array.isArray(m.clears) ? m.clears[Number(act.slice(6))] : null; if (!cl || typeof n.clearTargetOf !== 'function') return false; return n.clearTargetOf(cl.pid) === true; }   // 1.5.9
    if (act === 'start') { if (m.running) return false; openCombatModal(map.id, { pre: m.toks.filter(function(w) { return !w.hidden; }).map(function(w) { return w.id; }) }); return true; }
    if (act === 'new') { if (!m.running || !m.add.length) return false; openCombatModal(map.id, { fresh: true, pre: m.add.map(function(w) { return w.id; }) }); return true; }   // fold 2: another fight beside the one on this map
    var ids = Array.isArray(m.fights) ? m.fights.filter(function(f) { return !!(n.combats && Object.prototype.hasOwnProperty.call(n.combats, f) && n.combats[f] && Array.isArray(n.combats[f].rows)); }) : []; if (!ids.length || (act !== 'add' && act !== 'drop')) return false;
    if (act === 'add') {
        if (!m.add.length) return false;
        if (ids.length === 1) return gmFightPut(n, map, ids[0], m.add, null);
        // two fights on this map: which one, asked with two answers (the one the strip shows, and the next)
        var sf = typeof window.wpStripFight === 'function' ? window.wpStripFight(map.id) : null, f1 = sf && ids.indexOf(sf.id) >= 0 ? sf.id : ids[0], f2 = ids[(ids.indexOf(f1) + 1) % ids.length];
        var said = function(f) { var c = n.combats[f], cur = c.rows[c.turn] || {}; return ('Round ' + c.round + ': ' + String(cur.name || 'someone').slice(0, 30) + ' is up').slice(0, 60); };
        showConfirm('Add to which fight on ' + ((map.meta && map.meta.title) || 'this map') + '? Each is named by its round and whose turn it is.' + (ids.length > 2 ? ' Its two answers are the fight the strip shows and the next one. Switch the strip to reach another.' : ''), function(ans) { if (ans === true) gmFightPut(n, map, f1, m.add, null); else if (ans === 'alt') gmFightPut(n, map, f2, m.add, null); }, { yes: said(f1), alt: said(f2), noEnter: true });   // fold 2's review: its buttons alone answer it, as neither fight is the safe answer (Cancel is)
        return true;
    }
    if (!m.drop.length) return false;
    var out = {}; m.drop.forEach(function(w) { out[w.id] = 1; });
    ids.forEach(function(f) { if (n.combats[f].rows.some(function(r) { return !!r && typeof r.tokId === 'string' && out[r.tokId] === 1; })) gmFightPut(n, map, f, null, out); });   // each fight that holds a token of the selection
    return true;
}
function gmFightPut(n, map, fid, add, out) {   // that fight with the tokens added at the end of its order, or those out taken out (its last row taken out ends it, asked first)
    var c = n.combats[fid]; if (!c || !Array.isArray(c.rows)) return false;
    var rows = c.rows.map(function(r) { var o = { id: r.id, name: r.name, tokId: r.tokId, init: r.init, src: r.src }; if (r.rolled === 1) o.rolled = 1; if (Array.isArray(r.tb)) o.tb = r.tb; if (r.held === 1) o.held = 1; return o; }), curId = (c.rows[c.turn] || {}).id;
    if (add) add.forEach(function(w) { rows.push({ id: 'r' + w.id, name: w.charName || w.name || 'Unnamed', tokId: w.id, init: 0, src: w.src || null }); });
    if (out) { rows = rows.filter(function(r) { return !(typeof r.tokId === 'string' && out[r.tokId] === 1); }); if (!rows.length) { n.fightEnd(fid); return true; } }
    var at = rows.findIndex(function(r) { return r.id === curId; });
    n.fightSet(fid, { mapId: map.id, round: c.round, turn: at >= 0 ? at : Math.min(c.turn, rows.length - 1), rows: rows });
    return true;
}
// 152 fold 4b: the Rules run switch on an NPC's token (the owner's answer 1, 2026-10-19: "a Rules run switch on each NPC, on by default", placed
// "somewhere easy to use quickly"), a tick row among the GM's own: on the menu of ONE character token that is shown, as Target is, on the machine that
// owns the campaign, hosted or not, since time rules run at both. Whether there is a switch, and which way it stands, is calendar.js's alone
// (window.wpCalendar.rulesRun: an NPC's, in a system with a time rule; never a player's character), and it is set there alone (setRulesRun). Never on a
// player's app, its link up or between attempts, nor in the stream window. Fixed words only: nothing of a token or a character is written into the menu
function gmRulesModel(items) {
    var n = window.wpNet, C = window.wpCalendar; if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client'))) || !C || typeof C.rulesRun !== 'function' || !Array.isArray(items) || items.length !== 1) return null;
    var w = items[0]; if (!w || typeof w !== 'object' || !w.isChar || w.waiting || w.hidden || typeof w.charId !== 'string' || !w.charId) return null;
    var on = C.rulesRun(w.charId); return on === true || on === false ? { charId: w.charId, on: on } : null;
}
function gmRulesHtml(m) { return m ? '<div class="menu-item cm-gm-rules" role="menuitemcheckbox" aria-checked="' + (m.on ? 'true' : 'false') + '" title="Ticked, this NPC&rsquo;s time rules run by themselves as time passes. Unticked, they do not. With the Calendar on, its runs wait unticked in the Calendar&rsquo;s list">' + (m.on ? '&#10003; ' : '') + '&#8987; Rules run</div>' : ''; }
function gmRulesDo(m) { var C = window.wpCalendar; return !!(m && C && typeof C.setRulesRun === 'function' && C.setRulesRun(m.charId, !m.on) === true); }   // the press: the switch the other way
// T while pointing at a token, for the GM at a hosted table: the same pointer as the menu's Target
function gmCanTarget(tok) { var n = window.wpNet; return !!(tok && tok.isChar && !tok.hidden && !tok.waiting && n && n.active && n.role === 'host' && !window.wpStream); }
function gmTarget(tok, mapId) { var n = window.wpNet; if (!gmCanTarget(tok) || !n.setTarget || typeof mapId !== 'string') return false; n.setTarget(tok.id, mapId, tok.charName || tok.name); return true; }
// [systemcheck:gmfight-end]
function tableRole() { var n = window.wpNet; if (!n) return 'offline'; if (n.active && n.role === 'host') return 'host'; if (n.active && n.role === 'client') return 'client'; return 'offline'; }
// Standing alone, on empty play-map space
function showSessionMenu(e, role) {
    var cMenu = document.getElementById('contextMenu'); if (!cMenu) return;
    var parts = tableMenuParts(e, role);
    cMenu.innerHTML = parts.html;
    cMenu.style.display = 'flex';
    placeMenu(cMenu, e);
    parts.wire(cMenu);
}
// Hanging under an item menu (a right-click on a background picture counts as the table)
function appendTableMenu(cMenu, e) {
    var parts = tableMenuParts(e, tableRole());
    cMenu.insertAdjacentHTML('beforeend', '<div class="menu-divider"></div>' + parts.html);
    parts.wire(cMenu);
}
document.addEventListener('contextmenu', function(e) {
    if (state.viewMode !== 'visual' && state.viewMode !== 'data') return;
    if (window.wpNet && window.wpNet.foreign && !(window.wpNet.active && window.wpNet.role === 'client')) return;   // the owed review, 2026-10-09: someone else's table on this screen with its link down, between two attempts to reconnect. The GM's menu is not theirs then either
    if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
        // players get no edit menu — except elevation / posture on their own token (the
        // same permission line as moving it); empty play-map space offers Leave Session
        if (state.viewMode === 'visual' && e.target.closest('#whiteboardWrap')) {
            var ownEl = e.target.closest('.wb-item');
            if (ownEl) {
                var amO = getActiveMap(), tokO = amO && (amO.whiteboard || []).find(function(x) { return x.id === ownEl.dataset.id; });
                if (tokO && tokO.waiting && tokO.ownerId === window.wpNet.myId) { e.preventDefault(); if (window.wpJoinCard) window.wpJoinCard.show(); }   // Onboarding F1a: their waiting token: where they stand
                else if (tokO && tokO.isChar && tokO.ownerId === window.wpNet.myId && !(window.wpNet.paused || window.wpNet.selfPaused) && (stanceOn('elevation') || stanceOn('posture') || (tokO.charId && window.wpSheets && window.wpSheets.canOpen(tokO.charId)) || ownLightHtml(tokO) || ownPicOk(tokO) || tokenSensesLine(tokO) || (window.wpSheets && window.wpSheets.tokenFxModel && window.wpSheets.tokenFxModel(tokO)))) { e.preventDefault(); showStanceMenu(e, tokO); }
                else if (tokO && canTarget(tokO)) { e.preventDefault(); showTargetMenu(e, tokO, amO.id); }   // the owner's ruling of 2026-10-01: another's token is targeted from here, never by a plain click
            } else { e.preventDefault(); showSessionMenu(e, 'client'); }
        }
        return;
    }
    
    var isCanvasOrWb = false;
    var targetId = null;
    var isWb = false;
    
    if (e.target.closest('#whiteboardWrap') && state.viewMode === 'visual') {
        isCanvasOrWb = true; isWb = true;
        var itemEl = e.target.closest('.wb-item');
        if (itemEl) targetId = itemEl.dataset.id;
        var wallM = targetId && window.wpWallPick ? window.wpWallPick(targetId, e.clientX, e.clientY) : null;   // a right-click near a wall's or a door's line is the wall's, as its press is (datamap.js wallPick)
        if (wallM) targetId = wallM;
    } else if (e.target.closest('#canvasWrap') && state.viewMode === 'data') {
        isCanvasOrWb = true; isWb = false;
        var itemEl = e.target.closest('.room');
        if (itemEl) targetId = itemEl.dataset.id;
    } else if (e.target.closest('#elementList')) {
        isCanvasOrWb = true;
        isWb = (state.viewMode === 'visual');
        var listEl = e.target.closest('.el-name');
        if (listEl) targetId = listEl.dataset.id;
    }
    
    if (isCanvasOrWb) {
        e.preventDefault();
        
        var selectedIds = [];
        if (isWb) {
            selectedIds = state.selWbIds || (state.selWbId ? [state.selWbId] : []);
            if (targetId && !selectedIds.includes(targetId)) selectedIds = [targetId];   // the menu acts on the item under the pointer without selecting it (no side panel)
        } else {
            selectedIds = state.selId ? [state.selId] : [];
            if (targetId && state.selId !== targetId) {
                selectedIds = [targetId]; state.selId = targetId;
                if(window.appRender) window.appRender();
            }
        }
        
        // Onboarding F1a: a player's waiting token opens that player's menu (Give a character, Hide, Remove), not the item menu
        if (isWb && targetId && window.wpPartyMenuFor) { var amWt = getActiveMap(), wWt = amWt && (amWt.whiteboard || []).find(function(x) { return x.id === targetId; }); if (wWt && wWt.waiting && typeof wWt.ownerId === 'string') { var cmWt = document.getElementById('contextMenu'); if (cmWt) cmWt.style.display = 'none'; window.wpPartyMenuFor('p:' + wWt.ownerId, e.clientX, e.clientY); return; } }
        var cMenu = document.getElementById('contextMenu');
        if (!cMenu) return;
        
        var am = getActiveMap();
        
        if (selectedIds.length === 0 || (isWb && !targetId)) {
            // The whiteboard background (nothing under the pointer): the table menu, whatever is selected
            if (isWb && window.wpNet && window.wpNet.active && window.wpNet.role === 'host') showSessionMenu(e, 'host');
            else if (isWb && window.wpNet && !window.wpNet.active) showSessionMenu(e, 'offline');   // between sessions: bring a player's token here
            else cMenu.style.display = 'none';
        } else {
            // Items selected
            var html = '';
            var firstItem = isWb ? am.whiteboard.find(x => x.id === selectedIds[0]) : am.rooms.find(x => x.id === selectedIds[0]);
            // one character token: its sheet (and HUD) first, where a GM looks for them (they sat far down the menu)
            var sheetTop = !!(isWb && selectedIds.length === 1 && firstItem && (firstItem.isChar || firstItem.charId) && window.wpSheets);
            if (sheetTop) { html += '<div class="menu-item cm-sheet">&#128203; ' + (firstItem.charId ? 'Sheet&hellip;' : 'New character sheet&hellip;') + '</div>'; if (firstItem.charId && window.wpSheets.hudFor && window.wpSheets.hudFor(firstItem.charId)) html += '<div class="menu-item cm-hud">&#12336; HUD&hellip;</div>'; }
            if (sheetTop && firstItem.charId && window.wpSheets.canDamage && window.wpSheets.canDamage(firstItem.charId)) html += '<div class="menu-item cm-dmg" title="Apply a blow to this character: its DR first, then its wounds, and the wear on what it wears">&#9876; Take damage&hellip;</div>';   // 1.5.6, the damage step
            var selNow = state.selWbIds && state.selWbIds.length ? state.selWbIds : (state.selWbId ? [state.selWbId] : []), selAs = isWb && selNow.length === 1 ? am.whiteboard.find(function(x) { return x.id === selNow[0]; }) : null;   // 158: the one token selected, which may target the token under the pointer
            var gmF = isWb ? gmFightModel(am, selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean), selAs) : null; html += gmFightHtml(gmF);   // the GM's own Target, Start combat, Add to the fight
            var gmR = isWb ? gmRulesModel(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean)) : null; html += gmRulesHtml(gmR);   // 152 fold 4b: an NPC's Rules run switch
            if (sheetTop && firstItem.charId && window.wpTrade && window.wpTrade.canAsk) { var trQ = window.wpTrade.canAsk(firstItem, am, selAs); if (trQ) html += '<div class="menu-item cm-trade" title="Open a barter window: each side puts items and money on the table, and both confirm">&#8644; ' + esc(trQ.label) + '</div>'; }   // 1.5.6 trading: as the one NPC selected
            
            if (isWb) {
                if (selectedIds.length > 1) {
                    var isGrouped = firstItem ? firstItem.groupId : undefined;
                    var allSameGroup = isGrouped && selectedIds.every(id => {
                        var it = am.whiteboard.find(x=>x.id===id);
                        return it && it.groupId === isGrouped;
                    });
                    if (allSameGroup) html += '<div class="menu-item cm-ungroup">Ungroup</div>';
                    else html += '<div class="menu-item cm-group">Group</div>';
                } else if (firstItem && firstItem.groupId) {
                    html += '<div class="menu-item cm-ungroup">Ungroup</div>';
                }
                
                // Check if merge drawings is possible (all selected are open pen strokes — never a freeform fill region)
                var allPaths = selectedIds.length > 1 && selectedIds.every(id => {
                    var it = am.whiteboard.find(x=>x.id===id);
                    return it && it.type === 'path' && it.tip !== 'fill';
                });
                if (allPaths) {
                    html += '<div class="menu-item cm-merge">Merge Drawings</div>';
                }
                if (selectedIds.length > 1) {
                    html += '<div class="menu-item cm-align-row" style="display:flex; align-items:center; gap:3px; cursor:default;">' +
                        '<span style="font-size:11px; color:var(--dim); margin-right:2px;">Align</span>' +
                        '<button class="align-btn" data-al="left" title="Align left edges">&#8676;</button>' +
                        '<button class="align-btn" data-al="ch" title="Align horizontal centers">&#8596;</button>' +
                        '<button class="align-btn" data-al="right" title="Align right edges">&#8677;</button>' +
                        '<button class="align-btn" data-al="top" title="Align top edges">&#8613;</button>' +
                        '<button class="align-btn" data-al="cv" title="Align vertical centers">&#8597;</button>' +
                        '<button class="align-btn" data-al="bottom" title="Align bottom edges">&#8615;</button>' +
                        (selectedIds.length > 2 ?
                        '<span style="font-size:11px; color:var(--dim); margin:0 2px 0 6px;">Space</span>' +
                        '<button class="align-btn" data-al="dh" title="Distribute evenly, horizontally">&#8644;</button>' +
                        '<button class="align-btn" data-al="dv" title="Distribute evenly, vertically">&#8645;</button>' : '') +
                        '</div>';
                }
                if (html !== '') html += '<div class="menu-divider"></div>';
            }
            
            if (isWb) {
                var anyUnlocked = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.locked;
                });
                // the piece's own lock, worded as what it does; the padlock shows how the piece stands, as the toolbar's does (a door's lock for players is a row of its own: doorRows)
                html += '<div class="menu-item cm-lock" title="' + (anyUnlocked ? 'It stays where it is: no drag and no resize until you unlock it, and a player&rsquo;s token is frozen for its player too. On a door this is not the lock of the door itself.' : 'It can be dragged and resized again.') + '">' + (anyUnlocked ? '&#128275; Lock in place' : '&#128274; Unlock (free to move)') + '</div>';
                var anyVisible = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.hidden;
                });
                html += '<div class="menu-item cm-vis">' + (anyVisible ? '&#128441; Hide from Players' : '&#128065; Show to Players') + '</div>';
                var anyUnderGrid = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.aboveGrid;
                });
                html += '<div class="menu-item cm-grid">' + (anyUnderGrid ? '&#9650; Show Above Grid' : '&#9660; Put Under Grid') + '</div>';
                var mnRow = mineRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.5.8 explosives: a placed mine set off by hand
                if (mnRow) html += mnRow.html;
                var ppRow = pagePinRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.5.4: a pin's row, where the one piece selected opens a page
                if (ppRow) html += ppRow.html;
                var drRow = doorRows(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // a door's own rows: open or close it, lock it for players
                if (drRow) html += drRow.html;
                var scRow = secretRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // the map builder: a secret door's row, Reveal or Make
                if (scRow) html += scRow.html;
                var plRow = portalLockRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am);   // a portal's own lock: the GM's row, only where the selection holds a portal
                if (plRow) html += plRow.html;
                var fhRow = fogHandRows(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // 1.5.4: a piece's fog mark, only where the selection holds a piece that may carry one
                if (fhRow) html += fhRow.html;
                html += '<div class="menu-divider"></div>';
                var wlRow = wallsRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));   // the map builder: walls around the selected floors, a group of its own
                if (wlRow) html += wlRow.html + '<div class="menu-divider"></div>';
            }
            html += '<div class="menu-item cm-front">Bring to Front</div>';
            html += '<div class="menu-item cm-fwd">Bring Forward</div>';
            html += '<div class="menu-item cm-bwd">Send Backward</div>';
            html += '<div class="menu-item cm-back">Send to Back</div>';

            if (isWb) {
                var curOp = Math.round(((firstItem && firstItem.opacity != null) ? firstItem.opacity : 1) * 100);
                html += '<div class="menu-divider"></div>';
                html += '<div class="menu-item cm-opacity" style="display:flex; align-items:center; gap:6px; cursor:default;">Opacity <input type="range" id="cmOpacitySlider" min="10" max="100" value="' + curOp + '" style="flex:1; min-width:80px;"> <span id="cmOpacityVal" style="min-width:34px; text-align:right;">' + curOp + '%</span></div>';
            }

            html += '<div class="menu-divider"></div>';
            if (isWb && firstItem && firstItem.isChar) {
                html += '<div class="menu-divider"></div>';
                html += '<div class="menu-item cm-status-alive">&#9825; Alive</div>';
                html += '<div class="menu-item cm-status-down">&#10006; Incapacitated</div>';
                html += '<div class="menu-item cm-status-dead">&#9760; Dead</div>';
                html += stanceMenuHtml(firstItem);
                html += tokenSensesLine(firstItem);   // senses S3: its senses, read-only
            }
            if (!sheetTop) {   // several pieces selected: where the two rows always stood (one character token lists them first, above)
            if (isWb && firstItem && (firstItem.isChar || firstItem.charId) && window.wpSheets) html += '<div class="menu-item cm-sheet">&#128203; ' + (firstItem.charId ? 'Sheet&hellip;' : 'New character sheet&hellip;') + '</div>';
            if (isWb && firstItem && firstItem.charId && window.wpSheets && window.wpSheets.hudFor && window.wpSheets.hudFor(firstItem.charId)) html += '<div class="menu-item cm-hud">&#12336; HUD&hellip;</div>';   // HUD frame (HF2b)
            }
            if (isWb && firstItem && selectedIds.length === 1 && window.wpSheets && window.wpSheets.tokenFxModel && window.wpSheets.tokenFxModel(firstItem)) html += '<div class="menu-item cm-effects">&#10022; Effects&hellip;</div>';   // conditions C2
            if (isWb && firstItem && firstItem.isChar && !firstItem.waiting && firstItem.type === 'image' && firstItem.src && window.wpFrame && window.wpSheets && window.wpSheets.applyTokenFrame) html += '<div class="menu-item cm-frame-pic">&#128444;&#65039; Frame picture&hellip;</div>';   // the token creator: the selected tokens (a character's change together)
            var gmLit = isWb ? gmLightToggle(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); })) : null;   // lighting L5: the selected lights, switched together
            if (gmLit) html += '<div class="menu-item cm-light">&#128161; ' + (gmLit.anyOn ? 'Light off' : 'Light on') + '</div>';
            if (isWb && firstItem && firstItem.isChar && firstItem.ownerId && window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.isConnected && window.wpNet.isConnected(firstItem.ownerId)) {
                var pausedTok = window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(firstItem.ownerId);
                html += '<div class="menu-item cm-player-pause">' + (pausedTok ? '&#9654;&#65039; Resume this player' : '&#9208;&#65039; Pause this player') + '</div>';
            }
            if (isWb && firstItem && firstItem.id && !firstItem.hidden && window.wpFx && window.wpVtt && window.wpVtt.on('fx')) html += '<div class="menu-item cm-pulse">✨ Pulse</div>';
            html += '<div class="menu-item cm-dup">&#10697; Duplicate</div>';
            if (isWb && firstItem && (firstItem.isChar || firstItem.charName)) html += '<div class="menu-item cm-cast-save">&#9733; Save to Campaign Cast</div>';
            html += '<div class="menu-item cm-del" style="color:var(--danger)">Delete</div>';

            cMenu.innerHTML = html;
            cMenu.style.display = 'flex';
            placeMenu(cMenu, e);
            Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-gm-fight'), function(rw) { rw.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; gmFightDo(am, gmF, rw.dataset.fight); }); });
            Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-gm-rules'), function(rw) { rw.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; gmRulesDo(gmR); }); });   // 152 fold 4b

            // Elevation / posture rows (character tokens, when the toggles are on)
            if (isWb) wireStanceMenu(cMenu, selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), function() { save(); render(); });

            // Opacity slider: live preview on input, persist on release; the
            // row never closes the menu (guarded in the click handler below).
            var opSlider = document.getElementById('cmOpacitySlider');
            if (opSlider) {
                opSlider.addEventListener('click', function(oe) { oe.stopPropagation(); });
                opSlider.addEventListener('input', function() {
                    var v = parseInt(this.value, 10) / 100;
                    var lbl = document.getElementById('cmOpacityVal');
                    if (lbl) lbl.textContent = Math.round(v * 100) + '%';
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (!it) return;
                        if (v >= 1) delete it.opacity; else it.opacity = v;
                        var elp = document.querySelector('.wb-item[data-id="' + sid + '"]');
                        if (elp) elp.style.opacity = v < 1 ? v : '';
                    });
                });
                opSlider.addEventListener('change', function() {
                    save();
                    if (window.appRender) window.appRender();
                });
            }

            // Align / distribute buttons act on the unlocked items in the selection
            cMenu.querySelectorAll('.align-btn').forEach(function(ab) {
                ab.addEventListener('click', function(ae) {
                    ae.stopPropagation();
                    var mode = this.dataset.al;
                    var its = selectedIds.map(function(sid) {
                        return am.whiteboard.find(function(x) { return x.id === sid; });
                    }).filter(function(it) { return it && !it.locked; });
                    if (its.length < 2) return;
                    var minX = Math.min.apply(null, its.map(function(i) { return i.x; }));
                    var maxR = Math.max.apply(null, its.map(function(i) { return i.x + i.w; }));
                    var minY = Math.min.apply(null, its.map(function(i) { return i.y; }));
                    var maxB = Math.max.apply(null, its.map(function(i) { return i.y + i.h; }));
                    if (mode === 'left') its.forEach(function(i) { i.x = minX; });
                    else if (mode === 'right') its.forEach(function(i) { i.x = maxR - i.w; });
                    else if (mode === 'ch') { var cx = (minX + maxR) / 2; its.forEach(function(i) { i.x = cx - i.w / 2; }); }
                    else if (mode === 'top') its.forEach(function(i) { i.y = minY; });
                    else if (mode === 'bottom') its.forEach(function(i) { i.y = maxB - i.h; });
                    else if (mode === 'cv') { var cy = (minY + maxB) / 2; its.forEach(function(i) { i.y = cy - i.h / 2; }); }
                    else if (mode === 'dh' || mode === 'dv') {
                        var ax = mode === 'dh' ? 'x' : 'y', dim = mode === 'dh' ? 'w' : 'h';
                        var sorted = its.slice().sort(function(a, b) { return (a[ax] + a[dim] / 2) - (b[ax] + b[dim] / 2); });
                        var first = sorted[0][ax] + sorted[0][dim] / 2;
                        var last = sorted[sorted.length - 1][ax] + sorted[sorted.length - 1][dim] / 2;
                        var stepGap = (last - first) / (sorted.length - 1);
                        sorted.forEach(function(i, idx) { i[ax] = first + stepGap * idx - i[dim] / 2; });
                    }
                    save();
                    if (window.appRender) window.appRender();
                });
            });
        }

        cMenu.onclick = function(ce) {
            var action = ce.target.className;

            if (typeof action === 'string' && (action.includes('cm-opacity') || action.includes('cm-align-row') || action.includes('align-btn') || action.includes('cm-stance'))) return; // control rows keep the menu open
            if (typeof action === 'string' && isWb && action.includes('cm-effects')) { var itFx = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; }); if (itFx) setTimeout(function() { showTokenFxMenu(itFx); }, 0); return; }   // conditions C2: the menu becomes its Effects list, once this click is done (swapped now, the clicked line would be gone from the menu and the page would read it as a click outside)

            if (isWb) {
                if (action.includes('cm-group')) {
                    var gid = 'group_' + Date.now();
                    selectedIds.forEach(id => { var it = am.whiteboard.find(x => x.id === id); if(it) it.groupId = gid; });
                    import('./io.js').then(m=>m.toast('Grouped.'));
                } else if (action.includes('cm-ungroup')) {
                    var gid = firstItem ? firstItem.groupId : null;
                    if (gid) am.whiteboard.forEach(x => { if (x.groupId === gid) delete x.groupId; });
                    else selectedIds.forEach(id => { var it = am.whiteboard.find(x => x.id === id); if(it) delete it.groupId; });
                    import('./io.js').then(m=>m.toast('Ungrouped.'));
                } else if (action.includes('cm-merge')) {
                    var newPts = [];
                    var minX=Infinity, minY=Infinity;
                    selectedIds.forEach(id => {
                        var it = am.whiteboard.find(x => x.id === id);
                        if (it && it.pts) {
                            var cx = it.x, cy = it.y, msx = it.w / (it.baseW || it.w || 1), msy = it.h / (it.baseH || it.h || 1);   // a resized line's points are read at their place on the map
                            if (!(msx > 0) || !isFinite(msx)) msx = 1; if (!(msy > 0) || !isFinite(msy)) msy = 1;
                            it.pts.forEach(p => { 
                                var px = p[0] * msx + cx; var py = p[1] * msy + cy;
                                newPts.push([px, py]);
                                if (px < minX) minX = px;
                                if (py < minY) minY = py;
                            });
                        }
                    });
                    if (newPts.length > 0) {
                        var maxX = -Infinity, maxY = -Infinity;
                        newPts.forEach(p => {
                            p[0] -= minX;
                            p[1] -= minY;
                            if (p[0] > maxX) maxX = p[0];
                            if (p[1] > maxY) maxY = p[1];
                        });
                        var w = Math.max(10, maxX);
                        var h = Math.max(10, maxY);
                        var uid_str = 'wb'+Date.now();
                        am.whiteboard.push({ id: uid_str, type: 'path', x: minX, y: minY, w: w, h: h, baseW: w, baseH: h, z: 30, pts: newPts, layer:'middle' });
                        am.whiteboard = am.whiteboard.filter(x => !selectedIds.includes(x.id));
                        state.selWbIds = [uid_str];
                        state.selWbId = uid_str;
                        import('./io.js').then(m=>m.toast('Drawings merged.'));
                    }
                } else if (action.includes('cm-vis')) {
                    var hideThem = selectedIds.some(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        return it && !it.hidden;
                    });
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (it) it.hidden = hideThem;
                    });
                    import('./io.js').then(m => m.toast(hideThem ? 'Hidden from players.' : 'Visible to players.'));
                } else if (action.includes('cm-status-')) {
                    var stNew = action.includes('cm-status-dead') ? 'dead' : action.includes('cm-status-down') ? 'down' : '';
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (it && it.isChar) { if (stNew) it.status = stNew; else delete it.status; }
                    });
                    import('./io.js').then(m => m.toast(stNew === 'dead' ? 'Marked dead.' : stNew === 'down' ? 'Marked incapacitated.' : 'Back on their feet.'));
                } else if (action.includes('cm-pulse')) {
                    var itPu = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    if (itPu && window.wpFx) window.wpFx.play({ kind: 'pulse', mapId: am.id, tok: itPu.id });
                    return;
                } else if (action.includes('cm-frame-pic')) {   // the token creator, the GM's side
                    cMenu.style.display = 'none';
                    frameGmPicture(am, selectedIds.slice());
                    return;
                } else if (action.includes('cm-trade')) {   // 1.5.6 trading
                    var itTr = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; }), qTr = itTr && window.wpTrade && window.wpTrade.canAsk ? window.wpTrade.canAsk(itTr, am, selAs) : null;
                    cMenu.style.display = 'none';
                    if (qTr) window.wpTrade.ask(qTr.from, qTr.to);
                    return;
                } else if (action.includes('cm-dmg')) {   // 1.5.6, the damage step
                    var itDm = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    cMenu.style.display = 'none';
                    if (itDm && itDm.charId && window.wpSheets && window.wpSheets.takeDamage) window.wpSheets.takeDamage(itDm.charId);
                    return;
                } else if (action.includes('cm-sheet')) {
                    var itS = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    if (itS && window.wpSheets) { if (!itS.charId) window.wpSheets.newFromToken(itS); if (itS.charId) window.wpSheets.openSheet(itS.charId); }
                    cMenu.style.display = 'none';   // the sheet is open: the menu goes (it used to stay until the next click)
                    return;
                } else if (action.includes('cm-hud')) {   // HUD frame (HF2b)
                    var itH = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    cMenu.style.display = 'none';
                    if (itH && itH.charId && window.wpSheets && window.wpSheets.openHud) window.wpSheets.openHud(itH.charId);
                    return;
                } else if (action.includes('cm-player-pause')) {
                    var itPP = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    if (itPP && itPP.ownerId && window.wpNet.pausePlayer) window.wpNet.pausePlayer(itPP.ownerId, !(window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(itPP.ownerId)));
                    return;
                } else if (action.includes('cm-cast-save')) {
                    castSave(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;
                } else if (action.includes('cm-dup')) {
                    duplicateWbItems(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;   // saved + rendered inside
                } else if (action.includes('cm-fog-hide') || action.includes('cm-fog-show')) {   // a piece's fog mark (saved and drawn again below, so the table gets it at once)
                    var wentFH = fogHandSet(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), action.includes('cm-fog-hide') ? 'hide' : 'show');
                    if (wentFH) { if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } var noteFH = wentFH !== 'off' && window.wpFog && typeof window.wpFog.handNote === 'function' ? window.wpFog.handNote(am) : ''; toast((wentFH === 'hide' ? 'Under fog: players see nothing under it.' : wentFH === 'show' ? 'Always revealed: players always see what is under it.' : 'Fog mark taken off.') + (noteFH ? ' ' + noteFH : '')); }
                } else if (action.includes('cm-door-open') || action.includes('cm-door-lock')) {   // a door's own rows (saved and drawn again below): an open door lets sight through, so the fog works its vision out again
                    var wentD = doorRowsDo(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), action.includes('cm-door-open') ? 'open' : 'lock');
                    if (wentD) { if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } toast(wentD === 'opened' ? 'Door opened.' : wentD === 'closed' ? 'Door closed.' : wentD === 'locked' ? 'Door locked for players.' : 'Door unlocked for players.'); }
                    if (wentD === 'opened') { var tallyD = { hid: 0 }, saidD = secretOpenedWords(secretOpened(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), tallyD), tallyD.hid); if (saidD) toast(saidD); }   // a secret door that is opened is found: an open door cannot be secret
                } else if (action.includes('cm-secret-show') || action.includes('cm-secret-make')) {   // the map builder: a secret door revealed, or a door made secret (saved and drawn again below, so the table gets it at once)
                    var wentS = secretRowDo(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (wentS) { if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } toast(wentS === 'shown' ? 'Secret door revealed. Your players see it as a door now.' : 'Secret door. Your players see wall here until it is found.'); }
                } else if (action.includes('cm-open-page')) {   // 1.5.4 (pageshelf.js): a pin's page, opened by the one rule (over the map by a plain click)
                    var ppDo = pagePinRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (ppDo && window.wpPageShelf) window.wpPageShelf.open(ppDo.id, window.wpPageShelf.wayNow(ce));
                } else if (action.includes('cm-mine-off')) {   // 1.5.8 explosives: each selected mine goes off at its centre (it saves and draws itself)
                    var mnDo = mineRow(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (mnDo) mnDo.items.forEach(function(z) { mineOff(am, z, null); });
                } else if (action.includes('cm-portal-lock')) {   // a portal's own lock: the selected portals locked or unlocked together (saved and drawn again below, so the table gets it at once)
                    var wentPL = portalLockSet(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), am);
                    if (wentPL) toast(wentPL === 'locked' ? 'Portal locked for players.' : 'Portal unlocked.');
                } else if (action.includes('cm-lock')) {
                    var lockThem = selectedIds.some(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        return it && !it.locked;
                    });
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (it) it.locked = lockThem;
                    });
                    import('./io.js').then(m => m.toast(lockThem ? 'Locked in place.' : 'Unlocked: free to move.'));
                } else if (action.includes('cm-walls')) {   // the map builder: wall lines around the selected floors (saved and drawn again below: ONE save, so one Undo takes them all back)
                    var saidW = wallsLay(am, selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (saidW) toast(saidW);
                    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
                } else if (action.includes('cm-light')) {
                    var gmLitNow = gmLightToggle(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }));
                    if (gmLitNow) { var wentL = gmLitNow.apply(); if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); } import('./io.js').then(m => m.toast(wentL === 'off' ? 'Light off.' : 'Light on.')); }
                } else if (action.includes('cm-grid')) {
                    var liftThem = selectedIds.some(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        return it && !it.aboveGrid;
                    });
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (!it) return;
                        if (liftThem) it.aboveGrid = true; else delete it.aboveGrid;
                    });
                    import('./io.js').then(m => m.toast(liftThem ? 'Rendering above the grid.' : 'Back under the grid.'));
                } else if (action.includes('cm-del')) {
                    am.whiteboard.forEach(x => { if (selectedIds.includes(x.id) && x.waiting && window.wpNet && window.wpNet.noWaiting) window.wpNet.noWaiting(x.ownerId); });   // Onboarding F1a: a deleted waiting token stays away this session
                    am.whiteboard = am.whiteboard.filter(x => !selectedIds.includes(x.id));
                    state.selWbIds = []; state.selWbId = null;
                } else {
                    var layers = ['back', 'back-mid', 'middle', 'front-mid', 'front'];
                    selectedIds.forEach(id => {
                        var it = am.whiteboard.find(x => x.id === id);
                        if (!it) return;
                        var curIdx = layers.indexOf(it.layer || 'middle');
                        if (action.includes('cm-front')) it.layer = 'front';
                        else if (action.includes('cm-fwd')) it.layer = layers[Math.min(layers.length - 1, curIdx + 1)];
                        else if (action.includes('cm-bwd')) it.layer = layers[Math.max(0, curIdx - 1)];
                        else if (action.includes('cm-back')) it.layer = 'back';
                    });
                }
            } else {
                if (action.includes('cm-del')) {
                    am.rooms = am.rooms.filter(x => !selectedIds.includes(x.id));
                    state.selId = null;
                } else {
                    var layers = ['back', 'back-mid', 'middle', 'front-mid', 'front'];
                    selectedIds.forEach(id => {
                        var it = am.rooms.find(x => x.id === id);
                        if (!it) return;
                        var curIdx = layers.indexOf(it.layer || 'middle');
                        if (action.includes('cm-front')) it.layer = 'front';
                        else if (action.includes('cm-fwd')) it.layer = layers[Math.min(layers.length - 1, curIdx + 1)];
                        else if (action.includes('cm-bwd')) it.layer = layers[Math.max(0, curIdx - 1)];
                        else if (action.includes('cm-back')) it.layer = 'back';
                    });
                }
            }
            cMenu.style.display = 'none';
            if(window.appRender) { save(); window.appRender(); }
        };
    }
});

document.addEventListener('click', function(e) {
    var cMenu = document.getElementById('contextMenu');
    if (cMenu && cMenu.style.display === 'flex' && !e.target.closest('#contextMenu')) {
        cMenu.style.display = 'none';
    }
});






